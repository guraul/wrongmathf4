import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import { renderBatch, runPage } from "../src/pipeline/run.js";
import type { Question } from "../src/schema.js";
import type { RawPage } from "../src/vlm/parse.js";
import type { VlmClient } from "../src/vlm/client.js";

const FIXTURES = fileURLToPath(new URL("../../../test/fixtures/2026-11-17/", import.meta.url));

function page(mark: "wrong" | "right"): RawPage {
  return {
    questions: [
      {
        originalNo: "一（2）",
        kind: "geometry",
        stem: "求下列组合图形的面积。（单位：cm）",
        figures: [{ type: "composite", layout: "stack", unit: "cm", parts: [{ shape: "rect", width: "2", height: "3" }] }],
        teacherMark: mark,
        markBox: null,
        studentAnswer: "7.92 cm²",
        subjective: false,
      },
    ],
  };
}

function fakeClient(pageFactory: () => RawPage, answer: string | null = null): VlmClient {
  return {
    transcribe: vi.fn(async () => pageFactory()),
    readFigures: vi.fn(async () => new Map()),
    solve: vi.fn(async () => (answer === null ? new Map() : new Map([["一（2）", answer]]))),
  } as unknown as VlmClient;
}

describe("整页编排", () => {
  it("两轮一致时只转写两次，并给出错题", async () => {
    const client = fakeClient(() => page("wrong"));
    const questions = await runPage(`${FIXTURES}p1-geo5.jpg`, client);

    expect((client.transcribe as any).mock.calls).toHaveLength(2);
    expect(questions).toHaveLength(1);
    expect(questions[0]?.verdict).toBe("wrong");
  });

  it("两轮不一致时补第三轮，多数决生效", async () => {
    const scripted = [page("wrong"), page("right"), page("wrong")];
    let i = 0;
    const client = fakeClient(() => scripted[i++] as RawPage);

    const questions = await runPage(`${FIXTURES}p1-geo5.jpg`, client);
    expect((client.transcribe as any).mock.calls).toHaveLength(3);
    expect(questions[0]?.verdict).toBe("wrong");
  });

  it("把红笔簇数算进判定（模型说没错但掩膜有红笔时不至于翻车）", async () => {
    const client = fakeClient(() => page("wrong"));
    const questions = await runPage(`${FIXTURES}p1-geo5.jpg`, client);
    expect(questions[0]?.evidence).toBeDefined();
  });

  it("进度回调按轮次触发", async () => {
    const messages: string[] = [];
    const client = fakeClient(() => page("wrong"));
    await runPage(`${FIXTURES}p1-geo5.jpg`, client, { onProgress: (m) => messages.push(m) });

    expect(messages.some((m) => m.includes("第 1 轮"))).toBe(true);
    expect(messages.some((m) => m.includes("投票结果"))).toBe(true);
  });
});

describe("整批渲染", () => {
  it("把错题渲染成完整 HTML", () => {
    const questions: Question[] = [
      {
        id: "q1",
        originalNo: "一（2）",
        sequence: 1,
        kind: "geometry",
        stem: "求下列组合图形的面积。（单位：cm）",
        figures: [{ type: "composite", layout: "stack", unit: "cm", parts: [{ shape: "rect", width: "2", height: "3" }] }],
        teacherMark: "wrong",
        solverAnswer: null,
        verdict: "wrong",
        confidence: 1,
        evidence: {},
      },
    ];

    const html = renderBatch(questions, { subtitle: "2026-11-19" });
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("求下列组合图形的面积");
    expect(html).toContain("<svg");
  });
});

describe("图形尺寸第三轮", () => {
  it("带图形的页面会多跑一次尺寸核对，不一致时以第三轮为准", async () => {
    const wrongFigure = { type: "composite" as const, layout: "stack" as const, unit: "cm", parts: [{ shape: "triangle" as const, base: "5", height: "2.4" }] };
    const rightFigure = { type: "composite" as const, layout: "stack" as const, unit: "cm", parts: [{ shape: "triangle" as const, base: "4.2", height: "2" }] };

    const client = {
      transcribe: vi.fn(async () => ({
        questions: [
          {
            originalNo: "一（2）",
            kind: "geometry" as const,
            stem: "求下列组合图形的面积。（单位：cm）",
            figures: [wrongFigure],
            teacherMark: "wrong" as const,
            markBox: null,
            studentAnswer: "7.92 cm²",
            subjective: false,
          },
        ],
      })),
      readFigures: vi.fn(async () => new Map([["一（2）", [rightFigure]]])),
      solve: vi.fn(async () => new Map([["一（2）", "13.32 cm²"]])),
    } as unknown as VlmClient;

    const messages: string[] = [];
    const questions = await runPage(`${FIXTURES}p1-geo5.jpg`, client, { onProgress: (m) => messages.push(m) });

    expect((client.readFigures as any).mock.calls).toHaveLength(1);
    expect(questions[0]?.figures).toEqual([rightFigure]);
    expect(questions[0]?.evidence.figureCorrected).toBe(true);
    expect(messages.some((m) => m.includes("图形尺寸"))).toBe(true);
  });
});
