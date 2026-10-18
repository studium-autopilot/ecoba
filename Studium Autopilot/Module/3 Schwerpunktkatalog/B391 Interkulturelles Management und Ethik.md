---
typ: "modul"
code: "B391"
titel: "Interkulturelles Management und Ethik"
titel_en: "Intercultural Management and Ethics"
ects: 6
fachsemester: 3
fs_empfohlen: "3.–6."
gruppe: "Schwerpunkt"
rolle_economics: "Schwerpunktbereich (siehe bereich) oder Elective Studies"
rolle_ba: "Schwerpunktbereich (siehe bereich) oder Elective Studies"
rolle_ohne: "Schwerpunktbereich (siehe bereich) oder Elective Studies"
bereiche:
  - "International Business"
  - "Elective Studies"
pruefung: "Klausur 60 min oder Seminararbeit"
benotet: true
notenblock: "66 %"
sprache: "Deutsch"
turnus: "WS, SS"
verantwortlich: "Prof. Dr. Markus Pudelko"
op_modul: false
status: "offen"
ergebnis:
versuch:
klausur:
semester_geplant: ""
gewaehlt: false
anrechnung: "International Business"
zusatz: false
uebersicht: "[[Noten & ECTS]]"
aliases:
  - "B391"
  - "Interkulturelles Management und Ethik"
tags:
  - "modul"
cssclasses:
  - "eba"
  - "eba-s-modul"
---

<div class="eba-kopf">
<div class="eba-pfad"><a class="internal-link" data-href="Dashboard" href="Dashboard">Dashboard</a><a class="internal-link" data-href="Noten & ECTS" href="Noten & ECTS">Module</a><span>Schwerpunkt</span></div>
<h1><span class="eba-code">B391</span> Interkulturelles Management und Ethik</h1>
<p class="eba-untertitel">Intercultural Management and Ethics</p>
<div class="eba-meta"><span><b>6</b> ECTS</span><span>3.–6. FS</span><span>WS, SS</span><span>Klausur 60 min oder Seminararbeit</span><span>Deutsch</span><span>Notenblock 66 %</span></div>
</div>

```eba-modul
```


## Unterlagen

```eba-unterlagen
```

## Zum Modul

> [!eba-tabelle|schlicht|handy-zu]+ Vorlesungen, Übungsblätter, Stundenplan, Termine
> ```base
> filters:
>   and:
>     - 'code == "B391"'
>     - 'typ != "modul"'
>     - 'typ != "unterlage"'
> formulas:
>   wann: 'if(faellig, faellig, datum)'
>   art: 'if(typ == "vorlesung", "Vorlesungen", if(typ == "übungsblatt", "Übungsblätter", if(typ == "lehrveranstaltung", "Stundenplan", if(typ == "termin", "Termine", if(typ == "karteikarten", "Karteikarten", typ)))))'
>   notiz: 'file.asLink(file.basename.replace(/^\d{4}-\d{2}-\d{2}\s+/, "").replace(code + " ", ""))'
> properties:
>   formula.notiz:
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
>     name: Zum Modul
>     groupBy:
>       property: formula.art
>       direction: ASC
>     order:
>       - formula.notiz
>       - formula.wann
>       - status
>       - nachgearbeitet
>     sort:
>       - property: formula.wann
>         direction: DESC
>     columnSize:
>       formula.notiz: 330
>       formula.wann: 120
>       note.status: 110
>       note.nachgearbeitet: 120
> ```


## Steckbrief

> [!eba-raster|2]
> > [!eba-karte|handy-zu]+ Lehrveranstaltung
> > - **Inhalte:** Seminare des Weltethos-Instituts zur Wirtschaftsethik
> > - **Lehrform:** Seminar (2 SWS) / Selbststudium, Literaturstudium, Mitarbeit, Gruppendiskussion, Präsentation
> > - **Workload:** Kontaktzeit 30 h + Selbststudium 150 h = 180 h
> > - **Verantwortlich:** Prof. Dr. Markus Pudelko
> > - **Voraussetzungen:** keine laut Modulhandbuch
> > - **Dauer:** 1 Semester
>
> > [!eba-regel|handy-zu]+ Prüfung
> > - **Form:** Klausur (60 Minuten) oder Seminararbeit (6 ECTS) – 100 % der Modulnote
> > - **Studienleistung:** Referat


> [!eba-ziel|handy-zu]+ Anrechenbar in
> - **International Business** · BWL-Schwerpunktbereich III
> - **Elective Studies** · Schwerpunktbereich ohne Zuordnung
>
> Ein Modul zählt nur in **einem** Bereich. Du wählst ihn im Feld „Anrechnung in“ oben.


<p class="eba-fuss">Quelle: MHB B.Sc. Wiwi (Datei 2026-3-24_Modulhandbuch_B.Sc.Wiwi.pdf), S. 86 · Stand der Recherche 30.09.2026 · <a class="internal-link" data-href="Kontakte & Links#Offizielle Dokumente" href="Kontakte & Links#Offizielle Dokumente">Alle Quellen</a></p>
