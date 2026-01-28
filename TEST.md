# Jimeng 插件测试指南

## 快速测试（2分钟）

### 1. 准备测试 JSON

复制以下内容：

```json
{
  "metadata": {
    "title": "快速测试"
  },
  "items": {
    "test1": {
      "name": "山景日落",
      "prompt": "A beautiful mountain landscape at sunset, golden hour lighting, 4k quality"
    },
    "test2": {
      "name": "赛博城市",
      "prompt": "A futuristic cyberpunk city with neon lights, flying cars, highly detailed"
    }
  }
}
```

### 2. 打开控制面板

1. 点击 Chrome 工具栏的 **Jimeng 插件图标**
2. 点击 **"⚙️ 打开 API 控制面板"**

### 3. 导入并生成

1. 在控制面板中找到 **"直接粘贴 JSON 内容"** 文本框
2. 粘贴上面的 JSON
3. 点击 **"解析并添加任务"**
4. 点击 **"开始处理"**

### 4. 检查结果

- 观察 **任务队列** 和 **运行日志**
- 大约 30-60 秒后任务完成
- 点击 **"📦 打包下载全部"**
- 选择 **"下载为ZIP"** 生成 HTML 下载页面

---

## 自动化测试（高级）

如果你需要程序化调用，目前有两种方式：

### 方式 A: WebSocket 桥接（已提供）

```bash
# 1. 启动桥接服务
python ws_bridge.py

# 2. Python 调用
import requests
requests.post('http://localhost:8787/api/batch', json={
    'prompts': [...],
    'model': 'jimeng-4.5'
})
```

### 方式 B: 通过扩展 ID 发送消息（需要配置）

需要先在扩展 manifest 中声明 `externally_connectable`。

---

## 测试清单

- [ ] 能正常打开控制面板
- [ ] JSON 粘贴后能正确解析
- [ ] 点击开始处理后任务进入队列
- [ ] 日志显示提交成功
- [ ] 图片生成完成后按钮变为绿色
- [ ] 可以正常下载图片

如果所有项目都通过，说明插件工作正常！
