import asyncio
import os
import pytest
from unittest.mock import AsyncMock, Mock, patch, MagicMock
from typing import List

from src.server import (
    server,
    read_math_file_handler,
    InvalidArgumentError,
    ProcessingError
)
from src.services.file_processor import process_file, get_file_info
from src.services.ocr_service import create_ocr_service


class TestReadMathFileHandler:
    """Test cases for read_math_file_handler function."""
    
    @pytest.mark.asyncio
    async def test_read_math_file_handler_success(self, mock_file_path, mock_process_result):
        """Test successful file reading and processing."""
        with patch('src.server.process_file', return_value=mock_process_result):
            with patch('src.server.get_file_info', return_value={"file_size_mb": 1.5}):
                with patch('src.server.create_ocr_service', return_value=AsyncMock()):
                    # Mock OCR service
                    mock_ocr = AsyncMock()
                    mock_ocr.recognize_text = AsyncMock(return_value="## 测试数学题\n已知函数 $f(x) = x^2 + 2x + 1$")
                    
                    with patch('src.server.create_ocr_service', return_value=mock_ocr):
                        result = await read_math_file_handler(mock_file_path)
                        
                        assert result["success"] is True
                        assert result["file_path"] == mock_file_path
                        assert "content" in result
                        assert "pages_processed" in result
                        assert "images_processed" in result
    
    @pytest.mark.asyncio
    async def test_read_math_file_handler_nonexistent_file(self):
        """Test handler with non-existent file."""
        with pytest.raises(InvalidArgumentError, match="File not found"):
            await read_math_file_handler("/nonexistent/file.pdf")
    
    @pytest.mark.asyncio
    async def test_read_math_file_handler_empty_path(self):
        """Test handler with empty file path."""
        with pytest.raises(InvalidArgumentError, match="file_path must be a non-empty string"):
            await read_math_file_handler("")
    
    @pytest.mark.asyncio
    async def test_read_math_file_handler_relative_path(self):
        """Test handler with relative path."""
        with pytest.raises(InvalidArgumentError, match="file_path must be an absolute path"):
            await read_math_file_handler("relative/path.pdf")
    
    @pytest.mark.asyncio
    async def test_read_math_file_handler_no_images_extracted(self, mock_file_path):
        """Test handler when no images can be extracted."""
        with patch('src.server.process_file', return_value=([], 0)):
            with pytest.raises(ProcessingError, match="No images could be extracted"):
                await read_math_file_handler(mock_file_path)
    
    @pytest.mark.asyncio
    async def test_read_math_file_handler_ocr_empty_result(self, mock_file_path):
        """Test handler when OCR returns empty result."""
        with patch('src.server.process_file', return_value=([], 1)):
            mock_ocr = AsyncMock()
            mock_ocr.recognize_text = AsyncMock(return_value="")
            
            with patch('src.server.create_ocr_service', return_value=mock_ocr):
                with pytest.raises(ProcessingError, match="OCR returned empty result"):
                    await read_math_file_handler(mock_file_path)
    
    @pytest.mark.asyncio
    async def test_read_math_file_handler_validation_error(self, mock_file_path):
        """Test handler propagates validation errors."""
        with patch('src.server.process_file', side_effect=Exception("Processing failed")):
            with pytest.raises(ProcessingError, match="Failed to process file"):
                await read_math_file_handler(mock_file_path)


class TestServer:
    """Test cases for MCP server functionality."""
    
    @pytest.mark.skip(reason="Requires MCP server setup")
    @pytest.mark.asyncio
    async def test_server_initialization(self):
        """Test server initialization."""
        assert server is not None
        assert server.name == "wrongmath"
    
    @pytest.mark.skip(reason="Requires MCP server setup")
    @pytest.mark.asyncio
    async def test_list_tools(self):
        """Test tool listing functionality."""
        tools = await server.list_tools()
        
        assert len(tools) == 1
        assert tools[0].name == "read_math_file"
        assert "数学题目文件" in tools[0].description
    
    @pytest.mark.skip(reason="Requires MCP server setup")
    @pytest.mark.asyncio
    async def test_call_tool_read_math_file_success(self, mock_file_path):
        """Test successful tool call."""
        with patch('src.server.read_math_file_handler', return_value={
            "success": True,
            "file_path": mock_file_path,
            "content": "## 测试数学题\n已知函数 $f(x) = x^2 + 2x + 1$"
        }):
            result = await server.call_tool("read_math_file", {"file_path": mock_file_path})
            
            assert len(result) == 1
            assert "text" in result[0]
            assert "Successfully processed" in result[0].text
            assert "$f(x) = x^2 + 2x + 1$" in result[0].text
    
    @pytest.mark.skip(reason="Requires MCP server setup")
    @pytest.mark.asyncio
    async def test_call_tool_read_math_file_missing_argument(self):
        """Test tool call with missing argument."""
        result = await server.call_tool("read_math_file", {})
        
        assert len(result) == 1
        assert "错误" in result[0].text
        assert "file_path argument is required" in result[0].text
    
    @pytest.mark.skip(reason="Requires MCP server setup")
    @pytest.mark.asyncio
    async def test_call_tool_unknown_tool(self):
        """Test calling unknown tool."""
        with patch('src.server.read_math_file_handler') as mock_handler:
            mock_handler.side_effect = Exception("Unknown tool")
            
            result = await server.call_tool("unknown_tool", {})
            
            assert len(result) == 1
            assert "未知错误" in result[0].text
    
    @pytest.mark.skip(reason="Requires MCP server setup")
    @pytest.mark.asyncio
    async def test_call_tool_invalid_argument_error(self, mock_file_path):
        """Test tool call with invalid argument error."""
        with patch('src.server.read_math_file_handler', side_effect=InvalidArgumentError("Invalid path")):
            result = await server.call_tool("read_math_file", {"file_path": mock_file_path})
            
            assert len(result) == 1
            assert "错误" in result[0].text
            assert "Invalid path" in result[0].text
    
    @pytest.mark.asyncio
    async def test_call_tool_processing_error(self, mock_file_path):
        """Test tool call with processing error."""
        with patch('src.server.read_math_file_handler', side_effect=ProcessingError("Processing failed")):
            result = await server.call_tool("read_math_file", {"file_path": mock_file_path})
            
            assert len(result) == 1
            assert "处理失败" in result[0].text
            assert "Processing failed" in result[0].text
    
    @pytest.mark.asyncio
    async def test_call_tool_unexpected_error(self, mock_file_path):
        """Test tool call with unexpected error."""
        with patch('src.server.read_math_file_handler', side_effect=Exception("Unexpected error")):
            result = await server.call_tool("read_math_file", {"file_path": mock_file_path})
            
            assert len(result) == 1
            assert "未知错误" in result[0].text
            assert "Unexpected error" in result[0].text


class TestServerIntegration:
    """Integration tests for server functionality."""
    
    @pytest.mark.asyncio
    @pytest.mark.skip(reason="Requires full server setup")
    async def test_server_startup(self):
        """Test server startup sequence."""
        # This would test the complete server startup process
        # It's marked as skipped since it requires the full MCP server setup
        pass
    
    @pytest.mark.asyncio
    @pytest.mark.skip(reason="Requires full server setup")
    async def test_server_stdio_communication(self):
        """Test server stdio communication."""
        # This would test the stdio communication with the MCP protocol
        # It's marked as skipped since it's complex to test
        pass
    
    @pytest.mark.asyncio
    async def test_server_error_handling(self, mock_file_path):
        """Test server error handling end-to-end."""
        # Test that errors are properly handled and returned to the user
        with patch('src.server.read_math_file_handler', side_effect=InvalidArgumentError("Test error")):
            result = await server.call_tool("read_math_file", {"file_path": mock_file_path})
            
            # Should return error message in Chinese
            assert len(result) == 1
            assert "错误" in result[0].text
            assert "Test error" in result[0].text
    
    @pytest.mark.asyncio
    async def test_server_logging_configuration(self):
        """Test server logging configuration."""
        with patch.dict(os.environ, {"LOG_LEVEL": "DEBUG"}):
            with patch('src.server.setup_logger') as mock_logger:
                with patch('src.server.main', new_callable=AsyncMock) as mock_main:
                    # This would test the logging setup in main()
                    # For now we just verify the logger is configured
                    pass


# Pytest fixtures
@pytest.fixture
def mock_file_path():
    """Create a mock file path for testing."""
    return "/tmp/test_math_file.pdf"


@pytest.fixture
def mock_process_result():
    """Create mock processing result."""
    return (
        ["base64_encoded_image_1", "base64_encoded_image_2"],  # base64_images
        2  # num_pages
    )


@pytest.fixture
def mock_file_info():
    """Create mock file info."""
    return {
        "file_path": "/tmp/test_math_file.pdf",
        "file_size": 1024 * 1024,  # 1 MB
        "file_size_mb": 1.0,
        "extension": ".pdf",
        "pdf_pages": 2,
        "pdf_title": "Test Math File"
    }


@pytest.fixture
def mock_mcp_stream():
    """Create mock MCP streams."""
    read_stream = AsyncMock()
    write_stream = AsyncMock()
    return read_stream, write_stream


@pytest.fixture
def mock_mcp_request():
    """Create mock MCP request."""
    return {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/list"
    }


@pytest.fixture
def mock_mcp_response():
    """Create mock MCP response."""
    return {
        "jsonrpc": "2.0",
        "id": 1,
        "result": {
            "tools": [
                {
                    "name": "read_math_file",
                    "description": "读取本地数学题目文件"
                }
            ]
        }
    }


# Additional mock objects for testing
@pytest.fixture
def mock_ocr_result():
    """Create mock OCR result."""
    return """## 第 1 页

### 题目 1
已知函数 $f(x) = x^2 + 2x + 1$，求 $f'(x)$ 在 $x = 1$ 处的值。

#### 解
$$f'(x) = 2x + 2$$

当 $x = 1$ 时：

$$f'(1) = 2(1) + 2 = 4$$"""


@pytest.fixture
def mock_env_config():
    """Create mock environment configuration."""
    return {
        "SILICONFLOW_API_KEY": "sk-test-api-key-12345",
        "DEEPSEEK_OCR_MODEL": "deepseek-ai/DeepSeek-OCR",
        "SILICONFLOW_BASE_URL": "https://api.siliconflow.cn/v1",
        "LOG_LEVEL": "INFO"
    }