import uuid
import time
from dataclasses import dataclass, field, asdict
from typing import Optional


@dataclass
class Task:
    source: str
    file_path: str
    subject: Optional[str] = None
    id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    status: str = "queued"
    priority: int = 3
    attempts: int = 0
    max_retries: int = 3
    created_at: float = field(default_factory=time.time)
    context: dict = field(default_factory=dict)

    def to_dict(self) -> dict:
        return asdict(self)

    @staticmethod
    def from_dict(d: dict) -> "Task":
        return Task(**d)
