import { RawPage, SolverOutput, type RawQuestion } from "./parse.js";
import { PROVIDERS, type ProviderId } from "./providers.js";
import { TRANSCRIBE_SYSTEM, TRANSCRIBE_USER, solveSystem, solveUser } from "./prompt.js";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface VlmOptions {
  apiKey: string;
  /** 提供方预设；默认 opencode go */
  provider?: ProviderId;
  /** 覆盖预设里的完整端点 */
  endpoint?: string;
  /** 覆盖预设里的模型 id */
  model?: string;
  /** 覆盖 x-opencode-session（opencode go 必填头） */
  sessionId?: string;
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

/** 把各家的错误体压成一行：opencode go 是 {"error":{"message":...}}，DeepSeek 是 {"error":{"message":...}} 或纯文本 */
function explainError(body: string): string {
  try {
    const parsed = JSON.parse(body) as { error?: { message?: string; type?: string } };
    const message = parsed.error?.message;
    if (typeof message === "string") return message;
  } catch {
    // 不是 JSON，原样截断
  }
  return body.slice(0, 200);
}

export class VlmClient {
  private readonly apiKey: string;
  readonly endpoint: string;
  readonly model: string;
  readonly headers: Record<string, string>;
  readonly jsonMode: boolean;
  private readonly fetchImpl: FetchLike;
  readonly timeoutMs: number;
  readonly maxTokens: number;

  constructor(opts: VlmOptions) {
    const preset = PROVIDERS[opts.provider ?? "opencode-go"];

    this.apiKey = opts.apiKey;
    this.endpoint = opts.endpoint ?? preset.endpoint;
    this.model = opts.model ?? preset.model;
    this.headers = { ...preset.headers };
    // session 头只有 opencode go 认，别的提供方就算传了也不加
    if (opts.sessionId !== undefined && "x-opencode-session" in this.headers) {
      this.headers["x-opencode-session"] = opts.sessionId;
    }
    this.jsonMode = preset.jsonMode;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    // 真机实测：整卷转写单次 110–175 秒，推理稳定占 1 万 tokens 上下，
    // 16000 时正文会被挤到截断，32000 才能稳定拿到完整 JSON
    this.timeoutMs = opts.timeoutMs ?? 300_000;
    this.maxTokens = opts.maxTokens ?? 32_000;
  }

  private async complete(messages: ChatMessage[]): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const res = await this.fetchImpl(this.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
          ...this.headers,
        },
        body: JSON.stringify({
          model: this.model,
          messages,
          max_tokens: this.maxTokens,
          ...(this.jsonMode ? { response_format: { type: "json_object" } } : {}),
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`模型调用失败 HTTP ${res.status}（${this.model}）: ${explainError(detail)}`);
      }

      const data = (await res.json()) as {
        choices?: Array<{
          finish_reason?: string;
          message?: { content?: string; reasoning_content?: string };
        }>;
        usage?: { completion_tokens_details?: { reasoning_tokens?: number } };
      };

      const choice = data.choices?.[0];
      const content = choice?.message?.content;

      // 截断优先于"有没有正文"：半截 JSON 比空回包更难查
      if (choice?.finish_reason === "length") {
        const reasoningTokens = data.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
        throw new Error(
          `输出被截断（finish_reason=length，推理 ${reasoningTokens} tokens，` +
            `正文 ${content?.length ?? 0} 字，max_tokens=${this.maxTokens}）。需要调大 max_tokens。`,
        );
      }

      if (!content) {
        // 这个模型会把预算大头花在 reasoning_content 上：finish_reason=length 且 content 为空
        // 就是"推理没写完、正文还没来得及出"，不是接口坏了
        const reasoning = choice?.message?.reasoning_content?.length ?? 0;
        const reasoningTokens = data.usage?.completion_tokens_details?.reasoning_tokens ?? 0;
        throw new Error(
          `模型没有返回正文（finish_reason=${choice?.finish_reason ?? "未知"}，` +
            `推理 ${reasoningTokens} tokens / ${reasoning} 字，max_tokens=${this.maxTokens}）。` +
            `如果是 length，说明推理占满了预算，需要调大 max_tokens。`,
        );
      }

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
