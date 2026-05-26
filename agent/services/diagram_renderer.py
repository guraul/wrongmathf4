import os
import logging
from openai import AsyncOpenAI

logger = logging.getLogger("agent.diagram_renderer")


async def generate_tikz(description: str, labels: list[str]) -> str:
    """Generate TikZ code from a diagram description.

    Args:
        description: Text description of the diagram geometry
        labels: List of label texts in the diagram

    Returns:
        TikZ code string, or empty string if generation fails
    """
    api_key = os.getenv("SILICONFLOW_API_KEY")
    client = AsyncOpenAI(api_key=api_key, base_url="https://api.siliconflow.cn/v1")

    prompt = f"""根据以下配图描述生成TikZ代码还原这个几何图形。

配图描述：{description}
标注文字：{', '.join(labels)}

要求：
- 使用精确坐标
- 标注文字放在各区域中心
- 大正方形左下角放在(0,0)
- 分割线用虚线
- 只用TikZ基础绘图命令（\\draw, \\node, \\rectangle）
- 不要用\\def定义变量
- 直接使用具体数值坐标
- 只输出TikZ代码，不要```tikz包裹、不要解释"""

    response = await client.chat.completions.create(
        model="zai-org/GLM-4.5V",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=4096,
        temperature=0.1,
    )

    raw = response.choices[0].message.content
    tikz = _extract_tikz(raw)
    if tikz:
        return tikz

    logger.warning("TikZ generation failed, falling back to SVG")
    return await _fallback_svg(description, labels)


def _extract_tikz(text: str) -> str | None:
    start = text.find(r"\begin{tikzpicture}")
    end = text.find(r"\end{tikzpicture}")
    if start >= 0 and end > start:
        return text[start:end + len(r"\end{tikzpicture}")]
    if "tikzpicture" in text:
        lines = [l for l in text.split("\n") if "draw" in l or "node" in l or "rectangle" in l]
        if lines:
            return "\\begin{tikzpicture}\n" + "\n".join(lines) + "\n\\end{tikzpicture}"
    return None


async def _fallback_svg(description: str, labels: list[str]) -> str:
    api_key = os.getenv("SILICONFLOW_API_KEY")
    client = AsyncOpenAI(api_key=api_key, base_url="https://api.siliconflow.cn/v1")

    prompt = f"""根据以下配图描述生成SVG代码。

配图描述：{description}
标注文字：{', '.join(labels)}

只输出SVG代码，不要解释。"""
    response = await client.chat.completions.create(
        model="zai-org/GLM-4.5V",
        messages=[{"role": "user", "content": prompt}],
        max_tokens=4096,
        temperature=0.1,
    )

    raw = response.choices[0].message.content
    start = raw.find("<svg")
    end = raw.rfind("</svg>") + len("</svg>")
    if start >= 0 and end > start:
        return raw[start:end]
    return ""
