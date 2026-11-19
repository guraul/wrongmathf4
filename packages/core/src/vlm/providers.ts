/**
 * 模型提供方预设。
 *
 * 端点、模型 id、取哪个环境变量，全部集中在这里——换提供方只改这张表，不动调用代码。
 * opencode go 的 `x-opencode-session` 是必填头（缺了直接 400 MissingSessionID），
 * 所以它挂在预设里，不给调用方漏掉的机会。
 */

export type ProviderId = "opencode-go" | "deepseek";

export interface ProviderPreset {
  id: ProviderId;
  label: string;
  /** 完整端点，不是 base url —— 两个提供方的路径不一样 */
  endpoint: string;
  model: string;
  /** 按顺序找第一个非空的环境变量 */
  apiKeyEnv: string[];
  /** 固定附加的请求头 */
  headers: Record<string, string>;
}

export const PROVIDERS: Record<ProviderId, ProviderPreset> = {
  "opencode-go": {
    id: "opencode-go",
    label: "OpenCode Go",
    endpoint: "https://opencode.ai/inference/go/openai/v1/chat/completions",
    model: "deepseek-v4.1-flash",
    apiKeyEnv: ["OPENCODE_GO_API_KEY", "OPENCODE_API_KEY"],
    headers: { "x-opencode-session": "wrongmath-local" },
  },
  deepseek: {
    id: "deepseek",
    label: "DeepSeek 官方",
    endpoint: "https://api.deepseek.com/chat/completions",
    model: "deepseek-flash",
    apiKeyEnv: ["DEEPSEEK_API_KEY"],
    headers: {},
  },
};

export interface ResolvedProvider {
  preset: ProviderPreset;
  apiKey: string;
  /** 实际使用的 key 环境变量名，便于报错和排查 */
  apiKeyEnv: string;
}

export type ResolveResult = { ok: true; value: ResolvedProvider } | { ok: false; reason: string };

function firstKey(env: NodeJS.ProcessEnv, names: string[]): { name: string; value: string } | null {
  for (const name of names) {
    const value = env[name];
    if (typeof value === "string" && value.trim() !== "") return { name, value: value.trim() };
  }
  return null;
}

/**
 * 选择提供方：
 * 1. `WM_PROVIDER` 指定了就用它（无效值直接报错，不静默回退）
 * 2. 否则按预设顺序找第一个配了 key 的
 * 3. 都没有就报错，并把候选变量名列出来
 */
export function resolveProvider(env: NodeJS.ProcessEnv = process.env): ResolveResult {
  const forced = env.WM_PROVIDER?.trim();
  if (forced !== undefined && forced !== "") {
    if (!(forced in PROVIDERS)) {
      return {
        ok: false,
        reason: `WM_PROVIDER=${forced} 不是已知提供方，可选：${Object.keys(PROVIDERS).join(" / ")}`,
      };
    }
    const preset = PROVIDERS[forced as ProviderId];
    const key = firstKey(env, preset.apiKeyEnv);
    if (key === null) {
      return {
        ok: false,
        reason: `WM_PROVIDER=${forced} 需要环境变量 ${preset.apiKeyEnv.join(" 或 ")}，当前未设置`,
      };
    }
    return { ok: true, value: { preset, apiKey: key.value, apiKeyEnv: key.name } };
  }

  for (const preset of Object.values(PROVIDERS)) {
    const key = firstKey(env, preset.apiKeyEnv);
    if (key !== null) return { ok: true, value: { preset, apiKey: key.value, apiKeyEnv: key.name } };
  }

  const candidates = Object.values(PROVIDERS)
    .flatMap((p) => p.apiKeyEnv)
    .join(" / ");
  return { ok: false, reason: `没有可用的模型 key：请在 .env 里设置 ${candidates} 之一，或用 WM_PROVIDER 指定提供方` };
}
