const Shell = require('../tool/shell.js');
const consol = require('../tool/log');
var Openwebui;
async function openwebui() {
    Openwebui = new Shell();
    Openwebui.on('stdout', (data) => {
        if (data)
            consol.info(data);
    });
    Openwebui.on('stderr', (data) => {
        if (data)
            consol.error(data);
    });
    Openwebui.on('close', (code) => {
        if (code)
            console.log(`進程結束 (code: ${code})`);
    });
    /*await Openwebui.exec(`chcp 65001`);
    await Openwebui.exec(`kill-port --port 8080`);
    await Openwebui.exec(`conda activate openwebui`);
    await Openwebui.exec(`open-webui serve`);*/
}
async function openwebuiclose() {
    await Openwebui.exec(`kill-port --port 8080`);  
    await Openwebui.close();
}
module.exports = {
    openwebui,
    //openwebuiclose
}