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
    def dict(self) -> dict:
        return self._dict
