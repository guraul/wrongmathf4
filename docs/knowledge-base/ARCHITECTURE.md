# ARCHITECTURE.md — 管线与判定

> 最后更新: 2026-11-18 | commit: `9c14f7d`
> 覆盖路径: `packages/core/src/schema.ts`, `packages/core/src/index.ts`, `packages/core/src/ingest/pixels.ts`, `packages/core/src/ingest/io.ts`, `packages/core/src/judge/verdict.ts`, `packages/core/src/judge/answer.ts`, `packages/core/src/vlm/client.ts`

## 五段管线

```
上传 → ingest → read → judge → render → 下载 HTML
        │        │      │       │
        │        │      │       └─ 结构化 JSON → HTML，纯函数，可逐字节 diff
        │        │      └─ 三票判定，产出 verdict / confidence / evidence
        │        └─ DeepSeek Flash，放大后送图，每页两轮
        └─ PDF→PNG、EXIF 旋转、放大 2–3 倍、红笔颜色掩膜
```

### ingest 的具体口径

- **只放大不缩小**：默认 2.5×，长边上限 3000px。V1 反着来（压到 2000px 以内），小字就是那样糊掉的。
- **先摆正再算尺寸**：手机照片带 EXIF 旋转，`sharp().rotate()` 之后拿到的宽高才是真实朝向。
- **红笔阈值**：`r-g ≥ 22 && r-b ≥ 12 && r ≥ 90`。纸张偏黄会抬高 B，所以同时约束两个色差；`r ≥ 90` 挡掉阴影里的暗红。
- **掩膜只做颜色分类**，不做连通域。把标记映射到具体题目属于 judge 段（M2），那时才需要切块。
- 已知噪声：画面外的红色物体（桌沿、笔）也会被判为红，M2 需要先定卷面边界再过滤。

每段的边界：

| 段 | 输入 | 输出 | 是否纯函数 |
|---|---|---|---|
| ingest | 上传的原始文件 | 归一化图片 + 红笔掩膜 | 否（读盘） |
| read | 图片 | `Question[]`（未判定） | 否（调模型） |
| judge | `Question[]` | `Question[]`（有 verdict） | 是 |
| render | `Batch` | HTML 字符串 | 是 |

## 三票判定

| 票 | 来源 | 说明 |
|---|---|---|
| 红笔 | 颜色掩膜 + 形状分类 | 单道斜线带钩 = 对；两条交叉 = 错 |
| 解题 | 第二次模型调用，**看不到学生答案** | 只给题干与图形参数 |
| 规则 | 确定性校验 | 单位换算、面积分割和 = 整体、竖式恒等式 |

收敛规则（固定，不转人工，代码在 `judge/verdict.ts`）：

```
老师 ✗                      → wrong（置信 1.0）
老师 √                      → right（规则票只记 suspicious，不推翻）
老师无标记 + 无求解答案      → unknown
老师无标记 + 规则校验失败    → wrong（置信 0.9）
老师无标记 + 求解与作答一致  → right（置信 0.85）
老师无标记 + 求解与作答不同  → wrong（置信 0.85）
主观题                      → unknown（只转写，不判定）
```

答案比对在 `judge/answer.ts`：全角转半角、上标降级（cm²→cm2）、单位别名
（平方厘米/㎠/cm²→cm2）、0.1% 相对容差。

### 红笔对账只比"有无"

掩膜聚出的簇数**不参与数量对账**：一个勾常被笔画断裂拆成几簇，画面外的红色物体也会进掩膜。
实测第一页 7 簇、第二页更多，而题目里只有 2–3 处标记。所以只判断「有没有红笔」：
模型说有标记但掩膜一个红像素都没有（或反过来）才把置信度乘以 0.6 并记入 evidence。

## 为什么图形不用模型坐标

模型给出的坐标不可复现：同一张图跑两次，path 不一样，渲染器就无法做字节级 diff。
所以模型只输出**尺寸与分割方式**（`composite` / `division` / `cards` / `unitTable`），
坐标由本地生成器按参数算出。三份人工成品的图全部能用这条路表达。

## 边界

- `packages/core` 不读盘、不联网：图片路径与模型客户端都由调用方注入
- `packages/web` 只做编排与持久化，不写判定规则
- 复刻卷里不出现任何判定痕迹（置信度、三票明细只进数据库）
