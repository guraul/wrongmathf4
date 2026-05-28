import tempfile
import os
from pathlib import Path
from agent.services.result_saver import save_result


class TestSaveResult:
    def test_saves_markdown_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            old_cwd = os.getcwd()
            os.chdir(tmp)
            try:
                result = {
                    "subject": "数学",
                    "questions": [
                        {"number": 1, "content": "1+1=?", "has_diagram": False},
                    ]
                }
                path = save_result(result)
                assert Path(path).exists()
                assert path.endswith(".md")
            finally:
                os.chdir(old_cwd)

    def test_worksheet_format_no_bold(self):
        with tempfile.TemporaryDirectory() as tmp:
            old_cwd = os.getcwd()
            os.chdir(tmp)
            try:
                result = {
                    "subject": "数学",
                    "questions": [
                        {"number": 1, "content": "54÷27=?", "has_diagram": False},
                    ]
                }
                path = save_result(result)
                md = Path(path).read_text()
                # No markdown headings (no ###)
                assert "###" not in md
                # Plain numbering
                assert "1. " in md
                # Has <br> for blank lines
                assert "<br>" in md
                # YAML frontmatter
                assert "---" in md
                assert "subject: 数学" in md
            finally:
                os.chdir(old_cwd)

    def test_diagram_questions_get_placeholder(self):
        with tempfile.TemporaryDirectory() as tmp:
            old_cwd = os.getcwd()
            os.chdir(tmp)
            try:
                result = {
                    "subject": "数学",
                    "questions": [
                        {"number": 1, "content": "如图求面积", "has_diagram": True},
                    ]
                }
                path = save_result(result)
                md = Path(path).read_text()
                assert "> *（配图）*" in md
            finally:
                os.chdir(old_cwd)

    def test_multiple_questions(self):
        with tempfile.TemporaryDirectory() as tmp:
            old_cwd = os.getcwd()
            os.chdir(tmp)
            try:
                result = {
                    "subject": "数学",
                    "questions": [
                        {"number": 1, "content": "Q1", "has_diagram": False},
                        {"number": 2, "content": "Q2", "has_diagram": True},
                        {"number": 3, "content": "Q3", "has_diagram": False},
                    ]
                }
                path = save_result(result)
                md = Path(path).read_text()
                assert md.count("1. ") == 1
                assert md.count("2. ") == 1
                assert md.count("3. ") == 1
                # Only one diagram placeholder
                assert md.count("> *（配图）*") == 1
                # 4 br tags per question
                assert md.count("<br>") == 12
            finally:
                os.chdir(old_cwd)

    def test_unknown_subject_default(self):
        with tempfile.TemporaryDirectory() as tmp:
            old_cwd = os.getcwd()
            os.chdir(tmp)
            try:
                result = {
                    "questions": [
                        {"number": 1, "content": "Q", "has_diagram": False},
                    ]
                }
                path = save_result(result)
                # saved under 未分类
                assert "未分类" in path
            finally:
                os.chdir(old_cwd)
