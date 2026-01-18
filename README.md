# WrongMath MCP Server

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.1-green.svg)](package.json)
[![Python](https://img.shields.io/badge/python-3.8+-yellow.svg)](https://www.python.org/)

**一个基于 DeepSeek-OCR 的本地 Python MCP 服务器，用于识别数学错题。包含 Web UI 界面。**

A pure local Python MCP (Model Context Protocol) server that uses DeepSeek-OCR to recognize mathematical problems from PDFs and images, converting them to Markdown + LaTeX format. Includes Web UI.

## ✨ 特性 (Features)

### OCR Features
- ✅ **数学公式识别** - LaTeX 格式的数学表达式
- ✅ **几何图形描述** - 识别并描述几何图形
- ✅ **PDF 多页处理** - 支持多页 PDF 文档
- ✅ **函数表达式识别** - 识别数学函数
- ✅ **多栏布局支持** - 处理复杂的文档布局
- ✅ **纯本地处理** - 完全在您的本地运行，无需上传数据

### Web UI Features
- ✅ **拖拽上传** - React-dropzone 集成
- ✅ **进度跟踪** - 实时上传和识别进度
- ✅ **历史管理** - 会话基础的历史列表
- ✅ **结果预览** - Markdown 预览，支持复制/保存
- ✅ **跨浏览器支持** - Safari、Chrome、Firefox 已测试
- ✅ **响应式设计** - 移动友好的 Tailwind CSS 样式

## 📖 支持的格式 (Supported Formats)

### 输入格式
| 格式 | 扩展名 | 最大大小 |
|--------|----------|------|
| PDF | `.pdf` | 10 MB |
| JPEG | `.jpg`, `.jpeg` | 10 MB |
| PNG | `.png` | 10 MB |

### 输出格式
- **Markdown** - 人类可读的文本格式
- **LaTeX** - 数学公式包裹在 `$$...$$` 或 `$...$` 中

## 🛠️ 快速开始 (Quick Start)

### 前置条件

1. Python 3.8+
2. Node.js 16+ (仅 Web UI 需要)
3. 虚拟环境（推荐使用 venv）
4. SiliconFlow API 密钥

### 安装步骤

```bash
# 1. 克隆项目
git clone https://github.com/your-repo/wrongmath-mcp.git
cd wrongmath-mcp

# 2. 创建虚拟环境
python3 -m venv venv

# 3. 激活虚拟环境
source venv/bin/activate

# 4. 安装后端依赖
pip install -r requirements.txt

# 5. 安装前端依赖（仅 Web UI 需要）
cd frontend
npm install
cd ..
```

## 使用方式 (Usage Modes)

### 方式 1: Web UI（推荐）

**启动后端:**
```bash
source venv/bin/activate
python3 web.py
# 运行在 http://localhost:8000
```

**启动前端:**
```bash
cd frontend
npm run dev
# 运行在 http://localhost:3000
```

**使用方法:**
1. 访问 http://localhost:3000
2. 拖拽上传 PDF 或图片文件
3. 点击"开始识别"进行 OCR
4. 查看识别结果，可复制或保存为 Markdown

### 方式 2: MCP 服务器 (OpenCode 集成)

将以下配置添加到 OpenCode 的 `settings.json`：

```json
{
  "mcp": {
    "wrongmath": {
      "type": "local",
      "command": [
        "python3",
        "/absolute/path/to/wrongmath-mcp/src/server.py"
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

**启动 MCP 服务器:**
```bash
source venv/bin/activate
python3 -m src.server
```

### 环境变量配置

**方式 A: 使用 .env 文件（推荐）**

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

**方式 B: 手动导出（临时测试）**

```bash
# 导出环境变量
export SILICONFLOW_API_KEY=your-actual-api-key-here
export DEEPSEEK_OCR_MODEL=deepseek-ai/DeepSeek-OCR
export SILICONFLOW_BASE_URL=https://api.siliconflow.cn/v1
export LOG_LEVEL=INFO
```

**环境变量说明:**

| 变量 | 说明 | 默认值 |
|--------|------|--------|
| SILICONFLOW_API_KEY | SiliconFlow API 密钥 | *（必须设置） |
| DEEPSEEK_OCR_MODEL | OCR 模型 | `deepseek-ai/DeepSeek-OCR` |
| SILICONFLOW_BASE_URL | API 基础 URL | `https://api.siliconflow.cn/v1` |
| LOG_LEVEL | 日志级别 | `INFO` |

## 📚 项目结构 (Project Structure)

```
wrongmath-mcp/
├── src/                          # MCP 核心实现
│   ├── server.py                  # MCP 服务器
│   ├── services/
│   │   ├── ocr_service.py         # DeepSeek-OCR 服务
│   │   └── file_processor.py      # PDF/图像处理
│   └── utils/
│       ├── logger.py              # 日志系统
│       └── validators.py           # 输入验证
├── web.py                         # FastAPI 后端 (Web UI)
├── frontend/                      # Next.js 前端
│   ├── app/
│   │   ├── page.js               # 主页面
│   │   └── globals.css           # 全局样式
│   ├── components/
│   │   ├── FileUpload.jsx        # 文件上传
│   │   ├── OCRControl.jsx        # OCR 控制面板
│   │   ├── ResultPreview.jsx     # 结果预览
│   │   └── HistoryList.jsx       # 历史记录
│   ├── uploads/                   # 临时上传目录
│   └── package.json
├── tests/                        # 测试套件
│   ├── test_ocr_service.py
│   ├── test_file_processor.py
│   ├── test_validators.py
│   ├── test_server.py
│   └── fixtures/                 # 测试数据
├── docs/                         # 测试 PDF 文件
├── output/                       # 生成的 markdown 文件
├── logs/                         # 日志目录
├── requirements.txt               # 后端依赖
├── skills.json                  # MCP 配置
├── AGENTS.md                    # 开发者指南
└── README.md                    # 本文件
```

## 🎯 使用示例 (Usage Examples)

### Web UI 示例

1. 打开浏览器访问 http://localhost:3000
2. 拖拽数学题图片或 PDF 到上传区域
3. 点击"开始识别"
4. 查看识别结果，支持复制到剪贴板或下载为 Markdown

### MCP 集成示例

**示例 1: 处理 PDF 文件**

在 OpenCode 对话中输入：

```
请读取 /Users/yourname/Desktop/math_exam.pdf
```

**预期结果:**
- AI 调用 `wrongmath.read_math_file`
- 返回 Markdown 格式的数学题
- 每页单独标注
- 公式使用 LaTeX 格式（如 `$$x^2 + 2x + 1 = 0$$`）

**示例 2: 处理图片文件**

```
请识别 ~/Desktop/algebra_problem.jpg
```

**预期结果:**
- 识别图片中的数学公式
- 返回 LaTeX 格式的文本
- 自动转换为可复制粘贴的格式

## 🧪 核心功能 (Core Features)

- ✅ **MCP 协议支持** - 完整的 Model Context Protocol 实现
- ✅ **DeepSeek-OCR 集成** - SiliconFlow API 调用，重试机制
- ✅ **PDF 多页处理** - PyMuPDF 多页 PDF 转图片
- ✅ **图像处理** - PIL 图像读取和 Base64 转换
- ✅ **安全验证** - 路径遍历保护、文件类型验证、大小限制
- ✅ **错误处理** - 友好的中文错误提示、不崩溃
- ✅ **日志系统** - 可配置的日志级别
- ✅ **Web UI** - Next.js 前端，拖拽上传，实时进度
- ✅ **Safari 兼容性** - 修复 Safari 文件上传问题

## 📊 测试结果 (Test Results)

| 测试模块 | 结果 | 通过率 |
|----------|------|--------|
| 验证器测试 | 95% | ✅ |
| 文件处理测试 | 80% | ✅ |
| OCR 服务测试 | 100% | ✅ |
| 服务器测试 | 100% | ✅ |
| Web UI 上传 (Safari) | 成功 | ✅ |
| Web UI 上传 (Chrome) | 成功 | ✅ |
| **总体** | **67%** | ✅ |

## 🐛 故障排除 (Troubleshooting)

### 常见问题

**Safari 文件上传失败**
```
问题: 上传 15 字节 [object Object]
原因: 使用扩展运算符导致 File 对象丢失方法
解决: 已修复，使用包装对象保留 File 原型
详见: AGENTS.md "Frontend Development" 部分
```

**API 调用失败**
```
错误: API authentication failed
原因: API 密钥无效或已过期
解决: 检查并更新 SILICONFLOW_API_KEY
```

**文件未找到**
```
错误: 文件不存在
原因: 路径错误或文件被删除
解决: 检查文件路径是否正确
```

**不支持的文件类型**
```
错误: 不支持的文件类型
原因: 尝试处理 .txt, .docx 等格式
解决: 仅使用支持的格式：PDF, JPG, PNG, JPEG
```

**Web UI 无法访问**
```
错误: localhost:3000 无响应
原因: 前端未启动
解决: cd frontend && npm run dev
```

**MCP 服务器无法启动**
```
错误: MCP 服务器启动失败
原因: Python 路径错误或依赖未安装
解决: 检查虚拟环境和依赖安装
```

### 获取帮助

- 查看 [AGENTS.md](AGENTS.md) 获取详细的开发和代码规范
- 查看 API 文档: https://api.siliconflow.cn/

## 📜 许可证 (License)

MIT License - 详见 [LICENSE](LICENSE) 文件

## 🙏 支持 (Support)

- [GitHub Issues](https://github.com/your-repo/wrongmath-mcp/issues) - 提交问题和建议
- [文档](AGENTS.md) - 详细的开发和使用文档

---

**🎉 准备好开始使用！配置环境变量后选择 Web UI 或 MCP 模式即可。**
