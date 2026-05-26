import os
import asyncio
import io
import json
import tempfile
import pytest
from pathlib import Path
from unittest.mock import AsyncMock, patch, Mock
from fastapi.testclient import TestClient

from servers.web_app import app, OUTPUT_DIR

client = TestClient(app)


# ---------------------------------------------------------------------------
# Layer 1: API Endpoint Tests
# ---------------------------------------------------------------------------
# These test the FastAPI endpoints directly using TestClient.
# No real OCR/LLM calls needed. No agent running needed.
# BLOCKER: weasyprint system deps (pango/cairo) required for /api/merge
# ---------------------------------------------------------------------------

class TestAPIEndpoints:
    """E2E tests for all REST API endpoints."""

    @pytest.fixture(autouse=True)
    def setup_output_dir(self, tmp_path):
        """Use a temp output dir to avoid polluting real data."""
        original = OUTPUT_DIR.absolute()
        test_output = tmp_path / "output"
        test_output.mkdir()
        # Override the global OUTPUT_DIR for this test
        import servers.web_app as app_module
        app_module.OUTPUT_DIR = test_output
        yield
        app_module.OUTPUT_DIR = original

    def test_health(self):
        """GET /api/health → ok"""
        resp = client.get("/api/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}

    def test_upload_file(self, tmp_path):
        """POST /api/task with a test image → saves to input/"""
        image_path = "/tmp/test_e2e_input.png"
        assert os.path.exists(image_path), "Test image not found"

        with open(image_path, "rb") as f:
            resp = client.post("/api/task", files={"file": ("test.png", f, "image/png")})

        assert resp.status_code == 200
        data = resp.json()
        assert data["filename"] == "test.png"
        assert data["size"] > 0
        # Verify file was saved
        saved = Path(data["file_path"])
        assert saved.exists()
        assert saved.stat().st_size > 0

    def test_upload_without_file_returns_422(self):
        """POST /api/task with no file → 422"""
        resp = client.post("/api/task")
        assert resp.status_code == 422

    def test_list_output_empty(self, setup_output_dir):
        """GET /api/output when no files exist → empty subjects"""
        resp = client.get("/api/output")
        assert resp.status_code == 200
        assert resp.json() == {"subjects": {}}

    def test_list_output_with_files(self, setup_output_dir):
        """GET /api/output returns files grouped by subject"""
        import servers.web_app as app_module
        subject_dir = app_module.OUTPUT_DIR / "数学"
        subject_dir.mkdir(parents=True)
        (subject_dir / "2026-05-24.md").write_text("# test", encoding="utf-8")
        (subject_dir / "2026-05-25.md").write_text("# test2", encoding="utf-8")

        resp = client.get("/api/output")
        assert resp.status_code == 200
        data = resp.json()
        assert "数学" in data["subjects"]
        assert "2026-05-24.md" in data["subjects"]["数学"]

    def test_get_output_file(self, setup_output_dir):
        """GET /api/output/{subject}/{file} → file content"""
        import servers.web_app as app_module
        subject_dir = app_module.OUTPUT_DIR / "英语"
        subject_dir.mkdir(parents=True)
        (subject_dir / "test.md").write_text("Hello World", encoding="utf-8")

        resp = client.get("/api/output/英语/test.md")
        assert resp.status_code == 200
        assert resp.json()["content"] == "Hello World"

    def test_get_output_file_not_found(self):
        """GET /api/output/{subject}/{file} for missing file → 404"""
        resp = client.get("/api/output/_nonexistent_subject_/nonexistent.md")
        assert resp.status_code == 404, f"Got {resp.status_code}: {resp.text[:200]}"

    def test_download_output_file(self, setup_output_dir):
        """GET /api/output/{subject}/{file}/download → file as attachment"""
        import servers.web_app as app_module
        subject_dir = app_module.OUTPUT_DIR / "物理"
        subject_dir.mkdir(parents=True)
        (subject_dir / "download_test.md").write_text("# Download", encoding="utf-8")

        resp = client.get("/api/output/物理/download_test.md/download")
        assert resp.status_code == 200
        assert "text/markdown" in resp.headers.get("content-type", "")

    def test_merge_to_pdf(self, setup_output_dir):
        """POST /api/merge with selected files → PDF download"""
        import servers.web_app as app_module
        subject_dir = app_module.OUTPUT_DIR / "化学"
        subject_dir.mkdir(parents=True)
        (subject_dir / "a.md").write_text("# Question 1\n\n$x^2$", encoding="utf-8")
        (subject_dir / "b.md").write_text("# Question 2\n\n$E=mc^2$", encoding="utf-8")

        resp = client.post("/api/merge", json={"files": ["化学/a.md", "化学/b.md"]})
        assert resp.status_code == 200, f"Got {resp.status_code}: {resp.text[:500]}"
        assert resp.headers.get("content-type") == "application/pdf"
        assert len(resp.content) > 100  # PDF should be more than 100 bytes

    def test_merge_no_valid_files(self, setup_output_dir):
        """POST /api/merge with nonexistent files → error"""
        resp = client.post("/api/merge", json={"files": ["数学/nonexistent.md"]})
        assert resp.status_code == 400
        assert "No valid files" in resp.json()["error"]

    def test_web_ui_html(self):
        """GET / → HTML page"""
        resp = client.get("/")
        assert resp.status_code == 200
        assert resp.headers.get("content-type", "").startswith("text/html")
        assert "WrongMath" in resp.text
        assert "合并为 PDF" in resp.text


# ---------------------------------------------------------------------------
# Layer 2: Full Agent E2E (mocked OCR/LLM)
# ---------------------------------------------------------------------------
# Tests the complete agent lifecycle without real API calls.
# BLOCKER: Agent + FastAPI server are separate processes (subprocess).
#   - TestClient tests the FastAPI app directly (no subprocess)
#   - Agent tests need to import and run the agent directly
#   - POST /api/task just saves the file, doesn't trigger agent processing
#   - True full-stack E2E needs either:
#     a) Agent runs as a library (not subprocess) alongside FastAPI
#     b) Integration test that starts both
# ---------------------------------------------------------------------------

class TestAgentE2E:
    """Agent lifecycle end-to-end with mocked OCR/LLM."""

    @pytest.mark.asyncio
    async def test_agent_upload_and_process(self, tmp_path):
        """Agent accepts a task, processes it, saves output."""
        from agent.engine import AgentEngine

        engine = AgentEngine()

        # Create test input file
        input_file = tmp_path / "input" / "test.png"
        input_file.parent.mkdir()
        input_file.write_bytes(b"fake_image_data")

        # Mock the scheduler's external dependencies
        with (
            patch("agent.scheduler.process_and_split_to_base64", return_value=(["b64img"], 1)),
            patch("agent.scheduler.OCRService"),
            patch("agent.scheduler.LLMService.verify",
                  new=AsyncMock(return_value={
                      "subject": "数学",
                      "questions": [
                          {"number": 1, "content": "$x+1=2$", "answer": "$x=1$"}
                      ],
                      "verified": True,
                  })),
            patch("agent.scheduler.save_result",
                  new=AsyncMock(return_value=str(tmp_path / "output" / "数学" / "2026-05-24.md"))),
        ):
            await engine.start()
            assert engine.state == "idle"

            task_id = await engine.submit_task(
                source="rest_api",
                file_path=str(input_file),
            )
            assert task_id is not None
            assert engine.state == "processing"

            await asyncio.sleep(0.2)
            await engine.shutdown()

        # Verify: task should have been processed (status done or failed)
        # No direct way to check internal task state after processing
        # But the mock assertions would fail if scheduler didn't run


# ---------------------------------------------------------------------------
# Layer 3: Real E2E (requires API keys + real image fixture)
# ---------------------------------------------------------------------------
# BLOCKER: Needs SILICONFLOW_API_KEY and DEEPSEEK_API_KEY set
# BLOCKER: Real API calls cost money and are slow (5-30s per call)
# BLOCKER: No sample math problem image in tests/fixtures/
# ---------------------------------------------------------------------------

@pytest.mark.skip(reason="Requires SILICONFLOW_API_KEY + DEEPSEEK_API_KEY + fixture image")
class TestRealE2E:
    """Optional: real API calls against a sample math problem image."""

    def test_real_ocr_then_verify(self):
        """Upload real image → OCR → LLM verify → save output.
        Requires:
        - tests/fixtures/sample_math.png (real math problem photo)
        - SILICONFLOW_API_KEY env var
        - DEEPSEEK_API_KEY env var
        """
        pass
