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

> [!eba-achtung|plugin-aus] Studium Autopilot ist noch aus
> Darum fehlen hier Fristen, Termine und Knöpfe. **Einstellungen** öffnen (Zahnrad unten links, am Handy erst ☰) → **Community-Plugins** → **Community-Plugins aktivieren**. Steht dort „Studium Autopilot“ mit einem Schalter, ihn einschalten. Danach verschwindet dieser Hinweis.
>
> Englisch: Settings → Community plugins → Turn on community plugins.

```eba-update-hinweis
```

> [!eba-kennzahlen]
> ```eba-kacheln
> Fristen, Prüfung, Semester und ECTS erscheinen, sobald Studium Autopilot läuft.
> ```

> [!eba-neu|ohne-titel]
> - [Neue Vorlesungsnotiz](obsidian://studium-autopilot?aktion=vorlesung)
> - [Neues Übungsblatt](obsidian://studium-autopilot?aktion=uebungsblatt)
> - [Unterlagen einordnen](obsidian://studium-autopilot?aktion=einordnen)


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
> ```eba-liste nachzuarbeiten
> Vorlesungen zum Nacharbeiten erscheinen, sobald Studium Autopilot läuft.
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
