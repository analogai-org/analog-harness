#!/usr/bin/env bash
# 03-create-draft-release.sh: Ensures GitHub draft releases exist for both Chat and Harness.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/env.sh"

tag="${1:-$(get_current_tag)}"
version="${tag#local-v}"
version="${version#v}"

release_log "Ensuring GitHub draft releases exist for tag: $tag"
for repo in "$CHAT_REPO" "$HARNESS_REPO"; do
  if ! gh release view "$tag" --repo "$repo" >/dev/null 2>&1; then
    gh release create "$tag" --repo "$repo" --verify-tag --draft --title "Analog $version" --generate-notes
    release_log "Created draft release in $repo for $tag"
  else
    release_log "Draft release already exists in $repo for $tag"
  fi
done

release_success "Draft releases ready on GitHub."
