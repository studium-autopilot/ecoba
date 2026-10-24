---
typ: "modul"
code: "E371B"
titel: "Theory and Policy of International Trade B"
titel_en: "Theory and Policy of International Trade B"
ects: 9
fachsemester: 4
fs_empfohlen: "4.–6."
gruppe: "Schwerpunkt"
rolle_economics: "Schwerpunktbereich (siehe bereich) oder Elective Studies"
rolle_ba: "Schwerpunktbereich (siehe bereich) oder Elective Studies"
rolle_ohne: "Schwerpunktbereich (siehe bereich) oder Elective Studies"
bereiche:
  - "Firms and Markets"
  - "International Economics"
  - "Elective Studies"
pruefung: "Klausur 90 min"
benotet: true
notenblock: "66 %"
sprache: "Englisch"
turnus: "SS"
verantwortlich: "Prof. Dr. Valeria Merlo"
op_modul: false
status: "offen"
ergebnis:
versuch:
klausur:
semester_geplant: ""
gewaehlt: false
anrechnung: "Firms and Markets"
zusatz: false
uebersicht: "[[Noten & ECTS]]"
aliases:
  - "E371B"
  - "Theory and Policy of International Trade B"
tags:
  - "modul"
cssclasses:
  - "eba"
  - "eba-s-modul"
---

<div class="eba-kopf">
<div class="eba-pfad"><a class="internal-link" data-href="Dashboard" href="Dashboard">Dashboard</a><a class="internal-link" data-href="Noten & ECTS" href="Noten & ECTS">Module</a><span>Schwerpunkt</span></div>
<h1><span class="eba-code">E371B</span> Theory and Policy of International Trade B</h1>
<div class="eba-meta"><span><b>9</b> ECTS</span><span>4.–6. FS</span><span>SS</span><span>Klausur 90 min</span><span>Englisch</span><span>Notenblock 66 %</span></div>
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
>     - 'code == "E371B"'
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
> > - **Inhalte:** Handelstheorie wie E371A plus empirische Handelsdatenanalyse mit R, Gravitationsmodell
> > - **Lehrform:** lecture (4 SWS) tutorial (1 SWS) / oral participation, discussion, independent study
> > - **Workload:** Kontaktzeit 75 h + Selbststudium 195 h = 270 h
> > - **Verantwortlich:** Prof. Dr. Valeria Merlo
> > - **Voraussetzungen:** E130 Macroeconomics I, E170 Intermediate Microeconomics
> > - **Dauer:** 1 Semester
>
> > [!eba-regel|handy-zu]+ Prüfung
> > - **Form:** Klausur (90 Minuten) (9 ECTS) – 100 % der Modulnote
> > - **Studienleistung:** Assignments


> [!eba-ziel|handy-zu]+ Anrechenbar in
> - **Firms and Markets** · VWL-Schwerpunktbereich III
> - **International Economics** · VWL-Schwerpunktbereich IV
> - **Elective Studies** · Schwerpunktbereich ohne Zuordnung
>
> Ein Modul zählt nur in **einem** Bereich. Du wählst ihn im Feld „Anrechnung in“ oben.


> [!eba-info|handy-zu]+ Hinweise
> - Hinweis auf Aktuelles-Seite: im SS 2025 nur Variante A angeboten (älterer Eintrag).


<p class="eba-fuss">Quelle: MHB B.Sc. Wiwi (Datei 2026-3-24_Modulhandbuch_B.Sc.Wiwi.pdf), S. 131; Webseite "Aktuelles zum Studium" (Stand 30.09.2026) · Stand der Recherche 30.09.2026 · <a class="internal-link" data-href="Kontakte & Links#Offizielle Dokumente" href="Kontakte & Links#Offizielle Dokumente">Alle Quellen</a></p>
