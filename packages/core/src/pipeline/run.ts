import { prepareForModel } from "../ingest/io.js";
import { loadImage } from "../ingest/io.js";
import { redMask } from "../ingest/pixels.js";
import { clusterMask } from "../judge/cluster.js";
import { transcribeWithConsensus } from "../judge/consensus.js";
import { buildQuestions } from "../judge/pipeline.js";
import { repairStems } from "../judge/stem.js";
import { renderWorksheet, type RenderOptions } from "../render/html.js";
import type { Question } from "../schema.js";
import type { VlmClient } from "../vlm/client.js";

/**
 * 一页的完整链路：预处理 → 两轮投票转写 → 独立求解 → 三票判定。
 * Web 与 CLI 共用这一份，避免两边判断口径漂移。
 */

export interface RunPageOptions {
  /** 进度回调，写日 visible 日志用 */
  onProgress?: (message: string) => void;
}

export async function runPage(
  imagePath: string,
  client: VlmClient,
  opts: RunPageOptions = {},
): Promise<Question[]> {
  const prepared = await prepareForModel(imagePath);
  const dataUrl = `data:image/png;base64,${prepared.buffer.toString("base64")}`;

  const consensus = await transcribeWithConsensus(() => client.transcribe(dataUrl), {
    onRun: (index, page) => opts.onProgress?.(`第 ${index} 轮转写：${page.questions.length} 题`),
  });
  const repaired = repairStems(consensus.page);
  if (repaired.inherited.length > 0) {
    opts.onProgress?.(`${repaired.inherited.length} 道题沿用了大题公共题干`);
  }
  opts.onProgress?.(`采用 ${consensus.runs} 轮投票结果，共 ${repaired.page.questions.length} 题`);

  const solver = await client.solve(repaired.page.questions);

  // 红笔簇数从掩膜真算：模型说有标记、掩膜一个红像素都没有时要降置信
  const img = await loadImage(imagePath);
  const foundClusters = clusterMask(redMask(img).mask, img.width, img.height).length;

  const { questions } = buildQuestions({ page: repaired.page, solver, foundClusters });

  // 把投票与补题的来龙去脉记进 evidence，排查「为什么这题被判 none」时有据可查
  return questions.map((q, index) => {
    const verdict = consensus.votes[index];
    const evidence: Record<string, unknown> = { ...q.evidence };
    if (verdict !== undefined && verdict.votes.includes("unread")) evidence.markUnread = true;
    if (repaired.inherited.includes(q.originalNo)) evidence.stemInherited = true;
    return { ...q, evidence };
  });
}

export function renderBatch(questions: Question[], opts: RenderOptions = {}): string {
  return renderWorksheet(questions, opts);
}
