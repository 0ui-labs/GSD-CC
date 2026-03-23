# GSD-CC: Get Shit Done on Claude Code

## Architecture Blueprint v3

**Ziel:** Das Beste aus GSD, PAUL und SEED — als reines Claude Code Skill-System, nutzbar mit dem Max-Plan.

- **Von GSD:** Auto-Modus, State Machine, frische Sessions, parallele Execution, Git-Orchestrierung, Cost Tracking, Crash Recovery, Roadmap Reassessment
- **Von PAUL:** Pflicht-UNIFY, BDD Acceptance Criteria, explizite Boundaries, dynamische Context-Injection
- **Von SEED:** Typ-aware Ideation, Rigor-Level, Quality Gate, composable Type System

---

## Designprinzip

```
GSD-CC = Alles lebt in Claude Code
```

Kein separates CLI-Tool. Kein TypeScript-Projekt. Kein Build-Step.

Claude Code ist bereits: Terminal-UI, Session-Manager, File-Editor, Bash-Runner, Git-Client, Subagent-Spawner. Es wird von Anthropic gewartet, bekommt neue Features automatisch, und läuft auf dem Max-Plan.

Wir bauen keine zweite Schale darum. Stattdessen:

- **Skills (Markdown)** — steuern jeden Aspekt: Ideation, Planung, Execution, UNIFY, Quality Gates
- **Disk-State (.gsd/)** — Source of Truth, überlebt Sessions
- **Auto-Loop (Bash)** — einziges Stück "Code": eine Schleife die `claude -p` aufruft

```
┌─────────────────────────────────────────────┐
│  Claude Code                                │
│                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │ Skills   │ │ .gsd/    │ │ auto.sh  │    │
│  │ (20 md   │ │ (State   │ │ (50 LOC  │    │
│  │  files)  │ │  on disk)│ │  bash)   │    │
│  └──────────┘ └──────────┘ └──────────┘    │
│                                             │
│  Claude Code's eigene Tools:                │
│  Read, Write, Edit, Bash, Git, Subagents    │
└─────────────────────────────────────────────┘
```

Warum kein eigenes Tool?

- **GSD v2** hat ~15.000 Zeilen TypeScript geschrieben, um einen eigenen Agent (Pi SDK) zu orchestrieren. Sie warten jetzt Session-Crashes, Extension-Import-Konflikte, Dispatch-Loop-Bugs.
- **GSD-CC** hat ~20 Markdown-Dateien und ~50 Zeilen Bash. Claude Code ist der Agent. Anthropic wartet ihn.
- Alles was wir brauchen und Claude Code nicht nativ kann, ist **eine äußere Schleife** die nach einem Task den nächsten startet. Das sind 50 Zeilen Bash.

---

## Installation

```bash
npx gsd-cc
```

Das ist alles. Kopiert Skills + Auto-Loop nach `~/.claude/skills/gsd/`. Beim nächsten `claude` Start sind sie da.

```
~/.claude/skills/gsd/
├── SKILL.md                      # Haupt-Skill: /gsd Router + Wizard
│
├── seed/                         # Phase 0: Ideation
│   ├── SKILL.md                  # /gsd-seed
│   └── types/
│       ├── application/
│       │   ├── guide.md          # 10 Gesprächssektionen
│       │   ├── config.md         # rigor: deep
│       │   └── loadout.md        # Tool-Empfehlungen
│       ├── workflow/             # rigor: standard, 8 Sections
│       ├── utility/              # rigor: tight, 6 Sections
│       ├── client/               # rigor: standard, 7 Sections
│       └── campaign/             # rigor: creative, 7 Sections
│
├── discuss/                      # Phase 1: Entscheidungen
│   └── SKILL.md                  # /gsd-discuss
│
├── plan/                         # Phase 2: Dekomposition + AC
│   └── SKILL.md                  # /gsd-plan
│
├── apply/                        # Phase 3: Execution
│   └── SKILL.md                  # /gsd-apply
│
├── unify/                        # Phase 4: Pflicht-Reconciliation
│   └── SKILL.md                  # /gsd-unify
│
├── auto/                         # Auto-Modus
│   ├── SKILL.md                  # /gsd-auto
│   └── auto-loop.sh              # Die Schleife (~50 LOC)
│
├── status/                       # Fortschritt + Kosten
│   └── SKILL.md                  # /gsd-status
│
├── checklists/                   # Quality Gates
│   ├── planning-ready.md         # Ist der Plan baubar?
│   └── unify-complete.md         # Ist UNIFY vollständig?
│
└── templates/                    # Vorlagen
    ├── PLANNING.md               # Ideation Output
    ├── PLAN.xml                  # Task-Plan mit AC + Boundaries
    ├── UNIFY.md                  # Reconciliation Template
    └── STATE.md                  # State Template
```

---

## Wie sich das Arbeiten anfühlt

### Kein extra Tool — du bleibst in Claude Code

GSD-CC ist kein Programm das du zusätzlich öffnest. Du öffnest Claude Code wie immer, tippst `/gsd`, und arbeitest. Alles passiert in derselben Session, demselben Terminal, demselben Interface das du schon kennst.

Es gibt keinen Moment in dem du denkst "jetzt muss ich ins andere Tool wechseln". Claude Code ist das Tool. GSD-CC gibt ihm nur einen Bauplan.

### Ein Einstiegspunkt: `/gsd`

Du musst genau einen Befehl kennen: `/gsd`.

Du tippst `/gsd`, egal wo du im Projekt stehst. GSD liest den aktuellen State von Disk und schlägt **genau eine** nächste Aktion vor. Nicht ein Menü mit 8 Optionen. Nicht "was willst du tun?". Sondern: "Hier sind wir. Nächster Schritt wäre X. Okay?"

Wenn du einverstanden bist: Enter. Wenn nicht: sag was anderes.

### Smart-Routing

Was `/gsd` vorschlägt, hängt davon ab was auf Disk liegt:

```
/gsd
 │
 ├─ Kein .gsd/ Ordner?
 │  → "Was willst du bauen?" (Ideation starten)
 │
 ├─ PLANNING.md aber keine ROADMAP?
 │  → "Plan ist fertig. Roadmap erstellen?"
 │
 ├─ ROADMAP mit offenen Slices, keiner geplant?
 │  → "S01 als nächstes planen?"
 │
 ├─ Plan fertig, noch nicht ausgeführt?
 │  → "S01 ausführen? Manuell oder auto?"
 │
 ├─ Tasks done, kein UNIFY?
 │  → "Erst UNIFY abschließen." (kein Ausweichen!)
 │
 ├─ UNIFY done, nächster Slice pending?
 │  → "Weiter mit S02?"
 │
 ├─ Auto abgebrochen / Crash?
 │  → "S03 wurde unterbrochen bei T02. Fortsetzen?"
 │
 └─ Alles done?
    → "Milestone complete! Nächsten Milestone starten?"
```

Power-User können direkt zu Sub-Skills springen (`/gsd-plan`, `/gsd-unify`, etc.), aber der Default-Pfad braucht nur `/gsd` + Enter.

### Walkthrough: Von der Idee zum fertigen Projekt

**Du öffnest Claude Code in deinem Projektordner:**

```
~/my-project $ claude
>
```

**Phase 0 — Ideation. Du tippst `/gsd` zum ersten Mal:**

```
> /gsd

  No .gsd/ directory found. Let's start a new project.

  What are you building?
  Tell me in a sentence or two — I'll figure out the rest.

> Eine REST API für ein Buchungssystem mit React Frontend

  Got it. That's an application project.
  Setting rigor to deep — architecture matters here.

  Let's explore this together. I'll ask about 8 areas.
  We can skip anything that's not relevant yet.

  1/8 — Users & auth
  Who uses this system? How do they log in?
  If you're not sure, I can suggest some options.
```

Du unterhältst dich 8-10 Minuten. Coach-Modus, nicht Verhör. Wenn du bei einer Frage nicht weiterweißt, schlägt GSD Optionen vor. Wenn du sagst "skip", geht's weiter.

```
  Ideation complete. I've created:
    .gsd/PLANNING.md    — your full project brief
    .gsd/PROJECT.md     — project vision
    .gsd/type.json      — application / deep

  Quality check passed. Your plan is ready for roadmapping.
  Next: I'll create a roadmap with milestones. Ready?
```

**Phase 1-2 — Roadmap + Planung. Du tippst `/gsd` erneut:**

```
> /gsd

  PLANNING.md exists but no roadmap yet.
  Shall I create the roadmap?

> yes

  Created .gsd/M001-ROADMAP.md with 6 slices:
    S01: Data model + type system
    S02: Auth + session management
    S03: Booking API endpoints
    S04: React frontend shell
    S05: Booking UI + integration
    S06: Polish + deploy

  Next: Plan S01 in detail?

> yes

  Planning S01: Data model + type system...
  Researching your codebase and stack...

  Created .gsd/S01-PLAN.md with:
    3 tasks (T01, T02, T03)
    4 acceptance criteria (BDD format)
    Boundaries: package.json locked, no ORM yet

  Quality check passed.
  Next: Execute S01? (manual or auto)
```

**Phase 3 — Execution. Du hast zwei Wege:**

Manuell (du bleibst dabei):
```
> manual

  Executing S01-T01: Core types and interfaces...
  [creating src/types.ts]
  [creating tests/types.test.ts]
  [running npm test]
  AC-1: Pass — Type definitions compile
  AC-2: Pass — Validation rejects invalid input
  Committed: feat(S01/T01): core types and interfaces

  T01 done. Starting T02?
```

Oder auto (du gehst weg):
```
> auto

  Starting auto-mode for S01 (3 tasks)...
  Each task gets a fresh context window.
  I'll commit after each task and UNIFY when the slice is done.

  S01-T01 executing...  (fresh session)
  S01-T01 done.         feat(S01/T01): core types
  S01-T02 executing...  (fresh session)
  S01-T02 done.         feat(S01/T02): data model
  S01-T03 executing...  (fresh session)
  S01-T03 done.         feat(S01/T03): validation

  UNIFY running...      (comparing plan vs actual)
  UNIFY complete.       .gsd/S01-UNIFY.md written
  Git: squash-merged gsd/M001/S01 → main

  S01 complete. 3/3 tasks, 4/4 AC passed.
  Planning S02: Auth + session management...
```

**Phase 4 — UNIFY passiert automatisch.** Du musst nichts tun. Nach jedem Slice vergleicht GSD was geplant war mit dem was passiert ist, loggt Entscheidungen und Abweichungen, und merged den Git-Branch. Erst danach startet der nächste Slice.

**Wiederkommen nach Stunden oder Tagen:**

```
~/my-project $ claude

> /gsd

  Welcome back. Here's where we are:

  M001 — 4 of 6 slices complete
  S05 Booking UI was interrupted (T02 partial)

  I can:
  1. Resume S05 from where it stopped
  2. Show me what happened while I was away
  3. Start auto-mode to finish M001

> 3
```

GSD weiß immer wo du bist. Du musst dich nie erinnern was als nächstes kommt.

**Zwischendurch steuern (optional, zweites Terminal):**

Während auto läuft in Terminal 1, kannst du in einem zweiten Terminal mitlenken:

```
~/my-project $ claude

> /gsd status

  M001 — Buchungssystem v1
  S01 Data model          [done]    4/4 AC  ✓ unified
  S02 Auth + sessions     [done]    3/3 AC  ✓ unified
  S03 Booking API         [T02/T04] 1/3 AC  running
  S04 React frontend      [pending]

  Auto-mode: active (S03-T02 in progress)
  Tokens: 142k input / 38k output

> Use JWT instead of sessions for auth. Update decisions.

  Added to .gsd/DECISIONS.md:
    "Use JWT tokens, not server sessions (user decision)"
  This will be picked up at the next task boundary.
```

### UX-Regeln

1. **Ein Einstiegspunkt.** `/gsd` ist alles was du brauchst. Immer.
2. **Eine Aktion.** GSD schlägt nie mehr als eine Sache vor. Yes/No, nicht Multiple Choice.
3. **Kein Toolwechsel.** Alles passiert in Claude Code. Kein zweites Terminal, kein zweites Programm nötig.
4. **State überlebt.** Egal ob du die Session schließt, den Rechner neustartest, oder eine Woche Urlaub machst — `/gsd` weiß wo du warst.
5. **Kein Auswendiglernen.** Du musst keine Befehle kennen. `/gsd` routet dich automatisch. Die Sub-Commands existieren für Power-User, nicht für den normalen Flow.
6. **UNIFY ist unsichtbar.** Im manuellen Modus wirst du dazu aufgefordert. Im Auto-Modus passiert es automatisch. Aber es passiert immer — das ist nicht verhandelbar.

---

## Projekt-Lebenszyklus im Detail

### Phase 0 — SEED Ideation

**Trigger:** Kein `.gsd/` Ordner vorhanden.

**Was passiert:**
1. User beschreibt Idee in 1-2 Sätzen
2. GSD erkennt Projekttyp (Application/Workflow/Utility/Client/Campaign)
3. Rigor-Level wird gesetzt (deep/standard/tight/creative)
4. Typ-spezifische Guide wird geladen aus `seed/types/{type}/guide.md`
5. Geführte Exploration: 6-10 Sektionen, Coach-Modus (nicht Verhör)
6. Wenn User stuck → Skill bietet Vorschläge an (aus guide.md "Suggest" Sektionen)
7. Quality Gate prüft: Ist das Ergebnis planbar?
8. Erzeugt `.gsd/PLANNING.md` + `PROJECT.md` + `type.json`

**Skill-Instruktionen (Auszug `seed/SKILL.md`):**

```markdown
---
name: gsd-seed
description: >
  Type-aware project ideation. Guides through collaborative
  exploration shaped by project type. Coach persona, not interrogator.
  Produces structured PLANNING.md ready for roadmapping.
---

## Behavior

You are a project coach. You think WITH the user, not interrogate them.

1. Ask "What are you building?" in plain language
2. Detect type from their answer:
   - Software with UI/API/data → application
   - Claude Code commands/hooks/skills → workflow
   - Small tool/script → utility
   - Client website → client
   - Content/marketing/launch → campaign
3. Load the type config from seed/types/{type}/config.md
4. Set rigor level from config
5. Walk through guide.md sections one at a time
6. For each section:
   - Ask the "Explore" question
   - If user is stuck, offer the "Suggest" options
   - If user says "skip" or "not sure", move on
   - If rigor is "tight", don't linger — move fast
   - If rigor is "deep", push for specifics
7. After all sections, run checklist planning-ready.md
8. Write .gsd/PLANNING.md, PROJECT.md, type.json

## Key rule
Never fire questions. Think with the user. One topic at a time.
If they give a short answer, that's fine. If they want to go deep, go deep.
The rigor level guides how much you push, not how much you demand.
```

### Phase 1 — DISCUSS

**Trigger:** Roadmap existiert, nächster Slice hat noch kein CONTEXT.md.

**Was passiert:**
1. GSD liest Slice-Beschreibung aus ROADMAP.md
2. Identifiziert Graubereiche basierend auf dem was gebaut wird
3. Fragt gezielt nach Entscheidungen die die Planung beeinflussen
4. Schreibt `.gsd/M{n}-S{nn}-CONTEXT.md`
5. Append zu `.gsd/DECISIONS.md`

### Phase 2 — PLAN

**Trigger:** CONTEXT.md existiert (oder Discuss übersprungen), kein PLAN.md.

**Was passiert:**
1. Research: GSD untersucht Codebase + Stack (Subagent, read-only)
2. Dekomposition: Slice → Tasks (je 1 Context-Window groß)
3. Für jeden Task:
   - Acceptance Criteria im BDD Format (Given/When/Then)
   - Explizite Boundaries (DO NOT CHANGE)
   - Files, Action, Verify, Done
   - Jeder Task referenziert seine ACs
4. Quality Gate: `planning-ready.md` prüft
   - Alle Tasks haben ACs?
   - Boundaries definiert?
   - Kein "TBD" in kritischen Feldern?
   - Tasks passen in ein Context Window?
5. Schreibt `.gsd/S{nn}-PLAN.md` + `S{nn}-T{nn}-PLAN.md`

**Task-Plan Format:**

```xml
<task id="S01-T02" type="auto">
  <name>Markdown parser for plan files</name>

  <files>
    src/parser.ts
    src/types.ts
    tests/parser.test.ts
  </files>

  <acceptance_criteria>
    <ac id="AC-1">
      Given a valid plan file with YAML frontmatter
      When PlanParser.parse() is called
      Then it returns a typed TaskPlan object
    </ac>
    <ac id="AC-2">
      Given a plan file with malformed YAML
      When PlanParser.parse() is called
      Then it throws ParseError with the line number
    </ac>
  </acceptance_criteria>

  <action>
    1. Create src/parser.ts with PlanParser class
    2. Parse YAML frontmatter with gray-matter
    3. Write tests covering AC-1 and AC-2
  </action>

  <boundaries>
    DO NOT CHANGE:
    - src/types.ts (read-only, owned by T01)
    - package.json (no new deps without approval)
  </boundaries>

  <verify>npm test -- --grep parser (AC-1, AC-2)</verify>
  <done>Both ACs pass, PlanParser exports typed TaskPlan</done>
</task>
```

### Phase 3 — APPLY

**Trigger:** PLAN.md existiert und hat Quality Gate bestanden.

**Zwei Modi:**

#### Manuell (`/gsd apply` oder einfach `/gsd` → "yes")
- Claude Code führt Tasks sequentiell in der aktuellen Session aus
- Nach jedem Task: atomarer Git-Commit
- User sieht alles live, kann eingreifen
- Gut für: kleine Slices, Lernen, Kontrolle behalten

#### Auto (`/gsd auto`)
- Startet `auto-loop.sh` via Bash-Tool
- Das Skript liest `.gsd/STATE.md`, bestimmt nächsten Task
- Spawnt `claude -p` mit gebautem Prompt (Context-Matrix)
- Pro Task: frische Session, nur relevante Files im Prompt
- Nach jedem Task: Ergebnis parsen, State updaten, Git-Commit
- Nach allen Tasks eines Slice: UNIFY erzwingen
- Nach UNIFY: nächsten Slice planen und starten
- Stoppt bei: Milestone fertig, Budget erreicht, Stuck, Crash

**auto-loop.sh (Kernlogik):**

```bash
#!/bin/bash
# Auto-Mode Loop — das einzige Stück "Code" in GSD-CC
# Alles andere sind Skills (Markdown) und State (.gsd/ Files)

set -euo pipefail
GSD_DIR=".gsd"
LOCK_FILE="$GSD_DIR/auto.lock"
COSTS_FILE="$GSD_DIR/COSTS.jsonl"
BUDGET="${GSD_CC_BUDGET:-0}"  # 0 = unlimited

cleanup() { rm -f "$LOCK_FILE"; }
trap cleanup EXIT

while true; do
  # 1. State lesen
  STATE=$(cat "$GSD_DIR/STATE.md")
  PHASE=$(grep "^phase:" <<< "$STATE" | awk '{print $2}')
  SLICE=$(grep "^current_slice:" <<< "$STATE" | awk '{print $2}')
  TASK=$(grep "^current_task:" <<< "$STATE" | awk '{print $2}')
  RIGOR=$(grep "^rigor:" <<< "$STATE" | awk '{print $2}')

  # 2. UNIFY-Enforcement (aus PAUL)
  if [[ "$PHASE" == "apply-complete" ]]; then
    UNIFY_FILE="$GSD_DIR/${SLICE}-UNIFY.md"
    if [[ ! -f "$UNIFY_FILE" ]]; then
      echo "⚠ Running mandatory UNIFY for $SLICE..."
      claude -p "$(cat $GSD_DIR/prompts/unify.txt)" \
        --allowedTools "Read,Glob,Grep" \
        --output-format json --bare \
        --max-turns 10 > /tmp/gsd-unify.json
      # Parse + schreibe UNIFY.md
      jq -r '.result' /tmp/gsd-unify.json > "$UNIFY_FILE"
      # State updaten
      sed -i 's/^phase:.*/phase: unified/' "$GSD_DIR/STATE.md"
      continue
    fi
  fi

  # 3. Nächste Unit bestimmen
  NEXT=$(claude -p "Read .gsd/STATE.md and .gsd/*-ROADMAP.md. \
    Output ONLY the next unit to execute as JSON: \
    {\"slice\":\"S01\",\"task\":\"T01\",\"phase\":\"apply\"} \
    or {\"done\":true} if milestone is complete." \
    --allowedTools "Read,Glob" \
    --output-format json --bare --max-turns 3 \
    | jq -r '.result')

  if echo "$NEXT" | jq -e '.done' > /dev/null 2>&1; then
    echo "✅ Milestone complete."
    break
  fi

  UNIT_SLICE=$(echo "$NEXT" | jq -r '.slice')
  UNIT_TASK=$(echo "$NEXT" | jq -r '.task')
  UNIT_PHASE=$(echo "$NEXT" | jq -r '.phase')

  # 4. Budget-Check
  if [[ "$BUDGET" -gt 0 ]]; then
    TOTAL=$(awk -F'"' '{for(i=1;i<=NF;i++){if($i=="input_tokens")n+=$(i+2);if($i=="output_tokens")n+=$(i+2)}}END{print n+0}' "$COSTS_FILE" 2>/dev/null || echo 0)
    if [[ "$TOTAL" -gt "$BUDGET" ]]; then
      echo "💰 Budget reached ($TOTAL tokens). Stopping."
      break
    fi
  fi

  # 5. Lock setzen
  echo "{\"unit\":\"$UNIT_SLICE/$UNIT_TASK\",\"phase\":\"$UNIT_PHASE\",\"pid\":$$,\"started\":\"$(date -Iseconds)\"}" > "$LOCK_FILE"

  # 6. Prompt bauen (Context-Matrix: nur laden was diese Phase braucht)
  PROMPT_FILE="/tmp/gsd-prompt-$$.txt"
  echo "<state>" > "$PROMPT_FILE"
  cat "$GSD_DIR/STATE.md" >> "$PROMPT_FILE"
  echo "</state>" >> "$PROMPT_FILE"

  case "$UNIT_PHASE" in
    plan)
      [[ -f "$GSD_DIR/PROJECT.md" ]] && echo "<project>$(cat $GSD_DIR/PROJECT.md)</project>" >> "$PROMPT_FILE"
      [[ -f "$GSD_DIR/M001-ROADMAP.md" ]] && echo "<roadmap>$(cat $GSD_DIR/M001-ROADMAP.md)</roadmap>" >> "$PROMPT_FILE"
      [[ -f "$GSD_DIR/DECISIONS.md" ]] && echo "<decisions>$(cat $GSD_DIR/DECISIONS.md)</decisions>" >> "$PROMPT_FILE"
      cat "$GSD_DIR/prompts/plan-instructions.txt" >> "$PROMPT_FILE"
      ;;
    apply)
      PLAN="$GSD_DIR/${UNIT_SLICE}-${UNIT_TASK}-PLAN.md"
      SLICE_PLAN="$GSD_DIR/${UNIT_SLICE}-PLAN.md"
      [[ -f "$PLAN" ]] && echo "<task-plan>$(cat $PLAN)</task-plan>" >> "$PROMPT_FILE"
      [[ -f "$SLICE_PLAN" ]] && echo "<slice-plan>$(cat $SLICE_PLAN)</slice-plan>" >> "$PROMPT_FILE"
      [[ -f "$GSD_DIR/DECISIONS.md" ]] && echo "<decisions>$(cat $GSD_DIR/DECISIONS.md)</decisions>" >> "$PROMPT_FILE"
      # Vorherige Task-Summaries für Kontext
      for f in "$GSD_DIR/${UNIT_SLICE}"-T*-SUMMARY.md; do
        [[ -f "$f" ]] && echo "<prior-summary>$(cat $f)</prior-summary>" >> "$PROMPT_FILE"
      done
      cat "$GSD_DIR/prompts/apply-instructions.txt" >> "$PROMPT_FILE"
      ;;
  esac

  # 7. Rigor-basierte Timeouts + Max-Turns
  case "$RIGOR" in
    tight)    MAX_TURNS=15; TIMEOUT=300 ;;
    standard) MAX_TURNS=25; TIMEOUT=600 ;;
    deep)     MAX_TURNS=40; TIMEOUT=1200 ;;
    creative) MAX_TURNS=30; TIMEOUT=900 ;;
    *)        MAX_TURNS=25; TIMEOUT=600 ;;
  esac

  # 8. Dispatch: frische claude -p Session
  echo "▶ Executing $UNIT_SLICE/$UNIT_TASK ($UNIT_PHASE)..."
  RESULT=$(timeout "$TIMEOUT" claude -p "$(cat $PROMPT_FILE)" \
    --allowedTools "Read,Write,Edit,Bash(npm *),Bash(git add *),Bash(git commit *),Bash(npx *)" \
    --output-format json --bare \
    --max-turns "$MAX_TURNS" 2>/dev/null) || {
    EXIT_CODE=$?
    if [[ $EXIT_CODE -eq 124 ]]; then
      echo "⏰ Timeout after ${TIMEOUT}s. Pausing auto-mode."
    else
      echo "❌ Dispatch failed (exit $EXIT_CODE). Check .gsd/auto.lock for recovery."
    fi
    break
  }

  # 9. Ergebnis verarbeiten
  echo "$RESULT" | jq '{unit: "'"$UNIT_SLICE/$UNIT_TASK"'", phase: "'"$UNIT_PHASE"'", model: .model, usage: .usage, ts: "'"$(date -Iseconds)"'"}' >> "$COSTS_FILE"

  # 10. State updaten
  # (claude -p hat bereits Files geschrieben, committed, etc.)
  # Wir updaten nur die Tracking-Felder in STATE.md
  sed -i "s/^current_task:.*/current_task: $UNIT_TASK/" "$GSD_DIR/STATE.md"
  sed -i "s/^phase:.*/phase: $UNIT_PHASE/" "$GSD_DIR/STATE.md"
  sed -i "s/^last_updated:.*/last_updated: $(date -Iseconds)/" "$GSD_DIR/STATE.md"

  # 11. Stuck Detection
  EXPECTED="$GSD_DIR/${UNIT_SLICE}-${UNIT_TASK}-SUMMARY.md"
  if [[ "$UNIT_PHASE" == "apply" && ! -f "$EXPECTED" ]]; then
    ATTEMPT=$(grep -c "$UNIT_SLICE/$UNIT_TASK" "$GSD_DIR/auto.lock" 2>/dev/null || echo 0)
    if [[ "$ATTEMPT" -ge 2 ]]; then
      echo "🔄 $UNIT_SLICE/$UNIT_TASK stuck after 2 attempts. Stopping."
      break
    fi
    echo "⚠ Expected $EXPECTED not found. Retrying with diagnostic..."
    continue
  fi

  # 12. Git Commit (falls Task es nicht selbst gemacht hat)
  if ! git diff --quiet HEAD 2>/dev/null; then
    git add -A
    git commit -m "feat($UNIT_SLICE/$UNIT_TASK): auto-mode execution"
  fi

  # 13. Lock freigeben
  rm -f "$LOCK_FILE"

  echo "✓ $UNIT_SLICE/$UNIT_TASK complete."

  # Kurze Pause damit Max-Plan Rate Limits nicht greifen
  sleep 2
done

rm -f "$LOCK_FILE"
echo "Auto-mode finished."
```

### Phase 4 — UNIFY (Pflicht!)

**Trigger:** Alle Tasks eines Slice sind done. Wird automatisch erzwungen — kein Ausweichen.

**Was passiert:**
1. GSD liest: Slice-Plan, alle Task-Summaries, DECISIONS.md
2. Vergleicht: geplante ACs vs. tatsächlich erreicht
3. Dokumentiert: Abweichungen, Ad-hoc-Entscheidungen, Deferred Issues
4. Prüft: Boundary-Violations (hat ein Task Files angefasst die DO NOT CHANGE waren?)
5. Quality Gate: `unify-complete.md` checkt Vollständigkeit
6. Schreibt `.gsd/S{nn}-UNIFY.md`
7. Git: Squash-Merge des Slice-Branches → main
8. Roadmap Reassessment: Stimmt der Rest der Roadmap noch?

**UNIFY Output:**

```markdown
---
slice: S01
date: 2026-03-23T15:00:00Z
status: complete
---

## Plan vs. actual

| Task | Planned | Actual | Status |
|------|---------|--------|--------|
| T01 | Core types | Core types | ✅ as planned |
| T02 | Parser | Parser + schema validation | ✅ expanded |
| T03 | File writer | File writer (no whitespace norm.) | ⚠️ partial |

## Acceptance criteria

| AC | Status | Evidence |
|----|--------|----------|
| AC-1 | ✅ Pass | npm test: 12/12 pass |
| AC-2 | ✅ Pass | Error includes line number |
| AC-3 | ⚠️ Partial | Round-trip works, trailing newlines differ |

## Decisions made
- gray-matter over js-yaml (better frontmatter support)
- Added strict mode flag (not planned, emerged during T02)

## Boundary violations
None.

## Deferred
- [ ] Trailing newline normalization → S02
- [ ] Performance >1MB files → later

## Reassessment
Roadmap still valid. S02 can proceed as planned.
```

**Warum UNIFY Pflicht ist:**
- Ohne UNIFY driftet State. Entscheidungen gehen verloren.
- Ohne UNIFY weiß der nächste Slice nicht, was wirklich passiert ist (nur was geplant war).
- Ohne UNIFY akkumulieren sich Deferred Issues unsichtbar.
- Die Auto-Loop blockiert physisch: kein neuer Slice ohne UNIFY-File auf Disk.

---

## Dynamische Context-Injection

Statt alles immer in den Prompt zu laden (verschwendet Context Window), injiziert jede Phase nur was sie braucht:

```
                    SEED    DISCUSS   PLAN    APPLY   UNIFY   REASSESS
────────────────────────────────────────────────────────────────────────
PROJECT.md          ✅       ✅        ✅      ─        ─       ✅
PLANNING.md         ✅       ✅        ✅      ─        ─       ─
ROADMAP.md          ─        ✅        ✅      ─        ─       ✅
CONTEXT.md          ─        ─         ✅      ─        ─       ─
DECISIONS.md        ─        ✅        ✅      ✅       ✅       ✅
RESEARCH.md         ─        ─         ✅      ─        ─       ─
Slice PLAN.md       ─        ─         ─       ✅       ✅       ─
Task PLAN.md        ─        ─         ─       ✅       ─        ─
Prior SUMMARYs      ─        ─         ─       ✅       ✅       ─
All SUMMARYs        ─        ─         ─       ─        ─       ✅
Boundaries          ─        ─         ✅      ✅       ✅       ─
AC Section          ─        ─         ✅      ✅       ✅       ─

✅ = wird in den Prompt inlined     ─ = nicht geladen
```

Im manuellen Modus: der Skill sagt Claude welche Files zu lesen sind.
Im Auto-Modus: auto-loop.sh baut den Prompt entsprechend der Matrix.

---

## Git-Orchestrierung

**Wer macht was:**

| Aktion | Wer | Wie |
|--------|-----|-----|
| Branch pro Slice erstellen | auto-loop.sh | `git checkout -b gsd/M001/S01` |
| Commit pro Task | Claude (via Bash-Tool) | Plan sagt "commit after verify" |
| Squash-Merge nach UNIFY | auto-loop.sh | `git checkout main && git merge --squash` |
| Branch behalten für History | auto-loop.sh | Branch wird nicht gelöscht |

**Ergebnis auf main:**

```
abc123  feat(M001/S03): booking API endpoints
def456  feat(M001/S02): auth and session management
ghi789  feat(M001/S01): data model and type system
```

Ein sauberer Commit pro Slice. Per-Task-History auf Branches erhalten.

---

## Crash Recovery

**Lock-File Mechanismus:**

Vor jedem Task schreibt auto-loop.sh:
```json
// .gsd/auto.lock
{
  "unit": "S02/T03",
  "phase": "apply",
  "pid": 42891,
  "started": "2026-03-23T14:30:00Z"
}
```

Wenn auto-loop.sh crashed oder timeout'd, bleibt die Lock-Datei.

**Beim nächsten `/gsd` oder `/gsd auto`:**

1. Lock-File gefunden → Crash erkannt
2. Prüfe: Existiert `S02-T03-SUMMARY.md`?
   - Ja → Task war erfolgreich, nur Lock nicht aufgeräumt → aufräumen, weiter
   - Nein → Prüfe git log seit Lock-Timestamp
     - Commits vorhanden → Teilweise fertig → Resume mit Kontext
     - Keine Commits → Gar nichts passiert → Einfach neu starten

---

## Cost Tracking

Jeder `claude -p` Aufruf im Auto-Modus gibt JSON mit Usage-Metadata zurück. auto-loop.sh schreibt jede Zeile in `.gsd/COSTS.jsonl`:

```jsonl
{"unit":"S01/T01","phase":"apply","model":"claude-opus-4-6","usage":{"input_tokens":12840,"output_tokens":3201},"ts":"2026-03-23T14:31:00Z"}
{"unit":"S01/T02","phase":"apply","model":"claude-opus-4-6","usage":{"input_tokens":15320,"output_tokens":4102},"ts":"2026-03-23T14:35:00Z"}
{"unit":"S01","phase":"unify","model":"claude-sonnet-4-6","usage":{"input_tokens":8200,"output_tokens":1800},"ts":"2026-03-23T14:37:00Z"}
```

`/gsd status` liest das und zeigt:

```
Tokens: 142k input / 38k output
By phase: plan 22% · apply 68% · unify 10%
By slice: S01 45% · S02 55%
```

---

## .gsd/ Verzeichnisstruktur

```
.gsd/
├── PROJECT.md              # Projekt-Vision
├── PLANNING.md             # Ideation Output (aus SEED)
├── DECISIONS.md            # Append-only Entscheidungsregister
├── STATE.md                # Dashboard + Loop-Position
├── COSTS.jsonl             # Token/Cost Ledger
├── type.json               # {"type":"application","rigor":"deep"}
│
├── M001-ROADMAP.md         # Milestone-Plan
├── M001-CONTEXT.md         # User-Entscheidungen
├── M001-RESEARCH.md        # Codebase/Ecosystem Research
│
├── S01-PLAN.md             # Slice-Plan (mit AC + Boundaries)
├── S01-T01-PLAN.md         # Task-Plan (referenziert ACs)
├── S01-T01-SUMMARY.md      # Was passiert ist
├── S01-T02-PLAN.md
├── S01-T02-SUMMARY.md
├── S01-T03-PLAN.md
├── S01-T03-SUMMARY.md
├── S01-UNIFY.md            # Pflicht-Reconciliation
│
├── S02-PLAN.md
├── ...
│
├── prompts/                # Prompt-Templates für Auto-Modus
│   ├── plan-instructions.txt
│   ├── apply-instructions.txt
│   ├── unify-instructions.txt
│   └── reassess-instructions.txt
│
└── auto.lock               # Crash Recovery Lock
```

---

## Composable Type System

Neuer Projekttyp = 3 Dateien droppen, kein Code ändern:

```
~/.claude/skills/gsd/seed/types/my-saas/
├── guide.md      # Gesprächssektionen
│                 # ## 1/8 — Revenue Model
│                 # Explore: How do you charge?
│                 # Suggest: Freemium, usage-based, seat-based
│                 #
│                 # ## 2/8 — Multi-Tenancy
│                 # Explore: Shared DB or isolated?
│                 # ...
│
├── config.md     # rigor: deep
│                 # sections: 8
│                 # demeanor: strategic
│
└── loadout.md    # Empfohlene Tools:
                  # - Stripe SDK
                  # - Auth0 / Clerk
                  # - Vercel / Railway
```

Beim nächsten `/gsd-seed` taucht "my-saas" als Typ-Option auf.

---

## Abgrenzung

| Aspekt | GSD v1 | GSD v2 | PAUL | SEED | **GSD-CC** |
|--------|--------|--------|------|------|------------|
| Besteht aus | Markdown cmds | ~15k LoC TS | Markdown cmds | Markdown cmds | **Skills + Bash** |
| Agent | Claude Code | Pi SDK | Claude Code | Claude Code | **Claude Code** |
| Billing | Max-Plan | API/OAuth | Max-Plan | Max-Plan | **Max-Plan** |
| Auto-Modus | LLM-Loop | State Machine | ❌ | ❌ | **Bash Loop** |
| Ideation | Basic | Basic | ❌ | Typ-aware | **Typ-aware** |
| Loop-Closure | Optional | Auto | Pflicht-UNIFY | ❌ | **Pflicht-UNIFY** |
| AC Format | In-task verify | Must-Haves | BDD G/W/T | ❌ | **BDD G/W/T** |
| Boundaries | ❌ | ❌ | Explizit | ❌ | **Explizit** |
| Context-Mgmt | Static | Static | CARL (JIT) | Per-type | **Matrix (JIT)** |
| Quality Gate | ❌ | ❌ | ❌ | Pre-build | **Pre-build** |
| Rigor-Level | ❌ | ❌ | ❌ | Per-type | **Per-type** |
| Git | LLM cmds | Programmatic | ❌ | ❌ | **Bash script** |
| Cost Tracking | ❌ | Per-unit | ❌ | ❌ | **JSONL ledger** |
| Crash Recovery | ❌ | Lock+Forensics | Pause/Resume | ❌ | **Lock+Resume** |
| Wartung nötig | Minimal | Hoch (Pi SDK) | Minimal | Minimal | **Minimal** |

---

## Implementierungsreihenfolge

### Phase 1: Core Skills
1. Haupt-Skill `/gsd` mit State-Reading und Smart-Routing
2. `/gsd-seed` mit 5 Typen + Quality Gate
3. `/gsd-plan` mit AC + Boundaries
4. `/gsd-apply` für manuellen Modus
5. `/gsd-unify` mit Pflicht-Enforcement
6. `/gsd-status` mit Fortschritt + Kosten
7. Templates + Checklists

### Phase 2: Auto-Modus
8. auto-loop.sh mit State Machine
9. Prompt-Builder (Context-Matrix)
10. UNIFY-Enforcement im Loop
11. Git Branch/Merge Logik
12. Cost Tracking (JSONL)
13. Crash Recovery (Lock-Files)

### Phase 3: Robustheit
14. Rigor-basierte Timeouts
15. Stuck Detection + Retry
16. Parallele Waves (Git Worktrees + multiple `claude -p`)
17. Roadmap Reassessment nach UNIFY

### Phase 4: Ecosystem
18. Composable Types (custom type via file drop)
19. `npx gsd-cc` Installer
20. Migration von GSD v1 `.planning/`
21. Dokumentation + README

---

## Voraussetzungen

- **Claude Code** installiert und mit Max-Plan eingeloggt
- **Git** initialisiert im Projekt
- **jq** für JSON-Parsing im Auto-Loop
- Kein API-Key nötig
- Kein Node.js Build-Step nötig (nur für npx-Installer)
