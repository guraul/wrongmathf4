import json
import os
import logging
from openai import AsyncOpenAI

logger = logging.getLogger("agent.llm_service")


class LLMService:
    def __init__(self):
        api_key = os.getenv("DEEPSEEK_API_KEY")
        base_url = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")
        self.model = os.getenv("DEEPSEEK_MODEL", "deepseek-chat")
        self.client = AsyncOpenAI(api_key=api_key, base_url=base_url)

    async def verify(self, ocr_text: str) -> dict:
        prompt = f"""你是一个数学错题分析助手。分析以下 OCR 识别结果，返回 JSON：

{{
    "subject": "科目名称（数学/语文/英语/物理/化学）",
    "questions": [
        {{
            "number": 题目编号,
            "content": "题目内容（保留 LaTeX 公式）",
            "answer": "答案（如有）"
        }}
    ],
    "verified": true/false
}}

OCR 结果：
{ocr_text}
"""

        response = await self.client.chat.completions.create(
            model=self.model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=4096,
            temperature=0.1,
            response_format={"type": "json_object"},
        )

        raw = response.choices[0].message.content
        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            logger.warning(f"LLM returned invalid JSON: {raw[:200]}")
            return {"subject": "未分类", "questions": [], "verified": False}
