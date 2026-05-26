import pytest
from unittest.mock import AsyncMock, patch
from agent.services.diagram_renderer import generate_tikz, _extract_tikz


class TestExtractTikz:
    def test_extracts_full_tikzpicture(self):
        text = "prefix\n\\begin{tikzpicture}\n\\draw (0,0) rectangle (1,1);\n\\end{tikzpicture}\nsuffix"
        result = _extract_tikz(text)
        assert "\\begin{tikzpicture}" in result
        assert "\\end{tikzpicture}" in result
        assert "\\draw" in result

    def test_returns_none_for_no_tikz(self):
        assert _extract_tikz("just text") is None


class TestGenerateTikz:
    @pytest.mark.asyncio
    async def test_generates_tikz_from_description(self):
        tikz_code = "\\begin{tikzpicture}\n\\draw (0,0) rectangle (14,14);\n\\end{tikzpicture}"

        with patch("agent.services.diagram_renderer.AsyncOpenAI") as mock_openai:
            mock_client = AsyncMock()
            mock_openai.return_value = mock_client
            mock_response = AsyncMock()
            mock_response.choices = [AsyncMock()]
            mock_response.choices[0].message.content = tikz_code
            mock_client.chat.completions.create = AsyncMock(return_value=mock_response)

            result = await generate_tikz("大正方形14x14", ["A", "B"])

        assert "\\begin{tikzpicture}" in result
        assert "\\draw" in result
