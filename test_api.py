#!/usr/bin/env python3
"""
Jimeng API 测试脚本

直接通过 Chrome DevTools Protocol 或指导用户手动测试
"""

import json
import webbrowser
import time
from pathlib import Path


def get_extension_url():
    """获取扩展控制面板 URL"""
    # 注意：实际 ID 需要从 Chrome 扩展页面获取
    return "chrome-extension://YOUR_EXTENSION_ID/api/batch.html"


def open_control_panel():
    """打开 API 控制面板"""
    print("正在尝试打开控制面板...")
    print("如果无法自动打开，请手动访问: chrome-extension://<id>/api/batch.html")
    
    # 创建本地测试页面
    test_html = Path("test_page.html")
    html_content = """<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Jimeng 测试</title>
    <style>
        body { font-family: sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
        .step { background: #f5f5f5; padding: 20px; margin: 20px 0; border-radius: 8px; }
        code { background: #e0e0e0; padding: 2px 6px; border-radius: 4px; }
        button { padding: 10px 20px; margin: 5px; cursor: pointer; }
        textarea { width: 100%; height: 200px; font-family: monospace; }
    </style>
</head>
<body>
    <h1>🎨 Jimeng 插件测试</h1>
    
    <div class="step">
        <h2>步骤 1: 准备 JSON</h2>
        <p>复制以下测试 JSON：</p>
        <textarea id="json-input">{
  "metadata": {
    "title": "测试任务"
  },
  "scenes": {
    "landscape": {
      "name": "山景",
      "prompt": "A beautiful mountain landscape at sunset, golden hour, 4k quality"
    },
    "city": {
      "name": "城市", 
      "prompt": "A futuristic cyberpunk city with neon lights, highly detailed"
    }
  }
}</textarea>
        <button onclick="copyJson()">📋 复制 JSON</button>
    </div>
    
    <div class="step">
        <h2>步骤 2: 打开插件</h2>
        <p>点击下方按钮或手动操作：</p>
        <ol>
            <li>点击浏览器工具栏的 Jimeng 插件图标</li>
            <li>点击 "⚙️ 打开 API 控制面板"</li>
        </ol>
        <button onclick="openPanel()">🔧 打开控制面板</button>
    </div>
    
    <div class="step">
        <h2>步骤 3: 粘贴并生成</h2>
        <ol>
            <li>在控制面板中找到 "直接粘贴 JSON 内容" 文本框</li>
            <li>粘贴上面复制的 JSON</li>
            <li>点击 "解析并添加任务"</li>
            <li>点击 "开始处理"</li>
        </ol>
    </div>
    
    <div class="step">
        <h2>检查结果</h2>
        <p>任务完成后，点击 "📦 打包下载全部" 下载生成的图片</p>
    </div>

    <script>
        function copyJson() {
            const textarea = document.getElementById('json-input');
            textarea.select();
            document.execCommand('copy');
            alert('JSON 已复制到剪贴板');
        }
        
        function openPanel() {
            // 尝试打开扩展页面
            window.open('chrome-extension://' + getExtensionId() + '/api/batch.html', '_blank');
        }
        
        function getExtensionId() {
            // 从 URL 参数获取 ID
            const params = new URLSearchParams(window.location.search);
            return params.get('id') || 'YOUR_EXTENSION_ID';
        }
    </script>
</body>
</html>"""
    
    test_html.write_text(html_content, encoding='utf-8')
    
    # 打开浏览器
    import os
    if os.name == 'nt':
        os.system(f'start {test_html.absolute()}')
    elif os.name == 'posix':
        os.system(f'open {test_html.absolute()}')
    else:
        webbrowser.open(f'file://{test_html.absolute()}')
    
    print(f"✓ 已打开测试页面: {test_html.absolute()}")


def print_manual_steps():
    """打印手动测试步骤"""
    print("""
╔════════════════════════════════════════════════════════╗
║           Jimeng 插件手动测试指南                      ║
╚════════════════════════════════════════════════════════╝

测试 JSON：
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  "metadata": {
    "title": "测试任务"
  },
  "scenes": {
    "test1": {
      "name": "测试图片1",
      "prompt": "A beautiful mountain landscape at sunset, golden hour lighting"
    },
    "test2": {
      "name": "测试图片2", 
      "prompt": "A futuristic cyberpunk city with neon lights, highly detailed"
    }
  }
}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

测试步骤：

1️⃣  打开 Chrome 浏览器
    确保 Jimeng 插件已加载

2️⃣  打开 API 控制面板
    点击工具栏插件图标 → "⚙️ 打开 API 控制面板"

3️⃣  粘贴 JSON
    - 复制上面的测试 JSON
    - 粘贴到 "直接粘贴 JSON 内容" 文本框
    - 点击 "解析并添加任务"

4️⃣  开始生成
    - 点击 "开始处理"
    - 观察任务队列和日志

5️⃣  下载结果
    - 任务完成后点击 "📦 打包下载全部"
    - 选择 "下载为ZIP" 或 "逐个下载"

预期结果：
    ✅ 任务队列显示 2 个任务
    ✅ 日志显示 "提交成功"
    ✅ 大约 30-60 秒后图片生成完成
    ✅ 下载按钮出现，可正常下载

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
""")


def test_storage_access():
    """测试存储访问"""
    print("\n📦 测试存储访问...")
    print("   注：Python 无法直接访问 Chrome 扩展存储")
    print("   请使用上述手动测试方法")


def main():
    print("=" * 60)
    print(" Jimeng 插件测试")
    print("=" * 60)
    
    print("\n选择测试方式：")
    print("1. 查看手动测试指南")
    print("2. 打开测试页面")
    print("3. 退出")
    
    choice = input("\n选择 (1-3): ").strip()
    
    if choice == '1':
        print_manual_steps()
    elif choice == '2':
        open_control_panel()
    else:
        print("退出")


if __name__ == '__main__':
    main()
