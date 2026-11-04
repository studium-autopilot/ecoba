// Eigener Server: Ein kostenloser Server der Studentin oder des Studenten findet mit Claude Termine und Hinweise in
// Uni-Mails und Gmail (Server-Paket in server/ des Projekts). Dieses Skript holt die Ergebnisse ab, entschlüsselt sie und
// legt die Termine als Notizen an. Ohne Verbindung geht nichts ins Netz; unter Verbindungen steht dann nur eine leise Zeile
// „Für Technische“ mit dem Knopf „Prompt kopieren“ (Text zum Einfügen in Claude Code, Tab „Code“ in Claude Desktop, PROMPT).
//
// Verbinden: Der Server zeigt einen Einmal-Code (30 Minuten) mit seiner Adresse, dazu einen Link
//   obsidian://studium-autopilot?aktion=server-verbinden&adresse=…&code=…. Jede Webseite könnte so einen Link bauen: Von außerhalb
//   der App verbindet er nie (seit 02.11.2026), Code und Adresse tippst du unter „Mit Code verbinden“ ein; in der App immer mit
//   Rückfrage, die sagt, was das Gerät dann schickt, und bei einem anderen Server mit dessen Namen zum Eintippen. Nur Namen im
//   Internet (hostOk), nie eine IP-Adresse, localhost oder das eigene Netz. Das Plugin tauscht den Code
//   (POST /v1/verbinden, seit 0.7.8 ohne den Code selbst und mit verschlüsselter Antwort, austauschen) gegen Zugangs- und
//   Datenschlüssel und legt beides mit der Adresse in den Schlüsselbund von Obsidian (app.secretStorage: gerätelokal,
//   verschlüsselt, nie synchronisiert; Eintrag je Tresor wie in ilias.js). Jede Anfrage danach ist signiert (anfrageKopf), keine
//   trägt den Zugangsschlüssel selbst.
// Weitere Geräte (seit 01.11.2026): Ein verbundenes Gerät holt im Fenster mit „Weiteres Gerät verbinden“ nach einer Rückfrage einen
//   Code (geraetCode, POST /v1/geraet; die Anfrage ist mit dem Datenschlüssel verschlüsselt, Zweck „verbinden“, mit Zeit und
//   Zufallswert, denn den Zugangsschlüssel zeigte bis 0.7.7 jede Anfrage im Kopf; 10 Minuten, einmal) und zeigt ihn groß, bis er abläuft. Er
//   steht nur im Fenster, nie im Tresor, in data.json, server.json oder im Gerätespeicher. Das neue Gerät tippt ihn unter „Mit Code
//   verbinden“ ein (codeVerbinden); im Feld darunter steht die bekannte Adresse (Schlüsselbund, sonst server.json), bei älteren
//   Daten tippt man sie dazu, nach einer neuen IP des Servers tippt man die neue darüber (seit 02.11.2026). Dann wie
//   beim Link: Rückfrage, POST /v1/verbinden. So verbindet sich auch ein Gerät neu, dessen Schlüssel der Server nicht mehr kennt
//   (sudo studium-server schluessel-erneuern, wenn ein Gerät verloren ist). Wann zuletzt ein Gerät verbunden wurde und wie (Cloud
//   Shell oder Obsidian), bringt der Eingang mit (nie der öffentliche Status); das Fenster zeigt es.
// Schlüssel je Gerät (Server ab dieser Fassung, server/geraete.mjs): Jedes Gerät, das sich verbindet, bekommt eigene Schlüssel und eine
//   Kennung (geraet im Schlüsselbund); eins mit den gemeinsamen zieht beim nächsten Abruf einmal auf eigene um (umziehen, POST
//   /v1/geraete). Das Fenster zeigt zugeklappt „Geräte (N)“ aus dem Status, je Gerät woher es kam („über Code von …“) und sein grobes
//   Netz, jedes andere mit „Trennen“ (der Server nimmt es dann nicht mehr an, und mit ihm, was über seine Codes verbunden wurde, außer
//   du behältst es); „Dieses Gerät trennen“ sagt es vorher dem Server. Ein älterer Server kennt den Weg nicht (404): keine Liste.
// Quellen-Vertrag (quellen.js, docs/architektur/quellen.md): Zeitplan planen(), Status in der gemeinsamen Form ({ zustand, geprueft, fehler,
//   fehlerZeit, warnungen }, nachLauf), Zeile im Format von verbindungen.js (quelleZeile), Besitz
//   herkunft: claude + claude_id, Grabstein (angewendet, kurzHash) in der Sperr-Datei, Doppel einer id zusammenführen (dubletten).
//   Hinweise nur über ctx.hinweis (hinweis.js) und nur nach deinem Tipp, nie vom Zeitplan. Wegwerfen nur über den einen
//   Papierkorb (quellen.js papierkorb).
// Abruf (beim Start nach 30 s bis 2,5 Min., dann alle 15 Min., nach Fehlern nach 2 bzw. 5 Min., zurück in der App nach über
//   10 Min.; Knopf „Aktualisieren“): GET /v1/eingang, signiert
//   → Paket mit AES-256-GCM (Zweck „eingang“ als Zusatzdaten, wie server/kanal.mjs) → noch nicht übernommene
//   Eingang-Dateien. Jede Datei wird einmal übernommen (Namen in server.json). Danach schickt das Plugin seinen Stand
//   verschlüsselt zurück (POST /v1/stand: Modulcodes, Studienbeginn, Variante, ein Auszug aus dem Tresor gegen Doppel – Termine
//   mit Titel und Datum, offene To-dos wie auf dem Dashboard, nie etwas mit Zugangsdaten –, übernommene Dateien), der Server löscht die
//   übernommenen Dateien. Nur ein Gerät übernimmt: die gemeinsame Abrufer-Sperre (sperre.js, Datei System/Daten/server-abruf.json);
//   es nehmen nur Geräte mit Verbindung teil, „Hier aktualisieren“ holt die Sperre her. Höchstens NEU_JE_ABRUF neue Notizen je Abruf: Der
//   Rest bleibt auf dem Server und kommt beim nächsten (Schutz gegen eine Flut, etwa von einem fremden Server).
// Termine: Prüfung wie bei den zentralen Daten (ctx.zentral.terminePruefen), ids nur „c-“ + 20 Hex-Zeichen (der Server leitet
//   sie aus Claudes Schlüssel ab, server/eingang.mjs). Notiz wie eine zentrale (ctx.zentral.notizText), aber mit
//   herkunft: claude und claude_id; das Plugin löscht sie nie von selbst. Entfällt ein Termin, bekommt die Notiz „(entfällt)“.
//   Steht schon ein zentraler oder eigener Termin am selben Tag (±1) mit ähnlichem Titel im Tresor, entsteht keine zweite Notiz
//   (doppelt). Eine gelöschte Notiz kommt nur zurück, wenn sich der Termin ändert (Grabstein). Zwei Notizen derselben claude_id
//   (Sync-Verzug) führt der Abruf zusammen.
//   Eine verschobene Notiz bleibt in ihrem Ordner; bei neuem Datum wird sie dort umbenannt. Kommt derselbe Termin später auch
//   über die zentralen Daten (eine Rundmail an alle), weicht die Notiz vom Server, solange du sie nicht angefasst hast (nicht
//   erledigt, „Meine Notizen“ leer, unberuehrt): Sie kommt in den Papierkorb (zentralWeicht). Neue Termine, die schon vorbei sind (eine Datei
//   lag lange auf dem Server), legt das Plugin nicht an.
// Begleitnotizen (seit 0.5.2 auf Wunsch): Der Knopf „Zusammenfassen“ im PDF-Kasten einer Notiz zu Lehrmaterial (Folien, Skript,
//   Übung, Tutorium, Lösung, Altklausur, Literatur), deren „Das Wichtigste“ noch leer ist, setzt zusammenfassung_angefordert in
//   ihren Eigenschaften (synchronisiert, also auf jedem Gerät). Der Abruf schickt die Textfassung der PDF (volltext.js) dann an
//   den Server (POST /v1/unterlagen, modell: opus; höchstens 9 je Abruf in Anfragen zu 3, Gewünschtes zuerst, gemerkt in
//   server.json „gesendet“ mit Minute), und Claude schreibt sie dort mit Opus in einem eigenen Lauf. Einstellung
//   server_unterlagen: knopf (Standard, nur auf Wunsch) | alle (dazu jede neue Unterlage ohne Zusammenfassung, mit dem Modell
//   des Servers) | aus (nichts, auch kein Knopf). Terminsuche (seit 0.5.3, nicht bei aus): Unterlagen von Modulen, deren Termine
//   nicht zentral kommen (ctx.zentral.abdeckung), gehen einmal mit nur_termine an den Server, wenn die PDF höchstens
//   TERMINSUCHE_TAGE alt ist; Claude sucht darin nur Termine (Abgaben, Probeklausur …), ohne Zusammenfassung. Claude
//   schreibt die Abschnitte, der nächste Abruf trägt sie in die Notiz neben der PDF ein (begleitnotizErgaenzen): fehlende
//   Abschnitte über dem PDF-Kasten, Platzhalter älterer Notizen ersetzt, „Das Wichtigste“ nur, wenn dort noch nichts steht, bei
//   „Zu tun“ und „Offene Fragen“ nur, was fehlt; dein Text bleibt. Dieselbe Lieferung nie zweimal (server.json „begleitet“).
//   Mit PDF (seit 0.5.7): Der Knopf schickt dazu die PDF selbst (bis 500 MB, zusammenfassung_pdf: true, POST /v1/pdf in Stücken
//   zu 8 MB vor dem Text), damit Opus auch Abbildungen, Tabellen und Formeln sieht. Kostet das grob geschätzt mehr als 5 % eines
//   Fünf-Stunden-Limits im Pro-Abo (pdfKosten) oder hat die PDF mehr als 20 MB, fragt der Knopf erst: „Mit PDF“ oder „Nur Text“.
//   Ohne Server (seit 0.6.3): Mit eigenem API-Schlüssel fasst claude.js dieselben Unterlagen direkt zusammen und schreibt sie mit
//   begleitnotizSauber und begleitnotizErgaenzen von hier; gibt es einen Server, geht er vor (pdfkasten.js).
//   Neue Fassung (seit 0.6.9): Heißt „Das Wichtigste“ „(frühere Fassung, bis …)“ (ilias.js, fassung.js), zählt die Notiz bei
//   knopf ab diesem Tag als gewünscht. Sie geht erst mit der Textfassung der neuen Datei (fassung.js textAktuell), mit der
//   früheren Zusammenfassung, „Zu tun“, „Offene Fragen“ und den geänderten Seiten im Feld fassung; ein Server vor 0.6.9 übergeht
//   es. Die neue Zusammenfassung kommt nach oben, die frühere eingeklappt darunter („Frühere Fassung (bis …)“).
// Lernplan (seit 31.10.2026): Für Module des laufenden Semesters ohne zentrale Kapitelliste (kapitel.json) baut Claude auf dem
//   Server die Liste aus den Folien. Der Stand nennt dem Server Semester und Module (lernplan); danach gehen die Textfassungen der
//   Folien dieser Module (die der Plan zählt, ctx.lernplan.folienVon; die ersten KAPITEL_GANZ Seiten ganz, danach nur die erste
//   Zeile jeder Seite) mit Nummer, Datum und Quelle der Unterlage an POST /v1/kapitel, jede PDF einmal (server.json „lernplan“),
//   niedrige Nummern zuerst. Claude liest sie im gewöhnlichen Lauf mit dem Modell des Servers, nur wenn neue Folien da sind, und
//   berichtigt die Listen, die es schon geliefert hat (fehlen sie dem Server, etwa nach einer Neueinrichtung, nimmt er die aus dem
//   Stand: Nummern, Titel und Unterkapitel der Lernplan-Notizen mit herkunft: server, listeAusNotiz). Das Eingang bringt sie als „kapitel“ (Form von kapitel.json → module);
//   lernplan.js prüft und schreibt sie (ctx.lernplan.serverListen, herkunft: server, Häkchen und eigener Text bleiben). Nicht bei
//   server_unterlagen: aus.
// Doppelte To-dos: Claude nennt Paare (behalten, weg) über die Kennung aus dem Auszug (id = „t-“ + Q.kurzHash(Pfad + Zeile)).
//   Aus „weg“ wird ein einfacher Punkt mit Link auf die Notiz, in der die Aufgabe bleibt: nur eine offene Aufgabe unter „Zu tun“
//   einer Begleitnotiz (typ: unterlage), nur wenn die Zeile noch genau so dasteht; nie abgehakt, nie gelöscht.
// Rückgängig (seit 02.11.2026): Was der letzte Abruf an vorhandenen Notizen geändert hat (diese To-dos, geänderte oder umbenannte
//   Termine), merkt sich das abrufende Gerät (L.rueck); das Fenster bietet „Rückgängig“ an, nur für Notizen, die noch so dastehen.
//   Gemerkt werden nur die geänderten Zeilen (von wo, vorher, nachher) und eine Prüfsumme der Notiz danach, nie ganze Notizen;
//   zusammen höchstens RUECK_BYTES, sonst fallen die ältesten Einträge weg. Scheitert das Speichern, bleibt der Abruf, wie er ist.
// Hinweise: die letzten 30 in server.json, sichtbar im Fenster „Eigener Server“; nach „Aktualisieren“ nennt der Hinweis die Zahl.
//   Gibt es neue (noch nicht im Fenster gesehen, höchstens 14 Tage alt), heißt der Link der Zeile unter Verbindungen „Hinweise
//   ansehen“. Gesehen merkt sich jedes Gerät selbst (Kurz-Hashes, gerätelokal), denn server.json schreibt nur das übernehmende
//   Gerät. Kein Eintrag in „Bitte prüfen“: Eine Liste schöbe dir Arbeit zu, die das System selbst erledigen oder zeigen kann.
//   Gehört ein Hinweis zu einem Modul (code, seit 01.11.2026), steht er 14 Tage lang auch im Modulfeld unter „Von Claude“
//   (modul.js); jeder neue steht in „Seit deinem letzten Besuch“ (seit-besuch.js). Beide lesen ctx.server.hinweise().
// Claude-App (Connector, seit Release A; docs/architektur/connector.md, „Plugin“): Im Fenster, nie in der Einrichtung, holt ein
//   verbundenes Gerät nach einer Rückfrage (sie sagt, was Claude lesen kann) mit „Mit der Claude-App verbinden“ einen Code
//   (POST /v1/claude-app { aktion: code }, Zweck claude-app, Antwort claude-app-antwort, signiert mit dem Beweis des Datenschlüssels)
//   und zeigt Adresse (https://<host>/mcp), Code und drei Schritte, bis er abläuft; er steht nur im Fenster. Je Verbindung „Trennen“,
//   dazu „Claude-App ganz ausschalten“ (aus). Das Eingang bringt claude_app { an, verbindungen, frueher? }; das abrufende Gerät schreibt
//   es nach server.json → claude_app (zuletzt benutzt nur als Tag, damit die Datei nicht bei jedem Abruf neu kommt) und merkt sich jede
//   Verbindung, die der Server meldet, in bekannt (30 Tage, auch nach dem Trennen; frueher sind die schon beendeten, mit ende, so fällt
//   auch eine auf, die vor dem Abholen wieder endete): Daraus zeigt „Seit deinem letzten Besuch“ jede neue Verbindung einmal je
//   Gerät, und die Zeile unter Verbindungen trägt 3 Tage lang die Pille „prüfen“. Nur solange claude_app.an gilt, geht mit dem Stand
//   das lagebild mit (Lernplan, fällige Karteikarten, Prüfungen mit Noten, Stundenplan der nächsten 14 Tage; lagebildKurz).
// Am Limit des Claude-Abos meldet der Server im Status, wann er es wieder versucht (limit_wieder); die Zeile nennt die Uhrzeit.
// Takt: Im Fenster stellst du ein, wie oft dein Server nachsieht (Uni-Postfach alle 15, 30 oder 60 Minuten, Gmail dreimal,
//   einmal oder nie am Tag); steht als server_uni_postfach und server_gmail in den Einstellungen (alle Geräte) und geht mit dem
//   Stand an den Server, der sich ab dem nächsten Abruf danach richtet.
// Status der Zeile: GET /v1/status (ohne persönliche Daten, signiert), höchstens alle 5 Min.; gerätelokal gemerkt.
// Neue Version des Servers: Er installiert sie täglich selbst und meldet das letzte Mal im Status (aktualisierung). Ging es
//   zuletzt schief, steht das im Fenster; kam seit mehr als VERSION_TAGE nichts ohne Fehler durch, obwohl die zentralen Daten eine
//   neuere Version anbieten, sagt es die Zeile (Pille „prüfen“). Ein älterer Server meldet nichts, dann bleibt beides still.
// Mails durchsuchen: Knopf im Fenster und Befehl starten einen Claude-Lauf auf dem Server (POST /v1/anstoss; wie oft, bestimmt
//   der Server, bei 429 sagt der Hinweis, ab wann es wieder geht); die Zeile zeigt „Claude durchsucht gerade …“, solange der Server „wartet“ oder „laeuft“ meldet, und der nächste
//   Abruf kommt nach 5 Min. statt im Takt. Was nur du lösen kannst (Gerät neu verbinden, Claude neu verbinden, Uni-Passwort
//   nicht angenommen), sagt die Zeile selbst (Pille „prüfen“).
// server.json (System/Daten, synchronisiert, schreibt nur das übernehmende Gerät): { schema, erledigt: { Dateiname: Zeit }
//   (60 Tage), laeufe: [die letzten 20], hinweise: [die letzten 30, { text, quelle?, zeit, code? }], gesendet: { PDF-Kennung: Datum }, nachsenden: { PDF-Kennung:
//   Datum } (ein älterer Server nahm sie nicht an, NACHSENDEN_TAGE), begleitet: { PDF-Pfad: kurzHash }, lernplan: { PDF-Kennung:
//   Datum } (Folien für Kapitellisten), adresse (des Servers, ohne Schlüssel, für „Mit Code verbinden“), verbunden: { zeit,
//   herkunft: cloud-shell | obsidian } (zuletzt verbundenes Gerät), claude_app: { an, verbindungen: [{ id, seit, client, zuletzt
//   (Tag) }], bekannt: [{ id, seit, client, ende? }] } (nur mit einem Server, der die Claude-App kennt) }. Der Grabstein
//   (angewendet: { id: kurzHash }) steht wie bei den anderen Quellen in der Sperr-Datei server-abruf.json.
// Für andere Skripte: ctx.server (Zeile und Fenster in verbindungen.js). Testeinstiege: ctx.server.erzeugen(abh) baut den
//   Ablauf mit Netz und Tresor im Speicher (tests/server-plugin.test.js); plugin.testServerAus schaltet den automatischen
//   Abruf ab, plugin.testServerLokal erlaubt http://127.0.0.1 als Adresse.
// iOS-sicher: keine Node-APIs, kein Lookbehind, kein .at()/findLast/structuredClone.
module.exports = function (ctx) {
  const app = window.app;
  const obs = ctx.obsidian;

  // ---------- Konstanten ----------
  const DATEI = "System/Daten/server.json";
  const SPERR_DATEI = "System/Daten/server-abruf.json"; // sperre.js (Quelle „server“), dazu der Grabstein
  const ORDNER = "Termine";
  const MIN = 60e3;
  const TAKT = 15 * MIN;          // automatischer Abruf
  const ZURUECK = 10 * MIN;       // beim Zurückkehren in die App nachholen, wenn der letzte Versuch so lange her ist
  const STATUS_ALTER = 5 * MIN;   // öffentlichen Status höchstens so oft holen
  const STAND_ALTER = 6 * 60 * MIN; // Stand ohne Änderung höchstens so oft schicken
  const NEU_JE_ABRUF = 50;          // höchstens so viele neue Notizen je Abruf
  const TERMINSUCHE_TAGE = 21; // nur neue Unterlagen nach Terminen durchsuchen, nicht den ganzen Bestand
  const UNTERLAGEN_JE_ABRUF = 9, UNTERLAGEN_JE_ANFRAGE = 3; // Textfassungen an den Server (Anfrage: wie UNTERLAGEN in server/dienst.mjs)
  // Folien für Kapitellisten: je Abruf bis zu 6 (Anfrage zu 3 wie KAPITEL in server/dienst.mjs), die ersten 8 Seiten ganz (dort steht
  // die Gliederung), danach je Seite nur die erste Zeile (meist der Folientitel, zeigt, wo ein Kapitel beginnt), höchstens 60 000 Zeichen
  const KAPITEL_JE_ABRUF = 6, KAPITEL_GANZ = 8, KAPITEL_ZEICHEN = 60000;
  // Bisherige Listen aus den Lernplan-Notizen im Stand: Grenzen wie kapitel.json (docs/daten-v1.md), zusammen höchstens 150 000
  // Zeichen, damit der Stand unter der Grenze des Dienstes bleibt (512 KB verschlüsselt, mit dem Auszug aus dem Tresor)
  const KAPITEL_NR = /^[0-9A-Z][0-9A-Za-z.]{0,7}$/, KAPITEL_MAX = 40, LISTEN_ZEICHEN = 150000;
  // PDFs zum Knopf „Zusammenfassen“: Stücke und Grenze wie PDF.teil und PDF.bytes in server/dienst.mjs; ab PDF_GROSS fragt der
  // Knopf (das Hochladen dauert)
  const PDF_TEIL = 8 * 1024 * 1024, PDF_MAX = 500 * 1024 * 1024, PDF_GROSS = 20 * 1024 * 1024;
  // Grob geschätzte Kosten einer Zusammenfassung mit Opus 5.5 (4 $ je Mio. Token Eingabe, 20 $ Ausgabe): der Text (etwa 3,5
  // Zeichen je Token), mit PDF dazu je Seite etwa 1500 Token für das Bild (gemessen an Folien und Übungen), etwa 4000 Token
  // Ausgabe. Ein Pro-Abo bekommt grob ein Zwanzigstel von Max 20x (etwa 8000 $ im Monat), verteilt auf etwa 146
  // Fünf-Stunden-Fenster. → Anteil an einem Fenster (0.05 = 5 %); ab PDF_FRAGEN fragt der Knopf nach. Preise: Stand 24.10.2026
  // (Preisliste der Claude-API). lauf.mjs nimmt den Alias „opus“, also das jeweils neueste Opus; bei einem neuen Modell die Preise
  // hier prüfen (Checkliste in docs/release.md)
  const PRO_FENSTER_USD = 8000 / 20 / 146, PDF_FRAGEN = 0.05;
  const pdfKosten = (seiten, zeichen, mitPdf) => (((mitPdf ? (seiten || 0) * 1500 : 0) + (zeichen || 0) / 3.5) * 4e-6 + 4000 * 20e-6) / PRO_FENSTER_USD;
  const ERLEDIGT_TAGE = 60, LAEUFE = 20, HINWEISE = 30;
  const NACHSENDEN_TAGE = 1;        // so lange, bis ein älterer Server sich selbst aktualisiert hat (täglich)
  const HINWEIS_NEU_TAGE = 14;      // ältere Hinweise zählen nie als neu (etwa auf einem neuen Gerät)
  const UNERREICHBAR_TAGE = 3;      // so lange nicht erreichbar: Zeile rät zur Einrichtung (Server weg oder neue Adresse)
  const VERSION_TAGE = 3;           // so lange keine neue Version auf dem Server, obwohl es eine gibt: ebenso
  // Gründe in aktualisierung.grund (server/dienst.mjs und studium-server), andere gelten als "unbekannt"
  const AKTUALISIERUNG_GRUENDE = ["github", "pruefsumme-fehlt", "signatur-fehlt", "herunterladen", "pruefsumme", "signatur", "paket", "version",
    "installieren", "pakete", "kein-paket", "aelter", "zurueckgerollt", "mindestversion"];
  const ZUGANG_TAGE = 3;            // so lange nimmt der Server den Schlüssel nicht an (401): kein Abruf mehr von selbst
  // Takt des Servers: Werte wie TAKT in server/dienst.mjs, der erste ist der Standard
  const TAKT_WAHL = {
    uni_postfach: [[15, "alle 15 Minuten"], [30, "alle 30 Minuten"], [60, "stündlich"]],
    gmail: [[3, "dreimal am Tag"], [1, "einmal am Tag"], [0, "nie"]],
  };
  const taktWert = (k, w) => { const n = w == null || String(w).trim() === "" ? NaN : Number(w); return TAKT_WAHL[k].some((x) => x[0] === n) ? n : TAKT_WAHL[k][0][0]; };
  // Frontmatter der Einstellungen → { uni_postfach, gmail }
  const taktAus = (fm) => ({ uni_postfach: taktWert("uni_postfach", (fm || {}).server_uni_postfach), gmail: taktWert("gmail", (fm || {}).server_gmail) });
  const GEHEIM_PRAEFIX = "studium-autopilot-server-";
  // rueck: was der letzte Abruf an vorhandenen Notizen geändert hat (Rückgängig); behalten: To-dos, deren Zusammenführen du
  // zurückgenommen hast (Kennungen, damit der Server sie nicht noch einmal zusammenführt)
  const L = { status: "eba-server-status", abruf: "eba-server-abruf", gesendet: "eba-server-gesendet", gesehen: "eba-server-gesehen",
    rueck: "eba-server-rueckgaengig", behalten: "eba-server-todo-behalten", riegel: "eba-server-signatur", umzug: "eba-server-umzug" };
  const RUECK_HOECHSTENS = 200, RUECK_BYTES = 200000, BEHALTEN_HOECHSTENS = 500;
  const SCHLUESSEL = /^[A-Za-z0-9_-]{43}$/; // 32 Byte, base64url
  const GERAET_ID = /^[A-Za-z0-9_-]{22}$/; // Kennung eines Geräts mit eigenen Schlüsseln (16 Byte, wie server/geraete.mjs)
  const GERAETE_HOECHSTENS = 30; // wie GERAETE in server/geraete.mjs
  const UMZUG_WARTEN = 6 * 60 * MIN; // ein Server ohne Schlüssel je Gerät (404): so lange nicht noch einmal umziehen
  const CODE = /^[A-HJ-NP-Z2-9]{5}-?[A-HJ-NP-Z2-9]{5}$/; // wie server/verbinden.mjs
  const DATEINAME = /^[0-9A-Za-z][0-9A-Za-z._-]{0,119}\.json$/; // wie server/dienst.mjs
  const ID = /^c-[0-9a-f]{20}$/; // wie idAus in server/eingang.mjs
  const TODO_ID = /^t-[0-9a-z]{1,13}$/; // wie TODO_ID in server/eingang.mjs
  const AUFGABE = /^([\s>]*[-*+] )\[ \] +(\S.*)$/; // offene Aufgabe wie in todos.js
  const KANAL = "studium-autopilot/kanal/v1/";
  // Sätze zu Fehlern eines Abrufs (Status fehler, Zeile)
  const FEHLER = {
    zugang: "Dein Server kennt dieses Gerät nicht mehr. Bitte neu verbinden.",
    erneuert: "Dein Server hat neue Schlüssel. Verbinde dieses Gerät mit einem Code.",
    uhr: "Die Uhr dieses Geräts geht falsch. Stell sie richtig, dann klappt es wieder.",
    alt: "Dein Server kann das erst nach seinem nächsten Update. Er aktualisiert sich täglich.",
    gesperrt: "Dein Server sperrt gerade nach zu vielen Fehlversuchen. Es geht in 10 Minuten weiter.",
    paket: "Die Daten deines Servers ließen sich nicht entschlüsseln. Bitte neu verbinden.",
    netz: "Dein Server ist gerade nicht erreichbar.",
    intern: "Beim Übernehmen ging etwas schief. Der nächste Abruf versucht es erneut.",
  };
  const ENTFAELLT_ZENTRAL = "> Dieser Termin steht nicht mehr in den zentralen Daten. Deine Notizen unten bleiben.";
  const ENTFAELLT_SERVER = "> Laut deinem Server entfällt dieser Termin. Deine Notizen unten bleiben.";
  // Text zum Einfügen in Claude Code (Tab „Code“ in Claude Desktop), Knopf „Prompt kopieren“ (gleicher Wortlaut wie im README,
  // „Für Technische“). Die Anleitung kommt aus dem Tag des neuesten Releases, nie von main: Sie lädt dann genau das Server-Paket
  // ihrer Version. Landet der Prompt im Chat statt in Claude Code, sagt Claude nur, wie man wechselt (Skill, „Zuerst“): Die
  // Einrichtung braucht den eingebauten Browser von Claude Code.
  const PROMPT = "Richte mir den eigenen Server für Studium Autopilot ein oder setz die Einrichtung fort (github.com/studium-autopilot/ecoba).\n" +
    "Öffne dazu https://github.com/studium-autopilot/ecoba/releases/latest, nimm die Versionsnummer daraus (vX.Y.Z) und lies aus\n" +
    "genau dieser Version https://github.com/studium-autopilot/ecoba/blob/vX.Y.Z/server/skill/server-einrichten/SKILL.md und die\n" +
    "Dateien daneben. Bist du nicht Claude Code (Tab „Code“ in Claude Desktop), sag mir nur, wie ich dorthin wechsle, wie es\n" +
    "dort unter „Zuerst“ steht, und fang nicht an. Steht in diesem Chat schon eine ältere Anleitung, gilt nur diese. Führe mich\n" +
    "Schritt für Schritt.";
  // LiveSync (seit 0.5.7): Der Server gleicht auf Wunsch den Tresor zwischen Windows, iPhone und iPad ab. Nur auf einem
  // verbundenen Gerät, und nur solange LiveSync hier noch nicht läuft, steht im Fenster „Eigener Server“ der Knopf
  // „Prompt kopieren“ mit diesem Text (Ablauf im Skill: server/skill/server-einrichten/livesync.md).
  const LIVESYNC_PROMPT = "Richte LiveSync auf meinem eigenen Server für Studium Autopilot ein, damit mein Tresor zwischen meinen Geräten abgleicht\n" +
    "(github.com/studium-autopilot/ecoba). Öffne dazu https://github.com/studium-autopilot/ecoba/releases/latest, nimm die\n" +
    "Versionsnummer daraus (vX.Y.Z) und lies aus genau dieser Version\n" +
    "https://github.com/studium-autopilot/ecoba/blob/vX.Y.Z/server/skill/server-einrichten/SKILL.md und die Dateien daneben,\n" +
    "dann „LiveSync einrichten“. Bist du nicht Claude Code (Tab „Code“ in Claude Desktop), sag mir nur, wie ich dorthin\n" +
    "wechsle, wie es in SKILL.md unter „Zuerst“ steht, und fang nicht an. Führe mich Schritt für Schritt.";
  // Was das Fenster zu LiveSync zeigt: null (nicht verbunden, oder LiveSync läuft hier schon) | { titel, text }.
  // livesync: Wert des Servers („an“, „aus“, „unbekannt“ bei älteren Servern; die Anleitung aktualisiert sie zuerst)
  const livesyncAngebot = ({ verbunden, hier, livesync }) => {
    if (!verbunden || hier) return null;
    if (livesync === "an") {
      return { titel: "Dieses Gerät abgleichen", text: "LiveSync läuft schon auf deinem Server. Kopier den Prompt und füg ihn in Claude Desktop im Tab „Code“ ein: Claude bringt deinen Tresor auch auf dieses Gerät." };
    }
    return { titel: "Windows und iPhone abgleichen", text: "Dein Server kann deinen Tresor zwischen Windows, iPhone und iPad abgleichen, kostenlos und ohne iCloud. Kopier den Prompt und füg ihn in Claude Desktop im Tab „Code“ ein: Claude richtet alles ein und sagt dir, wo du tippen musst." };
  };

  // ---------- Kleine Helfer ----------
  const s10 = (v) => { const m = String(v == null ? "" : v).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? m[0] : ""; };
  const tage = (a, b) => { const x = a.split("-").map(Number), y = b.split("-").map(Number); return Math.round((new Date(y[0], y[1] - 1, y[2]) - new Date(x[0], x[1] - 1, x[2])) / 864e5); };
  const isoOk = (s) => typeof s === "string" && s.length <= 40 && !isNaN(Date.parse(s));
  const wahl = (v, erlaubt) => (erlaubt.indexOf(v) >= 0 ? v : "unbekannt");
  const pad2 = (n) => String(n).padStart(2, "0");
  // Kurzer, stabiler Hash (FNV-1a, 32 Bit): Prüfsumme je Termin und Name des Schlüsselbund-Eintrags
  // ---------- Begleitnotizen ----------
  const ARTEN_SENDEN = ["Folien", "Skript", "Übung", "Tutorium", "Lab", "Lösung", "Altklausur", "Literatur"]; // Lehrmaterial; nie Mitschriften, Scans, eigene Lösungen
  // Text eines Punkts: rein, ohne Links, HTML, Templater oder Code (der Server prüft das auch; hier noch einmal, er könnte fremd sein).
  // Erst fallen unsichtbare Zeichen weg (reinerText), dann Bilder; Markdown-Links behalten nur ihren Text, HTML-Entitäten und
  // Code-Zäune (``` und ~~~) fallen weg, ebenso MathJax-Befehle für Links und HTML (TEX_HTML, etwa \href). Links im Fließtext bleiben nur auf PUNKT_DOMAINS stehen (linksEntschaerfen), und „](“, „][“
  // und „]:“ bekommen ein Leerzeichen: So wird auch aus verschachtelten Klammern kein Link, kein Bild und keine Link-Definition.
  // Eine Unterlage oder ein fremder Server macht so kein Klickziel und kein Bild, das beim Öffnen der Notiz nach außen lädt.
  const PUNKT_DOMAINS = ["uni-tuebingen.de", "ffwtuebingen.de", "core-econ.org"]; // nicht doi.org: leitet überallhin weiter
  // Links im Fließtext. Obsidian macht aus „https://…“ (auch „https:/…“, „https:…“), „www.…“ (die Lesefassung auch mitten im
  // Wort) und „domain.de/…“ einen Link, im Bearbeiten-Modus bis zum nächsten Leerzeichen oder „<“; „file:…“ öffnet es ohne Rückfrage,
  // wenn die Datei im Tresor liegt (andere Schemata wie „smb://“ nur nach Rückfrage). Ein Link bleibt nur, wenn er http(s) ist,
  // ohne Name, Kennwort und Port vor dem Host, der Host nur aus a–z, 0–9, „.“ und „-“ (eine HTML-Entität darin machte die
  // Lesefassung zu einem anderen Host), auf einer Domain der Liste, und dann so, wie der Browser ihn liest (new URL), mit
  // Markdown-Zeichen als %-Kodierung. Sonst bleibt nur der Name des Hosts (linkName: ohne führendes „www.“, nie drei „w“
  // hintereinander, nie an ein Wort davor gehängt, damit daraus kein neuer „www.“-Link wird); bei „domain.de/…“ ohne Schema kommt
  // ein Leerzeichen vor das „/“, und der Rest wird weiter durchsucht; „file:“, „data:“ und „jar:“ fallen ganz weg. Kein Klickziel
  // (Phishing aus einer Mail) und kein Abrufziel für Claude. Satzzeichen am Ende gehören nicht zum Link. Eine Schleife ohne
  // Rekursion, jedes Zeichen nur einmal angesehen (lange Eingaben). Gleicher Code in zentral.js, server.js und server/eingang.mjs
  // (tests/link-filter.test.js prüft alle drei).
  const LINK = /https?:\/{0,3}[^\s<]*|(?:\b|_)(?:file|data|jar):[^\s<]+|\b[a-z][a-z0-9+.-]{1,30}:\/\/[^\s<]*|www\d{0,3}\.[^\s<]*|(^|[^a-z0-9-])((?:[a-z0-9-]+\.)+[a-z]{2,24})(?=\/)/gi;
  const linkDomainOk = (h, domains) => /^(?:[a-z0-9-]+\.)+[a-z0-9-]+$/.test(h) && domains.some((d) => h === d || h.endsWith("." + d));
  const linkName = (h) => h.replace(/^(?:www\d{0,3}\.)+/i, "").replace(/w{3,}/gi, "ww").replace(/[^a-z0-9.-]+/gi, " ");
  const linkKuerzen = (url) => {
    let ende = url.length, zu = url.split(")").length - 1;
    const auf = url.split("(").length - 1;
    while (ende > 0 && /[`*!()[\]{};:'".,<>?«»“”‘’„‚]/.test(url[ende - 1]) && !(url[ende - 1] === ")" && auf >= zu)) {
      if (url[ende - 1] === ")") zu--;
      ende--;
    }
    return [url.slice(0, ende), url.slice(ende)];
  };
  // Link bis zum nächsten Leerzeichen → was im Text dafür steht
  const linkPruefen = (roh, domains) => {
    const [url, rest] = linkKuerzen(roh);
    if (/^_?(?:file|data|jar):/i.test(roh)) return " ";
    let u = null;
    try { u = new URL(/^https?:|^[a-z][a-z0-9+.-]*:\/\//i.test(url) ? url : "https://" + url); } catch (e) { return " " + rest; }
    const host = u.hostname.toLowerCase();
    if (/^https?:$/.test(u.protocol) && !u.username && !u.password && !u.port && linkDomainOk(host, domains)) {
      const pfad = (u.pathname + u.search + u.hash).replace(/%(?![0-9a-f]{2})|[[\]()'"*!$^{}|`\\]/gi, (z) => "%" + z.charCodeAt(0).toString(16).toUpperCase());
      return u.protocol + "//" + host + pfad + rest;
    }
    return linkName(host) + rest;
  };
  const linksEntschaerfen = (s, domains) => {
    const t = String(s), re = new RegExp(LINK.source, "gi");
    let aus = "", bis = 0, m;
    // ein Name oder Link direkt hinter einem Wort („xwww“ + „.evil.com“) ergäbe einen neuen Link: dann ein Leerzeichen dazwischen
    const anhaengen = (vor, neu) => {
      aus += vor;
      aus += /[a-z0-9]$/i.test(aus) && /^[a-z0-9.-]/i.test(neu) ? " " + neu : neu;
    };
    while ((m = re.exec(t))) {
      if (!m[2]) {
        anhaengen(t.slice(bis, m.index), linkPruefen(m[0], domains));
        bis = re.lastIndex;
        continue;
      }
      // „domain.de/…“ ohne Schema: auf einer erlaubten Domain der ganze Link, sonst nur der Name und ein Leerzeichen vor dem „/“
      const start = m.index + m[1].length;
      if (linkDomainOk(m[2].toLowerCase(), domains)) {
        const w = /[^\s<]*/y;
        w.lastIndex = start;
        const roh = w.exec(t)[0];
        anhaengen(t.slice(bis, start), linkPruefen(roh, domains));
        bis = start + roh.length;
      } else {
        anhaengen(t.slice(bis, start), linkName(m[2]) + " ");
        bis = start + m[2].length;
      }
      re.lastIndex = bis;
    }
    return aus + t.slice(bis);
  };
  // Zeichenreferenzen für Buchstaben, Ziffern, „+“, „.“, „-“ und „:“ werden das Zeichen, für Leerraum und Steuerzeichen ein
  // Leerzeichen: Obsidian entschlüsselt sie in einem Link, ein Browser übergeht Leerraum vor dem Schema. Der Text sieht danach gleich
  // aus, und LINK und ZIEL sehen das Schema so, wie es wirkt („javascript&colon;“, „&#106;avascript:“). Andere Referenzen bleiben.
  const ZEICHEN_REF = /&#(?:(\d{1,7})|[xX]([0-9a-fA-F]{1,6}));?|&(colon|period|plus|Tab|NewLine);/g;
  const REF_NAME = { colon: ":", period: ".", plus: "+", Tab: " ", NewLine: " " };
  const zeichenRefs = (s) => String(s).replace(ZEICHEN_REF, (m, d, h, name) => {
    if (name) return REF_NAME[name];
    const c = d ? Number(d) : parseInt(h, 16);
    if (c <= 0x20 || (c >= 0x7f && c <= 0x9f)) return " ";
    return c < 0x7f && /[a-z0-9+.:-]/i.test(String.fromCharCode(c)) ? String.fromCharCode(c) : m;
  });
  // Linkziele: Markdown liest ein Ziel hinter „](“ und „]:“ (Link, Definition, auch in „<…>“) und direkt hinter „<“ (Link in
  // spitzen Klammern), davor Leerraum. Dort bleibt nur http(s), das linksEntschaerfen schon geprüft hat; jedes andere Schema
  // (javascript:, vbscript:, data:, file:, obsidian: …) wird reiner Text: „](“ und „]:“ bekommen ein Leerzeichen nach dem „]“, ein
  // „<“ davor wird ein Leerzeichen. Ein „\“ vor „+“, „.“, „-“ oder „:“ zählt nicht (Obsidian liest „\:“ im Ziel als „:“). Außerhalb
  // eines Ziels macht Obsidian aus „wort:x“ keinen Link (nur http(s), www. und domain.tld/, siehe LINK); dort fallen danach nur
  // „javascript:“ und „vbscript:“ weg (wie GEFAEHRLICH für Titel), „Hinweis:x“ bleibt. Gleicher Code in zentral.js, server.js und
  // server/eingang.mjs (tests/link-filter.test.js prüft alle drei).
  const ZIEL = /(\]\(|\]:|<)(\s*(?:<\s*)?)([a-z](?:[a-z0-9]|\\?[+.-])*)\\?:/gi;
  const fremdeZiele = (s) => String(s).replace(ZIEL, (m, auf, ws, schema) => (/^https?$/i.test(schema) ? m
    : (auf === "<" ? " " : auf[0] + " " + auf[1]) + ws.replace(/</g, " ") + m.slice(auf.length + ws.length)));
  // Zweite Sicherung beim Schreiben einer Notiz (Ausgabe-Kodierung): Was nach linksEntschaerfen noch nach Link, Link-Definition,
  // HTML oder Code aussieht, bekommt vor dem Zeichen, an dem Obsidian es erkennt, einen „\“: den Doppelpunkt hinter „http(s)“,
  // „file“, „data“, „jar“ und vor „/“, den Punkt hinter „www“ und vor „tld/“, „]“ vor „(“, „[“ oder „:“, „`“ und „<“, wenn danach
  // noch ein „>“ kommt (Tag oder Link in spitzen Klammern; in beiden wirkt kein „\“). Obsidian zeigt so einen „\“ in beiden
  // Ansichten nicht (nachgeprüft in Obsidian 1.14.5), der Text sieht also gleich aus; schon maskierte Zeichen bleiben, wie sie sind.
  // Erlaubte Links (genau so, wie linksEntschaerfen sie schreibt) bleiben stehen; maske maskiert den Text dazwischen vorher (mdText);
  // zu = Stelle des letzten „>“, wenn der Text nur ein Stück ist (formelnAussparen). Alles in einem Durchgang über den ganzen Text,
  // damit kein „\“ an einer Nahtstelle einen anderen aufhebt. Gleicher Code in zentral.js und server.js (tests/link-filter.test.js).
  const LINK_ZEICHEN = /\\[!-/:-@[-`{-~]|(https?|file|data|jar):(?=[/a-z0-9%])|:(?=\/)|(www\d{0,3})\.|\.(?=[a-z]{2,24}\/)|\](?=[(:[])|`|<(?=\S)/gi;
  const linkZeichenEntwerten = (s, domains, maske = (t) => t, zu = -1) => {
    const erlaubt = [];
    let text = "";
    let imWort = false; // im selben Wort wie ein erlaubter Link, dahinter
    String(s).split(/(https?:\/\/[^\s<]+)/).forEach((t, i) => {
      // Dort nimmt die Lesefassung alles bis zum nächsten „<“ in den Link auf, auch einen „\“ davor, und das „<“ gälte wieder:
      // Darum wird dort jedes „<“ zu „&lt;“.
      if (imWort) {
        const w = t.search(/\s/), wort = w < 0 ? t : t.slice(0, w);
        t = wort.replace(/</g, "&lt;") + t.slice(wort.length);
        imWort = w < 0;
      }
      if (!(i % 2 && linksEntschaerfen(t, domains) === t)) { text += maske(t); return; }
      // Satzzeichen dahinter (linkKuerzen) gehören nicht zum Link: LINK_ZEICHEN geht auch über sie, sonst bliebe etwa „](“ stehen
      const [url, rest] = linkKuerzen(t);
      erlaubt.push([text.length, text.length + url.length]);
      text += url + rest;
      imWort = true;
    });
    zu = Math.max(zu, text.lastIndexOf(">"));
    let k = 0; // erster erlaubter Link, der nicht vor der Stelle endet (die Treffer kommen der Reihe nach)
    return text.replace(LINK_ZEICHEN, (z, schema, www, i) => {
      while (k < erlaubt.length && erlaubt[k][1] <= i) k++;
      if (z[0] === "\\" || (z === "<" && i > zu) || (k < erlaubt.length && i >= erlaubt[k][0])) return z;
      return schema ? schema + "\\:" : www ? www + "\\." : "\\" + z;
    });
  };
  // Formeln ($…$ und $$…$$, erkannt wie in Obsidian: nicht mit Leerzeichen innen am Rand, nicht vor einer Ziffer, „\$“ zählt
  // nicht, ein „$“ in „[[…]]“ auch nicht) bleiben in einer Begleitnotiz stehen: Dort wirkt kein „\“ (er wäre sichtbar oder ein
  // TeX-Befehl), und Obsidian macht in einer Formel aus keiner Adresse einen Link. Links und HTML-Merkmale machen dort nur
  // MathJax-Befehle wie \href und \mmlToken (auch über \newcommand oder \let, die den Namen aber wörtlich brauchen); TEX_HTML
  // fällt überall weg (ein Befehl endet vor einem Nicht-Buchstaben, also entsteht dabei kein neuer), wie schon in punktText. „`“
  // wird vorher maskiert: Sonst wäre nach linkZeichen eine andere Stelle eine Formel als vorher. Der Text zwischen den Formeln
  // geht durch f(text, zu) (linkZeichenEntwerten).
  const FORMEL = /\\[!-/:-@[-`{-~]|\[\[[^[\]]*\]\]|\$\$[\s\S]*?\$\$|\$(?![\s$])(?:\\[\s\S]|[^\\$])*?(?:\\[\s\S]|[^\s\\$])\$(?!\d)/g;
  const TEX_HTML = ["href", "mmlToken", "data", "class", "cssId", "style", "bbox", "require", "unicode"];
  const ohneTexHtml = (s) => s.replace(/\\(?:[a-z]+|[\s\S]?)/gi, (m) => (TEX_HTML.includes(m.slice(1)) ? "" : m));
  const formelnAussparen = (s, f) => {
    const t = ohneTexHtml(String(s)).replace(/\\[!-/:-@[-`{-~]|`/g, (z) => (z === "`" ? "\\`" : z)), re = new RegExp(FORMEL.source, "g"), zu = t.lastIndexOf(">");
    let aus = "", bis = 0, m;
    while ((m = re.exec(t))) {
      if (m[0][0] !== "$") continue;
      aus += f(t.slice(bis, m.index), zu - bis) + m[0];
      bis = re.lastIndex;
    }
    return aus + f(t.slice(bis), zu - bis);
  };
  // Viel zu Langes wird vorher gekürzt: Die Muster brauchen bei langen Eingaben mehr als lineare Zeit
  const punktText = (v, max) => reinerText(fremdeZiele(linksEntschaerfen(ohneTexHtml(reinerText(zeichenRefs(v == null ? "" : v), Math.min(20000, max * 4 + 1000)))
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ").replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/&#?[a-z0-9]{1,10};/gi, " ").replace(/~{3,}/g, " ")
    .replace(/\[\[|\]\]|`|<%|%>|<\/?[a-z!][^>]*>|obsidian:\/\/\S*/gi, " "), PUNKT_DOMAINS)).replace(/(?:java|vb)script:/gi, " ").replace(/\](?=[(:[])/g, "] "), max);
  // Textfassung (Unterlagen/_Volltext/…, volltext.js) → reiner Text mit „[S. N]“ vor jeder Seite
  const volltextText = (roh) => {
    const aus = [];
    for (const z of String(roh == null ? "" : roh).replace(/\r\n/g, "\n").replace(/^---\n[\s\S]*?\n---\n/, "").split("\n")) {
      const s = z.match(/^> \[!eba-quelle\][-+]? [^\n]*?#page=(\d+)/);
      if (s) { aus.push("", `[S. ${s[1]}]`); continue; }
      if (/^# /.test(z) || /^Automatisch erzeugt/.test(z)) continue;
      aus.push(z.replace(/^>\s?/, ""));
    }
    return aus.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  };
  // Text mit Seitenmarken (volltextText) → für eine Kapitelliste: bis Seite ganz alles, danach je Seite „[S. N] <erste Zeile>“
  const kapitelText = (text, ganz) => {
    const aus = [];
    let seite = 0, erste = false;
    for (const z of String(text == null ? "" : text).split("\n")) {
      const m = z.match(/^\[S\. (\d+)\]$/);
      if (m) { seite = Number(m[1]); erste = true; aus.push(z); continue; }
      if (seite <= ganz) aus.push(z);
      else if (erste && z.trim()) { aus[aus.length - 1] += " " + z.trim().slice(0, 120); erste = false; }
    }
    return aus.join("\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, KAPITEL_ZEICHEN);
  };
  // Kapitelliste einer Lernplan-Notiz für den Stand (lesen = ctx.lernplan.kapitelLesen): nur zwischen „## Kapitel“ und „## Meine
  // Notizen“, nur Kapitel mit Nummer, je Kapitel nr, titel und Unterkapitel; ohne Häkchen, Links, Seiten und eigene Zeilen ohne
  // Nummer. Titel ohne die Zeichen, die kapitel.json verbietet; Grenzen wie dort. → [{ nr, titel, teile? }]
  const titelOk = (t) => t.length > 0 && t.length <= 140 && !/[[\]<>{}|\\`]/.test(t);
  const listeAusNotiz = (text, lesen) => {
    const z = String(text == null ? "" : text).replace(/\r\n/g, "\n");
    const ab = z.search(/^## Kapitel[ \t]*$/m), bis = z.search(/^## Meine Notizen/m);
    const teil = z.slice(Math.max(ab, 0), bis > ab ? bis : z.length);
    const kapitel = [], nrn = [];
    for (const k of lesen(teil)) {
      const titel = reinerText(String(k.titel || ""), 200);
      if (!KAPITEL_NR.test(String(k.nr)) || !titelOk(titel) || nrn.indexOf(k.nr) >= 0) continue;
      nrn.push(k.nr);
      const teile = (k.teile || []).map((t) => ({ nr: String(t.nr || ""), titel: reinerText(String(t.titel || ""), 200) }))
        .filter((t) => KAPITEL_NR.test(t.nr) && titelOk(t.titel)).slice(0, KAPITEL_MAX);
      kapitel.push(teile.length ? { nr: k.nr, titel, teile } : { nr: k.nr, titel });
      if (kapitel.length >= KAPITEL_MAX) break;
    }
    return kapitel;
  };
  // Notiz neben der PDF ergänzen (Regeln wie unterlagen.js: Abschnitte über dem PDF-Kasten, nie leere Abschnitte oder Punkte).
  // bn = { wichtigste: [{ begriff, text, seite, bis }], zu_tun: [{ text, frist, seite, bis }], fragen: [{ text, seite, bis }] },
  // pdfName = Dateiname der PDF
  // → neuer Text oder null, wenn sich nichts ändert
  // Gehört „Das Wichtigste“ zu einer früheren Fassung der Datei, steht die neue Zusammenfassung an seiner Stelle und die frühere
  // eingeklappt darunter (fassung.js einklappen).
  const PLATZHALTER = /^\s*(?:[-*]\s*(?:\[ \]\s*)?)?$/;
  const begleitnotizErgaenzen = (text, bn, pdfName) => {
    let zeilen = String(text == null ? "" : text).replace(/\r\n/g, "\n").split("\n");
    let start = 0;
    if (zeilen[0] === "---") { const e = zeilen.indexOf("---", 1); if (e > 0) start = e + 1; }
    const istPdf = (z) => /^>\s*\[!eba-pdf\]/.test(z);
    const pdfBox = () => { for (let i = start; i < zeilen.length; i++) if (istPdf(zeilen[i])) return i; return -1; };
    const abschnitt = (name) => {
      let k = -1;
      for (let i = start; i < zeilen.length && k < 0; i++) if (zeilen[i].trim() === "## " + name) k = i;
      if (k < 0) return null;
      let b = k + 1;
      while (b < zeilen.length && !/^#{1,2} /.test(zeilen[b]) && !istPdf(zeilen[b])) b++;
      return { von: k + 1, bis: b };
    };
    const inhalt = (a) => zeilen.slice(a.von, a.bis);
    const nurPlatzhalter = (a) => inhalt(a).every((z) => PLATZHALTER.test(z));
    // verglichen ohne die „\“ von linkZeichen, damit Zeilen einer früheren Fassung mitzählen
    const klein = (s) => s.replace(/\\([!-/:-@[-`{-~])/g, "$1").toLowerCase();
    const fehlend = (a, neu) => neu.filter((z) => { const t = klein(z.replace(/^- (?:\[ \] )?/, "")); return !inhalt(a).some((x) => klein(x).indexOf(t) >= 0); });
    let geaendert = false;
    const ersetzen = (a, neu) => { zeilen.splice(a.von, a.bis - a.von, ...neu, ""); geaendert = true; };
    const anhaengen = (a, neu) => {
      let i = a.bis;
      while (i > a.von && (!zeilen[i - 1].trim() || PLATZHALTER.test(zeilen[i - 1]))) i--;
      zeilen.splice(i, a.bis - i, ...neu, "");
      geaendert = true;
    };
    const anlegen = (name, neu, nach, vor) => {
      let pos = -1;
      for (const n of nach) { const a = abschnitt(n); if (a) pos = a.bis; }
      for (const n of vor) { const a = pos < 0 ? abschnitt(n) : null; if (a) pos = a.von - 1; } // vor der Überschrift des folgenden Abschnitts
      if (pos < 0) {
        const p = pdfBox();
        if (p >= 0) pos = p;
        else { while (zeilen.length > start && !zeilen[zeilen.length - 1].trim()) zeilen.pop(); pos = zeilen.length; } // ans Ende, ohne Leerzeilen davor
      }
      const block = ["## " + name, ...neu, ""];
      if (pos > start && zeilen[pos - 1].trim()) block.unshift("");
      zeilen.splice(pos, 0, ...block);
      geaendert = true;
    };
    const tt = (d) => `${d.slice(8, 10)}.${d.slice(5, 7)}.`;
    const seiten = (p) => (p.seite ? ` → [[${pdfName}#page=${p.seite}|S. ${p.seite}${p.bis ? "–" + p.bis : ""}]]` : "");
    const lz = (s) => formelnAussparen(s, (t, zu) => linkZeichenEntwerten(t, PUNKT_DOMAINS, undefined, zu));
    const W = (bn.wichtigste || []).map((p) => `- ${p.begriff ? `**${lz(p.begriff)}:** ` : ""}${lz(p.text)}${seiten(p)}`);
    const T = (bn.zu_tun || []).map((p) => `- [ ] ${lz(p.text)}${p.frist ? ` (bis ${tt(p.frist)})` : ""}${seiten(p)}`);
    const F = (bn.fragen || []).map((p) => `- [ ] ${lz(p.text)}${seiten(p)}`);
    const regeln = [["Das Wichtigste", W, [], ["Zu tun", "Offene Fragen"], "nur-leer"], ["Zu tun", T, ["Das Wichtigste"], ["Offene Fragen"], "ergaenzen"],
      ["Offene Fragen", F, ["Das Wichtigste", "Zu tun"], [], "ergaenzen"]];
    const Fa = ctx.user && ctx.user.fassung;
    const eingeklappt = W.length && Fa ? Fa.einklappen(zeilen.join("\n"), W) : null;
    if (eingeklappt != null) { zeilen = eingeklappt.split("\n"); geaendert = true; }
    for (const [name, neu, nach, vor, art] of regeln) {
      if (!neu.length || (name === "Das Wichtigste" && eingeklappt != null)) continue;
      const a = abschnitt(name);
      if (!a) anlegen(name, neu, nach, vor);
      else if (nurPlatzhalter(a)) ersetzen(a, neu);
      else if (art === "ergaenzen") { const f = fehlend(a, neu); if (f.length) anhaengen(a, f); }
    }
    return geaendert ? zeilen.join("\n") : null;
  };
  // Begleitnotiz von Claude (vom Server oder direkt, claude.js) → nur erlaubte Felder in ihren Grenzen, reiner Text (punktText)
  const begleitnotizSauber = (bn) => {
    bn = bn || {};
    // felder: was außer text und Seiten (seite, bis) erlaubt ist, „frist“ und/oder „begriff“
    const liste = (l, max, n, felder = []) => (Array.isArray(l) ? l : []).slice(0, n).map((p) => {
      const text = punktText(p && typeof p === "object" ? p.text : p, max);
      const x = { text };
      if (p && Number.isInteger(p.seite) && p.seite > 0 && p.seite < 10000) x.seite = p.seite;
      if (x.seite && Number.isInteger(p.bis) && p.bis > x.seite && p.bis < 10000) x.bis = p.bis;
      if (felder.includes("frist") && p && s10(p.frist) === p.frist) x.frist = p.frist;
      if (felder.includes("begriff") && p && typeof p.begriff === "string") {
        const b = punktText(p.begriff.replace(/\*/g, " ").replace(/:\s*$/, ""), 60);
        if (b) x.begriff = b;
      }
      return x;
    }).filter((p) => p.text);
    return { wichtigste: liste(bn.wichtigste, 300, 12, ["begriff"]), zu_tun: liste(bn.zu_tun, 200, 12, ["frist"]), fragen: liste(bn.fragen, 200, 10) };
  };

  // Knopf „Zusammenfassen“: Wunsch in den Eigenschaften der Notiz (zusammenfassung_angefordert: Zeitpunkt UTC, „2026-10-20T17:50Z“)
  const WUNSCH = "zusammenfassung_angefordert", WUNSCH_PDF = "zusammenfassung_pdf"; // dazu true: mit der PDF selbst
  const wunschVon = (fm) => {
    const w = fm && fm[WUNSCH];
    const s = w instanceof Date ? w.toISOString() : String(w == null ? "" : w).trim();
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) ? s.slice(0, 16) : "";
  };
  // Wunsch aus dem Text der Notiz entfernen (nur die Zeilen in den Eigenschaften); → Text
  const wunschWeg = (text) => {
    const m = /^---\n([\s\S]*?)\n---(\n|$)/.exec(String(text));
    if (!m) return text;
    const fm = m[1].split("\n").filter((z) => z.indexOf(WUNSCH + ":") !== 0 && z.indexOf(WUNSCH_PDF + ":") !== 0).join("\n");
    return fm === m[1] ? text : "---\n" + fm + "\n---" + m[2] + text.slice(m[0].length);
  };

  const hash32 = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); };
  // Rückgängig: was sich zwischen alt und neu geändert hat, als ein Block von Zeilen → { von, alt: [Zeilen], neu: [Zeilen] }
  const zeilenDiff = (alt, neu) => {
    const a = alt.split("\n"), n = neu.split("\n");
    let von = 0;
    while (von < a.length && von < n.length && a[von] === n[von]) von++;
    let ea = a.length, en = n.length;
    while (ea > von && en > von && a[ea - 1] === n[en - 1]) { ea--; en--; }
    return { von, alt: a.slice(von, ea), neu: n.slice(von, en) };
  };
  // Text nach dem Abruf → Text davor, oder null, wenn der Block nicht mehr so dasteht
  const zeilenZurueck = (text, a) => {
    if (!Number.isInteger(a.von) || a.von < 0 || !Array.isArray(a.alt) || !Array.isArray(a.neu)) return null;
    const z = text.split("\n");
    for (let i = 0; i < a.neu.length; i++) if (z[a.von + i] !== a.neu[i]) return null;
    return z.slice(0, a.von).concat(a.alt.map(String), z.slice(a.von + a.neu.length)).join("\n");
  };
  // die neuesten Einträge, höchstens RUECK_HOECHSTENS und zusammen RUECK_BYTES (als JSON)
  const rueckKappen = (liste) => {
    const aus = liste.slice(-RUECK_HOECHSTENS);
    let groesse = JSON.stringify(aus).length;
    while (aus.length && groesse > RUECK_BYTES) groesse -= JSON.stringify(aus.shift()).length + 1;
    return aus;
  };
  // Steuer- und unsichtbare Richtungszeichen → Leerzeichen; Zeichen, die nur unsichtbar Text tragen können (weiches Trennzeichen,
  // Variantenwähler, Hangul-Füller), fallen ganz weg; dann Leerraum zusammenfassen, kürzen (wie STEUER und WEG in zentral.js)
  const unsichtbar = (c) => c < 32 || c === 127 || c === 0x61c || c === 0x180e || (c >= 0x200b && c <= 0x200f) || c === 0x2028 || c === 0x2029 ||
    (c >= 0x202a && c <= 0x202e) || (c >= 0x2060 && c <= 0x2064) || (c >= 0x2066 && c <= 0x2069) || c === 0xfeff || (c >= 0xfff9 && c <= 0xfffb);
  const versteckt = (c) => c === 0xad || c === 0x34f || c === 0x115f || c === 0x1160 || c === 0x17b4 || c === 0x17b5 || (c >= 0x180b && c <= 0x180d) ||
    c === 0x180f || c === 0x3164 || (c >= 0xfe00 && c <= 0xfe0f) || c === 0xffa0;
  // Unicode-Tags (U+E0000–E007F) und Variantenwähler U+E0100–E01EF: unsichtbar, tragen versteckten Text; als Ersatzpaar 0xDB40 + …
  const tagZeichen = (v, i) => v.charCodeAt(i) === 0xdb40 && ((v.charCodeAt(i + 1) >= 0xdc00 && v.charCodeAt(i + 1) <= 0xdc7f) ||
    (v.charCodeAt(i + 1) >= 0xdd00 && v.charCodeAt(i + 1) <= 0xddef));
  const reinerText = (v, max) => {
    if (typeof v !== "string") return "";
    let s = "";
    for (let i = 0; i < v.length; i++) {
      if (tagZeichen(v, i)) { i++; continue; }
      const c = v.charCodeAt(i);
      if (!versteckt(c)) s += unsichtbar(c) ? " " : v.charAt(i);
    }
    return s.replace(/\s+/g, " ").trim().slice(0, max);
  };

  // ---------- Zugangsdaten (eine Heuristik) ----------
  // Was nach Zugangsdaten aussieht, geht nie an den Server: weder ein To-do (Text oder Name seiner Notiz) noch ein Termin (Titel) im
  // Auszug aus dem Tresor. Nach bestem Bemühen, kein Versprechen. Die Liste ist an einer Stelle beschrieben
  // (docs/architektur/server.md, „Zugangsdaten“); server/dienst.mjs prüft mit seiner Liste noch einmal. Zuerst fallen unsichtbare
  // Zeichen ganz weg (Breiten-, Richtungs- und Tag-Zeichen, weiches Trennzeichen; als Leerzeichen trennten sie „Pass<U+200B>wort“),
  // dann NFKC (Vollbreite, Ligaturen).
  // GEHEIM: starke Wörter in jeder Groß- und Kleinschreibung (Passwort, Kennwort, PW, Zugangscode, Zugangsdaten,
  //   Einschreibeschlüssel, IBAN); GEHEIM_FORM: Schlüssel von Anthropic und GitHub, eine IBAN in ihrer Form (mit mindestens 10 Ziffern).
  // GENERISCH: Wörter, die auch sonst vorkommen (Login, Token, Code, PIN, TAN, Passcode, Key …), nur mit „:“, „=“, „ist“ oder
  //   „lautet“ und danach einem Wert wie ein Geheimnis (wertWieGeheim: mindestens 4 Zeichen, kein Modulcode wie B110, kein
  //   gewöhnliches Wort). Bei PIN, TAN, Token und Passcode zählt nach „:“ oder „=“ jeder Wert ab 4 Zeichen (außer einem Modulcode),
  //   auch ein Wort („PIN: Sommer“). OHNE_TRENNER: PIN, TAN, Passcode und Code (auch als Teil eines Wortes wie Türcode, Kopierer-PIN)
  //   direkt vor 4–8 Ziffern („PIN 1234“, „TAN 123456“). „Code: B110 Hausaufgabe“, „Login für Moodle“, „Token Economy“ und
  //   „Token ist Pflicht“ gehen also mit. Matrikelnummer nur mit einer Zahl aus 6–8 Ziffern.
  // Dazu die Erkennung der Kurspasswörter aus ilias.js (ohneKennwort: Passwort und Kennwort in jeder Schreibweise, auch mit Lücken
  //   und kyrillischen Doppelgängern, PW-Formen), wenn sie geladen ist; ihre schwachen Formen („Key: Wert“) bekommen nur, was
  //   GENERISCH nicht schon als harmlos erkannt hat (dort wird der Trenner vorher zum Leerzeichen). Vorher werden „[[“, „]]“ und „&“
  //   ersetzt und der Text auf 200 Zeichen gekürzt: Dann gibt ohneKennwort einen Text ohne Passwort-Marke unverändert zurück, und
  //   jede Abweichung heißt, dass es eine gefunden hat.
  const GEHEIM = /passw|kennw|password|\bpwd?\b|zugangs?\s?-?code|zugangsdaten|einschreibe\s?-?schl(?:ü|ue|u)ssel|\biban\b/i;
  const GEHEIM_FORM = /sk-ant-|\bghp_[A-Za-z0-9]|\bgithub_pat_/;
  const IBAN_FORM = /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,3})?\b/g;
  const GENERISCH = /(^|[^A-Za-zÄÖÜäöüß])(log-?in|token|codes?|pin|[im]?tan|passcode|key|pass|zugang|secret|kw|schl(?:ü|ue|u)ssel)(\s*[:=]\s*|\s+(?:ist|lautet)\s+)([^\s,;)\]}]+)/gi;
  const JEDER_WERT = /^(?:pin|[im]?tan|token|passcode)$/i;
  const OHNE_TRENNER = /(?:^|[^A-Za-zÄÖÜäöüß])(?:pin|[im]?tan|passcode)\s?-?\s?\d{4,8}(?!\d)|code\s?-?\s?\d{4,8}(?!\d)/i;
  const MATRIKEL = /matrikel\s?-?(?:nummer|nr\b)|\bmatr\.\s?-?nr\b/i;
  const MODULCODE = /^[A-Z]{1,3}\d{2,4}[a-z]?$/;
  const wertWieGeheim = (roh) => {
    const w = String(roh).replace(/[.!?:"“”'‘’]+$/, "").replace(/^["„“'‚‘]+/, "");
    if (w.length < 4 || MODULCODE.test(w)) return false;
    return !/^[A-Za-zÄÖÜäöüß]+(?:-[A-Za-zÄÖÜäöüß]+)*$/.test(w); // ein gewöhnliches Wort (auch mit Bindestrich) ist kein Wert
  };
  const geheimText = (v) => {
    const t = String(v == null ? "" : v);
    let s = "";
    for (let i = 0; i < t.length; i++) {
      if (tagZeichen(t, i)) { i++; continue; }
      const c = t.charCodeAt(i);
      if (c < 32 || c === 127) s += " ";
      else if (!versteckt(c) && !unsichtbar(c)) s += t.charAt(i);
    }
    try { s = s.normalize("NFKC"); } catch (e) { /* ohne normalize */ }
    return s.replace(/\s+/g, " ").trim();
  };
  // v = Text, ohneKennwort = ctx.ilias.ohneKennwort oder nichts → true, wenn er nach Zugangsdaten aussieht
  const siehtGeheimAus = (v, ohneKennwort) => {
    const t = geheimText(v);
    if (!t) return false;
    if (GEHEIM.test(t) || GEHEIM_FORM.test(t)) return true;
    if ((t.match(IBAN_FORM) || []).some((x) => x.replace(/\D/g, "").length >= 10)) return true;
    if (MATRIKEL.test(t) && /(?:^|\D)\d{6,8}(?!\d)/.test(t)) return true;
    if (OHNE_TRENNER.test(t)) return true;
    let wert = false;
    const harmlos = t.replace(GENERISCH, (ganz, vor, wort, trenner, w) => {
      const roh = String(w).replace(/[.!?:"“”'‘’]+$/, "");
      const jeder = JEDER_WERT.test(wort) && /[:=]/.test(trenner) && roh.length >= 4 && !MODULCODE.test(roh);
      if (jeder || wertWieGeheim(w)) { wert = true; return ganz; }
      return vor + wort + " " + w;
    });
    if (wert) return true;
    if (typeof ohneKennwort !== "function") return false;
    const p = harmlos.replace(/\[\[|\]\]/g, " ").replace(/&/g, "+").replace(/\s+/g, " ").slice(0, 200).trim();
    return !!p && ohneKennwort(p) !== p;
  };

  // ---------- Adresse ----------
  // Name eines eigenen Servers im Internet: so, wie ihn die Einrichtung vergibt (die IP mit Bindestrichen als Name bei einem Dienst,
  // der den Namen auf diese IP zeigen lässt, server/installieren.sh; auch mit Punkten), oder eine eigene Domain. Abgelehnt (seit
  // 02.11.2026): IP-Adressen (auch als Zahl wie 2130706433 oder hexadezimal, die new URL zu a.b.c.d macht; IPv6 in Klammern),
  // Namen ohne Punkt, mit Punkt am Ende oder mit Ziffern als Endung, Namen für besondere Zwecke oder nur fürs eigene Netz
  // (NUR_LOKAL: localhost, .test, .example, .invalid, .local, .internal, .lan, .home.arpa, .box wie fritz.box), bekannte Namen, die
  // immer auf das eigene Gerät zeigen (SCHLEIFE), und bei Diensten mit der IP im Namen (IP_IM_NAMEN: sslip und nip unter .io,
  // traefik.me) alles außer genau einer öffentlichen IPv4 (nicht privat, lokal, Link-local, CGNAT, der Bereich für Lasttests 198.18/15 oder Multicast).
  // Die Endung aus Buchstaben fängt auch Zahlenformen, die ein Gerät nicht umrechnet. Das ist nur eine Vorprüfung: Jeder andere
  // Name kann im DNS auf eine private Adresse zeigen. Dort schützt vor allem, dass https ein gültiges Zertifikat für genau diesen
  // Namen verlangt, das ein Rechner im eigenen Netz nicht hat.
  const NUR_LOKAL = ["localhost", "local", "localdomain", "internal", "lan", "home.arpa", "test", "example", "invalid", "box"];
  const SCHLEIFE = ["lvh.me", "localtest.me"];
  const IP_IM_NAMEN = /^(.+)\.(?:(?:sslip|nip)\.io|traefik\.me)$/, NUR_DIENST = /^(?:(?:sslip|nip)\.io|traefik\.me)$/;
  const IP4_IN_NAMEN = /^(\d{1,3})[.-](\d{1,3})[.-](\d{1,3})[.-](\d{1,3})$/;
  const ipPrivat = (a) => a[0] === 0 || a[0] === 10 || a[0] === 127 || (a[0] === 100 && a[1] >= 64 && a[1] <= 127) || (a[0] === 169 && a[1] === 254) ||
    (a[0] === 172 && a[1] >= 16 && a[1] <= 31) || (a[0] === 192 && a[1] === 168) || (a[0] === 198 && (a[1] === 18 || a[1] === 19)) || a[0] >= 224;
  const unter = (h, liste) => liste.some((t) => h === t || h.endsWith("." + t));
  const hostOk = (h) => {
    if (h.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:[a-z]{2,63}|xn--[a-z0-9-]{1,59})$/.test(h)) return false;
    if (unter(h, NUR_LOKAL) || unter(h, SCHLEIFE) || NUR_DIENST.test(h)) return false;
    const m = h.match(IP_IM_NAMEN);
    if (!m) return true;
    const ip = m[1].match(IP4_IN_NAMEN), a = ip ? ip.slice(1).map(Number) : null;
    return !!a && a.every((x) => x <= 255) && !ipPrivat(a);
  };
  // Nur https://<host> ohne Pfad, Port, Anmeldung oder Parameter, host nach hostOk; lokal (Tests) auch http://127.0.0.1:<port>.
  // → Ursprung oder ""
  const adresseNormal = (s, lokal) => {
    let u;
    try { u = new URL(String(s || "")); } catch (e) { return ""; }
    const lokalOk = !!lokal && u.protocol === "http:" && (u.hostname === "127.0.0.1" || u.hostname === "localhost");
    if ((u.protocol !== "https:" && !lokalOk) || u.username || u.password || (u.port && !lokalOk) || u.pathname !== "/" || u.search || u.hash) return "";
    if (!lokalOk && !hostOk(u.hostname)) return "";
    return u.protocol + "//" + u.host;
  };
  const hostVon = (adresse) => String(adresse || "").replace(/^https?:\/\//, "");
  // Eingetippte Adresse („Mit Code verbinden“): ohne https:// davor ergänzt, sonst wie adresseNormal → Ursprung oder ""
  const adresseEingabe = (s, lokal) => {
    const t = String(s == null ? "" : s).trim();
    return adresseNormal(/^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : "https://" + t, lokal);
  };
  // Eingetippter Code → „ABCDE-FGHJK“ (groß, ohne Leer- und Trennzeichen; ob er gilt, prüft CODE)
  const codeForm = (s) => {
    const c = String(s == null ? "" : s).toUpperCase().replace(/[^A-Z0-9]/g, "");
    return c.length === 10 ? c.slice(0, 5) + "-" + c.slice(5) : c;
  };
  // Wie ein Gerät zuletzt verbunden wurde (Herkunft des Codes, server/verbinden.mjs)
  const HERKUNFT = ["cloud-shell", "obsidian"];
  const HERKUNFT_TEXT = { "cloud-shell": "über die Cloud Shell", obsidian: "über Obsidian" };
  // Uhrzeit, an einem anderen Tag mit Datum: „14:23“ | „02.11., 09:15“
  const zeitText = (d, jetzt) => {
    const hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
    return d.toDateString() === jetzt.toDateString() ? hm : `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}., ${hm}`;
  };
  // Verbindungen von Geräten im Status (Server ab 02.11.2026, nur mit Schlüssel): grobes Netz wie server/verbinden.mjs (IPv4 /24,
  // IPv6 /48), Name, den das Gerät selbst nennt (nur Text, höchstens 40 Zeichen) → [{ zeit, herkunft, netz, geraet }], älteste zuerst
  const NETZ = /^[0-9a-f.:]{3,45}\/\d{1,3}$/;
  const verbindungenNormal = (roh) => (Array.isArray(roh) ? roh : []).filter((e) => e && isoOk(e.zeit) && HERKUNFT.indexOf(e.herkunft) >= 0)
    .map((e) => ({ zeit: new Date(e.zeit).toISOString(), herkunft: e.herkunft, netz: NETZ.test(String(e.netz || "")) ? String(e.netz) : "",
      geraet: reinerText(String(e.geraet || ""), 40) }))
    .sort((a, b) => (a.zeit < b.zeit ? -1 : a.zeit > b.zeit ? 1 : 0)).slice(-20);
  // Geräte mit eigenen Schlüsseln im Status (Server ab dieser Fassung, nur mit Schlüssel, server/geraete.mjs liste): Kennung, Name (nur
  // Text, höchstens 40 Zeichen), seit wann, zuletzt, herkunft (cloud-shell | obsidian | umzug), von (wer es hereinließ: Kennung eines
  // Geräts, cloud-shell oder gemeinsam), grobes Netz beim Verbinden, dieses (das fragende Gerät) → [{ id, name, seit, zuletzt, herkunft,
  // von, netz, dieses }], älteste zuerst | null (ein älterer Server nennt keine)
  const HERKUNFT_GERAET = ["cloud-shell", "obsidian", "umzug"];
  const geraeteNormal = (roh) => (!Array.isArray(roh) ? null : roh.filter((g) => g && GERAET_ID.test(String(g.id)) && isoOk(g.seit)).slice(0, GERAETE_HOECHSTENS)
    .map((g) => ({ id: String(g.id), name: reinerText(String(g.name || ""), 40), seit: new Date(g.seit).toISOString(),
      zuletzt: new Date(isoOk(g.zuletzt) ? g.zuletzt : g.seit).toISOString(), herkunft: HERKUNFT_GERAET.indexOf(g.herkunft) >= 0 ? g.herkunft : "",
      von: GERAET_ID.test(String(g.von || "")) || g.von === "cloud-shell" ? String(g.von) : "", netz: NETZ.test(String(g.netz || "")) ? String(g.netz) : "",
      dieses: g.dieses === true }))
    .sort((a, b) => (a.seit < b.seit ? -1 : a.seit > b.seit ? 1 : 0)));
  // Was mit dem Gerät id geht, wenn man es trennt (wie kaskade in server/geraete.mjs): die Geräte, die es hereinließ, auch über mehrere
  // Stufen, nie dieses (eigenes) → [Kennung] ohne id
  const geraeteMit = (liste, id, eigenes) => {
    const weg = [id];
    for (let i = 0; i < weg.length; i++) for (const g of liste) if (g.von === weg[i] && weg.indexOf(g.id) < 0 && g.id !== eigenes) weg.push(g.id);
    return weg.slice(1);
  };
  // Rückfrage vor dem Trennen eines anderen Geräts (g aus einzelheiten): Sie sagt, dass es danach einen neuen Code braucht, und was mit
  // ihm geht (g.mit: Geräte über seine Codes, Verbindungen der Claude-App aus ihnen; geraeteMit). Geht etwas mit, wählt man: alles
  // trennen oder nur dieses (das andere behält der Server). → { titel, text, knoepfe, behalten: (Nummer des Knopfs) → [Kennung] }
  const trennenFrage = (g) => {
    const mit = g.mit || { geraete: [], claudeApp: [] };
    const teile = mit.geraete.map((x) => (x.name ? `„${x.name}“` : "ein Gerät ohne Namen"))
      .concat(mit.claudeApp.length === 1 ? ["die Verbindung der Claude-App"] : mit.claudeApp.length ? [`${mit.claudeApp.length} Verbindungen der Claude-App`] : []);
    const name = g.ohneName ? "das Gerät" : `„${g.name}“`;
    const liste = teile.length > 1 ? teile.slice(0, -1).join(", ") + " und " + teile[teile.length - 1] : teile[0];
    return {
      titel: g.ohneName ? "Gerät trennen?" : `„${g.name}“ trennen?`,
      text: "Es holt danach nichts mehr von deinem Server. Willst du es wieder nutzen, verbindest du es mit einem neuen Code." +
        (teile.length ? ` Mit ihm getrennt wird, was über einen Code von ihm verbunden wurde: ${liste}. Gehört das dir, trenne nur ${name}.` : ""),
      knoepfe: teile.length ? ["Alles trennen", `Nur ${name} trennen`] : ["Trennen"],
      behalten: (wahl) => (wahl === 1 ? mit.geraete.map((x) => x.id).concat(mit.claudeApp) : []),
    };
  };
  // Woher ein Gerät kam, in Worten (liste: alle, für den Namen dessen, über dessen Code es kam)
  const geraetHerkunft = (g, liste, eigenes) => {
    if (g.herkunft === "cloud-shell") return "über die Cloud Shell";
    if (g.herkunft === "umzug") return "von früher übernommen";
    if (!GERAET_ID.test(g.von)) return "über Obsidian";
    if (g.von === eigenes) return "über Code von diesem Gerät";
    const v = liste.filter((x) => x.id === g.von)[0];
    return !v ? "über Code eines getrennten Geräts" : v.name ? `über Code von „${v.name}“` : "über Code eines Geräts ohne Namen";
  };
  // „203.0.113.0/24“ → „203.0.113.…“, „2001:db8:12::/48“ → „2001:db8:12:…“
  const netzText = (n) => (/\.0\/24$/.test(n) ? n.replace(/0\/24$/, "…") : /::\/\d+$/.test(n) ? n.replace(/:\/\d+$/, "…") : n);
  // Eine Verbindung in Worten: „02.11., 09:15 (über Obsidian, „iPad“, Anschluss 203.0.113.…)“
  const verbindungText = (e, jetzt) => `${zeitText(new Date(e.zeit), jetzt)} (${[HERKUNFT_TEXT[e.herkunft]].concat(e.geraet ? [`„${e.geraet}“`] : [],
    e.netz ? ["Anschluss " + netzText(e.netz)] : []).join(", ")})`;
  // Grenzen je Tag im Status (Server ab 02.11.2026, nur mit Schlüssel) → { tag, mails_zurueckgestellt, mails_verschoben,
  // quarantaene, quarantaene_geloescht, unterlagen_ausgelassen, kapitel_ausgelassen (Unterlagen bzw. Folien, an denen der Server
  // allein zweimal scheiterte und die er darum auslässt), ausgesetzt_gmail, ausgesetzt_unterlagen, ausgesetzt_kapitel (0 | 1: bis
  // morgen pausiert) } | null. Nur das liest das Plugin; Zahlen der Läufe, Fehlschläge und Zeichen sind für Studierende nicht da.
  const GRENZEN = ["mails_zurueckgestellt", "mails_verschoben", "quarantaene", "quarantaene_geloescht", "unterlagen_ausgelassen", "kapitel_ausgelassen"];
  const AUSGESETZT = ["ausgesetzt_gmail", "ausgesetzt_unterlagen", "ausgesetzt_kapitel"];
  const grenzenNormal = (roh) => {
    const g = roh && typeof roh === "object" ? roh : null;
    if (!g || !/^\d{4}-\d{2}-\d{2}$/.test(String(g.tag || ""))) return null;
    const aus = { tag: g.tag };
    for (const k of GRENZEN) aus[k] = Number.isInteger(g[k]) && g[k] > 0 && g[k] < 1e9 ? g[k] : 0;
    for (const k of AUSGESETZT) aus[k] = g[k] === 1 ? 1 : 0;
    return aus;
  };
  // „Mails durchsuchen“ zu früh (der Server lässt es höchstens alle paar Minuten und einige Male am Tag zu): wann es wieder geht
  const zuFruehText = (wieder, jetzt) => {
    const d = new Date(wieder || "");
    return "Dein Server hat gerade erst nach Mails gesucht." + (isNaN(d.getTime()) ? " Versuch es später wieder." : ` Wieder möglich ab ${zeitText(d, jetzt)}.`);
  };
  // Text unter dem Code für ein weiteres Gerät (r: { ablauf, adresse }): bis wann er gilt, was das neue Gerät tut, und die Adresse,
  // falls es danach fragt (ältere server.json ohne adresse)
  // Hinweis, wenn ein Link von außerhalb der App (c.extern) den Server verbinden oder sein Fenster öffnen will (auch verbindungen.js)
  const VON_AUSSEN = "Links von außerhalb von Obsidian verbinden keinen Server. Gib den Code unter Einstellungen & Hilfe → Verbindungen bei „Eigener Server“ ein.";
  // Die Adresse tippt das neue Gerät immer selbst ab (seit 02.11.2026; was in server.json steht, kann jedes Gerät mit Sync schreiben)
  const codeAnleitung = (r, jetzt) => `Gilt bis ${zeitText(new Date(r.ablauf), jetzt)} und nur einmal. Tippe auf dem neuen Gerät unter ` +
    `Verbindungen bei „Eigener Server“ auf „Mehr erfahren“ und gib dort den Code und diese Adresse ein: ${/^https:\/\//.test(r.adresse) ? hostVon(r.adresse) : r.adresse}`;

  // ---------- Claude-App (Connector) ----------
  // Verbindungen, wie der Server sie meldet (Antwort auf POST /v1/claude-app, Eingang claude_app, server.json): je Verbindung id
  // (Kennung der Anmeldung), seit, zuletzt (Zeit; in server.json nur der Tag), client (Name der App wie „claude.ai“, nur als Name)
  const CA_ID = /^[A-Za-z0-9_-]{1,64}$/, CA_CLIENT = /^[a-z0-9][a-z0-9.-]{0,39}$/i, TAG = /^\d{4}-\d{2}-\d{2}$/;
  const CA_HOECHSTENS = 20, CA_NEU_TAGE = 14, CA_PRUEFEN_TAGE = 3, CA_BEKANNT_TAGE = 30;
  // von: das Gerät, dessen Code die Verbindung einlöste (Kennung; trennt man es, geht die Verbindung mit)
  const caVerbindung = (e) => {
    if (!e || typeof e !== "object" || !CA_ID.test(String(e.id)) || !isoOk(e.seit) || TAG.test(String(e.seit))) return null;
    const zuletzt = TAG.test(String(e.zuletzt)) ? String(e.zuletzt) : isoOk(e.zuletzt) ? new Date(e.zuletzt).toISOString() : "";
    return Object.assign({ id: String(e.id), seit: new Date(e.seit).toISOString(), client: CA_CLIENT.test(String(e.client || "")) ? String(e.client) : "claude.ai" },
      zuletzt ? { zuletzt } : {}, GERAET_ID.test(String(e.von || "")) ? { von: String(e.von) } : {});
  };
  const neuesteZuerst = (a, b) => (a.seit < b.seit ? 1 : a.seit > b.seit ? -1 : 0);
  // Ende einer Verbindung (frueher, bekannt) als ISO-Zeit oder ""
  const caEnde = (e) => (isoOk(e.ende) && !TAG.test(String(e.ende)) ? new Date(e.ende).toISOString() : "");
  const caListe = (l) => (Array.isArray(l) ? l : []).map(caVerbindung).filter(Boolean).sort(neuesteZuerst)
    .filter((e, i, a) => a.findIndex((x) => x.id === e.id) === i).slice(0, CA_HOECHSTENS);
  // { an, verbindungen, frueher? } → geprüft, neueste zuerst, je id einmal; frueher (beendet, mit ende) ohne die, die noch verbunden
  // sind; null, wenn es kein Objekt ist (ein Server ohne Connector schickt nichts)
  const claudeAppNormal = (roh) => {
    if (!roh || typeof roh !== "object" || Array.isArray(roh)) return null;
    const v = caListe(roh.verbindungen);
    const frueher = (Array.isArray(roh.frueher) ? roh.frueher : []).filter((e) => e && caEnde(e)).map((e) => Object.assign(caVerbindung(e) || {}, { ende: caEnde(e) }))
      .filter((e) => e.id && !v.some((x) => x.id === e.id)).slice(0, CA_HOECHSTENS);
    return { an: roh.an === true, verbindungen: v, frueher };
  };
  // Jede Verbindung, die das abrufende Gerät je gesehen hat (server.json → claude_app.bekannt, CA_BEKANNT_TAGE ab seit), auch wenn sie
  // inzwischen getrennt ist, dazu die, die der Server als beendet meldet (mit ende): Eine fremde Verbindung, die sich selbst wieder
  // abmeldet, soll trotzdem auf jedem Gerät auffallen, auch wenn sie endete, bevor ein Gerät abholte. Bei gleicher Verbindung gilt die
  // aus neu (dort kommt ende dazu).
  const caBekannt = (alt, neu, jetzt) => {
    const aus = [];
    for (const e of [].concat(Array.isArray(neu) ? neu : [], Array.isArray(alt) ? alt : [])) {
      const x = caVerbindung(e);
      if (!x || aus.some((y) => y.id === x.id && y.seit === x.seit) || jetzt - Date.parse(x.seit) > CA_BEKANNT_TAGE * 864e5) continue;
      aus.push(Object.assign({ id: x.id, seit: x.seit, client: x.client }, caEnde(e) ? { ende: caEnde(e) } : {}));
    }
    return aus.sort(neuesteZuerst).slice(0, CA_HOECHSTENS);
  };
  // Für server.json: zuletzt nur als Tag (Ortszeit), sonst schriebe jeder Abruf die Datei neu, solange du Claude fragst
  const caFuerTresor = (ca, bekannt) => ({ an: ca.an, verbindungen: ca.verbindungen.map((e) => Object.assign({ id: e.id, seit: e.seit, client: e.client },
    e.zuletzt ? { zuletzt: TAG.test(e.zuletzt) ? e.zuletzt : tagIso(e.zuletzt) } : {}, e.von ? { von: e.von } : {})), bekannt });
  // Wann: Zeit wie zeitText, ein Tag allein (server.json) „heute“, „gestern“ oder „am 01.11.“
  const wannText = (s, jetzt) => {
    if (!TAG.test(s)) return zeitText(new Date(s), jetzt);
    if (s === tagIso(jetzt)) return "heute";
    return s === tagIso(new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate() - 1)) ? "gestern" : `am ${s.slice(8, 10)}.${s.slice(5, 7)}.`;
  };
  // „verbunden seit 03.11., 14:20 · zuletzt benutzt heute“
  const caZeileText = (e, jetzt) => `verbunden seit ${zeitText(new Date(e.seit), jetzt)}` + (e.zuletzt ? ` · zuletzt benutzt ${wannText(e.zuletzt, jetzt)}` : "");
  // Zeile „Claude-App“ im Stand des Fensters: die neueste Verbindung, sonst „nicht verbunden“
  const caKurz = (ca, jetzt) => (ca && ca.verbindungen.length ? caZeileText(ca.verbindungen[0], jetzt) : "nicht verbunden");
  // „Neue Claude-Verbindung am 03.11. um 14:20“ (Seit deinem letzten Besuch, Zeile unter Verbindungen)
  const caNeuText = (e) => { const d = new Date(e.seit); return `Neue Claude-Verbindung am ${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}. um ${pad2(d.getHours())}:${pad2(d.getMinutes())}`; };
  // Was die Rückfrage vor dem Code sagt: genau das, was Claude in dieser Fassung lesen kann (die Werkzeuge des Servers ohne Kopie des
  // Tresors), und dass es nichts ändert
  const CA_LESEN = "Claude kann dann in der Claude-App lesen: deine Termine und Fristen, offene To-dos, den Stand deines Lernplans, fällige " +
    "Karteikarten je Modul, deine Prüfungen mit Noten, deinen Stundenplan der nächsten 14 Tage und die Hinweise deines Servers. Claude " +
    "ändert dabei nichts. Gib den Code nur selbst auf der Seite deines Servers ein.";
  const CA_SCHRITTE = [
    "In der Claude-App in den Einstellungen **Konnektoren** öffnen (englisch „Connectors“) und einen eigenen Konnektor hinzufügen („Add custom connector“, " +
      "in der App im Menü oben rechts). Verbinden nur so in der Claude-App starten, nie über einen Link, den dir jemand schickt.",
    "Als Name „Studium Autopilot“ und als Adresse („MCP server URL“) die unten einfügen. Der Hinweis darunter, nur Konnektoren von Entwicklern zu nutzen, " +
      "denen du vertraust, meint hier deinen eigenen Server. Zweimal **Weiter** („Continue“) tippen; die Angaben zur Anmeldung dazwischen so lassen, wie sie sind.",
    "Auf der Seite deines Servers, die sich öffnet, den Code unten eingeben und **Verbinden** tippen. Danach steht Studium Autopilot auch in der Claude-App auf iPhone, iPad und Computer.",
  ];
  const CA_SICHER = "Hast du in claude.ai auch Gmail verbunden, sperre dort die Werkzeuge zum Senden und Weiterleiten, und schalte den " +
    "Netzzugang der Code-Ausführung aus. Das verringert das Risiko, schließt es aber nicht aus; Konnektoren, die du nicht brauchst, schaltest " +
    "du im Chat über + aus.";
  // Sätze zu Fehlern der Claude-App (Fenster); zu-viele mit „Wieder möglich ab …“
  const CA_FEHLER = {
    alt: "Dein Server bekommt das mit seinem nächsten Update.",
    abgeschaltet: "Die Verbindung zur Claude-App ist gerade abgeschaltet.",
    uhr: "Die Uhr dieses Geräts geht falsch. Stell sie richtig und versuch es noch einmal.",
    nochmal: "Das hat nicht geklappt. Versuch es noch einmal.",
  };

  // ---------- Lagebild (Stand an den Server, nur mit der Claude-App) ----------
  // Was Claude über die Werkzeuge des Servers liest, ohne Kopie des Tresors: nur Daten aus den eigenen Lesern des Plugins (Lernplan,
  // Karteikarten, Fachmodell, Alma), Texte ohne Links, HTML und alles, was nach Zugangsdaten aussieht (lageText). Grenzen je Liste
  // und zusammen höchstens LAGE_BYTES, dazu nie mehr, als neben dem übrigen Stand unter STAND_BYTES passt (der Dienst nimmt höchstens
  // 512 KB verschlüsselt, das ist etwa ein Drittel mehr als der Klartext).
  // note: Zeichen einer Note oder eines Ergebnisses (ERGEBNIS_STATUS, das längste hat 25); dieselbe Grenze prüft der Server (LAGEBILD)
  const LAGE = { module: 40, kapitel: 200, pruefungen: 100, stundenplan: 300, tage: 14, note: 30 };
  const LAGE_BYTES = 120000, STAND_BYTES = 360000;
  const UHR = /^\d{1,2}:\d{2}$/;
  const ANMELDUNG = ["angemeldet", "zurückgetreten"];
  // roh: { lernplan: [{ modul, kapitel: [{ titel, nummer, verstanden, woche }] }], karten: [{ modul, faellig }], pruefungen: [{ modul,
  // titel, datum, anmeldung, versuch, note }], stundenplan: [{ datum, von, bis, titel, ort, modul, ausfall }] }; geheim(text) → true, wenn er
  // nach Zugangsdaten aussieht; budget: Bytes (JSON) → dieselbe Form, geprüft und gekürzt, ohne leere Felder
  const lagebildKurz = (roh, geheim, budget) => {
    const r = roh && typeof roh === "object" ? roh : {};
    const liste = (l) => (Array.isArray(l) ? l.filter((x) => x && typeof x === "object") : []);
    const code = (c) => (MODULCODE_SERVER.test(String(c || "")) ? String(c) : "");
    const lageText = (v, max) => { const t = typeof v === "string" ? v : typeof v === "number" ? String(v) : ""; return !t || (geheim && geheim(t)) ? "" : punktText(t, max).trim(); };
    const mit = (o, k, v) => { if (v) o[k] = v; return o; };
    const einmal = (l) => l.filter((x, i, a) => a.findIndex((y) => y.modul === x.modul) === i);
    const aus = {
      lernplan: einmal(liste(r.lernplan).filter((m) => code(m.modul))).slice(0, LAGE.module).map((m) => ({ modul: code(m.modul),
        kapitel: liste(m.kapitel).map((k) => mit(mit({ titel: lageText(k.titel, 120), verstanden: k.verstanden === true }, "nummer", KAPITEL_NR.test(String(k.nummer || "")) ? String(k.nummer) : ""),
          "woche", s10(k.woche))).filter((k) => k.titel).slice(0, LAGE.kapitel) })).filter((m) => m.kapitel.length),
      karten: einmal(liste(r.karten).filter((k) => code(k.modul) && Number.isInteger(k.faellig) && k.faellig >= 0)).slice(0, LAGE.module)
        .map((k) => ({ modul: code(k.modul), faellig: Math.min(k.faellig, 99999) })),
      pruefungen: liste(r.pruefungen).filter((p) => code(p.modul)).slice(0, LAGE.pruefungen).map((p) => mit(mit(mit(mit(mit({ modul: code(p.modul) },
        "titel", lageText(p.titel, 120)), "datum", s10(p.datum)), "anmeldung", ANMELDUNG.indexOf(p.anmeldung) >= 0 ? p.anmeldung : ""),
        "versuch", Number.isInteger(p.versuch) && p.versuch > 0 && p.versuch < 10 ? p.versuch : 0), "note", lageText(p.note, LAGE.note))),
      stundenplan: liste(r.stundenplan).filter((e) => s10(e.datum)).map((e) => mit(mit(mit(mit(mit({ datum: s10(e.datum), titel: lageText(e.titel, 120) },
        "von", UHR.test(String(e.von || "")) ? String(e.von) : ""), "bis", UHR.test(String(e.bis || "")) ? String(e.bis) : ""), "ort", lageText(e.ort, 120)),
        "modul", code(e.modul)), "ausfall", e.ausfall === true)).filter((e) => e.titel).slice(0, LAGE.stundenplan),
    };
    return lagebildKappen(aus, Math.min(LAGE_BYTES, Math.max(0, budget == null ? LAGE_BYTES : budget)));
  };
  // Über der Grenze: ganze Einträge vom Ende der jeweils größten Liste weg (die Kapitel eines Moduls zählen als eine), nie mitten in
  // einem Eintrag; jede Größe wird nur einmal gemessen (lange Listen auf dem Telefon)
  const lagebildKappen = (l, max) => {
    const bytes = (x) => new TextEncoder().encode(JSON.stringify(x)).length;
    let summe = bytes(l);
    if (summe <= max) return l;
    const listen = [l.stundenplan, l.pruefungen, l.karten].concat(l.lernplan.map((m) => m.kapitel));
    const g = listen.map((x) => x.map((e) => bytes(e) + 1)), gesamt = g.map((x) => x.reduce((a, b) => a + b, 0));
    while (summe > max) {
      let i = -1;
      for (let j = 0; j < listen.length; j++) if (listen[j].length && (i < 0 || gesamt[j] > gesamt[i])) i = j;
      if (i < 0) break;
      listen[i].pop();
      const weg = g[i].pop();
      gesamt[i] -= weg;
      summe -= weg;
    }
    l.lernplan = l.lernplan.filter((m) => m.kapitel.length);
    return l;
  };

  // ---------- Datenkanal (Gegenstück zu server/kanal.mjs) ----------
  const kodieren = (s) => new TextEncoder().encode(s);
  const b64 = (bytes) => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
  const unb64 = (text) => {
    const t = String(text || "").replace(/-/g, "+").replace(/_/g, "/");
    const s = atob(t + "===".slice(0, (4 - (t.length % 4)) % 4));
    const b = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
    return b;
  };
  const schluesselLaden = (s) => {
    const roh = unb64(s);
    if (roh.length !== 32) throw new Error("Schlüssel ungültig");
    return crypto.subtle.importKey("raw", roh, "AES-GCM", false, ["encrypt", "decrypt"]);
  };
  const entschluesseln = async (s, zweck, p) => {
    if (!p || typeof p !== "object" || p.schema !== 1 || p.zweck !== zweck || typeof p.iv !== "string" || typeof p.daten !== "string") throw new Error("Paket ungültig");
    const iv = unb64(p.iv);
    if (iv.length !== 12) throw new Error("Paket ungültig");
    const klar = await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: kodieren(KANAL + zweck) }, await schluesselLaden(s), unb64(p.daten));
    return JSON.parse(new TextDecoder("utf-8").decode(klar));
  };
  // Bytes (Zweck „pdf“: die PDF) bzw. ein Objekt als JSON → Paket { schema, zweck, iv, daten }
  const verschluesselnRoh = async (s, zweck, bytes) => {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const geheim = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: kodieren(KANAL + zweck) }, await schluesselLaden(s), bytes);
    return { schema: 1, zweck, iv: b64(iv), daten: b64(new Uint8Array(geheim)) };
  };
  const verschluesseln = (s, zweck, objekt) => verschluesselnRoh(s, zweck, kodieren(JSON.stringify(objekt)));

  // ---------- Verbinden und Anfragen signieren (seit 0.7.8; Gegenstück zu server/verbinden.mjs und server/kanal.mjs) ----------
  // Bis 0.7.7 schützte allein HTTPS den Code und die Schlüssel: Wer ein gültiges Zertifikat für die Adresse bekommt (eine neu
  // vergebene IP, der Dienst hinter dem Namen, wer das DNS umlenkt), hätte beides mitlesen oder eigene Schlüssel unterschieben können.
  // Verbinden: Der Code geht nie über das Netz. PBKDF2-SHA256 (KDF_RUNDEN Runden, Salz „studium-autopilot/verbinden/v2/code\n<host>“)
  // macht aus Code und Host 32 Byte m, HKDF-SHA256 daraus kennung (geht an den Server), beweis (HMAC über den eigenen öffentlichen
  // Schlüssel: Niemand kann ihn unterwegs gegen seinen tauschen) und antwort. Dazu je Verbinden ein Schlüsselpaar P-256 (ECDH) auf
  // beiden Seiten. Die Antwort ist mit AES-256-GCM verschlüsselt unter HKDF(ECDH-Geheimnis ‖ antwort, Kontext mit Host und beiden
  // öffentlichen Schlüsseln). Eine Antwort in der Form bis 0.7.7 (Schlüssel offen) nimmt das Gerät nie an.
  // Anfragen: kein Schlüssel im Kopf, sondern eine Signatur nur für diese Anfrage (anfrageKopf, Form in server/kanal.mjs).
  const KDF_RUNDEN = 600000; // wie KDF in server/verbinden.mjs: etwa 0,15 s auf einem PC von 2018, auf dem Telefon grob das Doppelte bis Dreifache
  const V2 = "studium-autopilot/verbinden/v2/", ANFRAGE = "studium-autopilot/anfrage/v1";
  const PUNKT = /^[A-Za-z0-9_-]{87}$/; // öffentlicher Schlüssel P-256, unkomprimiert (65 Byte)
  const leer = () => new Uint8Array(0);
  const pbkdf2 = async (passwort, salz, runden) => new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: salz, iterations: runden },
    await crypto.subtle.importKey("raw", passwort, "PBKDF2", false, ["deriveBits"]), 256));
  // ohne Salz 32 Nullbytes statt eines leeren: nach RFC 5869 dasselbe Ergebnis (der Server nimmt ein leeres), aber WebKit auf iOS 16
  // nimmt nicht jedes leere Salz an
  const hkdf = async (ikm, info, salz) => new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: salz || new Uint8Array(32), info },
    await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]), 256));
  const hmac = async (schluessel, daten) => new Uint8Array(await crypto.subtle.sign("HMAC",
    await crypto.subtle.importKey("raw", schluessel, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]), daten));
  const sha256 = async (daten) => new Uint8Array(await crypto.subtle.digest("SHA-256", daten));
  // Code („ABCDE-FGHJK“) und Host des Servers (klein, mit Port, falls einer dasteht) → { kennung, beweis, antwort } (je 32 Byte)
  const codeAbleiten = async (code, host) => {
    const m = await pbkdf2(kodieren(String(code).toUpperCase().replace(/[^A-Z0-9]/g, "")), kodieren(V2 + "code\n" + host), KDF_RUNDEN);
    return { kennung: await hkdf(m, kodieren(V2 + "kennung")), beweis: await hkdf(m, kodieren(V2 + "beweis")), antwort: await hkdf(m, kodieren(V2 + "antwort")) };
  };
  // Code gegen Schlüssel tauschen (POST /v1/verbinden, schema 2). netz wie abh.netz; name: wie das Gerät heißt (fürs Protokoll und die
  // Liste der Geräte, nicht geschützt). → { ok: true, d: { adresse, zugang, schluessel, geraet? (ein Server ab dieser Fassung: eigene
  // Schlüssel für dieses Gerät und seine Kennung) } } | { fehler: netz | code (falsch oder abgelaufen) | alt (Server kennt den Tausch
  // noch nicht) | gesperrt | voll (der Server kennt schon so viele Geräte, wie er darf; der Code bleibt) | speichern (der Server konnte
  // das Gerät nicht speichern, etwa bei vollem Speicher; der Code bleibt) | antwort (nicht in der neuen Form, nicht zu entschlüsseln oder
  // verfälscht: nichts gespeichert) }
  const austauschen = async (netz, adresse, code, name) => {
    const host = hostVon(adresse);
    const k = await codeAbleiten(code, host);
    const paar = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
    const pub = b64(new Uint8Array(await crypto.subtle.exportKey("raw", paar.publicKey)));
    const beweis = b64(await hmac(k.beweis, kodieren(V2 + "beweis\n" + host + "\n" + pub)));
    let r, o = null;
    try {
      r = await netz({ url: adresse + "/v1/verbinden", method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify(Object.assign({ schema: 2, kennung: b64(k.kennung), pub, beweis }, name ? { geraet: name } : {})) });
    } catch (e) { return { fehler: "netz" }; }
    try { o = JSON.parse(r.text); } catch (e) { o = null; }
    // 403 nennt bei einem Server ab 0.7.8 schema 2; einer bis 0.7.7 sucht einen Code im Feld code und findet keinen
    if (r.status === 403) return { fehler: o && o.schema === 2 ? "code" : "alt" };
    if (r.status === 429) return { fehler: "gesperrt" };
    if (r.status === 409 && o && o.fehler === "zu-viele-geraete") return { fehler: "voll" };
    if (r.status === 503 && o && o.fehler === "speichern") return { fehler: "speichern" };
    if (r.status !== 200 || !o || o.schema !== 2 || !PUNKT.test(String(o.pub)) || typeof o.iv !== "string" || typeof o.daten !== "string") return { fehler: "antwort" };
    try {
      const kontext = kodieren(V2 + "antwort\n" + host + "\n" + pub + "\n" + o.pub);
      const seinPub = await crypto.subtle.importKey("raw", unb64(o.pub), { name: "ECDH", namedCurve: "P-256" }, false, []);
      const geheimnis = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: seinPub }, paar.privateKey, 256));
      const ikm = new Uint8Array(64);
      ikm.set(geheimnis);
      ikm.set(k.antwort, 32);
      const iv = unb64(o.iv);
      if (iv.length !== 12) return { fehler: "antwort" };
      const schl = await crypto.subtle.importKey("raw", await hkdf(ikm, kontext), "AES-GCM", false, ["decrypt"]);
      const d = JSON.parse(new TextDecoder("utf-8").decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: kontext }, schl, unb64(o.daten))));
      return d && typeof d === "object" ? { ok: true, d } : { fehler: "antwort" };
    } catch (e) { return { fehler: "antwort" }; }
  };
  // Kopf „Authorization“ einer Anfrage: Studium-Signatur v=1,zeit=…,nonce=…,inhalt=…,signatur=…[,beweis=…]. Signiert wird
  // „studium-autopilot/anfrage/v1“, Methode, Pfad, Zeit (Unix-Sekunden), Zufallswert und SHA-256 des Körpers, je eine Zeile, mit
  // HMAC-SHA256 unter HKDF(Zugangsschlüssel, „…/anfrage/v1/zugang“); mitBeweis dazu unter HKDF(Datenschlüssel,
  // „…/anfrage/v1/datenschluessel“) (der Anstoß verlangt ihn). o: { zeit, nonce } (Tests), sonst die echte Uhr (der Server erlaubt
  // 5 Minuten daneben) und 16 Zufallsbytes
  const anfrageKopf = async (v, methode, pfad, body, mitBeweis, o) => {
    const zeit = String(o && o.zeit != null ? o.zeit : Math.floor(Date.now() / 1000));
    const nonce = o && o.nonce ? o.nonce : b64(crypto.getRandomValues(new Uint8Array(16)));
    const inhalt = b64(await sha256(typeof body === "string" ? kodieren(body) : leer()));
    const text = kodieren([ANFRAGE, methode, pfad, zeit, nonce, inhalt].join("\n"));
    const mac = async (s, art) => b64(await hmac(await hkdf(unb64(s), kodieren(ANFRAGE + "/" + art)), text));
    return `Studium-Signatur v=1,zeit=${zeit},nonce=${nonce},inhalt=${inhalt},signatur=${await mac(v.zugang, "zugang")}` +
      (mitBeweis ? ",beweis=" + (await mac(v.schluessel, "datenschluessel")) : "");
  };
  // Abgelehnt (401)? → "" | zugang (Server kennt die Schlüssel nicht) | erneuert (es sind seine alten, „studium-server
  // schluessel-erneuern“; das sagt er nur signiert unter ihnen, senden prüft das) | uhr (Uhr dieses Geräts mehr als 5 Minuten daneben)
  // | alt (ein Server bis 0.7.7 kennt keine Signaturen: seine 401 nennt signatur nicht; er bekommt die neue Version von selbst)
  const ablehnung = (r) => {
    if (!r || r.status !== 401) return "";
    if (r.bearer) return "zugang"; // Antwort auf den Bearer an einen Server bis 0.7.7: er kennt den Schlüssel nicht
    if (r.alt) return "alt"; // senden: verriegelt, aber eine Antwort wie von einem Server bis 0.7.7 (nur der Satz, keine Ablehnung)
    let o = null;
    try { o = JSON.parse(r.text); } catch (e) { o = null; }
    if (!o || o.signatur !== 1) return "alt";
    return o.fehler === "uhr" ? "uhr" : o.erneuert === 1 ? "erneuert" : "zugang";
  };
  // So antwortet nur ein Server bis 0.7.7 auf eine signierte Anfrage: 401 ohne signatur (ablehnung „alt“) oder, nach 10 solchen
  // Anfragen aus demselben Netz, seine Sperre (429 zu-viele-versuche; ein Server ab 0.7.8 sperrt eine gültige Signatur nie)
  const wieAlt = (r) => ablehnung(r) === "alt" || (!!r && r.status === 429 && /"zu-viele-versuche"/.test(String(r.text || "")));
  // Signatur der Antwort (Server ab 0.7.8 auf jede signierte Anfrage): Kopf studium-signatur: v=1,mac=<HMAC-SHA256 unter
  // HKDF(Zugangsschlüssel ‖ Datenschlüssel, „…/anfrage/v1/antwort“) über „studium-autopilot/antwort/v1“, die nonce der Anfrage, den
  // Status und den SHA-256 des Körpers, je eine Zeile> (server/kanal.mjs antwortMac; den Zugangsschlüssel allein schickten Plugins
  // bis 0.7.7 im Kopf) → true, wenn sie stimmt
  const antwortEcht = async (v, nonce, r) => {
    const m = /^v=1,mac=([A-Za-z0-9_-]{43})$/.exec(String(objekt0(r && r.headers)["studium-signatur"] || ""));
    if (!m) return false;
    const inhalt = b64(await sha256(kodieren(String(r.text || ""))));
    const z = unb64(v.zugang), d = unb64(v.schluessel), ikm = new Uint8Array(z.length + d.length);
    ikm.set(z);
    ikm.set(d, z.length);
    const soll = b64(await hmac(await hkdf(ikm, kodieren(ANFRAGE + "/antwort")), kodieren(["studium-autopilot/antwort/v1", nonce, String(r.status), inhalt].join("\n"))));
    let anders = 0;
    for (let i = 0; i < soll.length; i++) anders |= soll.charCodeAt(i) ^ m[1].charCodeAt(i);
    return anders === 0;
  };
  const objekt0 = (x) => (x && typeof x === "object" ? x : {});

  // ---------- Doppel erkennen ----------
  // Titel → Wörter: klein, Umlaute ausgeschrieben, ohne Füllwörter; Zahlen zählen immer (Blatt 2 ≠ Blatt 3)
  const FUELL = ["der", "die", "das", "den", "dem", "des", "und", "oder", "fuer", "zum", "zur", "von", "vom", "mit", "auf", "bis", "aus", "bei", "ein", "eine", "the", "and", "for"];
  const woerter = (s) => {
    let t = String(s || "").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
    try { t = t.normalize("NFKD").replace(/[\u0300-\u036f]/g, ""); } catch (e) { /* ohne normalize */ }
    return t.replace(/\(entfaellt\)/g, " ").split(/[^a-z0-9]+/).filter((w) => w && (/\d/.test(w) || (w.length > 2 && FUELL.indexOf(w) < 0)));
  };
  // Ähnlich: Zahlen gleich (falls beide welche haben), dann mindestens die Hälfte gemeinsam (Jaccard) oder der kürzere Titel
  // (ab zwei Wörtern) steckt ganz im längeren
  const aehnlich = (a, b) => {
    const A = woerter(a), B = woerter(b);
    if (!A.length || !B.length) return false;
    const zahlen = (W) => W.filter((w) => /^\d+$/.test(w)).sort().join(" ");
    if (zahlen(A) && zahlen(B) && zahlen(A) !== zahlen(B)) return false;
    const a2 = A.filter((w, i) => A.indexOf(w) === i), b2 = B.filter((w, i) => B.indexOf(w) === i);
    const gemeinsam = a2.filter((w) => b2.indexOf(w) >= 0).length;
    return gemeinsam / (a2.length + b2.length - gemeinsam) >= 0.5 || (gemeinsam >= 2 && gemeinsam === Math.min(a2.length, b2.length));
  };

  // ---------- Ablauf ----------
  // abh: {
  //   io: { lesenText(p) → Text | null, schreibenText(p, t) (legt Ordner an), umbenennen(alt, neu), papierkorb(p), existiert(p),
  //         terminNotizen() → [{ pfad, fm }] (alle Notizen mit typ: termin) },
  //   netz({ url, method, headers, body }) → { status, text, headers? (Kleinbuchstaben) } (wirft ohne Netz),
  //   geheim: { lesen(id) → Text | null, schreiben(id, w), loeschen(id) }, geheimId(),
  //   lokal(k, v?), jetzt() → Date, geraetId(), zentral() → ctx.zentral, stand() → { module, studienbeginn, variante },
  //   modulLink(code) → "[[…]]" | "", bestaetigen(titel, text, ja) → Promise<boolean>, eintippen(titel, text, ja, soll) →
  //   Promise<Text | null> (Feld, der Knopf erst, wenn soll dasteht), ohneKennwort(s) (ctx.ilias.ohneKennwort), sperre (ctx.user.sperre),
  //   quellen (ctx.user.quellen), standText(status) → { text, symbol } (ctx.verbindungen.standText), mobil, lokalErlaubt,
  //   tresor() → Promise<{ termine: [{ titel, datum, bis, kategorie, code, herkunft, erledigt }], todos: [{ text, code, frist }] }>,
  //   unterlagen() → Promise<[{ datei (PDF), kennung (SHA-256), art, titel, code, seiten, text, angefordert?, pdf?, nur_termine? }]>
  //   (ohne Zusammenfassung), pdf(datei) → Promise<Uint8Array | null> (die PDF selbst, für pdf: true),
  //   kapitelUnterlagen({ ohne, hoechstens }) → Promise<[{ datei, kennung, titel, code, nummer, seiten, datum, quelle, text }]> (Folien
  //   für Kapitellisten, Text wie volltextText), lernplan() → ctx.lernplan | null, lernplanNotizen(codes) → Promise<[{ code, text }]>
  //   (Lernplan-Notizen mit herkunft: server); stand() dazu lernplan: { semester, module } | null }
  //   io.begleitnotiz(pdfPfad) → Pfad der Notiz neben der PDF oder ""
  const erzeugen = (abh) => {
    const io = abh.io;
    const lokal = abh.lokal;
    // Rückgängig in der Form vor dem 02.11.2026 (ganze Notizen, ohne Prüfsumme): beim Laden weg, sie gelten ohnehin nicht mehr
    try {
      const r = lokal(L.rueck), liste = r && Array.isArray(r.aenderungen) ? r.aenderungen : null;
      if (liste && liste.some((a) => a && a.art === "termin" && (typeof a.hash !== "string" || typeof a.alt === "string"))) lokal(L.rueck, null);
    } catch (e) { /* Gerätespeicher nicht lesbar: nichts zu tun */ }
    const Q = abh.quellen;
    const jetztMs = () => abh.jetzt().getTime();
    const alterMs = (iso) => { const t = Date.parse(iso || ""); return isNaN(t) ? Infinity : jetztMs() - t; };
    let laeuft = false;
    const heute = () => { const d = abh.jetzt(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
    // gemeinsame Abrufer-Sperre (sperre.js): nur ein Gerät übernimmt
    const sperre = () => abh.sperre.erzeugen({ io: { lesen: io.lesenText, schreiben: io.schreibenText }, quelle: "server",
      geraetId: abh.geraetId, jetzt: abh.jetzt, mobil: !!abh.mobil });

    // Eintrag im Schlüsselbund: { adresse, zugang, schluessel, geraet? }. geraet: Kennung dieses Geräts bei einem Server mit Schlüsseln je
    // Gerät (seit dieser Fassung); fehlt sie, sind es die gemeinsamen (verbunden bis 0.7.11) oder eigene, deren Kennung das Gerät noch
    // nicht kennt (verbunden mit 0.7.8 bis 0.7.11 an einem neuen Server): Dann zieht es beim nächsten Abruf um (umziehen).
    const verbindung = () => {
      let v = null;
      try { v = JSON.parse(abh.geheim.lesen(abh.geheimId()) || "null"); } catch (e) { v = null; }
      if (!v || typeof v !== "object" || !adresseNormal(v.adresse, abh.lokalErlaubt) || !SCHLUESSEL.test(String(v.zugang)) || !SCHLUESSEL.test(String(v.schluessel))) return null;
      return Object.assign({ adresse: adresseNormal(v.adresse, abh.lokalErlaubt), zugang: v.zugang, schluessel: v.schluessel }, GERAET_ID.test(String(v.geraet || "")) ? { geraet: v.geraet } : {});
    };
    const geraetName = () => String((abh.geraetName && abh.geraetName()) || "").slice(0, 40);
    // Riegel (wie HSTS, nur aufwärts): Hat dieses Gerät einmal eine signierte Antwort dieses Servers gesehen (antwortEcht) oder sich
    // ab 0.7.8 mit ihm verbunden (austauschen: das kann nur ein neuer Server), schickt es ihm nie wieder den Zugangsschlüssel selbst
    // und nimmt von ihm nur noch signierte Antworten an. Gerätelokal (L.riegel, nie im Tresor: wer den Sync hat, könnte ihn sonst
    // löschen), je Server und Schlüssel (SHA-256 aus Adresse und Zugangsschlüssel, gekürzt; der Schlüssel selbst steht nicht darin).
    // Dazu im Speicher (riegelHier): Scheitert das Speichern, gilt er trotzdem, und das Gerät versucht es bei der nächsten Anfrage neu.
    // Ein Eintrag mit Kennung (geraet) ist immer verriegelt: Die gibt nur ein Server mit Schlüsseln je Gerät heraus, verschlüsselt beim
    // Verbinden oder signiert beim Umziehen; so gibt es auch zwischen Schlüsselbund und Riegel keinen Moment ohne.
    let riegelHier = "";
    const riegelId = async (v) => Array.prototype.map.call(await sha256(kodieren(v.adresse + "\n" + v.zugang)), (b) => (b < 16 ? "0" : "") + b.toString(16)).join("").slice(0, 32);
    const riegelZu = async (v) => {
      if (v.geraet) return true;
      const id = await riegelId(v), x = objekt(lokal(L.riegel));
      if (x.id === id) return true;
      if (riegelHier !== id) return false;
      lokal(L.riegel, { id, seit: abh.jetzt().toISOString() }); // noch einmal speichern
      return true;
    };
    const riegelSetzen = async (v) => {
      const id = await riegelId(v);
      riegelHier = id;
      if (objekt(lokal(L.riegel)).id !== id) lokal(L.riegel, { id, seit: abh.jetzt().toISOString() });
    };
    // Jede Anfrage an den Server, signiert (anfrageKopf). Trägt die Antwort eine gültige Signatur (antwortEcht), ist der Riegel
    // gesetzt. Sonst, mit Riegel: Antwortet er wie ein Server bis 0.7.7 (wieAlt), gilt sie als 401 „alt“ (alt: true; „… erst nach
    // seinem nächsten Update“), jede andere wirft wie ein Netzfehler (nie eine Ablehnung). Ohne Riegel: Antwortet er wie ein Server bis
    // 0.7.7, geht dieselbe Anfrage einmal mit dem Zugangsschlüssel im Kopf (Bearer) wie bis 0.7.7 (Antwort mit bearer: true), sonst
    // gilt die Antwort, wie sie ist (vor dem Riegel schützt nur HTTPS, wie bis 0.7.7).
    // o: { method, body (JSON-Text), beweis (dazu der Beweis mit dem Datenschlüssel), fehlt404 (ein Weg, den ältere Server nicht
    // kennen: Sie antworten mit Riegel auf den unbekannten Pfad mit 404 ohne Signatur; das heißt nur „gibt es hier nicht“ und gilt) }
    const senden = async (v, pfad, o) => {
      const methode = (o && o.method) || "GET", body = o ? o.body : undefined;
      const schicken = (authorization) => {
        const headers = { authorization };
        if (typeof body === "string") headers["content-type"] = "application/json";
        return abh.netz(Object.assign({ url: v.adresse + pfad, method: methode, headers }, typeof body === "string" ? { body } : {}));
      };
      const nonce = b64(crypto.getRandomValues(new Uint8Array(16)));
      const r = await schicken(await anfrageKopf(v, methode, pfad, body, !!(o && o.beweis), { nonce }));
      if (await antwortEcht(v, nonce, r)) {
        await riegelSetzen(v);
        return r;
      }
      if (await riegelZu(v)) {
        if (wieAlt(r)) return Object.assign({}, r, { status: 401, alt: true });
        if (o && o.fehlt404 && r && r.status === 404) return r;
        throw Object.assign(new Error("Antwort ohne gültige Signatur"), { antwort: r });
      }
      if (wieAlt(r)) return Object.assign({}, await schicken("Bearer " + v.zugang), { bearer: true });
      return r;
    };

    // ----- server.json -----
    // Die Zeile fragt synchron: Hinweise und Claude-App aus dem letzten Lesen oder Schreiben von server.json
    let hinweisListe = [], caTresor = null;
    const zustandLeer = () => ({ schema: 1, erledigt: {}, laeufe: [], hinweise: [], gesendet: {}, nachsenden: {}, begleitet: {}, lernplan: {} });
    const objekt = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
    const zustandLesen = async () => {
      const text = await io.lesenText(DATEI);
      const z = zustandLeer();
      let o = null;
      try { o = text == null ? null : JSON.parse(text); } catch (e) { o = null; }
      if (o && typeof o === "object") {
        const erl = objekt(o.erledigt);
        for (const k of Object.keys(erl)) if (DATEINAME.test(k)) z.erledigt[k] = String(erl[k]);
        if (Array.isArray(o.laeufe)) z.laeufe = o.laeufe.filter((x) => x && typeof x === "object").slice(-LAEUFE);
        if (Array.isArray(o.hinweise)) z.hinweise = o.hinweise.filter((x) => x && typeof x.text === "string").slice(-HINWEISE);
        const ges = objekt(o.gesendet), nach = objekt(o.nachsenden), beg = objekt(o.begleitet), lp = objekt(o.lernplan);
        for (const k of Object.keys(ges).slice(-2000)) if (/^[0-9a-f]{64}$/.test(k)) z.gesendet[k] = String(ges[k]).slice(0, 16);
        for (const k of Object.keys(lp).slice(-2000)) if (/^[0-9a-f]{64}$/.test(k)) z.lernplan[k] = String(lp[k]).slice(0, 16);
        for (const k of Object.keys(nach).slice(-200)) if (/^[0-9a-f]{64}$/.test(k)) z.nachsenden[k] = String(nach[k]).slice(0, 16);
        for (const k of Object.keys(beg).slice(-2000)) if (/^Unterlagen\//.test(k) && k.length <= 240) z.begleitet[k] = String(beg[k]).slice(0, 20);
      }
      // Adresse für „Mit Code verbinden“, zuletzt verbundenes Gerät (beides ohne Schlüssel)
      const geraete = objekt(o), vb = objekt(geraete.verbunden);
      z.adresse = adresseNormal(geraete.adresse, abh.lokalErlaubt);
      z.verbunden = isoOk(vb.zeit) && HERKUNFT.indexOf(vb.herkunft) >= 0 ? { zeit: new Date(vb.zeit).toISOString(), herkunft: vb.herkunft } : null;
      // Claude-App (nur ein Server mit Connector meldet sie): Stand und jede je gesehene Verbindung
      const ca = claudeAppNormal(geraete.claude_app);
      z.claude_app = ca ? caFuerTresor(ca, caBekannt(objekt(geraete.claude_app).bekannt, [], jetztMs())) : null;
      hinweisListe = z.hinweise;
      caTresor = z.claude_app;
      return { z, text };
    };
    const zustandText = (z) => JSON.stringify(Object.assign({ schema: z.schema, erledigt: z.erledigt, laeufe: z.laeufe, hinweise: z.hinweise, gesendet: z.gesendet,
      nachsenden: z.nachsenden, begleitet: z.begleitet, lernplan: z.lernplan }, z.adresse ? { adresse: z.adresse } : {}, z.verbunden ? { verbunden: z.verbunden } : {},
    z.claude_app ? { claude_app: z.claude_app } : {}), null, 1) + "\n";
    // Grabstein: angewendet in der Sperr-Datei (die Sperrfelder schreibt sperre.js; andere Felder lässt es stehen)
    const sperrDatei = async () => { try { return objekt(JSON.parse((await io.lesenText(SPERR_DATEI)) || "null")); } catch (e) { return {}; } };
    const angewendetLesen = async () => {
      const a = objekt((await sperrDatei()).angewendet), aus = {};
      for (const k of Object.keys(a)) if (ID.test(k)) aus[k] = String(a[k]);
      return aus;
    };
    const angewendetSchreiben = async (a) => {
      const o = await sperrDatei();
      if (JSON.stringify(objekt(o.angewendet)) === JSON.stringify(a)) return;
      o.angewendet = a;
      await io.schreibenText(SPERR_DATEI, JSON.stringify(o, null, 1) + "\n");
    };

    // ----- Status -----
    // Letztes „studium-server aktualisieren“ (fehlt bei einem älteren Server: null). grund nur aus der Liste von server/dienst.mjs,
    // sonst "unbekannt"; seit 02.11.2026 auch ohne Fehler nicht ok: kein-paket (das neueste Release hat kein Paket), aelter (es ist
    // nicht neuer als die laufende Version), zurueckgerollt (die Installation wurde zurückgenommen, der Server wartet einen Tag).
    // Nur mit Schlüssel dazu: installiert (laufende Version) und warten_bis (gestaffelte Verteilung: frühestens dann installiert er)
    const VERSION_FORM = /^[0-9A-Za-z.+-]{1,40}$/;
    const aktualisierungNormal = (roh) => {
      const a = objekt(roh);
      if (!isoOk(a.zeit)) return null;
      return { zeit: new Date(a.zeit).toISOString(), ok: a.ok === true, ziel: VERSION_FORM.test(String(a.ziel || "")) ? String(a.ziel) : "",
        grund: a.ok === true ? "" : wahl(a.grund, AKTUALISIERUNG_GRUENDE),
        erfolg: isoOk(a.erfolg) ? new Date(a.erfolg).toISOString() : "",
        installiert: VERSION_FORM.test(String(a.installiert || "")) ? String(a.installiert) : "",
        wartenBis: isoOk(a.warten_bis) ? new Date(a.warten_bis).toISOString() : "" };
    };
    const statusNormal = (o) => ({
      version: String(o.version || "").slice(0, 40),
      claude: wahl(o.claude, ["angemeldet", "abgemeldet"]),
      gmail: wahl(o.gmail, ["ok", "fehlt", "aus"]),
      weiterleitung: wahl(o.weiterleitung, ["ok", "fehlt"]),
      uniZugang: wahl(o.uni_zugang, ["gespeichert", "fehlt", "falsch"]),
      speicherReserve: wahl(o.speicher_reserve, ["an", "aus"]),
      livesync: wahl(o.livesync, ["an", "aus"]),
      letzterLauf: o.letzter_lauf && isoOk(o.letzter_lauf.zeit) ? { zeit: new Date(o.letzter_lauf.zeit).toISOString(), ok: o.letzter_lauf.ok === true } : null,
      claudeLauf: wahl(o.claude_lauf, ["wartet", "laeuft", "ruht"]),
      // am Limit des Claude-Abos: nächster Versuch des Servers (ein Server vor dem 01.11.2026 meldet es nicht)
      limitWieder: isoOk(o.limit_wieder) ? new Date(o.limit_wieder).toISOString() : "",
      aktualisierung: aktualisierungNormal(o.aktualisierung),
      fehler: (Array.isArray(o.fehler) ? o.fehler : []).filter((f) => typeof f === "string" && /^[a-z0-9-]{1,40}$/.test(f)).slice(0, 10),
      // nur mit Schlüssel (Server ab 02.11.2026): die letzten Verbindungen von Geräten und die Grenzen je Tag
      verbunden: verbindungenNormal(o.verbunden),
      grenzen: grenzenNormal(o.grenzen),
      geraete: geraeteNormal(o.geraete),
    });
    // → gemerkter Stand { geholt, erreichbar, werte, erreicht }, dazu ablehnung (zugang | erneuert | uhr | alt), wenn der Server die Anfrage gerade
    // abgelehnt hat (401, ablehnung; nur aus dieser Anfrage, nie gemerkt)
    const statusHolen = async (v, erzwingen) => {
      const alt = objekt(lokal(L.status));
      if (!erzwingen && alt.geholt && alterMs(alt.geholt) < STATUS_ALTER) return alt;
      let werte = null, abgelehnt = "";
      try {
        // signiert wie jede Anfrage: Ein Server, der den Status nur noch Geräten mit Schlüssel zeigt, antwortet so auch gleich nach dem
        // Verbinden
        const r = await senden(v, "/v1/status");
        abgelehnt = ablehnung(r);
        const o = r.status === 200 ? JSON.parse(r.text) : null;
        if (o && o.schema === 1) werte = statusNormal(o);
      } catch (e) { werte = null; }
      const jetzt = abh.jetzt().toISOString();
      const s = { geholt: jetzt, erreichbar: !!werte || !!abgelehnt, werte: werte || alt.werte || null, erreicht: werte ? jetzt : String(alt.erreicht || "") };
      lokal(L.status, s);
      return abgelehnt ? Object.assign({ ablehnung: abgelehnt }, s) : s;
    };

    // ----- Verbinden und Trennen -----
    // o.getippt: Code von Hand eingegeben („Mit Code verbinden“) statt Link; dann nur andere Sätze
    const verbinden = async (adresseRoh, codeRoh, o) => {
      const getippt = !!(o && o.getippt);
      const adresse = adresseNormal(adresseRoh, abh.lokalErlaubt);
      const code = String(codeRoh || "").trim().toUpperCase();
      if (!adresse || !CODE.test(code)) {
        return { ok: false, fehler: getippt ? "Code oder Adresse stimmen nicht." : "Der Link ist unvollständig. Bitte in der Cloud Shell von Oracle einen neuen erzeugen: bash ~/studium-autopilot/server/fern.sh verbinden" };
      }
      // Die Rückfrage sagt, was das Gerät dann schickt (POST /v1/stand, /v1/unterlagen, /v1/pdf, /v1/kapitel). Nur bestätigen ohne
      // Tippen, wenn der Schlüsselbund dieses Geräts genau diesen Server kennt oder die Adresse eben selbst ins Feld getippt wurde
      // (o.adresseGetippt, „Mit Code verbinden“) und das Gerät noch keinen kennt. Sonst tippst du den Namen des Servers ein, auch wenn
      // er in server.json steht: Die Datei ist nicht geprüft, jedes Gerät mit Sync (oder wer sie dort hinlegt) kann sie schreiben.
      const bisher = verbindung();
      const andere = bisher ? bisher.adresse : (await zustandLesen()).z.adresse;
      const host = hostVon(adresse);
      // Selbst getippt zählt nicht, wenn es genau die Adresse aus server.json ist: Die könnte jemand mit Zugriff auf den Sync
      // samt einem Hinweis dort hineingeschrieben haben, den man dann abtippt
      const ohneTippen = bisher ? bisher.adresse === adresse : !!(o && o.adresseGetippt) && adresse !== andere;
      const text = `Dieses Gerät schickt dann regelmäßig an ${host}: die Codes deiner Module, deine Termine, offene To-dos mit den Namen ` +
        "ihrer Notizen, den Text deiner Unterlagen und auf Wunsch die PDFs. Von dort kommen Termine, Hinweise und Zusammenfassungen in deine Notizen. " +
        (getippt ? "Nur bestätigen, wenn du den Code gerade selbst erzeugt hast, auf einem deiner Geräte oder auf deinem Server."
          : "Nur bestätigen, wenn du diesen Link gerade selbst auf deinem eigenen Server erzeugt hast.");
      let ja;
      if (ohneTippen) ja = await abh.bestaetigen("Mit deinem Server verbinden?", text, "Verbinden");
      else {
        const anders = andere && andere !== adresse;
        const vorher = !anders ? "" : bisher ? `Dieses Gerät ist mit ${hostVon(andere)} verbunden. ` : `In deinem Tresor steht ein anderer Server: ${hostVon(andere)}. `;
        const eingabe = await abh.eintippen(anders ? "Mit einem anderen Server verbinden?" : "Mit deinem Server verbinden?",
          `${vorher}${text} Tippe zur Bestätigung den Namen ${anders ? "des neuen Servers" : "deines Servers"} ein: ${host}`, "Verbinden", host);
        ja = typeof eingabe === "string" && eingabe.trim().toLowerCase() === host;
      }
      if (!ja) return { ok: false, abgebrochen: true };
      // Nur der Tausch ab 0.7.8 (austauschen): Code nie im Klartext, Schlüssel nur verschlüsselt und an den Code gebunden
      const x = await austauschen(abh.netz, adresse, code, geraetName());
      if (x.fehler === "netz") return { ok: false, fehler: getippt ? "Dein Server ist nicht erreichbar. Stimmt die Adresse?" : "Dein Server ist nicht erreichbar. Läuft er, und stimmt die Adresse im Link?" };
      if (x.fehler === "code") {
        return { ok: false, fehler: getippt ? "Der Code stimmt nicht oder gilt nicht mehr. Erzeuge auf einem verbundenen Gerät einen neuen."
          : "Der Code gilt nicht mehr (einmal verwendbar, 30 Minuten). Bitte auf deinem Server einen neuen erzeugen." };
      }
      if (x.fehler === "alt") return { ok: false, fehler: "Dein Server kann so erst nach seinem nächsten Update verbinden. Er aktualisiert sich täglich; versuch es danach mit einem neuen Code." };
      if (x.fehler === "gesperrt") return { ok: false, fehler: "Zu viele Versuche. Bitte in 10 Minuten noch einmal." };
      if (x.fehler === "voll") return { ok: false, fehler: `Dein Server kennt schon ${GERAETE_HOECHSTENS} Geräte. Trenne auf einem verbundenen Gerät eins, das du nicht mehr brauchst, dann geht derselbe Code.` };
      if (x.fehler === "speichern") return { ok: false, fehler: "Dein Server konnte dieses Gerät gerade nicht speichern (ist sein Speicher voll?). Der Code gilt weiter; versuch es später noch einmal." };
      if (x.fehler) return { ok: false, fehler: "Die Antwort deines Servers ließ sich nicht prüfen. Nichts gespeichert." };
      const d = x.d;
      if (adresseNormal(d.adresse, abh.lokalErlaubt) !== adresse || !SCHLUESSEL.test(String(d.zugang)) || !SCHLUESSEL.test(String(d.schluessel))) {
        return { ok: false, fehler: getippt ? "Die Antwort deines Servers passt nicht zur Adresse. Nichts gespeichert." : "Die Antwort deines Servers passt nicht zum Link. Nichts gespeichert." };
      }
      const geraet = GERAET_ID.test(String(d.geraet || "")) ? { geraet: d.geraet } : {};
      try { await abh.geheim.schreiben(abh.geheimId(), JSON.stringify(Object.assign({ adresse, zugang: d.zugang, schluessel: d.schluessel }, geraet))); }
      catch (e) { return { ok: false, fehler: "Der Schlüsselbund von Obsidian fehlt auf diesem Gerät (ab Obsidian 1.11.4). Bitte Obsidian aktualisieren." }; }
      for (const k of Object.keys(L)) lokal(L[k], null);
      caLive = null;
      await riegelSetzen({ adresse, zugang: d.zugang }); // nur ein Server ab 0.7.8 kann so verbinden
      return { ok: true };
    };
    // Dieses Gerät trennen: Mit eigenen Schlüsseln sagt es das zuerst dem Server (der nimmt sie dann nicht mehr an; klappt es nicht,
    // etwa ohne Netz, trennt es trotzdem), dann sind sie hier weg
    const trennen = async () => {
      const v = verbindung();
      if (v && v.geraet) { try { await geraeteSenden(v, { aktion: "trennen", id: v.geraet }); } catch (e) { /* trotzdem trennen */ } }
      riegelHier = "";
      caLive = null;
      try { await sperre().freigeben(); } catch (e) { /* keine Sperre */ }
      try { await abh.geheim.loeschen(abh.geheimId()); } catch (e) { /* schon weg */ }
      for (const k of Object.keys(L)) lokal(L[k], null);
    };
    // Weiteres Gerät verbinden: Code vom Server (POST /v1/geraet). Die Anfrage ist mit dem Datenschlüssel verschlüsselt (Zweck
    // „verbinden“) und trägt Zeit und Zufallswert gegen Wiederholung: Wer nur den Zugangsschlüssel kennt, bekommt so keinen Code.
    // Die Antwort ist ebenso verschlüsselt. Der Code wird nirgends gespeichert. → { ok, code, ablauf, adresse } | { fehler:
    // nicht-verbunden | zugang | zu-viele (mit wieder) | uhr | alt (Server ohne diesen Weg) | paket | netz }
    const geraetCode = async () => {
      const v = verbindung();
      if (!v) return { fehler: "nicht-verbunden" };
      let r;
      try {
        const anfrage = { schema: 1, zeit: abh.jetzt().toISOString(), nonce: b64(crypto.getRandomValues(new Uint8Array(16))) };
        const paket = await verschluesseln(v.schluessel, "verbinden", anfrage);
        r = await senden(v, "/v1/geraet", { method: "POST", body: JSON.stringify(paket) });
      } catch (e) { return { fehler: "netz" }; }
      if (r.status === 401) return { fehler: ablehnung(r) };
      if (r.status === 404) return { fehler: "alt" };
      let o = null;
      try { o = JSON.parse(r.text); } catch (e) { o = null; }
      if (r.status === 429) return o && isoOk(o.wieder) ? { fehler: "zu-viele", wieder: o.wieder } : { fehler: "zu-viele" };
      if (r.status === 400 && o && o.fehler === "uhr") return { fehler: "uhr" };
      if (r.status !== 200) return { fehler: "netz" };
      let d = null;
      // die Antwort eines Servers ab 0.7.8 hat ihren eigenen Zweck (verbinden-antwort), damit keine Anfrage als Antwort durchgeht; einer
      // bis 0.7.7 antwortet mit verbinden, das gilt nur ohne Riegel
      const zweck = o && o.zweck === "verbinden-antwort" ? o.zweck : "verbinden";
      if (zweck === "verbinden" && (await riegelZu(v))) return { fehler: "paket" };
      try { d = await entschluesseln(v.schluessel, zweck, o); } catch (e) { return { fehler: "paket" }; }
      if (!d || !CODE.test(String(d.code || "")) || !isoOk(d.ablauf)) return { fehler: "paket" };
      return { ok: true, code: codeForm(d.code), ablauf: new Date(d.ablauf).toISOString(), adresse: v.adresse };
    };
    // Geräte mit eigenen Schlüsseln (Server ab dieser Fassung, POST /v1/geraete): Die Anfrage { schema: 1, zeit, nonce, aktion, … } ist mit
    // dem Datenschlüssel verschlüsselt (Zweck „geraete“), signiert mit Beweis; die Antwort hat den Zweck „geraete-antwort“. Ein älterer
    // Server kennt den Weg nicht (404). zeit nach der echten Uhr wie die Signatur (anfrageKopf): Der Server misst beide an seiner.
    // → { status, d (entschlüsselt, nur bei 200), r } | wirft (Netz, Antwort ohne Signatur mit Riegel)
    const geraeteSenden = async (v, felder) => {
      const anfrage = Object.assign({ schema: 1, zeit: new Date(Date.now()).toISOString(), nonce: b64(crypto.getRandomValues(new Uint8Array(16))) }, felder);
      const r = await senden(v, "/v1/geraete", { method: "POST", beweis: true, body: JSON.stringify(await verschluesseln(v.schluessel, "geraete", anfrage)) });
      if (r.status !== 200) return { status: r.status, d: null, r };
      let d = null;
      try { d = await entschluesseln(v.schluessel, "geraete-antwort", JSON.parse(r.text)); } catch (e) { d = null; }
      return d && typeof d === "object" ? { status: 200, d, r } : { status: 0, d: null, r };
    };
    // Umzug auf eigene Schlüssel (Server ab dieser Fassung): Ein Gerät ohne Kennung im Schlüsselbund fragt einmal „umziehen“, nur mit
    // Riegel (der Server hat schon signiert geantwortet; senden nimmt dann nur signierte Antworten an). Mit dem gemeinsamen Schlüssel
    // bekommt es eigene, mit eigenen ohne Kennung (verbunden mit 0.7.8 bis 0.7.11) dieselben samt Kennung. Jede Anfrage trägt die Kennung
    // dieses Umzugs (umzug, 16 Zufallsbytes), vorher im Gerätespeicher abgelegt (L.umzug, je Server und Schlüssel): Geht die Antwort
    // verloren oder scheitert der Schlüsselbund, bekommt der nächste Versuch dasselbe Gerät, statt dass der Server ein weiteres anlegt.
    // Erst der Schlüsselbund, dann der Riegel für die neuen (riegelSetzen; mit Kennung gilt er ohnehin): So geht nie ein Bearer mit
    // ihnen. Scheitert etwas, bleibt alles, wie es war, und der nächste Abruf versucht es wieder; nach 404 (älterer Server) oder einem
    // vollen Server (409) erst nach UMZUG_WARTEN, nach 429 (zu viele Umzüge je Stunde) ab wieder. → Verbindung (neu oder die alte)
    let umzugNicht = 0;
    const umzugKennung = async (v) => {
      const id = await riegelId(v), x = objekt(lokal(L.umzug));
      if (x.id === id && /^[A-Za-z0-9_-]{22}$/.test(String(x.kennung || ""))) return x.kennung;
      const kennung = b64(crypto.getRandomValues(new Uint8Array(16)));
      lokal(L.umzug, { id, kennung });
      return kennung;
    };
    const umziehen = async (v) => {
      if (v.geraet || jetztMs() < umzugNicht || !(await riegelZu(v))) return v;
      let x;
      try { x = await geraeteSenden(v, Object.assign({ aktion: "umziehen", umzug: await umzugKennung(v) }, geraetName() ? { name: geraetName() } : {})); } catch (e) {
        // ein Server von 0.7.8 bis 0.7.11 signiert seine 404 für einen unbekannten Weg nicht
        x = { status: e && e.antwort ? e.antwort.status : 0 };
      }
      if (x.status === 404 || x.status === 409) umzugNicht = jetztMs() + UMZUG_WARTEN;
      if (x.status === 429) {
        let o = null;
        try { o = JSON.parse(x.r.text); } catch (e) { o = null; }
        umzugNicht = o && isoOk(o.wieder) ? Date.parse(o.wieder) : jetztMs() + 60 * MIN;
      }
      const d = x.d;
      if (!d || adresseNormal(d.adresse, abh.lokalErlaubt) !== v.adresse || !SCHLUESSEL.test(String(d.zugang)) || !SCHLUESSEL.test(String(d.schluessel)) ||
        !GERAET_ID.test(String(d.geraet || ""))) return v;
      const neu = { adresse: v.adresse, zugang: d.zugang, schluessel: d.schluessel, geraet: d.geraet };
      try { await abh.geheim.schreiben(abh.geheimId(), JSON.stringify(neu)); } catch (e) { return v; }
      lokal(L.umzug, null);
      await riegelSetzen(neu);
      return neu;
    };
    // Ein anderes Gerät trennen (Fenster, Liste der Geräte): Der Server nimmt seine Schlüssel ab sofort nicht mehr an, und mit ihm, was
    // über seine Codes verbunden wurde (Geräte, Verbindungen der Claude-App), außer behalten (Kennungen). → { ok: true, getrennt: [Kennung] }
    // | { fehler: nicht-verbunden | unbekannt (schon getrennt) | speichern (der Server konnte es nicht speichern: getrennt nur bis zu seinem
    // Neustart) | zugang | erneuert | uhr | alt | netz }
    const geraetTrennen = async (id, behalten) => {
      const v = verbindung();
      if (!v) return { fehler: "nicht-verbunden" };
      let x;
      const mit = (Array.isArray(behalten) ? behalten : []).map(String).filter((k) => CA_ID.test(k)).slice(0, 64);
      try { x = await geraeteSenden(v, Object.assign({ aktion: "trennen", id: String(id || "") }, mit.length ? { behalten: mit } : {})); } catch (e) { return { fehler: "netz" }; }
      if (x.status === 401) return { fehler: ablehnung(x.r) };
      if (x.status === 404) return { fehler: "unbekannt" };
      if (x.status === 503) return { fehler: "speichern" };
      if (x.status !== 200) return { fehler: x.status === 400 && /"uhr"/.test(String(x.r.text || "")) ? "uhr" : "netz" };
      await statusHolen(v, true);
      const getrennt = (Array.isArray(x.d.getrennt) ? x.d.getrennt : []).map(String).filter((k) => GERAET_ID.test(k));
      if (caLive && getrennt.length) caLive = Object.assign({}, caLive, { verbindungen: caLive.verbindungen.filter((e) => !e.von || getrennt.indexOf(e.von) < 0 || mit.indexOf(e.id) >= 0) });
      return { ok: true, getrennt };
    };
    // Adresse des Servers für „Mit Code verbinden“: aus dem Schlüsselbund (Schlüssel abgelehnt), sonst aus server.json → Ursprung | ""
    const adresseBekannt = async () => {
      const v = verbindung();
      return v ? v.adresse : (await zustandLesen()).z.adresse;
    };
    // Adresse aus dem Schlüsselbund dieses Geräts (geprüft beim Verbinden) → Ursprung | ""
    const adresseGeprueft = () => { const v = verbindung(); return v ? v.adresse : ""; };
    // Mit Code verbinden: Code von „Weiteres Gerät verbinden“ (oder aus der Cloud Shell) eingetippt, die Adresse eingetippt (ohne
    // Eingabe nur die aus dem Schlüsselbund, nie die aus server.json); dann wie beim Link (Rückfrage, Einlösen). → wie verbinden;
    // fehlt die Adresse: { ok: false, adresse: true, fehler }
    const codeVerbinden = async (codeRoh, adresseRoh) => {
      const code = codeForm(codeRoh);
      if (!CODE.test(code)) return { ok: false, fehler: "Der Code hat 10 Zeichen, etwa ABCDE-FGHJK." };
      const eingabe = String(adresseRoh == null ? "" : adresseRoh).trim();
      const adresse = eingabe ? adresseEingabe(eingabe, abh.lokalErlaubt) : adresseGeprueft();
      if (!adresse) {
        return { ok: false, adresse: true, fehler: eingabe ? "Die Adresse stimmt nicht. Sie steht auf dem Gerät, das den Code erzeugt hat, unter dem Code."
          : "Gib dazu die Adresse deines Servers ein. Sie steht auf dem Gerät, das den Code erzeugt hat, unter dem Code." };
      }
      return verbinden(adresse, code, { getippt: true, adresseGetippt: !!eingabe });
    };

    // ----- Claude-App -----
    // POST /v1/claude-app: Anfrage { schema, zeit, nonce, aktion, id? } mit dem Datenschlüssel verschlüsselt (Zweck claude-app) und mit
    // dem Beweis des Datenschlüssels signiert: Wer nur den Zugangsschlüssel kennt, bekommt keinen Code und trennt nichts. Antwort mit
    // eigenem Zweck (claude-app-antwort). → { ok, d, v } | { fehler: nicht-verbunden | alt (404: Server ohne Connector) | abgeschaltet
    // (503) | zu-viele (mit wieder) | uhr | nochmal | zugang | erneuert | paket | netz }
    let caLive = null; // was der Server zuletzt auf eine Anfrage dieses Geräts sagte, nur im Speicher
    const caAnfrage = async (aktion, id) => {
      const v = verbindung();
      if (!v) return { fehler: "nicht-verbunden" };
      let r;
      try {
        const anfrage = Object.assign({ schema: 1, zeit: abh.jetzt().toISOString(), nonce: b64(crypto.getRandomValues(new Uint8Array(16))), aktion }, id ? { id } : {});
        const paket = await verschluesseln(v.schluessel, "claude-app", anfrage);
        r = await senden(v, "/v1/claude-app", { method: "POST", body: JSON.stringify(paket), beweis: true, fehlt404: true });
      } catch (e) { return { fehler: "netz" }; }
      if (r.status === 401) return { fehler: ablehnung(r) };
      if (r.status === 404) return { fehler: "alt" };
      let o = null;
      try { o = JSON.parse(r.text); } catch (e) { o = null; }
      const grund = o && typeof o.fehler === "string" ? o.fehler : "";
      if (r.status === 503) return { fehler: "abgeschaltet" };
      if (r.status === 429) {
        let wieder = o && isoOk(o.wieder) ? new Date(o.wieder).toISOString() : "";
        const sek = String(objekt(r.headers)["retry-after"] || "").trim();
        if (!wieder && /^\d{1,7}$/.test(sek)) wieder = new Date(jetztMs() + Number(sek) * 1000).toISOString();
        return wieder ? { fehler: "zu-viele", wieder } : { fehler: "zu-viele" };
      }
      if (r.status === 400) return { fehler: grund === "uhr" ? "uhr" : "nochmal" };
      // ohne Beweis (datenschluessel) bzw. über den Weg bis 0.7.7 (veraltet)
      if (r.status === 403) return { fehler: grund === "veraltet" ? "alt" : "zugang" };
      if (r.status === 409) return { fehler: "nochmal" };
      if (r.status !== 200) return { fehler: "netz" };
      try {
        const d = await entschluesseln(v.schluessel, "claude-app-antwort", o);
        return d && typeof d === "object" ? { ok: true, d, v } : { fehler: "paket" };
      } catch (e) { return { fehler: "paket" }; }
    };
    // Adresse für claude.ai: nur https://<Host dieses Servers>/mcp (lokal im Test auch http://127.0.0.1:<port>/mcp) → Text | ""
    const caAdresse = (s, v) => {
      let u;
      try { u = new URL(String(s || "")); } catch (e) { return ""; }
      return u.pathname === "/mcp" && !u.search && !u.hash && !u.username && !u.password && adresseNormal(u.origin, abh.lokalErlaubt) === v.adresse ? v.adresse + "/mcp" : "";
    };
    // Antwort mit Stand (status, trennen, aus) → { ok, stand } | Fehler wie caAnfrage
    const caStand = (r) => {
      if (!r.ok) return r;
      const c = claudeAppNormal(r.d);
      if (!c) return { fehler: "paket" };
      caLive = c;
      return { ok: true, stand: c };
    };
    // Mit der Claude-App verbinden: Rückfrage (was Claude lesen kann), dann ein Code vom Server. Er steht nirgends außer im Fenster.
    // → { ok, code, ablauf, adresse } | { abgebrochen } | Fehler wie caAnfrage
    const claudeAppCode = async () => {
      if (!verbindung()) return { fehler: "nicht-verbunden" };
      if (!(await abh.bestaetigen("Mit der Claude-App verbinden?", CA_LESEN, "Code erzeugen"))) return { abgebrochen: true };
      const r = await caAnfrage("code");
      if (!r.ok) return r;
      const adresse = caAdresse(r.d.adresse, r.v);
      if (!CODE.test(codeForm(r.d.code)) || !isoOk(r.d.ablauf) || !adresse) return { fehler: "paket" };
      // ab dem Code ist die Claude-App auf dem Server an
      caLive = Object.assign({ verbindungen: [] }, caLive || caTresor || {}, { an: true });
      return { ok: true, code: codeForm(r.d.code), ablauf: new Date(r.d.ablauf).toISOString(), adresse };
    };
    const claudeAppStatus = async () => caStand(await caAnfrage("status"));
    const claudeAppTrennen = async (id) => {
      if (!CA_ID.test(String(id || ""))) return { fehler: "nochmal" };
      if (!(await abh.bestaetigen("Claude-App trennen?", "Claude kann danach nichts mehr lesen. Neu verbinden geht jederzeit mit einem neuen Code.", "Trennen"))) return { abgebrochen: true };
      return caStand(await caAnfrage("trennen", String(id)));
    };
    const claudeAppAus = async () => {
      if (!(await abh.bestaetigen("Claude-App ganz ausschalten?", "Alle Verbindungen zur Claude-App werden getrennt, und dein Server gibt Claude nichts " +
        "mehr. Wieder einschalten kannst du sie mit „Mit der Claude-App verbinden“.", "Ausschalten"))) return { abgebrochen: true };
      return caStand(await caAnfrage("aus"));
    };
    // Bester Stand für das Fenster: die letzte Antwort an dieses Gerät, sonst server.json → { an, verbindungen } | null
    const claudeAppStand = async () => caLive || (await zustandLesen()).z.claude_app || null;
    // Neue Verbindungen der letzten tage Tage aus server.json (bekannt, neueste zuerst; eine Uhr bis 5 Minuten vor zählt mit)
    const caNeu = (ca, tage) => (ca && Array.isArray(ca.bekannt) ? ca.bekannt : []).filter((e) => {
      const t = Date.parse(e.seit);
      return t <= jetztMs() + 5 * MIN && jetztMs() - t <= tage * 1440 * MIN;
    });
    // Für „Seit deinem letzten Besuch“: frisch aus server.json, also auf jedem Gerät
    const claudeAppNeu = async (o) => caNeu((await zustandLesen()).z.claude_app, (o && o.tage) || CA_NEU_TAGE);

    // ----- Notizen -----
    // Notizen vom Server je claude_id (bei Doppel die mit dem kürzesten Namen, wie dubletten) und alle übrigen Termine
    const notizenLesen = () => {
      const claude = {}, andere = [], alle = [];
      for (const n of io.terminNotizen()) {
        const fm = n.fm || {};
        const b = Q.besitz(fm);
        if (b && b.quelle === "claude" && ID.test(b.id)) {
          alle.push(n);
          const alt = claude[b.id], kurz = (x) => x.pfad.slice(x.pfad.lastIndexOf("/") + 1);
          if (!alt || kurz(n).length < kurz(alt).length || (kurz(n).length === kurz(alt).length && kurz(n) < kurz(alt))) claude[b.id] = n;
          continue;
        }
        const datum = s10(fm.datum);
        const name = n.pfad.slice(n.pfad.lastIndexOf("/") + 1).replace(/\.md$/, "");
        if (datum) andere.push({ pfad: n.pfad, datum, titel: String(fm.titel || name.replace(/^\d{4}-\d{2}-\d{2} /, "")), zentral: fm.herkunft === "zentral" });
      }
      return { claude, andere, gruppen: Q.doppelGruppen(alle, (n) => String(n.fm.claude_id)) };
    };
    // Doppel einer id (Sync-Verzug, Konfliktkopie) zusammenführen wie die anderen Quellen: kürzester Name bleibt, erledigt
    // gewinnt, eigene Zeilen der anderen kommen dazu, die anderen in den Papierkorb
    const doppelZusammen = async (gruppen, b) => {
      for (const g of gruppen) {
        const mit = [];
        for (const n of g) { const text = await io.lesenText(n.pfad); if (text != null) mit.push({ pfad: n.pfad, fm: n.fm, text }); }
        if (mit.length < 2) continue;
        const r = Q.dubletten(mit);
        let text = r.text != null ? r.text : mit.find((x) => x.pfad === r.bleibt).text;
        if (r.erledigt) text = text.replace(/^erledigt: false[ \t]*$/m, "erledigt: true");
        if (r.text != null || r.erledigt) await io.schreibenText(r.bleibt, text);
        for (const w of r.weg) { await io.papierkorb(w); b.zusammengefuehrt.push({ pfad: w, zu: r.bleibt }); }
      }
    };
    const doppeltZu = (e, andere) => andere.find((a) => Math.abs(tage(a.datum, e.datum)) <= 1 && aehnlich(a.titel, e.titel)) || null;
    // Derselbe Termin kam inzwischen auch über die zentralen Daten: unberührte Notiz vom Server → Papierkorb (die zentrale bleibt)
    const zentralWeicht = async (notizen, b) => {
      const zentrale = notizen.andere.filter((a) => a.zentral);
      if (!zentrale.length) return;
      for (const id of Object.keys(notizen.claude)) {
        const n = notizen.claude[id], fm = n.fm || {}, datum = s10(fm.datum);
        if (!datum || fm.entfaellt === true) continue;
        const zu = zentrale.find((a) => Math.abs(tage(a.datum, datum)) <= 1 && aehnlich(a.titel, String(fm.titel || "")));
        if (!zu) continue;
        const text = await io.lesenText(n.pfad);
        if (text == null || !Q.unberuehrt(fm, text)) continue;
        await io.papierkorb(n.pfad);
        delete notizen.claude[id];
        b.zusammengefuehrt.push({ pfad: n.pfad, zu: zu.pfad });
      }
    };
    // Inhalt einer Termin-Notiz vom Server: wie eine zentrale, aber herkunft: claude und claude_id. claude_id vorher aus dem
    // alten Kopf nehmen, sonst behielte notizText sie als eigenes Feld.
    const notizText = (alt, e, o) => {
      const t = String(alt || "");
      const kopf = t.match(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/);
      const ohne = kopf ? kopf[0].replace(/^claude_id:.*(?:\r?\n|$)/gm, "") + t.slice(kopf[0].length) : t;
      const neu = abh.zentral().notizText(ohne, e, o).replace(/^herkunft: zentral$/m, "herkunft: claude").replace(/^zentral_id: /m, "claude_id: ");
      return o.entfaellt ? neu.replace(ENTFAELLT_ZENTRAL, ENTFAELLT_SERVER) : neu;
    };
    const freierPfad = (ordner, basis, eigene) => {
      let name = basis, i = 2;
      while (io.existiert(`${ordner}/${name}.md`) && `${ordner}/${name}.md` !== eigene) name = `${basis} ${i++}`;
      return `${ordner}/${name}.md`;
    };

    const terminAnwenden = async (e, entfaellt, z, b, notizen) => {
      const h = Q.kurzHash([e, entfaellt]);
      const soll = { modulLink: abh.modulLink(e.code), entfaellt };
      const f = notizen.claude[e.id];
      if (!f) {
        if (Q.geloescht(z.angewendet, e.id, h)) { b.ausgeblendet++; return ""; } // von dir gelöscht, Termin unverändert
        if (b.angelegt.length >= NEU_JE_ABRUF) return "voll"; // Rest beim nächsten Abruf
        z.angewendet[e.id] = h;
        if (entfaellt) return ""; // abgesagt, bevor es eine Notiz gab
        if ((e.bis || e.datum) < heute()) return ""; // schon vorbei (Datei lag lange auf dem Server)
        const d = doppeltZu(e, notizen.andere);
        if (d) { b.doppelt.push({ titel: e.titel, datum: e.datum, zu: d.pfad }); return "doppelt"; }
        const pfad = freierPfad(ORDNER, abh.zentral().dateiName(e.datum, e.titel), "");
        await io.schreibenText(pfad, notizText("", e, soll));
        notizen.claude[e.id] = { pfad, fm: { herkunft: "claude", claude_id: e.id } };
        b.angelegt.push(pfad);
        return "neu";
      }
      z.angewendet[e.id] = h;
      const alt = await io.lesenText(f.pfad);
      if (alt == null) return "";
      const neu = notizText(alt, e, soll);
      let art = "";
      if (neu !== alt) { await io.schreibenText(f.pfad, neu); (entfaellt ? b.entfaellt : b.aktualisiert).push(f.pfad); art = "geaendert"; }
      // neues Datum → im selben Ordner umbenennen (Nutzerteile bleiben, Links zieht Obsidian nach)
      const ordner = f.pfad.slice(0, f.pfad.lastIndexOf("/"));
      if (f.pfad.slice(ordner.length + 1, ordner.length + 11) !== e.datum) {
        const ziel = freierPfad(ordner, abh.zentral().dateiName(e.datum, e.titel), f.pfad);
        if (ziel !== f.pfad) { await io.umbenennen(f.pfad, ziel); b.umbenannt.push(f.pfad + " → " + ziel); notizen.claude[e.id] = { pfad: ziel, fm: f.fm }; art = "geaendert"; }
      }
      // fürs Rückgängig: geänderte Zeilen, Prüfsumme danach, Ort vorher und nachher
      if (art) b.rueck.push(Object.assign({ art: "termin", pfad: notizen.claude[e.id].pfad, pfadAlt: f.pfad, hash: hash32(neu), zeit: abh.jetzt().toISOString() }, zeilenDiff(alt, neu)));
      return art;
    };

    // → true, wenn die Datei ganz übernommen ist; false bei erreichter Grenze (dann wird sie beim nächsten Abruf weiter übernommen,
    // Hinweise und Lauf erst dann, damit nichts doppelt erscheint)
    const dateiAnwenden = async (name, inhalt, z, b, notizen) => {
      const zeit = isoOk(inhalt.erstellt) ? new Date(inhalt.erstellt).toISOString() : abh.jetzt().toISOString();
      const lauf = { datei: name, zeit, termine: 0, hinweise: 0, begleitnotizen: 0, lernplaene: 0, doppelt: 0, todos: 0, verworfen: 0 };
      const roh = Array.isArray(inhalt.termine) ? inhalt.termine.slice(0, 300) : [];
      const p = abh.zentral().terminePruefen({ schema: 1, termine: roh });
      if (p.fehler) { b.verworfen.push({ id: name, grund: p.fehler }); lauf.verworfen++; }
      else {
        const entfaellt = {};
        for (const e of roh) if (e && typeof e.id === "string" && e.entfaellt === true) entfaellt[e.id] = true;
        for (const e of p.termine) {
          if (!ID.test(e.id)) { b.verworfen.push({ id: e.id, grund: "id nicht vom Server" }); lauf.verworfen++; continue; }
          const art = await terminAnwenden(e, !!entfaellt[e.id], z, b, notizen);
          if (art === "voll") return false;
          if (art === "neu" || art === "geaendert") lauf.termine++;
          else if (art === "doppelt") lauf.doppelt++;
        }
        b.verworfen = b.verworfen.concat(p.verworfen);
        lauf.verworfen += p.verworfen.length;
      }
      for (const h of (Array.isArray(inhalt.hinweise) ? inhalt.hinweise : []).slice(0, 50)) {
        const text = reinerText(h && h.text, 300);
        if (!text) continue;
        const quelle = reinerText(h && h.quelle, 200);
        // Modul, zu dem der Hinweis gehört (seit 01.11.2026; ein älterer Server schickt keins): Modulfeld und „Seit deinem letzten Besuch“
        const code = MODULCODE_SERVER.test(String((h && h.code) || "")) ? String(h.code) : "";
        if (z.hinweise.some((x) => x.text === text)) continue; // schon da (ein älterer Server sortiert Wiederholungen nicht aus)
        z.hinweise.push(Object.assign(quelle ? { text, quelle, zeit } : { text, zeit }, code ? { code } : {}));
        lauf.hinweise++; b.hinweise++;
      }
      z.hinweise = z.hinweise.slice(-HINWEISE);
      for (const bn of (Array.isArray(inhalt.begleitnotizen) ? inhalt.begleitnotizen : []).slice(0, 50)) {
        if (await begleitnotizAnwenden(bn, z, b)) lauf.begleitnotizen++;
      }
      lauf.todos = await todoDoppelAnwenden((Array.isArray(inhalt.todo_doppel) ? inhalt.todo_doppel : []).slice(0, 50), b);
      const listen = Array.isArray(inhalt.kapitel) ? inhalt.kapitel.slice(0, 60) : [];
      if (listen.length) await kapitelAnwenden(listen, lauf, b);
      z.laeufe.push(lauf);
      z.laeufe = z.laeufe.slice(-LAEUFE);
      return true;
    };

    // Eine Begleitnotiz vom Server in die Notiz neben der PDF; dieselbe Lieferung nie zweimal (begleitet). → true, wenn geschrieben
    const begleitnotizAnwenden = async (bn, z, b) => {
      const pdf = bn && typeof bn.datei === "string" ? bn.datei.replace(/\\/g, "/") : "";
      if (!/^Unterlagen\/.+\.pdf$/i.test(pdf) || pdf.length > 240 || pdf.split("/").some((t) => !t || t === "." || t === "..")) {
        b.verworfen.push({ id: "begleitnotiz", grund: "datei unzulässig" });
        return false;
      }
      const sauber = begleitnotizSauber(bn);
      const h = Q.kurzHash(sauber);
      if (z.begleitet[pdf] === h) return false;
      const pfad = io.begleitnotiz ? io.begleitnotiz(pdf) : "";
      const text = pfad ? await io.lesenText(pfad) : null;
      z.begleitet[pdf] = h;
      if (text == null) return false; // PDF verschoben oder Notiz gelöscht: nichts anlegen
      const ergaenzt = begleitnotizErgaenzen(text, sauber, pdf.slice(pdf.lastIndexOf("/") + 1));
      const neu = wunschWeg(ergaenzt == null ? text : ergaenzt); // der Wunsch (Knopf „Zusammenfassen“) ist erledigt
      if (neu === text) return false;
      await io.schreibenText(pfad, neu);
      if (ergaenzt == null) return false;
      b.begleitnotizen.push(pfad);
      return true;
    };

    // Doppelte To-dos (Paare aus Kennungen des Auszugs): die Zeile „weg“ wird zu „- <Text> – steht schon in [[Notiz]]“. Nur
    // wenn „weg“ eine offene Aufgabe unter „Zu tun“ einer Begleitnotiz ist (aenderbar, frisch aus dem Tresor), „behalten“ offen
    // ist und die Zeile noch genau so dasteht; keine Ketten. → Anzahl
    const todoDoppelAnwenden = async (paare, b) => {
      const behalten = lokal(L.behalten), nie = Array.isArray(behalten) ? behalten : []; // von dir zurückgenommen
      const gueltig = paare.filter((p) => p && TODO_ID.test(String(p.behalten)) && TODO_ID.test(String(p.weg)) && p.behalten !== p.weg && nie.indexOf(p.weg) < 0);
      if (!gueltig.length || !abh.tresor) return 0;
      let t;
      try { t = objekt(await abh.tresor()); } catch (e) { return 0; }
      const nachId = {};
      for (const x of Array.isArray(t.todos) ? t.todos : []) if (x && TODO_ID.test(String(x.id))) nachId[x.id] = x;
      const weg = {}, bleibt = {};
      let n = 0;
      for (const p of gueltig) {
        const a = nachId[p.behalten], w = nachId[p.weg];
        if (!a || !w || w.aenderbar !== true || weg[a.id] || weg[w.id] || bleibt[w.id] || a.pfad === undefined) continue;
        const m = String(w.roh || "").match(AUFGABE);
        const text = m ? await io.lesenText(w.pfad) : null;
        if (text == null) continue;
        const zeilen = text.split("\n");
        const roh = (zeilen[w.nr] || "").replace(/\r$/, "");
        if (roh !== w.roh) continue; // inzwischen geändert
        const ziel = String(a.pfad).replace(/\.md$/, "");
        const neu = m[1] + m[2] + ` – steht schon in [[${ziel}|${ziel.slice(ziel.lastIndexOf("/") + 1)}]]`;
        zeilen[w.nr] = neu + (zeilen[w.nr].endsWith("\r") ? "\r" : "");
        await io.schreibenText(w.pfad, zeilen.join("\n"));
        b.rueck.push({ art: "todo", pfad: w.pfad, id: w.id, alt: roh, neu, zeit: abh.jetzt().toISOString() }); // fürs Rückgängig
        weg[w.id] = true; bleibt[a.id] = true; n++;
        b.todoDoppel.push(w.pfad);
      }
      return n;
    };

    // Textfassungen von Lehrmaterial ohne Zusammenfassung an den Server (Claude schreibt die Begleitnotiz); je Abruf bis zu 9 in
    // Anfragen zu 3, jede PDF (Kennung = SHA-256) nur einmal, eine gewünschte (angefordert, Knopf „Zusammenfassen“) mit Opus und
    // wieder, wenn sie nach dem letzten Senden noch einmal gewünscht wurde; mit pdf: true zuerst die PDF selbst (POST /v1/pdf;
    // nimmt der Server sie nicht, etwa ein älterer, liest Claude den Text). Klappt eine Anfrage nicht (Netz, schon zu viele
    // warten), kommt der Rest beim nächsten Abruf. Ein Server vor 0.6.3 kennt die Art Lab nicht und nimmt sie stillschweigend nicht an
    // (Antwort angenommen kleiner): die geht nach NACHSENDEN_TAGE noch einmal, dann hat er sich aktualisiert (b.serverAelter). → Anzahl
    const unterlagenSenden = async (v, z, b) => {
      for (const k of Object.keys(z.nachsenden)) if (alterMs(z.nachsenden[k]) > NACHSENDEN_TAGE * 1440 * MIN) { delete z.gesendet[k]; delete z.nachsenden[k]; }
      let liste = [];
      try { liste = abh.unterlagen ? await abh.unterlagen({ ohne: z.gesendet, hoechstens: UNTERLAGEN_JE_ABRUF }) : []; } catch (e) { liste = []; }
      const offen = (Array.isArray(liste) ? liste : []).filter((u) => u && /^[0-9a-f]{64}$/.test(String(u.kennung)) &&
        ARTEN_SENDEN.indexOf(u.art) >= 0 && typeof u.text === "string" && u.text.trim() &&
        (u.angefordert ? !(String(z.gesendet[u.kennung] || "") >= String(u.angefordert).slice(0, 16)) : !z.gesendet[u.kennung])).slice(0, UNTERLAGEN_JE_ABRUF)
        .map((u) => ({ datei: String(u.datei), kennung: u.kennung, art: u.art, titel: reinerText(String(u.titel || ""), 160), code: String(u.code || ""),
          seiten: Number.isInteger(u.seiten) ? u.seiten : 0, ...(u.angefordert ? { modell: "opus", angefordert: String(u.angefordert).slice(0, 16), pdf: u.pdf === true } : u.nur_termine === true ? { nur_termine: true } : {}),
          // frühere Fassung (fassung.js kontext); ein Server vor 0.6.9 übergeht das Feld
          ...(u.fassung && typeof u.fassung === "object" && !u.nur_termine ? { fassung: u.fassung } : {}),
          text: u.text.slice(0, 400000) }));
      let n = 0;
      for (let i = 0; i < offen.length; i += UNTERLAGEN_JE_ANFRAGE) {
        const teil = offen.slice(i, i + UNTERLAGEN_JE_ANFRAGE);
        let angenommen;
        try {
          for (const u of teil) {
            let pdf = null;
            try { pdf = u.pdf && abh.pdf ? await abh.pdf(u.datei) : null; } catch (e) { pdf = null; }
            if (!pdf || !pdf.length || pdf.length > PDF_MAX) continue;
            // Stück für Stück: Kopfzeile (JSON), Zeilenumbruch, Bytes; nimmt der Server eins nicht, bleibt es beim Text
            const teile = Math.ceil(pdf.length / PDF_TEIL);
            for (let j = 0; j < teile; j++) {
              const kopf = kodieren(JSON.stringify({ schema: 1, kennung: u.kennung, teil: j, teile }) + "\n"), stueck = pdf.subarray(j * PDF_TEIL, (j + 1) * PDF_TEIL);
              const klar = new Uint8Array(kopf.length + stueck.length);
              klar.set(kopf);
              klar.set(stueck, kopf.length);
              const r = await senden(v, "/v1/pdf", { method: "POST", body: JSON.stringify(await verschluesselnRoh(v.schluessel, "pdf", klar)) });
              if (r.status !== 200) break;
            }
          }
          const paket = await verschluesseln(v.schluessel, "unterlagen", { schema: 1, unterlagen: teil.map((u) => { const x = Object.assign({}, u); delete x.angefordert; delete x.pdf; return x; }) });
          const r = await senden(v, "/v1/unterlagen", { method: "POST", body: JSON.stringify(paket) });
          if (r.status !== 200) break;
          angenommen = objekt(JSON.parse(r.text || "null")).angenommen;
        } catch (e) { break; }
        // gewünschte mindestens mit der Zeit des Wunsches (geht die Uhr dieses Geräts nach, sonst jeder Abruf noch einmal)
        const jetzt = abh.jetzt().toISOString().slice(0, 16);
        for (const u of teil) z.gesendet[u.kennung] = u.angefordert && u.angefordert > jetzt ? u.angefordert : jetzt;
        const lab = teil.filter((u) => u.art === "Lab");
        if (lab.length && Number.isInteger(angenommen) && angenommen <= teil.length - lab.length) {
          for (const u of lab) z.nachsenden[u.kennung] = jetzt;
          b.serverAelter = true;
        }
        n += teil.length;
      }
      return n;
    };

    // Kapitellisten aus dem Eingang (Form von kapitel.json → module): lernplan.js prüft sie wie kapitel.json und schreibt
    // Lernplan/<Code> Lernplan.md (herkunft: server) nur für Module des laufenden Semesters ohne zentrale Liste; Häkchen und
    // eigener Text bleiben. Fehlt serverListen (älteres lernplan.js), bleiben sie aus; der Server schickt dann auch keine, denn der
    // Stand fragt nicht danach (lernplanAuswahl). Zählt in lauf.lernplaene und b.lernplaene, Verworfenes wie bei den Terminen.
    const kapitelAnwenden = async (listen, lauf, b) => {
      const L = abh.lernplan ? abh.lernplan() : null;
      if (!L || typeof L.serverListen !== "function") return;
      let r;
      try { r = objekt(await L.serverListen(listen)); } catch (e) {
        console.error("server: Lernplan", e);
        b.verworfen.push({ id: "kapitel", grund: "nicht übernommen" }); lauf.verworfen++;
        return;
      }
      for (const x of Array.isArray(r.verworfen) ? r.verworfen.slice(0, 60) : []) {
        b.verworfen.push({ id: reinerText(String((x && x.id) || "kapitel"), 80), grund: reinerText(String((x && x.grund) || ""), 200) });
        lauf.verworfen++;
      }
      const n = Number.isInteger(r.geschrieben) && r.geschrieben > 0 ? r.geschrieben : 0;
      lauf.lernplaene += n; b.lernplaene += n;
    };

    // Folien für Kapitellisten an den Server (POST /v1/kapitel): je Abruf bis zu KAPITEL_JE_ABRUF in Anfragen zu 3, jede PDF
    // (Kennung) einmal (server.json „lernplan“), der Text gekürzt (kapitelText). Erst nach dem Stand, denn der Server legt Folien
    // von Modulen beiseite, nach denen der Stand nicht fragt. Kennt ein älterer Server den Weg nicht (404) oder warten dort schon
    // zu viele, bleibt alles ungemerkt und geht beim nächsten Abruf. → Anzahl
    const kapitelSenden = async (v, z) => {
      let liste = [];
      try { liste = abh.kapitelUnterlagen ? await abh.kapitelUnterlagen({ ohne: z.lernplan, hoechstens: KAPITEL_JE_ABRUF }) : []; } catch (e) { liste = []; }
      const offen = (Array.isArray(liste) ? liste : []).filter((u) => u && /^[0-9a-f]{64}$/.test(String(u.kennung)) && !z.lernplan[u.kennung] &&
        MODULCODE_SERVER.test(String(u.code)) && typeof u.text === "string" && u.text.trim()).slice(0, KAPITEL_JE_ABRUF)
        .map((u) => ({ datei: String(u.datei), kennung: u.kennung, art: "Folien", titel: reinerText(String(u.titel || ""), 160), code: u.code,
          nummer: Number.isInteger(u.nummer) && u.nummer >= 0 && u.nummer <= 99 ? u.nummer : null, seiten: Number.isInteger(u.seiten) ? u.seiten : 0,
          datum: s10(u.datum), quelle: reinerText(String(u.quelle || ""), 200), ganz: KAPITEL_GANZ, text: kapitelText(u.text, KAPITEL_GANZ) }));
      let n = 0;
      for (let i = 0; i < offen.length; i += UNTERLAGEN_JE_ANFRAGE) {
        const teil = offen.slice(i, i + UNTERLAGEN_JE_ANFRAGE);
        try {
          const paket = await verschluesseln(v.schluessel, "kapitel", { schema: 1, unterlagen: teil });
          const r = await senden(v, "/v1/kapitel", { method: "POST", body: JSON.stringify(paket) });
          if (r.status !== 200) break;
        } catch (e) { break; }
        const jetzt = abh.jetzt().toISOString().slice(0, 16);
        for (const u of teil) z.lernplan[u.kennung] = jetzt;
        n += teil.length;
      }
      return n;
    };

    // Auszug aus dem Tresor (tresor.json für Claude auf dem Server): nur diese Felder, Grenzen wie der Dienst (400 Termine,
    // 200 To-dos), nichts mit Zugangsdaten (siehtGeheimAus: Titel eines Termins, Text und Notiz eines To-dos, vor dem Kürzen)
    const geheim = (v) => siehtGeheimAus(v, abh.ohneKennwort);
    const tresorKurz = (t) => ({
      termine: (Array.isArray(t.termine) ? t.termine : []).filter((e) => e && s10(e.datum) && !geheim(e.titel)).slice(0, 400).map((e) => ({
        titel: reinerText(String(e.titel || ""), 120), datum: s10(e.datum), bis: s10(e.bis), kategorie: reinerText(String(e.kategorie || ""), 20),
        code: reinerText(String(e.code || ""), 8), herkunft: reinerText(String(e.herkunft || ""), 30), erledigt: e.erledigt === true })),
      todos: (Array.isArray(t.todos) ? t.todos : []).filter((e) => e && !geheim(e.text) && !geheim(e.pfad))
        .map((e) => Object.assign({ text: reinerText(String(e.text || ""), 200), code: reinerText(String(e.code || ""), 8),
          frist: s10(e.frist) }, TODO_ID.test(String(e.id)) ? { id: e.id } : {}, typeof e.pfad === "string" && e.pfad.length <= 240 ? { pfad: e.pfad } : {},
          e.aenderbar === true ? { aenderbar: true } : {})).filter((e) => e.text).slice(0, 200),
    });
    // Bisherige Kapitellisten aus den Lernplan-Notizen vom Server (herkunft: server; abh.lernplanNotizen), für den Stand: Fehlt dem
    // Server sein Bestand (neu eingerichtet), behält Claude damit Nummern und Titel, an denen die Häkchen hängen. Höchstens
    // LISTEN_ZEICHEN zusammen. → [{ code, kapitel }]
    const lernplanListen = async (codes) => {
      const L = abh.lernplan ? abh.lernplan() : null;
      if (!codes.length || !L || typeof L.kapitelLesen !== "function" || !abh.lernplanNotizen) return [];
      let notizen = [], zeilen = {};
      try { notizen = await abh.lernplanNotizen(codes); } catch (e) { notizen = []; }
      // Nur Zeilen der zuletzt geschriebenen Liste (lernplan.js kennt sie), eigene Aufgaben mit Nummer vorn bleiben im Tresor
      try { const st = L.serverStand ? await L.serverStand() : null; zeilen = objekt(st && st.zeilen); } catch (e) { zeilen = {}; }
      const aus = [];
      let zeichen = 0;
      for (const n of Array.isArray(notizen) ? notizen : []) {
        if (!n || codes.indexOf(n.code) < 0 || aus.some((x) => x.code === n.code)) continue;
        const kapitel = listeAusNotiz(n.text, L.listeLesen ? (t) => L.listeLesen(t, zeilen[n.code]) : L.kapitelLesen);
        zeichen += JSON.stringify(kapitel).length;
        if (zeichen > LISTEN_ZEICHEN) break;
        if (kapitel.length) aus.push({ code: n.code, kapitel });
      }
      return aus;
    };
    // Stand ans Server-Gerät: übernommene Dateien sofort, sonst nur bei Änderung oder nach STAND_ALTER. lage: dazu das Lagebild für
    // die Claude-App (nur solange sie an ist; sonst fehlt das Feld ganz)
    const standSenden = async (v, quittung, lage) => {
      let s, t;
      try { s = abh.stand() || {}; } catch (e) { s = {}; }
      try { t = abh.tresor ? objekt(await abh.tresor()) : {}; } catch (e) { t = {}; }
      const stand = { schema: 1, module: (Array.isArray(s.module) ? s.module : []).slice(0, 80), studienbeginn: String(s.studienbeginn || "").slice(0, 20), variante: String(s.variante || "").slice(0, 40),
        takt: taktAus({ server_uni_postfach: objekt(s.takt).uni_postfach, server_gmail: objekt(s.takt).gmail }), tresor: tresorKurz(t) };
      // Für welche Module Claude eine Kapitelliste bauen soll (ein Server vor 31.10.2026 übergeht das Feld)
      const lp = objekt(s.lernplan);
      if (typeof lp.semester === "string" && Array.isArray(lp.module)) {
        stand.lernplan = { semester: lp.semester.slice(0, 20), module: lp.module.filter((c) => MODULCODE_SERVER.test(String(c))).slice(0, 60) };
        const listen = await lernplanListen(stand.lernplan.module);
        if (listen.length) stand.lernplan.listen = listen;
      }
      const erledigt = quittung.slice(0, 500);
      if (lage) {
        let roh = {};
        try { roh = abh.lagebild ? objekt(await abh.lagebild()) : {}; } catch (e) { roh = {}; }
        // nie mehr, als neben dem übrigen Stand unter STAND_BYTES passt
        const rest = kodieren(JSON.stringify(Object.assign({ erledigt, lagebild: null }, stand))).length;
        stand.lagebild = lagebildKurz(roh, geheim, STAND_BYTES - rest);
      }
      const kennung = hash32(JSON.stringify(stand));
      const g = objekt(lokal(L.gesendet));
      if (!quittung.length && g.kennung === kennung && alterMs(g.zeit) < STAND_ALTER) return true;
      try {
        const paket = await verschluesseln(v.schluessel, "stand", Object.assign({}, stand, { erledigt }));
        const r = await senden(v, "/v1/stand", { method: "POST", body: JSON.stringify(paket) });
        if (r.status !== 204 && r.status !== 200) return false;
      } catch (e) { return false; }
      lokal(L.gesendet, { kennung, zeit: abh.jetzt().toISOString() });
      return true;
    };

    // Mails durchsuchen: Claude-Lauf auf dem Server anstoßen; o.quarantaene: dazu die zurückgehaltenen Mails einmal neu einreihen
    // (Server ab 02.11.2026; zählt wie jeder Anstoß). Mit dem Beweis des Datenschlüssels: Ein Lauf kostet Abo-Limit, der Server ab 0.7.8
    // startet ihn auf eine signierte Anfrage nur damit (403 sonst). → { ok: true } | { fehler: nicht-verbunden | zu-frueh (mit wieder) |
    // zugang | uhr | alt | paket | netz }
    const anstossen = async (o) => {
      const v = verbindung();
      if (!v) return { fehler: "nicht-verbunden" };
      const erneut = !!(o && o.quarantaene);
      let r;
      try {
        r = await senden(v, "/v1/anstoss", Object.assign({ method: "POST", beweis: true }, erneut ? { body: JSON.stringify({ quarantaene: "erneut" }) } : {}));
      } catch (e) { return { fehler: "netz" }; }
      if (r.status === 401) return { fehler: ablehnung(r) };
      if (r.status === 403) return { fehler: "paket" };
      if (r.status === 429) {
        let wieder = "";
        try { wieder = String(JSON.parse(r.text).wieder || ""); } catch (e) { wieder = ""; }
        // sonst aus Retry-After (Sekunden; Server ab 02.11.2026 schicken beides)
        const sek = String(objekt(r.headers)["retry-after"] || "").trim();
        if (!isoOk(wieder) && /^\d{1,7}$/.test(sek)) wieder = new Date(abh.jetzt().getTime() + Number(sek) * 1000).toISOString();
        return isoOk(wieder) ? { fehler: "zu-frueh", wieder } : { fehler: "zu-frueh" };
      }
      if (r.status !== 200) return { fehler: "netz" };
      await statusHolen(v, true);
      return { ok: true };
    };

    // → Bericht { art: ok | nicht-verbunden | laeuft | anderes-geraet | fehler, fehler (netz | zugang | gesperrt | paket | intern),
    //   angelegt, aktualisiert, umbenannt, entfaellt, doppelt, zusammengefuehrt, ausgeblendet, hinweise, begleitnotizen (Pfade),
    //   lernplaene (geschriebene Lernplan-Notizen), unterlagen und kapitelFolien (an den Server geschickt), verworfen, dateien,
    //   neuereVersion, serverAelter (nahm Lab nicht an), mehr (Grenze erreicht, Rest beim nächsten Abruf) }; o: { manuell, uebernehmen (Knopf „Hier aktualisieren“) }
    const abrufen = async (o) => {
      o = o || {};
      let v = verbindung();
      if (!v) return { art: "nicht-verbunden" };
      if (laeuft) return { art: "laeuft" };
      laeuft = true;
      const b = { art: "ok", fehler: "", angelegt: [], aktualisiert: [], umbenannt: [], entfaellt: [], doppelt: [], zusammengefuehrt: [], ausgeblendet: 0, hinweise: 0,
        begleitnotizen: [], todoDoppel: [], lernplaene: 0, unterlagen: 0, kapitelFolien: 0, verworfen: [], dateien: 0, neuereVersion: false, serverAelter: false, mehr: false,
        rueck: [] };
      // gerätelokaler Stand nach dem Quellen-Vertrag (nachLauf): ein Fehler bleibt stehen, bis ein Lauf klappt
      // ohneAntwort: kein Netz, der Server hat gar nicht geantwortet
      const ende = (fehler, ohneAntwort) => {
        if (fehler) { b.art = "fehler"; b.fehler = fehler; }
        const alt = objekt(lokal(L.abruf));
        const warnungen = [];
        if (b.mehr) warnungen.push("Weitere Termine kommen beim nächsten Abruf.");
        if (b.neuereVersion) warnungen.push("Ein Teil braucht eine neuere Fassung von Studium Autopilot.");
        if (b.serverAelter) warnungen.push("Unterlagen aus dem Lab fasst dein Server erst nach seinem nächsten Update zusammen.");
        if (b.verworfen.length) warnungen.push(`${b.verworfen.length === 1 ? "Ein Eintrag" : b.verworfen.length + " Einträge"} vom Server ${b.verworfen.length === 1 ? "war" : "waren"} ungültig.`);
        const neu = Q.nachLauf(alt, fehler ? { ok: false, fehler: FEHLER[fehler] } : { ok: true, warnungen }, abh.jetzt().toISOString());
        neu.code = fehler || "";
        // Beginn der laufenden Fehlerserie (für den Hinweis nach Tagen; der letzte Erfolg allein zählt nicht, das Gerät war vielleicht
        // nur lange aus)
        neu.fehlerSeit = !fehler ? "" : neu.fehlerSerie === 1 || !alt.fehlerSeit ? neu.fehlerZeit : String(alt.fehlerSeit);
        // Erste Ablehnung des Schlüssels (401) einer Reihe, in der jede Antwort des Servers 401 war: Jede andere Antwort (Erfolg,
        // 5xx, Sperre, falsches Paket) beendet die Reihe; ohne Antwort (kein Netz) bleibt sie, zählt aber auch nicht (ruht)
        neu.zugangSeit = fehler === "zugang" ? String(alt.zugangSeit || "") || neu.fehlerZeit : ohneAntwort ? String(alt.zugangSeit || "") : "";
        neu.anderes = "";
        neu.bericht = fehler ? alt.bericht || null : { neu: b.angelegt.length, geaendert: b.aktualisiert.length + b.entfaellt.length, hinweise: b.hinweise };
        lokal(L.abruf, neu);
        // Geänderte Notizen dieses Abrufs (auch eines, der danach scheiterte) ersetzen den letzten Stand fürs Rückgängig
        if (b.rueck.length) {
          try { lokal(L.rueck, { zeit: abh.jetzt().toISOString(), aenderungen: rueckKappen(b.rueck) }); } catch (e) { /* nur das Rückgängig fehlt dann */ }
        }
        return b;
      };
      try {
        // lehnt der Server den Schlüssel schon beim Status ab, zählt das wie beim Eingang (auch auf Geräten, die nicht übernehmen)
        const abgelehnt = (await statusHolen(v, !!o.manuell)).ablehnung;
        if (abgelehnt) return ende(abgelehnt);
        // noch mit dem gemeinsamen Schlüssel (oder eigenen ohne Kennung): einmal auf eigene umziehen, ab dann nur noch mit ihnen
        v = await umziehen(v);
        if (!(await sperre().nehmen({ erzwingen: !!o.uebernehmen }))) {
          b.art = "anderes-geraet";
          lokal(L.abruf, Object.assign(Q.nachLauf(objekt(lokal(L.abruf)), { ok: null }, abh.jetzt().toISOString()), { anderes: abh.jetzt().toISOString() }));
          return b;
        }
        const { z, text } = await zustandLesen();
        z.angewendet = await angewendetLesen();
        let r;
        try { r = await senden(v, "/v1/eingang"); }
        catch (e) { return ende("netz", true); }
        if (r.status === 401) return ende(ablehnung(r));
        if (r.status === 429) return ende("gesperrt");
        if (r.status !== 200) return ende("netz");
        let buendel;
        try { buendel = await entschluesseln(v.schluessel, "eingang", JSON.parse(r.text)); } catch (e) { return ende("paket"); }
        if (!buendel || buendel.schema !== 1 || !Array.isArray(buendel.dateien)) return ende("paket");
        // Für die anderen Geräte (server.json): die Adresse für „Mit Code verbinden“ und das zuletzt verbundene Gerät (ein Server vor
        // dem 01.11.2026 schickt verbunden nicht, dann bleibt der bisherige Eintrag)
        z.adresse = v.adresse;
        z.verbunden = (Array.isArray(buendel.verbunden) ? buendel.verbunden : []).filter((e) => e && isoOk(e.zeit) && HERKUNFT.indexOf(e.herkunft) >= 0)
          .map((e) => ({ zeit: new Date(e.zeit).toISOString(), herkunft: e.herkunft })).sort((a, b) => (a.zeit < b.zeit ? -1 : a.zeit > b.zeit ? 1 : 0)).pop() || z.verbunden;
        // Claude-App für alle Geräte (fehlt bei einem Server ohne Connector: dann auch in server.json nicht); neue Verbindungen bleiben
        // in bekannt, auch wenn sie inzwischen getrennt sind, und beendete, die der Server meldet, kommen dazu
        const ca = claudeAppNormal(buendel.claude_app);
        z.claude_app = ca ? caFuerTresor(ca, caBekannt(z.claude_app && z.claude_app.bekannt, ca.verbindungen.concat(ca.frueher), jetztMs())) : null;
        caTresor = z.claude_app;
        let notizen = notizenLesen();
        if (notizen.gruppen.length) { await doppelZusammen(notizen.gruppen, b); notizen = notizenLesen(); }
        const quittung = [];
        const dateien = buendel.dateien.filter((d) => d && typeof d.name === "string" && DATEINAME.test(d.name))
          .sort((x, y) => (x.name < y.name ? -1 : x.name > y.name ? 1 : 0)).slice(0, 500);
        for (const d of dateien) {
          if (z.erledigt[d.name]) { quittung.push(d.name); continue; }
          if (!d.inhalt || typeof d.inhalt !== "object" || d.inhalt.schema !== 1) { b.neuereVersion = true; continue; } // für eine neuere Fassung liegen lassen
          if (!(await dateiAnwenden(d.name, d.inhalt, z, b, notizen))) { b.mehr = true; break; }
          z.erledigt[d.name] = abh.jetzt().toISOString();
          quittung.push(d.name);
          b.dateien++;
        }
        await zentralWeicht(notizen, b);
        for (const k of Object.keys(z.erledigt)) if (alterMs(z.erledigt[k]) > ERLEDIGT_TAGE * 1440 * MIN) delete z.erledigt[k];
        b.unterlagen = await unterlagenSenden(v, z, b);
        const neu = zustandText(z);
        if (neu !== text) await io.schreibenText(DATEI, neu);
        hinweisListe = z.hinweise;
        await angewendetSchreiben(z.angewendet);
        // Folien für Kapitellisten erst, wenn der Server den Stand hat (er fragt nach den Modulen); das Lagebild nur, solange die
        // Claude-App an ist
        if (await standSenden(v, quittung, !!(z.claude_app && z.claude_app.an))) {
          b.kapitelFolien = await kapitelSenden(v, z);
          if (b.kapitelFolien) await io.schreibenText(DATEI, zustandText(z));
        }
        return ende("");
      } catch (e) {
        console.error("server: Abruf", e);
        return ende("intern");
      } finally { laeuft = false; }
    };

    // ----- Rückgängig -----
    // Was der letzte Abruf an vorhandenen Notizen geändert hat (doppelte To-dos zusammengeführt, Termine geändert oder auf ein neues
    // Datum umbenannt) → { wann, todos, termine } | null
    const rueckStand = () => {
      const r = objekt(lokal(L.rueck)), liste = Array.isArray(r.aenderungen) ? r.aenderungen : [];
      if (!liste.length || !isoOk(r.zeit)) return null;
      return { wann: uhrzeit(r.zeit), todos: liste.filter((a) => a && a.art === "todo").length, termine: liste.filter((a) => a && a.art === "termin").length };
    };
    // Nimmt diese Änderungen zurück, jede nur, wenn die Notiz noch so dasteht, wie der Abruf sie hinterlassen hat (sonst bleibt deine
    // Fassung). Ein zurückgenommenes To-do führt der Server danach nicht noch einmal zusammen (L.behalten). → { zurueck, uebersprungen }
    const rueckgaengig = async () => {
      const r = objekt(lokal(L.rueck)), liste = Array.isArray(r.aenderungen) ? r.aenderungen : [];
      const behalten = lokal(L.behalten), nie = Array.isArray(behalten) ? behalten.slice() : [];
      let zurueck = 0, uebersprungen = 0;
      for (const a of liste.slice().reverse()) {
        if (!a || typeof a.pfad !== "string") continue;
        const text = await io.lesenText(a.pfad);
        let ok = false;
        if (text != null && a.art === "todo" && typeof a.alt === "string" && typeof a.neu === "string") {
          const zeilen = text.split("\n"), i = zeilen.findIndex((z) => z.replace(/\r$/, "") === a.neu);
          if (i >= 0) {
            zeilen[i] = a.alt + (zeilen[i].endsWith("\r") ? "\r" : "");
            await io.schreibenText(a.pfad, zeilen.join("\n"));
            if (TODO_ID.test(String(a.id)) && nie.indexOf(a.id) < 0) nie.push(a.id);
            ok = true;
          }
        } else if (text != null && a.art === "termin" && hash32(text) === a.hash) {
          const vorher = zeilenZurueck(text, a);
          if (vorher != null) {
            if (vorher !== text) await io.schreibenText(a.pfad, vorher);
            if (typeof a.pfadAlt === "string" && a.pfadAlt !== a.pfad && !io.existiert(a.pfadAlt)) await io.umbenennen(a.pfad, a.pfadAlt);
            ok = true;
          }
        }
        if (ok) zurueck++; else uebersprungen++;
      }
      lokal(L.rueck, null);
      lokal(L.behalten, nie.slice(-BEHALTEN_HOECHSTENS));
      return { zurueck, uebersprungen };
    };

    // ----- Anzeige -----
    const uhrzeit = (iso) => {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return "";
      const j = abh.jetzt();
      const hm = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
      return d.toDateString() === j.toDateString() ? hm : `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}., ${hm}`;
    };
    // Status in der Form des Quellen-Vertrags, dazu Eigenes: verbunden, host, laeuft, werte (öffentlicher Status des Servers),
    // erreichbar, erreicht (Zeit von werte), code (Art des Fehlers), bericht (letzte Übernahme), anderes (ein anderes Gerät hält
    // die Sperre)
    const sichtbar = () => !!verbindung() || io.existiert(DATEI);
    // Nimmt der Server den Schlüssel dieses Geräts seit mehr als ZUGANG_TAGE nicht mehr an (die letzte Antwort 401 und jede Antwort
    // seit zugangSeit auch, etwa nach einer neuen Adresse, denn dann erneuert der Server die Schlüssel)? Dann fragt der Zeitplan nicht
    // mehr von selbst (registrieren), die Zeile sagt es; „Aktualisieren“ und „Mit Code verbinden“ gehen weiter, ein Erfolg oder ein
    // neues Verbinden hebt es auf. War der letzte Versuch ohne Netz, fragt er wieder; die nächste 401 lässt ihn gleich wieder ruhen.
    const ruht = () => {
      const ab = objekt(lokal(L.abruf));
      return ab.code === "zugang" && !!ab.zugangSeit && alterMs(ab.zugangSeit) > ZUGANG_TAGE * 1440 * MIN;
    };
    const status = () => {
      const v = verbindung(), st = objekt(lokal(L.status)), ab = objekt(lokal(L.abruf));
      const zustand = !v ? (sichtbar() ? "anderswo" : "nicht-verbunden") : laeuft ? "laeuft" : ab.anderes ? "anderes-geraet" : ab.code ? "fehler" : "an";
      return Q.statusForm({
        zustand, geprueft: ab.geprueft, fehler: ab.fehler, fehlerZeit: ab.fehlerZeit, warnungen: ab.warnungen,
        verbunden: !!v, host: v ? hostVon(v.adresse) : "", laeuft, werte: st.werte || null, erreichbar: st.erreichbar !== false,
        erreicht: String(st.erreicht || ""), fehlerSeit: String(ab.fehlerSeit || ""), fehlerSerie: Number(ab.fehlerSerie) || 0,
        code: String(ab.code || ""), bericht: ab.bericht || null, anderes: !!ab.anderes, ruht: ruht(),
        // tagelang nicht erreichbar löst sich kaum von selbst (Server gelöscht oder neu angelegt, neue IP): mindestens zwei
        // Fehlschläge in Folge, der erste vor mehr als UNERREICHBAR_TAGE
        weg: ab.code === "netz" && Number(ab.fehlerSerie) >= 2 && !!ab.fehlerSeit && alterMs(ab.fehlerSeit) > UNERREICHBAR_TAGE * 1440 * MIN,
      });
    };
    const vor = (iso) => Q.vorText(iso, jetztMs());
    // Limit des Claude-Abos: wann der Server es wieder versucht (Status limit_wieder); ohne Zeit (älterer Server) der alte Satz
    const limitText = (wieder) => {
      if (!wieder) return "Claude hat gerade sein Limit erreicht. Der nächste Lauf versucht es von selbst.";
      return new Date(wieder).getTime() > jetztMs()
        ? `Claude hat das Limit deines Abos erreicht. Dein Server versucht es um ${uhrzeit(wieder)} wieder, nichts geht verloren.`
        : "Claude hat das Limit deines Abos erreicht. Dein Server versucht es gleich wieder, nichts geht verloren.";
    };
    // Neue Version des Servers → "" | "gescheitert" (der letzte Versuch ging schief, und der Server hat dessen Ziel nicht schon
    // anders bekommen, etwa über „Weiter mit der Einrichtung“; nur im Fenster, er versucht es täglich neu) | "haengt" (seit mehr als
    // VERSION_TAGE kein Versuch ohne Fehler, und die zentralen Daten oder der Server selbst (ziel) kennen eine neuere Version, als er
    // hat; auch in der Zeile)
    // Die laufende Version: installiert aus der Aktualisierung (nur mit Schlüssel), sonst die des Web-Dienstes
    const versionLage = (w) => {
      const a = w.aktualisierung, Z = abh.zentral ? abh.zentral() : null;
      if (!a || !Z) return "";
      const lauf = a.installiert || w.version;
      const rel = Z.stand ? (Z.stand() || {}).release : null;
      const neuere = (rel && Z.neuer(rel.version, lauf)) || Z.neuer(a.ziel, lauf);
      if (neuere && alterMs(a.erfolg) > VERSION_TAGE * 1440 * MIN) return "haengt";
      return a.ok || (Z.semver(a.ziel) && Z.semver(lauf) && !Z.neuer(a.ziel, lauf)) ? "" : "gescheitert";
    };
    // Gestaffelte Verteilung: Der Server kennt eine neuere Version und installiert sie erst ab warten_bis → Zeitpunkt oder ""
    const versionWartet = (w) => {
      const a = w.aktualisierung, Z = abh.zentral ? abh.zentral() : null;
      if (!a || !Z || !a.ok || !a.wartenBis || alterMs(a.wartenBis) >= 0) return "";
      return Z.neuer(a.ziel, a.installiert || w.version) ? a.wartenBis : "";
    };
    // Zeile unter Verbindungen im Format der Quellen (verbindungen.js, quelleZeile): { text, symbol, pille: an | pruefen | "",
    //   knopf: { aktion, text, cta, parameter } | null, link: { aktion, text, parameter } | null }
    const MEHR = { aktion: "verbinden", text: "Mehr erfahren", parameter: { id: "server" } };
    const HINWEISE_ANSEHEN = { aktion: "verbinden", text: "Hinweise ansehen", parameter: { id: "server" } };
    const AKTUALISIEREN = { aktion: "verbindung-aktualisieren", text: "Aktualisieren", cta: true, parameter: { id: "server" } };
    // Den Stand sagt die Zeile in den Worten aller Quellen (standText: „Aktualisiert vor 5 Min.“, Fehler mit „Zuletzt aktualisiert …“,
    // Warnungen dahinter, ein anderes Gerät); dazu, was nur dieser Server hat (Zustand auf dem Server, letzter Lauf, neue Termine)
    const zeileBasis = (s) => {
      const w = s.werte || {};
      const stand = abh.standText(s);
      switch (s.zustand) {
        case "nicht-verbunden": return { text: "Für Technische: Ein eigener, kostenloser Server fasst mit deinem Claude-Abo Unterlagen zusammen und sucht in deinen Uni-Mails nach Terminen.", symbol: "extern", pille: "", knopf: { aktion: "verbinden", text: "Mehr erfahren", parameter: { id: "server" } }, link: null };
        case "anderswo": return { text: "Auf einem anderen Gerät verbunden. Neue Termine kommen über deinen Sync.", symbol: "haken", pille: "", knopf: null, link: MEHR };
        case "laeuft": return { text: stand.text, symbol: stand.symbol, pille: "an", knopf: null, link: MEHR };
        case "anderes-geraet": return { text: stand.text, symbol: stand.symbol, pille: "an",
          knopf: { aktion: "verbindung-aktualisieren", text: "Hier aktualisieren", cta: true, parameter: { id: "server", uebernehmen: "1" } }, link: MEHR };
        case "fehler":
          if (s.ruht) return { text: FEHLER.zugang + " Bis dahin fragt dieses Gerät nicht mehr von selbst nach.", symbol: "warnung", pille: "pruefen", knopf: null, link: MEHR };
          if (s.code === "zugang" || s.code === "paket" || s.code === "erneuert") return { text: s.fehler, symbol: "warnung", pille: "pruefen", knopf: null, link: MEHR };
          if (s.weg) {
            return { text: `Dein Server ist seit mehr als ${UNERREICHBAR_TAGE} Tagen nicht erreichbar. Hat er neue Schlüssel, verbindest du dieses Gerät mit einem Code von einem anderen Gerät. Sonst sag in Claude Code „Weiter mit der Einrichtung“ und verbinde es danach mit Code neu.`,
              symbol: "warnung", pille: "pruefen", knopf: AKTUALISIEREN, link: MEHR };
          }
          return { text: stand.text, symbol: stand.symbol, pille: "an", knopf: AKTUALISIEREN, link: MEHR };
        default: break;
      }
      if (w.claude === "abgemeldet") return { text: "Claude ist auf deinem Server nicht mehr verbunden. Sag in Claude Code „Weiter mit der Einrichtung“, dann verbindest du es neu.", symbol: "warnung", pille: "pruefen", knopf: AKTUALISIEREN, link: MEHR };
      if (w.uniZugang === "falsch") return { text: "Die Uni nimmt das Passwort auf deinem Server nicht an. Sag in Claude Code „Weiter mit der Einrichtung“, dann gibst du es neu ein.", symbol: "warnung", pille: "pruefen", knopf: AKTUALISIEREN, link: MEHR };
      if (w.claudeLauf === "wartet" || w.claudeLauf === "laeuft") return { text: "Claude durchsucht gerade deine Mails auf deinem Server …", symbol: "uhr", pille: "an", knopf: AKTUALISIEREN, link: MEHR };
      if (w.fehler && w.fehler.indexOf("claude-limit") >= 0) return { text: limitText(w.limitWieder), symbol: "uhr", pille: "an", knopf: AKTUALISIEREN, link: MEHR };
      if (versionLage(w) === "haengt") return { text: `Dein Server installiert seit mehr als ${VERSION_TAGE} Tagen keine neue Version mehr. Sag in Claude Code „Weiter mit der Einrichtung“, dann holt Claude das nach.`, symbol: "warnung", pille: "pruefen", knopf: AKTUALISIEREN, link: MEHR };
      const n = s.bericht ? s.bericht.neu + s.bericht.geaendert : 0;
      const teile = [stand.text];
      if (w.letzterLauf) teile.push(`Letzter Lauf des Servers ${vor(w.letzterLauf.zeit)}.`.replace(/\.\.$/, ".")); // „vor 5 Min.“ hat schon den Punkt
      if (n) teile.push(`${n} ${n === 1 ? "Termin" : "Termine"} neu oder geändert.`);
      return { text: teile.join(" "), symbol: stand.symbol, pille: "an", knopf: AKTUALISIEREN, link: neueHinweise() ? HINWEISE_ANSEHEN : MEHR };
    };
    // Eine neue Verbindung zur Claude-App (server.json → bekannt) steht CA_PRUEFEN_TAGE lang in der Zeile, auf jedem Gerät mit Server:
    // Pille „prüfen“, darunter wann; ein Problem des Servers (Pille prüfen, Warnung) geht vor. Der Knopf bleibt, der Link führt ins
    // Fenster, wo du sie trennst bzw. (schon beendet) die Claude-App ausschaltest (auf einem Gerät ohne Schlüssel sagt der Satz, wo das geht)
    const zeile = () => {
      const s = status(), z = zeileBasis(s), n = caNeu(caTresor, CA_PRUEFEN_TAGE)[0];
      if (!n || s.zustand === "nicht-verbunden" || z.pille === "pruefen" || z.symbol === "warnung") return z;
      const wo = n.ende ? (s.verbunden ? "Wenn nicht, schaltest du die Claude-App hier aus."
        : "Wenn nicht, schaltest du die Claude-App auf einem Gerät aus, das mit deinem Server verbunden ist.")
        : s.verbunden ? "Wenn nicht, trennst du sie hier." : "Wenn nicht, trennst du sie auf einem Gerät, das mit deinem Server verbunden ist.";
      return Object.assign({}, z, { text: `${caNeuText(n)}${n.ende ? ", schon beendet" : ""} – warst du das? ${wo}`, unter: caNeuText(n), symbol: "haken", ton: "warn",
        pille: "pruefen", pilleText: "prüfen", link: MEHR });
    };
    // Neue Hinweise: noch nicht im Fenster gesehen (gerätelokal) und höchstens 14 Tage alt
    const hinweisSchluessel = (h) => Q.kurzHash(String(h.zeit || "") + "\n" + h.text);
    const neueHinweise = () => {
      const gesehen = lokal(L.gesehen);
      const schon = Array.isArray(gesehen) ? gesehen : [];
      return hinweisListe.filter((h) => alterMs(h.zeit) <= HINWEIS_NEU_TAGE * 1440 * MIN && schon.indexOf(hinweisSchluessel(h)) < 0).length;
    };
    const hinweiseGesehen = () => { lokal(L.gesehen, hinweisListe.map(hinweisSchluessel)); };
    const hinweiseLaden = async () => { await zustandLesen(); };
    // Hinweise der letzten HINWEIS_NEU_TAGE Tage, neueste zuerst, frisch aus server.json (synchronisiert, also auf jedem Gerät);
    // mit code nur die zu diesem Modul. Für das Modulfeld (modul.js) und „Seit deinem letzten Besuch“ (seit-besuch.js)
    const hinweise = async (o) => {
      const code = (o && o.code) || "", jetzt = jetztMs();
      const { z } = await zustandLesen();
      return z.hinweise.filter((h) => {
        const t = Date.parse(h.zeit);
        return !isNaN(t) && t <= jetzt && jetzt - t <= HINWEIS_NEU_TAGE * 1440 * MIN && (!code || h.code === code);
      }).map((h) => ({ text: reinerText(h.text, 300), quelle: reinerText(h.quelle, 200), zeit: String(h.zeit),
        code: MODULCODE_SERVER.test(String(h.code || "")) ? String(h.code) : "" }))
        .filter((h) => h.text).sort((a, b) => Date.parse(b.zeit) - Date.parse(a.zeit));
    };
    // Stand für das Fenster: [[Bezeichnung, Wert]] (nur feste Texte), Hinweise (neueste zuerst), letzte Übernahmen
    const WERTE = {
      claude: { angemeldet: "verbunden", abgemeldet: "nicht verbunden, bitte neu verbinden" },
      gmail: { ok: "wird durchsucht", fehlt: "nicht verbunden", aus: "aus (in den Einstellungen „nie“)" },
      uniZugang: { gespeichert: "eingerichtet", fehlt: "nicht eingerichtet", falsch: "Passwort nicht angenommen" },
    };
    const einzelheiten = async () => {
      const s = status(), w = s.werte || {};
      const liste = [], saetze = [];
      if (s.verbunden) liste.push(["Adresse", s.host]);
      if (s.werte) {
        // nicht erreichbar: die Werte unten sind die von damals
        if (!s.erreichbar) liste.push(["Stand des Servers", "nicht erreichbar" + (s.erreicht ? ", Angaben von " + uhrzeit(s.erreicht) : "")]);
        liste.push(["Claude", WERTE.claude[w.claude] || "unbekannt"], ["Gmail", WERTE.gmail[w.gmail] || "unbekannt"], ["Uni-Postfach", WERTE.uniZugang[w.uniZugang] || "unbekannt"]);
        if (w.letzterLauf) liste.push(["Letzter Lauf", uhrzeit(w.letzterLauf.zeit) + (w.letzterLauf.ok ? "" : " (ohne Ergebnis)")]);
        const lage = versionLage(w);
        const grund = w.aktualisierung && w.aktualisierung.grund;
        if (lage) {
          liste.push(["Neue Version", lage === "haengt" ? `seit mehr als ${VERSION_TAGE} Tagen keine installiert`
            : grund === "zurueckgerollt" ? `zuletzt zurückgenommen (${uhrzeit(w.aktualisierung.zeit)}), dein Server versucht es nach einem Tag neu`
              : grund === "kein-paket" ? `noch kein Paket für den Server (${uhrzeit(w.aktualisierung.zeit)}), dein Server sieht täglich nach`
                : `zuletzt ohne Erfolg (${uhrzeit(w.aktualisierung.zeit)}), dein Server versucht es täglich neu`]);
        }
        const wartet = !lage && versionWartet(w);
        if (wartet) liste.push(["Neue Version", `${w.aktualisierung.ziel} installiert dein Server ab ${uhrzeit(wartet)} (neue Versionen kommen nicht auf alle Server zugleich)`]);
        // Grenzen je Tag, nur was nicht 0 ist (Server ab 02.11.2026): zurückgestellte Mails; ältere nicht lesbare, die der Server
        // gelöscht hat (die übrigen nicht lesbaren stehen mit „Noch einmal versuchen“ darunter)
        const g = w.grenzen;
        const morgen = g ? g.mails_zurueckgestellt + g.mails_verschoben : 0;
        if (morgen) liste.push(["Mails", `${zahl(morgen, "Mail wartet", "Mails warten")} auf morgen`]);
        if (g && g.quarantaene_geloescht) liste.push(["Nicht lesbare Mails", "die älteren hat dein Server gelöscht, damit der Platz reicht"]);
        // Unterlagen und Folien, an denen er allein zweimal scheiterte (er lässt sie aus), und was bis morgen ruht: je ein ruhiger Satz
        const ausgelassen = g ? g.unterlagen_ausgelassen + g.kapitel_ausgelassen : 0;
        if (ausgelassen) saetze.push(`${zahl(ausgelassen, "Unterlage", "Unterlagen")} konnte dein Server nicht lesen.`);
        if (g && g.ausgesetzt_gmail) saetze.push("Gmail ist bis morgen pausiert.");
        if (g && (g.ausgesetzt_unterlagen || g.ausgesetzt_kapitel)) saetze.push("Unterlagen sind bis morgen pausiert.");
      }
      if (s.geprueft) liste.push(["Zuletzt aktualisiert", uhrzeit(s.geprueft)]);
      const { z } = await zustandLesen();
      // Verbindungen von Geräten: aus dem Status (alle, die der Server meldet, mit Gerät und grobem Netz), sonst die neueste aus
      // server.json (andere Geräte, ältere Server)
      const jetzt = abh.jetzt();
      const verbindungen = (Array.isArray(w.verbunden) ? w.verbunden : []).slice().reverse().map((e) => verbindungText(e, jetzt));
      if (verbindungen.length) liste.push(["Zuletzt verbunden", verbindungen[0]]);
      else if (z.verbunden) liste.push(["Zuletzt verbunden", `${uhrzeit(z.verbunden.zeit)} (${HERKUNFT_TEXT[z.verbunden.herkunft]})`]);
      // Claude-App aus server.json, auf einem Gerät ohne Schlüssel (mit Schlüssel steht sie im eigenen Abschnitt des Fensters)
      if (!s.verbunden && z.claude_app) liste.push(["Claude-App", caKurz(z.claude_app, jetzt)]);
      // Geräte mit eigenen Schlüsseln (Server ab dieser Fassung, aus dem Status): dieses zuerst, dann die anderen, neueste zuerst; null
      // ohne Liste (älterer Server, kein Status). Je Gerät, woher es kam und sein grobes Netz, dazu was beim Trennen mitginge (mit: Geräte
      // über seine Codes, Verbindungen der Claude-App aus ihnen; der Server trennt sie, außer man behält sie)
      const eigenes = (verbindung() || {}).geraet;
      const ca = await claudeAppStand();
      const caVon = ca && Array.isArray(ca.verbindungen) ? ca.verbindungen : [];
      const alle = Array.isArray(w.geraete) ? w.geraete : [];
      const geraete = !s.verbunden || !Array.isArray(w.geraete) ? null : alle.slice().reverse().map((g) => {
        const dieses = g.dieses || g.id === eigenes, mitIds = dieses ? [] : geraeteMit(alle, g.id, eigenes);
        const weg = [g.id].concat(mitIds);
        return { id: g.id, name: g.name || "Gerät ohne Namen", ohneName: !g.name, dieses,
          text: [`seit ${uhrzeit(g.seit)}`, `zuletzt ${uhrzeit(g.zuletzt)}`, geraetHerkunft(g, alle, eigenes)].concat(g.netz ? ["Anschluss " + netzText(g.netz)] : []).join(" · "),
          mit: { geraete: alle.filter((x) => mitIds.indexOf(x.id) >= 0).map((x) => ({ id: x.id, name: x.name })),
            claudeApp: dieses ? [] : caVon.filter((e) => e.von && weg.indexOf(e.von) >= 0).map((e) => e.id) } };
      }).sort((a, b) => (b.dieses ? 1 : 0) - (a.dieses ? 1 : 0));
      return { liste, saetze, verbindungen, geraete, quarantaene: (w.grenzen && w.grenzen.quarantaene) || 0,
        hinweise: z.hinweise.slice().reverse().slice(0, 10), laeufe: z.laeufe.slice().reverse().slice(0, 5).map((l) => Object.assign({}, l, { wann: uhrzeit(l.zeit) })) };
    };

    return {
      verbinden, trennen, abrufen, anstossen, status, zeile, einzelheiten, sichtbar, neueHinweise, hinweiseGesehen, hinweiseLaden, hinweise,
      geraetCode, geraetTrennen, adresseBekannt, adresseGeprueft, codeVerbinden, ruht, rueckStand, rueckgaengig,
      claudeAppCode, claudeAppStatus, claudeAppTrennen, claudeAppAus, claudeAppStand, claudeAppNeu,
      verbunden: () => !!verbindung(),
      get laeuft() { return laeuft; },
    };
  };

  // ---------- Anschluss an Obsidian ----------
  const plugin = () => ctx.plugin || {};
  // Schreiben scheitert nie nach außen (Speicher voll, privater Modus): dann wird der Eintrag gelöscht, damit kein alter Stand
  // bleibt, der nicht mehr passt; scheitert auch das, bleibt es still
  const lokalObs = (k, v) => {
    if (v === undefined) { try { return app.loadLocalStorage(k) || null; } catch (e) { return null; } }
    try { app.saveLocalStorage(k, v == null ? null : v); } catch (e) {
      try { app.saveLocalStorage(k, null); } catch (e2) { /* still */ }
    }
    return v;
  };
  // Schlüsselbund (app.secretStorage, seit Obsidian 1.11.4), wie in ilias.js
  const geheimObs = {
    lesen: (id) => { const s = app.secretStorage; return s && typeof s.getSecret === "function" ? s.getSecret(id) : null; },
    schreiben: async (id, w) => { const s = app.secretStorage; if (!s || typeof s.setSecret !== "function") throw new Error("kein Schlüsselbund"); await s.setSecret(id, w); },
    loeschen: async (id) => { const s = app.secretStorage; if (!s) return; if (typeof s.deleteSecret === "function") await s.deleteSecret(id); else if (typeof s.setSecret === "function") await s.setSecret(id, ""); },
  };
  const geheimId = () => GEHEIM_PRAEFIX + hash32(String((app && app.appId) || (app && app.vault && app.vault.getName && app.vault.getName()) || "tresor"));
  const obsidianIo = () => {
    const V = app.vault;
    const datei = (p) => { const f = V.getAbstractFileByPath(p); return f && !f.children ? f : null; };
    const elternVon = (p) => { const i = p.lastIndexOf("/"); return i < 0 ? "" : p.slice(0, i); };
    const ordnerAnlegen = async (p) => {
      let a = "";
      for (const t of String(p || "").split("/").filter(Boolean)) {
        a = a ? a + "/" + t : t;
        if (V.getAbstractFileByPath(a)) continue;
        try { await V.createFolder(a); } catch (e) { if (!V.getAbstractFileByPath(a)) throw e; }
      }
    };
    // auch bei anderer Groß-/Kleinschreibung (Windows, iOS)
    const existiert = (p) => {
      if (V.getAbstractFileByPath(p)) return true;
      const o = V.getAbstractFileByPath(elternVon(p)) || (!elternVon(p) && V.getRoot());
      const n = p.slice(p.lastIndexOf("/") + 1).toLowerCase();
      return !!(o && o.children) && o.children.some((k) => k.name.toLowerCase() === n);
    };
    return {
      lesenText: async (p) => { const f = datei(p); return f ? V.read(f) : null; },
      schreibenText: async (p, t) => { const f = datei(p); if (f) { await V.modify(f, t); return; } await ordnerAnlegen(elternVon(p)); await V.create(p, t); },
      umbenennen: async (alt, neu) => { const f = datei(alt); if (f) await app.fileManager.renameFile(f, neu); },
      // nie endgültig löschen: der eine Papierkorb (quellen.js, Obsidians Einstellung „Gelöschte Dateien“)
      papierkorb: async (p) => {
        const f = datei(p);
        if (f) await ctx.user.quellen.papierkorb(app, f, { lokal: !!plugin().testPapierkorbLokal });
      },
      existiert,
      // Notiz neben der PDF: gleicher Name mit .md, sonst die Unterlage (typ: unterlage), deren Feld datei auf die PDF zeigt
      begleitnotiz: (pdfPfad) => {
        const fmVon = (f) => { const c = app.metadataCache.getFileCache(f); return (c && c.frontmatter) || {}; };
        const md = datei(pdfPfad.replace(/\.pdf$/i, ".md"));
        if (md && fmVon(md).typ === "unterlage") return md.path;
        const pdf = datei(pdfPfad);
        if (!pdf) return "";
        for (const n of V.getMarkdownFiles()) {
          if (n.path.indexOf("Unterlagen/") !== 0 || fmVon(n).typ !== "unterlage") continue;
          const ziel = String(fmVon(n).datei || "").replace(/^\[\[|\]\]$/g, "").split("|")[0];
          const d = ziel && app.metadataCache.getFirstLinkpathDest(ziel, n.path);
          if (d && d.path === pdf.path) return n.path;
        }
        return "";
      },
      terminNotizen: () => V.getMarkdownFiles().map((f) => { const c = app.metadataCache.getFileCache(f); return { pfad: f.path, fm: (c && c.frontmatter) || null }; })
        .filter((x) => x.fm && x.fm.typ === "termin"),
    };
  };
  // Antwort mit Kopfzeilen in Kleinbuchstaben (Retry-After bei 429)
  const netzObs = async (a) => {
    const kopf = a.headers || {};
    const r = await obs.requestUrl({ url: a.url, method: a.method || "GET", headers: kopf, body: a.body, contentType: kopf["content-type"], throw: false });
    const aus = {}, h = r.headers && typeof r.headers === "object" ? r.headers : {};
    for (const k of Object.keys(h)) aus[k.toLowerCase()] = String(h[k]);
    return { status: r.status, text: r.text, headers: aus };
  };
  // Frage mit Knöpfen (der erste ist der Hauptknopf) und „Abbrechen“ → Promise<Nummer des Knopfs | -1>
  const wahlObs = (titel, text, knoepfe) => new Promise((fertig) => {
    const m = new obs.Modal(app);
    let wahl = -1;
    m.modalEl.addClass("eba-modal");
    m.titleEl.setText(titel);
    m.contentEl.createEl("p", { text, cls: "eba-modal-text" });
    const k = m.contentEl.createDiv({ cls: "modal-button-container" });
    knoepfe.forEach((t, i) => {
      const b = k.createEl("button", i === 0 ? { text: t, cls: "mod-cta" } : { text: t });
      b.addEventListener("click", () => { wahl = i; m.close(); });
    });
    k.createEl("button", { text: "Abbrechen" }).addEventListener("click", () => m.close());
    m.onClose = () => { m.contentEl.empty(); fertig(wahl); };
    m.open();
  });
  const bestaetigenObs = (titel, text, ja) => wahlObs(titel, text, [ja]).then((i) => i === 0);
  // Frage mit Feld: der Knopf ja geht erst, wenn soll im Feld steht (Groß- und Kleinschreibung egal) → Promise<Text | null>
  const eintippenObs = (titel, text, ja, soll) => new Promise((fertig) => {
    const m = new obs.Modal(app);
    let wert = null;
    m.modalEl.addClass("eba-modal");
    m.titleEl.setText(titel);
    m.contentEl.createEl("p", { text, cls: "eba-modal-text" });
    const feld = m.contentEl.createEl("input", { type: "text", cls: "eba-modal-feld",
      attr: { autocomplete: "off", autocapitalize: "off", autocorrect: "off", spellcheck: "false", "aria-label": "Name des neuen Servers", placeholder: soll } });
    const k = m.contentEl.createDiv({ cls: "modal-button-container" });
    const knopf = k.createEl("button", { text: ja, cls: "mod-warning" });
    const passt = () => feld.value.trim().toLowerCase() === String(soll).toLowerCase();
    knopf.disabled = true;
    feld.addEventListener("input", () => { knopf.disabled = !passt(); });
    feld.addEventListener("keydown", (e) => { if (e.key === "Enter" && passt()) { e.preventDefault(); knopf.click(); } });
    knopf.addEventListener("click", () => { if (passt()) { wert = feld.value; m.close(); } });
    k.createEl("button", { text: "Abbrechen" }).addEventListener("click", () => m.close());
    m.onClose = () => { m.contentEl.empty(); fertig(wert); };
    m.open();
    feld.focus();
  });
  const eba = () => { try { return ctx.user.eba(ctx); } catch (e) { return null; } };
  const EINSTELLUNGEN = "System/Einstellungen.md";
  const einstellungenFm = () => { const f = app.vault.getAbstractFileByPath(EINSTELLUNGEN); const c = f && !f.children ? app.metadataCache.getFileCache(f) : null; return (c && c.frontmatter) || {}; };
  // Was schon im Tresor steht: Termine von vor 30 Tagen bis in einem Jahr (alle Herkünfte, auch erledigte), offene To-dos genau
  // wie auf dem Dashboard (todos.js, ohne Offene Fragen) mit Modulcode und Frist
  const tagIso = (d) => { const x = new Date(d); return `${x.getFullYear()}-${pad2(x.getMonth() + 1)}-${pad2(x.getDate())}`; };
  const CODE_AM_ANFANG = /^([A-Z]{1,4}[0-9][0-9X]{2}[A-Z]?)(?:\s|$)/;
  const MODULCODE_SERVER = /^[A-Z]{1,4}[0-9][0-9X]{2}[A-Z]?$/; // wie eba.js
  const codeVon = (f) => {
    const c = f && app.metadataCache.getFileCache(f), fc = c && c.frontmatter && c.frontmatter.code;
    if (typeof fc === "string" && CODE_AM_ANFANG.test(fc)) return fc;
    const m = f && String(f.basename).match(CODE_AM_ANFANG);
    return m ? m[1] : "";
  };
  // Terminsuche: Modul nicht abgedeckt (zentrale Daten an, Abdeckung bekannt) und PDF neu genug
  const terminsuche = (code, mtime) => {
    const A = ctx.zentral && ctx.zentral.abdeckung ? ctx.zentral.abdeckung() : null;
    if (!A || !MODULCODE_SERVER.test(String(code || ""))) return false;
    if (A.gilt && A.module.indexOf(String(code)) >= 0) return false;
    return Date.now() - (mtime || 0) <= TERMINSUCHE_TAGE * 864e5;
  };
  const terminsucheAn = () => unterlagenModus() !== "aus" && motor().sichtbar();
  // Lehrmaterial: Notiz (typ: unterlage) mit Art aus ARTEN_SENDEN, die PDF hat eine Textfassung mit Text (ergebnis text oder
  // gekuerzt). Gewünschte (Knopf, mit angefordert); mit server_unterlagen: alle auch die übrigen ohne Zusammenfassung („Das
  // Wichtigste“ fehlt oder ist leer), sonst neue aus nicht abgedeckten Modulen mit nur_termine; aus: keine.
  // o: { ohne: { Kennung: Zeit } (schon gesendet), hoechstens } → gewünschte zuerst, sonst neueste PDF zuerst
  const unterlagenModus = () => { const m = String(einstellungenFm().server_unterlagen || "").toLowerCase(); return m === "alle" || m === "aus" ? m : "knopf"; };
  // Textfassungen mit Text (volltext.js) → { PDF-Pfad: { f, fm } }
  const volltexte = () => {
    const textVon = {};
    for (const f of app.vault.getMarkdownFiles()) {
      if (f.path.indexOf("Unterlagen/_Volltext/") !== 0) continue;
      const fm = (app.metadataCache.getFileCache(f) || {}).frontmatter || {};
      if (fm.typ === "volltext" && fm.volltext_von === "plugin" && ["text", "gekuerzt"].indexOf(fm.ergebnis) >= 0 && /^[0-9a-f]{64}$/.test(String(fm.pdf_sha256 || ""))) {
        textVon[String(fm.quelle || "")] = { f, fm };
      }
    }
    return textVon;
  };
  const groesse = (p) => { const f = app.vault.getAbstractFileByPath(p); return f && f.stat ? f.stat.size || 0 : 0; };
  // Gehört die Textfassung zur PDF, wie sie jetzt ist (fassung.js; ohne fassung.js wie bis 0.6.7: ja)?
  const textAktuell = (vfm, g) => { const Fa = ctx.user && ctx.user.fassung; return Fa ? Fa.textAktuell(vfm, g) : true; };
  // Kommen die ILIAS-Dateien von außen (eigener Uni-Abgleich, quellen_extern „ilias-dateien“), führt er ihre Notizen auch nach:
  // Dann fasst das Plugin eine frühere Fassung nie von selbst neu zusammen (ein Schreiber je Notiz), nur auf deinen Wunsch
  const fassungExtern = () => { try { return !!(ctx.ilias && ctx.ilias.status().extern); } catch (e) { return false; } };
  // Zusammenfassung einer früheren Fassung der Datei (Überschrift „Das Wichtigste (frühere Fassung, bis …)“ im metadataCache, kein
  // „## Das Wichtigste“): zählt wie ein Wunsch vom Tag des Ersetzens, damit die Notiz mit der Datei aktuell bleibt. → Wunsch wie
  // wunschVon, der spätere von beiden
  const wunschOderVeraltet = (f, fm) => {
    const w = wunschVon(fm), Fa = ctx.user && ctx.user.fassung;
    const h = ((app.metadataCache.getFileCache(f) || {}).headings || []).filter((x) => x.level === 2).map((x) => "## " + String(x.heading).trim());
    if (!Fa || fassungExtern() || h.indexOf("## Das Wichtigste") >= 0) return w;
    const m = h.map((z) => Fa.FRUEHER.exec(z)).filter(Boolean)[0];
    const v = m ? `${m[1].slice(6)}-${m[1].slice(3, 5)}-${m[1].slice(0, 2)}T00:00` : "";
    return w >= v ? w : v;
  };
  const unterlagenObs = async (o) => {
    o = o || {};
    const ohne = o.ohne || {}, hoechstens = o.hoechstens || UNTERLAGEN_JE_ABRUF, modus = unterlagenModus();
    if (modus === "aus") return [];
    const textVon = volltexte();
    const aus = [], io = obsidianIo();
    const zeit = (p) => { const f = app.vault.getAbstractFileByPath(p); return f && f.stat ? f.stat.mtime || 0 : 0; };
    const notizVon = (pdfPfad) => {
      const pfad = io.begleitnotiz(pdfPfad);
      const nf = pfad && app.vault.getAbstractFileByPath(pfad);
      const nfm = nf ? (app.metadataCache.getFileCache(nf) || {}).frontmatter || {} : null;
      return nfm && ARTEN_SENDEN.indexOf(nfm.art) >= 0 ? { nf, nfm, wunsch: modus === "knopf" ? wunschOderVeraltet(nf, nfm) : wunschVon(nfm) } : null;
    };
    const kandidaten = [];
    for (const p of Object.keys(textVon)) {
      if (!/\.pdf$/i.test(p)) continue;
      const n = notizVon(p), k = String(textVon[p].fm.pdf_sha256);
      // Textfassung noch von der alten Fassung der PDF (gerade ersetzt): warten, bis volltext.js sie neu geschrieben hat
      if (!n || !textAktuell(textVon[p].fm, groesse(p))) continue;
      const termine = !n.wunsch && modus !== "alle" && terminsuche(n.nfm.code, zeit(p));
      if (n.wunsch ? String(ohne[k] || "") >= n.wunsch : (modus !== "alle" && !termine) || ohne[k]) continue;
      kandidaten.push(Object.assign({ p, zeit: zeit(p), termine }, n));
    }
    kandidaten.sort((a, b) => (b.wunsch ? 1 : 0) - (a.wunsch ? 1 : 0) || b.zeit - a.zeit || (a.p < b.p ? -1 : 1));
    for (const { p: pdfPfad, nf, nfm, wunsch, termine } of kandidaten) {
      if (aus.length >= hoechstens) break;
      const notiz = await app.vault.cachedRead(nf);
      // „Das Wichtigste“ steht schon: keine Zusammenfassung (Termine sucht der Server trotzdem)
      if (!termine && begleitnotizErgaenzen(notiz, { wichtigste: [{ text: "x" }] }, "x.pdf") == null) continue;
      const t = textVon[pdfPfad], Fa = ctx.user && ctx.user.fassung, fassung = !termine && Fa ? Fa.kontext(notiz, t.fm) : null;
      aus.push({ datei: pdfPfad, kennung: String(t.fm.pdf_sha256), art: nfm.art, titel: String(nfm.titel || nf.basename), code: String(nfm.code || ""),
        seiten: Number(t.fm.seiten) || 0, ...(wunsch ? { angefordert: wunsch, pdf: nfm[WUNSCH_PDF] === true && groesse(pdfPfad) <= PDF_MAX } : termine ? { nur_termine: true } : {}),
        ...(fassung ? { fassung } : {}), text: volltextText(await app.vault.cachedRead(t.f)) });
    }
    return aus;
  };
  // Lernplan: laufendes Semester und die Module, für die Claude eine Kapitelliste bauen soll: dran wie bei den zentralen Listen
  // (ctx.lernplan.zentralAuswahl: in deinem Plan in diesem Semester, laufend oder angemeldet, nicht bestanden), ohne zentrale Liste
  // für dieses Semester. null, wenn lernplan.js Listen vom Server nicht übernehmen kann (dann fragt der Stand nicht danach).
  const lernplanAuswahl = () => {
    const L = ctx.lernplan, M = ctx.modell;
    if (!L || typeof L.serverListen !== "function" || typeof L.zentralAuswahl !== "function" || !M || !M.daten || !M.semesterFuer) return null;
    const sem = M.semesterFuer(tagIso(Date.now()));
    if (!sem || !sem.name) return null;
    const D = M.daten(), Z = ctx.zentral && ctx.zentral.kapitel ? ctx.zentral.kapitel() : null;
    const zentral = (Z && Array.isArray(Z.module) ? Z.module : []).filter((e) => e.semester === sem.name).map((e) => e.code);
    const module = L.zentralAuswahl((D.module || []).map((m) => ({ code: m.code, semester: sem.name })), D, sem.name).map((e) => e.code)
      .filter((c, i, a) => MODULCODE_SERVER.test(String(c)) && zentral.indexOf(c) < 0 && a.indexOf(c) === i).sort().slice(0, 60);
    return { semester: sem.name, module };
  };
  // Folien für Kapitellisten: je Modul aus lernplanAuswahl die Folien, mit denen auch der Plan rechnet (ctx.lernplan.folienVon: je
  // Nummer eine, ohne Varianten, die neueste Fassung), deren Textfassung zur PDF passt; niedrige Nummern zuerst (dort steht die
  // Gliederung). Nicht bei server_unterlagen: aus. o: { ohne: { Kennung: Zeit } (schon gesendet), hoechstens }
  const kapitelUnterlagenObs = async (o) => {
    o = o || {};
    const L = ctx.lernplan, A = lernplanAuswahl(), ohne = o.ohne || {};
    if (unterlagenModus() === "aus" || !A || !A.module.length || typeof L.folienVon !== "function") return [];
    const textVon = volltexte(), fmVon = (f) => (app.metadataCache.getFileCache(f) || {}).frontmatter || {}, kandidaten = [];
    for (const code of A.module) {
      const F = L.folienVon(code) || {};
      for (const nr of Object.keys(F)) {
        const nf = F[nr] && F[nr].f, fm = nf ? fmVon(nf) : null, pdf = nf ? pdfZurNotiz(nf, fm) : null, t = pdf && textVon[pdf.path];
        if (!t || ohne[String(t.fm.pdf_sha256)] || !textAktuell(t.fm, groesse(pdf.path))) continue;
        kandidaten.push({ nr: Number(nr), code, nf, fm, pdf, t });
      }
    }
    kandidaten.sort((a, b) => a.nr - b.nr || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
    const aus = [];
    for (const k of kandidaten.slice(0, o.hoechstens || KAPITEL_JE_ABRUF)) {
      aus.push({ datei: k.pdf.path, kennung: String(k.t.fm.pdf_sha256), titel: String(k.fm.titel || k.nf.basename), code: k.code, nummer: k.nr,
        seiten: Number(k.t.fm.seiten) || 0, datum: s10(k.fm.datum), quelle: String(k.fm.quelle || ""), text: volltextText(await app.vault.cachedRead(k.t.f)) });
    }
    return aus;
  };
  const tresorObs = async () => {
    const jetzt = Date.now(), von = tagIso(jetzt - 30 * 864e5), bis = tagIso(jetzt + 365 * 864e5);
    const termine = obsidianIo().terminNotizen().map(({ pfad, fm }) => ({
      titel: String(fm.titel || pfad.slice(pfad.lastIndexOf("/") + 1).replace(/\.md$/, "").replace(/^\d{4}-\d{2}-\d{2} /, "")),
      datum: s10(fm.datum), bis: s10(fm.bis), kategorie: String(fm.kategorie || ""), code: String(fm.code || ""), herkunft: String(fm.herkunft || ""),
      erledigt: fm.erledigt === true,
    })).filter((e) => e.datum && e.datum >= von && e.datum <= bis).sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0));
    const T = ctx.plugin && ctx.plugin.erweiterungen && ctx.plugin.erweiterungen.todos;
    const liste = T && typeof T.lesen === "function" ? await T.lesen("todos") : [];
    // Kennung aus Notiz und Zeile; zusammenführen darf der Server nur offene Aufgaben unter „Zu tun“ einer Begleitnotiz
    const Q = ctx.user.quellen;
    const unterZuTun = (f, nr) => {
      const c = app.metadataCache.getFileCache(f) || {};
      if (!c.frontmatter || c.frontmatter.typ !== "unterlage") return false;
      const h = (c.headings || []).filter((x) => x.position.start.line < nr).pop();
      return !!h && /^Zu tun\b/.test(h.heading);
    };
    const todos = liste.map((x) => ({ text: String(x.text || ""), code: codeVon(x.f), frist: x.faellig ? tagIso(x.faellig) : "",
      id: "t-" + Q.kurzHash(x.f.path + "\n" + x.roh), pfad: x.f.path, aenderbar: unterZuTun(x.f, x.nr), nr: x.nr, roh: x.roh }));
    return { termine, todos };
  };
  // Lagebild für die Claude-App (nur solange sie an ist, standSenden): aus den Lesern des Plugins, jeder Teil für sich (ein Fehler
  // lässt nur ihn leer). Geprüft und gekürzt wird es in lagebildKurz.
  //   lernplan: ctx.lernplan.kapitelStand (Häkchen und Woche des Plans je Kapitel); karten: fällig je Modul wie „X fällig“ in
  //   Karteikarten (fällig und in den Lernschritten, ohne neue); pruefungen: alle Prüfungen des Fachmodells vom letzten Jahr bis in
  //   einem Jahr, dazu Module mit Ergebnis oder Anmeldung ohne Prüfungstag; Note, Versuch und Anmeldung aus der Modulnotiz, sonst aus
  //   Alma (alma-konto.json), Note und Versuch nur an der Klausur, zu der sie gehören; stundenplan: deine Lehrveranstaltungen der nächsten 14 Tage wie im Stundenplan (findetStatt; „Besuche ich
  //   nicht“ fehlt, ein Ausfall mit ausfall: true; nicht im Titel, den lagebildKurz kürzt)
  const ERGEBNIS_STATUS = ["bestanden", "anerkannt", "nicht bestanden", "endgültig nicht bestanden"];
  const lagebildObs = async () => {
    const M = ctx.modell, aus = { lernplan: [], karten: [], pruefungen: [], stundenplan: [] };
    if (!M || typeof M.daten !== "function") return aus;
    const D = M.daten(), jetzt = new Date(), heute = tagIso(jetzt);
    const tag = (n) => tagIso(new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate() + n));
    const teil = async (name, fn) => { try { aus[name] = (await fn()) || []; } catch (e) { console.error("server: Lagebild " + name, e); } };
    await teil("lernplan", () => (ctx.lernplan && typeof ctx.lernplan.kapitelStand === "function" ? ctx.lernplan.kapitelStand() : []));
    await teil("karten", async () => {
      const k = ctx.karten && typeof ctx.karten.heuteJeModul === "function" ? (await ctx.karten.heuteJeModul()) || {} : {};
      return Object.keys(k).map((modul) => ({ modul, faellig: (Number(k[modul].faellig) || 0) + (Number(k[modul].lernen) || 0) }));
    });
    await teil("pruefungen", () => {
      const A = ctx.almaKonto && typeof ctx.almaKonto.zustand === "function" ? ctx.almaKonto.zustand() || {} : {};
      const lm = (A.leistungen && A.leistungen.module) || {}, bel = (A.belegungen && A.belegungen.pruefungen) || {};
      const ergebnis = (code) => {
        const m = (D.module || []).find((x) => x.code === code) || null, a = lm[code] || {}, b = bel[code] || {};
        const status = m ? m.status : "";
        return { note: (m && m.ergebnis) || (a.note != null && String(a.note)) || (ERGEBNIS_STATUS.indexOf(status) >= 0 ? status : ""),
          versuch: Number(m && m.fm && m.fm.versuch) || Number(a.versuch) || 0,
          anmeldung: status === "angemeldet" ? "angemeldet" : ["angemeldet", "zurückgetreten"].indexOf(b.status) >= 0 ? b.status : "" };
      };
      // Note und Versuch gehören zur letzten Klausur, die schon war (ohne Zwischentests), sonst zu einem Eintrag ohne Tag; nie zu
      // einem kommenden Termin (der Nachholtermin nach einem bestandenen Haupttermin trug sonst dessen Note)
      const l = (typeof M.pruefungen === "function" ? M.pruefungen({ heute, ab: tag(-365), bis: tag(365) }) : []).filter((p) => p.code);
      const geschrieben = {};
      for (const p of l) if (!p.zwischentest && p.datum <= heute) geschrieben[p.code] = p;
      const liste = l.map((p) => {
        const e = ergebnis(p.code), hier = geschrieben[p.code] === p;
        return { modul: p.code, titel: p.titel, datum: p.datum, anmeldung: e.anmeldung, note: hier ? e.note : "", versuch: hier || !e.note ? e.versuch : 0 };
      });
      for (const m of D.module || []) {
        const e = ergebnis(m.code), da = liste.some((p) => p.modul === m.code);
        if (da && (geschrieben[m.code] || !e.note)) continue;
        if (e.note || e.anmeldung) liste.push({ modul: m.code, titel: m.titel, note: e.note, versuch: e.versuch, anmeldung: da ? "" : e.anmeldung });
      }
      return liste;
    });
    await teil("stundenplan", () => {
      const liste = [];
      if (typeof M.findetStatt !== "function") return liste;
      for (let i = 0; i < 14; i++) {
        const d = tag(i);
        for (const x of D.stundenplan || []) {
          const fm = x.fm || {}, s = M.findetStatt(fm, d) || {}, titel = String(fm.titel || (x.f && x.f.basename) || "");
          if (s.statt) liste.push({ datum: d, von: s.beginn, bis: s.ende, titel, ort: s.raum, modul: fm.code });
          else if (s.grund === "ausfall") liste.push({ datum: d, von: s.beginn, bis: s.ende, titel, ausfall: true, modul: fm.code });
        }
      }
      return liste.sort((a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : String(a.von || "").localeCompare(String(b.von || ""))));
    });
    return aus;
  };
  const obsidianAbh = () => ({
    io: obsidianIo(), netz: netzObs, geheim: geheimObs, geheimId, lokal: lokalObs,
    jetzt: () => new Date(),
    geraetId: () => ctx.zentral.geraetId(),
    zentral: () => ctx.zentral,
    // was zählt: Module in deinem Plan bzw. laut Musterplan jetzt oder im nächsten Fachsemester (wie die zentralen Termine)
    stand: () => {
      const D = ctx.modell.daten();
      return { module: Object.keys(ctx.zentral.filterBauen().codes).sort(), studienbeginn: D.studienbeginn || "", variante: D.variante || "", takt: taktAus(einstellungenFm()),
        lernplan: unterlagenModus() === "aus" ? null : lernplanAuswahl() };
    },
    modulLink: (code) => { const e = eba(), m = e && code && e.modulNachCode(code); return m ? `[[${m.f.basename}]]` : ""; },
    bestaetigen: bestaetigenObs,
    eintippen: eintippenObs,
    // Erkennung der Kurspasswörter aus ilias.js für den Filter der Zugangsdaten (siehtGeheimAus)
    ohneKennwort: (s) => (ctx.ilias && typeof ctx.ilias.ohneKennwort === "function" ? ctx.ilias.ohneKennwort(s) : s),
    sperre: ctx.user.sperre,
    quellen: ctx.user.quellen,
    standText: (s) => ctx.verbindungen.standText(s), // nur die Zeile unter Verbindungen fragt danach, also ist verbindungen.js geladen
    tresor: tresorObs,
    lagebild: lagebildObs,
    unterlagen: unterlagenObs,
    kapitelUnterlagen: kapitelUnterlagenObs,
    lernplan: () => ctx.lernplan || null,
    // Lernplan-Notizen vom Server zu diesen Modulen (herkunft: server) → [{ code, text }]
    lernplanNotizen: async (codes) => {
      const aus = [];
      for (const code of codes) {
        const f = app.vault.getAbstractFileByPath(`Lernplan/${code} Lernplan.md`);
        const fm = f && !f.children ? (app.metadataCache.getFileCache(f) || {}).frontmatter || {} : null;
        if (fm && fm.herkunft === "server") aus.push({ code, text: await app.vault.cachedRead(f) });
      }
      return aus;
    },
    pdf: async (p) => { const f = app.vault.getAbstractFileByPath(p); return f && !f.children ? new Uint8Array(await app.vault.readBinary(f)) : null; },
    mobil: !!(obs.Platform && obs.Platform.isMobile),
    lokalErlaubt: !!plugin().testServerLokal,
    // wie dieses Gerät in der Liste der Geräte auf dem Server heißt: nur die Art des Geräts, nie ein Name aus dem System
    geraetName: () => {
      const P = obs.Platform || {};
      return P.isIosApp ? (P.isTablet ? "iPad" : "iPhone") : P.isAndroidApp ? (P.isTablet ? "Android-Tablet" : "Android-Smartphone")
        : P.isMacOS ? "Mac" : P.isWin ? "Windows-PC" : P.isLinux ? "Linux-PC" : "";
    },
  });
  let motorInst = null;
  const motor = () => motorInst || (motorInst = erzeugen(obsidianAbh()));
  const neuZeichnen = () => {
    try { if (ctx.verbindungen && ctx.verbindungen.neuZeichnen) ctx.verbindungen.neuZeichnen(); } catch (e) { /* egal */ }
  };

  // Ergebnis als Hinweis, nur nach deinem Tipp (Quellen-Vertrag: nie vom Zeitplan)
  const zahl = (n, eins, mehr) => `${n} ${n === 1 ? eins : mehr}`;
  const melden = (b) => {
    if (!b || b.art === "nicht-verbunden" || b.art === "laeuft") return;
    let text = "";
    if (b.art === "anderes-geraet") text = "Ein anderes Gerät holt die Termine von deinem Server. Sie kommen über deinen Sync.";
    else if (b.art === "fehler") text = FEHLER[b.fehler];
    else {
      const n = b.angelegt.length, g = b.aktualisiert.length + b.entfaellt.length;
      const teile = [];
      if (n) teile.push(zahl(n, "neuer Termin", "neue Termine"));
      if (g) teile.push(zahl(g, "Termin geändert", "Termine geändert"));
      if (b.begleitnotizen.length) teile.push(zahl(b.begleitnotizen.length, "Begleitnotiz", "Begleitnotizen"));
      if (b.lernplaene) teile.push(zahl(b.lernplaene, "Lernplan", "Lernpläne"));
      if (b.hinweise) teile.push(zahl(b.hinweise, "Hinweis", "Hinweise"));
      if (b.todoDoppel.length) teile.push(zahl(b.todoDoppel.length, "doppeltes To-do zusammengeführt", "doppelte To-dos zusammengeführt"));
      text = teile.length ? "Neu von deinem Server: " + teile.join(", ") + "." : "Nichts Neues von deinem Server.";
      if (b.neuereVersion) text += " Für einen Teil brauchst du eine neuere Version.";
    }
    if (text) ctx.hinweis(text);
  };
  // Mails durchsuchen (Knopf im Fenster, Befehl): Lauf auf dem Server anstoßen, Ergebnis nach 5 Min. abholen. o.quarantaene:
  // Knopf „Noch einmal versuchen“ bei Mails, die der Server beiseitegelegt hat
  let plan = null;
  const durchsuchen = async (o) => {
    const erneut = !!(o && o.quarantaene);
    const r = await motor().anstossen(erneut ? { quarantaene: true } : undefined);
    if (r.ok) {
      ctx.hinweis(erneut ? "Dein Server versucht diese Mails noch einmal. Das Ergebnis kommt in ein paar Minuten."
        : "Claude durchsucht jetzt deine Mails. Neue Termine kommen in ein paar Minuten.");
      if (plan) plan.spaeter(5 * MIN);
    } else if (r.fehler === "zu-frueh") {
      ctx.hinweis(zuFruehText(r.wieder, new Date()));
    } else ctx.hinweis(r.fehler === "nicht-verbunden" ? "Verbinde zuerst deinen Server." : FEHLER[r.fehler] || FEHLER.netz);
    neuZeichnen();
    return r;
  };
  const jetztHolen = async (o) => { const b = await motor().abrufen(Object.assign({ manuell: true }, o)); melden(b); neuZeichnen(); return b; };

  // Knopf „Zusammenfassen“ im PDF-Kasten (pdfkasten.js). Stand einer Notiz: "" (kein Knopf: kein Server, Einstellung aus, kein
  // Lehrmaterial oder „Das Wichtigste“ steht schon) | "frei" | "angefordert" (gewünscht vor weniger als einem Tag; danach wieder
  // frei, falls es auf dem Server nicht geklappt hat)
  const zusammenfassenStand = async (pfad) => {
    const f = app.vault.getAbstractFileByPath(pfad || "");
    if (!f || f.children || unterlagenModus() === "aus" || !motor().sichtbar()) return "";
    const fm = (app.metadataCache.getFileCache(f) || {}).frontmatter || {};
    if (fm.typ !== "unterlage" || ARTEN_SENDEN.indexOf(fm.art) < 0) return "";
    if (begleitnotizErgaenzen(await app.vault.cachedRead(f), { wichtigste: [{ text: "x" }] }, "x.pdf") == null) return "";
    // Eine Notiz mit früherer Fassung schickt der Abruf von selbst (wunschOderVeraltet; im Modus alle ohnehin)
    const w = wunschOderVeraltet(f, fm);
    return w && Date.now() - Date.parse(w + ":00Z") < 24 * 60 * MIN ? "angefordert" : "frei";
  };
  // PDF zur Notiz: gleicher Name mit .pdf, sonst das Feld datei (obsidianIo().begleitnotiz andersherum) → Datei | null
  const pdfZurNotiz = (f, fm) => {
    const gleich = app.vault.getAbstractFileByPath(f.path.replace(/\.md$/i, ".pdf"));
    if (gleich && !gleich.children) return gleich;
    const ziel = String(fm.datei || "").replace(/^\[\[|\]\]$/g, "").split("|")[0];
    const d = ziel && app.metadataCache.getFirstLinkpathDest(ziel, f.path);
    return d && /\.pdf$/i.test(d.path) ? d : null;
  };
  const prozent = (x) => `${Math.max(1, Math.round(x * 100))} %`;
  // Wunsch in die Eigenschaften der Notiz (kommt über den Sync zum Gerät, das mit dem Server spricht), dann gleich abrufen. Mit
  // der PDF (bis 500 MB); kostet das mehr als PDF_FRAGEN eines Pro-Fensters oder hat sie mehr als 20 MB, fragt der Knopf erst.
  // → false, wenn du abbrichst
  const zusammenfassen = async (pfad) => {
    const f = app.vault.getAbstractFileByPath(pfad || "");
    if (!f || f.children) return false;
    const pdf = pdfZurNotiz(f, (app.metadataCache.getFileCache(f) || {}).frontmatter || {}), t = pdf && volltexte()[pdf.path];
    const bytes = t ? pdf.stat.size || 0 : 0, zuGross = bytes > PDF_MAX;
    let mitPdf = !!t && !zuGross;
    const seiten = t ? Number(t.fm.seiten) || 0 : 0, zeichen = t ? volltextText(await app.vault.cachedRead(t.f)).length : 0;
    if (mitPdf && (pdfKosten(seiten, zeichen, true) > PDF_FRAGEN || bytes > PDF_GROSS)) {
      const w = await wahlObs("Mit der PDF zusammenfassen?", "Mit der PDF sieht Claude auch Abbildungen, Tabellen und Formeln. " +
        `Bei ${seiten} Seiten braucht das grob geschätzt ${prozent(pdfKosten(seiten, zeichen, true))} deines Fünf-Stunden-Limits im Pro-Abo, ` +
        `nur mit dem Text etwa ${prozent(pdfKosten(seiten, zeichen, false))}.` +
        (bytes > PDF_GROSS ? ` Die PDF hat ${Math.round(bytes / 1048576)} MB, das Hochladen dauert eine Weile.` : ""), ["Mit PDF", "Nur Text"]);
      if (w < 0) return false;
      mitPdf = w === 0;
    }
    await app.fileManager.processFrontMatter(f, (fm) => {
      fm[WUNSCH] = new Date().toISOString().slice(0, 16) + "Z";
      if (mitPdf) fm[WUNSCH_PDF] = true; else delete fm[WUNSCH_PDF];
    });
    const hier = motor().verbunden();
    ctx.hinweis(`Claude fasst die Unterlage mit Opus zusammen${mitPdf ? " und liest dafür die PDF" : ""}. ` +
      "Das dauert einige Minuten, danach steht die Zusammenfassung hier." + (zuGross ? " Die PDF hat mehr als 500 MB, darum liest Claude nur ihren Text." : "") +
      (hier ? "" : " Dein Gerät mit dem Server schickt sie beim nächsten Abruf."));
    if (hier) {
      // kurz warten, bis Obsidian die Eigenschaften neu gelesen hat, dann senden; das Ergebnis holt ein Abruf in 10 Min.
      setTimeout(() => { motor().abrufen({}).then(() => { neuZeichnen(); if (plan) plan.spaeter(10 * MIN); }).catch((e) => console.error("server: Zusammenfassen", e)); }, 1500);
    }
    return true;
  };

  // Fenster „Eigener Server“ (InfoFenster in verbindungen.js): Stand, Hinweise, letzte Übernahmen, Trennen
  const kopieren = async (text) => {
    try {
      await navigator.clipboard.writeText(typeof text === "string" ? text : PROMPT);
      ctx.hinweis("Kopiert. Füg den Text in Claude Desktop im Tab „Code“ ein.");
    } catch (e) {
      ctx.hinweis("Kopieren ging nicht. Den Text findest du im README unter „Für Technische“.");
    }
  };
  // Wie oft dein Server nachsieht: zwei Auswahlfelder, schreiben in die Einstellungen (alle Geräte)
  const taktSetzen = async (k, wert) => {
    const f = app.vault.getAbstractFileByPath(EINSTELLUNGEN);
    if (!f || f.children) return false;
    await app.fileManager.processFrontMatter(f, (fm) => { fm["server_" + k] = wert; });
    ctx.hinweis("Dein Server richtet sich ab dem nächsten Abruf danach.");
    return true;
  };
  const taktZeigen = (box) => {
    const t = taktAus(einstellungenFm());
    box.createEl("p", { cls: "eba-modal-abschnitt", text: "Wie oft dein Server nachsieht" });
    const s = box.createDiv({ cls: "eba-modal-schalter" });
    const zeile = (name, k) => new obs.Setting(s).setName(name).addDropdown((d) => {
      for (const [w, text] of TAKT_WAHL[k]) d.addOption(String(w), text);
      d.setValue(String(t[k])).onChange((w) => { taktSetzen(k, Number(w)).catch((e) => console.error("server: Takt", e)); });
    });
    zeile("Uni-Postfach", "uni_postfach");
    zeile("Gmail", "gmail");
  };
  // Nach dem Verbinden (Link oder Code): Hinweis, Zeile neu, gleich abrufen
  const nachVerbinden = async () => {
    ctx.hinweis("Mit deinem Server verbunden. Die Termine kommen gleich.");
    neuZeichnen();
    await jetztHolen();
  };
  // Weiteres Gerät verbinden: erst die Rückfrage, dann der Code groß im Fenster mit Ablauf und Anleitung, bis er abläuft. Er steht
  // nur hier (nie im Tresor, in data.json, server.json oder im Gerätespeicher); ein neuer Code ersetzt ihn auch auf dem Server.
  const GERAET_FEHLER = {
    "nicht-verbunden": "Verbinde zuerst deinen Server.",
    zugang: FEHLER.zugang,
    erneuert: FEHLER.erneuert,
    uhr: "Die Uhr dieses Geräts geht falsch. Stell sie richtig und versuch es noch einmal.",
    alt: FEHLER.alt,
    paket: FEHLER.paket,
    netz: FEHLER.netz,
    speichern: "Dein Server konnte das nicht speichern (ist sein Speicher voll?). Bis zu seinem nächsten Neustart gilt es; versuch es danach noch einmal.",
  };
  const geraetFehler = (r, jetzt) => {
    if (r.fehler !== "zu-viele") return GERAET_FEHLER[r.fehler] || FEHLER.netz;
    const d = new Date(r.wieder || "");
    return "Du hast gerade schon mehrere Codes erzeugt." + (isNaN(d.getTime()) ? " Versuch es später wieder." : ` Wieder möglich ab ${zeitText(d, jetzt)}.`);
  };
  let codeNr = 0; // nur der zuletzt gezeigte Code verschwindet zu seiner Zeit
  const codeZeigen = async (platz, knopf) => {
    const ja = await bestaetigenObs("Weiteres Gerät verbinden?",
      "Wer diesen Code hat, kann alles lesen, was dein Server für dich findet. Gib ihn nur auf deinem eigenen Gerät ein.", "Code erzeugen");
    if (!ja) return;
    knopf.disabled = true;
    const r = await motor().geraetCode();
    knopf.disabled = false;
    const nr = ++codeNr;
    platz.empty();
    if (!r.ok) { platz.createEl("p", { cls: "eba-modal-meldung fehler", text: geraetFehler(r, new Date()) }); return; }
    platz.createEl("p", { cls: "eba-modal-abschnitt", text: "Code für dein neues Gerät" });
    platz.createDiv({ cls: "eba-server-code", text: r.code });
    platz.createEl("p", { cls: "eba-modal-text", text: codeAnleitung(r, new Date()) });
    ctx.zeit(() => { if (nr === codeNr) platz.empty(); }, Math.max(0, Date.parse(r.ablauf) - Date.now()));
  };
  // Text mit **fett** (nur das) in ein Element
  const fettSchreiben = (el, text) => String(text).split(/\*\*([^*]+)\*\*/).forEach((t, i) => { if (i % 2) el.createEl("b", { text: t }); else if (t) el.appendText(t); });
  const caFehlerText = (r, jetzt) => {
    if (r.fehler === "zu-viele") { const d = new Date(r.wieder || ""); return isNaN(d.getTime()) ? "Zu viele Versuche. Versuch es später wieder." : `Zu viele Versuche. Wieder möglich ab ${zeitText(d, jetzt)}.`; }
    return CA_FEHLER[r.fehler] || GERAET_FEHLER[r.fehler] || FEHLER.netz;
  };
  const adresseKopieren = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      ctx.hinweis("Adresse kopiert. Füg sie in claude.ai beim neuen Konnektor ein.");
    } catch (e) {
      ctx.hinweis("Kopieren ging nicht. Tipp ins Feld und kopier die Adresse von Hand.");
    }
  };
  // Claude-App im Fenster „Eigener Server“, nur auf einem Gerät mit Schlüsseln (nie in der Einrichtung): je Verbindung eine Zeile
  // (Name der App, seit wann, zuletzt benutzt) mit Trennen, sonst „Nicht verbunden.“; darunter „Mit der Claude-App verbinden“: nach der
  // Rückfrage drei Schritte, die Adresse zum Kopieren und der Code, bis er abläuft (wie bei „Weiteres Gerät verbinden“ nur hier, nie im
  // Tresor, in data.json, server.json oder im Gerätespeicher); leise „Claude-App ganz ausschalten“, solange sie an ist. Zuerst der Stand
  // aus server.json, dann fragt das Fenster den Server (status): Kennt er die Claude-App nicht (404) oder ist sie abgeschaltet (503),
  // steht statt des Knopfs ein Satz. m: Ablauf (motor(), im Test erzeugen(abh)); o.nachCode: gleich danach (abrufen, damit das
  // Lagebild mit dem Stand an den Server geht). → Promise, die mit der Antwort auf status endet
  let caNr = 0;
  const claudeAppZeigen = async (box, m, o) => {
    const teil = box.createDiv({ cls: "eba-server-claude" });
    teil.createEl("p", { cls: "eba-modal-abschnitt", text: "Claude-App" });
    const zeilen = teil.createDiv();
    const meldung = teil.createEl("p", { cls: "eba-modal-meldung" });
    const knoepfe = teil.createDiv({ cls: "modal-button-container" });
    const los = knoepfe.createEl("button", { text: "Mit der Claude-App verbinden" });
    const platz = teil.createDiv();
    const ausZeile = teil.createEl("p", { cls: "eba-modal-hinweis" });
    const fehler = (r) => { meldung.addClass("fehler"); meldung.setText(caFehlerText(r, new Date())); };
    const leise = (text) => { meldung.removeClass("fehler"); meldung.setText(text); };
    // Server ohne Connector oder abgeschaltet: kein Knopf, nur der Satz
    const ohneKnopf = (r) => { if (r.fehler !== "alt" && r.fehler !== "abgeschaltet") return false; knoepfe.empty(); platz.empty(); leise(CA_FEHLER[r.fehler]); return true; };
    const trennen = async (id) => {
      const r = await m.claudeAppTrennen(id);
      if (r.abgebrochen) return;
      if (!r.ok) { if (!ohneKnopf(r)) fehler(r); return; }
      leise("");
      zeichnen(r.stand);
      ctx.hinweis("Die Claude-App ist getrennt.");
    };
    const aus = async () => {
      const r = await m.claudeAppAus();
      if (r.abgebrochen) return;
      if (!r.ok) { if (!ohneKnopf(r)) fehler(r); return; }
      caNr++;
      platz.empty();
      leise("");
      zeichnen(r.stand);
      ctx.hinweis("Die Claude-App ist ausgeschaltet.");
    };
    const zeichnen = (st) => {
      zeilen.empty();
      ausZeile.empty();
      const v = st ? st.verbindungen : [];
      if (!v.length) zeilen.createEl("p", { cls: "eba-modal-text", text: "Nicht verbunden. Mit ihr fragst du Claude nach deinem Studium, etwa „Was steht diese Woche an?“" });
      else {
        const s = zeilen.createDiv({ cls: "eba-modal-schalter" }), jetzt = new Date();
        for (const e of v) {
          new obs.Setting(s).setName(e.client).setDesc(caZeileText(e, jetzt).replace(/^v/, "V")).addButton((b) => b.setButtonText("Trennen").setWarning()
            .onClick(() => { trennen(e.id).catch((x) => console.error("server: Claude-App trennen", x)); }));
        }
      }
      if (st && st.an) {
        const a = ausZeile.createEl("a", { text: "Claude-App ganz ausschalten", href: "#" });
        a.addEventListener("click", (ev) => { ev.preventDefault(); aus().catch((x) => console.error("server: Claude-App aus", x)); });
      }
    };
    const codeZeigenCa = (r) => {
      platz.createEl("p", { cls: "eba-modal-abschnitt", text: "In claude.ai verbinden" });
      const ol = platz.createEl("ol", { cls: "eba-modal-schritte" });
      for (const t of CA_SCHRITTE) fettSchreiben(ol.createEl("li"), t);
      const feld = platz.createEl("input", { type: "text", cls: "eba-modal-feld",
        attr: { readonly: "readonly", autocomplete: "off", autocapitalize: "off", autocorrect: "off", spellcheck: "false", "aria-label": "Adresse für claude.ai" } });
      feld.value = r.adresse;
      feld.addEventListener("focus", () => { try { feld.select(); } catch (e) { /* ohne Auswahl */ } });
      platz.createDiv({ cls: "modal-button-container" }).createEl("button", { text: "Adresse kopieren", cls: "mod-cta" })
        .addEventListener("click", () => { adresseKopieren(r.adresse); });
      platz.createEl("p", { cls: "eba-modal-abschnitt", text: "Code für die Seite deines Servers" });
      platz.createDiv({ cls: "eba-server-code", text: r.code });
      platz.createEl("p", { cls: "eba-modal-text", text: `Gilt bis ${zeitText(new Date(r.ablauf), new Date())} und nur einmal.` });
      const mehr = platz.createEl("details", { cls: "eba-modal-mehr" });
      mehr.createEl("summary", { text: "Sicher einstellen" });
      mehr.createEl("p", { text: CA_SICHER });
    };
    los.addEventListener("click", () => {
      (async () => {
        los.disabled = true;
        leise("");
        const r = await m.claudeAppCode();
        los.disabled = false;
        if (r.abgebrochen) return;
        const nr = ++caNr;
        platz.empty();
        if (!r.ok) { if (!ohneKnopf(r)) fehler(r); return; }
        codeZeigenCa(r);
        zeichnen(await m.claudeAppStand());
        // der Code verschwindet zu seinem Ablauf (nur der zuletzt gezeigte)
        ctx.zeit(() => { if (nr === caNr) platz.empty(); }, Math.max(0, Date.parse(r.ablauf) - Date.now()));
        if (o && o.nachCode) o.nachCode();
      })().catch((e) => { console.error("server: Claude-App verbinden", e); los.disabled = false; });
    });
    zeichnen(await m.claudeAppStand());
    const r = await m.claudeAppStatus();
    if (r.ok) zeichnen(r.stand);
    else ohneKnopf(r);
    return r;
  };
  // Ein anderes Gerät trennen (Liste „Geräte“ im Fenster): erst die Rückfrage (trennenFrage), dann alles oder nur dieses
  const geraetTrennenFragen = async (g, knopf, neu) => {
    const f = trennenFrage(g);
    const wahl = await wahlObs(f.titel, f.text, f.knoepfe);
    if (wahl < 0) return;
    knopf.disabled = true;
    const r = await motor().geraetTrennen(g.id, f.behalten(wahl));
    if (r.ok || r.fehler === "unbekannt") ctx.hinweis(g.ohneName ? "Das Gerät ist getrennt." : `„${g.name}“ ist getrennt.`);
    else { knopf.disabled = false; ctx.hinweis(GERAET_FEHLER[r.fehler] || FEHLER.netz); }
    neuZeichnen();
    if (neu) neu();
  };
  // Mit Code verbinden (Gerät ohne gültige Verbindung, aber mit Server im Tresor): Feld für den Code, ohne bekannte Adresse (ältere
  // server.json) auch für sie; dann Rückfrage und Einlösen wie beim Link. neu(): Fenster neu zeichnen
  // ohneTitel: ohne die Zeile „Mit Code verbinden“ (zugeklappt: die steht schon darüber)
  const codeFelder = async (box, neu, ohneTitel) => {
    // Vorbelegt nur die Adresse aus dem Schlüsselbund; die aus server.json (ungeprüft) steht nirgends im Fenster
    const eigen = motor().adresseGeprueft();
    const ohneSchema = (a) => (/^https:\/\//.test(a) ? hostVon(a) : a);
    if (!ohneTitel) box.createEl("p", { cls: "eba-modal-abschnitt", text: "Mit Code verbinden" });
    const zeilen = box.createDiv({ cls: "eba-modal-zugang" });
    const feld = (name, attr) => {
      const z = zeilen.createDiv({ cls: "eba-modal-zeile" });
      z.createEl("label", { cls: "eba-modal-label", text: name });
      return z.createEl("input", { type: "text", cls: "eba-modal-feld",
        attr: Object.assign({ autocomplete: "off", autocapitalize: "off", autocorrect: "off", spellcheck: "false", "aria-label": name }, attr) });
    };
    // Die Adresse steht immer im Feld: mit Schlüsselbund schon eingetragen (ohne https://; nach einer neuen IP tippt man die neue
    // darüber, verbinden() fragt dann nach ihrem Namen), sonst leer, abzutippen vom Gerät, das den Code erzeugt hat.
    const code = feld("Code", { placeholder: "ABCDE-FGHJK", autocapitalize: "characters", enterkeyhint: "next" });
    const adresse = feld("Adresse deines Servers", { placeholder: "https://…", inputmode: "url", enterkeyhint: "go" });
    if (eigen) adresse.value = ohneSchema(eigen);
    box.createEl("p", { cls: "eba-modal-hinweis", text: eigen
      ? "Hat dein Server eine neue Adresse, steht sie auf deinem verbundenen Gerät unter dem Code oder am Ende der Einrichtung. Trag sie dann hier ein."
      : "Die Adresse steht auf dem Gerät, das den Code erzeugt hat, unter dem Code, oder am Ende der Einrichtung." });
    const meldung = box.createEl("p", { cls: "eba-modal-meldung" });
    const knopf = box.createDiv({ cls: "modal-button-container" }).createEl("button", { text: "Mit Code verbinden", cls: "mod-cta" });
    const los = async () => {
      knopf.disabled = true;
      meldung.removeClass("fehler");
      meldung.setText("");
      const r = await motor().codeVerbinden(code.value, adresse.value);
      knopf.disabled = false;
      if (r.abgebrochen) return;
      if (!r.ok) { meldung.addClass("fehler"); meldung.setText(r.fehler); return; }
      code.value = "";
      if (neu) neu();
      await nachVerbinden();
    };
    knopf.addEventListener("click", () => { los().catch((e) => { console.error("server: Mit Code verbinden", e); knopf.disabled = false; }); });
    for (const f of [code, adresse]) f.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); knopf.click(); } });
  };
  // Was der letzte Abruf an deinen Notizen geändert hat, mit „Rückgängig“ (nur auf dem Gerät, das abgerufen hat)
  const rueckZeigen = (box, neu) => {
    const r = motor().rueckStand();
    if (!r) return;
    const teile = [].concat(r.todos ? [zahl(r.todos, "doppeltes To-do zusammengeführt", "doppelte To-dos zusammengeführt")] : [],
      r.termine ? [zahl(r.termine, "Termin geändert", "Termine geändert")] : []);
    box.createEl("p", { cls: "eba-modal-abschnitt", text: "Zuletzt geändert" });
    box.createEl("p", { cls: "eba-modal-text", text: `${r.wann}: ${teile.join(", ")}. Wolltest du das nicht, nimmst du es hier zurück.` });
    const knopf = box.createDiv({ cls: "modal-button-container" }).createEl("button", { text: "Rückgängig" });
    knopf.addEventListener("click", () => {
      knopf.disabled = true;
      motor().rueckgaengig().then((x) => {
        ctx.hinweis(x.zurueck ? `${zahl(x.zurueck, "Änderung", "Änderungen")} zurückgenommen.` + (x.uebersprungen ? ` ${zahl(x.uebersprungen, "Notiz bleibt", "Notizen bleiben")}, wie du sie inzwischen geändert hast.` : "")
          : "Nichts zurückgenommen: Du hast die Notizen inzwischen selbst geändert.");
        neuZeichnen();
        if (neu) neu();
      }).catch((e) => { console.error("server: Rückgängig", e); knopf.disabled = false; });
    });
  };
  // neu(): Fenster neu zeichnen (nach „Mit Code verbinden“)
  const fensterInhalt = async (el, neu) => {
    const box = el.createDiv({ cls: "eba-server" });
    // Noch kein Server: der Knopf zum Kopieren des Prompts (Schritte und Hintergrund stehen im Fenster darüber), darunter „Mit Code
    // verbinden“ für Code und Adresse, die der Server am Ende der Einrichtung zeigt (ein Link von außen verbindet nicht)
    if (!motor().sichtbar()) {
      box.createDiv({ cls: "modal-button-container" }).createEl("button", { text: "Prompt kopieren", cls: "mod-cta" }).addEventListener("click", () => kopieren());
      await codeFelder(box, neu);
      return;
    }
    // Server da, dieses Gerät nicht verbunden, seine Schlüssel abgelehnt (etwa nach „schluessel-erneuern“ oder einer neuen IP) oder
    // der Server tagelang nicht erreichbar (neue Adresse?): zuerst der Code, mit der Adresse zum Überschreiben. Gerade nicht erreichbar
    // oder eine Antwort wie von einem alten Server: zugeklappt (mit Riegel sieht ein Gerät so auch Schlüssel, die er nicht mehr kennt)
    const s = motor().status();
    const abgelehnt = s.verbunden && (s.code === "zugang" || s.code === "paket" || s.code === "erneuert" || s.ruht || s.weg);
    if (!s.verbunden || abgelehnt) await codeFelder(box, neu);
    else if (s.code === "netz" || s.code === "alt") {
      const auf = box.createEl("details", { cls: "eba-server-verbindungen" });
      auf.createEl("summary", { text: "Mit Code neu verbinden" });
      await codeFelder(auf, neu, true);
    }
    const d = await motor().einzelheiten();
    if (d.liste.length) {
      const ul = box.createEl("ul", { cls: "eba-server-stand" });
      for (const z of d.liste) { const li = ul.createEl("li"); li.createEl("b", { text: z[0] + ": " }); li.appendText(z[1]); }
    }
    // alle Verbindungen, die der Server meldet (die neueste steht oben unter „Zuletzt verbunden“), zugeklappt
    if (d.verbindungen.length > 1) {
      const auf = box.createEl("details", { cls: "eba-server-verbindungen" });
      auf.createEl("summary", { text: `Alle Verbindungen von Geräten (${d.verbindungen.length})` });
      const ul = auf.createEl("ul", { cls: "eba-server-stand" });
      for (const t of d.verbindungen) ul.createEl("li", { text: t });
    }
    // Geräte mit eigenen Schlüsseln (Server ab dieser Fassung), zugeklappt: je Gerät eine Zeile, dieses zuerst; jedes andere lässt sich
    // trennen. Ein älterer Server nennt keine: dann nichts
    if (d.geraete && d.geraete.length) {
      const auf = box.createEl("details", { cls: "eba-server-verbindungen eba-server-geraete" });
      auf.createEl("summary", { text: `Geräte (${d.geraete.length})` });
      const ul = auf.createEl("ul");
      for (const g of d.geraete) {
        const li = ul.createEl("li"), text = li.createSpan();
        text.createEl("b", { text: g.name });
        text.appendText((g.dieses ? " (dieses Gerät)" : "") + ": " + g.text);
        if (g.dieses) continue;
        const k = li.createEl("button", { text: "Trennen" });
        k.addEventListener("click", () => { geraetTrennenFragen(g, k, neu).catch((e) => { console.error("server: Gerät trennen", e); k.disabled = false; }); });
      }
    }
    for (const t of d.saetze) box.createEl("p", { cls: "eba-modal-hinweis", text: t });
    // Mails, an denen jeder Lauf scheiterte: liegen auf dem Server beiseite, bis man es noch einmal versucht
    if (d.quarantaene) {
      box.createEl("p", { cls: "eba-modal-text", text: `${zahl(d.quarantaene, "Mail konnte", "Mails konnten")} nicht gelesen werden. Dein Server hat sie beiseitegelegt, damit nicht jeder Lauf an ${d.quarantaene === 1 ? "ihr" : "ihnen"} scheitert.` });
      const k = box.createDiv({ cls: "modal-button-container" }).createEl("button", { text: "Noch einmal versuchen" });
      k.addEventListener("click", () => {
        k.disabled = true;
        durchsuchen({ quarantaene: true }).then(() => { if (neu) neu(); }, (e) => { console.error("server: noch einmal versuchen", e); k.disabled = false; });
      });
    }
    // Hinweise von Claude stehen in server.json, die jedes Gerät mit Sync schreiben kann: Ohne Eintrag im Schlüsselbund (hier stehen
    // dann die Felder zum Verbinden) zeigt das Fenster sie nicht, damit kein untergeschobener Hinweis eine Adresse oder einen Code
    // zum Abtippen nennt
    if (d.hinweise.length && !s.verbunden) {
      box.createEl("p", { cls: "eba-modal-hinweis", text: "Die Hinweise von Claude siehst du hier, sobald dieses Gerät mit deinem Server verbunden ist." });
    } else if (d.hinweise.length) {
      box.createEl("h4", { text: "Hinweise von Claude" });
      const ul = box.createEl("ul", { cls: "eba-server-hinweise" });
      for (const h of d.hinweise) ul.createEl("li", { text: h.text + (h.quelle ? ` (${h.quelle})` : "") });
      if (motor().neueHinweise()) { motor().hinweiseGesehen(); neuZeichnen(); }
    }
    if (d.laeufe.length) {
      box.createEl("h4", { text: "Zuletzt übernommen" });
      const ul = box.createEl("ul", { cls: "eba-server-laeufe" });
      for (const l of d.laeufe) ul.createEl("li", { text: [l.wann, zahl(l.termine || 0, "Termin", "Termine"), zahl(l.hinweise || 0, "Hinweis", "Hinweise")].concat(l.begleitnotizen ? [zahl(l.begleitnotizen, "Begleitnotiz", "Begleitnotizen")] : []).concat(l.lernplaene ? [zahl(l.lernplaene, "Lernplan", "Lernpläne")] : []).concat(l.doppelt ? [zahl(l.doppelt, "Doppel", "Doppel") + " übersprungen"] : []).concat(l.todos ? [zahl(l.todos, "To-do", "To-dos") + " zusammengeführt"] : []).join(" · ") });
    }
    rueckZeigen(box, neu);
    taktZeigen(box);
    const plugins = app.plugins;
    const angebot = livesyncAngebot({ verbunden: motor().verbunden(), livesync: (motor().status().werte || {}).livesync,
      hier: !!(plugins && plugins.enabledPlugins && plugins.enabledPlugins.has("obsidian-livesync")) });
    if (angebot) {
      box.createEl("p", { cls: "eba-modal-abschnitt", text: angebot.titel });
      box.createEl("p", { cls: "eba-modal-text", text: angebot.text });
      box.createDiv({ cls: "modal-button-container" }).createEl("button", { text: "Prompt kopieren", cls: "mod-cta" }).addEventListener("click", () => kopieren(LIVESYNC_PROMPT));
    }
    if (s.verbunden && !abgelehnt) {
      const k = box.createDiv({ cls: "modal-button-container" });
      k.createEl("button", { text: "Mails durchsuchen" }).addEventListener("click", () => durchsuchen());
      const weiteres = k.createEl("button", { text: "Weiteres Gerät verbinden" });
      const platz = box.createDiv();
      weiteres.addEventListener("click", () => { codeZeigen(platz, weiteres).catch((e) => { console.error("server: Weiteres Gerät", e); weiteres.disabled = false; }); });
      // Claude-App: zeichnet sofort aus server.json und fragt den Server danach, ohne das Fenster aufzuhalten. Nach dem Code gleich
      // abrufen: Ist dieses Gerät das abrufende, geht das Lagebild mit dem Stand schon jetzt an den Server
      claudeAppZeigen(box, motor(), { nachCode: () => { motor().abrufen({}).then(neuZeichnen, (e) => console.error("server: Abruf nach dem Code", e)); } })
        .catch((e) => console.error("server: Claude-App", e));
    }
    if (s.verbunden) box.createEl("p", { cls: "eba-modal-hinweis" }).createEl("a", { text: "Dieses Gerät trennen", href: ctx.link("trennen", { id: "server" }) });
  };

  // ---------- Erweiterung ----------
  const AKTIONEN = {
    // Knopf im Fenster „Eigener Server“ und Befehl: Claude-Lauf auf dem Server starten
    "server-durchsuchen": { titel: "Mails durchsuchen", ausfuehren: () => durchsuchen() },
    // Link vom Server (studium-server verbinden): adresse, code. Immer mit Rückfrage (motor().verbinden). Von außerhalb der App
    // (c.extern: Browser, Cloud Shell, andere App) nie (seit 02.11.2026): Jede Webseite könnte so einen Link bauen und ein Gerät auf
    // ihren Server lenken. Dann gibst du Code und Adresse unter Verbindungen ein („Mit Code verbinden“).
    "server-verbinden": {
      ausfuehren: async (c) => {
        if (c.extern === true) { ctx.hinweis(VON_AUSSEN); return; }
        const r = await motor().verbinden(c.parameter.adresse, c.parameter.code);
        if (r.abgebrochen) return;
        if (!r.ok) { ctx.hinweis(r.fehler); return; }
        await nachVerbinden();
      },
    },
  };

  // begleitnotizSauber, wunschWeg, ARTEN_SENDEN, volltexte, pdfZurNotiz, fassungExtern und wahl braucht auch claude.js (Zusammenfassen ohne Server)
  ctx.server = {
    erzeugen, aehnlich, adresseNormal, adresseEingabe, codeForm, codeAnleitung, PROMPT, LIVESYNC_PROMPT, livesyncAngebot, kopieren, begleitnotizErgaenzen, volltextText, kapitelText, listeAusNotiz, taktAus, pdfKosten, PDF_FRAGEN,
    begleitnotizSauber, wunschWeg, ARTEN_SENDEN, volltexte, pdfZurNotiz, fassungExtern, wahl: wahlObs, siehtGeheimAus, zuFruehText, VON_AUSSEN, zeilenDiff, zeilenZurueck, rueckKappen,
    sichtbar: () => motor().sichtbar(), status: () => motor().status(), zeile: () => motor().zeile(), verbunden: () => motor().verbunden(),
    jetztHolen, durchsuchen, zusammenfassenStand, zusammenfassen, terminsucheAn, trennen: async () => { await motor().trennen(); neuZeichnen(); }, fensterInhalt,
    hinweise: (o) => motor().hinweise(o), DATEI,
    // Claude-App: neue Verbindungen für „Seit deinem letzten Besuch“, Bausteine für Tests
    claudeAppNeu: (o) => motor().claudeAppNeu(o), claudeAppZeigen, claudeAppNormal, caBekannt, lagebildKurz, caNeuText, CA_LESEN, CA_FEHLER, LAGE, STAND_BYTES,
    ERGEBNIS_STATUS, lagebildObs, trennenFrage,
    // Bausteine des Verbindens und der Signaturen (Tests prüfen sie gegen bekannte Werte und gegen server/)
    protokoll: { pbkdf2, hkdf, hmac, codeAbleiten, austauschen, anfrageKopf, KDF_RUNDEN },
  };

  // Gemeinsamer Zeitplan (quellen.js): nach 30 s + Zufall bis 2 Min., dann alle 15 Min., nach Fehlern früher; zurück in der App
  // nach über 10 Min.
  const registrieren = () => {
    const Q = ctx.user && ctx.user.quellen;
    if (!Q) return;
    // Neue Hinweise für die Zeile: beim Start und wenn server.json kommt oder sich ändert (auch über den Sync)
    const hinweiseNeu = ctx.entprellen(() => { motor().hinweiseLaden().then(neuZeichnen).catch((e) => console.error("server: Hinweise", e)); }, 1000);
    hinweiseNeu();
    ctx.an(app.vault, "modify", (f) => { if (f.path === DATEI) hinweiseNeu(); });
    ctx.an(app.vault, "create", (f) => { if (f.path === DATEI) hinweiseNeu(); });
    plan = Q.planen(ctx, { takt: TAKT, zurueck: ZURUECK, backoff: [2 * MIN, 5 * MIN], start: [30000, 2 * MIN], lauf: async () => {
      // Schlüssel seit Tagen abgelehnt (ruht): nicht mehr von selbst fragen, bis du neu verbindest oder „Aktualisieren“ tippst
      if (plugin().testServerAus || !ctx.zentral || !motor().verbunden() || motor().ruht()) return null;
      const r = await motor().abrufen({});
      neuZeichnen();
      return r.art === "ok" ? true : r.art === "fehler" ? false : null;
    } });
  };

  return { registrieren, aktionen: AKTIONEN };
};
