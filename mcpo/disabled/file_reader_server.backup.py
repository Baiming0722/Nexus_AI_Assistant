import asyncio
import os
from pathlib import Path
from typing import Optional
import mimetypes
import chardet

from mcp.server import Server
from mcp.types import Tool, TextContent

# 初始化 MCP Server
app = Server("file-reader-server")

# 支援的文本文件擴展名
TEXT_EXTENSIONS = {
    '.txt', '.py', '.js', '.html', '.css', '.json', '.xml', '.md', 
    '.yml', '.yaml', '.ini', '.conf', '.log', '.csv', '.sql', '.sh',
    '.bat', '.ps1', '.c', '.cpp', '.h', '.java', '.go', '.rs', '.php'
}

def detect_encoding(file_path: str, sample_size: int = 10000) -> str:
    """檢測文件編碼"""
    try:
        with open(file_path, 'rb') as f:
            raw_data = f.read(sample_size)
        result = chardet.detect(raw_data)
        return result['encoding'] or 'utf-8'
    except:
        return 'utf-8'

def is_text_file(file_path: str) -> bool:
    """判斷是否為文本文件"""
    ext = Path(file_path).suffix.lower()
    if ext in TEXT_EXTENSIONS:
        return True
    
    mime_type, _ = mimetypes.guess_type(file_path)
    return mime_type and mime_type.startswith('text/')

async def read_file_safe(file_path: str, max_size: int = 10 * 1024 * 1024) -> dict:
    """安全讀取文件"""
    try:
        path = Path(file_path).resolve()
        
        # 檢查文件是否存在
        if not path.exists():
            return {"error": f"文件不存在: {file_path}"}
        
        if not path.is_file():
            return {"error": f"路徑不是文件: {file_path}"}
        
        # 檢查文件大小
        file_size = path.stat().st_size
        if file_size > max_size:
            return {
                "error": f"文件過大: {file_size / 1024 / 1024:.2f} MB (限制: {max_size / 1024 / 1024} MB)",
                "file_size": file_size
            }
        
        # 判斷文件類型
        if is_text_file(str(path)):
            encoding = detect_encoding(str(path))
            
            # 異步讀取文本文件
            loop = asyncio.get_event_loop()
            content = await loop.run_in_executor(
                None, 
                lambda: path.read_text(encoding=encoding, errors='replace')
            )
            
            return {
                "success": True,
                "file_path": str(path),
                "file_size": file_size,
                "encoding": encoding,
                "content": content,
                "type": "text"
            }
        else:
            # 讀取二進制文件（返回 base64）
            import base64
            loop = asyncio.get_event_loop()
            binary_data = await loop.run_in_executor(None, path.read_bytes)
            
            return {
                "success": True,
                "file_path": str(path),
                "file_size": file_size,
                "content": base64.b64encode(binary_data).decode('utf-8'),
                "type": "binary",
                "note": "二進制文件已編碼為 base64"
            }
            
    except PermissionError:
        return {"error": f"無權限讀取文件: {file_path}"}
    except Exception as e:
        return {"error": f"讀取文件時發生錯誤: {str(e)}"}

@app.list_tools()
async def list_tools() -> list[Tool]:
    """註冊可用的工具"""
    return [
        Tool(
            name="read_file",
            description="讀取本機文件內容。支援文本和二進制文件。文本文件自動檢測編碼，二進制文件返回 base64 編碼。",
            inputSchema={
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "要讀取的文件完整路徑（絕對路徑或相對路徑）"
                    },
                    "max_size_mb": {
                        "type": "number",
                        "description": "最大文件大小限制（MB），預設 10MB",
                        "default": 10
                    }
                },
                "required": ["file_path"]
            }
        )
    ]

@app.call_tool()
async def call_tool(name: str, arguments: dict) -> list[TextContent]:
    """執行工具"""
    if name != "read_file":
        raise ValueError(f"未知工具: {name}")
    
    file_path = arguments.get("file_path")
    max_size_mb = arguments.get("max_size_mb", 10)
    max_size = int(max_size_mb * 1024 * 1024)
    
    if not file_path:
        return [TextContent(
            type="text",
            text="錯誤: 必須提供 file_path 參數"
        )]
    
    result = await read_file_safe(file_path, max_size)
    
    if "error" in result:
        return [TextContent(
            type="text",
            text=f"❌ {result['error']}"
        )]
    
    # 格式化輸出
    output = f"✅ 文件讀取成功\n"
    output += f"📁 路徑: {result['file_path']}\n"
    output += f"📊 大小: {result['file_size'] / 1024:.2f} KB\n"
    
    if result['type'] == 'text':
        output += f"🔤 編碼: {result['encoding']}\n"
        output += f"\n{'='*50}\n文件內容:\n{'='*50}\n"
        output += result['content']
    else:
        output += f"🔢 類型: 二進制文件 (base64 編碼)\n"
        output += f"\n{'='*50}\nBase64 內容:\n{'='*50}\n"
        output += result['content'][:500] + "..." if len(result['content']) > 500 else result['content']
    
    return [TextContent(type="text", text=output)]

async def main():
    """啟動 MCP Server"""
    from mcp.server.stdio import stdio_server
    
    async with stdio_server() as (read_stream, write_stream):
        await app.run(
            read_stream,
            write_stream,
            app.create_initialization_options()
        )

if __name__ == "__main__":
    asyncio.run(main())