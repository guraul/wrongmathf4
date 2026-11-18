/**
 * 掩膜调试命令：把一张卷子的红笔标记抽出来，存成可视化 PNG 并打印统计。
 *
 *   pnpm -F @wrongmath/core mask test/fixtures/2026-11-17/p1-geo5.jpg /tmp/mask.png
 */
import { writeFile } from "node:fs/promises";

import { encodePng, loadImage } from "../ingest/io.js";
import { redMask, visualizeMask } from "../ingest/pixels.js";

const [input, output] = process.argv.slice(2);

if (!input || !output) {
  console.error("用法: mask <输入图片> <输出 PNG>");
  process.exit(2);
}

const img = await loadImage(input);
const result = redMask(img);
const png = await encodePng(visualizeMask(img, result.mask));
await writeFile(output, png);

console.log(
  JSON.stringify(
    {
      input,
      output,
      width: img.width,
      height: img.height,
      redPixels: result.redPixels,
      totalPixels: result.totalPixels,
      ratio: Number(result.ratio.toFixed(4)),
    },
    null,
    2,
  ),
);
