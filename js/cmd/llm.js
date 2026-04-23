// js/cmd/llm.js
const { EmbedBuilder } = require('discord.js');
const fs = require('../tool/fs');
const fsp = require('fs').promises;
const path = require('path');
const llmserver = require('../data/llmserver.json');
const axios = require('axios');
const { prefix } = require("../data/discorddata.json");

// 暫存的模型列表，供按 ID 選擇
let availableModelsTemp = {};

async function llm(message, args, client) {
    const configPath = path.join(__dirname, '../data/config.json');
    let config = await fs.read(configPath) || {};
    
    // 預設使用 openwebui 的設定，如果該伺服器有自定義，則覆蓋
    let currentProvider = "openwebui";
    let currentModelConfig = { ...llmserver.openwebui };

    if (config[message.guild.name]) {
        currentModelConfig = config[message.guild.name];
        // 簡單判斷來源 (ollama 預設 port 是 11434)
        if (currentModelConfig.ip.includes("11434")) {
            currentProvider = "ollama";
        }
    }

    const subCommand = args && args.length > 0 ? args[0].toLowerCase() : null;

    if (!subCommand) {
        const exampleEmbed = new EmbedBuilder()
            .setColor(100, 50, 30)
            .setTitle('LLM 指令選單')
            .setDescription(`前綴:${prefix}`)
            .addFields(
                { name: 'llm source', value: '顯示正在使用的模型與來源。', inline: false },
                { name: 'llm model', value: '顯示當前可用所有的模型 (自動分配編號 ID)。', inline: false },
                { name: 'llm set [name/ID]', value: '修改正在使用的模型 (可使用字串或 ID 編號選擇)。', inline: false }
            )
            .setFooter({ text: 'LLM Bot v1.0' })
            .setTimestamp();
        return message.channel.send({ embeds: [exampleEmbed] });
    }

    if (subCommand === 'source') {
        const sourceEmbed = new EmbedBuilder()
            .setColor(50, 150, 50)
            .setTitle('目前使用的模型資訊')
            .addFields(
                { name: '來源 (Provider)', value: currentProvider, inline: true },
                { name: '模型 (Model)', value: currentModelConfig.model, inline: true },
                { name: '伺服器 (IP)', value: currentModelConfig.ip, inline: false }
            )
            .setTimestamp();
        return message.channel.send({ embeds: [sourceEmbed] });
    }
    
    if (subCommand === 'model') {
        const baseUrl = currentModelConfig.ip.replace('/api/chat/completions', '').replace('/api/chat', '');
        
        try {
            message.channel.send(`正在向 ${baseUrl} 取回模型清單...`);
            
            let models = [];
            // 根據來源呼叫不同的 API
            if (currentProvider === "openwebui" || currentModelConfig.apikey) {
                // 如果有 apikey 或被判為 openwebui，試著使用 api/models
                const url = `http://${baseUrl}/api/models`;
                try {
                    const response = await axios.get(url, {
                        headers: { "Authorization": currentModelConfig.apikey, "Content-Type": "application/json" },
                        timeout: 10000
                    });
                    if (response.data && response.data.data) {
                        models = response.data.data;
                    } else if (Array.isArray(response.data)) {
                        models = response.data;
                    } else if (response.data && response.data.models) {
                        models = response.data.models; // 有些版本用這個
                    }
                } catch (e) {
                    // 若失敗且沒有 apikey 也許只是普通的 ollama
                    if (e.response && e.response.status === 404) {
                        throw new Error("HTTP 404 - 可能這不是 OpenWebUI 伺服器");
                    } else {
                        throw e;
                    }
                }
            } else {
                // ollama api (/api/tags)
                const url = `http://${baseUrl}/api/tags`;
                const response = await axios.get(url, { timeout: 10000 });
                if (response.data && response.data.models) {
                    models = response.data.models;
                }
            }
            
            if (models.length === 0) {
                return message.channel.send("❌ 找不到可用的模型清單，或是獲取失敗。");
            }

            availableModelsTemp[message.guild.name] = {};
            let description = "";
            
            models.forEach((m, index) => {
                const id = index + 1;
                const modelName = m.id || m.model || m.name;
                availableModelsTemp[message.guild.name][id] = modelName;
                description += `**ID: ${id}** - ${modelName}\n`;
            });
            
            // 如果顯示太長，處理截斷
            if (description.length > 4000) {
                description = description.substring(0, 4000) + "...\n(清單過長，已截斷)";
            }

            const modelEmbed = new EmbedBuilder()
                .setColor(50, 100, 200)
                .setTitle(`當前可用模型清單 (${models.length} 個)`)
                .setDescription(description)
                .setFooter({ text: '使用: llm set [ID] 來設定欲使用的模型' })
                .setTimestamp();
            
            return message.channel.send({ embeds: [modelEmbed] });

        } catch (err) {
            return message.channel.send(`❌ 獲取模型發生錯誤: \n${err.message}`);
        }
    }

    if (subCommand === 'set') {
        if (!args[1]) {
            return message.channel.send("⚠️ 語法錯誤：請提供模型名稱或 ID！例如 `llm set 1` 或 `llm set gpt-4o`");
        }
        
        const selection = args[1];
        let targetModel = selection;

        // 如果是數字，嘗試從暫存抓取
        if (!isNaN(selection) && availableModelsTemp[message.guild.name] && availableModelsTemp[message.guild.name][selection]) {
            targetModel = availableModelsTemp[message.guild.name][selection];
        }

        // 修改 config
        if (!config[message.guild.name]) {
            // 從預設繼承再覆寫
            config[message.guild.name] = { ...llmserver.openwebui };
        }
        
        config[message.guild.name].model = targetModel;

        try {
            await fsp.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
            return message.channel.send(`✅ 已成功將本伺服器的使用模型設定為: **${targetModel}**`);
        } catch (err) {
            return message.channel.send(`❌ 儲存設定發生錯誤: ${err.message}`);
        }
    }

    return message.channel.send("⚠️ 無效的子指令！輸入 `llm` (無參數) 查看支援的子指令。");
}

module.exports = {
    llm
};
