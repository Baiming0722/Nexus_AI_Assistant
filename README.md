# LLM_mcpo_Discord_bot

## 介紹 (Introduction)

**LLM_mcpo_Discord_bot** 是一個整合了大型語言模型（LLM）與 Discord 平台的專案。它採用了**混合工具執行架構**，同時支援 **Model Context Protocol (MCP)** 伺服器與 **Skill** (自訂技能) 作為 LLM 的工具調用機制。

本專案的核心價值在於提供一個可擴展、模組化的架構，讓使用者可以透過 Discord 或 Web 介面與 LLM 互動，並賦予 LLM 執行網路搜尋、檔案操作、影音處理等能力。

## 核心功能 (Key Features)

- **多端互動介面**：
  - **Discord Bot**：提供直覺的文字與指令介面。
  - **Web Management UI**：即時監控系統狀態、管理日誌與配置。
- **強大的附件處理**：
  - 支援解析 `.txt`, `.json`, `.md`, `.pdf` 等多種文字格式。
  - 支援 `.jpg`, `.png` 圖片分析（需模型支援 Vision）。
- **混合工具執行 (Hybrid Tool Execution)**：
  - **MCP 工具呼叫**：整合多個 Python MCP 伺服器（計算器、影音處理、檔案系統、網路搜尋等）。
  - **Skill 系統**：動態執行腳本或基於 Prompt 的邏輯，支援多階段推論。
- **即時可觀測性**：
  - UI 介面可顯示即時的工具執行狀態與進度。
  - 詳細的日誌記錄與旋轉管理（Winston Daily Rotate File）。
- **IoT 整合**：
  - 支援透過 MQTT 協議控制 IoT 設備（如智慧小車、垃圾桶監控）。
  - 自動化的 Discord 通知提醒。

## 資料夾結構 (Project Structure)

| 資料夾/檔案 | 用途說明 |
| :--- | :--- |
| `/mcpo` | 基於 Python 的 **MCP 伺服器**，提供計算、FFmpeg、檔案操作等工具。 |
| `/skill` | **Skill 模組**，包含 `SKILL.md` 定義與各類自訂技能腳本。 |
| `/js` | 基於 Node.js 的核心組件，負責 Discord 機器人與 Web Backend。 |
| `/js/web` | Web 前端資源，包含管理介面與即時對話核心邏輯。 |
| `/js/cmd` | 指令處理核心，整合 MCP 與 Skill 的調度流程。 |
| `requirements.txt` | Python 環境依賴清單。 |
| `package.json` | Node.js 環境依賴清單。 |

## 安裝與設定 (Setup & Configuration)

### 1. 先決條件

- **Node.js** (v18+)
- **Python** (v3.11+) 與 `uv` 工具
- **LLM API** (如 OpenAI, Ollama, OpenWebUI)

### 2. 安裝步驟

1. **複製專案**

   ```bash
   git clone https://github.com/Baiming0722/LLM_mcpo_Discord_bot.git
   cd LLM_mcpo_Discord_bot
   ```

2. **安裝 Python 依賴**

   ```bash
   pip install -r requirements.txt
   ```

3. **安裝 Node.js 依賴**

   ```bash
   cd js
   npm install
   cd ..
   ```

### 3. 配置參數

- `config.json`: 全域 MCP 伺服器與工具配置。
- `js/data/discorddata.json`: Discord Bot Token 配置。
- `js/data/llmsever.json`: LLM API 位址與模型設定。

## 啟動流程 (Startup)

1. **啟動 MCP 代理伺服器**

   ```bash
   mcpo --config ./config.json --port 7861
   ```

2. **啟動核心組件 (Discord/Web)**

   ```bash
   node js/index.js
   ```

## 系統執行流程 (Architecture Flow)

1. **訊息接收**：從 Discord 或 Web 接收 User Prompt 與附件。
2. **上下文建構**：加載歷史記錄、可用工具列表 (MCP) 與技能 (Skill)。
3. **推論循環 (Inference Loop)**：
   - LLM 判斷是否需要呼叫工具或技能。
   - 系統執行對應工具（MCP 請求或腳本執行）。
   - 結果返回給 LLM 進行後續推論（支援多輪執行）。
4. **回覆生成**：將最終結果傳回使用者介面。

## 疑難排解 (Troubleshooting)

- **工具執行失敗**：檢查 `mcpo` 是否在 7861 埠口運行，並確認 `config.json` 路徑正確。
- **Discord 無回應**：檢查 Token 是否有效，且機器人具備足夠的頻道權限。
- **編碼問題**：Windows 環境請確保啟動環境已設為 UTF-8。

---
*Last updated: 2026-04-26*
