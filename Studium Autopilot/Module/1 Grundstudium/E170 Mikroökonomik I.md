---
typ: "modul"
code: "E170"
titel: "Mikroökonomik I"
kurz: "Mikro I"
titel_en: "Intermediate Microeconomics"
ects: 6
fachsemester: 2
fs_empfohlen: "2"
gruppe: "Grundstudium"
rolle_economics: "Pflicht"
rolle_ba: "Pflicht"
rolle_ohne: "Pflicht"
bereiche: []
pruefung: "Klausur 90 min"
benotet: true
notenblock: "34 %"
sprache: "Deutsch"
turnus: "SS"
verantwortlich: "Prof. Dr. Valeria Merlo"
op_modul: false
status: "offen"
ergebnis:
versuch:
klausur:
semester_geplant: ""
zusatz: false
uebersicht: "[[Noten & ECTS]]"
aliases:
  - "E170"
  - "Mikroökonomik I"
tags:
  - "modul"
cssclasses:
  - "eba"
  - "eba-s-modul"
---

<div class="eba-kopf">
<div class="eba-pfad"><a class="internal-link" data-href="Dashboard" href="Dashboard">Dashboard</a><a class="internal-link" data-href="Noten & ECTS" href="Noten & ECTS">Module</a><span>Grundstudium</span></div>
<h1><span class="eba-code">E170</span> Mikroökonomik I</h1>
<p class="eba-untertitel">Intermediate Microeconomics</p>
<div class="eba-meta"><span><b>6</b> ECTS</span><span>FS 2</span><span>SS</span><span>Klausur 90 min</span><span>Deutsch</span><span>Notenblock 34 %</span></div>
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
>     - 'code == "E170"'
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
> > - **Inhalte:** Haushalts- und Unternehmenstheorie, Nachfrage, Angebot, Marktformen (Polypol, Monopol, Oligopol)
> > - **Lehrform:** Vorlesung (3 SWS) Übung (2 SWS) / Mitarbeit, Selbststudium, Literaturstudium
> > - **Workload:** Kontaktzeit 75 h + Selbststudium 105 h = 180 h
> > - **Verantwortlich:** Prof. Dr. Valeria Merlo
> > - **Voraussetzungen:** E101 Einführung in die Volkswirtschaftslehre, S100 Mathematische Methoden der Wirtschaftswissenschaft
> > - **Dauer:** 1 Semester
>
> > [!eba-regel|handy-zu]+ Prüfung
> > - **Form:** Klausur (90 Minuten) (6 CP) – 100 % der Modulnote


<p class="eba-fuss">Quelle: MHB B.Sc. Wiwi (Datei 2026-3-24_Modulhandbuch_B.Sc.Wiwi.pdf), S. 98; PO 2023 BT EcoBA (AmtlBekUT 24/2023, S. 310-317), § 4 · Stand der Recherche 30.09.2026 · <a class="internal-link" data-href="Kontakte & Links#Offizielle Dokumente" href="Kontakte & Links#Offizielle Dokumente">Alle Quellen</a></p>
