# Architektur: Bedien-Bausteine

Teil der Architektur-Doku. Aufbau, `ctx`, Skripttypen und die Regeln für Skript-Autoren stehen im Überblick
[architektur.md](../architektur.md).

## Bedien-Bausteine (seit 0.4.6): Pflicht für jede Funktion

Bis 0.4.5 bediente sich jeder Teil der App anders: Anlegen über Ketten einzelner Fragen, Abhaken je Notiztyp anders, Löschen mit
fünf Sicherheitsstufen, sechs Wege, eine Notiz zu öffnen (Konsistenz-Audit, Schritt 4). Seitdem gibt es für jede dieser Aufgaben
einen Baustein. Eine neue Funktion nimmt ihn, statt etwas Eigenes zu bauen; fehlt etwas, kommt es in den Baustein.

### Fenster „Neu …“ (`formular.js`, `ctx.formular`)

Jede Aktion, die etwas anlegt, fragt in **einem** Fenster mit allen Feldern und ihren Vorgaben: Neue Vorlesungsnotiz (Modul und
Thema; ohne Fenster nur, wenn gerade genau eine Lehrveranstaltung läuft und kein Modul vorgewählt ist), Neuer Termin, Neue Lehrveranstaltung,
Neuer SQ-Kurs, Neues eigenes Modul, Neuer Kartenstapel und beim Einordnen „Ändern“ einer Unterlage. Esc, × und **Abbrechen**
legen nichts an; mit der Ordner-Automatik verschwindet auch die leere Notiz wieder (`eba.abbrechen`). Bis 0.4.5 war das eine
Kette aus Eingabe- und Auswahlfenstern (bis zu fünf), in der Esc mal abbrach und mal die Vorgabe nahm (Fehler 24).

```
ctx.formular({ titel: "Neuer Termin", knopf = "Anlegen", felder: [Feld], pruefen?(werte) → { feld, fehler } | null })
  → Promise<{ name: Wert } | null>
Feld = { name, titel, art: "text" | "zahl" | "datum" | "zeitraum" | "uhrzeit" | "auswahl", vorgabe, optionen: [{ wert, text, gruppe }],
         hilfe, platzhalter, pflicht, fehlt, wenn(werte), ct, ganz, min, max, muster, falsch }
eba.modulFeld({ titel, optional, laufend, vorgabe }) → Feld „Modul“ (Läuft gerade · Dieses Semester · Alle Module)
```

- **Vorgaben**: Fast jedes Feld hat eine (Beginn 10:15, ECTS 6). Neue
  Lehrveranstaltungen bekommen `ausfall: []` und kein Feld `tag`: Pausen und freie Tage prüft `findetStatt` beim Lesen (bis
  24.10.2026 schrieb das Anlegen die Pausentage als `ausfall` fest), den Wochentag trägt nur `wochentag`. Eine Vorgabe als
  Funktion folgt den anderen Feldern, bis du das Feld selbst änderst (Ende = Beginn + 90 Min., ECTS je Anbieter, Art aus den
  Wörtern im Titel). `wenn` blendet ein Feld aus (Schwerpunktbereich nur beim Teil Schwerpunkt); es liefert dann `null`.
- **Lesen**: Datum und Zeitraum wie überall über `eba.datumLesen`/`eba.zeitraumLesen` („27.10.“, „+7“, „12.11.–15.11.“), unter
  dem Feld steht, was erkannt wurde („Mo 26.10. · in 7 Tagen“); Uhrzeit mit Doppelpunkt, Punkt oder Komma, mit `ct` heißt „14“
  14:15; Zahlen mit Komma. Ein Fehler steht als Satz unter seinem Feld (`.eba-form-hilfe.fehler`), angelegt wird erst, wenn alles
  stimmt. `pruefen` prüft über mehrere Felder (Modulcode schon vergeben, Ende vor Beginn).
- **Gestalt**: `eba-modal eba-modal-neu` mit den Bausteinen von „Deine Angaben“ (`eba-form`, `eba-form-zeile`), Hauptknopf rechts,
  auf dem iPhone untereinander (`eba-core.css` Abschnitte 43 und 64). Module als Liste mit Überschriften statt Zeichen („●“, „▶“).
- **Tastatur** (iPhone, iPad): Ist das erste Feld ein leeres Eingabefeld, liegt der Cursor darin; beginnt das Fenster mit einer
  Auswahl, springt keine Tastatur auf. Felder 44 px hoch mit 16 px Schrift (Safari zoomt sonst), ein Feld mit Fokus rollt über die
  Tastatur, Enter legt an.
- **Tests**: `plugin.testAntworten` wie bei Eingabe und Auswahl (`null` = Esc, ein Objekt = Eingaben je Feld, Auswahl als Wert,
  Text oder `{ index }`); ein Fehler legt nichts an und steht in `plugin.testProtokoll`. `tests/formular.test.js` (Lesen, Vorgaben,
  versteckte Felder), `tests/anlegen.test.js` (jede Anlege-Aktion; nie eine Kette aus Fragen).
- `ctx.system.prompt` bleibt für einzelne Angaben (Seitenlink, Alma-Link), nie zum Anlegen. Das Fenster **Neue Karte**
  (`karten.js`) ist ein Formular aus denselben Bausteinen, bleibt aber offen für die nächste Karte.

### Kopf-Karte jeder Notiz (`kopf.js`)

Unter dem Titel jeder Notiz steht ihr Kopf mit **genau einem** Status-Knopf, in der Gestalt der Vorlesungsnotiz (`.eba-vorl-karte`,
links ein Label, rechts der Knopf). Das Label sagt, was der Titel nicht sagt: beim Termin Art · Modul, bei Begleit- und
Stundenplan-Notiz das Modul mit Namen (Link) und Semester bzw. Gruppe · Tag (seit 0.7.0; Kürzel und Art nennt dort schon der
Titel, vorher „Folien 00 · B110 · WS 2026/27“, `labelVon`, `modulNameVon`). Die Vorlesung hat ihn im Text (Codeblock `eba-vorlesung`, `vorlesung.js`),
eine Übungsblatt-Notiz bis 0.6.7 ebenso (`eba-uebungsblatt`, seit 24.10.2026 von `kopf.js` gezeichnet); für die übrigen Notiztypen
zeichnet ihn `kopf.js`, ohne die Notiz zu ändern: in der Leseansicht über den
Post-Processor im Abschnitt des ersten `# Titels` (nicht in Einbettungen und Hover-Vorschauen), in der Bearbeitungsansicht als
Block-Widget unter dem Titel (`StateField`, Block-Widgets gehen nicht über `ViewPlugin`). Bis 0.4.5 ging der Status dieser Notizen nur
über die Eigenschaften, die in der Leseansicht gar nicht zu sehen sind.

| Notiztyp | Knopf | schreibt |
|---|---|---|
| Vorlesung | Nacharbeit offen ⇄ Nachgearbeitet | `nachgearbeitet` (`vorlesung.js`) |
| Termin | Offen ⇄ Erledigt | `erledigt` |
| Unterlage (Begleitnotiz) | Noch nicht gelesen ⇄ Gelesen („bearbeitet“ zählt als gelesen) | `status` |
| Übung (Unterlage der Art Übung, seit 24.10.2026) | Offen ⇄ Abgegeben, ohne Abgabe Offen ⇄ Bearbeitet | `erledigt` jeder Abgabe-Frist (`ctx.modell.uebung`) und `status` (`bearbeitet` bzw. `neu`) |
| Übungsblatt-Notiz (bis 0.6.7) | offen · abgegeben · korrigiert (Menü am Knopf) | `status` |
| SQ-Kurs | geplant · angemeldet · zugelassen · bestanden (Menü am Knopf) | `status` |
| Lehrveranstaltung | Im Stundenplan ⇄ Besuche ich nicht | `stundenplan_ausgeblendet` bzw. `besuche_nicht` (`ctx.modell.besuchtNicht`); zentral über die Aktion `besuche-nicht` |

- **Farbe** nur aus `ctx.modell.statusArt(typ, wort)`: `ok` und letzte Stufe gefüllt (`fertig`), `ok` davor getönt im Akzent
  (`zwischen`), sonst warm wie „Nacharbeit offen“; „Besuche ich nicht“ und „Noch nicht gelesen“ leise (`leise` in `statusVon`; ungelesen
  ist jede neue Unterlage, bis 0.6.14 stand sie orange da). Kein Skript wählt die Farbe selbst.
- **Rückmeldung**: Der Knopf zeigt den neuen Stand selbst, ein Hinweis kommt nicht. Nur was danach woanders fehlt („Besuche ich
  nicht“: der Stundenplan), meldet sich mit Hinweis und **Rückgängig** (siehe „Rückgängig statt Rückfrage“).
- Geschrieben wird nur nach einem Tipp, mit `processFrontMatter`; neu gezeichnet bei Änderungen an der Notiz und an den
  Einstellungen. Die zentralen Stundenplan-Notizen tragen den Textlink „Besuche ich nicht“ nicht mehr (`zentral.js`), ein neuer SQ-Kurs
  nicht mehr den Satz „Stand in den Eigenschaften pflegen“ (`notizen.js`).
- **Unterlagen unter Übung, Tutorium und Lab** (seit 20.10.2026, Lab seit 24.10.2026): Die Stundenplan-Notiz eines Tutoriums (Feld `art` mit „Tutorium“)
  zeigt unter dem Kopf die Unterlagen der Art „Tutorium“ ihres Moduls (`code`), die einer Übung (auch „Übungsteil“) die der Art
  „Übung“, jeweils nur aus dem eigenen Bereich, als Chips wie die Vorlesungsnotiz (`.eba-vorl-links`): höchstens drei, höchste
  Nummer zuerst (das neueste Blatt), ohne Nummer (Aufgabenkatalog, Vorlage) danach; gibt es mehr, „Alle Unterlagen“ zur
  Modulseite. Tipp öffnet die Begleitnotiz. Ohne Unterlagen bleibt der Kopf eine Zeile. Neu gezeichnet auch, wenn sich eine
  Unterlage ändert oder wegfällt (`blaetterFuer`, reine Logik). Seit 24.10.2026 ebenso ein Lab: `art` mit dem Wort „Lab“
  („Lab“, „Data Science Lab“, „R Lab“; nicht „Labor“, „Matlab“) zeigt die Unterlagen der Art „Lab“, eine je Sitzung: Von
  mehreren mit derselben Nummer steht die zum Lesen da (PDF, HTML mit Ausgaben), sonst das Notebook, dann Code, dann Daten; eine
  Lösung zuletzt (`labRang`: „Lösung“, „Lsg“, „Solution“ im Titel oder im Link der Datei samt Alias; Endungen aus `format`, sonst
  aus `datei`). „Alle Unterlagen“ zählt die übrigen mit.
- **Übungen** (seit 24.10.2026): Unter dem Kopf einer Übung stehen als Chips ihre Abgabe (Tag, Uhrzeit, Restzeit; Tipp öffnet die
  Frist; ab einem Tag davor in Warnfarbe, danach „vorbei“ in Rot), die Musterlösung und deine Lösung (`ctx.modell.uebung`). Der Kopf
  einer Abgabe-Frist zeigt ihr Blatt („Übung 03 · Titel“). Ein Tipp auf den Status hakt die Frist ab und setzt `status` der
  Begleitnotiz, ein Haken für beides; Agenda, Fristen und Modulseite folgen. Neu gezeichnet bei Änderungen an einer Unterlage
  oder einem Termin und am neuen Tag (Restzeit). Bis 0.6.7 legte „Neues Übungsblatt“ dafür eine zweite Notiz mit eigenem Status
  und eigener Abgabe an, die die Begleitnotiz desselben Blatts von Hand doppelte; solche Notizen behalten ihre Karte.
- **Termine** (seit 24.10.2026): Das Label nennt nur Art · Modul, darunter zeichnet `terminZeichnen` den Tag groß, daneben
  „heute“, „morgen“ oder „läuft“ bzw. die Restzeit, dann Uhrzeit · Ort (`wannVon`, reine Logik: Uhrzeit aus `uhrzeit`, sonst
  aus einem Teil des Orts, der nur eine Uhrzeit ist, damit sie nie doppelt steht). Die Zeile, die `zentral.js` und der
  Uni-Abgleich unter den Titel schreiben („**24.10.2026** · 13:30–17:00 · Ort“), sagte dasselbe noch einmal und fällt weg,
  aber nur, wenn Tag, `bis` und Ort genau den Eigenschaften entsprechen (`datumsZeile`); eine von Hand geänderte bleibt. Die
  Notiz ändert sich dafür nicht: Leseansicht über den Post-Processor (`eba-termin-datum`, auf Höhe 0 gefaltet), Bearbeitungsansicht
  über dieselbe Zeilen-Dekoration wie die leeren Abschnitte (`eba-leer-zeile` samt Leerzeilen davor, solange der Cursor nicht
  darin steht). „Quelle: …“ wird eine leise Fußzeile (`eba-termin-quelle`), `##` ein Label wie in der Vorlesungsnotiz
  (`eba-vorl-h`, „Meine Notizen“ mit Stift). Vorher stand der Tag nur im Label, und unter dem Titel stand alles in derselben
  Schrift; die iPhone-Regeln für die Datumszeile griffen in der Bearbeitungsansicht nie, weil die Karte zwischen Titel und Zeile steht.
- **Vorlesung liest live** (seit 24.10.2026, `vorlesung.js`): Der Dozent kommt aus der Stundenplan-Notiz (`dozent`
  der Notiz geht vor), der Wochentag der Chips aus `wochentag`. Beides gehört zur Signatur, eine Änderung im Stundenplan zeichnet
  neu. Alle 5 Minuten prüft der Kopf den Tag und zeichnet bei einem neuen den Block neu („heute“, „gestern“, Perle dieser
  Woche). Bis dahin schrieb das Anlegen den Dozenten fest in die Notiz. Die Folien wählt `folien(f)` (oben).
- Tests: `tests/kopf.test.js` (Stufen je Typ, Farbe aus `statusArt`, „Besuche ich nicht“ je Quelle, Unterlagen unter Übung, Tutorium und Lab, Kopf der Termine), `tests/uebungen.test.js` (Übungen). Stil: `eba-core.css` Abschnitt 64.2.
- **„⋯“ mit Eigenschaften** (seit 19.10.2026): Rechts im Kopf, auch bei der Vorlesung (`ctx.kopf.mehr`; ein drittes
  Argument `[{ titel, aktion }]` hängt weitere Punkte an, bei der Vorlesungsnotiz **Andere Folien …**, siehe `folien(f)`). Die Eigenschaften
  der Notizen des Plugins stehen in keiner Ansicht mehr (Klasse `eba-notiz` aus `start.js` an Termin, Begleitnotiz, Lehrveranstaltung,
  Vorlesung, Übungsblatt, SQ-Kurs, Volltext; `eba-core.css` 25b); vorher stand in der Bearbeitungsansicht ein einsames
  „Properties“ mit Leerraum über dem Titel. **Eigenschaften** im Menü zeigt sie für diese Notiz aufgeklappt (Lese- und
  Bearbeitungsansicht, Klasse `eba-eigenschaften` am Tab), bis man den Punkt noch einmal tippt oder Obsidian neu startet; im
  Quelltextmodus und in deinen eigenen Notizen bleibt alles wie in Obsidian. `start.js` nimmt Klassen einer vorher im selben Tab
  gezeigten Notiz wieder ab (sonst trug eine eigene Notiz danach z. B. `eba-notiz` weiter). Der Modulcode im Kopf öffnet die Modulseite.
- **Leere Abschnitte** (seit 19.10.2026): Notizen des Plugins zeigen keine Überschrift `##` mit nur leeren Punkten (`- `, `- [ ] `)
  darunter und keine leere Überschrift, auch ältere nicht und solche, die der Uni-Abgleich schreibt (dort ist oft „Das Wichtigste“
  gefüllt und „Offene Fragen“ leer). Die Notiz ändert sich nicht: In der Leseansicht markiert der Post-Processor Überschriften
  (`eba-abschnitt`) und Listen aus leeren Punkten (`eba-leer`), ob eine Überschrift wegfällt, entscheidet das CSS am Nachbarn
  (bleibt richtig, wenn Obsidian nur die geänderte Liste neu zeichnet); in der Bearbeitungsansicht der Begleitnotizen fallen die Zeilen
  (`leereAbschnitte`, `eba-leer-zeile`) weg, solange der Cursor nicht darin steht. Andere Notizen zeigen ihre Überschriften dort
  weiter: Dort schreibst du hinein. Gefaltet auf Höhe 0 (`eba-core.css` 64.4), nie `display: none`.
- **Kapitel der Folien als Markdown** (`cssclasses: eba, eba-folien`; seit 19.10.2026 auf allen Geräten, vorher nur iPhone):
  `start.js` klappt jedes `##` außer „Das Wichtigste“, „Zu tun“ und „Offene Fragen“ beim ersten Öffnen je Gerät zu (Obsidians
  Faltung, `foldManager`). Die Leseansicht nimmt die Faltung erst an, wenn sie ihre Abschnitte kennt: `start.js` fasst bis zu 15 × 200 ms
  nach und speichert erst dann (sonst schrieb `onMarkdownFold` „nichts gefaltet“ darüber). Ein Tipp irgendwo auf die Kapitelzeile
  klappt in der Leseansicht auf und zu. Zugeklappte Kapitel stehen wie ein Inhaltsverzeichnis untereinander (`eba-core.css` 31);
  die Regel für leere Abschnitte (64.4) lässt eine zugeklappte Überschrift stehen, obwohl ihr gleich die nächste folgt.
- **Eckdaten** (seit 19.10.2026): Der Kasten „Eckdaten“ der Begleitnotizen bis 0.4.6 wiederholte den Kopf (Modul, Art, Semester)
  und trug „Öffnen ↗ · Größe ⇅“. Neue Begleitnotizen haben ihn nicht mehr; bei älteren entfernt der Post-Processor jede Zeile, die das
  Plugin geschrieben hat (`eckZeileErzeugt`), und blendet den leeren Kasten aus. Eigener Text darin bleibt stehen, seit 0.7.0 ohne
  die Überschrift „Eckdaten“ (`eba-eck-rest`; vorher stand sie über einem einzelnen Link). Das gilt nur für
  Notizen mit PDF-Kasten (`hatPdfKasten`: eine PDF-Einbettung in einem Kasten), denn dort steht „Öffnen“. Bei Word, PowerPoint, Excel,
  ZIP oder einer sehr großen PDF ist „Öffnen ↗“ in den Eckdaten der einzige Weg zur Datei: Der Kasten bleibt, nur „Größe ⇅“ (Aktion
  `pdf` bis 0.4.6) fällt weg.

### Ändern nur im Modulfeld und im Kopf der Notiz (Entscheidung E4)

Tabellen und Listen zeigen nur an; ein Tipp auf eine Zeile öffnet ihre Notiz. Geändert wird an zwei Stellen: im Modulfeld
(`modul.js`: Status, Note, Versuch, Semester) und im Kopf der Notiz (siehe „Kopf-Karte“). Seit 0.4.6 zeichnet `tabellen.js` jede
Bases-Tabelle in einer Karte `[!eba-tabelle]` als Liste, auf allen Geräten und ohne Ausnahmen (vorher blieben am PC/iPad Tabellen
außerhalb von Modulseite, Noten & ECTS, Unterlagen und Stundenplan, „Mein Stand“ älterer Modulseiten, die Einstellungen und Karten
mit `handy-tabelle` bearbeitbar), und ein Kontrollkästchen steht als Pille da statt zum Antippen. Die Liste „Nachzuarbeiten“ des
Dashboards (`dashboard.js`, siehe [„Dashboard“](seiten.md)) zeigt Vorlesung und Datum ohne Kästchen; „Nachgearbeitet“ setzt der Kopf der Vorlesungsnotiz.

### Obsidian scheint nicht durch (`.obsidian/app.json`)

Seit 0.4.6 zeigt Obsidian keine Dateien, die es nicht öffnen kann (`showUnsupportedFiles: false`: JSON der Daten, Sicherungen,
`(neu X)`-Kopien), und **+** (neue Notiz) legt sie in `Vorlesungen/` an (`newFileLocation: folder`, `newFileFolderPath`): Die
Ordner-Automatik macht daraus eine Vorlesungsnotiz (läuft gerade etwas, sofort, sonst mit dem Fenster „Neue Vorlesungsnotiz“, auch
„Ohne Modul“); Abbrechen löscht die leere Notiz. Vorher legte **+** „Unbenannt.md“ im Stamm des Tresors an. Wer schon installiert
hat, bekommt beides über das Mischen der Einstellungen, aber nur, wenn noch die alten Vorgaben gelten (`update.js`, `VORGABE_NEU`,
`tests/update.test.js`); selbst Gewähltes bleibt. Weil das Update auf 0.4.6 noch der Planer von 0.4.4/0.4.5 plant (der das nicht
kennt), setzt die Reparatur danach einmal je Gerät dieselben Werte über Obsidians Einstellungen, nur wo noch der alte Wert gilt
(`vorgabenAnwenden`, Merker `eba-update-vorgabe-0.4.6`).

### Öffnen und Navigieren (`ctx.oeffnen`, `seitenleiste.js`, `start.js`)

- **Ein Weg zum Öffnen**: `ctx.oeffnen(ziel, { neu, quelle, zeile, cursor, modus, von })` im Kern (`main.js`). `ziel` ist eine Datei,
  ein Pfad oder ein Linktext (mit `#Überschrift`). Übersichtsseiten (`ctx.leseansicht.nurLesen`) und Begleitnotizen
  (`ctx.leseansicht.zuerstLesen`, seit 19.10.2026) öffnen in der Leseansicht, deine Notizen in der Bearbeitungsansicht; `modus`
  erzwingt eine Ansicht. Geöffnet wird im Tab, in dem getippt wurde (`von` bzw. der letzte
  Tipp, den der Kern im Capture-Modus merkt, weil Skripte `mousedown` oft selbst stoppen; nie in der Seitenleiste), sonst im aktiven;
  Zurück führt zurück, Strg/⌘ (`neu`) öffnet einen neuen Tab. Fokus und Cursor nur mit `cursor` (sonst springt auf iPhone und iPad die
  Tastatur auf). Vorher gab es sechs Wege (`openLinkText`, `getLeaf().openFile`, `blatt.openFile`, `ctx.oeffnen` …) mit
  verschiedener Ansicht; `tests/oeffnen.test.js` findet jeden anderen. Ausnahme: das Dashboard beim Start (`start.js`).
  Übergang nach dem Update: Auf Geräten, die das Update per Sync bekommen, läuft bis „Neu laden“ noch der alte Kern, dessen
  `ctx.oeffnen` (vor 0.4.6) nur Dateien kennt. Solange setzt `start.js` einen Ersatz mit denselben Regeln (Kernversion aus
  `plugin.manifest.version`), damit Zeilen und Kacheln auch vor dem Neuladen öffnen.
- **Von Übersichten zu deinen Notizen**: Geht ein Tab von einer gesperrten Seite (Dashboard, Studium/ …) zu deiner Notiz, auch über
  Obsidians eigene Links, öffnet sie in der Bearbeitungsansicht (`start.js`, Punkt 2; vorher nur, wenn der Tab vorher eine Notiz
  bearbeitet hatte).
- **Zeile antippen öffnet ihre Notiz**: Listen, Kalender, Zeitleiste, Raster, Tabellen als Liste und die **Kacheln des Dashboards**
  (`dashboard.js`, `data-pfad`: Frist und Prüfung ihre Notiz, ohne Frist Termine & Anmeldungen, ohne Prüfung Prüfungen, Semester den
  Studienverlauf, ECTS und Gesamtnote Noten & ECTS; vorher öffneten sie nichts), ebenso eine **Übungsgruppe** mit Notiz im Stundenplan
  (`gruppen.js`, `pfad`). Eine Nebenaktion steht als ein Knopf rechts in der Zeile („Meine“, „Abwählen“, „Lernen“), mehrere hinter
  „⋯“ mit Obsidians Menü (wie in der Kartenliste, `eba-lk-mehr`). Angebote öffnen ihre Seite im Browser, weil es dazu keine Notiz gibt.
- **Start**: Das Dashboard ist die Startseite, aber nicht mehr angeheftet (Entscheidung E6). Angeheftet hatte es schon das Startskript
  des Templater-Tresors, damit es bei jedem Start da ist; ein angehefteter Tab öffnet aber jeden Link in einem neuen Tab, Tabs stapelten
  sich, und Zurück führte nicht zum Dashboard. Beim Start zeigt der zuletzt benutzte Tab das Dashboard, wenn es nicht schon offen ist
  (die Notiz darin bleibt über Zurück erreichbar); die Anheftung früherer Fassungen nimmt `start.js` einmal je Gerät zurück
  (`eba-dashboard-frei`). Zurück zum Start geht jederzeit über **Dashboard** in der Übersicht.
- **Übersicht** (seit 19.10.2026, `seitenleiste.js`): seit 26.10.2026 ein Menü hinter ≡ unten rechts auf jedem Gerät (siehe
  unten); bis dahin ein eigener Tab (`ItemView`, Typ `eba-uebersicht`) in Obsidians linker Seitenleiste, am PC neben der Notiz,
  auf iPhone und iPad in der Schublade hinter dem Symbol oben links. Sie ersetzt das
  Raster-Menü, das bis 0.4.6 in Obsidians Kopfleiste jeder Notiz stand (`menue.js`, `view.addAction`); das Update entfernt
  `menue.js`, ein Gerät mit offener App nimmt das Symbol beim Löschen sofort weg (`skriptEntfernen` → `abmelden()`). Oben die
  Seiten aus `sichtbareZiele(ctx)` (`ZIELE`, einzige Liste; die Lesezeichen der Vorlage `.obsidian/bookmarks.json` folgen ihr,
  jede Seite hat ein eigenes Symbol, `tests/seitenleiste.test.js`; Stundenplan fehlt seit 24.10.2026, weil das Dashboard
  die Woche auf jedem Gerät als Raster zeigt; 0.6.6 führte die Seite nur am iPhone, wo das Dashboard damals einen Tag zeigte),
  darunter „Dieses Semester“ mit den Modulen
  nach `diesesSemester` (`eba.js`, dieselbe Regel wie die Gruppe „Dieses Semester“ im Fenster „Neu …“), Modulcode statt Symbol. Im
  Akzent steht die Seite, die vorn offen ist, bei Notizen mit `code` (Unterlagen, Vorlesungen, Termine …) auch ihr Modul. Ein Tipp
  öffnet über `ctx.oeffnen` und schließt das Menü. Tabs „Übersicht“ aus früheren Fassungen entfernt das Skript beim Start
  (`entfernen`) und schließt dabei die linke Seitenleiste, am PC mit `collapse()`, auf dem iPad, wenn sie angeheftet war, mit
  `app:toggle-left-sidebar`. Die Ansicht bleibt dafür angemeldet: Obsidian baut Tabs eines Typs, der sich später anmeldet, selbst
  neu auf („view-registered“), nur dann findet `getLeavesOfType` sie. Das Symbol des Tabs ist ein eigenes SVG (`addIcon`, Strich als Attribut), nicht Obsidians
  `layout-grid`: über `setIcon` blieb es auf dem iPad leer. Seiten, die noch nicht fertig sind (`IN_ENTWICKLUNG`: Lernplan seit
  19.10.2026, Karteikarten seit 24.10.2026), sind abgeblendet und tragen rechts die Pille „in Entwicklung“ (`.is-entwicklung`,
  `.eba-sl-entwicklung`). Stil: `eba-core.css` Abschnitt 66.
  Obsidians Einstellungen, Dateien und Tresor stehen unter Einstellungen & Hilfe → Obsidian (`eba-personalisieren obsidian`,
  `personalisieren.js`; seit 24.10.2026, vorher unten in der Schublade, die bis 26.10.2026 die Übersicht zeigte und Obsidians
  Teile darin so lange ausblendete): Obsidian-Einstellungen, Dateien mit ihrer Zahl, Tresor mit seinem Namen; jede Zeile ruft Obsidians eigenen Befehl auf
  (`app:open-settings`, `file-explorer:open`, `app:open-vault`). Für den Tresor ist das „Tresore verwalten“, wie der Eintrag
  im Auswahlmenü unter dem Tresornamen: `app:switch-vault` öffnet auf iPhone und iPad nur eine Liste zum Wechseln, löschen
  und umbenennen geht nur in der Verwaltung (Obsidian 1.14.5, 25.10.2026).
  Oben rechts zeigen iPhone und iPad keine Obsidian-Knöpfe (seit 26.10.2026): Man hielt sie für die Navigation. Abschnitt 66
  blendet mit `body.eba-plugin-an.is-mobile` die Liste der Tabs (`.workspace-tab-header-tab-list`), den Umschalter der
  rechten Seitenleiste (`.sidebar-toggle-button.mod-right`), das Lesezeichen (`.view-action.mod-bookmark`) und Obsidians „⋯“
  aus. Das „⋯“ hat keine eigene Klasse, nur sein Symbol (`.view-action:has(> .lucide-more-vertical)`, auf iOS per CSS gedreht).
  Die Notizen des Plugins haben ihr eigenes „⋯“ im Kopf (`kopf.js`), der Rest steht unter Einstellungen & Hilfe → Obsidian.
  Der Umschalter Lesen/Bearbeiten (`modeButtonEl`) bleibt, auf Seiten des Plugins blendet ihn `start.js` aus. Am PC und ohne
  laufendes Plugin bleibt Obsidian, wie es ist.
  Auf iPhone und iPad stehen die Seiten seit 26.10.2026 im Menü hinter ≡ unten rechts (Rückmeldung: dasselbe Symbol an derselben
  Stelle auf beiden; vorher die Schublade hinter ⎕ oben links). Das ≡ ist Obsidians eigener Knopf in der Leiste unten
  (`app.mobileNavbar.ribbonMenuItemEl`); `seitenleiste.js` ersetzt nur `onRibbonMenuClick` (Obsidian liest es bei jedem Tipp) und
  das Symbol (eigenes SVG, Lucide „menu“; sonst trüge der Knopf das Symbol eines eingestellten „Quick ribbon item“). Beides setzt
  Obsidian in `updateRibbonMenuItem` zurück (beim Start und wenn sich „Quick ribbon item“ ändert), darum umhüllt das Skript diese
  Methode an der Instanz; `abmelden()` gibt alles zurück. Langes Drücken zeigt weiter Obsidians Menü der Befehle
  (`showRibbonMenu`). Auf dem iPad blendet Obsidian die Leiste aus (`body.is-tablet .mobile-navbar`); Abschnitt 66 zeigt sie dort
  mit denselben sieben Knöpfen im selben Maß wie auf dem iPhone (Zurück, Vor, Suche, „+“, Zahnrad, Tabs, ≡; Obsidians
  `mobileTabSwitcher` gibt es auf jedem Mobilgerät), so weit vom rechten Rand der Hauptfläche wie vom unteren Rand (mit
  angehefteter rechter Seitenleiste links neben ihr: `hauptRechts` misst die Hauptfläche mit einem `ResizeObserver` und setzt
  `--eba-haupt-rechts` an `body`, seit 27.10.2026; vorher lag die Seitenleiste über der Leiste, ≡ und Zahnrad waren nicht zu
  erreichen; gemessen auf jedem mobilen Gerät, denn Obsidian wechselt iPhone- und iPad-Ansicht laufend mit der Fenstergröße,
  die Regel gilt nur mit `body.is-tablet`), und blendet Zurück und Vor der Kopfleiste
  (`.view-header-nav-buttons`) und „+“ der Tab-Leiste (`.workspace-tab-header-new-tab`) in der Hauptfläche aus (seit 26.10.2026,
  Rückmeldung: „Move the arrows to the Bar down there the plus sign also. Same Icons as on iphone“, dann „Die gleichen 7 icons wie bei
  iphone in der Leiste auch bei ipad“). Hat der Editor den Fokus, nimmt Obsidian die Leiste weg (`mobileNavbar.hide`, dafür
  seine Werkzeugleiste `app.mobileToolbar`, `body.mod-toolbar-open`); mit einer Tastatur am iPad bleibt das oft lange so.
  `werkzeugPfeile` setzt darum ‹ › als eigene Gruppe vorn in die Werkzeugleiste (`.eba-nav-werkzeug` mit Obsidians Klassen
  `mobile-toolbar-floating-options`, `mobile-toolbar-option`; Obsidian baut die Werkzeugleiste nie neu), `mousedown` ohne
  Folgen wie bei Obsidians Befehlen, Zurück und Vor über `history.go` des aktiven Tabs, ohne Verlauf ausgegraut
  (`aria-disabled`, neu nach `file-open` und `active-leaf-change`). Nur auf dem iPad (Abschnitt 66; seit 27.10.2026, bis dahin
  gab es beim Schreiben keine Navigation): Auf dem iPhone ist die Werkzeugleiste schmal, und wer die Tastatur schließt, hat die
  Leiste wieder. ≡ und Zahnrad fehlen beim Schreiben weiter (vor dem Umbau standen dabei nur ‹ › oben in der Zeile). Das Menü (`.eba-nav-menue`, `menueAuf`) zeichnet dieselben Zeilen
  wie der Tab (`zeichnen`) über der Leiste, rechts bündig mit ihr (`menueLage`, rein, getestet); ist es zu lang, scrollt es. Ein
  Tipp auf eine Zeile öffnet die Seite und schließt das Menü, ein Tipp daneben (durchsichtige Fläche `.eba-nav-hinter`, auch
  über dem ≡) oder Esc schließt es (ein Hörer über `ctx.dom` für die ganze Laufzeit), ebenso Drehen, ein geteiltes Fenster auf
  dem iPad oder ein anderes Fenster am PC (`resize`, seit 27.10.2026; vorher blieb es an der alten Lage der Leiste, nach dem
  Drehen des iPhones über dem oberen Rand). Beim Abmelden ist ein offenes Menü weg,
  auf jedem Gerät (`ctx.aufraeumen(menueZu)`; bis 27.10.2026 blieben am PC Menü, Fläche und der Hörer für Esc stehen). Mit
  der Tastatur (seit 27.10.2026; vorher erreichte sie am PC keine Zeile): Die Zeilen sind Einträge eines Menüs (`role="menuitem"`,
  `tabindex="-1"`, die Listen dazwischen `role="none"`); Enter oder Leertaste auf ≡ öffnet es mit dem Fokus auf der offenen Seite
  bzw. der ersten Zeile, ↑ und ↓ wandern (im selben Hörer wie Esc), Enter oder Leertaste öffnet eine Zeile, Esc gibt den Fokus
  dem ≡ zurück. Mit Maus oder Finger geöffnet, bleibt der Fokus, wo er war. Den Tab „Übersicht“ entfernt das Skript auf iPhone und iPad beim Start; war er auf dem iPad
  angeheftet, löst es die Seitenleiste mit `app:toggle-left-sidebar`. Obsidians Umschalter ⎕ blendet Abschnitt 66 aus
  (`.view-action.mod-left-split-toggle`, `.sidebar-toggle-button.mod-left` außer dem eigenen der Kopfleiste).
  Wischen nach rechts öffnet die linke Seitenleiste nicht mehr, sondern geht zurück wie ‹ (seit 26.10.2026, Rückmeldung: „Swiping
  from the left shouldn't open the sidebar but do the same as the back arrow as in go back one page“). Obsidian meldet jede
  Geste auf seiner Fläche als Ereignis `swipe` der Workspace (`workspace.trigger("swipe", g)`, app.js 1.14.5); die linke
  Seitenleiste zieht sich auf, wenn ein Finger waagerecht zu ihr hin wischt, von überall auf der Fläche, und beide Seitenleisten
  zu oder angeheftet sind. `wischenUebernehmen` umhüllt `trigger` an der Instanz: So eine Geste (`zurueckGeste`, rein, getestet)
  erreicht Obsidians Hörer nicht, für sie täte sonst keiner etwas. Beginnt sie in der Hauptfläche (`rootSplit`) und am linken
  Rand (seit 27.10.2026, Rückmeldung: „Nur vom linken Rand“; `amRand`, rein, getestet: im Streifen von `ZURUECK_RAND` = 30 px ab dem
  sicheren Rand `--safe-area-inset-left`, bei Sprachen von rechts nach links rechts; so breit wie das Zurück vom Rand bei iOS
  und wie `RAND` in `woche.js`, ab dem das Wochenraster blättert; beide zählen ab dem sicheren Rand, seit 27.10.2026 auch das
  Raster, das vorher ab dem Bildschirmrand zählte und neben der Notch zugleich blätterte und den Hinweis zeigte), geht es beim Loslassen zurück, wenn sie weit genug war (`zurueckWeit`: mindestens 40 px und mit Obsidians Hochrechnung aus Weg und
  Geschwindigkeit 100 px), mit `history.go(-1)` des aktiven Tabs wie Obsidians ‹. Weiter innen tut so eine Geste nichts, auch
  keine Seitenleiste; Kästen im Wochenraster und breite Tabellen bleiben so unberührt. Ist die Seitenleiste auf dem iPad
  angeheftet, liegt sie am Rand, nicht die Hauptfläche: Dann geht es mit ‹ zurück. Dabei rutscht Obsidians eigener Hinweis von
  Zurück mit zwei Fingern mit dem Finger von links herein (seit 27.10.2026, Rückmeldung: „Ich hab nur die eine spezifische Pille nicht
  gemocht“): `div.pull-action.pull-out-action` an `body` mit dem Text „Zurück“ (Obsidian schreibt den Namen von `app:go-back` in seiner
  Sprache, auf Englisch „Navigate back“; Rückmeldung: „Ganze app ist deutsch“), Stil aus
  Obsidians CSS und dem Design, Bewegen und Hinausgleiten gerechnet wie dort (`hinweisLage`, rein, getestet). Ganz da und aktiv
  (`mod-activated`) ist er ab `WISCH_WEIT`, der Strecke, ab der ein langsames Wischen sicher zurückgeht (Obsidian nimmt 90 px);
  kurz und schnell geht es auch zurück, ohne dass er ganz da war, denn die Geschwindigkeit kennt erst das Loslassen. Beim
  Loslassen gleitet er hinaus und ist danach weg, beim Abbrechen und Abmelden sofort. Fehlt `createDiv`, geht es ohne ihn
  zurück. Nach links wischen öffnet weiter die rechte
  Seitenleiste, eine offene schließt man weiter durch Wischen, mit zwei Fingern geht es weiter zurück und vor. Fehlt `trigger`,
  `rootSplit`, `history.go` oder ein Feld der Geste (Umbau durch Obsidian) oder geht beim Entscheiden etwas schief, bleibt
  alles bei Obsidian; `abmelden()` gibt `trigger` zurück. Die linke Seitenleiste öffnen Einstellungen & Hilfe → Obsidian →
  Dateien (darin oben die Auswahl: Suche, Tags, Eigenschaften, Lesezeichen) und Obsidians Befehle; angeheftet (iPad) bleibt sie
  stehen und schließt mit dem ⎕ der Kopfleiste.
  Herunterziehen oben auf einer Seite führt keinen Befehl mehr aus (seit 26.10.2026, Rückmeldung: „Remove access to command palette
  via swiping down. No users uses it it opens often by mistake.“). Obsidian zeigt dabei einen Hinweis und führt beim Loslassen
  seine Schnellaktion aus (`mobilePullAction`, ab Werk `command-palette:open`); dieselbe Hülle gibt so eine Geste
  (`herunterGeste`: ein Finger, senkrecht, nicht nach oben, in der Hauptfläche) nicht weiter. Obsidians Einstellung bleibt
  unberührt und gilt ohne das Plugin wieder; eine selbst gewählte Schnellaktion fällt also ebenso weg. Scrollen bleibt: Obsidian
  meldet eine Geste nur, wenn die Seite in diese Richtung nicht mehr scrollen kann. Die Befehlspalette öffnet weiter langes
  Drücken auf ≡ (Obsidians Menü, darin „Befehlspalette öffnen“) und eine Tastatur mit Strg/⌘+P.
  Am Ende einer Notiz zeigt `leisteAmEnde` in der iPhone-Ansicht die Leiste wieder (seit 27.10.2026, Rückmeldung: „Too much blank space“;
  angemeldet auf jedem mobilen Gerät, auch ein iPad im schmalen Split View hat die iPhone-Ansicht, und Obsidian entscheidet sie
  laufend):
  Obsidian blendet sie beim Scrollen nach unten aus und erst beim Scrollen nach oben oder einem Tipp wieder ein, den Platz für
  sie hält `eba-core.css` 36d unten frei, und der stand dann leer da. Das Skript hört im Einfangen am Dokument auf `scroll` der
  Lese- und Bearbeitungsansicht und ruft nach `ENDE_RUHE` (150 ms) ohne Scrollen, wenn Obsidian die Leiste verborgen hat
  (`is-hidden-nav`) und es weniger als
  `ENDE_REST` (4 px) bis unten sind (`amEnde`, rein, getestet), Obsidians `mobileNavbar.restoreNavigation()` auf, wie Safari
  seine Leiste am Seitenende zeigt. `is-hidden-nav` prüft erst dieser Rückruf: Im Einfangen kommt das Skript vor Obsidians Hörer
  an der Scrollfläche, der die Leiste im selben Ereignis verbirgt; mit der Prüfung schon beim Ereignis blieb sie nach einem
  einzigen Sprung ans Ende (Link zu einer Überschrift) verborgen (bis 27.10.2026, Test mit Gerüst).
  Auf iPad und PC steht die Leiste immer da, unten rechts. Wo das Plugin Obsidians Auslauf am Seitenende kürzt (`eba-core.css`
  34 und 4: Seiten mit `.eba`, Vorlesung, Übungsblatt, Termine in der Bearbeitung), hält 36d seit 27.10.2026 so viel frei, dass
  der letzte Block mindestens 12 px über ihr steht: iPad Obsidians Maße der Leiste weniger 4 px (die Leseansicht hat dort unten
  16 px Rand), PC 74 px (Leiste 40 px über der Unterkante, 48 px hoch, Rand der Leseansicht 32 px). Gemessen auf neun Seiten:
  iPad 14 bis 26 px, PC (800 × 600 und 1440 × 900) 13 bis 30 px; vorher lag der letzte Block bis 44 px unter der Leiste. Andere
  Notizen behalten Obsidians Auslauf (etwa eine halbe Fensterhöhe). `tests/seitenleiste.test.js` prüft, dass jede kürzende
  Regel für iPad und PC eine in 36d hat.
  Das Zahnrad (seit 26.10.2026) öffnet Einstellungen & Hilfe über `ctx.oeffnen`. `zahnradEinsetzen` setzt es gleich
  hinter Obsidians „+“ (`.mobile-navbar-action-new-tab`) in die Leiste, mit Obsidians Markup (`div.mobile-navbar-action` mit
  `span.clickable-icon`, Klasse `eba-nav-zahnrad`): So sieht es aus wie die anderen Knöpfe und bekommt dieselbe Rückmeldung beim
  Tippen. Obsidian baut die Leiste nie neu, es hängt sie nur ein und aus; das Zahnrad verschwindet also mit ihr beim Scrollen und
  bei offener Tastatur. Findet das Skript „+“ nicht, etwa nach einem Umbau durch Obsidian, setzt es kein Zahnrad, und die Leiste
  bleibt, wie Obsidian sie baut. Zuerst sollte es „+“ ersetzen, weil sieben Knöpfe die Leiste (höchstens 316 px) unter 44 pt je
  Knopf stauchen; „+“ blieb („there's enough space“). Solange das Zahnrad dasteht, fehlt Einstellungen & Hilfe im Menü
  (`menueOhne`, Rückmeldung: „Redundant“).
  Am PC (seit 26.10.2026, Rückmeldung: „überall gleich“) hat Obsidian keine Leiste unten. `pcLeiste` setzt eine eigene
  unten rechts über die Statusleiste (`.eba-nav-leiste`, Abschnitt 66: Glasfläche `--raised-background`, runde Enden wie Obsidians
  Leiste auf iPhone und iPad), seit 27.10.2026 mit denselben sieben Knöpfen wie dort (Rückmeldung: „iPad und iPhone und pc die
  gleichen 7 Symbole“; bis dahin nur Zahnrad und ≡): Zurück und Vor gehen im Verlauf des Tabs vorn in der Hauptfläche
  (`history.go` von `getMostRecentLeaf(rootSplit)`; ohne Verlauf `aria-disabled` und ausgegraut, ein Klick tut dann nichts; neu
  bei `file-open`, `active-leaf-change`, `layout-change`), Suche öffnet Obsidians Schnellwechsler wie die Suche auf iPhone und
  iPad (`internalPlugins` „switcher“, `onOpen`), „+“ `workspace:new-tab`, Zahnrad Einstellungen & Hilfe, Tabs die offenen Tabs.
  Obsidian hat am PC keine Tab-Übersicht wie `mobileTabSwitcher`; das nächste Gleiche ist sein Menü hinter ⌄ in der Tab-Leiste,
  darum Obsidians `Menu` mit denselben Einträgen (Name, Symbol, Haken am vorderen), aber allen Tabs der Hauptfläche
  (`iterateRootLeaves`), rechts bündig mit dem Knopf und 8 px über der Leiste (Obsidian legt ein Menü, das darunter Platz hat,
  sonst unter den Punkt); die Zahl im Rahmen (Obsidians Symbol `tab-frame`) zählt sie wie auf dem iPhone. Die Knöpfe sind
  Obsidians `clickable-icon`, 40 px, mit Tab, Enter und Leertaste bedienbar (Leertaste ohne Scrollen); nach ‹ › mit der Tastatur
  bleibt der Fokus auf dem Knopf, das Menü der Tabs geht mit ↑ ↓ Enter Esc (Obsidians Menü). Obsidians eigene Zurück und Vor
  (`.view-header-nav-buttons`) und „+“ (`.workspace-tab-header-new-tab`) blendet Abschnitt 66 am PC in der Hauptfläche aus, solange
  das Plugin läuft; Seitenleisten-Umschalter, ⌄ und Fensterknöpfe bleiben in der Zeile. Ist die Hauptfläche schmaler als die
  Leiste (unter 340 px), bricht sie in weitere Reihen um. Das Seitenende (74 px, 36d) bleibt: Die Leiste ist breiter, aber gleich
  hoch, gemessen auf neun Seiten 14 bis 30 px Lücke (1440 × 900 und 800 × 600). Obsidians
  Umschalter der linken Seitenleiste öffnet sie weiter (Dateien, Suche). Die Leiste hängt in der Hauptfläche
  (`app.workspace.rootSplit.containerEl`, bei Obsidian `position: relative`) mit `position: absolute` unten rechts: So folgt sie
  der rechten Seitenleiste beim Öffnen, Schließen und Ziehen ohne eigene Messung und liegt nie über ihr (seit 27.10.2026; bis
  dahin `position: fixed` in der Fensterecke, über dem Inhalt einer offenen rechten Seitenleiste). Ersetzt Obsidian die
  Hauptfläche (anderes Layout, etwa über das Kern-Plugin „Arbeitsbereiche“), hängt `einhaengen` sie beim nächsten
  `layout-change` um. Popout-Fenster haben keine Leiste (entschieden am 27.10.2026): Dort steht meist eine einzelne Notiz
  neben dem Hauptfenster, und Seiten und Einstellungen öffnet man im Hauptfenster. Obsidians Zurück, Vor und „+“ bleiben dort
  oben: `eba-core.css` blendet sie nur in `.mod-root:has(> .eba-nav-leiste)` aus, denn auch die Hauptfläche eines
  Popout-Fensters ist eine `.mod-root`.
- **Kopfleiste: der Name einmal** (seit 0.7.0, `kopfleiste.js`, `eba-core.css` Abschnitt 70; Regel und Gründe in
  [design.md](../design.md), „Kopfleiste und Tabs“). Das Skript misst nur und setzt zwei Klassen am Tab
  (`.workspace-leaf-content`): `eba-titel`, wenn die Notiz oben einen Titel zeigt (`.inline-title`, `h1` oder
  `.cm-line.HyperMD-header-1`, nicht in eingebetteten Notizen, `titelIn`), und `eba-titel-weg`, wenn er über der Unterkante der
  Kopfleiste verschwunden ist (`zustandAus`, rein, `tests/kopfleiste.test.js`). Ein `# …` zählt nur bis `OBEN_MAX` (480 px)
  unter dem Anfang des Inhalts; auf dem Dashboard schieben Update-Hinweis und „Seit deinem letzten Besuch“ den Gruß bis etwa
  300 px nach unten. Entlädt die Leseansicht beim Scrollen den Abschnitt mit dem Titel, gilt er ab `ENTLADEN_AB` (600 px) als
  weg, wenn dieselbe Notiz im selben Tab vorher einen hatte. Gemessen wird nach `layout-change`, `active-leaf-change`,
  `file-open` (dazu nach 80, 300 und 1000 ms, Obsidian zeichnet nach und nach), `css-change`, Größenänderung und beim Scrollen
  (`scroll` steigt nicht auf: im Einfangen am Tab, so trifft es Lese- und Bearbeitungsansicht), höchstens einmal je Bild
  (`requestAnimationFrame`). Abschnitt 70 blendet mit `body.eba-plugin-an` den Namen (`.view-header-title-container`, auch
  Obsidians Ordnerpfad) aus, solange `eba-titel` ohne `eba-titel-weg` am Tab steht (Deckkraft, `visibility` für
  Bildschirmleser, 0,15 s); mit `eba-titel-weg` trennt auf iPad und PC eine Linie die Kopfleiste vom Inhalt (`box-shadow: inset 0
  -1px 0`, ohne Verschieben). Obsidians Ordnerpfad (`.view-header-title-parent`) zeigt die Leiste nie, auch über PDFs und
  eigenen Notizen nicht (seit 26.10.2026). Auf dem iPhone bleibt Obsidians Regel `.is-phone.show-inline-title … { display:
  none }`, der Name erscheint dort auch gescrollt nicht (seit 26.10.2026, Rückmeldung: „I don't like this pill“; bis dahin hob
  Abschnitt 70 sie mit `eba-titel-weg` auf und legte eine Glasfläche über die ganze Breite hinter Knöpfe und Name). `eba-titel` und
  `eba-titel-weg` steuern dort nur noch, wo Obsidians Maske über dem Inhalt endet. Tabs ab dem zweiten:
  `.workspace-tabs:not(.mod-stacked):not(:has(.workspace-tab-header + .workspace-tab-header))`; am PC fehlt nur der Tab
  (`.workspace-tab-header-container-inner`), die Zeile bleibt (Fensterknöpfe, Verschieben des Fensters). Auf dem iPad liegt die
  Tab-Leiste mit jeder Zahl von Tabs durchsichtig über der Kopfleiste (`position: absolute`, Höhe `--view-header-height`), nur
  die Tabs und der Umschalter einer angehefteten Seitenleiste fangen Tipps; die Kopfleiste rückt nur für diesen Umschalter links
  64 px ein, und `.mod-root` bekommt oben
  (Statusleiste) `--background-primary` statt der Farbe der Tab-Leiste. Ab zwei Tabs stehen die Tabs (`position: absolute`)
  vor den Knöpfen rechts: `platzAus` (rein, getestet) rechnet aus den Rechtecken des eigenen Umschalters und von `.view-actions`
  (Lesen/Bearbeiten, nicht jede Ansicht hat es) den Platz, ohne sie ab `RAND` (22 px wie der Text), und setzt ihn als `--eba-kopf-links` und
  `--eba-kopf-rechts` an die Tab-Gruppe (nach denselben Ereignissen, nicht beim Scrollen); der Name in der Kopfleiste ist dann
  ganz verborgen, er steht im offenen Tab. Bis 26.10.2026 galt die eine Zeile nur mit einem Tab, mit zwei zerfiel sie in zwei.
  Mit einem Tab (ohne angeheftete Seitenleiste) liegt die Kopfleiste auf Notizen des Plugins (Klassen `eba`, `eba-s-…` wie in
  70.1, nicht `eba-titel`: die stehen von Anfang an, nichts springt) absolut über dem Inhalt, der Titel steht in ihrer Zeile;
  mit `eba-titel` ohne `eba-titel-weg` ist sie durchsichtig und lässt Tipps durch (außer Lesen/Bearbeiten). Seit 26.10.2026,
  Rückmeldung: „Empty Space up top“. Seit 27.10.2026 ebenso auf allen Notizen, solange Obsidian den Inline-Titel zeigt
  (`body.show-inline-title`, in der Vorlage an): Dann beginnt jede Notiz mit einem Titel (Dateiname oder ihr „# …“, Abschnitt 26),
  vorher blieb über dem Titel eigener Notizen die leere Zeile. Eine Zeile „# …“ am Anfang verliert in der Bearbeitung Obsidians
  Abstand vor Überschriften (`:first-child`), so stehen Lese- und Bearbeitungsansicht gleich hoch (gemessen 75 px, vorher 127).
  Auf dem iPhone rückt der Inline-Titel eigener Notizen mit negativem Rand in die Zeile (er liegt vor dem Inhalt von CodeMirror,
  in beiden Ansichten), „# …“ ohne Eigenschaften in der Leseansicht wie nach den Eigenschaften, in der Bearbeitung, wenn davor
  höchstens zwei Leerzeilen stehen (die fallen dort weg, mit Fokus und Cursor darin nicht): `anfangAus` (rein, getestet) liest das
  aus dem Text im Editor (`ersteZeilen`, „# …“ wie CodeMirror: „#“ allein oder „# “, nicht „#Wort“; Leerzeilen wie Abschnitt 26)
  und setzt `eba-h1-oben` am Tab, dazu `eba-h1-anfang` (ebenso, Eigenschaften erlaubt), auf jedem Gerät. Neu entschieden wird bei
  Obsidians `editor-change`, das aus CodeMirror heraus kommt, bevor das Bild gezeichnet wird: Die Klasse wechselt im selben Bild,
  in dem „# “ zur Überschrift wird, wer „# “ tippt, sieht einen Wechsel. Bis 27.10.2026 kam sie aus Obsidians Metadaten, etwa
  2 s später, der Titel sprang zweimal (10 px tiefer, dann 55 px hoch), und mit einer Leerzeile vor „# …“ blieb die leere Zeile
  darüber (iPhone 76 px, iPad 24 px). Nicht aus dem Editor selbst (DOM): CodeMirror entlädt weit oben liegende Zeilen beim
  Scrollen. Darum blendet `eba-h1-anfang` beim Bearbeiten auch den Inline-Titel aus, der mit Abschnitt 26 allein weit gescrollt
  zurückkam (der Text sprang dabei 19 px). Mit Eigenschaften davor bleibt beim
  Bearbeiten die Zeile frei, auf iPhone und iPad steht der Titel dort tiefer als beim Lesen (iPad 61 px): Die Eigenschaften
  zeigt Obsidian nur beim Bearbeiten (Abschnitt 26 blendet sie beim Lesen aus). `schwebendAus` erkennt die absolute Kopfleiste, damit `linieAus` wie auf dem
  iPhone ihre Oberkante nimmt. Rechts neben dem Titel hält das iPad wie das iPhone Platz für Lesen/Bearbeiten frei (Float bzw.
  Innenabstand, 34 px; seit 27.10.2026, vorher lief ein langer Titel in schmalen Fenstern unter den Knopf).
  Am PC liegt die Kopfleiste ebenso über dem Inhalt (seit 0.7.0, Rückmeldung vom 27.10.2026: „Ja wie auf dem ipad“), solange die
  Hauptfläche eine Tab-Gruppe hat (`.mod-root:has(> .eba-nav-leiste):not(:has(.workspace-tabs ~ .workspace-tabs))`), mit jeder
  Zahl von Tabs: Die stehen am PC in der Tab-Leiste darüber, im Fluss spränge der Inhalt beim zweiten Tab. Popout-Fenster haben
  keine Leiste unten (Zurück und Vor stehen dort noch in der Kopfleiste) und behalten Obsidians Zeile, ebenso PDFs und andere
  Ansichten. Durchsichtig nehmen nur ihre Knöpfe (`.clickable-icon`, 48–72) Klicks, nicht `.view-actions`, das so hoch ist wie
  die Zeile (40–80). Obsidians Abstand oben (32 px) bleibt, der Titel beginnt bei 72 unter den Knöpfen, Platz rechts braucht
  er darum nicht; das Dashboard (16 px oben, Datum und Karten bis an den rechten Rand) beginnt an der Unterkante der Zeile. In der
  Bearbeitung steht der Titel so hoch wie beim Lesen (vorher 42 px tiefer): Die Leerzeile vor „# …“ bleibt ganz, oben fällt so viel
  weg, wie sie hoch ist (`calc(var(--size-4-8) - 2px - var(--line-height-normal) * var(--font-text-size))`), so springt mit dem
  Cursor darin nichts; eigene Notizen mit „# …“ am Anfang wie auf dem iPad.
  Sprungziele und Cursor (seit 27.10.2026): Liegt die Kopfleiste über dem Inhalt (iPad mit einem Tab, PC mit einer Tab-Gruppe,
  iPhone), verdeckt sie den
  oberen Rand der Scrollfläche, und ein Sprung zu einer Überschrift landete beim Lesen unter ihr, ebenso der Cursor, der mit den
  Pfeiltasten nach oben wandert. `ueberdecktAus` (rein, getestet) rechnet die verdeckte Höhe (wo die Leiste steht, wenn sie zu
  sehen ist); beim Bearbeiten hält CodeMirror sie frei (`EditorView.scrollMargins` über `ctx.editor`), beim Lesen rückt ein
  Sprung (`MarkdownPreviewRenderer.applyScroll` mit `highlight`, ohne `center`: Link mit #, Gliederung, Rückverweis) das Ziel um
  sie nach unten. CSS `scroll-padding` hilft nicht: Obsidian setzt beim Lesen `scrollTop` selbst. Wiederherstellen und Umschalten
  bleiben, wie Obsidian sie macht, so wandert nichts (geprüft: sechsmal umgeschaltet, gleiche Lage). Wird der Cursor gesetzt und
  steht danach im Bild unter der Leiste (`unterLeisteAus`, rein, getestet), rückt seine Zeile gleich darunter (ein
  `updateListener` über `ctx.editor`: nur mit Fokus, nur ein Cursor, nicht beim Tippen). Auf dem iPhone lag ein Cursor dicht unter
  der Statusleiste nach dem Scrollen unter dem Platz der weggeschobenen Leiste, und erst der erste Tastendruck rückte den Text
  48 px, mitten ins Tippen (bis 27.10.2026). Den Rand nur für die weggeschobene Leiste zu rechnen ginge nicht: Obsidian holt
  sie mit dem nächsten Tipp oder beim Zurückscrollen zurück, dann läge sie über dem Cursor.
  Ist die linke Seitenleiste angeheftet (Schublade `.workspace-drawer.mod-left.is-pinned`), nimmt Obsidian seinen Umschalter aus
  der Zeile; `uebersichtKnopf` setzt dann vorn in die erste Tab-Gruppe einen gleichen (`.eba-uebersicht-knopf` mit Obsidians
  Klassen und Symbol), der `app:toggle-left-sidebar` ausführt: Obsidians Befehl löst die Seitenleiste und schließt sie, danach
  ist der eigene weg. Obsidians eigenen Umschalter blendet Abschnitt 66 seit 26.10.2026 aus (die Seiten stehen hinter ≡). Anheften und Lösen meldet Obsidian nicht als Ereignis; ein
  `MutationObserver` auf die Klasse der Schublade misst dann neu. Gestapelte Tabs (`mod-stacked`) bleiben, wie Obsidian sie
  zeigt. `abmelden()` nimmt Klassen, Variablen und den eigenen Umschalter wieder weg.

### Rundgang (`rundgang.js`, seit 27.10.2026)

Die Navigation hat sich am 26.10.2026 stark geändert (oben, „Öffnen und Navigieren“). Darum zeigt ein kurzer Rundgang einmal je
Gerät, wo alles ist (Rückmeldung: „there should be a few explainer screens that say something like: Navigation now lives here arrow.
Settings have moved here arrow“). Je Schritt liegt ein Ring um den echten Knopf, daneben eine Blase mit einem Satz, „1 von 3“ und
**Weiter** (im letzten Schritt **Fertig**):

| Schritt | Ziel | Satz (wer die alte Navigation kennt) |
|---|---|---|
| Seiten | ≡: auf iPhone und iPad `app.mobileNavbar.ribbonMenuItemEl`, am PC `.eba-nav-seiten` in `.eba-nav-leiste` | Alle Seiten und deine Module findest du jetzt hier. |
| Einstellungen | Zahnrad `.eba-nav-zahnrad` (auf iPhone und iPad in Obsidians Leiste, am PC in der eigenen) | **Einstellungen & Hilfe** öffnest du jetzt hier. |
| Wischen (nur iPhone und iPad) | Streifen am linken Rand, so breit wie `ZURUECK_RAND` ab dem sicheren Rand (`randStreifen`) | Vom linken Rand nach rechts wischen bringt dich jetzt eine Seite zurück. |

- **Wortlaut:** Nach einer neuen Einrichtung fehlt „jetzt“ (`ersterStart`: Einrichtung noch fällig oder in dieser Sitzung von
  selbst gezeigt), denn wer neu ist, kennt die alte Navigation nicht. Ebenso, wenn du ihn selbst noch einmal aufrufst (Zeile
  Rundgang, Befehl; `zeigen({ wieder: true })`): „jetzt“ steht nur beim einen Mal, das von selbst kommt (seit 27.10.2026, Rückmeldung:
  „irgendwann wegfallen“). Der Schritt Wischen fehlt, wenn die linke Seitenleiste auf
  dem iPad angeheftet ist (dann liegt sie am Rand, Wischen geht dort nicht zurück); bei Sprachen von rechts nach links heißt er
  „Vom rechten Rand nach links“. Alles fest auf Deutsch, keine Namen von Obsidians Befehlen (die wären auf einem englischen
  Obsidian englisch).
- **Lage:** gemessen an den Rechtecken der echten Knöpfe; der Ring ist ein Kreis um den Knopf (`ringLage`), die Blase steht
  10 px darüber, rechts bündig 12 px vom Fensterrand, mit der Spitze über der Mitte des Knopfs, nie in ihrer Ecke
  (`blasenLage`); oben ohne Platz darunter. Beim Wischen steht sie rechts neben dem Streifen und rückt nur in der Höhe. Alles
  im sicheren Bereich (`--safe-area-inset-*`). Neu gemessen bei jeder Größenänderung (Drehen, geteiltes Fenster) und 300 ms
  danach, wenn Obsidian die Leiste nachgesetzt hat. Fehlt das Ziel eines Schritts, entfällt er; ohne jedes Ziel sagt ein Hinweis,
  dass der Rundgang gerade nicht geht. Hat Obsidian die Leiste auf dem iPhone beim Scrollen verborgen (`is-hidden-nav`), holt
  `restoreNavigation()` sie vorher zurück.
- **Bedienung:** Eine durchsichtige Fläche über allem fängt jeden Tipp, darunter wird nichts ausgelöst. Weiter geht es nur mit
  einem Tipp auf die Blase, auf **Weiter** wie auf den Satz; im letzten Schritt schließt **Fertig** (seit 27.10.2026, Rückmeldung:
  „nur wenn man auf die Blase klickt“; bis dahin war jeder Tipp irgendwohin wie **Weiter**, im Schritt Wischen auch ein Wischen).
  Tipps und Wischen daneben, auch auf den Knopf im Ring, tun nichts (Fläche und Ring schlucken `click` und `mousedown`). Kein
  Fehltipp schließt den Rundgang mittendrin. Esc schließt sofort. Die Blase ist ein Dialog (`role="dialog"`, `aria-modal`, der Satz mit `aria-live`). Am
  PC hat der Knopf den Fokus (Enter, Leertaste), Tab bleibt dort, danach kehrt der Fokus zurück, wo er war; auf iPhone und iPad
  hat die Blase den Fokus (Vorlesesoftware liest sie, kein Rahmen um den Knopf), und er kehrt nicht zurück, sonst öffnete ein
  Editor die Tastatur. Geht währenddessen ein Fenster auf (Befehlspalette, „Was ist neu“), liegt es darüber und bekommt die
  Tasten; danach steht der Rundgang wieder da.
- **Einmal je Gerät:** gerätelokal `eba-rundgang` = `FASSUNG` (`app.saveLocalStorage`, geht mit keinem Sync mit), gesetzt,
  sobald du ihn schließt (Fertig, Esc); geht das Plugin vorher aus, kommt er wieder. Nicht an die Version gebunden: Wer
  aktualisiert, sieht ihn nach dem Update, auch über den Sync ohne Neustart, ebenso ein Entwicklungstresor ohne Release. Eine
  neue Fassung des Inhalts zählt `FASSUNG` hoch.
- **Wann von selbst:** frühestens 3 s nach dem Laden, dann alle 4 s, bis er gesehen ist (`faellig`, rein, getestet): Obsidian ist
  fertig geladen, die App vorn, kein Fenster offen (Update, Was ist neu, Einrichtung), keine Einrichtung, die gleich kommt
  (`einrichtungWartet`: fällig und in dieser Sitzung noch nicht gezeigt, höchstens 30 s nach dem Laden), kein Menü (hinter ≡,
  Obsidians Menüs, Übersicht der Tabs),
  keine aufgezogene Seitenleiste auf iPhone und iPad (eine angeheftete auf dem iPad stört nicht, links wie rechts; bis 27.10.2026
  hielt ihn jede offene rechte zurück, mit angehefteter rechter kam er nie), kein Hinweis mit Knopf (etwa „Aktualisiert auf …“ oder **Rückgängig**),
  keine Tastatur (am PC: im Editor 8 s ohne Taste), ≡ und Zahnrad gibt es. Neue Installationen sehen ihn also erst nach der
  Einrichtung, auch nach **Später**.
- **Noch einmal:** Einstellungen & Hilfe → Hilfe → **Rundgang** (erste Zeile der Hilfe-Themen, `eba-personalisieren hilfe`,
  `personalisieren.js`) oder der Befehl **Rundgang zeigen** (Aktion `rundgang`). Mit demselben Wortlaut wie von selbst.
- Stil: `eba-core.css` Abschnitt 71 (Baustein in [design.md](../design.md), „Rundgang“). `abmelden` nimmt Fläche, Ring und
  Blase weg, ohne sie als gesehen zu merken; Hörer und Zeiten laufen über `ctx.dom`, `ctx.zeit`, `ctx.intervall`.

### PDF-Kasten (`pdfkasten.js`, seit 19.10.2026)

Der Kasten `> [!eba-pdf]- PDF` der Begleitnotizen ist ein Knopf: Ein Tipp auf die Kopfzeile klappt auf oder zu, so oft man will, in Lese-
und Bearbeitungsansicht. Vorher war er ein gewöhnlicher Callout; in der Bearbeitungsansicht setzte ein Tipp neben den Pfeil den Cursor
hinein, der Kasten zeigte seinen Quelltext, und auf dem iPad ging die Tastatur auf. Die Notiz bleibt Markdown (der Link auf die PDF folgt
Umbenennungen, ohne Plugin ein normaler Kasten): Der Post-Processor übernimmt den Kasten, wo Obsidian ihn zeichnet, auch in der
Bearbeitungsansicht (Obsidian zeichnet Callouts dort mit denselben Post-Processoren). Die Kopfzeile fängt Tipps am Kasten ab (Einfangen),
bevor Obsidian oder der Editor sie sehen; im Inhalt behält die PDF ihre Bedienung, nichts geht weiter an den Editor. Zugeklappt ist der
Inhalt verborgen; die PDF-Einbettung, die Obsidian gezeichnet hat, bleibt darin und öffnet ihre Datei erst, wenn sie sichtbar wird
(Obsidian selbst, beim ersten Aufklappen). Bis 25.10.2026 leerte der Kasten den Inhalt und lud die PDF beim Aufklappen mit
`MarkdownRenderer` nach. Der lädt Einbettungen aber im Anzeigemodus (`displayMode`): Eine PDF ist dort ein festes Bild ihrer ersten
Seite, ohne Blättern. `tests/notizbild.test.js` prüft, dass der Kasten Obsidians Einbettung behält. Rechts in der Kopfzeile leise Knöpfe **Öffnen**
(Aktion `oeffnen` mit `datei`) und **Original** (wenn `original` auf eine Datei zeigt); die Seitenzahl steht im Titel („PDF (37 Seiten)“,
sonst aus `seiten`). Eine Höhe je Gerät (`eba-core.css` 27, iPhone 37.begleitnotiz); den Knopf „Größe ⇅“ (Aktion `pdf`, `eba-pdf-klein`,
`eba-pdf-gross`) gibt es nicht mehr, er sah aus wie Sortieren. Tests: `tests/notizbild.test.js`.

Seit 0.6.3 ist der Kasten gleich offen, wenn die Notiz (`typ: unterlage`) keinen eigenen Inhalt hat: nur Titel, Kästen, Überschriften
und leere Punkte, dieselbe Regel wie für leere Mitschriften (`istLeer` aus `leer.js`). Das ist ohne eigenen Server und ohne Claude der
Normalfall; ein Tipp auf eine Unterlage in einer Liste zeigt dann gleich die PDF statt einer leeren Seite mit zugeklapptem Kasten. Mit
Zusammenfassung oder eigenen Notizen bleibt er zu, der Inhalt steht dann zuerst.

**Zusammenfassen** in der Kopfzeile kennt zwei Wege: `ctx.server` (eigener Server, seit 0.5.2) und `ctx.claude` (eigener
API-Schlüssel, seit 0.6.3). Der erste, dessen `zusammenfassenStand(pfad)` einen Stand nennt, bekommt den Knopf, der Server zuerst.
Beim Server heißt fertig „angefordert“ (der Knopf heißt dann „Wird zusammengefasst“, bis der Abruf die Zusammenfassung bringt);
`ctx.claude.sofort` heißt, nach `zusammenfassen(pfad, warten)` steht sie schon in der Notiz, und der Knopf verschwindet.
`warten()` stellt den Knopf erst nach einer Rückfrage zu den Kosten um; scheitert die Anfrage, heißt er wieder „Zusammenfassen“.
Seit 0.6.9 nennt `ctx.claude` auch `nachfuehren` (die Zusammenfassung gehört zu einer früheren Fassung): Dann fasst der Kasten beim
Öffnen von selbst zusammen (`zusammenfassen(pfad, warten, { still: true })`), und unter der Kopfzeile steht, auch zugeklappt, eine
leise Zeile zur neuen Fassung (siehe [„Neue Fassung einer Unterlage“](unterlagen.md)).

### Neu bei den Unterlagen (`gesehen.js`, seit 0.6.3)

Das erste Öffnen einer Unterlage trägt das Datum als `geoeffnet` in ihre Begleitnotiz ein (`processFrontMatter`, einmal je Unterlage,
eine Sekunde nach `file-open`). Es zählt die Notiz selbst, die gleichnamige Datei daneben in Obsidian und **Öffnen** in einer anderen
App (Aktion `oeffnen`). **Neu** auf der Seite Unterlagen (Kachel und Liste) heißt: `datum` in den letzten 14 Tagen, kein
`geoeffnet`. Vorher zählte die Seite `status: neu` als „Noch nicht gelesen“ und zeigte „Durchgearbeitet“ in Prozent; den Status
schaltet aber fast niemand um, also stand dort fast jede Unterlage. `status` und der Knopf im Kopf bleiben für alle, die abhaken
wollen (✓ auf der Modulseite). Tests: `tests/gesehen.test.js`.

### Rückgängig statt Rückfrage, ein Papierkorb (`papierkorb.js`, `quellen.js`)

Was sich umkehren lässt, passiert sofort, und der Hinweis danach hat **Rückgängig** (`ctx.hinweis(text, { aktion: { text:
"Rückgängig", ausfuehren } })`). Eine Rückfrage gibt es nur, wo etwas endgültig verloren ist: **Trennen** (Passwort bzw. Link sind auf
dem Gerät weg) und **Daten aus Alma löschen**. Bis 0.4.5 gab es fünf Stufen (Rückfrage, das Wort „löschen“ im Alma-Feld, Papierkorb
ohne Rückgängig, Hinweis mit Rückgängig, Ja/Nein als Auswahl) und drei Papierkörbe.

```
ctx.papierkorb(datei, { text, still }) → Promise<bool>       wegwerfen, was du selbst wegwirfst, mit Rückgängig
ctx.user.quellen.papierkorb(app, datei, { lokal })            der eine Papierkorb (Quellen und Aktionen)
```

- **Ein Papierkorb**: `quellen.js papierkorb` folgt Obsidians Einstellung „Gelöschte Dateien“ (Papierkorb des Systems, auf iPhone und
  iPad `.trash` im Tresor) und löscht nie endgültig, auch wenn dort „Endgültig löschen“ steht. Alle Quellen (zentrale Daten, Alma,
  ILIAS-Kalender, Übungsgruppen, Volltext) und das Einordnen werfen nur hierüber weg (vorher teils `.trash`, teils das System,
  Volltext auch endgültig). Ausnahmen mit Grund prüft `tests/papierkorb.test.js` (leere Notiz der Ordner-Automatik, unfertiger
  Download nach einem Absturz, Sicherung des Updates, eigene Daten von Noten & Anmeldungen nach Rückfrage).
- **Rückgängig beim Wegwerfen**: `ctx.papierkorb` merkt den Inhalt, wirft weg und bietet Rückgängig; das legt die Datei mit demselben
  Inhalt am selben Ort wieder an (Name vergeben: „Name 2“). Nutzer: leere Mitschrift beim Verlassen (`leer.js`), **Abwählen** einer
  Übungsgruppe (`gruppen.js`).
- **Rückgängig ohne Datei**: To-do auf dem Dashboard abgehakt („Aufgabe abgehakt.“, `todos.js`: die Zeile wird wieder `[ ]`),
  Karteikarte aussetzen, zurückstellen oder als neu zurücksetzen (`karten.js`, nimmt den Eintrag aus dem Lernstand; vorher eine
  Ja/Nein-Auswahl), **Besuche ich nicht** (Kopf der Notiz, zentral `besuche-nicht`/`wieder-zeigen`).
- **Ohne Hinweis**: Ein Status, den man im Kopf einer Notiz oder im Modulfeld setzt, zeigt sich selbst; ein Hinweis kommt nur, wenn
  danach woanders etwas fehlt.
