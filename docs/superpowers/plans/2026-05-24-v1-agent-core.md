# V1 Agent Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan.

**Goal:** Build WrongMath Agent skeleton + REST channel + Web UI (V1, no WeChat)

**Architecture:** Python 3.13 + asyncio. Agent main process manages a FastAPI subprocess. Scheduler loops over `asyncio.PriorityQueue` calling existing `core/services/`. Output goes to `output/{subject}/{date}.md`.

**Tech Stack:** asyncio, FastAPI, uvicorn, openai (SiliconFlow + DeepSeek V4 Pro), pymupdf, Pillow, weasyprint

---

## File Map

```
Create: agent/__init__.py
Create: agent/engine.py           # AgentEngine: state machine IDLE/PROCESSING
Create: agent/task.py             # Task dataclass
Create: agent/task_queue.py       # PriorityQueue + persistence
Create: agent/scheduler.py        # scheduler_loop()
Create: agent/channels/__init__.py
Create: agent/channels/base.py    # ProtocolHandler ABC
Create: agent/channels/rest.py    # FastAPI subprocess manager
Create: agent/services/__init__.py
Create: agent/services/llm_service.py     # DeepSeek V4 Pro verify + subject
Create: agent/services/result_saver.py    # Save structured output
Create: config/__init__.py
Create: config/settings.py        # Pydantic settings
Create: config/config.yaml        # Default config
Create: servers/web_app.py        # FastAPI application (endpoints)
Create: main.py                   # Entry point
Create: deploy/wrongmath.service  # systemd unit
Modify: requirements.txt          # Add httpx, weasyprint, pyyaml
```

---

### Task 1: Create directories and `requirements.txt`

**Files:**
- Create: `agent/__init__.py`
- Create: `agent/channels/__init__.py`
- Create: `agent/services/__init__.py`
- Create: `config/__init__.py`
- Create: `deploy/wrongmath.service`
- Modify: `requirements.txt`

- [ ] **Step 1: Create directories**

```bash
mkdir -p agent/channels agent/services config deploy
```

- [ ] **Step 2: Write `agent/__init__.py`**

```python
```

- [ ] **Step 3: Write `agent/channels/__init__.py`**

```python
```

- [ ] **Step 4: Write `agent/services/__init__.py`**

```python
```

- [ ] **Step 5: Write `config/__init__.py`**

```python
```

- [ ] **Step 6: Update `requirements.txt`**

Append to existing `requirements.txt`:
```
# Agent channels
httpx>=0.27.0

# PDF generation (Markdown → PDF)
weasyprint>=60.0

# Config
PyYAML>=6.0

# QR code (for future WeChat login)
qrcode>=7.0

# AES decryption (for future WeChat CDN)
pycryptodome>=3.20.0
```

---

### Task 2: Task data model and queue

**Files:**
- Create: `agent/task.py`
- Create: `agent/task_queue.py`

- [ ] **Step 1: Write the test**

```python
# tests/test_task_queue.py
import pytest
import json
import tempfile
from pathlib import Path
from agent.task import Task
from agent.task_queue import TaskQueue


class TestTask:
    def test_create_task(self):
        t = Task(source="rest_api", file_path="/tmp/test.png")
        assert t.source == "rest_api"
        assert t.status == "queued"
        assert t.attempts == 0
        assert t.max_retries == 3
        assert t.priority == 3

    def test_task_to_dict_roundtrip(self):
        t = Task(source="rest_api", file_path="/tmp/test.png", subject="数学")
        d = t.to_dict()
        t2 = Task.from_dict(d)
        assert t2.id == t.id
        assert t2.subject == "数学"


class TestTaskQueue:
    @pytest.mark.asyncio
    async def test_put_get(self):
        q = TaskQueue()
        task = Task(source="rest_api", file_path="/tmp/test.png")
        await q.put(task)
        retrieved = await q.get()
        assert retrieved.id == task.id

    @pytest.mark.asyncio
    async def test_priority_order(self):
        q = TaskQueue()
        low = Task(source="rest_api", file_path="/low.png", priority=5)
        high = Task(source="rest_api", file_path="/high.png", priority=1)
        await q.put(low)
        await q.put(high)
        retrieved = await q.get()
        assert retrieved.file_path == "/high.png"

    @pytest.mark.asyncio
    async def test_persistence(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "queue.json"
            q = TaskQueue(persist_path=path)
            task = Task(source="test", file_path="/tmp/a.png")
            await q.put(task)
            await q.shutdown()

            q2 = TaskQueue(persist_path=path)
            await q2.restore()
            retrieved = await q2.get()
            assert retrieved.file_path == "/tmp/a.png"
```

- [ ] **Step 2: Write `agent/task.py`**

```python
import uuid
import time
from dataclasses import dataclass, field, asdict
from typing import Optional


@dataclass
class Task:
    source: str  # rest_api / mcp / filewatch / wechat
    file_path: str
    subject: Optional[str] = None
    id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    status: str = "queued"  # queued / processing / done / failed
    priority: int = 3  # 1=urgent, 3=normal, 5=background
    attempts: int = 0
    max_retries: int = 3
    created_at: float = field(default_factory=time.time)
    context: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return asdict(self)

    @staticmethod
    def from_dict(d: dict) -> "Task":
        return Task(**d)
```

- [ ] **Step 3: Write `agent/task_queue.py`**

```python
import asyncio
import json
from pathlib import Path
from agent.task import Task


class TaskQueue:
    def __init__(self, persist_path: Path | None = None):
        self._queue: asyncio.PriorityQueue[tuple[int, Task]] = asyncio.PriorityQueue()
        self._pending: list[Task] = []
        self.persist_path = persist_path or Path("data/queue_state.json")

    async def put(self, task: Task):
        await self._queue.put((task.priority, task))

    async def get(self) -> Task | None:
        try:
            _, task = await asyncio.wait_for(self._queue.get(), timeout=1.0)
            task.status = "processing"
            return task
        except asyncio.TimeoutError:
            return None

    def task_done(self, task: Task):
        self._queue.task_done()

    @property
    def qsize(self) -> int:
        return self._queue.qsize()

    async def shutdown(self):
        remaining = []
        while True:
            try:
                _, task = await asyncio.wait_for(self._queue.get(), timeout=0.1)
                remaining.append(task)
            except asyncio.TimeoutError:
                break
        if remaining:
            self.persist_path.parent.mkdir(parents=True, exist_ok=True)
            self.persist_path.write_text(
                json.dumps([t.to_dict() for t in remaining], ensure_ascii=False, indent=2)
            )

    async def restore(self):
        if not self.persist_path.exists():
            return
        tasks = json.loads(self.persist_path.read_text(encoding="utf-8"))
        for d in tasks:
            await self.put(Task.from_dict(d))
        self.persist_path.unlink(missing_ok=True)
```

- [ ] **Step 4: Run tests**

```
pytest tests/test_task_queue.py -v
Expected: ALL PASS
```

---

### Task 3: AgentEngine state machine

**Files:**
- Create: `agent/engine.py`

- [ ] **Step 1: Write the test**

```python
# tests/test_agent_engine.py
import pytest
from agent.engine import AgentEngine


class TestAgentEngine:
    @pytest.mark.asyncio
    async def test_initial_state(self):
        engine = AgentEngine()
        assert engine.state == "init"

    @pytest.mark.asyncio
    async def test_start_transitions_to_idle(self):
        engine = AgentEngine()
        await engine.start()
        assert engine.state == "idle"

    @pytest.mark.asyncio
    async def test_submit_task_transitions_to_processing(self):
        engine = AgentEngine()
        await engine.start()
        await engine.submit_task(source="rest_api", file_path="/tmp/test.png")
        assert engine.state == "processing"

    @pytest.mark.asyncio
    async def test_shutdown(self):
        engine = AgentEngine()
        await engine.start()
        await engine.shutdown()
        assert engine.state == "shutdown"

    @pytest.mark.asyncio
    async def test_notify_all(self):
        engine = AgentEngine()
        notifications = []

        class MockChannel:
            name = "mock"
            async def notify(self, ctx):
                notifications.append(ctx)

        engine.channels["mock"] = MockChannel()
        await engine.notify_all({"msg": "hello"})
        assert notifications == [{"msg": "hello"}]
```

- [ ] **Step 2: Write `agent/engine.py`**

```python
import asyncio
import signal
import logging
from typing import Optional
from agent.task import Task
from agent.task_queue import TaskQueue

logger = logging.getLogger("agent.engine")


class AgentEngine:
    def __init__(self, task_queue: Optional[TaskQueue] = None):
        self.state = "init"
        self.queue = task_queue or TaskQueue()
        self.scheduler: Optional[asyncio.Task] = None
        self.channels: dict[str, object] = {}

    async def start(self):
        logger.info("Agent starting...")
        await self.queue.restore()
        self.state = "idle"
        logger.info("Agent ready (state=idle)")

    async def submit_task(self, source: str, file_path: str, **kwargs) -> str:
        task = Task(source=source, file_path=file_path, **kwargs)
        await self.queue.put(task)
        logger.info(f"Task queued: {task.id} ({file_path})")
        if self.state == "idle":
            self.state = "processing"
            self.scheduler = asyncio.create_task(self._run_scheduler())
        return task.id

    async def _run_scheduler(self):
        from agent.scheduler import scheduler_loop
        try:
            await scheduler_loop(self)
        except asyncio.CancelledError:
            pass
        if self.queue.qsize == 0 and self.state != "shutdown":
            self.state = "idle"

    async def notify_all(self, ctx: dict):
        for ch in self.channels.values():
            try:
                if hasattr(ch, "notify"):
                    await ch.notify(ctx)
            except Exception as e:
                logger.warning(f"Notification failed for {ch}: {e}")

    async def shutdown(self):
        logger.info("Agent shutting down...")
        self.state = "shutdown"
        if self.scheduler and not self.scheduler.done():
            self.scheduler.cancel()
            try:
                await asyncio.wait_for(self.scheduler, timeout=5.0)
            except (asyncio.TimeoutError, asyncio.CancelledError):
                pass
        await self.queue.shutdown()
        logger.info("Agent stopped")
```

- [ ] **Step 3: Run tests**

```
pytest tests/test_agent_engine.py -v
Expected: ALL PASS
```

---

### Task 4: Scheduler

**Files:**
- Create: `agent/scheduler.py`
- Modify: `agent/engine.py:30` — import is already there

- [ ] **Step 1: Write the test**

```python
# tests/test_scheduler.py
import pytest
from unittest.mock import AsyncMock, patch
from agent.task import Task
from agent.task_queue import TaskQueue
from agent.scheduler import scheduler_loop


class MockEngine:
    def __init__(self):
        self.queue = TaskQueue()
        self.state = "processing"
        self.channels = {}
        self.notifications = []

    async def notify_all(self, ctx):
        self.notifications.append(ctx)


class TestScheduler:
    @pytest.mark.asyncio
    async def test_processes_task_and_marks_done(self):
        engine = MockEngine()
        task = Task(source="test", file_path="/tmp/test.png")
        await engine.queue.put(task)

        with (
            patch("agent.scheduler.process_file", return_value=(["b64img"], 1)),
            patch("agent.scheduler.OCRService.recognize_text", new=AsyncMock(return_value="OCR result")),
            patch("agent.scheduler.LLMService.verify", new=AsyncMock(return_value={"subject": "数学", "questions": []})),
            patch("agent.scheduler.save_result", new=AsyncMock(return_value="/output/数学/test.md")),
        ):
            await scheduler_loop(engine)

        assert task.status == "done"
        assert len(engine.notifications) == 1

    @pytest.mark.asyncio
    async def test_retry_on_failure(self):
        engine = MockEngine()
        task = Task(source="test", file_path="/tmp/test.png", max_retries=1)
        await engine.queue.put(task)

        fail = AsyncMock(side_effect=Exception("OCR failed"))
        with (
            patch("agent.scheduler.process_file", return_value=(["b64img"], 1)),
            patch("agent.scheduler.OCRService.recognize_text", new=fail),
        ):
            await scheduler_loop(engine)

        assert task.status == "failed"
        assert task.attempts == 1
```

- [ ] **Step 2: Write `agent/scheduler.py`**

```python
import asyncio
import logging
from core.services.file_processor import process_file
from core.services.ocr_service import OCRService
from agent.services.llm_service import LLMService
from agent.services.result_saver import save_result

logger = logging.getLogger("agent.scheduler")


async def scheduler_loop(engine):
    logger.info("Scheduler started")
    ocr_service = OCRService()
    llm_service = LLMService()

    while engine.state == "processing":
        task = await engine.queue.get()
        if task is None:
            break

        try:
            logger.info(f"Processing task {task.id}: {task.file_path}")

            # Step 1: File → base64 images
            loop = asyncio.get_event_loop()
            images, num_pages = await loop.run_in_executor(None, process_file, task.file_path)
            logger.info(f"Extracted {len(images)} images")

            # Step 2: OCR
            raw_text = await ocr_service.recognize_text(images)
            logger.info(f"OCR result: {len(raw_text)} chars")

            # Step 3: Verify + detect subject
            verified = await llm_service.verify(raw_text)
            logger.info(f"Detected subject: {verified['subject']}")

            # Step 4: Save result
            result_path = await save_result(task, verified, raw_text)
            task.subject = verified["subject"]
            task.status = "done"

            # Step 5: Notify
            await engine.notify_all({
                "task_id": task.id,
                "source": task.source,
                "subject": verified["subject"],
                "questions": len(verified.get("questions", [])),
                "file_path": result_path,
            })

        except Exception as e:
            task.attempts += 1
            logger.error(f"Task {task.id} failed (attempt {task.attempts}): {e}")
            if task.attempts < task.max_retries:
                await asyncio.sleep(2 ** task.attempts)
                await engine.queue.put(task)
            else:
                task.status = "failed"
                await engine.notify_all({
                    "task_id": task.id,
                    "source": task.source,
                    "error": str(e),
                })
        finally:
            engine.queue.task_done(task)

    logger.info("Scheduler stopped")
```

- [ ] **Step 3: Run tests**

```
pytest tests/test_scheduler.py -v
Expected: ALL PASS
```

---

### Task 5: LLM Service (DeepSeek V4 Pro)

**Files:**
- Create: `agent/services/llm_service.py`

- [ ] **Step 1: Write the test**

```python
# tests/test_llm_service.py
import pytest
from unittest.mock import AsyncMock, patch
from agent.services.llm_service import LLMService


class TestLLMService:
    @pytest.mark.asyncio
    async def test_verify_returns_structured_result(self):
        service = LLMService()
        mock_response = AsyncMock()
        mock_response.choices = [AsyncMock()]
        mock_response.choices[0].message.content = """
        {
            "subject": "数学",
            "questions": [{"number": 1, "content": "$x+1=2$", "answer": "$x=1$"}],
            "verified": true
        }
        """

        with patch.object(service.client.chat.completions, "create", new=AsyncMock(return_value=mock_response)):
            result = await service.verify("OCR text here")

        assert result["subject"] == "数学"
        assert result["verified"] is True
        assert len(result["questions"]) == 1
```

- [ ] **Step 2: Write `agent/services/llm_service.py`**

```python
import json
import os
import logging
from openai import AsyncOpenAI

logger = logging.getLogger("agent.llm_service")


class LLMService:
    def __init__(self):
        api_key = os.getenv("DEEPSEEK_API_KEY")
        base_url = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
        self.model = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
        self.client = AsyncOpenAI(api_key=api_key, base_url=base_url)

    async def verify(self, ocr_text: str) -> dict:
        prompt = f"""你是一个数学错题分析助手。分析以下 OCR 识别结果，返回 JSON：

{{
    "subject": "科目名称（数学/语文/英语/物理/化学）",
    "questions": [
        {{
            "number": 题目编号,
            "content": "题目内容（保留 LaTeX 公式）",
            "answer": "答案（如有）"
        }}
    ],
    "verified": true/false  # OCR 结果是否合理
}}

OCR 结果：
{ocr_text}
"""

        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=4096,
            temperature=0.1,
            response_format={"type": "json_object"},
        )

        raw = response.choices[0].message.content
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            logger.warning(f"LLM returned invalid JSON: {raw[:200]}")
            return {"subject": "未分类", "questions": [], "verified": False}
```

- [ ] **Step 3: Run tests**

```
pytest tests/test_llm_service.py -v
Expected: ALL PASS
```

---

### Task 6: Result Saver

**Files:**
- Create: `agent/services/result_saver.py`

- [ ] **Step 1: Write the test**

```python
# tests/test_result_saver.py
import os
import tempfile
from pathlib import Path
from agent.task import Task
from agent.services.result_saver import save_result


class TestResultSaver:
    @pytest.mark.asyncio
    async def test_saves_markdown_with_frontmatter(self):
        task = Task(source="test", file_path="/tmp/test.png")
        verified = {"subject": "数学", "questions": [], "verified": True}

        with tempfile.TemporaryDirectory() as tmp:
            result_path = await save_result(
                task, verified, "OCR text",
                base_dir=tmp,
            )
            assert os.path.exists(result_path)
            content = Path(result_path).read_text()
            assert "---" in content
            assert "数学" in content
            assert task.id in content

    @pytest.mark.asyncio
    async def test_appends_to_existing_file(self):
        task = Task(source="test", file_path="/tmp/test.png")
        verified = {"subject": "数学", "questions": [], "verified": True}

        with tempfile.TemporaryDirectory() as tmp:
            path1 = await save_result(task, verified, "First", base_dir=tmp)
            path2 = await save_result(task, verified, "Second", base_dir=tmp)
            assert path1 == path2
            content = Path(path1).read_text()
            assert "First" in content
            assert "Second" in content
```

- [ ] **Step 2: Write `agent/services/result_saver.py`**

```python
import os
import time
import logging
from pathlib import Path
from agent.task import Task

logger = logging.getLogger("agent.result_saver")


async def save_result(
    task: Task,
    verified: dict,
    raw_text: str,
    base_dir: str = "output",
) -> str:
    subject = verified.get("subject", "未分类")
    date = time.strftime("%Y-%m-%d")
    subject_dir = Path(base_dir) / subject
    subject_dir.mkdir(parents=True, exist_ok=True)

    file_path = subject_dir / f"{date}.md"

    frontmatter = f"""---
title: {subject} 错题 {date}
subject: {subject}
date: {date}
source: {task.source}
task_id: {task.id}
---

"""

    content = raw_text.strip()
    extra = f"\n\n---\n\n"

    existing = ""
    if file_path.exists():
        existing = file_path.read_text(encoding="utf-8")

    if not existing:
        file_path.write_text(frontmatter + content, encoding="utf-8")
    else:
        file_path.write_text(existing + content, encoding="utf-8")

    logger.info(f"Saved result: {file_path}")
    return str(file_path)
```

- [ ] **Step 3: Run tests**

```
pytest tests/test_result_saver.py -v
Expected: ALL PASS
```

---

### Task 7: ProtocolHandler base + REST channel

**Files:**
- Create: `agent/channels/base.py`
- Create: `agent/channels/rest.py`

- [ ] **Step 1: Write the test**

```python
# tests/test_rest_channel.py
import pytest
from unittest.mock import AsyncMock, patch
from agent.channels.base import ProtocolHandler
from agent.channels.rest import RestChannel


class TestProtocolHandler:
    @pytest.mark.asyncio
    async def test_base_cannot_be_instantiated(self):
        with pytest.raises(TypeError):
            ProtocolHandler()  # abstract


class TestRestChannel:
    @pytest.mark.asyncio
    async def test_start_stops_subprocess(self):
        channel = RestChannel(port=18999)
        with patch("subprocess.Popen") as mock_popen:
            proc = AsyncMock()
            proc.poll.return_value = None
            mock_popen.return_value = proc

            await channel.start(None)
            assert channel.process is not None
            assert channel.running is True

            await channel.stop()
            assert channel.running is False
```

- [ ] **Step 2: Write `agent/channels/base.py`**

```python
from abc import ABC, abstractmethod


class ProtocolHandler(ABC):
    name: str = "base"

    @abstractmethod
    async def start(self, agent):
        ...

    @abstractmethod
    async def stop(self):
        ...

    async def notify(self, ctx: dict):
        pass
```

- [ ] **Step 3: Write `agent/channels/rest.py`**

```python
import os
import signal
import logging
import subprocess
from agent.channels.base import ProtocolHandler

logger = logging.getLogger("agent.rest_channel")


class RestChannel(ProtocolHandler):
    name = "rest"

    def __init__(self, host: str = "0.0.0.0", port: int = 8080):
        self.host = host
        self.port = port
        self.process: subprocess.Popen | None = None
        self.running = False

    async def start(self, agent):
        cmd = [
            "uvicorn", "servers.web_app:app",
            "--host", self.host,
            "--port", str(self.port),
            "--log-level", "info",
        ]
        logger.info(f"Starting FastAPI subprocess: {' '.join(cmd)}")
        self.process = subprocess.Popen(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
        )
        self.running = True

    async def stop(self):
        if self.process and self.process.poll() is None:
            logger.info("Stopping FastAPI subprocess")
            self.process.send_signal(signal.SIGTERM)
            try:
                self.process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                self.process.kill()
        self.running = False

    async def notify(self, ctx: dict):
        pass  # REST channel doesn't push — Web UI polls
```

- [ ] **Step 4: Run tests**

```
pytest tests/test_rest_channel.py -v
Expected: ALL PASS
```

---

### Task 8: Config

**Files:**
- Create: `config/settings.py`
- Create: `config/config.yaml`

- [ ] **Step 1: Write the config**

```python
# config/settings.py
import os
from pathlib import Path
import yaml


class Settings:
    def __init__(self, path: str = "config/config.yaml"):
        self._dict = self._load(path)

    def _load(self, path: str) -> dict:
        p = Path(path)
        if not p.exists():
            return {}
        with open(p, encoding="utf-8") as f:
            return yaml.safe_load(f) or {}

    @property
    def agent_name(self) -> str:
        return self._dict.get("agent", {}).get("name", "WrongMath")

    @property
    def rest_host(self) -> str:
        return self._dict.get("channels", {}).get("rest", {}).get("host", "0.0.0.0")

    @property
    def rest_port(self) -> int:
        return self._dict.get("channels", {}).get("rest", {}).get("port", 8080)

    @property
    def subjects(self) -> list[str]:
        return self._dict.get("subjects", ["数学", "语文", "英语", "物理", "化学"])

    @property
    def llm_provider(self) -> str:
        return self._dict.get("llm", {}).get("provider", "deepseek")

    @property
    def llm_model(self) -> str:
        return self._dict.get("llm", {}).get("model", "deepseek-chat")

    @property
    def dict(self) -> dict:
        return self._dict
```

```yaml
# config/config.yaml
agent:
  name: WrongMath
  max_concurrent: 3
  auto_cleanup: true
  cleanup_hours: 24

channels:
  rest:
    enabled: true
    host: "0.0.0.0"
    port: 8080

  wechat:
    enabled: false

  mcp:
    enabled: false

  filewatch:
    enabled: false

subjects:
  - 数学
  - 语文
  - 英语
  - 物理
  - 化学

llm:
  provider: deepseek
  model: deepseek-chat
  base_url: https://api.deepseek.com
  max_tokens: 4096
  temperature: 0.1
```

- [ ] **Step 2: Test config loading**

```python
# tests/test_config.py
import tempfile
from pathlib import Path
from config.settings import Settings


def test_default_values():
    with tempfile.TemporaryDirectory() as tmp:
        cfg = Settings(path=str(Path(tmp) / "empty.yaml"))
        assert cfg.agent_name == "WrongMath"
        assert cfg.rest_port == 8080


def test_load_from_yaml():
    content = """
agent:
  name: TestAgent
channels:
  rest:
    port: 9999
"""
    with tempfile.TemporaryDirectory() as tmp:
        p = Path(tmp) / "config.yaml"
        p.write_text(content)
        cfg = Settings(str(p))
        assert cfg.agent_name == "TestAgent"
        assert cfg.rest_port == 9999
```

```
pytest tests/test_config.py -v
Expected: ALL PASS
```

---

### Task 9: FastAPI Web App

**Files:**
- Create: `servers/web_app.py`

- [ ] **Step 1: Write the FastAPI app**

```python
# servers/web_app.py
import os
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="WrongMath Web UI", version="1.0.0")

OUTPUT_DIR = Path("output")


@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.post("/api/task")
async def create_task(file: UploadFile = File(...)):
    """Upload image for OCR processing."""
    input_dir = Path("input")
    input_dir.mkdir(exist_ok=True)
    file_path = input_dir / file.filename
    content = await file.read()
    file_path.write_bytes(content)
    return {"file_path": str(file_path), "filename": file.filename, "size": len(content)}


@app.get("/api/output")
async def list_output():
    """List all output files grouped by subject."""
    if not OUTPUT_DIR.exists():
        return {"subjects": []}
    subjects = {}
    for d in OUTPUT_DIR.iterdir():
        if d.is_dir():
            files = sorted(f.name for f in d.iterdir() if f.suffix == ".md")
            if files:
                subjects[d.name] = files
    return {"subjects": subjects}


@app.get("/api/output/{subject}/{filename}")
async def get_output(subject: str, filename: str):
    """Get a specific output file."""
    file_path = OUTPUT_DIR / subject / filename
    if not file_path.exists():
        return {"error": "File not found"}, 404
    content = file_path.read_text(encoding="utf-8")
    return {"content": content, "filename": filename}


@app.get("/api/output/{subject}/{filename}/download")
async def download_output(subject: str, filename: str):
    """Download a specific output file."""
    file_path = OUTPUT_DIR / subject / filename
    if not file_path.exists():
        return {"error": "File not found"}, 404
    return FileResponse(str(file_path), filename=filename, media_type="text/markdown")


@app.get("/", response_class=HTMLResponse)
async def web_ui():
    """Simple Web UI for browsing results."""
    return """
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>WrongMath</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, sans-serif; max-width: 900px; margin: 0 auto; padding: 20px; background: #f8f9fa; }
        h1 { border-bottom: 2px solid #dee2e6; padding-bottom: 10px; margin-bottom: 20px; }
        .subject { background: white; border-radius: 8px; padding: 16px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .subject h2 { color: #495057; margin-bottom: 8px; }
        .file { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #eee; }
        .file:last-child { border-bottom: none; }
        .file a { color: #228be6; text-decoration: none; }
        .file a:hover { text-decoration: underline; }
        .btn { display: inline-block; padding: 4px 12px; border-radius: 4px; font-size: 13px; cursor: pointer; }
        .btn-primary { background: #228be6; color: white; border: none; }
        .btn-primary:hover { background: #1971c2; }
        .upload-zone { border: 2px dashed #dee2e6; border-radius: 8px; padding: 40px; text-align: center; margin-bottom: 20px; background: white; cursor: pointer; }
        .upload-zone:hover { border-color: #228be6; }
        .toast { position: fixed; bottom: 20px; right: 20px; background: #40c057; color: white; padding: 12px 20px; border-radius: 6px; display: none; }
    </style>
</head>
<body>
    <h1>📐 WrongMath</h1>

    <div class="upload-zone" id="dropzone" onclick="document.getElementById('fileInput').click()">
        <p style="font-size: 18px; color: #868e96;">拖拽图片到此处或点击上传</p>
        <input type="file" id="fileInput" accept="image/*, .pdf" style="display:none" multiple>
    </div>

    <div id="subjects"></div>
    <div id="toast" class="toast"></div>

    <script>
        async function refresh() {
            const res = await fetch('/api/output');
            const data = await res.json();
            const container = document.getElementById('subjects');
            container.innerHTML = '';
            for (const [subject, files] of Object.entries(data.subjects || {})) {
                const div = document.createElement('div');
                div.className = 'subject';
                div.innerHTML = '<h2>' + subject + '</h2>' +
                    files.map(f => '<div class="file"><a href="/api/output/' + subject + '/' + f + '" target="_blank">' + f + '</a> <a href="/api/output/' + subject + '/' + f + '/download" class="btn btn-primary">下载</a></div>').join('');
                container.appendChild(div);
            }
        }

        async function uploadFile(file) {
            const form = new FormData();
            form.append('file', file);
            const res = await fetch('/api/task', { method: 'POST', body: form });
            const data = await res.json();
            showToast('✅ ' + file.name + ' 已上传');
        }

        function showToast(msg) {
            const el = document.getElementById('toast');
            el.textContent = msg;
            el.style.display = 'block';
            setTimeout(() => el.style.display = 'none', 3000);
        }

        document.getElementById('fileInput').onchange = async (e) => {
            for (const file of e.target.files) await uploadFile(file);
            refresh();
        };

        document.getElementById('dropzone').ondragover = (e) => { e.preventDefault(); };
        document.getElementById('dropzone').ondrop = async (e) => {
            e.preventDefault();
            for (const file of e.dataTransfer.files) await uploadFile(file);
            refresh();
        };

        refresh();
    </script>
</body>
</html>
    """
```

---

### Task 10: main.py entry point

**Files:**
- Create: `main.py`

- [ ] **Step 1: Write `main.py`**

```python
#!/usr/bin/env python3
import asyncio
import logging
import os
import signal
from dotenv import load_dotenv
from config.settings import Settings
from agent.engine import AgentEngine

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger("main")


class WrongMathApp:
    def __init__(self):
        self.settings = Settings()
        self.agent = AgentEngine()

    async def start(self):
        await self.agent.start()
        logger.info(f"WrongMath Agent started (state={self.agent.state})")

        if self.settings.dict.get("channels", {}).get("rest", {}).get("enabled", True):
            from agent.channels.rest import RestChannel
            rest = RestChannel(
                host=self.settings.rest_host,
                port=self.settings.rest_port,
            )
            self.agent.channels["rest"] = rest
            await rest.start(self.agent)
            logger.info(f"REST channel started on {self.settings.rest_host}:{self.settings.rest_port}")

        logger.info("WrongMath ready.")

        stop_event = asyncio.Event()
        for s in (signal.SIGINT, signal.SIGTERM):
            try:
                asyncio.get_event_loop().add_signal_handler(s, stop_event.set)
            except NotImplementedError:
                pass

        await stop_event.wait()
        await self.shutdown()

    async def shutdown(self):
        logger.info("Shutting down...")
        for ch in self.agent.channels.values():
            try:
                await ch.stop()
            except Exception as e:
                logger.warning(f"Channel stop failed: {e}")
        await self.agent.shutdown()
        logger.info("Goodbye.")


async def main():
    app = WrongMathApp()
    await app.start()


if __name__ == "__main__":
    asyncio.run(main())
```

---

### Task 11: systemd service

**Files:**
- Create: `deploy/wrongmath.service`

- [ ] **Step 1: Write systemd unit**

```ini
# deploy/wrongmath.service
[Unit]
Description=WrongMath AI Agent
After=network.target

[Service]
Type=simple
User=wrongmath
WorkingDirectory=/opt/wrongmath
EnvironmentFile=/opt/wrongmath/.env
ExecStart=/usr/bin/python3 main.py
Restart=on-failure
RestartSec=10

[Install]
WantedBy=multi-user.target
```

---

### Task 12: Integration test

- [ ] **Step 1: Write integration smoke test**

```python
# tests/test_integration.py
import os
import pytest
from unittest.mock import AsyncMock, patch
from agent.engine import AgentEngine


@pytest.mark.asyncio
async def test_agent_lifecycle():
    """Full lifecycle: start → submit → process → notify → stop."""
    engine = AgentEngine()

    with (
        patch("agent.scheduler.process_file", return_value=(["b64img"], 1)),
        patch("agent.scheduler.OCRService"),
        patch("agent.scheduler.LLMService.verify",
              new=AsyncMock(return_value={"subject": "数学", "questions": [], "verified": True})),
        patch("agent.scheduler.save_result",
              new=AsyncMock(return_value="/tmp/test.md")),
    ):
        await engine.start()
        assert engine.state == "idle"

        task_id = await engine.submit_task(source="test", file_path="/tmp/test.png")
        assert task_id is not None

        await asyncio.sleep(0.1)
        await engine.shutdown()
        assert engine.state == "shutdown"
```

- [ ] **Step 2: Run all tests**

```
pytest tests/test_task_queue.py tests/test_agent_engine.py tests/test_scheduler.py tests/test_llm_service.py tests/test_result_saver.py tests/test_rest_channel.py tests/test_config.py tests/test_integration.py -v
Expected: ALL PASS (some may be skipped if API keys missing)
```

---

## Spec Coverage Check

| Spec Requirement | Task(s) | Status |
|-----------------|---------|--------|
| Agent skeleton (state machine) | Task 3 (engine.py) | ✅ |
| Task + queue | Task 2 (task.py, task_queue.py) | ✅ |
| Scheduler loop | Task 4 (scheduler.py) | ✅ |
| DeepSeek V4 Pro integration | Task 5 (llm_service.py) | ✅ |
| Subject auto-detect | Task 5 (LLMService.verify) | ✅ |
| Output to output/{subject}/{date}.md | Task 6 (result_saver.py) | ✅ |
| ProtocolHandler base | Task 7 (base.py) | ✅ |
| REST channel (FastAPI subprocess) | Task 7 (rest.py) | ✅ |
| Web UI (browse, download) | Task 9 (web_app.py) | ✅ |
| PDF merge | NOT YET (split to separate task) | ❌ |
| Config (settings + yaml) | Task 8 | ✅ |
| main.py entry point | Task 10 | ✅ |
| systemd service | Task 11 | ✅ |
| Integration tests | Task 12 | ✅ |
| WeChat channel | V2 | ✅ deferred |
| MCP channel | V3 | ✅ deferred |
| File watch | V3 | ✅ deferred |
| PDF merge + download | Pending — will add | ⚠️ |

**Gap:** PDF merge is in the spec but not in this plan. Add as Task 13.

---

### Task 13: PDF Merge

**Files:**
- Add to: `servers/web_app.py` (new endpoint)

- [ ] **Step 1: Add PDF merge endpoint**

Append to `servers/web_app.py`:

```python
@app.post("/api/merge")
async def merge_to_pdf(files: list[str] = Form(...)):
    """Merge multiple Markdown files into a single PDF."""
    from weasyprint import HTML
    import tempfile

    content = []
    for f in files:
        fp = OUTPUT_DIR / f
        if fp.exists():
            content.append(fp.read_text(encoding="utf-8"))

    if not content:
        return {"error": "No valid files"}, 400

    html_content = "<html><body>" + "".join(
        f"<div style='page-break-after: always;'><pre>{c}</pre></div>" for c in content
    ) + "</body></html>"

    tmp = tempfile.NamedTemporaryFile(suffix=".pdf", delete=False)
    HTML(string=html_content).write_pdf(tmp.name)
    return FileResponse(tmp.name, filename="merged.pdf", media_type="application/pdf")
```

Also add a merge button to the Web UI HTML in the same file.

- [ ] **Step 2: Add merge UI to Web UI**

In the Web UI HTML, before `</body>`, add merge controls:

```html
<div id="merge-bar" style="position: sticky; bottom: 0; background: white; border-top: 2px solid #dee2e6; padding: 12px; display: flex; gap: 10px; align-items: center;">
    <input type="checkbox" id="selectAll">
    <label for="selectAll">全选</label>
    <button id="mergeBtn" class="btn btn-primary" disabled>合并为 PDF</button>
</div>

<script>
    let selectedFiles = [];
    document.getElementById('selectAll').onchange = function() {
        document.querySelectorAll('.file-checkbox').forEach(cb => cb.checked = this.checked);
        updateMergeBtn();
    };

    function updateMergeBtn() {
        selectedFiles = [...document.querySelectorAll('.file-checkbox:checked')].map(cb => cb.dataset.path);
        document.getElementById('mergeBtn').disabled = selectedFiles.length === 0;
    }

    document.getElementById('mergeBtn').onclick = async () => {
        const form = new FormData();
        selectedFiles.forEach(f => form.append('files', f));
        const res = await fetch('/api/merge', { method: 'POST', body: form });
        if (res.ok) {
            const blob = await res.blob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'merged.pdf';
            a.click();
            URL.revokeObjectURL(url);
        }
    };

    // Update file templates to include checkboxes
    // This is done in the refresh() function
</script>
```

Update the `refresh()` function to include checkboxes:

```javascript
files.map(f => '<div class="file">' +
    '<input type="checkbox" class="file-checkbox" data-path="' + subject + '/' + f + '" onchange="updateMergeBtn()"> ' +
    '<a href="/api/output/' + subject + '/' + f + '" target="_blank">' + f + '</a>' +
    ' <a href="/api/output/' + subject + '/' + f + '/download" class="btn btn-primary">下载</a></div>').join('');
```

---

## Execution

**Plan saved.** Two execution options:

**1. Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** — Execute tasks in this session, batch with checkpoints

Which approach?
