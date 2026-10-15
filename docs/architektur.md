# Architektur: Plugin „Studium Autopilot“

Stand: Phase 2c und Datenkanal (15.10.2026). Ersetzt Templater vollständig. Zielgruppe: Entwickler, die den Vault weiterbauen.
Getestet mit Obsidian 1.14.4 (API-Version); `manifest.json` verlangt darum `minAppVersion` 1.14.4. Erst senken, wenn ältere
Versionen getestet sind.

## Überblick

```
Studium Autopilot/                       (Vault)
├─ .obsidian/plugins/studium-autopilot/  Kern (main.js, manifest.json) – handgeschrieben, kein Build
├─ System/Skripte/*.js                   Erweiterungen und Helfer (CommonJS), vom Kern geladen
└─ System/Gerüste/*.md                   Text-Gerüste ohne Code (z. B. Modul.md für die Aktion „modul“)
```

Der Kern ist bewusst schlank. Er lädt beim Start (`onLayoutReady`) alle Skripte aus `System/Skripte/` per `eval`, startet die
Erweiterungen und stellt drei Dinge bereit:

1. **Kontextobjekt `ctx`** für alle Skripte (ersetzt Templaters `tp`).
2. **Aktionen**: Knöpfe, Befehle und die Ordner-Automatik für neue Notizen.
3. **Hot-Reload**: Wird eine Skriptdatei geändert oder per Sync geliefert, lädt der Kern sie nach 1,5 s neu. Vorher meldet er
   die alte Fassung vollständig ab (siehe „Aufräumen je Skript“). Gelöschte oder umbenannte Skriptdateien werden ebenso
   abgemeldet.

Fehler einer Erweiterung oder Aktion stoppen nie den Rest. Sie erscheinen als Hinweis (Notice) und in der Konsole.

Es gibt keine Gerätschalter. Nach „Vertrauen und Plugins aktivieren“ läuft alles auf Windows, Mac, iPhone, iPad und Android.

## Kontextobjekt `ctx`

| Feld | Inhalt |
|---|---|
| `ctx.app` | Obsidian-`App` |
| `ctx.obsidian` | Modul `obsidian` (Notice, Platform, TFile, MarkdownRenderer …) |
| `ctx.plugin` | die Plugin-Instanz (Anmelden bitte über die Helfer unten, nicht direkt mit `plugin.register…`) |
| `ctx.user.<name>` | `module.exports` jedes Skripts, z. B. `ctx.user.eba(ctx)`, `ctx.user.eba.MODULCODE` |
| `ctx.cm.view`, `ctx.cm.state` | `@codemirror/view` und `@codemirror/state` für echte Editor-Erweiterungen |
| `ctx.system.prompt(frage, vorschlag)` | Eingabefenster → Text oder `null` (Esc) |
| `ctx.system.suggester(texte, werte, _, platzhalter)` | Auswahlliste → Wert oder `null` (Esc) |
| `ctx.date.now(format, tage)` | Datum mit moment, z. B. `ctx.date.now("YYYY-MM-DD", 7)` |
| `ctx.date.jetzt()` | `Date` für „jetzt“; statt `new Date()` verwenden, damit Tests ein Datum vorgeben können (`plugin.testDatum`) |
| `ctx.aktion(name, parameter)` | eine andere Aktion ausführen |
| `ctx.link(aktion, parameter)` | Knopf-Adresse bauen |
| `ctx.oeffnen(datei, { cursor })` | Notiz in Live Preview öffnen, Cursor setzen |
| `ctx.neuZeichnen(pfade?)` | offene Notizen neu zeichnen |
| `ctx.CURSOR` | Platzhalterzeichen für die Cursorposition in erzeugtem Text |

Jede Erweiterung bekommt ihren **eigenen Kontext**: alles aus `ctx` plus die Helfer unten, die sich merken, was dieses Skript
angemeldet hat. Zuweisungen wie `ctx.modell = api` landen trotzdem im gemeinsamen `ctx` (für alle Skripte sichtbar); eine
Ableitung per `Object.create(ctx)` bekommt eigene Felder.

### Aufräumen je Skript (seit 2c)

| Helfer | Wirkung | Abgemeldet durch |
|---|---|---|
| `ctx.an(quelle, ereignis, fn)` | `quelle.on(ereignis, fn)` für `app.workspace`, `app.vault`, `app.metadataCache`; gibt die Referenz zurück | `offref` |
| `ctx.dom(el, typ, fn, opt)` | `addEventListener` auf einem **langlebigen** Element (`document`, `window`, Popout-Dokument) | `removeEventListener` |
| `ctx.intervall(fn, ms)` / `ctx.zeit(fn, ms)` | `setInterval` / `setTimeout`; gibt die ID zurück | `clearInterval` / `clearTimeout` |
| `ctx.stopp(id)` | Timer oder Intervall vorzeitig beenden | – |
| `ctx.entprellen(fn, ms)` | entprellte Funktion (letzter Aufruf zählt, ms Ruhe), Timer über `ctx.zeit` | wie `ctx.zeit` |
| `ctx.codeblock(sprache, fn)` | Codeblock-Prozessor, siehe unten; gibt `{ instanzen(), neu(filter?) }` zurück | Fassung wird ausgetragen |
| `ctx.postprozessor(fn)` | `fn(el, mdCtx)` im gemeinsamen Markdown-Post-Processor des Plugins | ausgetragen |
| `ctx.editor(erweiterung)` | CodeMirror-Erweiterung (z. B. `ViewPlugin`) im gemeinsamen Editor-Array, `updateOptions()` | herausgenommen |
| `ctx.aufraeumen(fn)` | beliebige Aufräumfunktion, z. B. `ctx.aufraeumen(ctx.modell.beiAenderung(neu))` | wird aufgerufen |
| `ctx.bleibend(schluessel, anfang)` | Wert, der den Hot-Reload überlebt (gewählter Monat, Hörerliste, Protokoll); beim Entladen des Plugins vergessen | – |

Ablauf beim Hot-Reload eines Skripts (und für alle beim Entladen des Plugins oder bei „Erweiterungen neu laden“):

1. Neue Fassung auswerten. Bei einem Syntaxfehler bleibt die alte aktiv.
2. `abmelden()` der alten Fassung (optional, für Dinge außerhalb der Helfer, z. B. zurückgenommene Prototyp-Änderungen).
3. Alles abmelden, was die alte Fassung über die Helfer angemeldet hat (rückwärts), offene Timer beenden.
4. Ihre Aktionen und Befehle entfernen (`removeCommand`).
5. Neue Fassung starten (`aktionen` übernehmen, `registrieren()`), offene Notizen neu zeichnen.

**Codeblöcke:** `ctx.codeblock(sprache, fn)` meldet je Sprache genau **einen** Prozessor je Plugin-Instanz an. Er ruft immer die
gerade geladene Fassung `fn(quelle, el, mdCtx, inst)`. Änderungen an Codeblock-Skripten greifen darum sofort, ohne
`app:reload`. `inst` ist je gezeichnetem Block ein Objekt `{ quelle, el, ctx, sprache }`; Skripte dürfen eigene Felder anhängen
(z. B. `inst.zustand`). Der Kern vergisst den Block, wenn Obsidian den Abschnitt entlädt. `griff.instanzen()` liefert die
angezeigten Blöcke, `griff.neu(filter?)` zeichnet sie mit der aktuellen Fassung neu. Fehlt das Skript (gelöscht, Fehler), zeigt
der Block seinen Text. Achtung: Eine Notiz in der Leseansicht hat zusätzlich einen versteckten Editor mit eigenen Instanzen.

**Befehle:** Jede Aktion mit `titel` wird ein Befehl `aktion-<name>`. Die gleiche ID ersetzt den alten Befehl (keine Doppelten).
Beim Abmelden eines Skripts entfernt der Kern seine Befehle; zusätzlich blendet `checkCallback` einen Befehl aus, dessen Aktion
fehlt.

Je Aktionsaufruf bekommt die Aktion eine Ableitung `c` (`Object.create(<Kontext des Skripts>)`) mit drei zusätzlichen Feldern:

- `c.parameter`: Werte aus dem Knopf, als Strings.
- `c.datei`: die leere Notiz, die befüllt werden soll (nur bei der Ordner-Automatik), sonst `null`.
- `c.quelle`: die Notiz, in der der Knopf steht.

## Skripttypen

Jedes Skript ist CommonJS: `module.exports = function (ctx) { … return { … }; }`.

- **Helfer** (z. B. `eba.js`, `alma.js`, `unterlagen.js`): werden nur geladen. Aufgerufen werden sie von anderen Skripten,
  z. B. `ctx.user.eba(c)`.
- **Erweiterungen**: Der Quelltext enthält `registrieren(` oder `aktionen:`. Der Kern ruft dann die Fabrik mit `ctx` auf und
  nutzt das Ergebnis:
  - `registrieren(plugin)`: Codeblöcke, Post-Processor, Ereignisse anmelden, **nur über die Helfer in `ctx`**. Läuft beim
    Start und nach jedem Hot-Reload; der Kern hat die alte Fassung vorher abgemeldet, es gibt also nichts zu prüfen oder
    zu ersetzen.
  - `start()`: läuft nur beim App-Start (z. B. Dashboard-Tab in `start.js`).
  - `aktionen: { name: { titel, ausfuehren(c), ordner?, editor? } }`: siehe unten.
  - `abmelden()`: optional, vor dem Hot-Reload und beim Entladen des Plugins; für Dinge, die die Helfer nicht abdecken
    (`start.js` nimmt die Messkorrektur zurück, `tabellen.js` die Erweiterung der Bases-Tabelle, `menue.js` trennt Beobachter
    und entfernt seine Knöpfe).

Erweiterungen werden alphabetisch gestartet. Abhängigkeiten laufen über `ctx.user`, das dann schon vollständig ist.

| Skript | Aufgabe |
|---|---|
| `start.js` | Dashboard als erster angepinnter Tab, Leseansicht, Seitenklasse aus `typ`, Folien vorfalten (iPhone), Messkorrektur |
| `aktionen.js` | Knopf-Aktionen (siehe Liste) |
| `notizen.js` | Notiz-Aktionen mit Ordner-Automatik |
| `kalender.js`, `termine.js`, `klausurzeit.js`, `verlauf.js`, `todos.js`, `vorlesung.js` | Codeblöcke `eba-kalender`, `eba-agenda`, `eba-klausurzeit`, `eba-verlauf`, `eba-todos`, `eba-vorlesung` |
| `menue.js`, `tabellen.js`, `leer.js` | Bereiche-Menü, Bases als Liste auf dem iPhone (experimentell), leere Mitschriften löschen |
| `eba.js`, `alma.js`, `unterlagen.js` | Helfer: Semester, Module, Datumseingabe, `ablegen()`; Alma-Stundenplan; Eingang einordnen |
| `modell.js` | Datenmodell `ctx.modell`, Abgleich der abgeleiteten Felder in den Einstellungen, Codeblock `eba-semesterdaten` |
| `verbindungen.js` | Verbindungen und Schloss: Codeblöcke `eba-schloss`, `eba-verbindungen`; Aktionen `verbinden`, `verbindung-aktualisieren`, `trennen` |
| `personalisieren.js` | Karte `eba-personalisieren`, Formular (Aktion `personalisieren`) |
| `musterplan.js` | Musterstudienpläne als eigene Darstellung, Codeblock `eba-musterplan` |
| `zentral.js` | Datenkanal „Zentrale Daten“: Abruf, Prüfung, Übernahme als Termin-Notizen, Semesterdaten, Abrufer-Sperre (`ctx.zentral`), Aktionen `zentral-aktualisieren`, `zentral-schalter` |

Beim Start schreibt das Plugin keine Datei. Die Agenda (`eba-agenda`) wird live gerendert, wie der Kalender. Einzige
Ausnahme seit 2b: Weichen die abgeleiteten Felder in `System/Einstellungen.md` vom berechneten Inhalt ab (siehe „Zentrale
Daten“), werden sie einmal nachgezogen. Im Normalfall sind sie gleich, dann wird nichts geschrieben. Der Datenkanal
(`zentral.js`) ruft frühestens 20 s nach dem Einlesen ab und schreibt nur nach einem erfolgreichen Abruf mit geänderten Daten
(siehe „Datenkanal“).

**Codeblock-Argumente:** Obsidian übergibt einem Codeblock-Prozessor nur den Inhalt. Das Argument in der Kopfzeile
(z. B. `eba-schloss alma`) liest `ctx.modell.blockArgument(el, c, sprache, erlaubt, vorgabe)` aus dem Abschnitt. Der Inhalt
des Blocks ist nur Ersatztext für den Fall, dass das Plugin nicht läuft. Seit 2c ruft der eine Prozessor je Sprache immer die
aktuelle Fassung (`ctx.codeblock`); `app:reload` ist für Änderungen an Codeblock-Skripten nicht mehr nötig.

## Aktionen und Linkformat

Ein Knopf ist ein normaler Markdown- oder HTML-Link:

```
obsidian://studium-autopilot?aktion=<name>&<parameter>=<wert>
```

Die Werte sind URL-kodiert. Ein `+` bleibt `+`; Leerzeichen als `%20` schreiben.

- **Klick-Abfangen:** Der Kern hört im Capture-Modus auf `document` und jedes Popout-Fenster. Bei
  `a[href^="obsidian://studium-autopilot"]` ruft er `preventDefault` und `stopPropagation` auf, bevor Obsidian, CodeMirror
  oder Bases den Link sehen. Er blockt `mousedown`, `mouseup`, `pointerdown`, `auxclick` und `contextmenu` und führt die Aktion
  beim `click` aus. Das gilt in der Leseansicht, in Live Preview, in Callouts, in Bases-`html()`-Formeln und in Hover-Vorschauen.
  Es öffnet sich keine Seite und es entsteht keine Hilfsnotiz.
- **Rückfall:** `registerObsidianProtocolHandler("studium-autopilot")`, falls der Link von außen kommt (Browser, anderes
  Programm).
- **Zielnotiz:** Statische Knöpfe in Notizen tragen keine Pfade. Ein Post-Processor schreibt beim Rendern
  `data-sa-quelle=<Pfad der Notiz>` an jeden Knopf, auch in Einbettungen und Hover-Vorschauen. Fehlt das Attribut, nimmt der Kern
  die Notiz des Tabs, in dem der Link steht, und sonst die aktive Notiz. Wo ein Ziel nötig ist, steht ein stabiler Schlüssel im
  Link, z. B. `code=B110`. Nur Bases-Formeln dürfen Namen enthalten (`file.basename`), weil Bases sie bei jedem Zeichnen neu
  berechnet. Darum ist `links.js` (Links beim Umbenennen nachziehen) entfallen.

| Aktion | Parameter | Wirkung | Befehl |
|---|---|---|---|
| `vorlesung` | `code` | neue Vorlesungsnotiz (laufende Veranstaltung erkannt; heute schon angelegt → öffnen) | Neue Vorlesungsnotiz |
| `uebungsblatt` | `code` | neues Übungsblatt | Neues Übungsblatt |
| `termin` | `titel`, `wann`, `code` | neuer Termin | Neuer Termin |
| `lehrveranstaltung` | `code` | Stundenplan-Eintrag von Hand | Neuer Stundenplan-Eintrag |
| `sq-kurs` | – | SQ-Leistung | Neuer SQ-Kurs |
| `modul` | `code` | eigenes Modul aus `System/Gerüste/Modul.md` | Neues eigenes Modul |
| `oeffnen` | `notiz`, `original=1` | Datei der Unterlage extern öffnen (PC: Standardprogramm, iOS: Dateien-App) | ja |
| `pdf` | `notiz` | PDF-Ansicht klein ↔ groß (`cssclasses`) | ja |
| `plan` | `modul` (Code oder Name) | `gewaehlt` umschalten | – |
| `variante` | `wert` | `variante` in `System/Einstellungen.md` | ja (mit Auswahl) |
| `design` | `wert` (z. B. `paper-tuebingen`) | Farbschema umschalten | ja (mit Auswahl) |
| `einordnen` | `code` | Eingang einordnen | ja |
| `stundenplan` | `link=neu` | Alma-Stundenplan aktualisieren, ohne Link verbinden | ja |
| `verbinden` | `id` (alma, ilias, assistent) | Verbinden-Fenster bzw. Erklärung | ja (mit Auswahl) |
| `verbindung-aktualisieren` | `id` | Verbindung jetzt abrufen | ja |
| `trennen` | `id` | Link auf diesem Gerät löschen (mit Rückfrage) | ja |
| `personalisieren` | – | Formular Name, Studienbeginn, Variante, Zielnote | ja |
| `personalisieren-ausblenden` / `-zeigen` | – | Karte auf dem Dashboard gerätelokal aus/ein | nur „zeigen“ |
| `alma-link` | – | Alma-Link neu eingeben | ja |
| `suchen` | `q` | Obsidian-Suche öffnen | – |
| `zeigen` | `notiz` | Notiz öffnen (Stundenplan-Raster in Bases) | – |
| `seitenlink` | – | `[[Folien.pdf#page=N\|S. N]]` einfügen (Editor) | ja |
| `zentral-aktualisieren` | – | Zentrale Daten jetzt abrufen (mit Hinweis zum Ergebnis) | ja |
| `zentral-schalter` | `was` (`daten` \| `veranstaltungen`), `wert` (`1`/`0`, optional) | Schalter in `System/Einstellungen.md` setzen (ohne `wert`: umlegen) | – |

Zusätzlich gibt es den Befehl **„Neue Notiz aus Vorlage …“** (`studium-autopilot:neue-notiz`, Strg/Cmd+Umschalt+N). Er bietet
alle Aktionen mit `ordner` zur Auswahl an. Der Befehl **„Erweiterungen neu laden“** lädt alle Skripte neu.

Nur Aktionen, die bewusst eine Notiz anlegen, öffnen danach genau diese Notiz. Alle anderen lassen die aktive Notiz und die Tabs
unverändert.

**Ordner-Automatik:** Aktionen mit `ordner: ["Vorlesungen"]` befüllen eine neue, leere Notiz in diesem Ordner oder einem
Unterordner. Bei mehreren Treffern gilt der längste Ordner. Voraussetzung: Die Notiz wurde auf diesem Gerät angelegt und ist in
den ersten etwa 1,5 s die aktive Datei. Per Sync ankommende Dateien werden darum nie befüllt. Eine „Unbenannt“-Notiz wird
umbenannt und verschoben. Bei Esc in der ersten Frage wird die leere Notiz gelöscht.

**Alma-Verbindung:** `ctx.user.alma(c)` bietet (seit 2b auch `linkPruefen(link)`, `fehler()`, `status().seit`):

- `status()` → `{ verbunden, stand }`
- `verbinden(link?)`
- `trennen()`
- `aktualisieren()`
- `aktualisierenOderVerbinden({ neuerLink })`

Der Link liegt nur gerätelokal (`app.saveLocalStorage`).

## Datenmodell `ctx.modell` (Phase 2b)

`modell.js` rechnet einmal aus `System/Daten/Semester.md`, `System/Einstellungen.md`, `Module/`, `Termine/` und `Stundenplan/`.
Jede Änderung im metadataCache (`changed`, `deleted`, `rename`, `resolved`) markiert das Modell als veraltet; der nächste
Zugriff rechnet neu. Damit sieht kein Skript veraltete Daten. Wer bei Änderungen neu zeichnen will, meldet sich mit
`ctx.modell.beiAenderung(fn)` an (entprellt, 600 ms, nur für Änderungen in den genannten Ordnern).

| Aufruf | Ergebnis |
|---|---|
| `daten()` | `{ heute, name, variante, zielnote, studienbeginn, studienbeginnStandard, startSemester, semesterliste[], aktuell, fachsemester, vorStart, lehrphase, pausen[], freieTage[], pruefungsphasen[], rueckmeldung[], module[], termine[], stundenplan[], abgeleitet, personalisiert, zentral }` |
| `semesterVon(iso)` | Semester (zentral oder nach Regel) zu einem Datum, z. B. für den Alma-Import |
| `semesterNachName(name)`, `semesterAuswahl()`, `vorschau(studienbeginn)` | für das Formular |
| `modulSemester(fm)` | `semester_geplant`, sonst Musterplan-Semester der gewählten Variante |
| `woche(iso?)` | Lage an einem Tag (Standard heute): `{ art, nr, gesamt, pause, phase, tage, text, semester }`, siehe „Wochen“ |
| `vorlesungswochen(semester)` | `{ wochen: [{ mo, so, nr, pause }], gesamt }` der Vorlesungszeit (`nr` 0 = Pausenwoche) |
| `semesterFuer(iso)` | Semester eines Tages aus deiner Liste (vor Studienbeginn das erste), sonst zentral bzw. nach Regel |
| `abgleichen(grund)` | abgeleitete Felder in die Einstellungen schreiben, nur bei Abweichung; `true`, wenn geschrieben |

`semesterliste[]` enthält `{ fs, name, beginn, ende, vb, ve, status, hinweis }`, `module[]` je Modul `{ f, fm, code, fs,
fsEmpfohlen, status, semester, semesterQuelle ("eigen" | "musterplan" | ""), musterplan }`.

`ctx.modell.beiAenderung(fn)` gibt eine Abmeldefunktion zurück; Erweiterungen geben sie an `ctx.aufraeumen`. Die Hörerliste
liegt in `ctx.bleibend` und überlebt einen Hot-Reload von `modell.js`.

Nutzer: `eba.js` (`aktuellesSemester`, `semesterZeile`), `verlauf.js`, `vorlesung.js`, `klausurzeit.js`, `notizen.js`
(Stundenplan-Eintrag von Hand), `kalender.js` (Termine), `alma.js` (Semester eines Termins), `verbindungen.js`,
`personalisieren.js`, `musterplan.js`. Alle fallen auf `System/Einstellungen.md` zurück, falls `modell.js` fehlt.

**Standardwerte ohne Onboarding:** Leerer `studienbeginn` = das aktuelle Semester (aus dem Datum) ist das 1. Fachsemester.
Leere `variante` = „offen“. Leerer Name = neutrale Begrüßung (Bases-Formel `gruss`).

**Musterplan (variantengenau seit 2c):** Das empfohlene Fachsemester eines Moduls kommt aus `System/Daten/Musterplan.md`, Plan
der gewählten Variante (`plaene[].name` = `variante`), kleinstes `fs` der Einträge mit diesem `code` (SQ100 steht in zwei
Semestern). Steht ein Modul nicht im Plan der Variante (z. B. B220 Marketing bei Economics), hat es kein Musterplan-Semester,
außer du hast es gewählt (`gewaehlt: true`, Knopf „+ Planen“); dann gilt sein Feld `fachsemester`. Bei Variante „offen“ (oder
ohne Musterplan) gilt wie bisher `fachsemester`. Schwerpunktkatalog nie. Semester = `semesterliste[fs-1]`. `semester_geplant`
ist leer und gilt nur, wenn du selbst planst (hat Vorrang).

Dieselbe Regel steht als Bases-Formeln `mpid`, `mpfs`, `fsplan`, `semester` in den 20 Modulseiten mit Tabelle „Mein Stand“
(Spalte „Semester“; „Eigene Planung“ = `semester_geplant`) und in „Noten & ECTS“. Die Formeln lesen `Musterplan.md` und
`Einstellungen.md` direkt (`file(…).properties.eintraege.filter(value.plan == formula.mpid && value.code == code)`).
**Entscheidung 2c: Das Plugin schreibt dafür kein Frontmatter-Feld.** Bases kann die Liste aus `Musterplan.md` selbst
filtern; ein geschriebenes Feld je Modul hieße bei jedem Variantenwechsel bis zu 20 Dateien ändern (Sync-Verkehr,
Konflikte) und eine zweite Wahrheit. `test/mpformel.js` vergleicht Formel und Modell für alle vier Varianten.

Nutzer der Variante im Modell: `verlauf.js` (Lupe: Module außerhalb des Plans erscheinen unter „Wählbar, nicht im Plan“ im
Semester ihres Feldes `fachsemester`), `klausurzeit.js` (Module des aktuellen Fachsemesters über `fsEmpfohlen`).

**Wochen (einheitlich seit 2c):** Überall heißt es „Vorlesungswoche X von Y“, und nur in der Vorlesungszeit. Gezählt wird ab
dem Montag des Vorlesungsbeginns; eine Woche, deren Montag bis Freitag ganz in einer Pause liegt (Weihnachten bis Neujahr),
zählt nicht (WS 2026/27: 16 Vorlesungswochen). Außerhalb: Pause → „Weihnachtspause bis 06.01.“, Prüfungsphase außerhalb der
Vorlesungszeit → „Prüfungsphase bis 13.02.“ (in der Vorlesungszeit: „Vorlesungswoche 16 von 16 · Prüfungsphase“), vor dem
Vorlesungsbeginn → „noch N Tage bis Vorlesungsbeginn“ (heute/morgen), danach → „vorlesungsfrei“. Quelle ist
`ctx.modell.woche()`; dieselbe Regel steht als Bases-Formel `wochetext` (mit `vw0`, `vti`, `vnw`, `pwa`, `pwb`, `vnr`, `vges`,
`inph`, `phbis`) im Dashboard. Nutzer: Dashboard (Kopf des Semesterverlaufs), `verlauf.js` (Satz im Kopf, Semester-Puls),
`vorlesung.js` (Kopf der Vorlesungsnotiz: Woche des Notizdatums, Perlen mit Vorlesungswochen). Die Leiste „Semesterverlauf“
im Dashboard zeigt weiter alle Kalenderwochen des Semesters als Grafik.

## Zentrale Daten (Paket B)

`System/Daten/Semester.md` – Format: Markdown mit Frontmatter (Listen von Objekten, Datumsangaben ISO), weil

- der metadataCache sie ohne Dateizugriff liefert (auch auf iPhone/iPad); eine `.json` müsste man asynchron lesen;
- Obsidian die Notiz auf allen Geräten anzeigt (eine `.json` erscheint nicht in der Dateiliste);
- Bases-Formeln sie bei Bedarf mit `file("System/Daten/Semester.md").properties` lesen könnten.

Felder: `semester` (name, beginn, ende, vorlesung_beginn, vorlesung_ende, status, hinweis), `pausen` (name, von, bis, status),
`freie_tage` (name, datum, status), `pruefungsphasen` (art, semester, von, bis, status, hinweis), `rueckmeldung` (fuer, von,
bis, status), `stand`, `quellen`. `status: geschätzt` = noch nicht veröffentlicht; `hinweis` nennt die Begründung.
Für Semester ohne Daten rechnet `modell.js` nach einer Regel (erster Montag ab 10.10. bzw. 10.4., 17 bzw. 15 Wochen); sie
stimmt mit allen veröffentlichten Semestern 2026–2029 überein.

**Ableitung und Schreiben:** Bases-Formeln können kein Plugin-JS aufrufen. Darum schreibt `abgleichen()` die abgeleiteten
Felder `semesterliste` (`fs|name|beginn|ende|vb|ve`, FS 1–6, bei längerem Studium bis zum aktuellen Semester), `pausen`
(`von|bis|name`, nur Zeiträume, keine Einzeltage) und `pruefungsphasen` (`von|bis|art|status`) nach `System/Einstellungen.md`.
Auslöser: Änderung an `Einstellungen.md` oder `Semester.md` (1,5 s entprellt), einmal beim App-Start (3 s nach dem Einlesen)
und nach dem Speichern im Formular. Geschrieben wird nur, wenn der Inhalt abweicht, und nie ohne zentrale Daten (z. B. wenn
der Sync noch läuft). Der Abgleich beim Start fängt Updates der Vorlage und den Semesterwechsel bei leerem Studienbeginn ab.
Protokoll: `ctx.modell.protokoll` (Liste der Schreibvorgänge mit Zeit und Grund).

`System/Daten/Musterplan.md` – gleiche Form: `plaene` (id, name), `eintraege` (plan, fs, code, titel, ects, op, art:
schwerpunkt | profil | abschluss), `hinweise` (plan oder „alle“, Text in eigenen Worten), `stand`, `quelle`. Darstellung:
Codeblock `eba-musterplan [economics|ba|ohne|alle|andere]` (ohne Argument: Variante aus den Einstellungen, bei „offen“ alle
drei; `andere` = die übrigen). Spalten je Fachsemester mit deinem Semesternamen, Modul-Chips (öffnen die Modulnotiz, ✓ wenn
bestanden, „OP“ = Orientierungsprüfung), Platzhalter, ECTS je Semester; schmal (Container unter 520 px) untereinander.
Keine Bilder der Uni im Projekt.

### Datenkanal (`zentral.js`, seit 15.10.2026)

Der Autor verteilt Termine, Fristen und Semesterdaten an alle über ein öffentliches GitHub-Pages-Repo
(`https://studium-autopilot.github.io/ecoba-daten/v1/`, Konstante `BASIS`). Das Plugin holt **nur JSON, nie Code**. Format,
Grenzen, Freigabelisten und id-Regel: **`docs/daten-v1.md`** (Vertrag für den Export der zentralen Daten).

```
manifest.json ──▶ Prüfsummen geändert? ──▶ termine.json / semester.json ──▶ SHA-256 prüfen ──▶ Einträge einzeln prüfen
      │ pause/kein Netz → nichts            │ abruf.json: anderes Gerät frisch → nichts schreiben
      ▼                                     ▼
 Status (gerätelokal)                Termine/*.md (herkunft: zentral)  +  System/Daten/Semester.md (nur bei Änderung)
```

- **Wann:** `registrieren()` plant den ersten Lauf 20 s + Zufall 0–10 Min. nach dem Einlesen (auch nach einem Hot-Reload), dann
  stündlich über `ctx.intervall`; dazu Aktion/Befehl „Zentrale Daten jetzt aktualisieren“. Ändert sich der Filter (Variante,
  Plan, Schalter), wendet das Abrufer-Gerät den letzten Stand ohne Netz neu an (`abrufen({ nurCache: true })`, 5 s entprellt über
  `ctx.modell.beiAenderung`). Hinweise (Notice) nur beim Knopf, nie beim automatischen Lauf.
- **Gerätelokal** (`app.saveLocalStorage`): `eba-geraet` (zufällige Geräte-ID), `eba-zentral-stand` (letzter Abruf, Fehler,
  Pause, Hinweis, `plugin_aktuell`, Prüfsummen, Filter-Schlüssel, Abrufer ja/nein), `eba-zentral-daten` (letzter geprüfter
  Stand, für Filteränderungen ohne Netz).
- **Nur ein Gerät schreibt:** `System/Daten/abruf.json` (synchronisiert) = `{ geraet, seit, zuletzt, angewendet }`. Schreiben
  darf das Gerät, das dort steht, oder jedes andere, wenn `zuletzt` älter als 3 h ist (dann übernimmt es). Die Datei wird nur
  bei Wechsel, bei geänderten Notizen (`angewendet`) oder spätestens alle 2 h geschrieben – der Puls muss unter der
  Übernahmegrenze liegen, sonst übernähme ein zweites Gerät, obwohl der Abrufer läuft (stündliche Läufe + Timer-Drosselung).
  `angewendet` (id → Kurz-Prüfsumme des Eintrags) merkt sich, was als Notiz geschrieben wurde: Löschst du eine zentrale Notiz,
  kommt sie erst wieder, wenn sich der Termin in den Daten ändert. Kein Abruf ohne Netz schreibt etwas; `abruf.json` steht in
  `.gitignore`.
- **Notizen:** `Termine/JJJJ-MM-TT Titel.md` (`: ` → ` – `, sonst unzulässige Zeichen `-`), Frontmatter in fester Reihenfolge
  (`typ, titel, datum, bis, kategorie, status, ort, modul, code, bereich?, erledigt, quelle, info?, geprueft?, herkunft: zentral,
  zentral_id, entfaellt?, uebersicht, cssclasses, tags`), danach eigene Felder der Nutzer unverändert. Text: `# Titel`,
  `**Datum** · Ort`, `info`, Hinweis „Geschätzt“ bzw. „Entfällt“, `Quelle: [host](url) · geprüft am TT.MM.JJJJ`, dann
  `## Meine Notizen` (beim Anlegen leer erzeugt). Alles ab `## Meine Notizen`, `erledigt`, eigene Tags (`cssclasses`/`tags`
  werden vereinigt) und eigene Felder bleiben. Datum geändert → `fileManager.renameFile` (Links ziehen mit). Geschrieben wird
  nur, wenn der erzeugte Text vom vorhandenen abweicht. Notizen ohne `herkunft: zentral` fasst das Plugin nie an.
- **Wegfall/Filter:** Fehlt eine id: unberührt (nicht erledigt, „Meine Notizen“ leer) → Papierkorb (`vault.trash`, nie
  endgültig), sonst Titel „(entfällt)“ + `entfaellt: true`. Ende > 30 Tage vorbei → unverändert. Fällt mehr als die Hälfte (und
  mehr als 10) auf einmal weg → keiner als entfallen (Schutz gegen kaputte Exporte). Passt ein Termin nicht mehr zum Filter
  (Modul nicht im Plan, Schalter aus): unberührt → Papierkorb, sonst stehen lassen.
- **Bereich** (`bereich`, optional, Freigabeliste in `docs/daten-v1.md`): `schluesselqualifikation` → Feld `bereich` und Tag
  `schlüsselqualifikation` (verwaltet: verschwindet, wenn der Bereich wegfällt; eigene Tags bleiben), Pille „Schlüsselqualifikation
  · freiwillig“ in der Datumszeile des Notizkopfs, in der Agenda (`termine.js`) und der Kalender-Tagesliste (`kalender.js`);
  Dashboard-Formel `art` hängt „ · freiwillig“ an. Unbekannte Felder und Werte ignoriert das Plugin (kein Verwerfen).
- **Filter:** ohne `code` oder mit `bereich` → alle; mit `code` → Modul gewählt, selbst geplant (`semester_geplant`), Status „läuft“/„angemeldet“
  oder `fsEmpfohlen` (Musterplan der Variante, siehe oben) = aktuelles oder nächstes Fachsemester. Schalter in
  `System/Einstellungen.md`: `zentrale_daten` (an/aus), `zentrale_veranstaltungen` („Fachschaft & Veranstaltungen“). **In den
  Einstellungen statt gerätelokal**, weil nur ein Gerät schreibt: Ein Schalter auf einem Nicht-Abrufer-Gerät würde nichts
  bewirken, und die Wirkung (Notizen im Vault) gilt ohnehin für alle Geräte.
- **Semesterdaten:** `semester.json` → `System/Daten/Semester.md`, nur bei inhaltlicher Abweichung (Vergleich `semKanon`, nicht
  der Formatierung), Frontmatter im bisherigen Flow-Stil, Text darunter bleibt. `modell.js` leitet daraus ab wie bisher.
- **Anzeige:** Zeile „Zentrale Daten“ im Codeblock `eba-verbindungen` ohne Schloss: „Aktualisiert vor X Min.“ / „Pausiert“ /
  „Fehler beim letzten Abruf“, `hinweis` aus dem Manifest, „Neue Version verfügbar“ (Link `RELEASES`), wenn
  `plugin_aktuell` > Version im Plugin-Manifest. „Mehr erfahren“ öffnet das Info-Fenster (Datenschutz-Hinweis).
  Termin-Notiz-Kopf und Agenda-Kasten zeigen „geprüft am …“ aus `geprueft`; die Agenda liest den Text nur bis
  `## Meine Notizen`.
- **Für andere Skripte/Tests:** `ctx.zentral` = `{ abrufen(opt), status(), anzeige(), stand(), geraetId(), idAusName(name),
  notizText(alt, eintrag, opt), dateiName(datum, titel), terminePruefen(d), semesterPruefen(d), manifestPruefen(m),
  filterBauen(), modulLinkFuer(code), protokoll, … }`. `abrufen()` liefert einen Bericht (`art`: ok | unveraendert | fehler |
  pausiert | aus | anderes-geraet; `geschrieben`, `angelegt`, `aktualisiert`, `umbenannt`, `entfaellt`, `papierkorb`,
  `verworfen`).
- **Migration (einmalig, nur im Projekt):** Die 109 Termin-Notizen der Vorlage wurden am 15.10.2026 mit
  einem einmaligen Skript (nicht im Repo) zu zentralen Notizen (id-Regel aus dem Dateinamen, Inhalt genau wie vom Plugin
  erzeugt; zwei Dateien mit falschem Datum im Namen umbenannt). Der alte Notiztext ist dabei entfallen (er stand nie in den
  Daten; Inhalte „für alle“ kommen künftig über `info`). Der erste Abruf schreibt darum keine dieser Notizen neu.

## Verbindungen und Schloss

`verbindungen.js` hält eine Registry. Eine Verbindung ist `{ id, name, art ("link" | "bald" | "claude"), satz, kurz?, erklaerung,
schritte, status(), gesperrt(), pruefen(link)?, verbinden(link)?, aktualisieren()?, trennen()? }`.

Texte für Nicht-Techniker (seit 15.10.2026): `satz` = ein Satz Nutzen (Schloss-Karte), `kurz` = höchstens ein Satz im Fenster,
`schritte` = kurze Schritte mit Verb vorn (`**fett**` = Bedienelement, genau wie in Alma/Obsidian benannt), `erklaerung` =
Hintergrund, nur eingeklappt unter „Mehr erfahren“ (`<details class="eba-modal-mehr">`). In Notizen gilt dasselbe Muster mit
`<details class="eba-mehr">` (Einstellungen & Hilfe, Studienverlauf, Termine & Anmeldungen).

| id | Art | Gesperrt, solange … |
|---|---|---|
| `alma` | Link (iCalendar), nutzt `alma.js` (`status`, `linkPruefen`, `verbinden(link, { nurBeiErfolg })`, `trennen`, `fehler`) | kein Link auf diesem Gerät **und** keine Notiz in `Stundenplan/` |
| `ilias` | bald | immer (Erklärung, kein Eingabefeld) |
| `zentral` | Zentrale Daten (`zentral.js`), Knopf Jetzt aktualisieren (aus: Einschalten); die Schalter Zentrale Daten und Fachschaft & Veranstaltungen stehen im Fenster „Mehr erfahren“ | nie (Standard an) |
| `assistent` | „KI-Assistent“, Pille „für Fortgeschrittene“, nur Claude Code | immer (Erklärung: keine Passwörter in Obsidian, auch kein IMAP) |

- Symbole (seit 15.10.2026, iPad-Test): ruhige Lucide-Linien als inline-SVG in `currentColor` (`SYMBOLE`, `ctx.verbindungen.svg(name)`:
  schloss, haken, uhr, extern, warnung, pause, aus), keine Emojis; `setIcon` blieb auf dem iPad leer (wie in `menue.js`).
- Codeblock `eba-schloss <id>`: Solange gesperrt, eine Karte mit Schloss-Symbol, einem Satz und „Verbinden“. Steht der Block in einer Karte
  (Callout), blendet CSS (`:has`) den übrigen Inhalt aus, z. B. das Wochenraster auf Dashboard und Stundenplan. Sind
  Stundenplan-Notizen da (etwa per Sync), gibt es kein Schloss; der Hinweis „auf diesem Gerät nicht verbunden“ steht nur in
  der Übersicht.
- Codeblock `eba-verbindungen`: Übersicht in den Einstellungen (verbunden seit, zuletzt aktualisiert). Je Zeile höchstens
  **ein** Knopf (Verbinden, Aktualisieren, Jetzt aktualisieren, Einschalten oder Mehr erfahren); führt er nicht ins Fenster,
  steht „Mehr erfahren“ als Textlink im Status. Das Fenster enthält den Rest: bei Alma (verbunden) „Neuen Link eingeben“ und
  „Trennen“, bei den zentralen Daten die beiden Schalter (Obsidian-`Setting` mit Umschalter).
- Verbinden-Fenster: vier Schritte (Alma → Mein Studium → Stundenplan → „Daten für iCalendar (ics) exportieren“ → „Link
  kopieren“), Eingabe mit Prüfung (https/webcal, Server alma.uni-tuebingen.de, nicht nur die Startseite), sofortiger Import, Ergebnis mit
  Anzahl. Scheitert der Abruf, bleibt kein Link gespeichert (vorheriger Zustand gilt wieder).
- Gespeichert wird nur gerätelokal (`app.saveLocalStorage`): `eba-alma-ics`, `eba-alma-stand`, `eba-alma-seit`.
- Für andere Skripte: `ctx.verbindungen.gesperrt(id)`, `ctx.verbindungen.schlossKarte(el, id)`.

## Personalisieren

Codeblock `eba-personalisieren` (Dashboard oben) zeigt eine dezente Karte, bis Name **und** Studienbeginn gesetzt sind oder
„Ausblenden“ geklickt wurde (gerätelokal `eba-personalisieren-aus`). Das Formular (Aktion und Befehl `personalisieren`, Knopf in
den Einstellungen) hat Name, Studienbeginn als Semester-Auswahl (mit Vorschau „1. Fachsemester … · heute n. FS“ und Hinweis bei
Beginn im Sommersemester), Variante und Zielnote (1,0–4,0, Komma oder Punkt, gespeichert als „2,3“). Speichern schreibt nach
`System/Einstellungen.md`; leere Felder werden leer (`name:`), nicht `""`. Danach zieht `abgleichen()` die Semesterliste nach.

Codeblock `eba-personalisieren angaben` (Einstellungen & Hilfe, „Deine Angaben“, ersetzt seit 15.10.2026 die Bases-Tabelle, die
leer nur Spaltenköpfe zeigte): solange Name und Studienbeginn leer sind „Noch nichts eingetragen.“ + Knopf „Personalisieren“,
sonst Name, Zielnote, Studienbeginn (Semester, leere Werte „–“) + Knopf „Ändern“. Für Tests: `ctx.personalisieren.angaben(el)`.

Stil aller neuen Teile: `eba-core.css` Abschnitte 43 (Personalisieren, Schloss, Verbindungen, Fenster, Semestertermine) und
44 (Musterpläne), nur mit `--eba-*`-Farbtokens (hell/dunkel, alle Farbschemata).

## Bereiche (seit 15.10.2026: 9 statt 13)

Das Bereiche-Menü (`menue.js`, `ZIELE`, einzige Quelle) zeigt genau neun Kacheln: Dashboard, Studienverlauf, Termine &
Anmeldungen, Prüfungen, Noten & ECTS, Unterlagen, Schwerpunkt-Planer, Kontakte & Links, Einstellungen & Hilfe. Die Icons hängen
an `li:has(> a[data-href$="…"])` (eba-core.css Abschnitt 6). Stundenplan bleibt eine Seite ohne Kachel (Dashboard).

| Seite | Enthält (früher eigene Seite) |
|---|---|
| `Studium/Termine & Anmeldungen.md` | Kalender, Agenda; Abschnitt „Anmeldungen“ (Anmeldungen). cssclasses `eba-s-termine` + `eba-s-anmeldungen` |
| `Studium/Prüfungen.md` | Zeitleiste, Prüfungstermine (eintägige Prüfungen; Phasen zeigt die Zeitleiste als Band); Karte „Regeln“ |
| `Studium/Noten & ECTS.md`, `Studium/Studienverlauf.md` | je eine Karte „Regeln“ (Prüfungsordnung) |
| `Studium/Unterlagen.md` | Abschnitt „Übungsblätter“ oben (Übungsblätter) |
| `Studium/Kontakte & Links.md` | Abschnitt „Offizielle Dokumente“ (Quellen) |
| `Studium/Einstellungen & Hilfe.md` | Angaben, Variante, Verbindungen, Semesterdaten; Abschnitt „Hilfe“ (Anleitung) und „Stand der Angaben“ (Quellen, offene Punkte) |

- **Regeln:** Die Prüfungsordnung steht nach Thema in Karten `> [!eba-karte|regeln]- Regeln` unter `## Regeln` (Links
  `[[Prüfungen#Regeln]]` usw.). An-/Abmeldung, Rücktritt, Wiederholung, Bestehen, Einsicht → Prüfungen; Gesamtnote,
  Notenstufen und Schnitte, Zusatzleistungen → Noten & ECTS; Aufbau (ECTS je Variante), Orientierungsprüfung, Fristen,
  Bachelorarbeit, Ausland, IBA/IEco → Studienverlauf. Stil: eba-core.css 37.regeln.
- **Einstellungen:** Die Daten bleiben in `System/Einstellungen.md` (Frontmatter; alle Skripte und Bases-Formeln lesen
  diesen Pfad). Die Datei zeigt nur noch einen Hinweis. Sichtbar ist `Studium/Einstellungen & Hilfe.md`: ihre Bases filtern
  `file.path == "System/Einstellungen.md"`, die Knöpfe (`variante`, `personalisieren`) schreiben dorthin.
- **Rückverweise der Bases:** Termin-Notizen tragen `uebersicht: "[[Prüfungen]]"` (Kennzahl und Fristen-Liste auf dem
  Dashboard lesen `file("Studium/Prüfungen.md").backlinks`), Übungsblätter `uebersicht: "[[Unterlagen]]"` (Kennzahl „Übungsblätter“
  auf Unterlagen filtert die Rückverweise nach `typ`). `notizen.js` schreibt diese Felder.

## Keine Dopplungen (seit 15.10.2026)

Jede Angabe steht an einer Stelle; andere Seiten verlinken dorthin. Semestertermine nur im Studienverlauf (Einstellungen &
Hilfe verlinkt `[[Studienverlauf#Semestertermine]]`), Wochenplan nur auf Stundenplan, nächste Frist nur als erste Zeile der
Dashboard-Liste „Fristen · 30 Tage“, nächste Prüfung und Notenschnitt nur als Dashboard-Kacheln (eba-verlauf zeigt ECTS und
Orientierungsprüfung), andere Musterplan-Varianten nur auf `System/Daten/Musterplan` (Codeblock-Argument `andere` bleibt
nutzbar). Die Variante wählst du „vor dem 3. Fachsemester“ (ab dann unterscheiden sich die Musterpläne; die PO legt keinen
Zeitpunkt fest), überall in diesem Wortlaut.

**Nächste Prüfung, eine Regel:** Quellen sind Termin-Notizen mit `kategorie: Prüfung` (eintägig, also ohne `bis`; ohne
„Nachhol…“) und das Modulfeld `klausur`. Kürzel + Tag zählen nur einmal; die Termin-Notiz gewinnt. So rechnen
`verlauf.js`, `klausurzeit.js`, die Dashboard-Formeln `pt`/`ptk`/`kl` und die Fristen-Liste (Zweig `typ == "modul"` nur,
wenn keine Prüfungs-Termin-Notiz mit gleichem Kürzel am selben Tag existiert; nur gleiches Kürzel reicht nicht, weil die
Zwischentests das Kürzel des Moduls tragen). Die Liste „Prüfungstermine“ auf Prüfungen blendet Phasen-Notizen
(`bis` gesetzt) aus.

Bases-Falle: Ein leeres Feld ist in Formeln und Filtern zwar falsy für `if(feld, …)`, aber `!feld` ist **nicht** wahr.
Für „Feld leer“ `!feld.isTruthy()` schreiben (bzw. `!value.properties.feld.isTruthy()`).

## Erweiterung oder Aktion hinzufügen

1. Datei `System/Skripte/meins.js` anlegen:

   ```js
   module.exports = function (ctx) {
     const app = window.app;
     return {
       registrieren() {
         const block = ctx.codeblock("eba-meins", (quelle, el) => el.setText("Hallo " + ctx.date.now("DD.MM.")));
         const bald = ctx.entprellen(() => block.neu(), 1000);
         ctx.an(app.metadataCache, "changed", (f) => { if (f.path.startsWith("Termine/")) bald(); });
       },
       aktionen: {
         hallo: { titel: "Hallo sagen", ausfuehren: async (c) => new ctx.obsidian.Notice("Hallo " + (c.parameter.name || "")) },
       },
     };
   };
   ```

2. Speichern. Der Hot-Reload lädt die Datei sofort, ein Neustart ist nicht nötig. Auch Änderungen am Codeblock greifen sofort.
3. Knopf in eine Notiz schreiben: `[Hallo](obsidian://studium-autopilot?aktion=hallo&name=Welt)`.

Regeln für Skript-Autoren:

- iOS-sicher bleiben: keine Node-APIs, kein Regex-Lookbehind, kein `.at()`, `findLast` oder `structuredClone`.
- Neue Notizen mit `eba.ablegen(ordner, name, inhalt)` anlegen. `eba.CURSOR` im Inhalt markiert die Cursorposition.
- Alles, was über das Zeichnen hinaus bleibt, **nur über die Helfer** anmelden: `ctx.an`, `ctx.dom`, `ctx.intervall`, `ctx.zeit`,
  `ctx.entprellen`, `ctx.codeblock`, `ctx.postprozessor`, `ctx.editor`, `ctx.aufraeumen`. Nie direkt
  `plugin.register…`, `app.workspace.on`, `setInterval` oder `document.addEventListener`; dann bleibt nach einem Hot-Reload
  nichts doppelt.
- Keine `window.eba…`-Globals. Zustand, der den Hot-Reload überleben soll, kommt in `ctx.bleibend(schluessel, anfang)`; was
  andere Skripte brauchen, in `ctx.<name>` (z. B. `ctx.modell`, `ctx.verbindungen`).
- Listener auf Elementen, die das Skript selbst zeichnet, dürfen normal per `addEventListener` hängen; sie verschwinden mit dem
  Element. `ctx.dom` ist für langlebige Ziele (`document`, `window`).
- Wer etwas außerhalb der Helfer verändert (Prototypen, fremde Objekte), liefert `abmelden()` und nimmt es dort zurück.
- Datum: `ctx.date.jetzt()` bzw. `ctx.date.now()` statt `new Date()`, wenn es um „heute“ geht (Tests mit `plugin.testDatum`).
- Wochen und Semesterlage nur über `ctx.modell.woche()` anzeigen, nicht selbst zählen.
- `registrieren()` darf annehmen, dass die alte Fassung abgemeldet ist; offene Seiten zeichnet der Kern danach selbst neu.

## Tests

- **Ohne Obsidian** (`tests/`, `node --test tests/*.test.js`, keine Abhängigkeiten): reine Logik aus `zentral.js` (id-Regel,
  Dateinamen, Prüfung von Manifest, Terminen und Semesterdaten, Schnappschuss der öffentlichen Daten mit Prüfsummen) und
  `modell.js` (Semesterliste, Semesterregel, Vorlesungswochen, Wochenanzeige). `tests/laden.js` lädt die Skripte mit einem
  kleinen Ersatz für Obsidian.
- **In Obsidian** (Entwickler-PC, nicht im Repo): Oberfläche, Knöpfe, Hot-Reload, Datenkanal mit Testquelle, Bases-Formeln.
  Die Testeinstiege unten machen das möglich.
- **GitHub Actions** (`.github/workflows/pruefen.yml`): `werkzeuge/pruefen.py` (Datenschutz-Scan, Dateitypen, `node --check`,
  iOS-Regeln), die Node-Tests und die Safari-16-Prüfung mit esbuild. Siehe `docs/tests.md`.

Testeinstiege: `plugin.testDatum = "2026-12-29"` setzt „heute“ für `ctx.date` (und damit Modell, Studienverlauf,
Vorlesungsnotiz, Agenda, Kalender, To-dos); `null` = echtes Datum. Bases-Formeln kennen kein Testdatum; Tests zeichnen
die Dashboard-Formeln darum in einer Testnotiz mit `date("…")` statt `today()`. Offene Fenster für Tests:
`ctx.personalisieren.fenster`, `ctx.verbindungen.fenster`.

Antworten auf Eingabefenster setzt du vorab in `plugin.testAntworten` (Liste; `null` = Esc). Den Alma-Abruf ersetzt
`plugin.testAbruf = async ({ url }) => ({ status, text })` (kein Netz, kein echter Link nötig). Danach lassen sich Aktionen auch
direkt aufrufen, z. B. `plugin.aktionAusfuehren("termin", { titel: "X", wann: "20.11." })`.

Datenkanal: `plugin.testZentralAus = true` schaltet den automatischen Abruf ab (gilt bis zum Neuladen des Plugins),
`plugin.testQuelle = async (name) => text` ersetzt den Abruf (`null` = nicht gefunden, Ausnahme = kein Netz),
`plugin.testZentralBasis = "http://127.0.0.1:8765/v1/"` lenkt `requestUrl` auf eine andere Basis, `plugin.testPapierkorbLokal`
legt Gelöschtes in `.trash/` des Vaults statt in den Papierkorb des Systems.

Tests in Obsidian laufen am besten in einem sichtbaren Popout-Fenster. Im verdeckten Hauptfenster drosselt Chromium verkettete
Timer auf einmal pro Minute.

## Bekannte Grenzen

- `tabellen.js` (Bases als Liste) und die Messkorrektur in `start.js` greifen in Interna von Obsidian ein. Beide sind
  abschaltbar.
- Für eigene Bases-Ansichten gibt es seit API 1.10 `plugin.registerBasesView(id, { name, icon, factory, options })`. Das ist ein
  möglicher Ersatz für `tabellen.js`, aber noch nicht umgesetzt.
- Beim Deaktivieren des Plugins meldet `onunload` je Skript alles ab, was über die Helfer angemeldet wurde, und ruft
  `abmelden()`. Die Messkorrektur (`start.js`) und die Bases-Liste (`tabellen.js`) nehmen ihre Prototyp-Änderungen dabei
  zurück.
- Ein Codeblock in einer Notiz, die in der Leseansicht offen ist, existiert zweimal (Leseansicht und versteckter Editor);
  `griff.neu()` zeichnet beide.
- `menue.js` liest noch den Schalter `window.ebaMenueKopfImmer` (Symbol in der Kopfleiste auch am PC, nur zum Ausprobieren).
- Datenkanal: Die Daten kommen von `studium-autopilot.github.io/ecoba-daten` (Organisation `studium-autopilot`). Ohne Netz
  oder bei einem Fehler bleibt der letzte Stand; die Übersicht „Verbindungen“ zeigt dann „Fehler beim letzten Abruf“.
- Datenkanal: Eine gelöschte zentrale Notiz kommt zurück, sobald sich ihr Termin in den Daten ändert (oder `abruf.json` fehlt).
