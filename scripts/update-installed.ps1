# Gera o instalador NSIS e atualiza a cópia instalada do Prism Radial (instalação por usuário).
# Uso: pwsh -File scripts/update-installed.ps1 [-SkipBuild]
param([switch]$SkipBuild)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$installDir = Join-Path $env:LOCALAPPDATA 'Prism Radial'
$installedExe = Join-Path $installDir 'prism-radial.exe'

if (-not $SkipBuild) {
    Push-Location $root
    try {
        npx tauri build --bundles nsis
        if ($LASTEXITCODE -ne 0) { throw "tauri build falhou ($LASTEXITCODE)" }
    } finally { Pop-Location }
}

$setup = Get-ChildItem (Join-Path $root 'src-tauri\target\release\bundle\nsis') -Filter '*-setup.exe' |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $setup) { throw 'instalador não encontrado em bundle\nsis' }
Write-Host "Instalador: $($setup.FullName)"

# Fecha qualquer Prism aberto (instalado ou release), senão a instância única atrapalha e o exe fica travado.
$procs = Get-Process prism-radial -ErrorAction SilentlyContinue
foreach ($p in $procs) {
    Write-Host "Encerrando prism-radial pid $($p.Id) ($($p.Path))"
    $p.CloseMainWindow() | Out-Null
}
Start-Sleep -Milliseconds 800
Get-Process prism-radial -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Milliseconds 500

$p = Start-Process -FilePath $setup.FullName -ArgumentList '/S' -Wait -PassThru
if ($p.ExitCode -ne 0) { throw "instalador saiu com código $($p.ExitCode)" }
if (-not (Test-Path $installedExe)) { throw "exe instalado não encontrado: $installedExe" }

$v = (Get-Item $installedExe).VersionInfo.ProductVersion
Write-Host "Instalado: $installedExe (versão $v, modificado $((Get-Item $installedExe).LastWriteTime))"
Start-Process -FilePath $installedExe
Start-Sleep -Seconds 3
$running = Get-Process prism-radial -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq $installedExe }
if ($running) { Write-Host "OK: Prism Radial instalado em execução (pid $($running.Id -join ','))" }
else { throw 'Prism Radial instalado não ficou em execução' }
