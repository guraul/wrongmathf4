import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { mergeRuns } from "../src/judge/consensus.js";
import { RawPage } from "../src/vlm/parse.js";

/**
 * 2026-11-21 真机回归：五年级计算练习，黑笔批改。
 *
 * 这张卷子暴露过三个问题，全部修在这里：
 * 1. 老师用黑笔 → 红笔掩膜把 4 道真错题全降级 → 求解兜底补判 14 道错（实际 4 道）
 * 2. 一轮把同一题抄成两条/多编几道 → 题数最多的那轮被选成底稿，第 1 页膨胀到 17 题
 * 3. 单轮独有的编造题被当成"补题"追加进错题卷
 */

function load(page: string, run: 1 | 2): RawPage {
  return RawPage.parse(
    JSON.parse(readFileSync(`test/fixtures/2026-11-21/${page}.run${run}.json`, "utf8")),
  );
}

const EXPECT: Record<string, string[]> = {
  p1: ["3.85", "6.8×4.5", "24.5÷0.5", "0.25×1.25×64"],
  p2: ["2.5×4.4×1.25", "12.5×2.5×0.32"],
};

describe("2026-11-21 真机回归", () => {
  for (const page of ["p1", "p2"]) {
    it(`${page}：两轮合并后题数与真实一致，不膨胀`, () => {
      const merged = mergeRuns([load(page, 1), load(page, 2)]);
      expect(merged.page.questions.length).toBe(10);
    });

    it(`${page}：判出的错题与人工核对一致`, () => {
      const merged = mergeRuns([load(page, 1), load(page, 2)]);
      const wrong = merged.page.questions.filter((q) => q.teacherMark === "wrong");
      expect(wrong.length).toBe(EXPECT[page]?.length ?? -1);
      for (const needle of EXPECT[page] ?? []) {
        expect(wrong.some((q) => q.stem.replace(/\s+/g, "").includes(needle.replace(/\s+/g, "")))).toBe(
          true,
        );
      }
    });
  }

  it("单轮独有的编造题不会被补进结果", () => {
    const a = load("p1", 1);
    const b = load("p1", 2);
    const hallucinated: RawPage = {
      questions: [
        ...b.questions,
        { ...(a.questions[0] as RawPage["questions"][number]), originalNo: "九（9）", stem: "凭空多出来的一道题" },
      ],
    };
    const merged = mergeRuns([a, hallucinated]);
    expect(merged.page.questions.length).toBe(10);
    expect(merged.page.questions.some((q) => q.stem.includes("凭空多出来"))).toBe(false);
  });
});
