import type { Figure } from "../schema.js";

/**
 * 规则票：只做"一定能算出来"的检查。
 * 不猜语义、不做单位换算题（那需要题目上下文），只校验模型自己给出的参数是否自洽。
 */

export interface RuleCheck {
  ok: boolean;
  reason?: string;
}

export function checkDivision(fig: {
  dividend: number;
  divisor: number;
  quotient: number;
  remainder: number;
}): RuleCheck {
  const expected = fig.divisor * fig.quotient + fig.remainder;
  if (expected === fig.dividend) return { ok: true };
  return {
    ok: false,
    reason: `${fig.divisor}×${fig.quotient}+${fig.remainder}=${expected}，与被除数 ${fig.dividend} 不符`,
  };
}

function isPositive(dim: string): boolean {
  const n = Number(dim);
  return Number.isFinite(n) && n > 0;
}

function checkComposite(fig: Extract<Figure, { type: "composite" }>): RuleCheck {
  for (const part of fig.parts) {
    const dims =
      part.shape === "rect"
        ? [part.width, part.height]
        : part.shape === "triangle"
          ? [part.base, part.height]
          : [part.top, part.bottom, part.height];
    for (const d of dims) {
      if (!isPositive(d)) return { ok: false, reason: `图形参数不是正数: ${d}` };
    }
    if (part.shape === "trapezoid" && Number(part.top) > Number(part.bottom)) {
      return { ok: false, reason: `梯形上底 ${part.top} 大于下底 ${part.bottom}` };
    }
  }
  return { ok: true };
}

export function checkFigure(fig: Figure): RuleCheck {
  switch (fig.type) {
    case "division":
      return checkDivision(fig);
    case "composite":
      return checkComposite(fig);
    case "cards":
      return fig.values.length > 0 ? { ok: true } : { ok: false, reason: "数卡为空" };
    case "unitTable":
      return fig.rows.length > 0 ? { ok: true } : { ok: false, reason: "表格为空" };
  }
}

export function checkFigures(figures: Figure[]): RuleCheck[] {
  return figures.map(checkFigure);
}
