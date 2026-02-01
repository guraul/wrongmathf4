"""
WrongMath Core Module

Core business logic for OCR and file processing.
Shared between Web UI and MCP server implementations.
"""

from core.services import ocr_service, file_processor
from core.utils import logger, validators

__all__ = [
    "ocr_service",
    "file_processor",
    "logger",
    "validators",
]
