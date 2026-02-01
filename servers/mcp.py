import asyncio
import json
import os
import re
import sys
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv

from mcp.server import Server
from mcp.server.models import InitializationOptions
from mcp.server.stdio import stdio_server
import mcp.types as types

from core.services.file_processor import process_file, get_file_info
from core.services.ocr_service import create_ocr_service
from core.utils.logger import setup_logger
from core.utils.validators import ValidationError, FileNotFoundError

# Load .env file from project root
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
env_file = os.path.join(project_root, '.env')
load_dotenv(env_file)

logger = setup_logger("server")
logger.info(f"Project root: {project_root}")
logger.info(f"Loading .env from: {env_file}")
logger.info(f"API Key set: {'Yes' if os.getenv('SILICONFLOW_API_KEY') else 'No'}")


def clean_question_numbers(text: str) -> str:
    """Remove question number prefixes from OCR output.
    
    Removes patterns like:
    - "第1题", "第2题" (page headers)
    - "34.", "59." (question numbers with period)
    - "34", "59" (standalone question numbers)
    - Multiple consecutive empty lines
    
    Args:
        text: Raw OCR output
        
    Returns:
        str: Cleaned text without question number prefixes
    """
    lines = text.split('\n')
    cleaned_lines = []
    
    for line in lines:
        # Skip empty lines
        if not line.strip():
            cleaned_lines.append(line)
            continue
        
        # Remove "第X题" pattern (e.g., "第1题", "第2题")
        line = re.sub(r'^第\d+题\s*', '', line)
        
        # Remove "XX." pattern at start (e.g., "34.", "59.")
        line = re.sub(r'^\s*\d+\.\s*', '', line)
        
        # Remove "XX" pattern at start followed by space (standalone question numbers)
        # e.g., "34 9 平方千米" -> "9 平方千米"
        line = re.sub(r'^\s*\d+\s+', '', line)
        
        # Remove "XX" pattern with Chinese full-width space
        line = re.sub(r'^[\s　]+?\d+\s+', '', line)
        
        cleaned_lines.append(line)
    
    # Remove multiple consecutive empty lines
    result = '\n'.join(cleaned_lines)
    result = re.sub(r'\n{3,}', '\n\n', result)
    
    return result.strip()


# Custom exceptions for the server
class ServerError(Exception):
    """Base exception for server errors."""
    pass


class InvalidArgumentError(ServerError):
    """Raised when tool arguments are invalid."""
    pass


class ProcessingError(ServerError):
    """Raised when file processing fails."""
    pass


# Create the server instance
server = Server("wrongmath")


async def read_math_file_handler(file_path: str) -> Dict[str, Any]:
    """Handle the read_math_file tool execution.
    
    Args:
        file_path: Path to the file to process
        
    Returns:
        Dict[str, Any]: Result containing the processed content
        
    Raises:
        InvalidArgumentError: If file_path is invalid
        ProcessingError: If file processing fails
    """
    logger.info(f"Processing file: {file_path}")
    
    try:
        # Validate file path using our validators
        if not file_path or not isinstance(file_path, str):
            raise InvalidArgumentError("file_path must be a non-empty string")
        
        # Basic validation
        if not os.path.isabs(file_path):
            raise InvalidArgumentError("file_path must be an absolute path")
        
        # Check if file exists and get basic info
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"File not found: {file_path}")
        
        logger.info("File validation passed")
        
        # Get file information
        file_info = get_file_info(file_path)
        logger.info(f"File info: {file_info['file_size_mb']:.2f} MB, {file_info.get('extension', 'unknown')}")
        
        # Process the file (PDF or image)
        base64_images, num_pages = process_file(file_path)
        
        if not base64_images:
            raise ProcessingError("No images could be extracted from the file")
        
        logger.info(f"Successfully processed {len(base64_images)} images from {num_pages} pages")
        
        # Get OCR service
        ocr_service = await create_ocr_service()
        
        # Perform OCR recognition
        logger.info("Starting OCR recognition")
        recognized_text = await ocr_service.recognize_text(base64_images)
        
        if not recognized_text or not recognized_text.strip():
            raise ProcessingError("OCR returned empty result")
        
        logger.info("OCR recognition completed successfully")
        
        # Return the result
        result = {
            "success": True,
            "file_path": file_path,
            "file_info": file_info,
            "content": recognized_text,
            "pages_processed": num_pages,
            "images_processed": len(base64_images)
        }
        
        return result
        
    except (ValidationError, FileNotFoundError) as e:
        logger.error(f"Validation error: {e}")
        raise InvalidArgumentError(str(e))
    except Exception as e:
        logger.error(f"Processing error: {e}")
        raise ProcessingError(f"Failed to process file: {e}")


async def recognize_image_handler(image_path: str, output_path: Optional[str] = None) -> Dict[str, Any]:
    """Recognize text from an image and optionally save to markdown file.
    
    Args:
        image_path: Path to the image file (PNG, JPG, JPEG)
        output_path: Optional path to save markdown result. If not provided,
                     saves to {image_path}.md in the same directory.
        
    Returns:
        Dict[str, Any]: Result containing the recognized content and output path
        
    Raises:
        InvalidArgumentError: If arguments are invalid
        ProcessingError: If OCR processing fails
    """
    logger.info(f"Recognizing image: {image_path}")
    
    try:
        # Validate image path
        if not image_path or not isinstance(image_path, str):
            raise InvalidArgumentError("image_path must be a non-empty string")
        
        if not os.path.isabs(image_path):
            raise InvalidArgumentError("image_path must be an absolute path")
        
        if not os.path.exists(image_path):
            raise FileNotFoundError(f"Image file not found: {image_path}")
        
        # Validate file extension
        _, ext = os.path.splitext(image_path.lower())
        if ext not in {".png", ".jpg", ".jpeg"}:
            raise InvalidArgumentError(f"Unsupported image format: {ext}. Use PNG, JPG, or JPEG.")
        
        logger.info("Image validation passed")
        
        # Process the image
        base64_images, num_pages = process_file(image_path)
        
        if not base64_images:
            raise ProcessingError("Failed to process image")
        
        # Get OCR service
        ocr_service = await create_ocr_service()
        
        # Perform OCR recognition
        logger.info("Starting OCR recognition")
        recognized_text = await ocr_service.recognize_text(base64_images)
        
        if not recognized_text or not recognized_text.strip():
            raise ProcessingError("OCR returned empty result")
        
        # Clean up question number prefixes
        logger.info("Cleaning question number prefixes")
        recognized_text = clean_question_numbers(recognized_text)
        
        logger.info("OCR recognition completed successfully")
        
        # Determine output path
        if output_path is None:
            output_path = f"{image_path}.md"
        
        # Ensure output path is absolute
        if not os.path.isabs(output_path):
            raise InvalidArgumentError("output_path must be an absolute path")
        
        # Create output directory if needed
        output_dir = os.path.dirname(output_path)
        if output_dir and not os.path.exists(output_dir):
            os.makedirs(output_dir, exist_ok=True)
        
        # Save to markdown file
        with open(output_path, "w", encoding="utf-8") as f:
            f.write(recognized_text)
        
        logger.info(f"Saved OCR result to: {output_path}")
        
        # Return the result
        result = {
            "success": True,
            "image_path": image_path,
            "output_path": output_path,
            "content": recognized_text,
            "characters": len(recognized_text)
        }
        
        return result
        
    except (ValidationError, FileNotFoundError) as e:
        logger.error(f"Validation error: {e}")
        raise InvalidArgumentError(str(e))
    except Exception as e:
        logger.error(f"Processing error: {e}")
        raise ProcessingError(f"Failed to recognize image: {e}")


@server.list_tools()
async def handle_list_tools() -> List[types.Tool]:
    """List available tools for this server."""
    return [
        types.Tool(
            name="read_math_file",
            description="读取本地数学题目文件（PDF/图片），利用 DeepSeek-OCR 转换为 Markdown + LaTeX 格式。支持识别复杂公式、几何图形和函数表达式。",
            inputSchema={
                "type": "object",
                "properties": {
                    "file_path": {
                        "type": "string",
                        "description": "本地文件的绝对路径 (例如: /Users/gubin/Desktop/test.pdf)"
                    }
                },
                "required": ["file_path"]
            }
        ),
        types.Tool(
            name="recognize_image",
            description="识别图片中的数学公式和文字，调用 DeepSeek-OCR，并将结果保存为 Markdown 文件。",
            inputSchema={
                "type": "object",
                "properties": {
                    "image_path": {
                        "type": "string",
                        "description": "图片文件的绝对路径 (例如: /Users/gubin/Desktop/math.png)"
                    },
                    "output_path": {
                        "type": "string",
                        "description": "可选，输出 Markdown 文件的绝对路径 (例如: /Users/gubin/Desktop/result.md)。如果不提供，默认保存为 {image_path}.md"
                    }
                },
                "required": ["image_path"]
            }
        )
    ]


@server.call_tool()
async def handle_call_tool(name: str, arguments: Dict[str, Any]) -> List[types.TextContent]:
    """Handle tool execution."""
    try:
        logger.info(f"Tool call: {name} with args: {arguments}")
        
        if name == "read_math_file":
            if not arguments or "file_path" not in arguments:
                raise InvalidArgumentError("file_path argument is required")
            
            file_path = arguments["file_path"]
            result = await read_math_file_handler(file_path)
            
            # Format the result for the user
            content = result["content"]
            
            return [
                types.TextContent(
                    type="text",
                    text=f"Successfully processed: {result['file_path']}\n\n{content}"
                )
            ]
        
        elif name == "recognize_image":
            if not arguments or "image_path" not in arguments:
                raise InvalidArgumentError("image_path argument is required")
            
            image_path = arguments["image_path"]
            output_path = arguments.get("output_path")
            
            result = await recognize_image_handler(image_path, output_path)
            
            return [
                types.TextContent(
                    type="text",
                    text=f"Recognized: {result['image_path']}\nSaved to: {result['output_path']}\n\n{result['content']}"
                )
            ]
        
        else:
            raise InvalidArgumentError(f"Unknown tool: {name}")
    
    except InvalidArgumentError as e:
        logger.error(f"Invalid argument error: {e}")
        error_text = f"错误: {str(e)}"
        return [types.TextContent(type="text", text=error_text)]
    
    except ProcessingError as e:
        logger.error(f"Processing error: {e}")
        error_text = f"处理失败: {str(e)}"
        return [types.TextContent(type="text", text=error_text)]
    
    except Exception as e:
        logger.error(f"Unexpected error: {e}")
        error_text = f"未知错误: {str(e)}"
        return [types.TextContent(type="text", text=error_text)]


async def main():
    """Main entry point for the MCP server."""
    try:
        # Get log level from environment
        log_level = os.getenv("LOG_LEVEL", "INFO")
        logger.info(f"WrongMath MCP Server starting with log level: {log_level}")
        
        # Check required environment variables
        api_key = os.getenv("SILICONFLOW_API_KEY")
        if not api_key:
            logger.warning("SILICONFLOW_API_KEY not found in environment variables")
        
        # Run the server using stdio transport
        async with stdio_server() as (read_stream, write_stream):
            await server.run(
                read_stream,
                write_stream,
                server.create_initialization_options()
            )
            
    except KeyboardInterrupt:
        logger.info("Server interrupted by user")
    except Exception as e:
        import traceback
        logger.error(f"Server error: {e}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        sys.exit(1)


if __name__ == "__main__":
    # Set up event loop for the main function
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        logger.info("Server stopped by user")
    except Exception as e:
        logger.error(f"Failed to start server: {e}")
        sys.exit(1)