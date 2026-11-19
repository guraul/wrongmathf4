import { z } from "zod";

import { Figure, QuestionKind, TeacherMark } from "../schema.js";

/**
 * 模型输出的原始形状。与内部 `Question` 的区别：
 * 这里只有"卷面上写着什么"，没有 verdict / confidence——那是判定层的事。
 */
/**
 * 模型时不时把字段回成 null（真机上见过 originalNo: null）。
 * 这里一律给保守默认值，交给去重逻辑丢掉脏条目，而不是让整卷解析失败。
 */
const text = (fallback = "") => z.string().nullish().transform((v) => v ?? fallback);

export const RawQuestion = z.object({
  /** 卷面原印编号，如 一（2）、二.1、2(1)；为空/缺失的条目会在去重时丢弃 */
  originalNo: text(),
  kind: QuestionKind,
  stem: text(),
  figures: z.array(Figure).nullish().transform((v) => v ?? []),
  /** 老师在这道题旁画的符号：√ / × / 没有；缺失按"没批到"处理 */
  teacherMark: TeacherMark.nullish().transform((v) => v ?? "none"),
  /** 学生写在这道题的答案；没作答留 null */
  studentAnswer: z.string().nullable().default(null),
  /** 说理、比较类题目 */
  subjective: z.boolean().nullish().transform((v) => v ?? false),
});

export const RawPage = z.object({
  questions: z.array(RawQuestion).min(1),
});

export const SolverOutput = z.object({
  answers: z.array(
    z.object({
      originalNo: z.string().min(1),
      /** 只写最终结果，不写过程 */
      answer: z.string().min(1),
    }),
  ),
});

export type RawQuestion = z.infer<typeof RawQuestion>;
export type RawPage = z.infer<typeof RawPage>;
export type SolverOutput = z.infer<typeof SolverOutput>;
