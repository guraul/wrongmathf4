/**
 * 掩膜连通域：把红笔像素聚成"一簇 = 一个标记"。
 *
 * 为什么不直接在原图上做：1080×1920 的逐像素 BFS 太慢也没必要——
 * 红笔笔画宽度约 4–8px，先按 block 下采样，簇的位置与数量都不受影响。
 */

export interface Cluster {
  /** 像素坐标下的包围盒 */
  x: number;
  y: number;
  w: number;
  h: number;
  /** 命中的格数（下采样后），用于过滤噪点 */
  cells: number;
}

export interface ClusterOptions {
  /** 下采样格边长，默认 4 */
  block?: number;
  /** 少于多少格算噪声，默认 6（block=4 时约 96 px²） */
  minCells?: number;
  /** 两个簇的包围盒间距小于该值就合并，默认 12px（断裂的笔画要接回去） */
  mergeGap?: number;
}

export function clusterMask(
  mask: Uint8Array,
  width: number,
  height: number,
  opts: ClusterOptions = {},
): Cluster[] {
  const block = Math.max(1, opts.block ?? 4);
  const minCells = Math.max(1, opts.minCells ?? 6);
  const mergeGap = Math.max(0, opts.mergeGap ?? 12);

  const cols = Math.ceil(width / block);
  const rows = Math.ceil(height / block);

  // 下采样：一个格子里只要有一个红像素就算占用
  const grid = new Uint8Array(cols * rows);
  for (let y = 0; y < height; y++) {
    const gy = Math.floor(y / block);
    for (let x = 0; x < width; x++) {
      if (mask[y * width + x] === 1) grid[gy * cols + Math.floor(x / block)] = 1;
    }
  }

  const seen = new Uint8Array(cols * rows);
  const clusters: Cluster[] = [];
  const stack: number[] = [];

  for (let start = 0; start < grid.length; start++) {
    if (grid[start] !== 1 || seen[start] === 1) continue;

    let cells = 0;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -1;
    let maxY = -1;

    stack.push(start);
    seen[start] = 1;

    while (stack.length > 0) {
      const idx = stack.pop() as number;
      const gx = idx % cols;
      const gy = Math.floor(idx / cols);
      cells += 1;
      if (gx < minX) minX = gx;
      if (gy < minY) minY = gy;
      if (gx > maxX) maxX = gx;
      if (gy > maxY) maxY = gy;

      // 4 邻域
      const neighbours = [
        gx > 0 ? idx - 1 : -1,
        gx < cols - 1 ? idx + 1 : -1,
        gy > 0 ? idx - cols : -1,
        gy < rows - 1 ? idx + cols : -1,
      ];
      for (const n of neighbours) {
        if (n >= 0 && grid[n] === 1 && seen[n] === 0) {
          seen[n] = 1;
          stack.push(n);
        }
      }
    }

    if (cells >= minCells) {
      clusters.push({
        x: minX * block,
        y: minY * block,
        w: (maxX - minX + 1) * block,
        h: (maxY - minY + 1) * block,
        cells,
      });
    }
  }

  return mergeNearby(clusters, mergeGap);
}

/** 把一个勾的断笔、以及紧挨着的两笔合成一簇；不改 cells 统计口径。 */
function mergeNearby(clusters: Cluster[], gap: number): Cluster[] {
  let current = clusters.slice();
  let merged = true;

  while (merged) {
    merged = false;
    for (let i = 0; i < current.length && !merged; i++) {
      for (let j = i + 1; j < current.length; j++) {
        const a = current[i] as Cluster;
        const b = current[j] as Cluster;
        if (near(a, b, gap)) {
          current = current.filter((_, k) => k !== i && k !== j);
          current.push(union(a, b));
          merged = true;
          break;
        }
      }
    }
  }

  return current;
}

function near(a: Cluster, b: Cluster, gap: number): boolean {
  const horizontal = Math.max(0, Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w)));
  const vertical = Math.max(0, Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h)));
  return horizontal <= gap && vertical <= gap;
}

function union(a: Cluster, b: Cluster): Cluster {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  const right = Math.max(a.x + a.w, b.x + b.w);
  const bottom = Math.max(a.y + a.h, b.y + b.h);
  return { x, y, w: right - x, h: bottom - y, cells: a.cells + b.cells };
}
