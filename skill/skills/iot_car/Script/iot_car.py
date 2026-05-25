"""
iot_car — 智慧垃圾桶狀態摘要與提醒工具

此腳本讀取由 car.js 服務寫入的本地 JSON 資料檔案：
  - car_status.json：最新一筆垃圾桶狀態
  - car_log.json  ：最近 N 筆歷史紀錄（最多 120 筆）

並依據資料產生：
  1. 目前狀態摘要
  2. 歷史趨勢分析（平均值、最大值、滿桶事件次數）
  3. 提醒訊息（滿桶警告、裝置離線判斷）

使用方式：
    python iot_car.py [--data-dir <路徑>] [--log-limit <N>]

預設 data-dir 指向 js/serve 的同級路徑 js/data/car/。
"""

import argparse
import json
import os
import sys
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Optional

# Windows 終端機預設編碼為 cp950，不支援部分 Unicode 字元；強制切換至 UTF-8 輸出
if sys.stdout.encoding and sys.stdout.encoding.lower() not in ("utf-8", "utf8"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")

# ============================================================================
# 常數設定
# ============================================================================

# 相對於此腳本所在位置（skill/skills/iot_car/Script/）往上四層後定位到 js/data/car
_SCRIPT_DIR = Path(__file__).resolve().parent
_DEFAULT_DATA_DIR = _SCRIPT_DIR.parents[3] / "js" / "data" / "car"

# 判斷「裝置可能離線」的閾值：超過此秒數未收到資料則提示
OFFLINE_THRESHOLD_SECONDS = 30

# 台灣時區 (UTC+8)
_TW_TZ = timezone(timedelta(hours=8))


# ============================================================================
# 資料讀取工具
# ============================================================================

def load_json_file(file_path: Path) -> Optional[object]:
    """
    讀取並解析 JSON 檔案。

    Args:
        file_path: JSON 檔案的絕對路徑

    Returns:
        解析後的 Python 物件；若檔案不存在或格式錯誤則返回 None
    """
    if not file_path.exists():
        print(f"[警告] 找不到檔案: {file_path}")
        return None

    try:
        with open(file_path, encoding="utf-8") as f:
            return json.load(f)
    except json.JSONDecodeError as err:
        print(f"[錯誤] 解析 JSON 失敗 ({file_path.name}): {err}")
        return None


def parse_iso_time(iso_string: str) -> Optional[datetime]:
    """
    將 ISO 8601 字串轉換為帶時區的 datetime 物件。

    Args:
        iso_string: 形如 '2026-04-28T16:27:21.486Z' 的字串

    Returns:
        datetime 物件（UTC 時區）；解析失敗時返回 None
    """
    if not iso_string:
        return None
    try:
        # Python 3.7+ 可直接解析末尾帶 Z 的 ISO 格式
        return datetime.fromisoformat(iso_string.replace("Z", "+00:00"))
    except ValueError:
        return None


# ============================================================================
# 狀態摘要
# ============================================================================

def summarize_current_status(status: dict) -> str:
    """
    將最新一筆垃圾桶狀態格式化為易讀摘要文字。

    Args:
        status: car_status.json 解析後的字典

    Returns:
        多行摘要字串
    """
    received_at_utc = parse_iso_time(status.get("receivedAt", ""))
    if received_at_utc:
        received_at_tw = received_at_utc.astimezone(_TW_TZ)
        received_str = received_at_tw.strftime("%Y-%m-%d %H:%M:%S")
    else:
        received_str = "（未知）"

    category_zh = status.get("category_zh", "未知")
    target_bin = status.get("target_bin", "無")
    recyclable = status.get("recyclableCount", 0)
    non_recyclable = status.get("nonRecyclableCount", 0)
    total = status.get("total", 0)
    fill_percent = status.get("fill_percent", 0)
    last_update = status.get("lastUpdate", "--:--:--") or "--:--:--"
    alert_active = status.get("alertActive", False)
    full_bucket = status.get("full_bucket", "無")
    distance_cm = status.get("distance_cm", -1.0)
    object_present = status.get("object_present", False)

    alert_label = f"⚠️  滿桶 ({full_bucket})" if alert_active else "✅ 狀態正常"
    obj_label = "有物體" if object_present else "無物體"

    lines = [
        "┌─────────────────────────────────────┐",
        "│       🗑️  智慧垃圾桶 — 最新狀態      │",
        "├─────────────────────────────────────┤",
        f"│  資料接收時間 : {received_str:<20} │",
        f"│  裝置運行時間 : {last_update:<20} │",
        "├─────────────────────────────────────┤",
        f"│  🏷️  最後辨識    : {category_zh:<18} │",
        f"│  🎯 建議桶別    : {target_bin:<18} │",
        "├─────────────────────────────────────┤",
        f"│  ♻️  可回收數量  : {recyclable:<18} │",
        f"│  🗑️  不可回收數量: {non_recyclable:<18} │",
        f"│  📦 總數量      : {total} ({fill_percent}%)           ",
        "├─────────────────────────────────────┤",
        f"│  📏 超音波距離  : {distance_cm:>6.2f} cm          │",
        f"│  👀 物體偵測    : {obj_label:<18} │",
        "├─────────────────────────────────────┤",
        f"│  📢 系統狀態    : {alert_label:<18} │",
        "└─────────────────────────────────────┘",
    ]
    return "\n".join(lines)


# ============================================================================
# 歷史紀錄分析
# ============================================================================

def analyze_history(log: list, limit: int) -> str:
    """
    分析最近 N 筆歷史紀錄，計算平均值、最大值與滿桶事件次數。

    Args:
        log:   car_log.json 解析後的串列（已按時間升序排列）
        limit: 僅分析最後 N 筆紀錄

    Returns:
        多行分析結果字串
    """
    if not log:
        return "（無歷史資料可供分析）"

    # 取最後 limit 筆
    recent = log[-limit:] if len(log) > limit else log
    count = len(recent)

    recyclable_values = [r.get("recyclableCount", 0) for r in recent]
    non_recyclable_values = [r.get("nonRecyclableCount", 0) for r in recent]
    total_values = [r.get("total", 0) for r in recent]
    alert_events = sum(1 for r in recent if r.get("alertActive", False))

    avg_recyclable = sum(recyclable_values) / count
    avg_non_recyclable = sum(non_recyclable_values) / count
    avg_total = sum(total_values) / count

    max_recyclable = max(recyclable_values)
    max_non_recyclable = max(non_recyclable_values)
    max_total = max(total_values)

    lines = [
        f"【歷史趨勢分析（最近 {count} 筆紀錄）】",
        "",
        f"  {'項目':<12} {'平均':>8}   {'最高':>8}",
        f"  {'-'*34}",
        f"  {'可回收':<12} {avg_recyclable:>8.2f}   {max_recyclable:>8}",
        f"  {'不可回收':<12} {avg_non_recyclable:>8.2f}   {max_non_recyclable:>8}",
        f"  {'總數量':<12} {avg_total:>8.2f}   {max_total:>8}",
        "",
        f"  🚨 滿桶事件次數: {alert_events} 次（佔比 {alert_events / count * 100:.1f}%）",
    ]
    return "\n".join(lines)


# ============================================================================
# 提醒系統
# ============================================================================

def generate_alerts(status: dict) -> list[str]:
    """
    依據最新狀態產生提醒訊息列表。

    提醒規則：
    1. alertActive == True  → 滿桶警告
    2. 資料接收時間距今超過 OFFLINE_THRESHOLD_SECONDS → 疑似裝置離線
    3. 資料為預設空值（全為 0 且 raw 為空）→ 等待裝置初始化提醒

    Args:
        status: car_status.json 解析後的字典

    Returns:
        提醒字串列表；若無任何提醒則為空列表
    """
    alerts = []

    # 規則 1：滿桶警告
    if status.get("alertActive", False):
        full_bucket = status.get("full_bucket", "未知位置")
        recyclable = status.get("recyclableCount", 0)
        non_recyclable = status.get("nonRecyclableCount", 0)
        total = status.get("total", 0)
        distance = status.get("distance_cm", -1.0)
        alerts.append(
            f"🚨 [滿桶警告] 垃圾桶已滿 ({full_bucket})！"
            f" 可回收: {recyclable} | 不可回收: {non_recyclable} | 總量: {total} | 距離: {distance:.2f}cm"
        )

    # 規則 2：裝置離線偵測
    received_at_utc = parse_iso_time(status.get("receivedAt", ""))
    if received_at_utc:
        now_utc = datetime.now(timezone.utc)
        elapsed_seconds = (now_utc - received_at_utc).total_seconds()
        if elapsed_seconds > OFFLINE_THRESHOLD_SECONDS:
            elapsed_minutes = int(elapsed_seconds // 60)
            if elapsed_minutes > 0:
                elapsed_str = f"{elapsed_minutes} 分鐘"
            else:
                elapsed_str = f"{int(elapsed_seconds)} 秒"
            alerts.append(
                f"⚠️  [裝置離線] 已超過 {elapsed_str} 未收到新資料，"
                f"請確認 IoT 裝置或 MQTT 服務是否正常運行。"
            )

    # 規則 3：等待裝置初始化
    is_empty_state = (
        status.get("recyclableCount", 0) == 0
        and status.get("nonRecyclableCount", 0) == 0
        and not status.get("raw", "")
    )
    if is_empty_state and not alerts:
        alerts.append(
            "ℹ️  [等待初始化] 目前尚未收到有效裝置資料，"
            "服務可能剛啟動或裝置尚未上線。"
        )

    return alerts


# ============================================================================
# 主程式
# ============================================================================

def main():
    """
    主程式入口：解析引數、讀取資料、輸出摘要與提醒。
    """
    parser = argparse.ArgumentParser(
        description="智慧垃圾桶狀態摘要與提醒工具（讀取本地 JSON 資料）"
    )
    parser.add_argument(
        "--data-dir",
        type=str,
        default=str(_DEFAULT_DATA_DIR),
        help=f"car_status.json / car_log.json 所在目錄（預設: {_DEFAULT_DATA_DIR}）",
    )
    parser.add_argument(
        "--log-limit",
        type=int,
        default=20,
        help="歷史紀錄分析筆數上限（預設: 20）",
    )
    args = parser.parse_args()

    data_dir = Path(args.data_dir)
    status_file = data_dir / "car_status.json"
    log_file = data_dir / "car_log.json"

    print(f"\n📂 資料目錄: {data_dir}")
    print("=" * 45)

    # ── 1. 讀取最新狀態 ──────────────────────────────
    status = load_json_file(status_file)
    if status is None:
        print("[錯誤] 無法讀取 car_status.json，程式結束。")
        sys.exit(1)

    print()
    print(summarize_current_status(status))

    # ── 2. 讀取歷史紀錄並分析 ────────────────────────
    log = load_json_file(log_file)
    print()
    if isinstance(log, list):
        print(analyze_history(log, args.log_limit))
    else:
        print("（無法讀取 car_log.json，略過歷史分析）")

    # ── 3. 提醒系統 ──────────────────────────────────
    alerts = generate_alerts(status)
    print()
    if alerts:
        print("【系統提醒】")
        for alert in alerts:
            print(f"  {alert}")
    else:
        print("【系統提醒】無異常，裝置運作正常。")

    print()


if __name__ == "__main__":
    main()
