# Disable Password Complexity and set password to analog
secedit /export /cfg C:\secpol.cfg
(Get-Content C:\secpol.cfg) -replace 'PasswordComplexity = 1', 'PasswordComplexity = 0' -replace 'MinimumPasswordLength = \d+', 'MinimumPasswordLength = 0' | Out-File C:\secpol.cfg -Encoding ascii
secedit /configure /db C:\windows\security\local.sdb /cfg C:\secpol.cfg /areas SECURITYPOLICY
net user analog analog

# Enable OpenSSH Server
Add-WindowsCapability -Online -Name OpenSSH.Server~~~~0.0.1.0 -ErrorAction SilentlyContinue
Start-Service sshd -ErrorAction SilentlyContinue
Set-Service -Name sshd -StartupType 'Automatic'
New-NetFirewallRule -Name 'OpenSSH-Server-In-TCP' -DisplayName 'OpenSSH Server (sshd)' -Enabled True -Direction Inbound -Protocol TCP -Action Allow -LocalPort 22 -ErrorAction SilentlyContinue

# Setup SSH key for analog
$pubKey = "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAABgQCxFqmedOg8EpIb7FQfBCXGBlXZTaQW2wO02Z+oawJuSyGwfypH9UskYFeKhqFMGA6DdgkibKc3OGIy6I0RxWp/INgS/rhDLkmimyhpiV8doMgIw7N6sl3YN20e2LOxs2j8fG4eCpyZY0hhQ/PT45SHxUirlOPeKzrj88y7abCfTuEG4zT31Mhf6uShwmH0k2fpOr4VYcuuE+R3GLwDPiB8xL5JiiM6d3LQ53Da/9UXSB5jr8t0VJgJ8SOk1+zB3demznYg3ZbMvqXa7fUppMvwBsuvy+vlMDU6JcI6CrWEluNdSQ7iNrqUC3XduClfQga35HyHf6iVxBRNE0xdeMlgsPmKP5AhTCbKqE7EkNDQcEevUWQjUVEXnAhAZ14lYYHH92zF5wUjiGTMoqFuJxVafpFEWZ4HeWs/8mWgJd+FZwRQvAOpVy6NcGJUD4TyXAxCTajF6/AqZbn4WNZtoHldMPlRdd8EpB1FM48faphJMsiXceKe37bsfVeypGZFrNU= giorgibadzaghua@giorgis-MacBook-Air-2.local"

$adminKeys = "C:\ProgramData\ssh\administrators_authorized_keys"
$pubKey | Out-File -Encoding ascii $adminKeys
icacls $adminKeys /inheritance:r /grant "SYSTEM:F" /grant "Administrators:F"

$userSsh = "C:\Users\analog\.ssh"
if (!(Test-Path $userSsh)) { New-Item -ItemType Directory -Path $userSsh -Force }
$pubKey | Out-File -Encoding ascii "$userSsh\authorized_keys"

icacls "$userSsh" /inheritance:r /grant "SYSTEM:(OI)(CI)F" /grant "Administrators:(OI)(CI)F" /grant "analog:(OI)(CI)F"
icacls "$userSsh\authorized_keys" /inheritance:r /grant "SYSTEM:F" /grant "Administrators:F" /grant "analog:F"

Restart-Service sshd -Force

# Install Chocolatey and basic packages
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
if (!(Test-Path "C:\ProgramData\chocolatey")) {
    iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
}

choco install -y git nodejs-lts python312 pnpm
