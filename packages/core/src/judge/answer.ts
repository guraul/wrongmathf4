/**
 * 答案比对：把"学生写的"和"独立解出来的"放在同一把尺子上量。
 *
 * 卷面上的写法很脏——全角括号、多余单位、`13.32` 与 `13.320`、`cm²` 与 `平方厘米`。
 * 直接字符串相等会大面积误判，所以先归一化再比。
 */

const UNIT_ALIASES: Array<[RegExp, string]> = [
  [/平方厘米|cm2|cm\^2|㎠/gi, "cm2"],
  [/平方分米|dm2|dm\^2/gi, "dm2"],
  [/平方米|m2|m\^2|㎡/gi, "m2"],
  [/平方千米|平方公里|km2|km\^2|㎢/gi, "km2"],
  [/公顷|ha/gi, "ha"],
  [/厘米|公分|cm/gi, "cm"],
  [/分米|dm/gi, "dm"],
  [/千米|公里|km/gi, "km"],
  [/米|m/gi, "m"],
  [/度|°/g, "deg"],
];

export function normalizeAnswer(input: string): string {
  let s = input.trim();

  // 全角数字与符号 → 半角
  // 全角 ASCII 整段降半角（ｃｍ → cm、０-９ → 0-9）
  s = s.replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
  s = s.replace(/\u3000/g, " ");
  s = s.replace(/[（]/g, "(").replace(/[）]/g, ")");
  s = s.replace(/[．。]/g, ".");
  s = s.replace(/[，,]/g, "");
  s = s.replace(/\s+/g, "");
  // 上标（cm²、m³）先降成普通数字，后面才认得出来
  s = s.replace(/²/g, "2").replace(/³/g, "3");

  for (const [pattern, replacement] of UNIT_ALIASES) {
    s = s.replace(pattern, replacement);
  }

  // 去掉常见的尾巴：句号、分号（归一化后的半角 . 也算）
  s = s.replace(/[。；;.]+$/g, "");

  return s.toLowerCase();
}

export interface ParsedAnswer {
  value: number | null;
  unit: string | null;
}

export function parseAnswer(input: string): ParsedAnswer {
  const s = normalizeAnswer(input);
  const match = s.match(/^(-?\d+(?:\.\d+)?)([a-z0-9]*)$/);
  if (!match) return { value: null, unit: null };

  return {
    value: Number(match[1]),
    unit: match[2] === "" ? null : (match[2] as string),
  };
}

export type CompareResult = "equal" | "differ" | "unknown";

/** 数值容差：允许 0.1% 的差（四舍五入到两位的答案会落到这个范围里）。 */
const REL_TOL = 1e-3;

export function compareAnswers(student: string | null, solver: string | null): CompareResult {
  if (student === null || solver === null) return "unknown";

  const a = normalizeAnswer(student);
  const b = normalizeAnswer(solver);
  if (a === "" || b === "") return "unknown";
  if (a === b) return "equal";

  const pa = parseAnswer(student);
  const pb = parseAnswer(solver);

  // 有一边解析不出数字，退化成语义字符串比较
  if (pa.value === null || pb.value === null) return "differ";

  // 单位不一致（且两边都写了单位）直接判不同
  if (pa.unit !== null && pb.unit !== null && pa.unit !== pb.unit) return "differ";

  const scale = Math.max(Math.abs(pa.value), Math.abs(pb.value), 1);
  return Math.abs(pa.value - pb.value) <= REL_TOL * scale ? "equal" : "differ";
}
