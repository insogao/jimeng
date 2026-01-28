# Native Messaging 使用指南

## 方案说明

由于 Chrome Extension Manifest V3 的限制，插件无法直接监听 TCP 端口提供 HTTP API。

本方案采用 **文件 IPC** 机制实现外部调用：

```
外部程序 ──文件──→ ~/.jimeng/native-messaging/task_xxx.json
                                          ↓
浏览器插件 ←────── 自动检测并处理 ←──────┘
```

## 快速开始

### 1. 安装 Python 客户端

```bash
cd native-messaging
pip install -e .  # 或使用 python -m pip install -e .
```

### 2. Python 代码调用

```python
from jimeng_native import JimengClient

# 创建客户端
client = JimengClient()

# 批量生成
result = client.batch_generate([
    {"name": "场景1", "prompt": "a beautiful landscape..."},
    {"name": "场景2", "prompt": "a cyberpunk city..."}
])

print(result)
```

### 3. CLI 使用

```bash
# 单张生成
python -m jimeng_native generate "a beautiful sunset" --name "日落"

# 批量生成（从 JSON 文件）
python -m jimeng_native batch prompts.json --model jimeng-4.5 --ratio 16:9

# 查看状态
python -m jimeng_native status
```

## Skill 格式范例

对于 AI 助手，使用以下格式：

### Skill: Jimeng 批量图片生成

```yaml
name: jimeng_batch_generate
description: 使用 Jimeng/Dreamina AI 批量生成图片

parameters:
  json_file:
    type: string
    description: JSON 文件路径，包含 prompts
  model:
    type: string
    default: "jimeng-4.5"
    enum: ["jimeng-4.5", "jimeng-4.1", "jimeng-4.0", "jimeng-3.0"]
  ratio:
    type: string
    default: "16:9"
    enum: ["16:9", "9:16", "1:1", "4:3", "3:4"]

execution:
  command: |
    python -m jimeng_native batch {{json_file}} --model {{model}} --ratio {{ratio}}
  
  requirements:
    - Chrome 浏览器已打开
    - Jimeng 插件已加载
    - native-messaging 目录可写
```

### Skill: Jimeng 单张生成

```yaml
name: jimeng_generate
description: 使用 Jimeng AI 生成单张图片

parameters:
  prompt:
    type: string
    description: 图片描述
  name:
    type: string
    default: "single"
  model:
    type: string
    default: "jimeng-4.5"
  ratio:
    type: string
    default: "16:9"

execution:
  command: |
    python -m jimeng_native generate "{{prompt}}" --name {{name}} --model {{model}} --ratio {{ratio}}
```

## 进阶用法

### 带进度回调

```python
from jimeng_native import JimengClient

def on_progress(task_id, completed, total):
    print(f"进度: {completed}/{total}")

def on_image(task_id, name, urls):
    print(f"✓ {name}: {len(urls)} 张")

client = JimengClient(
    on_progress=on_progress,
    on_image_ready=on_image,
    timeout=600  # 10分钟超时
)

result = client.batch_generate([...], wait=True)
```

### 异步非阻塞

```python
# 只提交，不等待
client.batch_generate([...], wait=False)

# 稍后查询状态
import time
time.sleep(30)
status = client.get_status()
```

## 故障排除

### "No browser connected"
- 确保 Chrome 已打开
- 确保 Jimeng 插件已启用

### 任务卡住
- 检查浏览器是否在前台
- 查看插件 popup 页面状态

### 权限错误
- 检查 `~/.jimeng` 目录是否有写权限
- Windows: 以管理员身份运行

## 技术细节

- **通信机制**: 文件 IPC (JSON 文件)
- **轮询间隔**: 2 秒
- **超时时间**: 默认 5 分钟
- **并发**: 单任务顺序执行
- **持久化**: 任务在 `~/.jimeng/native-messaging/`
