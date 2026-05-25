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
    max_points = int(params.get("max_points", 5))

    sentences = re.split(r"[。！？.!?]\s*", text)
    sentences = [s.strip() for s in sentences if len(s.strip()) > 10]

    if not sentences:
        print("⚠️ 文字過短，無法摘要。")
        return

    scored = []
    total = len(sentences)
    for i, s in enumerate(sentences):
        position_score = 1.0 - (i / total) * 0.5
        length_score = min(len(s) / 100, 1.0)
        scored.append((position_score + length_score, s))

    scored.sort(reverse=True)
    top = scored[:max_points]

    order = {s: i for i, (_, s) in enumerate(scored)}
    top_sentences = sorted([s for _, s in top], key=lambda x: order.get(x, 0))

    lines = [f"## 摘要（{len(top_sentences)} 個重點）\n"]
    for i, s in enumerate(top_sentences, 1):
        lines.append(f"{i}. {s}")
    
    print("\n".join(lines))

if __name__ == "__main__":
    main()
