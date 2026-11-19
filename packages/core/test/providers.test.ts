import { describe, expect, it } from "vitest";

import { resolveProvider } from "../src/vlm/providers.js";

const empty: NodeJS.ProcessEnv = {};

describe("提供方选择", () => {
  it("只有 opencode go 的 key 时选它", () => {
    const r = resolveProvider({ OPENCODE_GO_API_KEY: "go-key" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.preset.id).toBe("opencode-go");
      expect(r.value.preset.model).toBe("deepseek-v4.1-flash");
      expect(r.value.preset.endpoint).toContain("/inference/go/");
      expect(r.value.apiKeyEnv).toBe("OPENCODE_GO_API_KEY");
    }
  });

  it("两个 key 都在时优先 opencode go", () => {
    const r = resolveProvider({ OPENCODE_GO_API_KEY: "go-key", DEEPSEEK_API_KEY: "ds-key" });
    expect(r.ok && r.value.preset.id).toBe("opencode-go");
  });

  it("只有 DeepSeek key 时回落到官方接口", () => {
    const r = resolveProvider({ DEEPSEEK_API_KEY: "ds-key" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.preset.id).toBe("deepseek");
      expect(r.value.preset.endpoint).toBe("https://api.deepseek.com/chat/completions");
      expect(r.value.preset.model).toBe("deepseek-flash");
    }
  });

  it("WM_PROVIDER 可以强制指定", () => {
    const r = resolveProvider({ WM_PROVIDER: "deepseek", DEEPSEEK_API_KEY: "ds-key" });
    expect(r.ok && r.value.preset.id).toBe("deepseek");
  });

  it("强制指定的提供方缺 key 时报错，不静默回退", () => {
    const r = resolveProvider({ WM_PROVIDER: "deepseek", OPENCODE_GO_API_KEY: "go-key" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("DEEPSEEK_API_KEY");
  });

  it("WM_PROVIDER 写了不存在的名字直接报错", () => {
    const r = resolveProvider({ WM_PROVIDER: "zen" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("opencode-go");
  });

  it("一个 key 都没有时列出候选变量", () => {
    const r = resolveProvider(empty);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toContain("OPENCODE_GO_API_KEY");
      expect(r.reason).toContain("DEEPSEEK_API_KEY");
    }
  });
});
