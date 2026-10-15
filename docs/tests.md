# Tests und automatische Prüfung

Zielgruppe: wer am Code mitarbeitet. Nutzer:innen brauchen nichts davon.

## Ohne Obsidian: `tests/`

```
node --test tests/*.test.js
```

Node 22 oder neuer, keine Abhängigkeiten, kein `npm install`. Getestet wird reine Logik direkt aus den Skripten des Vaults.
`tests/laden.js` lädt ein Skript aus `Studium Autopilot/System/Skripte/` mit einem kleinen Ersatz für Obsidian (nur das, was
beim Laden gebraucht wird).

| Datei | Prüft |
|---|---|
| `zentral.test.js` | id-Regel (Prüfwerte aus `docs/daten-v1.md`), Dateinamen der Termin-Notizen, Prüfung von Manifest, Terminen und Semesterdaten (gültige und ungültige Einträge, Säubern von Text, Grenzen), Schnappschuss der öffentlichen zentralen Daten mit SHA-256 |
| `modell.test.js` | Semestername aus dem Datum, Semesterliste aus Studienbeginn, Regel für Semester ohne Daten, Vorlesungswochen (WS 2026/27: 16, Weihnachtswoche zählt nicht), Wochenanzeige an typischen Tagen, abgeleitete Felder der Einstellungen |

`tests/daten/v1/` ist ein Schnappschuss der öffentlichen zentralen Daten
(`https://studium-autopilot.github.io/ecoba-daten/v1/`). Ändert sich das Datenformat, wird er neu geholt.

Mit `ECOBA_LIVE=1` prüft ein zusätzlicher Test die **aktuellen** Daten von GitHub Pages (Prüfsummen, alle Einträge gültig).
In GitHub Actions läuft er als eigener Schritt, der den Lauf nicht rot macht.

## In Obsidian

Oberfläche, Knöpfe, Hot-Reload, der Datenkanal mit einer Testquelle und die Bases-Formeln lassen sich nur in Obsidian testen.
Diese Tests laufen auf dem Entwickler-PC über die Obsidian-Kommandozeile und sind nicht im Repo. Die Testeinstiege (z. B.
`plugin.testDatum`, `plugin.testQuelle`) beschreibt `docs/architektur.md` im Abschnitt „Tests“. Vor einem Release gehört dazu
ein Durchgang auf iPhone, iPad, Android, Windows und Mac, jeweils hell und dunkel.

## GitHub Actions: `.github/workflows/pruefen.yml`

Bei jedem Push und Pull Request:

1. **`python werkzeuge/pruefen.py .`** – Datenschutz- und Qualitätsprüfung, nur Python-Standardbibliothek:
   - keine privaten Ordner, keine gerätelokalen Obsidian-Dateien (Arbeitsbereich, Papierkorb, Plugin-Einstellungen), nur das
     Plugin `studium-autopilot`;
   - keine PDF-, Office-, Anki-, Archiv- oder Mediendateien; Bilder nur in `docs/bilder/`; höchstens 2 MB je Datei;
   - keine persönlichen Pfade, Server-Hinweise, IP-Adressen, E-Mail-Adressen (außer Funktionsadressen der Uni und
     GitHub-noreply), Telefonnummern, geteilten Lehrmaterial-Links, Zugangsdaten, Token oder Sync-Konfiguration; der Name
     des Autors nur in den Autorenangaben;
   - die Vorlage ist leer: keine Noten, Versuche, eigenen Termine oder Notizen;
   - Syntax aller Skripte mit `node --check` und die iOS-Regeln (kein Regex-Lookbehind, kein `.at()`, `findLast`,
     `structuredClone`, keine Node-Module).
2. **`node --test tests/*.test.js`**
3. **Safari 16** (iPhone/iPad mit iOS 16): esbuild gibt jedes Skript einmal mit Ziel `safari16` und einmal mit Ziel `esnext`
   aus. Sind die Ausgaben gleich, musste nichts umgeschrieben werden, das Skript läuft also auf Safari 16. Ein Selbsttest
   stellt sicher, dass die Methode Syntax erkennt, die erst Safari 16.4 kann.

Lokal: `python werkzeuge/pruefen.py .` läuft auch ohne Node (dann ohne `node --check`, mit Hinweis).
