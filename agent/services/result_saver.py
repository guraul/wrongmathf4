"""Convert GLM-4.5V JSON output to worksheet-format Markdown."""

import time
from pathlib import Path


def save_result(result: dict) -> str:
    subject = result.get("subject", "未分类")
    date = time.strftime("%Y-%m-%d")
    questions = result.get("questions", [])

    lines = [
        "---",
        f"title: {subject} 错题 {date}",
        f"subject: {subject}",
        f"date: {date}",
        "---",
        "",
    ]

    for q in questions:
        lines.append(f"{q['number']}. {q['content']}")
        lines.append("")
        if q.get("has_diagram"):
            lines.append("> *（配图）*")
            lines.append("")
        lines.append("<br>")
        lines.append("<br>")
        lines.append("<br>")
        lines.append("<br>")
        lines.append("")

    md = "\n".join(lines)

    output_dir = Path("output") / subject
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{date}.md"
    output_path.write_text(md, encoding="utf-8")

    return str(output_path)
