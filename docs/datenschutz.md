# Datenschutz

Kurz: Studium Autopilot holt Daten, schickt aber nichts über dich an den Autor oder an Dritte. Es gibt kein Konto, keine
Statistik und keine Telemetrie. Nur wenn du ILIAS verbindest, meldet sich das Plugin mit deinem Uni-Zugang an, direkt von
deinem Gerät bei der Uni.

## Was das Plugin abruft

| Was | Woher | Wann |
|---|---|---|
| Zentrale Daten (Termine, Fristen, Semesterdaten) | `studium-autopilot.github.io` (GitHub Pages) | beim Start, dann etwa stündlich, solange Obsidian offen ist |
| Dein Stundenplan | direkt von Alma (`alma.uni-tuebingen.de`) | nur wenn du Alma verbunden hast, beim Verbinden und auf Knopfdruck |
| Deine Kursdateien | direkt von ILIAS (`ovidius.uni-tuebingen.de`), Anmeldung bei der Uni (`idp.uni-tuebingen.de`) | nur wenn du ILIAS verbunden hast: beim Start, dann etwa stündlich, solange Obsidian offen ist, und auf Knopfdruck |
| Neue Version der Vorlage | `raw.githubusercontent.com` (dieses Repo auf GitHub) | nur wenn du bei „Studium Autopilot“ auf **Aktualisieren** tippst |

- Das sind normale Abrufe wie beim Öffnen einer Webseite. Dabei sieht GitHub bzw. die Uni deine IP-Adresse. Philip als Autor sieht davon nichts.
- Von selbst werden nur Daten abgerufen (JSON, Kalenderdaten und deine Kursdateien, die nur abgelegt und nie ausgeführt
  werden), nie Programmcode. Programmteile einer neuen Version lädt das Plugin nur nach deinem Tipp auf **Aktualisieren**,
  aus diesem Repo, und prüft jede Datei mit einer Prüfsumme.
- Mit dem Abruf der zentralen Daten werden keine Angaben über dich mitgeschickt: kein Name, keine Module, keine Noten.

## Was auf deinem Gerät bleibt

- **Dein Alma-Link** liegt nur im Speicher von Obsidian auf diesem Gerät. Er steht in keiner Notiz und wird nicht synchronisiert. In Alma kannst du ihn jederzeit erneuern; in Obsidian löschst du ihn unter **Einstellungen & Hilfe** → **Verbindungen** → Alma → **Trennen**.
- **Dein ILIAS-Passwort** liegt nur im Schlüsselbund von Obsidian auf diesem Gerät, vom Betriebssystem verschlüsselt. Es
  steht in keiner Notiz, wird nicht synchronisiert und erscheint in keinem Protokoll und keiner Fehlermeldung. Auf jedem
  Gerät gibst du es selbst ein. Deinen ILIAS-Benutzernamen speichert Obsidian wie den Alma-Link nur auf diesem Gerät.
- **Deine Angaben, Noten und Notizen** sind normale Dateien in deinem Tresor. Sie verlassen das Gerät nur, wenn du selbst einen Sync-Dienst einrichtest (dann gelten dessen Regeln).
- **Andere Passwörter** werden nie gespeichert, auch nicht für Alma oder Mail.

## ILIAS-Unterlagen

Freiwillig: Ohne Verbindung meldet sich das Plugin nie bei ILIAS an.

- **Wohin etwas geht:** Benutzername und Passwort gehen nur an die Anmeldeseite der Uni (`idp.uni-tuebingen.de`). Danach
  holt das Plugin bei ILIAS (`ovidius.uni-tuebingen.de`) deine Kursliste und die Dateien deiner Kurse. Nur über https; jeden
  anderen Server sperrt das Plugin, auch bei Weiterleitungen. Kein Server dazwischen, keine KI.
- **Was in deinem Tresor liegt:** die geladenen Dateien unter `Unterlagen/` mit je einer Begleitnotiz, die Liste
  `System/Daten/ilias.json` (welche ILIAS-Datei wo liegt, damit kein Gerät doppelt lädt) und `System/Daten/ilias-abruf.json`
  (welches Gerät gerade lädt). Diese Dateien kommen mit deinem Sync auf deine anderen Geräte. Ein Passwort steht nicht darin.
- **Zustimmung bei der Uni:** Fragt die Uni, ob ILIAS deine Daten bekommen darf, stimmt das Plugin nie für dich zu. Dann
  meldest du dich einmal im Browser bei ILIAS an.
- **Die Dateien bleiben bei dir.** Studium Autopilot verteilt keine Unterlagen weiter, weder zentral noch an andere.
  Folien, Skripte und Altklausuren sind urheberrechtlich geschützt: nur für dein Studium, nicht weitergeben oder
  veröffentlichen.

**Trennen:** **Einstellungen & Hilfe** → **Verbindungen** → ILIAS-Unterlagen → **Mehr erfahren** → **Trennen**. Das löscht Passwort und
Benutzernamen auf diesem Gerät. Geladene Dateien bleiben in deinem Tresor. Andere Geräte trennst du jeweils dort.

## Zentrale Daten ausschalten

1. **Einstellungen & Hilfe** → **Verbindungen** öffnen.
2. Bei „Zentrale Daten“ auf **Mehr erfahren** tippen.
3. Den Schalter **Zentrale Daten** ausschalten.

Danach ruft das Plugin nichts mehr bei GitHub ab. Vorhandene Termine bleiben stehen. Mit dem Schalter **Fachschaft & Veranstaltungen** blendest du nur Partys, Vorträge und Ähnliches aus.

Obsidian selbst und ein Sync-Dienst haben eigene Datenschutzregeln; die beschreibt diese Seite nicht.
