import { describe, expect, it } from "vitest";

import {
  dedupePage,
  hasDisagreement,
  markKey,
  mergeRuns,
  transcribeWithConsensus,
  voteMarks,
} from "../src/judge/consensus.js";
import type { RawPage } from "../src/vlm/parse.js";

function page(entries: Array<[string, "right" | "wrong" | "none", string?]>): RawPage {
  return {
    questions: entries.map(([originalNo, teacherMark, stem]) => ({
      originalNo,
      kind: "geometry" as const,
      stem: stem ?? `${originalNo} 的题干`,
      figures: [],
      teacherMark,
      studentAnswer: null,
      subjective: false,
    })),
  };
}

describe("题号对齐", () => {
  it("全角半角、空白、分隔符差异视为同一题", () => {
    expect(markKey("一（2）")).toBe(markKey("一(2)"));
    expect(markKey("二 . 1")).toBe(markKey("二.1"));
    expect(markKey("一（２）")).toBe(markKey("一(2)"));
    // 真机上同一道题会写成这三种
    expect(markKey("二.1")).toBe(markKey("二（1）"));
    expect(markKey("二、1")).toBe(markKey("二.1"));
  });

  it("不同小问仍然是不同键", () => {
    expect(markKey("一（1）")).not.toBe(markKey("一（2）"));
  });
});

describe("编号去重", () => {
  it("同题号同题干只留一条", () => {
    const p = page([
      ["一", "right", "6 平方千米 = （ ）平方米"],
      ["一", "right", "6 平方千米 = （ ）平方米"],
      ["二.1", "wrong"],
    ]);
    expect(dedupePage(p).questions).toHaveLength(2);
  });

  it("同题号但题干不同都保留", () => {
    const p = page([
      ["一", "right", "第一行"],
      ["一", "right", "第二行"],
    ]);
    expect(dedupePage(p).questions).toHaveLength(2);
  });

  it("题号或题干为空的条目丢掉", () => {
    const p = page([
      ["", "right"],
      ["二.1", "none", "   "],
      ["二.2", "none"],
    ]);
    expect(dedupePage(p).questions.map((q) => q.originalNo)).toEqual(["二.2"]);
  });
});

describe("标记投票", () => {
  it("一致时采用该标记", () => {
    expect(voteMarks(["wrong", "wrong"]).mark).toBe("wrong");
  });

  it("三票两票相同取多数", () => {
    expect(voteMarks(["wrong", "right", "wrong"]).mark).toBe("wrong");
  });

  it("两票不同且没第三轮时取 none", () => {
    expect(voteMarks(["wrong", "right"]).mark).toBe("none");
  });

  it("三票各不同时取 none", () => {
    expect(voteMarks(["wrong", "right", "none"]).mark).toBe("none");
  });

  it("保留原始票供排查", () => {
    expect(voteMarks(["wrong", "right", "wrong"]).votes).toEqual(["wrong", "right", "wrong"]);
  });
});

describe("多轮合并", () => {
  it("正文取题数最多的那轮，标记取多数", () => {
    const run1 = page([
      ["一（1）", "right"],
      ["一（2）", "wrong"],
    ]);
    const run2 = page([
      ["一（1）", "right"],
      ["一（2）", "right"],
      ["一（3）", "none"],
    ]);

    const merged = mergeRuns([run1, run2]);
    expect(merged.page.questions).toHaveLength(3);
    expect(merged.spineIndex).toBe(1);
    // 一（2）两轮不一致 → none（保守）
    expect(merged.page.questions.find((q) => q.originalNo === "一（2）")?.teacherMark).toBe("none");
    expect(merged.page.questions.find((q) => q.originalNo === "一（1）")?.teacherMark).toBe("right");
  });

  it("某轮少了一题时，多出来的那题仍保留", () => {
    const run1 = page([
      ["一（1）", "right"],
      ["一（2）", "wrong"],
    ]);
    const run2 = page([["一（1）", "right"]]);
    const merged = mergeRuns([run1, run2]);
    expect(merged.page.questions.map((q) => q.originalNo)).toEqual(["一（1）", "一（2）"]);
  });

  it("空输入直接报错", () => {
    expect(() => mergeRuns([])).toThrow();
  });
});

describe("分歧检测", () => {
  it("标记不同就算有分歧", () => {
    expect(hasDisagreement([page([["一", "wrong"]]), page([["一", "right"]])])).toBe(true);
  });

  it("标记相同就是没分歧", () => {
    expect(hasDisagreement([page([["一", "wrong"]]), page([["一", "wrong"]])])).toBe(false);
  });
});

describe("带投票的转写", () => {
  it("两轮一致只跑两次", async () => {
    let calls = 0;
    const result = await transcribeWithConsensus(async () => {
      calls += 1;
      return page([["一（2）", "wrong"]]);
    });
    expect(calls).toBe(2);
    expect(result.runs).toBe(2);
    expect(result.page.questions[0]?.teacherMark).toBe("wrong");
  });

  it("有分歧时补第三轮", async () => {
    const scripted = [page([["一（2）", "wrong"]]), page([["一（2）", "right"]]), page([["一（2）", "wrong"]])];
    let calls = 0;
    const result = await transcribeWithConsensus(async () => scripted[calls++] as RawPage);
    expect(calls).toBe(3);
    expect(result.page.questions[0]?.teacherMark).toBe("wrong");
  });
});

describe("模型回包容错", () => {
  it("字段回 null 时按保守默认值解析，而不是整卷失败", async () => {
    const { RawPage } = await import("../src/vlm/parse.js");
    const parsed = RawPage.parse({
      questions: [
        { originalNo: null, kind: "fill", stem: null, figures: null, teacherMark: null, subjective: null },
        { originalNo: "二.1", kind: "unitFill", stem: "顾村公园的占地面积约为 4（　）。", teacherMark: "wrong" },
      ],
    });

    expect(parsed.questions[0]).toMatchObject({ originalNo: "", stem: "", teacherMark: "none", figures: [] });
    // 空编号的条目在去重时被丢掉
    expect(dedupePage(parsed).questions.map((q) => q.originalNo)).toEqual(["二.1"]);
  });
});

describe("题干有出入时的对齐", () => {
  const runA = page([
    ["一（1）", "right", "求下列组合图形的面积。（单位：cm）"],
    ["一（2）", "wrong", "求下列组合图形的面积。（单位：cm）"],
    ["一（3）", "right", "求下列组合图形的面积。（单位：cm）"],
    ["一（4）", "right", "求下面图形的面积。（单位：dm）"],
  ]);
  const runB = page([
    ["一（1）", "right", "求下列组合图形的面积(单位:cm)"],
    ["一（2）", "wrong", "求下列组合图形的面积（单位：cm）。"],
    ["一（3）", "right", "求下列组合图形的面积。（单位：cm）"],
    ["一（4）", "wrong", "求下面图形的面积（单位：dm）"],
  ]);
  const runC = page([
    ["一（1）", "right", "求组合图形面积（单位：cm）"],
    ["一（2）", "wrong", "求组合图形面积（单位：cm）"],
    ["一（3）", "right", "求组合图形面积（单位：cm）"],
    ["一（4）", "right", "求组合图形面积（单位：dm）"],
  ]);

  it("三轮都是 4 题，合并后仍是 4 题（不会因为题干出入翻倍）", () => {
    const merged = mergeRuns([runA, runB, runC]);
    expect(merged.page.questions).toHaveLength(4);
  });

  it("一（4）两票 right 一票 wrong，多数决为 right", () => {
    const merged = mergeRuns([runA, runB, runC]);
    expect(merged.page.questions.find((q) => q.originalNo === "一（4）")?.teacherMark).toBe("right");
  });

  it("题干出入也能识别出真正的分歧", () => {
    expect(hasDisagreement([runA, runB, runC])).toBe(true);
    const calm = [runA, runA, runA];
    expect(hasDisagreement(calm)).toBe(false);
  });
});

describe("同号多题（填空行）", () => {
  const make = (marks: Array<"right" | "wrong">) => ({
    questions: marks.map((teacherMark, i) => ({
      originalNo: "一",
      kind: "unitFill" as const,
      stem: `第 ${i + 1} 行填空`,
      figures: [],
      teacherMark,
      studentAnswer: null,
      subjective: false,
    })),
  });

  it("6 条同号不同题干不会被并成一条", () => {
    const merged = mergeRuns([make(["right", "wrong", "right", "right", "right", "right"])]);
    expect(merged.page.questions).toHaveLength(6);
  });

  it("两轮同号多题按顺序配对投票", () => {
    const merged = mergeRuns([
      make(["right", "wrong", "right"]),
      make(["right", "wrong", "right"]),
    ]);
    expect(merged.page.questions).toHaveLength(3);
    expect(merged.page.questions.map((q) => q.teacherMark)).toEqual(["right", "wrong", "right"]);
  });
});

describe("两轮编号写法不同", () => {
  const runA = page([
    ["一（1）", "right", "求下列组合图形的面积。（单位：cm）"],
    ["一（2）", "wrong", "求下列组合图形的面积。（单位：cm）"],
    ["一（3）", "right", "求下列组合图形的面积。（单位：cm）"],
    ["一（4）", "right", "求下面图形的面积。（单位：dm）"],
  ]);
  const runB = page([
    ["1", "right", "求组合图形面积(单位:cm)"],
    ["2", "wrong", "求组合图形面积（单位：cm）"],
    ["3", "right", "求组合图形面积（单位:cm)"],
    ["4", "right", "求下面图形面积（单位：dm）"],
  ]);

  it("按位置对齐，不会因为编号写法不同翻倍", () => {
    const merged = mergeRuns([runA, runB]);
    expect(merged.page.questions).toHaveLength(4);
  });

  it("标记取两轮投票，正文用底稿", () => {
    const merged = mergeRuns([runA, runB]);
    expect(merged.page.questions.map((q) => q.teacherMark)).toEqual(["right", "wrong", "right", "right"]);
    expect(merged.page.questions[0]?.originalNo).toBe("一（1）");
  });
});
