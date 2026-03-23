# GSD-CC Implementation Plan

> **For Claude:** Implement this plan task-by-task. Each task creates one or more files. Read the referenced source files from GitHub before writing each skill. Commit after each task.

**Goal:** Build GSD-CC — a Claude Code skill system that combines GSD's automation, PAUL's discipline, and SEED's ideation into a single `/gsd` command.

**Architecture:** Pure Claude Code Skills (Markdown files in `.claude/skills/gsd/`) plus one Bash script for the auto-loop. No TypeScript, no build step, no external dependencies. State lives on disk in `.gsd/`. Claude Code is the runtime.

**Output:** A directory `gsd-cc/` containing all skills, templates, and an installer script. After `npx gsd-cc`, the user types `/gsd` in Claude Code and everything works.

**Referenz-Dokumente (bereits erstellt, MUSS gelesen werden):**
- `GSD-CC-ARCHITECTURE-v3.md` — vollständige technische Architektur
- `GSD-CC-KONZEPT.md` — Motivation, Problemstellung, Ziele

---

## Vorbereitung: Quell-Repos studieren

Vor jeder Task-Gruppe die relevanten Quelldateien von GitHub lesen. Nicht kopieren — verstehen wie sie Claude instruieren, dann für unser `.gsd/`-Format und Skill-System neu schreiben.

### Quellen-Index

**GSD v1** (https://github.com/gsd-build/get-shit-done)
```
commands/gsd/new-project.md      → Frage-Flow, PROJECT.md + ROADMAP.md Erzeugung
commands/gsd/discuss-phase.md    → Graubereiche erkennen, CONTEXT.md erzeugen
commands/gsd/plan-phase.md       → Orchestrator: Research → Plan → Verify
commands/gsd/execute-phase.md    → Wave-Execution, Subagent-Spawning
commands/gsd/verify-work.md      → UAT Walkthrough Struktur
commands/gsd/complete-milestone.md → Milestone-Abschluss, Archivierung
commands/gsd/progress.md         → Status-Darstellung
agents/gsd-planner.md            → Planner-Agent Instruktionen (915 Zeilen)
agents/gsd-researcher.md         → Researcher-Agent, Research-Modi
agents/gsd-executor.md           → Executor-Agent, Task-Ausführung
```

**PAUL** (https://github.com/ChristopherKahler/paul)
```
src/commands/paul/plan.md        → AC-Sections, Boundary-Sections in Plans
src/commands/paul/apply.md       → Execution mit AC-Referenzen
src/commands/paul/unify.md       → UNIFY-Struktur, Plan-vs-Actual Vergleich
src/commands/paul/verify.md      → BDD Given/When/Then Prüfung
```

**SEED** (https://github.com/ChristopherKahler/seed)
```
tasks/ideate.md                  → Typ-gesteuerte Exploration
data/application/guide.md        → Gesprächssektionen (Explore/Suggest)
data/application/config.md       → Rigor-Level Konfiguration
data/utility/guide.md            → Tight-Rigor Beispiel (weniger Fragen)
data/utility/config.md           → Tight-Rigor Config
checklists/planning-quality.md   → Quality Gate Kriterien
templates/planning-application.md → PLANNING.md Template
seed.md                          → Entry-Point + Routing-Logik
```

---

## Task 1: Projektstruktur + Installer

**Ziel:** Das npm-Package Skelett mit Installer-Skript.

**Files erstellen:**

### `gsd-cc/package.json`

```json
{
  "name": "gsd-cc",
  "version": "0.1.0",
  "description": "Get Shit Done on Claude Code — structured AI development with your Max plan",
  "bin": {
    "gsd-cc": "./bin/install.js"
  },
  "license": "MIT",
  "keywords": ["claude-code", "ai-development", "project-management", "gsd"]
}
```

### `gsd-cc/bin/install.js`

Installer-Skript (Node.js, wird via `npx gsd-cc` aufgerufen). Muss:

1. `--global` (default) oder `--local` Flag parsen
2. Global: Skills nach `~/.claude/skills/gsd/` kopieren
3. Local: Skills nach `./.claude/skills/gsd/` kopieren
4. `--uninstall` Flag: Skills-Verzeichnis entfernen
5. Erfolgsmeldung: "Done. Open Claude Code and type /gsd to start."

Orientierung: Lies `bin/install.js` aus dem PAUL-Repo (https://github.com/ChristopherKahler/paul/blob/main/bin/install.js) — einfacher Datei-Kopierer, ~80 Zeilen.

### `gsd-cc/skills/` Verzeichnisstruktur (leer anlegen)

```
gsd-cc/skills/gsd/
├── SKILL.md                 (Task 2)
├── seed/
│   ├── SKILL.md             (Task 3)
│   └── types/
│       ├── application/     (Task 4)
│       ├── workflow/        (Task 4)
│       ├── utility/         (Task 4)
│       ├── client/          (Task 4)
│       └── campaign/        (Task 4)
├── discuss/
│   └── SKILL.md             (Task 5)
├── plan/
│   └── SKILL.md             (Task 6)
├── apply/
│   └── SKILL.md             (Task 7)
├── unify/
│   └── SKILL.md             (Task 8)
├── status/
│   └── SKILL.md             (Task 9)
├── auto/
│   ├── SKILL.md             (Task 10)
│   └── auto-loop.sh         (Task 11)
├── checklists/
│   ├── planning-ready.md    (Task 12)
│   └── unify-complete.md    (Task 12)
├── templates/
│   ├── STATE.md             (Task 13)
│   ├── PLAN.xml             (Task 13)
│   ├── UNIFY.md             (Task 13)
│   └── PLANNING.md          (Task 13)
└── prompts/
    ├── plan-instructions.txt    (Task 14)
    ├── apply-instructions.txt   (Task 14)
    ├── unify-instructions.txt   (Task 14)
    └── reassess-instructions.txt (Task 14)
```

**Commit:** `feat: project skeleton with installer`

---

## Task 2: Haupt-Skill `/gsd` (Router + Wizard)

**Ziel:** Der eine Einstiegspunkt. Liest State, routet zur richtigen Aktion.

**Vorher lesen:**
- GSD v1 `commands/gsd/progress.md` — wie Status erkannt und dargestellt wird
- PAUL `src/commands/paul/progress.md` — wie "ONE next action" funktioniert
- Architektur-Dokument Section "Wie sich das Arbeiten anfühlt" → Smart-Routing Tabelle

**File erstellen:** `gsd-cc/skills/gsd/SKILL.md`

```yaml
---
name: gsd
description: >
  GSD project management. Reads .gsd/STATE.md and suggests the one
  next action. Use when user types /gsd, mentions project planning,
  milestones, slices, or tasks. Also triggers when no .gsd/ exists
  and user wants to start a new project.
allowed-tools: Read, Write, Edit, Bash, Glob, Grep
---
```

**Inhalt muss enthalten:**

1. **State-Detection-Logik** — lies `.gsd/STATE.md`, prüfe welche Files existieren
2. **Routing-Tabelle** — exakt wie in der Architektur definiert:
   - Kein `.gsd/` → starte Ideation (delegiere an `/gsd-seed`)
   - PLANNING.md ohne ROADMAP → schlage Roadmapping vor
   - ROADMAP mit offenen Slices → schlage Planung des nächsten vor
   - Plan fertig, nicht ausgeführt → frage manuell oder auto
   - Tasks done, kein UNIFY → erzwinge UNIFY (kein Ausweichen!)
   - UNIFY done → weiter mit nächstem Slice
   - Crash/Interrupt erkannt (auto.lock existiert) → Recovery anbieten
   - Alles done → Milestone complete
3. **UX-Regeln** — in den Skill-Text einbauen:
   - Immer genau EINE vorgeschlagene Aktion
   - Kurze, klare Sprache
   - Kein Menü, kein "was willst du tun?"
   - Wenn User "yes", "go", "ja", "weiter" sagt → sofort ausführen

**Commit:** `feat: /gsd main router skill`

---

## Task 3: `/gsd-seed` Ideation Skill

**Ziel:** Typ-aware Projektinkubation (Phase 0).

**Vorher lesen:**
- SEED `tasks/ideate.md` — wie die typ-gesteuerte Exploration funktioniert
- SEED `seed.md` — Entry-Point Logik und Coach-Persona
- GSD v1 `commands/gsd/new-project.md` — wie Fragen gestellt und PROJECT.md erzeugt werden

**File erstellen:** `gsd-cc/skills/gsd/seed/SKILL.md`

```yaml
---
name: gsd-seed
description: >
  Type-aware project ideation. Use when starting a new project,
  when user says /gsd-seed, or when /gsd detects no .gsd/ directory.
  Guides through collaborative exploration shaped by project type.
  Produces PLANNING.md ready for roadmapping.
allowed-tools: Read, Write, Glob
---
```

**Inhalt muss enthalten:**

1. **Coach-Persona** — "Du denkst MIT dem User, du verhörst ihn nicht"
2. **Typ-Erkennung** — aus der Beschreibung des Users den Typ ableiten:
   - Software mit UI/API/Daten → `application`
   - Claude Code Commands/Hooks/Skills → `workflow`
   - Kleines Tool/Script → `utility`
   - Kunden-Website → `client`
   - Content/Marketing/Launch → `campaign`
3. **Type-Config laden** — lies `seed/types/{type}/config.md` für Rigor + Sections
4. **Geführte Exploration** — lies `seed/types/{type}/guide.md`, gehe Section für Section durch
5. **Quality Gate** — nach Exploration `checklists/planning-ready.md` prüfen
6. **Output erzeugen:**
   - `.gsd/PLANNING.md` (aus Template + Antworten)
   - `.gsd/PROJECT.md` (Kurz-Vision)
   - `.gsd/type.json` (z.B. `{"type":"application","rigor":"deep"}`)
   - `.gsd/STATE.md` (initialer State)
   - `.gsd/DECISIONS.md` (leer, mit Header)

**Commit:** `feat: /gsd-seed ideation skill`

---

## Task 4: Typ-Definitionen (5 Typen)

**Ziel:** Guide, Config und Loadout für jeden Projekttyp.

**Vorher lesen:**
- SEED `data/application/guide.md` — Explore/Suggest Muster
- SEED `data/application/config.md` — Rigor-Config
- SEED `data/utility/guide.md` — wie sich "tight" von "deep" unterscheidet
- SEED `data/utility/config.md`

**Files erstellen (15 Dateien, je 3 pro Typ):**

Für jeden Typ (`application`, `workflow`, `utility`, `client`, `campaign`):

### `types/{type}/config.md`

Beispiel für `application`:
```markdown
rigor: deep
sections: 10
demeanor: collaborative-thorough
timeout_multiplier: 2.0
max_turns_multiplier: 1.6
```

Beispiel für `utility`:
```markdown
rigor: tight
sections: 6
demeanor: focused-efficient
timeout_multiplier: 0.5
max_turns_multiplier: 0.6
```

### `types/{type}/guide.md`

Gesprächssektionen im Explore/Suggest Muster. Jede Section hat:
- **Explore:** Die offene Frage die gestellt wird
- **Suggest:** Optionen die angeboten werden wenn User stuck ist
- **Skip-Condition:** Wann die Section übersprungen werden kann

Application (10 Sections): Users & Auth, Data Model, API Design, Frontend/UI, Business Logic, Integrations, Deployment, Security, Performance, Testing Strategy

Utility (6 Sections): Purpose, Input/Output, Edge Cases, CLI Interface, Distribution, Testing

Workflow (8 Sections): Trigger, Steps, Tools/MCP, Error Handling, State, Permissions, Testing, Distribution

Client (7 Sections): Business Goal, Target Audience, Content Strategy, Design Direction, Conversion, SEO, Hosting

Campaign (7 Sections): Goal/KPI, Audience, Channels, Content Types, Timeline, Budget, Measurement

### `types/{type}/loadout.md`

Tool-Empfehlungen pro Typ. Kurze Liste von Technologien/Libraries die für diesen Typ typisch sind.

**Commit:** `feat: 5 project type definitions`

---

## Task 5: `/gsd-discuss` Skill

**Ziel:** Implementation-Entscheidungen vor der Planung erfassen.

**Vorher lesen:**
- GSD v1 `commands/gsd/discuss-phase.md` — Graubereiche erkennen, CONTEXT.md
- PAUL `src/commands/paul/discuss.md` — wie Discuss Entscheidungen loggt
- GSD v1 README Section "Discuss Phase"

**File erstellen:** `gsd-cc/skills/gsd/discuss/SKILL.md`

**Inhalt muss enthalten:**

1. Liest aktuellen Slice aus `.gsd/STATE.md`
2. Liest Slice-Beschreibung aus ROADMAP.md
3. Analysiert was gebaut wird und identifiziert Graubereiche:
   - Visual features → Layout, Dichte, Interaktionen
   - APIs → Response-Format, Error-Handling, Verbosity
   - Datenstrukturen → Schemas, Validierung, Migration
4. Fragt pro Graubereich bis User zufrieden ist
5. Schreibt `.gsd/S{nn}-CONTEXT.md`
6. Appended Entscheidungen zu `.gsd/DECISIONS.md`

**Commit:** `feat: /gsd-discuss skill`

---

## Task 6: `/gsd-plan` Skill

**Ziel:** Research + Task-Dekomposition + AC + Boundaries.

**Vorher lesen:**
- GSD v1 `commands/gsd/plan-phase.md` — Orchestrator-Logik
- GSD v1 `agents/gsd-planner.md` — wie der Planner instruiert wird (WICHTIG, 915 Zeilen, genau studieren: Discovery Levels, Task Breakdown, Dependency Graphs, Goal-Backward Analysis)
- GSD v1 `agents/gsd-researcher.md` — Research-Modi
- PAUL `src/commands/paul/plan.md` — AC-Sections + Boundaries
- Template `PLAN.xml` aus unserem Architektur-Dokument

**File erstellen:** `gsd-cc/skills/gsd/plan/SKILL.md`

**Inhalt muss enthalten:**

1. **Research-Phase** (Subagent, read-only):
   - Spawne Research-Subagent der Codebase + Stack untersucht
   - 4 Modi: ecosystem, feasibility, implementation, comparison
   - Schreibt `.gsd/M{n}-RESEARCH.md`

2. **Dekomposition**:
   - Liest PLANNING.md, ROADMAP.md, CONTEXT.md, RESEARCH.md
   - Zerlegt Slice in Tasks (je 1 Context Window groß)
   - Eiserne Regel: "Ein Task der nicht in ein Context Window passt, ist zwei Tasks"

3. **Für jeden Task im Plan:**
   - `<acceptance_criteria>` im BDD Format (Given/When/Then) — PFLICHT
   - `<boundaries>` mit DO NOT CHANGE Section — PFLICHT
   - `<files>`, `<action>`, `<verify>` (referenziert ACs), `<done>`
   - Tasks referenzieren ihre ACs explizit

4. **Quality Gate** — `checklists/planning-ready.md`:
   - Alle Tasks haben ACs?
   - Boundaries definiert?
   - Kein "TBD" in kritischen Feldern?
   - Tasks passen in ein Context Window?

5. **Output:**
   - `.gsd/S{nn}-PLAN.md` (Slice-Übersicht mit allen ACs + Boundaries)
   - `.gsd/S{nn}-T{nn}-PLAN.md` (pro Task)

**Commit:** `feat: /gsd-plan skill with AC and boundaries`

---

## Task 7: `/gsd-apply` Skill

**Ziel:** Task-Execution im manuellen Modus.

**Vorher lesen:**
- GSD v1 `commands/gsd/execute-phase.md` — Wave-Execution, Subagent-Spawning
- GSD v1 `agents/gsd-executor.md` — wie der Executor instruiert wird
- PAUL `src/commands/paul/apply.md` — Boundary-Enforcement während Execution

**File erstellen:** `gsd-cc/skills/gsd/apply/SKILL.md`

**Inhalt muss enthalten:**

1. Liest nächsten Task aus `.gsd/STATE.md`
2. Liest Task-Plan (`.gsd/S{nn}-T{nn}-PLAN.md`)
3. **Context laden** nach Matrix:
   - Task-Plan ✅
   - Slice-Plan ✅
   - DECISIONS.md ✅
   - Vorherige Task-Summaries ✅
   - Alles andere: NICHT laden
4. **Boundary-Enforcement**: Vor Ausführung die Boundaries aus dem Plan vorlesen, Claude explizit instruieren diese Files NICHT zu ändern
5. **Ausführung**: Task-Aktionen durchführen
6. **Verifikation**: Verify-Schritt ausführen, AC-Status prüfen
7. **Summary schreiben**: `.gsd/S{nn}-T{nn}-SUMMARY.md`
8. **Git Commit**: `feat(S{nn}/T{nn}): {task-name}`
9. **State updaten**: Nächsten Task in STATE.md setzen
10. Wenn letzter Task im Slice: State auf `apply-complete` setzen, `/gsd` wird dann UNIFY erzwingen

**Commit:** `feat: /gsd-apply skill`

---

## Task 8: `/gsd-unify` Skill

**Ziel:** Pflicht-Reconciliation nach jedem Slice.

**Vorher lesen:**
- PAUL `src/commands/paul/unify.md` — UNIFY-Struktur, Plan-vs-Actual
- Unser Architektur-Dokument Section "Phase 4 — Pflicht-UNIFY"
- Unser UNIFY-Template

**File erstellen:** `gsd-cc/skills/gsd/unify/SKILL.md`

**Inhalt muss enthalten:**

1. **Pflicht-Check**: Wenn State `apply-complete` ist aber kein UNIFY.md existiert → UNIFY MUSS jetzt passieren. Kein anderer Befehl darf vorher laufen.
2. **Lesen**: Slice-Plan, alle Task-Summaries, DECISIONS.md
3. **Vergleichen**:
   - Geplante Tasks vs. tatsächlich ausgeführt
   - Geplante ACs vs. tatsächlich bestanden
   - Geplante Files vs. tatsächlich geändert
4. **Dokumentieren**:
   - Plan vs. Actual Tabelle
   - AC-Status Tabelle
   - Entscheidungen die während der Arbeit getroffen wurden
   - Boundary-Violations (hat ein Task verbotene Files angefasst?)
   - Deferred Issues (was wurde auf später verschoben?)
5. **Quality Gate**: `checklists/unify-complete.md` prüfen
6. **Output**: `.gsd/S{nn}-UNIFY.md`
7. **Git**: Squash-Merge des Slice-Branches auf main:
   ```bash
   git checkout main
   git merge --squash gsd/M{n}/S{nn}
   git commit -m "feat(M{n}/S{nn}): {slice-name}"
   ```
8. **Roadmap Reassessment**: Kurze Prüfung ob der Rest der Roadmap noch sinnvoll ist angesichts dessen was gelernt wurde
9. **State updaten**: Phase auf `unified`, nächster Slice wird freigegeben

**Commit:** `feat: /gsd-unify skill with mandatory enforcement`

---

## Task 9: `/gsd-status` Skill

**Ziel:** Fortschritt, Kosten, Loop-Position auf einen Blick.

**Vorher lesen:**
- GSD v1 `commands/gsd/progress.md` — Status-Darstellung
- PAUL `src/commands/paul/progress.md` — "ONE next action" Prinzip

**File erstellen:** `gsd-cc/skills/gsd/status/SKILL.md`

**Inhalt muss enthalten:**

1. Liest `.gsd/STATE.md`
2. Liest alle `S{nn}-PLAN.md` und `S{nn}-UNIFY.md` Files
3. Liest `.gsd/COSTS.jsonl` (wenn vorhanden)
4. Zeigt an:
   - Milestone-Übersicht: welche Slices done/running/pending
   - Pro Slice: AC-Status (x/y passed), UNIFY-Status (ja/nein)
   - Aktueller Task + Phase
   - Token-Verbrauch (wenn COSTS.jsonl existiert)
   - Auto-Mode Status (wenn auto.lock existiert)
5. Schlägt EINE nächste Aktion vor (wie `/gsd`, aber mit mehr Detail)

**Commit:** `feat: /gsd-status skill`

---

## Task 10: `/gsd-auto` Skill

**Ziel:** Entry-Point für den Auto-Modus. Startet auto-loop.sh.

**Vorher lesen:**
- GSD v2 README Section "/gsd auto — The Main Event"
- Unser Architektur-Dokument Section "auto-loop.sh"

**File erstellen:** `gsd-cc/skills/gsd/auto/SKILL.md`

**Inhalt muss enthalten:**

1. Prüft Voraussetzungen:
   - `.gsd/STATE.md` existiert
   - Mindestens ein Slice geplant
   - `jq` installiert (für JSON-Parsing im Bash-Skript)
   - `claude -p` funktioniert (Schnelltest)
2. Fragt nach optionalen Parametern:
   - Budget-Limit (Token-Anzahl, default: unbegrenzt)
3. Startet `auto-loop.sh` via Bash-Tool:
   ```bash
   bash ~/.claude/skills/gsd/auto/auto-loop.sh
   ```
4. Zeigt laufenden Output

**Commit:** `feat: /gsd-auto skill`

---

## Task 11: `auto-loop.sh`

**Ziel:** Die äußere Schleife die `claude -p` in einer Loop aufruft.

**Vorher lesen:**
- Unser Architektur-Dokument — der vollständige `auto-loop.sh` Pseudocode
- GSD v2 README Section "The Loop" — was die State Machine tun soll

**File erstellen:** `gsd-cc/skills/gsd/auto/auto-loop.sh`

**Das Skript muss (in dieser Reihenfolge pro Iteration):**

1. `.gsd/STATE.md` lesen, Phase + Slice + Task extrahieren
2. UNIFY-Enforcement: wenn Phase `apply-complete` und kein UNIFY.md → UNIFY dispatchen
3. Nächste Unit bestimmen (via `claude -p` mit read-only Tools)
4. Budget-Check gegen `.gsd/COSTS.jsonl`
5. Lock-File schreiben (`.gsd/auto.lock`)
6. Prompt bauen nach Context-Matrix (nur relevante Files inlinen)
7. Rigor-basierte Timeouts + Max-Turns setzen
8. `claude -p` dispatchen mit `--output-format json --bare --allowedTools --max-turns`
9. Ergebnis in COSTS.jsonl loggen
10. STATE.md updaten
11. Stuck Detection (erwartetes Artefakt prüfen, max 2 Retries)
12. Git-Commit falls nötig
13. Lock-File freigeben
14. Sleep 2 Sekunden (Rate Limiting)
15. Loop-Abbruch bei: Milestone complete, Budget erreicht, Stuck, Timeout

**Wichtig:**
- `set -euo pipefail` am Anfang
- `trap cleanup EXIT` für Lock-File Aufräumung
- Alle Pfade relativ zu `.gsd/`
- `jq` für JSON-Parsing
- `timeout` Command für Prozess-Timeouts
- Exit-Codes: 0 = complete, 1 = error, 2 = budget/timeout

**Commit:** `feat: auto-loop.sh state machine`

---

## Task 12: Quality Gate Checklists

**Ziel:** Zwei Checklisten die vor Execution und nach UNIFY prüfen.

**Vorher lesen:**
- SEED `checklists/planning-quality.md` — wie Quality Gates formuliert sind

**Files erstellen:**

### `checklists/planning-ready.md`

Prüfkriterien die der `/gsd-plan` Skill checkt bevor Execution starten darf:

- Jeder Task hat mindestens 1 Acceptance Criterion
- Jeder AC hat Given/When/Then Format
- Jeder Task hat eine Boundaries Section (kann leer sein mit "keine Einschränkungen")
- Kein "TBD", "TODO", "later" in Action oder Files Feldern
- Task-Count pro Slice: 1-7 (mehr = Slice aufteilen)
- Jeder Task hat ein `<verify>` das mindestens einen AC referenziert
- Keine zirkulären Dependencies zwischen Tasks

### `checklists/unify-complete.md`

Prüfkriterien die der `/gsd-unify` Skill checkt bevor nächster Slice starten darf:

- Plan-vs-Actual Tabelle vorhanden
- AC-Status Tabelle vorhanden (jeder AC hat Pass/Partial/Fail)
- Deferred Issues Section vorhanden (kann leer sein)
- Boundary Violations Section vorhanden
- Decisions Section vorhanden
- Reassessment-Urteil vorhanden (roadmap still valid / needs update)

**Commit:** `feat: quality gate checklists`

---

## Task 13: Templates

**Ziel:** Vorlagen für die wichtigsten .gsd/ Dateien.

**Vorher lesen:**
- Unser Architektur-Dokument — STATE.md Format, UNIFY Template, Task-Plan XML
- GSD v1 README — STATE.md und PLAN.md Beispiele
- SEED `templates/planning-application.md`

**Files erstellen:**

### `templates/STATE.md`
State-Template mit allen Feldern: milestone, current_slice, current_task, phase, loop_position, unify_required, rigor, project_type, auto_mode, last_updated. Plus Sections: Progress, Acceptance Criteria Tracking, Boundaries Active, Decisions This Slice, Deferred, Blocked.

### `templates/PLAN.xml`
Task-Plan-Template mit `<task>`, `<acceptance_criteria>`, `<boundaries>`, `<action>`, `<verify>`, `<done>`. Inklusive Kommentare die erklären was wohin gehört.

### `templates/UNIFY.md`
UNIFY-Template mit allen Sections: Plan vs Actual, AC Status, Decisions, Boundary Violations, Deferred, Reassessment.

### `templates/PLANNING.md`
Ideation-Output-Template. Generisch genug für alle Typen. Sections: Vision, Users, Requirements (v1/v2/out-of-scope), Tech Stack, Architecture Decisions, Phase Breakdown.

**Commit:** `feat: templates for STATE, PLAN, UNIFY, PLANNING`

---

## Task 14: Prompt-Templates für Auto-Modus

**Ziel:** Die Instruktions-Texte die `auto-loop.sh` an `claude -p` übergibt.

**Vorher lesen:**
- GSD v1 `agents/gsd-planner.md` — wie Planner-Instruktionen aufgebaut sind
- GSD v1 `agents/gsd-executor.md` — wie Executor-Instruktionen aufgebaut sind
- Unser Architektur-Dokument Section "Dynamische Context-Injection"

**Files erstellen:**

### `prompts/plan-instructions.txt`
Instruktionen für den Plan-Dispatch im Auto-Modus. Muss enthalten: Lies die inlineten Context-Dateien, zerlege den nächsten Slice in Tasks, schreibe BDD ACs, definiere Boundaries, schreibe Plan-Files auf Disk.

### `prompts/apply-instructions.txt`
Instruktionen für den Execute-Dispatch im Auto-Modus. Muss enthalten: Lies den Task-Plan, respektiere die Boundaries, implementiere die Aktionen, führe Verifikation durch, schreibe Summary, committe.

### `prompts/unify-instructions.txt`
Instruktionen für den UNIFY-Dispatch im Auto-Modus. Muss enthalten: Lies alle Summaries + den Plan, vergleiche geplant vs. tatsächlich, schreibe UNIFY.md nach Template, prüfe Quality Gate.

### `prompts/reassess-instructions.txt`
Instruktionen für Roadmap-Reassessment. Muss enthalten: Lies alle bisherigen UNIFYs + aktuelle Roadmap, prüfe ob die verbleibenden Slices noch sinnvoll sind, schlage Änderungen vor wenn nötig.

**Jeder Prompt muss:**
- Klar definieren welche Files Claude lesen soll (sind bereits im Prompt inlined)
- Klar definieren welche Files Claude schreiben soll (exakte Pfade)
- Klar definieren was Claude NICHT tun soll
- Mit `--bare` kompatibel sein (kein interaktiver Input nötig)

**Commit:** `feat: auto-mode prompt templates`

---

## Task 15: README + Dokumentation

**Ziel:** README.md das erklärt wie man GSD-CC nutzt.

**File erstellen:** `gsd-cc/README.md`

**Inhalt:**
1. Was GSD-CC ist (1 Absatz)
2. Installation (`npx gsd-cc`)
3. Quick-Start Walkthrough (wie im Architektur-Dokument UX-Section)
4. Commands-Übersicht (Tabelle)
5. Der Lebenszyklus: SEED → DISCUSS → PLAN → APPLY → UNIFY
6. Auto-Modus Erklärung
7. Composable Types (wie man eigene Typen hinzufügt)
8. Voraussetzungen (Claude Code + Max-Plan + Git + jq)
9. Credits (GSD, PAUL, SEED — mit Links)
10. Lizenz (MIT)

**Commit:** `feat: README and documentation`

---

## Task 16: End-to-End Test

**Ziel:** Manuell verifizieren dass der gesamte Flow funktioniert.

**Schritte:**

1. `npx gsd-cc` ausführen → Skills werden installiert
2. In einem leeren Testprojekt `claude` öffnen
3. `/gsd` tippen → sollte Ideation starten (kein .gsd/ Ordner)
4. Ein Utility-Projekt beschreiben → sollte 6 Fragen stellen (tight rigor)
5. PLANNING.md wird erzeugt → Quality Gate prüfen
6. `/gsd` erneut → sollte Roadmapping vorschlagen
7. Roadmap erzeugen lassen → Slices prüfen
8. `/gsd` → sollte Planung vorschlagen
9. Plan erzeugen → ACs und Boundaries prüfen
10. `/gsd` → sollte manuell/auto fragen
11. Manuell ausführen → Tasks, Commits, Summaries prüfen
12. `/gsd` → sollte UNIFY erzwingen
13. UNIFY ausführen → UNIFY.md prüfen
14. `/gsd` → sollte nächsten Slice vorschlagen

**Commit:** `docs: end-to-end test protocol`

---

## Reihenfolge und Abhängigkeiten

```
Task 1  (Skeleton)
  │
  ├── Task 2  (/gsd Router)
  │     └── hängt von keinem anderen Skill ab
  │
  ├── Task 3  (/gsd-seed)
  │     └── Task 4  (Type-Definitionen)
  │
  ├── Task 5  (/gsd-discuss)
  │
  ├── Task 6  (/gsd-plan)
  │     └── Task 12 (Checklists) — wird von Plan referenziert
  │
  ├── Task 7  (/gsd-apply)
  │
  ├── Task 8  (/gsd-unify)
  │     └── Task 12 (Checklists) — wird von UNIFY referenziert
  │
  ├── Task 9  (/gsd-status)
  │
  ├── Task 10 (/gsd-auto) ──► Task 11 (auto-loop.sh)
  │                              └── Task 14 (Prompt-Templates)
  │
  ├── Task 13 (Templates) — kann parallel zu allem laufen
  │
  ├── Task 15 (README)
  │
  └── Task 16 (E2E Test) — ganz am Ende
```

**Empfohlene Reihenfolge:**
1 → 13 → 2 → 3 → 4 → 5 → 6 → 12 → 7 → 8 → 9 → 14 → 11 → 10 → 15 → 16

**Grund:** Templates (13) und Router (2) zuerst, weil alle anderen Skills die Templates und den Router referenzieren. Skills in Lifecycle-Reihenfolge (seed → discuss → plan → apply → unify). Auto-Modus zuletzt weil er alle anderen Skills voraussetzt.
