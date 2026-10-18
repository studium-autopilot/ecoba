---
typ: "modul"
code: "BA302"
titel: "Bachelorarbeit Economics and Business Administration"
titel_en: "Bachelor Thesis Economics and Business Administration"
ects: 12
fachsemester: 6
fs_empfohlen: "6"
gruppe: "Abschluss"
rolle_economics: "Abschlussmodul"
rolle_ba: "Abschlussmodul"
rolle_ohne: "Abschlussmodul"
bereiche: []
pruefung: "Schriftliche Arbeit + Präsentation"
benotet: true
notenblock: "66 %"
sprache: "Deutsch/Englisch"
turnus: "WS, SS"
verantwortlich: "je nach gewähltem Lehrstuhl"
op_modul: false
status: "offen"
ergebnis:
versuch:
klausur:
semester_geplant: ""
zusatz: false
uebersicht: "[[Noten & ECTS]]"
aliases:
  - "BA302"
  - "Bachelorarbeit Economics and Business Administration"
tags:
  - "modul"
cssclasses:
  - "eba"
  - "eba-s-modul"
---

<div class="eba-kopf">
<div class="eba-pfad"><a class="internal-link" data-href="Dashboard" href="Dashboard">Dashboard</a><a class="internal-link" data-href="Noten & ECTS" href="Noten & ECTS">Module</a><span>Abschluss</span></div>
<h1><span class="eba-code">BA302</span> Bachelorarbeit Economics and Business Administration</h1>
<p class="eba-untertitel">Bachelor Thesis Economics and Business Administration</p>
<div class="eba-meta"><span><b>12</b> ECTS</span><span>6. FS</span><span>WS, SS</span><span>Schriftliche Arbeit + Präsentation</span><span>Deutsch/Englisch</span><span>Notenblock 66 %</span></div>
</div>

```eba-modul
```


## Unterlagen

```eba-unterlagen
```

## Zum Modul

> [!eba-tabelle|schlicht|handy-zu]+ Vorlesungen, Übungsblätter, Stundenplan, Termine
> ```base
> filters:
>   and:
>     - 'code == "BA302"'
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
>     name: Zum Modul
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
> > - **Inhalte:** Bachelorarbeit im Bachelorseminar eines Lehrstuhls; schriftliche Arbeit und Präsentation
> > - **Lehrform:** Seminar (2 SWS) / Mitarbeit, Gruppendiskussion, Selbststudium, Literaturstudium
> > - **Workload:** Kontaktzeit 30 h + Selbststudium 330 h = 360 h
> > - **Verantwortlich:** je nach gewähltem Lehrstuhl
> > - **Voraussetzungen:** Zulassung zur Bachelorarbeit, teilweise wird eine Einführung in das wissenschaftliche Arbeiten vorausgesetzt; Details sind dem Almasystem zu entnehmen.
> > - **Dauer:** 1 Semester
>
> > [!eba-regel|handy-zu]+ Prüfung
> > - **Form:** Im allg. schriftliche Arbeit und Präsentation (Gewichtung je nach gewähltem Lehrstuhl verschieden) (12 ECTS) – 100 % der Modulnote
> > - **Versuche:** Bachelorarbeit einmal wiederholbar, Thema einmal in den ersten 4 Wochen zurückgebbar


> [!eba-info|handy-zu]+ Hinweise
> - Zulassung: ECTS aller Module bis einschließlich 3. Fachsemester laut Modultabelle (§ 10 BT); Bearbeitungszeit 9 Wochen (§ 28 Abs. 3 BRPO); 1 Wiederholung (§ 31 BRPO).


<p class="eba-fuss">Quelle: MHB B.Sc. Wiwi (Datei 2026-3-24_Modulhandbuch_B.Sc.Wiwi.pdf), S. 92; PO 2023 BT EcoBA (AmtlBekUT 24/2023, S. 310-317), § 4 · Stand der Recherche 30.09.2026 · <a class="internal-link" data-href="Kontakte & Links#Offizielle Dokumente" href="Kontakte & Links#Offizielle Dokumente">Alle Quellen</a></p>
