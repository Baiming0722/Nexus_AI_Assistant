const axios = require('axios');
const config = require('../data/discorddata.json');
const consol = require('./log');

async function login(code, res, dynamicRedirectUri) {
    console.log("登入代碼 (Code):", code);
    const REDIRECT_URI = dynamicRedirectUri || config.REDIRECT_URI.trim();
    const clientId = config.clientId.trim();
    const clientSecret = config.clientSecret.trim();

    console.log(`登入設定重定向 URI: '${REDIRECT_URI}' (長度: ${REDIRECT_URI.length})`);

    try {
        const params = new URLSearchParams();
        params.append('client_id', clientId);
        params.append('client_secret', clientSecret);
        params.append('grant_type', 'authorization_code');
        params.append('redirect_uri', REDIRECT_URI);
        params.append('code', code);

        const resp = await axios.post('https://discord.com/api/oauth2/token', params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        //res.send('Logged In: ' + JSON.stringify(resp.data));
        const userinfo = await info(resp.data.access_token, res);
        const userguilds = await guilds(resp.data.access_token, res);
        const user = {
            userinfo,
            userguilds
        };
        return user;
    } catch (error) {
        if (error.response) {
            console.error('Discord API 錯誤資料:', JSON.stringify(error.response.data, null, 2));
            console.error('Discord API 錯誤狀態碼:', error.response.status);
            console.error('Discord API 錯誤標頭:', JSON.stringify(error.response.headers, null, 2));
        } else {
            console.error('錯誤:', error.message);
        }
    }
}
async function info(accessToken, res) {
    try {
        const userResponse = await axios.get('https://discord.com/api/users/@me', {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });
        const userInfo = userResponse.data;
        return userInfo;
    } catch (error) {
        consol.error(error);
    }
}
async function guilds(accessToken, res) {
    try {
        const userResponse = await axios.get('https://discord.com/api/users/@me/guilds', {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });
        const userInfo = userResponse.data;
        return userInfo;
    } catch (error) {
        consol.error(error);
    }

}
module.exports = {
    login
};