# WrongMath Web UI 开发进度

## 项目概述
- **仓库**: https://github.com/guraul/wrongmathf4
- **分支**: main
- **技术栈**: FastAPI (后端) + HTML/CSS/JS (前端)

---

## 已完成 ✅

### Phase 1: 核心 OCR 功能
- [x] MCP 服务器实现
- [x] PDF/图片转 Markdown
- [x] DeepSeek-OCR 集成
- [x] 题号自动清洗功能
- [x] 配置文件更新 (settings.json, skills.json, AGENTS.md)

### Phase 2: Web UI 开发
- [x] 项目结构搭建 (frontend/, backend/)
- [x] 后端 API 开发
  - [x] /api/upload - 文件上传
  - [x] /api/recognize - OCR 识别
  - [x] /api/save - 保存结果
  - [x] /api/export - 导出文件
  - [x] /api/outputs - 历史记录
  - [x] /api/upload/{id} - 删除文件
- [x] 前端界面开发
  - [x] 拖拽上传组件
  - [x] 文件预览列表
  - [x] OCR 控制面板（清除题号、缩放设置）
  - [x] 结果预览与导出
  - [x] 历史记录管理

---

## 开发中 🔄

### Phase 3: 测试与完善
- [ ] 端到端测试
- [ ] Bug 修复
- [ ] 用户体验优化

---

## 待开始 ⏳

### Phase 4: 部署
- [ ] 部署文档
- [ ] Docker 支持（可选）

---

## 最近提交记录

| 日期 | 提交 | 说明 |
|------|------|------|
| 2026-01-18 | feat: Web UI 前后端实现 | FastAPI 后端 + HTML/CSS/JS 前端 |
| 2026-01-18 | docs: 初始化项目结构 | .gitignore + PROGRESS.md |

---

## 项目结构

```
wrongmathf4/
├── src/                       # MCP 服务器
│   ├── server.py
│   ├── services/
│   │   ├── ocr_service.py
│   │   └── file_processor.py
│   └── utils/
├── backend/                   # Web API
│   └── app.py                 # FastAPI 主文件
├── frontend/                  # 前端页面
│   ├── index.html             # 主页面
│   ├── style.css              # 样式
│   ├── app.js                 # 交互逻辑
│   ├── uploads/               # 上传文件（临时）
│   └── output/                # 输出文件
├── docs/                      # 测试 PDF
├── output/                    # OCR 输出
├── requirements.txt           # 依赖
├── PROGRESS.md                # 进度跟踪
└── README.md
```

---

## 使用方法

### 启动后端
```bash
cd wrongmathf4
source venv/bin/activate
python3 backend/app.py
# 运行在 http://localhost:8000
```

### 打开前端
直接在浏览器中打开 `frontend/index.html`

---

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | / | API 状态 |
| POST | /api/upload | 上传文件 |
| POST | /api/recognize | OCR 识别 |
| POST | /api/save | 保存结果 |
| GET | /api/download/{filename} | 下载文件 |
| GET | /api/outputs | 历史记录 |
| DELETE | /api/upload/{file_id} | 删除文件 |

---

## 下一步任务

1. 启动后端服务测试
2. 测试文件上传和 OCR 识别
3. 修复发现的 bug

---

*最后更新: 2026-01-18*
