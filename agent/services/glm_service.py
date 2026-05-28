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
        prompt = """提取图片中所有数学题，重新编号 1,2,3...。去掉原标题编号。有配图的题设 has_diagram: true。

只输出 JSON：
{
  "subject": "数学",
  "questions": [
    {"number": 1, "content": "题目内容", "has_diagram": false},
    {"number": 2, "content": "如图，大正方形面积比A多52cm²...", "has_diagram": true}
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
        except json.JSONDecodeError:
            # GLM-4.5V may output \div instead of \\div — fix known commands
            import re
            cmds = "div|frac|times|text|mathrm|sqrt|perp|circ|cdot|ge|le|alpha|beta|implies|rightarrow|left|right|angle|triangle|cong|ne|approx"
            raw = re.sub(r'(?<!\\)\\(?=' + cmds + r')', r'\\\\', raw)
            try:
                return json.loads(raw)
            except json.JSONDecodeError as e:
                logger.error(f"GLM-4.5V JSON parse failed: {e}")
                logger.debug(f"Raw: {raw[:500]}")
                return {"subject": "未分类", "questions": []}
        except json.JSONDecodeError as e:
            logger.error(f"GLM-4.5V returned invalid JSON: {e}")
            logger.debug(f"Raw output: {raw[:500]}")
            return {
                "subject": "未分类",
                "questions": [{"number": 1, "content": raw, "has_diagram": False, "diagram": None}],
            }
