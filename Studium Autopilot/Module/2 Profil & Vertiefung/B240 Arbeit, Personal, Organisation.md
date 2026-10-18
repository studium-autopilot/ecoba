---
typ: "modul"
code: "B240"
titel: "Arbeit, Personal, Organisation"
titel_en: "HRM and Organization"
ects: 6
fachsemester: 4
fs_empfohlen: "4"
gruppe: "Profil & Vertiefung"
rolle_economics: "Pflicht"
rolle_ba: "Pflicht"
rolle_ohne: "Wahlpflicht: Profilbildungsbereich VWL oder BWL (oder Elective Studies)"
bereiche: []
pruefung: "Klausur 60 min"
benotet: true
notenblock: "34 %"
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
anrechnung: ""
zusatz: false
uebersicht: "[[Noten & ECTS]]"
aliases:
  - "B240"
  - "Arbeit, Personal, Organisation"
tags:
  - "modul"
cssclasses:
  - "eba"
  - "eba-s-modul"
---

<div class="eba-kopf">
<div class="eba-pfad"><a class="internal-link" data-href="Dashboard" href="Dashboard">Dashboard</a><a class="internal-link" data-href="Noten & ECTS" href="Noten & ECTS">Module</a><span>Profil & Vertiefung</span></div>
<h1><span class="eba-code">B240</span> Arbeit, Personal, Organisation</h1>
<p class="eba-untertitel">HRM and Organization</p>
<div class="eba-meta"><span><b>6</b> ECTS</span><span>FS 4</span><span>SS</span><span>Klausur 60 min</span><span>Deutsch</span><span>Notenblock 34 %</span></div>
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
>     - 'code == "B240"'
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
> > - **Inhalte:** Arbeitsökonomik, Personalpolitik, Organisationsökonomik, Mindestlohn, Tarifverträge
> > - **Lehrform:** Vorlesung (2 SWS) Übung (2 SWS) / Mitarbeit, Selbststudium, Literaturstudium
> > - **Workload:** Kontaktzeit 60 h + Selbststudium 120 h = 180 h
> > - **Verantwortlich:** Prof. Dr. Kerstin Pull
> > - **Voraussetzungen:** B110 oder L100 und E170 oder L203
> > - **Dauer:** 1 Semester
>
> > [!eba-regel|handy-zu]+ Prüfung
> > - **Form:** Klausur (60 Minuten) (6 CP) – 100 % der Modulnote


## Rolle je Variante

> [!eba-tabelle|handy-zu|pc-flach]+ Drei Varianten
> | Variante | Rolle dieses Moduls |
> | --- | --- |
> | Economics | Pflicht |
> | Business Administration | Pflicht |
> | ohne Spezialisierung | Wahlpflicht: Profilbildungsbereich VWL oder BWL (oder Elective Studies) |
>
> Welche Variante gilt, stellst du in den [[Einstellungen & Hilfe#Variante|Einstellungen]] ein. Als Elective Studies zählt es, wenn oben bei „Zählt als“ Elective Studies steht; geprüft wird das im [[Studienverlauf#Schwerpunkte|Studienverlauf]].

> [!eba-info|handy-zu]+ Hinweise
> - Titel im Studienplan/PO: "Arbeit, Personal, Organisation"; Modulbeschreibung: DE "Arbeit, Personal und Organisation" / EN "HRM and Organization".


<p class="eba-fuss">Quelle: MHB B.Sc. Wiwi (Datei 2026-3-24_Modulhandbuch_B.Sc.Wiwi.pdf), S. 47; PO 2023 BT EcoBA (AmtlBekUT 24/2023, S. 310-317), § 4 · Stand der Recherche 30.09.2026 · <a class="internal-link" data-href="Kontakte & Links#Offizielle Dokumente" href="Kontakte & Links#Offizielle Dokumente">Alle Quellen</a></p>
