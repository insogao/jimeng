#!/usr/bin/env python3
"""
Jimeng Native Messaging Host

Chrome Native Messaging 协议实现：
- 从 stdin 读取消息（4字节长度前缀 + JSON）
- 向 stdout 发送消息（4字节长度前缀 + JSON）

使用方式：由 Chrome 自动启动，不要直接运行
"""

import sys
import json
import struct
import threading
import time
from pathlib import Path

# Buffer size for reading
BUFFER_SIZE = 4096


def read_message():
    """
    从 stdin 读取一条 Native Messaging 消息
    
    格式: 4字节长度(小端序uint32) + JSON数据
    """
    # 读取 4 字节长度
    raw_length = sys.stdin.buffer.read(4)
    if not raw_length:
        return None
    
    message_length = struct.unpack('I', raw_length)[0]
    
    # 读取 JSON 数据
    message_data = sys.stdin.buffer.read(message_length).decode('utf-8')
    return json.loads(message_data)


def send_message(message):
    """
    向 stdout 发送一条 Native Messaging 消息
    
    格式: 4字节长度(小端序uint32) + JSON数据
    """
    message_json = json.dumps(message)
    message_bytes = message_json.encode('utf-8')
    message_length = len(message_bytes)
    
    # 发送 4 字节长度 + JSON 数据
    sys.stdout.buffer.write(struct.pack('I', message_length))
    sys.stdout.buffer.write(message_bytes)
    sys.stdout.buffer.flush()


def handle_batch_generate(request_id, payload):
    """
    处理批量生成请求
    
    将请求写入文件，让浏览器插件读取并处理
    """
    # 获取临时目录
    temp_dir = Path.home() / '.jimeng' / 'native-messaging'
    temp_dir.mkdir(parents=True, exist_ok=True)
    
    # 创建任务文件
    task_file = temp_dir / f"task_{request_id}.json"
    result_file = temp_dir / f"result_{request_id}.json"
    
    task_data = {
        'id': request_id,
        'status': 'pending',
        'payload': payload,
        'created_at': time.time()
    }
    
    with open(task_file, 'w', encoding='utf-8') as f:
        json.dump(task_data, f)
    
    # 等待结果（轮询）
    max_wait = 300  # 5分钟超时
    waited = 0
    
    while waited < max_wait:
        if result_file.exists():
            try:
                with open(result_file, 'r', encoding='utf-8') as f:
                    result = json.load(f)
                
                # 清理文件
                result_file.unlink()
                task_file.unlink()
                
                return {
                    'id': request_id,
                    'status': 'completed',
                    'result': result
                }
            except:
                pass
        
        time.sleep(1)
        waited += 1
        
        # 发送进度更新
        if waited % 10 == 0:
            send_message({
                'id': request_id,
                'status': 'processing',
                'message': f'Waiting for browser... {waited}s'
            })
    
    # 超时
    return {
        'id': request_id,
        'status': 'timeout',
        'error': 'Browser did not respond in time'
    }


def handle_get_status():
    """获取当前状态"""
    temp_dir = Path.home() / '.jimeng' / 'native-messaging'
    
    if not temp_dir.exists():
        return {'tasks': [], 'message': 'No tasks directory'}
    
    tasks = []
    for task_file in temp_dir.glob('task_*.json'):
        try:
            with open(task_file, 'r', encoding='utf-8') as f:
                task = json.load(f)
                tasks.append(task)
        except:
            pass
    
    return {
        'status': 'ok',
        'tasks': tasks,
        'task_count': len(tasks)
    }


def main():
    """
    主循环 - 处理来自 Chrome 的消息
    
    注意：此程序由 Chrome 自动启动，不要在命令行直接运行
    """
    try:
        while True:
            # 读取消息
            message = read_message()
            if message is None:
                break
            
            # 处理消息
            action = message.get('action')
            request_id = message.get('id', f'req_{int(time.time()*1000)}')
            
            if action == 'batch_generate':
                payload = message.get('payload', {})
                response = handle_batch_generate(request_id, payload)
                send_message(response)
                
            elif action == 'get_status':
                response = handle_get_status()
                send_message(response)
                
            elif action == 'ping':
                send_message({'status': 'pong', 'id': request_id})
                
            else:
                send_message({
                    'id': request_id,
                    'status': 'error',
                    'error': f'Unknown action: {action}'
                })
                
    except Exception as e:
        # 发送错误信息
        send_message({
            'status': 'error',
            'error': str(e)
        })
        sys.exit(1)


if __name__ == '__main__':
    main()
