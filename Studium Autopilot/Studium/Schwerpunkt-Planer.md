---
typ: "übersicht"
tags:
  - "übersicht"
cssclasses:
  - "eba"
  - "eba-weit"
  - "eba-s-planer"
---

<div class="eba-kopf">
<div class="eba-pfad"><a class="internal-link" data-href="Dashboard" href="Dashboard">Dashboard</a><span>Studium</span></div>
<h1>Schwerpunkt-Planer</h1>
</div>

> [!eba-kennzahlen|kz-planer]
> ```base
> filters:
>   and:
>     - file.name == "Schwerpunkt-Planer"
> formulas:
>   c: |-
>     file("System/Einstellungen.md").properties
>   var: |-
>     if(formula.c.variante, formula.c.variante, "offen")
>   m: |-
>     file("Studium/Noten & ECTS.md").backlinks.map(value.asFile()).filter(value.properties.typ == "modul")
>   plan: |-
>     formula.m.filter((value.properties.gruppe == "Schwerpunkt" || (value.properties.gruppe == "Profil & Vertiefung" && ((formula.var == "Economics" && value.properties.rolle_economics == "Elective Studies") || (formula.var == "Business Administration" && value.properties.rolle_ba == "Elective Studies") || (value.properties.anrechnung == "Elective Studies" && !(formula.var == "Economics" && value.properties.rolle_economics == "Pflicht") && !(formula.var == "Business Administration" && value.properties.rolle_ba == "Pflicht"))))) && value.properties.gewaehlt == true)
>   a0: |-
>     formula.plan.filter(value.properties.anrechnung == "Economic History and Development Economics").reduce(acc + number(value.properties.ects), 0)
>   a1: |-
>     formula.plan.filter(value.properties.anrechnung == "Economic Policy").reduce(acc + number(value.properties.ects), 0)
>   a2: |-
>     formula.plan.filter(value.properties.anrechnung == "Firms and Markets").reduce(acc + number(value.properties.ects), 0)
>   a3: |-
>     formula.plan.filter(value.properties.anrechnung == "International Economics").reduce(acc + number(value.properties.ects), 0)
>   a4: |-
>     formula.plan.filter(value.properties.anrechnung == "Data Science").reduce(acc + number(value.properties.ects), 0)
>   a5: |-
>     formula.plan.filter(value.properties.anrechnung == "Banking and Finance").reduce(acc + number(value.properties.ects), 0)
>   a6: |-
>     formula.plan.filter(value.properties.anrechnung == "Financial Accounting and Business Taxation").reduce(acc + number(value.properties.ects), 0)
>   a7: |-
>     formula.plan.filter(value.properties.anrechnung == "International Business").reduce(acc + number(value.properties.ects), 0)
>   a8: |-
>     formula.plan.filter(value.properties.anrechnung == "Managerial Accounting and Organisation").reduce(acc + number(value.properties.ects), 0)
>   a9: |-
>     formula.plan.filter(value.properties.anrechnung == "Marketing").reduce(acc + number(value.properties.ects), 0)
>   a10: |-
>     formula.plan.filter(value.properties.anrechnung == "Elective Studies" || (!["Economic History and Development Economics", "Economic Policy", "Firms and Markets", "International Economics", "Data Science", "Banking and Finance", "Financial Accounting and Business Taxation", "International Business", "Managerial Accounting and Organisation", "Marketing"].contains(value.properties.anrechnung) && value.properties.gruppe == "Profil & Vertiefung" && ((formula.var == "Economics" && value.properties.rolle_economics == "Elective Studies") || (formula.var == "Business Administration" && value.properties.rolle_ba == "Elective Studies") || (value.properties.anrechnung == "Elective Studies" && !(formula.var == "Economics" && value.properties.rolle_economics == "Pflicht") && !(formula.var == "Business Administration" && value.properties.rolle_ba == "Pflicht"))))).reduce(acc + number(value.properties.ects), 0)
>   summe: |-
>     formula.a0 + formula.a1 + formula.a2 + formula.a3 + formula.a4 + formula.a5 + formula.a6 + formula.a7 + formula.a8 + formula.a9 + formula.a10
>   anzahl: |-
>     if(formula.a0 > 0, 1, 0) + if(formula.a1 > 0, 1, 0) + if(formula.a2 > 0, 1, 0) + if(formula.a3 > 0, 1, 0) + if(formula.a4 > 0, 1, 0) + if(formula.a5 > 0, 1, 0) + if(formula.a6 > 0, 1, 0) + if(formula.a7 > 0, 1, 0) + if(formula.a8 > 0, 1, 0) + if(formula.a9 > 0, 1, 0) + if(formula.a10 > 0, 1, 0)
>   vwl: |-
>     if(formula.a0 > 0, 1, 0) + if(formula.a1 > 0, 1, 0) + if(formula.a2 > 0, 1, 0) + if(formula.a3 > 0, 1, 0) + if(formula.a4 > 0, 1, 0)
>   bwl: |-
>     if(formula.a4 > 0, 1, 0) + if(formula.a5 > 0, 1, 0) + if(formula.a6 > 0, 1, 0) + if(formula.a7 > 0, 1, 0) + if(formula.a8 > 0, 1, 0) + if(formula.a9 > 0, 1, 0)
>   rahmen: |-
>     (formula.a0 == 0 || (formula.a0 >= 15 && formula.a0 <= 30)) && (formula.a1 == 0 || (formula.a1 >= 15 && formula.a1 <= 30)) && (formula.a2 == 0 || (formula.a2 >= 15 && formula.a2 <= 30)) && (formula.a3 == 0 || (formula.a3 >= 15 && formula.a3 <= 30)) && (formula.a4 == 0 || (formula.a4 >= 15 && formula.a4 <= 30)) && (formula.a5 == 0 || (formula.a5 >= 15 && formula.a5 <= 30)) && (formula.a6 == 0 || (formula.a6 >= 15 && formula.a6 <= 30)) && (formula.a7 == 0 || (formula.a7 >= 15 && formula.a7 <= 30)) && (formula.a8 == 0 || (formula.a8 >= 15 && formula.a8 <= 30)) && (formula.a9 == 0 || (formula.a9 >= 15 && formula.a9 <= 30)) && (formula.a10 == 0 || (formula.a10 >= 15 && formula.a10 <= 30))
>   soll: |-
>     if(formula.var == "Economics", 75, 63)
>   seiteok: |-
>     if(formula.var == "Economics", formula.vwl >= 2, if(formula.var == "Business Administration", formula.bwl >= 2, formula.vwl >= 1 && formula.bwl >= 1))
>   seitetxt: |-
>     if(formula.var == "Economics", "mind. 2 VWL-Bereiche (" + formula.vwl + ")", if(formula.var == "Business Administration", "mind. 2 BWL-Bereiche (" + formula.bwl + ")", "mind. 1 VWL- und 1 BWL-Bereich (" + formula.vwl + " / " + formula.bwl + ")"))
>   karte: |-
>     html("<div class='eba-planer'><div class='eba-bereiche'>" + "<div class='eba-bereich " + if(formula.a0 == 0, "leer", if(formula.a0 < 15 || formula.a0 > 30, "warn", "ok")) + "'><span class='n'>Economic History &amp; Development</span><span class='t'>VWL</span><span class='bar'><i style='width:" + min(100, formula.a0 / 30 * 100) + "%'></i><em style='left:50%'></em></span><span class='z'>" + formula.a0 + "</span></div>" + "<div class='eba-bereich " + if(formula.a1 == 0, "leer", if(formula.a1 < 15 || formula.a1 > 30, "warn", "ok")) + "'><span class='n'>Economic Policy</span><span class='t'>VWL</span><span class='bar'><i style='width:" + min(100, formula.a1 / 30 * 100) + "%'></i><em style='left:50%'></em></span><span class='z'>" + formula.a1 + "</span></div>" + "<div class='eba-bereich " + if(formula.a2 == 0, "leer", if(formula.a2 < 15 || formula.a2 > 30, "warn", "ok")) + "'><span class='n'>Firms and Markets</span><span class='t'>VWL</span><span class='bar'><i style='width:" + min(100, formula.a2 / 30 * 100) + "%'></i><em style='left:50%'></em></span><span class='z'>" + formula.a2 + "</span></div>" + "<div class='eba-bereich " + if(formula.a3 == 0, "leer", if(formula.a3 < 15 || formula.a3 > 30, "warn", "ok")) + "'><span class='n'>International Economics</span><span class='t'>VWL</span><span class='bar'><i style='width:" + min(100, formula.a3 / 30 * 100) + "%'></i><em style='left:50%'></em></span><span class='z'>" + formula.a3 + "</span></div>" + "<div class='eba-bereich " + if(formula.a4 == 0, "leer", if(formula.a4 < 15 || formula.a4 > 30, "warn", "ok")) + "'><span class='n'>Data Science</span><span class='t'>VWL + BWL</span><span class='bar'><i style='width:" + min(100, formula.a4 / 30 * 100) + "%'></i><em style='left:50%'></em></span><span class='z'>" + formula.a4 + "</span></div>" + "<div class='eba-bereich " + if(formula.a5 == 0, "leer", if(formula.a5 < 15 || formula.a5 > 30, "warn", "ok")) + "'><span class='n'>Banking and Finance</span><span class='t'>BWL</span><span class='bar'><i style='width:" + min(100, formula.a5 / 30 * 100) + "%'></i><em style='left:50%'></em></span><span class='z'>" + formula.a5 + "</span></div>" + "<div class='eba-bereich " + if(formula.a6 == 0, "leer", if(formula.a6 < 15 || formula.a6 > 30, "warn", "ok")) + "'><span class='n'>Financial Accounting &amp; Taxation</span><span class='t'>BWL</span><span class='bar'><i style='width:" + min(100, formula.a6 / 30 * 100) + "%'></i><em style='left:50%'></em></span><span class='z'>" + formula.a6 + "</span></div>" + "<div class='eba-bereich " + if(formula.a7 == 0, "leer", if(formula.a7 < 15 || formula.a7 > 30, "warn", "ok")) + "'><span class='n'>International Business</span><span class='t'>BWL</span><span class='bar'><i style='width:" + min(100, formula.a7 / 30 * 100) + "%'></i><em style='left:50%'></em></span><span class='z'>" + formula.a7 + "</span></div>" + "<div class='eba-bereich " + if(formula.a8 == 0, "leer", if(formula.a8 < 15 || formula.a8 > 30, "warn", "ok")) + "'><span class='n'>Managerial Accounting &amp; Org.</span><span class='t'>BWL</span><span class='bar'><i style='width:" + min(100, formula.a8 / 30 * 100) + "%'></i><em style='left:50%'></em></span><span class='z'>" + formula.a8 + "</span></div>" + "<div class='eba-bereich " + if(formula.a9 == 0, "leer", if(formula.a9 < 15 || formula.a9 > 30, "warn", "ok")) + "'><span class='n'>Marketing</span><span class='t'>BWL</span><span class='bar'><i style='width:" + min(100, formula.a9 / 30 * 100) + "%'></i><em style='left:50%'></em></span><span class='z'>" + formula.a9 + "</span></div>" + "<div class='eba-bereich " + if(formula.a10 == 0, "leer", if(formula.a10 < 15 || formula.a10 > 30, "warn", "ok")) + "'><span class='n'>Elective Studies</span><span class='t'>neutral</span><span class='bar'><i style='width:" + min(100, formula.a10 / 30 * 100) + "%'></i><em style='left:50%'></em></span><span class='z'>" + formula.a10 + "</span></div>" + "</div><div class='eba-pruefliste'><span class='k'>Variante: " + formula.var + "</span><ul>" + "<li class='" + if(formula.anzahl == 3, "ok", "") + "'>Genau 3 Bereiche <b>(" + formula.anzahl + ")</b></li><li class='" + if(formula.anzahl > 0 && formula.rahmen, "ok", "") + "'>Jeder Bereich 15–30 ECTS</li><li class='" + if(formula.summe == formula.soll, "ok", "") + "'>Summe <b>" + formula.summe + " / " + formula.soll + " ECTS</b></li><li class='" + if(formula.anzahl > 0 && formula.seiteok, "ok", "") + "'>" + formula.seitetxt + "</li>" + "</ul><p>Strich = 15 ECTS · Variante: Einstellungen</p></div></div>")
> views:
>   - type: list
>     name: Kennzahlen
>     order:
>       - formula.karte
> ```


## Schwerpunktkatalog

> [!eba-tabelle|schlicht|ohne-titel|umbruch]
> ```base
> filters:
>   and:
>     - 'gruppe == "Schwerpunkt"'
> formulas:
>   plan: 'html("<a class=\"eba-plan\" href=\"obsidian://studium-autopilot?aktion=plan&modul=" + file.basename.replace(/%/g, "%25").replace(/&/g, "%26").replace(/#/g, "%23").replace(/\+/g, "%2B") + "\">" + if(gewaehlt, "✓ Im Plan", "+ Planen") + "</a>")'
> properties:
>   file.name:
>     displayName: Modul
>   note.ects:
>     displayName: ECTS
>   note.fs_empfohlen:
>     displayName: FS
>   note.turnus:
>     displayName: Turnus
>   note.sprache:
>     displayName: Sprache
>   note.pruefung:
>     displayName: Prüfung
>   formula.plan:
>     displayName: Im Plan
>   note.bereiche:
>     displayName: Bereiche
>   note.anrechnung:
>     displayName: Anrechnung in
>   note.semester_geplant:
>     displayName: Semester
>   note.status:
>     displayName: Status
> views:
>   - type: table
>     rowHeight: medium
>     name: Mein Plan
>     filters:
>       and:
>         - 'gewaehlt == true'
>     groupBy:
>       property: note.anrechnung
>       direction: ASC
>     summaries:
>       note.ects: Sum
>     order:
>       - file.name
>       - ects
>       - anrechnung
>       - semester_geplant
>       - formula.plan
>     columnSize:
>       file.name: 221
>       note.ects: 56
>       note.anrechnung: 153
>       note.semester_geplant: 93
>       formula.plan: 76
> ```

> [!eba-tabelle|schlicht|umbruch]- Katalog
> ```base
> filters:
>   and:
>     - 'gruppe == "Schwerpunkt"'
> formulas:
>   plan: 'html("<a class=\"eba-plan\" href=\"obsidian://studium-autopilot?aktion=plan&modul=" + file.basename.replace(/%/g, "%25").replace(/&/g, "%26").replace(/#/g, "%23").replace(/\+/g, "%2B") + "\">" + if(gewaehlt, "✓ Im Plan", "+ Planen") + "</a>")'
> properties:
>   file.name:
>     displayName: Modul
>   note.ects:
>     displayName: ECTS
>   note.fs_empfohlen:
>     displayName: FS
>   note.turnus:
>     displayName: Turnus
>   note.sprache:
>     displayName: Sprache
>   note.pruefung:
>     displayName: Prüfung
>   formula.plan:
>     displayName: Im Plan
>   note.bereiche:
>     displayName: Bereiche
>   note.anrechnung:
>     displayName: Anrechnung in
>   note.semester_geplant:
>     displayName: Semester
>   note.status:
>     displayName: Status
> views:
>   - type: table
>     rowHeight: medium
>     name: Katalog
>     sort:
>       - property: code
>         direction: ASC
>     order:
>       - file.name
>       - ects
>       - turnus
>       - formula.plan
>       - bereiche
>       - anrechnung
>     columnSize:
>       file.name: 152
>       note.ects: 56
>       note.turnus: 56
>       formula.plan: 57
>       note.bereiche: 152
>       note.anrechnung: 127
> ```


## Profilbildung und Vertiefung

> [!eba-tabelle|schlicht|ohne-titel|umbruch|handy-zu]+ Module
> ```base
> filters:
>   and:
>     - 'gruppe == "Profil & Vertiefung"'
> formulas:
>   plan: 'html("<a class=\"eba-plan\" href=\"obsidian://studium-autopilot?aktion=plan&modul=" + file.basename.replace(/%/g, "%25").replace(/&/g, "%26").replace(/#/g, "%23").replace(/\+/g, "%2B") + "\">" + if(gewaehlt, "✓ Im Plan", "+ Planen") + "</a>")'
>   eco: 'rolle_economics.replace("Wahlpflicht: Profilbildungsbereich", "Profil").replace(" (oder Elective Studies)", "").replace("Elective Studies", "Elective").replace(" oder ", "/")'
>   ba: 'rolle_ba.replace("Wahlpflicht: Profilbildungsbereich", "Profil").replace(" (oder Elective Studies)", "").replace("Elective Studies", "Elective").replace(" oder ", "/")'
>   ohne: 'rolle_ohne.replace("Wahlpflicht: Profilbildungsbereich", "Profil").replace(" (oder Elective Studies)", "").replace("Elective Studies", "Elective").replace(" oder ", "/")'
> properties:
>   file.name:
>     displayName: Modul
>   formula.eco:
>     displayName: Eco
>   formula.ba:
>     displayName: BA
>   formula.ohne:
>     displayName: ohne
>   note.ects:
>     displayName: ECTS
>   note.rolle_economics:
>     displayName: Economics
>   note.rolle_ba:
>     displayName: Business Administration
>   note.rolle_ohne:
>     displayName: ohne Spezialisierung
>   formula.plan:
>     displayName: Im Plan
>   note.anrechnung:
>     displayName: Zählt als
> views:
>   - type: table
>     rowHeight: medium
>     name: Profil & Vertiefung
>     sort:
>       - property: code
>         direction: ASC
>     order:
>       - file.name
>       - formula.eco
>       - formula.ba
>       - formula.ohne
>       - formula.plan
>       - anrechnung
>     columnSize:
>       file.name: 191
>       formula.eco: 69
>       formula.ba: 69
>       formula.ohne: 95
>       formula.plan: 78
>       note.anrechnung: 95
> ```
>
> Pflicht je Variante: Economics E230, E210, S220, B240 · Business Administration 2 aus B290, S220, E210 · ohne Spezialisierung 3 VWL- und 3 BWL-Module. „Zählt als“ leer = Profilbildung, als Wahlmodul eingebracht = Elective Studies.


## Bereiche

> [!eba-raster|2]+ Module je Bereich
> > [!eba-ziel] Economic History and Development Economics · VWL
> > [[E360 Regression Analysis with STATA using Economic History Data|E360]] · [[E361 Wirtschaftsgeschichte der Welt- neue Forschungsansätze|E361]] · [[E363 International Development Economics and Economic History|E363]] · [[E364 Applied Research in Economic History|E364]] · [[E365 Topics in International Economic History|E365]] · [[E366 Aspekte der Wirtschaftsgeschichte und Entwicklungsökonomie|E366]] · [[S321 Applied Econometrics|S321]] · [[S326 Empirical Analysis of Panel Data|S326]]
>
> > [!eba-ziel] Economic Policy · VWL
> > [[E311 Corporate Tax Policy in an International Setting|E311]] · [[E313 Topics in Economic Policy I|E313]] · [[E314 Topics in Economic Policy II|E314]] · [[E315 Topics in Economic Policy III|E315]] · [[E320 Economics in Action|E320]] · [[E333 Blockchain and Cryptocurrencies|E333]] · [[S316 Policy Analysis and Evaluation|S316]]
>
> > [!eba-ziel] Firms and Markets · VWL
> > [[E320 Economics in Action|E320]] · [[B340 Organisation|B340]] · [[B340A Organisation - Grundlagen- Entscheidungs-, Informations- und Organisationsprobleme|B340A]] · [[B370 Corporate Sustainability Strategy|B370]] · [[E323 Firms in the Global Economy|E323]] · [[E325 Topics in Firms and Markets I|E325]] · [[E326 Aspekte in Firms and Markets II|E326]] · [[E331 Arbeitsmarktökonomik|E331]] · [[E371A Theory and Policy of International Trade A|E371A]] · [[E371B Theory and Policy of International Trade B|E371B]]
>
> > [!eba-ziel] International Economics · VWL
> > [[E361 Wirtschaftsgeschichte der Welt- neue Forschungsansätze|E361]] · [[E363 International Development Economics and Economic History|E363]] · [[E364 Applied Research in Economic History|E364]] · [[E365 Topics in International Economic History|E365]] · [[E311 Corporate Tax Policy in an International Setting|E311]] · [[E320 Economics in Action|E320]] · [[E323 Firms in the Global Economy|E323]] · [[E371A Theory and Policy of International Trade A|E371A]] · [[E371B Theory and Policy of International Trade B|E371B]] · [[E324 Internationale Wirtschaftsorganisationen|E324]] · [[E330 International Money and Finance|E330]] · [[E370 Topics in International Economics I|E370]] · [[E374 Topics in International Economics II|E374]] · [[E375 Topics in International Economics III|E375]] · [[E376 A toolkit for writing your bachelor thesis|E376]]
>
> > [!eba-ziel] Data Science · VWL + BWL
> > [[E360 Regression Analysis with STATA using Economic History Data|E360]] · [[E364 Applied Research in Economic History|E364]] · [[S321 Applied Econometrics|S321]] · [[S326 Empirical Analysis of Panel Data|S326]] · [[S316 Policy Analysis and Evaluation|S316]] · [[E376 A toolkit for writing your bachelor thesis|E376]] · [[B320 Market Research|B320]] · [[DS320 Introduction to Data Science|DS320]] · [[DS321 Data Science in der Praxis|DS321]] · [[S310 Econometric Analysis of Financial Data|S310]] · [[S311 Topics in Applied Econometrics and Statistics|S311]] · [[S313 Applied Quantitative Methods in Economics and Finance|S313]] · [[S317 Topics in Data Science|S317]] · [[S324 Computational Econometrics Using Stata|S324]]
>
> > [!eba-ziel] Banking and Finance · BWL
> > [[S321 Applied Econometrics|S321]] · [[B3X1 Banking and Finance I|B3X1]] · [[B3X2 Banking and Finance II|B3X2]] · [[B3X3 Banking and Finance III|B3X3]] · [[B3X4 Banking and Finance IV|B3X4]] · [[B3X5 Banking and Finance V|B3X5]] · [[B3X6 Banking and Finance VI|B3X6]] · [[B3X7 Banking and Finance VII|B3X7]]
>
> > [!eba-ziel] Financial Accounting and Business Taxation · BWL
> > [[E311 Corporate Tax Policy in an International Setting|E311]] · [[E313 Topics in Economic Policy I|E313]] · [[B330A Accounting Information and Strategic Cost Management 1|B330A]] · [[B330B Accounting Information and Strategic Cost Management 2|B330B]] · [[B350 Grundlagen der Besteuerung|B350]] · [[B351 Steuerliches Rechnungswesen|B351]] · [[B353 International Taxation|B353]] · [[B380 Corporate Reporting|B380]] · [[B381 Konzernrechnungslegung|B381]] · [[B383 Current Topics in Financial Accounting and Financial Analysis|B383]]
>
> > [!eba-ziel] International Business · BWL
> > [[B370 Corporate Sustainability Strategy|B370]] · [[E323 Firms in the Global Economy|E323]] · [[E324 Internationale Wirtschaftsorganisationen|E324]] · [[E330 International Money and Finance|E330]] · [[E370 Topics in International Economics I|E370]] · [[B353 International Taxation|B353]] · [[B380 Corporate Reporting|B380]] · [[B390 International Business|B390]] · [[B391 Interkulturelles Management und Ethik|B391]] · [[B393 Die Internationalisierung Mittlerer Marktführer|B393]] · [[B394 Innovative Topics in International Business I|B394]] · [[B395 Innovative Topics in International Business II|B395]]
>
> > [!eba-ziel] Managerial Accounting and Organisation · BWL
> > [[S321 Applied Econometrics|S321]] · [[B340 Organisation|B340]] · [[B340A Organisation - Grundlagen- Entscheidungs-, Informations- und Organisationsprobleme|B340A]] · [[B370 Corporate Sustainability Strategy|B370]] · [[E325 Topics in Firms and Markets I|E325]] · [[E326 Aspekte in Firms and Markets II|E326]] · [[DS320 Introduction to Data Science|DS320]] · [[B330A Accounting Information and Strategic Cost Management 1|B330A]] · [[B330B Accounting Information and Strategic Cost Management 2|B330B]] · [[B380 Corporate Reporting|B380]] · [[B260 Unternehmenssimulation General Management|B260]] · [[B331 Specific Topics in Managerial Accounting & Organisation|B331]]
>
> > [!eba-ziel] Marketing · BWL
> > [[S321 Applied Econometrics|S321]] · [[B320 Market Research|B320]] · [[B321 Aspects of Marketing Management 1|B321]] · [[B322 Aspects of Marketing Management 2|B322]] · [[B323 Aspects of Marketing Management 3|B323]]


> [!eba-achtung|handy-zu]+ Gut zu wissen
> - **Angebot je Semester:** Welche Module entfallen oder neu hinzukommen, steht unter [Aktuelles zum Studium](https://uni-tuebingen.de/fakultaeten/wirtschafts-und-sozialwissenschaftliche-fakultaet/faecher/fachbereich-wirtschaftswissenschaft/wirtschaftswissenschaft/studium/service-beratung/studienorganisation/aktuelles-zum-studium/) und in Alma.
> - **Containermodule:** jedes Semester ein anderes Thema, jedes Containermodul zählt nur einmal.

<p class="eba-fuss">Offene Fragen zur Wahl: <a class="internal-link" data-href="Einstellungen & Hilfe#Stand der Angaben" href="Einstellungen & Hilfe#Stand der Angaben">Stand der Angaben</a> · Regeln: <a class="internal-link" data-href="Studienverlauf#Regeln" href="Studienverlauf#Regeln">Studienverlauf</a> · Stand 30.09.2026 · <a href="https://uni-tuebingen.de/einrichtungen/verwaltung/iv-studierende/zentrales-pruefungsamt/wirtschafts-und-sozialwissenschaftliche-faecher-und-theologien/fachbereich-wirtschaftswissenschaft/downloads/">PO 2023 BT § 4</a> · <a class="internal-link" data-href="Kontakte & Links#Offizielle Dokumente" href="Kontakte & Links#Offizielle Dokumente">Quellen</a></p>
