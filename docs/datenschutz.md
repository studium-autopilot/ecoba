# Datenschutz

Kurz: Studium Autopilot holt Daten, schickt aber nichts über dich an den Autor. An andere geht nur etwas, wenn du einen Dienst
selbst verbindest (Uni-Login, eigener Server, Claude). Es gibt kein Konto und keine Telemetrie. Nur wenn du deinen Uni-Login eingibst, meldet sich das Plugin damit an, direkt von deinem Gerät
bei der Uni (ILIAS und Alma, mit dem [Postfach](#postfach) auch beim Webmail). Verbindest du Claude mit deinem eigenen
API-Schlüssel (freiwillig), geht eine Unterlage an Anthropic, wenn du bei ihr auf **Zusammenfassen** tippst
([unten](#claude-mit-eigenem-api-schlüssel)). Richtest du dir einen eigenen Server ein (freiwillig), holt das Plugin
zusätzlich dessen Ergebnisse ab ([unten](#eigener-server)); verbindest du dazu die Claude-App (freiwillig), liest Claude dort
deine Termine, To-dos, Lernplan, Karteikarten, Prüfungen mit Noten und deinen Stundenplan ([unten](#claude-app)).

## Was das Plugin abruft

| Was | Woher | Wann |
|---|---|---|
| Zentrale Daten (Termine, Fristen, Semesterdaten) | `studium-autopilot.github.io` (GitHub Pages) | beim Start, dann alle 15 Minuten, solange Obsidian offen ist (meist nur eine kleine Datei); die kleine Datei auch, wenn du auf **Nach Updates suchen** tippst |
| Dein Stundenplan | direkt von Alma (`alma.uni-tuebingen.de`) | nur wenn du Alma verbunden hast: beim Start, dann stündlich, solange Obsidian offen ist, und auf Knopfdruck |
| Die Links zu deinem Stundenplan und deinem ILIAS-Kalender | direkt von Alma (Seite „Stundenplan“, mit Anmeldung) bzw. ILIAS (Seite „Kalender“) | nur mit deinem Uni-Login: beim Verbinden und höchstens einmal am Tag, wenn ein Link nicht mehr gilt |
| Deine Kursdateien | direkt von ILIAS (`ovidius.uni-tuebingen.de`), Anmeldung bei der Uni (`idp.uni-tuebingen.de`) | nur wenn du ILIAS verbunden hast: beim Start, dann etwa stündlich, solange Obsidian offen ist, und auf Knopfdruck |
| Deine Noten und Prüfungsanmeldungen (Beta) | direkt von Alma (`alma.uni-tuebingen.de`, Seiten „Leistungen“ und „Belegungen“) | nur wenn du **Noten & Anmeldungen (Alma)** eingeschaltet hast: höchstens zweimal am Tag, in der Anmeldephase alle 3 Stunden, und auf Knopfdruck; nur eines deiner Geräte |
| Abgabetermine deiner Übungen | direkt von ILIAS (`ovidius.uni-tuebingen.de`, dein Kalender-Abo) | nur wenn du den **ILIAS-Kalender** verbunden hast: beim Start, dann alle 2 Stunden, solange Obsidian offen ist, und auf Knopfdruck; nur eines deiner Geräte |
| Dein Uni-Posteingang und die Mails, die du öffnest | direkt vom Webmail der Uni (`webmail.uni-tuebingen.de`) | nur wenn du auf der Seite **Postfach** **Postfach anzeigen** getippt hast: beim Öffnen der Seite, wenn die Liste älter als 5 Minuten ist, und auf Knopfdruck; nie im Hintergrund |
| Die Zusammenfassung einer Unterlage (dafür geht die PDF oder ihr Text hin) | Anthropic (`api.anthropic.com`), mit deinem eigenen API-Schlüssel | nur wenn du Claude verbunden hast und bei der Unterlage auf **Zusammenfassen** tippst; beim Verbinden einmal die Prüfung des Schlüssels |
| Termine und Hinweise deines eigenen Servers | dein eigener Server (die Adresse gibst du mit dem Code zum Verbinden ein) | nur wenn du ihn verbunden hast: beim Start, dann alle 15 Minuten, solange Obsidian offen ist, und auf Knopfdruck |
| Deine Verbindungen zur Claude-App und der Code dafür | dein eigener Server | nur auf einem Gerät, das mit ihm verbunden ist: wenn du das Fenster **Eigener Server** öffnest und wenn du dort **Mit der Claude-App verbinden**, **Trennen** oder **Claude-App ganz ausschalten** tippst |
| Neue Version der Vorlage und die Liste der Änderungen (`CHANGELOG.md`) | `github.com` (die Liste der Dateien, aus dem Release der neuen Version) und `raw.githubusercontent.com` (dieses Repo auf GitHub) | nur wenn du auf **Neue Version installieren** oder **Was ist neu** tippst oder **Nach Updates suchen** eine neue Version findet |
| Die Hinweise für Claude (`.claude/`) der Version, die du installiert hast | `raw.githubusercontent.com` (dieses Repo auf GitHub) | nur am Computer, einmal je Version, wenn dort eine Datei fehlt oder alt ist (etwa auf einem zweiten Computer); nicht, wenn die zentralen Daten aus sind |
| Die Signatur der Liste der Dateien deiner Version (`system-dateien.json.sig`), damit das Plugin prüfen kann, ob die Teile der App echt sind | `github.com` (aus dem Release der Version, die auf dem Gerät läuft, und der Version, die die Liste in deinem Tresor nennt) | nur wenn sie in deinem Tresor fehlt (etwa einmal nach dem Update von 0.7.6 oder älter): beim Start, wenn sich die Liste ändert oder das Gerät wieder online ist, solange Obsidian offen ist nur für die Version des Geräts und höchstens eine weitere, je Version bis eine Antwort kommt; wie beim Update auch bei ausgeschalteten zentralen Daten; sonst nur nach einem Tipp auf **Reparieren** |
| Die echte Liste der Dateien und ihre Signatur, wenn die Liste in deinem Tresor nicht stimmt | `github.com` (aus dem Release der Version, die auf dem Gerät läuft, oder der neueren, deren Liste dieses Gerät schon geprüft hat) | nur wenn du auf **Reparieren** tippst |
| Die echte Fassung eines Teils der App, der nicht zur installierten Version passt | `raw.githubusercontent.com` (dieses Repo, Version, die du installiert hast) | nur wenn du auf **Reparieren** tippst |
| Die Dateien des Plugins einer neueren Version, wenn auf diesem Gerät noch eine ältere läuft | `raw.githubusercontent.com` (dieses Repo, die neueste Version, deren Liste dieses Gerät geprüft hat) | nur wenn du im Hinweis auf **Neu laden** tippst oder den Befehl **Neue Version auf diesem Gerät laden …** wählst |

- Das sind normale Abrufe wie beim Öffnen einer Webseite. Dabei sieht GitHub bzw. die Uni deine IP-Adresse. Der Autor sieht
  davon nichts, nur wie oft eine Datei eines Releases heruntergeladen wurde (etwa die Liste der Dateien beim Update), eine Zahl,
  die GitHub bei jedem Release öffentlich zeigt. Wer **Mitzählen** vor 0.7.1 ausgeschaltet hat, wird beim Laden der Liste weiter
  nicht mitgezählt; ihre Signatur kommt aber aus dem Release, und GitHub zählt auch diesen Abruf.
- Von selbst werden nur Daten abgerufen (JSON, Kalenderdaten und deine Kursdateien, die nur abgelegt und nie ausgeführt
  werden), nie Programmcode. Programmteile einer neuen Version lädt das Plugin nur nach deinem Tipp auf **Neue Version installieren**,
  aus diesem Repo, und prüft jede Datei mit einer Prüfsumme. Die Hinweise für Claude holt es von selbst nach, aber nur genau die
  der Version, die du installiert hast, geprüft mit der Prüfsumme aus deren Liste.
- Mit dem Abruf der zentralen Daten werden keine Angaben über dich mitgeschickt: kein Name, keine Module, keine Noten.

## Was auf deinem Gerät bleibt

- **Dein Alma-Link** liegt nur im Schlüsselbund von Obsidian auf diesem Gerät, vom Betriebssystem verschlüsselt (bis 01.11.2026 im
  Speicher von Obsidian; ein Link von dort zieht beim ersten Lesen einmal um). Er steht in keiner Notiz und wird nicht synchronisiert. In Alma kannst du ihn jederzeit erneuern; in Obsidian löschst du ihn unter **Einstellungen & Hilfe** → **Verbindungen** → Uni-Login → **Mehr erfahren** → Schalter bei „Alma-Stundenplan“ aus.
- **Dein Link zum ILIAS-Kalender** ist geheim wie ein Passwort. Wer ihn hat, sieht deinen Kalender. Er liegt wie dein
  Uni-Passwort nur im Schlüsselbund von Obsidian auf diesem Gerät, steht in keiner Notiz und in keiner Meldung. Von deinem Kalender übernimmt das
  Plugin nur die Abgabetermine deiner Übungen, nie die Titel aus ILIAS (Kurstitel können Beitrittspasswörter enthalten). In
  ILIAS erneuerst du ihn unter **Kalender** → **Abonnieren**; in Obsidian löschst du ihn unter **Einstellungen & Hilfe** →
  **Verbindungen** → Uni-Login → **Mehr erfahren** → Schalter bei „ILIAS-Kalender“ aus.
- **Dein Uni-Passwort** ist dasselbe für ILIAS und Alma. Du gibst es beim Verbinden von ILIAS ein, und es liegt nur im
  Schlüsselbund von Obsidian auf diesem Gerät, vom Betriebssystem verschlüsselt. Es steht in keiner Notiz, wird nicht
  synchronisiert und erscheint in keinem Protokoll und keiner Fehlermeldung. Auf jedem Gerät gibst du es selbst ein. Seit 0.4.8
  gilt dein Uni-Login für alles: Das Fenster sagt vor der Eingabe, was er holt und wo er sich anmeldet; mit der Eingabe stimmst du
  zu, dass sich das Plugin damit auch bei Alma anmeldet, um den Link zu deinem Stundenplan zu holen (siehe „Uni-Login“). Hast du
  dein Passwort vor 0.4.8 eingegeben, meldet es sich bei Alma erst an, wenn du im Fenster hinter „Uni-Login“ den Schalter bei „Alma-Stundenplan“ einschaltest. Für **Noten &
  Anmeldungen (Alma)** braucht es weiter dein **Einschalten**.
  Deinen Benutzernamen speichert Obsidian nur auf diesem Gerät.
- **Deine Karteikarten und Lernstände** sind normale Dateien in deinem Tresor (`Karteikarten/` und
  `System/Daten/Karteikarten/`). Sie gehen nirgends hin; mit einem Sync-Dienst kommen sie auf deine anderen Geräte.
- **Die Textfassungen deiner PDFs** (`Unterlagen/_Volltext/`, damit die Suche Wörter in PDFs findet) liest das Plugin auf
  deinem Gerät aus den PDFs; dabei geht nichts ins Netz. Es sind normale Notizen in deinem Tresor, mit einem Sync-Dienst
  kommen sie auf deine anderen Geräte. Steht `volltext: aus` in `System/Einstellungen.md`, entstehen keine neuen.
- **Seit deinem letzten Besuch** merkt sich in `System/Daten/seit-besuch/`, welche Uni-Termine sich geändert haben und was du
  schon gesehen hast. Es sind Dateien in deinem Tresor; sie gehen nirgends hin, mit einem Sync-Dienst auf deine anderen Geräte.
- **Deine Angaben, Noten und Notizen** sind normale Dateien in deinem Tresor. Sie verlassen das Gerät nur, wenn du selbst einen Sync-Dienst einrichtest (dann gelten dessen Regeln).
- **Ein eigenes Passwort für deine Mails** speichert das Plugin nie; das **Postfach** nutzt deinen Uni-Login. **Deine Mails**
  speichert es auch nicht: Sie stehen nur im Speicher dieses Geräts, solange Obsidian offen ist (siehe „Postfach“).
- **Dein API-Schlüssel für Claude** liegt wie das Uni-Passwort nur im Schlüsselbund von Obsidian auf diesem Gerät. Er steht in
  keiner Notiz, wird nicht synchronisiert und erscheint in keiner Meldung; jedes Gerät verbindest du selbst. Löschen: unter
  **Verbindungen** → Claude → **Dieses Gerät trennen**; ungültig machst du ihn in der Claude Console unter **API keys**.
- **Der Schlüsselbund von Obsidian** schützt vor anderen Apps und vor dem Sync, aber andere Plugins, die du in Obsidian
  installierst, können ihn womöglich mitlesen; installiere darum nur Plugins, denen du vertraust.

## Uni-Login

Freiwillig: Ohne deinen Uni-Login meldet sich das Plugin nirgends an. Gibst du ihn ein (in der Einrichtung oder unter
**Verbindungen** → **Mit Uni-Login verbinden**), verbindet das Plugin ILIAS-Unterlagen, den ILIAS-Kalender und deinen Stundenplan
aus Alma, soweit sie noch nicht verbunden sind.

- **Was es holt:** In ILIAS die Seite „Kalender“ und das Fenster „Kalender abonnieren“, in Alma nach der Anmeldung die Seite
  „Stundenplan“; daraus nur den Abo-Link, den du sonst selbst kopieren würdest. Danach meldet es sich bei Alma wieder ab. Es
  klickt dort nichts an und erneuert keinen Link.
- **Wann:** beim Verbinden und, wenn ILIAS oder Alma einen gespeicherten Link nicht mehr kennt, höchstens einmal am Tag je Link
  (nur nachdem du dafür deinen Uni-Login eingegeben oder auf **Verbinden** getippt hast). Bremst Alma, meldet es sich bis dahin
  nicht an.
- **Wohin dein Passwort geht:** nur an die Anmeldeseiten der Uni (`idp.uni-tuebingen.de` für ILIAS, `alma.uni-tuebingen.de`),
  wie unten bei ILIAS-Unterlagen und Noten & Anmeldungen beschrieben. Alma bekommt es nur, wenn ILIAS genau dieses Passwort
  angenommen hat.
- **Ohne Passwort:** Beide Links kannst du weiter selbst einfügen (Fenster „Verbinden“ → Schritte zum Einfügen).

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
  Hatte die Uni das Passwort auf diesem Gerät noch nie geprüft, merkt sich das nur dieses Gerät.
- **Geteiltes iPhone oder iPad:** Beim Verbinden meldet das Plugin eine Sitzung, die das Gerät noch bei ILIAS oder der Uni hat,
  erst ab, damit ILIAS wirklich dein Passwort prüft. Danach merkt sich das Gerät das Kürzel aus zwei Zeichen, das ILIAS in
  deinem Profilbild zeigt (nur auf diesem Gerät, nie im Tresor). Zeigt ILIAS später ein anderes, gehört die Sitzung einem
  anderen Konto: Das Plugin meldet sie ab und übernimmt nichts daraus.
- **Was in deinem Tresor liegt:** die geladenen Dateien unter `Unterlagen/` mit je einer Begleitnotiz, die Liste
  `System/Daten/ilias.json` (welche ILIAS-Datei wo liegt, damit kein Gerät doppelt lädt) und `System/Daten/ilias-abruf.json`
  (welches Gerät gerade lädt). Diese Dateien kommen mit deinem Sync auf deine anderen Geräte. Ein Passwort steht nicht darin.
- **Zustimmung bei der Uni:** Fragt die Uni, ob ILIAS deine Daten bekommen darf, stimmt das Plugin nie für dich zu. Dann
  meldest du dich einmal im Browser bei ILIAS an.
- **Die Dateien bleiben bei dir.** Studium Autopilot verteilt keine Unterlagen weiter, weder zentral noch an andere.
  Folien, Skripte und Altklausuren sind urheberrechtlich geschützt: nur für dein Studium, nicht weitergeben oder
  veröffentlichen.

**Trennen:** **Einstellungen & Hilfe** → **Verbindungen** → ILIAS-Unterlagen → **Mehr erfahren** → **Trennen**. Das löscht Passwort und
Benutzernamen auf diesem Gerät und meldet dieses Gerät bei ILIAS und der Uni ab. Geladene Dateien bleiben in deinem Tresor. Andere Geräte trennst du jeweils dort.

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
  Protokoll, in Fehlermeldungen oder in Bildschirmen außer dem Vorschlag auf der Modulseite; nur mit der [Claude-App](#claude-app)
  gehen Note, Versuch und Anmeldung eines Moduls ohne eigenen Eintrag in der Modulnotiz an deinen Server. In deine Modulnotiz kommt eine Note
  nur, wenn du **Übernehmen** tippst; dabei kommt eine Prüfsumme der übernommenen Werte dazu (`alma_uebernommen`), damit ein
  späterer Vorschlag eine Korrektur aus Alma erkennt. **Ausblenden** merkt sich eine Prüfsumme statt der Note.
- **Löschen:** **Einstellungen & Hilfe** → **Verbindungen** → Noten & Anmeldungen (Alma) → **Mehr erfahren** → **Daten aus Alma
  löschen**. Das löscht die Datei und Kopien davon endgültig (nicht im Papierkorb) und schaltet die Funktion auf allen deinen
  Geräten aus. Was du in Modulseiten übernommen hast, bleibt. Ältere Fassungen im Verlauf deines Sync-Dienstes (z. B.
  Versionen in iCloud, der Verlauf von Obsidian Sync oder von Self-hosted LiveSync) kann das Plugin nicht löschen; das geht nur
  dort. Liegt dein Tresor in einem öffentlichen Git-Repo, gehört `System/Daten/alma-konto*.json` in dessen `.gitignore`.

## Postfach

Freiwillig und je Gerät: Ohne deinen Tipp auf **Postfach anzeigen** meldet sich das Plugin nie beim Webmail an.

- **Wohin dein Passwort geht:** Benutzername und Passwort deines Uni-Logins gehen nur in einer eigenen Anfrage an die
  Anmeldeseite des Webmails (`webmail.uni-tuebingen.de`), nachdem das Plugin geprüft hat, dass das Formular dorthin zeigt.
  Das Webmail bekommt es nur, wenn ILIAS genau dieses Passwort angenommen hat. Nur über https, kein Server dazwischen, keine
  KI. Für Weiterleitungen gilt dasselbe wie bei ILIAS: Am Computer prüft das Plugin jeden Sprung, auf iPhone und iPad folgt
  iOS selbst.
- **Was es liest:** die Liste deines Posteingangs (Absender, Betreff, Datum, gelesen oder nicht), die Zahl ungelesener Mails
  und eine Mail, wenn du sie antippst. Die Uni markiert sie dann als gelesen, wie im Browser. Das Plugin löscht, verschiebt,
  beantwortet und markiert sonst nichts; die Adressen dafür baut es gar nicht.
- **Was gespeichert wird:** nichts. Deine Mails stehen nur im Speicher dieses Geräts, solange Obsidian offen ist; nie im
  Tresor, in Hinweisen, im Protokoll oder bei Claude. (Ein [eigener Server](#eigener-server) liest Mails getrennt
  davon, wenn du ihm welche gibst.) Nach 10 Minuten ohne Abruf meldet sich das Plugin beim Webmail ab.
  Änderst du den Benutzernamen deines Uni-Logins oder trennst ihn, meldet es die alte Sitzung gleich ab und vergisst deren Mails.
- **Abgelehnt:** Lehnt das Webmail dein Passwort ab, halten alle deine Geräte an wie bei ILIAS (siehe „Abgelehnt“ oben).

**Ausschalten:** auf der Seite **Postfach** → **Auf diesem Gerät ausschalten**. Das meldet ab und vergisst die geladenen Mails.

## Claude mit eigenem API-Schlüssel

Nur wenn du Claude mit einem eigenen API-Schlüssel aus der [Claude Console](https://platform.claude.com) verbindest (für
Fortgeschrittene: **Einstellungen & Hilfe** → **Verbindungen** → **Eigener Server**, ganz unten). Dafür braucht es keinen Server und kein Konto bei Studium Autopilot.

- **Was das Plugin schickt:** nur, wenn du bei einer Unterlage auf **Zusammenfassen** tippst, direkt von deinem Gerät an
  Anthropic (`api.anthropic.com`): die PDF (oder nur ihren Text, wenn die PDF zu groß ist oder du **Nur Text** wählst), dazu
  Titel, Modulcode, Art und Seitenzahl der Unterlage und das heutige Datum. Keine anderen Notizen, keine Noten, keinen Namen.
- **Nur Lehrmaterial:** Folien, Skripte, Übungen, Tutorien, Lösungen, Altklausuren und Literatur; nie Mitschriften oder Scans.
- **Was zurückkommt:** die Punkte für „Das Wichtigste“, „Zu tun“ und „Offene Fragen“. Das Plugin schreibt sie als reinen Text
  in die Notiz neben der PDF. Bilder, Code und Ähnliches fallen weg, Links auch, außer zur Uni und zum freien Lehrbuch von
  CORE.
- **Bei Anthropic:** Die Anfrage läuft über dein Konto und dein Guthaben; Anthropic verarbeitet sie nach den Bedingungen deines
  Kontos. Der Autor sieht davon nichts und bekommt kein Geld.
- **Auf diesem Gerät:** der Schlüssel (siehe „Was auf deinem Gerät bleibt“) und was die Zusammenfassungen diesen Monat gekostet
  haben, damit die Zeile unter **Verbindungen** es nennen kann.
- **Warum kein Claude-Abo:** Anthropic erlaubt Apps anderer Anbieter nicht, sich mit Claude Free, Pro oder Max anzumelden
  ([Bedingungen](https://code.claude.com/docs/en/legal-and-compliance)).

## Eigener Server

Nur wenn du ihn selbst einrichtest (README, „Für Technische“). Ohne ihn spricht das Plugin mit keinem weiteren Server.

- **Zwischen Server und Tresor:** Das Plugin holt die Ergebnisse über HTTPS ab, zusätzlich verschlüsselt mit einem Schlüssel,
  den nur dein Server und deine Geräte kennen (AES-256-GCM). Zugangs- und Datenschlüssel liegen im Schlüsselbund von Obsidian
  auf jedem Gerät, nie in einer Notiz. Seit dem 03.11.2026 hat jedes Gerät eigene (eins, das sich vorher verbunden hat, bekommt sie
  beim nächsten Abruf von selbst): Ein verlorenes Gerät trennst du allein, die anderen bleiben verbunden. Die Schlüssel, die sich
  alle Geräte vorher teilten, nimmt dein Server danach nur noch höchstens 30 Tage an. Verbunden wird mit einem Code, der einmal und 30 Minuten gilt: Du tippst ihn unter
  **Einstellungen & Hilfe** → **Verbindungen** bei „Eigener Server“ ein, ein Link von außerhalb von Obsidian verbindet nie. Seit
  0.7.8 geht der Code dabei nicht über das Netz, und die Schlüssel kommen nur verschlüsselt zurück, mit einem Schlüssel, den nur
  jemand mit dem Code berechnen kann. Danach trägt keine Anfrage einen Schlüssel, nur eine Signatur, die für genau diese eine Anfrage
  und 5 Minuten gilt. Hat dein Server sein Update noch nicht (es kommt bis zu zwei Tage nach einer neuen Version), schickt ein Gerät,
  das ihn schon länger kennt, den Zugangsschlüssel wie bisher, nur durch HTTPS geschützt (wer dann mit einem gültigen Zertifikat
  dazwischensitzt, kann ihn lesen, wie bis 0.7.7), aber nur, bis es einmal eine signierte Antwort des Servers gesehen hat; danach nie
  mehr, und es nimmt dann auch nur noch signierte Antworten an. Das merkt sich jedes Gerät selbst, nicht im Tresor. Dein Server nimmt den Zugangsschlüssel selbst nur noch eine
  Weile an: Sobald ein Gerät signiert, startet er damit keine Suche mehr, und nach 7 Tagen ohne ein solches Gerät gar nichts mehr,
  spätestens 30 Tage nach dem ersten signierenden Gerät. Wer unterwegs mitliest, auch mit einem gültigen Zertifikat für die Adresse deines Servers, bekommt so weder Code
  noch Schlüssel. Studium Autopilot bis 0.7.7 schickt Code und Zugangsschlüssel noch selbst, nur durch HTTPS geschützt; aktualisiere
  darum jedes Gerät.
  Obsidian fragt vorher und sagt dabei, was dein Gerät dem Server schickt (unten); ist schon ein anderer Server verbunden,
  tippst du dessen neuen Namen ein. Als Adresse gilt nur ein Name im Internet, nie eine IP-Adresse oder ein Rechner im eigenen
  Netz. Der Server merkt sich die letzten 20 Verbindungen mit Zeit und grobem Netz (bei IPv4 die ersten
  drei Zahlen, nie die ganze Adresse), damit du siehst, wann und von wo ein Gerät verbunden wurde.
- **Was das Plugin dem Server schickt:** die Modulcodes deines Plans, Studienbeginn und Variante, wie oft er nachsehen soll, welche Ergebnisse es
  übernommen hat (danach löscht der Server sie), und damit Claude nichts doppelt liefert: Titel, Datum, Art, Modul und Haken
  deiner Termine (von vor 30 Tagen bis in einem Jahr) und deine offenen To-dos wie auf dem Dashboard, mit Modul, Frist und dem Namen der Notiz (damit Claude doppelte
  zusammenführen kann).
  Termine und To-dos, die nach Zugangsdaten aussehen (Passwort, Zugangsdaten, IBAN, Schlüssel; PIN, TAN, Token oder Code nur mit
  einem Wert dahinter, die Matrikelnummer nur mit Zahl), schickt es nie, auch nicht mit versteckten Zeichen dazwischen; das ist
  eine Suche nach typischen Wörtern und Formen, keine Garantie. Der Server prüft das noch einmal und gibt solche Einträge nicht
  an Claude, ebenso keine mit einem Link oder mit Sätzen, die wie eine Anweisung an eine KI aussehen. Tippst du in einer Unterlage auf
  **Zusammenfassen**, dazu deren Textfassung (Folien, Skripte, Übungen, Lösungen, Altklausuren, Literatur), damit Claude „Das
  Wichtigste“ schreibt; nie Mitschriften, eigene Lösungen oder Scans. Dazu geht auch die PDF selbst mit (verschlüsselt, damit
  Claude Abbildungen und Tabellen sieht); wird das teuer oder ist sie groß, fragt der Knopf vorher, und mit „Nur Text“
  bleibt es bei der Textfassung. Der Server löscht die PDF nach dem Lauf. Von selbst geht die Textfassung neuer Unterlagen (höchstens
  drei Wochen alt) aus Modulen, deren Termine aus Unterlagen nicht über die zentralen Daten kommen, damit Claude darin nur nach
  Terminen sucht. Mit `server_unterlagen: alle` in `System/Einstellungen.md` gehen alle Unterlagen ohne Zusammenfassung von
  selbst, mit `server_unterlagen: aus` keine. Für den **Lernplan** gehen von selbst die Folien von Modulen des laufenden
  Semesters mit, für die es keine fertige Kapitelliste gibt (die ersten 8 Seiten ganz, danach je Seite die erste Zeile), damit
  Claude daraus die Kapitel liest. Keine übrigen Notiztexte, keine PDFs außer denen, die du zusammenfassen lässt, und Noten nur,
  solange die [Claude-App](#claude-app) an ist. Den ganzen Tresor sieht der Server nie, außer du schaltest LiveSync ein (unten).
- **Was im Tresor landet:** Termine als Notizen unter `Termine/` und kurze Hinweise in `System/Daten/server.json`. Hinweise
  fassen Inhalte deiner Mails zusammen; die Datei gehört zu deinen persönlichen Daten. Damit du die Änderungen des letzten
  Abrufs an vorhandenen Notizen (zusammengeführte To-dos, geänderte Termine) mit **Rückgängig** zurücknehmen kannst, merkt sich
  das Gerät, das abgerufen hat, nur die geänderten Zeilen vorher und nachher (nie ganze Notizen), nur auf diesem Gerät und nie im Tresor; nach
  dem Rückgängig oder dem Trennen sind sie weg, ein späterer Abruf mit Änderungen ersetzt sie.
- **Wer sich verbunden hat:** Der Server nennt verbundenen Geräten die letzten 20 Verbindungen (Zeit, Weg, Name des Geräts, wenn es
  einen nennt, und nur ein grobes Netz wie „203.0.113.…“, nie die ganze IP). Das Fenster zeigt sie, damit dir ein fremdes Gerät
  auffällt; sie stehen nur im Speicher des Geräts, das nachgesehen hat, nie im Tresor. Ebenso die Liste deiner Geräte mit eigenen
  Schlüsseln (Name, seit wann, wann zuletzt; nie die Schlüssel selbst), in der du jedes andere Gerät trennst. Als Name schickt ein
  Gerät beim Verbinden nur seine Art („iPhone“, „iPad“, „Windows-PC“ …), nie einen Namen aus dem System.
- **Auf dem Server:** Claude Code läuft mit deinem Claude-Konto. Was Claude dort liest (deine Mails und alles, was das Plugin
  dem Server schickt: Termine, To-dos, Unterlagen, Folien), verarbeitet Anthropic nach den Bedingungen deines Kontos; Nutzungs-
  und Fehlerberichte schickt Claude Code dabei nicht, auch nicht beim Prüfen der Anmeldung und bei seinen Updates. Ob Anthropic deine Chats und Sitzungen zum
  Trainieren nutzen darf, stellst du bei Claude unter [Einstellungen → Datenschutz](https://claude.ai/settings/data-privacy-controls)
  ein; davon hängt laut Anthropic auch ab, wie lange es sie aufbewahrt (30 Tage ohne Training, bis zu fünf Jahre mit).
  Claude ist laut Anthropic erst ab 18 Jahren erlaubt. Gmail nur lesend: Senden, Entwürfe (auch das Lesen), Filter, Labels und
  Löschen sind gesperrt; ist Gmail in einem Lauf nicht dran, lädt Claude gar keine Verbindung von claude.ai. Bei jeder
  Gmail-Suche sieht Claude Absender, Betreff und die ersten Zeilen der Mails seit der letzten Suche (höchstens der letzten 3
  Tage; nicht deine eigenen, keine Entwürfe, nichts aus sozialen Netzwerken), damit es auch Mails zum Studium findet, die nicht
  von der Uni kommen. Claude ist angewiesen, nur diese ganz zu lesen und aus den anderen nichts in die Ergebnisse zu schreiben;
  erzwingen kann der Server das nicht, denn öffnen kann Claude jede Mail, die es dabei sieht. Claude Code legt dabei kein
  Gesprächsprotokoll und kein Gedächtnis über Läufe hinweg an. Claude hat die Anweisung, keine Personennamen in die Ergebnisse zu schreiben, Absender nur als
  Einrichtung und Datum; nach jedem Lauf löscht der Server die Mails und den Auszug aus deinem Tresor, es bleiben ein Protokoll
  ohne Inhalte und die geprüften Ergebnisse (bis 0.7.6 blieben die letzten zehn Läufe ganz). Ergebnisse, die noch kein Gerät
  abgeholt hat, warten bis zu 180 Tage, nach 30 Tagen nur noch, solange einer ihrer Termine bevorsteht. Anhänge deiner Uni-Mails: Kalender
  liest der Server als Text, PDFs legt er neben die Mail, und Claude öffnet eine davon nur, wenn sie nach Terminen aussieht
  (etwa ein Prüfungsplan); nach dem Lauf löscht der Server sie. Scheitern zwei Läufe an derselben Mail allein, legt der Server sie mit
  ihren Anhängen in einen eigenen Ordner (nur root und der Lauf können ihn lesen), statt sie noch einmal an Claude zu geben. Dort
  bleibt sie, bis du sie in Obsidian wieder einreihst oder der Ordner über 200 Mails oder 500 MB wächst (dann fallen die ältesten
  weg). Über die Weiterleitung an Gmail kommen Anhänge nicht auf den
  Server.
- **Uni-Mails:** Empfohlen ist eine Weiterleitung deiner Uni-Mails an Gmail. Dann liegt dein Uni-Passwort, das auch für
  ILIAS, Alma und Noten gilt, nicht auf dem Server; die Mails kommen dafür erst mit der nächsten Gmail-Suche an.
- **Uni-Passwort (freiwillig, statt der Weiterleitung):** Du tippst es selbst auf dem Server ein. Es liegt dort nur verschlüsselt. Entschlüsselt bekommt
  es nur der Abruf deines Uni-Postfachs, unter einem eigenen Benutzer; Claude und der Web-Dienst nie. Der Abruf schickt es nur
  über eine geprüfte, verschlüsselte Verbindung an den Mailserver der Uni (bis 0.7.6 ohne Prüfung des Zertifikats). Nach einer abgelehnten Anmeldung versucht der Server es nicht wieder, damit dein Konto
  nicht gesperrt wird. Grenze: Wer root auf deinem Server ist, könnte es entschlüsseln.
- **Schutz auf dem Server:** Der Teil, den das Internet erreicht, läuft als eigener Benutzer: Er kann weder deine
  Claude-Anmeldung noch deine Mails, Claudes Arbeitsordner oder dein Uni-Passwort lesen und Claude bei der Arbeit nicht stören
  (bis 0.7.6 hielt ihn nur eine Sperre davon fern, nicht ein eigener Benutzer). Auch der Abruf deines Uni-Postfachs sieht deine
  Termine und To-dos nicht mehr. Updates für alle Programme, die das Internet erreicht, kommen jede Nacht von selbst. Grenze:
  Was dieser Teil für Claude ablegt (dein Stand aus Obsidian, Unterlagen), liest Claude zusammen mit deinen Mails, und Claudes
  Ergebnisse gibt er an deine Geräte weiter. Wer ihn übernimmt, könnte darüber versuchen, Claude Mails in die Ergebnisse schreiben
  zu lassen. Claude darf in Gmail nur lesen und folgt keinen Aufforderungen aus Quellen; eine feste Sperre wie die eigenen
  Benutzer ist das nicht.
- **LiveSync (freiwillig):** Gleicht dein Server deinen Tresor zwischen deinen Geräten ab, liegt der ganze Tresor dort, in der
  Datenbank verschlüsselt, auch die Dateinamen. Den Schlüssel dafür bewahrt der Server auf (nur root), damit Claude neue Geräte
  verbinden kann. Wie beim Uni-Passwort gilt: Wer root auf deinem Server ist, könnte den Tresor lesen. Claude liest ihn nicht.
- **Statusseite:** Den Stand deines Servers (Version, Claude verbunden ja oder nein, LiveSync an oder aus, Zeitpunkte, keine
  Inhalte) bekommt nur, wer den Zugangsschlüssel hat. Bis eines deiner Geräte eine Fassung von Studium Autopilot hat, die ihn dort
  mitschickt, ist sie wie bisher öffentlich.
- **Abschalten:** in Obsidian unter **Einstellungen & Hilfe** → **Verbindungen** → **Eigener Server** → **Trennen**; den
  Server selbst beendest du in der Oracle-Konsole.

## Claude-App

Nur wenn du sie selbst verbindest: **Einstellungen & Hilfe** → **Verbindungen** → **Eigener Server** → **Mit der Claude-App
verbinden**. Dann fragst du Claude in der Claude-App (claude.ai im Browser, die Apps für iPhone, iPad, Android und Computer) nach
deinem Studium. Dein Server fragt dabei nie selbst Claude; Claude fragt deinen Server, wenn du im Chat etwas wissen willst.

- **Was Claude lesen kann:** deine Termine und Fristen, offene To-dos, den Stand deines Lernplans (Kapitel mit Häkchen), wie viele
  Karteikarten je Modul fällig sind, deine Prüfungen mit Anmeldung, Versuch und Note, deinen Stundenplan der nächsten 14 Tage und
  die Hinweise deines Servers. Keine Notizen, keine Unterlagen, keine PDFs, nie den Ordner **System**. Claude ändert nichts. Texte
  aus Mails mit Links, mit etwas, das nach Zugangsdaten aussieht, oder in der Form einer Anweisung an Claude gibt dein Server nicht
  an Claude weiter; in Obsidian stehen sie trotzdem.
- **Was dafür an deinen Server geht:** Solange die Claude-App an ist, schickt das Gerät, das deinen Server abruft, mit seinem Stand
  dazu Lernplan, Karteikarten, Prüfungen mit Noten und Stundenplan (Termine und To-dos gehen ohnehin, siehe oben), Texte ohne
  Links und ohne alles, was nach Zugangsdaten aussieht. Note, Versuch und Anmeldung kommen aus deiner Modulnotiz, sonst aus
  **Noten & Anmeldungen (Alma)**, wenn du es eingeschaltet hast. Ist die Claude-App aus, geht nichts davon mit.
- **Verbinden:** mit einem Code, der 10 Minuten und einmal gilt. Er steht nur im Fenster von Obsidian, nie im Tresor, und du gibst
  ihn auf der Seite deines Servers ein, die sich öffnet, nachdem du den Konnektor in der Claude-App hinzugefügt hast. Wer den Code
  hat, kann über claude.ai lesen, was oben steht; gib ihn darum nicht weiter. Jede neue Verbindung zeigt Studium Autopilot auf jedem deiner
  Geräte unter „Seit deinem letzten Besuch“, und die Zeile **Eigener Server** sagt es drei Tage lang, auch wenn die Verbindung schon
  wieder beendet ist (dein Server merkt sich beendete Verbindungen 30 Tage lang, ohne Inhalte). Wann eine Verbindung begann, wann
  sie endete und an welchem Tag sie zuletzt benutzt wurde, steht dafür in `System/Daten/server.json`, ohne Inhalte. **Trennen** und
  **Claude-App ganz ausschalten** stehen im selben Fenster.
- **Was claude.ai bekommt:** keinen Schlüssel deines Servers, nur eine Anmeldung, mit der claude.ai deinen Server fragen darf.
  Die Claude-App bittet dabei, nur Konnektoren von Entwicklern zu nutzen, denen du vertraust, weil Anthropic nicht steuert, welche
  Werkzeuge sie anbieten; hier ist das dein eigener Server.
- **Bei Anthropic:** Was Claude von deinem Server liest, steht danach in deinem Chat, und Chats speichert Anthropic in deinem
  Claude-Konto, bis du sie löschst. Ob Anthropic deine Chats zum Verbessern von Claude nutzen darf, stellst du unter
  [Einstellungen → Datenschutz](https://claude.ai/settings/data-privacy-controls) ein. Erlaubst du es, zählt der ganze Chat, also auch
  Claudes Antworten mit deinen Noten; die Rohdaten, die Claude von deinem Server abruft, zählen laut Anthropic nicht. Löschst du einen
  Chat, entfernt Anthropic ihn innerhalb von 30 Tagen; hast du das Training erlaubt, darf Anthropic Chats bis zu fünf Jahre in
  anonymisierter Form fürs Training behalten. Das Gedächtnis von Claude ist normalerweise eingeschaltet: Claude kann sich Angaben aus
  diesen Chats für andere Chats merken, und das bleibt, auch wenn du den Chat löschst (einzeln löschen in den Einstellungen von
  Claude). Teilst du einen Chat als Link, sieht jeder mit dem Link den ganzen Chat, also womöglich deine Noten; die Rohdaten von
  deinem Server bleiben verborgen. Claude ist laut Anthropic erst ab 18 Jahren erlaubt.
- **Andere Konnektoren:** Was Claude in einem Chat gelesen hat, kann es dort mit deinen anderen Konnektoren weitergeben, etwa per
  Gmail senden, oder in der Code-Ausführung ins Netz schicken. Das Fenster rät darum, in claude.ai die Werkzeuge zum Senden und
  Weiterleiten zu sperren und den Netzzugang der Code-Ausführung auszuschalten. Das verringert das Risiko, schließt es aber nicht
  aus: Websuche und andere Konnektoren bleiben offen.
- **Prüfungen und fremde Daten:** Ob und wie du Claude bei Prüfungs- und Studienleistungen nutzen darfst, regeln Prüfungsordnung
  und Lehrende, dazu die Nutzungsrichtlinien von Anthropic. Die Universitätsbibliothek Tübingen rät auf ihrer Seite zur
  Literaturrecherche mit KI, keine urheberrechtlich geschützten Dokumente hochzuladen und keine persönlichen Daten Dritter
  einzugeben; das gilt sinngemäß auch für Claude. Diese Seite ist keine Rechtsberatung.

## Zentrale Daten ausschalten

1. **Einstellungen & Hilfe** → **Verbindungen** öffnen.
2. Bei „Zentrale Daten“ auf **Mehr erfahren** tippen.
3. Den Schalter **Zentrale Daten** ausschalten.

Danach ruft das Plugin nichts mehr von selbst bei GitHub ab, nur noch, wenn du auf **Nach Updates suchen**, **Neue Version
installieren** oder **Reparieren** tippst. Einzige Ausnahme: die Signatur der Liste deiner Version, wenn sie in deinem Tresor
fehlt, etwa einmal nach dem Update von 0.7.6 oder älter (oben). Vorhandene Termine bleiben stehen. Mit dem Schalter **Fachschaft & Veranstaltungen** blendest du nur Partys, Vorträge und Ähnliches aus.

Obsidian selbst und ein Sync-Dienst haben eigene Datenschutzregeln; die beschreibt diese Seite nicht.
