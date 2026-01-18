#!/usr/bin/env python3
"""
WrongMath MCP Server - 直接启动脚本
这个脚本直接运行服务器，避免模块导入问题
"""

import sys
import os

# 添加项目根目录到 Python 路径
project_root = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, project_root)

print("🔍 项目根目录:", project_root)
print("🔍 Python 路径:", sys.path[:3])
print("")

try:
    # 导入主模块并调用 main 函数
    from src.server import server
    print("✅ 服务器模块导入成功")
    print("")
    print("🚀 启动 WrongMath MCP 服务器...")
    print("")
    print("💡 提示: 按 Ctrl+C 停止服务器")
    print("💡 等待 OpenCode 连接...")
    print("")

    # 直接运行主函数（这里会启动 stdio 服务器）
    import asyncio
    asyncio.run(server())

except ImportError as e:
    print(f"❌ 导入失败: {e}")
    print("")
    print("💡 解决方案:")
    print("   1. 确保已安装依赖: source venv/bin/activate && pip install -r requirements.txt")
    print("   2. 使用 Python -m 运行: python3 -m src.server")
    sys.exit(1)
except KeyboardInterrupt:
    print("\n👋 服务器已停止")
    sys.exit(0)
except Exception as e:
    print(f"❌ 错误: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)