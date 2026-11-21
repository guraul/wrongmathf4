import { describe, expect, it } from "vitest";

import { darkRatioInBox, inspectMarks, redRatioInBox } from "../src/judge/ink.js";
import type { RgbaImage } from "../src/ingest/pixels.js";
import type { RawPage } from "../src/vlm/parse.js";

const W = 100;
const H = 100;

/** 造一张 100x100 的掩膜，在给定矩形里涂红 */
function maskWith(boxes: Array<[number, number, number, number]>): Uint8Array {
  const mask = new Uint8Array(W * H);
  for (const [x0, y0, x1, y1] of boxes) {
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) mask[y * W + x] = 1;
    }
  }
  return mask;
}

/** 造一张 100x100 的图：白底，在给定矩形里涂成深色（模拟黑笔/铅笔） */
function imageWith(boxes: Array<[number, number, number, number]>): RgbaImage {
  const data = new Uint8ClampedArray(W * H * 4).fill(255);
  for (const [x0, y0, x1, y1] of boxes) {
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        const o = (y * W + x) * 4;
        data[o] = 40;
        data[o + 1] = 40;
        data[o + 2] = 40;
        data[o + 3] = 255;
      }
    }
  }
  return { width: W, height: H, data };
}

function question(
  originalNo: string,
  teacherMark: "right" | "wrong" | "none" | "unread",
  markBox: [number, number, number, number] | null,
) {
  return {
    originalNo,
    kind: "fill" as const,
    stem: "题干",
    figures: [],
    teacherMark,
    markBox,
    studentAnswer: null,
    subjective: false,
  };
}

describe("框内红笔占比", () => {
  it("框里全是红笔时接近 1", () => {
    const mask = maskWith([[0, 0, 100, 100]]);
    expect(redRatioInBox(mask, W, H, { x: 0.1, y: 0.1, w: 0.2, h: 0.2 })).toBeCloseTo(1);
  });

  it("框里没有红笔时为 0", () => {
    const mask = maskWith([[0, 0, 10, 10]]);
    expect(redRatioInBox(mask, W, H, { x: 0.5, y: 0.5, w: 0.2, h: 0.2 })).toBe(0);
  });

  it("框超出图片边界时只算图内部分", () => {
    const mask = maskWith([[0, 0, 80, 100]]);
    const ratio = redRatioInBox(mask, W, H, { x: 0.5, y: 0, w: 0.9, h: 1 });
    expect(ratio).toBeGreaterThan(0);
    expect(ratio).toBeLessThanOrEqual(1);
  });

  it("空框不会除零", () => {
    const mask = maskWith([]);
    expect(redRatioInBox(mask, W, H, { x: 0.5, y: 0.5, w: 0, h: 0 })).toBe(0);
  });
});

describe("框内暗墨占比", () => {
  it("框里全是深色笔迹时接近 1", () => {
    const image = imageWith([[0, 0, 100, 100]]);
    expect(darkRatioInBox(image, { x: 0.1, y: 0.1, w: 0.2, h: 0.2 })).toBeCloseTo(1);
  });

  it("空白处是 0", () => {
    const image = imageWith([]);
    expect(darkRatioInBox(image, { x: 0.5, y: 0.5, w: 0.2, h: 0.2 })).toBe(0);
  });
});

describe("批改符号体检（只记录，不改判定）", () => {
  const mask = maskWith([[10, 10, 20, 20]]);
  const blank = imageWith([]);

  it("红笔框：不报问题", () => {
    const page: RawPage = { questions: [question("一（1）", "wrong", [0.12, 0.12, 0.06, 0.06])] };
    const { page: out, report } = inspectMarks(page, blank, mask);
    expect(out.questions[0]?.teacherMark).toBe("wrong");
    expect(report.emptyBoxes).toEqual([]);
    expect(report.noRedInk).toEqual([]);
  });

  it("黑笔框（整页 0% 红笔）：记为 noRedInk，但判定保持 wrong", () => {
    const image = imageWith([[60, 60, 70, 70]]);
    const page: RawPage = { questions: [question("二（1）", "wrong", [0.6, 0.6, 0.1, 0.1])] };
    const { page: out, report } = inspectMarks(page, image, mask);
    expect(out.questions[0]?.teacherMark).toBe("wrong");
    expect(report.noRedInk).toEqual(["二（1）"]);
    expect(report.emptyBoxes).toEqual([]);
  });

  it("框里完全空白：记为 emptyBoxes，判定仍然不变", () => {
    const page: RawPage = { questions: [question("二（2）", "wrong", [0.6, 0.6, 0.1, 0.1])] };
    const { page: out, report } = inspectMarks(page, blank, mask);
    expect(out.questions[0]?.teacherMark).toBe("wrong");
    expect(report.emptyBoxes).toEqual(["二（2）"]);
  });

  it("没给位置：记 noBox", () => {
    const page: RawPage = { questions: [question("三.1", "wrong", null)] };
    const { report } = inspectMarks(page, blank, mask);
    expect(report.noBox).toEqual(["三.1"]);
  });

  it("本来就没标记的题不参与体检", () => {
    const page: RawPage = { questions: [question("一（2）", "none", null)] };
    const { report } = inspectMarks(page, blank, mask);
    expect(report.noBox).toEqual([]);
    expect(report.emptyBoxes).toEqual([]);
  });
});
