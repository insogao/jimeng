#!/usr/bin/env python3
"""
Jimeng WebSocket Bridge - API Server

提供 HTTP/WebSocket 接口，让外部程序可以控制浏览器插件。
浏览器插件需要保持打开并连接到本服务器。

Usage:
    python ws_bridge.py
    
Then open the browser extension panel to connect.
"""

import asyncio
import json
import websockets
import http.server
import socketserver
import threading
from datetime import datetime
from pathlib import Path

# Store connected clients (browser extensions)
clients = set()

# Store pending tasks and results
tasks = {}
results = {}

# WebSocket Server
async def handle_client(websocket, path):
    """Handle browser extension connection"""
    print(f"[{datetime.now()}] Browser connected: {websocket.remote_address}")
    clients.add(websocket)
    
    try:
        async for message in websocket:
            try:
                data = json.loads(message)
                await process_message(websocket, data)
            except json.JSONDecodeError:
                await send_error(websocket, "Invalid JSON")
    except websockets.exceptions.ConnectionClosed:
        print(f"[{datetime.now()}] Browser disconnected")
    finally:
        clients.discard(websocket)

async def process_message(websocket, data):
    """Process messages from browser extension"""
    msg_type = data.get('type')
    
    if msg_type == 'pong':
        # Keep-alive response
        pass
    elif msg_type == 'task_result':
        # Task completed
        task_id = data.get('task_id')
        results[task_id] = data.get('result')
        print(f"[{datetime.now()}] Task completed: {task_id}")
    elif msg_type == 'log':
        # Log from extension
        print(f"[EXT] {data.get('message')}")
    elif msg_type == 'error':
        # Error from extension
        print(f"[EXT ERROR] {data.get('error')}")
    else:
        await send_error(websocket, f"Unknown message type: {msg_type}")

async def send_error(websocket, error):
    """Send error to client"""
    await websocket.send(json.dumps({'type': 'error', 'error': error}))

# HTTP API Server
class APIHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        """Custom log format"""
        print(f"[{datetime.now()}] {self.address_string()} - {format % args}")
    
    def do_GET(self):
        """Handle GET requests"""
        if self.path == '/health':
            self.send_json({'status': 'ok', 'clients': len(clients)})
        elif self.path == '/tasks':
            self.send_json({'tasks': tasks, 'results': results})
        else:
            self.send_error(404, "Not found")
    
    def do_POST(self):
        """Handle POST requests"""
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length).decode('utf-8')
        
        try:
            data = json.loads(body) if body else {}
        except json.JSONDecodeError:
            self.send_error(400, "Invalid JSON")
            return
        
        if self.path == '/api/generate':
            # Single image generation
            asyncio.run_coroutine_threadsafe(
                self.handle_generate(data), 
                loop
            )
            self.send_json({'status': 'queued', 'task_id': data.get('task_id')})
            
        elif self.path == '/api/batch':
            # Batch generation from JSON
            asyncio.run_coroutine_threadsafe(
                self.handle_batch(data),
                loop
            )
            self.send_json({'status': 'queued', 'batch_id': data.get('batch_id')})
            
        else:
            self.send_error(404, "Not found")
    
    async def handle_generate(self, data):
        """Forward single generation to browser"""
        if not clients:
            print("[ERROR] No browser connected")
            return
        
        client = clients.pop()  # Get first client
        clients.add(client)
        
        await client.send(json.dumps({
            'type': 'generate',
            'task_id': data.get('task_id'),
            'prompt': data.get('prompt'),
            'model': data.get('model', 'jimeng-4.5'),
            'ratio': data.get('ratio', '16:9')
        }))
    
    async def handle_batch(self, data):
        """Forward batch generation to browser"""
        if not clients:
            print("[ERROR] No browser connected")
            return
        
        client = clients.pop()
        clients.add(client)
        
        await client.send(json.dumps({
            'type': 'batch',
            'batch_id': data.get('batch_id'),
            'prompts': data.get('prompts'),
            'model': data.get('model', 'jimeng-4.5'),
            'ratio': data.get('ratio', '16:9'),
            'interval': data.get('interval', 1)
        }))
    
    def send_json(self, data):
        """Send JSON response"""
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
    
    def send_error(self, code, message):
        """Send error response"""
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps({'error': message}).encode())

def start_http_server(port=8787):
    """Start HTTP API server"""
    with socketserver.TCPServer(("", port), APIHandler) as httpd:
        print(f"[{datetime.now()}] HTTP API Server started on http://localhost:{port}")
        print(f"[{datetime.now()}] Endpoints:")
        print(f"  - GET  /health     - Check server status")
        print(f"  - GET  /tasks      - List all tasks")
        print(f"  - POST /api/generate - Generate single image")
        print(f"  - POST /api/batch  - Generate batch images")
        httpd.serve_forever()

async def start_websocket_server(port=8765):
    """Start WebSocket server for browser connection"""
    print(f"[{datetime.now()}] WebSocket Server started on ws://localhost:{port}")
    print(f"[{datetime.now()}] Waiting for browser extension to connect...")
    async with websockets.serve(handle_client, "localhost", port):
        await asyncio.Future()  # Run forever

async def keep_alive():
    """Send ping to keep connections alive"""
    while True:
        await asyncio.sleep(30)
        if clients:
            dead_clients = []
            for client in clients:
                try:
                    await client.send(json.dumps({'type': 'ping'}))
                except:
                    dead_clients.append(client)
            
            for client in dead_clients:
                clients.discard(client)

async def main():
    """Start both servers"""
    # Start HTTP server in background thread
    http_thread = threading.Thread(target=start_http_server, args=(8787,))
    http_thread.daemon = True
    http_thread.start()
    
    # Start WebSocket server
    await asyncio.gather(
        start_websocket_server(8765),
        keep_alive()
    )

if __name__ == '__main__':
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print(f"\n[{datetime.now()}] Server stopped")
