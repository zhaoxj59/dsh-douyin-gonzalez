# DSH 抖音插件 + Aurabot 桥接 — 一键卸载（Windows PowerShell）
# 只拆 Aurabot 桥接模块 douyin-bridge（有备份就恢复旧版）；DSH 插件本体不动，需要再拆见下面提示。
# 用法：右键 uninstall-all.ps1 → 使用 PowerShell 运行。
param([switch]$Force)

$ErrorActionPreference = 'Stop'
$AurabotData = Join-Path $env:USERPROFILE '.dsh\plugins-data\aurabot'
$BridgeDest = Join-Path $AurabotData 'modules\douyin-bridge'

Write-Host '=== 卸载 Aurabot 抖音私信桥接（douyin-bridge）==='
if (-not $Force) {
  Write-Host '开始前请确认：DSH 已经完全退出。'
  Read-Host '确认已退出，按回车继续（不想卸了按 Ctrl+C）' | Out-Null
}

$latestBackup = Get-ChildItem (Join-Path $AurabotData 'backups') -Directory -ErrorAction SilentlyContinue |
  Where-Object { $_.Name -like 'douyin-integrated-*' } |
  Sort-Object Name -Descending | Select-Object -First 1

if (Test-Path $BridgeDest) { Remove-Item $BridgeDest -Recurse -Force }
if ($latestBackup -and (Test-Path (Join-Path $latestBackup.FullName 'douyin-bridge-old'))) {
  Copy-Item (Join-Path $latestBackup.FullName 'douyin-bridge-old') $BridgeDest -Recurse -Force
  Write-Host "桥接模块已卸掉，旧版已从备份恢复：$($latestBackup.FullName)"
} else {
  Write-Host '桥接模块已卸掉（没找到可恢复的旧版备份）。'
}

Write-Host ''
Write-Host 'DSH 插件本体还在，要拆它的话：'
Write-Host '  在 DSH 面板里移除 dsh-douyin-gonzalez 的链接，或者删掉 C:\dsh-douyin-gonzalez-v040 后完全退出重开 DSH。'
Write-Host '  注意：别删 DSH 的插件数据目录，配置、白名单和额度都在里面。'
Write-Host '重开 DSH 后，顶栏没了「抖音私信桥接」就是卸干净了。'
