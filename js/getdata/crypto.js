const crypto = require('crypto');
const fs = require('fs');

function generateSecret(length) {
    return crypto.randomBytes(length).toString('hex');
}

const secret = generateSecret(32); // 生成一个32字节长的十六进制字符串
console.log('Generated secret:', secret);
fs.writeFile('../data/secret.json', JSON.stringify(secret), (err) => {
    if (err) {
        console.error('Error writing to file', err);
    } else {
        console.log('檔案寫入成功');
    }
});