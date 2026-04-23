// js/cmd/chat/history.js
// 對話歷史管理

const fsp = require('fs').promises;
const nfs = require('fs');
const consol = require('../../tool/log');
const path = require('path');

const HISTORY_DIR = path.join(__dirname, '../../data/history');
const MAX_HISTORY_ROUNDS = 20; // 每頻道最多保留的輪數 (1輪 = 1 user + 1 assistant)

async function getIndex() {
    try {
        await fsp.mkdir(HISTORY_DIR, { recursive: true });
        const indexFile = path.join(HISTORY_DIR, 'index.json');
        const raw = await fsp.readFile(indexFile, 'utf8');
        return JSON.parse(raw);
    } catch {
        return {};
    }
}

async function saveIndex(indexData) {
    try {
        await fsp.mkdir(HISTORY_DIR, { recursive: true });
        const indexFile = path.join(HISTORY_DIR, 'index.json');
        await fsp.writeFile(indexFile, JSON.stringify(indexData, null, 2), 'utf8');
    } catch (err) {
        consol.warn(`[歷史] 儲存 index.json 失敗: ${err.message}`);
    }
}

async function getHistoryFiles() {
    try {
        const files = await fsp.readdir(HISTORY_DIR);
        return files.filter(f => f.endsWith('.json') && f !== 'index.json');
    } catch {
        return [];
    }
}

/**
 * 讀取指定頻道的對話歷史
 * @param {string} channelId
 * @returns {Array} messages 陣列
 */
async function loadHistory(channelId) {
    try {
        const idx = await getIndex();
        let fileName = idx[channelId];
        let file;

        if (fileName) {
            file = path.join(HISTORY_DIR, fileName);
        }

        if (!fileName || !nfs.existsSync(file)) {
             return [];
        }

        const raw = await fsp.readFile(file, 'utf8');
        const history = JSON.parse(raw);
        consol.info(`[歷史] 載入頻道 ${channelId} 的對話歷史 (${history.length} 條訊息) 來自 ${path.basename(file)}`);
        consol.info(`${'─'.repeat(60)}`);
        return Array.isArray(history) ? history : [];
    } catch {
        return [];
    }
}

/**
 * 儲存指定頻道的對話歷史
 * @param {string} channelId
 * @param {Array} history
 * @param {string} guildName
 * @param {string} channelName
 */
async function saveHistory(channelId, history, guildName = 'Server', channelName = 'Channel') {
    try {
        await fsp.mkdir(HISTORY_DIR, { recursive: true });
        const idx = await getIndex();
        let fileName = idx[channelId];

        if (!fileName) {
            const allFiles = await getHistoryFiles();
            let maxId = -1;
            for (let f of allFiles) {
                const match = f.match(/^(\d+)_/);
                if (match) {
                    const id = parseInt(match[1], 10);
                    if (id > maxId) maxId = id;
                }
            }
            const newId = maxId + 1;
            const date = new Date();
            const timeStr = `${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`;
            
            const safeGuild = guildName.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '').substring(0, 15) || 'Server';
            const safeCh = channelName.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '').substring(0, 15) || 'Channel';
            
            fileName = `${newId}_${safeGuild}_${safeCh}_${timeStr}.json`;
            idx[channelId] = fileName;
            await saveIndex(idx);
        }

        const file = path.join(HISTORY_DIR, fileName);
        await fsp.writeFile(file, JSON.stringify(history, null, 2), 'utf8');
        consol.info(`[歷史] 已儲存頻道 ${channelId} 的對話歷史 (${history.length} 條訊息) 至 ${fileName}`);
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
            const idx = await getIndex();
            let fileName = idx[channelId];
            if (fileName) {
                const file = path.join(HISTORY_DIR, fileName);
                await fsp.unlink(file).catch(() => {});
                deleted = 1;
            }
            
            // Delete legacy file just in case
            await fsp.unlink(path.join(HISTORY_DIR, `${channelId}.json`)).catch(() => {});
            
            if (idx[channelId]) {
                 delete idx[channelId];
                 await saveIndex(idx);
            }
        } else {
            const files = await getHistoryFiles();
            for (const f of files) {
                try {
                    await fsp.unlink(path.join(HISTORY_DIR, f));
                    deleted++;
                } catch { errors++; }
            }
            await saveIndex({});
            
            const allRaw = await fsp.readdir(HISTORY_DIR).catch(() => []);
            for (const f of allRaw) {
               if (f.endsWith('.json') && f !== 'index.json') {
                   try {
                       await fsp.unlink(path.join(HISTORY_DIR, f));
                   } catch { }
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

/**
 * 重置指定頻道的對話索引，開啟新對話
 * @param {string} channelId
 * @param {string} guildName
 * @param {string} channelName
 */
async function resetHistoryIndex(channelId, guildName = 'WebUser', channelName = 'WebChannel') {
    try {
        await fsp.mkdir(HISTORY_DIR, { recursive: true });
        const idx = await getIndex();
        
        const allFiles = await getHistoryFiles();
        let maxId = -1;
        for (let f of allFiles) {
            const match = f.match(/^(\d+)_/);
            if (match) {
                const id = parseInt(match[1], 10);
                if (id > maxId) maxId = id;
            }
        }
        const newId = maxId + 1;
        const date = new Date();
        const timeStr = `${String(date.getHours()).padStart(2, '0')}${String(date.getMinutes()).padStart(2, '0')}`;
        
        const safeGuild = guildName.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '').substring(0, 15) || 'Server';
        const safeCh = channelName.replace(/[^a-zA-Z0-9_\u4e00-\u9fa5]/g, '').substring(0, 15) || 'Channel';
        
        const fileName = `${newId}_${safeGuild}_${safeCh}_${timeStr}.json`;
        
        // Save empty history file immediately
        const file = path.join(HISTORY_DIR, fileName);
        await fsp.writeFile(file, "[]", 'utf8');

        idx[channelId] = fileName;
        await saveIndex(idx);
        consol.info(`[歷史] 頻道 ${channelId} 已開啟新對話檔案: ${fileName}`);
    } catch (err) {
        consol.warn(`[歷史] 重置索引失敗: ${err.message}`);
    }
}

/**
 * 設置指定頻道的對話索引為特定檔案
 * @param {string} channelId
 * @param {string} filename
 */
async function setHistoryIndex(channelId, filename) {
    try {
        const idx = await getIndex();
        idx[channelId] = filename;
        await saveIndex(idx);
        consol.info(`[歷史] 頻道 ${channelId} 已載入對話紀錄: ${filename}`);
    } catch (err) {
        consol.warn(`[歷史] 載入對話歷史失敗: ${err.message}`);
    }
}

module.exports = {
    HISTORY_DIR,
    MAX_HISTORY_ROUNDS,
    getHistoryFiles,
    loadHistory,
    saveHistory,
    clearHistory,
    resetHistoryIndex,
    setHistoryIndex
};
