# Installation

Du brauchst nur die kostenlose App [Obsidian](https://obsidian.md) (Version 1.14.4 oder neuer). Ein Konto ist nicht nötig.

- [Herunterladen](#1-herunterladen)
- [Auf dein Gerät legen](#2-auf-dein-gerät-legen)
- [Vertrauen](#3-vertrauen)
- [Personalisieren und Alma verbinden](#4-personalisieren-und-alma-verbinden-optional)
- [Auf mehreren Geräten](#auf-mehreren-geräten)
- [Update auf eine neue Version](#update-auf-eine-neue-version)

## 1. Herunterladen

1. [Releases](https://github.com/studium-autopilot/ecoba/releases) öffnen.
2. Bei der neuesten Version unter **Assets** die ZIP-Datei von Studium Autopilot antippen. Nicht „Source code“ – das ist der Quelltext.

## 2. Auf dein Gerät legen

### iPhone und iPad

1. Obsidian einmal öffnen und wieder schließen. Dann gibt es in der Dateien-App den Ordner **Obsidian**.
2. App **Dateien** öffnen → **Downloads** → die ZIP-Datei antippen. Sie wird zu einem Ordner `Studium Autopilot`.
3. Den Ordner gedrückt halten → **Bewegen** → **Auf meinem iPhone** (bzw. **Auf meinem iPad**) → **Obsidian** → **Bewegen**.
4. Obsidian öffnen. Der Tresor **Studium Autopilot** steht in der Liste – antippen.

Willst du iCloud nutzen, siehe [Auf mehreren Geräten](#auf-mehreren-geräten).

### Windows und Mac

1. ZIP-Datei entpacken: Windows: Rechtsklick → **Alle extrahieren**. Mac: Doppelklick (Safari entpackt oft schon selbst).
2. Den Ordner `Studium Autopilot` an einen festen Platz legen, z. B. in **Dokumente**.
3. Obsidian öffnen → **Ordner als Tresor öffnen** → den Ordner `Studium Autopilot` wählen.

### Android

1. ZIP-Datei in der App **Dateien** (oder deinem Dateimanager) antippen → **Entpacken**.
2. Den Ordner `Studium Autopilot` z. B. nach **Documents** verschieben.
3. Obsidian öffnen → **Ordner als Tresor öffnen** → den Ordner wählen. Falls Obsidian nach Zugriff auf Dateien fragt: erlauben.

## 3. Vertrauen

Beim ersten Öffnen fragt Obsidian, ob du dem Tresor vertraust.

1. **Vertrauen und Plugins aktivieren** tippen (englisch: „Trust author and enable plugins“).
2. Das Dashboard öffnet sich. Aussehen, Menü und Termine sind schon eingerichtet.

Das ist auf jedem Gerät einmal nötig. Ohne diesen Schritt bleiben Kalender, Kennzahlen und Knöpfe leer.

Termine und Fristen kommen danach von selbst, beim ersten Mal nach einigen Minuten. Nicht warten? Seite **Einstellungen & Hilfe** → **Verbindungen** → bei „Zentrale Daten“ **Jetzt aktualisieren**.

## 4. Personalisieren und Alma verbinden (optional)

Alles läuft auch ohne Angaben. Dann gilt das aktuelle Semester als dein erstes.

### Personalisieren

1. Auf dem Dashboard bei **Personalisieren** auf **Jetzt eintragen** tippen.
2. Name (freiwillig), **Studienbeginn**, **Variante** und **Zielnote** wählen.
3. **Speichern**. Semester und Musterplan passen sich an.

Ändern kannst du alles später unter **Einstellungen & Hilfe** → **Deine Angaben**.

### Alma verbinden (Stundenplan)

1. Auf dem Dashboard **Alma verbinden** tippen (oder **Einstellungen & Hilfe** → **Verbindungen** → **Verbinden**).
2. **Alma** im Browser öffnen und anmelden.
3. **Mein Studium** → **Stundenplan** öffnen.
4. **Daten für iCalendar (ics) exportieren** wählen.
5. **Link kopieren**, in Obsidian einfügen und **Verbinden** tippen.

Dein Stundenplan erscheint sofort. Der Link enthält kein Passwort und bleibt nur auf diesem Gerät. Auf einem zweiten Gerät verbindest du Alma noch einmal – oder der Stundenplan kommt per Sync mit.

## Auf mehreren Geräten

**Nur ein Gerät? Dann brauchst du nichts – Termine kommen automatisch.**

Willst du denselben Tresor auf Handy und Laptop, brauchst du einen Sync-Dienst. Drei Möglichkeiten:

| Dienst | Für wen | Gut zu wissen |
|---|---|---|
| **Obsidian Sync** | alle Geräte, am einfachsten | kostet ein monatliches Abo bei Obsidian |
| **iCloud** | nur iPhone, iPad und Mac | kostenlos, braucht aber freien iCloud-Speicher |
| **Syncthing** | Android und PC | kostenlos; läuft nicht auf iPhone und iPad |

So geht's kurz:

- **Obsidian Sync:** In Obsidian **Einstellungen** → **Sync** → anmelden und Tresor verbinden. In den Sync-Einstellungen auch die Community-Plugins und die CSS-Snippets mit abgleichen lassen, sonst sieht es auf dem zweiten Gerät anders aus.
- **iCloud:** Den Ordner `Studium Autopilot` statt nach „Auf meinem iPhone“ nach **iCloud Drive** → **Obsidian** legen. Auf dem Mac liegt er dann unter iCloud Drive → Obsidian. Ist der iCloud-Speicher voll, stockt der Abgleich – dann erst Platz schaffen.
- **Syncthing:** Auf beiden Geräten Syncthing installieren und den Ordner `Studium Autopilot` teilen. Der versteckte Ordner `.obsidian` muss mit.

Egal welcher Dienst: Jedes Gerät braucht einmal **Vertrauen** (Schritt 3). Die zentralen Termine schreibt immer nur ein Gerät; die anderen bekommen sie über den Sync. Das regelt sich von selbst.

## Update auf eine neue Version

Das Plugin zeigt unter **Einstellungen & Hilfe** → **Verbindungen**, wenn eine neue Version da ist. Deine Termine und Fristen werden auch ohne Update aktuell gehalten.

> **Vorher sichern:** Kopiere den ganzen Ordner `Studium Autopilot` einmal an einen anderen Ort (oder als ZIP), bevor du etwas ersetzt.

1. Obsidian schließen (auf allen Geräten, die synchronisieren).
2. Die neue ZIP-Datei herunterladen und entpacken.
3. Aus der neuen Version in deinen Tresor kopieren und dabei ersetzen:
   - den Ordner `System/` – **außer** der Datei `System/Einstellungen.md` (darin stehen deine Angaben),
   - den Ordner `.obsidian/plugins/studium-autopilot/`,
   - die Dateien in `.obsidian/snippets/`.
4. Obsidian öffnen.

Deine eigenen Notizen, Noten, Termine und Unterlagen bleiben dabei unberührt. Muss sonst noch etwas ersetzt werden, steht es in den Hinweisen zur Version und im [CHANGELOG](../CHANGELOG.md).

Der Ordner `.obsidian` ist versteckt. Mac: im Finder <kbd>⌘</kbd>+<kbd>⇧</kbd>+<kbd>.</kbd> zeigt ihn. Windows: Explorer → **Ansicht** → **Ausgeblendete Elemente**.

## Mit Claude Code

Ein Weg, der alles mit einem Befehl in Claude Code einrichtet, kommt bald.
