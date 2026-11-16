$ErrorActionPreference = 'Stop'
$source = Split-Path -Parent $MyInvocation.MyCommand.Path
$target = Join-Path $env:USERPROFILE '.dsh\plugins-data\aurabot\modules\douyin-bridge'
New-Item -ItemType Directory -Force -Path $target | Out-Null
Copy-Item -LiteralPath (Join-Path $source 'index.mjs') -Destination (Join-Path $target 'index.mjs') -Force
Write-Host ''
Write-Host 'Aurabot Douyin bridge module copied:' -ForegroundColor Green
Write-Host $target
Write-Host 'Now open Aurabot -> Modules -> douyin-bridge, enable it, and set the shared token.'
