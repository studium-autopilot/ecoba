---
typ: modul
code: B110
titel: Einführung in die Betriebswirtschaftslehre
titel_en: Introduction to Business Administration
ects: 6
fachsemester: 1
fs_empfohlen: "1"
gruppe: Grundstudium
rolle_economics: Pflicht
rolle_ba: Pflicht
rolle_ohne: Pflicht
bereiche: []
pruefung: Klausur 90 min, open book
benotet: true
notenblock: 34 %
sprache: Deutsch
turnus: WS
verantwortlich: Prof. Dr. Monika Gehde-Trapp
op_modul: true
status: "offen"
ergebnis:
versuch:
klausur:
semester_geplant: ""
zusatz: false
uebersicht: "[[Noten & ECTS]]"
aliases:
  - B110
  - Einführung in die Betriebswirtschaftslehre
tags:
  - modul
cssclasses:
  - eba
  - eba-s-modul
---

<div class="eba-kopf">
<div class="eba-pfad"><a class="internal-link" data-href="Dashboard" href="Dashboard">Dashboard</a><a class="internal-link" data-href="Noten & ECTS" href="Noten & ECTS">Module</a><span>Grundstudium</span></div>
<h1>B110 · Einführung in die Betriebswirtschaftslehre</h1>
<p class="eba-lead">Gegenstand der BWL, Entscheidungstheorie, nicht-kooperative Spiele, Rechtsformen, Unternehmensziele · Introduction to Business Administration</p>
<div class="eba-meta"><span><b>6</b> ECTS</span><span>FS 1</span><span>WS</span><span>Klausur 90 min</span><span>Deutsch</span><span class="eba-akzent">Orientierungsprüfung</span><span>Notenblock 34 %</span></div>
</div>


> [!eba-tabelle|schlicht] Mein Stand
> ```base
> filters:
>   and:
>     - file == this.file
> formulas:
>   mpid: 'file("System/Daten/Musterplan.md").properties.plaene.filter(value.name == file("System/Einstellungen.md").properties.variante).map(value.id).join("")'
>   mpfs: 'file("System/Daten/Musterplan.md").properties.eintraege.filter(value.plan == formula.mpid && value.code == code).map(number(value.fs)).sort()'
>   fsplan: 'if(gruppe == "Schwerpunkt", 0, if(formula.mpid == "", if(fachsemester, number(fachsemester), 0), if(formula.mpfs.length > 0, formula.mpfs[0], if(gewaehlt == true && fachsemester, number(fachsemester), 0))))'
>   semester: 'if(semester_geplant, semester_geplant, if(formula.fsplan > 0, file("System/Einstellungen.md").properties.semesterliste.filter(number(value.split("|")[0]) == formula.fsplan).map(value.split("|")[1]).join(""), ""))'
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
>     displayName: Eigene Planung
>   formula.semester:
>     displayName: Semester
> views:
>   - type: table
>     name: Mein Stand
>     order:
>       - status
>       - ergebnis
>       - versuch
>       - klausur
>       - formula.semester
>       - semester_geplant
> ```


> [!eba-neu] Neu zu diesem Modul
> - [Vorlesung](obsidian://studium-autopilot?aktion=vorlesung&code=B110)
> - [Übungsblatt](obsidian://studium-autopilot?aktion=uebungsblatt&code=B110)


> [!eba-raster|2]
> > [!eba-karte|handy-zu]+ Lehrveranstaltung
> > - **Lehrform:** Vorlesung (2 SWS) Übung (2 SWS) / Mitarbeit, Gruppendiskussion, Selbststudium
> > - **Workload:** Kontaktzeit 60 h + Selbststudium 120 h = 180 h
> > - **Verantwortlich:** Prof. Dr. Monika Gehde-Trapp
> > - **Voraussetzungen:** keine laut Modulhandbuch
> > - **Dauer:** 1 Semester
>
> > [!eba-regel|handy-zu]+ Prüfung
> > - **Form:** Klausur (90 Minuten) (6 CP) – 100 % der Modulnote
> > - **Gesamtnote:** zählt im 34 %-Block (Pflicht- und Profilbildungsmodule), gewichtet nach ECTS
> > - **Versuche:** 3 (zwei Wiederholungen), jeweils eigene Anmeldung in Alma
> > - **Orientierungsprüfung:** 4 der 6 OP-Module bis Ende FS 4 bestehen
> > - **Hilfsmittel:** nicht-programmierbarer Taschenrechner, Wörterbuch ohne Notizen (FAQ)


## Unterlagen

> [!eba-neu|ohne-titel]
> - [Unterlagen einordnen](obsidian://studium-autopilot?aktion=einordnen&code=B110)
> - [In B110 suchen](obsidian://studium-autopilot?aktion=suchen&q=path%3AB110%20)

> [!eba-tabelle] Folien, Skripte, Übungen, Altklausuren
> ```base
> formulas:
>   was: 'file.asLink(if(nummer, art + " " + if(nummer < 10, "0" + nummer, "" + nummer), art) + if(titel, " · " + titel, ""))'
>   oeffnen: 'html("<a class=\"eba-oeffnen\" href=\"obsidian://studium-autopilot?aktion=oeffnen&notiz=" + file.basename.replace(/%/g, "%25").replace(/&/g, "%26").replace(/#/g, "%23").replace(/\+/g, "%2B") + "\">Öffnen ↗</a>")'
>   groesse: '(file.size / 1048576).toFixed(1) + " MB"'
>   bereich: 'if(file.folder.endsWith("/Vorlesung"), "Vorlesung", if(file.folder.endsWith("/Übung"), "Übung", "Allgemein"))'
> properties:
>   formula.bereich:
>     displayName: Bereich
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
>     name: Nach Bereich
>     filters:
>       and:
>         - 'typ == "unterlage"'
>         - 'code == "B110"'
>     groupBy:
>       property: formula.bereich
>       direction: DESC
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
>         - 'code == "B110"'
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
>         - (file.folder == "Unterlagen/B110" || file.folder.startsWith("Unterlagen/B110 "))
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
>     - 'code == "B110"'
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


<p class="eba-fuss">Quelle: MHB B.Sc. Wiwi (Datei 2026-3-24_Modulhandbuch_B.Sc.Wiwi.pdf), S. 41; PO 2023 BT EcoBA (AmtlBekUT 24/2023, S. 310-317), § 4 · Stand der Recherche 30.09.2026 · <a class="internal-link" data-href="Kontakte & Links#Offizielle Dokumente" href="Kontakte & Links#Offizielle Dokumente">Alle Quellen</a></p>
