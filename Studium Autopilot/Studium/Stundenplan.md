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
> ```eba-woche
> ```

> [!eba-tabelle|schlicht|umbruch]- Liste
> ```base
> filters:
>   and:
>     - 'typ == "lehrveranstaltung"'
>     - 'entfaellt != true'
>     - 'besuche_nicht != true'
>     - '!list(file("System/Einstellungen.md").properties.stundenplan_ausgeblendet).contains(if(herkunft == "zentral", zentral_id, if(herkunft == "alma", "alma:" + alma_schluessel, if(herkunft == "ilias-gruppe", "ilias-gruppe:" + ilias_gruppe, if(herkunft == "gruppe-gewaehlt", "gruppe-gewaehlt:" + gruppe_id, if(herkunft == "abgleich", "abgleich:" + abgleich_id, if(herkunft == "claude", "claude:" + claude_id, if(herkunft == "ilias-kalender", "ilias-kalender:" + ilias_kalender_id, ""))))))))'
> formulas:
>   zeit: 'if(wochentag.isTruthy(), ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"][number(wochentag) - 1], tag) + " " + beginn + "–" + ende'
>   zeitraum: 'if(einzeltermin == true && von.isTruthy(), date(von).format("DD.MM."), if(von.isTruthy() && bis.isTruthy(), date(von).format("DD.MM.") + "–" + date(bis).format("DD.MM."), if(von.isTruthy(), "ab " + date(von).format("DD.MM."), if(bis.isTruthy(), "bis " + date(bis).format("DD.MM."), ""))))'
>   was: 'file.asLink(titel)'
>   semester: 'if(file("System/Einstellungen.md").properties.semesterliste.filter(value.split("|")[1] == semester).length > 0, file("System/Einstellungen.md").properties.semesterliste.filter(value.split("|")[1] == semester)[0].split("|")[0] + ". FS · " + semester, semester)'
> properties:
>   formula.zeitraum:
>     displayName: Zeitraum
>   formula.zeit:
>     displayName: Zeit
>   formula.was:
>     displayName: Lehrveranstaltung
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
