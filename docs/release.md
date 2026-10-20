# Ein Release bauen

Zielgruppe: der Autor bzw. wer Releases veröffentlicht.

**Grundsatz:** Dieses Repo ist nie die Arbeitskopie. Jeder Stand entsteht frisch aus einem **Export mit Freigabeliste**: Nur
ausdrücklich freigegebene Pfade kommen in den Release-Baum, alles andere bleibt draußen. Die Arbeits-Historie wird nie
hochgeladen.

## 1. Release-Baum bauen

In der Arbeitskopie (nicht in diesem Repo) baut ein Export-Skript den Baum in einen leeren Ordner, **alles aus dem letzten
Commit** der Arbeitskopie (`git archive`):

- `Studium Autopilot/` ohne Papierkorb, gerätelokale Obsidian-Dateien, fremde Plugins und ohne die Dateien, die ein Tresor
  selbst anlegt (Abrufer-Sperren, `installiert.json`, ILIAS-Index, Lernstände, Noten aus Alma, Textfassungen der PDFs);
- `docs/`, `tests/` (ohne die Tests für Teile, die nicht im Release sind, etwa `server/`), `.github/`, `README.md`, `LICENSE`,
  `LICENSE-INHALTE.md`, `CONTRIBUTING.md`, `CHANGELOG.md`;
- `werkzeuge/pruefen.py`, eine eigene `.gitignore` und eine `.gitattributes` (`* -text`: Dateien byte-genau, sonst stimmen die
  Prüfsummen der Update-Liste nicht).

Geänderte, aber nicht committete und neue, ungetrackte Dateien kommen nie in den Baum, auch nicht unter `docs/` oder
`tests/`. Der Export nennt sie als **WARNUNG** („nicht committet“); vor einem Release darf sie nicht erscheinen. Nur zum
Testen nimmt `--arbeitsstand` den Arbeitsordner statt des Commits; so gebaut wird nie veröffentlicht.

Dann schreibt der Export die **Update-Liste** `Studium Autopilot/System/Daten/system-dateien.json`: Version, und je Datei, die
ein Update ersetzen darf, Pfad, Klasse, Größe und SHA-256 (Regeln in `werkzeuge/pruefen.py`, `klasse_von`, gleich wie
`klasseVon` in `update.js`). Mit ihr installiert der Knopf **Neue Version installieren** im Plugin die neue Version (siehe `docs/architektur.md`, „Update“).

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
**`Studium-Autopilot.zip`** und **`studium-server.tar.gz`** anhängen (genau diese Namen; beide aus `release.py --zip`). Das
Server-Paket lädt die Einrichtung des eigenen Servers und täglich `studium-server aktualisieren`, beide nur mit der Prüfsumme,
die GitHub zum Asset zeigt; fehlt es, bleibt jeder eigene Server auf seinem Stand. Die Anleitung der Einrichtung im Baum lädt
genau das Paket ihrer Version (`release.py` setzt `releases/tags/v<version>` ein); bis das Release mit Asset öffentlich ist,
scheitert dort der Download, statt ein Paket einer anderen Version zu nehmen. Titel wie die Überschrift im Changelog:
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
verfügbar“ mit dem Knopf **Neue Version installieren**. Vorher gesetzt, bekäme jemand eine Version angeboten, deren Dateien es noch nicht
gibt (das Update bricht dann ohne Schaden ab). Vertrag: `docs/daten-v1.md`, „Update-Angaben“.

**Neue Regeln für das Update wirken erst ab dem nächsten Mal.** Ein Update plant immer der `update.js`, der beim Tipp läuft,
also der der *installierten* Version. Was der alte Planer anders macht, gleicht die Reparatur des neuen `update.js` nach dem
ersten Laden aus, nur mit Dateien, die schon im Tresor liegen (`docs/architektur.md`, „Update“ → „Reparatur nach dem
Update“; erster Fall 0.4.4: von Hand geänderte Darstellung). Ändert ein Release die Update-Regeln, darum auch den Weg „alter
Planer, dann Reparatur“ prüfen, etwa mit dem Test-Tresor der Vorversion.

## Nur README und Bilder veröffentlichen (ohne Version)

Zwischen zwei Releases darf die README samt Bildern auf `main` aktualisiert werden, ohne Version, Tag und Release. Nur mit
Freigabe des Autors und nur so:

1. Frischer Klon dieses Repos (`main`) in einen leeren Ordner.
2. Nur `README.md` und Dateien unter `docs/bilder/` aus einem Commit der Arbeitskopie übernehmen (`git show <commit>:README.md`).
   Bilder, die danach nichts im Baum mehr verwendet, löschen; vorher im ganzen Baum nach dem Dateinamen suchen.
3. `git status` zeigt nur `README.md` und `docs/bilder/`: nie Dateien des Tresors, `system-dateien.json`, andere Doku, Tests
   oder `.github/`. Die README verlinkt nur auf Dateien und Anker, die es in `main` gibt, und die Bilder zeigen keine
   Funktion, die die veröffentlichte Version nicht hat.
4. `python werkzeuge/pruefen.py .` im Klon, lokal mit der privaten Sperrliste (`--sperrliste`), ohne Funde.
5. Ein signierter Commit (Identität wie oben), Push auf `main`. Kein Tag, kein Release, das Manifest der zentralen Daten
   bleibt, wie es ist. GitHub Actions muss grün sein.

Der nächste Export ersetzt `main` ohnehin durch den ganzen Stand; README und Bilder müssen darum auch in der Arbeitskopie
committet sein.

## Beta

Für Tests vor dem Release (zum Beispiel im eigenen Test-Tresor mit Kanal „Beta“):

1. `python werkzeuge/release.py --zip --beta 1` – im Baum wird die Plugin-Version `X.Y.Z` zu `X.Y.Z-beta.1` (die Quelle bleibt),
   die Update-Liste trägt diese Version, gedruckt wird ein Block `beta`.
2. Commit, nur den Tag `vX.Y.Z-beta.1` pushen, **nie `main`**: `main` zeigt immer die stabile Version.
3. GitHub-Release mit diesem Tag als **Vorab-Release** („Set as a pre-release“), **nicht** als Latest; Assets
   `Studium-Autopilot.zip` und `studium-server.tar.gz`. So laden der grüne Knopf, der iOS-Kurzbefehl, die Server-Einrichtung
   und das Update eigener Server (`releases/latest`) weiter die stabile Version. Die Server-Einrichtung einer Beta testet man
   mit dem Prompt aus dem README, nur mit `vX.Y.Z-beta.1` statt der Version aus `releases/latest`: Die Anleitung dieses Tags
   lädt genau sein Server-Paket.
4. Im Manifest der zentralen Daten `beta` setzen (nicht `release`, nicht `plugin_aktuell`).

Nur Tresore mit `update_kanal: beta` in `System/Einstellungen.md` (Schalter **Beta-Versionen** im Fenster „Studium Autopilot“
unter „Mehr erfahren“) bekommen die Beta angeboten. Nach dem fertigen Release `X.Y.Z` ist `release` wieder höher als die Beta;
die Beta-Tresore bekommen dann die fertige Version. `beta` kann stehen bleiben oder entfernt werden.

**Zwei Assets je Release:** `Studium-Autopilot.zip` (Mac, Windows, Android, Update-Prüfsummen) und `Studium-Autopilot-iOS.zip`
(gleicher Inhalt, eine Ebene tiefer verschachtelt) für den iOS-Kurzbefehl `docs/kurzbefehl/`. Beide Namen sind fest; `release.py --zip` erzeugt beide.
