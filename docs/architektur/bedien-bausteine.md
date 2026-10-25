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
links ein Label „Art · Modul · Tag“, beim Termin nur „Art · Modul“, rechts der Knopf). Die Vorlesung hat ihn im Text (Codeblock `eba-vorlesung`, `vorlesung.js`),
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
  (`zwischen`), sonst warm wie „Nacharbeit offen“; „Besuche ich nicht“ leise. Kein Skript wählt die Farbe selbst.
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
  Plugin geschrieben hat (`eckZeileErzeugt`), und blendet den leeren Kasten aus. Eigener Text darin bleibt stehen. Das gilt nur für
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
- **Seitenleiste „Übersicht“** (seit 19.10.2026, `seitenleiste.js`): ein eigener Tab (`ItemView`, Typ `eba-uebersicht`) in Obsidians
  linker Seitenleiste, am PC neben der Notiz, auf iPhone und iPad die Schublade hinter dem Symbol oben links. Sie ersetzt das
  Raster-Menü, das bis 0.4.6 in Obsidians Kopfleiste jeder Notiz stand (`menue.js`, `view.addAction`); das Update entfernt
  `menue.js`, ein Gerät mit offener App nimmt das Symbol beim Löschen sofort weg (`skriptEntfernen` → `abmelden()`). Oben die
  Seiten aus `sichtbareZiele(ctx)` (`ZIELE`, einzige Liste; die Lesezeichen der Vorlage `.obsidian/bookmarks.json` folgen ihr,
  jede Seite hat ein eigenes Symbol, `tests/seitenleiste.test.js`; Stundenplan fehlt seit 24.10.2026, weil das Dashboard
  die Woche auf jedem Gerät als Raster zeigt; 0.6.6 führte die Seite nur am iPhone, wo das Dashboard damals einen Tag zeigte),
  darunter „Dieses Semester“ mit den Modulen
  nach `diesesSemester` (`eba.js`, dieselbe Regel wie die Gruppe „Dieses Semester“ im Fenster „Neu …“), Modulcode statt Symbol. Im
  Akzent steht die Seite, die vorn offen ist, bei Notizen mit `code` (Unterlagen, Vorlesungen, Termine …) auch ihr Modul. Ein Tipp
  öffnet über `ctx.oeffnen` (nie in der Seitenleiste) und schließt auf iPhone und iPad die Schublade, wenn sie nicht angeheftet ist.
  Fehlt der Tab, legt das Skript ihn beim Start als ersten Tab der linken Seitenleiste an und wählt ihn aus (Obsidian merkt sich
  die Lage je Gerät in `workspace.json` bzw. `workspace-mobile.json`). Die Ansicht meldet sich aus dem Skript an; Obsidian baut
  Tabs eines Typs, der sich später anmeldet, selbst neu auf („view-registered“), darum überlebt der Tab Start und Hot-Reload
  ohne Eingriff in `main.js`. Das Symbol des Tabs ist ein eigenes SVG (`addIcon`, Strich als Attribut), nicht Obsidians
  `layout-grid`: über `setIcon` blieb es auf dem iPad leer. Seiten, die noch nicht fertig sind (`IN_ENTWICKLUNG`: Lernplan seit
  19.10.2026, Karteikarten seit 24.10.2026), sind abgeblendet und tragen rechts die Pille „in Entwicklung“ (`.is-entwicklung`,
  `.eba-sl-entwicklung`). Stil: `eba-core.css` Abschnitt 66.
  Die Schublade auf iPhone und iPad dient nur der Navigation (seit 24.10.2026): Solange die Übersicht vorn ist, blendet
  Abschnitt 66 Obsidians eigene Teile darin aus, den Umschalter zwischen den Tabs, Name und Dateizahl des Tresors und das
  Zahnrad (`.workspace-drawer:has(.workspace-drawer-active-tab-content .eba-sl)`; der Inhalt dort ist immer nur der vordere
  Tab). Ist ein anderer Tab vorn, zeigt Obsidian alles wie gewohnt, auch den Weg zurück. Die Stecknadel zum Anheften bleibt auf
  dem iPad. Was dort stand, steht unter Einstellungen & Hilfe → Obsidian (`eba-personalisieren obsidian`, `personalisieren.js`):
  Obsidian-Einstellungen, Dateien mit ihrer Zahl, Tresor mit seinem Namen; jede Zeile ruft Obsidians eigenen Befehl auf
  (`app:open-settings`, `file-explorer:open`, `app:open-vault`). Für den Tresor ist das „Tresore verwalten“, wie der Eintrag
  im Auswahlmenü unter dem Tresornamen: `app:switch-vault` öffnet auf iPhone und iPad nur eine Liste zum Wechseln, löschen
  und umbenennen geht nur in der Verwaltung (Obsidian 1.14.5, 25.10.2026).

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
