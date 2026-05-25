const Shell = require('../tool/shell.js');
const consol = require('../tool/log');
var Php;
async function php() {
    Php = new Shell();
    Php.on('stdout', (data) => {
        if (data)
            consol.info(data);
    });

    Php.on('stderr', (data) => {
        if (data)
            consol.error(data);
    });

    Php.on('close', (code) => {
        if (code)
            console.log(`進程結束 (code: ${code})`);
    });
    await Php.exec(`chcp 65001`);
    await Php.exec(`kill-port --port 5000`);
    await Php.exec(`D:/php-8.4.8-Win32-vs17-x64/php.exe -S localhost:5000 -t "D:/cyotek/www.nkust.edu.tw"`);
}//D:/wget/NKUST/www.nkust.edu.tw
async function phpclose() {
    await Php.exec(`kill-port --port 5000`);
    await Php.close();
}
module.exports = {
    php,
    phpclose
}