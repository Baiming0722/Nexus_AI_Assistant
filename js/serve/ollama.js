const Shell = require('../tool/shell.js');
const consol = require('../tool/log');
var Ollama;
async function ollama() {
    Ollama = new Shell();
    Ollama.on('stdout', (data) => {
        if (data)
            consol.info(data);
    });
    Ollama.on('stderr', (data) => {
        if (data)
            consol.error(data);
    });
    Ollama.on('close', (code) => {
        if (code)
            console.log(`進程結束 (code: ${code})`);
    });
    /*await Ollama.exec(`chcp 65001`);
    await Ollama.exec(`kill-port --port 11434`);
    await Ollama.exec(`ollama serve`);*/
}
async function ollamaClose() {
    await Ollama.exec(`kill-port --port 11434`);
    await Ollama.close();
}
module.exports = {
    ollama,
    //ollamaClose
}