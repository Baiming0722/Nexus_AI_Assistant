// js/cmd/newchat.js
// 記憶存檔後，開啟新的對話和對話記憶。
// 用法：/newchat

const consol = require('../tool/log');
const { resetHistoryIndex } = require('./chat.js');

async function newchat(message, args) {
    const channelId = message.channel.id;

    try {
        await resetHistoryIndex(channelId);
        consol.success(`[newchat] 頻道 ${channelId} 已重置為新對話`);
        await message.channel.send(`✨ 記憶已存檔。為您開啟全新的對話！`);
    } catch (err) {
        consol.error(`[newchat] 重置失敗: ${err.message}`);
        await message.channel.send(`❌ 開啟新對話失敗：${err.message}`);
    }
}

module.exports = { newchat };
