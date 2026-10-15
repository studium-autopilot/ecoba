# Datenschutz

Kurz: Studium Autopilot holt Daten, sendet aber keine. Es gibt kein Konto, keine Statistik und keine Telemetrie.

## Was das Plugin abruft

| Was | Woher | Wann |
|---|---|---|
| Zentrale Daten (Termine, Fristen, Semesterdaten) | `studium-autopilot.github.io` (GitHub Pages) | beim Start, dann etwa stündlich, solange Obsidian offen ist |
| Dein Stundenplan | direkt von Alma (`alma.uni-tuebingen.de`) | nur wenn du Alma verbunden hast, beim Verbinden und auf Knopfdruck |

- Das sind normale Abrufe wie beim Öffnen einer Webseite. Dabei sieht GitHub (bzw. Alma) deine IP-Adresse. Philip als Autor sieht davon nichts.
- Abgerufen werden nur Daten (JSON bzw. Kalenderdaten), nie Programmcode.
- Mit dem Abruf werden keine Angaben über dich mitgeschickt: kein Name, keine Module, keine Noten.

## Was auf deinem Gerät bleibt

- **Dein Alma-Link** liegt nur im Speicher von Obsidian auf diesem Gerät. Er steht in keiner Notiz und wird nicht synchronisiert. In Alma kannst du ihn jederzeit erneuern; in Obsidian löschst du ihn unter **Einstellungen & Hilfe** → **Verbindungen** → Alma → **Trennen**.
- **Deine Angaben, Noten und Notizen** sind normale Dateien in deinem Tresor. Sie verlassen das Gerät nur, wenn du selbst einen Sync-Dienst einrichtest (dann gelten dessen Regeln).
- **Passwörter** werden nie gespeichert, auch nicht für Alma, ILIAS oder Mail.

## Zentrale Daten ausschalten

1. **Einstellungen & Hilfe** → **Verbindungen** öffnen.
2. Bei „Zentrale Daten“ auf **Mehr erfahren** tippen.
3. Den Schalter **Zentrale Daten** ausschalten.

Danach ruft das Plugin nichts mehr bei GitHub ab. Vorhandene Termine bleiben stehen. Mit dem Schalter **Fachschaft & Veranstaltungen** blendest du nur Partys, Vorträge und Ähnliches aus.

Obsidian selbst und ein Sync-Dienst haben eigene Datenschutzregeln; die beschreibt diese Seite nicht.
