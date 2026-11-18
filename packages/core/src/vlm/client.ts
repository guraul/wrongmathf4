import { RawPage, SolverOutput, type RawQuestion } from "./parse.js";
import { TRANSCRIBE_SYSTEM, TRANSCRIBE_USER, solveSystem, solveUser } from "./prompt.js";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface VlmOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  /** 注入用：测试里换成假的 fetch，不打网络 */
  fetchImpl?: FetchLike;
  timeoutMs?: number;
  maxTokens?: number;
}

interface ChatMessage {
  role: "system" | "user";
  content: string | Array<Record<string, unknown>>;
}

/**
 * 从模型回包里抠 JSON：容忍 ```json 围栏、前后寒暄、多余空行。
 * 抠不出来就抛错——与其猜，不如让上层看见失败。
 */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : text;
  if (!body) throw new Error("模型回包为空");

  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error(`回包里找不到 JSON 对象: ${text.slice(0, 120)}`);

  return JSON.parse(body.slice(start, end + 1));
}

export class VlmClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly fetchImpl: FetchLike;
  private readonly timeoutMs: number;
  private readonly maxTokens: number;

  constructor(opts: VlmOptions) {
    this.apiKey = opts.apiKey;
    this.baseUrl = (opts.baseUrl ?? "https://api.deepseek.com").replace(/\/$/, "");
    this.model = opts.model ?? "deepseek-flash";
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 60_000;
    this.maxTokens = opts.maxTokens ?? 4_000;
  }

  private async complete(messages: ChatMessage[]): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          max_tokens: this.maxTokens,
          response_format: { type: "json_object" },
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`模型调用失败 HTTP ${res.status}: ${detail.slice(0, 200)}`);
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content;
      if (!content) throw new Error("模型回包里没有 content");
      return content;
    } finally {
      clearTimeout(timer);
    }
  }

  /** 第一轮：图片 → 题目（含学生作答与老师标记）。 */
  async transcribe(imageDataUrl: string): Promise<RawPage> {
    const text = await this.complete([
      { role: "system", content: TRANSCRIBE_SYSTEM },
      {
        role: "user",
        content: [
          { type: "text", text: TRANSCRIBE_USER },
          // detail: original 是必须的：low 会把图压到 512×512，小字全糊
          { type: "image_url", image_url: { url: imageDataUrl, detail: "original" } },
        ],
      },
    ]);

    return RawPage.parse(extractJson(text));
  }

  /** 第二轮：题干 + 图形参数 → 独立解答（不给学生答案）。 */
  async solve(questions: RawQuestion[]): Promise<Map<string, string>> {
    const answerable = questions.filter((q) => !q.subjective);
    if (answerable.length === 0) return new Map();

    const text = await this.complete([
      { role: "system", content: solveSystem() },
      { role: "user", content: solveUser(answerable) },
    ]);

    const parsed = SolverOutput.parse(extractJson(text));
    return new Map(parsed.answers.map((a) => [a.originalNo, a.answer]));
  }
}
