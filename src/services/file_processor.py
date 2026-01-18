import base64
import os
from io import BytesIO
from typing import List, Tuple

import fitz  # PyMuPDF
from PIL import Image

from src.utils.logger import setup_logger
from src.utils.validators import ValidationError, FileNotFoundError

logger = setup_logger("file_processor")


class FileProcessingError(Exception):
    """Base exception for file processing errors."""
    pass


class PDFProcessingError(FileProcessingError):
    """Raised when PDF processing fails."""
    pass


class ImageProcessingError(FileProcessingError):
    """Raised when image processing fails."""
    pass


def pdf_to_images(file_path: str) -> List[Image.Image]:
    """Convert PDF to list of images.
    
    Args:
        file_path: Path to PDF file
        
    Returns:
        List[Image.Image]: List of PIL Images
        
    Raises:
        PDFProcessingError: If PDF processing fails
    """
    try:
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"PDF file not found: {file_path}")
        
        doc = fitz.open(file_path)
        images = []
        
        for page_num in range(len(doc)):
            page = doc[page_num]
            
            mat = fitz.Matrix(1.0, 1.0)
            pix = page.get_pixmap(matrix=mat)
            
            # Convert to PIL Image
            img_data = pix.tobytes("png")
            img = Image.open(BytesIO(img_data))
            images.append(img)
            
            logger.info(f"Converted PDF page {page_num + 1} to image")
        
        doc.close()
        logger.info(f"Successfully converted {len(images)} pages from PDF")
        return images
        
    except Exception as e:
        logger.error(f"Failed to process PDF: {e}")
        raise PDFProcessingError(f"PDF processing failed: {e}")


def image_to_base64(image: Image.Image, format: str = "PNG") -> str:
    """Convert PIL Image to base64 string.
    
    Args:
        image: PIL Image object
        format: Image format (PNG, JPEG, etc.)
        
    Returns:
        str: Base64 encoded image data
    """
    try:
        buffered = BytesIO()
        
        if format.upper() == "JPEG":
            image = image.convert("RGB")
        
        image.save(buffered, format=format.upper())
        img_data = buffered.getvalue()
        
        base64_string = base64.b64encode(img_data).decode('utf-8')
        logger.debug(f"Successfully converted image to base64 ({len(img_data)} bytes)")
        
        return base64_string
        
    except Exception as e:
        logger.error(f"Failed to convert image to base64: {e}")
        raise ImageProcessingError(f"Image processing failed: {e}")


def process_file(file_path: str) -> Tuple[List[str], int]:
    """Process file and return list of base64 encoded images.
    
    Args:
        file_path: Path to file (PDF or image)
        
    Returns:
        Tuple[List[str], int]: (list of base64 images, number of pages)
        
    Raises:
        ValidationError: If file validation fails
        FileProcessingError: If file processing fails
    """
    _, ext = os.path.splitext(file_path.lower())
    
    if ext == ".pdf":
        images = pdf_to_images(file_path)
        base64_images = [image_to_base64(img) for img in images]
        return base64_images, len(images)
    
    elif ext in {".jpg", ".jpeg", ".png"}:
        try:
            image = Image.open(file_path)
            if ext == ".jpg" or ext == ".jpeg":
                format = "JPEG"
            else:
                format = "PNG"
            
            base64_image = image_to_base64(image, format)
            return [base64_image], 1
            
        except Exception as e:
            logger.error(f"Failed to process image: {e}")
            raise ImageProcessingError(f"Image processing failed: {e}")
    
    else:
        raise ValidationError(f"Unsupported file type: {ext}")


def pdf_to_image_files(
    pdf_path: str,
    output_dir: str,
    image_format: str = "PNG",
    zoom: float = 1.0
) -> List[str]:
    """Convert PDF pages to image files and save to output directory.

    Args:
        pdf_path: Path to PDF file
        output_dir: Directory to save images
        image_format: Image format (PNG, JPEG, JPG)
        zoom: Zoom factor for image quality (1.0 = 72 DPI, 2.0 = 144 DPI)

    Returns:
        List[str]: List of saved image file paths

    Raises:
        PDFProcessingError: If PDF processing fails
        FileNotFoundError: If PDF file or output directory not found
    """
    if not os.path.exists(pdf_path):
        raise FileNotFoundError(f"PDF file not found: {pdf_path}")

    if not os.path.isabs(pdf_path):
        raise FileNotFoundError(f"pdf_path must be an absolute path: {pdf_path}")

    # Create output directory if it doesn't exist
    os.makedirs(output_dir, exist_ok=True)

    try:
        doc = fitz.open(pdf_path)
        saved_files: List[str] = []

        for page_num in range(len(doc)):
            page = doc[page_num]

            # Apply zoom for higher quality
            mat = fitz.Matrix(zoom, zoom)
            pix = page.get_pixmap(matrix=mat)

            # Determine output file path
            pdf_name = os.path.splitext(os.path.basename(pdf_path))[0]
            if image_format.upper() in {"JPEG", "JPG"}:
                ext = ".jpg"
                output_filename = f"{pdf_name}_page_{page_num + 1:03d}.jpg"
            else:
                ext = ".png"
                output_filename = f"{pdf_name}_page_{page_num + 1:03d}.png"

            output_path = os.path.join(output_dir, output_filename)

            # Save image to file
            pix.save(output_path)
            saved_files.append(output_path)

            logger.info(f"Saved: {output_path}")

        doc.close()
        logger.info(f"Successfully converted {len(saved_files)} pages to {output_dir}")
        return saved_files

    except Exception as e:
        logger.error(f"Failed to convert PDF to images: {e}")
        raise PDFProcessingError(f"PDF to image conversion failed: {e}")


def get_file_info(file_path: str) -> dict:
    """Get information about a file.
    
    Args:
        file_path: Path to file
        
    Returns:
        dict: File information including size, type, dimensions (for images)
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")
    
    _, ext = os.path.splitext(file_path.lower())
    
    info = {
        "file_path": file_path,
        "file_size": os.path.getsize(file_path),
        "file_size_mb": os.path.getsize(file_path) / (1024 * 1024),
        "extension": ext
    }
    
    if ext == ".pdf":
        try:
            doc = fitz.open(file_path)
            info["pdf_pages"] = len(doc)
            info["pdf_title"] = doc.metadata.get("title") or ""
            doc.close()
        except Exception:
            info["pdf_pages"] = 0
            info["pdf_title"] = ""
    
    elif ext in {".jpg", ".jpeg", ".png"}:
        try:
            with Image.open(file_path) as img:
                info["image_width"] = img.width
                info["image_height"] = img.height
                info["image_mode"] = img.mode
        except Exception:
            info["image_width"] = 0
            info["image_height"] = 0
            info["image_mode"] = ""
    
    return info