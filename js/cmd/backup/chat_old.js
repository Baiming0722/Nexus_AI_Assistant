// js/cmd/chat.js

const llmserver = require('../data/llmserver.json');
const { AttachmentBuilder } = require('discord.js');
const fs = require('../tool/fs');
const fsp = require('fs').promises;
const nfs = require('fs');
const axios = require('axios');
const consol = require('../tool/log');
const path = require('path');
const { spawn } = require('child_process');

var model = llmserver.openwebui;

let { point } = require('../data/llmprompt.json');
point = point.join("\n");

// MCPO 服務的端口與基礎 URL
const MCPO_PORT = 7861;
const MCPO_BASE = `http://localhost:${MCPO_PORT}`;

// Skill 相關路徑
const SKILL_MD_PATH = path.resolve(__dirname, '../../skill/SKILL.md');

// ============ 對話歷史管理 ============
const HISTORY_DIR = path.join(__dirname, '../data/history');
const MAX_HISTORY_ROUNDS = 20; // 每頻道最多保留的輪數 (1輪 = 1 user + 1 assistant)

/**
 * 讀取指定頻道的對話歷史
 * @param {string} channelId
 * @returns {Array} messages 陣列
 */
async function loadHistory(channelId) {
    try {
        const file = path.join(HISTORY_DIR, `${channelId}.json`);
        const raw = await fsp.readFile(file, 'utf8');
        const history = JSON.parse(raw);
        consol.info(`[歷史] 載入頻道 ${channelId} 的對話歷史 (${history.length} 條訊息)`);
        consol.info(`${'─'.repeat(60)}`);
        return Array.isArray(history) ? history : [];
    } catch {
        return []; // 檔案不存在或解析失敗時回傳空歷史
    }
}

/**
 * 儲存指定頻道的對話歷史
 * @param {string} channelId
 * @param {Array} history
 */
async function saveHistory(channelId, history) {
    try {
        await fsp.mkdir(HISTORY_DIR, { recursive: true });
        const file = path.join(HISTORY_DIR, `${channelId}.json`);
        await fsp.writeFile(file, JSON.stringify(history, null, 2), 'utf8');
        consol.info(`[歷史] 已儲存頻道 ${channelId} 的對話歷史 (${history.length} 條訊息)`);
    } catch (err) {
        consol.warn(`[歷史] 儲存失敗: ${err.message}`);
    }
}

/**
 * 清除對話歷史
 * @param {string|null} channelId 傳 null 或不傳則清除所有頻道
 * @returns {{ deleted: number, errors: number }}
 */
async function clearHistory(channelId) {
    let deleted = 0, errors = 0;
    try {
        if (channelId) {
            // 清除單一頻道
            const file = path.join(HISTORY_DIR, `${channelId}.json`);
            await fsp.unlink(file).catch(() => {}); // 檔案不存在時非錯誤
            deleted = 1;
        } else {
            // 清除所有頻道
            const files = await fsp.readdir(HISTORY_DIR).catch(() => []);
            for (const f of files) {
                if (f.endsWith('.json')) {
                    try {
                        await fsp.unlink(path.join(HISTORY_DIR, f));
                        deleted++;
                    } catch { errors++; }
                }
            }
        }
    } catch (err) {
        consol.warn(`[歷史] 清除失敗: ${err.message}`);
        errors++;
    }
    consol.info(`[歷史] 清除完成: deleted=${deleted}, errors=${errors}`);
    return { deleted, errors };
}

// ============ Skill CMD 工具函數 ============

/**
 * 讀取 SKILL.md，產生供 system prompt 使用的 Skill 概述文字
 * @returns {string}
 */
function readSkillOverview() {
    try {
        const md = nfs.readFileSync(SKILL_MD_PATH, 'utf8');
        const overview = [];
        const lines = md.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
            const m = lines[i].match(/^## Skill:\s*(.+)/);
            if (m) {
                const descLine = lines.slice(i + 1, i + 6).find(l => l.startsWith('**描述**'));
                const desc = descLine ? descLine.replace(/^\*\*描述\*\*[:：]\s*/, '') : '';
                overview.push(`- ${m[1].trim()}: ${desc}`);
            }
        }
        return overview.join('\n');
    } catch (e) {
        consol.warn(`[Skill] 無法讀取 SKILL.md: ${e.message}`);
        return '（無法讀取 SKILL.md）';
    }
}

/**
 * 讀取並執行對應的 Skill 檔案 (.py, .js, .md)
 * @param {string} skillName
 * @param {object|string} params
 * @returns {Promise<string>}
 */
async function runSkillCmd(skillName, params) {
    const paramsStr = typeof params === 'string' ? params : JSON.stringify(params || {});
    consol.info(`[Skill CMD] 準備執行: ${skillName}，參數: ${paramsStr}`);
    
    const skillsDir = path.resolve(__dirname, '../../skill/skills');
    
    // 檢查檔案是否存在
    const pyPath = path.join(skillsDir, `${skillName}.py`);
    const jsPath = path.join(skillsDir, `${skillName}.js`);
    const mdPath = path.join(skillsDir, `${skillName}.md`);
    
    try {
        if (nfs.existsSync(mdPath)) {
            consol.info(`[Skill CMD] 找到 Markdown Skill: ${skillName}.md`);
            const content = await fsp.readFile(mdPath, 'utf8');
            consol.success(`[Skill CMD] Markdown 已讀取`);
            return content;
        }
        
        let cmd = null;
        let scriptPath = null;
        
        if (nfs.existsSync(pyPath)) {
            cmd = 'python';
            scriptPath = pyPath;
        } else if (nfs.existsSync(jsPath)) {
            cmd = 'node';
            scriptPath = jsPath;
        }
        
        if (cmd && scriptPath) {
            return new Promise(resolve => {
                consol.info(`[Skill CMD] 執行 ${cmd} 腳本: ${skillName}`);
                const proc = spawn(cmd, [scriptPath, paramsStr], {
                    env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
                });
                
                let out = '', err = '';
                proc.stdout.on('data', d => { out += d; });
                proc.stderr.on('data', d => { err += d; });
                
                proc.on('close', code => {
                    if (out.trim()) {
                        consol.success(`[Skill CMD] ${skillName} 完成`);
                        resolve(out.trim());
                    } else if (code !== 0) {
                        consol.error(`[Skill CMD] ${skillName} 失敗 (code ${code}): ${err.trim()}`);
                        resolve(`❌ Skill \`${skillName}\` 執行失敗: ${err.trim()}`);
                    } else {
                        resolve('✅ 執行完成（無輸出）');
                    }
                });
                
                proc.on('error', e => {
                    consol.error(`[Skill CMD] 無法啟動 ${skillName}: ${e.message}`);
                    resolve(`❌ 無法啟動 ${skillName}: ${e.message}`);
                });
            });
        }
        
        return `❌ 找不到名為 ${skillName} 的 .py, .js, 或 .md 檔案`;
    } catch (e) {
        consol.error(`[Skill CMD] 執行錯誤: ${e.message}`);
        return `❌ Skill \`${skillName}\` 執行期間發生錯誤: ${e.message}`;
    }
}

// 緩存: OpenWebUI 函數名 → { server, endpoint } 的映射
// 例如: "tool_get_current_time_post" → { server: "time", endpoint: "/get_current_time" }
let mcpoToolMap = null;

// ============ 從 MCPO 建立工具路由映射表 ============
async function buildMcpoToolMap() {
    if (mcpoToolMap) return mcpoToolMap; // 已緩存，直接返回

    mcpoToolMap = {};

    const knownServers = [
        'memory', 'fetch', 'time', 'taiwan_time', 'get_time',
        'calculator', 'file_reader', 'ffmpeg', 'web_search', 'filesystem', 'daily_life',
        'skill_executor'
    ];

    try {
        // 1. 嘗試從 MCPO 頂層 openapi.json 取得 server 列表
        const rootResp = await axios.get(`${MCPO_BASE}/openapi.json`, { timeout: 5000 });
        const servers = Object.keys(rootResp.data.paths || {})
            .map(p => p.split('/')[1])
            .filter((v, i, a) => v && a.indexOf(v) === i);

        if (servers.length > 0) {
            consol.info(`[MCPO] 頂層發現 servers: ${servers.join(', ')}`);
            for (const srv of servers) {
                await indexMcpoServer(srv);
            }
        } else {
            // 根 openapi.json 存在但沒有 paths，改用已知 server 列表
            consol.warn(`[MCPO] 頂層 openapi.json 無 paths，改用已知 server 列表`);
            for (const srv of knownServers) {
                await indexMcpoServer(srv);
            }
        }
    } catch (err) {
        // 頂層 openapi.json 不存在，改用已知 server 列表
        consol.warn(`[MCPO] 頂層 openapi.json 失敗 (${err.message})，改用已知 server 列表`);
        for (const srv of knownServers) {
            await indexMcpoServer(srv);
        }
    }

    const uniqueTools = new Set(Object.values(mcpoToolMap).map(v => `${v.server}|${v.endpoint}|${v.method}`));
    consol.success(`[MCPO] 工具映射表建立完成，共 ${uniqueTools.size} 個工具函數`);
    return mcpoToolMap;
}

// 對單一 MCPO server 取得其 openapi.json 並建立映射
async function indexMcpoServer(serverName) {
    try {
        const openapiUrl = `${MCPO_BASE}/${serverName}/openapi.json`;
        const resp = await axios.get(openapiUrl, { timeout: 5000 });
        const paths = resp.data.paths || {};

        for (const [routePath, methods] of Object.entries(paths)) {
            for (const [method, spec] of Object.entries(methods)) {
                // operationId 就是 Open WebUI 呼叫時使用的函數名稱
                // 例如: get_current_time → operationId: "get_current_time_post" 或 "tool_get_current_time_post"
                const operationId = spec.operationId || '';
                if (!operationId) continue;

                // Open WebUI 命名規則: "tool_" + operationId，所以我們同時註冊兩個鍵
                const keys = [
                    operationId,
                    `tool_${operationId}`,
                ];

                for (const key of keys) {
                    mcpoToolMap[key] = {
                        server: serverName,
                        endpoint: routePath, // 例如 "/get_current_time"
                        method: method.toUpperCase()
                    };
                }
            }
        }
        consol.info(`[MCPO] 已索引 server: ${serverName}`);
    } catch (err) {
        consol.warn(`[MCPO] 無法索引 server ${serverName}: ${err.message}`);
    }
}

// ============ 獲取工具列表的函數 ============
async function getAvailableTools() {
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

        // 從路徑提取 server 名稱，例如 /time/... → "time"
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
        // MCPO 頂層 openapi.json 不可用時，嘗試逐一探測已知 server
        consol.warn(`[工具] MCPO 頂層查詢失敗 (${err.message})，改用已知 server 列表補入`);
        const knownServers = [
            'memory', 'fetch', 'time', 'taiwan_time', 'get_time',
            'calculator', 'file_reader', 'ffmpeg', 'web_search',
            'filesystem', 'daily_life', 'skill_executor'
        ];

        for (const srv of knownServers) {
            const toolId = `server:${srv}`;
            if (!seenIds.has(toolId)) {
                try {
                    // 探測 server 是否存活
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

    // 移除 skill 相關 server（改用 tools 參數直接定義，避免 Open WebUI 內部處理導致回指 content 為空）
    const filteredIds = allToolIds.filter(id => id !== 'server:skill' && id !== 'server:skill_executor');
    if (filteredIds.length < allToolIds.length) {
        consol.info(`[工具] 已移除 skill 相關 server（skill 不經過 tool_ids，改用 tools 參數定義）`);
    }

    consol.success(`[工具] 最終工具列表共 ${filteredIds.length} 個: ${filteredIds.join(', ')}`);
    return filteredIds;
}

// ============ 執行單個工具的函數 (呼叫 MCPO port 7861) ============
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

        // 確保映射表已建立
        const toolMap = await buildMcpoToolMap();

        let mcpoUrl = null;
        let httpMethod = 'POST';

        // Skill 相關工具已由 chat() 的 runSkillCmd() 直接執行，不走 MCPO

        if (!mcpoUrl && toolMap[toolName]) {
            // 從映射表找到正確的 MCPO 端點（別名路由優先，不覆蓋）
            const { server, endpoint, method } = toolMap[toolName];
            mcpoUrl = `${MCPO_BASE}/${server}${endpoint}`;
            httpMethod = method;
            consol.info(`[工具執行] 映射到 MCPO: ${httpMethod} ${mcpoUrl}`);
        } else if (!mcpoUrl) {
            // Fallback: 從函數名推導，並逐一搜尋所有已知 server
            let fnName = toolName;
            if (fnName.startsWith('tool_')) fnName = fnName.slice(5);
            if (fnName.endsWith('_post')) { fnName = fnName.slice(0, -5); httpMethod = 'POST'; }
            else if (fnName.endsWith('_get')) { fnName = fnName.slice(0, -4); httpMethod = 'GET'; }

            consol.warn(`[工具執行] 映射表中找不到 "${toolName}"，嘗試 fallback 推導: fn="${fnName}"`);

            // 逐一試查各 server，找到能匹配函數名的那個
            const knownServers = [
                'memory', 'fetch', 'time', 'taiwan_time', 'get_time',
                'calculator', 'file_reader', 'ffmpeg', 'web_search', 'filesystem', 'daily_life',
                'skill_executor'
            ];
            let foundServer = null;
            for (const srv of knownServers) {
                // 先查映射表（可能某些 server 已索引）
                const mapKey = `${srv}:${fnName}`;
                const tryUrl = `${MCPO_BASE}/${srv}/${fnName}`;
                try {
                    // 用 HEAD 或 OPTIONS 探測端點是否存在（避免副作用）
                    // 若 HEAD 不支援就用 GET + timeout 短
                    await axios.head(tryUrl, { timeout: 3000 });
                    foundServer = srv;
                    break;
                } catch (probeErr) {
                    if (probeErr.response && probeErr.response.status !== 404) {
                        // 端點存在但回傳其他錯誤（如 405 Method Not Allowed），代表路徑有效
                        foundServer = srv;
                        break;
                    }
                    // 404 表示端點不存在，繼續試下一個
                }
            }

            if (foundServer) {
                mcpoUrl = `${MCPO_BASE}/${foundServer}/${fnName}`;
                consol.info(`[工具執行] Fallback 找到 server: ${foundServer}`);
            } else {
                // 最後手段: 用函數名稱猜測 server（去掉常見動詞前綴）
                const guessedServer = fnName.split('_')[0] || 'time';
                mcpoUrl = `${MCPO_BASE}/${guessedServer}/${fnName}`;
                consol.warn(`[工具執行] 無法探測到 server，猜測使用: ${guessedServer}`);
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

// ============ 主要聊天函數 (Skill CMD 三段式流程) ============
async function chat(message, args, _client, attachmentData) {
    var config = await fs.read(path.join(__dirname, '../data/config.json'));
    if (config[message.guild.name]) {
        model = config[message.guild.name];
    }

    const now = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
    const preview = args ? String(args).substring(0, 40).replace(/\n/g, ' ') : '';
    consol.info(`🗨  ${now}　${preview}${args && args.length > 40 ? '…' : ''}`);
    consol.success(`運作中 模型${model.model}`);
    if (!args && !(attachmentData && (attachmentData.texts.length > 0 || attachmentData.images.length > 0))) return;

    // ── 標準化 attachmentData ──
    const att = attachmentData || { texts: [], images: [] };

    try {
        consol.info(`[除錯] 正在呼叫的 URL: http://${model.ip}`);

        // 預先建立 MCPO 工具映射表（首次呼叫時建立，後續使用緩存）
        await buildMcpoToolMap();

        // 動態獲取可用工具
        let toolIds = await getAvailableTools();

        if (!toolIds || toolIds.length === 0) {
            consol.warn('[工具] 動態獲取失敗，使用備用工具列表');
            toolIds = [
                'server:time',
                'server:calculator',
                'server:ffmpeg',
                'server:web_search',
                'server:filesystem',
                'server:daily_life'
            ];
        }

        if (toolIds && toolIds.length > 0) {
            consol.info(`[工具] 已啟用 ${toolIds.length} 個工具: ${toolIds.join(', ')}`);
        }

        // ── 讀取 SKILL.md 概述，注入 system prompt ──
        const skillOverview = readSkillOverview();
        const skillSystemAppend = [
            '',
            '【可用 Skill 工具】',
            '若本次問題需要用到以下 Skill，請「只」回覆如下 JSON（可同時列多個），不要附加任何其他文字：',
            '{"skills":[{"skill_name":"<名稱>","parameters":{<參數>}},…]}',
            '⚠️ 警告：避免因文本過長導致輸出截斷，若要求處理或總結的文本來自用戶訊息或附件，請在 parameters 對應參數中只需填寫 "[ATTACHMENT]" 即可，系統會自動在背景替換為完整的用戶文本。',
            '若不需要使用 Skill，直接以正常文字回覆即可。',
            '',
            '可用 Skill 清單：',
            skillOverview
        ].join('\n');
        const systemContent = point + skillSystemAppend;
        consol.info(`[Skill] 已將 ${skillOverview.split('\n').length} 個 Skill 概述注入 system prompt`);

        // ── 組合 user content（文字 + 文字附件 + 圖片附件）──
        let textContent = args ? String(args) : '';
        for (const tf of att.texts) {
            textContent += `\n\n--- 附件: ${tf.name} ---\n${tf.content}`;
            consol.info(`[附件→LLM] 已附加文字附件: ${tf.name}`);
        }

        let userContent;
        if (att.images.length > 0) {
            userContent = [{ type: 'text', text: textContent || '請描述這些圖片' }];
            for (const img of att.images) {
                userContent.push({
                    type: 'image_url',
                    image_url: { url: `data:${img.mimeType};base64,${img.base64}` }
                });
                consol.info(`[附件→LLM] 已附加圖片附件: ${img.name} (${img.mimeType})`);
            }
        } else {
            userContent = textContent;
        }

        // ── 載入對話歷史 ──
        const channelId = message ? message.channel.id : 'cli';
        const history = await loadHistory(channelId);
        const currentUserMsg = { role: 'user', content: userContent };

        let conversationMessages = [
            { role: 'system', content: systemContent },
            ...history,
            currentUserMsg
        ];

        // ====== 第 1 輪請求：讓 LLM 判斷是否需要 Skill ======
        consol.info(`[第1輪] model=${model.model}, messages=${conversationMessages.filter(m => m.role !== 'system').length}條用戶訊息`);

        let response = await axios.post(
            `http://${model.ip}`,
            {
                model: model.model,
                messages: conversationMessages,
                stream: false,
                tool_ids: toolIds
            },
            {
                headers: { 'Authorization': model.apikey, 'Content-Type': 'application/json' },
                timeout: 120000
            }
        );

        let choice = response.data.choices[0];
        let round1Content = choice.message.content || choice.message.text || choice.text || '';

        // 去除 <think>...</think> 包裝
        if (round1Content.includes('</think>')) {
            const afterThink = round1Content.split('</think>').slice(1).join('</think>').trim();
            if (afterThink) round1Content = afterThink;
        }

        consol.info(`[第1輪] finish_reason=${choice.finish_reason}, contentLen=${round1Content.length}`);

        // ====== 解析第 1 輪：是否包含 Skill JSON ======
        let fullReply = round1Content;
        let cleanContent = round1Content.replace(/^```[a-z]*\s*/i, '').replace(/\s*```$/i, '').trim();
        let skillJsonMatch = cleanContent.match(/\{\s*"skills"\s*:\s*\[.*?\]\s*\}/s);

        if (skillJsonMatch) {
            let parsedSkills = null;
            try {
                parsedSkills = JSON.parse(skillJsonMatch[0]);
            } catch (e) {
                consol.warn(`[Skill] JSON 解析失敗: ${e.message}，視為一般回覆`);
            }

            if (parsedSkills && Array.isArray(parsedSkills.skills) && parsedSkills.skills.length > 0) {
                consol.success(`[Skill] 偵測到 ${parsedSkills.skills.length} 個 Skill 需求`);

                // ── 執行所有 Skill（支援並行） ──
                const skillTasks = parsedSkills.skills.map(async (s) => {
                    const sName = s.skill_name || '';
                    const sParams = s.parameters || {};
                    // 將參數中的 [ATTACHMENT] 替換為完整用戶文本
                    for (const key in sParams) {
                        if (typeof sParams[key] === 'string' && sParams[key].includes('[ATTACHMENT]')) {
                            sParams[key] = sParams[key].replace('[ATTACHMENT]', textContent);
                        }
                    }
                    consol.info(`[Skill] 準備執行: ${sName}`);
                    const result = await runSkillCmd(sName, sParams);
                    return { skill_name: sName, result };
                });
                const skillResults = await Promise.all(skillTasks);

                // ── 組合 Skill 結果訊息 ──
                const skillResultText = skillResults
                    .map(r => `### Skill: ${r.skill_name}\n${r.result}`)
                    .join('\n\n');

                consol.success(`[Skill] 所有 Skill 執行完畢，準備第 2 輪請求`);

                // ── 第 2 輪：讓 LLM 整合 Skill 結果生成最終回覆 ──
                const round2Messages = [
                    { role: 'system', content: point },  // 第2輪不附加 Skill 指引
                    ...history,
                    currentUserMsg,
                    { role: 'assistant', content: '好的，我了解了您的需求，這就為您呼叫對應的工具進行處理。' },
                    { role: 'user', content: `【強烈指令】以下是剛剛呼叫 Skill 工具的執行結果，請**務必**根據這些結果，詳細回覆我一開始的問題或要求，不要保持沉默。請直接給出你的分析與最終答案，不要只輸出 <think> 標籤，必須要有實際回覆的文字內容：\n\n${skillResultText}` },
                    { role: 'assistant', content: '根據 Skill 執行結果，' }
                ];

                consol.info(`[第2輪] model=${model.model}, messages=${round2Messages.length}條`);

                const secondResponse = await axios.post(
                    `http://${model.ip}`,
                    {
                        model: model.model,
                        messages: round2Messages,
                        stream: false
                    },
                    {
                        headers: { 'Authorization': model.apikey, 'Content-Type': 'application/json' },
                        timeout: 120000
                    }
                );

                const secondChoice = secondResponse.data.choices[0];
                let secondContent = secondChoice.message.content || '';
                
                // 去除 <think>...</think> 包裝 (第 2 輪也可能會有)
                if (secondContent.includes('</think>')) {
                    const afterThink = secondContent.split('</think>').slice(1).join('</think>').trim();
                    if (afterThink) secondContent = afterThink;
                }

                // 如果我們有加上前綴，就把它補回來 (假設模型接著我們的話講)
                if (secondContent && !secondContent.startsWith('根據 Skill 執行結果')) {
                    fullReply = '根據 Skill 執行結果，' + secondContent;
                } else {
                    fullReply = secondContent;
                }

                if (!fullReply) {
                    consol.warn(`[第2輪] 回覆為空，finish_reason=${secondChoice.finish_reason}`);
                } else {
                    consol.success('[第2輪] 完成，獲得最終回覆');
                }
            }
        } else {
            // 無 Skill JSON，直接使用第 1 輪結果（可能包含其他工具調用）
            const hasToolCalls = choice.message.tool_calls && choice.message.tool_calls.length > 0;
            consol.info(`[第1輪] 無 Skill JSON，hasToolCalls=${hasToolCalls}`);

            if (hasToolCalls) {
                // 處理其他 MCP 工具（非 Skill）
                consol.success(`[工具] 模型調用了 ${choice.message.tool_calls.length} 個工具`);
                choice.message.tool_calls.forEach((tc, i) => {
                    consol.info(`  [工具 ${i + 1}] ${tc.function.name}: ${tc.function.arguments}`);
                });

                conversationMessages.push({
                    role: 'assistant',
                    content: choice.message.content || '',
                    tool_calls: choice.message.tool_calls
                });

                for (const toolCall of choice.message.tool_calls) {
                    const toolResult = await executeToolCall(toolCall);
                    consol.success(`[工具] 結果: ${String(toolResult).substring(0, 200)}`);
                    conversationMessages.push({
                        role: 'tool',
                        tool_call_id: toolCall.id,
                        content: toolResult
                    });
                }

                consol.info('[工具] 準備第 2 輪請求取得最終回覆');
                const secondResponse = await axios.post(
                    `http://${model.ip}`,
                    { model: model.model, messages: conversationMessages, stream: false },
                    {
                        headers: { 'Authorization': model.apikey, 'Content-Type': 'application/json' },
                        timeout: 120000
                    }
                );
                const secondChoice = secondResponse.data.choices[0];
                fullReply = secondChoice.message.content || '';
                consol.success('[工具] 第2輪完成');
            }
        }

        // ====== 處理回覆內容 ======
        fullReply = fullReply
            .split('\n')
            .filter(line => !/^cmd\.\w+\(/.test(line.trim()))
            .join('\n')
            .trim();

        if (!fullReply || fullReply.trim() === '' || fullReply.trim() === '<think>\n\n\n\n</think>') {
            fullReply = '✅ 處理完成，但模型未返回內容。';
            consol.warn('[響應] 模型未返回有效內容');
        }

        consol.success(`[回覆] ${fullReply.substring(0, 200)}${fullReply.length > 200 ? '...' : ''}`);

        // ====== 儲存對話歷史 ======
        history.push(currentUserMsg);
        history.push({ role: 'assistant', content: fullReply });
        while (history.length > MAX_HISTORY_ROUNDS * 2) {
            history.splice(0, 2);
        }
        await saveHistory(channelId, history);

        // ====== 發送到 Discord ======
        if (message) {
            if (fullReply.length < 2000 && fullReply.length > 0) {
                await message.channel.send(fullReply);
            } else if (fullReply.length > 0) {
                fs.writeFileSync('./data/message.txt', fullReply);
                const file = new AttachmentBuilder('./data/message.txt');
                await message.channel.send({ content: '內容太長，請參閱附件：', files: [file] });
            } else {
                await message.channel.send('模型沒有返回內容');
            }
        } else {
            return fullReply;
        }

    } catch (err) {
        consol.error(`[錯誤] ${err.message}`);
        consol.error(`[錯誤] 堆疊: ${err.stack}`);

        if (err.response) {
            consol.error(`[API 錯誤] 狀態碼: ${err.response.status}`);
            consol.error(`[API 錯誤] 狀態文字: ${err.response.statusText}`);
            consol.error(`[API 錯誤] 回應: ${JSON.stringify(err.response.data, null, 2)}`);
        } else if (err.request) {
            consol.error(`[網路錯誤] 無法連接到 API 服務器`);
        }

        const errorMessage = '❌ 發生錯誤：' + (err.message || '未知錯誤');
        if (message) {
            await message.channel.send(errorMessage);
        } else {
            return errorMessage;
        }
    }
}

// ============ 搜尋特定工具 ============
async function findTools(keyword) {
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
    chat,
    getAvailableTools,
    findTools,
    executeToolCall,
    buildMcpoToolMap,
    clearHistory,
    MCPO_BASE
};