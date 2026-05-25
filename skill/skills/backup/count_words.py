import sys
import json
import re

def main():
    if len(sys.argv) > 1:
        try:
            params = json.loads(sys.argv[1])
        except Exception:
            params = {}
    else:
        params = {}

    text = params.get("text", "")

    paragraphs = [p for p in text.split("\n\n") if p.strip()]
    lines_count = len(text.splitlines())
    chars_with_space = len(text)
    chars_no_space = len(text.replace(" ", "").replace("\n", ""))
    words = re.findall(r"[\w\u4e00-\u9fff]+", text)
    word_count = len(words)
    chinese_chars = len(re.findall(r"[\u4e00-\u9fff]", text))
    english_words = len(re.findall(r"[a-zA-Z]+", text))

    print(f"""## 文字統計結果

| 項目 | 數值 |
|------|------|
| 總詞數（中英合計） | {word_count} |
| 中文字數 | {chinese_chars} |
| 英文單詞數 | {english_words} |
| 總字元數（含空白） | {chars_with_space} |
| 總字元數（不含空白） | {chars_no_space} |
| 行數 | {lines_count} |
| 段落數 | {len(paragraphs)} |""")

if __name__ == "__main__":
    main()
