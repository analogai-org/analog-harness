#!/usr/bin/env bash
# 08-publish.sh: Verifies all four required platform artifacts exist and marks releases as published.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/env.sh"

tag="${1:-$(get_current_tag)}"
version="${tag#local-v}"
version="${version#v}"

release_log "Verifying release assets for tag $tag..."
chat_assets=$(gh release view "$tag" --repo "$CHAT_REPO" --json assets --jq '.assets[].name' 2>/dev/null || true)
harness_assets=$(gh release view "$tag" --repo "$HARNESS_REPO" --json assets --jq '.assets[].name' 2>/dev/null || true)

echo "$chat_assets" | grep -qx "analog-chat-service-mac-arm64.tar.gz" || release_fail "Missing macOS Chat asset (analog-chat-service-mac-arm64.tar.gz) in $CHAT_REPO"
echo "$chat_assets" | grep -qx "analog-chat-service-win-x64.zip" || release_fail "Missing Windows Chat asset (analog-chat-service-win-x64.zip) in $CHAT_REPO"
echo "$harness_assets" | grep -qx "Analog-$version-mac-arm64.dmg" || release_fail "Missing macOS Desktop DMG (Analog-$version-mac-arm64.dmg) in $HARNESS_REPO"
echo "$harness_assets" | grep -qx "Analog-$version-win-x64.exe" || release_fail "Missing Windows Desktop EXE (Analog-$version-win-x64.exe) in $HARNESS_REPO"

prerelease=false
[[ $version == *-* ]] && prerelease=true

release_log "Publishing GitHub release for $CHAT_REPO ($tag)..."
gh release edit "$tag" --repo "$CHAT_REPO" --draft=false --prerelease="$prerelease"

release_log "Publishing GitHub release for $HARNESS_REPO ($tag)..."
gh release edit "$tag" --repo "$HARNESS_REPO" --draft=false --prerelease="$prerelease"

release_success "Published Chat and Harness $tag with all macOS and Windows artifacts!"
