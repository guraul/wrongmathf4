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
