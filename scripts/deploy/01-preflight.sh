#!/usr/bin/env bash
# 01-preflight.sh: Validates local and remote build environments before building.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/env.sh"

release_log "Checking local Apple Silicon Mac environment..."
[[ $(uname -s) == Darwin && $(uname -m) == arm64 ]] || release_fail 'Local build requires an Apple Silicon Mac'
command -v gh >/dev/null || release_fail 'gh CLI required'
command -v pnpm >/dev/null || release_fail 'pnpm required'
command -v "$CHAT_PYTHON" >/dev/null || release_fail "$CHAT_PYTHON required"
"$CHAT_PYTHON" -c 'import sys; assert sys.version_info[:2] == (3, 12), "Python 3.12 required"'
gh api user --jq .login >/dev/null || release_fail 'GitHub CLI not authenticated locally'

release_log "Checking remote Windows host ($WINDOWS_SSH_TARGET)..."
win_check='
if (-not $IsWindows) { exit 1 }
Get-Command gh,git,node,pnpm,py -ErrorAction Stop | Out-Null
gh api user --jq .login | Out-Null
if ($LASTEXITCODE) { exit $LASTEXITCODE }
py -3.12 --version
if ($LASTEXITCODE) { exit $LASTEXITCODE }
Set-ItemProperty -Path HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem -Name LongPathsEnabled -Value 1 -ErrorAction SilentlyContinue
git config --global core.longpaths true
New-Item -ItemType Directory -Path C:\b -Force | Out-Null
Write-Host "Remote Windows host preflight verified."
'
windows_powershell "$win_check" || release_fail 'Remote Windows preflight failed'

release_success "Preflight checks passed for both local Mac and remote Windows."
