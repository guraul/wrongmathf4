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
 * 两道题是不是「同一题的不同抄法」——一方的题干完整包含另一方。
 *
 * 专门治这类噪声：同一道题一轮抄成「第3天 二（2） 用递等式计算……2.5×4.4×1.25」，
 * 另一轮只抄「用递等式计算……2.5×4.4×1.25」。相似度算得出来但不够稳，
 * 而「包含」关系很硬。长度差异过大的不算，免得把共享大题干的相邻小问并掉。
 */
export function isDuplicateStem(a: RawQuestion, b: RawQuestion): boolean {
  // 题号对不上就先别合并：同一大题下几道小问常常共用一模一样的题干，
  // 只靠题干会把它们并成一题（2026-11-17 那套几何卷就是这个形状）。
  const ka = markKey(a.originalNo);
  const kb = markKey(b.originalNo);
  const numberCompatible = ka === kb || ka.endsWith(kb) || kb.endsWith(ka);
  if (!numberCompatible) return false;

  const left = stemCore(a.stem);
  const right = stemCore(b.stem);
  if (left === "" || right === "") return false;
  if (left === right) return true;
  const shorter = left.length <= right.length ? left : right;
  const longer = left.length <= right.length ? right : left;
  if (!longer.includes(shorter)) return false;
  return shorter.length >= longer.length * 0.6;
}

/**
 * 题干里真正区分题目内容的那一段：去掉「二、用递等式计算，能巧算的要巧算。」这类
 * 大题公共引导语，以及行首编号，只留题面。
 *
 * 不做这一步的话，同一道题两轮抄法不同（一轮带「第3天 二（1）」，一轮只有「（1）…」）
 * 会被当成两道题，题数虚增。
 */
export function stemCore(stem: string): string {
  const parts = stem.split(/[。：:]/);
  const tail = (parts[parts.length - 1] ?? stem).replace(/^[\s\d（(）).、]+/, "");
  return normalizeStem(tail);
}

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
/**
 * 把重复抄法的题并掉（题面核心相同 + 题号兼容）。
 *
 * 重复项只是"同一题换了个抄法"，它那一票已经投过；若再和已收敛的判定对投，
 * 两票平局会把「错」翻成「没批」（2026-11-21 黑笔卷上会漏一道真错题）。
 * 所以已有明确判定时以它为准，只在它还是 none/unread 时采纳重复项的标记。
 */
export function dedupeResolved(
  questions: ResolvedQuestion[],
  votes: Verdict3[],
): { questions: ResolvedQuestion[]; votes: Verdict3[] } {
  // 先按题面归组，再逐组定夺：这样同一题出现 3 个以上抄法时，
  // 结果与抄写顺序无关（原先先到先得，✗ 和 ✓ 谁在前谁赢）。
  interface Group {
    question: ResolvedQuestion;
    /** 归组时各成员自己的判定 */
    marks: TeacherMark[];
    /** 单成员组沿用原票；只有真合并过才重建，避免抹掉跨轮分歧信息 */
    votes: Verdict3[];
    merged: boolean;
  }
  const groups: Group[] = [];

  for (const [index, q] of questions.entries()) {
    const vote = votes[index] as Verdict3 | undefined;
    const twin = groups.find((group) => isDuplicateStem(group.question, q));
    if (twin !== undefined) {
      twin.merged = true;
      twin.marks.push(q.teacherMark);
      if (vote !== undefined) twin.votes.push(vote);
      continue;
    }
    groups.push({
      question: q,
      marks: [q.teacherMark],
      votes: vote === undefined ? [] : [vote],
      merged: false,
    });
  }

  const deduped: ResolvedQuestion[] = [];
  const dedupedVotes: Verdict3[] = [];

  for (const group of groups) {
    if (!group.merged) {
      deduped.push(group.question);
      dedupedVotes.push(group.votes[0] ?? { mark: group.question.teacherMark, votes: [] });
      continue;
    }

    const marked = new Set(
      group.marks.filter((mark): mark is TeacherMark => mark === "wrong" || mark === "right"),
    );
    const unread = group.votes.some((vote) => vote.votes.includes("unread"));

    // 两种不同标记同时出现 → 读不准，按"没批"处理，不猜
    const resolved: TeacherMark = marked.size === 1 ? ([...marked][0] as TeacherMark) : "none";

    deduped.push({ ...group.question, teacherMark: resolved });
    // 合并后的票记成干净的一票，避免制造"假分歧"白跑第三轮；
    // 真有 unread 才保留它，让第三轮照常补。
    dedupedVotes.push({
      mark: resolved,
      votes: unread ? [resolved, "unread"] : [resolved],
    });
  }

  return { questions: deduped, votes: dedupedVotes };
}

export function mergeRuns(runs: RawPage[]): ConsensusResult {
  if (runs.length === 0) throw new Error("至少要有一轮转写结果");

  const cleaned = runs.map(dedupePage);

  // 题底选「旁证最多、独有最少」的那一轮，而不是题数最多的那一轮。
  // 平局时取更短的那一轮：单轮独有的带标记题按不可信处理（精度优先），
  // 只能靠多轮共识或第三轮补齐，不能靠「多抄了就该算数」。
  // 原先取最多：某轮把同一题抄成两条、或多编出几道题时，它会成为底稿，
  // 另一轮真实结果反而被当成"补题"追加——2026-11-21 第 1 页就是这么膨胀到 17 题的。
  const corroborated = cleaned.map((page, i) =>
    (page as RawPage).questions.filter((q) =>
      cleaned.some(
        (other, j) =>
          i !== j &&
          (other as RawPage).questions.some((candidate) => questionScore(candidate, q) >= MATCH_THRESHOLD),
      ),
    ).length,
  );
  const lengths = cleaned.map((page) => (page as RawPage).questions.length);
  let spineIndex = 0;
  for (let i = 1; i < cleaned.length; i++) {
    const unI = (lengths[i] ?? 0) - (corroborated[i] ?? 0);
    const unBest = (lengths[spineIndex] ?? 0) - (corroborated[spineIndex] ?? 0);
    const better =
      (corroborated[i] ?? 0) !== (corroborated[spineIndex] ?? 0)
        ? (corroborated[i] ?? 0) > (corroborated[spineIndex] ?? 0)
        : unI !== unBest
          ? unI < unBest
          : (lengths[i] ?? 0) < (lengths[spineIndex] ?? 0);
    if (better) spineIndex = i;
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

      // 只有这一轮抄出来的题：带标记的要求别轮能找到同一题才补进来，无标记的允许补。
      // 单轮独有的带标记题基本都是模型看错/编出来的（2026-11-21 第 1 页多出来的 7 道
      // 就是这么来的）；无标记的题不影响错题集，漏抄的可能性更大。
      // 只对「判错」要求旁证：判错会直接进错题卷，假错题代价最高；
      // 「打勾/没标记」的题多留一条只是多一点噪声，不会让家长多做错题。
      if (others.length > 0 && q.teacherMark === "wrong") {
        const corroborated = others.some(
          (other) =>
            other !== run &&
            other.questions.some((candidate) => questionScore(candidate, q) >= MATCH_THRESHOLD),
        );
        if (!corroborated) continue;
      }

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

  // 收尾去重：对齐没配上的重复题（同一题换个前缀抄）在这里并掉，
  // 否则它们会被当成"另一轮独有的题"追加，题数虚增（2026-11-21 第 2 页 10→14 就是这么来的）。
  const { questions: deduped, votes: dedupedVotes } = dedupeResolved(questions, votes);

  return { page: { questions: deduped }, votes: dedupedVotes, spineIndex };
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
