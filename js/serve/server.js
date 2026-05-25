var express = require('express');
var app = express();
var http = require('http');
var SerVer = http.createServer(app);
var { Server } = require("socket.io");
const bcrypt = require('bcrypt');
const session = require('express-session');
const path = require('path');
const fsp = require('fs').promises;

const user = require('../tool/user_data.js');
const { userPermissions } = require('../getdata/discord_Permission.js');
const { chat, getHistoryFiles, clearHistory, resetHistoryIndex, setHistoryIndex, loadHistory, getModelsList, getCurrentModel, setModel, HISTORY_DIR } = require('../cmd/chat.js');
const Shell = require('../tool/shell.js');
const fs = require('../tool/fs.js');
const consol = require('../tool/log');
const systemMonitor = require('../tool/system_monitor.js');
const { sessionSecret: secret } = require('../data/discorddata.json');
const { startCarService, getLatestCarData, getCarLogBuffer } = require('./car.js');
const { getDiscordClient } = require('../discord.js');

var io = new Server(SerVer, {
    cors: {
        origin: function (origin, callback) {
            // 動態允許來自 IPFS、本機開發端點 (localhost/127.0.0.1)、Tauri、ngrok 的跨域連線
            if (!origin || /localhost|127\.0\.0\.1/.test(origin) || /tauri:\/\//.test(origin) || /ipfs/.test(origin) || /filegear-sg\.me/.test(origin) || /ngrok-free\.(app|dev)/.test(origin)) {
                callback(null, origin || true);
            } else {
                callback(null, false);
            }
        },
        credentials: true
    }
});
/*instrument(io, {
    auth: false
});*/
var rootcmd;
var userid = {};
var usersMap = {};

const { REDIRECT_URI } = require('../data/discorddata.json');
const isLocal = REDIRECT_URI.includes('localhost');

app.set('trust proxy', 1); // 信任代理伺服器 (確保反向代理下能正確發送 secure cookie)
const sessionMiddleware = session({
    secret: secret,
    resave: true,
    saveUninitialized: true,
    proxy: true,
    cookie: {
        sameSite: isLocal ? 'lax' : 'none',
        secure: isLocal ? false : true,
        maxAge: 1000 * 60 * 60 * 24 * 7
    }
});
async function server() {
    SerVer.listen(3000, () => {
        consol.success("伺服器已上線");
    });
    // 啟動智能車 MQTT 監控服務（注入 Socket.IO 與 Discord client）
    startCarService(io, getDiscordClient).catch(err => consol.error('[Server] 啟動車輛服務失敗:', err.message));
    app.use(sessionMiddleware);
    app.use(express.static(path.join(__dirname, '../web')));
    app.get('/root/-root-%E7%99%BB%E5%85%A5', (req, res) => {// 登入
        res.sendFile(path.join(__dirname, '../web/root/rootlogin.html'));
    });
    app.get('/root/-root-%E9%9D%A2%E6%9D%BF', (req, res) => {// 面板
        res.sendFile(path.join(__dirname, '../web/root/root.html'));
    });
    app.get('/root/-root-%E6%8E%A7%E5%88%B6%E9%9D%A2%E6%9D%BF', (req, res) => {// 控制面板
        res.sendFile(path.join(__dirname, '../web/root/rootcmd.html'));
    });
    app.get('/nkust', (req, res) => {
        res.redirect("https://nkust.localhost:3000/index.html");
    });
    app.get('/chat', (req, res) => {
        res.sendFile(path.join(__dirname, '../web/chat.html'));
    });
    app.get('/logout', (req, res) => {
        req.session.destroy((err) => {
            res.redirect('/');
        });
    });
    app.get('/login', (req, res) => {
        const { clientId } = require('../data/discorddata.json');
        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.get('host');
        const dynamicRedirectUri = `${protocol}://${host}/callback`;

        console.log("登入重定向 URI:", dynamicRedirectUri);
        // 透過 OAuth state 參數動態傳遞客戶端來源 (解決 Tauri 打包後 localhost 變更為 tauri.localhost 的問題)
        const state = req.query.returnUrl ? Buffer.from(req.query.returnUrl).toString('base64') : 'web';
        const authorizationUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&response_type=code&redirect_uri=${encodeURIComponent(dynamicRedirectUri)}&scope=identify+guilds+email+guilds.members.read+guilds.join&state=${state}`;
        res.redirect(authorizationUrl);
    });
    app.get("/callback", async (req, res) => {
        const code = req.query["code"];
        const state = req.query["state"];
        let isApp = false;
        let returnUrl = './';

        if (state && state !== 'web') {
            isApp = true;
            try {
                returnUrl = Buffer.from(state, 'base64').toString('ascii');
            } catch (e) {
                returnUrl = 'http://localhost:1420/chat';
            }
        }

        const protocol = req.headers['x-forwarded-proto'] || req.protocol;
        const host = req.get('host');
        const dynamicRedirectUri = `${protocol}://${host}/callback`;

        console.log("回呼代碼 (Code):", code, "| 來源:", isApp ? 'Tauri APP' : 'Web', "| ReturnURL:", returnUrl);
        console.log("Server.js 動態重定向 URI:", dynamicRedirectUri);
        const userData = await user.login(code, res, dynamicRedirectUri);

        if (userData && userData.userinfo) {
            const uid = userData.userinfo.id;
            req.session.userId = uid;

            // 修正非同步競爭：先讀取並更新全域變數與檔案，再進行跳轉
            userid = await fs.read(path.join(__dirname, '../data/user.json')) || {};
            try {
                userid[uid] = userData;
                await fs.write(path.join(__dirname, '../data/user.json'), userid);
                consol.success(`[Login] 用戶 ${uid} 資料已存入記憶體與檔案`);
            } catch (error) {
                consol.error('儲存或解析JSON時發生錯誤：', error);
            }

            req.session.save(() => {
                res.send(`<html><head><meta http-equiv="refresh" content="0;url=${returnUrl}"></head><body>登入成功，正在跳轉...<script>setTimeout(function(){ window.location.href = "${returnUrl}"; }, 500);</script></body></html>`);
            });
        } else {
            console.error("登入失敗或無法獲取用戶資料，重新導向...");
            res.redirect(returnUrl);
        }
    });
}

io.engine.use(sessionMiddleware);
io.on("connect", async (socket) => {
    const userp = [];
    const session = socket.request.session;
    var j = 0, t;
    usersMap[session.userId] = socket.id;

    if (session && session.userId && userid && userid[session.userId])
        for (var i in userid[session.userId].userguilds) {
            t = userPermissions(userid[session.userId].userguilds[i].permissions_new);
            if (t) {
                userp[j] = i;
                j++;
            }
        }
    else
        socket.emit('reload');
    if (userid && session && session.userId && userid[session.userId]) {
        socket.emit('userinfo', userid[session.userId], userp);
    } else {
        consol.warn("[Socket] 用戶尚未登入或資料不存在");
    }
    socket.on('chat', async (msg, name, uid, attachmentData) => {
        // 將當前使用者的完整 userinfo 傳入 chat()，供個人化記憶使用
        const currentUserData = userid[session.userId] || null;
        // 建立進度回呼函式：將工具執行狀態即時推送至前端
        const statusCallback = (phase, statusMsg) => {
            socket.emit('tool_status', { phase, message: statusMsg });
        };
        // 標準化附件資料（前端未傳入時使用空值）
        const normalizedAttachment = attachmentData && (attachmentData.texts || attachmentData.images)
            ? attachmentData
            : null;
        var result = await chat(null, msg, name, normalizedAttachment, currentUserData, statusCallback);
        socket.emit('rechat', result);
    });

    const getChannelId = () => session.userId ? 'web_' + session.userId : 'cli';

    /**
     * 讀取 history/index.json，回傳 channelId → filename 的對應 Map。
     * 前端用此 Map 判斷哪些檔案屬於當前使用者，實現純前端過濾。
     */
    async function getHistoryIndexMap() {
        try {
            const indexFile = require('path').join(HISTORY_DIR, 'index.json');
            const raw = await fsp.readFile(indexFile, 'utf8');
            return JSON.parse(raw);
        } catch {
            return {};
        }
    }

    socket.on('new_chat', async () => {
        await resetHistoryIndex(getChannelId());
        socket.emit('chat_status', '已開啟新對話');
        socket.emit('history_data', []);
        const files = await getHistoryFiles();
        const indexMap = await getHistoryIndexMap();
        // 傳遞 { files, indexMap }，前端依 indexMap 過濾屬於自己的記憶
        socket.emit('history_list', { files, indexMap });
    });

    socket.on('get_history_list', async () => {
        const files = await getHistoryFiles();
        const indexMap = await getHistoryIndexMap();
        socket.emit('history_list', { files, indexMap });
    });

    socket.on('load_history', async (filename) => {
        const cid = getChannelId();
        if (filename) {
            await setHistoryIndex(cid, filename);
        }
        const history = await loadHistory(cid);
        socket.emit('history_data', history);
    });

    socket.on('delete_history', async () => {
        await clearHistory(getChannelId());
        socket.emit('chat_status', '對話紀錄已刪除');
        socket.emit('history_data', []);
        const files = await getHistoryFiles();
        const indexMap = await getHistoryIndexMap();
        socket.emit('history_list', { files, indexMap });
    });

    socket.on('get_models', async () => {
        socket.emit('models_info', {
            list: await getModelsList(),
            current: getCurrentModel()
        });
    });

    socket.on('set_model', async (modelKey) => {
        const success = setModel(modelKey);
        socket.emit('chat_status', success ? `已切換模型至 ${modelKey}` : '模型切換失敗');
        socket.emit('models_info', {
            list: await getModelsList(),
            current: getCurrentModel()
        });
    });

    // 前端主動請求最新車輛資料與歷史日誌（用於頁面初次載入時同步狀態）
    socket.on('car_data_request', () => {
        const latest = getLatestCarData();
        if (latest) {
            socket.emit('car_status', latest);
        }
        // 將緩衝的歷史日誌一次性推送給新連線的前端
        const logHistory = getCarLogBuffer();
        if (logHistory.length > 0) {
            socket.emit('car_log_history', logHistory);
        }
    });

    socket.on('rootcheck', () => {
        if (!session.root)
            socket.emit('rootreload');
        else {
            systemMonitor.startMonitoring(socket);
            rootcmd = new Shell();
        }
    });
    socket.on('rootlogin', async (account, password) => {
        const user = await fs.read(path.join(__dirname, '../data/root.json'));

        // 帳號不存在時，提早返回並通知前端，避免存取 undefined.password 造成 TypeError
        if (!user[account]) {
            consol.warn(`[rootlogin] 帳號不存在：${account}`);
            socket.emit('rootlogin_fail', '帳號或密碼錯誤');
            return;
        }

        bcrypt.compare(password, user[account].password, function (err, result) {
            if (err) {
                consol.error(`[rootlogin] bcrypt 比對錯誤：`, err);
                socket.emit('rootlogin_fail', '伺服器內部錯誤');
                return;
            }
            if (result) {
                session.root = user[account].name;
                session.save();
                socket.emit('rootreload');
            } else {
                consol.warn(`[rootlogin] 密碼錯誤，帳號：${account}`);
                socket.emit('rootlogin_fail', '帳號或密碼錯誤');
            }
        });
    });
    socket.on("cmdreq", async (value) => {
        try {
            rootcmd.on('stdout', (data) => {
                socket.emit('rootres', data);
            });
            rootcmd.on('stderr', (data) => {
                socket.emit('rootres', data);
            });
            rootcmd.on('close', (code) => {
                socket.emit('rootres', 'exit ' + code);
            });
            rootcmd.exec(value);
        } catch (error) {
            consol.error("error");
        }
    });
    socket.on('disconnect', (reason) => {
        if (session.root) {
            systemMonitor.clientDisconnected();
            rootcmd?.close();
        }
        if (reason === 'transport close')
            setTimeout(() => {
                if (usersMap[session.userId] === socket.id) {
                    delete usersMap[session.userId];
                    consol.warn('User 丟失', session.userId);
                    session.destroy((err) => { });
                } else {
                    consol.success('User 重新連接:', socket.id);
                }
            }, 60000);
    });
});
module.exports = {
    server
};
