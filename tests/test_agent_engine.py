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
