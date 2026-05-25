const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);
const consol = require('../tool/log');
const fs = require('../tool/fs');
const config = require('../data/llmserver.json');
const { EmbedBuilder } = require('discord.js');
const path = require('path');

async function model(message) {
    const guildconfig = await fs.read(path.join(__dirname, '../data/config.json'));
    let set = config.openwebui.models;

    if (guildconfig[message.guild.name]) {
        set = guildconfig[message.guild.name].models;
    }

    let output;
    try {
        // 使用 execPromise 確保等待指令完全結束，提高 curl 穩定性
        output = await execPromise(set, { timeout: 20000 });
    } catch (err) {
        output = {
            stdout: err.stdout || '',
            stderr: err.message || err.stderr || ''
        };
    }

    if (output.stdout) consol.info(`[Model] Output length: ${output.stdout.length}`);
    if (output.stderr && !output.stdout) consol.error(`[Model] Error: ${output.stderr}`);

    // 如果完全沒有輸出且有錯誤，才判定失敗
    if (!output.stdout && output.stderr) {
        return message.channel.send("❌ 無法取得模型清單，請檢查設定。");
    }

    let fields = [];
    const stdout = output.stdout;

    // 1. 嘗試從輸出中尋找並解析 JSON (針對 API 回傳)
    const jsonMatch = stdout.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        try {
            const json = JSON.parse(jsonMatch[0]);
            const models = json.models || (Array.isArray(json) ? json : null);

            if (models && Array.isArray(models)) {
                fields = models.map(m => {
                    const name = m.name || m.model || '未知模型';
                    const id = m.digest ? m.digest.slice(0, 12) : (m.id || '—');
                    let size = '—';
                    if (m.size) {
                        size = typeof m.size === 'number'
                            ? (m.size / (1024 * 1024 * 1024)).toFixed(2) + ' GB'
                            : m.size;
                    }
                    const modified = m.modified_at ? new Date(m.modified_at).toLocaleString('zh-TW') : '—';

                    return {
                        name: name.substring(0, 250),
                        value: `🆔 **ID:** ${id}\n💾 **大小:** ${size}\n🕓 **更新:** ${modified}`,
                        inline: true
                    };
                });
            }
        } catch (e) {
            consol.warn("[Model] JSON 提取解析失敗，嘗試表格模式");
        }
    }

    // 2. 如果 JSON 模式沒抓到資料，嘗試舊版的表格解析 (針對 ollama list)
    if (fields.length === 0) {
        const lines = stdout.split('\n').filter(line => {
            const l = line.trim();
            return l &&
                !l.startsWith('Microsoft') &&
                !l.startsWith('(c)') &&
                !l.startsWith('>') &&
                !l.includes('Active code page') &&
                !l.includes('curl ') &&
                !/^[A-Z]:\\.*>/.test(l);
        });

        fields = lines.map(line => {
            const parts = line.trim().split(/\s{2,}/g);
            if (parts.length < 2) return null;
            const [name, id, size, modified] = parts;
            return {
                name: (name || '未知模型').substring(0, 250),
                value: `🆔 **ID:** ${id || '—'}\n💾 **大小:** ${size || '—'}\n🕓 **更新:** ${modified || '—'}`,
                inline: true
            };
        }).filter(f => f !== null);
    }

    if (fields.length === 0) {
        return message.channel.send("⚠️ 找不到任何模型，請確認服務是否開啟。");
    }

    // 建立 Embed
    const exampleEmbed = new EmbedBuilder()
        .setColor(0x915b32)
        .setTitle(`📦 ${message.guild.name} 的模型列表`)
        .setDescription(`共找到 **${fields.length}** 個模型`)
        .addFields(fields.slice(0, 25))
        .setFooter({ text: 'LLM 模型清單' })
        .setTimestamp();

    try {
        await message.channel.send({ embeds: [exampleEmbed] });
    } catch (err) {
        consol.error(`[Model] 發送失敗: ${err.message}`);
        message.channel.send("❌ 發送清單時發生錯誤，可能是模型數量過多或權限不足。");
    }
}

module.exports = { model };
