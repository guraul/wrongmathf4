#!/bin/bash

# WrongMath 服务停止脚本

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

# 项目根目录
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PID_DIR="$PROJECT_ROOT/.pids"

echo -e "${BLUE}停止 WrongMath 服务...${NC}"

# 停止后端
if [ -f "$PID_DIR/backend.pid" ]; then
    pid=$(cat "$PID_DIR/backend.pid")
    if ps -p $pid > /dev/null 2>&1; then
        kill $pid
        echo -e "${GREEN}后端已停止 (PID: $pid)${NC}"
    else
        echo -e "${YELLOW}后端进程不存在 (PID: $pid)${NC}"
    fi
    rm -f "$PID_DIR/backend.pid"
fi

# 停止前端
if [ -f "$PID_DIR/frontend.pid" ]; then
    pid=$(cat "$PID_DIR/frontend.pid")
    if ps -p $pid > /dev/null 2>&1; then
        kill $pid
        echo -e "${GREEN}前端已停止 (PID: $pid)${NC}"
    else
        echo -e "${YELLOW}前端进程不存在 (PID: $pid)${NC}"
    fi
    rm -f "$PID_DIR/frontend.pid"
fi

echo -e "${GREEN}所有服务已停止${NC}"
echo ""
echo -e "${YELLOW}注意: MCP 服务器由 OpenCode 管理，不在脚本控制范围内${NC}"
