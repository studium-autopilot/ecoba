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
   abgemeldet. Der Hinweis „Aktualisiert: …“ kommt 3 s nach dem letzten Skript und nur, wenn es genau eines war; mehrere auf
   einmal (ein Update über den Sync) bleiben still, eine Minute lang auch Nachzügler (`hinweisSammeln`, `plugin.stillBis`).

Fehler einer Erweiterung oder Aktion stoppen nie den Rest. Sie erscheinen als kurzer Hinweis ohne Fehlertext (Notice) und mit
allen Einzelheiten in der Konsole.

**Warum `eval` und warum das sicher ist.** Obsidian lädt in einem Community-Plugin nur `main.js`; ein `require` von Dateien
im Tresor gibt es auf iPhone und iPad nicht. Ohne Build-Schritt bleibt nur, den Text der Skripte selbst auszuführen. So
lassen sich Skripte im Tresor lesen, ändern und per Hot-Reload testen. Neue Angriffsfläche entsteht dadurch nicht:

- Ausgeführt werden nur Dateien aus `System/Skripte/` im eigenen Tresor. Wer dort schreiben kann, kann auch `main.js`
  ändern; das Vertrauen gilt ohnehin dem Tresor („Dem Ersteller vertrauen und Erweiterungen aktivieren“).
- Was das Plugin von selbst lädt, sind nur Daten. Zentrale Daten werden geprüft und als reiner Text übernommen, nie
  ausgeführt (siehe „Zentrale Daten“). Kursdateien aus ILIAS werden nur abgelegt.
- Neuer Code kommt nur über **Neue Version installieren** und nur nach einem Tipp: Die Update-Liste ist über ihre SHA-256 im Manifest
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
| `ctx.system.prompt(frage, vorschlag)` | Eingabefenster für eine einzelne Angabe → Text oder `null` (Esc); zum Anlegen nie, dafür `ctx.formular` |
| `ctx.system.suggester(texte, werte, _, platzhalter)` | Auswahlliste → Wert oder `null` (Esc) |
| `ctx.formular({ titel, felder, knopf, pruefen })` | Fenster „Neu …“ (`formular.js`, seit 0.4.6): alle Felder einer Anlege-Aktion in einem Fenster → Werte oder `null` (Esc); siehe „Bedien-Bausteine“ |
| `ctx.date.now(format, tage)` | Datum mit moment, z. B. `ctx.date.now("YYYY-MM-DD", 7)` |
| `ctx.date.jetzt()` | `Date` für „jetzt“; statt `new Date()` verwenden, damit Tests ein Datum vorgeben können (`plugin.testDatum`) |
| `ctx.aktion(name, parameter)` | eine andere Aktion ausführen |
| `ctx.link(aktion, parameter)` | Knopf-Adresse bauen |
| `ctx.oeffnen(ziel, { neu, quelle, zeile, cursor, modus, von })` | DER Weg, eine Notiz zu öffnen (seit 0.4.6: Datei, Pfad oder Linktext; Übersichten lesen, eigene Notizen bearbeiten, im Tab, in dem getippt wurde); siehe „Bedien-Bausteine“ |
| `ctx.neuZeichnen(pfade?)` | offene Notizen neu zeichnen |
| `ctx.hinweis(text, { aktion, dauer })` | Hinweis (Notice), der eine Weg für alle Skripte (`hinweis.js`, seit 0.4.6): ein Satz ohne Vorsatz und Pfad, `aktion` = nächster Schritt als Knopf (`{ text, aktion, parameter }` oder `{ text, ausfuehren }`), `dauer: 0` für Fortschritt; gibt die Notice zurück. Regeln: `docs/design.md`, „Sprache“ |
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
    (`start.js` nimmt die Messkorrektur zurück, `tabellen.js` die Erweiterung der Bases-Tabelle).

Erweiterungen werden alphabetisch gestartet. Abhängigkeiten laufen über `ctx.user`, das dann schon vollständig ist.

| Skript | Aufgabe |
|---|---|
| `start.js` | Dashboard als Startseite (seit 0.4.6 nicht mehr angeheftet), Übersichtsseiten nur in der Leseansicht und deine Notizen von dort in der Bearbeitung (siehe unten), Seitenklasse aus `typ`, Kapitel der Folien vorfalten (alle Geräte, siehe unten), Messkorrektur |
| `aktionen.js` | Knopf-Aktionen (siehe Liste) |
| `notizen.js` | Notiz-Aktionen mit Ordner-Automatik |
| `kalender.js`, `termine.js`, `klausurzeit.js`, `verlauf.js`, `todos.js`, `vorlesung.js`, `gruppen.js`, `angebote.js` | Codeblöcke `eba-kalender`, `eba-agenda`, `eba-anmeldungen`, `eba-klausurzeit`, `eba-verlauf`, `eba-todos`, `eba-vorlesung` und `eba-uebungsblatt`, `eba-gruppen`, `eba-angebote` |
| `seitenleiste.js` | Seitenleiste „Übersicht“ (seit 19.10.2026, ersetzt das Raster-Menü aus `menue.js`): eigener Tab in Obsidians linker Seitenleiste mit allen Seiten (`ZIELE`) und den Modulen dieses Semesters; siehe „Öffnen und Navigieren“ |
| `tabellen.js`, `leer.js` | Bases-Tabellen als Liste zum Lesen (seit 0.4.6 überall und auf allen Geräten, `eba-core.css` 37.tabellen), leere Mitschriften und Übungsblätter beim Verlassen in den Papierkorb (nicht beim Wechsel zu Folien/PDF; ein Übungsblatt mit Abgabedatum, Aufgaben oder eigener Lösung bleibt, ebenso eine Vorlesungsnotiz mit Thema) |
| `eba.js`, `alma.js`, `unterlagen.js`, `meine-gruppe.js` | Helfer: Semester, Module, Datumseingabe, `ablegen()`; Alma-Stundenplan (seit 0.4.5 auch Erweiterung mit Zeitplan, siehe „Alma-Stundenplan“); Eingang einordnen; deine Übungsgruppe im Stundenplan |
| `modell.js` | Datenmodell und Fachmodell `ctx.modell` (siehe „Fachmodell“), Abgleich der abgeleiteten Felder in den Einstellungen, Codeblock `eba-semesterdaten` |
| `dashboard.js` | Kacheln und Listen aus dem Fachmodell: Codeblöcke `eba-kacheln` (Dashboard) und `eba-liste fristen\|termine\|pruefungen` (Dashboard, Prüfungen) |
| `verbindungen.js` | Verbindungen und Schloss: Codeblöcke `eba-schloss`, `eba-verbindungen`; Aktionen `verbinden`, `verbindung-aktualisieren`, `trennen` |
| `einrichtung.js` | Einrichtung beim ersten Start (seit 0.3.0, `ctx.einrichtung`): Fenster mit sieben Bildschirmen (seit 0.4.8, vorher acht), Zustand in den Einstellungen, Aktion `einrichtung`; siehe „Einrichtung“ |
| `darstellung.js` | Hell, dunkel oder automatisch (seit 17.10.2026) und Design (seit 18.10.2026, intern `elfenbein`, `flieder`, `klar`), je Gerät (`ctx.darstellung`): Umschalter und Design-Kacheln `eba-darstellung`, Aktionen `darstellung` und `design`; siehe „Darstellung“ |
| `personalisieren.js` | Formular (Aktion `personalisieren`, Parameter `feld` setzt den Cursor), Zeilen „Deine Angaben“ und „Variante“ (`eba-personalisieren angaben` bzw. `variante`, gleiche Zeilenliste wie die Verbindungen; Inhalt aus `angabenZeilen`/`varianteZeilen`); die Karte auf dem Dashboard entfällt seit 0.3.0 |
| `musterplan.js` | Musterstudienpläne als eigene Darstellung, Codeblock `eba-musterplan` |
| `zentral.js` | Datenkanal „Zentrale Daten“: Abruf, Prüfung, Übernahme als Termin-Notizen, Semesterdaten, Abrufer-Sperre (`ctx.zentral`), Aktionen `zentral-aktualisieren`, `zentral-schalter` |
| `update.js` | Update der Vorlage mit einem Knopf (seit 0.2.0, `ctx.update`): Zeile „Studium Autopilot“ in `eba-verbindungen`, Hinweis `eba-update-hinweis` auf dem Dashboard (seit 0.3.1), Aktionen `vorlage-aktualisieren`, `vorlage-neu-laden`; siehe „Update“ |
| `fsrs.js` | Helfer: FSRS-6 und Lernschritte wie in Anki (`ctx.user.fsrs(ctx).planer`), siehe „Karteikarten“ |
| `karten.js` | Karteikarten: Codeblock `eba-karten` (Übersicht, `stapel`, `statistik`, `liste`, `heute`), Lernfenster, Fenster „Neue Karte“ und „Optionen“, Lernstände je Gerät (`ctx.karten`); siehe „Karteikarten“ |
| `schwerpunkte.js` | Abschnitt „Schwerpunkte“ im Studienverlauf (seit 17.10.2026, vorher Seite „Schwerpunkt-Planer“): Codeblock `eba-schwerpunkte`, Regeln der PO für die Schwerpunktbereiche, `ctx.schwerpunkte` (`rechnen`, `sichtbar`); siehe „Bereiche“ |
| `lernplan.js` | Lernplan (seit 18.10.2026): Codeblock `eba-lernplan` (Bereich, Argument `modul` in der Lernplan-Notiz), Abhaken der Kapitel, `ctx.lernplan` (`kapitelLesen`, `planen`, `zielVon`, `stand`, `kapazitaet`, `sichtbar`); siehe „Lernplan“ |
| `bitte-pruefen.js` | „Bitte prüfen“ auf dem Dashboard (seit 18.10.2026): Protokoll des eigenen Uni-Abgleichs und (seit 0.4.5) die Punkte aller Quellen aus dem Meldekanal (Quellen-Vertrag); Codeblock `eba-bitte-pruefen`; siehe „Dashboard“ |
| `alma-konto.js`, `alma-konto-html.js` | Noten & Anmeldungen aus Alma (seit 0.4.5, Beta, `ctx.almaKonto`): Ablauf, Zustand, Zeile und Fenster bzw. reiner Leser der Seiten; siehe „Noten & Anmeldungen (Alma)“ |
| `sperre.js` | Helfer: Abrufer-Sperre, der gemeinsame Schreiber-Lock aller Quellen (`ctx.user.sperre.erzeugen`); siehe „Abrufer-Sperre“ |
| `hinweis.js` | `ctx.hinweis` (seit 0.4.6): Hinweise ohne Vorsatz und Pfad, nächster Schritt als Knopf; `tests/wortliste.test.js` findet jedes `new Notice` in den Skripten |
| `formular.js` | `ctx.formular` (seit 0.4.6): das Fenster „Neu …“ für alle Anlege-Aktionen; siehe „Bedien-Bausteine“ |
| `kopf.js` | Kopf-Karte unter dem Titel jeder Termin-, Stundenplan-, SQ- und Begleitnotiz mit genau einem Status-Knopf (seit 0.4.6), „⋯“ mit Eigenschaften, leere Abschnitte und Eckdaten ausblenden (seit 19.10.2026), Übungsblätter unter Übung und Tutorium (seit 20.10.2026); siehe „Bedien-Bausteine“ |
| `pdfkasten.js` | PDF-Kasten der Begleitnotizen als Knopf (seit 19.10.2026): klappt in Lese- und Bearbeitungsansicht ohne Cursor und Tastatur, lädt die PDF erst beim Aufklappen, „Öffnen“ und „Original“ in der Kopfzeile; siehe „Bedien-Bausteine“ |
| `papierkorb.js` | `ctx.papierkorb` (seit 0.4.6): wegwerfen mit Hinweis und „Rückgängig“; siehe „Bedien-Bausteine“ |
| `felder.js` | Helfer: Feld-Register der Eingaben (Variante, Studienbeginn, Note, Zielnote; `ctx.user.felder`); siehe „Personalisieren“ |
| `quellen.js` | Helfer: Quellen-Vertrag (`ctx.user.quellen`): Statusform, ein Zeitplan, Besitzmarke, Lebenslauf erzeugter Notizen, Meldekanal „Bitte prüfen“; siehe „Quellen-Vertrag“ |
| `volltext.js` | Volltext der PDFs (seit 0.4.5): Textfassungen unter `Unterlagen/_Volltext/` für die Suche, `ctx.volltext`; siehe „Volltext der PDFs“ |
| `ilias-kalender.js` | ILIAS-Kalender (seit 18.10.2026): Abgaben deiner Übungen aus dem Kalender-Abo als Fristen unter `Termine/`, `ctx.iliasKalender`; siehe „ILIAS-Kalender“ |
| `uni-login.js` | Helfer: Uni-Login (seit 0.4.8, `ctx.user["uni-login"](ctx)`): verbindet nach der Anmeldung ILIAS-Kalender und Alma-Stundenplan ohne kopierten Link, holt einen neuen Link, wenn der alte nicht mehr gilt; siehe „Uni-Login“ |

Beim Start schreibt das Plugin keine Datei. Die Agenda (`eba-agenda`) wird live gerendert, wie der Kalender. Einzige
Ausnahme seit 2b: Weichen die abgeleiteten Felder in `System/Einstellungen.md` vom berechneten Inhalt ab (siehe „Zentrale
Daten“), werden sie einmal nachgezogen. Im Normalfall sind sie gleich, dann wird nichts geschrieben. Der Datenkanal
(`zentral.js`) ruft frühestens 20 s nach dem Einlesen ab und schreibt nur nach einem erfolgreichen Abruf mit geänderten Daten
(siehe „Datenkanal“). `update.js` legt 20 s nach dem Einlesen einmal `System/Daten/installiert.json` an, wenn sie fehlt
(Erstinstallation, siehe „Update“); sonst schreibt es nur nach dem Tipp auf „Neue Version installieren“. `einrichtung.js` öffnet beim
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
| `vorlesung` | `code` | neue Vorlesungsnotiz: Fenster mit Modul (`code` wählt vor) und Thema; läuft gerade genau eine Lehrveranstaltung und ist kein Modul vorgewählt, ohne Fenster; heute schon angelegt → öffnen | Neue Vorlesungsnotiz |
| `uebungsblatt` | `code` | neues Übungsblatt (Kopf-Karte `eba-uebungsblatt` wie die Vorlesungsnotiz: Status zum Antippen, Abgabe, Perlen der Blätter des Moduls, Links zu Aufgaben, Musterlösung, eigener Lösung und Übung/Tutorium; Abschnitte Aufgabe, Knackpunkte, Fürs Tutorium) | Neues Übungsblatt |
| `termin` | `titel`, `wann`, `code` | neuer Termin | Neuer Termin |
| `lehrveranstaltung` | `code` | Lehrveranstaltung im Stundenplan von Hand | Neue Lehrveranstaltung |
| `sq-kurs` | – | SQ-Leistung | Neuer SQ-Kurs |
| `modul` | `code` | eigenes Modul aus `System/Gerüste/Modul.md` | Neues eigenes Modul |
| `oeffnen` | `notiz`, `original=1`, `datei` (Link relativ zur Notiz, vom PDF-Kasten) | Datei der Unterlage extern öffnen (PC: Standardprogramm, iOS: Dateien-App) | Unterlage öffnen |
| `plan` | `modul` (Code oder Name) | `gewaehlt` umschalten | – |
| `variante` | `wert` | `variante` in `System/Einstellungen.md` | Variante wählen (mit Auswahl) |
| `darstellung` | `wert` (`hell`, `dunkel`, `automatisch`) | Hell, dunkel oder automatisch wie das Gerät | Darstellung wählen (mit Auswahl) |
| `design` | `wert` (`elfenbein`, `flieder`, `klar`) | Design dieses Geräts (seit 18.10.2026; bis 17.10.2026 schaltete `design` die früheren Farbschemata um) | Design wählen (mit Auswahl) |
| `einordnen` | `code` | Eingang einordnen | Unterlagen einordnen |
| `stundenplan` | `link=neu` | Alma-Stundenplan aktualisieren, ohne Link verbinden | Stundenplan aktualisieren |
| `verbinden` | `id` (alma, ilias, zentral, vorlage) | Verbinden-Fenster bzw. Erklärung | Verbinden … (mit Auswahl) |
| `verbindung-aktualisieren` | `id`, `uebernehmen=1` (ILIAS) bzw. `hier=1` (Volltext): hier aktualisieren, obwohl ein anderes Gerät gerade aktualisiert | Verbindung jetzt abrufen | Aktualisieren … (mit Auswahl) |
| `trennen` | `id` | Link bzw. ILIAS-Zugang auf diesem Gerät löschen (mit Rückfrage) | Trennen … (mit Auswahl) |
| `ilias-holen` | – | Unterlagen aus ILIAS holen (Knopf auf Unterlagen); nicht verbunden: Fenster ILIAS-Unterlagen | Unterlagen aktualisieren |
| `personalisieren` | – | Formular Name, Studienbeginn, Variante, Zielnote | Deine Angaben ändern |
| `einrichtung` | `ab` (optional, `2` = ab Studienbeginn, vorausgefüllt) | Einrichtung öffnen (Knöpfe „Erneut starten“ und „Fortsetzen“ in der Zeile „Einrichtung“) | Einrichtung starten |
| `alma-link` | – | Alma-Link neu eingeben | Alma-Link ändern |
| `suchen` | `q` | Obsidian-Suche öffnen | – |
| `zeigen` | `notiz` | Notiz öffnen (Stundenplan-Raster in Bases) | – |
| `seitenlink` | – | `[[Folien.pdf#page=N\|S. N]]` einfügen (Editor) | Seitenlink auf die Folien einfügen |
| `zentral-aktualisieren` | – | Zentrale Daten jetzt abrufen (mit Hinweis zum Ergebnis) | Zentrale Daten aktualisieren |
| `zentral-schalter` | `was` (`daten` \| `veranstaltungen`), `wert` (`1`/`0`, optional) | Schalter in `System/Einstellungen.md` setzen (ohne `wert`: umlegen) | – |
| `besuche-nicht` | `id` (ohne: die geöffnete zentrale Stundenplan-Notiz) | id in `stundenplan_ausgeblendet` (Einstellungen); Hinweis mit „Rückgängig“ | Besuche ich nicht |
| `wieder-zeigen` | `id` | id aus `stundenplan_ausgeblendet` nehmen | – |
| `karten-lernen` | `stapel` (Pfad) oder `code`; ohne: die Kartennotiz, in der der Knopf steht, sonst alle | Lernfenster | Karteikarten lernen |
| `karte-neu` | `stapel` (Pfad, optional) | Fenster „Neue Karte“ | Neue Karte |
| `kartenstapel` | – | neuer Stapel aus `System/Gerüste/Karteikarten.md` (Modul wählen; auch Ordner-Automatik in `Karteikarten/`) | Neuer Kartenstapel |
| `karten-optionen` | – | Fenster „Lernoptionen“ (Felder `karten_*` in `System/Einstellungen.md`) | Lernoptionen |

Ein Knopf heißt wie sein Befehl (Wortliste, `docs/design.md`, „Sprache“; `tests/wortliste.test.js` prüft die Knöpfe in Seiten).
Zusätzlich gibt es den Befehl **„Neue Notiz aus Vorlage …“** (`studium-autopilot:neue-notiz`, Strg/Cmd+Umschalt+N). Er bietet
alle Aktionen mit `ordner` zur Auswahl an. Der Befehl **„Erweiterungen neu laden“** lädt alle Skripte neu.

Nur Aktionen, die bewusst eine Notiz anlegen, öffnen danach genau diese Notiz. Alle anderen lassen die aktive Notiz und die Tabs
unverändert.

**Ordner-Automatik:** Aktionen mit `ordner: ["Vorlesungen"]` befüllen eine neue, leere Notiz in diesem Ordner oder einem
Unterordner. Bei mehreren Treffern gilt der längste Ordner. Voraussetzung: Die Notiz wurde auf diesem Gerät angelegt und ist in
den ersten etwa 1,5 s die aktive Datei. Per Sync ankommende Dateien werden darum nie befüllt. Eine „Unbenannt“-Notiz wird
umbenannt und verschoben. Esc im Fenster „Neu …“ bricht das Anlegen ganz ab (`eba.abbrechen`), die leere Notiz wird
gelöscht (siehe „Bedien-Bausteine“).

**Alma-Stundenplan** (`alma.js`, seit 0.4.5 eine Quelle nach dem Quellen-Vertrag): `ctx.user.alma(c)` bietet

- `status()` → gemeinsame Form `{ zustand, geprueft, fehler, fehlerZeit, warnungen }` (`zustand`: extern, nicht-verbunden,
  laeuft, fehler, anderes-geraet, an), dazu `verbunden`, `stand` (= `geprueft`), `seit`, `anderes`, `laeuft`, `extern`
- `verbinden(link?, { nurBeiErfolg })`, `trennen()`, `aktualisieren({ still, automatisch, text })`,
  `aktualisierenOderVerbinden({ neuerLink })`, `linkPruefen(link)`, `fehler()`, `hinweise()`

Der Link liegt nur gerätelokal (`app.saveLocalStorage`). Scheitert der erste Abruf nach dem Eingeben (Fenster oder
Eingabefeld), gilt wieder der vorherige Link.

- **Zeitplan** (`Q.planen`, vorher nur Knopf): 30 s bis 2 Min. nach dem Einlesen, dann stündlich; nach einem Fehler nach 5, 15,
  30 Min.; zurück in der App nach über einer Stunde seit dem letzten Versuch. Nur mit Link auf diesem Gerät, nie mit
  `quelleExtern("stundenplan")`, nie ein Hinweis. Testeinstieg: `plugin.testStundenplanAus = true`.
- **Fristen** (seit 0.4.6): Die Anfrage an Alma höchstens 60 s, der Abruf bis die Daten da sind (Sperre, Anfrage, Lesen)
  höchstens 2 Min. (Zeitgeber über `ctx.zeit`; `requestUrl` lässt sich auf iPhone und iPad nicht abbrechen, eine späte Antwort
  wird verworfen). Danach endet der Lauf mit dem Fehler „Alma hat nicht rechtzeitig geantwortet. Neuer Versuch später.“, der
  Lauf ist frei, der Zeitplan versucht es wie nach jedem Fehler wieder. Geschrieben wird erst nach dem Abruf und nur im Tresor.
  Die Hülle eines eigenen Uni-Abgleichs (ohne `ctx.zeit`, Kalender als Text) läuft ohne Frist.
- **Status** gerätelokal (`eba-alma-status`; `eba-alma-stand` bleibt die Zeit des letzten Erfolgs): Ein Fehler (Link falsch,
  Alma antwortet nicht, kein Netz) bleibt mit Zeit stehen, bis ein Abruf klappt. Vorher stand er nur im Speicher, und die Zeile
  blieb grün „verbunden“ mit alter Zeit.
- **Ein Schreiber:** `sperre.js`, Quelle `alma` (`System/Daten/alma-abruf.json`, in `.gitignore`, `release.py`, `pruefen.py`).
  Der Zeitplan wartet, solange ein anderes Gerät mit Link schreibt (Zeile „anderes-geraet“); jeder Knopf übernimmt. `trennen`
  gibt die Sperre frei.
- **Besitz:** Alma-Notizen tragen `herkunft: alma` + `alma_schluessel` (Id-Feld; ältere Alma-Notizen erkennt der nächste Abruf am
  Kasten „Aus Alma“ und trägt die Marke nach). Von Hand angelegte Notizen, die Alma verknüpft (`quelle: alma`,
  `alma_schluessel`, `alma_titel`, `alma_raum`), bleiben deine (keine `herkunft`). Notizen mit fremder `herkunft` (zentral,
  ilias-gruppe, gruppe-gewaehlt, claude …) fasst Alma nie an.
- **Lebenslauf:** *Von dir gelöscht* → Grabstein `angewendet` (`alma_schluessel` → `kurzHash` aus Schlüssel, Zeitraum, Raum) in
  `alma-abruf.json`: Die Notiz kommt erst wieder, wenn sich der Termin in Alma ändert. *In Alma weg* (nur Semester, die Alma
  geliefert hat; Ende vor mehr als 30 Tagen bleibt unverändert): Alma-Notiz unberührt → Papierkorb (`.trash`), mit deinem Text
  unter `## Meine Notizen` (ältere: `## Notizen`) → „(entfällt)“ und `entfaellt: true` (kommt sie zurück, ist sie wieder normal); deine eigene Notiz → nie
  löschen, nie entkoppeln, sondern `alma_fehlt: <Datum>` und ein Punkt „**Stundenplan** · … steht nicht mehr in Alma“ in „Bitte
  prüfen“ (höchstens 14 Tage, nicht nach `bis`; synchronisiert, darum auf jedem Gerät). Fehlen auf einmal mehr als die Hälfte (und
  mehr als 2), bleibt alles stehen (Warnung). *Doppel* einer Alma-Notiz werden zusammengeführt (`Q.dubletten`).
- **Aus dem Uni-Abgleich übernommen** (Regeln der Hülle `stundenplan-sync.mjs`): nie löschen oder entkoppeln, was du angelegt
  hast (oben); bei der ersten Verknüpfung (noch kein `alma_raum`) gilt Almas Raum, wenn er mehr als in der Schreibweise abweicht
  (`raumNorm`: „Kupferbau HS 25“ = „Hörsaal 25 Kupferbau“), auch in der Kopfzeile unter der Überschrift; keine neue Notiz für
  Veranstaltungen, die schon vorbei sind.
- **Außerhalb des Plugins** (eine Hülle, die `aktualisieren({ text })` mit `window.app` aus Dateien und ohne `ctx.user.sperre`/
  `quellen` aufruft): dieselben Regeln, aber keine Sperre, keine Grabsteine, kein Meldekanal; geschrieben wird nur über
  `vault.create`, `vault.trash` und `fileManager.processFrontMatter` (die Kopfzeile ändert dort die Hülle).
- **Raum, Änderungen und Ausfälle je Termin** (seit 20.10.2026, `gruppieren(events, heute)`; vorher galt der häufigste Raum aller
  Termine, ein einzelner Termin in einem anderen Raum ging verloren, eine dauerhafte Verlegung ab Semestermitte behielt den alten
  Raum, solange er häufiger war, und ein auf eine andere Uhrzeit verschobener Termin wurde Ausfall plus eigene Notiz):
  - *Raum der Serie* (`raeumeLesen`): Läufe gleicher Räume nach Datum (`raumNorm`, Termine ohne Raum zählen nicht). Raum ist der
    des letzten Laufs mit mindestens zwei Terminen (wo die Serie ab jetzt bzw. am Ende stattfindet), ohne solchen der häufigste
    der kommenden Termine. Jeder Termin in einem anderen Raum als erwartet → `aenderungen` („Datum|Beginn|Ende|Raum“, Zeiten der
    Serie, bei einer c.t.-Notiz verschoben wie die Serie).
  - *Dauerhafte Verlegung* → `raum_seit` (erster Termin im neuen Raum) und `raum_vorher`: aus dem Kalender, wenn vor dem letzten
    Lauf ein anderer mit mindestens zwei Terminen liegt (einzelne Abweichungen dazwischen zählen nicht); sonst, wenn ein Abruf den
    Raum der Notiz mehr als in der Schreibweise ändert (Alma nennt für die ganze Serie einen neuen Raum, auch für vergangene
    Termine; oder die erste Verknüpfung bringt einen anderen), ab dem nächsten Termin mit dem bisherigen Raum der Notiz als altem.
    Eine frühere Angabe bleibt, solange `raum_vorher` vom Raum abweicht. `findetStatt` gibt vor `raum_seit` den alten Raum, die
    Woche zeigt die ersten zwei Wochen ab `raum_seit` „Neuer Raum“ (siehe „Wochenraster“, *Ausnahmen*).
  - *Verschobener Termin* (andere Uhrzeit, gleicher Tag): Ein einzelner Termin gleichen Titels und Semesters an einem Tag, an dem
    genau einer Serie ihr Termin fehlt (ihr Wochentag und Rhythmus, höchstens einen Schritt vor dem ersten bzw. nach dem letzten
    Termin), wird eine Änderung dieser Serie statt Ausfall plus eigener Notiz. Nicht eindeutig (zwei Serien fehlen) oder an einem
    anderen Tag: wie bisher.
  - *Abgesagt* (`STATUS:CANCELLED`, auch als Einzeltermin einer Serie über `RECURRENCE-ID`) → `ausfall` der Serie, auch am Anfang
    oder Ende (vorher fehlte der Termin und verkürzte `von`/`bis`). Eine ganz abgesagte Veranstaltung fehlt wie bisher.
  - *14-täglich*: Liegen alle Termine einer Serie (mindestens drei) zwei Wochen oder ein Vielfaches davon auseinander, steht
    `rhythmus: 14-täglich` in der Notiz und die Wochen dazwischen sind kein Ausfall (`findetStatt`: „anderer Tag“); sonst hätte die
    Woche jede zweite Woche „Fällt aus“ in Warnfarbe gezeigt.
  - Leere Felder (`aenderungen`, `rhythmus`, `raum_seit`, `raum_vorher`) stehen nicht in der Notiz und fallen beim Schreiben weg.
    Die Hülle `stundenplan-sync.mjs` braucht dafür nichts Neues (nur `processFrontMatter`, flache Felder und Listen von Texten).
    Trockenlauf gegen einen echten Alma-Kalender (20.10.2026): keine Änderung; mit dem Stand einer Notiz vor ihrer ersten
    Verknüpfung (anderer Raum) `raum_seit` und `raum_vorher` wie erwartet.
- Tests: `tests/alma.test.js` (Wegfall, „(entfällt)“ und zurück, Grabstein, vorbei, Raum, Doppel, Fehler im Status, Sperre,
  ohne Bibliotheken, quellen_extern; Raum je Termin, Verlegung im Kalender und über Abrufe, erste Verknüpfung, verschobener und
  abgesagter Termin, 14-täglich).

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
`ctx.modell.woche()` (Woche nach der Planwoche: am Samstag und Sonntag zählt schon die kommende; bis 18.10.2026 stand
dieselbe Regel als Bases-Formel `wochetext` im Dashboard). Nutzer: Dashboard (Kopf des Semesterverlaufs, `dashboard.js`), `verlauf.js` (Vorlesungswoche und Resttage in der
Lupe), `vorlesung.js` (Kopf der Vorlesungsnotiz: Woche des Notizdatums, Perlen mit Vorlesungswochen; Zeit und Raum am Tag der
Notiz über `findetStatt`, seit 20.10.2026 mit Änderung oder Verlegung in Warnfarbe und dem üblichen Wert durchgestrichen). Die Leiste
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
Speicher, darum jetzt Code). Das Raster zeigt eine echte Kalenderwoche, Montag bis Freitag, die Planwoche des Fachmodells (am
Samstag und Sonntag schon die nächste); im Kopf das Datum jedes Tages, rechts oben „‹ KW n ›“. Daten: alle Notizen mit `typ:
lehrveranstaltung` (jede Herkunft; je Modul und Art nur eine Gruppen-Notiz, siehe „Deine Übungs- oder Tutoriengruppe“)
und Kurznamen aus Modulnotizen (`kurz`) aus dem metadataCache, Semester, Pausen, freie Tage
und „Besuche ich nicht“ aus dem Fachmodell (`ctx.modell.findetStatt`, seit 18.10.2026; vorher die Kopien `semesterliste`,
`pausen` in `System/Einstellungen.md`, ohne freie Tage). Gezeichnet wird nur die gezeigte Woche; neu (entprellt, 0,4 s) bei Änderungen an
Stundenplan-, Modul- und Einstellungsnotizen, beim Zurückkommen in die App und alle 10 Minuten. Schreibt keine Datei.
Ein Kasten erscheint, solange das Datum seines Wochentags nicht nach `bis` liegt (leer = unbegrenzt). Liegt es vor `von`
(Serie, kein Einzeltermin), ist der Kasten blass (`spaeter`) mit „ab TT.MM.“ statt der Uhrzeit und Tooltip „beginnt am
TT.MM.“: Eine gewählte Übungs- oder Tutoriumsgruppe steht so gleich nach der Anmeldung da, nicht erst ab ihrer ersten Woche
(seit 19.10.2026; vorher fehlte sie bis dahin). Solche Kästen zählen nicht als „findet statt“; ohne `semester` des
gezeigten Semesters (nach dem Freitag der Woche), mit
`entfaellt: true` oder ausgeblendet (`herkunft: zentral`, `zentral_id` in `stundenplan_ausgeblendet`) gar nicht, ein
Einzeltermin nur an seinem Tag. Liegt der Tag in einer Pause, auf einem vorlesungsfreien Tag oder in `ausfall`, hat der Kasten
den Namen durchgestrichen und statt des Raums „Fällt aus“ (Klasse `ausfall`, Tooltip „fällt aus (Christi Himmelfahrt)“);
`aenderungen` („Datum|Beginn|Ende|Raum“) in der Woche: an der neuen Zeit, mit neuer Zeit und neuem Raum (`geaendert`).
*Ausnahmen* (seit 20.10.2026, weil Raumverlegungen und Ausfälle nicht genug auffielen; vorher sah ein
Ausfall blass aus wie „ab TT.MM.“ und eine Änderung hatte nur einen gestrichelten Rand): Ein Ausfall dieser Lehrveranstaltung
(`findetStatt` mit `grund` `ausfall`) und ein anderer Raum oder eine andere Zeit an diesem Tag, auch ein neuer Raum in den ersten
zwei Wochen nach einer dauerhaften Verlegung (`neuerRaum`, siehe „Alma-Stundenplan“), haben die Klasse `ausnahme`:
Fläche und Kante links in `--eba-warn`, „Fällt aus“ bzw. der neue Wert in Warnfarbe und der übliche durchgestrichen daneben
(Raster: „Hörsaal 9 statt ~~Hörsaal 1~~“, „12:15 statt ~~10:00~~“, ändert sich nur das Ende „bis 13:45 statt ~~12:00~~“; den Beginn
bei c.t. lässt das Raster bei einem anderen Raum weg, der Raum braucht den Platz). Ein Ausfall wegen einer Pause oder eines freien
Tags bleibt leise (neutrale Fläche, „Fällt aus“ gedämpft): Pausen sind keine Überraschung, und Alma trägt die Weihnachtspause auch
in `ausfall` ein. Keine Symbole, Farbe und Wort (Felder `ausnahme`, `marke`, `raumNeu`, `raumAlt`, `zeitNeu`, `zeitAlt`,
`zeitStatt`, `grund` am Kasten; CSS Abschnitt 55, „Ausnahmen“). Findet nichts statt, steht ein Satz
(Name der Pause, „Vorlesungsbeginn TT.MM.“, „Vorlesungsfrei“, „Keine Veranstaltungen“); fällt eine Lehrveranstaltung selbst aus,
zeigt die Woche trotzdem ihre Kästen, damit man den Ausfall sieht. Stunden von–bis aus allen Serien des
Semesters (dazu Einzeltermine und geänderte Zeiten der Woche), damit das Raster von Woche zu Woche gleich bleibt; Höhe am
Stundenplan 697 px, am Dashboard feste Viertelstunden (CSS). Überschneiden sich Kästen eines Tages, stehen sie nebeneinander
(`spalten`, `lage`: Breite und Abstand links im Stil). Ein blasser Kasten (`spaeter`) teilt sich die Breite nie mit einem
echten (seit 19.10.2026; vorher halbierte ein Tutorium, das erst in zwei Wochen begann, eine Vorlesung): Überschneidet er
einen, steht er schmal am rechten Rand (22 %, Klasse `schmal`, nur der Kurzname), die echten Kästen daneben behalten 78 %.
Wörter brechen nie mitten im Wort, nur an Silben. Reine Logik als Funktionen (`wocheBauen`, `spalten`, `lage`, `kurzname`,
`artText`, `versatzAus`, `tagAus`, `tagWahl`, `tageAus`, `tagKaesten`, `tagSchritt`, `wischStartOk`, `wischAchse`,
`wischRichtung`), getestet in `tests/wochenraster.test.js`. CSS: Abschnitte 47 und 55 (Tagesansicht 55b).
*Tagesansicht (iPhone, seit 19.10.2026; seit 20.10.2026 nur noch auf dem Dashboard):* Unter 520 px Kartenbreite
(Container-Abfrage auf `eba-kz`, also auch iPad im geteilten Bildschirm) zeigt die Woche einen Tag statt des Rasters; vorher
standen fünf Spalten à 60 px da, Namen zerbrachen Buchstabe für Buchstabe und Räume fehlten. `zeichnen` legt beide Ansichten
an (`.eba-wt` und `.eba-woche.hat-tag`), das CSS wählt nach der Breite, so passt es auch nach dem Drehen. Die Seite
**Stundenplan** zeigt immer das Raster (`mitTag(pfad)`: `Studium/Stundenplan.md` ohne Tagesansicht und ohne `hat-tag`; seit
20.10.2026). Entschieden wird am Pfad, nicht
an einem Argument im Codeblock: Die Seite hat im Update die Klasse „seite“, eine selbst geänderte bleibt stehen, und ein neues
Argument käme dort nie an. *Schmales Raster* (Karte unter 480 px, also die Seite Stundenplan auf dem iPhone hochkant): Spalten
von gut 60 px; der Kurzname in 10,5 px bricht nur an Silben (`hyphens: auto`, `lang="de"`, nie mitten im Wort), darunter die
knappe Zeile (`zeileZeichnen(el, k, true)`, beide Zeilen stehen im Kasten, das CSS wählt nach der Breite): Raum gekürzt
(`raumKnapp`: ohne Zusatz in Klammern, auch verschachtelt, „Hörsaal“ als „HS“, „Hörsaal 1 (Keplerstraße 2)“ → „HS 1“), Zeit nur
bei einer Änderung („18:15 statt ~~16:15~~“) und als „ab TT.MM.“, Ausfall „Fällt aus“; ein hoher Kasten zeigt drei Zeilen
(`eba-core.css` 55 und 37.stundenplan, Innenabstand seitlich 3 px). Quer (iPhone) und am iPad ist die Karte breiter: das volle
Raster. Kopf „KW n · 26.–30.10.“ mit ‹ › (dieselbe Aktion `woche`; „KW n“
in einer anderen Woche zurück), darunter fünf Tage mit Datum (gewählt getönt, heute in Akzentfarbe, Punkt, wenn an dem Tag
etwas stattfindet; ein kurzer Strich in Warnfarbe statt des Punkts, wenn an dem Tag eine Ausnahme ist, `tageAus`: `ausnahme`,
`hinweis` „Ausfall“, „Änderung“ oder „Ausfall und Änderung“ für Vorlesesoftware und Tooltip), darunter die Kästen des Tags über
die ganze Breite: links Beginn und Ende, kräftig der Kurzname, blass die Art (auch „Vorlesung“), darunter der Raum, nichts
abgeschnitten. Bei einer Ausnahme steht vorn der kurze Text („Fällt aus“, „Anderer Raum“, „Neuer Raum“, „Andere Zeit“, „Geändert“), bei einer
anderen Zeit „statt ~~10:15–11:45~~“, dann „Hörsaal 9 statt ~~Hörsaal 1~~“; die neue Zeit links in Warnfarbe; ein Ausfall wegen
einer Pause „Fällt aus (Weihnachtspause)“. Dieselben Klassen wie im Raster (heute, jetzt, ausfall, ausnahme, geaendert,
konflikt), ein Tipp öffnet wie dort. Was erst beginnt, ist eine leise Zeile
„Tutorium BWL · ab 04.11. · Mi 14:15“, kein Kasten. Welcher Tag: gewählt (Tipp auf einen Tag oder Wischen) merkt sich nur
dieses Gerät (`eba-woche-tag`, wie der Versatz: dieselbe Sitzung, 30 Minuten), sonst heute, in einer anderen Woche und am
Wochenende Montag (Planwoche). Wischen wechselt den Tag, nach Freitag weiter zum Montag der nächsten Woche (`tagSchritt`);
es darf auf einem Kasten beginnen, nur nicht auf ‹ ›.
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
`konflikt` (an Gruppen-Notizen): Warnpunkt und „überschneidet sich mit …“ im Tooltip, nur wenn die genannte Notiz im Raster
steht (seit 20.10.2026; nicht verdeckt, nicht „Besuche ich nicht“). Zweite Zeile: Raum, davor der Beginn in
`<time>`, wenn er nicht zur vollen Stunde liegt (bei einer Änderung die neue Zeit; am iPhone nur dann). Voller Titel mit Zeit
und Raum im `title`, ein Tipp öffnet das Modul (Aktion `zeigen`, immer mit dem vollen Pfad der Modulnotiz aus `modulPfad`, nie
über den Namen; ohne Modulnotiz die Stundenplan-Notiz selbst). Jeder Kasten ist ein CSS-Größen-Container; was nicht in
seine Höhe passt, entfällt (Abschnitt 55).

## Fachmodell (seit 18.10.2026, `modell.js`)

Regel für jede neue Funktion: Was Prüfung, Frist, „diese Woche“, Sitzung, ECTS, Note, „im Plan“, Statusfarbe oder Datum
heißt, fragt sie `ctx.modell`, statt es selbst abzuleiten. Bis zum 18.10.2026 rechnete jeder Bildschirm selbst, und Dashboard,
Modulseite, Zeitleiste und Studienverlauf widersprachen sich (Konsistenz-Audit). Eine neue Regel kommt ins Modell, mit Test in
`tests/fachmodell.test.js`; Bases-Formeln, die eine Regel nachbilden müssen, bekommen einen Vergleich in
`tests/bases-regeln.test.js`.

| Aufruf | Ergebnis und Regel |
|---|---|
| `zeit` | Datum und Text in einer Schreibweise (docs/design.md): `datum(iso)` „Mo 19.10.“, Jahr nur außerhalb des laufenden Studienjahrs (1.10. bis 30.9.) „06.02.2028“; `kurz`, `spanne` („19.–25.10.“, „12.10. – 06.02.“), `abstand` („heute“, „in 5 Tagen“), `uhr`, `minuten`, `uhrzeitIn(text)` („24:00“ ist das Ende des Tages und kommt nach 23:59, auch in `ortTeilen`: „bis 24:00 Uhr“ einer Abgabe aus dem ILIAS-Kalender), `kw`, `montag`, `plus`, `tage`, `jahrRaten(tag, monat, { bezug, ab })` (höchstens 60 Tage zurück, sonst das nächste Jahr; `ab`: erstes Vorkommen ab dem Beginn eines Zeitraums), `plural(n, einzahl, mehrzahl)`, `esc`, `heute()` (aus `ctx.date`, also mit `plugin.testDatum`). `ctx.zeit(fn, ms)` bleibt der Timer-Helfer des Kerns. |
| `termine({ alle })` | Termin-Notizen normiert (`datum`, `bis`, `ende`, `kategorie`, `art`, `zeit`, `minuten`, `ab`, `bisZeit`, `wo`, `geschaetzt`, `erledigt`, `zwischentest`, `nachhol`, `freiwillig`, `zentral`), nach Tag und Uhrzeit als Zahl (9:15 vor 12:15, ohne Uhrzeit zuerst). Entfallene (`entfaellt: true`) und die Frist der Orientierungsprüfung eines anderen Jahrgangs zählen nirgends (`alle: true` liefert sie). Uhrzeit: Feld `uhrzeit` (neue eigene Termine), sonst aus `ort`. |
| `pruefungen({ heute, ab, bis, code, zwischentests })` | Termin-Notizen `kategorie: Prüfung` (eintägig; ein Zeitraum ist eine Prüfungsphase) und Modulfeld `klausur`; Kürzel + Tag einmal, die Notiz gewinnt, ein Zwischentest verdeckt keine Klausur. Je Prüfung `erledigt` (Haken an der Notiz oder Modul bestanden/anerkannt), `fertig`, `ergebnis`, `offen` (kommt noch, nicht erledigt). |
| `pruefungVon(code)` | Die Prüfung eines Moduls: ohne Zwischentests, Nachholtermin nur nach „nicht bestanden“; die nächste offene, sonst die letzte. Modul bestanden/anerkannt: nur eine, die schon war, sonst `null`. Lernplan, Modulseite, Studienverlauf und die Spalte „Termin“ auf Noten & ECTS nutzen sie. |
| `naechstePruefung()` | Kachel „Nächste Prüfung“: früheste offene Klausur ohne Zwischentests und Nachholtermine. |
| `fristen({ tage })`, `abgaben({ tage })` | Fristen (`kategorie: Frist`, offen, laufen noch oder kommen), sortiert nach dem nächsten Stichtag (`stichtag`: läuft der Zeitraum schon, sein Ende, sonst sein Beginn); offene Übungsblätter mit Fälligkeit (überfällige bleiben bis zur Abgabe). |
| `kalenderwoche(iso)`, `planwoche(iso)` | Montag bis Sonntag des Tages bzw. die Woche, um die es geht: **am Samstag und Sonntag schon die kommende** (`vorgezogen`). Die eine Wochenend-Regel für alles, was „diese Woche“ zeigt: Wochenraster, Leiste „Semesterverlauf“, Semesterband der Modulseite, Agenda („Diese Woche · 17.–25.10.“ ab heute) und `woche().text` („Vorlesungswoche 2 von 16“ am Sonntag vor Woche 2). Tagesangaben (heute, morgen, Countdown, „Vorlesungsbeginn morgen“) bleiben am Tag. |
| `findetStatt(fm, tag)` | Findet eine Sitzung (`typ: lehrveranstaltung`) an dem Tag statt? `{ statt, grund, name, beginn, ende, raum, geaendert, raumGeaendert, raumAlt, zeitGeaendert, zeitAlt }`; `grund`: `entfaellt`, `ausgeblendet` (Besuche ich nicht), `anderer Tag` (auch Einzeltermin), `ausserhalb` (`von`/`bis`), `pause`, `frei` (vorlesungsfreier Tag wie Christi Himmelfahrt), `ausfall` (seit 20.10.2026 in dieser Reihenfolge: Pause und freier Tag gehen dem Ausfall vor, Alma trägt die Weihnachtspause auch in `ausfall` ein); `aenderungen` setzen Zeit und Raum, `raumAlt` und `zeitAlt` („10:15–11:45“) sind dann der übliche Wert; vor `raum_seit` gilt `raum_vorher`, die ersten zwei Wochen ab `raum_seit` `neuerRaum` mit `raumAlt` = `raum_vorher`; `rhythmus: 14-täglich` nur jede zweite Woche ab `von`. Wochenraster, Kopf der Vorlesungsnotiz (Zeit und Raum am Tag der Notiz) und `naechsteSitzung(fm, jetzt)` („Als Nächstes“, dieselben Felder) nutzen sie. `ausfaelle(fm, jetzt, tage = 14)`: Ausfälle (`grund` `ausfall`) ab heute, heute nur bis zum Ende. |
| `imPlan(modul)` | Gehört zu deinem Studium: gewählt, selbst geplant, begonnen (Status nicht „offen“), Grundstudium und Abschluss, in Profil & Vertiefung Pflicht deiner Variante (offen: Pflicht in allen); Schwerpunkt nur gewählt oder begonnen; Zusatzleistungen nie. |
| `ects()`, `noten()`, `blockVon(fm, variante)` | ECTS = bestandene und anerkannte Module ohne Zusatz + SQ-Kurse (höchstens 9, solange SQ100 offen), `op` (höchstens 4), `opFrist` (Ende des 4. Fachsemesters); Gesamtnote nach § 13 BT wie Noten & ECTS. |
| `statusArt(typ, wert)` | Ton einer Pille nach docs/design.md: ok (bestanden, anerkannt, angemeldet, erledigt, gelesen …), warn (Frist, in Arbeit, Abgabe), bad (Prüfung, nicht bestanden, überfällig), info (läuft, Lehre, Zwischentest), akzent (Fachschaft, Veranstaltung), sonst leer (offen, neu, geschätzt). |
| `istZwischentest(x)`, `istNachhol(x)`, `terminArt(kategorie, zt)`, `ortTeilen(ort)`, `modul(code)`, `opFrist()` | Einzelregeln; Zwischentest = „Zwischentest“ (auch „Zwischen-Test“) im Titel oder Dateinamen. |
| `besuchtNicht(fm)`, `besuchSchluessel(fm)` | „Besuche ich nicht“ für jede Lehrveranstaltung (seit 0.4.6): Notiz einer Quelle über ihren Schlüssel in `stundenplan_ausgeblendet` der Einstellungen (zentral die `zentral_id`, sonst `<herkunft>:<id>`, z. B. `alma:…`, weil die Quelle ihre Notiz neu schreibt), deine eigene über das Feld `besuche_nicht: true`. `findetStatt` gibt dann `ausgeblendet`. Bis 0.4.5 nur für zentrale Notizen. |
| `vorlesung(f)`, `vorlesungen({ code })`, `vorlesungTitel(o)`, `vorlesungThema(o)` | Der eine Name einer Vorlesungsnotiz (seit 19.10.2026): „Vorlesung 1 · Mo 13.10. · Thema“ (ohne Nummer „Vorlesung“, ohne Modul „Mitschrift“). Nummer aus `nummer`, sonst aus dem Dateinamen („… VL 03“); Thema aus `thema`, sonst die erste Überschrift, wenn sie mehr sagt als Kürzel, Nummer, Datum und Modultitel, sonst der Titel der verlinkten Folien (Begleitnotiz, ohne Semester); nie erfunden. `vorlesungen` neueste zuerst. Nutzer: Modulseite, „Nachzuarbeiten“, To-dos, Kopf der Vorlesungsnotiz, neue Notizen. Dateinamen bleiben. |

Prüfungsphasen kommen nur aus den Semesterdaten (`daten().pruefungsphasen`); Termin-Notizen wie „Klausurphase Haupttermin“
sind Kalendereinträge und zählen für keine Regel. Die Frist der Orientierungsprüfung aus den zentralen Daten (30.09.2028)
übernimmt `zentral.js` nur, wenn ihr Datum das Ende deines 4. Fachsemesters ist (`opFrist`). Nutzer: `dashboard.js`
(Kacheln und Listen), `termine.js`, `kalender.js`, `woche.js`, `modul.js`, `klausurzeit.js`, `verlauf.js`, `lernplan.js`,
`alma-konto.js` (Erinnerung an die Prüfungsanmeldung), `tabellen.js` (Datum, Chip-Farbe), `notizen.js` (Zwischentest ist eine
Prüfung), `eba.js` und `todos.js` (Jahr zu „TT.MM.“),
`zentral.js` (Jahrgang der Orientierungsprüfung). Die Bases-Formeln auf Noten & ECTS (Termin, „im Plan“, Stand, Block,
Kennzahlen, seit 0.4.6 auch die Tabelle „Bestanden“: Spalte ECTS = `formula.zaehlt`, ohne Zusatzleistungen, bei offenem SQ100
eine Zeile mit den gezählten SQ-Kursen, ihre Summe = `ects().ist`) folgen denselben Regeln; `tests/bases-regeln.test.js`
rechnet sie mit einem kleinen Auswerter (`tests/bases-formel.js`) auf ausgedachten Notizen aus und vergleicht sie mit dem
Modell.

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

- **Wann:** über den gemeinsamen Zeitplan der Quellen (`Q.planen`, seit 0.4.5): erster Lauf 20 s + Zufall 0–2 Min. nach dem
  Einlesen (auch nach einem Hot-Reload), dann alle 15 Min. (seit 0.4.2; ohne Änderung nur das Manifest, Dateien nur bei neuer
  Prüfsumme, Notizen nur bei geänderten Daten), beim Zurückkehren in die App nach über 10 Min.; dazu Aktion/Befehl „Zentrale Daten aktualisieren“. Ändert sich der Filter (Variante,
  Plan, Schalter), wendet das Abrufer-Gerät den letzten Stand ohne Netz neu an (`abrufen({ nurCache: true })`, 5 s entprellt über
  `ctx.modell.beiAenderung`). Hinweise (Notice) nur beim Knopf, nie beim automatischen Lauf.
- **Frisch vom Server** (seit 19.10.2026, `frischUrl`): GitHub Pages schickt jede Datei mit `Cache-Control: max-age=600`. Gerät
  und Zwischenspeicher gaben das Manifest darum bis zu 10 Min. alt zurück: Nach 0.4.7 zeigte ein iPad das Update lange nicht an,
  und eine Datei, die älter ist als ihr Manifest, scheitert an der Prüfsumme. Jeder Abruf hängt `?t=<Minute seit 1970>` an
  (gleich viele Abrufe wie vorher, Geräte in derselben Minute teilen sich den Zwischenspeicher) und schickt `Cache-Control:
  no-cache` (`FRISCH_KOPF`; `requestUrl` reicht Kopfzeilen auf iPhone und iPad durch wie bei `ilias-netz.js`). Ein 304 ohne
  Inhalt holt wie bisher einmal mit Zeitstempel in ms nach. `update.js` holt die Liste einer neuen Version genauso.
- **Gerätelokal** (`app.saveLocalStorage`): `eba-geraet` (zufällige Geräte-ID), `eba-darstellung` (Hell, Dunkel, Automatisch),
  `eba-design` (`elfenbein`, `flieder`, `klar`), `eba-start-klassen` (Klassen am `body`, die `main.js` schon beim Laden setzt),
  `eba-zentral-stand` (letzter Abruf, Fehler,
  Pause, Hinweis, `plugin_aktuell`, Prüfsummen, Filter-Schlüssel, Abrufer ja/nein), `eba-zentral-daten` (letzter geprüfter
  Stand, für Filteränderungen ohne Netz).
- **Nur ein Gerät schreibt:** `System/Daten/abruf.json` (synchronisiert) = `{ geraet, seit, zuletzt, mobil, angewendet }`.
  Schreiben darf das Gerät, das dort steht, oder jedes andere, wenn `zuletzt` älter als 80 Min. ist (dann übernimmt es).
  **Aktualisieren** (`abrufen({ manuell: true })`, seit 0.4.5) übernimmt sofort wie „Hier aktualisieren“ bei ILIAS, außer der
  Abrufer hat vor weniger als 2 Min. abgerufen (Hinweis „gerade auf einem anderen Gerät aktualisiert“). Wer übernimmt, schreibt
  `abruf.json` zuerst (`sperre.js`, `nehmen({ erzwingen: true })`, `angewendet` bleibt), dann die Notizen. Jeder Lauf liest
  `abruf.json` direkt vor dem Schreiben neu und schreibt nichts, wenn inzwischen ein anderes Gerät übernommen oder abgerufen
  hat (eine Übernahme von Hand gilt nur gegen den Stand, den sie gesehen hat). Die Datei wird nur
  bei Wechsel, bei geänderten Notizen (`angewendet`, die Felder der Sperre bleiben dabei) oder höchstens alle 50 Min. (Puls über
  `sperre.js`; bei Läufen alle 15 Min. also etwa stündlich) geschrieben, auch ohne geänderte Daten – der Puls muss unter der
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
  werden vereinigt) und eigene Felder bleiben. Datum geändert → `fileManager.renameFile` nach Datum und Titel (Links ziehen
  mit); folgt der Name selbst nicht der Regel `eba.dateiTitel` (etwa ein Emoji aus einer älteren Fassung), wird er nur gesäubert
  (`neuerName`), ein bewusst kürzerer Name bleibt. Geschrieben wird
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
  (Modul nicht im Plan, Schalter aus): unberührt → Papierkorb, sonst stehen lassen. Unberührt und Grabstein nach den Regeln des
  Quellen-Vertrags (`Q.unberuehrt`, `Q.kurzHash`, gleiche Rechnung wie bis 0.4.4).
- **Doppel** (seit 0.4.5): Tragen mehrere Notizen dieselbe `zentral_id` (Sync-Verzug, Konfliktkopie), führt der Abrufer sie vor
  dem Übernehmen zusammen wie `termine-sync.py` des Uni-Abgleichs (`Q.dubletten`): Der kürzeste Dateiname bleibt,
  `erledigt: true` gewinnt, deine Zeilen unter „Meine Notizen“ (ältere Stundenplan-Notizen: „Notizen“) kommen dazu, die anderen in den
  Papierkorb (Bericht `doppel`). Vorher blieben die anderen unangetastet liegen.
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
  `herkunft`; nie zentral), die zur Zeit einer Gruppe dieses Moduls aus `gruppen.json` passt (`gehoertZu` aus `meine-gruppe.js`,
  die eine Regel: Code, Semester, Wochentag, Beginn ±15 Min. c.t./s.t.; hier mit `ende` und `arten` Übung oder Tutorium; nie
  über die Nummer),
  steht eine grüne Pille „Gruppe 4“ dabei (Name nur aus dem Feld `gruppe` der Notiz, sonst nur „angemeldet“; nie `gruppe_alma`;
  bis 18.10.2026 „angemeldet · Gruppe 4“).
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
  `zentral_id`, `uebersicht: "[[Stundenplan]]"`), eigene Felder und alles ab `## Meine Notizen` (ältere: `## Notizen`) bleiben. Text: Zeit, Zeitraum,
  „Fällt aus“, „Anders“, „Zusätzlich“, Quelle; **Besuche ich nicht** steht seit 0.4.6 als Status-Knopf im Kopf der Notiz
  (`kopf.js`). Nie umbenannt (die id hängt an Tag und Beginn).
  *Wochenraster* (Dashboard und Stundenplan, jede gezeigte Woche, `woche.js`): `ausfall` → „Fällt aus“ in Warnfarbe;
  `aenderungen` = „Datum|Beginn|Ende|Raum“ (immer vollständig, ohne Zusatztermine) → liegt das Datum in der
  gezeigten Woche, zeigt der Kasten Zeit und Raum der Änderung in Warnfarbe, den üblichen Wert durchgestrichen (siehe
  „Wochenraster“, *Ausnahmen*; CSS Abschnitt 55). Das Raster lässt
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
  unberührt → Papierkorb, mit eigenem Text unter `## Meine Notizen` → der Text wird an die eigene Notiz angehängt („Aus der zentralen
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
  *Eine Regel „ist das deine Gruppe?“* (seit 0.4.5): `gehoertZu(fm, g, { arten, ende, ueberId })` in `meine-gruppe.js` gilt für
  ILIAS und „Meine“ (`deckt`), die Markierung in `eba-gruppen` (`gruppen.js`, Gruppen-Notizen über ihre `gruppe_id`) und
  die Pille „Gruppe 4“ (`termine.js`); vorher prüfte jede Stelle selbst (dort ohne c.t.).
  *Stundenplan von außen* (`eba.quelleExtern("stundenplan")`, siehe „Quellen außerhalb des Plugins“; ohne Liste beim eigenen
  Uni-Abgleich: `System/Skripte/abgleich.js` im Tresor oder `ilias_unterlagen: extern`): Der zentrale Stundenplan wird weder
  geholt noch angewendet, vorhandene zentrale Notizen
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
  nicht von hier stammen, und alles ab `## Meine Notizen` bzw. `## Notizen`) bleibt beim Aktualisieren.
  *Gewählt* („Meine“ in `eba-gruppen`, `gruppen.js`, auf dem Gerät, auf dem du tippst): Notiz mit `herkunft: gruppe-gewaehlt`;
  eine je Modul und Art (eine neue Wahl ändert sie und trägt `gewaehlt_am`, den Zeitpunkt der Wahl), „Abwählen“ → Papierkorb
  (die Notiz der angetippten Gruppe) und bleibt, solange es eine gewählte Notiz gibt.
  „Meine“ fehlt, wenn die Gruppe schon aus ILIAS, Alma, von Hand oder zentral kommt. Beim Zeichnen und nach jeder Änderung in
  `Stundenplan/` (höchstens einmal je Minute, auf jedem Gerät) weichen gewählte Notizen,
  die eine ILIAS-Notiz desselben Moduls oder eine andere Notiz zur selben
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
  *Von dir gelöscht* (seit 0.4.5, Lebenslauf des Quellen-Vertrags): Der Index merkt je Gruppe, für welche Gruppe aus
  `gruppen.json` schon eine ILIAS-Notiz da war (`notiz`). Fehlt sie dann (und keine gewählte Notiz desselben Moduls), hast du sie
  gelöscht: Sie kommt nicht wieder, bis die Zuordnung wechselt oder du die Gruppe verlässt (`notiz` wird leer).
  *Eine Gruppe je Modul und Art* (seit 19.10.2026, `doppelt` und `vorrang` in `meine-gruppe.js`): Zwei Tutorien desselben
  Moduls standen blass nebeneinander im Stundenplan. Ursachen: Ein zweites „Meine“ sah die eben angelegte Notiz nicht (Obsidian
  hatte sie noch nicht eingelesen, zwei Tipps kurz hintereinander, oder ein zweites Gerät wählte vor dem Sync), und zwei
  gewählte Notizen führte nichts zusammen; wer in ILIAS die Gruppe wechselte, hatte die alte Notiz bis zum zweiten Lauf daneben;
  wer in ILIAS in zwei Gruppen eines Moduls war, bekam zwei Notizen. Jetzt, an der Quelle: Wer auf einem Gerät Gruppen-Notizen
  schreibt (Wählen, Abwählen, Aufräumen, ILIAS), kommt nacheinander dran, und Wählen liest Notizen ohne Eintrag im
  metadataCache aus ihrem Text; eine neue Wahl ersetzt jede ältere desselben Moduls und derselben Art (weitere weichen samt Text
  in sie); eine neue ILIAS-Gruppe übernimmt die Notiz der verlassenen; von mehreren ILIAS-Mitgliedschaften eines Moduls und
  einer Art bekommt nur eine eine Notiz (die eine andere Notiz zur selben Zeit schon abdeckt, sonst nach `vorrang`). Welche
  gilt, entscheidet überall dieselbe Reihenfolge (`vorrang`, auf jedem Gerät gleich): ILIAS vor deiner Wahl, die jüngere Wahl
  (`gewaehlt_am`; ohne = älter) vor der älteren, dann die Gruppe, die zur aktuellen Gruppenliste passt (gleiche id, Tag und
  Beginn), dann die frühere in der Woche, dann die id. Die Woche zeigt nur diese; bestehende Doppel führt das Aufräumen von
  `gruppen.js` einmal zusammen (nach jeder Änderung in `Stundenplan/` und beim Zeichnen, höchstens einmal je Minute): Text der
  anderen wandert in die bleibende, die anderen gehen in den Papierkorb. Doppelte ILIAS-Notizen fasst nur `ilias.js` an (ein
  Schreiber), eine halb synchronisierte Freigabe bleibt verschont. Nichts davon wird eine Aufgabe für dich: Was entschieden
  wurde, steht nur im Gerätespeicher (`eba-gruppen-protokoll`, die letzten 30). Eine Gruppen-Notiz, die eine Notiz zur selben
  Zeit abdeckt (Alma, von Hand, zentral), fehlt in der Woche gleich; Notizen derselben Art zu einer anderen Zeit, die keine
  Gruppen-Notizen sind, zählen nicht (das kann eine Übung für alle sein).
  *Eine andere Gruppe deines Kurses aus Alma* (seit 20.10.2026, `andereGruppe` in `meine-gruppe.js`): In einem Tresor standen
  zwei B110-Tutorien und zwei Mathe-Tutorien in der Woche, und das eigene Mathe-Tutorium zeigte den Warnpunkt. Der
  Alma-Stundenplan enthielt je eine Parallelgruppe (in Alma vorgemerkt, Alma nennt sie „Übung zu …“, also `art: Übung`), die
  eigene Gruppe kam aus ILIAS (`art: Tutorium`). Weder „gleiche Zeit“ noch „ein Modul, eine Art“ traf. Jetzt: Gehört eine Alma-Notiz (`herkunft: alma`)
  in `gruppen.json` zu einer anderen Gruppe desselben Kurses (Code, Semester, Art der Liste) als deine Gruppen-Notiz (ILIAS oder
  gewählt; ihre Gruppe über `gruppe_id`), ist sie verdeckt (`doppelt`), es gilt deine Gruppe. Sie bleibt liegen (Alma gehört
  sie), steht nie in `faelle` (das Aufräumen fasst sie nicht an) und zählt nicht als Überschneidung: Wählen und ILIAS-Abgleich
  lassen verdeckte Notizen und andere Gruppen der gerade geschriebenen aus (`nichtImPlan`, dafür bekommen beide `liste`). Ohne
  Gruppenliste und für Notizen von Hand bleibt alles wie vorher. Die Woche zeigt den Warnpunkt außerdem nur, wenn die Notiz aus
  `konflikt` im Raster steht (nicht verdeckt, nicht „Besuche ich nicht“, noch vorhanden), auch wenn das Feld noch vom letzten Lauf
  stammt.
  Tests: `tests/meine-gruppe.test.js`, `tests/ilias-gruppen.test.js`, `tests/gruppen.test.js`, `tests/wochenraster.test.js`.
- **Anzeige:** Zeile „Zentrale Daten“ im Codeblock `eba-verbindungen` ohne Schloss: „Aktualisiert vor X Min.“ / „Pausiert“ /
  „Keine Verbindung zu den zentralen Daten. Zuletzt aktualisiert …“, `hinweis` aus dem Manifest. `status()` hat die gemeinsame
  Form der Quellen (`zustand`: aus, laeuft, pause, fehler, an; `geprueft` = letzter Lauf ohne Fehler, gerätelokal `erfolg`;
  `fehler` ein Satz, `grund` der technische Text; `warnungen` = Warnung des letzten Laufs); `stand().geprueft` bleibt das
  zuletzt geprüfte Manifest (für `update.js`). „Neue Version verfügbar“ steht seit 0.2.0 in der Zeile „Studium
  Autopilot“ (`update.js`); nur ohne `ctx.update` zeigt diese Zeile den Link `RELEASES`. „Mehr erfahren“ öffnet das
  Info-Fenster (Datenschutz-Hinweis). Der Termin-Notiz-Kopf zeigt „geprüft am …“ aus `geprueft`; die Agenda liest nur das
  Frontmatter, nie den Notiztext.
- **Für andere Skripte/Tests:** `ctx.zentral` = `{ abrufen(opt), status(), stand(), geraetId(), idAusName(name),
  notizText(alt, eintrag, opt), dateiName(datum, titel), neuerName(name, datum, titel), terminePruefen(d), semesterPruefen(d), manifestPruefen(m),
  gruppenPruefen(d), gruppen(), angebotePruefen(d), angebote(), filterBauen(), protokoll, … }`. `abrufen()` liefert einen Bericht
  (`art`: ok | unveraendert | fehler | pausiert | aus | anderes-geraet; `geschrieben`, `angelegt`, `aktualisiert`, `umbenannt`,
  `entfaellt`, `papierkorb`, `verworfen`).
- **Migration (einmalig, nur im Projekt):** Die 109 Termin-Notizen der Vorlage wurden am 15.10.2026 mit
  einem einmaligen Skript (nicht im Repo) zu zentralen Notizen (id-Regel aus dem Dateinamen, Inhalt genau wie vom Plugin
  erzeugt; zwei Dateien mit falschem Datum im Namen umbenannt). Der alte Notiztext ist dabei entfallen (er stand nie in den
  Daten; Inhalte „für alle“ kommen künftig über `info`). Der erste Abruf schreibt darum keine dieser Notizen neu.

## Update (seit 0.2.0, `update.js`)

Zwei Kanäle bleiben getrennt: Die zentralen Daten kommen von selbst und sind nur Daten. **Programmteile kommen nur nach einem
Tipp auf „Neue Version installieren“** und Bestätigung, aus dem Haupt-Repo am Tag der Version.

```
manifest.json (ecoba-daten) ── release / beta: version, url_basis, sha256 der Liste
        │ Tipp „Neue Version installieren“ → Manifest frisch holen → Bestätigung
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
| `einstellung` | `.obsidian/{app,bookmarks,community-plugins,core-plugins,hotkeys,types}.json` | ersetzen | mischen: deine Werte bleiben, fehlende Schlüssel kommen dazu, Textlisten vereinigt; eine geänderte Vorgabe (`VORGABE_NEU`, seit 0.4.6) bekommt nur, wer noch den alten Wert hat und von einer Version davor kommt |
| `seite` | `Dashboard.md`, `Studium/*.md`, `System/Daten/Musterplan.md` | ersetzen | Vorlage seit der installierten Version gleich → deine bleibt, keine Kopie (seit 0.4.4); nur abgehakt (`ohne_haken` gleich) → neue Seite mit deinen Haken; sonst deine bleibt, neue daneben `Name (neu X).md` |
| `modul` | `Module/**/*.md` | ersetzen | Vorlage seit der installierten Version gleich → deines bleibt unverändert (seit 0.4.4); sonst Frontmatter: Reihenfolge und Katalogfelder neu, persönliche Felder (`status`, `ergebnis`, `versuch`, `klausur`, `semester_geplant`, `gewaehlt`, `anrechnung`, `zusatz`, `alma_ausgeblendet`, `anmeldung_verzicht`) und eigene Felder bleiben, `tags`/`aliases`/`cssclasses` vereinigt; Text neu, wenn `koerper` gleich, sonst deiner |

Nie im Update: `System/Einstellungen.md`, `System/Daten/Semester.md` (Datenkanal), `abruf.json`, `installiert.json`, `update.json`,
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
  (Aktion `vorlage-neu-laden`). Skripte lädt der Hot-Reload ohnehin nach, ohne einen Hinweis je Datei: Kommt eine neue
  `installiert.json` an, setzt `update.js` `plugin.stillBis` für eine Minute; mehrere Skripte auf einmal schweigen ohnehin.
  Die Fenster vor und nach dem Update sagen darum „Dort einmal auf ‚Neu laden‘ … tippen“ (ohne neuen Kern: „nichts tun“).
- **Unterbrochenes Update** (seit 0.4.8, `System/Daten/update.json`, `markeLage`): Befund 19.10.2026: Ein Gerät ging mitten im
  Hochladen über LiveSync in den Hintergrund, der Tresor war auf den anderen Geräten eine Weile halb aktualisiert. Darum schreibt
  das Update als **erste** Datei `update.json` = `{ version, von, geraet, seit }` (Geräte-ID aus `ctx.zentral.geraetId`; nur, wenn
  es überhaupt etwas schreibt) und lässt sie danach liegen: Eine am Ende gelöschte Datei käme über den Sync erst nach allen anderen
  an (ein Dokument steht dort, wo es zuletzt geändert wurde). Fertig ist ein Update erst mit `installiert.json` (zuletzt, nach dem
  Kern). Ein Schreibfehler setzt auch `update.json` zurück (`schreibenSicher`). Solange `update.json` eine neuere Version nennt als
  `installiert.json`:
  - *dieses Gerät* (gleiche Geräte-ID, kein Lauf hier): Die App wurde beendet, bevor alles geschrieben war. Zeile und Dashboard
    zeigen „Das Update auf Version X ist nicht fertig geworden.“ mit **Update fertigstellen** (Aktion `vorlage-aktualisieren`):
    Derselbe Ablauf ohne zweite Frage (bietet das Manifest inzwischen eine andere Version an, wird gefragt); der Plan gegen die
    alte `installiert.json` lädt und schreibt nur, was fehlt, und ergibt denselben Stand wie ein Lauf ohne Abbruch
    (`tests/update.test.js`). Ohne Zeitgrenze.
  - *ein anderes Gerät*, `seit` vor weniger als 1 Std. (`MARKE_STILL`): seine Dateien kommen noch über den Sync. Statt eines
    Angebots steht „Ein Update wird gerade auf einem anderen Gerät installiert.“ (Zeile nur mit „Mehr erfahren“, Dashboard ohne
    Knöpfe, kein Hinweis beim Öffnen); **Neue Version installieren** und **Nach Updates suchen** sagen es als Hinweis mit „Öffne Obsidian dort,
    dann kommt es hierher.“. Danach gilt das Gerät als weg, und hier wird wieder angeboten (ein zweiter Lauf schreibt dieselben
    Dateien).
  Gelesen beim Start und bei jeder Änderung von `update.json` (auch per Sync). Wirkt ab dem Update, das 0.4.8 plant: Das Update
  auf 0.4.8 schreibt noch der Planer von 0.4.7 (ohne `update.json`). `update.json` steht in `.gitignore`, `release.py` und
  `pruefen.py`.
- **Nach Updates suchen** (seit 0.4.8, `suchen()`, Aktion und Befehl `vorlage-suchen`): Knopf (normal, nicht Hauptknopf) in der
  Zeile „Studium Autopilot“, wenn nichts angeboten wird, daneben der Textlink „Mehr erfahren“. Holt das Manifest sofort
  (`ctx.zentral.manifestHolen`, ohne die 30 Min. der frischen Prüfung und ohne den Takt von `zentral.js`; zählt als Prüfung,
  `eba-update-geprueft`) und sagt das Ergebnis in einem Hinweis: das Angebot wie der Hinweis beim Öffnen (**Neue Version
  installieren**, **Was ist neu**), „Version X ist da. Einmal neu laden.“, „Du hast die neueste Version.“ oder „Keine Verbindung.
  Versuch es später noch einmal.“. Ein Tipp, ein Abruf: Die automatischen Prüfungen bleiben, wie sie sind.
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
  (Beta-)Version X verfügbar.“ + Notiz + Knopf „Neue Version installieren“, Rückfall „Neue Version X verfügbar“ als Link auf die Releases
  (nur `plugin_aktuell`, kein `release`), „Version X. Du hast die neueste Version.“ oder nur „Version X.“ (ohne Angaben im
  Manifest, z. B. zentrale Daten aus), diese beiden mit dem Knopf **Nach Updates suchen** (`knopf.cta: false`); dazu seit 0.4.8
  „Update fertigstellen“ und „Ein Update wird gerade auf einem anderen Gerät installiert.“ (siehe „Unterbrochenes Update“). Die
  Zeile „Zentrale Daten“ zeigt den Hinweis nicht mehr.
- **Hinweis auf dem Dashboard (seit 0.3.1):** Codeblock `eba-update-hinweis` ganz oben in `Dashboard.md` (nach der Pfadzeile,
  vor den Kennzahlen). `ctx.update.hinweis()` nutzt dieselbe Logik wie `anzeige()` (Neu laden, Angebot je Kanal, Rückfall
  `plugin_aktuell` → Link „Ansehen“ auf die Releases) und liefert sonst `null`: Dann ist der Block leer (`.eba-uh-aus`) und
  samt Hülle unsichtbar. Der Hinweis zeigt nur den Titel, ohne Satz; was neu ist, steht unter „Was ist neu“. Knöpfe **Neue Version installieren** (gleicher
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
  - *Hinweis beim Öffnen* (`toastPruefen()`): Obsidian-Notice „Neue Version X ist da.“ mit **Neue Version installieren** (gleicher Ablauf
    mit Bestätigung) und **Was ist neu**; antippen blendet ihn aus (= später). Angebot wie `hinweis()` (`angebot()`, Kanal).
    Einmal je App-Start (`sessionStorage` `eba-update-toast-sitzung`; über 6 h im Hintergrund zählt als neuer Start) und für
    dieselbe Version höchstens alle 12 h (`eba-update-toast` = `{ version, zeit }`, `toastFaellig`). Zeigt die Zeile
    `eba-update-hinweis` das Angebot gerade sichtbar (gezeichneter Block mit Fläche in einem sichtbaren Fenster; ein
    Dashboard im Hintergrund-Tab zählt nicht), kein Hinweis und nichts gemerkt (`toastEntscheiden` → `verdeckt`); beim
    nächsten Wechsel der Seite (`active-leaf-change`, `file-open`) wird neu entschieden. „Später“ auf der Zeile blendet sie
    für diese Version aus und zählt als Antwort für diesen App-Start; beim nächsten Start (nach dem Abstand) kommt der
    Hinweis wieder. Die Zeile hat dafür auch **Was ist neu** (leiser Knopf zwischen **Neue Version installieren** und **Später**; auf dem
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
    Abschnitte → `notiz` aus dem Manifest und Link „Auf GitHub ansehen“ auf das Release. Knöpfe **Neue Version installieren**/**Später**
    beim Angebot, sonst **Fertig**. Mit `antwort` (aus dem Fenster vor dem Update geöffnet) beantwortet **Neue Version installieren**
    die offene Frage direkt (`antwort(true)`, kein zweites Fragen), Schließen oder **Später** → `antwort(false)`. CSS: Abschnitt 51.
- **Fenster vor dem Update** (`fragen(rel)`, `.eba-modal-update`): Titel „Auf Version X aktualisieren?“, die Notiz aus dem
  Manifest als Text, leiser Knopf **Was ist neu** (öffnet „Was ist neu“ mit `antwort`), ein Satz „Deine Noten, Termine und
  Notizen bleiben. Vorher wird eine Sicherung angelegt.“, Einzelheiten eingeklappt unter „Mehr erfahren“. Knöpfe **Später**
  und **Neue Version installieren** (Hauptknopf zuletzt im DOM): PC und iPad nebeneinander rechts, Hauptknopf rechts; iPhone untereinander,
  Hauptknopf oben; auf iPad und iPhone ≥ 44 px. Dieselbe Reihenfolge haben „Was ist neu“ und das Ergebnisfenster. Obsidian
  stapelt Knöpfe auf iPad und iPhone sonst (`column-reverse`); Abschnitt 51 legt die Richtung selbst fest.
- **Für Tests und andere Skripte:** `ctx.update` = `{ klasseVon, pfadOk, neuName, deineName, kopienVon, listePruefen, teilen,
  ohneHaken, seiteHaken, fmMischen, modulMischen, jsonMischenText, lesezeichenOhne, planen, aktualisierenMit(io, o),
  heilenMit(io, o), angebot, neuer, kanal, kanalSetzen, io, anzeige, hinweis, hinweisNeu, status, aktualisieren,
  installiertAnlegen, heilen, pluginNeuLaden, letzterBericht, fenster, changelogAbschnitte, abschnitteZwischen, markdownSicher,
  toastFaellig, toastEntscheiden, nachUpdate, pruefungFaellig, frischPruefen, toastPruefen, neuigkeitenZeigen, neuigkeiten,
  markeLage, MARKE, MARKE_STILL, markeNeu, suchen }`.
  `aktualisierenMit` und `heilenMit` bekommen den Dateizugriff als `io` (`holen`, `lesen`, `schreiben`, `loeschen`, `liste`)
  und sind darum ohne Obsidian testbar (`tests/update.test.js`, Neuigkeiten: `tests/update-neuigkeiten.test.js`).
  `heilen(true)` startet die Reparatur sofort, ohne den Merker des Geräts.

## Quellen außerhalb des Plugins (`quellen_extern`, seit 0.4.5)

Was ein eigener Uni-Abgleich oder ein eigener Server schon in den Tresor bringt, holt das Plugin nicht noch einmal: nie zwei
Schreiber je Quelle. Eine Regel für alle Skripte in `eba.js`:

```
ctx.user.eba.quelleExtern(schluessel, existiert, einstellungen) → true | false
ctx.user.eba.quellenExtern(existiert, einstellungen) → [Schlüssel]      ctx.user.eba.QUELLEN (alle Schlüssel)
```

`existiert(pfad)` → ob die Datei im Tresor liegt, `einstellungen` = Frontmatter von `System/Einstellungen.md`. Jede Funktion
fragt bei **jedem** Lauf, nicht nur beim Start.

| Schlüssel | Quelle | Wirkung, wenn extern |
|---|---|---|
| `stundenplan` | zentraler Stundenplan, Alma-Stundenplan | `zentral.js` holt und wendet den zentralen Stundenplan nicht an; `alma.js` holt und schreibt nie (`aktualisieren`, `verbinden`, damit auch Befehle, Knöpfe und Verbindungen) und sagt nur „Dein Stundenplan kommt über deinen Uni-Abgleich.“ |
| `ilias-dateien` | Downloads aus ILIAS | `ilias.js` lädt nie Dateien, mit Zugang nur die Übungsgruppen (siehe „ILIAS-Unterlagen“) |
| `ilias-gruppen` | Übungsgruppen aus ILIAS | kein Gruppenabgleich; mit `ilias-dateien` zusammen gar kein ILIAS-Lauf |
| `ilias-kalender` | Abgaben aus dem ILIAS-Kalender | `ilias-kalender.js` holt und schreibt nie (Zeitplan, Knopf, Verbinden); die Zeile sagt nur „Deine Abgaben aus ILIAS kommen über deinen Uni-Abgleich.“ |
| `alma-konto`, `volltext` | Noten und Prüfungsanmeldungen aus Alma, Textfassungen der PDFs | die Funktion bleibt aus (für die kommenden Funktionen) |

Regel: Steht `quellen_extern` (Liste, `types.json`: multitext) in `System/Einstellungen.md`, entscheidet sie, auch leer;
Schreibweise egal, unbekannte Einträge zählen nicht, `quellen_extern:` ohne Wert gilt als nicht gesetzt. Ohne Liste gilt beim
eigenen Uni-Abgleich (`eigenerAbgleich`: `System/Skripte/abgleich.js` im Tresor oder `ilias_unterlagen: extern`) alles außer
`ilias-gruppen` als extern: Die Übungsgruppen prüft dort das Plugin selbst, der eigene Abgleich legt keine Gruppen-Notizen an.
Ohne eigenen Abgleich ist nichts extern. Fehler beim Lesen gelten als „nichts extern“ (wie bisher `eigenerAbgleich`).
`eigenerAbgleich` selbst entscheidet nur noch, ob es einen eigenen Abgleich gibt (z. B. „Bitte prüfen“ mit seinem Protokoll).

**Gemischte Fassungen (seit 0.4.6):** Der Sync liefert Skripte einzeln, und `eba.js` bis 0.4.4 kennt nur `eigenerAbgleich`. Fragte
ein neues Skript dann `eba.quelleExtern` direkt, hielte es jede Quelle für seine, während ein anderes Gerät sie für extern hält
(zwei Schreiber). Darum fragen alle Skripte über `Q.extern(eba, schluessel, existiert, einstellungen)` (`quellen.js`): mit
`eba.quelleExtern`, sonst dieselbe Regel dort (Liste, sonst eigener Abgleich ohne `ilias-gruppen`). Ohne Liste entscheidet jedes
Gerät gleich, auch eines mit 0.4.4 (`stundenplan` und `ilias-dateien` beim eigenen Abgleich extern, `ilias-gruppen` nie; die
Quellen seit 0.4.5 schreibt es gar nicht). Nur in der Hülle eines eigenen Uni-Abgleichs ohne `quellen.js` fragt `alma.js`
`eba.quelleExtern` direkt (dort liegt die passende `eba.js`). Tests: `tests/quellen-extern.test.js`, dazu die Fälle in `ilias.test.js`, `ilias-gruppen.test.js`, `stundenplan.test.js` und
`verbindungen.test.js`.

## Abrufer-Sperre (`sperre.js`, seit 0.4.5): ein Schreiber für alle Quellen

Was eine Quelle in den Tresor schreibt, schreibt nur ein Gerät. `sperre.js` ist der gemeinsame Lock dafür (Bibliothek, kein
Netz, keine Zeitgeber). Noten & Anmeldungen, ILIAS (`ilias-abruf.json`, Dateiname wie bisher), Alma-Stundenplan
(`alma-abruf.json`), Volltext (`volltext-abruf.json`, mit Computer-Vorrang) und der eigene Server (`server.js`,
`server-abruf.json`) nutzen ihn; die zentralen Daten ihre ältere Fassung mit denselben Regeln und Werten (nur für die
Übernahme).

```
ctx.user.sperre.erzeugen({ io: { lesen(pfad), schreiben(pfad, text) }, quelle | pfad, geraetId(), jetzt(), mobil,
                           uebernahme = 80 Min., puls = 50 Min., computerVorrang = false })
  → { pruefen() → { hier, anderes, darf, sperre }, nehmen({ erzwingen }) → bool, puls() → bool, freigeben() → bool, pfad }
ctx.user.sperre.pfadVon(quelle) → "System/Daten/<quelle>-abruf.json"     ctx.user.sperre.K → { UEBERNAHME, PULS, ORDNER }
```

- **Datei** (synchronisiert, in `.gitignore`, `release.py` und `pruefen.py`): `{ geraet, seit, zuletzt, mobil, frei? }`. Weitere
  Felder einer Quelle in derselben Datei (z. B. `angewendet` in `abruf.json` der zentralen Daten) bleiben beim Schreiben
  erhalten. Unlesbar = keine Sperre.
- **Regeln:** `hier` = dieses Gerät hält sie; `anderes` = ein anderes Gerät hält sie und war vor höchstens `uebernahme` aktiv
  (Stille-Grenze, danach darf jedes Gerät übernehmen); `darf = !anderes`. `nehmen` schreibt nur bei Wechsel, nach `frei`, bei
  anderer Geräteart oder wenn `zuletzt` älter als `puls` ist (nicht bei jedem Lauf). `nehmen({ erzwingen: true })` ist der Knopf
  „Hier aktualisieren“. `puls()` während langer Läufe; `false` heißt: ein anderes Gerät hat übernommen, nichts mehr
  schreiben. `freigeben()` setzt `frei: true` (Trennen, Ausschalten, Löschen), ein anderes Gerät übernimmt sofort;
  `freigeben({ erzwingen: true })` auch eine fremde Sperre, deren Halter laut Aufrufer schweigt (ILIAS: verwaiste
  Gruppen-Notizen), danach steht sie frei auf diesem Gerät. `computerVorrang` (Volltext): Ein Computer löst ein iPhone/iPad sofort
  ab, nie umgekehrt.
- **Weiche Sperre:** Über einen langsamen Sync können sich zwei Geräte kurz überschneiden. Darum schreibt jede Quelle nur, was
  aus denselben Eingaben gleich herauskommt.
- **Tests:** `tests/sperre.test.js` (auch: Vorgaben gleich `ilias.js`, damit die Werte nicht auseinanderlaufen).

## Quellen-Vertrag (`quellen.js`, seit 0.4.5): Pflicht für jede Quelle

Jede Quelle, die Daten in den Tresor bringt (zentrale Daten, ILIAS, Alma-Stundenplan, Noten & Anmeldungen, Volltext; künftig
ILIAS-Kalender und eigener Server), hält sich an dieselben sieben Regeln. Eine neue Quelle baut nichts davon selbst; was fehlt,
kommt in `quellen.js` (Bibliothek, `ctx.user.quellen`, startet nichts außer den Zeitgebern von `planen`). Tests:
`tests/quellen.test.js`.

```
Q = ctx.user.quellen
Q.statusForm(x) / Q.nachLauf(stand, { ok, fehler, warnungen }, jetztIso) / Q.vorText(iso, jetztMs)
Q.planen(ctx, { takt, zurueck, backoff, start, lauf, versucht? }) → { jetzt(grund), spaeter(ms), stand() }   Q.zeitplan(o) (rein)
Q.extern(eba, schluessel, existiert, einstellungen) → bool
Q.besitz(fm) → { quelle, id } | null      Q.idFeld(quelle)      Q.marke(quelle, id)
Q.meineNotizen(text) / Q.unberuehrt(fm, text) / Q.wegfall(fm, text) / Q.zuViel(weg, alle, min) / Q.kurzHash(x) /
  Q.geloescht(angewendet, id, hash) / Q.dubletten(gruppe) / Q.doppelGruppen(liste, idVon) / Q.meineMischen(text, weitere)
Q.melden(ctx, quelle, fn) / Q.meldungen(ctx) / Q.meldenNeu(ctx) / Q.beiMeldung(ctx, fn)
Q.papierkorb(app, datei, { lokal }) (der eine Papierkorb, siehe „Bedien-Bausteine“)
Q.verbindung({ hier, sperre, geraet, jetztMs, grenze }) → { art: hier | anderswo | nein, zuletzt }   Q.K.VERBUNDEN_GRENZE
```

1. **Status** in einer Form: `status()` liefert `{ zustand, geprueft, fehler, fehlerZeit, warnungen }` (dazu Eigenes der
   Quelle). `geprueft` = letzter erfolgreicher Lauf, `fehler` = ein Satz für Nutzer:innen, der stehen bleibt (gerätelokal), bis
   ein Lauf klappt (`nachLauf`), `warnungen` = Sätze des letzten Laufs. Nie Noten, Kurs- oder Dateinamen, nie Passwörter. Die Zeile
   unter Verbindungen formatiert `verbindungen.js` an einer Stelle; Zeitwörter („gerade eben“, „vor 5 Min.“, „vor 3 Std.“) nur aus
   `vorText`. Wortwahl nach Entscheidung E1 des Konsistenz-Audits: Daten holt man mit **Aktualisieren**.
2. **Ein Zeitplan:** `planen(ctx, { takt, zurueck, backoff, start, lauf })` legt die Zeitgeber über die Helfer des aufrufenden
   Skripts an. Erster Lauf, wenn der metadataCache eingelesen ist, nach `start` (Vorgabe 20 s + Zufall bis 2 Min.), danach je
   Lauf neu geplant: Erfolg → `takt`; Fehler → `backoff[n − 1]` beim n-ten Fehler in Folge (der letzte Wert gilt weiter, keiner
   länger als `takt`); zurück in der App (`visibilitychange`) und letzter Versuch länger als `zurueck` her → in 5 s. `lauf`
   liefert `true` (geklappt), `false` (Fehler) oder `null` (nichts zu tun); eine Ausnahme zählt als Fehler. Nie zwei Läufe
   zugleich. Testschalter je Quelle (`plugin.test…Aus`) prüft `lauf` selbst.
3. **Ein Schreiber:** `sperre.js` (siehe „Abrufer-Sperre“). Ein Knopf, den du tippst, übernimmt (`nehmen({ erzwingen: true })`,
   in der Zeile „Hier aktualisieren“, wenn gerade ein anderes Gerät schreibt).
4. **Quellen außerhalb des Plugins:** `eba.quelleExtern(schluessel, …)` über `Q.extern(eba, …)` fragt die Abruf-Funktion selbst
   bei jedem Lauf, nicht nur die Oberfläche (Befehle, Knöpfe und Zeitplan laufen alle durch sie).
5. **Besitzmarke:** Eine erzeugte Notiz trägt `herkunft: <quelle>` und das Id-Feld der Quelle (`Q.idFeld`: neue Quellen
   `<quelle>_id`; ältere Namen bleiben gültig: `zentral_id`, `alma_schluessel`, `ilias_gruppe`, `gruppe_id`; ohne `herkunft`
   `abgleich_id` des eigenen Uni-Abgleichs und `volltext_von: plugin` der Textfassungen; der eigene Server `herkunft: claude` +
   `claude_id`). Eine Quelle schreibt, benennt um oder löscht nur Notizen mit ihrer Marke (Ausnahmen, die die Quelle dokumentiert:
   Übergabe nach id, Alma verknüpft eigene Stundenplan-Notizen). Das Feld `quelle` ist nur zum Lesen da, nie Besitz.
6. **Ein Lebenslauf erzeugter Notizen:** *Von dir gelöscht* → Grabstein: `angewendet` (id → `kurzHash` des Eintrags, in der
   synchronisierten Sperr-Datei der Quelle, nur der Schreiber schreibt) merkt, was als Notiz geschrieben wurde; fehlt die Notiz
   und ist der Eintrag unverändert, kommt sie nicht wieder (`geloescht`). *In der Quelle weg* → `wegfall`: unberührt (nicht
   erledigt, kein eigener Text) in den einen Papierkorb (`Q.papierkorb`, siehe „Bedien-Bausteine“), sonst „(entfällt)“ mit `entfaellt: true`; fällt auf einmal mehr als die
   Hälfte weg, gilt keiner als weggefallen (`zuViel`). *Dein Text* steht unter `## Meine Notizen` (Stundenplan-Notizen vor 0.4.6:
   `## Notizen`; `meineNotizen` kennt beide) und bleibt bei jedem Schreiben. *Doppel* einer id (Sync-Verzug,
   Konfliktkopie) führt der Schreiber zusammen wie `termine-sync.py` des Uni-Abgleichs: Der kürzeste Dateiname bleibt,
   `erledigt: true` gewinnt, eigene Zeilen der anderen kommen dazu, die anderen in den Papierkorb (`dubletten`).
7. **Meldekanal „Bitte prüfen“:** Was nur du lösen kannst (Anmeldung abgelehnt, Warnungen eines Laufs, Stundenplan-Notiz fehlt in
   Alma), meldet die Quelle mit `Q.melden(ctx, quelle, fn)`, `fn()` → `[{ text: "**Titel** · Rest", pfad, anker? }]` ohne
   persönliche Werte; nach einem Lauf `Q.meldenNeu(ctx)`. `bitte-pruefen.js` zeigt alle Punkte auf dem Dashboard (Reihenfolge
   `K.REIHE`), ein Tipp öffnet `pfad`. Hinweise (Notice) nur nach deinem Tipp, nie vom Zeitplan.

**Verbunden in diesem Tresor (seit 0.4.7, `Q.verbindung`):** Link und Passwort einer Quelle liegen nur auf dem Gerät, das verbunden
ist; die Daten kommen über den Sync auf alle. Ob ein anderes Gerät verbunden ist, sagt die Sperre der Quelle: Ein anderes Gerät hält
sie, sie ist nicht frei, und es war vor höchstens `K.VERBUNDEN_GRENZE` (7 Tage) aktiv → `anderswo` mit `zuletzt`; sonst `nein` (nie
verbunden, getrennt, länger still). Nur für die Anzeige (siehe „Verbindungen und Schloss“); wer schreibt, regelt weiter die Sperre.

**Stand der Quellen (18.10.2026):**

| Quelle | Zeitplan (`Q.planen`) | Sperre (`sperre.js`) | Status | Besitzmarke | Lebenslauf | „Bitte prüfen“ |
|---|---|---|---|---|---|---|
| Zentrale Daten (`zentral.js`) | 20 s + 0–2 Min., alle 15 Min., zurück > 10 Min. | `abruf.json` (Datei wie bisher; Übernahme und Puls über `sperre.js`, `angewendet` daneben) | gemeinsame Form, `geprueft` = letzter Erfolg | `herkunft: zentral` + `zentral_id` | Grabstein, Wegfall, Massenschutz, Doppel | – (Warnungen in der Zeile) |
| ILIAS-Unterlagen und Übungsgruppen (`ilias.js`) | 20 s + 0–2 Min., stündlich, zurück > 60 Min.; Auftrag für deine Läufe | `ilias-abruf.json` (wie bisher) | gemeinsame Form | Begleitnotizen `ilias_id`; Gruppen `herkunft: ilias-gruppe` + `ilias_gruppe` | Dateien: gelöscht bleibt gelöscht; Gruppen: Grabstein `notiz`, Wegfall nach zwei Läufen | abgelehnte Anmeldung, Warnungen |
| Alma-Stundenplan (`alma.js`) | 30 s + 0–2 Min., stündlich, Backoff 5/15/30 Min., zurück > 60 Min. | `alma-abruf.json` (neu, mit `angewendet`) | gemeinsame Form, Fehler bleibt | `herkunft: alma` + `alma_schluessel` | Grabstein, Wegfall, Doppel, eigene Notizen nie löschen | eigene Notiz fehlt in Alma |
| Noten & Anmeldungen (`alma-konto.js`, Beta) | Blick 60–180 s, alle 30 Min., zurück > 60 Min. (fällig nach 12 bzw. 3 Std.) | `alma-konto-abruf.json` | gemeinsame Form | keine Notizen (Modulfeld nach Tipp) | Grabstein `alma-konto-aus.json` fürs Löschen | Vorschläge, fehlende Anmeldung, abgelehnt |
| Volltext der PDFs (`volltext.js`) | nach 5 Min. Ruhe, alle 30 Min., zurück > 30 Min., Stapel | `volltext-abruf.json` mit Computer-Vorrang | gemeinsame Form | `volltext_von: plugin` (+ `quelle`) | Notiz ohne PDF nur, wenn die PDF wirklich weg ist (Zeuge, 3 Läufe, 2 Std.): Papierkorb oder „(PDF fehlt)“, Massenschutz, Doppel | – |
| ILIAS-Kalender (`ilias-kalender.js`, seit 18.10.2026) | 20 s + 0–100 s, alle 2 Std., Backoff 15/30/60 Min., zurück > 2 Std. | `ilias-kalender-abruf.json` (mit `angewendet`) | gemeinsame Form, Fehler bleibt | `herkunft: ilias-kalender` + `ilias_kalender_id` | Grabstein, Wegfall nur künftiger Abgaben, Massenschutz, Doppel, keine Doppel mit anderen Fristen | Link gilt nicht mehr, Warnungen |
| Eigener Server (`server.js`) | 30 s + 0–2 Min., alle 15 Min., Backoff 2/5 Min., zurück > 10 Min. | `server-abruf.json` (mit `angewendet`) | gemeinsame Form, Fehler bleibt | `herkunft: claude` + `claude_id` | Grabstein, Doppel einer id, unberührte Notiz weicht einem späteren zentralen Termin, Absage als „(entfällt)“ | Gerät neu verbinden, Claude neu verbinden, Uni-Passwort nicht angenommen |

**Was eine neue Quelle nutzt (so gebaut: der ILIAS-Kalender, `ilias-kalender.js`, siehe „ILIAS-Kalender“):** `Q.planen` für alle automatischen Läufe;
`ctx.user.sperre.erzeugen({ quelle: "ilias-kalender", … })` mit Grabsteinen `angewendet` in derselben Datei
(`ilias-kalender-abruf.json`; `.gitignore`, `release.py`, `pruefen.py` und `spiegel.py` kennen das Muster schon); bei jedem Lauf
`eba.quelleExtern("ilias-kalender", …)`; `status()` in der gemeinsamen Form mit `Q.nachLauf` für den gerätelokalen Stand; Zeile
über `standText`/`quelleZeile` in `verbindungen.js` (Knopf „Aktualisieren“, bei einem anderen Gerät „Hier aktualisieren“);
Notizen mit `Q.marke("ilias-kalender", id)` (`herkunft: ilias-kalender` + `ilias_kalender_id`), Wegfall über `Q.wegfall`,
`Q.zuViel`, Doppel über `Q.dubletten`, eigener Text unter `## Meine Notizen`; Punkte, die nur du lösen kannst (Link abgelaufen),
mit `Q.melden(ctx, "ilias-kalender", …)`. Übernimmt ein eigener Server später eine dieser Quellen (z. B. den
ILIAS-Kalender), steht sie in `quellen_extern`; seine Termine aus Mails schreibt `server.js` mit `herkunft: claude` +
`claude_id` (siehe „Eigener Server mit Claude“).

## Eigener Server mit Claude (`server.js`)

Gegenstelle zum Server-Paket in `server/` (dort `README.md`): Ein eigener Server findet mit Claude Termine und Hinweise; das
Plugin holt sie ab. Ohne Verbindung geht nichts ins Netz; unter Verbindungen steht dann nur die leise Zeile „Für Technische“
(Fenster mit Schritten und **Prompt kopieren**, `ctx.server.PROMPT`, gleicher Wortlaut wie im README).

- **Verbinden:** Aktion `server-verbinden` (Link vom Server: `adresse`, `code`), immer mit Rückfrage. Der Einmal-Code geht per
  `POST /v1/verbinden` an den Server, zurück kommen Zugangs- und Datenschlüssel (je 32 Byte). Beides liegt mit der Adresse im
  Schlüsselbund (`app.secretStorage`, Eintrag je Tresor wie in `ilias.js`). Adresse nur `https://<host>` ohne Pfad, Port oder
  Anmeldung (Test: `plugin.testServerLokal` erlaubt `http://127.0.0.1`).
- **Abruf** (`Q.planen`: nach 30 s bis 2,5 Min., dann alle 15 Min., nach Fehlern nach 2 bzw. 5 Min., zurück in der App nach
  über 10 Min.; Knopf **Aktualisieren**): `GET /v1/eingang` mit dem
  Zugangsschlüssel → Paket `{ schema, zweck, iv, daten }`, AES-256-GCM über Web Crypto, Zusatzdaten
  `studium-autopilot/kanal/v1/eingang` (Gegenstück zu `server/kanal.mjs`) → noch nicht übernommene Eingang-Dateien. Jede
  wird einmal übernommen, danach `POST /v1/stand` (verschlüsselt, Zweck `stand`: Modulcodes aus `ctx.zentral.filterBauen()`,
  Studienbeginn, Variante, `takt` (`server_uni_postfach` 15 | 30 | 60 und `server_gmail` 3 | 1 | 0 aus den Einstellungen, sonst
  15 und 3; im Fenster als zwei Auswahlfelder, Änderung geht beim nächsten Abruf mit), übernommene Dateien, dazu `tresor`: Termine von vor 30 Tagen bis in einem Jahr mit Titel, Datum,
  Kategorie, Modulcode, Herkunft und Haken sowie die offenen To-dos aus `todos.js` mit Modulcode, Frist, Kennung `id` (`t-` + `Q.kurzHash(Pfad + Zeile)`), `pfad` und
  `aenderbar` (offene Aufgabe unter „Zu tun“ einer Begleitnotiz), ohne alles, was nach
  Zugangsdaten aussieht; der Server löscht die Dateien und legt den Auszug Claude als `tresor.json` hin). Nur ein Gerät übernimmt: `sperre.js` mit Quelle
  `server` (`System/Daten/server-abruf.json`), nur Geräte mit Verbindung; hält ein anderes Gerät sie, zeigt die Zeile
  **Hier aktualisieren** (`uebernehmen`, `nehmen({ erzwingen: true })`). Höchstens 50 neue Notizen je Abruf; der Rest bleibt auf dem Server (die Datei gilt erst als
  übernommen, wenn alles da ist, Hinweise kommen dann einmal). Neue Termine, die schon vorbei sind, entstehen nicht.
- **Termine:** geprüft mit `ctx.zentral.terminePruefen`, ids nur `c-` + 20 Hex-Zeichen. Notiz über `ctx.zentral.notizText`,
  danach `herkunft: claude` und `claude_id` statt der zentralen Felder; `zentral.js` fasst sie darum nie an. Doppel: Steht ein
  zentraler oder eigener Termin am selben Tag (±1) mit ähnlichem Titel da (`aehnlich`: Wörter ohne Füllwörter, Zahlen müssen
  gleich sein), entsteht keine Notiz. Erscheint derselbe Termin später zentral, kommt die unberührte Notiz vom Server in den
  Papierkorb. Absagen (`entfaellt`) wie bei den zentralen Daten, neues Datum benennt im selben Ordner um, gelöscht bleibt
  gelöscht, bis sich der Termin ändert (Grabstein `angewendet`: id → `Q.kurzHash`, wie bei den anderen Quellen in der
  Sperr-Datei `server-abruf.json`). Zwei Notizen derselben `claude_id` führt der Abruf mit `Q.dubletten` zusammen.
- **Begleitnotizen:** Zu Lehrmaterial (`art` Folien, Skript, Übung, Tutorium, Lösung, Altklausur, Literatur), dessen „Das Wichtigste“ fehlt
  oder nur Platzhalter hat und dessen PDF eine Textfassung mit Text hat (`volltext.js`), schickt der Abruf die Textfassung als
  Text mit `[S. N]` (`volltextText`) verschlüsselt an `POST /v1/unterlagen` (Zweck `unterlagen`), bis zu 9 je Abruf in Anfragen zu 3, neueste PDF zuerst (schon
  gesendete liest `unterlagenObs` gar nicht erst; eine abgelehnte Anfrage beendet den Abruf, der Rest kommt beim nächsten), jede PDF
  einmal (`server.json` `gesendet`: SHA-256 → Datum); aus mit `server_unterlagen: aus`. Claude schreibt die Einträge
  (`server/skill/studium-autopilot/begleitnotiz.md`), der nächste Abruf trägt sie mit `begleitnotizErgaenzen` in die Notiz neben
  der PDF ein (gleicher Name `.md`, sonst die Unterlage, deren `datei` auf die PDF zeigt): fehlende Abschnitte über dem
  PDF-Kasten in der Reihenfolge „Das Wichtigste“, „Zu tun“, „Offene Fragen“; Platzhalter älterer Notizen werden ersetzt;
  „Das Wichtigste“ nur, wenn dort nichts steht, bei den anderen nur, was fehlt. Seiten als `[[X.pdf#page=N|S. N]]`, Fristen
  „(bis TT.MM.)“. Dieselbe Lieferung nie zweimal (`server.json` `begleitet`: PDF-Pfad → `Q.kurzHash`); fehlt die Notiz, entsteht
  keine.
- **Doppelte To-dos:** Claude nennt Paare `todo_doppel: [{ behalten, weg }]` aus den Kennungen des Auszugs. `todoDoppelAnwenden`
  liest den Auszug frisch und ändert nur „weg“, wenn es eine offene Aufgabe unter „Zu tun“ einer Begleitnotiz ist und die Zeile
  noch genau so dasteht: aus `- [ ] Text` wird `- Text – steht schon in [[Pfad|Name]]`. Keine Ketten, nie abgehakt, nie
  gelöscht; die Zahl steht im Lauf (`todos`) und im Hinweis nach **Aktualisieren**.
- **`server.json`** (synchronisiert, schreibt nur das übernehmende Gerät): `{ schema, erledigt, laeufe, hinweise }`.
  Persönlich (Hinweise aus Mails): wie `server-abruf.json` nie im Release (`server*.json` in `release.py`, `pruefen.py`,
  `.gitignore`).
- **Status, Zeile und Fenster:** `ctx.server.status()` in der Form des Vertrags (`zustand`: `nicht-verbunden` | `anderswo` |
  `laeuft` | `anderes-geraet` | `fehler` | `an`; gerätelokal über `Q.nachLauf`). `ctx.server.zeile()` liefert die Zeile im
  Format von Noten & Anmeldungen (`{ text, symbol, pille, knopf, link }`, HTML an einer Stelle: `quelleZeile` in
  `verbindungen.js`), aus dem öffentlichen `GET /v1/status` (höchstens alle 5 Min., nur Werte aus festen Listen) und dem letzten
  Abruf; Fehler zuerst (Gerät unbekannt → neu verbinden, Claude nicht verbunden, Uni-Passwort nicht angenommen, Limit), der Stand-Satz aus
  `ctx.verbindungen.standText` wie bei allen Quellen, dahinter der letzte Lauf des Servers und neue Termine. Was nur du lösen kannst, sagt die Zeile selbst (Pille „prüfen“);
  der Server meldet sich nicht in „Bitte prüfen“ (neue Funktionen schieben Nutzern keine Prüf-Listen zu, sie zeigen ihren Zustand selbst). Neue Hinweise von Claude
  (noch nicht im Fenster gesehen, höchstens 14 Tage alt; „gesehen“ merkt sich jedes Gerät selbst, Kurz-Hashes in
  `eba-server-gesehen`, denn `server.json` schreibt nur das übernehmende Gerät): Der Link der Zeile heißt dann „Hinweise ansehen“;
  das Fenster setzt sie auf gesehen.
  **Mails durchsuchen** (Knopf im Fenster und Befehl `server-durchsuchen`) startet einen Claude-Lauf auf dem Server
  (`POST /v1/anstoss`, höchstens alle 10 Min., sonst „Wieder möglich ab …“); solange der Status `claude_lauf` „wartet“ oder
  „laeuft“ meldet, sagt die Zeile „Claude durchsucht gerade …“, und der nächste Abruf kommt nach 5 Min. (`plan.spaeter`).
  Hinweise (`ctx.hinweis`) nur nach **Aktualisieren**, nie vom Zeitplan; Notizen weg nur über den einen Papierkorb. `ctx.server.fensterInhalt(el)`: Stand, Hinweise, letzte
  Übernahmen, „Dieses Gerät trennen“.
- Testeinstieg: `ctx.server.erzeugen(abh)` (Netz, Tresor, Schlüsselbund als Ersatz); `tests/server-plugin.test.js` läuft gegen
  den echten `server/dienst.mjs` auf einem freien Port. `plugin.testServerAus` schaltet den automatischen Abruf ab.

## Bedien-Bausteine (seit 0.4.6): Pflicht für jede Funktion

Bis 0.4.5 bediente sich jeder Teil der App anders: Anlegen über Ketten einzelner Fragen, Abhaken je Notiztyp anders, Löschen mit
fünf Sicherheitsstufen, sechs Wege, eine Notiz zu öffnen (Konsistenz-Audit, Schritt 4). Seitdem gibt es für jede dieser Aufgaben
einen Baustein. Eine neue Funktion nimmt ihn, statt etwas Eigenes zu bauen; fehlt etwas, kommt es in den Baustein.

### Fenster „Neu …“ (`formular.js`, `ctx.formular`)

Jede Aktion, die etwas anlegt, fragt in **einem** Fenster mit allen Feldern und ihren Vorgaben: Neue Vorlesungsnotiz (Modul und
Thema; ohne Fenster nur, wenn gerade genau eine Lehrveranstaltung läuft und kein Modul vorgewählt ist), Neues Übungsblatt, Neuer Termin, Neue Lehrveranstaltung,
Neuer SQ-Kurs, Neues eigenes Modul, Neuer Kartenstapel und beim Einordnen „Ändern“ einer Unterlage. Esc, × und **Abbrechen**
legen nichts an; mit der Ordner-Automatik verschwindet auch die leere Notiz wieder (`eba.abbrechen`). Bis 0.4.5 war das eine
Kette aus Eingabe- und Auswahlfenstern (bis zu fünf), in der Esc mal abbrach und mal die Vorgabe nahm (Fehler 24).

```
ctx.formular({ titel: "Neues Übungsblatt", knopf = "Anlegen", felder: [Feld], pruefen?(werte) → { feld, fehler } | null })
  → Promise<{ name: Wert } | null>
Feld = { name, titel, art: "text" | "zahl" | "datum" | "zeitraum" | "uhrzeit" | "auswahl", vorgabe, optionen: [{ wert, text, gruppe }],
         hilfe, platzhalter, pflicht, fehlt, wenn(werte), ct, ganz, min, max, muster, falsch }
eba.modulFeld({ titel, optional, laufend, vorgabe }) → Feld „Modul“ (Läuft gerade · Dieses Semester · Alle Module)
```

- **Vorgaben**: Jedes Feld hat eine (Nummer = nächste freie, Abgabe in einer Woche, Beginn 10:15, ECTS 6). Eine Vorgabe als
  Funktion folgt den anderen Feldern, bis du das Feld selbst änderst (Ende = Beginn + 90 Min., ECTS je Anbieter, Art aus den
  Wörtern im Titel). `wenn` blendet ein Feld aus (Schwerpunktbereich nur beim Teil Schwerpunkt); es liefert dann `null`.
- **Lesen**: Datum und Zeitraum wie überall über `eba.datumLesen`/`eba.zeitraumLesen` („27.10.“, „+7“, „12.11.–15.11.“), unter
  dem Feld steht, was erkannt wurde („Mo 26.10. · in 7 Tagen“); Uhrzeit mit Doppelpunkt, Punkt oder Komma, mit `ct` heißt „14“
  14:15; Zahlen mit Komma. Ein Fehler steht als Satz unter seinem Feld (`.eba-form-hilfe.fehler`), angelegt wird erst, wenn alles
  stimmt. `pruefen` prüft über mehrere Felder (Modulcode schon vergeben, Ende vor Beginn).
- **Gestalt**: `eba-modal eba-modal-neu` mit den Bausteinen von „Deine Angaben“ (`eba-form`, `eba-form-zeile`), Hauptknopf rechts,
  auf dem iPhone untereinander (`eba-core.css` Abschnitte 43 und 64). Module als Liste mit Überschriften statt Zeichen („●“, „▶“).
- **Tastatur** (iPhone, iPad): Ist das erste Feld ein leeres Eingabefeld, liegt der Cursor darin; beginnt das Fenster mit einer
  Auswahl, springt keine Tastatur auf. Felder 44 px hoch mit 16 px Schrift (Safari zoomt sonst), ein Feld mit Fokus rollt über die
  Tastatur, Enter legt an.
- **Tests**: `plugin.testAntworten` wie bei Eingabe und Auswahl (`null` = Esc, ein Objekt = Eingaben je Feld, Auswahl als Wert,
  Text oder `{ index }`); ein Fehler legt nichts an und steht in `plugin.testProtokoll`. `tests/formular.test.js` (Lesen, Vorgaben,
  versteckte Felder), `tests/anlegen.test.js` (jede Anlege-Aktion; nie eine Kette aus Fragen).
- `ctx.system.prompt` bleibt für einzelne Angaben (Seitenlink, Alma-Link), nie zum Anlegen. Das Fenster **Neue Karte**
  (`karten.js`) ist ein Formular aus denselben Bausteinen, bleibt aber offen für die nächste Karte.

### Kopf-Karte jeder Notiz (`kopf.js`)

Unter dem Titel jeder Notiz steht ihr Kopf mit **genau einem** Status-Knopf, in der Gestalt der Vorlesungsnotiz (`.eba-vorl-karte`,
links ein Label „Art · Modul · Tag“, rechts der Knopf). Vorlesung und Übungsblatt haben ihn im Text (Codeblöcke `eba-vorlesung`,
`eba-uebungsblatt`); für die übrigen Notiztypen zeichnet ihn `kopf.js`, ohne die Notiz zu ändern: in der Leseansicht über den
Post-Processor im Abschnitt des ersten `# Titels` (nicht in Einbettungen und Hover-Vorschauen), in der Bearbeitungsansicht als
Block-Widget unter dem Titel (`StateField`, Block-Widgets gehen nicht über `ViewPlugin`). Bis 0.4.5 ging der Status dieser Notizen nur
über die Eigenschaften, die in der Leseansicht gar nicht zu sehen sind.

| Notiztyp | Knopf | schreibt |
|---|---|---|
| Vorlesung | Nacharbeit offen ⇄ Nachgearbeitet | `nachgearbeitet` (`vorlesung.js`) |
| Übungsblatt | Noch offen → Abgegeben → Korrigiert | `status` (`vorlesung.js`) |
| Termin | Offen ⇄ Erledigt | `erledigt` |
| Unterlage (Begleitnotiz) | Noch nicht gelesen ⇄ Gelesen („bearbeitet“ zählt als gelesen) | `status` |
| SQ-Kurs | geplant · angemeldet · zugelassen · bestanden (Menü am Knopf) | `status` |
| Lehrveranstaltung | Im Stundenplan ⇄ Besuche ich nicht | `stundenplan_ausgeblendet` bzw. `besuche_nicht` (`ctx.modell.besuchtNicht`); zentral über die Aktion `besuche-nicht` |

- **Farbe** nur aus `ctx.modell.statusArt(typ, wort)`: `ok` und letzte Stufe gefüllt (`fertig`), `ok` davor getönt im Akzent
  (`zwischen`), sonst warm wie „Nacharbeit offen“; „Besuche ich nicht“ leise. Kein Skript wählt die Farbe selbst.
- **Rückmeldung**: Der Knopf zeigt den neuen Stand selbst, ein Hinweis kommt nicht. Nur was danach woanders fehlt („Besuche ich
  nicht“: der Stundenplan), meldet sich mit Hinweis und **Rückgängig** (siehe „Rückgängig statt Rückfrage“).
- Geschrieben wird nur nach einem Tipp, mit `processFrontMatter`; neu gezeichnet bei Änderungen an der Notiz und an den
  Einstellungen. Die zentralen Stundenplan-Notizen tragen den Textlink „Besuche ich nicht“ nicht mehr (`zentral.js`), ein neuer SQ-Kurs
  nicht mehr den Satz „Stand in den Eigenschaften pflegen“ (`notizen.js`).
- **Unterlagen unter Übung und Tutorium** (seit 20.10.2026): Die Stundenplan-Notiz eines Tutoriums (Feld `art` mit „Tutorium“)
  zeigt unter dem Kopf die Unterlagen der Art „Tutorium“ ihres Moduls (`code`), die einer Übung (auch „Übungsteil“) die der Art
  „Übung“, jeweils nur aus dem eigenen Bereich, als Chips wie die Vorlesungsnotiz (`.eba-vorl-links`): höchstens drei, höchste
  Nummer zuerst (das neueste Blatt), ohne Nummer (Aufgabenkatalog, Vorlage) danach; gibt es mehr, „Alle Unterlagen“ zur
  Modulseite. Tipp öffnet die Begleitnotiz. Ohne Unterlagen bleibt der Kopf eine Zeile. Neu gezeichnet auch, wenn sich eine
  Unterlage ändert oder wegfällt (`blaetterFuer`, reine Logik).
- Tests: `tests/kopf.test.js` (Stufen je Typ, Farbe aus `statusArt`, „Besuche ich nicht“ je Quelle, Unterlagen unter Übung und Tutorium). Stil: `eba-core.css` Abschnitt 64.2.
- **„⋯“ mit Eigenschaften** (seit 19.10.2026): Rechts im Kopf, auch bei Vorlesung und Übungsblatt (`ctx.kopf.mehr`). Die Eigenschaften
  der Notizen des Plugins stehen in keiner Ansicht mehr (Klasse `eba-notiz` aus `start.js` an Termin, Begleitnotiz, Lehrveranstaltung,
  Vorlesung, Übungsblatt, SQ-Kurs, Volltext; `eba-core.css` 25b); vorher stand in der Bearbeitungsansicht ein einsames
  „Properties“ mit Leerraum über dem Titel. **Eigenschaften** im Menü zeigt sie für diese Notiz aufgeklappt (Lese- und
  Bearbeitungsansicht, Klasse `eba-eigenschaften` am Tab), bis man den Punkt noch einmal tippt oder Obsidian neu startet; im
  Quelltextmodus und in deinen eigenen Notizen bleibt alles wie in Obsidian. `start.js` nimmt Klassen einer vorher im selben Tab
  gezeigten Notiz wieder ab (sonst trug eine eigene Notiz danach z. B. `eba-notiz` weiter). Der Modulcode im Kopf öffnet die Modulseite.
- **Leere Abschnitte** (seit 19.10.2026): Notizen des Plugins zeigen keine Überschrift `##` mit nur leeren Punkten (`- `, `- [ ] `)
  darunter und keine leere Überschrift, auch ältere nicht und solche, die der Uni-Abgleich schreibt (dort ist oft „Das Wichtigste“
  gefüllt und „Offene Fragen“ leer). Die Notiz ändert sich nicht: In der Leseansicht markiert der Post-Processor Überschriften
  (`eba-abschnitt`) und Listen aus leeren Punkten (`eba-leer`), ob eine Überschrift wegfällt, entscheidet das CSS am Nachbarn
  (bleibt richtig, wenn Obsidian nur die geänderte Liste neu zeichnet); in der Bearbeitungsansicht der Begleitnotizen fallen die Zeilen
  (`leereAbschnitte`, `eba-leer-zeile`) weg, solange der Cursor nicht darin steht. Andere Notizen zeigen ihre Überschriften dort
  weiter: Dort schreibst du hinein. Gefaltet auf Höhe 0 (`eba-core.css` 64.4), nie `display: none`.
- **Kapitel der Folien als Markdown** (`cssclasses: eba, eba-folien`; seit 19.10.2026 auf allen Geräten, vorher nur iPhone):
  `start.js` klappt jedes `##` außer „Das Wichtigste“, „Zu tun“ und „Offene Fragen“ beim ersten Öffnen je Gerät zu (Obsidians
  Faltung, `foldManager`). Die Leseansicht nimmt die Faltung erst an, wenn sie ihre Abschnitte kennt: `start.js` fasst bis zu 15 × 200 ms
  nach und speichert erst dann (sonst schrieb `onMarkdownFold` „nichts gefaltet“ darüber). Ein Tipp irgendwo auf die Kapitelzeile
  klappt in der Leseansicht auf und zu. Zugeklappte Kapitel stehen wie ein Inhaltsverzeichnis untereinander (`eba-core.css` 31);
  die Regel für leere Abschnitte (64.4) lässt eine zugeklappte Überschrift stehen, obwohl ihr gleich die nächste folgt.
- **Eckdaten** (seit 19.10.2026): Der Kasten „Eckdaten“ der Begleitnotizen bis 0.4.6 wiederholte den Kopf (Modul, Art, Semester)
  und trug „Öffnen ↗ · Größe ⇅“. Neue Begleitnotizen haben ihn nicht mehr; bei älteren entfernt der Post-Processor jede Zeile, die das
  Plugin geschrieben hat (`eckZeileErzeugt`), und blendet den leeren Kasten aus. Eigener Text darin bleibt stehen. Das gilt nur für
  Notizen mit PDF-Kasten (`hatPdfKasten`: eine PDF-Einbettung in einem Kasten), denn dort steht „Öffnen“. Bei Word, PowerPoint, Excel,
  ZIP oder einer sehr großen PDF ist „Öffnen ↗“ in den Eckdaten der einzige Weg zur Datei: Der Kasten bleibt, nur „Größe ⇅“ (Aktion
  `pdf` bis 0.4.6) fällt weg.

### Ändern nur im Modulfeld und im Kopf der Notiz (Entscheidung E4)

Tabellen und Listen zeigen nur an; ein Tipp auf eine Zeile öffnet ihre Notiz. Geändert wird an zwei Stellen: im Modulfeld
(`modul.js`: Status, Note, Versuch, Semester) und im Kopf der Notiz (siehe „Kopf-Karte“). Seit 0.4.6 zeichnet `tabellen.js` jede
Bases-Tabelle in einer Karte `[!eba-tabelle]` als Liste, auf allen Geräten und ohne Ausnahmen (vorher blieben am PC/iPad Tabellen
außerhalb von Modulseite, Noten & ECTS, Unterlagen und Stundenplan, „Mein Stand“ älterer Modulseiten, die Einstellungen und Karten
mit `handy-tabelle` bearbeitbar), und ein Kontrollkästchen steht als Pille da statt zum Antippen. Die Liste „Nachzuarbeiten“ des
Dashboards (`dashboard.js`, siehe „Dashboard“) zeigt Vorlesung und Datum ohne Kästchen; „Nachgearbeitet“ setzt der Kopf der Vorlesungsnotiz.

### Obsidian scheint nicht durch (`.obsidian/app.json`)

Seit 0.4.6 zeigt Obsidian keine Dateien, die es nicht öffnen kann (`showUnsupportedFiles: false`: JSON der Daten, Sicherungen,
`(neu X)`-Kopien), und **+** (neue Notiz) legt sie in `Vorlesungen/` an (`newFileLocation: folder`, `newFileFolderPath`): Die
Ordner-Automatik macht daraus eine Vorlesungsnotiz (läuft gerade etwas, sofort, sonst mit dem Fenster „Neue Vorlesungsnotiz“, auch
„Ohne Modul“); Abbrechen löscht die leere Notiz. Vorher legte **+** „Unbenannt.md“ im Stamm des Tresors an. Wer schon installiert
hat, bekommt beides über das Mischen der Einstellungen, aber nur, wenn noch die alten Vorgaben gelten (`update.js`, `VORGABE_NEU`,
`tests/update.test.js`); selbst Gewähltes bleibt. Weil das Update auf 0.4.6 noch der Planer von 0.4.4/0.4.5 plant (der das nicht
kennt), setzt die Reparatur danach einmal je Gerät dieselben Werte über Obsidians Einstellungen, nur wo noch der alte Wert gilt
(`vorgabenAnwenden`, Merker `eba-update-vorgabe-0.4.6`).

### Öffnen und Navigieren (`ctx.oeffnen`, `seitenleiste.js`, `start.js`)

- **Ein Weg zum Öffnen**: `ctx.oeffnen(ziel, { neu, quelle, zeile, cursor, modus, von })` im Kern (`main.js`). `ziel` ist eine Datei,
  ein Pfad oder ein Linktext (mit `#Überschrift`). Übersichtsseiten (`ctx.leseansicht.nurLesen`) und Begleitnotizen
  (`ctx.leseansicht.zuerstLesen`, seit 19.10.2026) öffnen in der Leseansicht, deine Notizen in der Bearbeitungsansicht; `modus`
  erzwingt eine Ansicht. Geöffnet wird im Tab, in dem getippt wurde (`von` bzw. der letzte
  Tipp, den der Kern im Capture-Modus merkt, weil Skripte `mousedown` oft selbst stoppen; nie in der Seitenleiste), sonst im aktiven;
  Zurück führt zurück, Strg/⌘ (`neu`) öffnet einen neuen Tab. Fokus und Cursor nur mit `cursor` (sonst springt auf iPhone und iPad die
  Tastatur auf). Vorher gab es sechs Wege (`openLinkText`, `getLeaf().openFile`, `blatt.openFile`, `ctx.oeffnen` …) mit
  verschiedener Ansicht; `tests/oeffnen.test.js` findet jeden anderen. Ausnahme: das Dashboard beim Start (`start.js`).
  Übergang nach dem Update: Auf Geräten, die das Update per Sync bekommen, läuft bis „Neu laden“ noch der alte Kern, dessen
  `ctx.oeffnen` (vor 0.4.6) nur Dateien kennt. Solange setzt `start.js` einen Ersatz mit denselben Regeln (Kernversion aus
  `plugin.manifest.version`), damit Zeilen und Kacheln auch vor dem Neuladen öffnen.
- **Von Übersichten zu deinen Notizen**: Geht ein Tab von einer gesperrten Seite (Dashboard, Studium/ …) zu deiner Notiz, auch über
  Obsidians eigene Links, öffnet sie in der Bearbeitungsansicht (`start.js`, Punkt 2; vorher nur, wenn der Tab vorher eine Notiz
  bearbeitet hatte).
- **Zeile antippen öffnet ihre Notiz**: Listen, Kalender, Zeitleiste, Raster, Tabellen als Liste und die **Kacheln des Dashboards**
  (`dashboard.js`, `data-pfad`: Frist und Prüfung ihre Notiz, ohne Frist Termine & Anmeldungen, ohne Prüfung Prüfungen, Semester den
  Studienverlauf, ECTS und Gesamtnote Noten & ECTS; vorher öffneten sie nichts), ebenso eine **Übungsgruppe** mit Notiz im Stundenplan
  (`gruppen.js`, `pfad`). Eine Nebenaktion steht als ein Knopf rechts in der Zeile („Meine“, „Abwählen“, „Lernen“), mehrere hinter
  „⋯“ mit Obsidians Menü (wie in der Kartenliste, `eba-lk-mehr`). Angebote öffnen ihre Seite im Browser, weil es dazu keine Notiz gibt.
- **Start**: Das Dashboard ist die Startseite, aber nicht mehr angeheftet (Entscheidung E6). Angeheftet hatte es schon das Startskript
  des Templater-Tresors, damit es bei jedem Start da ist; ein angehefteter Tab öffnet aber jeden Link in einem neuen Tab, Tabs stapelten
  sich, und Zurück führte nicht zum Dashboard. Beim Start zeigt der zuletzt benutzte Tab das Dashboard, wenn es nicht schon offen ist
  (die Notiz darin bleibt über Zurück erreichbar); die Anheftung früherer Fassungen nimmt `start.js` einmal je Gerät zurück
  (`eba-dashboard-frei`). Zurück zum Start geht jederzeit über **Dashboard** in der Übersicht.
- **Seitenleiste „Übersicht“** (seit 19.10.2026, `seitenleiste.js`): ein eigener Tab (`ItemView`, Typ `eba-uebersicht`) in Obsidians
  linker Seitenleiste, am PC neben der Notiz, auf iPhone und iPad die Schublade hinter dem Symbol oben links. Sie ersetzt das
  Raster-Menü, das bis 0.4.6 in Obsidians Kopfleiste jeder Notiz stand (`menue.js`, `view.addAction`); das Update entfernt
  `menue.js`, ein Gerät mit offener App nimmt das Symbol beim Löschen sofort weg (`skriptEntfernen` → `abmelden()`). Oben die
  Seiten aus `sichtbareZiele(ctx)` (`ZIELE`, einzige Liste; die Lesezeichen der Vorlage `.obsidian/bookmarks.json` folgen ihr,
  jede Seite hat ein eigenes Symbol, `tests/seitenleiste.test.js`), darunter „Dieses Semester“ mit den Modulen
  nach `diesesSemester` (`eba.js`, dieselbe Regel wie die Gruppe „Dieses Semester“ im Fenster „Neu …“), Modulcode statt Symbol. Im
  Akzent steht die Seite, die vorn offen ist, bei Notizen mit `code` (Unterlagen, Vorlesungen, Termine …) auch ihr Modul. Ein Tipp
  öffnet über `ctx.oeffnen` (nie in der Seitenleiste) und schließt auf iPhone und iPad die Schublade, wenn sie nicht angeheftet ist.
  Fehlt der Tab, legt das Skript ihn beim Start als ersten Tab der linken Seitenleiste an und wählt ihn aus (Obsidian merkt sich
  die Lage je Gerät in `workspace.json` bzw. `workspace-mobile.json`). Die Ansicht meldet sich aus dem Skript an; Obsidian baut
  Tabs eines Typs, der sich später anmeldet, selbst neu auf („view-registered“), darum überlebt der Tab Start und Hot-Reload
  ohne Eingriff in `main.js`. Das Symbol des Tabs ist ein eigenes SVG (`addIcon`, Strich als Attribut), nicht Obsidians
  `layout-grid`: über `setIcon` blieb es auf dem iPad leer. Stil: `eba-core.css` Abschnitt 66.

### PDF-Kasten (`pdfkasten.js`, seit 19.10.2026)

Der Kasten `> [!eba-pdf]- PDF` der Begleitnotizen ist ein Knopf: Ein Tipp auf die Kopfzeile klappt auf oder zu, so oft man will, in Lese-
und Bearbeitungsansicht. Vorher war er ein gewöhnlicher Callout; in der Bearbeitungsansicht setzte ein Tipp neben den Pfeil den Cursor
hinein, der Kasten zeigte seinen Quelltext, und auf dem iPad ging die Tastatur auf. Die Notiz bleibt Markdown (der Link auf die PDF folgt
Umbenennungen, ohne Plugin ein normaler Kasten): Der Post-Processor übernimmt den Kasten, wo Obsidian ihn zeichnet, auch in der
Bearbeitungsansicht (Obsidian zeichnet Callouts dort mit denselben Post-Processoren). Die Kopfzeile fängt Tipps am Kasten ab (Einfangen),
bevor Obsidian oder der Editor sie sehen; im Inhalt behält die PDF ihre Bedienung, nichts geht weiter an den Editor. Zugeklappt ist der
Kasten leer, die PDF lädt beim ersten Aufklappen (`MarkdownRenderer`, Kind der Notiz). Rechts in der Kopfzeile leise Knöpfe **Öffnen**
(Aktion `oeffnen` mit `datei`) und **Original** (wenn `original` auf eine Datei zeigt); die Seitenzahl steht im Titel („PDF (37 Seiten)“,
sonst aus `seiten`). Eine Höhe je Gerät (`eba-core.css` 27, iPhone 37.begleitnotiz); den Knopf „Größe ⇅“ (Aktion `pdf`, `eba-pdf-klein`,
`eba-pdf-gross`) gibt es nicht mehr, er sah aus wie Sortieren. Tests: `tests/notizbild.test.js`.

### Rückgängig statt Rückfrage, ein Papierkorb (`papierkorb.js`, `quellen.js`)

Was sich umkehren lässt, passiert sofort, und der Hinweis danach hat **Rückgängig** (`ctx.hinweis(text, { aktion: { text:
"Rückgängig", ausfuehren } })`). Eine Rückfrage gibt es nur, wo etwas endgültig verloren ist: **Trennen** (Passwort bzw. Link sind auf
dem Gerät weg) und **Daten aus Alma löschen**. Bis 0.4.5 gab es fünf Stufen (Rückfrage, das Wort „löschen“ im Alma-Feld, Papierkorb
ohne Rückgängig, Hinweis mit Rückgängig, Ja/Nein als Auswahl) und drei Papierkörbe.

```
ctx.papierkorb(datei, { text, still }) → Promise<bool>       wegwerfen, was du selbst wegwirfst, mit Rückgängig
ctx.user.quellen.papierkorb(app, datei, { lokal })            der eine Papierkorb (Quellen und Aktionen)
```

- **Ein Papierkorb**: `quellen.js papierkorb` folgt Obsidians Einstellung „Gelöschte Dateien“ (Papierkorb des Systems, auf iPhone und
  iPad `.trash` im Tresor) und löscht nie endgültig, auch wenn dort „Endgültig löschen“ steht. Alle Quellen (zentrale Daten, Alma,
  ILIAS-Kalender, Übungsgruppen, Volltext) und das Einordnen werfen nur hierüber weg (vorher teils `.trash`, teils das System,
  Volltext auch endgültig). Ausnahmen mit Grund prüft `tests/papierkorb.test.js` (leere Notiz der Ordner-Automatik, unfertiger
  Download nach einem Absturz, Sicherung des Updates, eigene Daten von Noten & Anmeldungen nach Rückfrage).
- **Rückgängig beim Wegwerfen**: `ctx.papierkorb` merkt den Inhalt, wirft weg und bietet Rückgängig; das legt die Datei mit demselben
  Inhalt am selben Ort wieder an (Name vergeben: „Name 2“). Nutzer: leere Mitschrift beim Verlassen (`leer.js`), **Abwählen** einer
  Übungsgruppe (`gruppen.js`).
- **Rückgängig ohne Datei**: To-do auf dem Dashboard abgehakt („Aufgabe abgehakt.“, `todos.js`: die Zeile wird wieder `[ ]`),
  Karteikarte aussetzen, zurückstellen oder als neu zurücksetzen (`karten.js`, nimmt den Eintrag aus dem Lernstand; vorher eine
  Ja/Nein-Auswahl), **Besuche ich nicht** (Kopf der Notiz, zentral `besuche-nicht`/`wieder-zeigen`).
- **Ohne Hinweis**: Ein Status, den man im Kopf einer Notiz oder im Modulfeld setzt, zeigt sich selbst; ein Hinweis kommt nur, wenn
  danach woanders etwas fehlt.

## Verbindungen und Schloss

`verbindungen.js` hält eine Registry. Eine Verbindung ist `{ id, name, art ("link" | "anmeldung" | "konto" | "volltext" | "zentral" |
"server" | "vorlage"), satz, kurz?, erklaerung, schritte, status(), gesperrt(), sichtbar()?, schlossKnopf?, trennenText?,
pruefen(link)?, verbinden(link)?, aktualisieren(parameter)?, trennen()? }`. `sichtbar()` haben nur `konto`, `volltext` und `server`.

Texte für Nicht-Techniker (seit 15.10.2026): `satz` = ein Satz Nutzen (Schloss-Karte), `kurz` = höchstens ein Satz im Fenster,
`schritte` = kurze Schritte mit Verb vorn (`**fett**` = Bedienelement, genau wie in Alma/Obsidian benannt; `[Text](https://…)`
= Link, öffnet im Browser wie andere externe Links, `ctx.verbindungen.fett`/`textTeile`), `erklaerung` =
Hintergrund, nur eingeklappt unter „Mehr erfahren“ (`<details class="eba-modal-mehr">`). In Notizen gilt dasselbe Muster mit
`<details class="eba-mehr">` (z. B. `System/Einstellungen.md`). Regel seit 17.10.2026: Was nur eine Zeile oder einen
kurzen Absatz hätte, klappt nicht ein; es steht direkt da oder entfällt.

| id | Art | Gesperrt, solange … |
|---|---|---|
| `uni-login` | „Uni-Login“ (seit 0.4.8), Art `uni`: EINE Zeile unter Verbindungen statt `ilias`, `ilias-kalender`, `alma` und `alma-konto` (`uniZeile`): „Verbunden · Unterlagen, Abgaben und Stundenplan · aktualisiert vor 5 Min.“ (nur, was hier oder über ein anderes Gerät verbunden ist; das Problem einer Quelle mit ihrem Namen dahinter), Knopf **Aktualisieren** (alles, was hier verbunden ist), „Mehr erfahren“ öffnet `UniFenster` (je Quelle ihr Stand aus den Zeilen unten und ein Schalter „auf diesem Gerät“, „Link selbst einfügen“, „Kurse“, Noten & Anmeldungen nur, wenn sichtbar; **Trennen** trennt alles hier); nur über andere Geräte „Verbunden über ein anderes Gerät · …“; nichts verbunden: Satz vor der Eingabe und **Mit Uni-Login verbinden**; eigener Uni-Abgleich: nur der Satz, was von dort kommt. Die Zeilen der vier Quellen gibt es weiter (`zeile(id)`), nur im Fenster | nie (die Schlösser gelten je Quelle) |
| `alma` | Link (iCalendar), nutzt `alma.js` (`status`, `linkPruefen`, `verbinden(link, { nurBeiErfolg })`, `trennen`, `fehler`); im eigenen Uni-Abgleich nur der Satz „Dein Stundenplan kommt über deinen Uni-Abgleich.“ ohne Knopf (Aktion `verbinden` zeigt ihn als Hinweis); ist dort doch ein Link gespeichert, holt Alma trotzdem nichts, die Zeile sagt „Der Alma-Link auf diesem Gerät wird nicht genutzt.“ und bietet Trennen als Textlink | kein Link auf diesem Gerät **und** keine eigene Notiz in `Stundenplan/` **und** keine zentrale Stundenplan-Notiz **und** kein eigener Uni-Abgleich **und** kein anderes Gerät verbunden (seit 0.4.7) **und** Alma in der Einrichtung offen (übersprungen oder Einrichtung nicht fertig, `ctx.einrichtung.almaOffen()`; seit 0.3.0) |
| `ilias` | „ILIAS-Unterlagen“ (seit 0.4.0), Anmeldung mit Benutzername und Passwort über `ctx.ilias` (siehe „ILIAS-Unterlagen“); eigenes Fenster `IliasFenster`, seit 0.4.8 „Mit Uni-Login verbinden“ (`anmeldenTitel`): danach verbindet `uni-login.js` ILIAS-Kalender und Alma mit, ihre Zeilen stehen im Fenster, ist es zu, kommt ein Hinweis (siehe „Uni-Login“); Knopf Verbinden, verbunden Aktualisieren (lädt gerade ein anderes Gerät: Hier aktualisieren). Im eigenen Uni-Abgleich heißt sie „ILIAS“: nicht verbunden der Satz „Deine Unterlagen kommen über deinen Uni-Abgleich.“ und leise **Für Übungsgruppen verbinden** (öffnet gleich die Anmeldung, eigene Texte ohne Schritte, danach schließt das Fenster); verbunden Stand der Prüfung, Knopf **Aktualisieren**, Textlink **Trennen** | nicht verbunden **und** keine Begleitnotiz mit `ilias_id` unter `Unterlagen/` **und** kein anderes Gerät verbunden (seit 0.4.7) **und** ILIAS in der Einrichtung offen (`ctx.einrichtung.iliasOffen()`); nie im eigenen Uni-Abgleich oder ohne Anmeldebaustein |
| `alma-konto` | „Noten & Anmeldungen (Alma)“ (seit 0.4.5, Beta), Art `konto`: Zeile (`ctx.almaKonto.zeile()`) und Fenster (`fensterOeffnen()`) kommen aus `alma-konto.js`; ohne Beta, Zustimmung und Daten keine Zeile (`sichtbar()`). „ILIAS verbinden“ aus dieser Zeile öffnet das ILIAS-Fenster mit `fuer=alma`: danach sind alle neuen Kurse aus (`kurseAbrufen({ alleAus: true })`), kein erster Abruf | nie |
| `ilias-kalender` | „ILIAS-Kalender“ (seit 18.10.2026, `ilias-kalender.js`), Art `link` wie Alma: nicht verbunden Satz und **Verbinden** (Symbol aus, keine Pille, kein Schloss); verbunden Stand aus `standText` und die Zahl der kommenden offenen Abgaben („Aktualisiert vor 5 Min. 3 Abgaben stehen bei deinen Fristen.“), Knopf Aktualisieren bzw. Hier aktualisieren, „Mehr erfahren“ öffnet das Link-Fenster (Neuen Link eingeben, Trennen); von außen nur der Satz „Deine Abgaben aus ILIAS kommen über deinen Uni-Abgleich.“ (mit gespeichertem Link Textlink Trennen). Die Link-Fenster nehmen ihre Texte aus der Registry (`laedt`, `danach`, `neuerLink`, `externText`; Alma unverändert) | nie |
| `volltext` | „Volltext der PDFs“ (seit 0.4.5, `volltext.js`): Text mit den Zahlen aus `ctx.volltext.status()` („58 PDFs durchsuchbar, 2 ohne Text.“), Knopf Aktualisieren (`nachholen`; liest gerade ein anderes Gerät: Hier aktualisieren, `hier=1`); aus: Einschalten öffnet das Fenster mit dem Schalter „Textfassungen anlegen“ (`setzen`, für alle Geräte); extern oder fremde Textfassungen: nur der Satz | nie |
| `zentral` | Zentrale Daten (`zentral.js`), Knopf Aktualisieren (aus: Einschalten); die Schalter Zentrale Daten und Fachschaft & Veranstaltungen stehen im Fenster „Mehr erfahren“ | nie (Standard an) |
| `server` | „Eigener Server“ (`server.js`): ohne Server (keine Schlüssel hier, keine `server.json` per Sync) leise „Für Technische: …“ mit Mehr erfahren (Fenster: drei Schritte, Knopf Prompt kopieren, was es kostet und braucht); sonst Zeile aus `ctx.server.zeile()`, Knopf Aktualisieren (holt ein anderes Gerät gerade ab: Hier aktualisieren), Fenster mit Stand, Hinweisen und Trennen; ohne Verbindung auf diesem Gerät die Schritte zum Verbinden (Link vom Server) | nie |
| `vorlage` | „Studium Autopilot“ (`update.js`): Version, Knopf Aktualisieren bzw. Neu laden, sonst Mehr erfahren; Schalter „Beta-Versionen“ im Fenster unter „Mehr erfahren“ | nie |

- **Über ein anderes Gerät verbunden** (seit 0.4.7, `ctx.verbindungen.imTresor(id)` → `{ art: hier | anderswo | nein, zuletzt }`, aus
  `Q.verbindung`): Bis 0.4.6 bot jedes Gerät ohne eigenen Link bzw. Zugang **Verbinden** an (Zeile, **Alma verbinden** auf
  Stundenplan), obwohl die Daten über ein anderes Gerät kamen; das sah nach „nicht verbunden“ aus. `sperrenLesen` liest die Sperren
  von Alma, ILIAS, ILIAS-Kalender und Noten & Anmeldungen (`System/Daten/<quelle>-abruf.json`) beim Start und nach jeder Änderung
  (Sync, eigener Lauf) und zeichnet geändert neu. Hält ein anderes Gerät eine davon (höchstens 7 Tage still), sagt die Zeile
  „Verbunden über ein anderes Gerät · aktualisiert vor 3 Std.“ (ILIAS im eigenen Uni-Abgleich mit dessen Satz dahinter, Noten &
  Anmeldungen statt „Braucht deinen Uni-Zugang“), Pille „verbunden“, Haken, rechts nur **Mehr erfahren**. Das Fenster
  (`AnderswoFenster`) zeigt den Stand und leise **Auch hier verbinden** (Aktion `verbinden` mit `auch=1`; aus Noten & Anmeldungen das
  ILIAS-Fenster mit `fuer=alma`). Kein Schloss, auf Stundenplan kein Knopf, auf Unterlagen bleibt **Unterlagen aktualisieren**
  ausgeblendet. Länger still, frei oder von außen: wie bisher. Hat ILIAS dein Passwort abgelehnt, gilt ILIAS nie als anderswo
  verbunden. Nach Verbinden und Trennen auf diesem Gerät zeichnen alle Blöcke neu (`neuZeichnen`, auch nach Verbinden über
  **Stundenplan aktualisieren** in `alma.js`). Tests: `tests/verbindungen.test.js`, `tests/quellen.test.js`.
- Symbole (seit 15.10.2026, iPad-Test): ruhige Lucide-Linien als inline-SVG in `currentColor` (`SYMBOLE`, `ctx.verbindungen.svg(name)`:
  schloss, haken, uhr, extern, warnung, pause, aus), keine Emojis; `setIcon` blieb auf dem iPad leer (so auch im Raster-Menü bis 0.4.6).
- Codeblock `eba-schloss <id>`: Solange gesperrt, eine Karte mit Schloss-Symbol, einem Satz und „Verbinden“. Steht der Block in einer Karte
  (Callout), blendet CSS (`:has`) den übrigen Inhalt aus, z. B. das Wochenraster auf Dashboard und Stundenplan. Sind
  Stundenplan-Notizen da (etwa per Sync), gibt es kein Schloss; die Übersicht sagt dann „Dein Stundenplan liegt vor (n
  Einträge).“ mit leisem Verbinden.
- Codeblock `eba-verbindungen`: Übersicht in den Einstellungen (Stand, zuletzt aktualisiert), ohne Satz darüber. Je Zeile
  höchstens **ein** Knopf (Verbinden, Aktualisieren, Hier aktualisieren, Einschalten, Neu laden oder Mehr erfahren; Wörter
  nach Entscheidung E1 in `WORT`); führt er nicht ins Fenster, steht „Mehr erfahren“ als Textlink im Status. Das Fenster enthält den Rest: bei Alma
  (verbunden) „Neuen Link eingeben“ und „Trennen“, bei den zentralen Daten die beiden Schalter (Obsidian-`Setting` mit
  Umschalter). Hätte das Fenster nur einen Knopf, steht er selbst als Textlink da (ILIAS nur für Übungsgruppen: „Trennen“).
  Inhalt je Zeile: `zeile(id)` (`statusZeile`) → `{ text | html, pille, symbol, ton, knopf, link }`. Seit 18.10.2026
  widersprechen sich Symbol und Pille nie: Pille nur, wo der Stand zählt („verbunden“, „nicht verbunden“ nur mit Schloss,
  wenn nichts da ist und Verbinden der Weg ist, „Anmeldung prüfen“ mit Warnung). Kommt etwas ohnehin (Stundenplan oder
  Unterlagen per Sync, zentraler Stundenplan, eigener Uni-Abgleich), steht ein Haken ohne Pille da und Verbinden ist leise.
  Fenster haben keinen Knopf, der nur schließt (dafür ist das ×), und höchstens einen Hauptknopf.
- **Stand einer Quelle, eine Formatierung** (Quellen-Vertrag, seit 0.4.5): `standText(s)` macht aus der gemeinsamen Form
  `{ zustand, geprueft, fehler, fehlerZeit, warnungen }` den Satz und das Symbol jeder Zeile: „Aktualisiert vor 5 Min.“ bzw.
  „Noch nicht aktualisiert.“ (Haken), Warnungen des letzten Laufs dahinter (Warnsymbol), ein Fehler als Satz der Quelle mit
  „Zuletzt aktualisiert …“ (Warnsymbol, bleibt bis zum nächsten Erfolg), „Ein anderes Gerät aktualisiert, alles kommt über deinen
  Sync.“ mit dem Knopf **Hier aktualisieren**, „Aktualisiert gerade …“ (Uhr). Zeitwörter aus `quellen.js` (`vorText`). So zeigen
  Alma-Stundenplan, ILIAS, Zentrale Daten, Volltext, Noten & Anmeldungen und der eigene Server (über `ctx.verbindungen.standText`) dieselben
  Wörter; Sonderfälle (nicht verbunden, abgelehnt, extern, Fortschritt) formuliert die Quelle selbst. Liefert eine Quelle ihre
  Zeile selbst (`zeile()`, Noten & Anmeldungen, eigener Server), baut `quelleZeile(z)` daraus das HTML.
- Verbinden-Fenster: vier Schritte (Link zu Alma, Link zum Stundenplan → „Daten für iCalendar (ics) exportieren“ → „Link
  kopieren“; Einrichtung ebenso). Die Links (`ctx.verbindungen.ALMA`) sind am 17.10.2026 mit Anmeldung geprüft; ohne Anmeldung
  führt der Stundenplan-Link zur Anmeldung und danach zur Startseite, darum zuerst Alma. Der Weg durchs Menü (Mein Studium →
  Stundenplan) steht unter „Mehr erfahren“, falls Alma die Adresse ändert. Eingabe mit Prüfung (https/webcal, Server alma.uni-tuebingen.de, nicht nur die Startseite), sofortiger Import, Ergebnis mit
  Anzahl. Scheitert der Abruf, bleibt kein Link gespeichert (vorheriger Zustand gilt wieder). Mit gespeichertem Uni-Login (seit
  0.4.8, Alma und ILIAS-Kalender) statt der Schritte ein Satz mit dem Benutzernamen und **Verbinden**: Studium Autopilot holt den
  Link selbst; scheitert das, zeigt das Fenster die Schritte zum Einfügen mit dem Grund darüber. Ohne Uni-Login auf diesem Gerät
  steht unter den Schritten leise „Ohne Kopieren: Mit Uni-Login verbinden“ (siehe „Uni-Login“).
- Gespeichert wird nur gerätelokal (`app.saveLocalStorage`): `eba-alma-ics`, `eba-alma-stand`, `eba-alma-seit`.
- Codeblock `eba-alma-knoepfe` (Seite Stundenplan, seit 0.3.0): verbunden → nur „Stundenplan aktualisieren“, über ein anderes Gerät
  verbunden nichts (seit 0.4.7), sonst
  „Alma verbinden“ und ein Satz dazu; den Satz nicht, solange das Schloss gilt (die Schloss-Karte darunter sagt dasselbe,
  seit 16.10.2026); im eigenen Uni-Abgleich nichts (auch mit Link). Gezeichnet als Knopf-Karte `callout[data-callout=eba-neu]` (gleiche Gestalt wie
  `> [!eba-neu|ohne-titel]`). Vorher standen beide Knöpfe fest in der Notiz, auch bei verbundenem Alma.
- Codeblock `eba-ilias-knopf` (Seite Unterlagen, seit 0.4.0): steht leer in der Knopf-Karte und trägt die Klasse `eba-ilias-an`,
  solange ILIAS auf diesem Gerät verbunden ist. Dann zeigt CSS (Abschnitt 49, `:has`) den festen Knopf **Unterlagen aktualisieren**
  derselben Karte (Aktion `ilias-holen`), sonst ist er ausgeblendet. Darunter steht `eba-schloss ilias`.
- Für andere Skripte: `ctx.verbindungen.gesperrt(id)`, `ctx.verbindungen.schlossKarte(el, id)`.

## ILIAS-Unterlagen (seit 0.4.0)

Kursdateien aus ILIAS (Uni Tübingen, ILIAS 10) landen von selbst unter `Unterlagen/`, je mit Begleitnotiz wie beim Einordnen.

| Skript | Aufgabe |
|---|---|
| `ilias-netz.js` | Sitzung mit Keksdose, Weiterleitungen, Drossel, nur https und nur Server der Uni; am PC Node-https aus Electron (Verbindungen bleiben offen, Seiten gzip), auf iPhone/iPad `requestUrl` |
| `ilias-anmeldung.js` | Anmeldung über Shibboleth; Ergebnis `{ ok }` bzw. `{ ok: false, grund, hinweis, code }` (falsches Passwort, Zustimmung, zweiter Faktor, Netz, unerwartet). `code` = „Stelle · Gerät Version · Spur“ (je Antwort Schritt, Status, Seitenart; bei fremden Seiten Titel und Feldnamen, am PC Server und Pfad; nie Feldwerte, Query, Kekse oder Zugangsdaten), bei „unerwartet“ und „netz“ im Hinweis; Stellen und Beispiel im Kopf der Datei |
| `ilias-html.js` | Kursliste und Kursinhalt aus dem HTML lesen (eigener kleiner Leser) |
| `ilias.js` | Zeitplan, Abrufer-Sperre, Durchsuchen, Ablage, Index; `ctx.ilias` für die Oberfläche |
| `unterlagen.js` | Namen „Code Art NN Titel“ (auch Titel aus der ersten PDF-Seite), Ordner, Begleitnotiz |
| `verbindungen.js`, `einrichtung.js` | Zeile, Fenster, Schloss, Knopf auf Unterlagen; Bildschirm 6 der Einrichtung |

- **Ablauf:** Sperre → Index lesen, Umbenennungen und Löschungen nachziehen → anmelden (gilt die Sitzung des letzten Laufs
  noch, entfällt das) → Kursliste → aktive Kurse durchsuchen (zwei Seiten zugleich, der älteste Kurs zuerst, Kurs für Kurs)
  → geänderte, dann neue Dateien laden (am PC zwei zugleich, auf iPhone/iPad eine; abgelegt wird eine nach der anderen).
  Automatisch über den gemeinsamen Zeitplan der Quellen (`Q.planen`): 20 s bis gut 2 Min. nach dem Start, dann stündlich, und
  zurück in der App nach über 60 Min. seit dem letzten Versuch; dazu der Knopf.
  Kurse mit Modulcode und Modulnotiz sind beim ersten Mal an, die anderen aus. Nach dem ersten Verbinden (Fenster,
  Einrichtung) startet der erste Abruf gleich, wenn ein Kurs an ist. Ein während des Laufs abgewählter Kurs wird nicht
  mehr durchsucht (eine Seite, die schon unterwegs ist, kommt noch) und nichts mehr aus ihm geladen.
- **Dateien im Tresor (synchronisiert):** `System/Daten/ilias.json` (Index: Kurse mit Wahl, welche ILIAS-Datei wo liegt, seit
  18.10.2026 unter `objekte` je Übung Code und Kurs, nie ihr Titel, für den ILIAS-Kalender; je Eintrag mit Zeitstempel, vor jedem
  Schreiben mit der Platte gemischt) und `System/Daten/ilias-abruf.json` (Abrufer-Sperre
  über `sperre.js`: nur ein Gerät lädt, Übernahme nach 80 Min. Stille wie bei den zentralen Daten, sofort bei `frei: true` nach
  dem Freigeben der Gruppen, siehe „Deine Übungs- oder Tutoriengruppe“; ältere Fassungen lesen die Datei weiter, `mobil` ist neu).
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
- **Warnungen eines Laufs** (seit 0.4.5): fehlende Dateien (Sync läuft noch), keine Übungsgruppen mehr in ILIAS, Gruppen oder
  Ordner, die sich nicht prüfen bzw. umbenennen ließen. Klar formuliert im Stand (`warnung`), bis ein Lauf ohne Warnung kommt:
  `status().text` hängt sie an „Aktualisiert …“ bzw. „Prüft deine Übungsgruppen …“ (Zeile und Fenster unter Verbindungen, die
  Zeile mit Warnsymbol), der Hinweis nach **Aktualisieren** ebenso, dazu ein Punkt „**ILIAS** · …“ in „Bitte prüfen“ auf dem
  Dashboard (Meldekanal, `hinweiseAus`; ebenso eine abgelehnte Anmeldung). Technische Einzelheiten nur im Geräte-Protokoll
  (`technik`). `status()` hat die gemeinsame Form der Quellen (`zustand`: an, laeuft, fehler, abgelehnt, anderes-geraet,
  nicht-verbunden, ohne-anmeldung, extern; `geprueft` = letzter Erfolg, `warnungen`).
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
- **Eigener Uni-Abgleich** (`eba.quelleExtern`, Schlüssel `ilias-dateien` und `ilias-gruppen`, siehe „Quellen außerhalb des
  Plugins“): Kommen die Dateien von außen (ohne Liste: `System/Skripte/abgleich.js` im Tresor oder `ilias_unterlagen: extern`),
  lädt `ilias.js` nie Dateien (Status `K.TEXT_EXTERN` „Deine Unterlagen kommen über deinen Uni-Abgleich.“), kein Schloss.
  Kommen auch die Übungsgruppen von außen, läuft ILIAS gar nicht (nicht `bereit`, `status().gruppenExtern`; die Zeile zeigt nur
  den Satz, mit gespeichertem Zugang den Textlink Trennen); nur die Übungsgruppen von außen: Dateien wie immer, kein
  Gruppenabgleich. Mit ILIAS-Zugang prüft es sonst nur die Übungsgruppen (Lauf `nur-gruppen`, Status „Prüft deine Übungsgruppen,
  zuletzt vor 5 Min. …“), ohne Auftrag: kein Weitermachen nach Fehlern, keine Stapel; ein Auftrag von früher wird verworfen
  und sein Weitermachen läuft still. Der Hinweis „Übungsgruppen aus ILIAS geprüft.“ kommt so nur nach deinem Tipp
  (Aktualisieren, Verbinden), nie vom stündlichen Prüfen.
- **Fortschritt:** Ereignisse über `beobachten(fn)`: `start { manuell, weiter }`, `fortschritt { phase, text, erledigt,
  gesamt, code }`, `fertig { manuell, ergebnis, text, weiterIn }`. Nie Kurs- oder Dateinamen (Kurstitel können
  Einschreibepasswörter enthalten), höchstens der Modulcode. `fortschrittAnzeige(x, weiter)` macht daraus die Texte: Zeile
  und Fenster „Lädt 12 von 40“, Knopf auf Unterlagen ebenso (sonst „Lädt …“), Hinweis „ILIAS · 12 von 40“ bzw.
  „ILIAS · weiter: 26 von 40“, dazu der Anteil für den Balken. Läuft ein Abruf, den du gestartet hast (Knopf in Fenster,
  Zeile oder auf Unterlagen, Einrichtung), zeigt `ilias.js` genau **einen** Hinweis (`ctx.hinweis` mit `dauer: 0`)
  mit Text, **Stoppen** und dünnem Balken und ändert ihn an Ort und Stelle. Gewählt, weil Obsidian Hinweise auf iPhone und
  iPad oben über die volle Breite zeigt (keine Statusleiste nötig, nichts verdeckt Eingabefelder oder die Leiste unten) und
  am PC oben rechts; Wegtippen ist eingebaut. Wegtippen blendet ihn nur aus, ein weiterer Knopfdruck zeigt ihn wieder. Am
  Ende verschwindet er, dann kommt der Hinweis zum Ergebnis („12 neue Dateien aus ILIAS in Unterlagen.“, „Keine neuen
  Dateien in ILIAS.“, bei einem Fehler ein Satz ohne den Fehlertext, der in Zeile und Fenster steht). Automatische Läufe bleiben still. Er hängt am Motor, nicht an einer Ansicht, und wird
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
  (`kursSetzen`), Aktualisieren und Trennen (`zugangLoeschen`; Dateien bleiben, deine Übungsgruppe bleibt als gewählte Notiz).
  Kurstitel nur dort und nie in Hinweisen.
- **Uni-Zugang** (seit 0.4.5, gilt auch für Noten & Anmeldungen): Lehnt die Uni ein **gespeichertes** Passwort eindeutig ab
  (`zugang-falsch`), schreibt das Gerät `System/Daten/uni-zugang.json` `{ abgelehnt, dienst, geraet }` (synchronisiert, ohne
  Benutzername und Passwort). Jedes Gerät, dessen Passwort älter ist (gerätelokal `eba-uni-zugang-seit`), meldet sich danach
  nirgends mehr an, auch nicht per Knopf (`abgelehnt`, Text „Anmeldung abgelehnt. Bitte dein Passwort neu eingeben.“), bis man
  es dort neu eingibt; die Neueingabe prüft genau einmal. Ein im Fenster vertipptes Passwort schreibt keinen Marker. So scheitert
  nach einem Passwortwechsel im Normalfall nur ein Gerät, sobald der Marker per Sync da ist. `eba-uni-zugang-ok` = letzte
  erfolgreiche ILIAS-Anmeldung mit diesem Passwort (auch nach dem Update gesetzt, sobald ein Lauf klappt). `ctx.ilias.uniZugang()`
  → `{ benutzer, seit, ok, abgelehnt, dienst, gesperrt, bestaetigt }`, `ctx.ilias.zugangAbgelehnt(dienst)` schreibt den Marker.
- **Tests:** `tests/ilias.test.js` (ganzer Ablauf mit erfundenem ILIAS und Tresor im Speicher, `tests/ilias-attrappen.js`;
  dazu Gleichzeitigkeit, nicht geholte Sitzungen und Gruppen, Sitzung über Läufe, gelernte Adressen),
  `ilias-weiter.test.js` (Fortschrittstexte, Ereignisse, Auftrag und Weitermachen, toter Lauf, Funde, Absturz beim Schreiben),
  `ilias-netz.test.js` (mit Drossel und PC-Transport), `ilias-anmeldung.test.js` (nachgespielter Server), `ilias-html.test.js`. In Obsidian ersetzen
  `ctx.ilias.anmeldungSetzen(fn)` und `ctx.ilias.quelleSetzen(fn)` Anmeldung und ILIAS (`null` = wieder echt);
  `plugin.testIliasAus = true` schaltet den stündlichen Lauf ab (das Weitermachen eines offenen Auftrags nicht).

## Noten & Anmeldungen (Alma, seit 0.4.5, Beta)

Auf einem deiner Geräte meldet sich das Plugin mit deinem Uni-Zugang bei Alma an, liest „Leistungen“ und „Belegungen“ und
schlägt neue Noten auf der Modulseite zum Übernehmen vor. In der Anmeldephase zeigt „Bitte prüfen“ auf dem Dashboard, wenn laut
Alma eine Prüfungsanmeldung fehlt. Es schreibt nie selbst in Modulnotizen und nie etwas in Alma.

| Skript | Aufgabe |
|---|---|
| `alma-konto-html.js` | reiner Leser (CommonJS ohne Obsidian, Zerleger aus `ilias-html.js`; auch für einen eigenen Server): `seite`, `anmeldeFormular`, `fehler`, `stundenplanLink` (seit 0.4.8), `leistungen`, `belegungen`, `zuordnen`, `zusammenfassen`, `pruefungenZuordnen`, `fingerabdruck`, `semesterName` |
| `alma-konto.js` | Ablauf, Zeitplan, Zustand, Vorschläge, Erinnerung, Zeile und Fenster (`ctx.almaKonto`), Aktion `alma-konto-pruefen` |
| `sperre.js` | Abrufer-Sperre der Quelle `alma-konto` (siehe „Abrufer-Sperre“) |
| `ilias-netz.js` | Sitzung mit Dienst `alma`: nur `alma.uni-tuebingen.de`, Kennung `Studium-Autopilot/<Version> (+https://github.com/studium-autopilot/ecoba)` |
| `ilias.js` | Uni-Zugang (`uniZugang`, Marker), siehe „ILIAS-Unterlagen“ |

- **Beta:** läuft nur mit `update_kanal: beta` in `System/Einstellungen.md` (der Schalter „Beta-Versionen“) bzw. mit
  `ALMA_KONTO_STABIL = true` in `alma-konto.js`. Diese Konstante setzt erst ein eigener Commit, wenn echte gefüllte Seiten
  (Prüfungsanmeldungen ab 07.12.2026, erste Noten) mit dem Leser abgeglichen sind. Ohne Beta keine Anfrage; die Zeile mit
  **Ausschalten** und **Daten aus Alma löschen** bleibt, solange es eine Zustimmung oder Daten gibt.
- **Zustimmung je Gerät:** Fenster „Noten & Anmeldungen einschalten“ mit dem Benutzernamen (fett), einem Hauptknopf
  **Einschalten** (gerätelokal `eba-alma-konto-an`); erst danach liest das Skript das Passwort aus dem Schlüsselbund von ILIAS,
  und nur unmittelbar vor dem Absenden. Ohne gespeicherten Uni-Zugang: „Braucht deinen Uni-Zugang.“ und **ILIAS verbinden**.
- **Anmelden nur nach ILIAS:** `ctx.ilias.uniZugang()` muss `bestaetigt` sein (ILIAS hat genau dieses Passwort angenommen) und
  nicht `gesperrt` (Marker). Alma macht nie den ersten Versuch mit einem Passwort. Lehnt Alma ein bestätigtes Passwort mit der
  bekannten Meldung ab („Ihre Anmeldung war leider nicht erfolgreich …“), schreibt das Gerät den Marker (`dienst: alma`).
  Unklare Antwort (Formular ohne bekannte Meldung), zweiter Faktor, Zustimmungsseite: nur Alma auf diesem Gerät pausiert
  (**Erneut versuchen**), kein Marker. Höchstens eine Anmeldung je Lauf.
- **Ablauf** (Drossel 1 Anfrage zugleich, 2 s Abstand; ganzer Lauf ≤ 3 Min.): Startseite (zeigt sie schon den Abmelde-Link, weil
  iOS den letzten Lauf vor dem Abmelden beendet hat: keine zweite Anmeldung) → Formular `#mobileLoginForm` prüfen (https, Host
  `alma.uni-tuebingen.de`, Port leer/443, Pfad `/alma/rds`, `category=auth.login`; sonst geht kein Passwort hinaus) → POST mit
  den versteckten Feldern, `asdf`, `fdsa`, `submit` → angemeldet nur mit Link `category=auth.logout` (jede Seite trägt das
  versteckte `#sessionTimeoutLoginForm`) → Leistungen (zugeklappt: einmal **Alle aufklappen** mit allen versteckten Feldern,
  bleibt es zu: unsicher) → Belegungen → Abmelden (`type=4`) in jedem Ausgang nach der Anmeldung.
- **Leser fail-closed:** „leer“ nur bei bekanntem Text **und** Aufbau (Leistungen: Bereich `overviewAsTreeReadonly` ohne Baum mit
  „Es wurden keine Datensätze gefunden.“; Belegungen: gewählte Semesteroption, keine Einträge, „Sie haben bisher keine
  Veranstaltungen belegt und keine Prüfungen angemeldet.“). Jeder andere Hinweis, fehlender Bereich, unbekannter Status, „AN“
  ohne Langform, ungültige Note, abgeschlossen ohne Note → `unsicher`: alte Werte dieser Seite bleiben, `geprueft` bleibt, keine
  Erinnerung, eine leise Zeile mit **In Alma öffnen** und unter „Mehr erfahren“ **Aufbau kopieren (ohne deine Daten)**
  (`fingerabdruck`: Pfade, bekannte Spaltenköpfe, Ebenen, Status aus der bekannten Liste, geschwärzte Hinweise). Gefüllte
  Tabellen: Spalten nach Kopftext (deutsch/englisch), sonst nach id-Endung (`:elementnr`, `:grade`, `:attempt`, `:workstatus`),
  nie nach Position; Ebene aus `treeTableCellLevelN`, Art aus `img[alt]`; Belegungen je Überschrift „Prüfung: <Nummer> …“ mit
  Tabelle. Echte gefüllte Seiten und englische Texte sind noch nicht gesehen (Testseiten nachgebaut).
- **Zuordnung:** Nummer beginnt mit einem Modulcode des Tresors (längster Treffer, danach keine Ziffer; öffentlicher Katalog am
  18.10.2026: Veranstaltungen heißen wie das Modul oder hängen Buchstaben an, z. B. `B110UE`), sonst die Modulzeile darüber,
  sonst kein Vorschlag. Belegungen: Nummer, sonst Code im Titel; Unzugeordnetes zählt (`unzugeordnet`) und schaltet die
  Erinnerung auf „selbst prüfen“.
- **Zustand** `System/Daten/alma-konto.json` (synchronisiert, nur der Abrufer schreibt): `{ version: 1, geprueft, stand, geraet,
  leistungen: { art, module: { <Code>: { status, note, unbenotet, versuch, semester, datum, eindeutig, stati } } }, belegungen:
  { art, semester, pruefungen: { <Code>: { status } }, unzugeordnet } }`. `geprueft` = letzte vollständige Prüfung, `stand` =
  letzte inhaltliche Änderung. Kein Titel, kein Name, keine Matrikelnummer, keine Prüfer:innen, kein Vermerk. Unlesbar → wie
  nicht da, der nächste Lauf schreibt neu. Konfliktkopien (`alma-konto*.json` außer `-abruf`/`-aus`) löscht jeder Lauf endgültig.
- **Fällig** (nur Geräte mit Zustimmung, Beta, bestätigtem Zugang, nicht extern): `geprueft` älter als 12 Std., in der
  Anmeldephase (zentrale Frist „Prüfungsanmeldung … Haupttermin“ heute offen) älter als 3 Std.; ein Lauf, der den Anmelde-POST
  erreicht hat, zählt als Versuch (der nächste automatische frühestens nach 12 bzw. 3 Std.); Fehler vor dem POST → nach 30 Min.
  Blick über den gemeinsamen Zeitplan (`Q.planen`): 60–180 s nach dem Start, dann alle 30 Min., zurück in der App nach über
  60 Min. **Aktualisieren** jederzeit (≥ 2 Min.).
  429/403 oder zweimal 5xx in Folge: bis Mitternacht Pause; drei unerwartete Antworten in Folge: 24 Std.
- **Ein Schreiber:** `sperre.js` mit der Quelle `alma-konto` (`alma-konto-abruf.json`, siehe „Abrufer-Sperre“). Prüft gerade ein
  anderes Gerät: „Ein anderes Gerät aktualisiert …“ mit **Hier aktualisieren** (`erzwingen`). Ausschalten und Löschen geben sie frei.
- **Löschen** (jedes Gerät, **Daten aus Alma löschen**): Sperre her, Grabstein `System/Daten/alma-konto-aus.json` `{ geloescht,
  geraet }`, `alma-konto.json` und Kopien mit `vault.delete` (nicht Papierkorb), hier aus, Sperre frei. Jedes Gerät, dessen
  Zustimmung älter ist als der Grabstein, schaltet sich aus („Auf einem anderen Gerät ausgeschaltet.“); eine neue Zustimmung gilt
  wieder. Verläufe der Sync-Dienste kann das Plugin nicht löschen (`docs/datenschutz.md`).
- **Vorschläge** (`vorschlagAus`, Modulfeld unter dem Stand, `modul.js` → `ctx.almaKonto.modulFeld`): nur eindeutige Aussagen
  (Modulzeile oder genau eine Prüfung), nur Abweichungen; bestanden/nicht bestanden mit Note und Versuch, endgültig nicht
  bestanden → „nicht bestanden“ mit dem Satz „Endgültig: bitte mit dem Prüfungsamt sprechen.“, anerkannt, angemeldet (nur bei
  offen/läuft; auch aus den Belegungen). **Übernehmen** = ein `processFrontMatter`; **Ausblenden** schreibt
  `alma_ausgeblendet: ["<8 Zeichen SHA-256 von Code|Status|Note|Versuch>"]` (keine lesbare Note im Frontmatter; eine neue Note
  ist ein neuer Vorschlag).
- **Erinnerung** (`fehlendeAnmeldungen`): nur bei offener Haupttermin-Frist, beiden Seiten `ok`/`leer`, Belegungen im aktuellen
  Semester, `geprueft` höchstens 26 Std. alt und nichts unzugeordnet; Kandidaten: Status „läuft“ oder im aktuellen Semester
  geplant, nicht bestanden/anerkannt, kein `anmeldung_verzicht` für dieses Semester, die Prüfung des Moduls nach dem Fachmodell
  (`ctx.modell.pruefungVon`: ohne Zwischentests, Nachholtermin nur nach „nicht bestanden“, entfallene nie; Termin oder
  `klausur`), nicht abgehakt, nach Beginn der Frist (bis 120 Tage nach ihrem Ende); angemeldet = Belegung
  angemeldet/zugelassen oder Leistungen mit angemeldet (Semester passt oder fehlt) bzw. abgeschlossen in diesem Semester.
  Sonst nur „Bitte deine Prüfungsanmeldungen selbst in Alma prüfen.“ in der Zeile. Nie „alles angemeldet“.
- **Dashboard** (`bitte-pruefen.js`, Karte „Bitte prüfen“, auch ohne eigenen Abgleich; gemeldet über den Meldekanal der Quellen,
  `Q.melden(ctx, "alma-konto", hinweise)`): höchstens zwei Zeiger ohne Notenwert,
  „**Aus Alma** · neue Angaben zu B110, S100, auf den Modulseiten übernehmen“ (ein Modul: dessen Seite, mehrere: Noten & ECTS) und
  „**Prüfungsanmeldung** · laut Alma fehlen B180, S110“ (Termine & Anmeldungen). Kein neuer Block, keine Änderung an
  `Dashboard.md`.
- **Datenschutz:** Noten nur in `alma-konto.json` und im Modulfeld; nie in Hinweisen, Konsole (nur Grund-Codes), Protokoll
  (`eba-alma-konto-protokoll`: Zeit, Art, Grund, Dauer, Anfragen), Fehlern, im Datenkanal oder im Release (`.gitignore`,
  `release.py`, `pruefen.py`). Weiterleitungen: am PC prüft die Sitzung jeden Sprung; auf iPhone/iPad folgt `requestUrl` selbst,
  geprüft werden Startadresse und Formularadresse, ob die Antwort von Alma kommt, am Inhalt (Abmelde-Link). Einen 307/308 des
  Servers auf einen anderen Host würde iOS samt Formular weiterschicken (`tests/alma-konto.test.js` hält das fest).
- **Quellen außerhalb des Plugins:** `eba.quelleExtern("alma-konto")` (bei jedem Lauf): kein Lauf, keine Vorschläge, Zeile „Kommt
  über deinen eigenen Abgleich.“.
- **Status** in der gemeinsamen Form der Quellen: `status()` → `{ zustand, geprueft, fehler, fehlerZeit, warnungen }` (Sätze ohne
  Noten; `zustand` z. B. `an`, `aus`, `ohne-zugang`, `wartet-ilias`, `abgelehnt`, `unsicher`, `anderes-geraet`, `pause`), dazu
  `an`, `benutzer`, `laeuft`, `daten`, `aufbau`. Zustände, in denen nur du weiterhilfst (abgelehnt, zweiter Faktor, Zustimmung,
  unklare Antwort), meldet zusätzlich „Bitte prüfen“ („**Alma** · …“).
- **Stundenplan-Link** (seit 0.4.8, ohne Beta und ohne **Einschalten**, für den Uni-Login): `stundenplanLink()` meldet sich mit
  derselben Anmeldung wie ein Lauf an (`mitAlma`), liest „Stundenplan“ und meldet sich ab → `{ art: "ok", link }` oder die Art
  wie bei einem Lauf; ändert den Stand von Noten & Anmeldungen nicht. Siehe „Uni-Login“.
- **Für die Oberfläche:** `ctx.almaKonto = { status(), zeile(), sichtbar(), einschalten(), ausschalten(), jetztPruefen({ hier }),
  loeschen(), zustand(), vorschlag(fm), stundenplanLink(), uebernehmen(f, v), ausblenden(f, v), modulFeld(box, f, fm), fehlendeAnmeldungen(),
  hinweise(), fingerabdruck(), beobachten(fn), fensterOeffnen() }`.
- **Tests:** `tests/alma-konto-html.test.js` (erfundene Testseiten `tests/daten/alma-konto/`, Aufbau aus echten Seiten bzw.
  nachgebaut), `tests/alma-konto.test.js` (erfundenes Alma, PC-Transport und `requestUrlWieIOS`: Ablauf, Passwort nur im POST an
  Alma, Abmelden, Drossel, Uni-Zugang, Zeitplan, Sperre, Grabstein, Kopien, Beta, Vorschläge, Erinnerung, Datenschutz-Spione),
  `tests/sperre.test.js`. In Obsidian: `plugin.testAlmaAus = true` (kein automatischer Lauf), `ctx.almaKonto.testSetzen({ beta,
  zugang, zustand })` ersetzt diese Werte nur im Speicher (`null` = wieder echt).

## Volltext der PDFs (seit 0.4.5, `volltext.js`)

Zu jeder PDF unter `Unterlagen/` legt das Plugin eine Textfassung an, damit die Suche von Obsidian Wörter aus den PDFs findet,
auch auf iPhone und iPad. pdf.js von Obsidian (`loadPdfJs`) liest die Textebene auf dem Gerät; nichts geht ins Netz, keine
Texterkennung.

- **Notiz** `Unterlagen/_Volltext/<Name> (Volltext).md`, bei gleichem Namen aus einem anderen Modulordner
  `<Name> (Volltext, <Code>).md` (dann `<Code> 2` …). Frontmatter `typ: volltext`, **`volltext_von: plugin`** (Besitzmarke),
  `fassung`, `datei`, `unterlage` (nur mit Begleitnotiz), `quelle` (Pfad der PDF), `seiten`, `groesse`, `pdf_sha256`,
  `ergebnis` (`text`, `gekuerzt`, `kein-text`, `geschuetzt`, `nicht-lesbar`, `zu-gross`), `cssclasses: [eba-s-begleitnotiz,
  eba-s-volltext]`. Darunter je Seite mit Text eine eingeklappte Karte `> [!eba-quelle]- [[X.pdf#page=N|S. N]]` (Links über
  `generateMarkdownLink` bzw. `fileToLinktext`). Kein Zeitstempel: Dieselbe PDF ergibt auf jedem Gerät dieselbe Notiz. Scans,
  geschützte und kaputte PDFs bekommen eine kurze Notiz mit Hinweis (`eba-info`), damit sie nicht bei jedem Lauf neu versucht
  werden.
- **Entschärfen** (`entschaerfen`): wörtlich wie der Volltext eines eigenen Uni-Abgleichs (keine Templater-Befehle, kein HTML,
  keine Tags, Links, Aufgaben, Formeln, Kommentare, Codeblöcke, Überschriften, Listen, Block-ids; Trennungen am Zeilenende
  zusammengefügt), dazu `obsidian://` → `obsidian\://` (kein Knopf des Plugins aus einer PDF) und `::` → `:\:` (keine
  Inline-Felder). Aus Volltext-Notizen entstehen darum keine To-dos.
- **Nur eigene Notizen:** Geschrieben, umbenannt oder gelöscht wird nur eine Notiz mit Besitzmarke, geprüft im Text der Datei
  (nicht nur im metadataCache). Liegt unter `Unterlagen/` eine Notiz `typ: volltext` ohne Marke (z. B. vom eigenen
  Uni-Abgleich) oder in `_Volltext/` eine andere Datei, bleibt Volltext für diesen Tresor aus („Kommt über einen anderen Weg
  (andere Textfassungen im Tresor).“). Kommt so eine Notiz mitten im Lauf per Sync, hört er vor der nächsten PDF auf; eigene
  Notizen bleiben stehen, die fremden gewinnen.
- **Wann:** Einstellung `volltext` in `System/Einstellungen.md` (fehlt oder `an` = an, `aus` = aus; `ctx.volltext.setzen`),
  `eba.quelleExtern("volltext")` falsch (siehe „Quellen außerhalb des Plugins“) und keine fremde Textfassung, geprüft bei jedem
  Lauf. Der erste Lauf kommt, wenn der metadataCache eingelesen ist und 5 Min. keine neue Datei im Tresor ankam (Erstabgleich
  eines neuen Geräts, ILIAS-Downloads); danach bei neuen, geänderten, umbenannten oder gelöschten PDFs (nach 60 s Ruhe; eine
  PDF, die jünger als 60 s ist, wartet), alle 30 Min., zurück in der App nach über 30 Min. und mit `nachholen()`. Erreicht ein
  Lauf sein Budget, folgt der nächste nach 60 s (höchstens 10 hintereinander). Alles über den gemeinsamen Zeitplan der Quellen
  (`Q.planen`; die Ruhezeit und den nächsten Stapel gibt der Lauf selbst als `naechster` zurück).
- **Ein Schreiber** (`System/Daten/volltext-abruf.json`, `{ geraet, seit, zuletzt, mobil }`): die gemeinsame Abrufer-Sperre
  (`sperre.js`; Übernahme nach 80 Min. Stille, Puls höchstens alle 50 Min.), dazu Computer-Vorrang: Ein Computer löst ein
  iPhone oder iPad sofort ab, das nach der aktuellen PDF aufhört. Die Sperre entsteht nur in Tresoren mit PDFs oder eigenen
  Textfassungen; die leere Vorlage bleibt unberührt.
- **Neu oder aktuell** (`planen`): Notiz fehlt, Größe anders oder bekannte Prüfsumme anders → neu lesen; gleiche Größe ohne
  bekannte Prüfsumme → aktuell (ein neues Gerät liest keine PDF neu). Prüfsummen aus `ilias.json` (bei gleicher Größe) oder
  aus dem Gerätespeicher (Größe und Änderungszeit gleich); eine auf diesem Gerät geänderte PDF gleicher Größe wird einmal
  gehasht. Notiz ohne PDF: PDF gleicher Größe und Prüfsumme ohne Notiz → Notiz umbenennen (Name, Quelle, Links; Text bleibt,
  die PDF wird nicht neu gelesen, eine Marke „(PDF fehlt)“ fällt weg). Doppel derselben PDF (Konfliktkopien) gehen sofort.
  Neue `fassung` → nach und nach neu, nach allem Neuen.
- **Notiz ohne PDF** (seit 0.4.6, `waisenPruefen`): Fehlt die PDF nur auf diesem Gerät (noch nicht angekommen, anderer
  Sync-Umfang, Platzhalter), bleibt die Notiz, sonst legt ein anderes Gerät sie gleich wieder an. Weg ist eine Notiz erst, wenn
  alles zutrifft: Dieses Gerät hatte die PDF (`eba-volltext-gesehen`, nach dem Update aus 0.4.5 auch, was `eba-volltext-cache`
  kannte), `ilias.json` kennt sie nicht als vorhanden, der Tresor ist ruhig (5 Min. keine neue Datei und keine verschwundene
  PDF; Start zählt als Unruhe), sie fehlte in 3 ruhigen Läufen (`K.WAISE_LAEUFE`) und seit 2 Std. (`K.WAISE_ALTER`). Dann der
  Lebenslauf der Quellen (`Q.wegfall`): unberührt und am Computer in den Papierkorb; auf iPhone und iPad (Platzhalter von iCloud
  ungeprüft) und mit eigenem Text unter `## Meine Notizen` die Marke „(PDF fehlt)“ (`entfaellt: true`, Titel, Karte `eba-info`;
  `fehltMarkieren`), Seitentexte bleiben. Kommt die PDF wieder, nimmt jedes Gerät mit der PDF die Marke weg (`fehltEntfernen`,
  ohne neu zu lesen). Nach einer Entscheidung ist dieses Gerät für die PDF kein Zeuge mehr: Nimmt ein anderes Gerät die Marke,
  setzt es sie nicht wieder. Mehr als 10 und mehr als die Hälfte auf einmal (`Q.zuViel`) → nichts. Ohne `quellen.js` bleiben
  alle Notizen ohne PDF stehen.
- **Grenzen** (`K.GRENZEN`): iPhone/iPad PDFs bis 25 MB, 300 Seiten und 500 000 Zeichen, Lauf 45 s, eine PDF höchstens 120 s;
  was darüber liegt, wartet auf einen Computer („2 warten auf einen Computer.“, auf diesem Gerät gemerkt bis zur nächsten
  Plugin-Version). Computer: 80 MB (größer: Notiz „Zu groß“), 600 Seiten und 1 000 000 Zeichen (mehr: Notiz „Gekürzt“), Lauf
  120 s, eine PDF höchstens 300 s. Je Seite höchstens 20 000 Zeichen. Alle 20 Seiten 30 ms Luft für die Oberfläche.
  `getDocument` mit `isEvalSupported: false` und `disableFontFace: true`, `page.cleanup()` je Seite, `destroy()` im `finally`.
- **Fristen** (nichts hängt bis zum Neustart; ein Versprechen, das nie zurückkommt, hält den Lauf nicht fest): jede Anfrage an
  pdf.js innerhalb der Frist der PDF, eine Seite höchstens 20 s (iPhone/iPad) bzw. 30 s (`K.GRENZEN.*.seite`), Schließen
  (`destroy()`) 5 s, Datei lesen 30 s (`K.LESEN_FRIST`; hängt sie, z. B. als Platzhalter, nächster Lauf). Zu lange an einer PDF
  → sie wird auf diesem Gerät übersprungen wie eine zu schwere, der Lauf geht weiter, der Status nennt es als Warnung
  („Eine PDF brauchte zu lange …“). Lädt pdf.js selbst nicht, endet der Lauf mit Fehler, ohne eine PDF auszulassen.
- **Absturz-Schutz:** Vor dem Öffnen merkt sich das Gerät `eba-volltext-in-arbeit = { pfad, groesse, version }`, danach ist es
  leer. Steht es beim nächsten Start noch da (iOS beendet Obsidian z. B. bei Speichermangel), kommt die PDF in
  `eba-volltext-zu-schwer`: iPhone/iPad lassen sie ab dem ersten, ein Computer ab dem zweiten Abbruch aus, bis eine neue
  Plugin-Version kommt; andere Geräte versuchen sie weiter. Lief die App dabei im Hintergrund (`visibilitychange`), wurde sie
  beendet (`beforeunload`) oder liest ein Lauf nach einem Hot-Reload noch (`ctx.bleibend`), zählt es nicht. Ein Lesefehler der
  Datei (z. B. noch nicht ganz geladen) zählt auch nicht: nächster Lauf.
- **Gerätelokal:** `eba-volltext-cache` (je PDF Größe, Änderungszeit, SHA-256), `-in-arbeit`, `-zu-schwer`, `-waisen` (seit
  wann und in wie vielen ruhigen Läufen eine Notiz ohne PDF ist), `-gesehen` (PDFs, die dieses Gerät hatte), `-stand`.
  Synchronisiert nur die Notizen und die Sperre (beide in `.gitignore`, von `release.py` ausgelassen, von `pruefen.py` gemeldet).
- **Für die Oberfläche:** `ctx.volltext.status()` → gemeinsame Form der Quellen (`zustand`: an, laeuft, fehler,
  anderes-geraet, aus, extern, fremd; `geprueft`, `fehler` bis zum nächsten Durchgang ohne Abbruch, `fehlerZeit`, `warnungen`)
  und `{ an, extern, fremd, laeuft, anderes, pdfs, durchsuchbar, ohneText, offen, warten, zuletzt, fortschritt, text }` mit fertigem Satz („58 PDFs durchsuchbar, 2 ohne Text.“, „Liest 12 von 40 PDFs …“,
  „Kommt über deinen eigenen Abgleich.“); `setzen(an)`, `nachholen({ hier })` (`hier`: Sperre von einem anderen Gerät holen),
  `beobachten(fn)` mit `start`, `fortschritt` und `fertig` (nie Dateinamen; `fertig` ohne Lauf nur, wenn sich der Stand ändert).
- **Gemessen** (18.10.2026, PC, Obsidian 1.14.4, pdf.js 5.3): 58 echte Kurs-PDFs im Dev-Tresor in 42 s; die größte (9,5 MB,
  164 Seiten) in 1,0 s mit +18 bis +56 MB Speicher; erfundene 600 Seiten mit 24 MB bis zur Zeichengrenze in 1,6 s, +28 MB,
  längste Pause der Oberfläche 88 ms. Mit den Grenzen eines iPhones endet dieselbe PDF nach 0,2 s (Seitenzahl) und wartet auf
  einen Computer. Auf iPhone und iPad noch nicht gemessen (Schätzung: zwei- bis viermal langsamer, Speicher etwa doppelte
  Dateigröße).
- **Grenzen:** Suchtreffer erscheinen doppelt (Begleitnotiz und Textfassung), die Schnellauswahl zeigt `_Volltext` (keine API
  zum Ausblenden). Platzhalter von iCloud beim Lesen sind ungeprüft.
- **Tests:** `tests/volltext.test.js` (Tresor im Speicher, erfundene PDFs über ein falsches pdf.js: Entschärfen, Seitentext,
  Format, Namen, `planen`, fremde Notizen, Sperre, Inkrementell, Umbenennen, Löschen, Grenzen, Budget, Fristen, Absturz-Merker,
  Status). Testeinstieg in Obsidian: `plugin.testVolltextAus = true` schaltet die automatischen Läufe ab.

## ILIAS-Kalender (seit 18.10.2026, `ilias-kalender.js`)

Die Abgabetermine deiner Übungen aus ILIAS stehen als Fristen unter `Termine/` und damit in Agenda, Kalender, „Nächste Frist“
und auf der Modulseite. Eine Quelle nach dem Quellen-Vertrag; ein eigener Server übernimmt Schlüsselregel und Lebenslauf, statt
eigene zu bauen.

- **Verbinden** wie Alma (Zeile „ILIAS-Kalender“ unter Verbindungen, Art `link`): In ILIAS 10 **Persönlicher Arbeitsraum** →
  **Kalender**, neben dem Monatsblatt **Abonnieren** (Fenster „Kalender abonnieren“), Link unter **iCal-URL** kopieren
  (Beschriftungen aus der Sprachdatei von ILIAS 10, `btn_ical`, `cal_ical_url`; nicht mit einem Konto im Browser geprüft). Auch
  „iCal-URL (Google Kalender)“ (`limited=1`, ohne Einträge, die älter als 30 Tage sind) geht. `linkPruefen`: https oder webcal,
  Host `ovidius.uni-tuebingen.de` ohne Port und Benutzer, Pfad `/calendar.php`, `client_id` und `token`. Der Link enthält einen
  geheimen Schlüssel: nur gerätelokal (`eba-ilias-ics`, dazu `eba-ilias-ics-status`, `eba-ilias-ics-seit`), nie in einer Datei,
  in Status, Fehlertexten, Hinweisen oder Konsole. Scheitert der erste Abruf, bleibt kein Link gespeichert. Seit 0.4.8 geht es
  mit dem Uni-Login ohne Kopieren (siehe „Uni-Login“); `linkWaehlen` nimmt dann „iCal-URL (Google Kalender)“.
- **Abruf** mit `requestUrl` (Bytes vor dem Dekodieren entfaltet, `bytesLesen` aus `alma.js`), gelesen mit `alma.js` (`lesen`
  behält seit 18.10.2026 die Parameter je Eigenschaft in `PARAM`, dazu exportiert `zeit`, `bytesLesen`, `klartext`).
- **Was übernommen wird:** nur Übungen (`URL` = `goto.php/exc/<ref>`, ältere Formen `goto.php?target=exc_<ref>`,
  `goto_<client>_exc_<ref>.html`) mit Zusatz „(Abgabetermin)“/„(Deadline)“ (Art `abgabe`) bzw. „(Feedback geben bis)“/„(Feedback
  Deadline)“ (`feedback`). Sitzungen (`sess`), Beginn und Ende von Kursen (`crs`, Titel mit Beitrittspasswort) und
  Anmeldefenster von Gruppen (`grp`, stehen zentral) werden nur gezählt (`zaehler`). Tests legt ILIAS nie in den Kalender, darum
  entsteht hieraus nie eine Prüfung. Persönliche Abgabetermine und Übungen in Ordnern fehlen im Abo (ILIAS).
- **Zeit:** nur `TZID=Europe/Berlin` und UTC („Z“); fremde Zonen, Zeiten ohne Zone und ganztägige Einträge fallen weg (fremde
  Zone: Warnung „… Stell in ILIAS die Zeitzone Berlin ein.“). Abgabe um 00:00 → am Vortag „bis 24:00 Uhr“ (das Fachmodell
  kennt 24:00 als Ende des Tages).
- **Schlüssel** `ilias_kalender_id` = `exc/<ref>/<abgabe|feedback>/<8 Zeichen SHA-256 des gesäuberten, kleingeschriebenen
  Aufgabentitels>`, nie die UID (ILIAS legt beim Ändern einer Aufgabe neue Einträge an). Gesäubert heißt: ohne Zusatz, ohne
  Kurspasswort (`ctx.ilias.ohneKennwort`), Leerraum einfach. Zwei Aufgaben mit gleichem Titel in einer Übung: nach Datum „#2“.
  Neuer Titel am selben Tag (gleiche Übung und Art) gilt als dieselbe Abgabe (Haken und Text bleiben); Titel und Datum zugleich
  geändert ergibt Wegfall und eine neue Notiz.
- **Notiz** über `ctx.zentral.notizText` mit `{ herkunft: "ilias-kalender", idFeld: "ilias_kalender_id", weg: "im
  ILIAS-Kalender" }` (zentrale Notizen bleiben Byte für Byte gleich, Test): `kategorie: Frist`, `status: offiziell`, `ort` „bis
  23:55 Uhr · ILIAS“, `quelle` = `https://ovidius.uni-tuebingen.de/goto.php/exc/<ref>` (nie der Abo-Link), `info` „Gilt der
  allgemeine Termin; einen persönlichen Termin zeigt nur ILIAS.“, Modul-Link über `ctx.modell.modul`. Titel nie aus ILIAS: nur
  Code, Art und Nummer 1–30 aus dem Aufgabentitel („B110 Abgabe 3“, „B110 Feedback 3“, ohne Code „Abgabe 3 in ILIAS“). Datei
  `Termine/JJJJ-MM-TT <Code> Abgabe in ILIAS.md` bzw. `… Feedback in ILIAS.md` (in `.gitignore`, `pruefen.py` meldet jede Notiz
  mit dieser Herkunft); neues Datum benennt um (Links ziehen mit). Code: `objekte[<ref>]` im Index der ILIAS-Unterlagen (wo
  `ilias.js` die Übung sah), sonst ein Code im Aufgabentitel, sonst keiner.
- **Keine Doppel:** Gibt es am selben Tag (auch dem Tag in ILIAS vor der 24:00-Regel) mit demselben Code schon eine Frist zu
  einer Abgabe (Titel mit Abgabe, Blatt, Hausaufgabe, Assignment, Deadline, Einreichung, Feedback; zentral, eigener
  Uni-Abgleich oder von Hand; `ctx.modell.termine()`) oder ein Übungsblatt mit Fälligkeit (`ctx.modell.abgaben()`), entsteht keine
  Notiz; eine unberührte wandert in den Papierkorb, ohne Grabstein (verschwindet die andere, kommt sie wieder), eine mit deinem
  Text bleibt. Ohne Code gibt es keinen Vergleich.
- **Lebenslauf:** Grabsteine `angewendet` (Schlüssel → `kurzHash` aus Datum, Uhrzeit, Art, Code) in der Sperr-Datei: Von dir
  gelöscht kommt erst wieder, wenn sich einer dieser Werte ändert. Keine neue Notiz für Abgaben, die schon vorbei sind. In ILIAS
  weg: nur künftige Abgaben (ILIAS lässt Älteres weg), unberührt → Papierkorb, sonst „(entfällt)“ mit Kasten „Dieser Termin steht
  nicht mehr im ILIAS-Kalender“; kommt sie zurück, ist sie wieder normal. Nichts entfernt (Warnung), wenn der Kalender
  unvollständig ankam (kein `END:VCALENDAR` oder ab 900 KB; ILIAS bricht bei 1 MB ab), keine Abgabe kam, obwohl mindestens 3
  künftige bekannt sind, oder mehr als die Hälfte (und mehr als 2) fehlen. Doppel einer id: `Q.dubletten`. Ein abgelaufener
  Link ändert nichts.
- **Ein Schreiber:** `sperre.js`, Quelle `ilias-kalender` (`System/Daten/ilias-kalender-abruf.json`). Der Zeitplan (`Q.planen`:
  20 s + 0–100 s nach dem Einlesen, alle 2 Std., nach Fehlern 15, 30, 60 Min., zurück in der App nach über 2 Std.) läuft nur mit
  Link auf diesem Gerät, fragt bei jedem Lauf `eba.quelleExtern("ilias-kalender")` und wartet, solange ein anderes Gerät schreibt;
  jeder Knopf übernimmt. Trennen gibt die Sperre frei.
- **Status** in der gemeinsamen Form (`zustand`: extern, nicht-verbunden, laeuft, fehler, anderes-geraet, an), dazu `abgaben`
  (kommende offene) und `linkFehler`. Fehler: 401, 403, 404, 410 oder eine Antwort ohne Kalender → „ILIAS kennt diesen Link nicht
  mehr. Bitte den Link in ILIAS neu kopieren.“ und ein Punkt unter „Bitte prüfen“ (nur auf dem Gerät mit Link; mit Uni-Login
  „Unter Verbindungen **Neuen Link eingeben** tippen, den Rest macht Studium Autopilot.“, nachdem `erneuern` höchstens einmal am
  Tag einen neuen Link versucht hat, siehe „Uni-Login“); sonst „ILIAS
  antwortet nicht (Fehler n)“ bzw. „Keine Verbindung zu ILIAS“. Warnungen des letzten Laufs stehen in der Zeile und unter „Bitte
  prüfen“. Hinweise (Notice) nur nach deinem Tipp.
- **Für andere Skripte:** `ctx.iliasKalender = { status(), linkPruefen(link), linkWaehlen(links), verbinden(link, { nurBeiErfolg }), aktualisieren(o),
  trennen(), fehler(), hinweise(), K }` und die reinen Teile (`artAus`, `zielAus`, `zeitpunktAus`, `nummerAus`, `eintraegeAus`,
  `schonDa`, `titelVon`, `dateiNameVon`, `eintragVon`). Testeinstiege: `plugin.testIliasKalenderAus = true` (kein automatischer
  Lauf), `plugin.testKalenderAbruf = async ({ url }) => ({ status, text })` (kein Netz).
- **Tests:** `tests/ilias-kalender.test.js` (erfundene Kalender: Form wie echt → keine Notiz, Code aus dem Index, nie Titel oder
  Passwort, Schlüssel bei neuer UID, neuer Titel, „#2“, Grabstein, 00:00, Zeitzonen, Wegfall, Schutz, Doppel, Link nie sichtbar,
  Sperre, extern, zentrale Notizen gleich); `tests/ilias.test.js` (`objekte`), `tests/verbindungen.test.js` (Zeile),
  `tests/fachmodell.test.js` (24:00).

## Uni-Login (seit 0.4.8, `uni-login.js`)

Einmal Benutzername und Passwort der Uni, dann verbindet Studium Autopilot alles, was diesen Login braucht: ILIAS-Unterlagen,
den ILIAS-Kalender und den Alma-Stundenplan. Bis 0.4.7 musste man die Abo-Links von ILIAS-Kalender und Alma selbst kopieren
(je vier Schritte in ILIAS bzw. Alma), obwohl das Passwort für ILIAS schon gespeichert war.

- **Zustimmung** (Entscheidung vom 19.10.2026, Bedingung des Orchestrators): Wer seinen Uni-Login eingibt, stimmt zu, dass sich
  Studium Autopilot damit bei ILIAS **und** Alma anmeldet, aber nur, wenn das Fenster es vor der Eingabe sagt. Darum nennt im
  Fenster „Mit Uni-Login verbinden“ (`IliasFenster`) und in der Einrichtung (Bildschirm 5) ein Satz über den Feldern, was der
  Login holt („Mit deinem Uni-Login holt Studium Autopilot deine Unterlagen aus ILIAS, die Abgaben aus dem ILIAS-Kalender und
  deinen Alma-Stundenplan.“, Registry `kurz`; was von außen kommt, fehlt im Satz; aus Noten & Anmeldungen `kurzOhneKurse`), und
  die Datenschutz-Zeile, wo er sich anmeldet („Damit meldet sich Studium Autopilot bei ILIAS und Alma an. …“). Die Zustimmung gilt
  je Quelle und Gerät (gerätelokal `eba-uni-zustimmung`) und nur für das Passwort, das danach gespeichert ist (Zeitpunkt ≥
  `uniZugang().seit`): `zustimmen(uniQuellen)` nach der Anmeldung in diesen beiden Fenstern (genau die Quellen, die der Satz
  nannte, Registry `uniQuellen`; liest die Einrichtung eine ältere Registry ohne das Feld, für keine), `zustimmen([id])` beim Tipp auf **Verbinden** im
  Link-Fenster einer Quelle (der Satz dort sagt, bei wem es sich anmeldet) und in der Einrichtung mit schon gespeichertem Login
  (der Satz nennt, was fehlt und wo es sich anmeldet). Von selbst verbindet der Uni-Login nach der Anmeldung nur, was zugestimmt,
  hier nicht verbunden, nicht über ein anderes deiner Geräte verbunden (`ctx.verbindungen.imTresor`, wie Zeilen und Schloss) und
  nicht von außen ist (`offen()`; `moeglich()` ohne die Zustimmung). In einem Tresor mit eigenem Uni-Abgleich also nichts; dort
  meldet sich das Fenster nur für die Übungsgruppen bei ILIAS an und verbindet nichts weiter. Ein Login aus 0.4.7 oder früher hat
  keine Zustimmung: Dort passiert nichts von selbst, auch kein neuer Link im Hintergrund, bis zum Tipp auf **Verbinden**.
  **Noten & Anmeldungen** bleibt davon getrennt (Beta, eigenes **Einschalten**).
- **ILIAS-Kalender:** `ctx.ilias.kalenderLinks()` nimmt die Sitzung des letzten Laufs (sonst eine neue Anmeldung, wie ein Lauf
  nur mit Zugang und ohne Ablehnung), holt `ilias.php?baseClass=ilDashboardGUI&cmd=jumpToCalendar` und daraus das Fenster
  „Kalender abonnieren“ (`ilias-html.js` `aboFenster`: ajaxRenderUrl mit `cmdClass=ilcalendarsubscriptiongui&cmd=getModalForSubscription`;
  `aboLinks`: die Links aus `a href` und `input value`). ILIAS legt den Schlüssel nur beim ersten Öffnen an, danach bleibt
  derselbe. `ctx.iliasKalender.linkWaehlen` nimmt „iCal-URL (Google Kalender)“ (`limited=1`: ohne Termine, die älter als 30 Tage
  sind; für Abgaben reicht das Künftige, und der Kalender bleibt unter der Grenze von 1 MB), sonst „iCal-URL“. Lehnt ILIAS das
  Passwort dabei ab, gilt dasselbe wie nach einem Lauf (Stand gesperrt, Marker, Gruppen frei).
- **Alma-Stundenplan:** `ctx.almaKonto.stundenplanLink()` (ohne Beta und ohne **Einschalten**) meldet sich mit derselben Anmeldung
  wie Noten & Anmeldungen an (`mitAlma`: Drossel, nur `alma.uni-tuebingen.de`, Abmelden in jedem Ausgang), liest „Mein Studium →
  Stundenplan“ und meldet sich ab. Der Link steht dort schon im versteckten Fenster „Daten für iCalendar (ics) exportieren“
  (`alma-konto-html.js` `stundenplanLink`: `textarea …:ical:cal_add` und `data-page-permalink`; zwei verschiedene → keiner).
  Nichts wird angeklickt; „Sicherheitsmaßnahmen erneuern“ im selben Fenster erneuert den Schlüssel im Link und bleibt
  unberührt. Wie ein Lauf nur, wenn ILIAS das Passwort bestätigt hat (`uniZugang().bestaetigt`), nie nach einer Ablehnung; lehnt
  Alma eindeutig ab, schreibt das Gerät den Marker. Der Stand von Noten & Anmeldungen bleibt unberührt. Eine Alma-Sitzung zugleich:
  Auf iPhone und iPad teilen sich Sitzungen die Kekse, das Abmelden der einen beendete die andere; darum wartet der Link-Abruf auf
  einen laufenden Lauf von Noten & Anmeldungen und umgekehrt. Hat Alma gebremst (`pauseBis` nach 403/429 oder wiederholten
  Fehlern), meldet sich auch der Link-Abruf bis dahin nicht an (`art: "stopp"`).
- **Verbinden** danach wie mit einem eingefügten Link (`ctx.verbindungen.holen(id).verbinden(link)`): Nur wenn der erste Abruf
  klappt, bleibt der Link gespeichert (gerätelokal `eba-ilias-ics` bzw. `eba-alma-ics`, nie im Tresor).
- **Link gilt nicht mehr:** Zeigt ein Abruf auf den Link (ILIAS: 200 ohne Kalender, 401, 403, 404, 410; Alma: 200 ohne
  Stundenplan, 401, 404, 410, nicht 403, so bremst Alma), fragen `ilias-kalender.js` und `alma.js` `erneuern(id, alterLink)`. Mit
  Zustimmung für diese Quelle höchstens einmal am Tag je Quelle und Gerät (gerätelokal `eba-uni-erneuert`) holt das einen neuen
  Link; die Quelle speichert ihn und versucht es gleich noch einmal (`erneuert`). Derselbe Link zählt nicht als neu. Beim Verbinden
  mit einem eingegebenen Link nie (`erneuert: true`).
- **Oberfläche:** Link-Fenster (Alma, ILIAS-Kalender) mit gespeichertem Uni-Login: „Studium Autopilot meldet sich mit deinem
  Uni-Login **zxabc01** bei Alma (bzw. ILIAS) an und holt den Link selbst.“, **Verbinden** und leise „Link selbst einfügen“;
  scheitert es, die Schritte zum Einfügen mit dem Grund darüber (`vonHand`). Ohne Uni-Login auf diesem Gerät steht unter den
  Schritten leise „Ohne Kopieren: Mit Uni-Login verbinden“. Im Fenster „Mit Uni-Login verbinden“ stehen nach den Kursen Zeilen
  für Kalender und Alma („… wird verbunden …“, dann ✓ mit Ergebnis oder der Grund; `uniStandZeigen`); ist das Fenster schon zu,
  kommt ein Hinweis mit höchstens zwei Sätzen ohne Vorsatz (`hinweis`). Fehlersätze je Grund (abgelehnt, zweiter Faktor,
  Zustimmung, unklare Antwort, kein Link, keine Verbindung, gebremst, Login fehlt, alte Fassung; ILIAS: der Satz der Anmeldung mit
  Code, ohne Adressen). Wort: **Uni-Login** (Wortliste, nicht „Uni-Zugang“).
- **Absicherung beim Tipp:** `linkHolen` fragt jedes Mal neu, ob es geht (Login bereit, nicht von außen; per Sync kann ein eigener
  Uni-Abgleich ankommen, während ein Fenster offen ist; dann zeigt das Link-Fenster nur den Satz und bietet kein Einfügen an).
  `bereit()` prüft neben dem Marker auch den Stand von ILIAS (`gesperrt`), falls der Marker nach einer Ablehnung nicht geschrieben
  werden konnte; der Grund heißt dann wie bei ILIAS (abgelehnt, zweiter Faktor, Zustimmung), nicht „Login fehlt“.
- **Trennen** bleibt je Quelle: ILIAS trennen löscht den Uni-Login; Kalender und Stundenplan behalten ihre Links.
- **Schnittstelle** (Bibliothek, `ctx.user["uni-login"](ctx)`; beim Laden passiert nichts): `bereit()`, `kannSelbst(id)`,
  `zugestimmt(id)`, `zustimmen(ids?)`, `moeglich()`, `offen()`, `linkHolen(id)`, `verbinden(id)` → `{ ok, text }` | `{ ok: false, art,
  fehler }`, `alleVerbinden({ schritt })`, `erneuern(id, alt)`, `zeile(id, ergebnis)`, `hinweis(ergebnisse)`, `QUELLEN`, `NAME`.
  Gleichzeitige Aufrufe für dieselbe Quelle teilen einen Abruf.
- **Geprüft vor dem Release** (adversariale Prüfung am 19.10.2026, nach dem Zusammenführen nachgeholt): Behoben wurden die
  Anmeldung bei Alma im Hintergrund mit einem Login aus 0.4.7 (jetzt Zustimmung je Quelle), die Schritt-Zählung der Einrichtung
  (`einrichtung_fassung`), gleichzeitige Alma-Sitzungen, die Anmeldung trotz Bremse (403, `pauseBis`), der fehlende Weg zum
  Einfügen, Fehlersätze, der Hinweis, zwei Namen für Alma und die Absicherung beim Tipp; eine Kontrollrunde fand danach drei kleine
  Folgefehler (Zustimmung für Ungenanntes, Schloss eines Tresors aus 0.3.x nach erneutem Start, Grund bei Sperre), auch behoben.
  Die Prüfung vor dem Release 0.4.8 fand noch zwei Lücken, behoben: Die Einrichtung stimmte auch nach dem Satz einer älteren
  Registry zu (Skripte kommen per Sync einzeln), und eine Quelle ohne lesbaren Stand galt als „nicht von außen“.
  Bewusst offen: Zwei gleichzeitige
  Anmeldungen bei ILIAS, wenn der Kalender-Link genau dann erneuert wird, während ein ILIAS-Lauf ohne gemerkte Sitzung anfängt
  (höchstens einmal am Tag, beide Anmeldungen gelten).
- **Geprüft** am 19.10.2026 an echten Seiten (ein Konto, nur lesend): Beide Links standen nach der Anmeldung in der Seite bzw.
  im nachgeladenen Fenster und waren gleich den gespeicherten; das Lesen hat keinen neuen Link erzeugt.
- **Tests:** `tests/uni-login.test.js` (Reihenfolge, nur mit bestätigtem Login, Zustimmung je Quelle und Passwort, übersprungen,
  Fehler je Quelle, Hinweis, einmal am Tag, Absicherung, geteilter Abruf), `tests/verbindungen.test.js` (Sätze vor der Eingabe),
  `tests/einrichtung.test.js` (Schritt-Zählung, Schloss), `tests/ilias-html.test.js` (`aboFenster`, `aboLinks`), `tests/alma-konto-html.test.js` (`stundenplanLink`),
  `tests/alma-konto.test.js` (Ablauf am PC und wie auf iOS, Passwort nur im POST, Ablehnung, kein Link), `tests/ilias.test.js`
  (Kalender-Abo über die Sitzung der Prüfung, Ablehnung), `tests/ilias-kalender.test.js` und `tests/alma.test.js` (neuer Link).

## Einrichtung (seit 0.3.0)

`einrichtung.js` ersetzt die Personalisieren-Karte. Ein Obsidian-Modal (`eba-modal eba-modal-einrichtung`) mit sieben
Bildschirmen (seit 0.4.8; bis 0.4.7 acht, je einer für Alma und ILIAS): 1 Willkommen (ein Satz, **Los geht’s** / *Später*), 2 Studienbeginn (Semester-Auswahl aus
`ctx.modell.semesterAuswahl()`, vorausgewählt das aktuelle Semester; Hinweis „Heute bist du im n. Fachsemester.“),
3 Variante (vier Optionen aus dem Feld-Register, „Noch offen“ = `offen` vorausgewählt), 4 Über dich (Name, Zielnote; Prüfung
`ctx.personalisieren.zielnotePruefen`), 5 Dein Uni-Login (seit 0.4.8, freiwillig, siehe „Uni-Login“: ein Satz, Benutzername,
Passwort, Datenschutz-Zeile; **Verbinden** prüft den Zugang, liest die Kursliste, startet den ersten Abruf im Hintergrund und
verbindet ILIAS-Kalender und Alma mit, Fortschritt in der Meldung; danach je Zeile ✓ oder der Grund. Schon auf diesem Gerät
gespeichert: ein Satz und, wenn Kalender oder Alma fehlen, **Verbinden** ohne Passwort. Im eigenen Uni-Abgleich, mit zu altem
Obsidian oder ohne Anmeldebaustein nur ein Satz und **Weiter**), 6 Darstellung (seit 17.10.2026: derselbe Umschalter
Hell · Dunkel · Automatisch, `ctx.darstellung.schalter`, seit 18.10.2026 darunter dieselben Design-Kacheln wie in Einstellungen &
Hilfe, `designWahl`; Antippen schaltet sofort um, nur **Weiter**, siehe
[Darstellung](#darstellung-hell-dunkel-automatisch-und-design)), 7 Fertig (Zusammenfassung mit Hell, Dunkel oder Automatisch, ohne
das Design, das keinen Namen hat, dazu Stundenplan, Unterlagen und Abgaben; „Später nachholen“ mit Knopf zum Bildschirm). Ab
Bildschirm 2 „Schritt n von 6“ und Punkte; Zurück jederzeit, Überspringen auf 2–5.

Regeln: je Bildschirm ein Satz und eine Hauptaktion, keine Fachwörter; kein Autofokus (sonst springt auf dem iPhone die Tastatur
auf); Tippflächen ≥ 44 px, Eingaben 16 px; auf dem iPhone bildschirmfüllend (`eba-core.css` Abschnitt 45). Esc, × und
„Später“ schließen ohne zu schreiben. Eingaben ohne Weiter bleiben im Speicher (`ctx.bleibend("entwurf")`).

**Zustand** in `System/Einstellungen.md` (synchronisiert, gilt für alle Geräte):

| Feld | Werte |
|---|---|
| `einrichtung` | `offen` (oder leer) · `laeuft` · `fertig` |
| `einrichtung_schritt` | Bildschirm 1–7, an dem es beim nächsten Start weitergeht |
| `einrichtung_fassung` | `2` (seit 0.4.8, bei jedem Speichern): Zählung mit sieben Bildschirmen. Fehlt das Feld, stammt der Schritt aus 0.4.7 oder früher (5 Alma, 6 ILIAS, 7 Darstellung, 8 Fertig; Fertig war bis 0.3.x 6, in 0.4.0–0.4.4 7), und `zustand()` rechnet um: ab 6 eins weniger (6 ILIAS und 5 Alma → 5 Uni-Login). Startet ein Tresor aus 0.3.x die Einrichtung erneut, gilt der Uni-Login als übersprungen (`uni`), damit das ILIAS-Schloss nach dem Speichern bleibt |
| `einrichtung_uebersprungen` | Liste aus `studienbeginn`, `variante`, `angaben`, `uni`; `alma` und `ilias` stammen aus Einrichtungen bis 0.4.7 und gelten weiter (erledigt der Uni-Login den Bildschirm, fallen sie weg) |

Geschrieben wird nur nach einem Tipp auf **Los geht’s**, **Weiter** oder **Überspringen**: Antworten des Bildschirms und Stand
zusammen in einem `processFrontMatter` (Studienbeginn als festes Datum, nicht leer, damit er nicht mit dem Semester wandert).
Der Schritt zu Fertig (Bildschirm 7) setzt `fertig`. Die Darstellung steht nicht hier, sondern nur auf dem Gerät. „Erneut starten“ (Aktion `einrichtung`, `ab=2`) beginnt bei 2, vorausgefüllt, ohne Zurück zum
Willkommen; der Status bleibt `fertig`.

**Automatisch** (`start()`, nur beim App-Start): wenn der metadataCache eingelesen ist (`initialized`, sonst `resolved`) und das
Dashboard steht, höchstens einmal je App-Sitzung (`sessionStorage`, damit ein Neuladen des Plugins, z. B. nach einem Update,
sie nicht erneut öffnet). Gezeigt wird, wenn `einrichtung` ≠ `fertig` und (`laeuft` oder der Tresor ist nicht eingerichtet:
kein Name, kein Studienbeginn, keine Notiz in `Stundenplan/`). Ein Tresor aus 0.2.0 mit Angaben sieht sie also nicht, und es
wird nichts geschrieben. Weitere Geräte: Der Stand kommt per Sync; trifft `fertig` oder ein Name ein, während dort nur das
Willkommen offen ist, schließt es sich von selbst.

**Schloss:** `ctx.einrichtung.almaOffen()` = `einrichtung` ≠ `fertig` oder `uni` (bis 0.4.7 `alma`) übersprungen. Das Alma-Schloss
(`eba-schloss alma`, Wochenraster auf Dashboard und Stundenplan) erscheint nur, wenn das gilt **und** kein Stundenplan da ist
**und** dieses Gerät nicht verbunden ist. `iliasOffen()` gilt ebenso für `uni` bzw. `ilias`, dazu bei `fertig` mit
`einrichtung_schritt` ≤ 6 ohne `einrichtung_fassung`: Die Einrichtung wurde vor 0.4.0 abgeschlossen. So ein Tresor sieht die Einrichtung nach dem Update
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
von `eba-core.css`). Form und Schrift von Flieder und Klar gelten hell und dunkel (seit 18.10.2026; vorher sah dunkel immer
aus wie Elfenbein), ihre Farben nur hell: dunkel gelten die dunklen Farben von Elfenbein, bis beide eigene haben. Gewählt wird über eine Klasse am
`body` (`eba-design-flieder`, `eba-design-klar`; Elfenbein ohne Klasse), nicht über das Ein- und Ausschalten der Bausteine:
Die eingeschalteten Bausteine stehen in `appearance.json` und kämen auf alle Geräte. Alle drei sind immer an. Die hellen
Regeln von Elfenbein (Form und Schrift) stehen darum unter `:is(.theme-light, .theme-dark):where(:not([class*="eba-design-"]))`,
die der Designs unter `.eba-design-…:where(.theme-light, .theme-dark)`, ihre Farben unter `.eba-design-….theme-light`. Alle
sind so spezifisch wie `.theme-light`: Die Ausnahmen in `eba-core.css` (Folien,
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
- Darunter die Designs als drei gleiche Vorschau-Kacheln ohne Text (`designWahl()`, `.eba-dk`, `eba-core.css` Abschnitt 43,
  Baustein „Vorschau-Kacheln“ in [design.md](design.md)): je eine Mini-Karte in den hellen Farben und der Rundung des Designs
  (Seite, Karte, Akzent, Vorschau-Variablen `--m-*`), gewählt mit Ring und Haken; `role="radiogroup"`, je Kachel ein Knopf
  `role="radio"` mit `aria-label`/`title` „Design 1“ bis „Design 3“, Tab auf die gewählte, Pfeiltasten, Pos1 und Ende wechseln
  (`designNachTaste()`); zeichnet `designSetzen()` den Block neu, bekommt die neue Kachel den Fokus. **Designs haben für
  Nutzer:innen keine Namen** (seit 18.10.2026): Elfenbein, Flieder und Klar gibt es nur in Code, CSS und dieser Doku; die
  Wortliste (`tests/wortliste.js`, Regel `design-ohne-namen`) findet sie in Texten der App. Bis 18.10.2026 stand je Design eine
  Zeile mit Namen, Farbmuster, Pille „gewählt“ oder „Wählen“ und dem Satz „dunkel mit den Farben von Elfenbein“; den Satz gibt
  es nicht mehr, hell oder dunkel wählt der Umschalter darüber.
- Aktion und Befehl `darstellung` (`wert` = `hell`, `dunkel`, `automatisch`; ohne Wert eine Auswahl), ohne Hinweis.
- Aktion und Befehl `design` (`wert` = `elfenbein`, `flieder`, `klar`; ohne Wert eine Auswahl „Design 1“ bis „Design 3“), ohne
  Hinweis.
- Beim Wählen und einmal beim Start (nur wenn `eba-core` an ist) schaltet `schemaSichern()` `eba-core` und
  `eba-paper-elfenbein`, `eba-flieder` und `eba-klar` ein und die früheren Designs aus. Sonst sähe ein Tresor, in dem eines davon gewählt war, nach dem
  Update ungestaltet aus (das Update verschiebt ihre Dateien in die Sicherung).
- Schrift auf einer Akzentfläche nimmt `var(--text-on-accent, #fff)`, nie die Kartenfarbe: dunkel wäre sie zu schwach.
- Für die Einrichtung und Tests: `ctx.darstellung = { MODI, DESIGNS, modusAus, modus, dunkelFuer, setzen, segmente, schalter, design,
  designKacheln, designNachTaste, designSetzen, designWahl, anwenden, schemaSichern }`; rein und getestet sind `modusAus()`,
  `dunkelFuer()`, `segmente()`, `designKacheln()` und `designNachTaste()`, `setzen()`, `designSetzen()`, `anwenden()` und
  `designWahl()` mit Ersatz für Gerätespeicher, `body` und Elemente (`tests/darstellung.test.js`). `schalter(el)` zeichnet den
  Umschalter, `designWahl(el)` die Kacheln.

## Personalisieren

Das Formular (Aktion und Befehl `personalisieren`, Knopf „Ändern“ in den Einstellungen) hat Name, Studienbeginn als
Semester-Auswahl (mit Vorschau „1. Fachsemester … · heute n. FS“ und Hinweis bei Beginn im Sommersemester), Variante und
Zielnote (1,0–4,0, Komma oder Punkt, gespeichert als „2,3“). Speichern schreibt nach `System/Einstellungen.md`; leere Felder
werden leer (`name:`), nicht `""`. Danach zieht `abgleichen()` die Semesterliste nach. Semester-Auswahl, Vorschau und
Zielnoten-Prüfung nutzt auch die Einrichtung (`ctx.personalisieren.semesterOptionen`, `vorschauTeile`, `zielnotePruefen`).

**Feld-Register** (`felder.js`, seit 0.4.5, Konsistenz-Audit Schritt 3): Angaben, die an mehreren Stellen eingegeben werden,
sind einmal beschrieben (`ctx.user.felder`, Bibliothek ohne Obsidian): `VARIANTE` (gespeicherte Werte in einer Reihenfolge
Economics, Business Administration, ohne Spezialisierung, offen; Titel „Noch offen“, im Satz „noch offen“; `varianteLesen`,
`varianteFinden`, `varianteTitel`, `varianteImSatz`), `STUDIENBEGINN` (Datum oder leer = „Aktuelles Semester“, wandert mit; die
Einrichtung trägt bewusst ein festes Datum ein; `studienbeginnLesen`, `studienbeginnLeerTitel`), `NOTE` (Modulnote 1,0–4,0 in
Zehnteln oder 5,0, mit Komma; `notePruefen`) und `ZIELNOTE` (1,0–4,0, höchstens zwei Nachkommastellen; `zielnotePruefen`).
Einrichtung, Formular, Zeilen „Variante“, Befehl „Variante wählen“ (`aktionen.js`) und Modulfeld (`modul.js`) nutzen nur das
Register; vorher hatte jede Stelle eigene Reihenfolgen und Wörter („Weiß ich noch nicht“, „noch offen“, „Noch offen“). Eine
neue Eingabe, die an mehr als einer Stelle vorkommt, kommt dorthin. Tests: `tests/felder.test.js`.

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

Begleitnotizen (`typ: unterlage`, auch Folien als Markdown) und Volltexte öffnen seit 19.10.2026 in der Leseansicht, ohne Sperre
(`ctx.leseansicht.zuerstLesen`, im Kern `notizOeffnen`; `ansicht: bearbeiten` geht vor): Sie sind zum Lesen da, das Buch oben schaltet
zum Bearbeiten. Vorher öffneten sie in der Bearbeitungsansicht, wo ein Tipp auf den PDF-Kasten in den Quelltext sprang.

Seit 17.10.2026 (`start.js`, Punkt 2): Notizen mit `typ` `dashboard`, `übersicht`, `einstellungen` oder `daten` bleiben in der
Leseansicht (auch `Studium/Termine & Anmeldungen.md`, seit die Anmeldungen sich selbst füllen). Das Feld `ansicht` geht vor (`lesen`
sperrt jede Notiz, `bearbeiten` gibt sie frei; in der Seitenleiste „Eigenschaften“ auch bei gesperrter Notiz änderbar). Der Knopf
zum Bearbeiten im Kopf der Ansicht (`view.modeButtonEl`) ist dort ausgeblendet; wer umschaltet (Strg/⌘ E, Befehl), landet mit
Hinweis wieder in der Leseansicht. Geht ein Tab von einer gesperrten Seite zu einer freien Notiz, öffnet sie in der Bearbeitung
(seit 0.4.6; vorher nur, wenn der Tab vorher eine Notiz bearbeitet hatte). Regel: `ctx.leseansicht.nurLesen(datei)`
(`tests/leseansicht.test.js`); `ctx.oeffnen` nutzt dieselbe Regel (siehe „Bedien-Bausteine“).

Stil aller neuen Teile: `eba-core.css` Abschnitte 43 (Personalisieren, Schloss, Verbindungen, Fenster, Semestertermine),
44 (Musterpläne) und 45 (Einrichtung), nur mit `--eba-*`-Farbtokens (hell und dunkel).

## Dashboard (Regeln seit 18.10.2026)

- **Kacheln** (seit 18.10.2026 Codeblock ```` ```eba-kacheln ```` aus `dashboard.js` auf dem Fachmodell, vorher eine
  Bases-Formel; gleiche Klassen und Gestalt): Gruß und Datum (ohne „KW n“, die steht im Wochenraster), dann immer zuerst
  „Nächste Frist“ (Klassen `akzent frist`: breiter, getönt, Titel groß; eba-core.css Abschnitt 60), danach Nächste Prüfung
  (`naechstePruefung`), Semester, ECTS (`ects`), Gesamtnote (`noten`) und die Leiste „Semesterverlauf“ (Woche „jetzt“ =
  Planwoche). Nächste Frist = `ctx.modell.fristen()[0]`: offene Fristen, die noch laufen oder kommen, nach dem nächsten
  Stichtag (läuft schon: Ende, sonst Beginn); Unterzeile „läuft · bis 25.10.“ bzw. „19.10. · morgen“, dazu „geschätzt“.
  Prüfungen zeigt die Kachel daneben, darum hier nur Fristen. Breit eine Reihe; bis 980 px die Frist über die ganze Breite
  und die vier darunter (zu fünft wären sie auf dem iPad hochkant nur 123 px breit), bis 760 px 2 × 2. Vom 15. bis
  18.10.2026 fehlte die Kachel („Keine Dopplungen“). Tests: `tests/dashboard.test.js`.
- **Fristen · 30 Tage** und **Termine · 14 Tage** (seit 18.10.2026 ```` ```eba-liste fristen ```` bzw. `termine` aus
  `dashboard.js`, vorher Bases; Zeilen „Wann · Was · Art“, eba-core.css Abschnitt 63): Fristen, Prüfungen samt Zwischentests
  und Abgaben der nächsten 30 Tage nach dem Tag, den die Zeile zeigt (läuft: Ende), höchstens 6; Termine aller Kategorien
  außer Frist und Prüfung für 14 Tage, Fachschaft und Veranstaltung nur heute und morgen (sonst fehlte die
  Semestereröffnung am selben Abend), nach Tag und Uhrzeit, höchstens 8. Welche Liste ein Block zeigt, sagt zuerst sein
  Ersatztext („Fristen erscheinen …“): In verschachtelten Karten liefert Obsidian den Abschnitt der äußeren Karte mit beiden
  Kopfzeilen. Die Seite Prüfungen zeigt ```` ```eba-liste pruefungen ```` (kommende Prüfungen, auch aus dem Modulfeld).
- **Nachzuarbeiten** (seit 19.10.2026 ```` ```eba-liste nachzuarbeiten ```` aus `dashboard.js`, vorher Bases mit dem Dateinamen):
  Vorlesungsnotizen ohne Haken bei Nachgearbeitet, älteste zuerst, höchstens 8; links das Modul (`kurz`, sonst Kürzel), dann der
  Name aus `ctx.modell.vorlesung`. Neu gezeichnet, wenn sich eine Vorlesungsnotiz ändert. Leer: „Nichts offen.“.
- **Bitte prüfen** (`bitte-pruefen.js`, Codeblock `eba-bitte-pruefen`, erster Block unter „Zu erledigen“, ohne Karte im
  Markdown): nur im eigenen Uni-Abgleich (`eba.eigenerAbgleich`) und nur, wenn `System/Abgleich/Protokoll.md` einen Abschnitt
  „Bitte prüfen“ (Überschrift beliebiger Ebene) mit Listenpunkten hat. Dann zeichnet der Block selbst eine Karte im Aufbau
  eines Callouts (`eba-pruefen`, eingeklappt; der Zustand gilt je Gerät und bleibt beim Neuzeichnen): Titel „Bitte prüfen ·
  n offen“, Knopf „Protokoll“ und „Jetzt abgleichen“ nur, wenn der eigene Abgleich die Aktion `abgleich` anmeldet (dieses
  Skript startet keinen Abgleich). Darunter je Punkt eine Zeile wie bei den To-dos: Das Kästchen schreibt `[x]` bzw. `[ ]`
  genau in diese Zeile des Protokolls (Text vorher geprüft), „**Titel** · Rest“ wird Titel und Metazeile, Unterpunkte stehen
  gedämpft darunter, Links gehen vom Protokoll aus, fehlende Notizen werden nicht angelegt. Seit 0.4.5 kommen für alle
  Nutzer:innen die Punkte der Quellen dazu (Meldekanal, `Q.meldungen(ctx)`, siehe „Quellen-Vertrag“: Noten & Anmeldungen,
  ILIAS, Alma-Stundenplan …), ohne Kästchen und ohne persönliche Werte; ein Tipp öffnet ihr Ziel, ohne Protokoll keine Knöpfe;
  neu gezeichnet nach `Q.meldenNeu`. Sonst bleibt der Block leer
  (`.eba-bp-aus`) und samt Hülle auf Höhe 0 gefaltet (Abschnitt 59, Regel „Einen leeren Block samt Hülle ausblenden“):
  Normale Nutzer:innen sehen nichts, auch keine leere Karte. Geprüft in Obsidian (18.10.2026): Lese- und Bearbeitungsansicht,
  iPad- und iPhone-Breite, mit und ohne eigenen Abgleich; Obsidians gemessene Abschnittshöhen stimmen, „Im Eingang“ darunter
  erscheint. Tests: `tests/bitte-pruefen.test.js`.

## Bereiche (seit 15.10.2026: 9 statt 13)

Die Seitenleiste „Übersicht“ (seit 19.10.2026; bis 0.4.6 ein Raster-Menü, bis 0.4.5 „Bereiche“; `seitenleiste.js`, `ZIELE`, einzige Quelle) zeigt zehn Seiten: Dashboard,
Stundenplan, Studienverlauf, Termine & Anmeldungen, Prüfungen, Noten & ECTS, Unterlagen, Karteikarten, Kontakte & Links, Einstellungen & Hilfe.
Seit 18.10.2026 steht vor Karteikarten der Lernplan, aber nur, wenn es Lernplan-Notizen gibt (`sichtbareZiele`, `ctx.lernplan.sichtbar()`;
die schreibt nur eine KI, siehe „Lernplan“). Die Icons hängen an `li:has(> a[data-href$="…"])` (eba-core.css Abschnitt 6;
Stundenplan seit 0.4.6 mit Wochenspalten statt des Kalenders von Termine & Anmeldungen). Die Lesezeichen der Vorlage folgen `ZIELE`
(siehe „Öffnen und Navigieren“).

| Seite | Enthält (früher eigene Seite) |
|---|---|
| `Studium/Termine & Anmeldungen.md` | Kalender, Agenda, Angebote der Uni; Abschnitte „Anmeldungen“ (`eba-anmeldungen`, aus den zentralen Fristen, seit 17.10.2026; vorher eine Tabelle mit Spalte „Stand“ zum Eintragen) und „Übungen und Tutorien“ (`eba-gruppen`, darunter eine Karte „Hinweise je Modul“). cssclasses `eba-s-termine` + `eba-s-anmeldungen`, Stil `eba-core.css` Abschnitte 37 und 57 |
| `Studium/Prüfungen.md` | Zeitleiste, Karte „Termine“ (eintägige Prüfungen; Phasen zeigt die Zeitleiste als Band); Karte „Regeln“ |
| `Studium/Noten & ECTS.md`, `Studium/Studienverlauf.md` | je eine Karte „Regeln“ (Prüfungsordnung) |
| `Studium/Unterlagen.md` | Abschnitt „Übungsblätter“ oben (Übungsblätter) |
| `Studium/Kontakte & Links.md` | Abschnitt „Offizielle Dokumente“ (Quellen) |
| `Studium/Einstellungen & Hilfe.md` | Eine Gestalt für die ganze Seite (seit 17.10.2026): jeder Abschnitt ist eine Zeilenliste wie die Verbindungen (Rahmen, Zeilen mit Haarlinie, rundes Symbol, Titel, gedämpfte Zeile, rechts ein Knopf oder der Klapp-Pfeil). Deine Angaben (Name, Studienbeginn, Zielnote, Einrichtung), Verbindungen, Variante (je Variante eine Zeile mit Pflichtmodulen und „Wählen“); Abschnitt „Hilfe“ als `> [!eba-zeilen]` mit je Thema einer klappbaren Karte `> > [!eba-karte\|hilfe\|<thema>]- Titel <span class="eba-zeile-unter">…</span>` (Symbol je Thema in eba-core.css Abschnitt 5), zuletzt „Stand der Angaben“ (offene Punkte). Bis dahin Kasten, Chips mit Tabelle und einzelne Karten |

- **Regeln:** Die Prüfungsordnung steht nach Thema in Karten `> [!eba-karte|regeln]- <Themen>` unter `## Regeln` (Titel nennt
  die Themen statt „Regeln“ zu wiederholen, seit 18.10.2026; Links
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

## Lernplan (seit 18.10.2026, `lernplan.js`)

Regel „70/100“: Nach 70 % der Zeit von Vorlesungsbeginn bis zur Klausur ist jedes Kapitel *verstanden* (nicht beherrscht); die
restliche Zeit gehört der Klausurvorbereitung (Übungen, Altklausuren auf Zeit, Karteikarten). Der Plan verteilt die Kapitel so, dass
jede Woche gleich viel zu tun ist, und sagt je Modul, welches Kapitel bis Sonntag dran ist.

**Woher die Kapitel kommen.** Die Kapitelliste eines Moduls steht in den ersten Folien (Gliederung, Inhalte, Road Map), aber in
jeder Vorlesung anders (1.–7., I.–VI., E und I–VI, eine PDF für alle Teile). Baut ein Modul auf einem Lehrbuch auf und nennt jede
Vorlesung erst ihre Einheiten, sind die Kapitel die Einheiten des Lehrbuchs (Inhaltsverzeichnis), die noch nicht genannten nach der
Modulbeschreibung geschätzt (`vorlaeufig: true`); jede neue Vorlesung berichtigt die Liste. Lesen kann das nur eine KI, und die läuft
seit 19.10.2026 an einer Stelle: Der Uni-Abgleich des Autors pflegt die Listen und veröffentlicht sie als `kapitel.json`
([daten-v1.md](daten-v1.md#kapiteljson)). Jedes Gerät holt sie, der Abrufer schreibt daraus die Notizen (`zentralNotiz`,
`zentralAuswahl`, `zentralAbgleichen`, Tests `tests/kapitel.test.js`); niemand braucht eine eigene KI. Neu geschrieben wird eine
Notiz nur, wenn sich die Liste ihres Moduls geändert hat (gerätelokal gemerkt); dabei bleiben Häkchen, `seit`, `verstanden_bis` und
„## Meine Notizen“. Bei gleicher Liste bleibt die Notiz, wie sie ist. Eine eigene KI (Claude auf dem
eigenen Server) darf weiter Notizen nach dem Gerüst schreiben, ohne `herkunft: zentral`; die überschreibt das Plugin nie. Gibt es
keine Notiz, fehlt der Lernplan in der Übersicht, und die Seite zeigt den Leerzustand „Noch kein Lernplan für deine Module.“

**In Entwicklung** (seit 19.10.2026): Bereich und Lernplan-Notizen zeigen oben die Pille „In Entwicklung“ und einen Satz
(„… auf eigene Gefahr, sie kann sich noch ändern.“), der Inhalt ist abgeblendet und grau, bleibt aber bedienbar; in der Übersicht
ist die Zeile „Lernplan“ abgeblendet. Ein Schalter: `IN_ENTWICKLUNG` in `lernplan.js` (CSS Abschnitt 61, `.is-entwicklung`).

**Lernplan-Notiz** `Lernplan/<Code> Lernplan.md` (Gerüst `System/Gerüste/Lernplan.md`; Name nie wie die Modulnotiz):

| Teil | Inhalt |
|---|---|
| Frontmatter | `typ: lernplan`, `code`, `quelle` (woher die Liste stammt), `stand`; optional `seit` (Plan beginnt in dieser Woche, z. B. bei spätem Einstieg), `verstanden_bis` (Ziel statt 70 %), `vorlaeufig: true` (Liste teils geschätzt; Stand zeigt „(Liste vorläufig)“) |
| Block | ```` ```eba-lernplan modul ```` – eine Zeile mit Stand wie im Bereich |
| `## Kapitel` | je Kapitel `- [ ] <Nummer> <Titel>`, danach mit „ · “ getrennt Links auf die Folien (`[[X100 Folien 01 …]]`, bei einer PDF für alles `[[….pdf#page=30\|S. 30–52]]`) und die Seitenzahl (`23 S.`); bei einem frei zugänglichen Lehrbuch ein https-Link (`[online](https://…)`); eingerückte Aufgaben = Unterkapitel |

`kapitelLesen` liest nur Aufgaben außerhalb von Frontmatter und Codeblöcken; Nummer = erstes Wort, wenn es eine Zahl (auch `1.2`),
eine römische Zahl oder ein einzelner Großbuchstabe ist. Abgehakt = verstanden, bei Unterkapiteln anteilig. Häkchen setzt nur die
Studentin oder der Student (in der Notiz oder mit einem Tipp im Bereich); die KI ergänzt Links und Seiten, wenn Folien dazukommen,
und lässt Häkchen stehen.

**Rechnen** (rein, getestet in `tests/lernplan.test.js`):
- *Gewicht* eines Kapitels (`gewichte`): Seiten aus der Zeile, sonst Feld `seiten` der verlinkten Notiz, sonst der Folien mit gleicher
  Nummer (`typ: unterlage`, `art: Folien`, `nummer`; Varianten „mit Anmerkungen“, „unbeschrieben“, „zum Video“ zählen nicht), sonst der
  Mittelwert der bekannten. Hat kein Kapitel des Moduls Seiten (Lehrbuch online), zählt die Zahl der Unterkapitel. *Da* = ein Link
  zeigt auf eine vorhandene Datei, ein https-Link steht in der Zeile oder Folien mit dieser Nummer existieren.
- *Klausur*: `ctx.modell.pruefungVon(code)` (die eine Regel des Datenmodells); ohne Prüfungstermin der Beginn der nächsten
  Prüfungsphase („geschätzt“), damit der Plan ein Ende hat. *Beginn*: Vorlesungsbeginn des Semesters, frühestens `seit`.
- *Ziel* (`zielVon`): Sonntag der Woche, in der 70 % der Tage von Beginn bis Klausur vorbei sind, höchstens der Sonntag vor der
  Klausurwoche.
- *Wochen* (`kapazitaet`): Anteil der Tage Montag bis Freitag ohne Pausen und freie Tage aus dem Datenmodell; eine Woche ganz in
  einer Pause zählt 30 %. `planen`: Bis Ende der Woche w ist der Anteil der Kapazität bis w am Gesamtgewicht fällig; jedes Kapitel
  bekommt den Sonntag der Woche, in der der Plan es erreicht.
- *Stand* (`stand`, Pille in der Statusfarbe ihrer Bedeutung, docs/design.md): im Plan (Normalfall, keine Pille), **n Kapitel
  voraus** und **alles verstanden** (`ok`), **n Kapitel hinterher** (`warn`: vor dieser Woche fällig, da und offen), **wartet auf
  Kapitel n** (`info`: alle überfälligen sind noch nicht hochgeladen, kein eigenes Versäumnis, wenn man nicht vorlernen kann), nach
  dem Ziel **n Kapitel offen** (`warn`) bzw. **Klausurvorbereitung** (`leer`), nach der Klausur **Klausur vorbei** (`leer`).

**Oberfläche:** Bereich `Studium/Lernplan.md` mit ```` ```eba-lernplan ````: je Modul eine Zeile der Zeilenliste ohne Symbol (Titel,
Pille nur bei einem Zustand, „2 von 7 Kapiteln · diese Woche Kapitel 3 · verstanden bis So 3.1. · Klausur Sa 6.2.“), sortiert nach
Klausur, Vorbereitung und Vorbei ans Ende. Tipp klappt die Kapitel auf (gerätelokal über den Hot-Reload, `ctx.bleibend`): Kästchen
wie bei den To-dos (`.eba-td-haken`, ganze Zeilenhöhe als Tippfläche, auf iPhone und iPad 44 px; halb verstanden = unbestimmt und
„1/3“ hinter dem Titel), Nummer, Titel (Tipp öffnet die Folien bzw. das Lehrbuch), rechts „bis So 25.10.“ bzw. „· noch nicht da“,
darunter der Link auf die Notiz. Abhaken schreibt genau diese Zeile (`- [ ]` ↔ `- [x]`), nur wenn ihr Text noch stimmt, sonst ein Hinweis (wie `todos.js`).
Neu gezeichnet bei Änderungen in `Lernplan/`, `Unterlagen/`, `Termine/`, `Module/`, am Datenmodell und an einem neuen Tag. CSS:
Abschnitt 61 in `eba-core.css`. Beim Start schreibt `lernplan.js` nichts.

**Persönlich:** Lernplan-Notizen nennen die Kapitel deiner Kurse. `Lernplan/` ist in der Vorlage leer (`pruefen.py`, `LEERE_ORDNER`)
und kommt nie in den Datenkanal.

## Modulseite (seit 17.10.2026, `modul.js`)

Jede Modulnotiz (und das Gerüst `System/Gerüste/Modul.md`) hat den Aufbau Kopf (HTML: Pfad, Kürzel als eigene Zeile
`<span class="eba-code">` im `<h1>`, englischer Titel als `eba-untertitel`, Eckdaten) → Codeblock ```` ```eba-modul```` (Modulfeld
und darunter der Abschnitt „Vorlesungen“) → `## Unterlagen` (Codeblock ```` ```eba-unterlagen````) → `## Zum Modul` (bis 0.4.5 „Meine Notizen“) → `## Steckbrief` (Lehrveranstaltung, Prüfung, Ergänzungen wie Rolle je Variante,
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
  „bis So 25.10.“). Kürzel im Titel entfällt. Seit 20.10.2026 auch jeder Ausfall dieser Lehrveranstaltung der nächsten 14 Tage
  (`ctx.modell.ausfaelle`, nicht wegen Pause; vorher übersprang die Liste ihn still) mit Zeit und Art durchgestrichen und Pille
  „fällt aus“, und eine geänderte Sitzung mit Pille „anderer Raum“, „neuer Raum“, „andere Zeit“ oder „geändert“, dem neuen Wert in
  Warnfarbe und dem üblichen durchgestrichen („Hörsaal 9 statt ~~Hörsaal 1~~“, `eba-core.css` 58.7). Der Kopf einer
  Stundenplan-Notiz (`kopf.js`) zeigt nur die Serie („Mi 10:15–11:45“), keinen einzelnen Termin; Ausfälle und Änderungen stehen
  darum dort nicht (eine Stelle je Angabe: Woche und Modulseite).
- *Knöpfe:* Neues Übungsblatt, Karteikarten lernen (nur mit Stapel), Unterlagen einordnen, Suchen.

Die **Vorlesungen** (seit 19.10.2026: die eigenen Notizen gehören zum Meistgenutzten; bis dahin standen sie
ganz unten unter „Zum Modul“ als „VL 01 · 13.10.“) zeichnet derselbe Codeblock direkt unter dem Modulfeld, über `## Unterlagen`,
ohne eigenen Codeblock in den 87 Modulnotizen: Überschrift als `<h2>` (Gestalt wie jedes `##` der Seite), deine
Vorlesungsnotizen aus `ctx.modell.vorlesungen({ code })`, neueste zuerst, als Zeilen wie die Unterlagen (Name wie überall,
„nachgearbeitet“ als Pille, Tipp öffnet), ab sechs Notizen erst die fünf neuesten und „Alle n zeigen“ (gerätelokal). Darunter
**Neue Vorlesungsnotiz** (Fenster mit diesem Modul vorgewählt und Thema; im laufenden Semester der Hauptknopf, vorher „Neue
Vorlesung“ in der Knopfreihe); ohne Notizen davor der Satz „Noch keine Vorlesungsnotizen.“. „Zum Modul“ zeigt seitdem keine
Vorlesungen mehr (Filter `typ != "vorlesung"`, ohne Spalte Nachgearbeitet). Tests: `tests/vorlesungen.test.js`. CSS:
`eba-core.css` Abschnitt 65.

Neu gezeichnet wird bei Änderungen an Modul-, Stundenplan-, Termin-, Vorlesungs- und Kartennotizen, an den Einstellungen und
`System/Daten/`, beim Zurückkommen in die App und alle 10 Minuten. Prüfung, nächste Sitzung, Termine und Statusfarbe kommen
seit 18.10.2026 aus dem Fachmodell (`pruefungVon`, `naechsteSitzung`, `termine`, `statusArt`): Eine abgehakte Klausur steht ohne
Countdown mit „erledigt“, ein bestandenes oder anerkanntes Modul hat keine kommende Prüfung mehr. Reine Logik (`naechstes`,
`band`, `noteOk`, `titelOhne`, `spanne`) in `tests/modul.test.js`. Die Tabelle „Zum Modul“ zeichnet
`tabellen.js` auf allen Geräten als Liste zum Lesen (`--eba-tliste: 1`); ein gesetztes Kontrollkästchen steht als
Pille da, nur bei Notizen, die das Feld haben, „offiziell“ ohne Chip. CSS: `eba-core.css` Abschnitt 58.

Die **Unterlagen** (`unterlagenliste.js`, Codeblock `eba-unterlagen`, seit 18.10.2026; vorher eine Tabelle mit
Werkzeugleiste, Spaltenköpfen und Spalte Art) zeigen alle Notizen mit `typ: unterlage` und dem Kürzel des Moduls (ein Kürzel
im Codeblock geht vor), auf allen Geräten gleich:
- *Abschnitte* je Art in fester Reihenfolge, Name in der Mehrzahl: Folien, Skripte, Mitschriften, Übungen, Tutorium, Altklausuren,
  Lösungen, Eigene Lösungen, Literatur, Scans, Sonstiges; unbekannte Arten mit eigenem Namen vor Sonstiges.
- *Tutorium* (seit 20.10.2026) ist ein eigener Bereich, getrennt von Vorlesung und Übung: Nennt ein Ordner oder der Dateiname das
  Tutorium („Tutoriumsunterlagen“, „Tutoriengruppen/Gruppe 4“, „Unterlagen zu den Tutorien“, „JA_Tutorium10“; nicht „Tutorin“, nicht
  „Tutorial“), ist alles darin Art „Tutorium“, auch Blätter, Lösungen, Folien und Vorlagen (`unterlagen.js`, vor allen anderen
  Regeln). Es liegt immer im Unterordner `Tutorium/` des Modulordners (`unterlagen.js`, `ilias.js` legen ihn an); eine Zahl aus dem
  Ordner einer Gruppe („Gruppe 4: Dienstag …“, „Tutorium 5 | … | Mittwoch …“) ist keine Blattnummer. Lösungen hängen nicht an
  Tutoriumsblättern, sie stehen im Abschnitt Tutorium. Der Uni-Abgleich auf dem eigenen Server folgt derselben Regel.
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
Dashboards und erste Zeile der Liste „Fristen · 30 Tage“ (bewusst beides, siehe „Dashboard“), nächste Prüfung und Gesamtnote nur als Dashboard-Kacheln (eba-verlauf zeigt ECTS und
Orientierungsprüfung), andere Musterplan-Varianten nur auf `System/Daten/Musterplan` (Codeblock-Argument `andere` bleibt
nutzbar). Die Variante wählst du „vor dem 3. Fachsemester“ (ab dann unterscheiden sich die Musterpläne; die PO legt keinen
Zeitpunkt fest), überall in diesem Wortlaut.

**Nächste Prüfung, eine Regel:** seit 18.10.2026 `ctx.modell.pruefungen`, `pruefungVon` und `naechstePruefung` (siehe
„Fachmodell“): Termin-Notizen mit `kategorie: Prüfung` (eintägig) und das Modulfeld `klausur`; Kürzel + Tag zählen einmal, die
Termin-Notiz gewinnt (Link, „geschätzt“), „bestanden“, „anerkannt“ und Ergebnis kommen vom Modul, ein Haken an der Notiz macht
die Prüfung erledigt, entfallene zählen nicht. Zwischentest heißt: Titel oder Dateiname enthält „Zwischentest“, Groß- und
Kleinschreibung egal (seit 17.10.2026); er ist nie die nächste Prüfung, verdeckt keine Klausur am selben Tag und heißt, wo er
erscheint, „Zwischentest“ (Pille `eba-pill info`, im Kalender Art `zwischentest`, im Studienverlauf ein Fähnchen
„Zwischentest n“ ohne Countdown). „Termin folgt“ steht in der Zeitleiste (`klausurzeit.js`) nur, wenn es weder `klausur` noch
eine Prüfungs-Termin-Notiz mit diesem Kürzel in einer Prüfungsphase gibt (auch eine abgehakte zählt).

**Zwischentests auf Prüfungen (seit 17.10.2026):** Termin-Notizen, deren Titel „Zwischentest“ enthält (`klausurzeit.js`:
Titel, sonst Dateiname; Liste: Dateiname), sind freiwillige, unbenotete Tests und auf dieser Seite keine Prüfung. Die
Zeitleiste zeichnet sie als Punkt in `--eba-info` statt `--eba-bad`, mit eigenem Legendeneintrag „Zwischentest“ (nur wenn
einer zu sehen ist); im Tagesstreifen einer Phase heißt der Tag `zt` statt `pk`. Die Liste „Termine“ auf **Prüfungen** zeigt in der
Spalte Stand die Marke „Zwischentest“ (`eba-pill info`). Für „Termin folgt“ zählen sie nie, auch nicht innerhalb einer Phase.
Die Dashboard-Kachel „Nächste Prüfung“ überspringt sie (Regel oben).

Bases-Falle: Ein leeres Feld ist in Formeln und Filtern zwar falsy für `if(feld, …)`, aber `!feld` ist **nicht** wahr.
Für „Feld leer“ `!feld.isTruthy()` schreiben (bzw. `!value.properties.feld.isTruthy()`).

## Claude im Tresor (`.claude/`)

Wer Claude Code im Tresor-Ordner startet, bekommt mit der Vorlage, wie man hier liest und schreibt: `.claude/CLAUDE.md`
(drei Regeln und der Verweis auf den Skill) und den Skill `.claude/skills/studium-autopilot/` mit `SKILL.md` (Grundregeln),
`tresor.md` (Ordner, Notizarten, Felder, Besitz über `herkunft`, Dateinamen), `lesen.md` (Woche, Prüfungen, Noten,
Unterlagen über die Textfassungen, To-dos), `schreiben.md` (Termin, Zusammenfassung in der Begleitnotiz, To-do,
Vorlesungsnotiz, Karteikarten; was nie geschrieben wird) und `fehler-melden.md` (Meldung an den Autor: gehört es zu Studium
Autopilot, schon gemeldet?, ohne persönliche Daten und Unterlagen, Vorlage aus `.github/ISSUE_TEMPLATE`, ganze Meldung zeigen,
dann ein vorausgefüllter Link `issues/new?template=…&<Feld-id>=…` ohne `labels=`, den die Person selbst abschickt;
Sicherheitslücken nur privat wie in `SECURITY.md`). Dieselbe Regel steht für die Einrichtung im Skill `server-einrichten`,
und Claude auf dem eigenen Server beginnt einen Hinweis zu einem falschen zentralen Termin mit „Zentraler Termin wohl falsch:“. Es gibt keine Schnittstelle dazwischen: Claude schreibt die Dateien
so, wie das Plugin sie selbst anlegt, und das Plugin erkennt sie am `typ`.

- **Update:** `.claude/` hat keine Klasse (`klasse_von` in `pruefen.py`, `klasseVon` in `update.js`) und steht darum nicht in
  der Update-Liste; der Skill kommt mit einer neuen Installation (ZIP). Grund: Das Update plant der `update.js` der
  installierten Version, und die Planer bis 0.4.6 lehnen eine Liste mit einem Pfad ohne Klasse ganz ab („Liste: Datei nicht
  erlaubt“), es gäbe also kein Update. Soll ein Update den Skill bringen, braucht die Liste dafür einen eigenen Schlüssel, den
  ältere Planer übergehen. Eigene Regeln gehören in einen eigenen Skill unter `.claude/skills/<name>/`; auch `.claude/settings*.json`
  fasst kein Update an.
- **Gleiche Regeln wie der Code:** `tests/claude-skill.test.js` prüft Kategorien (`zentral.js`), Arten der Unterlagen
  (`unterlagen.js`), Abschnitte der Begleit- und Vorlesungsnotizen, die Auswahl der To-dos (`todos.js`) und die Id-Felder der
  Quellen (`quellen.js`) gegen den Text des Skills.
- Der Skill des eigenen Servers (`server/skill/studium-autopilot/`) ist ein anderer: Er schreibt nie Notizen, sondern das
  Eingang-Format, das das Plugin übernimmt.

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
         hallo: { titel: "Hallo sagen", ausfuehren: async (c) => ctx.hinweis("Hallo " + (c.parameter.name || "") + ".") },
       },
     };
   };
   ```

2. Speichern. Der Hot-Reload lädt die Datei sofort, ein Neustart ist nicht nötig. Auch Änderungen am Codeblock greifen sofort.
3. Knopf in eine Notiz schreiben: `[Hallo](obsidian://studium-autopilot?aktion=hallo&name=Welt)`.

Regeln für Skript-Autoren:

- iOS-sicher bleiben: keine Node-APIs, kein Regex-Lookbehind, kein `.at()`, `findLast` oder `structuredClone`.
- Neue Notizen mit `eba.ablegen(ordner, name, inhalt)` anlegen. `eba.CURSOR` im Inhalt markiert die Cursorposition. Den Namen
  macht `eba.dateiTitel` (eine Regel für alle Notizen, auch die zentralen Termine): ohne Emojis, „: “ → „ – “, keine
  Zeichen, die Windows, iOS oder Links stören, keine Punkte am Ende.
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
- Prüfungen, Fristen, „diese Woche“, Sitzungen, ECTS, Noten, „im Plan“, Statusfarben und Datumstexte nur über das Fachmodell
  (`ctx.modell`, Abschnitt „Fachmodell“), nie eine eigene Regel; fehlt etwas, kommt es mit Test ins Modell.
- `registrieren()` darf annehmen, dass die alte Fassung abgemeldet ist; offene Seiten zeichnet der Kern danach selbst neu.
- Erzeugte Notizen haben keine leeren Punkte (`- `, `- [ ] `) und keine leeren Abschnitte (seit 19.10.2026); ein Abschnitt kommt dazu,
  sobald es etwas gibt. Ausnahme: der Punkt, in dem nach dem Anlegen der Cursor steht. `## Meine Notizen` der Quellen bleibt als
  Grenze für deinen Text; ist er leer, blendet ihn die Leseansicht aus (`kopf.js`). `tests/notizbild.test.js` prüft `notizen.js`,
  die Begleitnotiz und `ilias.js`.
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
  ILIAS-Skripte (siehe „ILIAS-Unterlagen“), Noten & Anmeldungen und `sperre.js` (siehe „Noten & Anmeldungen (Alma)“), `quellen.js` (siehe „Quellen-Vertrag“),
  `alma.js` (Lebenslauf der Notizen, Grabstein, Sperre, Fehler im Status, Verbinden ohne Erfolg), `leer.js`
  (`istLeer`), `fsrs.js` und `karten.js` (siehe „Karteikarten“), `woche.js` (Wochenraster), `todos.js` (Auswahl,
  leere Blöcke) sowie `bitte-pruefen.js` (Protokoll lesen, abhaken), `volltext.js` (siehe „Volltext der PDFs“), `ilias-kalender.js`
  (siehe „ILIAS-Kalender“) und
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
- Datenkanal: Die Daten kommen von `studium-autopilot.github.io/ecoba-daten` (Organisation `studium-autopilot`). Ohne Netz
  oder bei einem Fehler bleibt der letzte Stand; die Übersicht „Verbindungen“ zeigt dann „Fehler beim letzten Abruf“.
- Datenkanal: Eine gelöschte zentrale Notiz kommt zurück, sobald sich ihr Termin in den Daten ändert (oder `abruf.json` fehlt).
