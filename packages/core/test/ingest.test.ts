import { describe, expect, it } from "vitest";

import { loadImage, prepareForModel } from "../src/ingest/io.js";
import { redMask } from "../src/ingest/pixels.js";

const PAGE_1 = "test/fixtures/2026-11-17/p1-geo5.jpg";
const PAGE_2 = "test/fixtures/2026-11-17/p2-geo6.jpg";

describe("读图", () => {
  it("解出原始像素尺寸", async () => {
    const img = await loadImage(PAGE_1);
    expect(img.width).toBe(1080);
    expect(img.height).toBe(1920);
    expect(img.data.length).toBe(1080 * 1920 * 4);
  });
});

describe("红笔掩膜（真实卷面）", () => {
  it.each([
    ["第一页（组合图形）", PAGE_1],
    ["第二页（公顷与面积）", PAGE_2],
  ])("%s 的红像素占比落在合理区间", async (_label, path) => {
    const img = await loadImage(path);
    const { ratio } = redMask(img);

    // 卷面上的红笔大约占 0.5%–3%，超出这个范围说明阈值漂了
    expect(ratio).toBeGreaterThan(0.004);
    expect(ratio).toBeLessThan(0.15);
  });
});

describe("送模型前的预处理", () => {
  it("放大到长边 3000 并输出 PNG", async () => {
    const prepared = await prepareForModel(PAGE_1);

    expect(prepared.width).toBe(1688);
    expect(prepared.height).toBe(3000);
    expect(prepared.buffer.length).toBeGreaterThan(100_000);
    // PNG magic
    expect(prepared.buffer.subarray(1, 4).toString("ascii")).toBe("PNG");
  });
});
