# Architektur: Connector für die Claude-App

Teil der Architektur-Doku. Aufbau, `ctx`, Skripttypen und die Regeln für Skript-Autoren stehen im Überblick
[architektur.md](../architektur.md).

Ein MCP-Server, über den Claude (claude.ai, die Apps für Desktop, iPhone und Android, Claude Code) den eigenen Tresor liest:
„Was steht diese Woche an?“, „Was sagen die B110-Folien zu Opportunitätskosten?“. Er läuft auf dem eigenen Rechner bzw. Server,
nie bei Studium Autopilot, und ruft selbst nie Claude auf. Stand: nur lesend; Zugang je Lauscher entweder über ein festes Token
(Claude Code im eigenen Netz) oder über eine Anmeldung per OAuth mit Einmal-Code (claude.ai). Zwei Quellen mit denselben
Werkzeugen darüber:

- **Tresor als Ordner** (`quelleOrdner`): der Prototyp (Tresor im eigenen Netz, MCP `studium`) und später die Kopie des Tresors auf
  dem eigenen Server; alle zehn Werkzeuge, der Code für die Anmeldung kommt von der Kommandozeile (`node mcp.mjs code`).
- **Daten des eigenen Servers ohne Kopie** (`quelleServer`, Release A, Teil des Server-Pakets): was Obsidian dem Server ohnehin
  schickt, das Lagebild aus dem Stand, Hinweise und noch nicht abgeholte Termine aus Mails, die zentralen Daten; sieben Werkzeuge.
  Ein- und ausgeschaltet in Obsidian, der Code kommt von dort (Abschnitt „Eigener Server“ unten).

Werkzeuge zum Schreiben (nur über das Eingang) folgen.

## Aufbau (`server/mcp*.mjs`, ohne Abhängigkeiten)

- **`mcp.mjs`:** HTTP nach dem MCP-Transport „Streamable HTTP“, zustandslos und nur mit JSON-Antworten (kein SSE; `GET /mcp`
  antwortet 405). JSON-RPC von Hand, in beiden Arten des Protokolls:
  - bis 2025-11-25 (`PROTOKOLLE`, die neueste zuerst): `initialize` (eine unbekannte Fassung bekommt die neueste; der Kopf
    `MCP-Protocol-Version` zählt erst danach, denn Claude schickt dort schon 2026-07-28), `ping`;
  - ab 2026-07-28 (`PROTOKOLLE_NEU`): kein `initialize`, jede Anfrage trägt Fassung, Client und Fähigkeiten in `params._meta`;
    `server/discover` nennt Fassungen, Fähigkeiten und Anleitung. Die Köpfe `MCP-Protocol-Version`, `Mcp-Method` und `Mcp-Name`
    (Werkzeug bzw. Ressource, sonst als `=?base64?…?=`) müssen zum Körper passen, sonst 400 mit `-32020`; ein fehlender Kopf steht
    nur im Journal, damit ein Client ohne ihn nicht ausgesperrt ist. Eine unbekannte Fassung: 400 mit `-32022` und den Fassungen
    des Servers. Ergebnisse tragen `resultType` und den Server in `_meta`, Listen, Ressourcen und `discover` dazu `ttlMs` (1 Stunde)
    und `cacheScope: "private"`; eine unbekannte Methode ist 404 mit `-32601`. Eine neue Fassung nur im Kopf, ohne `_meta`, lehnt
    `-32600` ab, kein Code der neuen Art: so fällt ein Client auf `initialize` zurück. Claude Code und claude.ai probieren seit Ende
    Oktober 2026 zuerst `server/discover`; der offizielle Client 2.4.0 verbindet sich damit in einer Anfrage statt vier.

  Dazu `tools/list`, `tools/call`; Benachrichtigungen bekommen 202, mehrere Nachrichten in einer Anfrage 400. Lauscht nur auf
  127.0.0.1 oder ::1. Regeln vor dem JSON-RPC: nur `/mcp`, nur POST, kein `Origin` (Aufrufe aus Webseiten, DNS-Rebinding),
  `Authorization: Bearer` mit dem Token des Lauschers (Vergleich über SHA-256 in konstanter Zeit), `Content-Type: application/json`,
  höchstens 256 KB (ein größerer angekündigter Körper wird gar nicht gelesen). Ohne gültigen Zugang höchstens 20 Anfragen in
  10 Minuten, dann 429; ein gültiger Zugang wird nie gesperrt. Ein Fehler im Server bei einem Werkzeug kommt als Satz mit `isError`
  (wie bei den Referenz-Servern), nicht als Protokollfehler. Eine Ausnahme außerhalb eines Werkzeugs (etwa ein Wert im Körper, der
  als Text nicht geht, `{"toString": 1}`) beendet nie den Dienst: der Handler fängt sie, antwortet 500 und schreibt sie ins
  Journal. Ins Journal gehen Methode, Werkzeug und Dauer, nie Argumente, wer sich
  meldet (beim `initialize` bzw. bei `server/discover` und `tools/list`), mit OAuth dazu die Anmeldung und abgelehnte Anfragen an
  `/mcp`, nicht die Anfragen von Scannern an andere Pfade. Testeinstieg `erzeugeMcp({ quelle, tresor, token, oauth, app, abgleich,
  version, jetzt })` (`quelle` oder `tresor`; `token` oder `oauth`, nie beides); Dienst `node mcp.mjs dienst <konfig.json>` (`tresor`, `ohne`, `zustand`, `abgleich`,
  `hoeren`: je Lauscher `{ host, port, token_datei }` mit Token ab 32 Zeichen oder `{ host, port, oauth: { adresse, client_ids,
  code_hinweis, zugriff } }`; auf dem eigenen Server statt `tresor` der Datenordner `daten`, dann nur OAuth); nach dem Start baut er den Suchindex vorab. Dazu `code` (Einmal-Code; nicht mit `daten`, dort kommt er aus Obsidian), `verbindungen` und `trennen <id|alle>`
  mit derselben Konfiguration, nur als Besitzer des Zustands (sonst könnte der Dienst die Dateien nicht lesen). Köpfe müssen in
  15 Sekunden, Anfragen in 30 Sekunden da sein; ruhende Verbindungen bleiben 95 Sekunden offen, länger als beim Proxy davor
  (Tailscale: 90 Sekunden), sonst nähme er womöglich eine eben schließende für die nächste Anfrage, und die scheiterte mit 502.
- **`mcp-oauth.mjs`:** die Anmeldung für claude.ai. Der Lauscher prüft zuerst die eigenen Pfade, dann `/mcp`:
  - `/mcp` ohne gültiges Token antwortet 401 mit `WWW-Authenticate: Bearer resource_metadata="…/.well-known/oauth-protected-resource/mcp"`
    (so beginnt claude.ai); Metadaten nach RFC 9728 (`resource` genau die Adresse von `/mcp`) und RFC 8414 unter
    `/.well-known/oauth-authorization-server`. Kein `/register`, keine fremden Dokumente.
  - Client: nur Claudes Kennung als Metadaten-Dokument (CIMD, `client_id_metadata_document_supported` und
    `token_endpoint_auth_methods_supported: ["none"]`, sonst wählt Claude die dynamische Registrierung): fest
    `https://claude.ai/oauth/mcp-oauth-client-metadata` (`CLAUDE_KENNUNG`, von claude.ai veröffentlicht; das Dokument wird nie
    abgerufen), mit `client_ids` stattdessen genau diese. Rücksprung nur `https://claude.ai/api/mcp/auth_callback` oder
    `https://claude.com/api/mcp/auth_callback` (Anthropic kündigte den Umzug an), Byte für Byte, zurück zu dem, den die Anfrage nennt.
    Falscher Client oder Rücksprung: eine Fehlerseite, nie eine Weiterleitung. PKCE nur S256; `resource` (RFC 8707), wenn gesendet,
    genau `/mcp` (Schema und Host in beliebiger Schreibweise, wie 2026-07-28 verlangt); Antwort mit `iss` (RFC 9207).
  - `GET /oauth/anmelden` zeigt eine Seite ohne JavaScript (CSP `default-src 'none'`, `frame-ancestors 'none'`, kein Referrer)
    mit einem Feld für den Einmal-Code, dem Satz, dass sie zum eigenen Server gehört, nicht zu Anthropic, und dem Rat, nichts
    einzugeben, wenn ein Link von jemand anderem sie geöffnet hat: Der Server kann eine Anmeldung aus claude.ai nicht von einer
    unterscheiden, die jemand mit einem gebauten Link anstößt (Consent-Phishing); das Fenster in Obsidian sagt dasselbe. Die Anmeldung (Kennung,
    Client, Rücksprung, `state`, PKCE, Ablauf) steht im Cookie `__Host-sa-anmeldung` selbst (`Secure`, `HttpOnly`, `SameSite=Strict`,
    10 Minuten), als JSON mit HMAC-SHA256 eines Schlüssels, den nur der laufende Connector im Speicher hat (ein Neustart beendet offene
    Anmeldungen); das Feld `sitzung` muss zur Kennung darin passen. So gibt es keine gemeinsame Liste offener Anmeldungen, aus der
    viele Aufrufe von `/oauth/anmelden` die eines Studierenden verdrängen könnten (bis 03.11.2026: höchstens 50, die älteste wich).
    Im Speicher stehen nur die falschen Codes je Anmeldung, von höchstens 1000 (die älteste weicht und beginnt wieder bei null, wie
    eine neue), und welche mit dem richtigen Code vorbei sind. Höchstens 5 falsche Codes je Anmeldung;
    keine Grenze für den ganzen Server (sie ließe jeden, der die Adresse kennt, das Verbinden eine Stunde lang sperren, und einen
    Code aus 32^10 in seinen 10 Minuten zu erraten bleibt ohnehin aussichtslos), nie je Absender: claude.ai kommt immer aus
    denselben Adressen, Studierende teilen sich die des Uni-Netzes.
  - Einmal-Code: 10 Zeichen ohne 0/O und 1/I (`ABCDE-FGHJK`), 10 Minuten, nur einer offen, Schreibweise egal; eingelöst über eine
    exklusive Marke wie `codeEinloesen` in `verbinden.mjs`. Danach ein Autorisierungscode für 60 Sekunden, einmal (auch ein
    Fehlversuch verbraucht ihn).
  - `POST /oauth/token` (nur `application/x-www-form-urlencoded`; `redirect_uri` darf fehlen): Zugriffstoken 1 Stunde, nie über das
    Ende der Verbindung hinaus (`expires_in` passt dazu); Erneuern tauscht beide Tokens aus. Ein Erneuerungstoken beginnt mit der
    Kennung seiner Verbindung (`<id>.<Zufall>`), so findet der Server seine Verbindung; ein altes erkennt er an den SHA-256 der
    letzten 100, die er ihr ausgegeben hat (`ausgegeben`). Ein Token, das nie ausgegeben wurde, ist nur `invalid_grant` und ändert
    nichts: Die Kennung steht in `server.json`, im Eingang und im Journal, und wer nur sie kennt, soll die Verbindung nicht beenden
    können. Das zuletzt
    eingelöste bleibt gültig, bis das neue einmal benutzt wurde (wie bei Cloudflares `workers-oauth-provider`), und bekommt bis dahin
    höchstens zwei weitere Paare: paralleles Erneuern und eine verlorene Antwort, auch wenn claude.ai erst viel später erneut fragt.
    Jedes andere ausgegebene alte Token beendet die ganze Verbindung, auch für den, der das neue zuerst benutzt hat (gestohlen). 30 Tage ohne
    Erneuern oder 90 Tage nach dem Verbinden ist Schluss. Eine neue Verbindung ersetzt die vorige. Fehler als `invalid_grant`, `invalid_client`,
    `invalid_target`; kein Zähler für Fehlversuche, denn hier lässt sich nichts erraten, und eine Sperre für alle träfe nur das
    Erneuern der echten Verbindung. `POST /oauth/widerrufen` (RFC 7009) beendet die Verbindung eines Tokens, auch des zuletzt
    eingelösten (nach einer verlorenen Antwort hält claude.ai noch dieses).
  - Tokens und Codes sind Zufallswerte; gespeichert wird nur ihr SHA-256: Verbindungen in `<zustand>/oauth.json` (bei jeder Anfrage
    neu gelesen, wenn sich die Datei geändert hat, damit `trennen` sofort wirkt; geschrieben über eine Hilfsdatei mit fsync und unter
    der kurzen Sperre `oauth.json.sperre`, die auch die Kommandozeile nimmt: darin Prozess und Marke des Halters, freigegeben nur
    mit der eigenen Marke; die Sperre eines beendeten Prozesses gilt sofort als liegengeblieben, sonst nach 5 Sekunden; der Dienst
    wartet höchstens 250 ms, weil beide Lauscher so lange stehen, die Kommandozeile 7 Sekunden), Einmal-Codes in `<zustand>/codes/`, Anmeldungen und
    Autorisierungscodes nur im Speicher, Anmeldungen im Cookie. Ist `oauth.json` kaputt, bleibt der letzte gute Stand im Speicher, geschrieben wird nichts
    (Token-Anfragen bekommen 503 `temporarily_unavailable`, das Journal sagt es einmal); so löscht eine kaputte Datei nie alle
    Verbindungen. Je Verbindung höchstens 300 Anfragen an `/mcp` in 5 Minuten und 5000 am Tag. Mit OAuth
    darf eine Anfrage an `/mcp` den Kopf `Origin` mit `https://claude.ai` oder `https://claude.com` tragen, jede andere Herkunft
    bleibt 403; das Schema `Bearer` gilt
    in jeder Schreibweise.
  - Auf dem eigenen Server (`uebergabe: { codes, trennen, verbindungen }`, Ordner unter `claude-app/`, `claude-app.mjs`): Der
    Einmal-Code kommt aus Obsidian über den Web-Dienst als `codes/<SHA-256 des Codes>.json` mit `{ ablauf, von }` (`von`: das Gerät,
    das ihn holte, oder `gemeinsam`; es geht mit der Verbindung nach `verbindungen.json`, damit Trennen dieses Geräts in Obsidian auch
    die Verbindung trennt, `server/README.md`, „Schlüssel je Gerät“); der Connector liest
    ihn nur (echte Datei, kein Link), nimmt ihn nur, solange er gilt und höchstens 10 Minuten und eine Minute voraus (einem länger
    gültigen traut er nicht), und löst ihn über die exklusive Marke `<zustand>/eingeloest/<SHA-256>` ein (er kann in `codes/`
    nichts löschen; Marken älter als ein Tag fallen weg). Codes der Kommandozeile gelten dort nicht. Wünsche aus Obsidian
    (`trennen/<id>`, `trennen/alle` mit `{ zeit }`: alle Verbindungen bis dahin) sieht er bei jeder Anfrage an `/mcp` und
    `/oauth/token` und beim Start nach, an den Namen im Ordner und der Datei `alle`, nicht an der Zeit des Ordners (die ändert
    sich unter Linux nur in groben Schritten, und der Dienst schreibt über eine Zwischendatei); bis das Löschen aus `oauth.json`
    gelungen ist, gelten sie schon im Speicher als getrennt (und `verbindungen.json` nennt sie noch, damit der Dienst den Wunsch
    nicht zu früh wegräumt). Ein unlesbares `alle` (etwa leer nach einem Absturz beim Schreiben) trennt alle Verbindungen bis zur Zeit
    der Datei, höchstens bis jetzt; spätere sperrt es nicht (bis 03.11.2026 sperrte es jede künftige). Die Verbindungen meldet er nach
    `aus-mcp/verbindungen.json` (`{ schema: 1, verbindungen: [{ id, seit, zuletzt, client, von? }], frueher: [{ id, seit, ende, grund,
    client }] }`, `client` ist der Host der Kennung, also `claude.ai`): sofort bei einer neuen, erneuerten oder beendeten, sonst wegen
    `zuletzt` höchstens alle 10 Minuten. `frueher` sind die beendeten der letzten 30 Tage (höchstens 20, die neuesten zuerst; in
    `oauth.json` ohne Tokens gemerkt, dazu abgelaufene, die noch dort stehen), mit `grund`: `getrennt` (Obsidian oder
    Kommandozeile), `widerrufen` (vom Client), `ersetzt` (eine neue Verbindung), `wiederverwendet` (ein altes Erneuerungstoken),
    `abgelaufen` (90 Tage). So sieht Obsidian auch eine Verbindung, die endet, bevor ein Gerät das nächste Mal abholt: Jemand mit
    einem abgefangenen Code, der sich gleich wieder abmeldet oder von der echten Verbindung ersetzt wird, fiele sonst nie auf.
    `zugriff` ersetzt auf der Anmeldeseite, was claude.ai lesen darf.
- **`mcp-tresor.mjs`:** der Tresor als Ordner (`tresorOrdner`). Nur Markdown; nie `System/` und `Anhänge/`, Ordner und Dateien mit
  „.“ am Anfang (`.obsidian`, `.claude`, `.trash` …), `CLAUDE.md` und `AGENTS.md`, Ordner aus `ohne`, Notizen mit `privat: true`
  (von ihnen merkt es sich nur Zeit und Größe, damit es sie nicht bei jedem Blick neu liest und den Index neu baut),
  Dateien über 2 MB, symbolische Links. Die Werkzeuge greifen nur über die Pfade dieses Verzeichnisses zu, nie über einen Pfad
  aus der Anfrage. Liest höchstens einmal je Minute neu (nur geänderte Dateien), setzt dann den Suchindex neu zusammen (jede Datei
  wird nur einmal zerlegt, solange sie sich nicht ändert: am echten Tresor rund 65 ms statt 570 ms nach einer Änderung): BM25 über Abschnitte (`##`)
  der Notizen und über Seiten der Textfassungen, ein Suchwort ab 4 Zeichen zählt mit halbem Gewicht auch in längeren Wörtern,
  Umlaute zählen auch als ae/oe/ue/ss. Der Name einer Datei zählt einmal (bei „Das Wichtigste“, sonst im ersten Abschnitt bzw. auf
  der ersten Seite); Titelzeile, eingebettete Dateien, Ansichten des Plugins (`ohneAnsichten`) und Linkziele (`lesbar`: aus
  `[[Ziel|Text]]` zählt Text) zählen nicht, sonst träfe ein Wort aus dem Titel jeden Abschnitt. `suchen` gibt höchstens `jeDatei`
  Treffer je Datei, die übrigen Abschnitte als `weitere`; `finden` sucht eine Notiz über ihren Namen wie in einem Link.
  Frontmatter, Kapitel des Lernplans, Seiten der Textfassung und To-dos (mit Frist) liest es wie die Skill-Datei `lesen.md` und
  `todos.js`; offene Fragen sind alle Punkte unter „Offene Fragen“ (wie `fassung.js`), nicht nur die mit „?“.
- **`mcp-werkzeuge.mjs`:** die Werkzeuge über einer Quelle (`werkzeuge(quelle, { jetzt })`), alle mit `readOnlyHint`. Was die
  Quelle nicht anbietet (`angebot()`), steht weder in `tools/list` noch lässt es sich aufrufen; auf dem eigenen Server ohne Kopie
  nur `ueberblick`, `fristen`, `pruefungen` und `hinweise`, `module` und `todos` erst mit einem Stand aus Obsidian, `lernplan` erst
  mit einem Lernplan (aus dem Lagebild, sonst ohne Häkchen aus den zentralen Kapitellisten der eigenen Module). Die Anleitung kommt
  von der Quelle. Ergebnisse formt `mcp-ergebnis.mjs` für beide gleich (`sauber`, `kompakt`, `einpassen`, Zeiten).

  | Werkzeug | Liefert |
  |---|---|
  | `ueberblick` | je Tag die Lehrveranstaltungen (Ausfall, Änderung, 14-täglich, neuer Raum), Termine, To-dos mit Frist im Zeitraum (enthält er heute, auch überfällige, davon die 20 jüngsten; `aeltere_ueberfaellige` zählt die übrigen), Prüfungen danach |
  | `fristen` | offene Fristen bis zu einem Datum, To-dos mit Frist bis dahin samt überfälligen; Termine aus Mails als Daten gekennzeichnet (eigener Server, auch in `ueberblick` und `pruefungen`) |
  | `pruefungen` | kommende Prüfungen (Zwischentest, Nachholtermin gekennzeichnet), Module mit Klausur oder Status angemeldet |
  | `module` | Module mit Gruppe, ECTS, Status, Note, Versuch, Klausur; Summe der ECTS; den nicht gewählten Schwerpunktkatalog nur mit `katalog: true` |
  | `lernplan` | Kapitel mit Häkchen; Unterkapitel nur je Modul, als Zeilen `[x] Titel`, für alle ihre Zahl |
  | `todos` | offene To-dos (Text ohne Links, Beleg, `ueberfaellig`) oder offene Fragen |
  | `hinweise` | nur auf dem eigenen Server: Hinweise aus Mails (die neuesten zuerst, `noch_nicht_in_obsidian`), als Daten gekennzeichnet |
  | `notizen_suchen`, `notiz_lesen` | eigene Notizen (ohne Textfassungen), je Notiz ein Treffer (`anzahl`, Standard 5); lesen über Pfad oder Namen, ohne Kopf-HTML und Ansichten, über 30 000 Zeichen in Teilen (`weiter_ab`, dann `ab`) |
  | `unterlagen_suchen`, `unterlage_lesen` | Textfassungen der PDFs, Treffer je Textfassung mit bis zu drei Seiten samt Ausschnitt (`anzahl`, Standard 5): `pdf` zum Nennen, `pfad` (die Textfassung) zum Lesen, denn zwei Textfassungen können auf dieselbe PDF verweisen; lesen über `pfad` (auch über die PDF oder die Begleitnotiz), Standard 5 Seiten, höchstens 10 und zusammen 50 000 Zeichen je Aufruf, damit das Kürzen des Ergebnisses nie Seiten wegnimmt (`weiter_ab`) |
  | `dateien_suchen`, `datei_lesen` | nur mit dem Tresor als Ordner (`mcp-dateien.mjs`, seit 03.11.2026): Dateien auf Abruf, siehe unten |

  Termine bekommen `uhrzeit` aus dem Feld `uhrzeit` oder wie im Plugin (`modell.js`, `ortTeilen`) aus `ort`, wohin der Uni-Abgleich
  sie schreibt („ab 17:00 · bis 06.11., 23:59 · ILIAS-Kurs“); `ort` ist dann der Rest. Die Klausur eines Moduls folgt der einen
  Regel des Plugins (`pruefungVon`): Termin-Notiz oder Feld `klausur`, nie ein Zwischentest, ein Nachholtermin nur, wenn gewählt
  oder nach „nicht bestanden“. Ein Modulcode, den es im Tresor nicht gibt, und ein Datum, das es nicht gibt (`2026-02-30`), sind
  Fehler mit Satz statt einer stillen leeren Liste.

  Getrennte Werkzeuge für eigene Notizen und Unterlagen, damit sich die zu Unterlagen in claude.ai einzeln sperren lassen. Jedes
  Ergebnis ist JSON ohne Einrückung und ohne leere Felder (`null`, leere Listen unterhalb der obersten Ebene, `erledigt`,
  `ueberfaellig` und `faellt_aus`, wenn nein; die Anleitung sagt: fehlend heißt leer bzw. nein), eine Liste nur dann als
  `{ eintraege, weitere }`, wenn sie gekappt ist; zusammen 20 bis 40 % kürzer, was Tokens und Zeit am Telefon spart. Dazu `stand`:
  `abgefragt` (jetzt) und `letzte_aenderung` (wann zuletzt eine Notiz ankam oder sich änderte: die jüngere von
  Änderungszeit und Schreibzeit auf diesem Rechner, weil ein Sync die Änderungszeit des Geräts übernimmt), als Ortszeit
  Europe/Berlin mit Alter („01.11.2026, 06:43 (vor 9 Stunden)“; eine UTC-Zeit rechnete das Modell im Test falsch um). Zeitzone und
  Quelle stehen einmal in der Anleitung. Ein ruhiger Tag ohne Änderung sieht für den Server aber aus wie ein hängender Sync (im ersten Test sagte Claude „die
  Daten sind vom Sonntagmorgen, öffne Obsidian“, obwohl nur nichts geändert war). Darum gibt es, wo es sie gibt, eine Prüfung des
  Abgleichs: eine Datei (`abgleich` in der Konfiguration, geschrieben von einem anderen Dienst, gelesen mit `abgleichAus`) mit
  `{ geprueft, fehlend }`, also wann zuletzt geprüft wurde, ob die letzten Änderungen aus dem Sync hier sind, und wie viele
  fehlen. Mit ihr steht `abgeglichen` im Stand und `letzte_aenderung` nur, solange die Prüfung älter als zwei Stunden ist (dann mit
  Warnung); gewarnt wird sonst nur, wenn etwas fehlt; ohne sie, wenn die letzte Änderung älter als ein Tag ist („fehlt
  vielleicht“). Die Anleitung erklärt Claude `abgeglichen` und dass ein Termin mit `status: geschätzt` nur geschätzt ist.
  Texte gehen durch `sauber`: keine aktiven Links, Bilder, Referenz-Definitionen oder HTML (ein Tag beginnt mit einem Buchstaben,
  „0 < q < 1“ bleibt), keine `obsidian:`-, `javascript:`-, `file:`- oder `data:`-Adressen, fremde Adressen nur als Domain
  (https-Seiten der Uni Tübingen ganz), unsichtbare und Richtungszeichen weg; danach die benannten Entitäten wie in Obsidian
  (`&lt;` → `<`). Suchtreffer höchstens 10 mit je 1500 Zeichen, eine Notiz je Teil höchstens 30 000, ein Ergebnis höchstens 60 000
  Zeichen (rund 18 000 Tokens; Claude Code nimmt standardmäßig höchstens 25 000): darüber fallen ganze Einträge vom Ende der
  längsten Liste weg, und `gekuerzt` sagt wie viele, nie mitten im JSON. Texte aus Notizen und Unterlagen sind als Daten
  gekennzeichnet; die Anleitung (`initialize`, `server/discover`) sagt Claude, ihnen nicht zu folgen, den Stand zu nennen und bei
  Anmeldungen auf Alma bzw. ILIAS zu verweisen.
- **`mcp-quelle-ordner.mjs`:** die Quelle über `mcp-tresor.mjs` (Termine, Lehre, To-dos, Module, Prüfungen und Lernpläne wie
  oben aus den Notizen), mit der Prüfung des Abgleichs.
- **`mcp-quelle-server.mjs`:** die Quelle ohne Kopie. Liest nur `claude-app/daten/lage.json` (legt der Web-Dienst hin, siehe unten)
  und `zentral/zentral-cache.json` (`zentral.mjs`), als echte Dateien bis 4 MB, neu, wenn sich Zeit, Größe oder Inode ändern; jedes
  Feld prüft sie noch einmal, jeder Text geht durch `sauber`.
  - Termine aus dem Stand (der nur Titel, Tag, Kategorie und Modul nennt) bekommen Uhrzeit, Ort, Status und Info vom gleichen
    Termin (Tag und Titel ohne Groß- und Kleinschreibung und Satzzeichen) aus dem Eingang oder den zentralen Daten (ein zentraler
    zuerst aus den zentralen Daten, jeder andere zuerst aus dem Eingang, dann mit `herkunft: "Mail"`). Termine aus
    Mails, die Obsidian noch nicht abgeholt hat, und zentrale, die nach dem letzten Stand zum ersten Mal da waren (`erstmals`),
    kommen dazu, mit `herkunft` und `noch_nicht_in_obsidian`; steht in `ueberblick`, `fristen` oder `pruefungen` ein Termin mit
    `herkunft: "Mail"`, sagt `hinweis` wie bei `hinweise`, dass seine Texte Daten sind, keine Anweisungen; zentrale nur für die eigenen Module oder ohne Modul, nie mit
    `bereich` (welche Bereiche jemand gewählt hat, weiß der Server nicht). Was Obsidian schon kannte, hat es übernommen oder du
    hast es gelöscht: so kommt kein gelöschter Termin zurück.
  - Lehre aus dem Stundenplan des Lagebilds; liegt der Zeitraum über den 14 Tagen ab dem letzten Stand, sagt `ueberblick` das
    (`stundenplan`). Module und Prüfungen aus dem Lagebild (Klausur, Anmeldung, Versuch, Note, „x von y Kapiteln verstanden“,
    fällige Karten), ohne Titel und ECTS (die kennt der Server nicht). To-dos aus dem Stand; offene Fragen erst mit der Kopie.
  - `stand`: `abgeglichen` ist der Empfang des letzten Stands oder, wenn Obsidian danach abgeholt hat (alle 15 Minuten), dieses
    Abholen, solange es höchstens 6,5 Stunden nach dem Stand kam (Obsidian schickt den Stand bei jeder Änderung, sonst alle
    6 Stunden; kam danach keiner, scheitert dort etwas). Warnung ohne Stand, nach einem Tag ohne Abgleich und mit zentralen
    Daten älter als zwei Stunden; `zentrale_daten` sagt, wann sie zuletzt kamen.
- **`claude-app.mjs`:** die Seite des Web-Dienstes (`POST /v1/claude-app`, `claudeApp`) und die Ordner der Übergabe; dazu
  `lagebildPruefen` (Stand), `lageSchreiben`, `hinweiseMerken`, der Notschalter (`abgeschaltet`) und `node claude-app.mjs status|aus`.
- **`zentral.mjs`:** holt `manifest.json`, `termine.json` und `kapitel.json` der zentralen Daten (GitHub Pages) alle 15 Minuten,
  solange der Connector an ist (eigener Dienst mit Netz als eigener Benutzer `studium-zentral`, höchstens 256 MB; der Connector hat
  keins, und als `studium` sähe ein übernommener Abruf über `/proc` einen laufenden Claude-Lauf). Jede Datei nur mit Prüfsumme und
  Größe aus dem Manifest, gelesen nur bis zu dieser Größe (eine angekündigte größere Länge gar nicht; bis 03.11.2026 las er erst
  alles und prüfte dann), eine Datei mit gleicher Prüfsumme lädt er nicht neu; jeder Termin geprüft wie im Plugin (`zentralerTermin` wie
  `termineNormal` in `zentral.js`, dazu kein Titel wie eine Anweisung), jede Kapitelliste wie `kapitelPruefen`. Je Termin
  `erstmals` (beim allerersten Abruf 1970). Mit `pause` im Manifest und bei jedem Fehler bleibt der letzte Stand; dann bleibt auch
  `abgerufen` alt, und der Connector warnt.
- **`mcp-app.mjs`:** eine Wochenansicht im Chat (MCP-Apps, Erweiterung `io.modelcontextprotocol/ui`, Fassung 2026-01-26; zeigt
  claude.ai auf iPad, iPhone und im Browser, 02.11.2026), nur mit `app: true` an einem Lauscher. Sie hängt an `ueberblick` selbst
  (wie bei `github-mcp-server`), nicht an einem zweiten Werkzeug mit denselben Daten: `_meta.ui.resourceUri` verweist auf
  `ui://studium-autopilot/woche.html` (`text/html;profile=mcp-app`, über `resources/list` und `resources/read`), und
  `structuredContent` enthält nur `ansicht`, die Tage, wie die Seite sie zeichnet; Claude bekommt die Daten als Text. Die Seite ist
  fest im Code, lädt nichts nach (Claudes Sandbox erlaubt ohne Angabe keine fremden Adressen), meldet sich mit `ui/initialize` beim
  Gastgeber, zeichnet die Woche aus `ui/notifications/tool-result` und schreibt Daten nur als Text ins DOM. Im Journal steht, welcher
  Client sich meldet und ob er Ansichten kann.

## Dateien auf Abruf (`mcp-dateien.mjs`, nur mit dem Tresor als Ordner)

Seit 03.11.2026 (Wunsch: große Dateien, PDFs und Bilder sollen erreichbar sein, langsam ist in Ordnung). Nichts davon liegt im
Index oder im Speicher; jeder Aufruf liest von der Platte, was er braucht. Nur die Quelle über einem Ordner bietet die Werkzeuge an
(`quelleOrdner` legt `dateienOrdner` über `tresor.wurzel` mit denselben `ohne` an); der eigene Server ohne Kopie hat keine Dateien.
Für Studierende kommt das mit der Kopie des Tresors (Release B): mit LiveSync auf dem eigenen Server ginge auch eine Brücke wie auf
dem Prototyp (die Passphrase kennt der Server), mit iCloud nur der Upload.

- **Erlaubt** ist mehr als im Index: auch `Anhänge/` (Bilder aus Notizen). Nie `System/`, Ordner und Dateien mit Punkt, `CLAUDE.md`,
  `AGENTS.md`, Ordner aus `ohne`, Notizen mit `privat: true` (aus den ersten 64 KB). `pfadErlaubt` prüft die Form (kein `\`, `:`,
  NUL, keine leeren Teile), `oeffnen` jeden Teil des Pfads mit `lstat` (kein Link) und das Ziel mit `realpath` im Tresor.
- **`dateien_suchen`** (`name`: alle Wörter im Pfad, Umlaute wie ae; `ordner`; `art`): alles außer Markdown, dazu Notizen über
  `DATEI_MAX` (2 MB) mit dem Hinweis, dass sie zu groß für die Suche sind; höchstens 40, die Liste 60 s zwischengespeichert.
- **`datei_lesen`**:
  - große Notizen und Textdateien (R, Rmd, CSV, TSV, TXT; HTML ohne Skripte, Stile und Auszeichnung) in Teilen ab einem **Byte**
    (`ab`, `weiter_ab`; anders als `notiz_lesen`, das Zeichen zählt), je Teil höchstens 30 000 Zeichen, nie mitten in einem
    UTF-8-Zeichen;
  - PDFs seitenweise: `pdfinfo` (Seitenzahl), `pdftotext -layout` (Text der Seite), `pdftoppm -jpeg -scale-to` mit Kanten 1400,
    1100, 800, 560, bis das JPEG unter 90 KB liegt (sonst nur Text); mit `bild: false` bis 10 Seiten Text, zusammen 50 000 Zeichen;
  - Bilder (JPEG, PNG, GIF, WebP) bis 90 KB unverändert, größere verkleinert `ffmpeg` zu JPEG;
  - andere Dateien (DOCX, Anki …) nur mit Name, Art und Größe.
- **Bilder im Ergebnis:** ein `image`-Inhalt neben dem Text (`mcp.mjs`). claude.ai nimmt laut Anthropic in Ergebnissen Text und
  Bilder (eingebettete Ressourcen mit PDF stehen nicht in der Liste), höchstens etwa 150 000 Zeichen je Ergebnis, Claude Code 25 000
  Tokens; darum ein Bild je Aufruf und höchstens 90 KB (base64 rund 120 000 Zeichen).
- **Große Notizen in der Suche:** `notizen_suchen` liest Notizen über `DATEI_MAX` langsam in Fenstern von 1 MB, wertet Abschnitte
  von etwa 2000 Zeichen nach der Zahl verschiedener Suchwörter und nennt je Notiz bis zu drei Stellen mit dem Byte für
  `datei_lesen` (`grosse_notizen`), zusammen höchstens 64 MB je Aufruf (der Rest in `nicht_durchsucht`). `notiz_lesen` sagt bei
  einer solchen Notiz, dass sie zu groß für den Index ist, statt „keine Notiz“.
- **Programme** laufen ohne Shell (`execFile`), mit absolutem Pfad, 30 s Zeitgrenze und höchstens 32 MB Ausgabe. Der Text geht
  gesäubert hinaus wie überall (`sauber`).
- Tests: `tests/mcp-dateien.test.js` (Attrappe der Programme, die jeden Aufruf mitschreibt).

## Eigener Server (Release A, ohne Kopie des Tresors)

Teil des Server-Pakets (`installieren.sh`, `server/README.md` → „Connector für die Claude-App“). Jeder Server bekommt mit seinem
täglichen Update Benutzer, Ordner und Einheiten, der Connector bleibt aber aus, bis jemand ihn in Obsidian einschaltet.

- **Eigener Benutzer `studium-mcp`, eigene Einheit `studium-server-mcp.service`:** `mcp.mjs dienst /etc/studium-server-mcp/konfig.json`
  (`daten`, `zustand`, ein Lauscher auf 127.0.0.1:8744 mit OAuth; Adresse wie der Web-Dienst), Zustand nur in `/var/lib/studium-mcp`
  (`StateDirectory`, 0700). Sandkasten wie die anderen Dienste, ohne `MemoryDenyWriteExecute` (Node.js übersetzt zur Laufzeit),
  `IPAddressDeny=any` außer localhost, binden nur `tcp:8744`. Den Port des Web-Dienstes auf 127.0.0.1 (dort gibt der den ganzen Status
  ohne Schlüssel: Geräte, Netze, Grenzen) sperrt ihm eine Regel nach Besitzer des Sockets: `iptables`/`ip6tables -I OUTPUT 1 -p tcp
  --syn --dport 8743 -m owner --uid-owner studium-mcp -j REJECT --reject-with tcp-reset`, gesetzt von `studium-server claude-app
  anwenden` vor jedem Start (`connector_netz_sperren`, gespeichert mit `netfilter-persistent` wie die Freigabe von Port 443; ohne
  iptables nur eine Warnung). Ein Lauscher auf einem UNIX-Socket ganz ohne IP wäre strenger, hieße aber einen zweiten Weg in
  `mcp.mjs`, in Caddy und in den Rechten; die Regel trifft nur, was zu sperren ist. Lesen darf er nur `claude-app/` (ohne `schalter/`) und `zentral/`,
  schreiben nur in seinen Zustand und `claude-app/aus-mcp/`; Web-Dienst, Eingang, Unterlagen, Lauf, Abruf, Claude-Anmeldung,
  Schlüssel, Uni-Zugang, LiveSync und Caddy sind ihm gesperrt. Keine `[Install]`-Zeile, dazu `ConditionPathExists` auf die Marke.
- **An und aus auf Ebene des Netzes:** Nur das Dasein der Marke `claude-app/schalter/an` (schreibt nur der Web-Dienst; der Ordner ist
  nur für ihn) zählt. `studium-server-mcp.path` (`PathChanged`) startet `studium-server-mcp-schalter.service` (root):
  `studium-server claude-app anwenden` schreibt dann die Wege `/mcp`, `/oauth/*`, `/.well-known/oauth-*` als Fragment in den Block
  der Adresse in Caddy (`/etc/caddy/studium-server.d/seite/mcp.caddy`; die Caddyfile importiert den Ordner, ein leerer ist erlaubt),
  prüft die Konfiguration (sonst fällt das Fragment wieder weg), lädt Caddy neu, startet den Connector und einmal `zentral.mjs`.
  Ohne Marke, ohne Adresse oder mit dem Notschalter: Fragment weg, Connector aus, Zustand und `aus-mcp/` als `studium-mcp`
  gelöscht. Ändert sich die Marke während des Laufs, noch einmal (höchstens dreimal). Dasselbe am Ende jeder Installation.
- **Codes und Trennen:** `POST /v1/claude-app` (Vertrag in [server.md](server.md) → „Claude-App“) gibt den Code nur, wenn die Anfrage
  mit dem Beweis des Datenschlüssels signiert ist: Der Zugangsschlüssel allein (alle Geräte) reicht nicht, um claude.ai Zugriff auf
  Termine und Noten zu geben. Ein neuer Code zieht den offenen zurück; erst gemerkt (`web/claude-app.json`: ausgestellte Codes der
  letzten 24 Stunden, Zufallswerte bis zum Ende ihres Fensters, je Schlüssel der Anfrage höchstens 200, damit kein Gerät die Wünsche der
  anderen aufhält), dann ausgegeben. `trennen` schreibt `trennen/<id>`, `aus`
  `trennen/alle` mit der Zeit (beide mit fsync, damit nach einem Absturz keine leere Datei bleibt), löscht offene Codes, einzelne
  Wünsche (`alle` deckt sie), Marke, `lage.json`, `web/lagebild.json` und `web/hinweise.json`. Einen Wunsch `trennen/<id>` räumt der
  Dienst erst weg, wenn `aus-mcp/verbindungen.json` die Verbindung nicht mehr nennt (fehlt die Datei, hat root den Connector samt
  Zustand gelöscht; ist sie unlesbar, bleibt alles), spätestens nach 90 Tagen: Bis 03.11.2026 fiel er nach einem Tag weg, und war der
  Connector so lange aus, lebte die Verbindung danach wieder auf. Status und Eingang nennen eine Verbindung mit offenem Wunsch schon
  nicht mehr (der Connector lässt sie vor jeder Anfrage nicht mehr durch). `alle` bleibt; ist es unlesbar, schreibt der Dienst es mit
  der Zeit der Datei neu (höchstens jetzt), wie der Connector es bis dahin auslegt. Eine Verbindung zugleich, der Client fest (Claudes
  Kennung), der Herausgeber aus der Adresse.
- **Was der Connector sieht (`daten/lage.json`):** Der Web-Dienst schreibt sie nach jedem Stand, jedem Abholen und alle 5 Minuten neu,
  solange der Connector an ist und das Paket ihn erlaubt (sonst löscht er sie samt `web/lagebild.json` und `web/hinweise.json`):
  Module, Studienbeginn, Variante, Semester, Termine und offene To-dos aus dem Stand; das Lagebild; noch nicht abgeholte Termine und
  Hinweise aus dem Eingang; Hinweise, die Obsidian schon übernommen hat, 30 Tage lang (`web/hinweise.json`, höchstens 100; ältere
  fallen beim Schreiben von `lage.json` auch aus der Datei, nicht erst mit dem nächsten neuen Hinweis); wann der Stand kam und wann Obsidian zuletzt abgeholt hat. Nicht: Unterlagen, Folien,
  PDFs, Begleitnotizen, Mails, Zustand des Servers. Texte aus Mails (Text und Quelle eines Hinweises, Titel, Ort und Info eines
  Termins aus dem Eingang) prüft der Dienst hier wie den Auszug `tresor.json` für den Lauf und die Titel zentraler Termine: ohne Links,
  HTML und alles, was nach Zugangsdaten aussieht (`hatZugangsdaten`), oder wie eine Anweisung an ein Modell (`wieAnweisung`), vor und
  nach dem Säubern (`mailText` in `claude-app.mjs`). Trifft das den Text eines Hinweises oder den Titel eines Termins, fällt der Eintrag
  weg, sonst nur das Feld; in Obsidian stehen sie weiter. Termine und To-dos aus dem Stand hat `tresorPruefen` schon so geprüft. Eine
  Heuristik, dazu die Kennzeichnung als Daten in den Werkzeugen.
- **Notschalter:** `CONNECTOR` im signierten Paket (erste Zeile ohne `#`; nur `an` erlaubt ihn). Mit `aus` gibt der Web-Dienst keine
  Codes mehr (503 `abgeschaltet`), meldet den Connector als aus, schreibt weder Lagebild noch gemerkte Hinweise und löscht beim nächsten
  Stand, Abholen oder spätestens nach 5 Minuten `lage.json`, `web/lagebild.json` und `web/hinweise.json`; `anwenden` schaltet ihn ganz
  aus wie „aus“ in Obsidian (`node claude-app.mjs aus` als `studium-web`: alle Verbindungen getrennt, Codes, Marke, Lage, Lagebild und
  gemerkte Hinweise weg; scheitert das, wenigstens die Marke) und dann alles ab. Bis 03.11.2026 nahm er nur die Marke weg, und Noten
  und Hinweise blieben auf der Platte. Ein späteres Paket mit `an` schaltet nichts wieder ein.
- **Löschen:** `studium-server claude-app aus`, `schluessel-erneuern` (Codes und Tokens weg, der Connector läuft leer wieder an,
  wenn er an war) und eine neue Adresse (aus) löschen den Zustand des Connectors.

## Tests

`tests/mcp.test.js` startet den echten Server auf einem freien Port und spricht mit dem offiziellen MCP-Client
(`@modelcontextprotocol/sdk`, nur Entwicklungsabhängigkeit, wird nie ausgeliefert): Werkzeuge und Anleitung, eine Woche mit Ausfall,
Änderung und 14-täglicher Übung, Suche mit Teilwörtern und Obergrenzen, alle Ausschlüsse (auch Pfade mit `..`), das Säubern, der
Warnsatz zum Stand, die HTTP-Regeln und falsche Argumente, kompakte Ergebnisse, lange Notizen in Teilen, das Kürzen ganzer Einträge,
Fehler im Server als `isError` und das Protokoll 2026-07-28 (`server/discover`, Köpfe, `-32020`, `-32022`, 404) neben der alten
Art. Gegen den offiziellen Client in Fassung 2 (`@modelcontextprotocol/client` 2.4.0, Verhandlung `auto` und fest 2026-07-28) lief der
Connector am 02.11.2026 einmal von Hand (nicht in den Tests, keine neue Abhängigkeit). Ein zweiter Test-Tresor (`echtAnlegen`) hat die Formen, die Uni-Abgleich
und Plugin wirklich schreiben (Uhrzeit in `ort`, leeres Feld `klausur`, Kopf als HTML, Bases-Abfragen, offene Fragen ohne „?“, Links
in To-dos); jeder Fund aus dem ersten Lauf gegen den echten Tresor (01.11.2026) hat dort einen Test.

`tests/mcp-app.test.js` prüft die App: `ueberblick` mit Verweis auf die Ansicht (kein eigenes Werkzeug), die Ansicht als Ressource
ohne fremde Adressen und ohne `innerHTML`, strukturiert nur `ansicht`, nichts davon ohne `app: true`.

`tests/mcp-oauth.test.js` geht den Weg von claude.ai mit den Helfern des SDK (Erkennung über den 401, PKCE, Tausch, Erneuern) bis zu
den Werkzeugen und prüft mit eingespielter Uhr, was abgelehnt werden muss: fremde Clients und Rücksprünge (anderer Host, Pfad,
Abfrage, Schrägstrich am Ende, localhost), `plain` oder fehlendes PKCE, falscher Verifier, Codes doppelt oder zu spät, ein anderes
`resource`, fehlendes, fremdes, geändertes oder abgelaufenes Cookie und eines eines anderen Servers, viele Aufrufe der
Anmeldeseite vor dem richtigen Code, der sechste falsche Code, ein wiederverwendetes Erneuerungstoken (und eines, das nur die
Kennung der Verbindung trägt und nichts beendet), abgelaufene Tokens,
30 und 90 Tage, paralleles Erneuern, eine verlorene Antwort und das Erneuern viel später, ein altes Token, das die echte Verbindung
verdrängen will, viele falsche Anfragen vor einem echten Erneuern, über 100 falsche Codes vor dem richtigen, eine kaputte
`oauth.json`, Kommandozeile und Dienst gleichzeitig (Sperre), beide Rücksprünge, Zeilenumbrüche im Journal, ein festes Token am
OAuth-Lauscher, fremde `Origin`, Trennen und Widerrufen.

`tests/mcp-server.test.js` prüft den eigenen Server ohne Kopie: die Quelle auf Daten wie vom Web-Dienst (welche Werkzeuge es je
nach Daten gibt, Termine aus Stand, Mails und zentralen Daten samt `erstmals`, Bereich und fremden Modulen, `abgeglichen` und
Warnungen, Lagebild, gesäuberte Hinweise), `zentralAbrufen` mit nachgebildetem Netz (Prüfsumme, Größe, unverändert, `pause`), die
Prüfung zentraler Termine gegen `terminePruefen` des Plugins (die Termine aus `tests/daten/v1/` und Vektoren für jedes Feld),
`lagebildPruefen` mit falschen Typen, Links, HTML, Zugangsdaten und Grenzen, `POST /v1/claude-app` mit jeder Aktion (Bearer,
ohne Beweis, falscher Zweck, Uhr, Wiederholung, 3 je Stunde, 10 je Tag, Notschalter, 404 für Unbekanntes, ein Claude-Code an
`/v1/verbinden`), den Stand mit Lagebild und Hinweisen, den ganzen Weg (Code aus dem Dienst, Anmeldung mit den Helfern des SDK,
Werkzeuge, Code nur einmal, Codes der Kommandozeile und zu lange gültige abgelehnt, Trennen und aus sperren sofort, danach wieder
an) und `studium-server claude-app anwenden` mit nachgebildetem `systemctl`, `caddy` und `jq` (Fragment nur, solange an;
Notschalter; Caddy lehnt ab; ohne Adresse). Nicht geprüft: echtes systemd und Caddy, die Anmeldung aus dem echten claude.ai.

## Plugin

Seit Release A verbindet Obsidian die Claude-App selbst, nur im Fenster „Eigener Server“ und nie in der Einrichtung. Beteiligt:
`server.js` (Fenster, Anfragen, `server.json`, Lagebild), `seit-besuch.js` (Hinweis), `verbindungen.js` (Zeile), `lernplan.js`
(`kapitelStand`). Tests: `tests/claude-app-plugin.test.js`, gegen den echten `server/dienst.mjs` mit einer Attrappe für
`POST /v1/claude-app` und `claude_app` im Eingang davor.

- **Anfrage** (`caAnfrage`): `POST /v1/claude-app`, Körper ein Paket mit Zweck `claude-app` und `{ schema: 1, zeit, nonce, aktion:
  "code" | "status" | "trennen" | "aus", id? }` (16 Zufallsbytes), signiert mit dem Beweis des Datenschlüssels (`mitBeweis`); die
  Antwort 200 hat den Zweck `claude-app-antwort`. Fehler: 404 → `alt` („Dein Server bekommt das mit seinem nächsten Update.“), 503
  → `abgeschaltet` („Die Verbindung zur Claude-App ist gerade abgeschaltet.“), 429 → `zu-viele` mit `wieder` aus der Antwort, sonst
  aus `Retry-After` („Zu viele Versuche. Wieder möglich ab …“), 400 `uhr` → der Satz zur Uhr wie bei „Weiteres Gerät verbinden“,
  400 sonst und 409 → „Das hat nicht geklappt. Versuch es noch einmal.“, 403 `datenschluessel` → wie ein abgelehnter Schlüssel,
  403 `veraltet` → `alt`, 401 wie jede Anfrage (`ablehnung`). Ein Server ohne den Weg antwortet auf den unbekannten Pfad mit 404
  ohne Signatur; das nimmt `senden` mit Riegel nur hier an (`fehlt404`), jede andere unsignierte Antwort gilt weiter als Netzfehler.
- **Fenster** (`claudeAppZeigen`, nur mit Schlüsseln und wenn der Server sie nicht ablehnt): Abschnitt „Claude-App“, je Verbindung
  eine Zeile (Name der App, „Verbunden seit … · zuletzt benutzt …“) mit **Trennen**, sonst „Nicht verbunden.“, darunter **Mit der
  Claude-App verbinden** und, solange sie an ist, leise **Claude-App ganz ausschalten**. Gezeichnet zuerst aus `server.json`, dann
  aus der Antwort auf `status`, ohne das Fenster aufzuhalten; ist sie `alt` oder `abgeschaltet`, steht statt des Knopfs nur der
  Satz. Auf einem Gerät ohne Schlüssel steht im Stand des Fensters nur die Zeile „Claude-App: …“ aus `server.json`.
- **Code** (`claudeAppCode`): erst die Rückfrage (`CA_LESEN`: Termine und Fristen, offene To-dos, Lernplan-Stand, fällige
  Karteikarten je Modul, Prüfungen mit Noten, Stundenplan der nächsten 14 Tage, Hinweise des Servers; Claude ändert nichts), dann
  die Anfrage. Gilt nur mit einem Code in der Form von `CODE`, einem Ablauf und genau `https://<Host dieses Servers>/mcp` als
  Adresse. Das Fenster zeigt drei Schritte (Claude-App → Einstellungen → Konnektoren → eigenen Konnektor hinzufügen, englische Namen in
  Klammern, Verbinden nur dort und nie über einen geschickten Link → Name und Adresse, mit dem Satz zum Hinweis der App → zweimal
  Weiter, Anmeldung wie erkannt → Code auf der Seite des Servers → Verbinden), die Adresse in einem Feld zum Lesen mit **Adresse kopieren**, den
  Code (`.eba-server-code`) mit „Gilt bis …“ und eingeklappt „Sicher einstellen“ (in claude.ai die Gmail-Werkzeuge zum Senden und
  Weiterleiten aus, den Netzzugang der Code-Ausführung aus). Zu seinem Ablauf verschwindet alles (`ctx.zeit`, nur der zuletzt
  gezeigte). Der Code steht nie im Tresor, in `data.json`, `server.json` oder im Gerätespeicher; im Speicher bleibt nur der Stand
  (`caLive`: `{ an, verbindungen }`). Danach ruft das Gerät gleich ab, damit das Lagebild schon mit dem nächsten Stand geht.
- **Trennen** (`claudeAppTrennen(id)`, nur eine Kennung wie `CA_ID`) und **ausschalten** (`claudeAppAus`): je mit Rückfrage; die
  Antwort ersetzt die Zeilen.
- **`server.json` → `claude_app`** (schreibt das abrufende Gerät aus `claude_app` des Eingangs, wie `verbunden`): `{ an,
  verbindungen: [{ id, seit, client, zuletzt }], bekannt: [{ id, seit, client, ende? }] }`. `zuletzt` steht nur als Tag da, sonst
  schriebe jeder Abruf die Datei neu, solange jemand Claude fragt. `bekannt` sind alle Verbindungen, die das Gerät je gesehen hat,
  und die beendeten, die der Server in `frueher` meldet (mit `ende`; 30 Tage ab `seit`, höchstens 20), auch getrennte: Eine fremde
  Verbindung, die sich selbst wieder abmeldet oder ersetzt wird, auch bevor ein Gerät abholt, fällt so trotzdem auf.
  Fehlt `claude_app` im Eingang (Server ohne Connector), fehlt es auch hier. `client` gilt nur als Name (`CA_CLIENT`).
- **Hinweis auf allen Geräten:** „Seit deinem letzten Besuch“ zeigt jede Verbindung aus `bekannt` der letzten 14 Tage einmal je
  Gerät (siehe [seiten.md](seiten.md)), und die Zeile „Eigener Server“ unter Verbindungen hat 3 Tage lang (`CA_PRUEFEN_TAGE`) die
  Pille „prüfen“ (`pilleText`), darunter „Neue Claude-Verbindung am … um …“ und in der kompakten Zeile rechts „Prüfen“ im Akzent;
  ein Problem des Servers geht vor. Ist sie schon beendet (`ende`), heißt es „…, schon beendet – warst du das?“, und statt Trennen
  rät der Satz, die Claude-App auszuschalten. Keine Liste „Bitte prüfen“.
- **Lagebild im Stand** (`lagebildObs` → `lagebildKurz`): nur, solange `claude_app.an` im Eingang dieses Abrufs gilt; sonst fehlt
  das Feld ganz. Form: `{ lernplan: [{ modul, kapitel: [{ titel, nummer?, verstanden, woche? }] }], karten: [{ modul, faellig }],
  pruefungen: [{ modul, titel?, datum?, anmeldung?, versuch?, note? }], stundenplan: [{ datum, von?, bis?, titel, ort?, modul?, ausfall? }] }`,
  leere Felder fehlen.
  - `lernplan`: `ctx.lernplan.kapitelStand()`, je Lernplan, der noch dran ist; `verstanden` heißt abgehakt (oder alle
    Unterkapitel), `woche` ist der Montag der Woche, in der der Plan das Kapitel vorsieht.
  - `karten`: `ctx.karten.heuteJeModul()`, `faellig` wie „X fällig“ unter Karteikarten (fällig und in den Lernschritten, ohne neue).
  - `pruefungen`: alle Prüfungen des Fachmodells vom letzten bis zum nächsten Jahr (`ctx.modell.pruefungen`, auch Zwischentests),
    dazu Module mit Note oder Anmeldung ohne Prüfungstag. `note` ist das `ergebnis` der Modulnotiz, sonst die Note aus Alma
    (`alma-konto.json`), sonst bei bestanden, anerkannt oder (endgültig) nicht bestanden dieses Wort; `versuch` ebenso; `anmeldung`
    `angemeldet` (Modulstatus oder Alma) oder `zurückgetreten` (Alma). `note` und `versuch` stehen nur an der letzten Klausur, die
    schon war (ohne Zwischentests), sonst an einem Eintrag ohne `datum`, nie an einem kommenden Termin (bis 04.11.2026 trug jeder
    Termin des Moduls die Note, auch der Nachholtermin nach einem bestandenen Haupttermin).
  - `stundenplan`: deine Lehrveranstaltungen von heute bis in 13 Tagen nach `ctx.modell.findetStatt`, ohne „Besuche ich nicht“,
    ein Ausfall mit `ausfall: true` (die Werkzeuge: `faellt_aus`, die Wochenansicht „fällt aus“). Bis 03.11.2026 stand „(fällt aus)“
    hinter dem Titel, und `lagebildKurz` schnitt es bei langen Titeln mit ab.
  - Grenzen: 40 Module, 200 Kapitel je Modul, 100 Prüfungen (wie `LAGEBILD` in `server/claude-app.mjs`), 300 Einträge im Stundenplan,
    eine Note höchstens 30 Zeichen (`LAGE.note` gleich `LAGEBILD.note`, auch in den Werkzeugen; bis 03.11.2026 nahm der Server nur 20,
    und „endgültig nicht bestanden“ fiel weg, das Modul galt dann als offen); Modulcodes nur in der Form von `eba.js`;
    Texte durch `punktText` (keine Links außer zur Uni, kein HTML) und ohne alles, was nach Zugangsdaten aussieht
    (`siehtGeheimAus`; dann fehlt das Feld, ohne Titel der Eintrag). Zusammen höchstens 120 000 Bytes und nie mehr, als neben dem
    übrigen Stand unter 360 000 Bytes passt (`lagebildKappen`: ganze Einträge vom Ende der jeweils größten Liste), so bleibt der
    verschlüsselte Stand unter den 512 KB des Dienstes. Ein Test schickt den vollen Auszug aus dem Tresor mit einem riesigen
    Lagebild an den echten Dienst.
