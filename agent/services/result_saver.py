import os
import time
import logging
from pathlib import Path
from agent.task import Task

logger = logging.getLogger("agent.result_saver")


async def save_result(
    task: Task,
    result: dict,
    base_dir: str = "output",
) -> str:
    subject = result.get("subject", "未分类")
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

    questions = result.get("questions", [])
    md_parts = []

    for q in questions:
        number = q.get("number", 1)
        content = q.get("content", "")
        tikz = q.get("tikz_code", "")

        md_parts.append(f"### {number}\n\n{content.strip()}\n")

        if tikz:
            md_parts.append(f"```tikz\n{tikz}\n```\n\n")

    content = "\n".join(md_parts).strip()

    existing = ""
    if file_path.exists():
        existing = file_path.read_text(encoding="utf-8")

    if not existing:
        file_path.write_text(frontmatter + content, encoding="utf-8")
    else:
        file_path.write_text(existing + "\n\n---\n\n" + content, encoding="utf-8")

    logger.info(f"Saved result: {file_path} ({len(questions)} questions)")
    return str(file_path)
