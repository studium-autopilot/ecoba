<!-- Gerüst für Lernplan-Notizen (System/Skripte/lernplan.js). Lernplan-Notizen aus den zentralen Kapitellisten und den Listen des eigenen Servers schreibt das Plugin selbst (herkunft: zentral bzw. server, docs/daten-v1.md „kapitel.json“); eine eigene KI schreibt nach diesem Gerüst, ohne herkunft. Datei „Lernplan/<Code> Lernplan.md“, Eigenschaften typ: lernplan, code, cssclasses: [eba, eba-s-lernplan-notiz], quelle (woher die Kapitelliste stammt), stand (Datum), optional seit, verstanden_bis, vorlaeufig: true (Liste teils geschätzt, etwa Lehrbuch-Einheiten, die die Vorlesung erst nach und nach nennt), vorlernen: false (ein Kapitel ist frühestens eine Woche nach seiner Vorlesung dran). Unter „## Kapitel“ je Kapitel eine Zeile „- [ ] <Nummer> <Titel>“, danach mit „ · “ der Link auf die Folien, sobald es sie gibt („[[B110 Folien 01 Grundlagen|Folien]]“, bei einem frei zugänglichen Lehrbuch „[online](https://…)“), die Seitenzahl („42 S.“), der Tag der ersten Vorlesung zum Kapitel („Vorlesung 19.10.2026“, erst wenn sie war) und des ersten Zwischentests, der es abfragt („Zwischentest 13.11.2026“, nur wenn die Veranstaltung das sagt); Unterkapitel eingerückt darunter. Häkchen setzt nur die Studentin oder der Student. Diese Zeile wird nicht übernommen. -->
<div class="eba-kopf">
<h1>{{titel}}</h1>
</div>

```eba-lernplan modul
Der Stand erscheint, sobald Studium Autopilot läuft.
```

## Kapitel

{{kapitel}}
