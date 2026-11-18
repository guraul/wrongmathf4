import type { Question } from "../schema.js";
import type { RawPage, RawQuestion } from "../vlm/parse.js";
import { checkFigures } from "./rules.js";
import { applyClusterAgreement, decide } from "./verdict.js";

export interface BuildInput {
  page: RawPage;
  /** 独立求解结果，键是 originalNo */
  solver: Map<string, string>;
  /** 红笔掩膜聚出来的簇数 */
  foundClusters: number;
}

export interface BuildResult {
  questions: Question[];
  /** 模型自报的"有标记"题数，用于和簇数对账 */
  claimedMarks: number;
}

function toQuestion(q: RawQuestion, sequence: number, solverAnswer: string | null): Question {
  const judged = decide({
    teacherMark: q.teacherMark,
    subjective: q.subjective,
    studentAnswer: q.studentAnswer,
    solverAnswer,
    rules: checkFigures(q.figures),
  });

  return {
    id: `q${sequence}`,
    originalNo: q.originalNo,
    sequence,
    kind: q.kind,
    stem: q.stem,
    figures: q.figures,
    teacherMark: q.teacherMark,
    solverAnswer,
    verdict: judged.verdict,
    confidence: judged.confidence,
    evidence: judged.evidence,
  };
}

/**
 * 把三票拼成最终题目列表。
 *
 * 簇对账只影响置信度：模型说有 3 处标记、掩膜找到 1 簇，说明有一边看漏了，
 * 但结论不因此翻转——宁可在报告里显示低置信，也不猜。
 */
export function buildQuestions(input: BuildInput): BuildResult {
  const claimedMarks = input.page.questions.filter((q) => q.teacherMark !== "none").length;

  const questions = input.page.questions.map((q, i) => {
    const solverAnswer = input.solver.get(q.originalNo) ?? null;
    const built = toQuestion(q, i + 1, solverAnswer);

    if (built.verdict === "unknown") return built;

    const adjusted = applyClusterAgreement(
      { verdict: built.verdict, confidence: built.confidence, evidence: built.evidence },
      claimedMarks,
      input.foundClusters,
    );

    return { ...built, confidence: adjusted.confidence, evidence: adjusted.evidence };
  });

  return { questions, claimedMarks };
}

export function wrongQuestions(questions: Question[]): Question[] {
  return questions.filter((q) => q.verdict === "wrong");
}
