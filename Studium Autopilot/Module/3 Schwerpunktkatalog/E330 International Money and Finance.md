---
typ: "modul"
code: "E330"
titel: "International Money and Finance"
titel_en: "International Money and Finance"
ects: 9
fachsemester: 5
fs_empfohlen: "5.–6."
gruppe: "Schwerpunkt"
rolle_economics: "Schwerpunktbereich (siehe bereich) oder Elective Studies"
rolle_ba: "Schwerpunktbereich (siehe bereich) oder Elective Studies"
rolle_ohne: "Schwerpunktbereich (siehe bereich) oder Elective Studies"
bereiche:
  - "International Economics"
  - "International Business"
  - "Elective Studies"
pruefung: "Klausur 60 min"
benotet: true
notenblock: "66 %"
sprache: "Englisch"
turnus: "WS"
verantwortlich: "Prof. Dr. Gernot Müller"
op_modul: false
status: "offen"
ergebnis:
versuch:
klausur:
semester_geplant: ""
gewaehlt: false
anrechnung: "International Economics"
zusatz: false
uebersicht: "[[Noten & ECTS]]"
aliases:
  - "E330"
  - "International Money and Finance"
tags:
  - "modul"
cssclasses:
  - "eba"
  - "eba-s-modul"
---

<div class="eba-kopf">
<div class="eba-pfad"><a class="internal-link" data-href="Dashboard" href="Dashboard">Dashboard</a><a class="internal-link" data-href="Noten & ECTS" href="Noten & ECTS">Module</a><span>Schwerpunkt</span></div>
<h1><span class="eba-code">E330</span> International Money and Finance</h1>
<div class="eba-meta"><span><b>9</b> ECTS</span><span>5.–6. FS</span><span>WS</span><span>Klausur 60 min</span><span>Englisch</span><span>Notenblock 66 %</span></div>
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
>     - 'code == "E330"'
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
> > - **Inhalte:** Internationale Finanzmärkte, Leistungsbilanz, Wechselkurse, Schuldenkrisen, Geld-/Wechselkurspolitik
> > - **Lehrform:** lecture (2 SWS) tutorial (2 SWS) / oral participation, group discussion, self-study, flipped classroom
> > - **Workload:** Kontaktzeit 60 h + Selbststudium 210 h = 270 h
> > - **Verantwortlich:** Prof. Dr. Gernot Müller
> > - **Voraussetzungen:** E130 Macroeconomics I
> > - **Dauer:** 1 Semester
>
> > [!eba-regel|handy-zu]+ Prüfung
> > - **Form:** Klausur (60 Minuten) (9 ECTS) – 100 % der Modulnote


> [!eba-ziel|handy-zu]+ Anrechenbar in
> - **International Economics** · VWL-Schwerpunktbereich IV
> - **International Business** · BWL-Schwerpunktbereich III
> - **Elective Studies** · Schwerpunktbereich ohne Zuordnung
>
> Ein Modul zählt nur in **einem** Bereich. Du wählst ihn im Feld „Anrechnung in“ oben.


<p class="eba-fuss">Quelle: MHB B.Sc. Wiwi (Datei 2026-3-24_Modulhandbuch_B.Sc.Wiwi.pdf), S. 117; Webseite "Aktuelles zum Studium" (Stand 30.09.2026) · Stand der Recherche 30.09.2026 · <a class="internal-link" data-href="Kontakte & Links#Offizielle Dokumente" href="Kontakte & Links#Offizielle Dokumente">Alle Quellen</a></p>
