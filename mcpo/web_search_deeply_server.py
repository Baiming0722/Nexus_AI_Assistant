    # pip install mcp httpx beautifulsoup4
# !/usr/bin/env python3

import httpx
from bs4 import BeautifulSoup
from mcp.server.fastmcp import FastMCP
import json
from urllib.parse import unquote, parse_qs, urlparse
import traceback
import asyncio

# 初始化 FastMCP
mcp = FastMCP("web_search_deeply")

@mcp.tool()
async def web_search_deeply(queries: list[str], limit_per_query: int = 3) -> str:
    """
    Perform a deep web search using multiple related queries.
    You should provide 3 slightly different but similar search queries to get more comprehensive results.

    Args:
        queries: A list of search query strings (e.g., 3 similar but different queries)
        limit_per_query: Maximum number of results to return per query (default: 3, max: 10)

    Returns:
        JSON string containing aggregated search results with title, url, and description
    """
    # 驗證並限制回傳結果的數量
    limit_per_query = min(max(1, limit_per_query), 10)

    all_results = []
    seen_urls = set()

    async def fetch_search(query: str):
        url = "https://html.duckduckgo.com/html/"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.5",
            "Content-Type": "application/x-www-form-urlencoded",
            "Referer": "https://duckduckgo.com/"
        }

        data = {
            "q": query,
            "b": "",
            "kl": "wt-wt"
        }

        try:
            async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
                response = await client.post(url, data=data, headers=headers)
                response.raise_for_status()

            soup = BeautifulSoup(response.text, 'html.parser')
            results = []

            # DuckDuckGo HTML 版本使用 .result 類別
            search_results = soup.find_all('div', class_='result')

            for element in search_results:
                if len(results) >= limit_per_query:
                    break

                # 找到標題和連結
                title_element = element.find('a', class_='result__a')

                # 找到描述
                snippet_element = element.find('a', class_='result__snippet')

                if title_element:
                    result_url = title_element.get('href', '')
                    title = title_element.get_text(strip=True)
                    description = snippet_element.get_text(strip=True) if snippet_element else ''

                    # DuckDuckGo 有時會用他們的重定向 URL，我們需要清理它
                    if result_url.startswith('//duckduckgo.com/l/?'):
                        # 嘗試從 URL 參數中提取真實 URL
                        try:
                            parsed = urlparse(result_url)
                            params = parse_qs(parsed.query)
                            if 'uddg' in params:
                                result_url = unquote(params['uddg'][0])
                        except:
                            pass

                    if title and result_url:
                        results.append({
                            "query": query,
                            "title": title,
                            "url": result_url,
                            "description": description
                        })
            return results
        except Exception as e:
            return [{"query": query, "error": str(e), "traceback": traceback.format_exc()}]

    # 並行處理多個查詢
    tasks = [fetch_search(query) for query in queries]
    results_lists = await asyncio.gather(*tasks)

    for res_list in results_lists:
        for res in res_list:
            if "error" in res:
                all_results.append(res)
            else:
                url = res["url"]
                if url not in seen_urls:
                    seen_urls.add(url)
                    all_results.append(res)

    # 如果沒有結果，返回調試信息
    if not all_results:
        debug_info = {
            "message": "No results found from DuckDuckGo",
            "queries": queries,
            "suggestion": "Try different queries or check your network connection"
        }
        return json.dumps([debug_info], indent=2, ensure_ascii=False)

    return json.dumps(all_results, indent=2, ensure_ascii=False)

if __name__ == "__main__":
    # 執行 MCP 伺服器
    mcp.run()
