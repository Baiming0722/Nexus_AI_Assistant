// js/cmd/redocmd.js
const fs = require('../tool/fs');
const path = require('path');
const consol = require('../tool/log');
var newcmd = {};
async function redocmd(message) {
    var files = await fs.readdirsync(path.join(__dirname), ".js");
    for (var i of files) {
        delete require.cache[require.resolve(`./${i}`)];
        var command = require(`./${i}`);
        var baseName = path.basename(i, ".js");
        newcmd[baseName.toLowerCase()] = command[baseName];
        consol.success(`引入${i}指令`);
    }
    message.channel.send("已經重新引入指令檔");
    return newcmd
}
module.exports = {
    redocmd
}