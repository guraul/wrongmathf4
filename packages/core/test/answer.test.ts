import { describe, expect, it } from "vitest";

import { compareAnswers, normalizeAnswer, parseAnswer } from "../src/judge/answer.js";

describe("答案归一化", () => {
  it("全角数字与全角标点转半角", () => {
    expect(normalizeAnswer("１３．３２")).toBe("13.32");
    expect(normalizeAnswer("（12）")).toBe("(12)");
  });

  it("单位别名统一", () => {
    expect(normalizeAnswer("13.32 平方厘米")).toBe("13.32cm2");
    expect(normalizeAnswer("13.32 cm²")).toBe("13.32cm2");
    expect(normalizeAnswer("4 平方公里")).toBe("4km2");
  });

  it("全角拉丁字母也降为半角", () => {
    expect(normalizeAnswer("１３．３２ｃｍ²")).toBe("13.32cm2");
  });

  it("㎢ 认作平方千米，不是平方分米", () => {
    expect(compareAnswers("4㎢", "4 km²")).toBe("equal");
    expect(compareAnswers("4㎢", "4 dm²")).toBe("differ");
  });

  it("去掉空白与句末标点", () => {
    expect(normalizeAnswer(" 200 米/分 ")).toBe("200m/分");
    expect(normalizeAnswer("13.32cm²。")).toBe("13.32cm2");
  });
});

describe("答案解析", () => {
  it("拆出数值与单位", () => {
    expect(parseAnswer("13.32 cm²")).toEqual({ value: 13.32, unit: "cm2" });
  });

  it("纯文字答案没有数值", () => {
    expect(parseAnswer("km²")).toEqual({ value: null, unit: null });
  });
});

describe("答案比对", () => {
  it("数值相同但写法不同算相等", () => {
    expect(compareAnswers("13.32", "13.320")).toBe("equal");
    expect(compareAnswers("13.32 平方厘米", "13.32cm²")).toBe("equal");
    expect(compareAnswers("km²", "平方千米")).toBe("equal");
  });

  it("数值不同算不等", () => {
    expect(compareAnswers("7.92 cm²", "13.32 cm²")).toBe("differ");
  });

  it("单位不同算不等", () => {
    expect(compareAnswers("4 ha", "4 km²")).toBe("differ");
  });

  it("有一边缺失就是无法比较", () => {
    expect(compareAnswers(null, "13.32")).toBe("unknown");
    expect(compareAnswers("13.32", null)).toBe("unknown");
    expect(compareAnswers("", "13.32")).toBe("unknown");
  });

  it("容差 0.1%：13.319 与 13.32 算相等，13.30 与 13.32 算不等", () => {
    expect(compareAnswers("13.319", "13.32")).toBe("equal");
    expect(compareAnswers("13.30", "13.32")).toBe("differ");
    expect(compareAnswers("13.00", "13.32")).toBe("differ");
  });
});
