---
typ: "modul"
code: "DS320"
titel: "Introduction to Data Science"
titel_en: "Introduction to Data Science"
ects: 6
fachsemester: 4
fs_empfohlen: "4.–6."
gruppe: "Schwerpunkt"
rolle_economics: "Schwerpunktbereich (siehe bereich) oder Elective Studies"
rolle_ba: "Schwerpunktbereich (siehe bereich) oder Elective Studies"
rolle_ohne: "Schwerpunktbereich (siehe bereich) oder Elective Studies"
bereiche:
  - "Data Science"
  - "Managerial Accounting and Organisation"
  - "Elective Studies"
pruefung: "Klausur 60 min"
benotet: true
notenblock: "66 %"
sprache: "Englisch"
turnus: "SS"
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
  - "DS320"
  - "Introduction to Data Science"
tags:
  - "modul"
cssclasses:
  - "eba"
  - "eba-s-modul"
---

<div class="eba-kopf">
<div class="eba-pfad"><a class="internal-link" data-href="Dashboard" href="Dashboard">Dashboard</a><a class="internal-link" data-href="Noten & ECTS" href="Noten & ECTS">Module</a><span>Schwerpunkt</span></div>
<h1><span class="eba-code">DS320</span> Introduction to Data Science</h1>
<div class="eba-meta"><span><b>6</b> ECTS</span><span>4.–6. FS</span><span>SS</span><span>Klausur 60 min</span><span>Englisch</span><span>Notenblock 66 %</span></div>
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
>     - 'code == "DS320"'
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
> > - **Inhalte:** Einführung Data Science, Statistiksoftware, statistische Konzepte, Anwendungsbeispiele
> > - **Lehrform:** lecture and tutorial (2 SWS) / Oral participation, independent study, literature study
> > - **Workload:** Kontaktzeit 30 h + Selbststudium 150 h = 180 h
> > - **Verantwortlich:** Prof. Dr. Dominik Papies
> > - **Voraussetzungen:** keine laut Modulhandbuch
> > - **Dauer:** 1 Semester
>
> > [!eba-regel|handy-zu]+ Prüfung
> > - **Form:** Klausur (60 Minuten) (6 ECTS) – 100 % der Modulnote
> > - **Studienleistung:** Assignments


> [!eba-ziel|handy-zu]+ Anrechenbar in
> - **Data Science** · VWL + BWL-Schwerpunktbereich V / VI
> - **Managerial Accounting and Organisation** · BWL-Schwerpunktbereich IV
> - **Elective Studies** · Schwerpunktbereich ohne Zuordnung
>
> Ein Modul zählt nur in **einem** Bereich. Du wählst ihn im Feld „Anrechnung in“ oben.


<p class="eba-fuss">Quelle: MHB B.Sc. Wiwi (Datei 2026-3-24_Modulhandbuch_B.Sc.Wiwi.pdf), S. 93 · Stand der Recherche 30.09.2026 · <a class="internal-link" data-href="Kontakte & Links#Offizielle Dokumente" href="Kontakte & Links#Offizielle Dokumente">Alle Quellen</a></p>
