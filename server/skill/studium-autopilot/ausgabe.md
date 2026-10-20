# Ausgabeformat: Eingang v1

Schreibe genau eine Datei `ausgabe.json` mit diesem Aufbau (UTF-8, gültiges JSON):

```json
{
  "quellen": ["gmail", "uni-postfach"],
  "gmail": "ok",
  "weiterleitung": "ok",
  "termine": [
    {
      "schluessel": "gmail:18f3a2b4c5d6e7f8#1",
      "titel": "B110 Anmeldung zum Tutorium",
      "datum": "2026-10-27",
      "bis": "",
      "uhrzeit": "10:00",
      "ort": "ILIAS",
      "kategorie": "Frist",
      "status": "offiziell",
      "code": "B110",
      "quelle_text": "Mail des Lehrstuhls, 17.10.2026",
      "info": "Anmeldung nur über ILIAS, Plätze begrenzt."
    }
  ],
  "hinweise": [
    { "text": "Für E101 sind neue Folien zu Kapitel 3 angekündigt.", "quelle": "Kursmail, 17.10.2026" }
  ],
  "todo_doppel": [
    { "behalten": "t-1k3x9q", "weg": "t-7p2m0a" }
  ]
}
```

| Feld | Regel |
|---|---|
| `quellen` | welche Quellen du in diesem Lauf wirklich gelesen hast: `gmail`, `uni-postfach` |
| `gmail` | `ok`, wenn die Gmail-Suche lief; `fehlt`, wenn der Connector nicht verfügbar war; weglassen, wenn Gmail nicht dran war |
| `weiterleitung` | nur wenn Gmail dran war: `ok`, wenn `to:student.uni-tuebingen.de newer_than:30d` Treffer hat, sonst `fehlt` |
| `termine[].schluessel` | stabil, aus Quelle und Nummer (siehe termine.md); höchstens 200 Zeichen |
| `titel` | 1–120 Zeichen, eine Zeile, ohne `[ ] < > { } \| \` ` und ohne Links |
| `datum`, `bis` | `JJJJ-MM-TT`; `bis` nur bei mehrtägigen Terminen, sonst `""` |
| `uhrzeit` | `""`, `HH:MM` oder `HH:MM–HH:MM` |
| `ort` | höchstens 120 Zeichen |
| `kategorie` | genau eine aus: `Semester`, `Vorlesungsfrei`, `Prüfung`, `Frist`, `Einführung`, `Lehre`, `Fachschaft`, `Veranstaltung` |
| `status` | `offiziell` oder `geschätzt` |
| `code` | Modulcode wie `B110`, `E101`, `SQ888` oder `""` |
| `quelle_text`, `info` | je höchstens 200 Zeichen, reiner Text, eigene Worte |
| `entfaellt` | nur bei abgesagten Terminen: `true` |
| `hinweise[]` | `text` höchstens 300 Zeichen, `quelle` höchstens 200 |
| `todo_doppel[]` | höchstens 50 Paare aus `id`s von `tresor.json` (termine.md, „Doppelte To-dos“); weglassen, wenn es keine gibt |

**Begleitnotizen** (nur wenn `auftrag.md` neue Unterlagen nennt, Inhalt nach begleitnotiz.md): ein weiteres Feld

```json
"begleitnotizen": [
  {
    "datei": "Unterlagen/B110 Einführung in die BWL/B110 Folien 02 Kosten.pdf",
    "wichtigste": [{ "text": "Deckungsbeitrag: Erlös minus variable Kosten.", "seite": 7 }],
    "zu_tun": [{ "text": "Aufgabe 2.3 vorbereiten", "frist": "2026-10-29" }],
    "fragen": [{ "text": "Warum zählen fixe Kosten kurzfristig nicht?" }]
  }
]
```

| Feld | Regel |
|---|---|
| `datei` | genau der Pfad aus der Zeile `Datei:` der Textfassung |
| `wichtigste[]` | höchstens 12, `text` höchstens 300 Zeichen, `seite` als Zahl |
| `zu_tun[]` | höchstens 12, `text` höchstens 200 Zeichen, `frist` `JJJJ-MM-TT` oder weglassen |
| `fragen[]` | höchstens 10, `text` höchstens 200 Zeichen |

Der Server prüft jede Zeile. Was die Regeln verletzt, fällt einzeln weg; die id jedes Termins bildet der Server aus dem
`schluessel`. Gibt es nichts Neues, schreibe `{ "quellen": [...], "termine": [], "hinweise": [] }`.
