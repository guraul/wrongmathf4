# WrongMath MCP Server - 部署指南 (Deployment Guide)

## 概述 (Overview)

本指南将帮助您部署 WrongMath MCP 服务器到 OpenCode 环境。

## 步骤 1: 环境配置 (Step 1: Environment Setup)

### 1.1 创建虚拟环境并安装依赖

```bash
# 进入项目目录
cd /Users/gubin/project/wrongmathf4

# 激活虚拟环境
source venv/bin/activate

# 确认所有依赖已安装
pip list
```

### 1.2 配置环境变量

#### 方式 A: 使用 .env 文件（推荐）

创建 `.env` 文件：

```bash
cat > .env << 'EOF'
# SiliconFlow API 配置
SILICONFLOW_API_KEY=your-actual-api-key-here
DEEPSEEK_OCR_MODEL=deepseek-ai/DeepSeek-OCR
SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1

# 日志配置
LOG_LEVEL=INFO
EOF
```

#### 方式 B: 手动导出（临时测试）

```bash
# 导出环境变量
export SILICONFLOW_API_KEY=your-actual-api-key-here
export DEEPSEEK_OCR_MODEL=deepseek-ai/DeepSeek-OCR
export SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1
export LOG_LEVEL=INFO
```

## 步骤 2: OpenCode 配置 (Step 2: OpenCode Configuration)

### 2.1 找到 OpenCode 配置文件位置

OpenCode 配置文件通常位于：

```bash
~/Library/Application Support/OpenCode/User/settings.json
```

### 2.2 添加 MCP 服务器配置

将以下配置添加到您的 `settings.json` 文件：

```json
{
  "mcp": {
    "wrongmath": {
      "type": "local",
      "command": [
        "python3",
        "/Users/gubin/project/wrongmathf4/src/server.py"
      ],
      "enabled": true,
      "environment": {
        "SILICONFLOW_API_KEY": "your-actual-api-key-here",
        "DEEPSEEK_OCR_MODEL": "deepseek-ai/DeepSeek-OCR",
        "SILICONFLOW_BASE_URL": "https://api.siliconflow.cn/v1",
        "LOG_LEVEL": "INFO"
      }
    }
  }
}
```

**重要提示：**
- 确保 `command` 中的路径是绝对路径
- 更新 `SILICONFLOW_API_KEY` 为您的实际 API 密钥
- 路径使用正斜杠 `/`，不要使用反斜杠 `\`

## 步骤 3: 启动测试 (Step 3: Startup Test)

### 3.1 测试服务器启动

```bash
# 激活虚拟环境
source venv/bin/activate

# 测试服务器启动（应该在后台运行）
python3 src/server.py
```

**预期结果：**
- 看到: `[INFO] server - WrongMath MCP Server starting with log level: INFO`
- 看到: `[INFO] server - WrongMath MCP Server started`
- 等待 stdio 输入（这是正常的）

**按 Ctrl+C 停止服务器**

### 3.2 验证工具注册

如果您想测试 MCP 协议，可以发送 JSON-RPC 请求：

```bash
# 创建测试请求文件
cat > test_mcp_request.json << 'EOF'
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/list"
}
EOF

# 发送请求（需要服务器运行中）
cat test_mcp_request.json | python3 src/server.py
```

## 步骤 4: 在 OpenCode 中使用 (Step 4: Use in OpenCode)

### 4.1 重启 OpenCode

配置完成后，完全重启 OpenCode：
1. 完全退出 OpenCode（Cmd+Q 或 File → Quit）
2. 重新启动 OpenCode

### 4.2 验证连接

1. 打开 OpenCode 开发者工具（View → Developer → Toggle Developer Tools）

2. 查看控制台日志，应该看到：
   ```
   MCP server 'wrongmath' connected
   ```

3. 测试工具发现，在 OpenCode 对话中输入：
   ```
   你有哪些可用的工具？
   ```

   **期望回答：** AI 应该提到 `read_math_file` 工具

### 4.3 测试实际文件处理

#### 测试示例 1：处理现有 PDF

```
请读取 /Users/gubin/project/wrongmathf4/豆包爱学-错题组卷-20260110_1.pdf
```

**期望结果：**
- OpenCode 调用 `wrongmath.read_math_file`
- 返回 Markdown + LaTeX 格式的数学题
- 所有公式使用 `$$...$$` 或 `$...$` 格式

#### 测试示例 2：处理图片

如果您有数学题图片：

```
请识别 ~/Desktop/math_problem.jpg 中的数学题
```

## 步骤 5: 故障排除 (Step 5: Troubleshooting)

### 5.1 常见问题

#### 问题：MCP 服务器无法启动

**可能原因：**
- Python 路径不正确
- 虚拟环境未激活
- 依赖未安装

**解决方案：**
```bash
# 检查 Python 路径
which python3

# 检查虚拟环境
ls -la venv/bin/python3

# 测试导入
source venv/bin/activate
python3 -c "from src.server import server; print('OK')"
```

#### 问题：API 密钥无效

**症状：**
- 日志显示: `API authentication failed`
- 错误信息: `401 Unauthorized`

**解决方案：**
```bash
# 1. 验证 API 密钥
echo $SILICONFLOW_API_KEY

# 2. 测试 API 连接
curl -X POST https://api.siliconflow.cn/v1/chat/completions \
  -H "Authorization: Bearer $SILICONFLOW_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "deepseek-ai/DeepSeek-OCR",
    "messages": [{"role": "user", "content": "test"}]
  }'

# 3. 更新 API 密钥
# 编辑 .env 文件或 OpenCode settings.json
```

#### 问题：文件路径错误

**症状：**
- 错误: `文件不存在`
- 错误: `文件路径必须是绝对路径`

**解决方案：**
- 确保使用绝对路径（以 `/` 开头）
- 验证文件确实存在：`ls -la /path/to/file.pdf`
- 使用 `pwd` 获取当前目录的绝对路径

#### 问题：PDF 处理失败

**可能原因：**
- PDF 文件损坏
- PyMuPDF 版本问题
- 文件权限问题

**解决方案：**
```bash
# 检查 PDF 文件
file 豆包爱学-错题组卷-20260110_1.pdf

# 测试 PDF 阅读
python3 -c "
import fitz
doc = fitz.open('豆包爱学-错题组卷-20260110_1.pdf')
print(f'PDF pages: {len(doc)}')
print(f'PDF metadata: {doc.metadata}')
doc.close()
"
```

#### 问题：OCR 识别不准确

**可能原因：**
- 图片质量低
- 公式太复杂
- 模型参数需要调整

**解决方案：**
- 提高图片扫描 DPI（300+）
- 确保图片对比度高
- 分页处理大文件
- 在提示中要求更详细的输出

## 步骤 6: 生产环境配置 (Step 6: Production Configuration)

### 6.1 性能优化

对于生产使用，考虑以下优化：

```bash
# 使用更高的日志级别（减少日志输出）
export LOG_LEVEL=WARNING

# 或者完全禁用日志
export LOG_LEVEL=ERROR
```

### 6.2 安全建议

```bash
# 确保 API 密钥不泄露
# 不要在 Git 中提交 .env 文件
# 使用环境变量管理工具如 direnv

# 配置文件权限
chmod 600 .env  # 仅所有者可读写
chmod 600 ~/Library/Application\ Support/OpenCode/User/settings.json
```

## 步骤 7: 验证清单 (Step 7: Verification Checklist)

部署完成后，验证以下项目：

- [ ] API 密钥已正确配置
- [ ] 虚拟环境已激活
- [ ] OpenCode settings.json 已更新
- [ ] MCP 服务器在 OpenCode 控制台显示为已连接
- [ ] 工具列表中包含 `read_math_file`
- [ ] 能够成功读取 PDF 文件
- [ ] 能够成功读取图片文件
- [ ] OCR 返回 Markdown + LaTeX 格式的内容
- [ ] 错误处理正常工作（友好的中文错误消息）

## 附录 A: 完整配置示例 (Appendix A: Complete Configuration Example)

### A.1 开发环境配置

**.env 文件：**
```env
# SiliconFlow API 配置
SILICONFLOW_API_KEY=sk-dev-test-key-12345
DEEPSEEK_OCR_MODEL=deepseek-ai/DeepSeek-OCR
SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1

# 日志配置（开发环境）
LOG_LEVEL=DEBUG
```

**OpenCode settings.json：**
```json
{
  "mcp": {
    "wrongmath": {
      "type": "local",
      "command": [
        "python3",
        "/Users/gubin/project/wrongmathf4/src/server.py"
      ],
      "enabled": true,
      "environment": {
        "SILICONFLOW_API_KEY": "sk-dev-test-key-12345",
        "DEEPSEEK_OCR_MODEL": "deepseek-ai/DeepSeek-OCR",
        "SILICONFLOW_BASE_URL": "https://api.siliconflow.cn/v1",
        "LOG_LEVEL": "DEBUG"
      }
    }
  }
}
```

### A.2 生产环境配置

**.env 文件：**
```env
# SiliconFlow API 配置
SILICONFLOW_API_KEY=sk-prod-key-67890
DEEPSEEK_OCR_MODEL=deepseek-ai/DeepSeek-OCR
SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1

# 日志配置（生产环境）
LOG_LEVEL=WARNING
```

## 附录 B: 日志级别说明 (Appendix B: Log Level Reference)

| 级别 | 用途 | 示例 |
|--------|------|--------|
| `DEBUG` | 详细的调试信息 | `[DEBUG] file_processor - Converted PDF page 1 to image` |
| `INFO` | 一般信息（默认） | `[INFO] server - WrongMath MCP Server started` |
| `WARNING` | 警告信息 | `[WARNING] server - SILICONFLOW_API_KEY not found` |
| `ERROR` | 错误信息 | `[ERROR] file_processor - PDF processing failed` |

## 附录 C: 支持的文件格式 (Appendix C: Supported File Formats)

| 格式 | 扩展名 | 说明 |
|--------|----------|------|
| PDF | `.pdf` | 多页文档支持 |
| JPEG | `.jpg`, `.jpeg` | 常见图片格式 |
| PNG | `.png` | 支持透明背景 |
| **不支持** | `.txt`, `.doc`, `.docx` | 会抛出不支持的文件类型错误 |

## 支持资源

- **OpenCode 文档**: 参考您的 OpenCode 版本文档
- **MCP 协议**: https://modelcontextprotocol.io/
- **SiliconFlow API**: https://docs.siliconflow.cn/
- **DeepSeek-OCR**: 查看 SiliconFlow API 文档中的模型说明

## 更新日志 (Update Log)

- **v1.0.0** (2026-01-17): 初始部署指南
  - 完整的环境配置步骤
  - OpenCode 集成说明
  - 故障排除指南
  - 中文语言支持
