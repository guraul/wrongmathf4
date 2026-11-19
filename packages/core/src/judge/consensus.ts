import type { TeacherMark } from "../schema.js";
import type { RawPage, RawQuestion } from "../vlm/parse.js";

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
  return `${markKey(q.originalNo)}#${normalizeStem(q.stem).slice(0, 24)}`;
}

function normalizeStem(stem: string): string {
  return stem.replace(/\s+/g, "");
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
  votes: TeacherMark[];
}

/** 三票（或两票）多数决：出现次数最多且过半才采用，否则 none */
export function voteMarks(marks: TeacherMark[]): Verdict3 {
  const counts = new Map<TeacherMark, number>();
  for (const m of marks) counts.set(m, (counts.get(m) ?? 0) + 1);

  let best: TeacherMark = "none";
  let bestCount = 0;
  for (const [mark, count] of counts) {
    if (count > bestCount) {
      best = mark;
      bestCount = count;
    }
  }

  // 必须严格过半，平票就是没结论
  const decided = bestCount * 2 > marks.length ? best : "none";
  return { mark: decided, votes: marks };
}

export interface ConsensusResult {
  page: RawPage;
  /** 每题最终采用的标记与原始票，进 evidence 用 */
  votes: Map<string, Verdict3>;
  /** 题数最多的那一轮是正文来源 */
  spineIndex: number;
}

/**
 * 把多轮转写合成一份。
 *
 * 对齐是两级：同一题号在某轮只出现一次就按题号对齐；同号多次出现（一页里 6 个填空都叫「一」）
 * 才退回题干匹配 + 顺序配对。只按「题号 + 题干前缀」对齐会让题干有点出入的同一道题变成两道，
 * 真机上三轮 4 题直接膨胀成 9 题。
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

  const votes = new Map<string, Verdict3>();

  const merged = spine.questions.map((q, index) => {
    const marks: TeacherMark[] = [q.teacherMark];

    for (const run of others) {
      const twin = findTwin(q, index, spine, run);
      if (twin !== null) marks.push(twin.teacherMark);
    }

    const result = voteMarks(marks);
    votes.set(q.originalNo, result);
    return { ...q, teacherMark: result.mark };
  });

  // 底稿里完全没有的题号才补进来（同号只是题干有出入的，已经对齐掉了）
  const spineNumbers = new Set(spine.questions.map((q) => markKey(q.originalNo)));
  const extra: RawQuestion[] = [];
  const used = new Set(merged.map((q) => questionKey(q)));

  for (const run of others) {
    // 题数相同 = 已经按位置对齐完，不能再把这一轮整页当成"新题"补回来
    if (run.questions.length === spine.questions.length) continue;

    for (const q of run.questions) {
      if (spineNumbers.has(markKey(q.originalNo))) continue;
      const key = questionKey(q);
      if (used.has(key)) continue;
      used.add(key);
      extra.push(q);
    }
  }

  for (const q of extra) {
    const marks = cleaned
      .map((run) => run.questions.find((x) => questionKey(x) === questionKey(q)))
      .filter((x): x is RawQuestion => x !== undefined)
      .map((x) => x.teacherMark);
    votes.set(q.originalNo, voteMarks(marks));
  }

  return { page: { questions: [...merged, ...extra] }, votes, spineIndex };
}

/**
 * 在另一轮里找同一道题。
 *
 * 第一优先是**位置**：同一张图按顺序转写，第 n 题对第 n 题最稳。
 * 真机上两轮的编号写法会变（`一（1）` 与 `1` 混着来），只按题号对齐会把整页当成两套题，
 * 三轮 4 题直接膨胀成 8–9 题。
 *
 * 只有在两轮题数不同（漏题或某轮把一行拆成两行）时，才退回题号 → 题干 → 顺序。
 */
function findTwin(target: RawQuestion, index: number, spine: RawPage, run: RawPage): RawQuestion | null {
  if (run.questions.length === spine.questions.length) {
    return (run.questions[index] ?? null) as RawQuestion | null;
  }

  const number = markKey(target.originalNo);
  const sameNumber = run.questions.filter((q) => markKey(q.originalNo) === number);

  if (sameNumber.length === 0) return null;
  if (sameNumber.length === 1) return sameNumber[0] as RawQuestion;

  const exact = sameNumber.find((q) => normalizeStem(q.stem) === normalizeStem(target.stem));
  if (exact !== undefined) return exact;

  // 同号多题且题干对不上：按该号在底稿里的第几个出现，去对另一轮的第几个
  const indexInSpine = spine.questions.filter((q) => markKey(q.originalNo) === number).indexOf(target);
  return (sameNumber[indexInSpine] ?? null) as RawQuestion | null;
}

/**
 * 两轮里是否存在标记分歧。
 * 必须和 mergeRuns 用同一套对齐，否则「同一题被当成两题」时分歧检测会漏。
 */
export function hasDisagreement(runs: RawPage[]): boolean {
  if (runs.length < 2) return false;
  for (const verdict of mergeRuns(runs).votes.values()) {
    if (new Set(verdict.votes).size > 1) return true;
  }
  return false;
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
