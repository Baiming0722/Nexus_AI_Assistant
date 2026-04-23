// 測試腳本: 直接測試聊天 API 並嘗試啟用工具
// 使用方法: node test-chat.js

const axios = require('axios');
const llmserver = require('./data/llmserver.json');

const model = llmserver.openwebui;
const baseUrl = 'http://localhost:7860';

async function testChatWithoutTools() {
  console.log('\n🧪 測試 1: 不帶工具的聊天請求');
  console.log('=' .repeat(50));
  
  try {
    const response = await axios.post(
      `${baseUrl}/api/chat/completions`,
      {
        model: model.model,
        messages: [
          { role: "user", content: "你好,請簡短回答:1+1等於多少?" }
        ],
        stream: false
      },
      {
        headers: {
          "Authorization": model.apikey,
          "Content-Type": "application/json"
        },
        timeout: 30000
      }
    );
    
    console.log('✅ 請求成功');
    console.log('📦 響應結構:', Object.keys(response.data));
    
    if (response.data.choices && response.data.choices[0]) {
      console.log('💬 回覆:', response.data.choices[0].message.content);
    }
    
    return true;
  } catch (err) {
    console.log('❌ 請求失敗:', err.message);
    if (err.response) {
      console.log('📛 狀態碼:', err.response.status);
      console.log('📛 錯誤:', JSON.stringify(err.response.data, null, 2));
    }
    return false;
  }
}

async function testChatWithToolIds(toolIds) {
  console.log(`\n🧪 測試 2: 帶工具 ID 的聊天請求`);
  console.log('=' .repeat(50));
  console.log('🔧 工具 IDs:', JSON.stringify(toolIds));
  
  try {
    const requestBody = {
      model: model.model,
      messages: [
        { role: "user", content: "請幫我查詢當前的天氣" }
      ],
      tool_ids: toolIds,
      stream: false
    };
    
    console.log('\n📤 請求體:');
    console.log(JSON.stringify(requestBody, null, 2));
    
    const response = await axios.post(
      `${baseUrl}/api/chat/completions`,
      requestBody,
      {
        headers: {
          "Authorization": model.apikey,
          "Content-Type": "application/json"
        },
        timeout: 60000
      }
    );
    
    console.log('\n✅ 請求成功');
    console.log('📦 響應結構:', Object.keys(response.data));
    
    const choice = response.data.choices[0];
    
    if (choice.message.tool_calls) {
      console.log('🔧 工具調用:', JSON.stringify(choice.message.tool_calls, null, 2));
    }
    
    if (choice.message.content) {
      console.log('💬 回覆:', choice.message.content);
    }
    
    console.log('\n📊 完整響應:');
    console.log(JSON.stringify(response.data, null, 2).substring(0, 500));
    
    return true;
  } catch (err) {
    console.log('\n❌ 請求失敗:', err.message);
    if (err.response) {
      console.log('📛 狀態碼:', err.response.status);
      console.log('📛 錯誤:', JSON.stringify(err.response.data, null, 2));
    }
    return false;
  }
}

async function testDifferentToolFormats() {
  console.log('\n🧪 測試 3: 嘗試不同的工具參數格式');
  console.log('=' .repeat(50));
  
  const formats = [
    { name: 'tool_ids (陣列)', data: { tool_ids: ['test_tool'] } },
    { name: 'tools (陣列)', data: { tools: ['test_tool'] } },
    { name: 'tool_choice', data: { tool_choice: 'auto' } },
    { name: 'tools (對象格式)', data: { tools: [{ type: 'function', function: { name: 'test' } }] } },
    { name: 'functions', data: { functions: ['test_function'] } },
    { name: 'function_call', data: { function_call: 'auto' } }
  ];
  
  for (const format of formats) {
    console.log(`\n📝 測試格式: ${format.name}`);
    
    try {
      const requestBody = {
        model: model.model,
        messages: [{ role: "user", content: "測試" }],
        stream: false,
        ...format.data
      };
      
      const response = await axios.post(
        `${baseUrl}/api/chat/completions`,
        requestBody,
        {
          headers: {
            "Authorization": model.apikey,
            "Content-Type": "application/json"
          },
          timeout: 10000,
          validateStatus: () => true
        }
      );
      
      if (response.status === 200) {
        console.log(`   ✅ 接受 (狀態 ${response.status})`);
      } else {
        console.log(`   ⚠️  狀態 ${response.status}: ${response.data.error || response.data.message || '未知錯誤'}`);
      }
    } catch (err) {
      console.log(`   ❌ 失敗: ${err.message}`);
    }
  }
}

async function manualToolIdTest() {
  console.log('\n🧪 測試 4: 手動輸入工具 ID 測試');
  console.log('=' .repeat(50));
  console.log('\n請從 Open WebUI 界面手動獲取工具 ID:');
  console.log('1. 打開 http://localhost:7860');
  console.log('2. 進入 Settings → Tools/Functions');
  console.log('3. 點擊任一個 MCP 工具查看詳情');
  console.log('4. 複製工具的 ID (通常在 URL 或工具卡片上)');
  console.log('\n如果你有工具 ID,取消註釋下面的代碼並填入:\n');

  // 取消註釋並填入你的工具 ID:
  const myToolIds = [
    'mcpo',
    'time',
    'ffmpeg',
    'web_search',
    'filesystem',
    'daily_life',
    'get_time',
    'calculator',
  ];
  
  await testChatWithToolIds(myToolIds);
  
  console.log('// const myToolIds = [\'your_tool_id_1\', \'your_tool_id_2\'];');
  console.log('// await testChatWithToolIds(myToolIds);');
}

async function main() {
  console.log('==========================================');
  console.log('  Open WebUI 聊天 API 工具測試');
  console.log('==========================================');
  
  console.log('\n📋 配置信息:');
  console.log(`   URL: ${baseUrl}`);
  console.log(`   Model: ${model.model}`);
  console.log(`   API Key: ${model.apikey.substring(0, 20)}...`);
  
  // 測試 1: 基本聊天
  const basicWorks = await testChatWithoutTools();
  
  if (!basicWorks) {
    console.log('\n⚠️  基本聊天失敗,請先解決連接問題');
    return;
  }
  
  // 測試 2: 嘗試帶空工具列表
  await testChatWithToolIds([]);
  
  // 測試 3: 嘗試帶假的工具 ID
  await testChatWithToolIds(['fake_tool_id_123']);
  
  // 測試 4: 嘗試不同參數格式
  await testDifferentToolFormats();
  
  // 測試 5: 手動測試指南
  await manualToolIdTest();
  
  console.log('\n==========================================');
  console.log('💡 下一步建議:');
  console.log('==========================================');
  console.log(`
1. 如果基本聊天成功但工具不工作:
   → 需要手動從 Open WebUI 界面獲取工具 ID
   → 在瀏覽器中打開: ${baseUrl}
   → 找到工具配置頁面並記錄工具 ID

2. 如果所有測試都失敗:
   → 運行: node debug-api.js
   → 檢查 API 端點是否正確

3. 查看 Open WebUI 文檔:
   → https://docs.openwebui.com/
   → 搜尋 "tools" 或 "functions"

4. 在 Open WebUI 界面中測試:
   → 發送一個需要使用 MCP 工具的問題
   → 打開瀏覽器開發者工具 (F12)
   → 查看 Network 標籤,找到 /api/chat/completions 請求
   → 查看請求體中的工具參數格式
  `);
  
  console.log('\n==========================================');
  console.log('測試完成!');
  console.log('==========================================\n');
}

main().catch(err => {
  console.error('測試失敗:', err.message);
  process.exit(1);
});