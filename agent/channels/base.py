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
