# Mithelfen

Danke, dass du helfen willst. Am meisten hilft es, Fehler zu melden.

## Fehler oder Termin falsch

Öffne ein [Issue](https://github.com/studium-autopilot/ecoba/issues/new/choose) und wähle eine Vorlage:

- **Fehler:** Etwas funktioniert nicht oder sieht kaputt aus.
- **Termin falsch oder fehlt:** Datum, Frist oder Ort stimmt nicht, oder ein Termin für EcoBA fehlt. Bitte mit Link auf die offizielle Quelle.
- **Idee:** Vorschlag für etwas Neues.

Bitte keine persönlichen Daten ins Issue schreiben (Matrikelnummer, Noten, deinen Alma-Link).

## Pull Requests

Willkommen für:

- Texte und Anleitungen (Tippfehler, klarere Schritte),
- Design und Darstellung,
- Fehlerbehebungen im Plugin und in den Skripten.

**Nicht** für zentrale Daten (Termine, Fristen, Semesterdaten): Die kommen aus dem automatischen Abgleich und liegen in `studium-autopilot/ecoba-daten`. Änderungen dort würden beim nächsten Lauf überschrieben. Melde falsche Termine stattdessen per Issue.

Für Texte und Doku gilt: Keine Mermaid-Diagramme in Markdown, das auf GitHub gelesen wird – die GitHub-App zeigt nur den Code.
Diagramme als PNG unter `docs/bilder/`. `werkzeuge/pruefen.py` meldet einen ```` ```mermaid ````-Block als Fund.

Für Code gilt: Er muss auf iPhone und iPad laufen. Die Regeln für Skripte stehen in [docs/architektur.md](docs/architektur.md) („Regeln für Skript-Autoren“).
Vor dem Pull Request: `npm ci`, dann `npm test` und `npm run lint` (Node 22 oder neuer). GitHub Actions prüft dasselbe.

## Changelog: für Studierende schreiben

`CHANGELOG.md` ist zugleich das Fenster **Was ist neu**, das nach einem Update in der App erscheint. Wer es liest, studiert und
kennt sich mit Technik nicht aus. Darum gelten für jeden neuen Abschnitt feste Regeln (`tests/changelog.test.js` prüft sie):

1. **Nutzen zuerst.** Jeder Punkt sagt, was du jetzt kannst oder was dir erspart bleibt, nicht, was im Code passiert ist.
   „Neue Uni-Termine kommen schneller an“ statt „Abruf der zentralen Daten nach 2 statt 10 Minuten“.
2. **Ein Punkt beginnt mit seiner Art:** **Neu:**, **Einfacher:**, **Schneller:**, **Übersichtlicher:**, **Zuverlässiger:**
   oder **Behoben:**. Bei **Behoben:** steht, was vorher schiefging, so wie man es gesehen hat („Manchmal fehlten …“).
3. **Kurz.** Höchstens zwei Sätze und 240 Zeichen je Punkt, höchstens 12 Punkte je Version. Der Titel der Version nennt den
   wichtigsten Nutzen in höchstens 6 Wörtern.
4. **Keine Fachwörter.** Keine Dateinamen, kein Code in Backticks, keine Wörter wie Manifest, Cache, Index, Plugin, Skript,
   Codeblock, Sync, Prüfsumme, Frontmatter, Callout, Bug, Fix. Fett nur für Knöpfe und Seiten, genau so beschriftet wie in
   der App.
5. **Nur, was man merkt.** Umbauten ohne sichtbare Folge (Aufräumen im Code, Tests, schnellere interne Abläufe) gehören in die
   Commit-Nachricht, nicht hierher.

Veröffentlichte Abschnitte bleiben, wie sie sind; die Regeln gelten ab 0.4.1.

## Keine Lehrmaterialien

Lade keine Folien, Skripte, Übungsblätter, Lösungen oder Altklausuren hoch – weder in Issues noch in Pull Requests. Sie sind urheberrechtlich geschützt.

## Lizenz

Mit einem Beitrag stimmst du zu, dass Code unter [MIT](LICENSE) und Inhalte unter [CC BY 4.0](LICENSE-INHALTE.md) veröffentlicht werden.
