# Datenschutz

Kurz: Studium Autopilot holt Daten, schickt aber nichts über dich an den Autor oder an Dritte. Es gibt kein Konto, keine
Statistik und keine Telemetrie. Nur wenn du ILIAS verbindest (und, als Beta, **Noten & Anmeldungen** einschaltest), meldet
sich das Plugin mit deinem Uni-Zugang an, direkt von deinem Gerät bei der Uni.

## Was das Plugin abruft

| Was | Woher | Wann |
|---|---|---|
| Zentrale Daten (Termine, Fristen, Semesterdaten) | `studium-autopilot.github.io` (GitHub Pages) | beim Start, dann alle 15 Minuten, solange Obsidian offen ist (meist nur eine kleine Datei) |
| Dein Stundenplan | direkt von Alma (`alma.uni-tuebingen.de`) | nur wenn du Alma verbunden hast, beim Verbinden und auf Knopfdruck |
| Deine Kursdateien | direkt von ILIAS (`ovidius.uni-tuebingen.de`), Anmeldung bei der Uni (`idp.uni-tuebingen.de`) | nur wenn du ILIAS verbunden hast: beim Start, dann etwa stündlich, solange Obsidian offen ist, und auf Knopfdruck |
| Deine Noten und Prüfungsanmeldungen (Beta) | direkt von Alma (`alma.uni-tuebingen.de`, Seiten „Leistungen“ und „Belegungen“) | nur wenn du **Noten & Anmeldungen (Alma)** eingeschaltet hast: höchstens zweimal am Tag, in der Anmeldephase alle 3 Stunden, und auf Knopfdruck; nur eines deiner Geräte |
| Abgabetermine deiner Übungen | direkt von ILIAS (`ovidius.uni-tuebingen.de`, dein Kalender-Abo) | nur wenn du den **ILIAS-Kalender** verbunden hast: beim Start, dann alle 2 Stunden, solange Obsidian offen ist, und auf Knopfdruck; nur eines deiner Geräte |
| Neue Version der Vorlage und die Liste der Änderungen (`CHANGELOG.md`) | `raw.githubusercontent.com` (dieses Repo auf GitHub) | nur wenn du auf **Neue Version installieren** oder **Was ist neu** tippst |

- Das sind normale Abrufe wie beim Öffnen einer Webseite. Dabei sieht GitHub bzw. die Uni deine IP-Adresse. Philip als Autor sieht davon nichts.
- Von selbst werden nur Daten abgerufen (JSON, Kalenderdaten und deine Kursdateien, die nur abgelegt und nie ausgeführt
  werden), nie Programmcode. Programmteile einer neuen Version lädt das Plugin nur nach deinem Tipp auf **Neue Version installieren**,
  aus diesem Repo, und prüft jede Datei mit einer Prüfsumme.
- Mit dem Abruf der zentralen Daten werden keine Angaben über dich mitgeschickt: kein Name, keine Module, keine Noten.

## Was auf deinem Gerät bleibt

- **Dein Alma-Link** liegt nur im Speicher von Obsidian auf diesem Gerät. Er steht in keiner Notiz und wird nicht synchronisiert. In Alma kannst du ihn jederzeit erneuern; in Obsidian löschst du ihn unter **Einstellungen & Hilfe** → **Verbindungen** → Alma → **Trennen**.
- **Dein Link zum ILIAS-Kalender** ist geheim wie ein Passwort. Wer ihn hat, sieht deinen Kalender. Er liegt wie der Alma-Link nur
  im Speicher von Obsidian auf diesem Gerät, steht in keiner Notiz und in keiner Meldung. Von deinem Kalender übernimmt das
  Plugin nur die Abgabetermine deiner Übungen, nie die Titel aus ILIAS (Kurstitel können Beitrittspasswörter enthalten). In
  ILIAS erneuerst du ihn unter **Kalender** → **Abonnieren**; in Obsidian löschst du ihn unter **Einstellungen & Hilfe** →
  **Verbindungen** → ILIAS-Kalender → **Trennen**.
- **Dein Uni-Passwort** ist dasselbe für ILIAS und Alma. Du gibst es beim Verbinden von ILIAS ein, und es liegt nur im
  Schlüsselbund von Obsidian auf diesem Gerät, vom Betriebssystem verschlüsselt. Es steht in keiner Notiz, wird nicht
  synchronisiert und erscheint in keinem Protokoll und keiner Fehlermeldung. Auf jedem Gerät gibst du es selbst ein. Schaltest
  du **Noten & Anmeldungen (Alma)** ein, nutzt das Plugin es auch für die Anmeldeseite von Alma, sonst nur für ILIAS. Deinen
  Benutzernamen speichert Obsidian wie den Alma-Link nur auf diesem Gerät.
- **Deine Karteikarten und Lernstände** sind normale Dateien in deinem Tresor (`Karteikarten/` und
  `System/Daten/Karteikarten/`). Sie gehen nirgends hin; mit einem Sync-Dienst kommen sie auf deine anderen Geräte.
- **Die Textfassungen deiner PDFs** (`Unterlagen/_Volltext/`, damit die Suche Wörter in PDFs findet) liest das Plugin auf
  deinem Gerät aus den PDFs; dabei geht nichts ins Netz. Es sind normale Notizen in deinem Tresor, mit einem Sync-Dienst
  kommen sie auf deine anderen Geräte. Steht `volltext: aus` in `System/Einstellungen.md`, entstehen keine neuen.
- **Deine Angaben, Noten und Notizen** sind normale Dateien in deinem Tresor. Sie verlassen das Gerät nur, wenn du selbst einen Sync-Dienst einrichtest (dann gelten dessen Regeln).
- **Ein Passwort für deine Mails** speichert das Plugin nie.

## ILIAS-Unterlagen

Freiwillig: Ohne Verbindung meldet sich das Plugin nie bei ILIAS an.

- **Wohin etwas geht:** Benutzername und Passwort gehen nur an die Anmeldeseite der Uni (`idp.uni-tuebingen.de`). Danach
  holt das Plugin bei ILIAS (`ovidius.uni-tuebingen.de`) deine Kursliste und die Dateien deiner Kurse. Nur über https, kein
  Server dazwischen, keine KI. Am Computer prüft das Plugin jede Weiterleitung und schickt nichts an andere Server. Auf iPhone
  und iPad folgt iOS Weiterleitungen selbst; dort prüft das Plugin die Startadresse und die Adresse jedes Formulars, an das es
  Daten schickt, und dein Passwort steht nur in der eigenen Anfrage an die Anmeldeseite der Uni. Dass ein Server der Uni eine
  solche Anfrage selbst an eine andere Adresse umleitet, kann das Plugin auf iOS nicht ausschließen.
- **Abgelehnt:** Lehnt die Uni dein gespeichertes Passwort ab (z. B. nach einem Passwortwechsel), merkt sich das Gerät das in
  `System/Daten/uni-zugang.json` (nur Zeitpunkt, Dienst und eine Gerätekennung, kein Benutzername, kein Passwort). Deine anderen
  Geräte versuchen es dann nicht mehr mit dem alten Passwort, bis du es dort neu eingibst. So sammeln sich keine Fehlversuche.
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

## Noten & Anmeldungen (Alma, Beta)

Freiwillig und nur mit Beta-Versionen: Ohne dein **Einschalten** fragt das Plugin nichts bei Alma ab.

- **Zustimmung je Gerät:** Das Fenster zeigt deinen Benutzernamen. Erst nach **Einschalten** meldet sich dieses Gerät auch bei Alma
  an, mit deinem Uni-Passwort aus ILIAS, und nur, wenn ILIAS genau dieses Passwort angenommen hat. Lehnt Alma es ab, halten
  alle deine Geräte an (siehe „Abgelehnt“ oben); Alma ist nie der erste Versuch mit einem neuen Passwort.
- **Wohin etwas geht:** Benutzername und Passwort gehen nur in einer eigenen Anfrage an die Anmeldeseite von Alma
  (`alma.uni-tuebingen.de`), nachdem das Plugin geprüft hat, dass das Formular dorthin zeigt. Für Weiterleitungen gilt dasselbe
  wie bei ILIAS: Am Computer prüft das Plugin jeden Sprung, auf iPhone und iPad folgt iOS selbst, und ob die Antwort von Alma
  kommt, prüft das Plugin am Inhalt. Danach liest es nur „Leistungen“ und „Belegungen“ und meldet sich wieder ab. Es meldet dich
  nie zu Prüfungen an oder ab und ändert nichts in Alma.
- **Wie oft:** höchstens zweimal am Tag, in der Anmeldephase alle 3 Stunden, und wenn du **Jetzt prüfen** tippst; immer nur eines
  deiner Geräte. Alma erlaubt Robotern laut `robots.txt` keine Abrufe; das Plugin fragt trotzdem, weil du es für dein eigenes
  Konto einschaltest, selten, mit erkennbarer Kennung (`Studium-Autopilot/<Version>` mit Link auf dieses Repo) und eine Seite
  nach der anderen. Lehnt Alma ab oder antwortet ungewohnt, pausiert es von selbst.
- **Was gespeichert wird:** In `System/Daten/alma-konto.json` je Modulcode Status, Note, Versuch, Semester und Datum sowie deine
  Prüfungsanmeldungen im aktuellen Semester. Nie dein Name, deine Matrikelnummer, Prüfer:innen oder Vermerke. Die Datei kommt mit
  deinem Sync auf deine anderen Geräte (bei Obsidian Sync nur mit „andere Dateitypen“). Noten stehen nie in Hinweisen, im
  Protokoll, in Fehlermeldungen oder in Bildschirmen außer dem Vorschlag auf der Modulseite. In deine Modulnotiz kommt eine Note
  nur, wenn du **Übernehmen** tippst; **Ausblenden** merkt sich eine Prüfsumme statt der Note.
- **Löschen:** **Einstellungen & Hilfe** → **Verbindungen** → Noten & Anmeldungen (Alma) → **Mehr erfahren** → **Daten aus Alma
  löschen**. Das löscht die Datei und Kopien davon endgültig (nicht im Papierkorb) und schaltet die Funktion auf allen deinen
  Geräten aus. Was du in Modulseiten übernommen hast, bleibt. Ältere Fassungen im Verlauf deines Sync-Dienstes (z. B.
  Versionen in iCloud, der Verlauf von Obsidian Sync oder von Self-hosted LiveSync) kann das Plugin nicht löschen; das geht nur
  dort. Liegt dein Tresor in einem öffentlichen Git-Repo, gehört `System/Daten/alma-konto*.json` in dessen `.gitignore`.

## Zentrale Daten ausschalten

1. **Einstellungen & Hilfe** → **Verbindungen** öffnen.
2. Bei „Zentrale Daten“ auf **Mehr erfahren** tippen.
3. Den Schalter **Zentrale Daten** ausschalten.

Danach ruft das Plugin nichts mehr bei GitHub ab. Vorhandene Termine bleiben stehen. Mit dem Schalter **Fachschaft & Veranstaltungen** blendest du nur Partys, Vorträge und Ähnliches aus.

Obsidian selbst und ein Sync-Dienst haben eigene Datenschutzregeln; die beschreibt diese Seite nicht.
