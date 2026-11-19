# API.md — 接口清单

> 最后更新: 2026-11-18 | commit: `1558691`
> 覆盖路径: `packages/web/app/page.tsx`

## 状态

**M5 落了四个接口**，其余（`rerun` / `debug`）仍只是计划。

## 现行路由（M5）

| 方法 | 路径 | 入参 | 出参 |
|---|---|---|---|
| POST | `/api/batches` | multipart，字段 `images`（可多个，仅图片） | `{ id }`（201） |
| GET | `/api/batches` | — | `{ batches: Batch[] }`，按时间倒序 |
| GET | `/api/batches/:id` | — | `{ batch: Batch }` |
| GET | `/api/batches/:id/download` | — | 复刻卷 HTML，`Content-Disposition: attachment` |

错误一律 `{ error: string }`：非法 id → 400；非 multipart / 无文件 / 非图片 → 400；批次不存在或结果未生成 → 404。

## 计划中的路由（未实现）

| 方法 | 路径 | 用途 |
|---|---|---|
| POST | `/api/batches/:id/rerun` | 重跑管线（换模型后重判） |
| GET | `/api/batches/:id/debug` | 三票明细、掩膜图、低置信项 |

## 约定

- 所有接口返回 JSON；失败形如 `{ error: string }`，HTTP 状态码与之对应。
- 上传接口同步返回 `{ id }`，管线在后台串行跑；进度靠轮询 `GET /api/batches/:id` 的 `status` 与 `pages[].status`。
- **不支持 PDF**：原计划的 PDF 上传没有实现，前端 `accept="image/*"`，服务端校验 `Content-Type`。
- 不做鉴权：只在家里局域网跑。需要外网再在反向代理层加 Basic Auth。
- 不做 PDF 导出：要打印直接浏览器打印。
