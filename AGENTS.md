# AGENTS.md - WrongMath MCP Server

## Build / Test / Run Commands

### Environment Setup
```bash
cd /Users/gubin/project/wrongmathf4
source venv/bin/activate
pip install -r requirements.txt
```

### Run Server (MCP stdio mode)
```bash
python3 -m src.server
# Or use the startup script:
./run_server.sh
```

### Run All Tests
```bash
pytest tests/ -v
pytest tests/ --cov=src --cov-report=html
```

### Run Single Test File
```bash
pytest tests/test_ocr_service.py -v
pytest tests/test_file_processor.py -v
pytest tests/test_validators.py -v
pytest tests/test_server.py -v
```

### Run Single Test
```bash
pytest tests/test_ocr_service.py::TestOCRService::test_recognize_text_success -v
```

### Deployment Script
```bash
./deploy.sh  # Checks environment, installs dependencies, validates setup
```

## Code Style Guidelines

### Imports
- Use absolute imports from project root: `from src.services.ocr_service import ...`
- Group imports: stdlib → third-party → local
- Never use relative imports like `from .services import ...`
- Standard: Python 3.13+, type hints required

### Naming Conventions
- **Files**: snake_case (e.g., `file_processor.py`, `ocr_service.py`)
- **Classes**: PascalCase (e.g., `OCRService`, `FileProcessingError`)
- **Functions/Variables**: snake_case (e.g., `pdf_to_images`, `max_retries`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `MAX_FILE_SIZE_MB`)
- **Private Methods**: `_single_underscore_prefix`

### Type Hints
- Required for all function signatures
- Use `from typing import` for complex types
- Examples:
  ```python
  def process_file(file_path: str) -> Tuple[List[str], int]: ...
  async def recognize_text(images: List[str]) -> str: ...
  def setup_logger(name: str = "wrongmath", level: Optional[str] = None) -> logging.Logger: ...
  ```

### Error Handling
- Custom exceptions inherit from project-specific base classes:
  ```python
  class OCRError(Exception): ...
  class ValidationError(Exception): ...
  class FileProcessingError(Exception): ...
  ```
- Never suppress errors with bare `except: pass`
- Always log errors with logger
- Return structured error responses in API

### Logging
- Use `setup_logger()` from `src.utils.logger`
- Log format: `[%(asctime)s] %(name)s - %(levelname)s - %(message)s`
- Levels: DEBUG for dev, INFO for production

### Async/Await
- Use `async def` for I/O-bound operations (API calls, file I/O)
- Use `asyncio.run()` to execute async functions
- Mock async functions in tests with `AsyncMock`

### Project Structure
```
src/
  ├── server.py          # MCP server (main entry)
  ├── services/
  │   ├── ocr_service.py  # API calls to SiliconFlow
  │   └── file_processor.py  # PDF/image handling
  └── utils/
      ├── logger.py       # Logging setup
      └── validators.py   # Input validation
tests/
  ├── test_ocr_service.py
  ├── test_file_processor.py
  ├── test_validators.py
  └── test_server.py
```

### Key Configuration
- **Environment**: `.env` file with `SILICONFLOW_API_KEY`
- **Model**: `deepseek-ai/DeepSeek-OCR` (OCR-specialized model, NOT deepseek-vl2)
- **API**: SiliconFlow endpoint `https://api.siliconflow.cn/v1`
- **Output**: Results auto-saved to `output/{filename}.md`

### File Processing
- Supported formats: `.pdf`, `.jpg`, `.jpeg`, `.png`
- Max file size: 10 MB
- PDF conversion: 1x zoom (reduced from 2x for token limits)
- Max output tokens: 2048

### Testing Patterns
- Use `pytest` with `pytest-asyncio`
- Mock external APIs with `unittest.mock`
- Mark async tests with `@pytest.mark.asyncio`
- Skip integration tests requiring API with `@pytest.mark.skip`

### Common Patterns
- Always validate file paths before processing
- Use absolute paths (reject relative paths)
- Check for path traversal attacks (`..` in path)
- Return structured dicts with `success`, `content`, `error` fields

### Don't Do
- ❌ Use relative imports
- ❌ Suppress errors with bare except
- ❌ Skip type hints
- ❌ Use `as any`, `@ts-ignore`, `@ts-expect-error` (Python - no type coercion)
- ❌ Delete failing tests to "pass"
- ❌ Hardcode paths - use environment variables
