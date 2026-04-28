# GSD-CC auto-mode state helpers.

read_state_field() {
  grep "^$1:" "$GSD_DIR/STATE.md" | head -1 | sed "s/^$1:[[:space:]]*//"
}

read_optional_state_field() {
  grep "^$1:" "$GSD_DIR/STATE.md" | head -1 | sed "s/^$1:[[:space:]]*//" || true
}

update_state_field() {
  local field="$1" value="$2"
  local tmp_file
  if grep -q "^${field}:" "$GSD_DIR/STATE.md"; then
    tmp_file="${GSD_DIR}/.STATE.md.$$"
    awk -v field="$field" -v value="$value" '
      $0 ~ "^" field ":" {
        print field ": " value
        next
      }
      { print }
    ' "$GSD_DIR/STATE.md" > "$tmp_file"
    mv "$tmp_file" "$GSD_DIR/STATE.md"
  fi
}

upsert_state_field() {
  local field="$1" value="$2"
  local tmp_file

  if grep -q "^${field}:" "$GSD_DIR/STATE.md"; then
    update_state_field "$field" "$value"
    return
  fi

  tmp_file="${GSD_DIR}/.STATE.md.$$"
  awk -v field="$field" -v value="$value" '
    BEGIN { inserted = 0 }
    /^state_schema_version:/ && !inserted {
      print
      print field ": " value
      inserted = 1
      next
    }
    /^milestone:/ && !inserted {
      print field ": " value
      inserted = 1
    }
    /^---$/ && NR > 1 && !inserted {
      print field ": " value
      inserted = 1
    }
    { print }
    END {
      if (!inserted) {
        print field ": " value
      }
    }
  ' "$GSD_DIR/STATE.md" > "$tmp_file"
  mv "$tmp_file" "$GSD_DIR/STATE.md"
}

fail_validation() {
  local message="$1" hint="${2:-}"
  local recovery_message="$message"
  log "❌ $message"
  if [[ -n "$hint" ]]; then
    log "   $hint"
    recovery_message="$message $hint"
  fi
  if declare -F auto_recovery_write >/dev/null 2>&1; then
    auto_recovery_write "validation_failed" "$recovery_message" \
      "Fix the validation issue above, then run /gsd-cc."
  fi
  exit 1
}

state_machine_path() {
  local script_dir
  script_dir="${AUTO_SCRIPT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"

  local candidates=(
    ".claude/templates/STATE_MACHINE.json"
    "$HOME/.claude/templates/STATE_MACHINE.json"
    "$script_dir/../../templates/STATE_MACHINE.json"
    "gsd-cc/templates/STATE_MACHINE.json"
  )
  local candidate

  for candidate in "${candidates[@]}"; do
    if [[ -f "$candidate" ]]; then
      printf '%s\n' "$candidate"
      return 0
    fi
  done

  return 1
}

load_phase_spec() {
  local phase="$1"
  jq -e --arg phase "$phase" '.phases[$phase] // empty' "$STATE_MACHINE_FILE" >/dev/null
}

state_field_is_empty() {
  local value
  local empty_value
  value=$(trim_whitespace "${1:-}")

  while IFS= read -r empty_value; do
    if [[ "$value" == "$empty_value" ]]; then
      return 0
    fi
  done < <(jq -r '.emptyValues[]' "$STATE_MACHINE_FILE")

  return 1
}

normalize_auto_scope() {
  local raw
  raw="$1"

  case "$raw" in
    ""|"slice") echo "slice" ;;
    "milestone") echo "milestone" ;;
    *) return 1 ;;
  esac
}

slice_plan_path() {
  local slice="$1"
  echo "$GSD_DIR/${slice}-PLAN.md"
}

task_plan_xml_path() {
  local slice="$1" task="$2"
  echo "$GSD_DIR/${slice}-${task}-PLAN.xml"
}

find_matching_files() {
  local pattern="$1"
  compgen -G "$pattern" || true
}

require_file() {
  local path="$1" label="$2" hint="$3"
  if [[ ! -f "$path" ]]; then
    fail_validation "Missing ${label}: $path" "$hint"
  fi
}

require_matching_files() {
  local pattern="$1" label="$2" hint="$3"
  if ! compgen -G "$pattern" > /dev/null; then
    fail_validation "Missing ${label} matching: $pattern" "$hint"
  fi
}

assert_no_legacy_task_plan_markdown() {
  local slice="$1"
  local hint="Run /gsd-cc-plan to regenerate XML task plans before restarting auto-mode."
  local legacy_files=()
  local legacy_file

  while IFS= read -r legacy_file; do
    [[ -z "$legacy_file" ]] && continue
    legacy_files+=("$legacy_file")
  done < <(find_matching_files "$GSD_DIR/${slice}-T*-PLAN.md")

  if [[ ${#legacy_files[@]} -gt 0 ]]; then
    fail_validation "Legacy task plan detected: ${legacy_files[0]}" "$hint"
  fi
}

assert_no_legacy_task_plan_for_phase() {
  local phase="$1"
  local slice

  case "$phase" in
    roadmap-complete|discuss-complete|plan|plan-complete|applying|apply-complete)
      slice=$(read_optional_state_field "current_slice")
      if ! state_field_is_empty "$slice"; then
        assert_no_legacy_task_plan_markdown "$slice"
      fi
      ;;
  esac
}

validate_auto_task_plans_for_phase() {
  local phase="$1"
  local slice

  case "$phase" in
    plan-complete|applying|apply-complete)
      slice=$(read_optional_state_field "current_slice")
      if ! state_field_is_empty "$slice"; then
        validate_task_plans_for_auto_mode "$slice"
      fi
      ;;
  esac
}

expand_artifact_template() {
  local template="$1"
  local expanded="$template"
  local field
  local value

  while [[ "$expanded" =~ \{([A-Za-z0-9_]+)\} ]]; do
    field="${BASH_REMATCH[1]}"
    value=$(read_optional_state_field "$field")
    expanded="${expanded//\{$field\}/$value}"
  done

  printf '%s\n' "$expanded"
}

validate_phase_fields() {
  local phase="$1"
  local field
  local value

  if ! load_phase_spec "$phase"; then
    fail_validation "Unknown STATE.md phase: ${phase:-missing}" \
      "Run /gsd-cc to repair project state before restarting auto-mode."
  fi

  while IFS= read -r field; do
    [[ -z "$field" ]] && continue
    value=$(read_optional_state_field "$field")
    if state_field_is_empty "$value"; then
      fail_validation "STATE.md phase '$phase' is missing required field: $field" \
        "Update .gsd/STATE.md or rerun the phase that owns '$field'."
    fi
  done < <(jq -r --arg phase "$phase" '.phases[$phase].requiredFields[]?' "$STATE_MACHINE_FILE")
}

validate_phase_artifacts() {
  local phase="$1"
  local artifact_template
  local artifact_pattern
  local hint="Run /gsd-cc to repair project state before restarting auto-mode."

  while IFS= read -r artifact_template; do
    [[ -z "$artifact_template" ]] && continue
    artifact_pattern=$(expand_artifact_template "$artifact_template")

    if [[ "$artifact_pattern" == *"*"* ]]; then
      require_matching_files "$artifact_pattern" "state artifact for phase '$phase'" "$hint"
    else
      require_file "$artifact_pattern" "state artifact for phase '$phase'" "$hint"
    fi
  done < <(jq -r --arg phase "$phase" '.phases[$phase].requiredArtifacts[]?' "$STATE_MACHINE_FILE")

  assert_no_legacy_task_plan_for_phase "$phase"
  validate_auto_task_plans_for_phase "$phase"
}

validate_phase_transition() {
  local from_phase="$1" to_phase="$2"

  if [[ "$from_phase" == "$to_phase" ]]; then
    return 0
  fi

  if ! load_phase_spec "$from_phase"; then
    fail_validation "Unknown previous phase: ${from_phase:-missing}" \
      "Run /gsd-cc to repair project state before restarting auto-mode."
  fi

  if ! load_phase_spec "$to_phase"; then
    fail_validation "Unknown next phase: ${to_phase:-missing}" \
      "Run /gsd-cc to repair project state before restarting auto-mode."
  fi

  if ! jq -e --arg from "$from_phase" --arg to "$to_phase" \
    '.phases[$from].next | index($to)' "$STATE_MACHINE_FILE" >/dev/null; then
    fail_validation "Illegal phase transition: $from_phase -> $to_phase" \
      "Run /gsd-cc to inspect the current state before auto-mode continues."
  fi
}

validate_current_state() {
  local previous_phase="${1:-}"
  local phase

  phase=$(read_optional_state_field "phase")
  validate_phase_fields "$phase"
  validate_phase_artifacts "$phase"

  if [[ -n "$previous_phase" ]]; then
    validate_phase_transition "$previous_phase" "$phase"
  fi
}

transition_phase() {
  local from_phase="$1" to_phase="$2"
  validate_phase_transition "$from_phase" "$to_phase"
  update_state_field "phase" "$to_phase"
  update_state_field "last_updated" "$(iso_now)"
}

ensure_auto_phase_ready() {
  local phase="$1"

  case "$phase" in
    seed|seed-complete|stack-complete)
      fail_validation "Auto-mode cannot run before a roadmap and active slice are ready." \
        "Run /gsd-cc to create the roadmap, then start auto-mode from a planning or execution phase."
      ;;
    milestone-complete)
      fail_validation "Auto-mode cannot run because the milestone is already complete." \
        "Run /gsd-cc to choose the next project action."
      ;;
  esac
}

read_config_field() {
  local field="$1"

  if [[ ! -f "$GSD_DIR/CONFIG.md" ]]; then
    return 0
  fi

  grep "^$field:" "$GSD_DIR/CONFIG.md" | head -1 | sed "s/^$field:[[:space:]]*//" || true
}

find_next_slice() {
  local roadmap
  roadmap=$(ls "$GSD_DIR"/M*-ROADMAP.md 2>/dev/null | head -1)
  if [[ -z "$roadmap" ]]; then
    return
  fi

  # Extract slice IDs from roadmap (### S01, ### S02, etc.)
  grep -oE '### S[0-9]+' "$roadmap" | sed 's/### //' | while read -r slice; do
    if [[ ! -f "$GSD_DIR/${slice}-UNIFY.md" ]]; then
      echo "$slice"
      return
    fi
  done
}
