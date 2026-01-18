#!/usr/bin/env python3
"""
Analyze an image containing mathematical content using the OCRService.

This script reads an image, converts it to base64, and uses the existing OCRService
to recognize text, formulas, and mathematical content from the image.
"""

import asyncio
import base64
import os
from pathlib import Path
from typing import List

from src.services.ocr_service import OCRService, create_ocr_service


async def analyze_image(image_path: str) -> str:
    """Analyze an image and return the recognized text."""
    # Create OCR service instance
    ocr_service = OCRService()
    
    # Read and convert image to base64
    with open(image_path, "rb") as image_file:
        image_data = image_file.read()
        image_b64 = base64.b64encode(image_data).decode('utf-8')
    
    # Call recognize_text with the base64 image
    recognized_text = await ocr_service.recognize_text([image_b64])
    
    return recognized_text


def print_analysis_results(image_path: str, text: str) -> None:
    """Print the analysis results in a formatted way."""
    print(f"Analysis Results for: {image_path}\n")
    print("=" * 80)
    print("RECOGNIZED TEXT AND MATHEMATICAL CONTENT:")
    print("=" * 80)
    print(text)
    print("=" * 80)
    print("\nSummary:")
    
    # Check for mathematical formulas and structure
    has_formulas = "$$" in text or "$" in text
    has_chinese_content = any(ord(char) > 127 for char in text)  # Simple check for Chinese chars
    
    print(f"- Mathematical formulas detected: {'Yes' if has_formulas else 'No'}")
    print(f"- Contains Chinese text: {'Yes' if has_chinese_content else 'No'}")
    print(f"- Total characters recognized: {len(text)}")
    
    # Look for page headers and problem numbers
    lines = text.split('\n')
    problem_count = sum(1 for line in lines if line.strip().startswith('#') or 
                      '题目' in line or '第' in line and '页' in line)
    print(f"- Problems/sections detected: {problem_count}")


async def main():
    """Main function to run the image analysis."""
    image_path = "/Users/gubin/project/wrongmathf4/output/images/豆包爱学-错题组卷-20260110_1_page_002.png"
    
    if not os.path.exists(image_path):
        print(f"Error: Image file not found at {image_path}")
        return
    
    print(f"Analyzing image: {image_path}")
    print("This may take a few moments to process...")
    
    try:
        # Analyze the image
        recognized_text = await analyze_image(image_path)
        
        # Print the results
        print_analysis_results(image_path, recognized_text)
        
    except Exception as e:
        print(f"Error analyzing image: {e}")


if __name__ == "__main__":
    asyncio.run(main())