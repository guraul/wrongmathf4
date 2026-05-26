import pytest
from unittest.mock import AsyncMock, patch
from agent.services.glm_service import GLMService


class TestGLMService:
    @pytest.mark.asyncio
    async def test_process_image_returns_structured_result(self):
        service = GLMService()
        mock_response = AsyncMock()
        mock_response.choices = [AsyncMock()]
        mock_response.choices[0].message.content = """
        {
            "subject": "数学",
            "questions": [
                {
                    "number": 1,
                    "content": "$x+1=2$，求$x$",
                    "has_diagram": false,
                    "diagram": null
                }
            ]
        }
        """

        with patch.object(service.client.chat.completions, "create", new=AsyncMock(return_value=mock_response)):
            result = await service.process_image(["b64img"])

        assert result["subject"] == "数学"
        assert len(result["questions"]) == 1
        assert result["questions"][0]["has_diagram"] is False

    @pytest.mark.asyncio
    async def test_process_image_with_diagram(self):
        service = GLMService()
        mock_response = AsyncMock()
        mock_response.choices = [AsyncMock()]
        mock_response.choices[0].message.content = """
        {
            "subject": "数学",
            "questions": [
                {
                    "number": 2,
                    "content": "如图，正方形面积差52",
                    "has_diagram": true,
                    "diagram": {
                        "description": "大正方形14x14，内部分割为A和B两部分",
                        "labels": ["A", "B", "2cm"]
                    }
                }
            ]
        }
        """

        with patch.object(service.client.chat.completions, "create", new=AsyncMock(return_value=mock_response)):
            result = await service.process_image(["b64img"])

        assert result["questions"][0]["has_diagram"] is True
        assert result["questions"][0]["diagram"]["labels"] == ["A", "B", "2cm"]

    @pytest.mark.asyncio
    async def test_handles_invalid_json_gracefully(self):
        service = GLMService()
        mock_response = AsyncMock()
        mock_response.choices = [AsyncMock()]
        mock_response.choices[0].message.content = "Some non-JSON text output"

        with patch.object(service.client.chat.completions, "create", new=AsyncMock(return_value=mock_response)):
            result = await service.process_image(["b64img"])

        assert result["subject"] == "未分类"
        assert len(result["questions"]) == 1
