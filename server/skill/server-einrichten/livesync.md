# LiveSync einrichten

Danach gleicht der eigene Server den Tresor zwischen Windows, Mac, iPhone, iPad und Android ab, in Sekunden und ohne iCloud.
Dafür gibt es in Obsidian das kostenlose Community-Plugin **Self-hosted LiveSync**; der Server bekommt eine eigene Datenbank nur
für diesen Tresor. Der Tresor liegt dort verschlüsselt, auch die Dateinamen.

Voraussetzung: Der Server ist eingerichtet (Schritt 5 in [schritte.md](schritte.md)). Die Grundregeln aus [SKILL.md](SKILL.md)
gelten auch hier, vor allem: **ein Schritt je Nachricht**, und **Codes gehören nicht in den Chat**. Der Code für ein Gerät
erscheint in der Cloud Shell; der Mensch tippt ihn auf dem Gerät selbst ein und schickt ihn dir nicht.

| # | Schritt | Schon erledigt, wenn … |
|---|---|---|
| L1 | Server vorbereiten | Status: `livesync` ist `an` |
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
cd ~/studium-autopilot && IP=$(node server/einrichten.mjs adresse --json | jq -r .ip)
ssh -i ~/.ssh/studium_autopilot ubuntu@$IP "sudo studium-server aktualisieren"
ssh -t -i ~/.ssh/studium_autopilot ubuntu@$IP "sudo studium-server livesync"
```

Das Einschalten dauert beim ersten Mal 2 bis 4 Minuten (Datenbank installieren, Zertifikat holen). Am Ende stehen ein Link,
ein **Code** (`xxxx-xxxx-xxxx`) und ein QR-Code; beide gelten 30 Minuten. Ein neuer Link: nur die letzte Zeile noch einmal.

Meldungen:
- „das Server-Paket ist zu alt; erst: sudo studium-server aktualisieren“: die zweite Zeile ist nicht durchgelaufen. Ihre
  Ausgabe zeigen, nicht weiter.
- „… ist von außen nicht erreichbar“: eine Minute warten und die letzte Zeile noch einmal. Kommt die Meldung wieder: wörtlich
  zeigen und die Meldung an den Autor vorbereiten (SKILL.md).

## L2. Erstes Gerät (das mit dem aktuellen Tresor)

Dieses Gerät lädt den Tresor auf den Server. Vorher:

- **Liegt der Tresor in iCloud?** (iPhone/iPad: Obsidian fragt beim Anlegen „In iCloud speichern“; Windows: Ordner unter
  „iCloud Drive“.) Dann gleicht er doppelt ab, das gibt Konflikte. Am Computer: Obsidian schließen, den Tresor-Ordner aus iCloud
  Drive an einen normalen Ort verschieben (z. B. „Dokumente“), in Obsidian mit **Ordner als Tresor öffnen** wieder öffnen. Das
  verschiebt der Mensch selbst.

Dann in Obsidian:

1. **Einstellungen → Community-Plugins**. Steht da „Eingeschränkter Modus“: **Community-Plugins aktivieren**.
2. **Durchsuchen**, nach **Self-hosted LiveSync** suchen (Autor vorotamoroz), **Installieren**, dann **Aktivieren**. Fragt
   LiveSync gleich nach einer Einrichtung: **schließen**; die Einrichtung kommt über den Link.
3. Am Computer den **Link** aus der Cloud Shell im Browser öffnen, am Handy den **QR-Code** mit der Kamera scannen. Auf der Seite
   **In Obsidian öffnen** tippen, Obsidian erlauben, den Link zu öffnen.
4. Obsidian fragt (englisch) nach einer „passphrase“. Hier den **Code** aus der Cloud Shell eintippen (mit Bindestrichen).
5. Am Ende fragt LiveSync (englisch) „Mostly Complete: Decision Required“: hier **„Initialise or overwrite the remote“** wählen
   und bestätigen. Das legt den Tresor dieses Geräts auf den Server.
6. LiveSync meldet danach „All optional features are disabled“: **OK**. Warten, bis das Symbol unten rechts zur Ruhe kommt
   (am Handy oben). Bei vielen PDFs dauert das einige Minuten; Obsidian offen lassen.
7. **Versteckte Dateien wieder einschalten** (Studium Autopilot selbst, Dashboard-Darstellung, Einstellungen von Obsidian;
   ohne sie kommen auf den anderen Geräten nur die Notizen an): **Einstellungen → Self-hosted LiveSync**, oben den Reiter
   **🔄** (Sync Settings), Abschnitt **Hidden Files**, bei „Enable Hidden files sync“ **Overwrite** tippen (lädt sie von diesem
   Gerät hoch). Fehlt der Abschnitt: im Reiter **⚙️** (General Settings) unter „Extra menus“ „Enable advanced features“ einschalten.
   Danach steht dort „🔁 : Enabled“.

## L3. Weitere Geräte

Jedes Gerät braucht einen eigenen Link: in der Cloud Shell

```bash
cd ~/studium-autopilot && IP=$(node server/einrichten.mjs adresse --json | jq -r .ip)
ssh -t -i ~/.ssh/studium_autopilot ubuntu@$IP "sudo studium-server livesync verbinden"
```

Auf dem Gerät:

1. **Neuen, leeren Tresor** anlegen, Name wie auf dem ersten Gerät. iPhone/iPad: **„In iCloud speichern“ ausschalten** (der
   Tresor liegt dann „Auf meinem iPhone/iPad“). Nicht den alten Tresor nehmen, wenn es auf dem Gerät schon einen gibt: Zwei
   Fassungen würden vermischt. Einen alten Tresor erst umbenennen, damit nichts verloren geht.
2. Wie in L2, Punkte 1 bis 4: Community-Plugins aktivieren, **Self-hosted LiveSync** installieren und aktivieren, QR-Code
   scannen bzw. Link öffnen, **In Obsidian öffnen**, Code eintippen.
3. Bei „Mostly Complete: Decision Required“ diesmal **„Join this device“** wählen (nicht „overwrite“!), danach „All optional
   features are disabled“ mit **OK**. Obsidian offen lassen, bis die Notizen da sind.
4. **Versteckte Dateien holen:** wie in L2, Punkt 7, aber diesmal **Fetch** tippen (nicht „Overwrite“!): Das holt Studium
   Autopilot, Darstellung und Einstellungen vom Server. Danach Obsidian ganz schließen (iPhone/iPad: im App-Umschalter
   wegwischen) und neu öffnen; erst dann läuft Studium Autopilot. Am iPhone/iPad läuft der Abgleich nur, solange Obsidian im
   Vordergrund ist.
5. Mit dem eigenen Server verbinden (Schritt 9 in [schritte.md](schritte.md)) muss man das neue Gerät nur, wenn es selbst Termine
   abholen soll; der Abgleich bringt sie ohnehin mit.

## L4. Aufräumen

- iCloud, OneDrive, Obsidian Sync oder Syncthing für diesen Tresor ausschalten bzw. den Tresor dort herausnehmen: zwei Abgleiche
  gleichzeitig erzeugen doppelte Dateien.
- Den Code nicht aufheben; für jedes neue Gerät gibt es einen neuen.
- Zum Schluss sagen: Der Schlüssel für die Verschlüsselung liegt auf dem eigenen Server (nur für den Administrator lesbar), so
  wie der Uni-Zugang. Wer den Server besitzt, kann den Tresor lesen; sonst niemand.

## Wenn etwas hakt

- **iPhone/iPad gleicht nach dem Aufwachen nichts mehr ab** (Fehlermeldung mit „database connection is closing“): Obsidian im
  App-Umschalter wegwischen und neu öffnen. Ein bekannter Fehler von LiveSync auf iOS, kein Problem des Servers.
- **„Link abgelaufen“**: neuer Link mit dem Befehl aus L3.
- **Code falsch eingetippt**: den Link noch einmal öffnen, er gilt 30 Minuten.
- **Auf einem Gerät fehlt Studium Autopilot oder das Dashboard sieht roh aus**: Die versteckten Dateien sind dort aus. L3,
  Punkt 4 (**Fetch**). Auf dem ersten Gerät nie „Fetch“, dort gilt „Overwrite“ nur beim ersten Einschalten; steht schon
  „🔁 : Enabled“, nichts tippen.
