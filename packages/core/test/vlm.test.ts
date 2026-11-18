import { describe, expect, it, vi } from "vitest";

import { extractJson, VlmClient } from "../src/vlm/client.js";

describe("回包解析", () => {
  it("能剥掉 ```json 围栏", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("能跳过前后寒暄", () => {
    expect(extractJson('好的，结果如下：{"a":2} 希望有帮助')).toEqual({ a: 2 });
  });

  it("没有 JSON 就抛错", () => {
    expect(() => extractJson("抱歉，我看不清这张图")).toThrow();
  });
});

function fakeFetch(content: string) {
  return vi.fn(async (_input: string, _init?: RequestInit) =>
    new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function requestBody(fetchImpl: ReturnType<typeof fakeFetch>): Record<string, any> {
  const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
  return JSON.parse(String(init.body));
}

describe("模型客户端", () => {
  it("转写时把图放进 user 消息，并要求 original 细节", async () => {
    const fetchImpl = fakeFetch(
      JSON.stringify({
        questions: [
          {
            originalNo: "二.1",
            kind: "unitFill",
            stem: "顾村公园的占地面积约为 4（　）。",
            teacherMark: "wrong",
            studentAnswer: "ha",
          },
        ],
      }),
    );

    const client = new VlmClient({ apiKey: "test-key", fetchImpl });
    const page = await client.transcribe("data:image/png;base64,AAA");

    expect(page.questions).toHaveLength(1);
    const body = requestBody(fetchImpl);
    const userContent = body.messages[1].content as Array<Record<string, unknown>>;
    const image = userContent.find((c) => c.type === "image_url");
    expect((image?.image_url as { detail: string }).detail).toBe("original");
  });

  it("解题时不给学生答案", async () => {
    const fetchImpl = fakeFetch(JSON.stringify({ answers: [{ originalNo: "二.1", answer: "km²" }] }));
    const client = new VlmClient({ apiKey: "test-key", fetchImpl });

    const answers = await client.solve([
      {
        originalNo: "二.1",
        kind: "unitFill",
        stem: "顾村公园的占地面积约为 4（　）。",
        figures: [],
        teacherMark: "wrong",
        studentAnswer: "ha",
        subjective: false,
      },
    ]);

    expect(answers.get("二.1")).toBe("km²");
    const body = requestBody(fetchImpl);
    const prompt = String(body.messages[1].content);
    expect(prompt).not.toContain("ha");
  });

  it("HTTP 失败时抛错且不泄露密钥", async () => {
    const fetchImpl = vi.fn(async (_input: string, _init?: RequestInit) =>
      new Response("unauthorized", { status: 401 }),
    );
    const client = new VlmClient({ apiKey: "sk-secret-value", fetchImpl });

    await expect(client.transcribe("data:image/png;base64,AAA")).rejects.toThrow(/HTTP 401/);
    await expect(client.transcribe("data:image/png;base64,AAA")).rejects.not.toThrow(/sk-secret-value/);
  });
});
