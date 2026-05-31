# WrongMath V1 代码学习笔记

---

## Q1: 我想学习这个agent的代码，我该如何入手？

**答：** 按数据流方向，从入口往下读最清晰：

**阅读顺序：**

1. **`main.py`** — 启动入口，创建 AgentEngine + REST 通道
2. **`config/config.yaml`** + **`config/settings.py`** — 配置加载
3. **`agent/task.py`** — Task 数据结构（id/file_path/status/retries）
4. **`agent/task_queue.py`** — 异步优先级队列 + JSON 持久化
5. **`agent/engine.py`** — 生命周期：start → submit_task → scheduler → shutdown
6. **`agent/scheduler.py`** — 核心管线：预处理 → GLM → 保存
7. **`core/services/image_preprocessor.py`** — 图像增强 + 缩放 + base64
8. **`agent/services/glm_service.py`** — GLM-4.5V API 调用 + JSON 解析
9. **`agent/services/result_saver.py`** — JSON → Markdown 试卷

**数据流：**

```
用户图片 → preprocessor(resize) → GLM-4.5V(extract JSON)
  → result_saver(N. + <br> + 配图) → output/数学/2026-05-28.md
```

每层只有一个核心函数，比如 `scheduler.py` 的 `scheduler_loop(engine)` 只有 50 行，`result_saver.py` 的 `save_result(result)` 只有 30 行。

建议先从 `main.py` 和 `scheduler.py` 看起，这两文件串联起了整个流程。

---

## Q2: 先讲解main.py

**答：** 逐行讲解：

**1-5 行：导入**

```python
import asyncio      # Agent 用异步（非多线程）
import signal       # 监听 Ctrl+C 强制退出
from dotenv import load_dotenv  # 加载 .env 环境变量
```

**7-8 行：项目内部导入**

```python
from config.settings import Settings  # 读取 config.yaml 的类型化配置
from agent.engine import AgentEngine  # Agent 生命周期管理器
```

**10 行：加载 API Key**

```python
load_dotenv()  # 从 .env 读 SILICONFLOW_API_KEY → os.getenv() 可用
```

必须在 `AgentEngine` 创建前调用，因为 `GLMService.__init__()` 内部会 `os.getenv("SILICONFLOW_API_KEY")`。

**12-16 行：日志格式**

```python
logging.basicConfig(...)  # [时间] 模块名 - 级别 - 消息
```

格式：`[2026-05-28 14:13:49] agent.engine - INFO - Agent starting...`

**19-23 行：WrongMathApp 初始化**

```python
class WrongMathApp:
    def __init__(self):
        self.settings = Settings()    # 配置中心
        self.agent = AgentEngine()    # Agent 引擎
```

**24-36 行：`start()` — 核心启动流程**

分三步：

**步骤 1** — 启动 Agent 引擎：

```python
await self.agent.start()
```

进 idle 状态，等待任务提交。

**步骤 2** — 启动 REST 通道（if enabled）：

```python
if self.settings.rest_enabled:
    rest = RestChannel(host="0.0.0.0", port=19238)
    await rest.start(self.agent)
```

`RestChannel` 内部启动 uvicorn **子进程**跑 `servers/web_app.py`。Agent 和 Web 是两个独立进程，通过 AgentEngine 通信。

**步骤 3** — 打印就绪，等信号：

```python
logger.info("WrongMath ready.")
```

**40-47 行：优雅退出**

```python
stop_event = asyncio.Event()       # 空信号量
signal(SIGINT/SIGTERM, set)        # Ctrl+C → 设置信号量
await stop_event.wait()            # 阻塞，直到收到信号
await self.shutdown()              # 收到信号后才执行关闭
```

不用 `while True: await sleep(1)` 死循环，用 asyncio.Event 精准阻塞。

**50-58 行：`shutdown()` — 关闭**

```python
for ch in self.agent.channels.values():
    await ch.stop()        # 先停所有通道（REST）
await self.agent.shutdown()  # 再停 Agent 引擎
```

关闭顺序：通道 → Agent（逆启动顺序）。

**61-67 行：入口**

```python
async def main():
    app = WrongMathApp()
    await app.start()       # 这里阻塞，直到收到 Ctrl+C

if __name__ == "__main__":
    asyncio.run(main())     # Python 3.7+ 标准异步入口
```

**关键设计点：**

- 整个程序只有一个 `await` 阻塞点：`stop_event.wait()`（47 行）
- Agent + REST 通道是两个独立进程，不共享内存
- `load_dotenv()` 在模块顶层调用，保证后续所有 `os.getenv()` 都读到值

---

## Q3: 介绍下main.py的python语法

**答：** main.py 涉及的 10 个 Python 语法知识点：

### 1. `async def` / `await` — 协程

```python
async def start(self):           # 声明这是一个协程函数
    await self.agent.start()     # 等待另一个协程完成
    await stop_event.wait()      # 等待事件触发
```

- `async def` 定义的函数不会立即执行，返回一个 **coroutine 对象**
- `await` 暂停当前协程，等右边操作完成后继续
- 类比：`async def` = 定义异步任务，`await` = 等这个任务跑完
- 背后是 **事件循环（event loop）** 在调度，不是多线程

### 2. `asyncio.run()` — 启动事件循环

```python
asyncio.run(main())  # 创建事件循环 → 运行 main() → 关闭循环
```

Python 3.7+ 的新 API，等价于旧写法：

```python
loop = asyncio.get_event_loop()
loop.run_until_complete(main())
```

### 3. `asyncio.Event()` — 异步信号量

```python
stop_event = asyncio.Event()       # 创建，默认未触发（False）
await stop_event.wait()            # 阻塞，直到 .set() 被调用
```

- `.set()`：点亮信号量，所有等待者继续
- `.wait()`：阻塞当前协程直到信号量被 set
- 比 `while True: await asyncio.sleep(1)` 高效，不浪费 CPU

### 4. `if __name__ == "__main__"` — 入口守护

```python
if __name__ == "__main__":
    asyncio.run(main())
```

- `python3 main.py` → `__name__` 是 `"__main__"` → 执行
- `import main` → `__name__` 是 `"main"` → 不执行
- 保证文件既可以作为脚本运行，也可以被其他模块 import

### 5. 延迟导入（Lazy Import）

```python
if self.settings.dict.get("channels", {}).get("rest", {}).get("enabled", True):
    from agent.channels.rest import RestChannel   # 用到才导入
```

为什么写在函数里而不是顶部？

- 只有 REST 通道启用时才加载 `RestChannel` 模块
- 如果以后加微信通道，不用加载 REST 模块
- **注意**：Python 的 `import` 可以在任何位置写，不限于文件顶部

### 6. `try/except NotImplementedError`

```python
try:
    asyncio.get_event_loop().add_signal_handler(s, stop_event.set)
except NotImplementedError:
    pass   # Windows 不支持信号处理，忽略
```

Windows 上没有 POSIX 信号（SIGINT/SIGTERM），`add_signal_handler` 会抛 `NotImplementedError`。捕获后静默跳过，保证跨平台。

### 7. `signal.SIGINT` / `signal.SIGTERM`

```python
for s in (signal.SIGINT, signal.SIGTERM):
    asyncio.get_event_loop().add_signal_handler(s, stop_event.set)
```

- `SIGINT` = Ctrl+C
- `SIGTERM` = `kill <pid>` 默认信号
- `add_signal_handler(s, callback)` = 收到信号 s 时执行 callback

整体效果：用户按 Ctrl+C → `stop_event.set()` → 第 47 行 `await` 解除阻塞 → 执行 `shutdown()`

### 8. `logging.basicConfig()`

```python
logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] %(name)s - %(levelname)s - %(message)s",
)
```

- `%(asctime)s` → 时间戳
- `%(name)s` → `logger = logging.getLogger("main")` 里传的名字
- `%(levelname)s` → INFO/WARNING/ERROR
- `%(message)s` → 日志消息正文

输出示例：`[2026-05-28 14:13:49] main - INFO - WrongMath ready.`

### 9. `self` — 实例方法

```python
class WrongMathApp:
    def __init__(self):
        self.settings = Settings()    # 绑定到实例
        self.agent = AgentEngine()

    async def start(self):
        await self.agent.start()      # 通过 self 访问
```

- `self` 是实例本身的引用，不是关键字（但约定俗成）
- `self.settings` = 这个实例的 settings 属性
- Python 方法第一个参数必须是 `self`（显式，不像 Java `this` 隐式）

### 10. `dict.get(key, default)` — 安全取值

```python
self.settings.dict.get("channels", {}).get("rest", {}).get("enabled", True)
```

链式 `.get()` 保护每一层都可能不存在。等价于：

```python
try:
    enabled = settings["channels"]["rest"]["enabled"]
except KeyError:
    enabled = True   # 默认值
```

---

## Q4: main.py程序运行时各个方法的加载顺序

**答：** 执行顺序如下：

```python
python3 main.py
```

### 加载阶段（不执行逻辑，只定义/导入）

```
1. import asyncio / signal / logging / os        ← 标准库
2. from dotenv import load_dotenv               ← 第三方库
3. from config.settings import Settings         ← 触发 Settings.__init__()
4. from agent.engine import AgentEngine         ← 触发 AgentEngine.__init__()
5. load_dotenv()                                ← 读 .env → os.environ
6. logging.basicConfig(...)                     ← 设置日志格式
7. logger = logging.getLogger("main")           ← 创建 logger
8. class WrongMathApp: ...                      ← 定义类（不执行方法体）
9. async def main(): ...                        ← 定义协程（不执行）
10. if __name__ == "__main__":                  ← 是 True
```

### 执行阶段

```
11.   asyncio.run(main())                       ← 启动事件循环
       │
       └→ 12. main():
             │
             ├→ 13. app = WrongMathApp()
             │      ├→ self.settings = Settings()        ← 读 config.yaml
             │      └→ self.agent = AgentEngine()        ← 仅建对象，不 start
             │
             └→ 14. await app.start()
```

### `app.start()` 内部

```
15.   await self.agent.start()                  ← engine 进 idle
16.   if rest_enabled:
17.     from agent.channels.rest import RestChannel   ← 延迟导入
18.     rest = RestChannel(host, port)          ← 建 REST 通道对象
19.     await rest.start(self.agent)            ← 启动 uvicorn 子进程
20.   stop_event = asyncio.Event()              ← 建空信号量
21.   await stop_event.wait()                   ← ***** 永久阻塞在此 *****
```

### 收到 Ctrl+C 后

```
22.   await self.shutdown()
        ├→ 23. await rest.stop()                ← 先关通道
        └→ 24. await self.agent.shutdown()      ← 再关引擎
25.   ← main() 返回
26. ← asyncio.run() 关闭事件循环
```

### 时间线总结

```
t0:  import 模块 + 定义类
t1:  load_dotenv() / logging.basicConfig()
t3:  asyncio.run(main())     ← 执行开始
t4:  App 初始化（Settings + AgentEngine）
t5:  agent.start()          ← 进 idle
t6:  rest.start()           ← uvicorn 启动
t7:  stop_event.wait()      ← 死等，直到 Ctrl+C
     ... 期间 Web 服务在处理请求 ...
tN:  Ctrl+C → shutdown      ← 清理退出
```

关键：`app.start()` 里的 `await stop_event.wait()` 是**唯一的阻塞点**，Web 请求由 uvicorn 子进程独立处理，不走这个事件循环。

---

## Q5: 讲解 agent/engine.py

**答：** AgentEngine 是 Agent 的**生命周期管理器**，不处理业务逻辑，只负责状态切换和调度。

完整源码只有 59 行，核心是一个**状态机**：

```
init → idle ⇄ processing → shutdown
```

---

### 10-15 行：初始化

```python
class AgentEngine:
    def __init__(self, task_queue=None):
        self.state = "init"                    # 当前状态
        self.queue = task_queue or TaskQueue()  # 任务队列
        self.scheduler = None                  # 调度器协程引用
        self.channels = {}                     # 通信通道（REST/微信等）
```

- `self.state` — 状态机核心，所有方法都根据它判断能不能执行
- `self.queue` — `TaskQueue` 实例，内部是 `asyncio.PriorityQueue`
- `self.scheduler` — 存的是 `asyncio.Task` 对象，不是函数（后面会说）
- `self.channels` — 存 `RestChannel` 等，`main.py` 中 `agent.channels["rest"] = rest` 注入

---

### 17-21 行：`start()` — 启动

```python
async def start(self):
    await self.queue.restore()    # 从磁盘恢复上次未完成的任务
    self.state = "idle"           # 就绪，等待 submit_task
```

`self.queue.restore()` 从 `data/queue_state.json` 反序列化任务。即使服务重启也不会丢任务。

---

### 23-30 行：`submit_task()` — 提交任务

```python
async def submit_task(self, source, file_path) -> str:
    task = Task(source=source, file_path=file_path)
    await self.queue.put(task)           # 入队
    if self.state == "idle":              # 第一次有任务时
        self.state = "processing"         # 切换状态
        self.scheduler = asyncio.create_task(self._run_scheduler())  # ★ 启动调度器
    return task.id
```

**关键设计：懒启动**

第一次 `submit_task()` 才启动调度器，不是 `start()` 时就启动。类比：汽车不是点火就踩油门，而是挂档后才走。

`asyncio.create_task()` 把协程包装成 **Task 对象**，丢给事件循环后台执行。`self.scheduler` 存的是这个 Task 的引用，shutdown 时要用它取消。

---

### 32-39 行：`_run_scheduler()` — 调度器入口

```python
async def _run_scheduler(self):
    from agent.scheduler import scheduler_loop   # 延迟导入
    try:
        await scheduler_loop(self)  # 传 self（即 engine），让 scheduler 能访问 queue/channels
    except asyncio.CancelledError:  # shutdown 时 cancel 触发
        pass
    if self.queue.qsize == 0 and self.state != "shutdown":
        self.state = "idle"         # 队列空了，回到 idle
```

- 只包裹 `scheduler_loop`，自身的业务 = 0
- `scheduler_loop` 正常退出（队列空了）→ 回到 idle
- `scheduler_loop` 被 cancel（shutdown）→ 不回到 idle
- 延迟导入 `scheduler_loop`，避免循环依赖

---

### 41-47 行：`notify_all()` — 广播通知

```python
async def notify_all(self, ctx):
    for ch in self.channels.values():
        if hasattr(ch, "notify"):      # 鸭子类型检查
            await ch.notify(ctx)       # 通知通道（推送结果等）
```

用 `hasattr(ch, "notify")` 而不是 `isinstance(ch, ProtocolHandler)`，是 **鸭子类型**（duck typing）——只要你有 `notify` 方法，就能被广播，不强制继承某基类。

---

### 49-59 行：`shutdown()` — 关闭

```python
async def shutdown(self):
    self.state = "shutdown"               # 先改状态，阻止新任务
    if self.scheduler and not self.scheduler.done():
        self.scheduler.cancel()           # 取消调度器协程
        await asyncio.wait_for(self.scheduler, timeout=5.0)  # 最多等 5 秒
    await self.queue.shutdown()           # 持久化队列到磁盘
```

关闭顺序：状态 → cancel scheduler → 等 5 秒超时 → 持久化队列。

`asyncio.wait_for(task, timeout=5.0)` — 最多等 5 秒让 task 完成，超时就抛 `TimeoutError`。

---

### 状态机总结

```
               ┌─────────────────────┐
               │                     │
    start()    ▼      submit_task()  │  队列空了
init ──────► idle ───────────────► processing ───► idle
                                   │
                              shutdown()  队列不空但被 cancel
                                   │
                                   ▼
                               shutdown ───► queue 持久化 → 结束
```

---

### 关键语法点

**1. `Optional[T]` — 可空类型提示**

```python
self.scheduler: Optional[asyncio.Task] = None  # 可以是 asyncio.Task 或 None
```

等价于 `asyncio.Task | None`（Python 3.10+）。

**2. `asyncio.create_task()` — 后台启动协程**

```python
self.scheduler = asyncio.create_task(self._run_scheduler())
```

把协程变成 Task 丢给事件循环，**不等它结束就立刻返回**。相当于"启动一个后台线程"但本质还是单线程协程。

**3. `asyncio.Task.cancel()` — 取消协程**

```python
self.scheduler.cancel()
```

给协程注入 `CancelledError` 异常。协程必须自己 `try/except CancelledError` 捕获，否则协程直接终止。

**4. `asyncio.wait_for()` — 限时等待**

```python
await asyncio.wait_for(self.scheduler, timeout=5.0)
```

等 task 最多 5 秒，超时抛 `TimeoutError`。防止 shutdown 时调度器卡死永不退出。

**5. `hasattr(obj, "method")` — 鸭子类型**

```python
if hasattr(ch, "notify"):
    await ch.notify(ctx)
```

判断对象有没有某属性/方法，有就调。不强制继承，只要实现了 `notify()` 就行。

**6. `**kwargs` — 可变关键字参数**

```python
async def submit_task(self, source: str, file_path: str, **kwargs) -> str:
    task = Task(source=source, file_path=file_path, **kwargs)
```

`**kwargs` 捕获所有额外的命名参数（如 `priority=1`），透传给 `Task` 构造器。python 里常见的透传模式。

---

## Q6: engine.py 运行时加载顺序

**答：** engine.py 不像 main.py 是入口，它**被 main.py import 后**才开始工作。整条链路：

```
main.py                        engine.py                       scheduler.py
────────                       ─────────                       ────────────
import AgentEngine
  → AgentEngine.__init__()     # state=init, queue, channels
  → return 到 main

await agent.start()
  → agent.start()              # restore 队列, state=idle
  → return 到 main

... uvicorn 启动，Web 可用 ...

用户上传图片 → web_app.py → rest.py → engine.submit_task("rest", path)
  → engine.submit_task()
      Task() 创建                # task.py: Task 数据类初始化
      queue.put(task)            # task_queue.py: 入队
      if idle:
        state = "processing"
        asyncio.create_task(     # 后台启动协程
          _run_scheduler()
        ) → return 到 submit
  → return task.id → rest → web_app → 用户收到 200

后台事件循环执行:
  _run_scheduler()
    → import scheduler_loop     # 延迟导入
    → await scheduler_loop(self)
        │
        ├→ queue.get()          # 阻塞，等队列有任务
        ├→ glm.process_image()  # 调 GLM-4.5V
        ├→ save_result()        # 写 Markdown
        ├→ notify_all()         # 广播给通道
        ├→ queue.get()          # 继续等下一个任务...
        │  ... 如果队列空 → 退出 while 循环
        └→ return
    → state = "idle"             # 队列空了，回 idle

用户按 Ctrl+C:
  main.py stop_event.set()
  main.py await agent.shutdown()
    → engine.shutdown()
        state = "shutdown"
        scheduler.cancel()      # 注入 CancelledError
        await wait_for(5s)      # 等 scheduler_loop 收尾
        queue.shutdown()        # 持久化到磁盘
        return
```

**调用关系总结：**

```
             调用者            被调用者
             ──────           ──────
import 时    Python 解释器     __init__()
main.py      main.start()     start()
rest.py      上传请求          submit_task()
事件循环      create_task      _run_scheduler()
_run_sched.  await            scheduler_loop()  [agent/scheduler.py]
sched_loop   await            process_image()   [glm_service.py]
sched_loop   直接调用          save_result()      [result_saver.py]
sched_loop   await            notify_all()
main.py      shutdown()       shutdown()

调用栈最深时（处理一个任务）:
  event_loop
    └─ _run_scheduler()
        └─ scheduler_loop()
            ├─ glm.process_image()     ← 等 API 返回（最耗时）
            └─ save_result()           ← 同步写文件
```

**谁调谁，一目了然：**

| 方法 | 被谁调用 | 调用时机 |
|------|---------|---------|
| `__init__()` | Python 解释器 | `import AgentEngine` 时 |
| `start()` | `main.py` | 程序启动，一次 |
| `submit_task()` | `rest.py`（通过 engine 引用） | 每次用户上传 |
| `_run_scheduler()` | `asyncio.create_task()` | 第一次 submit_task 时 |
| `notify_all()` | `scheduler.py` | 每个任务处理完 |
| `shutdown()` | `main.py` | Ctrl+C，一次 |

**状态切换时间线：**

```
状态         触发                                 转为
────         ────                                ────
init         __init__() 自动设置
init    →    start()                             idle
idle    →    submit_task()（队列从空变非空）       processing
processing→ scheduler_loop() 退出（队列空了）      idle
idle    →    submit_task()（又来了新任务）          processing
任意    →    shutdown()                           shutdown
```
