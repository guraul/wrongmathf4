import { describe, expect, it } from "vitest";

import { applyClusterAgreement, decide } from "../src/judge/verdict.js";

const base = {
  teacherMark: "none" as const,
  subjective: false,
  studentAnswer: null as string | null,
  solverAnswer: null as string | null,
  rules: [] as Array<{ ok: boolean; reason?: string }>,
};

describe("三票收敛", () => {
  it("老师打叉就是错，不管算得对不对", () => {
    const r = decide({ ...base, teacherMark: "wrong", studentAnswer: "13.32", solverAnswer: "13.32" });
    expect(r.verdict).toBe("wrong");
    expect(r.confidence).toBe(1);
  });

  it("老师打勾就是对，规则票不推翻", () => {
    const r = decide({
      ...base,
      teacherMark: "right",
      rules: [{ ok: false, reason: "竖式不自洽" }],
    });
    expect(r.verdict).toBe("right");
    expect(r.evidence.suspicious).toBeDefined();
  });

  it("没标记且求解没答案 → unknown", () => {
    expect(decide(base).verdict).toBe("unknown");
  });

  it("没标记，求解与作答一致 → right", () => {
    const r = decide({ ...base, studentAnswer: "13.32", solverAnswer: "13.32 cm²" });
    expect(r.verdict).toBe("right");
    expect(r.confidence).toBeCloseTo(0.85);
  });

  it("黑笔卷（禁用求解兜底）没标记 + 求解不一致 → unknown", () => {
    const r = decide({
      ...base,
      studentAnswer: "7.92",
      solverAnswer: "13.32",
      canPromoteBySolver: false,
    });
    expect(r.verdict).toBe("unknown");
    // 曾经这里补判为 wrong：2026-11-21 真机上红笔复核失效后题题落到这条分支，
    // 转录噪声被当成错因，一页报了 14 道错题。改为只记录、不判错。
    expect(String(r.evidence.reason)).toContain("不据此判错");
  });

  it("没标记但规则校验失败 → wrong", () => {
    const r = decide({
      ...base,
      studentAnswer: "999",
      solverAnswer: "999",
      rules: [{ ok: false, reason: "被除数不符" }],
    });
    expect(r.verdict).toBe("wrong");
    expect(r.confidence).toBeCloseTo(0.9);
  });

  it("主观题一律 unknown", () => {
    const r = decide({ ...base, subjective: true, teacherMark: "wrong" });
    expect(r.verdict).toBe("unknown");
    expect(r.confidence).toBe(0);
  });
});

describe("掩膜对账", () => {
  it("都认为有红笔时置信度不变（数量不同不影响）", () => {
    const r = decide({ ...base, teacherMark: "wrong" });
    expect(applyClusterAgreement(r, 2, 23).confidence).toBe(r.confidence);
  });

  it("都认为没有红笔时也不变", () => {
    const r = decide({ ...base, teacherMark: "none" });
    expect(applyClusterAgreement(r, 0, 0).confidence).toBe(r.confidence);
  });

  it("模型说有标记但掩膜没找到 → 降置信并留痕", () => {
    const r = decide({ ...base, teacherMark: "wrong" });
    const adjusted = applyClusterAgreement(r, 1, 0);
    expect(adjusted.confidence).toBeLessThan(r.confidence);
    expect(adjusted.verdict).toBe("wrong");
    expect(adjusted.evidence.presenceMismatch).toEqual({ claimedMarks: 1, foundClusters: 0 });
  });
});
