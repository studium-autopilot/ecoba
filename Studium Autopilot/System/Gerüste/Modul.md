<!-- Gerüst für die Aktion „modul“ (System/Skripte/notizen.js): Text der Modulseite unter den Eigenschaften. Platzhalter: {{code}}, {{titel}}, {{gruppe}}, {{ects}}, {{datum}}. Diese Zeile wird nicht übernommen. -->
<div class="eba-kopf">
<div class="eba-pfad"><a class="internal-link" data-href="Dashboard" href="Dashboard">Dashboard</a><a class="internal-link" data-href="Noten & ECTS" href="Noten & ECTS">Module</a><span>Weitere Module</span></div>
<h1><span class="eba-code">{{code}}</span> {{titel}}</h1>
<div class="eba-meta"><span><b>{{ects}}</b> ECTS</span><span>{{gruppe}}</span><span>eigenes Modul</span></div>
</div>

```eba-modul
```


## Unterlagen

```eba-unterlagen
```

## Meine Notizen

> [!eba-tabelle|schlicht|handy-zu]+ Vorlesungen, Übungsblätter, Stundenplan, Termine
> ```base
> filters:
>   and:
>     - 'code == "{{code}}"'
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


## Steckbrief

> [!eba-raster|2]
> > [!eba-karte|handy-zu]+ Lehrveranstaltung
> > - **Termine:**
> > - **Verantwortlich:**
>
> > [!eba-regel|handy-zu]+ Prüfung
> > - **Form:**
> > - **Anmeldung:**


> [!eba-info|handy-zu]+ Notizen
> -


<p class="eba-fuss">Eigenes Modul, angelegt {{datum}} · <a class="internal-link" data-href="Unterlagen" href="Unterlagen">Übersicht Unterlagen</a> · <a class="internal-link" data-href="Noten & ECTS" href="Noten & ECTS">Noten &amp; ECTS</a></p>