#!/usr/bin/env bash
# Migrate Roo Code conversation history into KitPilot.
#
# Both extensions are forks of the same codebase, so their VS Code
# globalStorage layouts are identical: tasks/<uuid>/*.json plus a master
# tasks/_index.json. This script:
#
#   1) detects the right storage path for your OS (macOS / Linux / WSL)
#   2) shows you what would be imported, asks to confirm
#   3) backs up KitPilot storage to ~/kitpilot-storage-backup-<timestamp>
#   4) copies any Roo task directories not already in KitPilot
#   5) merges the master _index.json (dedupes by id; KitPilot wins on conflict)
#
# Re-running is safe: tasks already imported are skipped.
#
# IMPORTANT: Quit VS Code first. If it's open, KitPilot may rewrite
# _index.json on shutdown and undo the merge.

set -euo pipefail

# --- 1. Detect platform & storage root --------------------------------------
# Override with KITPILOT_VSCODE_BASE for non-default installs (Insiders,
# portable, WSL reaching into the Windows filesystem at /mnt/c/..., etc.)
if [ -n "${KITPILOT_VSCODE_BASE:-}" ]; then
    BASE="$KITPILOT_VSCODE_BASE"
else
    case "$(uname -s)" in
        Darwin) BASE="$HOME/Library/Application Support/Code/User/globalStorage" ;;
        Linux)  BASE="$HOME/.config/Code/User/globalStorage" ;;
        MINGW*|MSYS*|CYGWIN*) BASE="${APPDATA:-$HOME/AppData/Roaming}/Code/User/globalStorage" ;;
        *) echo "Unsupported OS: $(uname -s). Set KITPILOT_VSCODE_BASE and re-run." >&2; exit 1 ;;
    esac
fi

ROO="$BASE/rooveterinaryinc.roo-cline"
KP="$BASE/kitpilot.kit-pilot"

echo "VS Code globalStorage: $BASE"
echo "  Roo Code:  $ROO"
echo "  KitPilot:  $KP"
echo

# --- 2. Sanity checks -------------------------------------------------------
if ! command -v jq >/dev/null 2>&1; then
    echo "jq is required (used to merge _index.json safely)." >&2
    echo "  macOS:  brew install jq" >&2
    echo "  Debian: sudo apt install jq" >&2
    exit 1
fi

if [ ! -d "$ROO/tasks" ]; then
    echo "No Roo Code tasks found at: $ROO/tasks"
    echo "Nothing to migrate."
    exit 0
fi

if [ ! -d "$KP" ]; then
    echo "KitPilot storage not found at: $KP"
    echo "Install and launch KitPilot at least once before running this."
    exit 1
fi

mkdir -p "$KP/tasks"
[ -f "$KP/tasks/_index.json" ] || echo '{"version":1,"updatedAt":0,"entries":[]}' > "$KP/tasks/_index.json"

# --- 3. Inventory -----------------------------------------------------------
shopt -s nullglob
ROO_TASKS=( "$ROO/tasks"/*/ )
shopt -u nullglob

if [ ${#ROO_TASKS[@]} -eq 0 ]; then
    echo "No Roo task directories found. Exiting."
    exit 0
fi

NEW_COUNT=0
SKIP_COUNT=0
for task in "${ROO_TASKS[@]}"; do
    task_id=$(basename "$task")
    if [ -d "$KP/tasks/$task_id" ]; then
        SKIP_COUNT=$((SKIP_COUNT + 1))
    else
        NEW_COUNT=$((NEW_COUNT + 1))
    fi
done

echo "Roo tasks total:        ${#ROO_TASKS[@]}"
echo "  new (will copy):      $NEW_COUNT"
echo "  already in KitPilot:  $SKIP_COUNT (skip)"
echo

if [ $NEW_COUNT -eq 0 ]; then
    echo "Nothing new to copy. _index.json will still be merged in case of drift."
fi

echo "Make sure VS Code is fully quit before continuing."
read -p "Proceed? (y/N) " -n 1 -r REPLY
echo
[[ ! $REPLY =~ ^[Yy]$ ]] && { echo "Cancelled."; exit 0; }

# --- 4. Backup KitPilot storage ---------------------------------------------
BACKUP="$HOME/kitpilot-storage-backup-$(date +%Y%m%d-%H%M%S)"
echo
echo "Backing up KitPilot storage → $BACKUP"
cp -R "$KP" "$BACKUP"

# --- 5. Copy task directories -----------------------------------------------
copied=0
for task in "${ROO_TASKS[@]}"; do
    task_id=$(basename "$task")
    [ -d "$KP/tasks/$task_id" ] && continue
    cp -R "$task" "$KP/tasks/"
    copied=$((copied + 1))
done
echo "Copied $copied task directories."

# --- 6. Merge _index.json ---------------------------------------------------
TMP=$(mktemp)
jq -s '{
    version: 1,
    updatedAt: (now * 1000 | floor),
    entries: (.[0].entries + .[1].entries | unique_by(.id))
}' "$KP/tasks/_index.json" "$ROO/tasks/_index.json" > "$TMP"
mv "$TMP" "$KP/tasks/_index.json"

TOTAL=$(jq '.entries | length' "$KP/tasks/_index.json")
echo "Merged _index.json (now $TOTAL total entries)."

echo
echo "Done. Open KitPilot — your Roo tasks should appear in the history view."
echo "If anything looks wrong, restore from: $BACKUP"
