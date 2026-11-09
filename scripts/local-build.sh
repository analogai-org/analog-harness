#!/usr/bin/env bash
# Build Chat and Desktop on macOS and a Windows VM, publishing only after both uploads succeed.
# Windows work is embedded PowerShell; only these two release entry scripts are needed.
set -Eeuo pipefail
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/github-build.sh"

if [[ ${1:-} == --help ]]; then
  printf 'Usage: bash scripts/local-build.sh [patch|minor|major|VERSION]\nUses the windows-builder SSH alias by default; WINDOWS_SSH_TARGET overrides it.\nRequires Apple Silicon and authenticated gh on both hosts.\nSee scripts/release/README.md for prerequisites.\n'
  exit 0
fi
[[ $# -le 1 ]] || release_fail 'Expected at most one version argument'
[[ $(uname -s) == Darwin && $(uname -m) == arm64 ]] || release_fail 'Local release requires an Apple Silicon Mac'
WINDOWS_SSH_TARGET=${WINDOWS_SSH_TARGET:-windows-builder}
[[ $WINDOWS_SSH_TARGET != -* ]] || release_fail 'WINDOWS_SSH_TARGET cannot start with a dash'
command -v ssh >/dev/null
windows_bootstrap=$(node -e 'console.log(Buffer.from(process.argv[1], "utf16le").toString("base64"))' '$encoded = [Console]::In.ReadToEnd(); & ([ScriptBlock]::Create([Text.Encoding]::Unicode.GetString([Convert]::FromBase64String($encoded))))')
windows_powershell() {
  printf '%s' "$1" | ssh "$WINDOWS_SSH_TARGET" "pwsh -NoProfile -NonInteractive -EncodedCommand $windows_bootstrap"
}
CHAT_PYTHON=${CHAT_PYTHON:-python3.12}
"$CHAT_PYTHON" -c 'import sys; assert sys.version_info[:2] == (3, 12), "Python 3.12 required"'
release_init

# All dependency sources are pinned before either host starts building.
source_repos=("$RELEASE_ROOT" "$CHAT_ROOT")
source_names=(analog-harness chat)
github_repos=("$HARNESS_REPO" "$CHAT_REPO")
for name in foundation deepthink deepact; do
  repo=$(cd "$RELEASE_ROOT/../$name" && pwd -P)
  [[ -z $(git -C "$repo" status --porcelain) ]] || release_fail "Dependency checkout is dirty: $repo"
  source_repos+=("$repo")
  source_names+=("$name")
  github_repos+=("$(gh repo view "$(git -C "$repo" remote get-url origin)" --json nameWithOwner --jq .nameWithOwner)")
  git -C "$repo" fetch origin
  remote_branches=$(git -C "$repo" branch -r --contains HEAD)
  [[ $remote_branches == *origin/* ]] || release_fail "Push dependency commit first: $repo"
done
windows_preflight=$(node -e 'console.log(Buffer.from(process.argv[1], "utf16le").toString("base64"))' 'if (-not $IsWindows) { exit 1 }; Get-Command gh,git,node,pnpm,py; if (-not $?) { exit 1 }; gh auth status; if ($LASTEXITCODE) { exit $LASTEXITCODE }; py -3.12 --version; if ($LASTEXITCODE) { exit $LASTEXITCODE }')
windows_powershell "$windows_preflight"
release_prepare "${1:-patch}" local-v
release_push "$CHAT_ROOT"
release_push "$RELEASE_ROOT"

build_root=$(mktemp -d "${TMPDIR:-/tmp}/analog-release.XXXXXXXX")
printf 'Temporary build directory: %s\n' "$build_root"
cleanup() {
  local status=$?
  trap - EXIT
  if [[ -d "$build_root" && ! -L "$build_root" && ${build_root##*/} == analog-release.* ]]; then
    rm -rf -- "$build_root" || status=1
  else
    printf 'Cleanup refused unexpected directory: %s\n' "$build_root" >&2
    status=1
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
mkdir "$build_root/tmp" "$build_root/artifacts"
export TMPDIR="$build_root/tmp" TMP="$build_root/tmp" TEMP="$build_root/tmp"
export POETRY_VIRTUALENVS_CREATE=false APP_VERSION="$RELEASE_VERSION"
export DSH_DESKTOP_APP_ID=ai.analog.desktop CSC_IDENTITY_AUTO_DISCOVERY=false
export DSH_DESKTOP_TARGET_PLATFORM=darwin DSH_DESKTOP_TARGET_ARCH=arm64

remote_args=()
for ((i=0; i<${#source_repos[@]}; i++)); do
  commit=$(git -C "${source_repos[i]}" rev-parse HEAD)
  git clone --no-checkout "${source_repos[i]}" "$build_root/${source_names[i]}"
  git -C "$build_root/${source_names[i]}" checkout --detach "$commit"
  remote_args+=("${source_names[i]}" "${github_repos[i]}" "$commit")
done

# Fresh draft releases never overwrite artifacts from a previous attempt.
for repo in "$CHAT_REPO" "$HARNESS_REPO"; do
  gh release create "$RELEASE_TAG" --repo "$repo" --verify-tag --draft --title "Analog $RELEASE_VERSION" --generate-notes
done
"$CHAT_PYTHON" -m venv "$build_root/chat/.venv"
export VIRTUAL_ENV="$build_root/chat/.venv"
export PATH="$VIRTUAL_ENV/bin:$PATH"
python -m pip install poetry Cython pyinstaller
(
  cd "$build_root/chat"
  python -m poetry install --no-root --no-interaction
  python build_cython_binary.py
  test -f dist/analog-chat-service/analog-chat-service
  tar -czf "$build_root/artifacts/analog-chat-service-mac-arm64.tar.gz" -C dist analog-chat-service
)
gh release upload "$RELEASE_TAG" "$build_root/artifacts/analog-chat-service-mac-arm64.tar.gz" --repo "$CHAT_REPO"
rm -rf "$build_root/chat/.venv" "$build_root/chat/build" "$build_root/chat/cython_staging" "$build_root/artifacts"
export RELEASE_TAG="$RELEASE_TAG"
(
  cd "$build_root/analog-harness"
  pnpm install --frozen-lockfile
  pnpm run build:official
  pnpm --dir apps/desktop run prepare:analog
  pnpm --dir apps/desktop exec electron-builder --config analog-builder.config.mjs --mac --arm64 --publish never
)
rm -rf "$build_root/chat"
mac_output="$build_root/analog-harness/apps/desktop/release-builds"
node "$build_root/analog-harness/apps/desktop/scripts/smoke-chat-backend.mjs" "$mac_output/mac-arm64/Analog.app/Contents/Resources/analog-chat-service/analog-chat-service"
mac_files=("$mac_output/Analog-$RELEASE_VERSION-mac-arm64.dmg" "$mac_output/Analog-$RELEASE_VERSION-mac-arm64.zip")
for file in "${mac_files[@]}"; do [[ -s "$file" ]] || release_fail "Missing artifact: $file"; done
gh release upload "$RELEASE_TAG" "${mac_files[@]}" --repo "$HARNESS_REPO"

# Base64 on stdin avoids Windows command-line length limits and shell interpolation.
remote_payload=$(node -e 'console.log(Buffer.from(JSON.stringify(process.argv.slice(1))).toString("base64"))' "$RELEASE_VERSION" "$RELEASE_TAG" "$HARNESS_REPO" "$CHAT_REPO" "${remote_args[@]}")
remote_command=$(node -e 'let s=""; process.stdin.on("data",c=>s+=c); process.stdin.on("end",()=>console.log(Buffer.from("$payload = \""+process.argv[1]+"\"\n"+s,"utf16le").toString("base64")))' "$remote_payload" <<'POWERSHELL'
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$argsList = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($payload)) | ConvertFrom-Json
$version, $tag, $harnessRepo, $chatRepo = $argsList[0..3]
$work = Join-Path ([IO.Path]::GetTempPath()) ('analog-release-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $work | Out-Null
Write-Host "Temporary build directory: $work"
$exitStatus = 0
try {
    if (-not $IsWindows -or [Runtime.InteropServices.RuntimeInformation]::OSArchitecture -ne 'X64') { throw 'Windows x64 required' }
    $env:TMP = $env:TEMP = Join-Path $work 'tmp'
    New-Item -ItemType Directory -Path $env:TEMP | Out-Null
    $env:PIP_CACHE_DIR = Join-Path $work 'cache/pip'
    $env:POETRY_CACHE_DIR = Join-Path $work 'cache/poetry'
    $env:ELECTRON_CACHE = Join-Path $work 'cache/electron'
    $env:ELECTRON_BUILDER_CACHE = Join-Path $work 'cache/builder'
    $env:npm_config_cache = Join-Path $work 'cache/npm'
    $env:npm_config_devdir = Join-Path $work 'cache/node-gyp'
    $env:PYINSTALLER_CONFIG_DIR = Join-Path $work 'cache/pyinstaller'
    $env:POETRY_VIRTUALENVS_CREATE = 'false'
    $env:APP_VERSION = $version
    $env:DSH_DESKTOP_APP_ID = 'ai.analog.desktop'
    $env:DSH_DESKTOP_TARGET_PLATFORM = 'win32'
    $env:DSH_DESKTOP_TARGET_ARCH = 'x64'
    $env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
    for ($i = 4; $i -lt $argsList.Count; $i += 3) {
        $destination = Join-Path $work $argsList[$i]
        gh repo clone $argsList[$i + 1] $destination
        if ($LASTEXITCODE) { throw 'Clone failed' }
        git -C $destination checkout --detach $argsList[$i + 2]
        if ($LASTEXITCODE) { throw 'Checkout failed' }
    }
    Set-Location (Join-Path $work 'chat')
    py -3.12 -m venv .venv
    if ($LASTEXITCODE) { throw 'venv creation failed' }
    $env:VIRTUAL_ENV = Join-Path (Get-Location) '.venv'
    $env:PATH = (Join-Path $env:VIRTUAL_ENV 'Scripts') + ';' + $env:PATH
    python -m pip install poetry Cython pyinstaller
    if ($LASTEXITCODE) { throw 'Build dependency installation failed' }
    python -m poetry install --no-root --no-interaction
    if ($LASTEXITCODE) { throw 'Chat dependency installation failed' }
    python build_cython_binary.py
    if ($LASTEXITCODE) { throw 'Chat build failed' }
    if (-not (Test-Path 'dist/analog-chat-service/analog-chat-service.exe')) { throw 'Chat executable missing' }
    $archive = Join-Path $work 'analog-chat-service-win-x64.zip'
    Compress-Archive -Path dist/analog-chat-service -DestinationPath $archive
    gh release upload $tag $archive --repo $chatRepo
    if ($LASTEXITCODE) { throw 'Chat upload failed' }
    Set-Location (Join-Path $work 'analog-harness')
    pnpm install --frozen-lockfile --store-dir (Join-Path $work 'cache/pnpm')
    if ($LASTEXITCODE) { throw 'Harness dependency installation failed' }
    pnpm run build:official
    if ($LASTEXITCODE) { throw 'Harness build failed' }
    pnpm --dir apps/desktop run prepare:analog
    if ($LASTEXITCODE) { throw 'Runtime preparation failed' }
    pnpm --dir apps/desktop exec electron-builder --config analog-builder.config.mjs --win --x64 --publish never
    if ($LASTEXITCODE) { throw 'Windows packaging failed' }
    node apps/desktop/scripts/smoke-chat-backend.mjs apps/desktop/release-builds/win-unpacked/resources/analog-chat-service/analog-chat-service.exe
    if ($LASTEXITCODE) { throw 'Windows Chat startup check failed' }
    $exe = "apps/desktop/release-builds/Analog-$version-win-x64.exe"
    $zip = "apps/desktop/release-builds/Analog-$version-win-x64.zip"
    foreach ($file in @($exe, $zip)) {
        if (-not (Test-Path $file) -or (Get-Item $file).Length -eq 0) { throw "Missing artifact: $file" }
    }
    gh release upload $tag $exe $zip --repo $harnessRepo
    if ($LASTEXITCODE) { throw 'Windows upload failed' }
} catch {
    Write-Error $_ -ErrorAction Continue
    $exitStatus = 1
} finally {
    # Leave the owned temp directory before removing it, including its venv and caches.
    Set-Location ([IO.Path]::GetDirectoryName($work))
    try { Remove-Item -LiteralPath $work -Recurse -Force } catch { Write-Error $_ -ErrorAction Continue; $exitStatus = 1 }
}
exit $exitStatus
POWERSHELL
)
windows_powershell "$remote_command"

prerelease=false
[[ $RELEASE_VERSION != *-* ]] || prerelease=true
gh release edit "$RELEASE_TAG" --repo "$CHAT_REPO" --draft=false --prerelease="$prerelease"
gh release edit "$RELEASE_TAG" --repo "$HARNESS_REPO" --draft=false --prerelease="$prerelease"
printf 'Published Chat and Harness %s with macOS and Windows artifacts.\n' "$RELEASE_TAG"
