import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { loadImage, prepareForModel } from "../src/ingest/io.js";
import { redMask } from "../src/ingest/pixels.js";
import { clusterMask } from "../src/judge/cluster.js";
import { transcribeWithConsensus } from "../src/judge/consensus.js";
import { countRedVerifiedMarks } from "../src/judge/ink.js";
import { buildQuestions, wrongQuestions } from "../src/judge/pipeline.js";
import { VlmClient } from "../src/vlm/client.js";
import { resolveProvider } from "../src/vlm/providers.js";

const FIXTURES = fileURLToPath(new URL("../../../test/fixtures/2026-11-17/", import.meta.url));

interface Expected {
  wrong: Array<{ originalNo: string; answer: string }>;
}

/**
 * 题号的宽松比较：模型会把「一（2）」抄成「（2）」（丢掉大题号），
 * 这属于转写噪声，不代表判错。约定：数字必须一致，大题号只有双方都有时才比较。
 */
function sameNumber(a: string, b: string): boolean {
  const numA = a.replace(/[^0-9]/g, "");
  const numB = b.replace(/[^0-9]/g, "");
  if (numA === "" || numB === "" || numA !== numB) return false;
  const secA = a.match(/^([一二三四五六七八九十]+)/)?.[1];
  const secB = b.match(/^([一二三四五六七八九十]+)/)?.[1];
  return secA === undefined || secB === undefined || secA === secB;
}

/**
 * 真机回归：需要有 DEEPSEEK_API_KEY。没 key 时整组跳过，不让 CI 变红。
 * 判据只看「错题编号集合」——题干转写的措辞差异交给人工看图。
 */
const provider = resolveProvider();

describe.skipIf(!provider.ok)("golden：2026-11-17 两张卷子", () => {
  it("错题集合与人工结论一致", async () => {
    const expected = JSON.parse(await readFile(`${FIXTURES}expected.json`, "utf8")) as Expected;
    const client = new VlmClient(
      provider.ok
        ? { apiKey: provider.value.apiKey, provider: provider.value.preset.id }
        : { apiKey: "skipped" },
    );

    const found = new Set<string>();

    for (const page of ["p1-geo5.jpg", "p2-geo6.jpg"]) {
      const prepared = await prepareForModel(`${FIXTURES}${page}`);
      const dataUrl = `data:image/png;base64,${prepared.buffer.toString("base64")}`;

      // 两轮投票：这个模型对红笔符号的读取不稳定，单次结果不能直接信
      const consensus = await transcribeWithConsensus(() => client.transcribe(dataUrl));
      const solver = await client.solve(consensus.page.questions);

      // 按真实链路算红笔信号：红笔批改的卷子应当过闸，漏批兜底照常生效
      const img = await loadImage(`${FIXTURES}${page}`);
      const { mask } = redMask(img);
      const clusters = clusterMask(mask, img.width, img.height);
      const redVerifiedMarks = countRedVerifiedMarks(
        consensus.page,
        clusters,
        img.width,
        img.height,
      );

      const { questions } = buildQuestions({
        page: consensus.page,
        solver,
        foundClusters: clusters.length,
        redVerifiedMarks,
      });

      for (const q of wrongQuestions(questions)) found.add(q.originalNo);
    }

    const foundList = [...found];
    expect(foundList).toHaveLength(expected.wrong.length);
    for (const want of expected.wrong) {
      expect(foundList.some((got) => sameNumber(got, want.originalNo))).toBe(true);
    }
  }, 1_800_000);
});
