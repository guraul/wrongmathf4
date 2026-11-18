# ARCHITECTURE.md — 管线与判定

> 最后更新: 2026-11-18 | commit: `dceb2e9`
> 覆盖路径: `packages/core/src/schema.ts`, `packages/core/src/index.ts`

## 五段管线

```
上传 → ingest → read → judge → render → 下载 HTML
        │        │      │       │
        │        │      │       └─ 结构化 JSON → HTML，纯函数，可逐字节 diff
        │        │      └─ 三票判定，产出 verdict / confidence / evidence
        │        └─ DeepSeek Flash，放大后送图，每页两轮
        └─ PDF→PNG、EXIF 旋转、放大 2–3 倍、红笔颜色掩膜
```

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

收敛规则（固定，不转人工）：

```
老师 ✗                    → wrong
老师 √                    → right
老师无标记 + 求解判错      → wrong
老师无标记 + 求解判对      → right
两轮不一致 → 第三轮 → 仍不一致 → wrong（宁可多报）
规则校验失败               → 覆盖为 wrong
主观题（说理/比较）        → 不判定，原文转写
```

## 为什么图形不用模型坐标

模型给出的坐标不可复现：同一张图跑两次，path 不一样，渲染器就无法做字节级 diff。
所以模型只输出**尺寸与分割方式**（`composite` / `division` / `cards` / `unitTable`），
坐标由本地生成器按参数算出。三份人工成品的图全部能用这条路表达。

## 边界

- `packages/core` 不读盘、不联网：图片路径与模型客户端都由调用方注入
- `packages/web` 只做编排与持久化，不写判定规则
- 复刻卷里不出现任何判定痕迹（置信度、三票明细只进数据库）
