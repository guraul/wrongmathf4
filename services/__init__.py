"""
WrongMath Services Module

This module contains service layer components for WrongMath MCP server.
"""

import sys
from pathlib import Path

# 添加 src 目录到 sys.path
SRC_DIR = Path(__file__).parent / "src"
sys.path.insert(0, str(SRC_DIR))

from services.file_processor import process_file, pdf_to_image_files
from services.ocr_service import create_ocr_service
from utils.logger import setup_logger
from utils.validators import ValidationError, FileNotFoundError
