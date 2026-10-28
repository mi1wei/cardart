$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

$installDir = Join-Path ([Environment]::GetFolderPath('ProgramFiles')) 'Folio'
$profileDir = Join-Path ([Environment]::GetFolderPath('ApplicationData')) 'Folio'
$picturesDir = [Environment]::GetFolderPath([Environment+SpecialFolder]::MyPictures, [Environment+SpecialFolderOption]::DoNotVerify)
$libraryDir = Join-Path $picturesDir ([string][char]0x76f8 + [char]0x518c + [char]0x5e93)
$uninstaller = Join-Path $installDir 'Uninstall Folio.exe'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = [Security.Principal.WindowsPrincipal]::new($identity)

# The pinned builder derives this stable registry key from Folio's appId.
$appGuid = '478be410-29f8-5725-868b-2fdf643dd24b'
$installKeys = @()
$registrations = @()
foreach ($hive in @('HKLM', 'HKCU')) {
    $key = "${hive}:\Software\$appGuid"
    if (Test-Path -LiteralPath $key) {
        $entry = Get-ItemProperty -LiteralPath $key
        $installKeys += @{ hive = $hive; location = $entry.InstallLocation }
    }
    $key = "${hive}:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$appGuid"
    if (Test-Path -LiteralPath $key) {
        $entry = Get-ItemProperty -LiteralPath $key
        $path = ''
        if ($entry.UninstallString -match '^"([^"]+)"') { $path = $Matches[1] }
        $registrations += @{ hive = $hive; version = $entry.DisplayVersion; uninstaller = $path }
    }
}

Get-NetFirewallProfile -ErrorAction Stop | Out-Null
$firewallRules = @()
$rules = @(Get-NetFirewallRule -DisplayName 'io.github.mi1wei.folio - Private LAN' -ErrorAction SilentlyContinue)
foreach ($rule in $rules) {
    $application = $rule | Get-NetFirewallApplicationFilter
    $port = $rule | Get-NetFirewallPortFilter
    $address = $rule | Get-NetFirewallAddressFilter
    $firewallRules += @{
        enabled = ($rule.Enabled.ToString() -eq 'True')
        direction = $rule.Direction.ToString()
        action = $rule.Action.ToString()
        profile = $rule.Profile.ToString()
        program = $application.Program
        protocol = $port.Protocol.ToString()
        remoteAddresses = @($address.RemoteAddress)
    }
}

@{
    admin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    x64 = [Environment]::Is64BitProcess
    installDir = $installDir
    profileDir = $profileDir
    picturesDir = $picturesDir
    libraryDir = $libraryDir
    installExists = (Test-Path -LiteralPath $installDir)
    appExists = (Test-Path -LiteralPath (Join-Path $installDir 'Folio.exe'))
    uninstallerExists = (Test-Path -LiteralPath $uninstaller)
    profileExists = (Test-Path -LiteralPath $profileDir)
    libraryExists = (Test-Path -LiteralPath $libraryDir)
    running = @(Get-Process -Name 'Folio' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Id)
    installKeys = $installKeys
    registrations = $registrations
    firewallRules = $firewallRules
} | ConvertTo-Json -Compress -Depth 6
