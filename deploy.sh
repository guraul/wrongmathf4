#!/bin/bash

# WrongMath MCP Server - 快速启动脚本

# 颜色定义
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  WrongMath MCP Server 部署工具${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 检查 .env 文件
if [ ! -f .env ]; then
    echo -e "${YELLOW}⚠️  警告: .env 文件不存在${NC}"
    echo -e "${YELLOW}  正在创建 .env.example 的副本...${NC}"
    cp .env.example .env
    echo -e "${RED}❌ 重要: 请编辑 .env 文件并设置您的 SILICONFLOW_API_KEY！${NC}"
    echo ""
fi

# 检查虚拟环境
if [ ! -d venv ]; then
    echo -e "${RED}❌ 错误: 虚拟环境不存在${NC}"
    echo -e "${YELLOW}  正在创建虚拟环境...${NC}"
    python3 -m venv venv
    echo -e "${GREEN}✅ 虚拟环境已创建${NC}"
    echo -e "${YELLOW}  正在安装依赖...${NC}"
    source venv/bin/activate
    pip install -r requirements.txt
    echo -e "${GREEN}✅ 依赖已安装${NC}"
else
    echo -e "${GREEN}✅ 虚拟环境已存在${NC}"
fi

# 激活虚拟环境
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  步骤 1: 环境检查${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
source venv/bin/activate

# 检查环境变量
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  步骤 2: 环境配置${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

if [ -z "$SILICONFLOW_API_KEY" ]; then
    echo -e "${YELLOW}⚠️  SILICONFLOW_API_KEY 未设置${NC}"
    echo -e "${YELLOW}  从 .env 文件加载...${NC}"
    
    if [ -f .env ]; then
        export $(cat .env | grep -v '^#' | xargs)
        echo -e "${GREEN}✅ 环境变量已从 .env 文件加载${NC}"
    else
        echo -e "${RED}❌ 错误: .env 文件不存在${NC}"
        exit 1
    fi
else
    echo -e "${GREEN}✅ SILICONFLOW_API_KEY 已设置${NC}"
fi

# 显示配置信息
echo ""
echo -e "${BLUE}当前配置:${NC}"
echo -e "  API Key: ${GREEN}${SILICONFLOW_API_KEY:0:20}...${NC}****"
echo -e "  OCR Model: ${GREEN}${DEEPSEEK_OCR_MODEL}${NC}"
echo -e "  Base URL: ${GREEN}${SILICONFLOW_BASE_URL}${NC}"
echo -e "  Log Level: ${GREEN}${LOG_LEVEL:-INFO}${NC}"
echo ""

# 测试服务器导入
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  步骤 3: 测试服务器模块${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

echo -e "${YELLOW}  正在测试服务器模块导入...${NC}"
python3 -c "
import sys
import os
sys.path.insert(0, os.path.join(os.getcwd(), 'src'))

try:
    from server import server
    print('${GREEN}✅ 服务器模块导入成功${NC}')
    
    # 检查工具注册
    tools = server.list_tools()
    print('${GREEN}✅ 已注册工具:${NC}')
    for tool in tools:
        print(f'  - ${BLUE}{tool.name}${NC}: {tool.description[:60]}...')
        
except Exception as e:
    print('${RED}❌ 导入错误:${NC} {e}')
    import traceback
    traceback.print_exc()
    sys.exit(1)
"

if [ $? -ne 0 ]; then
    echo -e "${RED}❌ 服务器模块测试失败${NC}"
    echo -e "${YELLOW}  请检查依赖是否正确安装${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  步骤 4: OpenCode 配置${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""

# 生成 OpenCode 配置
PROJECT_PATH=$(pwd)
SETTINGS_PATH="$HOME/Library/Application Support/OpenCode/User/settings.json"

echo -e "${YELLOW}  OpenCode settings.json 位置:${NC}"
echo -e "  $SETTINGS_PATH"
echo ""

cat > mcp_config.json << 'EOF'
{
  "mcp": {
    "wrongmath": {
      "type": "local",
      "command": [
        "python3",
        "$PROJECT_PATH/src/server.py"
      ],
      "enabled": true,
      "environment": {
        "SILICONFLOW_API_KEY": "$SILICONFLOW_API_KEY",
        "DEEPSEEK_OCR_MODEL": "$DEEPSEEK_OCR_MODEL",
        "SILICONFLOW_BASE_URL": "$SILICONFLOW_BASE_URL",
        "LOG_LEVEL": "$LOG_LEVEL"
      }
    }
  }
}
EOF

echo -e "${GREEN}✅ 已生成 mcp_config.json${NC}"
echo -e "${YELLOW}  请将以下配置添加到 OpenCode settings.json:${NC}"
echo ""
cat mcp_config.json
echo ""
echo -e "${BLUE}========================================${NC}"
echo -e "${BLUE}  步骤 5: 部署完成${NC}"
echo -e "${BLUE}========================================${NC}"
echo ""
echo -e "${GREEN}✅ 部署准备完成！${NC}"
echo ""
echo -e "${YELLOW}接下来的步骤：${NC}"
echo -e "1. 在 OpenCode 中打开以下文件:"
echo -e "   $SETTINGS_PATH"
echo ""
echo -e "2. 将上面的配置添加到 settings.json（如果不存在 'mcp' 键）"
echo ""
echo -e "3. 保存 settings.json 并重启 OpenCode"
echo ""
echo -e "4. 在 OpenCode 中测试："
echo -e "   ${BLUE}你有哪些可用的工具？${NC}"
echo ""
echo -e "5. 测试处理现有 PDF:"
echo -e "   ${BLUE}请读取 $PROJECT_PATH/豆包爱学-错题组卷-20260110_1.pdf${NC}"
echo ""
echo -e "${YELLOW}  提示: 按 Ctrl+C 停止 MCP 服务器${NC}"
echo ""

# 提供直接启动选项
echo -e "${YELLOW}  要直接启动 MCP 服务器吗？ (y/n)${NC}"
read -t 5 -n -r answer

if [ "$answer" = "y" ]; then
    echo -e "${YELLOW}  正在启动 WrongMath MCP 服务器...${NC}"
    echo -e "${YELLOW}  (按 Ctrl+C 停止服务器)${NC}"
    echo ""
    python3 src/server.py
fi
