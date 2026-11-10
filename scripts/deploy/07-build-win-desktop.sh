#!/usr/bin/env bash
# 07-build-win-desktop.sh: Triggers remote Windows VM build for Electron Desktop app over SSH.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/env.sh"

tag="${1:-$(get_current_tag)}"
version="${tag#local-v}"
version="${version#v}"
exe_name="Analog-$version-win-x64.exe"
zip_name="Analog-$version-win-x64.zip"

existing_assets=$(gh release view "$tag" --repo "$HARNESS_REPO" --json assets --jq '.assets[].name' 2>/dev/null || true)
if echo "$existing_assets" | grep -qx "$exe_name" && echo "$existing_assets" | grep -qx "$zip_name"; then
  release_log "Assets $exe_name and $zip_name are already uploaded to $HARNESS_REPO ($tag). Skipping."
  exit 0
fi

release_log "Triggering Windows Desktop packaging on $WINDOWS_SSH_TARGET for tag $tag..."
repos_json=$(get_remote_repos_json)
ps_script=$(cat "$(dirname "${BASH_SOURCE[0]}")/windows-build.ps1")
windows_powershell "$ps_script
\$repos = @'
$repos_json
'@
Invoke-AnalogBuild -Step 'Desktop' -Version '$version' -Tag '$tag' -HarnessRepo '$HARNESS_REPO' -ChatRepo '$CHAT_REPO' -ReposJson \$repos"

release_success "Windows Desktop packaging and upload completed."
