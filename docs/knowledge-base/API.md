# API.md — 接口清单

> 最后更新: 2026-11-18 | commit: `e14aabe`
> 覆盖路径: `packages/web/app/page.tsx`

## 状态

**M0 尚未实现任何接口。** 本文件先占位，路由在 M5 落地后逐条补齐（现行 / 目标 会像契约那样标注）。

## 计划中的路由（目标，M5）

| 方法 | 路径 | 入参 | 出参 |
|---|---|---|---|
| POST | `/api/batches` | multipart：若干图片或一个 PDF | `{ batchId }` |
| GET | `/api/batches` | — | 批次列表（按时间倒序） |
| GET | `/api/batches/:id` | — | `Batch` 详情（含 questions） |
| POST | `/api/batches/:id/rerun` | — | 重新跑管线（模型升级后重判） |
| GET | `/api/batches/:id/html` | — | 复刻卷 HTML（`text/html`） |
| GET | `/api/batches/:id/debug` | — | 只读调试报告：三票明细、掩膜图、低置信项 |

## 约定

- 所有接口返回 JSON；失败形如 `{ error: { code, message } }`，HTTP 状态码与之对应。
- 上传接口同步返回 `batchId`，管线在后台跑；进度靠轮询 `GET /api/batches/:id` 的 `status`。
- 不做鉴权：只在家里局域网跑。需要外网再在反向代理层加 Basic Auth。
- 不做 PDF 导出：要打印直接浏览器打印。
