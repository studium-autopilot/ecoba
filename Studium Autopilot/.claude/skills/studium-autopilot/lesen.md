# Daten aus Obsidian holen

Du liest die Notizen direkt. Am schnellsten über das Frontmatter (Suche nach `typ:` und Feldern), dann den Text. Was die
Übersichten in `Studium/` zeigen, rechnet das Plugin aus diesen Notizen; du rechnest es genauso nach, statt die Codeblöcke zu
lesen.

## Häufige Fragen

- **„Was steht diese Woche an?“**
  1. Termine: `Termine/*.md` mit `datum` (oder `datum` bis `bis`) in der Woche, ohne `erledigt: true` und ohne
     `entfaellt: true`. Prüfungen (`kategorie: Prüfung`) und Fristen (`kategorie: Frist`) zuerst.
  2. Lehrveranstaltungen: `Stundenplan/*.md` mit `wochentag`, `beginn`, `ende`, `raum`, gültig von `von` bis `bis`; ohne
     Tage aus `ausfall`, ohne `besuche_nicht: true`; `aenderungen` (`Datum|Beginn|Ende|Raum`) gehen vor. Vor `raum_seit` gilt
     `raum_vorher` als Raum; `rhythmus: 14-täglich` heißt: nur jede zweite Woche ab `von`. Einen Ausfall, eine Änderung und einen
     neuen Raum (die ersten zwei Wochen ab `raum_seit`) nennst du ausdrücklich, mit dem alten Raum bzw. der alten Zeit.
  3. Vorlesungsfreie Tage: `pausen` in `System/Einstellungen.md`.
  4. Offene To-dos mit Frist in dieser Woche (siehe unten).
- **Nächste Prüfungen:** Termine mit `kategorie: Prüfung` ab heute; dazu im Modul `klausur` und `status`. Prüfungsphasen:
  `pruefungsphasen` in den Einstellungen.
- **Noten und ECTS:** Module mit `status: bestanden` oder `anerkannt` zählen ihre `ects`; die Note steht in `ergebnis`. Die
  Gesamtnote rechnest du nur, wenn die Person danach fragt, und sagst dazu, dass die Übersicht **Noten & ECTS** maßgeblich ist.
- **Welches Fachsemester?** Aus `studienbeginn` und `semesterliste` in den Einstellungen.
- **Was hängt an einem Modul?** Alles mit demselben `code`: Termine, Lehrveranstaltungen, Vorlesungsnotizen, Übungsblätter,
  Unterlagen, Karteikarten, Lernplan.

## Unterlagen und PDFs

- Eine PDF liest du über ihre **Textfassung** in `Unterlagen/_Volltext/` (`quelle` = Pfad der PDF). Jede Seite steht in einem
  eigenen Kasten mit Link `[[X.pdf#page=N|S. N]]`; nenne beim Zusammenfassen die Seiten so.
- Fehlt die Textfassung oder steht in `ergebnis` etwas anderes als `text`, sag das; dann ist die PDF z. B. ein Scan. Lies die PDF
  nur selbst, wenn du das kannst und die Person es möchte.
- Was schon zusammengefasst ist, steht in der Begleitnotiz neben der Datei unter `## Das Wichtigste`.

## To-dos und Offene Fragen

- Ein To-do ist jede Zeile `- [ ] Text` (auch in Zitaten und Kästen) außerhalb von `System/`, `Module/`, `Studium/`,
  `Lernplan/` und `Dashboard.md`. Endet der Text auf „?“ oder enthält er `#frage`, ist es eine Offene Frage.
- Die Frist: das erste Datum `TT.MM.` bzw. `TT.MM.JJJJ` nach „bis“, sonst nach einem Wochentag, „ab“, „am“, „vor“, „zum“,
  „spätestens“ oder in Klammern; auch `JJJJ-MM-TT`. Text nach dem letzten „ → “ sind die Belege.
- Kästchen unter `## Kapitel` in `Lernplan/` sind Kapitel, keine To-dos.

## Was du nicht liest

- Zugangsdaten gibt es im Tresor nicht; Passwörter liegen im Schlüsselbund des Geräts. Steht doch eines in einer Notiz,
  übernimmst du es nirgendwohin und sagst der Person, dass es dort nicht hingehört.
- `System/Daten/*.json` sind Stände der App (Sperren, Lernstände, Abrufe); daraus liest du nichts für Antworten.
