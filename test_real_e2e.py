"""
Real E2E test: runs actual OCR + LLM API calls.
Requires:
  - .env with SILICONFLOW_API_KEY and DEEPSEEK_API_KEY
  - tests/fixtures/微信图片_20260522163257_1_9.jpg (sample math problem)
"""
import os
import tempfile
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

import pytest
from core.services.image_preprocessor import process_and_split_to_base64
from core.services.ocr_service import OCRService
from agent.services.llm_service import LLMService
from agent.services.result_saver import save_result
from agent.task import Task

FIXTURE_DIR = Path(__file__).parent / "tests" / "fixtures"
SAMPLE_IMAGE = FIXTURE_DIR / "微信图片_20260522163257_1_9.jpg"


@pytest.mark.skipif(
    not os.getenv("SILICONFLOW_API_KEY") or "your-" in os.getenv("SILICONFLOW_API_KEY", ""),
    reason="SILICONFLOW_API_KEY not set",
)
@pytest.mark.skipif(
    not os.getenv("DEEPSEEK_API_KEY") or "your-" in os.getenv("DEEPSEEK_API_KEY", ""),
    reason="DEEPSEEK_API_KEY not set",
)
@pytest.mark.skipif(not SAMPLE_IMAGE.exists(), reason=f"Fixture image not found: {SAMPLE_IMAGE}")
class TestRealE2E:

    @pytest.mark.asyncio
    async def test_full_pipeline(self):
        """Full pipeline: image → OCR → LLM verify → save output."""

        # Step 1: Preprocess (enhance + split tall image) → base64
        images, num_chunks = process_and_split_to_base64(str(SAMPLE_IMAGE))
        assert len(images) > 0, "No images after preprocessing"
        print(f"  Preprocessed into {len(images)} chunk(s)")

        # Step 2: OCR
        ocr = OCRService()
        raw_text = await ocr.recognize_text(images)
        assert raw_text and raw_text.strip(), "OCR returned empty"
        print(f"  OCR result: {len(raw_text)} chars")
        print(f"  Preview: {raw_text[:300]}...")

        # Step 3: LLM verify + subject detect
        llm = LLMService()
        verified = await llm.verify(raw_text)
        assert "subject" in verified, f"LLM response missing subject: {verified}"
        print(f"  Subject: {verified.get('subject')}")
        print(f"  Questions: {len(verified.get('questions', []))}")
        print(f"  Verified: {verified.get('verified')}")

        # Step 4: Save to temp output
        task = Task(source="real_e2e_test", file_path=str(SAMPLE_IMAGE))
        with tempfile.TemporaryDirectory() as tmp:
            result_path = await save_result(task, verified, raw_text, base_dir=tmp)
            saved = Path(result_path)
            assert saved.exists(), f"Output not saved: {result_path}"
            content = saved.read_text(encoding="utf-8")
            assert "---" in content, "Missing frontmatter"
            print(f"  Saved: {result_path}")
            print(f"  Content: {content[:200]}...")
