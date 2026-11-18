/**
 * 纯像素运算：不读盘、不依赖 sharp，可在测试里直接构造小图验证。
 *
 * 红笔判定阈值来自人工整理那三份卷子时试出来的经验值：
 * 老师用的红笔在照片里 R 明显高于 G/B，但纸张偏黄会让 B 也抬高，
 * 所以同时约束 r-g 与 r-b，再加一个亮度下限，避免把阴影里的灰当红。
 */

export interface RgbaImage {
  width: number;
  height: number;
  /** RGBA，长度 = width * height * 4 */
  data: Uint8ClampedArray;
}

export function isRedInk(r: number, g: number, b: number): boolean {
  return r - g >= 22 && r - b >= 12 && r >= 90;
}

export interface MaskResult {
  /** 每像素 1 字节，1 = 红笔 */
  mask: Uint8Array;
  redPixels: number;
  totalPixels: number;
  /** 红像素占比，0–1 */
  ratio: number;
}

export function redMask(img: RgbaImage): MaskResult {
  const totalPixels = img.width * img.height;
  const mask = new Uint8Array(totalPixels);
  let redPixels = 0;

  for (let i = 0; i < totalPixels; i++) {
    const o = i * 4;
    const r = img.data[o] ?? 0;
    const g = img.data[o + 1] ?? 0;
    const b = img.data[o + 2] ?? 0;
    if (isRedInk(r, g, b)) {
      mask[i] = 1;
      redPixels += 1;
    }
  }

  return { mask, redPixels, totalPixels, ratio: totalPixels === 0 ? 0 : redPixels / totalPixels };
}

/**
 * 把掩膜渲染成一张可视化图：红笔纯红，其余按比例压成浅灰。
 * 用途是调试——肉眼看掩膜有没有把铅笔、印章、阴影也算进去。
 */
export function visualizeMask(img: RgbaImage, mask: Uint8Array, fade = 0.42): RgbaImage {
  const out = new Uint8ClampedArray(img.data.length);

  for (let i = 0; i < img.width * img.height; i++) {
    const o = i * 4;
    if (mask[i] === 1) {
      out[o] = 220;
      out[o + 1] = 0;
      out[o + 2] = 0;
    } else {
      const r = img.data[o] ?? 0;
      const g = img.data[o + 1] ?? 0;
      const b = img.data[o + 2] ?? 0;
      const lum = (r + g + b) / 3;
      const v = 245 - (245 - lum) * fade;
      out[o] = v;
      out[o + 1] = v;
      out[o + 2] = v;
    }
    out[o + 3] = 255;
  }

  return { width: img.width, height: img.height, data: out };
}

export interface UpscaleOptions {
  /** 放大倍数，默认 2.5；小于 1 视为 1 */
  scale?: number;
  /** 长边上限，默认 3000（再大对识别没帮助，只是费 token） */
  maxEdge?: number;
}

/**
 * 计算送模型前的目标尺寸：先按倍数放大，再用长边上限兜底。
 *
 * 对手机拍的 1080×1920 卷子，结果是放大到 1688×3000 —— V1 反着来，
 * 把 1080px 的图又压进 2000px，小字就是那样磨掉的。
 *
 * 例外：原图本身长边已超过上限时，结果会比原图小（这是为了控制 token 成本，
 * 不是"缩小预处理"）。该分支有专门测试。
 */
export function targetSize(
  width: number,
  height: number,
  opts: UpscaleOptions = {},
): { width: number; height: number } {
  const scale = Math.max(1, opts.scale ?? 2.5);
  const maxEdge = opts.maxEdge ?? 3000;

  let w = Math.round(width * scale);
  let h = Math.round(height * scale);
  const longEdge = Math.max(w, h);
  if (longEdge > maxEdge) {
    const k = maxEdge / longEdge;
    w = Math.round(w * k);
    h = Math.round(h * k);
  }
  return { width: w, height: h };
}
