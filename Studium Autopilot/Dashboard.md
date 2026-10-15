---
typ: "dashboard"
tags:
  - "dashboard"
cssclasses:
  - "eba"
  - "eba-weit"
  - "eba-s-dashboard"
---

<div class="eba-pfad eba-pfad-start"><span>Economics and Business Administration (B.Sc.)</span><span>Universität Tübingen</span><span>PO 2023</span></div>

```eba-update-hinweis
```

> [!eba-kennzahlen]
> ```base
> filters:
>   and:
>     - file.name == "Dashboard"
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
>   fs: |-
>     number(formula.sem.split("|")[0])
>   semname: |-
>     formula.sem.split("|")[1]
>   sb: |-
>     date(formula.sem.split("|")[2])
>   se: |-
>     date(formula.sem.split("|")[3])
>   vb: |-
>     date(formula.sem.split("|")[4])
>   ve: |-
>     date(formula.sem.split("|")[5])
>   var: |-
>     if(formula.c.variante, formula.c.variante, "offen")
>   m: |-
>     file("Studium/Noten & ECTS.md").backlinks.map(value.asFile()).filter(value.properties.typ == "modul")
>   fertig: |-
>     formula.m.filter(["bestanden", "anerkannt"].contains(value.properties.status.toString().lower().trim()) && value.properties.zusatz != true)
>   sqm: |-
>     formula.m.filter(value.properties.code == "SQ100" && !["bestanden", "anerkannt"].contains(value.properties.status.toString().lower().trim()))
>   sqteil: |-
>     if(formula.sqm.length > 0, min(9, file("Module/4 Schlüsselqualifikation & Abschluss/SQ100 Schlüsselqualifikation.md").backlinks.map(value.asFile()).filter(value.properties.typ == "sq_kurs" && ["bestanden", "anerkannt"].contains(value.properties.status.toString().lower().trim())).reduce(acc + number(value.properties.ects), 0)), 0)
>   ects: |-
>     formula.fertig.reduce(acc + number(value.properties.ects), 0) + formula.sqteil
>   benotet: |-
>     formula.fertig.filter(value.properties.ergebnis && value.properties.notenblock != "–" && /^\s*[1-5]([.,][0-9]+)?\s*$/.matches(value.properties.ergebnis.toString()))
>   ungueltig: |-
>     formula.fertig.filter(value.properties.ergebnis && value.properties.notenblock != "–" && !/^\s*[1-5]([.,][0-9]+)?\s*$/.matches(value.properties.ergebnis.toString()))
>   b34: |-
>     formula.benotet.filter(if((value.properties.gruppe == "Profil & Vertiefung" && ((formula.var == "Economics" && value.properties.rolle_economics == "Elective Studies") || (formula.var == "Business Administration" && value.properties.rolle_ba == "Elective Studies") || (value.properties.anrechnung == "Elective Studies" && !(formula.var == "Economics" && value.properties.rolle_economics == "Pflicht") && !(formula.var == "Business Administration" && value.properties.rolle_ba == "Pflicht")))), "66 %", value.properties.notenblock) == "34 %")
>   b66: |-
>     formula.benotet.filter(if((value.properties.gruppe == "Profil & Vertiefung" && ((formula.var == "Economics" && value.properties.rolle_economics == "Elective Studies") || (formula.var == "Business Administration" && value.properties.rolle_ba == "Elective Studies") || (value.properties.anrechnung == "Elective Studies" && !(formula.var == "Economics" && value.properties.rolle_economics == "Pflicht") && !(formula.var == "Business Administration" && value.properties.rolle_ba == "Pflicht")))), "66 %", value.properties.notenblock) == "66 %")
>   w34: |-
>     formula.b34.reduce(acc + number(value.properties.ects), 0)
>   s34: |-
>     formula.b34.reduce(acc + number(value.properties.ects) * number(value.properties.ergebnis.toString().replace(",", ".")), 0)
>   w66: |-
>     formula.b66.reduce(acc + number(value.properties.ects), 0)
>   s66: |-
>     formula.b66.reduce(acc + number(value.properties.ects) * number(value.properties.ergebnis.toString().replace(",", ".")), 0)
>   d34: |-
>     if(formula.w34 > 0, formula.s34 / formula.w34, 0)
>   d66: |-
>     if(formula.w66 > 0, formula.s66 / formula.w66, 0)
>   gesamt: |-
>     if(formula.w34 > 0 && formula.w66 > 0, 0.66 * formula.d66 + 0.34 * formula.d34, if(formula.w34 > 0, formula.d34, formula.d66))
>   note: |-
>     if(formula.w34 + formula.w66 == 0, "–", ((formula.gesamt * 100 + 0.000001).floor() / 100).toFixed(2).replace(".", ","))
>   notesub: |-
>     if(formula.ungueltig.length > 0, if(formula.ungueltig.length == 1, "Note ungültig: ", "Noten ungültig: ") + formula.ungueltig.map(value.properties.code).join(", "), if(formula.w34 + formula.w66 == 0, "noch keine Noten eingetragen", if(formula.w66 == 0, "vorläufig · nur 34 %-Block", if(formula.w34 == 0, "vorläufig · nur 66 %-Block", "gewichtet nach § 13 PO"))))
>   op: |-
>     min(4, formula.m.filter(value.properties.op_modul == true && ["bestanden", "anerkannt"].contains(value.properties.status.toString().lower().trim())).length)
>   t: |-
>     file("Studium/Prüfungen.md").backlinks.map(value.asFile()).filter(value.properties.typ == "termin" && value.properties.erledigt != true)
>   pt: |-
>     formula.t.filter(value.properties.kategorie == "Prüfung" && value.properties.datum && !value.properties.bis.isTruthy() && !(value.properties.titel && value.properties.titel.toString().lower().contains("nachhol")) && date(value.properties.datum) >= today())
>   ptk: |-
>     formula.pt.map(value.properties.code + "|" + date(value.properties.datum).format("YYYY-MM-DD"))
>   kl: |-
>     [formula.m.filter(value.properties.klausur && date(value.properties.klausur) >= today() && !["bestanden", "anerkannt"].contains(value.properties.status.toString().lower().trim()) && !formula.ptk.contains(value.properties.code + "|" + date(value.properties.klausur).format("YYYY-MM-DD"))).map(date(value.properties.klausur).format("YYYY-MM-DD") + "|" + value.properties.code + " · " + value.properties.titel), formula.pt.map(date(value.properties.datum).format("YYYY-MM-DD") + "|" + value.properties.titel)].flat().sort()
>   gs: |-
>     formula.sb - duration((number(formula.sb.format("E")) - 1) + "d")
>   nw: |-
>     ((((formula.se - formula.gs).days).round() + 1) / 7).ceil()
>   ti: |-
>     ((((today() - formula.gs).days).round()) / 7).floor()
>   pz: |-
>     formula.c.pausen.filter(date(value.split("|")[0]) >= formula.sb && date(value.split("|")[0]) <= formula.se)
>   ps: |-
>     if(formula.pz.length > 0, date(formula.pz[0].split("|")[0]), date("1900-01-01"))
>   pe: |-
>     if(formula.pz.length > 0, date(formula.pz[0].split("|")[1]), date("1900-01-01"))
>   kz: |-
>     formula.c.pruefungsphasen.filter(date(value.split("|")[0]) <= formula.se && date(value.split("|")[1]) >= formula.sb)
>   k0s: |-
>     if(formula.kz.length > 0, date(formula.kz[0].split("|")[0]), date("1900-01-01"))
>   k0e: |-
>     if(formula.kz.length > 0, date(formula.kz[0].split("|")[1]), date("1900-01-01"))
>   k1s: |-
>     if(formula.kz.length > 1, date(formula.kz[1].split("|")[0]), date("1900-01-01"))
>   k1e: |-
>     if(formula.kz.length > 1, date(formula.kz[1].split("|")[1]), date("1900-01-01"))
>   k2s: |-
>     if(formula.kz.length > 2, date(formula.kz[2].split("|")[0]), date("1900-01-01"))
>   k2e: |-
>     if(formula.kz.length > 2, date(formula.kz[2].split("|")[1]), date("1900-01-01"))
>   wochen: |-
>     "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx".split("").slice(0, formula.nw).map("<i class='" + if(((formula.gs + duration((index * 7) + "d")) <= formula.k0e && (formula.gs + duration((index * 7 + 6) + "d")) >= formula.k0s) || ((formula.gs + duration((index * 7) + "d")) <= formula.k1e && (formula.gs + duration((index * 7 + 6) + "d")) >= formula.k1s) || ((formula.gs + duration((index * 7) + "d")) <= formula.k2e && (formula.gs + duration((index * 7 + 6) + "d")) >= formula.k2s), "p", if((formula.gs + duration((index * 7 + 3) + "d")) >= formula.ps && (formula.gs + duration((index * 7 + 3) + "d")) <= formula.pe, "w", if((formula.gs + duration((index * 7 + 6) + "d")) >= formula.vb && (formula.gs + duration((index * 7) + "d")) <= formula.ve, "v", "f"))) + if(index < formula.ti, " vorbei", if(index == formula.ti, " jetzt", "")) + "' title='KW " + (formula.gs + duration((index * 7) + "d")).format("W") + " · " + (formula.gs + duration((index * 7) + "d")).format("DD.MM.") + "–" + (formula.gs + duration((index * 7 + 6) + "d")).format("DD.MM.") + "'></i>").join("")
>   vw0: |-
>     formula.vb - duration((number(formula.vb.format("E")) - 1) + "d")
>   vti: |-
>     ((((today() - formula.vw0).days).round()) / 7).floor()
>   vnw: |-
>     ((((formula.ve - formula.vw0).days).round() + 1) / 7).ceil()
>   pwa: |-
>     if(formula.pz.length > 0, ((((formula.ps - formula.vw0).days).round()) / 7).ceil(), 999)
>   pwb: |-
>     if(formula.pz.length > 0, ((((formula.pe - formula.vw0).days).round() - 4) / 7).floor(), -1)
>   vnr: |-
>     formula.vti + 1 - max(0, min(formula.pwb, formula.vti) - formula.pwa + 1)
>   vges: |-
>     formula.vnw - max(0, min(formula.pwb, formula.vnw - 1) - formula.pwa + 1)
>   inph: |-
>     (today() >= formula.k0s && today() <= formula.k0e) || (today() >= formula.k1s && today() <= formula.k1e) || (today() >= formula.k2s && today() <= formula.k2e)
>   phbis: |-
>     if(today() >= formula.k0s && today() <= formula.k0e, formula.k0e, if(today() >= formula.k1s && today() <= formula.k1e, formula.k1e, formula.k2e))
>   wochetext: |-
>     if(formula.pz.length > 0 && today() >= formula.ps && today() <= formula.pe, formula.pz[0].split("|")[2] + " bis " + formula.pe.format("DD.MM."), if(formula.inph && (today() < formula.vb || today() > formula.ve), "Prüfungsphase bis " + formula.phbis.format("DD.MM."), if(today() < formula.vb, if(formula.tb == 0, "Vorlesungsbeginn heute", if(formula.tb == 1, "Vorlesungsbeginn morgen", "noch " + formula.tb + " Tage bis Vorlesungsbeginn")), if(today() <= formula.ve, "Vorlesungswoche " + formula.vnr + " von " + formula.vges + if(formula.inph, " · Prüfungsphase", ""), "vorlesungsfrei"))))
>   h: |-
>     number(now().format("H"))
>   gruss: |-
>     if(formula.h < 5, "Gute Nacht", if(formula.h < 11, "Guten Morgen", if(formula.h < 18, "Guten Tag", "Guten Abend"))) + if(formula.c.name, ", " + formula.c.name, "")
>   datum: |-
>     "<b>" + ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"][number(today().format("d"))] + ", " + today().format("D") + ". " + ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"][number(today().format("M")) - 1] + " " + today().format("YYYY") + "</b> · KW " + today().format("W")
>   tb: |-
>     ((formula.vb - today()).days).round()
>   te: |-
>     ((formula.ve - today()).days).round()
>   tse: |-
>     ((formula.se - today()).days).round()
>   phase: |-
>     if(formula.vorstart, "vor Studienbeginn", if(today() < formula.vb, "Vorlesungsfrei", if(today() <= formula.ve, "Vorlesungszeit", "Vorlesungsfreie Zeit")))
>   phasesub: |-
>     if(today() < formula.vb, "Vorlesungsbeginn " + if((formula.tb) == 0, "heute", if((formula.tb) == 1, "morgen", if((formula.tb) < 0, "vorbei", "in " + (formula.tb) + " Tagen"))), if(today() <= formula.ve, "noch " + formula.te + " Tage Vorlesungen", "Semesterende " + if((formula.tse) == 0, "heute", if((formula.tse) == 1, "morgen", if((formula.tse) < 0, "vorbei", "in " + (formula.tse) + " Tagen")))))
>   sempct: |-
>     max(0, min(100, (((today() - formula.sb).days) / ((formula.se - formula.sb).days) * 100).round()))
>   k0: |-
>     if(formula.kl.length > 0, formula.kl[0], "")
>   kt: |-
>     if(formula.k0, ((date(formula.k0.split("|")[0]) - today()).days).round(), 0)
>   karte: |-
>     html("<div class='eba-kz'><div class='eba-kz-kopf'><h1 class='eba-kz-gruss'>" + formula.gruss + "</h1><span class='eba-kz-datum'>" + formula.datum + "</span></div><div class='eba-kz-reihe vier'>" + "<div class='eba-kachel akzent'><span class='k'>" + "Nächste Prüfung" + "</span><span class='v text'>" + if(formula.k0, formula.k0.split("|")[1], "noch kein Termin") + "</span><span class='s'>" + if(formula.k0, date(formula.k0.split("|")[0]).format("DD.MM.") + " · " + if((formula.kt) == 0, "heute", if((formula.kt) == 1, "morgen", if((formula.kt) < 0, "vorbei", "in " + (formula.kt) + " Tagen"))), "Termine ab ca. Mitte Nov. bzw. Mai") + "</span>" + "" + "</div>" + "<div class='eba-kachel'><span class='k'>" + "Semester" + "</span><span class='v'>" + if(formula.vorstart, "Start <small>" + if((((formula.sb - today()).days).round()) == 0, "heute", if((((formula.sb - today()).days).round()) == 1, "morgen", if((((formula.sb - today()).days).round()) < 0, "vorbei", "in " + (((formula.sb - today()).days).round()) + " Tagen"))) + "</small>", formula.fs + ". FS <small>" + formula.semname + "</small>") + "</span><span class='s'>" + if(formula.vorstart, formula.phasesub, formula.phase + " · " + formula.phasesub) + "</span>" + "<progress max='100' value='" + formula.sempct + "'></progress>" + "</div>" + "<div class='eba-kachel'><span class='k'>" + "ECTS" + "</span><span class='v'>" + formula.ects + "<small>/ 180</small>" + "</span><span class='s'>" + "Orientierungsprüfung " + formula.op + " / 4" + "</span>" + "<progress max='180' value='" + formula.ects + "'></progress>" + "</div>" + "<div class='eba-kachel'><span class='k'>" + "Notenschnitt" + "</span><span class='v'>" + formula.note + "</span><span class='s'>" + formula.notesub + "</span>" + "" + "</div>" + "</div><div class='eba-leiste'><div class='eba-leiste-kopf'><span class='k'>" + formula.semname + " · Semesterverlauf</span><span class='s'><b>" + formula.wochetext + "</b></span></div><div class='eba-wochen'>" + formula.wochen + "</div><div class='eba-legende'><span class='v'>Vorlesungszeit</span><span class='w'>Ferien</span><span class='p'>Prüfungen" + if(formula.kz.slice(0, 3).filter(value.split("|")[3].trim() == "geschätzt").length > 0, " (geschätzt)", "") + "</span><span>vorlesungsfrei</span><span class='jetzt'>diese Woche</span></div></div></div>")
> properties:
>   formula.karte:
>     displayName: Übersicht
> views:
>   - type: list
>     name: Übersicht
>     order:
>       - formula.karte
> ```

> [!eba-neu|ohne-titel]
> - [Vorlesung](obsidian://studium-autopilot?aktion=vorlesung)
> - [Übungsblatt](obsidian://studium-autopilot?aktion=uebungsblatt)
> - [Unterlagen](obsidian://studium-autopilot?aktion=einordnen)


> [!eba-kennzahlen|woche kurz]
> ```eba-schloss alma
> ```
> ```base
> filters:
>   and:
>     - file.name == "Dashboard"
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
>     ((497 / (formula.rows + 1)) * 100).round() / 100
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

> [!eba-raster|2]
> > [!eba-termin|schlicht|umbruch|handy-zu]+ Fristen · 30 Tage
> > ```base
> > filters:
> >   or:
> >     - and:
> >         - 'typ == "termin"'
> >         - '["Frist", "Prüfung"].contains(kategorie)'
> >         - 'erledigt != true'
> >         - 'date(datum) <= today() + duration("30d")'
> >         - 'date(if(bis, bis, datum)) >= today()'
> >     - and:
> >         - 'typ == "übungsblatt"'
> >         - '!["abgegeben", "korrigiert"].contains(status.toString().lower().trim())'
> >         - 'faellig'
> >         - 'date(faellig) <= today() + duration("30d")'
> >     - and:
> >         - 'typ == "modul"'
> >         - 'klausur'
> >         - 'date(klausur) >= today()'
> >         - 'date(klausur) <= today() + duration("30d")'
> >         - '!file("Studium/Prüfungen.md").backlinks.map(value.asFile()).filter(value.properties.typ == "termin" && value.properties.kategorie == "Prüfung" && value.properties.datum).map(value.properties.code + "|" + date(value.properties.datum).format("YYYY-MM-DD")).contains(code + "|" + date(klausur).format("YYYY-MM-DD"))'
> > formulas:
> >   wann: 'date(if(typ == "übungsblatt", faellig, if(typ == "modul", klausur, datum)))'
> >   was: 'file.asLink(if(typ == "modul", "Prüfung " + code, if(typ == "übungsblatt", code + " · Blatt " + nummer, titel.toString().replace(" (ILIAS)", ""))))'
> >   tage: '((formula.wann - today()).days).round()'
> >   zeit: 'if(ort && ort.toString().split(" · ")[0].contains(":"), ort.toString().split(" · ")[0], "")'
> >   tagText: 'if(typ == "übungsblatt" && formula.tage < 0, "überfällig", if(formula.tage < 0, "läuft bis " + ["So","Mo","Di","Mi","Do","Fr","Sa"][number(date(bis).format("d"))] + " " + date(bis).format("DD.MM."), if(formula.tage == 0, "Heute", if(formula.tage == 1, "Morgen", ["So","Mo","Di","Mi","Do","Fr","Sa"][number(formula.wann.format("d"))] + " " + formula.wann.format("DD.MM.")))))'
> >   wannText: 'html("<span class=\"eba-wann" + if(formula.tage == 0 || formula.tage == 1, " eba-bald", "") + "\">" + formula.tagText + if(formula.zeit, "<span class=\"eba-uhr\"> · " + formula.zeit + "</span>", "") + "</span>")'
> >   wie: 'if(typ == "übungsblatt" && formula.tage < 0, "überfällig", if(formula.tage < 0, "läuft bis " + date(bis).format("DD.MM."), if(formula.tage == 0, "heute", if(formula.tage == 1, "morgen", "in " + formula.tage + " Tagen"))))'
> >   art: 'html("<span class=\"eba-pill " + if(typ == "modul" || kategorie == "Prüfung", "bad", if(typ == "übungsblatt" || kategorie == "Frist", "warn", if(kategorie == "Fachschaft", "akzent", "info"))) + if(status == "geschätzt", " leer", "") + "\">" + if(typ == "modul", "Prüfung", if(typ == "übungsblatt", "Abgabe", kategorie)) + if(bereich == "schluesselqualifikation", " · freiwillig", "") + if(status == "geschätzt", " · geschätzt", "") + "</span>")'
> > properties:
> >   formula.wannText:
> >     displayName: Wann
> >   formula.wann:
> >     displayName: Datum
> >   formula.was:
> >     displayName: Was
> >   formula.wie:
> >     displayName: Wann
> >   formula.art:
> >     displayName: Art
> > views:
> >   - type: list
> >     name: Fristen
> >     rowHeight: medium
> >     sort:
> >       - property: formula.wann
> >         direction: ASC
> >     limit: 6
> >     order:
> >       - formula.wannText
> >       - formula.was
> >       - formula.art
> >     columnSize:
> >       formula.wannText: 150
> >       formula.was: 250
> >       formula.art: 110
> > ```
>
> > [!eba-termin|schlicht|umbruch|handy-zu]+ Termine · 14 Tage
> > ```base
> > filters:
> >   or:
> >     - and:
> >         - 'typ == "termin"'
> >         - '!["Fachschaft", "Veranstaltung", "Frist", "Prüfung"].contains(kategorie)'
> >         - 'erledigt != true'
> >         - 'date(datum) <= today() + duration("14d")'
> >         - 'date(if(bis, bis, datum)) >= today()'
> > formulas:
> >   wann: 'date(if(typ == "übungsblatt", faellig, if(typ == "modul", klausur, datum)))'
> >   was: 'file.asLink(if(typ == "modul", "Prüfung " + code, if(typ == "übungsblatt", code + " · Blatt " + nummer, titel.toString().replace(" (ILIAS)", ""))))'
> >   tage: '((formula.wann - today()).days).round()'
> >   zeit: 'if(ort && ort.toString().split(" · ")[0].contains(":"), ort.toString().split(" · ")[0], "")'
> >   tagText: 'if(typ == "übungsblatt" && formula.tage < 0, "überfällig", if(formula.tage < 0, "läuft bis " + ["So","Mo","Di","Mi","Do","Fr","Sa"][number(date(bis).format("d"))] + " " + date(bis).format("DD.MM."), if(formula.tage == 0, "Heute", if(formula.tage == 1, "Morgen", ["So","Mo","Di","Mi","Do","Fr","Sa"][number(formula.wann.format("d"))] + " " + formula.wann.format("DD.MM.")))))'
> >   wannText: 'html("<span class=\"eba-wann" + if(formula.tage == 0 || formula.tage == 1, " eba-bald", "") + "\">" + formula.tagText + if(formula.zeit, "<span class=\"eba-uhr\"> · " + formula.zeit + "</span>", "") + "</span>")'
> >   wie: 'if(typ == "übungsblatt" && formula.tage < 0, "überfällig", if(formula.tage < 0, "läuft bis " + date(bis).format("DD.MM."), if(formula.tage == 0, "heute", if(formula.tage == 1, "morgen", "in " + formula.tage + " Tagen"))))'
> >   art: 'html("<span class=\"eba-pill " + if(typ == "modul" || kategorie == "Prüfung", "bad", if(typ == "übungsblatt" || kategorie == "Frist", "warn", if(kategorie == "Fachschaft", "akzent", "info"))) + if(status == "geschätzt", " leer", "") + "\">" + if(typ == "modul", "Prüfung", if(typ == "übungsblatt", "Abgabe", kategorie)) + if(bereich == "schluesselqualifikation", " · freiwillig", "") + if(status == "geschätzt", " · geschätzt", "") + "</span>")'
> > properties:
> >   formula.wannText:
> >     displayName: Wann
> >   formula.wann:
> >     displayName: Datum
> >   formula.was:
> >     displayName: Was
> >   formula.wie:
> >     displayName: Wann
> >   formula.art:
> >     displayName: Art
> > views:
> >   - type: list
> >     name: Termine
> >     rowHeight: medium
> >     sort:
> >       - property: formula.wann
> >         direction: ASC
> >     limit: 6
> >     order:
> >       - formula.wannText
> >       - formula.was
> >       - formula.art
> >     columnSize:
> >       formula.wannText: 150
> >       formula.was: 250
> >       formula.art: 110
> > ```


## Zu erledigen

> [!eba-tabelle|schlicht|handy-zu]+ Nachzuarbeiten
> ```base
> filters:
>   and:
>     - 'typ == "vorlesung"'
>     - 'nachgearbeitet != true'
> formulas:
>   datumText: 'if(datum, date(datum).format("DD.MM.YYYY"), "")'
> properties:
>   file.name:
>     displayName: Vorlesung
>   formula.datumText:
>     displayName: Datum
>   note.nachgearbeitet:
>     displayName: Erledigt
> views:
>   - type: list
>     name: Nachzuarbeiten
>     order:
>       - file.name
>       - formula.datumText
>       - nachgearbeitet
>     sort:
>       - property: datum
>         direction: ASC
>     limit: 8
>     columnSize:
>       file.name: 380
>       formula.datumText: 120
>       note.nachgearbeitet: 110
> ```

> [!eba-raster|2]
> > [!eba-fragen|handy-zu]+ Offene Fragen
> > ```eba-todos fragen
> > Offene Fragen erscheinen, sobald Studium Autopilot läuft.
> > ```
>
> > [!eba-todo|handy-zu]+ To-dos
> > ```eba-todos
> > To-dos erscheinen, sobald Studium Autopilot läuft.
> > ```

> [!eba-tabelle|schlicht|handy-zu]+ Im Eingang
> ```base
> filters:
>   and:
>     - file.inFolder("Eingang")
>     - 'file.ext != "md"'
> properties:
>   file.name:
>     displayName: Datei
>   file.ctime:
>     displayName: Angekommen
> views:
>   - type: list
>     name: Im Eingang
>     order:
>       - file.name
>       - file.ctime
>     sort:
>       - property: file.ctime
>         direction: DESC
>     limit: 5
>     columnSize:
>       file.name: 360
>       file.ctime: 150
> ```
