import paramiko
import os
import sys

output_file = "/tmp/release_check.txt"

with open(output_file, "w") as out:
    try:
        ssh = paramiko.SSHClient()
        ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        ssh.connect("34.78.2.175", username="analog", password="analog", timeout=15)

        sftp = ssh.open_sftp()
        rel_path = "C:/Users/analog/workspace/analog-harness/apps/desktop/release"
        out.write(f"=== Checking {rel_path} ===\n")
        
        entries = sftp.listdir_attr(rel_path)
        out.write(f"Total entries: {len(entries)}\n\n")
        for e in sorted(entries, key=lambda x: x.filename):
            size_mb = e.st_size / (1024 * 1024)
            out.write(f"{e.filename:<45} | Size: {e.st_size:>12} bytes ({size_mb:6.2f} MB)\n")
        sftp.close()

        out.write("\n=== Checking running node / electron-builder processes ===\n")
        stdin, stdout, stderr = ssh.exec_command('powershell -NoProfile -Command "Get-Process electron-builder, node -ErrorAction SilentlyContinue | Format-Table -AutoSize Id, ProcessName, WorkingSet64"')
        p_out = stdout.read().decode('utf-8', errors='ignore')
        out.write(p_out if p_out.strip() else "None\n")

        # Let's also check package.json version
        stdin, stdout, stderr = ssh.exec_command('powershell -NoProfile -Command "Get-Content C:\\Users\\analog\\workspace\\analog-harness\\apps\\desktop\\package.json | ConvertFrom-Json | Select-Object name, version | Format-List"')
        pkg_out = stdout.read().decode('utf-8', errors='ignore')
        out.write("\n=== package.json version ===\n" + pkg_out)

        ssh.close()
    except Exception as ex:
        out.write(f"Error: {ex}\n")

print("Done writing to", output_file)
