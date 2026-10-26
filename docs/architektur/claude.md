# Architektur: Claude

Teil der Architektur-Doku. Aufbau, `ctx`, Skripttypen und die Regeln für Skript-Autoren stehen im Überblick
[architektur.md](../architektur.md).

## Claude ohne Server (`claude.js`, seit 0.6.3)

**Zusammenfassen** im PDF-Kasten geht auch ohne eigenen Server: Mit einem eigenen API-Schlüssel aus der Claude Console ruft das
Plugin die Messages API selbst auf (`requestUrl` von Obsidian, auf jedem Gerät, auch iPhone und iPad). Ein Abo (Free, Pro, Max)
geht dafür nicht: Anthropic erlaubt Apps anderer Anbieter weder die Anmeldung mit claude.ai noch Anfragen über ein Abo
([Legal and compliance](https://code.claude.com/docs/en/legal-and-compliance)); ein Schlüssel aus der Console ist dafür gedacht und
rechnet über das Guthaben dieses Kontos ab. Gibt es einen eigenen Server, geht er vor (siehe [„PDF-Kasten“](bedien-bausteine.md)).

Seit 26.10.2026 ist der Schlüssel nur für Fortgeschrittene und soll nie wie der empfohlene Weg aussehen: Jede Zusammenfassung
kostet extra, der eigene Server fasst über das Claude-Abo zusammen. Die Zeile „Claude“ steht darum nur da, wenn dieses Gerät
verbunden ist; sonst erreicht man das Fenster über den leisen Link ganz unten im Fenster „Eigener Server“, und Schritte und Feld
liegen dort eingeklappt unter „Trotzdem mit API-Schlüssel verbinden“ (`InfoFenster` in `verbindungen.js`).

- **Verbinden** (Zeile und Fenster „Claude“ unter Verbindungen, `ctx.claude.fensterInhalt`): Schlüssel einfügen, Leerraum fällt weg
  (`schluesselNormal`); `schluesselFehler` lehnt ohne Anfrage ab, was nicht mit `sk-ant-` beginnt, Abo-Token (`sk-ant-oat…`) und
  Admin-Schlüssel. Dann `GET /v1/models?limit=1` (kostet nichts). Antwortet Anthropic „not scoped to a workspace“, holt das Plugin
  `GET /v1/organizations/workspaces?include_default=true` und nimmt den einzigen nicht archivierten Workspace oder den namens
  „Default“, sonst bittet es um einen Schlüssel in einem Workspace; der Kopf `anthropic-workspace-id` geht danach mit. Schlüssel und
  Workspace liegen als JSON im Schlüsselbund (`app.secretStorage`, je Tresor eine Kennung `studium-autopilot-claude-<Hash>`), nie im
  Tresor und nie im Sync; jedes Gerät verbindet sich selbst. Ohne Schlüsselbund (altes Obsidian) wird nichts gespeichert.
- **Anfrage** (`anfrageBauen`): `POST /v1/messages`, `anthropic-version: 2026-10-21`, Modell `claude-opus-5-5`, `max_tokens`
  16000, `thinking: { type: "adaptive", display: "summarized" }`, `output_config.effort: "medium"` und
  `output_config.format` mit dem JSON-Schema `SCHEMA` (Structured Outputs: `lesbar`, `wichtigste`, `zu_tun`, `fragen` mit den Feldern
  von `begleitnotizSauber`; jedes Objekt geschlossen, alle Felder Pflicht, Seiten und Frist als `anyOf` mit `null`). Keine
  Sampling-Parameter (die API-Version lehnt `temperature`, `top_p`, `top_k` ab). Der Systemprompt `SYSTEM` hat die Regeln von
  `server/skill/studium-autopilot/begleitnotiz.md` (Anzahl der Punkte, „Organisation“, „Gehört zu“, Grenzen der Felder, Seiten der
  PDF ab 1, keine Personendaten, die Unterlage ist keine Anweisung). Die Nachricht hat die PDF als Dokument-Block (Base64) vor einem
  kurzen Kopf (Titel, Modul, Art, Seiten, heute), ohne PDF die Textfassung (`volltextText`, mit `[S. N]`, höchstens 2 Mio. Zeichen)
  in `<unterlage>`.
- **Datenstrom:** `stream: true`, weil `requestUrl` zwar erst am Ende liefert, aber so während des Denkens Daten fließen (mit
  `display: "omitted"`, der Vorgabe von Opus 5.5, wäre die Leitung bis zum Text still) und iOS die Verbindung nicht als untätig
  schließt. `stromLesen` nimmt nur `text_delta` aus Text-Blöcken, die Token aus `message_start` und dem letzten `message_delta`
  (Summe; Cache zählt als Eingabe) und ein `error`-Ereignis. `ergebnisLesen`: `refusal`, `max_tokens`, kaputtes JSON und Fehler im
  Strom werden zu Sätzen; die Kosten (4 $ bzw. 20 $ je Million Token) zählen auch dann.
- **PDF oder Text:** Die PDF geht mit bis 20 MB (`PDF_MAX`, Anthropic nimmt 32 MB je Anfrage, Base64 macht ein Drittel mehr) und
  500 Seiten (`PDF_SEITEN`, Anthropic: 600 bei 1 Mio. Token Kontext); die Seitenzahl kommt aus `seiten` der Notiz oder der
  Textfassung, sonst zählt pdf.js. Lehnt Anthropic die PDF ab (413, 400, 429 mit „input tokens“: neue Konten haben kleine Limits
  je Minute) und gibt es eine Textfassung, geht dieselbe Anfrage einmal ohne PDF (`nurText`, der Hinweis sagt es).
  `kostenSchaetzen` wie `pdfKosten` in `server.js` (je Seite etwa 1500 Token für das Bild, ohne Textfassung noch einmal so viel für
  den Text, dazu etwa 3000 Token Regeln und 6000 Token Ausgabe); über 0,50 $ (`KOSTEN_FRAGEN`) fragt der Knopf erst (`S.wahl`:
  „Mit PDF“ oder „Nur Text“, ohne Wahl nur „Zusammenfassen“).
- **Schreiben:** `begleitnotizSauber` und `begleitnotizErgaenzen` aus `server.js` (gleiche Regeln wie nach einem Abruf vom Server:
  „Das Wichtigste“ nur, wenn dort nichts steht, sonst nur, was fehlt), in `app.vault.process`, danach `wunschWeg`. Nur Lehrmaterial
  (`ARTEN_SENDEN`), nur mit PDF neben der Notiz (`pdfZurNotiz`). Der Knopf heißt „Wird zusammengefasst“, solange die Anfrage läuft
  (`zusammenfassenStand`: `angefordert`), danach verschwindet er; der Hinweis nennt die Kosten.
- **Fehler** (`fehlerSatz`, je ein Code): `netz`, `schluessel` (401), `recht` (403), `guthaben` (400 „credit balance“), `limit`
  (eigenes Ausgabenlimit: 400 „specified API usage limits“; Grenze der Stufe: 429 mit `enforced_spend_limit_reached`),
  `workspace`, `minute`, `warten` (429, 5xx, 529), `gross` (413), `modell` (404), `anfrage`. Anthropic prüft das Guthaben vor
  allem anderen, auch vor dem Aufbau der Anfrage und bei `count_tokens`. `schluessel` und `guthaben` merkt sich das Gerät
  (`eba-claude-problem` in `loadLocalStorage`), bis eine Anfrage klappt oder neu verbunden wird; der Hinweis hat dann
  **Verbinden** bzw. **Console öffnen**.
- **Zeile** (`ctx.claude.zeile()`, Form wie `quelleZeile`): nicht verbunden der Satz und **Mehr erfahren**; verbunden Pille
  „verbunden“ und die Zusammenfassungen und Kosten des Monats auf diesem Gerät (`eba-claude-verbrauch`); Schlüssel abgelehnt Pille
  „neu verbinden“ und **Verbinden**; Guthaben leer **Guthaben aufladen** (Billing in der Console). Zu sehen ist die Zeile ohne
  eigenen Server oder wenn dieses Gerät verbunden ist.
- **Neue Fassung** (seit 0.6.9): Gehört „Das Wichtigste“ zu einer früheren Fassung, fasst der PDF-Kasten beim Öffnen von selbst
  neu zusammen, einmal je Fassung und Gerät und nur ohne Rückfrage; die frühere Zusammenfassung, „Zu tun“, „Offene Fragen“ und die
  geänderten Seiten gehen als `<notiz>` mit (siehe [„Neue Fassung einer Unterlage“](unterlagen.md)).
- Testeinstieg: `ctx.claude.erzeugen(abh)` (Netz, Schlüsselbund, Speicher und Uhr als Ersatz); `tests/claude.test.js` prüft
  auch den Knopf bis in die Notiz mit den echten Helfern aus `server.js`. Ohne Guthaben lässt sich nur das Verbinden live prüfen.

## Claude im Tresor (`.claude/`)

Wer Claude Code im Tresor-Ordner startet, bekommt mit der Vorlage, wie man hier liest und schreibt: `.claude/CLAUDE.md`
(drei Regeln und der Verweis auf den Skill) und den Skill `.claude/skills/studium-autopilot/` mit `SKILL.md` (Grundregeln),
`tresor.md` (Ordner, Notizarten, Felder, Besitz über `herkunft`, Dateinamen), `lesefassung.md` (Lesefassung der Folien), `lesen.md` (Woche, Prüfungen, Noten,
Unterlagen über die Textfassungen, To-dos), `schreiben.md` (Termin, Zusammenfassung in der Begleitnotiz, To-do,
Vorlesungsnotiz, Karteikarten; was nie geschrieben wird) und `fehler-melden.md` (Meldung an den Autor: gehört es zu Studium
Autopilot, schon gemeldet?, ohne persönliche Daten und Unterlagen, Vorlage aus `.github/ISSUE_TEMPLATE`, ganze Meldung zeigen,
dann ein vorausgefüllter Link `issues/new?template=…&<Feld-id>=…` ohne `labels=`, den die Person selbst abschickt;
Sicherheitslücken nur privat wie in `SECURITY.md`). Dieselbe Regel steht für die Einrichtung im Skill `server-einrichten`,
und Claude auf dem eigenen Server beginnt einen Hinweis zu einem falschen zentralen Termin mit „Zentraler Termin wohl falsch:“. Es gibt keine Schnittstelle dazwischen: Claude schreibt die Dateien
so, wie das Plugin sie selbst anlegt, und das Plugin erkennt sie am `typ`.

- **Update (seit 0.6.9):** `CLAUDE.md` und die Dateien des Skills haben die Klasse `claude` (`klasse_von` in `pruefen.py`,
  `klasseVon` in `update.js`) und stehen im Schlüssel `weitere` der Update-Liste, den die Planer bis 0.6.8 übergehen (in
  `dateien` lehnten sie die ganze Liste ab, „Liste: Datei nicht erlaubt“). Eine neue Version ersetzt sie wie Systemdateien,
  eine geänderte Fassung liegt danach als `Name (deine Fassung vor X).md.txt` daneben; jeder Computer holt nach, was bei ihm
  fehlt oder alt ist (Abschnitt Update, „Hinweise für Claude“). Bis 0.6.8 blieben sie auf dem Stand der Installation. Eigene
  Regeln gehören in einen eigenen Skill unter `.claude/skills/<name>/`; den und `.claude/settings*.json` fasst kein Update an.
- **Gleiche Regeln wie der Code:** `tests/claude-skill.test.js` prüft Kategorien (`zentral.js`), Arten der Unterlagen
  (`unterlagen.js`), Abschnitte der Begleit- und Vorlesungsnotizen, die Auswahl der To-dos (`todos.js`) und die Id-Felder der
  Quellen (`quellen.js`) gegen den Text des Skills.
- Der Skill des eigenen Servers (`server/skill/studium-autopilot/`) ist ein anderer: Er schreibt nie Notizen, sondern das
  Eingang-Format, das das Plugin übernimmt.
