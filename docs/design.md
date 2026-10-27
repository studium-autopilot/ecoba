# Designsprache „Ruhig“

Zielgruppe: wer Seiten, Karten, Fenster oder CSS ändert. Stand 20.10.2026.

Alle Bildschirme sollen aussehen, als wären sie zusammen entstanden. Neue und geänderte Teile folgen diesen Regeln; ältere
Stellen werden Schritt für Schritt angeglichen. Wo etwas noch nicht umgesetzt ist, steht **(geplant)**.

Dateien: `Studium Autopilot/.obsidian/snippets/eba-core.css` (Form und Bausteine, Abschnitte mit Nummern),
`eba-paper-elfenbein.css` (Farben hell und dunkel), `eba-flieder.css` und `eba-klar.css` (Form und Schrift hell und dunkel,
Farben nur hell; dunkel gelten die dunklen Farben von Elfenbein, bis beide eigene haben). Wie die Designs gewählt
werden: [architektur/darstellung.md](architektur/darstellung.md). Regeln für Skripte und iPhone:
[architektur.md](architektur.md), „Regeln für Skript-Autoren“.

## Grundsätze

1. **Ein Blick reicht.** Eine Seite zeigt zuerst, was heute zählt. Alles andere ist eingeklappt oder steht weiter unten.
2. **Jede Angabe an einer Stelle.** Andere Seiten verweisen mit einer Zeile „Thema → Seite“ (siehe architektur.md, „Keine
   Dopplungen“).
3. **Keine Anleitung auf den Seiten.** Wie man etwas bedient, steht in der Hilfe: kein Absatz unter dem Titel, keine Sätze
   unter Tabellen, keine Untertitel, die den Titel wiederholen. Zustände und Fakten dürfen stehen, auch als Unterzeile („läuft“,
   „noch 103 Tage Vorlesungen“, „Orientierungsprüfung 0 / 4“). Erlaubt ist außerdem ein Satz in einem Leerzustand, einer
   Schloss-Karte oder einem Fenster. (Bis 26.10.2026 „Kein Erklärtext“: Das nahm auch Angaben mit, die keine Erklärung waren.)
4. **Zeilen für Gleichartiges, Kästen für Zusammengehöriges.** Gleichartige Dinge stehen als Zeilen untereinander, getrennt durch
   eine Haarlinie (Vorbild: die Verbindungen unter Einstellungen & Hilfe). Ein Kasten (Karte, Kachel) fasst zusammen, was
   zusammengehört, oder hebt heraus, was gerade zählt. (Bis 26.10.2026 hatten eigene Kästen nur Kacheln.)
5. **Hervorheben, was zählt.** Was gerade wichtig ist (die nächste Frist, was jetzt läuft), darf größer, farbig oder in einem
   eigenen Kasten stehen, der Rest bleibt ruhig. Keine feste Zahl; nur: Ist alles hervorgehoben, ist nichts hervorgehoben.
6. **Gleiches sieht gleich aus.** Ein Baustein sieht auf jeder Seite gleich aus. Seine Form darf sich der Breite anpassen: Das
   iPhone ordnet untereinander und klappt ein, ein schmales Monatsraster darf Punkte statt Titeln zeigen; der Inhalt bleibt
   derselbe. Der Stundenplan ist immer ein Raster. (Bis 26.10.2026 durfte das iPhone keinen Baustein austauschen.)
7. **Farbe hat eine Bedeutung.** Statusfarben nur für Zustände (Tabelle unten), der Akzent für Auswahl, „jetzt“, Links und die
   eine Haupthandlung, Modulfarben nur für das Modul im Wochenraster (mit Legende).
8. **Nur Variablen.** Keine festen Farben im CSS. Sonst passen dunkel, Flieder und Klar nicht.
9. **Symbole nur mit Bedeutung.** Ein Symbol steht nur, wo es etwas sagt, das der Titel nicht sagt (Ort, Kontakt, Achtung,
   ein Zustand, verschiedene Themen in einer Zeilenliste). Schmückende Symbole entfallen. Wenn, dann Lucide (24er-Raster,
   Strich 2, `currentColor`), keine Emojis. Ein Symbol in einem Feld steht immer in einem Kreis (Zeilenliste, Verbindungen,
   Knopf- und Link-Kacheln; seit 0.7.0, vorher in Kacheln ein abgerundetes Quadrat).
10. **Tippen geht immer.** Tippflächen auf iPhone und iPad mindestens 44 px, Eingabefelder 16 px Schrift. Kleine Knöpfe
    behalten ihr Aussehen und bekommen eine unsichtbare Fläche (`::after`, `eba-core.css` Abschnitt 43).
11. **Kurze Texte, gleiche Wörter.** Du-Form, ohne Fachwörter, wie im Changelog (siehe [CONTRIBUTING.md](../CONTRIBUTING.md)), mit
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
| `--eba-faint` | Pfeile, Nebensachen (mindestens 4,5 : 1 auf Seite und Karte, seit 0.7.0) | `#776e61` | `#918672` | `#756985` | `#6f757e` |
| `--eba-accent` | Fläche des Hauptknopfs, Balken | `#2c3440` | `#4b5566` | `#7446a6` | `#2a5bd7` |
| `--eba-accent-text` | Links, Gruppenlabel, Auswahl | `#2c3440` | `#b9c3d3` | `#6c3f9e` | `#2453c9` |
| `--eba-accent-soft` | Tönung für Auswahl und „Empfohlen“ | Akzent 7 % | 12 % | 9 % | 8 % |
| `--eba-good` | erledigt | `#1f7a4d` | `#62bf8c` | `#1f7a4d` | `#1a7f4b` |
| `--eba-warn` | Frist | `#a8660b` | `#dea64a` | `#a3600a` | `#a3600a` |
| `--eba-bad` | Prüfung, Fehler | `#b42318` | `#ec7468` | `#b4234a` | `#c0262d` |
| `--eba-info` | Lehre, Hinweis | `#3b5f86` | `#8aa9d0` | `#2f64ad` | `#1f6e8c` |

Flieder hat zusätzlich `--eba-rose` (nur für die hervorgehobene Kachel, dunkel `#d98bab`).

**Bedeutung der Statusfarben**, überall gleich:

| Farbe | Bedeutung | Beispiele |
|---|---|---|
| `--eba-good` | erledigt, bestanden, verbunden, angemeldet | Pille „angemeldet“, Haken bei gelesenen Unterlagen |
| `--eba-warn` | Frist, Anmeldung, etwas ist offen und hat ein Datum; Ausnahme im Stundenplan (Ausfall, anderer Raum, andere Zeit) | Pille „Abgabe“, Anmeldezeitraum, „Nacharbeit offen“, „Fällt aus“ und „Hörsaal 9 statt ~~Hörsaal 1~~“ in der Woche |
| `--eba-bad` | Prüfung, Klausur, Fehler, nicht bestanden | Prüfungstag im Kalender und in der Zeitleiste, Prüfungsphase (getönt) im Semesterverlauf und im Studienverlauf |
| `--eba-info` | Lehre, Zwischentest, offene Fragen | Pille „Lehre“, „Zwischentest“ |
| neutral (`--eba-text` 6–7 %) | freiwillig, geschätzt, neu, leise Marken | Pille „freiwillig“, „Noch nicht gelesen“ |

**Farbe je Art eines Termins** (Kalender und Agenda auf **Termine & Anmeldungen**, seit 24.10.2026): eigene Variablen, damit
man jede Art auf einen Blick erkennt, auch in Chips von 50 px Breite: `--eba-art-pruefung` (rot), `--eba-art-uni` (blau;
auch Zwischentests), `--eba-art-event` (lila; Veranstaltung, Fachschaft, seit 0.7.0 auch die Angebote der Uni). Der Kern setzt
die ersten beiden auf `--eba-bad` und `--eba-info`; jedes Design und das dunkle Schema setzen eigene Werte, wo diese zu nah
beieinander liegen (Petrol neben Grün, Indigo neben Violett). Veranstaltungen nehmen nicht den Akzent: Der markiert im Kalender
heute und den gewählten Tag. Hell sind sie ein dunkles Pflaumenlila: die unwichtigste Art, also nicht die lauteste Farbe. Und sie sind nie grün, denn Grün heißt erledigt (bis 0.6.14 waren sie grün; in Elfenbein war dazu
der Akzent Waldgrün, eine Farbe hatte so drei Bedeutungen). Die Legende zeigt dieselben Chips wie das Raster, nie eine andere Form. `tests/design.test.js` prüft je Design
(hell und dunkel): OKLab-Abstand der drei Töne untereinander ≥ 0,2, von Uni und Veranstaltung zum Akzent ≥ 0,09, Veranstaltung
nicht grün (Farbton außerhalb 100–180°), Akzent nicht in der Familie von `--eba-good` (Abstand ≥ 0,15 und, wenn er bunt ist,
Farbton ≥ 45° entfernt), Schrift im
Chip (82 % Farbe in der Schrift auf 17 % Farbe in der Karte) mit Kontrast ≥ 4,5:1. Vergangene Termine (`is-vorbei`) haben
eine Schrift aus 40 % `--eba-muted` in `--eba-faint` auf 7 % Farbe, nur der Streifen behält die Art; derselbe Test verlangt dort
≥ 4,5:1 (seit 0.7.0; bis 0.6.14 Deckkraft 0,6, etwa 2:1).

| Schema | Prüfung | Uni | Veranstaltung |
|---|---|---|---|
| Elfenbein hell | `#b42318` | `#2d5f9e` | `#6c0069` |
| dunkel (alle Designs) | `#ec7468` | `#7fa6e6` | `#fb80fc` |
| Flieder | `#c92132` | `#2c71b7` | `#711378` |
| Klar | `#c0262d` | `#22639a` | `#b24acf` |

**Akzent in Elfenbein: Tinte** (seit 0.7.0, am 26.10.2026 aus Tinte, Aubergine und nur lila Veranstaltungen
gewählt): dunkles Blaugrau, fast neutral; bis 0.6.14 Waldgrün `#2f5d46`, nur 0,09 von „erledigt“ entfernt. Weil Tinte nah an der
Textfarbe liegt, tragen Links in Elfenbein eine feine Linie (`--link-decoration`), und die Kachel, bei der etwas wartet, ist
zusätzlich getönt.

**Farbe je Modul im Wochenraster** (Dashboard und Stundenplan, seit 27.10.2026; Rückmeldung vom iPad, dunkel: „Timetable Colors
aren't distinguishable too faint“): Bis dahin war jede Vorlesung grau gefüllt und jede Übung nur blau umrandet, dunkel verschwamm
beides mit der Karte. Jetzt hat jedes Modul das ganze Semester dieselbe Farbe, `--eba-modul-1` bis `--eba-modul-6` (`woche.js`
vergibt sie nach dem Code, ab dem siebten Modul von vorn). Eine Vorlesung hat links eine Kante von 3 px in der Farbe und eine
Fläche aus `--eba-modul-ton` Farbe auf `--eba-bg` (hell 35 %, dunkel 28 %), Übung, Tutorium und Lab eine Kante von 2 px und eine
leisere Fläche `--eba-modul-ton-ue` (hell 26 %, dunkel 20 %); so bleibt der Unterschied sichtbar, und auch die Übungen tragen
ihr Modul in der Fläche, nicht nur in der Kante. Ohne Modul: `--eba-faint`. Unter dem Raster, in derselben Karte, eine Legende der
Module der Woche mit demselben Kästchen (Kante und Fläche einer Vorlesung). Heute (getönte Spalte, Rahmen, „jetzt“) und
[Ausnahmen](#ausnahme-im-stundenplan) bleiben, wie sie waren; eine Ausnahme ersetzt die Farbe des Moduls. Der Ring „jetzt“ ist
`--eba-accent-text` (seit 27.10.2026; in `--eba-accent` war er dunkel auf den Flächen 1,33 : 1), mindestens 3 : 1 auf jeder Fläche.

*Online* (seit 27.10.2026; Rückmeldung zum Data Science Lab von S110, per Zoom: „R Lab or Science Lab isn't distinct in timetable
but should be since it's online and sth different but still part of explo data analytics“). Eine Sitzung, die an dem Tag online
stattfindet, behält die Farbe ihres Moduls (sie gehört zu ihm), hat aber eine eigene Form: gestrichelte Kante, eine Fläche aus
schrägen Streifen in ihrem Ton und in 60 % davon, und eine Kamera (Lucide „video“) vor der Zeile mit Zeit und Raum, auf dem
iPhone vor der knappen Zeile. Die Legende hat dann den Eintrag „online“ mit demselben Kästchen (neutral), nur in Wochen mit so
einer Sitzung. Eine Regel, nicht der eine Fall: `ctx.modell.istOnline` (Feld `online: true` oder ein Raum mit „online“, „Zoom“,
„Webex“, „Teams“, „BigBlueButton“, „BBB“ als eigenem Wort oder einem Link; „per Zoom“, „Online-Sitzung“ ja, „Onlinekurs“ nein),
nach dem Raum an dem Tag: Ist eine Sitzung einmal im Hörsaal, ist sie dort nicht online. Ein Ausfall bleibt ein Ausfall ohne
Kamera; eine Ausnahme ersetzt die Fläche durch Bernstein und behält die gestrichelte Kante; „heute“ und „jetzt“ wie überall.
Die Modulseite zeigt dieselbe Kamera vor dem Ort in „Als Nächstes“. Form statt Farbe, weil Farbe im Raster schon das Modul
sagt; dass es ein Lab ist, sagt die Art im Kasten („Data Science Lab“). Verworfen: eine eigene Farbe für online (risse das Lab
aus seinem Modul), nur ein Symbol (zu klein, um es in der Woche auf einen Blick zu sehen), eine blassere Fläche (sieht aus wie
„beginnt erst“). `tests/design.test.js` prüft Schrift und Raumzeile auf beiden Streifen jedes Designs (≥ 4,5 : 1).

*Welche Töne.* Fast der ganze Farbkreis sagt in der App schon etwas: Rot Prüfung, Bernstein Frist und Ausnahme, Grün erledigt,
Pflaumenlila und Magenta Veranstaltung, der Akzent Auswahl und „jetzt“. Frei bleiben Petrol, Himmelblau und Blauviolett; Blau
heißt Lehre, und jeder Kasten im Raster ist Lehre. Das sind vier Töne, ein Semester hat aber meist fünf, manchmal sechs Module.
Zwei Töne sind darum geliehen, nach dieser Rangfolge: nie Bernstein (Ausnahmen stehen in derselben Woche als Kante und Fläche in
`--eba-warn`), nie Rot (ein Prüfungs-Chip im Kalender hat dieselbe Form, hell wäre die Fläche dasselbe Rosa), nie das Lila der
Veranstaltungen (ihre Chips ebenso). Am wenigsten stört Grün: „erledigt“ ist in der App eine Pille, ein Haken oder ein Symbol,
nie eine Fläche mit Kante, und im Raster ist nichts erledigt; das Modul-Grün ist gelber als `--eba-good`. Rosa, zwischen Rot und
Lila, nur für ein sechstes Modul. Die geliehenen Töne kommen zuletzt: Bis vier Module ist alles frei, mit fünf kommt Grün dazu.
Den Akzent nimmt keiner: In Elfenbein und dunkel ist er fast neutral, in Klar ist Ton 1 darum Marineblau statt Blau, in
Flieder Ton 3 Iris statt Violett. Die Flächen sind so kräftig, dass man zwei Module schon an der Fläche unterscheidet, auch zwei
Übungen; hell waren 18 % zu blass (Petrol und Himmel lagen nur 0,019 auseinander, Rückmeldung vom 27.10.2026), Übungen bei 15 %
noch 0,016. Mehr Abstand der Übungen geht nur mit kräftigeren Flächen, denn zwei Flächen liegen etwa um den Ton mal den Abstand
ihrer Farben auseinander, und die Übung muss leiser bleiben als die Vorlesung. Art und Raum im Kasten stehen darum in
`--eba-ev-raum`, einem Grau mit `--eba-ev-raum-anteil` Textfarbe (hell 35 %, dunkel 25 %): `--eba-muted` fiele auf den hellen
Flächen auf 3,5 : 1. Verworfen: acht Töne rund um den Farbkreis (Koralle sah aus wie eine Prüfung, Oliv wie eine
Ausnahme) und nur die vier freien Töne (dann teilt sich das fünfte Modul eine Farbe mit dem ersten).

| Schema | 1 Blau | 2 Petrol | 3 Violett | 4 Himmel | 5 Grün | 6 Rosa |
|---|---|---|---|---|---|---|
| hell (Elfenbein) | `#2763ba` | `#147874` | `#7b63c7` | `#1292c0` | `#508524` | `#b54879` |
| Flieder | wie hell | | Iris `#7276f8` | | | |
| Klar | Marineblau `#1f5587` | wie hell | | | | |
| dunkel (alle Designs) | `#678dee` | `#349794` | `#b09ef9` | `#3ac1f0` | `#82bf57` | `#e380a9` |

`tests/design.test.js` prüft je Design (hell und dunkel): OKLab-Abstand der sechs Töne untereinander ≥ 0,1 (jetzt 0,107–0,123),
zur Warnfarbe ≥ 0,12 und 45° Farbton (jetzt ≥ 0,14 und 57°), zum Akzent ≥ 0,1, Töne 1–4 mindestens 25° Farbton von erledigt,
Rot, Prüfung und Veranstaltung (jetzt ≥ 26°), Grün und Rosa nie die Statusfarbe selbst (≥ 0,05; jetzt ≥ 0,06), Kante gegen die
Karte ≥ 3 : 1 (jetzt ≥ 3,4), Schrift und Raumzeile auf beiden Flächen ≥ 4,5 : 1 (jetzt ≥ 4,81), die Raumzeile mit höchstens
70 % des Kontrasts der Schrift (jetzt ≤ 64 %), gegen „zu blass“: Fläche einer Vorlesung ≥ 0,075 von der Karte, einer Übung
≥ 0,04, beide ≥ 0,03 voneinander (jetzt ≥ 0,035), und die Flächen untereinander: zwei Vorlesungen ≥ 0,03 (jetzt 0,038–0,039),
zwei Übungen ≥ 0,025 (jetzt 0,027–0,029).

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

Pillen haben immer runde Enden (`999px`). Karten und alles, was in der Seite liegt, haben keinen Schatten (`--eba-shadow: none`);
schwebende Ebenen (Fenster) heben sich mit einem leisen ab (`--eba-shadow-schwebend`, dunkel kräftiger; seit 0.7.0, vorher auch
sie ohne, auf Creme verschwamm ein Fenster mit der Seite).

**Schriftgrößen** (Grundschrift = Obsidians Textgröße). Neue Regeln nehmen eine dieser Stufen:

| Stufe | Größe | Wo |
|---|---|---|
| Seitentitel | 2,15em (Elfenbein 2,5em), Display-Schrift | `h1` im Seitenkopf |
| Abschnitt | je Design 1,2–1,35em, Display-Schrift | `##` |
| Kennzahl | 2em, Display-Schrift | Wert in einer Kachel |
| Text | 1em | Zeilentitel (600), Fließtext |
| Meta | 13 px | zweite Zeile, Knopf in einer Zeile |
| Klein | 12 px | Pille, Achse |
| Label | Klein in 600, normale Schreibweise (seit 0.7.0; bis 0.6.14 10,5 px in Großbuchstaben, Abstand 0,09em) | Kartentitel, Gruppenlabel, Spaltenkopf |

Unter der Grundschrift gibt es also zwei Größen, 13 und 12 px; Label ist keine dritte, sondern Klein in 600.
**(geplant)** Variablen `--eba-fs-meta` und `--eba-fs-klein` für die beiden kleinen Stufen.

**Abstände** kommen in der ganzen App aus einer Skala in Schritten von 4 px: 4 · 8 · 12 · 16 · 24 · 32. Welcher Schritt,
richtet sich danach, was zusammengehört: innerhalb einer Gruppe eng (4–8 px), zwischen Karten eines Themas 12 px
(`--eba-gap`), zwischen Abschnitten weit (24–32 px). Nicht überall derselbe Abstand: Liegt alles gleich weit auseinander, liest
sich eine Seite als ein Stapel. Ausnahme Dashboard: Zwischen allen Blöcken liegt so viel wie zwischen seinen Kacheln
(`--eba-gap`, iPhone 8 px). Kurz standen sie dort in drei Gruppen mit 24 px (iPhone 16 px) dazwischen; der größere Abstand über
den Knöpfen sah wie ein Versehen aus (Rückmeldung vom 26.10.2026). Innenabstand: Zeilen 12 × 14 px, Karten 16 × 18 px (iPhone 11 × 13 px). **(geplant)** Variablen
`--eba-s1` bis `--eba-s6`.

**Breite** (seit 26.10.2026 eine Regel für alle Notizen, `eba-core.css` 37.tablet Teil 1 und 1b). Seiten des Plugins (Dashboard,
`Studium/…`, Modulseiten; `eba-weit`, `eba-s-modul`) nutzen auf dem iPad und im breiten Telefon-Fenster die ganze Breite mit 22 px
Rand, Fließtext darin höchstens 52rem. Jede andere Notiz (Begleitnotiz und Lesefassung der Folien, Übung, Vorlesung, Termin,
Stundenplan, Lernplan, Karteikarten, eigene Notizen) ist eine Spalte von 52rem (ca. 90 Zeichen) mit demselben Rand, links bündig
mit den Seiten und mit ← in der Kopfzeile: Der Titel steht auf jeder Seite und in jeder Notiz an derselben Stelle, beim Wechsel
springt nichts. Eine aufgeklappte PDF nimmt die ganze Breite (Abschnitt 27). Bis 26.10.2026 liefen Begleitnotiz, Übung, Vorlesung
und Termin über die ganze Breite (über 150 Zeichen je Zeile), alte Lesefassungen, Stundenplan-Notizen und eigene Notizen standen in
einer Spalte von 700–800 px in der Mitte, der Titel mal links, mal 280 px weiter rechts. Verworfen: alle Notizen in der Mitte (dann
steht der Titel nie unter ← und springt beim Wechsel von einer Seite zur Notiz) und alle über die ganze Breite (Zeilen zu lang zum
Lesen). Am PC bleibt Obsidians Mitte für Seiten (60 bzw. 72rem) und Notizen (lesbare Zeilenlänge): Fenster sind dort bis 1900 px
breit, eine linke Spalte ließe mehr als die Hälfte leer. Wer Obsidians „Lesbare Zeilenlänge“ ausschaltet, bekommt die ganze
Breite.

## Bausteine

### Seitenkopf
Titel (`h1`) → höchstens eine Zeile Eckdaten (Werte mit „ · “ getrennt, auf der Modulseite mit feinen Trennstrichen) → eine
feine Linie (Elfenbein `--eba-border-strong`, bis 0.6.14 doppelt in Textfarbe). Auf jeder Seite mit `cssclasses: eba`. Der Titel ist der Name der Seite; er steht nur
dort (Baustein [Kopfleiste und Tabs](#kopfleiste-und-tabs)). Kein Pfad über dem Titel (seit 0.7.0): Zu jeder Seite führt die
Übersicht (seit 0.4.7, `seitenleiste.js`; seit 26.10.2026 hinter ≡ unten rechts, bis dahin in Obsidians linker Seitenleiste; bis
0.4.6 ein Symbol in der Kopfleiste jeder Notiz).
Bis 0.6.14 stand über dem Titel ein Pfad als Label („DASHBOARD / STUDIUM“), auf dem iPad direkt unter Obsidians eigenem; ältere
Notizen tragen ihn noch, `eba-core.css` 4 blendet ihn aus. Auch Obsidians Ordnerpfad in der Kopfleiste („Studium /“) fällt auf
diesen Seiten weg (seit 0.7.0). Vorlesungsnotiz,
Begleitnotiz, Termin- und Stundenplan-Notiz zeigen Modul und Status in der Kopf-Karte unter dem Titel (`kopf.js`, `eba-core.css` 64.2): Art · Modul (Link) · Tag, rechts der Status-Knopf und „⋯“ (Eigenschaften). Bei Begleit- und
Stundenplan-Notiz nennt der Titel schon Kürzel und Art („B110 · Folien 00 · Einführung“, „B180 · Tutorium“); das Label nennt
darum das Modul mit seinem Namen (Link zur Modulseite, ohne Modulseite das Kürzel), dazu das Semester bzw. Gruppe und Zeit
(seit 0.7.0, vorher „Folien 00 · B110 · WS 2026/27“ und „Tutorium · B180 · Di 08:15–09:45“; Rückmeldung: zu welchem Modul die
Folien gehören, soll klar sein). Die Vorlesungsnotiz ebenso (seit 26.10.2026, `vorlesung.js`): Modul (Link) · Vorlesungswoche
im Label, darunter das Thema nur, wenn der Titel es nicht nennt; bis dahin stand der Modulname als zweite große Überschrift in der
Karte und darunter noch einmal der Name der Notiz (in älteren Notizen das, was schon im Titel stand). Die Lernplan-Notiz („B110
Lernplan“) nennt in ihrer Zeile das Modul mit Namen als Link statt „B110 …“ noch einmal. Schmal (iPhone): Passt das Label nicht
in eine Zeile neben Status und „⋯“, stehen die beiden in einer eigenen Zeile darunter, das Label hat die ganze Breite (vorher
brach es daneben in drei Zeilen um). Bei
Übung, Tutorium und Lab darunter die Unterlagen aus ihrem Bereich (Übung, Tutorium bzw. Lab) als Chips wie in der Vorlesungsnotiz. Beim
Termin (seit 24.10.2026) nennt das Label nur Art · Modul; darunter steht der Tag in der Display-Schrift („Samstag, 24.10.“, ein
Zeitraum „22.–25.10.“), daneben die Marke **heute** (Akzent), **morgen** oder **läuft** (getönt) wie in der Vorlesungsnotiz, sonst
leise der Abstand („in 5 Tagen“), dann Uhrzeit · Ort wie deren Eckdaten, bei einer Schlüsselqualifikation die Pille „freiwillig“.
Unter der Karte nur noch die Beschreibung, die Quelle als leise Fußzeile (13 px, `--eba-muted`) und „Meine Notizen“ als Label
mit Stift wie „Mitschrift“. Was der Kopf zeigt, steht nicht noch einmal darunter: keine Karte „Eckdaten“, keine Datumszeile unter
dem Titel des Termins, keine Eigenschaften über dem Titel.

### Kopfleiste und Tabs
Der Name einer Seite steht in jedem Moment genau einmal auf dem Bildschirm, ab zwei Tabs dazu im Tab (seit 0.7.0,
`kopfleiste.js`, `eba-core.css` 70).
Bis 0.6.14 stand er auf dem iPad dreimal in den oberen 250 px: im Tab, in Obsidians Kopfleiste und als Titel (Rückmeldung vom
26.10.2026). Seitdem:

- **Titel im Text = der Name.** Der Titel einer Seite (auf dem Dashboard der Gruß), die eigene Überschrift `# …` am Anfang
  einer Notiz oder Obsidians Inline-Titel. Obsidians Kopfleiste zeigt den Namen nur, solange davon nichts zu sehen ist: oben nicht, nach dem Scrollen
  schon, beim Zurückscrollen wieder nicht (wie die großen Titel in iOS); auf iPad und PC trennt sie dann eine feine Linie
  vom Inhalt darunter. Ohne Titel im Text (PDF, Canvas, Bases, leerer Tab,
  Notiz ohne Titel oben) bleibt der Name in der Kopfleiste, immer ohne Obsidians Ordnerpfad (seit 26.10.2026; über einer PDF
  stand „Unterlagen / B110 Einführung in die … / Vorlesung / B110 Folien 00 Einführung“, jetzt nur der Dateiname wie bei
  Notizen). Auf dem iPhone blendet Obsidian ihn bei Notizen schon selbst aus, und dort bleibt er weg, auch gescrollt (seit 26.10.2026,
  Rückmeldung: „I don't like this pill“; bis dahin erschien er gescrollt auf einer Glasfläche über die ganze Breite, davor auf einer
  eigenen Kapsel neben dem runden Knopf).
- **Tabs erst ab dem zweiten** (wie Safari). Ein einzelner Tab nannte nur noch einmal den Namen. Ab zwei Tabs nennt der offene
  Tab die Seite und der Titel im Text auch, wie in Safari Tab und Überschrift der Seite: Ohne Namen ließen sich Tabs nicht
  unterscheiden, und ohne Titel sähe dieselbe Seite je nach Zahl der Tabs anders aus. Die Kopfleiste nennt ihn dann gar nicht,
  auch gescrollt nicht, denn er steht im offenen Tab.
- **Navigation bleibt vollständig:** Die Seiten stehen auf jedem Gerät im Menü hinter ≡ unten rechts, daneben das Zahnrad für
  Einstellungen & Hilfe, überall dieselben Symbole an derselben Stelle (seit 26.10.2026; vorher die Übersicht in der
  linken Seitenleiste, auf iPhone und iPad hinter ⎕ oben links): auf iPhone und iPad in Obsidians Leiste unten, auf beiden
  dieselben sieben Knöpfe: Zurück, Vor, Suche, „+“, Zahnrad, Tabs und ≡ (auf dem iPad seit 26.10.2026, Rückmeldung: „Move the arrows to
  the Bar down there the plus sign also. Same Icons as on iphone“, dann „Die gleichen 7 icons wie bei iphone in der Leiste auch bei
  ipad“; vorher Zurück, Vor und „+“ oben in der Zeile; beim Schreiben, wenn Obsidian die Leiste wegnimmt, stehen ‹ › auf dem iPad
  vorn in Obsidians Werkzeugleiste), am PC dieselben sieben in einer eigenen Leiste unten rechts in der Hauptfläche, neben
  einer offenen rechten Seitenleiste statt über ihr (seit 27.10.2026, Rückmeldung: „iPad und iPhone und pc die gleichen 7
  Symbole“; vorher dort nur Zahnrad und ≡). Tabs zeigt am PC Obsidians Menü der offenen Tabs über dem Knopf.
  iPad oben: eine Zeile, ab zwei Tabs mit den Tabs, rechts ggf. Lesen/Bearbeiten. Mit einem Tab steht auf Notizen des Plugins
  der Titel in ihr wie auf dem iPhone, sie ist durchsichtig, bis er weggescrollt ist (seit 26.10.2026, Rückmeldung: „Empty Space up
  top“), auf eigenen Notizen ebenso, solange Obsidian den Inline-Titel zeigt (seit 27.10.2026); ab dem zweiten Tab beginnt der Inhalt darunter, wie in Safari. Die Zeile ist eine, mit einem Tab wie mit mehreren (seit
  26.10.2026; vorher zerfiel sie mit dem zweiten Tab
  in zwei Zeilen auf einem Streifen in der Farbe der Tab-Leiste, „+“ sprang hinter die Tabs, der Titel rutschte nach unten). Die
  Statusleiste darüber hat die Farbe der Seite. Die Tabs sehen aus wie ein [Segmentschalter](#segmentschalter): eine Schiene in
  der Farbe einer Leiste, der offene mit Rahmen im Akzent auf der Fläche einer Karte, die anderen leise (ohne Schiene las sich ein
  Tab hinter ← →, die damals in der Zeile standen, wie ein Pfad). Ist die linke Seitenleiste angeheftet, setzt das Plugin ⎕ vorn in die Zeile, ein Tipp löst und
  schließt sie (Obsidians Befehl „Seitenleiste links umschalten“). iPhone: oben der Titel in der Zeile der Kopfleiste (seit
  26.10.2026; vorher darunter), beim Lesen wie beim Bearbeiten, rechts davon nur Lesen/Bearbeiten; in eigenen Notizen ebenso
  (seit 27.10.2026), nur eine mit Eigenschaften vor „# …“ behält beim Bearbeiten die Zeile darüber (die Eigenschaften zeigt
  Obsidian nur dort, oben in der Zeile lägen sie unter Lesen/Bearbeiten); gesperrte Seiten haben dort nichts und beginnen gleich unter
  der Statusleiste; ← →, Suche, „+“, Zahnrad (Einstellungen & Hilfe, seit
  26.10.2026), die Tabs und ≡ in der Leiste unten (Obsidian). PC: die Zeile mit Seitenleisten-Umschalter und Fensterknöpfen bleibt, nur der eine
  Tab fehlt; darunter die Kopfleiste mit Lesezeichen, „⋮“, Lesen/Bearbeiten und nach dem Scrollen dem Namen. Sie liegt wie auf
  dem iPad über dem Inhalt, durchsichtig, bis der Titel weggescrollt ist, auf Notizen des Plugins und eigenen Notizen mit
  Inline-Titel (seit 0.7.0, Rückmeldung vom 27.10.2026: „Ja wie auf dem ipad“; vorher stand sie als leeres Band über dem Titel).
  Der Titel beginnt mit Obsidians Abstand oben gleich unter ihren Knöpfen, beim Lesen wie beim Bearbeiten; mit geteilter
  Hauptfläche, in Popout-Fenstern und über PDFs steht sie, wie Obsidian sie zeigt. Die sieben Knöpfe
  unten rechts in der Hauptfläche über der Statusleiste (← → standen bis 27.10.2026 in der Kopfleiste, „+“ in der Zeile darüber). Mit zwei Tabs bleibt der PC, wie er ist: Die obere Zeile ist
  dort die Titelleiste des Fensters (Fensterknöpfe, Verschieben) und steht mit einem Tab genauso da, die Kopfleiste liegt mit
  einem wie mit mehreren über dem Inhalt, es springt also nichts.
  Neue Tabs: „+“, lange drücken auf einen Link, am PC Strg/⌘. Zurück: ‹, auf iPhone und iPad auch Wischen vom linken Rand
  (seit 26.10.2026, nur vom Rand seit 27.10.2026; vorher zog Wischen nach rechts überall Obsidians linke Seitenleiste
  auf, weiter innen tut es jetzt nichts), dabei rutscht ein Hinweis „Zurück“ (wie Obsidians, aber
  immer deutsch) von links herein. Herunterziehen oben auf einer Seite tut nichts (seit
  26.10.2026; öffnete oft aus Versehen Obsidians Befehlspalette). Ohne laufendes Plugin bleibt Obsidian, wie es ist.

Verworfen: **den Namen nur in der Leiste, kein Titel im Text** (der Titel trägt das Design, Display-Schrift je Design; in der
Leiste wäre er kleine Systemschrift, eigene Notizen zeigten in der Bearbeitung trotzdem den Inline-Titel, und Kürzel über dem
Modulnamen oder das Modul unter den Folien hätten dort keinen Platz) und **einen Pfad in der Leiste** („Übersicht › Module ›
B110“): so einen Pfad nahm 0.7.0 gerade weg, die Seiten liegen flach unter `Studium/`, und er wäre eine zweite Navigation
neben der Übersicht. Was ein Pfad Nützliches sagt, die Zugehörigkeit einer Notiz, steht im Label unter ihrem Titel. Die vier
Lesefassungen von Folien bis 19.10.2026 hatten als Titel den Namen des Moduls, welche Folien es sind, stand nur im Pfad darüber;
sie bekommen den Titel aller Begleitnotizen über einen Nachtrag (`nachtraege.js`, `folien-kopf`).

### PDF-Kasten
`> [!eba-pdf]- PDF (37 Seiten)` in Begleitnotizen: eine schlanke Karte, Kopfzeile als Label mit Seitenzahl, rechts leise Knöpfe
**Öffnen** (und **Original**) vor dem Pfeil. Die ganze Kopfzeile ist ein Knopf zum Auf- und Zuklappen, in beiden Ansichten (`pdfkasten.js`,
`eba-core.css` 28). Eine Höhe je Gerät, kein Größen-Schalter.

### Abschnitt
`##` gliedert eine Seite in Themen. Sein Aussehen bestimmt das Design (Elfenbein: Serif mit Linie darüber), auch in der
Bearbeitungsansicht: Regeln dafür nehmen `--eba-h2-linie`, `--eba-h2-weight` und `--eba-h2-size` (Werte je Design). Eine Karte direkt
darunter wiederholt den Abschnittsnamen nicht als Titel.

### Karte
`> [!eba-karte]` und Verwandte (`eba-tabelle`, `eba-termin`, `eba-regel` …): Rahmen `--eba-border`, `--eba-radius`,
`--eba-card-bg`, kein Schatten. Titel als Label, ohne Symbol; eine zugeklappte Karte (`-`) ist eine Zeile zum Antippen, ihr Titel
steht darum wie ein Zeilentitel (1em, 600, ohne Großbuchstaben; seit 0.7.0). Symbol (14 px) nur bei `eba-ort`, `eba-kontakt`,
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
- Titel in 600, dahinter höchstens zwei Pillen (wie bei der Pille). Darunter höchstens eine Metazeile.
- Rechts genau eins: ein Knopf, ein Pfeil (öffnet etwas), ein Wert (Note, Datum) oder ein Haken (gewählt).
- **Mit Rahmen** für Listen, in denen man etwas tut (Einstellungen, Verbindungen, Variante, Hilfe, Übungsgruppen, Karten
  eines Stapels). **Ohne Rahmen**,
  nur mit Haarlinien, für Leselisten unter einem Gruppenlabel (Unterlagen, Vorlesungen der Modulseite, „Als Nächstes“, Agenda).
- Gruppen: Label in `--eba-accent-text` über der Gruppe (ohne Rahmen) oder als Band in `--eba-surface-2` (mit Rahmen).
- iPhone: Der Text bekommt mindestens 150 px, der Knopf bleibt daneben rechts (Titel und Pille dürfen dafür zwei Zeilen
  haben). Erst ein Knopf, der dann nicht mehr passt, rutscht unter den Text, rechtsbündig. Keine Erklärsätze über einer
  Zeilenliste: Was eine Zeile bedeutet, sagt ihre Metazeile oder das Fenster hinter ihrem Knopf.

**Kompakte Zeile** (`.eba-ez`, seit 24.10.2026): für Einstellungen (Deine Angaben, Verbindungen, Variante, Hilfe), auf allen
Geräten gleich, so dicht wie die Einstellungen von iPhone und iPad.

```
┌──────────────────────────────────────────────────────────────┐
│ (◯)  Titel                                    Eintragen   ›  │
├──────────────────────────────────────────────────────────────┤
│ (◯)  Titel                                    Verbunden   ›  │
│      Was die Sache tut, in wenigen Wörtern                   │
├──────────────────────────────────────────────────────────────┤
│ (◯)  Titel                                       Fehler   ›  │
│      Das Problem in einem Satz                               │
└──────────────────────────────────────────────────────────────┘
```

- 44 px hoch, Titel in 500, rechts ein kurzer Stand gedämpft und der Pfeil. Unter Verbindungen etwa „Verbunden“, „An“,
  „Aus“, „Aktuell“, „Neue Version“, „Fehler“; unter Deine Angaben der Wert oder „Eintragen“. Im Akzent nur, wenn etwas auf dich wartet („Starten“, „Neue Version“), in `--eba-warn` bei einem
  Problem.
- Die ganze Zeile ist der Knopf: Sie öffnet das Fenster, und dort steht, was vorher als Knopf in der Zeile stand.
- Eine zweite Zeile nur, wenn sie etwas Neues sagt (ein Problem, übersprungene Schritte, was aus der gewählten Variante folgt).
  Unter Verbindungen steht sie immer (seit 24.10.2026): was die Sache tut, kurz (etwa 40 Zeichen passen auch mit großer Schrift
  auf dem iPhone in eine Zeile; länger darf sie umbrechen, wenn sie sonst nicht klar ist); bei einem Problem steht dort
  stattdessen das Problem. Ohne Vorwissen
  sagen Namen wie „Zentrale Daten“ oder „Eigener Server“ allein nicht, wozu sie da sind.
- Das Symbol zeigt unter Verbindungen die Sache (Schlüssel, PDF mit Lupe, Gebäude, Funken, Server, Pfeile im Kreis) in der
  Farbe ihres Stands: `--eba-good` verbunden oder an, Akzent wenn etwas wartet, `--eba-warn` bei einem Problem, sonst gedämpft.
- Der Stand steht rechts, wie der Pfeil senkrecht in der Mitte der Zeile, auch neben einer zweiten Zeile (seit 27.10.2026,
  Rückmeldung: „Not all verticaly in the middle of their row“; bis dahin oben auf der Höhe des Titels); jede Zeile hat dieselbe
  Gestalt. Die zweite Zeile reicht dafür nur bis vor den Stand. Der Text richtet sich nicht nach dem Platz, die Zeile passt sich
  an: Wird es eng, bricht erst der Titel um, dann der Stand (rechtsbündig, höchstens 60 % der
  Breite); gekürzt wird nichts. Bis 0.6.14 mussten Name und Stand zusammen in 24 Zeichen passen, sonst kürzte der Stand mit
  „…“; bis 24.10.2026 rutschte ein langer Stand in eine eigene Zeile zwischen Titel und Satz, das sah zerrissen aus.

### Kachel und Kennzahl
`> [!eba-kennzahlen]`: so viele Kacheln, wie die Seite Kennzahlen hat, die man dort auf einen Blick braucht; keine feste
Obergrenze (bis 26.10.2026 „höchstens vier“, die Startseite zeigte damit zu wenig). Was zusammengehört, steht in einer Reihe;
wird sie zu schmal, bricht sie um (Abschnitt 60). Label, Wert (Kennzahl), höchstens eine Unterzeile mit neuer Information, optional
ein Balken (`--eba-bar-h`). Den Akzent trägt nur eine Kachel, bei der etwas auf dich wartet: auf dem Dashboard „Nächste
Frist“ in der Farbe der Fristen (`--eba-warn`), unter Übungen „Offen“, solange ein Blatt offen ist. Bis 0.6.14 trug ihn immer
die erste Kachel, auch „Gesamtnote“ und „Unterlagen“, also nach Platz statt nach Bedeutung.
iPhone (unter 480 px Kartenbreite): Auf dem Dashboard steht der Balken rechts in der Label-Zeile, so spart die Kachel eine
Zeile; Gruß und Datum teilen sich eine Zeile, das Datum zweizeilig rechts (`eba-core.css` 37.dashboard). Das Datum der Frist
bleibt unter ihrem Titel: rechts in der Label-Zeile stünde es direkt unter dem Datum des Kopfs.

### Knöpfe

| Stufe | Aussehen | Wann |
|---|---|---|
| Haupt | Fläche `--eba-accent`, Schrift `--text-on-accent` | die eine Handlung eines Fensters oder Abschnitts („Weiter“, „Verbinden“, „Neue Vorlesungsnotiz“) |
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
  (`eba-core.css` Abschnitt 43, für `.eba-modal` und das Eingabefenster `.sa-eingabe`).
- Symbole in Knöpfen nur, wenn alle Knöpfe der Reihe eins haben.
- **Knopfkacheln** (`> [!eba-neu]`, Seitenanfang): Symbol in getöntem Feld + Titel; auf dem iPhone zwei je Reihe. Titel
  trennen nie, sie brechen nur an Leerzeichen (Abschnitt „iPhone und iPad“).
- **Link-Kacheln** (`> [!eba-links]`, Kontakte & Links): Symbol, Titel, höchstens zwei Zeilen Untertitel, beides als ein Block
  mittig in der Kachel; Spalten ab 250 px. Jedes Ziel hat sein eigenes Lucide-Symbol, gewählt nach der Adresse
  (`eba-core.css` Abschnitt 6): Sammelregeln (etwa alle Seiten des Fachbereichs) stehen vorn, genauere dahinter, denn bei
  gleicher Spezifität gewinnt die letzte. Bis 0.6.14 trugen zehn Kacheln dasselbe Gebäude.

### Pille
`.eba-pill` mit Ton `ok`, `warn`, `bad`, `info`, `akzent` oder `leer`: 12 px, runde Enden, Punkt vorn (Ring bei `leer`). Nur
für Zustände, höchstens zwei je Zeile. Steht in jeder Zeile derselbe Wert, gehört er in den Gruppenkopf, nicht in die Pille.
**Wahlpille** (`.eba-mod-status`, `.eba-vorl-status`): Pille mit Pfeil, öffnet ein Menü; für einen Status, den man selbst setzt.

### Ausnahme im Stundenplan
Fällt eine Lehrveranstaltung aus oder findet sie an einem Tag in einem anderen Raum oder zu einer anderen Zeit statt, muss man es
sofort sehen, ohne dass der Rest laut wird: Fläche `--eba-warn` 12 %, Kante links 3 px in `--eba-warn`, ein kurzer Text in
Warnfarbe („Fällt aus“) bzw. der neue Wert in Warnfarbe, der übliche mit „statt“ durchgestrichen daneben („Hörsaal 9 statt
~~Hörsaal 1~~“), wo Platz ist; im Tooltip „Anderer Raum“, „Neuer Raum“, „Andere Zeit“, „Geändert“. Bei einem Ausfall ist der Name durchgestrichen.
Keine Symbole. Ein Ausfall wegen einer Pause oder eines freien Tags ist keine Ausnahme: neutrale Fläche, „Fällt aus“ gedämpft.
Nie blass (`opacity`): Blass heißt „beginnt erst“. Im schmalen Raster (iPhone hochkant) stehen Fläche, Kante und das kurze
Wort („Fällt aus“, „statt“) wie im breiten (`eba-core.css` Abschnitt 55). Fläche und Kante der Ausnahme ersetzen die
[Farbe des Moduls](#farben); darum ist kein Modul bernsteinfarben.

### Segmentschalter
`.eba-ds`: zwei bis vier Möglichkeiten nebeneinander, eine gewählt (Hell · Dunkel · Automatisch). Ohne Untertexte. Die Wahl
im Akzent (Rahmen Akzent 45 %, Schrift `--eba-accent-text`, 600), die anderen in `--eba-muted`, 500 (seit 0.7.0; vorher
unterschied nur eine hellere Fläche die Wahl).

### Auswahl aus Zeilen
Je Möglichkeit eine kompakte Zeile: gewählt mit Haken rechts und darunter, was daraus folgt; die anderen wählt ein Tipp auf
die Zeile (Variante, seit 24.10.2026; vorher Pille „gewählt“ und Knopf „Wählen“).
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
eine leere Tabelle mit Spaltenköpfen. In Notizen gilt: Ein Abschnitt ohne Inhalt erscheint nicht, kein einsamer Punkt und kein leeres
Kästchen (`kopf.js`, `eba-core.css` 64.4); eine leere Liste auf der Modulseite fällt samt Überschrift weg (37.modul).

### Schloss-Karte
`eba-schloss`: gestrichelter Rahmen, rundes Schloss-Symbol, Titel und ein Satz, ein Empfohlen-Knopf („ILIAS verbinden“). Steht
statt eines Inhalts, der eine Verbindung braucht.

### Fenster
`.eba-modal`: Titel, höchstens ein Satz (`.eba-modal-text`), Inhalt, Knopfreihe. Breite bis 560 px, auf dem iPhone fast die
ganze Breite (Einrichtung und Lernen: ganzer Bildschirm; „Neue Version“: von unten, so hoch wie der Inhalt). Schritte als
nummerierte Liste, Bedienelemente **fett** wie in der App beschriftet. Rangfolge sichtbar machen, nicht alles gleich laut: Was
du noch tun musst, steht über dem Inhalt; Beruhigendes und Nachschlagbares (Sicherung, andere Geräte, Fehlergrund) klein und
leise im Fuß über den Knöpfen. Ein Vorgang, ein Fenster: Fortschritt und Ergebnis erscheinen im Fenster, das ihn gestartet hat,
nicht als Hinweis daneben (Vorbild: Fenster „Neue Version“, `eba-core.css` Abschnitt 51). Fenster schweben: Rahmen und Rundung
wie Karten, dazu `--eba-shadow-schwebend`.

### Hinweis
Obsidians Hinweis (`Notice`), immer über `ctx.hinweis(text, { aktion })`: nur als Antwort auf eine Handlung oder bei einem
Fehler. Regeln für den Text unter [Sprache](#sprache) → „Hinweise“. Ein nächster Schritt als Knopf (`aktion`) hat die Gestalt
des Update-Hinweises (`.eba-toast`).

### Rundgang
Zeigt nach einer großen Änderung einmal je Gerät, wo etwas jetzt ist (`rundgang.js`, `eba-core.css` 71; seit 27.10.2026 für die
Navigation). Alles außer dem Ziel blendet zur Farbe der Seite hin ab, um das Ziel liegt ein Ring im Akzent, daneben eine Blase wie
ein [Fenster](#fenster) (Fläche einer Karte, Rahmen, Rundung, `--eba-shadow-schwebend`) mit einer Spitze zum Ziel. In der Blase ein
Satz (Beschriftungen der App **fett**), darunter leise „1 von 3“ und der Hauptknopf **Weiter**, zuletzt **Fertig**; keine
Überschrift, kein Symbol, kein **Überspringen** (ein Tipp auf die Blase geht weiter, daneben tut ein Tipp nichts, Esc schließt). Ein Ziel am Rand (Wischen) ist
ein Streifen in Akzent-Tönung, am Rand gerade, innen rund, mit Pfeil. Höchstens drei Schritte. Bewegung (Ring gleitet, Pfeil)
nur ohne „Bewegung reduzieren“.

### Tabellen
Markdown-Tabellen nur für Nachschlage-Inhalt (Regeln, Steckbrief): Spaltenköpfe als Label, nur waagerechte Haarlinien, Zahlen
tabellarisch. Bases-Tabellen sind Datenquelle: `tabellen.js` zeichnet sie als Zeilenliste (`--eba-tliste: 1`), Spaltenköpfe
ohne Symbole, keine Werkzeugleiste, nur zum Lesen (seit 0.4.6 überall, auf allen Geräten, `eba-core.css` 37.tabellen; ändern im
Modulfeld und im Kopf der Notiz, architektur/bedien-bausteine.md). Die Listen „Fristen“, „Termine“ (Dashboard und **Prüfungen**) zeichnet
`dashboard.js` als Zeilen (```` ```eba-liste ````, eba-core.css Abschnitt 63), übrige Listenansichten von Bases Obsidian selbst.

## Daten, Zahlen und Links

Im Code setzen `ctx.modell.zeit` (`datum`, `kurz`, `spanne`, `abstand`, `plural`) und `ctx.modell.statusArt` diese Regeln und
die Statusfarben oben um (architektur/modell.md, „Fachmodell“); kein Skript formatiert ein Datum oder wählt eine Statusfarbe selbst.

- **Datum in Zeilen:** „Mo 19.10.“. Jahr nur, wenn es nicht im laufenden Studienjahr liegt: „06.02.2028“.
- **Spannen:** im selben Monat „19.–25.10.“, sonst „12.10. – 06.02.“; Uhrzeit „10:00–12:00“.
- **Abstand:** „heute“, „morgen“, „in 5 Tagen“ hinter dem Datum, mit „ · “ getrennt.
- **„ · “** trennt nur kurze Angaben in einer Zeile (Datum · Abstand, Art · Modul · Tag, Eckdaten). Mehrere Personen, Orte oder
  Sätze stehen je in einer eigenen Zeile oder mit Komma, nie als lange Kette mit „ · “.
- **Im Kopf einer einzelnen Notiz** darf der Wochentag ausgeschrieben sein: „Donnerstag, 15.10.“.
- **Zahlen:** „6 ECTS“, Noten mit Komma („2,3“), „34 %“ mit Leerzeichen; Spalten mit `tabular-nums`.
- **Links:** `--eba-accent-text`, ohne Unterstrich, unterstrichen beim Zeigen; in Elfenbein immer mit feiner Linie (Tinte liegt
  nah an der Textfarbe). Verweis auf eine andere Seite als eigene Zeile
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
| **Neue Version installieren** (Update der App); **Nach Updates suchen** (sofort nachsehen); **Update fertigstellen** (ein abgebrochenes Update zu Ende bringen) | „Aktualisieren“, „Studium Autopilot aktualisieren“ | „Aktualisieren“ heißt schon: Daten holen |
| **Lehrveranstaltung** (Eintrag im Stundenplan: Vorlesung, Übung, Tutorium) | „Stundenplan-Eintrag“, „Veranstaltung“ für den Stundenplan | **Veranstaltung** nur für Events: Party, Vortrag, Fachschaft |
| **ECTS** | „CP“, „Credits“, „Leistungspunkte“ | so heißen sie in Alma und in der Prüfungsordnung |
| **Prüfung**; **Prüfungsphase** mit Haupttermin und Nachholtermin | „Klausurtermin“, „Prüfungstermin“, „Klausurphase“, „Prüfungszeitraum“ | „Klausur“ nur als Form der Prüfung („Klausur 90 min“) |
| **1. Fachsemester**, wo es eng ist **1. FS** | „FS 1“ | eine Schreibweise |
| **Gesamtnote**, **Zielnote** | „Notenschnitt“, „Wunsch-Schnitt“, „Wunschnote“ | dieselbe Zahl heißt überall gleich |
| **Übungsgruppe**, kurz **Gruppe 4** | „Gr. 4“ | keine Abkürzungen |
| **angemeldet**: für eine Prüfung oder einen Kurs (grün) | „angemeldet“ für ILIAS, Alma oder die Übungsgruppe | ein Wort, eine Bedeutung |
| **verbunden**, **neu verbinden** (ILIAS, Alma) | „Anmeldung prüfen“, „Anmeldung abgelehnt“, „Melde mich an“ | „Anmeldung“ heißt: für eine Prüfung oder einen Kurs |
| **Passwort** | „Kennwort“ | ein Wort |
| **Uni-Login** (Benutzername und Passwort der Uni, gilt für ILIAS und Alma; seit 0.4.8) | „Uni-Zugang“, „Zugangsdaten“ | ein Login für alles, ein Wort dafür |
| **## Meine Notizen** (dein Text in einer Notiz); **Zum Modul** (die Liste der Notizen auf der Modulseite) | „## Notizen“, „Meine Notizen“ als Liste | dein Text steht in jeder Notiz unter derselben Überschrift und bleibt dort |
| **vorlesungsfrei**; benannte Pausen **Weihnachtspause**, **Pfingstpause** | „Ferien“, „Pfingstferien“ | so sagt es die Uni |
| **Stundenplan** (Seite), **Woche** (Raster auf Dashboard und Stundenplan) | „Wochenplan“, „Wochenraster“, „Wochenansicht“ | ein Name je Ansicht |
| **Übersicht** (alle Seiten, das Menü hinter ≡); **Teil** (Grundstudium, Profil & Vertiefung …); **Schwerpunktbereich** | „Bereiche-Menü“, „Bereich“ für einen Teil | „Bereich“ nur für Schwerpunkte |
| **Deine Angaben** (leer: **Eintragen**); **Obsidian-Einstellungen** für Obsidians eigene | „Personalisieren“, „Einstellungen →“ für Obsidians | wie die Überschrift in der App; Obsidians Einstellungen sind andere |
| **Tresor**, einmal erklärt: „(in Obsidian: Vault)“ | „Vault“ | deutsch wie der Rest |
| **Termin folgt** (Datum fehlt noch) | „noch kein Termin“ | ein Satz für denselben Zustand |
| **mit Unterlagen**, **ohne Unterlagen**, **handschriftliches A4-Blatt** | „open book“, „closed book“, „Cheat-Sheet“ | ohne Jargon |
| **Vorlesungsnotiz** (deine Mitschrift zu einer Vorlesung), in Listen und im Kopf **Vorlesung 1 · Mo 13.10. · Thema** (`ctx.modell.vorlesung`) | „VL“, „VL 01“ | keine Abkürzungen; „VL 01“ bleibt nur im Dateinamen, damit Links gültig bleiben |
| **Design** ohne Namen; **Design 1**, **Design 2**, **Design 3** nur für Vorlesesoftware und die Auswahl des Befehls **Design wählen** | „Elfenbein“, „Paper Elfenbein“, „Flieder“, „Klar“ | Designs haben keine Namen, die Vorschau-Kacheln zeigen sie; die Namen gibt es nur in Code und CSS (`eba-design-flieder`) |

### Knöpfe und Befehle

- Ein Knopf heißt wie sein Befehl in der Befehlspalette: **Neue Vorlesungsnotiz**, **Unterlagen hinzufügen**,
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
- Fortschritt: das Verb vorn, „…“ am Ende („Ordne 3 Unterlagen ein …“), mit `dauer: 0`; danach
  `setMessage` und `hide` an der zurückgegebenen Notice.

## iPhone und iPad

- Breiten nur über `body.is-phone` (Seitenebene) oder Container-Abfragen (`@container … (max-width: 480px)`). `@media` mit
  Breite oder Höhe nur zusammen mit `body.is-phone`: Obsidian nimmt die Telefon-Ansicht, sobald Breite oder Höhe des Fensters
  unter 600 px liegt, also auch im geteilten iPad-Fenster (1376 × 500) und auf dem iPhone quer, und zeigt dort eine Notiz über
  das ganze Fenster. Ab 600 px Breite gilt dort die Breite wie auf dem iPad (`eba-core.css` 37.tablet 1b); unter 600 px Höhe
  rückt der Kopf der Vorlesungsnotiz in drei Zeilen zusammen, damit die Mitschrift ohne Scrollen zu sehen ist
  (37.vorlesung 3b); auf dem Dashboard stehen dort Gruß und Datum in einer Zeile, der Gruß in Kennzahlgröße. Ein breites,
  flaches Fenster bleibt sonst in der Telefon-Ansicht: Karten richten sich nach ihrer Breite.
- iPhone: Was nicht täglich gebraucht wird, ist zu (`|handy-zu`). Raster werden einspaltig, Kacheln zweispaltig, Knopfkacheln
  zwei je Reihe. Der Stundenplan bleibt auch dort ein Raster aus fünf Tagen (Rückmeldung vom 26.10.2026: immer ein Raster), schmal mit Kurzname und gekürztem Raum („HS 1“); vom
  19. bis 24.10.2026 zeigte das Dashboard stattdessen einen Tag als Liste, eine zweite Ansicht, für die Woche brauchte es eine
  eigene Seite.
- Fristen, Termine, Nachzuarbeiten und To-dos stehen auf dem Dashboard auf jedem Gerät als eine Reihe Reiter in einer Karte,
  ein Tipp zeigt eine Liste (`reiter=Name`, architektur/seiten.md „Dashboard“). Auf iPad und PC ist beim ersten Öffnen der
  Reiter mit `reiter-offen` offen (Dashboard: Fristen; seit 0.7.0, vorher keiner, die Startseite wirkte leer), auf dem iPhone
  keiner. Ebenso auf **Termine & Anmeldungen** (seit
  0.7.0) Später, Vergangen, Anmeldungen und Übungen unter der Woche: Eine Seite ist so höchstens etwa zwei Bildschirme lang,
  und nichts ist mehr als einen Tipp entfernt. Am Reiter steht klein die Zahl der Einträge, bei 0
  nichts. Jeder Reiter ist ein leicht gefüllter Knopf mit Pfeil nach unten, der offene mit Pfeil nach oben: Ohne das sah die
  Reihe nicht aufklappbar aus. Um den offenen Knopf und seine Liste läuft ein Rahmen in der Akzentfarbe wie bei einem
  Karteireiter, unter dem Knopf ohne Linie; vorher war der offene nur getönt, und zu welchem Knopf die Liste gehört, sah man nicht.
- Oben steht auf jedem Gerät nur Navigation, der Name der Seite steht im Titel (Baustein [Kopfleiste und Tabs](#kopfleiste-und-tabs)):
  iPad eine Zeile mit den Tabs ab dem zweiten, iPhone die schwebenden Knöpfe, am PC die Zeile mit den Fensterknöpfen; die
  Seiten auf jedem Gerät hinter ≡ unten rechts, die Einstellungen am Zahnrad daneben, auf iPhone und iPad in einer Leiste mit Zurück, Vor, Suche, „+“ und Tabs.
  Notizen sind auf dem iPad eine Spalte von 52rem links bündig mit den Seiten (Abschnitt „Form, Schrift und Abstände“, Breite).
- Wörter brechen nie mitten im Wort (kein `overflow-wrap: anywhere`). Silbentrennung (`hyphens: auto`) nur in Fließtext;
  Skripte setzen dafür `lang="de"` an ihren Container. In Markdown gilt die Sprache der Obsidian-Oberfläche (Obsidian setzt
  `lang` danach): Mit englischer Oberfläche trennt Safari deutsche Wörter nach englischen Regeln („Vorlesung-snotiz“).
- Knöpfe, Knopf- und Link-Kacheln und Kartentitel, die man antippt, trennen nie (`hyphens: manual`): Sie brechen nur an
  Leerzeichen („Neue / Vorlesungsnotiz“) und an weichen Trennstrichen (U+00AD) im Text. Passt ein Wort bei 360 px nicht,
  wird die Schrift etwas kleiner oder die Reihe hat weniger Knöpfe (Container-Abfrage).
- Die Bearbeitungsansicht (Live Preview) muss aussehen wie die Leseansicht (`eba-core.css` 36c).
- Einen leeren Block nie mit `display: none` auf dem Abschnitt ausblenden, sondern auf Höhe 0 falten (architektur.md, „Regeln
  für Skript-Autoren“).
- CSS muss in Safari 16 laufen (iPhone und iPad mit iOS 16): kein CSS-Nesting, keine Stilabfragen in `@container`;
  `color-mix()` gibt es erst ab Safari 16.2.

## Prüfen vor dem Pull Request

1. Nur Variablen aus diesem Dokument, keine festen Farben, Schriftgrößen aus den Stufen.
2. Ansehen in Elfenbein hell und dunkel, Flieder und Klar.
3. Ansehen in iPhone-Breite (390 px), iPad-Breite (820 px) und im flachen Fenster (1376 × 500, iPhone quer 844 × 390), in
   Lese- und Bearbeitungsansicht.
4. Gibt es den Baustein schon? Dann ihn nehmen, keine neue Klasse mit ähnlichem Aussehen.
5. Neue CSS-Regeln in den Abschnitt des Bausteins in `eba-core.css`, seitenbezogene in Abschnitt 37 mit `eba-s-<seite>`.
6. `npm test`: `tests/design.test.js` (Design-Wächter) prüft, was sich ohne Obsidian prüfen lässt: feste Farben, Schatten,
   Symbole der Karten (Schatten nur über `--eba-shadow…`), `@media` nur mit `body.is-phone`, Safari 16, und hält Schriftgrößen, Knopf-Klassen und Zeichen-Symbole auf dem Stand
   vom 18.10.2026 oder darunter. Ein neuer Wert dort heißt fast immer: einen vorhandenen nehmen.
