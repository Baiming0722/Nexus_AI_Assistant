---
name: iot_car_control
description: 透過 MQTT 協定與智慧垃圾桶進行通訊，進行清潔任務模擬與垃圾桶狀態監控。
---

# Script Skill: iot_car_control

## 1. 系統架構與通訊協定

- **通訊協定**: MQTT (Message Queuing Telemetry Transport)
- **指令發佈主題 (Publish Topic)**: `trashbin/command`
- **狀態訂閱主題 (Subscribe Topic)**: `trashbin/status`
- **警告訂閱主題 (Alert Topic)**: `trashbin/alert`
- **資料格式**: 逗號分隔純字串 (CSV format)
- **MQTT Broker**: `broker.emqx.io`

## 2. 指令格式與控制指令

要控制智慧垃圾桶，需將特定的純字串發佈至 `trashbin/command` 主題。這與舊系統的 JSON 不同。

### 控制指令 (Command)

支援以下五種指令：

1. **`recyclable+1`**
   - **說明**: 新增一項可回收垃圾。
2. **`nonrecyclable+1`**
   - **說明**: 新增一項不可回收垃圾。
3. **`recyclable-1`**
   - **說明**: 移除一項可回收垃圾（數量需大於 0）。
4. **`nonrecyclable-1`**
   - **說明**: 移除一項不可回收垃圾（數量需大於 0）。
5. **`reset`**
   - **說明**: 模擬清理動作，將總量與垃圾計數歸零。

### 發送指令範例

```text
recyclable+1
```

## 3. 數據讀取與處理格式

系統會定期將最新的狀態資訊，以逗號分隔的字串格式發佈至 `trashbin/status`。

### 狀態數據欄位

格式為：`%d,%d,%d,%s,%d`，即：

1. **可回收數量 (`recyclableCount`)**: 整數，目前擁有的可回收垃圾數量。
2. **不可回收數量 (`nonRecyclableCount`)**: 整數，目前擁有的不可回收垃圾數量。
3. **總量 (`total`)**: 整數，前兩者的總和。
4. **最後更新時間 (`lastUpdate`)**: 字串，代表儀器開機後的執行時間。
5. **滿桶警告 (`alertActive`)**: 整數 (0 或 1)，當任何一種分類數量達到 3 則為 1 表示已滿。

### 數據接收範例

```text
1,2,3,01:15:30,1
```

## 4. 使用方式

透過本工具目錄下的 `.py` 腳本 (`iot_car_control.py`)，可以啟動對智慧垃圾桶的 MQTT 監聽與控制終端。

- 啟動後會自動連接 `broker.emqx.io`，訂閱狀態資訊並將其轉譯為友善介面。
- 開啟互動式終端，可以直接透過菜單送出增減垃圾等指令，並即時檢視回傳結果。

## 5. 配置參數說明

| 參數 | 預設值 | 說明 |
|------|--------|------|
| BROKER | broker.emqx.io | MQTT Broker 位址 |
| PORT | 1883 | MQTT Broker 連接埠 |
| TOPIC_COMMAND | trashbin/command | 指令發送主題 |
| TOPIC_STATUS | trashbin/status | 狀態接收主題 |
