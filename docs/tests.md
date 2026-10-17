# Tests und automatische Prüfung

Zielgruppe: wer am Code mitarbeitet. Nutzer:innen brauchen nichts davon.

## Ohne Obsidian: `tests/`

```
node --test tests/*.test.js
```

Node 22 oder neuer, keine Abhängigkeiten, kein `npm install`. Getestet wird reine Logik direkt aus den Skripten des Tresors.
`tests/laden.js` lädt ein Skript aus `Studium Autopilot/System/Skripte/` mit einem kleinen Ersatz für Obsidian (nur das, was
beim Laden gebraucht wird).

| Datei | Prüft |
|---|---|
| `zentral.test.js` | id-Regel (Prüfwerte aus `docs/daten-v1.md`), Dateinamen der Termin-Notizen, Prüfung von Manifest, Terminen und Semesterdaten (gültige und ungültige Einträge, Säubern von Text, Grenzen), Schnappschuss der öffentlichen zentralen Daten mit SHA-256 |
| `modell.test.js` | Semestername aus dem Datum, Semesterliste aus Studienbeginn, Regel für Semester ohne Daten, Vorlesungswochen (WS 2026/27: 16, Weihnachtswoche zählt nicht), Wochenanzeige an typischen Tagen, abgeleitete Felder der Einstellungen |
| `update.test.js` | Update-Knopf (`update.js`): Dateiklassen (was ein Update ersetzen darf, was nie), Prüfung der Update-Liste, Entscheidung je Datei (ersetzen, deine Fassung + „(neu X)“, Haken übernehmen, Modulfelder mischen, `.obsidian`-Einstellungen ergänzen, gelöscht bleibt gelöscht), ganzer Ablauf mit Sicherung, alles oder nichts (falsche Prüfsumme, kein Netz, Schreibfehler → alter Stand), Kanal stabil/beta, Feld `release`/`beta` im Manifest; im veröffentlichten Repo die Update-Liste `system-dateien.json` gegen die Dateien |
| `ilias-netz.test.js` | Netz für ILIAS (`ilias-netz.js`): Keksdose (Pfad, Ablauf, Präfixe), Formulare lesen, Entitäten, Weiterleitungen byte-genau auflösen, Sitzung über beide Uni-Server (302/303/307/308, Schleifen, Höchstzahl), Sperre für fremde Server und http vor dem Senden, keine Kekse oder Formularwerte in Fehlern, Weg am PC und auf iPhone/iPad (`requestUrl` folgt selbst); Attrappe statt Netz |
| `ilias-html.test.js` | ILIAS-Seiten lesen (`ilias-html.js`): Zerleger, Anmeldestatus und Seitenart, Meine Kurse, Kurs-, Ordner-, Sitzungs- und Inhaltsseiten, Übungen, Datum und Größe in ILIAS-Schreibweise, Dateinamen, Download-Adressen, Formulare der Anmeldung |
| `ilias-anmeldung.test.js` | Anmeldung über Shibboleth (`ilias-anmeldung.js`) mit nachgespielten Servern: Erfolg, falsches Passwort, Zustimmungsseite (nie selbst zustimmen), Zwei-Faktor, noch gültige Sitzung, Formular oder Weiterleitung zu fremdem Server, Netzfehler; das Passwort geht nur an die Anmeldeseite der Uni und kommt nirgends zurück |
| `ilias.test.js` | ILIAS-Unterlagen (`ilias.js`), ganzer Ablauf mit erfundenem ILIAS und Tresor im Speicher (`tests/ilias-attrappen.js`): Ablage mit Begleitnotiz, zweiter Lauf ohne Downloads, gleiche Dateien, geänderte Dateien (ersetzen bzw. „neue Fassung“), gelöscht bleibt gelöscht, Umbenennen, Videos und Dateien über 50 MB, nur ein Gerät lädt, eigener Uni-Abgleich, Kurswahl, Grenzen je Lauf, Fehler mitten im Lauf, Index mischen, Kennwort nirgends (Status, Protokoll, Fehler, Dateien) |
| `unterlagen.test.js` | Benennen (`unterlagen.js`) nach „`<Code> <Art> <NN> <Titel>`“: Art, Nummer, Modulcode und Titel aus Pfad und Dateiname, schwacher Titel, Titel aus der ersten PDF-Seite, Begleitnotiz |

`tests/daten/v1/` ist ein Schnappschuss der öffentlichen zentralen Daten
(`https://studium-autopilot.github.io/ecoba-daten/v1/`). Ändert sich das Datenformat, wird er neu geholt.

`tests/daten/ilias-netz/` enthält öffentliche Anmeldeseiten von ILIAS und der Uni ohne Sitzungsdaten und eine nachgebaute
SAML-Antwort, `tests/daten/ilias-seiten/` erfundene ILIAS-Seiten mit dem Aufbau echter Seiten (Kurse, Ordner, Sitzungen,
Übungen). Darin stehen keine echten Namen und keine persönlichen Daten. Tests gegen das echte ILIAS mit einem echten
Uni-Konto sind privat und nicht im Repo.

Mit `ECOBA_LIVE=1` prüft ein zusätzlicher Test die **aktuellen** Daten von GitHub Pages (Prüfsummen, alle Einträge gültig).
In GitHub Actions läuft er als eigener Schritt, der den Lauf nicht rot macht.

## In Obsidian

Oberfläche, Knöpfe, Hot-Reload, der Datenkanal mit einer Testquelle, das Update mit einem lokalen Fake-Release (gültig und mit
falscher Prüfsumme, Neuladen des Plugins), der Schlüsselbund, der Netzweg von ILIAS auf iPhone/iPad (`requestUrl`) und die
Bases-Formeln lassen sich nur in Obsidian testen.
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
     `structuredClone`, keine Node-Module; einzige Ausnahme: `http`, `https` und `zlib` in `ilias-netz.js`, nur am PC
     hinter `Platform.isDesktopApp`).
2. **`node --test tests/*.test.js`**
3. **Safari 16** (iPhone/iPad mit iOS 16): esbuild gibt jedes Skript einmal mit Ziel `safari16` und einmal mit Ziel `esnext`
   aus. Sind die Ausgaben gleich, musste nichts umgeschrieben werden, das Skript läuft also auf Safari 16. Ein Selbsttest
   stellt sicher, dass die Methode Syntax erkennt, die erst Safari 16.4 kann. Unicode-Eigenschaften in Regex (`\p{L}`)
   gelten als unterstützt (Safari kann sie seit 11.1; esbuild stuft sie nur wegen neuerer Unicode-Tabellen strenger ein).

Lokal: `python werkzeuge/pruefen.py .` läuft auch ohne Node (dann ohne `node --check`, mit Hinweis).
