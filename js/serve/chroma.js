const Shell = require('../tool/shell.js');
const consol = require('../tool/log');
var Chroma;
async function chroma() {
    Chroma = new Shell();
    Chroma.on('stdout', (data) => {
        if (data)
            consol.info(data);
    });
    Chroma.on('stderr', (data) => {
        if (data)
            consol.error(data);
    });
    Chroma.on('close', (code) => {
        if (code)
            console.log(`進程結束 (code: ${code})`);
    });
    //await Chroma.exec(`chcp 65001`);
    //await Chroma.exec(`kill-port --port 8000`);
    //await Chroma.exec(`conda activate chroma`);
    //await Chroma.exec(`chroma run --path "D:/專題/專題V2" --host 127.0.0.1 --port 8000`);
}
async function chromaClose() {
    await Chroma.exec(`kill-port --port 8000`);
    await Chroma.close();
}
module.exports = {
    chroma,
    chromaClose
}