"""
Real E2E test: full pipeline with GLM-4.5V.
Requires:
  - .env with SILICONFLOW_API_KEY
  - tests/fixtures/微信图片_20260522163257_1_9.jpg
"""
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

import pytest
from core.services.image_preprocessor import process_and_split_to_base64
from agent.services.glm_service import GLMService

FIXTURE_DIR = Path(__file__).parent / "tests" / "fixtures"
SAMPLE_IMAGE = FIXTURE_DIR / "微信图片_20260522163257_1_9.jpg"


@pytest.mark.skipif(
    not os.getenv("SILICONFLOW_API_KEY") or "your-" in os.getenv("SILICONFLOW_API_KEY", ""),
    reason="SILICONFLOW_API_KEY not set",
)
@pytest.mark.skipif(not SAMPLE_IMAGE.exists(), reason="Fixture image not found")
class TestRealE2E:

    @pytest.mark.asyncio
    async def test_full_pipeline(self):
        images, num_chunks = process_and_split_to_base64(str(SAMPLE_IMAGE))
        assert len(images) > 0
        print(f"  Preprocessed into {len(images)} chunk(s)")

        glm = GLMService()
        result = await glm.process_image(images)
        assert "subject" in result
        assert "questions" in result

        print(f"  Subject: {result['subject']}")
        print(f"  Questions: {len(result['questions'])}")

        for q in result["questions"]:
            has_diagram = q.get("has_diagram", False)
            print(f"    Q{q['number']}: diagram={has_diagram}")
            if has_diagram and q.get("diagram"):
                print(f"      labels: {q['diagram'].get('labels', [])}")
                print(f"      desc: {q['diagram']['description'][:80]}...")
