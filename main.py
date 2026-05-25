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
