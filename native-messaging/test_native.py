#!/usr/bin/env python3
"""
Jimeng Native Messaging 测试脚本

使用文件 IPC 机制测试与浏览器插件的通信
"""

import json
import sys
import time
from pathlib import Path
from jimeng_native import JimengClient, batch_generate_from_file


def test_single_generate():
    """测试单张生成"""
    print("=" * 50)
    print("测试 1: 单张图片生成")
    print("=" * 50)
    
    client = JimengClient(timeout=60)
    
    try:
        result = client.generate_single(
            prompt="A beautiful sunset over mountains, cinematic lighting, 8k quality",
            name="山景日落",
            model="jimeng-4.5",
            ratio="16:9"
        )
        
        print("\n✓ 生成完成!")
        print(f"结果: {json.dumps(result, indent=2, ensure_ascii=False)}")
        
    except Exception as e:
        print(f"\n✗ 错误: {e}")


def test_batch_generate():
    """测试批量生成"""
    print("\n" + "=" * 50)
    print("测试 2: 批量图片生成")
    print("=" * 50)
    
    client = JimengClient(timeout=300)
    
    prompts = [
        {"name": "科幻城市", "prompt": "A futuristic cyberpunk city at night with neon lights and flying cars, highly detailed, 8k"},
        {"name": "森林小径", "prompt": "A peaceful forest path with sunlight filtering through trees, fantasy art style"},
        {"name": "海洋日落", "prompt": "Ocean sunset with dramatic clouds and calm water, cinematic composition"}
    ]
    
    print(f"\n将生成 {len(prompts)} 张图片:")
    for p in prompts:
        print(f"  - {p['name']}")
    
    try:
        result = client.batch_generate(
            prompts=prompts,
            model="jimeng-4.5",
            ratio="16:9",
            interval=1
        )
        
        print("\n✓ 批量生成完成!")
        print(f"结果: {json.dumps(result, indent=2, ensure_ascii=False)}")
        
    except Exception as e:
        print(f"\n✗ 错误: {e}")


def test_status():
    """测试状态查询"""
    print("\n" + "=" * 50)
    print("测试 3: 查询任务状态")
    print("=" * 50)
    
    client = JimengClient()
    status = client.get_status()
    
    print(f"\n当前任务状态:")
    print(f"  待处理任务: {status['pending_tasks']}")
    print(f"  总任务数: {status['total_tasks']}")
    
    if status['tasks']:
        print(f"\n任务详情:")
        for task in status['tasks']:
            print(f"  - {task['id']}: {task['status']}")


def create_sample_json():
    """创建示例 JSON 文件"""
    sample = {
        "metadata": {
            "title": "测试任务",
            "description": "Native Messaging 测试"
        },
        "scenes": {
            "space": {
                "name": "太空站",
                "prompt": "A massive space station orbiting Earth, solar panels gleaming, ultra detailed, sci-fi concept art"
            },
            "nature": {
                "name": "极光",
                "prompt": "Northern lights over snowy mountains, green and purple aurora, long exposure photography"
            }
        }
    }
    
    sample_file = Path("test_prompts.json")
    with open(sample_file, 'w', encoding='utf-8') as f:
        json.dump(sample, f, indent=2, ensure_ascii=False)
    
    return sample_file


def test_file_batch():
    """测试从文件批量生成"""
    print("\n" + "=" * 50)
    print("测试 4: 从 JSON 文件批量生成")
    print("=" * 50)
    
    # 创建示例文件
    sample_file = create_sample_json()
    print(f"\n创建示例文件: {sample_file}")
    
    try:
        result = batch_generate_from_file(
            json_file=str(sample_file),
            model="jimeng-4.5",
            ratio="16:9",
            interval=1
        )
        
        print("\n✓ 批量生成完成!")
        print(f"结果: {json.dumps(result, indent=2, ensure_ascii=False)}")
        
    except Exception as e:
        print(f"\n✗ 错误: {e}")


def main():
    print("""
╔══════════════════════════════════════════════════╗
║  Jimeng Native Messaging 测试脚本                 ║
╚══════════════════════════════════════════════════╝

使用说明:
1. 确保已运行: python install_host.py
2. 确保 Chrome 已打开且 Jimeng 插件已加载
3. 插件会自动检测并处理任务
""")
    
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument('--test', choices=['1', '2', '3', '4', 'all'], default='all')
    args = parser.parse_args()
    
    if args.test == '1':
        test_single_generate()
    elif args.test == '2':
        test_batch_generate()
    elif args.test == '3':
        test_status()
    elif args.test == '4':
        test_file_batch()
    else:
        # 运行所有测试
        test_single_generate()
        test_batch_generate()
        test_status()
        test_file_batch()
    
    print("\n" + "=" * 50)
    print("测试完成")
    print("=" * 50)


if __name__ == '__main__':
    main()
