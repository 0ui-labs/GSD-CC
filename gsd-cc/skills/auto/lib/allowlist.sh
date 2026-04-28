# GSD-CC auto-mode tool allowlist helpers.

join_by_comma() {
  local IFS=,
  printf '%s\n' "$*"
}

add_apply_bash_pattern() {
  local pattern
  local tool

  pattern=$(trim_whitespace "${1:-}")
  [[ -z "$pattern" ]] && return 0

  case "$pattern" in
    *"Bash("*|*")"*) return 0 ;;
  esac

  tool="Bash($pattern)"
  if [[ ${#APPLY_ALLOWED_BASH_TOOLS[@]} -eq 0 ]] || ! path_in_list "$tool" "${APPLY_ALLOWED_BASH_TOOLS[@]}"; then
    APPLY_ALLOWED_BASH_TOOLS+=("$tool")
    APPLY_ALLOWED_BASH_PATTERNS+=("$pattern")
  fi
}

safe_command_token() {
  [[ "$1" =~ ^[A-Za-z0-9_./@:+%=-]+$ ]]
}

add_exact_and_wildcard_apply_pattern() {
  local pattern

  pattern=$(trim_whitespace "$1")
  [[ -z "$pattern" ]] && return 0

  add_apply_bash_pattern "$pattern"
  add_apply_bash_pattern "$pattern *"
}

extract_first_verify_command() {
  local plan_path="$1"
  local command

  [[ -f "$plan_path" ]] || return 0

  command=$(
    awk '
      /<verify>/ {
        in_verify = 1
        sub(/^.*<verify>/, "")
      }
      in_verify {
        if (/<\/verify>/) {
          sub(/<\/verify>.*/, "")
          print
          exit
        }
        print
      }
    ' "$plan_path" | tr '\n' ' ' | sed -E 's/[[:space:]]+/ /g'
  )
  command=$(trim_whitespace "$command")
  command=$(printf '%s\n' "$command" | sed -E 's/[[:space:]]+\([^)]*AC-[^)]*\)[[:space:]]*$//')
  trim_whitespace "$command"
}

add_verify_bash_patterns() {
  local plan_path="$1"
  local command
  local first
  local second
  local third

  command=$(extract_first_verify_command "$plan_path")
  [[ -z "$command" ]] && return 0

  case "$command" in
    *"&&"*|*"||"*|*";"*|*"|"*) return 0 ;;
  esac

  set -- $command
  first="${1:-}"
  second="${2:-}"
  third="${3:-}"

  case "$first" in
    npm|pnpm|yarn)
      case "$second" in
        test)
          add_exact_and_wildcard_apply_pattern "$first test"
          ;;
        run)
          if safe_command_token "$third"; then
            add_exact_and_wildcard_apply_pattern "$first run $third"
          fi
          ;;
      esac
      ;;
    node|python3)
      if safe_command_token "$second" && [[ "$second" != -* ]]; then
        add_exact_and_wildcard_apply_pattern "$first $second"
      fi
      ;;
    pytest)
      add_exact_and_wildcard_apply_pattern "pytest"
      ;;
    cargo)
      if [[ "$second" == "test" ]]; then
        add_exact_and_wildcard_apply_pattern "cargo test"
      fi
      ;;
    go)
      if [[ "$second" == "test" ]]; then
        add_exact_and_wildcard_apply_pattern "go test"
      fi
      ;;
    make)
      if safe_command_token "$second"; then
        add_exact_and_wildcard_apply_pattern "make $second"
      fi
      ;;
  esac
}

add_config_bash_patterns() {
  local raw
  local entry
  local entries=()

  raw=$(read_config_field "auto_apply_allowed_bash")
  [[ -z "$raw" ]] && return 0

  IFS=',' read -r -a entries <<< "$raw"
  for entry in "${entries[@]}"; do
    add_apply_bash_pattern "$entry"
  done
}

build_apply_allowed_tools() {
  local plan_path="$1"
  local tools=(
    "Read"
    "Write"
    "Edit"
    "Glob"
    "Grep"
    "Bash(git add *)"
    "Bash(git commit *)"
  )

  APPLY_ALLOWED_BASH_TOOLS=()
  APPLY_ALLOWED_BASH_PATTERNS=()

  add_verify_bash_patterns "$plan_path"
  add_config_bash_patterns

  if [[ ${#APPLY_ALLOWED_BASH_TOOLS[@]} -gt 0 ]]; then
    tools+=("${APPLY_ALLOWED_BASH_TOOLS[@]}")
  fi

  APPLY_ALLOWED_TOOLS=$(join_by_comma "${tools[@]}")
}

log_apply_allowlist() {
  if [[ ${#APPLY_ALLOWED_BASH_PATTERNS[@]} -gt 0 ]]; then
    log "  Apply Bash allowlist additions: $(join_by_comma "${APPLY_ALLOWED_BASH_PATTERNS[@]}")"
  else
    log "  Apply Bash allowlist additions: none"
  fi
}
