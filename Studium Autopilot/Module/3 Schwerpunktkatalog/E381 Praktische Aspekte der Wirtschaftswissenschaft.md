---
typ: "modul"
code: "E381"
titel: "Praktische Aspekte der Wirtschaftswissenschaft"
titel_en: "Practical aspects of Economics and Business Administration"
ects: 6
fachsemester: 4
fs_empfohlen: "ab 4"
gruppe: "Schwerpunkt"
rolle_economics: "Elective Studies"
rolle_ba: "Elective Studies"
rolle_ohne: "Elective Studies"
bereiche:
  - "Elective Studies"
pruefung: "unbenotet"
benotet: false
notenblock: "–"
sprache: "Deutsch/Englisch"
turnus: "WS, SS"
verantwortlich: "Prof. Dr. Taiga Brahm"
op_modul: false
status: "offen"
ergebnis:
versuch:
klausur:
semester_geplant: ""
gewaehlt: false
anrechnung: "Elective Studies"
zusatz: false
uebersicht: "[[Noten & ECTS]]"
aliases:
  - "E381"
  - "Praktische Aspekte der Wirtschaftswissenschaft"
tags:
  - "modul"
cssclasses:
  - "eba"
  - "eba-s-modul"
---

<div class="eba-kopf">
<div class="eba-pfad"><a class="internal-link" data-href="Dashboard" href="Dashboard">Dashboard</a><a class="internal-link" data-href="Noten & ECTS" href="Noten & ECTS">Module</a><span>Schwerpunkt</span></div>
<h1><span class="eba-code">E381</span> Praktische Aspekte der Wirtschaftswissenschaft</h1>
<p class="eba-untertitel">Practical aspects of Economics and Business Administration</p>
<div class="eba-meta"><span><b>6</b> ECTS</span><span>FS ab 4</span><span>WS, SS</span><span>unbenotet</span><span>Deutsch/Englisch</span><span>unbenotet</span></div>
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
>     - 'code == "E381"'
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
> > - **Inhalte:** Praktikum in Unternehmen/Organisation (mind. 6 Wochen) mit Praktikumsbericht
> > - **Lehrform:** Praktikum / Mitarbeit, Selbststudium
> > - **Workload:** Kontaktzeit 60 h + Selbststudium 120 h = 180 h
> > - **Verantwortlich:** Prof. Dr. Taiga Brahm
> > - **Voraussetzungen:** keine laut Modulhandbuch
> > - **Dauer:** 1 Semester
>
> > [!eba-regel|handy-zu]+ Prüfung
> > - **Form:** unbenotet
> > - **Studienleistung:** Praktikumsbericht
> > - **Gesamtnote:** zählt nicht, weil unbenotet


> [!eba-ziel|handy-zu]+ Anrechenbar in
> - **Elective Studies** · Schwerpunktbereich ohne Zuordnung
>
> Ein Modul zählt nur in **einem** Bereich. Du wählst ihn im Feld „Anrechnung in“ oben.


> [!eba-info|handy-zu]+ Hinweise
> - PO § 4 Abs. 6: "soll"-Praktikum (6 ECTS) im Bereich Elective Studies, durch andere Elective-Module ersetzbar; mind. 6 Wochen (Aktuelles zum Studium).


<p class="eba-fuss">Quelle: MHB B.Sc. Wiwi (Datei 2026-3-24_Modulhandbuch_B.Sc.Wiwi.pdf), S. 136; PO 2023 BT EcoBA (AmtlBekUT 24/2023, S. 310-317), § 4 · Stand der Recherche 30.09.2026 · <a class="internal-link" data-href="Kontakte & Links#Offizielle Dokumente" href="Kontakte & Links#Offizielle Dokumente">Alle Quellen</a></p>
