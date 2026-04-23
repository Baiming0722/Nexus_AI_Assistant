// js/serve/car.js
// IoT 智能車 MQTT 監控服務
// 訂閱 iot/car/status 主題，接收車輛遙測資料，定期寫入本地 JSON 檔案並廣播至前端
// 注意：本模組所有日誌僅廣播至前端 UI，不輸出至 terminal

const mqtt = require('mqtt');
const path = require('path');
const fs = require('fs').promises;

// ============================================================================
// 配置常數
// ============================================================================
const CONFIG = {
    /** MQTT Broker 位址（與 main.cpp 設定一致） */
    BROKER: 'mqtt://broker.emqx.io:1883',
    /** 狀態訂閱主題 */
    TOPIC_STATUS: 'trashbin/status',
    /** MQTT QoS 等級 */
    QOS: 1,
    /** 心跳間隔（秒） */
    KEEPALIVE: 60,
    /** 資料接收間隔（毫秒）：每 5 秒更新一次 */
    DATA_INTERVAL_MS: 5000,
    /** car_log.json 最大紀錄筆數 */
    MAX_LOG_ENTRIES: 120,
    /** 資料儲存目錄 */
    DATA_DIR: path.join(__dirname, '../data/car'),
    /** 最新狀態檔案路徑（僅保留 1 筆） */
    STATUS_FILE: path.join(__dirname, '../data/car/car_status.json'),
    /** 歷史紀錄檔案路徑（最多 120 筆） */
    LOG_FILE: path.join(__dirname, '../data/car/car_log.json'),
    /** 重連延遲基礎值（毫秒） */
    RECONNECT_DELAY_MS: 5000,
};

// ============================================================================
// 模組內部狀態
// ============================================================================

/** 最新一筆車輛資料（接收後立即更新） */
let latestCarData = null;

/** 待寫入的暫存資料（每 5 秒批次寫入一次） */
let pendingData = null;

/** 5 秒寫入定時器 */
let writeTimer = null;

/** Socket.IO 伺服器實例（由 startCarService 注入） */
let ioInstance = null;

// ============================================================================
// 前端日誌系統（取代 terminal 輸出）
// ============================================================================

/** 日誌環形緩衝：保留最近 50 筆，供新連線者補收歷史日誌 */
const carLogBuffer = [];
const MAX_LOG_BUFFER = 50;

/**
 * 將日誌發送至前端 UI，不輸出至 terminal
 *
 * @param {'info'|'success'|'warn'|'error'} level 日誌等級
 * @param {string} message 日誌訊息
 */
function carLog(level, message) {
    const entry = {
        level,
        message,
        time: new Date().toISOString(),
    };

    // 存入環形緩衝（超過上限時移除最舊的一筆）
    carLogBuffer.push(entry);
    if (carLogBuffer.length > MAX_LOG_BUFFER) {
        carLogBuffer.shift();
    }

    // 廣播至所有已連線的前端
    if (ioInstance) {
        ioInstance.emit('car_log', entry);
    }
}

// ============================================================================
// 檔案讀寫工具
// ============================================================================

/**
 * 確保資料目錄存在，若不存在則建立
 */
async function ensureDataDir() {
    try {
        await fs.mkdir(CONFIG.DATA_DIR, { recursive: true });
    } catch (err) {
        if (err.code !== 'EEXIST') {
            carLog('error', `建立資料目錄失敗: ${err.message}`);
            throw err;
        }
    }
}

/**
 * 將最新狀態寫入 car_status.json（始終只保留 1 筆）
 * @param {object} data 車輛遙測資料
 */
async function writeStatusFile(data) {
    try {
        await fs.writeFile(CONFIG.STATUS_FILE, JSON.stringify(data, null, 2), 'utf8');
        carLog('success', 'car_status.json 已更新');
    } catch (err) {
        carLog('error', `寫入 car_status.json 失敗: ${err.message}`);
    }
}

/**
 * 將新資料追加至 car_log.json，並維持最多 MAX_LOG_ENTRIES 筆
 * @param {object} data 車輛遙測資料
 */
async function appendLogFile(data) {
    let log = [];

    // 嘗試讀取現有紀錄
    try {
        const raw = await fs.readFile(CONFIG.LOG_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
            log = parsed;
        }
    } catch (err) {
        // 檔案不存在或格式錯誤時，從空陣列開始
        if (err.code !== 'ENOENT') {
            carLog('error', `讀取 car_log.json 失敗: ${err.message}`);
        }
    }

    // 追加新資料
    log.push(data);

    // 超過上限時，刪除最舊的紀錄（從頭部移除）
    if (log.length > CONFIG.MAX_LOG_ENTRIES) {
        log = log.slice(log.length - CONFIG.MAX_LOG_ENTRIES);
    }

    try {
        await fs.writeFile(CONFIG.LOG_FILE, JSON.stringify(log, null, 2), 'utf8');
        carLog('success', `car_log.json 已更新（共 ${log.length} 筆）`);
    } catch (err) {
        carLog('error', `寫入 car_log.json 失敗: ${err.message}`);
    }
}

// ============================================================================
// 資料處理
// ============================================================================

// 原本的 JSON 格式化函數已移除，改由 on('message') 中直接解析 CSV 格式

/**
 * 每 5 秒定期執行的寫入工作
 * 將暫存的最新資料寫入檔案並廣播至前端
 */
async function periodicWrite() {
    if (!pendingData) {
        // 若此週期內沒有收到新資料，略過寫入
        carLog('info', '本週期未收到新資料，略過寫入');
        return;
    }

    const dataToWrite = pendingData;
    pendingData = null; // 清空暫存

    // 並行寫入兩個檔案
    await Promise.all([
        writeStatusFile(dataToWrite),
        appendLogFile(dataToWrite),
    ]);

    // 透過 Socket.IO 廣播至所有已連線的前端
    if (ioInstance) {
        ioInstance.emit('car_status', dataToWrite);
        carLog('info', '已廣播垃圾桶資料至前端');
    }
}

// ============================================================================
// MQTT 客戶端
// ============================================================================

/**
 * 建立並啟動 MQTT 客戶端，訂閱車輛狀態主題
 */
function startMqttClient() {
    const clientId = `js_car_service_${Date.now()}`;

    carLog('info', `正在連線至 MQTT Broker: ${CONFIG.BROKER}`);

    const client = mqtt.connect(CONFIG.BROKER, {
        clientId,
        clean: true,
        keepalive: CONFIG.KEEPALIVE,
        reconnectPeriod: CONFIG.RECONNECT_DELAY_MS, // 自動重連間隔
        connectTimeout: 10_000,
    });

    // 連線成功
    client.on('connect', () => {
        carLog('success', `已連線至 MQTT Broker，訂閱主題: ${CONFIG.TOPIC_STATUS}`);
        client.subscribe(CONFIG.TOPIC_STATUS, { qos: CONFIG.QOS }, (err) => {
            if (err) {
                carLog('error', `訂閱主題失敗: ${err.message}`);
            } else {
                carLog('success', `成功訂閱 ${CONFIG.TOPIC_STATUS}`);
            }
        });
    });

    // 接收訊息
    client.on('message', (topic, payload) => {
        if (topic !== CONFIG.TOPIC_STATUS) return;

        try {
            const textPayload = payload.toString('utf8');
            const receivedAt = new Date().toISOString();
            
            // 解析 CSV 格式: recyclableCount,nonRecyclableCount,total,lastUpdate,alertActive
            const parts = textPayload.split(',');
            if (parts.length >= 5) {
                const formattedData = {
                    receivedAt,
                    recyclableCount: parseInt(parts[0], 10) || 0,
                    nonRecyclableCount: parseInt(parts[1], 10) || 0,
                    total: parseInt(parts[2], 10) || 0,
                    lastUpdate: parts[3],
                    alertActive: parseInt(parts[4], 10) === 1,
                    raw: textPayload
                };

                // 更新最新資料（供前端即時查詢用）
                latestCarData = formattedData;
                // 暫存待週期寫入
                pendingData = formattedData;

                carLog('info', `收到資料 | 可回收: ${formattedData.recyclableCount} | 不可回收: ${formattedData.nonRecyclableCount} | 總量: ${formattedData.total} | 狀態: ${formattedData.alertActive ? '滿桶警告' : '正常'}`);
            } else {
                carLog('error', `解析 MQTT 訊息失敗（格式錯誤）: ${textPayload}`);
            }
        } catch (parseErr) {
            carLog('error', `處理 MQTT 訊息失敗: ${parseErr.message}`);
        }
    });

    // 連線錯誤
    client.on('error', (err) => {
        carLog('error', `MQTT 連線錯誤: ${err.message}`);
    });

    // 重連中
    client.on('reconnect', () => {
        carLog('warn', '正在嘗試重新連線至 MQTT Broker...');
    });

    // 斷線
    client.on('offline', () => {
        carLog('warn', 'MQTT 客戶端已離線');
    });

    return client;
}

// ============================================================================
// 服務入口
// ============================================================================

/**
 * 啟動智能車 MQTT 監控服務
 *
 * @param {import('socket.io').Server} io Socket.IO 伺服器實例，用於廣播資料至前端
 */
async function startCarService(io) {
    ioInstance = io;

    // 確保資料目錄存在
    await ensureDataDir();

    // 啟動 MQTT 客戶端
    startMqttClient();

    // 啟動每 5 秒定期寫入的定時器
    writeTimer = setInterval(periodicWrite, CONFIG.DATA_INTERVAL_MS);

    carLog('success', '智慧垃圾桶監控服務已啟動（每 5 秒寫入一次）');
}

/**
 * 取得最新一筆車輛資料（供其他模組查詢用）
 * @returns {object|null} 最新車輛資料，尚未收到資料時為 null
 */
function getLatestCarData() {
    return latestCarData;
}

/**
 * 取得日誌環形緩衝（供新連線者補收歷史日誌）
 * @returns {Array<{level: string, message: string, time: string}>}
 */
function getCarLogBuffer() {
    return [...carLogBuffer];
}

module.exports = {
    startCarService,
    getLatestCarData,
    getCarLogBuffer,
};
