#!/usr/bin/env python3
"""
安装 Native Messaging Host

为当前系统注册 Jimeng Native Messaging Host
"""

import json
import os
import platform
import sys
from pathlib import Path


def get_chrome_extension_id():
    """
    获取 Chrome 扩展 ID
    
    用户需要先从 Chrome 扩展页面复制 ID
    """
    print("请从 Chrome 扩展页面获取扩展 ID:")
    print("1. 打开 chrome://extensions/")
    print("2. 找到 Jimeng 插件")
    print("3. 复制 ID（类似 aaaaabbbbbcccc... 的字符串）")
    print()
    
    ext_id = input("请输入扩展 ID: ").strip()
    return ext_id


def install_windows(ext_id):
    """Windows 安装 - 写入注册表"""
    import winreg
    
    # 找到当前目录
    current_dir = Path(__file__).parent.absolute()
    host_path = current_dir / "jimeng_native_host.py"
    
    # 确保使用正确的路径分隔符
    host_path_str = str(host_path).replace('/', '\\')
    
    # 创建 manifest
    manifest = {
        "name": "jimeng_native_host",
        "description": "Jimeng AI Native Messaging Host",
        "path": host_path_str,
        "type": "stdio",
        "allowed_origins": [
            f"chrome-extension://{ext_id}/"
        ]
    }
    
    # 保存 manifest 文件
    manifest_path = current_dir / "jimeng_native_host.json"
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2)
    
    # 写入注册表
    reg_path = r"SOFTWARE\Google\Chrome\NativeMessagingHosts\jimeng_native_host"
    
    try:
        key = winreg.CreateKey(winreg.HKEY_CURRENT_USER, reg_path)
        winreg.SetValue(key, '', winreg.REG_SZ, str(manifest_path))
        winreg.CloseKey(key)
        print(f"✓ 注册表已写入: {reg_path}")
        print(f"✓ Manifest 路径: {manifest_path}")
        return True
    except Exception as e:
        print(f"✗ 注册表写入失败: {e}")
        return False


def install_macos(ext_id):
    """macOS 安装"""
    current_dir = Path(__file__).parent.absolute()
    host_path = current_dir / "jimeng_native_host.py"
    
    manifest = {
        "name": "jimeng_native_host",
        "description": "Jimeng AI Native Messaging Host",
        "path": str(host_path),
        "type": "stdio",
        "allowed_origins": [
            f"chrome-extension://{ext_id}/"
        ]
    }
    
    # Chrome 目录
    manifest_dir = Path.home() / "Library/Application Support/Google/Chrome/NativeMessagingHosts"
    manifest_dir.mkdir(parents=True, exist_ok=True)
    
    manifest_path = manifest_dir / "jimeng_native_host.json"
    with open(manifest_path, 'w') as f:
        json.dump(manifest, f, indent=2)
    
    print(f"✓ Manifest 已安装: {manifest_path}")
    return True


def install_linux(ext_id):
    """Linux 安装"""
    current_dir = Path(__file__).parent.absolute()
    host_path = current_dir / "jimeng_native_host.py"
    
    manifest = {
        "name": "jimeng_native_host",
        "description": "Jimeng AI Native Messaging Host",
        "path": str(host_path),
        "type": "stdio",
        "allowed_origins": [
            f"chrome-extension://{ext_id}/"
        ]
    }
    
    # 尝试多个可能的位置
    possible_dirs = [
        Path.home() / ".config/google-chrome/NativeMessagingHosts",
        Path.home() / ".config/chromium/NativeMessagingHosts",
    ]
    
    installed = False
    for manifest_dir in possible_dirs:
        if manifest_dir.parent.exists():
            manifest_dir.mkdir(parents=True, exist_ok=True)
            manifest_path = manifest_dir / "jimeng_native_host.json"
            with open(manifest_path, 'w') as f:
                json.dump(manifest, f, indent=2)
            print(f"✓ Manifest 已安装: {manifest_path}")
            installed = True
    
    if not installed:
        # 默认安装到第一个位置
        manifest_dir = possible_dirs[0]
        manifest_dir.mkdir(parents=True, exist_ok=True)
        manifest_path = manifest_dir / "jimeng_native_host.json"
        with open(manifest_path, 'w') as f:
            json.dump(manifest, f, indent=2)
        print(f"✓ Manifest 已安装: {manifest_path}")
    
    return True


def main():
    print("=" * 50)
    print("Jimeng Native Messaging Host 安装")
    print("=" * 50)
    print()
    
    # 获取扩展 ID
    ext_id = get_chrome_extension_id()
    
    if not ext_id or len(ext_id) < 20:
        print("✗ 无效的扩展 ID")
        sys.exit(1)
    
    print(f"\n使用扩展 ID: {ext_id}")
    print()
    
    # 根据系统安装
    system = platform.system()
    
    if system == "Windows":
        success = install_windows(ext_id)
    elif system == "Darwin":
        success = install_macos(ext_id)
    else:  # Linux
        success = install_linux(ext_id)
    
    if success:
        print()
        print("=" * 50)
        print("安装完成！")
        print("=" * 50)
        print()
        print("下一步:")
        print("1. 重启 Chrome 浏览器")
        print("2. 确保 Jimeng 插件已启用")
        print("3. 运行测试: python test_native.py")
    else:
        print("\n✗ 安装失败")
        sys.exit(1)


if __name__ == '__main__':
    main()
