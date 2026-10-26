# Architektur: Plugin „Studium Autopilot“

Beschreibt den aktuellen Stand des Plugins; was sich je Version geändert hat, steht in `CHANGELOG.md`. Ersetzt Templater
vollständig. Zielgruppe: Entwickler, die den Tresor weiterbauen.
Getestet mit Obsidian 1.14.4 (API-Version); `manifest.json` verlangt darum `minAppVersion` 1.14.4. Erst senken, wenn ältere
Versionen getestet sind.

## Wo was steht

Hier steht, was für jedes Skript gilt: Aufbau, `ctx`, Skripttypen (mit einer Tabelle aller Skripte), die Regeln für
Skript-Autoren und „Keine Dopplungen“. Jedes Thema hat eine eigene Datei unter `docs/architektur/`. Neues kommt in die
passende Datei; ein neues Thema bekommt eine eigene Datei und eine Zeile in dieser Tabelle.

| Datei | Worum es geht |
|---|---|
| [aktionen.md](architektur/aktionen.md) | Aktionen, Knöpfe, Befehle, Ordner-Automatik, Linkformat |
| [modell.md](architektur/modell.md) | `ctx.modell`: Semester, Wochen, Prüfungen, Fristen, Statusfarben, Datumstexte |
| [zentrale-daten.md](architektur/zentrale-daten.md) | Datenkanal (`zentral.js`), zentraler Stundenplan, Grabsteine |
| [update.md](architektur/update.md) | Update, Dateiklassen, Reparatur (`update.js`) |
| [quellen.md](architektur/quellen.md) | Quellen-Vertrag, Abrufer-Sperre, Quellen außerhalb des Plugins |
| [server.md](architektur/server.md) | Eigener Server (`server.js`) |
| [claude.md](architektur/claude.md) | Claude ohne Server (`claude.js`), Claude im Tresor (`.claude/`) |
| [livesync.md](architektur/livesync.md) | LiveSync-Wache (`livesync.js`) |
| [bedien-bausteine.md](architektur/bedien-bausteine.md) | Fenster „Neu …“, Kopf-Karte, Öffnen und Navigieren, PDF-Kasten, Rückgängig und Papierkorb |
| [verbindungen.md](architektur/verbindungen.md) | Verbindungen, Schloss, Uni-Login |
| [unterlagen.md](architektur/unterlagen.md) | ILIAS-Unterlagen, Volltext der PDFs, neue Fassung einer Unterlage |
| [alma.md](architektur/alma.md) | Noten & Anmeldungen aus Alma |
| [ilias-kalender.md](architektur/ilias-kalender.md) | ILIAS-Kalender (`ilias-kalender.js`) |
| [postfach.md](architektur/postfach.md) | Postfach (`postfach.js`, `postfach-html.js`) |
| [einrichtung.md](architektur/einrichtung.md) | Einrichtung |
| [darstellung.md](architektur/darstellung.md) | hell, dunkel, automatisch, Design, Personalisieren |
| [seiten.md](architektur/seiten.md) | Seit deinem letzten Besuch, Leseansicht, Dashboard, Bereiche, Modulseite |
| [lernen.md](architektur/lernen.md) | Karteikarten, Lernplan, Literaturliste |
| [testeinstiege.md](architektur/testeinstiege.md) | Tests ohne Obsidian und Testeinstiege in Obsidian (`plugin.test…`) |

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
  ausgeführt (siehe [„Zentrale Daten“](architektur/zentrale-daten.md)). Kursdateien aus ILIAS werden nur abgelegt.
- Neuer Code kommt nur über **Neue Version installieren** und nur nach einem Tipp: Die Update-Liste ist über ihre SHA-256 im Manifest
  der zentralen Daten festgelegt, jede Datei über ihre SHA-256 in der Update-Liste, geladen vom unveränderlichen Tag
  `v<version>` dieses Repos (siehe [„Update“](architektur/update.md)). Tags und Releases sind auf GitHub gegen Ändern und Löschen gesperrt.

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
| `ctx.formular({ titel, felder, knopf, pruefen })` | Fenster „Neu …“ (`formular.js`, seit 0.4.6): alle Felder einer Anlege-Aktion in einem Fenster → Werte oder `null` (Esc); siehe [„Bedien-Bausteine“](architektur/bedien-bausteine.md) |
| `ctx.date.now(format, tage)` | Datum mit moment, z. B. `ctx.date.now("YYYY-MM-DD", 7)` |
| `ctx.date.jetzt()` | `Date` für „jetzt“; statt `new Date()` verwenden, damit Tests ein Datum vorgeben können (`plugin.testDatum`) |
| `ctx.aktion(name, parameter)` | eine andere Aktion ausführen |
| `ctx.link(aktion, parameter)` | Knopf-Adresse bauen |
| `ctx.oeffnen(ziel, { neu, quelle, zeile, cursor, modus, von })` | DER Weg, eine Notiz zu öffnen (seit 0.4.6: Datei, Pfad oder Linktext; Übersichten lesen, eigene Notizen bearbeiten, im Tab, in dem getippt wurde); siehe [„Bedien-Bausteine“](architektur/bedien-bausteine.md) |
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
| `kalender.js`, `termine.js`, `klausurzeit.js`, `verlauf.js`, `todos.js`, `vorlesung.js`, `gruppen.js`, `angebote.js` | Codeblöcke `eba-kalender`, `eba-agenda`, `eba-anmeldungen`, `eba-klausurzeit`, `eba-verlauf`, `eba-todos`, `eba-vorlesung`, `eba-gruppen`, `eba-angebote` |
| `seitenleiste.js` | Seitenleiste „Übersicht“ (seit 19.10.2026, ersetzt das Raster-Menü aus `menue.js`): eigener Tab in Obsidians linker Seitenleiste mit allen Seiten (`ZIELE`) und den Modulen dieses Semesters; siehe [„Öffnen und Navigieren“](architektur/bedien-bausteine.md) |
| `tabellen.js`, `leer.js` | Bases-Tabellen als Liste zum Lesen (seit 0.4.6 überall und auf allen Geräten, `eba-core.css` 37.tabellen), leere Mitschriften und Übungsblatt-Notizen (bis 0.6.7) beim Verlassen in den Papierkorb (nicht beim Wechsel zu Folien/PDF; ein Übungsblatt mit Abgabedatum, Aufgaben oder eigener Lösung bleibt, ebenso eine Vorlesungsnotiz mit Thema) |
| `eba.js`, `alma.js`, `unterlagen.js`, `meine-gruppe.js` | Helfer: Semester, Module, Datumseingabe, `ablegen()`; Alma-Stundenplan (seit 0.4.5 auch Erweiterung mit Zeitplan, siehe [„Alma-Stundenplan“](architektur/aktionen.md)); gewählte Unterlagen einordnen; deine Übungsgruppe im Stundenplan |
| `modell.js` | Datenmodell und Fachmodell `ctx.modell` (siehe [„Fachmodell“](architektur/modell.md)), Abgleich der abgeleiteten Felder in den Einstellungen, Codeblock `eba-semesterdaten` |
| `dashboard.js` | Kacheln und Listen aus dem Fachmodell: Codeblöcke `eba-kacheln` (Dashboard) und `eba-liste fristen\|termine\|pruefungen` (Dashboard, Prüfungen) |
| `verbindungen.js` | Verbindungen und Schloss: Codeblöcke `eba-schloss`, `eba-verbindungen`; Aktionen `verbinden`, `verbindung-aktualisieren`, `trennen` |
| `einrichtung.js` | Einrichtung beim ersten Start (seit 0.3.0, `ctx.einrichtung`): Fenster mit acht Bildschirmen (seit 25.10.2026 mit den Angeboten der Uni; von 0.4.8 an sieben, vorher acht), Zustand in den Einstellungen, Aktion `einrichtung`; siehe [„Einrichtung“](architektur/einrichtung.md) |
| `darstellung.js` | Hell, dunkel oder automatisch (seit 17.10.2026) und Design (seit 18.10.2026, intern `elfenbein`, `flieder`, `klar`), je Gerät (`ctx.darstellung`): Umschalter und Design-Kacheln `eba-darstellung`, Aktionen `darstellung` und `design`; siehe [„Darstellung“](architektur/darstellung.md) |
| `personalisieren.js` | Formular (Aktion `personalisieren`, Parameter `feld` setzt den Cursor), Zeilen „Deine Angaben“ und „Variante“ (`eba-personalisieren angaben` bzw. `variante`, gleiche Zeilenliste wie die Verbindungen; Inhalt aus `angabenZeilen`/`varianteZeilen`); die Karte auf dem Dashboard entfällt seit 0.3.0 |
| `musterplan.js` | Musterstudienpläne als eigene Darstellung, Codeblock `eba-musterplan` |
| `zentral.js` | Datenkanal „Zentrale Daten“: Abruf, Prüfung, Übernahme als Termin-Notizen, Semesterdaten, Abrufer-Sperre (`ctx.zentral`), Aktionen `zentral-aktualisieren`, `zentral-schalter` |
| `update.js` | Update der Vorlage mit einem Knopf (seit 0.2.0, `ctx.update`): Zeile „Updates“ (bis 24.10.2026 „Studium Autopilot“) in `eba-verbindungen`, Hinweis `eba-update-hinweis` auf dem Dashboard (seit 0.3.1), Aktionen `vorlage-aktualisieren`, `vorlage-neu-laden`; siehe [„Update“](architektur/update.md) |
| `fsrs.js` | Helfer: FSRS-6 und Lernschritte wie in Anki (`ctx.user.fsrs(ctx).planer`), siehe [„Karteikarten“](architektur/lernen.md) |
| `karten.js` | Karteikarten: Codeblock `eba-karten` (Übersicht, `stapel`, `statistik`, `liste`, `heute`), Lernfenster, Üben, Verlauf einer Karte, Fenster „Neue Karte“ und „Optionen“, Pausieren, Lernstände je Gerät (`ctx.karten`); siehe [„Karteikarten“](architektur/lernen.md) |
| `schwerpunkte.js` | Abschnitt „Schwerpunkte“ im Studienverlauf (seit 17.10.2026, vorher Seite „Schwerpunkt-Planer“): Codeblock `eba-schwerpunkte`, Regeln der PO für die Schwerpunktbereiche, `ctx.schwerpunkte` (`rechnen`, `sichtbar`); siehe [„Bereiche“](architektur/seiten.md) |
| `lernplan.js` | Lernplan (seit 18.10.2026): Codeblock `eba-lernplan` (Bereich, Argument `modul` in der Lernplan-Notiz), Abhaken der Kapitel, `ctx.lernplan` (`kapitelLesen`, `planen`, `zielVon`, `stand`, `kapazitaet`, `sichtbar`); siehe [„Lernplan“](architektur/lernen.md) |
| `literatur.js` | Literaturlisten (seit 24.10.2026): schreibt auf dem Abrufer aus `literatur.json` je Modul die Notiz „<Code> Literatur 00 Literaturliste“ in den Ordner Literatur des Moduls (`ctx.literaturAnzeige`); siehe [„Literaturliste“](architektur/lernen.md) |
| `bitte-pruefen.js` | „Bitte prüfen“ auf dem Dashboard (seit 18.10.2026): Protokoll des eigenen Uni-Abgleichs und (seit 0.4.5) die Punkte aller Quellen aus dem Meldekanal (Quellen-Vertrag); Codeblock `eba-bitte-pruefen`; siehe [„Dashboard“](architektur/seiten.md) |
| `alma-konto.js`, `alma-konto-html.js` | Noten & Anmeldungen aus Alma (seit 0.4.5, Beta, `ctx.almaKonto`): Ablauf, Zustand, Zeile und Fenster bzw. reiner Leser der Seiten; siehe [„Noten & Anmeldungen (Alma)“](architektur/alma.md) |
| `sperre.js` | Helfer: Abrufer-Sperre, der gemeinsame Schreiber-Lock aller Quellen (`ctx.user.sperre.erzeugen`); siehe [„Abrufer-Sperre“](architektur/quellen.md) |
| `hinweis.js` | `ctx.hinweis` (seit 0.4.6): Hinweise ohne Vorsatz und Pfad, nächster Schritt als Knopf; `tests/wortliste.test.js` findet jedes `new Notice` in den Skripten |
| `formular.js` | `ctx.formular` (seit 0.4.6): das Fenster „Neu …“ für alle Anlege-Aktionen; siehe [„Bedien-Bausteine“](architektur/bedien-bausteine.md) |
| `kopf.js` | Kopf-Karte unter dem Titel jeder Termin-, Stundenplan-, SQ- und Begleitnotiz mit genau einem Status-Knopf (seit 0.4.6; beim Termin Tag, Uhrzeit und Ort statt der Datumszeile, seit 24.10.2026), „⋯“ mit Eigenschaften (und weiteren Punkten wie „Andere Folien …“ der Vorlesungsnotiz), leere Abschnitte und Eckdaten ausblenden (seit 19.10.2026), Übungsblätter unter Übung und Tutorium (seit 20.10.2026), Abgabe und Lösungen einer Übung, das Blatt einer Abgabe-Frist und die Karte der Übungsblatt-Notizen bis 0.6.7 (Codeblock `eba-uebungsblatt`, seit 24.10.2026); siehe [„Bedien-Bausteine“](architektur/bedien-bausteine.md) |
| `pdfkasten.js` | PDF-Kasten der Begleitnotizen als Knopf (seit 19.10.2026): klappt in Lese- und Bearbeitungsansicht ohne Cursor und Tastatur, lädt die PDF erst beim Aufklappen, „Öffnen“ und „Original“ in der Kopfzeile, offen bei einer Notiz ohne eigenen Inhalt (seit 0.6.3); siehe [„Bedien-Bausteine“](architektur/bedien-bausteine.md) |
| `gesehen.js` | Erstes Öffnen einer Unterlage als `geoeffnet` in der Begleitnotiz (seit 0.6.3), daraus „Neu“ auf der Seite Unterlagen; siehe [„Neu bei den Unterlagen“](architektur/bedien-bausteine.md) |
| `papierkorb.js` | `ctx.papierkorb` (seit 0.4.6): wegwerfen mit Hinweis und „Rückgängig“; siehe [„Bedien-Bausteine“](architektur/bedien-bausteine.md) |
| `felder.js` | Helfer: Feld-Register der Eingaben (Variante, Studienbeginn, Note, Zielnote; `ctx.user.felder`); siehe [„Personalisieren“](architektur/darstellung.md) |
| `fassung.js` | Helfer: neue Fassung einer Unterlage (seit 0.6.9, `ctx.user.fassung`): frühere Zusammenfassung erkennen und einklappen, geänderte Seiten, Zeile im PDF-Kasten, Angaben für Claude; siehe [„Neue Fassung einer Unterlage“](architektur/unterlagen.md) |
| `quellen.js` | Helfer: Quellen-Vertrag (`ctx.user.quellen`): Statusform, ein Zeitplan, Besitzmarke, Lebenslauf erzeugter Notizen, Meldekanal „Bitte prüfen“; siehe [„Quellen-Vertrag“](architektur/quellen.md) |
| `livesync.js` | LiveSync (seit 0.6.8, `ctx.user.livesync`): öffnet auf iPhone/iPad die lokale Datenbank von Self-hosted LiveSync nach der Rückkehr in die App neu, wenn iOS sie geschlossen hat; Helfer `aktiv`, `dienste`, `hintergrundStill` für Update und Zeitplan; siehe [„LiveSync“](architektur/livesync.md) |
| `volltext.js` | Volltext der PDFs (seit 0.4.5): Textfassungen unter `Unterlagen/_Volltext/` für die Suche, `ctx.volltext`; siehe [„Volltext der PDFs“](architektur/unterlagen.md) |
| `claude.js` | Claude ohne Server (seit 0.6.3, `ctx.claude`): eigener API-Schlüssel aus der Claude Console, **Zusammenfassen** im PDF-Kasten direkt über die Messages API, Zeile und Fenster „Claude“ unter Verbindungen (seit 26.10.2026 nur für Fortgeschrittene, Zeile erst nach dem Verbinden); siehe [„Claude ohne Server“](architektur/claude.md) |
| `ilias-kalender.js` | ILIAS-Kalender (seit 18.10.2026): Abgaben deiner Übungen aus dem Kalender-Abo als Fristen unter `Termine/`, `ctx.iliasKalender`; siehe [„ILIAS-Kalender“](architektur/ilias-kalender.md) |
| `uni-login.js` | Helfer: Uni-Login (seit 0.4.8, `ctx.user["uni-login"](ctx)`): verbindet nach der Anmeldung ILIAS-Kalender und Alma-Stundenplan ohne kopierten Link, holt einen neuen Link, wenn der alte nicht mehr gilt; siehe [„Uni-Login“](architektur/verbindungen.md) |

Beim Start schreibt das Plugin keine Datei. Die Agenda (`eba-agenda`) wird live gerendert, wie der Kalender. Einzige
Ausnahme seit 2b: Weichen die abgeleiteten Felder in `System/Einstellungen.md` vom berechneten Inhalt ab (siehe [„Zentrale
Daten“](architektur/zentrale-daten.md)), werden sie einmal nachgezogen. Im Normalfall sind sie gleich, dann wird nichts geschrieben. Der Datenkanal
(`zentral.js`) ruft frühestens 20 s nach dem Einlesen ab und schreibt nur nach einem erfolgreichen Abruf mit geänderten Daten
(siehe [„Datenkanal“](architektur/zentrale-daten.md)). `update.js` legt 20 s nach dem Einlesen einmal `System/Daten/installiert.json` an, wenn sie fehlt
(Erstinstallation, siehe [„Update“](architektur/update.md)); sonst schreibt es nur nach dem Tipp auf „Neue Version installieren“. `einrichtung.js` öffnet beim
ersten Start höchstens ein Fenster und schreibt dabei nichts; geschrieben wird erst nach einem Tipp in der Einrichtung.

**Codeblock-Argumente:** Obsidian übergibt einem Codeblock-Prozessor nur den Inhalt. Das Argument in der Kopfzeile
(z. B. `eba-schloss alma`) liest `ctx.modell.blockArgument(el, c, sprache, erlaubt, vorgabe)` aus dem Abschnitt. Der Inhalt
des Blocks ist nur Ersatztext für den Fall, dass das Plugin nicht läuft. Seit 2c ruft der eine Prozessor je Sprache immer die
aktuelle Fassung (`ctx.codeblock`); `app:reload` ist für Änderungen an Codeblock-Skripten nicht mehr nötig.

## Keine Dopplungen (seit 15.10.2026)

Jede Angabe steht an einer Stelle; andere Seiten verlinken dorthin. Semestertermine nur in der Lupe des Studienverlaufs
(seit 17.10.2026 ohne eigene Tabelle; Einstellungen & Hilfe verlinkt `[[Studienverlauf]]`), Wochenplan nur auf Stundenplan, nächste Frist als erste Kachel des
Dashboards und erste Zeile der Liste „Fristen · 30 Tage“ (bewusst beides, siehe [„Dashboard“](architektur/seiten.md)), nächste Prüfung und Gesamtnote nur als Dashboard-Kacheln (eba-verlauf zeigt ECTS und
Orientierungsprüfung), andere Musterplan-Varianten nur auf `System/Daten/Musterplan` (Codeblock-Argument `andere` bleibt
nutzbar). Die Variante wählst du „vor dem 3. Fachsemester“ (ab dann unterscheiden sich die Musterpläne; die PO legt keinen
Zeitpunkt fest), überall in diesem Wortlaut.

**Nächste Prüfung, eine Regel:** seit 18.10.2026 `ctx.modell.pruefungen`, `pruefungVon` und `naechstePruefung` (siehe
[„Fachmodell“](architektur/modell.md)): Termin-Notizen mit `kategorie: Prüfung` (eintägig) und das Modulfeld `klausur`; Kürzel + Tag zählen einmal, die
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
  (`ctx.modell`, Abschnitt [„Fachmodell“](architektur/modell.md)), nie eine eigene Regel; fehlt etwas, kommt es mit Test ins Modell.
- `registrieren()` darf annehmen, dass die alte Fassung abgemeldet ist; offene Seiten zeichnet der Kern danach selbst neu.
- PDFs nie mit `MarkdownRenderer` einbetten: Er lädt Einbettungen im Anzeigemodus, eine PDF ist dort ein festes Bild ihrer ersten
  Seite ohne Blättern (der PDF-Kasten bis 25.10.2026). Eine verborgene PDF-Einbettung, die Obsidian gezeichnet hat, öffnet ihre
  Datei ohnehin erst, wenn sie sichtbar wird; sie darf also bleiben.
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
  Bearbeitungsansicht, iPad- und iPhone-Breite, die Karte darunter erscheint nach dem Scrollen.

## Bekannte Grenzen

- `livesync.js` greift in Interna von LiveSync ein (`core.services`, geprüft bis 1.0.40). Fehlt ein Teil, tut die Wache
  nichts. Die Wache ist nur mit Nachbau und einem simulierten Schließen in Obsidian am PC getestet; ob iOS die Datenbank so
  schließt, wie es der Nachbau annimmt, zeigt erst ein echtes Gerät (so beobachtet in einem Tresor seit 20.10.2026).
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
- Datenkanal: Eine gelöschte zentrale Notiz kommt zurück, sobald sich ihr Termin in den Daten ändert (oder `abruf.json` fehlt
  und das übernehmende Gerät ihre Grabsteine noch nie gelesen hat, etwa ein neues Gerät).
- Datenkanal: Termin-Notizen, die die Vorlage mitbringt, bleiben stehen, sobald ihr Ende über 30 Tage zurückliegt (Wegfall-Regel);
  alte Termine aus dem Download zu entfernen, gehört in den Export der Vorlage.
