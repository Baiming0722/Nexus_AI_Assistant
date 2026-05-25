// js/cmd/chat/toolExec.js
// 執行單個工具呼叫 (透過 MCPO port 7861)

const axios = require('axios');
const consol = require('../../tool/log');
const mcpo = require('./mcpo');

async function executeToolCall(toolCall) {
    try {
        const toolName = toolCall.function.name;
        let toolArgs;
        try {
            toolArgs = typeof toolCall.function.arguments === 'string'
                ? JSON.parse(toolCall.function.arguments)
                : toolCall.function.arguments || {};
        } catch (parseErr) {
            consol.warn(`[工具執行] 參數 JSON 解析失敗，使用空物件: ${parseErr.message}`);
            toolArgs = {};
        }

        consol.info(`[工具執行] 正在執行: ${toolName}`);
        consol.info(`[工具執行] 參數: ${JSON.stringify(toolArgs)}`);

        // ── 自動參數修復邏輯 ──
        // 解決模型偶爾會將本應是陣列或物件的參數誤傳為字串化的 JSON，或是在 JSON 字串尾端多加了錯誤括號的問題
        const autoFix = (obj) => {
            if (!obj || typeof obj !== 'object') return;
            for (const key in obj) {
                if (typeof obj[key] === 'string') {
                    let s = obj[key].trim();
                    // 若看起來像 JSON 陣列或物件
                    if ((s.startsWith('[') && (s.endsWith(']') || s.includes(']'))) ||
                        (s.startsWith('{') && (s.endsWith('}') || s.includes('}')))) {
                        try {
                            // 嘗試原始解析
                            obj[key] = JSON.parse(s);
                        } catch (e) {
                            // 嘗試修復常見的尾端多餘括號（例如 ]} 變成 ]）
                            try {
                                const fixed = s.replace(/\]\s*\}*$/, ']').replace(/\}\s*\}*$/, '}');
                                obj[key] = JSON.parse(fixed);
                                consol.info(`[工具執行] 已自動修復欄位 "${key}" 的 JSON 格式`);
                            } catch (e2) { /* 解析失敗則維持原樣 */ }
                        }
                    }
                }
                if (typeof obj[key] === 'object' && obj[key] !== null) autoFix(obj[key]);
            }
        };
        const originalArgsStr = JSON.stringify(toolArgs);
        autoFix(toolArgs);
        if (JSON.stringify(toolArgs) !== originalArgsStr) {
            consol.info(`[工具執行] 偵測到參數格式異常並已自動修復`);
            consol.info(`[工具執行] 修復後參數: ${JSON.stringify(toolArgs)}`);
        }

        // 確保映射表已建立
        const toolMap = await mcpo.buildMcpoToolMap();

        let mcpoUrl = null;
        let httpMethod = 'POST';

        // Skill 相關工具已由 chat() 的 runSkillCmd() 直接執行，不走 MCPO

        if (!mcpoUrl && toolMap[toolName]) {
            // 從映射表找到正確的 MCPO 端點（別名路由優先，不覆蓋）
            const { server, endpoint, method } = toolMap[toolName];
            mcpoUrl = `${mcpo.MCPO_BASE}/${server}${endpoint}`;
            httpMethod = method;
            consol.info(`[工具執行] 映射到 MCPO: ${httpMethod} ${mcpoUrl}`);
        } else if (!mcpoUrl) {
            // 點號命名（如 cmd.memoryadd）→ OpenWebUI 內建函數，由 OpenWebUI 自行執行，不走 MCPO
            if (toolName.includes('.')) {
                consol.info(`[工具執行] "${toolName}" 為 OpenWebUI 內建函數，跳過 MCPO`);
                return `（OpenWebUI 內建函數 ${toolName} 已由平台處理）`;
            }

            // Fallback: 從函數名推導，並逐一探測已知 server
            let fnName = toolName;
            if (fnName.startsWith('tool_')) fnName = fnName.slice(5);
            if (fnName.endsWith('_post')) { fnName = fnName.slice(0, -5); httpMethod = 'POST'; }
            else if (fnName.endsWith('_get')) { fnName = fnName.slice(0, -4); httpMethod = 'GET'; }

            consol.warn(`[工具執行] 映射表中找不到 "${toolName}"，嘗試 fallback 推導: fn="${fnName}"`);

            const knownServers = [
                'memory', 'fetch', 'time', 'taiwan_time', 'get_time',
                'calculator', 'file_reader', 'ffmpeg', 'web_search', 'web_search_deeply',
                'filesystem', 'daily_life', 'skill_executor'
            ];
            let foundServer = null;
            for (const srv of knownServers) {
                const tryUrl = `${mcpo.MCPO_BASE}/${srv}/${fnName}`;
                try {
                    await axios.head(tryUrl, { timeout: 3000 });
                    foundServer = srv;
                    break;
                } catch (probeErr) {
                    if (probeErr.response && probeErr.response.status !== 404) {
                        foundServer = srv;
                        break;
                    }
                }
            }

            // 若全部已知 server 都找不到，嘗試用 fnName 本身當 server 名
            // （適用於 MCPO server 名 = 函數名的情況，如 web_search_deeply）
            if (!foundServer) {
                const selfUrl = `${mcpo.MCPO_BASE}/${fnName}/${fnName}`;
                try {
                    await axios.head(selfUrl, { timeout: 3000 });
                    foundServer = fnName;
                } catch (probeErr) {
                    if (probeErr.response && probeErr.response.status !== 404) {
                        foundServer = fnName;
                    }
                }
            }

            if (foundServer) {
                mcpoUrl = `${mcpo.MCPO_BASE}/${foundServer}/${fnName}`;
                consol.info(`[工具執行] Fallback 找到 server: ${foundServer}`);
            } else {
                consol.warn(`[工具執行] 找不到對應 MCPO server，工具 "${toolName}" 無法執行`);
                return `[系統提示] 此工具 ("${toolName}") 在當前環境中無法使用（可能為未啟用的內建功能）。
請勿再次呼叫此工具或其他類似的未列舉工具（如 search_chats, search_notes, query_knowledge_bases 等）。
請直接根據你現有的知識或上文資訊，以一般文字回答使用者的問題。`;
            }
        }

        consol.info(`[工具執行] 請求 URL: ${httpMethod} ${mcpoUrl}`);

        let response;
        if (httpMethod === 'GET') {
            response = await axios.get(mcpoUrl, {
                params: toolArgs,
                timeout: 30000
            });
        } else {
            response = await axios.post(mcpoUrl, toolArgs, {
                headers: { "Content-Type": "application/json" },
                timeout: 30000
            });
        }

        consol.success(`[工具執行] 成功執行 ${toolName}`);

        if (response.data !== undefined && response.data !== null) {
            return typeof response.data === 'string'
                ? response.data
                : JSON.stringify(response.data);
        }
        return "工具執行成功";

    } catch (err) {
        consol.error(`[工具執行] 失敗: ${err.message}`);
        if (err.response) {
            consol.error(`[工具執行] API 錯誤: ${err.response.status}`);
            consol.error(`[工具執行] 詳情: ${JSON.stringify(err.response.data)}`);
        }
        return `工具執行失敗: ${err.message}`;
    }
}

module.exports = { executeToolCall };
