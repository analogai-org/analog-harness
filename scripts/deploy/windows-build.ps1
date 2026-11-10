# Remote PowerShell script for building Chat service and Electron Desktop on Windows VM.
function Invoke-AnalogBuild {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)][ValidateSet('Chat','Desktop','All')][string]$Step,
        [Parameter(Mandatory=$true)][string]$Version,
        [Parameter(Mandatory=$true)][string]$Tag,
        [Parameter(Mandatory=$true)][string]$HarnessRepo,
        [Parameter(Mandatory=$true)][string]$ChatRepo,
        [Parameter(Mandatory=$false)][string]$ReposJson
    )

    $ErrorActionPreference = 'Stop'
    $PSNativeCommandUseErrorActionPreference = $true

    if (-not (Test-Path 'C:\b')) {
        New-Item -ItemType Directory -Path 'C:\b' -Force | Out-Null
    }

    $work = Join-Path 'C:\b' ('r-' + [Guid]::NewGuid().ToString('N').Substring(0, 12))
    New-Item -ItemType Directory -Path $work -Force | Out-Null
    Write-Host "Temporary build directory on Windows VM: $work"
    $exitStatus = 0

    try {
        if (-not $IsWindows -or [Runtime.InteropServices.RuntimeInformation]::OSArchitecture -ne 'X64') {
            throw 'Windows x64 required'
        }

        Set-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -Name 'LongPathsEnabled' -Value 1 -ErrorAction SilentlyContinue
        git config --global core.longpaths true

        if ($ReposJson) {
            $repos = $ReposJson | ConvertFrom-Json
            foreach ($r in $repos) {
                $dest = Join-Path $work $r.name
                Write-Host "Cloning $($r.repo) ($($r.commit)) into $dest..."
                gh repo clone $r.repo $dest -- --config core.longpaths=true
                git -C $dest config core.longpaths true
                git -C $dest checkout --detach $r.commit
            }
        }

        $env:TMP = $env:TEMP = Join-Path $work 'tmp'
        New-Item -ItemType Directory -Path $env:TEMP -Force | Out-Null
        $env:PIP_CACHE_DIR = Join-Path $work 'c\pip'
        $env:POETRY_CACHE_DIR = Join-Path $work 'c\poetry'
        $env:ELECTRON_CACHE = Join-Path $work 'c\electron'
        $env:ELECTRON_BUILDER_CACHE = Join-Path $work 'c\builder'
        $env:npm_config_cache = Join-Path $work 'c\npm'
        $env:npm_config_devdir = Join-Path $work 'c\node-gyp'
        $env:PYINSTALLER_CONFIG_DIR = Join-Path $work 'c\pyi'
        $env:POETRY_VIRTUALENVS_CREATE = 'false'
        $env:APP_VERSION = $Version
        $env:DSH_DESKTOP_APP_ID = 'ai.analog.desktop'
        $env:DSH_DESKTOP_TARGET_PLATFORM = 'win32'
        $env:DSH_DESKTOP_TARGET_ARCH = 'x64'
        $env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
        $env:RELEASE_TAG = $Tag

        # Ingest MSVC Build Tools environment variables
        $vcvars = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvars64.bat"
        if (Test-Path $vcvars) {
            $lines = cmd.exe /c ('"' + $vcvars + '" && set')
            foreach ($line in $lines) {
                $idx = $line.IndexOf('=')
                if ($idx -gt 0) {
                    $k = $line.Substring(0, $idx)
                    $v = $line.Substring($idx + 1)
                    [System.Environment]::SetEnvironmentVariable($k, $v, 'Process')
                }
            }
        }
        $env:DISTUTILS_USE_SDK = '1'

        if ($Step -eq 'Chat' -or $Step -eq 'All') {
            Write-Host "=== Building Windows Chat Microservice ==="
            $chatDir = Join-Path $work 'chat'
            if (-not (Test-Path $chatDir)) {
                gh repo clone $ChatRepo $chatDir -- --config core.longpaths=true
                git -C $chatDir config core.longpaths true
            }
            Set-Location $chatDir

            py -3.12 -m venv .venv
            if ($LASTEXITCODE) { throw "venv creation failed" }
            $env:VIRTUAL_ENV = Join-Path (Get-Location) '.venv'
            $env:PATH = (Join-Path $env:VIRTUAL_ENV 'Scripts') + ';' + $env:PATH

            python -m pip install setuptools wheel pybind11 numpy poetry Cython pyinstaller
            if ($LASTEXITCODE) { throw "Build dependency installation failed" }
            python -m poetry install --no-root --no-interaction
            if ($LASTEXITCODE) { throw "Chat dependency installation failed" }
            python build_cython_binary.py
            if ($LASTEXITCODE) { throw "Cython compilation/bundling failed" }

            $exePath = 'dist/analog-chat-service/analog-chat-service.exe'
            if (-not (Test-Path $exePath)) { throw "Missing compiled chat executable: $exePath" }

            $archive = Join-Path $work 'analog-chat-service-win-x64.zip'
            Compress-Archive -Path dist/analog-chat-service -DestinationPath $archive
            gh release upload $Tag $archive --repo $ChatRepo
            if ($LASTEXITCODE) { throw "Failed to upload Windows chat artifact to $ChatRepo" }
            Write-Host "Uploaded Windows chat artifact to $ChatRepo ($Tag)"
        }

        if ($Step -eq 'Desktop' -or $Step -eq 'All') {
            Write-Host "=== Building Windows Electron Desktop App ==="
            $harnessDir = Join-Path $work 'harness'
            if (-not (Test-Path $harnessDir)) {
                $harnessDir = Join-Path $work 'analog-harness'
            }
            if (-not (Test-Path $harnessDir)) {
                gh repo clone $HarnessRepo $harnessDir -- --config core.longpaths=true
                git -C $harnessDir config core.longpaths true
            }
            Set-Location $harnessDir

            $env:APP_VERSION = $Version
            $env:DSH_DESKTOP_APP_ID = 'ai.analog.desktop'
            $env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
            $env:DSH_DESKTOP_TARGET_PLATFORM = 'win32'
            $env:DSH_DESKTOP_TARGET_ARCH = 'x64'
            $env:RELEASE_TAG = $Tag
            $env:ANALOG_CHAT_TAG = $Tag

            pnpm install --frozen-lockfile --store-dir (Join-Path $work 'c\pnpm')
            if ($LASTEXITCODE) { throw "Harness dependency installation failed" }
            pnpm run build:official
            if ($LASTEXITCODE) { throw "Harness build:official failed" }

            $prebuiltDir = Join-Path $harnessDir 'apps\desktop\prebuilt'
            $prebuiltChatDir = Join-Path $prebuiltDir 'analog-chat-service'
            if (-not (Test-Path $prebuiltChatDir)) {
                New-Item -ItemType Directory -Force -Path $prebuiltDir | Out-Null
                $zipAsset = Join-Path $prebuiltDir 'analog-chat-service-win-x64.zip'
                gh release download $Tag --repo $ChatRepo --pattern 'analog-chat-service-win-x64.zip' --dir $prebuiltDir
                if (Test-Path $zipAsset) {
                    Expand-Archive -Path $zipAsset -DestinationPath $prebuiltDir -Force
                    Remove-Item -Force $zipAsset
                }
            }

            pnpm --dir apps/desktop run prepare:analog
            if ($LASTEXITCODE) { throw "Desktop preparation failed" }
            pnpm --dir apps/desktop exec electron-builder --config analog-builder.config.mjs --win --x64 --publish never
            if ($LASTEXITCODE) { throw "Electron packaging failed" }

            $unpackedExe = 'apps/desktop/release-builds/win-unpacked/resources/analog-chat-service/analog-chat-service.exe'
            node apps/desktop/scripts/smoke-chat-backend.mjs $unpackedExe
            if ($LASTEXITCODE) { throw "Windows Chat smoke test failed" }

            $exe = "apps/desktop/release-builds/Analog-$Version-win-x64.exe"
            $zip = "apps/desktop/release-builds/Analog-$Version-win-x64.zip"
            foreach ($file in @($exe, $zip)) {
                if (-not (Test-Path $file) -or (Get-Item $file).Length -eq 0) {
                    throw "Missing desktop artifact: $file"
                }
            }
            gh release upload $Tag $exe $zip --repo $HarnessRepo
            if ($LASTEXITCODE) { throw "Failed to upload Windows desktop artifacts to $HarnessRepo" }
            Write-Host "Uploaded Windows desktop artifacts to $HarnessRepo ($Tag)"
        }
    } catch {
        Write-Error $_ -ErrorAction Continue
        $exitStatus = 1
    } finally {
        Set-Location ([IO.Path]::GetDirectoryName($work))
        try {
            Remove-Item -LiteralPath $work -Recurse -Force -ErrorAction SilentlyContinue
        } catch {
            Write-Error $_ -ErrorAction Continue
        }
    }

    if ($exitStatus -ne 0) {
        exit $exitStatus
    }
}
