import type { RawQuestion } from "./parse.js";

/**
 * 两轮提示词。第一轮"抄题"，第二轮"解题"——第二轮刻意不给学生答案，
 * 否则模型会顺着学生的思路走，等于让它给自己作证。
 */

export const TRANSCRIBE_SYSTEM = `你是一个把小学数学作业照片转成结构化数据的工具。只输出 JSON，不要解释。

输出格式：
{"questions":[{
  "originalNo": "卷面上印的编号，原样照抄",
  "kind": "choice|fill|unitFill|geometry|short",
  "stem": "题干原文，含括号与单位，不要改写",
  "figures": [图形参数，见下],
  "teacherMark": "right|wrong|none",
  "markBox": [x, y, w, h],
  "studentAnswer": "学生写的答案；没写就 null",
  "subjective": false
}]}

图形参数只支持四种，禁止编造坐标：
- {"type":"composite","layout":"stack|side","parts":[{"shape":"rect","width":"12","height":"4"} |
  {"shape":"triangle","base":"4.2","height":"2"} | {"shape":"trapezoid","top":"2.6","bottom":"5","height":"2.4"}]}
- {"type":"division","dividend":1000,"divisor":30,"quotient":33,"remainder":10}
- {"type":"cards","values":["2","4","5","6"],"picked":["2","4"]}
- {"type":"unitTable","rows":[["6平方千米","6000000平方米"]]}
尺寸一律写成字符串（"0.8"），不带单位。

红笔判定：老师画的单道斜线带钩是 right，两条交叉线是 wrong，没批到是 none。
只抄老师画的符号，不要自己判断对错。

每道有标记的题还要给 markBox：批改符号在整张图里的归一化位置，原点在左上，四个数都在 0–1 之间。
看不到符号就不要给这个字段，不要猜位置。`;

export const TRANSCRIBE_USER = `请转写这张作业照片里的全部题目，按卷面顺序。

要求：
1. 题干逐字照抄，包括（1）（2）这类小问编号；复合编号写进 originalNo，例如 "二.1"、"一（2）"。
   如果这道题在卷面上只有标号（如「（2）」），把所在大题标题里的公共题干一并写进 stem，
   保证单看 stem 就知道要做什么；不要把公共题干当成单独一道题。
2. 学生手写的答案抄进 studentAnswer，不要抄进 stem。
3. 图形只按上面四种参数描述，看不出尺寸就不要编。
4. 说理、比较类题目 subjective 置 true。`;

export function solveSystem(): string {
  return `你是一个小学数学老师。只输出 JSON，不要解释：
{"answers":[{"originalNo":"题目编号","answer":"最终结果"}]}

要求：
1. 自己独立算，不要猜测学生写了什么。
2. answer 只写最终结果，带单位，例如 "13.32 cm²"、"km²"、"200 米/分"。
3. 算不出来就跳过这一题，不要编。`;
}

export function solveUser(questions: RawQuestion[]): string {
  const list = questions
    .filter((q) => !q.subjective)
    .map((q) => ({
      originalNo: q.originalNo,
      kind: q.kind,
      stem: q.stem,
      figures: q.figures,
    }));

  return `题目如下（JSON）：\n${JSON.stringify(list, null, 2)}\n\n请逐题解答。`;
}

/**
 * 第三轮：只核对带图形题目的尺寸标注。
 *
 * 图形题第一轮要同时读题、读学生答案、读红笔，注意力被分散，尺寸容易串行
 * （真机实测：三角形底 4.2 高 2 被读成底 5 高 2.4）。单独问一次尺寸，只让它看图上的数字。
 */
export function figuresSystem(): string {
  return `你是一个核对小学数学作业图形标注的工具。只输出 JSON，不要解释。

输出格式：
{"figures":[{"originalNo":"题目编号","readable":true,"figures":[图形参数]}]}

图形参数只支持四种，禁止编造坐标：
- {"type":"composite","layout":"stack|side","parts":[{"shape":"rect","width":"12","height":"4"} |
  {"shape":"triangle","base":"4.2","height":"2"} | {"shape":"trapezoid","top":"2.6","bottom":"5","height":"2.4"}]}
- {"type":"division","dividend":1000,"divisor":30,"quotient":33,"remainder":10}
- {"type":"cards","values":["2","4","5","6"],"picked":["2","4"]}
- {"type":"unitTable","rows":[["6平方千米","6000000平方米"]]}

要求：
1. 只抄图上印着的数字，不要计算、不要补全。
2. 图上标着什么就写什么；同一道题的多个图形放在 parts 里，顺序照图。
3. 数字看不清就把 readable 置 false 并且不给 figures，不要猜。`;
}

export function figuresUser(questions: RawQuestion[]): string {
  const list = questions
    .filter((q) => q.figures.length > 0)
    .map((q) => ({ originalNo: q.originalNo }));

  return `下面这些题带图形，请逐题读出图上标注的尺寸（JSON）：\n${JSON.stringify(list, null, 2)}`;
}
