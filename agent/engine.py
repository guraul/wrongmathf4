import asyncio
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
