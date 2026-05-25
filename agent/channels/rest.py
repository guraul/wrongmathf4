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
        pass
