// root_core.js - Core functionality for root admin page
var socket = io();
var previousNetwork = null;
socket.emit('rootcheck');

socket.on('rootreload', () => {
    window.location.href = "/root/-root-登入";
});

// 處理系統信息
socket.on("systeminfo", (data) => {
    console.log("收到系統資訊");
    
    try {
        // 更新系統資訊
        document.getElementById('system-name').textContent = data.system.manufacturer + ' ' + data.system.model;
        document.getElementById('os-info').textContent = data.os.platform + ' ' + data.os.release;
        document.getElementById('cpu-model').textContent = data.cpu.manufacturer ? data.cpu.manufacturer + ' ' + data.cpu.brand : data.cpu.brand;
        document.getElementById('total-memory').textContent = formatBytes(data.memory.total);
        
        // 更新 CPU 使用率
        const cpuLoad = data.cpu.currentLoad ? data.cpu.currentLoad.toFixed(1) : 0;
        document.getElementById('cpu-usage-percent').textContent = cpuLoad + '%';
        if (typeof cpuChart !== 'undefined') {
            cpuChart.data.datasets[0].data = [cpuLoad, 100 - cpuLoad];
            cpuChart.update();
        }
        
        // 更新 CPU 溫度
        if (data.temp && data.temp.main) {
            document.getElementById('cpu-temp').textContent = '溫度: ' + data.temp.main.toFixed(1) + '°C';
        }
        
        // 更新記憶體使用率
        const memUsed = data.memory.used;
        const memTotal = data.memory.total;
        const memPercent = ((memUsed / memTotal) * 100).toFixed(1);
        
        document.getElementById('memory-usage-percent').textContent = memPercent + '%';
        document.getElementById('memory-used').textContent = formatBytes(memUsed);
        document.getElementById('memory-free').textContent = formatBytes(data.memory.free);
        
        if (typeof memoryChart !== 'undefined') {
            memoryChart.data.datasets[0].data = [memPercent, 100 - memPercent];
            memoryChart.update();
        }
        
        // 更新硬碟資訊
        const diskInfo = document.getElementById('disk-info');
        if (data.disk && data.disk.length > 0) {
            diskInfo.innerHTML = '';
            data.disk.forEach(disk => {
                const diskItem = document.createElement('div');
                diskItem.className = 'bg-gray-50 dark:bg-darkInput rounded-lg p-4';
                
                diskItem.innerHTML = `
                    <div class="flex justify-between items-center mb-2">
                        <h3 class="font-medium">${disk.name || '硬碟'}</h3>
                        <span class="text-sm text-gray-500 dark:text-gray-400">${formatBytes(disk.size)}</span>
                    </div>
                    <div class="text-sm">
                        <p>型號: ${disk.model || 'N/A'}</p>
                        <p>類型: ${disk.interfaceType || 'N/A'}</p>
                    </div>
                `;
                
                diskInfo.appendChild(diskItem);
            });
        }
        
        // 更新網路統計
        if (data.network && data.network.length > 0) {
            const network = data.network[0];
            
            if (previousNetwork) {
                // 計算速率
                const rxSpeed = (network.rx_bytes - previousNetwork.rx_bytes) / 1024; // KB/s
                const txSpeed = (network.tx_bytes - previousNetwork.tx_bytes) / 1024; // KB/s
                
                document.getElementById('network-rx-speed').textContent = rxSpeed.toFixed(2) + ' KB/s';
                document.getElementById('network-tx-speed').textContent = txSpeed.toFixed(2) + ' KB/s';
                
                // 更新圖表
                if (typeof updateNetworkChart === 'function' && typeof networkChart !== 'undefined') {
                    updateNetworkChart(rxSpeed, txSpeed);
                }
            }
            
            document.getElementById('network-rx-total').textContent = '總計: ' + formatBytes(network.rx_bytes);
            document.getElementById('network-tx-total').textContent = '總計: ' + formatBytes(network.tx_bytes);
            
            previousNetwork = network;
        }
        
        // 更新 GPU 資訊
        const gpuInfo = document.getElementById('gpu-info');
        if (data.gpu && data.gpu.controllers && data.gpu.controllers.length > 0) {
            gpuInfo.innerHTML = '';
            data.gpu.controllers.forEach(gpu => {
                const gpuItem = document.createElement('div');
                gpuItem.className = 'bg-gray-50 dark:bg-darkInput rounded-lg p-4';
                
                gpuItem.innerHTML = `
                    <h3 class="font-medium mb-2">${gpu.model || '顯示卡'}</h3>
                    <div class="text-sm">
                        <p>製造商: ${gpu.vendor || 'N/A'}</p>
                        <p>VRAM: ${gpu.vram ? formatBytes(gpu.vram * 1024 * 1024) : 'N/A'}</p>
                        <p>驅動版本: ${gpu.driverVersion || 'N/A'}</p>
                    </div>
                `;
                
                gpuInfo.appendChild(gpuItem);
            });
        }
    } catch (error) {
        console.error("更新UI時出錯:", error);
    }
});
// 初始化
document.addEventListener('DOMContentLoaded', function() {
    initDarkMode();
    
    // 初始化圖表
    if (typeof initCharts === 'function') {
        initCharts();
    } else {
        console.error('找不到 initCharts 函數，請確保 system.js 已正確載入');
    }
});