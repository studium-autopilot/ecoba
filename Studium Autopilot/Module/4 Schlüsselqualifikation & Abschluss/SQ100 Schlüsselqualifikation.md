---
typ: "modul"
code: "SQ100"
titel: "Schlüsselqualifikation"
titel_en: "Professional Skills"
ects: 9
fachsemester: 4
fs_empfohlen: "4.–5."
gruppe: "Abschluss"
rolle_economics: "Schlüsselqualifikation"
rolle_ba: "Schlüsselqualifikation"
rolle_ohne: "Schlüsselqualifikation"
bereiche: []
pruefung: "unbenotet"
benotet: false
notenblock: "–"
sprache: "Deutsch"
turnus: "WS, SS"
verantwortlich: "verschiedene Dozierende"
op_modul: false
status: "offen"
ergebnis:
versuch:
klausur:
semester_geplant: ""
zusatz: false
uebersicht: "[[Noten & ECTS]]"
aliases:
  - "SQ100"
  - "Schlüsselqualifikation"
tags:
  - "modul"
cssclasses:
  - "eba"
  - "eba-s-modul"
---

<div class="eba-kopf">
<h1><span class="eba-code">SQ100</span> Schlüsselqualifikation</h1>
<div class="eba-meta"><span><b>9</b> ECTS</span><span>4.–5. FS</span><span>WS, SS</span><span>unbenotet</span><span>Deutsch</span></div>
</div>

```eba-modul
```


## Meine SQ-Kurse

> [!eba-kennzahlen|kompakt]
> ```base
> filters:
>   and:
>     - file.name == "SQ100 Schlüsselqualifikation"
> formulas:
>   k: |-
>     file("Module/4 Schlüsselqualifikation & Abschluss/SQ100 Schlüsselqualifikation.md").backlinks.map(value.asFile()).filter(value.properties.typ == "sq_kurs")
>   b: |-
>     formula.k.filter(["bestanden", "anerkannt"].contains(value.properties.status.toString().lower().trim())).reduce(acc + number(value.properties.ects), 0)
>   l: |-
>     formula.k.filter(["angemeldet", "zugelassen"].contains(value.properties.status.toString().lower().trim())).reduce(acc + number(value.properties.ects), 0)
>   g: |-
>     formula.k.filter(value.properties.status.toString().lower().trim() == "geplant").reduce(acc + number(value.properties.ects), 0)
>   rest: |-
>     max(0, 9 - formula.b - formula.l - formula.g)
>   karte: |-
>     html("<div class='eba-kz'><div class='eba-kz-reihe vier'><div class='eba-kachel akzent'><span class='k'>Bestanden</span><span class='v'>" + formula.b + "<small>/ 9</small></span><span class='s'>ECTS, zählen für SQ100</span><progress max='9' value='" + min(9, formula.b) + "'></progress></div><div class='eba-kachel'><span class='k'>Angemeldet</span><span class='v'>" + formula.l + "</span><span class='s'>ECTS, laufen gerade</span></div><div class='eba-kachel'><span class='k'>Geplant</span><span class='v'>" + formula.g + "</span><span class='s'>ECTS</span></div><div class='eba-kachel'><span class='k'>Fehlen noch</span><span class='v'>" + formula.rest + "</span><span class='s'>ECTS ohne Plan</span></div></div></div>")
> views:
>   - type: list
>     name: Kennzahlen
>     order:
>       - formula.karte
> ```

> [!eba-tabelle|ohne-titel|umbruch]
> ```base
> filters:
>   and:
>     - 'typ == "sq_kurs"'
> formulas:
>   was: 'file.asLink(titel)'
> properties:
>   formula.was:
>     displayName: Kurs
>   note.anbieter:
>     displayName: Anbieter
>   note.semester:
>     displayName: Semester
>   note.ects:
>     displayName: ECTS
>   note.status:
>     displayName: Stand
> views:
>   - type: table
>     name: Meine SQ-Kurse
>     rowHeight: medium
>     sort:
>       - property: semester
>         direction: ASC
>     summaries:
>       note.ects: Sum
>     order:
>       - formula.was
>       - formula.artnr
>       - anbieter
>       - semester
>       - ects
>       - status
>     columnSize:
>       formula.was: 250
>       note.anbieter: 180
>       note.semester: 100
>       note.ects: 60
>       note.status: 100
> ```

> [!eba-neu|ohne-titel]
> - [Neuer SQ-Kurs](obsidian://studium-autopilot?aktion=sq-kurs)

> [!eba-raster|2]
> > [!eba-karte|handy-zu]+ Was zählt
> > - **9 ECTS**, unbenotet, zählen nicht zur Gesamtnote. Laut Studienplan im 4./5. Semester, geht aber jederzeit.
> > - Kurse des **Transdisciplinary Course Program (TCP)**, des **Fremdsprachenzentrums** und des **Weltethos-Instituts**.
> > - Ausgewählte Kurse des Fachbereichs Wirtschaftswissenschaft (in Alma als Schlüsselqualifikation ausgewiesen).
> > - **Auslandssemester:** 6 ECTS.
> > - **Praktikum:** Bericht beim Career Service, dessen Bescheinigung ans Prüfungsamt.
> > - **Engagement** in einer Hochschulgruppe: ECTS-Nachweis ans Prüfungsamt.
>
> > [!eba-regel|handy-zu]+ Fristen
> > - **Sprachkurse (Fremdsprachenzentrum):** Anmeldung in Alma bis kurz vor Vorlesungsbeginn; mit Vorkenntnissen vorher Einstufungstest. Intensivkurse in der vorlesungsfreien Zeit haben eine eigene Anmeldung.
> > - **TCP:** mehrere Belegungszeiträume je Semester, spätere für später beginnende Kurse; nach jedem Zeitraum einige Tage zum Abmelden.
> > - **TCP-Studienleistung** zusätzlich in Alma anmelden, sonst keine ECTS.
> > - Unentschuldigt fehlen bei TCP: im nächsten Semester keine TCP-Kurse.
> > - Die Fristen dieses Semesters stehen von selbst unter [[Termine & Anmeldungen]].


## Unterlagen

```eba-unterlagen
```

## Zum Modul

> [!eba-tabelle|schlicht|handy-zu]+ Stundenplan, Termine
> ```base
> filters:
>   and:
>     - 'code == "SQ100"'
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
> > - **Inhalte:** Überfachliche Kompetenzen, z.B. TCP, ZDV, Fremdsprachen, Schreibzentrum, Weltethos-Institut
> > - **Lehrform:** je nach gewählten Lehrveranstaltungen / Mitarbeit, Selbststudium, Literaturstudium
> > - **Workload:** Kontaktzeit 60 h + Selbststudium 210 h = 270 h
> > - **Verantwortlich:** verschiedene Dozierende
> > - **Voraussetzungen:** keine laut Modulhandbuch
> > - **Dauer:** 1-6 Semester
>
> > [!eba-regel|handy-zu]+ Prüfung
> > - **Form:** unbenotet
> > - **Studienleistung:** je nach gewählten Lehrveranstaltungen
> > - **Gesamtnote:** zählt nicht, weil unbenotet


> [!eba-info|handy-zu]+ Hinweise
> - Titel im Studienplan/PO: "Schlüsselqualifikation"; Modulbeschreibung: DE "Schlüsselqualifikationen" / EN "Professional Skills".


<p class="eba-fuss">Quellen: <a href="https://uni-tuebingen.de/fakultaeten/wirtschafts-und-sozialwissenschaftliche-fakultaet/faecher/fachbereich-wirtschaftswissenschaft/wirtschaftswissenschaft/studium/service-beratung/studienfachberatung/faqs-bachelor/">FAQ Bachelor Wirtschaftswissenschaft</a> · <a href="https://uni-tuebingen.de/studium/studienangebot/ueberfachliche-kompetenzen/transdisciplinary-course-program/bachelor-1/">TCP Bachelor, Fristen WS 2026/27</a> · <a href="https://uni-tuebingen.de/international/sprachen-lernen/fremdsprachen-lernen/termine/">Fremdsprachenzentrum, Termine</a> (Stand 07.10.2026) · MHB B.Sc. Wiwi (Datei 2026-3-24_Modulhandbuch_B.Sc.Wiwi.pdf), S. 166; PO 2023 BT EcoBA (AmtlBekUT 24/2023, S. 310-317), § 4 · Stand der Recherche 30.09.2026 · <a class="internal-link" data-href="Kontakte & Links#Offizielle Dokumente" href="Kontakte & Links#Offizielle Dokumente">Alle Quellen</a></p>
