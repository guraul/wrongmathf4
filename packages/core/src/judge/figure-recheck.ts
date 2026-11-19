import { markKey } from "./consensus.js";
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

  // 第三轮和第一轮的题号写法可能不同（二.1 / 二（1）），按归一化键匹配
  const byKey = new Map<string, RawQuestion["figures"]>();
  for (const [originalNo, figures] of reread) byKey.set(markKey(originalNo), figures);

  const questions = page.questions.map((q) => {
    const fresh = byKey.get(markKey(q.originalNo));
    if (fresh === undefined) return q;
    if (stableStringify(fresh) === stableStringify(q.figures)) return q;

    corrected.push(q.originalNo);
    return { ...q, figures: fresh };
  });

  return { page: { questions }, corrected };
}
