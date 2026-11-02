# Architektur: Eigener Server mit Claude

Teil der Architektur-Doku. Aufbau, `ctx`, Skripttypen und die Regeln für Skript-Autoren stehen im Überblick
[architektur.md](../architektur.md).

## Eigener Server mit Claude (`server.js`)

Gegenstelle zum Server-Paket in `server/` (dort `README.md`): Ein eigener Server findet mit Claude Termine und Hinweise; das
Plugin holt sie ab. Ohne Verbindung geht nichts ins Netz; unter Verbindungen steht dann nur die leise Zeile „Für Technische“
(Fenster mit Schritten und **Prompt kopieren**, `ctx.server.PROMPT`, gleicher Wortlaut wie im README).

- **Verbinden:** Aktion `server-verbinden` (Link vom Server: `adresse`, `code`) nur aus der App, immer mit Rückfrage; von außen
  (`c.extern`: Browser, Cloud Shell, andere App) verbindet sie nie und sagt nur „Links von außerhalb von Obsidian verbinden keinen
  Server. Gib den Code unter Einstellungen & Hilfe → Verbindungen bei „Eigener Server“ ein.“ (seit 02.11.2026; jede Webseite
  könnte so einen Link bauen). Dort steht **Mit Code verbinden** (unten) auch auf einem Gerät, das noch nie verbunden war, mit
  einem Feld für die Adresse. Die Rückfrage sagt, was das Gerät dann schickt: die Codes der Module, die Termine, offene To-dos mit
  den Namen ihrer Notizen, den Text der Unterlagen und auf Wunsch die PDFs. Nur bestätigen ohne Tippen geht, wenn der
  Schlüsselbund dieses Geräts genau diesen Server kennt oder die Adresse eben selbst ins leere Feld von „Mit Code verbinden“
  getippt wurde (`adresseGetippt`), das Gerät noch keinen kennt und es nicht genau die Adresse aus `server.json` ist (die
  könnte jemand mit Zugriff auf den Sync samt einem Hinweis zum Abtippen hineingeschrieben haben). Sonst tippst du den Namen des Servers ein (`eintippen`; der
  Knopf geht erst, wenn er dasteht), auch wenn `server.json` genau ihn nennt: Die Datei ist nicht geprüft, jedes Gerät mit Sync
  kann sie schreiben (seit 02.11.2026). Das gilt auch für einen Link `server-verbinden` in einer Notiz (nicht von außen, also
  erlaubt). Von außen öffnen auch `verbinden` und `verbindung-aktualisieren` mit `id=server` das Fenster nie, nur derselbe
  Hinweis (`serverVonAussen` in `verbindungen.js`).
  Den Einmal-Code tauscht das Gerät über
  `POST /v1/verbinden` gegen Zugangs- und Datenschlüssel (je 32 Byte; seit 0.7.8 ohne den Code selbst, siehe „Austausch beim
  Verbinden“). Beides liegt mit der Adresse im
  Schlüsselbund (`app.secretStorage`, Eintrag je Tresor wie in `ilias.js`). Adresse nur `https://<host>` ohne Pfad, Port oder
  Anmeldung (Test: `plugin.testServerLokal` erlaubt `http://127.0.0.1`), und `host` nur ein Name im Internet (`hostOk`, seit
  02.11.2026): wie ihn die Einrichtung vergibt (die IP mit Bindestrichen als Name bei einem Dienst, der den Namen auf diese IP
  zeigen lässt, `server/installieren.sh`; auch mit Punkten) oder eine eigene Domain. Abgelehnt sind IP-Adressen (auch als Zahl wie
  `2130706433` oder hexadezimal, die `new URL` in die Punktform bringt, und IPv6), Namen ohne Punkt, mit Punkt am Ende oder mit
  Ziffern als Endung, Namen für besondere Zwecke oder nur fürs eigene Netz (`localhost` und `*.localhost`, `.local`,
  `.localdomain`, `.internal`, `.lan`, `.home.arpa`, `.test`, `.example`, `.invalid`, `.box` wie `fritz.box`), Namen, die immer
  aufs eigene Gerät zeigen (`lvh.me`, `localtest.me`), und bei solchen Diensten (`hostOk` kennt die beiden üblichen und
  `traefik.me`) der Dienst allein und alles außer genau einer öffentlichen IPv4 im Namen (nicht 0/8, 10/8, 100.64/10, 127/8,
  169.254/16, 172.16/12, 192.168/16, 198.18/15, ab 224). Eine gespeicherte Verbindung mit einer solchen Adresse gilt nicht mehr.
  Das ist eine Vorprüfung: Jeder andere Name kann im DNS auf eine private Adresse zeigen; dort schützt vor allem die Prüfung des
  Zertifikats (https verlangt eins für genau diesen Namen, das ein Rechner im eigenen Netz nicht hat).
- **Austausch beim Verbinden (seit 0.7.8, `austauschen`):** Bis 0.7.7 gingen Code und Schlüssel nur unter dem Schutz von HTTPS
  über das Netz; ein gültiges Zertifikat für den Namen des Servers (die IP darin) bekommt aber auch, wer die IP später bei Oracle zugeteilt bekommt, wer
  den Dienst hinter dem Namen betreibt oder das DNS umlenkt. Jetzt geht der Code nie über das Netz: PBKDF2-SHA256 (`KDF_RUNDEN`
  600 000, Salz `studium-autopilot/verbinden/v2/code\n<host>`, Host wie `hostVon`) macht aus Code und Host 32 Byte, HKDF-SHA256 daraus
  `kennung`, `beweis` und `antwort` (`codeAbleiten`, gleich in `server/verbinden.mjs`). Das Gerät schickt
  `{ schema: 2, kennung, pub, beweis }` (`pub`: öffentlicher Schlüssel P-256 nur für diesen Tausch, `beweis`: HMAC über Host und
  `pub`), der Server antwortet `{ schema: 2, pub, iv, daten }` mit Adresse und Schlüsseln, AES-256-GCM unter HKDF(ECDH-Geheimnis ‖
  `antwort`, Kontext mit Host und beiden öffentlichen Schlüsseln). Das Gerät nimmt nur diese Form an; eine offene Antwort wie bis
  0.7.7, eine verfälschte oder eine ohne den Code gebaute lehnt es ab („Die Antwort deines Servers ließ sich nicht prüfen. Nichts
  gespeichert.“). Ein Server bis 0.7.7 antwortet mit 403 ohne `schema`: „Dein Server kann so erst nach seinem nächsten Update
  verbinden …“, kein Rückfall auf den alten Weg. Gilt für **Mit Code verbinden**, den Code von **Weiteres Gerät verbinden** und den
  Link aus der Cloud Shell (alle über `verbinden`). Zeit: etwa 0,15 s auf einem PC von 2018, auf dem Telefon grob das Doppelte bis
  Dreifache. Formate, Begründung und was bleibt: `server/README.md`, „Verbinden“.
- **Signierte Anfragen (seit 0.7.8, `senden`, `anfrageKopf`):** Keine Anfrage trägt mehr den Zugangsschlüssel; jede hat den Kopf
  `Authorization: Studium-Signatur v=1,zeit=…,nonce=…,inhalt=…,signatur=…` (HMAC-SHA256 unter HKDF(Zugangsschlüssel) über Methode,
  Pfad, Zeit der echten Uhr, 16 Zufallsbytes und SHA-256 des Körpers), der Anstoß dazu `beweis=…` unter HKDF(Datenschlüssel). Der
  Server lässt 5 Minuten Abweichung zu und jeden Zufallswert nur einmal (`server/README.md`, „Anmeldung der Anfragen“). Eine 401
  liest `ablehnung`: `uhr` (Uhr dieses Geräts falsch: „Die Uhr dieses Geräts geht falsch …“), `zugang` (Schlüssel abgelehnt;
  verriegelt nur mit gültiger Signatur der Antwort, siehe Riegel), `erneuert` (die 401 nennt `erneuert: 1`: der Server hat seit
  höchstens 30 Tagen neue Schlüssel und sagt es, signiert unter den alten; die Zeile zeigt gleich „Dein Server hat neue Schlüssel.
  Verbinde dieses Gerät mit einem Code.“, das Fenster Code und Adresse) oder, ohne `signatur: 1` in der Antwort, `alt` (ein Server bis 0.7.7 kennt keine Signaturen: „Dein Server kann das erst
  nach seinem nächsten Update …“). `uhr` und `alt` zählen nicht als abgelehnter Schlüssel (`zugangSeit`).
  Der Server nimmt den Bearer von Plugins bis 0.7.7 nur noch begrenzt an: keinen Anstoß mehr, sobald ein Gerät signiert hat, und gar
  keinen mehr, wenn 7 Tage lang keiner durchkam, spätestens 30 Tage nach der ersten Signatur (`server/README.md`, „Übergang“).
  Antworten auf signierte Anfragen sind signiert (`antwortEcht`: Kopf `studium-signatur`, HMAC unter HKDF(Zugangsschlüssel ‖
  Datenschlüssel, „…/anfrage/v1/antwort“) über nonce, Status und SHA-256 des Körpers); die Antwort auf `/v1/geraet` hat den Zweck `verbinden-antwort`.
  **Riegel** (`riegelZu`, `riegelSetzen`, gerätelokal `eba-server-signatur`, je Server und Schlüssel, dazu im Speicher `riegelHier`,
  falls der Gerätespeicher ihn nicht nimmt): Antwortet ein Server wie einer bis 0.7.7 (`wieAlt`: 401 ohne `signatur: 1` oder seine
  Sperre 429 `zu-viele-versuche`) und hat dieses Gerät noch nie eine signierte Antwort von ihm gesehen, geht dieselbe Anfrage einmal
  mit dem Bearer wie bis 0.7.7 (Antwort mit `bearer: true`, ihre 401 heißt `zugang`). Verriegelt nur eine Antwort mit gültiger
  Signatur oder ein Verbinden ab 0.7.8. Danach nie mehr Bearer an diesen Server; eine alt aussehende Antwort gilt als 401 `alt`, jede
  andere ohne gültige Signatur wirft wie ein Netzfehler (auch eine Ablehnung des Schlüssels ohne `erneuert`: Bei `netz` und `alt` steht
  **Mit Code neu verbinden** zugeklappt im Fenster, nach 3 Tagen offen, `weg`), eine Antwort von `/v1/geraet` mit Zweck `verbinden` gilt nicht. So holt ein Gerät auch während der gestaffelten
  Verteilung (bis 48 Stunden) weiter ab. Vor dem Riegel schützt nur HTTPS wie bis 0.7.7: Ein aktiver Mittelsmann mit gültigem
  Zertifikat sieht dann den Zugangsschlüssel (`server/README.md`, „Riegel“). Verbinden fällt nie zurück.
- **Weiteres Gerät verbinden (seit 01.11.2026):** Auf einem verbundenen Gerät steht im Fenster der Knopf **Weiteres Gerät
  verbinden**. Nach der Rückfrage („Wer diesen Code hat, kann alles lesen, was dein Server für dich findet. …“) holt
  `geraetCode` einen Code über `POST /v1/geraet`: Die Anfrage `{ schema: 1, zeit, nonce }` (16 Zufallsbytes) ist mit dem
  Datenschlüssel verschlüsselt (Zweck `verbinden`), denn den Zugangsschlüssel trug bis 0.7.7 jede Anfrage im Kopf; die Antwort
  `{ code, ablauf }` ebenso. Der Code steht groß (`.eba-server-code`, Festbreitenschrift) mit „Gilt bis …“ und der Anleitung für
  das neue Gerät samt Adresse (`codeAnleitung`) nur im Fenster und verschwindet zu seinem Ablauf (`ctx.zeit`); er kommt nie in den
  Tresor, `data.json`, `server.json` oder den Gerätespeicher. Fehler stehen im Fenster: Uhr des Geräts falsch (über 2 Minuten),
  zu viele Codes („Wieder möglich ab …“), Server zu alt (404), Schlüssel abgelehnt. Grenzen setzt der Server (10 Minuten, einer
  offen, 3 je Stunde, 10 je Tag; `server/README.md`, „Weiteres Gerät ohne Cloud Shell“).
- **Mit Code verbinden:** Ist dieses Gerät nicht verbunden, aber `server.json` da (oder lehnt der Server seine Schlüssel ab, Code
  `zugang`, `erneuert` oder `paket`, etwa nach `studium-server schluessel-erneuern` oder einer neuen IP, oder ist er seit mehr als 3
  Tagen nicht erreichbar, `status().weg`), steht oben im Fenster ein Feld für den Code, eins für die Adresse und der Knopf
  **Mit Code verbinden** (`codeVerbinden`: Code mit `codeForm` in die Form `ABCDE-FGHJK`, Prüfung mit `CODE`). Im Feld der Adresse
  steht nur die aus dem Schlüsselbund dieses Geräts (`adresseGeprueft`, ohne `https://`); ohne sie ist es leer. Die aus
  `server.json` → `adresse` steht nirgends im Fenster, nie im Feld und nie als Ersatz für ein leeres Feld; ohne Schlüsselbund
  zeigt das Fenster auch die Hinweise von Claude aus `server.json` nicht (nur den Satz, dass sie nach dem Verbinden hier stehen). Man tippt die Adresse vom Gerät ab, das den Code erzeugt hat (`codeAnleitung` nennt sie dort immer).
  Seit 02.11.2026 steht das Feld immer da: Nach einer neuen IP hat der Server einen neuen Namen (mit der neuen IP darin), den man dann
  darüber tippt (`adresseEingabe`: ohne `https://` ergänzt, dann `adresseNormal`, also dieselben Regeln wie beim Link). Danach wie
  beim Link `verbinden` mit eigener Rückfrage und eigenen Sätzen (`getippt`); weicht die Adresse von der bisherigen ab, tippt man
  dort den Namen des neuen Servers ein. Nur im Fenster, nie über einen Link von außen. Die Schritte unter Verbindungen nennen erst diesen Weg, dann den Link aus der Cloud Shell.
- **Zuletzt verbunden:** Der Eingang bringt unter `verbunden` die letzten 20 Verbindungen des Servers (Zeit, Herkunft `cloud-shell`
  oder `obsidian`; ein Server ab dieser Fassung dazu `netz`, das grobe Netz des Geräts wie `203.0.113.0/24` oder `2001:db8:1::/48`,
  und `geraet`, wenn das Plugin beim Verbinden einen Namen schickt; dieselbe Liste steht im Status mit Zugangsschlüssel, nie ohne). Das abrufende Gerät schreibt die neueste nach `server.json` → `verbunden`, und das
  Fenster zeigt auf jedem Gerät „Zuletzt verbunden: … (über Obsidian)“ bzw. „(über die Cloud Shell)“. Es ist nur die neueste Verbindung: Ein fremdes Gerät fällt auf, solange
  danach kein eigenes verbunden wurde. Seit 02.11.2026 meldet der Status mit Schlüssel die letzten 20 Verbindungen
  (`verbindungenNormal`: Zeit, Herkunft, grobes Netz `a.b.c.0/24` bzw. IPv6 `/48`, der Name, den das Gerät nennt, als reiner Text
  mit höchstens 40 Zeichen). Dann steht unter „Zuletzt verbunden“ die neueste mit Name und Anschluss („Anschluss 203.0.113.…“),
  darunter zugeklappt „Alle Verbindungen von Geräten (N)“; nur auf dem Gerät, das den Status geholt hat, nie in `server.json`.
- **Abruf** (`Q.planen`: nach 30 s bis 2,5 Min., dann alle 15 Min., nach Fehlern nach 2 bzw. 5 Min., zurück in der App nach
  über 10 Min.; Knopf **Aktualisieren**): `GET /v1/eingang`, signiert
  → Paket `{ schema, zweck, iv, daten }`, AES-256-GCM über Web Crypto, Zusatzdaten
  `studium-autopilot/kanal/v1/eingang` (Gegenstück zu `server/kanal.mjs`) → noch nicht übernommene Eingang-Dateien. Jede
  wird einmal übernommen, danach `POST /v1/stand` (verschlüsselt, Zweck `stand`: Modulcodes aus `ctx.zentral.filterBauen()`,
  Studienbeginn, Variante, `takt` (`server_uni_postfach` 15 | 30 | 60 und `server_gmail` 3 | 1 | 0 aus den Einstellungen, sonst
  15 und 3; im Fenster als zwei Auswahlfelder, Änderung geht beim nächsten Abruf mit), übernommene Dateien, dazu `tresor`: Termine von vor 30 Tagen bis in einem Jahr mit Titel, Datum,
  Kategorie, Modulcode, Herkunft und Haken sowie die offenen To-dos aus `todos.js` mit Modulcode, Frist, Kennung `id` (`t-` + `Q.kurzHash(Pfad + Zeile)`), `pfad` und
  `aenderbar` (offene Aufgabe unter „Zu tun“ einer Begleitnotiz), ohne alles, was nach
  Zugangsdaten aussieht (siehe „Zugangsdaten“ unten); der Server löscht die Dateien und legt den Auszug Claude als `tresor.json` hin). Nur ein Gerät übernimmt: `sperre.js` mit Quelle
  `server` (`System/Daten/server-abruf.json`), nur Geräte mit Verbindung; hält ein anderes Gerät sie, zeigt die Zeile
  **Hier aktualisieren** (`uebernehmen`, `nehmen({ erzwingen: true })`). Höchstens 50 neue Notizen je Abruf; der Rest bleibt auf dem Server (die Datei gilt erst als
  übernommen, wenn alles da ist, Hinweise kommen dann einmal). Neue Termine, die schon vorbei sind, entstehen nicht.
  **Schlüssel abgelehnt** (seit 02.11.2026; seit 0.7.8 nur auf einem Gerät ohne Riegel, verriegelt gilt eine Ablehnung ohne gültige
  Signatur wie ein Netzfehler): Lehnt der Server den Zugangsschlüssel ab (401), merkt sich das Gerät die erste
  Ablehnung einer Reihe, in der jede Antwort des Servers 401 `zugang` war (`zugangSeit` in `eba-server-abruf`; jede andere Antwort, auch
  5xx, die Sperre nach Fehlversuchen oder eine 401 `uhr` bzw. ohne `signatur: 1`, beendet die Reihe; ein Versuch ganz ohne Netz ändert
  nichts und zählt nicht). Ist die
  letzte Antwort 401 und die Reihe älter als 3 Tage (`ZUGANG_TAGE`), ruht der Zeitplan (`ruht()`, kein Abruf mehr von selbst), und die
  Zeile sagt „Dein Server kennt dieses Gerät nicht mehr. Bitte neu verbinden. Bis dahin fragt dieses Gerät nicht mehr von selbst
  nach.“; das Fenster zeigt **Mit Code verbinden**. Vorher fragte das Gerät für immer alle 15 Minuten. Server erneuern ihre
  Schlüssel, wenn sich ihre Adresse ändert. **Aktualisieren** geht weiter; ein Erfolg oder ein neues Verbinden hebt es auf.
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
- **Rückgängig (seit 02.11.2026):** Jede Änderung eines Abrufs an einer vorhandenen Notiz (eine zusammengeführte Aufgabe: Datei,
  alte und neue Zeile, Zeit; ein geänderter oder auf ein neues Datum umbenannter Termin vom Server: Pfad vorher und nachher, der
  geänderte Block von Zeilen mit seiner Stelle, `zeilenDiff`, und eine Prüfsumme der Notiz danach, Zeit; nie ganze Notizen) merkt
  sich das abrufende Gerät gerätelokal (`eba-server-rueckgaengig`, die neuesten 200 und zusammen höchstens 200 KB, `rueckKappen`;
  nur der letzte Abruf mit Änderungen). Scheitert das Speichern (Gerätespeicher voll), gelingt der Abruf trotzdem; nur das
  Rückgängig fehlt dann, und der alte Eintrag wird gelöscht (`lokalObs` wirft nie). Einträge in der Form davor (ganze Notizen,
  ohne Prüfsumme) löscht das Gerät beim Laden. Das Fenster zeigt dann „Zuletzt geändert“ mit Uhrzeit, Zahl und dem Knopf **Rückgängig**
  (`rueckStand`, `rueckgaengig`): Eine Aufgabe kommt zurück, wenn die neue Zeile noch genau so in der Datei steht, ein Termin, wenn
  die Notiz noch genau den Text des Abrufs hat (Prüfsumme und Block, `zeilenZurueck`; dann auch der alte Name, wenn er frei ist); sonst bleibt deine Fassung, und der
  Hinweis sagt es. Eine zurückgenommene Aufgabe führt das Gerät nie wieder zusammen (Kennung in `eba-server-todo-behalten`,
  höchstens 500). Neue Notizen zählen nicht, sie gehen über den Papierkorb weg. Schickt der Server denselben Termin später noch
  einmal, gilt er wieder.
- **Zugangsdaten (eine Heuristik, keine Garantie):** Was nach Zugangsdaten aussieht, geht nicht an Claude. Der Server prüft im
  Auszug aus dem Tresor Titel von Terminen und Text und Notiz von To-dos (`hatZugangsdaten` in `server/eingang.mjs`, vor und nach
  dem Säubern) und lässt solche Einträge weg; das Plugin soll dieselbe Liste nehmen. Erkannt wird auf einer gefalteten Fassung:
  unsichtbare Zeichen zuerst ganz weg (U+00AD, U+034F, U+061C, U+115F, U+1160, U+17B4, U+17B5, U+180B–U+180F, U+200B–U+200F,
  U+202A–U+202E, U+2060–U+2064, U+2066–U+2069, U+3164, U+FE00–U+FE0F, U+FEFF, U+FFA0, Tag-Zeichen U+E0000–U+E007F und
  U+E0100–U+E01EF) und Steuerzeichen ohne Leerraum (U+0000–U+0008, U+000E–U+001F, U+007F–U+009F), damit ein getrenntes Wort
  zusammenbleibt; dann Zeilenwechsel zu Leerzeichen, HTML-Entitäten aufgelöst (auch doppelt kodiert), NFKC, Doppelgänger
  lateinisch (kyrillisch, griechisch, armenisch, punktloses i, IPA-Formen wie ɑ, Kapitälchen wie ᴘ, der Punkt „。“), klein; für
  die Marken eines Kennworts dazu „@“ als a und „$“ als s. Treffer sind:
  - wie `ohneKennwort` in `ilias.js` (Kurstitel): starke Marken in jeder Schreibweise und als Wortende, nicht als Wortanfang
    („Passwortsicherheit“): Passwort, Password, Kennwort (auch mit Punkt, Strich oder Leerzeichen zwischen den Buchstaben), Passwd,
    Pwd, Passw., Kennw., Pass-, Kenn-, Zugangs-, Einschreibe- und Beitrittscode, Mot de passe, Enrolment key, Zugangsdaten,
    Einschreibe-, Beitritts-, Zugangs- und Kursschlüssel, Schlüsselwort; PW-Formen (PW, P/W, P.W., KursPW) mit Ziffer dahinter,
    mit „:“ oder „=“ oder nach einem Trenner; schwache Wörter (Key, Code, PIN, Pass, Zugang, Login, Secret, KW, Schlüssel) nur mit
    „:“ oder „=“ und einem Wert, der wie ein Kennwort aussieht (Ziffer, Sonderzeichen, Großbuchstabe mitten im Wort);
  - dazu (`MUSTER_EXTRA`) als ganzes Wort, auch ohne Wert: Logindaten, Loginname, Anmeldedaten, Passcode, PIN,
    Token, IBAN, BIC, Einschreibeschlüssel, Matrikelnummer, Matrikelnr., Matr.-Nr., TAN (nur groß), iTAN, mTAN, pushTAN, smsTAN,
    chipTAN, photoTAN; und Formen geheimer Werte: eine IBAN (zwei Buchstaben, zwei Ziffern, drei bis sieben Gruppen zu vier),
    `sk-ant-…`, `sk-…` und `sk-proj-…` ab 20 Zeichen, `ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_…`, `github_pat_…`, `glpat-…`,
    `xoxb-`, `xoxp-…`, `AKIA` mit 16 Zeichen, `-----BEGIN … PRIVATE KEY-----`.

  Was so nicht erkannt wird (ein Kennwort ohne jedes Wort davor), kommt durch; umgekehrt fällt auch harmloser Text weg („PIN
  für den Drucker ändern“), was nur die Suche nach doppelten Einträgen betrifft. „Login“ allein zählt nicht („Alma-Login prüfen“),
  nur mit einem Wert (`Login: …`). Beide Filter haben eine begrenzte Rolle: Dieselben Texte erreichen Claude in einem Lauf
  ohnehin über die Mails und Unterlagen selbst; dort schützt nur, dass der Skill alles als Daten behandelt.
- **Anweisungen und Links (ebenfalls eine Heuristik):** Was im Auszug aus dem Tresor steht, liest Claude in jedem Lauf wieder; ein
  To-do, das Claude einmal aus einer präparierten Unterlage in eine Begleitnotiz geschrieben hat, wäre sonst jedes Mal da. Darum
  lässt der Server (`wieAnweisung` in `server/eingang.mjs`, auf derselben gefalteten Fassung) Titel, To-dos und Notizen weg, die einen
  Link enthalten (ein Schema wie `https://`, `mailto:`, `obsidian:`, `www.`, eine Domain mit Pfad oder mit einer bekannten Endung;
  eine Mail-Adresse zählt nicht) oder wie eine Anweisung an ein Modell aussehen: Wortteile wie anweisung, instruction,
  jailbreak, ignorier, ignore, disregard; Wendungen wie „vergiss alles“, „forget all“, „du bist jetzt“, „you are“, „act as“,
  „System-Prompt“, „dein Prompt“, „neue Regel“, „lösche alle“, „für Claude“, „Claude,“ („Prompt“ allein nicht: „Prompt
  Engineering“);
  Rollen wie „System:“, „Assistant:“, `<|`, `[INST]`; Namen von Dateien des Laufs (`ausgabe.json`, `tresor.json` …) und von
  Werkzeugen (`mcp__…`, `search_threads`, `Bash`, `Read(` …). Lieber einer zu viel: Der Auszug dient nur gegen Doppel.
- **Kapitellisten für den Lernplan (seit 31.10.2026, nicht bei `server_unterlagen: aus`):** Der Stand nennt dem Server unter
  `lernplan` das laufende Semester und die Module, die dran sind wie bei den zentralen Listen (`ctx.lernplan.zentralAuswahl`) und
  für dieses Semester keine zentrale Liste haben (`ctx.zentral.kapitel()`); ohne `ctx.lernplan.serverListen` fehlt das Feld.
  Erst wenn der Stand angekommen ist, gehen die Folien dieser Module an `POST /v1/kapitel` (Zweck `kapitel`): die, mit denen der
  Plan rechnet (`ctx.lernplan.folienVon`, je Nummer eine, die neueste Fassung), niedrige Nummern zuerst, bis zu 6 je Abruf in
  Anfragen zu 3, jede PDF einmal (`server.json` `lernplan`: Kennung → Minute), mit `nummer`, `datum`, `quelle` und `seiten` der
  Unterlage. Der Text (`kapitelText`) hat die ersten 8 Seiten ganz (Gliederung), danach je Seite nur die erste Zeile (meist der
  Folientitel), höchstens 60 000 Zeichen. Der Server legt sie nach `unterlagen/kapitel/`; Claude liest sie im gewöhnlichen Lauf mit
  dem Modell des Servers (kein Opus: eine Gliederung lesen ist einfach, und niemand hat darum gebeten), und nur, wenn neue Folien
  da sind. Es bekommt dazu die Listen, die es schon geliefert hat (`kapitel-bisher.json` aus `kapitel.json` des Servers), und
  berichtigt sie, statt neu zu bauen (Skill `lernplan.md`): Nummern und Titel bleiben, an ihnen hängen die Häkchen. Damit das
  auch nach einer Neueinrichtung des Servers gilt, bringt der Stand unter `lernplan.listen` die Listen der Lernplan-Notizen mit
  `herkunft: server` mit (`listeAusNotiz` über `ctx.lernplan.kapitelLesen`: nur zwischen „## Kapitel“ und „## Meine Notizen“,
  nur Kapitel mit Nummer, je Kapitel `nr`, `titel` und `teile`; keine Häkchen, Links oder Seiten; Grenzen wie `kapitel.json`,
  zusammen höchstens 150 000 Zeichen). Fehlt dem Server die eigene Liste eines Moduls, steht die aus der Notiz mit
  `herkunft: notiz` in `kapitel-bisher.json`; die eigene geht vor. Ins Eingang kommt
  unter `kapitel` je Modul die ganze Liste in der Form von `kapitel.json` → `module` ([daten-v1.md](../daten-v1.md#kapiteljson)),
  nur neu oder geändert und nur für gefragte Module. Der Abruf gibt sie an `ctx.lernplan.serverListen`; lernplan.js prüft sie wie
  `kapitel.json` und schreibt `Lernplan/<Code> Lernplan.md` mit `herkunft: server`. Die Zahl steht im Lauf (`lernplaene`) und im
  Hinweis nach **Aktualisieren**, Verworfenes zählt wie bei den Terminen. Ein Server vor dieser Fassung kennt den Weg nicht (404):
  Dann bleibt nichts gemerkt, und die Folien gehen nach seinem täglichen Update.
- **`server.json`** (synchronisiert, schreibt nur das übernehmende Gerät): `{ schema, erledigt, laeufe, hinweise, …, adresse,
  verbunden }` (`adresse` und `verbunden` ohne Schlüssel, für „Mit Code verbinden“ und „Zuletzt verbunden“).
  Persönlich (Hinweise aus Mails): wie `server-abruf.json` nie im Release (`server*.json` in `release.py`, `pruefen.py`,
  `.gitignore`).
- **Status, Zeile und Fenster:** `ctx.server.status()` in der Form des Vertrags (`zustand`: `nicht-verbunden` | `anderswo` |
  `laeuft` | `anderes-geraet` | `fehler` | `an`; gerätelokal über `Q.nachLauf`). `ctx.server.zeile()` liefert die Zeile im
  Format von Noten & Anmeldungen (`{ text, symbol, pille, knopf, link }`, HTML an einer Stelle: `quelleZeile` in
  `verbindungen.js`), aus `GET /v1/status` (höchstens alle 5 Min., nur Werte aus festen Listen, unbekannte Felder fallen weg; seit
  02.11.2026 immer angemeldet (seit 0.7.8 signiert, davor mit dem Zugangsschlüssel im Kopf), auch gleich nach dem Verbinden und
  nach „Mit Code verbinden“; der Server gibt
  ihn nur noch mit Zugangsschlüssel heraus, sobald ein Gerät ihn einmal so geholt hat, Plugins bis 0.7.7 schicken ihn dort noch
  nicht mit, siehe `server/README.md`; lehnt er den Schlüssel dort ab (401), endet der Abruf wie beim Eingang mit `zugang`, auch
  auf einem Gerät, das gerade nicht übernimmt) und dem letzten
  Abruf; Fehler zuerst (Gerät unbekannt → neu verbinden, länger als 3 Tage nicht erreichbar (mindestens zwei Fehlschläge in Folge, der erste vor über 3 Tagen, `fehlerSeit`; der
  letzte Erfolg allein zählt nicht, das Gerät war vielleicht nur aus) → „Weiter mit der Einrichtung“ und
  bei neuer Adresse neu verbinden, Claude nicht verbunden, Uni-Passwort nicht angenommen, Limit des Abos mit der Uhrzeit des
  nächsten Versuchs aus `limit_wieder`, seit 01.11.2026; ein älterer Server nennt keine), der Stand-Satz aus
  `ctx.verbindungen.standText` wie bei allen Quellen, dahinter der letzte Lauf des Servers und neue Termine. Was nur du lösen kannst, sagt die Zeile selbst (Pille „prüfen“);
  der Server meldet sich nicht in „Bitte prüfen“ (neue Funktionen schieben Nutzern keine Prüf-Listen zu, sie zeigen ihren Zustand selbst). Neue Hinweise von Claude
  (noch nicht im Fenster gesehen, höchstens 14 Tage alt; „gesehen“ merkt sich jedes Gerät selbst, Kurz-Hashes in
  `eba-server-gesehen`, denn `server.json` schreibt nur das übernehmende Gerät): Der Link der Zeile heißt dann „Hinweise ansehen“
  (auf einem Gerät ohne Schlüsselbund, Zustand `anderswo`, bleibt er „Mehr erfahren“, denn dort zeigt das Fenster sie nicht);
  das Fenster setzt sie auf gesehen. Gehört ein Hinweis zu einem Modul (`code`, seit 01.11.2026; ein ungültiger Code fällt weg,
  der Hinweis bleibt), steht er 14 Tage lang auch im Modulfeld unter „Von Claude“ (höchstens zwei, die neuesten), und jeder neue
  Hinweis steht in „Seit deinem letzten Besuch“ (Ziel: die Modulnotiz). Beide lesen `ctx.server.hinweise({ code })`: frisch aus
  `server.json`, also auf jedem Gerät, die der letzten 14 Tage, neueste zuerst.
  **Mails durchsuchen** (Knopf im Fenster und Befehl `server-durchsuchen`) startet einen Claude-Lauf auf dem Server
  (`POST /v1/anstoss`; wie oft, bestimmt der Server: seit 02.11.2026 höchstens alle 30 Min. und 12-mal in 24 Stunden, ein Server
  bis 0.7.7 alle 10 Min.; bei 429 nimmt das Plugin `wieder` aus der Antwort, sonst `Retry-After`, und sagt „Dein Server hat
  gerade erst nach Mails gesucht. Wieder möglich ab …“, an einem anderen Tag mit Datum, `zuFruehText`); solange der Status
  `claude_lauf` „wartet“ oder
  „laeuft“ meldet, sagt die Zeile „Claude durchsucht gerade …“, und der nächste Abruf kommt nach 5 Min. (`plan.spaeter`).
  Hinweise (`ctx.hinweis`) nur nach **Aktualisieren**, nie vom Zeitplan; Notizen weg nur über den einen Papierkorb. `ctx.server.fensterInhalt(el, neu)`: Stand, Hinweise, letzte
  Übernahmen, **Weiteres Gerät verbinden** bzw. **Mit Code verbinden** (danach zeichnet `neu()` das Fenster neu), „Dieses Gerät trennen“. Ist der Server gerade nicht erreichbar, steht über den Werten „Stand des Servers: nicht
  erreichbar, Angaben von …“ (`erreicht`: letzter geholter Status). Gmail `aus` meldet der Server, solange `server_gmail` 0 ist.
  Neue Version des Servers: Er installiert sie täglich selbst (`studium-server aktualisieren`, Ergebnis im Status unter
  `aktualisierung`). Ging der letzte Versuch schief und hat der Server dessen Ziel nicht schon anders bekommen, steht im Fenster
  „Neue Version: zuletzt ohne Erfolg …“; kam seit mehr als 3 Tagen (`VERSION_TAGE`) nichts ohne Fehler durch, obwohl `release`
  der zentralen Daten oder `aktualisierung.ziel` des Servers neuer ist als seine Version, sagt es die Zeile mit „Weiter mit der
  Einrichtung“ (Pille „prüfen“). `grund` nur aus einer festen Liste (sonst `unbekannt`); auch nicht ok ohne Fehler: `kein-paket`
  (im Fenster „noch kein Paket für den Server“), `zurueckgerollt` („zuletzt zurückgenommen …, nach einem Tag neu“), `aelter`
  (Release nicht neuer, still), `mindestversion` (Zurückrollen unter die Mindestversion abgelehnt). Ein älterer Server ohne das
  Feld bleibt still. Mit Schlüssel meldet der Server auch `installiert`
  (die laufende Version; sie zählt dann statt der des Web-Dienstes) und `warten_bis` (gestaffelte Verteilung, `server/README.md`, „Updates des Server-Pakets“): Kennt er eine
  neuere Version und ist die Zeit noch nicht da, steht im Fenster „Neue Version: 0.7.7 installiert dein Server ab … (neue
  Versionen kommen nicht auf alle Server zugleich)“, keine Warnung.
  **Grenzen je Tag** (Status mit Schlüssel, `grenzen`, `grenzenNormal`): Nur was nicht 0 ist, steht im Fenster, in einfachen Worten:
  „Mails: 12 Mails warten auf morgen“ (`mails_zurueckgestellt` + `mails_verschoben`). Mails, an denen jeder Lauf scheiterte
  (`quarantaene`), legt der Server beiseite, bis man es noch einmal versucht: „3 Mails konnten nicht gelesen werden …“ mit dem Knopf
  **Noch einmal versuchen** (`POST /v1/anstoss` mit `{"quarantaene":"erneut"}`, signiert mit Beweis des Datenschlüssels wie
  **Mails durchsuchen**; ein Server ab 0.7.8 startet einen Lauf auf eine signierte Anfrage nur damit, sonst 403; zählt gegen die Grenze
  des Knopfs, 429 mit `wieder` wie bei **Mails durchsuchen**; Antwort `{"angestossen":true,"quarantaene":"erneut"}`). Hat er
  ältere davon gelöscht (`quarantaene_geloescht`, über 200 Mails oder 500 MB), sagt eine kurze Zeile das. Unter der Liste stehen,
  nur wenn nicht 0, ruhige Sätze (`saetze` in `einzelheiten`): „3 Unterlagen konnte dein Server nicht lesen.“
  (`unterlagen_ausgelassen` + `kapitel_ausgelassen`: Unterlagen bzw. Folien, an denen er allein zweimal scheiterte und die er
  auslässt), „Gmail ist bis morgen pausiert.“ (`ausgesetzt_gmail`) und „Unterlagen sind bis morgen pausiert.“
  (`ausgesetzt_unterlagen` oder `ausgesetzt_kapitel`; Pausen gelten nur bei genau 1, Zahlen nur als ganze Zahl ab 1). Zahlen der
  Läufe, Fehlschläge und Zeichen liest das Plugin nicht. Fehlt ein Feld (älterer Server), steht nichts davon da.
- **Zugangsdaten** (`siehtGeheimAus`, seit 02.11.2026): eine Heuristik, keine Garantie. Vor dem Auszug fallen unsichtbare
  Zeichen (Tag-Zeichen, Bidi-Steuerung, weiche Trennstriche, Zeichen ohne Breite) weg, Steuerzeichen werden Leerzeichen, dann
  NFKC (Vollbreite wird normal). Ein Termin, dessen Titel, und ein To-do, dessen Text oder Notiz danach so aussieht, geht nicht mit.
  Starke Muster (Groß/klein egal, `GEHEIM`): `passw`, `kennw`, `password`, `pw`/`pwd` als Wort, Zugangscode, Zugangsdaten,
  Einschreibeschlüssel, IBAN; dazu Schlüssel ab `sk-ant-`, `ghp_`, `github_pat_` und die Form einer IBAN (zwei Buchstaben, zwei
  Ziffern, Vierergruppen, mindestens 10 Ziffern). Wörter, die auch sonst vorkommen (`GENERISCH`: Login, Token, Code, PIN, TAN,
  Passcode, Key, Pass, Zugang, Secret, KW, Schlüssel), zählen nur mit „:“, „=“, „ist“ oder „lautet“ und danach einem Wert wie ein Geheimnis
  (`wertWieGeheim`: mindestens 4 Zeichen, kein Modulcode wie `B110`, kein gewöhnliches Wort, auch nicht mit Bindestrich): „PIN:
  4821“ ja, „Code: B110 Hausaufgabe“, „Login für Moodle“, „Token Economy“ nein. Bei PIN, TAN, Token und Passcode zählt nach „:“
  oder „=“ jeder Wert ab 4 Zeichen außer einem Modulcode („PIN: Sommer“, „Token: abcd“); ohne Trenner zählen PIN, TAN, Passcode und
  Code, auch als Teil eines Wortes (Türcode, Kopierer-PIN), direkt vor 4–8 Ziffern („PIN 1234“, „TAN 123456“, `OHNE_TRENNER`).
  Matrikelnummer nur mit einer Zahl aus 6–8 Ziffern.
  Danach die Erkennung aus `ilias.js` (`ctx.ilias.ohneKennwort`, auch Doppelgänger aus anderen Schriften); ihre schwache Form
  („Key: Wert“) bekommt nur, was `GENERISCH` nicht schon als harmlos erkannt hat. Was dennoch fälschlich so aussieht, bleibt nur
  auf dem Gerät; der Server prüft den Auszug noch einmal.
- Testeinstieg: `ctx.server.erzeugen(abh)` (Netz, Tresor, Schlüsselbund als Ersatz); `tests/server-plugin.test.js` läuft gegen
  den echten `server/dienst.mjs` auf einem freien Port. `plugin.testServerAus` schaltet den automatischen Abruf ab.
