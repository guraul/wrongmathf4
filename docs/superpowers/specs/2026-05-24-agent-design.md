# WrongMath AI Agent Design Spec

> Date: 2026-05-24
> Status: Approved (Final)

## Overview

WrongMath AI Agent is an autonomous Python + asyncio agent that receives wrong-problem images via WeChat (iLink Bot API), OCRs them with SiliconFlow DeepSeek-OCR, verifies with DeepSeek V4 Pro, and outputs Obsidian-compatible Markdown by subject. Results are browsable via a Web UI (FastAPI subprocess) with the ability to select, merge to PDF, and send back to WeChat.

## Core Flow

```
WeChat image → iLink Bot → Agent download + AES decrypt
                               ↓
                    OCR (SiliconFlow DeepSeek-OCR)
                               ↓
                    DeepSeek V4 Pro verify + detect subject
                               ↓
                    Save to output/{subject}/{date}.md
                               ↓
                    WeChat text reply: "✅ processed"

User opens Web UI → browse output/ → select results
    → merge to PDF → click "Send to WeChat" → CDN upload + encrypt → file to WeChat
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                  Agent main process (main.py)            │
│                                                         │
│  ┌────────────┐   ┌────────────┐   ┌─────────────────┐ │
│  │ AgentEngine │   │ TaskQueue   │   │ Channels         │ │
│  │ IDLE/PROC   │──▶│ Priority   │   │  ├─ wechat.py   │ │
│  │ (state      │   │ Queue      │   │  ├─ rest.py     │ │
│  │  machine)   │   │            │   │  ├─ mcp.py      │ │
│  └─────┬──────┘   └──────┬─────┘   │  └─ filewatch.py│ │
│        │                 │         └─────────────────┘ │
│        ▼                 ▼                              │
│  ┌────────────────────────────────────┐                 │
│  │ Scheduler                          │                 │
│  │ get task → OCR → verify → save     │                 │
│  │        → notify channel            │                 │
│  └────────────────────────────────────┘                 │
│                                                         │
│  ├─ subprocess: FastAPI (REST + Web UI)                 │
│  └─ output/{subject}/{date}.md                          │
└─────────────────────────────────────────────────────────┘
```

### Design Principles

- **Agent-first**: Agent main process manages everything, not a web app with agent module
- **File-based**: No database, everything on filesystem
- **Async**: Pure asyncio for I/O-bound operations
- **Text-only WeChat**: Files stay on server, WeChat only gets text notifications

## Component Details

### 1. AgentEngine (agent/engine.py)

State machine with two main states:

```
IDLE ←→ PROCESSING (ERROR as PROCESSING substate)
```

- **INIT**: Load config, init modules, start channels
- **IDLE**: Waiting for tasks, periodic cleanup
- **PROCESSING**: Tasks in queue being processed
- **PROCESSING.ERROR**: Task failed, retry logic active

Lifecycle:
1. `python main.py` → INIT → start channels → IDLE
2. Task arrives → IDLE → PROCESSING
3. Queue empty → PROCESSING → IDLE
4. Ctrl+C → graceful shutdown (wait 30s for current tasks, save queue to disk)

### 2. Task & TaskQueue (agent/task.py, agent/task_queue.py)

```python
@dataclass
class Task:
    id: str                   # uuid
    source: str               # wechat / rest_api / mcp / filewatch
    file_path: str            # path to input image
    subject: str | None       # detected by LLM, None before processing
    status: str               # queued / processing / done / failed
    priority: int             # 1=urgent, 3=normal, 5=background
    attempts: int = 0
    max_retries: int = 3
    created_at: float
    context: dict | None      # channel-specific data (e.g., from_user_id)
```

- `asyncio.PriorityQueue` for scheduling
- Persisted to `data/queue_state.json` on shutdown, restored on startup

### 3. Scheduler (agent/scheduler.py)

```python
async def scheduler_loop(agent):
    while agent.state == "processing":
        task = await agent.queue.get()

        # Step 1: OCR
        images, _ = process_file(task.file_path)
        ocr_text = await ocr_service.recognize_text(images)

        # Step 2: Verify + detect subject (DeepSeek V4 Pro)
        verified = await llm_service.verify(ocr_text)

        # Step 3: Save to output/{subject}/{date}.md
        result_path = await save_result(task, verified)

        # Step 4: Notify channel
        await agent.notify(task.source, {
            "task_id": task.id,
            "subject": verified.subject,
            "file_path": result_path,
        })
```

- Directly imports from `core/services/` — no changes needed to existing code
- OCR service: already async (AsyncOpenAI client)
- File processor: sync (pymupdf + PIL), runs in thread pool

### 4. Protocol Handlers (agent/channels/)

#### Base (agent/channels/base.py)

```python
class ProtocolHandler(ABC):
    name: str
    async def start(self, agent): ...
    async def stop(self): ...
    async def notify(self, ctx: dict): ...
```

#### WeChat (agent/channels/wechat.py) — iLink Bot API

**Login:**
1. On first start: `POST /ilink/bot/get_bot_qrcode` → get QR code
2. Display QR on Web UI at `/api/login/qrcode`
3. Poll `POST /ilink/bot/get_qrcode_status` until `status == "confirmed"`
4. Save `bot_token`, `user_id`, `baseurl` to `~/.wrongmath/wechat_session.json`
5. On restart: load saved token, try polling; if `errcode == -14`, re-login

**Poll Loop:**
- Long-poll `POST /ilink/bot/getupdates` (~35s timeout)
- `get_updates_buf` cursor passed between polls
- `X-WECHAT-UIN` header randomized per request

**Image Handling:**
1. Extract `image_item.media.encrypt_query_param` + `aes_key`
2. GET CDN URL with `encrypt_query_param`
3. AES-128-ECB decrypt with `aes_key` (PKCS7 unpadding)
4. Save to `input/{timestamp}.png`
5. Create Task → enqueue

**Text Commands:**
- "进度" → return queue status (x tasks remaining)
- "状态" → return agent state
- Other → ignore or brief help

**Notify (called by Scheduler when task done):**
- Send text: `"✅ 已处理: {subject} {n} 题"`
- Not dependent on original context_token — sends new message to `from_user_id`

#### REST (agent/channels/rest.py)

- Manages FastAPI subprocess (`subprocess.Popen(["uvicorn", ...])`)
- Agent ↔ FastAPI communication via HTTP on localhost
- Endpoints:
  - `POST /api/task` — create task (alternative to WeChat)
  - `GET /api/tasks` — list all tasks
  - `GET /api/output` — browse output/ files
  - `GET /api/output/{path}` — view/download file
  - `POST /api/merge` — select results → merge to PDF
  - `POST /api/send-to-wechat` — upload PDF to iLink Bot CDN + send
  - `GET /api/login/qrcode` — display iLink Bot QR code

#### MCP (agent/channels/mcp.py)

- Wraps existing `servers/mcp.py` logic
- MCP tools (`read_math_file`, `recognize_image`) pass through to Agent queue

#### File Watch (agent/channels/filewatch.py)

- `watchdog` monitors `input/` directory
- New files automatically create tasks
- Subfolder name can indicate subject: `input/数学/xxx.png`

## Data Flow

### Image → Markdown

```
WeChat image
  → iLink Bot CDN download
  → AES-128-ECB decrypt
  → save to input/{timestamp}.png
  → Task queued
  → Scheduler picks up
  → core.services.file_processor.process_file() → base64 images
  → core.services.ocr_service.recognize_text() → raw text
  → DeepSeek V4 Pro verify + structure → {subject, questions[]}
  → save to output/{subject}/{date}.md (append if exists)
  → notify WeChat: "✅ 已处理: 数学 3 题"
```

### Markdown → PDF → WeChat

```
User selects results in Web UI
  → click "Merge & Send to WeChat"
  → server reads selected .md files
  → generates PDF (via weasyprint / pandoc)
  → POST /ilink/bot/getuploadurl → get CDN upload URL + AES key
  → AES-128-ECB encrypt PDF
  → PUT encrypted data to CDN upload URL
  → POST /ilink/bot/sendmessage with CDN URL
  → PDF appears in user's WeChat
```

## Configuration

### config.yaml

```yaml
agent:
  name: WrongMath
  max_concurrent: 3
  auto_cleanup: true
  cleanup_hours: 24

channels:
  wechat:
    enabled: true
    poll_timeout: 35
    max_message_length: 2000

  rest:
    enabled: true
    host: "0.0.0.0"
    port: 8080

  mcp:
    enabled: true

  filewatch:
    enabled: true
    input_dir: "./input"
    poll_interval: 5

subjects:
  - 数学
  - 语文
  - 英语
  - 物理
  - 化学

llm:
  provider: deepseek
  model: deepseek-chat  # DeepSeek V4 Pro
  base_url: https://api.deepseek.com
  max_tokens: 4096
  temperature: 0.1
```

### .env

```
SILICONFLOW_API_KEY=sk-xxx
DEEPSEEK_API_KEY=sk-xxx
```

## Dependencies (new)

- `httpx` — async HTTP for iLink Bot API
- `pycryptodome` — AES-128-ECB decryption for CDN images
- `qrcode` — QR code generation for login
- `weasyprint` — Markdown → PDF (Python-native, no external binary)

Existing dependencies kept:
- `openai` — SiliconFlow OCR + DeepSeek V4 Pro
- `pymupdf` — PDF processing
- `Pillow` — image processing
- `fastapi` + `uvicorn` — REST channel
- `watchdog` — file monitoring
- `PyYAML` — config

## File Structure

```
wrongmathf4/
├── agent/                           # Agent core (NEW)
│   ├── __init__.py
│   ├── engine.py                    # AgentEngine: state machine + lifecycle
│   ├── task.py                      # Task dataclass
│   ├── task_queue.py                # PriorityQueue + persistence
│   ├── scheduler.py                 # Processing loop
│   │
│   ├── channels/                    # Input/output channels
│   │   ├── __init__.py
│   │   ├── base.py                  # ProtocolHandler ABC
│   │   ├── wechat.py                # iLink Bot API (personal WeChat)
│   │   ├── rest.py                  # FastAPI subprocess manager
│   │   ├── mcp.py                   # MCP protocol wrapper
│   │   └── filewatch.py             # File system monitor
│   │
│   └── services/                    # Agent-level services (NEW)
│       ├── __init__.py
│       ├── llm_service.py           # DeepSeek V4 Pro verify + subject detect
│       └── result_saver.py          # Save structured results to output/
│
├── core/                            # Existing, kept as-is
│   ├── services/
│   │   ├── ocr_service.py
│   │   ├── file_processor.py
│   │   └── ...
│   └── utils/
│
├── config/
│   ├── settings.py                  # Pydantic config model
│   └── config.yaml                  # Default config
│
├── servers/                         # Existing MCP server, kept as-is
│   └── mcp.py
│
├── input/                           # Image input directory
├── output/                          # Final Markdown output
│   ├── 数学/
│   ├── 语文/
│   └── ...
├── temp/                            # Temporary files
├── data/                            # Agent state files
│   └── queue_state.json             # Task queue persistence
│
├── main.py                          # Entry point
├── solution.md
├── AGENTS.md
└── requirements.txt
```

## Deployment

- **Environment**: Cloud Linux VPS, 7x24
- **Method**: systemd service (`systemctl enable/start/restart wrongmath`)
- **Auto-start**: on boot, auto-restart on failure
- **Logging**: journald (`journalctl -u wrongmath -f`)
- **State**: `~/.wrongmath/` — session token, queue state
- **CI/CD**: Manual git pull + systemctl restart (V1); auto-deploy later

### systemd unit template

```ini
[Unit]
Description=WrongMath AI Agent
After=network.target

[Service]
Type=simple
User=wrongmath
WorkingDirectory=/opt/wrongmath
ExecStart=/usr/bin/python3 main.py
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

## Key Decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Language | Python 3.13 + asyncio | Reuse core/services/ (async), lighter than Java |
| 2 | Architecture | Agent-first | Agent manages subprocesses and channels, not a web app |
| 3 | V1 channel priority | REST first | curl-testable, WeChat added in V2 |
| 4 | WeChat API | iLink Bot (personal WeChat) | QR login, no 企业微信 required |
| 5 | Verification LLM | DeepSeek V4 Pro | OpenAI-compatible API, no separate setup |
| 6 | Subject detection | LLM auto-detect | User doesn't need to specify subject |
| 7 | Result reply | Text notification only | Files stay on server, browsable via Web UI |
| 8 | context_token expiry | Send new message | No dependency on original token |
| 9 | Output format | Per-day per-subject | `output/数学/2026-05-24.md` |
| 10 | Task persistence | JSON file | Queue saved on shutdown, restored on startup |
| 11 | Deployment | systemd | Lightest, no Docker overhead |
| 12 | QR login display | Web UI page | Agent starts FastAPI before login |

## Error Handling

| Scenario | Behavior |
|----------|----------|
| OCR fails (API error) | Retry up to 3x with exponential backoff, then mark task failed |
| OCR returns empty | Retry with different prompt, then fail |
| DeepSeek V4 Pro fails | Retry 2x, then fall back to raw OCR text |
| WeChat token expires (-14) | Re-login via QR, notify user if auto-reconnect fails |
| CDN download fails | Retry 3x, then mark task failed |
| Image decrypt fails | File corrupt → delete and notify |
| FastAPI subprocess dies | Auto-restart (up to 3x), then log and stop channel |
| Disk full | Stop accepting tasks, notify user |
| Shutdown during processing | Save queue to disk, resume on restart |

## Implementation Order

### V1: Agent Core + REST + Web UI (Phase 1)

**Scope** (`curl`-testable without WeChat):

- Agent skeleton: `engine.py`, `task.py`, `task_queue.py`, `scheduler.py`
- REST channel: FastAPI subprocess manager + upload endpoint
- Web UI: browse `output/`, view/download Markdown, select + merge to PDF (no WeChat send)
- Agent services: `llm_service.py` (DeepSeek V4 Pro), `result_saver.py`
- Config: `settings.py`, `config.yaml`
- Deployment: systemd service unit

**Deliverable**: `curl -X POST /api/task -F file=@math.png` → OCR → verify → save to `output/数学/2026-05-24.md` → browse/download via Web UI

### V2: WeChat Channel (Phase 2)

- `agent/channels/wechat.py` — iLink Bot API
- QR login via Web UI
- Image download + AES decrypt
- Text reply (notifications only)
- Token persistence + re-login
- Send PDF to WeChat from Web UI

### V3: Polish (Phase 3)

- MCP channel wrapper
- File watch channel
- Error handling hardening
- Documentation
