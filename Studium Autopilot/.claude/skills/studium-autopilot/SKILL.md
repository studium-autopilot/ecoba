---
name: studium-autopilot
description: Liest und schreibt im Obsidian-Tresor „Studium Autopilot“ (B.Sc. EcoBA, Uni Tübingen) nach dessen Regeln – Termine, Fristen, Prüfungen, Module, Unterlagen und PDFs, To-dos, Vorlesungsnotizen, Karteikarten. Verwenden für Fragen wie „Was steht diese Woche an?“, „Fass die Folien zusammen“, „Mach eine Lesefassung der Folien“, „Leg einen Termin an“, „Mach Karteikarten zu Kapitel 3“ oder „Das ist kaputt, melde das“, sobald Claude im Tresor-Ordner arbeitet.
---

# Studium Autopilot: Daten aus und in Obsidian

Du arbeitest im Tresor einer Studentin oder eines Studenten. Das Plugin Studium Autopilot liest die Notizen selbst: Was du
richtig anlegst, erscheint von selbst auf dem Dashboard, im Stundenplan, unter Prüfungen und bei den Fristen. Es gibt keine
Schnittstelle dazwischen; du liest und schreibst die Markdown-Dateien direkt. Obsidian merkt Änderungen sofort.

## Teile

| Teil | Wann | Datei |
|---|---|---|
| Karte: Ordner, Notizarten, Felder, Namen | immer zuerst | [tresor.md](tresor.md) |
| Daten aus Obsidian holen | Fragen nach Terminen, Prüfungen, Noten, Unterlagen, To-dos | [lesen.md](lesen.md) |
| Daten in Obsidian schreiben | neue Notizen, Zusammenfassungen, To-dos, Karteikarten | [schreiben.md](schreiben.md) |
| Lesefassung von Folien | „Mach eine Lesefassung“, „Die Folien als Text“ | [lesefassung.md](lesefassung.md) |
| Fehler an den Autor melden | etwas geht nicht, ein zentraler Termin stimmt nicht, eine Idee | [fehler-melden.md](fehler-melden.md) |

## Grundregeln

- **Nur lesen, was du brauchst.** Der Tresor ist privat. Zitiere nichts daraus nach außen, schicke nichts weg und lade
  nichts hoch, außer die Person bittet ausdrücklich darum.
- **Nie ändern:** `System/` (Skripte, Gerüste, Daten, Einstellungen), `Dashboard.md`, `Studium/`, `Unterlagen/_Volltext/`,
  `.obsidian/`. Das sind Teile der App; eine neue Version ersetzt sie ohnehin.
- **Fremde Notizen:** Hat eine Notiz `herkunft` (z. B. `zentral`, `claude`, `alma`, `ilias-kalender`), schreibt die Quelle sie
  neu, sobald sich ihre Daten ändern. Du änderst dort nur `erledigt` und den Text unter `## Meine Notizen`.
- **Nichts löschen, verschieben oder umbenennen.** Obsidian passt Links nur an, wenn das in Obsidian passiert, und gelöschte
  Notizen einer Quelle kämen sonst zurück oder fehlten für immer. Bitte die Person, es in Obsidian zu tun (dort mit
  Rückgängig).
- **Erst lesen, dann schreiben.** Bevor du etwas anlegst, prüfst du, ob es das schon gibt (gleicher Termin, gleiche Unterlage,
  gleiches To-do). Lieber eine vorhandene Notiz ergänzen als eine zweite anlegen.
- **Nichts erfinden.** Daten, Räume und Fristen nur aus Notizen, PDFs oder dem, was die Person sagt. Unsicheres sagst du dazu.
- **Wörter wie in der App:** Tresor, Lehrveranstaltung, Prüfung (Klausur nur als Form), ECTS, Übungsgruppe, Aktualisieren,
  vorlesungsfrei, „## Meine Notizen“. Daten in Notizen und Feldern als `JJJJ-MM-TT`, im Text „Mo 19.10.“, Uhrzeiten „10:00–12:00“.

## Eigener Server mit Claude

Ist ein eigener Server verbunden (Zeile „Eigener Server“ unter **Einstellungen & Hilfe** → **Verbindungen**), holt Obsidian
dessen Ergebnisse selbst ab: Termine aus Uni-Mails und Gmail erscheinen als Notizen unter `Termine/` mit `herkunft: claude`,
Hinweise im Fenster „Eigener Server“. Diese Termine legst du nicht noch einmal an; für sie gilt dasselbe wie für jede Notiz mit
`herkunft`. Was du selbst anlegst, sieht der Server beim nächsten Abruf (Titel, Datum, offene To-dos) und liefert es nicht
doppelt. Zusammenfassungen von Folien und Skripten kommen von dort in die Notiz neben der PDF, solange „Das Wichtigste“ leer
ist; schreibst du selbst eine, schickt Obsidian die Unterlage nicht mehr hin. Beginnt ein Hinweis des Servers mit
„Zentraler Termin wohl falsch:“, bietest du an, ihn nach `fehler-melden.md` mit der Vorlage `termin.yml` zu melden.
