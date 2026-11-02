# Ausgabeformat: Eingang v1

Schreibe genau eine Datei `ausgabe.json` mit diesem Aufbau (UTF-8, gültiges JSON):

```json
{
  "quellen": ["gmail", "uni-postfach"],
  "gmail": "ok",
  "weiterleitung": "ok",
  "gmail_ueberblick": { "gelistet": 23, "gelesen": 4, "begrenzt": false },
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
    { "text": "Für E101 sind neue Folien zu Kapitel 3 angekündigt.", "quelle": "Kursmail, 17.10.2026", "code": "E101" }
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
| `gmail_ueberblick` | nur wenn Gmail dran war: `gelistet` = Mails im Überblick (termine.md, Gmail Schritt 2), `gelesen` = wie viele davon du ganz gelesen hast (ohne die aus Schritt 1), `begrenzt`: `true`, wenn eine Grenze griff (4 Seiten im Überblick oder 30 zum Lesen); nur diese Zahlen |
| `termine[].schluessel` | stabil, aus Quelle und Nummer (siehe termine.md); höchstens 200 Zeichen |
| `titel` | 1–120 Zeichen, eine Zeile, ohne `[ ] < > { } \| \` ` und ohne Links |
| `datum`, `bis` | `JJJJ-MM-TT`; `bis` nur bei mehrtägigen Terminen, sonst `""` |
| `uhrzeit` | `""`, `HH:MM` oder `HH:MM–HH:MM` |
| `ort` | höchstens 120 Zeichen |
| `kategorie` | genau eine aus: `Semester`, `Vorlesungsfrei`, `Prüfung`, `Frist`, `Einführung`, `Lehre`, `Fachschaft`, `Veranstaltung` |
| `status` | `offiziell` oder `geschätzt` |
| `code` | Modulcode wie `B110`, `E101`, `SQ888` oder `""` |
| `quelle_text`, `info` | je höchstens 200 Zeichen, reiner Text, eigene Worte, keine Links |
| `entfaellt` | nur bei abgesagten Terminen: `true` |
| `hinweise[]` | `text` höchstens 300 Zeichen, `quelle` höchstens 200; `code`: Modulcode, wenn der Hinweis zu genau einem Modul gehört (er steht dann auch auf dessen Seite), sonst weglassen |
| `todo_doppel[]` | höchstens 50 Paare aus `id`s von `tresor.json` (termine.md, „Doppelte To-dos“); weglassen, wenn es keine gibt |

**Begleitnotizen** (nur wenn `auftrag.md` neue Unterlagen nennt, Inhalt nach begleitnotiz.md): ein weiteres Feld

```json
"begleitnotizen": [
  {
    "datei": "Unterlagen/B110 Einführung in die BWL/B110 Folien 02 Kosten.pdf",
    "wichtigste": [{ "begriff": "Deckungsbeitrag", "text": "Erlös minus variable Kosten.", "seite": 7, "bis": 8 }],
    "zu_tun": [{ "text": "Aufgabe 2.3 vorbereiten", "frist": "2026-10-29", "seite": 12 }],
    "fragen": [{ "text": "Warum zählen fixe Kosten kurzfristig nicht?", "seite": 9 }]
  }
]
```

| Feld | Regel |
|---|---|
| `datei` | genau der Pfad aus der Zeile `Datei:` der Textfassung |
| `wichtigste[]` | höchstens 12, `text` höchstens 300 Zeichen, `begriff` höchstens 60 (fett davor) oder weglassen |
| `zu_tun[]` | höchstens 12, `text` höchstens 200 Zeichen, `frist` `JJJJ-MM-TT` oder weglassen |
| `fragen[]` | höchstens 10, `text` höchstens 200 Zeichen |
| `seite`, `bis` | in allen drei Listen: erste und letzte Seite als Zahl; `bis` nur bei mehreren Seiten, sonst weglassen |

**Kapitellisten** (nur wenn `auftrag.md` neue Folien für Kapitellisten nennt, Inhalt nach lernplan.md): ein weiteres Feld, je
Modul die ganze Liste, nur wenn sie neu ist oder sich geändert hat

```json
"kapitel": [
  {
    "code": "B110",
    "semester": "WS 2026/27",
    "quelle": "Folien 00 Einführung, S. 9",
    "stand": "2026-10-16",
    "kapitel": [
      { "nr": "1", "titel": "Grundlagen", "seiten": 42, "folien": 1, "vorlesung": "2026-10-14", "teile": [{ "nr": "1.1", "titel": "Grundbegriffe" }] },
      { "nr": "2", "titel": "Kosten und Erlöse", "folien": 2, "zwischentest": "2026-12-02" },
      { "nr": "3", "titel": "Investition" }
    ]
  }
]
```

| Feld | Regel |
|---|---|
| `code`, `semester` | ein Code aus `lernplan.module` in `stand.json`, `semester` genau wie dort; je Modul ein Eintrag (höchstens 60) |
| `quelle` | höchstens 120 Zeichen, reiner Text |
| `stand` | `JJJJ-MM-TT`, nie nach heute; weglassen = heute |
| `vorlaeufig` | `true` oder weglassen |
| `kapitel[]` | 1–40, `nr` je Modul nur einmal |
| `nr` | 1–8 Zeichen: Ziffer oder Großbuchstabe, dann Buchstaben, Ziffern, Punkte (`1`, `IV`, `E`, `2.3`) |
| `titel` | 1–140 Zeichen, eine Zeile, ohne `[ ] < > { } \| \` und ohne Links |
| `seiten` | ganze Zahl 1–2000 oder weglassen |
| `folien` | ganze Zahl 0–99 (`Nummer:` der Folien) oder weglassen |
| `vorlesung`, `zwischentest` | `JJJJ-MM-TT` oder weglassen; `vorlesung` nie nach heute |
| `url` | `https` auf `uni-tuebingen.de` oder `core-econ.org` oder weglassen |
| `teile[]` | höchstens 40 `{ nr, titel }` mit denselben Regeln |

Ein ungültiges Kapitel oder Unterkapitel verwirft das ganze Modul, die anderen bleiben.

Der Server prüft jede Zeile. Was die Regeln verletzt, fällt einzeln weg; die id jedes Termins bildet der Server aus dem
`schluessel`. Gibt es nichts Neues, schreibe `{ "quellen": [...], "termine": [], "hinweise": [] }`.
