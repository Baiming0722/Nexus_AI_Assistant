// rootlogin_core.js - Core functionality for root login page
var socket = io();

document.getElementById('login').addEventListener('submit', function(event) {
    event.preventDefault();
    var acc = document.getElementById('account').value;
    var pwd = document.getElementById('password').value;
    if(acc && pwd) {
        socket.emit('rootlogin', acc, pwd);
    }
});

socket.on('rootreload', () => {
    window.location.href = "/root/-root-%E9%9D%A2%E6%9D%BF";
});

socket.on('rootlogin_fail', (message) => {
    // 顯示登入失敗訊息，避免使用者以為頁面無反應
    const existingAlert = document.getElementById('login-error');
    if (existingAlert) existingAlert.remove();

    const alert = document.createElement('div');
    alert.id = 'login-error';
    alert.textContent = message || '帳號或密碼錯誤';
    alert.style.cssText = 'color:#dc2626;background:#fef2f2;border:1px solid #fca5a5;border-radius:8px;padding:10px 16px;margin-top:12px;font-size:14px;text-align:center;';
    document.getElementById('login').appendChild(alert);
});