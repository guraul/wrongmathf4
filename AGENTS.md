# AGENTS.md - WrongMath

> 架构与约定写在知识库；本文件只放每次对话都要遵守的硬规则。

## 知识库路由（优先查阅）

每次对话先读 [`docs/knowledge-base/INDEX.md`](docs/knowledge-base/INDEX.md)，再按需加载：

| 场景 | 到底看哪 |
|---|---|
| 全局认知、技术栈、仓库拓扑 | `docs/knowledge-base/INDEX.md` |
| 管线、判定规则、图形怎么画 | `docs/knowledge-base/ARCHITECTURE.md` |
| 数据模型、表结构、文件布局 | `docs/knowledge-base/DATA.md` |
| 接口清单 | `docs/knowledge-base/API.md` |
| 编码约定与红线 | `docs/knowledge-base/CONVENTIONS.md` |
| 装依赖、起服务、部署、排障 | `docs/knowledge-base/OPERATIONS.md` |

术语以根目录 [`GLOSSARY.md`](GLOSSARY.md) 为准；V2 方案见
[`docs/superpowers/plans/2026-11-18-node-rewrite.md`](docs/superpowers/plans/2026-11-18-node-rewrite.md)。

## 强制规定（V2）

1. 改完 TypeScript 必须跑 `pnpm test` 与 `pnpm typecheck`，两者退 0 才算完。
2. 依赖只用 pnpm；构建白名单写 `pnpm-workspace.yaml` 的 `allowBuilds`。
3. 所有改动走 `scripts/pipeline/new-task.sh <issue号>` 建的 worktree，不直推 `main`。
