// js/tool/fs.js
const fs = require('fs');
const fso = require('fs')
const fsp = require('fs').promises;
const consol = require('./log.js')

async function read(path) {
    try {
        const data = await fsp.readFile(path, 'utf8');
        if (data && data.trim() !== "")
            return JSON.parse(data);
        return {};
    } catch (err) {
        consol.error(`[讀取失敗] ${path}:`, err);
        return {};
    }
}

async function write(path, obj) {
    try {
        await fsp.writeFile(path, JSON.stringify(obj, null, 2));
        consol.success(`[寫入成功] ${path}`);
    } catch (err) {
        consol.error(`[寫入失敗] ${path}:`, err);
    }
}
function readdirsync(path,files) {
    try{
        return fs.readdirSync(path).filter(file => file.endsWith(files));
    } catch(err) {
        consol.error(err);
    }
}
module.exports = {
    read,
    write,
    readdirsync
};