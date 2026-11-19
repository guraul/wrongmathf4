# DATA.md — 数据与文件

> 最后更新: 2026-11-18 | commit: `c2667fc`
> 覆盖路径: `packages/core/src/schema.ts`, `packages/core/src/ingest/pixels.ts`

## 数据模型

四类对象，定义在 `packages/core/src/schema.ts`，用 zod 校验：

| 对象 | 关键字段 | 说明 |
|---|---|---|
| `Batch` | `id, source, createdAt, status, pages, questions, htmlPath` | 一次上传 = 一个批次 = 一份复刻卷 |
| `Page` | `id, index, imagePath, width, height` | 批次里的一页 |
| `Question` | `originalNo, sequence, kind, stem, figures, teacherMark, solverAnswer, verdict, confidence, evidence` | 一道题 |
| `Figure` | `type` + 参数 | 四种：`composite` / `division` / `cards` / `unitTable` |

约定：

- **尺寸是字符串**（`"0.8"`），不用浮点，避免 `0.1+0.2` 这类误差进契约；生成器自己做转换并报错。
- `originalNo` 保留卷面原印编号（`2(1)`、`3(5)①`），`sequence` 只用于排序。
- `verdict` 三值，`unknown` 一律按 `wrong` 处理（宁可多报）。
- 转写投票的每轮结果可以在 `mergeRuns` 的返回值里拿到（`votes`），排查「为什么这题被判 none」时看它。
- `evidence` 存三票原始结论，**不进复刻卷**：`reason`、`rulesFailed`、`suspicious`（老师打勾但规则算不通）、`presenceMismatch`（模型说有标记但掩膜没找到）。

## 数据库（目标，M5 引入）

SQLite，单文件 `data/wrongmath.db`：

| 表 | 列 |
|---|---|
| `batches` | `id, source, created_at, status, html_path` |
| `pages` | `id, batch_id, idx, image_path, width, height` |
| `questions` | `id, page_id, original_no, sequence, kind, stem, teacher_mark, solver_answer, verdict, confidence, evidence_json` |
| `figures` | `id, question_id, spec_json` |

`data/` 已 gitignore，不入库。

## 文件布局

```
data/
├── wrongmath.db            # SQLite（目标）
├── uploads/<batchId>/      # 原始上传件
└── renders/<batchId>/      # 产物 HTML
```

## 保留策略

原图与产物**永久保留**，不自动清理。理由：判错时能回头核对原卷；单页约 600KB，一年不过数百兆。
需要清理时手工删 `data/` 下对应目录，不做定时任务。

## 回归基准

`test/fixtures/` 存原图，`docs/错题整理_*.html` 存人工整理的成品。
golden 测试只断言结构化数据（错题集合、题干文字、图形参数），不比像素。
