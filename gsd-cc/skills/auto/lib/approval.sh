# GSD-CC auto-mode approval policy helpers.

APPROVAL_DEFAULT_PATHS=(
  "package.json"
  "package-lock.json"
  "pnpm-lock.yaml"
  "yarn.lock"
  ".github/workflows/*"
  "migrations/*"
  "db/migrations/*"
  "prisma/migrations/*"
)

APPROVAL_DEFAULT_TERMS=(
  "auth"
  "billing"
  "payment"
  "secret"
  "token"
  "deployment"
)

risk_level_value() {
  case "$1" in
    low) echo 1 ;;
    medium) echo 2 ;;
    high) echo 3 ;;
    none) echo 99 ;;
    *) return 1 ;;
  esac
}

approval_required_risk_threshold() {
  local threshold
  threshold=$(trim_whitespace "$(read_config_field "approval_required_risk")")
  [[ -z "$threshold" ]] && threshold="high"

  case "$threshold" in
    low|medium|high|none)
      printf '%s\n' "$threshold"
      ;;
    *)
      fail_validation "Invalid approval_required_risk: $threshold" \
        "Use low, medium, high, or none in .gsd/CONFIG.md."
      ;;
  esac
}

split_config_list() {
  local raw="$1"
  local entry
  local entries=()

  IFS=',' read -r -a entries <<< "$raw"
  for entry in "${entries[@]}"; do
    entry=$(trim_whitespace "$entry")
    [[ -n "$entry" ]] && printf '%s\n' "$entry"
  done
}

approval_path_patterns() {
  printf '%s\n' "${APPROVAL_DEFAULT_PATHS[@]}"
  split_config_list "$(read_config_field "approval_required_paths")"
}

approval_terms() {
  printf '%s\n' "${APPROVAL_DEFAULT_TERMS[@]}"
  split_config_list "$(read_config_field "approval_required_terms")"
}

path_matches_approval_pattern() {
  local path="$1"
  local pattern="$2"

  [[ "$path" == $pattern ]]
}

task_plan_fingerprint() {
  local plan_path="$1"

  cksum "$plan_path" | awk '{ print $1 ":" $2 }'
}

regex_escape_ere() {
  printf '%s' "$1" | sed -E 's/[][(){}.^$*+?|\\]/\\&/g'
}

json_value_pattern() {
  regex_escape_ere "$(json_escape "$1")"
}

approval_request_matches_current_task() {
  local slice="$1"
  local task="$2"
  local request="$GSD_DIR/APPROVAL-REQUEST.json"
  local slice_pattern
  local task_pattern

  [[ -f "$request" ]] || return 1

  slice_pattern=$(json_value_pattern "$slice")
  task_pattern=$(json_value_pattern "$task")
  grep -Eq "\"slice\"[[:space:]]*:[[:space:]]*\"$slice_pattern\"" "$request" &&
    grep -Eq "\"task\"[[:space:]]*:[[:space:]]*\"$task_pattern\"" "$request"
}

clear_current_approval_request() {
  local slice="$1"
  local task="$2"

  if approval_request_matches_current_task "$slice" "$task"; then
    rm -f "$GSD_DIR/APPROVAL-REQUEST.json"
  fi
}

approval_grant_exists() {
  local slice="$1"
  local task="$2"
  local fingerprint="$3"
  local line
  local fingerprint_pattern
  local slice_pattern
  local task_pattern

  [[ -f "$GSD_DIR/APPROVALS.jsonl" ]] || return 1

  slice_pattern=$(json_value_pattern "$slice")
  task_pattern=$(json_value_pattern "$task")
  fingerprint_pattern=$(json_value_pattern "$fingerprint")

  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    if ! printf '%s\n' "$line" | grep -Eq "\"slice\"[[:space:]]*:[[:space:]]*\"$slice_pattern\""; then
      continue
    fi
    if ! printf '%s\n' "$line" | grep -Eq "\"task\"[[:space:]]*:[[:space:]]*\"$task_pattern\""; then
      continue
    fi
    if ! printf '%s\n' "$line" | grep -Eq "\"fingerprint\"[[:space:]]*:[[:space:]]*\"$fingerprint_pattern\""; then
      continue
    fi
    if printf '%s\n' "$line" | grep -Eq "\"status\"[[:space:]]*:" &&
       ! printf '%s\n' "$line" | grep -Eq "\"status\"[[:space:]]*:[[:space:]]*\"approved\""; then
      continue
    fi
    return 0
  done < "$GSD_DIR/APPROVALS.jsonl"

  return 1
}

approval_record_exists_for_task() {
  local slice="$1"
  local task="$2"
  local line
  local slice_pattern
  local task_pattern

  [[ -f "$GSD_DIR/APPROVALS.jsonl" ]] || return 1

  slice_pattern=$(json_value_pattern "$slice")
  task_pattern=$(json_value_pattern "$task")

  while IFS= read -r line; do
    [[ -z "$line" ]] && continue
    if printf '%s\n' "$line" | grep -Eq "\"slice\"[[:space:]]*:[[:space:]]*\"$slice_pattern\"" &&
       printf '%s\n' "$line" | grep -Eq "\"task\"[[:space:]]*:[[:space:]]*\"$task_pattern\""; then
      return 0
    fi
  done < "$GSD_DIR/APPROVALS.jsonl"

  return 1
}

approval_status_for_task() {
  local slice="$1"
  local task="$2"
  local fingerprint="$3"

  if approval_grant_exists "$slice" "$task" "$fingerprint"; then
    printf '%s\n' "approved"
    return 0
  fi

  if approval_record_exists_for_task "$slice" "$task"; then
    printf '%s\n' "stale"
    return 0
  fi

  printf '%s\n' "missing"
}

json_escape() {
  printf '%s' "$1" | sed -E 's/\\/\\\\/g; s/"/\\"/g'
}

write_approval_request() {
  local slice="$1"
  local task="$2"
  local plan_path="$3"
  local risk_level="$4"
  local risk_reason="$5"
  local fingerprint="$6"
  shift 6

  local tmp_file
  tmp_file="$(mktemp "$GSD_DIR/APPROVAL-REQUEST.json.XXXXXX")"

  if ! {
    printf '{\n'
    printf '  "slice": "%s",\n' "$(json_escape "$slice")"
    printf '  "task": "%s",\n' "$(json_escape "$task")"
    printf '  "plan": "%s",\n' "$(json_escape "$plan_path")"
    printf '  "risk_level": "%s",\n' "$(json_escape "$risk_level")"
    printf '  "risk_reason": "%s",\n' "$(json_escape "$risk_reason")"
    printf '  "fingerprint": "%s",\n' "$(json_escape "$fingerprint")"
    printf '  "reasons": [\n'
    local index=0
    local reason
    for reason in "$@"; do
      if [[ "$index" -gt 0 ]]; then
        printf ',\n'
      fi
      printf '    "%s"' "$(json_escape "$reason")"
      index=$((index + 1))
    done
    printf '\n  ],\n'
    printf '  "created_at": "%s"\n' "$(iso_now)"
    printf '}\n'
  } > "$tmp_file"; then
    rm -f "$tmp_file"
    return 1
  fi

  mv "$tmp_file" "$GSD_DIR/APPROVAL-REQUEST.json" || {
    rm -f "$tmp_file"
    return 1
  }
}

ensure_apply_approval() {
  local slice="$1"
  local task="$2"
  local plan_path="$3"
  local risk_level
  local risk_reason
  local threshold
  local threshold_value
  local risk_value
  local fingerprint
  local task_text
  local file_path
  local pattern
  local term
  local reasons_summary
  local reasons=()

  risk_level=$(extract_xml_attr "$plan_path" "risk" "level")
  risk_reason=$(extract_xml_block "$plan_path" "risk" | tr '\n' ' ' | sed -E 's/[[:space:]]+/ /g')
  risk_reason=$(trim_whitespace "$risk_reason")
  threshold=$(approval_required_risk_threshold)
  threshold_value=$(risk_level_value "$threshold")
  risk_value=$(risk_level_value "$risk_level")
  fingerprint=$(task_plan_fingerprint "$plan_path")

  if [[ "$threshold" != "none" && "$risk_value" -ge "$threshold_value" ]]; then
    reasons+=("risk $risk_level meets approval_required_risk $threshold")
  fi

  while IFS= read -r file_path; do
    [[ -z "$file_path" ]] && continue
    while IFS= read -r pattern; do
      [[ -z "$pattern" ]] && continue
      if path_matches_approval_pattern "$file_path" "$pattern"; then
        reasons+=("file $file_path matches approval path $pattern")
      fi
    done < <(approval_path_patterns)
  done < <(parse_task_plan_files "$plan_path")

  task_text=$(
    {
      extract_task_name "$plan_path"
      parse_task_plan_files "$plan_path"
      extract_xml_block "$plan_path" "action"
      extract_xml_block "$plan_path" "risk"
    } | tr '[:upper:]' '[:lower:]'
  )

  while IFS= read -r term; do
    [[ -z "$term" ]] && continue
    if printf '%s\n' "$task_text" | grep -Fq "$(printf '%s' "$term" | tr '[:upper:]' '[:lower:]')"; then
      reasons+=("term $term appears in task plan")
    fi
  done < <(approval_terms)

  if [[ ${#reasons[@]} -eq 0 ]]; then
    clear_current_approval_request "$slice" "$task"
    return 0
  fi

  if approval_grant_exists "$slice" "$task" "$fingerprint"; then
    log "✓ Approval found for ${slice}/${task}."
    if declare -F auto_event_approval_found >/dev/null 2>&1; then
      reasons_summary="$(auto_event_join_values "${reasons[@]}")"
      auto_event_approval_found \
        "task_plan=$plan_path" \
        "approval_log=$GSD_DIR/APPROVALS.jsonl" \
        "risk_level=$risk_level" \
        "risk_reason=$risk_reason" \
        "fingerprint=$fingerprint" \
        "reasons=$reasons_summary"
    fi
    clear_current_approval_request "$slice" "$task"
    return 0
  fi

  write_approval_request "$slice" "$task" "$plan_path" "$risk_level" "$risk_reason" "$fingerprint" "${reasons[@]}"
  if declare -F auto_event_approval_required >/dev/null 2>&1; then
    reasons_summary="$(auto_event_join_values "${reasons[@]}")"
    auto_event_approval_required \
      "task_plan=$plan_path" \
      "request=$GSD_DIR/APPROVAL-REQUEST.json" \
      "artifact=$GSD_DIR/APPROVAL-REQUEST.json" \
      "risk_level=$risk_level" \
      "risk_reason=$risk_reason" \
      "fingerprint=$fingerprint" \
      "reasons=$reasons_summary"
  fi
  log "🛑 Approval required before auto-mode can run ${slice}/${task}."
  log "   Request: $GSD_DIR/APPROVAL-REQUEST.json"
  log_paths "${reasons[@]}"
  return 1
}
