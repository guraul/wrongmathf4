# GLM-4.5V 配图提示词 + JSXGraph 渲染方案

## 给 GLM-4.5V 的 Prompt

```
看这张图片，提取所有数学题目。

要求：
1. 重新编号为 1,2,3...，数学公式用 LaTeX
2. 对每个有配图的题目（含几何图形、线段图、图表等），提取图形的精确坐标：

坐标规则（重要）：
- 大图形左下角为原点 (0, 0)
- x 轴向右，y 轴向上
- 所有坐标使用整数或小数
- 单位：对齐图形的自然尺寸（如 cm 或格数）

shape 类型：
- "rect": 矩形，记录 {x1, y1, x2, y2, label}
- "line": 线段，记录 {x1, y1, x2, y2}
- "label": 标注文字，记录 {x, y, text}

输出 JSON 格式：

{
  "subject": "数学",
  "questions": [
    {
      "number": 1,
      "content": "题目内容",
      "has_diagram": false,
      "shapes": [],
      "labels": []
    },
    {
      "number": 2,
      "content": "如图，大正方形边长比A多2cm",
      "has_diagram": true,
      "shapes": [
        {"type": "rect", "x1": 0, "y1": 0, "x2": 14, "y2": 14, "label": ""},
        {"type": "rect", "x1": 0, "y1": 2, "x2": 12, "y2": 14, "label": "A"},
        {"type": "rect", "x1": 12, "y1": 0, "x2": 14, "y2": 2, "label": "B"}
      ],
      "labels": [
        {"text": "2cm", "x": 13, "y": 8}
      ]
    }
  ]
}

只输出 JSON，不要加解释。
```

## 坐标 → JSXGraph 转换函数

```python
def shapes_to_jsx(questions: list[dict]) -> str:
    """Convert diagram coordinates to JSXGraph JavaScript code."""
    js_parts = []
    for q in questions:
        if not q.get("has_diagram"):
            continue
        num = q["number"]
        shapes = q.get("shapes", [])
        labels_q = q.get("labels", [])

        # 计算边界
        xs = []
        ys = []
        for s in shapes:
            if "x1" in s:
                xs.extend([s["x1"], s.get("x2", 0)])
                ys.extend([s["y1"], s.get("y2", 0)])

        if not xs:
            continue

        xmin, xmax = min(xs), max(xs)
        ymin, ymax = min(ys), max(ys)
        w = xmax - xmin
        h = ymax - ymin

        # 生成 JSXGraph 代码
        lines = [
            f"  // === Q{num} === ",
            f"  var board_{num} = JXG.JSXGraph.initBoard('b{num}', {{",
            f"    boundingbox: [{xmin-1}, {ymax+1}, {xmax+1}, {ymin-1}],",
            f"    axis: false, showNavigation: false, showCopyright: false",
            f"  }});",
        ]

        for s in shapes:
            t = s.get("type", "")
            if t == "rect":
                x1, y1 = s["x1"], s["y1"]
                x2, y2 = s["x2"], s["y2"]
                lines.append(
                    f'  board_{num}.create("polygon", [[{x1},{y1}],[{x2},{y1}],[{x2},{y2}],[{x1},{y2}]],'
                    f' {{borders: {{strokeColor: "#333", strokeWidth: 1.2}}}});'
                )
                if s.get("label"):
                    cx = (x1 + x2) / 2
                    cy = (y1 + y2) / 2
                    lines.append(
                        f'  board_{num}.create("text", [{cx},{cy},"{s["label"]}"],'
                        f' {{fontSize: 16, anchorX: "middle", anchorY: "middle"}});'
                    )
            elif t == "line":
                x1, y1 = s["x1"], s["y1"]
                x2, y2 = s["x2"], s["y2"]
                lines.append(
                    f'  board_{num}.create("segment", [[{x1},{y1}],[{x2},{y2}]],'
                    f' {{strokeWidth: 2}});'
                )

        for lbl in labels_q:
            lines.append(
                f'  board_{num}.create("text", [{lbl["x"]},{lbl["y"]},"{lbl["text"]}"],'
                f' {{fontSize: 12}});'
            )

        js_parts.append("\n".join(lines))

    return "\n".join(js_parts)
```

## HTML 模板

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>数学错题</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.28/dist/katex.min.css">
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.28/dist/katex.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/katex@0.16.28/dist/contrib/auto-render.min.js"></script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/jsxgraph@1.9.0/distrib/jsxgraph.css" />
<script src="https://cdn.jsdelivr.net/npm/jsxgraph@1.9.0/distrib/jsxgraphcore.js"></script>
<style>
body { font-family: sans-serif; max-width: 720px; margin: 0 auto; padding: 20px; background: #f8f9fa; }
.q { background: #fff; border-radius: 8px; padding: 14px 18px; margin-bottom: 10px; font-size: 14px; }
.qnum { color: #1a73e8; font-weight: 700; }
.diagram { background: #fff; border-radius: 8px; margin-bottom: 10px; width: 50%; margin-left: auto; margin-right: auto; }
</style>
</head>
<body>
<h1>数学错题</h1>
<div id="qs"></div>
<script>
var questions = {JSON_DATA};  // ← 替换为 GLM-4.5V 输出的 JSON

var c = document.getElementById('qs');
questions.questions.forEach(function(q) {
  c.innerHTML += '<div class="q"><div class="qnum">### '+q.number+'</div>'+q.content+'</div>';
  if (q.has_diagram) {
    c.innerHTML += '<div class="diagram"><div id="b'+q.number+'" style="width:100%;height:300px;"></div></div>';
  }
});

// ← 替换为 shapes_to_jsx() 的输出
{JX CODE}

renderMathInElement(document.body, {
  delimiters: [{left:'$',right:'$',display:false},{left:'$$',right:'$$',display:true}],
  throwOnError: false
});
</script>
</body>
</html>
```

## 完整流水线

```
图片
  ↓ 发送给 GLM-4.5V（使用上面的 Prompt）
JSON（题目 + shapes + labels）
  ↓ shapes_to_jsx() 转换
JSXGraph 代码
  ↓ 嵌入 HTML 模板
最终 HTML（KaTeX 公式 + JSXGraph 配图）
```

## 使用方式

```python
import json
import asyncio

async def process(image_path, output_html="output.html"):
    # Step 1: GLM-4.5V 提取
    glm = GLMService()
    result = await glm.process_image(image_base64_list)

    # Step 2: 坐标 → JSXGraph 代码
    jsx_code = shapes_to_jsx(result["questions"])

    # Step 3: 填充 HTML 模板
    html = HTML_TEMPLATE.replace("{JSON_DATA}", json.dumps(result, ensure_ascii=False))
    html = html.replace("{JX CODE}", jsx_code)

    with open(output_html, 'w') as f:
        f.write(html)
    return output_html
```
