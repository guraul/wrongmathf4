import os
import pytest
import tempfile
from pathlib import Path
from agent.task import Task
from agent.services.result_saver import save_result


class TestResultSaver:
    @pytest.mark.asyncio
    async def test_saves_markdown_with_frontmatter(self):
        task = Task(source="test", file_path="/tmp/test.png")
        result = {
            "subject": "数学",
            "questions": [
                {"number": 1, "content": "测试题", "has_diagram": False, "diagram": None}
            ]
        }

        with tempfile.TemporaryDirectory() as tmp:
            result_path = await save_result(task, result, base_dir=tmp)
            assert os.path.exists(result_path)
            content = Path(result_path).read_text()
            assert "---" in content
            assert "数学" in content
            assert task.id in content

    @pytest.mark.asyncio
    async def test_appends_to_existing_file(self):
        task = Task(source="test", file_path="/tmp/test.png")
        result1 = {"subject": "数学", "questions": [{"number": 1, "content": "First", "has_diagram": False, "diagram": None}]}
        result2 = {"subject": "数学", "questions": [{"number": 2, "content": "Second", "has_diagram": False, "diagram": None}]}

        with tempfile.TemporaryDirectory() as tmp:
            path1 = await save_result(task, result1, base_dir=tmp)
            path2 = await save_result(task, result2, base_dir=tmp)
            assert path1 == path2
            content = Path(path1).read_text()
            assert "First" in content
            assert "Second" in content
