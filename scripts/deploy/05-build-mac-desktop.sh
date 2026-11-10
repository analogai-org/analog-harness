#!/usr/bin/env bash
# 05-build-mac-desktop.sh: Packages macOS Electron Desktop app and runs smoke verification.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/env.sh"

tag="${1:-$(get_current_tag)}"
version="${tag#local-v}"
version="${version#v}"
dmg_name="Analog-$version-mac-arm64.dmg"
zip_name="Analog-$version-mac-arm64.zip"

existing_assets=$(gh release view "$tag" --repo "$HARNESS_REPO" --json assets --jq '.assets[].name' 2>/dev/null || true)
if echo "$existing_assets" | grep -qx "$dmg_name" && echo "$existing_assets" | grep -qx "$zip_name"; then
  release_log "Assets $dmg_name and $zip_name are already uploaded to $HARNESS_REPO ($tag). Skipping."
  exit 0
fi

build_root=$(mktemp -d "${TMPDIR:-/tmp}/analog-mac-desktop.XXXXXXXX")
trap 'rm -rf "$build_root"' EXIT

export APP_VERSION="$version"
export DSH_DESKTOP_APP_ID=ai.analog.desktop
export CSC_IDENTITY_AUTO_DISCOVERY=false
export DSH_DESKTOP_TARGET_PLATFORM=darwin
export DSH_DESKTOP_TARGET_ARCH=arm64
export RELEASE_TAG="$tag"

release_log "Packaging macOS Desktop application in $build_root..."
git clone --no-checkout "$RELEASE_ROOT" "$build_root/analog-harness"
git -C "$build_root/analog-harness" checkout --detach HEAD

(
  cd "$build_root/analog-harness"
  pnpm install --frozen-lockfile
  pnpm run build:official
  pnpm --dir apps/desktop run prepare:analog
  pnpm --dir apps/desktop exec electron-builder --config analog-builder.config.mjs --mac --arm64 --publish never
)

mac_output="$build_root/analog-harness/apps/desktop/release-builds"
node "$RELEASE_ROOT/apps/desktop/scripts/smoke-chat-backend.mjs" "$mac_output/mac-arm64/Analog.app/Contents/Resources/analog-chat-service/analog-chat-service"

for file in "$mac_output/$dmg_name" "$mac_output/$zip_name"; do
  [[ -s "$file" ]] || release_fail "Missing macOS desktop artifact: $file"
done

gh release upload "$tag" "$mac_output/$dmg_name" "$mac_output/$zip_name" --repo "$HARNESS_REPO"
release_success "Uploaded $dmg_name and $zip_name to $HARNESS_REPO ($tag)"
