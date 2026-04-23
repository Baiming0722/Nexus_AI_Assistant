// 診斷腳本: 檢查 Open WebUI API 連接和配置
// 使用方法: node debug-api.js

const axios = require('axios');
const llmserver = require('./data/llmserver.json');

const model = llmserver.openwebui;
const baseUrl = 'http://localhost:7860';

async function testEndpoint(url, description) {
  console.log(`\n🔍 測試: ${description}`);
  console.log(`   URL: ${url}`);
  
  try {
    const response = await axios.get(url, {
      headers: {
        "Authorization": model.apikey,
        "Content-Type": "application/json"
      },
      validateStatus: () => true // 接受所有狀態碼
    });
    
    console.log(`   ✅ 狀態碼: ${response.status}`);
    console.log(`   📦 響應類型: ${typeof response.data}`);
    
    if (response.status === 200) {
      if (Array.isArray(response.data)) {
        console.log(`   📊 數據: 陣列,長度 ${response.data.length}`);
        if (response.data.length > 0) {
          console.log(`   🔍 第一個元素: ${JSON.stringify(response.data[0], null, 2).substring(0, 200)}`);
        }
      } else if (typeof response.data === 'object') {
        console.log(`   📊 數據: 對象,鍵: ${Object.keys(response.data).join(', ')}`);
        console.log(`   🔍 內容預覽: ${JSON.stringify(response.data, null, 2).substring(0, 300)}`);
      } else {
        console.log(`   📊 數據: ${response.data}`);
      }
    } else {
      console.log(`   ⚠️  錯誤響應: ${JSON.stringify(response.data)}`);
    }
    
    return response;
  } catch (err) {
    console.log(`   ❌ 請求失敗: ${err.message}`);
    if (err.response) {
      console.log(`   📛 狀態碼: ${err.response.status}`);
      console.log(`   📛 響應: ${JSON.stringify(err.response.data).substring(0, 200)}`);
    }
    return null;
  }
}

async function diagnose() {
  console.log('==========================================');
  console.log('  Open WebUI API 診斷工具');
  console.log('==========================================');
  
  console.log('\n📋 當前配置:');
  console.log(`   Open WebUI URL: ${baseUrl}`);
  console.log(`   API Key: ${model.apikey.substring(0, 20)}...`);
  console.log(`   Model: ${model.model}`);
  
  // 測試 1: 基本連接
  console.log('\n' + '='.repeat(50));
  console.log('測試 1: 基本連接');
  console.log('='.repeat(50));
  await testEndpoint(`${baseUrl}/`, '根路徑');
  
  // 測試 2: API 健康檢查
  console.log('\n' + '='.repeat(50));
  console.log('測試 2: API 端點');
  console.log('='.repeat(50));
  await testEndpoint(`${baseUrl}/api/`, 'API 根路徑');
  await testEndpoint(`${baseUrl}/api/version`, '版本信息');
  await testEndpoint(`${baseUrl}/health`, '健康檢查');
  
  // 測試 3: 工具相關端點
  console.log('\n' + '='.repeat(50));
  console.log('測試 3: 工具端點 (主要測試)');
  console.log('='.repeat(50));
  await testEndpoint(`${baseUrl}/api/tools`, '工具列表 (/api/tools)');
  await testEndpoint(`${baseUrl}/api/v1/tools`, '工具列表 V1 (/api/v1/tools)');
  await testEndpoint(`${baseUrl}/api/tools/list`, '工具列表 (list)');
  
  // 測試 4: Functions 端點 (Open WebUI 可能用這個來存儲工具)
  console.log('\n' + '='.repeat(50));
  console.log('測試 4: Functions 端點');
  console.log('='.repeat(50));
  await testEndpoint(`${baseUrl}/api/functions`, 'Functions 列表');
  await testEndpoint(`${baseUrl}/api/v1/functions`, 'Functions V1');
  
  // 測試 5: 模型列表
  console.log('\n' + '='.repeat(50));
  console.log('測試 5: 模型端點');
  console.log('='.repeat(50));
  await testEndpoint(`${baseUrl}/api/models`, '模型列表');
  
  // 測試 6: 檢查認證
  console.log('\n' + '='.repeat(50));
  console.log('測試 6: 認證檢查');
  console.log('='.repeat(50));
  
  // 不帶 Authorization 測試
  console.log('\n🔍 測試: 無認證請求');
  try {
    const noAuthResponse = await axios.get(`${baseUrl}/api/tools`, {
      validateStatus: () => true
    });
    console.log(`   狀態碼: ${noAuthResponse.status}`);
    if (noAuthResponse.status === 401 || noAuthResponse.status === 403) {
      console.log('   ✅ 認證機制正常工作 (無認證被拒絕)');
    } else if (noAuthResponse.status === 200) {
      console.log('   ⚠️  端點可能不需要認證');
    }
  } catch (err) {
    console.log(`   ❌ 請求失敗: ${err.message}`);
  }
  
  // 測試 7: 嘗試獲取完整的工具配置
  console.log('\n' + '='.repeat(50));
  console.log('測試 7: 其他可能的端點');
  console.log('='.repeat(50));
  
  const otherEndpoints = [
    '/api/configs',
    '/api/pipelines',
    '/api/knowledge',
    '/api/tools/export',
    '/api/workspace/tools'
  ];
  
  for (const endpoint of otherEndpoints) {
    await testEndpoint(`${baseUrl}${endpoint}`, endpoint);
  }
  
  // 建議
  console.log('\n' + '='.repeat(50));
  console.log('🔍 診斷建議');
  console.log('='.repeat(50));
  
  console.log(`
1. 檢查 Open WebUI 界面:
   - 打開 ${baseUrl}
   - 進入 Settings → Tools/Functions
   - 確認是否真的有配置的工具
   - 確認工具是否已啟用

2. 檢查 API Key:
   - 確認 API Key 是否有效
   - 在 Open WebUI 界面: Settings → Account → API Keys
   - 嘗試重新生成 API Key

3. 檢查 Open WebUI 版本:
   - 不同版本的 API 路徑可能不同
   - 建議更新到最新版本

4. 查看 Open WebUI 日誌:
   - 檢查 Docker 日誌: docker logs open-webui
   - 或查看應用程序日誌文件

5. 嘗試 Swagger 文檔:
   - 設置環境變數: ENV=dev
   - 訪問: ${baseUrl}/docs
   - 查看實際可用的 API 端點
  `);
  
  console.log('\n==========================================');
  console.log('診斷完成!');
  console.log('==========================================\n');
}

// 執行診斷
diagnose().catch(err => {
  console.error('診斷失敗:', err.message);
  process.exit(1);
});