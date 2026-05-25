const { Client, GatewayIntentBits, Partials } = require('discord.js');
const path = require('path');

const consol = require('../tool/log');
const fs = require('../tool/fs');

const { token, prefix, clientId } = require('../data/config.json');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildBans,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});
var cmd = {};
var files = fs.readdirsync(path.join(__dirname, '../cmd'), ".js");
for (var i of files) {
    var command = require(`../cmd/${i}`);
    cmd[path.basename(i, ".js")] = command[path.basename(i, ".js")];
    consol.success(`引入${i}指令`);
}

async function discord() {
    client.login(token);
    client.on('ready', () => {
        client.user.setStatus('idle');
        consol.success(`已登入 ${client.user.tag}`);
    });

    client.on('messageCreate', async message => {
        //fs.write(path.join(__dirname, '../data/msg.json'), message.author);
        if (message.content.startsWith(prefix)) {
            const args = message.content.slice(prefix.length).trim().split(/ +/g);
            const command = args.shift().toLowerCase();
            if (cmd[command.toLowerCase()]) {
                consol.info(`指令參數:{${args}}`);
                try {
                    if (command == "redocmd") {
                        var newcmd = await cmd[command](message);
                        Object.keys(cmd).forEach(k => delete cmd[k]);
                        Object.assign(cmd, newcmd);
                    } else
                        cmd[command](message, args);
                } catch (error) {
                    consol.error(error.message);
                }
            }
        }
    });
}
module.exports = {
    discord
}