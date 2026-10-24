// Eigener Server mit Claude: Ein kostenloser Server der Studentin oder des Studenten findet mit Claude Termine und Hinweise in
// Uni-Mails und Gmail (Server-Paket in server/ des Projekts). Dieses Skript holt die Ergebnisse ab, entschlüsselt sie und
// legt die Termine als Notizen an. Ohne Verbindung geht nichts ins Netz; unter Verbindungen steht dann nur eine leise Zeile
// „Für Technische“ mit dem Knopf „Prompt kopieren“ (Text zum Einfügen in Claude Desktop, PROMPT).
//
// Verbinden: Der Server zeigt einen Link obsidian://studium-autopilot?aktion=server-verbinden&adresse=…&code=… mit einem
//   Einmal-Code (30 Minuten). Jede Webseite könnte so einen Link bauen, darum immer mit Rückfrage. Das Plugin tauscht den Code
//   per HTTPS (POST /v1/verbinden) gegen Zugangs- und Datenschlüssel und legt beides mit der Adresse in den Schlüsselbund von
//   Obsidian (app.secretStorage: gerätelokal, verschlüsselt, nie synchronisiert; Eintrag je Tresor wie in ilias.js). Weitere
//   Geräte verbinden sich mit einem eigenen Code.
// Quellen-Vertrag (quellen.js, docs/architektur.md): Zeitplan planen(), Status in der gemeinsamen Form ({ zustand, geprueft, fehler,
//   fehlerZeit, warnungen }, nachLauf), Zeile im Format von verbindungen.js (quelleZeile), Besitz
//   herkunft: claude + claude_id, Grabstein (angewendet, kurzHash) in der Sperr-Datei, Doppel einer id zusammenführen (dubletten).
//   Hinweise nur über ctx.hinweis (hinweis.js) und nur nach deinem Tipp, nie vom Zeitplan. Wegwerfen nur über den einen
//   Papierkorb (quellen.js papierkorb).
// Abruf (beim Start nach 30 s bis 2,5 Min., dann alle 15 Min., nach Fehlern nach 2 bzw. 5 Min., zurück in der App nach über
//   10 Min.; Knopf „Aktualisieren“): GET /v1/eingang mit dem
//   Zugangsschlüssel → Paket mit AES-256-GCM (Zweck „eingang“ als Zusatzdaten, wie server/kanal.mjs) → noch nicht übernommene
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
// Doppelte To-dos: Claude nennt Paare (behalten, weg) über die Kennung aus dem Auszug (id = „t-“ + Q.kurzHash(Pfad + Zeile)).
//   Aus „weg“ wird ein einfacher Punkt mit Link auf die Notiz, in der die Aufgabe bleibt: nur eine offene Aufgabe unter „Zu tun“
//   einer Begleitnotiz (typ: unterlage), nur wenn die Zeile noch genau so dasteht; nie abgehakt, nie gelöscht.
// Hinweise: die letzten 30 in server.json, sichtbar im Fenster „Eigener Server“; nach „Aktualisieren“ nennt der Hinweis die Zahl.
//   Gibt es neue (noch nicht im Fenster gesehen, höchstens 14 Tage alt), heißt der Link der Zeile unter Verbindungen „Hinweise
//   ansehen“. Gesehen merkt sich jedes Gerät selbst (Kurz-Hashes, gerätelokal), denn server.json schreibt nur das übernehmende
//   Gerät. Kein Eintrag in „Bitte prüfen“: Eine Liste schöbe dir Arbeit zu, die das System selbst erledigen oder zeigen kann.
// Takt: Im Fenster stellst du ein, wie oft dein Server nachsieht (Uni-Postfach alle 15, 30 oder 60 Minuten, Gmail dreimal,
//   einmal oder nie am Tag); steht als server_uni_postfach und server_gmail in den Einstellungen (alle Geräte) und geht mit dem
//   Stand an den Server, der sich ab dem nächsten Abruf danach richtet.
// Status der Zeile: GET /v1/status (öffentlich, ohne persönliche Daten), höchstens alle 5 Min.; gerätelokal gemerkt.
// Mails durchsuchen: Knopf im Fenster und Befehl starten einen Claude-Lauf auf dem Server (POST /v1/anstoss, höchstens alle
//   10 Min.); die Zeile zeigt „Claude durchsucht gerade …“, solange der Server „wartet“ oder „laeuft“ meldet, und der nächste
//   Abruf kommt nach 5 Min. statt im Takt. Was nur du lösen kannst (Gerät neu verbinden, Claude neu verbinden, Uni-Passwort
//   nicht angenommen), sagt die Zeile selbst (Pille „prüfen“).
// server.json (System/Daten, synchronisiert, schreibt nur das übernehmende Gerät): { schema, erledigt: { Dateiname: Zeit }
//   (60 Tage), laeufe: [die letzten 20], hinweise: [die letzten 30], gesendet: { PDF-Kennung: Datum }, nachsenden: { PDF-Kennung:
//   Datum } (ein älterer Server nahm sie nicht an, NACHSENDEN_TAGE), begleitet: { PDF-Pfad: kurzHash } }. Der Grabstein
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
  // Takt des Servers: Werte wie TAKT in server/dienst.mjs, der erste ist der Standard
  const TAKT_WAHL = {
    uni_postfach: [[15, "alle 15 Minuten"], [30, "alle 30 Minuten"], [60, "stündlich"]],
    gmail: [[3, "dreimal am Tag"], [1, "einmal am Tag"], [0, "nie"]],
  };
  const taktWert = (k, w) => { const n = w == null || String(w).trim() === "" ? NaN : Number(w); return TAKT_WAHL[k].some((x) => x[0] === n) ? n : TAKT_WAHL[k][0][0]; };
  // Frontmatter der Einstellungen → { uni_postfach, gmail }
  const taktAus = (fm) => ({ uni_postfach: taktWert("uni_postfach", (fm || {}).server_uni_postfach), gmail: taktWert("gmail", (fm || {}).server_gmail) });
  const GEHEIM_PRAEFIX = "studium-autopilot-server-";
  const L = { status: "eba-server-status", abruf: "eba-server-abruf", gesendet: "eba-server-gesendet", gesehen: "eba-server-gesehen" };
  const SCHLUESSEL = /^[A-Za-z0-9_-]{43}$/; // 32 Byte, base64url
  const CODE = /^[A-HJ-NP-Z2-9]{5}-?[A-HJ-NP-Z2-9]{5}$/; // wie server/verbinden.mjs
  const DATEINAME = /^[0-9A-Za-z][0-9A-Za-z._-]{0,119}\.json$/; // wie server/dienst.mjs
  const ID = /^c-[0-9a-f]{20}$/; // wie idAus in server/eingang.mjs
  const TODO_ID = /^t-[0-9a-z]{1,13}$/; // wie TODO_ID in server/eingang.mjs
  const AUFGABE = /^([\s>]*[-*+] )\[ \] +(\S.*)$/; // offene Aufgabe wie in todos.js
  const KANAL = "studium-autopilot/kanal/v1/";
  // Sätze zu Fehlern eines Abrufs (Status fehler, Zeile)
  const FEHLER = {
    zugang: "Dein Server kennt dieses Gerät nicht mehr. Bitte neu verbinden.",
    gesperrt: "Dein Server sperrt gerade nach zu vielen Fehlversuchen. Es geht in 10 Minuten weiter.",
    paket: "Die Daten deines Servers ließen sich nicht entschlüsseln. Bitte neu verbinden.",
    netz: "Dein Server ist gerade nicht erreichbar.",
    intern: "Beim Übernehmen ging etwas schief. Der nächste Abruf versucht es erneut.",
  };
  const ENTFAELLT_ZENTRAL = "> Dieser Termin steht nicht mehr in den zentralen Daten. Deine Notizen unten bleiben.";
  const ENTFAELLT_SERVER = "> Laut deinem Server entfällt dieser Termin. Deine Notizen unten bleiben.";
  // Text zum Einfügen in Claude Desktop, Knopf „Prompt kopieren“ (gleicher Wortlaut wie im README, „Für Technische“). Die
  // Anleitung kommt aus dem Tag des neuesten Releases, nie von main: Sie lädt dann genau das Server-Paket ihrer Version.
  const PROMPT = "Richte mir den eigenen Server für Studium Autopilot ein oder setz die Einrichtung fort (github.com/studium-autopilot/ecoba).\n" +
    "Öffne dazu https://github.com/studium-autopilot/ecoba/releases/latest, nimm die Versionsnummer daraus (vX.Y.Z) und lies aus\n" +
    "genau dieser Version https://github.com/studium-autopilot/ecoba/blob/vX.Y.Z/server/skill/server-einrichten/SKILL.md und die\n" +
    "Dateien daneben. Steht in diesem Chat schon eine ältere Anleitung, gilt nur diese. Führe mich Schritt für Schritt.";
  // LiveSync (seit 0.5.7): Der Server gleicht auf Wunsch den Tresor zwischen Windows, iPhone und iPad ab. Nur auf einem
  // verbundenen Gerät, und nur solange LiveSync hier noch nicht läuft, steht im Fenster „Eigener Server“ der Knopf
  // „Prompt kopieren“ mit diesem Text (Ablauf im Skill: server/skill/server-einrichten/livesync.md).
  const LIVESYNC_PROMPT = "Richte LiveSync auf meinem eigenen Server für Studium Autopilot ein, damit mein Tresor zwischen meinen Geräten abgleicht\n" +
    "(github.com/studium-autopilot/ecoba). Öffne dazu https://github.com/studium-autopilot/ecoba/releases/latest, nimm die\n" +
    "Versionsnummer daraus (vX.Y.Z) und lies aus genau dieser Version\n" +
    "https://github.com/studium-autopilot/ecoba/blob/vX.Y.Z/server/skill/server-einrichten/SKILL.md und die Dateien daneben,\n" +
    "dann „LiveSync einrichten“. Führe mich Schritt für Schritt.";
  // Was das Fenster zu LiveSync zeigt: null (nicht verbunden, oder LiveSync läuft hier schon) | { titel, text }.
  // livesync: Wert des Servers („an“, „aus“, „unbekannt“ bei älteren Servern; die Anleitung aktualisiert sie zuerst)
  const livesyncAngebot = ({ verbunden, hier, livesync }) => {
    if (!verbunden || hier) return null;
    if (livesync === "an") {
      return { titel: "Dieses Gerät abgleichen", text: "LiveSync läuft schon auf deinem Server. Kopier den Prompt und füg ihn in Claude Desktop ein: Claude bringt deinen Tresor auch auf dieses Gerät." };
    }
    return { titel: "Windows und iPhone abgleichen", text: "Dein Server kann deinen Tresor zwischen Windows, iPhone und iPad abgleichen, kostenlos und ohne iCloud. Kopier den Prompt und füg ihn in Claude Desktop ein: Claude richtet alles ein und sagt dir, wo du tippen musst." };
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
  // Text eines Punkts: rein, ohne Links, HTML, Templater oder Code (der Server prüft das auch; hier noch einmal, er könnte fremd sein)
  const punktText = (v, max) => reinerText(String(v == null ? "" : v).replace(/\[\[|\]\]|`|<%|%>|<\/?[a-z!][^>]*>|obsidian:\/\/\S*|javascript:/gi, " "), max);
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
  // Notiz neben der PDF ergänzen (Regeln wie unterlagen.js: Abschnitte über dem PDF-Kasten, nie leere Abschnitte oder Punkte).
  // bn = { wichtigste: [{ begriff, text, seite, bis }], zu_tun: [{ text, frist, seite, bis }], fragen: [{ text, seite, bis }] },
  // pdfName = Dateiname der PDF
  // → neuer Text oder null, wenn sich nichts ändert
  const PLATZHALTER = /^\s*(?:[-*]\s*(?:\[ \]\s*)?)?$/;
  const begleitnotizErgaenzen = (text, bn, pdfName) => {
    const zeilen = String(text == null ? "" : text).replace(/\r\n/g, "\n").split("\n");
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
    const fehlend = (a, neu) => neu.filter((z) => { const t = z.replace(/^- (?:\[ \] )?/, "").toLowerCase(); return !inhalt(a).some((x) => x.toLowerCase().indexOf(t) >= 0); });
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
    const W = (bn.wichtigste || []).map((p) => `- ${p.begriff ? `**${p.begriff}:** ` : ""}${p.text}${seiten(p)}`);
    const T = (bn.zu_tun || []).map((p) => `- [ ] ${p.text}${p.frist ? ` (bis ${tt(p.frist)})` : ""}${seiten(p)}`);
    const F = (bn.fragen || []).map((p) => `- [ ] ${p.text}${seiten(p)}`);
    const regeln = [["Das Wichtigste", W, [], ["Zu tun", "Offene Fragen"], "nur-leer"], ["Zu tun", T, ["Das Wichtigste"], ["Offene Fragen"], "ergaenzen"],
      ["Offene Fragen", F, ["Das Wichtigste", "Zu tun"], [], "ergaenzen"]];
    for (const [name, neu, nach, vor, art] of regeln) {
      if (!neu.length) continue;
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

  // To-dos, die nach Zugangsdaten aussehen, gehen nie an den Server (dieselbe Regel prüft server/dienst.mjs noch einmal)
  const GEHEIM = /passw|kennw|password|\bpw\b|zugangscode|\bpin\b/i;
  const hash32 = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); };
  // Steuer- und unsichtbare Richtungszeichen → Leerzeichen; dann Leerraum zusammenfassen, kürzen
  const unsichtbar = (c) => c < 32 || c === 127 || (c >= 0x200b && c <= 0x200f) || (c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069) || c === 0xfeff;
  const reinerText = (v, max) => {
    if (typeof v !== "string") return "";
    let s = "";
    for (let i = 0; i < v.length; i++) s += unsichtbar(v.charCodeAt(i)) ? " " : v.charAt(i);
    return s.replace(/\s+/g, " ").trim().slice(0, max);
  };

  // ---------- Adresse ----------
  // Nur https://<host> ohne Pfad, Port, Anmeldung oder Parameter; lokal (Tests) auch http://127.0.0.1:<port>. → Ursprung oder ""
  const adresseNormal = (s, lokal) => {
    let u;
    try { u = new URL(String(s || "")); } catch (e) { return ""; }
    const lokalOk = !!lokal && u.protocol === "http:" && (u.hostname === "127.0.0.1" || u.hostname === "localhost");
    if ((u.protocol !== "https:" && !lokalOk) || u.username || u.password || (u.port && !lokalOk) || u.pathname !== "/" || u.search || u.hash) return "";
    return u.protocol + "//" + u.host;
  };
  const hostVon = (adresse) => String(adresse || "").replace(/^https?:\/\//, "");

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
  //   netz({ url, method, headers, body }) → { status, text } (wirft ohne Netz),
  //   geheim: { lesen(id) → Text | null, schreiben(id, w), loeschen(id) }, geheimId(),
  //   lokal(k, v?), jetzt() → Date, geraetId(), zentral() → ctx.zentral, stand() → { module, studienbeginn, variante },
  //   modulLink(code) → "[[…]]" | "", bestaetigen(titel, text, ja) → Promise<boolean>, sperre (ctx.user.sperre),
  //   quellen (ctx.user.quellen), standText(status) → { text, symbol } (ctx.verbindungen.standText), mobil, lokalErlaubt,
  //   tresor() → Promise<{ termine: [{ titel, datum, bis, kategorie, code, herkunft, erledigt }], todos: [{ text, code, frist }] }>,
  //   unterlagen() → Promise<[{ datei (PDF), kennung (SHA-256), art, titel, code, seiten, text, angefordert?, pdf?, nur_termine? }]>
  //   (ohne Zusammenfassung), pdf(datei) → Promise<Uint8Array | null> (die PDF selbst, für pdf: true) }
  //   io.begleitnotiz(pdfPfad) → Pfad der Notiz neben der PDF oder ""
  const erzeugen = (abh) => {
    const io = abh.io;
    const lokal = abh.lokal;
    const Q = abh.quellen;
    const jetztMs = () => abh.jetzt().getTime();
    const alterMs = (iso) => { const t = Date.parse(iso || ""); return isNaN(t) ? Infinity : jetztMs() - t; };
    let laeuft = false;
    const heute = () => { const d = abh.jetzt(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
    // gemeinsame Abrufer-Sperre (sperre.js): nur ein Gerät übernimmt
    const sperre = () => abh.sperre.erzeugen({ io: { lesen: io.lesenText, schreiben: io.schreibenText }, quelle: "server",
      geraetId: abh.geraetId, jetzt: abh.jetzt, mobil: !!abh.mobil });

    const verbindung = () => {
      let v = null;
      try { v = JSON.parse(abh.geheim.lesen(abh.geheimId()) || "null"); } catch (e) { v = null; }
      if (!v || typeof v !== "object" || !adresseNormal(v.adresse, abh.lokalErlaubt) || !SCHLUESSEL.test(String(v.zugang)) || !SCHLUESSEL.test(String(v.schluessel))) return null;
      return { adresse: adresseNormal(v.adresse, abh.lokalErlaubt), zugang: v.zugang, schluessel: v.schluessel };
    };

    // ----- server.json -----
    // Die Zeile fragt synchron: Hinweise aus dem letzten Lesen oder Schreiben von server.json
    let hinweisListe = [];
    const zustandLeer = () => ({ schema: 1, erledigt: {}, laeufe: [], hinweise: [], gesendet: {}, nachsenden: {}, begleitet: {} });
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
        const ges = objekt(o.gesendet), nach = objekt(o.nachsenden), beg = objekt(o.begleitet);
        for (const k of Object.keys(ges).slice(-2000)) if (/^[0-9a-f]{64}$/.test(k)) z.gesendet[k] = String(ges[k]).slice(0, 16);
        for (const k of Object.keys(nach).slice(-200)) if (/^[0-9a-f]{64}$/.test(k)) z.nachsenden[k] = String(nach[k]).slice(0, 16);
        for (const k of Object.keys(beg).slice(-2000)) if (/^Unterlagen\//.test(k) && k.length <= 240) z.begleitet[k] = String(beg[k]).slice(0, 20);
      }
      hinweisListe = z.hinweise;
      return { z, text };
    };
    const zustandText = (z) => JSON.stringify({ schema: z.schema, erledigt: z.erledigt, laeufe: z.laeufe, hinweise: z.hinweise, gesendet: z.gesendet,
      nachsenden: z.nachsenden, begleitet: z.begleitet }, null, 1) + "\n";
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

    // ----- öffentlicher Status -----
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
      fehler: (Array.isArray(o.fehler) ? o.fehler : []).filter((f) => typeof f === "string" && /^[a-z0-9-]{1,40}$/.test(f)).slice(0, 10),
    });
    const statusHolen = async (v, erzwingen) => {
      const alt = objekt(lokal(L.status));
      if (!erzwingen && alt.geholt && alterMs(alt.geholt) < STATUS_ALTER) return alt;
      let werte = null;
      try {
        const r = await abh.netz({ url: v.adresse + "/v1/status", method: "GET" });
        const o = r.status === 200 ? JSON.parse(r.text) : null;
        if (o && o.schema === 1) werte = statusNormal(o);
      } catch (e) { werte = null; }
      const jetzt = abh.jetzt().toISOString();
      const s = { geholt: jetzt, erreichbar: !!werte, werte: werte || alt.werte || null, erreicht: werte ? jetzt : String(alt.erreicht || "") };
      lokal(L.status, s);
      return s;
    };

    // ----- Verbinden und Trennen -----
    const verbinden = async (adresseRoh, codeRoh) => {
      const adresse = adresseNormal(adresseRoh, abh.lokalErlaubt);
      const code = String(codeRoh || "").trim().toUpperCase();
      if (!adresse || !CODE.test(code)) return { ok: false, fehler: "Der Link ist unvollständig. Bitte in der Cloud Shell von Oracle einen neuen erzeugen: bash ~/studium-autopilot/server/fern.sh verbinden" };
      const bisher = verbindung();
      const ersetzt = bisher && bisher.adresse !== adresse ? ` Die Verbindung zu ${hostVon(bisher.adresse)} wird dabei ersetzt.` : "";
      const ja = await abh.bestaetigen("Mit deinem Server verbinden?",
        `Studium Autopilot holt dann Termine und Hinweise von ${hostVon(adresse)}.${ersetzt} Nur bestätigen, wenn du diesen Link gerade selbst auf deinem eigenen Server erzeugt hast.`, "Verbinden");
      if (!ja) return { ok: false, abgebrochen: true };
      let r;
      try { r = await abh.netz({ url: adresse + "/v1/verbinden", method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code }) }); }
      catch (e) { return { ok: false, fehler: "Dein Server ist nicht erreichbar. Läuft er, und stimmt die Adresse im Link?" }; }
      if (r.status === 403) return { ok: false, fehler: "Der Code gilt nicht mehr (einmal verwendbar, 30 Minuten). Bitte auf deinem Server einen neuen erzeugen." };
      if (r.status === 429) return { ok: false, fehler: "Zu viele Versuche. Bitte in 10 Minuten noch einmal." };
      let d = null;
      try { d = r.status === 200 ? JSON.parse(r.text) : null; } catch (e) { d = null; }
      if (!d || adresseNormal(d.adresse, abh.lokalErlaubt) !== adresse || !SCHLUESSEL.test(String(d.zugang)) || !SCHLUESSEL.test(String(d.schluessel))) {
        return { ok: false, fehler: "Die Antwort deines Servers passt nicht zum Link. Nichts gespeichert." };
      }
      try { await abh.geheim.schreiben(abh.geheimId(), JSON.stringify({ adresse, zugang: d.zugang, schluessel: d.schluessel })); }
      catch (e) { return { ok: false, fehler: "Der Schlüsselbund von Obsidian fehlt auf diesem Gerät (ab Obsidian 1.11.4). Bitte Obsidian aktualisieren." }; }
      for (const k of Object.keys(L)) lokal(L[k], null);
      return { ok: true };
    };
    const trennen = async () => {
      try { await sperre().freigeben(); } catch (e) { /* keine Sperre */ }
      try { await abh.geheim.loeschen(abh.geheimId()); } catch (e) { /* schon weg */ }
      for (const k of Object.keys(L)) lokal(L[k], null);
    };

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
      return art;
    };

    // → true, wenn die Datei ganz übernommen ist; false bei erreichter Grenze (dann wird sie beim nächsten Abruf weiter übernommen,
    // Hinweise und Lauf erst dann, damit nichts doppelt erscheint)
    const dateiAnwenden = async (name, inhalt, z, b, notizen) => {
      const zeit = isoOk(inhalt.erstellt) ? new Date(inhalt.erstellt).toISOString() : abh.jetzt().toISOString();
      const lauf = { datei: name, zeit, termine: 0, hinweise: 0, begleitnotizen: 0, doppelt: 0, todos: 0, verworfen: 0 };
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
        if (z.hinweise.some((x) => x.text === text)) continue; // schon da (ein älterer Server sortiert Wiederholungen nicht aus)
        z.hinweise.push(quelle ? { text, quelle, zeit } : { text, zeit });
        lauf.hinweise++; b.hinweise++;
      }
      z.hinweise = z.hinweise.slice(-HINWEISE);
      for (const bn of (Array.isArray(inhalt.begleitnotizen) ? inhalt.begleitnotizen : []).slice(0, 50)) {
        if (await begleitnotizAnwenden(bn, z, b)) lauf.begleitnotizen++;
      }
      lauf.todos = await todoDoppelAnwenden((Array.isArray(inhalt.todo_doppel) ? inhalt.todo_doppel : []).slice(0, 50), b);
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
      const gueltig = paare.filter((p) => p && TODO_ID.test(String(p.behalten)) && TODO_ID.test(String(p.weg)) && p.behalten !== p.weg);
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
        zeilen[w.nr] = m[1] + m[2] + ` – steht schon in [[${ziel}|${ziel.slice(ziel.lastIndexOf("/") + 1)}]]` + (zeilen[w.nr].endsWith("\r") ? "\r" : "");
        await io.schreibenText(w.pfad, zeilen.join("\n"));
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
              const r = await abh.netz({ url: v.adresse + "/v1/pdf", method: "POST", headers: { authorization: "Bearer " + v.zugang, "content-type": "application/json" },
                body: JSON.stringify(await verschluesselnRoh(v.schluessel, "pdf", klar)) });
              if (r.status !== 200) break;
            }
          }
          const paket = await verschluesseln(v.schluessel, "unterlagen", { schema: 1, unterlagen: teil.map((u) => { const x = Object.assign({}, u); delete x.angefordert; delete x.pdf; return x; }) });
          const r = await abh.netz({ url: v.adresse + "/v1/unterlagen", method: "POST", headers: { authorization: "Bearer " + v.zugang, "content-type": "application/json" }, body: JSON.stringify(paket) });
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

    // Auszug aus dem Tresor (tresor.json für Claude auf dem Server): nur diese Felder, Grenzen wie der Dienst (400 Termine,
    // 200 To-dos), nichts mit Zugangsdaten
    const tresorKurz = (t) => ({
      termine: (Array.isArray(t.termine) ? t.termine : []).filter((e) => e && s10(e.datum)).slice(0, 400).map((e) => ({
        titel: reinerText(String(e.titel || ""), 120), datum: s10(e.datum), bis: s10(e.bis), kategorie: reinerText(String(e.kategorie || ""), 20),
        code: reinerText(String(e.code || ""), 8), herkunft: reinerText(String(e.herkunft || ""), 30), erledigt: e.erledigt === true })),
      todos: (Array.isArray(t.todos) ? t.todos : []).map((e) => Object.assign({ text: reinerText(String((e && e.text) || ""), 200), code: reinerText(String((e && e.code) || ""), 8),
        frist: s10(e && e.frist) }, e && TODO_ID.test(String(e.id)) ? { id: e.id } : {}, e && typeof e.pfad === "string" && e.pfad.length <= 240 ? { pfad: e.pfad } : {},
        e && e.aenderbar === true ? { aenderbar: true } : {})).filter((e) => e.text && !GEHEIM.test(e.text)).slice(0, 200),
    });
    // Stand ans Server-Gerät: übernommene Dateien sofort, sonst nur bei Änderung oder nach STAND_ALTER
    const standSenden = async (v, quittung) => {
      let s, t;
      try { s = abh.stand() || {}; } catch (e) { s = {}; }
      try { t = abh.tresor ? objekt(await abh.tresor()) : {}; } catch (e) { t = {}; }
      const stand = { schema: 1, module: (Array.isArray(s.module) ? s.module : []).slice(0, 80), studienbeginn: String(s.studienbeginn || "").slice(0, 20), variante: String(s.variante || "").slice(0, 40),
        takt: taktAus({ server_uni_postfach: objekt(s.takt).uni_postfach, server_gmail: objekt(s.takt).gmail }), tresor: tresorKurz(t) };
      const kennung = hash32(JSON.stringify(stand));
      const g = objekt(lokal(L.gesendet));
      if (!quittung.length && g.kennung === kennung && alterMs(g.zeit) < STAND_ALTER) return true;
      try {
        const paket = await verschluesseln(v.schluessel, "stand", Object.assign({}, stand, { erledigt: quittung.slice(0, 500) }));
        const r = await abh.netz({ url: v.adresse + "/v1/stand", method: "POST", headers: { authorization: "Bearer " + v.zugang, "content-type": "application/json" }, body: JSON.stringify(paket) });
        if (r.status !== 204 && r.status !== 200) return false;
      } catch (e) { return false; }
      lokal(L.gesendet, { kennung, zeit: abh.jetzt().toISOString() });
      return true;
    };

    // Mails durchsuchen: Claude-Lauf auf dem Server anstoßen. → { ok: true } | { fehler: nicht-verbunden | zu-frueh (mit wieder) |
    //   zugang | netz }
    const anstossen = async () => {
      const v = verbindung();
      if (!v) return { fehler: "nicht-verbunden" };
      let r;
      try { r = await abh.netz({ url: v.adresse + "/v1/anstoss", method: "POST", headers: { authorization: "Bearer " + v.zugang } }); }
      catch (e) { return { fehler: "netz" }; }
      if (r.status === 401) return { fehler: "zugang" };
      if (r.status === 429) {
        let wieder = "";
        try { wieder = String(JSON.parse(r.text).wieder || ""); } catch (e) { wieder = ""; }
        return isoOk(wieder) ? { fehler: "zu-frueh", wieder } : { fehler: "zu-frueh" };
      }
      if (r.status !== 200) return { fehler: "netz" };
      await statusHolen(v, true);
      return { ok: true };
    };

    // → Bericht { art: ok | nicht-verbunden | laeuft | anderes-geraet | fehler, fehler (netz | zugang | gesperrt | paket | intern),
    //   angelegt, aktualisiert, umbenannt, entfaellt, doppelt, zusammengefuehrt, ausgeblendet, hinweise, begleitnotizen (Pfade),
    //   unterlagen (an den Server geschickt), verworfen, dateien,
    //   neuereVersion, serverAelter (nahm Lab nicht an), mehr (Grenze erreicht, Rest beim nächsten Abruf) }; o: { manuell, uebernehmen (Knopf „Hier aktualisieren“) }
    const abrufen = async (o) => {
      o = o || {};
      const v = verbindung();
      if (!v) return { art: "nicht-verbunden" };
      if (laeuft) return { art: "laeuft" };
      laeuft = true;
      const b = { art: "ok", fehler: "", angelegt: [], aktualisiert: [], umbenannt: [], entfaellt: [], doppelt: [], zusammengefuehrt: [], ausgeblendet: 0, hinweise: 0,
        begleitnotizen: [], todoDoppel: [], unterlagen: 0, verworfen: [], dateien: 0, neuereVersion: false, serverAelter: false, mehr: false };
      // gerätelokaler Stand nach dem Quellen-Vertrag (nachLauf): ein Fehler bleibt stehen, bis ein Lauf klappt
      const ende = (fehler) => {
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
        neu.anderes = "";
        neu.bericht = fehler ? alt.bericht || null : { neu: b.angelegt.length, geaendert: b.aktualisiert.length + b.entfaellt.length, hinweise: b.hinweise };
        lokal(L.abruf, neu);
        return b;
      };
      try {
        await statusHolen(v, !!o.manuell);
        if (!(await sperre().nehmen({ erzwingen: !!o.uebernehmen }))) {
          b.art = "anderes-geraet";
          lokal(L.abruf, Object.assign(Q.nachLauf(objekt(lokal(L.abruf)), { ok: null }, abh.jetzt().toISOString()), { anderes: abh.jetzt().toISOString() }));
          return b;
        }
        const { z, text } = await zustandLesen();
        z.angewendet = await angewendetLesen();
        let r;
        try { r = await abh.netz({ url: v.adresse + "/v1/eingang", method: "GET", headers: { authorization: "Bearer " + v.zugang } }); }
        catch (e) { return ende("netz"); }
        if (r.status === 401) return ende("zugang");
        if (r.status === 429) return ende("gesperrt");
        if (r.status !== 200) return ende("netz");
        let buendel;
        try { buendel = await entschluesseln(v.schluessel, "eingang", JSON.parse(r.text)); } catch (e) { return ende("paket"); }
        if (!buendel || buendel.schema !== 1 || !Array.isArray(buendel.dateien)) return ende("paket");
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
        await standSenden(v, quittung);
        return ende("");
      } catch (e) {
        console.error("server: Abruf", e);
        return ende("intern");
      } finally { laeuft = false; }
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
    const status = () => {
      const v = verbindung(), st = objekt(lokal(L.status)), ab = objekt(lokal(L.abruf));
      const zustand = !v ? (sichtbar() ? "anderswo" : "nicht-verbunden") : laeuft ? "laeuft" : ab.anderes ? "anderes-geraet" : ab.code ? "fehler" : "an";
      return Q.statusForm({
        zustand, geprueft: ab.geprueft, fehler: ab.fehler, fehlerZeit: ab.fehlerZeit, warnungen: ab.warnungen,
        verbunden: !!v, host: v ? hostVon(v.adresse) : "", laeuft, werte: st.werte || null, erreichbar: st.erreichbar !== false,
        erreicht: String(st.erreicht || ""), fehlerSeit: String(ab.fehlerSeit || ""), fehlerSerie: Number(ab.fehlerSerie) || 0,
        code: String(ab.code || ""), bericht: ab.bericht || null, anderes: !!ab.anderes,
      });
    };
    const vor = (iso) => Q.vorText(iso, jetztMs());
    // Zeile unter Verbindungen im Format der Quellen (verbindungen.js, quelleZeile): { text, symbol, pille: an | pruefen | "",
    //   knopf: { aktion, text, cta, parameter } | null, link: { aktion, text, parameter } | null }
    const MEHR = { aktion: "verbinden", text: "Mehr erfahren", parameter: { id: "server" } };
    const HINWEISE_ANSEHEN = { aktion: "verbinden", text: "Hinweise ansehen", parameter: { id: "server" } };
    const AKTUALISIEREN = { aktion: "verbindung-aktualisieren", text: "Aktualisieren", cta: true, parameter: { id: "server" } };
    // Den Stand sagt die Zeile in den Worten aller Quellen (standText: „Aktualisiert vor 5 Min.“, Fehler mit „Zuletzt aktualisiert …“,
    // Warnungen dahinter, ein anderes Gerät); dazu, was nur dieser Server hat (Zustand auf dem Server, letzter Lauf, neue Termine)
    const zeile = () => {
      const s = status(), w = s.werte || {};
      const stand = abh.standText(s);
      switch (s.zustand) {
        case "nicht-verbunden": return { text: "Für Technische: Claude sucht auf einem eigenen, kostenlosen Server in deinen Uni-Mails nach Terminen.", symbol: "extern", pille: "", knopf: { aktion: "verbinden", text: "Mehr erfahren", parameter: { id: "server" } }, link: null };
        case "anderswo": return { text: "Auf einem anderen Gerät verbunden. Neue Termine kommen über deinen Sync.", symbol: "haken", pille: "", knopf: null, link: neueHinweise() ? HINWEISE_ANSEHEN : MEHR };
        case "laeuft": return { text: stand.text, symbol: stand.symbol, pille: "an", knopf: null, link: MEHR };
        case "anderes-geraet": return { text: stand.text, symbol: stand.symbol, pille: "an",
          knopf: { aktion: "verbindung-aktualisieren", text: "Hier aktualisieren", cta: true, parameter: { id: "server", uebernehmen: "1" } }, link: MEHR };
        case "fehler":
          if (s.code === "zugang" || s.code === "paket") return { text: s.fehler, symbol: "warnung", pille: "pruefen", knopf: null, link: MEHR };
          // tagelang nicht erreichbar löst sich kaum von selbst (Server gelöscht oder neu angelegt, neue IP): mindestens zwei
          // Fehlschläge in Folge, der erste vor mehr als UNERREICHBAR_TAGE
          if (s.code === "netz" && s.fehlerSerie >= 2 && s.fehlerSeit && alterMs(s.fehlerSeit) > UNERREICHBAR_TAGE * 1440 * MIN) {
            return { text: `Dein Server ist seit mehr als ${UNERREICHBAR_TAGE} Tagen nicht erreichbar. Sag in Claude Desktop „Weiter mit der Einrichtung“; hat er eine neue Adresse, verbindest du ihn danach neu.`,
              symbol: "warnung", pille: "pruefen", knopf: AKTUALISIEREN, link: MEHR };
          }
          return { text: stand.text, symbol: stand.symbol, pille: "an", knopf: AKTUALISIEREN, link: MEHR };
        default: break;
      }
      if (w.claude === "abgemeldet") return { text: "Claude ist auf deinem Server nicht mehr verbunden. Sag in Claude Desktop „Weiter mit der Einrichtung“, dann verbindest du es neu.", symbol: "warnung", pille: "pruefen", knopf: AKTUALISIEREN, link: MEHR };
      if (w.uniZugang === "falsch") return { text: "Die Uni nimmt das Passwort auf deinem Server nicht an. Sag in Claude Desktop „Weiter mit der Einrichtung“, dann gibst du es neu ein.", symbol: "warnung", pille: "pruefen", knopf: AKTUALISIEREN, link: MEHR };
      if (w.claudeLauf === "wartet" || w.claudeLauf === "laeuft") return { text: "Claude durchsucht gerade deine Mails auf deinem Server …", symbol: "uhr", pille: "an", knopf: AKTUALISIEREN, link: MEHR };
      if (w.fehler && w.fehler.indexOf("claude-limit") >= 0) return { text: "Claude hat gerade sein Limit erreicht. Der nächste Lauf versucht es von selbst.", symbol: "uhr", pille: "an", knopf: AKTUALISIEREN, link: MEHR };
      const n = s.bericht ? s.bericht.neu + s.bericht.geaendert : 0;
      const teile = [stand.text];
      if (w.letzterLauf) teile.push(`Letzter Lauf des Servers ${vor(w.letzterLauf.zeit)}.`.replace(/\.\.$/, ".")); // „vor 5 Min.“ hat schon den Punkt
      if (n) teile.push(`${n} ${n === 1 ? "Termin" : "Termine"} neu oder geändert.`);
      return { text: teile.join(" "), symbol: stand.symbol, pille: "an", knopf: AKTUALISIEREN, link: neueHinweise() ? HINWEISE_ANSEHEN : MEHR };
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
    // Stand für das Fenster: [[Bezeichnung, Wert]] (nur feste Texte), Hinweise (neueste zuerst), letzte Übernahmen
    const WERTE = {
      claude: { angemeldet: "verbunden", abgemeldet: "nicht verbunden, bitte neu verbinden" },
      gmail: { ok: "wird durchsucht", fehlt: "nicht verbunden", aus: "aus (in den Einstellungen „nie“)" },
      uniZugang: { gespeichert: "eingerichtet", fehlt: "nicht eingerichtet", falsch: "Passwort nicht angenommen" },
    };
    const einzelheiten = async () => {
      const s = status(), w = s.werte || {};
      const liste = [];
      if (s.verbunden) liste.push(["Adresse", s.host]);
      if (s.werte) {
        // nicht erreichbar: die Werte unten sind die von damals
        if (!s.erreichbar) liste.push(["Stand des Servers", "nicht erreichbar" + (s.erreicht ? ", Angaben von " + uhrzeit(s.erreicht) : "")]);
        liste.push(["Claude", WERTE.claude[w.claude] || "unbekannt"], ["Gmail", WERTE.gmail[w.gmail] || "unbekannt"], ["Uni-Postfach", WERTE.uniZugang[w.uniZugang] || "unbekannt"]);
        if (w.letzterLauf) liste.push(["Letzter Lauf", uhrzeit(w.letzterLauf.zeit) + (w.letzterLauf.ok ? "" : " (ohne Ergebnis)")]);
      }
      if (s.geprueft) liste.push(["Zuletzt aktualisiert", uhrzeit(s.geprueft)]);
      const { z } = await zustandLesen();
      return { liste, hinweise: z.hinweise.slice().reverse().slice(0, 10), laeufe: z.laeufe.slice().reverse().slice(0, 5).map((l) => Object.assign({}, l, { wann: uhrzeit(l.zeit) })) };
    };

    return {
      verbinden, trennen, abrufen, anstossen, status, zeile, einzelheiten, sichtbar, neueHinweise, hinweiseGesehen, hinweiseLaden,
      verbunden: () => !!verbindung(),
      get laeuft() { return laeuft; },
    };
  };

  // ---------- Anschluss an Obsidian ----------
  const plugin = () => ctx.plugin || {};
  const lokalObs = (k, v) => {
    if (v === undefined) { try { return app.loadLocalStorage(k) || null; } catch (e) { return null; } }
    app.saveLocalStorage(k, v == null ? null : v);
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
  const netzObs = async (a) => {
    const kopf = a.headers || {};
    const r = await obs.requestUrl({ url: a.url, method: a.method || "GET", headers: kopf, body: a.body, contentType: kopf["content-type"], throw: false });
    return { status: r.status, text: r.text };
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
      return nfm && ARTEN_SENDEN.indexOf(nfm.art) >= 0 ? { nf, nfm, wunsch: wunschVon(nfm) } : null;
    };
    const kandidaten = [];
    for (const p of Object.keys(textVon)) {
      if (!/\.pdf$/i.test(p)) continue;
      const n = notizVon(p), k = String(textVon[p].fm.pdf_sha256);
      if (!n) continue;
      const termine = !n.wunsch && modus !== "alle" && terminsuche(n.nfm.code, zeit(p));
      if (n.wunsch ? String(ohne[k] || "") >= n.wunsch : (modus !== "alle" && !termine) || ohne[k]) continue;
      kandidaten.push(Object.assign({ p, zeit: zeit(p), termine }, n));
    }
    kandidaten.sort((a, b) => (b.wunsch ? 1 : 0) - (a.wunsch ? 1 : 0) || b.zeit - a.zeit || (a.p < b.p ? -1 : 1));
    for (const { p: pdfPfad, nf, nfm, wunsch, termine } of kandidaten) {
      if (aus.length >= hoechstens) break;
      // „Das Wichtigste“ steht schon: keine Zusammenfassung (Termine sucht der Server trotzdem)
      if (!termine && begleitnotizErgaenzen(await app.vault.cachedRead(nf), { wichtigste: [{ text: "x" }] }, "x.pdf") == null) continue;
      const t = textVon[pdfPfad];
      aus.push({ datei: pdfPfad, kennung: String(t.fm.pdf_sha256), art: nfm.art, titel: String(nfm.titel || nf.basename), code: String(nfm.code || ""),
        seiten: Number(t.fm.seiten) || 0, ...(wunsch ? { angefordert: wunsch, pdf: nfm[WUNSCH_PDF] === true && groesse(pdfPfad) <= PDF_MAX } : termine ? { nur_termine: true } : {}),
        text: volltextText(await app.vault.cachedRead(t.f)) });
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
  const obsidianAbh = () => ({
    io: obsidianIo(), netz: netzObs, geheim: geheimObs, geheimId, lokal: lokalObs,
    jetzt: () => new Date(),
    geraetId: () => ctx.zentral.geraetId(),
    zentral: () => ctx.zentral,
    // was zählt: Module in deinem Plan bzw. laut Musterplan jetzt oder im nächsten Fachsemester (wie die zentralen Termine)
    stand: () => {
      const D = ctx.modell.daten();
      return { module: Object.keys(ctx.zentral.filterBauen().codes).sort(), studienbeginn: D.studienbeginn || "", variante: D.variante || "", takt: taktAus(einstellungenFm()) };
    },
    modulLink: (code) => { const e = eba(), m = e && code && e.modulNachCode(code); return m ? `[[${m.f.basename}]]` : ""; },
    bestaetigen: bestaetigenObs,
    sperre: ctx.user.sperre,
    quellen: ctx.user.quellen,
    standText: (s) => ctx.verbindungen.standText(s), // nur die Zeile unter Verbindungen fragt danach, also ist verbindungen.js geladen
    tresor: tresorObs,
    unterlagen: unterlagenObs,
    pdf: async (p) => { const f = app.vault.getAbstractFileByPath(p); return f && !f.children ? new Uint8Array(await app.vault.readBinary(f)) : null; },
    mobil: !!(obs.Platform && obs.Platform.isMobile),
    lokalErlaubt: !!plugin().testServerLokal,
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
      if (b.hinweise) teile.push(zahl(b.hinweise, "Hinweis", "Hinweise"));
      if (b.todoDoppel.length) teile.push(zahl(b.todoDoppel.length, "doppeltes To-do zusammengeführt", "doppelte To-dos zusammengeführt"));
      text = teile.length ? "Neu von deinem Server: " + teile.join(", ") + "." : "Nichts Neues von deinem Server.";
      if (b.neuereVersion) text += " Für einen Teil brauchst du eine neuere Version.";
    }
    if (text) ctx.hinweis(text);
  };
  // Mails durchsuchen (Knopf im Fenster, Befehl): Lauf auf dem Server anstoßen, Ergebnis nach 5 Min. abholen
  let plan = null;
  const durchsuchen = async () => {
    const r = await motor().anstossen();
    if (r.ok) {
      ctx.hinweis("Claude durchsucht jetzt deine Mails. Neue Termine kommen in ein paar Minuten.");
      if (plan) plan.spaeter(5 * MIN);
    } else if (r.fehler === "zu-frueh") {
      const d = new Date(r.wieder || "");
      ctx.hinweis("Claude hat gerade erst gesucht." + (isNaN(d.getTime()) ? " Versuch es in ein paar Minuten wieder." : ` Wieder möglich ab ${pad2(d.getHours())}:${pad2(d.getMinutes())}.`));
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
    const w = wunschVon(fm);
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
      ctx.hinweis("Kopiert. Füg den Text in Claude Desktop ein.");
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
  const fensterInhalt = async (el) => {
    const box = el.createDiv({ cls: "eba-server" });
    // Noch kein Server: nur der Knopf zum Kopieren des Prompts (Schritte und Hintergrund stehen im Fenster darüber)
    if (!motor().sichtbar()) {
      box.createDiv({ cls: "modal-button-container" }).createEl("button", { text: "Prompt kopieren", cls: "mod-cta" }).addEventListener("click", () => kopieren());
      return;
    }
    const d = await motor().einzelheiten();
    if (d.liste.length) {
      const ul = box.createEl("ul", { cls: "eba-server-stand" });
      for (const z of d.liste) { const li = ul.createEl("li"); li.createEl("b", { text: z[0] + ": " }); li.appendText(z[1]); }
    }
    if (d.hinweise.length) {
      box.createEl("h4", { text: "Hinweise von Claude" });
      const ul = box.createEl("ul", { cls: "eba-server-hinweise" });
      for (const h of d.hinweise) ul.createEl("li", { text: h.text + (h.quelle ? ` (${h.quelle})` : "") });
      if (motor().neueHinweise()) { motor().hinweiseGesehen(); neuZeichnen(); }
    }
    if (d.laeufe.length) {
      box.createEl("h4", { text: "Zuletzt übernommen" });
      const ul = box.createEl("ul", { cls: "eba-server-laeufe" });
      for (const l of d.laeufe) ul.createEl("li", { text: [l.wann, zahl(l.termine || 0, "Termin", "Termine"), zahl(l.hinweise || 0, "Hinweis", "Hinweise")].concat(l.begleitnotizen ? [zahl(l.begleitnotizen, "Begleitnotiz", "Begleitnotizen")] : []).concat(l.doppelt ? [zahl(l.doppelt, "Doppel", "Doppel") + " übersprungen"] : []).concat(l.todos ? [zahl(l.todos, "To-do", "To-dos") + " zusammengeführt"] : []).join(" · ") });
    }
    taktZeigen(box);
    const plugins = app.plugins;
    const angebot = livesyncAngebot({ verbunden: motor().verbunden(), livesync: (motor().status().werte || {}).livesync,
      hier: !!(plugins && plugins.enabledPlugins && plugins.enabledPlugins.has("obsidian-livesync")) });
    if (angebot) {
      box.createEl("p", { cls: "eba-modal-abschnitt", text: angebot.titel });
      box.createEl("p", { cls: "eba-modal-text", text: angebot.text });
      box.createDiv({ cls: "modal-button-container" }).createEl("button", { text: "Prompt kopieren", cls: "mod-cta" }).addEventListener("click", () => kopieren(LIVESYNC_PROMPT));
    }
    if (motor().verbunden()) {
      box.createDiv({ cls: "modal-button-container" }).createEl("button", { text: "Mails durchsuchen" }).addEventListener("click", () => durchsuchen());
      box.createEl("p", { cls: "eba-modal-hinweis" }).createEl("a", { text: "Dieses Gerät trennen", href: ctx.link("trennen", { id: "server" }) });
    }
  };

  // ---------- Erweiterung ----------
  const AKTIONEN = {
    // Knopf im Fenster „Eigener Server“ und Befehl: Claude-Lauf auf dem Server starten
    "server-durchsuchen": { titel: "Mails durchsuchen", ausfuehren: () => durchsuchen() },
    // Link vom Server (studium-server verbinden): adresse, code. Immer mit Rückfrage (motor().verbinden).
    "server-verbinden": {
      ausfuehren: async (c) => {
        const r = await motor().verbinden(c.parameter.adresse, c.parameter.code);
        if (r.abgebrochen) return;
        if (!r.ok) { ctx.hinweis(r.fehler); return; }
        ctx.hinweis("Mit deinem Server verbunden. Die Termine kommen gleich.");
        neuZeichnen();
        await jetztHolen();
      },
    },
  };

  // begleitnotizSauber, wunschWeg, ARTEN_SENDEN, volltexte, pdfZurNotiz und wahl braucht auch claude.js (Zusammenfassen ohne Server)
  ctx.server = {
    erzeugen, aehnlich, adresseNormal, PROMPT, LIVESYNC_PROMPT, livesyncAngebot, kopieren, begleitnotizErgaenzen, volltextText, taktAus, pdfKosten, PDF_FRAGEN,
    begleitnotizSauber, wunschWeg, ARTEN_SENDEN, volltexte, pdfZurNotiz, wahl: wahlObs,
    sichtbar: () => motor().sichtbar(), status: () => motor().status(), zeile: () => motor().zeile(), verbunden: () => motor().verbunden(),
    jetztHolen, durchsuchen, zusammenfassenStand, zusammenfassen, terminsucheAn, trennen: async () => { await motor().trennen(); neuZeichnen(); }, fensterInhalt,
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
      if (plugin().testServerAus || !ctx.zentral || !motor().verbunden()) return null;
      const r = await motor().abrufen({});
      neuZeichnen();
      return r.art === "ok" ? true : r.art === "fehler" ? false : null;
    } });
  };

  return { registrieren, aktionen: AKTIONEN };
};
