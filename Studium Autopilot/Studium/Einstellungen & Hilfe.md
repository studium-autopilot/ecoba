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

<details class="eba-mehr"><summary>Mehr erfahren</summary>Ohne Angaben gilt das aktuelle Semester als Studienbeginn. Semester, Ferien und Prüfungsphasen rechnen sich daraus, du trägst sie nicht ein. Die Termine stehen unter <a class="internal-link" data-href="Studienverlauf#Semestertermine" href="Studienverlauf#Semestertermine">Semestertermine</a>.</details>

```eba-personalisieren angaben
Deine Angaben: erscheinen, sobald Studium Autopilot läuft. Ändern: Befehl „Personalisieren“.
```

## Variante

> [!eba-wahl|variante]
> - [Economics](obsidian://studium-autopilot?aktion=variante&wert=Economics)
> - [Business Administration](obsidian://studium-autopilot?aktion=variante&wert=Business%20Administration)
> - [ohne Spezialisierung](obsidian://studium-autopilot?aktion=variante&wert=ohne%20Spezialisierung)
> - [noch offen](obsidian://studium-autopilot?aktion=variante&wert=offen)

> [!eba-tabelle|schlicht|ohne-titel|umbruch]
> ```base
> filters:
>   and:
>     - file.path == "System/Einstellungen.md"
> formulas:
>   var: 'if(variante && variante != "offen", variante, "noch offen")'
>   folge: 'if(variante == "Economics", "Pflicht: E230, E210, S220, B240 · Schwerpunkte 75 ECTS, mind. 2 VWL-Bereiche", if(variante == "Business Administration", "Pflicht: B220, J200, B250, B240 · Profil 12 ECTS · Schwerpunkte 63 ECTS, mind. 2 BWL-Bereiche", if(variante == "ohne Spezialisierung", "Profil 18 ECTS VWL + 18 ECTS BWL · Schwerpunkte 63 ECTS, je mind. 1 VWL- und BWL-Bereich", "Vor dem 3. Fachsemester wählen; bis dahin rechnet Studium Autopilot ohne Variante")))'
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

Verbinde Alma und ILIAS, dann kommen Stundenplan und Kursdateien von selbst.

<details class="eba-mehr"><summary>Mehr erfahren</summary>Alma-Link und ILIAS-Benutzername bleiben nur auf diesem Gerät. Dein ILIAS-Passwort liegt verschlüsselt im Schlüsselbund von Obsidian auf diesem Gerät und geht nur an die Uni. Andere Passwörter speichert Studium Autopilot nicht.</details>

```eba-verbindungen
Verbindungen: erscheinen, sobald Studium Autopilot läuft.
```

## Hilfe

> [!eba-karte|hilfe]- Bedienung: Knöpfe, Vorlagen, Bereiche-Menü
> | Knopf | Wo | Fragt nach | Landet in |
> | --- | --- | --- | --- |
> | Vorlesung | Dashboard, Modulseite | nichts, wenn laut Stundenplan oder Termin gerade etwas läuft (sonst das Modul; vom Modul-Knopf nie) | Vorlesungen/Modulcode, Name „Datum Code VL 03“ |
> | Übungsblatt | Dashboard, Modulseite, [[Unterlagen#Übungsblätter\|Unterlagen]] | Modul, Nummer, Abgabe | Übungsblätter |
> | Unterlagen | Dashboard, Modulseite, [[Unterlagen]] | Vorschau der neuen Namen | Unterlagen/Modul |
> | Aus ILIAS holen | [[Unterlagen]] (sobald ILIAS verbunden ist) | nichts | Unterlagen/Modul |
> | Termin anlegen | [[Termine & Anmeldungen]] | Titel und Datum (Art und Modul ergeben sich aus dem Titel) | Termine |
> | Alma verbinden, danach Stundenplan aus Alma holen | [[Stundenplan]] | beim Verbinden deinen Alma-Link | Stundenplan |
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

> [!eba-karte|hilfe]- Unterlagen: aus ILIAS, einordnen, annotieren
> Kursdateien kommen von selbst aus ILIAS, alles andere legst du in den Eingang.
>
> 1. Einmal unter [[#Verbindungen]] **ILIAS-Unterlagen** verbinden und deine Kurse wählen. Neue Dateien landen dann von selbst unter [[Unterlagen]], sofort mit **Aus ILIAS holen**.
> 2. Andere Dateien (Mail, Scan, ZIP) in den Ordner **Eingang** deines Tresors legen.
> 3. **Unterlagen einordnen** tippen, in der Vorschau **Alle übernehmen**.
> 4. Zum Lesen und Anmerken in der Unterlage **Öffnen ↗** tippen.
>
> > [!eba-info]- Mehr erfahren
> > - **ILIAS:** Ein Gerät reicht, die Dateien kommen über deinen Sync auf die anderen. Benutzername und Passwort bleiben auf diesem Gerät, das Passwort verschlüsselt im Schlüsselbund von Obsidian. Trennen: [[#Verbindungen]] → **ILIAS-Unterlagen** → **Mehr erfahren** → **Trennen**.
> > - **Anmeldung klappt nicht:** Fragt die Uni nach deiner Zustimmung, einmal im Browser bei ILIAS anmelden und zustimmen, dann erneut **Verbinden**. Mit zweitem Faktor geht es noch nicht.
> > - **Was nicht kommt:** Videos und Dateien über 50 MB bleiben in ILIAS. Was du löschst, kommt nicht wieder. Umbenennen und Verschieben ist sicher.
> > - **Geänderte Dateien:** Hast du eine Datei angemerkt und der Dozent lädt sie neu hoch, bleibt deine, die neue liegt daneben als „… neue Fassung JJJJ-MM-TT“.
> > - **In den Eingang:** Windows: im Explorer kopieren. iPhone/iPad: **Teilen → In Dateien sichern →** Ordner **Eingang**; Papier über die App **Dateien → ⋯ → Dokumente scannen**; ZIP vorher antippen, dann entpackt es sich. PowerPoint: als PDF exportieren und beide mit gleichem Namen ablegen.
> > - **Namen:** `B110 Folien 03 Entscheidungstheorie.pdf` (Code, Art, Nummer, Titel), Ordner `Unterlagen/<Code Modulname>`, daneben je Datei eine Notiz mit Status **neu · gelesen · bearbeitet**. Eigene Lösungen werden `Eigene Lösung 03`, annotierte Folien `Mitschrift`.
> > - **Stift auf dem iPad (einmal einrichten):** Dateien-App → PDF gedrückt halten → **Informationen** → **Immer öffnen mit: Vorschau**; dann **Öffnen mit** → Haken bei **Mit Quick Look anzeigen** entfernen. Danach **Öffnen ↗** → **Markieren** → **Fertig**: Die Anmerkungen stehen in derselben PDF. Nicht über „Teilen“ öffnen, das legt eine Kopie an.
> > - **Lesen und zitieren:** `[[Datei.pdf#page=12]]` springt auf Seite 12. Die Suche findet nur Text in Notizen, nicht in PDFs. Jede PDF belegt Platz auf jedem Gerät; ganze Bücher lieber nicht ablegen.

> [!eba-karte|hilfe]- Aufbau: Ordner im Tresor
> | Ordner | Inhalt |
> | --- | --- |
> | **Dashboard** | Startseite mit Kennzahlen, Knöpfen, Woche, Fristen und To-dos |
> | **Studium** | Übersichtsseiten: Studienverlauf, Termine & Anmeldungen, Prüfungen, Noten & ECTS, Unterlagen (mit Übungsblättern), Schwerpunkt-Planer, Kontakte & Links, Einstellungen & Hilfe, Stundenplan |
> | **Module** | 86 Module aus dem Modulhandbuch (dazu der Vorkurs SQ888), sortiert nach Grundstudium, Profil & Vertiefung, Schwerpunktkatalog, Schlüsselqualifikation & Abschluss; eigene Module unter Weitere Module |
> | **Vorlesungen, Übungsblätter, Schlüsselqualifikationen** | deine Notizen und SQ-Kurse |
> | **Termine, Stundenplan** | Fristen, Events und Lehrveranstaltungen, je eine Notiz |
> | **Eingang** | neue PDFs, Folien, Scans, bevor sie eingeordnet sind |
> | **Unterlagen** | Folien, Skripte, Übungen, Lösungen, Altklausuren je Modul (`Unterlagen/<Code> <Modultitel>/…`), daneben je Datei eine Notiz |
> | **Anhänge** | Bilder und Screenshots, die du in Notizen ziehst oder einfügst |
> | **System** | gespeicherte Einstellungen, Semestertermine und Musterpläne (Daten), Gerüste und Skripte |

> [!eba-karte|hilfe]- Geräte: einrichten, Unterschiede
> > [!eba-raster|2]
> > > [!eba-regel] Einmal pro Gerät
> > > 1. Ordner in Obsidian **als Tresor öffnen** (Name egal).
> > > 2. **Vertrauen und Plugins aktivieren** tippen. Das Dashboard öffnet sich, Aussehen und Dateitypen sind schon eingestellt.
> > > 3. Unter [[#Verbindungen]] Alma und ILIAS verbinden. Beides gilt nur für dieses Gerät.
> > > 4. **Weiteres Gerät (optional):** Liegt der Tresor in iCloud, dort nur öffnen und **Vertrauen** tippen.
> >
> > > [!eba-info] Unterschiede je Gerät
> > > - **Windows:** statt <kbd>⌘</kbd> die Taste <kbd>Strg</kbd>.
> > > - **iPad/iPhone:** Tabellenzellen **antippen** statt Doppelklick, Aufgaben über das Kästchen-Symbol über der Tastatur, breite Tabellen seitlich wischen.
>
> > [!eba-achtung] Bitte nicht umbenennen
> > `System/Einstellungen.md` und die Seiten in `Studium/` (vor allem Noten & ECTS, Prüfungen, Stundenplan, Unterlagen) nicht umbenennen. Das Feld **uebersicht** in Notizen bitte stehen lassen.

### Stand der Angaben

Regeln und Module haben den Stand 30.09.2026. Termine und Semesterdaten kommen laufend über die zentralen Daten; manches ist noch geschätzt oder nicht eindeutig geregelt.

<details class="eba-mehr"><summary>Mehr erfahren</summary><p><b>Noch geschätzt, wird mit den zentralen Daten ersetzt</b></p><ul><li>Nachholtermin <b>WS 2026/27</b> sowie Anmeldefristen und Klausurphasen ab <b>SS 2027</b>.</li><li>Erasmus-Bewerbung <b>November 2027</b> und Bachelorarbeits-Frist <b>Juli 2028</b>.</li><li>Orientierungsprüfung bis <b>30.09.2028</b>: aus „Ende des 4. Fachsemesters“ abgeleitet, gilt ohne Urlaubssemester.</li></ul><p><b>Nicht belegt oder widersprüchlich</b></p><ul><li>Formale Wahl der Variante: weder PO noch Modulhandbuch regeln Wie und Wann; klärt die Studienfachberatung. Studium Autopilot empfiehlt die Wahl vor dem 3. Fachsemester, weil sich ab dann die Musterpläne unterscheiden.</li><li><b>B370</b> und <b>S313</b> ohne Modulbeschreibung, <b>S312</b> in keiner EcoBA-Studienplantabelle.</li><li>Frist der Orientierungsprüfung: Modulhandbuch nennt in einem Plan Ende <b>FS 3</b>, maßgeblich ist die PO mit <b>FS 4</b>.</li><li>Rücktritt bei Krankheit: BRPO „unverzüglich“, FAQ „innerhalb von drei Werktagen“; im Zweifel sofort handeln.</li><li>Gesamtnote: ob nach zwei Stellen abgeschnitten wird, regelt die BRPO nicht eindeutig (<b>§ 35 Abs. 2</b> verweist nicht auf § 19 Abs. 3 Satz 3); Studium Autopilot schneidet ab.</li><li>Elective Studies: fachfremde Fächer (z. B. Informatik, Mathematik, Psychologie, Recht) mit mind. <b>15 ECTS</b> je Fach.</li><li>Manche Schwerpunktbereiche und Bachelorseminare setzen Module voraus (z. B. <b>B342</b>: <b>B240</b> oder <b>B340</b>); vor der Wahl die Modulbeschreibung prüfen.</li><li>„Ohne Spezialisierung“ mit Data Science allein: ob VWL- und BWL-Pflicht erfüllt sind, sagt das Modulhandbuch nicht; der Planer lässt es zu.</li><li>Citavi-Campuslizenz nicht belegt (Zotero und EndNote sind belegt).</li><li>Kein fachbereichsweiter Leitfaden für wissenschaftliches Arbeiten belegt; es gibt Vorgaben einzelner Lehrstühle.</li></ul></details>
