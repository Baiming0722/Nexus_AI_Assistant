# LLM_mcpo_Discord_bot

## 介紹 (Introduction)

**LLM_mcpo_Discord_bot** 是一個整合了大型語言模型（LLM）與 Discord 平台的專案。它採用了**混合工具執行架構**，同時支援 **Model Context Protocol (MCP)** 伺服器與 **Skill** (自訂技能) 作為 LLM 的工具調用機制。

本專案的核心價值在於提供一個可擴展、模組化的架構，讓 Discord 使用者可以透過自然語言與 LLM 互動，並賦予 LLM 執行程式碼、網路搜尋、讀取檔案甚至分析圖片與附件的能力，藉此完成複雜的任務。

## 功能 (Features)

本專案提供以下核心功能：

- **Discord 互動介面**：透過 Discord 機器人，提供直覺的文字和指令介面與 LLM 進行對話。
- **多媒體附件處理**：支援解析 Discord 訊息中的多種檔案附件（包含 `.txt`, `.json`, `.md` 及 `.jpg`, `.png` 圖片），使 LLM 能直接讀取與理解檔案內容。
- **混合工具執行 (Hybrid Tool Execution)**：
  - **MCP 工具呼叫**：整合多個基於 MCPO 運行的伺服器（如 `code_runner`, `web_search`, `file_reader` 等），直接與本機連接。
  - **Skill (自訂技能)**：支援直接執行獨立的腳本（如 `.py`, `.js`, `.md`）或基於 Prompt 的邏輯，由 LLM 動態決定所需的 Skill 並進行多階段推論（Multi-Round Inference），大幅提升靈活性。
- **動態工具發現**：系統會在背景自動向 `mcpo` 伺服器查詢並更新可用的工具清單。
- **日誌記錄**：詳細的日誌系統，用於追蹤機器人、執行歷程與工具的運行狀態。

## 資料夾結構 (Project Structure)

本專案主要由 MCP、Skill、Node.js 以及 Discord 機器人組成。

| 資料夾/檔案 | 用途說明 |
| :--- | :--- |
| `/mcpo` | 包含所有基於 Python 的 **MCP 工具伺服器** 腳本，例如 `web_search_server.py`、`filesystem_server.py` 等。 |
| `/skill` | **Skill 模組**，包含 `SKILL.md` (定義所有自訂技能) 以及 `/skills` 資料夾下的所有獨立執行腳本或 Prompt 描述檔。 |
| `/js` | 包含基於 Node.js 的 **Discord LLM 機器人** 程式碼，負責處理 Discord 訊息、對話歷史管理以及與 LLM API 通訊。 |
| `/js/cmd` | Discord 機器人核心指令模組（如 `chat.js`），負責整合 MCP 與 Skill 的多軌執行流程。 |
| `/js/cmd/chat` | `chat` 指令的子模組，包含對話歷史 (`history.js`)、工具執行 (`toolExec.js`)、Skill 調度 (`skill.js`) 等。 |
| `/js/tool` | Discord 機器人專用的輔助工具模組，例如日誌記錄 (`log.js`)、檔案系統操作 (`fs.js`) 等。 |
| `/js/data` | 儲存機器人與 LLM 運行的設定檔、Prompt 及頻道的對話歷史（`history` 資料夾）。 |
| `requirements.txt` / `pyproject.toml` | Python 依賴清單與專案配置，用於安裝 `/mcpo` 伺服器所需的函式庫。 |
| `package.json` | Node.js 依賴清單，用於安裝 `/js` 機器人所需的函式庫。 |

## 安裝說明 (Installation)

本專案需要多個環境與服務協同工作。

### 1. 先決需求 (Prerequisites)

- **Node.js** (v18 或更高版本)：用於運行 Discord 機器人。
- **Python** (v3.10 或更高版本) 及 `uv` 環境管理工具：用於運行 MCP 工具伺服器與 Skill。
- **LLM 服務端點**：支援 OpenAI Function Calling 的 LLM 服務 (如 OpenWebUI、Ollama 等)。
- **Git**：用於複製專案儲存庫。

### 2. 安裝步驟

1. **複製專案儲存庫**
   ```bash
   git clone https://github.com/Baiming0722/LLM_mcpo_Discord_bot.git
   cd LLM_mcpo_Discord_bot
   ```

2. **安裝 Python 依賴 (MCP 伺服器)**
   ```bash
   pip install -r requirements.txt
   ```

3. **安裝 Node.js 依賴 (Discord 機器人)**
   ```bash
   cd js
   npm install
   cd ..
   ```

### 3. 配置參數

在專案中主要的設定皆由 JSON 檔案管理：

- `/config.json`: MCPO 的伺服器配置檔，用來定義所有掛載的 `/mcpo` Python 腳本及 npx 工具。
- `/js/data/discorddata.json`: 存放 Discord 機器人的 Token (`login.token`) 等資訊。
- `/js/data/llmsever.json`: 定義 LLM 服務的 API 網址、模型名稱及 API Key。

## 使用方式 (Usage)

本專案的啟動流程涉及多個獨立服務的依序啟動。

### 1. 啟動 MCPO 代理伺服器

執行 MCPO 工具將各個 MCP 伺服器啟動於對應埠號。依照設定檔 `config.json` 啟動：

```bash
mcpo --config ./config.json --port 7861
```
> **注意**：預設在 `7861` 埠口運行，`chat.js` 將直接向 `http://localhost:7861` 請求並探測可用的 MCP 工具。

### 2. 啟動 Discord LLM 機器人

最後，啟動 Discord 機器人。

```bash
node js/index.js
```

### 3. 範例操作

在 Discord 頻道中，您可以使用設定的前綴指令來與其互動。

- **一般對話與工具**：
  `/chat 幫我查一下今天的國際新聞並總結重點。` 
  *(機器人可能會觸發 MCPO 的 `web_search_server` 和使用 `summarize_text` Skill 來處理)*
- **支援檔案附件**：
  直接在 Discord 上傳一張 `.jpg` 圖片並附加文字：`/chat 分析這張圖片的內容`。
  上傳 `.txt` 檔案並附加文字：`/chat 總結內容`。

## 系統執行流程 (Architecture Flow)

當收到 Discord 訊息後，系統會進行以下流程：
1. **處理附件**：如果有附件文字或圖片，會進行下載並準備餵給 LLM。
2. **準備上下文**：載入對話歷史、讀取 `/skill/SKILL.md`，並透過 API 與 `localhost:7861` 獲取當前可用的 MCP 工具列表。
3. **推論循環 (Inference Loop)**：系統支援最大 5 輪的循環調用。
   - LLM 根據 System Prompt 判斷是否需要呼叫 Skill。若需要，會回傳特定 JSON 格式。
   - 若 LLM 選擇呼叫 MCP 工具，則觸發標準的 Function Calling 流程。
4. **執行工具/Skill**：
   - **MCP 工具**：向 `localhost:7861` 發送請求並取得結果。
   - **Skill**：透過 `/js/cmd/chat/skill.js` 執行腳本或讀取 Prompt 描述檔，支援傳入 `[ATTACHMENT]` 佔位符以處理大型附件內容。
5. **後續推論**：將工具或 Skill 執行的結果回填至對話歷史中，讓 LLM 繼續進行推論，直到產生最終回覆。

## 注意事項與疑難排解 (Notes & Troubleshooting)

| 問題 | 排除建議 |
| :--- | :--- |
| **Discord Bot 無回應** | 1. 檢查 `/js/data/discorddata.json` 使否正確配置 Token。 2. 檢查機器人是否已加入頻道且擁有讀取及發送訊息的權限。 3. 確認終端機 `js` 啟動 log 是否報錯。 |
| **LLM 解釋不了附件** | 1. 確認該模型本身是否有支援 Vision 功能（針對圖片）。 2. 確認網路環境是否阻擋了 Discord 靜態資源的下載。 |
| **工具或 Skill 執行失敗** | 1. 檢查 `mcpo` 背景是否正常執行。 2. 觀察終端機中 `[Skill CMD]` 開頭的日誌，確認執行的 `python` 或 `node` 指令參數是否正確。 |
| **編碼錯誤 (UnicodeEncodeError)** | Windows 環境下，確保 Python 環境變數已設定 `PYTHONIOENCODING=utf-8`，預設系統在啟動腳本時已經處理過本項。 |
