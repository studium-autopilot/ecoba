---
typ: "übersicht"
tags:
  - "übersicht"
cssclasses:
  - "eba"
  - "eba-weit"
  - "eba-s-stundenplan"
---

<div class="eba-kopf">
<div class="eba-pfad"><a class="internal-link" data-href="Dashboard" href="Dashboard">Dashboard</a><span>Studium</span></div>
<h1>Stundenplan</h1>
</div>

> [!eba-neu|ohne-titel]
> - [Stundenplan aus Alma holen](obsidian://studium-autopilot?aktion=stundenplan)
> - [Alma verbinden](obsidian://studium-autopilot?aktion=verbinden&id=alma)

Einmal **Alma verbinden**, danach mit **Stundenplan aus Alma holen** aktualisieren.

> [!eba-kennzahlen|woche]
> ```eba-schloss alma
> ```
> ```base
> filters:
>   and:
>     - file.name == "Stundenplan"
> formulas:
>   c: |-
>     file("System/Einstellungen.md").properties
>   sems: |-
>     formula.c.semesterliste
>   jetzt: |-
>     formula.sems.filter(date(value.split("|")[2]) <= today() && date(value.split("|")[3]) >= today())
>   vorstart: |-
>     today() < date(formula.sems[0].split("|")[2])
>   sem: |-
>     if(formula.jetzt.length > 0, formula.jetzt[0], if(formula.vorstart, formula.sems[0], formula.sems[formula.sems.length - 1]))
>   semname: |-
>     formula.sem.split("|")[1]
>   vb: |-
>     date(formula.sem.split("|")[4])
>   ve: |-
>     date(formula.sem.split("|")[5])
>   lz: |-
>     today() >= formula.vb && today() <= formula.ve
>   lv: |-
>     file("Studium/Stundenplan.md").backlinks.map(value.asFile()).filter(value.properties.typ == "lehrveranstaltung" && value.properties.semester == formula.semname && value.properties.einzeltermin != true)
>   h0: |-
>     if(formula.lv.length > 0, formula.lv.map(number(value.properties.beginn.split(":")[0])).sort()[0], 8)
>   h1: |-
>     if(formula.lv.length > 0, formula.lv.map(number(value.properties.ende.split(":")[0]) + if(number(value.properties.ende.split(":")[1]) > 0, 1, 0)).sort().reverse()[0], 18)
>   rows: |-
>     (formula.h1 - formula.h0) * 4
>   zeile: |-
>     ((697 / (formula.rows + 1)) * 100).round() / 100
>   stunden: |-
>     [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22].filter(value >= formula.h0 && value <= formula.h1).map("<span class='eba-zeit' style='grid-row:" + ((value - formula.h0) * 4 + 2) + "'>" + if(value < 10, "0", "") + value + "</span><i class='eba-linie' style='grid-row:" + ((value - formula.h0) * 4 + 2) + "'></i>").join("")
>   ev: |-
>     formula.lv.map("<a class='eba-ev " + if(value.properties.art == "Vorlesung", "vl", "ue") + if(number(value.properties.wochentag) == number(today().format("E")) && formula.lz, if(value.properties.ausfall && value.properties.ausfall.contains(today().format("YYYY-MM-DD")), " ausfall", " heute" + if(now().format("HH:mm") >= value.properties.beginn && now().format("HH:mm") <= value.properties.ende, " jetzt", "")), "") + "' href='obsidian://studium-autopilot?aktion=zeigen&notiz=" + value.properties.modul.toString().replace(/^\[\[|\]\]$/g, "").replace(/%/g, "%25").replace(/&/g, "%26").replace(/#/g, "%23").replace(/\+/g, "%2B").replace(/ /g, "%20") + "' style='grid-column:" + (number(value.properties.wochentag) + 1) + ";grid-row:" + ((number(value.properties.beginn.split(":")[0]) - formula.h0) * 4 + (number(value.properties.beginn.split(":")[1]) / 15).floor() + 2) + " / " + ((number(value.properties.ende.split(":")[0]) - formula.h0) * 4 + (number(value.properties.ende.split(":")[1]) / 15).ceil() + 2) + "'><b>" + value.properties.titel + "</b><span>" + value.properties.beginn + "–" + value.properties.ende + " · " + value.properties.raum + "</span><em class='eba-ev-kurz'>" + value.properties.titel.split(" · ")[0] + "</em><small class='eba-ev-raum'>" + value.properties.raum + "</small></a>").join("")
>   karte: |-
>     html("<div class='eba-woche' lang='de' style='grid-template-rows:34px repeat(" + (formula.rows + 1) + ", " + formula.zeile + "px)'>" + if(formula.lz && number(today().format("E")) <= 5, "<i class='eba-tagspalte' style='grid-column:" + (number(today().format("E")) + 1) + "'></i>", "") + "<div class='eba-tagkopf eba-ecke' style='grid-column:1'>" + formula.semname + "</div><div class='eba-tagkopf" + if(number(today().format("E")) == 1 && today() >= formula.vb && today() <= formula.ve, " heute", "") + "' style='grid-column:2'>Mo</div><div class='eba-tagkopf" + if(number(today().format("E")) == 2 && today() >= formula.vb && today() <= formula.ve, " heute", "") + "' style='grid-column:3'>Di</div><div class='eba-tagkopf" + if(number(today().format("E")) == 3 && today() >= formula.vb && today() <= formula.ve, " heute", "") + "' style='grid-column:4'>Mi</div><div class='eba-tagkopf" + if(number(today().format("E")) == 4 && today() >= formula.vb && today() <= formula.ve, " heute", "") + "' style='grid-column:5'>Do</div><div class='eba-tagkopf" + if(number(today().format("E")) == 5 && today() >= formula.vb && today() <= formula.ve, " heute", "") + "' style='grid-column:6'>Fr</div>" + formula.stunden + "" + formula.ev + "</div>")
> views:
>   - type: list
>     name: Kennzahlen
>     order:
>       - formula.karte
> ```

> [!eba-tabelle|schlicht|umbruch]- Liste
> ```base
> filters:
>   and:
>     - 'typ == "lehrveranstaltung"'
> formulas:
>   zeit: 'tag + " " + beginn + "–" + ende'
>   was: 'file.asLink(titel)'
>   semester: 'if(file("System/Einstellungen.md").properties.semesterliste.filter(value.split("|")[1] == semester).length > 0, file("System/Einstellungen.md").properties.semesterliste.filter(value.split("|")[1] == semester)[0].split("|")[0] + ". FS · " + semester, semester)'
> properties:
>   formula.zeit:
>     displayName: Zeit
>   formula.was:
>     displayName: Veranstaltung
>   note.art:
>     displayName: Art
>   note.raum:
>     displayName: Raum
>   note.dozent:
>     displayName: Dozent/in
>   note.semester:
>     displayName: Semester
>   formula.semester:
>     displayName: Semester
> views:
>   - type: table
>     name: Nach Semester
>     groupBy:
>       property: formula.semester
>       direction: ASC
>     sort:
>       - property: wochentag
>         direction: ASC
>       - property: beginn
>         direction: ASC
>     rowHeight: medium
>     order:
>       - formula.zeit
>       - formula.was
>       - art
>       - raum
>     columnSize:
>       formula.zeit: 118
>       formula.was: 218
>       note.art: 100
>       note.raum: 163
> ```

<p class="eba-fuss">Übungs- und Tutoriengruppen: <a class="internal-link" data-href="Termine & Anmeldungen#Anmeldungen" href="Termine & Anmeldungen#Anmeldungen">Anmeldungen</a> · Gebäude und Hörsäle: <a class="internal-link" data-href="Kontakte & Links" href="Kontakte & Links">Kontakte & Links</a> · Quelle: dein Alma-Stundenplan · <a class="internal-link" data-href="Kontakte & Links#Offizielle Dokumente" href="Kontakte & Links#Offizielle Dokumente">Quellen</a></p>
