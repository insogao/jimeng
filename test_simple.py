#!/usr/bin/env python3
"""
简单测试 - 直接检查插件通信

使用方法:
    python test_simple.py
"""

import json
import sys
import time
from pathlib import Path

# 临时目录用于 IPC
TEMP_DIR = Path.home() / '.jimeng' / 'native-messaging'

def ensure_dir():
    """确保临时目录存在"""
    TEMP_DIR.mkdir(parents=True, exist_ok=True)
    print(f"✓ 临时目录: {TEMP_DIR}")

def create_test_task():
    """创建一个测试任务"""
    task_id = f"test_{int(time.time())}"
    task_file = TEMP_DIR / f"task_{task_id}.json"
    
    task = {
        "id": task_id,
        "status": "pending",
        "payload": {
            "prompts": [
                {"name": "测试风景", "prompt": "A beautiful mountain landscape at sunset, golden hour lighting, 4k quality"}
            ],
            "model": "jimeng-4.5",
            "ratio": "16:9",
            "interval": 1
        },
        "created_at": time.time()
    }
    
    with open(task_file, 'w', encoding='utf-8') as f:
        json.dump(task, f, indent=2)
    
    print(f"✓ 创建任务文件: {task_file.name}")
    print(f"  任务ID: {task_id}")
    print(f"  Prompts: {len(task['payload']['prompts'])}")
    
    return task_id, task_file

def wait_for_result(task_id, timeout=60):
    """等待任务结果"""
    result_file = TEMP_DIR / f"result_{task_id}.json"
    
    print(f"\n⏳ 等待浏览器插件处理...")
    print(f"   (请确保 Chrome 已打开且 Jimeng 插件已加载)")
    print(f"   超时: {timeout}秒")
    print()
    
    start = time.time()
    while time.time() - start < timeout:
        if result_file.exists():
            try:
                with open(result_file, 'r', encoding='utf-8') as f:
                    result = json.load(f)
                
                # 清理文件
                result_file.unlink(missing_ok=True)
                
                print(f"\n✅ 任务完成!")
                print(f"   耗时: {int(time.time() - start)}秒")
                return result
            except Exception as e:
                print(f"   读取结果出错: {e}")
        
        # 显示进度
        elapsed = int(time.time() - start)
        if elapsed % 5 == 0:
            print(f"   等待中... {elapsed}s", end='\r')
        
        time.sleep(1)
    
    print(f"\n❌ 超时! {timeout}秒内未完成")
    return None

def check_browser_status():
    """检查浏览器连接状态"""
    # 简单检查：看是否有任务文件存在
    tasks = list(TEMP_DIR.glob('task_*.json'))
    results = list(TEMP_DIR.glob('result_*.json'))
    
    print(f"\n📊 当前状态:")
    print(f"   待处理任务: {len(tasks)}")
    print(f"   已完成结果: {len(results)}")
    
    if tasks:
        print(f"\n   待处理任务列表:")
        for t in tasks[:5]:
            try:
                with open(t, 'r') as f:
                    data = json.load(f)
                print(f"     - {data.get('id', t.name)}: {data.get('status', 'unknown')}")
            except:
                print(f"     - {t.name}: (无法读取)")

def main():
    print("=" * 60)
    print(" Jimeng 插件测试")
    print("=" * 60)
    
    # 1. 确保目录
    ensure_dir()
    
    # 2. 检查当前状态
    check_browser_status()
    
    # 3. 创建测试任务
    print(f"\n📝 创建测试任务...")
    task_id, task_file = create_test_task()
    
    # 4. 等待结果
    result = wait_for_result(task_id, timeout=120)
    
    # 5. 显示结果
    if result:
        print(f"\n📦 结果详情:")
        print(json.dumps(result, indent=2, ensure_ascii=False))
    else:
        print(f"\n⚠️ 测试未完成")
        print(f"   可能原因:")
        print(f"   1. Chrome 浏览器未打开")
        print(f"   2. Jimeng 插件未加载")
        print(f"   3. 插件版本过旧 (需要包含 Native Messaging 支持)")
        print(f"\n   请检查浏览器插件的控制面板是否有新任务显示")
    
    # 6. 清理
    task_file.unlink(missing_ok=True)
    
    print("\n" + "=" * 60)
    print(" 测试结束")
    print("=" * 60)

if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n⚠️ 用户中断")
        sys.exit(1)
