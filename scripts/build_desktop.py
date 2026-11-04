import subprocess
import sys

def ssh_run():
    cmd = 'powershell -NoProfile -Command "Set-Location C:\\Users\\analog\\workspace\\analog-harness\\apps\\desktop; pnpm run package:win:x64:unsigned"'
    print("Starting desktop packaging on remote VM...")
    p = subprocess.Popen(
        ["sshpass", "-p", "analog", "ssh", "-o", "StrictHostKeyChecking=no", "analog@34.78.2.175", cmd],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True
    )
    for line in p.stdout:
        print(line, end="")
    p.wait()
    print(f"\nProcess exited with code {p.returncode}")

if __name__ == "__main__":
    ssh_run()
