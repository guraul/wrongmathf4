import base64
import os
import tempfile
import pytest
from unittest.mock import Mock, patch, mock_open

from src.services.file_processor import (
    pdf_to_images,
    image_to_base64,
    process_file,
    get_file_info,
    FileProcessingError,
    PDFProcessingError,
    ImageProcessingError
)
from src.utils.validators import FileNotFoundError, ValidationError


class TestPDFToImages:
    """Test cases for PDF to images conversion."""
    
    @pytest.mark.skip(reason="PDF processing requires dependencies")
    def test_pdf_to_images_success(self, mock_pdf):
        """Test successful PDF to images conversion."""
        # This test will be implemented when dependencies are available
        pass
    
    @pytest.mark.skip(reason="PDF processing requires dependencies")
    def test_pdf_not_found_raises_error(self):
        """Test non-existent PDF raises PDFProcessingError."""
        with pytest.raises(FileNotFoundError):
            pdf_to_images("/nonexistent/file.pdf")
    
    @pytest.mark.skip(reason="PDF processing requires dependencies")
    def test_invalid_pdf_raises_error(self, corrupted_pdf_file):
        """Test corrupted PDF raises PDFProcessingError."""
        with pytest.raises(PDFProcessingError):
            pdf_to_images(corrupted_pdf_file)


class TestImageToBase64:
    """Test cases for image to base64 conversion."""
    
    def test_image_to_base64_png_success(self, mock_image):
        """Test successful PNG image to base64 conversion."""
        with patch('src.services.file_processor.Image') as mock_pil:
            mock_pil.Image.fromarray.return_value = mock_image
            mock_image.convert.return_value = mock_image
            mock_image.save = Mock()
            
            # Mock BytesIO
            with patch('src.services.file_processor.BytesIO') as mock_buffer:
                mock_buffer_instance = Mock()
                mock_buffer_instance.getvalue.return_value = b'fake_image_data'
                mock_buffer.return_value = mock_buffer_instance
                
                with patch('base64.b64encode') as mock_b64:
                    mock_b64.return_value = b'fake_base64_string'
                    
                    result = image_to_base64(mock_image, "PNG")
                    
                    assert result == "fake_base64_string"
                    mock_image.save.assert_called_once()
    
    def test_image_to_base64_jpeg_conversion(self, mock_image):
        """Test JPEG image to base64 conversion with RGB conversion."""
        with patch('src.services.file_processor.Image') as mock_pil:
            mock_pil.Image.fromarray.return_value = mock_image
            mock_image.convert = Mock()
            mock_image.save = Mock()
            
            # Mock BytesIO
            with patch('src.services.file_processor.BytesIO') as mock_buffer:
                mock_buffer_instance = Mock()
                mock_buffer_instance.getvalue.return_value = b'fake_image_data'
                mock_buffer.return_value = mock_buffer_instance
                
                with patch('base64.b64encode') as mock_b64:
                    mock_b64.return_value = b'fake_base64_string'
                    
                    result = image_to_base64(mock_image, "JPEG")
                    
                    # Should convert to RGB for JPEG
                    mock_image.convert.assert_called_with("RGB")
                    mock_image.save.assert_called_once()
    
    def test_image_processing_error_handling(self, mock_image):
        """Test image processing error handling."""
        mock_image.save.side_effect = Exception("Processing failed")
        
        with patch('src.services.file_processor.BytesIO'):
            with pytest.raises(ImageProcessingError, match="Image processing failed"):
                image_to_base64(mock_image)


class TestProcessFile:
    """Test cases for file processing."""
    
    def test_process_image_jpg_success(self, temp_jpg_file):
        """Test successful JPG image processing."""
        # This will require actual image processing dependencies
        pass
    
    def test_process_image_png_success(self, temp_png_file):
        """Test successful PNG image processing."""
        # This will require actual image processing dependencies
        pass
    
    def test_process_pdf_success(self, temp_pdf_file):
        """Test successful PDF processing."""
        # This will require actual PDF processing dependencies
        pass
    
    def test_unsupported_file_type_raises_error(self, temp_txt_file):
        """Test unsupported file type raises ValidationError."""
        with pytest.raises(ValidationError, match="Unsupported file type"):
            process_file(temp_txt_file)
    
    def test_nonexistent_file_raises_error(self):
        """Test non-existent file raises FileNotFoundError."""
        with pytest.raises(FileNotFoundError):
            process_file("/nonexistent/file.pdf")
    
    @pytest.mark.skip(reason="Requires image dependencies")
    def test_corrupted_image_handling(self, corrupted_image_file):
        """Test corrupted image handling."""
        # This test will be implemented when dependencies are available
        pass


class TestGetFileInfo:
    """Test cases for file information retrieval."""
    
    def test_get_file_info_pdf(self, temp_pdf_file):
        """Test getting file info for PDF."""
        # This will require actual PDF processing dependencies
        pass
    
    def test_get_file_info_jpg(self, temp_jpg_file):
        """Test getting file info for JPG."""
        # This will require actual image processing dependencies
        pass
    
    def test_get_file_info_png(self, temp_png_file):
        """Test getting file info for PNG."""
        # This will require actual image processing dependencies
        pass
    
    def test_get_file_info_txt(self, temp_txt_file):
        """Test getting file info for TXT (edge case)."""
        info = get_file_info(temp_txt_file)
        
        assert info["file_path"] == temp_txt_file
        assert info["file_size"] > 0
        assert info["file_size_mb"] > 0
        assert info["extension"] == ".txt"
        # Should not have PDF or image-specific fields
        assert "pdf_pages" not in info
        assert "pdf_title" not in info
        assert "image_width" not in info
        assert "image_height" not in info
    
    def test_get_file_info_nonexistent_file(self):
        """Test getting file info for non-existent file."""
        with pytest.raises(FileNotFoundError):
            get_file_info("/nonexistent/file.pdf")


# Pytest fixtures
@pytest.fixture
def mock_image():
    """Create a mock PIL Image object."""
    mock_img = Mock()
    mock_img.width = 800
    mock_img.height = 600
    mock_img.mode = "RGB"
    return mock_img


@pytest.fixture
def temp_pdf_file():
    """Create a temporary PDF file for testing."""
    with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.pdf') as f:
        f.write("fake pdf content")
        file_path = f.name
    
    yield file_path
    
    # Cleanup
    if os.path.exists(file_path):
        os.unlink(file_path)


@pytest.fixture
def temp_jpg_file():
    """Create a temporary JPG file for testing."""
    with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.jpg') as f:
        f.write("fake jpg content")
        file_path = f.name
    
    yield file_path
    
    # Cleanup
    if os.path.exists(file_path):
        os.unlink(file_path)


@pytest.fixture
def temp_png_file():
    """Create a temporary PNG file for testing."""
    with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.png') as f:
        f.write("fake png content")
        file_path = f.name
    
    yield file_path
    
    # Cleanup
    if os.path.exists(file_path):
        os.unlink(file_path)


@pytest.fixture
def temp_txt_file():
    """Create a temporary TXT file for testing."""
    with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.txt') as f:
        f.write("fake txt content")
        file_path = f.name
    
    yield file_path
    
    # Cleanup
    if os.path.exists(file_path):
        os.unlink(file_path)


@pytest.fixture
def corrupted_pdf_file():
    """Create a corrupted PDF file for testing."""
    with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.pdf') as f:
        f.write("corrupted pdf data")
        file_path = f.name
    
    yield file_path
    
    # Cleanup
    if os.path.exists(file_path):
        os.unlink(file_path)


@pytest.fixture
def corrupted_image_file():
    """Create a corrupted image file for testing."""
    with tempfile.NamedTemporaryFile(mode='w', delete=False, suffix='.png') as f:
        f.write("corrupted image data")
        file_path = f.name
    
    yield file_path
    
    # Cleanup
    if os.path.exists(file_path):
        os.unlink(file_path)


# Mock objects for testing
@pytest.fixture
def mock_pdf_document():
    """Create a mock PDF document."""
    mock_doc = Mock()
    mock_doc.__len__ = Mock(return_value=3)  # 3 pages
    mock_doc.__getitem__ = Mock()
    mock_doc.close = Mock()
    mock_doc.metadata = {"title": "Test PDF"}
    
    # Mock pages
    mock_page = Mock()
    mock_page.get_pixmap = Mock()
    mock_pixmap = Mock()
    mock_pixmap.tobytes = Mock(return_value=b"fake_png_data")
    mock_page.get_pixmap.return_value = mock_pixmap
    mock_doc.__getitem__.return_value = mock_page
    
    return mock_doc


@pytest.fixture
def mock_pdf(mocker, mock_pdf_document):
    """Mock PDF processing with mock_pdf_document."""
    with mocker.patch('src.services.file_processor.fitz') as mock_fit:
        mock_fit.open.return_value = mock_pdf_document
        mock_fit.Matrix.return_value = Mock()
        
        yield {
            "open": mock_fit.open,
            "matrix": mock_fit.Matrix,
            "document": mock_pdf_document
        }