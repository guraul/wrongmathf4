import type { RawPage } from "../vlm/parse.js";

/**
 * 用红笔掩膜复核模型读到的批改符号。
 *
 * 真机上模型会把没批的题报成「打了勾」，甚至报出根本不存在的叉——两轮都一样错，
 * 投票救不了这种相关错误。批改符号本身是红色的，所以让模型给个位置，
 * 再用掩膜统计框内红像素：框里干干净净就说明它看错了。
 */

export interface InkBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 框内红像素占比 */
export function redRatioInBox(
  mask: Uint8Array,
  width: number,
  height: number,
  box: InkBox,
): number {
  const x0 = Math.max(0, Math.floor(box.x * width));
  const y0 = Math.max(0, Math.floor(box.y * height));
  const x1 = Math.min(width, Math.ceil((box.x + box.w) * width));
  const y1 = Math.min(height, Math.ceil((box.y + box.h) * height));

  if (x1 <= x0 || y1 <= y0) return 0;

  let red = 0;
  let total = 0;
  for (let py = y0; py < y1; py++) {
    const row = py * width;
    for (let px = x0; px < x1; px++) {
      total += 1;
      if (mask[row + px] === 1) red += 1;
    }
  }

  return total === 0 ? 0 : red / total;
}

/** 低于这个占比就当框里没有红笔。实测真有符号的框在 6% 以上，空框是 0% */
export const MIN_RED_RATIO = 0.003;

export interface VerifyResult {
  page: RawPage;
  /** 被降级的题号（模型说有标记，框里没有红笔） */
  demoted: string[];
  /** 没给位置、只能保留原判的题号 */
  noBox: string[];
}

export function verifyMarks(
  page: RawPage,
  mask: Uint8Array,
  width: number,
  height: number,
  minRatio = MIN_RED_RATIO,
): VerifyResult {
  const demoted: string[] = [];
  const noBox: string[] = [];

  const questions = page.questions.map((q) => {
    if (q.teacherMark === "none" || q.teacherMark === "unread") return q;

    if (q.markBox === null) {
      noBox.push(q.originalNo);
      return q;
    }

    const [x, y, w, h] = q.markBox;
    const ratio = redRatioInBox(mask, width, height, { x, y, w, h });
    if (ratio >= minRatio) return q;

    demoted.push(q.originalNo);
    return { ...q, teacherMark: "none" as const };
  });

  return { page: { questions }, demoted, noBox };
}
