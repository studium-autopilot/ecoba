---
typ: "modul"
code: "B340"
titel: "Organisation"
titel_en: "Organization"
ects: 9
fachsemester: 4
fs_empfohlen: "4.–6."
gruppe: "Schwerpunkt"
rolle_economics: "Schwerpunktbereich (siehe bereich) oder Elective Studies"
rolle_ba: "Schwerpunktbereich (siehe bereich) oder Elective Studies"
rolle_ohne: "Schwerpunktbereich (siehe bereich) oder Elective Studies"
bereiche:
  - "Firms and Markets"
  - "Managerial Accounting and Organisation"
  - "Elective Studies"
pruefung: "Klausur 60 min"
benotet: true
notenblock: "66 %"
sprache: "Deutsch"
turnus: "SS"
verantwortlich: "Prof. Dr. Kerstin Pull"
op_modul: false
status: "offen"
ergebnis:
versuch:
klausur:
semester_geplant: ""
gewaehlt: false
anrechnung: "Firms and Markets"
zusatz: false
uebersicht: "[[Noten & ECTS]]"
aliases:
  - "B340"
  - "Organisation"
tags:
  - "modul"
cssclasses:
  - "eba"
  - "eba-s-modul"
---

<div class="eba-kopf">
<div class="eba-pfad"><a class="internal-link" data-href="Dashboard" href="Dashboard">Dashboard</a><a class="internal-link" data-href="Noten & ECTS" href="Noten & ECTS">Module</a><span>Schwerpunkt</span></div>
<h1>B340 · Organisation</h1>
<p class="eba-lead">Entscheidungs-, Verhaltens-, Informationsökonomik, Organisationsprobleme, Corporate Governance, Mitbestimmung · Organization</p>
<div class="eba-meta"><span><b>9</b> ECTS</span><span>FS 4.–6.</span><span>SS</span><span>Klausur 60 min</span><span>Deutsch</span><span>Notenblock 66 %</span></div>
</div>


> [!eba-tabelle|schlicht] Mein Stand
> ```base
> filters:
>   and:
>     - file == this.file
> formulas:
>   plan: 'html("<a class=\"eba-plan\" href=\"obsidian://studium-autopilot?aktion=plan&modul=" + file.basename.replace(/%/g, "%25").replace(/&/g, "%26").replace(/#/g, "%23").replace(/\+/g, "%2B") + "\">" + if(gewaehlt, "✓ Im Plan", "+ Planen") + "</a>")'
> properties:
>   note.status:
>     displayName: Status
>   note.ergebnis:
>     displayName: Note
>   note.versuch:
>     displayName: Versuch
>   note.klausur:
>     displayName: Prüfungstermin
>   note.semester_geplant:
>     displayName: Semester
>   formula.plan:
>     displayName: Im Plan
>   note.anrechnung:
>     displayName: Anrechnung in
> views:
>   - type: table
>     name: Mein Stand
>     order:
>       - status
>       - ergebnis
>       - versuch
>       - klausur
>       - semester_geplant
>       - formula.plan
>       - anrechnung
> ```


> [!eba-neu] Neu zu diesem Modul
> - [Vorlesung](obsidian://studium-autopilot?aktion=vorlesung&code=B340)
> - [Übungsblatt](obsidian://studium-autopilot?aktion=uebungsblatt&code=B340)


> [!eba-raster|2]
> > [!eba-karte|handy-zu]+ Lehrveranstaltung
> > - **Lehrform:** Vorlesung (3 SWS) Übung (2 SWS) / Mitarbeit, Selbststudium, Literaturstudium
> > - **Workload:** Kontaktzeit 75 h + Selbststudium 195 h = 270 h
> > - **Verantwortlich:** Prof. Dr. Kerstin Pull
> > - **Voraussetzungen:** keine laut Modulhandbuch
> > - **Dauer:** 1 Semester
>
> > [!eba-regel|handy-zu]+ Prüfung
> > - **Form:** Klausur (60 Minuten) (9 CP) – 100 % der Modulnote
> > - **Gesamtnote:** zählt im 66 %-Block (Schwerpunkte und Bachelorarbeit), gewichtet nach ECTS
> > - **Versuche:** 3 (zwei Wiederholungen), jeweils eigene Anmeldung in Alma


> [!eba-ziel|handy-zu]+ Anrechenbar in
> - **Firms and Markets** · VWL-Schwerpunktbereich III
> - **Managerial Accounting and Organisation** · BWL-Schwerpunktbereich IV
> - **Elective Studies** · Schwerpunktbereich ohne Zuordnung
>
> Ein Modul zählt nur in **einem** Bereich. Du wählst ihn im Feld „Anrechnung in“ oben.


> [!eba-info|handy-zu]+ Hinweise
> - Ab SS 2026 wahlweise mit 6 oder 9 CP, immer im SS (Aktuelles zum Studium).


## Unterlagen

> [!eba-neu|ohne-titel]
> - [Unterlagen einordnen](obsidian://studium-autopilot?aktion=einordnen&code=B340)
> - [In B340 suchen](obsidian://studium-autopilot?aktion=suchen&q=path%3AB340%20)

> [!eba-tabelle] Folien, Skripte, Übungen, Altklausuren
> ```base
> formulas:
>   was: 'file.asLink(if(nummer, art + " " + if(nummer < 10, "0" + nummer, "" + nummer), art) + if(titel, " · " + titel, ""))'
>   oeffnen: 'html("<a class=\"eba-oeffnen\" href=\"obsidian://studium-autopilot?aktion=oeffnen&notiz=" + file.basename.replace(/%/g, "%25").replace(/&/g, "%26").replace(/#/g, "%23").replace(/\+/g, "%2B") + "\">Öffnen ↗</a>")'
>   groesse: '(file.size / 1048576).toFixed(1) + " MB"'
> properties:
>   formula.was:
>     displayName: Unterlage
>   note.seiten:
>     displayName: Seiten
>   note.status:
>     displayName: Status
>   formula.oeffnen:
>     displayName: Datei
>   file.name:
>     displayName: Datei
>   file.ext:
>     displayName: Typ
>   formula.groesse:
>     displayName: Größe
> views:
>   - type: table
>     name: Nach Art
>     filters:
>       and:
>         - 'typ == "unterlage"'
>         - 'code == "B340"'
>     groupBy:
>       property: note.art
>       direction: ASC
>     order:
>       - formula.was
>       - seiten
>       - status
>       - formula.oeffnen
>     sort:
>       - property: nummer
>         direction: ASC
>     columnSize:
>       formula.was: 330
>       note.seiten: 80
>       note.status: 100
>       formula.oeffnen: 90
>   - type: table
>     name: Noch nicht gelesen
>     filters:
>       and:
>         - 'typ == "unterlage"'
>         - 'code == "B340"'
>         - 'status == "neu" || !status'
>     order:
>       - formula.was
>       - seiten
>       - formula.oeffnen
>     sort:
>       - property: art
>         direction: ASC
>       - property: nummer
>         direction: ASC
>   - type: table
>     name: Dateien im Ordner
>     filters:
>       and:
>         - (file.folder == "Unterlagen/B340" || file.folder.startsWith("Unterlagen/B340 "))
>         - 'file.ext != "md"'
>     order:
>       - file.name
>       - file.ext
>       - formula.groesse
>     sort:
>       - property: file.name
>         direction: ASC
> ```

## Meine Notizen

> [!eba-tabelle|handy-zu]+ Vorlesungen, Übungsblätter, Stundenplan, Termine
> ```base
> filters:
>   and:
>     - 'code == "B340"'
>     - 'typ != "modul"'
>     - 'typ != "unterlage"'
> formulas:
>   wann: 'if(faellig, faellig, datum)'
>   art: 'if(typ == "vorlesung", "Vorlesung", if(typ == "übungsblatt", "Übungsblatt", if(typ == "lehrveranstaltung", "Stundenplan", if(typ == "termin", "Termin", typ))))'
> properties:
>   file.name:
>     displayName: Notiz
>   formula.wann:
>     displayName: Datum
>   formula.art:
>     displayName: Art
>   note.status:
>     displayName: Status
>   note.nachgearbeitet:
>     displayName: Nachgearbeitet
> views:
>   - type: table
>     name: Meine Notizen
>     groupBy:
>       property: formula.art
>       direction: ASC
>     order:
>       - file.name
>       - formula.wann
>       - status
>       - nachgearbeitet
>     sort:
>       - property: formula.wann
>         direction: DESC
>     columnSize:
>       file.name: 330
>       formula.wann: 120
>       note.status: 110
>       note.nachgearbeitet: 120
> ```


<p class="eba-fuss">Quelle: MHB B.Sc. Wiwi (Datei 2026-3-24_Modulhandbuch_B.Sc.Wiwi.pdf), S. 71; Webseite "Aktuelles zum Studium" (Stand 30.09.2026) · Stand der Recherche 30.09.2026 · <a class="internal-link" data-href="Kontakte & Links#Offizielle Dokumente" href="Kontakte & Links#Offizielle Dokumente">Alle Quellen</a></p>
