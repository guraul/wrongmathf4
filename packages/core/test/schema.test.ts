import { describe, expect, it } from "vitest";
import { Batch, Figure, Question } from "../src/schema.js";

const page = {
  id: "p1",
  index: 0,
  imagePath: "test/fixtures/2026-11-17/p1-geo5.jpg",
  width: 1080,
  height: 1920,
};

const geometryQuestion = {
  id: "q1",
  originalNo: "一（2）",
  sequence: 1,
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
  solverAnswer: "13.32 cm²",
  verdict: "wrong",
  confidence: 0.93,
};

describe("批次契约", () => {
  it("解析合法批次并补上默认值", () => {
    const parsed = Batch.parse({
      id: "b1",
      source: "2026-11-17",
      createdAt: "2026-11-18T09:30:00.000Z",
      status: "done",
      pages: [page],
      questions: [geometryQuestion],
    });

    expect(parsed.questions[0]?.figures).toHaveLength(1);
    expect(parsed.questions[0]?.evidence).toEqual({});
    expect(parsed.questions[0]?.figures[0]?.type).toBe("composite");
    expect(parsed.htmlPath).toBeNull();
  });

  it("图形参数里保留卷面的小数写法", () => {
    const figure = Figure.parse({
      type: "composite",
      layout: "stack",
      parts: [
        { shape: "triangle", base: "0.8", height: "2" },
        { shape: "trapezoid", top: "2.6", bottom: "5", height: "2.4" },
      ],
    });

    expect(figure.type).toBe("composite");
    if (figure.type === "composite") {
      expect(figure.unit).toBe("cm");
      expect(figure.parts[0]).toEqual({ shape: "triangle", base: "0.8", height: "2" });
    }
  });

  it("拒绝没有题干的题目", () => {
    const { stem: _stem, ...withoutStem } = geometryQuestion;
    expect(Question.safeParse(withoutStem).success).toBe(false);
  });

  it("拒绝未知的图形类型", () => {
    expect(Figure.safeParse({ type: "freehand", points: [] }).success).toBe(false);
  });

  it("拒绝带单位的尺寸字符串", () => {
    expect(
      Figure.safeParse({
        type: "composite",
        layout: "stack",
        parts: [{ shape: "rect", width: "0.8cm", height: "2" }],
      }).success,
    ).toBe(false);
  });

  it("拒绝未知的判定结论", () => {
    expect(Question.safeParse({ ...geometryQuestion, verdict: "maybe" }).success).toBe(false);
  });

  it("拒绝没有页面的批次", () => {
    expect(
      Batch.safeParse({
        id: "b2",
        source: "empty",
        createdAt: "2026-11-18T09:30:00.000Z",
        status: "queued",
        pages: [],
      }).success,
    ).toBe(false);
  });
});
