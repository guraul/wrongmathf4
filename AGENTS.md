# AGENTS.md - WrongMath V1

## Project Overview

**WrongMath** converts math problem images to worksheet-format Markdown。手机拍一张试卷照片 → 自动生成可打印的错题试卷。

- **Tech Stack**: Python 3.13 + asyncio (Agent-first) + FastAPI (REST)
- **Vision Model**: GLM-4.5V (`zai-org/GLM-4.5V`) via SiliconFlow
- **Output**: Obsidian-compatible Markdown，`N. 题目` + 答题空白 + `> *（配图）*`
- **V1 Scope**: REST channel + Markdown output（WeChat 计划 V2）

---

## Architecture

```
User 上传图片 → Preprocessor (resize/contrast) → GLM-4.5V (extract JSON)
  → ResultSaver (JSON → Markdown) → output/{科目}/{date}.md
```

```
wrongmathf4/
├── main.py                    # 应用入口
├── config/
│   ├── config.yaml            # Agent、通道、科目、LLM 配置
│   └── settings.py            # 类型化配置加载
├── agent/                     # Agent 子系统
│   ├── engine.py              # AgentEngine：生命周期管理
│   ├── scheduler.py           # 处理管线：预处理 → GLM → Markdown
│   ├── task.py                # Task 数据类
│   ├── task_queue.py          # PriorityQueue + 磁盘持久化
│   ├── channels/
│   │   ├── base.py            # 通道抽象基类
│   │   └── rest.py            # REST 通道（uvicorn 子进程）
│   └── services/
│       ├── glm_service.py     # GLM-4.5V 视觉模型调用
│       └── result_saver.py    # JSON → 试卷格式 Markdown
├── core/                      # 共享逻辑
│   ├── services/
│   │   ├── image_preprocessor.py  # 图像增强、缩放、base64 编码
│   │   ├── ocr_service.py         # 旧 DeepSeek-OCR（保留，scheduler 不用）
│   │   └── file_processor.py      # PDF→图片、文件信息
│   └── utils/
│       ├── logger.py              # 日志
│       └── validators.py          # 路径/文件校验
├── servers/
│   ├── web_app.py             # FastAPI：上传、浏览、下载、PDF 合并
│   └── mcp.py                 # MCP stdio 服务器（旧模式，保留）
├── frontend/                  # Next.js 前端（旧模式，保留）
├── tests/                     # 测试（40 通过，1 跳过）
└── output/                    # 生成结果
    └── 数学/                  # 按科目分目录
```

---

## Quick Start

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 配置 API Key

```bash
echo 'SILICONFLOW_API_KEY=sk-xxx' > .env
```

### 3. 启动

```bash
python3 main.py
```

UI 打开 http://localhost:8080。

### CLI 模式（单张图片直处理）

```bash
python3 -c "
import asyncio
from agent.services.glm_service import GLMService
from agent.services.result_saver import save_result
from core.services.image_preprocessor import process_and_split_to_base64

async def main():
    chunks, _ = process_and_split_to_base64('tests/fixtures/微信图片_20260522163257_1_9.jpg')
    glm = GLMService()
    result = await glm.process_image(chunks)
    path = save_result(result)
    print(f'Saved: {path}')

asyncio.run(main())
"
```

---

## Output Format

```markdown
---
title: 数学 错题 2026-05-28
subject: 数学
date: 2026-05-28
---

1. 果园里有桃树2500棵...

<br>
<br>
<br>
<br>

2. 如图，已知大正方形的面积...
> *（配图）*

<br>
<br>
<br>
<br>

3. 甲、乙两人绕操场步行...
```

- `N.` 纯文本编号（无粗体/标题）
- `<br>` × 4 = 答题空白
- 配图题：`> *（配图）*` 占位
- YAML frontmatter 含日期、科目

---

## Tests

```bash
pytest tests/ -v                          # 全部（40 通过）
pytest tests/test_result_saver.py -v      # 结果保存
pytest tests/test_glm_service.py -v       # GLM 服务
pytest tests/test_e2e.py -v               # API + Agent E2E
```

---

## Code Style

### Imports
- 绝对导入：`from core.services.image_preprocessor import ...`
- 禁止相对导入（`from .services import ...`）
- 顺序：stdlib → third-party → local

### Naming
- **文件**: snake_case (`result_saver.py`, `glm_service.py`)
- **类**: PascalCase (`GLMService`, `AgentEngine`)
- **函数/变量**: snake_case (`save_result`, `image_chunks`)
- **常量**: UPPER_SNAKE_CASE (`MAX_FILE_SIZE_MB`)

### Type Hints
- 所有函数签名必须有类型标注
- `async def` 用于 I/O 操作（API 调用、文件读写）
- 测试中 mock 异步函数用 `AsyncMock`

### Error Handling
- 不裸 `except: pass`
- 异常记日志后向上传播或返回 fallback 值

### Logging
```python
logger = logging.getLogger("agent.scheduler")
logger.info(f"Processing task {task.id}")
```

---

## Configuration

### config.yaml
```yaml
agent: { name: WrongMath, max_concurrent: 3 }
channels:
  rest: { enabled: true, host: "0.0.0.0", port: 19238 }
subjects: [数学, 语文, 英语, 物理, 化学]
```

### .env
```
SILICONFLOW_API_KEY=sk-xxx    # 必填
DEEPSEEK_API_KEY=sk-xxx       # 保留，V1 未用
```

---

## Key Decisions

| 决策 | 原因 |
|------|------|
| **GLM-4.5V 替代 DeepSeek-OCR** | 单次调用检测 26 题（vs 1 题），且自带 subject 检测 |
| **不做图形渲染** | TikZ/SVG/JSXGraph 的 VLM 坐标太不准确，用 `> *（配图）*` 占位 |
| **Markdown 输出（非 HTML）** | Obsidian 兼容，可打印，可编辑 |
| **无数据库** | 文件系统：`output/{科目}/{date}.md` |
| **<br> 答题空白** | 纯空行被 Markdown 折叠，`<br>` 保留可见空白 |
