---
typ: modul
code: B180
titel: Jahresabschluss
kurz: "Jahresabschluss"
titel_en: Financial Accounting
ects: 6
fachsemester: 1
fs_empfohlen: "1"
gruppe: Grundstudium
rolle_economics: Pflicht
rolle_ba: Pflicht
rolle_ohne: Pflicht
bereiche: []
pruefung: Klausur 60-90 min
benotet: true
notenblock: 34 %
sprache: Deutsch
turnus: WS
verantwortlich: Prof. Dr. Jörg-Markus Hitz
op_modul: false
status: "offen"
ergebnis:
versuch:
klausur:
semester_geplant: ""
zusatz: false
uebersicht: "[[Noten & ECTS]]"
aliases:
  - B180
  - Jahresabschluss
tags:
  - modul
cssclasses:
  - eba
  - eba-s-modul
---

<div class="eba-kopf">
<div class="eba-pfad"><a class="internal-link" data-href="Dashboard" href="Dashboard">Dashboard</a><a class="internal-link" data-href="Noten & ECTS" href="Noten & ECTS">Module</a><span>Grundstudium</span></div>
<h1><span class="eba-code">B180</span> Jahresabschluss</h1>
<p class="eba-untertitel">Financial Accounting</p>
<div class="eba-meta"><span><b>6</b> ECTS</span><span>1. FS</span><span>WS</span><span>Klausur 60-90 min</span><span>Deutsch</span><span>Notenblock 34 %</span></div>
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
>     - 'code == "B180"'
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
> > - **Inhalte:** Finanzbuchhaltung, Jahresabschluss nach HGB und IFRS, Bilanzierung, Abschlussanalyse
> > - **Lehrform:** Vorlesung (2 SWS) Übung (2 SWS) / Mitarbeit, Selbststudium (insb. auch Lösen von Übungsaufgaben), Literaturstudium
> > - **Workload:** Kontaktzeit 60 h + Selbststudium 120 h = 180 h
> > - **Verantwortlich:** Prof. Dr. Jörg-Markus Hitz
> > - **Voraussetzungen:** keine laut Modulhandbuch
> > - **Dauer:** 1 Semester
>
> > [!eba-regel|handy-zu]+ Prüfung
> > - **Form:** Klausur (60-90 Minuten) (6 ECTS) – 100 % der Modulnote
> > - **Hilfsmittel:** nicht-programmierbarer Taschenrechner, Wörterbuch ohne Notizen (FAQ)


<p class="eba-fuss">Quelle: MHB B.Sc. Wiwi (Datei 2026-3-24_Modulhandbuch_B.Sc.Wiwi.pdf), S. 44; PO 2023 BT EcoBA (AmtlBekUT 24/2023, S. 310-317), § 4 · Stand der Recherche 30.09.2026 · <a class="internal-link" data-href="Kontakte & Links#Offizielle Dokumente" href="Kontakte & Links#Offizielle Dokumente">Alle Quellen</a></p>
