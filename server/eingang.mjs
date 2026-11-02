// Eingang v1: Ergebnisse eines Claude-Laufs auf dem eigenen Server, geprüft und vereinheitlicht, bevor das Plugin sie abholt.
// Claude liefert nur Inhalte mit einem stabilen Schlüssel je Termin (z. B. Quelle + laufende Nummer); die id leitet der Server
// daraus ab (nie das Modell). Die Regeln entsprechen termineNormal in zentral.js (docs/daten-v1.md, termine.json), damit das
// Plugin die Termine mit derselben Prüfung übernimmt (tests/server-eingang.test.js prüft das gegen zentral.js).
// Gleicher Schlüssel in einem späteren Lauf = Änderung desselben Termins. Woher ein Termin stammt (herkunft), prüft der Server für
// Mails aus dem Uni-Postfach selbst (herkunftNormal, herkunftAnwenden); ins Eingang geht sie nicht.
// Kapitellisten für den Lernplan (seit 31.10.2026, Feld „kapitel“): dieselbe Form und dieselben Regeln wie kapitel.json →
// module[] (docs/daten-v1.md, kapitelPruefen in zentral.js); ein ungültiges Kapitel verwirft sein ganzes Modul.
import { createHash } from "node:crypto";

export const EINGANG_SCHEMA = 1;
export const KATEGORIEN = ["Semester", "Vorlesungsfrei", "Prüfung", "Frist", "Einführung", "Lehre", "Fachschaft", "Veranstaltung"];
// Nur Mails: Quellen, die das Plugin selbst holt (eba.QUELLEN, z. B. ilias-kalender), liefert der Server nicht. Übernähme er
// eine davon, müsste die Einrichtung genau diesen Schlüssel in quellen_extern setzen (ein Schreiber je Quelle).
export const QUELLEN = ["gmail", "uni-postfach"];
const STATUS = ["offiziell", "geschätzt"];
export const MODULCODE = /^[A-Z]{1,4}[0-9][0-9X]{2}[A-Z]?$/;
const GEFAEHRLICH = /<\s*\/?\s*[a-z!]|<%|%>|obsidian:\/\/|\[\[|\]\]|`|[\r\n]|javascript:/i;
const G = { titel: 120, ort: 120, info: 200, quelleText: 200, schluessel: 200, hinweis: 300, punkt: 300, begriff: 60, aufgabe: 200, frage: 200,
  termine: 300, hinweise: 50, begleitnotizen: 50, punkte: 12, aufgaben: 12, fragen: 10, pfad: 240, todoDoppel: 50,
  kapitelModule: 60, kapitel: 40, teile: 40, kapitelTitel: 140, kapitelQuelle: 120, url: 500 };
// Kennung eines To-dos im Auszug aus dem Tresor (tresor.json, vom Plugin: „t-“ und eine Kurz-Prüfsumme aus Notiz und Zeile)
export const TODO_ID = /^t-[0-9a-z]{1,13}$/;

const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
export const datumOk = (d) => {
  if (typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d) || d < "2020-01-01" || d > "2040-12-31") return false;
  const t = new Date(d + "T00:00:00Z");
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
};
const tage = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);

// Domains, deren Links im Fließtext stehen bleiben (wie TEXT_DOMAINS in zentral.js)
export const TEXT_DOMAINS = ["uni-tuebingen.de", "ffwtuebingen.de"];
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
export { linksEntschaerfen };
// Wie STEUER und WEG in zentral.js: Steuer- und unsichtbare Zeichen → Leerzeichen; Zeichen, die nur unsichtbar Text tragen können
// (weiches Trennzeichen, Variantenwähler, Hangul-Füller, Unicode-Tags), fallen ganz weg
const STEUER = /[\u0000-\u001f\u007f\u061c\u180e\u200b-\u200f\u2028\u2029\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff\ufff9-\ufffb]/g;
const WEG = /[\u00ad\u115f\u1160\u3164\uffa0]|\u034f|\u17b4|\u17b5|[\u180b-\u180d]|\u180f|[\ufe00-\ufe0f]|\udb40[\udc00-\udc7f\udd00-\uddef]/g;

// Wie „Säubern“ in docs/daten-v1.md: HTML, Templater, Links, Backticks, Steuer- und unsichtbare Zeichen weg, Leerraum
// zusammenfassen. Zu lang danach: Fehler (nicht kürzen). links: Domains für linksEntschaerfen; null = Links unverändert (nur für
// Pfade aus dem Tresor, die genau so bleiben müssen).
export function saeubern(v, max, pflicht, links = TEXT_DOMAINS) {
  if (v == null || v === "") return pflicht ? { fehler: "fehlt" } : { wert: "" };
  if (typeof v !== "string") return { fehler: "kein Text" };
  // viel zu lang schon vorher: Fehler, bevor die Muster laufen (wie textFeld in zentral.js)
  if (v.length > max * 4 + 1000) return { fehler: "zu lang" };
  const roh = zeichenRefs(v).replace(WEG, "").replace(STEUER, " ").replace(/<%[\s\S]*?%>/g, " ").replace(/<\/?[a-z!][^>]*>/gi, " ").replace(/obsidian:\/\/\S*/gi, " ")
    .replace(/\[\[|\]\]|`/g, " ");
  const s = fremdeZiele(links ? linksEntschaerfen(roh, links) : roh).replace(/(?:java|vb)script:/gi, " ").replace(/\s+/g, " ").trim();
  if (!s) return pflicht ? { fehler: "leer" } : { wert: "" };
  if (s.length > max) return { fehler: "zu lang" };
  return { wert: s };
}

// Texte, die Studierende lesen (Termin, Hinweis, Begleitnotiz), zusätzlich ohne Links (https, www., mailto): Claude soll keine
// liefern, und ein Link aus einer fremden Mail wäre in Obsidian anklickbar. Schlüssel und Kapitellisten säubert der Server wie
// das Plugin (die id und die Haken im Lernplan hängen an ihnen).
export const ohneLinks = (v) => (typeof v === "string" ? v.replace(/\b(?:https?:\/\/|www\.|mailto:)\S*/gi, " ") : v);
// Was ohneLinks übrig lässt („domain.de/…“, andere Schemata), entschärft linksEntschaerfen ohne erlaubte Domain: Der Server
// macht nie selbst einen Link daraus, auch nicht zur Uni.
const lesetext = (v, max, pflicht) => saeubern(ohneLinks(v), max, pflicht, []);

// ---------- Zugangsdaten erkennen (nach bestem Bemühen) ----------
// Eine Heuristik, keine Garantie: Was der Server in tresor.json an Claude gibt (Titel und To-dos aus dem Tresor), soll nichts
// enthalten, was nach Kennwort, Zugangscode, Konto oder Schlüssel aussieht. Gleiche Regeln wie ohneKennwort in ilias.js
// (Kurstitel), dazu weitere Wörter und Formen (MUSTER_EXTRA); die Liste steht in docs/architektur/server.md, „Zugangsdaten“.
// Erkannt wird auf einer gefalteten Fassung: unsichtbare Zeichen (Breiten-, Richtungs-, Trennzeichen, Variantenwähler) und
// Steuerzeichen ohne Leerraum zuerst ganz weg, damit ein getrenntes Wort („Pass<U+200B>wort“) zusammenbleibt, dann Zeilenwechsel zu
// Leerzeichen, Entitäten aufgelöst (auch doppelt kodiert), NFKC, Doppelgänger lateinisch (kyrillisch, griechisch, armenisch,
// Kapitälchen, IPA), klein; für die Marken eines Kennworts dazu „@“ als a und „$“ als s („P@ssw0rt“ ohne die Null).
// Die Rolle ist begrenzt: Dieselben Texte erreichen Claude ohnehin über die Mails selbst, und der Skill behandelt alles als Daten.
const UNSICHTBAR = /[\u00ad\u061c\u115f\u1160\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\u3164\ufeff\uffa0]|\u034f|\u17b4|\u17b5|[\u180b-\u180d]|\u180f|[\ufe00-\ufe0f]|\udb40[\udc00-\udc7f\udd00-\uddef]/g;
const ENT = { amp: "&", lt: "<", gt: ">", quot: "\"", apos: "'", nbsp: " ", colon: ":", period: ".", lowbar: "_", hyphen: "-", sol: "/", num: "#", shy: "" };
const entitaeten = (s) => {
  let t = String(s);
  for (let i = 0; i < 3 && t.includes("&"); i++) {
    t = t.replace(/&(#\d{1,7}|#[xX][0-9a-fA-F]{1,6}|[A-Za-z]{2,8});/g, (m, e) => {
      if (e[0] !== "#") return Object.prototype.hasOwnProperty.call(ENT, e.toLowerCase()) ? ENT[e.toLowerCase()] : m;
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return n > 0 && n < 0x110000 && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : "";
    });
  }
  return t;
};
const HOMOGLYPHE = { "а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "у": "y", "х": "x", "к": "k", "м": "m", "т": "t", "н": "h", "в": "b",
  "і": "i", "ј": "j", "ѕ": "s", "ԁ": "d", "ԝ": "w", "ԛ": "q", "ӏ": "l", "А": "A", "В": "B", "Е": "E", "К": "K", "М": "M", "Н": "H",
  "О": "O", "Р": "P", "С": "C", "Т": "T", "Х": "X", "У": "Y", "І": "I", "Ј": "J", "Ѕ": "S", "Ԝ": "W", "α": "a", "ο": "o", "ρ": "p",
  "ε": "e", "κ": "k", "ν": "v", "τ": "t", "υ": "u", "ι": "i", "ω": "w", "Α": "A", "Β": "B", "Ε": "E", "Ζ": "Z", "Η": "H", "Ι": "I",
  "Κ": "K", "Μ": "M", "Ν": "N", "Ο": "O", "Ρ": "P", "Τ": "T", "Υ": "Y", "Χ": "X",
  // lateinische Sonderformen (punktloses i, IPA, Kapitälchen), armenische Doppelgänger, Punkte aus CJK-Schriften
  "\u0131": "i", "\u0237": "j", "\u0251": "a", "\u0261": "g", "\u0269": "i", "\u026a": "i", "\u0274": "n", "\u0280": "r", "\u028f": "y", "\u0299": "b", "\u029c": "h", "\u029f": "l", "\u0561": "w", "\u0563": "q", "\u0566": "q", "\u0570": "h", "\u0578": "n", "\u057c": "n", "\u057d": "u", "\u0581": "g", "\u0584": "f", "\u0585": "o", "\u1d00": "a", "\u1d04": "c", "\u1d05": "d", "\u1d07": "e", "\u1d0a": "j", "\u1d0b": "k", "\u1d0d": "m", "\u1d0f": "o", "\u1d18": "p", "\u1d1b": "t", "\u1d1c": "u", "\u1d20": "v", "\u1d21": "w", "\u1d22": "z", "\ua731": "s", "\ua730": "f", "\u3002": ".", "\uff61": ".", "\ufe12": "." };
const falten = (t) => t.replace(/[Ͱ-ϿЀ-ԯ\u0131\u0237\u0250-\u02af\u0530-\u058f\u1d00-\u1d7f\ua730\ua731\u3002\ufe12\uff61]/g, (c) => HOMOGLYPHE[c] || c);
// Steuerzeichen ohne Leerraum (U+0000 bis U+001F außer Tab und Zeilenwechsel, U+007F bis U+009F) ganz weg, damit sie kein Wort
// trennen („ig<U+0000>nore“); Zeilenwechsel und die übrigen aus STEUER werden Leerzeichen
const STEUER_WEG = /[\u0000-\u0008\u000e-\u001f\u007f-\u009f]/g;
const ohneUnsichtbare = (s) => String(s).normalize("NFC").replace(UNSICHTBAR, "").replace(STEUER_WEG, "").replace(STEUER, " ");
// gefaltete Fassung zum Prüfen: NFKC, Doppelgänger lateinisch, klein (auch Sonderfälle wie „ẞ“, die /i nicht abdeckt)
const gefaltet = (s) => {
  let t = ohneUnsichtbare(entitaeten(ohneUnsichtbare(s)));
  try { t = t.normalize("NFKC"); } catch (e) { /* bleibt NFC */ }
  return falten(ohneUnsichtbare(t)).replace(/\s+/g, " ");
};
const klein = (d) => falten(d.toLowerCase());
// Wie ilias.js: starke Marken zählen immer (nicht als Wortanfang: „Passwortsicherheit“), PW-Formen mit Ziffer, „:“/„=“ oder nach
// einem Trenner, schwache Wörter nur mit „:“/„=“ und einem Wert, der wie ein Kennwort aussieht
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
function markeDa(d) {
  let m;
  STARK.lastIndex = 0;
  if (STARK.test(d)) return true;
  PW.lastIndex = 0;
  while ((m = PW.exec(d))) {
    const vor = d.slice(0, m.index), nach = d.slice(m.index + m[0].length);
    const kompositum = /(?:kurs|beitritts)[\s._-]?$/i.test(vor);
    if (!kompositum && vor && BUCHSTABE.test(vor[vor.length - 1])) continue;
    if (/^\d/.test(nach) || /^\s*[:=]/.test(nach) || kompositum || TRENNER.test(vor.replace(/\s+$/, "")) || !vor.trim()) return true;
  }
  SCHWACH.lastIndex = 0;
  while ((m = SCHWACH.exec(d))) {
    if (m.index > 0 && BUCHSTABE.test(d[m.index - 1])) continue;
    if (wertWiePasswort(d.slice(m.index + m[0].length))) return true;
  }
  return false;
}
// Dazu auf dem Server: Wörter für Zugänge, Konten und Kennungen (auch ohne Wert, wie bisher PIN) und Formen geheimer Werte
const WORT = (w, schalter = "i") => new RegExp("(?<![A-Za-zÄÖÜäöüß])(?:" + w + ")(?![A-Za-zÄÖÜäöüß])", schalter);
export const MUSTER_EXTRA = [
  WORT("log-?in(?:daten|name)|anmeldedaten"), WORT("pass" + LUECKE + "code|passcodes?|pins?|tokens?|iban|bic"),
  WORT("einschreibe" + LUECKE + "schl(?:ü|ue|u)ssel"), WORT("matrikel(?:nummer|nr\\.?|-nr\\.?)?|matr\\.?\\s?-?\\s?nr\\.?"),
  WORT("TANs?", ""), WORT("(?:i|m|push|sms|chip|photo|foto)-?tans?"),
  /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,3})?\b/, // IBAN
  /sk-ant-[A-Za-z0-9_-]{8,}/, /\bsk-(?:proj-)?[A-Za-z0-9_-]{20,}/, /\bgh[pousr]_[A-Za-z0-9]{20,}/, /\bgithub_pat_[A-Za-z0-9_]{20,}/,
  /\bglpat-[A-Za-z0-9_-]{20,}/, /\bxox[abprs]-[A-Za-z0-9-]{10,}/, /\bAKIA[0-9A-Z]{16}\b/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];
// → true, wenn der Text nach Zugangsdaten aussieht
export function hatZugangsdaten(s) {
  if (s == null || s === "") return false;
  const d = gefaltet(String(s).slice(0, 5000));
  return markeDa(d) || markeDa(klein(d).replace(/@/g, "a").replace(/\$/g, "s")) || MUSTER_EXTRA.some((re) => re.test(d) || (re.flags.includes("i") && re.test(klein(d))));
}

// ---------- Text, der wie eine Anweisung an Claude aussieht ----------
// Was der Server aus dem Tresor an Claude gibt (tresor.json), kommt in späteren Läufen wieder: Ein To-do, das Claude aus einer
// präparierten Unterlage in eine Begleitnotiz geschrieben hat, wäre sonst jedes Mal neu im Lauf. Darum fallen Einträge mit einem
// Link (Schema, „www.“, Domain mit Pfad oder bekannter Endung; eine Mail-Adresse zählt nicht) oder mit Wörtern einer Anweisung an
// ein Modell weg (ignorieren, vergessen, „du bist“, „you are“, Rollen wie „System:“, Anweisung, „System-Prompt“, „lösche alle“,
// „neue Regel“, „für Claude“, Namen von Dateien des Laufs und von Werkzeugen). „Prompt“ allein zählt nicht („Prompt Engineering“). Auch das ist eine Heuristik; sie nimmt lieber einen harmlosen Eintrag zu viel heraus, denn der Auszug
// dient nur gegen doppelte Einträge.
const TLD = "de|com|org|net|io|ai|eu|info|app|dev|me|co|ly|gl|to|xyz|ru|cn|uk|at|ch|fr|nl|it|es|edu|gov|biz|online|site|link|click|top";
const LINK_ARTIG = new RegExp("\\b[a-z][a-z0-9+.-]{1,30}:\\/\\/|\\b(?:mailto|obsidian|file|data|javascript):|\\bwww\\d{0,3}\\.|(?<![@\\w.-])(?:[a-z0-9-]+\\.)+[a-z]{2,24}\\/" +
  "|(?<![@\\w.-])(?:[a-z0-9-]*[a-z][a-z0-9-]*\\.)+(?:" + TLD + ")(?![a-z0-9-])", "i");
// Wortteile zählen überall („Arbeitsanweisung“, „ignoriere“), kurze Wörter und Wendungen nur als ganzes Wort
const ANWEISUNG_TEIL = /anweisung|instruction|jailbreak|ignorier|ignore|disregard/i;
const ANWEISUNG = new RegExp("(?<![A-Za-zÄÖÜäöüß])(?:" + [
  "vergiss (?:alle|alles|deine|die (?:vorherigen|bisherigen))", "forget (?:all|everything|previous|prior|your)", "override", "du bist (?:jetzt|nun|ab jetzt|ein|eine)", "ab jetzt bist du", "you are", "you(?:'|’)?re",
  "act as", "pretend", "roleplay", "deine (?:regeln|vorgaben)", "your rules", "system\\s*:", "assistant\\s*:", "user\\s*:", "human\\s*:",
  "system[- ]?prompts?", "prompt[- ]?injection", "(?:dein|deinen|deine|your|neuer|neuen|new) prompts?", "neue regeln?", "new (?:rules?|instructions?)",
  "(?:lösche|loesche|entferne|delete|remove|erase) (?:alle|alles|sämtliche|saemtliche|all|every)", "(?:an|für|fuer|for|to) claude", "claude\\s*[:,]",
  "ausgabe\\.json", "tresor\\.json", "auftrag\\.md", "bisher\\.json", "zentral\\.json", "stand\\.json", "todo_doppel", "mcp__\\w*",
  "get_thread", "get_message", "search_threads", "send_message", "create_draft", "webfetch", "websearch", "notebookedit", "bash",
  "(?:read|write|edit|glob|grep)\\s*\\(",
].join("|") + ")(?![A-Za-zÄÖÜäöüß])|<\\||\\|>|\\[/?inst\\]|<\\/?(?:system|assistant|user)>", "i");
// → true, wenn der Text einen Link enthält oder wie eine Anweisung an ein Modell aussieht
export function wieAnweisung(s) {
  if (s == null || s === "") return false;
  const d = klein(gefaltet(String(s).slice(0, 5000)));
  return LINK_ARTIG.test(d) || ANWEISUNG_TEIL.test(d) || ANWEISUNG.test(d);
}

// Titel eines zentralen Termins (termine.json der zentralen Daten, für zentral.json im Lauf) wie im Plugin (termineNormal in
// zentral.js): kein HTML, Templater, Wikilink, Backtick, Zeilenumbruch, javascript:, keine Klammern [ ] < > { } | \, dann gesäubert
// höchstens 120 Zeichen; dazu nichts, was wie eine Anweisung an Claude aussieht. → { wert } oder { fehler }
export function zentralTitel(v) {
  if (typeof v !== "string" || GEFAEHRLICH.test(v) || /[[\]<>{}|\\]/.test(v)) return { fehler: "titel unzulässig" };
  const t = saeubern(v, G.titel, true);
  return t.fehler || !(wieAnweisung(v) || wieAnweisung(t.wert)) ? t : { fehler: "titel wie eine Anweisung" };
}

export const idAus = (schluessel) => "c-" + createHash("sha256").update(String(schluessel)).digest("hex").slice(0, 20);

// Ein Termin aus Claudes Ausgabe → { wert } im Format von termine.json oder { fehler }.
export function terminNormal(e, heute) {
  if (!istObjekt(e)) return { fehler: "kein Objekt" };
  const schluessel = saeubern(e.schluessel, G.schluessel, true, null);
  if (schluessel.fehler) return { fehler: "schluessel " + schluessel.fehler };
  if (typeof e.titel !== "string" || GEFAEHRLICH.test(e.titel) || /[\[\]<>{}|\\]/.test(e.titel)) return { fehler: "titel unzulässig" };
  const titel = lesetext(e.titel, G.titel, true);
  if (titel.fehler) return { fehler: "titel " + titel.fehler };
  if (!datumOk(e.datum)) return { fehler: "datum ungültig" };
  let bis = "";
  if (e.bis != null && e.bis !== "") {
    if (!datumOk(e.bis) || e.bis < e.datum || tage(e.datum, e.bis) > 400) return { fehler: "bis ungültig" };
    bis = e.bis === e.datum ? "" : e.bis;
  }
  let uhrzeit = "";
  if (e.uhrzeit != null && e.uhrzeit !== "") {
    const m = typeof e.uhrzeit === "string" && e.uhrzeit.match(/^([01]\d|2[0-3]):([0-5]\d)(?:\s*[–-]\s*([01]\d|2[0-3]):([0-5]\d))?$/);
    if (!m) return { fehler: "uhrzeit ungültig" };
    uhrzeit = `${m[1]}:${m[2]}` + (m[3] ? `–${m[3]}:${m[4]}` : "");
  }
  const ort = lesetext(e.ort, G.ort, false);
  if (ort.fehler) return { fehler: "ort " + ort.fehler };
  if (!KATEGORIEN.includes(e.kategorie)) return { fehler: "kategorie nicht erlaubt" };
  if (!STATUS.includes(e.status)) return { fehler: "status ungültig" };
  let code = "";
  if (e.code != null && e.code !== "") {
    if (typeof e.code !== "string" || !MODULCODE.test(e.code)) return { fehler: "code ungültig" };
    code = e.code;
  }
  const quelle = lesetext(e.quelle_text, G.quelleText, false);
  if (quelle.fehler) return { fehler: "quelle_text " + quelle.fehler };
  const info = lesetext(e.info, G.info, false);
  if (info.fehler) return { fehler: "info " + info.fehler };
  const wert = { id: idAus(schluessel.wert), schluessel: schluessel.wert, titel: titel.wert, datum: e.datum, bis, uhrzeit, ort: ort.wert,
    kategorie: e.kategorie, status: e.status, code, quelle_url: "", quelle_text: quelle.wert, info: info.wert, geprueft: heute };
  if (e.entfaellt === true) wert.entfaellt = true;
  return { wert };
}

// felder: was außer text und Seiten (seite, bis) erlaubt ist, „frist“ und/oder „begriff“
function listeText(liste, max, anzahl, art, verworfen, felder = []) {
  const aus = [];
  for (const roh of Array.isArray(liste) ? liste.slice(0, anzahl) : []) {
    const r = lesetext(istObjekt(roh) ? roh.text : roh, max, true);
    if (r.fehler) { verworfen.push({ art, grund: r.fehler }); continue; }
    const eintrag = { text: r.wert };
    if (istObjekt(roh) && Number.isInteger(roh.seite) && roh.seite > 0 && roh.seite < 10000) eintrag.seite = roh.seite;
    if (eintrag.seite && Number.isInteger(roh.bis) && roh.bis > eintrag.seite && roh.bis < 10000) eintrag.bis = roh.bis;
    if (felder.includes("frist") && istObjekt(roh) && datumOk(roh.frist)) eintrag.frist = roh.frist;
    if (felder.includes("begriff") && istObjekt(roh) && typeof roh.begriff === "string") {
      const b = lesetext(roh.begriff.replace(/\*/g, " ").replace(/:\s*$/, ""), G.begriff, false);
      if (b.wert) eintrag.begriff = b.wert;
    }
    aus.push(eintrag);
  }
  return aus;
}

// Begleitnotiz: Pfad unter Unterlagen/ (keine Ausbrüche), dazu die drei Abschnitte wie in unterlagen.js.
function begleitnotizNormal(b, verworfen) {
  if (!istObjekt(b) || typeof b.datei !== "string") return { fehler: "datei fehlt" };
  const datei = b.datei.replace(/\\/g, "/").trim();
  if (!datei.startsWith("Unterlagen/") || datei.length > G.pfad || datei.split("/").some((t) => !t || t === "." || t === "..") ||
    /[\u0000-\u001f<>:"|?*]/.test(datei)) return { fehler: "datei unzulässig" };
  const wert = {
    datei,
    wichtigste: listeText(b.wichtigste, G.punkt, G.punkte, "begleitnotiz", verworfen, ["begriff"]),
    zu_tun: listeText(b.zu_tun, G.aufgabe, G.aufgaben, "begleitnotiz", verworfen, ["frist"]),
    fragen: listeText(b.fragen, G.frage, G.fragen, "begleitnotiz", verworfen),
  };
  if (!wert.wichtigste.length && !wert.zu_tun.length && !wert.fragen.length) return { fehler: "leer" };
  return { wert };
}

// ---------- Kapitellisten (wie kapitelPruefen in zentral.js) ----------
export const SEMESTER = /^(WS \d{4}\/\d{2}|SS \d{4})$/;
const KAPITEL_NR = /^[0-9A-Z][0-9A-Za-z.]{0,7}$/;
const KAPITEL_DOMAINS = ["uni-tuebingen.de", "core-econ.org"]; // Uni und das freie Lehrbuch von CORE
const reinerText = (v) => typeof v === "string" && !GEFAEHRLICH.test(v) && !/[\[\]<>{}|\\]/.test(v); // wie titel bei Terminen
const kapitelTitel = (v) => (reinerText(v) ? saeubern(v, G.kapitelTitel, true) : { fehler: "unzulässig" });
const ganzZahl = (v, min, max) => (v == null || v === "" ? { wert: null } : Number.isInteger(v) && v >= min && v <= max ? { wert: v } : { fehler: "ungültig" });
const tagFeld = (v) => (v == null || v === "" ? { wert: "" } : datumOk(v) ? { wert: v } : { fehler: "ungültig" });
// Link nur https auf die Domains (auch Subdomains), ohne Anmeldung und Port; Klammern kodiert wie im Plugin
function urlPruefen(v) {
  if (typeof v !== "string" || v.length > G.url || /[\s"'<>`\\]/.test(v)) return { fehler: "Link ungültig" };
  let u;
  try { u = new URL(v); } catch (e) { return { fehler: "Link ungültig" }; }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return { fehler: "Link nicht https" };
  const h = u.hostname.toLowerCase();
  if (!KAPITEL_DOMAINS.some((d) => h === d || h.endsWith("." + d))) return { fehler: "Domain nicht erlaubt" };
  return { wert: v.replace(/\(/g, "%28").replace(/\)/g, "%29") };
}
// Ein Kapitel → { wert } in der Form von kapitel.json (leere Felder weggelassen) oder { fehler }. vorlesung ist ein Beleg, nie
// ein Tag nach dem Lauf: ein späterer fällt weg (das Kapitel bleibt).
function kapitelNormal(k, heute) {
  if (!istObjekt(k)) return { fehler: "kein Objekt" };
  if (typeof k.nr !== "string" || !KAPITEL_NR.test(k.nr)) return { fehler: "nr ungültig" };
  const titel = kapitelTitel(k.titel);
  if (titel.fehler) return { fehler: "titel " + titel.fehler };
  const seiten = ganzZahl(k.seiten, 1, 2000), folien = ganzZahl(k.folien, 0, 99);
  if (seiten.fehler) return { fehler: "seiten ungültig" };
  if (folien.fehler) return { fehler: "folien ungültig" };
  const vorlesung = tagFeld(k.vorlesung), zwischentest = tagFeld(k.zwischentest);
  if (vorlesung.fehler) return { fehler: "vorlesung ungültig" };
  if (zwischentest.fehler) return { fehler: "zwischentest ungültig" };
  const url = k.url == null || k.url === "" ? { wert: "" } : urlPruefen(k.url);
  if (url.fehler) return { fehler: "url: " + url.fehler };
  const teile = [];
  if (k.teile != null) {
    if (!Array.isArray(k.teile) || k.teile.length > G.teile) return { fehler: "teile ungültig" };
    for (const t of k.teile) {
      if (!istObjekt(t) || typeof t.nr !== "string" || !KAPITEL_NR.test(t.nr)) return { fehler: "teil ungültig" };
      const tt = kapitelTitel(t.titel);
      if (tt.fehler) return { fehler: "teil " + t.nr + " titel " + tt.fehler };
      teile.push({ nr: t.nr, titel: tt.wert });
    }
  }
  const wert = { nr: k.nr, titel: titel.wert };
  if (seiten.wert != null) wert.seiten = seiten.wert;
  if (folien.wert != null) wert.folien = folien.wert;
  if (url.wert) wert.url = url.wert;
  if (teile.length) wert.teile = teile;
  if (vorlesung.wert && vorlesung.wert <= heute) wert.vorlesung = vorlesung.wert;
  if (zwischentest.wert) wert.zwischentest = zwischentest.wert;
  return { wert };
}
// Ein Modul → { wert: { code, semester, quelle, stand, vorlaeufig, kapitel } } oder { fehler }; ohne stand (oder mit einem Tag
// nach dem Lauf) gilt der Tag des Laufs
export function kapitelModulNormal(e, heute) {
  if (!istObjekt(e)) return { fehler: "kein Objekt" };
  if (typeof e.code !== "string" || !MODULCODE.test(e.code)) return { fehler: "code ungültig" };
  if (typeof e.semester !== "string" || !SEMESTER.test(e.semester)) return { fehler: "semester ungültig" };
  if (!reinerText(e.quelle == null ? "" : e.quelle)) return { fehler: "quelle unzulässig" };
  const quelle = saeubern(e.quelle, G.kapitelQuelle, false);
  if (quelle.fehler) return { fehler: "quelle " + quelle.fehler };
  if (!Array.isArray(e.kapitel) || !e.kapitel.length || e.kapitel.length > G.kapitel) return { fehler: "kapitel ungültig" };
  const kapitel = [];
  for (const k of e.kapitel) {
    const r = kapitelNormal(k, heute);
    if (r.fehler) return { fehler: "kapitel " + (istObjekt(k) && typeof k.nr === "string" ? k.nr.slice(0, 8) : "?") + ": " + r.fehler };
    kapitel.push(r.wert);
  }
  if (new Set(kapitel.map((k) => k.nr)).size !== kapitel.length) return { fehler: "doppelte Kapitelnummer" };
  return { wert: { code: e.code, semester: e.semester, quelle: quelle.wert, stand: datumOk(e.stand) && e.stand <= heute ? e.stand : heute,
    vorlaeufig: e.vorlaeufig === true, kapitel } };
}

// ---------- Herkunft eines Termins ----------
// Woher die Angaben eines Termins stammen (Feld „herkunft“ in Claudes Ausgabe, skill ausgabe.md): { mail: "uni-postfach/<Datei>" }
// (eine Mail in roh/), { gmail: "<Thread-ID>", domain, datum } oder { unterlage: "<Datei>" }. Für Mails aus roh/ nimmt der
// Server Domain, Urteil und Datum nie von Claude, sondern aus dem Kopf der Datei (mails, lauf.mjs mailsLesen; abrufen.py schreibt
// ihn); für Gmail gilt, was Claude angibt, mit Urteil „unbekannt“. Die Herkunft geht nie ins Eingang. → Objekt oder null
export const URTEILE = ["pass", "fehlgeschlagen", "unbekannt"];
export const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;
export const domainNormal = (d) => {
  const s = typeof d === "string" ? d.trim().toLowerCase().replace(/^(?:www\d{0,3}\.)+/, "") : "";
  return s.length <= 100 && DOMAIN.test(s) ? s : "";
};
export function herkunftNormal(h, mails = {}) {
  if (!istObjekt(h)) return null;
  if (typeof h.mail === "string") {
    const m = Object.prototype.hasOwnProperty.call(mails, h.mail) && istObjekt(mails[h.mail]) ? mails[h.mail] : null;
    return m ? { art: "mail", domain: domainNormal(m.domain), urteil: URTEILE.includes(m.urteil) ? m.urteil : "unbekannt", datum: datumOk(m.datum) ? m.datum : "" } : null;
  }
  if (typeof h.gmail === "string") return { art: "mail", domain: domainNormal(h.domain), urteil: "unbekannt", datum: datumOk(h.datum) ? h.datum : "" };
  if (typeof h.unterlage === "string") return { art: "unterlage", domain: "", urteil: "unbekannt", datum: "" };
  return null;
}

// Quelle eines Termins für den Vergleich (herkunftAnwenden): „mail:<Domain>“ (registrierbare Domain aus From, quelleDomain; mit Urteil
// „fehlgeschlagen“ eine eigene Quelle „mail:<Domain>:nicht-bestaetigt“, sonst gälte eine gefälschte Mail als derselbe Absender),
// „unterlage“ oder "" (unbekannt: keine oder eine ungültige Herkunft, Mail ohne Domain). Bestätigt ist die Domain nur bei Urteil
// „pass“; bei „unbekannt“ ist es die Domain, die die Mail angibt, bei Gmail die, die Claude nennt. Der Vergleich ist darum nur so
// stark wie das Urteil (abrufen.py authentifiziert): Ohne Urteil der Uni gilt eine Mail mit gefälschtem From als derselbe Absender.
// Registrierbar: die letzten zwei Teile, unter einer zweiteiligen Endung wie co.uk drei (eine Näherung ohne die Liste öffentlicher
// Endungen). So ist wiwi.uni-tuebingen.de dieselbe Quelle wie uni-tuebingen.de. Ausnahme EIGENE_QUELLEN: Unter
// student.uni-tuebingen.de hat jede und jeder Studierende eine Adresse, darum bleibt das eine eigene Quelle.
const ZWEITE_EBENE = ["ac", "co", "com", "edu", "gov", "net", "org", "or", "ne", "go", "gv"];
const EIGENE_QUELLEN = ["student.uni-tuebingen.de"];
export function quelleDomain(d) {
  const domain = domainNormal(d);
  if (!domain) return "";
  const eigen = EIGENE_QUELLEN.find((e) => domain === e || domain.endsWith("." + e));
  if (eigen) return eigen;
  const teile = domain.split(".");
  const n = teile.length >= 3 && teile[teile.length - 1].length === 2 && ZWEITE_EBENE.includes(teile[teile.length - 2]) ? 3 : 2;
  return teile.slice(-n).join(".");
}
export const quelleVon = (h) => (!h ? "" : h.art === "unterlage" ? "unterlage"
  : h.art === "mail" && quelleDomain(h.domain) ? "mail:" + quelleDomain(h.domain) + (h.urteil === "fehlgeschlagen" ? ":nicht-bestaetigt" : "") : "");
// Gemerkte Quellen einer früheren Fassung nennen die ganze Domain (mail:wiwi.uni-tuebingen.de): vor dem Vergleich ebenso gekürzt
const quelleGekuerzt = (q) => {
  const m = /^mail:([^:]+)(:nicht-bestaetigt)?$/.exec(String(q || ""));
  return m ? "mail:" + quelleDomain(m[1]) + (m[2] || "") : String(q || "");
};

// Hinweise des Servers vor der info eines Termins. Was davon schon in Claudes info steht (abgeschrieben aus bisher.json), fällt dort
// erst weg; dann die Hinweise, dann Claudes info, zusammen höchstens G.info Zeichen (die info an einer Wortgrenze gekürzt).
export const NICHT_BESTAETIGT = "Absender nicht bestätigt.";
const SERVER_HINWEIS = /(?:Geändert durch (?:Mail von [a-z0-9.-]+|eine Unterlage|eine nicht genannte Quelle) vom \d{2}\.\d{2}\.\d{4}\.|Absender nicht bestätigt\.)\s*/g;
function infoMit(hinweise, info) {
  const eigen = String(info || "").replace(SERVER_HINWEIS, "").trim();
  if (!hinweise.length) return eigen;
  const vorn = hinweise.join(" ");
  const platz = G.info - vorn.length - 1;
  let rest = eigen;
  if (rest.length > platz) {
    const t = rest.slice(0, Math.max(0, platz - 1)), i = t.lastIndexOf(" ");
    rest = platz > 1 ? (i > platz / 2 ? t.slice(0, i) : t).trim() + "…" : "";
  }
  const r = lesetext(rest ? vorn + " " + rest : vorn, G.info, false);
  return r.fehler ? vorn : r.wert;
}
const datumDeutsch = (d) => `${d.slice(8, 10)}.${d.slice(5, 7)}.${d.slice(0, 4)}`;
// „Geändert durch Mail von <Domain> vom <Datum der Mail>.“ (ohne Datum der Tag des Laufs)
function geaendertDurch(h, heute) {
  const tag = datumDeutsch(h && h.datum ? h.datum : heute);
  if (h && h.art === "mail" && h.domain) return `Geändert durch Mail von ${h.domain} vom ${tag}.`;
  return h && h.art === "unterlage" ? `Geändert durch eine Unterlage vom ${tag}.` : `Geändert durch eine nicht genannte Quelle vom ${tag}.`;
}

// Herkunft auf die Termine anwenden → { termine, quellen }. quellen (termine-quellen.json des Servers, nie im Eingang): id →
// { quelle (quelleVon der Herkunft, aus der der Termin zuerst kam), fremd? (Hinweis der letzten Änderung aus einer anderen Quelle) }.
// - Absender nicht bestätigt: Stammt der Termin aus einer Mail mit Urteil „fehlgeschlagen“ (nur aus dem Kopf einer Mail in roh/),
//   ist er nie „offiziell“, und die info beginnt mit „Absender nicht bestätigt.“. Urteil „unbekannt“ (keine Kopfzeile
//   Authentication-Results) ändert nichts: Ob der Mailserver der Uni sie setzt, ist nicht bekannt.
// - Änderung aus einer anderen Quelle: Ändert eine Lieferung Datum, Ende, Uhrzeit oder Absage eines bekannten Termins (bestand) und
//   kommt sie aus einer anderen Quelle als der Termin (auch aus einer unbekannten), gilt sie nur als „geschätzt“, mit „Geändert durch
//   Mail von <Domain> vom <Datum>.“ vorn in der info. Das bleibt so, bis die erste Quelle den Termin wieder nennt; eine Änderung
//   aus derselben Quelle gilt wie bisher. Ein Termin ohne gemerkte Quelle (vor dieser Fassung geliefert) bekommt die Quelle seiner
//   nächsten Lieferung, und diese gilt wie bisher.
export function herkunftAnwenden(termine, herkunft, { bestand = {}, quellen = {}, heute = "" } = {}) {
  const hat = (o, k) => istObjekt(o) && Object.prototype.hasOwnProperty.call(o, k);
  const neu = {};
  const aus = termine.map((t) => {
    const h = hat(herkunft, t.id) ? herkunft[t.id] : null;
    const quelle = quelleVon(h);
    const q = hat(quellen, t.id) && istObjekt(quellen[t.id]) && typeof quellen[t.id].quelle === "string" ? quellen[t.id] : null;
    const vorher = hat(bestand, t.id) && istObjekt(bestand[t.id]) ? bestand[t.id] : null;
    const hinweise = [];
    let eintrag = quelle ? { quelle } : null;
    if (vorher && q) {
      const geaendert = ["datum", "bis", "uhrzeit"].some((k) => String(vorher[k] || "") !== String(t[k] || "")) || (vorher.entfaellt === true) !== (t.entfaellt === true);
      eintrag = { quelle: q.quelle };
      if (quelle !== quelleGekuerzt(q.quelle) && (geaendert || typeof q.fremd === "string")) eintrag.fremd = geaendert ? geaendertDurch(h, heute) : q.fremd;
      if (eintrag.fremd) hinweise.push(eintrag.fremd);
    }
    if (h && h.urteil === "fehlgeschlagen") hinweise.push(NICHT_BESTAETIGT);
    if (eintrag) neu[t.id] = eintrag;
    return { ...t, ...(hinweise.length ? { status: "geschätzt" } : {}), info: infoMit(hinweise, t.info) };
  });
  return { termine: aus, quellen: { ...(istObjekt(quellen) ? quellen : {}), ...neu } };
}

// Claudes Ausgabe eines Laufs → { eingang, verworfen, herkunft (id → herkunftNormal) }. Einzelne ungültige Einträge fallen weg,
// der Rest bleibt. mails: Kopf der Mails in roh/ (lauf.mjs mailsLesen).
export function eingangNormal(roh, { jetzt = new Date(), lauf = "", mails = {} } = {}) {
  const heute = jetzt.toISOString().slice(0, 10);
  const verworfen = [];
  if (!istObjekt(roh)) return { fehler: "Ausgabe ist kein Objekt" };
  const termine = [];
  const ids = new Set();
  const herkunft = {};
  for (const e of Array.isArray(roh.termine) ? roh.termine.slice(0, G.termine) : []) {
    const r = terminNormal(e, heute);
    if (r.fehler) { verworfen.push({ art: "termin", schluessel: istObjekt(e) ? String(e.schluessel || "").slice(0, 80) : "", grund: r.fehler }); continue; }
    if (ids.has(r.wert.id)) { verworfen.push({ art: "termin", schluessel: r.wert.schluessel.slice(0, 80), grund: "doppelter schluessel" }); continue; }
    ids.add(r.wert.id);
    termine.push(r.wert);
    const h = herkunftNormal(e.herkunft, mails);
    if (h) herkunft[r.wert.id] = h;
  }
  const begleitnotizen = [];
  for (const b of Array.isArray(roh.begleitnotizen) ? roh.begleitnotizen.slice(0, G.begleitnotizen) : []) {
    const r = begleitnotizNormal(b, verworfen);
    if (r.fehler) verworfen.push({ art: "begleitnotiz", grund: r.fehler });
    else begleitnotizen.push(r.wert);
  }
  const hinweise = [];
  for (const h of Array.isArray(roh.hinweise) ? roh.hinweise.slice(0, G.hinweise) : []) {
    const text = lesetext(istObjekt(h) ? h.text : h, G.hinweis, true);
    const quelle = lesetext(istObjekt(h) ? h.quelle : "", G.quelleText, false);
    if (text.fehler || quelle.fehler) { verworfen.push({ art: "hinweis", grund: text.fehler || quelle.fehler }); continue; }
    // Modul, zu dem der Hinweis gehört (Modulfeld in Obsidian); ein ungültiger Code fällt weg, der Hinweis bleibt
    const code = istObjekt(h) && typeof h.code === "string" && MODULCODE.test(h.code) ? h.code : "";
    hinweise.push(Object.assign(quelle.wert ? { text: text.wert, quelle: quelle.wert } : { text: text.wert }, code ? { code } : {}));
  }
  // Doppelte To-dos: Paare { behalten, weg } aus Kennungen des Auszugs; jedes To-do höchstens einmal als „weg“, nie beides
  const todo_doppel = [];
  const wegSchon = new Set(), behaltenSchon = new Set();
  for (const p of Array.isArray(roh.todo_doppel) ? roh.todo_doppel.slice(0, G.todoDoppel) : []) {
    const ok = istObjekt(p) && TODO_ID.test(String(p.behalten)) && TODO_ID.test(String(p.weg)) && p.behalten !== p.weg;
    if (!ok || wegSchon.has(p.weg) || wegSchon.has(p.behalten) || behaltenSchon.has(p.weg)) { verworfen.push({ art: "todo_doppel", grund: ok ? "Kette oder doppelt" : "Kennung" }); continue; }
    wegSchon.add(p.weg); behaltenSchon.add(p.behalten);
    todo_doppel.push({ behalten: p.behalten, weg: p.weg });
  }
  // Kapitellisten: je Code und Semester eine, immer die ganze Liste
  const kapitel = [];
  const kapitelSchon = new Set();
  for (const e of Array.isArray(roh.kapitel) ? roh.kapitel.slice(0, G.kapitelModule) : []) {
    const id = istObjekt(e) ? `${String(e.code || "").slice(0, 8)} ${String(e.semester || "").slice(0, 12)}` : "?";
    if (kapitelSchon.has(id)) { verworfen.push({ art: "kapitel", id, grund: "doppelt" }); continue; }
    kapitelSchon.add(id);
    const r = kapitelModulNormal(e, heute);
    if (r.fehler) verworfen.push({ art: "kapitel", id, grund: r.fehler });
    else kapitel.push(r.wert);
  }
  const quellen = (Array.isArray(roh.quellen) ? roh.quellen : []).filter((q) => QUELLEN.includes(q));
  return {
    eingang: { schema: EINGANG_SCHEMA, erstellt: jetzt.toISOString(), lauf: String(lauf).slice(0, 80), quellen: [...new Set(quellen)], termine, begleitnotizen, hinweise,
      todo_doppel, kapitel },
    verworfen,
    herkunft,
  };
}

// Zahlen zum Gmail-Überblick (skill termine.md): wie viele Mails Claude sah, wie viele es ganz las, ob eine Grenze griff. Nur für
// protokoll.json, nie ins Eingang; ohne gültige Zahlen null.
const UEBERBLICK_MAX = 10000;
export function gmailUeberblick(roh) {
  const u = istObjekt(roh) && istObjekt(roh.gmail_ueberblick) ? roh.gmail_ueberblick : null;
  const zahl = (n) => Number.isInteger(n) && n >= 0 && n <= UEBERBLICK_MAX;
  if (!u || !zahl(u.gelistet) || !zahl(u.gelesen) || u.gelesen > u.gelistet) return null;
  return { gelistet: u.gelistet, gelesen: u.gelesen, begrenzt: u.begrenzt === true };
}

// Vergleicht mit dem Bestand (id → Termin): Nur neue oder geänderte Termine gehen ins Eingang. `geprueft` zählt nicht als Änderung.
// Ein Termin, der schon vorbei ist (Ende vor dem Tag des Laufs), kommt nur als Änderung eines bekannten Termins durch (z. B. Absage).
// Im Bestand bleibt ein vergangener Termin BESTAND_TAGE (Tage nach seinem Ende).
const BESTAND_TAGE = 60;
export function nurNeueOderGeaenderte(eingang, bestand) {
  const heute = String(eingang.erstellt || "").slice(0, 10);
  const ohneZeit = (t) => JSON.stringify({ ...t, geprueft: "" });
  const termine = eingang.termine.filter((t) => (bestand[t.id] ? ohneZeit(bestand[t.id]) !== ohneZeit(t) : (t.bis || t.datum) >= heute));
  const neuerBestand = { ...bestand };
  for (const t of eingang.termine) if (bestand[t.id] || termine.includes(t)) neuerBestand[t.id] = t;
  // Vergangenes nach BESTAND_TAGE fällt weg (sonst wüchse termine.json und bisher.json im Auftrag mit jedem Semester); meldet
  // Claude so einen Termin noch einmal, bleibt er draußen wie jeder neue in der Vergangenheit
  const zeit = Date.parse(heute);
  if (Number.isFinite(zeit)) {
    const grenze = new Date(zeit - BESTAND_TAGE * 864e5).toISOString().slice(0, 10);
    for (const [id, t] of Object.entries(neuerBestand)) if (String((t && (t.bis || t.datum)) || "") < grenze) delete neuerBestand[id];
  }
  return { eingang: { ...eingang, termine }, bestand: neuerBestand };
}

// Hinweise nur einmal: Claude liest dieselbe Mail manchmal zweimal (überlappende Gmail-Zeiträume, Sicherheitslauf). bisher:
// { Kurz-Hash des Texts ohne Groß-/Kleinschreibung, Leer- und Satzzeichen: Datum }, 60 Tage. → { hinweise, bisher }
const HINWEIS_TAGE = 60;
export const hinweisSchluessel = (text) => createHash("sha256").update(String(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()).digest("hex").slice(0, 16);
export function nurNeueHinweise(hinweise, bisher, jetzt = new Date()) {
  const grenze = new Date(jetzt.getTime() - HINWEIS_TAGE * 864e5).toISOString().slice(0, 10);
  const neuBisher = {};
  for (const [k, d] of Object.entries(bisher && typeof bisher === "object" ? bisher : {})) if (/^[0-9a-f]{16}$/.test(k) && String(d) >= grenze) neuBisher[k] = String(d).slice(0, 10);
  const heute = jetzt.toISOString().slice(0, 10);
  const neu = [];
  for (const h of hinweise) {
    const k = hinweisSchluessel(h.text);
    if (neuBisher[k]) continue;
    neuBisher[k] = heute;
    neu.push(h);
  }
  return { hinweise: neu, bisher: neuBisher };
}

// Kapitellisten nur, wenn neu oder geändert, und nur für Module, nach denen das Plugin fragt (stand.json „lernplan“: laufendes
// Semester, keine zentrale Liste). bestand: { „<Code> <Semester>“: Liste } (kapitel.json des Servers; daraus bekommt Claude die
// bisherigen Listen, damit es berichtigt statt neu baut). `stand` zählt nicht als Änderung. Im Bestand bleibt nur das laufende
// Semester. → { kapitel, bestand, verworfen }
export function nurNeueKapitel(kapitel, bestand, lernplan) {
  const gefragt = istObjekt(lernplan) && SEMESTER.test(String(lernplan.semester)) && Array.isArray(lernplan.module) ? lernplan : { semester: "", module: [] };
  const neuerBestand = {};
  for (const [k, e] of Object.entries(istObjekt(bestand) ? bestand : {})) if (istObjekt(e) && e.semester === gefragt.semester) neuerBestand[k] = e;
  const ohneStand = (e) => JSON.stringify({ ...e, stand: "" });
  const neu = [], verworfen = [];
  for (const e of Array.isArray(kapitel) ? kapitel : []) {
    const id = `${e.code} ${e.semester}`;
    if (e.semester !== gefragt.semester || !gefragt.module.includes(e.code)) { verworfen.push({ art: "kapitel", id, grund: "nicht gefragt" }); continue; }
    if (neuerBestand[id] && ohneStand(neuerBestand[id]) === ohneStand(e)) continue;
    neuerBestand[id] = e;
    neu.push(e);
  }
  return { kapitel: neu, bestand: neuerBestand, verworfen };
}

export const istLeer = (e) => !e.termine.length && !e.begleitnotizen.length && !e.hinweise.length && !(e.todo_doppel || []).length && !(e.kapitel || []).length;
