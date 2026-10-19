---
typ: "modul"
code: "B340"
titel: "Organisation"
titel_en: "Organization"
ects: 9
fachsemester: 4
fs_empfohlen: "4.–6."
gruppe: "Schwerpunkt"
rolle_economics: "Schwerpunktbereich (siehe bereich) oder Elective Studies"
rolle_ba: "Schwerpunktbereich (siehe bereich) oder Elective Studies"
rolle_ohne: "Schwerpunktbereich (siehe bereich) oder Elective Studies"
bereiche:
  - "Firms and Markets"
  - "Managerial Accounting and Organisation"
  - "Elective Studies"
pruefung: "Klausur 60 min"
benotet: true
notenblock: "66 %"
sprache: "Deutsch"
turnus: "SS"
verantwortlich: "Prof. Dr. Kerstin Pull"
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
  - "B340"
  - "Organisation"
tags:
  - "modul"
cssclasses:
  - "eba"
  - "eba-s-modul"
---

<div class="eba-kopf">
<div class="eba-pfad"><a class="internal-link" data-href="Dashboard" href="Dashboard">Dashboard</a><a class="internal-link" data-href="Noten & ECTS" href="Noten & ECTS">Module</a><span>Schwerpunkt</span></div>
<h1><span class="eba-code">B340</span> Organisation</h1>
<p class="eba-untertitel">Organization</p>
<div class="eba-meta"><span><b>9</b> ECTS</span><span>4.–6. FS</span><span>SS</span><span>Klausur 60 min</span><span>Deutsch</span><span>Notenblock 66 %</span></div>
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
>     - 'code == "B340"'
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
> > - **Inhalte:** Entscheidungs-, Verhaltens-, Informationsökonomik, Organisationsprobleme, Corporate Governance, Mitbestimmung
> > - **Lehrform:** Vorlesung (3 SWS) Übung (2 SWS) / Mitarbeit, Selbststudium, Literaturstudium
> > - **Workload:** Kontaktzeit 75 h + Selbststudium 195 h = 270 h
> > - **Verantwortlich:** Prof. Dr. Kerstin Pull
> > - **Voraussetzungen:** keine laut Modulhandbuch
> > - **Dauer:** 1 Semester
>
> > [!eba-regel|handy-zu]+ Prüfung
> > - **Form:** Klausur (60 Minuten) (9 ECTS) – 100 % der Modulnote


> [!eba-ziel|handy-zu]+ Anrechenbar in
> - **Firms and Markets** · VWL-Schwerpunktbereich III
> - **Managerial Accounting and Organisation** · BWL-Schwerpunktbereich IV
> - **Elective Studies** · Schwerpunktbereich ohne Zuordnung
>
> Ein Modul zählt nur in **einem** Bereich. Du wählst ihn im Feld „Anrechnung in“ oben.


> [!eba-info|handy-zu]+ Hinweise
> - Ab SS 2026 wahlweise mit 6 oder 9 ECTS, immer im SS (Aktuelles zum Studium).


<p class="eba-fuss">Quelle: MHB B.Sc. Wiwi (Datei 2026-3-24_Modulhandbuch_B.Sc.Wiwi.pdf), S. 71; Webseite "Aktuelles zum Studium" (Stand 30.09.2026) · Stand der Recherche 30.09.2026 · <a class="internal-link" data-href="Kontakte & Links#Offizielle Dokumente" href="Kontakte & Links#Offizielle Dokumente">Alle Quellen</a></p>
