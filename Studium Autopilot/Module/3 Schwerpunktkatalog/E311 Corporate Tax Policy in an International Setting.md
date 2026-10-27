---
typ: "modul"
code: "E311"
titel: "Corporate Tax Policy in an International Setting"
titel_en: "Corporate Tax Policy in an International Setting"
ects: 6
fachsemester: 3
fs_empfohlen: "3.–5."
gruppe: "Schwerpunkt"
rolle_economics: "Schwerpunktbereich (siehe bereich) oder Elective Studies"
rolle_ba: "Schwerpunktbereich (siehe bereich) oder Elective Studies"
rolle_ohne: "Schwerpunktbereich (siehe bereich) oder Elective Studies"
bereiche:
  - "Economic Policy"
  - "International Economics"
  - "Financial Accounting and Business Taxation"
  - "Elective Studies"
pruefung: "Klausur 60 min"
benotet: true
notenblock: "66 %"
sprache: "Englisch"
turnus: "WS"
verantwortlich: "Prof. Dr. Georg Wamser"
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
  - "E311"
  - "Corporate Tax Policy in an International Setting"
tags:
  - "modul"
cssclasses:
  - "eba"
  - "eba-s-modul"
---

<div class="eba-kopf">
<h1><span class="eba-code">E311</span> Corporate Tax Policy in an International Setting</h1>
<div class="eba-meta"><span><b>6</b> ECTS</span><span>3.–5. FS</span><span>WS</span><span>Klausur 60 min</span><span>Englisch</span><span>Notenblock 66 %</span></div>
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
>     - 'code == "E311"'
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
> > [!eba-karte|handy-zu]+ Lehrveranstaltung
> > - **Inhalte:** Internationale Unternehmensbesteuerung, Steuerverzerrungen, optimale Besteuerung, Steuerwettbewerb
> > - **Lehrform:** lecture (2 SWS) tutorial (1 SWS) / oral participation, group discussion, independent study
> > - **Workload:** Kontaktzeit 45 h + Selbststudium 135 h = 180 h
> > - **Verantwortlich:** Prof. Dr. Georg Wamser
> > - **Voraussetzungen:** E210 Microeconomics II
> > - **Dauer:** 1 Semester
>
> > [!eba-regel|handy-zu]+ Prüfung
> > - **Form:** Klausur (60 Minuten) (6 ECTS) – 100 % der Modulnote


> [!eba-ziel|handy-zu]+ Anrechenbar in
> - **Economic Policy** · VWL-Schwerpunktbereich II
> - **International Economics** · VWL-Schwerpunktbereich IV
> - **Financial Accounting and Business Taxation** · BWL-Schwerpunktbereich II
> - **Elective Studies** · Schwerpunktbereich ohne Zuordnung
>
> Ein Modul zählt nur in **einem** Bereich. Du wählst ihn im Feld „Anrechnung in“ oben.


<p class="eba-fuss">Quelle: MHB B.Sc. Wiwi (Datei 2026-3-24_Modulhandbuch_B.Sc.Wiwi.pdf), S. 102; Webseite "Aktuelles zum Studium" (Stand 30.09.2026) · Stand der Recherche 30.09.2026 · <a class="internal-link" data-href="Kontakte & Links#Offizielle Dokumente" href="Kontakte & Links#Offizielle Dokumente">Alle Quellen</a></p>
