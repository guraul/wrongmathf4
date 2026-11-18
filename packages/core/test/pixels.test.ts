import { describe, expect, it } from "vitest";

import {
  isRedInk,
  redMask,
  targetSize,
  visualizeMask,
  type RgbaImage,
} from "../src/ingest/pixels.js";

function makeImage(pixels: Array<[number, number, number]>): RgbaImage {
  const data = new Uint8ClampedArray(pixels.length * 4);
  pixels.forEach(([r, g, b], i) => {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  });
  return { width: pixels.length, height: 1, data };
}

describe("红笔判定", () => {
  it("认得老师红笔的典型色", () => {
    expect(isRedInk(200, 60, 50)).toBe(true);
    expect(isRedInk(160, 120, 130)).toBe(true);
  });

  it("不把灰纸、铅笔、暗部算成红", () => {
    expect(isRedInk(150, 150, 150)).toBe(false); // 中性灰
    expect(isRedInk(120, 110, 105)).toBe(false); // 偏黄纸面
    expect(isRedInk(80, 40, 30)).toBe(false); // 亮度过低
  });
});

describe("掩膜", () => {
  it("统计红像素占比", () => {
    const img = makeImage([
      [200, 60, 50],
      [150, 150, 150],
      [210, 70, 60],
      [120, 120, 118],
    ]);
    const result = redMask(img);

    expect(result.redPixels).toBe(2);
    expect(result.totalPixels).toBe(4);
    expect(result.ratio).toBeCloseTo(0.5);
    expect(Array.from(result.mask)).toEqual([1, 0, 1, 0]);
  });

  it("可视化时红像素变纯红、其余压成灰", () => {
    const img = makeImage([
      [200, 60, 50],
      [150, 150, 150],
    ]);
    const { mask } = redMask(img);
    const out = visualizeMask(img, mask);

    expect(Array.from(out.data.slice(0, 4))).toEqual([220, 0, 0, 255]);
    const grey = Array.from(out.data.slice(4, 7));
    expect(grey[0]).toBe(grey[1]);
    expect(grey[1]).toBe(grey[2]);
  });
});

describe("放大尺寸", () => {
  it("默认放大 2.5 倍，长边不超过 3000", () => {
    expect(targetSize(1080, 1920)).toEqual({ width: 1688, height: 3000 });
  });

  it("长边未超上限时按倍数放大", () => {
    expect(targetSize(600, 800)).toEqual({ width: 1500, height: 2000 });
  });

  it("倍数小于 1 时按 1 处理，不缩小", () => {
    expect(targetSize(1080, 1920, { scale: 0.5 })).toEqual({ width: 1080, height: 1920 });
  });
});
