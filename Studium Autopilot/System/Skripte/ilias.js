// ILIAS-Unterlagen (seit 0.4.0): Das Plugin meldet sich bei ILIAS an (Uni Tübingen, ILIAS 10, Shibboleth), liest deine
// Kurse und legt Kursdateien (PDF, Office …) unter „Unterlagen/“ ab, jede mit Begleitnotiz wie beim Einordnen
// (unterlagen.js). Keine Videos, keine Foren, keine Tests. Doku: docs/architektur.md, „ILIAS“.
//
// Bausteine: ilias-netz.js (Sitzung, Kekse, Weiterleitungen), ilias-anmeldung.js (Anmeldung über Shibboleth),
//   ilias-html.js (Kursliste und Kursinhalt aus dem HTML lesen), unterlagen.js (Dateiname „<Code> <Art> <NN> <Titel>“,
//   Begleitnotiz), dieses Skript (Zeitplan, Abrufer-Sperre, Durchsuchen, Ablage, Index). Dieses Skript schickt selbst nie
//   Zugangsdaten; es reicht nur die Funktion kennwortGeber an die Anmeldung weiter (Anschluss unten, quelleAusNetz).
// Zugang: Benutzername gerätelokal (eba-ilias-benutzer), das Kennwort nur im Schlüsselbund von Obsidian
//   (app.secretStorage; gerätelokal, verschlüsselt, nie synchronisiert, nie im Tresor). Der Eintrag heißt je Tresor anders
//   (geheimId), weil iOS den Schlüsselbund zwischen Tresoren teilt. Das Kennwort steht nie in Status, Protokoll, Bericht,
//   Fehlertexten oder Konsole (Fehlertexte werden zusätzlich davon gereinigt).
// Index (System/Daten/ilias.json, synchronisiert): welche ILIAS-Datei wo im Tresor liegt, damit kein Gerät doppelt lädt.
//   { version: 1, kurse: { <refId>: { titel, code, aktiv, zuletzt, t } }, dateien: { <ILIAS-id>: { pfad, sha256, groesse,
//   geaendert, iliasGroesse, original, iliasPfad, kurs, seit, wie, aktualisiert?, geloescht?, fassungen?, t } },
//   ignoriert: { <ILIAS-id>: { grund, groesse, geaendert, iliasGroesse, original, t } }, gruppen: { <ref_id der Gruppe>:
//   { code, kurs, tag, beginn, ende, raum, mitglied, status, zentral, kandidaten, t } } }. Kurstitel und ILIAS-Pfade nur ohne
//   Kurspasswort (ohneKennwort; alte Einträge werden beim Lesen gesäubert). Von Gruppen nie Titel oder Beschreibung (dort
//   stehen Namen), nur Code, Zeitfenster und Raumnummer. Jeder Eintrag trägt „t“ (letzte
//   Änderung). Vor jedem Schreiben wird mit dem Stand auf der Platte gemischt (je Eintrag gewinnt der neuere), so
//   überstehen Änderungen anderer Geräte (Kurswahl, Umbenennen) einen laufenden Abruf. Einträge werden nie gelöscht.
// Abrufer-Sperre (System/Daten/ilias-abruf.json, synchronisiert): nur ein Gerät lädt, Regeln wie zentral.js (UEBERNAHME,
//   PULS). Nur Geräte mit gespeichertem Zugang nehmen teil.
// Ein Lauf: Sperre → Index lesen, Umbenennungen und Löschungen nachziehen → anmelden → Kursliste → aktive Kurse
//   durchsuchen (Ordner, Sitzungen, Gruppen; eine Anfrage nach der anderen, ABSTAND_MS dazwischen, höchstens ANFRAGEN je
//   Lauf) → geänderte, dann neue Dateien laden (neueste zuerst, höchstens NEU_MOBIL bzw. NEU_PC je Lauf). Der Index wird
//   nach jedem Schritt geschrieben; ein Fehler beendet den Lauf sauber, der nächste macht weiter. Abgelaufene Sitzung:
//   einmal neu anmelden, dann für diesen Lauf aufgeben. Was das Durchsuchen findet, merkt sich das Gerät nach jedem Kurs
//   (Funde); ein abgebrochener Lauf (iPhone/iPad halten Obsidian im Hintergrund an) fängt so nicht von vorn an.
// Neue Datei: SHA-256 → gleiche Datei schon unter Unterlagen/ (erst Größe, dann Prüfsumme)? Dann nur merken. Sonst Name über
//   den Einordner, Ordner wie unterlagen.js, freier Name (nie überschreiben, sonst „ (2)“), Datei + Begleitnotiz
//   (typ: unterlage, original, quelle „ILIAS: Kurs / Ordner“, ilias_id).
// Geänderte Datei auf ILIAS: Datei im Tresor unverändert → ersetzen, die Notiz bekommt „aktualisiert“. Von dir verändert
//   (Anmerkungen!) → deine bleibt, die neue kommt daneben als „<Name> neue Fassung JJJJ-MM-TT.<endung>“ mit eigener Notiz.
// Gelöscht bleibt gelöscht: Eine Datei, die du gelöscht hast, kommt nie wieder, auch nicht in neuer Fassung.
// Übungs- und Tutoriengruppen (seit 17.10.2026): Die Seite „Meine Kurse und Gruppen“ (dieselbe Anfrage wie die Kursliste) nennt
//   die Gruppen, in denen du Mitglied bist. Je Gruppe: Modulcode aus dem durchsuchten Kurs bzw. den Brotkrumen der Gruppenseite,
//   Zeitfenster aus Titel und Beschreibung, Zuordnung zu gruppen.json und eine Notiz in Stundenplan/ (meine-gruppe.js,
//   herkunft: ilias-gruppe). Nur das Gerät mit der Abrufer-Sperre schreibt; ein Fehler dabei hält die Unterlagen nicht an.
// Eigener Uni-Abgleich (eba.eigenerAbgleich): Liegt System/Skripte/abgleich.js im Tresor oder steht „ilias_unterlagen: extern“
//   in den Einstellungen, lädt dieses Skript nichts (Status „über deinen Uni-Abgleich“).
// Für andere Skripte: ctx.ilias (siehe unten, api). Testeinstiege: plugin.testIliasAus (kein automatischer Lauf);
//   ctx.ilias.erzeugen(abh) baut den ganzen Ablauf mit falschem ILIAS und Tresor im Speicher (tests/ilias.test.js);
//   in Obsidian ersetzen ctx.ilias.anmeldungSetzen(fn) und ctx.ilias.quelleSetzen(fn) Anmeldung bzw. ILIAS (Oberfläche
//   testen ohne Passwort und ohne Netz; null = wieder echt).
// Gerätelokal (app.saveLocalStorage): eba-ilias-benutzer, eba-ilias-stand, eba-ilias-protokoll (letzte 20 Läufe), eba-geraet,
//   eba-ilias-auftrag (offener Abruf, den du gestartet hast: geht nach Fehler, Stapelgrenze, Neustart oder Rückkehr in die App
//   von selbst weiter, siehe naechsterSchritt), eba-ilias-schreibt (Datei, die gerade geschrieben wird; siehe nachAbbruch),
//   eba-ilias-funde (gefundene Dateien, die noch nicht geladen sind; siehe fundAus).
// Fortschritt: ein Hinweis mit Balken (fortschrittHinweis) für Läufe, die du gestartet hast; automatische bleiben still.
// iOS-sicher: keine Node-APIs, kein Lookbehind, kein .at()/findLast/structuredClone. Web Crypto für SHA-256.
module.exports = function (ctx) {
  const app = window.app;
  const obs = ctx.obsidian || {};

  // ---------- Konstanten ----------
  const INDEX = "System/Daten/ilias.json";
  const ABRUF = "System/Daten/ilias-abruf.json";
  const EINSTELLUNGEN = "System/Einstellungen.md";
  const ZIEL = "Unterlagen";
  const MIN = 60e3, STUNDE = 60 * MIN;
  const UEBERNAHME = 80 * MIN;   // anderes Gerät übernimmt, wenn der Abrufer so lange still war (wie zentral.js)
  const PULS = 50 * MIN;         // Abrufer erneuert ilias-abruf.json höchstens so oft (unter UEBERNAHME)
  const NACHHOLEN = 60 * MIN;    // zurück in der App: neuer Lauf, wenn der letzte Versuch länger her ist
  const ANFRAGEN = 300;          // höchstens so viele Anfragen an ILIAS je Lauf (Anmeldung zählt als eine)
  const ABSTAND_MS = 500;        // mindestens so viel Zeit zwischen zwei Anfragen
  const NEU_MOBIL = 25, NEU_PC = 60; // höchstens so viele Downloads je Lauf (neue und geänderte Dateien)
  const MAX_MB = 50;             // größere Dateien nicht in den Tresor (Sync, Speicher auf iPhone/iPad)
  const PDF_TITEL_MAX_MB = 40;   // Titel aus der ersten PDF-Seite nur bis zu dieser Größe (Arbeitsspeicher iPhone)
  const EINBETTEN_MAX_MB = 10;   // größere PDFs in der Begleitnotiz nur verlinken (wie unterlagen.js)
  const ORDNER_TITEL_MAX = 45;   // Zeichen Modultitel im Ordnernamen (wie unterlagen.js)
  const FEHLER_MAX = 3;          // so viele einzelne Dateien dürfen je Lauf scheitern, dann endet der Lauf
  const ORDNER_FEHLER_MAX = 5;   // so viele Ordner/Sitzungen dürfen je Lauf scheitern (z. B. kein Zugriff), dann endet er
  const TIEFE_MAX = 12;          // Ordnertiefe in einem Kurs
  const KURS_ZULETZT = 24 * STUNDE; // „zuletzt“ eines Kurses im Index ohne andere Änderung höchstens so oft schreiben
  const KURS_PAUSE = 3 * STUNDE;   // automatische Läufe durchsuchen einen Kurs höchstens so oft (Knopf: immer alle)
  const GRUPPEN_SEITEN = 5;
  const KURS_WIEDER = 7 * 24 * STUNDE; // Gruppenseite ohne Kurscode: höchstens so oft neu versuchen
  const MIGRATION = 1;               // Stand der einmaligen Säuberung (eba-ilias-migration)         // höchstens so viele Gruppenseiten je Lauf (Modulcode aus den Brotkrumen, danach gemerkt)
  const SITZUNG_VORAUS_TAGE = 7;   // Sitzungen weiter in der Zukunft nicht holen (noch leer; spart je Sitzung 2–3 Anfragen)
  const PROTOKOLL_MAX = 20;
  const BEHAELTER = ["ordner", "sitzung", "gruppe"];
  const VIDEO = ["mp4", "m4v", "mov", "webm", "mkv", "avi"];
  const NIE = ["md", "base", "canvas"];     // würden in Obsidian zu Notizen oder Ansichten
  const BILDER = ["jpg", "jpeg", "png", "webp", "gif", "bmp", "avif"];
  const SPERRGRUENDE = ["zugang-falsch", "zustimmung", "zwei-faktor"]; // ohne dein Zutun keine automatischen Versuche mehr
  const WIEDER_MIN = [1, 5, 15];  // offener Auftrag nach einem Fehler (z. B. kein Netz): neuer Versuch nach so vielen Minuten
  const STAPEL_PAUSE = 45e3;      // Download-Grenze je Lauf erreicht, Dateien übrig: nächster Stapel nach dieser Pause
  const STAPEL_MAX = 10;          // höchstens so viele Stapel je Auftrag (schont ILIAS), danach nur noch stündlich
  const STILL = 2 * MIN;          // so lange ohne Regung gilt ein Lauf als tot (iPhone/iPad halten Skripte im Hintergrund an)
  const L = { benutzer: "eba-ilias-benutzer", stand: "eba-ilias-stand", protokoll: "eba-ilias-protokoll", geraet: "eba-geraet",
    auftrag: "eba-ilias-auftrag", schreibt: "eba-ilias-schreibt", funde: "eba-ilias-funde",
    migration: "eba-ilias-migration" };
  const GEHEIM_PRAEFIX = "studium-autopilot-ilias-";
  const TEXT_ANMELDUNG_FOLGT = "ILIAS-Anmeldung folgt in einer späteren Version";
  const MODULCODE = (ctx.user && ctx.user.eba && ctx.user.eba.MODULCODE) || "[A-Z]{1,4}[0-9][0-9X]{2}[A-Z]?"; // wie eba.js
  const CODE_ANFANG = new RegExp("^\\s*(" + MODULCODE + ")(?=[\\s_\\-.:,/]|$)");
  const CODE_GANZ = new RegExp("^" + MODULCODE + "$");
  // Eigener Uni-Abgleich: eine Regel für alle Skripte (eba.js); ohne eba.js keiner
  const eigenerAbgleich = (existiert, einstellungen) => { const f = ctx.user && ctx.user.eba && ctx.user.eba.eigenerAbgleich; return !!f && f(existiert, einstellungen); };

  // ---------- Kleine Helfer ----------
  const pad = (n) => String(n).padStart(2, "0");
  const J = (v) => JSON.stringify(v == null ? "" : String(v));
  const hat = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
  const nfc = (s) => { try { return String(s).normalize("NFC"); } catch (e) { return String(s); } };
  // Fremdtext aus ILIAS: ohne Steuer- und Richtungszeichen, ohne Wikilink-Klammern, eine Zeile
  // Unsichtbare Zeichen (weiches Trennzeichen, Verbinder) fallen ganz weg, damit ein getrenntes Passwort-Wort zusammenbleibt
  const textRein = (s) => nfc(s == null ? "" : s).split("\u034f").join("").replace(/[\u00ad\u180e\u2060-\u2064]/g, "")
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, " ")
    .replace(/\[\[|\]\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
  // Datei- und Ordnernamen: Windows-tauglich und linkfest (wie eba.sauber), kein Punkt/Leerzeichen/Strich an den Enden
  const sauber = (s) => textRein(s).replace(/[\\/:*?"<>|#^\[\]]/g, "-").replace(/\s+/g, " ").trim().replace(/^[.\s-]+|[.\s-]+$/g, "");
  const kuerzen = (s, max) => { if (s.length <= max) return s; const t = s.slice(0, max + 1), i = t.lastIndexOf(" "); return (i > max / 2 ? t.slice(0, i) : s.slice(0, max)).trim(); };
  // Füllwörter an den Enden weg („Mathematische Methoden der“ → „Mathematische Methoden“), wie unterlagen.js
  const FUELL = /^(zu|zur|zum|vom|von|the|of|for|and|und|der|die|das|am|im|on|in|an|to|für|fuer)$/i;
  const fuellWeg = (s) => { const w = String(s).split(" ").filter(Boolean); while (w.length && FUELL.test(w[0])) w.shift(); while (w.length && FUELL.test(w[w.length - 1])) w.pop(); return w.join(" "); };
  // Kurspasswörter (nach bestem Bemühen): Manche Kurstitel tragen das Beitrittspasswort („… (Passwort: …)“). Erkannt wird auf
  // einer gefalteten Fassung: Entitäten aufgelöst (auch doppelt kodiert), unsichtbare Zeichen weg (textRein), NFKC, kyrillische
  // und griechische Doppelgänger lateinisch. Starke Marken (Passwort, Password, Kennwort in jeder Schreibweise und als Wortende
  // wie „Kurspasswort“, Passwd, Pwd, Passw., Kennw., Zugangscode, Einschreibeschlüssel, Schlüsselwort, Mot de passe, Enrolment
  // key, Zugangsdaten) zählen immer, aber nicht als Wortanfang („Passwortsicherheit“). PW-Formen (PW, P/W, P.W., KursPW) zählen
  // mit Ziffer dahinter, mit „:“/„=“ oder nach einem Trenner. Schwache Wörter (Key, Code, PIN, Pass, Zugang, Login, Secret,
  // Schlüssel, KW) nur mit „:“/„=“ und einem Wert, der wie ein Passwort aussieht (Ziffer, Sonderzeichen, Großbuchstabe mitten im
  // Wort). Der Titel endet vor der Marke, wenn davor ein Trenner steht („(“, „-“, „|“, „,“ …) oder „:“ folgt; sonst (Passwort
  // mitten im Satz, „<Wert> ist das Passwort“) bleibt nichts, und der Aufrufer nimmt Code oder „Kurs <Nummer>“.
  const ENT = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", colon: ":", period: ".", lowbar: "_", hyphen: "-", sol: "/", num: "#", shy: "" };
  const entitaeten = (s) => {
    let t = String(s);
    for (let i = 0; i < 3 && t.indexOf("&") >= 0; i++) {
      t = t.replace(/&(#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z]{2,8});/g, (m, e) => {
        if (e.charAt(0) !== "#") return hat(ENT, e.toLowerCase()) ? ENT[e.toLowerCase()] : m;
        const n = e.charAt(1) === "x" || e.charAt(1) === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return n > 0 && n < 0x110000 && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : "";
      });
    }
    return t;
  };
  const HOMOGLYPHE = { "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "у": "y", "х": "x", "к": "k", "м": "m", "т": "t", "н": "h", "в": "b",
    "і": "i", "ј": "j", "ѕ": "s", "ԁ": "d", "ԝ": "w", "ԛ": "q", "ӏ": "l", "А": "A", "В": "B", "Е": "E", "К": "K", "М": "M", "Н": "H",
    "О": "O", "Р": "P", "С": "C", "Т": "T", "Х": "X", "У": "Y", "І": "I", "Ј": "J", "Ѕ": "S", "Ԝ": "W", "α": "a", "ο": "o", "ρ": "p",
    "ε": "e", "κ": "k", "ν": "v", "τ": "t", "υ": "u", "ι": "i", "ω": "w", "Α": "A", "Β": "B", "Ε": "E", "Ζ": "Z", "Η": "H", "Ι": "I",
    "Κ": "K", "Μ": "M", "Ν": "N", "Ο": "O", "Ρ": "P", "Τ": "T", "Υ": "Y", "Χ": "X" };
  const falten = (t) => t.replace(/[Ͱ-ϿЀ-ԯ]/g, (c) => HOMOGLYPHE[c] || c); // je Zeichen eins: Stellen bleiben
  const LUECKE = "[\\s._\\-]?";
  const zeichenweise = (w) => w.split("").join(LUECKE);
  const BUCHSTABE = /[A-Za-zÄÖÜäöüß]/;
  const STARK = new RegExp("(?:" + [
    zeichenweise("passw") + LUECKE + "(?:o|ö|oe)" + LUECKE + "r" + LUECKE + "[td](?:e?r|e?s|e)?",
    zeichenweise("kennw") + LUECKE + "(?:o|ö|oe)" + LUECKE + "r" + LUECKE + "t(?:e?r|e?s|e)?",
    "(?:pass|kenn|zugangs|einschreibe|beitritts)" + LUECKE + "code", "passwd", "pwd", "passw\\.", "kennw\\.", "mot de passe",
    "enrol+ment" + LUECKE + "key", "zugangsdaten", "(?:einschreibe|beitritts|zugangs|kurs)" + LUECKE + "schl(?:ü|ue|u)ssel",
    "schl(?:ü|ue|u)sselwort",
  ].join("|") + ")(?![A-Za-zÄÖÜäöüß])", "gi");
  const PW = /p[\s./_-]?w\.?(?![A-Za-zÄÖÜäöüß])/gi;
  const SCHWACH = /(?:key|code|pin|pass|zugang|login|secret|kw|schl(?:ü|ue|u)ssel)(?=\s*[:=])/gi;
  const TRENNER = /[([{|,;:–—\-/·]$/;
  const wertWiePasswort = (rest) => {
    const w = (/^\s*[:=]\s*([^\s)\]}]+)/.exec(rest) || [])[1] || "";
    return !!w && (/\d/.test(w) || /[^A-Za-zÄÖÜäöüß]/.test(w) || /[a-zäöüß][A-ZÄÖÜ]/.test(w));
  };
  // Erste Marke in d (gefaltete Fassung) → { start, ende, behalten (Teil davor darf bleiben) } oder null
  const markeFinden = (d) => {
    let best = null;
    const nimm = (start, ende) => { if (!best || start < best.start) best = { start, ende }; };
    const wortAnfang = (i) => { while (i > 0 && BUCHSTABE.test(d.charAt(i - 1))) i--; return i; };
    let m;
    STARK.lastIndex = 0;
    while ((m = STARK.exec(d))) nimm(wortAnfang(m.index), m.index + m[0].length);
    PW.lastIndex = 0;
    while ((m = PW.exec(d))) {
      const vor = d.slice(0, m.index), nach = d.slice(m.index + m[0].length);
      const kompositum = /(?:kurs|beitritts)[\s._-]?$/i.test(vor);
      if (!kompositum && vor && BUCHSTABE.test(vor.charAt(vor.length - 1))) continue; // mitten im Wort
      if (/^\d/.test(nach) || /^\s*[:=]/.test(nach) || kompositum || TRENNER.test(vor.replace(/\s+$/, "")) || !vor.trim()) {
        nimm(kompositum ? wortAnfang(m.index) : m.index, m.index + m[0].length);
      }
    }
    SCHWACH.lastIndex = 0;
    while ((m = SCHWACH.exec(d))) {
      if (m.index > 0 && BUCHSTABE.test(d.charAt(m.index - 1))) continue;
      if (wertWiePasswort(d.slice(m.index + m[0].length))) nimm(m.index, m.index + m[0].length);
    }
    if (!best) return null;
    const vor = d.slice(0, best.start).replace(/\s+$/, "");
    best.behalten = !!vor && (TRENNER.test(vor) || /^\s*[:=]/.test(d.slice(best.ende)));
    return best;
  };
  // → Titel ohne Passwort; "" heißt: nichts davon ist sicher zu zeigen (Aufrufer: Code oder „Kurs <Nummer>“)
  const vorbereiten = (s) => {
    let t = textRein(entitaeten(textRein(s)));
    try { t = t.normalize("NFKC"); } catch (e) { /* bleibt NFC */ }
    return t;
  };
  const hatKennwort = (s) => !!markeFinden(falten(vorbereiten(s)));
  const ohneKennwort = (s) => {
    const t = vorbereiten(s);
    const m = markeFinden(falten(t));
    if (!m) return t;
    return m.behalten ? t.slice(0, m.start).replace(/[\s([{<\-–—:;,|/·.]+$/, "").trim() : "";
  };
  // ILIAS-Pfad „Kurs / Ordner / …“: jedes Stück einzeln; ein leerer Kurs wird zu ersatz (Code bzw. „Kurs“)
  const pfadOhneKennwort = (p, ersatz) => String(p == null ? "" : p).split(" / ").map((x, i) => ohneKennwort(x) || (i ? "" : ersatz || "Kurs")).filter(Boolean).join(" / ");
  const mdText = (s) => String(s).replace(/[\\`*_\[\]<>#|!$%~=^{}]/g, "\\$&");
  const endungVon = (name) => { const m = String(name || "").match(/\.([A-Za-z0-9]{1,8})$/); return m ? m[1].toLowerCase() : ""; };
  const ohneEndung = (name) => String(name).replace(/\.[A-Za-z0-9]{1,8}$/, "");
  const elternVon = (p) => { const i = p.lastIndexOf("/"); return i < 0 ? "" : p.slice(0, i); };
  const nameVon = (p) => p.slice(p.lastIndexOf("/") + 1);
  const notizPfad = (p) => ohneEndung(p) + ".md";
  const mb = (bytes) => (bytes / 1048576).toFixed(1).replace(".", ",") + " MB";
  const vergleich = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  const codeAm = (titel) => { const m = String(titel || "").match(CODE_ANFANG); return m ? m[1] : ""; };
  const fehlerArt = (art, text) => { const e = new Error(text); e.art = art; return e; };
  // Kurzer, stabiler Hash (FNV-1a, 32 Bit) für den Namen des Schlüsselbund-Eintrags
  const hash32 = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); };
  // Eintrag im Schlüsselbund je Tresor: nur a–z, 0–9 und „-“, höchstens 64 Zeichen
  const geheimIdAus = (tresor) => GEHEIM_PRAEFIX + hash32(String(tresor || "tresor"));
  const eigenSha = async (bytes) => {
    const h = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    let s = "";
    for (let i = 0; i < h.length; i++) s += h[i].toString(16).padStart(2, "0");
    return s;
  };
  const sha256 = (bytes) => (ctx.update && typeof ctx.update.sha256 === "function" ? ctx.update.sha256(bytes) : eigenSha(bytes));
  // Antwort eines Downloads → Uint8Array (bytes, daten, arrayBuffer, Uint8Array, ArrayBuffer) oder null
  const bytesAus = (r) => {
    if (!r) return null;
    if (r instanceof ArrayBuffer) return new Uint8Array(r);
    if (ArrayBuffer.isView(r)) return new Uint8Array(r.buffer, r.byteOffset, r.byteLength);
    if (r.bytes) return bytesAus(r.bytes);
    if (r.daten) return bytesAus(r.daten);
    if (r.arrayBuffer && typeof r.arrayBuffer !== "function") return bytesAus(r.arrayBuffer);
    return null;
  };
  // Fortschritt eines Laufs für die Anzeige: x = { phase, erledigt?, gesamt?, code? }, weiter (fortgesetzter Auftrag) → { text
  // (Fenster, Zeile), kurz (Hinweis mit Balken: „ILIAS · 12 von 40“, „ILIAS · weiter: 26 von 40“), knopf (Knopf auf Unterlagen), anteil (0–1; null = noch unbekannt) }. Nie Kurstitel (können
  // Einschreibepasswörter enthalten), höchstens der Modulcode.
  const fortschrittAnzeige = (x, weiter) => {
    x = x || {};
    const g = Math.max(0, Math.floor(Number(x.gesamt) || 0));
    const e = Math.min(g, Math.max(0, Math.floor(Number(x.erledigt) || 0)));
    const code = CODE_GANZ.test(String(x.code || "")) ? String(x.code) : "";
    const laden = x.phase === "laden" && g > 0;
    const kurz = laden ? `${Math.min(e + 1, g)} von ${g}`
      : x.phase === "durchsuchen" ? (code ? `${code} wird durchsucht` : "Kurse werden durchsucht")
        : x.phase === "kurse" ? "Kurse werden gelesen"
          : x.phase === "anmelden" ? "Anmeldung" : "Wird vorbereitet";
    return {
      text: laden ? `Lädt ${kurz}` : `${kurz} …`,
      kurz: `ILIAS · ${weiter ? "weiter: " : ""}${kurz}`,
      knopf: laden ? `Lädt ${kurz}` : "Lädt …",
      anteil: (laden || x.phase === "durchsuchen") && g > 0 ? e / g : null,
    };
  };
  // Offener Auftrag nach einem Lauf: a = { seit, versuche, stapel, geladen } (gerätelokal), b = Bericht → { auftrag (neuer
  // Stand, null = erledigt), inMs (nächster Versuch; null = keiner, z. B. nach Neustart oder stündlich) }. Nie weiter nach
  // abgelehnter Anmeldung, Zustimmung, zweitem Faktor, Trennen, Stoppen oder wenn ein anderes Gerät lädt.
  const naechsterSchritt = (a, b) => {
    const aus = { auftrag: null, inMs: null };
    if (!a || !b) return aus;
    const geladen = (a.geladen || 0) + (b.geladen || 0);
    if (b.art === "ok" || b.art === "unveraendert") {
      const stapel = (a.stapel || 0) + 1;
      if (!((b.rest || 0) + (b.kurseOffen || 0)) || stapel >= STAPEL_MAX) return aus;
      return { auftrag: Object.assign({}, a, { versuche: 0, stapel, geladen }), inMs: STAPEL_PAUSE };
    }
    if (b.art === "fehler") {
      const versuche = (a.versuche || 0) + 1;
      if (versuche > WIEDER_MIN.length) return aus;
      return { auftrag: Object.assign({}, a, { versuche, geladen }), inMs: WIEDER_MIN[versuche - 1] * MIN };
    }
    if (b.art === "abgebrochen") return { auftrag: Object.assign({}, a, { geladen }), inMs: null }; // Plugin neu geladen: beim Start weiter
    if (b.art === "kurse") return { auftrag: a, inMs: 1000 }; // Knopf während des Kurse-Lesens: gleich danach laden
    return aus;
  };
  // Lauf ohne Regung (Anfrage, Fortschritt) seit STILL: auf iPhone/iPad meist im Hintergrund gestorben
  const abgestorben = (regungMs, jetztMs) => regungMs > 0 && jetztMs - regungMs > STILL;
  const vorText = (iso, jetztMs) => {
    const t = Date.parse(iso || "");
    if (isNaN(t)) return "";
    const min = Math.max(0, Math.round((jetztMs - t) / MIN));
    if (min < 1) return "gerade eben";
    if (min < 60) return `vor ${min} Min.`;
    const h = Math.round(min / 60);
    return h < 48 ? `vor ${h} Std.` : `vor ${Math.round(h / 24)} Tagen`;
  };

  // ---------- Index: lesen, prüfen, mischen ----------
  const BEREICHE = ["kurse", "dateien", "ignoriert", "gruppen"];
  const leererIndex = () => ({ version: 1, kurse: {}, dateien: {}, ignoriert: {}, gruppen: {} });
  // Titel ohne Kurspasswort (auch alte Einträge: beim Lesen gesäubert, beim nächsten Schreiben ersetzt)
  const saeubern = (b, e, id) => {
    if (b === "kurse" && hat(e, "titel")) { const t = ohneKennwort(e.titel) || e.code || "Kurs " + id; if (t !== e.titel) return Object.assign({}, e, { titel: t }); }
    if ((b === "dateien" || b === "ignoriert") && typeof e.iliasPfad === "string") {
      const p = pfadOhneKennwort(e.iliasPfad);
      if (p !== e.iliasPfad) return Object.assign({}, e, { iliasPfad: p });
    }
    return e;
  };
  const indexPruefen = (o) => {
    const x = leererIndex();
    if (!o || typeof o !== "object" || Array.isArray(o)) return x;
    for (const b of BEREICHE) {
      const q = o[b];
      if (!q || typeof q !== "object" || Array.isArray(q)) continue;
      for (const id of Object.keys(q)) if (q[id] && typeof q[id] === "object" && !Array.isArray(q[id])) x[b][id] = saeubern(b, q[id], id);
    }
    return x;
  };
  // Je Eintrag gewinnt der neuere (Feld t); bei Gleichstand „mein“ (der Stand dieses Geräts)
  const mischen = (platte, mein) => {
    const aus = leererIndex();
    for (const b of BEREICHE) {
      const p = platte[b] || {}, m = mein[b] || {};
      for (const id of Object.keys(p)) aus[b][id] = p[id];
      for (const id of Object.keys(m)) {
        const x = aus[b][id];
        if (!x || String(m[id].t || "") >= String(x.t || "")) aus[b][id] = m[id];
      }
    }
    return aus;
  };

  // ---------- Begleitnotiz ----------
  // Pflichtfelder im Frontmatter setzen (Werte schon als YAML), auch wenn ein anderer Baustein die Notiz gebaut hat
  const pflichtfelder = (text, felder) => {
    const m = String(text).match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/);
    if (!m) return "---\n" + Object.keys(felder).map((k) => k + ": " + felder[k]).join("\n") + "\n---\n\n" + String(text);
    const zeilen = m[1].split(/\r?\n/);
    for (const k of Object.keys(felder)) {
      const z = k + ": " + felder[k];
      const i = zeilen.findIndex((x) => x.indexOf(k + ":") === 0);
      if (i >= 0) {
        zeilen[i] = z;
        while (i + 1 < zeilen.length && /^[ \t]+\S|^[ \t]*- /.test(zeilen[i + 1])) zeilen.splice(i + 1, 1); // alter Listenwert
      } else {
        const u = zeilen.findIndex((x) => /^(cssclasses|tags):/.test(x));
        if (u >= 0) zeilen.splice(u, 0, z); else zeilen.push(z);
      }
    }
    return "---\n" + zeilen.join("\n") + "\n---" + (m[2] || "\n") + String(text).slice(m[0].length);
  };
  // Notiz wie unterlagen.js (notizInhalt), mit Herkunft aus ILIAS. d: { code, modul (Notizname), art, nr, titel, datei
  // (Dateiname im Tresor), endung, groesse, original (Name in ILIAS), quelle, herkunft, iliasId, semester, datum, hinweis? }
  const notizText = (d) => {
    const e = d.endung;
    const kopf = [d.code, [d.art, d.nr != null ? pad(d.nr) : ""].filter(Boolean).join(" "), d.titel].filter(Boolean).join(" · ") || ohneEndung(d.datei);
    const eck = [`**Modul:** ${d.modul ? `[[${d.modul}|${d.code}]]` : "–"}`, `**Art:** ${d.art}`, `**Semester:** ${d.semester || "–"}`].join(" · ");
    let ansicht;
    if (e === "pdf" && d.groesse >= EINBETTEN_MAX_MB * 1048576) ansicht = `**PDF öffnen:** [[${d.datei}]] (${mb(d.groesse)}, zu groß zum Einbetten)`;
    else if (e === "pdf") ansicht = `> [!eba-pdf]- PDF\n> ![[${d.datei}#height=560]]`;
    else if (BILDER.indexOf(e) >= 0) ansicht = `![[${d.datei}]]`;
    else ansicht = `[[${d.datei}]]\n\n> [!eba-info] Nur als ${e.toUpperCase()} vorhanden\n> Obsidian zeigt diesen Dateityp nicht an. Über „Öffnen“ öffnet sie sich in der passenden App.`;
    const zeilen = [
      "---", "typ: unterlage", `code: ${J(d.code)}`, `modul: ${J(d.modul ? `[[${d.modul}]]` : "")}`, `art: ${J(d.art)}`,
      `nummer: ${d.nr != null ? d.nr : ""}`, `titel: ${J(d.titel)}`, `datei: ${J(`[[${d.datei}]]`)}`, `original: ${J(d.original)}`,
      `format: ${J(e)}`, "seiten:", `semester: ${J(d.semester)}`, "status: neu", `datum: ${d.datum}`, `quelle: ${J(d.quelle)}`,
      `ilias_id: ${J(d.iliasId)}`, 'uebersicht: "[[Unterlagen]]"', "cssclasses:", "  - eba-s-begleitnotiz", "tags:", "  - unterlage", "---",
      "", `# ${kopf}`, "", "> [!eba-regel] Eckdaten", `> ${eck}`, `> **Aus ILIAS:** ${mdText(d.herkunft)}`,
      "> [Öffnen ↗](obsidian://studium-autopilot?aktion=oeffnen) · [Größe ⇅](obsidian://studium-autopilot?aktion=pdf)", "",
    ];
    if (d.hinweis) zeilen.push("> [!eba-info] Neue Fassung aus ILIAS", "> " + d.hinweis, "");
    return zeilen.concat(["## Das Wichtigste", "- ", "", "## Offene Fragen", "- [ ] ", "", ansicht, ""]).join("\n");
  };

  // ---------- Einordner (unterlagen.js) ----------
  // Adapter auf unterlagen.js: vorschlag(rel, endung, code, daten) → { art, nr, titel, code?, schwach? } (bei PDF-Daten über
  // vorschlagMitPdf: schwacher Titel aus dem Namen → Titel der ersten PDF-Seite), zielName(code, art, nr, titel) → Name ohne
  // Endung, begleitnotiz(d) → Notiztext (d wie notizText; Pflichtfelder setzt ilias.js danach selbst). Ohne unterlagen.js
  // einfache Rückfälle.
  const einordnerAus = (U) => ({
    vorschlag: async (rel, endung, code, daten) => {
      if (U && daten && typeof U.vorschlagMitPdf === "function") return U.vorschlagMitPdf(rel, endung, code, daten);
      if (U && typeof U.vorschlag === "function") return U.vorschlag(rel, endung, code);
      return { art: "Sonstiges", nr: null, titel: sauber(ohneEndung(nameVon(rel))) };
    },
    zielName: U && typeof U.zielName === "function" ? (c, a, n, t) => U.zielName(c, a, n, t)
      : (c, a, n, t) => [c, a, n != null ? pad(n) : "", t].filter(Boolean).join(" "),
    // „original“ meint in unterlagen.js die Office-Datei neben der PDF (Link, Knopf „Original öffnen“); der Name in ILIAS
    // kommt darum erst danach über pflichtfelder ins Frontmatter, nie als Link
    begleitnotiz: U && typeof U.begleitnotiz === "function" ? (d) => U.begleitnotiz({
      code: d.code, modul: d.modul || null, art: d.art, nummer: d.nr, titel: d.titel, datei: d.datei, groesse: d.groesse,
      semester: d.semester, quelle: d.quelle, extra: { ilias_id: d.iliasId },
    }) : null,
  });

  // ---------- Motor (ohne Obsidian testbar) ----------
  // abh: {
  //   io: Tresor (lesenText, schreibenText, lesenBinaer, anlegenBinaer, anlegenText, ersetzenBinaer, loeschen, existiert,
  //       dateien(unter) → [{ pfad, groesse }] ohne .md, unterordner(pfad) → [Name], ordnerAnlegen, notizMarkieren(pfad, felder))
  //   lokal(k, v?), geheim: { lesen(id) → Text | null (synchron), schreiben(id, w), loeschen(id) }, geheimId(),
  //   anmeldung() → anmelden(sitzung, zugang, optionen) → { ok, grund?, hinweis? } | null (dann „folgt später“),
  //   quelle(zugang, anmelden) → { kurse(), inhalt(behaelter), laden(eintrag), name(eintrag) } (meldet sich mit anmelden an),
  //   einordner() → wie einordnerAus, modul(code) → { name, titel } | null, semester() → Text, einstellungen() → {},
  //   jetzt() → Date, warten(ms), mobil, geraetId(), melden(text)?, geaendert(info)? }
  const erzeugen = (abh) => {
    const io = abh.io;
    const lokal = abh.lokal;
    const jetzt = () => abh.jetzt();
    const ms = () => jetzt().getTime();
    const iso = () => jetzt().toISOString();
    const heute = () => { const d = jetzt(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
    const alter = (s) => { const t = Date.parse(s || ""); return isNaN(t) ? Infinity : ms() - t; };
    const tagIso = (t) => { const d = new Date(t); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
    const melden = (x) => { try { if (abh.geaendert) abh.geaendert(x || null); } catch (e) { /* egal */ } };

    // ----- Stand (gerätelokal) -----
    const stand = () => Object.assign({ zuletzt: "", versucht: "", fehler: "", fehlerZeit: "", neu: 0, rest: 0, abrufer: false, anderes: "", gesperrt: false, dateien: 0, kurse: 0, zuGross: 0, kursZeit: {}, kursFertig: {} }, lokal(L.stand) || {});
    const standSetzen = (x) => lokal(L.stand, Object.assign(stand(), x));
    const protokoll = () => { const p = lokal(L.protokoll); return Array.isArray(p) ? p.slice() : []; };
    // Offener Auftrag (ein Abruf, den du gestartet hast und der noch nicht fertig ist), nur auf diesem Gerät
    const auftrag = () => { const a = lokal(L.auftrag); return a && typeof a === "object" && !Array.isArray(a) ? a : null; };

    // ----- Zugang -----
    const benutzer = () => { const b = lokal(L.benutzer); return typeof b === "string" ? b : ""; };
    const hatZugang = () => !!benutzer();
    const geheimLesen = () => { try { const v = abh.geheim.lesen(abh.geheimId()); return typeof v === "string" && v ? v : ""; } catch (e) { return ""; } };
    const anmeldung = () => { try { const f = abh.anmeldung ? abh.anmeldung() : null; return typeof f === "function" ? f : null; } catch (e) { return null; } };
    const extern = () => {
      try { return eigenerAbgleich(io.existiert, abh.einstellungen && abh.einstellungen()); } catch (e) { return false; }
    };
    // Eigener Uni-Abgleich: trotzdem bereit, dann nur für die Übungsgruppen (lauf: nurGruppen, keine Downloads)
    const bereit = () => !!anmeldung() && hatZugang() && !stand().gesperrt;
    // Fehlertext ohne Kennwort (auch URL-kodiert), höchstens 300 Zeichen
    const fehlerText = (e, wert) => {
      let t = String((e && e.message) || e || "Fehler");
      const w = wert || geheimLesen();
      if (w) for (const g of [w, encodeURIComponent(w)]) t = t.split(g).join("•••");
      return t.slice(0, 300);
    };
    // Anmeldung mit Ergebnisobjekt → wirft bei Misserfolg (e.art „zugang“ = ohne dein Zutun nicht mehr automatisch versuchen)
    const anmeldenMit = (f) => async (sitzung, zugang, optionen) => {
      const r = await f(sitzung, zugang, optionen);
      if (r && r.ok) return r;
      const grund = (r && r.grund) || "unerwartet";
      const e = new Error((r && r.hinweis) || "Die Anmeldung bei ILIAS hat nicht geklappt.");
      e.art = SPERRGRUENDE.indexOf(grund) >= 0 ? "zugang" : "anmeldung";
      e.grund = grund;
      throw e;
    };
    // { pruefen: true } meldet sich vorher einmal an und speichert nur bei Erfolg
    const zugangSpeichern = async (name, geber, o) => {
      o = o || {};
      name = String(name == null ? "" : name).trim();
      let wert = "";
      try { wert = typeof geber === "function" ? await geber() : geber; } catch (e) { wert = ""; }
      if (!name || typeof wert !== "string" || !wert) return { ok: false, art: "leer", fehler: "Benutzername oder Kennwort fehlt." };
      try {
        if (o.pruefen) {
          const f = anmeldung();
          if (!f) return { ok: false, art: "ohne-anmeldung", fehler: TEXT_ANMELDUNG_FOLGT + "." };
          const w = wert;
          try { await abh.quelle({ benutzer: name, kennwortGeber: () => w }, anmeldenMit(f)); }
          catch (e) { return { ok: false, art: (e && e.art) || "fehler", grund: (e && e.grund) || "", fehler: fehlerText(e, w) }; }
        }
        try { await abh.geheim.schreiben(abh.geheimId(), wert); }
        catch (e) { return { ok: false, art: "schluesselbund", fehler: "Der Schlüsselbund von Obsidian ist auf diesem Gerät nicht verfügbar." }; }
      } finally { wert = ""; }
      lokal(L.benutzer, name);
      standSetzen({ gesperrt: false, fehler: "", fehlerZeit: "" });
      melden({ art: "zugang" });
      return { ok: true };
    };
    const zugangLoeschen = async () => {
      stoppen("trennen");
      try { await abh.geheim.loeschen(abh.geheimId()); } catch (e) { /* schon weg */ }
      lokal(L.benutzer, null);
      lokal(L.funde, null);
      standSetzen({ fehler: "", fehlerZeit: "", gesperrt: false, abrufer: false });
      melden({ art: "zugang" });
    };

    // ----- Index im Speicher; Schreiben nacheinander, je Eintrag gemischt mit der Platte -----
    let mem = null;
    let kette = Promise.resolve();
    const reihe = (fn) => { const p = kette.then(fn); kette = p.catch(() => {}); return p; };
    const parsen = (t) => {
      if (t == null) return leererIndex();
      try { return indexPruefen(JSON.parse(t)); } catch (e) { throw fehlerArt("index", "ilias.json ist unlesbar (Sync-Konflikt?). Bitte die Datei prüfen."); }
    };
    const indexLesen = async () => { const p = parsen(await io.lesenText(INDEX)); mem = mem ? mischen(p, mem) : p; return mem; };
    const speichern = () => reihe(async () => {
      if (!mem) return;
      const alt = await io.lesenText(INDEX);
      mem = mischen(parsen(alt), mem);
      const text = JSON.stringify(mem, null, 1) + "\n";
      if (text !== alt) await io.schreibenText(INDEX, text);
    });
    // Eintrag ersetzen (nie verändern: beim Mischen kann ein anderes Objekt gewinnen)
    const setzen = (b, id, felder) => { mem[b][id] = Object.assign({}, mem[b][id] || {}, felder, { t: iso() }); return mem[b][id]; };
    const zaehlen = () => {
      if (!mem) { const s = stand(); return { dateien: s.dateien, kurse: s.kurse, zuGross: s.zuGross }; }
      const d = mem.dateien, k = mem.kurse, g = mem.ignoriert;
      return {
        dateien: Object.keys(d).filter((id) => !d[id].geloescht).length,
        kurse: Object.keys(k).filter((id) => k[id].aktiv).length,
        zuGross: Object.keys(g).filter((id) => g[id].grund === "zu groß" && !hat(d, id)).length,
      };
    };

    // ----- Umbenennen im Tresor (Ereignis „rename“): Index zieht mit, auch für ganze Ordner -----
    const umbenannt = async (neu, alt) => {
      if (!mem) { if (!io.existiert(INDEX)) return false; try { await indexLesen(); } catch (e) { return false; } }
      const ziel = (p) => (p === alt ? neu : p && p.indexOf(alt + "/") === 0 ? neu + p.slice(alt.length) : null);
      let n = 0;
      for (const id of Object.keys(mem.dateien)) {
        const e = mem.dateien[id], felder = {};
        const z = ziel(e.pfad);
        if (z) felder.pfad = z;
        if (Array.isArray(e.fassungen) && e.fassungen.some((f) => ziel(f))) felder.fassungen = e.fassungen.map((f) => ziel(f) || f);
        if (Object.keys(felder).length) { setzen("dateien", id, felder); n++; }
      }
      return n > 0;
    };

    // ----- Abrufer-Sperre -----
    const sperreLesen = async () => {
      const t = await io.lesenText(ABRUF);
      if (t == null) return null;
      try { const o = JSON.parse(t); return o && typeof o.geraet === "string" ? { geraet: o.geraet, seit: String(o.seit || ""), zuletzt: String(o.zuletzt || "") } : null; } catch (e) { return null; }
    };
    const sperreSchreiben = (a) => io.schreibenText(ABRUF, JSON.stringify({ geraet: a.geraet, seit: a.seit, zuletzt: a.zuletzt }, null, 1) + "\n");

    // ----- Dateien im Tresor: Prüfsummen (je Lauf zwischengespeichert) -----
    const hashVon = async (r, pfad) => {
      if (hat(r.hashes, pfad)) return r.hashes[pfad];
      const by = await io.lesenBinaer(pfad);
      const h = by ? await sha256(by) : "";
      r.hashes[pfad] = h;
      return h;
    };
    const unterlagen = (r) => { if (!r.unterlagen) r.unterlagen = io.dateien(ZIEL); return r.unterlagen; };
    // Byte-gleiche Datei: erst Größe, dann SHA-256
    const gleicheDatei = async (r, vorrat, groesse, sha, ausser) => {
      for (const d of vorrat) {
        if (d.groesse !== groesse || (ausser && ausser[d.pfad])) continue;
        if ((await hashVon(r, d.pfad)) === sha) return d.pfad;
      }
      return null;
    };

    // Umbenannt (auf einem anderen Gerät, kam per Sync als neue Datei) oder gelöscht? Für Einträge, deren Datei fehlt.
    // Fehlt mehr als die Hälfte (und mehr als 10), ist vermutlich der Sync noch nicht fertig: dann nichts als gelöscht merken.
    const nachziehen = async (b, r) => {
      const d = mem.dateien;
      for (const id of Object.keys(d)) if (d[id].geloescht && d[id].pfad && io.existiert(d[id].pfad)) setzen("dateien", id, { geloescht: false }); // kam spät per Sync
      const fehlend = Object.keys(d).filter((id) => d[id].pfad && !d[id].geloescht && !io.existiert(d[id].pfad));
      if (!fehlend.length) return;
      const alle = Object.keys(d).filter((id) => !d[id].geloescht).length;
      if (fehlend.length > 10 && fehlend.length > alle / 2) { b.warnung = `${fehlend.length} Dateien fehlen im Tresor, vermutlich läuft der Sync noch. Nichts als gelöscht gemerkt.`; return; }
      const vorrat = io.dateien("");
      const belegt = {};
      for (const id of Object.keys(d)) if (!d[id].geloescht && d[id].pfad && io.existiert(d[id].pfad)) belegt[d[id].pfad] = true;
      for (const id of fehlend) {
        const e = d[id];
        const da = e.sha256 && e.groesse ? await gleicheDatei(r, vorrat, e.groesse, e.sha256, belegt) : null;
        if (da) { setzen("dateien", id, { pfad: da }); belegt[da] = true; }
        else { setzen("dateien", id, { geloescht: true, geloeschtAm: heute() }); plus(b, e.kurs, "geloescht"); }
      }
      await speichern();
    };

    // ----- Anfragen an ILIAS: eine nach der anderen, mit Abstand -----
    // Je Lauf ein Stopp-Zeichen (r.stopp): ein verworfener Lauf, der später aufwacht, schreibt nichts mehr
    let regung = 0; // letzte Anfrage oder letzter Fortschritt (ms), für abgestorben()
    const halt = (r) => { if (r.stopp.an) throw fehlerArt("abbruch", "abgebrochen"); };
    const anfrage = async (b, r, fn) => {
      if (r.letzte) { const seit = ms() - r.letzte; if (seit < ABSTAND_MS) await abh.warten(ABSTAND_MS - seit); }
      halt(r);
      b.anfragen++;
      try { return await fn(); } finally { r.letzte = ms(); regung = r.letzte; }
    };
    // Fehler, der nur diese eine Datei oder diesen Ordner betrifft (HTTP-Status, z. B. 403, 404, 500 eines einzelnen Objekts);
    // ohne Status (kein Netz, Zeitüberschreitung, Sitzung) endet der Lauf sofort
    const einzeln = (e) => { const s = e && Number(e.status); return s >= 400 || (!!e && e.art === "datei"); };
    // Zähler im Bericht, gesamt und je Kurs (b.jeKurs[refId], für Anzeige und Probeläufe)
    const plus = (b, refId, feld) => {
      if (typeof b[feld] === "number") b[feld]++;
      if (!refId) return;
      const k = b.jeKurs[refId] || (b.jeKurs[refId] = {});
      k[feld] = (k[feld] || 0) + 1;
    };
    // Fortschritt: { phase, text, erledigt?, gesamt?, code? } (fortschrittAnzeige; nie Kurs- oder Dateinamen); letzter = Stand für
    // Anzeigen, die mitten im Lauf dazukommen
    let letzter = null;
    const fort = (o, x) => {
      const y = Object.assign({}, x, { text: fortschrittAnzeige(x).text });
      letzter = y; regung = ms();
      if (typeof o.fortschritt === "function") { try { o.fortschritt(y); } catch (e) { /* egal */ } }
      melden(Object.assign({ art: "fortschritt" }, y));
    };
    const kursAn = (refId) => !!(mem && mem.kurse[refId] && mem.kurse[refId].aktiv);

    // ----- Kurse -----
    const kurseUebernehmen = (roh) => {
      const aus = [];
      for (const k of roh) {
        const refId = k && k.refId != null ? String(k.refId) : "";
        if (!refId || !k.url) continue;
        const code = (k.code && CODE_GANZ.test(String(k.code)) ? String(k.code) : codeAm(textRein(k.titel))) || "";
        const titel = ohneKennwort(k.titel) || code || "Kurs " + refId;
        const alt = mem.kurse[refId];
        // Vorgabe beim ersten Sehen: an, wenn der Titel mit einem Modulcode beginnt, zu dem es eine Modulnotiz gibt
        if (!alt) setzen("kurse", refId, { titel, code, aktiv: !!(code && abh.modul(code)), zuletzt: "" });
        else if (alt.titel !== titel || alt.code !== code) setzen("kurse", refId, { titel, code });
        aus.push({ refId, titel, code, url: k.url });
      }
      return aus;
    };
    const kurseListe = () => {
      const k = mem ? mem.kurse : {}, d = mem ? mem.dateien : {};
      const zahl = {};
      for (const id of Object.keys(d)) if (!d[id].geloescht) zahl[d[id].kurs] = (zahl[d[id].kurs] || 0) + 1;
      return Object.keys(k).map((id) => ({ refId: id, titel: ohneKennwort(k[id].titel || ""), code: k[id].code || "", aktiv: !!k[id].aktiv, zuletzt: k[id].zuletzt || "", dateien: zahl[id] || 0 }))
        .sort((a, b) => a.titel.localeCompare(b.titel, "de"));
    };
    const kurse = async () => { await indexLesen(); return kurseListe(); };
    const kursSetzen = async (refId, aktiv) => {
      await indexLesen();
      const id = String(refId);
      if (!mem.kurse[id]) return false;
      setzen("kurse", id, { aktiv: !!aktiv });
      await speichern();
      melden({ art: "kurse" });
      return true;
    };

    // ----- Übungs- und Tutoriengruppen (meine-gruppe.js): Mitgliedschaften → Notizen in Stundenplan/ -----
    // Mitglied heißt: Die Gruppe steht auf „Meine Kurse und Gruppen“. Den Modulcode liefert der Kurs (oder Unterordner mit Code),
    // in dem die Durchsuchung die Gruppe sah, sonst die Brotkrumen der Gruppenseite (höchstens GRUPPEN_SEITEN je Lauf; mit Code
    // gemerkt, ohne Code erst nach KURS_WIEDER neu versucht); nie die Uhrzeit. Zeitfenster und Name („Gruppe 4“) aus Titel und
    // Beschreibung der Mitgliederseite (sonst aus der Durchsuchung). Verlassen gilt erst, wenn die Gruppe zwei Läufe in Folge
    // fehlt (fehlt ≥ 2); eine ganz leere Gruppenliste entfernt nie etwas.
    const gruppenLib = () => { try { return abh.gruppen ? abh.gruppen() : null; } catch (e) { return null; } };
    const gruppenSlot = (e) => { const G = gruppenLib(); return G ? G.zeitfenster(String(e.titel || "") + " · " + String(e.beschreibung || "")) : null; };
    const gruppenNameAus = (titel) => { const G = gruppenLib(); return G && G.gruppenName ? G.gruppenName(titel) : ""; };
    const GRUPPE_FELDER = ["code", "kurs", "name", "tag", "beginn", "ende", "raum", "mitglied", "fehlt", "kursVersucht", "status", "zentral", "kandidaten"];
    const gruppeMerken = (id, felder) => {
      const alt = mem.gruppen[id] || {}, neu = Object.assign({}, alt, felder);
      const anders = GRUPPE_FELDER.some((k) => JSON.stringify(alt[k] == null ? null : alt[k]) !== JSON.stringify(neu[k] == null ? null : neu[k]));
      if (anders) setzen("gruppen", id, felder);
    };
    const slotFelder = (s) => (s ? { tag: s.tag, beginn: s.beginn, ende: s.ende || "", raum: s.raum || "" } : {});
    // roh = [{ refId, url, slot, name }] von der Mitgliederseite (null: Quelle ohne Gruppen → nichts tun, auch nichts entfernen)
    const gruppenAbgleichen = async (b, r, q, roh, darf) => {
      const G = gruppenLib();
      if (!G || !roh) return;
      const warnen = (t) => { b.warnung = (b.warnung ? b.warnung + " " : "") + t; };
      for (const id of Object.keys(r.gruppenGesehen)) {
        const x = r.gruppenGesehen[id];
        gruppeMerken(id, Object.assign({ code: x.code || (mem.gruppen[id] || {}).code || "", kurs: x.kurs }, slotFelder(x.slot), x.name ? { name: x.name } : {}));
      }
      const zentral = abh.zentraleGruppen ? abh.zentraleGruppen() : null;
      const semester = abh.semester ? abh.semester() : "";
      const mitglieder = new Set(), soll = [];
      let seiten = 0;
      for (const g of roh) {
        const id = String(g.refId);
        mitglieder.add(id);
        const vorher = mem.gruppen[id] || {};
        if (!vorher.code && q.gruppeKurs && seiten < GRUPPEN_SEITEN && darf() && alter(vorher.kursVersucht) >= KURS_WIEDER) {
          seiten++;
          let k = null;
          try { k = await anfrage(b, r, () => q.gruppeKurs({ refId: id, url: g.url })); } catch (x) { if (!einzeln(x)) throw x; }
          const kc = k && k.refId ? mem.kurse[String(k.refId)] : null;
          const code = k && k.refId ? (kc && kc.code) || (CODE_GANZ.test(String(k.code || "")) ? String(k.code) : "") : "";
          gruppeMerken(id, Object.assign({ kursVersucht: iso() }, k && k.refId ? { kurs: String(k.refId), code } : {}));
        }
        const e = mem.gruppen[id] || {};
        const slot = g.slot || (e.tag ? { tag: e.tag, beginn: e.beginn, ende: e.ende, raum: e.raum } : null);
        const z = zentral ? G.zuordnen(slot, e.code || "", zentral, semester) : { status: e.code ? "ohne-daten" : "ohne-code" };
        gruppeMerken(id, Object.assign(slotFelder(g.slot), g.name ? { name: g.name } : {}, { mitglied: true, fehlt: 0, status: z.status, zentral: z.id || "", kandidaten: z.kandidaten || [] }));
        const zg = z.id ? zentral.find((x) => x.id === z.id) : null;
        if (zg) soll.push({ refId: id, g: zg, name: (mem.gruppen[id] || {}).name || "" });
      }
      // Fehlende Gruppen (bekannt aus dem Index oder einer Notiz): je Lauf hochzählen; eine leere Liste zählt nicht
      const sp = abh.stundenplan ? abh.stundenplan() : null;
      const ausNotizen = sp ? sp.notizen().filter((x) => x.fm && x.fm.herkunft === "ilias-gruppe").map((x) => String(x.fm.ilias_gruppe || "")).filter(Boolean) : [];
      const bekannt = Object.keys(mem.gruppen).filter((id) => mem.gruppen[id].mitglied).concat(ausNotizen).filter((id, i, a) => a.indexOf(id) === i);
      const leer = !mitglieder.size && bekannt.length > 0;
      if (leer) warnen("ILIAS nennt keine deiner Gruppen mehr – nichts entfernt.");
      else for (const id of bekannt) if (!mitglieder.has(id)) gruppeMerken(id, { fehlt: ((mem.gruppen[id] || {}).fehlt || 0) + 1 });
      const verlassen = (id) => !leer && ((mem.gruppen[id] || {}).fehlt || 0) >= 2;
      b.gruppen = { mitglied: mitglieder.size, zugeordnet: soll.length, neu: 0 };
      if (zentral && sp) { // ohne Gruppenliste keine Notizen (und keine entfernt)
        const n = await G.iliasAbgleichen(sp, soll, mitglieder, { modul: abh.modul, heute: heute(), wegErlaubt: verlassen });
        b.gruppen.neu = n.angelegt.length + n.uebernommen.length;
        b.gruppen.notizen = n;
        if (n.warnung) warnen(n.warnung);
        else for (const id of bekannt) if (verlassen(id)) gruppeMerken(id, { mitglied: false, status: "", zentral: "", kandidaten: [] });
      }
      await speichern();
      melden({ art: "gruppen" });
    };
    // Mitgliedschaften für die Anzeige (gruppen.js): [{ refId, code, name, status, zentral, kandidaten }], nur aktuelle
    const gruppenListe = () => {
      const g = mem ? mem.gruppen : {};
      return Object.keys(g).filter((id) => g[id].mitglied).map((id) => ({ refId: id, code: g[id].code || "", name: g[id].name || "", status: g[id].status || "",
        zentral: g[id].zentral || "", kandidaten: Array.isArray(g[id].kandidaten) ? g[id].kandidaten.slice() : [] }));
    };

    // ----- Einmal je Gerät (mit der Abrufer-Sperre): Kurspasswörter aus älteren Fassungen im Tresor -----
    // Begleitnotizen (quelle, Zeile „Aus ILIAS:“) aus dem Index und Ordner unter Unterlagen/, deren Name eine Passwort-Marke trägt
    // (Kurse ohne Code hießen wie ihr Titel). Ordner werden umbenannt (Links ziehen mit, der Index über umbenannt).
    const notizSaeubern = (text) => String(text)
      .replace(/^quelle: (".*")[ \t]*$/m, (z, q) => {
        let v = "";
        try { v = JSON.parse(q); } catch (e) { return z; }
        return typeof v === "string" && v.indexOf("ILIAS: ") === 0 && hatKennwort(v.slice(7)) ? "quelle: " + J("ILIAS: " + pfadOhneKennwort(v.slice(7))) : z;
      })
      .replace(/^> \*\*Aus ILIAS:\*\* (.*)$/m, (z, h) => { const roh = h.replace(/\\(.)/g, "$1"); return hatKennwort(roh) ? "> **Aus ILIAS:** " + mdText(pfadOhneKennwort(roh)) : z; });
    const tresorSaeubern = async (b) => {
      if ((lokal(L.migration) || 0) >= MIGRATION) return;
      let n = 0;
      for (const name of io.unterordner(ZIEL)) {
        if (!hatKennwort(name) || !io.umbenennen) continue;
        const basisName = sauber(ohneKennwort(name)) || "ILIAS";
        let neu = basisName, i = 2;
        while (io.existiert(ZIEL + "/" + neu)) neu = basisName + " " + i++;
        await io.umbenennen(ZIEL + "/" + name, ZIEL + "/" + neu);
        await umbenannt(ZIEL + "/" + neu, ZIEL + "/" + name);
        n++;
      }
      const notizen = {};
      for (const id of Object.keys(mem.dateien)) {
        const d = mem.dateien[id];
        for (const p of [d.pfad].concat(Array.isArray(d.fassungen) ? d.fassungen : [])) if (p) notizen[notizPfad(p)] = true;
      }
      for (const p of Object.keys(notizen)) {
        const alt = io.existiert(p) ? await io.lesenText(p) : null;
        if (alt == null) continue;
        const neu = notizSaeubern(alt);
        if (neu !== alt) { await io.schreibenText(p, neu); n++; }
      }
      await speichern();
      lokal(L.migration, MIGRATION);
      if (n) b.gesaeubert = n;
    };

    // ----- Durchsuchen: Tiefensuche durch Ordner, Sitzungen, Gruppen → Kandidaten (neu, geändert) -----
    // Was mit einer gefundenen Datei zu tun ist: "geaendert", "neu" oder "" (da und unverändert, von dir gelöscht, schon als zu
    // groß gemerkt). Gilt auch für Funde eines früheren Laufs: inzwischen geladene fallen so weg.
    const artFuer = (c) => {
      const d = mem.dateien[c.id];
      if (d) {
        if (d.geloescht) return ""; // gelöscht bleibt gelöscht
        const anders = (c.geaendert && d.geaendert && c.geaendert !== d.geaendert) || (c.lg != null && d.iliasGroesse != null && c.lg !== d.iliasGroesse);
        return anders ? "geaendert" : "";
      }
      const x = mem.ignoriert[c.id];
      return x && x.geaendert === c.geaendert && x.iliasGroesse === c.lg ? "" : "neu"; // schon geprüft, unverändert
    };
    // Funde (gerätelokal, eba-ilias-funde): Kandidaten, die noch nicht geladen sind, nach jedem durchsuchten Kurs gespeichert.
    // Ein Lauf, der abbricht (iPhone/iPad halten Obsidian im Hintergrund an), muss die fertigen Kurse so nicht noch einmal
    // durchsuchen. Vom ILIAS-Eintrag nur, was der Download braucht. Ein gestoppter oder verworfener Lauf schreibt keine.
    // Leer heißt [] (alles geladen); null heißt unbekannt (Trennen, ältere Fassung), siehe lauf.
    const fundAus = (c) => {
      const e = c.eintrag || {};
      return { id: c.id, eintrag: { art: e.art, typ: e.typ, refId: e.refId, id: e.id, url: e.url, endung: e.endung }, kurs: c.kurs, code: c.code,
        ordner: c.ordner, original: c.original, endung: c.endung, geaendert: c.geaendert, lg: c.lg, iliasPfad: c.iliasPfad, art: c.art };
    };
    const fundeSpeichern = (r, liste) => { if (!r.stopp.an) lokal(L.funde, liste.map(fundAus)); };
    const fundeLesen = () => {
      const f = lokal(L.funde);
      // Funde aus einer älteren Fassung tragen den rohen Kurstitel: beim Lesen säubern (Kurs, Ordner, ILIAS-Pfad)
      return (Array.isArray(f) ? f.filter((c) => c && typeof c.id === "string" && c.kurs && c.kurs.refId != null && c.eintrag && Array.isArray(c.ordner)) : [])
        .map((c) => {
          const ersatz = c.kurs.code || "Kurs " + c.kurs.refId;
          return Object.assign({}, c, { kurs: Object.assign({}, c.kurs, { titel: ohneKennwort(c.kurs.titel) || ersatz }),
            ordner: c.ordner.map((o) => ohneKennwort(o) || "Ordner"), iliasPfad: pfadOhneKennwort(c.iliasPfad, ersatz) });
        });
    };
    const dateiPruefen = (q, e, k, kurs, kandidaten, b, r) => {
      // Kennung: ref_id; Dateilisten in Inhaltsseiten haben nur eine file_id (eigener Zahlenraum → „f“ davor)
      const id = e.refId != null && e.refId !== "" ? String(e.refId) : e.id != null && e.id !== "" ? "f" + e.id : "";
      if (!id) { plus(b, kurs.refId, "uebersprungen"); return; }
      let original = "";
      try { original = q.name ? q.name(e) : ""; } catch (x) { original = ""; }
      original = textRein(original || e.dateiname || "") || textRein(e.titel);
      const endung = String(e.endung || "").toLowerCase().replace(/^\./, "") || endungVon(original);
      if (endung && endungVon(original) !== endung) original = original + "." + endung; // ILIAS zeigt oft nur den Titel
      if (VIDEO.indexOf(endung) >= 0) { plus(b, kurs.refId, "videos"); return; }
      if (!/^[a-z0-9]{1,8}$/.test(endung) || NIE.indexOf(endung) >= 0) { plus(b, kurs.refId, "uebersprungen"); return; }
      const geaendert = e.geaendert ? String(e.geaendert) : "";
      const lg = typeof e.groesse === "number" && isFinite(e.groesse) && e.groesse >= 0 ? Math.round(e.groesse) : null;
      if (r.imLauf[id]) return; // dieselbe Datei an zwei Stellen im Kurs
      const c = { id, eintrag: e, kurs, code: k.code, ordner: k.pfad, original, endung, geaendert, lg, reihe: kandidaten.length, iliasPfad: [kurs.titel].concat(k.anzeige).join(" / ") };
      c.art = artFuer(c);
      if (!c.art) return;
      if (c.art === "neu" && lg != null && lg > MAX_MB * 1048576) {
        setzen("ignoriert", id, { grund: "zu groß", groesse: lg, geaendert, iliasGroesse: lg, original, iliasPfad: c.iliasPfad });
        plus(b, kurs.refId, "zuGross");
        return;
      }
      kandidaten.push(c); r.imLauf[id] = true;
    };
    // → true, wenn der Kurs ganz durchsucht ist; false, wenn das Anfragen-Budget vorher endete (nächster Lauf beginnt mit ihm)
    const durchsuchen = async (q, kurs, kandidaten, b, r, o, darf) => {
      const stapel = [{ url: kurs.url, refId: kurs.refId, titel: kurs.titel, pfad: [], anzeige: [], code: kurs.code, tiefe: 0 }];
      const gesehen = {};
      while (stapel.length) {
        halt(r);
        if (!darf()) return false;
        const k = stapel.pop();
        const sch = String(k.refId || k.url || "");
        if (!sch || gesehen[sch]) continue;
        gesehen[sch] = true;
        fort(o, { phase: "durchsuchen", code: kurs.code || "", erledigt: r.kursNr || 0, gesamt: r.kurseGesamt || 0 });
        let liste;
        try { liste = await anfrage(b, r, () => q.inhalt({ url: k.url, refId: k.refId, titel: k.titel })); }
        catch (e) {
          if (!einzeln(e)) throw e;
          plus(b, kurs.refId, "ordnerFehler"); // kein Zugriff, Serverfehler bei diesem einen Objekt: überspringen
          // kein Zugriff (403/404, z. B. fremde Tutoriumsgruppen) ist normal; nur Serverfehler zählen bis zum Abbruch
          if (Number(e.status) >= 500 && ++r.ordnerFehler >= ORDNER_FEHLER_MAX) throw fehlerArt("ordner", `${r.ordnerFehler} Ordner ließen sich nicht lesen (zuletzt HTTP ${e.status}).`);
          continue;
        }
        liste = (Array.isArray(liste) ? liste : []).filter((e) => e && typeof e === "object");
        // Sitzungen: Stehen ihre Materialien auf der Kursseite schon aufgeklappt (Feld inSitzung), wird die Sitzung nicht
        // einzeln geholt (spart je Sitzung eine Anfrage); die Dateien bekommen den Sitzungsnamen als Ordner. Sitzungen ohne
        // aufgeklappte Materialien werden geholt (sie könnten eingeklappt sein).
        // Ordnername zweimal: für den Einordner dateinamentauglich (pfad), für Notiz und Index lesbar (anzeige)
        const lesbar = (e) => ohneKennwort((e.sitzung && e.sitzung.name) || e.titel) || "Ordner";
        // für den Einordner: Name wie in ILIAS (unterlagen.js erkennt z. B. „2026-10-12, 10:15 …“ als Sitzung), nur ohne „/“
        const segment = (t) => t.replace(/\//g, "-");
        const grenze = tagIso(ms() + SITZUNG_VORAUS_TAGE * 864e5);
        const sitzungen = {}, aufgeklappt = {};
        for (const e of liste) if (e.art === "sitzung" && e.refId) sitzungen[String(e.refId)] = lesbar(e);
        for (const e of liste) if (e.inSitzung) aufgeklappt[String(e.inSitzung)] = true;
        const unter = [];
        for (const e of liste) {
          const art = String(e.art || "");
          // Gruppe in Kurs oder Ordner: Code des Behälters und Zeitfenster merken (Titel und Beschreibung nur hier im Speicher)
          if (e.typ === "grp" && e.refId && r.gruppenGesehen) r.gruppenGesehen[String(e.refId)] = { code: k.code || "", kurs: kurs.refId, slot: gruppenSlot(e), name: gruppenNameAus(e.titel) };
          if (BEHAELTER.indexOf(art) >= 0) {
            if (!e.url || k.tiefe >= TIEFE_MAX || (art === "sitzung" && aufgeklappt[String(e.refId)])) continue;
            const tag = art === "sitzung" && e.sitzung && e.sitzung.datum ? String(e.sitzung.datum).slice(0, 10) : "";
            if (tag && tag > grenze) { plus(b, kurs.refId, "spaeter"); continue; }
            const titel = textRein(e.titel);
            const c = codeAm(titel); // Unterordner „SQ888 …“ im Kurs S100 → Modul SQ888
            unter.push({ url: e.url, refId: e.refId != null ? String(e.refId) : "", titel, pfad: k.pfad.concat([segment(lesbar(e))]), anzeige: k.anzeige.concat([lesbar(e)]), code: c && abh.modul(c) ? c : k.code, tiefe: k.tiefe + 1 });
          } else if (art === "video") plus(b, kurs.refId, "videos");
          else if (art === "datei") {
            const s = e.inSitzung ? sitzungen[String(e.inSitzung)] : "";
            dateiPruefen(q, e, s ? Object.assign({}, k, { pfad: k.pfad.concat([segment(s)]), anzeige: k.anzeige.concat([s]) }) : k, kurs, kandidaten, b, r);
          }
        }
        for (let i = unter.length - 1; i >= 0; i--) stapel.push(unter[i]);
      }
      return true;
    };

    // ----- Ablage -----
    // → { art, nr, titel, name, code }; code: Modulcode aus Dateiname oder Unterordner (unterlagen.js), wenn es das Modul gibt
    const benennen = async (c, bytes, E, mitPdf) => {
      const rel = c.ordner.concat([c.original.replace(/\//g, "-") || "Datei." + c.endung]).join("/");
      const pdf = mitPdf && c.endung === "pdf" && bytes.length <= PDF_TITEL_MAX_MB * 1048576 ? bytes : null;
      let v = null;
      try { v = await E.vorschlag(rel, c.endung, c.code, pdf); } catch (e) { v = null; }
      v = v || {};
      const code = v.code && v.code !== c.code && abh.modul(v.code) ? String(v.code) : c.code;
      const art = v.art || "Sonstiges", nr = v.nr == null ? null : v.nr;
      const titel = sauber(v.titel || "");
      let name = "";
      try { name = E.zielName(code, art, nr, titel); } catch (e) { name = ""; }
      name = sauber(name) || sauber(ohneEndung(c.original)) || "Unterlage " + heute();
      return { art, nr, titel, name, code };
    };
    // Ordner wie unterlagen.js: vorhandener „Unterlagen/<Code> …“, sonst „<Code> <Modultitel>“; ohne Code der Kurstitel.
    // Hat der Modulordner „Vorlesung“/„Übung“, kommt die Datei je nach Art dorthin.
    const zielOrdner = (code, kurs, art) => {
      let o;
      if (code) {
        const da = io.unterordner(ZIEL).filter((n) => n === code || n.indexOf(code + " ") === 0).sort()[0];
        if (da) o = ZIEL + "/" + da;
        else {
          const m = abh.modul(code);
          const titel = m ? m.titel : String(kurs.titel || "").replace(CODE_ANFANG, "");
          o = ZIEL + "/" + (sauber(code + " " + fuellWeg(kuerzen(sauber(titel), ORDNER_TITEL_MAX).replace(/[,;:]+$/, ""))) || code);
        }
      } else o = ZIEL + "/" + (sauber(kuerzen(sauber(kurs.titel), ORDNER_TITEL_MAX)) || "ILIAS");
      const unter = { Folien: "Vorlesung", Skript: "Vorlesung", Mitschrift: "Vorlesung", "Übung": "Übung", "Lösung": "Übung", "Eigene Lösung": "Übung" }[art];
      if (unter && io.unterordner(o).indexOf(unter) >= 0) o += "/" + unter;
      return o;
    };
    // Nie überschreiben: Datei und Notiz müssen frei sein, sonst „ (2)“, „ (3)“ …
    const freierName = (ordner, stem, endung) => {
      const frei = (n) => !io.existiert(`${ordner}/${n}.${endung}`) && !io.existiert(`${ordner}/${n}.md`);
      let name = stem, i = 2;
      while (!frei(name)) name = `${stem} (${i++})`;
      return name;
    };
    const notizBauen = (E, d) => {
      let text = null;
      if (E.begleitnotiz) { try { text = E.begleitnotiz(d); } catch (e) { text = null; } }
      if (typeof text !== "string" || !text) text = notizText(d);
      else if (d.hinweis && text.indexOf(d.hinweis) < 0) text = text.replace(/^## Das Wichtigste/m, () => "> [!eba-info] Neue Fassung aus ILIAS\n> " + d.hinweis + "\n\n## Das Wichtigste");
      return pflichtfelder(text, { typ: "unterlage", original: J(d.original), quelle: J(d.quelle), ilias_id: J(d.iliasId), uebersicht: '"[[Unterlagen]]"' });
    };
    const notizDaten = (c, plan, datei, groesse, hinweis) => {
      const code = plan.code != null ? plan.code : c.code;
      const m = code ? abh.modul(code) : null;
      return {
        code, modul: m ? m.name : "", art: plan.art, nr: plan.nr, titel: plan.titel, datei, endung: c.endung, groesse,
        original: c.original, quelle: "ILIAS: " + c.iliasPfad, herkunft: c.iliasPfad + " / " + c.original, iliasId: c.id,
        semester: abh.semester ? abh.semester() : "", datum: heute(), hinweis: hinweis || "",
      };
    };
    // Schreiben über einen Absturz hinweg (iPhone/iPad beenden Obsidian im Hintergrund jederzeit): Vor dem Schreiben merkt sich
    // das Gerät { id, pfad, art } (eba-ilias-schreibt), nach dem Index ist es wieder leer. Steht beim nächsten Lauf noch etwas da,
    // räumt nachAbbruch auf: eine neue Datei (und ihre Notiz), die nicht im Index steht, war unfertig und wird gelöscht und neu
    // geladen (sonst bliebe sie halb und daneben käme „ (2)“); eine halb ersetzte gilt als unverändert (Prüfsumme im Index), damit
    // der nächste Abruf sie ersetzt statt sie für deine Änderung zu halten.
    const schreibtSetzen = (x) => lokal(L.schreibt, x);
    const nachAbbruch = async (r) => {
      const s = lokal(L.schreibt);
      if (!s || typeof s.pfad !== "string" || !s.pfad) { if (s) schreibtSetzen(null); return; }
      const d = s.id ? mem.dateien[s.id] : null;
      if (s.art === "neu" && !(d && d.pfad === s.pfad)) {
        for (const p of [s.pfad, notizPfad(s.pfad)]) if (io.existiert(p)) await io.loeschen(p);
      } else if (s.art === "ersetzen" && d && d.pfad === s.pfad && io.existiert(s.pfad)) {
        const by = await io.lesenBinaer(s.pfad);
        const h = by ? await sha256(by) : "";
        if (h && h !== d.sha256) { setzen("dateien", s.id, { sha256: h, groesse: by.length }); await speichern(); }
        r.hashes[s.pfad] = h;
      }
      schreibtSetzen(null);
    };
    // Datei + Notiz anlegen; scheitert die Notiz, wird die Datei wieder entfernt (keine Datei ohne Notiz und Index)
    const mitNotiz = async (pfad, bytes, notiz) => {
      await io.ordnerAnlegen(elternVon(pfad));
      await io.anlegenBinaer(pfad, bytes);
      try { await io.anlegenText(notizPfad(pfad), notiz); }
      catch (e) { try { await io.loeschen(pfad); } catch (x) { /* bleibt; nächster Lauf findet sie als gleiche Datei */ } throw e; }
    };
    const zuGrossMerken = (c, groesse, b) => { setzen("ignoriert", c.id, { grund: "zu groß", groesse, geaendert: c.geaendert, iliasGroesse: c.lg, original: c.original, iliasPfad: c.iliasPfad }); plus(b, c.kurs.refId, "zuGross"); };

    const neuAblegen = async (c, bytes, b, r, E) => {
      if (bytes.length > MAX_MB * 1048576) { zuGrossMerken(c, bytes.length, b); await speichern(); return; }
      const sha = await sha256(bytes);
      const basis = { sha256: sha, groesse: bytes.length, geaendert: c.geaendert, iliasGroesse: c.lg, original: c.original, iliasPfad: c.iliasPfad, kurs: c.kurs.refId, seit: heute() };
      const gleich = await gleicheDatei(r, unterlagen(r), bytes.length, sha);
      if (gleich) { setzen("dateien", c.id, Object.assign(basis, { pfad: gleich, wie: "vorhanden" })); plus(b, c.kurs.refId, "vorhanden"); await speichern(); return; }
      const plan = await benennen(c, bytes, E, true);
      const ordner = zielOrdner(plan.code, c.kurs, plan.art);
      const stem = freierName(ordner, plan.name, c.endung);
      const pfad = `${ordner}/${stem}.${c.endung}`;
      schreibtSetzen({ id: c.id, pfad, art: "neu" });
      await mitNotiz(pfad, bytes, notizBauen(E, notizDaten(c, plan, `${stem}.${c.endung}`, bytes.length)));
      unterlagen(r).push({ pfad, groesse: bytes.length });
      r.hashes[pfad] = sha;
      setzen("dateien", c.id, Object.assign(basis, { pfad, wie: "neu" }));
      plus(b, c.kurs.refId, "neu"); b.angelegt.push(pfad);
      await speichern();
      schreibtSetzen(null);
    };

    const aktualisieren = async (c, bytes, b, r, E) => {
      const d0 = mem.dateien[c.id];
      const merken = (x) => setzen("dateien", c.id, Object.assign({ geaendert: c.geaendert, iliasGroesse: c.lg }, x));
      if (bytes.length > MAX_MB * 1048576) { zuGrossMerken(c, bytes.length, b); merken({}); await speichern(); return; }
      const sha = await sha256(bytes);
      if (sha === d0.sha256) { merken({}); plus(b, c.kurs.refId, "gleich"); await speichern(); return; } // nur die Angaben in ILIAS haben sich geändert
      let pfad = d0.pfad;
      if (!pfad || !io.existiert(pfad)) {
        const da = d0.sha256 && d0.groesse ? await gleicheDatei(r, io.dateien(""), d0.groesse, d0.sha256) : null;
        if (!da) { setzen("dateien", c.id, { geloescht: true, geloeschtAm: heute() }); plus(b, c.kurs.refId, "geloescht"); await speichern(); return; }
        pfad = da;
        setzen("dateien", c.id, { pfad });
      }
      const ist = await hashVon(r, pfad);
      const datum = heute();
      if (ist === d0.sha256) {
        // unverändert im Tresor → ersetzen; Index sofort, die Markierung der Notiz ist Nebensache
        schreibtSetzen({ id: c.id, pfad, art: "ersetzen" });
        await io.ersetzenBinaer(pfad, bytes);
        r.hashes[pfad] = sha;
        merken({ pfad, sha256: sha, groesse: bytes.length, aktualisiert: datum });
        plus(b, c.kurs.refId, "ersetzt"); b.ersetztePfade.push(pfad);
        await speichern();
        schreibtSetzen(null);
        try { await io.notizMarkieren(notizPfad(pfad), { aktualisiert: datum }); } catch (e) { /* Notiz fehlt oder ist nicht unsere */ }
        return;
      }
      if (ist === sha) { merken({ sha256: sha, groesse: bytes.length }); plus(b, c.kurs.refId, "gleich"); await speichern(); return; } // hast du schon
      // Von dir verändert: deine Datei bleibt, die neue Fassung kommt daneben
      const ordner = elternVon(pfad), stem = ohneEndung(nameVon(pfad)), endung = endungVon(pfad) || c.endung;
      const basisName = `${stem} neue Fassung ${datum}`;
      const vorne = ordner ? ordner + "/" : "";
      let name = basisName, i = 2;
      while (io.existiert(`${vorne}${name}.${endung}`) || io.existiert(`${vorne}${name}.md`)) name = `${basisName} (${i++})`;
      const neuPfad = `${vorne}${name}.${endung}`;
      const plan = await benennen(c, bytes, E, false);
      schreibtSetzen({ id: c.id, pfad: neuPfad, art: "neu" });
      const hinweis = `Deine veränderte Datei [[${nameVon(pfad)}]] bleibt, wie sie ist. Dies ist die neue Fassung aus ILIAS vom ${datum.slice(8, 10)}.${datum.slice(5, 7)}.${datum.slice(0, 4)}.`;
      await mitNotiz(neuPfad, bytes, notizBauen(E, notizDaten(c, plan, `${name}.${endung}`, bytes.length, hinweis)));
      r.hashes[neuPfad] = sha;
      merken({ pfad, sha256: sha, groesse: bytes.length, aktualisiert: datum, fassungen: (Array.isArray(d0.fassungen) ? d0.fassungen : []).concat([neuPfad]) });
      plus(b, c.kurs.refId, "fassungen"); b.angelegt.push(neuPfad);
      await speichern();
      schreibtSetzen(null);
    };

    // ----- Ein Lauf -----
    const neuerBericht = () => ({ art: "ok", neu: 0, vorhanden: 0, ersetzt: 0, fassungen: 0, gleich: 0, geloescht: 0, zuGross: 0, videos: 0, uebersprungen: 0, rest: 0, kurseOffen: 0, geladen: 0, anfragen: 0, angelegt: [], ersetztePfade: [], fehlerDateien: [], jeKurs: {}, warnung: "", fehler: "", grund: "", kurse: null, gruppen: null });
    const lauf = async (o, b, stopp) => {
      // Eigener Uni-Abgleich (Dateien kommen von dort): mit ILIAS-Zugang nur Mitgliedschaften und Gruppen-Notizen, nie Downloads
      const nurGruppen = extern();
      if (nurGruppen && !(anmeldung() && hatZugang())) { b.art = "extern"; return; }
      const f = anmeldung();
      if (!f) { b.art = "ohne-anmeldung"; return; }
      if (!hatZugang()) { b.art = "ohne-zugang"; return; }
      if (stand().gesperrt && !o.manuell) { b.art = "gesperrt"; return; }
      // vor der Sperre: ein Gerät ohne nutzbares Kennwort darf die anderen nicht aufhalten
      if (!geheimLesen()) throw fehlerArt("zugang", "Das Kennwort fehlt auf diesem Gerät. Bitte ILIAS neu verbinden.");
      if (!o.nurKurse) {
        // Abrufer-Sperre: ein anderes Gerät war vor kurzem aktiv → nichts tun (außer du übernimmst ausdrücklich)
        const ich = abh.geraetId();
        const a = await sperreLesen();
        if (a && a.geraet !== ich && alter(a.zuletzt) <= UEBERNAHME && !o.uebernehmen) {
          b.art = "anderes-geraet";
          standSetzen({ abrufer: false, anderes: iso() });
          try { await indexLesen(); } catch (e) { /* nur für die Anzeige (Zahl der Dateien) */ }
          return;
        }
        if (!a || a.geraet !== ich || alter(a.zuletzt) >= PULS) await sperreSchreiben({ geraet: ich, seit: a && a.geraet === ich && a.seit ? a.seit : iso(), zuletzt: iso() });
        standSetzen({ abrufer: true, anderes: "" });
      }
      standSetzen({ versucht: iso() });
      const geheimId = abh.geheimId();
      // Das Kennwort holt erst die Anmeldung, unmittelbar vor dem Absenden (kennwortGeber); dieses Skript hält es nicht fest
      const zugang = { benutzer: benutzer(), kennwortGeber: () => abh.geheim.lesen(geheimId) || "" };
      const r = { letzte: 0, hashes: {}, unterlagen: null, imLauf: {}, ordnerFehler: 0, stopp, gruppenGesehen: {} };
      await indexLesen();
      if (!o.nurKurse && !nurGruppen) {
        await nachAbbruch(r); await nachziehen(b, r);
        try { await tresorSaeubern(b); } catch (e) { b.warnung = (b.warnung ? b.warnung + " " : "") + "Säubern: " + fehlerText(e); }
      }
      fort(o, { phase: "anmelden" });
      const q = await anfrage(b, r, () => abh.quelle(zugang, anmeldenMit(f)));
      fort(o, { phase: "kurse" });
      // Eine Anfrage für Kurse und Gruppen (Seite „Meine Kurse und Gruppen“); von Gruppen bleibt nur das Zeitfenster
      const seite = await anfrage(b, r, () => (q.mitgliedschaften ? q.mitgliedschaften() : q.kurse()));
      const roh = Array.isArray(seite) ? seite : (seite && seite.kurse) || [];
      const gruppenRoh = seite && !Array.isArray(seite) && Array.isArray(seite.gruppen)
        ? seite.gruppen.filter((g) => g && g.refId).map((g) => ({ refId: String(g.refId), url: g.url, slot: gruppenSlot(g), name: gruppenNameAus(g.titel) })) : null;
      if (!Array.isArray(roh) || !roh.length) throw fehlerArt("kurse", "Keine Kurse gefunden. Hat sich die ILIAS-Seite geändert?");
      const liste = kurseUebernehmen(roh);
      await speichern();
      if (o.nurKurse && !nurGruppen) { b.art = "kurse"; b.kurse = kurseListe(); return; }
      if (nurGruppen) { await gruppenAbgleichen(b, r, q, gruppenRoh, () => b.anfragen < ANFRAGEN); b.art = "nur-gruppen"; return; }

      // 1. Durchsuchen (älteste zuerst; das Budget für Downloads bleibt frei)
      const E = abh.einordner();
      // Grenzen je Lauf; abh.grenzen ({ neu, anfragen }) nur für Probeläufe und Tests
      const G = abh.grenzen || {};
      const kappe = G.neu || (abh.mobil ? NEU_MOBIL : NEU_PC), budget = G.anfragen || ANFRAGEN;
      const kursZeit = Object.assign({}, stand().kursZeit), kursFertig = Object.assign({}, stand().kursFertig);
      // Der Knopf durchsucht alle Kurse; automatische und fortgesetzte Läufe nur die, die nicht vor kurzem ganz durchsucht wurden.
      // Fortgesetzte ohne gemerkte Funde (Update mitten im Abruf) durchsuchen alle, sonst fehlten deren Dateien.
      const alle = !!o.manuell && (!o.weiter || !Array.isArray(lokal(L.funde)));
      const aktive = liste.filter((k) => kursAn(k.refId) && (alle || alter(kursFertig[k.refId]) >= KURS_PAUSE))
        .sort((x, y) => vergleich(String(kursZeit[x.refId] || ""), String(kursZeit[y.refId] || "")));
      // Funde früherer Läufe aus den übrigen Kursen, soweit noch zu laden; die neu durchsuchten Kurse liefern frische
      const frisch = {}, bekannt = {};
      for (const k of aktive) frisch[k.refId] = true;
      for (const k of liste) bekannt[k.refId] = true;
      const kandidaten = [], fertig = [];
      for (const c of fundeLesen()) {
        const kurs = String(c.kurs.refId);
        if (!bekannt[kurs] || frisch[kurs] || !kursAn(kurs) || r.imLauf[c.id]) continue;
        c.art = artFuer(c);
        if (c.art) { c.reihe = kandidaten.length; kandidaten.push(c); r.imLauf[c.id] = true; }
      }
      const darf = () => b.anfragen < budget - kappe;
      r.kurseGesamt = aktive.length;
      for (let i = 0; i < aktive.length; i++) {
        const k = aktive[i];
        r.kursNr = i;
        if (!kursAn(k.refId)) continue; // während des Laufs abgewählt
        kursZeit[k.refId] = iso(); // auch angefangene: der nächste Lauf beginnt mit den anderen (keiner verhungert)
        if (!(await durchsuchen(q, k, kandidaten, b, r, o, darf))) break;
        fertig.push(k.refId);
        kursFertig[k.refId] = iso();
        // nach jedem Kurs: bricht der Lauf ab, durchsucht der nächste diesen Kurs nicht noch einmal
        standSetzen({ kursZeit, kursFertig });
        fundeSpeichern(r, kandidaten);
      }
      standSetzen({ kursZeit, kursFertig });
      fundeSpeichern(r, kandidaten);
      await speichern(); // ignoriert (zu groß)

      // 1b. Gruppen in den Stundenplan; ein Fehler hier hält die Unterlagen nicht an
      try { await gruppenAbgleichen(b, r, q, gruppenRoh, darf); }
      catch (e) {
        if (e && e.art === "abbruch") throw e;
        b.warnung = (b.warnung ? b.warnung + " " : "") + "Gruppen: " + fehlerText(e);
      }

      // 2. Laden: geänderte zuerst, dann neue, je neueste zuerst; der Rest im nächsten Lauf
      kandidaten.sort((x, y) => (x.art === y.art ? 0 : x.art === "geaendert" ? -1 : 1) || vergleich(y.geaendert, x.geaendert) || x.reihe - y.reihe);
      b.kurseOffen = aktive.filter((k) => kursAn(k.refId) && fertig.indexOf(k.refId) < 0).length;
      const geaenderteKurse = {};
      let n = 0, fehlerN = 0;
      // Zähler über die Stapel eines Auftrags: schon geladene + alle, die jetzt noch fehlen (auch über der Grenze)
      const vorher = o.weiter ? ((auftrag() || {}).geladen || 0) : 0;
      const gesamt = vorher + kandidaten.length;
      for (const c of kandidaten) {
        halt(r);
        if (!kursAn(c.kurs.refId)) continue; // während des Laufs abgewählt
        if (n >= kappe || b.anfragen >= budget) { plus(b, c.kurs.refId, "rest"); continue; }
        fort(o, { phase: "laden", code: c.code || "", erledigt: vorher + n, gesamt });
        n++; b.geladen = n;
        let bytes = null;
        try {
          bytes = bytesAus(await anfrage(b, r, () => q.laden(c.eintrag)));
          halt(r); // verworfen, während die Datei kam
          if (!bytes) throw fehlerArt("datei", "leere Antwort");
        } catch (e) {
          if (!einzeln(e)) throw e;
          fehlerN++;
          b.fehlerDateien.push(c.original);
          plus(b, c.kurs.refId, "fehler");
          if (fehlerN >= FEHLER_MAX) throw fehlerArt("dateien", `${fehlerN} Dateien ließen sich nicht laden (zuletzt ${c.original}).`);
          continue;
        }
        if (c.art === "neu") await neuAblegen(c, bytes, b, r, E); else await aktualisieren(c, bytes, b, r, E);
        geaenderteKurse[c.kurs.refId] = true;
      }
      // was noch fehlt (Grenze je Lauf, einzelne Fehler), lädt der nächste Lauf ohne neues Durchsuchen
      fundeSpeichern(r, kandidaten.filter((c) => kursAn(c.kurs.refId) && artFuer(c)));
      // „zuletzt“ je Kurs (synchronisiert) nur bei Änderungen oder spätestens nach einem Tag schreiben (Sync-Verkehr)
      for (const id of fertig) { const k = mem.kurse[id]; if (k && (geaenderteKurse[id] || alter(k.zuletzt) > KURS_ZULETZT)) setzen("kurse", id, { zuletzt: iso() }); }
      await speichern();
      if (!b.neu && !b.ersetzt && !b.fassungen) b.art = "unveraendert";
    };

    // weiterIn: offener Auftrag geht von selbst weiter (naechsterSchritt)
    const meldungText = (b, weiterIn) => {
      const n = b.neu + b.fassungen;
      const gleich = weiterIn != null;
      switch (b.art) {
        case "extern": return "ILIAS-Unterlagen kommen über deinen Uni-Abgleich.";
        case "nur-gruppen": {
          const g = b.gruppen ? b.gruppen.neu : 0;
          return "ILIAS: Übungsgruppen geprüft." + (g ? g === 1 ? " Deine Übungsgruppe steht jetzt im Stundenplan." : ` ${g} Übungsgruppen stehen jetzt im Stundenplan.` : "");
        }
        case "ohne-anmeldung": return TEXT_ANMELDUNG_FOLGT + ".";
        case "ohne-zugang": return "ILIAS ist auf diesem Gerät nicht verbunden.";
        case "anderes-geraet": return "Ein anderes Gerät lädt gerade deine ILIAS-Unterlagen. Sie kommen über deinen Sync.";
        case "zugang": return "ILIAS: " + b.fehler;
        case "fehler": return "ILIAS: Fehler beim Abruf. " + b.fehler + (gleich ? ` Neuer Versuch in ${Math.round(weiterIn / MIN)} Min.` : "");
        case "abgebrochen": return b.grund === "stopp" ? "ILIAS: gestoppt." : "ILIAS: Abruf abgebrochen.";
        case "kurse": return "ILIAS: Kursliste aktualisiert.";
        default: {
          const t = [n ? `ILIAS: ${n} neue ${n === 1 ? "Datei" : "Dateien"} in Unterlagen.` : b.ersetzt ? "ILIAS:" : "ILIAS: keine neuen Dateien."];
          if (b.ersetzt) t.push(`${b.ersetzt} ${b.ersetzt === 1 ? "Datei" : "Dateien"} aktualisiert.`);
          if (b.rest) t.push(gleich ? `${b.rest} weitere folgen gleich.` : `${b.rest} weitere beim nächsten Abruf.`);
          const g = b.gruppen ? b.gruppen.neu : 0;
          if (g) t.push(g === 1 ? "Deine Übungsgruppe steht jetzt im Stundenplan." : `${g} Übungsgruppen stehen jetzt im Stundenplan.`);
          return t.join(" ");
        }
      }
    };
    const nachLauf = (b, beginn, t0) => {
      if (b.art === "fehler" || b.art === "zugang") standSetzen({ fehler: b.fehler, fehlerZeit: iso(), gesperrt: b.art === "zugang" ? true : stand().gesperrt });
      else if (b.art === "nur-gruppen") standSetzen({ zuletzt: iso(), fehler: "", fehlerZeit: "" });
      else if (b.art === "ok" || b.art === "unveraendert") standSetzen(Object.assign({ zuletzt: iso(), fehler: "", fehlerZeit: "", neu: b.neu + b.fassungen, rest: b.rest }, zaehlen()));
      if (["extern", "ohne-anmeldung", "ohne-zugang", "gesperrt"].indexOf(b.art) < 0) {
        const e = { zeit: beginn, art: b.art, dauer: Math.round((ms() - t0) / 1000), anfragen: b.anfragen, neu: b.neu, vorhanden: b.vorhanden, ersetzt: b.ersetzt, fassungen: b.fassungen, zuGross: b.zuGross, rest: b.rest };
        if (b.geloescht) e.geloescht = b.geloescht;
        if (b.fehler) e.fehler = b.fehler;
        if (b.warnung) e.warnung = b.warnung;
        lokal(L.protokoll, protokoll().concat([e]).slice(-PROTOKOLL_MAX));
      }
    };

    // o: { manuell (Knopf: Hinweis zum Ergebnis, auch nach abgelehnter Anmeldung), uebernehmen (Abrufer-Sperre übergehen),
    //      nurKurse (nur anmelden und Kursliste holen), weiter (setzt einen offenen Auftrag fort), fortschritt(x) }
    // Ereignisse: start { manuell, weiter }, fortschritt (fort), fertig { manuell, ergebnis (b.art), text (Hinweis), weiterIn }.
    // Ein Knopf während eines automatischen Laufs macht ihn zu seinem (Fortschritt, Hinweis, Auftrag) und meldet start erneut.
    // Auftrag: Ein Knopf (manuell, nicht weiter) legt ihn neu an; nach dem Lauf entscheidet naechsterSchritt, ob und wann es
    // weitergeht (die Oberfläche plant das über weiterIn). stoppen() beendet ihn, verwerfen() gibt einen toten Lauf auf.
    let laeuft = null, laufO = null, stopp = null;
    const auftragNeu = () => lokal(L.auftrag, { seit: iso(), versuche: 0, stapel: 0, geladen: 0 });
    const jetztHolen = (o) => {
      o = o || {};
      if (laeuft) {
        if (o.manuell) {
          if (!auftrag()) auftragNeu();
          laufO.manuell = true;
          melden({ art: "start", manuell: true, weiter: !!laufO.weiter });
        }
        return laeuft;
      }
      if (o.manuell && (!o.weiter || !auftrag())) auftragNeu();
      const meins = stopp = { an: false, grund: "" };
      laufO = o;
      letzter = null; regung = ms();
      laeuft = (async () => {
        const b = neuerBericht(), t0 = ms(), beginn = iso();
        try { await lauf(o, b, meins); }
        catch (e) {
          const art = (e && e.art) || "";
          b.art = art === "zugang" ? "zugang" : art === "abbruch" ? "abgebrochen" : "fehler";
          b.grund = art === "abbruch" ? meins.grund : (e && e.grund) || "";
          b.fehler = fehlerText(e);
          try { console.warn("ilias: " + b.fehler); } catch (x) { /* egal */ }
        }
        if (stopp !== meins) return b; // verworfen: ein neuer Lauf hat übernommen
        try { nachLauf(b, beginn, t0); } catch (e) { /* Stand ist Nebensache */ }
        let weiterIn = null;
        const a = auftrag();
        if (a) { const n = naechsterSchritt(a, b); lokal(L.auftrag, n.auftrag); weiterIn = n.inMs; }
        laeuft = null; letzter = null; stopp = null;
        // erst fertig (Fortschritt weg), dann der Hinweis zum Ergebnis
        const text = meldungText(b, weiterIn);
        melden({ art: "fertig", manuell: !!o.manuell, ergebnis: b.art, text, weiterIn });
        if (o.manuell && meins.grund !== "trennen" && abh.melden) { try { abh.melden(text); } catch (e) { /* egal */ } }
        return b;
      })();
      // erst jetzt: Hörer sehen status().laeuft (der Lauf meldet vor seinem ersten await nichts)
      melden({ art: "start", manuell: !!o.manuell, weiter: !!o.weiter });
      return laeuft;
    };
    // Stoppen (Knopf im Hinweis oder Fenster) und Trennen: Auftrag weg, der Lauf endet beim nächsten Schritt
    const stoppen = (grund) => { lokal(L.auftrag, null); if (stopp) { stopp.an = true; stopp.grund = grund || "stopp"; } };
    // Toter Lauf (abgestorben): aufgeben, ohne auf ihn zu warten; wacht er auf, schreibt er nichts mehr. Der Auftrag bleibt.
    const verwerfen = () => {
      if (!laeuft) return;
      stopp.an = true; stopp.grund = "verworfen";
      stopp = null; laeuft = null; letzter = null;
      melden({ art: "fertig", manuell: false, ergebnis: "verworfen", text: "", weiterIn: null });
    };
    const kurseAbrufen = async () => { const b = await jetztHolen({ nurKurse: true, manuell: false }); return b.kurse || (await kurse()); };

    const status = () => {
      const s = stand(), ex = extern(), z = zaehlen(), da = !!anmeldung(), verbunden = da && hatZugang();
      let text, anderes = false; // anderes: ein anderes Gerät lädt (Oberfläche bietet „Hier laden“ an)
      if (ex && verbunden && laeuft) text = "Übungsgruppen werden geprüft …";
      else if (ex && verbunden && s.gesperrt) text = s.fehler || "Anmeldung abgelehnt. Bitte Zugang neu eingeben.";
      else if (ex && verbunden) text = "Unterlagen über deinen Uni-Abgleich, Übungsgruppen aus ILIAS" + (s.zuletzt ? ` (geprüft ${vorText(s.zuletzt, ms())})` : "") + ".";
      else if (ex) text = "über deinen Uni-Abgleich";
      else if (!da) text = TEXT_ANMELDUNG_FOLGT;
      else if (!hatZugang()) text = "Nicht verbunden.";
      else if (laeuft) text = fortschrittAnzeige(letzter).text;
      else if (s.gesperrt) text = s.fehler || "Anmeldung abgelehnt. Bitte Zugang neu eingeben.";
      else if (s.fehler) text = "Fehler beim letzten Abruf." + (s.zuletzt ? ` Zuletzt erfolgreich ${vorText(s.zuletzt, ms())}.` : "");
      else if (s.anderes && !s.abrufer) { text = "Ein anderes Gerät lädt deine ILIAS-Unterlagen. Sie kommen über deinen Sync."; anderes = true; }
      else if (s.zuletzt) text = `Aktualisiert ${vorText(s.zuletzt, ms())}.`;
      else text = "Noch nicht abgerufen.";
      if (verbunden && !ex && z.zuGross && !laeuft) text += ` ${z.zuGross} ${z.zuGross === 1 ? "Datei" : "Dateien"} über ${MAX_MB} MB nicht geladen.`;
      return {
        verbunden: !ex && verbunden, bereit: bereit(), extern: ex, gruppenZugang: ex && verbunden, laeuft: !!laeuft, zuletzt: s.zuletzt, versucht: s.versucht,
        fehler: s.fehler, gesperrt: !!s.gesperrt, neu: s.neu, rest: s.rest, dateien: z.dateien, kurse: z.kurse, zuGross: z.zuGross,
        grenzeMb: MAX_MB, abrufer: !!s.abrufer, anderes, benutzer: benutzer(), text: text.replace(/\.\./g, "."),
        fortschritt: laeuft ? fortschrittAnzeige(letzter) : null,
      };
    };

    return {
      jetztHolen, kurseAbrufen, status, stand, protokoll, zugangSpeichern, zugangLoeschen, hatZugang, bereit, kurse, kursSetzen,
      umbenannt, speichern, indexLesen, auftrag, stoppen, verwerfen, gruppenListe,
      // Alte Einträge mit Kurspasswort im Titel: nur schreiben, wenn das Säubern wirklich einen Eintrag ändert (sonst schrieben
      // nach dem Update alle Geräte die Datei gleichzeitig)
      saeubern: async () => {
        if (!io.existiert(INDEX)) return false;
        let o = null;
        try { o = JSON.parse(await io.lesenText(INDEX)); } catch (e) { return false; }
        const x = indexPruefen(o);
        if (!["kurse", "dateien", "ignoriert"].some((k) => o && o[k] && JSON.stringify(o[k]) !== JSON.stringify(x[k]))) return false;
        await indexLesen(); await speichern();
        return true;
      },
      abbrechen: () => { if (stopp) { stopp.an = true; stopp.grund = "neu-geladen"; } },
      still: () => !!laeuft && abgestorben(regung, ms()),
      get index() { return mem; },
      get laeuft() { return !!laeuft; },
      get fortschritt() { return laeuft ? letzter : null; },
    };
  };

  // ---------- Anschluss an Obsidian ----------
  const plugin = () => ctx.plugin || {};
  const modulVon = (name) => {
    const m = ctx.user && ctx.user[name];
    if (typeof m === "function") { try { return m(ctx); } catch (e) { console.warn("ilias: " + name + " nicht nutzbar"); return null; } }
    return m || null;
  };
  const lokalObs = (k, v) => {
    if (v === undefined) { try { return app.loadLocalStorage(k) || null; } catch (e) { return null; } }
    app.saveLocalStorage(k, v == null ? null : v);
    return v;
  };
  // Schlüsselbund (app.secretStorage, seit Obsidian 1.11.4): nur über diese drei Funktionen
  const geheimObs = {
    lesen: (id) => { const s = app.secretStorage; return s && typeof s.getSecret === "function" ? s.getSecret(id) : null; },
    schreiben: async (id, w) => { const s = app.secretStorage; if (!s || typeof s.setSecret !== "function") throw new Error("kein Schlüsselbund"); await s.setSecret(id, w); },
    loeschen: async (id) => { const s = app.secretStorage; if (!s) return; if (typeof s.deleteSecret === "function") await s.deleteSecret(id); else if (typeof s.setSecret === "function") await s.setSecret(id, ""); },
  };
  const geheimId = () => geheimIdAus(String((app && app.appId) || (app && app.vault && app.vault.getName && app.vault.getName()) || "tresor"));
  const geraetId = () => {
    if (ctx.zentral && typeof ctx.zentral.geraetId === "function") return ctx.zentral.geraetId();
    let id = lokalObs(L.geraet);
    if (!id || typeof id !== "string") {
      const z = new Uint8Array(6);
      crypto.getRandomValues(z);
      id = "g-" + Array.prototype.map.call(z, (x) => x.toString(16).padStart(2, "0")).join("");
      lokalObs(L.geraet, id);
    }
    return id;
  };

  // Tresor über die Obsidian-API (Pfadvergleich ohne Groß/Klein, wie das Dateisystem auf Windows, macOS und iOS)
  const obsidianIo = () => {
    const V = app.vault;
    const istDatei = (f) => !!f && !f.children;
    const datei = (p) => { const f = V.getAbstractFileByPath(p); return istDatei(f) ? f : null; };
    const ordner = (p) => { const f = p ? V.getAbstractFileByPath(p) : V.getRoot(); return f && f.children ? f : null; };
    const puffer = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
    const existiert = (p) => {
      if (V.getAbstractFileByPath(p)) return true;
      const o = ordner(elternVon(p)), n = nameVon(p).toLowerCase();
      return !!o && o.children.some((k) => k.name.toLowerCase() === n);
    };
    const ordnerAnlegen = async (p) => {
      let a = "";
      for (const t of String(p || "").split("/").filter(Boolean)) {
        a = a ? a + "/" + t : t;
        if (V.getAbstractFileByPath(a)) continue;
        try { await V.createFolder(a); } catch (e) { if (!V.getAbstractFileByPath(a)) throw e; }
      }
    };
    return {
      lesenText: async (p) => { const f = datei(p); return f ? V.read(f) : null; },
      schreibenText: async (p, t) => { const f = datei(p); if (f) { await V.modify(f, t); return; } await ordnerAnlegen(elternVon(p)); await V.create(p, t); },
      lesenBinaer: async (p) => { const f = datei(p); return f ? new Uint8Array(await V.readBinary(f)) : null; },
      anlegenBinaer: async (p, b) => { await V.createBinary(p, puffer(b)); },
      anlegenText: async (p, t) => { await V.create(p, t); },
      ersetzenBinaer: async (p, b) => { const f = datei(p); if (!f) throw new Error("Datei fehlt: " + p); await V.modifyBinary(f, puffer(b)); },
      loeschen: async (p) => { const f = datei(p); if (f) await V.delete(f); },
      // Ordner oder Datei umbenennen; Links im Tresor ziehen mit (fileManager)
      umbenennen: async (alt, neu) => { const f = V.getAbstractFileByPath(alt); if (f) await app.fileManager.renameFile(f, neu); },
      existiert,
      dateien: (unter) => V.getFiles().filter((f) => (!unter || f.path.indexOf(unter + "/") === 0) && String(f.extension).toLowerCase() !== "md").map((f) => ({ pfad: f.path, groesse: f.stat.size })),
      unterordner: (p) => { const o = ordner(p); return o ? o.children.filter((k) => !!k.children).map((k) => k.name) : []; },
      ordnerAnlegen,
      notizMarkieren: async (p, felder) => {
        const f = datei(p), c = f && app.metadataCache.getFileCache(f);
        if (!c || !c.frontmatter || c.frontmatter.typ !== "unterlage") return false;
        await app.fileManager.processFrontMatter(f, (x) => { Object.assign(x, felder); });
        return true;
      },
    };
  };

  // Anschluss an ilias-netz.js (Transport) und ilias-html.js (Seiten lesen). Erwartet, bei Abweichung nur hier anpassen:
  //   netz.sitzung({}) → s; s.anfrage({ url }) → { status, url (mobil null), text }; s.anfrage({ url, binaer: true }) →
  //   { status, url, daten | arrayBuffer, typ }; netz.UNI → { ilias, kurse? }; netz.istLoginSeite(text) (sonst html.angemeldet)
  //   html.kurse(text, url) → [{ refId, titel, code, url }]; html.inhalt(text, url) → [eintrag]; html.folgeUrl(text, url);
  //   html.seitenArt(text, url); html.downloadUrl(eintrag, basis); html.dateiName(eintrag)
  // Anmelden kommt von außen (anmelden(sitzung, zugang, { netz, uni }), siehe anmeldungFinden). Abgelaufene Sitzung (Login-
  // Seite statt Inhalt): einmal je Lauf neu anmelden, dann aufgeben.
  const quelleAusNetz = async (zugang, anmelden) => {
    const N = modulVon("ilias-netz"), H = modulVon("ilias-html");
    if (!N || typeof N.sitzung !== "function" || !H) throw fehlerArt("baustein", "ILIAS-Baustein fehlt (ilias-netz.js oder ilias-html.js).");
    const uni = N.UNI || {};
    const WURZEL = String(uni.ilias || "").replace(/\/$/, "");
    const KURSE = uni.kurse || WURZEL + "/ilias.php?baseClass=ilmembershipoverviewgui";
    // Basis für relative Links: End-URL der Antwort; mobil unbekannt (null) → ILIAS-Wurzel (Seiten liegen dort, nicht unter
    // goto.php/<typ>/, sonst würde „ilias.php?…“ zu „goto.php/crs/ilias.php?…“)
    const basis = (r) => r.url || WURZEL + "/ilias.php";
    // Permalink goto.php/<typ>/<ref> direkt als Repository-Adresse holen: eine Weiterleitung weniger je Ordner. Nur Ordner,
    // Gruppen, Kurse (Inhaltsseiten „copa“ liefern so HTTP 500, gemessen 17.10.2026)
    const direkt = (url) => { const m = String(url).match(/^(https:\/\/[^/]+)\/goto\.php\/(?:fold|grp|crs)\/(\d+)\/?$/); return m && m[1] === WURZEL ? WURZEL + "/ilias.php?baseClass=ilrepositorygui&ref_id=" + m[2] : url; };
    const s = await N.sitzung({});
    await anmelden(s, zugang, { netz: N, uni });
    let neuAngemeldet = false;
    const istLogin = (text) => typeof text === "string" && (typeof N.istLoginSeite === "function" ? !!N.istLoginSeite(text)
      : typeof H.angemeldet === "function" && !H.angemeldet(text));
    const pruefen = (r, url) => {
      if (!r || (r.status && r.status >= 400)) { const e = new Error("HTTP " + (r && r.status) + " bei " + url.slice(0, 120)); e.status = r && r.status; throw e; }
      return r;
    };
    const mitAnmeldung = async (fn, abgemeldet) => {
      let r = await fn();
      if (abgemeldet(r) && !neuAngemeldet) { neuAngemeldet = true; await anmelden(s, zugang, { netz: N, uni }); r = await fn(); }
      if (abgemeldet(r)) throw fehlerArt("sitzung", "Die ILIAS-Sitzung ist abgelaufen und die erneute Anmeldung half nicht.");
      return r;
    };
    const seite = (url) => mitAnmeldung(async () => pruefen(await s.anfrage({ url }), url), (r) => istLogin(r.text));
    const pause = () => new Promise((fertig) => ctx.zeit(fertig, ABSTAND_MS)); // Folgeseiten im selben Abstand
    // Inhalt eines Behälters: Reiter „Inhalt“ bzw. „alle Sitzungen anzeigen“ höchstens zweimal nachgehen; kein Zugriff → 403
    const behaelter = async (url) => {
      let r = await seite(direkt(url));
      for (let i = 0; i < 2 && typeof H.folgeUrl === "function"; i++) {
        const f = H.folgeUrl(r.text, basis(r));
        if (!f || f === r.url) break;
        await pause();
        r = await seite(f);
      }
      if (typeof H.seitenArt === "function" && H.seitenArt(r.text, basis(r)) === "kein-zugriff") { const e = new Error("kein Zugriff"); e.status = 403; throw e; }
      return r;
    };
    const alsText = (r) => { if (typeof r.text === "string") return r.text; const by = bytesAus(r); return by ? new TextDecoder("utf-8").decode(by.subarray(0, 200000)) : ""; };
    const istHtml = (r) => /text\/html/i.test(String(r.typ || (r.kopf && r.kopf["content-type"]) || ""));
    return {
      kurse: async () => { const r = await seite(KURSE); return H.kurse(r.text, basis(r)); },
      // Kurse und Gruppen aus einer Seite; Gruppen mit Titel und Beschreibung (nur im Speicher, ilias.js liest das Zeitfenster)
      mitgliedschaften: async () => { const r = await seite(KURSE); return H.mitgliedschaften(r.text, basis(r)); },
      // Kurs einer Gruppe aus den Brotkrumen ihrer Seite → { refId, code } | null
      gruppeKurs: async (g) => {
        const r = await seite(direkt(g.url || WURZEL + "/goto.php/grp/" + g.refId));
        const k = typeof H.brotkrumen === "function" ? H.brotkrumen(r.text, basis(r)).filter((x) => x.typ === "crs")[0] : null;
        return k ? { refId: k.refId, code: codeAm(k.titel) } : null;
      },
      inhalt: async (k) => { const r = await behaelter(k.url); return H.inhalt(r.text, basis(r)); },
      laden: async (e) => {
        const url = H.downloadUrl(e, e.url);
        if (!url) throw fehlerArt("datei", "kein Download-Link");
        const r = await mitAnmeldung(async () => pruefen(await s.anfrage({ url, binaer: true }), url), (x) => istHtml(x) && istLogin(alsText(x)));
        const endung = String(e.endung || "").toLowerCase();
        if (istHtml(r) && endung !== "html" && endung !== "htm") throw fehlerArt("datei", "ILIAS lieferte eine Seite statt der Datei");
        return r;
      },
      name: (e) => (typeof H.dateiName === "function" ? H.dateiName(e) : ""),
    };
  };

  // Anmeldung: eingesetzt über ctx.ilias.anmeldungSetzen(fn), sonst ilias-anmeldung.js. Nur wenn auch Transport und
  // Seitenleser da sind; sonst „folgt später“ (kein automatischer Lauf).
  const anmeldungSlot = ctx.bleibend("anmeldung", () => ({ fn: null }));
  const anmeldungFinden = () => {
    if (typeof anmeldungSlot.fn === "function") return anmeldungSlot.fn;
    if (!ctx.user || !ctx.user["ilias-netz"] || !ctx.user["ilias-html"]) return null;
    const m = modulVon("ilias-anmeldung");
    return m && typeof m.anmelden === "function" ? (s, z, o) => m.anmelden(s, z, o) : null;
  };

  // ILIAS selbst: eingesetzt über ctx.ilias.quelleSetzen(fn) (nur Tests der Oberfläche in Obsidian), sonst quelleAusNetz
  const quelleSlot = ctx.bleibend("quelle", () => ({ fn: null }));
  const quelleFinden = (zugang, anmelden) => (typeof quelleSlot.fn === "function" ? quelleSlot.fn : quelleAusNetz)(zugang, anmelden);

  const hoerer = ctx.bleibend("hoerer", () => new Set());
  const beobachten = (fn) => { if (typeof fn === "function") hoerer.add(fn); return () => hoerer.delete(fn); };
  const neuZeichnen = () => { try { if (ctx.verbindungen && ctx.verbindungen.neuZeichnen) ctx.verbindungen.neuZeichnen(); } catch (e) { /* egal */ } };
  // Zeile unter Verbindungen und Knopf auf Unterlagen: nur den Stand ändern, nicht alles neu zeichnen
  const standZeigen = () => { try { if (ctx.verbindungen && ctx.verbindungen.iliasStand) ctx.verbindungen.iliasStand(); } catch (e) { /* egal */ } };

  // Fortschritt eines Laufs, den du gestartet hast (Knopf, Fenster, Einrichtung): EIN Hinweis ohne Ablaufzeit (Notice, 0) mit
  // kurzem Text und dünnem Balken, der sich an Ort und Stelle ändert. Obsidian zeigt Hinweise auf iPhone und iPad oben, am PC
  // oben rechts; nichts verdeckt Eingabefelder oder die Leiste unten, und es geht auch ohne Statusleiste. Antippen blendet ihn
  // aus, der Abruf läuft weiter; ein weiterer Knopfdruck zeigt ihn wieder. Am Ende verschwindet er, danach kommt der Hinweis
  // zum Ergebnis (melden). Automatische Läufe bleiben still. Er hängt am Motor, nicht an einem Fenster: einer für alle Ansichten.
  // „Stoppen“ beendet den Abruf samt Auftrag (wie im Fenster); Wegtippen beendet nichts.
  const fortschrittHinweis = () => {
    let notiz = null, text = null, balken = null, aktiv = false, aus = false, weiter = false;
    const schliessen = () => { if (notiz) { try { notiz.hide(); } catch (e) { /* schon weg */ } } notiz = null; text = null; balken = null; };
    const weggetippt = () => !!notiz && !(text && text.isConnected);
    const zeichnen = (x) => {
      if (weggetippt()) { aktiv = false; schliessen(); return; } // ausgeblendet: still bis zum nächsten Knopfdruck
      if (!notiz) {
        if (!obs.Notice) return;
        const f = document.createDocumentFragment();
        const box = f.createDiv({ cls: "eba-ilias-fortschritt" });
        const zeile = box.createDiv({ cls: "eba-ilias-fortschritt-zeile" });
        text = zeile.createDiv({ cls: "eba-ilias-fortschritt-text" });
        zeile.createEl("button", { text: "Stoppen", cls: "eba-ilias-fortschritt-stopp" }).addEventListener("click", () => { if (motorInst) motorInst.stoppen(); });
        balken = box.createDiv({ cls: "eba-ilias-fortschritt-spur" }).createDiv({ cls: "eba-ilias-fortschritt-balken" });
        notiz = new obs.Notice(f, 0);
      }
      const a = fortschrittAnzeige(x, weiter);
      text.setText(a.kurz);
      balken.toggleClass("unbestimmt", a.anteil == null);
      balken.style.width = a.anteil == null ? "" : Math.round(Math.max(0.04, a.anteil) * 100) + "%";
    };
    return {
      ereignis(x) {
        if (aus || !x) return;
        if (x.art === "start" && x.manuell) {
          if (weggetippt()) schliessen();
          aktiv = true; weiter = !!x.weiter;
          zeichnen(motorInst ? motorInst.fortschritt : null);
        } else if (x.art === "fortschritt" && aktiv) zeichnen(x);
        else if (x.art === "fertig") { aktiv = false; schliessen(); }
      },
      weg() { aus = true; aktiv = false; schliessen(); },
    };
  };
  const hinweis = fortschrittHinweis();
  const eba = () => { try { return ctx.user.eba(ctx); } catch (e) { return null; } };
  const obsidianAbh = () => ({
    io: obsidianIo(), lokal: lokalObs, geheim: geheimObs, geheimId, anmeldung: anmeldungFinden, quelle: quelleFinden,
    einordner: () => einordnerAus(modulVon("unterlagen")),
    modul: (code) => { const e = eba(), m = e && e.modulNachCode(code); return m ? { name: m.f.basename, titel: String(m.fm.titel || "") } : null; },
    semester: () => { const e = eba(); try { return e ? e.aktuellesSemester().name : ""; } catch (x) { return ""; } },
    // Gruppen: Bibliothek meine-gruppe.js, geprüfte Gruppenliste der zentralen Daten (null = noch keine), Stundenplan-Notizen
    gruppen: () => modulVon("meine-gruppe"),
    zentraleGruppen: () => { const g = ctx.zentral && ctx.zentral.gruppen ? ctx.zentral.gruppen() : null; return g && Array.isArray(g.gruppen) ? g.gruppen : null; },
    stundenplan: () => { const G = modulVon("meine-gruppe"); return G && G.obsidianIo ? G.obsidianIo() : null; },
    einstellungen: () => { const f = app.vault.getAbstractFileByPath(EINSTELLUNGEN), c = f && app.metadataCache.getFileCache(f); return (c && c.frontmatter) || {}; },
    jetzt: () => (ctx.date && ctx.date.jetzt ? ctx.date.jetzt() : new Date()),
    warten: (n) => new Promise((fertig) => ctx.zeit(fertig, n)),
    mobil: !!(obs.Platform && obs.Platform.isMobile),
    geraetId,
    melden: (t) => { if (obs.Notice) new obs.Notice(t, 6000); },
    geaendert: (x) => {
      for (const h of Array.from(hoerer)) { try { h(x); } catch (e) { /* Hörer egal */ } }
      hinweis.ereignis(x);
      if (x && x.art === "fertig" && x.weiterIn != null) weiterPlanen(x.weiterIn);
      if (x && x.art === "gruppen") { try { if (ctx.gruppenAnzeige) ctx.gruppenAnzeige.neu(); } catch (e) { /* egal */ } }
      if (x && x.art === "fortschritt") standZeigen(); else neuZeichnen();
    },
  });
  let motorInst = null;
  const motor = () => motorInst || (motorInst = erzeugen(obsidianAbh()));

  // Offenen Auftrag fortsetzen (Fehler, nächster Stapel, Start, zurück in der App): wie dein Knopf, mit Hinweis. Nur wenn bereit
  // (Zugang da, Anmeldung nicht abgelehnt, kein eigener Uni-Abgleich); ein toter Lauf (still) wird vorher verworfen.
  let weiterZeit = null;
  const fortsetzen = () => {
    weiterZeit = null;
    const m = motor();
    if (!m.auftrag() || !m.bereit()) return;
    if (m.laeuft) { if (!m.still()) return; m.verwerfen(); }
    m.jetztHolen({ manuell: true, weiter: true });
  };
  const weiterPlanen = (ms) => { if (weiterZeit) ctx.stopp(weiterZeit); weiterZeit = ctx.zeit(fortsetzen, ms); };

  let gruppenLesen = false;
  // ---------- Für andere Skripte (Oberfläche) und Tests ----------
  // status() → { verbunden, bereit, extern, laeuft, zuletzt, versucht, fehler, gesperrt, neu, rest, dateien, kurse, zuGross,
  //   grenzeMb, abrufer, anderes (ein anderes Gerät lädt), benutzer, text }; jetztHolen(o) → Bericht (Knopf; o.uebernehmen
  //   holt die Abrufer-Sperre her);
  // zugangSpeichern(benutzer, geber, { pruefen }) → { ok, fehler? }; kurse() → [{ refId, titel, code, aktiv, zuletzt,
  // dateien }]; kursSetzen(refId, an); kurseAbrufen() (anmelden + Kursliste, ohne Downloads); beobachten(fn) → abmelden
  // (fn({ art: start | fortschritt | fertig | zugang | kurse, … }), Felder siehe jetztHolen und fort); fortschritt (letzter
  // Fortschritt des laufenden Abrufs oder null); fortschrittAnzeige(x) → Texte und Anteil dazu. status().fortschritt =
  // fortschrittAnzeige des laufenden Abrufs (sonst null).
  const api = {
    status: () => motor().status(),
    jetztHolen: (o) => motor().jetztHolen(Object.assign({ manuell: true }, o || {})),
    zugangSpeichern: (b, g, o) => motor().zugangSpeichern(b, g, o),
    zugangLoeschen: () => motor().zugangLoeschen(),
    hatZugang: () => motor().hatZugang(),
    bereit: () => motor().bereit(),
    kannSpeichern: () => !!(app && app.secretStorage && typeof app.secretStorage.setSecret === "function"),
    kurse: () => motor().kurse(),
    kursSetzen: (id, an) => motor().kursSetzen(id, an),
    kurseAbrufen: () => motor().kurseAbrufen(),
    // Deine ILIAS-Gruppen (gruppen.js): [{ refId, code, status, zentral, kandidaten }]; liest den Index beim ersten Mal nach und
    // zeichnet dann die Gruppen neu
    gruppen: () => {
      const m = motor();
      if (!m.index && !gruppenLesen) {
        gruppenLesen = true;
        m.indexLesen().then(() => { try { if (ctx.gruppenAnzeige) ctx.gruppenAnzeige.neu(); } catch (e) { /* egal */ } }, () => {});
      }
      return m.index ? m.gruppenListe() : [];
    },
    protokoll: () => motor().protokoll(),
    beobachten,
    anmeldungSetzen: (fn) => { anmeldungSlot.fn = typeof fn === "function" ? fn : null; neuZeichnen(); },
    quelleSetzen: (fn) => { quelleSlot.fn = typeof fn === "function" ? fn : null; },
    get UNI() { const n = modulVon("ilias-netz"); return (n && n.UNI) || null; },
    get laeuft() { return !!(motorInst && motorInst.laeuft); },
    get fortschritt() { return motorInst ? motorInst.fortschritt : null; },
    stoppen: () => motor().stoppen(),
    auftrag: () => motor().auftrag(),
    fortschrittAnzeige, naechsterSchritt, abgestorben,
    geheimId, geheimIdAus,
    // reine Logik und Tests
    erzeugen, einordnerAus, notizText, pflichtfelder, mischen, codeAm, sauber, quelleAusNetz, ohneKennwort, pfadOhneKennwort, indexPruefen,
    K: { INDEX, ABRUF, MAX_MB, NEU_MOBIL, NEU_PC, ANFRAGEN, ABSTAND_MS, UEBERNAHME, PULS, TEXT_ANMELDUNG_FOLGT, WIEDER_MIN, STAPEL_PAUSE, STAPEL_MAX, STILL },
  };
  ctx.ilias = api;

  const registrieren = () => {
    ctx.aufraeumen(() => hinweis.weg());
    // Automatischer Lauf: 20 s + Zufall 0–2 Min. nach dem Einlesen, dann stündlich, zurück in der App nach über 60 Min.
    // Jeder Takt prüft erst bereit() (Anmeldung vorhanden, Zugang gespeichert, nicht abgelehnt, kein eigener Uni-Abgleich).
    const lauf = () => { const m = motor(); if (!plugin().testIliasAus && m.bereit() && !m.laeuft) m.jetztHolen({}); };
    // Einmal je Start, mit dem Zufallsversatz: Kurspasswörter aus alten Index-Einträgen (synchronisiert, auch ohne Zugang)
    const saeubern = () => { if (!plugin().testIliasAus) motor().saeubern().catch((e) => console.warn("ilias: Index " + ((e && e.message) || e))); };
    const planen = () => ctx.zeit(() => { saeubern(); lauf(); ctx.intervall(lauf, STUNDE); }, 20000 + Math.floor(Math.random() * 2 * MIN));
    ctx.dom(document, "visibilitychange", () => {
      if (document.visibilityState !== "visible" || !motor().bereit()) return;
      const m = motor();
      // offener Auftrag: toter Lauf (im Hintergrund gestorben) oder keiner geplant → gleich weiter
      if (m.auftrag() && (m.laeuft ? m.still() : !weiterZeit)) { weiterPlanen(3000); return; }
      const v = Date.parse(m.stand().versucht || "");
      if (!isNaN(v) && Date.now() - v > NACHHOLEN) ctx.zeit(lauf, 5000);
    });
    // Offener Auftrag nach dem Start (App oder Plugin neu): nach 20–60 s weiter, mit Hinweis
    if (motor().auftrag()) weiterPlanen(20000 + Math.floor(Math.random() * 40000));
    // Einmal je Start: Kurspasswörter aus alten Titeln im Index entfernen (synchronisierte Datei, auch ohne ILIAS-Zugang)
    if (app.metadataCache.initialized || app.metadataCache.resolved) planen();
    else { const r = ctx.an(app.metadataCache, "resolved", () => { app.metadataCache.offref(r); planen(); }); }
    // Umbenennen im Tresor: Index sofort im Speicher, geschrieben entprellt (ganze Ordner melden viele Dateien)
    const bald = ctx.entprellen(() => { motor().speichern().catch((e) => console.warn("ilias: Index " + ((e && e.message) || e))); }, 2000);
    ctx.an(app.vault, "rename", (f, alt) => {
      if (!f || !alt) return;
      motor().umbenannt(f.path, String(alt)).then((x) => { if (x) bald(); }, () => {});
    });
  };
  // Hot-Reload oder Entladen: laufenden Abruf beim nächsten Schritt beenden
  const abmelden = () => { if (motorInst) motorInst.abbrechen(); };

  return { registrieren, abmelden };
};
