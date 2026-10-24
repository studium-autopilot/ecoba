# Architektur: Aktionen und Linkformat

Teil der Architektur-Doku. Aufbau, `ctx`, Skripttypen und die Regeln für Skript-Autoren stehen im Überblick
[architektur.md](../architektur.md).

## Aktionen und Linkformat

Ein Knopf ist ein normaler Markdown- oder HTML-Link:

```
obsidian://studium-autopilot?aktion=<name>&<parameter>=<wert>
```

Die Werte sind URL-kodiert. Ein `+` bleibt `+`; Leerzeichen als `%20` schreiben.

- **Klick-Abfangen:** Der Kern hört im Capture-Modus auf `document` und jedes Popout-Fenster. Bei
  `a[href^="obsidian://studium-autopilot"]` ruft er `preventDefault` und `stopPropagation` auf, bevor Obsidian, CodeMirror
  oder Bases den Link sehen. Er blockt `mousedown`, `mouseup`, `pointerdown`, `auxclick` und `contextmenu` und führt die Aktion
  beim `click` aus. Das gilt in der Leseansicht, in Live Preview, in Callouts, in Bases-`html()`-Formeln und in Hover-Vorschauen.
  Es öffnet sich keine Seite und es entsteht keine Hilfsnotiz.
- **Rückfall:** `registerObsidianProtocolHandler("studium-autopilot")`, falls der Link von außen kommt (Browser, anderes
  Programm).
- **Zielnotiz:** Statische Knöpfe in Notizen tragen keine Pfade. Ein Post-Processor schreibt beim Rendern
  `data-sa-quelle=<Pfad der Notiz>` an jeden Knopf, auch in Einbettungen und Hover-Vorschauen. Fehlt das Attribut, nimmt der Kern
  die Notiz des Tabs, in dem der Link steht, und sonst die aktive Notiz. Wo ein Ziel nötig ist, steht ein stabiler Schlüssel im
  Link, z. B. `code=B110`. Nur Bases-Formeln dürfen Namen enthalten (`file.basename`), weil Bases sie bei jedem Zeichnen neu
  berechnet. Darum ist `links.js` (Links beim Umbenennen nachziehen) entfallen.

| Aktion | Parameter | Wirkung | Befehl |
|---|---|---|---|
| `vorlesung` | `code` | neue Vorlesungsnotiz: Fenster mit Modul (`code` wählt vor) und Thema; läuft gerade genau eine Lehrveranstaltung und ist kein Modul vorgewählt, ohne Fenster; heute schon angelegt → öffnen; `folien` bleibt leer (seit 24.10.2026, die Folien wählt `ctx.modell.folien` beim Zeichnen) | Neue Vorlesungsnotiz |
| `uebungsblatt` | – | bis 0.6.7 ein neues Übungsblatt als eigene Notiz (`Übungsblätter/`); seit 24.10.2026 ist das Blatt seine Begleitnotiz (Unterlage der Art Übung), ein alter Knopf sagt das, öffnet Unterlagen und bietet **Unterlagen hinzufügen** an | – |
| `termin` | `titel`, `wann`, `code` | neuer Termin | Neuer Termin |
| `lehrveranstaltung` | `code` | Lehrveranstaltung im Stundenplan von Hand | Neue Lehrveranstaltung |
| `sq-kurs` | – | SQ-Leistung | Neuer SQ-Kurs |
| `modul` | `code` | eigenes Modul aus `System/Gerüste/Modul.md` | Neues eigenes Modul |
| `oeffnen` | `notiz`, `original=1`, `datei` (Link relativ zur Notiz, vom PDF-Kasten) | Datei der Unterlage extern öffnen (PC: Standardprogramm, iOS: Dateien-App) | Unterlage öffnen |
| `plan` | `modul` (Code oder Name) | `gewaehlt` umschalten | – |
| `variante` | `wert` | `variante` in `System/Einstellungen.md` | Variante wählen (mit Auswahl) |
| `darstellung` | `wert` (`hell`, `dunkel`, `automatisch`) | Hell, dunkel oder automatisch wie das Gerät | Darstellung wählen (mit Auswahl) |
| `design` | `wert` (`elfenbein`, `flieder`, `klar`) | Design dieses Geräts (seit 18.10.2026; bis 17.10.2026 schaltete `design` die früheren Farbschemata um) | Design wählen (mit Auswahl) |
| `einordnen` | `code` | Fenster „Unterlagen hinzufügen“ (Dateien auswählen oder hineinziehen; ZIP-Dateien und Notizen nimmt es nicht), dann einordnen. Bis dahin liegen sie in `System/Neue Unterlagen/`, Übriges geht danach in den Papierkorb (bis 0.6.6 gab es dafür den Ordner `Eingang/`, in den man auch selbst Dateien legen konnte) | Unterlagen hinzufügen |
| `stundenplan` | `link=neu` | Alma-Stundenplan aktualisieren, ohne Link verbinden | Stundenplan aktualisieren |
| `verbinden` | `id` (alma, ilias, zentral, vorlage) | Verbinden-Fenster bzw. Erklärung | Verbinden … (mit Auswahl) |
| `verbindung-aktualisieren` | `id`, `uebernehmen=1` (ILIAS) bzw. `hier=1` (Volltext): hier aktualisieren, obwohl ein anderes Gerät gerade aktualisiert | Verbindung jetzt abrufen | Aktualisieren … (mit Auswahl) |
| `trennen` | `id` | Link bzw. ILIAS-Zugang auf diesem Gerät löschen (mit Rückfrage) | Trennen … (mit Auswahl) |
| `ilias-holen` | – | Unterlagen aus ILIAS holen (Knopf auf Unterlagen); nicht verbunden: Fenster ILIAS-Unterlagen | Unterlagen aktualisieren |
| `personalisieren` | – | Formular Name, Studienbeginn, Variante, Zielnote | Deine Angaben ändern |
| `einrichtung` | `ab` (optional, `2` = ab Studienbeginn, vorausgefüllt) | Einrichtung öffnen (Zeile „Einrichtung“ in den Einstellungen: „Starten“, „Fortsetzen“, „Fertig“ startet sie erneut) | Einrichtung starten |
| `alma-link` | – | Alma-Link neu eingeben | Alma-Link ändern |
| `suchen` | `q` | Obsidian-Suche öffnen | – |
| `zeigen` | `notiz` | Notiz öffnen (Stundenplan-Raster in Bases) | – |
| `seitenlink` | – | `[[Folien.pdf#page=N\|S. N]]` einfügen (Editor); die PDF der ersten Folien im Kopf der Notiz (`ctx.modell.folien`) | Seitenlink auf die Folien einfügen |
| `zentral-aktualisieren` | – | Zentrale Daten jetzt abrufen (mit Hinweis zum Ergebnis) | Zentrale Daten aktualisieren |
| `zentral-schalter` | `was` (`daten` \| `veranstaltungen`), `wert` (`1`/`0`, optional) | Schalter in `System/Einstellungen.md` setzen (ohne `wert`: umlegen) | – |
| `besuche-nicht` | `id` (ohne: die geöffnete zentrale Stundenplan-Notiz) | id in `stundenplan_ausgeblendet` (Einstellungen); Hinweis mit „Rückgängig“ | Besuche ich nicht |
| `wieder-zeigen` | `id` | id aus `stundenplan_ausgeblendet` nehmen | – |
| `karten-lernen` | `stapel` (Pfad) oder `code`; ohne: die Kartennotiz, in der der Knopf steht, sonst alle | Lernfenster | Karteikarten lernen |
| `karte-neu` | `stapel` (Pfad, optional) | Fenster „Neue Karte“ | Neue Karte |
| `kartenstapel` | – | neuer Stapel aus `System/Gerüste/Karteikarten.md` (Modul wählen; auch Ordner-Automatik in `Karteikarten/`) | Neuer Kartenstapel |
| `karten-optionen` | – | Fenster „Lernoptionen“ (Felder `karten_*` in `System/Einstellungen.md`) | Lernoptionen |

Ein Knopf heißt wie sein Befehl (Wortliste, `docs/design.md`, „Sprache“; `tests/wortliste.test.js` prüft die Knöpfe in Seiten).
Zusätzlich gibt es den Befehl **„Neue Notiz aus Vorlage …“** (`studium-autopilot:neue-notiz`, Strg/Cmd+Umschalt+N). Er bietet
alle Aktionen mit `ordner` zur Auswahl an. Der Befehl **„Erweiterungen neu laden“** lädt alle Skripte neu.

Nur Aktionen, die bewusst eine Notiz anlegen, öffnen danach genau diese Notiz. Alle anderen lassen die aktive Notiz und die Tabs
unverändert.

**Ordner-Automatik:** Aktionen mit `ordner: ["Vorlesungen"]` befüllen eine neue, leere Notiz in diesem Ordner oder einem
Unterordner. Bei mehreren Treffern gilt der längste Ordner. Voraussetzung: Die Notiz wurde auf diesem Gerät angelegt und ist in
den ersten etwa 1,5 s die aktive Datei. Per Sync ankommende Dateien werden darum nie befüllt. Eine „Unbenannt“-Notiz wird
umbenannt und verschoben. Esc im Fenster „Neu …“ bricht das Anlegen ganz ab (`eba.abbrechen`), die leere Notiz wird
gelöscht (siehe [„Bedien-Bausteine“](bedien-bausteine.md)).

**Alma-Stundenplan** (`alma.js`, seit 0.4.5 eine Quelle nach dem Quellen-Vertrag): `ctx.user.alma(c)` bietet

- `status()` → gemeinsame Form `{ zustand, geprueft, fehler, fehlerZeit, warnungen }` (`zustand`: extern, nicht-verbunden,
  laeuft, fehler, anderes-geraet, an), dazu `verbunden`, `stand` (= `geprueft`), `seit`, `anderes`, `laeuft`, `extern`
- `verbinden(link?, { nurBeiErfolg })`, `trennen()`, `aktualisieren({ still, automatisch, text })`,
  `aktualisierenOderVerbinden({ neuerLink })`, `linkPruefen(link)`, `fehler()`, `hinweise()`

Der Link liegt nur gerätelokal (`app.saveLocalStorage`). Scheitert der erste Abruf nach dem Eingeben (Fenster oder
Eingabefeld), gilt wieder der vorherige Link.

- **Zeitplan** (`Q.planen`, vorher nur Knopf): 30 s bis 2 Min. nach dem Einlesen, dann stündlich; nach einem Fehler nach 5, 15,
  30 Min.; zurück in der App nach über einer Stunde seit dem letzten Versuch. Nur mit Link auf diesem Gerät, nie mit
  `quelleExtern("stundenplan")`, nie ein Hinweis. Testeinstieg: `plugin.testStundenplanAus = true`.
- **Fristen** (seit 0.4.6): Die Anfrage an Alma höchstens 60 s, der Abruf bis die Daten da sind (Sperre, Anfrage, Lesen)
  höchstens 2 Min. (Zeitgeber über `ctx.zeit`; `requestUrl` lässt sich auf iPhone und iPad nicht abbrechen, eine späte Antwort
  wird verworfen). Danach endet der Lauf mit dem Fehler „Alma hat nicht rechtzeitig geantwortet. Neuer Versuch später.“, der
  Lauf ist frei, der Zeitplan versucht es wie nach jedem Fehler wieder. Geschrieben wird erst nach dem Abruf und nur im Tresor.
  Die Hülle eines eigenen Uni-Abgleichs (ohne `ctx.zeit`, Kalender als Text) läuft ohne Frist.
- **Status** gerätelokal (`eba-alma-status`; `eba-alma-stand` bleibt die Zeit des letzten Erfolgs): Ein Fehler (Link falsch,
  Alma antwortet nicht, kein Netz) bleibt mit Zeit stehen, bis ein Abruf klappt. Vorher stand er nur im Speicher, und die Zeile
  blieb grün „verbunden“ mit alter Zeit.
- **Ein Schreiber:** `sperre.js`, Quelle `alma` (`System/Daten/alma-abruf.json`, in `.gitignore`, `release.py`, `pruefen.py`).
  Der Zeitplan wartet, solange ein anderes Gerät mit Link schreibt (Zeile „anderes-geraet“); jeder Knopf übernimmt. `trennen`
  gibt die Sperre frei.
- **Besitz:** Alma-Notizen tragen `herkunft: alma` + `alma_schluessel` (Id-Feld; ältere Alma-Notizen erkennt der nächste Abruf am
  Kasten „Aus Alma“ und trägt die Marke nach). Von Hand angelegte Notizen, die Alma verknüpft (`quelle: alma`,
  `alma_schluessel`, `alma_titel`, `alma_raum`), bleiben deine (keine `herkunft`). Notizen mit fremder `herkunft` (zentral,
  ilias-gruppe, gruppe-gewaehlt, claude …) fasst Alma nie an.
- **Lebenslauf:** *Von dir gelöscht* → Grabstein `angewendet` (`alma_schluessel` → `kurzHash` aus Schlüssel, Zeitraum, Raum) in
  `alma-abruf.json`: Die Notiz kommt erst wieder, wenn sich der Termin in Alma ändert. *In Alma weg* (nur Semester, die Alma
  geliefert hat; Ende vor mehr als 30 Tagen bleibt unverändert): Alma-Notiz unberührt → Papierkorb (`.trash`), mit deinem Text
  unter `## Meine Notizen` (ältere: `## Notizen`) → „(entfällt)“ und `entfaellt: true` (kommt sie zurück, ist sie wieder normal); deine eigene Notiz → nie
  löschen, nie entkoppeln, sondern `alma_fehlt: <Datum>` und ein Punkt „**Stundenplan** · … steht nicht mehr in Alma“ in „Bitte
  prüfen“ (höchstens 14 Tage, nicht nach `bis`; synchronisiert, darum auf jedem Gerät). Fehlen auf einmal mehr als die Hälfte (und
  mehr als 2), bleibt alles stehen (Warnung). *Doppel* einer Alma-Notiz werden zusammengeführt (`Q.dubletten`).
- **Aus dem Uni-Abgleich übernommen** (Regeln der Hülle `stundenplan-sync.mjs`): nie löschen oder entkoppeln, was du angelegt
  hast (oben); bei der ersten Verknüpfung (noch kein `alma_raum`) gilt Almas Raum, wenn er mehr als in der Schreibweise abweicht
  (`raumNorm`: „Kupferbau HS 25“ = „Hörsaal 25 Kupferbau“), auch in der Kopfzeile unter der Überschrift; keine neue Notiz für
  Veranstaltungen, die schon vorbei sind.
- **Außerhalb des Plugins** (eine Hülle, die `aktualisieren({ text })` mit `window.app` aus Dateien und ohne `ctx.user.sperre`/
  `quellen` aufruft): dieselben Regeln, aber keine Sperre, keine Grabsteine, kein Meldekanal; geschrieben wird nur über
  `vault.create`, `vault.trash` und `fileManager.processFrontMatter` (die Kopfzeile ändert dort die Hülle, Namen bleiben).
- **Notizen, die Alma angelegt hat, folgen Alma** (seit 24.10.2026; vorher blieben Name, Kopfzeile und ein leeres `modul` beim
  Stand des Anlegens): Verlegt Alma Tag oder Zeit (die Notiz kommt als verwaiste Alma-Notiz über Code und Art zurück), schreibt
  der Lauf neben den Feldern die Kopfzeile neu (nur vor dem ersten `## `-Abschnitt und nur in der Form, die Alma schreibt,
  `KOPFZEILE`) und benennt die Datei um (`app.fileManager.renameFile`, Links ziehen mit), aber nur, solange sie noch den aus den
  alten Feldern abgeleiteten Namen trägt (auch „… 2“); einen eigenen Namen behält sie. Ein leeres `modul` wird verknüpft, sobald
  es die Modulnotiz gibt. Von Hand angelegte Notizen, die Alma verknüpft hat, bekommen nur die Felder. Ohne Semester zu einem
  Termin (`semesterVon` leer: Datenmodell noch nicht geladen und das Datum fehlt in der Semesterliste) übernimmt `gruppieren`
  den Termin nicht; vorher entstand mit leerem Semester und anderem Schlüssel ein Doppel, das kein späterer Lauf wegräumte (sein
  Semester stand nie in den gelieferten Semestern).
- **Raum, Änderungen und Ausfälle je Termin** (seit 20.10.2026, `gruppieren(events, heute)`; vorher galt der häufigste Raum aller
  Termine, ein einzelner Termin in einem anderen Raum ging verloren, eine dauerhafte Verlegung ab Semestermitte behielt den alten
  Raum, solange er häufiger war, und ein auf eine andere Uhrzeit verschobener Termin wurde Ausfall plus eigene Notiz):
  - *Raum der Serie* (`raeumeLesen`): Läufe gleicher Räume nach Datum (`raumNorm`, Termine ohne Raum zählen nicht). Raum ist der
    des letzten Laufs mit mindestens zwei Terminen (wo die Serie ab jetzt bzw. am Ende stattfindet), ohne solchen der häufigste
    der kommenden Termine. Jeder Termin in einem anderen Raum als erwartet → `aenderungen` („Datum|Beginn|Ende|Raum“, Zeiten der
    Serie, bei einer c.t.-Notiz verschoben wie die Serie).
  - *Dauerhafte Verlegung* → `raum_seit` (erster Termin im neuen Raum) und `raum_vorher`: aus dem Kalender, wenn vor dem letzten
    Lauf ein anderer mit mindestens zwei Terminen liegt (einzelne Abweichungen dazwischen zählen nicht); sonst, wenn ein Abruf den
    Raum der Notiz mehr als in der Schreibweise ändert (Alma nennt für die ganze Serie einen neuen Raum, auch für vergangene
    Termine; oder die erste Verknüpfung bringt einen anderen), ab dem nächsten Termin mit dem bisherigen Raum der Notiz als altem.
    Eine frühere Angabe bleibt, solange `raum_vorher` vom Raum abweicht. `findetStatt` gibt vor `raum_seit` den alten Raum, die
    Woche zeigt die ersten zwei Wochen ab `raum_seit` „Neuer Raum“ (siehe [„Wochenraster“](modell.md), *Ausnahmen*).
  - *Verschobener Termin* (andere Uhrzeit, gleicher Tag): Ein einzelner Termin gleichen Titels und Semesters an einem Tag, an dem
    genau einer Serie ihr Termin fehlt (ihr Wochentag und Rhythmus, höchstens einen Schritt vor dem ersten bzw. nach dem letzten
    Termin), wird eine Änderung dieser Serie statt Ausfall plus eigener Notiz. Nicht eindeutig (zwei Serien fehlen) oder an einem
    anderen Tag: wie bisher.
  - *Abgesagt* (`STATUS:CANCELLED`, auch als Einzeltermin einer Serie über `RECURRENCE-ID`) → `ausfall` der Serie, auch am Anfang
    oder Ende (vorher fehlte der Termin und verkürzte `von`/`bis`). Eine ganz abgesagte Veranstaltung fehlt wie bisher.
  - *14-täglich*: Liegen alle Termine einer Serie (mindestens drei) zwei Wochen oder ein Vielfaches davon auseinander, steht
    `rhythmus: 14-täglich` in der Notiz und die Wochen dazwischen sind kein Ausfall (`findetStatt`: „anderer Tag“); sonst hätte die
    Woche jede zweite Woche „Fällt aus“ in Warnfarbe gezeigt.
  - Leere Felder (`aenderungen`, `rhythmus`, `raum_seit`, `raum_vorher`) stehen nicht in der Notiz und fallen beim Schreiben weg.
    Die Hülle `stundenplan-sync.mjs` braucht dafür nichts Neues (nur `processFrontMatter`, flache Felder und Listen von Texten).
    Trockenlauf gegen einen echten Alma-Kalender (20.10.2026): keine Änderung; mit dem Stand einer Notiz vor ihrer ersten
    Verknüpfung (anderer Raum) `raum_seit` und `raum_vorher` wie erwartet.
- Tests: `tests/alma.test.js` (Wegfall, „(entfällt)“ und zurück, Grabstein, vorbei, Raum, Doppel, Fehler im Status, Sperre,
  ohne Bibliotheken, quellen_extern; Raum je Termin, Verlegung im Kalender und über Abrufe, erste Verknüpfung, verschobener und
  abgesagter Termin, 14-täglich).
