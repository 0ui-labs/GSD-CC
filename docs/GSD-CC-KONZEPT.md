# GSD-CC — Konzeptdokument

## Was ist GSD-CC?

GSD-CC ist ein Projektmanagement-System für KI-gestützte Softwareentwicklung. Es kombiniert die besten Ideen aus drei existierenden Systemen — GSD, PAUL und SEED — und baut sie als natives Claude Code Skill-System, das mit dem Max-Plan läuft.

Ein Entwickler beschreibt was er bauen will, GSD-CC strukturiert das Vorhaben, zerlegt es in ausführbare Einheiten, und lässt Claude Code die Arbeit erledigen — entweder im geführten Modus oder vollständig autonom.

---

## Das Problem

### KI-Coding-Agenten sind mächtig, aber unzuverlässig über Zeit

Claude Code kann in einer einzelnen Session beeindruckende Arbeit leisten. Es liest Code, schreibt Code, führt Tests aus, bedient Git. Für eine klar definierte Aufgabe die in ein Context Window passt, ist es exzellent.

Aber Software besteht nicht aus einer Aufgabe. Software besteht aus hunderten Aufgaben die aufeinander aufbauen, über Tage und Wochen. Und genau hier scheitern alle aktuellen Ansätze auf unterschiedliche Weise:

**Problem 1: Context Rot.** Je länger eine Session läuft, desto mehr Müll akkumuliert sich im Context Window. Die Qualität sinkt. Claude wird vage, vergisst Entscheidungen, wiederholt sich. Irgendwann ist die Session unbrauchbar.

**Problem 2: Kein Gedächtnis zwischen Sessions.** Du schließt Claude Code, öffnest es morgen wieder, und es weiß nichts mehr. Welche Architektur-Entscheidungen hast du gestern getroffen? Welche Files wurden geändert? Was war der Plan? Alles weg.

**Problem 3: Kein strukturierter Plan.** Die meisten Entwickler öffnen Claude Code und sagen "Bau mir X". Für eine Todo-App reicht das. Für ein Buchungssystem mit Auth, API, Frontend und Deployment ist das ein Rezept für inkonsistenten, unstrukturierten Code.

**Problem 4: Keine Qualitätskontrolle.** Niemand prüft ob das was gebaut wurde dem entspricht was geplant war. Entscheidungen werden getroffen und vergessen. Abweichungen akkumulieren sich unsichtbar. Am Ende hat man Software die "irgendwie funktioniert" aber nicht dem Entwurf entspricht.

### Existierende Lösungen und ihre Grenzen

**GSD v1 (Get Shit Done)** hat dieses Problem als erstes Tool wirklich adressiert. Es ist ein Prompt-Framework für Claude Code: Markdown-Dateien die Claude sagen, wie es planen und ausführen soll. 38.000 GitHub Stars zeigen, dass der Bedarf real ist. Aber GSD v1 hat harte Grenzen: es kann keine frischen Sessions pro Task erzwingen, es hat keinen echten Auto-Modus (nur einen LLM-Self-Loop der Context verbrennt), keine Crash Recovery, und kein Cost Tracking. Es hofft, dass Claude die Prompts richtig befolgt.

**GSD v2** hat versucht, diese Grenzen zu lösen — aber auf dem falschen Weg. Statt Claude Code als Agent zu behalten, haben sie einen komplett eigenen Coding-Agenten gebaut, basierend auf dem Pi SDK eines einzelnen Entwicklers. Das Ergebnis: ein 15.000-Zeilen TypeScript-Projekt das seine eigenen Session-Crashes, Extension-Konflikte und Dispatch-Bugs wartet. Und es läuft nicht auf dem Claude Code Max-Plan — man braucht API-Keys und zahlt pro Token.

**PAUL** hat eine andere Philosophie: Qualität vor Geschwindigkeit. Sein Pflicht-UNIFY-Konzept (jede Arbeitseinheit muss formal abgeschlossen werden) und die BDD Acceptance Criteria sind die richtigste Idee in diesem ganzen Ökosystem. Aber PAUL hat keinen Auto-Modus, kein Cost Tracking, keine Git-Orchestrierung, keine Parallelisierung. Es ist ein manuelles System.

**SEED** löst ein Problem das alle anderen ignorieren: die Qualität des Inputs. Bevor du planst, musst du wissen was du baust — und die richtigen Fragen hängen vom Projekttyp ab. Ein CLI-Tool braucht andere Fragen als eine Client-Website. SEEDs typ-gesteuerte Ideation produziert bessere Pläne, weil es bessere Fragen stellt.

---

## Unsere These

Die richtige Lösung besteht nicht aus einem eigenen Coding-Agenten. Claude Code ist bereits der beste verfügbare Agent — gewartet von einem ganzen Team bei Anthropic, regelmäßig verbessert, mit Subagents, Agent Teams, Plan Mode, und dutzenden Features die kein Einzelprojekt replizieren kann.

Was fehlt, ist eine **Orchestrierungsschicht**: ein System das Claude Code sagt *was* es tun soll und *in welcher Reihenfolge* — nicht *wie* es Code schreiben soll. Diese Schicht braucht keinen eigenen Runtime, keinen eigenen Agent, kein eigenes Framework. Sie braucht:

1. **Struktur** — eine Hierarchie die große Vorhaben in context-window-große Einheiten zerlegt
2. **State auf Disk** — damit Wissen zwischen Sessions überlebt
3. **Disziplin** — damit jede Arbeitseinheit formal abgeschlossen wird bevor die nächste beginnt
4. **Eine äußere Schleife** — die automatisch den nächsten Task dispatcht wenn der vorherige fertig ist

Alles davon lässt sich als Claude Code Skills (Markdown-Instruktionen) plus ein Bash-Skript (die äußere Schleife) implementieren. Kein TypeScript-Projekt, kein Build-Step, keine Abhängigkeiten außer Claude Code selbst.

---

## Was GSD-CC anders macht

### 1. Claude Code ist der Agent, nicht das Opfer

GSD v1 gibt Claude Code Prompts und *hofft* dass es sie befolgt. GSD v2 hat Claude Code komplett ersetzt durch einen eigenen Agenten. GSD-CC geht den dritten Weg: es nutzt Claude Code als das was es ist — einen mächtigen Coding-Agenten — und gibt ihm präzise, phasenspezifische Instruktionen über das Claude Code Skill-System.

Kein Hoffen, kein Ersetzen. Zusammenarbeit.

### 2. Max-Plan statt API-Kosten

Ein entscheidender praktischer Vorteil. Der Claude Code Max-Plan kostet eine fixe monatliche Gebühr und bietet 5x oder 20x mehr Nutzung als Pro. GSD v2 mit Pi SDK braucht API-Keys und rechnet pro Token ab — bei einem Projekt mit hunderten Tasks wird das teuer.

GSD-CC nutzt `claude -p` (Claude Code's nicht-interaktiver Modus), der auf dem Max-Plan läuft. Gleiche Leistung, vorhersehbare Kosten.

### 3. Das Beste aus drei Systemen

Statt ein System von Null zu erfinden, nimmt GSD-CC die bewährtesten Konzepte aus drei Jahren Ökosystem-Entwicklung:

**Von GSD:** Die Idee dass Software in Milestones → Slices → Tasks zerlegt wird, wobei jeder Task in ein Context Window passen muss. Frische Sessions pro Task verhindern Context Rot. Eine State Machine auf Disk ermöglicht autonomes Durcharbeiten. Git-Branches pro Slice halten die History sauber.

**Von PAUL:** Die Einsicht dass jede Arbeitseinheit formal abgeschlossen werden muss. Der UNIFY-Schritt vergleicht was geplant war mit dem was passiert ist, loggt Abweichungen und Entscheidungen, und stellt sicher dass der nächste Slice auf korrektem Wissen aufbaut — nicht auf Annahmen. Dazu: Acceptance Criteria im BDD-Format (Given/When/Then) als erste Klasse im Planungsformat, und explizite Boundaries (DO NOT CHANGE) die verhindern dass Claude in fremdem Code herumpfuscht.

**Von SEED:** Die Erkenntnis dass die Qualität der Planung von der Qualität der Fragen abhängt — und die richtigen Fragen hängen vom Projekttyp ab. Ein REST-API-Projekt braucht Fragen über Endpoints und Auth. Eine Client-Website braucht Fragen über Conversion und Content. SEEDs typ-gesteuertes Rigor-System (tight/standard/deep/creative) beeinflusst nicht nur die Ideation, sondern auch wie aggressiv der Auto-Modus arbeitet: schnelle Timeouts für kleine Utilities, geduldige Sessions für komplexe Architekturen.

### 4. Null Wartungsaufwand

GSD-CC besteht aus Markdown-Dateien und einem Bash-Skript. Keine Abhängigkeiten die veralten. Keine Build-Pipeline die bricht. Keine Framework-Updates die Breaking Changes einführen. Wenn Anthropic morgen Claude Code 3.0 rausbringt mit besseren Subagents, profitiert GSD-CC automatisch — weil Claude Code der Runtime ist, nicht ein Wrapper darum.

---

## Ziel

### Kurzfristig

Ein funktionierendes Skill-System das ein Entwickler mit `npx gsd-cc` installiert, `/gsd` in Claude Code tippt, und sofort mit strukturierter, qualitätsgesicherter Entwicklung beginnen kann — manuell oder autonom.

### Mittelfristig

Das System das Leute nutzen, die mit Claude Code ernsthafte Software bauen. Nicht Demos, nicht Todo-Apps — Produkte. Projekte die Wochen dauern, dutzende Files umfassen, und konsistente Qualität brauchen.

### Langfristig

Ein offener Standard für KI-gestützte Projektplanung. Das `.gsd/` Disk-Format, das Task-Plan-XML mit Acceptance Criteria und Boundaries, das UNIFY-Konzept — all das ist agent-agnostisch. Wenn morgen ein besserer Agent als Claude Code erscheint, migriert man die Skills. Die Planungsartefakte, die Projektstruktur, die Entscheidungshistorie — das alles bleibt.

---

## Wer ist das für?

### Primäre Zielgruppe

Entwickler die Claude Code als ihren primären Coding-Partner nutzen und einen Max-Plan haben. Sie bauen echte Software — nicht Prototypen — und brauchen Struktur die über eine einzelne Session hinaus funktioniert.

Sie wollen nicht:
- Ein zweites Tool lernen das neben Claude Code läuft
- API-Keys verwalten und Token-Kosten tracken
- Enterprise-Theater mit Sprint-Zeremonien und Story Points
- Sich merken wo sie gestern aufgehört haben

Sie wollen:
- Ihre Idee beschreiben und strukturiert umgesetzt bekommen
- Weggehen und wiederkommen zu fertiger Arbeit
- Wissen dass jede Einheit gegen klare Akzeptanzkriterien geprüft wurde
- Saubere Git-History die sie ihrem Team zeigen können

### Sekundäre Zielgruppe

Solo-Gründer und kleine Teams die KI-Coding als Multiplikator nutzen. Sie haben keine dedizierte Projektmanagement-Infrastruktur und brauchen ein System das leichtgewichtig genug ist um es alleine zu bedienen, aber strukturiert genug um konsistente Ergebnisse zu produzieren.

---

## Abgrenzung

### Was GSD-CC ist

- Ein Planungs- und Orchestrierungssystem für Claude Code
- Ein Satz von Skills (Markdown) die Claude Code instruieren
- Ein State-Management-System auf Disk (.gsd/)
- Eine Auto-Loop die Claude Code's `-p` Modus nutzt

### Was GSD-CC nicht ist

- Kein eigener Coding-Agent (Claude Code ist der Agent)
- Kein Ersatz für Claude Code (es baut darauf auf)
- Kein Enterprise-Projektmanagement-Tool (kein Jira, kein Linear)
- Kein Multi-Provider-System (nur Claude, bewusste Entscheidung)
- Kein Framework mit eigenen Abhängigkeiten

---

## Zusammenfassung

Das Problem ist gelöst — die Bausteine existieren. GSD hat gezeigt wie man KI-Entwicklung strukturiert. PAUL hat gezeigt wie man Qualität erzwingt. SEED hat gezeigt wie man bessere Pläne durch bessere Fragen bekommt. Claude Code ist der mächtigste verfügbare Coding-Agent.

Was fehlt ist ein System das diese Ideen vereint und sie dort liefert wo der Entwickler schon arbeitet: in Claude Code. Ohne zweites Tool, ohne API-Kosten, ohne Wartungsaufwand.

Das ist GSD-CC.
