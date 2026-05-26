def shapes_to_tikz(shapes: list[dict], labels: list[dict]) -> str:
    """Convert coordinate shapes to TikZ code deterministically."""
    if not shapes:
        return ""

    lines = ["\\begin{tikzpicture}"]

    # Find outer bounds for the thick border
    xs = [s.get("x1", 0) for s in shapes if "x1" in s] + \
         [s.get("x2", 0) for s in shapes if "x2" in s]
    ys = [s.get("y1", 0) for s in shapes if "y1" in s] + \
         [s.get("y2", 0) for s in shapes if "y2" in s]

    # Draw thick border for rectangle-based diagrams
    if xs and ys:
        min_x, max_x = min(xs), max(xs)
        min_y, max_y = min(ys), max(ys)
        if any(s.get("type") == "rectangle" for s in shapes):
            lines.append(f"  \\draw[thick] ({min_x},{min_y}) rectangle ({max_x},{max_y});")

    # Draw shapes
    for s in shapes:
        t = s.get("type", "")
        if t == "rectangle":
            x1, y1 = s["x1"], s["y1"]
            x2, y2 = s["x2"], s["y2"]
            lines.append(f"  \\draw ({x1},{y1}) rectangle ({x2},{y2});")
            label = s.get("label", "")
            if label:
                cx = (x1 + x2) / 2
                cy = (y1 + y2) / 2
                lines.append(f"  \\node at ({cx},{cy}) {{{label}}};")
        elif t == "line":
            x1, y1 = s["x1"], s["y1"]
            x2, y2 = s["x2"], s["y2"]
            lines.append(f"  \\draw ({x1},{y1}) -- ({x2},{y2});")
            label = s.get("label", "")
            if label:
                mx = (x1 + x2) / 2
                lines.append(f"  \\node at ({mx},{y1+2}) {{{label}}};")
        elif t == "circle":
            cx, cy = s.get("cx", 0), s.get("cy", 0)
            r = s.get("r", 1)
            lines.append(f"  \\draw ({cx},{cy}) circle ({r});")

    # Draw labels
    for lbl in labels:
        text = lbl.get("text", "")
        x, y = lbl.get("x", 0), lbl.get("y", 0)
        if text:
            lines.append(f"  \\node at ({x},{y}) {{{text}}};")

    lines.append("\\end{tikzpicture}")
    return "\n".join(lines)
