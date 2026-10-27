---
typ: modul
code: S100
titel: Mathematische Methoden der Wirtschaftswissenschaft
kurz: "Mathe"
titel_en: Mathematics for Economics and Business Administration
ects: 6
fachsemester: 1
fs_empfohlen: "1"
gruppe: Grundstudium
rolle_economics: Pflicht
rolle_ba: Pflicht
rolle_ohne: Pflicht
bereiche: []
pruefung: Klausur 90 min
benotet: true
notenblock: 34 %
sprache: Deutsch
turnus: WS
verantwortlich: Dr. Julie Schnaitmann
op_modul: true
status: "offen"
ergebnis:
versuch:
klausur:
semester_geplant: ""
zusatz: false
uebersicht: "[[Noten & ECTS]]"
aliases:
  - S100
  - Mathematische Methoden der Wirtschaftswissenschaft
tags:
  - modul
cssclasses:
  - eba
  - eba-s-modul
---

<div class="eba-kopf">
<h1><span class="eba-code">S100</span> Mathematische Methoden der Wirtschaftswissenschaft</h1>
<div class="eba-meta"><span><b>6</b> ECTS</span><span>1. FS</span><span>WS</span><span>Klausur 90 min</span><span>Deutsch</span><span class="eba-akzent">Orientierungsprüfung</span><span>Notenblock 34 %</span></div>
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
>     - 'code == "S100"'
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
> > - **Inhalte:** Differential-/Integralrechnung, Optimierung, Differentialgleichungen, lineare Algebra, Matrizen, Eigenwerte
> > - **Lehrform:** Propädeutikum (1 SWS), Vorlesung (4 SWS), Übung (2 SWS) / Mitarbeit, Selbststudium, E-Learning
> > - **Workload:** Kontaktzeit 105 h + Selbststudium 75 h = 180 h
> > - **Verantwortlich:** Dr. Julie Schnaitmann
> > - **Voraussetzungen:** Keine, Mathematikpropädeutikum (SQ888) wird vor Semesterbeginn angeboten
> > - **Dauer:** 1 Semester
>
> > [!eba-regel|handy-zu]+ Prüfung
> > - **Form:** Klausur (90 Minuten) (6 ECTS) – 100 % der Modulnote
> > - **Orientierungsprüfung:** 4 der 6 OP-Module bis Ende des 4. Fachsemesters bestehen
> > - **Hilfsmittel:** nicht-programmierbarer Taschenrechner, Wörterbuch ohne Notizen (FAQ)


<p class="eba-fuss">Quelle: MHB B.Sc. Wiwi (Datei 2026-3-24_Modulhandbuch_B.Sc.Wiwi.pdf), S. 150; PO 2023 BT EcoBA (AmtlBekUT 24/2023, S. 310-317), § 4 · Stand der Recherche 30.09.2026 · <a class="internal-link" data-href="Kontakte & Links#Offizielle Dokumente" href="Kontakte & Links#Offizielle Dokumente">Alle Quellen</a></p>
