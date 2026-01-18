# Test Fixtures Directory

This directory contains test fixture files for the WrongMath MCP server testing.

## Fixture Files

### Math Problem Images
These are placeholder files representing different types of math problems:

- `simple_algebra.jpg` - Simple algebra problem (e.g., quadratic equations)
- `calculus.jpg` - Calculus problem (derivatives, integrals)
- `geometry.jpg` - Geometry problem (shapes, angles, measurements)
- `functions.jpg` - Function problem (graph analysis, transformations)
- `handwritten.jpg` - Handwritten math problem
- `multi_column.pdf` - Multi-column math test layout
- `math_exam.pdf` - Complete math exam with multiple problems

### Test Data Structure

Each fixture should represent realistic math problem scenarios:

1. **simple_algebra.jpg**: 
   - Basic quadratic equations like $ax^2 + bx + c = 0$
   - Linear equations like $2x + 3 = 7$
   - Simple substitution problems

2. **calculus.jpg**:
   - Derivative problems like $\frac{d}{dx}(x^3 + 2x^2 - 5x + 1)$
   - Integral problems like $\int_0^2 x^2 dx$
   - Limit problems like $\lim_{x \to 0} \frac{\sin x}{x}$

3. **geometry.jpg**:
   - Triangle problems (area, perimeter, angles)
   - Circle problems (circumference, area)
   - Coordinate geometry problems

4. **functions.jpg**:
   - Function analysis (domain, range, asymptotes)
   - Function transformations
   - Graph interpretation problems

### Current Status

These files are currently placeholders. For actual testing, you would need:

1. Real math problem images in JPG/PNG format
2. PDF files with math content
3. Images with varying quality (to test OCR robustness)
4. Handwritten math problems (to test recognition accuracy)

### Usage in Tests

These fixtures are referenced in:
- `tests/test_file_processor.py` - for testing file reading and processing
- `tests/test_ocr_service.py` - for testing OCR functionality
- `tests/test_server.py` - for testing complete server workflows

When you have real test images, place them in this directory with the specified names.