import sharp from "sharp";

import { targetSize, type RgbaImage, type UpscaleOptions } from "./pixels.js";

/** 解码成 RGBA 原始像素，并按 EXIF 摆正（手机拍的照片常常带旋转标记）。 */
export async function loadImage(path: string): Promise<RgbaImage> {
  const { data, info } = await sharp(path)
    .rotate()
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return {
    width: info.width,
    height: info.height,
    data: new Uint8ClampedArray(data),
  };
}

export function encodePng(img: RgbaImage): Promise<Buffer> {
  return sharp(Buffer.from(img.data), {
    raw: { width: img.width, height: img.height, channels: 4 },
  })
    .png()
    .toBuffer();
}

export interface PreparedImage {
  buffer: Buffer;
  width: number;
  height: number;
}

/**
 * 送模型前的预处理：摆正 → 按长边放大（默认 2.5×，上限 3000px）→ PNG。
 * 只放大不缩小，见 pixels.ts 里 targetSize 的说明。
 */
export async function prepareForModel(
  path: string,
  opts: UpscaleOptions = {},
): Promise<PreparedImage> {
  const img = await loadImage(path);
  const size = targetSize(img.width, img.height, opts);

  const buffer = await sharp(Buffer.from(img.data), {
    raw: { width: img.width, height: img.height, channels: 4 },
  })
    .resize(size.width, size.height, { kernel: "lanczos3" })
    .png()
    .toBuffer();

  return { buffer, width: size.width, height: size.height };
}

/** 直接给模型接口用的 data URL。 */
export async function prepareDataUrl(path: string, opts: UpscaleOptions = {}): Promise<string> {
  const prepared = await prepareForModel(path, opts);
  return `data:image/png;base64,${prepared.buffer.toString("base64")}`;
}
