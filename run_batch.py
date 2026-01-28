#!/usr/bin/env python3
"""
Jimeng 批量生成 - 一键运行脚本

自动启动 ws_bridge，发送任务，完成后关闭

Usage:
    python run_batch.py prompts.json --model jimeng-4.5 --ratio 16:9
    python run_batch.py prompts.json --wait  # 等待所有图片生成完成
"""

import argparse
import json
import subprocess
import sys
import time
import signal
import os
from pathlib import Path
from datetime import datetime

# API 端点
API_URL = "http://localhost:8787"


def start_bridge():
    """启动 WebSocket 桥接服务"""
    print(f"[{datetime.now()}] 启动 WebSocket 桥接服务...")
    
    # 使用 Popen 启动服务
    process = subprocess.Popen(
        [sys.executable, "ws_bridge.py"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        cwd=Path(__file__).parent,
        creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == 'nt' else 0
    )
    
    # 循环检查服务是否就绪（最多等待 10 秒）
    import urllib.request
    import urllib.error
    
    print(f"[{datetime.now()}] 等待服务就绪...")
    for i in range(20):  # 20 * 0.5 = 10 秒
        time.sleep(0.5)
        try:
            urllib.request.urlopen(f"{API_URL}/health", timeout=2)
            print(f"[{datetime.now()}] ✓ 服务已启动 (PID: {process.pid})")
            return process
        except urllib.error.URLError:
            continue  # 服务还没准备好
        except Exception as e:
            print(f"[{datetime.now()}] 检查出错: {e}")
            continue
    
    print(f"[{datetime.now()}] ✗ 服务启动超时")
    process.terminate()
    return None


def stop_bridge(process):
    """关闭 WebSocket 桥接服务"""
    if process:
        print(f"[{datetime.now()}] 关闭服务...")
        try:
            if os.name == 'nt':
                process.terminate()
            else:
                process.send_signal(signal.SIGTERM)
            process.wait(timeout=5)
            print(f"[{datetime.now()}] ✓ 服务已关闭")
        except:
            process.kill()
            print(f"[{datetime.now()}] ! 强制关闭服务")


def check_service():
    """检查服务是否运行"""
    import urllib.request
    try:
        urllib.request.urlopen(f"{API_URL}/health", timeout=2)
        return True
    except:
        return False


def extract_prompts(json_file):
    """从 JSON 文件提取 prompts"""
    with open(json_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    def _extract(obj, prompts=None):
        if prompts is None:
            prompts = []
        if isinstance(obj, dict):
            if 'prompt' in obj and isinstance(obj['prompt'], str):
                prompts.append({
                    'name': obj.get('name', 'unnamed'),
                    'prompt': obj['prompt']
                })
            for v in obj.values():
                _extract(v, prompts)
        elif isinstance(obj, list):
            for item in obj:
                _extract(item, prompts)
        return prompts
    
    return _extract(data)


def submit_task(prompts, model, ratio, interval, retries=3):
    """提交批量生成任务（带重试）"""
    import urllib.request
    import urllib.error
    
    payload = {
        'jsonFile': 'batch_task',
        'model': model,
        'ratio': ratio,
        'interval': interval,
        'prompts': prompts
    }
    
    data = json.dumps(payload).encode('utf-8')
    
    for i in range(retries):
        req = urllib.request.Request(
            f"{API_URL}/api/batch",
            data=data,
            headers={'Content-Type': 'application/json'},
            method='POST'
        )
        
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                result = json.loads(resp.read().decode())
                return result
        except urllib.error.URLError as e:
            if i < retries - 1:
                print(f"  提交失败，重试 ({i+1}/{retries})...")
                time.sleep(1)
                continue
            return {'error': f'Connection failed: {e}'}
        except urllib.error.HTTPError as e:
            return {'error': f'HTTP {e.code}: {e.reason}'}
        except Exception as e:
            return {'error': str(e)}
    
    return {'error': 'Max retries exceeded'}


def wait_for_completion(timeout=300):
    """等待所有任务完成"""
    import urllib.request
    
    print(f"[{datetime.now()}] 等待任务完成...")
    start = time.time()
    last_pending = -1
    
    while time.time() - start < timeout:
        try:
            with urllib.request.urlopen(f"{API_URL}/api/status", timeout=5) as resp:
                status = json.loads(resp.read().decode())
            
            pending = len(status.get('pending', []))
            completed = len(status.get('completed', []))
            
            if pending != last_pending:
                print(f"[{datetime.now()}] 待处理: {pending}, 已完成: {completed}")
                last_pending = pending
            
            if pending == 0:
                print(f"[{datetime.now()}] ✓ 所有任务完成!")
                return True
            
        except Exception as e:
            print(f"[{datetime.now()}] 检查状态出错: {e}")
        
        time.sleep(3)
    
    print(f"[{datetime.now()}] ! 等待超时")
    return False


def get_results():
    """获取所有结果"""
    import urllib.request
    
    try:
        with urllib.request.urlopen(f"{API_URL}/api/results", timeout=5) as resp:
            return json.loads(resp.read().decode())
    except:
        return []


def main():
    parser = argparse.ArgumentParser(description='Jimeng 批量生成一键运行')
    parser.add_argument('json_file', help='JSON 文件路径')
    parser.add_argument('--model', default='jimeng-4.5', 
                       choices=['jimeng-4.5', 'jimeng-4.1', 'jimeng-4.0', 'jimeng-3.0'],
                       help='模型选择')
    parser.add_argument('--ratio', default='16:9',
                       choices=['16:9', '9:16', '1:1', '4:3', '3:4'],
                       help='图片比例')
    parser.add_argument('--interval', type=int, default=1,
                       help='请求间隔(秒)')
    parser.add_argument('--wait', action='store_true',
                       help='等待所有任务完成')
    parser.add_argument('--timeout', type=int, default=300,
                       help='超时时间(秒)')
    
    args = parser.parse_args()
    
    # 检查 JSON 文件
    json_path = Path(args.json_file)
    if not json_path.exists():
        print(f"✗ 文件不存在: {args.json_file}")
        sys.exit(1)
    
    # 提取 prompts
    prompts = extract_prompts(args.json_file)
    if not prompts:
        print(f"✗ 未找到 prompts: {args.json_file}")
        sys.exit(1)
    
    print(f"=" * 60)
    print(f"Jimeng 批量生成")
    print(f"=" * 60)
    print(f"文件: {args.json_file}")
    print(f"Prompts: {len(prompts)}")
    print(f"模型: {args.model}")
    print(f"比例: {args.ratio}")
    print(f"间隔: {args.interval}秒")
    print(f"=" * 60)
    
    # 检查服务是否已运行
    bridge_process = None
    own_bridge = False
    
    if check_service():
        print(f"[{datetime.now()}] 使用已运行的服务")
    else:
        bridge_process = start_bridge()
        if not bridge_process:
            print(f"✗ 无法启动服务")
            sys.exit(1)
        own_bridge = True
    
    try:
        # 提交任务
        print(f"\n[{datetime.now()}] 提交任务...")
        result = submit_task(prompts, args.model, args.ratio, args.interval)
        
        if 'error' in result:
            print(f"✗ 提交失败: {result['error']}")
            sys.exit(1)
        
        print(f"✓ 任务已提交")
        print(f"  Batch ID: {result.get('batch_id', 'N/A')}")
        print(f"  Prompts: {result.get('count', len(prompts))}")
        
        # 等待完成
        if args.wait:
            success = wait_for_completion(args.timeout)
            
            if success:
                # 获取结果
                results = get_results()
                print(f"\n[{datetime.now()}] 生成结果:")
                for r in results[-5:]:  # 显示最近5个
                    status = "✓" if r.get('success') else "✗"
                    print(f"  {status} {r.get('promptName', 'Unknown')}")
        else:
            print(f"\n[{datetime.now()}] 任务已在后台运行")
            print(f"  请打开浏览器插件查看进度")
            print(f"  控制面板: chrome-extension://<id>/api/batch.html")
        
    finally:
        # 关闭服务（如果是自己启动的）
        if own_bridge:
            stop_bridge(bridge_process)
    
    print(f"\n[{datetime.now()}] 完成")


if __name__ == '__main__':
    main()
