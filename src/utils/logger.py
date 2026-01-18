import logging
import sys
from typing import Optional


def setup_logger(name: str = "wrongmath", level: Optional[str] = None) -> logging.Logger:
    """Set up logger with configurable level."""
    logger = logging.getLogger(name)

    if level is None:
        level = "INFO"

    if isinstance(level, str):
        log_level = getattr(logging, level.upper(), logging.INFO)
    else:
        log_level = logging.INFO
    logger.setLevel(log_level)

    handler = logging.StreamHandler(sys.stderr)
    handler.setLevel(log_level)

    formatter = logging.Formatter(
        "[%(asctime)s] %(name)s - %(levelname)s - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S"
    )
    handler.setFormatter(formatter)

    if not logger.handlers:
        logger.addHandler(handler)

    return logger
