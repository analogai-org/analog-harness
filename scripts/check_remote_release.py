import paramiko
import os
import sys

def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect("34.78.2.175", username="analog", password="analog", timeout=15)

    sftp = ssh.open_sftp()
    rel_path = "C:/Users/analog/workspace/analog-harness/apps/desktop/release"
    print(f"Checking {rel_path} via SFTP...")
    try:
        entries = sftp.listdir_attr(rel_path)
        print(f"Found {len(entries)} items:")
        for e in sorted(entries, key=lambda x: x.filename):
            size_mb = e.st_size / (1024 * 1024)
            print(f"  - {e.filename:<45} | Size: {e.st_size:>12} bytes ({size_mb:6.2f} MB)")
    except Exception as ex:
        print(f"Error accessing release dir: {ex}")
    finally:
        sftp.close()

    # Also check if any package command is currently running or needed
    stdin, stdout, stderr = ssh.exec_command('powershell -NoProfile -Command "Get-Process electron-builder, node -ErrorAction SilentlyContinue | Select-Object Id, ProcessName, Path"')
    procs = stdout.read().decode('utf-8', errors='ignore')
    if procs.strip():
        print("\nRunning processes related to packaging:")
        print(procs)
    else:
        print("\nNo packaging processes currently running.")

    ssh.close()

if __name__ == "__main__":
    main()
