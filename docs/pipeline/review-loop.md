# 审核循环（guraul/wrongmathf4）

<!-- >>> dsh-pipeline 生成区（勿手改；改模板后重跑 init） -->
> 机械步骤由入口 shim 固化；reviewer 的模型调用不在脚本内，由控制面在会话里发起。

```bash
# 1) 准备材料：请求落在 .tmp/review/<PR号>/
scripts/pipeline/review.sh prepare --pr <PR号>

# 2) 渲染提示词（reviewer 读它完成审核）
scripts/pipeline/review.sh prompt --request .tmp/review/<PR号>/request.json --out .tmp/review/<PR号>/prompt.md

# 3) 判定落盘（可选同时发成 GitHub review）
scripts/pipeline/review.sh publish --pr <PR号> --response <判定文件> --round <轮次>

# 4) 合并（闸门通过才合并）
scripts/pipeline/merge-pr.sh --pr <PR号> --root <主工作区> --record .dsh-web/reviews/<PR号>-<sha>.json
```

判定与退出码（契约 §4）：`APPROVE` → 0；`REJECT` → 1（记录照常落盘）；判定不可用兜底 `ESCALATE` → 1。
轮次上限默认 3，第 3 轮仍 `REQUEST_CHANGES` 时停止循环，交给人。

跳过闸门只能 `merge --no-review --reason "<原因>"`：写跳过审计 + PR 留评论，且**不计入已审核**。

细节见契约 §7.3（审核档位与身份）。
<!-- <<< dsh-pipeline 生成区结束（以下可追加本仓自己的内容） -->
