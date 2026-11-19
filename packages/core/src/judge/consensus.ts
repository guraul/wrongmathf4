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
 * 题目的完整对齐键 = 规范化题号 + 题干前缀。
 *
 * 只按题号对齐会误伤：同一页里「二.1」（单位题）和「二（1）」（选择题）可能真的是两道题，
 * 题干不同就必须分开；题干相同才是同一道题的不同写法。
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
 * 把多轮转写合成一份：正文取题数最多的那轮（其次是最新的一轮），
 * 标记取所有轮次的多数决。
 */
export function mergeRuns(runs: RawPage[]): ConsensusResult {
  if (runs.length === 0) throw new Error("至少要有一轮转写结果");

  const cleaned = runs.map(dedupePage);

  // 正文以题数最多的那轮为底，再把其他轮里多出来的题补进来（某轮漏题不该丢题）
  let spineIndex = 0;
  for (let i = 1; i < cleaned.length; i++) {
    if ((cleaned[i] as RawPage).questions.length > (cleaned[spineIndex] as RawPage).questions.length) {
      spineIndex = i;
    }
  }

  const spine = cleaned[spineIndex] as RawPage;
  const questions: RawQuestion[] = [...spine.questions];
  const seen = new Set(questions.map((q) => questionKey(q)));

  for (const run of cleaned) {
    for (const q of run.questions) {
      const key = questionKey(q);
      if (seen.has(key)) continue;
      seen.add(key);
      questions.push(q);
    }
  }

  const votes = new Map<string, Verdict3>();
  const merged = questions.map((q) => {
    const key = questionKey(q);
    const marks = cleaned
      .map((run) => run.questions.find((x) => questionKey(x) === key))
      .filter((x): x is RawQuestion => x !== undefined)
      .map((x) => x.teacherMark);

    const result = voteMarks(marks);
    votes.set(q.originalNo, result);
    return { ...q, teacherMark: result.mark };
  });

  return { page: { questions: merged }, votes, spineIndex };
}

/** 两轮里是否存在标记分歧 */
export function hasDisagreement(runs: RawPage[]): boolean {
  if (runs.length < 2) return false;

  const byKey = new Map<string, TeacherMark[]>();
  for (const run of runs) {
    for (const q of dedupePage(run).questions) {
      const key = questionKey(q);
      const list = byKey.get(key) ?? [];
      list.push(q.teacherMark);
      byKey.set(key, list);
    }
  }

  for (const marks of byKey.values()) {
    if (new Set(marks).size > 1) return true;
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
