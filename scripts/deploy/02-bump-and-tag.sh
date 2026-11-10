#!/usr/bin/env bash
# 02-bump-and-tag.sh: Calculates version bump, tags repositories, and pushes commits/tags.
source "$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/env.sh"

bump_request="${1:-patch}"
current_version=$(get_current_version)
current_tag="local-v$current_version"

# If the bump_request is an explicit version matching current version/tag, skip bumping.
if [[ "$bump_request" == "$current_version" || "$bump_request" == "$current_tag" || "$bump_request" == "v$current_version" ]]; then
  release_log "Version $current_version is already tagged as $current_tag. Reusing existing tag."
  exit 0
fi

source "$RELEASE_ROOT/scripts/github-build.sh"
release_init
release_prepare "$bump_request" local-v
release_push "$CHAT_ROOT"
release_push "$RELEASE_ROOT"

release_success "Successfully bumped version and created tag: $(get_current_tag)"
