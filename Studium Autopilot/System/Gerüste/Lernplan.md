<!-- Gerüst für Lernplan-Notizen (System/Skripte/lernplan.js). Lernplan-Notizen aus den zentralen Kapitellisten schreibt das Plugin selbst (herkunft: zentral, docs/daten-v1.md „kapitel.json“); eine eigene KI (Claude auf dem eigenen Server) schreibt nach diesem Gerüst, ohne herkunft: zentral. Datei „Lernplan/<Code> Lernplan.md“, Eigenschaften typ: lernplan, code, cssclasses: [eba, eba-s-lernplan-notiz], quelle (woher die Kapitelliste stammt), stand (Datum), optional seit, verstanden_bis, vorlaeufig: true (Liste teils geschätzt, etwa Lehrbuch-Einheiten, die die Vorlesung erst nach und nach nennt). Unter „## Kapitel“ je Kapitel eine Zeile „- [ ] <Nummer> <Titel>“, danach mit „ · “ der Link auf die Folien, sobald es sie gibt (bei einem frei zugänglichen Lehrbuch „[online](https://…)“), und die Seitenzahl („42 S.“); Unterkapitel eingerückt darunter. Häkchen setzt nur die Studentin oder der Student. Diese Zeile wird nicht übernommen. -->
<div class="eba-kopf">
<h1>{{titel}}</h1>
</div>

```eba-lernplan modul
Der Stand erscheint, sobald Studium Autopilot läuft.
```

## Kapitel

{{kapitel}}
