#!/usr/bin/env python3
"""
檔案系統 MCP Server
提供檔案和目錄操作功能，包括讀取、寫入、搜尋等。
支援 .gitignore 規則過濾。
    # pip install pathspec gitignore-parser
環境變數:
- PROJECT_DIR: 工作目錄路徑（預設為當前目錄）
- READONLY: 是否為唯讀模式（true/false，預設為 false）
"""

import asyncio
import os
import sys
import json
import pathlib
from typing import Any
from datetime import datetime

from mcp.server.models import InitializationOptions
import mcp.types as types
from mcp.server import NotificationOptions, Server
import mcp.server.stdio

# 預設配置
PROJECT_DIR = pathlib.Path.cwd().resolve()
READONLY = False

# 從環境變數解析配置
if os.getenv("PROJECT_DIR"):
    PROJECT_DIR = pathlib.Path(os.getenv("PROJECT_DIR")).resolve()
if os.getenv("READONLY", "").lower() in ("true", "1", "yes"):
    READONLY = True

# 初始化 MCP server
server = Server("filesystem-server")

# Gitignore 處理
try:
    import pathspec

    _HAS_PATHSPEC = True
except ImportError:
    _HAS_PATHSPEC = False

try:
    from gitignore_parser import parse_gitignore

    _HAS_PARSER = True
except ImportError:
    _HAS_PARSER = False


class GitIgnoreMatcher:
    """處理 .gitignore 規則"""

    def __init__(self, project_dir: pathlib.Path):
        self.project_dir = project_dir.resolve()
        self.matcher = None
        self._load()

    def _load(self):
        gitignore = self.project_dir / ".gitignore"
        if not gitignore.exists():
            return

        try:
            lines = [
                l for l in gitignore.read_text(encoding="utf-8", errors="ignore").splitlines()
                if l.strip() and not l.strip().startswith("#")
            ]

            if _HAS_PATHSPEC:
                self.matcher = pathspec.PathSpec.from_lines("gitwildmatch", lines)
            elif _HAS_PARSER:
                self.matcher = parse_gitignore(str(gitignore))
            else:
                self.matcher = lines
        except Exception as e:
            print(f"載入 .gitignore 時發生錯誤: {e}", file=sys.stderr)

    def is_ignored(self, path: pathlib.Path) -> bool:
        """檢查路徑是否被 .gitignore 忽略"""
        try:
            rel = str(path.resolve().relative_to(self.project_dir)).replace(os.sep, "/")
        except Exception:
            return True

        if not self.matcher:
            return False

        if _HAS_PATHSPEC:
            return self.matcher.match_file(rel)
        if _HAS_PARSER:
            return self.matcher(str(path))

        import fnmatch
        for pat in self.matcher:
            if fnmatch.fnmatch(rel, pat) or fnmatch.fnmatch(path.name, pat):
                return True
        return False


GITIGNORE_MATCHER = GitIgnoreMatcher(PROJECT_DIR)


def safe_resolve(base: pathlib.Path, relative_path: str) -> pathlib.Path:
    """安全地解析路徑，確保在專案目錄內"""
    p = (base / relative_path).resolve()
    try:
        p.relative_to(base.resolve())
    except ValueError:
        raise ValueError(f"路徑超出專案目錄範圍: {relative_path}")
    return p


def find_similar_files(target_name: str, search_dir: pathlib.Path, limit: int = 5) -> list:
    """查找相似檔案名，用於提示"""
    similar = []
    target_lower = target_name.lower()
    try:
        for item in search_dir.iterdir():
            if GITIGNORE_MATCHER.is_ignored(item):
                continue
            item_name_lower = item.name.lower()
            if (
                    target_lower in item_name_lower
                    or item_name_lower in target_lower
                    or any(
                part in item_name_lower
                for part in target_lower.split("_")
                if len(part) > 2
            )
            ):
                similar.append(item.name)
                if len(similar) >= limit:
                    break
    except Exception:
        pass
    return similar


@server.list_tools()
async def handle_list_tools() -> list[types.Tool]:
    """註冊可用的工具"""
    tools = [
        types.Tool(
            name="list_directory",
            description=f"列出目錄中的檔案和子目錄。當前工作目錄: {PROJECT_DIR}",
            inputSchema={
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "要列出的相對路徑（空字串或'.'表示當前目錄）",
                        "default": ""
                    }
                }
            }
        ),
        types.Tool(
            name="read_file",
            description=f"讀取檔案內容並返回完整文字。當前工作目錄: {PROJECT_DIR}。使用相對路徑，例如: 'data.txt' 或 'data/readme.md'。",
            inputSchema={
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "要讀取的檔案相對路徑，例如: 'data.txt' 或 'data/file.txt'"
                    }
                },
                "required": ["path"]
            }
        ),
        types.Tool(
            name="search_files",
            description="搜尋檔案名或檔案內容。可以按檔案名搜尋或搜尋檔案內容。",
            inputSchema={
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "搜尋關鍵字"
                    },
                    "content_search": {
                        "type": "boolean",
                        "description": "是否搜尋檔案內容（預設: false）",
                        "default": False
                    },
                    "max_results": {
                        "type": "integer",
                        "description": "最大返回結果數（預設: 100）",
                        "default": 100
                    }
                },
                "required": ["query"]
            }
        ),
        types.Tool(
            name="get_file_info",
            description="取得檔案或目錄的元資料資訊，包括路徑、類型、大小、修改時間等。",
            inputSchema={
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "檔案或目錄的相對路徑"
                    }
                },
                "required": ["path"]
            }
        ),
        types.Tool(
            name="create_directory",
            description="建立新目錄（包含父目錄）",
            inputSchema={
                "type": "object",
                "properties": {
                    "path": {
                        "type": "string",
                        "description": "要建立的目錄相對路徑"
                    }
                },
                "required": ["path"]
            }
        )
    ]

    if not READONLY:
        tools.append(
            types.Tool(
                name="write_file",
                description="寫入內容到檔案。如果檔案不存在會建立，如果存在會覆蓋。",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "要寫入的檔案相對路徑"
                        },
                        "content": {
                            "type": "string",
                            "description": "要寫入的內容"
                        }
                    },
                    "required": ["path", "content"]
                }
            )
        )
        tools.append(
            types.Tool(
                name="delete_file",
                description="刪除檔案或空目錄",
                inputSchema={
                    "type": "object",
                    "properties": {
                        "path": {
                            "type": "string",
                            "description": "要刪除的檔案或目錄相對路徑"
                        }
                    },
                    "required": ["path"]
                }
            )
        )

    return tools


@server.call_tool()
async def handle_call_tool(
        name: str, arguments: dict[str, Any] | None
) -> list[types.TextContent | types.ImageContent | types.EmbeddedResource]:
    """處理工具呼叫"""

    if arguments is None:
        arguments = {}

    try:
        if name == "list_directory":
            result = await list_directory(arguments)
        elif name == "read_file":
            result = await read_file(arguments)
        elif name == "write_file":
            if READONLY:
                result = json.dumps({"error": "伺服器處於唯讀模式"}, ensure_ascii=False, indent=2)
            else:
                result = await write_file(arguments)
        elif name == "search_files":
            result = await search_files(arguments)
        elif name == "get_file_info":
            result = await get_file_info(arguments)
        elif name == "create_directory":
            result = await create_directory(arguments)
        elif name == "delete_file":
            if READONLY:
                result = json.dumps({"error": "伺服器處於唯讀模式"}, ensure_ascii=False, indent=2)
            else:
                result = await delete_file(arguments)
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


async def list_directory(params: dict[str, Any]) -> str:
    """列出目錄內容"""
    try:
        path = params.get("path", "")
        p = safe_resolve(PROJECT_DIR, path)

        if not p.exists():
            return json.dumps({
                "error": f"路徑不存在: {path}",
                "current_directory": str(PROJECT_DIR)
            }, ensure_ascii=False, indent=2)

        if not p.is_dir():
            return json.dumps({"error": f"不是目錄: {path}"}, ensure_ascii=False, indent=2)

        items = []
        for child in sorted(p.iterdir()):
            if GITIGNORE_MATCHER.is_ignored(child):
                continue

            item_info = {
                "name": child.name,
                "path": str(child.relative_to(PROJECT_DIR)).replace(os.sep, "/"),
                "type": "directory" if child.is_dir() else "file"
            }

            if child.is_file():
                item_info["size"] = child.stat().st_size

            items.append(item_info)

        result = {
            "success": True,
            "current_directory": str(p.relative_to(PROJECT_DIR)).replace(os.sep, "/") or ".",
            "absolute_path": str(p),
            "items": items,
            "count": len(items)
        }

        return json.dumps(result, ensure_ascii=False, indent=2)

    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False, indent=2)


async def read_file(params: dict[str, Any]) -> str:
    """讀取檔案內容"""
    try:
        path = params.get("path")
        if not path:
            return json.dumps({"error": "缺少 path 參數"}, ensure_ascii=False, indent=2)

        p = safe_resolve(PROJECT_DIR, path)

        if not p.exists():
            error_info = {
                "error": f"檔案不存在: {path}",
                "current_directory": str(PROJECT_DIR),
                "requested_path": path,
                "absolute_path_tried": str(p)
            }

            try:
                parent = p.parent if p.parent.exists() else PROJECT_DIR
                files_in_dir = [
                    f.name for f in parent.iterdir()
                    if f.is_file() and not GITIGNORE_MATCHER.is_ignored(f)
                ][:10]

                if files_in_dir:
                    error_info["files_in_directory"] = files_in_dir
                    if len(list(parent.iterdir())) > 10:
                        error_info["note"] = "僅顯示前10個檔案"

                similar = find_similar_files(p.name, parent)
                if similar:
                    error_info["similar_files"] = similar
                    error_info["suggestion"] = f"您是否要查找這些檔案之一? {', '.join(similar)}"
            except Exception:
                pass

            return json.dumps(error_info, ensure_ascii=False, indent=2)

        if GITIGNORE_MATCHER.is_ignored(p):
            return json.dumps({"error": f"檔案被 .gitignore 忽略: {path}"}, ensure_ascii=False, indent=2)

        if not p.is_file():
            return json.dumps({
                "error": f"不是檔案（可能是目錄）: {path}",
                "suggestion": "使用 list_directory 來查看目錄內容"
            }, ensure_ascii=False, indent=2)

        content_bytes = p.read_bytes()
        try:
            content = content_bytes.decode("utf-8")
        except UnicodeDecodeError:
            content = f"<二進位檔案, {len(content_bytes)} bytes>"

        return json.dumps({
            "success": True,
            "content": content,
            "size": len(content_bytes),
            "path": str(p.relative_to(PROJECT_DIR)).replace(os.sep, "/"),
            "absolute_path": str(p)
        }, ensure_ascii=False, indent=2)

    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False, indent=2)


async def write_file(params: dict[str, Any]) -> str:
    """寫入檔案"""
    try:
        path = params.get("path")
        content = params.get("content")

        if not path or content is None:
            return json.dumps({"error": "缺少必需參數"}, ensure_ascii=False, indent=2)

        p = safe_resolve(PROJECT_DIR, path)

        if GITIGNORE_MATCHER.is_ignored(p):
            return json.dumps({"error": f"檔案被 .gitignore 忽略: {path}"}, ensure_ascii=False, indent=2)

        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_text(content, encoding="utf-8")

        return json.dumps({
            "success": True,
            "path": str(p.relative_to(PROJECT_DIR)).replace(os.sep, "/"),
            "absolute_path": str(p),
            "size": p.stat().st_size,
            "message": "檔案寫入成功"
        }, ensure_ascii=False, indent=2)

    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False, indent=2)


async def search_files(params: dict[str, Any]) -> str:
    """搜尋檔案"""
    try:
        query = params.get("query")
        if not query:
            return json.dumps({"error": "缺少 query 參數"}, ensure_ascii=False, indent=2)

        content_search = params.get("content_search", False)
        max_results = params.get("max_results", 100)

        results = []
        for root, dirs, files in os.walk(PROJECT_DIR):
            root_path = pathlib.Path(root)

            if GITIGNORE_MATCHER.is_ignored(root_path):
                dirs[:] = []
                continue

            for filename in files:
                file_path = root_path / filename

                if GITIGNORE_MATCHER.is_ignored(file_path):
                    continue

                if query.lower() in filename.lower():
                    results.append(str(file_path.relative_to(PROJECT_DIR)).replace(os.sep, "/"))
                elif content_search:
                    try:
                        text = file_path.read_text(errors="ignore")
                        if query.lower() in text.lower():
                            results.append(str(file_path.relative_to(PROJECT_DIR)).replace(os.sep, "/"))
                    except Exception:
                        pass

                if len(results) >= max_results:
                    break

            if len(results) >= max_results:
                break

        return json.dumps({
            "success": True,
            "query": query,
            "content_search": content_search,
            "results": results,
            "count": len(results),
            "message": f"找到 {len(results)} 個結果"
        }, ensure_ascii=False, indent=2)

    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False, indent=2)


async def get_file_info(params: dict[str, Any]) -> str:
    """取得檔案資訊"""
    try:
        path = params.get("path")
        if not path:
            return json.dumps({"error": "缺少 path 參數"}, ensure_ascii=False, indent=2)

        p = safe_resolve(PROJECT_DIR, path)

        if not p.exists():
            return json.dumps({"error": f"路徑不存在: {path}"}, ensure_ascii=False, indent=2)

        stat = p.stat()

        return json.dumps({
            "success": True,
            "path": str(p.relative_to(PROJECT_DIR)).replace(os.sep, "/"),
            "absolute_path": str(p),
            "type": "directory" if p.is_dir() else "file",
            "size": stat.st_size,
            "modified": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            "created": datetime.fromtimestamp(stat.st_ctime).isoformat(),
            "modified_timestamp": int(stat.st_mtime),
            "created_timestamp": int(stat.st_ctime)
        }, ensure_ascii=False, indent=2)

    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False, indent=2)


async def create_directory(params: dict[str, Any]) -> str:
    """建立目錄"""
    try:
        path = params.get("path")
        if not path:
            return json.dumps({"error": "缺少 path 參數"}, ensure_ascii=False, indent=2)

        p = safe_resolve(PROJECT_DIR, path)
        p.mkdir(parents=True, exist_ok=True)

        return json.dumps({
            "success": True,
            "path": str(p.relative_to(PROJECT_DIR)).replace(os.sep, "/"),
            "absolute_path": str(p),
            "message": "目錄建立成功"
        }, ensure_ascii=False, indent=2)

    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False, indent=2)


async def delete_file(params: dict[str, Any]) -> str:
    """刪除檔案或目錄"""
    try:
        path = params.get("path")
        if not path:
            return json.dumps({"error": "缺少 path 參數"}, ensure_ascii=False, indent=2)

        p = safe_resolve(PROJECT_DIR, path)

        if not p.exists():
            return json.dumps({"error": f"路徑不存在: {path}"}, ensure_ascii=False, indent=2)

        if p.is_file():
            p.unlink()
            message = "檔案刪除成功"
        elif p.is_dir():
            if any(p.iterdir()):
                return json.dumps({"error": "目錄不是空的，無法刪除"}, ensure_ascii=False, indent=2)
            p.rmdir()
            message = "目錄刪除成功"
        else:
            return json.dumps({"error": "未知的檔案類型"}, ensure_ascii=False, indent=2)

        return json.dumps({
            "success": True,
            "path": path,
            "message": message
        }, ensure_ascii=False, indent=2)

    except Exception as e:
        return json.dumps({"error": str(e)}, ensure_ascii=False, indent=2)


async def main():
    """執行 MCP server"""
    print(f"檔案系統 Server 啟動", file=sys.stderr)
    print(f"專案目錄: {PROJECT_DIR}", file=sys.stderr)
    print(f"唯讀模式: {READONLY}", file=sys.stderr)

    async with mcp.server.stdio.stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            InitializationOptions(
                server_name="filesystem-server",
                server_version="1.0.0",
                capabilities=server.get_capabilities(
                    notification_options=NotificationOptions(),
                    experimental_capabilities={},
                ),
            ),
        )


if __name__ == "__main__":
    asyncio.run(main())