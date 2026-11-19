import { describe, expect, it } from "vitest";

import { redRatioInBox, verifyMarks } from "../src/judge/ink.js";
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

describe("标记复核", () => {
  const mask = maskWith([[10, 10, 20, 20]]);

  it("框里没有红笔的「打勾」不降级——降了会推进求解比对，反而误判", () => {
    const page: RawPage = {
      questions: [question("一（1）", "right", [0.6, 0.6, 0.1, 0.05])],
    };
    const result = verifyMarks(page, mask, W, H);
    expect(result.page.questions[0]?.teacherMark).toBe("right");
    expect(result.demoted).toEqual([]);
  });

  it("框里有红笔的标记保留", () => {
    const page: RawPage = {
      questions: [question("一（1）", "wrong", [0.12, 0.12, 0.06, 0.06])],
    };
    const result = verifyMarks(page, mask, W, H);
    expect(result.page.questions[0]?.teacherMark).toBe("wrong");
    expect(result.demoted).toEqual([]);
  });

  it("框里没有红笔的标记降为 none", () => {
    const page: RawPage = {
      questions: [question("二（1）③", "wrong", [0.6, 0.6, 0.1, 0.05])],
    };
    const result = verifyMarks(page, mask, W, H);
    expect(result.page.questions[0]?.teacherMark).toBe("none");
    expect(result.demoted).toEqual(["二（1）③"]);
  });

  it("没给位置的保留原判，但记下来", () => {
    const page: RawPage = {
      questions: [question("三.1", "wrong", null)],
    };
    const result = verifyMarks(page, mask, W, H);
    expect(result.page.questions[0]?.teacherMark).toBe("wrong");
    expect(result.noBox).toEqual(["三.1"]);
  });

  it("本来就没标记的题不动", () => {
    const page: RawPage = {
      questions: [question("一（2）", "none", null)],
    };
    const result = verifyMarks(page, mask, W, H);
    expect(result.page.questions[0]?.teacherMark).toBe("none");
    expect(result.noBox).toEqual([]);
    expect(result.demoted).toEqual([]);
  });
});
