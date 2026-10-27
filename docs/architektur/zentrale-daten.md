# Architektur: Zentrale Daten

Teil der Architektur-Doku. Aufbau, `ctx`, Skripttypen und die Regeln für Skript-Autoren stehen im Überblick
[architektur.md](../architektur.md).

## Zentrale Daten (Paket B)

`System/Daten/Semester.md` – Format: Markdown mit Frontmatter (Listen von Objekten, Datumsangaben ISO), weil

- der metadataCache sie ohne Dateizugriff liefert (auch auf iPhone/iPad); eine `.json` müsste man asynchron lesen;
- Obsidian die Notiz auf allen Geräten anzeigt (eine `.json` erscheint nicht in der Dateiliste);
- Bases-Formeln sie bei Bedarf mit `file("System/Daten/Semester.md").properties` lesen könnten.

Felder: `semester` (name, beginn, ende, vorlesung_beginn, vorlesung_ende, status, hinweis), `pausen` (name, von, bis, status),
`freie_tage` (name, datum, status), `pruefungsphasen` (art, semester, von, bis, status, hinweis), `rueckmeldung` (fuer, von,
bis, status), `stand`, `quellen`. `status: geschätzt` = noch nicht veröffentlicht; `hinweis` nennt die Begründung.
Für Semester ohne Daten rechnet `modell.js` nach einer Regel (erster Montag ab 10.10. bzw. 10.4., 17 bzw. 15 Wochen); sie
stimmt mit allen veröffentlichten Semestern 2026–2029 überein.

**Ableitung und Schreiben:** Bases-Formeln können kein Plugin-JS aufrufen. Darum schreibt `abgleichen()` die abgeleiteten
Felder `semesterliste` (`fs|name|beginn|ende|vb|ve`, FS 1–6, bei längerem Studium bis zum aktuellen Semester), `pausen`
(`von|bis|name`, nur Zeiträume, keine Einzeltage) und `pruefungsphasen` (`von|bis|art|status`) nach `System/Einstellungen.md`.
Auslöser: Änderung an `Semester.md` (1,5 s entprellt) oder `Einstellungen.md` (20 s), einmal beim App-Start (3 s nach dem
Einlesen), an jedem neuen Tag (`abgleichen("tag")`, siehe [„Neuer Tag“](modell.md) oben) und nach dem Speichern im Formular bzw. in der
Einrichtung. Geschrieben wird nur, wenn der Inhalt abweicht, und nie ohne zentrale Daten (z. B. wenn der Sync noch läuft). Der
Abgleich beim Start fängt Updates der Vorlage ab, der am neuen Tag den Semesterwechsel bei leerem Studienbeginn (bis 24.10.2026
erst beim nächsten Start). Die Vorlage liefert die drei Felder leer (`[]`, seit 24.10.2026; vorher standen dort die Werte für
einen Beginn im WS 2026/27, falsch für jeden späteren Jahrgang, bis zum ersten Abgleich). Bis dahin finden die Bases-Formeln und
die Rückfälle der Skripte nichts (leere Spalte „Semester“, Rückfall auf das Semester aus dem Datum). **Ein Schreiber** (seit
17.10.2026): Von selbst (Start, Änderung, neuer Tag) schreibt nur
das Gerät, für das `ctx.zentral.abruferHier()` gilt (Abrufer laut `abruf.json`, noch keiner oder seit 80 Min. still); das
Gerät, auf dem du den Studienbeginn änderst, schreibt sofort. Vorher schrieben alle Geräte dieselbe Datei, in der auch deine
Angaben stehen; bei iCloud konnte so eine Eingabe auf einem anderen Gerät verloren gehen, bei LiveSync gab es Konflikte. Die
20 s nach einer Änderung an `Einstellungen.md` geben der Ableitung des tippenden Geräts Zeit, per Sync anzukommen.
Protokoll: `ctx.modell.protokoll` (Liste der Schreibvorgänge mit Zeit und Grund).

`System/Daten/Musterplan.md` – gleiche Form: `plaene` (id, name), `eintraege` (plan, fs, code, titel, ects, op, art:
schwerpunkt | profil | abschluss), `hinweise` (plan oder „alle“, Text in eigenen Worten), `stand`, `quelle`. Darstellung:
Codeblock `eba-musterplan [economics|ba|ohne|alle|andere]` (ohne Argument: Variante aus den Einstellungen, bei „offen“ alle
drei; `andere` = die übrigen). Ohne Argument und mit gewählter Variante steht darunter „Andere Varianten ansehen →“ zu
`System/Daten/Musterplan` (nicht auf dieser Seite selbst). Spalten je Fachsemester mit deinem Semesternamen, Modul-Chips
(öffnen die Modulnotiz, ✓ wenn bestanden, „OP“ = Orientierungsprüfung), Platzhalter, ECTS je Semester; schmal (Container
unter 520 px) untereinander. Mehrere Pläne (seit 17.10.2026): `stamm()` ermittelt, bis zu welchem Fachsemester alle gezeigten
Pläne dieselben Einträge haben; diese Semester stehen einmal (Stamm), daneben die Gabelung („Ab dem 3. Fachsemester trennen
sich die Pläne“, ohne Argument mit Link zur Wahl der Variante), darunter je Variante nur ihre eigenen Semester (Zweige, mit
Variantentitel). Ohne gemeinsamen Stamm steht jeder Plan ganz mit Variantentitel als Zwischenüberschrift. Die Hinweise stehen einmal
darunter (`hinweiseOrdnen`: erst die für alle, dann je Variante eine Spalte; bei einem Plan eine Liste).
Keine Bilder der Uni im Projekt.

### Datenkanal (`zentral.js`, seit 15.10.2026)

Der Autor verteilt Termine, Fristen und Semesterdaten an alle über ein öffentliches GitHub-Pages-Repo
(`https://studium-autopilot.github.io/ecoba-daten/v1/`, Konstante `BASIS`). Das Plugin holt **nur JSON, nie Code**. Format,
Grenzen, Freigabelisten und id-Regel: **`docs/daten-v1.md`** (Vertrag für den Export der zentralen Daten).

```
manifest.json ──▶ Prüfsummen geändert? ──▶ termine.json / semester.json ──▶ SHA-256 prüfen ──▶ Einträge einzeln prüfen
      │ pause/kein Netz → nichts            │ abruf.json: anderes Gerät frisch → nichts schreiben
      ▼                                     ▼
 Status (gerätelokal)                Termine/*.md (herkunft: zentral)  +  System/Daten/Semester.md (nur bei Änderung)
```

- **Wann:** über den gemeinsamen Zeitplan der Quellen (`Q.planen`, seit 0.4.5): erster Lauf 20 s + Zufall 0–2 Min. nach dem
  Einlesen (auch nach einem Hot-Reload), dann alle 15 Min. (seit 0.4.2; ohne Änderung nur das Manifest, Dateien nur bei neuer
  Prüfsumme, Notizen nur bei geänderten Daten), beim Zurückkehren in die App nach über 10 Min.; dazu Aktion/Befehl „Zentrale Daten aktualisieren“. Ändert sich der Filter (Variante,
  Plan, Schalter), wendet das Abrufer-Gerät den letzten Stand ohne Netz neu an (`abrufen({ nurCache: true })`, 5 s entprellt über
  `ctx.modell.beiAenderung`). Hinweise (Notice) nur beim Knopf, nie beim automatischen Lauf.
- **Frisch vom Server** (seit 19.10.2026, `frischUrl`): GitHub Pages schickt jede Datei mit `Cache-Control: max-age=600`. Gerät
  und Zwischenspeicher gaben das Manifest darum bis zu 10 Min. alt zurück: Nach 0.4.7 zeigte ein iPad das Update lange nicht an,
  und eine Datei, die älter ist als ihr Manifest, scheitert an der Prüfsumme. Jeder Abruf hängt `?t=<Minute seit 1970>` an
  (gleich viele Abrufe wie vorher, Geräte in derselben Minute teilen sich den Zwischenspeicher) und schickt `Cache-Control:
  no-cache` (`FRISCH_KOPF`; `requestUrl` reicht Kopfzeilen auf iPhone und iPad durch wie bei `ilias-netz.js`). Ein 304 ohne
  Inhalt holt wie bisher einmal mit Zeitstempel in ms nach. `update.js` holt die Liste einer neuen Version genauso.
- **Gerätelokal** (`app.saveLocalStorage`): `eba-geraet` (zufällige Geräte-ID), `eba-darstellung` (Hell, Dunkel, Automatisch),
  `eba-design` (`elfenbein`, `flieder`, `klar`), `eba-start-klassen` (Klassen am `body`, die `main.js` schon beim Laden setzt),
  `eba-zentral-stand` (letzter Abruf, Fehler,
  Pause, Hinweis, `plugin_aktuell`, Prüfsummen, Filter-Schlüssel, Abrufer ja/nein, `lehreDa`), `eba-zentral-daten` (letzter geprüfter
  Stand, für Filteränderungen ohne Netz; nur Dateien, die das letzte Manifest nennt, werden daraus neu angewendet),
  `eba-zentral-angewendet` (Kopie der zuletzt gesehenen Grabsteine, unten).
- **Nur ein Gerät schreibt:** `System/Daten/abruf.json` (synchronisiert) = `{ geraet, seit, zuletzt, mobil, angewendet }`, dazu
  `lernplan` (was `lernplan.js` aus den Kapitellisten geschrieben hat, siehe Lernplan) und `literatur` (ebenso für `literatur.js`,
  siehe Literaturliste); beide bleiben beim Schreiben der anderen Felder.
  Schreiben darf das Gerät, das dort steht, oder jedes andere, wenn `zuletzt` älter als 80 Min. ist (dann übernimmt es).
  **Aktualisieren** (`abrufen({ manuell: true })`, seit 0.4.5) übernimmt sofort wie „Hier aktualisieren“ bei ILIAS, außer der
  Abrufer hat vor weniger als 2 Min. abgerufen (Hinweis „gerade auf einem anderen Gerät aktualisiert“). Wer übernimmt, schreibt
  `abruf.json` zuerst (`sperre.js`, `nehmen({ erzwingen: true })`, `angewendet` bleibt), dann die Notizen. Jeder Lauf liest
  `abruf.json` direkt vor dem Schreiben neu und schreibt nichts, wenn inzwischen ein anderes Gerät übernommen oder abgerufen
  hat (eine Übernahme von Hand gilt nur gegen den Stand, den sie gesehen hat). Die Datei wird nur
  bei Wechsel, bei geänderten Notizen (`angewendet`, die Felder der Sperre bleiben dabei) oder höchstens alle 50 Min. (Puls über
  `sperre.js`; bei Läufen alle 15 Min. also etwa stündlich) geschrieben, auch ohne geänderte Daten – der Puls muss unter der
  Übernahmegrenze liegen, sonst übernähme ein zweites Gerät, obwohl der Abrufer läuft (Läufe + Timer-Drosselung).
  `angewendet` (id → Kurz-Prüfsumme des Eintrags) merkt sich, was als Notiz geschrieben wurde: Löschst du eine zentrale Notiz,
  kommt sie erst wieder, wenn sich der Termin in den Daten ändert. Liegt eine Notiz deines eigenen Uni-Abgleichs mit dieser id
  da, gilt sie nicht als gelöscht (Übergabe nach id, unten). Jedes Gerät merkt sich die zuletzt gelesenen Grabsteine
  (`eba-zentral-angewendet`): Fehlt `abruf.json` beim Übernehmen (Sync noch nicht da) oder ist sie unlesbar, gelten diese statt
  eines leeren Stands, sofern noch mehr als die Hälfte dieser ids als zentrale Notiz im Tresor steht (sonst ist der Tresor neu
  aufgebaut, und die Notizen kommen neu wie beim ersten Abruf). Aufgeräumt wird nur in einem Lauf mit Terminen und Stundenplan
  und ohne gegriffenen Massenschutz: Eine id, die seit 30 Tagen weder in den Daten (auch als verworfener Eintrag) noch als
  zentrale Notiz im Tresor steht, verliert ihren Grabstein (seit wann, merkt der Abrufer gerätelokal in `fehltSeit`). Die Sperre
  schreibt ihre Felder wie `angewendet` mit `vault.process` in den Stand der Datei von jetzt, so bleibt ein gleichzeitig
  geschriebenes Feld (`lernplan`) erhalten.
  Kein Abruf ohne Netz schreibt etwas; `abruf.json` steht in `.gitignore`.
- **Notizen:** `Termine/JJJJ-MM-TT Titel.md` (`: ` → ` – `, sonst unzulässige Zeichen `-`), Frontmatter in fester Reihenfolge
  (`typ, titel, datum, bis, kategorie, status, ort, modul, code, bereich?, erledigt, quelle, info?, geprueft?, herkunft: zentral,
  zentral_id, entfaellt?, uebersicht, cssclasses, tags`), danach eigene Felder der Nutzer unverändert. Text: `# Titel`,
  `**Datum** · Ort`, `info`, Hinweis „Geschätzt“ bzw. „Entfällt“, `Quelle: [host](url) · geprüft am TT.MM.JJJJ`, dann
  `## Meine Notizen` (beim Anlegen leer erzeugt). Alles ab `## Meine Notizen`, `erledigt`, eigene Tags (`cssclasses`/`tags`
  werden vereinigt) und eigene Felder bleiben. Datum geändert → `fileManager.renameFile` nach Datum und Titel (Links ziehen
  mit); folgt der Name selbst nicht der Regel `eba.dateiTitel` (etwa ein Emoji aus einer älteren Fassung), wird er nur gesäubert
  (`neuerName`), ein bewusst kürzerer Name bleibt. Geschrieben wird
  nur, wenn der erzeugte Text vom vorhandenen abweicht. Notizen ohne `herkunft: zentral` fasst das Plugin nie an, mit einer
  Ausnahme, der **Übergabe nach id** (seit 0.4.4, Vertrag in `docs/daten-v1.md`): Ein eigener Uni-Abgleich schreibt Termine,
  die nicht in den Daten stehen, selbst, als Notiz mit `abgleich_id` = id und ohne `herkunft`. Steht die id später in den
  Daten, übernimmt `termineAnwenden` genau diese Notiz (`abgleichNotizen`; `notizText` schreibt sie neu, `abgleich_id` fällt
  weg, `erledigt`, „Meine Notizen“ und eigene Felder bleiben, neues Datum benennt um), statt eine zweite anzulegen oder die id
  als gelöscht zu werten. Nur, wenn es keine zentrale Notiz mit der id gibt und der Termin zum Filter passt; andere Notizen
  mit `abgleich_id` bleiben unberührt. Ohne eigenen Abgleich gibt es solche Notizen nicht. Tests: `tests/zentral.test.js`.
- **Wegfall/Filter:** Fehlt eine id: unberührt (nicht erledigt, „Meine Notizen“ leer) → Papierkorb (`vault.trash`, nie
  endgültig), sonst Titel „(entfällt)“ + `entfaellt: true`. Ende > 30 Tage vorbei → unverändert. Fällt mehr als die Hälfte (und
  mehr als 10) auf einmal weg → keiner als entfallen (Schutz gegen kaputte Exporte). Passt ein Termin nicht mehr zum Filter
  (Modul nicht im Plan, Schalter aus): unberührt → Papierkorb, sonst bleibt sie und wird weiter nach den Daten aktualisiert
  (Datum, Ort, Name). Unberührt und Grabstein nach den Regeln des Quellen-Vertrags (`Q.unberuehrt`, `Q.kurzHash`, gleiche
  Rechnung wie bis 0.4.4). Fehlt `termine.json` oder `semester.json` im Manifest, bleiben Notizen und Semesterdaten beim
  letzten Stand; auch „Jetzt aktualisieren“ wendet den gerätelokalen Stand dann nicht neu an.
- **Doppel** (seit 0.4.5): Tragen mehrere Notizen dieselbe `zentral_id` (Sync-Verzug, Konfliktkopie), führt der Abrufer sie vor
  dem Übernehmen zusammen wie `termine-sync.py` des Uni-Abgleichs (`Q.dubletten`): Der kürzeste Dateiname bleibt,
  `erledigt: true` gewinnt, deine Zeilen unter „Meine Notizen“ (ältere Stundenplan-Notizen: „Notizen“) kommen dazu, die anderen in den
  Papierkorb (Bericht `doppel`). Vorher blieben die anderen unangetastet liegen.
- **Bereich** (`bereich`, optional, Freigabeliste in `docs/daten-v1.md`): `schluesselqualifikation` → Feld `bereich` und Tag
  `schlüsselqualifikation` (verwaltet: verschwindet, wenn der Bereich wegfällt; eigene Tags bleiben), Pille „Schlüsselqualifikation
  · freiwillig“ in der Datumszeile der Notiz (angezeigt in der Kopf-Karte, `kopf.js`), kurz „freiwillig“ in der Agenda (`termine.js`) und der Kalender-Tagesliste
  (`kalender.js`, seit 17.10.2026); Dashboard-Formel `art` hängt „ · freiwillig“ an. Unbekannte Felder und Werte ignoriert das Plugin (kein Verwerfen).
- **Filter:** ohne `code` oder mit `bereich` → alle; mit `code` → Modul gewählt, selbst geplant (`semester_geplant`), Status „läuft“/„angemeldet“
  oder `fsEmpfohlen` (Musterplan der Variante, siehe oben) = aktuelles oder nächstes Fachsemester. Schalter in
  `System/Einstellungen.md`: `zentrale_daten` (an/aus), `zentrale_veranstaltungen` („Fachschaft & Veranstaltungen“). **In den
  Einstellungen statt gerätelokal**, weil nur ein Gerät schreibt: Ein Schalter auf einem Nicht-Abrufer-Gerät würde nichts
  bewirken, und die Wirkung (Notizen im Tresor) gilt ohnehin für alle Geräte.
- **Semesterdaten:** `semester.json` → `System/Daten/Semester.md`, nur bei inhaltlicher Abweichung (Vergleich `semKanon`, nicht
  der Formatierung), Frontmatter im bisherigen Flow-Stil, Text darunter bleibt. `modell.js` leitet daraus ab wie bisher.
- **Gruppen** (optional `gruppen.json`, seit 17.10.2026): holt jedes Gerät selbst vor der Abrufer-Sperre, prüft sie
  (`gruppenPruefen`) und speichert sie nur gerätelokal (`eba-zentral-gruppen`, `ctx.zentral.gruppen()`); keine Notizen. Ein
  Fehler (Netz, Prüfsumme, Schema) hält nur die Gruppen an: alter Stand bleibt, `bericht.warnung` nennt ihn, Termine und
  Semesterdaten laufen weiter.
  Anzeige: `gruppen.js`, Codeblock `eba-gruppen [alle]`, Filter wie die Termine (`filterBauen`) plus aktuelles und nächstes
  Semester. Weil `gruppen.js` vor `zentral.js` und `modell.js` lädt, meldet es sich als `ctx.gruppenAnzeige` an, und
  `zentral.js` zeichnet damit neu. CSS: Abschnitt 50 in `eba-core.css`.
- **Anmeldungen** (Codeblock `eba-anmeldungen` in `termine.js`, seit 17.10.2026; ersetzt die Tabelle zum Eintragen auf
  Termine & Anmeldungen): Zeilen aus den zentralen Termin-Notizen mit `kategorie: Frist`, deren Titel Anmeldung, Belegung oder
  Buchung nennt (ein eigenes Feld dafür gibt es in `termine.json` nicht). Filter `filterBauen().aufnehmen` wie beim Übernehmen
  (mit `code` nur Module deines Plans). Nur Anmeldungen fürs Studium, unabhängig von „Fachschaft & Veranstaltungen“: mit
  `code`, mit `bereich` (Schlüsselqualifikation), TCP, Übungs- und Tutoriengruppen, Prüfungsanmeldung (Titel). Karriere,
  Workshops, Sport, Vorträge oder das Kolloquium stehen als Frist nur in der Agenda, damit jede Information an einer Stelle
  steht. Nur bis zum Ende des aktuellen Semesters (`ctx.modell`), Vorbeigegangenes noch 7 Tage, gedämpft und unten.
  Wann aus `datum`/`bis` und den Zeiten in `ort` („ab 15:00“, „bis 30.10. 15:00“; „ab“ = Anmeldung öffnet, „bis“ oder
  Anmeldeschluss/-frist im Titel = Schluss), Wo aus dem Rest von `ort`, sonst die Quelle. Gibt es für das Modul eine
  Gruppen-Notiz (`herkunft: ilias-gruppe` oder `gruppe-gewaehlt`, aktuelles Semester, nicht entfallen; nennt der Titel Übung
  oder Tutorium, zählt diese Art) oder seit 18.10.2026 eine andere Stundenplan-Notiz (Alma, von Hand, eigener Uni-Abgleich, ohne
  `herkunft`; nie zentral), die zur Zeit einer Gruppe dieses Moduls aus `gruppen.json` passt (`gehoertZu` aus `meine-gruppe.js`,
  die eine Regel: Code, Semester, Wochentag, Beginn ±15 Min. c.t./s.t.; hier mit `ende` und `arten` Übung oder Tutorium; nie
  über die Nummer),
  steht eine grüne Pille „Gruppe 4“ dabei (Name nur aus dem Feld `gruppe` der Notiz, sonst nur „angemeldet“; nie `gruppe_alma`;
  bis 18.10.2026 „angemeldet · Gruppe 4“).
  Vorher blieben die Notizen eines eigenen Abgleichs ohne `herkunft` bei „offen“. Neu gezeichnet bei
  `ctx.modell.beiAenderung` und wie die Agenda. Reine Logik (`anmeldungen`, `ortTeilen`, `anmeldeStand`) in
  `tests/termine.test.js`. CSS: Abschnitt 57.
- **Angebote der Uni** (optional `angebote.json`, seit 17.10.2026): Vorträge, Kurse der Unibibliothek, Hochschulsport, Welcome Center. Geholt
  und gespeichert wie die Gruppen (gemeinsamer Helfer `optionalHolen`; `angebotePruefen`, `eba-zentral-angebote`,
  `ctx.zentral.angebote()`); ein Fehler hält nur die Angebote an. Anders als bei den Gruppen gilt eine Datei, die im Manifest
  fehlt, als zurückgezogen: Der gerätelokale Stand wird gelöscht (nicht bei `pause`). Sind die zentralen Daten aus, liefern
  `angebote()` und `kapitel()` `null` (der Stand bleibt fürs Wiedereinschalten) und `status().neueVersion` ist leer; `gruppen()`
  liefert weiter den letzten Stand (Markierung „deine Gruppe“ in ILIAS, Raster und Agenda). Anzeige: `angebote.js` (meldet sich
  als `ctx.angeboteAnzeige` an).
  *Anzeige (seit 0.7.0):* Die gewählten Angebote stehen als Termine im Kalender und in der Agenda auf **Termine & Anmeldungen**
  (`ctx.angeboteAnzeige.termine()` → `termineVon`; `kalender.js`, `termine.js` → `mitAngeboten`), lila wie Veranstaltungen, der
  Titel mit der Art vorn („Vortrag: …“, „Unibibliothek: …“), als Link zur Seite der Uni. Im Raster rücken sie hinter Pflicht und
  Freiwilliges (eher in „+n weitere“), unter „Vergangen“ stehen sie nicht. Hochschulsport: `anmeldung.ab` als eigener Termin
  „… – Buchungsstart“ am Tag der Buchung. Was schon als Termin-Notiz dasteht, kommt nicht doppelt: gleicher Tag und gleiche Uhrzeit,
  der kürzere Titel steckt als ganze Wörter im längeren (z. B. „UB-Kurs: Zotero“ aus `termine.json`); fehlt eine Uhrzeit, nur bei
  gleichem Titel. Bis 0.6.14 stand
  eine eigene Liste im Codeblock `eba-angebote` unter der Agenda (Chips je Art, 14 Tage, „Mehr anzeigen“); die Seite hatte dafür
  einen Abschnitt „Angebote der Uni“, und wer nie gewählt hatte, sah dort statt der Liste die Karte mit den Häkchen. Steht der
  Block noch auf einer selbst geänderten Seite, zeigt er nur „Angebote der Uni stehen jetzt im Kalender oben.“
  *Auswahl* (synchronisiert in `System/Einstellungen.md`, für alle Geräte gleich): Häkchen im Fenster **Im Kalender zeigen**
  (Filter-Symbol im Kopf des Kalenders, `ctx.angeboteAnzeige.filter()`, `.eba-modal-angebote`) und in der Einrichtung
  (Bildschirm 6, seit 25.10.2026), beide mit `wahlListe`; für die Einrichtung `ctx.angeboteAnzeige.wahl(el)` →
  `{ felder(), gespeichert() }`, sie schreibt `felder()` zusammen mit ihrem Stand (`wahlFelder`). Nur Namen, kein Satz darunter.
  **Fertig** im Fenster schreibt nur, wenn sich etwas ändert oder noch nie gewählt wurde; Schließen ohne **Fertig** verwirft die
  Häkchen. Solange `angebote_gewaehlt` nicht `true` ist, gilt die Vorgabe. `angebote_auswahl` = Liste der gewählten Schlüssel:
  `sport`, `ub`, `welcome` (ganze Art) und je Vortragsreihe `vortrag-wiso`, `vortrag-studium-generale` (am Namen erkannt) bzw.
  `vortrag-<name>` für jede andere Reihe aus den Daten. Vorgabe: `sport`, `ub`, `vortrag-wiso`; Studium Generale, Welcome Center
  und unbekannte Reihen sind aus. Gewählte Schlüssel, die das Fenster gerade nicht zeigt, bleiben beim Speichern erhalten. Die
  Häkchen setzen auch **Fachschaft & Veranstaltungen**, also dasselbe Feld `zentrale_veranstaltungen` wie das Fenster „Zentrale
  Daten“ (nur bei geändertem Wert geschrieben; `zentral.js` wendet den Filter danach neu an).
  *Neu zeichnen:* `angebote.js` meldet das Ereignis `eba-angebote` am `document`, wenn neue Angebote da sind (`zentral.js` ruft
  `ctx.angeboteAnzeige.neu()`), nach **Fertig** und wenn sich die Auswahl in den Einstellungen ändert (auch per Sync, andere
  Felder nicht); Kalender und Agenda hören darauf (`ctx.dom`, übersteht das Neuladen eines Skripts in beliebiger Reihenfolge).
  Reine Logik (`termineVon`, `titelVon`, `gleicherTitel`, `wahlLesen`, `wahlFelder`, `wahlSchreiben`, `wahlNeu`, `wahlEintraege`)
  in `tests/angebote.test.js`, `mitAngeboten` und `link` in `tests/termine.test.js`. CSS: Abschnitt 53 in `eba-core.css`
  (Häkchen, Fenster), Filter-Symbol in Abschnitt 37 (`.eba-kal-filter`).
- **Zentraler Stundenplan** (optional `veranstaltungen.json`, Vertrag in `docs/daten-v1.md`, seit 17.10.2026; Plan 27.1, Antwort
  auf die Befunde 6, 7 und 18 der Prüfung): Anders als Gruppen und Angebote schreibt er Notizen, darum **nur der Abrufer**.
  Eigener Abruf nach den anderen Dateien (`lehreHolen`, `lehrePruefen` wie `veranstaltung_pruefen` im Export, aber unbekannte
  `art` → „Sonstige“, unbekannte Felder ignoriert): Netz-, Prüfsummen- oder Formatfehler und selbst eine Ausnahme beim Anwenden
  landen nur als `bericht.warnung` („Stundenplan: …“), Termine und Semesterdaten laufen weiter. Fehlt die Datei im Manifest,
  bleibt der letzte Stand. `stand().lehre` merkt auf jedem Gerät, ob das Manifest sie nennt (für die Texte).
  *Filter* (`stundenplanFilter`, nur das aktuelle Semester, kein `fs + 1`): bestanden/anerkannt nie; läuft/angemeldet immer;
  `semester_geplant` nur, wenn es das aktuelle Semester ist (Wiederholer, Verschieben); `gewaehlt` ohne eigenes Semester, wenn
  sein Musterplan-Semester das aktuelle ist oder es keins hat (Schwerpunkt); sonst Pflichtmodule des aktuellen Fachsemesters
  laut Musterplan der Variante, bei „offen“ nur Codes, die **alle** Pläne in diesem Fachsemester haben (`pflichtCodes`). Ohne
  Studienbeginn (`studienbeginnStandard`) kein Musterplan-Anteil, nur selbst Markiertes; das Wochenraster bittet dann um den
  Studienbeginn, wenn die Woche sonst leer wäre (siehe [„Wochenraster“](modell.md)). *Auswahl* (`stundenplanAuswahl`): Hat ein Modul für eine Art mehrere Gruppennummern, ist das eine persönliche
  Wahl und wird nie eine Notiz (eigene Gruppe: Alma oder von Hand); ids aus `stundenplan_ausgeblendet` nicht.
  *Notiz* (`lehreNotizText`): eine je id in `Stundenplan/` („Mo 10.15 B110 Vorlesung“, Einzeltermin „JJJJ-MM-TT B110 …“),
  Frontmatter wie Alma-Notizen (`typ: lehrveranstaltung`, `titel`, `code`, `modul`, `art`, `wochentag`, `tag`, `beginn`/`ende`
  mit c.t. verschoben, `raum`, `semester`, `von`/`bis`, `rhythmus` (nur „14-täglich“, wie in Alma-Notizen), `ausfall`,
  `aenderungen`, `einzeltermin`, `quelle`, `herkunft: zentral`, `zentral_id`, `uebersicht: "[[Stundenplan]]"`), eigene Felder und
  alles ab `## Meine Notizen` (ältere: `## Notizen`) bleiben. Text: Zeit, Zeitraum,
  „Fällt aus“, „Anders“, „Zusätzlich“, Quelle; **Besuche ich nicht** steht seit 0.4.6 als Status-Knopf im Kopf der Notiz
  (`kopf.js`). Umbenannt (seit 24.10.2026), wenn sich der Name nach der Regel ändert, weil ein offizieller Name (`bezeichnung`)
  dazukommt, sich ändert oder wegfällt („Fr 14.15 S110 Praktikum“ → „Fr 14.15 S110 Data Science Lab“) oder die Zeit sich ändert,
  und nur, solange die Notiz noch ihren bisherigen Namen nach der Regel trägt (aus ihren Eigenschaften vor dem Schreiben, auch mit
  Zähler „… 2“); im Ordner, in dem sie liegt. Einen eigenen Namen lässt der Abrufer stehen. Kommt ein Feld dazu, steigt `LEHRE_FASSUNG` (Teil von
  `lehreSchluessel`): Der Abrufer schreibt dann alle zentralen Notizen einmal neu, auch ohne neue `veranstaltungen.json`. Bis
  20.10.2026 fehlte `rhythmus`, eine 14-tägliche Veranstaltung stand darum jede Woche im Raster.
  *Wochenraster* (Dashboard und Stundenplan, jede gezeigte Woche, `woche.js`): `ausfall` → „Fällt aus“ in Warnfarbe;
  `aenderungen` = „Datum|Beginn|Ende|Raum“ (immer vollständig, ohne Zusatztermine) → liegt das Datum in der
  gezeigten Woche, zeigt der Kasten Zeit und Raum der Änderung in Warnfarbe, den üblichen Wert durchgestrichen (siehe
  [„Wochenraster“](modell.md), *Ausnahmen*; CSS Abschnitt 55). Das Raster lässt
  Notizen mit `entfaellt: true` und „Besuche ich nicht“ (`ctx.modell.besuchtNicht`: Schlüssel in `stundenplan_ausgeblendet`,
  eigene Notiz `besuche_nicht: true`) weg; Einzeltermine stehen in ihrer Woche im Raster (für die Höhe zählen Serien plus
  Einzeltermine dieser Woche). Die Liste (Bases) auf der Seite Stundenplan gibt es seit 24.10.2026 nicht mehr.
  *Alma gewinnt* (`eigenePaare`, Befund 6): Eine eigene Notiz (Alma oder von Hand, nicht zentral) ersetzt einen zentralen
  Eintrag bei gleichem Code, Semester, Wochentag, Art-Klasse (Vorlesung ≠ Übung/Tutorium ≠ Seminar; unbestimmte Art wie
  „Veranstaltung“ oder Almas „Übungsteil“, den die Daten als Vorlesung führen, nur bei genau passender Zeit), Beginn und Ende
  höchstens 15 Min. daneben, gemessen an der Alma-Zeit und – bei c.t. – an der um 15 Min. verschobenen; Zeitraum überschneidet
  sich (Einzeltermin: Datum im Zeitraum, nicht in `ausfall`). Genau vor Toleranz,
  bekannte Art vor unbestimmter, gleicher Raum vor anderem; jede eigene Notiz ersetzt höchstens eine Serie. Abgeglichen wird
  **nur auf dem Abrufer**: `alma.js` lässt Notizen mit `herkunft: zentral` ganz aus (nie übernehmen, ändern, löschen) und legt
  seine eigene an; der Abrufer sieht sie (lokal oder per Sync, `lehreSchluessel` im Filter-Schlüssel) und räumt die zentrale weg:
  unberührt → Papierkorb, mit eigenem Text unter `## Meine Notizen` → der Text wird an die eigene Notiz angehängt („Aus der zentralen
  Notiz übernommen (Datum)“), dann Papierkorb. So schreibt nie mehr als ein Skript in eine Notiz. Verschwindet die eigene Notiz
  (in Alma abgemeldet, gelöscht), gilt wieder die zentrale; fehlt die Veranstaltung in Alma von Anfang an, bleibt die zentrale
  (Entscheidung 17.10.2026). Bis der Abrufer läuft, können kurz beide im Raster stehen.
  *„Besuche ich nicht“* (Befund 6.2/7): Knopf in der Notiz bzw. Befehl → id in `stundenplan_ausgeblendet` (synchronisiert,
  `types.json` multitext). Das Raster blendet sofort aus (Formel, `rasterNeu()` zeichnet offene Seiten neu), der Abrufer legt
  die Notiz in den Papierkorb (mit eigenem Text bleibt sie, aber unsichtbar). Hängt nicht am Eintrags-Hash: Änderungen bringen
  nichts zurück. Löschst du eine zentrale Notiz von Hand, die schon angelegt war (`angewendet`), gilt das genauso. Ausnahme in
  den ersten 80 Min. nach einer Übernahme (`seit` in `abruf.json`): Dann bringt der Sync vielleicht noch Notizen, eine fehlende
  gilt nur als gelöscht, wenn dieses Gerät sie beim letzten Lauf hatte (`lehreDa` in `eba-zentral-stand`); sonst wartet der
  Lauf (nichts angelegt, nichts ausgeblendet). Fehlte `abruf.json` in diesem Lauf, gilt keine fehlende Notiz als gelöscht.
  Fehlen auf einmal mehr als die Hälfte (und mehr als 2) der gewählten Notizen, wird keine ausgeblendet (Warnung, Grabsteine
  bleiben). Zurück:
  Fenster „Zentrale Daten“ → „Nicht in deinem Stundenplan“ → **Wieder zeigen**, oder „Rückgängig“ im Hinweis. Ids alter
  Semester fallen beim nächsten Schreiben weg. Liest Obsidian eine Datei in `Stundenplan/` noch ein, legt der Lauf nichts an und
  wertet nichts als gelöscht.
  *Wegfall*: Fehlt eine id, unberührt → Papierkorb, mit eigenem Text → `entfaellt: true` und „(entfällt)“ (Raster und Liste
  zeigen sie nicht). Schutz: Fehlen auf einmal mehr als die Hälfte (und mehr als 2) der laufenden Serien, gilt keine als
  entfallen; Serien, deren Ende über 30 Tage her ist, und Notizen eines anderen Semesters (beim Semesterwechsel ersetzt der
  Export das Semester) bleiben unverändert und zählen für den Schutz nicht mit. Nicht mehr gewählt (Filter, „Besuche ich
  nicht“), aber noch in den Daten: unberührt → Papierkorb, mit eigenem Text bleibt sie und Zeit, Raum, Ausfälle kommen weiter
  aus den Daten.
  *Texte und Schloss* (Befund 7): Mit zentralem Stundenplan (`ctx.zentral.stundenplan()` → `{ verfuegbar, anzahl, ohneBeginn,
  ausgeblendet }`) ist Alma freiwillig: Zeile Alma unter Verbindungen und Einrichtungsschritt sagen „Deine
  Vorlesungen kommen von selbst, deine Übungsgruppe meist aus ILIAS, sobald du es verbindest. Alma brauchst du nur für Extras.“ (bei
  EcoBA meldet man sich in ILIAS für Gruppen an, Almas Kalender kennt sie meist nicht), kein Schloss, solange zentrale Notizen
  da sind; `stundenplanAnzahl()` in `verbindungen.js` zählt zentrale und Gruppen-Notizen nicht als Alma-Daten.
  `gruppen.js` markiert eine Gruppe nur mit einer Notiz, die eine Übung sein kann (nie Art Vorlesung oder Seminar; Befund 18).
  *Eine Regel „ist das deine Gruppe?“* (seit 0.4.5): `gehoertZu(fm, g, { arten, ende, ueberId })` in `meine-gruppe.js` gilt für
  ILIAS und „Meine“ (`deckt`), die Markierung in `eba-gruppen` (`gruppen.js`, Gruppen-Notizen über ihre `gruppe_id`) und
  die Pille „Gruppe 4“ (`termine.js`); vorher prüfte jede Stelle selbst (dort ohne c.t.).
  *Stundenplan von außen* (`eba.quelleExtern("stundenplan")`, siehe [„Quellen außerhalb des Plugins“](quellen.md); ohne Liste beim eigenen
  Uni-Abgleich: `System/Skripte/abgleich.js` im Tresor oder `ilias_unterlagen: extern`): Der zentrale Stundenplan wird weder
  geholt noch angewendet, vorhandene zentrale Notizen
  bleiben unberührt und `verfuegbar` ist `false`, die Texte versprechen also keine Vorlesungen; Gruppen-Notizen aus ILIAS
  weichen den Notizen des eigenen Abgleichs wie jeder anderen Notiz ohne `herkunft`. Alma verbindet man dort nicht (`alma.js`
  schriebe dieselben Veranstaltungen ein zweites Mal): Zeile unter Verbindungen und Einrichtung sagen nur „Dein Stundenplan
  kommt über deinen Uni-Abgleich.“, kein Schloss (siehe [„Verbindungen und Schloss“](verbindungen.md)).
  Tests: `tests/stundenplan.test.js` (Prüfung, Filter, Auswahl, Alma gewinnt, Notiz mit offiziellem Namen und Umbenennen, Ablauf im Tresor im Speicher).
- **Deine Übungs- oder Tutoriengruppe** (seit 17.10.2026, Plan 27.1 Punkt 1; ohne KI und ohne `veranstaltungen.json`, nur
  ILIAS-Mitgliedschaften und `gruppen.json`): Bibliothek `meine-gruppe.js`, zwei Schreiber mit je eigener `herkunft`.
  *Aus ILIAS* (`ilias.js`, nur das Gerät mit der ILIAS-Sperre, im normalen Lauf nach dem Durchsuchen; im eigenen Uni-Abgleich
  mit ILIAS-Zugang nur dieser Teil, Lauf `nur-gruppen`, nie Downloads): Mitglied heißt, die Gruppe steht auf „Meine Kurse und
  Gruppen“ (dieselbe Anfrage wie die Kursliste; `mitgliedschaften()` liefert Titel und Beschreibung). Den Modulcode liefert der
  durchsuchte Kurs bzw. Unterordner, in dem die Gruppe steht (`inhalt()` erkennt „Mitgliedschaft beenden“ als `mitglied`),
  sonst die Brotkrumen der Gruppenseite (`brotkrumen()`, höchstens 5 Seiten je Lauf; mit Code gemerkt, ohne Code erst nach
  einer Woche neu versucht, `kursVersucht`); nie die Uhrzeit. Das Zeitfenster (`zeitfenster`) kommt aus Titel und Beschreibung,
  die nur im Speicher bleiben (dort stehen Namen von Tutor:innen): Klammern fallen vorher weg, dann Wochentag, Zeitspanne und
  Raumnummer hinter einem Raumwort; kein oder mehr als ein Tag, keine oder mehr als eine Zeitspanne → kein Zeitfenster;
  „14.10 - 16.12“ ist ein Datum (Punkt-Minuten nur :00/:15/:30/:45). Name: `gruppenName` („Gruppe 4“, „Tutorium 1“ vom
  Titelanfang). Zuordnung (`zuordnen`) nie über die Nummer (ILIAS und Alma zählen verschieden, gemessen 17.10.2026: S100 ILIAS
  „Gruppe 4“ = Liste Gr. 5): gleicher Code, Semester und Wochentag, Beginn und Ende höchstens 15 Min. daneben (c.t./s.t. wie
  `eigenePaare`), bei mehreren die Raumnummer, dann die kleinere Abweichung, sonst „mehrdeutig“ mit Kandidaten. Eindeutig →
  eine Notiz in `Stundenplan/` („Di 10.15 S100 Tutorium Gruppe 4 (ILIAS)“, gewählt „… (gewählt)“: nie der Name einer Alma-,
  Oracle- oder zentralen Notiz; ältere Namen benennt der Schreiber mit dem fileManager um, Links ziehen mit). Ohne geladene Gruppenliste werden keine Notizen angelegt und keine entfernt. Index `gruppen` je
  ref_id: Code, Kurs, Name, Zeitfenster, `mitglied`, `fehlt`, `kursVersucht`, `status` (zugeordnet | mehrdeutig | ohne-treffer
  | ohne-zeit | ohne-code | ohne-daten), `zentral`, `kandidaten`; nie Titel oder Beschreibung.
  *Felder der Notiz* (fürs Wochenraster wie zentrale Notizen): `typ: lehrveranstaltung`, `titel` („<Modul> · Tutorium Gruppe
  4“; beginnt der Name mit der Art: „<Modul> · Tutorium 1“), `code`, `modul`, `art`, `wochentag`, `tag`, `beginn`/`ende` (echte
  Zeit, c.t. verschoben), `raum`, `semester`, `von`/`bis` (nur mit Zeitraum in `gruppen.json`), `ausfall: []`, `einzeltermin:
  false`, `gruppe` (Name zum Zeigen: aus ILIAS „Gruppe 4“, sonst „Gruppe <Nummer der Liste>“), `gruppe_alma` (Nummer in
  `gruppen.json`, nur intern), `gruppe_id`, `quelle`, `herkunft`, `ilias_gruppe` (nur ILIAS), `uebersicht: "[[Stundenplan]]"`.
  Überschneidungen stehen nicht in der Notiz, die Woche rechnet sie (siehe [„Wochenraster“](modell.md), *Kästen*); das Feld `konflikt` (bis
  24.10.2026) fällt beim nächsten Schreiben weg. Eigener Text (Zeilen im Kopf, die
  nicht von hier stammen, und alles ab `## Meine Notizen` bzw. `## Notizen`) bleibt beim Aktualisieren.
  *Gewählt* („Meine“ in `eba-gruppen`, `gruppen.js`, auf dem Gerät, auf dem du tippst): Notiz mit `herkunft: gruppe-gewaehlt`;
  eine je Modul und Art (eine neue Wahl ändert sie und trägt `gewaehlt_am`, den Zeitpunkt der Wahl), „Abwählen“ → Papierkorb
  (die Notiz der angetippten Gruppe) und bleibt, solange es eine gewählte Notiz gibt.
  „Meine“ fehlt, wenn die Gruppe schon aus ILIAS, Alma, von Hand oder zentral kommt. Beim Zeichnen und nach jeder Änderung in
  `Stundenplan/` (höchstens einmal je Minute, auf jedem Gerät) weichen gewählte Notizen,
  die eine ILIAS-Notiz desselben Moduls oder eine andere Notiz zur selben
  Zeit inzwischen abdeckt; steht der eigene Text schon in der anderen Notiz (ein zweites Gerät war schneller), wandert er
  nicht noch einmal. Ist die gewählte Notiz genau die freigegebene Fassung der ILIAS-Notiz (`freigabeText`, siehe
  *Freigeben*: ein anderes Gerät hat umbenannt, der Sync hat die neue Notiz schon, das Löschen der alten noch nicht), weicht
  sie nicht; sonst gingen beide samt eigenem Text verloren. Danach folgen die übrigen gewählten Notizen `gruppen.json`
  (seit 24.10.2026, `gewaehltAufraeumen` mit `aktualisieren`, nur auf dem Gerät, das für alle schreibt,
  `ctx.zentral.abruferHier`; auch gleich nach neuen Gruppendaten): Steht ihre Gruppe (`gruppe_id`) noch in der Liste und weicht
  ein Feld ab, das aus der Liste kommt (`weichtAb`: Tag, Zeit, Raum, Zeitraum, Code, Art, Semester, Nummer, Quelle), schreibt
  `notizText` Felder und Kopf neu (eigener Text, eigene Felder, `gewaehlt_am` und ein Name aus ILIAS bleiben, ohne Modulnotiz
  auch Link und Kurztitel; `ausfall` und `einzeltermin` bleiben, solange es dieselbe Gruppe ist). Umbenannt wird nur, solange
  die Notiz den aus ihren bisherigen Feldern erzeugten Namen trägt; einen eigenen Namen behält sie. Fehlt sie, wird die Notiz
  „(entfällt)“ statt Papierkorb (eine Gruppe, die die Prüfung von `gruppen.json` verwirft, sieht genauso aus) und ist wieder
  normal, sobald sie zurückkommt. Nur für Semester, die die Liste nennt; nur, wenn `gewaehlt_am` nicht nach dem `stand` der
  Liste auf diesem Gerät liegt (jedes Gerät holt `gruppen.json` selbst; wer eine neuere hatte, hat vielleicht eine neue Gruppe
  gewählt), ohne `stand` nie; nicht, wenn auf einmal mindestens zwei und mehr als die Hälfte fehlen; nicht neben einer
  ILIAS-Notiz desselben Moduls und derselben Art. Vorher kopierte „Meine“ die Felder einmal, und eine verlegte Gruppe stand
  weiter zur alten Zeit im Stundenplan. Nicht eindeutige ILIAS-Gruppen zeigt die Karte mit Satz und markierten Kandidaten; Gruppen aus ILIAS mit
  ihrem ILIAS-Namen („in ILIAS Gruppe 4“).
  *Freigeben* (`gruppenFreigeben` in `ilias.js`, `iliasFreigeben` in `meine-gruppe.js`): Prüft kein Gerät die ILIAS-Notizen
  mehr, würden sie „Meine“ für immer sperren. Darum werden sie zu gewählten Notizen (nur `herkunft`, `ilias_gruppe` weg,
  Info-Kasten, Name „… (gewählt)“; ILIAS-Name, Felder und eigener Text bleiben; entfallene bleiben, wie sie sind), und die
  Mitgliedschaften im Index gelten nicht mehr (`mitglied: false`). Wann: beim **Trennen** (nach einem laufenden Abruf), wenn
  ILIAS die **Anmeldung ablehnt** (falsches Passwort, Zustimmung, zweiter Faktor) und beim Start eines Geräts ohne Zugang, wenn
  die Sperre **verwaist** ist. Wer: nur das Gerät, das die Notizen schreibt, also wenn die Sperre ihm gehört, älter ist als
  80 Min. (verwaist: 7 Tage) oder fehlt (verwaist nicht: auf einem neuen Gerät kommt sie vielleicht erst nach den Notizen per
  Sync). Danach steht die Sperre mit `frei: true` auf ihm: Ein zweites Gerät wandelt nicht noch einmal um, eines mit Zugang
  übernimmt beim nächsten Lauf sofort und macht die gewählte Notiz wieder zur ILIAS-Notiz. Gleiches Ergebnis auf jedem Gerät;
  liegt die umgewandelte Notiz schon da, geht die alte nur in den Papierkorb. Ein Index, der per Sync kommt, wird neu gelesen
  (Ereignis `modify`, nicht während eines Laufs), damit die Karte auf allen Geräten stimmt.
  *Eine Regel für alle Quellen:* `alma.js` und `zentral.js` fassen beide Herkünfte nie an. Deckt eine andere Notiz (Alma, von
  Hand, zentral) dieselbe Gruppe, weicht die Gruppen-Notiz wie eine zentrale Vorlesung vor Alma: eigener Text wandert einmal
  hinüber, dann Papierkorb. ILIAS übernimmt eine gewählte Notiz desselben Moduls und derselben Art, weitere gewählte und Doppel
  derselben ILIAS-Gruppe (Sync-Verzug, Konfliktkopie) weichen in diese eine. Verlassen in ILIAS gilt erst, wenn die Gruppe zwei
  Läufe in Folge fehlt (`fehlt`, zählt höchstens bis 2; Notizen, die schon „entfällt“ tragen, zählen nicht mit, so schreibt ein
  unveränderter Lauf den Index nicht neu); eine ganz leere Gruppenliste entfernt nie etwas (Warnung). Dann Papierkorb, mit
  eigenem Text „(entfällt)“; fehlen auf einmal mindestens zwei und mehr als die Hälfte, bleibt alles stehen (Warnung).
  *Von dir gelöscht* (seit 0.4.5, Lebenslauf des Quellen-Vertrags): Der Index merkt je Gruppe, für welche Gruppe aus
  `gruppen.json` schon eine ILIAS-Notiz da war (`notiz`). Fehlt sie dann (und keine gewählte Notiz desselben Moduls), hast du sie
  gelöscht: Sie kommt nicht wieder, bis die Zuordnung wechselt oder du die Gruppe verlässt (`notiz` wird leer).
  *Eine Gruppe je Modul und Art* (seit 19.10.2026, `doppelt` und `vorrang` in `meine-gruppe.js`): Zwei Tutorien desselben
  Moduls standen blass nebeneinander im Stundenplan. Ursachen: Ein zweites „Meine“ sah die eben angelegte Notiz nicht (Obsidian
  hatte sie noch nicht eingelesen, zwei Tipps kurz hintereinander, oder ein zweites Gerät wählte vor dem Sync), und zwei
  gewählte Notizen führte nichts zusammen; wer in ILIAS die Gruppe wechselte, hatte die alte Notiz bis zum zweiten Lauf daneben;
  wer in ILIAS in zwei Gruppen eines Moduls war, bekam zwei Notizen. Jetzt, an der Quelle: Wer auf einem Gerät Gruppen-Notizen
  schreibt (Wählen, Abwählen, Aufräumen, ILIAS), kommt nacheinander dran, und Wählen liest Notizen ohne Eintrag im
  metadataCache aus ihrem Text; eine neue Wahl ersetzt jede ältere desselben Moduls und derselben Art (weitere weichen samt Text
  in sie); eine neue ILIAS-Gruppe übernimmt die Notiz der verlassenen; von mehreren ILIAS-Mitgliedschaften eines Moduls und
  einer Art bekommt nur eine eine Notiz (die eine andere Notiz zur selben Zeit schon abdeckt, sonst nach `vorrang`). Welche
  gilt, entscheidet überall dieselbe Reihenfolge (`vorrang`, auf jedem Gerät gleich): ILIAS vor deiner Wahl, die jüngere Wahl
  (`gewaehlt_am`; ohne = älter) vor der älteren, dann die Gruppe, die zur aktuellen Gruppenliste passt (gleiche id, Tag und
  Beginn), dann die frühere in der Woche, dann die id. Die Woche zeigt nur diese; bestehende Doppel führt das Aufräumen von
  `gruppen.js` einmal zusammen (nach jeder Änderung in `Stundenplan/` und beim Zeichnen, höchstens einmal je Minute): Text der
  anderen wandert in die bleibende, die anderen gehen in den Papierkorb. Doppelte ILIAS-Notizen fasst nur `ilias.js` an (ein
  Schreiber), eine halb synchronisierte Freigabe bleibt verschont. Nichts davon wird eine Aufgabe für dich: Was entschieden
  wurde, steht nur im Gerätespeicher (`eba-gruppen-protokoll`, die letzten 30). Eine Gruppen-Notiz, die eine Notiz zur selben
  Zeit abdeckt (Alma, von Hand, zentral), fehlt in der Woche gleich; Notizen derselben Art zu einer anderen Zeit, die keine
  Gruppen-Notizen sind, zählen nicht (das kann eine Übung für alle sein).
  *Eine andere Gruppe deines Kurses aus Alma* (seit 20.10.2026, `andereGruppe` in `meine-gruppe.js`): In einem Tresor standen
  zwei B110-Tutorien und zwei Mathe-Tutorien in der Woche, und das eigene Mathe-Tutorium zeigte den Warnpunkt. Der
  Alma-Stundenplan enthielt je eine Parallelgruppe (in Alma vorgemerkt, Alma nennt sie „Übung zu …“, also `art: Übung`), die
  eigene Gruppe kam aus ILIAS (`art: Tutorium`). Weder „gleiche Zeit“ noch „ein Modul, eine Art“ traf. Jetzt: Gehört eine Alma-Notiz (`herkunft: alma`)
  in `gruppen.json` zu einer anderen Gruppe desselben Kurses (Code, Semester, Art der Liste) als deine Gruppen-Notiz (ILIAS oder
  gewählt; ihre Gruppe über `gruppe_id`), ist sie verdeckt (`doppelt`), es gilt deine Gruppe. Sie bleibt liegen (Alma gehört
  sie), steht nie in `faelle` (das Aufräumen fasst sie nicht an) und zählt nicht als Überschneidung: Die Woche rechnet
  Überschneidungen nur mit Notizen, die sie zeigt (seit 24.10.2026 beim Zeichnen; vorher ließen Wählen und ILIAS-Abgleich sie
  beim Schreiben des Felds `konflikt` aus). Ohne Gruppenliste und für Notizen von Hand bleibt alles wie vorher.
  Tests: `tests/meine-gruppe.test.js`, `tests/ilias-gruppen.test.js`, `tests/gruppen.test.js`, `tests/wochenraster.test.js`.
- **Anzeige:** Zeile „Zentrale Daten“ im Codeblock `eba-verbindungen` ohne Schloss: „Aktualisiert vor X Min.“ / „Pausiert“ /
  „Keine Verbindung zu den zentralen Daten. Zuletzt aktualisiert …“, `hinweis` aus dem Manifest. `status()` hat die gemeinsame
  Form der Quellen (`zustand`: aus, laeuft, pause, fehler, an; `geprueft` = letzter Lauf ohne Fehler, gerätelokal `erfolg`;
  `fehler` ein Satz, `grund` der technische Text; `warnungen` = Warnung des letzten Laufs); `stand().geprueft` bleibt das
  zuletzt geprüfte Manifest (für `update.js`). „Neue Version verfügbar“ steht seit 0.2.0 in der Zeile „Studium
  Autopilot“ (`update.js`); nur ohne `ctx.update` zeigt diese Zeile den Link `RELEASES`. „Mehr erfahren“ öffnet das
  Info-Fenster (Datenschutz-Hinweis). Der Termin-Notiz-Kopf zeigt „geprüft am …“ aus `geprueft`; die Agenda liest nur das
  Frontmatter, nie den Notiztext.
- **Für andere Skripte/Tests:** `ctx.zentral` = `{ abrufen(opt), status(), stand(), geraetId(), idAusName(name),
  notizText(alt, eintrag, opt), dateiName(datum, titel), neuerName(name, datum, titel), terminePruefen(d), semesterPruefen(d), manifestPruefen(m),
  gruppenPruefen(d), gruppen(), angebotePruefen(d), angebote(), filterBauen(), protokoll, … }`. `abrufen()` liefert einen Bericht
  (`art`: ok | unveraendert | fehler | pausiert | aus | anderes-geraet; `geschrieben`, `angelegt`, `aktualisiert`, `umbenannt`,
  `entfaellt`, `papierkorb`, `verworfen`).
- **Migration (einmalig, nur im Projekt):** Die 109 Termin-Notizen der Vorlage wurden am 15.10.2026 mit
  einem einmaligen Skript (nicht im Repo) zu zentralen Notizen (id-Regel aus dem Dateinamen, Inhalt genau wie vom Plugin
  erzeugt; zwei Dateien mit falschem Datum im Namen umbenannt). Der alte Notiztext ist dabei entfallen (er stand nie in den
  Daten; Inhalte „für alle“ kommen künftig über `info`). Der erste Abruf schreibt darum keine dieser Notizen neu.
