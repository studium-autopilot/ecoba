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
<div class="eba-pfad"><a class="internal-link" data-href="Dashboard" href="Dashboard">Dashboard</a><a class="internal-link" data-href="Noten & ECTS" href="Noten & ECTS">Module</a><span>Abschluss</span></div>
<h1>SQ100 · Schlüsselqualifikation</h1>
<p class="eba-lead">Überfachliche Kompetenzen, z.B. TCP, ZDV, Fremdsprachen, Schreibzentrum, Weltethos-Institut · Professional Skills</p>
<div class="eba-meta"><span><b>9</b> ECTS</span><span>FS 4.–5.</span><span>WS, SS</span><span>unbenotet</span><span>Deutsch</span></div>
</div>


> [!eba-tabelle|schlicht] Mein Stand
> ```base
> filters:
>   and:
>     - file == this.file
> formulas:
>   mpid: 'file("System/Daten/Musterplan.md").properties.plaene.filter(value.name == file("System/Einstellungen.md").properties.variante).map(value.id).join("")'
>   mpfs: 'file("System/Daten/Musterplan.md").properties.eintraege.filter(value.plan == formula.mpid && value.code == code).map(number(value.fs)).sort()'
>   fsplan: 'if(gruppe == "Schwerpunkt", 0, if(formula.mpid == "", if(fachsemester, number(fachsemester), 0), if(formula.mpfs.length > 0, formula.mpfs[0], if(gewaehlt == true && fachsemester, number(fachsemester), 0))))'
>   semester: 'if(semester_geplant, semester_geplant, if(formula.fsplan > 0, file("System/Einstellungen.md").properties.semesterliste.filter(number(value.split("|")[0]) == formula.fsplan).map(value.split("|")[1]).join(""), ""))'
> properties:
>   note.status:
>     displayName: Status
>   note.ergebnis:
>     displayName: Note
>   note.versuch:
>     displayName: Versuch
>   note.klausur:
>     displayName: Prüfungstermin
>   note.semester_geplant:
>     displayName: Eigene Planung
>   formula.semester:
>     displayName: Semester
> views:
>   - type: table
>     name: Mein Stand
>     order:
>       - status
>       - ergebnis
>       - versuch
>       - klausur
>       - formula.semester
>       - semester_geplant
> ```

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
> - [SQ-Kurs eintragen](obsidian://studium-autopilot?aktion=sq-kurs)

> [!eba-raster|2]
> > [!eba-karte|handy-zu]+ Was zählt
> > - **9 ECTS**, unbenotet, zählen nicht zur Gesamtnote. Laut Studienplan im 4./5. Semester, geht aber jederzeit.
> > - Kurse des **Transdisciplinary Course Program (TCP)**, des **Fremdsprachenzentrums** und des **Weltethos-Instituts**.
> > - Ausgewählte Kurse des Fachbereichs Wirtschaftswissenschaft (in Alma als Schlüsselqualifikation ausgewiesen).
> > - **Auslandssemester:** 6 ECTS.
> > - **Praktikum:** Bericht beim Career Service, dessen Bescheinigung ans Prüfungsamt.
> > - **Engagement** in einer Hochschulgruppe: ECTS-Nachweis ans Prüfungsamt.
>
> > [!eba-regel|handy-zu]+ Fristen WS 2026/27
> > - **Sprachkurse (Fremdsprachenzentrum):** Anmeldung in Alma bis **Fr 09.10., 12:00**; mit Vorkenntnissen vorher Einstufungstest (bis 09.10.). Intensivkurse: Anmeldung 24.12.–22.01.
> > - **TCP 2. Belegung:** 12.–19.10. (Kurse ab 06.11.), Abmeldung 22.–25.10.
> > - **TCP 3. Belegung:** 09.–16.11. (Kurse ab 04.12.), Abmeldung 19.–22.11.
> > - **TCP-Studienleistung** in Alma anmelden: 12.10.2026–21.02.2027, sonst keine ECTS.
> > - Unentschuldigt fehlen bei TCP: im nächsten Semester keine TCP-Kurse.


> [!eba-neu] Neu zu diesem Modul
> - [Vorlesung](obsidian://studium-autopilot?aktion=vorlesung&code=SQ100)
> - [Übungsblatt](obsidian://studium-autopilot?aktion=uebungsblatt&code=SQ100)


> [!eba-raster|2]
> > [!eba-karte|handy-zu]+ Lehrveranstaltung
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


## Unterlagen

> [!eba-neu|ohne-titel]
> - [Unterlagen einordnen](obsidian://studium-autopilot?aktion=einordnen&code=SQ100)
> - [In SQ100 suchen](obsidian://studium-autopilot?aktion=suchen&q=path%3ASQ100%20)

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
>         - 'code == "SQ100"'
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
>         - 'code == "SQ100"'
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
>         - (file.folder == "Unterlagen/SQ100" || file.folder.startsWith("Unterlagen/SQ100 "))
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
>     - 'code == "SQ100"'
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


<p class="eba-fuss">Quellen: <a href="https://uni-tuebingen.de/fakultaeten/wirtschafts-und-sozialwissenschaftliche-fakultaet/faecher/fachbereich-wirtschaftswissenschaft/wirtschaftswissenschaft/studium/service-beratung/studienfachberatung/faqs-bachelor/">FAQ Bachelor Wirtschaftswissenschaft</a> · <a href="https://uni-tuebingen.de/studium/studienangebot/ueberfachliche-kompetenzen/transdisciplinary-course-program/bachelor-1/">TCP Bachelor, Fristen WS 2026/27</a> · <a href="https://uni-tuebingen.de/international/sprachen-lernen/fremdsprachen-lernen/termine/">Fremdsprachenzentrum, Termine</a> (Stand 07.10.2026) · MHB B.Sc. Wiwi (Datei 2026-3-24_Modulhandbuch_B.Sc.Wiwi.pdf), S. 166; PO 2023 BT EcoBA (AmtlBekUT 24/2023, S. 310-317), § 4 · Stand der Recherche 30.09.2026 · <a class="internal-link" data-href="Kontakte & Links#Offizielle Dokumente" href="Kontakte & Links#Offizielle Dokumente">Alle Quellen</a></p>
