---
typ: "modul"
code: "S111"
titel: "Wahrscheinlichkeit und Risiko"
kurz: "Wahrscheinlichkeit"
titel_en: "Risk and Probability"
ects: 6
fachsemester: 2
fs_empfohlen: "2"
gruppe: "Grundstudium"
rolle_economics: "Pflicht"
rolle_ba: "Pflicht"
rolle_ohne: "Pflicht"
bereiche: []
pruefung: "Klausur 60 min"
benotet: true
notenblock: "34 %"
sprache: "Deutsch"
turnus: "SS"
verantwortlich: "Prof. Dr. Martin Biewen, Prof. Dr. Joachim Grammig"
op_modul: true
status: "offen"
ergebnis:
versuch:
klausur:
semester_geplant: ""
zusatz: false
uebersicht: "[[Noten & ECTS]]"
aliases:
  - "S111"
  - "Wahrscheinlichkeit und Risiko"
tags:
  - "modul"
cssclasses:
  - "eba"
  - "eba-s-modul"
---

<div class="eba-kopf">
<div class="eba-pfad"><a class="internal-link" data-href="Dashboard" href="Dashboard">Dashboard</a><a class="internal-link" data-href="Noten & ECTS" href="Noten & ECTS">Module</a><span>Grundstudium</span></div>
<h1><span class="eba-code">S111</span> Wahrscheinlichkeit und Risiko</h1>
<p class="eba-untertitel">Risk and Probability</p>
<div class="eba-meta"><span><b>6</b> ECTS</span><span>2. FS</span><span>SS</span><span>Klausur 60 min</span><span>Deutsch</span><span class="eba-akzent">Orientierungsprüfung</span><span>Notenblock 34 %</span></div>
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
>     - 'code == "S111"'
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
> > - **Inhalte:** Kombinatorik, Wahrscheinlichkeitstheorie, Zufallsvariablen, Verteilungen, Momente, Grenzwertsätze
> > - **Lehrform:** Vorlesung (2 SWS) Übung (2 SWS) / Mitarbeit, Gruppendiskussion, Selbststudium
> > - **Workload:** Kontaktzeit 60 h + Selbststudium 120 h = 180 h
> > - **Verantwortlich:** Prof. Dr. Martin Biewen, Prof. Dr. Joachim Grammig
> > - **Voraussetzungen:** keine laut Modulhandbuch
> > - **Dauer:** 1 Semester
>
> > [!eba-regel|handy-zu]+ Prüfung
> > - **Form:** Klausur (60 Minuten) (6 ECTS) – 100 % der Modulnote
> > - **Orientierungsprüfung:** 4 der 6 OP-Module bis Ende des 4. Fachsemesters bestehen


<p class="eba-fuss">Quelle: MHB B.Sc. Wiwi (Datei 2026-3-24_Modulhandbuch_B.Sc.Wiwi.pdf), S. 153; PO 2023 BT EcoBA (AmtlBekUT 24/2023, S. 310-317), § 4 · Stand der Recherche 30.09.2026 · <a class="internal-link" data-href="Kontakte & Links#Offizielle Dokumente" href="Kontakte & Links#Offizielle Dokumente">Alle Quellen</a></p>
