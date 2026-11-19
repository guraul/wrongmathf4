import { describe, expect, it } from "vitest";

import { renderFigure } from "../src/render/figures.js";
import { renderWorksheet } from "../src/render/html.js";
import { Figure, Question } from "../src/schema.js";

const composite: Figure = {
  type: "composite",
  layout: "stack",
  unit: "cm",
  parts: [
    { shape: "triangle", base: "4.2", height: "2" },
    { shape: "trapezoid", top: "2.6", bottom: "5", height: "2.4" },
  ],
};

const division: Figure = { type: "division", dividend: 1000, divisor: 30, quotient: 33, remainder: 10 };
const cards: Figure = { type: "cards", values: ["2", "4", "5"], picked: ["4"] };
const table: Figure = { type: "unitTable", rows: [["6 平方千米", "6000000 平方米"]] };

describe("组合图形", () => {
  const svg = renderFigure(composite);

  it("视口尺寸能容纳下全部内容（含留白）", () => {
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('class="figure figure-composite"');

    const width = Number(svg.match(/width="([\d.]+)"/)?.[1]);
    const height = Number(svg.match(/height="([\d.]+)"/)?.[1]);
    const [vbW, vbH] = (svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/) ?? []).slice(1).map(Number);

    expect(width).toBe(vbW);
    expect(height).toBe(vbH);
    // 梯形下底 5cm × 26px = 130，两侧留白各 52
    expect(vbW).toBe(130 + 104);
  });

  it("每个尺寸都标出来（少一个就算不出面积）", () => {
    for (const label of ["4.2", "2", "2.6", "2.4", "5"]) {
      expect(svg).toContain(`>${label}</text>`);
    }
    expect(svg).toContain("单位：cm");
  });

  it("并排布局走另一条分支", () => {
    const side = renderFigure({ ...composite, layout: "side" });
    expect(side).toContain('class="figure figure-composite"');
    expect(side).not.toBe(svg);
  });
});

describe("除法竖式", () => {
  const svg = renderFigure(division);

  it("是合法 SVG，且两次渲染一致", () => {
    expect(svg.startsWith("<svg")).toBe(true);
    expect(renderFigure(division)).toBe(svg);
  });

  it("画出被除数、除数、商与余数", () => {
    expect(svg).toContain("1000");
    expect(svg).toContain("30");
    expect(svg).toContain("33");
    expect(svg).toContain("余 10");
  });
});

describe("数字卡片", () => {
  const svg = renderFigure(cards);

  it("是合法 SVG，且两次渲染一致", () => {
    expect(svg.startsWith("<svg")).toBe(true);
    expect(renderFigure(cards)).toBe(svg);
  });

  it("每张卡都画出来，选中的有高亮", () => {
    expect((svg.match(/<rect/g) ?? []).length).toBe(3);
    expect(svg).toContain("#e8eef7");
  });
});

describe("单位表格", () => {
  const svg = renderFigure(table);

  it("是合法 SVG，且两次渲染一致", () => {
    expect(svg.startsWith("<svg")).toBe(true);
    expect(renderFigure(table)).toBe(svg);
  });

  it("不会多出空行", () => {
    // 1 行数据 → 画布高度 32px，不能多出表头那样的空行
    expect(svg).toContain('height="32"');
  });

  it("两列都在", () => {
    expect(svg).toContain("6 平方千米");
    expect(svg).toContain("6000000 平方米");
  });
});

describe("转义", () => {
  it("卡片与表格里的文本被转义", () => {
    const evilCards = renderFigure({ type: "cards", values: ["<b>"], picked: [] });
    expect(evilCards).toContain("&lt;b&gt;");
    expect(evilCards).not.toContain("<b>");

    const evilTable = renderFigure({ type: "unitTable", rows: [["<i>", "&amp;"]] });
    expect(evilTable).toContain("&lt;i&gt;");
    expect(evilTable).not.toContain("<i>");
  });
});

describe("接进复刻卷", () => {
  const question = Question.parse({
    id: "q1",
    originalNo: "一（2）",
    sequence: 1,
    kind: "geometry",
    stem: "求组合图形的面积。",
    figures: [composite],
    teacherMark: "wrong",
    solverAnswer: "13.32",
    verdict: "wrong",
    confidence: 1,
    evidence: {},
  });

  it("默认渲染真 SVG，不再出现占位框", () => {
    const html = renderWorksheet([question]);
    expect(html).toContain("<svg");
    expect(html).not.toContain("图形待生成");
  });

  it("渲染前按 sequence 排序，不依赖数组顺序", () => {
    const later = Question.parse({ ...question, id: "q2", sequence: 2, stem: "第二题" });
    const html = renderWorksheet([later, question]);

    // 传进来的顺序是 [第二题, 第一题]，输出必须按 sequence 排
    expect(html.indexOf("求组合图形的面积")).toBeLessThan(html.indexOf("第二题"));
    expect(html).toContain('<span class="no">1.</span>');
  });
});
