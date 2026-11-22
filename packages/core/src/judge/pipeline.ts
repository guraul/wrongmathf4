import type { Question, TeacherMark } from "../schema.js";
import type { RawPage, RawQuestion } from "../vlm/parse.js";
import { checkFigures } from "./rules.js";
import { applyClusterAgreement, decide } from "./verdict.js";

export interface BuildInput {
  page: RawPage;
  /** 独立求解结果，键是 originalNo */
  solver: Map<string, string>;
  /** 红笔掩膜聚出来的簇数 */
  foundClusters: number;
  /** 框里真的压着红笔的标记数（0 = 红笔机制不可信，如黑笔批改） */
  redVerifiedMarks?: number;
}

export interface BuildResult {
  questions: Question[];
  /** 模型自报的"有标记"题数，用于和簇数对账 */
  claimedMarks: number;
}

function toQuestion(
  q: RawQuestion,
  sequence: number,
  solverAnswer: string | null,
  canPromoteBySolver: boolean,
): Question {
  // 正常情况下投票后已经没有 unread；真漏到这一步就按"没批到"处理，但不假装读过
  const mark: TeacherMark = q.teacherMark === "unread" ? "none" : q.teacherMark;

  const judged = decide({
    teacherMark: mark,
    subjective: q.subjective,
    studentAnswer: q.studentAnswer,
    solverAnswer,
    rules: checkFigures(q.figures),
    canPromoteBySolver,
  });

  return {
    id: `q${sequence}`,
    originalNo: q.originalNo,
    sequence,
    kind: q.kind,
    stem: q.stem,
    figures: q.figures,
    teacherMark: mark,
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
  const claimedMarks = input.page.questions.filter(
    (q) => q.teacherMark === "right" || q.teacherMark === "wrong",
  ).length;

  const questions = input.page.questions.map((q, i) => {
    const solverAnswer = input.solver.get(q.originalNo) ?? null;
    // 求解漏批兜底只在「红笔机制可信」时启用。两个信号满足其一：
    // 1. 有标记框真的压着红笔簇（最可靠，但模型给的框常常偏）；
    // 2. 整页红簇数不少于声称的标记数——红笔卷真机实测 7 簇 / 2 个标记，
    //    黑笔卷是 0 簇 / 6 个标记；红章页眉只会带进零星几簇，够不到这个比例。
    const canPromoteBySolver =
      (input.redVerifiedMarks ?? 0) > 0 || (input.foundClusters > 0 && input.foundClusters >= claimedMarks);
    const built = toQuestion(q, i + 1, solverAnswer, canPromoteBySolver);

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
