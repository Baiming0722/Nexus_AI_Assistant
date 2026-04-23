// js/cmd/memory.js
// 統一的記憶管理指令
// 用法：
// /memory                    # 顯示所有跟記憶有關的指令
// /memory list               # 顯示保存的記憶(不完整顯示)
// /memory files              # 顯示已經儲存的記憶檔案清單
// /memory clear              # 清除本頻道記憶
// /memory clear new n        # 清除最新的 n 筆記憶
// /memory clear old n        # 清除最舊的 n 筆記憶
// /memory clear all          # 清除所有頻道記憶
// /memory mcp                # 顯示保存的 MCP 記憶
// /memory mcp clear          # 清除 MCP 記憶
// /memory mcp clear new n    # 清除最新的 n 筆 MCP 記憶
// /memory mcp clear old n    # 清除最舊的 n 筆 MCP 記憶
// /memory mcp list           # 顯示保存的 MCP 記憶(不完整顯示)


const axios = require('axios');
const path = require('path');
const fsp = require('fs').promises;
const nfs = require('fs');
const consol = require('../tool/log');
const { clearHistory, loadHistory, saveHistory, getHistoryFiles, MCPO_BASE, HISTORY_DIR } = require('./chat.js');

function truncateText(text, maxLength = 100) {
    if (!text) return '';
    let str = String(text).replace(/\n/g, ' ');
    if (str.length > maxLength) {
        return str.substring(0, maxLength) + '...';
    }
    return str;
}

function truncateEntity(entity) {
    let name = entity.name || 'Unknown';
    let type = entity.entityType || 'Unknown';
    let obs = (entity.observations || []).join(', ');
    return `[${type}] ${name}: ${truncateText(obs, 80)}`;
}

async function memory(message, args) {
    const subCmd = (args && args[0] && args[0].toLowerCase()) || 'help';
    const channelId = message.channel.id;
    const indexFile = path.join(HISTORY_DIR, 'index.json');

    if (subCmd === 'help') {
        const helpText = `**🧠 記憶管理指令 (Memory Commands)**
\`/memory\` - 顯示所有跟記憶有關的指令
\`/memory list\` - 顯示保存的記憶 (不完整顯示)
\`/memory files\` - 顯示已經儲存的記憶檔案清單
\`/memory [ID]\` - 切換並加載指定的記憶檔案
\`/memory clear\` - 清除本頻道記憶
\`/memory clear new n\` - 清除最新的 n 筆記憶
\`/memory clear old n\` - 清除最舊的 n 筆記憶
\`/memory clear all\` - 清除所有頻道記憶
\`/memory mcp\` - 顯示保存的 MCP 記憶
\`/memory mcp clear\` - 清除 MCP 記憶
\`/memory mcp clear new n\` - 清除最新的 n 筆 MCP 記憶
\`/memory mcp clear old n\` - 清除最舊的 n 筆 MCP 記憶
\`/memory mcp list\` - 顯示保存的 MCP 記憶 (不完整顯示)`;
        return await message.channel.send(helpText);
    }

    try {
        if (!isNaN(parseInt(subCmd)) && args[0].match(/^\d+$/)) {
            // 切換記憶
            const targetId = parseInt(subCmd);
            const allFiles = await getHistoryFiles();
            const targetFile = allFiles.find(f => f.startsWith(`${targetId}_`));

            if (!targetFile) {
                return await message.channel.send(`⚠️ 找不到 ID 為 ${targetId} 的記憶檔案。請使用 \`/memory files\` 查看可用檔案。`);
            }

            const fileFullPath = path.join(HISTORY_DIR, targetFile);
            const raw = await fsp.readFile(fileFullPath, 'utf8');
            let historyToLoad = [];
            try {
                historyToLoad = JSON.parse(raw);
            } catch {
                historyToLoad = [];
            }

            // 將 index mapping 指向這個檔案並覆蓋當前
            let idx = {};
            if (nfs.existsSync(indexFile)) {
                idx = JSON.parse(await fsp.readFile(indexFile, 'utf8'));
            }
            idx[channelId] = targetFile;
            await fsp.writeFile(indexFile, JSON.stringify(idx, null, 2), 'utf8');

            consol.success(`[memory] 已切換頻道 ${channelId} 的記憶至 ${targetFile}`);
            return await message.channel.send(`✅ 已成功切換並加載記憶檔案: \`${targetFile}\` (ID: ${targetId} | ${historyToLoad.length} 筆紀錄)`);

        } else if (subCmd === 'files') {
            const allFiles = await getHistoryFiles();
            if (allFiles.length === 0) {
                return await message.channel.send(`ℹ️ 目前沒有任何儲存的記憶檔案`);
            }

            // 讀取目前頻道對應的檔案
            let currentFile = null;
            if (nfs.existsSync(indexFile)) {
                const idx = JSON.parse(await fsp.readFile(indexFile, 'utf8'));
                currentFile = idx[channelId] || null;
            }

            const sorted = allFiles.sort((a, b) => {
                const idA = parseInt(a.split('_')[0]) || 0;
                const idB = parseInt(b.split('_')[0]) || 0;
                return idA - idB;
            });

            let listText = `**📂 可用的記憶檔案 (${sorted.length} 個)**\n使用 \`/memory [ID]\` 切換記憶\n\n`;
            sorted.forEach(f => {
                const id = parseInt(f.split('_')[0]);
                const isCurrent = f === currentFile ? ' ◀ 目前使用中' : '';
                listText += `\`ID: ${id}\` → \`${f}\`${isCurrent}\n`;
            });
            return await message.channel.send(listText.substring(0, 1900));

        } else if (subCmd === 'clear') {
            const scope = args[1] ? args[1].toLowerCase() : '';
            if (scope === 'all') {
                const result = await clearHistory(null);
                let replyText = result.deleted > 0
                    ? `✅ 已清除所有頻道的 JSON 對話歷史（共 ${result.deleted} 個頻道）`
                    : `ℹ️ 沒有找到任何 JSON 對話歷史檔案`;
                if (result.errors > 0) {
                    replyText += `\n⚠️ 有 ${result.errors} 個頻道清除失敗`;
                }
                consol.success(`[memory] ${replyText}`);
                await message.channel.send(replyText);
            } else if (scope === 'new' || scope === 'old') {
                const n = parseInt(args[2]);
                if (isNaN(n) || n <= 0) {
                    return await message.channel.send(`⚠️ 請提供有效的數量，例如 \`/memory clear ${scope} 2\``);
                }
                const history = await loadHistory(channelId);
                if (history.length === 0) {
                    return await message.channel.send(`ℹ️ 本頻道沒有對話歷史可清除`);
                }

                const actualN = Math.min(n, history.length);
                if (scope === 'new') {
                    history.splice(history.length - actualN, actualN);
                } else {
                    history.splice(0, actualN);
                }

                await saveHistory(channelId, history);
                consol.success(`[memory] 頻道 ${channelId} 已清除 ${scope === 'new' ? '最新的' : '最舊的'} ${actualN} 筆記憶`);
                await message.channel.send(`✅ 已清除本頻道${scope === 'new' ? '最新的' : '最舊的'} ${actualN} 筆對話歷史`);
            } else {
                const result = await clearHistory(channelId);
                consol.success(`[memory] 頻道 ${channelId} 已清除所有記憶`);
                await message.channel.send(`✅ 已清除本頻道的 JSON 對話歷史`);
            }

        } else if (subCmd === 'list') {
            // 查出目前頻道對應哪個檔案與 ID
            let currentFile = '（未知）';
            let currentId = '?';
            if (nfs.existsSync(indexFile)) {
                const idx = JSON.parse(await fsp.readFile(indexFile, 'utf8'));
                if (idx[channelId]) {
                    currentFile = idx[channelId];
                    currentId = parseInt(currentFile.split('_')[0]) || '?';
                }
            }

            const history = await loadHistory(channelId);
            if (history.length === 0) {
                return await message.channel.send(`ℹ️ 本頻道目前沒有儲存任何對話歷史`);
            }

            let listText = `**📖 本頻道對話歷史 (ID: ${currentId} | 檔案: \`${currentFile}\` | ${history.length} 筆)**\n`;
            history.forEach((msg, idx) => {
                let content = typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content);
                let roleName = msg.originalName ? `${msg.role.toUpperCase()} (${msg.originalName})` : msg.role.toUpperCase();
                listText += `\`[${idx + 1}] ${roleName}\` ${truncateText(content, 60)}\n`;
            });
            await message.channel.send(listText.substring(0, 1900));

        } else if (subCmd === 'mcp') {
            const mcpAction = args[1] ? args[1].toLowerCase() : 'list_full';

            consol.info(`[memory mcp] 正在讀取 MCP memory... action=${mcpAction}`);
            let entities = [];
            let relations = [];
            try {
                const graphResp = await axios.post(`${MCPO_BASE}/memory/read_graph`, {}, { timeout: 15000 });
                const data = graphResp.data;
                entities = data?.entities || data?.data?.entities || [];
                relations = data?.relations || data?.data?.relations || [];
                consol.info(`[memory mcp] 發現 ${entities.length} 個實體`);
            } catch (err) {
                consol.warn(`[memory mcp] 無法讀取: ${err.message}`);
                return await message.channel.send(`⚠️ 無法連線至 MCP memory server（請確認 MCPO port 7861 是否運行）`);
            }

            if (mcpAction === 'list_full' || mcpAction === 'list') {
                if (entities.length === 0) {
                    return await message.channel.send(`ℹ️ MCP memory 中沒有任何實體`);
                }

                let listText = `**🧠 MCP Memory 實體 (${entities.length} 筆)**\n`;
                const maxDisplay = mcpAction === 'list_full' ? 50 : 20;

                entities.slice(0, maxDisplay).forEach((e, idx) => {
                    if (mcpAction === 'list_full') {
                        listText += `\`[${idx + 1}]\` ${e.name} (${e.entityType})\n`;
                    } else {
                        listText += `\`[${idx + 1}]\` ${truncateEntity(e)}\n`;
                    }
                });
                if (entities.length > maxDisplay) {
                    listText += `\n*...還有 ${entities.length - maxDisplay} 筆未顯示*`;
                }
                await message.channel.send(listText.substring(0, 1900));

            } else if (mcpAction === 'clear') {
                if (entities.length === 0) {
                    return await message.channel.send(`ℹ️ MCP memory 中沒有任何實體，無需清除`);
                }

                const mcpScope = args[2] ? args[2].toLowerCase() : 'all';
                let targetEntities = [];
                let clearDesc = '';

                if (mcpScope === 'all') {
                    targetEntities = entities;
                    clearDesc = `所有 ${targetEntities.length} 個實體`;
                } else if (mcpScope === 'new' || mcpScope === 'old') {
                    const n = parseInt(args[3]);
                    if (isNaN(n) || n <= 0) {
                        return await message.channel.send(`⚠️ 請提供有效的數量，例如 \`robot~ memory mcp clear ${mcpScope} 2\``);
                    }
                    const actualN = Math.min(n, entities.length);
                    // 假設最後面的是最新的
                    if (mcpScope === 'new') {
                        targetEntities = entities.slice(entities.length - actualN);
                        clearDesc = `最新的 ${actualN} 個實體`;
                    } else {
                        targetEntities = entities.slice(0, actualN);
                        clearDesc = `最舊的 ${actualN} 個實體`;
                    }
                } else {
                    targetEntities = entities;
                    clearDesc = `所有 ${targetEntities.length} 個實體`;
                }

                const entityNames = targetEntities.map(e => e.name).filter(Boolean);
                consol.info(`[memory mcp] 準備刪除實體: ${entityNames.join(', ')}`);

                if (entityNames.length === 0) {
                    return await message.channel.send(`ℹ️ 沒有找到可刪除的目標實體`);
                }

                try {
                    await axios.post(`${MCPO_BASE}/memory/delete_entities`, { entityNames }, { timeout: 15000 });
                    consol.success(`[memory mcp] 已清除 MCP memory 中的 ${clearDesc}`);
                    await message.channel.send(`✅ 已循序清除 MCP memory 中的 ${clearDesc}`);
                } catch (delErr) {
                    consol.error(`[memory mcp] 刪除失敗: ${delErr.message}`);
                    await message.channel.send(`❌ 刪除 MCP memory 實體失敗：${delErr.message}`);
                }
            } else {
                await message.channel.send(`⚠️ 未知的 MCP 操作，請輸入 \`/memory\` 查看說明`);
            }
        } else {
            await message.channel.send(`⚠️ 未知的操作，請輸入 \`/memory\` 查看說明`);
        }

    } catch (err) {
        consol.error(`[memory] 失敗: ${err.message}`);
        await message.channel.send(`❌ 記憶操作失敗：${err.message}`);
    }
}

module.exports = { memory };