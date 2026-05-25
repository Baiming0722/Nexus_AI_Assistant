"""
日常生活 MCP Server
提供 Windows 系統上的日常功能介面，包括日期時間查詢、裝置狀態監測、
天氣搜尋、提醒鬧鐘設定、瀏覽器和檔案開啟等。

	# pip install mcp psutil aiohttp
"""

from datetime import datetime, timedelta
from typing import Any, Optional
import json

from mcp.server.models import InitializationOptions
import mcp.types as types
from mcp.server import NotificationOptions, Server
import mcp.server.stdio


# 初始化 MCP server
server = Server("daily_life")


@server.list_tools()
async def handle_list_tools() -> list[types.Tool]:
    """列出所有可用的工具"""
    return [
        types.Tool(
            name="get_current_date",
            description="取得當前日期和時間，支援多種格式展示",
            inputSchema={
                "type": "object",
                "properties": {
                    "format": {
                        "type": "string",
                        "description": "日期格式（'short'簡短格式, 'medium'中等格式, 'long'完整格式，或自訂格式）",
                        "enum": ["short", "medium", "long"]
                    }
                }
            }
        ),
        types.Tool(
            name="device_status",
            description="取得裝置狀態資訊，包括電池和記憶體使用情況",
            inputSchema={
                "type": "object",
                "properties": {}
            }
        ),
        types.Tool(
            name="search_weather",
            description="搜尋天氣資訊（使用 wttr.in 免費服務）",
            inputSchema={
                "type": "object",
                "properties": {
                    "location": {
                        "type": "string",
                        "description": "要查詢天氣的位置（城市名稱，預設為 Taipei）"
                    }
                }
            }
        ),
        types.Tool(
            name="set_reminder",
            description="建立提醒或待辦事項",
            inputSchema={
                "type": "object",
                "properties": {
                    "title": {
                        "type": "string",
                        "description": "提醒或待辦事項的標題"
                    },
                    "description": {
                        "type": "string",
                        "description": "提醒的附加詳細資訊"
                    },
                    "due_date": {
                        "type": "string",
                        "description": "提醒的到期日期（ISO字串格式）"
                    }
                },
                "required": ["title"]
            }
        ),
        types.Tool(
            name="set_alarm",
            description="在裝置上設定鬧鐘",
            inputSchema={
                "type": "object",
                "properties": {
                    "hour": {
                        "type": "integer",
                        "description": "鬧鐘小時（0-23）",
                        "minimum": 0,
                        "maximum": 23
                    },
                    "minute": {
                        "type": "integer",
                        "description": "鬧鐘分鐘（0-59）",
                        "minimum": 0,
                        "maximum": 59
                    },
                    "message": {
                        "type": "string",
                        "description": "鬧鐘標籤"
                    },
                    "days": {
                        "type": "array",
                        "description": "重複鬧鐘的天數（數字陣列，1=週日，7=週六）",
                        "items": {
                            "type": "integer",
                            "minimum": 1,
                            "maximum": 7
                        }
                    }
                },
                "required": ["hour", "minute", "message"]
            }
        ),
        types.Tool(
            name="send_message",
            description="發送簡訊",
            inputSchema={
                "type": "object",
                "properties": {
                    "phone_number": {
                        "type": "string",
                        "description": "接收者電話號碼"
                    },
                    "message": {
                        "type": "string",
                        "description": "簡訊內容"
                    }
                },
                "required": ["phone_number", "message"]
            }
        ),
        types.Tool(
            name="open_browser",
            description="在預設瀏覽器中開啟網址",
            inputSchema={
                "type": "object",
                "properties": {
                    "url": {
                        "type": "string",
                        "description": "要開啟的網址"
                    }
                },
                "required": ["url"]
            }
        ),
        types.Tool(
            name="open_file",
            description="使用預設程式開啟檔案",
            inputSchema={
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "要開啟的檔案路徑"
                    }
                },
                "required": ["file_path"]
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
            result = await get_current_date(arguments)
        elif name == "device_status":
            result = await device_status(arguments)
        elif name == "search_weather":
            result = await search_weather(arguments)
        elif name == "set_reminder":
            result = await set_reminder(arguments)
        elif name == "set_alarm":
            result = await set_alarm(arguments)
        elif name == "open_browser":
            result = await open_browser(arguments)
        elif name == "open_file":
            result = await open_file(arguments)
        else:
            raise ValueError(f"未知的工具: {name}")
        
        return [types.TextContent(type="text", text=json.dumps(result, ensure_ascii=False, indent=2))]
    
    except Exception as e:
        return [types.TextContent(
            type="text",
            text=json.dumps({
                "success": False,
                "error": str(e),
                "message": f"執行 {name} 時發生錯誤"
            }, ensure_ascii=False, indent=2)
        )]


async def get_current_date(params: dict[str, Any]) -> dict[str, Any]:
    """取得當前日期和時間"""
    format_type = params.get("format", "medium")
    now = datetime.now()
    
    if format_type == "short":
        formatted = now.strftime("%Y/%m/%d")
    elif format_type == "long":
        formatted = now.strftime("%Y年%m月%d日 %A %H:%M:%S")
    else:  # medium
        formatted = now.strftime("%Y年%m月%d日 %H:%M")
    
    return {
        "success": True,
        "timestamp": int(now.timestamp() * 1000),
        "iso": now.isoformat(),
        "formatted": formatted,
        "date": {
            "year": now.year,
            "month": now.month,
            "day": now.day,
            "weekday": now.strftime("%A")
        },
        "time": {
            "hours": now.hour,
            "minutes": now.minute,
            "seconds": now.second
        }
    }


async def device_status(params: dict[str, Any]) -> dict[str, Any]:
    """取得裝置狀態資訊（Windows）"""
    import psutil
    import platform
    
    # 取得記憶體資訊
    memory = psutil.virtual_memory()
    # 取得磁碟資訊
    disk = psutil.disk_usage('/')
    # 取得電池資訊（筆電才有）
    battery = psutil.sensors_battery()
    
    battery_info = {
        "level": int(battery.percent) if battery else None,
        "charging": battery.power_plugged if battery else None,
        "available": battery is not None
    }
    
    return {
        "success": True,
        "battery": battery_info,
        "memory": {
            "total": f"{memory.total / (1024**3):.2f} GB",
            "available": f"{memory.available / (1024**3):.2f} GB",
            "used_percent": f"{memory.percent}%"
        },
        "storage": {
            "total": f"{disk.total / (1024**3):.2f} GB",
            "available": f"{disk.free / (1024**3):.2f} GB",
            "used_percent": f"{disk.percent}%"
        },
        "system": {
            "platform": platform.system(),
            "version": platform.version(),
            "machine": platform.machine(),
            "processor": platform.processor()
        }
    }


async def search_weather(params: dict[str, Any]) -> dict[str, Any]:
    """搜尋天氣資訊（使用 wttr.in）"""
    import aiohttp
    
    location = params.get("location", "Taipei")
    
    # 使用免費的 wttr.in API
    url = f"https://wttr.in/{location}?format=j1"
    
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url) as response:
                if response.status == 200:
                    data = await response.json()
                    current = data.get("current_condition", [{}])[0]
                    
                    return {
                        "success": True,
                        "location": location,
                        "timestamp": datetime.now().isoformat(),
                        "weather": {
                            "temperature": f"{current.get('temp_C')}°C",
                            "feels_like": f"{current.get('FeelsLikeC')}°C",
                            "description": current.get("weatherDesc", [{}])[0].get("value", ""),
                            "humidity": f"{current.get('humidity')}%",
                            "wind_speed": f"{current.get('windspeedKmph')} km/h",
                            "pressure": f"{current.get('pressure')} mb",
                            "visibility": f"{current.get('visibility')} km"
                        }
                    }
                else:
                    return {
                        "success": False,
                        "message": f"無法取得天氣資訊，HTTP狀態碼: {response.status}"
                    }
    except Exception as e:
        return {
            "success": False,
            "message": f"天氣查詢失敗: {str(e)}"
        }


async def set_reminder(params: dict[str, Any]) -> dict[str, Any]:
    """設定提醒（Windows 通知）"""
    import subprocess
    
    title = params.get("title")
    description = params.get("description", "")
    due_date = params.get("due_date")
    
    if not title:
        raise ValueError("提醒標題為必填項")
    
    # 使用 Windows 通知系統
    try:
        # 建立 PowerShell 指令來顯示 Windows 通知
        ps_script = f"""
        [Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] > $null
        $Template = [Windows.UI.Notifications.ToastNotificationManager]::GetTemplateContent([Windows.UI.Notifications.ToastTemplateType]::ToastText02)
        $RawXml = [xml] $Template.GetXml()
        ($RawXml.toast.visual.binding.text|where {{$_.id -eq "1"}}).AppendChild($RawXml.CreateTextNode("{title}")) > $null
        ($RawXml.toast.visual.binding.text|where {{$_.id -eq "2"}}).AppendChild($RawXml.CreateTextNode("{description}")) > $null
        $SerializedXml = New-Object Windows.Data.Xml.Dom.XmlDocument
        $SerializedXml.LoadXml($RawXml.OuterXml)
        $Toast = [Windows.UI.Notifications.ToastNotification]::new($SerializedXml)
        $Toast.Tag = "PowerShell"
        $Toast.Group = "PowerShell"
        $Notifier = [Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier("PowerShell")
        $Notifier.Show($Toast);
        """
        
        subprocess.run(["powershell", "-Command", ps_script], check=True, capture_output=True)
        
        result = {
            "success": True,
            "message": "提醒已建立並顯示 Windows 通知",
            "title": title,
            "description": description,
            "due_date": due_date
        }
    except Exception as e:
        result = {
            "success": False,
            "message": f"建立提醒失敗: {str(e)}",
            "title": title,
            "description": description
        }
    
    return result


async def set_alarm(params: dict[str, Any]) -> dict[str, Any]:
    """設定鬧鐘（Windows 工作排程）"""
    import subprocess
    
    hour = params.get("hour")
    minute = params.get("minute")
    message = params.get("message")
    days = params.get("days")
    
    if hour is None or minute is None:
        raise ValueError("小時和分鐘為必填項")
    
    if not isinstance(hour, int) or hour < 0 or hour > 23:
        raise ValueError("小時必須在 0-23 之間")
    
    if not isinstance(minute, int) or minute < 0 or minute > 59:
        raise ValueError("分鐘必須在 0-59 之間")
    
    alarm_time = f"{hour:02d}:{minute:02d}"
    
    try:
        # 使用 Windows 工作排程器建立鬧鐘
        task_name = f"Alarm_{alarm_time.replace(':', '_')}_{message[:20]}"
        
        # 建立顯示訊息的 PowerShell 指令
        ps_command = f'msg * "{message} - 鬧鐘時間: {alarm_time}"'
        
        # 建立排程任務
        schtasks_cmd = [
            "schtasks", "/create",
            "/tn", task_name,
            "/tr", f"powershell.exe -Command \"{ps_command}\"",
            "/sc", "once",
            "/st", alarm_time,
            "/f"
        ]
        
        subprocess.run(schtasks_cmd, check=True, capture_output=True)
        
        result = {
            "success": True,
            "message": f"鬧鐘已建立在 Windows 工作排程器中",
            "alarm_time": alarm_time,
            "label": message,
            "task_name": task_name,
            "note": "可以在「工作排程器」中查看或管理此鬧鐘"
        }
    except Exception as e:
        result = {
            "success": False,
            "message": f"設定鬧鐘失敗: {str(e)}",
            "alarm_time": alarm_time,
            "label": message
        }
    
    return result


async def open_browser(params: dict[str, Any]) -> dict[str, Any]:
    """在瀏覽器中開啟網址"""
    import webbrowser
    
    url = params.get("url")
    
    if not url:
        raise ValueError("網址為必填項")
    
    # 確保網址有協定
    if not url.startswith(('http://', 'https://')):
        url = 'https://' + url
    
    try:
        webbrowser.open(url)
        return {
            "success": True,
            "message": f"已在瀏覽器中開啟",
            "url": url
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"開啟瀏覽器失敗: {str(e)}",
            "url": url
        }


async def open_file(params: dict[str, Any]) -> dict[str, Any]:
    """使用預設程式開啟檔案"""
    import os
    import subprocess
    
    file_path = params.get("file_path")
    
    if not file_path:
        raise ValueError("檔案路徑為必填項")
    
    try:
        if not os.path.exists(file_path):
            return {
                "success": False,
                "message": "檔案不存在",
                "file_path": file_path
            }
        
        # Windows 使用 os.startfile
        os.startfile(file_path)
        
        return {
            "success": True,
            "message": "已使用預設程式開啟檔案",
            "file_path": file_path
        }
    except Exception as e:
        return {
            "success": False,
            "message": f"開啟檔案失敗: {str(e)}",
            "file_path": file_path
        }


async def main():
    """執行 MCP server"""
    async with mcp.server.stdio.stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            InitializationOptions(
                server_name="daily_life",
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