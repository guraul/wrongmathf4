import json
import os
import logging
from openai import AsyncOpenAI

logger = logging.getLogger("agent.glm_service")


class GLMService:
    def __init__(self):
        api_key = os.getenv("SILICONFLOW_API_KEY")
        self.client = AsyncOpenAI(api_key=api_key, base_url="https://api.siliconflow.cn/v1")
        self.model = "zai-org/GLM-4.5V"

    async def process_image(self, base64_images: list[str]) -> dict:
        prompt = """提取图片中所有数学题，重新编号为 1,2,3...
数学公式用 LaTeX 格式。

对有配图的题，提取每个形状的精确坐标（大图形左下角为原点 0,0）：
- 矩形：{type: "rectangle", x1, y1, x2, y2, label}
- 线段：{type: "line", x1, y1, x2, y2, label}
- 标注文字：{type: "label", text, x, y}

只输出 JSON：
{
  "subject": "科目",
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
      "content": "题目内容",
      "has_diagram": true,
      "shapes": [
        {"type": "rectangle", "x1": 0, "y1": 0, "x2": 14, "y2": 14, "label": ""},
        {"type": "rectangle", "x1": 0, "y1": 2, "x2": 12, "y2": 14, "label": "A"}
      ],
      "labels": [
        {"text": "2cm", "x": 13, "y": 8}
      ]
    }
  ]
}"""

        content = [{"type": "text", "text": prompt}]
        for b64 in base64_images:
            content.insert(0, {
                "type": "image_url",
                "image_url": {"url": f"data:image/png;base64,{b64}"}
            })

        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "user", "content": content}],
            max_tokens=16384,
            temperature=0.1,
        )

        raw = response.choices[0].message.content
        json_start = raw.find("{")
        json_end = raw.rfind("}") + 1
        if json_start >= 0 and json_end > json_start:
            raw = raw[json_start:json_end]

        try:
            return json.loads(raw)
        except json.JSONDecodeError as e:
            logger.error(f"GLM-4.5V returned invalid JSON: {e}")
            logger.debug(f"Raw output: {raw[:500]}")
            return {
                "subject": "未分类",
                "questions": [{"number": 1, "content": raw, "has_diagram": False, "diagram": None}],
            }
