import subprocess
import sys

def ssh_exec(cmd):
    result = subprocess.run(
        ["sshpass", "-p", "analog", "ssh", "-o", "StrictHostKeyChecking=no", "analog@34.78.2.175", cmd],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE
    )
    return result.returncode, result.stdout.decode('utf-8', errors='replace'), result.stderr.decode('utf-8', errors='replace')


if __name__ == "__main__":
    cmd = " ".join(sys.argv[1:]) if len(sys.argv) > 1 else 'powershell -NoProfile -Command "Get-Process node, electron-builder -ErrorAction SilentlyContinue | Format-Table Id, ProcessName, CPU, WorkingSet"'
    code, out, err = ssh_exec(cmd)
    print(f"=== EXIT CODE: {code} ===")
    if out:
        print("=== STDOUT ===")
        print(out)
    if err:
        print("=== STDERR ===")
        print(err)
