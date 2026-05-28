# WrongMath V1

**手机拍试卷 → 自动生成可打印的错题试卷。**
Photo a math worksheet → printable Markdown worksheet with answer space.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Python](https://img.shields.io/badge/python-3.11+-yellow.svg)](https://www.python.org/)

---

## 升级架构 (V1 Architecture Upgrade)

V1 是一次重大架构升级，相比旧版做了以下关键改变：

| 旧版 (V0) | V1 |
|-----------|----|
| DeepSeek-OCR（每次只识别 1 题） | **GLM-4.5V**（单次调用识别 26 题 + 科目检测） |
| DeepSeek V4 Pro 验证（二次 LLM 调用） | **一次调用**（GLM-4.5V 同时完成 OCR + 分类） |
| 两套入口（MCP + Web） | **统一入口** `main.py`（Agent 引擎 + REST 通道） |
| Web UI 需要前端独立启动 | **内嵌前端**，`main.py` 一键启动 |
| 输出 Markdown 无答题空间 | **试卷格式**（`N.` + `<br>` 答题空白 + `> *（配图）*`） |
| 尝试生成图形（TikZ/SVG/JSXGraph） | **占位符**（VLM 坐标不准，不做图） |

**为什么升级：**
- **速度**：2 次 API → 1 次，从 ~90s 降到 ~70s
- **准确**：GLM-4.5V 一次检测 26 题 vs DeepSeek-OCR 每次 1 题
- **简洁**：无需前端独立部署，`python3 main.py` 即用
- **实用**：输出可直接打印的试卷 Markdown，不是只读的识别结果

---

## Features

- **一键启动** — `python3 main.py`，无需 Node.js 前端
- **GLM-4.5V 视觉模型** — 单次 API 调用提取全部数学题 + 自动检测科目
- **试卷格式输出** — `N. 题目` + `<br>` 答题空白 + `> *（配图）*` 占位
- **Obsidian 兼容** — Markdown + YAML frontmatter，可直接打印
- **自动预处理** — 长图缩放、对比度/锐度增强
- **Web UI** — 上传、浏览、下载、PDF 合并

---

## Quick Start

### 1. Install

```bash
pip install -r requirements.txt
```

### 2. Configure API Key

```bash
echo 'SILICONFLOW_API_KEY=sk-xxx' > .env
```

### 3. Start

```bash
python3 main.py
```

打开 http://localhost:19238。

### CLI Mode (single image)

```bash
python3 -c "
import asyncio
from agent.services.glm_service import GLMService
from agent.services.result_saver import save_result
from core.services.image_preprocessor import process_and_split_to_base64

async def main():
    chunks, _ = process_and_split_to_base64('photo.jpg')
    result = await GLMService().process_image(chunks)
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

- `N.` 纯文本编号
- `<br>` × 4 = 答题空白
- `> *（配图）*` = 配图题标记

---

## Architecture

```
图片 → Preprocessor (resize/contrast) → GLM-4.5V (extract JSON)
  → ResultSaver (JSON → Markdown) → output/{科目}/{date}.md
```

```
wrongmathf4/
├── main.py                    # 入口
├── config/
│   ├── config.yaml            # Agent / 通道 / 科目配置
│   └── settings.py
├── agent/                     # Agent 子系统
│   ├── engine.py              # 生命周期管理
│   ├── scheduler.py           # 管线：预处理 → GLM → Markdown
│   ├── task.py / task_queue.py
│   ├── channels/
│   │   ├── base.py            # 通道抽象
│   │   └── rest.py            # REST（FastAPI 子进程）
│   └── services/
│       ├── glm_service.py     # GLM-4.5V 调用
│       └── result_saver.py    # JSON → 试卷 Markdown
├── core/                      # 共享逻辑
│   ├── services/
│   │   ├── image_preprocessor.py
│   │   ├── ocr_service.py     # 旧 DeepSeek-OCR（保留）
│   │   └── file_processor.py
│   └── utils/
├── servers/
│   ├── web_app.py             # FastAPI Web UI
│   └── mcp.py                 # MCP stdio（旧模式）
└── output/                    # 生成结果
```

---

## Tests

```bash
pytest tests/ -v    # 40 passed, 1 skipped
```

---

## License

MIT
