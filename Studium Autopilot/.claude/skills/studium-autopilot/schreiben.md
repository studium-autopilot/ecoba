# Daten in Obsidian schreiben

Eine neue Notiz legst du als ganze Datei an: Frontmatter, Überschrift und Abschnitte wie unten, mit Inhalt. Das Plugin erkennt
sie am `typ` und zeigt sie sofort an. Eine leere Notiz in `Vorlesungen/` oder `Übungsblätter/` füllt das Plugin selbst, und
eine Notiz, die nur das Gerüst enthält, räumt es beim Verlassen weg: Schreib darum nie leere oder halbe Notizen.

## Vorher

1. Gibt es das schon? Termine: gleiches `datum` (±1 Tag) und gleicher Anlass, auch in einer Notiz mit `herkunft`.
   Unterlagen: Begleitnotiz neben der Datei. To-dos: gleiche Aufgabe im selben Modul. Wenn ja: die vorhandene Notiz ergänzen
   (bei fremden nur unter `## Meine Notizen`) statt eine zweite anzulegen.
2. Modul bestimmen: `code` und `modul: "[[<Code> <Titel>]]"` mit dem genauen Namen der Modulnotiz unter `Module/`.
3. Dateiname nach den Regeln in [tresor.md](tresor.md), „Dateinamen“; den Ordner gibt die Notizart vor.

## Termin oder Frist

`Termine/JJJJ-MM-TT <Titel>.md`:

```markdown
---
typ: termin
titel: "B110 Anmeldung zum Tutorium"
datum: 2026-10-27
bis:
kategorie: Frist
status: offiziell
uhrzeit: "10:00"
ort: "ILIAS"
modul: "[[B110 Einführung in die Betriebswirtschaftslehre]]"
code: "B110"
erledigt: false
quelle: "Mail des Lehrstuhls, 17.10.2026"
uebersicht: "[[Prüfungen]]"
cssclasses:
  - eba-s-termin
tags:
  - termin
---

# B110 Anmeldung zum Tutorium

## Meine Notizen
- Anmeldung nur über ILIAS, Plätze begrenzt.
```

- `kategorie`: Prüfung, Frist (jede Anmeldung, Abgabe, Bewerbung), Lehre, Einführung, Veranstaltung, Fachschaft, Semester,
  Vorlesungsfrei. Ohne sicheres Datum: `status: geschätzt` und unter `## Meine Notizen`, woraus du es ableitest.
- Keine `herkunft` und keine Id-Felder: Die Notiz gehört der Person.

## Zusammenfassung einer Unterlage

In die vorhandene Begleitnotiz neben der Datei (`typ: unterlage`), nie in die Textfassung. Fehlt ein Abschnitt, legst du ihn über
dem PDF-Kasten an; leere Abschnitte und leere Punkte (`- `, `- [ ] `) gibt es nicht:

- `## Das Wichtigste`: 5 bis 10 Punkte `- `, eigene Worte, je Punkt die Seite als Link `[[X.pdf#page=N|S. N]]`. Begriffe
  fett mit kurzer Erklärung.
- `## Zu tun` (nur wenn es etwas gibt): `- [ ] Aufgabe (bis TT.MM.)`, direkt unter „Das Wichtigste“. Nur was man einmal
  erledigt und dann abhakt; ein Dauerhinweis („Folien in jede Vorlesung mitnehmen“) ist ein Punkt „Organisation“.
- `## Offene Fragen` (nur wenn es eine gibt): `- [ ] Frage?`, was zum Verstehen fehlt oder die Unterlage offen lässt. Nicht
  die Fragen, die die Unterlage ihren Lesern stellt (Denk-, Diskussions-, Quiz- und Übungsfragen).
- Was die Person schon geschrieben hat, bleibt; du ergänzt darunter. Danach `status: bearbeitet` nur, wenn sie es möchte.
- Nichts wörtlich abschreiben außer Formeln und Bezeichnungen.

## To-do

Eine Zeile `- [ ] Text (bis TT.MM.)` in die passende Notiz: Begleitnotiz unter `## Zu tun`, Vorlesungsnotiz unter
`## Nacharbeit`, Übungsblatt unter der Aufgabe, sonst eine eigene Notiz der Person. Nie in `System/`, `Module/`, `Studium/`,
`Lernplan/` oder ins Dashboard, dort zählt es nicht. Abhaken: `- [ ]` → `- [x]` genau in dieser Zeile.

## Vorlesungsnotiz

`Vorlesungen/<Code>/JJJJ-MM-TT <Code> VL NN.md` mit `typ: vorlesung`, `datum` (Tag der Vorlesung), `code`, `modul`, `nummer`,
`thema`, `dozent`, `folien: ""`, `veranstaltung`, `nachgearbeitet: false`, `tags: [vorlesung]`,
`cssclasses: [eba-s-notizen, eba-s-vorlesung]`; Überschrift `# Vorlesung 3 · Mo 19.10. · <Thema>`, dann der Block
`eba-vorlesung` (Kopf, schreibt das Plugin) und die Abschnitte `## Mitschrift`, `## Prüfungsrelevant`, `## Offene Fragen`,
`## Nacharbeit` mit Inhalt. Die Abschnitte nicht umbenennen. `folien` bleibt leer: Die Folien dieser Vorlesung sucht Studium
Autopilot selbst heraus, auch später hochgeladene. Nur wenn die Person bestimmte Folien will, `folien: "[[<Name>.pdf]]"`.

## Karteikarten

In `Karteikarten/<Code> Karteikarten.md` (Gerüst `System/Gerüste/Karteikarten.md`), Blöcke durch eine Leerzeile getrennt:

- `Frage :: Antwort` (eine Karte), `Begriff ::: Erklärung` (zwei Karten, beide Richtungen)
- mehrzeilig: Frage, eine Zeile `?`, Antwort
- Lücke: `{{c1::Text::Hinweis}}`
- Überschriften `##` ordnen nach Kapiteln.

Keine Kennungen `^k…` ausdenken (das Plugin setzt sie), vorhandene nie ändern oder doppeln. Lernstände liegen in
`System/Daten/Karteikarten/`; dort schreibst du nie.

## Was du nicht schreibst

- Nichts in `System/`, `Dashboard.md`, `Studium/`, `Unterlagen/_Volltext/`, `.obsidian/`.
- In Notizen mit `herkunft` nur `erledigt` und den Text unter `## Meine Notizen`; alles darüber schreibt die Quelle neu.
- In Modulnotizen nur die persönlichen Felder (`status`, `ergebnis`, `versuch`, `klausur`, `semester_geplant`), wenn die
  Person es sagt; Noten nie raten.
- Keine Namen anderer Personen, Matrikelnummern oder Passwörter aus Mails oder Dokumenten in Notizen übernehmen.
