    # pip install mcp httpx beautifulsoup4
# !/usr/bin/env python3

import httpx
from bs4 import BeautifulSoup
from mcp.server.fastmcp import FastMCP
import json
from urllib.parse import unquote, parse_qs, urlparse
import traceback

# 初始化 FastMCP
mcp = FastMCP("web-search")


# 修復方式1: 使用 @mcp.tool() 裝飾器直接在函數上（推薦）
@mcp.tool()
async def search(query: str, limit: int = 5) -> str:
    """
    Search the web using DuckDuckGo (no API key required)

    Args:
        query: Search query string
        limit: Maximum number of results to return (default: 5, max: 10)

    Returns:
        JSON string containing search results with title, url, and description
    """
    # 驗證並限制回傳結果的數量
    limit = min(max(1, limit), 10)

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

        for i, element in enumerate(search_results):
            if i >= limit:
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
                        "title": title,
                        "url": result_url,
                        "description": description
                    })

        # 如果沒有結果，返回調試信息
        if not results:
            debug_info = {
                "message": "No results found from DuckDuckGo",
                "query": query,
                "found_results": len(search_results),
                "suggestion": "Try a different query or check your network connection"
            }
            return json.dumps([debug_info], indent=2, ensure_ascii=False)

        return json.dumps(results, indent=2, ensure_ascii=False)

    except httpx.HTTPError as e:
        error_result = {
            "error": f"HTTP error: {str(e)}",
            "query": query
        }
        return json.dumps([error_result], indent=2, ensure_ascii=False)
    except Exception as e:
        error_result = {
            "error": f"Unexpected error: {str(e)}",
            "traceback": traceback.format_exc(),
            "query": query
        }
        return json.dumps([error_result], indent=2, ensure_ascii=False)

if __name__ == "__main__":
    # 執行 MCP 伺服器
    mcp.run()