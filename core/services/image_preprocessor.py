import base64
import io
import logging
from typing import List, Tuple
from PIL import Image, ImageEnhance

logger = logging.getLogger("image_preprocessor")

MAX_CHUNK_HEIGHT = 3000


def preprocess_image(image: Image.Image) -> Image.Image:
    """Enhance image quality for better OCR."""
    img = image.convert("RGB")

    enhancer = ImageEnhance.Contrast(img)
    img = enhancer.enhance(1.5)

    enhancer = ImageEnhance.Sharpness(img)
    img = enhancer.enhance(1.3)

    if img.size[0] > 2000:
        ratio = 2000.0 / img.size[0]
        new_w = int(img.size[0] * ratio)
        new_h = int(img.size[1] * ratio)
        img = img.resize((new_w, new_h), Image.LANCZOS)

    return img


def split_tall_image(image: Image.Image, max_height: int = MAX_CHUNK_HEIGHT) -> List[Image.Image]:
    """Split a tall image into non-overlapping chunks."""
    w, h = image.size
    if h <= max_height:
        return [image]

    chunks = []
    for y in range(0, h, max_height):
        bottom = min(y + max_height, h)
        chunk = image.crop((0, y, w, bottom))
        chunks.append(chunk)

    logger.info(f"Split {h}px image into {len(chunks)} chunks")
    return chunks


def image_to_base64(image: Image.Image) -> str:
    """Convert PIL Image to base64 string."""
    buffered = io.BytesIO()
    image.save(buffered, format="PNG")
    return base64.b64encode(buffered.getvalue()).decode("utf-8")


def process_and_split_to_base64(file_path: str) -> Tuple[List[str], int]:
    """Load, enhance, split, and encode image for OCR.

    Args:
        file_path: Path to image file

    Returns:
        Tuple of (list_of_base64_chunks, total_chunks)
    """
    img = Image.open(file_path)
    logger.info(f"Loaded image: {img.size}, mode={img.mode}")

    enhanced = preprocess_image(img)
    chunks = split_tall_image(enhanced)

    encoded = [image_to_base64(chunk) for chunk in chunks]
    logger.info(f"Preprocessed: {len(chunks)} chunk(s), {len(encoded)} base64 string(s)")
    return encoded, len(chunks)
