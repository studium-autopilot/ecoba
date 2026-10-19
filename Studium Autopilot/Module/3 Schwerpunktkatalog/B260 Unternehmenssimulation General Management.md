---
typ: "modul"
code: "B260"
titel: "Unternehmenssimulation General Management"
titel_en: "Simulation General Management"
ects: 6
fachsemester: 3
fs_empfohlen: "3.–6."
gruppe: "Schwerpunkt"
rolle_economics: "Schwerpunktbereich (siehe bereich) oder Elective Studies"
rolle_ba: "Schwerpunktbereich (siehe bereich) oder Elective Studies"
rolle_ohne: "Schwerpunktbereich (siehe bereich) oder Elective Studies"
bereiche:
  - "Managerial Accounting and Organisation"
  - "Elective Studies"
pruefung: "Portfolio"
benotet: true
notenblock: "66 %"
sprache: "Deutsch"
turnus: "WS, SS"
verantwortlich: "Dipl.-Kfm. Sven Bauer"
op_modul: false
status: "offen"
ergebnis:
versuch:
klausur:
semester_geplant: ""
gewaehlt: false
anrechnung: "Managerial Accounting and Organisation"
zusatz: false
uebersicht: "[[Noten & ECTS]]"
aliases:
  - "B260"
  - "Unternehmenssimulation General Management"
tags:
  - "modul"
cssclasses:
  - "eba"
  - "eba-s-modul"
---

<div class="eba-kopf">
<div class="eba-pfad"><a class="internal-link" data-href="Dashboard" href="Dashboard">Dashboard</a><a class="internal-link" data-href="Noten & ECTS" href="Noten & ECTS">Module</a><span>Schwerpunkt</span></div>
<h1><span class="eba-code">B260</span> Unternehmenssimulation General Management</h1>
<p class="eba-untertitel">Simulation General Management</p>
<div class="eba-meta"><span><b>6</b> ECTS</span><span>3.–6. FS</span><span>WS, SS</span><span>Portfolio</span><span>Deutsch</span><span>Notenblock 66 %</span></div>
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
>     - 'code == "B260"'
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
> > - **Inhalte:** Planspiel: virtuelles Industrieunternehmen führen (Einkauf, Produktion, Personal, Finanzierung, Marketing)
> > - **Lehrform:** Vorlesung (2 SWS) Seminar (2 SWS) / Mitarbeit, Gruppendiskussion, Selbststudium
> > - **Workload:** Kontaktzeit 90 h + Selbststudium 90 h = 180 h
> > - **Verantwortlich:** Dipl.-Kfm. Sven Bauer
> > - **Voraussetzungen:** Einarbeitung ins Planspiel-Handbuch
> > - **Dauer:** 1 Semester
>
> > [!eba-regel|handy-zu]+ Prüfung
> > - **Form:** Portfolio (Strategiepapier, Abschlusspräsentation, Geschäftsbericht) (6 ECTS) – 100 % der Modulnote
> > - **Studienleistung:** Entscheidungsfindung, Strategiepapier und Geschäftsbericht (schriftlich), Präsentation


> [!eba-ziel|handy-zu]+ Anrechenbar in
> - **Managerial Accounting and Organisation** · BWL-Schwerpunktbereich IV
> - **Elective Studies** · Schwerpunktbereich ohne Zuordnung
>
> Ein Modul zählt nur in **einem** Bereich. Du wählst ihn im Feld „Anrechnung in“ oben.


<p class="eba-fuss">Quelle: MHB B.Sc. Wiwi (Datei 2026-3-24_Modulhandbuch_B.Sc.Wiwi.pdf), S. 51 · Stand der Recherche 30.09.2026 · <a class="internal-link" data-href="Kontakte & Links#Offizielle Dokumente" href="Kontakte & Links#Offizielle Dokumente">Alle Quellen</a></p>
