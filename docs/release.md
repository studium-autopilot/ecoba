# Ein Release bauen

Zielgruppe: der Autor bzw. wer Releases veröffentlicht.

**Grundsatz:** Dieses Repo ist nie die Arbeitskopie. Jeder Stand entsteht frisch aus einem **Export mit Freigabeliste**: Nur
ausdrücklich freigegebene Pfade kommen in den Release-Baum, alles andere bleibt draußen. Die Arbeits-Historie wird nie
hochgeladen.

## 1. Release-Baum bauen

In der Arbeitskopie (nicht in diesem Repo) baut ein Export-Skript den Baum in einen leeren Ordner:

- `Studium Autopilot/` aus dem letzten Commit der Arbeitskopie (nichts Ungetracktes), ohne Papierkorb, gerätelokale
  Obsidian-Dateien, Abrufer-Datei, `installiert.json` und fremde Plugins;
- `docs/`, `tests/`, `.github/`, `README.md`, `LICENSE`, `LICENSE-INHALTE.md`, `CONTRIBUTING.md`, `CHANGELOG.md`;
- `werkzeuge/pruefen.py`, eine eigene `.gitignore` und eine `.gitattributes` (`* -text`: Dateien byte-genau, sonst stimmen die
  Prüfsummen der Update-Liste nicht).

Dann schreibt der Export die **Update-Liste** `Studium Autopilot/System/Daten/system-dateien.json`: Version, und je Datei, die
ein Update ersetzen darf, Pfad, Klasse, Größe und SHA-256 (Regeln in `werkzeuge/pruefen.py`, `klasse_von`, gleich wie
`klasseVon` in `update.js`). Mit ihr aktualisiert der Knopf **Aktualisieren** im Plugin (siehe `docs/architektur.md`, „Update“).

Danach läuft **immer** `werkzeuge/pruefen.py` über den Baum, lokal zusätzlich mit einer privaten Sperrliste (Namen, die nie
veröffentlicht werden dürfen). Sie prüft auch, dass die Update-Liste zu den Dateien passt. Bei einem Fund bricht der Export mit
einer Liste ab; korrigiert wird in der Quelle, dann neu bauen.

Mit `--zip` baut der Export zusätzlich **`Studium-Autopilot.zip`** mit dem Ordner `Studium Autopilot/`. Der Name ist fest und
ohne Version: Die Anleitung, der grüne Knopf der README und der iOS-Kurzbefehl laden
`https://github.com/studium-autopilot/ecoba/releases/latest/download/Studium-Autopilot.zip`. **Das Asset muss bei jedem
Release genau so heißen.**

Am Ende druckt der Export den Block für das Manifest der zentralen Daten (`release` mit `version`, `url_basis`, `sha256` der
Update-Liste, `notiz`), siehe Schritt 6.

## 2. Prüfen

```
python werkzeuge/pruefen.py .
npm ci && npm test && npm run lint
python -m ruff check werkzeuge/
```

`tests/update.test.js` prüft dabei auch die Update-Liste im Baum (Klassen, Größen, Prüfsummen, keine Datei vergessen).
Dazu der Testdurchgang in Obsidian (siehe `docs/tests.md`): den Baum als neuen Tresor mit anderem Namen öffnen, iPhone, iPad,
Android, Windows, Mac, hell und dunkel.

## 3. Commit

Den Baum in einen Klon dieses Repos kopieren (vorher alles außer `.git/` löschen, damit entfernte Dateien auch hier
verschwinden), prüfen, was sich geändert hat (`git status`, `git diff --stat`), und **einen** Commit mit einer kurzen
Beschreibung anlegen. Kein Force-Push (auf GitHub ohnehin gesperrt). GitHub Actions (`.github/workflows/pruefen.yml`) muss
grün sein. Commits und Tags sind signiert (SSH-Schlüssel, „Verified“ auf GitHub).

Dependabot schlägt monatlich neuere Versionen der Actions und von ESLint vor. Einen gemergten Dependabot-PR in der
Arbeitskopie nachziehen (`.github/`, `package.json`, `package-lock.json`), sonst überschreibt ihn der nächste Export.

## 4. Version und Tag

- Version in `manifest.json` des Plugins (`version`) und `CHANGELOG.md` erhöhen – in der Arbeitskopie, vor dem Export.
- Tag auf den Release-Commit: `git tag -m "Studium Autopilot EcoBA 0.2.0" v0.2.0` und `git push origin v0.2.0`. Die
  Update-Liste und alle Dateien werden über `raw.githubusercontent.com/studium-autopilot/ecoba/v<version>/` geladen; der Tag
  darf danach nie verschoben werden. GitHub erzwingt das: Ein Ruleset sperrt `v*`-Tags gegen Ändern und Löschen.

## 5. GitHub-Release

Auf GitHub unter **Releases** → **Draft a new release** den Tag wählen, die Notizen aus `CHANGELOG.md` übernehmen und
**`Studium-Autopilot.zip`** anhängen (genau dieser Name). Titel wie die Überschrift im Changelog:
`0.3.1 – Update-Hinweis auf dem Dashboard`. Als **Latest release** veröffentlichen. Releases sind unveränderlich (Immutable
Releases): Nach dem Veröffentlichen lassen sich Assets nicht mehr tauschen, also erst als Entwurf vollständig machen. Das ZIP enthält nur den
Tresor-Ordner, so wie Nutzer:innen ihn brauchen (siehe `docs/installation.md`).

## 6. Erst jetzt: Update anbieten (Daten-Repo)

Erst wenn Tag **und** Release mit Asset öffentlich sind, im Manifest der zentralen Daten (`ecoba-daten`, `v1/manifest.json`,
bzw. in der Konfiguration des Exports) setzen:

- `plugin_aktuell`: die neue Version;
- `release`: den Block, den `werkzeuge/release.py` gedruckt hat (`version`, `url_basis`, `sha256`), dazu `notiz` (ein Satz,
  was neu ist, höchstens 200 Zeichen).

Ab dem nächsten Abruf zeigt die Zeile „Studium Autopilot“ in **Einstellungen & Hilfe** → **Verbindungen** „Neue Version …
verfügbar“ mit dem Knopf **Aktualisieren**. Vorher gesetzt, bekäme jemand eine Version angeboten, deren Dateien es noch nicht
gibt (das Update bricht dann ohne Schaden ab). Vertrag: `docs/daten-v1.md`, „Update-Angaben“.

## Beta

Für Tests vor dem Release (zum Beispiel im eigenen Test-Tresor mit Kanal „Beta“):

1. `python werkzeuge/release.py --zip --beta 1` – im Baum wird die Plugin-Version `X.Y.Z` zu `X.Y.Z-beta.1` (die Quelle bleibt),
   die Update-Liste trägt diese Version, gedruckt wird ein Block `beta`.
2. Commit, Tag `vX.Y.Z-beta.1` pushen.
3. GitHub-Release mit diesem Tag als **Vorab-Release** („Set as a pre-release“), **nicht** als Latest; Asset
   `Studium-Autopilot.zip`. So laden der grüne Knopf und der iOS-Kurzbefehl (`releases/latest`) weiter die stabile Version.
4. Im Manifest der zentralen Daten `beta` setzen (nicht `release`, nicht `plugin_aktuell`).

Nur Tresore mit `update_kanal: beta` in `System/Einstellungen.md` (Schalter **Beta-Versionen** im Fenster „Studium Autopilot“
unter „Mehr erfahren“) bekommen die Beta angeboten. Nach dem fertigen Release `X.Y.Z` ist `release` wieder höher als die Beta;
die Beta-Tresore bekommen dann die fertige Version. `beta` kann stehen bleiben oder entfernt werden.

**Zwei Assets je Release:** `Studium-Autopilot.zip` (Mac, Windows, Android, Update-Prüfsummen) und `Studium-Autopilot-iOS.zip`
(gleicher Inhalt, eine Ebene tiefer verschachtelt) für den iOS-Kurzbefehl `docs/kurzbefehl/`. Beide Namen sind fest; `release.py --zip` erzeugt beide.
