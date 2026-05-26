import asyncio
import pytest
from unittest.mock import AsyncMock, patch
from agent.engine import AgentEngine


@pytest.mark.asyncio
async def test_agent_lifecycle():
    engine = AgentEngine()

    with (
        patch("agent.scheduler.process_and_split_to_base64", return_value=(["b64img"], 1)),
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
