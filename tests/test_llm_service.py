import pytest
from unittest.mock import AsyncMock, patch
from agent.services.llm_service import LLMService


class TestLLMService:
    @pytest.mark.asyncio
    async def test_verify_returns_structured_result(self):
        service = LLMService()
        mock_response = AsyncMock()
        mock_response.choices = [AsyncMock()]
        mock_response.choices[0].message.content = """
        {
            "subject": "数学",
            "questions": [{"number": 1, "content": "$x+1=2$", "answer": "$x=1$"}],
            "verified": true
        }
        """

        with patch.object(service.client.chat.completions, "create", new=AsyncMock(return_value=mock_response)):
            result = await service.verify("OCR text here")

        assert result["subject"] == "数学"
        assert result["verified"] is True
        assert len(result["questions"]) == 1
