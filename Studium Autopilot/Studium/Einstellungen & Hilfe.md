---
typ: "übersicht"
tags:
  - "übersicht"
cssclasses:
  - "eba"
  - "eba-weit"
  - "eba-s-einstellungen"
  - "eba-s-anleitung"
---

<div class="eba-kopf">
<div class="eba-pfad"><a class="internal-link" data-href="Dashboard" href="Dashboard">Dashboard</a><span>Studium</span></div>
<h1>Einstellungen & Hilfe</h1>
</div>

## Deine Angaben

Alles ist freiwillig und jederzeit änderbar.

<details class="eba-mehr"><summary>Mehr erfahren</summary>Ohne Angaben gilt das aktuelle Semester als Studienbeginn. Semester, Ferien und Prüfungsphasen trägst du nicht ein: Sie kommen aus den <a class="internal-link" data-href="System/Daten/Semester" href="System/Daten/Semester">Semesterterminen</a>.</details>

```eba-personalisieren angaben
Deine Angaben: erscheinen, sobald Studium Autopilot läuft. Ändern: Befehl „Personalisieren“.
```

## Variante

> [!eba-wahl|variante]
> - [Economics](obsidian://studium-autopilot?aktion=variante&wert=Economics)
> - [Business Administration](obsidian://studium-autopilot?aktion=variante&wert=Business%20Administration)
> - [ohne Spezialisierung](obsidian://studium-autopilot?aktion=variante&wert=ohne%20Spezialisierung)
> - [offen](obsidian://studium-autopilot?aktion=variante&wert=offen)

> [!eba-tabelle|schlicht|ohne-titel|umbruch]
> ```base
> filters:
>   and:
>     - file.path == "System/Einstellungen.md"
> formulas:
>   var: 'if(variante, variante, "offen")'
>   folge: 'if(variante == "Economics", "Pflicht: E230, E210, S220, B240 · Schwerpunkte 75 ECTS, mind. 2 VWL-Bereiche", if(variante == "Business Administration", "Pflicht: B220, J200, B250, B240 · Profil 12 ECTS · Schwerpunkte 63 ECTS, mind. 2 BWL-Bereiche", if(variante == "ohne Spezialisierung", "Profil 18 ECTS VWL + 18 ECTS BWL · Schwerpunkte 63 ECTS, je mind. 1 VWL- und BWL-Bereich", "Vor dem 3. Fachsemester wählen; bis dahin rechnet der Vault ohne Variante")))'
> properties:
>   formula.var:
>     displayName: Aktuell
>   formula.folge:
>     displayName: Was daraus folgt
> views:
>   - type: table
>     name: Variante
>     rowHeight: medium
>     order:
>       - formula.var
>       - formula.folge
>     columnSize:
>       formula.var: 186
>       formula.folge: 413
> ```

## Verbindungen

Verbinde Alma, dann kommt dein Stundenplan von selbst.

<details class="eba-mehr"><summary>Mehr erfahren</summary>Links bleiben nur auf diesem Gerät. Passwörter werden nie gespeichert.</details>

```eba-verbindungen
Verbindungen: erscheinen, sobald Studium Autopilot läuft.
```

## Semester und Prüfungsphasen

Das rechnet sich aus deinem Studienbeginn, du trägst nichts ein. Die Termine stehen unter [[Studienverlauf#Semestertermine|Semestertermine]].

<details class="eba-mehr"><summary>Mehr erfahren</summary>Grundlage sind die <a class="internal-link" data-href="System/Daten/Semester" href="System/Daten/Semester">Semestertermine</a>. Die Felder <code>semesterliste</code>, <code>pausen</code> und <code>pruefungsphasen</code> in <code>System/Einstellungen.md</code> bitte nicht von Hand ändern.</details>

## Hilfe

Kurze Anleitungen zum Nachschlagen: Karte antippen, dann klappt sie auf.

> [!eba-karte|hilfe|liste|handy-zu]+ Checkliste fürs erste Semester
> - [ ] Oben auf **Personalisieren** tippen
> - [ ] Uni-Account aktivieren und die Uni-Mail lesen
> - [ ] Zur Erstsemester-Info gehen, Infos unter [[Kontakte & Links]]
> - [ ] In Alma die Kurse des 1. Semesters belegen, Plan im [[Studienverlauf]]
> - [ ] Unter [[#Verbindungen]] Alma verbinden
> - [ ] Den ILIAS-Kursen beitreten und Übungsgruppen belegen
> - [ ] In Alma zu den Prüfungen anmelden, Termine unter [[Prüfungen]]
> - [ ] Semesterbeitrag für die Rückmeldung rechtzeitig zahlen
> - [ ] Nach jeder Prüfung die Note in [[Noten & ECTS]] eintragen

> [!eba-karte|hilfe]- Bedienung: Knöpfe, Vorlagen, Bereiche-Menü
> | Knopf | Wo | Fragt nach | Landet in |
> | --- | --- | --- | --- |
> | Vorlesung | Dashboard, Modulseite | nichts, wenn laut Stundenplan oder Termin gerade etwas läuft (sonst das Modul; vom Modul-Knopf nie) | Vorlesungen/Modulcode, Name „Datum Code VL 03“ |
> | Übungsblatt | Dashboard, Modulseite, [[Unterlagen#Übungsblätter|Unterlagen]] | Modul, Nummer, Abgabe | Übungsblätter |
> | Unterlagen | Dashboard, Modulseite, [[Unterlagen]] | Vorschau der neuen Namen | Unterlagen/Modul |
> | Termin anlegen | [[Termine & Anmeldungen]] | Titel und Datum (Art und Modul ergeben sich aus dem Titel) | Termine |
> | Stundenplan aus Alma holen | [[Stundenplan]] | beim ersten Mal deinen Alma-Link | Stundenplan |
>
> - **Bereiche-Menü:** Raster-Symbol (vier Kästchen) rechts im Seitenkopf tippen; auf iPhone und iPad auch oben in jeder Notiz.
> - **Vorlagen:** Jeder Knopf legt eine fertige Notiz an. <kbd>Strg</kbd>/<kbd>⌘</kbd>+<kbd>⇧</kbd>+<kbd>N</kbd> fragt, welche Notiz entstehen soll.
> - <kbd>Esc</kbd> überspringt eine Frage; in der ersten bricht es ab. Datum als „15.10.“ oder „15.10.2026“, gern mit Uhrzeit.

> [!eba-karte|hilfe]- Vorlesung: mitschreiben, nacharbeiten
> > [!eba-raster|2]
> > > [!eba-karte] Schnell mitschreiben
> > > 1. Dashboard → **Vorlesung**. Läuft laut Stundenplan gerade etwas, entsteht die Notiz **sofort**; nochmal tippen öffnet **dieselbe Notiz**. Sonst wählst du das Modul.
> > > 2. Nummer, Folien-PDF und Dozent trägt die Vorlage selbst ein, der Cursor steht unter **Mitschrift**.
> > > 3. Stelle auf den Folien: Befehl **Seitenlink** → Seitenzahl → „S. 12“ springt auf die Seite.
> > > 4. Prüfungsstoff: `#klausur` direkt an die Zeile schreiben.
> >
> > > [!eba-regel] Nacharbeiten
> > > - Abends **Kernaussagen** ergänzen und offene Fragen klären.
> > > - Dann **nachgearbeitet** anhaken (Eigenschaft oder Tabelle „Nachzuarbeiten“ auf dem Dashboard).
> > > - Handschrift auf den Folien: Abschnitt „Unterlagen“ unten, „Mit dem Stift annotieren“.
> > > - **Seitenlink aufs iPad legen (einmal):** Einstellungen → *Werkzeugleiste für Mobilgeräte* → „Studium Autopilot: Seitenlink auf die Folien einfügen“ hinzufügen.

> [!eba-karte|hilfe]- Im Alltag: Tabellen, Fragen, Markieren
> > [!eba-raster|2]
> > > [!eba-tabelle] Tabellen bearbeiten
> > > - **Doppelklick** auf eine Zelle, Wert eingeben, <kbd>Enter</kbd>. Ein einfacher Klick setzt nur den Cursor. Auf iPad und iPhone: Zelle antippen.
> > > - **Status:** offen · läuft · angemeldet · bestanden · nicht bestanden · anerkannt. **Note** mit Komma, z. B. `1,7`.
> > > - Oben links in einer Tabelle wechselst du die **Ansicht**.
> > > - [[Termine & Anmeldungen#Anmeldungen|Anmeldungen]]: Seite bearbeiten (Stift oben rechts), Spalte **Stand** z. B. `angemeldet · Gr. 4 Di 10–12`.
> >
> > > [!eba-fragen] Fragen und To-dos
> > > - Zeile schreiben, <kbd>⌘</kbd>/<kbd>Strg</kbd> <kbd>L</kbd> macht daraus eine Aufgabe (iPhone/iPad: Kästchen-Symbol in der Leiste über der Tastatur).
> > > - Endet sie mit **?** oder enthält sie `#frage`, erscheint sie auf dem Dashboard unter „Offene Fragen“, sonst unter „To-dos“.
> > > - Abhaken, und sie verschwindet.
> >
> > > [!eba-karte] Markieren
> > > - `#klausur` für Prüfungsstoff: [Alles Prüfungsrelevante](obsidian://studium-autopilot?aktion=suchen&q=tag%3A%23klausur)
> > > - `==Text==` markiert, `[[Begriff]]` verlinkt.
> > > - Formeln mit `$…$` oder `$$…$$` (LaTeX).
> > > - `/` am Zeilenanfang öffnet die Befehle.
> >
> > > [!eba-rechner] Was sich selbst rechnet
> > > - Aktuelles Semester, Phase und Wochenraster aus deinen Angaben oben.
> > > - ECTS, Gesamtnote nach § 13 und Orientierungsprüfung aus den Modulen.
> > > - Nächste Prüfung und Frist aus Modulen und Terminen.
> > > - Termine und Fristen für alle kommen von selbst, siehe [[#Verbindungen]].
> > > - Schwerpunktbereiche und ihre Regeln im [[Schwerpunkt-Planer]].
>
> | Kürzel | Wirkung |
> | --- | --- |
> | <kbd>⌘</kbd>/<kbd>Strg</kbd> <kbd>⇧</kbd> <kbd>N</kbd> | Notiz aus Vorlage |
> | <kbd>⌘</kbd>/<kbd>Strg</kbd> <kbd>E</kbd> | Lesen / Bearbeiten |
> | <kbd>⌘</kbd>/<kbd>Strg</kbd> <kbd>O</kbd> | Notiz öffnen |
> | <kbd>⌘</kbd>/<kbd>Strg</kbd> <kbd>P</kbd> | Befehle |
>
> > [!eba-achtung] ILIAS gilt als bekannt
> > Laut FAQ gilt alles, was Lehrstühle in ILIAS einstellen, als bekannt; das Kurspasswort gibt es meist in der ersten Vorlesung, Infos wie zur Rückmeldung kommen per Uni-Mail.
> > Ob Übungsblätter abgegeben werden müssen, legt jeder Lehrstuhl selbst fest; auch das steht in ILIAS.

> [!eba-karte|hilfe]- Unterlagen: einordnen, annotieren
> > [!eba-raster|3]
> > > [!eba-karte] Windows
> > > - ILIAS-Datei oder entpacktes ZIP im Explorer in den Ordner `Eingang` deines Vaults kopieren (Ordner an den Schnellzugriff anheften).
> > > - PowerPoint: **Datei → Exportieren → PDF**, PDF und PPTX mit gleichem Namen in den Eingang legen; das Skript hält beide zusammen.
> > > - Papier: mit dem Handy scannen oder mit der App „Windows-Scan“, Speicherort `Eingang`.
> >
> > > [!eba-karte] iPhone und iPad
> > > - PDF in Safari oder Mail: **Teilen → In Dateien sichern →** im Vault-Ordner **Eingang** wählen.
> > > - Papier: App **Dateien** → Ordner **Eingang** → **⋯ → Dokumente scannen → Sichern**.
> > > - ZIP aus ILIAS in der Dateien-App antippen, dann entpackt es sich.
> >
> > > [!eba-karte] Danach
> > > - **Unterlagen einordnen** tippen.
> > > - In der **Vorschau** „Alle übernehmen“ wählen oder einzelne Dateien korrigieren. <kbd>Esc</kbd> bricht ab, ohne etwas zu ändern.
> > > - Fertig: Die Dateien liegen unter [[Unterlagen]] und auf der Modulseite, je mit einer Notiz (Status **neu**).
>
> > [!eba-regel]- Dateinamen und Status
> > - Schema **Code Art Nr Titel**: `B110 Folien 03 Entscheidungstheorie.pdf` · `B110 Übung 04.pdf` · `B110 Lösung 04.pdf` · `B110 Altklausur WS 2024-25.pdf`. Nummer zweistellig.
> > - Ordner `Unterlagen/<Code Modulname>`, daneben je Datei eine Notiz mit Status **neu · gelesen · bearbeitet**.
> > - Das Skript erkennt Art und Nummer aus dem ursprünglichen Namen und dem Unterordner im Eingang; beginnt ein Dateiname mit dem Modulcode, ordnet es das Modul selbst zu.
> > - Eigene Lösungen („Meine Lösung Blatt 3“) werden `Eigene Lösung 03` und am Übungsblatt 03 verknüpft, annotierte Folien werden `Mitschrift`.
>
> > [!eba-regel]- Mit dem Stift annotieren (iPad: Öffnen ↗ → Vorschau → Markieren)
> > 1. **Einmal einrichten:** Dateien-App → beliebige PDF gedrückt halten → **Informationen** → **Immer öffnen mit: Vorschau** → **Immer PDF-Dateien öffnen**. Dann noch einmal gedrückt halten → **Öffnen mit** → Haken bei **Mit Quick Look anzeigen** entfernen.
> > 2. **In der Vorlesung:** In der Unterlage oder in der Tabelle (Spalte „Datei“) auf **Öffnen ↗** tippen, Stift-Symbol (**Markieren**) → schreiben → **Fertig**. Mit Split View bleibt Obsidian daneben offen; am PC öffnet derselbe Knopf das Standardprogramm.
> > 3. Markieren speichert **in derselben PDF** im Vault, Obsidian zeigt die Anmerkungen. Nicht über „Teilen“ öffnen, das legt meist eine Kopie an.
> > 4. Große PDFs: Synchronisierst du zwischen Geräten, überträgt jedes Speichern die ganze Datei neu; darum lieber einmal am Ende der Vorlesung auf **Fertig** tippen als nach jeder Seite.
>
> > [!eba-info]- Lesen, markieren, zitieren
> > - Obsidian zeigt PDFs selbst an; `[[Datei.pdf#page=12]]` springt auf Seite 12.
> > - Am PC Text in der PDF markieren → Rechtsklick → „Link zur Auswahl kopieren“ (englisch „Copy link to selection“) und in die Vorlesungsnotiz einfügen; der Link springt genau zu dieser Stelle.
> > - PowerPoint zeigt Obsidian nicht an: am PC öffnet ein Klick die passende App, auf iPad und iPhone die Dateien-App.
> > - Die Suche findet nur Text in Notizen, nicht in PDFs. Wichtige Stellen deshalb in der Vorlesungsnotiz mit Seitenlink festhalten.
>
> > [!eba-achtung]- Speicherplatz
> > Jede PDF belegt Platz auf jedem Gerät, auf dem der Vault liegt. Große Scans vorher verkleinern, ganze Bücher lieber nicht in den Vault legen.

> [!eba-karte|hilfe]- Aufbau: Ordner im Vault
> | Ordner | Inhalt |
> | --- | --- |
> | **Dashboard** | Startseite mit Kennzahlen, Heute, Modulen, Knöpfen |
> | **Studium** | Übersichtsseiten: Studienverlauf, Termine & Anmeldungen, Prüfungen, Noten & ECTS, Unterlagen (mit Übungsblättern), Schwerpunkt-Planer, Kontakte & Links, Einstellungen & Hilfe, Stundenplan |
> | **Module** | 86 Module aus dem Modulhandbuch (dazu der Vorkurs SQ888), sortiert nach Grundstudium, Profil & Vertiefung, Schwerpunktkatalog, Abschluss |
> | **Vorlesungen, Übungsblätter** | deine Notizen |
> | **Termine, Stundenplan** | Fristen, Events und Lehrveranstaltungen, je eine Notiz |
> | **Eingang** | neue PDFs, Folien, Scans, bevor sie eingeordnet sind |
> | **Unterlagen** | Folien, Skripte, Übungen, Lösungen, Altklausuren je Modul (`Unterlagen/<Code> <Modultitel>/…`), daneben je Datei eine Notiz |
> | **Anhänge** | Bilder und Screenshots, die du in Notizen ziehst oder einfügst |
> | **System** | gespeicherte Einstellungen (Daten), Semestertermine, Vorlagen und Skripte |

> [!eba-karte|hilfe]- Geräte: einrichten, Unterschiede
> > [!eba-raster|2]
> > > [!eba-regel] Einmal pro Gerät
> > > 1. Ordner in Obsidian **als Vault öffnen** (Name egal).
> > > 2. **Vertrauen und Plugins aktivieren** tippen. Das Dashboard öffnet sich, Aussehen und Dateitypen sind schon eingestellt.
> > > 3. Unter [[#Verbindungen]] Alma verbinden. Der Link gilt nur für dieses Gerät.
> > > 4. **Mehrere Geräte (optional):** z. B. Obsidian Sync einrichten, Einstellungen und Plugins mit abgleichen.
> >
> > > [!eba-info] Unterschiede je Gerät
> > > - **Windows:** statt <kbd>⌘</kbd> die Taste <kbd>Strg</kbd>. Schriften: Segoe UI, bei Paper Georgia.
> > > - **iPad/iPhone:** Tabellenzellen **antippen** statt Doppelklick, Aufgaben über das Kästchen-Symbol über der Tastatur, breite Tabellen seitlich wischen.
> > > - **iPhone:** Kennzahlen stehen zweispaltig untereinander, der Stundenplan scrollt seitlich.
>
> > [!eba-achtung] Bitte nicht umbenennen
> > `System/Einstellungen.md` und die Seiten in `Studium/` (vor allem Noten & ECTS, Prüfungen, Stundenplan, Unterlagen) nicht umbenennen. Das Feld **uebersicht** in Notizen bitte stehen lassen.

### Stand der Angaben

Regeln und Module haben den Stand 30.09.2026. Termine und Semesterdaten kommen laufend über die zentralen Daten; manches ist noch geschätzt oder nicht eindeutig geregelt.

<details class="eba-mehr"><summary>Mehr erfahren</summary><p><b>Noch geschätzt, wird mit den zentralen Daten ersetzt</b></p><ul><li>Nachholtermin <b>WS 2026/27</b> sowie Anmeldefristen und Klausurphasen ab <b>SS 2027</b>.</li><li>Erasmus-Bewerbung <b>November 2027</b> und Bachelorarbeits-Frist <b>Juli 2028</b>.</li><li>Orientierungsprüfung bis <b>30.09.2028</b>: aus „Ende des 4. Fachsemesters“ abgeleitet, gilt ohne Urlaubssemester.</li></ul><p><b>Nicht belegt oder widersprüchlich</b></p><ul><li>Formale Wahl der Variante: weder PO noch Modulhandbuch regeln Wie und Wann; klärt die Studienfachberatung. Der Vault empfiehlt die Wahl vor dem 3. Fachsemester, weil sich ab dann die Musterpläne unterscheiden.</li><li><b>B370</b> und <b>S313</b> ohne Modulbeschreibung, <b>S312</b> in keiner EcoBA-Studienplantabelle.</li><li>Frist der Orientierungsprüfung: Modulhandbuch nennt in einem Plan Ende <b>FS 3</b>, maßgeblich ist die PO mit <b>FS 4</b>.</li><li>Rücktritt bei Krankheit: BRPO „unverzüglich“, FAQ „innerhalb von drei Werktagen“; im Zweifel sofort handeln.</li><li>Gesamtnote: ob nach zwei Stellen abgeschnitten wird, regelt die BRPO nicht eindeutig (<b>§ 35 Abs. 2</b> verweist nicht auf § 19 Abs. 3 Satz 3); der Vault schneidet ab.</li><li>Elective Studies: fachfremde Fächer (z. B. Informatik, Mathematik, Psychologie, Recht) mit mind. <b>15 ECTS</b> je Fach.</li><li>Manche Schwerpunktbereiche und Bachelorseminare setzen Module voraus (z. B. <b>B342</b>: <b>B240</b> oder <b>B340</b>); vor der Wahl die Modulbeschreibung prüfen.</li><li>„Ohne Spezialisierung“ mit Data Science allein: ob VWL- und BWL-Pflicht erfüllt sind, sagt das Modulhandbuch nicht; der Planer lässt es zu.</li><li>Citavi-Campuslizenz nicht belegt (Zotero und EndNote sind belegt).</li><li>Kein fachbereichsweiter Leitfaden für wissenschaftliches Arbeiten belegt; es gibt Vorgaben einzelner Lehrstühle.</li></ul></details>

<p class="eba-fuss">Quellen: <a href="https://uni-tuebingen.de/studium/studienorganisation/semester-und-studienplanung/semestertermine/semestertermine-bis-2029/">Semestertermine bis 2029</a> · <a href="https://uni-tuebingen.de/einrichtungen/verwaltung/iv-studierende/zentrales-pruefungsamt/wirtschafts-und-sozialwissenschaftliche-faecher-und-theologien/fachbereich-wirtschaftswissenschaft/fristen/">Fristen Prüfungsamt</a> · <a class="internal-link" data-href="Kontakte & Links#Offizielle Dokumente" href="Kontakte & Links#Offizielle Dokumente">Offizielle Dokumente</a></p>
