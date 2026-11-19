import type { TeacherMark } from "../schema.js";
import type { RawMark, RawPage, RawQuestion } from "../vlm/parse.js";

/** 投票后标记一定是三种之一：unread 只是"没读到"，不进最终结果 */
export interface ResolvedQuestion extends Omit<RawQuestion, "teacherMark"> {
  teacherMark: TeacherMark;
}

export interface ResolvedPage {
  questions: ResolvedQuestion[];
}

/**
 * 两轮转写投票。
 *
 * 真机上同一张图两次转写会读出不同的红笔符号和题号（三种结果都见过），
 * 所以对「老师到底批没批」这件事不能只信一次调用。
 *
 * 规则：两轮一致直接采用；不一致跑第三轮，两票多数决；三轮各不同 → none。
 * `none` 是保守选择——判 unknown 只会让人多看一眼，误判成错会给学生多做一道题。
 */

/**
 * 对齐用的题号键：去掉一切分隔符，只留字母数字。
 *
 * 模型会把同一道题写成 `二.1`、`二（1）`、`二、1` 三种样子，
 * 保留括号或点号就会当成三道题——真机上正是这样多出一个「二（1）」。
 */
export function markKey(originalNo: string): string {
  return originalNo
    .trim()
    .replace(/\s+/g, "")
    .replace(/[（）().、，,。:：]/g, "")
    .replace(/[０-９]/g, (ch) => String("０１２３４５６７８９".indexOf(ch)));
}

/**
 * 题目的完整对齐键 = 规范化题号 + 题干前缀，用于去重（不做跨轮对齐）。
 */
export function questionKey(q: { originalNo: string; stem: string }): string {
  return `${markKey(q.originalNo)}#${normalizeStem(q.stem)}`;
}

/** 归一化题干：全角转半角、去掉标点与空白，只留汉字字母数字，再算相似度才稳 */
function normalizeStem(stem: string): string {
  return stem
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/[^\p{Script=Han}A-Za-z0-9]/gu, "")
    .toLowerCase();
}

/** 同一题号 + 同一题干的条目只保留第一条（模型偶尔会把一行填空拆成好几条） */
export function dedupePage(page: RawPage): RawPage {
  const seen = new Set<string>();
  const kept: RawQuestion[] = [];

  for (const q of page.questions) {
    if (q.originalNo.trim() === "" || q.stem.trim() === "") continue;
    const key = questionKey(q);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(q);
  }

  return { questions: kept };
}

export interface Verdict3 {
  mark: TeacherMark;
  /** 原始票，可能含 unread（模型没读到这个字段） */
  votes: RawMark[];
}

/**
 * 多数决：`unread` 是弃权票，不参与分母。
 *
 * 这样两轮都漏读时结果是 `none`（保守），而不是被两票 unread 凑成"多数"；
 * 只有一票 right、一票 unread 时，right 作为唯一有效票胜出。
 */
export function voteMarks(marks: RawMark[]): Verdict3 {
  const counted = marks.filter((m): m is TeacherMark => m !== "unread");
  if (counted.length === 0) return { mark: "none", votes: marks };

  const counts = new Map<TeacherMark, number>();
  for (const m of counted) counts.set(m, (counts.get(m) ?? 0) + 1);

  let best: TeacherMark = "none";
  let bestCount = 0;
  for (const [mark, count] of counts) {
    if (count > bestCount) {
      best = mark;
      bestCount = count;
    }
  }

  // 必须严格过半（按有效票算），平票就是没结论
  const decided = bestCount * 2 > counted.length ? best : "none";
  return { mark: decided, votes: marks };
}

export interface ConsensusResult {
  page: ResolvedPage;
  /** 与 questions 一一对应的投票明细（同号多题不会互相覆盖） */
  votes: Verdict3[];
  /** 题数最多的那一轮是正文来源 */
  spineIndex: number;
}

/** 两段文本的相似度：按二元组算 Sørensen–Dice，对 OCR 噪声比编辑距离宽容 */
export function similarity(a: string, b: string): number {
  const left = normalizeStem(a);
  const right = normalizeStem(b);
  if (left === "" && right === "") return 1;
  if (left.length < 2 || right.length < 2) return left === right ? 1 : 0;

  const grams = new Map<string, number>();
  for (let i = 0; i < left.length - 1; i++) {
    const g = left.slice(i, i + 2);
    grams.set(g, (grams.get(g) ?? 0) + 1);
  }

  let hits = 0;
  for (let i = 0; i < right.length - 1; i++) {
    const g = right.slice(i, i + 2);
    const count = grams.get(g) ?? 0;
    if (count > 0) {
      hits += 1;
      grams.set(g, count - 1);
    }
  }

  return (2 * hits) / (left.length - 1 + right.length - 1);
}

/**
 * 两道题是同一题的可能性。
 *
 * 题干权重高（抄下来的字最稳），题号只作为辅助信号：
 * 模型会在不同轮次把同一题写成 `一（1）` 或 `1`，所以题号不同不能直接否定。
 */
export function questionScore(a: RawQuestion, b: RawQuestion): number {
  const sameNumber = markKey(a.originalNo) === markKey(b.originalNo) ? 1 : 0;
  // 题干占绝大部分权重：一页里同一大题下的小问常常共用题干，只能靠顺序区分；
  // 而编号写法在轮次之间会变，只当辅助信号。
  return 0.85 * similarity(a.stem, b.stem) + 0.15 * sameNumber;
}

/** 低于这个分就不认为是同一题 */
const MATCH_THRESHOLD = 0.5;

/**
 * 用动态规划把一轮的题对齐到底稿上，允许两边都有空位。
 *
 * 这比「按题号找」「按位置找」都稳：漏一道题只会在中间空出一格，
 * 不会让后面的题整体错位；编号写法变了也不影响，因为主要看题干。
 */
export function alignRun(spine: RawQuestion[], run: RawQuestion[]): {
  pairs: Array<[number, number]>;
  extra: number[];
} {
  const n = spine.length;
  const m = run.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const gain = questionScore(spine[i - 1] as RawQuestion, run[j - 1] as RawQuestion) - MATCH_THRESHOLD;
      const diagonal = gain > 0 ? (dp[i - 1]?.[j - 1] ?? 0) + gain : Number.NEGATIVE_INFINITY;
      dp[i]![j] = Math.max(dp[i - 1]?.[j] ?? 0, dp[i]?.[j - 1] ?? 0, diagonal);
    }
  }

  const pairs: Array<[number, number]> = [];
  const matchedRun = new Set<number>();
  let i = n;
  let j = m;

  while (i > 0 && j > 0) {
    const gain = questionScore(spine[i - 1] as RawQuestion, run[j - 1] as RawQuestion) - MATCH_THRESHOLD;
    const diagonal = gain > 0 ? (dp[i - 1]?.[j - 1] ?? 0) + gain : Number.NEGATIVE_INFINITY;
    const current = dp[i]?.[j] ?? 0;

    if (gain > 0 && Math.abs(current - diagonal) < 1e-9) {
      pairs.push([i - 1, j - 1]);
      matchedRun.add(j - 1);
      i -= 1;
      j -= 1;
    } else if ((dp[i - 1]?.[j] ?? 0) >= (dp[i]?.[j - 1] ?? 0)) {
      i -= 1;
    } else {
      j -= 1;
    }
  }

  const extra: number[] = [];
  for (let k = 0; k < m; k++) {
    if (!matchedRun.has(k)) extra.push(k);
  }

  return { pairs: pairs.reverse(), extra };
}

/**
 * 把多轮转写合成一份：正文取题数最多的那一轮，其余轮次按相似度对齐后投票。
 * 对齐不上的题（另一轮多读出来的）追加到末尾。
 */
export function mergeRuns(runs: RawPage[]): ConsensusResult {
  if (runs.length === 0) throw new Error("至少要有一轮转写结果");

  const cleaned = runs.map(dedupePage);

  let spineIndex = 0;
  for (let i = 1; i < cleaned.length; i++) {
    if ((cleaned[i] as RawPage).questions.length > (cleaned[spineIndex] as RawPage).questions.length) {
      spineIndex = i;
    }
  }

  const spine = cleaned[spineIndex] as RawPage;
  const others = cleaned.filter((_, i) => i !== spineIndex);

  const questions: ResolvedQuestion[] = spine.questions.map((q) => ({ ...q, teacherMark: "none" }));
  const votes: Verdict3[] = [];

  // 每轮对底稿的对齐结果，供投票与补题共用
  const alignments = others.map((run) => alignRun(spine.questions, run.questions));

  for (const [index, q] of spine.questions.entries()) {
    const marks: RawMark[] = [q.teacherMark];

    for (const [runIndex, run] of others.entries()) {
      const pair = alignments[runIndex]?.pairs.find(([spineIdx]) => spineIdx === index);
      if (pair === undefined) continue;
      const twin = run.questions[pair[1]];
      if (twin === undefined) continue;
      marks.push(twin.teacherMark);
    }

    const result = voteMarks(marks);
    votes.push(result);
    questions[index] = { ...q, teacherMark: result.mark };
  }

  // 另一轮里对不上的题按顺序补进来，各自再用剩下几轮投票
  for (const [runIndex, run] of others.entries()) {
    const alignment = alignments[runIndex];
    if (alignment === undefined) continue;

    for (const extraIndex of alignment.extra) {
      const q = run.questions[extraIndex];
      if (q === undefined) continue;

      const marks: RawMark[] = [q.teacherMark];
      for (const [otherIndex, otherRun] of others.entries()) {
        if (otherIndex === runIndex) continue;
        const twin = otherRun.questions.find((x) => questionScore(x, q) >= MATCH_THRESHOLD);
        if (twin !== undefined) marks.push(twin.teacherMark);
      }

      const result = voteMarks(marks);
      votes.push(result);
      questions.push({ ...q, teacherMark: result.mark });
    }
  }

  return { page: { questions }, votes, spineIndex };
}

/**
 * 两轮里是否存在标记分歧。
 * 与 mergeRuns 共用同一套对齐，避免「同一题被当成两题」时漏判分歧。
 */
export function hasDisagreement(runs: RawPage[]): boolean {
  if (runs.length < 2) return false;
  return mergeRuns(runs).votes.some((verdict) => new Set(verdict.votes).size > 1);
}

export interface ConsensusOptions {
  /** 最多跑几轮，默认 3（两轮一致就只跑两轮） */
  maxRuns?: number;
  /** 每轮结束回调，便于打日志 */
  onRun?: (index: number, page: RawPage) => void;
}

/**
 * 带投票的转写：先跑两轮，只在有分歧时补第三轮。
 * 传的是「怎么跑一轮」的函数，测试里换成假实现就不打网络。
 */
export async function transcribeWithConsensus(
  transcribe: () => Promise<RawPage>,
  opts: ConsensusOptions = {},
): Promise<ConsensusResult & { runs: number }> {
  const maxRuns = Math.max(2, opts.maxRuns ?? 3);

  const runs: RawPage[] = [];
  for (let i = 0; i < 2; i++) {
    runs.push(await transcribe());
    opts.onRun?.(i + 1, runs[i] as RawPage);
  }

  if (maxRuns > 2 && hasDisagreement(runs)) {
    runs.push(await transcribe());
    opts.onRun?.(3, runs[2] as RawPage);
  }

  return { ...mergeRuns(runs), runs: runs.length };
}
