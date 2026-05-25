import asyncio
import json
from pathlib import Path
from agent.task import Task


class TaskQueue:
    def __init__(self, persist_path: Path | None = None):
        self._queue: asyncio.PriorityQueue[tuple[int, Task]] = asyncio.PriorityQueue()
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
