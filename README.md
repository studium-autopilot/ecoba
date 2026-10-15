<div align="center">

# Studium Autopilot – EcoBA

**Dein EcoBA-Studium an der Uni Tübingen an einem Ort.**<br>
Termine und Fristen, die sich selbst aktualisieren, Studienplan, Noten und ECTS – in der kostenlosen App Obsidian, auf
Handy, Tablet und Computer.

<br>

![Dashboard am Computer und auf dem iPhone: nächste Prüfung, Semester, ECTS, Notenschnitt, Semesterverlauf und Stundenplan aus Alma](docs/bilder/vorschau-1-dashboard.png)

</div>

## In 3 Schritten starten

### 1. Obsidian installieren

<a href="https://apps.apple.com/app/obsidian-connected-notes/id1557175442"><img src="docs/bilder/badge-app-store.png" alt="Laden im App Store" height="48"></a>&nbsp;&nbsp;<a href="https://play.google.com/store/apps/details?id=md.obsidian"><img src="docs/bilder/badge-google-play.png" alt="Jetzt bei Google Play" height="48"></a>&nbsp;&nbsp;<a href="https://obsidian.md/download"><img src="docs/bilder/badge-obsidian-desktop.svg" alt="Obsidian für Windows und Mac herunterladen" height="48"></a>

### 2. Vorlage laden

<a href="https://github.com/studium-autopilot/ecoba/raw/main/docs/kurzbefehl/Studium%20Autopilot%20installieren.shortcut"><img src="docs/bilder/badge-vorlage-ios.svg" alt="Vorlage für iPhone und iPad – mit Kurzbefehl" height="48"></a>&nbsp;&nbsp;<a href="https://github.com/studium-autopilot/ecoba/releases/latest/download/Studium-Autopilot.zip"><img src="docs/bilder/badge-vorlage-zip.svg" alt="Vorlage als ZIP-Datei für Mac, Windows und Android" height="48"></a>

Auf iPhone und iPad legt der Kurzbefehl die neueste Version direkt in Obsidian ab. Auf den anderen Geräten wird aus der
ZIP-Datei der Ordner `Studium Autopilot`.

### 3. In Obsidian öffnen

Den Ordner `Studium Autopilot` als Tresor öffnen und auf **Vertrauen und Plugins aktivieren** tippen. Fertig: Das
Dashboard öffnet sich, Termine und Fristen kommen von selbst.

<details>
<summary><b>Hilfe für iPhone & iPad</b></summary>

1. **Obsidian** einmal öffnen und wieder schließen.
2. [**Kurzbefehl für iPhone & iPad**](https://github.com/studium-autopilot/ecoba/raw/main/docs/kurzbefehl/Studium%20Autopilot%20installieren.shortcut) antippen → **Laden** → Datei öffnen → **Kurzbefehl hinzufügen**.
3. Den Kurzbefehl starten → **Erlauben** → als Ort **Auf meinem iPhone/iPad → Obsidian** wählen.
4. Obsidian öffnen → **Studium Autopilot** → **Vertrauen und Plugins aktivieren**.

Klappt der Kurzbefehl nicht: [ZIP-Datei](https://github.com/studium-autopilot/ecoba/releases/latest/download/Studium-Autopilot.zip) laden, in **Dateien** antippen und den Ordner nach **Obsidian** bewegen.

</details>

<details>
<summary><b>Hilfe für Mac & Windows</b></summary>

1. [ZIP-Datei](https://github.com/studium-autopilot/ecoba/releases/latest/download/Studium-Autopilot.zip) laden und entpacken (Mac: Doppelklick, Windows: Rechtsklick → **Alle extrahieren**).
2. Obsidian öffnen → **Ordner als Tresor öffnen** → den Ordner `Studium Autopilot` wählen.
3. **Vertrauen und Plugins aktivieren**.

</details>

<details>
<summary><b>Hilfe für Android</b></summary>

1. [ZIP-Datei](https://github.com/studium-autopilot/ecoba/releases/latest/download/Studium-Autopilot.zip) laden, in **Dateien** antippen → **Entpacken**.
2. Obsidian öffnen → **Ordner als Tresor öffnen** → den Ordner `Studium Autopilot` wählen → Zugriff **Erlauben**.
3. **Vertrauen und Plugins aktivieren**.

</details>

## Was drin ist

- **Dashboard:** nächste Prüfung, aktuelles Semester, ECTS, Notenschnitt, Fristen der nächsten 30 Tage und deine To-dos.
- **Termine und Fristen, die sich selbst aktualisieren:** Semesterdaten, Prüfungsphasen, Anmeldefristen und
  Veranstaltungen für EcoBA-Studierende kommen etwa stündlich von selbst.
- **Studienverlauf:** Musterstudienplan je Variante (Economics, Business Administration, ohne Spezialisierung),
  Orientierungsprüfung, Meilensteine.
- **Module und Noten:** 86 Module nach PO 2023 plus Mathe-Vorkurs, Gesamtnote und ECTS rechnen sich aus deinen Einträgen,
  dazu ein Schwerpunkt-Planer.
- **Alltag:** Stundenplan aus Alma (optional), Vorlesungsnotizen mit einem Klick, Unterlagen einordnen.

![Monatskalender mit Terminen der Uni, Fachschaft und Prüfungen am Computer, Studienverlauf auf dem iPhone](docs/bilder/vorschau-2-termine.png)

## Woher die Daten kommen

Termine, Fristen und Semesterdaten pflegt nicht jede:r selbst. Ein Server führt stündlich einen KI-gestützten Abgleich öffentlicher Uni-Quellen aus (Seiten der Universität, des Prüfungsamts und der Fachschaft, öffentliche Kalender und PDFs). Vor dem Veröffentlichen wird jeder geänderte Eintrag automatisch geprüft:

- **Freigabeliste:** Nur bestimmte Arten von Terminen aus öffentlichen Quellen und nur bestimmte Felder gehen raus, nie Notiztexte.
- **Scan auf persönliche Daten:** Namen, Mailadressen, Telefonnummern und Ähnliches halten einen Eintrag zurück.
- **KI-Prüfung:** Ein zweiter, getrennter KI-Aufruf prüft geänderte Einträge auf persönliche Angaben und Plausibilität. Nur was alle Prüfungen besteht, wird veröffentlicht.

Was die Prüfung besteht, landet als einfache Datendatei im öffentlichen Repo [`studium-autopilot/ecoba-daten`](https://github.com/studium-autopilot/ecoba-daten). Das Plugin im Vault holt sie dort ab, prüft sie noch einmal und legt daraus Termin-Notizen an.

<img src="docs/bilder/datenfluss.png" width="100%" alt="Datenfluss: öffentliche Uni-Quellen → KI-Abgleich stündlich → automatische Prüfung (Freigabeliste, Scan auf persönliche Daten, KI-Prüfung) → ecoba-daten auf GitHub Pages → Plugin im Vault">

Die KI kann sich irren. Darum steht an jedem Termin die Quelle und das Datum der letzten Prüfung; Angaben, die die Uni noch nicht veröffentlicht hat, sind als **geschätzt** markiert. Der Code des Abgleichs ist nicht Teil dieses Repos. Das Datenformat steht in [docs/daten-v1.md](docs/daten-v1.md).

## Was das Plugin tut und nicht tut

Der Vault bringt ein eigenes kleines Plugin mit („Studium Autopilot“). Du musst nichts weiter installieren.

- **Lädt nur Daten, nie Code.** Neue Versionen der Vorlage lädst du selbst herunter; das Plugin zeigt nur einen Hinweis.
- **Sendet nichts.** Kein Konto, keine Statistik, keine Telemetrie. GitHub sieht beim Abruf deine IP-Adresse, wie bei jeder Webseite.
- **Speichert keine Passwörter**, auch nicht für Alma, ILIAS oder Mail.
- **Dein Alma-Link bleibt auf dem Gerät.** Er wird nicht synchronisiert und nirgends hin geschickt.
- Deine Häkchen und alles unter „Meine Notizen“ in einem Termin werden nie überschrieben.

Mehr dazu: [docs/datenschutz.md](docs/datenschutz.md).

## Hinweis

**Kein offizielles Angebot der Universität Tübingen. Keine Gewähr – maßgeblich sind Alma, Prüfungsamt und Prüfungsordnung.**

Der Vault enthält keine Lehrmaterialien (Folien, Skripte, Altklausuren). Modul- und Prüfungsordnungs-Angaben sind in eigenen Worten zusammengefasst und auf die öffentlichen Dokumente der Universität verlinkt.

Apple und App Store sind Marken der Apple Inc. Google Play und das Google Play-Logo sind Marken der Google LLC.

## Fehler melden

Termin falsch, Frist fehlt oder etwas sieht kaputt aus? Bitte ein [Issue](https://github.com/studium-autopilot/ecoba/issues/new/choose) öffnen – es gibt Vorlagen für Fehler, Termine und Ideen. Wie du mithelfen kannst: [CONTRIBUTING.md](CONTRIBUTING.md). Änderungen je Version: [CHANGELOG.md](CHANGELOG.md). Alle Versionen: [Releases](https://github.com/studium-autopilot/ecoba/releases).

## In English

Studium Autopilot is a ready-to-use [Obsidian](https://obsidian.md) vault for students of the B.Sc. Economics and Business Administration at the University of Tübingen. It combines a module catalogue, study plan, grade tracking and a calendar in one place. Dates and deadlines are kept up to date automatically: a server runs an hourly AI-assisted comparison of public university sources, checks the results automatically (allowlist, scan for personal data, AI review) and publishes them as plain JSON on GitHub Pages. A small Obsidian plugin bundled with the vault fetches only that data, never code, and sends nothing back. [Download the latest version](https://github.com/studium-autopilot/ecoba/releases/latest/download/Studium-Autopilot.zip). Architecture notes are in [docs/architektur.md](docs/architektur.md) and [docs/daten-v1.md](docs/daten-v1.md).

## Für Fortgeschrittene

- **Mehrere Geräte:** denselben Tresor auf Handy, Tablet und Computer – [Anleitung](docs/installation.md#auf-mehreren-geräten)
- **Alma-Stundenplan verbinden:** dein Stundenplan per Link aus Alma, ohne Passwort – [Anleitung](docs/installation.md#alma-verbinden-stundenplan)
- **Updates:** neue Versionen der Vorlage einspielen – [Anleitung](docs/installation.md#update-auf-eine-neue-version)
- **Mit Claude-Abo:** alles mit einem Befehl in Claude Code einrichten (kommt bald) – [Mit Claude Code](docs/installation.md#mit-claude-code)

## Lizenz

- Code (Plugin, Skripte, Design): [MIT](LICENSE)
- Eigene Inhalte, Texte und Daten: [CC BY 4.0](LICENSE-INHALTE.md)

## Autor

Philip Walter ([@pdotwalt](https://github.com/pdotwalt)), Student im B.Sc. Economics and Business Administration in Tübingen.
