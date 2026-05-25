import os
import time
import logging
from pathlib import Path
from agent.task import Task

logger = logging.getLogger("agent.result_saver")


async def save_result(
    task: Task,
    verified: dict,
    raw_text: str,
    base_dir: str = "output",
) -> str:
    subject = verified.get("subject", "未分类")
    date = time.strftime("%Y-%m-%d")
    subject_dir = Path(base_dir) / subject
    subject_dir.mkdir(parents=True, exist_ok=True)

    file_path = subject_dir / f"{date}.md"

    frontmatter = f"""---
title: {subject} 错题 {date}
subject: {subject}
date: {date}
source: {task.source}
task_id: {task.id}
---

"""

    content = raw_text.strip()

    existing = ""
    if file_path.exists():
        existing = file_path.read_text(encoding="utf-8")

    if not existing:
        file_path.write_text(frontmatter + content, encoding="utf-8")
    else:
        file_path.write_text(existing + "\n\n---\n\n" + content, encoding="utf-8")

    logger.info(f"Saved result: {file_path}")
    return str(file_path)
