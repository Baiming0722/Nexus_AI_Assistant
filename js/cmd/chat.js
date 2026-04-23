// js/cmd/chat.js
// 主調度器 — 負責組合子模組、處理聊天主流程

const llmserver = require('../data/llmserver.json');
const { AttachmentBuilder } = require('discord.js');
const fs = require('../tool/fs');
const axios = require('axios');
const consol = require('../tool/log');
const path = require('path');

// ── 子模組 ──
const { truncateLog } = require('./chat/format');
const { HISTORY_DIR, loadHistory, saveHistory, clearHistory, getHistoryFiles, resetHistoryIndex, setHistoryIndex, MAX_HISTORY_ROUNDS } = require('./chat/history');
const { readSkillOverview, runSkillCmd } = require('./chat/skill');
const { MCPO_BASE, buildMcpoToolMap } = require('./chat/mcpo');
const { getAvailableTools: _getAvailableTools, findTools: _findTools } = require('./chat/tools');
const { executeToolCall } = require('./chat/toolExec');

// ── 共享狀態 ──
var model = llmserver.openwebui;

let { point } = require('../data/llmprompt.json');
point = point.join("\n");

// ── 包裝函數：將 model 注入子模組 ──
async function getAvailableTools() {
    return _getAvailableTools(model);
}

async function findTools(keyword) {
    return _findTools(keyword, model);
}

async function getModelsList() {
    let models = [];
    const baseUrl = model.ip.replace('/api/chat/completions', '').replace('/api/chat', '');
    try {
        if (model.apikey || model.ip.includes("openwebui") || !model.ip.includes("11434")) {
            const url = `http://${baseUrl}/api/models`;
            const response = await axios.get(url, {
                headers: { "Authorization": model.apikey, "Content-Type": "application/json" },
                timeout: 5000
            });
            if (response.data && response.data.data) models = response.data.data;
            else if (Array.isArray(response.data)) models = response.data;
            else if (response.data && response.data.models) models = response.data.models;
        } else {
            const url = `http://${baseUrl}/api/tags`;
            const response = await axios.get(url, { timeout: 5000 });
            if (response.data && response.data.models) models = response.data.models;
        }
    } catch (e) {
        consol.warn("[模型] 無法取得模型清單: " + e.message);
    }
    return models.map(m => m.id || m.model || m.name).filter(Boolean);
}

function getCurrentModel() {
    return model.model;
}

function setModel(modelKey) {
    if (modelKey) {
        model.model = modelKey;
        return true;
    }
    return false;
}

// ============ 主要聊天函數 (Skill CMD 三段式流程) ============
/**
 * @param {object|null} message  - Discord message 物件（web 端為 null）
 * @param {string|null} args     - 使用者文字訊息
 * @param {string|null} _client  - (保留) Discord client
 * @param {object|null} attachmentData - 附件資料 { texts, images }
 * @param {object|null} userData - 當前使用者完整資料（含 userinfo）
 */
async function chat(message, args, _client, attachmentData, userData) {
    var config = await fs.read(path.join(__dirname, '../data/config.json'));
    if (message && message.guild && config[message.guild.name]) {
        model = config[message.guild.name];
    }

    const now = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false });
    const preview = args ? String(args).substring(0, 40).replace(/\n/g, ' ') : '';
    consol.info(`🗨  ${now}　${preview}${args && args.length > 40 ? '…' : ''}`);
    consol.success(`運作中 模型${model.model}`);

    // ── 解析使用者資料 ──
    const userInfo = userData && userData.userinfo ? userData.userinfo : null;
    const userId = userInfo ? userInfo.id : null;
    const userDisplayName = userInfo
        ? (userInfo.global_name || userInfo.username || userInfo.id)
        : (message && message.author ? (message.member?.displayName || message.author.username) : 'User');
    if (userId) {
        consol.info(`[使用者] ID: ${userId}, 名稱: ${userDisplayName}`);
    }

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
                'server:memory',
                'server:fetch',
                'server:time',
                'server:taiwan_time',
                'server:get_time',
                'server:calculator',
                'server:ffmpeg',
                'server:web_search',
                'server:filesystem',
                'server:daily_life',
                'server:web_search_deeply'
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
        consol.info(`[Skill] 已將 ${skillOverview.split('\n').length} 個 Skill 概述注入 system prompt`);

        // ── 組合 user content（文字 + 文字附件 + 圖片附件）──
        const userName = userDisplayName;
        // 附加使用者識別資訊到 system prompt（僅供 AI 內部識別，不顯示給使用者）
        let userIdentityBlock = '';
        if (userId) {
            userIdentityBlock = [
                '',
                '【當前使用者資訊（系統內部，不對使用者顯示）】',
                `使用者 ID: ${userId}`,
                `顯示名稱: ${userDisplayName}`,
                userInfo.username ? `帳號名: ${userInfo.username}` : '',
                userInfo.locale ? `語言設定: ${userInfo.locale}` : '',
                userInfo.email ? `Email: ${userInfo.email}` : '',
                '請以此 ID 識別該使用者的個人化記憶與偏好，並在呼叫記憶工具時帶入此 ID 作為索引。'
            ].filter(Boolean).join('\n');
        }
        const systemContent = point + skillSystemAppend + userIdentityBlock;

        let textContent = args ? String(args) : '';
        for (const tf of att.texts) {
            textContent += `\n\n--- 附件: ${tf.name} ---\n${tf.content}`;
            consol.info(`[附件→LLM] 已附加文字附件: ${tf.name}`);
        }

        let userContent;
        if (att.images.length > 0) {
            let combinedText = textContent || '請描述這些圖片';
            userContent = [{ type: 'text', text: `[${userName}] 說：\n${combinedText}` }];
            for (const img of att.images) {
                userContent.push({
                    type: 'image_url',
                    image_url: { url: `data:${img.mimeType};base64,${img.base64}` }
                });
                consol.info(`[附件→LLM] 已附加圖片附件: ${img.name} (${img.mimeType})`);
            }
        } else {
            userContent = `[${userName}] 說：\n${textContent}`;
        }

        // ── 載入對話歷史 ──
        // web 端優先以 userId 作為歷史 key，確保每個 Discord 使用者有獨立記憶
        const channelId = message ? message.channel.id : (userId ? `web_${userId}` : 'cli');
        const history = await loadHistory(channelId);

        const safeName = userName.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 64);
        const currentUserMsg = safeName
            ? { role: 'user', name: safeName, originalName: userName, content: userContent }
            : { role: 'user', originalName: userName, content: userContent };

        let conversationMessages = [
            { role: 'system', content: systemContent },
            ...history,
            currentUserMsg
        ];

        // ====== 三階段工具調用主流程 ======
        // 階段 1：正式 LLM 呼叫（帶 tool_ids + 完整對話歷史）
        // 階段 2：判斷 LLM（僅帶當次工具上下文，最多 MAX_EXTRA_ROUNDS 次額外調用）
        // 階段 3：最終輸出（不帶 tool_ids，帶完整對話歷史 + 所有工具結果）
        const MAX_EXTRA_ROUNDS = 3;
        let isSkillRunning = false;
        let skillPromptMsg = null;
        let fullReply = '';
        const usageLog = []; // 按順序記錄 MCP/Tool/Skill 使用紀錄

        // ── 呼叫 LLM 共用函式 ──
        const callLLM = async (messages, withTools) => {
            const body = { model: model.model, messages, stream: false };
            if (withTools && toolIds?.length) body.tool_ids = toolIds;
            const resp = await axios.post(`http://${model.ip}`, body, {
                headers: { 'Authorization': model.apikey, 'Content-Type': 'application/json' },
                timeout: 120000
            });
            if (!resp.data?.choices?.length) {
                consol.error(`[API] 回應無效，response.data = ${JSON.stringify(resp.data).substring(0, 500)}`);
                consol.error(`[API] HTTP 狀態: ${resp.status}, Content-Type: ${resp.headers['content-type']}`);
                throw new Error('API 回應無效：未包含 choices 欄位。請確認模型名稱與 API 金鑰是否正確。');
            }
            const choice = resp.data.choices[0];
            if (!choice?.message) {
                consol.error(`[API] choices[0] 無效: ${JSON.stringify(choice)}`);
                throw new Error('API 回應格式錯誤：choices[0] 無有效 message。');
            }
            return choice;
        };

        // ── 清理 LLM 回覆（去除 <think> 標籤與 Skill JSON Markdown 包裝）──
        const cleanContent = (raw) => {
            let content = raw || '';
            if (content.includes('</think>')) {
                const afterThink = content.split('</think>').slice(1).join('</think>').trim();
                if (afterThink) content = afterThink;
            }
            return content.replace(/```json\s*\{[\s\S]*?"skills"[\s\S]*?\}\s*```/ig, '').trim();
        };

        // ── 執行 Skill JSON，將結果 push 到 targetMessages ──
        const executeSkillJson = async (skillMatch, targetMessages) => {
            let parsedSkills;
            try { parsedSkills = JSON.parse(skillMatch[0]); }
            catch (e) { consol.warn(`[Skill] JSON 解析失敗: ${e.message}`); return false; }
            if (!parsedSkills?.skills?.length) return false;

            const skillResults = await Promise.all(parsedSkills.skills.map(async (s) => {
                const sName = s.skill_name || '';
                const sParams = { ...(s.parameters || {}) };
                // 將參數中的 [ATTACHMENT] 替換為完整用戶文本
                for (const key in sParams) {
                    if (typeof sParams[key] === 'string' && sParams[key].includes('[ATTACHMENT]')) {
                        sParams[key] = sParams[key].replace('[ATTACHMENT]', textContent);
                    }
                }
                usageLog.push({ type: 'Skill', name: sName });
                const result = await runSkillCmd(sName, sParams);
                return { skill_name: sName, result };
            }));

            const resultText = skillResults
                .map(r => `### Skill: ${r.skill_name}\n${r.result}`)
                .join('\n\n');
            targetMessages.push({
                role: 'user',
                content: `【系統提示】以下是 Skill 執行結果：\n\n${resultText}`
            });
            return true;
        };

        // ── 執行 Tool Calls，將 tool 結果 push 到 targetMessages（不含 assistant message）──
        const pushToolResults = async (toolCalls, targetMessages) => {
            const toolMap = await buildMcpoToolMap();
            for (let i = 0; i < toolCalls.length; i++) {
                const toolCall = toolCalls[i];
                const tcName = toolCall.function.name;
                usageLog.push({ type: 'MCP Tool', name: tcName, server: toolMap[tcName]?.server || 'unknown' });
                consol.info(`  [工具 ${i + 1}] ${tcName}: ${toolCall.function.arguments}`);

                if (tcName === 'run_skill' || tcName === 'skills') {
                    // 攔截幻覺工具（模型自行發明），轉發到本地 Skill 機制
                    let toolResult = '';
                    try {
                        const tcArgs = JSON.parse(toolCall.function.arguments);
                        const sName = tcArgs.skill_name || tcArgs.name || '';
                        let sParams = tcArgs.parameters || tcArgs.params || {};
                        if (typeof sParams === 'string') { try { sParams = JSON.parse(sParams); } catch (_) { } }
                        for (const key in sParams) {
                            if (typeof sParams[key] === 'string' && sParams[key].includes('[ATTACHMENT]')) {
                                sParams[key] = sParams[key].replace('[ATTACHMENT]', textContent);
                            }
                        }
                        usageLog.push({ type: 'Skill (Tool Call)', name: sName });
                        const res = await runSkillCmd(sName, sParams);
                        toolResult = `### Skill: ${sName}\n${res}`;
                        consol.success(`[Tool->Skill] 結果: ${String(toolResult).substring(0, 200)}`);
                    } catch (e) {
                        toolResult = `[Skill 錯誤] 參數解析失敗: ${e.message}`;
                    }
                    targetMessages.push({ role: 'tool', tool_call_id: toolCall.id, content: toolResult });
                } else {
                    // 一般 MCP 工具，由 MCPO 負責執行
                    const toolResult = await executeToolCall(toolCall);
                    consol.success(`[MCP 工具] 結果: ${String(toolResult).substring(0, 200)}`);
                    targetMessages.push({ role: 'tool', tool_call_id: toolCall.id, content: toolResult });
                }
            }
        };

        // ── 解析並執行 LLM 回覆中的工具/Skill 調用，push 到 targetMessages ──
        // 回傳 true 若有執行任何工具或 Skill，否則 false
        const handleExecution = async (choice, rawContent, targetMessages) => {
            const skillMatch = rawContent.match(/\{\s*"skills"\s*:\s*\[[\s\S]*?\]\s*\}/);
            const hasToolCalls = !!(choice.message?.tool_calls?.length);
            if (!skillMatch && !hasToolCalls) return false;

            // Push assistant message（含 tool_calls 屬性或 Skill JSON 內容）
            const assistantMsg = { role: 'assistant', content: choice.message?.content || '' };
            if (hasToolCalls) assistantMsg.tool_calls = choice.message.tool_calls;
            targetMessages.push(assistantMsg);

            // 優先執行 tool_calls，再執行 Skill JSON
            if (hasToolCalls) await pushToolResults(choice.message.tool_calls, targetMessages);
            if (skillMatch) await executeSkillJson(skillMatch, targetMessages);
            return true;
        };

        // ==============================
        // 階段 1：正式 LLM 呼叫（帶 tool_ids + 完整對話歷史）
        // ==============================
        consol.info(`[階段 1] 正式 LLM 呼叫 (model=${model.model}, messages=${conversationMessages.filter(m => m.role !== 'system').length} 條)`);
        const phase1Choice = await callLLM(conversationMessages, true);
        const rawPhase1 = phase1Choice.message?.content || '';
        const phase1Content = cleanContent(rawPhase1);
        const phase1HasTools = !!(
            rawPhase1.match(/\{\s*"skills"\s*:\s*\[[\s\S]*?\]\s*\}/) ||
            phase1Choice.message?.tool_calls?.length
        );

        if (!phase1HasTools) {
            // 無工具調用 → 直接使用 Phase 1 結果，跳過階段 2 與 3
            consol.success('[完成] 無需工具調用，直接使用 Phase 1 結果。');
            fullReply = phase1Content;
        } else {
            // 有工具調用 → 顯示提示訊息並進入工具執行流程
            if (message) {
                isSkillRunning = true;
                const hasSkillJson = !!rawPhase1.match(/\{\s*"skills"\s*:\s*\[[\s\S]*?\]\s*\}/);
                const hasToolCalls1 = !!(phase1Choice.message?.tool_calls?.length);
                const hint = (hasSkillJson && hasToolCalls1) ? '正在使用 Skill 與工具...'
                    : hasSkillJson ? '正在使用 Skill...'
                        : '正在使用工具...';
                skillPromptMsg = await message.channel.send(hint);
            }

            // toolExecutionMessages：收集 Phase 1 + Phase 2 的所有工具調用結果，供 Phase 3 使用
            const toolExecutionMessages = [];
            await handleExecution(phase1Choice, rawPhase1, toolExecutionMessages);

            // ==============================
            // 階段 2：判斷 LLM（最多 MAX_EXTRA_ROUNDS 次額外調用）
            // 只帶當次工具執行上下文，不帶完整對話歷史
            // ==============================
            const JUDGE_SYSTEM_PROMPT = [
                '你是一個工具調用決策器，負責決定是否需要繼續調用工具或 Skill 來蒐集更多資訊。',
                '根據使用者的原始問題與目前已收集的工具執行結果，做出決策。',
                '',
                '決策規則：',
                '  - 若現有資訊已足夠回答使用者問題，請只輸出：DONE',
                '  - 若需要繼續調用 Skill，輸出以下 JSON（不得附加任何其他文字）：',
                '    {"skills":[{"skill_name":"<名稱>","parameters":{<參數>}}]}',
                '  - 若需要繼續調用 Tool，直接在 message 帶 tool_calls',
                '',
                '⚠️ 若不確定是否需要更多資訊，優先輸出 DONE，避免不必要的工具調用。',
                '',
                '【可用 Skill 清單】',
                skillOverview
            ].join('\n');

            // 初始化判斷 LLM 的訊息（只含當次工具執行結果，不含歷史）
            let judgeMessages = [
                { role: 'system', content: JUDGE_SYSTEM_PROMPT },
                { role: 'user', content: `使用者的原始問題：\n${textContent}` },
                ...toolExecutionMessages
            ];

            for (let extraRound = 1; extraRound <= MAX_EXTRA_ROUNDS; extraRound++) {
                consol.info(`[階段 2 / 額外第 ${extraRound} 輪] 判斷 LLM 呼叫`);
                const judgeChoice = await callLLM(judgeMessages, true);
                const rawJudge = judgeChoice.message?.content || '';
                const judgeHasTools = !!(
                    rawJudge.match(/\{\s*"skills"\s*:\s*\[[\s\S]*?\]\s*\}/) ||
                    judgeChoice.message?.tool_calls?.length
                );

                if (!judgeHasTools) {
                    consol.success(`[階段 2 / 額外 ${extraRound}] 判斷結果：DONE，結束工具調用階段`);
                    break;
                }

                consol.info(`[階段 2 / 額外 ${extraRound}] 判斷結果：繼續調用工具/Skill`);
                const extraMsgs = [];
                await handleExecution(judgeChoice, rawJudge, extraMsgs);

                // 更新 judgeMessages（下次迭代可見前次結果）
                judgeMessages.push(...extraMsgs);
                // 累積到 toolExecutionMessages（Phase 3 最終輸出使用）
                toolExecutionMessages.push(...extraMsgs);

                if (extraRound === MAX_EXTRA_ROUNDS) {
                    consol.warn(`[階段 2] 已達最大額外調用次數 (${MAX_EXTRA_ROUNDS})，強制進入最終輸出`);
                }
            }

            // ==============================
            // 階段 3：最終輸出（不帶 tool_ids + 完整對話歷史 + 所有工具結果）
            // 此階段的回覆才是使用者看到、記憶系統記錄的內容
            // ==============================
            const FINAL_SYSTEM_APPEND = [
                '',
                '【最終回覆指示】',
                '以下對話已包含所有工具與 Skill 的執行結果。',
                '請根據使用者的問題與所有工具結果，給出最終、完整的回覆。',
                '⚠️ 此次回覆禁止調用任何 Tool 或 Skill，請直接整合已有資料進行輸出。',
            ].join('\n');

            const finalMessages = [
                { role: 'system', content: systemContent + FINAL_SYSTEM_APPEND },
                ...history,
                currentUserMsg,
                ...toolExecutionMessages,
            ];

            consol.info(`[階段 3] 最終輸出 LLM 呼叫 (${toolExecutionMessages.length} 條工具訊息, model=${model.model})`);
            const finalChoice = await callLLM(finalMessages, false); // 不帶 tool_ids，禁止工具調用
            fullReply = cleanContent(finalChoice.message?.content || '');
        }

        // ====== 輸出使用紀錄 ======
        if (usageLog.length > 0) {
            consol.success(`📋 本次使用紀錄 (共 ${usageLog.length} 項)：`);
            usageLog.forEach((entry, i) => {
                if (entry.type === 'Skill') {
                    consol.info(`  #${i + 1} [${entry.type}] ${entry.name}`);
                } else {
                    consol.info(`  #${i + 1} [${entry.type}] ${entry.name} (server: ${entry.server})`);
                }
            });
        }

        // ====== 清除提示訊息 ======
        if (skillPromptMsg) {
            await skillPromptMsg.delete().catch(() => { });
        }

        // 若三階段流程未能產生有效回覆（防禦性處理）
        if (!fullReply) {
            fullReply = '已完成工具調用，但無法產生最終回覆內容。';
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

        consol.success(truncateLog(`[回覆] ${fullReply}`));

        // ====== 儲存對話歷史 ======
        history.push(currentUserMsg);
        history.push({ role: 'assistant', content: fullReply });
        while (history.length > MAX_HISTORY_ROUNDS * 2) {
            history.splice(0, 2);
        }

        const guildName = message && message.guild ? message.guild.name
            : (userInfo ? (userInfo.username || 'WebUser') : 'WebChat');
        const channelName = message && message.channel && message.channel.name ? message.channel.name
            : (userId ? `user_${userId}` : 'WebChannel');
        await saveHistory(channelId, history, guildName, channelName);

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

module.exports = {
    chat,
    getAvailableTools,
    findTools,
    executeToolCall,
    buildMcpoToolMap,
    loadHistory,
    saveHistory,
    clearHistory,
    getHistoryFiles,
    resetHistoryIndex,
    setHistoryIndex,
    getModelsList,
    getCurrentModel,
    setModel,
    MCPO_BASE,
    HISTORY_DIR
};