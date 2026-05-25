import sys
import json

def main():
    if len(sys.argv) > 1:
        try:
            params = json.loads(sys.argv[1])
        except Exception:
            params = {}
    else:
        params = {}

    raw = params.get("data", "[]")
    title = params.get("title", "")

    try:
        data = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"❌ JSON 解析失敗：{e}")
        return

    if not isinstance(data, list) or not data:
        print("❌ 資料必須是非空的 JSON 陣列。")
        return

    all_keys = []
    for row in data:
        for k in row.keys():
            if k not in all_keys:
                all_keys.append(k)

    lines = []
    if title:
        lines.append(f"## {title}\n")

    header = "| " + " | ".join(all_keys) + " |"
    separator = "| " + " | ".join(["---"] * len(all_keys)) + " |"
    lines.append(header)
    lines.append(separator)

    for row in data:
        cells = [str(row.get(k, "")) for k in all_keys]
        lines.append("| " + " | ".join(cells) + " |")

    lines.append(f"\n共 {len(data)} 筆資料")
    print("\n".join(lines))

if __name__ == "__main__":
    main()
