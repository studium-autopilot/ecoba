---
typ: "modul"
code: "S312"
titel: "Topics in Applied Econometrics and Statistics"
titel_en: "Topics in Applied Econometrics and Statistics"
ects: 6
fachsemester: 6
fs_empfohlen: "ab 6"
gruppe: "Schwerpunkt"
rolle_economics: ""
rolle_ba: ""
rolle_ohne: ""
bereiche: []
pruefung: "Klausur 60 min oder mündlich"
benotet: true
notenblock: "66 %"
sprache: "Englisch"
turnus: "SS"
verantwortlich: "Prof. Dr. Joachim Grammig"
op_modul: false
status: "offen"
ergebnis:
versuch:
klausur:
semester_geplant: ""
gewaehlt: false
anrechnung: ""
zusatz: false
uebersicht: "[[Noten & ECTS]]"
aliases:
  - "S312"
  - "Topics in Applied Econometrics and Statistics"
tags:
  - "modul"
cssclasses:
  - "eba"
  - "eba-s-modul"
---

<div class="eba-kopf">
<div class="eba-pfad"><a class="internal-link" data-href="Dashboard" href="Dashboard">Dashboard</a><a class="internal-link" data-href="Noten & ECTS" href="Noten & ECTS">Module</a><span>Schwerpunkt</span></div>
<h1><span class="eba-code">S312</span> Topics in Applied Econometrics and Statistics</h1>
<div class="eba-meta"><span><b>6</b> ECTS</span><span>FS ab 6</span><span>SS</span><span>Klausur 60 min oder mündlich</span><span>Englisch</span><span>Notenblock 66 %</span></div>
</div>

```eba-modul
```


## Unterlagen

```eba-unterlagen
```

## Meine Notizen

> [!eba-tabelle|schlicht|handy-zu]+ Vorlesungen, Übungsblätter, Stundenplan, Termine
> ```base
> filters:
>   and:
>     - 'code == "S312"'
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
>     name: Meine Notizen
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
> > - **Inhalte:** Themen der angewandten Ökonometrie und Statistik
> > - **Lehrform:** lecture and tutorial (3 SWS) / oral participation, group discussion, self study
> > - **Workload:** Kontaktzeit 46 h + Selbststudium 134 h = 180 h
> > - **Verantwortlich:** Prof. Dr. Joachim Grammig
> > - **Voraussetzungen:** S220 Quantitative Methods in Economics and Business Administration
> > - **Dauer:** 2 Semester
>
> > [!eba-regel|handy-zu]+ Prüfung
> > - **Form:** Klausur (60 Minuten) oder mündliche Prüfung (6 CP) – 100 % der Modulnote


> [!eba-ziel|handy-zu]+ Anrechenbar in
> - In keiner EcoBA-Studienplantabelle aufgeführt. Vor der Belegung mit der Studienfachberatung klären.
>
> Ein Modul zählt nur in **einem** Bereich. Du wählst ihn im Feld „Anrechnung in“ oben.


> [!eba-info|handy-zu]+ Hinweise
> - Nur Modulbeschreibung vorhanden (u.a. für EBA Data Science/Elective Studies genannt); nicht in den EBA-Studienplantabellen – vor Belegung mit Studienfachberatung klären.


<p class="eba-fuss">Quelle: MHB B.Sc. Wiwi (Datei 2026-3-24_Modulhandbuch_B.Sc.Wiwi.pdf), S. 158 · Stand der Recherche 30.09.2026 · <a class="internal-link" data-href="Kontakte & Links#Offizielle Dokumente" href="Kontakte & Links#Offizielle Dokumente">Alle Quellen</a></p>
