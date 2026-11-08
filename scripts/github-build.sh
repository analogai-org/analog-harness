#!/usr/bin/env bash
# Shared release preparation and the GitHub Actions entry point. Sourcing defines functions only.
# Usage and recovery: scripts/release/README.md.

release_fail() { printf '%s\n' "$*" >&2; exit 1; }

release_init() {
  RELEASE_ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
  CHAT_ROOT=$(cd "${CHAT_REPO_DIR:-$RELEASE_ROOT/../chat}" && pwd -P)
  RELEASE_BRANCH=${RELEASE_BRANCH:-main}
  HARNESS_REPO=${HARNESS_REPO:-analogai-org/analog-harness}
  CHAT_REPO=${CHAT_REPO:-analogai-org/chat}
  cd "$RELEASE_ROOT"
  command -v gh >/dev/null
  command -v pnpm >/dev/null
  command -v python3 >/dev/null
  gh api user --jq .login
  for repository in "$RELEASE_ROOT" "$CHAT_ROOT"; do
    [[ $(git -C "$repository" rev-parse --show-toplevel) == "$repository" ]] || release_fail "Not a repository root: $repository"
    [[ -z $(git -C "$repository" status --porcelain) ]] || release_fail "Commit or move uncommitted files first: $repository"
    [[ $(git -C "$repository" branch --show-current) == "$RELEASE_BRANCH" ]] || release_fail "Check out $RELEASE_BRANCH in $repository"
    git -C "$repository" fetch origin "refs/heads/$RELEASE_BRANCH"
    git -C "$repository" merge-base --is-ancestor FETCH_HEAD HEAD || release_fail "Update $repository from origin/$RELEASE_BRANCH first"
  done
  [[ $(gh repo view "$(git -C "$CHAT_ROOT" remote get-url origin)" --json nameWithOwner --jq .nameWithOwner) == "$CHAT_REPO" ]] || release_fail 'Chat origin does not match CHAT_REPO'
  [[ $(gh repo view "$(git remote get-url origin)" --json nameWithOwner --jq .nameWithOwner) == "$HARNESS_REPO" ]] || release_fail 'Harness origin does not match HARNESS_REPO'
}

release_version() {
  # One strictly greater version advances both repositories, even when their versions differ.
  node --input-type=module - "$CHAT_ROOT" "$1" <<'JS'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'smol-toml'
import { valid, gt, inc } from 'semver'
const [chat, request] = process.argv.slice(2)
const harnessVersion = JSON.parse(readFileSync('package.json', 'utf8')).version
const chatVersion = parse(readFileSync(join(chat, 'pyproject.toml'), 'utf8')).tool.poetry.version
if (!valid(harnessVersion) || !valid(chatVersion)) throw new Error('Both repository versions must be SemVer')
const base = gt(harnessVersion, chatVersion) ? harnessVersion : chatVersion
const version = ['major', 'minor', 'patch'].includes(request) ? inc(base, request) : valid(request.replace(/^v/, ''))
if (!version || !gt(version, harnessVersion) || !gt(version, chatVersion)) throw new Error('Release version must exceed both Chat and Harness versions')
console.log(version)
JS
}

release_prepare() {
  RELEASE_VERSION=$(release_version "$1")
  RELEASE_TAG="$2$RELEASE_VERSION"
  for repository in "$RELEASE_ROOT" "$CHAT_ROOT"; do
    if git -C "$repository" show-ref --verify --quiet "refs/tags/$RELEASE_TAG"; then
      release_fail "Tag already exists in $repository: $RELEASE_TAG"
    fi
    remote_tag=$(git -C "$repository" ls-remote --tags origin "refs/tags/$RELEASE_TAG")
    [[ -z "$remote_tag" ]] || release_fail "Remote tag already exists: $RELEASE_TAG"
  done
  printf 'Releasing Chat and Harness as %s\n' "$RELEASE_VERSION"
  pnpm run release:dsh "$RELEASE_VERSION"
  (
    cd "$CHAT_ROOT"
    python3 bump_version.py "$RELEASE_VERSION"
    git add -- pyproject.toml
    git commit -m "chore(release): $RELEASE_TAG"
  )
  # Refuse to tag a partially updated family or a failing Chat bump.
  node --input-type=module - "$CHAT_ROOT" "$RELEASE_VERSION" <<'JS'
import { globSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { parse } from 'smol-toml'
const [chat, version] = process.argv.slice(2)
for (const file of ['package.json', ...globSync(['apps/*/package.json', 'packages/*/*/package.json'])]) {
  if (JSON.parse(readFileSync(file, 'utf8')).version !== version) throw new Error(`Version mismatch: ${file}`)
}
if (parse(readFileSync(join(chat, 'pyproject.toml'), 'utf8')).tool.poetry.version !== version) throw new Error('Chat version mismatch')
JS
  for repository in "$CHAT_ROOT" "$RELEASE_ROOT"; do
    [[ -z $(git -C "$repository" status --porcelain) ]] || release_fail "Bump left unexpected changes: $repository"
    git -C "$repository" tag -a "$RELEASE_TAG" -m "Release $RELEASE_TAG"
  done
}

release_push() {
  # Each repository's branch and tag advance together; cross-repository writes are not atomic.
  git -C "$1" push --atomic origin "HEAD:refs/heads/$RELEASE_BRANCH" "refs/tags/$RELEASE_TAG"
}

github_build_main() {
  if [[ ${1:-} == --help ]]; then
    printf 'Usage: bash scripts/github-build.sh [patch|minor|major|VERSION]\nBump and push Chat and Harness; Harness Actions builds both backends and installers.\n'
    return
  fi
  [[ $# -le 1 ]] || release_fail 'Expected at most one version argument'
  release_init
  release_prepare "${1:-patch}" v
  release_push "$CHAT_ROOT"
  release_push "$RELEASE_ROOT"
  printf 'Chat and Harness %s pushed. Watch Desktop Actions in %s.\n' "$RELEASE_TAG" "$HARNESS_REPO"
}

if [[ ${BASH_SOURCE[0]} == "$0" ]]; then
  set -Eeuo pipefail
  github_build_main "$@"
fi
