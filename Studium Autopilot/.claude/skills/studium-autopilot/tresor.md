# Karte des Tresors

## Ordner

| Ordner bzw. Datei | Was dort liegt | Wem es gehört |
|---|---|---|
| `Dashboard.md`, `Studium/*.md` | Übersichten (Woche, Fristen, Prüfungen, Noten & ECTS, Studienverlauf …), fast nur Codeblöcke | App: nie ändern |
| `Module/<Teil>/<Code> <Titel>.md` | eine Notiz je Modul (`typ: modul`); eigene Module unter `Module/5 Weitere Module/` | Katalogfelder und Text: App; persönliche Felder: Person |
| `Termine/` | Termine und Fristen (`typ: termin`): zentrale für alle, vom Server, aus ILIAS, eigene | je nach `herkunft` |
| `Stundenplan/` | Lehrveranstaltungen (`typ: lehrveranstaltung`), nur in diesem Ordner gezählt | je nach `herkunft` |
| `Vorlesungen/<Code>/` | Vorlesungsnotizen (`typ: vorlesung`) | Person |
| `Übungsblätter/` | Übungsblätter (`typ: übungsblatt`) | Person |
| `Unterlagen/<Code> <Modultitel>/` (ohne Modul: `Unterlagen/Ohne Modul/`) | Dateien (PDF …) und daneben je eine Begleitnotiz gleichen Namens (`typ: unterlage`) | Person; aus ILIAS mit `ilias_id` |
| `Unterlagen/_Volltext/` | Textfassungen der PDFs (`typ: volltext`) | App: nur lesen |
| `Karteikarten/` | Kartenstapel (`typ: karteikarten`), auch in Unterordnern | Person |
| `Lernplan/` | Lernpläne je Modul (`typ: lernplan`) | Person bzw. zentral |
| `Schlüsselqualifikationen/` | SQ-Kurse (`typ: sq_kurs`) | Person |
| `Eingang/` | abgelegte Dateien, die „Unterlagen einordnen“ verteilt | Person |
| `Anhänge/` | Bilder und Anhänge | Person |
| `System/` | Skripte, Gerüste, Daten, `Einstellungen.md` | App: nie ändern |

Das Plugin erkennt Notizen am Feld `typ`; `modul` zählt nur unter `Module/`, `lehrveranstaltung` nur unter `Stundenplan/`.

## Notizarten und Felder

**Termin** – `Termine/JJJJ-MM-TT <Titel>.md`
`typ: termin`, `titel`, `datum` (JJJJ-MM-TT), `bis` (leer oder Enddatum), `kategorie` (Semester | Vorlesungsfrei | Prüfung |
Frist | Einführung | Lehre | Fachschaft | Veranstaltung), `status` (offiziell | geschätzt), `uhrzeit` („10:00“ oder
„10:00–12:00“), `ort`, `modul` („[[<Code> <Titel>]]“), `code`, `erledigt` (true | false), `quelle`. Zentrale Termine haben
dazu `herkunft: zentral`, `zentral_id`, `info`, `geprueft`, `entfaellt`.

**Lehrveranstaltung** – `Stundenplan/<Mo> <10.15> <Code> <Art>.md`
`typ: lehrveranstaltung`, `titel` („<Code> · <Art>“), `code`, `modul`, `art` (Vorlesung, Übung, Tutorium …), `wochentag`
(1 = Montag … 5), `beginn`, `ende`, `raum`, `dozent`, `semester`, `von`, `bis`, `ausfall` (Liste von Daten), `aenderungen`;
eigene Notizen können `besuche_nicht: true` haben.

**Vorlesungsnotiz** – `Vorlesungen/<Code>/JJJJ-MM-TT <Code> VL NN.md`
`typ: vorlesung`, `datum`, `code`, `modul`, `nummer`, `thema`, `dozent`, `folien` („[[…]]“), `veranstaltung`,
`nachgearbeitet` (true | false). Abschnitte: `## Mitschrift`, `## Prüfungsrelevant`, `## Offene Fragen`, `## Nacharbeit`.

**Übungsblatt** – `Übungsblätter/<Code> Blatt NN.md`
`typ: übungsblatt`, `code`, `modul`, `nummer`, `faellig` (JJJJ-MM-TT), `status` (offen | abgegeben | korrigiert), `datei`,
`eigene_loesung`. Abschnitte: `## Aufgabe 1`, `## Aufgabe 2` …, `## Knackpunkte`, `## Fürs Tutorium`.

**Unterlage (Begleitnotiz)** – neben der Datei, gleicher Name: `<Code> <Art> <NN> <Titel>.md` (höchstens 80 Zeichen)
`typ: unterlage`, `code`, `modul`, `art` (Folien, Skript, Übung, Lösung, Eigene Lösung, Mitschrift, Altklausur, Literatur,
Scan, Sonstiges), `nummer`, `titel`, `datei` („[[x.pdf]]“), `seiten`, `semester`, `status` (neu | gelesen | bearbeitet),
`datum`, `quelle`, aus ILIAS `ilias_id`. Neu angelegt: nur der Titel und darunter der eingeklappte PDF-Kasten. Abschnitte kommen
dazu, sobald es etwas gibt, alle über dem PDF-Kasten: `## Das Wichtigste`, darunter auf Wunsch `## Zu tun`, dann
`## Offene Fragen`. Nie einen leeren Abschnitt oder leere Punkte (`- `, `- [ ] `) anlegen.

**Modul** – `Module/<Teil>/<Code> <Titel>.md`
Katalog (nicht ändern): `code`, `titel`, `ects`, `fachsemester`, `fs_empfohlen`, `pruefung`, `benotet`, `turnus`,
`verantwortlich` … Persönlich: `status` (offen | läuft | angemeldet | bestanden | nicht bestanden | anerkannt), `ergebnis`
(Note wie „2,3“), `versuch`, `klausur` (Datum der Prüfung), `semester_geplant`.

**SQ-Kurs** – `Schlüsselqualifikationen/SQ <Titel>.md`
`typ: sq_kurs`, `code`, `titel`, `anbieter`, `ects`, `semester`, `status` (geplant | angemeldet | zugelassen | bestanden), `nachweis`.

**Karteikarten** – `Karteikarten/<Code> Karteikarten.md`, `typ: karteikarten`, `code`; Gerüst `System/Gerüste/Karteikarten.md`.

**Lernplan** – `Lernplan/<Code> Lernplan.md`, `typ: lernplan`, `code`; Gerüst `System/Gerüste/Lernplan.md`.

**Textfassung einer PDF** – `Unterlagen/_Volltext/<PDF-Name> (Volltext).md`
`typ: volltext`, `volltext_von: plugin`, `quelle` (Pfad der PDF), `unterlage`, `seiten`, `ergebnis` (text | gekuerzt |
kein-text | geschuetzt | nicht-lesbar | zu-gross). Je Seite ein Kasten `> [!eba-quelle]- [[X.pdf#page=N|S. N]]` mit dem Text.

**Einstellungen** – `System/Einstellungen.md` (nur lesen): `name`, `studienbeginn`, `variante` (Economics | Business
Administration | ohne Spezialisierung | offen), `zielnote`, `po`, `semesterliste` (`FS|Name|Beginn|Ende|Vorlesungsbeginn|
Vorlesungsende`), `pausen` (`von|bis|Name`), `pruefungsphasen` (`von|bis|Art|Status`).

## Wem eine Notiz gehört

| `herkunft` | Id-Feld | Quelle |
|---|---|---|
| `zentral` | `zentral_id` | zentrale Daten für alle EcoBA-Studierenden |
| `claude` | `claude_id` | eigener Server mit Claude |
| `alma` | `alma_schluessel` | Alma-Stundenplan |
| `ilias-gruppe`, `gruppe-gewaehlt` | `ilias_gruppe`, `gruppe_id` | Übungsgruppen |
| `ilias-kalender` | `ilias_kalender_id` | Abgaben aus dem ILIAS-Kalender |
| (keine), `abgleich_id` | `abgleich_id` | eigener Uni-Abgleich |
| (keine), `volltext_von: plugin` | `quelle` | Textfassung einer PDF |

Ohne solche Felder gehört die Notiz der Person; keine Quelle fasst sie an. Eine Quelle schreibt ihre Notiz neu, wenn sich ihre
Daten ändern (Felder und Text über `## Meine Notizen`), und benennt sie bei neuem Datum um. Fällt ein Eintrag weg, kommt die
unberührte Notiz in den Papierkorb; mit Häkchen oder eigenem Text bekommt sie „(entfällt)“. Was die Person löscht, bleibt
gelöscht, bis sich der Eintrag ändert.

## Dateinamen

Wie Studium Autopilot sie bildet: keine Emojis, „: “ wird „ – “, die Zeichen `\ / : * ? " < > | # ^ [ ]` werden „-“, kein
Punkt oder Leerzeichen am Ende; gibt es den Namen schon, „Name 2“. Modulcodes: `[A-Z]{1,4}[0-9][0-9X]{2}[A-Z]?`, z. B. B110,
E101, SQ888.
