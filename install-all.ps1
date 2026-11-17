#requires -Version 5.1
[CmdletBinding()]
param(
  [switch]$Force,
  [string]$PluginDir = "C:\dsh-douyin-gonzalez-v040",
  [string]$AurabotModulesDir = (Join-Path $env:USERPROFILE ".dsh\plugins-data\aurabot\modules"),
  [switch]$ReplaceExistingBridge
)

$ErrorActionPreference = 'Stop'
$PkgDir = [System.IO.Path]::GetFullPath($PSScriptRoot)
$PluginDir = [System.IO.Path]::GetFullPath($PluginDir)
$AurabotModulesDir = [System.IO.Path]::GetFullPath($AurabotModulesDir)
$AurabotData = Split-Path -Parent $AurabotModulesDir
$BridgeDest = Join-Path $AurabotModulesDir 'douyin-bridge'
$BridgeSrc = Join-Path $PkgDir 'integrations\aurabot-module\douyin-bridge'
$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$BackupRoot = Join-Path $AurabotData "backups\douyin-integrated-$Stamp"

function Write-Step([string]$Message) { Write-Host $Message -ForegroundColor Cyan }
function Get-HashOrEmpty([string]$Path) {
  if (Test-Path -LiteralPath $Path -PathType Leaf) { return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash }
  return ''
}
function Test-BridgeIdentical {
  $names = @('index.mjs', 'module.json')
  foreach ($name in $names) {
    if ((Get-HashOrEmpty (Join-Path $BridgeSrc $name)) -ne (Get-HashOrEmpty (Join-Path $BridgeDest $name))) { return $false }
  }
  return (Test-Path (Join-Path $BridgeDest 'index.mjs')) -and (Test-Path (Join-Path $BridgeDest 'module.json'))
}

Write-Host '=== DSH 独立抖音插件 + Aurabot API 桥接一键安装 ==='
Write-Host 'DSH 仍是独立插件；Aurabot 只提供模型/人格/记忆。'
Write-Host '安装不会删除 DSH 数据目录、Edge 登录资料、Aurabot 人格或记忆。'
Write-Host '注意：自动收件监听尚未完成；本预览版不能当作自动收件闭环稳定版。'
if (-not $Force) {
  Write-Host '开始前请完全退出 DSH 和 Aurabot。'
  Read-Host '确认已退出，按回车继续（取消请按 Ctrl+C）' | Out-Null
}

if (-not (Test-Path -LiteralPath $AurabotData -PathType Container)) {
  throw "未找到 Aurabot 数据目录：$AurabotData。请先确认 Aurabot 已在本机安装并至少启动过一次。"
}
if (-not (Test-Path (Join-Path $PkgDir 'package.json')) -or -not (Test-Path (Join-Path $BridgeSrc 'index.mjs')) -or -not (Test-Path (Join-Path $BridgeSrc 'module.json'))) {
  throw '整合包不完整：缺少 package.json、Aurabot 模块 index.mjs 或 module.json。请重新下载完整 ZIP。'
}

# Never silently replace a user-created module with the same id.
$BridgeIdentical = (Test-Path $BridgeDest) -and (Test-BridgeIdentical)
if ((Test-Path $BridgeDest) -and -not $BridgeIdentical -and -not $ReplaceExistingBridge) {
  throw "发现已存在的 douyin-bridge 模块：$BridgeDest。为避免覆盖用户模块，已停止。确认要替换时请显式运行 install-all.ps1 -ReplaceExistingBridge"
}

$NodeCmd = Get-Command node -ErrorAction SilentlyContinue
if (-not $NodeCmd) {
  Write-Step '未检测到 Node.js，尝试安装 Node.js 22 LTS'
  try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $Msi = Join-Path $env:TEMP 'node-v22-lts-x64.msi'
    Invoke-WebRequest 'https://nodejs.org/dist/v22.23.5/node-v22.23.5-x64.msi' -OutFile $Msi
    $Process = Start-Process msiexec.exe -ArgumentList ('/i "' + $Msi + '" /qn') -Wait -PassThru
    if ($Process.ExitCode -ne 0) { throw "Node MSI 安装退出码：$($Process.ExitCode)" }
    $env:Path = "C:\Program Files\nodejs;$env:Path"
  } catch {
    throw "自动安装 Node.js 失败：$($_.Exception.Message)。请先安装 Node.js 22.13+，再运行本脚本。"
  }
}
$NodeVersion = (& node -p "process.versions.node").Trim()
$NodeParts = $NodeVersion.Split('.')
if ([int]$NodeParts[0] -lt 22 -or ([int]$NodeParts[0] -eq 22 -and [int]$NodeParts[1] -lt 13)) {
  throw "当前 Node.js $NodeVersion 过低，要求 22.13 或更高版本。"
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw '未检测到 npm，请重新安装 Node.js 官方完整发行版。' }

New-Item -ItemType Directory -Force -Path $BackupRoot,$AurabotModulesDir | Out-Null
$PluginBackedUp = $false
$BridgeBackedUp = $false
$PluginCreated = $false
$BridgeCreated = $false

try {
  Write-Step '1/4 备份并安装 DSH 独立插件'
  if ($PkgDir -ne $PluginDir) {
    if (Test-Path $PluginDir) {
      Copy-Item -LiteralPath $PluginDir -Destination (Join-Path $BackupRoot 'dsh-plugin-before') -Recurse -Force
      $PluginBackedUp = $true
      Remove-Item -LiteralPath $PluginDir -Recurse -Force
    }
    Copy-Item -LiteralPath $PkgDir -Destination $PluginDir -Recurse -Force
    $PluginCreated = $true
  }
  Write-Host "DSH 插件目录：$PluginDir"

  Write-Step '2/4 安装依赖并运行项目自检'
  Push-Location $PluginDir
  try {
    npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install 失败，退出码 $LASTEXITCODE" }
    npm test
    if ($LASTEXITCODE -ne 0) { throw "npm test 自检失败，退出码 $LASTEXITCODE" }
  } finally { Pop-Location }

  Write-Step '3/4 安装 Aurabot 用户模块'
  if ($BridgeIdentical) {
    Write-Host 'Aurabot douyin-bridge 与本包文件一致，跳过覆盖。'
  } else {
    if (Test-Path $BridgeDest) {
      Copy-Item -LiteralPath $BridgeDest -Destination (Join-Path $BackupRoot 'douyin-bridge-before') -Recurse -Force
      $BridgeBackedUp = $true
      Remove-Item -LiteralPath $BridgeDest -Recurse -Force
    }
    Copy-Item -LiteralPath $BridgeSrc -Destination $BridgeDest -Recurse -Force
    $BridgeCreated = $true
  }

  Write-Step '4/4 注册 DSH 插件链接'
  if (Get-Command dsh -ErrorAction SilentlyContinue) {
    & dsh plugin --profile web add ("link:" + $PluginDir)
    if ($LASTEXITCODE -ne 0) {
      Write-Warning 'DSH CLI 未确认注册成功（可能已存在相同链接）。如果插件原本已加载，请勿重复添加；否则按下方提示手动添加。'
      Write-Host ("dsh plugin --profile web add link:" + $PluginDir)
    }
  } else {
    Write-Warning '未检测到 dsh 命令，已完成文件安装；请在 DSH 的插件管理中添加本地目录，或安装 CLI 后执行：'
    Write-Host ("dsh plugin --profile web add link:" + $PluginDir)
  }

  Write-Host "安装文件已完成。备份位置：$BackupRoot" -ForegroundColor Green
  Write-Host '接下来：'
  Write-Host '1. 重启 DSH；在 Aurabot「已安装」页启用 douyin-bridge。'
  Write-Host '2. Aurabot 模块设置填共享密钥、DSH 地址和 settings-token.txt 中的 DSH Token。'
  Write-Host '3. DSH 设置页填 Aurabot Origin 和相同共享密钥，点击“测试 Aurabot 连接”。'
  Write-Host '4. 在专用 Edge 中手动登录抖音；不要自动处理验证码或风控。'
  Write-Host '重要：自动收件轮询尚未接入，自动回复闭环仍待真实 DOM 和 Windows 实机验收。'
}
catch {
  Write-Host "安装失败：$($_.Exception.Message)" -ForegroundColor Red
  Write-Host '正在回滚本次替换的代码目录；DSH/Aurabot 数据目录不会被清理。' -ForegroundColor Yellow
  if ($BridgeCreated -and (Test-Path $BridgeDest)) { Remove-Item -LiteralPath $BridgeDest -Recurse -Force -ErrorAction SilentlyContinue }
  if ($BridgeBackedUp -and (Test-Path (Join-Path $BackupRoot 'douyin-bridge-before'))) {
    Copy-Item -LiteralPath (Join-Path $BackupRoot 'douyin-bridge-before') -Destination $BridgeDest -Recurse -Force
  }
  if ($PluginCreated -and (Test-Path $PluginDir)) { Remove-Item -LiteralPath $PluginDir -Recurse -Force -ErrorAction SilentlyContinue }
  if ($PluginBackedUp -and (Test-Path (Join-Path $BackupRoot 'dsh-plugin-before'))) {
    Copy-Item -LiteralPath (Join-Path $BackupRoot 'dsh-plugin-before') -Destination $PluginDir -Recurse -Force
  }
  Write-Host "回滚结束。备份保留在：$BackupRoot" -ForegroundColor Yellow
  exit 1
}
