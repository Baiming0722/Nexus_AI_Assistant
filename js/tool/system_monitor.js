// system_monitor.js - 極低效能的系統監控模組

const si = require('systeminformation');
const os = require('os');
const consol = require('./log');

// 資料緩存
let staticCache = null;      // 靜態資料（幾乎不變）
let semiStaticCache = null;  // 半靜態資料（偶爾變化）
let dynamicCache = null;     // 動態資料（經常變化）
let lastNetworkStats = null; // 上次網路統計

// 緩存時間戳
let staticLastUpdated = 0;
let semiStaticLastUpdated = 0;
let dynamicLastUpdated = 0;

// 更新間隔（毫秒）
const STATIC_UPDATE_INTERVAL = 24 * 60 * 60 * 1000;   // 靜態資料每24小時更新一次
const SEMI_STATIC_UPDATE_INTERVAL = 30 * 60 * 1000;   // 半靜態資料每30分鐘更新一次
const DYNAMIC_UPDATE_INTERVAL = 10 * 1000;            // 動態資料每10秒更新一次

// 監控狀態
let isMonitoring = false;
let activeClients = 0;
let monitorInterval = null;

// 取得靜態系統資訊（幾乎不變的資料）
async function getStaticInfo() {
    const now = Date.now();
    
    // 如果緩存有效，直接返回
    if (staticCache && (now - staticLastUpdated < STATIC_UPDATE_INTERVAL)) {
        return staticCache;
    }
    
    try {
        // 使用簡化版的系統資訊，避免深度掃描
        const [system, os] = await Promise.all([
            si.system(),
            si.osInfo()
        ]);
        // 只保留必要欄位
        staticCache = {
            system: {
                manufacturer: system.manufacturer || 'Unknown',
                model: system.model || 'Unknown'
            },
            os: {
                platform: os.distro || 'Unknown',
                release: os.release || 'Unknown'
            }
        };
        
        staticLastUpdated = now;
        return staticCache;
    } catch (error) {
        consol.error('靜態資訊收集錯誤:', error.message);
        // 返回最後一次有效的緩存或空對象
        return staticCache || { system: {}, os: {} };
    }
}

// 取得半靜態系統資訊（偶爾變化的資料）
async function getSemiStaticInfo() {
    const now = Date.now();
    
    // 如果緩存有效，直接返回
    if (semiStaticCache && (now - semiStaticLastUpdated < SEMI_STATIC_UPDATE_INTERVAL)) {
        return semiStaticCache;
    }
    
    try {
        // 收集較少變化的資訊
        const [disk, gpu] = await Promise.all([
            si.diskLayout(),
            si.graphics()
        ]);
        
        // 簡化磁碟資訊
        const simplifiedDisks = (disk || []).map(d => ({
            name: d.name || 'Disk',
            size: d.size || 0,
            model: d.model || 'Unknown',
            interfaceType: d.interfaceType || 'Unknown'
        }));
        
        // 簡化顯卡資訊
        const simplifiedGpu = {
            controllers: (gpu && gpu.controllers ? gpu.controllers : []).map(g => ({
                model: g.model || 'Unknown GPU',
                vendor: g.vendor || 'Unknown',
                vram: g.vram || 0,
                driverVersion: g.driverVersion || 'Unknown'
            }))
        };
        
        semiStaticCache = {
            disk: simplifiedDisks,
            gpu: simplifiedGpu
        };
        
        semiStaticLastUpdated = now;
        return semiStaticCache;
    } catch (error) {
        consol.error('半靜態資訊收集錯誤:', error.message);
        // 返回最後一次有效的緩存或空對象
        return semiStaticCache || { disk: [], gpu: { controllers: [] } };
    }
}

// 使用更輕量的方法獲取CPU和記憶體資訊
function getLightweightSystemInfo() {
    try {
        // 使用Node.js內建os模組
        const cpus = os.cpus();
        const totalmem = os.totalmem();
        const freemem = os.freemem();
        
        // 計算CPU負載（非常簡化的方法）
        let totalIdle = 0;
        let totalTick = 0;
        
        for(const cpu of cpus) {
            for(const type in cpu.times) {
                totalTick += cpu.times[type];
            }
            totalIdle += cpu.times.idle;
        }
        
        // 估算CPU使用率
        const cpuLoad = 100 - (totalIdle / totalTick * 100);
        
        return {
            cpu: {
                currentLoad: cpuLoad,
                manufacturer: cpus[0]?.model?.split(' ')[0] || 'Unknown',
                brand: cpus[0]?.model || 'Unknown'
            },
            memory: {
                total: totalmem,
                used: totalmem - freemem,
                free: freemem
            }
        };
    } catch (error) {
        consol.error('輕量系統資訊收集錯誤:', error.message);
        return {
            cpu: { currentLoad: 0, manufacturer: 'Unknown', brand: 'Unknown' },
            memory: { total: 0, used: 0, free: 0 }
        };
    }
}

// 取得動態系統資訊（經常變化的資料）
async function getDynamicInfo() {
    const now = Date.now();
    
    // 如果緩存有效且不是首次請求，直接返回
    if (dynamicCache && (now - dynamicLastUpdated < DYNAMIC_UPDATE_INTERVAL)) {
        return dynamicCache;
    }
    
    try {
        // 使用輕量方法獲取基本資訊
        const basicInfo = getLightweightSystemInfo();
        
        // 僅獲取必要的動態資訊
        const [temp, network] = await Promise.all([
            si.cpuTemperature(),
            si.networkStats()
        ]);
        
        // 創建簡化的溫度資訊
        const simplifiedTemp = {
            main: temp && temp.main ? temp.main : 0
        };
        
        // 僅保留主要網路介面資訊
        const mainNetwork = network && network.length > 0 ? [network[0]] : [];
        
        dynamicCache = {
            ...basicInfo,
            temp: simplifiedTemp,
            network: mainNetwork
        };
        
        dynamicLastUpdated = now;
        return dynamicCache;
    } catch (error) {
        consol.error('動態資訊收集錯誤:', error.message);
        // 返回最後一次有效的緩存或基本資訊
        return dynamicCache || getLightweightSystemInfo();
    }
}

// 合併所有資訊並返回完整數據
async function getSystemInfo() {
    try {
        // 獲取必要的資訊（優先使用緩存）
        const [staticInfo, semiStaticInfo, dynamicInfo] = await Promise.all([
            getStaticInfo(),
            getSemiStaticInfo(),
            getDynamicInfo()
        ]);
        
        // 合併所有資訊
        return {
            ...staticInfo,
            ...semiStaticInfo,
            ...dynamicInfo
        };
    } catch (error) {
        consol.error('系統資訊合併錯誤:', error.message);
        // 返回基本資訊以避免完全失敗
        return {
            system: { manufacturer: 'Unknown', model: 'Unknown' },
            os: { platform: 'Unknown', release: 'Unknown' },
            ...getLightweightSystemInfo()
        };
    }
}

// 開始監控
function startMonitoring(socket) {
    activeClients++;
    
    // 如果已經在監控，只增加客戶端計數
    if (isMonitoring) {
        return;
    }
    
    isMonitoring = true;
    
    // 立即發送一次初始資訊
    getSystemInfo().then(data => {
        socket.emit("systeminfo", data);
    }).catch(err => {
        consol.error('發送初始系統資訊時出錯:', err);
    });
    
    // 設置極低頻率的更新間隔
    monitorInterval = setInterval(async () => {
        if (activeClients <= 0) {
            stopMonitoring();
            return;
        }
        
        try {
            const data = await getSystemInfo();
            socket.emit("systeminfo", data);
        } catch (err) {
            consol.error('發送系統資訊時出錯:', err);
        }
    }, 10000); // 每10秒更新一次
}

// 停止監控
function stopMonitoring() {
    if (monitorInterval) {
        clearInterval(monitorInterval);
        monitorInterval = null;
    }
    
    isMonitoring = false;
    activeClients = 0;
    
    // 清除動態緩存以便下次重新獲取
    dynamicCache = null;
}

// 客戶端離開時調用
function clientDisconnected() {
    activeClients = Math.max(0, activeClients - 1);
    
    // 如果沒有活躍客戶端，延遲停止監控
    if (activeClients === 0) {
        setTimeout(() => {
            if (activeClients === 0) {
                stopMonitoring();
            }
        }, 30000); // 30秒後如果仍無客戶端，則停止監控
    }
}

module.exports = {
    startMonitoring,
    stopMonitoring,
    clientDisconnected,
    getSystemInfo
};