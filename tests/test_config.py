import tempfile
from pathlib import Path
from config.settings import Settings


def test_default_values():
    s = Settings(path="/nonexistent/config.yaml")
    assert s.agent_name == "WrongMath"
    assert s.rest_port == 8080


def test_load_from_yaml():
    content = """
agent:
  name: TestAgent
channels:
  rest:
    port: 9999
"""
    with tempfile.TemporaryDirectory() as tmp:
        p = Path(tmp) / "config.yaml"
        p.write_text(content)
        s = Settings(str(p))
        assert s.agent_name == "TestAgent"
        assert s.rest_port == 9999
