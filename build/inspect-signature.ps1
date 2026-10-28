param([Parameter(Mandatory = $true)][string]$Path)
$ErrorActionPreference = 'Stop'
$file = Get-Item -LiteralPath $Path
if ($file.PSIsContainer) { throw 'Expected an executable file' }
$signature = Get-AuthenticodeSignature -LiteralPath $file.FullName
@{
    status = $signature.Status.ToString()
    productName = $file.VersionInfo.ProductName
    productVersion = $file.VersionInfo.ProductVersion
    fileVersion = $file.VersionInfo.FileVersion
} | ConvertTo-Json -Compress
