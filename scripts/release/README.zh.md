---
description: "Chat 与 Harness 联合发布的命令、构建主机、上传、清理及恢复说明。"
---

# 联合发布

[English](README.md) | 中文

## 概述

使用两个入口之一，将 Chat 与 Harness 升级到同一版本并发布产物。`github-build.sh` 将编译交给 GitHub Actions。`local-build.sh` 在 Apple Silicon Mac 和 Windows x64 虚拟机上编译，然后发布两个 GitHub release。这些构建流程使用未签名的 Analog 打包配置，不包含签名与公证。

## 目录

- [前提条件](#prerequisites)
- [命令](#commands)
- [清理与恢复](#cleanup-and-recovery)
- [开发备注](#dev-note)

<a id="prerequisites"></a>
## 前提条件

使用前请先提交发布脚本。两个仓库必须没有未提交的更改，并且处于 `main` 分支；Harness 必须已安装依赖，环境中必须具备已认证的 `gh`、Git、pnpm、Node 24 和 Python 3。Chat 默认位于同级 `../chat`，可通过 `CHAT_REPO_DIR` 覆盖。`RELEASE_BRANCH`、`HARNESS_REPO` 和 `CHAT_REPO` 可覆盖分支及 GitHub 目标，默认值分别为 `main`、`analogai-org/analog-harness` 和 `analogai-org/chat`。Git origin 必须与所选目标一致。

本地构建还需要同级的 `foundation`、`deepthink` 和 `deepact` 仓库没有未提交的更改，且当前提交已经推送。在两台主机上安装 Python 3.12 和原生编译工具，包括 macOS 的 Xcode 命令行工具及 Windows 的 Visual C++ Build Tools。配置名为 `windows-builder` 的 SSH 别名；需要时可用 `WINDOWS_SSH_TARGET` 覆盖该别名。Windows SSH 账号需要 PowerShell 7（`pwsh`）、Git、Node 24、pnpm、`py -3.12` 启动器，以及有权访问全部五个仓库和两个发布目标的已认证 `gh`。`CHAT_PYTHON` 可覆盖 Mac 上的 `python3.12` 可执行文件。认证使用各主机已有配置，不在主机间复制凭据。

Harness 的 `build-desktop-release.yml` 根据匹配的标签一起构建 Chat 和 Desktop。Harness Actions 需要 `GH_PAT` 或 `ANALOG_CI_PAT`，具备对 Chat、foundation、deepthink 和 deepact 的读取权限，以及发布 Chat release 的权限。默认使用托管 runner；`DESKTOP_RUNNER_STRATEGY=self-hosted` 可选择现有的 `macos-arm64` 和 `win-x64` runner 标签，其主机也需要 PowerShell 7 和 Python 3.12。

<a id="commands"></a>
## 命令

在 Harness 仓库中运行任一命令。默认递增 `patch`，也接受 `minor`、`major` 和显式 SemVer 版本。自动递增以两个当前版本中较高的版本为基准。显式版本必须高于两者。两个命令都会提交 Harness 各包的共享版本和 Chat 的 `pyproject.toml`，创建标签，并推送两个仓库。

```sh
bash scripts/github-build.sh patch
```

GitHub 命令先推送 Chat 的 `v<version>` 标签，再推送 Harness 的匹配标签。Harness Actions 编译两个 Chat 后端及两个 Desktop 安装包，无需等待 Chat 的独立工作流。发布任一 release 前，它会启动每个打包后的后端，并要求端口 8071 返回健康响应。后端可执行文件缺失或为空会阻止打包。命令在触发 Harness 后返回，最终构建及发布结果请查看 Actions。它不生成本地构建产物。

```sh
bash scripts/local-build.sh patch
```

本地命令默认使用 `windows-builder` SSH 别名，也接受 `WINDOWS_SSH_TARGET` 覆盖。它使用 `local-v<version>` 标签，不匹配任一仓库的自动构建触发条件。它在两台主机上根据所选提交构建，将 Chat 后端压缩包和 Harness 的 DMG、EXE、ZIP 文件上传到 release 草稿，并在全部上传成功后发布草稿。它从不覆盖已有 release 产物。包版本仍为普通 SemVer，不包含标签的 `local-` 前缀。对应的包命令别名是 `pnpm run release:github` 和 `pnpm run release:local`。

<a id="cleanup-and-recovery"></a>
## 清理与恢复

本地构建在 macOS 上创建私有的 `analog-release.*` 目录，在 Windows 账号的临时存储中创建 `analog-release-*` 目录。临时克隆、虚拟环境、下载缓存、临时文件和产物均位于这些目录中，并在正常成功或失败时删除。已有仓库、开发数据和共享缓存予以保留。强制终止、虚拟机断连或 Windows 文件被占用可能留下输出中记录的临时目录；删除前请检查该特定目录。上传或清理错误会使命令失败。

失败后不会回滚版本提交、标签或远端上传。跨仓库推送和 release 发布无法保证原子性。重试前请检查两个仓库及 release 草稿；再次调用任一脚本会开始新版本。如果 GitHub 命令在两次推送之间停止，请确认远端存在 Chat 标签，再推送已创建的 Harness 分支及标签。对于尚未发布的标签，可重新运行失败的 Harness Actions。不要强制推送或复用已发布版本。本地上传失败会保留草稿供检查，同时清理本地构建文件。

<a id="dev-note"></a>
## 开发备注

发布操作者负责安装后的应用及虚拟机清理验收。后端启动检查验证打包后的可执行文件，但不测试安装程序或 Electron 界面。
