/**
 * 判定调试命令：跑「读图 → 识别 → 独立求解 → 三票判定」，打印 JSON 报告。
 *
 *   pnpm judge test/fixtures/2026-11-17/p1-geo5.jpg            # 需要 OPENCODE_GO_API_KEY 或 DEEPSEEK_API_KEY
 *   pnpm judge --replay /tmp/page.json --mask test/.../p1.jpg  # 离线复算，不打网络
 */
import { readFile } from "node:fs/promises";

import { loadEnv } from "../env.js";
import { prepareForModel } from "../ingest/io.js";
import { loadImage } from "../ingest/io.js";
import { redMask } from "../ingest/pixels.js";
import { clusterMask } from "../judge/cluster.js";
import { buildQuestions, wrongQuestions } from "../judge/pipeline.js";
import { RawPage } from "../vlm/parse.js";
import { VlmClient } from "../vlm/client.js";
import { resolveProvider } from "../vlm/providers.js";

function usage(): never {
  console.error("用法: judge <图片> [--mask <图片>] | judge --replay <RawPage.json> [--mask <图片>]");
  process.exit(2);
}

async function clusterCount(maskPath: string): Promise<number> {
  const img = await loadImage(maskPath);
  const { mask } = redMask(img);
  return clusterMask(mask, img.width, img.height).length;
}

const args = process.argv.slice(2);
const replayIdx = args.indexOf("--replay");
const maskIdx = args.indexOf("--mask");

const maskPath = maskIdx >= 0 ? args[maskIdx + 1] : undefined;
const positional = args.filter((_, i) => i !== replayIdx && i !== replayIdx + 1 && i !== maskIdx && i !== maskIdx + 1);

let page: RawPage;
let source: string;

if (replayIdx >= 0) {
  const file = args[replayIdx + 1];
  if (!file) usage();
  page = RawPage.parse(JSON.parse(await readFile(file, "utf8")));
  source = `replay:${file}`;
} else {
  const imagePath = positional[0];
  if (!imagePath) usage();

  loadEnv();
  const resolved = resolveProvider();
  if (!resolved.ok) {
    console.error(`${resolved.reason}；离线复算请用 --replay <RawPage.json>`);
    process.exit(2);
  }

  const prepared = await prepareForModel(imagePath);
  const dataUrl = `data:image/png;base64,${prepared.buffer.toString("base64")}`;
  const client = new VlmClient({
    apiKey: resolved.value.apiKey,
    provider: resolved.value.preset.id,
    // 调试用：指向自建代理或临时端点
    ...(process.env.WM_ENDPOINT ? { endpoint: process.env.WM_ENDPOINT } : {}),
  });

  page = await client.transcribe(dataUrl);
  const solver = await client.solve(page.questions);

  const foundClusters = maskPath ? await clusterCount(maskPath) : 0;
  const { questions, claimedMarks } = buildQuestions({ page, solver, foundClusters });

  console.log(
    JSON.stringify(
      {
        source: imagePath,
        image: { width: prepared.width, height: prepared.height },
        claimedMarks,
        foundClusters,
        total: questions.length,
        wrong: wrongQuestions(questions).map((q) => ({
          originalNo: q.originalNo,
          kind: q.kind,
          verdict: q.verdict,
          confidence: q.confidence,
          evidence: q.evidence,
        })),
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

// replay 分支：没有学生作答以外的外部输入，簇数按 --mask 给，缺省 0（不做对账）
const foundClusters = maskPath ? await clusterCount(maskPath) : 0;
const { questions, claimedMarks } = buildQuestions({ page, solver: new Map(), foundClusters });

console.log(
  JSON.stringify(
    {
      source,
      claimedMarks,
      foundClusters,
      total: questions.length,
      verdicts: questions.map((q) => ({
        originalNo: q.originalNo,
        kind: q.kind,
        teacherMark: q.teacherMark,
        verdict: q.verdict,
        confidence: q.confidence,
      })),
    },
    null,
    2,
  ),
);
