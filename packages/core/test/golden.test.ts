import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { prepareForModel } from "../src/ingest/io.js";
import { buildQuestions, wrongQuestions } from "../src/judge/pipeline.js";
import { VlmClient } from "../src/vlm/client.js";

const FIXTURES = fileURLToPath(new URL("../../../test/fixtures/2026-11-17/", import.meta.url));

interface Expected {
  wrong: Array<{ originalNo: string; answer: string }>;
}

/**
 * 真机回归：需要有 DEEPSEEK_API_KEY。没 key 时整组跳过，不让 CI 变红。
 * 判据只看「错题编号集合」——题干转写的措辞差异交给人工看图。
 */
describe.skipIf(!process.env.DEEPSEEK_API_KEY)("golden：2026-11-17 两张卷子", () => {
  it("错题集合与人工结论一致", async () => {
    const expected = JSON.parse(await readFile(`${FIXTURES}expected.json`, "utf8")) as Expected;
    const client = new VlmClient({ apiKey: process.env.DEEPSEEK_API_KEY as string });

    const found = new Set<string>();

    for (const page of ["p1-geo5.jpg", "p2-geo6.jpg"]) {
      const prepared = await prepareForModel(`${FIXTURES}${page}`);
      const dataUrl = `data:image/png;base64,${prepared.buffer.toString("base64")}`;

      const page1 = await client.transcribe(dataUrl);
      const solver = await client.solve(page1.questions);
      const { questions } = buildQuestions({ page: page1, solver, foundClusters: 1 });

      for (const q of wrongQuestions(questions)) found.add(q.originalNo);
    }

    expect([...found].sort()).toEqual(expected.wrong.map((w) => w.originalNo).sort());
  }, 180_000);
});
