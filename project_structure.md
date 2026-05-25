# Project_Structure

JupyterProject/                     # 項目根目錄
├── .idea/                          # PyCharm 項目配置與環境設定
├── .ruff_cache/                    # Python 代碼格式化工具 Ruff 的緩存
├── .venv/                          # Python 虛擬環境目錄
├── data/                           # 核心數據存放目錄
│   └── API.txt                     # 存放 API Key、各服務端點與連線資訊
├── js/                             # JavaScript/Node.js 組件 (Discord 機器人、Web 介面與 Backend)
│   ├── cmd/                        # Discord 機器人與系統指令處理模組
│   │   ├── chat/                   # 聊天指令的核心子邏輯
│   │   │   ├── format.js           # 處理 LLM 輸出與 Discord 消息格式轉換
│   │   │   ├── history.js          # 對話歷史的讀取、寫入與長度控制
│   │   │   ├── mcpo.js             # 與 MCP 伺服器通訊的底層封裝
│   │   │   ├── skill.js            # 自訂技能 (Skill) 的加載與執行器
│   │   │   ├── toolExec.js         # Function Calling 工具執行調度器
│   │   │   └── tools.js            # 靜態工具定義與參數校驗
│   │   ├── backup/                 # 舊版指令或開發中的指令備份
│   │   ├── chat.js                 # /chat 核心指令 (整合文字、語音與附件)
│   │   ├── help.js                 # /help 指令 (動態生成功能清單)
│   │   ├── llm.js                  # /llm 指令 (即時切換模型或調整 Temperature)
│   │   ├── memory.js               # /memory 指令 (導出或清除對話記憶)
│   │   ├── newchat.js              # /newchat 指令 (強制開啟全新對話視窗)
│   │   └── redocmd.js              # 系統熱重載與指令註冊更新
│   ├── data/                       # 系統運行時所需的靜態配置與動態數據
│   │   ├── car/                    # IoT 小車相關數據
│   │   │   ├── car_log.json        # 小車運行軌跡與日誌
│   │   │   └── car_status.json     # 小車當前狀態 (速度、電量等)
│   │   ├── history/                # 頻道對話歷史存檔
│   │   │   ├── index.json          # 對話記錄索引表
│   │   │   └── *.json              # 各對話頻道的詳細 JSON 記錄
│   │   ├── config.json             # JS 組件的內部通用設定
│   │   ├── discorddata.json        # Discord Bot 密鑰與頻道 ID 配置
│   │   ├── llmprompt.json          # 預設的 System Role 與 Prompt 模板
│   │   ├── llmserver.json          # LLM 遠端 API 端點與連線超時設定
│   │   ├── llmtool.json            # 註冊給 LLM 的工具描述清單
│   │   ├── root.json               # 管理員 UUID 與權限清單
│   │   ├── tools_config.json       # 工具執行的白名單與權限設定
│   │   └── user.json               # 系統註冊用戶資訊與統計
│   ├── getdata/                    # 外部資源獲取與權限校驗模組
│   │   ├── crypto.js               # 加密與解密工具
│   │   ├── discord_Permission.js   # Discord 角色與權限過濾器
│   │   └── rootpassword.js         # 管理員密碼驗證邏輯
│   ├── log/                        # 系統運行日誌目錄 (由 Winston 自動生成與管理)
│   │   ├── error/                  # 錯誤日誌 (每日旋轉)
│   │   ├── info/                   # 一般運行日誌
│   │   └── success/                # 成功執行工具的稽核日誌
│   ├── serve/                      # 伺服器端核心服務與協議集成
│   │   ├── car.js                  # MQTT Broker 連接與小車通訊控制
│   │   ├── chroma.js               # 向量數據庫連接與檢索服務
│   │   ├── discord.js              # Discord 客戶端生命週期管理
│   │   ├── ollama.js               # 局部 LLM (Ollama) 適配器
│   │   ├── openwebui.js            # OpenWebUI API 適配器
│   │   ├── php.js                  # 與 legacy 系統通訊的介面
│   │   └── server.js               # Express 主服務 (API 端點與 Socket.IO)
│   ├── test/                       # 開發測試與 API 除錯腳本
│   │   ├── debug_openwebui_api.js  # 測試與遠端 LLM API 的連接
│   │   ├── find_mcp_tool.js        # 掃描並列出當前可用的 MCP 工具
│   │   └── test_chat_with_tools.js # 模擬完整對話流程測試
│   ├── tool/                       # 通用工具函式庫
│   │   ├── fs.js                   # 封裝後的異步檔案操作工具
│   │   ├── log.js                  # 統一日誌輸出規範
│   │   ├── shell.js                # 用於執行系統指令的封裝 (Spawn/Exec)
│   │   ├── system_monitor.js       # 監控伺服器 CPU、內存與流量
│   │   └── user_data.js            # 用戶行為記錄與分析工具
│   ├── web/                        # Web 前端介面資源 (單頁面應用 SPA)
│   │   ├── assets/                 # 靜態樣式與前端邏輯
│   │   │   ├── common.css          # 全域 UI 設計規範 (暗色系)
│   │   │   └── common.js           # 前端通用的 DOM 操作工具
│   │   ├── root/                   # 管理員後台專屬資源
│   │   │   ├── car_monitor.js      # 小車即時監控面板
│   │   │   ├── root.html           # 後台管理主頁面
│   │   │   ├── root_core.js        # 後台狀態與事件處理
│   │   │   ├── rootcmd.html        # 系統指令遠端發送介面
│   │   │   ├── rootcmd.js          # 處理遠端指令回傳結果
│   │   │   ├── rootlogin.html      # 管理員登入窗口
│   │   │   ├── rootlogin_core.js   # 前端登入加密與提交
│   │   │   └── system.js           # 伺服器資源即時圖表邏輯
│   │   ├── chat.html               # 網頁版聊天室 UI
│   │   ├── chat_core.js            # 聊天室 WebSocket 與消息呈現
│   │   ├── favicon.png             # 瀏覽器標籤圖示
│   │   ├── index.html              # 系統入口/跳轉頁面
│   │   ├── index.js                # 首頁交互邏輯
│   │   └── security-warning.js     # 前端安全稽核與攔截
│   ├── discord.js                  # Discord 機器人啟動入口
│   ├── index.js                    # 專案 Node.js 總入口文件
│   ├── package.json                # 項目依賴與腳本定義 (npm)
│   └── README.md                   # JS 組件的開發規範說明
├── mcpo/                           # MCP (Model Context Protocol) 服務模組
│   ├── disabled/                   # 暫時備份或開發中的 MCP 服務
│   ├── calculator_server.py        # 支援複雜算式的計算器工具
│   ├── daily_life_server.py        # 日曆、提醒與生活助手工具
│   ├── ffmpeg_server.py            # FFmpeg 封裝，處理多媒體剪輯與轉碼
│   ├── filesystem_server.py        # 受限且安全的本地檔案讀寫服務
│   ├── get_time_server.py          # 時間與時區查詢服務
│   ├── web_search_deeply_server.py # 遞歸網頁爬取與深度內容分析
│   └── web_search_server.py        # 基於 Google/Bing 的基礎聯網工具
├── skill/                          # 技能系統 (自定義推論邏輯)
│   ├── skills/                     # 各類技能的實現資料夾 (包含 Prompt 與腳本)
│   │   ├── calculate/              # 數學推理技能
│   │   ├── iot_car_control/        # IoT 控制專屬指令
│   │   └── ...                     # 其他如 summarize_text, debate_opponent 等
│   └── SKILL.md                    # 技能定義、註冊規範與工具映射說明
├── .webui_secret_key               # Web UI 用於加密 Session 的私鑰
├── config.json                     # 項目全域配置 (定義 MCP 伺服器掛載與端口)
├── logo.png                        # 項目圖標 (400x400)
├── nkust_website_.md               # 高科大相關網頁數據參考 (爬蟲測試結果)
├── project_structure.md            # 本專案目錄結構詳解 (本文件)
├── pyproject.toml                  # Python 項目配置與 uv 依賴管理
├── README.md                       # 專案主說明文檔 (功能介紹、安裝指南)
├── requirements.txt                # Python 套件依賴清單 (pip 格式)
├── start.txt                       # 快速啟動命令與環境變數參考
├── update.md                       # 專案版本更新與 Bug 修復日誌
└── uv.lock                         # Python 依賴項精確鎖定版本
