# WrongMath MCP Server

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0-green.svg)](package.json)
[![Python](https://img.shields.io/badge/python-3.8+-yellow.svg)](https://www.python.org/)

## Overview

**WrongMath** is a pure local Python MCP (Model Context Protocol) server that uses DeepSeek-OCR to recognize mathematical problems from PDFs and images, converting them to Markdown + LaTeX format.

- **Name**: wrongmath-mcp
- **Version**: 1.0.0
- **Display Name**: WrongMath 数学错题 OCR
- **Author**: Gubin
- **Category**: Local Tools

### Description

纯本地 Python MCP 服务器，使用 DeepSeek-OCR 识别数学错题，支持 PDF/图片转 Markdown + LaTeX

## Features

- ✅ **Math Formula Recognition**: LaTeX-formatted mathematical expressions
- ✅ **Geometry Description**: Recognizes and describes geometric figures
- ✅ **PDF Multi-page Processing**: Handles multi-page PDF documents
- ✅ **Function Expression**: Recognizes mathematical functions
- ✅ **Multi-column Layout Support**: Handles complex document layouts
- ✅ **Pure Local Processing**: Runs entirely on your local machine

## Supported Formats

### Input Formats
- **PDF** - Multi-page document support
- **JPG/JPEG** - Image files
- **PNG** - Image files

### Output Formats
- **Markdown** - Human-readable text format
- **LaTeX** - Mathematical formulas wrapped in `$$...$$` or `$...$`

## Available Tools

### `read_math_file`

Reads local math problem files (PDF/images) and converts them to Markdown + LaTeX format using DeepSeek-OCR.

**Parameters:**
- `file_path` (string, required): Absolute path to the local file
  Example: `/Users/gubin/Desktop/test.pdf`

**Supported Content:**
- Complex mathematical formulas
- Geometric figures
- Function expressions

### `recognize_image`

Recognizes text from images and saves to Markdown file. Automatically cleans up question number prefixes (e.g., removes "第1题", "34." from OCR output).

**Parameters:**
- `image_path` (string, required): Absolute path to the image file (PNG, JPG, JPEG)
  Example: `/Users/gubin/Desktop/math.png`
- `output_path` (string, optional): Absolute path for output Markdown file. Defaults to `{image_path}.md`

**Features:**
- Extracts pure question content
- Removes answer and solution steps
- Cleans up OCR artifacts (question numbers, page headers)
- Auto-saves to `output/` folder

## Quick Start

### Step 1: Clone & Install

```bash
# Clone the project
git clone https://github.com/your-repo/wrongmath-mcp.git
cd wrongmath-mcp

# Install dependencies
pip install -r requirements.txt
```

### Step 2: Configure API Key

```bash
# Set your SiliconFlow API key
export SILICONFLOW_API_KEY=sk-your-actual-api-key-here

# Optional: Set log level
export LOG_LEVEL=INFO
```

### Step 3: OpenCode Configuration

Copy the following MCP configuration to your OpenCode settings file:

**Configuration Location**:
`~/Library/Application Support/OpenCode/User/settings.json`

Or create a local `settings.json` in your project folder.

**MCP Configuration:**

```json
{
  "mcp": {
    "wrongmath": {
      "type": "local",
      "command": [
        "python3",
        "/Users/gubin/project/wrongmathf4/src/server.py"
      ],
      "enabled": true,
      "environment": {
        "SILICONFLOW_API_KEY": "sk-your-actual-api-key-here",
        "DEEPSEEK_OCR_MODEL": "deepseek-ai/DeepSeek-OCR",
        "SILICONFLOW_BASE_URL": "https://api.siliconflow.cn/v1",
        "LOG_LEVEL": "INFO"
      }
    }
  }
}
```

> **Note**: Update the path in `command` to match your actual project location, and replace `sk-your-actual-api-key-here` with your actual API key.

### Step 4: Restart OpenCode

Restart OpenCode to load the MCP server.

### Step 5: Start Using

In OpenCode, try:

```
请读取 /Users/gubin/project/wrongmathf4/docs/豆包爱学-错题组卷-20260110_1.pdf
```

The AI will call the `wrongmath.read_math_file` tool and return the content in Markdown + LaTeX format.

**Output File**: Results are automatically saved to `output/豆包爱学-错题组卷-20260110_1.md` (23 KB, 1,135 lines)

## Project Structure

```
wrongmath-mcp/
├── src/
│   ├── __init__.py
│   ├── server.py              # MCP server main entry
│   ├── services/
│   │   ├── __init__.py
│   │   ├── ocr_service.py     # OCR service wrapper (includes save to markdown)
│   │   └── file_processor.py  # File processing (PDF/images)
│   └── utils/
│       ├── __init__.py
│       ├── logger.py          # Logging utilities
│       └── validators.py       # Input validation
├── tests/
│   ├── test_ocr_service.py
│   ├── test_file_processor.py
│   ├── test_validators.py
│   ├── test_server.py
│   └── fixtures/
│       └── test_math.jpg
├── docs/                      # Test PDF files
│   └── 豆包爱学-错题组卷-20260110_1.pdf
├── output/                    # Generated markdown files (auto-created)
│   └── 豆包爱学-错题组卷-20260110_1.md
├── requirements.txt
├── skills.json
├── opencode.md
├── settings.json              # OpenCode MCP configuration
└── .opencodeignore
```

## Usage Examples

### Example 1: Read a Math Problem Image

```
请读取 ~/Desktop/math_problem.jpg 的内容
```

**Expected Output:**
```markdown
## 第 1 题

已知函数 $f(x) = x^2 + 2x + 1$，求 $f'(x)$ 在 $x = 1$ 处的值。

### 解

$$f'(x) = 2x + 2$$

当 $x = 1$ 时：

$$f'(1) = 2(1) + 2 = 4$$
```

### Example 2: Process a Multi-page PDF

```
读取 ~/Desktop/math_exam.pdf，列出所有题目
```

**Expected Output:**
```markdown
## 第 1 页

### 题目 1
...

### 题目 2
...

## 第 2 页

### 题目 3
...
```

### Example 3: Complex Calculus Problem

```
请识别 ~/Desktop/calculus.jpg 中的微积分题目
```

**Expected Output:** Complex integration symbols and function expressions accurately recognized in LaTeX format.

## Dependencies

```txt
mcp>=0.9.0
openai>=1.0.0
pymupdf>=1.23.0
Pillow>=10.0.0
python-dotenv
PyYAML
```

## Testing & Validation

### Unit Tests

```bash
# Run all tests
pytest tests/ -v

# Run with coverage
pytest tests/ --cov=src --cov-report=html
```

**Pass Criteria:**
- ✅ All tests pass
- ✅ Code coverage ≥ 80%
- ✅ No warnings
- ✅ Execution time < 10 seconds

### Integration Tests

```bash
# Start the server
python3 src/server.py

# Test tool listing
echo '{"jsonrpc": "2.0", "id": 1, "method": "tools/list"}' | python3 src/server.py | jq
```

### OpenCode Integration Tests

1. **Verify Server Startup**
   - Restart OpenCode
   - Check console for: `MCP server 'wrongmath' connected`

2. **Verify Tool Discovery**
   - Ask: "你有哪些可用的工具？"
   - Expect: AI mentions `read_math_file`

3. **Test with Simple Image**
   - Input: `请读取 ~/Desktop/test_math/simple_algebra.jpg 的内容`
   - Expect: Markdown output with LaTeX formulas

4. **Test with Complex Image**
   - Input: `请识别 ~/Desktop/test_math/calculus.jpg 中的微积分题目`
   - Expect: Accurate complex symbol recognition

5. **Test Multi-page PDF**
   - Input: `读取 ~/Desktop/test_math/math_exam.pdf，列出所有题目`
   - Expect: Content split by pages, total time < 30 seconds

**Success Indicators:**
- ✅ No errors in OpenCode console
- ✅ Tool call logs visible in conversation
- ✅ Output contains `$$`-wrapped formulas

## Troubleshooting

### API Call Failed

**Cause**: Invalid API Key
**Solution**: Check and update `SILICONFLOW_API_KEY` in environment variables

### Low Recognition Accuracy

**Cause**: Poor image quality
**Solution**: Increase DPI or enhance contrast of images

### Processing Timeout

**Cause**: File too large
**Solution**: Compress file or process page by page

### OpenCode Cannot Start MCP

**Cause**: Incorrect path
**Solution**: Check `server.py` path in OpenCode settings.json

### No Response

**Cause**: Python path or server.py path incorrect
**Solution**: Verify both paths in configuration

### API Key Error

**Cause**: Invalid or expired API key
**Solution**: Verify API key is valid and has sufficient quota

### File Not Found

**Cause**: Incorrect test file path
**Solution**: Check test files exist at specified paths

### Timeout Error

**Cause**: Network issues or slow OCR response
**Solution**: Check network connection or increase `OCR_TIMEOUT` value

## Capabilities

- **File Access**: ✅ True
- **OCR Provider**: SiliconFlow (DeepSeek-OCR, OCR-specialized model)
- **Supported Formats**: pdf, jpg, jpeg, png
- **Output Formats**: markdown, latex
- **Features**: Math formula recognition, geometry description, PDF multi-page, function expressions, multi-column layouts, auto-save to output folder

## Monitoring

### Log Location
- `mcp_server.log`

### Metrics Tracked
- OCR call count
- Average response time
- Error rate
- API quota usage

## Future Iterations

- [ ] Batch file processing
- [ ] Image preprocessing enhancement
- [ ] Custom output templates
- [ ] Recognition history
- [ ] Support for other OCR providers

## Output Folder

OCR results are automatically saved to the `output/` folder as Markdown files.

**Location**: `/Users/gubin/project/wrongmathf4/output/`

**Features**:
- Auto-creates `output/` directory if not exists
- Saves as `{original_filename}.md`
- Includes header with file info and timestamp
- Combines all pages with page separators
- Automatically excluded from OpenCode context (via `.opencodeignore`)

**Example**:
```
docs/豆包爱学-错题组卷-20260110_1.pdf
    ↓
output/豆包爱学-错题组卷-20260110_1.md (23 KB, 1,135 lines)
```

**Usage**:
```python
from src.services.ocr_service import save_ocr_result_to_markdown

# Save OCR result to markdown
output_file = save_ocr_result_to_markdown(
    ocr_result_text, 
    "docs/test.pdf",
    output_dir="output"
)
```

## License

MIT License - See LICENSE file for details

## Support

For issues, questions, or contributions, please visit:
- GitHub: https://github.com/your-repo/wrongmath-mcp
- Issues: https://github.com/your-repo/wrongmath-mcp/issues
