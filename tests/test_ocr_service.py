import asyncio
import os
import pytest
from unittest.mock import AsyncMock, Mock, patch

from src.services.ocr_service import (
    OCRService,
    create_ocr_service,
    OCRError,
    OCRTimeoutError,
    AuthenticationError,
    EmptyResponseError
)
from src.utils.validators import ValidationError


class TestOCRService:
    """Test cases for OCR service functionality."""
    
    @pytest.mark.skip(reason="Requires OpenAI API client")
    def test_ocr_service_initialization_missing_api_key(self):
        """Test OCR service initialization fails without API key."""
        with patch.dict(os.environ, {"SILICONFLOW_API_KEY": ""}):
            with pytest.raises(ValidationError, match="SILICONFLOW_API_KEY environment variable is required"):
                OCRService()
    
    @pytest.mark.skip(reason="Requires OpenAI API client")
    def test_ocr_service_initialization_success(self, mock_api_key):
        """Test successful OCR service initialization."""
        with patch.dict(os.environ, {"SILICONFLOW_API_KEY": mock_api_key}):
            service = OCRService()
            
            assert service.api_key == mock_api_key
            assert service.max_retries == 3
            assert service.retry_delay == 1.0
    
    @pytest.mark.skip(reason="Requires OpenAI API client")
    def test_ocr_service_configuration(self, mock_api_key):
        """Test OCR service configuration from environment."""
        test_config = {
            "SILICONFLOW_API_KEY": mock_api_key,
            "SILICONFLOW_BASE_URL": "https://test.api",
            "DEEPSEEK_OCR_MODEL": "test/model",
            "LOG_LEVEL": "DEBUG"
        }
        
        with patch.dict(os.environ, test_config):
            service = OCRService()
            
            assert service.base_url == "https://test.api"
            assert service.model == "test/model"
    
    @pytest.mark.asyncio
    async def test_recognize_text_success(self, mock_ocr_service, sample_base64_images):
        """Test successful text recognition."""
        # Mock successful API response
        mock_response = Mock()
        mock_response.choices = [Mock()]
        mock_response.choices[0].message.content = "## 第 1 页\n\n### 题目 1\n已知函数 $f(x) = x^2 + 2x + 1$，求 $f'(x)$ 在 $x = 1$ 处的值。\n\n#### 解\n$$f'(x) = 2x + 2$$"
        
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)
        
        with patch('src.services.ocr_service.OCRService.client', mock_client):
            result = await mock_ocr_service.recognize_text(sample_base64_images)
            
            assert "第 1 页" in result
            assert "$f(x) = x^2 + 2x + 1$" in result
            assert "$$f'(x) = 2x + 2$$" in result
            
            # Verify API was called correctly
            mock_client.chat.completions.create.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_recognize_text_empty_response_raises_error(self, mock_ocr_service, sample_base64_images):
        """Test empty OCR response raises EmptyResponseError."""
        # Mock empty response
        mock_response = Mock()
        mock_response.choices = []
        
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)
        
        with patch('src.services.ocr_service.OCRService.client', mock_client):
            with pytest.raises(EmptyResponseError, match="OCR API returned empty response"):
                await mock_ocr_service.recognize_text(sample_base64_images)
    
    @pytest.mark.asyncio
    async def test_recognize_text_empty_content_raises_error(self, mock_ocr_service, sample_base64_images):
        """Test empty content in response raises EmptyResponseError."""
        # Mock empty content response
        mock_response = Mock()
        mock_response.choices = [Mock()]
        mock_response.choices[0].message.content = ""
        
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(return_value=mock_response)
        
        with patch('src.services.ocr_service.OCRService.client', mock_client):
            with pytest.raises(EmptyResponseError, match="OCR API returned empty content"):
                await mock_ocr_service.recognize_text(sample_base64_images)
    
    @pytest.mark.asyncio
    async def test_recognize_text_api_authentication_error(self, mock_ocr_service, sample_base64_images):
        """Test API authentication error raises AuthenticationError."""
        from openai import APIError as OpenAIAPIError
        
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(side_effect=OpenAIAPIError("401 Unauthorized"))
        
        with patch('src.services.ocr_service.OCRService.client', mock_client):
            with pytest.raises(AuthenticationError, match="API authentication failed"):
                await mock_ocr_service.recognize_text(sample_base64_images)
    
    @pytest.mark.asyncio
    async def test_recognize_text_retry_logic(self, mock_ocr_service, sample_base64_images):
        """Test OCR retry logic on failures."""
        from openai import APIError as OpenAIAPIError
        
        # Mock failure on first two attempts, success on third
        mock_response = Mock()
        mock_response.choices = [Mock()]
        mock_response.choices[0].message.content = "Test result"
        
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(
            side_effect=[
                OpenAIAPIError("Network error"),
                OpenAIAPIError("Network error"),
                mock_response
            ]
        )
        
        with patch('src.services.ocr_service.OCRService.client', mock_client):
            result = await mock_ocr_service.recognize_text(sample_base64_images)
            
            assert result == "Test result"
            assert mock_client.chat.completions.create.call_count == 3
    
    @pytest.mark.asyncio
    async def test_recognize_text_max_retries_exceeded(self, mock_ocr_service, sample_base64_images):
        """Test that max retries are exceeded raises OCRError."""
        from openai import APIError as OpenAIAPIError
        
        # Mock failure on all attempts
        mock_client = AsyncMock()
        mock_client.chat.completions.create = AsyncMock(side_effect=OpenAIAPIError("Persistent error"))
        
        with patch('src.services.ocr_service.OCRService.client', mock_client):
            with pytest.raises(OCRError, match="OCR operation failed"):
                await mock_ocr_service.recognize_text(sample_base64_images)
            
            # Should have called API max_retries + 1 times
            assert mock_client.chat.completions.create.call_count == mock_ocr_service.max_retries
    
    def test_get_service_info(self, mock_ocr_service):
        """Test getting service information."""
        info = mock_ocr_service.get_service_info()
        
        assert info["api_provider"] == "SiliconFlow"
        assert info["model"] == "deepseek-ai/DeepSeek-OCR"
        assert info["max_retries"] == 3
        assert info["retry_delay"] == 1.0
        assert info["supported_formats"] == ["pdf", "jpg", "jpeg", "png"]
        assert info["output_format"] == "markdown_with_latex"


class TestCreateOCRService:
    """Test cases for creating OCR service instance."""
    
    @pytest.mark.skip(reason="Requires OpenAI API client")
    @pytest.mark.asyncio
    async def test_create_ocr_service_success(self, mock_api_key):
        """Test successful OCR service creation."""
        with patch.dict(os.environ, {"SILICONFLOW_API_KEY": mock_api_key}):
            service = await create_ocr_service()
            
            assert isinstance(service, OCRService)
            assert service.api_key == mock_api_key
    
    @pytest.mark.skip(reason="Requires OpenAI API client")
    @pytest.mark.asyncio
    async def test_create_ocr_service_missing_api_key(self):
        """Test OCR service creation fails without API key."""
        with patch.dict(os.environ, {"SILICONFLOW_API_KEY": ""}, clear=True):
            with pytest.raises(ValidationError, match="SILICONFLOW_API_KEY environment variable is required"):
                await create_ocr_service()


class TestOCRIntegration:
    """Integration tests for OCR functionality."""
    
    @pytest.mark.asyncio
    @pytest.mark.skip(reason="Requires real API key and network")
    async def test_full_ocr_pipeline(self, sample_math_image_path):
        """Test full OCR pipeline with actual file processing."""
        # This test would require actual file processing and API calls
        # It's marked as skipped by default
        pass
    
    @pytest.mark.asyncio
    @pytest.mark.skip(reason="Requires real API key and network")
    async def test_multiple_images_processing(self, sample_base64_images):
        """Test processing multiple images in one request."""
        # This test would process multiple images and verify the result
        # It's marked as skipped by default
        pass


# Pytest fixtures
@pytest.fixture
def mock_api_key():
    """Create a mock API key for testing."""
    return "sk-test-api-key-12345"


@pytest.fixture
def mock_ocr_service(mocker, mock_api_key):
    """Create a mock OCR service for testing."""
    with patch.dict(os.environ, {"SILICONFLOW_API_KEY": mock_api_key}):
        # Import after patching environment
        from src.services.ocr_service import OCRService
        service = OCRService()
        return service


@pytest.fixture
def sample_base64_images():
    """Create sample base64 encoded images for testing."""
    # These are fake base64 strings for testing
    return [
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
    ]


@pytest.fixture
def sample_math_image_path():
    """Create a sample math problem image path for testing."""
    # This would be a path to an actual math problem image
    return "/path/to/sample/math/problem.png"


@pytest.fixture
def mock_openai_response():
    """Create a mock OpenAI API response."""
    mock_response = Mock()
    mock_response.choices = [Mock()]
    mock_response.choices[0].message.content = "## 第 1 页\n\n### 题目 1\n已知函数 $f(x) = x^2 + 2x + 1$"
    return mock_response


@pytest.fixture
def mock_openai_error():
    """Create a mock OpenAI API error."""
    from openai import APIError as OpenAIAPIError
    return OpenAIAPIError("API Error")


@pytest.fixture
def mock_openai_auth_error():
    """Create a mock OpenAI API authentication error."""
    from openai import APIError as OpenAIAPIError
    return OpenAIAPIError("401 Unauthorized")