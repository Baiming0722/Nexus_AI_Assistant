// Chart.js
function getChartConfig() {
    const isDark = document.documentElement.classList.contains('dark');
    return {
        color: isDark ? '#e0e0e0' : '#333333',
        gridColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
        borderColor: '#5D5CDE',
        backgroundColor: 'rgba(93, 92, 222, 0.2)'
    };
}

// Initialize Charts
let cpuChart, memoryChart, networkChart;
let networkData = {
    labels: Array(20).fill(''),
    rxData: Array(20).fill(0),
    txData: Array(20).fill(0)
};

function initCharts() {
    const config = getChartConfig();
    
    // CPU Usage Doughnut Chart
    const cpuCtx = document.getElementById('cpu-chart').getContext('2d');
    cpuChart = new Chart(cpuCtx, {
        type: 'doughnut',
        data: {
            labels: ['使用中', '閒置'],
            datasets: [{
                data: [0, 100],
                backgroundColor: ['#5D5CDE', '#e0e0e0'],
                borderWidth: 0
            }]
        },
        options: {
            cutout: '70%',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
    
    // Memory Usage Doughnut Chart
    const memoryCtx = document.getElementById('memory-chart').getContext('2d');
    memoryChart = new Chart(memoryCtx, {
        type: 'doughnut',
        data: {
            labels: ['使用中', '可用'],
            datasets: [{
                data: [0, 100],
                backgroundColor: ['#5D5CDE', '#e0e0e0'],
                borderWidth: 0
            }]
        },
        options: {
            cutout: '70%',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            }
        }
    });
    
    // Network Line Chart
    const networkCtx = document.getElementById('network-chart').getContext('2d');
    networkChart = new Chart(networkCtx, {
        type: 'line',
        data: {
            labels: networkData.labels,
            datasets: [
                {
                    label: '下載 (KB/s)',
                    data: networkData.rxData,
                    borderColor: '#5D5CDE',
                    backgroundColor: 'rgba(93, 92, 222, 0.1)',
                    fill: true,
                    tension: 0.4
                },
                {
                    label: '上傳 (KB/s)',
                    data: networkData.txData,
                    borderColor: '#10B981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    fill: true,
                    tension: 0.4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        color: config.color
                    },
                    grid: {
                        color: config.gridColor
                    }
                },
                x: {
                    ticks: {
                        color: config.color,
                        display: false
                    },
                    grid: {
                        color: config.gridColor,
                        display: false
                    }
                }
            },
            plugins: {
                legend: {
                    labels: {
                        color: config.color
                    }
                }
            }
        }
    });
}

// Format bytes to human readable format
function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Update network chart with new data
function updateNetworkChart(rx, tx) {
    networkData.rxData.shift();
    networkData.rxData.push(rx);
    
    networkData.txData.shift();
    networkData.txData.push(tx);
    
    networkChart.update();
}