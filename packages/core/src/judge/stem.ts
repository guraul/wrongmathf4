import type { RawPage, RawQuestion } from "../vlm/parse.js";

/**
 * 题干补全。
 *
 * 卷面常见写法：大题标题写公共要求（一、求下列组合图形的面积），小问只有「（2）」。
 * 模型照抄小问标号，导出的复刻卷上就剩一个「（2）」，学生看不懂要做什么。
 *
 * 这里的兜底只做一件事：题干只由标号组成时，用同大题里最长的题干补上。
 * 补不出来就保持原样——宁可题干短，也不编一道卷面上没有的题。
 */

/** 只由标号组成：`（2）`、`(3)`、`1.`、`二、` 这类 */
export function isLabelOnly(stem: string): boolean {
  const compact = stem.replace(/\s+/g, "");
  if (compact === "") return true;
  return /^[（(]?\d{1,2}[）).、]?$/.test(compact) || /^[一二三四五六七八九十]+[、.]?$/.test(compact);
}

/** 大题号：`一（2）` 取 `一`，`二.1` 取 `二` */
function sectionOf(originalNo: string): string {
  return originalNo.trim().slice(0, 1);
}

export interface StemRepair {
  page: RawPage;
  /** 被补全的题号，便于在 evidence 里标注 */
  inherited: string[];
}

export function repairStems(page: RawPage): StemRepair {
  const inherited: string[] = [];

  const bySection = new Map<string, string>();
  for (const q of page.questions) {
    if (isLabelOnly(q.stem)) continue;
    const section = sectionOf(q.originalNo);
    const current = bySection.get(section) ?? "";
    if (q.stem.length > current.length) bySection.set(section, q.stem);
  }

  const questions = page.questions.map((q: RawQuestion) => {
    if (!isLabelOnly(q.stem)) return q;

    const section = sectionOf(q.originalNo);
    const shared = bySection.get(section);
    if (shared === undefined || shared === "") return q;

    inherited.push(q.originalNo);
    return { ...q, stem: shared };
  });

  return { page: { questions }, inherited };
}
