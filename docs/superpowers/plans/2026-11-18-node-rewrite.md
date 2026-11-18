# WrongMath V2：改成一栈 Node

> 2026-11-18 · 状态：方案已定，待开工
> 替代现有的 Python V1（`agent/` `core/` `servers/` `frontend/`）

## 1. 为什么重做

V1 的链路是「图片 → GLM-4.5V → 一段 Markdown 空白卷」，它做不出人工整理的那三份错题卷。

人工那三份之所以准，靠四个动作，其中只有一个跟模型有关：

1. 放大到 2–4 倍逐题看（V1 反而把图缩小到 2000px）
2. 红笔颜色掩膜定位老师标记（V1 没有）
3. **把每道题独立重算一遍**（V1 没有，这是准确的关键）
4. 图形按标注尺寸重画，而不是让模型给坐标（V1 直接放弃，输出占位符）

## 2. 已定决策

| # | 决策 | 结论 | 依据 |
|---|---|---|---|
| 1 | 技术栈 | Node 单栈，Python 全部退休 | 用户 2026-11-18 |
| 2 | 仓库形态 | pnpm workspace，两包：`core` + `web` | 只有一个消费方，`shared` 无第二个使用者 |
| 3 | Web 框架 | Next.js 14 App Router | 参考 homebase |
| 4 | 持久化 | `better-sqlite3` | 用户选定 |
| 5 | 端口 | 可配置，默认 `19238`（读 `PORT`） | 用户 |
| 6 | 模型 | DeepSeek Flash（官方 id `deepseek-flash`），`detail: "original"` | 查证：`low` 会压到 512×512，小字必糊 |
| 7 | 调用轮次 | 每页 2 轮（识别 / 独立解题），不一致再跑第 3 轮，3 轮封顶 | Q13 |
| 8 | 判定主票 | **老师红笔为主**；没留标记时才看独立求解 | Q12 |
| 9 | 流程内无人工 | 不弹窗、不等确认、不阻塞；低置信不中断 | 用户 2026-11-18 |
| 10 | 输出 | 一份 HTML / 一个批次，只含错题 | Q5 / Q16 |
| 11 | 留痕 | 复刻卷里不加任何提示；判定来源只写 DB | Q14 |
| 12 | 留存 | 原图与产物永久保留 | Q17 |
| 13 | 交付流程 | `@guraul/dsh-pipeline`，`init` 生成 shim | Q1（homebase 的脚本是它的生成物） |
| 14 | 知识库 | 六件套 + 日更巡检任务 | Q18 |
| 15 | MCP | 删除 | 无代码引用 |
| 16 | PDF 合并 | 删除（要打印从浏览器打） | Q5=a |

## 3. 架构

```
上传 → ingest ──→ read ──→ judge ──→ render ──→ 下载 HTML
        │           │         │          │
        │           │         │          └─ 结构化 JSON → HTML（纯函数，可 diff）
        │           │         └─ 三票：红笔 / 独立求解 / 规则校验
        │           └─ DeepSeek Flash，放大 2–3×，两轮
        └─ PDF→PNG、EXIF 旋转、放大、红笔掩膜
```

- `packages/core`：纯函数，零 IO，可单独跑 vitest
- `packages/web`：Next.js 页面 + API 路由 + 进程内队列（`instrumentation.ts`）
- 单进程，端口 19238，无 worker、无反向代理

## 4. 数据模型（SQLite）

| 表 | 列 |
|---|---|
| `batches` | `id, source, created_at, status, html_path` |
| `pages` | `id, batch_id, idx, image_path, width, height` |
| `questions` | `id, page_id, original_no, sequence, kind, stem, teacher_mark, solver_answer, verdict, confidence, evidence_json` |
| `figures` | `id, question_id, spec_json` |

`verdict` 只有三值：`wrong` / `right` / `unknown`（`unknown` 按 `wrong` 处理，宁可多报）。

## 5. 判定规则（写死，不留人工口子）

```
老师 ✗                    → wrong
老师 √                    → right
老师无标记：
  独立求解判错            → wrong
  独立求解判对            → right
  两轮不一致 → 第三轮再判 → 仍不一致 → wrong（多报）
规则校验失败（单位/面积分割/竖式自洽）→ 覆盖为 wrong
主观题（说理、比较）       → 转写原文，不参与判定
```

## 6. 图形：参数化

| 生成器 | 参数 |
|---|---|
| `composite` | 部件（rect / triangle / trapezoid）+ 叠放方式 + 每边标注 |
| `division` | 被除数、除数、商、余数、试商步骤 |
| `cards` | 方框排列 + 每个数 + 取值标记 |
| `unitTable` | 行列 + 单元格 |

每个生成器配一个自洽测试：分割面积之和 = 整体面积、被除数 = 商×除数+余数。

## 7. 目录

```
wrongmath/
├── package.json  pnpm-workspace.yaml  GLOSSARY.md
├── packages/
│   ├── core/
│   │   ├── src/ingest/{image,pdf,mask}.ts
│   │   ├── src/vlm/{client,prompt}.ts
│   │   ├── src/judge/{verdict,rules,consensus}.ts
│   │   ├── src/render/{page,question,css}.ts
│   │   ├── src/figures/{composite,division,cards,unit-table}.ts
│   │   └── test/{fixtures,*.test.ts}
│   └── web/
│       ├── app/(页面)  app/api/(路由)
│       ├── lib/{db,queue,storage,logger}.ts
│       └── instrumentation.ts
├── docs/knowledge-base/{INDEX,DATA,API,ARCHITECTURE,CONVENTIONS,OPERATIONS}.md + modules/
├── docs/pipeline/  scripts/pipeline/  tools/
├── deploy/wrongmath.service
└── test/fixtures/2026-11-17/{p1-geo5.jpg,p2-geo6.jpg,expected.json}
```

## 8. 里程碑

| 阶段 | 内容 | 人日 | 验收 |
|---|---|---|---|
| M0 | monorepo、契约、KB 骨架、dsh-pipeline init | 3 | `pnpm test` 空跑绿、`kb check` 绿 |
| M1 | ingest（放大、掩膜、PDF）、删死代码 665 行 | 3 | 命令行产出掩膜 PNG |
| M2 | VLM 识别 + 三票判定 + 只读调试报告 | 5 | 两份 fixture 的错题集合与人工结论一致 |
| M3 | 文本题渲染器 | 3 | 能替代手写 HTML 的文本部分 |
| M4 | 四个图形生成器 | 5 | 组合图形渲染与手写版一致 |
| M5 | Web UI（上传/列表/预览/下载） | 2.5 | 浏览器端到端可用 |
| M6 | golden 回归 + 三份历史成品迁移 | 2 | `pnpm test` 全绿 |
| M7 | 删 Python、systemd、接 KB 日更 | 2 | 单栈运行，`kb queue` 能认出本仓 |

合计约 25.5 人日。M0–M3（约 2 周）即可产出可用的"自动挑错 + 文本题复刻"。

## 9. 验收（golden）

- L1 自动断言（CI 必过）：错题编号集合、题干文字、关键数字、图形参数 = `expected.json`
- L2 人工看图（PR 内贴截图）：图形渲染是否像原卷
- 断言"渲染器确定性"：同一份 JSON 渲染两次，字节一致

## 10. 删除清单

`agent/` `core/` `servers/` `config/` `frontend/` `main.py` `requirements.txt` `tests/`
`htmlcov/` `.pytest_cache/` `deploy/wrongmath.service`（改写为 node 版）

保留：`docs/superpowers/`（历史）、`output/`（老产物）、`.env`（新增 `DEEPSEEK_API_KEY`）

回滚：删前打 tag `v1-python`。

## 11. 运维

- 端口 `PORT`（默认 19238），`DB_PATH`，`DATA_DIR`，`DEEPSEEK_API_KEY`，`LOG_LEVEL`
- 模型超时 60s，失败重试 2 次退避；单页失败标 `failed`，不阻塞整批
- 知识库由 DSH 定时任务「知识库日更队列巡检」维护；M7 后把本仓加进该任务的 4 仓列表
  （需要 `guraul/wrongmathf4` 的 issue 权限 + `dsh-pipeline kb check` 绿）

## 12. 未决

- 模型从 GLM-4.5V 换到 DeepSeek Flash 后，小字识别是否退化 → M2 用两份 fixture 做 A/B
- `docs/knowledge-base` 六篇的具体拆分 → M0 落
