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
>   note.anrechnung:
>     displayName: Zählt als
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
>       - anrechnung
> ```


> [!eba-neu|ohne-titel] Neu zu diesem Modul
> - [Vorlesung](obsidian://studium-autopilot?aktion=vorlesung&code=B240)
> - [Übungsblatt](obsidian://studium-autopilot?aktion=uebungsblatt&code=B240)


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


## Unterlagen

> [!eba-neu|ohne-titel]
> - [Unterlagen einordnen](obsidian://studium-autopilot?aktion=einordnen&code=B240)
> - [In B240 suchen](obsidian://studium-autopilot?aktion=suchen&q=path%3AB240%20)

> [!eba-tabelle] Folien, Skripte, Übungen, Altklausuren
> ```base
> formulas:
>   was: 'file.asLink(if(titel, titel, if(nummer, art + " " + if(nummer < 10, "0" + nummer, "" + nummer), art)))'
>   artnr: 'if(titel, if(nummer, art + " " + if(nummer < 10, "0" + nummer, "" + nummer), art), "")'
>   oeffnen: 'html("<a class=\"eba-oeffnen\" href=\"obsidian://studium-autopilot?aktion=oeffnen&notiz=" + file.basename.replace(/%/g, "%25").replace(/&/g, "%26").replace(/#/g, "%23").replace(/\+/g, "%2B") + "\">Öffnen ↗</a>")'
>   groesse: '(file.size / 1048576).toFixed(1) + " MB"'
> properties:
>   formula.was:
>     displayName: Unterlage
>   formula.artnr:
>     displayName: Art
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
>         - 'code == "B240"'
>     groupBy:
>       property: note.art
>       direction: ASC
>     order:
>       - formula.was
>       - formula.artnr
>       - seiten
>       - status
>       - formula.oeffnen
>     sort:
>       - property: nummer
>         direction: ASC
>     columnSize:
>       formula.was: 250
>       formula.artnr: 80
>       note.seiten: 80
>       note.status: 100
>       formula.oeffnen: 90
>   - type: table
>     name: Noch nicht gelesen
>     filters:
>       and:
>         - 'typ == "unterlage"'
>         - 'code == "B240"'
>         - 'status == "neu" || !status'
>     order:
>       - formula.was
>       - formula.artnr
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
>         - (file.folder == "Unterlagen/B240" || file.folder.startsWith("Unterlagen/B240 "))
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


<p class="eba-fuss">Quelle: MHB B.Sc. Wiwi (Datei 2026-3-24_Modulhandbuch_B.Sc.Wiwi.pdf), S. 47; PO 2023 BT EcoBA (AmtlBekUT 24/2023, S. 310-317), § 4 · Stand der Recherche 30.09.2026 · <a class="internal-link" data-href="Kontakte & Links#Offizielle Dokumente" href="Kontakte & Links#Offizielle Dokumente">Alle Quellen</a></p>
