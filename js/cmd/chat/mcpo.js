// js/cmd/chat/mcpo.js
// MCPO 工具映射表管理

const axios = require('axios');
const consol = require('../../tool/log');

// MCPO 服務的端口與基礎 URL
const MCPO_PORT = 7861;
const MCPO_BASE = `http://localhost:${MCPO_PORT}`;

// 緩存: OpenWebUI 函數名 → { server, endpoint } 的映射
let mcpoToolMap = null;
let mcpoOpenAiTools = [];

// ============ 從 MCPO 建立工具路由映射表 ============
async function buildMcpoToolMap() {
    if (mcpoToolMap) return mcpoToolMap;

    mcpoToolMap = {};
    mcpoOpenAiTools = [];

    const knownServers = [
        'memory', 'fetch', 'time', 'taiwan_time', 'get_time',
        'calculator', 'ffmpeg', 'web_search', 'filesystem', 'daily_life', 'web_search_deeply'
    ];

    try {
        const rootResp = await axios.get(`${MCPO_BASE}/openapi.json`, { timeout: 5000 });
        const servers = Object.keys(rootResp.data.paths || {})
            .map(p => p.split('/')[1])
            .filter((v, i, a) => v && a.indexOf(v) === i);

        if (servers.length > 0) {
            consol.info(`[MCPO] 頂層發現 servers: ${servers.join(', ')}`);
            for (const srv of servers) {
                await indexMcpoServer(srv);
            }
        } else {
            consol.warn(`[MCPO] 頂層 openapi.json 無 paths，改用已知 server 列表`);
            for (const srv of knownServers) {
                await indexMcpoServer(srv);
            }
        }
    } catch (err) {
        consol.warn(`[MCPO] 頂層 openapi.json 失敗 (${err.message})，改用已知 server 列表`);
        for (const srv of knownServers) {
            await indexMcpoServer(srv);
        }
    }

    const uniqueTools = new Set(Object.values(mcpoToolMap).map(v => `${v.server}|${v.endpoint}|${v.method}`));
    consol.success(`[MCPO] 工具映射表建立完成，共 ${uniqueTools.size} 個工具函數`);
    return mcpoToolMap;
}

function resolveSchema(schema, definitions) {
    if (!schema || typeof schema !== 'object') return schema;
    
    let resolved = Array.isArray(schema) ? [...schema] : { ...schema };
    
    if (resolved['$ref']) {
        const refName = resolved['$ref'].split('/').pop();
        if (definitions[refName]) {
            return resolveSchema(definitions[refName], definitions);
        }
    }
    
    if (resolved.type === 'object' && resolved.properties) {
        for (const key in resolved.properties) {
            resolved.properties[key] = resolveSchema(resolved.properties[key], definitions);
        }
    }
    if (resolved.type === 'array' && resolved.items) {
        resolved.items = resolveSchema(resolved.items, definitions);
    }
    if (resolved.anyOf) {
        resolved.anyOf = resolved.anyOf.map(s => resolveSchema(s, definitions));
    }
    
    delete resolved.title;
    return resolved;
}

// 對單一 MCPO server 取得其 openapi.json 並建立映射與 OpenAI Tools Schema
async function indexMcpoServer(serverName) {
    try {
        const openapiUrl = `${MCPO_BASE}/${serverName}/openapi.json`;
        const resp = await axios.get(openapiUrl, { timeout: 5000 });
        const paths = resp.data.paths || {};
        const schemas = resp.data.components?.schemas || {};

        for (const [routePath, methods] of Object.entries(paths)) {
            for (const [method, spec] of Object.entries(methods)) {
                const operationId = spec.operationId || '';
                if (!operationId) continue;

                // 儲存映射表，優先使用 tool_ 前綴名稱（Open WebUI 預設命名方式）
                const mappedName = `tool_${operationId}`;
                mcpoToolMap[operationId] = { server: serverName, endpoint: routePath, method: method.toUpperCase() };
                mcpoToolMap[mappedName] = { server: serverName, endpoint: routePath, method: method.toUpperCase() };

                // 解析 OpenAPI schema 轉換為 OpenAI function schema
                let parameters = { type: 'object', properties: {} };
                const reqBody = spec.requestBody?.content?.['application/json']?.schema;
                
                if (reqBody) {
                    const resolvedSchema = resolveSchema(reqBody, schemas);
                    parameters = Object.assign({ type: 'object', properties: {} }, resolvedSchema);
                    if (parameters.title) delete parameters.title;
                }

                // 加入至 OpenAI Tools 列表
                mcpoOpenAiTools.push({
                    type: "function",
                    function: {
                        name: mappedName,
                        description: spec.description || spec.summary || `呼叫 ${mappedName} 執行任務`,
                        parameters: parameters
                    }
                });
            }
        }
        consol.info(`[MCPO] 已索引 server: ${serverName}，包含 ${Object.keys(paths).length} 個工具`);
    } catch (err) {
        consol.warn(`[MCPO] 無法索引 server ${serverName}: ${err.message}`);
    }
}

function getOpenAiTools() {
    return mcpoOpenAiTools;
}

module.exports = {
    MCPO_PORT,
    MCPO_BASE,
    buildMcpoToolMap,
    indexMcpoServer,
    getOpenAiTools
};
