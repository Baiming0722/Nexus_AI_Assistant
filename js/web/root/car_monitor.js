// car_monitor.js
// IoT 智能車監控面板 — 前端邏輯
// 透過 Socket.IO 接收後端廣播的 car_status 事件，更新 UI 指標與電量歷史折線圖

(function () {
    'use strict';

    // ========================================================================
    // 常數
    // ========================================================================

    /** 垃圾總量折線圖最多顯示的資料點數（對應 car_log.json 的 120 筆） */
    const MAX_CHART_POINTS = 120;

    // ========================================================================
    // 狀態
    // ========================================================================

    /** 總量歷史折線圖實例（Chart.js） */
    let trashbinChart = null;

    /** 歷史總量資料點（y 值陣列） */
    const totalHistory = [];

    /** 歷史時間標籤陣列 */
    const timeLabels = [];

    // ========================================================================
    // 工具函式
    // ========================================================================

    /**
     * 根據是否觸發滿桶警告決定狀態顏色
     * @param {boolean} alertActive 
     * @returns {string} CSS 顏色字串
     */
    function getStatusColor(alertActive) {
        return alertActive ? '#ef4444' : '#22c55e'; // 紅色：滿桶警告，綠色：正常
    }

    /**
     * 將 ISO 時間字串格式化為本地時間顯示
     * @param {string} isoString ISO 8601 時間字串
     * @returns {string} 本地化時間字串
     */
    function formatTime(isoString) {
        try {
            return new Date(isoString).toLocaleTimeString('zh-TW', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
            });
        } catch {
            return isoString;
        }
    }

    // ========================================================================
    // 總量折線圖
    // ========================================================================

    /**
     * 初始化垃圾總量歷史折線圖（使用 Chart.js）
     */
    function initTrashbinChart() {
        const canvas = document.getElementById('trashbin-chart');
        if (!canvas) {
            console.warn('[CarMonitor] 找不到 #trashbin-chart canvas 元素');
            return;
        }

        const ctx = canvas.getContext('2d');
        trashbinChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: timeLabels,
                datasets: [{
                    label: '垃圾總量',
                    data: totalHistory,
                    borderColor: '#3b82f6',
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    borderWidth: 2,
                    pointRadius: 2,
                    pointHoverRadius: 5,
                    tension: 0.4,
                    fill: true,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: { duration: 400 },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => `數量: ${ctx.parsed.y}`,
                        },
                    },
                },
                scales: {
                    x: {
                        ticks: { maxTicksLimit: 10, color: '#9ca3af', font: { size: 10 } },
                        grid: { color: 'rgba(156,163,175,0.15)' },
                    },
                    y: {
                        min: 0,
                        suggestedMax: 10,
                        ticks: { color: '#9ca3af', stepSize: 1 },
                        grid: { color: 'rgba(156,163,175,0.15)' },
                    },
                },
            },
        });
    }

    /**
     * 將新資料點推入總量折線圖
     * @param {number} total 垃圾總量
     * @param {string} timeLabel 時間標籤字串
     */
    function pushTrashbinChartPoint(total, timeLabel) {
        if (!trashbinChart) return;

        totalHistory.push(total);
        timeLabels.push(timeLabel);

        // 超過上限時移除最舊的點
        if (totalHistory.length > MAX_CHART_POINTS) {
            totalHistory.shift();
            timeLabels.shift();
        }

        trashbinChart.update('active');
    }

    // ========================================================================
    // UI 更新
    // ========================================================================

    /**
     * 更新連線狀態指示燈
     * @param {'connected'|'disconnected'|'waiting'} state 狀態
     */
    function updateConnectionStatus(state) {
        const dot   = document.getElementById('trashbin-connection-dot');
        const label = document.getElementById('trashbin-connection-label');
        if (!dot || !label) return;

        const stateMap = {
            connected:    { color: '#22c55e', text: '資料正常' },
            disconnected: { color: '#ef4444', text: '連線中斷' },
            waiting:      { color: '#9ca3af', text: '等待資料...' },
        };

        const config = stateMap[state] || stateMap.waiting;
        dot.style.backgroundColor = config.color;
        label.textContent = config.text;
    }

    /**
     * 以收到的垃圾桶資料更新整個監控面板
     * @param {object} data car_status 事件資料
     */
    function updateTrashbinDashboard(data) {
        const {
            recyclableCount,
            nonRecyclableCount,
            total,
            alertActive,
            receivedAt,
        } = data;

        // — 可回收數量 —
        const recEl = document.getElementById('trashbin-recyclable');
        if (recEl) recEl.textContent = recyclableCount ?? '--';

        const updatedAtEl = document.getElementById('trashbin-updated-at');
        if (updatedAtEl) {
            updatedAtEl.textContent = receivedAt
                ? `更新時間: ${formatTime(receivedAt)}`
                : '最後更新時間未知';
        }

        // — 不可回收數量 —
        const nonRecEl = document.getElementById('trashbin-nonrecyclable');
        if (nonRecEl) nonRecEl.textContent = nonRecyclableCount ?? '--';

        // — 總量與狀態 —
        const totalEl = document.getElementById('trashbin-total');
        const statusEl = document.getElementById('trashbin-alert-status');
        
        if (totalEl && total !== undefined) {
            totalEl.textContent = total;
            totalEl.style.color = getStatusColor(alertActive);
            
            // 推入折線圖
            pushTrashbinChartPoint(total, formatTime(receivedAt));
        }

        if (statusEl) {
            statusEl.textContent = alertActive ? '⚠️ 滿桶請清潔' : '✅ 狀態正常';
            statusEl.style.color = getStatusColor(alertActive);
        }

        // — 連線狀態 —
        updateConnectionStatus('connected');
    }

    // ========================================================================
    // 日誌面板
    // ========================================================================

    /**
     * 等級對應的行內顏色樣式（配合深色背景呈現）
     */
    const LOG_LEVEL_STYLE = {
        info:    'color: #60a5fa;',  // 藍色
        success: 'color: #4ade80;',  // 綠色
        warn:    'color: #fb923c;',  // 橙色
        error:   'color: #f87171;',  // 紅色
    };

    /**
     * 等級標籤顯示文字（固定4字元寬）
     */
    const LOG_LEVEL_LABEL = {
        info:    'INFO',
        success: ' OK ',
        warn:    'WARN',
        error:   'ERR ',
    };

    /**
     * 將單筆日誌條目渲染至日誌面板
     * @param {{ level: string, message: string, time: string }} entry
     */
    function renderLogEntry(entry) {
        const panel = document.getElementById('car-log-panel');
        if (!panel) return;

        // 首次渲染時清除預設提示文字
        const placeholder = panel.querySelector('p.text-gray-500');
        if (placeholder) placeholder.remove();

        const style = LOG_LEVEL_STYLE[entry.level] || LOG_LEVEL_STYLE.info;
        const label = LOG_LEVEL_LABEL[entry.level] || 'INFO';
        const timeStr = formatTime(entry.time);

        const line = document.createElement('div');
        line.style.cssText = `font-family: monospace; white-space: pre-wrap; word-break: break-all; ${style}`;
        line.textContent = `[${timeStr}] [${label}] ${entry.message}`;

        panel.appendChild(line);

        // 自動捲動至底部以顯示最新日誌
        panel.scrollTop = panel.scrollHeight;
    }

    /**
     * 批次渲染歷史日誌（用於頁面載入後補收緩衝）
     * @param {Array<{ level: string, message: string, time: string }>} entries
     */
    function renderLogBatch(entries) {
        entries.forEach((entry) => renderLogEntry(entry));
    }

    // ========================================================================
    // 初始化
    // ========================================================================

    /**
     * 主初始化函式：
     * 1. 初始化電量折線圖
     * 2. 透過已存在的 socket (root_core.js 建立) 接收各類事件
     * 3. 主動請求最新資料與歷史日誌（避免等待下一個廣播週期）
     */
    function init() {
        // root_core.js 已宣告全域 socket 變數
        if (typeof socket === 'undefined') {
            console.error('[CarMonitor] 找不到全域 socket 變數，請確認 root_core.js 已先載入');
            return;
        }

        // 初始化折線圖
        initTrashbinChart();

        // 監聽後端廣播的車輛狀態事件
        socket.on('car_status', (data) => {
            console.log('[CarMonitor] 收到垃圾桶資料:', data);
            updateTrashbinDashboard(data);
        });

        // 監聽單筆即時日誌
        socket.on('car_log', (entry) => {
            renderLogEntry(entry);
        });

        // 監聽歷史日誌批次（頁面重載後補收）
        socket.on('car_log_history', (entries) => {
            if (Array.isArray(entries)) {
                renderLogBatch(entries);
            }
        });

        // 清除日誌面板按鈕
        const clearBtn = document.getElementById('car-log-clear-btn');
        if (clearBtn) {
            clearBtn.addEventListener('click', () => {
                const panel = document.getElementById('car-log-panel');
                if (panel) panel.innerHTML = '';
            });
        }

        // 頁面載入後主動請求最新一筆資料與歷史日誌
        socket.emit('car_data_request');

        console.log('[CarMonitor] 智能車監控面板已初始化');
    }

    // DOM 載入完成後執行初始化
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        // DOMContentLoaded 已觸發（腳本放在 body 底部時）
        init();
    }

})();

