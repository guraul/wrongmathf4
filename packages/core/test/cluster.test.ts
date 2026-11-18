import { describe, expect, it } from "vitest";

import { clusterMask } from "../src/judge/cluster.js";

function blank(w: number, h: number): Uint8Array {
  return new Uint8Array(w * h);
}

function fill(mask: Uint8Array, w: number, x0: number, y0: number, x1: number, y1: number): void {
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) mask[y * w + x] = 1;
  }
}

describe("红笔簇", () => {
  it("相隔较远的两块笔画算两簇", () => {
    const w = 64;
    const h = 64;
    const mask = blank(w, h);
    fill(mask, w, 0, 0, 16, 16);
    fill(mask, w, 40, 40, 56, 56);

    const clusters = clusterMask(mask, w, h);
    expect(clusters).toHaveLength(2);
  });

  it("挨得很近的断笔被合并成一簇", () => {
    const w = 64;
    const h = 64;
    const mask = blank(w, h);
    fill(mask, w, 8, 8, 24, 16);
    fill(mask, w, 8, 20, 24, 28);

    expect(clusterMask(mask, w, h)).toHaveLength(1);
  });

  it("单像素噪点被过滤", () => {
    const w = 40;
    const h = 40;
    const mask = blank(w, h);
    mask[5 * w + 5] = 1;

    expect(clusterMask(mask, w, h)).toHaveLength(0);
  });

  it("包围盒落在像素坐标上", () => {
    const w = 40;
    const h = 40;
    const mask = blank(w, h);
    fill(mask, w, 8, 12, 24, 20);

    const [cluster] = clusterMask(mask, w, h);
    expect(cluster).toBeDefined();
    expect(cluster?.x).toBe(8);
    expect(cluster?.y).toBe(12);
    expect(cluster?.w).toBe(16);
    expect(cluster?.h).toBe(8);
  });

  it("空掩膜没有簇", () => {
    expect(clusterMask(blank(20, 20), 20, 20)).toEqual([]);
  });
});
