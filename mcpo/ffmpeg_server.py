#!/usr/bin/env python3
"""
FFmpeg MCP Server
提供 FFmpeg 影片處理功能，包括格式轉換、資訊查詢等。
    # pip install mcp
系統需求:
需要安裝 FFmpeg 並將其加入系統 PATH
下載位置: https://ffmpeg.org/download.html
"""

import asyncio
import subprocess
from typing import Any
import json
import os
import re
import shutil

# ──────────────────────────────────────────────
# 自動偵測 ffmpeg / ffprobe 完整路徑
# ──────────────────────────────────────────────

def _find_executable(name: str) -> str:
    """依序從 PATH、常見安裝目錄尋找執行檔，回傳完整路徑或原始名稱（fallback）"""
    # 1. 先嘗試 PATH
    found = shutil.which(name)
    if found:
        return found
    # 2. Windows 常見安裝目錄（glob 風格前綴）
    search_roots = [
        r"C:\\",
        r"C:\Program Files",
        r"C:\Program Files (x86)",
    ]
    for root in search_roots:
        if not os.path.isdir(root):
            continue
        try:
            for entry in os.scandir(root):
                if entry.is_dir() and "ffmpeg" in entry.name.lower():
                    candidate = os.path.join(entry.path, "bin", f"{name}.exe")
                    if os.path.isfile(candidate):
                        return candidate
        except PermissionError:
            continue
    # 3. Fallback：直接用名稱，讓系統自己報錯
    return name


FFMPEG_BIN  = _find_executable("ffmpeg")
FFPROBE_BIN = _find_executable("ffprobe")

from mcp.server.models import InitializationOptions
import mcp.types as types
from mcp.server import NotificationOptions, Server
import mcp.server.stdio

# 初始化 MCP server
server = Server("ffmpeg-server")

# ──────────────────────────────────────────────
# 智能預設值輔助函式
# ──────────────────────────────────────────────

# 副檔名 → 建議的影片/音訊 codec
EXT_VIDEO_CODEC = {
    ".mp4":  "libx264",
    ".mkv":  "libx264",
    ".mov":  "prores",
    ".avi":  "mpeg4",
    ".webm": "libvpx",
    ".gif":  "gif",
    ".ts":   "libx264",
    ".flv":  "libx264",
}

# 圖片格式副檔名（使用獨立的 ffmpeg_image_convert 處理）
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".bmp", ".tiff", ".tif", ".webp", ".gif"}

EXT_AUDIO_CODEC = {
    ".mp4":  "aac",
    ".mkv":  "aac",
    ".mov":  "aac",
    ".avi":  "mp3",
    ".webm": "opus",
    ".ts":   "aac",
    ".flv":  "aac",
    ".mp3":  "mp3",
    ".aac":  "aac",
    ".ogg":  "vorbis",
    ".flac": "flac",
    ".wav":  "pcm_s16le",
    ".opus": "opus",
}

# 純音訊副檔名（convert 時不加 video codec）
AUDIO_ONLY_EXTS = {".mp3", ".aac", ".ogg", ".flac", ".wav", ".opus", ".m4a"}


def ext(path: str) -> str:
    """取得小寫副檔名"""
    return os.path.splitext(path)[1].lower()


def smart_video_codec(output_path: str) -> str | None:
    """依輸出副檔名推斷預設影片 codec，純音訊輸出回傳 None"""
    e = ext(output_path)
    if e in AUDIO_ONLY_EXTS:
        return None
    return EXT_VIDEO_CODEC.get(e, "libx264")


def smart_audio_codec(output_path: str) -> str:
    """依輸出副檔名推斷預設音訊 codec"""
    return EXT_AUDIO_CODEC.get(ext(output_path), "aac")


def smart_extract_audio_codec(output_path: str) -> str:
    """依音訊輸出副檔名推斷 codec"""
    return EXT_AUDIO_CODEC.get(ext(output_path), "mp3")


# ──────────────────────────────────────────────
# 工具清單（補強後的提示詞）
# ──────────────────────────────────────────────

@server.list_tools()
async def handle_list_tools() -> list[types.Tool]:
    """列出所有可用的工具"""
    return [
        types.Tool(
            name="ffmpeg_execute",
            description=(
                "執行自訂 FFmpeg 命令。可以執行任何 FFmpeg 支援的操作。\n\n"
                "⚠️ 重要：必須實際呼叫此工具並等待真實回傳結果，絕對不可自行推測或假設執行結果。\n"
                "即使你認為命令可能會失敗，也必須先執行並回傳實際結果給使用者。\n\n"
                "【智能提示】\n"
                "- 若使用者未提供完整命令，請根據需求自行建構參數字串。\n"
                "- 若需覆蓋輸出檔，請加上 -y；若需靜默執行，可加上 -loglevel error。\n"
                "- 路徑中含空格時，務必以雙引號包覆。\n"
                "- 範例：'-i \"input.mp4\" -vf scale=1280:720 -c:v libx264 -y \"output.mp4\"'"
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "command": {
                        "type": "string",
                        "description": (
                            "要執行的 FFmpeg 命令參數（不包含 'ffmpeg' 前綴）。\n"
                            "若使用者未完整說明，請依需求自動推斷合理參數。\n"
                            "例如：'-i input.mp4 output.avi'"
                        )
                    }
                },
                "required": ["command"]
            }
        ),
        types.Tool(
            name="ffmpeg_info",
            description=(
                "取得 FFmpeg 系統資訊，包括版本、建置設定和支援的編解碼器。\n"
                "無需任何參數，直接呼叫即可。\n\n"
                "⚠️ 重要：必須實際呼叫此工具並回傳真實結果，不可自行假設版本或功能。"
            ),
            inputSchema={
                "type": "object",
                "properties": {}
            }
        ),
        types.Tool(
            name="ffmpeg_convert",
            description=(
                "使用簡化參數轉換影片檔案。自動建構 FFmpeg 命令進行轉換。\n"
                "⚠️ 僅適用於影片格式（mp4, mkv, avi, mov, webm 等）。\n"
                "   圖片格式（jpg, png, bmp, webp 等）請改用 ffmpeg_image_convert。\n\n"
                "⚠️ 重要：必須實際呼叫此工具並等待真實執行結果。\n"
                "   不可根據 codec 名稱或個人判斷預先假設會失敗或成功，一律執行後回報。\n\n"
                "【智能預設規則 — 若使用者未指定，請依下列規則自動填入】\n"
                "- video_codec：依輸出副檔名自動選擇\n"
                "  .mp4/.mkv/.ts/.flv → libx264\n"
                "  .mov → prores\n"
                "  .avi → mpeg4\n"
                "  .webm → libvpx\n"
                "  純音訊格式 (.mp3/.aac/.wav 等) → 不設定 video_codec\n"
                "- audio_codec：依輸出副檔名自動選擇\n"
                "  .mp4/.mkv/.mov/.ts → aac\n"
                "  .avi → mp3\n"
                "  .webm → opus\n"
                "  .mp3 → mp3  .flac → flac  .wav → wav\n"
                "- resolution：不指定時保持原始解析度\n"
                "- bitrate：不指定時由 FFmpeg 自動決定\n"
                "- fps：不指定時保持原始幀率\n\n"
                "【使用情境範例】\n"
                "- 「把 video.mp4 轉成 avi」→ input_path=video.mp4, output_path=video.avi\n"
                "- 「壓縮影片」→ 加上 bitrate='1000k' 或調低解析度\n"
                "- 「轉成手機可以播的格式」→ output .mp4, video_codec=libx264, resolution=1280x720"
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "input_path": {
                        "type": "string",
                        "description": "來源影片檔案路徑（必填）"
                    },
                    "output_path": {
                        "type": "string",
                        "description": (
                            "目標影片檔案路徑（必填）。\n"
                            "若使用者未指定，請將副檔名改為目標格式，檔名保持不變。\n"
                            "例如 input.mp4 → output.avi"
                        )
                    },
                    "video_codec": {
                        "type": "string",
                        "description": (
                            "影片編解碼器（選填）。\n"
                            "若未指定，伺服器會依輸出副檔名自動選擇最合適的 codec。"
                        ),
                        "enum": [
                            "libx264", "libx265", "libvpx", "libaom",
                            "mpeg4", "mjpeg", "prores", "h264",
                            "hevc", "vp8", "vp9", "av1", "gif"
                        ]
                    },
                    "audio_codec": {
                        "type": "string",
                        "description": (
                            "音訊編解碼器（選填）。\n"
                            "若未指定，伺服器會依輸出副檔名自動選擇最合適的 codec。"
                        ),
                        "enum": [
                            "aac", "mp3", "opus", "vorbis",
                            "flac", "pcm_s16le", "wav", "ac3", "eac3"
                        ]
                    },
                    "resolution": {
                        "type": "string",
                        "description": (
                            "輸出解析度（選填），格式：'寬x高'，例如 '1280x720' 或 '1920x1080'。\n"
                            "常用預設：720p=1280x720, 1080p=1920x1080, 4K=3840x2160。\n"
                            "若未指定則保持原始解析度。"
                        )
                    },
                    "bitrate": {
                        "type": "string",
                        "description": (
                            "影片位元率（選填），例如 '500k', '1000k', '2M'。\n"
                            "參考值：低畫質 500k、標清 1M、高畫質 2-4M、Full HD 6-8M。\n"
                            "若未指定則由 FFmpeg 自動決定。"
                        )
                    },
                    "fps": {
                        "type": "string",
                        "description": (
                            "影格率（選填），例如 '24', '30', '60'。\n"
                            "常用值：電影 24fps、一般影片 30fps、高流暢 60fps。\n"
                            "若未指定則保持原始幀率。"
                        )
                    }
                },
                "required": ["input_path", "output_path"]
            }
        ),
        types.Tool(
            name="ffmpeg_probe",
            description=(
                "取得影片或圖片檔案的詳細資訊（使用 ffprobe）。\n"
                "回傳格式、解析度、時長、codec、位元率、幀率等完整 metadata。\n"
                "建議在執行轉換前先呼叫此工具，以了解來源檔案的規格。\n\n"
                "⚠️ 重要：必須實際呼叫此工具，不可自行假設檔案內容或格式。"
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "要分析的影片檔案路徑（必填）"
                    }
                },
                "required": ["file_path"]
            }
        ),
        types.Tool(
            name="ffmpeg_extract_audio",
            description=(
                "從影片中提取音訊。\n\n"
                "⚠️ 重要：必須實際呼叫此工具並等待真實執行結果，不可自行預判是否可行。\n\n"
                "【智能預設規則 — 若使用者未指定，請依下列規則自動填入】\n"
                "- audio_codec：依輸出副檔名自動選擇\n"
                "  .mp3 → mp3  .aac/.m4a → aac  .ogg → vorbis\n"
                "  .flac → flac  .wav → wav  .opus → opus\n"
                "  未指定副檔名 → 預設 mp3\n"
                "- output_path：若未指定，將輸入檔副檔名改為 .mp3，檔名保持不變。\n\n"
                "【使用情境範例】\n"
                "- 「從 video.mp4 提取音訊」→ output_path=video.mp3, audio_codec=mp3\n"
                "- 「提取成高品質音訊」→ audio_codec=flac, output_path=video.flac"
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "input_path": {
                        "type": "string",
                        "description": "來源影片檔案路徑（必填）"
                    },
                    "output_path": {
                        "type": "string",
                        "description": (
                            "輸出音訊檔案路徑（選填）。\n"
                            "若未指定，預設將輸入檔副檔名改為 .mp3。\n"
                            "例如 video.mp4 → video.mp3"
                        )
                    },
                    "audio_codec": {
                        "type": "string",
                        "description": (
                            "音訊編解碼器（選填）。\n"
                            "若未指定，伺服器會依輸出檔副檔名自動選擇。預設為 mp3。"
                        ),
                        "enum": ["aac", "mp3", "opus", "vorbis", "flac", "wav"]
                    }
                },
                "required": ["input_path"]
            }
        ),
        types.Tool(
            name="ffmpeg_image_convert",
            description=(
                "轉換圖片格式（jpg, jpeg, png, bmp, tiff, webp, gif 之間互轉）。\n\n"
                "⚠️ 重要：必須實際呼叫此工具並等待真實執行結果，不可自行預判結果或回報假錯誤。\n"
                "   FFmpeg 本身完全支援圖片格式轉換，請直接執行，不要因為覺得不支援就放棄。\n\n"
                "【智能預設規則 — 若使用者未指定，請依下列規則自動填入】\n"
                "- output_path：若未指定，將輸入檔副檔名改為目標格式，檔名保持不變。\n"
                "  例如 photo.png → photo.jpg\n"
                "- quality：jpg/webp 輸出時的品質（1-31，數字越小品質越高），預設 2。\n\n"
                "【使用情境範例】\n"
                "- 「把 photo.png 轉成 jpg」→ input_path=photo.png, output_path=photo.jpg\n"
                "- 「壓縮圖片品質」→ quality=10\n"
                "- 「轉成 webp 以縮小體積」→ output_path=photo.webp"
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "input_path": {
                        "type": "string",
                        "description": "來源圖片檔案路徑（必填）"
                    },
                    "output_path": {
                        "type": "string",
                        "description": (
                            "目標圖片檔案路徑（選填）。\n"
                            "若未指定，自動將副檔名改為目標格式，檔名保持不變。"
                        )
                    },
                    "quality": {
                        "type": "integer",
                        "description": (
                            "輸出品質（選填，對 jpg/webp 有效）。\n"
                            "範圍 1-31，數字越小品質越高。預設 2（高品質）。"
                        )
                    }
                },
                "required": ["input_path"]
            }
        )
    ]


# ──────────────────────────────────────────────
# 工具呼叫處理
# ──────────────────────────────────────────────

@server.call_tool()
async def handle_call_tool(
        name: str, arguments: dict[str, Any] | None
) -> list[types.TextContent | types.ImageContent | types.EmbeddedResource]:
    """處理工具呼叫"""

    if arguments is None:
        arguments = {}

    try:
        if name == "ffmpeg_execute":
            result = await ffmpeg_execute(arguments)
        elif name == "ffmpeg_info":
            result = await ffmpeg_info(arguments)
        elif name == "ffmpeg_convert":
            result = await ffmpeg_convert(arguments)
        elif name == "ffmpeg_probe":
            result = await ffmpeg_probe(arguments)
        elif name == "ffmpeg_extract_audio":
            result = await ffmpeg_extract_audio(arguments)
        elif name == "ffmpeg_image_convert":
            result = await ffmpeg_image_convert(arguments)
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


# ──────────────────────────────────────────────
# 底層執行函式
# ──────────────────────────────────────────────

def run_ffmpeg_command(command: str, timeout: int = 300) -> dict:
    """執行 FFmpeg 命令並返回結果"""
    try:
        full_command = f'"{FFMPEG_BIN}" {command}'

        result = subprocess.run(
            full_command,
            shell=True,
            capture_output=True,
            text=True,
            timeout=timeout,
            encoding='utf-8',
            errors='replace'
        )

        return {
            "returnCode": result.returncode,
            "stdout": result.stdout,
            "stderr": result.stderr,
            "success": result.returncode == 0
        }

    except subprocess.TimeoutExpired:
        return {
            "returnCode": -1,
            "stdout": "",
            "stderr": f"命令執行逾時（超過 {timeout} 秒）",
            "success": False
        }
    except FileNotFoundError:
        return {
            "returnCode": -1,
            "stdout": "",
            "stderr": "找不到 FFmpeg。請確認 FFmpeg 已安裝並加入系統 PATH。",
            "success": False
        }
    except Exception as e:
        return {
            "returnCode": -1,
            "stdout": "",
            "stderr": f"執行錯誤: {str(e)}",
            "success": False
        }


# ──────────────────────────────────────────────
# 各工具實作（含智能預設邏輯）
# ──────────────────────────────────────────────

async def ffmpeg_execute(params: dict[str, Any]) -> str:
    """執行自訂 FFmpeg 命令"""
    command = params.get("command", "")

    if not command:
        return json.dumps({
            "success": False,
            "message": "請提供 FFmpeg 命令參數"
        }, ensure_ascii=False, indent=2)

    result = run_ffmpeg_command(command)

    return json.dumps({
        "success": result["success"],
        "returnCode": result["returnCode"],
        "command": f'"{FFMPEG_BIN}" {command}',
        "stdout": result["stdout"],
        "stderr": result["stderr"],
        "message": "命令執行成功" if result["success"] else "命令執行失敗"
    }, ensure_ascii=False, indent=2)


async def ffmpeg_info(params: dict[str, Any]) -> str:
    """取得 FFmpeg 系統資訊"""
    result = run_ffmpeg_command("-version")

    return json.dumps({
        "success": result["success"],
        "version_info": result["stderr"] if result["stderr"] else result["stdout"],
        "message": "成功取得 FFmpeg 資訊" if result["success"] else "無法取得 FFmpeg 資訊"
    }, ensure_ascii=False, indent=2)


async def ffmpeg_convert(params: dict[str, Any]) -> str:
    """轉換影片檔案（含智能預設值補全）"""
    input_path  = params.get("input_path")
    output_path = params.get("output_path")
    video_codec = params.get("video_codec")
    audio_codec = params.get("audio_codec")
    resolution  = params.get("resolution")
    bitrate     = params.get("bitrate")
    fps         = params.get("fps")

    if not input_path or not output_path:
        return json.dumps({
            "success": False,
            "message": "請提供輸入和輸出檔案路徑"
        }, ensure_ascii=False, indent=2)

    # ── 智能預設補全 ──
    auto_applied = {}

    if video_codec is None:
        video_codec = smart_video_codec(output_path)
        if video_codec:
            auto_applied["video_codec"] = f"自動推斷（依輸出副檔名 {ext(output_path)}）→ {video_codec}"

    if audio_codec is None:
        audio_codec = smart_audio_codec(output_path)
        auto_applied["audio_codec"] = f"自動推斷（依輸出副檔名 {ext(output_path)}）→ {audio_codec}"

    # ── 建構命令 ──
    command_parts = [f'-i "{input_path}"']

    if video_codec:
        command_parts.append(f"-c:v {video_codec}")

    if audio_codec:
        command_parts.append(f"-c:a {audio_codec}")

    if resolution:
        command_parts.append(f"-s {resolution}")

    if bitrate:
        command_parts.append(f"-b:v {bitrate}")

    if fps:
        command_parts.append(f"-r {fps}")

    command_parts.append("-y")
    command_parts.append(f'"{output_path}"')

    full_command = " ".join(command_parts)
    result = run_ffmpeg_command(full_command)

    return json.dumps({
        "success": result["success"],
        "command": f"ffmpeg {full_command}",
        "returnCode": result["returnCode"],
        "input_path": input_path,
        "output_path": output_path,
        "settings_used": {
            "video_codec": video_codec,
            "audio_codec": audio_codec,
            "resolution": resolution or "（保持原始）",
            "bitrate": bitrate or "（自動）",
            "fps": fps or "（保持原始）"
        },
        "auto_applied_defaults": auto_applied,
        "output": result["stderr"] if result["stderr"] else result["stdout"],
        "message": "轉換成功" if result["success"] else "轉換失敗"
    }, ensure_ascii=False, indent=2)


async def ffmpeg_probe(params: dict[str, Any]) -> str:
    """取得影片檔案詳細資訊"""
    file_path = params.get("file_path")

    if not file_path:
        return json.dumps({
            "success": False,
            "message": "請提供檔案路徑"
        }, ensure_ascii=False, indent=2)

    try:
        command = [
            FFPROBE_BIN,
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            file_path
        ]

        result = subprocess.run(
            command,
            capture_output=True,
            text=True,
            timeout=30,
            encoding='utf-8',
            errors='replace'
        )

        if result.returncode == 0:
            probe_data = json.loads(result.stdout)
            return json.dumps({
                "success": True,
                "file_path": file_path,
                "probe_data": probe_data,
                "message": "成功取得檔案資訊"
            }, ensure_ascii=False, indent=2)
        else:
            return json.dumps({
                "success": False,
                "file_path": file_path,
                "error": result.stderr,
                "message": "無法取得檔案資訊"
            }, ensure_ascii=False, indent=2)

    except FileNotFoundError:
        return json.dumps({
            "success": False,
            "message": "找不到 ffprobe。請確認 FFmpeg 已安裝並加入系統 PATH。"
        }, ensure_ascii=False, indent=2)
    except Exception as e:
        return json.dumps({
            "success": False,
            "error": str(e),
            "message": "取得檔案資訊時發生錯誤"
        }, ensure_ascii=False, indent=2)


async def ffmpeg_extract_audio(params: dict[str, Any]) -> str:
    """從影片中提取音訊（含智能預設值補全）"""
    input_path  = params.get("input_path")
    output_path = params.get("output_path")
    audio_codec = params.get("audio_codec")

    if not input_path:
        return json.dumps({
            "success": False,
            "message": "請提供輸入檔案路徑"
        }, ensure_ascii=False, indent=2)

    # ── 智能預設補全 ──
    auto_applied = {}

    # output_path 未指定：將副檔名換為 .mp3
    if not output_path:
        base = os.path.splitext(input_path)[0]
        output_path = f"{base}.mp3"
        auto_applied["output_path"] = f"自動推斷 → {output_path}"

    # audio_codec 未指定：依輸出副檔名推斷
    if audio_codec is None:
        audio_codec = smart_extract_audio_codec(output_path)
        auto_applied["audio_codec"] = f"自動推斷（依輸出副檔名 {ext(output_path)}）→ {audio_codec}"

    command = f'-i "{input_path}" -vn -c:a {audio_codec} -y "{output_path}"'
    result = run_ffmpeg_command(command)

    return json.dumps({
        "success": result["success"],
        "command": f"ffmpeg {command}",
        "input_path": input_path,
        "output_path": output_path,
        "audio_codec": audio_codec,
        "auto_applied_defaults": auto_applied,
        "output": result["stderr"] if result["stderr"] else result["stdout"],
        "message": "音訊提取成功" if result["success"] else "音訊提取失敗"
    }, ensure_ascii=False, indent=2)


# ──────────────────────────────────────────────
# 進入點
# ──────────────────────────────────────────────

async def ffmpeg_image_convert(params: dict[str, Any]) -> str:
    """轉換圖片格式（含智能預設值補全）"""
    input_path  = params.get("input_path")
    output_path = params.get("output_path")
    quality     = params.get("quality")

    if not input_path:
        return json.dumps({
            "success": False,
            "message": "請提供輸入圖片路徑"
        }, ensure_ascii=False, indent=2)

    # ── 智能預設補全 ──
    auto_applied = {}

    # output_path 未指定：需要目標格式才能決定輸出路徑
    if not output_path:
        return json.dumps({
            "success": False,
            "message": "請指定輸出圖片路徑（例如 photo.jpg），以確定目標格式"
        }, ensure_ascii=False, indent=2)

    out_ext = ext(output_path).lstrip(".")

    # ── 建構命令 ──
    command_parts = [f'-i "{input_path}"']

    # jpg/jpeg 品質設定
    if out_ext in ("jpg", "jpeg"):
        q = quality if quality is not None else 2
        command_parts.append(f"-q:v {q}")
        if quality is None:
            auto_applied["quality"] = f"預設高品質 → -q:v 2"
    elif out_ext == "webp":
        q = quality if quality is not None else 80
        # webp 使用 -q:v，範圍 0-100，越大越好（與 jpg 相反）
        # 若使用者用 jpg 的 1-31 範圍思考，需轉換
        command_parts.append(f"-q:v {q}")
        if quality is None:
            auto_applied["quality"] = f"預設高品質 → -q:v 80"
    elif out_ext == "png":
        # PNG 是無損格式，不需要品質設定
        pass

    command_parts.append("-y")
    command_parts.append(f'"{output_path}"')

    full_command = " ".join(command_parts)
    result = run_ffmpeg_command(full_command)

    return json.dumps({
        "success": result["success"],
        "command": f"ffmpeg {full_command}",
        "returnCode": result["returnCode"],
        "input_path": input_path,
        "output_path": output_path,
        "auto_applied_defaults": auto_applied,
        "output": result["stderr"] if result["stderr"] else result["stdout"],
        "message": "圖片轉換成功" if result["success"] else "圖片轉換失敗"
    }, ensure_ascii=False, indent=2)


async def main():
    """執行 MCP server"""
    async with mcp.server.stdio.stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            InitializationOptions(
                server_name="ffmpeg-server",
                server_version="1.1.0",
                capabilities=server.get_capabilities(
                    notification_options=NotificationOptions(),
                    experimental_capabilities={},
                ),
            ),
        )


if __name__ == "__main__":
    asyncio.run(main())