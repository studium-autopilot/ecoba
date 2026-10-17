---
typ: "modul"
code: "S220"
titel: "Quantitative Methods in Economics and Business Administration"
titel_en: "Quantitative Methods in Economics and Business Administration"
ects: 6
fachsemester: 3
fs_empfohlen: "3"
gruppe: "Profil & Vertiefung"
rolle_economics: "Pflicht"
rolle_ba: "Wahlpflicht: Profilbildungsbereich (oder Elective Studies)"
rolle_ohne: "Wahlpflicht: Profilbildungsbereich VWL oder BWL (oder Elective Studies)"
bereiche: []
pruefung: "Klausur 60 min"
benotet: true
notenblock: "34 %"
sprache: "Englisch"
turnus: "WS"
verantwortlich: "Prof. Dr. Martin Biewen, Prof. Dr. Joachim Grammig"
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
  - "S220"
  - "Quantitative Methods in Economics and Business Administration"
tags:
  - "modul"
cssclasses:
  - "eba"
  - "eba-s-modul"
---

<div class="eba-kopf">
<div class="eba-pfad"><a class="internal-link" data-href="Dashboard" href="Dashboard">Dashboard</a><a class="internal-link" data-href="Noten & ECTS" href="Noten & ECTS">Module</a><span>Profil & Vertiefung</span></div>
<h1>S220 · Quantitative Methods in Economics and Business Administration</h1>
<p class="eba-lead">Schätztheorie, Maximum Likelihood, Hypothesentests, multiple Regression, stochastische Prozesse, Ökonometrie-Software</p>
<div class="eba-meta"><span><b>6</b> ECTS</span><span>FS 3</span><span>WS</span><span>Klausur 60 min</span><span>Englisch</span><span>Notenblock 34 %</span></div>
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
>   plan: 'html("<a class=\"eba-plan\" href=\"obsidian://studium-autopilot?aktion=plan&modul=" + file.basename.replace(/%/g, "%25").replace(/&/g, "%26").replace(/#/g, "%23").replace(/\+/g, "%2B") + "\">" + if(gewaehlt, "✓ Im Plan", "+ Planen") + "</a>")'
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
>   formula.plan:
>     displayName: Im Plan
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
>       - formula.plan
> ```


> [!eba-neu] Neu zu diesem Modul
> - [Vorlesung](obsidian://studium-autopilot?aktion=vorlesung&code=S220)
> - [Übungsblatt](obsidian://studium-autopilot?aktion=uebungsblatt&code=S220)


> [!eba-raster|2]
> > [!eba-karte|handy-zu]+ Lehrveranstaltung
> > - **Lehrform:** lecture (2 SWS) tutorial (2 SWS) / oral participation, group discussion, self-study
> > - **Workload:** Kontaktzeit 60 h + Selbststudium 120 h = 180 h
> > - **Verantwortlich:** Prof. Dr. Martin Biewen, Prof. Dr. Joachim Grammig
> > - **Voraussetzungen:** S110 Explorative Data Analysis, S111 Risk and Probability oder equivalent for students studying in their minor
> > - **Dauer:** 1 Semester
>
> > [!eba-regel|handy-zu]+ Prüfung
> > - **Form:** Klausur (60 Minuten) (6 CP) – 100 % der Modulnote


## Rolle je Variante

> [!eba-tabelle|handy-zu|pc-flach]+ Drei Varianten
> | Variante | Rolle dieses Moduls |
> | --- | --- |
> | Economics | Pflicht |
> | Business Administration | Wahlpflicht: Profilbildungsbereich (oder Elective Studies) |
> | ohne Spezialisierung | Wahlpflicht: Profilbildungsbereich VWL oder BWL (oder Elective Studies) |
>
> Welche Variante gilt, stellst du in den [[Einstellungen & Hilfe#Variante|Einstellungen]] ein. Mehr dazu im [[Schwerpunkt-Planer]].

> [!eba-info|handy-zu]+ Hinweise
> - Laut MHB Voraussetzung für alle ökonometrischen Schwerpunktmodule.


## Unterlagen

> [!eba-neu|ohne-titel]
> - [Unterlagen einordnen](obsidian://studium-autopilot?aktion=einordnen&code=S220)
> - [In S220 suchen](obsidian://studium-autopilot?aktion=suchen&q=path%3AS220%20)

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
>         - 'code == "S220"'
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
>         - 'code == "S220"'
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
>         - (file.folder == "Unterlagen/S220" || file.folder.startsWith("Unterlagen/S220 "))
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
>     - 'code == "S220"'
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


<p class="eba-fuss">Quelle: MHB B.Sc. Wiwi (Datei 2026-3-24_Modulhandbuch_B.Sc.Wiwi.pdf), S. 154; PO 2023 BT EcoBA (AmtlBekUT 24/2023, S. 310-317), § 4 · Stand der Recherche 30.09.2026 · <a class="internal-link" data-href="Kontakte & Links#Offizielle Dokumente" href="Kontakte & Links#Offizielle Dokumente">Alle Quellen</a></p>
