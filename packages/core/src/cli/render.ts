/**
 * 复刻卷命令：把判定结果里的题目渲染成可直接打印的 HTML。
 *
 *   pnpm render test/fixtures/2026-11-17/wrong.json /tmp/worksheet.html
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";

import { renderWorksheet } from "../render/html.js";
import { Question } from "../schema.js";

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error("用法: render <questions.json> <输出.html>");
  process.exit(2);
}

const questions = z.array(Question).parse(JSON.parse(await readFile(input, "utf8")));
const html = renderWorksheet(questions, { subtitle: "" });

await mkdir(dirname(output), { recursive: true });
await writeFile(output, html);
console.log(JSON.stringify({ input, output, questions: questions.length, bytes: html.length }, null, 2));
