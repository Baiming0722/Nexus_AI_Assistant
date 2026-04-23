// js/cmd/chat/format.js
// 格式化輸出工具

/**
 * 將文字截斷為最多 3 行、50 字元
 * @param {string} text
 * @returns {string}
 */
function truncateLog(text) {
    if (!text) return '';
    let str = String(text);
    let lines = str.split(/\r?\n/);
    let truncated = false;
    if (lines.length > 3) {
        lines = lines.slice(0, 3);
        truncated = true;
    }
    let res = lines.join('\n');
    if (res.length > 50) {
        res = res.substring(0, 50);
        truncated = true;
    }
    return res + (truncated ? '...' : '');
}

module.exports = { truncateLog };
