"""Convert GLM-4.5V output to self-contained HTML with KaTeX + JSXGraph."""

import json


HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.28/dist/katex.min.css">
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.28/dist/katex.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.28/dist/contrib/auto-render.min.js"></script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/jsxgraph@1.9.0/distrib/jsxgraph.css"/>
<script src="https://cdn.jsdelivr.net/npm/jsxgraph@1.9.0/distrib/jsxgraphcore.js"></script>
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{font-family:-apple-system,"Noto Sans SC",sans-serif;max-width:720px;margin:0 auto;padding:20px;background:#f8f9fa;color:#333;line-height:1.8}}
h1{{text-align:center;border-bottom:2px solid #dee2e6;padding-bottom:10px;margin-bottom:20px;font-size:20px}}
.q{{background:#fff;border-radius:8px;padding:14px 18px;margin-bottom:10px;box-shadow:0 1px 3px rgba(0,0,0,.08);font-size:14px}}
.qnum{{color:#1a73e8;font-weight:700;margin-bottom:4px}}
.diagram-box{{background:#fff;border-radius:8px;margin-bottom:10px;box-shadow:0 1px 3px rgba(0,0,0,.08);padding:4px;width:50%;margin-left:auto;margin-right:auto}}
</style>
</head>
<body>
<h1>{heading}</h1>
<div id="qs"></div>

<script>
var data = {json_data};

var c = document.getElementById('qs');
data.questions.forEach(function(q) {{
  var d = document.createElement('div');
  d.className = 'q';
  d.innerHTML = '<div class="qnum">### ' + q.number + '</div>' + q.content;
  c.appendChild(d);
  if (q.has_diagram) {{
    var box = document.createElement('div');
    box.className = 'diagram-box';
    var bd = document.createElement('div');
    bd.id = 'b' + q.number;
    bd.style.width = '100%';
    bd.style.height = '300px';
    box.appendChild(bd);
    c.appendChild(box);
  }}
}});

{jsx_code}

renderMathInElement(document.body, {{
  delimiters: [{{left:'$',right:'$',display:false}},{{left:'$$',right:'$$',display:true}}],
  throwOnError: false
}});
</script>
</body>
</html>"""


def shapes_to_jsx(questions: list[dict]) -> str:
    """Convert GLM-4.5V output (shapes + labels) to JSXGraph JavaScript code.

    Each question with a diagram should have:
      - shapes: [{type, x1, y1, x2, y2?, label?}, ...]
      - labels: [{x, y, text}, ...]

    Returns JavaScript string to embed in HTML.
    """
    parts = []
    for q in questions:
        if not q.get("has_diagram"):
            continue

        num = q.get("number", "?")
        shapes = q.get("shapes", [])
        labels_q = q.get("labels", [])

        if not shapes:
            continue

        xs = []
        ys = []
        for s in shapes:
            if "x1" in s:
                xs.append(s["x1"])
                xs.append(s.get("x2", 0))
                ys.append(s["y1"])
                ys.append(s.get("y2", 0))

        if not xs:
            continue

        margin = 1
        xmin, xmax = min(xs), max(xs)
        ymin, ymax = min(ys), max(ys)

        lines = [
            f"  (function(){{",
            f"    var board = JXG.JSXGraph.initBoard('b{num}', {{",
            f"      boundingbox: [{xmin-margin},{ymax+margin},{xmax+margin},{ymin-margin}],",
            f"      axis: false, showNavigation: false, showCopyright: false",
            f"    }});",
        ]

        for s in shapes:
            t = s.get("type", "")
            label = s.get("label", "")

            if t == "rect":
                x1, y1 = s["x1"], s["y1"]
                x2, y2 = s["x2"], s["y2"]
                lines.append(
                    f'    board.create("polygon", [[{x1},{y1}],[{x2},{y1}],[{x2},{y2}],[{x1},{y2}]],'
                    f' {{borders:{{strokeColor:"#333",strokeWidth:1.2}}}});'
                )
                if label:
                    cx = (x1 + x2) / 2
                    cy = (y1 + y2) / 2
                    lines.append(
                        f'    board.create("text", [{cx},{cy},"{label}"],'
                        f' {{fontSize:16, anchorX:"middle", anchorY:"middle"}});'
                    )

            elif t == "line":
                x1, y1 = s["x1"], s["y1"]
                x2, y2 = s["x2"], s["y2"]
                lines.append(
                    f'    board.create("segment", [[{x1},{y1}],[{x2},{y2}]], {{strokeWidth:2}});'
                )
                if label:
                    mx = (x1 + x2) / 2
                    lines.append(
                        f'    board.create("text", [{mx},{y1+0.5},"{label}"],'
                        f' {{fontSize:12, anchorX:"middle"}});'
                    )

            elif t == "circle":
                cx, cy = s.get("cx", 0), s.get("cy", 0)
                r = s.get("r", 1)
                lines.append(f'    board.create("circle", [[{cx},{cy}],{r}]);')
                if label:
                    lines.append(
                        f'    board.create("text", [{cx},{cy},"{label}"],'
                        f' {{fontSize:12, anchorX:"middle", anchorY:"middle"}});'
                    )

        for lbl in labels_q:
            text = lbl.get("text", "")
            px = lbl.get("x", 0)
            py = lbl.get("y", 0)
            if text:
                lines.append(
                    f'    board.create("text", [{px},{py},"{text}"], {{fontSize:12}});'
                )

        lines.append("  })();")
        parts.append("\n".join(lines))

    return "\n".join(parts)


def generate_html(
    result: dict,
    title: str = "数学错题",
    heading: str = "数学错题",
) -> str:
    """Generate complete HTML file from GLM-4.5V result.

    Args:
        result: GLM-4.5V output dict with "questions" array
        title: HTML page title
        heading: H1 heading text

    Returns:
        Complete HTML string
    """
    html = HTML_TEMPLATE
    html = html.replace("{title}", title)
    html = html.replace("{heading}", heading)
    html = html.replace("{json_data}", json.dumps(result, ensure_ascii=False))
    html = html.replace("{jsx_code}", shapes_to_jsx(result.get("questions", [])))
    return html
