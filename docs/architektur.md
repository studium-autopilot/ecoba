# Architektur: Plugin „Studium Autopilot“

Stand: 0.4.0, ILIAS-Unterlagen, Wochenraster nach Kalenderwoche und Übungsgruppen (17.10.2026; davor 0.3.1 Update-Hinweis auf
dem Dashboard, 0.3.0 Einrichtung beim ersten Start, Phase 2c, Datenkanal und Update-Knopf in 0.2.0). Ersetzt Templater vollständig. Zielgruppe: Entwickler, die den Tresor weiterbauen.
Getestet mit Obsidian 1.14.4 (API-Version); `manifest.json` verlangt darum `minAppVersion` 1.14.4. Erst senken, wenn ältere
Versionen getestet sind.

## Überblick

```
Studium Autopilot/                       (Tresor)
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

**Warum `eval` und warum das sicher ist.** Obsidian lädt in einem Community-Plugin nur `main.js`; ein `require` von Dateien
im Tresor gibt es auf iPhone und iPad nicht. Ohne Build-Schritt bleibt nur, den Text der Skripte selbst auszuführen. So
lassen sich Skripte im Tresor lesen, ändern und per Hot-Reload testen. Neue Angriffsfläche entsteht dadurch nicht:

- Ausgeführt werden nur Dateien aus `System/Skripte/` im eigenen Tresor. Wer dort schreiben kann, kann auch `main.js`
  ändern; das Vertrauen gilt ohnehin dem Tresor („Dem Ersteller vertrauen und Erweiterungen aktivieren“).
- Was das Plugin von selbst lädt, sind nur Daten. Zentrale Daten werden geprüft und als reiner Text übernommen, nie
  ausgeführt (siehe „Zentrale Daten“). Kursdateien aus ILIAS werden nur abgelegt.
- Neuer Code kommt nur über **Aktualisieren** und nur nach einem Tipp: Die Update-Liste ist über ihre SHA-256 im Manifest
  der zentralen Daten festgelegt, jede Datei über ihre SHA-256 in der Update-Liste, geladen vom unveränderlichen Tag
  `v<version>` dieses Repos (siehe „Update“). Tags und Releases sind auf GitHub gegen Ändern und Löschen gesperrt.

Es gibt keine Gerätschalter. Nach „Dem Ersteller vertrauen und Erweiterungen aktivieren“ läuft alles auf Windows, Mac,
iPhone, iPad und Android.

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
| `start.js` | Dashboard als erster angepinnter Tab, Übersichtsseiten nur in der Leseansicht (siehe unten), Seitenklasse aus `typ`, Folien vorfalten (iPhone), Messkorrektur |
| `aktionen.js` | Knopf-Aktionen (siehe Liste) |
| `notizen.js` | Notiz-Aktionen mit Ordner-Automatik |
| `kalender.js`, `termine.js`, `klausurzeit.js`, `verlauf.js`, `todos.js`, `vorlesung.js`, `gruppen.js`, `angebote.js` | Codeblöcke `eba-kalender`, `eba-agenda`, `eba-anmeldungen`, `eba-klausurzeit`, `eba-verlauf`, `eba-todos`, `eba-vorlesung` und `eba-uebungsblatt`, `eba-gruppen`, `eba-angebote` |
| `menue.js`, `tabellen.js`, `leer.js` | Bereiche-Menü, Bases als Liste auf dem iPhone (experimentell), leere Mitschriften und Übungsblätter beim Verlassen in den Papierkorb (nicht beim Wechsel zu Folien/PDF) |
| `eba.js`, `alma.js`, `unterlagen.js`, `meine-gruppe.js` | Helfer: Semester, Module, Datumseingabe, `ablegen()`; Alma-Stundenplan; Eingang einordnen; deine Übungsgruppe im Stundenplan |
| `modell.js` | Datenmodell `ctx.modell`, Abgleich der abgeleiteten Felder in den Einstellungen, Codeblock `eba-semesterdaten` |
| `verbindungen.js` | Verbindungen und Schloss: Codeblöcke `eba-schloss`, `eba-verbindungen`; Aktionen `verbinden`, `verbindung-aktualisieren`, `trennen` |
| `einrichtung.js` | Einrichtung beim ersten Start (seit 0.3.0, `ctx.einrichtung`): Fenster mit acht Bildschirmen, Zustand in den Einstellungen, Aktion `einrichtung`; siehe „Einrichtung“ |
| `darstellung.js` | Hell, dunkel oder automatisch (seit 17.10.2026) und Design Elfenbein, Flieder oder Klar (seit 18.10.2026), je Gerät (`ctx.darstellung`): Umschalter und Design-Zeilen `eba-darstellung`, Aktionen `darstellung` und `design`; siehe „Darstellung“ |
| `personalisieren.js` | Formular (Aktion `personalisieren`, Parameter `feld` setzt den Cursor), Zeilen „Deine Angaben“ und „Variante“ (`eba-personalisieren angaben` bzw. `variante`, gleiche Zeilenliste wie die Verbindungen; Inhalt aus `angabenZeilen`/`varianteZeilen`); die Karte auf dem Dashboard entfällt seit 0.3.0 |
| `musterplan.js` | Musterstudienpläne als eigene Darstellung, Codeblock `eba-musterplan` |
| `zentral.js` | Datenkanal „Zentrale Daten“: Abruf, Prüfung, Übernahme als Termin-Notizen, Semesterdaten, Abrufer-Sperre (`ctx.zentral`), Aktionen `zentral-aktualisieren`, `zentral-schalter` |
| `update.js` | Update der Vorlage mit einem Knopf (seit 0.2.0, `ctx.update`): Zeile „Studium Autopilot“ in `eba-verbindungen`, Hinweis `eba-update-hinweis` auf dem Dashboard (seit 0.3.1), Aktionen `vorlage-aktualisieren`, `vorlage-neu-laden`; siehe „Update“ |
| `fsrs.js` | Helfer: FSRS-6 und Lernschritte wie in Anki (`ctx.user.fsrs(ctx).planer`), siehe „Karteikarten“ |
| `karten.js` | Karteikarten: Codeblock `eba-karten` (Übersicht, `stapel`, `statistik`, `liste`, `heute`), Lernfenster, Fenster „Neue Karte“ und „Optionen“, Lernstände je Gerät (`ctx.karten`); siehe „Karteikarten“ |
| `schwerpunkte.js` | Abschnitt „Schwerpunkte“ im Studienverlauf (seit 17.10.2026, vorher Seite „Schwerpunkt-Planer“): Codeblock `eba-schwerpunkte`, Regeln der PO für die Schwerpunktbereiche, `ctx.schwerpunkte` (`rechnen`, `sichtbar`); siehe „Bereiche“ |
| `bitte-pruefen.js` | „Bitte prüfen“ auf dem Dashboard (seit 18.10.2026), nur im eigenen Uni-Abgleich: Codeblock `eba-bitte-pruefen`; siehe „Dashboard“ |

Beim Start schreibt das Plugin keine Datei. Die Agenda (`eba-agenda`) wird live gerendert, wie der Kalender. Einzige
Ausnahme seit 2b: Weichen die abgeleiteten Felder in `System/Einstellungen.md` vom berechneten Inhalt ab (siehe „Zentrale
Daten“), werden sie einmal nachgezogen. Im Normalfall sind sie gleich, dann wird nichts geschrieben. Der Datenkanal
(`zentral.js`) ruft frühestens 20 s nach dem Einlesen ab und schreibt nur nach einem erfolgreichen Abruf mit geänderten Daten
(siehe „Datenkanal“). `update.js` legt 20 s nach dem Einlesen einmal `System/Daten/installiert.json` an, wenn sie fehlt
(Erstinstallation, siehe „Update“); sonst schreibt es nur nach dem Tipp auf „Aktualisieren“. `einrichtung.js` öffnet beim
ersten Start höchstens ein Fenster und schreibt dabei nichts; geschrieben wird erst nach einem Tipp in der Einrichtung.

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
| `uebungsblatt` | `code` | neues Übungsblatt (Kopf-Karte `eba-uebungsblatt` wie die Vorlesungsnotiz: Status zum Antippen, Abgabe, Perlen der Blätter des Moduls, Links zu Aufgaben, Musterlösung, eigener Lösung und Übung/Tutorium; Abschnitte Aufgabe, Knackpunkte, Fürs Tutorium) | Neues Übungsblatt |
| `termin` | `titel`, `wann`, `code` | neuer Termin | Neuer Termin |
| `lehrveranstaltung` | `code` | Stundenplan-Eintrag von Hand | Neuer Stundenplan-Eintrag |
| `sq-kurs` | – | SQ-Leistung | Neuer SQ-Kurs |
| `modul` | `code` | eigenes Modul aus `System/Gerüste/Modul.md` | Neues eigenes Modul |
| `oeffnen` | `notiz`, `original=1` | Datei der Unterlage extern öffnen (PC: Standardprogramm, iOS: Dateien-App) | ja |
| `pdf` | `notiz` | PDF-Ansicht klein ↔ groß (`cssclasses`) | ja |
| `plan` | `modul` (Code oder Name) | `gewaehlt` umschalten | – |
| `variante` | `wert` | `variante` in `System/Einstellungen.md` | ja (mit Auswahl) |
| `darstellung` | `wert` (`hell`, `dunkel`, `automatisch`) | Hell, dunkel oder automatisch wie das Gerät | ja (mit Auswahl) |
| `design` | `wert` (`elfenbein`, `flieder`, `klar`) | Design dieses Geräts (seit 18.10.2026; bis 17.10.2026 schaltete `design` die früheren Farbschemata um) | ja (mit Auswahl) |
| `einordnen` | `code` | Eingang einordnen | ja |
| `stundenplan` | `link=neu` | Alma-Stundenplan aktualisieren, ohne Link verbinden | ja |
| `verbinden` | `id` (alma, ilias, zentral, vorlage) | Verbinden-Fenster bzw. Erklärung | ja (mit Auswahl) |
| `verbindung-aktualisieren` | `id`, `uebernehmen=1` (nur ILIAS: hier laden, obwohl ein anderes Gerät lädt) | Verbindung jetzt abrufen | ja |
| `trennen` | `id` | Link bzw. ILIAS-Zugang auf diesem Gerät löschen (mit Rückfrage) | ja |
| `ilias-holen` | – | Unterlagen aus ILIAS holen (Knopf auf Unterlagen); nicht verbunden: Fenster ILIAS-Unterlagen | ja |
| `personalisieren` | – | Formular Name, Studienbeginn, Variante, Zielnote | ja |
| `einrichtung` | `ab` (optional, `2` = ab Studienbeginn, vorausgefüllt) | Einrichtung öffnen (Knopf „Einrichtung erneut starten“ in den Einstellungen) | ja |
| `alma-link` | – | Alma-Link neu eingeben | ja |
| `suchen` | `q` | Obsidian-Suche öffnen | – |
| `zeigen` | `notiz` | Notiz öffnen (Stundenplan-Raster in Bases) | – |
| `seitenlink` | – | `[[Folien.pdf#page=N\|S. N]]` einfügen (Editor) | ja |
| `zentral-aktualisieren` | – | Zentrale Daten jetzt abrufen (mit Hinweis zum Ergebnis) | ja |
| `zentral-schalter` | `was` (`daten` \| `veranstaltungen`), `wert` (`1`/`0`, optional) | Schalter in `System/Einstellungen.md` setzen (ohne `wert`: umlegen) | – |
| `besuche-nicht` | `id` (ohne: die geöffnete zentrale Stundenplan-Notiz) | id in `stundenplan_ausgeblendet` (Einstellungen); Hinweis mit „Rückgängig“ | Besuche ich nicht |
| `wieder-zeigen` | `id` | id aus `stundenplan_ausgeblendet` nehmen | – |
| `karten-lernen` | `stapel` (Pfad) oder `code`; ohne: die Kartennotiz, in der der Knopf steht, sonst alle | Lernfenster | Karteikarten lernen |
| `karte-neu` | `stapel` (Pfad, optional) | Fenster „Neue Karte“ | Karteikarte hinzufügen |
| `kartenstapel` | – | neuer Stapel aus `System/Gerüste/Karteikarten.md` (Modul wählen; auch Ordner-Automatik in `Karteikarten/`) | Neuer Karteikarten-Stapel |
| `karten-optionen` | – | Fenster „Optionen“ (Felder `karten_*` in `System/Einstellungen.md`) | ja |

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

Der Link liegt nur gerätelokal (`app.saveLocalStorage`). Scheitert der erste Abruf nach dem Eingeben (Fenster oder
Eingabefeld), gilt wieder der vorherige Link. Fehlt ein Termin in Alma, kommen nur Notizen, die Alma selbst angelegt hat
(Kasten „Aus Alma“), in den Papierkorb; eine von Hand angelegte Notiz, die Alma übernommen hatte, verliert nur die
Alma-Felder (`quelle`, `alma_schluessel`, `alma_titel`, `alma_raum`) und bleibt (`tests/alma.test.js`).

## Datenmodell `ctx.modell` (Phase 2b)

`modell.js` rechnet einmal aus `System/Daten/Semester.md`, `System/Einstellungen.md`, `Module/`, `Termine/` und `Stundenplan/`.
Jede Änderung im metadataCache (`changed`, `deleted`, `rename`, `resolved`) markiert das Modell als veraltet; der nächste
Zugriff rechnet neu. Damit sieht kein Skript veraltete Daten. Wer bei Änderungen neu zeichnen will, meldet sich mit
`ctx.modell.beiAenderung(fn)` an (entprellt, 600 ms, nur für Änderungen in den genannten Ordnern).

| Aufruf | Ergebnis |
|---|---|
| `daten()` | `{ heute, name, variante, zielnote, studienbeginn, studienbeginnStandard, startSemester, semesterliste[], aktuell, fachsemester, vorStart, pausen[], freieTage[], pruefungsphasen[], rueckmeldung[], module[], termine[], stundenplan[], abgeleitet, personalisiert, zentral }` |
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
`inph`, `phbis`) im Dashboard. Nutzer: Dashboard (Kopf des Semesterverlaufs), `verlauf.js` (Vorlesungswoche und Resttage in der
Lupe), `vorlesung.js` (Kopf der Vorlesungsnotiz: Woche des Notizdatums, Perlen mit Vorlesungswochen). Die Leiste
„Semesterverlauf“ im Dashboard zeigt alle Kalenderwochen des Semesters als Grafik; der Studienverlauf wiederholt sie seit
17.10.2026 nicht mehr (seine Lupe zeigt dasselbe Semester als Band).

**Studienverlauf (`verlauf.js`, Design-Pass 17.10.2026):** Die Bahn ist das eine laute Element der Karte, alles andere eine
ruhige Zeile: Kopf ohne Kennzeichen „Du bist hier“ (das sagt die Nadel), Stationen später Semester nur mit „n geplant“,
ECTS und Orientierungsprüfung als Bilanz ohne Kästen, Fuß mit nächstem Meilenstein und Prognose. Kein Satz unter dem Kopf (seit
17.10.2026: keine Sprüche, kein Lagewort). Die Lupe trägt ECTS, im laufenden Semester Vorlesungswoche und Resttage der
Vorlesungszeit und die Meilensteine des Semesters (auf der Bahn stehen deren Erklärungen nur als Tooltip, also nicht auf Touch),
dazu nur hier die Rückmeldung fürs nächste Semester (das Fenster, das im gewählten Semester beginnt; verlinkt die
Termin-Notiz mit gleichem Beginn, gefüllte Raute, sobald sie abgehakt oder das Fenster vorbei ist). Vorlesungsfreie Tage der
Vorlesungszeit, die nicht schon in einer Pause liegen, stehen im Band als schmale Striche (Tooltip) und in der Legende als
eine Zeile „Frei 01.11.“ (auf Touch lesbar). Seit 17.10.2026 ersetzt die Lupe die Tabelle „Semestertermine“ der Seite: Was
die Tabelle zeigte, steht je Semester hier (Station antippen). Prüfungs-Fähnchen, deren
Beschriftungen sich überschneiden würden (typisch die Klausurphase), fasst `stapeln()` zu einem Fähnchen „n Klausuren
30.01.–12.02.“ zusammen (Einzelheiten im Tooltip und in der Modulliste); erst was dann noch kollidiert, rückt eine Stufe
höher. Stil: `eba-core.css` Abschnitt 38.

**Nur richtige Daten (Vorgabe vom 17.10.2026):** Semester, Pausen, freie Tage, Prüfungsphasen und Rückmeldung tragen in den
zentralen Daten `status` (offiziell | geschätzt) und optional `hinweis` (≤ 200 Zeichen, z. B. „Angabe der Uni
widersprüchlich, bitte kurz vorher prüfen“). Geschätztes ist überall markiert, Offizielles nie: Tabelle aller Semester auf
`System/Daten/Semester` (`modell.js`, ```` ```eba-semesterdaten zentral ````) mit Pille am Semester und „*“ am Wert (Tooltip = Hinweis), Fußnote nur bei Schätzungen, die Hinweise
zusammengefasst darunter (einer direkt, mehrere aufklappbar); Studienverlauf mit Streifen und „(geschätzt)“ in Band, Legende und an der Rückmeldung, Hinweise als
Zeile in der Lupe und „ca.“ vor Daten und Zahlen, die aus geschätzten Semesterdaten folgen (Abschluss, Resttage,
Vorlesungswochen, Frist der Orientierungsprüfung). Semester nach Regel (`semesterNachRegel`) gelten als geschätzt mit dem
Hinweis „Nach Regel berechnet“.

**Wochenraster (seit 0.4.0, seit 17.10.2026 `woche.js`):** Codeblock ```` ```eba-woche ```` in der Karte
`> [!eba-kennzahlen|woche …]` auf Dashboard und Stundenplan (vorher eine Bases-Formel; Bases liest keinen gerätelokalen
Speicher, darum jetzt Code). Das Raster zeigt eine echte Kalenderwoche, Montag bis Freitag, am Samstag und Sonntag schon die
nächste; im Kopf das Datum jedes Tages, rechts oben „‹ KW n ›“. Daten aus dem metadataCache: alle Notizen mit `typ:
lehrveranstaltung` (jede Herkunft), Kurznamen aus Modulnotizen (`kurz`), `semesterliste`, `pausen`, `stundenplan_ausgeblendet`
aus `System/Einstellungen.md`. Gezeichnet wird nur die gezeigte Woche; neu (entprellt, 0,4 s) bei Änderungen an
Stundenplan-, Modul- und Einstellungsnotizen, beim Zurückkommen in die App und alle 10 Minuten. Schreibt keine Datei.
Ein Kasten erscheint nur, wenn das Datum seines Wochentags zwischen `von` und `bis` liegt (leer = unbegrenzt), Tutorien und
Übungen also erst ab ihrer ersten Woche; ohne `semester` des gezeigten Semesters (nach dem Freitag der Woche), mit
`entfaellt: true` oder ausgeblendet (`herkunft: zentral`, `zentral_id` in `stundenplan_ausgeblendet`) gar nicht. Liegt der
Tag in `ausfall` oder in einer Pause, ist der Kasten durchgestrichen (`ausfall`); `aenderungen` („Datum|Beginn|Ende|Raum“) in
der Woche: gestrichelt (`geaendert`), an der neuen Zeit, mit neuer Zeit und neuem Raum. Findet nichts statt, steht ein Satz
(Name der Pause, „Vorlesungsbeginn TT.MM.“, „Vorlesungsfrei“, „Keine Veranstaltungen“). Stunden von–bis aus allen Serien des
Semesters (dazu Einzeltermine und geänderte Zeiten der Woche), damit das Raster von Woche zu Woche gleich bleibt; Höhe am
Stundenplan 697 px, am Dashboard feste Viertelstunden (CSS). Überschneiden sich Kästen eines Tages, stehen sie nebeneinander
(`spalten`: Breite und Abstand links im Stil). Reine Logik als Funktionen (`wocheBauen`, `spalten`, `kurzname`, `artText`,
`versatzAus`, `wischStartOk`, `wischAchse`, `wischRichtung`), getestet in `tests/wochenraster.test.js`. CSS: Abschnitte 47 und 55.
*Andere Woche:* ‹ und › sind Links auf die Aktion `woche` (`schritt` = Wochen ab heute), „KW n“ ist in einer anderen Woche
der Link zurück (`schritt=0`). Welche Woche, merkt sich nur dieses Gerät: `app.saveLocalStorage("eba-woche-versatz")` mit
Versatz, Uhrzeit und Sitzung (`ctx.bleibend`, neu bei jedem Start von Obsidian). Gilt nur in derselben Sitzung und höchstens
30 Minuten nach dem letzten Wechsel, sonst wieder die aktuelle Woche, ohne Schreiben. Zwei Geräte blättern so unabhängig (bis
zum 17.10.2026 stand die Woche in einer abgeglichenen Notiz, und ein Gerät blätterte das andere mit). Auf Touch-Geräten,
vor allem am iPhone, blättert man durch Wischen über das Raster: waagerecht mehr als 50 px und mehr als doppelt so weit wie
senkrecht; nicht in den äußeren 30 px des Bildschirms begonnen (dort zieht Obsidian die Seitenleisten auf) und nicht auf einem
Link oder Kasten. Die erste Bewegung über 10 px entscheidet die Richtung; erst wenn sie waagerecht ist, ruft `woche.js`
`preventDefault()` (Listener `touchmove` nicht passiv) und reicht das Ereignis nicht weiter, senkrechtes Scrollen bleibt
unberührt (am Gerät noch nicht geprüft). Die Kopfzeile bleibt auch am iPhone eine Zeile: „‹ 44 ›“ rechts neben Freitag, die
Pfeile klein, ihre unsichtbaren Tippflächen (`::after`) reichen bis an die Freitag-Beschriftung und den Rand (etwa 17 bzw.
20 × 40 px), nie über Text; eine eigene Zeile für Monat und Pfeile ist verworfen. Am iPad haben die Pfeile
Tippflächen von 44 px Höhe.
*Kästen:* Oben kräftig der Kurzname: `kurz` der Stundenplan-Notiz, sonst `kurz` der Modulnotiz (Grundstudium-Module haben
ihn, z. B. „VWL“, „Mathe“), sonst der Code. Daneben blass Art und Gruppe, aber nur für Übung, Tutorium, Seminar: `art`
„Vorlesung“ und „Veranstaltung“ (Alma ohne erkannte Art) gelten als Vorlesung (Klasse `vl`, gefüllte Fläche, kein Wort), alles
andere als `ue` (helle Fläche, Farbkante). Die Gruppe ist `gruppe` (Anzeigename wie in ILIAS, nie `gruppe_alma`): beginnt sie
mit der Art („Tutorium 1“), steht nur sie da, eine bloße Zahl wird „Gruppe n“, sonst Art und Name („Tutorium Gruppe 4“).
`konflikt` (an Gruppen-Notizen): Warnpunkt und „überschneidet sich mit …“ im Tooltip. Zweite Zeile: Raum, davor der Beginn in
`<time>`, wenn er nicht zur vollen Stunde liegt (bei einer Änderung die neue Zeit; am iPhone nur dann). Voller Titel mit Zeit
und Raum im `title`, ein Tipp öffnet das Modul (Aktion `zeigen`, immer mit dem vollen Pfad der Modulnotiz aus `modulPfad`, nie
über den Namen; ohne Modulnotiz die Stundenplan-Notiz selbst). Jeder Kasten ist ein CSS-Größen-Container; was nicht in
seine Höhe passt, entfällt (Abschnitt 55).

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
Auslöser: Änderung an `Semester.md` (1,5 s entprellt) oder `Einstellungen.md` (20 s), einmal beim App-Start (3 s nach dem
Einlesen) und nach dem Speichern im Formular bzw. in der Einrichtung. Geschrieben wird nur, wenn der Inhalt abweicht, und nie
ohne zentrale Daten (z. B. wenn der Sync noch läuft). Der Abgleich beim Start fängt Updates der Vorlage und den
Semesterwechsel bei leerem Studienbeginn ab. **Ein Schreiber** (seit 17.10.2026): Von selbst (Start, Änderung) schreibt nur
das Gerät, für das `ctx.zentral.abruferHier()` gilt (Abrufer laut `abruf.json`, noch keiner oder seit 80 Min. still); das
Gerät, auf dem du den Studienbeginn änderst, schreibt sofort. Vorher schrieben alle Geräte dieselbe Datei, in der auch deine
Angaben stehen; bei iCloud konnte so eine Eingabe auf einem anderen Gerät verloren gehen, bei LiveSync gab es Konflikte. Die
20 s nach einer Änderung an `Einstellungen.md` geben der Ableitung des tippenden Geräts Zeit, per Sync anzukommen.
Protokoll: `ctx.modell.protokoll` (Liste der Schreibvorgänge mit Zeit und Grund).

`System/Daten/Musterplan.md` – gleiche Form: `plaene` (id, name), `eintraege` (plan, fs, code, titel, ects, op, art:
schwerpunkt | profil | abschluss), `hinweise` (plan oder „alle“, Text in eigenen Worten), `stand`, `quelle`. Darstellung:
Codeblock `eba-musterplan [economics|ba|ohne|alle|andere]` (ohne Argument: Variante aus den Einstellungen, bei „offen“ alle
drei; `andere` = die übrigen). Ohne Argument und mit gewählter Variante steht darunter „Andere Varianten ansehen →“ zu
`System/Daten/Musterplan` (nicht auf dieser Seite selbst). Spalten je Fachsemester mit deinem Semesternamen, Modul-Chips
(öffnen die Modulnotiz, ✓ wenn bestanden, „OP“ = Orientierungsprüfung), Platzhalter, ECTS je Semester; schmal (Container
unter 520 px) untereinander. Mehrere Pläne (seit 17.10.2026): `stamm()` ermittelt, bis zu welchem Fachsemester alle gezeigten
Pläne dieselben Einträge haben; diese Semester stehen einmal (Stamm), daneben die Gabelung („Ab dem 3. Fachsemester trennen
sich die Pläne“, ohne Argument mit Link zur Wahl der Variante), darunter je Variante nur ihre eigenen Semester (Zweige, mit
Variantentitel). Ohne gemeinsamen Stamm steht jeder Plan ganz mit Variantentitel als Zwischenüberschrift. Die Hinweise stehen einmal
darunter (`hinweiseOrdnen`: erst die für alle, dann je Variante eine Spalte; bei einem Plan eine Liste).
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

- **Wann:** `registrieren()` plant den ersten Lauf 20 s + Zufall 0–2 Min. nach dem Einlesen (auch nach einem Hot-Reload), dann
  alle 15 Min. über `ctx.intervall` (seit 0.4.2; ohne Änderung nur das Manifest, Dateien nur bei neuer Prüfsumme, Notizen nur
  bei geänderten Daten), beim Zurückkehren in die App nach über 10 Min.; dazu Aktion/Befehl „Zentrale Daten jetzt aktualisieren“. Ändert sich der Filter (Variante,
  Plan, Schalter), wendet das Abrufer-Gerät den letzten Stand ohne Netz neu an (`abrufen({ nurCache: true })`, 5 s entprellt über
  `ctx.modell.beiAenderung`). Hinweise (Notice) nur beim Knopf, nie beim automatischen Lauf.
- **Gerätelokal** (`app.saveLocalStorage`): `eba-geraet` (zufällige Geräte-ID), `eba-darstellung` (Hell, Dunkel, Automatisch),
  `eba-design` (Elfenbein, Flieder, Klar), `eba-start-klassen` (Klassen am `body`, die `main.js` schon beim Laden setzt),
  `eba-zentral-stand` (letzter Abruf, Fehler,
  Pause, Hinweis, `plugin_aktuell`, Prüfsummen, Filter-Schlüssel, Abrufer ja/nein), `eba-zentral-daten` (letzter geprüfter
  Stand, für Filteränderungen ohne Netz).
- **Nur ein Gerät schreibt:** `System/Daten/abruf.json` (synchronisiert) = `{ geraet, seit, zuletzt, angewendet }`. Schreiben
  darf das Gerät, das dort steht, oder jedes andere, wenn `zuletzt` älter als 80 Min. ist (dann übernimmt es). Die Datei wird nur
  bei Wechsel, bei geänderten Notizen (`angewendet`) oder höchstens alle 50 Min. (bei Läufen alle 15 Min. also etwa stündlich)
  geschrieben, auch ohne geänderte Daten – der Puls muss unter der
  Übernahmegrenze liegen, sonst übernähme ein zweites Gerät, obwohl der Abrufer läuft (Läufe + Timer-Drosselung).
  `angewendet` (id → Kurz-Prüfsumme des Eintrags) merkt sich, was als Notiz geschrieben wurde: Löschst du eine zentrale Notiz,
  kommt sie erst wieder, wenn sich der Termin in den Daten ändert. Liegt eine Notiz deines eigenen Uni-Abgleichs mit dieser id
  da, gilt sie nicht als gelöscht (Übergabe nach id, unten). Kein Abruf ohne Netz schreibt etwas; `abruf.json` steht in
  `.gitignore`.
- **Notizen:** `Termine/JJJJ-MM-TT Titel.md` (`: ` → ` – `, sonst unzulässige Zeichen `-`), Frontmatter in fester Reihenfolge
  (`typ, titel, datum, bis, kategorie, status, ort, modul, code, bereich?, erledigt, quelle, info?, geprueft?, herkunft: zentral,
  zentral_id, entfaellt?, uebersicht, cssclasses, tags`), danach eigene Felder der Nutzer unverändert. Text: `# Titel`,
  `**Datum** · Ort`, `info`, Hinweis „Geschätzt“ bzw. „Entfällt“, `Quelle: [host](url) · geprüft am TT.MM.JJJJ`, dann
  `## Meine Notizen` (beim Anlegen leer erzeugt). Alles ab `## Meine Notizen`, `erledigt`, eigene Tags (`cssclasses`/`tags`
  werden vereinigt) und eigene Felder bleiben. Datum geändert → `fileManager.renameFile` (Links ziehen mit). Geschrieben wird
  nur, wenn der erzeugte Text vom vorhandenen abweicht. Notizen ohne `herkunft: zentral` fasst das Plugin nie an, mit einer
  Ausnahme, der **Übergabe nach id** (seit 0.4.4, Vertrag in `docs/daten-v1.md`): Ein eigener Uni-Abgleich schreibt Termine,
  die nicht in den Daten stehen, selbst, als Notiz mit `abgleich_id` = id und ohne `herkunft`. Steht die id später in den
  Daten, übernimmt `termineAnwenden` genau diese Notiz (`abgleichNotizen`; `notizText` schreibt sie neu, `abgleich_id` fällt
  weg, `erledigt`, „Meine Notizen“ und eigene Felder bleiben, neues Datum benennt um), statt eine zweite anzulegen oder die id
  als gelöscht zu werten. Nur, wenn es keine zentrale Notiz mit der id gibt und der Termin zum Filter passt; andere Notizen
  mit `abgleich_id` bleiben unberührt. Ohne eigenen Abgleich gibt es solche Notizen nicht. Tests: `tests/zentral.test.js`.
- **Wegfall/Filter:** Fehlt eine id: unberührt (nicht erledigt, „Meine Notizen“ leer) → Papierkorb (`vault.trash`, nie
  endgültig), sonst Titel „(entfällt)“ + `entfaellt: true`. Ende > 30 Tage vorbei → unverändert. Fällt mehr als die Hälfte (und
  mehr als 10) auf einmal weg → keiner als entfallen (Schutz gegen kaputte Exporte). Passt ein Termin nicht mehr zum Filter
  (Modul nicht im Plan, Schalter aus): unberührt → Papierkorb, sonst stehen lassen.
- **Bereich** (`bereich`, optional, Freigabeliste in `docs/daten-v1.md`): `schluesselqualifikation` → Feld `bereich` und Tag
  `schlüsselqualifikation` (verwaltet: verschwindet, wenn der Bereich wegfällt; eigene Tags bleiben), Pille „Schlüsselqualifikation
  · freiwillig“ in der Datumszeile des Notizkopfs, kurz „freiwillig“ in der Agenda (`termine.js`) und der Kalender-Tagesliste
  (`kalender.js`, seit 17.10.2026); Dashboard-Formel `art` hängt „ · freiwillig“ an. Unbekannte Felder und Werte ignoriert das Plugin (kein Verwerfen).
- **Filter:** ohne `code` oder mit `bereich` → alle; mit `code` → Modul gewählt, selbst geplant (`semester_geplant`), Status „läuft“/„angemeldet“
  oder `fsEmpfohlen` (Musterplan der Variante, siehe oben) = aktuelles oder nächstes Fachsemester. Schalter in
  `System/Einstellungen.md`: `zentrale_daten` (an/aus), `zentrale_veranstaltungen` („Fachschaft & Veranstaltungen“). **In den
  Einstellungen statt gerätelokal**, weil nur ein Gerät schreibt: Ein Schalter auf einem Nicht-Abrufer-Gerät würde nichts
  bewirken, und die Wirkung (Notizen im Tresor) gilt ohnehin für alle Geräte.
- **Semesterdaten:** `semester.json` → `System/Daten/Semester.md`, nur bei inhaltlicher Abweichung (Vergleich `semKanon`, nicht
  der Formatierung), Frontmatter im bisherigen Flow-Stil, Text darunter bleibt. `modell.js` leitet daraus ab wie bisher.
- **Gruppen** (optional `gruppen.json`, seit 17.10.2026): holt jedes Gerät selbst vor der Abrufer-Sperre, prüft sie
  (`gruppenPruefen`) und speichert sie nur gerätelokal (`eba-zentral-gruppen`, `ctx.zentral.gruppen()`); keine Notizen. Ein
  Fehler (Netz, Prüfsumme, Schema) hält nur die Gruppen an: alter Stand bleibt, `bericht.warnung` nennt ihn, Termine und
  Semesterdaten laufen weiter.
  Anzeige: `gruppen.js`, Codeblock `eba-gruppen [alle]`, Filter wie die Termine (`filterBauen`) plus aktuelles und nächstes
  Semester. Weil `gruppen.js` vor `zentral.js` und `modell.js` lädt, meldet es sich als `ctx.gruppenAnzeige` an, und
  `zentral.js` zeichnet damit neu. CSS: Abschnitt 50 in `eba-core.css`.
- **Anmeldungen** (Codeblock `eba-anmeldungen` in `termine.js`, seit 17.10.2026; ersetzt die Tabelle zum Eintragen auf
  Termine & Anmeldungen): Zeilen aus den zentralen Termin-Notizen mit `kategorie: Frist`, deren Titel Anmeldung, Belegung oder
  Buchung nennt (ein eigenes Feld dafür gibt es in `termine.json` nicht). Filter `filterBauen().aufnehmen` wie beim Übernehmen
  (mit `code` nur Module deines Plans). Nur Anmeldungen fürs Studium, unabhängig von „Fachschaft & Veranstaltungen“: mit
  `code`, mit `bereich` (Schlüsselqualifikation), TCP, Übungs- und Tutoriengruppen, Prüfungsanmeldung (Titel). Karriere,
  Workshops, Sport, Vorträge oder das Kolloquium stehen als Frist nur in der Agenda, damit jede Information an einer Stelle
  steht. Nur bis zum Ende des aktuellen Semesters (`ctx.modell`), Vorbeigegangenes noch 7 Tage, gedämpft und unten.
  Wann aus `datum`/`bis` und den Zeiten in `ort` („ab 15:00“, „bis 30.10. 15:00“; „ab“ = Anmeldung öffnet, „bis“ oder
  Anmeldeschluss/-frist im Titel = Schluss), Wo aus dem Rest von `ort`, sonst die Quelle. Gibt es für das Modul eine
  Gruppen-Notiz (`herkunft: ilias-gruppe` oder `gruppe-gewaehlt`, aktuelles Semester, nicht entfallen; nennt der Titel Übung
  oder Tutorium, zählt diese Art) oder seit 18.10.2026 eine andere Stundenplan-Notiz (Alma, von Hand, eigener Uni-Abgleich, ohne
  `herkunft`; nie zentral), die zur Zeit einer Gruppe dieses Moduls aus `gruppen.json` passt (`deckt` aus `meine-gruppe.js`:
  Code, Semester, Wochentag, Beginn ±15 Min. c.t./s.t.; dazu das Ende ebenso und Art Übung oder Tutorium; nie über die Nummer),
  steht „angemeldet · Gruppe 4“ dabei (Name nur aus dem Feld `gruppe` der Notiz, sonst nur „angemeldet“; nie `gruppe_alma`).
  Vorher blieben die Notizen eines eigenen Abgleichs ohne `herkunft` bei „offen“. Neu gezeichnet bei
  `ctx.modell.beiAenderung` und wie die Agenda. Reine Logik (`anmeldungen`, `ortTeilen`, `anmeldeStand`) in
  `tests/termine.test.js`. CSS: Abschnitt 57.
- **Angebote der Uni** (optional `angebote.json`, seit 17.10.2026): Vorträge, UB-Kurse, Hochschulsport, Welcome Center. Geholt
  und gespeichert wie die Gruppen (gemeinsamer Helfer `optionalHolen`; `angebotePruefen`, `eba-zentral-angebote`,
  `ctx.zentral.angebote()`); ein Fehler hält nur die Angebote an. Anders als bei den Gruppen gilt eine Datei, die im Manifest
  fehlt, als zurückgezogen: Der gerätelokale Stand wird gelöscht (nicht bei `pause`). Anzeige: `angebote.js`, Codeblock
  `eba-angebote` (meldet sich als `ctx.angeboteAnzeige` an).
  *Auswahl* (synchronisiert in `System/Einstellungen.md`, für alle Geräte gleich): Solange `angebote_gewaehlt` nicht `true` ist,
  zeigt der Block statt der Liste die Karte „Welche Angebote willst du sehen?“ (`.eba-ang-wahl`) mit Häkchen und **Fertig**;
  „Auswahl ändern“ im Fuß öffnet sie wieder. Nicht Teil der Einrichtung. `angebote_auswahl` = Liste der gewählten Schlüssel:
  `sport`, `ub`, `welcome` (ganze Art) und je Vortragsreihe `vortrag-wiso`, `vortrag-studium-generale` (am Namen erkannt) bzw.
  `vortrag-<name>` für jede andere Reihe aus den Daten. Vorgabe: `sport`, `ub`, `vortrag-wiso`; Studium Generale, Welcome Center
  und unbekannte Reihen sind aus. Gewählte Schlüssel, die die Karte gerade nicht zeigt, bleiben beim Speichern erhalten. Die
  Karte setzt auch **Fachschaft & Veranstaltungen**, also dasselbe Feld `zentrale_veranstaltungen` wie das Fenster „Zentrale
  Daten“ (nur bei geändertem Wert geschrieben; `zentral.js` wendet den Filter danach neu an). Geändert auf einem anderen Gerät →
  neu gezeichnet (`changed` der Einstellungen).
  *Anzeige:* Chips nur für gewählte Arten (ab zwei) mit Anzahl; ein- und ausblenden gilt bis zum Neustart (`ctx.bleibend`),
  gerätelokal wird nichts gespeichert. Liste nach Tagen für 14 Tage ab heute, der Rest hinter „Mehr anzeigen“; vorbei ist, was
  vor heute liegt oder heute nach `bis`. Hochschulsport: `anmeldung.ab` als eigene Zeile „ab 17:00 · Buchungsstart“ am Tag der
  Buchung. Tageswechsel: neu zeichnen beim Zurückkehren in die App und alle 15 Min. Reine Logik (`auswaehlen`, `wahlLesen`,
  `wahlSchreiben`, `wahlNeu`, `wahlEintraege`, Texte) in `tests/angebote.test.js`. CSS: Abschnitt 53 in `eba-core.css`
  (Klassen `eba-ang-*`, Farbe je Art über `--kal`).
- **Zentraler Stundenplan** (optional `veranstaltungen.json`, Vertrag in `docs/daten-v1.md`, seit 17.10.2026; Plan 27.1, Antwort
  auf die Befunde 6, 7 und 18 der Prüfung): Anders als Gruppen und Angebote schreibt er Notizen, darum **nur der Abrufer**.
  Eigener Abruf nach den anderen Dateien (`lehreHolen`, `lehrePruefen` wie `veranstaltung_pruefen` im Export, aber unbekannte
  `art` → „Sonstige“, unbekannte Felder ignoriert): Netz-, Prüfsummen- oder Formatfehler und selbst eine Ausnahme beim Anwenden
  landen nur als `bericht.warnung` („Stundenplan: …“), Termine und Semesterdaten laufen weiter. Fehlt die Datei im Manifest,
  bleibt der letzte Stand. `stand().lehre` merkt auf jedem Gerät, ob das Manifest sie nennt (für die Texte).
  *Filter* (`stundenplanFilter`, nur das aktuelle Semester, kein `fs + 1`): bestanden/anerkannt nie; läuft/angemeldet immer;
  `semester_geplant` nur, wenn es das aktuelle Semester ist (Wiederholer, Verschieben); `gewaehlt` ohne eigenes Semester, wenn
  sein Musterplan-Semester das aktuelle ist oder es keins hat (Schwerpunkt); sonst Pflichtmodule des aktuellen Fachsemesters
  laut Musterplan der Variante, bei „offen“ nur Codes, die **alle** Pläne in diesem Fachsemester haben (`pflichtCodes`). Ohne
  Studienbeginn (`studienbeginnStandard`) kein Musterplan-Anteil, nur selbst Markiertes; die Seite Stundenplan bittet dann um den
  Studienbeginn. *Auswahl* (`stundenplanAuswahl`): Hat ein Modul für eine Art mehrere Gruppennummern, ist das eine persönliche
  Wahl und wird nie eine Notiz (eigene Gruppe: Alma oder von Hand); ids aus `stundenplan_ausgeblendet` nicht.
  *Notiz* (`lehreNotizText`): eine je id in `Stundenplan/` („Mo 10.15 B110 Vorlesung“, Einzeltermin „JJJJ-MM-TT B110 …“),
  Frontmatter wie Alma-Notizen (`typ: lehrveranstaltung`, `titel`, `code`, `modul`, `art`, `wochentag`, `tag`, `beginn`/`ende`
  mit c.t. verschoben, `raum`, `semester`, `von`/`bis`, `ausfall`, `aenderungen`, `einzeltermin`, `quelle`, `herkunft: zentral`,
  `zentral_id`, `uebersicht: "[[Stundenplan]]"`), eigene Felder und alles ab `## Notizen` bleiben. Text: Zeit, Zeitraum,
  „Fällt aus“, „Anders“, „Zusätzlich“, Knopf **Besuche ich nicht**, Quelle. Nie umbenannt (die id hängt an Tag und Beginn).
  *Wochenraster* (Dashboard und Stundenplan, jede gezeigte Woche, `woche.js`): `ausfall` streicht durch
  wie bisher; `aenderungen` = „Datum|Beginn|Ende|Raum“ (immer vollständig, ohne Zusatztermine) → liegt das Datum in der
  gezeigten Woche, zeigt der Kasten Zeit und Raum der Änderung, Klasse `geaendert` (CSS Abschnitt 54). Das Raster lässt
  Notizen mit `entfaellt: true` und ausgeblendete zentrale ids (`stundenplan_ausgeblendet`) weg; Einzeltermine stehen in ihrer
  Woche im Raster (für die Höhe zählen Serien plus Einzeltermine dieser Woche). Die Liste filtert genauso.
  *Alma gewinnt* (`eigenePaare`, Befund 6): Eine eigene Notiz (Alma oder von Hand, nicht zentral) ersetzt einen zentralen
  Eintrag bei gleichem Code, Semester, Wochentag, Art-Klasse (Vorlesung ≠ Übung/Tutorium ≠ Seminar; unbestimmte Art wie
  „Veranstaltung“ oder Almas „Übungsteil“, den die Daten als Vorlesung führen, nur bei genau passender Zeit), Beginn und Ende
  höchstens 15 Min. daneben, gemessen an der Alma-Zeit und – bei c.t. – an der um 15 Min. verschobenen; Zeitraum überschneidet
  sich (Einzeltermin: Datum im Zeitraum, nicht in `ausfall`). Genau vor Toleranz,
  bekannte Art vor unbestimmter, gleicher Raum vor anderem; jede eigene Notiz ersetzt höchstens eine Serie. Abgeglichen wird
  **nur auf dem Abrufer**: `alma.js` lässt Notizen mit `herkunft: zentral` ganz aus (nie übernehmen, ändern, löschen) und legt
  seine eigene an; der Abrufer sieht sie (lokal oder per Sync, `lehreSchluessel` im Filter-Schlüssel) und räumt die zentrale weg:
  unberührt → Papierkorb, mit eigenem Text unter `## Notizen` → der Text wird an die eigene Notiz angehängt („Aus der zentralen
  Notiz übernommen (Datum)“), dann Papierkorb. So schreibt nie mehr als ein Skript in eine Notiz. Verschwindet die eigene Notiz
  (in Alma abgemeldet, gelöscht), gilt wieder die zentrale; fehlt die Veranstaltung in Alma von Anfang an, bleibt die zentrale
  (Entscheidung 17.10.2026). Bis der Abrufer läuft, können kurz beide im Raster stehen.
  *„Besuche ich nicht“* (Befund 6.2/7): Knopf in der Notiz bzw. Befehl → id in `stundenplan_ausgeblendet` (synchronisiert,
  `types.json` multitext). Das Raster blendet sofort aus (Formel, `rasterNeu()` zeichnet offene Seiten neu), der Abrufer legt
  die Notiz in den Papierkorb (mit eigenem Text bleibt sie, aber unsichtbar). Hängt nicht am Eintrags-Hash: Änderungen bringen
  nichts zurück. Löschst du eine zentrale Notiz von Hand, die schon angelegt war (`angewendet`), gilt das genauso. Zurück:
  Fenster „Zentrale Daten“ → „Nicht in deinem Stundenplan“ → **Wieder zeigen**, oder „Rückgängig“ im Hinweis. Ids alter
  Semester fallen beim nächsten Schreiben weg. Liest Obsidian eine Datei in `Stundenplan/` noch ein, legt der Lauf nichts an und
  wertet nichts als gelöscht.
  *Wegfall*: Fehlt eine id, unberührt → Papierkorb, mit eigenem Text → `entfaellt: true` und „(entfällt)“ (Raster und Liste
  zeigen sie nicht). Schutz: Fehlen auf einmal mehr als die Hälfte (und mehr als 2) der laufenden Serien, gilt keine als
  entfallen; Serien, deren Ende über 30 Tage her ist, bleiben unverändert.
  *Texte und Schloss* (Befund 7): Mit zentralem Stundenplan (`ctx.zentral.stundenplan()` → `{ verfuegbar, anzahl, ohneBeginn,
  ausgeblendet }`) ist Alma freiwillig: Seite Stundenplan, Zeile Alma unter Verbindungen und Einrichtungsschritt sagen „Deine
  Vorlesungen kommen von selbst, deine Übungsgruppe meist aus ILIAS, sobald du es verbindest. Alma brauchst du nur für Extras.“ (bei
  EcoBA meldet man sich in ILIAS für Gruppen an, Almas Kalender kennt sie meist nicht), kein Schloss, solange zentrale Notizen
  da sind; `stundenplanAnzahl()` in `verbindungen.js` zählt zentrale und Gruppen-Notizen nicht als Alma-Daten.
  `gruppen.js` markiert eine Gruppe nur mit einer Notiz, die eine Übung sein kann (nie Art Vorlesung oder Seminar; Befund 18).
  *Eigener Uni-Abgleich* (`eigenerAbgleich` in `eba.js`, dieselbe Regel wie bei ILIAS: `System/Skripte/abgleich.js` im Tresor
  oder `ilias_unterlagen: extern`): Der zentrale Stundenplan wird weder geholt noch angewendet, vorhandene zentrale Notizen
  bleiben unberührt und `verfuegbar` ist `false`, die Texte versprechen also keine Vorlesungen; Gruppen-Notizen aus ILIAS
  weichen den Notizen des eigenen Abgleichs wie jeder anderen Notiz ohne `herkunft`. Alma verbindet man dort nicht (`alma.js`
  schriebe dieselben Veranstaltungen ein zweites Mal): Zeile unter Verbindungen und Einrichtung sagen nur „Dein Stundenplan
  kommt über deinen Uni-Abgleich.“, kein Schloss, kein Knopf auf der Seite Stundenplan (siehe „Verbindungen und Schloss“).
  Tests: `tests/stundenplan.test.js` (Prüfung, Filter, Auswahl, Alma gewinnt, Notiz, Ablauf im Tresor im Speicher).
- **Deine Übungs- oder Tutoriengruppe** (seit 17.10.2026, Plan 27.1 Punkt 1; ohne KI und ohne `veranstaltungen.json`, nur
  ILIAS-Mitgliedschaften und `gruppen.json`): Bibliothek `meine-gruppe.js`, zwei Schreiber mit je eigener `herkunft`.
  *Aus ILIAS* (`ilias.js`, nur das Gerät mit der ILIAS-Sperre, im normalen Lauf nach dem Durchsuchen; im eigenen Uni-Abgleich
  mit ILIAS-Zugang nur dieser Teil, Lauf `nur-gruppen`, nie Downloads): Mitglied heißt, die Gruppe steht auf „Meine Kurse und
  Gruppen“ (dieselbe Anfrage wie die Kursliste; `mitgliedschaften()` liefert Titel und Beschreibung). Den Modulcode liefert der
  durchsuchte Kurs bzw. Unterordner, in dem die Gruppe steht (`inhalt()` erkennt „Mitgliedschaft beenden“ als `mitglied`),
  sonst die Brotkrumen der Gruppenseite (`brotkrumen()`, höchstens 5 Seiten je Lauf; mit Code gemerkt, ohne Code erst nach
  einer Woche neu versucht, `kursVersucht`); nie die Uhrzeit. Das Zeitfenster (`zeitfenster`) kommt aus Titel und Beschreibung,
  die nur im Speicher bleiben (dort stehen Namen von Tutor:innen): Klammern fallen vorher weg, dann Wochentag, Zeitspanne und
  Raumnummer hinter einem Raumwort; kein oder mehr als ein Tag, keine oder mehr als eine Zeitspanne → kein Zeitfenster;
  „14.10 - 16.12“ ist ein Datum (Punkt-Minuten nur :00/:15/:30/:45). Name: `gruppenName` („Gruppe 4“, „Tutorium 1“ vom
  Titelanfang). Zuordnung (`zuordnen`) nie über die Nummer (ILIAS und Alma zählen verschieden, gemessen 17.10.2026: S100 ILIAS
  „Gruppe 4“ = Liste Gr. 5): gleicher Code, Semester und Wochentag, Beginn und Ende höchstens 15 Min. daneben (c.t./s.t. wie
  `eigenePaare`), bei mehreren die Raumnummer, dann die kleinere Abweichung, sonst „mehrdeutig“ mit Kandidaten. Eindeutig →
  eine Notiz in `Stundenplan/` („Di 10.15 S100 Tutorium Gruppe 4 (ILIAS)“, gewählt „… (gewählt)“: nie der Name einer Alma-,
  Oracle- oder zentralen Notiz; ältere Namen benennt der Schreiber mit dem fileManager um, Links ziehen mit). Ohne geladene Gruppenliste werden keine Notizen angelegt und keine entfernt. Index `gruppen` je
  ref_id: Code, Kurs, Name, Zeitfenster, `mitglied`, `fehlt`, `kursVersucht`, `status` (zugeordnet | mehrdeutig | ohne-treffer
  | ohne-zeit | ohne-code | ohne-daten), `zentral`, `kandidaten`; nie Titel oder Beschreibung.
  *Felder der Notiz* (fürs Wochenraster wie zentrale Notizen): `typ: lehrveranstaltung`, `titel` („<Modul> · Tutorium Gruppe
  4“; beginnt der Name mit der Art: „<Modul> · Tutorium 1“), `code`, `modul`, `art`, `wochentag`, `tag`, `beginn`/`ende` (echte
  Zeit, c.t. verschoben), `raum`, `semester`, `von`/`bis` (nur mit Zeitraum in `gruppen.json`), `ausfall: []`, `einzeltermin:
  false`, `gruppe` (Name zum Zeigen: aus ILIAS „Gruppe 4“, sonst „Gruppe <Nummer der Liste>“), `gruppe_alma` (Nummer in
  `gruppen.json`, nur intern), `gruppe_id`, `quelle`, `herkunft`, `ilias_gruppe` (nur ILIAS), `konflikt` (nur bei
  Überschneidung: Name der anderen Stundenplan-Notiz am selben Tag zur selben Zeit; schreibt nur der Schreiber der
  Gruppen-Notiz, die andere Notiz bleibt unberührt), `uebersicht: "[[Stundenplan]]"`. Eigener Text (Zeilen im Kopf, die
  nicht von hier stammen, und alles ab `## Notizen`) bleibt beim Aktualisieren.
  *Gewählt* („Meine“ in `eba-gruppen`, `gruppen.js`, auf dem Gerät, auf dem du tippst): Notiz mit `herkunft: gruppe-gewaehlt`;
  eine je Modul und Art (eine neue Wahl ändert sie), „Abwählen“ → Papierkorb und bleibt, solange es eine gewählte Notiz gibt.
  „Meine“ fehlt, wenn die Gruppe schon aus ILIAS, Alma, von Hand oder zentral kommt. Beim Zeichnen (höchstens einmal je
  Minute, auf jedem Gerät) weichen gewählte Notizen, die eine ILIAS-Notiz desselben Moduls oder eine andere Notiz zur selben
  Zeit inzwischen abdeckt; steht der eigene Text schon in der anderen Notiz (ein zweites Gerät war schneller), wandert er
  nicht noch einmal. Ist die gewählte Notiz genau die freigegebene Fassung der ILIAS-Notiz (`freigabeText`, siehe
  *Freigeben*: ein anderes Gerät hat umbenannt, der Sync hat die neue Notiz schon, das Löschen der alten noch nicht), weicht
  sie nicht; sonst gingen beide samt eigenem Text verloren. Nicht eindeutige ILIAS-Gruppen zeigt die Karte mit Satz und markierten Kandidaten; Gruppen aus ILIAS mit
  ihrem ILIAS-Namen („in ILIAS Gruppe 4“).
  *Freigeben* (`gruppenFreigeben` in `ilias.js`, `iliasFreigeben` in `meine-gruppe.js`): Prüft kein Gerät die ILIAS-Notizen
  mehr, würden sie „Meine“ für immer sperren. Darum werden sie zu gewählten Notizen (nur `herkunft`, `ilias_gruppe` weg,
  Info-Kasten, Name „… (gewählt)“; ILIAS-Name, Felder und eigener Text bleiben; entfallene bleiben, wie sie sind), und die
  Mitgliedschaften im Index gelten nicht mehr (`mitglied: false`). Wann: beim **Trennen** (nach einem laufenden Abruf), wenn
  ILIAS die **Anmeldung ablehnt** (falsches Passwort, Zustimmung, zweiter Faktor) und beim Start eines Geräts ohne Zugang, wenn
  die Sperre **verwaist** ist. Wer: nur das Gerät, das die Notizen schreibt, also wenn die Sperre ihm gehört, älter ist als
  80 Min. (verwaist: 7 Tage) oder fehlt (verwaist nicht: auf einem neuen Gerät kommt sie vielleicht erst nach den Notizen per
  Sync). Danach steht die Sperre mit `frei: true` auf ihm: Ein zweites Gerät wandelt nicht noch einmal um, eines mit Zugang
  übernimmt beim nächsten Lauf sofort und macht die gewählte Notiz wieder zur ILIAS-Notiz. Gleiches Ergebnis auf jedem Gerät;
  liegt die umgewandelte Notiz schon da, geht die alte nur in den Papierkorb. Ein Index, der per Sync kommt, wird neu gelesen
  (Ereignis `modify`, nicht während eines Laufs), damit die Karte auf allen Geräten stimmt.
  *Eine Regel für alle Quellen:* `alma.js` und `zentral.js` fassen beide Herkünfte nie an. Deckt eine andere Notiz (Alma, von
  Hand, zentral) dieselbe Gruppe, weicht die Gruppen-Notiz wie eine zentrale Vorlesung vor Alma: eigener Text wandert einmal
  hinüber, dann Papierkorb. ILIAS übernimmt eine gewählte Notiz desselben Moduls und derselben Art, weitere gewählte und Doppel
  derselben ILIAS-Gruppe (Sync-Verzug, Konfliktkopie) weichen in diese eine. Verlassen in ILIAS gilt erst, wenn die Gruppe zwei
  Läufe in Folge fehlt (`fehlt`, zählt höchstens bis 2; Notizen, die schon „entfällt“ tragen, zählen nicht mit, so schreibt ein
  unveränderter Lauf den Index nicht neu); eine ganz leere Gruppenliste entfernt nie etwas (Warnung). Dann Papierkorb, mit
  eigenem Text „(entfällt)“; fehlen auf einmal mindestens zwei und mehr als die Hälfte, bleibt alles stehen (Warnung).
  Tests: `tests/meine-gruppe.test.js`, `tests/ilias-gruppen.test.js`, `tests/gruppen.test.js`.
- **Anzeige:** Zeile „Zentrale Daten“ im Codeblock `eba-verbindungen` ohne Schloss: „Aktualisiert vor X Min.“ / „Pausiert“ /
  „Fehler beim letzten Abruf“, `hinweis` aus dem Manifest. „Neue Version verfügbar“ steht seit 0.2.0 in der Zeile „Studium
  Autopilot“ (`update.js`); nur ohne `ctx.update` zeigt diese Zeile den Link `RELEASES`. „Mehr erfahren“ öffnet das
  Info-Fenster (Datenschutz-Hinweis). Der Termin-Notiz-Kopf zeigt „geprüft am …“ aus `geprueft`; die Agenda liest nur das
  Frontmatter, nie den Notiztext.
- **Für andere Skripte/Tests:** `ctx.zentral` = `{ abrufen(opt), status(), anzeige(), stand(), geraetId(), idAusName(name),
  notizText(alt, eintrag, opt), dateiName(datum, titel), terminePruefen(d), semesterPruefen(d), manifestPruefen(m),
  gruppenPruefen(d), gruppen(), angebotePruefen(d), angebote(), filterBauen(), protokoll, … }`. `abrufen()` liefert einen Bericht
  (`art`: ok | unveraendert | fehler | pausiert | aus | anderes-geraet; `geschrieben`, `angelegt`, `aktualisiert`, `umbenannt`,
  `entfaellt`, `papierkorb`, `verworfen`).
- **Migration (einmalig, nur im Projekt):** Die 109 Termin-Notizen der Vorlage wurden am 15.10.2026 mit
  einem einmaligen Skript (nicht im Repo) zu zentralen Notizen (id-Regel aus dem Dateinamen, Inhalt genau wie vom Plugin
  erzeugt; zwei Dateien mit falschem Datum im Namen umbenannt). Der alte Notiztext ist dabei entfallen (er stand nie in den
  Daten; Inhalte „für alle“ kommen künftig über `info`). Der erste Abruf schreibt darum keine dieser Notizen neu.

## Update (seit 0.2.0, `update.js`)

Zwei Kanäle bleiben getrennt: Die zentralen Daten kommen von selbst und sind nur Daten. **Programmteile kommen nur nach einem
Tipp auf „Aktualisieren“** und Bestätigung, aus dem Haupt-Repo am Tag der Version.

```
manifest.json (ecoba-daten) ── release / beta: version, url_basis, sha256 der Liste
        │ Tipp „Aktualisieren“ → Manifest frisch holen → Bestätigung
        ▼
url_basis + Studium Autopilot/System/Daten/system-dateien.json ── SHA-256 = release.sha256? Liste streng prüfen
        ▼
Ist-Stand lesen, Plan je Datei (gegen installiert.json) → nur geänderte Dateien laden, Größe + SHA-256 prüfen
        ▼  (alles geladen und geprüft – vorher wird nichts geschrieben)
Sicherung → .trash/Studium Autopilot Sicherung <alt> <Zeit>/ → schreiben (Fehler: alles zurück) → Kern zuletzt
        ▼
system-dateien.json + installiert.json = neue Liste → Kern geändert? Plugin neu laden (disable/loadManifests/enable)
```

**Dateiklassen** (`klasseVon` in `update.js` = `klasse_von` in `werkzeuge/pruefen.py`, beide gleich halten). Was keine Klasse
hat, fasst ein Update nie an, auch wenn die Liste es nennt (dann lehnt das Plugin die ganze Liste ab).

| Klasse | Dateien | Unverändert | Von dir geändert |
|---|---|---|---|
| `system` | `.obsidian/plugins/studium-autopilot/{main.js,manifest.json,styles.css}`, `System/Skripte/*.js`, `System/Gerüste/*.md`, `.obsidian/snippets/eba-*.css` | ersetzen | seit 0.4.4 immer die neue Fassung; deine kommt vorher als `Name (deine Fassung vor X).ext.txt` daneben (`.txt`: nie geladen), das Ergebnisfenster sagt es in einer Zeile. Bis 0.4.3 blieb deine aktiv und die neue lag als `Name (neu X).ext.txt` daneben, darum fehlten neue Teile |
| `einstellung` | `.obsidian/{app,bookmarks,community-plugins,core-plugins,hotkeys,types}.json` | ersetzen | mischen: deine Werte bleiben, fehlende Schlüssel kommen dazu, Textlisten vereinigt |
| `seite` | `Dashboard.md`, `Studium/*.md`, `System/Daten/Musterplan.md` | ersetzen | Vorlage seit der installierten Version gleich → deine bleibt, keine Kopie (seit 0.4.4); nur abgehakt (`ohne_haken` gleich) → neue Seite mit deinen Haken; sonst deine bleibt, neue daneben `Name (neu X).md` |
| `modul` | `Module/**/*.md` | ersetzen | Vorlage seit der installierten Version gleich → deines bleibt unverändert (seit 0.4.4); sonst Frontmatter: Reihenfolge und Katalogfelder neu, persönliche Felder (`status`, `ergebnis`, `versuch`, `klausur`, `semester_geplant`, `gewaehlt`, `anrechnung`, `zusatz`) und eigene Felder bleiben, `tags`/`aliases`/`cssclasses` vereinigt; Text neu, wenn `koerper` gleich, sonst deiner |

Nie im Update: `System/Einstellungen.md`, `System/Daten/Semester.md` (Datenkanal), `abruf.json`, `installiert.json`,
`.obsidian/appearance.json` (Obsidians Grundfarbschema; Hell, Dunkel, Automatisch speichert jedes Gerät selbst), `workspace*.json`, Plugin-`data.json`, `Termine/`, `Stundenplan/`,
`Vorlesungen/`, `Übungsblätter/`, `Unterlagen/`, `Eingang/`, `Schlüsselqualifikationen/`, `Anhänge/`, `Karteikarten/`,
`System/Daten/Karteikarten/` (Lernstände) und alles andere ohne Klasse.

- **„Geändert“** heißt: SHA-256 der Datei ≠ Eintrag in `installiert.json` (Liste der zuletzt installierten Version). Gleicht
  die Datei schon der neuen Fassung, ist nichts zu tun. Fehlt eine
  Seite oder ein Modul, das installiert war, hast du es gelöscht → nicht wieder anlegen. Neue Dateien werden angelegt.
  Dateien, die es in der neuen Version nicht mehr gibt: unverändert → in die Sicherung verschoben; geänderte Seiten und
  Module bleiben (das Ergebnisfenster nennt sie), geänderte Systemdateien gehen auch, mit `… (deine Fassung vor X).ext.txt`
  daneben (ein übrig gebliebenes Skript liefe sonst weiter). Lesezeichen in `.obsidian/bookmarks.json`, die auf so entfernte
  Dateien zeigen, fallen beim Mischen weg, auch in Gruppen (`lesezeichenOhne`); erster Fall: die Seite „Schwerpunkt-Planer“
  (17.10.2026).
- **Keine Stapel von Kopien (seit 0.4.4):** Ältere Kopien `Seite (neu X).md` (X älter als die neue Version), die byte-genau
  der alten oder der neuen Vorlage gleichen, räumt das Update weg (in die Sicherung, `aufgeraeumt` im Bericht). Eine Kopie,
  die du geändert hast, und Kopien neben Dateien ohne Klasse bleiben. Dafür liest `io.liste(ordner)` die Dateien neben der Seite.
- **Reparatur nach dem Update (seit 0.4.4, `heilenMit`, `heilen()`):** Das Update auf eine Version plant immer der
  *installierte* `update.js`; das Update auf 0.4.4 also noch der von 0.4.3, der eine geänderte Systemdatei wieder als
  `Name (neu 0.4.4).ext.txt` beiseitelegt und jede geänderte Seite erneut kopiert. Darum prüft der neue `update.js` 30 s nach
  dem Laden und nach jeder neuen `installiert.json` einmal je Gerät und Version (gerätelokal `eba-update-reparatur`):
  - *Systemdatei:* weicht die aktive Datei von `installiert.json` ab und liegt daneben eine Kopie `Name (neu X)…` (X höchstens
    die installierte Version) mit genau dieser Prüfsumme und Größe, wird sie aktiv; deine Fassung kommt als
    `Name (deine Fassung vor X).ext.txt` daneben. Ist die aktive Datei danach die der Liste, gehen ihre Kopien bis zu dieser
    Version weg. Liegt die neue Fassung auf dem Gerät nicht vor, passiert nichts: Programmteile kommen nie von selbst aus dem
    Netz (`docs/datenschutz.md`).
  - *Seite:* Kopien `Seite (neu X).md` älter als die installierte Version, die byte-genau der jetzigen Vorlage gleichen, gehen
    weg. Die Seite selbst und Kopien, die du geändert hast, nie.
  - `.obsidian/` gleicht jedes Gerät selbst ab (dort oft nicht synchronisiert). Synchronisierte Pfade nur auf dem Gerät, das
    für alle schreibt (`ctx.zentral.abruferHier()`, wie `modell.js`); ein anderes Gerät merkt „Version lokal“ und prüft sie,
    sobald es selbst schreibt. Alles wird vorher gelesen und geprüft, dann Sicherung nach `.trash/Studium Autopilot Sicherung
    <Version> <Zeit>/`, Schreiben mit Zurücksetzen bei Fehlern, Kern zuletzt; geht etwas schief, merkt sich das Gerät nichts
    und versucht es beim nächsten Start wieder. Danach liest Obsidian die Snippets neu (`app.customCss.requestLoadSnippets`,
    falls vorhanden), ein getauschter Kern lädt das Plugin neu, und ein Hinweis sagt in einem Satz, dass deine Fassung als
    Sicherung daneben liegt.
- **installiert.json** (`System/Daten/`, synchronisiert, nicht im Repo): fehlt sie beim Start, legt `installiertAnlegen()` sie
  20 s nach dem Einlesen einmal als Kopie von `system-dateien.json` an (Erstinstallation; sonst keine Datei). Ohne beide Listen
  gilt jede abweichende Datei als geändert (Seiten und Module werden nicht überschrieben, Systemdateien nur mit deiner Fassung
  als Sicherung daneben).
- **Andere Geräte:** Das Update kommt per Sync. Dort zeigt `installiert.json` schon die neue Version → kein zweites Update.
  Läuft dort noch der alte Kern im Speicher (`installiert` > `plugin.manifest.version`), zeigt die Zeile „Neu laden“
  (Aktion `vorlage-neu-laden`). Skripte lädt der Hot-Reload ohnehin nach.
- **Neustart:** Hat sich `main.js`/`manifest.json` geändert, lädt `pluginNeuLaden()` das Plugin neu
  (`app.plugins.disablePlugin` → `loadManifests` → `enablePlugin`, nicht gespeichert, also bleibt es in
  `community-plugins.json` aktiv). Danach zeichnet nur die neue Instanz. Klappt das nicht, sagt das Ergebnisfenster „Obsidian
  einmal schließen und wieder öffnen“. Während des Updates zeigt der Kern beim Hot-Reload keine Hinweise (`plugin.stillBis`).
- **Sicherung** in `.trash/` (wie Obsidians Papierkorb; Obsidian zeigt ihn nicht an, Sync-Dienste gleichen ihn meist nicht ab,
  steht in `.gitignore`). Bewusst nicht in einem sichtbaren Ordner: Kopien von Modulen würden sonst in Bases als Module zählen.
  In der Dateien-App von iOS sind versteckte Ordner nicht sichtbar; wiederherstellen geht am PC/Mac.
- **Fehler:** kein Netz, falsche Prüfsumme oder Liste → nichts geschrieben, keine Sicherung; Schreibfehler → alles schon
  Geschriebene aus der Sicherung zurück. Das Ergebnisfenster sagt es in einem Satz, Einzelheiten unter „Mehr erfahren“.
- **Kanal:** `update_kanal: beta` in `System/Einstellungen.md` (Schalter „Beta-Versionen“ im Fenster „Studium Autopilot“ unter
  „Mehr erfahren“; Standard stabil). Angeboten wird `release`, auf Kanal beta die höhere von `beta` und `release`, nie eine
  ältere als die installierte. Versionen `X.Y.Z` und `X.Y.Z-beta.N` (Beta vor der fertigen Version).
- **Anzeige:** `ctx.update.anzeige()` → `{ html, pille, symbol, ton, knopf }`: „Wird aktualisiert …“, „Neu laden“, „Neue
  (Beta-)Version X verfügbar.“ + Notiz + Knopf „Aktualisieren“, Rückfall „Neue Version X verfügbar“ als Link auf die Releases
  (nur `plugin_aktuell`, kein `release`), „Version X. Du hast die neueste Version.“ oder nur „Version X.“ (ohne Angaben im
  Manifest, z. B. zentrale Daten aus). Die Zeile „Zentrale Daten“ zeigt den Hinweis nicht mehr.
- **Hinweis auf dem Dashboard (seit 0.3.1):** Codeblock `eba-update-hinweis` ganz oben in `Dashboard.md` (nach der Pfadzeile,
  vor den Kennzahlen). `ctx.update.hinweis()` nutzt dieselbe Logik wie `anzeige()` (Neu laden, Angebot je Kanal, Rückfall
  `plugin_aktuell` → Link „Ansehen“ auf die Releases) und liefert sonst `null`: Dann ist der Block leer (`.eba-uh-aus`) und
  samt Hülle unsichtbar. Der Hinweis zeigt nur den Titel, ohne Satz; was neu ist, steht unter „Was ist neu“. Knöpfe **Aktualisieren** (gleicher
  Ablauf mit Bestätigung) bzw. **Neu laden**, dazu **Später**:
  merkt die Version gerätelokal (`app.saveLocalStorage("eba-update-spaeter", version)`), bei einer anderen Version erscheint
  die Zeile wieder. Neu gezeichnet über `ctx.update.hinweisNeu()`, das `ctx.verbindungen.neuZeichnen()` mit aufruft (nach
  Abruf der zentralen Daten, Update, Kanalwechsel). CSS: Abschnitt 46 in `eba-core.css`.
- **Neuigkeiten (seit 0.4.1):** Niemand soll auf einer alten Version hängen bleiben, auch wenn iPhone/iPad Zeitgeber im
  Hintergrund anhalten.
  - *Frische Prüfung:* 4 s nach dem Einlesen holt `frischPruefen()` nur das Manifest (`ctx.zentral.manifestHolen`, ohne
    Abrufer-Sperre, schreibt keine Datei), wenn die letzte Prüfung über 30 Min. her ist (voller Abruf: `geprueft` im Stand
    von `zentral.js`; eigene: `eba-update-geprueft`). Zurück in der App nach 15 s ebenso; `zentral.js` holt nach 5 s nach,
    danach ist die Prüfung frisch, also kein zweiter Abruf. Beim Start kann der volle Abruf das Manifest (wenige KB) ein
    zweites Mal holen. Zentrale Daten aus oder `plugin.testZentralAus` → nie.
  - *Hinweis beim Öffnen* (`toastPruefen()`): Obsidian-Notice „Neue Version X ist da.“ mit **Aktualisieren** (gleicher Ablauf
    mit Bestätigung) und **Was ist neu**; antippen blendet ihn aus (= später). Angebot wie `hinweis()` (`angebot()`, Kanal).
    Einmal je App-Start (`sessionStorage` `eba-update-toast-sitzung`; über 6 h im Hintergrund zählt als neuer Start) und für
    dieselbe Version höchstens alle 12 h (`eba-update-toast` = `{ version, zeit }`, `toastFaellig`). Zeigt die Zeile
    `eba-update-hinweis` das Angebot gerade sichtbar (gezeichneter Block mit Fläche in einem sichtbaren Fenster; ein
    Dashboard im Hintergrund-Tab zählt nicht), kein Hinweis und nichts gemerkt (`toastEntscheiden` → `verdeckt`); beim
    nächsten Wechsel der Seite (`active-leaf-change`, `file-open`) wird neu entschieden. „Später“ auf der Zeile blendet sie
    für diese Version aus und zählt als Antwort für diesen App-Start; beim nächsten Start (nach dem Abstand) kommt der
    Hinweis wieder. Die Zeile hat dafür auch **Was ist neu** (leiser Knopf zwischen **Aktualisieren** und **Später**; auf dem
    iPhone drei Knöpfe in einer Reihe, je ≥ 44 px, CSS Abschnitt 51). Nicht während der Einrichtung
    (`ctx.einrichtung.fenster` oder `sollZeigen()`), nicht während eines Updates oder solange „Neu laden“ aussteht. Bringt
    der volle Abruf das Angebot erst später, zeigt `hinweisNeu()` den Hinweis noch bis 10 Min. nach Start/Rückkehr.
  - *Nach einem Update:* `eba-update-gesehen` = zuletzt auf diesem Gerät gelaufene Version. Läuft eine neuere, einmal
    „Aktualisiert auf Version X.“ mit **Was ist neu** (`nachUpdate`). Erster Lauf auf einem Gerät: still merken. Das Gerät, das
    aktualisiert, merkt die Version gleich; sein Ergebnisfenster hat den Knopf **Was ist neu**.
  - *Fenster „Was ist neu“* (`neuigkeitenZeigen({ von, bis, angebot })`, `.eba-modal-neu`): `CHANGELOG.md` vom Tag
    `RELEASE_ROH + "v" + bis` (wie die Update-Dateien; `plugin.testUpdateBasis` gilt auch hier), höchstens 256 KB. Abschnitte
    `## X.Y.Z – Titel` (`changelogAbschnitte`), Auswahl `von` (ausschließlich) bis `bis` (einschließlich), neueste zuerst,
    höchstens 8 (`abschnitteZwischen`). Gezeichnet mit `MarkdownRenderer` nach `markdownSicher` (kein HTML, keine
    Einbettungen, Wikilinks oder Codeblöcke, umbrochene Zeilen verbunden); danach bleiben nur https-Links. Fehler oder keine
    Abschnitte → `notiz` aus dem Manifest und Link „Auf GitHub ansehen“ auf das Release. Knöpfe **Aktualisieren**/**Später**
    beim Angebot, sonst **Fertig**. Mit `antwort` (aus dem Fenster vor dem Update geöffnet) beantwortet **Aktualisieren**
    die offene Frage direkt (`antwort(true)`, kein zweites Fragen), Schließen oder **Später** → `antwort(false)`. CSS: Abschnitt 51.
- **Fenster vor dem Update** (`fragen(rel)`, `.eba-modal-update`): Titel „Auf Version X aktualisieren?“, die Notiz aus dem
  Manifest als Text, leiser Knopf **Was ist neu** (öffnet „Was ist neu“ mit `antwort`), ein Satz „Deine Noten, Termine und
  Notizen bleiben. Vorher wird eine Sicherung angelegt.“, Einzelheiten eingeklappt unter „Mehr erfahren“. Knöpfe **Später**
  und **Aktualisieren** (Hauptknopf zuletzt im DOM): PC und iPad nebeneinander rechts, Hauptknopf rechts; iPhone untereinander,
  Hauptknopf oben; auf iPad und iPhone ≥ 44 px. Dieselbe Reihenfolge haben „Was ist neu“ und das Ergebnisfenster. Obsidian
  stapelt Knöpfe auf iPad und iPhone sonst (`column-reverse`); Abschnitt 51 legt die Richtung selbst fest.
- **Für Tests und andere Skripte:** `ctx.update` = `{ klasseVon, pfadOk, neuName, deineName, kopienVon, listePruefen, teilen,
  ohneHaken, seiteHaken, fmMischen, modulMischen, jsonMischenText, lesezeichenOhne, planen, aktualisierenMit(io, o),
  heilenMit(io, o), angebot, neuer, kanal, kanalSetzen, io, anzeige, hinweis, hinweisNeu, status, aktualisieren,
  installiertAnlegen, heilen, pluginNeuLaden, letzterBericht, fenster, changelogAbschnitte, abschnitteZwischen, markdownSicher,
  toastFaellig, toastEntscheiden, nachUpdate, pruefungFaellig, frischPruefen, toastPruefen, neuigkeitenZeigen, neuigkeiten }`.
  `aktualisierenMit` und `heilenMit` bekommen den Dateizugriff als `io` (`holen`, `lesen`, `schreiben`, `loeschen`, `liste`)
  und sind darum ohne Obsidian testbar (`tests/update.test.js`, Neuigkeiten: `tests/update-neuigkeiten.test.js`).
  `heilen(true)` startet die Reparatur sofort, ohne den Merker des Geräts.

## Verbindungen und Schloss

`verbindungen.js` hält eine Registry. Eine Verbindung ist `{ id, name, art ("link" | "anmeldung" | "zentral" |
"vorlage"), satz, kurz?, erklaerung, schritte, status(), gesperrt(), schlossKnopf?, trennenText?, pruefen(link)?, verbinden(link)?,
aktualisieren(parameter)?, trennen()? }`.

Texte für Nicht-Techniker (seit 15.10.2026): `satz` = ein Satz Nutzen (Schloss-Karte), `kurz` = höchstens ein Satz im Fenster,
`schritte` = kurze Schritte mit Verb vorn (`**fett**` = Bedienelement, genau wie in Alma/Obsidian benannt; `[Text](https://…)`
= Link, öffnet im Browser wie andere externe Links, `ctx.verbindungen.fett`/`textTeile`), `erklaerung` =
Hintergrund, nur eingeklappt unter „Mehr erfahren“ (`<details class="eba-modal-mehr">`). In Notizen gilt dasselbe Muster mit
`<details class="eba-mehr">` (z. B. `System/Einstellungen.md`). Regel seit 17.10.2026: Was nur eine Zeile oder einen
kurzen Absatz hätte, klappt nicht ein; es steht direkt da oder entfällt.

| id | Art | Gesperrt, solange … |
|---|---|---|
| `alma` | Link (iCalendar), nutzt `alma.js` (`status`, `linkPruefen`, `verbinden(link, { nurBeiErfolg })`, `trennen`, `fehler`); im eigenen Uni-Abgleich nur der Satz „Dein Stundenplan kommt über deinen Uni-Abgleich.“ ohne Knopf (Aktion `verbinden` zeigt ihn als Hinweis); ist dort doch ein Link gespeichert, bleibt er nutzbar, die Zeile warnt vor doppelten Einträgen und bietet Trennen | kein Link auf diesem Gerät **und** keine eigene Notiz in `Stundenplan/` **und** keine zentrale Stundenplan-Notiz **und** kein eigener Uni-Abgleich **und** Alma in der Einrichtung offen (übersprungen oder Einrichtung nicht fertig, `ctx.einrichtung.almaOffen()`; seit 0.3.0) |
| `ilias` | „ILIAS-Unterlagen“ (seit 0.4.0), Anmeldung mit Benutzername und Passwort über `ctx.ilias` (siehe „ILIAS-Unterlagen“); eigenes Fenster `IliasFenster`; Knopf Verbinden, verbunden Jetzt holen (lädt gerade ein anderes Gerät: Hier laden). Im eigenen Uni-Abgleich heißt sie „ILIAS“: nicht verbunden der Satz „Deine Unterlagen kommen über deinen Uni-Abgleich.“ und leise **Für Übungsgruppen verbinden** (öffnet gleich die Anmeldung, eigene Texte ohne Schritte, danach schließt das Fenster); verbunden Stand der Prüfung, Knopf **Jetzt prüfen**, Textlink **Trennen** | nicht verbunden **und** keine Begleitnotiz mit `ilias_id` unter `Unterlagen/` **und** ILIAS in der Einrichtung offen (`ctx.einrichtung.iliasOffen()`); nie im eigenen Uni-Abgleich oder ohne Anmeldebaustein |
| `zentral` | Zentrale Daten (`zentral.js`), Knopf Jetzt aktualisieren (aus: Einschalten); die Schalter Zentrale Daten und Fachschaft & Veranstaltungen stehen im Fenster „Mehr erfahren“ | nie (Standard an) |
| `vorlage` | „Studium Autopilot“ (`update.js`): Version, Knopf Aktualisieren bzw. Neu laden, sonst Mehr erfahren; Schalter „Beta-Versionen“ im Fenster unter „Mehr erfahren“ | nie |

- Symbole (seit 15.10.2026, iPad-Test): ruhige Lucide-Linien als inline-SVG in `currentColor` (`SYMBOLE`, `ctx.verbindungen.svg(name)`:
  schloss, haken, uhr, extern, warnung, pause, aus), keine Emojis; `setIcon` blieb auf dem iPad leer (wie in `menue.js`).
- Codeblock `eba-schloss <id>`: Solange gesperrt, eine Karte mit Schloss-Symbol, einem Satz und „Verbinden“. Steht der Block in einer Karte
  (Callout), blendet CSS (`:has`) den übrigen Inhalt aus, z. B. das Wochenraster auf Dashboard und Stundenplan. Sind
  Stundenplan-Notizen da (etwa per Sync), gibt es kein Schloss; die Übersicht sagt dann „Dein Stundenplan liegt vor (n
  Einträge).“ mit leisem Verbinden.
- Codeblock `eba-verbindungen`: Übersicht in den Einstellungen (Stand, zuletzt aktualisiert), ohne Satz darüber. Je Zeile
  höchstens **ein** Knopf (Verbinden, Aktualisieren, Jetzt holen, Jetzt prüfen, Jetzt aktualisieren, Einschalten oder Mehr
  erfahren); führt er nicht ins Fenster, steht „Mehr erfahren“ als Textlink im Status. Das Fenster enthält den Rest: bei Alma
  (verbunden) „Neuen Link eingeben“ und „Trennen“, bei den zentralen Daten die beiden Schalter (Obsidian-`Setting` mit
  Umschalter). Hätte das Fenster nur einen Knopf, steht er selbst als Textlink da (ILIAS nur für Übungsgruppen: „Trennen“).
  Inhalt je Zeile: `zeile(id)` (`statusZeile`) → `{ text | html, pille, symbol, ton, knopf, link }`. Seit 18.10.2026
  widersprechen sich Symbol und Pille nie: Pille nur, wo der Stand zählt („verbunden“, „nicht verbunden“ nur mit Schloss,
  wenn nichts da ist und Verbinden der Weg ist, „Anmeldung prüfen“ mit Warnung). Kommt etwas ohnehin (Stundenplan oder
  Unterlagen per Sync, zentraler Stundenplan, eigener Uni-Abgleich), steht ein Haken ohne Pille da und Verbinden ist leise.
  Fenster haben keinen Knopf, der nur schließt (dafür ist das ×), und höchstens einen Hauptknopf.
- Verbinden-Fenster: vier Schritte (Link zu Alma, Link zum Stundenplan → „Daten für iCalendar (ics) exportieren“ → „Link
  kopieren“; Einrichtung ebenso). Die Links (`ctx.verbindungen.ALMA`) sind am 17.10.2026 mit Anmeldung geprüft; ohne Anmeldung
  führt der Stundenplan-Link zur Anmeldung und danach zur Startseite, darum zuerst Alma. Der Weg durchs Menü (Mein Studium →
  Stundenplan) steht unter „Mehr erfahren“, falls Alma die Adresse ändert. Eingabe mit Prüfung (https/webcal, Server alma.uni-tuebingen.de, nicht nur die Startseite), sofortiger Import, Ergebnis mit
  Anzahl. Scheitert der Abruf, bleibt kein Link gespeichert (vorheriger Zustand gilt wieder).
- Gespeichert wird nur gerätelokal (`app.saveLocalStorage`): `eba-alma-ics`, `eba-alma-stand`, `eba-alma-seit`.
- Codeblock `eba-alma-knoepfe` (Seite Stundenplan, seit 0.3.0): verbunden → nur „Stundenplan aus Alma holen“, sonst
  „Alma verbinden“ und ein Satz dazu; den Satz nicht, solange das Schloss gilt (die Schloss-Karte darunter sagt dasselbe,
  seit 16.10.2026); im eigenen Uni-Abgleich ohne Link nichts. Gezeichnet als Knopf-Karte `callout[data-callout=eba-neu]` (gleiche Gestalt wie
  `> [!eba-neu|ohne-titel]`). Vorher standen beide Knöpfe fest in der Notiz, auch bei verbundenem Alma.
- Codeblock `eba-ilias-knopf` (Seite Unterlagen, seit 0.4.0): steht leer in der Knopf-Karte und trägt die Klasse `eba-ilias-an`,
  solange ILIAS auf diesem Gerät verbunden ist. Dann zeigt CSS (Abschnitt 49, `:has`) den festen Knopf **Aus ILIAS holen**
  derselben Karte (Aktion `ilias-holen`), sonst ist er ausgeblendet. Darunter steht `eba-schloss ilias`.
- Für andere Skripte: `ctx.verbindungen.gesperrt(id)`, `ctx.verbindungen.schlossKarte(el, id)`.

## ILIAS-Unterlagen (seit 0.4.0)

Kursdateien aus ILIAS (Uni Tübingen, ILIAS 10) landen von selbst unter `Unterlagen/`, je mit Begleitnotiz wie beim Einordnen.

| Skript | Aufgabe |
|---|---|
| `ilias-netz.js` | Sitzung mit Keksdose, Weiterleitungen, Drossel, nur https und nur Server der Uni; am PC Node-https aus Electron (Verbindungen bleiben offen, Seiten gzip), auf iPhone/iPad `requestUrl` |
| `ilias-anmeldung.js` | Anmeldung über Shibboleth; Ergebnis `{ ok }` bzw. `{ ok: false, grund, hinweis }` (falsches Passwort, Zustimmung, zweiter Faktor, Netz) |
| `ilias-html.js` | Kursliste und Kursinhalt aus dem HTML lesen (eigener kleiner Leser) |
| `ilias.js` | Zeitplan, Abrufer-Sperre, Durchsuchen, Ablage, Index; `ctx.ilias` für die Oberfläche |
| `unterlagen.js` | Namen „Code Art NN Titel“ (auch Titel aus der ersten PDF-Seite), Ordner, Begleitnotiz |
| `verbindungen.js`, `einrichtung.js` | Zeile, Fenster, Schloss, Knopf auf Unterlagen; Bildschirm 6 der Einrichtung |

- **Ablauf:** Sperre → Index lesen, Umbenennungen und Löschungen nachziehen → anmelden (gilt die Sitzung des letzten Laufs
  noch, entfällt das) → Kursliste → aktive Kurse durchsuchen (zwei Seiten zugleich, der älteste Kurs zuerst, Kurs für Kurs)
  → geänderte, dann neue Dateien laden (am PC zwei zugleich, auf iPhone/iPad eine; abgelegt wird eine nach der anderen).
  Automatisch 20 s bis gut 2 Min. nach dem Start, dann stündlich, und zurück in der App nach über 60 Min.; dazu der Knopf.
  Kurse mit Modulcode und Modulnotiz sind beim ersten Mal an, die anderen aus. Nach dem ersten Verbinden (Fenster,
  Einrichtung) startet der erste Abruf gleich, wenn ein Kurs an ist. Ein während des Laufs abgewählter Kurs wird nicht
  mehr durchsucht (eine Seite, die schon unterwegs ist, kommt noch) und nichts mehr aus ihm geladen.
- **Dateien im Tresor (synchronisiert):** `System/Daten/ilias.json` (Index: Kurse mit Wahl, welche ILIAS-Datei wo liegt, je
  Eintrag mit Zeitstempel, vor jedem Schreiben mit der Platte gemischt) und `System/Daten/ilias-abruf.json` (Abrufer-Sperre:
  nur ein Gerät lädt, Übernahme nach 80 Min. Stille wie bei den zentralen Daten, sofort bei `frei: true` nach dem Freigeben
  der Gruppen, siehe „Deine Übungs- oder Tutoriengruppe“).
- **Kurspasswörter (nach bestem Bemühen):** Manche Kurstitel tragen das Beitrittspasswort. `ohneKennwort` prüft eine
  gefaltete Fassung (Entitäten aufgelöst, auch doppelt; unsichtbare Zeichen wie das weiche Trennzeichen weg; NFKC; kyrillische
  und griechische Doppelgänger lateinisch). Starke Marken zählen immer, außer als Wortanfang („Passwortsicherheit“):
  Passwort/Password/Kennwort in jeder Schreibweise und als Wortende („Kurspasswort“), Passwd, Pwd, Passw., Kennw.,
  Pass-/Zugangs-/Einschreibecode, Einschreibe-/Zugangsschlüssel, Schlüsselwort, Mot de passe, Enrolment key, Zugangsdaten.
  PW-Formen (PW, P/W, P.W., KursPW) zählen mit Ziffer dahinter, mit „:“/„=“ oder nach einem Trenner („S110 PW-Statistik“
  bleibt). Schwache Wörter (Key, Code, PIN, Pass, Zugang, Login, Secret, Schlüssel, KW) nur mit „:“/„=“ und einem Wert, der wie
  ein Passwort aussieht („Key: Takeaways“ bleibt). Der Titel endet vor der Marke, wenn davor ein Trenner steht oder „:“ folgt;
  sonst bleibt nichts, und der Aufrufer nimmt Code oder „Kurs <Nummer>“ (nie ein leerer Titel). So kommen Titel in den Index,
  die Kursliste, Ordnernamen, die `quelle` der Begleitnotizen und gemerkte Funde (beim Lesen gesäubert). Alte Index-Einträge
  säubert schon das Lesen; nach dem Start (mit dem Zufallsversatz) schreibt `saeubern()` die Datei nur, wenn sich ein Eintrag
  wirklich ändert. Einmal je Gerät mit der Abrufer-Sperre (`eba-ilias-migration`) säubert der Lauf vorhandene Begleitnotizen
  (`quelle`, Zeile „Aus ILIAS:“) und benennt Ordner unter `Unterlagen/` mit Passwort-Marke um (Links und Index ziehen mit).
  Ältere Fassungen auf anderen Geräten können einen rohen Titel zurückschreiben, bis sie aktualisiert sind; in der
  Versionsgeschichte eines Sync-Dienstes bleibt er.
- **Nur auf dem Gerät:** `app.saveLocalStorage` mit `eba-ilias-benutzer`, `eba-ilias-stand`, `eba-ilias-protokoll` (letzte 20
  Läufe), `eba-ilias-auftrag` (offener Abruf, siehe „Weitermachen“), `eba-ilias-schreibt` (Datei, die gerade geschrieben
  wird), `eba-geraet`. Das Passwort nur im Schlüsselbund von Obsidian (`app.secretStorage`, seit Obsidian 1.11.4), Eintrag
  `studium-autopilot-ilias-<Prüfsumme des Tresornamens>` (iOS teilt den Schlüsselbund zwischen Tresoren). Die Oberfläche
  gibt das Passwort nur als Funktion an `zugangSpeichern(benutzer, geber, { pruefen: true })` weiter und leert das Feld danach;
  es steht nie in Status, Protokoll, Hinweisen oder Konsole.
- **Ablage:** Byte-gleiche Datei schon da → nur merken. Nie überschreiben (sonst „ (2)“). In ILIAS geändert und im Tresor
  unverändert → ersetzen; von dir verändert → deine bleibt, die neue kommt daneben als „… neue Fassung JJJJ-MM-TT“. Gelöscht
  bleibt gelöscht. Umbenennen und Verschieben folgt der Index.
- **Grenzen:** keine Videos, Foren, Tests; Dateien über 50 MB nicht (die Zeile nennt ihre Zahl). Je Lauf höchstens 400 Seiten
  und 150 Downloads auf iPhone/iPad, 400 am PC (der erste Abruf braucht so meist nur einen Lauf); automatische Läufe
  durchsuchen einen Kurs höchstens alle 3 Std. Lehnt die Uni die Anmeldung ab, gibt es keine automatischen Versuche mehr, bis
  du den Zugang neu eingibst.
- **Last für die Uni:** Die Drossel der Sitzung (`N.drossel`, `ilias-netz.js`) lässt höchstens 2 Anfragen gleichzeitig zu und
  startet sie mindestens 400 ms auseinander (höchstens 2,5 je Sekunde; eine Anfrage hält ihren Platz samt Weiterleitungen).
  Zum Vergleich PFERD mit Standard-Einstellung: eine Anfrage nach der anderen ohne Pause, bei uns gut 3,5 je Sekunde. ILIAS
  liefert weder `Last-Modified` noch `ETag` und bei Ordnern kein Änderungsdatum; unveränderte Ordner lassen sich darum nicht
  überspringen, durchsucht wird je Kurs höchstens alle 3 Std. (Knopf: alle).
- **Weniger Anfragen** (gemessen am echten Konto 17.10.2026, vorher 329 HTTP-Anfragen mit 148 Weiterleitungen für 60 Dateien):
  Permalinks `goto.php/<typ>/<ref>` leitet ILIAS zweimal weiter. Ordner, Gruppen und Kurse holt `quelleAusNetz` darum über
  die Adresse ihres Reiters „Inhalt“ (`H.inhaltReiter`, mit `cmdNode`), die es an der ersten Seite jeder Art lernt und mit der
  neuen `ref_id` füllt; passt sie nicht (Serverfehler, kein Zugriff, wo der Permalink geht), bleibt es in dieser Sitzung beim
  Permalink. Nicht geholt: Sitzungen mehr als 7 Tage voraus, Sitzungen ohne jede Eigenschaft in der Liste (wer Materialien
  hat, trägt „Materialien zur Sitzung: N“; ohne Eigenschaft war die Seite bei allen Messungen leer) und Gruppen, in denen du
  nicht Mitglied bist (`mitglied: false`, ILIAS zeigt dort nur die Beitrittsseite). Die Anmeldung prüft die Seite, auf der
  ihre Weiterleitungen enden, statt das Dashboard eigens zu holen. Die Sitzung (Kekse am PC, Drossel, gelernte Adressen)
  bleibt über Läufe im Speicher des Geräts (nie gespeichert); ob sie noch gilt, zeigt die erste Seite (sonst einmal
  anmelden, gleichzeitige Anfragen warten auf dieselbe Anmeldung). Weg ist sie beim Trennen, nach gescheiterter Anmeldung,
  bei anderem Benutzernamen und beim Entladen. Das Prüfen beim Verbinden meldet sich immer neu an.
  Ergebnis: erster Abruf am PC 64 s statt 181 s (173 statt 329 Anfragen, 16 Weiterleitungen), auf iPhone/iPad (nachgebildet)
  1 Lauf in 64 s statt 3 Läufen in 274 s samt Stapelpausen; erneutes Durchsuchen ohne Neues 38 s statt 135 s (98 statt 269
  Anfragen, keine Anmeldung).
- **Eigener Uni-Abgleich:** Liegt `System/Skripte/abgleich.js` im Tresor oder steht `ilias_unterlagen: extern` in den
  Einstellungen, lädt `ilias.js` nie Dateien (Status `K.TEXT_EXTERN` „Deine Unterlagen kommen über deinen Uni-Abgleich.“),
  kein Schloss. Mit ILIAS-Zugang prüft es nur die Übungsgruppen (Lauf `nur-gruppen`, Status „Prüft deine Übungsgruppen,
  zuletzt vor 5 Min. …“), ohne Auftrag: kein Weitermachen nach Fehlern, keine Stapel; ein Auftrag von früher wird verworfen
  und sein Weitermachen läuft still. Der Hinweis „ILIAS: Übungsgruppen geprüft.“ kommt so nur nach deinem Tipp (Jetzt
  prüfen, Verbinden), nie vom stündlichen Prüfen.
- **Fortschritt:** Ereignisse über `beobachten(fn)`: `start { manuell, weiter }`, `fortschritt { phase, text, erledigt,
  gesamt, code }`, `fertig { manuell, ergebnis, text, weiterIn }`. Nie Kurs- oder Dateinamen (Kurstitel können
  Einschreibepasswörter enthalten), höchstens der Modulcode. `fortschrittAnzeige(x, weiter)` macht daraus die Texte: Zeile
  und Fenster „Lädt 12 von 40“, Knopf auf Unterlagen ebenso (sonst „Lädt …“), Hinweis „ILIAS · 12 von 40“ bzw.
  „ILIAS · weiter: 26 von 40“, dazu der Anteil für den Balken. Läuft ein Abruf, den du gestartet hast (Knopf in Fenster,
  Zeile oder auf Unterlagen, Einrichtung), zeigt `ilias.js` genau **einen** Hinweis von Obsidian (`Notice` ohne Ablaufzeit)
  mit Text, **Stoppen** und dünnem Balken und ändert ihn an Ort und Stelle. Gewählt, weil Obsidian Hinweise auf iPhone und
  iPad oben über die volle Breite zeigt (keine Statusleiste nötig, nichts verdeckt Eingabefelder oder die Leiste unten) und
  am PC oben rechts; Wegtippen ist eingebaut. Wegtippen blendet ihn nur aus, ein weiterer Knopfdruck zeigt ihn wieder. Am
  Ende verschwindet er, dann kommt der Hinweis zum Ergebnis („ILIAS: 12 neue Dateien in Unterlagen.“, „ILIAS: keine neuen
  Dateien.“ oder der Fehler wörtlich). Automatische Läufe bleiben still. Er hängt am Motor, nicht an einer Ansicht, und wird
  beim Entladen über `ctx.aufraeumen` geschlossen. Ein Knopf während eines automatischen Laufs übernimmt diesen Lauf.
- **Weitermachen:** Ein Abruf, den du startest, legt einen **Auftrag** an (nur auf diesem Gerät, nie synchronisiert, damit
  andere Geräte nicht darauf reagieren). Nach jedem Lauf entscheidet `naechsterSchritt(auftrag, bericht)`: Dateien übrig
  (Grenze je Lauf) oder Kurse wegen der Seiten-Grenze offen → nächster Stapel nach 20 s (höchstens 10 Stapel); Fehler
  (z. B. kein Netz) → neuer Versuch nach 1, 5, 15 Min., danach nur noch stündlich; Plugin neu geladen → weiter beim Start;
  alles da → Auftrag erledigt. Nie weiter nach abgelehnter Anmeldung, Zustimmung, zweitem Faktor, Trennen, **Stoppen** oder
  wenn ein anderes Gerät lädt. Offener Auftrag beim Start: weiter nach 20–60 s; zurück in der App: sofort, und ein Lauf ohne
  Regung seit 2 Min. (`abgestorben`; iPhone und iPad halten Skripte im Hintergrund an) wird verworfen und neu gestartet.
  Auf iPhone/iPad nach mehr als 10 s im Hintergrund: Regt sich ein Lauf mit Auftrag auch 10 s nach der Rückkehr nicht (seine
  Anfrage hat iOS liegen lassen), wird er gleich verworfen und der Auftrag macht weiter, statt bis zur Zeitgrenze zu warten.
  Jeder Lauf hat ein eigenes Stopp-Zeichen; ein verworfener, der später aufwacht, schreibt nichts mehr. Fortgesetzte Läufe
  zeigen den Hinweis wie der Knopf und zählen über die Stapel weiter, durchsuchen aber wie automatische Läufe nur Kurse, die
  nicht in den letzten 3 Std. ganz durchsucht wurden; der Knopf durchsucht alle.
- **Funde:** Was das Durchsuchen findet und noch nicht geladen ist, merkt sich das Gerät nach jedem Kurs (`eba-ilias-funde`,
  gerätelokal; vom ILIAS-Eintrag nur, was der Download braucht, keine Titel). Der nächste Lauf übernimmt die Funde der Kurse,
  die er nicht neu durchsucht, und prüft sie gegen den Index (schon geladen, gelöscht, zu groß → weg). So fängt ein Abruf,
  den iPhone oder iPad im Hintergrund angehalten haben, beim nächsten Öffnen nicht von vorn an, der nächste Stapel lädt ohne
  neues Durchsuchen, und der Rest über der Grenze je Lauf wartet nicht mehr bis zur nächsten Durchsuchung. Ein gestoppter
  oder verworfener Lauf schreibt keine Funde; Trennen löscht sie. Fehlen gemerkte Funde ganz (nach Trennen oder einem Update
  mitten im Abruf), durchsucht ein fortgesetzter Lauf wieder alle Kurse.
- **Zeitgrenzen auf iPhone/iPad:** `requestUrl` meldet keinen Fortschritt und kehrt manchmal nie zurück, wenn iOS eine
  Anfrage beim Wechsel in den Hintergrund liegen lässt. `transportMobil` bricht darum eine Seite nach 60 s und eine Datei
  nach 5 Min. ab (Fehler `zeitueberschreitung`, ohne Status: der Lauf endet, der Auftrag versucht es nach 1 Min. neu).
- **Absturz beim Schreiben:** Vor dem Schreiben einer Datei merkt sich das Gerät `{ id, pfad, art }`, nach dem Index ist es
  leer. Steht beim nächsten Lauf noch etwas da, war die Datei unfertig: Eine neue, nicht im Index, wird samt Notiz gelöscht und
  neu geladen (sonst bliebe sie halb, und daneben käme „ (2)“); eine halb ersetzte bekommt ihre Prüfsumme in den Index, damit
  der nächste Lauf sie ersetzt, statt sie für deine Änderung zu halten.
- **Oberfläche:** Zeile und Fenster lesen `ctx.ilias.status()` (fertiger Text, dazu `verbunden`, `gesperrt`, `laeuft`,
  `anderes`, `fortschritt` …); während eines Abrufs ändern Fortschritts-Ereignisse nur die Zeile und den Knopf auf Unterlagen
  (`ctx.verbindungen.iliasStand()`), statt alles neu zu zeichnen. Läuft ein Abruf, zeigt das Fenster den Stand, „Du kannst
  das Fenster schließen. Lass Obsidian dabei offen, sonst pausiert der Abruf bis zum nächsten Öffnen.“ (iPhone/iPad: „im
  Vordergrund“ statt „offen“) und die Knöpfe Schließen und Stoppen. Das Fenster zeigt nicht verbunden Schritte, zwei Felder (kein Autofokus auf
  iPhone/iPad), die Datenschutz-Zeile und die Hinweise der Anmeldung wörtlich; verbunden Stand, Kurse mit Schaltern
  (`kursSetzen`), Jetzt holen und Trennen (`zugangLoeschen`; Dateien bleiben, deine Übungsgruppe bleibt als gewählte Notiz).
  Kurstitel nur dort und nie in Hinweisen.
- **Tests:** `tests/ilias.test.js` (ganzer Ablauf mit erfundenem ILIAS und Tresor im Speicher, `tests/ilias-attrappen.js`;
  dazu Gleichzeitigkeit, nicht geholte Sitzungen und Gruppen, Sitzung über Läufe, gelernte Adressen),
  `ilias-weiter.test.js` (Fortschrittstexte, Ereignisse, Auftrag und Weitermachen, toter Lauf, Funde, Absturz beim Schreiben),
  `ilias-netz.test.js` (mit Drossel und PC-Transport), `ilias-anmeldung.test.js` (nachgespielter Server), `ilias-html.test.js`. In Obsidian ersetzen
  `ctx.ilias.anmeldungSetzen(fn)` und `ctx.ilias.quelleSetzen(fn)` Anmeldung und ILIAS (`null` = wieder echt);
  `plugin.testIliasAus = true` schaltet den stündlichen Lauf ab (das Weitermachen eines offenen Auftrags nicht).

## Einrichtung (seit 0.3.0)

`einrichtung.js` ersetzt die Personalisieren-Karte. Ein Obsidian-Modal (`eba-modal eba-modal-einrichtung`) mit acht
Bildschirmen: 1 Willkommen (ein Satz, **Los geht’s** / *Später*), 2 Studienbeginn (Semester-Auswahl aus
`ctx.modell.semesterAuswahl()`, vorausgewählt das aktuelle Semester; Hinweis „Heute bist du im n. Fachsemester.“),
3 Variante (vier Optionen, „Weiß ich noch nicht“ = `offen` vorausgewählt), 4 Über dich (Name, Zielnote; Prüfung
`ctx.personalisieren.zielnotePruefen`), 5 Alma (drei Schritte, Feld, Prüfung und Verbinden über `ctx.verbindungen.holen("alma")`,
also `alma.js` `linkPruefen`/`verbinden(link, { nurBeiErfolg })`; im eigenen Uni-Abgleich nur „Dein Stundenplan kommt über
deinen Uni-Abgleich.“ und **Weiter**), 6 ILIAS (seit 0.4.0, freiwillig: ein Satz, Benutzername,
Passwort, Datenschutz-Zeile; **Verbinden** prüft den Zugang und liest die Kursliste, ohne zu laden; im eigenen Uni-Abgleich, mit zu
altem Obsidian oder ohne Anmeldebaustein nur ein Satz und **Weiter**), 7 Darstellung (seit 17.10.2026: derselbe Umschalter
Hell · Dunkel · Automatisch, `ctx.darstellung.schalter`, seit 18.10.2026 darunter die Designs als Auswahl wie die Variante,
`designZeilen`, `designSetzen`; Antippen schaltet sofort um, nur **Weiter**, siehe
[Darstellung](#darstellung-hell-dunkel-automatisch-und-design)), 8 Fertig (Zusammenfassung mit Design und Darstellung, „Später nachholen“ mit Knopf zum Bildschirm). Ab Bildschirm 2 „Schritt n von 7“
und Punkte; Zurück jederzeit, Überspringen auf 2–6.

Regeln: je Bildschirm ein Satz und eine Hauptaktion, keine Fachwörter; kein Autofokus (sonst springt auf dem iPhone die Tastatur
auf); Tippflächen ≥ 44 px, Eingaben 16 px; auf dem iPhone bildschirmfüllend (`eba-core.css` Abschnitt 45). Esc, × und
„Später“ schließen ohne zu schreiben. Eingaben ohne Weiter bleiben im Speicher (`ctx.bleibend("entwurf")`).

**Zustand** in `System/Einstellungen.md` (synchronisiert, gilt für alle Geräte):

| Feld | Werte |
|---|---|
| `einrichtung` | `offen` (oder leer) · `laeuft` · `fertig` |
| `einrichtung_schritt` | Bildschirm 1–8, an dem es beim nächsten Start weitergeht (bis 0.3.x war 6 „Fertig“, bis 0.4.x 7) |
| `einrichtung_uebersprungen` | Liste aus `studienbeginn`, `variante`, `angaben`, `alma`, `ilias` |

Geschrieben wird nur nach einem Tipp auf **Los geht’s**, **Weiter** oder **Überspringen**: Antworten des Bildschirms und Stand
zusammen in einem `processFrontMatter` (Studienbeginn als festes Datum, nicht leer, damit er nicht mit dem Semester wandert).
Der Schritt zu Fertig (Bildschirm 8) setzt `fertig`. Die Darstellung steht nicht hier, sondern nur auf dem Gerät. „Erneut starten“ (Aktion `einrichtung`, `ab=2`) beginnt bei 2, vorausgefüllt, ohne Zurück zum
Willkommen; der Status bleibt `fertig`.

**Automatisch** (`start()`, nur beim App-Start): wenn der metadataCache eingelesen ist (`initialized`, sonst `resolved`) und das
Dashboard steht, höchstens einmal je App-Sitzung (`sessionStorage`, damit ein Neuladen des Plugins, z. B. nach einem Update,
sie nicht erneut öffnet). Gezeigt wird, wenn `einrichtung` ≠ `fertig` und (`laeuft` oder der Tresor ist nicht eingerichtet:
kein Name, kein Studienbeginn, keine Notiz in `Stundenplan/`). Ein Tresor aus 0.2.0 mit Angaben sieht sie also nicht, und es
wird nichts geschrieben. Weitere Geräte: Der Stand kommt per Sync; trifft `fertig` oder ein Name ein, während dort nur das
Willkommen offen ist, schließt es sich von selbst.

**Schloss:** `ctx.einrichtung.almaOffen()` = `einrichtung` ≠ `fertig` oder `alma` übersprungen. Das Alma-Schloss
(`eba-schloss alma`, Wochenraster auf Dashboard und Stundenplan) erscheint nur, wenn das gilt **und** kein Stundenplan da ist
**und** dieses Gerät nicht verbunden ist. `iliasOffen()` gilt ebenso für `ilias`, dazu bei `fertig` mit
`einrichtung_schritt` ≤ 6: Die Einrichtung wurde vor 0.4.0 abgeschlossen. So ein Tresor sieht die Einrichtung nach dem Update
nicht noch einmal, sondern das Schloss `eba-schloss ilias` auf der Seite Unterlagen.

Für Tests: `ctx.einrichtung = { zustand(), eingerichtet(), sollZeigen(), almaOffen(), iliasOffen(), oeffnen({ ab }), automatisch({ immer }),
sitzungMerken(an), fenster }`; das Fenster hat `schritt`, `felder`, `weiter()`, `ueberspringen()`, `zurueck()`, `gehe(n)`
(ohne zu schreiben).

## Darstellung: hell, dunkel, automatisch und Design

Seit 17.10.2026 hat das Farbschema Paper Elfenbein, `eba-paper-elfenbein.css`, Farben für Obsidians helles und dunkles Grundschema
(`.theme-light`, `.theme-dark`). Form und Schrift gelten in beiden (`:is(.theme-light, .theme-dark) …`), nur die Farben
wechseln. Bis dahin gab es dazu Paper, Paper Tübingen, Paper Schiefer und Graphite mit dem Befehl „Design wechseln“.

**Designs (seit 18.10.2026):** Elfenbein (Vorgabe), Flieder (`eba-flieder.css`: Lila, Akzent Violett, Rosé als zweite Farbe,
große Rundungen, runde Überschriften) und Klar (`eba-klar.css`: weiß, kühle Grautöne, Akzent Blau, Formen aus den Grundwerten
von `eba-core.css`). Flieder und Klar gelten nur hell; dunkel sieht immer aus wie Elfenbein. Gewählt wird über eine Klasse am
`body` (`eba-design-flieder`, `eba-design-klar`; Elfenbein ohne Klasse), nicht über das Ein- und Ausschalten der Bausteine:
Die eingeschalteten Bausteine stehen in `appearance.json` und kämen auf alle Geräte. Alle drei sind immer an. Die hellen
Regeln von Elfenbein stehen darum unter `.theme-light:where(:not([class*="eba-design-"]))`, die der Designs unter
`.eba-design-…:where(.theme-light)`. Beide sind so spezifisch wie `.theme-light`: Die Ausnahmen in `eba-core.css` (Folien,
erste Überschrift unter dem Seitenkopf, iPhone) gewinnen weiter, und die Reihenfolge der Bausteine spielt keine Rolle. Ohne
geladene Skripte gilt Elfenbein; damit ein gewähltes Design beim Start nicht erst nach den Skripten erscheint, steht seine
Klasse zusätzlich in `eba-start-klassen`, und `main.js` setzt sie schon in `onload` (und nimmt sie in `onunload` wieder weg).

**Je Gerät:** Hell oder dunkel und das Design wählt jedes Gerät selbst; Name, Studienbeginn und Variante gelten dagegen überall. Darum
speichert `darstellung.js` die Wahl nur auf dem Gerät (`app.saveLocalStorage`, Schlüssel `eba-darstellung` und `eba-design`), nie im
Tresor, und schreibt Obsidians Einstellung `theme` nicht. Die steht in `.obsidian/appearance.json` (`moonstone` = Hell,
`obsidian` = Dunkel, `system` = Automatisch; Vorgabe der Vorlage `system`) und kommt mit `.obsidian/` auf alle Geräte. Sie
gilt nur, solange auf dem Gerät nichts gewählt ist. Ist etwas gewählt, setzt `anwenden()` die Klassen `theme-light`/`theme-dark`
selbst: gleich nach jedem Umschalten durch Obsidian (`css-change`, im selben Durchlauf, also ohne Flackern; der zweite Aufruf
ändert nichts mehr), bei einem Wechsel am Gerät (`prefers-color-scheme`), in neuen Fenstern (`window-open`) und für die
Statusleiste auf iPhone/iPad (`updateMobileFrameTheme`). Beim Abmelden gilt wieder Obsidians Einstellung. Bis 17.10.2026
schrieb die Wahl `appearance.json` und schaltete damit alle Geräte mit um. `appearance.json` ändert kein Update.

- Codeblock `eba-darstellung` (Einstellungen & Hilfe, Abschnitt „Darstellung“): ein Umschalter Hell · Dunkel · Automatisch
  (`.eba-ds`, `role="radiogroup"`), ohne Untertexte; am PC so breit wie nötig, auf iPhone, iPad und in der Einrichtung über
  die ganze Breite mit 44 px Tippfläche. Zeigt die Wahl des Geräts, sonst Obsidians Einstellung (neu gezeichnet bei
  `config-changed` `theme`). Bis zur Rückmeldung am 17.10.2026 waren es drei Zeilen mit „Wählen“ und Erklärsätzen.
- Darunter (seit 18.10.2026) je Design eine Zeile wie bei der Variante (`.eba-vb`, Farbmuster `.eba-dz-muster` mit Seite und
  Akzent des Designs): die gewählte mit Pille „gewählt“, die übrigen mit „Wählen“ (Aktion `design`). Flieder und Klar sagen in
  ihrer Zeile „im Dunkelmodus Elfenbein“, sonst wirkte ein Wählen im Dunkeln wie ohne Folge.
- Aktion und Befehl `darstellung` (`wert` = `hell`, `dunkel`, `automatisch`; ohne Wert eine Auswahl), ohne Hinweis.
- Aktion und Befehl `design` (`wert` = `elfenbein`, `flieder`, `klar`; ohne Wert eine Auswahl), ohne Hinweis.
- Beim Wählen und einmal beim Start (nur wenn `eba-core` an ist) schaltet `schemaSichern()` `eba-core` und
  `eba-paper-elfenbein`, `eba-flieder` und `eba-klar` ein und die früheren Designs aus. Sonst sähe ein Tresor, in dem eines davon gewählt war, nach dem
  Update ungestaltet aus (das Update verschiebt ihre Dateien in die Sicherung).
- Schrift auf einer Akzentfläche nimmt `var(--text-on-accent, #fff)`, nie die Kartenfarbe: dunkel wäre sie zu schwach.
- Für die Einrichtung und Tests: `ctx.darstellung = { MODI, DESIGNS, modusAus, modus, dunkelFuer, setzen, segmente, schalter, design,
  designZeilen, designSetzen, anwenden, schemaSichern }`; rein und getestet sind `modusAus()`, `dunkelFuer()`, `segmente()` und
  `designZeilen()`, `setzen()`, `designSetzen()` und `anwenden()` mit
  Ersatz für Gerätespeicher und `body` (`tests/darstellung.test.js`). `schalter(el)` zeichnet den Umschalter.

## Personalisieren

Das Formular (Aktion und Befehl `personalisieren`, Knopf „Ändern“ in den Einstellungen) hat Name, Studienbeginn als
Semester-Auswahl (mit Vorschau „1. Fachsemester … · heute n. FS“ und Hinweis bei Beginn im Sommersemester), Variante und
Zielnote (1,0–4,0, Komma oder Punkt, gespeichert als „2,3“). Speichern schreibt nach `System/Einstellungen.md`; leere Felder
werden leer (`name:`), nicht `""`. Danach zieht `abgleichen()` die Semesterliste nach. Semester-Auswahl, Vorschau und
Zielnoten-Prüfung nutzt auch die Einrichtung (`ctx.personalisieren.semesterOptionen`, `vorschauTeile`, `zielnotePruefen`).

Codeblock `eba-personalisieren` (früher die Karte oben auf dem Dashboard) zeichnet seit 0.3.0 nichts mehr; er bleibt, damit
selbst geänderte ältere Dashboards keine Lücke zeigen.

Codeblock `eba-personalisieren angaben` (Einstellungen & Hilfe, „Deine Angaben“): Zeilen Name, Studienbeginn (Semester und
heutiges Fachsemester), Zielnote, je mit „Ändern“ (Formular, Cursor im Feld), und Einrichtung (offen: „Starten“, angefangen:
„Fortsetzen“, fertig: „Erneut starten“ und die übersprungenen Schritte). `eba-personalisieren variante`: je Variante eine Zeile
mit dem, was daraus folgt (`FOLGE`), die gewählte mit Haken und ohne Knopf, die übrigen mit „Wählen“ (Aktion `variante`). Beim
Neuzeichnen der Leseansicht (`rerender`) liefert `getSectionInfo` oft nichts, `blockArgument()` gibt dann die Vorgabe zurück;
bis 16.10.2026 blieb die Karte deshalb unsichtbar. Seitdem gilt wie in `todos.js` ein Rückfall über den Text im Block
(„Variante: …“ → `variante`, „Deine Angaben: …“ → `angaben`), und beide nehmen die Klasse `eba-perso-aus` wieder ab. Für
Tests: `ctx.personalisieren.angabenZeilen(fm, zustand)`, `varianteZeilen(fm)`.

## Übersichtsseiten nur in der Leseansicht

Seit 17.10.2026 (`start.js`, Punkt 2): Notizen mit `typ` `dashboard`, `übersicht`, `einstellungen` oder `daten` bleiben in der
Leseansicht (auch `Studium/Termine & Anmeldungen.md`, seit die Anmeldungen sich selbst füllen). Das Feld `ansicht` geht vor (`lesen`
sperrt jede Notiz, `bearbeiten` gibt sie frei; in der Seitenleiste „Eigenschaften“ auch bei gesperrter Notiz änderbar). Der Knopf
zum Bearbeiten im Kopf der Ansicht (`view.modeButtonEl`) ist dort ausgeblendet; wer umschaltet (Strg/⌘ E, Befehl), landet mit
Hinweis wieder in der Leseansicht. Kam ein Tab aus der Bearbeitung einer anderen Notiz, geht er beim Weiterklicken auf eine
freie Notiz zurück in die Bearbeitung. Regel: `ctx.leseansicht.nurLesen(datei)` (`tests/leseansicht.test.js`).

Stil aller neuen Teile: `eba-core.css` Abschnitte 43 (Personalisieren, Schloss, Verbindungen, Fenster, Semestertermine),
44 (Musterpläne) und 45 (Einrichtung), nur mit `--eba-*`-Farbtokens (hell und dunkel).

## Dashboard (Regeln seit 18.10.2026)

- **Kacheln:** Die erste ist immer „Nächste Frist“ (Klassen `akzent frist`: breiter, getönt, Titel groß; eba-core.css
  Abschnitt 60), danach Nächste Prüfung, Semester, ECTS, Notenschnitt. Formeln `tf` bis `ftext`: Termin-Notizen mit
  `kategorie: Frist` (Rückverweise auf Prüfungen, nicht erledigt), die noch laufen oder kommen, sortiert nach dem nächsten
  Stichtag (läuft schon: `bis`, sonst `datum`); Unterzeile „läuft · bis 25.10.“ bzw. „19.10. · morgen“, dazu „geschätzt“.
  Prüfungen zeigt die Kachel daneben, darum hier nur Fristen. Breit eine Reihe; bis 980 px die Frist über die ganze Breite
  und die vier darunter (zu fünft wären sie auf dem iPad hochkant nur 123 px breit), bis 760 px 2 × 2. Vom 15. bis
  18.10.2026 fehlte die Kachel („Keine Dopplungen“). Tests: `tests/dashboard.test.js`.
- **Termine · 14 Tage:** alle Kategorien außer Frist, Prüfung, Fachschaft und Veranstaltung für 14 Tage, dazu Fachschaft und
  Veranstaltung von heute und morgen (zweiter `or`-Zweig; ohne ihn fehlte die Semestereröffnung am selben Abend), sortiert
  nach Tag und Uhrzeit (`formula.uhr` vom Anfang von `ort`), höchstens 8.
- **Bitte prüfen** (`bitte-pruefen.js`, Codeblock `eba-bitte-pruefen`, erster Block unter „Zu erledigen“, ohne Karte im
  Markdown): nur im eigenen Uni-Abgleich (`eba.eigenerAbgleich`) und nur, wenn `System/Abgleich/Protokoll.md` einen Abschnitt
  „Bitte prüfen“ (Überschrift beliebiger Ebene) mit Listenpunkten hat. Dann zeichnet der Block selbst eine Karte im Aufbau
  eines Callouts (`eba-pruefen`, eingeklappt; der Zustand gilt je Gerät und bleibt beim Neuzeichnen): Titel „Bitte prüfen ·
  n offen“, Knopf „Protokoll“ und „Jetzt abgleichen“ nur, wenn der eigene Abgleich die Aktion `abgleich` anmeldet (dieses
  Skript startet keinen Abgleich). Darunter je Punkt eine Zeile wie bei den To-dos: Das Kästchen schreibt `[x]` bzw. `[ ]`
  genau in diese Zeile des Protokolls (Text vorher geprüft), „**Titel** · Rest“ wird Titel und Metazeile, Unterpunkte stehen
  gedämpft darunter, Links gehen vom Protokoll aus, fehlende Notizen werden nicht angelegt. Sonst bleibt der Block leer
  (`.eba-bp-aus`) und samt Hülle auf Höhe 0 gefaltet (Abschnitt 59, Regel „Einen leeren Block samt Hülle ausblenden“):
  Normale Nutzer:innen sehen nichts, auch keine leere Karte. Geprüft in Obsidian (18.10.2026): Lese- und Bearbeitungsansicht,
  iPad- und iPhone-Breite, mit und ohne eigenen Abgleich; Obsidians gemessene Abschnittshöhen stimmen, „Im Eingang“ darunter
  erscheint. Tests: `tests/bitte-pruefen.test.js`.

## Bereiche (seit 15.10.2026: 9 statt 13)

Das Bereiche-Menü (`menue.js`, `ZIELE`, einzige Quelle) zeigt neun Kacheln (seit 17.10.2026 mit Karteikarten, ohne Schwerpunkt-Planer): Dashboard,
Studienverlauf, Termine & Anmeldungen, Prüfungen, Noten & ECTS, Unterlagen, Karteikarten, Kontakte & Links, Einstellungen & Hilfe. Die Icons hängen
an `li:has(> a[data-href$="…"])` (eba-core.css Abschnitt 6). Stundenplan bleibt eine Seite ohne Kachel (Dashboard).
Das Symbol, das die Tafel öffnet, steht je Gerät genau einmal: am PC im Seitenkopf (Pfad bzw. Gruß-Zeile des Dashboards),
auf iPhone und iPad nur in Obsidians Kopfleiste jeder Notiz.

| Seite | Enthält (früher eigene Seite) |
|---|---|
| `Studium/Termine & Anmeldungen.md` | Kalender, Agenda, Angebote der Uni; Abschnitte „Anmeldungen“ (`eba-anmeldungen`, aus den zentralen Fristen, seit 17.10.2026; vorher eine Tabelle mit Spalte „Stand“ zum Eintragen) und „Übungen und Tutorien“ (`eba-gruppen`, darunter eine Karte „Hinweise je Modul“). cssclasses `eba-s-termine` + `eba-s-anmeldungen`, Stil `eba-core.css` Abschnitte 37 und 57 |
| `Studium/Prüfungen.md` | Zeitleiste, Prüfungstermine (eintägige Prüfungen; Phasen zeigt die Zeitleiste als Band); Karte „Regeln“ |
| `Studium/Noten & ECTS.md`, `Studium/Studienverlauf.md` | je eine Karte „Regeln“ (Prüfungsordnung) |
| `Studium/Unterlagen.md` | Abschnitt „Übungsblätter“ oben (Übungsblätter) |
| `Studium/Kontakte & Links.md` | Abschnitt „Offizielle Dokumente“ (Quellen) |
| `Studium/Einstellungen & Hilfe.md` | Eine Gestalt für die ganze Seite (seit 17.10.2026): jeder Abschnitt ist eine Zeilenliste wie die Verbindungen (Rahmen, Zeilen mit Haarlinie, rundes Symbol, Titel, gedämpfte Zeile, rechts ein Knopf oder der Klapp-Pfeil). Deine Angaben (Name, Studienbeginn, Zielnote, Einrichtung), Verbindungen, Variante (je Variante eine Zeile mit Pflichtmodulen und „Wählen“); Abschnitt „Hilfe“ als `> [!eba-zeilen]` mit je Thema einer klappbaren Karte `> > [!eba-karte\|hilfe\|<thema>]- Titel <span class="eba-zeile-unter">…</span>` (Symbol je Thema in eba-core.css Abschnitt 5), zuletzt „Stand der Angaben“ (offene Punkte). Bis dahin Kasten, Chips mit Tabelle und einzelne Karten |

- **Regeln:** Die Prüfungsordnung steht nach Thema in Karten `> [!eba-karte|regeln]- Regeln` unter `## Regeln` (Links
  `[[Prüfungen#Regeln]]` usw.). An-/Abmeldung, Rücktritt, Wiederholung, Bestehen, Einsicht → Prüfungen; Gesamtnote,
  Notenstufen und Schnitte, Zusatzleistungen → Noten & ECTS; Aufbau (ECTS je Variante), Orientierungsprüfung, Fristen,
  Bachelorarbeit, Ausland, IBA/IEco, Containermodule → Studienverlauf. Stil: eba-core.css 37.regeln.
- **Schwerpunkte (seit 17.10.2026, vorher Seite `Studium/Schwerpunkt-Planer.md`):** Abschnitt `## Schwerpunkte` im Studienverlauf
  unter dem Musterstudienplan, Codeblock `eba-schwerpunkte` (`schwerpunkte.js`). Balken nur für Bereiche mit ECTS, Prüfliste
  (genau 3 Bereiche, je 15–30 ECTS, Summe 75 bzw. 63, VWL/BWL-Seite je Variante; Regel wie die Formel `block` auf Noten & ECTS),
  zugeklappt die Module je Bereich aus dem Feld `bereiche` der Modulnotizen. Sichtbar ab dem 2. Fachsemester oder sobald ein
  Schwerpunkt- oder Profilmodul im Plan ist, sonst samt Überschrift ausgeblendet (`.eba-sp-aus`, eba-core.css Abschnitt 56).
  Die Katalog-Tabellen entfallen: Bereich und „+ Planen“ stehen in jeder Modulnotiz („Anrechnung in“, bei Profil & Vertiefung
  „Zählt als“). Links auf den Abschnitt: `[[Studienverlauf#Schwerpunkte]]`.
- **Einstellungen:** Die Daten bleiben in `System/Einstellungen.md` (Frontmatter; alle Skripte und Bases-Formeln lesen
  diesen Pfad). Die Datei zeigt nur noch einen Hinweis. Sichtbar ist `Studium/Einstellungen & Hilfe.md`: ihre Bases filtern
  `file.path == "System/Einstellungen.md"`, die Knöpfe (`variante`, `personalisieren`) schreiben dorthin.
- **Rückverweise der Bases:** Termin-Notizen tragen `uebersicht: "[[Prüfungen]]"` (Kennzahl und Fristen-Liste auf dem
  Dashboard lesen `file("Studium/Prüfungen.md").backlinks`), Übungsblätter `uebersicht: "[[Unterlagen]]"` (Kennzahl „Übungsblätter“
  auf Unterlagen filtert die Rückverweise nach `typ`). `notizen.js` schreibt diese Felder.

## Karteikarten (seit 17.10.2026, `karten.js`, `fsrs.js`)

Ein eigener Lernmodus statt eines fremden Plugins (eine Installation, Design „Ruhig“, alle Geräte). Verhalten wie Anki, Planung
mit FSRS-6. Von Anki (AGPL) ist kein Code übernommen; Formeln und Standardparameter folgen ts-fsrs (MIT, `THIRD_PARTY_NOTICES.md`).

**Kartennotizen:** Markdown unter `Karteikarten/` (beliebig tief). Stapel = Modul: `code` im Frontmatter, sonst der Code am Anfang
des Datei- oder Ordnernamens; ohne Code ist jede Notiz ein eigener Stapel. Mehrere Notizen je Modul sind Unterstapel (in der
Übersicht aufklappbar, einzeln lernbar). Dateiname nie gleich dem einer anderen Notiz, sonst wären Links wie `[[S100 …]]`
mehrdeutig: der Stapel eines Moduls heißt „S100 Karteikarten“, weitere „S100 Kapitel 2“, ein schon vergebener Name bekommt
„ (Karteikarten)“ (`stapelName`). Ältere Stapel mit dem Namen einer anderen Notiz benennt `namenPruefen` einmal beim Start um
(Modulname → „<Code> Karteikarten“, sonst Zusatz; `stapelUmbenennung`), nur auf dem Abrufer (`ctx.zentral.abruferHier`), mit
`fileManager.renameFile`; Lernstände hängen an der Kennung und bleiben. `parsen(text, pfad)` liest Blöcke, die durch Leerzeilen
getrennt sind:

| Form | Karten (Schlüssel) |
|---|---|
| `Frage :: Antwort` | eine (`<id>`); mehrere solche Zeilen direkt untereinander, auch als Liste, sind je eine Karte |
| `Frage ::: Antwort` | zwei (`<id>`, rückwärts `<id>-r`) |
| Frage, Zeile `?`, Antwort (`??` mit Rückseite) | über mehrere Zeilen, eine bzw. zwei |
| `… {{c1::Text::Hinweis}} …` | Lückentext, je Nummer eine (`<id>-c1`, `<id>-c2` …) |

Nicht gelesen werden Frontmatter, Code, `%% %%`, `<!-- -->`, Blöcke, die mit `>`, `|` oder `<` beginnen, und Trennlinien.
Überschriften setzen das Kapitel (Anzeige im Lernfenster). Trenner in Lücken, Inline-Code und `$…$` zählen nicht (`trenner`).

**Kennung:** Block-ID am Ende des Blocks (` ^k1a2b3c`; Obsidian blendet sie in der Leseansicht aus). Karten derselben Notiz sind
Geschwister (`nid`). Ohne ID gilt ein vorläufiger Schlüssel (`?` + Hash von Pfad und Text, zählt als neu). `kennungenSetzen` schreibt
fehlende IDs beim Start einer Lernrunde und ersetzt IDs, die in der Notiz doppelt sind oder schon einer anderen Notiz gehören (die
erste nach Pfad behält sie). Sonst schreibt `karten.js` in Kartennotizen nur bei **Neue Karte** (Block ans Ende, `karteText`) und
**Bearbeiten** im Lernfenster (`blockErsetzen`, nur wenn der Block noch unverändert ist).

**Lernstände:** `System/Daten/Karteikarten/<Gerät>.jsonl` (Geräte-ID `eba-geraet` wie `zentral.js`). Erste Zeile `{ v: 1, geraet }`,
dann je Ereignis eine Zeile: Bewertung `{ k, t, b: 1–4, d }` (Antwortzeit in ms, höchstens 60 s) oder Aktion `{ k, t, a }` mit `aus`
(aussetzen), `an` (fortsetzen), `neu` (zurücksetzen), `zur` (bis morgen zurückstellen). Jedes Gerät hängt nur an seine eigene Datei
an (`vault.append`); Rückgängig nimmt die letzte eigene Zeile wieder heraus. Die eigene Datei wird einmal gelesen und dann im
Speicher geführt, Dateien anderer Geräte bei jeder Änderung neu. Kaputte Zeilen fallen weg (`zeileLesen`), doppelte Ereignisse
zählen einmal. `nachspielen` rechnet aus allen Ereignissen (nach Zeit) den Stand jeder Karte und das Protokoll für Tageslimits und
Statistik. Darum gibt es keine Sync-Konflikte, eine geänderte Behaltensquote gilt sofort für alle Karten, und die Geschichte reicht
später, um die Parameter zu optimieren. Nie im Release (`release.py`, `pruefen.py`, `.gitignore`); das Update fasst den Ordner nicht an.

**Planung (`fsrs.js`, Helfer):** FSRS-6 mit den 21 Standardparametern; ein Lerntag beginnt um `karten_tagesbeginn` (4 Uhr). Zustände
Neu, Lernen, Wiederholen, Neu-Lernen. Lernschritte (`1m 10m`) und Schritte nach einem Fehler (`10m`) wie in Anki: Nochmal → erster
Schritt, Schwer → Mitte der ersten beiden Schritte (sonst derselbe Schritt noch einmal), Gut → nächster Schritt oder Abschluss,
Einfach → Abschluss. Am selben Tag gilt die kurzfristige Stabilität, sonst die langfristige. Intervalle Schwer < Gut < Einfach,
Streuung wie Anki ab 2,5 Tagen, aber reproduzierbar (Zufall aus Kartenschlüssel und Zahl der Wiederholungen), damit jedes Gerät
denselben Stand rechnet. `vorschau` liefert alle vier Folgezustände für die Beschriftung der Knöpfe.

**Tagesplan und Lernrunde:** `tagesplan` zählt je Modul: neue Karten bis `karten_neu_pro_tag` (20, dazu „Heute mehr neue Karten“,
gerätelokal `eba-karten-extra`), Wiederholungen bis `karten_wdh_pro_tag` (200), Lernschritte ohne Grenze. Fälliges nach Fälligkeit,
dann zufällig je Tag; neue Karten in der Reihenfolge der Notiz oder zufällig (`karten_neu_reihenfolge`). Geschwister
(`karten_geschwister`): höchstens eine Karte je Notiz am Tag. Ausgesetzte und zurückgestellte Karten fehlen. `naechsteKarte`:
fällige Lernschritte zuerst, sonst neue und fällige gleichmäßig gemischt, sonst Lernschritte bis 20 Min. im Voraus. Schwierige Karten
(`karten_schwierig_ab`, beim 8. Fehler, dann bei jedem weiteren halben Schwellenwert) werden markiert und ausgesetzt
(`karten_schwierig_aussetzen`).

**Oberfläche:** Seite `Studium/Karteikarten.md` mit den Codeblöcken `eba-karten` (Übersicht: Kopfzeile „11 fällig · 12 neu ·
etwa 5 Min.“ mit **Alles lernen**, Dauer aus der eigenen mittleren Antwortzeit; Tabelle „Heute dran“ nach Fälligkeit, Stapel ohne
fällige Karten eingeklappt; Suche ab 6 Stapeln; Zeile je Modul mit Neu · Lernen · Fällig und Kartenzahl, antippen = lernen, ⋯ = Menü
mit „Karten anzeigen“, das die Liste filtert und hinscrollt), den Knöpfen, `eba-karten statistik` (vier Kacheln, Prognose für 30
Tage, Bestand) und `eba-karten liste` (Suche, Stapel, Status mit Anzahl, Sortierung nach Notiz/Fälligkeit/Fehlern; nach Stapel
gruppiert, Status als Pille, 50 je Schritt und „Alle anzeigen“, Menü je Karte). In jeder Kartennotiz steht `eba-karten stapel` (Gerüst
`System/Gerüste/Karteikarten.md`), auf dem Dashboard `eba-karten heute` (nur sichtbar, wenn etwas fällig ist; sonst `.eba-lk-aus`).
`artVon` liest das Argument, sonst Ort und Ersatztext des Blocks. In der Leseansicht einer Kartennotiz zeichnet ein Post-Processor
jede Karte als Zeile (`kartenZeilen`): Abschnitt per `getSectionInfo`, Karten daraus mit `parsen` (`abschnittKarten`; ein
Abschnitt mit anderem Text bleibt, wie Obsidian ihn zeichnet, der Rest einer Karte, die Obsidian in zwei Abschnitte teilt, wird
leer), Vorder- und Rückseite per `MarkdownRenderer`. Die Rückseite (bei Lücken die Lösung statt „[…]“, `zeilenSeiten`) erscheint
erst beim Antippen; **Antworten zeigen** im Stapel-Block setzt `.eba-lk-k-alle` an der Ansicht. Ohne Abschnitt (Lernfenster)
bleibt der Rückfall: Trenner als Pfeil, Lücken markiert. Das Lernfenster (Modal, auf dem iPhone ganzer Bildschirm) zeichnet die Karte mit `MarkdownRenderer` (Formeln,
Bilder, Links), darunter ein Fortschrittsbalken der Runde; Tasten Leertaste/Enter, 1–4, Strg/⌘+Z, E, `-`, `@`. Neu gezeichnet wird bei Änderungen in `Karteikarten/`, an
Lernständen anderer Geräte und an den Einstellungen, außerdem alle 5 Minuten (Lernschritte, Tageswechsel; die Kartenliste nicht).
Beim Start wird nichts geschrieben außer der einmaligen Umbenennung oben. CSS: Abschnitt 52 in `eba-core.css`.

## Modulseite (seit 17.10.2026, `modul.js`)

Jede Modulnotiz (und das Gerüst `System/Gerüste/Modul.md`) hat den Aufbau Kopf (HTML: Pfad, Kürzel als eigene Zeile
`<span class="eba-code">` im `<h1>`, englischer Titel als `eba-untertitel`, Eckdaten) → Codeblock ```` ```eba-modul```` →
`## Unterlagen` (Codeblock ```` ```eba-unterlagen````) → `## Meine Notizen` → `## Steckbrief` (Lehrveranstaltung, Prüfung, Ergänzungen wie Rolle je Variante,
Anrechenbar in, Hinweise) → Fußzeile. Die Tabelle „Mein Stand“ und die Knopfreihen gibt es nicht mehr; Modulnotizen, deren
Text du selbst geändert hast, behalten sie (das Update ersetzt nur unveränderten Text, siehe „Update“), ihr Stil bleibt in
`eba-core.css` 37.modul und 58.2.

Das **Modulfeld** (`eba-modul`) zeichnet aus dem metadataCache und `ctx.modell`, schreibt nur auf Tipp und nur ins
Frontmatter dieser Modulnotiz:
- *Stand:* Status als Knopf; das Menü setzt `status` (offen · läuft · angemeldet · bestanden · nicht bestanden · anerkannt),
  fragt nach „bestanden“ und „nicht bestanden“ die Note ab (`ergebnis`, Fenster mit Prüfung 1,0–4,0 bzw. 5,0; nicht bei
  `benotet: false`), dazu Versuch (`versuch`) und eigene Planung (`semester_geplant`, „Wie im Musterplan“ leert das Feld).
  Semester über `ctx.modell.modulSemester`, im laufenden Semester mit `ctx.modell.woche().text`. Prüfung nach der Regel
  „Nächste Prüfung“ (unten), Countdown erst ab 30 Tagen; ohne Prüfung (`benotet: false`, `pruefung` „keine“/„unbenotet“) und
  ohne Termin kein Feld. Profil & Vertiefung und Schwerpunkt: „+ Planen“/„✓ Im Plan“ (Aktion `plan`) und „Zählt als“ bzw.
  „Anrechnung in“ (`anrechnung`, Auswahl aus `bereiche` und Elective Studies).
- *Semesterband:* eine Zelle je Kalenderwoche aus `ctx.modell.vorlesungswochen` (Pausenwoche schraffiert), vorbei getönt, diese
  Woche Akzent, Punkt je Woche mit Vorlesungsnotiz (voll = alle nachgearbeitet, Tipp öffnet die Notiz), Markierung in der Woche
  der Prüfung; liegt sie nach der Vorlesungszeit, eine eigene Zelle am Ende. Nur im laufenden Semester des Moduls oder wenn es
  darin schon Notizen gibt.
- *Als Nächstes:* höchstens drei Einträge, nach Tag und Uhrzeit: die nächste Sitzung jeder Stundenplan-Serie mit diesem Kürzel
  (`wochentag`, `von`/`bis`, `ausfall`, `aenderungen`, Pausen, `entfaellt`, `einzeltermin`; heute nur, solange sie nicht vorbei
  ist) und Termin-Notizen mit diesem Kürzel, die nicht erledigt sind (Zeitraum mit `bis` als „19.–25.10.“, läuft er schon
  „bis So 25.10.“). Kürzel im Titel entfällt.
- *Knöpfe:* Neue Vorlesung (im laufenden Semester hervorgehoben), Neues Übungsblatt, Karteikarten lernen (nur mit Stapel),
  Unterlagen einordnen, Suchen.

Neu gezeichnet wird bei Änderungen an Modul-, Stundenplan-, Termin-, Vorlesungs- und Kartennotizen, an den Einstellungen und
`System/Daten/`, beim Zurückkommen in die App und alle 10 Minuten. Reine Logik (`sitzung`, `naechstes`, `pruefungVon`, `band`,
`noteOk`, `statusArt`, `titelOhne`, `spanne`) in `tests/modul.test.js`. Die Tabelle „Meine Notizen“ zeichnet
`tabellen.js` auf Modulseiten auf allen Geräten als Liste (`--eba-tliste: 1`); Kontrollkästchen dort nur bei Notizen, die das
Feld haben, „offiziell“ ohne Chip. CSS: `eba-core.css` Abschnitt 58.

Die **Unterlagen** (`unterlagenliste.js`, Codeblock `eba-unterlagen`, seit 18.10.2026; vorher eine Tabelle mit
Werkzeugleiste, Spaltenköpfen und Spalte Art) zeigen alle Notizen mit `typ: unterlage` und dem Kürzel des Moduls (ein Kürzel
im Codeblock geht vor), auf allen Geräten gleich:
- *Abschnitte* je Art in fester Reihenfolge, Name in der Mehrzahl: Folien, Skripte, Mitschriften, Übungen, Altklausuren,
  Lösungen, Eigene Lösungen, Literatur, Scans, Sonstiges; unbekannte Arten mit eigenem Namen vor Sonstiges.
- *Lösungen bei ihrer Aufgabe:* Eine Lösung (auch eine eigene) steht in der Zeile ihrer Übung oder Altklausur, wenn genau
  eine Übung dieselbe `nummer` hat oder die Wörter ihres Titels ohne „Lösung“, „Kurzlösung“, „Musterlösung“, „Korrektur“ …
  im Titel der Aufgabe vorkommen (bei mehreren die mit den wenigsten übrigen Wörtern, bei Gleichstand keine). Sonst bleibt
  sie im Abschnitt Lösungen. Die Spalte Lösung steht in jeder Zeile des Abschnitts, fehlende Lösungen fallen so auf.
- *Reihenfolge:* nach `nummer` (eigene Spalte, ohne Nummer zuletzt), Altklausuren nach dem Semester im Titel, neueste zuerst.
- *Zeile:* Titel (Tipp öffnet die Notiz), ✓ bei `status` gelesen oder bearbeitet („neu“ steht nicht da), Lösung, Seiten,
  ↗ öffnet die Datei außerhalb von Obsidian (Aktion `oeffnen`, nur mit `datei`).

Ab 860 px Breite zwei Spalten, ein Abschnitt bricht nie um; unter 480 px ohne Seiten. Neu gezeichnet wird bei Änderungen an
Unterlagen- und Modulnotizen und beim Umbenennen. „Noch nicht gelesen“ und Dateien ohne Begleitnotiz zeigt die Seite
Unterlagen. Reine Logik (`artVon`, `woerter`, `semesterRang`, `gliedern`) in `tests/unterlagenliste.test.js`. CSS:
`eba-core.css` Abschnitt 58.8.

## Keine Dopplungen (seit 15.10.2026)

Jede Angabe steht an einer Stelle; andere Seiten verlinken dorthin. Semestertermine nur in der Lupe des Studienverlaufs
(seit 17.10.2026 ohne eigene Tabelle; Einstellungen & Hilfe verlinkt `[[Studienverlauf]]`), Wochenplan nur auf Stundenplan, nächste Frist als erste Kachel des
Dashboards und erste Zeile der Liste „Fristen · 30 Tage“ (bewusst beides, siehe „Dashboard“), nächste Prüfung und Notenschnitt nur als Dashboard-Kacheln (eba-verlauf zeigt ECTS und
Orientierungsprüfung), andere Musterplan-Varianten nur auf `System/Daten/Musterplan` (Codeblock-Argument `andere` bleibt
nutzbar). Die Variante wählst du „vor dem 3. Fachsemester“ (ab dann unterscheiden sich die Musterpläne; die PO legt keinen
Zeitpunkt fest), überall in diesem Wortlaut.

**Nächste Prüfung, eine Regel:** Quellen sind Termin-Notizen mit `kategorie: Prüfung` (eintägig, also ohne `bis`; ohne
„Nachhol…“, ohne Zwischentests) und das Modulfeld `klausur`. Zwischentest heißt: Titel oder Dateiname enthält
„Zwischentest“, Groß- und Kleinschreibung egal (seit 17.10.2026; vorher zählten sie mit, und die Kachel „Nächste Prüfung“
zeigte einen Zwischentest). Ein Zwischentest ist nie die nächste Prüfung und verdeckt keine Klausur am selben Tag; wo er
erscheint, heißt er „Zwischentest“ (Pille `eba-pill info` in der Fristen-Liste des Dashboards, Formel `zt`, in der Agenda
von `termine.js` und im Kalender von `kalender.js`, dort mit Art `zwischentest`: Punkt in `--eba-info`, eigener
Legendeneintrag; im Studienverlauf ein Fähnchen „Zwischentest n“ ohne Countdown). Kürzel + Tag zählen nur einmal; die
Termin-Notiz gewinnt (Link, „geschätzt“), „bestanden“ und Ergebnis kommen vom Modul (seit 17.10.2026 auch in `klausurzeit.js` und `verlauf.js`,
die vorher das Modul vorzogen). So rechnen
`verlauf.js`, `klausurzeit.js`, die Dashboard-Formeln `pt`/`ptk`/`kl` und die Fristen-Liste (Zweig `typ == "modul"` nur,
wenn keine Prüfungs-Termin-Notiz mit gleichem Kürzel am selben Tag existiert; nur gleiches Kürzel reicht nicht, weil die
Zwischentests das Kürzel des Moduls tragen). Die Liste „Prüfungstermine“ auf Prüfungen blendet Phasen-Notizen
(`bis` gesetzt) aus. Seit 16.10.2026 auch für die Modulzeilen: „Termin folgt“ steht in der Zeitleiste (`klausurzeit.js`) nur,
wenn es weder `klausur` noch eine Prüfungs-Termin-Notiz mit diesem Kürzel in einer Prüfungsphase gibt; die Lupe im
Studienverlauf (`verlauf.js`, `klausurVon`) zeigt das Datum der Klausur aus der Termin-Notiz (ohne Zwischentests).

**Zwischentests auf Prüfungen (seit 17.10.2026):** Termin-Notizen, deren Titel „Zwischentest“ enthält (`klausurzeit.js`:
Titel, sonst Dateiname; Liste: Dateiname), sind freiwillige, unbenotete Tests und auf dieser Seite keine Prüfung. Die
Zeitleiste zeichnet sie als Punkt in `--eba-info` statt `--eba-bad`, mit eigenem Legendeneintrag „Zwischentest“ (nur wenn
einer zu sehen ist); im Tagesstreifen einer Phase heißt der Tag `zt` statt `pk`. Die Liste „Prüfungstermine“ zeigt in der
Spalte Stand die Marke „Zwischentest“ (`eba-pill info`). Für „Termin folgt“ zählen sie nie, auch nicht innerhalb einer Phase.
Die Dashboard-Kachel „Nächste Prüfung“ überspringt sie (Regel oben).

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
- Einen leeren Block samt Hülle ausblenden: in der Leseansicht den Abschnitt (`.el-*`) per CSS auf Höhe 0 falten, nie
  `display: none`. Obsidian misst einen unsichtbaren Abschnitt sonst so hoch wie alles darüber, und was darunter steht,
  bleibt leer. `tests/leseansicht.test.js` prüft die Snippets darauf. Eine Karte **in** einer Raster-Karte darf
  `display: none` haben, der Abschnitt selbst bleibt sichtbar: So fällt im Raster „Offene Fragen | To-dos“ des Dashboards
  eine leere Karte weg (`todos.js` setzt `is-leer` am Block, CSS 37.todos mit `:has()`), die andere nimmt die ganze Breite;
  sind beide leer, steht nur die To-do-Karte mit „Nichts offen.“. Geprüft in Obsidian (18.10.2026): Leseansicht und
  Bearbeitungsansicht, iPad- und iPhone-Breite, „Im Eingang“ darunter erscheint nach dem Scrollen.

## Tests

- **Ohne Obsidian** (`tests/`, `node --test tests/*.test.js`, keine Abhängigkeiten): reine Logik aus `zentral.js` (id-Regel,
  Dateinamen, Prüfung von Manifest, Terminen und Semesterdaten, Schnappschuss der öffentlichen Daten mit Prüfsummen) und
  `modell.js` (Semesterliste, Semesterregel, Vorlesungswochen, Wochenanzeige) sowie `update.js` (Dateiklassen, Liste, Plan je
  Datei, Mischen, alles oder nichts, Kanal; im veröffentlichten Repo zusätzlich die Update-Liste gegen die Dateien), die
  ILIAS-Skripte (siehe „ILIAS-Unterlagen“), `alma.js` (Wegfall eigener Notizen, Verbinden ohne Erfolg), `leer.js`
  (`istLeer`), `fsrs.js` und `karten.js` (siehe „Karteikarten“), `woche.js` (Wochenraster), `todos.js` (Auswahl,
  leere Blöcke) sowie `bitte-pruefen.js` (Protokoll lesen, abhaken) und `Dashboard.md` (Regeln der Kacheln und Listen).
  `tests/laden.js` lädt die Skripte mit einem kleinen Ersatz für Obsidian.
- **In Obsidian** (Entwickler-PC, nicht im Repo): Oberfläche, Knöpfe, Hot-Reload, Datenkanal mit Testquelle, Bases-Formeln.
  Die Testeinstiege unten machen das möglich.
- **GitHub Actions** (`.github/workflows/pruefen.yml`): `werkzeuge/pruefen.py` (Datenschutz-Scan, Dateitypen, `node --check`,
  iOS-Regeln), die Node-Tests und die Safari-16-Prüfung mit esbuild. Siehe `docs/tests.md`.

Testeinstiege: `plugin.testDatum = "2026-12-29"` setzt „heute“ für `ctx.date` (und damit Modell, Studienverlauf,
Vorlesungsnotiz, Agenda, Kalender, To-dos); `null` = echtes Datum. Bases-Formeln kennen kein Testdatum; Tests zeichnen
die Dashboard-Formeln darum in einer Testnotiz mit `date("…")` statt `today()`. Offene Fenster für Tests:
`ctx.personalisieren.fenster`, `ctx.verbindungen.fenster`, `ctx.einrichtung.fenster`, `ctx.karten.fenster` (Lernfenster),
`ctx.karten.neuFenster`.

Antworten auf Eingabefenster setzt du vorab in `plugin.testAntworten` (Liste; `null` = Esc). Den Alma-Abruf ersetzt
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

## Bekannte Grenzen

- `tabellen.js` (Bases als Liste) und die Messkorrektur in `start.js` greifen in Interna von Obsidian ein. Beide sind
  abschaltbar.
- Die Leseansicht-Sperre (`start.js`) blendet `view.modeButtonEl` aus, ein internes Feld. Fehlt es nach einem Obsidian-Update,
  bleibt nur der Knopf sichtbar; zurück in die Leseansicht geht es weiter.
- Für eigene Bases-Ansichten gibt es seit API 1.10 `plugin.registerBasesView(id, { name, icon, factory, options })`. Das ist ein
  möglicher Ersatz für `tabellen.js`, aber noch nicht umgesetzt.
- Beim Deaktivieren des Plugins meldet `onunload` je Skript alles ab, was über die Helfer angemeldet wurde, und ruft
  `abmelden()`. Die Messkorrektur (`start.js`) und die Bases-Liste (`tabellen.js`) nehmen ihre Prototyp-Änderungen dabei
  zurück.
- Ein Codeblock in einer Notiz, die in der Leseansicht offen ist, existiert zweimal (Leseansicht und versteckter Editor);
  `griff.neu()` zeichnet beide.
- `menue.js` liest noch den Schalter `window.ebaMenueKopfImmer` (Symbol in der Kopfleiste statt im Seitenkopf auch am PC,
  nur zum Ausprobieren).
- Datenkanal: Die Daten kommen von `studium-autopilot.github.io/ecoba-daten` (Organisation `studium-autopilot`). Ohne Netz
  oder bei einem Fehler bleibt der letzte Stand; die Übersicht „Verbindungen“ zeigt dann „Fehler beim letzten Abruf“.
- Datenkanal: Eine gelöschte zentrale Notiz kommt zurück, sobald sich ihr Termin in den Daten ändert (oder `abruf.json` fehlt).
