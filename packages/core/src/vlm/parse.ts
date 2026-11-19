import { z } from "zod";

import { Figure, QuestionKind } from "../schema.js";

/**
 * 模型输出的原始形状。与内部 `Question` 的区别：
 * 这里只有"卷面上写着什么"，没有 verdict / confidence——那是判定层的事。
 */
/**
 * 模型时不时把字段回成 null（真机上见过 originalNo: null）。
 * 这里一律给保守默认值，交给去重逻辑丢掉脏条目，而不是让整卷解析失败。
 */
const text = (fallback = "") => z.string().nullish().transform((v) => v ?? fallback);

/** 老师的标记，外加一种"模型没给出这个字段"的读数 */
export const RawMark = z.enum(["right", "wrong", "none", "unread"]);
export type RawMark = z.infer<typeof RawMark>;

export const RawQuestion = z.object({
  /** 卷面原印编号，如 一（2）、二.1、2(1)；为空/缺失的条目会在去重时丢弃 */
  originalNo: text(),
  kind: QuestionKind,
  stem: text(),
  figures: z.array(Figure).nullish().transform((v) => v ?? []),
  /**
   * 老师在这道题旁画的符号：√ / × / 没有。
   * 模型没给这个字段时记 `unread`——「没读到」和「读到了没有标记」必须是两回事，
   * 否则两轮都漏读同一道 ✗ 题时会被当成老师没批，漏判成 right。
   */
  teacherMark: RawMark.nullish().transform((v) => v ?? "unread"),
  /**
   * 老师批改符号在图上的归一化位置 [x, y, w, h]（0–1，原点左上）。
   * 只用来和红笔掩膜对账，不参与渲染；看不到符号就不给。
   */
  markBox: z
    .tuple([z.number(), z.number(), z.number(), z.number()])
    .nullish()
    .transform((v) => v ?? null),
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
