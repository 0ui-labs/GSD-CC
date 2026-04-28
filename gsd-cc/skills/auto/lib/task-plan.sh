# GSD-CC auto-mode task-plan parsing helpers.

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

  printf '%s\n' "$path"
}

extract_task_name() {
  awk '
    /<name>/ {
      sub(/^.*<name>/, "")
      sub(/<\/name>.*$/, "")
      gsub(/^[[:space:]]+|[[:space:]]+$/, "")
      if ($0 != "") {
        print
        exit
      }
    }
  ' "$1"
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
