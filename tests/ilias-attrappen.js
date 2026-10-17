// Attrappen für tests/ilias.test.js: Tresor im Speicher, ein erfundenes ILIAS (Kurse, Ordner, Dateien), eine Uhr, die nur
// beim Warten weiterläuft, gerätelokaler Speicher und Schlüsselbund. Keine echten Namen, kein Netz.
"use strict";
const path = require("node:path");
const { laden } = require("./laden.js");

const enc = (s) => new TextEncoder().encode(s);
const dec = (b) => new TextDecoder("utf-8").decode(b);
const elternVon = (p) => { const i = p.lastIndexOf("/"); return i < 0 ? "" : p.slice(0, i); };

// eba.js wie in Obsidian (ctx.user.eba): eigener Uni-Abgleich
const EBA = require(path.join(__dirname, "..", "Studium Autopilot", "System", "Skripte", "eba.js"));
const I = laden("ilias", { kontext: { user: { eba: EBA } } }).ctx.ilias;

// Kennwort-Attrappe: darf nirgends auftauchen (Status, Protokoll, Fehler, Dateien)
const GEHEIM = "Sentinel-Kw/7Q x&ü";

function uhr(start) {
  let t = Date.parse(start);
  return { jetzt: () => new Date(t), warten: async (ms) => { t += ms; }, vor: (ms) => { t += ms; }, get t() { return t; } };
}

// gerätelokal wie app.saveLocalStorage (als JSON abgelegt)
function lokalSpeicher() {
  const m = new Map();
  return {
    m,
    lokal: (k, v) => {
      if (v === undefined) return m.has(k) ? JSON.parse(m.get(k)) : null;
      if (v == null) m.delete(k); else m.set(k, JSON.stringify(v));
      return v;
    },
    alles: () => Array.from(m.entries()).map((e) => e.join("=")).join("\n"),
  };
}

// Tresor: Pfad → Bytes; Ordner ergeben sich aus den Pfaden oder stehen in „ordner“. Pfadvergleich ohne Groß/Klein.
function tresor(start, ordnerListe) {
  const m = new Map();
  const ordner = new Set(ordnerListe || []);
  for (const p of Object.keys(start || {})) m.set(p, typeof start[p] === "string" ? enc(start[p]) : start[p]);
  const t = { m, ordner, stoerung: null, schreibvorgaenge: [] };
  const belegt = (p) => {
    const k = p.toLowerCase();
    for (const x of m.keys()) if (x.toLowerCase() === k) return true;
    for (const x of alleOrdner()) if (x.toLowerCase() === k) return true;
    return false;
  };
  const alleOrdner = () => {
    const s = new Set(ordner);
    for (const p of m.keys()) { const teile = p.split("/"); for (let i = 1; i < teile.length; i++) s.add(teile.slice(0, i).join("/")); }
    return s;
  };
  const stoer = (art, p) => { if (t.stoerung && t.stoerung(art, p)) throw new Error("Speicher voll: " + p); };
  const schreiben = (p, b) => { m.set(p, b); t.schreibvorgaenge.push(p); };
  t.io = {
    lesenText: async (p) => (m.has(p) ? dec(m.get(p)) : null),
    schreibenText: async (p, x) => { stoer("text", p); schreiben(p, enc(x)); },
    lesenBinaer: async (p) => (m.has(p) ? m.get(p) : null),
    anlegenBinaer: async (p, b) => { stoer("binaer", p); if (belegt(p)) throw new Error("gibt es schon: " + p); schreiben(p, new Uint8Array(b)); },
    anlegenText: async (p, x) => { stoer("notiz", p); if (belegt(p)) throw new Error("gibt es schon: " + p); schreiben(p, enc(x)); },
    ersetzenBinaer: async (p, b) => { stoer("ersetzen", p); if (!m.has(p)) throw new Error("fehlt: " + p); schreiben(p, new Uint8Array(b)); },
    loeschen: async (p) => { m.delete(p); },
    existiert: (p) => belegt(p),
    dateien: (unter) => Array.from(m.keys()).filter((p) => (!unter || p.indexOf(unter + "/") === 0) && !/\.md$/i.test(p))
      .map((p) => ({ pfad: p, groesse: m.get(p).length })),
    unterordner: (p) => Array.from(alleOrdner()).filter((o) => elternVon(o) === p).map((o) => o.slice(p ? p.length + 1 : 0)),
    ordnerAnlegen: async (p) => { if (p) ordner.add(p); },
    // wie processFrontMatter: nur Notizen mit typ: unterlage
    notizMarkieren: async (p, felder) => {
      if (!m.has(p)) return false;
      const x = dec(m.get(p));
      const fm = x.match(/^---\n([\s\S]*?)\n---/);
      if (!fm || !/^typ: unterlage$/m.test(fm[1])) return false;
      let kopf = fm[1];
      for (const k of Object.keys(felder)) {
        const re = new RegExp("^" + k + ":.*$", "m"), z = k + ": " + felder[k];
        kopf = re.test(kopf) ? kopf.replace(re, z) : kopf + "\n" + z;
      }
      schreiben(p, enc("---\n" + kopf + "\n---" + x.slice(fm[0].length)));
      return true;
    },
  };
  t.text = (p) => (m.has(p) ? dec(m.get(p)) : null);
  t.setzen = (p, x) => m.set(p, typeof x === "string" ? enc(x) : x);
  t.umbenennen = (alt, neu) => { for (const p of Array.from(m.keys())) { if (p === alt || p.indexOf(alt + "/") === 0) { m.set(neu + p.slice(alt.length), m.get(p)); m.delete(p); } } };
  t.pfade = (unter) => Array.from(m.keys()).filter((p) => p.indexOf(unter || "") === 0).sort();
  t.alles = () => Array.from(m.entries()).map((e) => e[0] + "\n" + dec(e[1])).join("\n");
  t.index = () => JSON.parse(t.text(I.K.INDEX));
  return t;
}

// Eintrag wie ilias-html.js inhalt(): Datei, Ordner, Sitzung
const B = "https://ilias.test/";
const datei = (refId, titel, endung, geaendert, extra) => Object.assign({ art: "datei", typ: "file", refId, id: refId, titel, endung, groesse: 1024, geaendert, url: B + "datei/" + refId }, extra || {});
const ordner = (refId, titel) => ({ art: "ordner", typ: "fold", refId, id: refId, titel, url: B + "ordner/" + refId });

// Erfundenes ILIAS. def: { kurse: [{ refId, titel, code, url }], seiten: { url: [Eintrag] }, dateien: { refId: Text | Bytes } }
function ilias(def, u) {
  const f = { def, log: [], stoerung: {} };
  const merken = (was, x) => f.log.push(Object.assign({ was, t: u.t }, x || {}));
  const nicht = () => { const e = new Error("HTTP 404"); e.status = 404; return e; };
  f.quelle = async (zugang, anmelden) => {
    merken("anmelden");
    await anmelden({ sitzung: f.log.length }, zugang, {});
    return {
      kurse: async () => { merken("kurse"); return def.kurse.map((k) => Object.assign({}, k)); },
      inhalt: async (k) => {
        merken("inhalt", { url: k.url });
        const s = f.stoerung.inhalt && f.stoerung.inhalt(k.url);
        if (s) throw s;
        if (!def.seiten[k.url]) throw nicht();
        return def.seiten[k.url].map((e) => Object.assign({}, e));
      },
      laden: async (e) => {
        merken("laden", { id: e.refId });
        const s = f.stoerung.laden && f.stoerung.laden(e.refId);
        if (s) throw s;
        const x = def.dateien[e.refId];
        if (x == null) throw nicht();
        return { status: 200, bytes: typeof x === "string" ? enc(x) : x };
      },
      name: (e) => e.titel + "." + e.endung,
    };
  };
  f.anzahl = (was) => f.log.filter((x) => x.was === was).length;
  f.geladen = () => f.log.filter((x) => x.was === "laden").map((x) => x.id);
  f.geholt = () => f.log.filter((x) => x.was === "inhalt").map((x) => x.url);
  f.leeren = () => { f.log.length = 0; };
  return f;
}

// Anmeldung wie ilias-anmeldung.js: { ok } bzw. { ok: false, grund, hinweis }; prüft nur das Kennwort
function anmeldung(erwartet) {
  const f = async (sitzung, zugang) => {
    f.aufrufe++;
    if (!sitzung || !zugang || typeof zugang.kennwortGeber !== "function") return { ok: false, grund: "unerwartet", hinweis: "falscher Aufruf" };
    return zugang.kennwortGeber() === erwartet ? { ok: true } : { ok: false, grund: "zugang-falsch", hinweis: "Benutzername oder Kennwort stimmt nicht." };
  };
  f.aufrufe = 0;
  return f;
}

// Einordner-Attrappe mit festen Regeln (unterlagen.js ändert sich unabhängig davon)
const EINORDNER = {
  vorschlag: (rel) => {
    const name = rel.split("/").pop().replace(/\.[^.]+$/, "");
    const art = /blatt/i.test(name) ? "Übung" : /folien/i.test(name) ? "Folien" : "Sonstiges";
    const m = name.match(/(\d{1,2})(?!\d)/);
    return { art, nr: m ? Number(m[1]) : null, titel: name.replace(/folien|blatt|vl\d*|\d+/gi, " ").replace(/\s+/g, " ").trim() };
  },
  zielName: (code, art, nr, titel) => [code, art, nr != null ? String(nr).padStart(2, "0") : "", titel].filter(Boolean).join(" "),
  titelAusPdf: null,
  begleitnotiz: null,
};

const MODULE = {
  B110: { name: "B110 Einführung in die Betriebswirtschaftslehre", titel: "Einführung in die Betriebswirtschaftslehre" },
  S100: { name: "S100 Mathematische Methoden der Wirtschaftswissenschaft", titel: "Mathematische Methoden der Wirtschaftswissenschaft" },
  SQ888: { name: "SQ888 Schreibwerkstatt", titel: "Schreibwerkstatt" },
};

// Kurse: B110 (Modul, an), Mathe-Vorkurs (ohne Code, aus), S100 (Modul, an; Unterordner SQ888), X999 (kein Modul, aus)
function standardIlias() {
  return {
    kurse: [
      { refId: "100", titel: "B110 Einführung in die BWL", code: "B110", url: B + "kurs/100" },
      { refId: "200", titel: "Mathe-Vorkurs", code: "", url: B + "kurs/200" },
      { refId: "300", titel: "S100 Mathematische Methoden", code: "S100", url: B + "kurs/300" },
      { refId: "400", titel: "X999 Unbekanntes Modul", code: "", url: B + "kurs/400" },
    ],
    seiten: {
      [B + "kurs/100"]: [
        datei("1001", "Folien VL01 Grundlagen", "pdf", "2026-10-13T10:00"),
        ordner("110", "Übungen"),
        { art: "forum", typ: "frm", refId: "130", titel: "Forum", url: B + "forum/130" },
        { art: "video", typ: "xvid", refId: "131", titel: "Aufzeichnung", url: B + "video/131" },
        { art: "link", typ: "webr", refId: "132", titel: "Link", url: B + "link/132" },
        { art: "sitzung", typ: "sess", refId: "120", titel: "Sitzung 2", url: B + "sitzung/120", sitzung: { name: "2026-10-20 Sitzung 2" } },
        datei("1201", "Folien VL02 Märkte", "pptx", "2026-10-15T09:00", { inSitzung: "120" }),
      ],
      [B + "ordner/110"]: [datei("1101", "Blatt 1", "pdf", "2026-10-14T08:00"), datei("1102", "Aufzeichnung VL1", "mp4", "2026-10-14T08:00")],
      [B + "kurs/200"]: [datei("2001", "Vorkurs Blatt 1", "pdf", "2026-10-01T08:00")],
      [B + "kurs/300"]: [ordner("310", "SQ888 Schreibwerkstatt"), datei("3001", "Skript Analysis", "pdf", "2026-10-12T08:00")],
      [B + "ordner/310"]: [datei("3101", "Leitfaden Hausarbeit", "pdf", "2026-10-11T08:00")],
      [B + "kurs/400"]: [datei("4001", "Info", "pdf", "2026-10-11T08:00")],
    },
    dateien: {
      1001: "%PDF Folien eins", 1201: "PPTX Folien zwei", 1101: "%PDF Blatt eins", 1102: "MP4 Video", 2001: "%PDF Vorkurs",
      3001: "%PDF Skript Analysis", 3101: "%PDF Leitfaden", 4001: "%PDF Info",
    },
  };
}

// Alles zusammen: Motor mit Attrappen. o: { dateien, ordner, ilias, mobil, geraet, einstellungen, ohneAnmeldung, anmeldung }
function aufbau(o) {
  o = o || {};
  const u = uhr(o.start || "2026-10-16T08:00:00.000Z");
  const t = tresor(o.dateien, o.ordner);
  const lok = lokalSpeicher();
  const geheimnisse = new Map();
  const il = ilias(o.ilias || standardIlias(), u);
  const anm = o.anmeldung || anmeldung(GEHEIM);
  const meldungen = [], hoerer = [];
  const abh = {
    io: t.io, lokal: lok.lokal,
    geheim: { lesen: (id) => geheimnisse.get(id) || null, schreiben: async (id, w) => { geheimnisse.set(id, w); }, loeschen: async (id) => { geheimnisse.delete(id); } },
    geheimId: () => I.geheimIdAus("Test-Tresor"),
    anmeldung: () => (o.ohneAnmeldung ? null : anm),
    quelle: o.quelle || il.quelle,
    einordner: () => EINORDNER,
    modul: (c) => MODULE[c] || null,
    semester: () => "WS 2026/27",
    einstellungen: () => o.einstellungen || {},
    jetzt: u.jetzt, warten: u.warten,
    mobil: !!o.mobil,
    geraetId: () => o.geraet || "g-ich",
    melden: (x) => meldungen.push(x),
    geaendert: (x) => hoerer.push(x),
  };
  const m = I.erzeugen(abh);
  return { m, t, u, il, lok, geheimnisse, abh, anm, meldungen, hoerer };
}

module.exports = { I, GEHEIM, B, enc, dec, uhr, tresor, ilias, anmeldung, datei, ordner, standardIlias, aufbau, EINORDNER, MODULE };
