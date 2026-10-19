---
typ: "modul"
code: "E361"
titel: "Wirtschaftsgeschichte der Welt: neue Forschungsansätze"
titel_en: "Economic History of the World: New Research"
ects: 6
fachsemester: 3
fs_empfohlen: "3.–5."
gruppe: "Schwerpunkt"
rolle_economics: "Schwerpunktbereich (siehe bereich) oder Elective Studies"
rolle_ba: "Schwerpunktbereich (siehe bereich) oder Elective Studies"
rolle_ohne: "Schwerpunktbereich (siehe bereich) oder Elective Studies"
bereiche:
  - "Economic History and Development Economics"
  - "International Economics"
  - "Elective Studies"
pruefung: "Klausur 60 min"
benotet: true
notenblock: "66 %"
sprache: "Deutsch"
turnus: "WS"
verantwortlich: "Prof. Dr. Jörg Baten"
op_modul: false
status: "offen"
ergebnis:
versuch:
klausur:
semester_geplant: ""
gewaehlt: false
anrechnung: "Economic History and Development Economics"
zusatz: false
uebersicht: "[[Noten & ECTS]]"
aliases:
  - "E361"
  - "Wirtschaftsgeschichte der Welt: neue Forschungsansätze"
tags:
  - "modul"
cssclasses:
  - "eba"
  - "eba-s-modul"
---

<div class="eba-kopf">
<div class="eba-pfad"><a class="internal-link" data-href="Dashboard" href="Dashboard">Dashboard</a><a class="internal-link" data-href="Noten & ECTS" href="Noten & ECTS">Module</a><span>Schwerpunkt</span></div>
<h1><span class="eba-code">E361</span> Wirtschaftsgeschichte der Welt: neue Forschungsansätze</h1>
<p class="eba-untertitel">Economic History of the World: New Research</p>
<div class="eba-meta"><span><b>6</b> ECTS</span><span>3.–5. FS</span><span>WS</span><span>Klausur 60 min</span><span>Deutsch</span><span>Notenblock 66 %</span></div>
</div>

```eba-modul
```


## Unterlagen

```eba-unterlagen
```

## Zum Modul

> [!eba-tabelle|schlicht|handy-zu]+ Übungsblätter, Stundenplan, Termine
> ```base
> filters:
>   and:
>     - 'code == "E361"'
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
> > - **Inhalte:** Langfristige Weltwirtschaftsgeschichte, Unterschiede zwischen Kontinenten, Messung von Entwicklung
> > - **Lehrform:** Vorlesung und Übung (2 SWS) / E-Learning, Gruppendiskussion, Selbststudium, Literaturstudium
> > - **Workload:** Kontaktzeit 30 h + Selbststudium 150 h = 180 h
> > - **Verantwortlich:** Prof. Dr. Jörg Baten
> > - **Voraussetzungen:** keine laut Modulhandbuch
> > - **Dauer:** 1 Semester
>
> > [!eba-regel|handy-zu]+ Prüfung
> > - **Form:** Klausur (60 Minuten) (6 ECTS) – 100 % der Modulnote


> [!eba-ziel|handy-zu]+ Anrechenbar in
> - **Economic History and Development Economics** · VWL-Schwerpunktbereich I
> - **International Economics** · VWL-Schwerpunktbereich IV
> - **Elective Studies** · Schwerpunktbereich ohne Zuordnung
>
> Ein Modul zählt nur in **einem** Bereich. Du wählst ihn im Feld „Anrechnung in“ oben.


<p class="eba-fuss">Quelle: MHB B.Sc. Wiwi (Datei 2026-3-24_Modulhandbuch_B.Sc.Wiwi.pdf), S. 122 · Stand der Recherche 30.09.2026 · <a class="internal-link" data-href="Kontakte & Links#Offizielle Dokumente" href="Kontakte & Links#Offizielle Dokumente">Alle Quellen</a></p>
