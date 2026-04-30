# GSD-CC auto-mode runtime helpers.
# Sourced by auto-loop.sh; relies on the caller's strict Bash settings.

setup_timeout() {
  # ── macOS compatibility: timeout shim ─────────────────────────────────────────
  
  if ! command -v timeout &>/dev/null; then
    if command -v gtimeout &>/dev/null; then
      timeout() { gtimeout "$@"; }
    else
      # Fallback: warn and run without timeout protection
      echo "⚠ Neither 'timeout' nor 'gtimeout' found. Tasks will run without time limits."
      echo "  Install coreutils for timeout support: brew install coreutils"
      timeout() { shift; "$@"; }
    fi
  fi
}

resolve_claude_bin() {
  # ── Resolve claude CLI path ───────────────────────────────────────────────────
  
  CLAUDE_BIN="$(command -v claude 2>/dev/null || true)"
  if [[ -z "$CLAUDE_BIN" ]]; then
    # Common locations
    for p in "/opt/homebrew/bin/claude" "/usr/local/bin/claude" "$HOME/.claude/bin/claude"; do
      [[ -x "$p" ]] && CLAUDE_BIN="$p" && break
    done
  fi
  
  if [[ -z "$CLAUDE_BIN" ]]; then
    echo "❌ Auto-mode unavailable: claude CLI not found."
    echo "   Install Claude Code and ensure \`claude\` is in your PATH."
    exit 1
  fi
}

resolve_skills_dir() {
  if [[ -n "${GSD_CC_AUTO_PROMPTS_DIR:-}" ]]; then
    PROMPTS_DIR="$GSD_CC_AUTO_PROMPTS_DIR"
    SKILLS_DIR="$(cd "$PROMPTS_DIR/.." && pwd)"
  else
    SKILLS_DIR="$(cd "$AUTO_SCRIPT_DIR/.." && pwd)"
    PROMPTS_DIR="$AUTO_SCRIPT_DIR"
  fi

  if [[ ! -d "$PROMPTS_DIR" ]]; then
    echo "❌ GSD-CC skills not found. Run 'npx gsd-cc' to install."
    exit 1
  fi
}

require_auto_dependencies() {
  
  if ! command -v jq &>/dev/null; then
    echo "❌ Auto-mode unavailable: jq not found. Install with: brew install jq"
    echo "   If GSD-CC was installed without jq, rerun the installer to enable hooks."
    exit 1
  fi
  
  if ! command -v git &>/dev/null; then
    echo "❌ Auto-mode unavailable: git not found."
    echo "   Install Git and ensure \`git\` is in your PATH."
    exit 1
  fi
  
  if [[ ! -f "$GSD_DIR/STATE.md" ]]; then
    echo "❌ No .gsd/STATE.md found. Run /gsd-cc first to set up a project."
    exit 1
  fi
}

setup_logging() {
  
  # Tee all output to both stdout and log file. Tests can disable this because
  # some sandboxed shells disallow process substitution through /dev/fd.
  if [[ "${GSD_CC_DISABLE_TEE:-0}" != "1" ]]; then
    exec > >(tee -a "$LOG_FILE") 2>&1
  fi
}

iso_now() {
  if date -Iseconds >/dev/null 2>&1; then
    date -Iseconds
  else
    date '+%Y-%m-%dT%H:%M:%S%z'
  fi
}

runtime_tmp_dir() {
  local dir="${TMPDIR:-/tmp}"
  dir="${dir%/}"
  if [[ -z "$dir" ]]; then
    dir="/tmp"
  fi
  printf '%s\n' "$dir"
}

runtime_tmp_file() {
  local name="$1"
  printf '%s/%s\n' "$(runtime_tmp_dir)" "$name"
}

log() {
  echo "[$(iso_now)] $*"
}

cleanup() {
  rm -f "$LOCK_FILE"
  rm -rf "${LOCK_FILE}.d"
  rm -f "$(runtime_tmp_file "gsd-prompt-$$.txt")"
  rm -f "$(runtime_tmp_file "gsd-result-$$.json")"
  rm -f "$(runtime_tmp_file "gsd-stderr-$$.log")"
}

trim_whitespace() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

path_in_list() {
  local needle="$1"
  shift

  local candidate
  for candidate in "$@"; do
    [[ "$candidate" == "$needle" ]] && return 0
  done

  return 1
}

log_paths() {
  local path
  for path in "$@"; do
    log "   - $path"
  done
}

acquire_lock() {
  local lock_dir="${LOCK_FILE}.d"
  if ! mkdir "$lock_dir" 2>/dev/null; then
    # Lock exists — check if holder is still alive
    if [[ -f "$LOCK_FILE" ]]; then
      local lock_pid
      lock_pid=$(jq -r '.pid // empty' "$LOCK_FILE" 2>/dev/null || true)
      if [[ -n "$lock_pid" ]] && kill -0 "$lock_pid" 2>/dev/null; then
        echo "❌ Auto-mode is already running (PID $lock_pid)."
        exit 1
      fi
    fi
    # Stale lock — reclaim
    rm -rf "$lock_dir"
    mkdir "$lock_dir" 2>/dev/null || { echo "❌ Could not acquire lock."; exit 1; }
  fi
  echo "{\"unit\":\"${SLICE:-init}/${TASK:-init}\",\"phase\":\"${PHASE:-init}\",\"pid\":$$,\"started\":\"$(iso_now)\"}" > "$LOCK_FILE"
}

release_lock() {
  rm -f "$LOCK_FILE"
  rm -rf "${LOCK_FILE}.d"
}
