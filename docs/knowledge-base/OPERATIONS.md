# OPERATIONS.md — 运行、部署与踩坑

> 最后更新: 2026-11-21 | commit: `2923aa9`
> 覆盖路径: `packages/web/next.config.mjs`, `packages/web/lib/store.ts`, `packages/web/lib/worker.ts`, `.dsh/pipeline.json`, `pnpm-workspace.yaml`, `packages/core/src/ingest/io.ts`, `packages/core/src/cli/mask.ts`

## 环境变量

| 变量 | 缺省 | 用途 |
|---|---|---|
| `PORT` | `19238` | Web 端口（`packages/web` 的 dev/start 读它） |
| `OPENCODE_GO_API_KEY` | 无 | **默认提供方** opencode go 的 key（也认 `OPENCODE_API_KEY`） |
| `DEEPSEEK_API_KEY` | 无 | 备用：DeepSeek 官方接口 |
| `WM_PROVIDER` | 自动 | 强制指定 `opencode-go` / `deepseek`，写了不存在的值直接报错 |

模型提供方与 key 的对应关系：

| 提供方 | 端点 | 模型 | 取 key |
|---|---|---|---|
| `opencode-go`（默认） | `https://opencode.ai/inference/go/openai/v1/chat/completions` | `deepseek-v4.1-flash` | `OPENCODE_GO_API_KEY` → `OPENCODE_API_KEY` |
| `deepseek` | `https://api.deepseek.com/chat/completions` | `deepseek-flash` | `DEEPSEEK_API_KEY` |

选法：`WM_PROVIDER` 有值就用它（缺 key 直接报错，不静默换），否则按上表顺序找第一个配了 key 的。
`.env` 由 `process.loadEnvFile()` 自动加载（Node 自带，不引 dotenv），文件不存在就跳过。

**真机耗时**：整卷转写单次 110–175 秒（推理占约 1 万 tokens），两轮投票后约 5 分钟/页；
`maxTokens` 必须给到 32000，16000 会出现 JSON 被截断。

`response_format: json_object` 只对 DeepSeek 官方发送——opencode go 的网关没验证过是否支持，
关掉它不影响解析（`extractJson` 自己会剥围栏找 JSON）。`WM_ENDPOINT` 可临时把请求指向别的端点。

**opencode go 必须带 `x-opencode-session` 请求头**，缺了返回 `MissingSessionID`；
无 key 或 key 无效返回 401 `authentication_error: Invalid credential`（两者都实测过）。
| `DB_PATH` | `data/wrongmath.db` | SQLite 路径（M5 起） |
| `DATA_DIR` | `data/` | 上传件与产物根目录 |
| `LOG_LEVEL` | `info` | 日志级别 |

`.env` 不入库。检查配置只输出存在性，不打印值。

## 本地运行

```bash
pnpm install          # 首次
pnpm test             # 契约 + 图像输入测试
pnpm typecheck        # 类型检查
pnpm dev              # http://localhost:19238（PORT 可覆盖）
pnpm build            # Next standalone 构建
pnpm mask test/fixtures/2026-11-17/p1-geo5.jpg /tmp/mask.png   # 红笔掩膜可视化
pnpm judge test/fixtures/2026-11-17/p1-geo5.jpg --mask test/fixtures/2026-11-17/p1-geo5.jpg  # 判定报告（需 key）
pnpm judge --replay test/fixtures/2026-11-17/page1.replay.json --mask test/fixtures/2026-11-17/p1-geo5.jpg  # 离线复算
pnpm render test/fixtures/2026-11-17/wrong.json test/screenshots/worksheet.html  # 渲染复刻卷（自动建目录）
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

## 界面怎么跑

```bash
pnpm dev                       # 开发模式，默认 19238
PORT=19240 pnpm dev            # 换端口（package.json 里的 ${PORT:-19238}）
WRONGMATH_DATA_DIR=/tmp/wm pnpm dev   # 换数据目录
```

`.env` 按候选路径加载：`envCandidates()`（`packages/web/lib/store.ts`）= 仓库根 + 从 cwd 向上最多
4 层中含 `package.json` 的目录，`packages/web/lib/worker.ts` 在批次开始处理时逐个 `loadEnv`
（先到先得）——Next 默认只读 `packages/web/` 下的 `.env`，不加这一步会找不到 key。

## 知识库 stamp 的语义

页眉两行里的 `commit` 指**内容所对齐的代码提交**，不是写文档那天。

这带来一个不可避免的现象：**同一个 PR 里既改代码又改文档时，`kb check --strict` 在 PR 内一定报 stale**
——stamp 只能指向 base 提交，而覆盖路径恰好在本 PR 里变了。所以：

- PR 内以 `kb check`（非 strict）退 0 为准，并确认 stale 项都是本次有意改动的文档
- 合并后立刻用一个 docs-only 的小 PR 把 stamp 重打到合并提交，`--strict` 才回到 0 stale
- 长期方案是把本仓加进 DSH 的「知识库日更队列巡检」，由它每天重打

## 部署（M7）

- systemd 单服务，`ExecStart` 跑 `packages/web` 的 Next standalone 产物，端口 `PORT`
- `deploy/` 里有 Node 版的 systemd 单元与 macOS launchd 配置，说明见 `deploy/README.md`
- 无反向代理、无数据库服务、无 worker 进程

## 部署到 Android 手机（Termux，M8 起）

2026-11-20 在小米 6（arm64 / Android 9 / Termux）上实际跑通并常驻，地址 `192.168.0.159:19238`。
完整步骤见 `deploy/README.md` 的「Android / Termux」一节，这里只记关键结论：

- **构建只在开发机做**：Next 的 SWC 没有 android-arm64 版本，手机侧只跑产物
- **sharp 必须用 WASM 版**：`@img/sharp-wasm32` 放在应用 `node_modules` 顶层，实测单页预处理 4.6 秒
- **sharp 必须保持外部依赖**：`next.config.mjs` 里对服务端构建显式 externals，否则被 webpack 内联后平台探测失效
- **`.env` 放应用根**：standalone 启动后 cwd 会切到 `packages/web`，worker 按候选路径向上找
- **服务托管用 runit**（`$PREFIX/var/service/wrongmath`），与手机上的 mihomo 等服务同一套机制
- **手机没有 rsync**：部署走 `tar` 管道

## 已知陷阱

- **多页合并**：一个批次产出恰好一份复刻卷，不同作业要分开上传。
- **图片不要预先缩小**：V1 把图缩到 2000px 宽导致小字糊掉，V2 改成放大 2–3 倍再送模型。
- **`low` 档位会压到 512×512**：模型接口的 `detail` 必须用 `original`，否则 10px 的字直接不可读。
- **Android 上 `ps` 看不到进程命令行**：要杀掉占端口的进程，先从 `/proc/net/tcp` 取 socket inode，
  再扫 `/proc/*/fd` 找持有者。`/tmp` 在 Termux 里不可写，临时文件放 `$HOME`。
