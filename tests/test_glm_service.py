import pytest
from unittest.mock import AsyncMock, patch
from agent.services.glm_service import GLMService


class TestGLMService:
    @pytest.mark.asyncio
    async def test_process_image_returns_questions(self):
        service = GLMService()
        mock_response = AsyncMock()
        mock_response.choices = [AsyncMock()]
        mock_response.choices[0].message.content = """
        {
            "subject": "数学",
            "questions": [
                {"number": 1, "content": "$x+1=2$", "has_diagram": false}
            ]
        }
        """

        with patch.object(service.client.chat.completions, "create", new=AsyncMock(return_value=mock_response)):
            result = await service.process_image(["b64img"])

        assert result["subject"] == "数学"
        assert len(result["questions"]) == 1

    @pytest.mark.asyncio
    async def test_detects_diagram_questions(self):
        service = GLMService()
        mock_response = AsyncMock()
        mock_response.choices = [AsyncMock()]
        mock_response.choices[0].message.content = """
        {
            "subject": "数学",
            "questions": [
                {"number": 1, "content": "普通题", "has_diagram": false},
                {"number": 2, "content": "如图求面积", "has_diagram": true}
            ]
        }
        """

        with patch.object(service.client.chat.completions, "create", new=AsyncMock(return_value=mock_response)):
            result = await service.process_image(["b64img"])

        assert result["questions"][1]["has_diagram"] is True

    @pytest.mark.asyncio
    async def test_handles_invalid_json_gracefully(self):
        service = GLMService()
        mock_response = AsyncMock()
        mock_response.choices = [AsyncMock()]
        mock_response.choices[0].message.content = "Some raw text"

        with patch.object(service.client.chat.completions, "create", new=AsyncMock(return_value=mock_response)):
            result = await service.process_image(["b64img"])

        assert result["subject"] == "未分类"
