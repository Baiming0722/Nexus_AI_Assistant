const bcrypt = require('bcrypt');
const saltRounds = 10;
const plainPassword = "qwerty9103";//想加密的密碼
bcrypt.hash(plainPassword, saltRounds, function(err, hash) {
    console.log("加密後密碼：", hash);
});