// js/index.js
const { discord_start } = require('./discord.js');
const { server } = require('./serve/server.js');

// 啟動網頁伺服器 (Port 3000)
server();

// 啟動 Discord 機器人
discord_start();