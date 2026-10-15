---
typ: "modul"
code: "E333"
titel: "Blockchain and Cryptocurrencies"
titel_en: "Blockchain and Cryptocurrencies"
ects: 6
fachsemester: 3
fs_empfohlen: "3.–5."
gruppe: "Schwerpunkt"
rolle_economics: "Schwerpunktbereich (siehe bereich) oder Elective Studies"
rolle_ba: "Schwerpunktbereich (siehe bereich) oder Elective Studies"
rolle_ohne: "Schwerpunktbereich (siehe bereich) oder Elective Studies"
bereiche:
  - "Economic Policy"
  - "Elective Studies"
pruefung: "Klausur 90 min"
benotet: true
notenblock: "66 %"
sprache: "Englisch"
turnus: "WS"
verantwortlich: "Dr. Christian Manger"
op_modul: false
status: "offen"
ergebnis:
versuch:
klausur:
semester_geplant: ""
gewaehlt: false
anrechnung: "Economic Policy"
zusatz: false
uebersicht: "[[Noten & ECTS]]"
aliases:
  - "E333"
  - "Blockchain and Cryptocurrencies"
tags:
  - "modul"
cssclasses:
  - "eba"
  - "eba-s-modul"
---

<div class="eba-kopf">
<div class="eba-pfad"><a class="internal-link" data-href="Dashboard" href="Dashboard">Dashboard</a><a class="internal-link" data-href="Noten & ECTS" href="Noten & ECTS">Module</a><span>Schwerpunkt</span></div>
<h1>E333 · Blockchain and Cryptocurrencies</h1>
<p class="eba-lead">Bitcoin, Proof of Work/Stake, NFTs, DeFi, Stablecoins, Regulierung, digitales Zentralbankgeld</p>
<div class="eba-meta"><span><b>6</b> ECTS</span><span>FS 3.–5.</span><span>WS</span><span>Klausur 90 min</span><span>Englisch</span><span>Notenblock 66 %</span></div>
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
> - [Vorlesung](obsidian://studium-autopilot?aktion=vorlesung&code=E333)
> - [Übungsblatt](obsidian://studium-autopilot?aktion=uebungsblatt&code=E333)


> [!eba-raster|2]
> > [!eba-karte|handy-zu]+ Lehrveranstaltung
> > - **Lehrform:** lecture (2 SWS) tutorial (1 SWS) / Oral participation, Independent study, Assignments
> > - **Workload:** Kontaktzeit 45 h + Selbststudium 135 h = 180 h
> > - **Verantwortlich:** Dr. Christian Manger
> > - **Voraussetzungen:** E130 Macroeconomics I
> > - **Dauer:** 1 Semester
>
> > [!eba-regel|handy-zu]+ Prüfung
> > - **Form:** Klausur (90 Minuten) (6 CP) – 100 % der Modulnote
> > - **Studienleistung:** Oral Participation, independent study
> > - **Gesamtnote:** zählt im 66 %-Block (Schwerpunkte und Bachelorarbeit), gewichtet nach ECTS
> > - **Versuche:** 3 (zwei Wiederholungen), jeweils eigene Anmeldung in Alma


> [!eba-ziel|handy-zu]+ Anrechenbar in
> - **Economic Policy** · VWL-Schwerpunktbereich II
> - **Elective Studies** · Schwerpunktbereich ohne Zuordnung
>
> Ein Modul zählt nur in **einem** Bereich. Du wählst ihn im Feld „Anrechnung in“ oben.


> [!eba-info|handy-zu]+ Hinweise
> - Ab WS 2026/27 im Wintersemester (Aktuelles zum Studium).


## Unterlagen

> [!eba-neu|ohne-titel]
> - [Unterlagen einordnen](obsidian://studium-autopilot?aktion=einordnen&code=E333)
> - [In E333 suchen](obsidian://studium-autopilot?aktion=suchen&q=path%3AE333%20)

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
>         - 'code == "E333"'
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
>         - 'code == "E333"'
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
>         - (file.folder == "Unterlagen/E333" || file.folder.startsWith("Unterlagen/E333 "))
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
>     - 'code == "E333"'
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


<p class="eba-fuss">Quelle: MHB B.Sc. Wiwi (Datei 2026-3-24_Modulhandbuch_B.Sc.Wiwi.pdf), S. 119; Webseite "Aktuelles zum Studium" (Stand 30.09.2026) · Stand der Recherche 30.09.2026 · <a class="internal-link" data-href="Kontakte & Links#Offizielle Dokumente" href="Kontakte & Links#Offizielle Dokumente">Alle Quellen</a></p>
