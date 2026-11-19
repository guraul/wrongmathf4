import type { RawPage, RawQuestion } from "../vlm/parse.js";

/**
 * 用第三轮的「只问尺寸」结果修正带图形题目的参数。
 *
 * 第一轮要同时读题干、学生答案、红笔和图形，注意力被分散，尺寸容易串
 * （真机实测：三角形底 4.2 高 2 被读成底 5 高 2.4）。单独读一次尺寸更准。
 *
 * 只在两轮都有结果且确实不同时才改，并且只信「看得清」的那次。
 */

function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_, v) => {
    if (v !== null && typeof v === "object" && !Array.isArray(v)) {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)));
    }
    return v;
  });
}

export interface FigureRecheckResult {
  page: RawPage;
  /** 尺寸被改正的题号 */
  corrected: string[];
}

export function applyFigureRecheck(
  page: RawPage,
  reread: Map<string, RawQuestion["figures"]>,
): FigureRecheckResult {
  const corrected: string[] = [];

  const questions = page.questions.map((q) => {
    const fresh = reread.get(q.originalNo);
    if (fresh === undefined) return q;
    if (stableStringify(fresh) === stableStringify(q.figures)) return q;

    corrected.push(q.originalNo);
    return { ...q, figures: fresh };
  });

  return { page: { questions }, corrected };
}
