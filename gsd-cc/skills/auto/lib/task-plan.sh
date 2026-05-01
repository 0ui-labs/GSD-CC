# GSD-CC auto-mode task-plan parsing helpers.

TASK_PLAN_REPAIR_HINT="Run /gsd-cc-plan to regenerate task plans before restarting auto-mode, or allow the verify command in .gsd/CONFIG.md with auto_apply_allowed_bash."
TASK_PLAN_MAX_TASKS_PER_SLICE=7
TASK_PLAN_MAX_FILES_PER_TASK=15

invalid_task_plan() {
  local plan_path="$1"
  local reason="$2"

  fail_validation "Invalid task plan: $plan_path" "$reason. $TASK_PLAN_REPAIR_HINT"
}

invalid_slice_plan() {
  local plan_path="$1"
  local reason="$2"

  fail_validation "Invalid slice plan: $plan_path" "$reason. Run /gsd-cc-plan to regenerate the slice plan before restarting auto-mode."
}

extract_task_plan_attr() {
  local plan_path="$1"
  local attr="$2"
  local task_line

  task_line=$(awk '/<task([[:space:]>])/{ print; exit }' "$plan_path")
  printf '%s\n' "$task_line" | sed -nE "s/.*[[:space:]]${attr}=['\"]([^'\"]+)['\"].*/\1/p" | head -1
}

task_plan_expected_id() {
  local plan_path="$1"
  basename "$plan_path" | sed -E 's/-PLAN\.xml$//'
}

extract_xml_block() {
  local plan_path="$1"
  local tag="$2"

  awk -v tag="$tag" '
    BEGIN {
      open = "<" tag "([[:space:]][^>]*)?>"
      close_tag = "</" tag ">"
      in_block = 0
    }
    {
      line = $0
      if (!in_block && line ~ open) {
        in_block = 1
        sub(".*" open, "", line)
      }
      if (in_block) {
        if (index(line, close_tag)) {
          sub(close_tag ".*", "", line)
          print line
          exit
        }
        print line
      }
    }
  ' "$plan_path"
}

extract_xml_attr() {
  local plan_path="$1"
  local tag="$2"
  local attr="$3"
  local tag_line

  tag_line=$(awk -v tag="$tag" '$0 ~ "<" tag "([[:space:]>])" { print; exit }' "$plan_path")
  printf '%s\n' "$tag_line" | sed -nE "s/.*[[:space:]]${attr}=['\"]([^'\"]+)['\"].*/\1/p" | head -1
}

xml_block_has_meaningful_text() {
  local plan_path="$1"
  local tag="$2"
  local content

  content=$(extract_xml_block "$plan_path" "$tag" | sed -E 's/<!--[^>]*-->//g; s/<[^>]+>//g')
  content=$(printf '%s\n' "$content" | tr '\n' ' ' | sed -E 's/[[:space:]]+/ /g')
  content=$(trim_whitespace "$content")

  [[ -n "$content" ]]
}

strip_task_file_annotation() {
  local value
  value=$(trim_whitespace "$1")
  value=$(printf '%s' "$value" | sed -E \
    's/[[:space:]]+\([^)]*\)$//;
     s/[[:space:]]+-[[:space:]].*$//;
     s/[[:space:]]+#[[:space:]].*$//;
     s/[[:space:]]+\/\/[[:space:]].*$//;
     s/^([^[:space:]]+):[[:space:]].*$/\1/')
  trim_whitespace "$value"
}

normalize_repo_path() {
  local path
  path=$(trim_whitespace "$1")

  while [[ "$path" == ./* ]]; do
    path="${path#./}"
  done

  case "$path" in
    ""|"."|".."|/*|~*|*/ ) return 1 ;;
  esac

  if [[ "$path" =~ (^|/)\.\.(/|$) ]]; then
    return 1
  fi

  case "$path" in
    *'*'*|*'?'*|*'['*|*']'*) return 1 ;;
  esac

  printf '%s\n' "$path"
}

parse_task_plan_files() {
  local plan_path="$1"
  local raw_line
  local cleaned_line
  local normalized_path
  local found=0

  while IFS= read -r raw_line; do
    cleaned_line=$(printf '%s' "$raw_line" | sed -E 's/<!--.*-->//g')
    cleaned_line=$(trim_whitespace "$cleaned_line")

    [[ -z "$cleaned_line" ]] && continue

    case "$cleaned_line" in
      \#*|//*|*:) continue ;;
    esac

    cleaned_line=$(printf '%s' "$cleaned_line" | sed -E 's/^[-*][[:space:]]+//; s/^[0-9]+[.)][[:space:]]+//')
    cleaned_line=$(strip_task_file_annotation "$cleaned_line")

    [[ -z "$cleaned_line" ]] && continue

    normalized_path=$(normalize_repo_path "$cleaned_line") || return 1
    printf '%s\n' "$normalized_path"
    found=1
  done < <(
    awk '
      /<files>/ {
        in_files=1
        sub(/^.*<files>/, "")
      }
      in_files {
        if (/<\/files>/) {
          sub(/<\/files>.*$/, "")
          print
          exit
        }
        print
      }
    ' "$plan_path"
  )

  [[ "$found" -eq 1 ]]
}

validate_task_plan_file_entries() {
  local plan_path="$1"
  local files_output
  local file_path
  local file_count=0

  files_output=$(parse_task_plan_files "$plan_path") || {
    invalid_task_plan "$plan_path" "files must list at least one concrete repo-relative path"
  }

  while IFS= read -r file_path; do
    [[ -z "$file_path" ]] && continue

    case "$file_path" in
      *'{{'*|*'}}'*)
        invalid_task_plan "$plan_path" "files contains placeholder path: $file_path"
        ;;
    esac

    if printf '%s\n' "$file_path" | grep -iqE '(^|[^[:alnum:]_])(TBD|TODO|later)([^[:alnum:]_]|$)'; then
      invalid_task_plan "$plan_path" "files contains unresolved placeholder: $file_path"
    fi

    file_count=$((file_count + 1))
  done <<< "$files_output"

  if [[ "$file_count" -gt "$TASK_PLAN_MAX_FILES_PER_TASK" ]]; then
    invalid_task_plan "$plan_path" "task owns $file_count files; split tasks above $TASK_PLAN_MAX_FILES_PER_TASK files"
  fi
}

validate_task_plan_critical_fields_resolved() {
  local plan_path="$1"
  local tag
  local content

  for tag in name risk action verify done; do
    content=$(extract_xml_block "$plan_path" "$tag")
    if printf '%s\n' "$content" | grep -iqE '(^|[^[:alnum:]_])(TBD|TODO|later)([^[:alnum:]_]|$)'; then
      invalid_task_plan "$plan_path" "$tag contains TODO, TBD, or later"
    fi
  done
}

count_task_plan_ac_blocks() {
  awk '
    /<ac([[:space:]>])/ { count += 1 }
    END { print count + 0 }
  ' "$1"
}

extract_task_plan_ac_ids() {
  sed -nE "s/.*<ac[[:space:]][^>]*id=['\"]([^'\"]+)['\"].*/\1/p" "$1"
}

validate_task_plan_ac_blocks_have_bdd() {
  awk '
    /<ac([[:space:]>])/ {
      in_ac = 1
      block = ""
    }
    in_ac {
      block = block "\n" $0
      if (/<\/ac>/) {
        if (block !~ /(^|[[:space:]])Given[[:space:]]/ ||
            block !~ /(^|[[:space:]])When[[:space:]]/ ||
            block !~ /(^|[[:space:]])Then[[:space:]]/) {
          exit 1
        }
        in_ac = 0
        block = ""
      }
    }
    END {
      if (in_ac) {
        exit 1
      }
    }
  ' "$1"
}

extract_verify_ac_references() {
  local verify_text="$1"

  printf '%s\n' "$verify_text" |
    sed -E 's/[^A-Za-z0-9_-]+/\n/g' |
    sed -nE '/^AC-[0-9]+$/p'
}

config_bash_pattern_matches_command() {
  local command="$1"
  local raw
  local entry
  local entries=()

  raw=$(read_config_field "auto_apply_allowed_bash")
  [[ -z "$raw" ]] && return 1

  IFS=',' read -r -a entries <<< "$raw"
  for entry in "${entries[@]}"; do
    entry=$(trim_whitespace "$entry")
    [[ -z "$entry" ]] && continue

    case "$entry" in
      *"Bash("*|*")"*) continue ;;
    esac

    if [[ "$command" == $entry ]]; then
      return 0
    fi
  done

  return 1
}

validate_task_plan_verify_references() {
  local plan_path="$1"
  shift

  local task_ac_ids=("$@")
  local verify_text
  local verify_refs=()
  local ref

  verify_text=$(extract_xml_block "$plan_path" "verify")
  while IFS= read -r ref; do
    [[ -z "$ref" ]] && continue
    if [[ ${#verify_refs[@]} -eq 0 ]] || ! path_in_list "$ref" "${verify_refs[@]}"; then
      verify_refs+=("$ref")
    fi
  done < <(extract_verify_ac_references "$verify_text")

  if [[ ${#verify_refs[@]} -eq 0 ]]; then
    invalid_task_plan "$plan_path" "verify must reference at least one AC id"
  fi

  for ref in "${verify_refs[@]}"; do
    if ! path_in_list "$ref" "${task_ac_ids[@]}"; then
      invalid_task_plan "$plan_path" "verify references unknown $ref"
    fi
  done
}

validate_task_plan_verify_command_allowed() {
  local plan_path="$1"
  local command

  command=$(extract_first_verify_command "$plan_path")
  if [[ -z "$command" ]]; then
    invalid_task_plan "$plan_path" "verify must contain a command before AC references"
  fi

  APPLY_ALLOWED_BASH_TOOLS=()
  APPLY_ALLOWED_BASH_PATTERNS=()
  add_verify_bash_patterns "$plan_path"

  if [[ ${#APPLY_ALLOWED_BASH_PATTERNS[@]} -gt 0 ]]; then
    return 0
  fi

  if config_bash_pattern_matches_command "$command"; then
    return 0
  fi

  invalid_task_plan "$plan_path" "verify command is not allowed for auto-mode: $command"
}

validate_task_plan_risk() {
  local plan_path="$1"
  local risk_level

  risk_level=$(extract_xml_attr "$plan_path" "risk" "level")
  case "$risk_level" in
    low|medium|high) ;;
    *)
      invalid_task_plan "$plan_path" "risk level must be low, medium, or high: ${risk_level:-missing}"
      ;;
  esac
}

validate_single_task_plan_for_auto_mode() {
  local plan_path="$1"
  shift

  local slice_ac_ids=("$@")
  local expected_id
  local actual_id
  local task_type
  local required_tag
  local ac_count
  local ac_id_count=0
  local ac_id
  local task_ac_ids=()

  expected_id=$(task_plan_expected_id "$plan_path")
  actual_id=$(extract_task_plan_attr "$plan_path" "id")
  if [[ "$actual_id" != "$expected_id" ]]; then
    invalid_task_plan "$plan_path" "task id must match filename: expected $expected_id, got ${actual_id:-missing}"
  fi

  task_type=$(extract_task_plan_attr "$plan_path" "type")
  if [[ "$task_type" != "auto" ]]; then
    invalid_task_plan "$plan_path" "task type must be auto, got ${task_type:-missing}"
  fi

  for required_tag in name files risk acceptance_criteria action boundaries verify done; do
    if ! xml_block_has_meaningful_text "$plan_path" "$required_tag"; then
      invalid_task_plan "$plan_path" "$required_tag must exist and be non-empty"
    fi
  done

  validate_task_plan_critical_fields_resolved "$plan_path"
  validate_task_plan_risk "$plan_path"
  validate_task_plan_file_entries "$plan_path"

  ac_count=$(count_task_plan_ac_blocks "$plan_path")
  if [[ "$ac_count" -lt 1 ]]; then
    invalid_task_plan "$plan_path" "acceptance_criteria must contain at least one AC"
  fi

  while IFS= read -r ac_id; do
    [[ -z "$ac_id" ]] && continue
    ac_id_count=$((ac_id_count + 1))

    if [[ ! "$ac_id" =~ ^AC-[0-9]+$ ]]; then
      invalid_task_plan "$plan_path" "acceptance criterion id must use AC-n format: $ac_id"
    fi

    if [[ ${#task_ac_ids[@]} -gt 0 ]] && path_in_list "$ac_id" "${task_ac_ids[@]}"; then
      invalid_task_plan "$plan_path" "duplicate AC id in task: $ac_id"
    fi

    if [[ ${#slice_ac_ids[@]} -gt 0 ]] && path_in_list "$ac_id" "${slice_ac_ids[@]}"; then
      invalid_task_plan "$plan_path" "duplicate AC id in slice: $ac_id"
    fi

    task_ac_ids+=("$ac_id")
  done < <(extract_task_plan_ac_ids "$plan_path")

  if [[ "$ac_id_count" -ne "$ac_count" ]]; then
    invalid_task_plan "$plan_path" "acceptance criterion missing id"
  fi

  if ! validate_task_plan_ac_blocks_have_bdd "$plan_path"; then
    invalid_task_plan "$plan_path" "each AC must contain Given, When, and Then"
  fi

  validate_task_plan_verify_references "$plan_path" "${task_ac_ids[@]}"
  validate_task_plan_verify_command_allowed "$plan_path"
}

extract_slice_dependencies() {
  local slice="$1"
  local plan_path

  plan_path=$(slice_plan_path "$slice")
  [[ -f "$plan_path" ]] || return 0

  awk '
    /^##[[:space:]]+Dependencies[[:space:]]*$/ {
      in_dependencies = 1
      next
    }
    /^##[[:space:]]+/ && in_dependencies {
      exit
    }
    in_dependencies {
      print
    }
  ' "$plan_path"
}

task_id_from_plan_path() {
  local plan_path="$1"
  task_plan_expected_id "$plan_path" | sed -E 's/^S[0-9]+-//'
}

grep_ere_escape() {
  printf '%s' "$1" | sed -E 's/[][(){}.^$*+?|\\]/\\&/g'
}

dependencies_sequence_tasks() {
  local dependencies_text="$1"
  local left_task="$2"
  local right_task="$3"
  local left_pattern
  local line
  local right_pattern
  local sequencing_pattern="(→|->|=>|before|after|depends( on)?|then)"

  [[ -n "$dependencies_text" ]] || return 1

  left_pattern=$(grep_ere_escape "$left_task")
  right_pattern=$(grep_ere_escape "$right_task")

  while IFS= read -r line; do
    if printf '%s\n' "$line" | grep -Eiq "(^|[^[:alnum:]_])${left_pattern}([^[:alnum:]_]|$).*${sequencing_pattern}.*(^|[^[:alnum:]_])${right_pattern}([^[:alnum:]_]|$)" ||
       printf '%s\n' "$line" | grep -Eiq "(^|[^[:alnum:]_])${right_pattern}([^[:alnum:]_]|$).*${sequencing_pattern}.*(^|[^[:alnum:]_])${left_pattern}([^[:alnum:]_]|$)"; then
      return 0
    fi
  done <<< "$dependencies_text"

  return 1
}

validate_duplicate_task_file_ownership() {
  local slice="$1"
  shift

  local ownership_entries=("$@")
  local dependencies_text
  local left_entry
  local right_entry
  local left_file
  local left_task
  local right_file
  local right_task
  local i
  local j

  dependencies_text=$(extract_slice_dependencies "$slice")

  for ((i = 0; i < ${#ownership_entries[@]}; i++)); do
    left_entry="${ownership_entries[$i]}"
    left_file="${left_entry%%|*}"
    left_task="${left_entry#*|}"

    for ((j = i + 1; j < ${#ownership_entries[@]}; j++)); do
      right_entry="${ownership_entries[$j]}"
      right_file="${right_entry%%|*}"
      right_task="${right_entry#*|}"

      if [[ "$left_file" != "$right_file" || "$left_task" == "$right_task" ]]; then
        continue
      fi

      if ! dependencies_sequence_tasks "$dependencies_text" "$left_task" "$right_task"; then
        invalid_slice_plan "$(slice_plan_path "$slice")" "$left_file is owned by multiple tasks ($left_task, $right_task) without explicit sequencing in ## Dependencies"
      fi
    done
  done
}

validate_task_plans_for_auto_mode() {
  local slice="$1"
  local plan_files=()
  local plan_path
  local ac_id
  local slice_ac_ids=()
  local task_files_output
  local file_path
  local task_id
  local ownership_entries=()

  while IFS= read -r plan_path; do
    [[ -z "$plan_path" ]] && continue
    plan_files+=("$plan_path")
  done < <(find_matching_files "$GSD_DIR/${slice}-T*-PLAN.xml" | sort)

  if [[ ${#plan_files[@]} -eq 0 ]]; then
    fail_validation "Missing task plans for auto-mode: $GSD_DIR/${slice}-T*-PLAN.xml" \
      "Run /gsd-cc-plan to create XML task plans before restarting auto-mode."
  fi

  if [[ ${#plan_files[@]} -gt "$TASK_PLAN_MAX_TASKS_PER_SLICE" ]]; then
    invalid_slice_plan "$(slice_plan_path "$slice")" "slice has ${#plan_files[@]} tasks; split slices above $TASK_PLAN_MAX_TASKS_PER_SLICE tasks"
  fi

  for plan_path in "${plan_files[@]}"; do
    if [[ ${#slice_ac_ids[@]} -gt 0 ]]; then
      validate_single_task_plan_for_auto_mode "$plan_path" "${slice_ac_ids[@]}"
    else
      validate_single_task_plan_for_auto_mode "$plan_path"
    fi

    while IFS= read -r ac_id; do
      [[ -z "$ac_id" ]] && continue
      slice_ac_ids+=("$ac_id")
    done < <(extract_task_plan_ac_ids "$plan_path")

    task_id=$(task_id_from_plan_path "$plan_path")
    task_files_output=$(parse_task_plan_files "$plan_path") || {
      invalid_task_plan "$plan_path" "files must list at least one concrete repo-relative path"
    }
    while IFS= read -r file_path; do
      [[ -z "$file_path" ]] && continue
      ownership_entries+=("$file_path|$task_id")
    done <<< "$task_files_output"
  done

  validate_duplicate_task_file_ownership "$slice" "${ownership_entries[@]}"
}

extract_summary_status() {
  awk '
    /^##[[:space:]]+Status[[:space:]]*$/ {
      in_status=1
      next
    }
    /^##[[:space:]]+/ && in_status {
      exit
    }
    in_status {
      gsub(/^[[:space:]]+|[[:space:]]+$/, "")
      if ($0 != "") {
        print tolower($0)
        exit
      }
    }
  ' "$1"
}
