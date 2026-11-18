import { describe, expect, it } from "vitest";

import { buildQuestions, wrongQuestions } from "../src/judge/pipeline.js";
import { RawPage } from "../src/vlm/parse.js";

const page = RawPage.parse({
  questions: [
    {
      originalNo: "一（2）",
      kind: "geometry",
      stem: "求下列组合图形的面积。（单位：cm）",
      figures: [
        {
          type: "composite",
          layout: "stack",
          parts: [
            { shape: "triangle", base: "4.2", height: "2" },
            { shape: "trapezoid", top: "2.6", bottom: "5", height: "2.4" },
          ],
        },
      ],
      teacherMark: "wrong",
      studentAnswer: "7.92 cm²",
      subjective: false,
    },
    {
      originalNo: "二.1",
      kind: "unitFill",
      stem: "顾村公园的占地面积约为 4（　）。",
      figures: [],
      teacherMark: "none",
      studentAnswer: "ha",
      subjective: false,
    },
    {
      originalNo: "三.1",
      kind: "short",
      stem: "比较两种方法的相同点与不同点。",
      figures: [],
      teacherMark: "none",
      studentAnswer: null,
      subjective: true,
    },
  ],
});

const solver = new Map([
  ["一（2）", "13.32 cm²"],
  ["二.1", "km²"],
]);

describe("拼装题目", () => {
  const built = buildQuestions({ page, solver, foundClusters: 1 });

  it("保留原卷题号与顺序", () => {
    expect(built.questions.map((q) => q.originalNo)).toEqual(["一（2）", "二.1", "三.1"]);
    expect(built.questions.map((q) => q.sequence)).toEqual([1, 2, 3]);
  });

  it("老师打叉的题判错，且独立求解结果被记录下来", () => {
    const q = built.questions[0];
    expect(q?.verdict).toBe("wrong");
    expect(q?.solverAnswer).toBe("13.32 cm²");
  });

  it("没标记但求解与作答不一致 → 补判为错", () => {
    const q = built.questions[1];
    expect(q?.verdict).toBe("wrong");
    expect(q?.evidence.reason).toBe("独立求解与作答不一致");
  });

  it("主观题不判定", () => {
    expect(built.questions[2]?.verdict).toBe("unknown");
  });

  it("只有两类会进错题集", () => {
    expect(wrongQuestions(built.questions).map((q) => q.originalNo)).toEqual(["一（2）", "二.1"]);
  });

  it("自报标记数与簇数对账", () => {
    expect(built.claimedMarks).toBe(1);
  });
});
