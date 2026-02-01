# WrongMath 服务启动脚本使用说明

## 概述

提供了两个脚本来管理 WrongMath 服务：

- `start_all.sh` - 启动 Web UI 服务（前端 + 后端）
- `stop_services.sh` - 停止 Web UI 服务

**注意**：MCP 服务器由 OpenCode 直接启动和管理，不在脚本控制范围内。

## 前置条件

1. ✅ Python 虚拟环境已创建 (`venv/`)
2. ✅ `.env` 文件已配置（包含 `SILICONFLOW_API_KEY`）
3. ✅ 前端依赖已安装 (`cd frontend && npm install`)
4. ✅ 后端依赖已安装 (`pip install -r requirements.txt`)

## 使用方法

### 启动所有服务

```bash
./start_all.sh
```

**脚本会自动：**
1. 检查虚拟环境和环境变量
2. 停止已运行的服务
3. 启动后端服务器（FastAPI，端口 8000）
4. 启动前端服务器（Next.js，端口 3000）
5. 监控服务状态

**启动成功后显示：**
```
=======================================
  服务启动完成！
=======================================

服务地址:
  - 前端: http://localhost:3000
  - 后端: http://localhost:8000
  - 后端 API 文档: http://localhost:8000/docs

注意: MCP 服务器由 OpenCode 启动

日志文件:
  - 后端: logs/backend.log
  - 前端: logs/frontend.log
```

### 停止所有服务

```bash
./stop_services.sh
```

**或按 Ctrl+C 停止**

## 服务说明

### 1. 后端服务器（FastAPI）
- **端口**: 8000
- **API 文档**: http://localhost:8000/docs
- **日志**: `logs/backend.log`
- **功能**: 文件上传、OCR 识别、结果保存

### 2. 前端服务器（Next.js）
- **端口**: 3000
- **日志**: `logs/frontend.log`
- **功能**: Web UI、拖拽上传、进度跟踪

### MCP 服务器（OpenCode 管理）
- **协议**: stdio
- **启动方式**: OpenCode 自动启动和管理
- **配置**: OpenCode settings.json
- **功能**: OpenCode 集成、MCP 工具

**MCP 服务器不在脚本控制范围内**，由 OpenCode 直接管理。

## 查看日志

### 实时查看后端日志
```bash
tail -f logs/backend.log
```

### 实时查看前端日志
```bash
tail -f logs/frontend.log
```



## 故障排除

### 虚拟环境不存在
```
错误: 虚拟环境不存在
请先运行: python3 -m venv venv
```
**解决**: 创建虚拟环境

### .env 文件不存在
```
警告: .env 文件不存在
请创建 .env 文件并设置 SILICONFLOW_API_KEY
```
**解决**: 从 `.env.example` 复制并配置

### API Key 未设置
```
错误: SILICONFLOW_API_KEY 未设置
```
**解决**: 在 `.env` 文件中设置有效的 API Key

### 端口被占用
```
后端启动失败
```
**解决**: 检查端口 8000 和 3000 是否被其他程序占用



## 文件结构

```
wrongmathf4/
├── start_all.sh          # 启动脚本
├── stop_services.sh      # 停止脚本
├── .pids/              # 进程 ID 文件（自动创建）
│   ├── backend.pid
│   ├── frontend.pid
│   └── mcp.pid
└── logs/               # 日志文件
    ├── backend.log
    ├── frontend.log
    └── mcp.log
```

## 注意事项

1. **进程管理**: 脚本使用 PID 文件追踪进程，不要手动删除 `.pids/` 目录
2. **日志轮转**: 日志文件会持续追加，建议定期清理
3. **环境变量**: `.env` 文件中的变量会被自动加载
4. **依赖检查**: 启动前会检查必要的依赖是否安装

## OpenCode MCP 配置

在 OpenCode 的 `settings.json` 中添加：

```json
{
  "mcp": {
    "wrongmath": {
      "type": "local",
      "command": [
        "python3",
        "-m",
        "servers.mcp"
      ],
      "enabled": true,
      "environment": {
        "SILICONFLOW_API_KEY": "sk-your-actual-api-key-here",
        "DEEPSEEK_OCR_MODEL": "deepseek-ai/DeepSeek-OCR",
        "SILICONFLOW_BASE_URL": "https://api.siliconflow.cn/v1",
        "LOG_LEVEL": "INFO"
      }
    }
  }
}
```

或者使用 `.env` 文件中的配置（推荐）。

---

**最后更新**: 2026-01-28
**版本**: 1.0.0
