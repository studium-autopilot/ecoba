---
typ: "übersicht"
tags:
  - "übersicht"
cssclasses:
  - "eba"
  - "eba-weit"
  - "eba-s-noten"
---

<div class="eba-kopf">
<div class="eba-pfad"><a class="internal-link" data-href="Dashboard" href="Dashboard">Dashboard</a><span>Studium</span></div>
<h1>Noten & ECTS</h1>
</div>

> [!eba-kennzahlen|kz-noten]
> ```base
> filters:
>   and:
>     - file.name == "Noten & ECTS"
> formulas:
>   c: |-
>     file("System/Einstellungen.md").properties
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
>   n34: |-
>     if(formula.w34 == 0, "–", ((formula.d34 * 100 + 0.000001).floor() / 100).toFixed(2).replace(".", ","))
>   n66: |-
>     if(formula.w66 == 0, "–", ((formula.d66 * 100 + 0.000001).floor() / 100).toFixed(2).replace(".", ","))
>   notesub: |-
>     if(formula.ungueltig.length > 0, if(formula.ungueltig.length == 1, "Note ungültig: ", "Noten ungültig: ") + formula.ungueltig.map(value.properties.code).join(", "), if(formula.w34 + formula.w66 == 0, "noch keine Noten eingetragen", if(formula.w66 == 0, "vorläufig · nur 34 %-Block", if(formula.w34 == 0, "vorläufig · nur 66 %-Block", "gewichtet nach § 13 PO"))))
>   op: |-
>     min(4, formula.m.filter(value.properties.op_modul == true && ["bestanden", "anerkannt"].contains(value.properties.status.toString().lower().trim())).length)
>   ziel: |-
>     if(formula.c.zielnote && /^\s*[0-9]([.,][0-9]+)?\s*$/.matches(formula.c.zielnote.toString()), number(formula.c.zielnote.toString().replace(",", ".")), 0)
>   zielok: |-
>     formula.ziel >= 1 && formula.ziel <= 4
>   ist: |-
>     (formula.gesamt * 100 + 0.000001).floor() / 100
>   t34: |-
>     if(formula.var == "Economics", 84, 96)
>   t66: |-
>     if(formula.var == "Economics", 87, 75)
>   rest: |-
>     0.34 * (formula.t34 - formula.w34) / formula.t34 + 0.66 * (formula.t66 - formula.w66) / formula.t66
>   fix: |-
>     0.34 * formula.s34 / formula.t34 + 0.66 * formula.s66 / formula.t66
>   noetig: |-
>     if(formula.rest > 0, (formula.ziel - formula.fix) / formula.rest, 0)
>   noetigtxt: |-
>     ((formula.noetig * 100 + 0.000001).floor() / 100).toFixed(2).replace(".", ",")
>   zieltxt: |-
>     if(((formula.ziel * 10).round() - formula.ziel * 10).abs() < 0.000001, formula.ziel.toFixed(1), formula.ziel.toFixed(2)).replace(".", ",")
>   rechner: |-
>     if(!formula.zielok, if(formula.c.zielnote, "Keine gültige Zielnote eingetragen. Du stellst sie in den Einstellungen ein.", "Noch keine Zielnote eingetragen. Du stellst sie in den Einstellungen ein."), if(formula.rest <= 0, if(formula.ist <= formula.ziel + 0.000001, "Die Zielnote <b>" + formula.zieltxt + "</b> ist erreicht: Gesamtnote <b>" + formula.note + "</b>.", "Die Zielnote " + formula.zieltxt + " ist nicht erreicht: Gesamtnote <b>" + formula.note + "</b>."), if(formula.noetig < 1, "Mit dem bisherigen Stand ist die Zielnote " + formula.zieltxt + " rechnerisch nicht mehr erreichbar.", if(formula.noetig >= 4, "Die Zielnote " + formula.zieltxt + " ist sicher, solange du die restlichen Module bestehst.", "Für die Zielnote <b>" + formula.zieltxt + "</b> brauchst du in den restlichen Modulen im Schnitt <b>" + formula.noetigtxt + "</b>."))))
>   annahme: |-
>     "Annahme: Variante " + if(formula.var == "offen", "noch offen", formula.var) + ", restliche Module benotet"
>   karte: |-
>     html("<div class='eba-kz'><div class='eba-kz-reihe vier'>" + "<div class='eba-kachel akzent'><span class='k'>" + "Gesamtnote" + "</span><span class='v'>" + formula.note + "</span><span class='s'>" + formula.notesub + "</span>" + "" + "</div>" + "<div class='eba-kachel'><span class='k'>" + "Ø 34 %-Block" + "</span><span class='v'>" + formula.n34 + "</span><span class='s'>" + formula.w34 + " ECTS gewichtet" + "</span>" + "" + "</div>" + "<div class='eba-kachel'><span class='k'>" + "Ø 66 %-Block" + "</span><span class='v'>" + formula.n66 + "</span><span class='s'>" + formula.w66 + " ECTS gewichtet" + "</span>" + "" + "</div>" + "<div class='eba-kachel'><span class='k'>" + "ECTS" + "</span><span class='v'>" + formula.ects + "<small>/ 180</small>" + "</span><span class='s'>" + "Orientierungsprüfung " + formula.op + " / 4" + "</span>" + "<progress max='180' value='" + formula.ects + "'></progress>" + "</div>" + "</div><div class='eba-leiste eba-rechner'><div class='eba-leiste-kopf'><span class='k'>Zielnote</span><span class='s'>" + formula.annahme + "</span></div><p>" + formula.rechner + "</p></div></div>")
> views:
>   - type: list
>     name: Kennzahlen
>     order:
>       - formula.karte
> ```


## Module

> [!eba-tabelle|schlicht|ohne-titel|umbruch]
> ```base
> filters:
>   and:
>     - 'typ == "modul"'
> formulas:
>   stand: 'html("<span class=\"eba-pill " + if(["bestanden", "anerkannt"].contains(status.toString().lower().trim()), "ok", if(status.toString().lower().trim() == "nicht bestanden", "bad", if(status.toString().lower().trim() == "angemeldet", "ok", if(status.toString().lower().trim() == "läuft", "info", "leer")))) + "\">" + if(status, status, "offen") + "</span>")'
>   var: 'file("System/Einstellungen.md").properties.variante'
>   block: 'if((gruppe == "Profil & Vertiefung" && ((formula.var == "Economics" && rolle_economics == "Elective Studies") || (formula.var == "Business Administration" && rolle_ba == "Elective Studies") || (anrechnung == "Elective Studies" && !(formula.var == "Economics" && rolle_economics == "Pflicht") && !(formula.var == "Business Administration" && rolle_ba == "Pflicht")))), "66 %", notenblock)'
>   imPlan: 'zusatz != true && (gewaehlt == true || semester_geplant.isTruthy() || (status.isTruthy() && status.toString().lower().trim() != "offen") || gruppe == "Grundstudium" || gruppe == "Abschluss" || (gruppe == "Profil & Vertiefung" && if(formula.var == "Economics", rolle_economics == "Pflicht", if(formula.var == "Business Administration", rolle_ba == "Pflicht", if(formula.var == "ohne Spezialisierung", rolle_ohne == "Pflicht", rolle_economics == "Pflicht" && rolle_ba == "Pflicht" && rolle_ohne == "Pflicht")))))'
>   fertig: '["bestanden", "anerkannt"].contains(status.toString().lower().trim())'
>   nb: 'status.toString().lower().trim() == "nicht bestanden"'
>   kq: 'file("Studium/Prüfungen.md").backlinks.map(value.asFile()).filter(value.properties.typ == "termin" && value.properties.kategorie == "Prüfung" && value.properties.code == code && value.properties.datum && !value.properties.bis.isTruthy() && value.properties.entfaellt != true && !value.properties.titel.toString().lower().contains("zwischentest") && !value.name.lower().contains("zwischentest") && (formula.nb || (!value.properties.titel.toString().lower().contains("nachhol") && !value.name.lower().contains("nachhol"))))'
>   kt: 'formula.kq.map(date(value.properties.datum)).sort()'
>   ko: '[formula.kq.filter(value.properties.erledigt != true).map(date(value.properties.datum)), if(klausur, [date(klausur)], [])].flat().filter(value >= today()).sort()'
>   ka: '[formula.kt, if(klausur, [date(klausur)], [])].flat().sort()'
>   kv: 'formula.ka.filter(value <= today())'
>   termin: 'if(formula.fertig, if(formula.kv.length > 0, formula.kv[formula.kv.length - 1].format("DD.MM.YYYY"), ""), if(formula.ko.length > 0, formula.ko[0].format("DD.MM.YYYY"), if(formula.ka.length > 0, formula.ka[formula.ka.length - 1].format("DD.MM.YYYY"), "")))'
> properties:
>   file.name:
>     displayName: Modul
>   note.ects:
>     displayName: ECTS
>   note.fachsemester:
>     displayName: FS
>   note.status:
>     displayName: Status
>   note.ergebnis:
>     displayName: Note
>   note.versuch:
>     displayName: Versuch
>   formula.termin:
>     displayName: Termin
>   formula.block:
>     displayName: Block
>   note.gruppe:
>     displayName: Bereich
>   formula.stand:
>     displayName: Stand
> views:
>   - type: table
>     rowHeight: medium
>     name: Mein Studium
>     filters:
>       and:
>         - 'formula.imPlan'
>     groupBy:
>       property: note.gruppe
>       direction: DESC
>     sort:
>       - property: fachsemester
>         direction: ASC
>       - property: code
>         direction: ASC
>     summaries:
>       note.ects: Sum
>     order:
>       - file.name
>       - ects
>       - status
>       - ergebnis
>       - formula.termin
>       - formula.block
>     columnSize:
>       file.name: 235
>       note.ects: 56
>       note.status: 104
>       note.ergebnis: 60
>       formula.termin: 100
>       formula.block: 60
> ```

> [!eba-tabelle|schlicht|umbruch]- Bestanden
> ```base
> filters:
>   and:
>     - 'typ == "modul"'
> formulas:
>   stand: 'html("<span class=\"eba-pill " + if(["bestanden", "anerkannt"].contains(status.toString().lower().trim()), "ok", if(status.toString().lower().trim() == "nicht bestanden", "bad", if(status.toString().lower().trim() == "angemeldet", "ok", if(status.toString().lower().trim() == "läuft", "info", "leer")))) + "\">" + if(status, status, "offen") + "</span>")'
>   var: 'file("System/Einstellungen.md").properties.variante'
>   block: 'if((gruppe == "Profil & Vertiefung" && ((formula.var == "Economics" && rolle_economics == "Elective Studies") || (formula.var == "Business Administration" && rolle_ba == "Elective Studies") || (anrechnung == "Elective Studies" && !(formula.var == "Economics" && rolle_economics == "Pflicht") && !(formula.var == "Business Administration" && rolle_ba == "Pflicht")))), "66 %", notenblock)'
>   mpid: 'file("System/Daten/Musterplan.md").properties.plaene.filter(value.name == file("System/Einstellungen.md").properties.variante).map(value.id).join("")'
>   mpfs: 'file("System/Daten/Musterplan.md").properties.eintraege.filter(value.plan == formula.mpid && value.code == code).map(number(value.fs)).sort()'
>   fsplan: 'if(gruppe == "Schwerpunkt", 0, if(formula.mpid == "", if(fachsemester, number(fachsemester), 0), if(formula.mpfs.length > 0, formula.mpfs[0], if(gewaehlt == true && fachsemester, number(fachsemester), 0))))'
>   semester: 'if(semester_geplant, semester_geplant, if(formula.fsplan > 0, file("System/Einstellungen.md").properties.semesterliste.filter(number(value.split("|")[0]) == formula.fsplan).map(value.split("|")[1]).join(""), ""))'
>   imPlan: 'zusatz != true && (gewaehlt == true || semester_geplant.isTruthy() || (status.isTruthy() && status.toString().lower().trim() != "offen") || gruppe == "Grundstudium" || gruppe == "Abschluss" || (gruppe == "Profil & Vertiefung" && if(formula.var == "Economics", rolle_economics == "Pflicht", if(formula.var == "Business Administration", rolle_ba == "Pflicht", if(formula.var == "ohne Spezialisierung", rolle_ohne == "Pflicht", rolle_economics == "Pflicht" && rolle_ba == "Pflicht" && rolle_ohne == "Pflicht")))))'
> properties:
>   file.name:
>     displayName: Modul
>   note.ects:
>     displayName: ECTS
>   note.fachsemester:
>     displayName: FS
>   note.status:
>     displayName: Status
>   note.ergebnis:
>     displayName: Note
>   note.versuch:
>     displayName: Versuch
>   note.klausur:
>     displayName: Termin
>   formula.block:
>     displayName: Block
>   note.gruppe:
>     displayName: Bereich
>   formula.stand:
>     displayName: Stand
>   formula.semester:
>     displayName: Semester
> views:
>   - type: table
>     rowHeight: medium
>     name: Bestanden
>     filters:
>       or:
>         - 'status.toString().lower().trim() == "bestanden"'
>         - 'status.toString().lower().trim() == "anerkannt"'
>     summaries:
>       note.ects: Sum
>     order:
>       - file.name
>       - ects
>       - ergebnis
>       - formula.block
>       - formula.semester
>     columnSize:
>       file.name: 268
>       note.ects: 63
>       note.ergebnis: 69
>       formula.block: 79
>       formula.semester: 119
> ```

> [!eba-tabelle|schlicht|umbruch]- Orientierungsprüfung
> ```base
> filters:
>   and:
>     - 'typ == "modul"'
> formulas:
>   stand: 'html("<span class=\"eba-pill " + if(["bestanden", "anerkannt"].contains(status.toString().lower().trim()), "ok", if(status.toString().lower().trim() == "nicht bestanden", "bad", if(status.toString().lower().trim() == "angemeldet", "ok", if(status.toString().lower().trim() == "läuft", "info", "leer")))) + "\">" + if(status, status, "offen") + "</span>")'
>   var: 'file("System/Einstellungen.md").properties.variante'
>   block: 'if((gruppe == "Profil & Vertiefung" && ((formula.var == "Economics" && rolle_economics == "Elective Studies") || (formula.var == "Business Administration" && rolle_ba == "Elective Studies") || (anrechnung == "Elective Studies" && !(formula.var == "Economics" && rolle_economics == "Pflicht") && !(formula.var == "Business Administration" && rolle_ba == "Pflicht")))), "66 %", notenblock)'
>   imPlan: 'zusatz != true && (gewaehlt == true || semester_geplant.isTruthy() || (status.isTruthy() && status.toString().lower().trim() != "offen") || gruppe == "Grundstudium" || gruppe == "Abschluss" || (gruppe == "Profil & Vertiefung" && if(formula.var == "Economics", rolle_economics == "Pflicht", if(formula.var == "Business Administration", rolle_ba == "Pflicht", if(formula.var == "ohne Spezialisierung", rolle_ohne == "Pflicht", rolle_economics == "Pflicht" && rolle_ba == "Pflicht" && rolle_ohne == "Pflicht")))))'
>   fertig: '["bestanden", "anerkannt"].contains(status.toString().lower().trim())'
>   nb: 'status.toString().lower().trim() == "nicht bestanden"'
>   kq: 'file("Studium/Prüfungen.md").backlinks.map(value.asFile()).filter(value.properties.typ == "termin" && value.properties.kategorie == "Prüfung" && value.properties.code == code && value.properties.datum && !value.properties.bis.isTruthy() && value.properties.entfaellt != true && !value.properties.titel.toString().lower().contains("zwischentest") && !value.name.lower().contains("zwischentest") && (formula.nb || (!value.properties.titel.toString().lower().contains("nachhol") && !value.name.lower().contains("nachhol"))))'
>   kt: 'formula.kq.map(date(value.properties.datum)).sort()'
>   ko: '[formula.kq.filter(value.properties.erledigt != true).map(date(value.properties.datum)), if(klausur, [date(klausur)], [])].flat().filter(value >= today()).sort()'
>   ka: '[formula.kt, if(klausur, [date(klausur)], [])].flat().sort()'
>   kv: 'formula.ka.filter(value <= today())'
>   termin: 'if(formula.fertig, if(formula.kv.length > 0, formula.kv[formula.kv.length - 1].format("DD.MM.YYYY"), ""), if(formula.ko.length > 0, formula.ko[0].format("DD.MM.YYYY"), if(formula.ka.length > 0, formula.ka[formula.ka.length - 1].format("DD.MM.YYYY"), "")))'
> properties:
>   file.name:
>     displayName: Modul
>   note.ects:
>     displayName: ECTS
>   note.fachsemester:
>     displayName: FS
>   note.status:
>     displayName: Status
>   note.ergebnis:
>     displayName: Note
>   note.versuch:
>     displayName: Versuch
>   formula.termin:
>     displayName: Termin
>   formula.block:
>     displayName: Block
>   note.gruppe:
>     displayName: Bereich
>   formula.stand:
>     displayName: Stand
> views:
>   - type: table
>     rowHeight: medium
>     name: Orientierungsprüfung
>     filters:
>       and:
>         - 'op_modul == true'
>     order:
>       - file.name
>       - formula.stand
>       - ergebnis
>       - versuch
>       - formula.termin
>     columnSize:
>       file.name: 253
>       formula.stand: 103
>       note.ergebnis: 65
>       note.versuch: 84
>       formula.termin: 100
> ```

> [!eba-tabelle|schlicht|umbruch]- Alle Module
> ```base
> filters:
>   and:
>     - 'typ == "modul"'
> formulas:
>   stand: 'html("<span class=\"eba-pill " + if(["bestanden", "anerkannt"].contains(status.toString().lower().trim()), "ok", if(status.toString().lower().trim() == "nicht bestanden", "bad", if(status.toString().lower().trim() == "angemeldet", "ok", if(status.toString().lower().trim() == "läuft", "info", "leer")))) + "\">" + if(status, status, "offen") + "</span>")'
>   var: 'file("System/Einstellungen.md").properties.variante'
>   block: 'if((gruppe == "Profil & Vertiefung" && ((formula.var == "Economics" && rolle_economics == "Elective Studies") || (formula.var == "Business Administration" && rolle_ba == "Elective Studies") || (anrechnung == "Elective Studies" && !(formula.var == "Economics" && rolle_economics == "Pflicht") && !(formula.var == "Business Administration" && rolle_ba == "Pflicht")))), "66 %", notenblock)'
>   imPlan: 'zusatz != true && (gewaehlt == true || semester_geplant.isTruthy() || (status.isTruthy() && status.toString().lower().trim() != "offen") || gruppe == "Grundstudium" || gruppe == "Abschluss" || (gruppe == "Profil & Vertiefung" && if(formula.var == "Economics", rolle_economics == "Pflicht", if(formula.var == "Business Administration", rolle_ba == "Pflicht", if(formula.var == "ohne Spezialisierung", rolle_ohne == "Pflicht", rolle_economics == "Pflicht" && rolle_ba == "Pflicht" && rolle_ohne == "Pflicht")))))'
> properties:
>   file.name:
>     displayName: Modul
>   note.ects:
>     displayName: ECTS
>   note.fachsemester:
>     displayName: FS
>   note.status:
>     displayName: Status
>   note.ergebnis:
>     displayName: Note
>   note.versuch:
>     displayName: Versuch
>   note.klausur:
>     displayName: Termin
>   formula.block:
>     displayName: Block
>   note.gruppe:
>     displayName: Bereich
>   formula.stand:
>     displayName: Stand
> views:
>   - type: table
>     rowHeight: medium
>     name: Alle Module
>     sort:
>       - property: code
>         direction: ASC
>     order:
>       - file.name
>       - ects
>       - gruppe
>       - status
>       - ergebnis
>     columnSize:
>       file.name: 247
>       note.ects: 58
>       note.gruppe: 119
>       note.status: 110
>       note.ergebnis: 64
> ```


> [!eba-info]- Wie Studium Autopilot rechnet
> - Module aus Profil & Vertiefung wechseln je nach Variante: in Economics zählen **B220**, **B250**, **B290** und **J200** als Elective Studies (66 %), in Business Administration **E230**.
> - Profilmodul als Elective Studies genutzt: in seiner Modulnotiz bei „Zählt als“ `Elective Studies` eintragen.
> - Feld `zusatz: true` nimmt ein Modul aus der Rechnung; die Zielnote stellst du in den [[Einstellungen & Hilfe#Deine Angaben|Einstellungen]] ein.

## Regeln

> [!eba-karte|regeln]- Gesamtnote, Notenstufen, Zusatzleistungen
> Wie sich die Gesamtnote zusammensetzt und was zusätzlich zählen darf.
>
> > [!eba-raster|2]
> > > [!eba-regel] Gesamtnote (§ 13 BT)
> > > - **66 %** Schnitt der Schwerpunktmodule (inkl. Elective Studies) und der Bachelorarbeit.
> > > - **34 %** Schnitt aller übrigen benoteten Module (Pflicht, Profilbildung).
> > > - Jeweils nach ECTS gewichtet. SQ100 zählt nicht. Das 1. Semester zählt voll.
> >
> > > [!eba-regel] Notenstufen und Schnitte (§§ 19, 21 BRPO)
> > > - Notenstufen 1,0 bis 4,0 in Schritten von 0,3; bestanden ab **4,0**.
> > > - Schnitte: zwei Nachkommastellen, der Rest wird **abgeschnitten**.
> >
> > > [!eba-regel] Zusatzleistungen (§ 2 BT, § 2 BRPO)
> > > - Bis zu **30 ECTS** zusätzlich erlaubt; im Transcript, aber ohne Einfluss auf die Note.
> > > - Beim Schließen des Kontos: Wahl, welche Module zählen. Pflichtmodule müssen zählen.
> > > - So lassen sich schwächere Wahlmodule durch bessere ersetzen.
>
> Maßgeblich: Besonderer Teil EcoBA (AmtlBek 24/2023) und BRPO 2021 · Stand 30.09.2026
