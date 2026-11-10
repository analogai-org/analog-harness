#!/usr/bin/env bash
# 04-build-mac-chat.sh: Compiles and bundles macOS chat backend using Cython & PyInstaller.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/env.sh"

tag="${1:-$(get_current_tag)}"
artifact="analog-chat-service-mac-arm64.tar.gz"

if gh release view "$tag" --repo "$CHAT_REPO" --json assets --jq '.assets[].name' 2>/dev/null | grep -qx "$artifact"; then
  release_log "Asset $artifact is already uploaded to $CHAT_REPO ($tag). Skipping."
  exit 0
fi

build_root=$(mktemp -d "${TMPDIR:-/tmp}/analog-mac-chat.XXXXXXXX")
trap 'rm -rf "$build_root"' EXIT

release_log "Building macOS Chat microservice in $build_root..."
git clone --no-checkout "$CHAT_ROOT" "$build_root/chat"
git -C "$build_root/chat" checkout --detach HEAD

"$CHAT_PYTHON" -m venv "$build_root/chat/.venv"
export VIRTUAL_ENV="$build_root/chat/.venv"
export PATH="$VIRTUAL_ENV/bin:$PATH"

python -m pip install poetry Cython pyinstaller
(
  cd "$build_root/chat"
  python -m poetry install --no-root --no-interaction
  python build_cython_binary.py
  test -f dist/analog-chat-service/analog-chat-service
  tar -czf "$build_root/$artifact" -C dist analog-chat-service
)

gh release upload "$tag" "$build_root/$artifact" --repo "$CHAT_REPO"
release_success "Uploaded $artifact to $CHAT_REPO ($tag)"
