# Pipeline 工作手册（guraul/wrongmathf4）

<!-- >>> dsh-pipeline 生成区（勿手改；改模板后重跑 init） -->
> 本文件由共享包 `@guraul/dsh-pipeline` 的 `init` 生成。生成区之外可以追加本仓自己的内容；
> 生成区内的文字被改动后，`init --check` 会判为不一致。

## 一、流程总览

```text
1. 开 issue      每任务一个，写清现象 / 根因 / 方案 / 验收标准 / 回滚
2. 建工作区      scripts/pipeline/new-task.sh <issue号>   → task/<号>-<slug> 分支 + worktree
3. 开发          在 worktree 内改代码，提交信息带 #<issue号>
4. 本地门禁      scripts/pipeline/pipeline.sh check-all   → 逐包 test / check / typecheck
5. 开 PR         scripts/pipeline/open-pr.sh              → 推送 + 开 PR（body 首行 Closes #<issue号>）
6. 审核          控制面委派 reviewer，判定落成审核记录（.dsh-web/reviews/）
7. 合并          scripts/pipeline/merge-pr.sh --pr <号> --root <主工作区> --record <记录>
                 闸门 → CI → squash 合并 → 清理 worktree / 分支 → 快进 main
```

## 二、入口清单

| 入口 | 转发到 | 说明 |
|---|---|---|
| `scripts/pipeline/pipeline.sh` | 第一个参数即子命令 | 通用入口，等价于直接调包 |
| `scripts/pipeline/new-task.sh` | `task` | 建任务分支 + worktree |
| `scripts/pipeline/open-pr.sh` | `pr` | 推送分支 + 开 PR |
| `scripts/pipeline/merge-pr.sh` | `merge` | 闸门 → CI → squash 合并 → 清理 |
| `scripts/pipeline/review.sh` | `review` | `prepare` / `prompt` / `publish` |
| `scripts/pipeline/status.sh` | `status` | 审核记录概况（只读） |

入口全部是生成物，**禁止手改**；改一个字节 `shim check` 就会红。

## 三、四件套与自检

| 项 | 路径 | 校验 |
|---|---|---|
| 配置 | `.dsh/pipeline.json` | `pipeline.sh selftest --config` |
| 入口 shim | `scripts/pipeline/*.sh` | `pipeline.sh shim check` |
| pre-push 钩子 | `.git/hooks/pre-push`（或 `core.hooksPath` 指向的位置） | `pipeline.sh hooks check` |
| 文档骨架 | `docs/pipeline/` | `pipeline.sh init --check` |

本地自检：`pipeline.sh selftest --fast` 一次跑完前两项。pre-push 钩子只拦直推 `main` / `master`，不跑自检。

## 四、规范来源

契约是唯一规范来源：[`docs/CONTRACT.md`](https://github.com/guraul/dsh-pipeline/blob/main/docs/CONTRACT.md)。
本文件只写「怎么跑」，不重复参数与退出码——逐命令细节查契约 §3 / §4。
<!-- <<< dsh-pipeline 生成区结束（以下可追加本仓自己的内容） -->
