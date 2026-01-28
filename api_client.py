#!/usr/bin/env python3
"""
Jimeng Batch API Client
通过 Chrome Extension Storage API 与插件通信
"""

import json
import sys
import time
import argparse
from pathlib import Path

# Chrome Extension Storage 文件路径
# Windows: %LOCALAPPDATA%\Google\Chrome\User Data\Default\Local Extension Settings\<extension_id>
# macOS: ~/Library/Application Support/Google/Chrome/Default/Local Extension Settings/<extension_id>
# Linux: ~/.config/google-chrome/Default/Local Extension Settings/<extension_id>

def get_chrome_storage_path():
    """获取 Chrome Storage 路径"""
    import platform
    system = platform.system()
    
    if system == "Windows":
        base = Path.home() / "AppData/Local/Google/Chrome/User Data/Default/Local Extension Settings"
    elif system == "Darwin":
        base = Path.home() / "Library/Application Support/Google/Chrome/Default/Local Extension Settings"
    else:
        base = Path.home() / ".config/google-chrome/Default/Local Extension Settings"
    
    return base

def find_extension_id():
    """查找 Jimeng 插件的 Extension ID"""
    storage_path = get_chrome_storage_path()
    if not storage_path.exists():
        return None
    
    # 查找包含 jimeng 相关数据的目录
    for ext_dir in storage_path.iterdir():
        if ext_dir.is_dir():
            # 检查是否包含我们的 key
            for file in ext_dir.iterdir():
                if file.is_file() and file.stat().st_size > 0:
                    try:
                        content = file.read_text(errors='ignore')
                        if 'jimeng' in content.lower():
                            return ext_dir.name
                    except:
                        pass
    return None

def add_task_via_storage(json_file, model='jimeng-4.5', ratio='16:9', interval=1):
    """
    通过直接操作 Chrome Storage 添加任务
    注意：这需要关闭 Chrome 或操作 LevelDB 数据库
    """
    print("方法1: 直接操作 Storage (需要关闭 Chrome)")
    print("=" * 50)
    
    ext_id = find_extension_id()
    if not ext_id:
        print("❌ 未找到 Jimeng 插件，请确保插件已安装")
        return False
    
    print(f"✓ 找到插件 ID: {ext_id}")
    
    # 读取 JSON
    json_path = Path(json_file)
    if not json_path.exists():
        print(f"❌ 文件不存在: {json_file}")
        return False
    
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # 提取 prompts
    def extract_prompts(obj, prompts=None):
        if prompts is None:
            prompts = []
        if isinstance(obj, dict):
            if 'prompt' in obj and isinstance(obj['prompt'], str):
                prompts.append({
                    'name': obj.get('name', 'Unnamed'),
                    'description': obj.get('description', ''),
                    'prompt': obj['prompt']
                })
            for v in obj.values():
                extract_prompts(v, prompts)
        elif isinstance(obj, list):
            for item in obj:
                extract_prompts(item, prompts)
        return prompts
    
    prompts = extract_prompts(data)
    print(f"✓ 提取到 {len(prompts)} 个 prompts")
    
    # 创建任务数据
    task = {
        'id': f'task-{int(time.time() * 1000)}',
        'fileName': json_path.name,
        'name': data.get('metadata', {}).get('title', json_path.name),
        'prompts': prompts,
        'model': model,
        'ratio': ratio,
        'interval': interval,
        'status': 'pending',
        'createdAt': int(time.time() * 1000)
    }
    
    print(f"\n任务信息:")
    print(f"  - ID: {task['id']}")
    print(f"  - 名称: {task['name']}")
    print(f"  - Prompts: {len(prompts)}")
    print(f"  - 模型: {model}")
    print(f"  - 比例: {ratio}")
    
    # 输出到文件，用户需要手动导入
    output_file = Path.home() / '.jimeng_pending_task.json'
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(task, f, ensure_ascii=False, indent=2)
    
    print(f"\n✓ 任务已保存到: {output_file}")
    print("\n请打开 Jimeng 插件的 API 控制面板，拖拽此文件导入")
    return True

def create_import_file(json_file, output_dir=None):
    """
    创建可以直接导入的文件
    """
    print("方法2: 创建导入文件")
    print("=" * 50)
    
    json_path = Path(json_file)
    if not json_path.exists():
        print(f"❌ 文件不存在: {json_file}")
        return False
    
    with open(json_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    # 确定输出目录
    if output_dir:
        output_path = Path(output_dir) / f"jimeng-task-{int(time.time())}.json"
    else:
        output_path = json_path.parent / f"jimeng-task-{int(time.time())}.json"
    
    # 添加任务标记
    task_data = {
        '_jimeng_task': True,
        '_created_at': int(time.time() * 1000),
        'content': data
    }
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(task_data, f, ensure_ascii=False, indent=2)
    
    print(f"✓ 导入文件已创建: {output_path}")
    print(f"\n使用方法:")
    print(f"  1. 打开 Chrome 扩展的 API 控制面板")
    print(f"  2. 将此文件拖拽到页面中")
    print(f"  3. 点击'开始处理'")
    
    return True

def main():
    parser = argparse.ArgumentParser(description='Jimeng Batch API Client')
    parser.add_argument('json_file', help='JSON 文件路径')
    parser.add_argument('--model', default='jimeng-4.5', 
                       choices=['jimeng-4.5', 'jimeng-4.1', 'jimeng-4.0', 'jimeng-3.0'],
                       help='模型选择')
    parser.add_argument('--ratio', default='16:9',
                       choices=['16:9', '9:16', '1:1', '4:3', '3:4'],
                       help='图片比例')
    parser.add_argument('--interval', type=int, default=1,
                       help='请求间隔(秒)')
    parser.add_argument('--output', '-o', help='输出目录')
    
    args = parser.parse_args()
    
    print("Jimeng Batch API Client")
    print("=" * 50)
    print()
    
    # 方法2: 创建导入文件
    create_import_file(args.json_file, args.output)
    
    print()
    print("=" * 50)
    print("提示: 图片将下载到浏览器默认下载目录的 jimeng/ 文件夹中")

if __name__ == '__main__':
    main()
