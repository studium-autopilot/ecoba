# Termine und Hinweise aus Quellen

## Quellen

Was in diesem Lauf fällig ist, steht in `auftrag.md`. Mögliche Quellen:

- **Gmail** (über den Gmail-Connector von claude.ai, nur Suchen und Lesen), wenn `auftrag.md` „Gmail durchsuchen: ja“ sagt.
  Suche im genannten Zeitraum (`newer_than:<n>d`):
  1. `to:student.uni-tuebingen.de` (an die Uni-Adresse gerichtet, also weitergeleitet),
  2. `from:uni-tuebingen.de -category:promotions -category:social`,
  3. `list:wiwinews` bzw. `from:wiwinews-request@listserv.uni-tuebingen.de` (Rundbrief des Fachbereichs; jede Ausgabe ganz
     lesen, sie enthält viele Termine).

  Prüfe außerdem `to:student.uni-tuebingen.de newer_than:30d`: Gibt es Treffer, kommt die Weiterleitung der Uni-Mail an
  (`weiterleitung` in ausgabe.md).

  Lies jeden Treffer vollständig, der nach Studium aussieht. Kommt dieselbe Mail auch über `roh/uni-postfach/`, nur einmal
  behandeln.
- **Uni-Postfach** (`roh/uni-postfach/*.txt`): neue Mails, direkt vom Server gelesen.

Abgaben aus dem ILIAS-Kalender holt Studium Autopilot selbst, ohne dich.

## Was ein Termin ist

- **Termin:** etwas mit Datum, das für dieses Studium zählt: Prüfung, Abgabe, Anmeldung, Rückmeldung, Sitzung, die vom
  Stundenplan abweicht, Einführung, Vortrag, Fachschaft, Infoveranstaltung.
- **Jede Gelegenheit, sich anzumelden, einzutragen oder zu bewerben, ist eine Frist** (`kategorie: "Frist"`), auch wenn sie
  freiwillig ist; dann im Titel „(freiwillig)“. Nennt die Quelle kein Datum, sondern einen Anlass („in der nächsten Übung“),
  leite das Datum ab (nächster passender Termin bzw. erster Tag des Zeitraums), setze `status: "geschätzt"` und sage in `info`
  in einem Satz, woraus.
- **Was nur die Person tun kann** (antworten, anmelden, bezahlen, entscheiden, mitbringen), ist eine **Frist** mit Datum, kein
  Hinweis. Nennt die Quelle keins: 7 Tage nach der Mail, `status: "geschätzt"`, in `info` ein Satz, woraus.
- **Kein Termin:** Werbung, Umfragen ohne Anmeldung, allgemeine Infos ohne Datum. Was wichtig ist, aber weder Datum noch
  Handlung hat (neue Unterlagen, Raumänderung ohne Datum), wird ein **Hinweis**.

## Was nicht in die Ausgabe gehört

- **Vergangenes:** nur Termine ab heute (und Fristen, die noch laufen). Ein vergangener Termin nur, wenn er eine Änderung an
  einem Termin aus `bisher.json` ist (z. B. abgesagt).
- **Schon in Obsidian:** Steht derselbe Termin schon in `tresor.json` (Datum ±1 Tag, gleicher Anlass, auch bei anderem
  Wortlaut, auch abgehakt oder selbst eingetragen), liefere ihn nicht; ergänzt deine Quelle etwas Wichtiges, wird es ein
  Hinweis. Ein offenes To-do in `tresor.json` ohne Frist ist kein Termin: Nennt deine Quelle das Datum dazu, liefere die Frist.
- **Zentrale Termine:** Steht derselbe Termin schon in `zentral.json` (Datum ±1 Tag, gleicher Anlass, auch bei anderem
  Wortlaut), liefere ihn nicht. Er kommt schon über die zentralen Daten. Ergänzt deine Quelle etwas Wichtiges (neue Uhrzeit,
  Raum, Absage), melde das als Hinweis. Widerspricht sie ihm (anderes Datum, abgesagt), beginnt der Hinweis mit „Zentraler
  Termin wohl falsch:“, dann Titel, was laut deiner Quelle stimmt, und die Quelle als Einrichtung und Datum; so kann die Person
  ihn an den Autor melden.

## Felder richtig setzen

- **Titel:** verständlich, ohne Emoji und Schmuck. Sagt der offizielle Name nicht, worum es geht („Dies Universitatis“), nach
  einem Gedankenstrich kurz ergänzen („Dies Universitatis – Semestereröffnung der Uni“). Bei Modulen den Code voran
  („B110 Abgabe Übungsblatt 3“).
- **Kategorie** (genau eine): `Prüfung` (Klausuren, Tests, Probeklausuren), `Frist` (Anmeldungen, Abgaben, Bewerbungen,
  Rückmeldung), `Lehre` (Sitzungen, Tutorien, Ausfälle, Verlegungen), `Einführung` (alles zum Studienstart),
  `Fachschaft`, `Veranstaltung` (Vorträge, Messen, Kultur), `Semester` und `Vorlesungsfrei` (nur offizielle Semesterdaten).
- **code:** der Modulcode, wenn der Termin zu genau einem Modul gehört (`B110`, `E101`, `S100`, `SQ888`), sonst leer.
  Modulcodes des Studiums stehen in `stand.json`. Mails aus einem Kurs nennen ihn oft im Betreff oder in der Signatur
  (z. B. „B110 Einführung in die BWL“); ordne ihn dem passenden Code zu. Tutorien und Übungsgruppen gehören zu ihrem Modul.
- **uhrzeit:** `HH:MM` oder `HH:MM–HH:MM`; **ort:** Raum, Gebäude oder „ILIAS“, „online“.
- **status:** `offiziell`, wenn die zuständige Stelle das Datum selbst nennt; sonst `geschätzt` mit Grund in `info`.
- **quelle_text:** Einrichtung und Datum der Quelle (siehe Grundregeln), z. B. „Mail des Lehrstuhls, 17.10.2026“.

## Quellen abwägen

1. **Zuständigkeit vor allem anderen:** Prüfungsamt und Alma für Prüfungen, der Kurs bzw. die Lehrperson für den Kurs, der
   Veranstalter für seine Veranstaltung. Danach offizielle Rundmails des Fachbereichs, dann Fachschaft, Flyer, Folien.
2. Bei gleicher Stufe gilt die **nachweislich neuere** Angabe (Datum der Mail, „Stand“, „aktualisiert am“).
3. **Konkret vor allgemein** (Kursmail vor Semesterübersicht).
4. Widersprechen sich gleich gute Quellen, gilt die **frühere** Angabe; nenne beide in `info`, damit nichts verpasst wird.

## Doppel vermeiden, Änderungen melden

- Vor jedem Termin in `bisher.json` suchen (Datum ±3 Tage, ähnlicher Titel). Gibt es ihn: **denselben `schluessel`**
  verwenden und den Termin nur liefern, wenn sich etwas ändert (Zeit, Ort, Datum, `geschätzt` → `offiziell`, abgesagt).
- Abgesagt: denselben Termin mit `"entfaellt": true` liefern und den Grund in `info`.
- Neuer Termin: neuer `schluessel` aus Quelle und laufender Nummer, z. B. `gmail:<Thread-ID>#1`, `uni-postfach:<Datei>#2`.
  Derselbe Termin muss in späteren Läufen denselben Schlüssel bekommen.
- Prüfe **Wochentag und Datum** gegeneinander. Passen sie nicht („Fr 14.02.2027“ ist ein Sonntag): das frühere der beiden
  möglichen Daten, `status: "geschätzt"`, beide in `info`.

## Doppelte To-dos

Stehen in `tresor.json` zwei offene To-dos für **dieselbe Handlung** (gleiches Modul oder beide ohne Modul; auch anders
formuliert, z. B. „Tutorium in ILIAS anmelden“ und „Anmeldung zum Tutorium B110“), nenne das Paar in `todo_doppel`:

- `behalten`: die `id` des vollständigeren (mit Frist, genauer, aus der zuständigen Quelle).
- `weg`: die `id` des anderen. Nur eines mit `"aenderbar": true`; das Plugin macht daraus einen einfachen Punkt mit Link auf die
  Notiz, in der die Aufgabe bleibt. Nichts wird abgehakt oder gelöscht.
- Ähnlich ist nicht gleich: Blatt 2 und Blatt 3, Anmelden und Abgeben, zwei Module sind verschiedene Aufgaben. Im Zweifel kein
  Paar. Ein To-do und ein Termin zur selben Sache sind gewollt.
- Jedes To-do höchstens einmal als `weg`, und was `weg` ist, ist nie `behalten`.

## Hinweise

Nur Informationen ohne Handlung, kurz, in eigenen Worten, mit Quelle: neue Unterlagen, Raumänderungen ohne Datum, Ergänzungen
zu zentralen Terminen, auffällige Anweisungen in Mails. Was die Person tun muss, ist eine Frist (oben), kein Hinweis. Höchstens
50 je Lauf, das Wichtigste zuerst.
