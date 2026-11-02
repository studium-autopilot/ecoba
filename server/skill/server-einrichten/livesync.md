# LiveSync einrichten

Danach gleicht der eigene Server den Tresor zwischen Windows, Mac, iPhone, iPad und Android ab, in Sekunden und ohne iCloud.
Dafür gibt es in Obsidian das kostenlose Community-Plugin **Self-hosted LiveSync**; der Server bekommt eine eigene Datenbank nur
für diesen Tresor. Der Tresor liegt dort verschlüsselt, auch die Dateinamen.

Voraussetzung: Der Server ist eingerichtet (`start.sh` aus [schritte.md](schritte.md) ist mindestens über „Installieren“
hinaus). Die Grundregeln aus [SKILL.md](SKILL.md) gelten auch hier, vor allem: **ein Schritt je Nachricht**, und **Codes gehören
nicht in den Chat**.

**Link und Code von LiveSync liest du nie.** Zusammen geben sie dauerhaft den Zugang zur Datenbank und den Schlüssel, mit dem
der Tresor verschlüsselt ist. Darum: Du tippst den Befehl in die Cloud Shell, dann sagst du „Lies Link und Code jetzt selbst ab“
und machst kein Bildschirmfoto und liest die Seite nicht, bis der Mensch „fertig“ sagt. Den Link öffnet der Mensch selbst (am
Computer in seinem normalen Browser, nicht im eingebauten), den Code tippt er auf dem Gerät ein und schickt ihn dir nicht. Du
rufst die Seite des Links nie ab und öffnest ihn nicht für ihn.

| # | Schritt | Schon erledigt, wenn … |
|---|---|---|
| L1 | Server vorbereiten | Status (`bash ~/studium-autopilot/server/fern.sh status` in der Cloud Shell): `livesync` ist `an` |
| L2 | Erstes Gerät | LiveSync-Symbol ohne Fehler, und unter **🔄 Sync Settings → Hidden Files** steht „🔁 : Enabled“ |
| L3 | Weitere Geräte | auf jedem Gerät, das der Mensch nennt, ist der Tresor da, mit Dashboard und Studium Autopilot |
| L4 | Aufräumen | iCloud und andere Abgleiche sind für diesen Tresor aus |

## Auslöser

- **„Richte LiveSync ein“** (Prompt aus dem Fenster „Eigener Server“): L1, dann der Reihe nach.
- **„Verbinde noch ein Gerät mit LiveSync“**: L3 für ein Gerät.

## L1. Server vorbereiten

Erst fragen, auf welchen Geräten der Tresor sein soll und auf welchem er gerade am aktuellsten ist (meist der Computer). Dann
die Cloud Shell öffnen (Oracle-Konsole oben rechts, **>_**):

```bash
bash ~/studium-autopilot/server/fern.sh aktualisieren --jetzt
bash ~/studium-autopilot/server/fern.sh livesync
```

Das Einschalten dauert beim ersten Mal 2 bis 4 Minuten (Datenbank installieren, Zertifikat holen). Am Ende stehen ein Link,
ein **Code** (`xxxx-xxxx-xxxx`) und ein QR-Code; beide gelten 30 Minuten. Ab hier liest du nicht mit (siehe oben). Ein neuer
Link: nur die letzte Zeile noch einmal. Steht dort „Die nächsten 60 Minuten darf ein Gerät den Tresor auf dem Server neu
aufbauen“: L2 innerhalb dieser Stunde, sonst die letzte Zeile noch einmal. Steht der Satz nicht da, war LiveSync auf dem Server
schon eingeschaltet. Hat noch kein Gerät den Tresor hochgeladen (L2 nie erledigt), vor L2 einmal
`bash ~/studium-autopilot/server/fern.sh livesync aufbauen`.

Meldungen:
- „das Server-Paket ist zu alt; erst aktualisieren …“: die erste Zeile ist nicht durchgelaufen. Ihre
  Ausgabe zeigen, nicht weiter.
- „… ist von außen nicht erreichbar“: eine Minute warten und die letzte Zeile noch einmal. Kommt die Meldung wieder: wörtlich
  zeigen und die Meldung an den Autor vorbereiten (SKILL.md).

## L2. Erstes Gerät (das mit dem aktuellen Tresor)

Dieses Gerät lädt den Tresor auf den Server. Vorher:

- **Liegt der Tresor in iCloud?** (iPhone/iPad: Obsidian fragt beim Anlegen „In iCloud speichern“; Windows: Ordner unter
  „iCloud Drive“.) Dann gleicht er doppelt ab, das gibt Konflikte. Am Computer: Obsidian schließen, den Tresor-Ordner aus iCloud
  Drive an einen normalen Ort verschieben (z. B. „Dokumente“), in Obsidian mit **Ordner als Vault öffnen** wieder öffnen. Das
  verschiebt der Mensch selbst.

Dann in Obsidian:

1. **Einstellungen → Externe Erweiterungen** (englisch Community plugins). Steht da der Knopf **Eingeschränkten Modus
   verlassen**: tippen. Nicht „Einschalten“ beim Eingeschränkten Modus, das schaltet alle Erweiterungen aus.
2. **Durchsuchen**, nach **Self-hosted LiveSync** suchen (Autor vorotamoroz), **Installieren**, dann **Aktivieren**. Fragt
   LiveSync gleich nach einer Einrichtung: **schließen**; die Einrichtung kommt über den Link.
3. Am Computer den **Link** aus der Cloud Shell im normalen Browser öffnen (der Mensch, nicht du), am Handy den **QR-Code** mit
   der Kamera scannen. Auf der Seite
   **In Obsidian öffnen** tippen, Obsidian erlauben, den Link zu öffnen.
4. Obsidian fragt (englisch) nach einer „passphrase“. Hier den **Code** aus der Cloud Shell eintippen (mit Bindestrichen).
5. Am Ende fragt LiveSync (englisch) „Mostly Complete: Decision Required“: hier **„Initialise or overwrite the remote“** wählen
   und bestätigen. Das legt den Tresor dieses Geräts auf den Server. Meldet LiveSync dabei einen Fehler mit „unauthorized“ oder
   „forbidden“, ist die Stunde aus L1 vorbei: in der Cloud Shell `bash ~/studium-autopilot/server/fern.sh livesync aufbauen`, dann
   Schritt 5 noch einmal.
6. LiveSync meldet danach „All optional features are disabled“: **OK**. Warten, bis das Symbol unten rechts zur Ruhe kommt
   (am Handy oben). Bei vielen PDFs dauert das einige Minuten; Obsidian offen lassen.
7. **Versteckte Dateien wieder einschalten** (Dashboard-Darstellung, Einstellungen von Obsidian; ohne sie kommen auf den anderen
   Geräten nur die Notizen an). Plugins gleicht LiveSync absichtlich nicht ab, weder Studium Autopilot noch andere, und auch nicht,
   welche eingeschaltet sind: Jedes Gerät installiert seine Plugins selbst, Studium Autopilot geprüft aus dem Release. So:
   **Einstellungen → Self-hosted LiveSync**, oben den Reiter
   **🔄** (Sync Settings), Abschnitt **Hidden Files**, bei „Enable Hidden files sync“ **Overwrite** tippen (lädt sie von diesem
   Gerät hoch). Fehlt der Abschnitt: im Reiter **⚙️** (General Settings) unter „Extra menus“ „Enable advanced features“ einschalten.
   Danach steht dort „🔁 : Enabled“.

## L3. Weitere Geräte

Jedes Gerät braucht einen eigenen Link: in der Cloud Shell

```bash
bash ~/studium-autopilot/server/fern.sh livesync verbinden
```

Auf dem Gerät:

1. **Studium Autopilot neu installieren**, wie beim ersten Mal (README: am Computer die ZIP, auf iPhone/iPad der Kurzbefehl), in
   einen neuen Tresor. So kommt Studium Autopilot selbst geprüft aus dem Release; über LiveSync kommt es nicht (siehe L2, Punkt 7).
   Andere Community-Plugins, die der Mensch auf dem ersten Gerät nutzt, installiert er hier ebenso selbst.
   iPhone/iPad: **„In iCloud speichern“ ausschalten**. Die Einrichtung von Studium Autopilot (Name, Studienbeginn) überspringen, sie
   kommt gleich vom Server. Gibt es auf dem Gerät schon einen Tresor gleichen Namens, ihn vorher umbenennen, damit nichts verloren
   geht.
2. Wie in L2, Punkte 1 bis 4: Eingeschränkten Modus verlassen, **Self-hosted LiveSync** installieren und aktivieren, QR-Code
   scannen bzw. Link öffnen, **In Obsidian öffnen**, Code eintippen.
3. Bei „Mostly Complete: Decision Required“ diesmal **„Join this device“** wählen (nicht „overwrite“!). Fragt LiveSync danach, wie
   es mit den Dateien auf dem Gerät umgehen soll: **„Overwrite all with remote files“**, dann **„Delete local files if not on
   remote“**. So gilt überall der Tresor vom Server, nichts aus dem frisch installierten geht hinauf. Danach „All optional features
   are disabled“ mit **OK**. Obsidian offen lassen, bis die Notizen da sind.
4. **Versteckte Dateien holen:** wie in L2, Punkt 7, aber diesmal **Fetch** tippen (nicht „Overwrite“!): Das holt Darstellung und
   Einstellungen vom Server. Danach Obsidian ganz schließen (iPhone/iPad: im App-Umschalter wegwischen) und neu öffnen. Am
   iPhone/iPad läuft der Abgleich nur, solange Obsidian im Vordergrund ist.
5. Mit dem eigenen Server verbinden (Schritt 6 in [schritte.md](schritte.md), auf dem neuen Gerät **Mit Code verbinden**) muss
   man das neue Gerät nur, wenn es selbst Termine abholen soll; der Abgleich bringt sie ohnehin mit.

## L4. Aufräumen

- iCloud, OneDrive, Obsidian Sync oder Syncthing für diesen Tresor ausschalten bzw. den Tresor dort herausnehmen: zwei Abgleiche
  gleichzeitig erzeugen doppelte Dateien.
- Den Code nicht aufheben; für jedes neue Gerät gibt es einen neuen.
- Zum Schluss sagen: Der Schlüssel für die Verschlüsselung liegt auf dem eigenen Server (nur für den Administrator lesbar), so
  wie der Uni-Zugang. Wer den Server besitzt, kann den Tresor lesen; sonst niemand.

## Wenn etwas hakt

- **iPhone/iPad gleicht nach dem Aufwachen nichts mehr ab** (Fehlermeldung mit „database connection is closing“): Ein bekannter
  Fehler von LiveSync auf iOS, kein Problem des Servers. Studium Autopilot öffnet die Datenbank nach der Rückkehr in die App
  selbst neu (im Protokoll von LiveSync steht dann eine Zeile „Studium Autopilot: …“). Hängt es danach noch: Obsidian im
  App-Umschalter wegwischen und neu öffnen.
- **Vom Computer kommt erst etwas an, wenn sein Obsidian-Fenster wieder offen ist** (minimiert gleicht LiveSync dort nicht ab):
  Links seit Studium Autopilot 0.6.8 lassen LiveSync dort weiterlaufen. Bei einem Computer, der vorher verbunden wurde:
  **Einstellungen → Self-hosted LiveSync**, Reiter **🔄** (Sync Settings), „Keep replication active in the background“
  einschalten.
- **„Link abgelaufen“**: neuer Link mit dem Befehl aus L3.
- **Tresor auf dem Server neu aufbauen** („Overwrite remote“ später, etwa nach einem Fehler): Das darf ein Gerät nur eine Stunde
  nach `bash ~/studium-autopilot/server/fern.sh livesync aufbauen`.
- **Ein Gerät verloren, Link samt Code in fremden Händen oder neue Adresse des Servers:** neue Zugangsdaten mit
  `bash ~/studium-autopilot/server/fern.sh livesync-erneuern`; die Ausgabe sagt, was auf jedem Gerät zu tun ist (je ein neuer Link
  mit dem Befehl aus L3, dort „Join this device“). Nur wenn der Schlüssel der Verschlüsselung bekannt geworden sein kann, mit
  `--neue-passphrase` dahinter; dann baut das Gerät mit dem aktuellsten Tresor ihn neu auf (wie L2), alle anderen treten bei.
- **Geräte, die vor diesem Stand verbunden wurden,** gleichen Plugins (auch Studium Autopilot selbst) noch als versteckte Dateien
  ab. Das ändert `livesync-erneuern` mit einem neuen Link je Gerät, oder in LiveSync unter **🔄 Sync Settings → Hidden Files** bei
  den Mustern zum Ignorieren `, /plugins/, /community-plugins.json$` anhängen.
- **Erstes Gerät meldet „unauthorized“ beim Aufbau:** Das Fenster dafür öffnet nur der erste Link nach dem Einschalten, eine
  Stunde lang. Danach `bash ~/studium-autopilot/server/fern.sh livesync aufbauen` und Schritt 5 aus L2 noch einmal.
- **Code falsch eingetippt**: den Link noch einmal öffnen, er gilt 30 Minuten.
- **Auf einem Gerät fehlt Studium Autopilot oder ein anderes Plugin**: Plugins kommen nicht über LiveSync. Das Gerät neu aufnehmen wie in L3 (den Tresor
  dort vorher umbenennen; die Notizen kommen vom Server).
- **Das Dashboard sieht roh aus**: Die versteckten Dateien sind dort aus. L3, Punkt 4 (**Fetch**). Auf dem ersten Gerät nie
  „Fetch“, dort gilt „Overwrite“ nur beim ersten Einschalten; steht schon „🔁 : Enabled“, nichts tippen.
