# Tests und automatische Prüfung

Zielgruppe: wer am Code mitarbeitet. Nutzer:innen brauchen nichts davon.

## Ohne Obsidian: `tests/`

```
node --test tests/*.test.js
```

Node 22 oder neuer, keine Abhängigkeiten, kein `npm install`. Getestet wird reine Logik direkt aus den Skripten des Tresors.
`tests/laden.js` lädt ein Skript aus `Studium Autopilot/System/Skripte/` mit einem kleinen Ersatz für Obsidian (nur das, was
beim Laden gebraucht wird).

| Datei | Prüft |
|---|---|
| `zentral.test.js` | id-Regel (Prüfwerte aus `docs/daten-v1.md`), Dateinamen der Termin-Notizen, Prüfung von Manifest, Terminen und Semesterdaten (gültige und ungültige Einträge, Säubern von Text, Grenzen), Schnappschuss der öffentlichen zentralen Daten mit SHA-256; Abruf mit Testquelle: Gruppen gerätelokal, ein Fehler in `gruppen.json` hält Termine nicht an, verworfene Gruppen und Termine stehen beide im Bericht; Angebote (`angebote.json`): Prüfung der Einträge, gerätelokal, Fehler halten Termine nicht an, fehlt die Datei im Manifest, wird der Stand gelöscht (nicht bei Pause); wer für alle schreibt (Abrufer, noch keiner, Abrufer seit 80 Min. still) |
| `modell.test.js` | Semestername aus dem Datum, Semesterliste aus Studienbeginn, Regel für Semester ohne Daten, Vorlesungswochen (WS 2026/27: 16, Weihnachtswoche zählt nicht), Wochenanzeige an typischen Tagen, abgeleitete Felder der Einstellungen; ein Schreiber: von selbst nur der Abrufer, ein Tipp auf dem Gerät sofort |
| `schwerpunkte.test.js` | Schwerpunkte im Studienverlauf (`schwerpunkte.js`): Regeln der PO für die Schwerpunktbereiche (genau 3, je 15–30 ECTS, Summe 75 bzw. 63 je Variante, mind. 2 VWL- bzw. BWL-Bereiche, Data Science zählt für beide), Profilmodule als Elective Studies nach Rolle oder „Zählt als“ (nie als Pflicht), nur Module im Plan, „Ohne Bereich“, sichtbar ab dem 2. Fachsemester oder mit Plan |
| `update.test.js` | Update-Knopf (`update.js`): Dateiklassen (was ein Update ersetzen darf, was nie), Prüfung der Update-Liste, Entscheidung je Datei (ersetzen, deine Fassung + „(neu X)“, Haken übernehmen, Modulfelder mischen, `.obsidian`-Einstellungen ergänzen, gelöscht bleibt gelöscht, weggefallene Seite unverändert in die Sicherung samt Lesezeichen, geändert bleibt sie), ganzer Ablauf mit Sicherung, alles oder nichts (falsche Prüfsumme, kein Netz, Schreibfehler → alter Stand), Kanal stabil/beta, Feld `release`/`beta` im Manifest; im veröffentlichten Repo die Update-Liste `system-dateien.json` gegen die Dateien |
| `changelog.test.js` | Regeln für `CHANGELOG.md` ab 0.4.1 (das Fenster **Was ist neu**, `CONTRIBUTING.md`): jeder Punkt beginnt mit **Neu:**, **Behoben:** …, höchstens 240 Zeichen und zwei Sätze, keine Fachwörter, keine Dateinamen, kein Code; höchstens 12 Punkte, Titel höchstens 6 Wörter |
| `update-neuigkeiten.test.js` | Neuigkeiten zum Update (`update.js`, seit 0.4.1): Abschnitte aus `CHANGELOG.md` (auch der echte), Auswahl von der installierten bis zur angebotenen Version, entschärftes Markdown, Hinweis höchstens alle 12 h je Version und nicht neben der sichtbaren Dashboard-Zeile, einmal „Aktualisiert auf …“ nach einem Update, frische Prüfung des Manifests erst nach 30 Min. |
| `ilias-netz.test.js` | Netz für ILIAS (`ilias-netz.js`): Keksdose (Pfad, Ablauf, Präfixe), Formulare lesen, Entitäten, Weiterleitungen byte-genau auflösen, Sitzung über beide Uni-Server (302/303/307/308, Schleifen, Höchstzahl), Sperre für fremde Server und http vor dem Senden, keine Kekse oder Formularwerte in Fehlern, Weg am PC und auf iPhone/iPad (`requestUrl` folgt selbst, Zeitgrenze für Seiten und Dateien); Attrappe statt Netz |
| `ilias-html.test.js` | ILIAS-Seiten lesen (`ilias-html.js`): Zerleger, Anmeldestatus und Seitenart, Meine Kurse (mit Beschreibung der Gruppen), Kurs-, Ordner-, Sitzungs- und Inhaltsseiten, Gruppen mit Mitgliedschaft und Brotkrumen, Übungen, Datum und Größe in ILIAS-Schreibweise, Dateinamen, Download-Adressen, Formulare der Anmeldung |
| `ilias-anmeldung.test.js` | Anmeldung über Shibboleth (`ilias-anmeldung.js`) mit nachgespielten Servern: Erfolg, falsches Passwort, Zustimmungsseite (nie selbst zustimmen), Zwei-Faktor, noch gültige Sitzung, Formular oder Weiterleitung zu fremdem Server, Netzfehler; das Passwort geht nur an die Anmeldeseite der Uni und kommt nirgends zurück |
| `ilias.test.js` | ILIAS-Unterlagen (`ilias.js`), ganzer Ablauf mit erfundenem ILIAS und Tresor im Speicher (`tests/ilias-attrappen.js`): Ablage mit Begleitnotiz, zweiter Lauf ohne Downloads, gleiche Dateien, geänderte Dateien (ersetzen bzw. „neue Fassung“), gelöscht bleibt gelöscht, Umbenennen, Videos und Dateien über 50 MB, nur ein Gerät lädt, eigener Uni-Abgleich, Kurswahl, Grenzen je Lauf, Fehler mitten im Lauf, Index mischen, eigener Uni-Abgleich (nie Downloads, mit Zugang nur Mitgliedschaften), Kennwort nirgends (Status, Protokoll, Fehler, Dateien) |
| `ilias-weiter.test.js` | ILIAS im Hintergrund (`ilias.js`): Fortschrittstexte ohne Kurstitel, Ereignisse eines Knopf-Laufs, offener Auftrag (nächster Stapel, Fehler mit 1/5/15 Min., nie nach abgelehnter Anmeldung, anderem Gerät, Trennen, Stoppen), Knopf während eines automatischen Laufs, Kurs mitten im Lauf abgewählt, toter Lauf verworfen, Funde (Fortsetzung nach dem Schließen und nächster Stapel ohne neues Durchsuchen, automatischer Lauf lädt den Rest, Trennen und verworfener Lauf) und Absturz beim Schreiben (neue und ersetzte Datei) |
| `leseansicht.test.js` | Übersichtsseiten nur in der Leseansicht (`start.js`, `nurLesen`): gesperrt sind Dashboard, Übersichten, Einstellungen und Daten, frei Termine & Anmeldungen, Module und eigene Notizen; das Feld `ansicht` (`lesen`/`bearbeiten`) geht vor; nur Markdown |
| `personalisieren.test.js` | Einstellungen & Hilfe (`personalisieren.js`): Zeilen „Deine Angaben“ leer und eingetragen (Wert, Fachsemester, Knopf mit Feld), Einrichtung offen, angefangen, fertig mit übersprungenen Schritten; „Variante“ je Variante eine Zeile mit Folge, die gewählte ohne Knopf, unbekannter Wert gilt als offen |
| `darstellung.test.js` | Darstellung (`darstellung.js`): Obsidians Wert als hell, dunkel oder automatisch (Unbekanntes wie bei Obsidian hell), Wahl des Geräts vor Obsidians Einstellung, Automatisch folgt dem Gerät, Umschalter mit drei Teilen ohne Untertexte; Wählen speichert nur auf dem Gerät (nie `appearance.json`), setzt die Klassen sofort und sichert das Farbschema; Durchsetzen nach Obsidians Umschalten ohne Schleife, ohne Wahl entscheidet Obsidian |
| `verbindungen.test.js` | Texte der Verbindungen (`verbindungen.js`): **fett** und Links (nur https), Alma-Schritte mit Links zu Alma und zum Stundenplan |
| `unterlagen.test.js` | Benennen (`unterlagen.js`) nach „`<Code> <Art> <NN> <Titel>`“: Art, Nummer, Modulcode und Titel aus Pfad und Dateiname, schwacher Titel, Titel aus der ersten PDF-Seite, Begleitnotiz |
| `alma.test.js` | Alma-Stundenplan (`alma.js`) mit Tresor im Speicher: eine von Hand angelegte Notiz, die Alma übernommen hat, verliert beim Wegfall nur die Alma-Felder, eine Alma-Notiz kommt in den Papierkorb; scheitert der erste Abruf nach dem Verbinden, gilt wieder der vorherige Link; zentrale Notizen und Notizen zu deiner Gruppe fasst Alma nie an; Kurztitel nie nach einem Füllwort abgeschnitten („Einführung in“), Modultitel zuerst, kaputte Titel repariert |
| `meine-gruppe.test.js` | Deine Übungsgruppe (`meine-gruppe.js`): Zeitfenster aus ILIAS-Text (Tag, Zeit, Raumnummer, nie Namen, ohne Wochentag nichts; Datum keine Uhrzeit, Klammern, mehrere Tage oder Zeiten → nichts), Name „Gruppe 4“, Zuordnung zu `gruppen.json` (nie über die Nummer, c.t./s.t., ±15 Min., Raum entscheidet, sonst mehrdeutig), Notiz fürs Wochenraster (ILIAS-Name, Nummer der Liste nur in `gruppe_alma`, `konflikt`, eigene Kopfzeilen bleiben), Abgleich (anlegen, weichen vor Alma mit Text, gewählte übernehmen, verlassen, „entfällt“, Schutz, Obsidian liest noch ein), „Meine Gruppe“ wählen, ändern, abwählen, gewählte Notiz weicht ILIAS oder Alma |
| `ilias-gruppen.test.js` | ILIAS (`ilias.js`): Kurspasswort im Titel (erfundene Schreibweisen samt Doppelgängern, Entitäten, weichem Trennzeichen; keine falschen Treffer) nie in Index, Kursliste, Begleitnotiz, Hinweisen oder gerätelokal; alte Index-Einträge, Begleitnotizen, Ordner und gemerkte Funde werden gesäubert, eine saubere Datei nicht neu geschrieben; Gruppen aus den Mitgliedschaften mit erfundenem ILIAS: Code aus Kurs bzw. Brotkrumen (eine Seite, danach gemerkt), Brotkrumen ohne Kurs erst nach einer Woche neu, Notiz je eindeutiger Gruppe mit ILIAS-Namen, mehrdeutig ohne Notiz, keine Namen, Doppel und gewählte Notizen weichen, Überschneidung (`konflikt`), Verlassen erst beim zweiten Lauf, leere Liste und Massenwegfall entfernen nichts, ohne Gruppenliste keine Änderung |
| `fsrs.test.js` | Planung (`fsrs.js`): Vergessenskurve, Startwerte und Wiederholung von Hand nachgerechnet, Lernschritte wie Anki (1 Min., 5,5 Min., 10 Min., Abschluss), ein und kein Lernschritt, Schwer < Gut < Einfach, Neu-Lernen nach einem Fehler, reproduzierbare Streuung, Behaltensquote, Lernschritte als Text |
| `karten.test.js` | Karteikarten (`karten.js`): alle Kartenformen und was nicht zählt, Trenner, vorläufige Schlüssel, Seiten und Lückentext, Kennungen einfügen (fehlend, doppelt, fremd), Text für „Neue Karte“, Lerngeschichte lesen und nachspielen (aussetzen, zurücksetzen, schwierige Karten), Tageslimits je Modul mit Geschwistern und „mehr neue“, Lernrunde (gemischt, Lernschritte, Rückgängig, Ende), Statistik, Optionen, Lerntag ab 4 Uhr |
| `leer.test.js` | Wann eine Vorlesungs- oder Übungsblatt-Notiz leer ist (`istLeer`): frisches Gerüst der Vorlage (auch „-“ ohne Leerzeichen), eigener Text, Beschriftungen und Callouts |
| `musterplan.test.js` | Musterpläne (`musterplan.js`): Hinweise (`hinweiseOrdnen`) gemeinsame einmal, danach je Variante in Planreihenfolge, leere und nicht gezeigte Varianten fallen weg, bei einem Plan eine Liste; gemeinsamer Stamm (`stamm`): bis zu welchem Fachsemester alle Pläne gleich sind, Unterschiede in ECTS, Code, Reihenfolge oder OP beenden ihn, ein Plan oder leere Daten haben keinen |
| `termine.test.js` | Agenda (`termine.js`, `erzeugen`): Tagesspalte mit Ziffer und Wochentag nur beim ersten Termin eines Tags, Art als Klasse für den Farbpunkt, Text-Pillen nur für Frist, Prüfung, freiwillig, geschätzt, erledigt; „Diese Woche“ mit Laufendem unter „läuft“, Marke „Heute“ und Terminen ab heute, „Nächste Woche“ als Karte mit Zeitraum, „Fristen danach“ (höchstens vier, mit Monat, „in n Tagen“), „Später“ nach Monaten, „Vergangen“ mit Monat; kein Markdown-Fett im HTML. Anmeldungen (`anmeldungen`): nur zentrale Fristen mit Anmeldung, Belegung oder Buchung im Titel, Filter wie die zentralen Termine (echter `filterBauen`), nur fürs Studium (Modul, Schlüsselqualifikation, TCP, Gruppen, Prüfungsanmeldung), der Schalter „Fachschaft & Veranstaltungen“ ändert nichts, bis Semesterende, Vorbeigegangenes 7 Tage und unten, Wann und Wo aus `ort` (ab, bis, Uhrzeiten; Datum ist keine Uhrzeit), „angemeldet · Gruppe 4“ aus Gruppen-Notizen (ILIAS oder gewählt, Semester, Art, nie `gruppe_alma`), Pillen freiwillig und geschätzt |
| `angebote.test.js` | Angebote der Uni (`angebote.js`, Codeblock `eba-angebote`): 14-Tage-Fenster und „Mehr anzeigen“, Vergangenes fällt weg, Gruppieren und Sortieren je Tag, Filter nach Art (Anzahl am Chip bleibt), Auswahl (Vorgabe, Einstellungen ohne die neuen Felder, Schalter „Fachschaft & Veranstaltungen“ hin und zurück, Vortragsreihen am Namen erkannt, unbekannte zunächst aus, gewählte Reihe bleibt beim Speichern), Buchungsbeginn beim Hochschulsport als eigene Zeile, Texte einer Zeile (Uhrzeit, Ort, online, Anmeldung) |
| `wochenraster.test.js` | Wochenraster (`woche.js`, Codeblock `eba-woche`): aktuelle Woche (am Wochenende schon die nächste), Kalenderwoche, Versatz nur aus dem Gerätespeicher (gleiche Sitzung, höchstens 30 Minuten; ein Wechsel schreibt keine Datei), Kästen nur zwischen `von` und `bis`, Ausgeblendetes/Entfallenes/anderes Semester fehlt, Kurzname, Art und Gruppe aus `gruppe`, c.t., Überschneidungen nebeneinander und `konflikt`, Änderungen an neuer Zeit, Ausfall und Pause, leere Wochen, heute/jetzt, Wischen (nicht vom Rand, Richtung nach 10 px, mehr als 50 px), beide Seiten mit dem Codeblock |

`tests/daten/v1/` ist ein Schnappschuss der öffentlichen zentralen Daten
(`https://studium-autopilot.github.io/ecoba-daten/v1/`). Ändert sich das Datenformat, wird er neu geholt.

`tests/daten/ilias-netz/` enthält öffentliche Anmeldeseiten von ILIAS und der Uni ohne Sitzungsdaten und eine nachgebaute
SAML-Antwort, `tests/daten/ilias-seiten/` erfundene ILIAS-Seiten mit dem Aufbau echter Seiten (Kurse, Ordner, Sitzungen,
Übungen). Darin stehen keine echten Namen und keine persönlichen Daten. Tests gegen das echte ILIAS mit einem echten
Uni-Konto sind privat und nicht im Repo.

Mit `ECOBA_LIVE=1` prüft ein zusätzlicher Test die **aktuellen** Daten von GitHub Pages (Prüfsummen, alle Einträge gültig).
In GitHub Actions läuft er als eigener Schritt, der den Lauf nicht rot macht.

## In Obsidian

Oberfläche, Knöpfe, Hot-Reload, der Datenkanal mit einer Testquelle, das Update mit einem lokalen Fake-Release (gültig und mit
falscher Prüfsumme, Neuladen des Plugins), der Schlüsselbund, der Netzweg von ILIAS auf iPhone/iPad (`requestUrl`) und die
Bases-Formeln lassen sich nur in Obsidian testen.
Diese Tests laufen auf dem Entwickler-PC über die Obsidian-Kommandozeile und sind nicht im Repo. Die Testeinstiege (z. B.
`plugin.testDatum`, `plugin.testQuelle`) beschreibt `docs/architektur.md` im Abschnitt „Tests“. Vor einem Release gehört dazu
ein Durchgang auf iPhone, iPad, Android, Windows und Mac, jeweils hell und dunkel.

## GitHub Actions: `.github/workflows/pruefen.yml`

Bei jedem Push und Pull Request:

1. **`python werkzeuge/pruefen.py .`** – Datenschutz- und Qualitätsprüfung, nur Python-Standardbibliothek:
   - keine privaten Ordner, keine gerätelokalen Obsidian-Dateien (Arbeitsbereich, Papierkorb, Plugin-Einstellungen), nur das
     Plugin `studium-autopilot`;
   - keine PDF-, Office-, Anki-, Archiv- oder Mediendateien; Bilder nur in `docs/bilder/`; höchstens 2 MB je Datei;
   - keine persönlichen Pfade, Server-Hinweise, IP-Adressen, E-Mail-Adressen (außer Funktionsadressen der Uni und
     GitHub-noreply), Telefonnummern, geteilten Lehrmaterial-Links, Zugangsdaten, Token oder Sync-Konfiguration; der Name
     des Autors nur in den Autorenangaben;
   - die Vorlage ist leer: keine Noten, Versuche, eigenen Termine oder Notizen;
   - Syntax aller Skripte mit `node --check` und die iOS-Regeln (kein Regex-Lookbehind, kein `.at()`, `findLast`,
     `structuredClone`, keine Node-Module; einzige Ausnahme: `http`, `https` und `zlib` in `ilias-netz.js`, nur am PC
     hinter `Platform.isDesktopApp`).
2. **`node --test tests/*.test.js`**
3. **Safari 16** (iPhone/iPad mit iOS 16): esbuild gibt jedes Skript einmal mit Ziel `safari16` und einmal mit Ziel `esnext`
   aus. Sind die Ausgaben gleich, musste nichts umgeschrieben werden, das Skript läuft also auf Safari 16. Ein Selbsttest
   stellt sicher, dass die Methode Syntax erkennt, die erst Safari 16.4 kann. Unicode-Eigenschaften in Regex (`\p{L}`)
   gelten als unterstützt (Safari kann sie seit 11.1; esbuild stuft sie nur wegen neuerer Unicode-Tabellen strenger ein).

Lokal: `python werkzeuge/pruefen.py .` läuft auch ohne Node (dann ohne `node --check`, mit Hinweis).
