// js/cmd/chat/tools.js
// 工具列表獲取與搜尋

const axios = require('axios');
const consol = require('../../tool/log');
const { MCPO_BASE } = require('./mcpo');

// ============ 獲取工具列表的函數 ============
/**
 * @param {object} model - LLM server 設定物件 (含 ip, apikey 等)
 */
async function getAvailableTools(model) {
    const seenIds = new Set();
    const allToolIds = [];

    // --- 1. 從 Open WebUI /api/v1/tools/ 獲取已登錄的工具 ---
    try {
        const baseUrl = model.ip.replace('/api/chat/completions', '').replace('/api/chat', '');
        const toolsUrl = `http://${baseUrl}/api/v1/tools/`;

        consol.info(`[工具] 正在從 ${toolsUrl} 獲取工具列表`);

        const response = await axios.get(toolsUrl, {
            headers: {
                "Authorization": model.apikey,
                "Content-Type": "application/json"
            },
            timeout: 10000
        });

        let tools = [];
        if (Array.isArray(response.data)) {
            tools = response.data;
        } else if (response.data && response.data.data && Array.isArray(response.data.data)) {
            tools = response.data.data;
        } else if (response.data && response.data.tools && Array.isArray(response.data.tools)) {
            tools = response.data.tools;
        } else {
            consol.warn(`[工具] 未知的響應格式: ${JSON.stringify(response.data).substring(0, 200)}`);
        }

        consol.success(`[工具] Open WebUI API 返回 ${tools.length} 個工具`);

        tools.forEach(tool => {
            const toolId = tool.id || tool.tool_id || '';
            if (!toolId) return;
            if (seenIds.has(toolId)) {
                consol.warn(`[工具] 跳過重複工具: ${toolId}`);
                return;
            }
            seenIds.add(toolId);
            allToolIds.push(toolId);
            const toolName = tool.name || tool.meta?.name || toolId;
            consol.info(`  - ${toolName}: ${toolId}`);
        });

    } catch (err) {
        consol.warn(`[工具] Open WebUI 工具列表獲取失敗: ${err.message}`);
    }

    // --- 2. 從 MCPO 頂層 openapi.json 發現所有 server，補入缺少的工具 ---
    try {
        consol.info(`[工具] 正在從 MCPO ${MCPO_BASE}/openapi.json 發現所有 server`);
        const rootResp = await axios.get(`${MCPO_BASE}/openapi.json`, { timeout: 5000 });
        const paths = rootResp.data.paths || {};

        const mcpoServers = [...new Set(
            Object.keys(paths)
                .map(p => p.split('/')[1])
                .filter(v => v)
        )];

        consol.info(`[工具] MCPO 發現 ${mcpoServers.length} 個 server: ${mcpoServers.join(', ')}`);

        for (const srv of mcpoServers) {
            const toolId = `server:${srv}`;
            if (!seenIds.has(toolId)) {
                seenIds.add(toolId);
                allToolIds.push(toolId);
                consol.info(`  + 從 MCPO 補入工具: ${toolId}`);
            }
        }
    } catch (err) {
        consol.warn(`[工具] MCPO 頂層查詢失敗 (${err.message})，改用已知 server 列表補入`);
        const knownServers = [
            'memory', 'fetch', 'time', 'taiwan_time', 'get_time',
            'calculator', 'ffmpeg', 'web_search',
            'filesystem', 'daily_life', 'web_search_deeply'
        ];

        for (const srv of knownServers) {
            const toolId = `server:${srv}`;
            if (!seenIds.has(toolId)) {
                try {
                    await axios.get(`${MCPO_BASE}/${srv}/openapi.json`, { timeout: 3000 });
                    seenIds.add(toolId);
                    allToolIds.push(toolId);
                    consol.info(`  + 探測存活補入: ${toolId}`);
                } catch (probeErr) {
                    consol.warn(`  - server ${srv} 無法連線，跳過`);
                }
            }
        }
    }

    consol.success(`[工具] 去重後共找到 ${allToolIds.length} 個唯一工具（過濾前）`);

    const filteredIds = allToolIds.filter(id => id !== 'server:skill' && id !== 'server:skill_executor');
    if (filteredIds.length < allToolIds.length) {
        consol.info(`[工具] 已移除 skill 相關 server（skill 不經過 tool_ids，改用 tools 參數定義）`);
    }

    consol.success(`[工具] 最終工具列表共 ${filteredIds.length} 個: ${filteredIds.join(', ')}`);
    return filteredIds;
}

// ============ 搜尋特定工具 ============
/**
 * @param {string} keyword
 * @param {object} model - LLM server 設定物件 (含 ip, apikey 等)
 */
async function findTools(keyword, model) {
    try {
        const baseUrl = model.ip.replace('/api/chat/completions', '').replace('/api/chat', '');
        const toolsUrl = `http://${baseUrl}/api/v1/tools/`;

        consol.info(`[工具搜尋] 正在搜尋關鍵字: ${keyword}`);

        const response = await axios.get(toolsUrl, {
            headers: {
                "Authorization": model.apikey,
                "Content-Type": "application/json"
            },
            timeout: 10000
        });

        let tools = [];
        if (Array.isArray(response.data)) {
            tools = response.data;
        } else if (response.data && response.data.data) {
            tools = response.data.data;
        } else if (response.data && response.data.tools) {
            tools = response.data.tools;
        }

        const filtered = tools.filter(tool => {
            if (!tool || typeof tool !== 'object') return false;
            const name = (tool.name || tool.meta?.name || '').toLowerCase();
            const desc = (tool.description || tool.meta?.description || '').toLowerCase();
            const id = (tool.id || tool.tool_id || '').toLowerCase();
            const searchTerm = keyword.toLowerCase();

            return name.includes(searchTerm) ||
                   desc.includes(searchTerm) ||
                   id.includes(searchTerm);
        });

        consol.success(`[工具搜尋] 找到 ${filtered.length} 個匹配的工具`);

        return filtered.map(tool => ({
            id: tool.id || tool.tool_id,
            name: tool.name || tool.meta?.name || '未命名',
            description: (tool.description || tool.meta?.description || '無描述').substring(0, 100)
        }));

    } catch (err) {
        consol.error(`[工具搜尋] 失敗: ${err.message}`);
        if (err.response) {
            consol.error(`[工具搜尋] API 錯誤: ${JSON.stringify(err.response.data).substring(0, 300)}`);
        }
        return [];
    }
}

module.exports = {
    getAvailableTools,
    findTools
};
