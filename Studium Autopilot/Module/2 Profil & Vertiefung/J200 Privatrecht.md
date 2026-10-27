---
typ: "modul"
code: "J200"
titel: "Privatrecht"
titel_en: "Civil Law"
ects: 6
fachsemester: 3
fs_empfohlen: "3"
gruppe: "Profil & Vertiefung"
rolle_economics: "Elective Studies"
rolle_ba: "Pflicht"
rolle_ohne: "Wahlpflicht: Profilbildungsbereich BWL (oder Elective Studies)"
bereiche: []
pruefung: "Klausur 120 min"
benotet: true
notenblock: "34 %"
sprache: "Deutsch"
turnus: "WS"
verantwortlich: "Dr. iur. Sebastian Mielke"
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
  - "J200"
  - "Privatrecht"
tags:
  - "modul"
cssclasses:
  - "eba"
  - "eba-s-modul"
---

<div class="eba-kopf">
<h1><span class="eba-code">J200</span> Privatrecht</h1>
<div class="eba-meta"><span><b>6</b> ECTS</span><span>3. FS</span><span>WS</span><span>Klausur 120 min</span><span>Deutsch</span><span>Notenblock 34 % (in Economics 66 %)</span></div>
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
>     - 'code == "J200"'
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
> > - **Inhalte:** BGB Allgemeiner Teil, Schuldrecht, Sachenrecht, Handels- und Gesellschaftsrecht
> > - **Lehrform:** Vorlesung (2 SWS) und Übung (1 SWS) / Mitarbeit, Selbststudium, Literaturstudium
> > - **Workload:** Kontaktzeit 45 h + Selbststudium 135 h = 180 h
> > - **Verantwortlich:** Dr. iur. Sebastian Mielke
> > - **Voraussetzungen:** keine laut Modulhandbuch
> > - **Dauer:** 1 Semester
>
> > [!eba-regel|handy-zu]+ Prüfung
> > - **Form:** Klausur (120 Minuten) (6 ECTS) – 100 % der Modulnote
> > - **Gesamtnote:** zählt im 34 %-Block (Pflicht- und Profilbildungsmodule), als Elective Studies im 66 %-Block (in der Variante Economics immer), gewichtet nach ECTS


## Rolle je Variante

> [!eba-tabelle|handy-zu|pc-flach]+ Drei Varianten
> | Variante | Rolle dieses Moduls |
> | --- | --- |
> | Economics | Elective Studies |
> | Business Administration | Pflicht |
> | ohne Spezialisierung | Wahlpflicht: Profilbildungsbereich BWL (oder Elective Studies) |
>
> Welche Variante gilt, stellst du in den [[Einstellungen & Hilfe#Variante|Einstellungen]] ein. Als Elective Studies zählt es, wenn oben bei „Zählt als“ Elective Studies steht; geprüft wird das im [[Studienverlauf#Schwerpunkte|Studienverlauf]].


<p class="eba-fuss">Quelle: MHB B.Sc. Wiwi (Datei 2026-3-24_Modulhandbuch_B.Sc.Wiwi.pdf), S. 137; PO 2023 BT EcoBA (AmtlBekUT 24/2023, S. 310-317), § 4 · Stand der Recherche 30.09.2026 · <a class="internal-link" data-href="Kontakte & Links#Offizielle Dokumente" href="Kontakte & Links#Offizielle Dokumente">Alle Quellen</a></p>
