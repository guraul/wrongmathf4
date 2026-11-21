import type { TeacherMark, Verdict } from "../schema.js";
import { compareAnswers } from "./answer.js";
import type { RuleCheck } from "./rules.js";

/**
 * 三票收敛。规则写死在这里，不留给调用方：
 *
 * 1. 老师 ✗ → wrong（规则票不参与，见下面注释）
 * 2. 老师 √ → right
 * 3. 老师无标记 → 看独立求解；求解也说不出所以然就 unknown
 * 4. 规则校验失败只在"无标记"时参与，不会推翻老师的判断——
 *    老师打勾但模型算出"错"属于教师漏判，交给人看（复刻卷里不标，DB 里记 evidence）
 * 5. 主观题（说理、比较）一律 unknown，只转写
 */

export interface JudgeInput {
  teacherMark: TeacherMark;
  subjective: boolean;
  studentAnswer: string | null;
  solverAnswer: string | null;
  rules: RuleCheck[];
  /** 是否允许用求解比对补判错题；缺省 true（单测直调时） */
  canPromoteBySolver?: boolean;
}

export interface JudgeResult {
  verdict: Verdict;
  confidence: number;
  evidence: Record<string, unknown>;
}

const BASE_CONFIDENCE = {
  marked: 1,
  solved: 0.85,
  ruleFail: 0.9,
  unknown: 0.3,
} as const;

export function decide(input: JudgeInput): JudgeResult {
  const { teacherMark, subjective, studentAnswer, solverAnswer, rules } = input;
  const canPromoteBySolver = input.canPromoteBySolver ?? true;
  const rulesFailed = rules.filter((r) => !r.ok);

  if (subjective) {
    return {
      verdict: "unknown",
      confidence: 0,
      evidence: { reason: "主观题，不参与判定", rulesFailed },
    };
  }

  if (teacherMark === "wrong") {
    return {
      verdict: "wrong",
      confidence: BASE_CONFIDENCE.marked,
      evidence: { reason: "老师标记 ✗", rulesFailed },
    };
  }

  if (teacherMark === "right") {
    return {
      verdict: "right",
      confidence: BASE_CONFIDENCE.marked,
      evidence: {
        reason: "老师标记 ✓",
        // 老师打勾但规则算不通：不推翻，只记录，供事后排查
        suspicious: rulesFailed.length > 0 ? rulesFailed : undefined,
      },
    };
  }

  // 老师没批到这题，才看模型自己算的结果
  if (solverAnswer === null) {
    return {
      verdict: "unknown",
      confidence: BASE_CONFIDENCE.unknown,
      evidence: { reason: "老师无标记，且独立求解没有给出答案", rulesFailed },
    };
  }

  if (rulesFailed.length > 0) {
    return {
      verdict: "wrong",
      confidence: BASE_CONFIDENCE.ruleFail,
      evidence: { reason: "规则校验失败", rulesFailed },
    };
  }

  const cmp = compareAnswers(studentAnswer, solverAnswer);

  if (cmp === "equal") {
    return {
      verdict: "right",
      confidence: BASE_CONFIDENCE.solved,
      evidence: { reason: "独立求解与作答一致", studentAnswer, solverAnswer },
    };
  }

  if (cmp === "differ") {
    // 「漏批兜底」：老师没批到，但独立求解和学生作答对不上，补判为错。
    // 只在红笔机制可用时启用——那说明卷子确实是老师用红笔批的，掩膜能对账，
    // 漏批是真漏批。黑笔卷（整页 0% 红笔）上这条分支会把学生答案的转录噪声
    // 当成错因：2026-11-21 一页因此报了 14 道错题（实际 4 道）。
    if (!canPromoteBySolver) {
      return {
        verdict: "unknown",
        confidence: BASE_CONFIDENCE.unknown,
        evidence: { reason: "老师没批，独立求解与作答不一致——卷面非红笔批改，不据此判错", studentAnswer, solverAnswer },
      };
    }
    return {
      verdict: "wrong",
      confidence: BASE_CONFIDENCE.solved,
      evidence: { reason: "独立求解与作答不一致", studentAnswer, solverAnswer },
    };
  }

  return {
    verdict: "unknown",
    confidence: BASE_CONFIDENCE.unknown,
    evidence: { reason: "答案无法比较", studentAnswer, solverAnswer },
  };
}

/**
 * 掩膜对账。只比「有没有红笔」，不比数量：
 * 一个勾常被笔画断裂拆成几簇，背景里的红色物体也会进掩膜，
 * 数量对不上是常态，拿它扣分会把全部题目的置信度砸到地板上。
 *
 * 真正可靠的是存在性：模型说有标记但掩膜一个红像素都没有（或反过来）才说明有问题。
 */
export function applyClusterAgreement(
  result: JudgeResult,
  claimedMarks: number,
  foundClusters: number,
): JudgeResult {
  const claimed = claimedMarks > 0;
  const found = foundClusters > 0;
  if (claimed === found) return result;

  return {
    ...result,
    confidence: Number((result.confidence * 0.6).toFixed(3)),
    evidence: {
      ...result.evidence,
      presenceMismatch: { claimedMarks, foundClusters },
    },
  };
}
