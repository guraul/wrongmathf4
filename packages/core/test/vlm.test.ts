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
  it("默认走 opencode go：端点、模型与 session 头都对", () => {
    const fetchImpl = fakeFetch(JSON.stringify({ questions: [{ originalNo: "1", kind: "fill", stem: "x", teacherMark: "none" }] }));
    const client = new VlmClient({ apiKey: "k", fetchImpl });

    expect(client.endpoint).toBe("https://opencode.ai/inference/go/openai/v1/chat/completions");
    expect(client.model).toBe("deepseek-v4.1-flash");
    expect(client.headers["x-opencode-session"]).toBe("wrongmath-local");

    void client.transcribe("data:image/png;base64,AAA");
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)["x-opencode-session"]).toBe("wrongmath-local");
  });

  it("只有 DeepSeek 才发 response_format，opencode go 不发", async () => {
    const body = JSON.stringify({
      questions: [{ originalNo: "1", kind: "fill", stem: "x", teacherMark: "none" }],
    });

    const go = fakeFetch(body);
    await new VlmClient({ apiKey: "k", fetchImpl: go }).transcribe("data:image/png;base64,AAA");
    const goBody = JSON.parse(String((go.mock.calls[0]?.[1] as RequestInit).body));
    expect(goBody.response_format).toBeUndefined();

    const ds = fakeFetch(body);
    await new VlmClient({ apiKey: "k", provider: "deepseek", fetchImpl: ds }).transcribe("data:image/png;base64,AAA");
    const dsBody = JSON.parse(String((ds.mock.calls[0]?.[1] as RequestInit).body));
    expect(dsBody.response_format).toEqual({ type: "json_object" });
  });

  it("deepseek 路径不吃 opencode 的 session 头", () => {
    const client = new VlmClient({
      apiKey: "k",
      provider: "deepseek",
      sessionId: "should-be-ignored",
      fetchImpl: fakeFetch("{}"),
    });
    expect(client.headers["x-opencode-session"]).toBeUndefined();
  });

  it("切到 deepseek 官方时不带 session 头", () => {
    const client = new VlmClient({ apiKey: "k", provider: "deepseek", fetchImpl: fakeFetch("{}") });
    expect(client.endpoint).toBe("https://api.deepseek.com/chat/completions");
    expect(client.model).toBe("deepseek-flash");
    expect(client.headers["x-opencode-session"]).toBeUndefined();
  });

  it("错误体里的 message 会被提取出来", async () => {
    const fetchImpl = vi.fn(async (_input: string, _init?: RequestInit) =>
      new Response(JSON.stringify({ error: { type: "authentication_error", message: "Invalid credential" } }), {
        status: 401,
      }),
    );
    const client = new VlmClient({ apiKey: "k", fetchImpl });
    await expect(client.transcribe("data:image/png;base64,AAA")).rejects.toThrow(/Invalid credential/);
  });

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
