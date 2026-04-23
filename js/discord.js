// js/discord.js
const login = require("./data/discorddata.json");
const discord = require("discord.js");
const fs = require('./tool/fs');
const path = require('path');
const consol = require('./tool/log');
const axios = require('axios');
const { getAvailableTools } = require('./cmd/chat.js');

// 支援的附件副檔名
const TEXT_EXTS = ['.txt', '.json', '.md'];
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png'];

/**
 * 從 Discord 訊息中下載所有支援的附件
 * 回傳 { texts: [{name, content}], images: [{name, base64, mimeType}] }
 */
async function collectAttachments(message) {
  const result = { texts: [], images: [] };
  if (!message.attachments || message.attachments.size === 0) return result;

  for (const [, attachment] of message.attachments) {
    const ext = path.extname(attachment.name || '').toLowerCase();
    const url = attachment.url;

    try {
      if (TEXT_EXTS.includes(ext)) {
        // 文字類附件：下載為純字串
        const resp = await axios.get(url, { responseType: 'text', timeout: 15000 });
        result.texts.push({ name: attachment.name, content: resp.data });
        consol.info(`[附件] 已讀取文字附件: ${attachment.name} (${String(resp.data).length} 字元)`);
      } else if (IMAGE_EXTS.includes(ext)) {
        // 圖片類附件：下載為 base64
        const resp = await axios.get(url, { responseType: 'arraybuffer', timeout: 15000 });
        const base64 = Buffer.from(resp.data).toString('base64');
        const mimeType = ext === '.png' ? 'image/png' : 'image/jpeg';
        result.images.push({ name: attachment.name, base64, mimeType });
        consol.info(`[附件] 已讀取圖片附件: ${attachment.name} (${base64.length} bytes base64)`);
      } else {
        consol.warn(`[附件] 不支援的附件類型: ${attachment.name}，已略過`);
      }
    } catch (err) {
      consol.error(`[附件] 下載 ${attachment.name} 失敗: ${err.message}`);
    }
  }

  return result;
}

const client = new discord.Client({
  intents: [
    discord.GatewayIntentBits.Guilds,
    discord.GatewayIntentBits.DirectMessages,
    discord.GatewayIntentBits.GuildBans,
    discord.GatewayIntentBits.GuildMessages,
    discord.GatewayIntentBits.MessageContent,
    discord.GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [discord.Partials.Message, discord.Partials.Channel, discord.Partials.Reaction],
});

var cmd = {};
var files = fs.readdirsync(path.join(__dirname, 'cmd'), ".js");
for (var i of files) {
  var command = require(`./cmd/${i}`);
  var baseName = path.basename(i, ".js");
  cmd[baseName.toLowerCase()] = command[baseName];
  consol.success(`引入${i}指令`);
}

function discord_start() {
  client.login(login.token);

  client.once('clientReady', async () => {  // 改為 once 並加上 async
    client.user.setStatus('idle');
    consol.success(`已登入 ${client.user.tag}`);
    consol.success(`────────────────────────────────────────────────────────────`);
  });

  client.on('messageCreate', async message => {
    // 只處理非機器人的訊息
    if (message.author.bot) return;

    // 處理 !findtool 指令
    if (message.content.startsWith('!findtool')) {
      const keyword = message.content.split(' ')[1] || 'mcp';
      try {
        const { findTools } = require('./cmd/chat.js');
        const tools = await findTools(keyword);
        await message.reply(`找到 ${tools.length} 個 "${keyword}" 相關工具`);
      } catch (err) {
        consol.error('查找工具失敗:', err.message);
        await message.reply('查找工具時發生錯誤');
      }
      return;  // 處理完畢，直接返回
    }

    // 處理一般指令
    if (message.content.startsWith(login.prefix)) {
      const args = message.content.slice(login.prefix.length).trim().split(/ +/g);
      const command = args.shift().toLowerCase();
      consol.info(`${'─'.repeat(60)}`);
      if (cmd[command]) {
        const userName = message.member?.displayName || message.author.username;
        consol.info(`[${userName}] 請求指令: ${command} 參數:{${args}}`);

        // 收集附件（txt/json/md/jpg/png）
        let attachmentData = { texts: [], images: [] };
        if (message.attachments && message.attachments.size > 0) {
          attachmentData = await collectAttachments(message);
          consol.info(`[附件] 本次共收到: ${attachmentData.texts.length} 個文字附件, ${attachmentData.images.length} 個圖片附件`);
        }

        try {
          if (command == "redocmd") {
            var newcmd = await cmd[command](message);
            Object.keys(cmd).forEach(k => delete cmd[k]);
            Object.assign(cmd, newcmd);
          } else {
            // 將附件資料作為第四個參數傳入（args 為第二個，client 為第三個）
            cmd[command](message, args, client, attachmentData);
          }
        } catch (error) {
          consol.error(error.message);
        }
      }
    }
  });
}

module.exports = {
  discord_start
};