# WrongMath AI Agent - 完整解决方案

> 文档日期：2026-05-23
> 状态：规划阶段（撤回 Java，改用 Python）

---

## 📋 项目概览

**项目名称**：WrongMath AI Agent  
**项目定位**：一个智能错题处理助手，不是传统 Web 应用  
**目标用户**：个人学习者（你和女儿）  
**核心价值**：像员工一样为你工作——你只管发图片，剩下的它自己完成  
**部署方式**：独立 Python 进程，可部署在任何 Linux 服务器上

---

## 🎯 核心需求

- ✅ 把错题图片发过去（企业微信 / 拖拽 / 丢文件夹），不用管后续
- ✅ Agent 自动接收、处理、保存、通知
- ✅ 多入口：企业微信 / REST API / MCP 协议 / 目录监控
- ✅ 按科目自动分类输出（不同科目不同文件夹）
- ✅ 输出 Obsidian 兼容 Markdown
- ✅ 后台异步处理，单个文件失败不影响其他
- ✅ 识别准确度优先于处理速度

---

## 🏗️ 系统架构

### 设计原则：Agent-first

```
不是：Web 应用 + Agent 模块
而是：Agent 核心 + 多种交互通道
```

### 进程模型

```
┌─────────────────────────────────────────────────────────────┐
│                  main.py (Agent 主进程)                       │
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │ AgentEngine   │  │ TaskQueue     │  │ MCP Handler      │  │
│  │ (状态机循环)  │  │ PriorityQueue │  │ (stdio 监听)    │  │
│  │ IDLE ←→ PROC  │◀─┤              │  │                  │  │
│  │  ├─ PAUSED    │  │  Task A      │  │                  │  │
│  │  └─ ERROR     │  │  Task B      │  │                  │  │
│  └──────┬───────┘  │  Task C      │  └──────────────────┘  │
│         │          └──────────────┘                         │
│         ▼                                                   │
│  ┌────────────────────────────────────┐                     │
│  │ Scheduler                          │                     │
│  │ 从队列取任务 → 调用 core/services/ │                     │
│  └────────────────────────────────────┘                     │
│                                                             │
│  ├─ 子进程：uvicorn (FastAPI REST 通道)                     │
│  │   subprocess.Popen(["uvicorn", "--port", "8080"])       │
│  │   Agent 关闭时自动杀掉子进程                              │
│  │                                                          │
│  └─ 其他通道：企业微信 / 文件监控 (asyncio task)            │
└─────────────────────────────────────────────────────────────┘
                            │
           ┌────────────────┼────────────────┐
           │                │                │
           ▼                ▼                ▼
    ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
    │ OCR 模块      │ │ LLM 验证模块 │ │ 结果处理模块 │
    │ SiliconFlow   │ │ GLM5         │ │ Markdown     │
    │ 3次重试       │ │ 2次重试      │ │ Obsidian格式 │
    └──────────────┘ └──────────────┘ └──────┬───────┘
                                            │
                                            ▼
                                   ┌────────────────┐
                                   │  Output 层     │
                                   │ output/数学/   │
                                   │ output/语文/   │
                                   └────────────────┘
```

### 为何 Agent-first

```
传统 Web：打开浏览器 → 拖拽文件 → 等转圈 → 下载结果 → 切窗口回微信
Agent 方式：拿起手机 → 发微信图片给 Agent → 继续陪女儿 → 收到结果通知
```

---

## 🐍 技术栈

| 组件 | 技术选择 | 说明 |
|------|---------|------|
| Agent 核心 | Python 3.13 + asyncio | 纯异步，无 Web 框架依赖 |
| REST 通道 | FastAPI + uvicorn | 子进程，Agent 通过 subprocess 管理生命周期 |
| OCR 引擎 | SiliconFlow DeepSeek-OCR | 专业 OCR 模型 |
| 大模型 | GLM5（固定） | 已验证，不提供选择 |
| 企业微信 | httpx + aiohttp | 直接调 HTTP API，无官方 SDK |
| 文件监控 | watchdog | 异步目录监听 |
| MCP 协议 | mcp 库（现有） | 保留已有实现 |
| 图像处理 | Pillow + 原生 Python | 不额外依赖 OpenCV |
| 配置 | pydantic + YAML | 类型安全 |

### 关键依赖

| 库 | 用途 | 备注 |
|----|------|------|
| httpx | 异步 HTTP 调用 | OCR/LLM API、企业微信 |
| aiohttp | 异步 Webhook 接收 | 企业微信回调 |
| fastapi | REST 通道 | 可选，需要 Web UI 时才装 |
| uvicorn | REST 通道运行 | 同上 |
| pydantic | 配置 + 数据模型 | 类型安全，不必需但推荐 |
| watchdog | 文件监控 | 可选，不需要可拆 |
| openai | SiliconFlow API | 兼容 OpenAI 格式 |
| mcp | MCP 协议 | 已有 |
| Pillow | 图像处理 | 轻量，基础够用 |
| python-dotenv | 环境变量 | 已有 |

---

## 🤖 Agent 核心设计

### 1. 状态机

Agent 只有两个主状态：**闲着**和**忙着**，异常和暂停是"忙着"的子状态。

```
       ┌──────────┐
       │   INIT   │  启动，初始化各模块
       └────┬─────┘
            │ 初始化完成
            ▼
       ┌──────────┐
       │   IDLE   │  等待任务，无事可做
       └────┬─────┘
            │ 收到任务
            ▼
       ┌──────────────────────────────┐
       │       PROCESSING            │  处理中
       │  ├─ 正常运行                 │
       │  ├─ PAUSED（用户暂停）       │
       │  └─ ERROR（异常待恢复）      │
       └──────────────┬───────────────┘
                      │ 队列为空
                      ▼
                 ┌──────────┐
                 │  IDLE    │  回到等待
                 └──────────┘
```

### 2. 通道（ProtocolHandler）

每个通道实现统一接口，Agent 内部不关心任务来源：

```python
# agent/channels/base.py
class ProtocolHandler(ABC):
    name: str                         # "wecom"、"rest"、"mcp"
    async def start(self, agent): ... # 注册到 Agent，开始监听
    async def stop(self): ...         # 停止监听
    async def notify(self, msg): ...  # 主动推送消息到该通道
```

#### 企业微信（主要入口）

- 配置企业微信机器人 Webhook，接收图片消息
- 收到图片 → 下载到 input/ → 创建 Task → 入队 → 处理后主动推送结果
- 文字命令："进度"、"重试"、"取消" → Agent 解析意图并执行
- 主动推送：处理完成后发结果链接到企业微信

#### REST API（子进程模式）

FastAPI 作为独立子进程运行，Agent 主进程负责管理其生命周期。

```
Agent 启动 → Popen(["uvicorn", "app:app", "--port", "8080"])
Agent 关闭 → kill 子进程（SIGTERM）

FastAPI 子进程通过本地 HTTP 与 Agent 通信：
  POST /api/task      → 创建 Task，返回 task_id
  GET  /api/task/{id} → 查状态
  GET  /api/result    → 查询处理结果
```

**为什么子进程而不是 asyncio task：**
- FastAPI/uvicorn 有自己的事件循环，和 Agent 的 asyncio 循环冲突
- 子进程隔离，FastAPI 挂了不影响 Agent 核心
- Agent 不依赖 FastAPI，不想启动 REST 就不启动
- 资源各自独立，不互相影响

#### MCP 协议

- 复用现有 `servers/mcp.py`，改为通过 Agent core 处理
- 或直接在 Agent 内嵌 MCP stdio handler
- `read_math_file`、`recognize_image` 工具直接调用 Agent 队列

#### 文件监控

- `watchdog` 监听 input/ 目录
- 新文件自动创建 Task 入队
- 按文件夹名识别科目

### 3. 任务队列

```python
# agent/task_queue.py
@dataclass
class Task:
    id: str
    source: str          # wecom / rest_api / mcp / filewatch
    file_path: str       # 待处理图片
    subject: str | None  # 科目（可选）
    priority: int        # urgnet(1) > normal(3) > background(5)
    attempts: int = 0
    max_retries: int = 3
    created_at: float
```

队列使用 `asyncio.PriorityQueue` 实现优先级调度。

### 4. 调度器

```python
# agent/scheduler.py
async def scheduler_loop(agent):
    while agent.state == "processing":
        task = await agent.queue.get()
        if task is None:
            agent.state = "idle"
            break

        try:
            task.status = "preprocessing"
            preprocessed = await preprocess(task.file_path)

            task.status = "ocr"
            text = await ocr_service.recognize(preprocessed)

            task.status = "verifying"
            verified = await llm_service.verify(text, preprocessed)

            task.status = "saving"
            result = await save_result(task, verified)

            await agent.notify_all(f"✅ {task.file_path} 完成")
        except Exception as e:
            task.attempts += 1
            if task.attempts < task.max_retries:
                await agent.queue.put(task)  # 重新入队
            else:
                await agent.notify_all(f"❌ {task.file_path} 失败: {e}")
```

### 5. 决策点

Agent 区别于传统程序的关键：

| 决策点 | Agent 行为 |
|--------|-----------|
| **优先级** | 企业微信发来的图 → 高优先级，Web UI 批量 → 默认 |
| **重试策略** | 第 1 次失败 → 1s 后重试；第 2 次 → 换低分辨率重试 |
| **批量合并** | 同一批同科目图片自动合并到一个 Markdown |
| **通知频率** | 单张即时反馈；批量 5 分钟汇总一次 |
| **空闲行为** | 自动清理 temp/、检查 output 完整性 |

---

## 📁 项目文件结构

```
wrongmath/
│
├─ agent/                            # Agent 核心（新）
│  ├─ __init__.py
│  ├─ engine.py                      # AgentEngine：状态机 + 主循环
│  ├─ task.py                        # Task 数据模型
│  ├─ task_queue.py                  # 任务队列（asyncio.PriorityQueue）
│  ├─ scheduler.py                   # 调度器循环
│  │
│  ├─ channels/                      # 输入通道
│  │  ├─ __init__.py
│  │  ├─ base.py                     # ProtocolHandler 基类
│  │  ├─ wecom.py                    # 企业微信通道
│  │  ├─ rest.py                     # FastAPI REST 通道
│  │  ├─ mcp.py                      # MCP 协议通道
│  │  └─ filewatch.py                # 文件系统监控
│  │
│  └─ decisions/                     # 决策模块
│     ├─ __init__.py
│     ├─ priority.py                 # 优先级分配
│     └─ retry.py                    # 重试策略
│
├─ core/                             # 处理模块（已有，不动）
│  ├─ services/
│  │  ├─ ocr_service.py              # OCR 识别
│  │  ├─ file_processor.py           # 文件处理
│  │  ├─ image_preprocessor.py       # 图像预处理
│  │  └─ ...
│  └─ utils/
│
├─ config/                           # 配置
│  ├─ settings.py                    # pydantic 配置模型
│  └─ config.yaml                    # 主配置文件
│
├─ main.py                           # 启动入口
│
├─ input/                            # 文件监控目录
├─ output/                           # 最终输出
│  ├─ 数学/
│  ├─ 语文/
│  └─ ...
├─ temp/                             # 临时文件
│
├─ requirements.txt
├─ .env
├─ solution.md                       # 本文件
├─ AGENTS.md
└─ README.md
```

---

## 🔄 Agent 全生命周期

```
1. 启动
   python main.py
   ├─ 读取 config.yaml
   ├─ 初始化 AgentEngine → 状态 INIT
   ├─ 初始化 TaskQueue
   ├─ 启动通道：
   │  ├─ subprocess.Popen(["uvicorn", ...])   # FastAPI 子进程
   │  ├─ asyncio.create_task(wecom.start())   # 企业微信
   │  ├─ asyncio.create_task(mcp.start())     # MCP stdio
   │  └─ asyncio.create_task(filewatch.start()) # 文件监控
   └─ 状态 → IDLE

2. 任务到达（任一通道）
   ├─ Channel 接收输入，转成 Task
   ├─ await agent.queue.put(task)
   ├─ agent.state == "idle" → 改为 "processing"
   └─ 回复用户："收到，正在处理..."

3. 调度循环
   while agent.state == "processing":
       task = await agent.queue.get()
       调用处理模块链：
       → core.services.preprocess()
       → core.services.ocr()
       → core.services.llm_verify()
       → core.services.save()
       通知通道结果

4. 队列为空 → state = "idle"

5. 关闭（Ctrl+C）
   ├─ 通知所有通道停止接收新任务
   ├─ 等待当前处理中的任务完成（超时 30s）
   ├─ 保存未完成任务到磁盘（下次启动恢复）
   ├─ 终止 FastAPI 子进程（SIGTERM）
   └─ 退出
```

---

## 🗺️ 实施路线图

### 阶段 1：Agent 核心 + 处理模块接入（1 周）

```
任务 1.1: Agent 骨架
  ├─ agent/engine.py
  ├─ agent/task.py + task_queue.py
  ├─ agent/scheduler.py
  └─ 验证：Agent 能启动、接任务、处理、完成

任务 1.2: 对接 core/services/
  ├─ scheduler 调用现有 OCR/LLM/预处理模块
  └─ 验证：curl 调 REST 通道 → Agent 处理 → 出结果

任务 1.3: config.yaml + .env
  ├─ 配置管理
  └─ 验证：修改配置影响 Agent 行为

交付：
  ├─ python main.py 启动 Agent
  ├─ REST 通道可测试完整流程
  └─ output/ 目录生成 Markdown
```

### 阶段 2：企业微信通道（1 周）

```
任务 2.1: 企业微信接收
  ├─ agent/channels/wecom.py
  ├─ 接收图片消息、下载
  └─ 验证：发微信图片 → Agent 收到

任务 2.2: 文字命令
  ├─ "进度"、"重试"、"状态" 命令解析
  └─ 验证：微信文字命令可控制 Agent

任务 2.3: 主动推送
  ├─ 处理完成后推送到企业微信
  └─ 验证：全流程从微信发出 → 微信收到结果

交付：
  ├─ 企业微信作为主入口
  ├─ 发图片即可使用，无需打开任何网页
  └─ 处理完自动推结果
```

### 阶段 3：决策策略（1 周）

```
任务 3.1: 优先级决策
  ├─ 企业微信高优先级
  └─ 验证：高优任务先执行

任务 3.2: 图像质量自适应
  ├─ 模糊图片增强预处理
  └─ 验证：不同质量图片不同处理路径

任务 3.3: 批量合并
  ├─ 同批同科目图片合并输出一个 Markdown
  └─ 验证：10 张数学图片输出一个文件

交付：
  ├─ Agent 具备基本决策能力
  └─ 处理质量相比固定流程有提升
```

### 阶段 4：MCP + 文件监控 + Web UI（1 周）

```
任务 4.1: MCP 通道
  ├─ agent/channels/mcp.py
  ├─ 替换旧 servers/mcp.py
  └─ 验证：OpenCode 调用 Agent

任务 4.2: 文件监控
  ├─ agent/channels/filewatch.py
  └─ 验证：丢文件到 input/ 自动处理

任务 4.3: Web UI
  ├─ 简单 FastAPI 页面（可选，后期加）
  └─ 验证：浏览器能上传和查看进度

交付：
  ├─ 全通道覆盖
  └─ 任意入口都可使用 Agent
```

---

## ✅ 关键决策记录

| # | 决策 | 选择 | 理由 |
|---|------|------|------|
| 1 | **语言** | Python | 现有代码复用、AI 生态、轻量 |
| 2 | **架构** | Agent-first | 多通道输入、自主调度、主动通知 |
| 3 | **异步** | asyncio | 天然适合 IO 密集型 Agent |
| 4 | **主入口** | 企业微信 | 手机拍照最方便 |
| 5 | **REST 通道** | FastAPI | 薄路由层，不绑定 Agent |
| 6 | **任务队列** | asyncio.PriorityQueue | 内存队列，无需数据库 |
| 7 | **大模型** | GLM5（固定） | 已验证，不提供选择 |
| 8 | **图像处理** | Pillow + 原生 Python | 无 OpenCV 依赖 |
| 9 | **输出格式** | Obsidian Markdown | 支持标签、公式 |
| 10 | **部署架构** | Agent 主进程 + FastAPI 子进程 | REST 不绑定 Agent，可独立停止/启动 |
| 11 | **状态机粒度** | 2 主态：IDLE/PROCESSING | 简洁，PAUSED/ERROR 作为 PROCESSING 子状态 |

---

## 📝 配置示例

### config.yaml

```yaml
agent:
  name: WrongMath
  max_concurrent: 3
  auto_cleanup: true
  cleanup_hours: 24

channels:
  wecom:
    enabled: true
    webhook_url: https://qyapi.weixin.qq.com/...
    token: your_token

  rest:
    enabled: true
    host: "0.0.0.0"
    port: 8080

  mcp:
    enabled: true

  filewatch:
    enabled: true
    input_dir: "./input"
    poll_interval: 5

subjects:
  - 数学
  - 语文
  - 英语
  - 物理
  - 化学
  - 生物
  - 历史
  - 地理
  - 政治
```

### .env

```
SILICONFLOW_API_KEY=sk-xxx
GLM5_API_KEY=xxx
```

---

## 💭 最终建议

1. **先跑通 Agent 骨架**：状态机 + 队列 + 调度器 + REST 通道，这是核心
2. **企业微信放第二**：确保流程先跑通，再上企业微信
3. **core/ 不动**：Scheduler 直接 import 调用，不改 `core/services/` 一行代码
4. **决策策略逐步加**：先固定流程跑通，再优化
5. **Web UI 最后**：日常用企业微信就够了

---

> **重新开始，但不需要推倒重来。** `core/services/` 和 `servers/mcp.py` 都能保留，核心架构换 Python + asyncio，从 Java 的 50MB jar 减到几 MB 的 Python 进程。
