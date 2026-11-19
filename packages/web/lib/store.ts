import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type Status = "queued" | "processing" | "done" | "failed";

export interface PageRecord {
  /** 保存后的文件名 */
  file: string;
  /** 用户上传时的原始文件名，展示用 */
  name: string;
  status: Status;
  wrong: number;
  questions: number;
  error?: string;
}

import type { Question } from "@wrongmath/core";

export type WrongItem = Question;

export interface BatchRecord {
  id: string;
  createdAt: string;
  status: Status;
  pages: PageRecord[];
  wrong: WrongItem[];
  /** 处理日志，前端直接显示，省得猜"卡在哪了" */
  log: string[];
  error?: string;
}

/** 仓库根：从 cwd 往上找 pnpm-workspace.yaml；找不到就用 cwd */
export function repoRoot(start = process.cwd()): string {
  let dir = start;
  for (let i = 0; i < 6; i++) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

export function dataDir(): string {
  return process.env.WRONGMATH_DATA_DIR ?? join(repoRoot(), "data");
}

const BATCH_ID = /^[\w-]{1,64}$/;

/**
 * 批次 id 会直接进文件路径，必须先过白名单。
 * 不校验的话，路由参数里编码的 ../ 能拼出 data/batches 之外的路径。
 */
export function assertBatchId(id: string): string {
  if (!BATCH_ID.test(id)) throw new Error(`非法批次 id: ${id}`);
  return id;
}

export function batchDir(id: string): string {
  return join(dataDir(), "batches", assertBatchId(id));
}

function recordPath(id: string): string {
  return join(batchDir(id), "batch.json");
}

export async function createBatch(files: Array<{ name: string; buffer: Buffer }>): Promise<BatchRecord> {
  const id = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14) + "-" + Math.random().toString(36).slice(2, 6);
  const dir = batchDir(id);

  await mkdir(join(dir, "images"), { recursive: true });

  const pages: PageRecord[] = [];
  for (const [index, file] of files.entries()) {
    const safe = `${String(index + 1).padStart(2, "0")}-${file.name.replace(/[^\w.\-\u4e00-\u9fa5]/g, "_")}`;
    await writeFile(join(dir, "images", safe), file.buffer);
    pages.push({ file: safe, name: file.name, status: "queued", wrong: 0, questions: 0 });
  }

  const record: BatchRecord = {
    id,
    createdAt: new Date().toISOString(),
    status: "queued",
    pages,
    wrong: [],
    log: [`创建批次，共 ${pages.length} 页`],
  };

  await saveBatch(record);
  return record;
}

export async function saveBatch(record: BatchRecord): Promise<void> {
  await mkdir(batchDir(record.id), { recursive: true });
  // 临时文件 + rename：worker 写得频繁，前端又在轮询，不能让它读到半截 JSON
  const target = recordPath(record.id);
  const temp = `${target}.tmp`;
  await writeFile(temp, JSON.stringify(record, null, 2), "utf8");
  await rename(temp, target);
}

export async function getBatch(id: string): Promise<BatchRecord | null> {
  try {
    return JSON.parse(await readFile(recordPath(id), "utf8")) as BatchRecord;
  } catch {
    return null;
  }
}

export async function listBatches(): Promise<BatchRecord[]> {
  const root = join(dataDir(), "batches");
  if (!existsSync(root)) return [];

  const ids = await readdir(root);
  const all = await Promise.all(ids.map((id) => getBatch(id)));
  return all
    .filter((b): b is BatchRecord => b !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function writeWorksheet(id: string, html: string): Promise<string> {
  const path = join(batchDir(id), "worksheet.html");
  await writeFile(path, html, "utf8");
  return path;
}

export function worksheetPath(id: string): string {
  return join(batchDir(id), "worksheet.html");
}
