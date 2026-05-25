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
        verified = {"subject": "数学", "questions": [], "verified": True}

        with tempfile.TemporaryDirectory() as tmp:
            result_path = await save_result(
                task, verified, "OCR text",
                base_dir=tmp,
            )
            assert os.path.exists(result_path)
            content = Path(result_path).read_text()
            assert "---" in content
            assert "数学" in content
            assert task.id in content

    @pytest.mark.asyncio
    async def test_appends_to_existing_file(self):
        task = Task(source="test", file_path="/tmp/test.png")
        verified = {"subject": "数学", "questions": [], "verified": True}

        with tempfile.TemporaryDirectory() as tmp:
            path1 = await save_result(task, verified, "First", base_dir=tmp)
            path2 = await save_result(task, verified, "Second", base_dir=tmp)
            assert path1 == path2
            content = Path(path1).read_text()
            assert "First" in content
            assert "Second" in content
