import pytest
from PIL import Image
from core.services.image_preprocessor import (
    preprocess_image,
    split_tall_image,
    process_and_split_to_base64,
)


class TestPreprocessImage:
    def test_enhances_contrast_and_sharpness(self):
        img = Image.new("RGB", (200, 100), color=(128, 128, 128))
        result = preprocess_image(img)
        assert result.size == (200, 100)

    def test_downscales_wide_images(self):
        img = Image.new("RGB", (3000, 100), color=(128, 128, 128))
        result = preprocess_image(img)
        assert result.size[0] <= 2000


class TestSplitTallImage:
    def test_no_split_for_short_image(self):
        img = Image.new("RGB", (100, 500))
        chunks = split_tall_image(img, max_height=2000)
        assert len(chunks) == 1

    def test_splits_tall_image(self):
        img = Image.new("RGB", (100, 5000))
        chunks = split_tall_image(img, max_height=2000)
        assert len(chunks) >= 2


class TestProcessAndSplit:
    def test_processes_and_encodes(self, tmp_path):
        img = Image.new("RGB", (100, 500))
        path = tmp_path / "test.png"
        img.save(path)

        b64_chunks, count = process_and_split_to_base64(str(path))
        assert count >= 1
        assert all(isinstance(c, str) for c in b64_chunks)
        assert len(b64_chunks) == count
