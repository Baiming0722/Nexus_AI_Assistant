# 更新紀錄 (Update Log)

## [2026-04-13]

### 系統維護與文件更新 (System Maintenance)

- **更新紀錄細節強化**：重構 `update.md`，為近期 major updates (4/11, 4/12) 補充技術細節，涵蓋 User ID 處理邏輯與歷史紀錄索引機制。

## [2026-04-12]

### 使用者識別與個人化同步 (User Identity & Personalization)

- **使用者資訊整合**：於 `js/cmd/chat.js` 實作 `userData` 解析，並在 System Prompt 注入「隱形識別區塊」(含 User ID、Locale、Display Name)，引導模型進行個體化回應。
- **多維度歷史映射**：升級 `js/cmd/chat/history.js` 的索引系統。`index.json` 現在支援 `userId` 與 `channelId` 的動態映射。
- **檔案命名規範化**：實作 `[ID]_[Guild]_[Channel]_[Time].json` 命名格式，提升本地對話資料庫的可讀性與管理效率。
- **Skill 參數代理機制**：在 `chat.js` 中實做 `[ATTACHMENT]` 預處理邏輯，系統會自動在 Skill 呼叫前將佔位符替換為完整的附件文本，解決模型輸出長度限制導致的總結失敗問題。

## [2026-04-11]

### 混合工具執行架構 (Hybrid Tool Execution)

- **多輪推論循環優化**：重構 `chat.js` 的 `while` 循環 (MAX_LOOPS = 5)，支援在單次對話中交錯呼叫 MCP 工具與自定義 Skill。
- **MCP 動態工具探測**：與本地 MCPO Proxy（Port 7861）深度整合，實作 `getAvailableTools` 動態同步功能，使機器人能即時載入新部署的 Python 工具。
- **使用紀錄追蹤 (Usage Log)**：新增 `usageLog` 序列化紀錄，視覺化呈現 MCP Server、Tool 以及 Skill 的執行順序與分工，優化除錯體驗。
- **多媒體環境優化**：於執行環境中強制設定 `PYTHONIOENCODING=utf-8` 並完成 FFmpeg 環境變數對接，確保多媒體 Skill 在不同語系 Windows 環境下的穩定性。

## [2026-03-25]

### 專案成果與文件

- **README 指引**：更新專案主說明文件以符合現階段架構。

### 環境與系統

- **搜尋索引更新**：`chroma.sqlite3` 索引庫更新。
- **啟動配置**：微調 `start.txt` 啟動參數。

## [2026-03-24]

### 技能系統升級 (Skill System)

- **技能執行優化**：重構 `js/cmd/chat/skill.js`，提升技能調用的效率。
- **技能規範更新**：更新 `skill/SKILL.md`，詳加規範自定義技能的開發流程。
- **Skill 資料夾重構**：完成技能分類目錄轉化為獨立資料夾。
- **多媒體技能翻譯**：完成 `skills` 目錄多媒體文件翻譯。

### 摘要功能更新

- **文本摘要文件**：更新 `summarize_text.md` 相關規範。

## [2026-03-23]

### 模組化重構 (Refactoring)

- **工具管理重組**：完成 `js/cmd/chat/` 下 `tools.js` 與 `toolExec.js` 的拆分，優化工具呼叫鏈。
- **基礎模組建立**：新增 `format.js` (格式化輸出) 與 `mcpo.js` (MCP 伺服器邏輯)。
- **歷史紀錄優化**：更新 `history.js` 以配合新的模組化架構。

### 功能與介面

- **工具使用追蹤**：實作 `mcp`、`tool` 及 `Skill` 使用紀錄順序顯示。
- **指令前綴更新**：完成全域 `/` 前綴切換。
- **記憶增強**：完成 `memory.js` 使用者識別功能。
