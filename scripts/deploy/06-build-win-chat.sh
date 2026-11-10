#!/usr/bin/env bash
# 06-build-win-chat.sh: Triggers remote Windows VM build for Chat service over SSH.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/env.sh"

tag="${1:-$(get_current_tag)}"
version="${tag#local-v}"
version="${version#v}"
artifact="analog-chat-service-win-x64.zip"

if gh release view "$tag" --repo "$CHAT_REPO" --json assets --jq '.assets[].name' 2>/dev/null | grep -qx "$artifact"; then
  release_log "Asset $artifact is already uploaded to $CHAT_REPO ($tag). Skipping."
  exit 0
fi

release_log "Triggering Windows Chat service build on $WINDOWS_SSH_TARGET for tag $tag..."
repos_json=$(get_remote_repos_json)
ps_script=$(cat "$(dirname "${BASH_SOURCE[0]}")/windows-build.ps1")
windows_powershell "$ps_script
\$repos = @'
$repos_json
'@
Invoke-AnalogBuild -Step 'Chat' -Version '$version' -Tag '$tag' -HarnessRepo '$HARNESS_REPO' -ChatRepo '$CHAT_REPO' -ReposJson \$repos"

release_success "Windows Chat service build and upload completed."
