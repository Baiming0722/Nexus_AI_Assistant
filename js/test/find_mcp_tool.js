// 臨時腳本:查找 MCP 工具 ID
// 使用方法: node find-mcp-tool.js
// 這是一個獨立的測試腳本,不依賴 Discord bot

const axios = require('axios');
const llmserver = require('./data/llmserver.json');

// 使用你的 Open WebUI 配置
const model = llmserver.openwebui;

// 搜尋工具的函數
async function findTools(keyword) {
  try {
    const baseUrl = `http://${model.ip.replace('/api/chat/completions', '')}`;
    const url = `${baseUrl}/api/tools`;
    
    console.log(`正在請求: ${url}`);
    
    const response = await axios.get(url, {
      headers: {
        "Authorization": model.apikey,
        "Content-Type": "application/json"
      }
    });
    
    let tools = [];
    if (Array.isArray(response.data)) {
      tools = response.data;
    } else if (response.data && response.data.data) {
      tools = response.data.data;
    } else if (response.data && typeof response.data === 'object') {
      tools = Object.values(response.data);
    }
    
    console.log(`API 返回了 ${tools.length} 個工具\n`);
    
    // 根據關鍵字搜尋工具
    const filtered = tools.filter(tool => {
      if (!tool || typeof tool !== 'object') return false;
      const name = (tool.name || tool.meta?.name || '').toLowerCase();
      const desc = (tool.description || tool.meta?.description || '').toLowerCase();
      const id = (tool.id || '').toLowerCase();
      const searchTerm = keyword.toLowerCase();
      
      return name.includes(searchTerm) || 
             desc.includes(searchTerm) || 
             id.includes(searchTerm);
    });
    
    return filtered.map(tool => ({
      id: tool.id,
      name: tool.name || tool.meta?.name || '未命名',
      description: (tool.description || tool.meta?.description || '無描述').substring(0, 100)
    }));
  } catch (err) {
    console.error(`搜尋工具失敗: ${err.message}`);
    if (err.response) {
      console.error(`狀態碼: ${err.response.status}`);
      console.error(`響應: ${JSON.stringify(err.response.data).substring(0, 200)}`);
    }
    return [];
  }
}

// 主函數
async function main() {
  console.log('==========================================');
  console.log('  Open WebUI MCP 工具查找器');
  console.log('==========================================\n');
  
  // 搜尋 MCP 相關工具
  console.log('🔍 搜尋包含 "mcp" 的工具...\n');
  const mcpTools = await findTools('mcp');
  
  if (mcpTools.length > 0) {
    console.log(`✅ 找到 ${mcpTools.length} 個 MCP 相關工具:\n`);
    mcpTools.forEach((tool, index) => {
      console.log(`${index + 1}. ${tool.name}`);
      console.log(`   ID: ${tool.id}`);
      console.log(`   描述: ${tool.description}`);
      console.log('');
    });
    
    // 生成配置代碼
    console.log('==========================================');
    console.log('📋 複製以下代碼到 chat.js (約第 96 行):');
    console.log('==========================================\n');
    
    const toolIdsArray = mcpTools.map(t => t.id);
    console.log(`// 啟用所有 ${mcpTools.length} 個 MCP 工具`);
    console.log(`toolIds = ${JSON.stringify(toolIdsArray, null, 2)};`);
    
    console.log('\n// 或者只啟用特定工具:');
    console.log(`toolIds = ['${toolIdsArray[0]}'];  // ${mcpTools[0].name}`);
    
  } else {
    console.log('❌ 未找到包含 "mcp" 的工具\n');
    console.log('嘗試搜尋其他關鍵字...\n');
    
    // 嘗試其他關鍵字
    const keywords = ['proxy', 'openapi', 'mcpo', 'tool', 'web', 'api'];
    for (const keyword of keywords) {
      console.log(`🔍 搜尋 "${keyword}"...`);
      const tools = await findTools(keyword);
      
      if (tools.length > 0 && tools.length < 50) {
        console.log(`  找到 ${tools.length} 個工具:`);
        tools.slice(0, 5).forEach(tool => {
          console.log(`    - ${tool.name} [${tool.id}]`);
        });
        console.log('');
      }
    }
  }
  
  console.log('\n==========================================');
  console.log('完成!');
  console.log('==========================================');
}

// 執行主函數
main().catch(err => {
  console.error('執行失敗:', err.message);
  process.exit(1);
});