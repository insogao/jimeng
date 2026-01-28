# Chrome Native Messaging 集成方案

通过标准输入/输出 (stdin/stdout) 与浏览器插件通信，**无需启动 HTTP 服务器**。

## 工作原理

```
你的程序 → stdout (JSON + 4字节长度) → Chrome → 浏览器插件
            ↑___________________________________________|
                          (stdin 返回结果)
```

## 快速开始

### 1. 安装 Native Messaging Host

**Windows:**
```powershell
# 以管理员身份运行 PowerShell
python install_host.py
```

**macOS/Linux:**
```bash
python3 install_host.py
```

### 2. 启动 Chrome（确保插件已加载）

### 3. 运行你的程序

```python
from jimeng_native import JimengClient

client = JimengClient()

# 批量生成
result = client.batch_generate({
    "prompts": [
        {"name": "场景1", "prompt": "a beautiful landscape..."},
        {"name": "场景2", "prompt": "a cyberpunk city..."}
    ],
    "model": "jimeng-4.5",
    "ratio": "16:9"
})

print(result)
```

## 消息格式

### 请求 (你的程序 → Chrome)

```json
{
  "action": "batch_generate",
  "id": "task-001",
  "payload": {
    "prompts": [...],
    "model": "jimeng-4.5",
    "ratio": "16:9",
    "interval": 1
  }
}
```

### 响应 (Chrome → 你的程序)

```json
{
  "id": "task-001",
  "status": "submitted",
  "message": "5 prompts queued"
}
```

## Python 客户端库

```python
from jimeng_native import JimengClient, JimengError

# 创建客户端
client = JimengClient(timeout=300)  # 5分钟超时

try:
    # 方法1: 批量生成
    result = client.batch_generate(
        prompts=[
            {"name": "场景1", "prompt": "描述1"},
            {"name": "场景2", "prompt": "描述2"}
        ],
        model="jimeng-4.5",
        ratio="16:9"
    )
    print(f"已提交: {result['count']} 个任务")
    
    # 方法2: 等待完成（阻塞）
    results = client.batch_generate_and_wait(
        prompts=[...],
        poll_interval=5  # 每5秒查询一次
    )
    
    for item in results:
        print(f"{item['name']}: {item['images']}")
        
except JimengError as e:
    print(f"错误: {e}")
```

## CLI 使用

```bash
# 生成单张
python -m jimeng_native generate "a beautiful landscape" --model jimeng-4.5

# 批量生成（从 JSON 文件）
python -m jimeng_native batch prompts.json --ratio 16:9

# 等待完成并下载
python -m jimeng_native batch prompts.json --wait --download ./output
```

## 高级用法：流式回调

```python
from jimeng_native import JimengClient

def on_progress(task_id, completed, total):
    print(f"进度: {completed}/{total}")

def on_image_ready(task_id, prompt_name, image_urls):
    print(f"✓ {prompt_name}: {len(image_urls)} 张图片")

client = JimengClient(
    on_progress=on_progress,
    on_image_ready=on_image_ready
)

client.batch_generate([...], wait=True)
```

## 故障排除

### "Native messaging host not found"
- 确保运行了 `install_host.py`
- 检查注册表/配置文件是否正确

### "Connection closed"
- 确保 Chrome 已打开且插件已加载
- 检查插件 ID 是否匹配

### 消息无响应
- Native Messaging 有 4KB 消息限制（单条）
- 大数据分片发送

## 技术细节

- **消息格式**: 4字节长度(小端序) + JSON
- **编码**: UTF-8
- **限制**: 单条消息最大 1MB
- **超时**: Chrome 默认 5 分钟无响应会断开
