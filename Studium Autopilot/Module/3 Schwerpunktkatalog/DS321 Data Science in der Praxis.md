---
typ: "modul"
code: "DS321"
titel: "Data Science in der Praxis"
titel_en: "Data Science in Practice"
ects: 6
fachsemester: 3
fs_empfohlen: "3.–6."
gruppe: "Schwerpunkt"
rolle_economics: "Schwerpunktbereich (siehe bereich) oder Elective Studies"
rolle_ba: "Schwerpunktbereich (siehe bereich) oder Elective Studies"
rolle_ohne: "Schwerpunktbereich (siehe bereich) oder Elective Studies"
bereiche:
  - "Data Science"
  - "Elective Studies"
pruefung: "unbenotet"
benotet: false
notenblock: "–"
sprache: "Deutsch"
turnus: "WS, SS"
verantwortlich: "Prof. Dr. Dominik Papies"
op_modul: false
status: "offen"
ergebnis:
versuch:
klausur:
semester_geplant: ""
gewaehlt: false
anrechnung: "Data Science"
zusatz: false
uebersicht: "[[Noten & ECTS]]"
aliases:
  - "DS321"
  - "Data Science in der Praxis"
tags:
  - "modul"
cssclasses:
  - "eba"
  - "eba-s-modul"
---

<div class="eba-kopf">
<div class="eba-pfad"><a class="internal-link" data-href="Dashboard" href="Dashboard">Dashboard</a><a class="internal-link" data-href="Noten & ECTS" href="Noten & ECTS">Module</a><span>Schwerpunkt</span></div>
<h1><span class="eba-code">DS321</span> Data Science in der Praxis</h1>
<p class="eba-untertitel">Data Science in Practice</p>
<div class="eba-meta"><span><b>6</b> ECTS</span><span>3.–6. FS</span><span>WS, SS</span><span>unbenotet</span><span>Deutsch</span><span>unbenotet</span></div>
</div>

```eba-modul
```


## Unterlagen

```eba-unterlagen
```

## Zum Modul

> [!eba-tabelle|schlicht|handy-zu]+ Stundenplan, Termine
> ```base
> filters:
>   and:
>     - 'code == "DS321"'
>     - 'typ != "modul"'
>     - 'typ != "unterlage"'
>     - 'typ != "vorlesung"'
> formulas:
>   wann: 'if(faellig, faellig, datum)'
>   art: 'if(typ == "übungsblatt", "Übungsblätter", if(typ == "lehrveranstaltung", "Stundenplan", if(typ == "termin", "Termine", if(typ == "karteikarten", "Karteikarten", typ))))'
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
>     sort:
>       - property: formula.wann
>         direction: DESC
>     columnSize:
>       formula.notiz: 330
>       formula.wann: 120
>       note.status: 110
> ```


## Steckbrief

> [!eba-raster|2]
> > [!eba-karte|handy-zu]+ Lehrveranstaltung
> > - **Inhalte:** Software (R, Python, Excel), Datenaufbereitung, Analyse, Visualisierung, Data Literacy
> > - **Lehrform:** Vorlesung (1 SWS) Kolloquium (1 SWS) / Mitarbeit, Programmieren, Gruppendiskussion, Selbststudium
> > - **Workload:** Kontaktzeit 30 h + Selbststudium 150 h = 180 h
> > - **Verantwortlich:** Prof. Dr. Dominik Papies
> > - **Voraussetzungen:** keine laut Modulhandbuch
> > - **Dauer:** 1 Semester
>
> > [!eba-regel|handy-zu]+ Prüfung
> > - **Form:** unbenotet
> > - **Studienleistung:** Assignments
> > - **Gesamtnote:** zählt nicht, weil unbenotet


> [!eba-ziel|handy-zu]+ Anrechenbar in
> - **Data Science** · VWL + BWL-Schwerpunktbereich V / VI
> - **Elective Studies** · Schwerpunktbereich ohne Zuordnung
>
> Ein Modul zählt nur in **einem** Bereich. Du wählst ihn im Feld „Anrechnung in“ oben.


<p class="eba-fuss">Quelle: MHB B.Sc. Wiwi (Datei 2026-3-24_Modulhandbuch_B.Sc.Wiwi.pdf), S. 94 · Stand der Recherche 30.09.2026 · <a class="internal-link" data-href="Kontakte & Links#Offizielle Dokumente" href="Kontakte & Links#Offizielle Dokumente">Alle Quellen</a></p>
