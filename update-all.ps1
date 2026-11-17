#requires -Version 5.1
[CmdletBinding()]
param(
  [string]$PluginDir = "C:\dsh-douyin-gonzalez-v040",
  [string]$AurabotModulesDir = (Join-Path $env:USERPROFILE ".dsh\plugins-data\aurabot\modules"),
  [switch]$ReplaceExistingBridge,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$PluginDir = [System.IO.Path]::GetFullPath($PluginDir)
if (-not (Test-Path (Join-Path $PluginDir 'package.json'))) {
  throw "未找到现有 DSH 插件目录：$PluginDir。首次安装请运行 install-all.ps1。"
}
$Installer = Join-Path $PSScriptRoot 'install-all.ps1'
if (-not (Test-Path $Installer)) { throw '未找到 install-all.ps1，请重新下载完整整合包。' }

$Arguments = @('-PluginDir', $PluginDir, '-AurabotModulesDir', $AurabotModulesDir)
if ($ReplaceExistingBridge) { $Arguments += '-ReplaceExistingBridge' }
if ($Force) { $Arguments += '-Force' }

Write-Host '=== DSH + Aurabot 桥接安全更新 ===' -ForegroundColor Cyan
Write-Host '将先备份插件代码和需要替换的桥接模块；不会删除 DSH 数据、Edge 登录资料、Aurabot 人格或记忆。'
Write-Host '如果桥接模块与本包不同，默认不覆盖；确认后才传 -ReplaceExistingBridge。'
& $Installer @Arguments
exit $LASTEXITCODE
