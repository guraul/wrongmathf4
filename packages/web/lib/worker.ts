import { join } from "node:path";

import { VlmClient } from "@wrongmath/core";
import { loadEnv } from "@wrongmath/core/env";
import { renderBatch, runPage } from "@wrongmath/core/pipeline";
import { resolveProvider } from "@wrongmath/core";

import { batchDir, getBatch, repoRoot, saveBatch, writeWorksheet, type BatchRecord } from "./store";

/**
 * 进程内串行队列。
 *
 * 一页要 5–9 分钟，并发只会互相拖慢；模型额度也顶不住。
 * 队列放在模块作用域，Next 的 dev 热重载会重建模块，所以用 globalThis 兜一层。
 */

interface QueueState {
  pending: string[];
  running: boolean;
}

const globalForQueue = globalThis as unknown as { __wrongmathQueue?: QueueState };
const state: QueueState = (globalForQueue.__wrongmathQueue ??= { pending: [], running: false });

export function enqueue(batchId: string): void {
  state.pending.push(batchId);
  void pump();
}

async function pump(): Promise<void> {
  if (state.running) return;
  state.running = true;

  try {
    while (state.pending.length > 0) {
      const id = state.pending.shift();
      if (id === undefined) break;
      await processBatch(id).catch(async (error: unknown) => {
        const record = await getBatch(id);
        if (record === null) return;
        record.status = "failed";
        record.error = error instanceof Error ? error.message : String(error);
        record.log.push(`批次失败：${record.error}`);
        await saveBatch(record);
      });
    }
  } finally {
    state.running = false;
  }
}

function push(record: BatchRecord, message: string): void {
  record.log.push(`${new Date().toLocaleTimeString("zh-CN", { hour12: false })} ${message}`);
}

async function processBatch(id: string): Promise<void> {
  const record = await getBatch(id);
  if (record === null) return;

  // Next 的 cwd 是 packages/web，.env 在仓库根
  loadEnv(join(repoRoot(), ".env"));

  const resolved = resolveProvider();
  if (!resolved.ok) {
    record.status = "failed";
    record.error = resolved.reason;
    push(record, resolved.reason);
    await saveBatch(record);
    return;
  }

  const client = new VlmClient({
    apiKey: resolved.value.apiKey,
    provider: resolved.value.preset.id,
    maxTokens: 32_000,
    timeoutMs: 300_000,
  });

  record.status = "processing";
  push(record, `使用 ${resolved.value.preset.label}（${resolved.value.preset.model}）`);
  await saveBatch(record);

  const allWrong: BatchRecord["wrong"] = [];

  for (const [index, page] of record.pages.entries()) {
    page.status = "processing";
    push(record, `第 ${index + 1}/${record.pages.length} 页开始处理：${page.name}`);
    await saveBatch(record);

    try {
      const questions = await runPage(join(batchDir(id), "images", page.file), client, {
        onProgress: (message) => push(record, `  页 ${index + 1}：${message}`),
      });

      page.status = "done";
      page.questions = questions.length;

      for (const q of questions) {
        if (q.verdict !== "wrong") continue;
        page.wrong += 1;
        allWrong.push(q);
      }

      push(record, `  页 ${index + 1} 完成：${questions.length} 题，其中 ${page.wrong} 道错题`);
    } catch (error) {
      page.status = "failed";
      page.error = error instanceof Error ? error.message : String(error);
      push(record, `  页 ${index + 1} 失败：${page.error}`);
    }

    await saveBatch(record);
  }

  record.wrong = allWrong;

  const donePages = record.pages.filter((p) => p.status === "done").length;
  if (donePages === 0) {
    record.status = "failed";
    record.error = "所有页面都处理失败";
    push(record, record.error);
  } else {
    const html = renderBatch(allWrong, { subtitle: new Date().toISOString().slice(0, 10) });

    await writeWorksheet(id, html);
    record.status = "done";
    push(record, `批次完成：${donePages} 页，${allWrong.length} 道错题`);
  }

  await saveBatch(record);
}
