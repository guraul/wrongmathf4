import asyncio
import asyncio
import os
import time
from typing import List, Dict, Any, Optional
from pathlib import Path

import openai
from openai import AsyncOpenAI

from src.utils.logger import setup_logger
from src.utils.validators import ValidationError

logger = setup_logger("ocr_service")


class OCRError(Exception):
    """Base exception for OCR errors."""
    pass


class OCRTimeoutError(OCRError):
    """Raised when OCR operation times out."""
    pass


class AuthenticationError(OCRError):
    """Raised when API authentication fails."""
    pass


class EmptyResponseError(OCRError):
    """Raised when OCR returns empty response."""
    pass


class OCRService:
    """Service for handling OCR operations with SiliconFlow DeepSeek-OCR."""
    
    def __init__(self):
        self.api_key = os.getenv("SILICONFLOW_API_KEY")
        self.base_url = os.getenv("SILICONFLOW_BASE_URL", "https://api.siliconflow.cn/v1")
        self.model = os.getenv("DEEPSEEK_OCR_MODEL", "deepseek-ai/DeepSeek-OCR")
        self.max_retries = 3
        self.retry_delay = 1.0
        
        if not self.api_key:
            raise ValidationError("SILICONFLOW_API_KEY environment variable is required")
        
        self.client = AsyncOpenAI(
            api_key=self.api_key,
            base_url=self.base_url
        )
    
    async def recognize_text(self, images: List[str]) -> str:
        """Recognize text from images using DeepSeek-OCR.
        
        Args:
            images: List of base64 encoded images
            
        Returns:
            str: Recognized text in Markdown + LaTeX format
            
        Raises:
            OCRError: If OCR operation fails
        """
        try:
            # Create OCR prompt (shortened to fit token limit)
            prompt = """识别图片中的数学公式和文字。用 Markdown + LaTeX 格式输出。

要求：
- 数学公式用 $...$ 或 $$...$$
- 题目用中文

开始识别："""

            # Prepare image content for OpenAI API
            image_content = []
            for i, image_b64 in enumerate(images):
                image_content.append({
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/png;base64,{image_b64}"
                    }
                })
            
            # Add text prompt
            image_content.append({
                "type": "text",
                "text": prompt
            })
            
            logger.info(f"Starting OCR recognition for {len(images)} images")
            
            # Make API call with retry logic
            for attempt in range(self.max_retries):
                try:
                    response = await self.client.chat.completions.create(
                        model=self.model,
                        messages=[
                            {
                                "role": "user",
                                "content": image_content
                            }
                        ],
                        max_tokens=2048,
                        temperature=0.1
                    )
                    
                    if not response.choices or not response.choices[0].message.content:
                        raise EmptyResponseError("OCR API returned empty response")
                    
                    result = response.choices[0].message.content.strip()
                    
                    if not result:
                        raise EmptyResponseError("OCR API returned empty content")
                    
                    logger.info(f"OCR recognition completed successfully on attempt {attempt + 1}")
                    return result
                    
                except openai.APIError as e:
                    if "401" in str(e) or "authentication" in str(e).lower():
                        raise AuthenticationError(f"API authentication failed: {e}")
                    
                    if attempt == self.max_retries - 1:
                        logger.error(f"OCR failed after {self.max_retries} attempts: {e}")
                        raise OCRError(f"OCR operation failed: {e}")
                    
                    logger.warning(f"OCR attempt {attempt + 1} failed: {e}. Retrying in {self.retry_delay}s...")
                    await asyncio.sleep(self.retry_delay)
                    self.retry_delay *= 2  # Exponential backoff
                    
                except Exception as e:
                    if attempt == self.max_retries - 1:
                        logger.error(f"OCR failed after {self.max_retries} attempts: {e}")
                        raise OCRError(f"OCR operation failed: {e}")
                    
                    logger.warning(f"OCR attempt {attempt + 1} failed: {e}. Retrying in {self.retry_delay}s...")
                    await asyncio.sleep(self.retry_delay)
                    self.retry_delay *= 2
            
            # This should not be reached, but just in case
            raise OCRTimeoutError("OCR operation timed out after all retries")
            
        except Exception as e:
            logger.error(f"OCR service error: {e}")
            raise OCRError(f"OCR service failed: {e}")
    
    def get_service_info(self) -> Dict[str, Any]:
        """Get information about the OCR service.
        
        Returns:
            Dict[str, Any]: Service information
        """
        return {
            "api_provider": "SiliconFlow",
            "model": self.model,
            "max_retries": self.max_retries,
            "retry_delay": self.retry_delay,
            "supported_formats": ["pdf", "jpg", "jpeg", "png"],
            "output_format": "markdown_with_latex"
        }


# Helper function to create OCR service instance
async def create_ocr_service() -> OCRService:
    """Create and return OCR service instance.
    
    Returns:
        OCRService: Configured OCR service
        
    Raises:
        ValidationError: If configuration is invalid
    """
    return OCRService()


def save_ocr_result_to_markdown(ocr_result: str, file_path: str, output_dir: str = "output") -> str:
    """Save OCR result to a markdown file."""
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    
    original_name = os.path.basename(file_path)
    base_name = os.path.splitext(original_name)[0]
    output_file = os.path.join(output_dir, f"{base_name}.md")
    
    header = f"""# OCR Result: {original_name}

Generated by WrongMath MCP Server
Date: {time.strftime("%Y-%m-%d %H:%M:%S")}

---

"""
    
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write(header)
        f.write(ocr_result)
    
    logger.info(f"Saved OCR result to: {output_file}")
    return output_file


def get_output_path(file_path: str, output_dir: str = "output") -> str:
    """Get the expected output path for a given file."""
    original_name = os.path.basename(file_path)
    base_name = os.path.splitext(original_name)[0]
    return os.path.join(output_dir, f"{base_name}.md")