// js/cmd/chat/skill.js
// Skill CMD 工具函數

const nfs = require('fs');
const fsp = require('fs').promises;
const consol = require('../../tool/log');
const path = require('path');
const { spawn } = require('child_process');
const { truncateLog } = require('./format');

// Skill 相關路徑
const SKILL_MD_PATH = path.resolve(__dirname, '../../../skill/SKILL.md');

/**
 * 讀取 SKILL.md，產生供 system prompt 使用的 Skill 概述文字
 * @returns {string}
 */
function readSkillOverview() {
    try {
        const md = nfs.readFileSync(SKILL_MD_PATH, 'utf8');
        const overview = [];
        const lines = md.split(/\r?\n/);
        for (let i = 0; i < lines.length; i++) {
            const m = lines[i].match(/^## Skill:\s*(.+)/);
            if (m) {
                const descLine = lines.slice(i + 1, i + 6).find(l => l.startsWith('**描述**'));
                const desc = descLine ? descLine.replace(/^\*\*描述\*\*[:：]\s*/, '') : '';
                overview.push(`- ${m[1].trim()}: ${desc}`);
            }
        }
        return overview.join('\n');
    } catch (e) {
        consol.warn(`[Skill] 無法讀取 SKILL.md: ${e.message}`);
        return '（無法讀取 SKILL.md）';
    }
}

/**
 * 讀取並執行對應的 Skill 檔案 (.py, .js, .md)
 * @param {string} skillName
 * @param {object|string} params
 * @param {number} retries
 * @returns {Promise<string>}
 */
async function runSkillCmd(skillName, params, retries = 1) {
    const paramsStr = typeof params === 'string' ? params : JSON.stringify(params || {});
    consol.info(truncateLog(`[Skill CMD] 準備執行: ${skillName}，參數: ${paramsStr}`));
    
    const skillsDir = path.resolve(__dirname, '../../../skill/skills');
    
    const pyPath = path.join(skillsDir, skillName, `${skillName}.py`);
    const jsPath = path.join(skillsDir, skillName, `${skillName}.js`);
    const mdPath = path.join(skillsDir, skillName, `${skillName}.md`);
    
    try {
        if (nfs.existsSync(mdPath)) {
            const content = await fsp.readFile(mdPath, 'utf8');
            return content;
        }
        
        let cmd = null;
        let scriptPath = null;
        
        if (nfs.existsSync(pyPath)) {
            cmd = 'python';
            scriptPath = pyPath;
        } else if (nfs.existsSync(jsPath)) {
            cmd = 'node';
            scriptPath = jsPath;
        }
        
        if (cmd && scriptPath) {
            let attempt = 0;
            while (attempt <= retries) {
                if (attempt > 0) consol.warn(truncateLog(`[Skill CMD] ${skillName} 準備重試 (第 ${attempt} 次)`));
                const result = await new Promise(resolve => {
                    consol.info(truncateLog(`[Skill CMD] 執行 ${cmd} 腳本: ${skillName}`));
                    const proc = spawn(cmd, [scriptPath, paramsStr], {
                        env: { ...process.env, PYTHONIOENCODING: 'utf-8' }
                    });
                    
                    let out = '', err = '';
                    proc.stdout.on('data', d => { out += d; });
                    proc.stderr.on('data', d => { err += d; });
                    
                    const timeoutId = setTimeout(() => {
                        proc.kill();
                        resolve(`❌ 調用失敗：超時`);
                    }, 180000);
                    
                    proc.on('close', code => {
                        clearTimeout(timeoutId);
                        if (out.trim()) {
                            consol.success(truncateLog(`[Skill CMD] ${skillName} 完成`));
                            resolve(out.trim());
                        } else if (code !== 0) {
                            consol.error(truncateLog(`[Skill CMD] ${skillName} 失敗 (code ${code}): ${err.trim()}`));
                            resolve(`❌ Skill \`${skillName}\` 執行失敗: ${err.trim()}`);
                        } else {
                            resolve('✅ 執行完成（無輸出）');
                        }
                    });
                    
                    proc.on('error', e => {
                        clearTimeout(timeoutId);
                        consol.error(truncateLog(`[Skill CMD] 無法啟動 ${skillName}: ${e.message}`));
                        resolve(`❌ 無法啟動 ${skillName}: ${e.message}`);
                    });
                });
                
                if (!result.startsWith('❌')) {
                    return result;
                }
                
                if (attempt === retries) {
                    return result;
                }
                attempt++;
            }
        }
        
        return `❌ 找不到名為 ${skillName} 的 .py, .js, 或 .md 檔案`;
    } catch (e) {
        consol.error(truncateLog(`[Skill CMD] 執行錯誤: ${e.message}`));
        return `❌ Skill \`${skillName}\` 執行期間發生錯誤: ${e.message}`;
    }
}

module.exports = {
    SKILL_MD_PATH,
    readSkillOverview,
    runSkillCmd
};
