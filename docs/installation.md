# Installation

Du brauchst nur die kostenlose App [Obsidian](https://obsidian.md) (Version 1.14.4 oder neuer). Ein Konto ist nicht nötig.

Die Installation richtet die Vorlage auf **einem** Gerät ein. Weitere Geräte verbindest du danach: siehe
[Weiteres Gerät verbinden](#weiteres-gerät-verbinden).

- [iPhone und iPad](#iphone-und-ipad)
- [Mac](#mac)
- [Windows](#windows)
- [Android](#android)
- [Vertrauen](#vertrauen)
- [Einrichtung beim ersten Start](#einrichtung-beim-ersten-start)
- [Weiteres Gerät verbinden](#weiteres-gerät-verbinden)
- [Update auf eine neue Version](#update-auf-eine-neue-version)

## iPhone und iPad

Am besten fängst du hier an.

1. **Obsidian** aus dem App Store laden und öffnen → **iCloud verwenden** → einen Namen eingeben (egal welchen, z. B.
   „Start“) → **Vault erstellen**. Erst damit legt Obsidian den Ordner **iCloud Drive** → **Obsidian** an; nur öffnen reicht
   nicht. Ohne iCloud: einen Vault auf dem Gerät erstellen, dann gibt es **Auf meinem iPhone** → **Obsidian**.
2. In Safari [**Kurzbefehl laden**](https://github.com/studium-autopilot/ecoba/raw/main/docs/kurzbefehl/Studium%20Autopilot%20installieren.shortcut) antippen → **Laden**. Dann oben auf das
   Download-Symbol, die Datei antippen → **Kurzbefehl hinzufügen**.
3. In der App **Kurzbefehle** auf **Studium Autopilot installieren** tippen und den Zugriff erlauben. Als Ort **iCloud Drive** → **Obsidian**
   wählen (kein iCloud: **Auf meinem iPhone** → **Obsidian**), nicht den Ordner des Vaults aus Schritt 1.
4. Obsidian öffnet sich mit **Studium Autopilot** (sonst: **Vault wechseln** → **Studium Autopilot**) →
   [**Dem Ersteller vertrauen und Erweiterungen aktivieren**](#vertrauen). Den Vault aus Schritt 1 brauchst du nicht mehr; löschen
   kannst du ihn in der App **Dateien** unter **iCloud Drive** → **Obsidian**.

<details>
<summary>Mehr erfahren: Was macht der Kurzbefehl?</summary>

Er fragt zuerst, ob es in Obsidian schon einen Vault gibt, und öffnet sonst Obsidian dafür. Dann lädt er die neueste Version
von GitHub, entpackt sie, speichert den Ordner `Studium Autopilot` an dem Ort, den du wählst, und öffnet ihn in Obsidian.
Er überschreibt nichts und sendet nichts. Du kannst ihn danach wieder löschen.

</details>

### Ohne Kurzbefehl

1. [**Studium-Autopilot.zip**](https://github.com/studium-autopilot/ecoba/releases/latest/download/Studium-Autopilot.zip) antippen → **Laden**.
2. App **Dateien** → **Downloads** → die ZIP-Datei antippen. Sie wird zum Ordner `Studium-Autopilot`.
3. Den Ordner gedrückt halten → **Bewegen** → **iCloud Drive** → **Obsidian** → **Bewegen** (kein iCloud: **Auf meinem iPhone** → **Obsidian**).
   Fehlt dort der Ordner **Obsidian**: zuerst Schritt 1 oben.
4. Obsidian öffnen → **Vault wechseln** → **Studium-Autopilot** → [**Dem Ersteller vertrauen und Erweiterungen aktivieren**](#vertrauen).

## Mac

Obsidian für den Mac kommt von [obsidian.md/download](https://obsidian.md/download), nicht aus dem App Store (dort gibt es
Obsidian nur für iPhone und iPad). Die geladene Datei öffnen und **Obsidian** in den Ordner **Programme** ziehen.

Danach einer von zwei Wegen:

- **Du hast auch ein iPhone oder iPad:** [Mac mit iPhone oder iPad](#mac-mit-iphone-oder-ipad). Ohne ZIP-Datei, und der Tresor
  ist gleich auf allen Apple-Geräten.
- **Nur der Mac:** [Nur Mac](#nur-mac), mit der ZIP-Datei.

### Mac mit iPhone oder iPad

1. Zuerst auf dem iPhone oder iPad installieren, wie [oben](#iphone-und-ipad) beschrieben, mit dem Ort **iCloud Drive** →
   **Obsidian**.
2. Auf dem Mac **Obsidian** öffnen → bei **Ordner als Vault öffnen** auf **Öffnen** klicken.
3. Links **iCloud Drive** → Ordner **Obsidian** (der mit dem Obsidian-Symbol) → `Studium Autopilot` markieren → **Öffnen**.
4. [**Dem Ersteller vertrauen und Erweiterungen aktivieren**](#vertrauen).

Beide Geräte brauchen denselben Apple Account mit eingeschaltetem iCloud Drive. Fehlt `Studium Autopilot` im Ordner
**Obsidian**, lädt iCloud noch: kurz warten.

### Nur Mac

1. [**Studium-Autopilot.zip**](https://github.com/studium-autopilot/ecoba/releases/latest/download/Studium-Autopilot.zip) laden.
   Safari packt sie selbst aus; bei Chrome oder Firefox die ZIP-Datei in **Downloads** doppelklicken. Danach liegt in
   **Downloads** der Ordner `Studium-Autopilot`.
2. Im Finder den Ordner von **Downloads** nach **Dokumente** ziehen.
3. **Obsidian** öffnen → bei **Ordner als Vault öffnen** auf **Öffnen** klicken → **Dokumente** → `Studium-Autopilot`
   markieren → **Öffnen**.
4. [**Dem Ersteller vertrauen und Erweiterungen aktivieren**](#vertrauen).

Kommt später ein iPhone oder iPad dazu: [Weiteres Gerät verbinden](#weiteres-gerät-verbinden).

### Hängt es am Mac?

- **Obsidian zeigt gleich einen anderen Tresor:** unten links auf seinen Namen klicken → **Vaults verwalten…**. Dort geht es mit
  **Ordner als Vault öffnen** weiter.
- **Der Mac fragt, ob Obsidian auf „Dokumente“ oder iCloud Drive zugreifen darf:** **Erlauben**. Sonst kann Obsidian den Tresor
  nicht lesen.
- **In iCloud Drive fehlt der Ordner Obsidian:** Den legt erst Obsidian auf dem iPhone oder iPad an, sobald dort ein Vault in
  iCloud entsteht. Dort Obsidian öffnen → **iCloud verwenden** → **Vault erstellen**; iCloud Drive muss an sein (iPhone:
  **Einstellungen** → dein Name → **iCloud** → **iCloud Drive**). Einen selbst angelegten Ordner „Obsidian“ ohne Symbol findet
  Obsidian auf dem iPhone nicht.
- **Obsidian zeigt einen fast leeren Tresor, nur mit einem Ordner darin:** Du hast den Ordner darüber geöffnet. Den Ordner
  wählen, in dem `Dashboard.md` direkt liegt.
- **Tresor in iCloud öffnet langsam:** Im Finder bei gedrückter Control-Taste auf **iCloud Drive** → **Obsidian** klicken und
  den Ordner geladen behalten (englisch „Keep Downloaded“, ab macOS 15). Sonst lädt der Mac Dateien erst beim Öffnen.

## Windows

1. [**Studium-Autopilot.zip**](https://github.com/studium-autopilot/ecoba/releases/latest/download/Studium-Autopilot.zip)
   laden. Im Explorer unter **Downloads** die ZIP-Datei rechts anklicken → **Alle extrahieren…** → **Extrahieren**. Das Ziel
   so lassen, wie es vorgeschlagen wird.
2. In **Downloads** liegt jetzt der Ordner `Studium-Autopilot`. Ihn links auf **Dokumente** ziehen, damit er beim Aufräumen
   von Downloads nicht verloren geht.
3. **Obsidian** öffnen → **Ordner als Vault öffnen** → **Dokumente** → `Studium-Autopilot` markieren → **Ordner auswählen**.
4. [**Dem Ersteller vertrauen und Erweiterungen aktivieren**](#vertrauen).

Obsidian zeigt einen fast leeren Tresor, nur mit einem Ordner darin? Dann war es der Ordner darüber. In Obsidian unten links
auf den Namen des Tresors → **Vaults verwalten…** → **Ordner als Vault öffnen** und den Ordner wählen, in dem `Dashboard.md`
direkt liegt.

## Android

1. [**Studium-Autopilot.zip**](https://github.com/studium-autopilot/ecoba/releases/latest/download/Studium-Autopilot.zip) laden.
2. In der App **Dateien** (oder deinem Dateimanager) unter **Downloads** die ZIP-Datei antippen → **Entpacken**. Es entsteht
   der Ordner `Studium-Autopilot`.
3. Obsidian öffnen → **Ordner als Vault öffnen** → **Download** → `Studium-Autopilot` → **Diesen Ordner verwenden**. Fragt
   Obsidian nach Zugriff auf Dateien: erlauben.
4. [**Dem Ersteller vertrauen und Erweiterungen aktivieren**](#vertrauen).

Wähle immer den Ordner, in dem `Dashboard.md` direkt liegt. Liegen nach dem Entpacken die Dateien lose in Download statt in
einem Ordner: in Download einen Ordner `Studium-Autopilot` anlegen, die ZIP-Datei dorthin verschieben und dort entpacken.


## Vertrauen

Beim ersten Öffnen fragt Obsidian, ob du dem Tresor vertraust.

1. **Dem Ersteller vertrauen und Erweiterungen aktivieren** tippen (englisch: „Trust author and enable plugins“).
2. Das Dashboard öffnet sich. Aussehen, Übersicht und Termine sind schon eingerichtet.

Das ist auf jedem Gerät einmal nötig. Ohne diesen Schritt bleiben Kalender, Kennzahlen und Knöpfe leer.

**Den anderen Knopf erwischt?** Dann steht oben auf dem Dashboard „Studium Autopilot ist noch aus“. So schaltest du es ein:
**Einstellungen** (Zahnrad unten links, am Handy erst ☰) → **Community-Plugins** → **Community-Plugins aktivieren**. Steht dort
„Studium Autopilot“ mit einem Schalter, ihn einschalten. Englisch: Settings → Community plugins → Turn on community plugins.

Termine und Fristen kommen danach von selbst, beim ersten Mal nach einigen Minuten. Nicht warten? Seite **Einstellungen & Hilfe** → **Verbindungen** → bei „Zentrale Daten“ **Aktualisieren**.

Die Vorlesungen deiner Module stehen im laufenden Semester von selbst im **Stundenplan**, auch ohne Alma (dafür braucht die
App deinen Studienbeginn aus der Einrichtung). Mit deinem Uni-Login kommt dein ganzer Stundenplan aus Alma samt Übungsgruppen.

## Einrichtung beim ersten Start

Nach dem [Vertrauen](#vertrauen) begrüßt dich eine kurze Einrichtung: **Studienbeginn**, **Variante**, Name und Zielnote,
dann **Dein Uni-Login** und das Aussehen. Jeden Schritt kannst du überspringen; mit **Später** geht es beim nächsten Start dort
weiter. Ohne Angaben gilt das aktuelle Semester als dein erstes.

Ändern kannst du alles unter **Einstellungen & Hilfe** → **Deine Angaben** (**Ändern** oder **Einrichtung erneut starten**).

### Dein Uni-Login (Unterlagen, Abgaben, Stundenplan)

1. In der Einrichtung bei **Dein Uni-Login** (später: **Einstellungen & Hilfe** → **Verbindungen** → bei „ILIAS-Unterlagen“
   **Verbinden**).
2. Benutzername und Passwort der Uni eingeben, wie bei ILIAS.
3. **Verbinden** tippen.

Danach kommen deine Kursdateien aus ILIAS, die Abgabetermine deiner Übungen aus dem ILIAS-Kalender und dein Stundenplan aus Alma
von selbst. Die Links zu Kalender und Stundenplan holt Studium Autopilot selbst. Dein Passwort bleibt verschlüsselt auf diesem
Gerät und geht nur an die Uni (ILIAS und Alma). Ein Gerät reicht, alles kommt über deinen Sync auf die anderen. Hast du ILIAS
schon früher verbunden, tippst du bei „ILIAS-Kalender“ bzw. „Alma-Stundenplan“ einmal auf **Verbinden**.

**Ohne Passwort:** Kalender und Stundenplan kannst du auch mit einem kopierten Link verbinden. Bei „Alma-Stundenplan“ bzw.
„ILIAS-Kalender“ **Verbinden** tippen und den Schritten im Fenster folgen: in Alma **Mein Studium** → **Stundenplan** →
**Daten für iCalendar (ics) exportieren** → **Link kopieren**, in ILIAS **Persönlicher Arbeitsraum** → **Kalender** →
**Abonnieren** → Link unter **iCal-URL**. Die Links bleiben nur auf diesem Gerät; der Link zum ILIAS-Kalender ist geheim wie ein
Passwort. Steht eine Abgabe schon bei deinen Fristen, kommt sie nicht doppelt.

## Weiteres Gerät verbinden

Dein Tresor läuft schon auf einem Gerät? So kommt er auf weitere. Such dir die Zeile mit deinen Geräten:

| Deine Geräte | Am einfachsten | Kosten |
|---|---|---|
| Nur Apple (iPhone, iPad, Mac) | [iCloud](#nur-apple-icloud) | kostenlos |
| Windows-PC und iPhone oder iPad | [iCloud für Windows](#windows-und-iphone-oder-ipad-icloud-für-windows) | kostenlos |
| Mit Android, oder alles ohne Aufwand | [Obsidian Sync](#alle-geräte-obsidian-sync) | kostenpflichtig |
| Eigener Server schon eingerichtet | [LiveSync](#mit-eigenem-server-livesync) | kostenlos |

Nimm für einen Tresor immer nur **einen** Weg. Zwei Abgleiche gleichzeitig erzeugen doppelte Dateien.

### Nur Apple: iCloud

Kostenlos, die Vorlage braucht nur wenige MB.

1. Liegt dein Tresor-Ordner noch nicht in **iCloud Drive → Obsidian**, ihn dorthin verschieben:
   - iPhone/iPad: App **Dateien** → Ordner gedrückt halten → **Bewegen** → **iCloud Drive** → **Obsidian**.
   - Mac: Obsidian beenden (⌘Q), im Finder den Ordner nach **iCloud Drive** → **Obsidian** ziehen. Dann Obsidian öffnen →
     **Ordner als Vault öffnen** → **Öffnen** → den Ordner dort wählen.

   Den Ordner **Obsidian** in iCloud Drive gibt es erst, wenn Obsidian auf einem iPhone oder iPad einen Vault in iCloud
   erstellt hat (**iCloud verwenden** → **Vault erstellen**, Name egal).
2. Auf jedem weiteren Gerät öffnen: iPhone/iPad → Obsidian → **Vault wechseln** → den Tresor (iCloud); Mac → **Ordner als
   Vault öffnen** → **Öffnen** → **iCloud Drive** → **Obsidian** → den Tresor-Ordner.
3. Einmal [**Vertrauen**](#vertrauen) tippen.

Ist der iCloud-Speicher voll, stockt der Abgleich – dann erst Platz schaffen.

### Windows und iPhone oder iPad: iCloud für Windows

Kostenlos. Der Tresor muss dafür schon auf dem iPhone oder iPad in **iCloud Drive → Obsidian** liegen (wie oben bei
[iPhone und iPad](#iphone-und-ipad) mit dem Ort **iCloud Drive**).

1. **iCloud für Windows** aus dem Microsoft Store installieren, mit deinem Apple Account anmelden und **iCloud Drive**
   einschalten.
2. Im Explorer links **iCloud Drive** öffnen. Den Ordner **Obsidian** (heißt im Pfad `iCloud~md~obsidian`) rechts anklicken →
   **Immer auf diesem Gerät behalten**. Warten, bis überall ein grüner Haken steht.
3. Obsidian öffnen → **Ordner als Vault öffnen** → **iCloud Drive** → **Obsidian** → den Tresor-Ordner → **Ordner auswählen**.
4. Einmal [**Vertrauen**](#vertrauen) tippen.

Ohne „Immer auf diesem Gerät behalten“ lädt Windows Dateien erst beim Öffnen, und Studium Autopilot startet unvollständig.

### Alle Geräte: Obsidian Sync

Kostenpflichtig (Preis auf [obsidian.md/sync](https://obsidian.md/sync)), dafür auf allen Geräten gleich und ohne weitere App.

1. Auf dem Gerät mit dem Tresor: **Einstellungen** → **Kernplugins** → **Sync** einschalten. Dann **Einstellungen** → **Sync**
   → anmelden → einen neuen Remote-Tresor anlegen und verbinden.
2. Unter **Einstellungen** → **Sync** alles bei den Dateitypen und Einstellungen einschalten, vor allem **Plugins**,
   **CSS-Snippets** und **andere Dateitypen**. Sonst fehlen auf den anderen Geräten Studium Autopilot, das Aussehen und die
   Lernstände der Karteikarten.
3. Auf jedem weiteren Gerät: Obsidian installieren, einen leeren Tresor anlegen, Sync wie in Punkt 1 einschalten und den
   Remote-Tresor wählen, dann dieselben Schalter wie in Punkt 2.
4. Warten, bis alles geladen ist, Obsidian einmal schließen und wieder öffnen, dann [**Vertrauen**](#vertrauen) tippen.

Für Technische geht auch Syncthing (kostenlos, nicht für iPhone und iPad). Die Android-App gibt es nur noch als
„Syncthing-Fork“ über F-Droid, nicht im Play Store. Den ganzen Tresor-Ordner samt `.obsidian` teilen.

### Mit eigenem Server: LiveSync

Kostenlos, alle Geräte (Windows, Mac, iPhone, iPad, Android), ohne iCloud. Hast du deinen
[eigenen Server](#eigener-server-mit-claude-für-technische) verbunden, tippe unter **Einstellungen & Hilfe** →
**Verbindungen** in der Zeile „Eigener Server“ auf **Mehr erfahren**. Unter „Windows und iPhone abgleichen“ **Prompt kopieren**
tippen und in Claude Desktop einfügen. Claude richtet den Abgleich ein und sagt dir, wo du tippen musst. Dafür kommt das
Community-Plugin Self-hosted LiveSync auf jedes Gerät; iCloud und andere Abgleiche für den Tresor schaltest du danach aus.

## Update auf eine neue Version

Gibt es eine neue Version, siehst du das unter **Einstellungen & Hilfe** → **Verbindungen** in der Zeile **Studium Autopilot**.

1. **Neue Version installieren** tippen.
2. Im Fenster noch einmal **Neue Version installieren** tippen. Fertig.

- **Was bleibt:** deine Noten, Termine, Notizen, Angaben, Unterlagen und dein Stundenplan. Hast du eine Seite selbst geändert,
  bleibt deine Fassung; hat sich die Seite in der neuen Version geändert, liegt die neue daneben mit „(neu …)“ im Namen. Bei
  Modulen bleiben deine Einträge (Status, Note, Versuch, Prüfungstermin, Planung), der Rest kommt neu. Darstellung und
  Programmteile kommen immer neu; hattest du sie geändert, liegt deine Fassung mit „(deine Fassung vor …)“ im Namen daneben.
- **Andere Geräte:** Das Update kommt über deinen Sync. Dort **nicht** noch einmal installieren. Steht dort **Neu laden**, das
  antippen (oder Obsidian einmal schließen und wieder öffnen).
- **Kein Netz oder Fehler:** Dann wird nichts geändert. Einfach später noch einmal versuchen.

<details>
<summary>Mehr erfahren</summary>

Neue Programmteile lädt Studium Autopilot nur, wenn du auf **Neue Version installieren** tippst, direkt aus diesem Repo auf GitHub. Jede
Datei wird mit einer Prüfsumme geprüft; erst wenn alles da und richtig ist, wird geschrieben. Vorher legt das Update eine
Sicherung der geänderten Dateien im versteckten Ordner `.trash/Studium Autopilot Sicherung …` deines Tresors an (am PC und Mac
sichtbar, wenn versteckte Dateien eingeblendet sind).

Den Hinweis auf neue Versionen bringen die zentralen Daten mit. Sind sie ausgeschaltet, siehst du keinen Knopf – dann wie bei der
Installation die neueste ZIP-Datei laden.

Neue Versionen früher ausprobieren: In der Zeile **Studium Autopilot** auf **Mehr erfahren** tippen, im Fenster noch einmal
**Mehr erfahren** öffnen und **Beta-Versionen** einschalten. Betas können noch Fehler haben.

</details>

## Eigener Server mit Claude (für Technische)

Freiwillig und erst, wenn die Einrichtung in Obsidian fertig ist. Claude richtet dir einen kostenlosen Server bei Oracle ein,
der in deinen Uni-Mails nach Terminen sucht. Den Text zum Einfügen in Claude Desktop und was du dafür brauchst, findest du im
README unter „Für Technische: eigener Server mit Claude“. Verbunden wird jedes Gerät mit einem eigenen Link vom Server;
danach steht unter **Einstellungen & Hilfe** → **Verbindungen** die Zeile **Eigener Server**.
