#!/usr/bin/env python3
"""
Jimeng Native Messaging Python Client

简化与 Chrome Native Messaging 的交互

Usage:
    from jimeng_native import JimengClient
    
    client = JimengClient()
    result = client.batch_generate([
        {"name": "场景1", "prompt": "描述1"},
        {"name": "场景2", "prompt": "描述2"}
    ])
"""

import json
import struct
import subprocess
import sys
import time
import threading
from pathlib import Path
from typing import List, Dict, Callable, Optional


class JimengError(Exception):
    """Jimeng 客户端错误"""
    pass


class JimengClient:
    """
    Jimeng AI Native Messaging 客户端
    
    通过 Chrome Native Messaging 与浏览器插件通信
    """
    
    def __init__(
        self,
        timeout: int = 300,
        on_progress: Optional[Callable] = None,
        on_image_ready: Optional[Callable] = None
    ):
        """
        初始化客户端
        
        Args:
            timeout: 默认超时时间（秒）
            on_progress: 进度回调函数 (task_id, completed, total)
            on_image_ready: 图片生成完成回调 (task_id, prompt_name, image_urls)
        """
        self.timeout = timeout
        self.on_progress = on_progress
        self.on_image_ready = on_image_ready
        self.temp_dir = Path.home() / '.jimeng' / 'native-messaging'
        self.temp_dir.mkdir(parents=True, exist_ok=True)
    
    def _send_message(self, message: dict) -> dict:
        """
        发送消息到 Native Messaging Host
        
        注意：这需要 Native Messaging Host 已注册并运行
        """
        # 使用文件作为 IPC 机制
        # 因为直接启动 Native Host 比较复杂，我们使用文件传递
        
        task_id = message.get('id', f"task_{int(time.time() * 1000)}")
        task_file = self.temp_dir / f"task_{task_id}.json"
        result_file = self.temp_dir / f"result_{task_id}.json"
        
        # 写入任务
        task_data = {
            'id': task_id,
            'status': 'pending',
            'message': message,
            'created_at': time.time()
        }
        
        with open(task_file, 'w', encoding='utf-8') as f:
            json.dump(task_data, f)
        
        print(f"[Jimeng] 任务已提交: {task_id}")
        print(f"[Jimeng] 等待浏览器插件处理...")
        print(f"[Jimeng] 请确保 Chrome 已打开且 Jimeng 插件已加载")
        
        # 等待结果
        return self._wait_for_result(task_id, result_file, task_file)
    
    def _wait_for_result(
        self,
        task_id: str,
        result_file: Path,
        task_file: Path,
        poll_interval: float = 2.0
    ) -> dict:
        """等待任务完成"""
        start_time = time.time()
        last_progress = 0
        
        while time.time() - start_time < self.timeout:
            # 检查结果文件
            if result_file.exists():
                try:
                    with open(result_file, 'r', encoding='utf-8') as f:
                        result = json.load(f)
                    
                    # 清理文件
                    task_file.unlink(missing_ok=True)
                    result_file.unlink(missing_ok=True)
                    
                    return result
                except Exception as e:
                    print(f"[Jimeng] 读取结果出错: {e}")
            
            # 检查任务文件获取进度
            if task_file.exists() and self.on_progress:
                try:
                    with open(task_file, 'r', encoding='utf-8') as f:
                        task = json.load(f)
                    progress = task.get('progress', 0)
                    if progress > last_progress:
                        self.on_progress(task_id, progress, task.get('total', 0))
                        last_progress = progress
                except:
                    pass
            
            time.sleep(poll_interval)
            
            # 显示等待提示
            elapsed = int(time.time() - start_time)
            if elapsed % 10 == 0:
                print(f"[Jimeng] 等待中... {elapsed}s")
        
        # 超时
        raise JimengError(f"任务超时: {task_id}")
    
    def batch_generate(
        self,
        prompts: List[Dict[str, str]],
        model: str = "jimeng-4.5",
        ratio: str = "16:9",
        interval: int = 1,
        wait: bool = True
    ) -> dict:
        """
        批量生成图片
        
        Args:
            prompts: 提示词列表，每个包含 'name' 和 'prompt'
            model: 模型名称
            ratio: 图片比例
            interval: 请求间隔（秒）
            wait: 是否等待完成
        
        Returns:
            任务结果
        """
        if not prompts:
            raise JimengError("提示词列表不能为空")
        
        message = {
            'action': 'batch_generate',
            'id': f"batch_{int(time.time() * 1000)}",
            'payload': {
                'prompts': prompts,
                'model': model,
                'ratio': ratio,
                'interval': interval
            }
        }
        
        if wait:
            return self._send_message(message)
        else:
            # 只提交不等待
            task_id = message['id']
            task_file = self.temp_dir / f"task_{task_id}.json"
            with open(task_file, 'w', encoding='utf-8') as f:
                json.dump({
                    'id': task_id,
                    'status': 'pending',
                    'message': message,
                    'created_at': time.time()
                }, f)
            return {'id': task_id, 'status': 'submitted'}
    
    def generate_single(
        self,
        prompt: str,
        name: str = "single",
        model: str = "jimeng-4.5",
        ratio: str = "16:9"
    ) -> dict:
        """
        生成单张图片
        """
        return self.batch_generate(
            prompts=[{'name': name, 'prompt': prompt}],
            model=model,
            ratio=ratio,
            interval=0
        )
    
    def get_status(self) -> dict:
        """获取所有任务状态"""
        tasks = []
        for task_file in self.temp_dir.glob('task_*.json'):
            try:
                with open(task_file, 'r', encoding='utf-8') as f:
                    task = json.load(f)
                    tasks.append(task)
            except:
                pass
        
        return {
            'pending_tasks': len([t for t in tasks if t.get('status') == 'pending']),
            'total_tasks': len(tasks),
            'tasks': tasks
        }


def batch_generate_from_file(
    json_file: str,
    model: str = "jimeng-4.5",
    ratio: str = "16:9",
    interval: int = 1
) -> dict:
    """
    从 JSON 文件批量生成
    
    JSON 格式:
    {
      "metadata": {...},
      "items": {
        "scene1": {"name": "名称1", "prompt": "描述1"},
        "scene2": {"name": "名称2", "prompt": "描述2"}
      }
    }
    """
    def extract_prompts(obj, prompts=None):
        if prompts is None:
            prompts = []
        if isinstance(obj, dict):
            if 'prompt' in obj and isinstance(obj['prompt'], str):
                prompts.append({
                    'name': obj.get('name', 'unnamed'),
                    'prompt': obj['prompt']
                })
            for v in obj.values():
                extract_prompts(v, prompts)
        elif isinstance(obj, list):
            for item in obj:
                extract_prompts(item, prompts)
        return prompts
    
    with open(json_file, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    prompts = extract_prompts(data)
    
    if not prompts:
        raise JimengError(f"未找到 prompts: {json_file}")
    
    print(f"[Jimeng] 从 {json_file} 提取了 {len(prompts)} 个 prompts")
    
    client = JimengClient()
    return client.batch_generate(
        prompts=prompts,
        model=model,
        ratio=ratio,
        interval=interval
    )


# CLI 入口
if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(description='Jimeng Native Client')
    parser.add_argument('action', choices=['generate', 'batch', 'status'])
    parser.add_argument('input', nargs='?', help='Input file or prompt')
    parser.add_argument('--model', default='jimeng-4.5')
    parser.add_argument('--ratio', default='16:9')
    parser.add_argument('--interval', type=int, default=1)
    parser.add_argument('--name', default='single', help='Single generation name')
    
    args = parser.parse_args()
    
    client = JimengClient()
    
    if args.action == 'generate':
        if not args.input:
            print("错误: 需要提供 prompt")
            sys.exit(1)
        result = client.generate_single(
            prompt=args.input,
            name=args.name,
            model=args.model,
            ratio=args.ratio
        )
        print(json.dumps(result, indent=2, ensure_ascii=False))
        
    elif args.action == 'batch':
        if not args.input:
            print("错误: 需要提供 JSON 文件路径")
            sys.exit(1)
        result = batch_generate_from_file(
            json_file=args.input,
            model=args.model,
            ratio=args.ratio,
            interval=args.interval
        )
        print(json.dumps(result, indent=2, ensure_ascii=False))
        
    elif args.action == 'status':
        status = client.get_status()
        print(json.dumps(status, indent=2, ensure_ascii=False))
