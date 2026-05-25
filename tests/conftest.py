import os
import pytest


@pytest.fixture(autouse=True)
def set_test_env():
    old = {}
    for k in ("SILICONFLOW_API_KEY", "DEEPSEEK_API_KEY"):
        old[k] = os.environ.get(k)
        os.environ[k] = "test-key"
    yield
    for k, v in old.items():
        if v is None:
            del os.environ[k]
        else:
            os.environ[k] = v
