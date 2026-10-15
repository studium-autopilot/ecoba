---
typ: "modul"
code: "SQ888"
titel: "Mathematisches Propädeutikum für Wirtschaftswissenschaftler"
titel_en: "Mathematics Preparatory Course"
ects: 0
fachsemester: 1
fs_empfohlen: "vor dem 1."
gruppe: "Weitere"
rolle_economics: "Vorkurs (kein Modul der PO)"
rolle_ba: "Vorkurs (kein Modul der PO)"
rolle_ohne: "Vorkurs (kein Modul der PO)"
bereiche: []
pruefung: "keine"
benotet: false
notenblock: "–"
sprache: "Deutsch"
turnus: "WS"
verantwortlich: "Dr. Julie Schnaitmann"
op_modul: false
status: "offen"
ergebnis:
versuch:
klausur:
semester_geplant: ""
gewaehlt: false
zusatz: true
uebersicht: "[[Noten & ECTS]]"
aliases:
  - "SQ888"
  - "Mathe-Vorkurs"
tags:
  - "modul"
cssclasses:
  - "eba"
  - "eba-s-modul"
---

<div class="eba-kopf">
<div class="eba-pfad"><a class="internal-link" data-href="Dashboard" href="Dashboard">Dashboard</a><a class="internal-link" data-href="Noten & ECTS" href="Noten & ECTS">Module</a><span>Weitere Module</span></div>
<h1>SQ888 · Mathe-Vorkurs</h1>
<p class="eba-lead">Mathematisches Propädeutikum vor Semesterbeginn: frischt die Schulmathematik auf, die S100 voraussetzt.</p>
<div class="eba-meta"><span><b>0</b> ECTS</span><span>05.–07.10.2026</span><span>keine Prüfung</span><span>keine Anmeldung</span><span>Deutsch</span></div>
</div>

> [!eba-raster|2]
> > [!eba-karte|handy-zu]+ Veranstaltung
> > - **Termine:** Mo–Mi, 05.–07.10.2026, 9:15–12:00 · Audimax, Neue Aula ([[2026-10-05 Mathe-Vorkurs für Wirtschaftswissenschaftler|Termin]])
> > - **Leitung:** Dr. Julie Schnaitmann
> > - **Material:** [ILIAS-Kurs](https://vitruv.uni-tuebingen.de/ilias3/goto_pr01_crs_4803.html)
> > - **Inhalt:** Mengenlehre, Zahlenbereiche, Potenzen/Wurzeln, Ungleichungen, Gleichungen, Funktionen, Umkehr-, Exponential- und Logarithmusfunktionen
>
> > [!eba-regel|handy-zu]+ Einordnung
> > - Eigene Veranstaltung **SQ888** (Einführungskurs), **kein Modul der PO 2023**.
> > - **0 ECTS**, keine Prüfung, keine Anmeldung nötig. Zählt weder für ECTS noch für die Note.
> > - In Alma den Modulen [[S100 Mathematische Methoden der Wirtschaftswissenschaft|S100]] und SQ100 zugeordnet.

## Unterlagen

> [!eba-neu|ohne-titel]
> - [Unterlagen einordnen](obsidian://studium-autopilot?aktion=einordnen&code=SQ888)
> - [In SQ888 suchen](obsidian://studium-autopilot?aktion=suchen&q=path%3ASQ888%20)

> [!eba-tabelle] Folien, Skripte, Übungen, Altklausuren
> ```base
> formulas:
>   was: 'file.asLink(if(nummer, art + " " + if(nummer < 10, "0" + nummer, "" + nummer), art) + if(titel, " · " + titel, ""))'
>   oeffnen: 'html("<a class=\"eba-oeffnen\" href=\"obsidian://studium-autopilot?aktion=oeffnen&notiz=" + file.basename.replace(/%/g, "%25").replace(/&/g, "%26").replace(/#/g, "%23").replace(/\+/g, "%2B") + "\">Öffnen ↗</a>")'
>   groesse: '(file.size / 1048576).toFixed(1) + " MB"'
> properties:
>   formula.was:
>     displayName: Unterlage
>   note.seiten:
>     displayName: Seiten
>   note.status:
>     displayName: Status
>   formula.oeffnen:
>     displayName: Datei
>   file.name:
>     displayName: Datei
>   file.ext:
>     displayName: Typ
>   formula.groesse:
>     displayName: Größe
> views:
>   - type: table
>     name: Nach Art
>     filters:
>       and:
>         - 'typ == "unterlage"'
>         - 'code == "SQ888"'
>     groupBy:
>       property: note.art
>       direction: ASC
>     order:
>       - formula.was
>       - seiten
>       - status
>       - formula.oeffnen
>     sort:
>       - property: nummer
>         direction: ASC
>     columnSize:
>       formula.was: 330
>       note.seiten: 80
>       note.status: 100
>       formula.oeffnen: 90
>   - type: table
>     name: Noch nicht gelesen
>     filters:
>       and:
>         - 'typ == "unterlage"'
>         - 'code == "SQ888"'
>         - 'status == "neu" || !status'
>     order:
>       - formula.was
>       - seiten
>       - formula.oeffnen
>     sort:
>       - property: art
>         direction: ASC
>       - property: nummer
>         direction: ASC
>   - type: table
>     name: Dateien im Ordner
>     filters:
>       and:
>         - (file.folder == "Unterlagen/SQ888" || file.folder.startsWith("Unterlagen/SQ888 "))
>         - 'file.ext != "md"'
>     order:
>       - file.name
>       - file.ext
>       - formula.groesse
>     sort:
>       - property: file.name
>         direction: ASC
> ```

## Meine Notizen

> [!eba-tabelle|handy-zu]+ Vorlesungen, Übungsblätter, Stundenplan, Termine
> ```base
> filters:
>   and:
>     - 'code == "SQ888"'
>     - 'typ != "modul"'
>     - 'typ != "unterlage"'
> formulas:
>   wann: 'if(faellig, faellig, datum)'
>   art: 'if(typ == "vorlesung", "Vorlesung", if(typ == "übungsblatt", "Übungsblatt", if(typ == "lehrveranstaltung", "Stundenplan", if(typ == "termin", "Termin", typ))))'
> properties:
>   file.name:
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
>       - file.name
>       - formula.wann
>       - status
>       - nachgearbeitet
>     sort:
>       - property: formula.wann
>         direction: DESC
>     columnSize:
>       file.name: 330
>       formula.wann: 120
>       note.status: 110
>       note.nachgearbeitet: 120
> ```



<p class="eba-fuss">Quellen: <a href="https://uni-tuebingen.de/fakultaeten/wirtschafts-und-sozialwissenschaftliche-fakultaet/faecher/fachbereich-wirtschaftswissenschaft/wirtschaftswissenschaft/lehrstuehle/statistik-und-oekonometrie/statistics-econometrics-and-empirical-economics/teaching/winter-202627/mathematisches-propaedeutikum-fuer-wirtschaftswissenschaftler-vorkurs/">Kursseite WS 2026/27</a> · <a href="https://alma.uni-tuebingen.de/alma/pages/startFlow.xhtml?_flowId=detailView-flow&unitId=46219&periodId=237">Alma SQ888</a> · Stand 30.09.2026 · <a class="internal-link" data-href="Kontakte & Links#Offizielle Dokumente" href="Kontakte & Links#Offizielle Dokumente">Alle Quellen</a></p>
