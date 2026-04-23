# LLM_mcpo_Discord_bot

## 介紹 (Introduction)

**LLM_mcpo_Discord_bot** 是一個整合了大型語言模型（LLM）與 Discord 平台的專案。  
它利用 **Model Context Protocol (MCP)** 伺服器作為 LLM 的工具調用機制。  
並透過 **MCP-to-OpenAPI Proxy** 將這些工具轉換為標準的 OpenAI 格式，任何支援 OpenAPI 的 LLM 服務（例如 OpenWebUI 或其他服務）都能夠存取並使用這些工具。

本專案的核心價值在於提供一個可擴展、模組化、簡單的架構。  
使用者可以在 **Discord** 透過自然語言與 LLM 互動，並執行需要外部資訊、程式碼執行或 LLM 原本做不到的任務。

  
## 功能 (Features)

本專案提供以下核心功能：

- **Discord 互動介面**：透過 Discord 機器人，提供直覺的文字和指令介面與 LLM 進行對話。
- **MCP 工具呼叫**：整合多個 MCP 伺服（如 `daily_life`、`web_search`、`filesystem` 等），賦予 LLM 查詢時間、網路搜尋、讀寫檔案等進階能力。
- **OpenAPI Proxy**：一個輕量級的代理伺服器，將底層的 MCP 服務轉換為標準的 **OpenAI Function Calling** 格式，確保與主流 LLM 服務的兼容性。
- **模組化架構**：Discord_bot、Open WebUI、OpenAPI Proxy Server、MCP Tool Server 各自獨立，易於維護和擴展。
- **日誌記錄**：詳細的日誌系統，用於追蹤機器人、代理伺服器和工具的運行狀態。

  
## 資料夾結構 (Project Structure)

本專案主要由4個獨立的組件構成：MCP Tool Server、OpenAPI Proxy Server、Open WebUI、Discord_bot。

| 資料夾/檔案 | 用途說明 |
| :--- | :--- |
| `/mcpo` | 包含所有基於 Python 撰寫的 **MCP Tool** ，例如 `web_search_server.py`、`daily_life_server.py` 等。 |
| `/js` | 包含基於 Node.js 撰寫的 **Discord_bot** 專案，負責處理 Discord 收發訊息以及與Open WebUI、OpenAPI Proxy Server通訊。 |
| `/js/tool` | Discord 機器人專用的輔助工具腳本，例如日誌記錄 (`log.js`)、檔案系統操作 (`fs.js`) 等。 |
| `/js/log` | 機器人運行時產生的日誌檔案。 |
| `/js/test` | 包含用於測試 MCP Tool Server 和 Discord_bot 功能的範例腳本。 |  
| `/js/jspackage.json` | Node.js 依賴清單，用於安裝 `/js` 機器人所需的函式庫。 |  
| `requirements.txt` | Python 依賴清單，用於安裝伺服器所需的函式庫。 |

  
## 安裝說明 (Installation)

本專案需要多個環境與服務協同工作。  

### 1. 先決需求 (Prerequisites)

- **JetBrains PyCharm** 該專案使用 PyCharm 進行開發，非必須安裝，若選擇安裝則可以直接建立專案並使用專案中的python運行。  
   https://www.jetbrains.com/pycharm/
- **Python** (v3.10 或更高版本)：用於運行 MCP Tool Server。  
  https://www.python.org/downloads/
- **Node.js** (v18 或更高版本)：用於運行 Discord_bot。  
  https://nodejs.org/en/download
- **Open WebUI** 作為 LLM 的前端介面和 API 服務端。  
  ```bash  
  pip install open-webui
  ```
- **mcpo**：Model Context Protocol-to-OpenAPI proxy server，用於運行OpenAPI Proxy Server、MCP Tool Server。  
  ```bash
  pip install mcpo
  ```

### 2. 啟動步驟

1. **OpenAPI Proxy Server**  
  Terminal 1
   ```bash
   mcpo --port 8000 -- uvx mcp-server-fetch
   ```

3. **MCP Tool Server**  
  Terminal 2
   ```bash
   mcpo --config ./config.json --port 7861
   ```

4. **Open WebUI**  
  Terminal 3
   ```bash
   open-webui serve --host localhost --port 7860
   ```
   
5. **Discord_bot**  
  Terminal 4
    ```bash
   cd js
   node index.js
   ```

### 3. 環境變數配置 (Environment Variables)

所有組件都需要正確的環境變數才能運行。

| 參數名稱 | 組件 | 說明 | 範例值 |
| :--- | :--- | :--- | :--- |
| `DISCORD_TOKEN` | Discord_bot | Discord 機器人的 Token。 | `YOUR_BOT_TOKEN` |
| `CLIENT_ID` | Discord_bot | Discord 機器人的 Client ID。 | `123456789012345678` |
| `OpenWebUI_URL` | Open WebUI | 訪問 LLM 的 URL（Open WebUI 的部署地址）。 | `http://localhost:7860` |
| `OpenWebUI_API` | Open WebUI | 訪問 LLM 所需的 API Key。 | `sk-xxxxxxxxxxxxxxxx` |

  
## 使用方式 (Usage)

### 1. 進入 Open WebUI 
- 啟動 Open WebUI 後大約等待10秒(加載時間視硬體效能變化)  
- 進入 Open WebUI(http://localhost:7860)   
- 註冊一個帳戶，並將語言改成繁體中文。  

### 2. 配置 MCP Tool
- 進入 Open WebUI(http://localhost:7860)  
- 使用者(右上角)->管理員設定->設定->外部工具，在此處即可配置MCP Tool。  
- 範例：  
  URL：http://localhost:8000  
  ID：mcpo  
  名稱：mcpo  
  描述：MCP OpenAPI Proxy  
    
  URL：http://localhost:7861/web_search  
  ID：web_search  
  名稱：web_search  
  描述：網路搜索
  
- 使用者(右上角)->管理員控制台->設定->模型，選擇支援 Function Calling 的 LLM，然後在控制選項中開啟 LLM 的原生 Function Calling 功能。  
**注意**：每個 MCP Tool 都需要單獨配置。

### 3. 配置 Discord_bot
- 將 /js/data/llmserver.json 中的參數修改為自己的，**ollama 的 apikey 不用填**。  
  {  
    "openwebui": {  
        "ip": "localhost:7860/api/chat/completions",  
        "models": "ollama list",  
        "model": "gemma3n:latest",  
        "apikey":"Bearer sk-XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"  
    },  
    "ollama":{  
        "ip": "localhost:11434/api/chat",  
        "models":"ollama list",  
        "model":"gemma3n:latest",  
        "apikey":""  
    }  
  }  
  
- 將 /js/data/discorddata.json 中的參數修改為自己的。  
  {  
    "token":"XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",  
    "prefix":"robot~",  
    "clientId": "XXXXXXXXXXXXXXXXXXX"  
  }  

### 4. 範例操作

在 Discord 頻道中，可以透過提特定指令與 Discord_bot 互動。  

- **一般對話**：  
  `robot~ chat 介紹自己。` (正常對話)  

- **調用 Tool**：  
  `robot~ chat Gemini 3.0的最新資訊。` (使用 `web_search` Tool)  

## 注意事項與疑難排解 (Notes & Troubleshooting)

| 問題 | 排除建議 |
| :--- | :--- |
| **Discord Bot 無回應** | 1. 檢查 `DISCORD_TOKEN` 和 `CLIENT_ID` 是否正確配置。 2. 檢查機器人是否已加入頻道且擁有發言權限。 3. 檢查 `/js/log` 中的日誌是否有啟動錯誤。 |
| **LLM 無法使用工具** | 1. 檢查 `/mcpo` 中的 Tool 是否已成功啟動，以及在 Open WebUI 中正確配置。 2. 檢查 **OpenAPI Proxy Server** 是否已正確配置並運行。 3. 檢查 **MCP Tool Server** 是否已正確配置並運行。 |
| **`requests.exceptions.ConnectionError`** | 這通常發生在 MCP 伺服器或代理伺服器啟動失敗或埠號被佔用時。請檢查埠號是否衝突，並確保所有服務都已啟動。 |
| **`npm install` 失敗** | 確保您的 Node.js 版本符合要求（v18+）。嘗試清除 npm 快取：`npm cache clean --force`。 |
| **Python 依賴錯誤** | 確保您使用的是 `python3` 和 `pip`，並且已在虛擬環境中安裝依賴：`python3 -m venv venv`，`source venv/bin/activate`，然後 `pip install -r requirements.txt`。 |
| **代理伺服器未提供** | **重要警告**：本專案的架構依賴一個未提供的 **MCP-to-OpenAPI 代理伺服器**。如果沒有這個組件，Discord Bot 將無法正確地將 LLM 的 Function Calling 請求轉發給 `/mcpo` 伺服器。您必須自行實現或尋找一個符合規範的代理服務。 |












