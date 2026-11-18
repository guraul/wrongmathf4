# INDEX.md — 项目知识库索引总览

> 最后更新: 2026-11-18 | commit: `425cf5f`
> 覆盖路径: `package.json`, `pnpm-workspace.yaml`, `.dsh/pipeline.json`, `packages/core/src/index.ts`, `packages/core/src/ingest/pixels.ts`, `packages/core/src/judge/verdict.ts`, `packages/core/src/vlm/client.ts`, `packages/web/app/page.tsx`

## 使用说明

- **每次对话先读本文件**，建立全局认知后再按需加载对应文档。
- **维护约定**：涉及架构/接口/数据模型的变更，同 PR 更新对应文档。每篇顶部两行是 canonical 页眉
  （`最后更新 + commit` 与 `覆盖路径`），`dsh-pipeline kb check --strict` 会校验它们。

## 文档导航

| 文档 | 什么时候读 |
|---|---|
| [INDEX.md](INDEX.md) | 每次对话的第一份（本文件） |
| [ARCHITECTURE.md](ARCHITECTURE.md) | 改管线、改判定规则、看图怎么画 |
| [DATA.md](DATA.md) | 改数据模型、增删表、改文件布局 |
| [API.md](API.md) | 加接口、改接口入参出参 |
| [CONVENTIONS.md](CONVENTIONS.md) | 动手前确认编码约定与红线 |
| [OPERATIONS.md](OPERATIONS.md) | 装依赖、起服务、部署、排障 |

## 项目一句话定位

把手机拍的数学作业变成可打印的错题卷：识别题目、判断对错、用结构化数据重画图形与版面，输出单文件 HTML。

## 当前阶段

**M2（识别 + 三票判定）已完成**（真机回归待配 `DEEPSEEK_API_KEY`）。渲染与界面尚未开始；V1 的 Python 代码仍在仓内运行，按计划在 M3–M7 逐段替换。

| 能力 | 状态 |
|---|---|
| 批次/页面/题目/图形四类契约 | 现行（`packages/core/src/schema.ts`） |
| 图片放大、红笔掩膜 | 现行（`packages/core/src/ingest/`） |

| HTML 复刻渲染 | 目标（M3–M4） |
| 上传/列表/预览/下载界面 | 目标（M5） |

## 技术栈

| 类别 | 选型 | 说明 |
|---|---|---|
| 运行时 | Node.js ≥ 24 | 单进程，无 worker |
| 包管理 | pnpm workspace | `packages/*` |
| Web | Next.js 14 App Router | 页面与 API 路由同进程 |
| 契约 | zod | 模型输出必须过校验才进管线 |
| 测试 | vitest | 只测纯逻辑，不测浏览器 |
| 存储 | better-sqlite3（目标） | M0 尚未引入 |
| 模型 | DeepSeek Flash（目标） | 官方 id `deepseek-flash`，视觉输入 |

## 仓库拓扑

```
wrongmathf4/
├── package.json              # 根脚本：test / typecheck / dev / build
├── pnpm-workspace.yaml       # 工作区定义 + 构建白名单（allowBuilds）
├── tsconfig.base.json        # 共享编译选项
├── vitest.config.ts          # 测试入口（packages/*/test）
├── GLOSSARY.md               # 术语表，改判定规则前先读
├── .dsh/pipeline.json        # 交付流程配置（checks.packages）
├── scripts/pipeline/         # 由 dsh-pipeline init 生成，勿手改
├── docs/
│   ├── knowledge-base/       # 本知识库
│   ├── pipeline/             # 流程说明（生成物）
│   ├── superpowers/          # 历史设计与方案
│   └── 错题整理_*.html        # 人工整理的基准成品
├── packages/
│   ├── core/                 # 纯逻辑：契约、识别、判定、渲染、图形
│   └── web/                  # Next.js 页面与 API
├── test/fixtures/            # 回归用原图（2026-11-17 等）
└── agent/ core/ servers/     # V1 Python，计划 M1–M7 删除
```

## 模块地图

| 模块 | 位置 | 职责 |
|---|---|---|
| 契约 | `packages/core/src/schema.ts` | 四类数据的 zod 定义与类型导出 |
| 图像输入 | `packages/core/src/ingest/` | 摆正、放大、红笔掩膜 |
| 识别 | `packages/core/src/vlm/` | 图片 → 结构化题目（两轮：转写 / 独立求解） |
| 判定 | `packages/core/src/judge/` | 三票收敛、答案比对、掩膜聚类与对账 |
| 渲染 | `packages/core/src/render/`（待建） | 结构化数据 → HTML |
| 图形 | `packages/core/src/figures/`（待建） | 参数 → SVG |
| 接口 | `packages/web/app/api/`（待建） | 上传、查询、下载 |
| 界面 | `packages/web/app/` | 上传页、列表页、预览页 |

## 速查表

| 常见任务 | 命令 / 位置 |
|---|---|
| 跑测试 | `pnpm test` |
| 看红笔掩膜 | `pnpm mask <图片> <输出.png>` |
| 跑判定报告 | `pnpm judge <图片> [--mask <图片>]` |
| 离线复算判定 | `pnpm judge --replay <RawPage.json> --mask <图片>` |
| 类型检查 | `pnpm typecheck` |
| 本地起界面 | `pnpm dev`（端口见 OPERATIONS） |
| 建任务分支 | `scripts/pipeline/new-task.sh <issue号>` |
| 开 PR | `scripts/pipeline/open-pr.sh` |
| 知识库自检 | `node ~/workspace/dsh-pipeline/bin/cli.mjs kb check --root .` |
