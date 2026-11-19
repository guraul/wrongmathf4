import { describe, expect, it } from "vitest";

import { isLabelOnly, repairStems } from "../src/judge/stem.js";
import type { RawPage } from "../src/vlm/parse.js";

function page(entries: Array<[string, string]>): RawPage {
  return {
    questions: entries.map(([originalNo, stem]) => ({
      originalNo,
      kind: "geometry" as const,
      stem,
      figures: [],
      teacherMark: "right" as const,
      markBox: null,
      studentAnswer: null,
      subjective: false,
    })),
  };
}

const SHARED = "求下列组合图形的面积。（单位：cm）";

describe("标号识别", () => {
  it("只有编号的算标号", () => {
    expect(isLabelOnly("（2）")).toBe(true);
    expect(isLabelOnly("(3)")).toBe(true);
    expect(isLabelOnly("2.")).toBe(true);
    expect(isLabelOnly("三、")).toBe(true);
    expect(isLabelOnly("   ")).toBe(true);
  });

  it("有实际内容的不是标号", () => {
    expect(isLabelOnly(SHARED)).toBe(false);
    expect(isLabelOnly("2. 求面积")).toBe(false);
    expect(isLabelOnly("（2）求阴影部分面积")).toBe(false);
  });
});

describe("题干补全", () => {
  it("只有标号的题沿用同大题题干", () => {
    const result = repairStems(page([["一", SHARED], ["一（2）", "（2）"]]));

    expect(result.page.questions[1]?.stem).toBe(SHARED);
    expect(result.inherited).toEqual(["一（2）"]);
  });

  it("不同大题之间不串用", () => {
    const result = repairStems(page([["一", SHARED], ["二（1）", "（1）"]]));

    expect(result.page.questions[1]?.stem).toBe("（1）");
    expect(result.inherited).toEqual([]);
  });

  it("同大题有多个题干时取最长的那个", () => {
    const result = repairStems(
      page([
        ["一（1）", "求面积"],
        ["一（2）", SHARED],
        ["一（3）", "（3）"],
      ]),
    );
    expect(result.page.questions[2]?.stem).toBe(SHARED);
  });

  it("补不出来就保持原样，不编造", () => {
    const result = repairStems(page([["一（2）", "（2）"]]));
    expect(result.page.questions[0]?.stem).toBe("（2）");
    expect(result.inherited).toEqual([]);
  });

  it("本来就有题干的题不动", () => {
    const result = repairStems(page([["一（1）", SHARED], ["一（2）", "求阴影面积"]]));
    expect(result.page.questions[1]?.stem).toBe("求阴影面积");
    expect(result.inherited).toEqual([]);
  });
});
