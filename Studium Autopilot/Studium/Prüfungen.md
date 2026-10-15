---
typ: "übersicht"
tags:
  - "übersicht"
cssclasses:
  - "eba"
  - "eba-weit"
  - "eba-s-pruefungen"
---

<div class="eba-kopf">
<div class="eba-pfad"><a class="internal-link" data-href="Dashboard" href="Dashboard">Dashboard</a><span>Studium</span></div>
<h1>Prüfungen</h1>
</div>

## Prüfungen

```eba-klausurzeit
Zeitleiste erscheint, sobald Obsidian nach dem Start klausurzeit.js geladen hat (sonst Obsidian neu starten).
```

> [!eba-tabelle|schlicht|umbruch] Prüfungstermine
> ```base
> filters:
>   and:
>     - 'typ == "termin"'
> formulas:
>   zeitraum: 'date(datum).format("DD.MM.YYYY") + if(bis, " – " + date(bis).format("DD.MM.YYYY"), "")'
>   was: 'file.asLink(titel)'
>   tage: '((date(datum) - today()).days).round()'
>   wann: 'if(date(if(bis, bis, datum)) < today(), "vorbei", if(formula.tage <= 0, if(bis, "läuft", "heute"), if(formula.tage == 1, "morgen", "in " + formula.tage + " Tagen")))'
>   stand: 'if(status == "geschätzt", html("<span class=\"eba-pill leer\">geschätzt</span>"), "")'
> properties:
>   formula.zeitraum:
>     displayName: Datum
>   formula.was:
>     displayName: Termin
>   formula.wann:
>     displayName: Wann
>   formula.stand:
>     displayName: Stand
> views:
>   - type: list
>     rowHeight: medium
>     name: Prüfungstermine
>     filters:
>       and:
>         - 'kategorie == "Prüfung"'
>         - '!bis.isTruthy()'
>         - 'date(if(bis, bis, datum)) >= today()'
>         - 'erledigt != true'
>     sort:
>       - property: datum
>         direction: ASC
>     order:
>       - formula.zeitraum
>       - formula.was
>       - formula.wann
>       - formula.stand
>     columnSize:
>       formula.zeitraum: 156
>       formula.was: 258
>       formula.wann: 92
>       formula.stand: 92
> ```


## Regeln

> [!eba-karte|regeln]- Regeln
> Was die Prüfungsordnung zu Anmeldung, Rücktritt, Wiederholung und Bestehen sagt.
>
> > [!eba-raster|2]
> > > [!eba-regel] An- und Abmeldung, Rücktritt (§ 22 BRPO)
> > > - Anmeldung in **Alma** im Anmeldezeitraum. Je Semester ein **Haupttermin** und ein **Nachholtermin**, jeweils mit eigenem Anmeldezeitraum.
> > > - Abmeldung ohne Grund: schriftlich bis **1 Werktag** vor der Prüfung (ohne Samstag), mündlich bis zum **6. Werktag**. Blockveranstaltungen und Seminare: ggf. andere Fristen.
> > > - Rücktritt aus wichtigem Grund (z. B. Krankheit) **unverzüglich** erklären, mit Attest an den Vorsitz des Prüfungsausschusses; laut FAQ innerhalb von **3 Werktagen**. Anerkannter Rücktritt zählt nicht als Fehlversuch.
> > > - Fehlen ohne Abmeldung oder Rücktritt: **5,0**. Täuschung: **5,0**.
> > > - Wer trotz bekanntem Grund mitschreibt, kann nicht nachträglich zurücktreten; nach 6 Monaten kein Rücktritt mehr (§ 22 Abs. 2 und 4 BRPO).
> >
> > > [!eba-regel] Wiederholung (§ 26 BRPO)
> > > - Nicht bestandene Prüfungen **zweimal** wiederholbar (3 Versuche).
> > > - 1. Wiederholung spätestens im **2. Semester** nach dem Fehlversuch, 2. Wiederholung spätestens im **4. Semester** danach, sonst 5,0.
> > > - Bestandene Prüfungen sind **nicht** wiederholbar. Kein Freiversuch.
> > > - Wiederholung in den **ersten 4 Wochen** des Folgesemesters zählt für die Fristen noch zum Vorsemester (§ 26 Abs. 6 BRPO); wichtig bei Nachholterminen nahe der Frist der Orientierungsprüfung.
> >
> > > [!eba-regel] Bestehen (§§ 19, 21 BRPO)
> > > - Bestanden ab **4,0**. Notenstufen und Schnitte: [[Noten & ECTS#Regeln|Noten & ECTS]].
> > > - Endgültig nicht bestanden: Prüfungsanspruch im Studiengang erlischt.
> >
> > > [!eba-regel] Einsicht und Überdenkung (§§ 19, 25 BRPO)
> > > - Ergebnisse in **Alma**. Einsicht in die korrigierte Prüfung in der Regel **innerhalb von 4 Wochen** nach Bekanntgabe, organisiert vom Lehrstuhl.
> > > - Antrag auf **Überdenkung** der Bewertung möglich (§ 19 Abs. 5 BRPO).
> > > - Klausuren meist im **Kupferbau** (Hörsäle 21–25) und in der **Mohlstraße 36**; Hörsäle einige Tage vorher nach Nachnamen.
> > > - 1. Semester: **nicht-programmierbarer Taschenrechner** und Wörterbuch ohne Notizen erlaubt.
>
> Maßgeblich: Besonderer Teil EcoBA (AmtlBek 24/2023) und BRPO 2021 · Stand 30.09.2026


<p class="eba-fuss">Fristen und alle Termine: <a class="internal-link" data-href="Termine & Anmeldungen" href="Termine & Anmeldungen">Termine & Anmeldungen</a> · Hörsäle: <a class="internal-link" data-href="Kontakte & Links" href="Kontakte & Links">Kontakte & Links</a> · Stand 30.09.2026 · <a href="https://uni-tuebingen.de/einrichtungen/verwaltung/iv-studierende/zentrales-pruefungsamt/wirtschafts-und-sozialwissenschaftliche-faecher-und-theologien/fachbereich-wirtschaftswissenschaft/fristen/">Fristen Prüfungsamt</a> · <a href="https://uni-tuebingen.de/einrichtungen/verwaltung/iv-studierende/zentrales-pruefungsamt/wirtschafts-und-sozialwissenschaftliche-faecher-und-theologien/fachbereich-wirtschaftswissenschaft/pruefungstermine-pflicht-und-profilbildungsmodule/">Prüfungstermine Pflichtmodule</a> · <a class="internal-link" data-href="Kontakte & Links#Offizielle Dokumente" href="Kontakte & Links#Offizielle Dokumente">Offizielle Dokumente</a></p>
