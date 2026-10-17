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

```eba-alma-knoepfe
Alma verbinden: Einstellungen & Hilfe → Verbindungen.
```

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
>   wt: |-
>     number(today().format("E"))
>   mo: |-
>     if(formula.wt >= 6, today() + duration((8 - formula.wt) + "d"), today() - duration((formula.wt - 1) + "d"))
>   tage: |-
>     [0, 1, 2, 3, 4].map((formula.mo + duration(value + "d")).format("YYYY-MM-DD"))
>   ht: |-
>     formula.wt <= 5 && formula.tage[formula.wt - 1] == today().format("YYYY-MM-DD")
>   pz: |-
>     if(formula.c.pausen.isTruthy(), formula.c.pausen, [])
>   f0: |-
>     formula.pz.filter(date(value.split("|")[0]) <= date(formula.tage[0]) && date(value.split("|")[1]) >= date(formula.tage[0])).length > 0
>   f1: |-
>     formula.pz.filter(date(value.split("|")[0]) <= date(formula.tage[1]) && date(value.split("|")[1]) >= date(formula.tage[1])).length > 0
>   f2: |-
>     formula.pz.filter(date(value.split("|")[0]) <= date(formula.tage[2]) && date(value.split("|")[1]) >= date(formula.tage[2])).length > 0
>   f3: |-
>     formula.pz.filter(date(value.split("|")[0]) <= date(formula.tage[3]) && date(value.split("|")[1]) >= date(formula.tage[3])).length > 0
>   f4: |-
>     formula.pz.filter(date(value.split("|")[0]) <= date(formula.tage[4]) && date(value.split("|")[1]) >= date(formula.tage[4])).length > 0
>   frei: |-
>     [formula.f0, formula.f1, formula.f2, formula.f3, formula.f4]
>   pw: |-
>     formula.pz.filter(date(value.split("|")[0]) <= date(formula.tage[4]) && date(value.split("|")[1]) >= date(formula.tage[0]))
>   lv: |-
>     file("Studium/Stundenplan.md").backlinks.map(value.asFile()).filter(value.properties.typ == "lehrveranstaltung" && value.properties.semester == formula.semname && value.properties.einzeltermin != true)
>   wl: |-
>     formula.lv.filter(number(value.properties.wochentag) >= 1 && number(value.properties.wochentag) <= 5 && (!value.properties.von.isTruthy() || date(value.properties.von) <= date(formula.tage[number(value.properties.wochentag) - 1])) && (!value.properties.bis.isTruthy() || date(value.properties.bis) >= date(formula.tage[number(value.properties.wochentag) - 1])))
>   wh: |-
>     formula.wl.filter(!((value.properties.ausfall.isTruthy() && value.properties.ausfall.contains(formula.tage[number(value.properties.wochentag) - 1])) || formula.frei[number(value.properties.wochentag) - 1]))
>   leer: |-
>     if(formula.wh.length > 0, "", if(formula.pw.length > 0, formula.pw[0].split("|")[2], if(date(formula.tage[4]) < formula.vb, "Vorlesungsbeginn " + formula.vb.format("DD.MM."), if(date(formula.tage[0]) > formula.ve, "Vorlesungsfrei", "Keine Veranstaltungen"))))
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
>   kopf: |-
>     ["Mo", "Di", "Mi", "Do", "Fr"].map("<div class='eba-tagkopf" + if(formula.ht && formula.wt == index + 1, " heute", "") + "' style='grid-column:" + (index + 2) + "'>" + value + "<span class='eba-tagdatum'>" + date(formula.tage[index]).format("D.M.") + "</span></div>").join("")
>   ev: |-
>     if(formula.wh.length == 0, "", formula.wl.map("<a class='eba-ev " + if(value.properties.art == "Vorlesung", "vl", "ue") + if((value.properties.ausfall.isTruthy() && value.properties.ausfall.contains(formula.tage[number(value.properties.wochentag) - 1])) || formula.frei[number(value.properties.wochentag) - 1], " ausfall", if(formula.ht && number(value.properties.wochentag) == formula.wt, " heute" + if(now().format("HH:mm") >= value.properties.beginn && now().format("HH:mm") <= value.properties.ende, " jetzt", ""), "")) + "' href='obsidian://studium-autopilot?aktion=zeigen&notiz=" + value.properties.modul.toString().replace(/^\[\[|\]\]$/g, "").replace(/%/g, "%25").replace(/&/g, "%26").replace(/#/g, "%23").replace(/\+/g, "%2B").replace(/ /g, "%20") + "' style='grid-column:" + (number(value.properties.wochentag) + 1) + ";grid-row:" + ((number(value.properties.beginn.split(":")[0]) - formula.h0) * 4 + (number(value.properties.beginn.split(":")[1]) / 15).floor() + 2) + " / " + ((number(value.properties.ende.split(":")[0]) - formula.h0) * 4 + (number(value.properties.ende.split(":")[1]) / 15).ceil() + 2) + "'><b>" + value.properties.titel + "</b><span>" + value.properties.beginn + "–" + value.properties.ende + " · " + value.properties.raum + "</span><em class='eba-ev-kurz'>" + value.properties.titel.split(" · ")[0] + "</em><small class='eba-ev-raum'>" + value.properties.raum + "</small></a>").join(""))
>   karte: |-
>     html("<div class='eba-woche' lang='de' style='grid-template-rows:34px repeat(" + (formula.rows + 1) + ", " + formula.zeile + "px)'>" + if(formula.ht, "<i class='eba-tagspalte' style='grid-column:" + (formula.wt + 1) + "'></i>", "") + "<div class='eba-tagkopf eba-ecke eba-kw' style='grid-column:1'>KW " + date(formula.tage[0]).format("W") + "</div>" + formula.kopf + formula.stunden + formula.ev + if(formula.leer != "", "<div class='eba-woche-leer' style='grid-row:2 / span " + formula.rows + "'><span>" + formula.leer + "</span></div>", "") + "</div>")
> views:
>   - type: list
>     name: Kennzahlen
>     order:
>       - formula.karte
> ```

> [!eba-karte|woche-danach]- Woche danach
> > [!eba-kennzahlen|woche]
> > ```base
> > filters:
> >   and:
> >     - file.name == "Stundenplan"
> > formulas:
> >   c: |-
> >     file("System/Einstellungen.md").properties
> >   sems: |-
> >     formula.c.semesterliste
> >   jetzt: |-
> >     formula.sems.filter(date(value.split("|")[2]) <= today() && date(value.split("|")[3]) >= today())
> >   vorstart: |-
> >     today() < date(formula.sems[0].split("|")[2])
> >   sem: |-
> >     if(formula.jetzt.length > 0, formula.jetzt[0], if(formula.vorstart, formula.sems[0], formula.sems[formula.sems.length - 1]))
> >   semname: |-
> >     formula.sem.split("|")[1]
> >   vb: |-
> >     date(formula.sem.split("|")[4])
> >   ve: |-
> >     date(formula.sem.split("|")[5])
> >   wt: |-
> >     number(today().format("E"))
> >   mo: |-
> >     if(formula.wt >= 6, today() + duration((8 - formula.wt) + "d"), today() - duration((formula.wt - 1) + "d")) + duration("7d")
> >   tage: |-
> >     [0, 1, 2, 3, 4].map((formula.mo + duration(value + "d")).format("YYYY-MM-DD"))
> >   ht: |-
> >     formula.wt <= 5 && formula.tage[formula.wt - 1] == today().format("YYYY-MM-DD")
> >   pz: |-
> >     if(formula.c.pausen.isTruthy(), formula.c.pausen, [])
> >   f0: |-
> >     formula.pz.filter(date(value.split("|")[0]) <= date(formula.tage[0]) && date(value.split("|")[1]) >= date(formula.tage[0])).length > 0
> >   f1: |-
> >     formula.pz.filter(date(value.split("|")[0]) <= date(formula.tage[1]) && date(value.split("|")[1]) >= date(formula.tage[1])).length > 0
> >   f2: |-
> >     formula.pz.filter(date(value.split("|")[0]) <= date(formula.tage[2]) && date(value.split("|")[1]) >= date(formula.tage[2])).length > 0
> >   f3: |-
> >     formula.pz.filter(date(value.split("|")[0]) <= date(formula.tage[3]) && date(value.split("|")[1]) >= date(formula.tage[3])).length > 0
> >   f4: |-
> >     formula.pz.filter(date(value.split("|")[0]) <= date(formula.tage[4]) && date(value.split("|")[1]) >= date(formula.tage[4])).length > 0
> >   frei: |-
> >     [formula.f0, formula.f1, formula.f2, formula.f3, formula.f4]
> >   pw: |-
> >     formula.pz.filter(date(value.split("|")[0]) <= date(formula.tage[4]) && date(value.split("|")[1]) >= date(formula.tage[0]))
> >   lv: |-
> >     file("Studium/Stundenplan.md").backlinks.map(value.asFile()).filter(value.properties.typ == "lehrveranstaltung" && value.properties.semester == formula.semname && value.properties.einzeltermin != true)
> >   wl: |-
> >     formula.lv.filter(number(value.properties.wochentag) >= 1 && number(value.properties.wochentag) <= 5 && (!value.properties.von.isTruthy() || date(value.properties.von) <= date(formula.tage[number(value.properties.wochentag) - 1])) && (!value.properties.bis.isTruthy() || date(value.properties.bis) >= date(formula.tage[number(value.properties.wochentag) - 1])))
> >   wh: |-
> >     formula.wl.filter(!((value.properties.ausfall.isTruthy() && value.properties.ausfall.contains(formula.tage[number(value.properties.wochentag) - 1])) || formula.frei[number(value.properties.wochentag) - 1]))
> >   leer: |-
> >     if(formula.wh.length > 0, "", if(formula.pw.length > 0, formula.pw[0].split("|")[2], if(date(formula.tage[4]) < formula.vb, "Vorlesungsbeginn " + formula.vb.format("DD.MM."), if(date(formula.tage[0]) > formula.ve, "Vorlesungsfrei", "Keine Veranstaltungen"))))
> >   h0: |-
> >     if(formula.lv.length > 0, formula.lv.map(number(value.properties.beginn.split(":")[0])).sort()[0], 8)
> >   h1: |-
> >     if(formula.lv.length > 0, formula.lv.map(number(value.properties.ende.split(":")[0]) + if(number(value.properties.ende.split(":")[1]) > 0, 1, 0)).sort().reverse()[0], 18)
> >   rows: |-
> >     (formula.h1 - formula.h0) * 4
> >   zeile: |-
> >     ((697 / (formula.rows + 1)) * 100).round() / 100
> >   stunden: |-
> >     [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22].filter(value >= formula.h0 && value <= formula.h1).map("<span class='eba-zeit' style='grid-row:" + ((value - formula.h0) * 4 + 2) + "'>" + if(value < 10, "0", "") + value + "</span><i class='eba-linie' style='grid-row:" + ((value - formula.h0) * 4 + 2) + "'></i>").join("")
> >   kopf: |-
> >     ["Mo", "Di", "Mi", "Do", "Fr"].map("<div class='eba-tagkopf" + if(formula.ht && formula.wt == index + 1, " heute", "") + "' style='grid-column:" + (index + 2) + "'>" + value + "<span class='eba-tagdatum'>" + date(formula.tage[index]).format("D.M.") + "</span></div>").join("")
> >   ev: |-
> >     if(formula.wh.length == 0, "", formula.wl.map("<a class='eba-ev " + if(value.properties.art == "Vorlesung", "vl", "ue") + if((value.properties.ausfall.isTruthy() && value.properties.ausfall.contains(formula.tage[number(value.properties.wochentag) - 1])) || formula.frei[number(value.properties.wochentag) - 1], " ausfall", if(formula.ht && number(value.properties.wochentag) == formula.wt, " heute" + if(now().format("HH:mm") >= value.properties.beginn && now().format("HH:mm") <= value.properties.ende, " jetzt", ""), "")) + "' href='obsidian://studium-autopilot?aktion=zeigen&notiz=" + value.properties.modul.toString().replace(/^\[\[|\]\]$/g, "").replace(/%/g, "%25").replace(/&/g, "%26").replace(/#/g, "%23").replace(/\+/g, "%2B").replace(/ /g, "%20") + "' style='grid-column:" + (number(value.properties.wochentag) + 1) + ";grid-row:" + ((number(value.properties.beginn.split(":")[0]) - formula.h0) * 4 + (number(value.properties.beginn.split(":")[1]) / 15).floor() + 2) + " / " + ((number(value.properties.ende.split(":")[0]) - formula.h0) * 4 + (number(value.properties.ende.split(":")[1]) / 15).ceil() + 2) + "'><b>" + value.properties.titel + "</b><span>" + value.properties.beginn + "–" + value.properties.ende + " · " + value.properties.raum + "</span><em class='eba-ev-kurz'>" + value.properties.titel.split(" · ")[0] + "</em><small class='eba-ev-raum'>" + value.properties.raum + "</small></a>").join(""))
> >   karte: |-
> >     html("<div class='eba-woche' lang='de' style='grid-template-rows:34px repeat(" + (formula.rows + 1) + ", " + formula.zeile + "px)'>" + if(formula.ht, "<i class='eba-tagspalte' style='grid-column:" + (formula.wt + 1) + "'></i>", "") + "<div class='eba-tagkopf eba-ecke eba-kw' style='grid-column:1'>KW " + date(formula.tage[0]).format("W") + "</div>" + formula.kopf + formula.stunden + formula.ev + if(formula.leer != "", "<div class='eba-woche-leer' style='grid-row:2 / span " + formula.rows + "'><span>" + formula.leer + "</span></div>", "") + "</div>")
> > views:
> >   - type: list
> >     name: Kennzahlen
> >     order:
> >       - formula.karte
> > ```

> [!eba-tabelle|schlicht|umbruch]- Liste
> ```base
> filters:
>   and:
>     - 'typ == "lehrveranstaltung"'
> formulas:
>   zeit: 'tag + " " + beginn + "–" + ende'
>   zeitraum: 'if(einzeltermin == true && von.isTruthy(), date(von).format("DD.MM."), if(von.isTruthy() && bis.isTruthy(), date(von).format("DD.MM.") + "–" + date(bis).format("DD.MM."), if(von.isTruthy(), "ab " + date(von).format("DD.MM."), if(bis.isTruthy(), "bis " + date(bis).format("DD.MM."), ""))))'
>   was: 'file.asLink(titel)'
>   semester: 'if(file("System/Einstellungen.md").properties.semesterliste.filter(value.split("|")[1] == semester).length > 0, file("System/Einstellungen.md").properties.semesterliste.filter(value.split("|")[1] == semester)[0].split("|")[0] + ". FS · " + semester, semester)'
> properties:
>   formula.zeitraum:
>     displayName: Zeitraum
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
>       - formula.zeitraum
>       - raum
>     columnSize:
>       formula.zeit: 118
>       formula.was: 218
>       formula.zeitraum: 100
>       note.raum: 163
> ```
