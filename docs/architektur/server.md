# Architektur: Eigener Server mit Claude

Teil der Architektur-Doku. Aufbau, `ctx`, Skripttypen und die Regeln für Skript-Autoren stehen im Überblick
[architektur.md](../architektur.md).

## Eigener Server mit Claude (`server.js`)

Gegenstelle zum Server-Paket in `server/` (dort `README.md`): Ein eigener Server findet mit Claude Termine und Hinweise; das
Plugin holt sie ab. Ohne Verbindung geht nichts ins Netz; unter Verbindungen steht dann nur die leise Zeile „Für Technische“
(Fenster mit Schritten und **Prompt kopieren**, `ctx.server.PROMPT`, gleicher Wortlaut wie im README).

- **Verbinden:** Aktion `server-verbinden` (Link vom Server: `adresse`, `code`), immer mit Rückfrage. Der Einmal-Code geht per
  `POST /v1/verbinden` an den Server, zurück kommen Zugangs- und Datenschlüssel (je 32 Byte). Beides liegt mit der Adresse im
  Schlüsselbund (`app.secretStorage`, Eintrag je Tresor wie in `ilias.js`). Adresse nur `https://<host>` ohne Pfad, Port oder
  Anmeldung (Test: `plugin.testServerLokal` erlaubt `http://127.0.0.1`).
- **Abruf** (`Q.planen`: nach 30 s bis 2,5 Min., dann alle 15 Min., nach Fehlern nach 2 bzw. 5 Min., zurück in der App nach
  über 10 Min.; Knopf **Aktualisieren**): `GET /v1/eingang` mit dem
  Zugangsschlüssel → Paket `{ schema, zweck, iv, daten }`, AES-256-GCM über Web Crypto, Zusatzdaten
  `studium-autopilot/kanal/v1/eingang` (Gegenstück zu `server/kanal.mjs`) → noch nicht übernommene Eingang-Dateien. Jede
  wird einmal übernommen, danach `POST /v1/stand` (verschlüsselt, Zweck `stand`: Modulcodes aus `ctx.zentral.filterBauen()`,
  Studienbeginn, Variante, `takt` (`server_uni_postfach` 15 | 30 | 60 und `server_gmail` 3 | 1 | 0 aus den Einstellungen, sonst
  15 und 3; im Fenster als zwei Auswahlfelder, Änderung geht beim nächsten Abruf mit), übernommene Dateien, dazu `tresor`: Termine von vor 30 Tagen bis in einem Jahr mit Titel, Datum,
  Kategorie, Modulcode, Herkunft und Haken sowie die offenen To-dos aus `todos.js` mit Modulcode, Frist, Kennung `id` (`t-` + `Q.kurzHash(Pfad + Zeile)`), `pfad` und
  `aenderbar` (offene Aufgabe unter „Zu tun“ einer Begleitnotiz), ohne alles, was nach
  Zugangsdaten aussieht; der Server löscht die Dateien und legt den Auszug Claude als `tresor.json` hin). Nur ein Gerät übernimmt: `sperre.js` mit Quelle
  `server` (`System/Daten/server-abruf.json`), nur Geräte mit Verbindung; hält ein anderes Gerät sie, zeigt die Zeile
  **Hier aktualisieren** (`uebernehmen`, `nehmen({ erzwingen: true })`). Höchstens 50 neue Notizen je Abruf; der Rest bleibt auf dem Server (die Datei gilt erst als
  übernommen, wenn alles da ist, Hinweise kommen dann einmal). Neue Termine, die schon vorbei sind, entstehen nicht.
- **Termine:** geprüft mit `ctx.zentral.terminePruefen`, ids nur `c-` + 20 Hex-Zeichen. Notiz über `ctx.zentral.notizText`,
  danach `herkunft: claude` und `claude_id` statt der zentralen Felder; `zentral.js` fasst sie darum nie an. Doppel: Steht ein
  zentraler oder eigener Termin am selben Tag (±1) mit ähnlichem Titel da (`aehnlich`: Wörter ohne Füllwörter, Zahlen müssen
  gleich sein), entsteht keine Notiz. Erscheint derselbe Termin später zentral, kommt die unberührte Notiz vom Server in den
  Papierkorb. Absagen (`entfaellt`) wie bei den zentralen Daten, neues Datum benennt im selben Ordner um, gelöscht bleibt
  gelöscht, bis sich der Termin ändert (Grabstein `angewendet`: id → `Q.kurzHash`, wie bei den anderen Quellen in der
  Sperr-Datei `server-abruf.json`). Zwei Notizen derselben `claude_id` führt der Abruf mit `Q.dubletten` zusammen.
- **Begleitnotizen (auf Wunsch, seit 0.5.2):** Zu Lehrmaterial (`art` Folien, Skript, Übung, Tutorium, Lab, Lösung, Altklausur, Literatur), dessen
  „Das Wichtigste“ fehlt oder nur Platzhalter hat, zeigt der PDF-Kasten (`pdfkasten.js`) den Knopf **Zusammenfassen**. Er setzt
  `zusammenfassung_angefordert` (UTC, Minute) in den Eigenschaften der Notiz; so erreicht der Wunsch über den Sync das Gerät, das
  mit dem Server spricht, und der Knopf heißt einen Tag lang „Wird zusammengefasst“. Hat die PDF eine Textfassung mit Text
  (`volltext.js`), schickt der Abruf sie als Text mit `[S. N]` (`volltextText`) verschlüsselt an `POST /v1/unterlagen` (Zweck
  `unterlagen`, mit `modell: "opus"`), bis zu 9 je Abruf in Anfragen zu 3, Gewünschtes zuerst (eine abgelehnte Anfrage beendet den
  Abruf, der Rest kommt beim nächsten). `server.json` `gesendet` (SHA-256 → Minute, bei einem Wunsch mindestens dessen Zeit, falls
  die Uhr des Geräts nachgeht) verhindert doppeltes Senden; ein späterer Wunsch geht wieder. Ein Server vor 0.6.3 kennt die Art
  „Lab“ nicht und überspringt sie (Antwort `angenommen` kleiner als gesendet): Lab-Unterlagen stehen dann in `server.json`
  `nachsenden` und gehen nach einem Tag (`NACHSENDEN_TAGE`, der Server aktualisiert sich täglich) noch einmal; die Zeile sagt es. Der Server legt Gewünschtes nach
  `unterlagen/opus/` und schreibt es vor dem gewöhnlichen Lauf in einem eigenen Lauf mit Opus (höchstens 3 je Lauf, ohne Mails).
  **Mit PDF (seit 0.5.7):** Hat die PDF höchstens 500 MB (`PDF_MAX`), setzt der Knopf dazu `zusammenfassung_pdf: true`, und der
  Abruf schickt vor dem Text die PDF selbst an `POST /v1/pdf`, in Stücken zu 8 MB (`PDF_TEIL`, je Stück ein Paket mit Zweck `pdf`:
  Kopfzeile `{ schema, kennung, teil, teile }` als JSON, Zeilenumbruch, Bytes; `verschluesselnRoh`), damit weder das iPhone noch
  der Dienst die ganze PDF auf einmal verschlüsselt. Der Server setzt sie der Reihe nach in `<SHA-256>.pdf.teil` zusammen, prüft
  am Ende den SHA-256 und legt sie als `unterlagen/opus/<SHA-256>.pdf` ab (höchstens 6 und zusammen 1 GB warten, ohne Textfassung
  daneben oder halb hochgeladen verfällt sie nach einem Tag), die
  Textfassung derselben Kennung bekommt die Kopfzeile `PDF: <SHA-256>.pdf`, und Opus liest die PDF mit Read (Skill
  `begleitnotiz.md`, „Mit PDF“; für Seitenbereiche braucht Claude Code `poppler-utils`). Nach einem erfolgreichen Lauf löscht der
  Server die PDF, nach einem gescheiterten kommt sie mit der Textfassung zurück. Nimmt der Server die PDF nicht (älterer Server,
  zu viele, nicht lesbar), geht nur der Text. Vorher schätzt der Knopf die Kosten (`pdfKosten`: je Seite etwa 1500 Token für das
  Bild, gemessen mit `count_tokens` an Folien und Übungen, dazu der Text mit etwa 3,5 Zeichen je Token und etwa 4000 Token
  Ausgabe, Preise von Opus 5.5, Stand 24.10.2026; der Lauf nimmt den Alias `opus`, bei einem neuen Modell Preise prüfen) als Anteil eines Fünf-Stunden-Fensters im Pro-Abo (grob ein Zwanzigstel von Max 20x mit etwa
  8000 $ im Monat, verteilt auf 146 Fenster). Ab 5 % (`PDF_FRAGEN`, etwa ab 8 Seiten) oder ab 20 MB (`PDF_GROSS`, das Hochladen
  dauert) fragt er: „Mit PDF“ oder „Nur Text“. Claude Code liest auch große PDFs, wenn es Seitenbereiche angibt (geprüft mit 30 MB).
  `server_unterlagen`: `knopf` (Standard) | `alle` (dazu jede neue Unterlage ohne Zusammenfassung, gewöhnlicher Lauf, Modell des
  Servers; so bis 0.5.1) | `aus` (nichts, kein Knopf). Die übernommene Begleitnotiz löscht den Wunsch. **Terminsuche** (seit
  0.5.3, nicht bei `aus`): Neue Unterlagen (PDF höchstens 21 Tage alt, `TERMINSUCHE_TAGE`) von Modulen, deren Termine aus
  Unterlagen nicht zentral kommen (`ctx.zentral.abdeckung()`, Manifest-Feld `abdeckung`), gehen einmal mit `nur_termine`; der
  Server schreibt die Kopfzeile „Auftrag: nur Termine (keine Begleitnotiz)“, und Claude liefert daraus nur Termine. Ein späterer
  Wunsch per Knopf geht trotzdem. Ohne Abdeckung (zentrale Daten aus, Manifest ohne Feld) keine Terminsuche. Claude schreibt die Einträge
  (`server/skill/studium-autopilot/begleitnotiz.md`), der nächste Abruf trägt sie mit `begleitnotizErgaenzen` in die Notiz neben
  der PDF ein (gleicher Name `.md`, sonst die Unterlage, deren `datei` auf die PDF zeigt): fehlende Abschnitte über dem
  PDF-Kasten in der Reihenfolge „Das Wichtigste“, „Zu tun“, „Offene Fragen“; Platzhalter älterer Notizen werden ersetzt;
  „Das Wichtigste“ nur, wenn dort nichts steht, bei den anderen nur, was fehlt. Seiten in allen drei Abschnitten als
  ` → [[X.pdf#page=N|S. N]]`, mit `bis` als „S. N–M“ (seit 0.5.6, vorher in Klammern), Fristen „(bis TT.MM.)“; `begriff` steht
  fett vor dem Punkt („**Opportunitätskosten:** …“), wie in den Notizen des Uni-Abgleichs. Dieselbe Lieferung nie zweimal (`server.json` `begleitet`: PDF-Pfad → `Q.kurzHash`); fehlt die Notiz, entsteht
  keine. **Neue Fassung** (seit 0.6.9): Eine Notiz mit früherer Fassung geht von selbst, erst mit der Textfassung der neuen PDF
  und mit dem Feld `fassung`; die neue Zusammenfassung kommt nach oben, die frühere eingeklappt darunter (siehe [„Neue Fassung
  einer Unterlage“](unterlagen.md)).
- **Doppelte To-dos:** Claude nennt Paare `todo_doppel: [{ behalten, weg }]` aus den Kennungen des Auszugs. `todoDoppelAnwenden`
  liest den Auszug frisch und ändert nur „weg“, wenn es eine offene Aufgabe unter „Zu tun“ einer Begleitnotiz ist und die Zeile
  noch genau so dasteht: aus `- [ ] Text` wird `- Text – steht schon in [[Pfad|Name]]`. Keine Ketten, nie abgehakt, nie
  gelöscht; die Zahl steht im Lauf (`todos`) und im Hinweis nach **Aktualisieren**.
- **`server.json`** (synchronisiert, schreibt nur das übernehmende Gerät): `{ schema, erledigt, laeufe, hinweise }`.
  Persönlich (Hinweise aus Mails): wie `server-abruf.json` nie im Release (`server*.json` in `release.py`, `pruefen.py`,
  `.gitignore`).
- **Status, Zeile und Fenster:** `ctx.server.status()` in der Form des Vertrags (`zustand`: `nicht-verbunden` | `anderswo` |
  `laeuft` | `anderes-geraet` | `fehler` | `an`; gerätelokal über `Q.nachLauf`). `ctx.server.zeile()` liefert die Zeile im
  Format von Noten & Anmeldungen (`{ text, symbol, pille, knopf, link }`, HTML an einer Stelle: `quelleZeile` in
  `verbindungen.js`), aus dem öffentlichen `GET /v1/status` (höchstens alle 5 Min., nur Werte aus festen Listen) und dem letzten
  Abruf; Fehler zuerst (Gerät unbekannt → neu verbinden, länger als 3 Tage nicht erreichbar (mindestens zwei Fehlschläge in Folge, der erste vor über 3 Tagen, `fehlerSeit`; der
  letzte Erfolg allein zählt nicht, das Gerät war vielleicht nur aus) → „Weiter mit der Einrichtung“ und
  bei neuer Adresse neu verbinden, Claude nicht verbunden, Uni-Passwort nicht angenommen, Limit), der Stand-Satz aus
  `ctx.verbindungen.standText` wie bei allen Quellen, dahinter der letzte Lauf des Servers und neue Termine. Was nur du lösen kannst, sagt die Zeile selbst (Pille „prüfen“);
  der Server meldet sich nicht in „Bitte prüfen“ (neue Funktionen schieben Nutzern keine Prüf-Listen zu, sie zeigen ihren Zustand selbst). Neue Hinweise von Claude
  (noch nicht im Fenster gesehen, höchstens 14 Tage alt; „gesehen“ merkt sich jedes Gerät selbst, Kurz-Hashes in
  `eba-server-gesehen`, denn `server.json` schreibt nur das übernehmende Gerät): Der Link der Zeile heißt dann „Hinweise ansehen“;
  das Fenster setzt sie auf gesehen.
  **Mails durchsuchen** (Knopf im Fenster und Befehl `server-durchsuchen`) startet einen Claude-Lauf auf dem Server
  (`POST /v1/anstoss`, höchstens alle 10 Min., sonst „Wieder möglich ab …“); solange der Status `claude_lauf` „wartet“ oder
  „laeuft“ meldet, sagt die Zeile „Claude durchsucht gerade …“, und der nächste Abruf kommt nach 5 Min. (`plan.spaeter`).
  Hinweise (`ctx.hinweis`) nur nach **Aktualisieren**, nie vom Zeitplan; Notizen weg nur über den einen Papierkorb. `ctx.server.fensterInhalt(el)`: Stand, Hinweise, letzte
  Übernahmen, „Dieses Gerät trennen“. Ist der Server gerade nicht erreichbar, steht über den Werten „Stand des Servers: nicht
  erreichbar, Angaben von …“ (`erreicht`: letzter geholter Status). Gmail `aus` meldet der Server, solange `server_gmail` 0 ist.
  Neue Version des Servers: Er installiert sie täglich selbst (`studium-server aktualisieren`, Ergebnis im Status unter
  `aktualisierung`). Ging der letzte Versuch schief und hat der Server dessen Ziel nicht schon anders bekommen, steht im Fenster
  „Neue Version: zuletzt ohne Erfolg …“; kam seit mehr als 3 Tagen (`VERSION_TAGE`) nichts ohne Fehler durch, obwohl `release`
  der zentralen Daten neuer ist als seine Version, sagt es die Zeile mit „Weiter mit der Einrichtung“ (Pille „prüfen“). Ein
  älterer Server ohne das Feld bleibt still.
- Testeinstieg: `ctx.server.erzeugen(abh)` (Netz, Tresor, Schlüsselbund als Ersatz); `tests/server-plugin.test.js` läuft gegen
  den echten `server/dienst.mjs` auf einem freien Port. `plugin.testServerAus` schaltet den automatischen Abruf ab.
