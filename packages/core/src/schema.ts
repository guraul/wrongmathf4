import { z } from "zod";

/**
 * 卷面上的尺寸保留字符串写法，避免 0.1 + 0.2 这类浮点误差渗进契约。
 * 生成器自己做数值转换，失败就报错，不做静默取整。
 */
export const Dimension = z
  .string()
  .regex(/^\d+(?:\.\d+)?$/, "尺寸必须是数字字符串，如 0.8 / 12");

/** 题型决定渲染模板与判定规则。 */
export const QuestionKind = z.enum([
  "choice", // 选择题
  "fill", // 填空题（填数）
  "unitFill", // 填单位
  "geometry", // 图形计算
  "short", // 简答/说理，不参与自动判定
]);

/** 老师在卷面上留下的符号。none 表示没批到这题。 */
export const TeacherMark = z.enum(["right", "wrong", "none"]);

/** unknown 按 wrong 处理（宁可多报），由判定层保证。 */
export const Verdict = z.enum(["wrong", "right", "unknown"]);

export const BatchStatus = z.enum(["queued", "running", "done", "failed"]);

// ---------- 图形参数 ----------

export const RectPart = z.object({
  shape: z.literal("rect"),
  width: Dimension,
  height: Dimension,
});

export const TrianglePart = z.object({
  shape: z.literal("triangle"),
  base: Dimension,
  height: Dimension,
});

export const TrapezoidPart = z.object({
  shape: z.literal("trapezoid"),
  top: Dimension,
  bottom: Dimension,
  height: Dimension,
});

export const CompositePart = z.discriminatedUnion("shape", [
  RectPart,
  TrianglePart,
  TrapezoidPart,
]);

/** 组合图形：部件按 layout 叠放，所有尺寸由本地生成器换算成坐标。 */
export const CompositeFigure = z.object({
  type: z.literal("composite"),
  layout: z.enum(["stack", "side"]),
  parts: z.array(CompositePart).min(1),
  unit: z.string().default("cm"),
});

/** 除法竖式：被除数 = 除数 × 商 + 余数，生成器与判定层都依赖这个恒等式。 */
export const DivisionFigure = z.object({
  type: z.literal("division"),
  dividend: z.number().int().positive(),
  divisor: z.number().int().positive(),
  quotient: z.number().int().nonnegative(),
  remainder: z.number().int().nonnegative().default(0),
});

/** 数卡：values 是卡面上的数，picked 是题目要求取的卡。 */
export const CardsFigure = z.object({
  type: z.literal("cards"),
  values: z.array(z.string()).min(1),
  picked: z.array(z.string()).default([]),
});

/** 单位换算表：逐行渲染，不做语义解析。 */
export const UnitTableFigure = z.object({
  type: z.literal("unitTable"),
  rows: z.array(z.array(z.string())).min(1),
});

export const Figure = z.discriminatedUnion("type", [
  CompositeFigure,
  DivisionFigure,
  CardsFigure,
  UnitTableFigure,
]);

// ---------- 题目 / 页面 / 批次 ----------

export const Question = z.object({
  id: z.string().min(1),
  /** 卷面原印编号，可能是 2(1)、3(5)① 这类复合形式。 */
  originalNo: z.string().min(1),
  /** 复刻卷里的排序位置，从 1 开始。 */
  sequence: z.number().int().positive(),
  kind: QuestionKind,
  stem: z.string().min(1),
  figures: z.array(Figure).default([]),
  teacherMark: TeacherMark,
  /** 模型独立求解得到的答案；主观题留 null。 */
  solverAnswer: z.string().nullable().default(null),
  verdict: Verdict,
  /** 0–1，判定层的把握程度；低置信不阻断流程，只进 evidence。 */
  confidence: z.number().min(0).max(1),
  /** 判定过程的附加信息，排查时用；不进复刻卷。结构由判定层决定。 */
  evidence: z.record(z.string(), z.unknown()).default({}),
});

export const Page = z.object({
  id: z.string().min(1),
  index: z.number().int().nonnegative(),
  imagePath: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

/** 批次：一次上传的所有页面，产出一份复刻卷。 */
export const Batch = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  createdAt: z.string().datetime(),
  status: BatchStatus,
  pages: z.array(Page).min(1),
  questions: z.array(Question).default([]),
  htmlPath: z.string().nullable().default(null),
});

export type Dimension = z.infer<typeof Dimension>;
export type QuestionKind = z.infer<typeof QuestionKind>;
export type TeacherMark = z.infer<typeof TeacherMark>;
export type Verdict = z.infer<typeof Verdict>;
export type Figure = z.infer<typeof Figure>;
export type CompositeFigure = z.infer<typeof CompositeFigure>;
export type DivisionFigure = z.infer<typeof DivisionFigure>;
export type Question = z.infer<typeof Question>;
export type Page = z.infer<typeof Page>;
export type Batch = z.infer<typeof Batch>;
