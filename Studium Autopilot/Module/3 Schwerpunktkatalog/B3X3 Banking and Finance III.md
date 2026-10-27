---
typ: "modul"
code: "B3X3"
titel: "Banking and Finance III"
titel_en: "Banking and Finance III"
ects: 6
fachsemester: 3
fs_empfohlen: "3.–6."
gruppe: "Schwerpunkt"
rolle_economics: "Schwerpunktbereich (siehe bereich) oder Elective Studies"
rolle_ba: "Schwerpunktbereich (siehe bereich) oder Elective Studies"
rolle_ohne: "Schwerpunktbereich (siehe bereich) oder Elective Studies"
bereiche:
  - "Banking and Finance"
  - "Elective Studies"
pruefung: "Klausur 90 min oder Hausarbeit oder Präsentation"
benotet: true
notenblock: "66 %"
sprache: "Deutsch/Englisch"
turnus: "WS, SS"
verantwortlich: "Prof. Dr. Monika Gehde-Trapp, Prof. Dr. Christian Koziol"
op_modul: false
status: "offen"
ergebnis:
versuch:
klausur:
semester_geplant: ""
gewaehlt: false
anrechnung: "Banking and Finance"
zusatz: false
uebersicht: "[[Noten & ECTS]]"
aliases:
  - "B3X3"
  - "Banking and Finance III"
tags:
  - "modul"
cssclasses:
  - "eba"
  - "eba-s-modul"
---

<div class="eba-kopf">
<h1><span class="eba-code">B3X3</span> Banking and Finance III</h1>
<div class="eba-meta"><span><b>6</b> ECTS</span><span>3.–6. FS</span><span>WS, SS</span><span>Klausur 90 min oder Hausarbeit oder Präsentation</span><span>Deutsch/Englisch</span><span>Notenblock 66 %</span></div>
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
>     - 'code == "B3X3"'
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
> > - **Inhalte:** Containermodul Finanzwirtschaft, z.B. internationales Finanzmanagement, Wechselkursrisiken
> > - **Lehrform:** Vorlesung mit Übung (4 SWS) / Präsentation von Übungsaufgaben, Mitarbeit, Gruppendiskussion, Selbststudium, Literaturstudium
> > - **Workload:** Kontaktzeit 60 h + Selbststudium 120 h = 180 h
> > - **Verantwortlich:** Prof. Dr. Monika Gehde-Trapp, Prof. Dr. Christian Koziol
> > - **Voraussetzungen:** B110 Einführung in die Betriebswirtschaftslehre, B200 Investition und Finanzierung
> > - **Dauer:** 1 Semester
>
> > [!eba-regel|handy-zu]+ Prüfung
> > - **Form:** Klausur (90 Minuten), oder Hausarbeit oder Präsentation (6 ECTS) – 100 % der Modulnote
> > - **Studienleistung:** Siehe einzelne Lehrveranstaltung und Informationen auf Alma


> [!eba-ziel|handy-zu]+ Anrechenbar in
> - **Banking and Finance** · BWL-Schwerpunktbereich I
> - **Elective Studies** · Schwerpunktbereich ohne Zuordnung
>
> Ein Modul zählt nur in **einem** Bereich. Du wählst ihn im Feld „Anrechnung in“ oben.


<p class="eba-fuss">Quelle: MHB B.Sc. Wiwi (Datei 2026-3-24_Modulhandbuch_B.Sc.Wiwi.pdf), S. 56 · Stand der Recherche 30.09.2026 · <a class="internal-link" data-href="Kontakte & Links#Offizielle Dokumente" href="Kontakte & Links#Offizielle Dokumente">Alle Quellen</a></p>
