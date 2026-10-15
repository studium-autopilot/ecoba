# Ein Release bauen

Zielgruppe: der Autor bzw. wer Releases veröffentlicht.

**Grundsatz:** Dieses Repo ist nie die Arbeitskopie. Jeder Stand entsteht frisch aus einem **Export mit Freigabeliste**: Nur
ausdrücklich freigegebene Pfade kommen in den Release-Baum, alles andere bleibt draußen. Die Arbeits-Historie wird nie
hochgeladen.

## 1. Release-Baum bauen

In der Arbeitskopie (nicht in diesem Repo) baut ein Export-Skript den Baum in einen leeren Ordner:

- `Studium Autopilot/` aus dem letzten Commit der Arbeitskopie (nichts Ungetracktes), ohne Papierkorb, gerätelokale
  Obsidian-Dateien, Abrufer-Datei und fremde Plugins;
- `docs/`, `tests/`, `.github/`, `README.md`, `LICENSE`, `LICENSE-INHALTE.md`, `CONTRIBUTING.md`, `CHANGELOG.md`;
- `werkzeuge/pruefen.py` und eine eigene `.gitignore`.

Danach läuft **immer** `werkzeuge/pruefen.py` über den Baum, lokal zusätzlich mit einer privaten Sperrliste (Namen, die nie
veröffentlicht werden dürfen). Bei einem Fund bricht der Export mit einer Liste ab; korrigiert wird in der Quelle, dann neu
bauen. Optional baut der Export das ZIP `Studium-Autopilot-<version>.zip` mit dem Ordner `Studium Autopilot/`; die Version
kommt aus `Studium Autopilot/.obsidian/plugins/studium-autopilot/manifest.json`.

## 2. Prüfen

```
python werkzeuge/pruefen.py .
node --test tests/*.test.js
```

Dazu der Testdurchgang in Obsidian (siehe `docs/tests.md`): den Baum als neuen Tresor mit anderem Namen öffnen, iPhone, iPad,
Android, Windows, Mac, hell und dunkel.

## 3. Commit

Den Baum in einen Klon dieses Repos kopieren (vorher alles außer `.git/` löschen, damit entfernte Dateien auch hier
verschwinden), prüfen, was sich geändert hat (`git status`, `git diff --stat`), und **einen** Commit mit einer kurzen
Beschreibung anlegen. Kein Force-Push. GitHub Actions (`.github/workflows/pruefen.yml`) muss grün sein.

## 4. Version und Tag

- Version in `manifest.json` des Plugins (`version`) und `CHANGELOG.md` erhöhen – in der Arbeitskopie, vor dem Export.
- Tag auf den Release-Commit: `git tag v0.1.0` und `git push origin v0.1.0`.
- Im Daten-Repo `ecoba-daten` `plugin_aktuell` im Manifest auf die neue Version setzen; dann zeigt das Plugin
  „Neue Version verfügbar“.

## 5. GitHub-Release

Auf GitHub unter **Releases** → **Draft a new release** den Tag wählen, die Notizen aus `CHANGELOG.md` übernehmen und das
ZIP `Studium-Autopilot-<version>.zip` anhängen. Das ZIP enthält nur den Tresor-Ordner, so wie Nutzer:innen ihn brauchen
(siehe `docs/installation.md`).
