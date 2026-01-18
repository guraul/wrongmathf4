import os
import re
from typing import Tuple


class ValidationError(Exception):
    """Base exception for validation errors."""
    pass


class FileNotFoundError(ValidationError):
    """Raised when file does not exist."""
    pass


class UnsupportedFileTypeError(ValidationError):
    """Raised when file type is not supported."""
    pass


class PathTraversalError(ValidationError):
    """Raised when path traversal attempt is detected."""
    pass


class FileSizeExceededError(ValidationError):
    """Raised when file size exceeds limit."""
    pass


def validate_file_path(file_path: str) -> bool:
    """Validate if file path is absolute and exists.
    
    Args:
        file_path: Path to file
        
    Returns:
        bool: True if valid
        
    Raises:
        PathTraversalError: If path traversal attempt detected
        FileNotFoundError: If file doesn't exist
        ValidationError: If path is not absolute
    """
    if not file_path:
        raise ValidationError("File path cannot be empty")
    
    # Check for path traversal attacks
    if ".." in file_path or "\\.." in file_path:
        raise PathTraversalError("Path traversal attack detected")
    
    # Check if path is absolute
    if not os.path.isabs(file_path):
        raise ValidationError("File path must be absolute")
    
    # Check if file exists
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")
    
    return True


def validate_file_type(file_path: str) -> bool:
    """Validate if file type is supported.
    
    Args:
        file_path: Path to file
        
    Returns:
        bool: True if supported
        
    Raises:
        UnsupportedFileTypeError: If file type not supported
    """
    supported_extensions = {".pdf", ".jpg", ".jpeg", ".png"}
    
    _, ext = os.path.splitext(file_path.lower())
    
    if ext not in supported_extensions:
        raise UnsupportedFileTypeError(
            f"Unsupported file type: {ext}. "
            f"Supported types: {', '.join(sorted(supported_extensions))}"
        )
    
    return True


def validate_file_size(file_path: str, max_size_mb: float = 10.0) -> bool:
    """Validate if file size is within limits.
    
    Args:
        file_path: Path to file
        max_size_mb: Maximum file size in MB
        
    Returns:
        bool: True if size is valid
        
    Raises:
        FileSizeExceededError: If file exceeds size limit
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")
    
    file_size = os.path.getsize(file_path)
    max_size_bytes = max_size_mb * 1024 * 1024
    
    if file_size > max_size_bytes:
        raise FileSizeExceededError(
            f"File size ({file_size / 1024 / 1024:.2f} MB) "
            f"exceeds limit ({max_size_mb} MB)"
        )
    
    return True


def sanitize_filename(filename: str) -> str:
    """Sanitize filename by removing dangerous characters.
    
    Args:
        filename: Original filename
        
    Returns:
        str: Sanitized filename
    """
    # Remove dangerous characters
    sanitized = re.sub(r'[<>:"/\\|?*]', '_', filename)
    
    # Remove control characters
    sanitized = ''.join(char for char in sanitized if ord(char) >= 32)
    
    return sanitized


def validate_and_sanitize_path(file_path: str) -> Tuple[bool, str]:
    """Validate file path and return validation result.
    
    Args:
        file_path: Path to file
        
    Returns:
        Tuple[bool, str]: (is_valid, error_message)
    """
    try:
        validate_file_path(file_path)
        validate_file_type(file_path)
        validate_file_size(file_path)
        return True, ""
    except ValidationError as e:
        return False, str(e)