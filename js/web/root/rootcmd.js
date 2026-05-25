var socket = io();
var previousNetwork = null;
socket.emit('rootcheck');

socket.on('rootreload', () => {
    window.location.href = "/root/-root-登入";
});

document.getElementById('cmdinput').addEventListener('submit', function (event) {
    event.preventDefault();
    const value = document.getElementById('cmd').value;
    socket.emit("cmdreq",value);
    document.getElementById('cmd').value = '';
});

socket.on("cmdres", async (value) => {
    console.log(value);
    console.log(value.stdout);
});