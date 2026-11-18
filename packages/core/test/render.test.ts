import { describe, expect, it } from "vitest";

import { escapeHtml, renderWorksheet } from "../src/render/html.js";
import { Question } from "../src/schema.js";

const wrongQuestion = Question.parse({
  id: "q1",
  originalNo: "一（2）",
  sequence: 1,
  kind: "geometry",
  stem: "求下列组合图形的面积。（单位：cm）",
  figures: [
    {
      type: "composite",
      layout: "stack",
      parts: [{ shape: "triangle", base: "4.2", height: "2" }],
    },
  ],
  teacherMark: "wrong",
  solverAnswer: "13.32 cm²",
  verdict: "wrong",
  confidence: 1,
  evidence: { reason: "老师标记 ✗" },
});

const rightQuestion = Question.parse({
  ...wrongQuestion,
  id: "q2",
  originalNo: "二.1",
  sequence: 2,
  kind: "unitFill",
  stem: "顾村公园的占地面积约为 4（　）。",
  figures: [],
  teacherMark: "right",
  studentAnswer: null,
  verdict: "right",
  confidence: 1,
});

describe("复刻卷渲染", () => {
  const html = renderWorksheet([wrongQuestion, rightQuestion], { subtitle: "2026-11-18" });

  it("输出完整 HTML 文档", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<meta charset=\"utf-8\">");
    expect(html.trimEnd().endsWith("</html>")).toBe(true);
  });

  it("按顺序重新编号，不印原卷题号", () => {
    expect(html).toContain('<span class="no">1.</span>');
    expect(html).toContain('<span class="no">2.</span>');
    expect(html).not.toContain("一（2）");
  });

  it("不泄露任何判定痕迹", () => {
    expect(html).not.toContain("wrong");
    expect(html).not.toContain("7.92");
    expect(html).not.toContain("confidence");
    expect(html).not.toContain("teacherMark");
    expect(html).not.toContain("verdict");
  });

  it("题干文本保留，图形走占位框", () => {
    expect(html).toContain("求下列组合图形的面积");
    expect(html).toContain('class="figure figure-placeholder"');
    expect(html).toContain('data-type="composite"');
  });

  it("题数写进副标题区", () => {
    expect(html).toContain("共 2 题 · 2026-11-18");
  });

  it("同一输入两次渲染字节相同", () => {
    expect(renderWorksheet([wrongQuestion, rightQuestion], { subtitle: "2026-11-18" })).toBe(html);
  });

  it("空题目列表直接报错", () => {
    expect(() => renderWorksheet([])).toThrow();
  });

  it("可以注入自定义图形渲染器", () => {
    const custom = renderWorksheet([wrongQuestion], { figureRenderer: () => "<svg data-x></svg>" });
    expect(custom).toContain("<svg data-x></svg>");
    // 占位框的 DOM 不该出现（CSS 里仍有这个类名，不能直接搜字符串）
    expect(custom).not.toContain('class="figure figure-placeholder"');
  });
});

describe("转义", () => {
  it("题干里的标签被转义", () => {
    const evil = Question.parse({ ...wrongQuestion, stem: '面积 <script>alert(1)</script> & "引号"' });
    const html = renderWorksheet([evil]);
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&amp;");
  });

  it("escapeHtml 覆盖五个字符", () => {
    expect(escapeHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;");
  });
});
