# Änderungen

Versionsnummern nach [Semantic Versioning](https://semver.org/lang/de/).

## 0.3.1 – Update-Hinweis auf dem Dashboard

- Gibt es eine neue Version, steht oben auf dem Dashboard eine schmale Zeile mit **Aktualisieren** und **Später** (blendet
  sie für diese Version auf diesem Gerät aus). Ist nach einem Update „Neu laden“ nötig, steht es dort ebenso.

## 0.3.0 – Einrichtung beim ersten Start

- Beim ersten Öffnen führt eine kurze Einrichtung durch Studienbeginn, Variante, Name und Zielnote und das Verbinden von
  Alma. Jeder Schritt lässt sich überspringen; „Später“ setzt beim nächsten Start am selben Schritt fort. Auf weiteren
  Geräten erscheint sie nicht noch einmal, ein schon eingerichteter Tresor (Update von 0.2.0) sieht sie nicht.
- Schlösser nur noch für Übersprungenes: Das Schloss im Wochenplan erscheint nur, wenn Alma übersprungen wurde (oder die
  Einrichtung noch offen ist) und kein Stundenplan da ist.
- Die Karte „Personalisieren“ auf dem Dashboard entfällt. In **Einstellungen & Hilfe** gibt es **Einrichtung erneut starten**.
- Behoben: Auf der Seite Stundenplan standen auch bei verbundenem Alma „Alma verbinden“ und der Hinweis dazu. Jetzt
  erscheint verbunden nur **Stundenplan aus Alma holen**.
- Behoben: In **Unterlagen** wurde das Datum in der Spalte „Fällig“ abgeschnitten („20.10.202…“), am PC und auf dem iPhone.

## 0.2.0 – Update mit einem Tipp

- Neue Versionen holst du in Obsidian: **Einstellungen & Hilfe** → **Verbindungen** → **Studium Autopilot** → **Aktualisieren**.
  Jede Datei wird geprüft, vorher entsteht eine Sicherung; kein Netz oder ein Fehler ändert nichts.
- Deine Einträge bleiben: Noten, Termine, Notizen, Angaben. Selbst geänderte Seiten bleiben, die neue Fassung liegt daneben;
  bei Modulen bleiben Status, Note, Versuch, Prüfungstermin und Planung.
- Auf weiteren Geräten kommt das Update über den Sync („Neu laden“, falls nötig).
- Schalter **Beta-Versionen** (unter „Mehr erfahren“) für alle, die neue Versionen früher testen möchten.
- Installation: iOS-Kurzbefehl, Anleitung je Gerät, eigener Abschnitt „Weiteres Gerät verbinden“ (iCloud, Obsidian Sync,
  Syncthing); Download immer unter dem festen Namen `Studium-Autopilot.zip`.
- Termine & Anmeldungen: echter Monatskalender.
- Studienverlauf im hellen Design des übrigen Vaults, alle Funktionen erhalten.

## 0.1.0 – erster öffentlicher Stand

- Fertiger Obsidian-Tresor für den B.Sc. Economics and Business Administration (PO 2023), läuft nach „Vertrauen und Plugins aktivieren“ ohne weitere Einstellungen auf iPhone, iPad, Android, Windows und Mac.
- Eigenes Plugin „Studium Autopilot“ statt Templater: Knöpfe, Vorlagen für neue Notizen, Bereiche-Menü.
- Dashboard mit nächster Prüfung, Semester, ECTS, Notenschnitt, Semesterverlauf, Fristen und To-dos.
- Neun Bereiche: Studienverlauf, Termine & Anmeldungen, Prüfungen, Noten & ECTS, Unterlagen, Schwerpunkt-Planer, Kontakte & Links, Einstellungen & Hilfe und Stundenplan.
- Modulkatalog mit 86 Modulen und Mathe-Vorkurs; Musterstudienpläne je Variante; Gesamtnote, ECTS und Orientierungsprüfung rechnen sich selbst.
- Zentrale Daten: Termine, Fristen und Semesterdaten kommen etwa stündlich aus `studium-autopilot/ecoba-daten`; das Plugin prüft sie und lässt eigene Häkchen und Notizen unberührt.
- Sinnvolle Standardwerte statt Pflicht-Einrichtung; optional Personalisieren (Name, Studienbeginn, Variante, Zielnote).
- Alma-Stundenplan per Kalender-Link, gespeichert nur auf dem Gerät.
- Vorlesungsnotizen, Übungsblätter und Unterlagen einordnen mit einem Klick.
- Hell und dunkel, mehrere Farbschemata.
