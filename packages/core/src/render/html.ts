import type { Figure, Question } from "../schema.js";
import { escapeHtml } from "./escape.js";
import { renderFigure } from "./figures.js";

export { escapeHtml } from "./escape.js";

/**
 * 复刻卷渲染：结构化题目 → 可直接打印的 HTML。
 *
 * 三条硬约束：
 * 1. 纯函数，不读盘、不看时间——同一输入必须渲染出同样的字节，才能做回归比对
 * 2. 复刻卷是给学生重做的，任何判定痕迹（红笔、置信度、学生原答案）都不能出现
 * 3. 题干来自模型转写，必须转义后再拼进 HTML
 */

export interface RenderOptions {
  /** 卷名，如「数学 错题」 */
  title?: string;
  /** 副标题，如日期 */
  subtitle?: string;
  /** 图形渲染器；默认走 renderFigure，测试里可替换 */
  figureRenderer?: (figure: Figure, index: number) => string;
  /** 每题下方留给答题的空白高度（px） */
  answerSpacePx?: number;
}

const DEFAULT_TITLE = "数学 错题";

function renderQuestion(
  question: Question,
  index: number,
  opts: Required<Pick<RenderOptions, "answerSpacePx">> & RenderOptions,
): string {
  const figure = opts.figureRenderer ?? ((f: Figure) => renderFigure(f));
  const figures = question.figures
    .map((f, i) => figure(f, i))
    .join("\n      ");

  const figureBlock = figures === "" ? "" : `\n      <div class="figures">\n      ${figures}\n      </div>`;

  return `    <section class="question">
      <p class="stem"><span class="no">${index + 1}.</span>${escapeHtml(question.stem)}</p>${figureBlock}
      <div class="answer-space" style="height:${opts.answerSpacePx}px"></div>
    </section>`;
}

const STYLE = `
  @page { size: A4; margin: 18mm 16mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 24px 28px; background: #fff; color: #111;
    font-family: "Songti SC", "SimSun", "Noto Serif CJK SC", serif;
    font-size: 15pt; line-height: 1.9;
  }
  header { margin-bottom: 18px; border-bottom: 1px solid #ddd; padding-bottom: 8px; }
  h1 { margin: 0; font-size: 17pt; font-weight: 600; letter-spacing: 1px; }
  .meta { margin: 4px 0 0; font-size: 10pt; color: #666; }
  .question { break-inside: avoid; page-break-inside: avoid; margin-bottom: 6px; }
  .stem { margin: 0 0 6px; text-align: justify; }
  .no { margin-right: 6px; }
  .figures { margin: 6px 0 10px; text-align: center; }
  .answer-space { border-bottom: 1px dotted #e2e2e2; }
  @media print { body { padding: 0; } .answer-space { border-bottom: none; } }
`;

export function renderWorksheet(questions: Question[], opts: RenderOptions = {}): string {
  if (questions.length === 0) throw new Error("没有可渲染的题目");

  const title = opts.title ?? DEFAULT_TITLE;
  const subtitle = opts.subtitle ?? "";
  const answerSpacePx = opts.answerSpacePx ?? 110;

  const meta = [`共 ${questions.length} 题`, subtitle].filter((s) => s !== "").join(" · ");

  // 调用方可以传未排序数组，编号以 sequence 为准
  const ordered = [...questions].sort((a, b) => a.sequence - b.sequence);

  const body = ordered
    .map((q, i) => renderQuestion(q, i, { ...opts, answerSpacePx }))
    .join("\n");

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style>
</head>
<body>
<header>
  <h1>${escapeHtml(title)}</h1>
  <p class="meta">${escapeHtml(meta)}</p>
</header>
<main>
${body}
</main>
</body>
</html>
`;
}
