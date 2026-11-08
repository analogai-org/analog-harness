---
description: "Combined Chat and Harness release commands, build hosts, uploads, cleanup, and recovery."
---

# Combined releases

English | [中文](README.zh.md)

## Summary

Use one of two entry points to bump Chat and Harness to the same version and publish their artifacts. `github-build.sh` delegates compilation to GitHub Actions. `local-build.sh` compiles on an Apple Silicon Mac and a Windows x64 VM, then publishes both GitHub releases. The build paths use the unsigned Analog packaging configuration; signing and notarization are not included.

## Contents

- [Prerequisites](#prerequisites)
- [Commands](#commands)
- [Cleanup and recovery](#cleanup-and-recovery)
- [Dev Note](#dev-note)

<a id="prerequisites"></a>
## Prerequisites

Commit the release scripts before using them. Both repositories must be clean and on `main`, with dependencies installed in Harness and authenticated `gh`, Git, pnpm, Node 24, and Python 3 available. Chat defaults to the sibling `../chat`; `CHAT_REPO_DIR` overrides it. `RELEASE_BRANCH`, `HARNESS_REPO`, and `CHAT_REPO` override the branch and GitHub destinations; defaults are `main`, `analogai-org/analog-harness`, and `analogai-org/chat`. Git origins must match the selected destinations.

Local builds also require clean sibling `foundation`, `deepthink`, and `deepact` checkouts whose commits are already pushed. Install Python 3.12 and native compilation tools on both hosts, including Xcode command-line tools on macOS and Visual C++ Build Tools on Windows. Configure an SSH alias named `windows-builder`; `WINDOWS_SSH_TARGET` overrides that alias when needed. The Windows SSH account needs PowerShell 7 (`pwsh`), Git, Node 24, pnpm, the `py -3.12` launcher, and authenticated `gh` with access to all five repositories and both release destinations. `CHAT_PYTHON` overrides the Mac's `python3.12` executable. Authentication uses each host's existing configuration; credentials are not copied between hosts.

Harness's `build-desktop-release.yml` builds Chat and Desktop together from matching tags. Harness Actions needs `GH_PAT` or `ANALOG_CI_PAT` with read access to Chat, foundation, deepthink, and deepact, plus permission to publish Chat releases. Hosted runners are the default; `DESKTOP_RUNNER_STRATEGY=self-hosted` selects the existing `macos-arm64` and `win-x64` runner labels, whose hosts also need PowerShell 7 and Python 3.12.

<a id="commands"></a>
## Commands

Run either command from the Harness repository. The default increment is `patch`; `minor`, `major`, and an explicit SemVer version are also accepted. Automatic increments use the higher of the two current versions. An explicit version must exceed both. Both commands commit the shared Harness package versions and Chat's `pyproject.toml`, create tags, and push both repositories.

```sh
bash scripts/github-build.sh patch
```

The GitHub command pushes Chat's `v<version>` tag and then Harness's matching tag. Harness Actions compiles both Chat backends and both Desktop installers without waiting for Chat's separate workflow. It launches each packaged backend and requires a healthy response on port 8071 before publishing either release. Missing or empty backend executables stop packaging. The command returns after triggering Harness; check Actions for final build and publication results. It creates no local build artifacts.

```sh
bash scripts/local-build.sh patch
```

The local command uses the `windows-builder` SSH alias by default and accepts `WINDOWS_SSH_TARGET` as an override. It uses `local-v<version>` tags, which do not match either repository's automatic build triggers. It builds both hosts from the selected commits, uploads Chat's backend archives and Harness's DMG, EXE, and ZIP files to draft releases, and publishes the drafts only after all uploads succeed. It never overwrites existing release assets. Package versions remain ordinary SemVer, without the `local-` tag prefix. The package aliases are `pnpm run release:github` and `pnpm run release:local`.

<a id="cleanup-and-recovery"></a>
## Cleanup and recovery

Local builds create a private `analog-release.*` directory on macOS and an `analog-release-*` directory in the Windows account's temporary storage. Disposable clones, virtual environments, download caches, temporary files, and artifacts live there and are removed on ordinary success or failure. Existing checkouts, development data, and shared caches are preserved. Abrupt termination, a disconnected VM, or locked Windows files can leave the printed temporary directory behind; inspect that specific directory before removing it. Upload or cleanup errors fail the command.

Version commits, tags, and remote uploads are not rolled back after failure. Cross-repository pushes and release publication cannot be atomic. Inspect both repositories and draft releases before retrying; invoking either script again starts a new version. If the GitHub command stops between pushes, push the already-created Harness branch and tag after verifying the Chat tag exists remotely. Rerun failed Harness Actions for an unpublished tag. Do not force-push or reuse a published version. Failed local uploads leave drafts for inspection, while local build files are cleaned.

<a id="dev-note"></a>
## Dev Note

Release operators own installed application and VM cleanup acceptance. The backend startup check verifies the packaged executable; it does not exercise the installer or Electron UI.
