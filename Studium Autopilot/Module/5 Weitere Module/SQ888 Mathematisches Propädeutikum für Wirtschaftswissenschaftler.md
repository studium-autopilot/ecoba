---
typ: "modul"
code: "SQ888"
titel: "Mathematisches Propädeutikum für Wirtschaftswissenschaftler"
titel_en: "Mathematics Preparatory Course"
ects: 0
fachsemester: 1
fs_empfohlen: "vor dem 1."
gruppe: "Weitere"
rolle_economics: "Vorkurs (kein Modul der PO)"
rolle_ba: "Vorkurs (kein Modul der PO)"
rolle_ohne: "Vorkurs (kein Modul der PO)"
bereiche: []
pruefung: "keine"
benotet: false
notenblock: "–"
sprache: "Deutsch"
turnus: "WS"
verantwortlich: "Dr. Julie Schnaitmann"
op_modul: false
status: "offen"
ergebnis:
versuch:
klausur:
semester_geplant: ""
gewaehlt: false
zusatz: true
uebersicht: "[[Noten & ECTS]]"
aliases:
  - "SQ888"
  - "Mathe-Vorkurs"
tags:
  - "modul"
cssclasses:
  - "eba"
  - "eba-s-modul"
---

<div class="eba-kopf">
<h1><span class="eba-code">SQ888</span> Mathe-Vorkurs</h1>
<p class="eba-lead">Mathematisches Propädeutikum vor Semesterbeginn: frischt die Schulmathematik auf, die S100 voraussetzt.</p>
<div class="eba-meta"><span><b>0</b> ECTS</span><span>vor Vorlesungsbeginn</span><span>keine Prüfung</span><span>keine Anmeldung</span><span>Deutsch</span></div>
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
>     - 'code == "SQ888"'
>     - 'typ != "modul"'
>     - 'typ != "unterlage"'
>     - 'typ != "vorlesung"'
> formulas:
>   wann: 'if(faellig, faellig, datum)'
>   art: 'if(typ == "übungsblatt", "Übungsblätter", if(typ == "lehrveranstaltung", "Stundenplan", if(typ == "termin", "Termine", if(typ == "karteikarten", "Karteikarten", typ))))'
>   notiz: 'file.asLink(if(typ == "termin" && titel, titel.toString().replace(code + " ", ""), file.basename.replace(/^\d{4}-\d{2}-\d{2}\s+/, "").replace(/^(\S+ \d{1,2})\.(\d{2}) /, "$1:$2 ").replace(code + " ", "")))'
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
>         direction: ASC
>       - property: wochentag
>         direction: ASC
>       - property: beginn
>         direction: ASC
>     columnSize:
>       formula.notiz: 330
>       formula.wann: 120
>       note.status: 110
> ```


## Steckbrief

> [!eba-raster|2]
> > [!eba-karte|handy-zu]+ Veranstaltung
> > - **Termine:** einige Vormittage vor Vorlesungsbeginn im Wintersemester; die aktuellen stehen von selbst unter [[Termine & Anmeldungen]].
> > - **Leitung:** Dr. Julie Schnaitmann
> > - **Material:** [ILIAS-Kurs](https://vitruv.uni-tuebingen.de/ilias3/goto_pr01_crs_4803.html)
> > - **Inhalt:** Mengenlehre, Zahlenbereiche, Potenzen/Wurzeln, Ungleichungen, Gleichungen, Funktionen, Umkehr-, Exponential- und Logarithmusfunktionen
>
> > [!eba-regel|handy-zu]+ Einordnung
> > - Eigene Veranstaltung **SQ888** (Einführungskurs), **kein Modul der PO 2023**.
> > - **0 ECTS**, keine Prüfung, keine Anmeldung nötig. Zählt weder für ECTS noch für die Note.
> > - In Alma den Modulen [[S100 Mathematische Methoden der Wirtschaftswissenschaft|S100]] und SQ100 zugeordnet.


<p class="eba-fuss">Quellen: <a href="https://uni-tuebingen.de/fakultaeten/wirtschafts-und-sozialwissenschaftliche-fakultaet/faecher/fachbereich-wirtschaftswissenschaft/wirtschaftswissenschaft/lehrstuehle/statistik-und-oekonometrie/statistics-econometrics-and-empirical-economics/teaching/winter-202627/mathematisches-propaedeutikum-fuer-wirtschaftswissenschaftler-vorkurs/">Kursseite WS 2026/27</a> · <a href="https://alma.uni-tuebingen.de/alma/pages/startFlow.xhtml?_flowId=detailView-flow&unitId=46219&periodId=237">Alma SQ888</a> · Stand 30.09.2026 · <a class="internal-link" data-href="Kontakte & Links#Offizielle Dokumente" href="Kontakte & Links#Offizielle Dokumente">Alle Quellen</a></p>
