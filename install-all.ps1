# DSH 抖音插件 v0.4.0 + Aurabot 抖音私信桥接 — 一键整合安装（Windows PowerShell）
# 一次装两边：① DSH 插件 dsh-douyin-gonzalez v0.4.0  ② Aurabot 模块 douyin-bridge v0.1.0
# 跑之前：先把 DSH 完全退出。脚本会先备份，失败自动回滚，不动 DSH 的插件数据目录。
# 用法：解压后右键 install-all.ps1 → 使用 PowerShell 运行；跳过确认用：.\install-all.ps1 -Force
param([switch]$Force)

$ErrorActionPreference = 'Stop'
$PkgDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$PluginDir = 'C:\dsh-douyin-gonzalez-v040'
$AurabotData = Join-Path $env:USERPROFILE '.dsh\plugins-data\aurabot'
$BridgeDest = Join-Path $AurabotData 'modules\douyin-bridge'
$BridgeSrc = Join-Path $PkgDir 'integrations\aurabot-module\douyin-bridge'
$BackupRoot = Join-Path $AurabotData "backups\douyin-integrated-$Stamp"

Write-Host '=== DSH 抖音插件 v0.4.0 + Aurabot 桥接 一键安装 ==='
if (-not $Force) {
  Write-Host '开始前请确认：DSH 已经完全退出。'
  Read-Host '确认已退出，按回车继续（不想装了按 Ctrl+C）' | Out-Null
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host '没找到 node：请先装 Node LTS（>=22.19），再跑这个脚本。' -ForegroundColor Red
  exit 1
}
if (-not (Test-Path $AurabotData)) {
  Write-Host "没找到 Aurabot 数据目录：$AurabotData" -ForegroundColor Red
  Write-Host '先确认 DSH 和 Aurabot 装在这台电脑上，再跑这个脚本。'
  exit 1
}
if (-not (Test-Path (Join-Path $BridgeSrc 'index.mjs')) -or -not (Test-Path (Join-Path $BridgeSrc 'module.json'))) {
  Write-Host '整合包不完整：integrations\aurabot-module\douyin-bridge 里缺 index.mjs 或 module.json。' -ForegroundColor Red
  Write-Host '重新解压完整的整合 ZIP 再跑。'
  exit 1
}

Write-Host "备份到：$BackupRoot"
New-Item -ItemType Directory -Force -Path $BackupRoot | Out-Null
$pluginBackedUp = $false
if ((Test-Path $PluginDir) -and ($PkgDir -ne $PluginDir)) {
  Copy-Item $PluginDir (Join-Path $BackupRoot 'dsh-plugin-v040-old') -Recurse
  $pluginBackedUp = $true
  Write-Host '已备份旧 DSH 插件目录。'
}
$bridgeBackedUp = $false
if (Test-Path $BridgeDest) {
  Copy-Item $BridgeDest (Join-Path $BackupRoot 'douyin-bridge-old') -Recurse
  $bridgeBackedUp = $true
  Write-Host '已备份旧桥接模块。'
}

try {
  # ① DSH 插件：拷到固定目录，装依赖，跑自检
  if ($PkgDir -ne $PluginDir) {
    if (Test-Path $PluginDir) { Remove-Item $PluginDir -Recurse -Force }
    Copy-Item $PkgDir $PluginDir -Recurse
    Write-Host "DSH 插件已拷到：$PluginDir"
  } else {
    Write-Host '已在插件目录里运行，跳过复制。'
  }
  Push-Location $PluginDir
  try {
    Write-Host '正在装依赖（npm install）…'
    npm install
    if ($LASTEXITCODE -ne 0) { throw "npm install 失败（退出码 $LASTEXITCODE）。" }
    Write-Host '正在跑自检（npm test）…'
    npm test
    if ($LASTEXITCODE -ne 0) { throw "自检没过（退出码 $LASTEXITCODE），先别装。" }
  } finally { Pop-Location }

  # ② Aurabot 桥接模块：index.mjs + module.json + README 一起拷过去
  if (Test-Path $BridgeDest) { Remove-Item $BridgeDest -Recurse -Force }
  New-Item -ItemType Directory -Force -Path $BridgeDest | Out-Null
  Copy-Item (Join-Path $BridgeSrc 'index.mjs') $BridgeDest
  Copy-Item (Join-Path $BridgeSrc 'module.json') $BridgeDest
  Copy-Item (Join-Path $PkgDir 'integrations\aurabot-module\README.md') (Join-Path $BridgeDest 'README.md')
  Write-Host '桥接模块已装好。'

  # ③ 挂 DSH 插件链接（有 dsh 命令才跑，没有就留给手动挂）
  if (Get-Command dsh -ErrorAction SilentlyContinue) {
    dsh plugin --profile web add link:$PluginDir
    if ($LASTEXITCODE -ne 0) { throw "dsh plugin 挂链接失败（退出码 $LASTEXITCODE）。" }
  } else {
    Write-Host '没找到 dsh 命令，跳过挂链接：重开 DSH 后在面板里手动添加，或装好 DSH CLI 再跑：' -ForegroundColor Yellow
    Write-Host "  dsh plugin --profile web add link:$PluginDir"
  }

  Write-Host ''
  Write-Host '两边都装好了。接下来在面板里做三件事（密钥别发聊天里）：' -ForegroundColor Green
  Write-Host '  1. 完全退出 DSH 再重开。'
  Write-Host '  2. Aurabot「模块」页启用 douyin-bridge，填：共享密钥（自己编一个长的）、DSH 地址（默认 http://127.0.0.1:8765）、DSH 设置服务 Token（去 DSH 数据目录找 settings-token.txt 复制）。'
  Write-Host '  3. DSH 设置页 → Aurabot 智能私信桥接：填 Aurabot 服务地址（本机 http://127.0.0.1:端口，远程必须 HTTPS）、桥接密钥（跟第 2 步同一个），按需勾自动回复/主动私信，点“测试 Aurabot 连接”，显示连接成功才算通。'
  Write-Host '  4. 抖音登录：在 DSH 设置页用“打开 Edge 登录抖音”，在那个专用 Edge 窗口里扫码。'
  Write-Host "备份在：$BackupRoot"
} catch {
  Write-Host "安装失败，正在回滚：$($_.Exception.Message)" -ForegroundColor Red
  if (Test-Path $BridgeDest) { Remove-Item $BridgeDest -Recurse -Force -ErrorAction SilentlyContinue }
  if ($bridgeBackedUp) { Copy-Item (Join-Path $BackupRoot 'douyin-bridge-old') $BridgeDest -Recurse -Force }
  if ($pluginBackedUp) {
    if (Test-Path $PluginDir) { Remove-Item $PluginDir -Recurse -Force -ErrorAction SilentlyContinue }
    Copy-Item (Join-Path $BackupRoot 'dsh-plugin-v040-old') $PluginDir -Recurse -Force
  }
  Write-Host "已回滚到安装前状态，备份在：$BackupRoot"
  exit 1
}
