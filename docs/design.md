# Designsprache „Ruhig“

Zielgruppe: wer Seiten, Karten, Fenster oder CSS ändert. Stand 18.10.2026.

Alle Bildschirme sollen aussehen, als wären sie zusammen entstanden. Neue und geänderte Teile folgen diesen Regeln; ältere
Stellen werden Schritt für Schritt angeglichen. Wo etwas noch nicht umgesetzt ist, steht **(geplant)**.

Dateien: `Studium Autopilot/.obsidian/snippets/eba-core.css` (Form und Bausteine, Abschnitte mit Nummern),
`eba-paper-elfenbein.css` (Farben hell und dunkel), `eba-flieder.css` und `eba-klar.css` (Form und Schrift hell und dunkel,
Farben nur hell; dunkel gelten die dunklen Farben von Elfenbein, bis beide eigene haben). Wie die Designs gewählt
werden: [architektur.md](architektur.md), „Darstellung“. Regeln für Skripte und iPhone: dort, „Regeln für Skript-Autoren“.

## Grundsätze

1. **Ein Blick reicht.** Eine Seite zeigt zuerst, was heute zählt. Alles andere ist eingeklappt oder steht weiter unten.
2. **Jede Angabe an einer Stelle.** Andere Seiten verweisen mit einer Zeile „Thema → Seite“ (siehe architektur.md, „Keine
   Dopplungen“).
3. **Kein Erklärtext.** Kein Absatz unter dem Titel, keine Sätze unter Tabellen, keine Untertitel, die den Titel wiederholen.
   Bedienung steht in der Hilfe. Erlaubt: ein Satz in einem Leerzustand, einer Schloss-Karte oder einem Fenster.
4. **Zeilen statt Kästen.** Gleichartige Dinge stehen als Zeilen untereinander, getrennt durch eine Haarlinie. Vorbild ist die
   Liste der Verbindungen unter Einstellungen & Hilfe. Eigene Kästen haben nur Kacheln (Kennzahlen, Knopfkacheln).
5. **Gleiches sieht gleich aus.** Auf jeder Seite und auf jedem Gerät. Das iPhone ordnet anders (untereinander, eingeklappt),
   tauscht aber keinen Baustein aus.
6. **Farbe hat eine Bedeutung.** Statusfarben nur für Zustände (Tabelle unten), der Akzent für Auswahl, „jetzt“, Links und die
   eine Haupthandlung.
7. **Nur Variablen.** Keine festen Farben im CSS. Sonst passen dunkel, Flieder und Klar nicht.
8. **Symbole nur mit Bedeutung.** Ein Symbol steht nur, wo es etwas sagt, das der Titel nicht sagt (Ort, Kontakt, Achtung,
   ein Zustand, verschiedene Themen in einer Zeilenliste). Schmückende Symbole entfallen. Wenn, dann Lucide (24er-Raster,
   Strich 2, `currentColor`), keine Emojis.
9. **Tippen geht immer.** Tippflächen auf iPhone und iPad mindestens 44 px, Eingabefelder 16 px Schrift. Kleine Knöpfe
   behalten ihr Aussehen und bekommen eine unsichtbare Fläche (`::after`, `eba-core.css` Abschnitt 43).
10. **Kurze Texte, gleiche Wörter.** Du-Form, ohne Fachwörter, wie im Changelog (siehe [CONTRIBUTING.md](../CONTRIBUTING.md)), mit
    den Wörtern aus der Wortliste (Abschnitt [Sprache](#sprache)).

## Farben

Nur diese Variablen verwenden. Die Werte setzen die Farbschemata; `eba-core.css` Abschnitt 1 hat nur Rückfallwerte.

| Variable | Wofür | Elfenbein hell | Elfenbein dunkel | Flieder | Klar |
|---|---|---|---|---|---|
| `--eba-bg` | Seite | `#faf6ee` | `#1b1813` | `#f7f2fb` | `#ffffff` |
| `--eba-card-bg` | Karte, Zeilenliste, Kachel | `#fffdf8` | `#221e18` | `#fdfaff` | `#ffffff` |
| `--eba-surface-2` | Leiste, Segmentschalter, Gruppenkopf | `#f3eee2` | `#29251e` | `#f1eaf7` | `#f4f5f7` |
| `--eba-border` | Rahmen, Haarlinie | `#e6dccb` | `#373027` | `#e5d9f0` | `#e4e7eb` |
| `--eba-border-strong` | Rahmen von Knöpfen, gestrichelt | `#cbbfa8` | `#4f4637` | `#cdbbdf` | `#cdd2d9` |
| `--eba-text` | Text | `#2a2119` | `#ece4d4` | `#2a2133` | `#16191f` |
| `--eba-muted` | Metazeile, Label | `#65594a` | `#b3a892` | `#66597a` | `#5a616c` |
| `--eba-faint` | Pfeile, Nebensachen | `#8c8272` | `#867c6a` | `#8a7c9c` | `#868d98` |
| `--eba-accent` | Fläche des Hauptknopfs, Balken | `#2f5d46` | `#417d5f` | `#7446a6` | `#2a5bd7` |
| `--eba-accent-text` | Links, Gruppenlabel, Auswahl | `#2f5d46` | `#8cbf9f` | `#6c3f9e` | `#2453c9` |
| `--eba-accent-soft` | Tönung für Auswahl und „Empfohlen“ | Akzent 8 % | 12 % | 9 % | 8 % |
| `--eba-good` | erledigt | `#1f7a4d` | `#62bf8c` | `#1f7a4d` | `#1a7f4b` |
| `--eba-warn` | Frist | `#a8660b` | `#dea64a` | `#a3600a` | `#a3600a` |
| `--eba-bad` | Prüfung, Fehler | `#b42318` | `#ec7468` | `#b4234a` | `#c0262d` |
| `--eba-info` | Lehre, Hinweis | `#3b5f86` | `#8aa9d0` | `#4a5ba6` | `#1f6e8c` |

Flieder hat zusätzlich `--eba-rose` (nur für die hervorgehobene Kachel, dunkel `#d98bab`).

**Bedeutung der Statusfarben**, überall gleich:

| Farbe | Bedeutung | Beispiele |
|---|---|---|
| `--eba-good` | erledigt, bestanden, verbunden, angemeldet | Pille „angemeldet“, Haken bei gelesenen Unterlagen |
| `--eba-warn` | Frist, Anmeldung, etwas ist offen und hat ein Datum | Pille „Frist“, Anmeldezeitraum, „Nacharbeit offen“ |
| `--eba-bad` | Prüfung, Klausur, Fehler, nicht bestanden | Prüfungstag im Kalender und in der Zeitleiste, Prüfungsphase (getönt) im Semesterverlauf und im Studienverlauf |
| `--eba-info` | Lehre, Zwischentest, offene Fragen | Pille „Lehre“, „Zwischentest“ |
| neutral (`--eba-text` 6–7 %) | freiwillig, geschätzt, neu, leise Marken | Pille „freiwillig“ |

Getönte Flächen entstehen mit `color-mix(in srgb, var(--eba-…) N%, transparent)`: 6 % für neutrale Flächen, 9–14 % für
Pillen und Symbole, 45 % für Rahmen. Schrift auf einer Akzentfläche: `var(--text-on-accent, #fff)`.
**(geplant)** Eigene Variablen `--eba-good-soft`, `--eba-warn-soft`, `--eba-bad-soft`, `--eba-info-soft` statt der Zahlen.

## Form, Schrift und Abstände

| Variable | Elfenbein | Flieder | Klar |
|---|---|---|---|
| `--eba-radius` (Karte, Liste) | 3 px | 12 px | 8 px |
| `--eba-radius-s` (Knopf, Eingabe) | 2 px | 8 px | 6 px |
| `--eba-font-display` (Titel, `##`, Kennzahl) | Serif (Iowan, Palatino) | rund (SF Pro Rounded) | Schrift des Geräts |
| `--eba-display-weight` | 500 | 650 | 620 |

Pillen haben immer runde Enden (`999px`), Symbole sind Kreise. Schatten gibt es nicht (`--eba-shadow: none`).

**Schriftgrößen** (Grundschrift = Obsidians Textgröße). Neue Regeln nehmen eine dieser Stufen:

| Stufe | Größe | Wo |
|---|---|---|
| Seitentitel | 2,15em (Elfenbein 2,5em), Display-Schrift | `h1` im Seitenkopf |
| Abschnitt | je Design 1,2–1,35em, Display-Schrift | `##` |
| Kennzahl | 2em, Display-Schrift | Wert in einer Kachel |
| Text | 1em | Zeilentitel (600), Fließtext |
| Meta | 13 px | zweite Zeile, Knopf in einer Zeile |
| Klein | 12 px | Pille, Spaltenkopf, Achse |
| Label | 10,5 px, 600, Großbuchstaben, Abstand 0,09em | Kartentitel, Pfad, Gruppenlabel |

**(geplant)** Variablen `--eba-fs-meta`, `--eba-fs-klein` und `--eba-fs-label` für die drei kleinen Stufen.

**Abstände** in Schritten von 4 px: 4 · 8 · 12 · 16 · 24 · 32. Zwischen Karten 12 px (`--eba-gap`), Zeilen 12 × 14 px
Innenabstand, Karten 16 × 18 px (iPhone 11 × 13 px). **(geplant)** Variablen `--eba-s1` bis `--eba-s6`.

## Bausteine

### Seitenkopf
Pfad (Label, Links gedämpft) → Titel (`h1`) → höchstens eine Zeile Eckdaten (Werte mit „ · “ getrennt, auf der Modulseite mit
feinen Trennstrichen) → Linie (Elfenbein doppelt). Auf jeder Seite mit `cssclasses: eba`. Das Symbol der Übersicht steht auf
allen Geräten in Obsidians Kopfleiste jeder Notiz (seit 0.4.6). **(geplant)** Auch Vorlesungsnotiz, Übungsblatt,
Begleitnotiz, Termin- und Stundenplan-Notiz bekommen den Pfad (Modul) über dem Titel; ihren Status zeigt schon die Kopf-Karte
unter dem Titel (`kopf.js`, `eba-core.css` 64.2).

### Abschnitt
`##` gliedert eine Seite in Themen. Sein Aussehen bestimmt das Design (Elfenbein: Serif mit Linie darüber), auch in der
Bearbeitungsansicht: Regeln dafür nehmen `--eba-h2-linie`, `--eba-h2-weight` und `--eba-h2-size` (Werte je Design). Eine Karte direkt
darunter wiederholt den Abschnittsnamen nicht als Titel.

### Karte
`> [!eba-karte]` und Verwandte (`eba-tabelle`, `eba-termin`, `eba-regel` …): Rahmen `--eba-border`, `--eba-radius`,
`--eba-card-bg`, kein Schatten. Titel als Label, ohne Symbol; Symbol (14 px) nur bei `eba-ort`, `eba-kontakt`,
`eba-achtung` und den Themen der Hilfe (`eba-core.css` Abschnitt 5). Klappbare Karten haben den Pfeil rechts in der
Titelzeile, auf allen Geräten (`eba-core.css` Abschnitt 5). Für einen abgeschlossenen Block, nicht für einzelne
Listeneinträge. Obsidians eigene Callouts in Notizen (`> [!info]`, `> [!warning]` …) haben Rahmen und Fläche in der
Statusfarbe ihres Typs: info, note, tip, question → `--eba-info`, warning → `--eba-warn`, danger, error, bug → `--eba-bad`,
success → `--eba-good`, quote → `--eba-muted` (`eba-core.css` Abschnitt 2).

### Zeilenliste
Der wichtigste Baustein. Code: `.eba-vb-liste` mit `.eba-vb` (Skripte), `> [!eba-zeilen]` (Markdown).

```
┌──────────────────────────────────────────────────────────────┐
│ (◯)  Titel  [Pille]                              [ Knopf ]   │
│      Metazeile, gedämpft                                     │
├──────────────────────────────────────────────────────────────┤
│ (◯)  Titel                                               ›   │
└──────────────────────────────────────────────────────────────┘
```

- Links ein rundes Symbol (30 px, Linien-Symbol 16 px, neutral getönt; Akzent, wenn eingetragen oder aufgeklappt; Statusfarbe,
  wenn es einen Zustand zeigt). Kein Symbol, wenn alle Zeilen dasselbe hätten.
- Titel in 600, dahinter höchstens eine Pille. Darunter höchstens eine Metazeile.
- Rechts genau eins: ein Knopf, ein Pfeil (öffnet etwas), ein Wert (Note, Datum) oder ein Haken (gewählt).
- **Mit Rahmen** für Listen, in denen man etwas tut (Einstellungen, Verbindungen, Variante, Hilfe, Übungsgruppen, Karten
  eines Stapels). **Ohne Rahmen**,
  nur mit Haarlinien, für Leselisten unter einem Gruppenlabel (Unterlagen, „Als Nächstes“, Agenda).
- Gruppen: Label in `--eba-accent-text` über der Gruppe (ohne Rahmen) oder als Band in `--eba-surface-2` (mit Rahmen).
- iPhone: Der Knopf bleibt rechts, solange der Titel zwei Zeilen hat; erst danach rutscht er unter den Text.

### Kachel und Kennzahl
`> [!eba-kennzahlen]`: höchstens vier Kacheln. Label, Wert (Kennzahl), höchstens eine Unterzeile mit neuer Information, optional
ein Balken (`--eba-bar-h`). Die erste Kachel trägt den Akzent, auf dem Dashboard („Nächste Frist“) die Farbe der Fristen
(`--eba-warn`).

### Knöpfe

| Stufe | Aussehen | Wann |
|---|---|---|
| Haupt | Fläche `--eba-accent`, Schrift `--text-on-accent` | die eine Handlung eines Fensters oder Modulfelds („Weiter“, „Verbinden“, „Neue Vorlesung“) |
| Empfohlen | Tönung `--eba-accent-soft`, Rahmen Akzent 45 % | der eine empfohlene Schritt in einer Zeile oder Leiste („Neu laden“, „Lernen“) |
| Normal | Rahmen `--eba-border`, Fläche `--eba-bg` | alles andere („Ändern“, „Wählen“) |
| Leise | ohne Rahmen, `--eba-muted` | Nebenwege („Später“, „Überspringen“, „Zurück“) |

- Größen: **klein** 13 px Schrift, 30 px hoch (Zeile, Leiste); **groß** 15 px, 44 px hoch (Fenster, Einrichtung, iPhone).
  Auf iPhone und iPad hat jeder Knopf mindestens 44 × 44 px Tippfläche; ein neuer kleiner Knopf kommt in die Liste der
  Tippflächen-Regel in Abschnitt 43.
- Je Bereich höchstens ein Haupt- oder Empfohlen-Knopf.
- Beschriftung: ein Verb oder Verb + Ding, ohne Punkt („Verbinden“, „Neue Karte“). „…“ nur, wenn danach eine Frage kommt.
- In Fenstern rechts unten, **Hauptknopf ganz rechts**, Abbrechen/Später links daneben. Auf dem iPhone untereinander über die
  ganze Breite, Hauptknopf oben. Das CSS ordnet den Knopf `mod-cta` so ein, egal an welcher Stelle ihn ein Skript anlegt
  (`eba-core.css` Abschnitt 43, für `.eba-modal` und das Eingabefenster `.sa-eingabe`). Fenster haben Rahmen und Rundung wie
  Karten, keinen Schatten.
- Symbole in Knöpfen nur, wenn alle Knöpfe der Reihe eins haben.
- **Knopfkacheln** (`> [!eba-neu]`, Seitenanfang): Symbol in getöntem Feld + Titel; auf dem iPhone zwei je Reihe.

### Pille
`.eba-pill` mit Ton `ok`, `warn`, `bad`, `info`, `akzent` oder `leer`: 12 px, runde Enden, Punkt vorn (Ring bei `leer`). Nur
für Zustände, höchstens zwei je Zeile. Steht in jeder Zeile derselbe Wert, gehört er in den Gruppenkopf, nicht in die Pille.
**Wahlpille** (`.eba-mod-status`, `.eba-vorl-status`): Pille mit Pfeil, öffnet ein Menü; für einen Status, den man selbst setzt.

### Segmentschalter
`.eba-ds`: zwei bis vier Möglichkeiten nebeneinander, eine gewählt (Hell · Dunkel · Automatisch). Ohne Untertexte.

### Auswahl aus Zeilen
Je Möglichkeit eine Zeile der Zeilenliste: gewählt mit Haken und Pille „gewählt“, die anderen mit „Wählen“ (Variante).
**(geplant)** Die Einrichtung zeigt dieselbe Zeile statt eines Optionsfelds links.

### Vorschau-Kacheln
`.eba-dk` (Design, unter dem Segmentschalter in Einstellungen & Hilfe und in der Einrichtung): Für eine Wahl, die man sehen statt
lesen soll. Gleich breite Kacheln in einer Reihe, ohne Text: Jede zeigt eine Mini-Karte in den Farben ihrer Möglichkeit (Seite,
Karte, Akzent). Gewählt mit Ring und Haken im Akzent, mindestens 44 px hoch, am PC so breit wie der Segmentschalter, auf iPhone,
iPad und in der Einrichtung über die ganze Breite. Für Vorlesesoftware `role="radiogroup"`, je Kachel `role="radio"` mit
`aria-label` und `title` ohne Namen („Design 1“); Tab erreicht die gewählte, Pfeiltasten wechseln.

### Leerzustand
Ein Satz in `--eba-muted` an der Stelle des Inhalts, danach der nächste Schritt als Link oder Knopf: „Noch keine Unterlagen.
**Unterlagen aktualisieren**“. „Noch keine …“ für Dinge, die kommen werden, „Nichts offen.“ für erledigte Listen. Nie nur „Leer.“, nie
eine leere Tabelle mit Spaltenköpfen.

### Schloss-Karte
`eba-schloss`: gestrichelter Rahmen, rundes Schloss-Symbol, Titel und ein Satz, ein Empfohlen-Knopf („ILIAS verbinden“). Steht
statt eines Inhalts, der eine Verbindung braucht.

### Fenster
`.eba-modal`: Titel, höchstens ein Satz (`.eba-modal-text`), Inhalt, Knopfreihe. Breite bis 560 px, auf dem iPhone ganzer
Bildschirm. Schritte als nummerierte Liste, Bedienelemente **fett** wie in der App beschriftet.

### Hinweis
Obsidians Hinweis (`Notice`), immer über `ctx.hinweis(text, { aktion })`: nur als Antwort auf eine Handlung oder bei einem
Fehler. Regeln für den Text unter [Sprache](#sprache) → „Hinweise“. Ein nächster Schritt als Knopf (`aktion`) hat die Gestalt
des Update-Hinweises (`.eba-toast`).

### Tabellen
Markdown-Tabellen nur für Nachschlage-Inhalt (Regeln, Steckbrief): Spaltenköpfe als Label, nur waagerechte Haarlinien, Zahlen
tabellarisch. Bases-Tabellen sind Datenquelle: `tabellen.js` zeichnet sie als Zeilenliste (`--eba-tliste: 1`), Spaltenköpfe
ohne Symbole, keine Werkzeugleiste, nur zum Lesen (seit 0.4.6 überall, auf allen Geräten, `eba-core.css` 37.tabellen; ändern im
Modulfeld und im Kopf der Notiz, architektur.md „Bedien-Bausteine“). Die Listen „Fristen“, „Termine“ (Dashboard und **Prüfungen**) zeichnet
`dashboard.js` als Zeilen (```` ```eba-liste ````, eba-core.css Abschnitt 63), übrige Listenansichten von Bases Obsidian selbst.

## Daten, Zahlen und Links

Im Code setzen `ctx.modell.zeit` (`datum`, `kurz`, `spanne`, `abstand`, `plural`) und `ctx.modell.statusArt` diese Regeln und
die Statusfarben oben um (architektur.md, „Fachmodell“); kein Skript formatiert ein Datum oder wählt eine Statusfarbe selbst.

- **Datum in Zeilen:** „Mo 19.10.“. Jahr nur, wenn es nicht im laufenden Studienjahr liegt: „06.02.2028“.
- **Spannen:** im selben Monat „19.–25.10.“, sonst „12.10. – 06.02.“; Uhrzeit „10:00–12:00“.
- **Abstand:** „heute“, „morgen“, „in 5 Tagen“ hinter dem Datum, mit „ · “ getrennt.
- **Im Kopf einer einzelnen Notiz** darf der Wochentag ausgeschrieben sein: „Donnerstag, 15.10.“.
- **Zahlen:** „6 ECTS“, Noten mit Komma („2,3“), „34 %“ mit Leerzeichen; Spalten mit `tabular-nums`.
- **Links:** `--eba-accent-text`, ohne Unterstrich, unterstrichen beim Zeigen. Verweis auf eine andere Seite als eigene Zeile
  „Thema → Seite“. Externe Links mit Obsidians Pfeil.

## Sprache

Eine App, ein Wortschatz: Knöpfe, Fenster, Hinweise, Seiten, Hilfe und Changelog nehmen die Wörter aus dieser Liste. Der Test
`tests/wortliste.test.js` sucht die Wörter aus der Spalte „Nicht“ in den Texten der Skripte (nur Zeichenketten, keine
Kommentare), auf allen Seiten unter `Studium/`, im Dashboard, in den Gerüsten, auf den Modulseiten und im Changelog unter
„Unveröffentlicht“. Steht eine Variante dort mit Absicht (Obsidians eigene Beschriftung wie **Ordner als Vault öffnen**, der
Titel eines Dokuments der Uni), kommt sie mit Grund in die Liste `AUSNAHMEN` in `tests/wortliste.js`.

### Wortliste

| Sag | Nicht | Warum |
|---|---|---|
| **Aktualisieren** (Daten jetzt holen, auch als „Stundenplan aktualisieren“); **Hier aktualisieren**, wenn gerade ein anderes Gerät aktualisiert | „Jetzt aktualisieren“, „Jetzt holen“, „Jetzt prüfen“, „Jetzt abgleichen“, „Hier laden“, „Aus ILIAS holen“, „… aus Alma holen“, „Neu holen“ | ein Wort für dieselbe Handlung |
| **Neue Version installieren** (Update der App) | „Aktualisieren“, „Studium Autopilot aktualisieren“ | „Aktualisieren“ heißt schon: Daten holen |
| **Lehrveranstaltung** (Eintrag im Stundenplan: Vorlesung, Übung, Tutorium) | „Stundenplan-Eintrag“, „Veranstaltung“ für den Stundenplan | **Veranstaltung** nur für Events: Party, Vortrag, Fachschaft |
| **ECTS** | „CP“, „Credits“, „Leistungspunkte“ | so heißen sie in Alma und in der Prüfungsordnung |
| **Prüfung**; **Prüfungsphase** mit Haupttermin und Nachholtermin | „Klausurtermin“, „Prüfungstermin“, „Klausurphase“, „Prüfungszeitraum“ | „Klausur“ nur als Form der Prüfung („Klausur 90 min“) |
| **1. Fachsemester**, wo es eng ist **1. FS** | „FS 1“ | eine Schreibweise |
| **Gesamtnote**, **Zielnote** | „Notenschnitt“, „Wunsch-Schnitt“, „Wunschnote“ | dieselbe Zahl heißt überall gleich |
| **Übungsgruppe**, kurz **Gruppe 4** | „Gr. 4“ | keine Abkürzungen |
| **angemeldet**: für eine Prüfung oder einen Kurs (grün) | „angemeldet“ für ILIAS, Alma oder die Übungsgruppe | ein Wort, eine Bedeutung |
| **verbunden**, **neu verbinden** (ILIAS, Alma) | „Anmeldung prüfen“, „Anmeldung abgelehnt“, „Melde mich an“ | „Anmeldung“ heißt: für eine Prüfung oder einen Kurs |
| **Passwort** | „Kennwort“ | ein Wort |
| **## Meine Notizen** (dein Text in einer Notiz); **Zum Modul** (die Liste der Notizen auf der Modulseite) | „## Notizen“, „Meine Notizen“ als Liste | dein Text steht in jeder Notiz unter derselben Überschrift und bleibt dort |
| **vorlesungsfrei**; benannte Pausen **Weihnachtspause**, **Pfingstpause** | „Ferien“, „Pfingstferien“ | so sagt es die Uni |
| **Stundenplan** (Seite), **Woche** (Raster auf Dashboard und Stundenplan) | „Wochenplan“, „Wochenraster“, „Wochenansicht“ | ein Name je Ansicht |
| **Übersicht** (Menü mit allen Seiten); **Teil** (Grundstudium, Profil & Vertiefung …); **Schwerpunktbereich** | „Bereiche-Menü“, „Bereich“ für einen Teil | „Bereich“ nur für Schwerpunkte |
| **Deine Angaben** mit **Ändern**; **Obsidian-Einstellungen** für Obsidians eigene | „Personalisieren“, „Einstellungen →“ für Obsidians | wie die Überschrift in der App; Obsidians Einstellungen sind andere |
| **Tresor**, einmal erklärt: „(in Obsidian: Vault)“ | „Vault“ | deutsch wie der Rest |
| **Termin folgt** (Datum fehlt noch) | „noch kein Termin“ | ein Satz für denselben Zustand |
| **mit Unterlagen**, **ohne Unterlagen**, **handschriftliches A4-Blatt** | „open book“, „closed book“, „Cheat-Sheet“ | ohne Jargon |
| **Design** ohne Namen; **Design 1**, **Design 2**, **Design 3** nur für Vorlesesoftware und die Auswahl des Befehls **Design wählen** | „Elfenbein“, „Paper Elfenbein“, „Flieder“, „Klar“ | Designs haben keine Namen, die Vorschau-Kacheln zeigen sie; die Namen gibt es nur in Code und CSS (`eba-design-flieder`) |

### Knöpfe und Befehle

- Ein Knopf heißt wie sein Befehl in der Befehlspalette: **Neue Vorlesung**, **Neues Übungsblatt**, **Unterlagen einordnen**,
  **Unterlagen aktualisieren**, **Neue Karte**. Fehlt dem Knopf auf seiner Seite nichts, der Befehl aber Zusammenhang, kommt
  nur das Ding dazu (Knopf **Lernen** → Befehl **Karteikarten lernen**), nie ein anderes Verb.
- Befehle ohne „Studium Autopilot“ (Obsidian setzt den Namen davor), ohne Vorsatz mit Doppelpunkt, ohne Erklärung in Klammern;
  „…“ nur, wenn eine Frage folgt (**Verbinden …**).
- Neues anlegen beginnt mit „Neu“: **Neuer Termin**, **Neue Lehrveranstaltung**, **Neuer Kartenstapel**.

### Hinweise

- Immer `ctx.hinweis(text, { aktion })` aus `hinweis.js`, nie `new Notice`. Der Test findet jedes `Notice` in den Skripten.
- Ein Satz mit Punkt, danach höchstens ein Satz mit dem nächsten Schritt, oder der Schritt als Knopf: `aktion: { text:
  "Verbinden", aktion: "verbinden", parameter: { id: "ilias" } }`.
- Kein Vorsatz („Studium Autopilot:“, „ILIAS:“, „Zentrale Daten:“), keine Dateipfade, kein Fehlertext aus dem Code (`e.message`
  gehört in die Konsole), keine Liste in mehreren Zeilen.
- Fortschritt: das Verb vorn, „…“ am Ende („Lade die neue Version …“, „Ordne 3 Unterlagen ein …“), mit `dauer: 0`; danach
  `setMessage` und `hide` an der zurückgegebenen Notice.

## iPhone und iPad

- Breiten nur über `body.is-phone` (Seitenebene) oder Container-Abfragen (`@container … (max-width: 480px)`), nie `@media`.
- iPhone: Was nicht täglich gebraucht wird, ist zu (`|handy-zu`). Raster werden einspaltig, Kacheln zweispaltig, Knopfkacheln
  zwei je Reihe.
- Die Bearbeitungsansicht (Live Preview) muss aussehen wie die Leseansicht (`eba-core.css` 36c).
- Einen leeren Block nie mit `display: none` auf dem Abschnitt ausblenden, sondern auf Höhe 0 falten (architektur.md, „Regeln
  für Skript-Autoren“).
- CSS muss in Safari 16 laufen (iPhone und iPad mit iOS 16): kein CSS-Nesting, keine Stilabfragen in `@container`;
  `color-mix()` gibt es erst ab Safari 16.2.

## Prüfen vor dem Pull Request

1. Nur Variablen aus diesem Dokument, keine festen Farben, Schriftgrößen aus den Stufen.
2. Ansehen in Elfenbein hell und dunkel, Flieder und Klar.
3. Ansehen in iPhone-Breite (390 px) und iPad-Breite (820 px), in Lese- und Bearbeitungsansicht.
4. Gibt es den Baustein schon? Dann ihn nehmen, keine neue Klasse mit ähnlichem Aussehen.
5. Neue CSS-Regeln in den Abschnitt des Bausteins in `eba-core.css`, seitenbezogene in Abschnitt 37 mit `eba-s-<seite>`.
6. `npm test`: `tests/design.test.js` (Design-Wächter) prüft, was sich ohne Obsidian prüfen lässt: feste Farben, Schatten,
   Symbole der Karten, `@media`-Breiten, Safari 16, und hält Schriftgrößen, Knopf-Klassen und Zeichen-Symbole auf dem Stand
   vom 18.10.2026 oder darunter. Ein neuer Wert dort heißt fast immer: einen vorhandenen nehmen.
