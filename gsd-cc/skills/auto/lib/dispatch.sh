# GSD-CC auto-mode dispatch and cost helpers.

log_cost() {
  local unit="$1" phase="$2" result_file="$3"
  if [[ -f "$result_file" ]]; then
    jq -c --arg unit "$unit" --arg phase "$phase" --arg ts "$(iso_now)" \
      '{unit: $unit, phase: $phase, model: .model, usage: .usage, ts: $ts}' \
      "$result_file" >> "$COSTS_FILE" 2>/dev/null || true
  fi
}

dispatch_claude() {
  local prompt_file="$1" result_file="$2" allowed_tools="$3" max_turns="$4" timeout_secs="$5"
  local stderr_file
  stderr_file="$(runtime_tmp_file "gsd-stderr-$$.log")"

  timeout "$timeout_secs" "$CLAUDE_BIN" -p "$(cat "$prompt_file")" \
    --allowedTools "$allowed_tools" \
    --output-format json \
    --max-turns "$max_turns" > "$result_file" 2>"$stderr_file"
  local exit_code=$?

  # Append stderr to log if non-empty
  if [[ -s "$stderr_file" ]]; then
    log "stderr from claude -p:"
    cat "$stderr_file" >> "$LOG_FILE"
  fi

  return $exit_code
}
