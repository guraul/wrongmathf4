import type { Figure } from "../schema.js";
import { escapeHtml } from "./html.js";

/**
 * 参数化图形：模型只报尺寸，坐标全部由这里算。
 * 理由很直接——让模型给坐标，画出来的梯形十次里有三次是歪的，而尺寸是它能读准的东西。
 */

/** 1 个长度单位（cm）画多少像素 */
const PX_PER_UNIT = 26;
/** 图形四周留给尺寸标注的空间 */
const PAD = 38;
const LABEL_SIZE = 13;
const STROKE = "#222";
const SHAPE_FILL = "#f7f7f5";

const px = (dim: string): number => Number(dim) * PX_PER_UNIT;

interface Size {
  w: number;
  h: number;
}

interface PartBox {
  x: number;
  y: number;
  size: Size;
  svg: string;
}

/** 带刻度的尺寸线：水平尺寸画在图形上方，竖直尺寸画在图形右侧。 */
function horizontalDim(x1: number, x2: number, y: number, label: string): string {
  return `<g class="dim">
    <line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="#888" stroke-width="1"/>
    <line x1="${x1}" y1="${y - 5}" x2="${x1}" y2="${y + 5}" stroke="#888" stroke-width="1"/>
    <line x1="${x2}" y1="${y - 5}" x2="${x2}" y2="${y + 5}" stroke="#888" stroke-width="1"/>
    <text x="${(x1 + x2) / 2}" y="${y - 6}" font-size="${LABEL_SIZE}" text-anchor="middle" fill="#444">${escapeHtml(label)}</text>
  </g>`;
}

function verticalDim(y1: number, y2: number, x: number, label: string): string {
  return `<g class="dim">
    <line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="#888" stroke-width="1"/>
    <line x1="${x - 5}" y1="${y1}" x2="${x + 5}" y2="${y1}" stroke="#888" stroke-width="1"/>
    <line x1="${x - 5}" y1="${y2}" x2="${x + 5}" y2="${y2}" stroke="#888" stroke-width="1"/>
    <text x="${x + 8}" y="${(y1 + y2) / 2 + 4}" font-size="${LABEL_SIZE}" text-anchor="start" fill="#444">${escapeHtml(label)}</text>
  </g>`;
}

type Part = Extract<Figure, { type: "composite" }>["parts"][number];

function partSize(part: Part): Size {
  switch (part.shape) {
    case "rect":
      return { w: px(part.width), h: px(part.height) };
    case "triangle":
      return { w: px(part.base), h: px(part.height) };
    case "trapezoid":
      return { w: px(part.bottom), h: px(part.height) };
  }
}

function partShape(part: Part, box: { x: number; y: number; w: number; h: number }): string {
  const { x, y, w, h } = box;
  const common = `fill="${SHAPE_FILL}" stroke="${STROKE}" stroke-width="1.5"`;

  switch (part.shape) {
    case "rect":
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" ${common}/>`;
    case "triangle":
      return `<polygon points="${x},${y + h} ${x + w},${y + h} ${x + w / 2},${y}" ${common}/>`;
    case "trapezoid": {
      const top = px(part.top);
      const leftTop = x + (w - top) / 2;
      return `<polygon points="${x},${y + h} ${x + w},${y + h} ${leftTop + top},${y} ${leftTop},${y}" ${common}/>`;
    }
  }
}

function partLabel(part: Part): string {
  switch (part.shape) {
    case "rect":
      return `${part.width}×${part.height}`;
    case "triangle":
      return `底 ${part.base} 高 ${part.height}`;
    case "trapezoid":
      return `上 ${part.top} 下 ${part.bottom} 高 ${part.height}`;
  }
}

function renderComposite(fig: Extract<Figure, { type: "composite" }>): string {
  const sizes = fig.parts.map(partSize);
  const unit = fig.unit ?? "cm";
  /** 叠放时每块之间留出的空隙，用来放尺寸线 */
  const GAP = 48;

  const boxes: Array<{ x: number; y: number; size: Size }> = [];

  if (fig.layout === "side") {
    const height = Math.max(...sizes.map((s) => s.h));
    let cursor = 0;
    fig.parts.forEach((_, i) => {
      const size = sizes[i] as Size;
      boxes.push({ x: cursor, y: height - size.h, size });
      cursor += size.w + GAP;
    });
  } else {
    const width = Math.max(...sizes.map((s) => s.w));
    let cursor = 0;
    fig.parts.forEach((_, i) => {
      const size = sizes[i] as Size;
      boxes.push({ x: (width - size.w) / 2, y: cursor, size });
      cursor += size.h + GAP;
    });
  }

  const contentW = fig.layout === "side" ? sizes.reduce((s, x) => s + x.w, 0) + GAP * (sizes.length - 1) : Math.max(...sizes.map((s) => s.w));
  const contentH = fig.layout === "side" ? Math.max(...sizes.map((s) => s.h)) : sizes.reduce((s, x) => s + x.h, 0) + GAP * (sizes.length - 1);

  // 四周留白要算进 viewBox，否则内容会被裁掉
  const padX = 52;
  const padTop = 40;
  const padBottom = 34;

  const parts = fig.parts
    .map((part, i) => {
      const box = boxes[i] as { x: number; y: number; size: Size };
      const { x, y, size } = box;
      const shape = partShape(part, { x, y, w: size.w, h: size.h });

      const dims: string[] = [];
      switch (part.shape) {
        case "rect":
          dims.push(horizontalDim(x, x + size.w, y + size.h + 16, part.width));
          dims.push(verticalDim(y, y + size.h, x + size.w + 14, part.height));
          break;
        case "triangle":
          dims.push(horizontalDim(x, x + size.w, y + size.h + 16, part.base));
          dims.push(verticalDim(y, y + size.h, x - 14, part.height));
          break;
        case "trapezoid":
          dims.push(horizontalDim(x, x + size.w, y + size.h + 16, part.bottom));
          dims.push(verticalDim(y, y + size.h, x + size.w + 14, part.height));
          {
            // 上底也要标：少了它，梯形的面积根本算不出来
            const top = px(part.top);
            dims.push(horizontalDim(x + (size.w - top) / 2, x + (size.w + top) / 2, y - 12, part.top));
          }
          break;
      }

      return `${shape}\n    ${dims.join("\n    ")}`;
    })
    .join("\n    ");

  const vbW = contentW + padX * 2;
  const vbH = contentH + padTop + padBottom;

  return `<svg class="figure figure-composite" xmlns="http://www.w3.org/2000/svg" width="${vbW}" height="${vbH}" viewBox="0 0 ${vbW} ${vbH}" role="img" aria-label="组合图形（单位：${escapeHtml(unit)}）">
  <g transform="translate(${padX},${padTop})">
    ${parts}
  </g>
</svg>`;
}

function renderDivision(fig: Extract<Figure, { type: "division" }>): string {
  // 中国小学竖式：除数在左，被除数在横线下方，商在横线上方，余数写在最下面
  const dividendText = String(fig.dividend);
  const charW = 12;

  const divisorX = 8;
  const bracketX = divisorX + Math.max(String(fig.divisor).length * charW, 20) + 14;
  const dividendX = bracketX + 10;
  const width = dividendX + dividendText.length * charW + 28;
  const height = 118;

  const quotientBaseline = 30;
  const barY = 42;
  const dividendBaseline = 66;

  return `<svg class="figure figure-division" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="除法竖式">
  <text x="${divisorX}" y="${dividendBaseline}" font-size="17" fill="#222">${escapeHtml(String(fig.divisor))}</text>
  <path d="M ${bracketX} ${barY} L ${bracketX} ${dividendBaseline + 6}" fill="none" stroke="#222" stroke-width="1.6"/>
  <line x1="${bracketX}" y1="${barY}" x2="${width - 12}" y2="${barY}" stroke="#222" stroke-width="1.6"/>
  <text x="${dividendX}" y="${dividendBaseline}" font-size="17" fill="#222">${escapeHtml(dividendText)}</text>
  <text x="${width - 12}" y="${quotientBaseline}" font-size="17" text-anchor="end" fill="#222">${escapeHtml(String(fig.quotient))}</text>
  <text x="${dividendX}" y="${dividendBaseline + 30}" font-size="11" fill="#666">余 ${escapeHtml(String(fig.remainder))}</text>
</svg>`;
}

function renderCards(fig: Extract<Figure, { type: "cards" }>): string {
  const cardW = 34;
  const gap = 8;
  const width = fig.values.length * (cardW + gap) - gap;
  const height = 46;

  const picked = new Set(fig.picked ?? []);

  const cards = fig.values
    .map((value, i) => {
      const x = i * (cardW + gap);
      const on = picked.has(value);
      const fill = on ? "#e8eef7" : "#fff";
      const stroke = on ? "#4a6fa5" : "#666";
      return `<g>
      <rect x="${x}" y="4" width="${cardW}" height="${height - 8}" rx="4" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>
      <text x="${x + cardW / 2}" y="30" font-size="16" text-anchor="middle" fill="#222">${escapeHtml(value)}</text>
    </g>`;
    })
    .join("\n    ");

  return `<svg class="figure figure-cards" xmlns="http://www.w3.org/2000/svg" width="${Math.max(width, 10)}" height="${height}" viewBox="0 0 ${Math.max(width, 10)} ${height}" role="img" aria-label="数字卡片">
    ${cards}
</svg>`;
}

function renderUnitTable(fig: Extract<Figure, { type: "unitTable" }>): string {
  const colW = 150;
  const rowH = 32;
  const width = colW * 2;
  const height = rowH * fig.rows.length;

  const lines = fig.rows
    .map((row, r) => {
      // 行底边在 r+1，文字基线取该行中间偏下
      const y = (r + 1) * rowH;
      const baseline = r * rowH + rowH / 2 + 5;
      const [left, right] = row;
      const bottom = r < fig.rows.length - 1
        ? `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="#bbb" stroke-width="1"/>`
        : "";
      return `${bottom}
    <text x="10" y="${baseline}" font-size="14" fill="#222">${escapeHtml(left ?? "")}</text>
    <text x="${colW + 10}" y="${baseline}" font-size="14" fill="#222">${escapeHtml(right ?? "")}</text>`;
    })
    .join("\n    ");

  return `<svg class="figure figure-unit-table" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="单位换算表">
    <rect x="0" y="0" width="${width}" height="${height}" fill="none" stroke="#bbb" stroke-width="1"/>
    <line x1="${colW}" y1="0" x2="${colW}" y2="${height}" stroke="#bbb" stroke-width="1"/>
    ${lines}
</svg>`;
}

export function renderFigure(fig: Figure): string {
  switch (fig.type) {
    case "composite":
      return renderComposite(fig);
    case "division":
      return renderDivision(fig);
    case "cards":
      return renderCards(fig);
    case "unitTable":
      return renderUnitTable(fig);
  }
}
