#!/usr/bin/env bash
# deploy.sh: Modular orchestrator for Analog multi-platform release pipeline.
# Supports full runs, step-level resumption (--from), and isolated single-step execution (--only).
set -Eeuo pipefail
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

usage() {
  cat <<'EOF'
Usage: bash scripts/deploy/deploy.sh [OPTIONS] [VERSION_TYPE|VERSION]

Options:
  --from=STAGE      Resume pipeline starting from STAGE:
                      preflight, bump, draft, mac-chat, mac-desktop, win-chat, win-desktop, publish
  --only=STAGE      Run only the specified stage or platform group:
                      mac, win, publish, or any stage name above
  --tag=TAG         Target an existing tag (e.g. local-v0.3.33) without rebumping
  --help            Show this help message

Examples:
  bash scripts/deploy/deploy.sh patch
  bash scripts/deploy/deploy.sh --from=win-chat --tag=local-v0.3.33
  bash scripts/deploy/deploy.sh --only=win --tag=local-v0.3.33
  bash scripts/deploy/deploy.sh --only=publish --tag=local-v0.3.33
EOF
  exit 0
}

FROM_STAGE=""
ONLY_STAGE=""
TAG=""
POSITIONAL=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --from=*) FROM_STAGE="${1#*=}"; shift ;;
    --only=*) ONLY_STAGE="${1#*=}"; shift ;;
    --tag=*)  TAG="${1#*=}"; shift ;;
    --help)   usage ;;
    *)        POSITIONAL+=("$1"); shift ;;
  esac
done

BUMP_TARGET="${POSITIONAL[0]:-patch}"
if [[ -n "$TAG" ]]; then
  BUMP_TARGET="$TAG"
fi

run_stage() {
  local name="$1"
  local script="$2"
  printf '\n\033[1;36m==================================================\033[0m\n'
  printf '\033[1;36m🚀 Stage: %s\033[0m\n' "$name"
  printf '\033[1;36m==================================================\033[0m\n'
  eval "$script"
}

if [[ "$ONLY_STAGE" == "mac" ]]; then
  run_stage "mac-chat" "bash $DIR/04-build-mac-chat.sh $TAG"
  run_stage "mac-desktop" "bash $DIR/05-build-mac-desktop.sh $TAG"
  exit 0
elif [[ "$ONLY_STAGE" == "win" ]]; then
  run_stage "win-chat" "bash $DIR/06-build-win-chat.sh $TAG"
  run_stage "win-desktop" "bash $DIR/07-build-win-desktop.sh $TAG"
  exit 0
fi

declare -a stages=(
  "preflight:bash $DIR/01-preflight.sh"
  "bump:bash $DIR/02-bump-and-tag.sh $BUMP_TARGET"
  "draft:bash $DIR/03-create-draft-release.sh $TAG"
  "mac-chat:bash $DIR/04-build-mac-chat.sh $TAG"
  "mac-desktop:bash $DIR/05-build-mac-desktop.sh $TAG"
  "win-chat:bash $DIR/06-build-win-chat.sh $TAG"
  "win-desktop:bash $DIR/07-build-win-desktop.sh $TAG"
  "publish:bash $DIR/08-publish.sh $TAG"
)

started=false
[[ -z "$FROM_STAGE" ]] && started=true

for stage_entry in "${stages[@]}"; do
  stage_name="${stage_entry%%:*}"
  stage_cmd="${stage_entry#*:}"

  if [[ -n "$ONLY_STAGE" && "$stage_name" != "$ONLY_STAGE" ]]; then
    continue
  fi

  if [[ "$stage_name" == "$FROM_STAGE" ]]; then
    started=true
  fi

  if $started; then
    run_stage "$stage_name" "$stage_cmd"
    if [[ -n "$ONLY_STAGE" ]]; then
      break
    fi
  fi
done

printf '\n\033[1;32m🎉 Release workflow completed successfully!\033[0m\n'
