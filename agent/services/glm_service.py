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
        prompt = """你是数学题整理助手。看这张图片，完成以下任务：

1. 提取图片中所有数学题，重新编号为1,2,3...
2. 数学公式用 LaTeX 格式
3. 如果题目有配图，详细描述配图的几何结构：
   - 有哪些形状？位置关系？尺寸关系？
   - 所有标注文字分别在哪里？
   - 图形如何分割？

只输出JSON格式，不要其他内容：
{
  "subject": "科目名称",
  "questions": [
    {
      "number": 1,
      "content": "题目完整内容",
      "has_diagram": true,
      "diagram": {
        "description": "配图详细描述：形状、位置、尺寸、分割方式",
        "labels": ["A", "B", "2cm"]
      }
    }
  ]
}

注意：如果题目没有配图，has_diagram设为false，diagram设为null。"""

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
