"""
時間日期 MCP Server
提供取得當前日期和時間的功能。

    # pip install mcp
"""

from datetime import datetime
from typing import Any
import json

from mcp.server.models import InitializationOptions
import mcp.types as types
from mcp.server import NotificationOptions, Server
import mcp.server.stdio

# 初始化 MCP server
server = Server("get_time")


@server.list_tools()
async def handle_list_tools() -> list[types.Tool]:
    """列出所有可用的工具"""
    return [
        types.Tool(
            name="get_current_date",
            description="取得當前日期",
            inputSchema={
                "type": "object",
                "properties": {},
                "required": []
            }
        ),
        types.Tool(
            name="get_current_time",
            description="取得當前時間",
            inputSchema={
                "type": "object",
                "properties": {},
                "required": []
            }
        ),
        types.Tool(
            name="get_datetime",
            description="同時取得當前日期和時間",
            inputSchema={
                "type": "object",
                "properties": {
                    "format": {
                        "type": "string",
                        "description": "輸出格式：'short'（簡短）, 'medium'（中等）, 'long'（完整）",
                        "enum": ["short", "medium", "long"]
                    }
                }
            }
        )
    ]


@server.call_tool()
async def handle_call_tool(
        name: str, arguments: dict[str, Any] | None
) -> list[types.TextContent | types.ImageContent | types.EmbeddedResource]:
    """處理工具呼叫"""

    if arguments is None:
        arguments = {}

    try:
        if name == "get_current_date":
            result = get_current_date()
        elif name == "get_current_time":
            result = get_current_time()
        elif name == "get_datetime":
            result = get_datetime(arguments)
        else:
            raise ValueError(f"未知的工具: {name}")

        return [types.TextContent(type="text", text=result)]

    except Exception as e:
        error_result = json.dumps({
            "success": False,
            "error": str(e),
            "message": f"執行 {name} 時發生錯誤"
        }, ensure_ascii=False, indent=2)

        return [types.TextContent(type="text", text=error_result)]


def get_current_date() -> str:
    """
    取得當前日期
    :return: 當前日期字串
    """
    current_date = datetime.now().strftime("%A, %B %d, %Y")
    return f"今天的日期是 {current_date}"


def get_current_time() -> str:
    """
    取得當前時間
    :return: 當前時間字串
    """
    current_time = datetime.now().strftime("%H:%M:%S")
    return f"當前時間：{current_time}"


def get_datetime(params: dict[str, Any]) -> str:
    """
    取得當前日期和時間
    :param params: 參數字典，可包含 format 鍵
    :return: 格式化的日期時間字串
    """
    now = datetime.now()
    format_type = params.get("format", "medium")

    if format_type == "short":
        # 簡短格式：2024/11/08 14:30
        result = now.strftime("%Y/%m/%d %H:%M")
    elif format_type == "long":
        # 完整格式：2024年11月8日 星期五 14:30:45
        result = now.strftime("%Y年%m月%d日 %A %H:%M:%S")
    else:  # medium
        # 中等格式：2024年11月8日 14:30
        result = now.strftime("%Y年%m月%d日 %H:%M")

    return f"當前日期時間：{result}"


async def main():
    """執行 MCP server"""
    async with mcp.server.stdio.stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            InitializationOptions(
                server_name="get_time",
                server_version="1.0.0",
                capabilities=server.get_capabilities(
                    notification_options=NotificationOptions(),
                    experimental_capabilities={},
                ),
            ),
        )


if __name__ == "__main__":
    import asyncio

    asyncio.run(main())