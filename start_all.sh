#!/bin/bash

# WrongMath 服务启动脚本
# 同时启动前端、后端和 MCP 服务器

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# 项目根目录
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_ROOT"

# PID 文件
PID_DIR="$PROJECT_ROOT/.pids"
mkdir -p "$PID_DIR"

# 日志文件
LOG_DIR="$PROJECT_ROOT/logs"
mkdir -p "$LOG_DIR"

# 检查虚拟环境
if [ ! -d "venv" ]; then
    echo -e "${RED}错误: 虚拟环境不存在${NC}"
    echo "请先运行: python3 -m venv venv"
    exit 1
fi

# 激活虚拟环境
source venv/bin/activate

# 检查环境变量
if [ ! -f ".env" ]; then
    echo -e "${YELLOW}警告: .env 文件不存在${NC}"
    echo "请创建 .env 文件并设置 SILICONFLOW_API_KEY"
    exit 1
fi

# 加载环境变量
export $(grep -v '^#' .env | xargs)

# 检查 API Key
if [ -z "$SILICONFLOW_API_KEY" ]; then
    echo -e "${RED}错误: SILICONICONFLOW_API_KEY 未设置${NC}"
    exit 1
fi

# 停止已运行的服务
stop_services() {
    echo -e "${BLUE}停止现有服务...${NC}"
    
    # 停止后端
    if [ -f "$PID_DIR/backend.pid" ]; then
        pid=$(cat "$PID_DIR/backend.pid")
        if ps -p $pid > /dev/null 2>&1; then
            kill $pid
            echo -e "${GREEN}后端已停止 (PID: $pid)${NC}"
        fi
        rm -f "$PID_DIR/backend.pid"
    fi
    
    # 停止前端
    if [ -f "$PID_DIR/frontend.pid" ]; then
        pid=$(cat "$PID_DIR/frontend.pid")
        if ps -p $pid > /dev/null 2>&1; then
            kill $pid
            echo -e "${GREEN}前端已停止 (PID: $pid)${NC}"
        fi
        rm -f "$PID_DIR/frontend.pid"
    fi
    
    # 停止 MCP
    if [ -f "$PID_DIR/mcp.pid" ]; then
        pid=$(cat "$PID_DIR/mcp.pid")
        if ps -p $pid > /dev/null 2>&1; then
            kill $pid
            echo -e "${GREEN}MCP 已停止 (PID: $pid)${NC}"
        fi
        rm -f "$PID_DIR/mcp.pid"
    fi
}

# 捕获 Ctrl+C 信号
trap stop_services EXIT INT TERM

# 启动后端服务器
start_backend() {
    echo -e "${BLUE}启动后端服务器 (FastAPI)...${NC}"
    
    nohup python3 -m servers.web > "$LOG_DIR/backend.log" 2>&1 &
    BACKEND_PID=$!
    echo $BACKEND_PID > "$PID_DIR/backend.pid"
    
    # 等待后端启动
    for i in {1..10}; do
        if curl -s http://localhost:8000/docs > /dev/null 2>&1; then
            echo -e "${GREEN}后端启动成功 (PID: $BACKEND_PID, 端口: 8000)${NC}"
            return 0
        fi
        sleep 1
    done
    
    echo -e "${RED}后端启动失败${NC}"
    return 1
}

# 启动前端服务器
start_frontend() {
    echo -e "${BLUE}启动前端服务器 (Next.js)...${NC}"
    
    cd frontend
    nohup npm run dev > "$LOG_DIR/frontend.log" 2>&1 &
    FRONTEND_PID=$!
    cd "$PROJECT_ROOT"
    echo $FRONTEND_PID > "$PID_DIR/frontend.pid"
    
    # 等待前端启动
    for i in {1..15}; do
        if curl -s http://localhost:3000 > /dev/null 2>&1; then
            echo -e "${GREEN}前端启动成功 (PID: $FRONTEND_PID, 端口: 3000)${NC}"
            return 0
        fi
        sleep 1
    done
    
    echo -e "${YELLOW}前端启动中... (可能需要更多时间)${NC}"
    return 0
}

# 主函数
main() {
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  WrongMath 服务启动脚本${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    
    # 停止现有服务
    stop_services
    sleep 1
    
    # 启动服务
    start_backend || exit 1
    start_frontend || exit 1
    
    echo ""
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}  服务启动完成！${NC}"
    echo -e "${GREEN}========================================${NC}"
    echo ""
    echo -e "${BLUE}服务地址:${NC}"
    echo -e "  - 前端: ${GREEN}http://localhost:3000${NC}"
    echo -e "  - 后端: ${GREEN}http://localhost:8000${NC}"
    echo -e "  - 后端 API 文档: ${GREEN}http://localhost:8000/docs${NC}"
    echo ""
    echo -e "${YELLOW}MCP 服务器说明:${NC}"
    echo -e "  MCP 服务器由 OpenCode 直接启动和管理"
    echo -e "  在 OpenCode 中配置 MCP 后，使用 MCP 工具时自动启动"
    echo ""
    echo -e "${BLUE}日志文件:${NC}"
    echo -e "  - 后端: ${YELLOW}$LOG_DIR/backend.log${NC}"
    echo -e "  - 前端: ${YELLOW}$LOG_DIR/frontend.log${NC}"
    echo ""
    echo -e "${BLUE}查看日志:${NC}"
    echo -e "  - 后端: ${YELLOW}tail -f $LOG_DIR/backend.log${NC}"
    echo -e "  - 前端: ${YELLOW}tail -f $LOG_DIR/frontend.log${NC}"
    echo ""
    echo -e "${BLUE}停止所有服务:${NC}"
    echo -e "  - 运行: ${YELLOW}./stop_services.sh${NC}"
    echo -e "  - 或按: ${YELLOW}Ctrl+C${NC}"
    echo ""
    
    # 保持脚本运行
    echo -e "${GREEN}服务运行中... (按 Ctrl+C 停止)${NC}"
    while true; do
        sleep 5
        
        # 检查服务状态
        if ! ps -p $BACKEND_PID > /dev/null 2>&1; then
            echo -e "${RED}后端服务已停止${NC}"
            break
        fi
        
        if ! ps -p $FRONTEND_PID > /dev/null 2>&1; then
            echo -e "${RED}前端服务已停止${NC}"
            break
        fi
    done
    
    echo -e "${YELLOW}检测到服务停止，正在清理...${NC}"
}

# 运行主函数
main
