# Migrate Roo Code conversation history into KitPilot. (Windows / PowerShell)
#
# Both extensions are forks of the same codebase, so their VS Code
# globalStorage layouts are identical: tasks\<uuid>\*.json plus a master
# tasks\_index.json. This script:
#
#   1) shows what would be imported, asks to confirm
#   2) backs up KitPilot storage to %USERPROFILE%\kitpilot-storage-backup-<ts>
#   3) copies any Roo task directories not already in KitPilot
#   4) merges the master _index.json (dedupes by id; KitPilot wins on conflict)
#
# Re-running is safe: already-imported tasks are skipped.
#
# IMPORTANT: Quit VS Code first. If it's open, KitPilot may rewrite
# _index.json on shutdown and undo the merge.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File .\scripts\migrate-from-roo.ps1
#
# Override the storage root with $env:KITPILOT_VSCODE_BASE if you run a
# non-default install (Insiders, portable, etc.).

#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

function Write-JsonNoBom {
    param([string]$Path, [string]$Content)
    # PowerShell 5.1's Set-Content/Out-File -Encoding utf8 writes a BOM, which
    # Node's JSON.parse (used by the extension) chokes on. Write raw UTF-8 instead.
    [System.IO.File]::WriteAllText($Path, $Content, [System.Text.UTF8Encoding]::new($false))
}

# --- 1. Locate storage roots ------------------------------------------------
$Base = if ($env:KITPILOT_VSCODE_BASE) {
    $env:KITPILOT_VSCODE_BASE
} else {
    Join-Path $env:APPDATA 'Code\User\globalStorage'
}

$Roo = Join-Path $Base 'rooveterinaryinc.roo-cline'
$Kp  = Join-Path $Base 'kitpilot.kit-pilot'

Write-Host "VS Code globalStorage: $Base"
Write-Host "  Roo Code: $Roo"
Write-Host "  KitPilot: $Kp"
Write-Host ""

# --- 2. Sanity checks -------------------------------------------------------
if (-not (Test-Path (Join-Path $Roo 'tasks'))) {
    Write-Host "No Roo Code tasks found at: $(Join-Path $Roo 'tasks')"
    Write-Host "Nothing to migrate."
    exit 0
}
if (-not (Test-Path $Kp)) {
    Write-Error "KitPilot storage not found at: $Kp`nInstall and launch KitPilot at least once before running this."
    exit 1
}

$KpTasks = Join-Path $Kp 'tasks'
New-Item -ItemType Directory -Path $KpTasks -Force | Out-Null
$KpIndex = Join-Path $KpTasks '_index.json'
if (-not (Test-Path $KpIndex)) {
    Write-JsonNoBom -Path $KpIndex -Content '{"version":1,"updatedAt":0,"entries":[]}'
}

# --- 3. Inventory -----------------------------------------------------------
$RooTaskDirs = @(Get-ChildItem -Path (Join-Path $Roo 'tasks') -Directory -ErrorAction SilentlyContinue)
if ($RooTaskDirs.Count -eq 0) {
    Write-Host "No Roo task directories found. Exiting."
    exit 0
}

$NewCount = 0
$SkipCount = 0
foreach ($t in $RooTaskDirs) {
    if (Test-Path (Join-Path $KpTasks $t.Name)) { $SkipCount++ } else { $NewCount++ }
}

Write-Host "Roo tasks total:        $($RooTaskDirs.Count)"
Write-Host "  new (will copy):      $NewCount"
Write-Host "  already in KitPilot:  $SkipCount (skip)"
Write-Host ""
Write-Host "Make sure VS Code is fully quit before continuing."
$reply = Read-Host "Proceed? (y/N)"
if ($reply -notmatch '^[Yy]$') {
    Write-Host "Cancelled."
    exit 0
}

# --- 4. Backup KitPilot storage --------------------------------------------
$Stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$Backup = Join-Path $env:USERPROFILE "kitpilot-storage-backup-$Stamp"
Write-Host ""
Write-Host "Backing up KitPilot storage -> $Backup"
Copy-Item -Path $Kp -Destination $Backup -Recurse

# --- 5. Copy missing task directories --------------------------------------
$copied = 0
foreach ($t in $RooTaskDirs) {
    $dest = Join-Path $KpTasks $t.Name
    if (Test-Path $dest) { continue }
    Copy-Item -Path $t.FullName -Destination $dest -Recurse
    $copied++
}
Write-Host "Copied $copied task directories."

# --- 6. Merge _index.json --------------------------------------------------
$RooIndex = Join-Path $Roo 'tasks\_index.json'
if (-not (Test-Path $RooIndex)) {
    Write-Host "Roo has no _index.json to merge. Task dirs were copied; KitPilot will rebuild the index on launch if needed."
    Write-Host "Done. Backup at: $Backup"
    exit 0
}

$KpIdx  = Get-Content $KpIndex  -Raw | ConvertFrom-Json
$RooIdx = Get-Content $RooIndex -Raw | ConvertFrom-Json

$AllEntries = @($KpIdx.entries) + @($RooIdx.entries)
# KitPilot entries come first in the array, so on duplicate id KitPilot wins.
$Deduped = @($AllEntries | Group-Object -Property id | ForEach-Object { $_.Group[0] })

$NowMs = [int64]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
$Merged = [pscustomobject]@{
    version   = 1
    updatedAt = $NowMs
    entries   = $Deduped
}

$json = $Merged | ConvertTo-Json -Depth 32
Write-JsonNoBom -Path $KpIndex -Content $json

Write-Host "Merged _index.json (now $($Deduped.Count) total entries)."
Write-Host ""
Write-Host "Done. Open KitPilot - your Roo tasks should appear in the history view."
Write-Host "If anything looks wrong, restore from: $Backup"
