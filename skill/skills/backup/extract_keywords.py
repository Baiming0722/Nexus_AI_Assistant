import sys
import json
import re
from collections import Counter

def main():
    if len(sys.argv) > 1:
        try:
            params = json.loads(sys.argv[1])
        except Exception:
            params = {}
    else:
        params = {}

    text = params.get("text", "")
    top_n = int(params.get("top_n", 10))

    stopwords = set("的了是在和有也都就不我你他她它我們你們他們這那個什麼怎麼為什麼因為所以但是however the a an is are was were be been being have has had do does did will would could should may might shall can".split())

    words = re.findall(r"[\w\u4e00-\u9fff]+", text.lower())
    words = [w for w in words if len(w) > 1 and w not in stopwords]

    if not words:
        print("⚠️ 未找到有效關鍵詞。")
        return

    counter = Counter(words)
    top_words = counter.most_common(top_n)

    lines = [f"## 關鍵詞（Top {len(top_words)}）\n"]
    for i, (word, count) in enumerate(top_words, 1):
        bar = "█" * min(count, 20)
        lines.append(f"{i:2}. `{word}` — 出現 {count} 次  {bar}")
    print("\n".join(lines))

if __name__ == "__main__":
    main()
