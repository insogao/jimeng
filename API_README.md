# Jimeng Batch API 使用说明

## 快速开始

### 1. 安装插件
- 打开 Chrome 扩展管理页面 `chrome://extensions/`
- 开启"开发者模式"
- 加载已解压的扩展，选择 `jimeng` 文件夹

### 2. 打开 API 控制面板
- 点击扩展图标 → 点击"⚙️ 打开 API 控制面板"链接
- 或直接访问扩展内的页面：`chrome-extension://<extension-id>/api/batch.html`

### 3. 提交任务

#### 方式 A：拖拽文件（最简单）
1. 准备好包含 `prompt` 字段的 JSON 文件
2. 直接拖拽到控制面板的"快速导入"区域
3. 点击"开始处理"

#### 方式 B：直接粘贴 JSON
1. 复制 JSON 内容到剪贴板
2. 粘贴到"直接粘贴 JSON 内容"文本框
3. 点击"解析并添加任务"

#### 方式 C：使用 Python 脚本
```bash
python api_client.py your_prompts.json --model jimeng-4.5 --ratio 16:9
```

脚本会生成一个导入文件，拖拽到控制面板即可。

## API 控制面板功能

### 状态监控
- **待处理**: 队列中等待的任务数
- **进行中**: 当前正在生成的任务
- **已完成**: 成功生成的图片数量
- **失败**: 失败的任务数

### 设置选项
- **模型**: jimeng-4.5 / 4.1 / 4.0 / 3.0
- **比例**: 16:9 / 9:16 / 1:1 / 4:3 / 3:4
- **间隔时间**: 每个请求之间的等待时间（秒）

### 任务队列
- 实时显示当前队列中的任务
- 每个任务显示名称和状态

### 运行日志
- 实时显示提交和生成状态
- 成功/失败信息

### 控制按钮
- **开始处理**: 开始批量生成
- **暂停**: 暂停当前任务（可继续）
- **清空记录**: 清空队列和结果
- **导出结果**: 导出所有结果到 JSON 文件

## 图片下载设置

在"设置"面板中选择下载方式：

### 1. 自动下载到默认目录（推荐）
- 图片自动保存到浏览器默认下载目录
- 可自定义子目录路径，如 `jimeng/我的任务`
- 文件命名：`/<子目录>/<提示词名称>/<时间戳>.png`

### 2. 每次手动选择目录
- 每张图片生成后都会弹出保存对话框
- 可自由选择保存位置和文件名

### 3. 仅生成不下载
- 只提交生成请求，不自动下载
- 适合在 Jimeng 网站查看结果

默认保存路径示例：
```
Downloads/jimeng/三体行星/1706421234567.png
```

## JSON 文件格式

```json
{
  "metadata": {
    "title": "任务名称"
  },
  "base_prompts": {
    "item1": {
      "name": "提示词名称",
      "prompt": "详细的 prompt 描述..."
    },
    "item2": {
      "name": "另一个提示词",
      "prompt": "另一个 prompt 描述..."
    }
  }
}
```

插件会递归遍历 JSON 中所有包含 `prompt` 字段的对象。

## 高级用法：程序化提交

### 通过 Chrome Console
在 API 控制面板页面打开开发者工具，执行：

```javascript
// 直接添加任务
document.dispatchEvent(new CustomEvent('jimeng-add-task', {
    detail: {
        name: 'My Task',
        prompts: [
            { name: 'Prompt 1', prompt: 'description 1' },
            { name: 'Prompt 2', prompt: 'description 2' }
        ],
        model: 'jimeng-4.5',
        ratio: '16:9',
        interval: 1
    }
}));
```

### 通过 Storage API
在其他扩展页面或 Content Script 中：

```javascript
const API_QUEUE_KEY = 'jimeng_api_queue';

// 读取当前队列
const result = await chrome.storage.local.get([API_QUEUE_KEY]);
const queue = result[API_QUEUE_KEY] || [];

// 添加新任务
queue.push({
    id: 'task-' + Date.now(),
    name: 'My Task',
    prompts: [...],
    model: 'jimeng-4.5',
    ratio: '16:9',
    interval: 1,
    status: 'pending',
    createdAt: Date.now()
});

// 保存
await chrome.storage.local.set({ [API_QUEUE_KEY]: queue });
```

## 注意事项

1. **浏览器必须保持打开**: 生成过程中请不要关闭浏览器
2. **下载目录**: 图片只能下载到浏览器设置的默认下载目录
3. **权限**: 首次使用需要授予下载权限
4. **登录状态**: 确保已在 Jimeng/Dreamina 网站登录

## 故障排除

### 图片没有自动下载
- 检查浏览器下载设置
- 确保授予了扩展下载权限

### 任务卡住
- 点击"暂停"然后"继续处理"
- 或刷新控制面板页面

### 找不到控制面板
1. 打开 `chrome://extensions/`
2. 找到 Jimeng 插件，复制 ID
3. 访问 `chrome-extension://<id>/api/batch.html`
