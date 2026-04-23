import sys
import json
import re
import math

def main():
    if len(sys.argv) > 1:
        try:
            params = json.loads(sys.argv[1])
        except Exception:
            params = {}
    else:
        params = {}

    expression = params.get("expression", "").strip()

    if not re.match(r"^[\d\s\+\-\*\/\(\)\.\%\^]+$", expression):
        print(f"❌ 運算式包含不允許的字元：`{expression}`\n僅支援：數字、+、-、*、/、()、%、^")
        return

    expression_eval = expression.replace("^", "**")

    try:
        result = eval(
            expression_eval,
            {"__builtins__": {}},
            {"sqrt": math.sqrt, "pi": math.pi, "e": math.e},
        )
        print(f"## 計算結果\n\n`{expression}` = **{result}**")
    except ZeroDivisionError:
        print("❌ 除以零錯誤。")
    except Exception as e:
        print(f"❌ 計算失敗：{e}")

if __name__ == "__main__":
    main()
