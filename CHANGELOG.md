# Änderungen

Versionsnummern nach [Semantic Versioning](https://semver.org/lang/de/).

## 0.4.0 – Unterlagen aus ILIAS

- Neu: **ILIAS verbinden** (Einstellungen & Hilfe → Verbindungen, freiwillig auch in der Einrichtung). Einmal Benutzername
  und Passwort eingeben und deine Kurse wählen; Kurse mit Modulcode sind schon an.
- Deine Kursdateien landen von selbst unter **Unterlagen**, je Modul in einem Ordner und mit Notiz. Ein Gerät reicht, die
  anderen bekommen sie über deinen Sync. Sofort holen: **Aus ILIAS holen** auf der Seite Unterlagen.
- Bessere Namen beim Einordnen: Art, Nummer und Modul werden zuverlässiger erkannt, der Titel kommt wenn möglich aus der
  ersten Seite der PDF.
- Was du umbenennst oder löschst, bleibt so. Ändert der Dozent eine Datei, die du angemerkt hast, bleibt deine, und die neue
  liegt daneben. Videos und Dateien über 50 MB bleiben in ILIAS.
- Dein Passwort bleibt verschlüsselt auf diesem Gerät und geht nur an die Uni. Trennen löscht es.

Außerdem:

- Neu: Übungs- und Tutoriengruppen kommen aus den zentralen Daten, gefiltert nach deinen Modulen; Gruppen in deinem
  Stundenplan sind markiert.
- Aufgeräumt: In **Einstellungen & Hilfe** fallen die Checkliste fürs erste Semester, der doppelte Abschnitt „Semester und
  Prüfungsphasen“ und Ratschläge ohne Bezug zur App weg. Auch auf den anderen Seiten stehen weniger Erklärsätze und keine
  Angaben mehr doppelt; auf **Termine & Anmeldungen** steht **Termin anlegen** jetzt oben. Modulnotizen wiederholen die
  Prüfungsregeln nicht mehr, Übersichtsseiten haben keine versteckten Fußzeilen mehr.
- Noten & ECTS: Die Spalte „Termin“ zeigt den Klausurtermin aus den Termin-Notizen (wie „Nächste Prüfung“).
- Studienverlauf: „Andere Varianten ansehen →“ steht nur noch, wenn du eine Variante gewählt hast.
- Leere Tabellen zeigen kein abgeschnittenes „ein Wert“ mehr.
- Behoben: „Deine Angaben“ in **Einstellungen & Hilfe** blieb manchmal unsichtbar.
- Behoben: Auf **Prüfungen** und im **Studienverlauf** stand „Termin folgt“ bei Modulen, deren Klausurtermin schon bekannt
  ist. Jetzt steht dort das Datum.
- Behoben: Die Knopf-Tabelle der Hilfe war in der Zeile „Übungsblatt“ verrutscht, auf dem iPhone passten die Beschriftungen
  nicht zu den Spalten.
- Der KI-Assistent in den Verbindungen sagt jetzt ehrlich, dass er erst noch kommt.
- Die Hilfe zu Unterlagen ist kürzer: ein Satz, vier Schritte, alles Weitere unter „Mehr erfahren“.
- Der Stundenplan zeigt eine echte Kalenderwoche (am Wochenende schon die nächste), mit Datum je Tag und „KW“. Tutorien und
  Übungen erscheinen erst ab der Woche, in der sie beginnen, und nach ihrem letzten Termin nicht mehr. Ausfälle und Pausen
  sind durchgestrichen; in Wochen ohne Veranstaltung steht zum Beispiel „Weihnachtspause“. Auf der Seite Stundenplan
  gibt es dazu die Karte **Woche danach**, und die Liste zeigt statt der Art den Zeitraum jeder Veranstaltung.
- iPhone und iPad holen die zentralen Daten jetzt auch, wenn du Obsidian aus dem Hintergrund zurückholst (letzter Versuch über
  30 Minuten her). Beim Start geht es nach spätestens gut 2 Minuten los statt nach bis zu 10.
- Ist das Gerät aus, das sonst abruft (zum Beispiel der PC im Ruhezustand), übernimmt ein anderes nach 80 Minuten statt nach
  3 Stunden.

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
