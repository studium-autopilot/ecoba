# Architektur: Seiten

Teil der Architektur-Doku. Aufbau, `ctx`, Skripttypen und die Regeln für Skript-Autoren stehen im Überblick
[architektur.md](../architektur.md).

## Seit deinem letzten Besuch (seit 0.6.0, `seit-besuch.js`)

Karte auf dem Dashboard (Codeblock `eba-seit-besuch`, direkt unter dem Update-Hinweis): „3 Änderungen seit deinem letzten
Besuch“, eingeklappt, ein Tipp klappt auf (Zustand je Gerät, bleibt beim Neuzeichnen). Sie zeigt nur, was sich **von selbst**
geändert hat, je Zeile „Titel · was anders ist“ mit Ziel zum Antippen, unten **Alles gesehen**. Ohne Änderungen bleibt der
Block leer (`.eba-sb-aus`) und samt Hülle auf Höhe 0 gefaltet wie „Bitte prüfen“ (eba-core.css Abschnitt 68). Eine Karte statt
einer eigenen Seite: Was neu ist, gehört dahin, wo man ohnehin zuerst hinschaut, und verschwindet, wenn es nichts gibt.

- **Gesehen von selbst** (seit 0.6.2): Was aufgeklappt in der Karte stand, gilt nach dem Besuch als gesehen. Die Schlüssel merkt
  sich das Gerät beim Aufklappen (und beim Neuzeichnen, solange die Karte offen ist) im Gerätespeicher (`app.saveLocalStorage`
  „eba-seit-besuch-angezeigt“, übersteht einen Neustart) und trägt sie in die Datei `gesehen-…` ein, sobald der Block neu
  gezeichnet wird (Dashboard wieder geöffnet), Obsidian in den Hintergrund geht (`visibilitychange`) oder ein Tab ohne die
  Karte aktiv wird (`active-leaf-change`). Danach ist die Karte wieder eingeklappt. Während des Besuchs bleiben die Zeilen
  stehen; nur eingeklappt Gesehenes zählt nicht. Vorher blieb jede Zeile, bis jemand **Alles gesehen** in der eingeklappten
  Karte fand (so stand ein Raumwechsel tagelang da); der Knopf bleibt als Abkürzung und trägt das Gemerkte mit ein.

- **Zentrale Termine** (Protokoll): Nur hier geht der alte Wert beim Schreiben verloren. `termineAnwenden` in `zentral.js`
  meldet im Bericht (`seitBesuch`) neu angelegte, geänderte (Text der Notiz anders, alte Werte aus dem Frontmatter davor) und
  abgesagte Termine; `abrufenIntern` gibt sie mit `erster` (noch nichts angewendet) und den ids des letzten Abrufs (`altIds`,
  aus dem Gerätespeicher vor dem Überschreiben) an `ctx.seitBesuch.zentral`. Daraus werden Einträge: „Neu“ nur für ids, die im
  letzten Abruf fehlten (nicht, was nur durch deine Auswahl dazukommt), „geändert“ nur bei Datum, Ende, Ort mit Uhrzeit, Titel
  oder „geschätzt“ → „offiziell“, „findet wieder statt“ nach „(entfällt)“ und „entfällt“. Nie: Termine, die schon vorbei sind
  (beim Schreiben und beim Zeichnen der Karte, `zusammenstellen` mit `heute`: eine Meldung von gestern verschwindet, sobald
  ihr Termin vorbei ist), der erste Abruf eines Tresors, eine Übergabe aus dem eigenen Abgleich, Quelle, Info, Tags. Höchstens 30 je Abruf, dann eine
  Sammelzeile zu Termine & Anmeldungen. Der Schlüssel enthält alten und neuen Stand, und je Termin zeigt die Karte nur die
  neueste Meldung: Wird ein Termin verschoben und wieder zurückverlegt, steht der Stand von jetzt da, nicht der von vorhin.
- **Abgeleitet**, ohne Protokoll und ohne zweiten Schreiber: Ausfälle, Raum- und Zeitänderungen deines Stundenplans in den
  nächsten 14 Tagen (`ctx.modell.findetStatt`, wie das Wochenraster; besuchte Veranstaltungen), offene Abgaben aus dem
  ILIAS-Kalender, die noch kommen, und neue oder aktualisierte ILIAS-Dateien der letzten 30 Tage aus `System/Daten/ilias.json`
  (je Modul eine Zeile, Ziel die Modulnotiz; ohne die Dateien vom ersten Tag eines Kurses, das erste Laden ist keine Änderung).
  Ein Raumwechsel, der schon gilt, heißt „Neuer Raum seit <raum_seit>“, einer, der noch kommt, „ab <nächste Sitzung>“.
- **Speicher** `System/Daten/seit-besuch/` (synchronisiert): `<Geräte-ID>.json` mit den Einträgen dieses Geräts (jedes Gerät
  schreibt nur seine Datei, die Karte liest alle; gleiche Änderung = gleicher Schlüssel; 60 Tage, höchstens 500) und
  `gesehen-<Geräte-ID>.json` mit den Schlüsseln, die aufgeklappt angezeigt waren (je Gerät geschrieben,
  gelesen als Vereinigung aller, gilt also auf allen Geräten; 180 Tage). Nie eine
  Uhrzeit „gesehen bis“: Ein Eintrag, der erst später per Sync ankommt, wäre sonst verborgen. Kein Pfad im Protokoll, das Ziel
  wird beim Zeichnen über `zentral_id` aufgelöst. Der Ordner ist persönlich: nicht im Release, nicht in Updates, Fund in
  `pruefen.py`.
- **Neu gezeichnet** nach `ctx.modell.beiAenderung`, bei Änderungen im Ordner und an `ilias.json` und alle 15 Minuten (Mitternacht).
- **Tests:** `tests/seit-besuch.test.js` (reine Funktionen, Karte, Dashboard), `tests/zentral.test.js` (Meldungen des Abrufers).

## Übersichtsseiten nur in der Leseansicht

Begleitnotizen (`typ: unterlage`, auch Folien als Markdown) und Volltexte öffnen seit 19.10.2026 in der Leseansicht, ohne Sperre
(`ctx.leseansicht.zuerstLesen`, im Kern `notizOeffnen`; `ansicht: bearbeiten` geht vor): Sie sind zum Lesen da, das Buch oben schaltet
zum Bearbeiten. Vorher öffneten sie in der Bearbeitungsansicht, wo ein Tipp auf den PDF-Kasten in den Quelltext sprang.

Seit 17.10.2026 (`start.js`, Punkt 2): Notizen mit `typ` `dashboard`, `übersicht`, `einstellungen` oder `daten` bleiben in der
Leseansicht (auch `Studium/Termine & Anmeldungen.md`, seit die Anmeldungen sich selbst füllen). Das Feld `ansicht` geht vor (`lesen`
sperrt jede Notiz, `bearbeiten` gibt sie frei; in der Seitenleiste „Eigenschaften“ auch bei gesperrter Notiz änderbar). Der Knopf
zum Bearbeiten im Kopf der Ansicht (`view.modeButtonEl`) ist dort ausgeblendet; wer umschaltet (Strg/⌘ E, Befehl), landet mit
Hinweis wieder in der Leseansicht. Geht ein Tab von einer gesperrten Seite zu einer freien Notiz, öffnet sie in der Bearbeitung
(seit 0.4.6; vorher nur, wenn der Tab vorher eine Notiz bearbeitet hatte). Regel: `ctx.leseansicht.nurLesen(datei)`
(`tests/leseansicht.test.js`); `ctx.oeffnen` nutzt dieselbe Regel (siehe [„Bedien-Bausteine“](bedien-bausteine.md)).

Stil aller neuen Teile: `eba-core.css` Abschnitte 43 (Personalisieren, Schloss, Verbindungen, Fenster, Semestertermine),
44 (Musterpläne) und 45 (Einrichtung), nur mit `--eba-*`-Farbtokens (hell und dunkel).

## Dashboard (Regeln seit 18.10.2026)

- **Kacheln** (seit 18.10.2026 Codeblock ```` ```eba-kacheln ```` aus `dashboard.js` auf dem Fachmodell, vorher eine
  Bases-Formel; gleiche Klassen und Gestalt): Gruß und Datum (ohne „KW n“, die steht im Wochenraster), dann immer zuerst
  „Nächste Frist“ (Klassen `akzent frist`: breiter, getönt, Titel groß; eba-core.css Abschnitt 60), danach Nächste Prüfung
  (`naechstePruefung`), Semester, ECTS (`ects`), Gesamtnote (`noten`) und die Leiste „Semesterverlauf“ (Woche „jetzt“ =
  Planwoche; die Legende nennt sie am Wochenende „nächste Woche“ wie die Leiste über dem Wochenraster, sonst „diese
  Woche“). Nächste Frist = `ctx.modell.fristen()[0]`: offene Fristen, die noch laufen oder kommen, nach dem nächsten
  Stichtag (läuft schon: Ende, sonst Beginn); Unterzeile „läuft · bis 25.10.“ bzw. „19.10. · morgen“, dazu „geschätzt“.
  Prüfungen zeigt die Kachel daneben, darum hier nur Fristen. Breit eine Reihe; bis 980 px die Frist über die ganze Breite
  und die vier darunter (zu fünft wären sie auf dem iPad hochkant nur 123 px breit), bis 760 px 2 × 2. Vom 15. bis
  18.10.2026 fehlte die Kachel („Keine Dopplungen“). Tests: `tests/dashboard.test.js`.
- **Fristen · 30 Tage** und **Termine · 14 Tage** (seit 18.10.2026 ```` ```eba-liste fristen ```` bzw. `termine` aus
  `dashboard.js`, vorher Bases; Zeilen „Wann · Was · Art“, eba-core.css Abschnitt 63): Fristen, Prüfungen samt Zwischentests
  und Abgaben der nächsten 30 Tage nach dem Tag, den die Zeile zeigt (läuft: Ende), höchstens 6; Termine aller Kategorien
  außer Frist und Prüfung für 14 Tage, Fachschaft und Veranstaltung nur heute und morgen (sonst fehlte die
  Semestereröffnung am selben Abend), nach Tag und Uhrzeit, höchstens 8. Welche Liste ein Block zeigt, sagt zuerst sein
  Ersatztext („Fristen erscheinen …“): In verschachtelten Karten liefert Obsidian den Abschnitt der äußeren Karte mit beiden
  Kopfzeilen. Die Seite Prüfungen zeigt ```` ```eba-liste pruefungen ```` (kommende Prüfungen, auch aus dem Modulfeld).
- **Nachzuarbeiten** (seit 19.10.2026 ```` ```eba-liste nachzuarbeiten ```` aus `dashboard.js`, vorher Bases mit dem Dateinamen):
  Vorlesungsnotizen ohne Haken bei Nachgearbeitet, älteste zuerst, höchstens 8; links das Modul (`kurz`, sonst Kürzel), dann der
  Name aus `ctx.modell.vorlesung`. Neu gezeichnet, wenn sich eine Vorlesungsnotiz ändert oder umbenannt wird (seit 24.10.2026;
  vorher zeigten die Links bis zu 10 Minuten auf den alten Namen). `Vorlesungen/` steht bewusst nicht in `RELEVANT` des Modells:
  Jede Änderung beim Mitschreiben zeichnete sonst alle Bildschirme neu, die `beiAenderung` hören. Leer: „Nichts offen.“.
- **Übungen** (Seite Unterlagen, seit 24.10.2026 ```` ```eba-liste uebungen ```` und ```` ```eba-kacheln uebungen ```` aus
  `dashboard.js`, vorher Kennzahlen und zwei Bases über die Übungsblatt-Notizen): offene Übungen mit Abgabe aus
  `ctx.modell.uebungen`, nach Tag und Uhrzeit, überfällige noch 14 Tage lang (Pille „Abgabe“ in Rot); erledigte und solche ohne
  Abgabe stehen nur auf der Modulseite (✓). Kacheln: Offen (davon überfällig), Fällig in 7 Tagen, Erledigt von allen Blättern des
  Semesters. Neu gezeichnet, wenn sich eine Unterlage ändert, wie Nachzuarbeiten (`Unterlagen/` steht nicht in `RELEVANT`); eine
  abgehakte Frist meldet das Modell. Leer: „Keine offenen Abgaben.“.
- **Bitte prüfen** (`bitte-pruefen.js`, Codeblock `eba-bitte-pruefen`, erster Block unter „Zu erledigen“, ohne Karte im
  Markdown): nur im eigenen Uni-Abgleich (`eba.eigenerAbgleich`) und nur, wenn `System/Abgleich/Protokoll.md` einen Abschnitt
  „Bitte prüfen“ (Überschrift beliebiger Ebene) mit Listenpunkten hat. Dann zeichnet der Block selbst eine Karte im Aufbau
  eines Callouts (`eba-pruefen`, eingeklappt; der Zustand gilt je Gerät und bleibt beim Neuzeichnen): Titel „Bitte prüfen ·
  n offen“, Knopf „Protokoll“ und „Jetzt abgleichen“ nur, wenn der eigene Abgleich die Aktion `abgleich` anmeldet (dieses
  Skript startet keinen Abgleich). Darunter je Punkt eine Zeile wie bei den To-dos: Das Kästchen schreibt `[x]` bzw. `[ ]`
  genau in diese Zeile des Protokolls (Text vorher geprüft), „**Titel** · Rest“ wird Titel und Metazeile, Unterpunkte stehen
  gedämpft darunter, Links gehen vom Protokoll aus, fehlende Notizen werden nicht angelegt. Seit 0.4.5 kommen für alle
  Nutzer:innen die Punkte der Quellen dazu (Meldekanal, `Q.meldungen(ctx)`, siehe [„Quellen-Vertrag“](quellen.md): Noten & Anmeldungen,
  ILIAS, Alma-Stundenplan …), ohne Kästchen und ohne persönliche Werte; ein Tipp öffnet ihr Ziel, ohne Protokoll keine Knöpfe;
  neu gezeichnet nach `Q.meldenNeu`. Sonst bleibt der Block leer
  (`.eba-bp-aus`) und samt Hülle auf Höhe 0 gefaltet (Abschnitt 59, Regel „Einen leeren Block samt Hülle ausblenden“):
  Normale Nutzer:innen sehen nichts, auch keine leere Karte. Geprüft in Obsidian (18.10.2026): Lese- und Bearbeitungsansicht,
  iPad- und iPhone-Breite, mit und ohne eigenen Abgleich; Obsidians gemessene Abschnittshöhen stimmen, die Karte darunter
  erscheint. Tests: `tests/bitte-pruefen.test.js`.
- **Reiter** (seit 24.10.2026, `reiter.js`, Codeblock ```` ```eba-reiter ```` unter dem Wochenraster): Fristen, Termine,
  Nachzuarbeiten und das Raster „Offene Fragen | To-dos“ stehen auf jedem Gerät nicht als Karten untereinander, sondern als
  eine Reihe Knöpfe in einer Karte (zuerst nur am iPhone, am selben Tag auf PC und iPad übernommen). Ein Tipp zeigt die Liste
  darunter, ein Tipp auf einen anderen wechselt, einer auf den offenen schließt ihn; beim ersten Öffnen ist keiner offen,
  danach gilt die Wahl je Seite bis zum Neustart (`ctx.bleibend`). Welche Karte ein Reiter ist, steht in ihren Angaben:
  `reiter=Name` (`[!eba-termin|schlicht|umbruch|handy-zu|reiter=Fristen]+`), im Raster mit Leerzeichen
  (`[!eba-raster|2 reiter=To-dos]`), denn eba-core.css liest die Spaltenzahl als eigenes Wort (`~="2"`). Mehrere Karten mit
  demselben Namen bilden einen Reiter. Den Inhalt liest der Block aus der Notiz selbst (`reiterAus`: dieselbe Karte eine Ebene
  höher, ohne `handy-zu`, `reiter=` und Klappen) und zeichnet ihn mit Obsidians `MarkdownRenderer`; die Listen darin zeichnen
  sich also selbst, am PC in ihrer breiten Form. Die Abschnitte mit `reiter=`-Karten und auf dem Dashboard „## Zu erledigen“
  (darunter bliebe sonst nur die Überschrift) falten, aber nur, solange das Plugin läuft (`body.eba-plugin-an`); ohne Plugin
  bleiben die Karten (eba-core.css Abschnitt 69). Eine `reiter=`-Karte steht darum oben in der Notiz oder in einem Raster nur
  aus `reiter=`-Karten, und die Seite braucht den Block; ohne `reiter=`-Karten blendet er sich aus (`.eba-rt-aus`).
  Jeder Knopf ist leicht gefüllt und trägt hinten einen Pfeil (`chevron-down`), der beim offenen Reiter nach oben zeigt (seit
  24.10.2026: ohne beides las sich die Reihe wie eine Legende, nicht wie etwas zum Aufklappen). Der offene Knopf und die Liste
  darunter haben einen gemeinsamen Rahmen wie ein Karteireiter: Der Knopf hat den Grund der Karte, reicht 4 px tiefer
  (`margin-bottom: -4px`, die Reihe streckt ihn) und deckt so den oberen Rand der Liste unter sich ab. Zwischen 330 und 365 px Breite
  der Karte (iPhone mit 375 bis 393 px) rückt alles enger zusammen, damit vier Zahlen und Pfeile in die Reihe passen.
  Die Leseansicht rechnet die Länge der Seite aus den Höhen ihrer Abschnitte, gemessen beim Zeichnen und Scrollen; nach einem
  Wechsel hielt sie unter einem kurzen Reiter den Platz des längeren frei (bis 320 px). Ein `ResizeObserver` am Block misst den
  Abschnitt darum nach (`abschnittNachmessen`: `getSectionForElement`, `measureSection`, `updateVirtualDisplay`, interne
  Funktionen wie die Messkorrektur in `start.js`); ausgehängte Abschnitte misst er nie, sonst zählten sie als 0 px.
  Am Knopf steht, wie viele Einträge die Listen des Reiters gerade zeigen, bei 0 nichts. `bloeckeAus` findet die Codeblöcke im
  Markdown des Reiters (Sprache, Argument, Ersatztext), `anzahl` zählt sie zusammen. Zählen kann eine Erweiterung, die
  `zaehler: { "<sprache>": (arg, quelle) => Zahl | null }` zurückgibt, gelesen über `plugin.erweiterungen`: `dashboard.js` für
  `eba-liste` mit der Grenze der Liste (höchstens 6 Fristen, 8 Termine, 8 Nachzuarbeiten), `todos.js` für `eba-todos`. Fehlt
  ein Zähler oder kennt er die Zahl nicht (ohne Modell), steht keine Zahl. Neu gezählt wird nach dem Zeichnen, wenn das Modell
  sich ändert, eine Notiz mit Aufgaben oder eine Vorlesung sich ändert, gelöscht oder umbenannt wird, beim Zurückkehren in die
  App und alle 10 Minuten. Geprüft in Obsidian (24.10.2026): iPhone 360 und 390 px mit 16 und 20 px Schrift, iPad 820 px, PC
  1024 px, hell und dunkel, jeder Reiter offen und wieder zu, Zahlen wie die Listen. Tests: `tests/reiter.test.js`, Zähler in
  `tests/dashboard.test.js` und `tests/todos.test.js`.

## Bereiche (zehn Seiten, dazu der Lernplan)

Die Seitenleiste „Übersicht“ (seit 19.10.2026; bis 0.4.6 ein Raster-Menü, bis 0.4.5 „Bereiche“; `seitenleiste.js`, `ZIELE`, einzige Quelle) zeigt zehn Seiten: Dashboard,
Studienverlauf, Termine & Anmeldungen, Postfach (seit 0.6.0), Prüfungen, Noten & ECTS, Unterlagen, Karteikarten, Kontakte & Links, Einstellungen & Hilfe.
Seit 18.10.2026 steht vor Karteikarten der Lernplan, aber nur, wenn es Lernplan-Notizen gibt (`sichtbareZiele`, `ctx.lernplan.sichtbar()`;
die schreibt nur eine KI, siehe [„Lernplan“](lernen.md)). Stundenplan steht seit 24.10.2026 nicht mehr dort (0.6.6: nur am iPhone), das
Dashboard zeigt die Woche auf jedem Gerät als Raster; die Seite bleibt, ohne Lesezeichen und Symbol. Die Icons hängen an
`li:has(> a[data-href$="…"])` (eba-core.css Abschnitt 6). Die Lesezeichen der Vorlage folgen `ZIELE`
(siehe [„Öffnen und Navigieren“](bedien-bausteine.md)).

| Seite | Enthält (früher eigene Seite) |
|---|---|
| `Studium/Termine & Anmeldungen.md` | Kalender, Agenda, Angebote der Uni; Abschnitte „Anmeldungen“ (`eba-anmeldungen`, aus den zentralen Fristen, seit 17.10.2026; vorher eine Tabelle mit Spalte „Stand“ zum Eintragen) und „Übungen und Tutorien“ (`eba-gruppen`, darunter eine Karte „Hinweise je Modul“). cssclasses `eba-s-termine` + `eba-s-anmeldungen`, Stil `eba-core.css` Abschnitte 37 und 57 |
| `Studium/Prüfungen.md` | Zeitleiste, Karte „Termine“ (eintägige Prüfungen; Phasen zeigt die Zeitleiste als Band); Karte „Regeln“ |
| `Studium/Noten & ECTS.md`, `Studium/Studienverlauf.md` | je eine Karte „Regeln“ (Prüfungsordnung) |
| `Studium/Unterlagen.md` | Abschnitt „Übungen“ (Übungsblätter) |
| `Studium/Kontakte & Links.md` | Abschnitt „Offizielle Dokumente“ (Quellen) |
| `Studium/Einstellungen & Hilfe.md` | Eine Gestalt für die ganze Seite (seit 17.10.2026): jeder Abschnitt ist eine Zeilenliste wie die Verbindungen (Rahmen, Zeilen mit Haarlinie, rundes Symbol, Titel, gedämpfte Zeile, rechts ein Knopf oder der Klapp-Pfeil). Deine Angaben (Name, Studienbeginn, Zielnote, Einrichtung), Verbindungen, Variante (je Variante eine Zeile, die gewählte mit Haken); Abschnitt „Hilfe“ als `> [!eba-zeilen]` mit je Thema einer klappbaren Karte `> > [!eba-karte\|hilfe\|<thema>]- Titel` (Symbol je Thema in eba-core.css Abschnitt 5), zuletzt „Stand der Angaben“ (offene Punkte). Seit 24.10.2026 sind alle Zeilen kompakt wie die Einstellungen von iPhone und iPad, auf allen Geräten gleich: eine Zeile je Angabe, rechts der Stand und der Pfeil, Knöpfe im Fenster dahinter, Hilfe ohne Unterzeilen (bis 0.6.6 `<span class="eba-zeile-unter">`, in selbst geänderten Seiten ausgeblendet). Bis 17.10.2026 Kasten, Chips mit Tabelle und einzelne Karten |

- **Regeln:** Die Prüfungsordnung steht nach Thema in Karten `> [!eba-karte|regeln]- <Themen>` unter `## Regeln` (Titel nennt
  die Themen statt „Regeln“ zu wiederholen, seit 18.10.2026; Links
  `[[Prüfungen#Regeln]]` usw.). An-/Abmeldung, Rücktritt, Wiederholung, Bestehen, Einsicht → Prüfungen; Gesamtnote,
  Notenstufen und Schnitte, Zusatzleistungen → Noten & ECTS; Aufbau (ECTS je Variante), Orientierungsprüfung, Fristen,
  Bachelorarbeit, Ausland, IBA/IEco, Containermodule → Studienverlauf. Stil: eba-core.css 37.regeln.
- **Schwerpunkte (seit 17.10.2026, vorher Seite `Studium/Schwerpunkt-Planer.md`):** Abschnitt `## Schwerpunkte` im Studienverlauf
  unter dem Musterstudienplan, Codeblock `eba-schwerpunkte` (`schwerpunkte.js`). Balken nur für Bereiche mit ECTS, Prüfliste
  (genau 3 Bereiche, je 15–30 ECTS, Summe 75 bzw. 63, VWL/BWL-Seite je Variante; Regel wie die Formel `block` auf Noten & ECTS),
  zugeklappt die Module je Bereich aus dem Feld `bereiche` der Modulnotizen. Sichtbar ab dem 2. Fachsemester oder sobald ein
  Schwerpunkt- oder Profilmodul im Plan ist, sonst samt Überschrift ausgeblendet (`.eba-sp-aus`, eba-core.css Abschnitt 56).
  Die Katalog-Tabellen entfallen: Bereich und „+ Planen“ stehen in jeder Modulnotiz („Anrechnung in“, bei Profil & Vertiefung
  „Zählt als“). Links auf den Abschnitt: `[[Studienverlauf#Schwerpunkte]]`.
- **Einstellungen:** Die Daten bleiben in `System/Einstellungen.md` (Frontmatter; alle Skripte und Bases-Formeln lesen
  diesen Pfad). Die Datei zeigt nur noch einen Hinweis. Sichtbar ist `Studium/Einstellungen & Hilfe.md`: ihre Bases filtern
  `file.path == "System/Einstellungen.md"`, die Knöpfe (`variante`, `personalisieren`) schreiben dorthin.
- **Rückverweise der Bases:** Termin-Notizen tragen `uebersicht: "[[Prüfungen]]"` (Kennzahl und Fristen-Liste auf dem
  Dashboard lesen `file("Studium/Prüfungen.md").backlinks`), Übungsblatt-Notizen bis 0.6.7 `uebersicht: "[[Unterlagen]]"` (für die
  Kennzahl „Übungsblätter“ auf Unterlagen; seit 24.10.2026 zählt der Abschnitt „Übungen“ aus dem Fachmodell). `notizen.js` schreibt diese Felder.

## Modulseite (seit 17.10.2026, `modul.js`)

Jede Modulnotiz (und das Gerüst `System/Gerüste/Modul.md`) hat den Aufbau Kopf (HTML: Pfad, Kürzel als eigene Zeile
`<span class="eba-code">` im `<h1>`, englischer Titel als `eba-untertitel`, Eckdaten) → Codeblock ```` ```eba-modul```` (Modulfeld
und darunter der Abschnitt „Vorlesungen“) → `## Unterlagen` (Codeblock ```` ```eba-unterlagen````) → `## Zum Modul` (bis 0.4.5 „Meine Notizen“) → `## Steckbrief` (Lehrveranstaltung, Prüfung, Ergänzungen wie Rolle je Variante,
Anrechenbar in, Hinweise) → Fußzeile. Die Tabelle „Mein Stand“ und die Knopfreihen gibt es nicht mehr; Modulnotizen, deren
Text du selbst geändert hast, behalten sie (das Update ersetzt nur unveränderten Text, siehe [„Update“](update.md)), ihr Stil bleibt in
`eba-core.css` 37.modul und 58.2.

Das **Modulfeld** (`eba-modul`) zeichnet aus dem metadataCache und `ctx.modell`, schreibt nur auf Tipp und nur ins
Frontmatter dieser Modulnotiz:
- *Stand:* Status als Knopf; das Menü setzt `status` (offen · läuft · angemeldet · bestanden · nicht bestanden · anerkannt),
  fragt nach „bestanden“ und „nicht bestanden“ die Note ab (`ergebnis`, Fenster mit Prüfung 1,0–4,0 bzw. 5,0; nicht bei
  `benotet: false`). Passt eine eingetragene Note nicht zum neuen Status (5,0 aus dem ersten Versuch, dann bestanden;
  `notePasst`), leert der Wechsel `ergebnis` und das Fenster fragt leer nach der neuen (seit 24.10.2026; vorher blieb die alte
  Note stehen und zählte in die Gesamtnote). Dazu Versuch (`versuch`) und eigene Planung (`semester_geplant`, „Wie im Musterplan“ leert das Feld).
  Semester über `ctx.modell.modulSemester`, im laufenden Semester mit `ctx.modell.woche().text`. Prüfung nach der Regel
  „Nächste Prüfung“ (unten), Countdown erst ab 30 Tagen; ohne Prüfung (`benotet: false`, `pruefung` „keine“/„unbenotet“) und
  ohne Termin kein Feld. Profil & Vertiefung und Schwerpunkt: „+ Planen“/„✓ Im Plan“ (Aktion `plan`) und „Zählt als“ bzw.
  „Anrechnung in“ (`anrechnung`, Auswahl aus `bereiche` und Elective Studies).
- *Semesterband:* eine Zelle je Kalenderwoche aus `ctx.modell.vorlesungswochen` (Pausenwoche schraffiert), vorbei getönt, diese
  Woche Akzent, Punkt je Woche mit Vorlesungsnotiz (voll = alle nachgearbeitet, Tipp öffnet die Notiz), Markierung in der Woche
  der Prüfung; liegt sie nach der Vorlesungszeit, eine eigene Zelle am Ende. Nur im laufenden Semester des Moduls oder wenn es
  darin schon Notizen gibt.
- *Als Nächstes:* höchstens drei Einträge, nach Tag und Uhrzeit: die nächste Sitzung jeder Stundenplan-Serie mit diesem Kürzel
  (`wochentag`, `von`/`bis`, `ausfall`, `aenderungen`, Pausen, `entfaellt`, `einzeltermin`; heute nur, solange sie nicht vorbei
  ist) und Termin-Notizen mit diesem Kürzel, die nicht erledigt sind (Zeitraum mit `bis` als „19.–25.10.“, läuft er schon
  „bis So 25.10.“). Kürzel im Titel entfällt. Seit 20.10.2026 auch jeder Ausfall dieser Lehrveranstaltung der nächsten 14 Tage
  (`ctx.modell.ausfaelle`, nicht wegen Pause; vorher übersprang die Liste ihn still) mit Zeit und Art durchgestrichen und Pille
  „fällt aus“, und eine geänderte Sitzung mit Pille „anderer Raum“, „neuer Raum“, „andere Zeit“ oder „geändert“, dem neuen Wert in
  Warnfarbe und dem üblichen durchgestrichen („Hörsaal 9 statt ~~Hörsaal 1~~“, `eba-core.css` 58.7). Der Kopf einer
  Stundenplan-Notiz (`kopf.js`) zeigt nur die Serie („Mi 10:15–11:45“), keinen einzelnen Termin; Ausfälle und Änderungen stehen
  darum dort nicht (eine Stelle je Angabe: Woche und Modulseite).
- *Knöpfe:* Karteikarten lernen (nur mit Stapel), Unterlagen hinzufügen, Suchen (bis 24.10.2026 auch Neues Übungsblatt).

Die **Vorlesungen** (seit 19.10.2026: die eigenen Notizen gehören zum Meistgenutzten; bis dahin standen sie
ganz unten unter „Zum Modul“ als „VL 01 · 13.10.“) zeichnet derselbe Codeblock direkt unter dem Modulfeld, über `## Unterlagen`,
ohne eigenen Codeblock in den 87 Modulnotizen: Überschrift als `<h2>` (Gestalt wie jedes `##` der Seite), deine
Vorlesungsnotizen aus `ctx.modell.vorlesungen({ code })`, neueste zuerst, als Zeilen wie die Unterlagen (Name wie überall,
„nachgearbeitet“ als Pille, Tipp öffnet), ab sechs Notizen erst die fünf neuesten und „Alle n zeigen“ (gerätelokal). Darunter
**Neue Vorlesungsnotiz** (Fenster mit diesem Modul vorgewählt und Thema; im laufenden Semester der Hauptknopf, vorher „Neue
Vorlesung“ in der Knopfreihe); ohne Notizen davor der Satz „Noch keine Vorlesungsnotizen.“. „Zum Modul“ zeigt seitdem keine
Vorlesungen mehr (Filter `typ != "vorlesung"`, ohne Spalte Nachgearbeitet). Tests: `tests/vorlesungen.test.js`. CSS:
`eba-core.css` Abschnitt 65.

Neu gezeichnet wird bei Änderungen an Modul-, Stundenplan-, Termin-, Vorlesungs- und Kartennotizen, an den Einstellungen und
`System/Daten/`, beim Zurückkommen in die App und alle 10 Minuten. Prüfung, nächste Sitzung, Termine und Statusfarbe kommen
seit 18.10.2026 aus dem Fachmodell (`pruefungVon`, `naechsteSitzung`, `termine`, `statusArt`): Eine abgehakte Klausur steht ohne
Countdown mit „erledigt“, ein bestandenes oder anerkanntes Modul hat keine kommende Prüfung mehr. Reine Logik (`naechstes`,
`band`, `noteOk`, `titelOhne`, `spanne`) in `tests/modul.test.js`. Die Tabelle „Zum Modul“ zeichnet
`tabellen.js` auf allen Geräten als Liste zum Lesen (`--eba-tliste: 1`); ein gesetztes Kontrollkästchen steht als
Pille da, nur bei Notizen, die das Feld haben, „offiziell“ ohne Chip. CSS: `eba-core.css` Abschnitt 58.

Die **Unterlagen** (`unterlagenliste.js`, Codeblock `eba-unterlagen`, seit 18.10.2026; vorher eine Tabelle mit
Werkzeugleiste, Spaltenköpfen und Spalte Art) zeigen alle Notizen mit `typ: unterlage` und dem Kürzel des Moduls (ein Kürzel
im Codeblock geht vor), auf allen Geräten gleich:
- *Abschnitte* je Art in fester Reihenfolge, Name in der Mehrzahl: Folien, Skripte, Mitschriften, Übungen, Tutorium, Lab, Altklausuren,
  Lösungen, Eigene Lösungen, Literatur, Scans, Sonstiges; unbekannte Arten mit eigenem Namen vor Sonstiges.
- *Tutorium* (seit 20.10.2026) ist ein eigener Bereich, getrennt von Vorlesung und Übung: Nennt ein Ordner oder der Dateiname das
  Tutorium („Tutoriumsunterlagen“, „Tutoriengruppen/Gruppe 4“, „Unterlagen zu den Tutorien“, „JA_Tutorium10“; nicht „Tutorin“, nicht
  „Tutorial“), ist alles darin Art „Tutorium“, auch Blätter, Lösungen, Folien und Vorlagen (`unterlagen.js`, vor allen anderen
  Regeln). Es liegt immer im Unterordner `Tutorium/` des Modulordners (`unterlagen.js`, `ilias.js` legen ihn an); eine Zahl aus dem
  Ordner einer Gruppe („Gruppe 4: Dienstag …“, „Tutorium 5 | … | Mittwoch …“) ist keine Blattnummer. Lösungen hängen nicht an
  Tutoriumsblättern, sie stehen im Abschnitt Tutorium. Der Uni-Abgleich auf dem eigenen Server folgt derselben Regel.
- *Lab* (seit 24.10.2026) ist ebenso ein eigener Bereich, gleich nach dem Tutorium: Sitzungen, in denen Code vorgeführt wird
  (Data Science Lab in S110, „R Lab 1“, „Python Labs“). Ein Ordner oder Dateiname nennt ein Lab mit Sprache oder Kurs davor („R
  Lab“, „RLab1“, „DataScienceLab_03“), mit Nummer („Lab 3“, „Lab02“; ein Jahr zählt nicht) oder als erstes Wort („Labs“, „05 -
  Labs“, „Lab Orga“, nicht im Sinn von Laborexperimenten: „Lab Experiments“, „Lab vs. Field“, „Lab-in-the-field“). „Experimente im
  Lab“, „Evidence from the Lab“, „Labor“, „Matlab“, „Syllabus“, „Label“ zählen nicht. Was darin liegt, ist Art „Lab“, auch
  Notebooks, Daten und Lösungen. Ausnahmen (`laborArt`): eigene Arbeit (Scan, eigene Lösung, Mitschrift im Namen oder in einem
  Ordner wie „Mitschriften/“, „Meine Lösungen/“, „Scans/“; sie geht nie an den eigenen Server) und ein Lesestoff- oder
  Altklausur-Ordner unterhalb des tiefsten Lab-Ordners. Unterordner `Lab/`, Nummer aus „Lab1“, „R Lab 2“, dem Ordner „R Lab 1“,
  „02 R Lab“ oder einem ILIAS-Sitzungsordner („…, 14:15 - 15:45: R Lab 1“), bei mehreren die hinter dem Lab-Wort („Kapitel 3 Lab 2“
  → Lab 02); eine Gliederung mit Strich („03 - Data Science Lab“, „03 - R Lab“) zählt nicht. Lab-Wörter sind nur bei der Art Lab
  Nummernwörter (`NUMMER_LAB`): „Mitschrift Lab 2“ und „Tutorium/R Lab 1“ heißen wie vorher. Ein R-Notebook und seine HTML-Fassung
  („Lab2.Rmd“, „Lab2.nb.html“) sind beim Einordnen eine Unterlage (gezeigt wird die HTML-Fassung; liegt daneben noch „Lab2.html“, wird
  die Notebook-Fassung eine eigene Unterlage, `stapeln` → `ausgaben`); aus ILIAS kommen sie getrennt, die HTML-Fassung als „… mit
  Ausgaben“ (`ilias.js`, `titelMitZusatz` kürzt den Titel, damit der Zusatz bleibt). Die Gliederungsnummer eines Lab-Ordners
  („03 - Data Science Lab“) gilt nur für Dateien der Art Lab (`gliederungsNummer(…, lab)`); Fotos zählen nur mit Lab im Namen,
  „My Notes“, „Abgaben/“ sind eigene Arbeit (`EIGEN_LAB`). Anlass: Die Dateien des Data Science Lab landeten als „Skript 03“ (Ordner
  „Codes-Skripte-…“) oder unter Sonstiges.
- *Lösungen bei ihrer Aufgabe:* Eine Lösung (auch eine eigene) steht in der Zeile ihrer Übung oder Altklausur, wenn genau
  eine Übung dieselbe `nummer` hat oder die Wörter ihres Titels ohne „Lösung“, „Kurzlösung“, „Musterlösung“, „Korrektur“ …
  im Titel der Aufgabe vorkommen (bei mehreren die mit den wenigsten übrigen Wörtern, bei Gleichstand keine). Sonst bleibt
  sie im Abschnitt Lösungen. Die Spalte Lösung steht in jeder Zeile des Abschnitts, fehlende Lösungen fallen so auf.
- *Reihenfolge:* nach `nummer` (eigene Spalte, ohne Nummer zuletzt), Altklausuren nach dem Semester im Titel, neueste zuerst.
- *Zeile:* Titel (Tipp öffnet die Notiz), ✓ bei `status` gelesen oder bearbeitet („neu“ steht nicht da), Lösung, Seiten,
  ↗ öffnet die Datei außerhalb von Obsidian (Aktion `oeffnen`, nur mit `datei`). Ohne Datei führt ↗ zur Online-Fassung im Feld
  `link` (seit 20.10.2026; nur `https://` ohne Leerzeichen, sonst kein ↗), etwa zum E-Book oder Online-Buch einer Literaturnotiz.

Ab 860 px Breite zwei Spalten, ein Abschnitt bricht nie um; unter 480 px ohne Seiten. Neu gezeichnet wird bei Änderungen an
Unterlagen- und Modulnotizen und beim Umbenennen. Was neu ist (in 14 Tagen eingeordnet, nie geöffnet), zeigt die Seite
Unterlagen. Reine Logik (`artVon`, `woerter`, `semesterRang`, `gliedern`) in `tests/unterlagenliste.test.js`. CSS:
`eba-core.css` Abschnitt 58.8.
