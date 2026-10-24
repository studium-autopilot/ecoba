# Architektur: Tests und Testeinstiege

Teil der Architektur-Doku. Aufbau, `ctx`, Skripttypen und die Regeln für Skript-Autoren stehen im Überblick
[architektur.md](../architektur.md).

## Tests

- **Ohne Obsidian** (`tests/`, `node --test tests/*.test.js`, keine Abhängigkeiten): reine Logik aus `zentral.js` (id-Regel,
  Dateinamen, Prüfung von Manifest, Terminen und Semesterdaten, Schnappschuss der öffentlichen Daten mit Prüfsummen) und
  `modell.js` (Semesterliste, Semesterregel, Vorlesungswochen, Wochenanzeige) sowie `update.js` (Dateiklassen, Liste, Plan je
  Datei, Mischen, alles oder nichts, Kanal; im veröffentlichten Repo zusätzlich die Update-Liste gegen die Dateien), die
  ILIAS-Skripte (siehe [„ILIAS-Unterlagen“](unterlagen.md)), Noten & Anmeldungen und `sperre.js` (siehe [„Noten & Anmeldungen (Alma)“](alma.md)), `quellen.js` (siehe [„Quellen-Vertrag“](quellen.md)),
  `livesync.js` (siehe [„LiveSync“](livesync.md)),
  `alma.js` (Lebenslauf der Notizen, Grabstein, Sperre, Fehler im Status, Verbinden ohne Erfolg), `leer.js`
  (`istLeer`), `fsrs.js` und `karten.js` (siehe [„Karteikarten“](lernen.md)), `woche.js` (Wochenraster), `todos.js` (Auswahl,
  leere Blöcke), `reiter.js` (Reiter mit Zahl) sowie `bitte-pruefen.js` (Protokoll lesen, abhaken), `volltext.js`
  (siehe [„Volltext der PDFs“](unterlagen.md)), `ilias-kalender.js` (siehe [„ILIAS-Kalender“](ilias-kalender.md)), `seit-besuch.js` (siehe [„Seit deinem letzten Besuch“](seiten.md)) und
  `Dashboard.md` mit `dashboard.js` (Kacheln und Listen), das Fachmodell (`tests/fachmodell.test.js`) und die Bases-Formeln auf
  Noten & ECTS gegen das Modell (`tests/bases-regeln.test.js`, Auswerter `tests/bases-formel.js`). `tests/laden.js` lädt die Skripte mit einem kleinen Ersatz für Obsidian.
- **In Obsidian** (Entwickler-PC, nicht im Repo): Oberfläche, Knöpfe, Hot-Reload, Datenkanal mit Testquelle, Bases-Formeln.
  Die Testeinstiege unten machen das möglich.
- **GitHub Actions** (`.github/workflows/pruefen.yml`): `werkzeuge/pruefen.py` (Datenschutz-Scan, Dateitypen, `node --check`,
  iOS-Regeln), die Node-Tests und die Safari-16-Prüfung mit esbuild. Siehe `docs/tests.md`.

Testeinstiege: `plugin.testDatum = "2026-12-29"` setzt „heute“ für `ctx.date` (und damit Modell, Studienverlauf,
Vorlesungsnotiz, Agenda, Kalender, To-dos); `null` = echtes Datum. Bases-Formeln kennen kein Testdatum; Tests zeichnen
die Dashboard-Formeln darum in einer Testnotiz mit `date("…")` statt `today()`. Offene Fenster für Tests:
`ctx.personalisieren.fenster`, `ctx.verbindungen.fenster`, `ctx.einrichtung.fenster`, `ctx.karten.fenster` (Lernfenster),
`ctx.karten.neuFenster`.

Antworten auf Eingabefenster und das Fenster „Neu …“ setzt du vorab in `plugin.testAntworten` (Liste; `null` = Esc, für das
Fenster ein Objekt mit den Eingaben je Feld). Den Alma-Abruf ersetzt
`plugin.testAbruf = async ({ url }) => ({ status, text })` (kein Netz, kein echter Link nötig). Danach lassen sich Aktionen auch
direkt aufrufen, z. B. `plugin.aktionAusfuehren("termin", { titel: "X", wann: "20.11." })`.

Datenkanal: `plugin.testZentralAus = true` schaltet den automatischen Abruf ab (gilt bis zum Neuladen des Plugins),
`plugin.testQuelle = async (name) => text` ersetzt den Abruf (`null` = nicht gefunden, Ausnahme = kein Netz),
`plugin.testZentralBasis = "http://127.0.0.1:8765/v1/"` lenkt `requestUrl` auf eine andere Basis, `plugin.testPapierkorbLokal`
legt Gelöschtes in `.trash/` des Tresors statt in den Papierkorb des Systems.

Update: `plugin.testUpdateAntwort = true/false` beantwortet das Bestätigungsfenster, `plugin.testUpdateBasis =
"http://127.0.0.1:8766/v0.3.0/"` lädt die Dateien von einer anderen Basis (lokaler Server mit Fake-Release); das Manifest mit
`release` liefert `plugin.testQuelle`. `ctx.update.aktualisieren()` gibt den Bericht zurück.

Tests in Obsidian laufen am besten in einem sichtbaren Popout-Fenster. Im verdeckten Hauptfenster drosselt Chromium verkettete
Timer auf einmal pro Minute.
