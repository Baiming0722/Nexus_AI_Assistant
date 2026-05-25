"""
計算機 MCP Server
提供安全的數學運算功能，支援基本運算、代數運算、微積分等。
    # pip install mcp sympy
"""

from typing import Any
import json

import sympy as sp
from mcp.server.models import InitializationOptions
import mcp.types as types
from mcp.server import NotificationOptions, Server
import mcp.server.stdio

# 初始化 MCP server
server = Server("calculator")


@server.list_tools()
async def handle_list_tools() -> list[types.Tool]:
    """列出所有可用的工具"""
    return [
        types.Tool(
            name="calculate",
            description="計算數學運算式的結果，支援基本運算（+, -, *, /, ^）、括號、函數（sin, cos, sqrt等）和常數（pi, e等）",
            inputSchema={
                "type": "object",
                "properties": {
                    "equation": {
                        "type": "string",
                        "description": "要計算的數學運算式，例如：'3 + 5 * (2 - 8)' 或 'sqrt(16) + pi'"
                    }
                },
                "required": ["equation"]
            }
        ),
        types.Tool(
            name="solve_equation",
            description="解方程式，求解未知數 x 的值",
            inputSchema={
                "type": "object",
                "properties": {
                    "equation": {
                        "type": "string",
                        "description": "要解的方程式，例如：'x**2 - 4 = 0' 或 '2*x + 5 = 13'"
                    }
                },
                "required": ["equation"]
            }
        ),
        types.Tool(
            name="simplify",
            description="簡化數學運算式",
            inputSchema={
                "type": "object",
                "properties": {
                    "expression": {
                        "type": "string",
                        "description": "要簡化的運算式，例如：'(x**2 - 1)/(x - 1)' 或 'sin(x)**2 + cos(x)**2'"
                    }
                },
                "required": ["expression"]
            }
        ),
        types.Tool(
            name="derivative",
            description="計算函數的導數",
            inputSchema={
                "type": "object",
                "properties": {
                    "expression": {
                        "type": "string",
                        "description": "要微分的函數，例如：'x**2 + 3*x + 2'"
                    },
                    "variable": {
                        "type": "string",
                        "description": "微分變數，預設為 'x'"
                    }
                },
                "required": ["expression"]
            }
        ),
        types.Tool(
            name="integrate",
            description="計算函數的積分",
            inputSchema={
                "type": "object",
                "properties": {
                    "expression": {
                        "type": "string",
                        "description": "要積分的函數，例如：'x**2 + 3*x + 2'"
                    },
                    "variable": {
                        "type": "string",
                        "description": "積分變數，預設為 'x'"
                    }
                },
                "required": ["expression"]
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
        if name == "calculate":
            result = calculate(arguments)
        elif name == "solve_equation":
            result = solve_equation(arguments)
        elif name == "simplify":
            result = simplify_expression(arguments)
        elif name == "derivative":
            result = calculate_derivative(arguments)
        elif name == "integrate":
            result = calculate_integral(arguments)
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


def calculate(params: dict[str, Any]) -> str:
    """
    計算數學運算式的結果
    :param params: 包含 equation 的參數字典
    :return: 計算結果字串
    """
    equation = params.get("equation", "")

    if not equation:
        return json.dumps({
            "success": False,
            "message": "請提供要計算的運算式"
        }, ensure_ascii=False, indent=2)

    try:
        # 使用 sympy 解析運算式
        expr = sp.sympify(equation)
        result = expr.evalf()

        return json.dumps({
            "success": True,
            "equation": equation,
            "result": str(result),
            "message": f"{equation} = {result}"
        }, ensure_ascii=False, indent=2)

    except (sp.SympifyError, ValueError, TypeError) as e:
        return json.dumps({
            "success": False,
            "equation": equation,
            "error": str(e),
            "message": "運算式格式錯誤，請檢查語法"
        }, ensure_ascii=False, indent=2)


def solve_equation(params: dict[str, Any]) -> str:
    """
    解方程式
    :param params: 包含 equation 的參數字典
    :return: 解答結果字串
    """
    equation = params.get("equation", "")

    if not equation:
        return json.dumps({
            "success": False,
            "message": "請提供要解的方程式"
        }, ensure_ascii=False, indent=2)

    try:
        # 定義變數 x
        x = sp.Symbol('x')

        # 解析方程式
        expr = sp.sympify(equation)

        # 求解
        solutions = sp.solve(expr, x)

        return json.dumps({
            "success": True,
            "equation": equation,
            "solutions": [str(sol) for sol in solutions],
            "message": f"方程式 {equation} 的解為：{solutions}"
        }, ensure_ascii=False, indent=2)

    except Exception as e:
        return json.dumps({
            "success": False,
            "equation": equation,
            "error": str(e),
            "message": "無法解此方程式"
        }, ensure_ascii=False, indent=2)


def simplify_expression(params: dict[str, Any]) -> str:
    """
    簡化數學運算式
    :param params: 包含 expression 的參數字典
    :return: 簡化結果字串
    """
    expression = params.get("expression", "")

    if not expression:
        return json.dumps({
            "success": False,
            "message": "請提供要簡化的運算式"
        }, ensure_ascii=False, indent=2)

    try:
        # 解析並簡化運算式
        expr = sp.sympify(expression)
        simplified = sp.simplify(expr)

        return json.dumps({
            "success": True,
            "original": expression,
            "simplified": str(simplified),
            "message": f"簡化結果：{expression} = {simplified}"
        }, ensure_ascii=False, indent=2)

    except Exception as e:
        return json.dumps({
            "success": False,
            "expression": expression,
            "error": str(e),
            "message": "無法簡化此運算式"
        }, ensure_ascii=False, indent=2)


def calculate_derivative(params: dict[str, Any]) -> str:
    """
    計算函數的導數
    :param params: 包含 expression 和可選 variable 的參數字典
    :return: 導數結果字串
    """
    expression = params.get("expression", "")
    variable = params.get("variable", "x")

    if not expression:
        return json.dumps({
            "success": False,
            "message": "請提供要微分的函數"
        }, ensure_ascii=False, indent=2)

    try:
        # 定義變數
        var = sp.Symbol(variable)

        # 解析運算式
        expr = sp.sympify(expression)

        # 計算導數
        derivative = sp.diff(expr, var)

        return json.dumps({
            "success": True,
            "expression": expression,
            "variable": variable,
            "derivative": str(derivative),
            "message": f"d({expression})/d{variable} = {derivative}"
        }, ensure_ascii=False, indent=2)

    except Exception as e:
        return json.dumps({
            "success": False,
            "expression": expression,
            "error": str(e),
            "message": "無法計算導數"
        }, ensure_ascii=False, indent=2)


def calculate_integral(params: dict[str, Any]) -> str:
    """
    計算函數的積分
    :param params: 包含 expression 和可選 variable 的參數字典
    :return: 積分結果字串
    """
    expression = params.get("expression", "")
    variable = params.get("variable", "x")

    if not expression:
        return json.dumps({
            "success": False,
            "message": "請提供要積分的函數"
        }, ensure_ascii=False, indent=2)

    try:
        # 定義變數
        var = sp.Symbol(variable)

        # 解析運算式
        expr = sp.sympify(expression)

        # 計算積分
        integral = sp.integrate(expr, var)

        return json.dumps({
            "success": True,
            "expression": expression,
            "variable": variable,
            "integral": str(integral),
            "message": f"∫({expression})d{variable} = {integral} + C"
        }, ensure_ascii=False, indent=2)

    except Exception as e:
        return json.dumps({
            "success": False,
            "expression": expression,
            "error": str(e),
            "message": "無法計算積分"
        }, ensure_ascii=False, indent=2)


async def main():
    """執行 MCP server"""
    async with mcp.server.stdio.stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            InitializationOptions(
                server_name="calculator",
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