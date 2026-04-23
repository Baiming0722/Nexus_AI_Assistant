# Skill 定義文件

本文件定義所有可用的 Skill。系統（或主控端 LLM）會讀取此文件，並依據使用者意圖選用相關的 Prompt 邏輯。

---

## Skill: summarize_text

**描述**: 將輸入的長文字摘要成重點條列。（本功能為 Prompt Skill，直接由 LLM 解析與執行提示詞）。

**參數**:

- `text` (str, 必填): 要摘要的原始文字
- `max_points` (int, 選填, 預設=5): 最多幾個重點

**執行邏輯**:

1. 讀取 `skills/summarize_text/summarize_text.md` 作為 System Prompt
2. 利用 LLM 依據 Prompt 將文字摘要為重點條列
3. 直接回傳摘要後的 Markdown 文本

---

## Skill: extract_keywords

**描述**: 從文字中提取關鍵詞。（本功能為 Prompt Skill，直接由 LLM 解析與執行提示詞）。

**參數**:

- `text` (str, 必填): 輸入文字
- `top_n` (int, 選填, 預設=10): 回傳幾個關鍵詞

**執行邏輯**:

1. 讀取 `skills/extract_keywords/extract_keywords.md` 作為 System Prompt
2. 利用 LLM 依據 Prompt 提取核心關鍵字
3. 直接回傳關鍵字的 Markdown 文本

---

## Skill: format_table

**描述**: 將結構化或半結構化資料格式化成 Markdown 表格，支援 JSON、CSV、TSV、鍵值對等多種格式。（本功能為 Prompt Skill，直接由 LLM 解析與執行提示詞）。

**參數**:

- `data` (str, 必填): 待排版的結構化資料，例如 JSON 陣列 `[{"name":"Alice","age":30}]`、CSV 字串或鍵值對文字
- `title` (str, 選填): 表格標題

**執行邏輯**:

1. 讀取 `skills/format_table/format_table.md` 作為 System Prompt
2. 利用 LLM 依據 Prompt 解析資料、提取欄位並整理資料列
3. 直接回傳排版後的 Markdown 表格文字

---

## Skill: calculate

**描述**: 執行數學運算式計算。（本功能為 Prompt Skill，直接由 LLM 解析與執行提示詞）。

**參數**:

- `expression` (str, 必填): 數學運算式，例如 `(3 + 5) * 2 / 4`

**執行邏輯**:

1. 讀取 `skills/calculate/calculate.md` 作為 System Prompt
2. 利用 LLM 依據 Prompt 計算數學運算式結果
3. 直接回傳計算結果的 Markdown 文本

---

## Skill: count_words

**描述**: 統計文字的字數、字元數、段落數等多維度資訊。（本功能為 Prompt Skill，直接由 LLM 解析與執行提示詞）。

**參數**:

- `text` (str, 必填): 輸入文字

**執行邏輯**:

1. 讀取 `skills/count_words/count_words.md` 作為 System Prompt
2. 利用 LLM 依據 Prompt 逐字元統計文字數據
3. 直接回傳統計報告的 Markdown 表格

---

## Skill: structure_text

**描述**: 根據使用者輸入的內容進行規格化、表格化與結構化，但不更改原始語意或內容。（本功能為 Prompt Skill，直接由 LLM 解析與執行提示詞）。

**參數**:

- `text` (str, 必填): 欲被重新排版與結構化的原始內容

**執行邏輯**:

1. 讀取 `skills/structure_text/structure_text.md` 作為 System Prompt
2. 利用 LLM 依據 Prompt 重構內容排版
3. 直接回傳排版後的規格化 Markdown 文本

---

## Skill: choose_your_adventure

**描述**: 文字冒險 RPG 遊戲。（本功能為 Prompt Skill，直接由 LLM 解析與執行提示詞）。

**參數**:

- `action` (str, 選填, 預設=首回合無): 玩家的選擇或自定義輸入
- `theme` (str, 選填, 預設=隨機): (僅初始設定) 故事主題

**執行邏輯**:

1. 讀取 `skills/choose_your_adventure/choose_your_adventure.md` 作為 System Prompt
2. 利用 LLM 依據 Prompt 執行對應邏輯
3. 直接回傳執行結果的 Markdown 文本

---

## Skill: debate_opponent

**描述**: 邏輯嚴密、言辭犀利且具有強烈鬥爭心的「辯論對手」(Debate Opponent)。（本功能為 Prompt Skill，直接由 LLM 解析與執行提示詞）。

**參數**:

- `text` (str, 必填): 使用者提出的觀點或論述
- `aggression` (str, 選填, 預設=高): 攻擊性與詞鋒利度

**執行邏輯**:

1. 讀取 `skills/debate_opponent/debate_opponent.md` 作為 System Prompt
2. 利用 LLM 依據 Prompt 執行對應邏輯
3. 直接回傳執行結果的 Markdown 文本

---

## Skill: prompt_enhancer

**描述**: 咒語強化大師。（本功能為 Prompt Skill，直接由 LLM 解析與執行提示詞）。

**參數**:

- `text` (str, 必填): 使用者原始的任務指令
- `language` (str, 選填, 預設=繁體中文): 生成的提示詞語言

**執行邏輯**:

1. 讀取 `skills/prompt_enhancer/prompt_enhancer.md` 作為 System Prompt
2. 利用 LLM 依據 Prompt 執行對應邏輯
3. 直接回傳執行結果的 Markdown 文本

---

## Skill: roast_me

**描述**: 毒舌喜劇演員。（本功能為 Prompt Skill，直接由 LLM 解析與執行提示詞）。

**參數**:

- `text` (str, 必填): 使用者求吐槽的話語、自介或情境

**執行邏輯**:

1. 讀取 `skills/roast_me/roast_me.md` 作為 System Prompt
2. 利用 LLM 依據 Prompt 執行對應邏輯
3. 直接回傳執行結果的 Markdown 文本

---

## Skill: tone_adjuster

**描述**: 語氣轉換器。（本功能為 Prompt Skill，直接由 LLM 解析與執行提示詞）。

**參數**:

- `text` (str, 必填): 原始文字內容
- `tone` (str, 必填): 目標語氣或角色設定

**執行邏輯**:

1. 讀取 `skills/tone_adjuster/tone_adjuster.md` 作為 System Prompt
2. 利用 LLM 依據 Prompt 執行對應邏輯
3. 直接回傳執行結果的 Markdown 文本
