---
typ: "modul"
code: "E210"
titel: "Microeconomics II"
titel_en: "Microeconomics II"
ects: 6
fachsemester: 3
fs_empfohlen: "3"
gruppe: "Profil & Vertiefung"
rolle_economics: "Pflicht"
rolle_ba: "Wahlpflicht: Profilbildungsbereich (oder Elective Studies)"
rolle_ohne: "Wahlpflicht: Profilbildungsbereich VWL (oder Elective Studies)"
bereiche: []
pruefung: "Klausur 90 min"
benotet: true
notenblock: "34 %"
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
anrechnung: ""
zusatz: false
uebersicht: "[[Noten & ECTS]]"
aliases:
  - "E210"
  - "Microeconomics II"
tags:
  - "modul"
cssclasses:
  - "eba"
  - "eba-s-modul"
---

<div class="eba-kopf">
<div class="eba-pfad"><a class="internal-link" data-href="Dashboard" href="Dashboard">Dashboard</a><a class="internal-link" data-href="Noten & ECTS" href="Noten & ECTS">Module</a><span>Profil & Vertiefung</span></div>
<h1><span class="eba-code">E210</span> Microeconomics II</h1>
<div class="eba-meta"><span><b>6</b> ECTS</span><span>3. FS</span><span>WS</span><span>Klausur 90 min</span><span>Englisch</span><span>Notenblock 34 %</span></div>
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
>     - 'code == "E210"'
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
> > - **Inhalte:** Public Economics: öffentliche Güter, Externalitäten, asymmetrische Information, Besteuerung
> > - **Lehrform:** lecture (3 SWS) tutorial (2 SWS) / oral participation, group discussion, self-study
> > - **Workload:** Kontaktzeit 75 h + Selbststudium 105 h = 180 h
> > - **Verantwortlich:** Prof. Dr. Georg Wamser
> > - **Voraussetzungen:** E170 Intermediate Microeconomics
> > - **Dauer:** 1 Semester
>
> > [!eba-regel|handy-zu]+ Prüfung
> > - **Form:** Klausur (90 Minuten) (6 ECTS) – 100 % der Modulnote


## Rolle je Variante

> [!eba-tabelle|handy-zu|pc-flach]+ Drei Varianten
> | Variante | Rolle dieses Moduls |
> | --- | --- |
> | Economics | Pflicht |
> | Business Administration | Wahlpflicht: Profilbildungsbereich (oder Elective Studies) |
> | ohne Spezialisierung | Wahlpflicht: Profilbildungsbereich VWL (oder Elective Studies) |
>
> Welche Variante gilt, stellst du in den [[Einstellungen & Hilfe#Variante|Einstellungen]] ein. Als Elective Studies zählt es, wenn oben bei „Zählt als“ Elective Studies steht; geprüft wird das im [[Studienverlauf#Schwerpunkte|Studienverlauf]].


<p class="eba-fuss">Quelle: MHB B.Sc. Wiwi (Datei 2026-3-24_Modulhandbuch_B.Sc.Wiwi.pdf), S. 99; PO 2023 BT EcoBA (AmtlBekUT 24/2023, S. 310-317), § 4 · Stand der Recherche 30.09.2026 · <a class="internal-link" data-href="Kontakte & Links#Offizielle Dokumente" href="Kontakte & Links#Offizielle Dokumente">Alle Quellen</a></p>
