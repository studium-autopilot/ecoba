// Eingang v1: Ergebnisse eines Claude-Laufs auf dem eigenen Server, geprüft und vereinheitlicht, bevor das Plugin sie abholt.
// Claude liefert nur Inhalte mit einem stabilen Schlüssel je Termin (z. B. Quelle + laufende Nummer); die id leitet der Server
// daraus ab (nie das Modell). Die Regeln entsprechen termineNormal in zentral.js (docs/daten-v1.md, termine.json), damit das
// Plugin die Termine mit derselben Prüfung übernimmt (tests/server-eingang.test.js prüft das gegen zentral.js).
// Gleicher Schlüssel in einem späteren Lauf = Änderung desselben Termins.
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
  const roh = v.replace(WEG, "").replace(STEUER, " ").replace(/<%[\s\S]*?%>/g, " ").replace(/<\/?[a-z!][^>]*>/gi, " ").replace(/obsidian:\/\/\S*/gi, " ").replace(/javascript:/gi, " ")
    .replace(/\[\[|\]\]|`/g, " ");
  const s = (links ? linksEntschaerfen(roh, links) : roh).replace(/\s+/g, " ").trim();
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

// Claudes Ausgabe eines Laufs → { eingang, verworfen }. Einzelne ungültige Einträge fallen weg, der Rest bleibt.
export function eingangNormal(roh, { jetzt = new Date(), lauf = "" } = {}) {
  const heute = jetzt.toISOString().slice(0, 10);
  const verworfen = [];
  if (!istObjekt(roh)) return { fehler: "Ausgabe ist kein Objekt" };
  const termine = [];
  const ids = new Set();
  for (const e of Array.isArray(roh.termine) ? roh.termine.slice(0, G.termine) : []) {
    const r = terminNormal(e, heute);
    if (r.fehler) { verworfen.push({ art: "termin", schluessel: istObjekt(e) ? String(e.schluessel || "").slice(0, 80) : "", grund: r.fehler }); continue; }
    if (ids.has(r.wert.id)) { verworfen.push({ art: "termin", schluessel: r.wert.schluessel.slice(0, 80), grund: "doppelter schluessel" }); continue; }
    ids.add(r.wert.id);
    termine.push(r.wert);
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
