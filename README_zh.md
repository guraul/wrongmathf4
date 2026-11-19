# WrongMath

**拍一张数学作业照片 → 生成一张可打印的错题重做卷。**

每道题重新排版，几何图形按参数重画成 SVG，输出的是干净的卷面，不是照片——孩子直接在上面做。

[English](README.md)

## 它是怎么判的

```
照片 ──► 预处理 ──► 转写（2–3 轮投票） ──► 判定（三票） ──► 可打印 HTML
         放大 2.5×    题干、作答、红笔、图形     老师标记
         红笔掩膜                              独立求解
                                               规则检查
```

- **转写要投票，不能只信一次**：模型对红笔和题号的读数每次都不一样，所以每页转写两到三轮，
  先按题干相似度对齐，再逐题投票。
- **标记要用红墨水对账**：模型说「这里有个叉」时，它给的位置框里必须真有红色像素，否则这条标记作废。
- **错题判三票**：老师标记、独立求解、确定性规则（除法恒等式、不可能的三维尺寸等）。

## 快速开始

```bash
pnpm install
cp .env.example .env      # 填入 OPENCODE_GO_API_KEY
pnpm dev                  # http://localhost:19238
```

上传几张卷子照片，等一会儿（每页约 5–9 分钟，时间基本都花在模型推理上），然后下载生成的复刻卷。

## 命令行

```bash
pnpm mask   <图片> <输出.png>                 # 看一眼红笔掩膜
pnpm judge  <图片> [--mask <图片>]            # 单页跑完整管线
pnpm judge  --replay <page.json>              # 离线复算已保存的转写结果
pnpm render <questions.json> <输出.html>      # 从已保存的题目渲染复刻卷
```

## 目录

```
packages/core   预处理 · 模型调用 · 判定 · 渲染（纯管线，不含界面）
packages/web    Next.js：上传、批次进度、下载
docs/           知识库（架构、数据、API、运维）与方案存档
deploy/         systemd 单元、launchd 配置
```

## 环境

Node ≥ 24、pnpm 12。模型默认 `deepseek-v4.1-flash`（OpenCode Go），可用 `WM_PROVIDER` 切换。

## 许可

MIT
