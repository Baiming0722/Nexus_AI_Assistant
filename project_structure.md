# Project_Structure

JupyterProject/                     # 項目根目錄
├── .idea/                          # PyCharm 項目配置
├── .ruff_cache/                    # Ruff 緩存目錄
├── .venv/                          # Python 虛擬環境
├── data/                           # 數據存放目錄
│   └── API.txt                     # API 相關信息
├── js/                             # JavaScript/Node.js 組件 (Discord 機器人與 Web 介面)
│   ├── cmd/                        # 機器人與系統指令目錄
│   │   ├── backup/                 # 指令備份
│   │   ├── chat/                   # 聊天相關子模塊
│   │   ├── chat.js                 # 核心聊天語音/文本處理
│   │   ├── help.js                 # 顯示幫助信息
│   │   ├── llm.js                  # 大模型參數與模型切換設置
│   │   ├── memory.js               # 記憶管理 (清除、切換)
│   │   ├── newchat.js              # 開啟新對話
│   │   └── redocmd.js              # 重啟指令運行
│   ├── data/                       # JS 組件運行數據 (如聊天歷史)
│   ├── getdata/                    # 數據獲取邏輯
│   ├── log/                        # 系統運行日誌
│   ├── serve/                      # 伺服器端核心邏輯 (Chroma, Discord, Ollama, OpenWebUI 等)
│   ├── test/                       # 測試與調試腳本
│   ├── tool/                       # 工具類函式 (檔案系統、日誌、Shell 操作等)
│   ├── web/                        # Web 前端介面資源 (HTML, JS, Assets)
│   ├── discord.js                  # Discord 集成入口
│   ├── index.js                    # JS 組件程序的啟動文件
│   ├── package.json                # Node.js 項目依賴與腳本
│   └── README.md                   # JS 組件使用說明
├── mcpo/                           # MCP (Model Context Protocol) 服務目錄
│   ├── disabled/                   # 暫時停用的服務備份
│   ├── calculator_server.py        # 計算器工具
│   ├── daily_life_server.py        # 日常生活輔助工具
│   ├── ffmpeg_server.py            # 影音處理工具
│   ├── filesystem_server.py        # 檔案操作工具
│   ├── get_time_server.py          # 時間獲取工具
│   ├── web_search_deeply_server.py # 深度網絡搜索工具
│   └── web_search_server.py        # 基礎網絡搜索工具
├── skill/                          # 技能目錄
│   ├── skills/                     # 技能 Markdown 文檔目錄
│   │   ├── backup/                 # 技能備份
│   │   ├── calculate/              # 數學計算技能
│   │   ├── choose_your_adventure/   # 互動冒險遊戲技能
│   │   ├── count_words/            # 字數統計技能
│   │   ├── debate_opponent/        # 辯論對手技能
│   │   ├── extract_keywords/       # 關鍵詞提取技能
│   │   ├── format_table/           # 表格格式化技能
│   │   ├── iot_car_control/        # IoT 小車控制技能
│   │   ├── prompt_enhancer/        # 提示詞優化技能
│   │   ├── roast_me/               # 吐槽技能
│   │   ├── structure_text/         # 文本結構化技能
│   │   ├── summarize_text/         # 文本摘要技能
│   │   └── tone_adjuster/          # 語氣調整技能
│   └── SKILL.md                    # 技能系統通用說明
├── .webui_secret_key               # Web UI 訪問金鑰
├── config.json                     # 項目全域配置文件
├── logo.png                        # 項目 Logo
├── nkust_website_.md               # 高科大網站相關抓取數據 (暫存/參考)
├── project_structure.md            # 當前項目結構說明文件 (本文件)
├── pyproject.toml                  # Python 配置與依賴管理 (uv)
├── README.md                       # 項目介紹與說明文檔
├── requirements.txt                # 依賴清單 (pip 格式)
├── start.txt                       # 啟動腳本說明或參數
├── update.md                       # 項目更新日誌
└── uv.lock                         # uv 依賴文件
