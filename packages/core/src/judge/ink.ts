import type { RgbaImage } from "../ingest/pixels.js";
import type { Cluster } from "./cluster.js";
import type { RawPage } from "../vlm/parse.js";

/**
 * 批改符号的墨迹体检——**只出报告，不改判定**。
 *
 * 这里曾经是「红笔掩膜复核」：模型说这题打了叉，就按它给的框统计红像素，
 * 框里没有红笔就把判定降级成「没批到」。2026-11-21 的真机数据把这个前提推翻了：
 *
 * 1. 老师改用**黑笔**批改时，整页红像素占比是 0.000%，所有真错题都被降级；
 * 2. 降级后走「独立求解」兜底，求解比对把学生答案的转录噪声判成错，
 *    第 1 页因此报了 14 道错题（实际 4 道）；
 * 3. 反过来，模型给的框本身并不可靠——同一张图两轮转写，4 个真 ✗ 里有一半的框
 *    落在空白处（暗像素 0%），按框降级会误杀真错题。
 *
 * 结论：**框和颜色都不能作为否定的证据**，只能作为「值得人工看一眼」的提示。
 * 判定以多轮投票为准（见 consensus.ts 的 voteMarks）。
 */

export interface InkBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

function walkBox(
  width: number,
  height: number,
  box: InkBox,
  visit: (index: number) => void,
): void {
  const x0 = Math.max(0, Math.floor(box.x * width));
  const y0 = Math.max(0, Math.floor(box.y * height));
  const x1 = Math.min(width, Math.ceil((box.x + box.w) * width));
  const y1 = Math.min(height, Math.ceil((box.y + box.h) * height));
  if (x1 <= x0 || y1 <= y0) return;

  for (let py = y0; py < y1; py++) {
    const row = py * width;
    for (let px = x0; px < x1; px++) visit(row + px);
  }
}

/** 框内红像素占比 */
export function redRatioInBox(
  mask: Uint8Array,
  width: number,
  height: number,
  box: InkBox,
): number {
  let red = 0;
  let total = 0;
  walkBox(width, height, box, (index) => {
    total += 1;
    if (mask[index] === 1) red += 1;
  });
  return total === 0 ? 0 : red / total;
}

/** 框内暗像素（任何颜色的深色笔迹）占比：用来判断框里到底有没有墨 */
export function darkRatioInBox(
  image: RgbaImage,
  box: InkBox,
): number {
  let dark = 0;
  let total = 0;
  walkBox(image.width, image.height, box, (index) => {
    const offset = index * 4;
    const r = image.data[offset] ?? 0;
    const g = image.data[offset + 1] ?? 0;
    const b = image.data[offset + 2] ?? 0;
    total += 1;
    if (0.299 * r + 0.587 * g + 0.114 * b < 120) dark += 1;
  });
  return total === 0 ? 0 : dark / total;
}

/** 低于这个红像素占比就当框里没有红笔（仅用于提示） */
export const MIN_RED_RATIO = 0.003;

/** 低于这个暗像素占比就当框里没有墨迹（仅用于提示） */
export const MIN_DARK_RATIO = 0.01;

/**
 * 有多少个「判错/判对」的标记，其框里真的压着红笔簇。
 *
 * 用来决定「求解漏批兜底」能不能开：整页只要有红色印刷元素（红章、页眉）就会被
 * 「整页有没有红簇」误导，改成只看标记框内的红笔更稳；整页都是黑笔时自然为 0。
 */
export function countRedVerifiedMarks(
  page: RawPage,
  clusters: Cluster[],
  width: number,
  height: number,
): number {
  let verified = 0;

  for (const q of page.questions) {
    if (q.teacherMark !== "wrong" && q.teacherMark !== "right") continue;
    if (q.markBox === null) continue;

    const [x, y, w, h] = q.markBox;
    const bx0 = x * width;
    const by0 = y * height;
    const bx1 = (x + w) * width;
    const by1 = (y + h) * height;

    const hit = clusters.some(
      (c) => c.x < bx1 && c.x + c.w > bx0 && c.y < by1 && c.y + c.h > by0,
    );
    if (hit) verified += 1;
  }

  return verified;
}

export interface MarkInkReport {
  /** 有标记、但框里既没红笔也没暗墨的题号 */
  emptyBoxes: string[];
  /** 有标记、但模型没给位置的题号 */
  noBox: string[];
  /** 有标记、但框里没有红笔的题号（老师可能用了黑笔，不代表标记不存在） */
  noRedInk: string[];
}

/**
 * 逐题量一下批改符号框里的墨迹，产出体检报告。
 * 返回的 page 原样透传——本函数不改变任何判定。
 */
export function inspectMarks(
  page: RawPage,
  image: RgbaImage,
  mask: Uint8Array,
): { page: RawPage; report: MarkInkReport } {
  const emptyBoxes: string[] = [];
  const noBox: string[] = [];
  const noRedInk: string[] = [];

  for (const q of page.questions) {
    if (q.teacherMark !== "wrong" && q.teacherMark !== "right") continue;

    if (q.markBox === null) {
      noBox.push(q.originalNo);
      continue;
    }

    const [x, y, w, h] = q.markBox;
    const box: InkBox = { x, y, w, h };
    const red = redRatioInBox(mask, image.width, image.height, box);
    const dark = darkRatioInBox(image, box);

    if (red < MIN_RED_RATIO) noRedInk.push(q.originalNo);
    if (red < MIN_RED_RATIO && dark < MIN_DARK_RATIO) emptyBoxes.push(q.originalNo);
  }

  return { page, report: { emptyBoxes, noBox, noRedInk } };
}
