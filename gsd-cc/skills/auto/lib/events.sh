# GSD-CC auto-mode event journal helpers.
# Sourced by auto-loop.sh; every function must be safe under strict Bash.

auto_event_now() {
  if declare -F iso_now >/dev/null 2>&1; then
    iso_now 2>/dev/null || true
    return 0
  fi

  if date -Iseconds >/dev/null 2>&1; then
    date -Iseconds 2>/dev/null || true
    return 0
  fi

  date '+%Y-%m-%dT%H:%M:%S%z' 2>/dev/null || true
}

auto_event_trim_left() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  printf '%s' "$value"
}

auto_event_read_state_field() {
  local field="$1"
  local state_file="${GSD_DIR:-.gsd}/STATE.md"
  local line
  local value

  [[ -f "$state_file" ]] || return 0

  while IFS= read -r line || [[ -n "$line" ]]; do
    case "$line" in
      "$field:"*)
        value="${line#"$field:"}"
        auto_event_trim_left "$value"
        return 0
        ;;
    esac
  done < "$state_file" 2>/dev/null || true

  return 0
}

auto_event_context_value() {
  local variable_name="$1"
  local state_field="$2"
  local value="${!variable_name:-}"

  if [[ -z "$value" ]]; then
    value="$(auto_event_read_state_field "$state_field")"
  fi

  printf '%s' "$value"
}

auto_event_json_escape() {
  local value="${1:-}"
  local escaped=""
  local char
  local code
  local index
  local LC_CTYPE=C

  for ((index = 0; index < ${#value}; index += 1)); do
    char="${value:index:1}"

    case "$char" in
      '"') escaped="${escaped}\\\"" ;;
      "\\") escaped="${escaped}\\\\" ;;
      $'\b') escaped="${escaped}\\b" ;;
      $'\f') escaped="${escaped}\\f" ;;
      $'\n') escaped="${escaped}\\n" ;;
      $'\r') escaped="${escaped}\\r" ;;
      $'\t') escaped="${escaped}\\t" ;;
      *)
        printf -v code '%d' "'$char"
        if [[ "$code" -lt 32 ]]; then
          printf -v char '\\u%04x' "$code"
        fi
        escaped="${escaped}${char}"
        ;;
    esac
  done

  printf '%s' "$escaped"
}

auto_event_json_pair() {
  local key="$1"
  local value="$2"

  printf '"%s":"%s"' \
    "$(auto_event_json_escape "$key")" \
    "$(auto_event_json_escape "$value")"
}

auto_event_write() {
  local type="${1:-}"
  local message="${2:-}"
  local gsd_dir="${GSD_DIR:-.gsd}"
  local events_path="${gsd_dir}/events.jsonl"
  local timestamp
  local milestone
  local slice
  local task
  local phase
  local json
  local pair
  local key
  local value

  if [[ -z "$type" ]]; then
    return 0
  fi

  if [[ $# -gt 0 ]]; then
    shift
  fi
  if [[ $# -gt 0 ]]; then
    shift
  fi

  timestamp="$(auto_event_now)"
  milestone="$(auto_event_context_value "MILESTONE" "milestone")"
  slice="$(auto_event_context_value "SLICE" "current_slice")"
  task="$(auto_event_context_value "TASK" "current_task")"
  phase="$(auto_event_context_value "PHASE" "phase")"

  json="{"
  json="${json}$(auto_event_json_pair "timestamp" "$timestamp")"
  json="${json},$(auto_event_json_pair "type" "$type")"
  json="${json},$(auto_event_json_pair "milestone" "$milestone")"
  json="${json},$(auto_event_json_pair "slice" "$slice")"
  json="${json},$(auto_event_json_pair "task" "$task")"
  json="${json},$(auto_event_json_pair "phase" "$phase")"
  json="${json},$(auto_event_json_pair "message" "$message")"

  for pair in "$@"; do
    key="${pair%%=*}"
    value="${pair#*=}"

    if [[ "$pair" != *"="* || -z "$key" || "$key" == *[!A-Za-z0-9_]* ]]; then
      continue
    fi

    json="${json},$(auto_event_json_pair "$key" "$value")"
  done

  json="${json}}"

  mkdir -p "$gsd_dir" 2>/dev/null || return 0
  printf '%s\n' "$json" >> "$events_path" 2>/dev/null || return 0

  return 0
}
