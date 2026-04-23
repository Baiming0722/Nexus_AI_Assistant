// js/cmd/help.js
const { EmbedBuilder } = require('discord.js');
const { prefix } = require("../data/discorddata.json")
function help(message_channel) {
    const exampleEmbed = new EmbedBuilder()
        .setColor(100, 50, 30)
        .setTitle('LLM機器人')
        .setDescription(`前綴:${prefix}`)
        .addFields(
            { name: 'help', value: '顯示所有指令與說明。', inline: false },
            { name: 'chat <提問>', value: '向機器人提問或對話（支援附加 txt/json/md/jpg/png 檔案）。', inline: false },
            { name: 'llm [子指令]', value: '管理模型設定。輸入 `llm` (無參數) 查看子指令 (source, model, set)', inline: false },
            { name: 'memory [參數]', value: '管理 JSON 對話歷史與 MCP 記憶。輸入 `memory` (無參數) 查看所有子指令(例如切換記憶等)。', inline: false },
            { name: 'newchat', value: '將目前的記憶存檔，並開啟一個全新的對話。', inline: false }
        )
        .setFooter({ text: 'LLM Bot v1.0' })
        .setTimestamp()
    message_channel.channel.send({ embeds: [exampleEmbed] });
}
module.exports = {
    help
};