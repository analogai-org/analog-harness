#!/usr/bin/env bash
# Shared configuration, helper functions, and environment resolution for Analog release pipeline.
set -Eeuo pipefail

RELEASE_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)
CHAT_ROOT=$(cd "${CHAT_REPO_DIR:-$RELEASE_ROOT/../chat}" && pwd -P)
RELEASE_BRANCH=${RELEASE_BRANCH:-main}
HARNESS_REPO=${HARNESS_REPO:-analogai-org/analog-harness}
CHAT_REPO=${CHAT_REPO:-analogai-org/chat}
WINDOWS_SSH_TARGET=${WINDOWS_SSH_TARGET:-windows-builder}
CHAT_PYTHON=${CHAT_PYTHON:-python3.12}

release_fail() { printf '❌ \033[31m%s\033[0m\n' "$*" >&2; exit 1; }
release_log() { printf '▶️ \033[34m%s\033[0m\n' "$*"; }
release_success() { printf '✅ \033[32m%s\033[0m\n' "$*"; }

get_current_version() {
  node -e 'console.log(JSON.parse(require("fs").readFileSync("package.json", "utf8")).version)'
}

get_current_tag() {
  local version
  version=$(get_current_version)
  printf 'local-v%s\n' "$version"
}

windows_bootstrap=$(node -e 'console.log(Buffer.from(process.argv[1], "utf16le").toString("base64"))' '$encoded = [Console]::In.ReadToEnd(); & ([ScriptBlock]::Create([Text.Encoding]::Unicode.GetString([Convert]::FromBase64String($encoded))))')

windows_powershell() {
  local script="$1"
  local encoded
  encoded=$(node -e 'console.log(Buffer.from(process.argv[1], "utf16le").toString("base64"))' "$script")
  printf '%s' "$encoded" | ssh "$WINDOWS_SSH_TARGET" "pwsh -NoProfile -NonInteractive -EncodedCommand $windows_bootstrap"
}

get_remote_repos_json() {
  node -e '
    const cp = require("child_process");
    const root = process.argv[1];
    const repos = [
      { name: "analog-harness", dir: root },
      { name: "chat", dir: `${root}/../chat` },
      { name: "foundation", dir: `${root}/../foundation` },
      { name: "deepthink", dir: `${root}/../deepthink` },
      { name: "deepact", dir: `${root}/../deepact` }
    ].map(r => ({
      name: r.name,
      repo: cp.execSync(`gh repo view $(git -C "${r.dir}" remote get-url origin) --json nameWithOwner --jq .nameWithOwner`, {encoding: "utf8"}).trim(),
      commit: cp.execSync(`git -C "${r.dir}" rev-parse HEAD`, {encoding: "utf8"}).trim()
    }));
    console.log(JSON.stringify(repos));
  ' "$RELEASE_ROOT"
}
