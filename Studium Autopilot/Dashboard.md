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
> ```eba-kacheln
> Fristen, Prüfung, Semester und ECTS erscheinen, sobald Studium Autopilot läuft.
> ```

> [!eba-neu|ohne-titel]
> - [Vorlesung](obsidian://studium-autopilot?aktion=vorlesung)
> - [Übungsblatt](obsidian://studium-autopilot?aktion=uebungsblatt)
> - [Unterlagen](obsidian://studium-autopilot?aktion=einordnen)


> [!eba-kennzahlen|woche kurz]
> ```eba-schloss alma
> ```
> ```eba-woche
> ```

> [!eba-raster|2]
> > [!eba-termin|schlicht|umbruch|handy-zu]+ Fristen · 30 Tage
> > ```eba-liste fristen
> > Fristen erscheinen, sobald Studium Autopilot läuft.
> > ```
>
> > [!eba-termin|schlicht|umbruch|handy-zu]+ Termine · 14 Tage
> > ```eba-liste termine
> > Termine erscheinen, sobald Studium Autopilot läuft.
> > ```


## Zu erledigen

```eba-bitte-pruefen
```

```eba-karten heute
Fällige Karteikarten erscheinen, sobald Studium Autopilot läuft.
```

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
