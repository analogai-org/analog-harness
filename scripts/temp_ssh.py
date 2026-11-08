"""Run a diagnostic command on the configured Windows VM over SSH."""

import os
import subprocess
import sys


def main() -> None:
    target = os.environ.get("WINDOWS_SSH_TARGET")
    if not target:
        raise SystemExit("Set WINDOWS_SSH_TARGET to user@windows-vm.")
    command = sys.argv[1:] or [
        "powershell",
        "-NoProfile",
        "-Command",
        "Get-Process node, electron-builder -ErrorAction SilentlyContinue | Format-Table Id, ProcessName, CPU, WorkingSet",
    ]
    result = subprocess.run(["ssh", target, *command], check=False)
    raise SystemExit(result.returncode)


if __name__ == "__main__":
    main()
