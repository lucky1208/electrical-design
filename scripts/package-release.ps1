# 生成干净发布包：只复制运行所需文件，排除 .git、nssm、tests、脚本与本地审计产物。
# 用法：powershell -ExecutionPolicy Bypass -File scripts\package-release.ps1
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$outRoot = Join-Path $root 'release'
$stage = Join-Path $outRoot 'evse-schematic'
$zip = Join-Path $outRoot ('evse-schematic-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.zip')

if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
New-Item -ItemType Directory -Path $stage -Force | Out-Null

$files = @(
  'index.html',
  'evse-core.js',
  'evse-mwess-core.js',
  'evse-vendor-kb.js',
  'evse-source.js',
  'evse-calc.js',
  'evse-geo.js',
  'evse-labelfix.js',
  'evse-render.js',
  'evse-sim.js',
  'evse-manual-kb.js',
  'evse-bom.js',
  'evse-ai.js',
  'evse-export.js',
  'evse-worker.js',
  'proxy.js',
  'manual-db.example.json',
  'start-proxy.bat',
  'start-proxy-silent.vbs',
  'README.md',
  'MWESS_DESIGN.md',
  'AUDIT_REPAIR_PLAN.md',
  'UPGRADE_PLAN.md'
)

foreach ($f in $files) {
  $src = Join-Path $root $f
  if (Test-Path -LiteralPath $src) { Copy-Item -LiteralPath $src -Destination $stage }
}

foreach ($d in @('sources', 'docs', 'out_mwess')) {
  $src = Join-Path $root $d
  if (Test-Path -LiteralPath $src) { Copy-Item -LiteralPath $src -Destination $stage -Recurse }
}

Get-ChildItem -LiteralPath $stage -Recurse -File | Where-Object {
  $_.Name -like '*.log' -or $_.Name -eq '.env' -or $_.FullName -match '\\\.git\\'
} | Remove-Item -Force

New-Item -ItemType Directory -Path $outRoot -Force | Out-Null
if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -Force
Write-Output ('release: ' + $zip)
Write-Output ('excluded: .git, nssm, tests, scripts, out_audit, node_modules, *.zip')