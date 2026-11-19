import { describe, expect, it } from "vitest";

import { applyFigureRecheck } from "../src/judge/figure-recheck.js";
import type { RawPage, RawQuestion } from "../src/vlm/parse.js";

const TRIANGLE: RawQuestion["figures"] = [
  { type: "composite", layout: "stack", unit: "cm", parts: [{ shape: "triangle", base: "4.2", height: "2" }] },
];
const WRONG_TRIANGLE: RawQuestion["figures"] = [
  { type: "composite", layout: "stack", unit: "cm", parts: [{ shape: "triangle", base: "5", height: "2.4" }] },
];

function page(figures: RawQuestion["figures"]): RawPage {
  return {
    questions: [
      {
        originalNo: "一（1）",
        kind: "geometry",
        stem: "求面积",
        figures,
        teacherMark: "wrong",
        markBox: null,
        studentAnswer: null,
        subjective: false,
      },
    ],
  };
}

describe("图形尺寸复核", () => {
  it("两轮一致时不算改正", () => {
    const result = applyFigureRecheck(page(TRIANGLE), new Map([["一（1）", TRIANGLE]]));
    expect(result.corrected).toEqual([]);
    expect(result.page.questions[0]?.figures).toEqual(TRIANGLE);
  });

  it("两轮不一致时采用第二轮的读数", () => {
    const result = applyFigureRecheck(page(WRONG_TRIANGLE), new Map([["一（1）", TRIANGLE]]));
    expect(result.corrected).toEqual(["一（1）"]);
    expect(result.page.questions[0]?.figures).toEqual(TRIANGLE);
  });

  it("只差字段顺序时不算改正", () => {
    // 刻意换一个键序，验证比较不受对象字面量顺序影响
    const reordered: RawQuestion["figures"] = [
      {
        unit: "cm",
        layout: "stack",
        type: "composite",
        parts: [{ height: "2", base: "4.2", shape: "triangle" }],
      },
    ];
    const result = applyFigureRecheck(page(TRIANGLE), new Map([["一（1）", reordered]]));
    expect(result.corrected).toEqual([]);
  });

  it("题号写法不同（一(1) 与 一（1））也能对上", () => {
    const result = applyFigureRecheck(page(WRONG_TRIANGLE), new Map([["一(1)", TRIANGLE]]));
    expect(result.corrected).toEqual(["一（1）"]);
  });

  it("第二轮没给这道题时不动", () => {
    const result = applyFigureRecheck(page(WRONG_TRIANGLE), new Map());
    expect(result.corrected).toEqual([]);
    expect(result.page.questions[0]?.figures).toEqual(WRONG_TRIANGLE);
  });
});
