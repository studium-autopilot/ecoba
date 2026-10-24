---
typ: "übersicht"
tags:
  - "übersicht"
cssclasses:
  - "eba"
  - "eba-weit"
  - "eba-s-unterlagen"
---

<div class="eba-kopf">
<div class="eba-pfad"><a class="internal-link" data-href="Dashboard" href="Dashboard">Dashboard</a><span>Studium</span></div>
<h1>Unterlagen</h1>
</div>

> [!eba-neu|ohne-titel]
> - [Unterlagen hinzufügen](obsidian://studium-autopilot?aktion=einordnen)
> - [Neues Übungsblatt](obsidian://studium-autopilot?aktion=uebungsblatt)
> - [In Unterlagen suchen](obsidian://studium-autopilot?aktion=suchen&q=path%3AUnterlagen%20)
> - [Unterlagen aktualisieren](obsidian://studium-autopilot?aktion=ilias-holen)
>
> ```eba-ilias-knopf
> ```

```eba-schloss ilias
```

> [!eba-kennzahlen|kz-unterlagen]
> ```base
> filters:
>   and:
>     - file.name == "Unterlagen"
> formulas:
>   u: |-
>     file("Studium/Unterlagen.md").backlinks.map(value.asFile()).filter(value.properties.typ == "unterlage")
>   neu: |-
>     formula.u.filter(value.properties.geoeffnet.isEmpty() && value.properties.datum && date(value.properties.datum) >= today() - duration("14d")).length
>   module: |-
>     formula.u.map(value.properties.code).filter(value.isTruthy()).unique().length
>   alt: |-
>     formula.u.filter(value.properties.art == "Altklausur")
>   altmodule: |-
>     formula.alt.map(value.properties.code).filter(value.isTruthy()).unique().length
>   karte: |-
>     html("<div class='eba-kz'><div class='eba-kz-reihe drei'>" + "<div class='eba-kachel akzent'><span class='k'>" + "Unterlagen" + "</span><span class='v'>" + formula.u.length + "</span><span class='s'>" + formula.module + if(formula.module == 1, " Modul", " Module") + "</span></div>" + "<div class='eba-kachel'><span class='k'>" + "Neu" + "</span><span class='v'>" + formula.neu + "</span><span class='s'>noch nicht geöffnet</span></div>" + "<div class='eba-kachel'><span class='k'>" + "Altklausuren" + "</span><span class='v'>" + formula.alt.length + "</span>" + if(formula.altmodule > 0, "<span class='s'>" + formula.altmodule + if(formula.altmodule == 1, " Modul", " Module") + "</span>", "") + "</div>" + "</div></div>")
> views:
>   - type: list
>     name: Kennzahlen
>     order:
>       - formula.karte
> ```

## Übungsblätter

> [!eba-kennzahlen|kz-flach|kz-blaetter]
> ```base
> filters:
>   and:
>     - file.name == "Unterlagen"
> formulas:
>   b: |-
>     file("Studium/Unterlagen.md").backlinks.map(value.asFile()).filter(value.properties.typ == "übungsblatt")
>   offen: |-
>     formula.b.filter(!["abgegeben", "korrigiert"].contains(value.properties.status.toString().lower().trim()))
>   woche: |-
>     formula.offen.filter(value.properties.faellig && date(value.properties.faellig) >= today() && date(value.properties.faellig) <= today() + duration("7d")).length
>   spaet: |-
>     formula.offen.filter(value.properties.faellig && date(value.properties.faellig) < today()).length
>   ab: |-
>     formula.b.filter(["abgegeben", "korrigiert"].contains(value.properties.status.toString().lower().trim())).length
>   karte: |-
>     html("<div class='eba-kz'><div class='eba-kz-reihe drei'>" + "<div class='eba-kachel akzent'><span class='k'>Offen</span><span class='v'>" + formula.offen.length + "</span>" + if(formula.spaet > 0, "<span class='s'>" + formula.spaet + " überfällig</span>", "") + "</div>" + "<div class='eba-kachel'><span class='k'>Fällig in 7 Tagen</span><span class='v'>" + formula.woche + "</span></div>" + "<div class='eba-kachel'><span class='k'>Abgegeben</span><span class='v'>" + formula.ab + "</span><span class='s'>von " + formula.b.length + " Blättern</span></div>" + "</div></div>")
> views:
>   - type: list
>     name: Kennzahlen
>     order:
>       - formula.karte
> ```

> [!eba-tabelle|schlicht|ohne-titel|umbruch]
> ```base
> filters:
>   and:
>     - 'typ == "übungsblatt"'
> formulas:
>   tage: 'if(faellig, ((date(faellig) - today()).days).round(), 999)'
>   wann: 'if(faellig.isEmpty(), "kein Datum", if(["abgegeben", "korrigiert"].contains(status.toString().lower().trim()), "erledigt", if(formula.tage < 0, "überfällig", if(formula.tage == 0, "heute", if(formula.tage == 1, "morgen", "in " + formula.tage + " Tagen")))))'
> properties:
>   file.name:
>     displayName: Blatt
>   note.code:
>     displayName: Modul
>   note.faellig:
>     displayName: Fällig
>   formula.wann:
>     displayName: Wann
>   note.status:
>     displayName: Status
> views:
>   - type: table
>     name: Offen
>     filters:
>       and:
>         - '!["abgegeben", "korrigiert"].contains(status.toString().lower().trim())'
>     order:
>       - file.name
>       - code
>       - faellig
>       - formula.wann
>       - status
>     sort:
>       - property: faellig
>         direction: ASC
>     rowHeight: medium
>     columnSize:
>       file.name: 243
>       note.code: 69
>       note.faellig: 95
>       formula.wann: 95
>       note.status: 95
> ```

> [!eba-tabelle|schlicht|umbruch]- Alle Übungsblätter
> ```base
> filters:
>   and:
>     - 'typ == "übungsblatt"'
> properties:
>   file.name:
>     displayName: Blatt
>   note.code:
>     displayName: Modul
>   note.faellig:
>     displayName: Fällig
>   note.status:
>     displayName: Status
> views:
>   - type: table
>     name: Nach Modul
>     groupBy:
>       property: note.code
>       direction: ASC
>     order:
>       - file.name
>       - faellig
>       - status
>     sort:
>       - property: nummer
>         direction: ASC
>     rowHeight: medium
>     columnSize:
>       file.name: 360
>       note.faellig: 110
>       note.status: 120
>   - type: table
>     name: Alle
>     order:
>       - file.name
>       - code
>       - faellig
>       - status
>     sort:
>       - property: faellig
>         direction: DESC
>     rowHeight: medium
>     columnSize:
>       file.name: 322
>       note.code: 71
>       note.faellig: 98
>       note.status: 107
> ```

## Neu

> [!eba-tabelle|schlicht|ohne-titel|umbruch]
> ```base
> filters:
>   and:
>     - 'typ == "unterlage"'
> formulas:
>   was: 'file.asLink(if(nummer, art + " " + if(nummer < 10, "0" + nummer, "" + nummer), art) + if(titel, " · " + titel, ""))'
>   oeffnen: 'html("<a class=\"eba-oeffnen\" href=\"obsidian://studium-autopilot?aktion=oeffnen&notiz=" + file.basename.replace(/%/g, "%25").replace(/&/g, "%26").replace(/#/g, "%23").replace(/\+/g, "%2B") + "\">Öffnen ↗</a>")'
> properties:
>   formula.was:
>     displayName: Unterlage
>   note.code:
>     displayName: Modul
>   note.art:
>     displayName: Art
>   note.seiten:
>     displayName: Seiten
>   formula.oeffnen:
>     displayName: Datei
>   note.semester:
>     displayName: Semester
>   note.datum:
>     displayName: Eingeordnet
> views:
>   - type: table
>     rowHeight: medium
>     name: Neu
>     limit: 30
>     filters:
>       and:
>         - 'geoeffnet.isEmpty() && datum && date(datum) >= today() - duration("14d")'
>     groupBy:
>       property: note.code
>       direction: ASC
>     order:
>       - formula.was
>       - formula.oeffnen
>       - seiten
>       - datum
>     sort:
>       - property: datum
>         direction: DESC
>       - property: art
>         direction: ASC
>       - property: nummer
>         direction: ASC
>     columnSize:
>       formula.was: 300
>       formula.oeffnen: 78
>       note.seiten: 60
>       note.datum: 95
> ```

> [!eba-tabelle|schlicht|umbruch]- Nach Modul
> ```base
> filters:
>   and:
>     - 'typ == "unterlage"'
> formulas:
>   was: 'file.asLink(if(nummer, art + " " + if(nummer < 10, "0" + nummer, "" + nummer), art) + if(titel, " · " + titel, ""))'
>   oeffnen: 'html("<a class=\"eba-oeffnen\" href=\"obsidian://studium-autopilot?aktion=oeffnen&notiz=" + file.basename.replace(/%/g, "%25").replace(/&/g, "%26").replace(/#/g, "%23").replace(/\+/g, "%2B") + "\">Öffnen ↗</a>")'
> properties:
>   formula.was:
>     displayName: Unterlage
>   note.code:
>     displayName: Modul
>   note.art:
>     displayName: Art
>   note.seiten:
>     displayName: Seiten
>   formula.oeffnen:
>     displayName: Datei
>   note.semester:
>     displayName: Semester
>   note.datum:
>     displayName: Eingeordnet
> views:
>   - type: table
>     rowHeight: medium
>     name: Nach Modul
>     groupBy:
>       property: note.code
>       direction: ASC
>     order:
>       - formula.was
>       - formula.oeffnen
>       - seiten
>     sort:
>       - property: art
>         direction: ASC
>       - property: nummer
>         direction: ASC
>     columnSize:
>       formula.was: 300
>       formula.oeffnen: 90
>       note.seiten: 80
> ```

> [!eba-tabelle|schlicht|umbruch]- Zuletzt eingeordnet
> ```base
> filters:
>   and:
>     - 'typ == "unterlage"'
> formulas:
>   was: 'file.asLink(if(nummer, art + " " + if(nummer < 10, "0" + nummer, "" + nummer), art) + if(titel, " · " + titel, ""))'
>   oeffnen: 'html("<a class=\"eba-oeffnen\" href=\"obsidian://studium-autopilot?aktion=oeffnen&notiz=" + file.basename.replace(/%/g, "%25").replace(/&/g, "%26").replace(/#/g, "%23").replace(/\+/g, "%2B") + "\">Öffnen ↗</a>")'
> properties:
>   formula.was:
>     displayName: Unterlage
>   note.code:
>     displayName: Modul
>   note.art:
>     displayName: Art
>   note.seiten:
>     displayName: Seiten
>   formula.oeffnen:
>     displayName: Datei
>   note.semester:
>     displayName: Semester
>   note.datum:
>     displayName: Eingeordnet
> views:
>   - type: table
>     rowHeight: medium
>     name: Zuletzt eingeordnet
>     filters:
>       and:
>         - 'datum && date(datum) >= today() - duration("30d")'
>     order:
>       - formula.was
>       - formula.oeffnen
>       - code
>       - datum
>     sort:
>       - property: datum
>         direction: DESC
>     limit: 50
>     columnSize:
>       formula.was: 260
>       formula.oeffnen: 78
>       note.code: 69
>       note.datum: 95
> ```

<p class="eba-hinweis">ILIAS, einordnen und annotieren: <a class="internal-link" data-href="Einstellungen & Hilfe#Hilfe" href="Einstellungen & Hilfe#Hilfe">Hilfe</a></p>
