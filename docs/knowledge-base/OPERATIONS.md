# OPERATIONS.md — 运行、部署与踩坑

> 最后更新: 2026-11-18 | commit: `f433969`
> 覆盖路径: `packages/web/next.config.mjs`, `.dsh/pipeline.json`, `pnpm-workspace.yaml`, `packages/core/src/ingest/io.ts`, `packages/core/src/cli/mask.ts`

## 环境变量

| 变量 | 缺省 | 用途 |
|---|---|---|
| `PORT` | `19238` | Web 端口（`packages/web` 的 dev/start 读它） |
| `DEEPSEEK_API_KEY` | 无 | 模型调用，M2 起必需（V1 的 `.env` 里还没有，需补） |
| `DB_PATH` | `data/wrongmath.db` | SQLite 路径（M5 起） |
| `DATA_DIR` | `data/` | 上传件与产物根目录 |
| `LOG_LEVEL` | `info` | 日志级别 |

`.env` 不入库。检查配置只输出存在性，不打印值。

## 本地运行

```bash
pnpm install          # 首次
pnpm test             # 契约 + 图像输入测试
pnpm typecheck        # 类型检查
pnpm dev              # http://localhost:19238
pnpm mask test/fixtures/2026-11-17/p1-geo5.jpg /tmp/mask.png   # 红笔掩膜可视化
```

`pnpm mask` 必须在**仓根**执行：脚本是 `tsx packages/core/src/cli/mask.ts`，
若用 `pnpm -F @wrongmath/core mask`，工作目录会切到包内，相对路径就找不到了。

## 依赖安装的坑

1. **必须用 pnpm**。本机 store 在 `~/workspace/global_node_modules/v11`，与项目同卷，靠硬链/clone 去重。
2. **pnpm 12 不再读 `package.json` 的 `pnpm` 字段**。构建脚本白名单只能写在 `pnpm-workspace.yaml`：
   ```yaml
   allowBuilds:
     esbuild: true
   ```
   写成旧字段会报 `ERR_PNPM_IGNORED_BUILDS`，而错误提示只让你跑 `pnpm approve-builds`，不说该写哪。
3. 默认 registry 是 npmmirror（`registry.npmmirror.com`）。首次装 next 会慢（数十秒），之后走缓存。
4. **sharp 是原生模块**（libvips 预编译），`packages/core` 依赖它做解码与缩放；不需要编译工具链，但换平台要重装。
5. **CLI 用 tsx 跑 TypeScript**（根 devDependency），没有独立构建步骤。

## 交付流程

四件套由 `dsh-pipeline init` 生成，`--check` 可校验：

```bash
node ~/workspace/dsh-pipeline/bin/cli.mjs init --check --root .
scripts/pipeline/new-task.sh <issue号>     # 建 worktree + 任务分支
scripts/pipeline/open-pr.sh                 # 推分支 + 开 PR
scripts/pipeline/review.sh prepare --pr <n> # 生成审核请求
scripts/pipeline/merge-pr.sh --pr <n> --record <记录> --root .
```

`.dsh/pipeline.json` 里 `checks.packages` 决定 `check-all` 在哪些包装跑检查，当前是
`packages/core` 与 `packages/web`。

## 知识库 stamp 的语义

页眉两行里的 `commit` 指**内容所对齐的代码提交**，不是写文档那天。

这带来一个不可避免的现象：**同一个 PR 里既改代码又改文档时，`kb check --strict` 在 PR 内一定报 stale**
——stamp 只能指向 base 提交，而覆盖路径恰好在本 PR 里变了。所以：

- PR 内以 `kb check`（非 strict）退 0 为准，并确认 stale 项都是本次有意改动的文档
- 合并后立刻用一个 docs-only 的小 PR 把 stamp 重打到合并提交，`--strict` 才回到 0 stale
- 长期方案是把本仓加进 DSH 的「知识库日更队列巡检」，由它每天重打

## 部署（M7）

- systemd 单服务，`ExecStart` 跑 `packages/web` 的 Next standalone 产物，端口 `PORT`
- 旧的 `deploy/wrongmath.service`（`python3 main.py`）在 M7 一起替换
- 无反向代理、无数据库服务、无 worker 进程

## 已知陷阱

- **多页合并**：一个批次产出恰好一份复刻卷，不同作业要分开上传。
- **图片不要预先缩小**：V1 把图缩到 2000px 宽导致小字糊掉，V2 改成放大 2–3 倍再送模型。
- **`low` 档位会压到 512×512**：模型接口的 `detail` 必须用 `original`，否则 10px 的字直接不可读。
