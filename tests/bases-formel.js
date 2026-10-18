// Kleiner Auswerter für Bases-Formeln (Obsidian Bases), nur für Tests: genug Sprache, um die Formeln der Vorlage, die eine Regel
// des Fachmodells nachbilden, auf ausgedachten Notizen auszurechnen und mit dem JavaScript des Modells zu vergleichen
// (tests/bases-regeln.test.js). Kennt: Zahlen, Texte, Listen, Regex-Literale, if() (faul), date(), today(), duration(),
// number(), min(), max(), html(), file(); Vergleiche, && || !, + - * /; Methoden der Texte, Zahlen, Listen (filter, map, reduce
// mit value, index, acc), Daten (format, days) und Dateien (properties, backlinks, asFile, name). Was fehlt, wirft einen Fehler.
"use strict";

// ---------- Zerlegen ----------
const ZEICHEN = ["&&", "||", "==", "!=", "<=", ">=", "(", ")", "[", "]", ",", ".", "+", "-", "*", "/", "<", ">", "!"];
function zerlegen(text) {
  const t = [];
  let i = 0;
  // „/“ beginnt ein Regex-Literal am Anfang und nach einem Operator oder einer Klammer auf, sonst ist es geteilt durch
  const regexErlaubt = () => { const vor = t[t.length - 1]; return !vor || (vor.art === "z" && vor.wert !== ")" && vor.wert !== "]"); };
  while (i < text.length) {
    const c = text[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9]/.test(c)) { const m = text.slice(i).match(/^\d+(\.\d+)?/); t.push({ art: "zahl", wert: +m[0] }); i += m[0].length; continue; }
    if (c === '"' || c === "'") {
      let j = i + 1, s = "";
      while (j < text.length && text[j] !== c) { if (text[j] === "\\") { s += text[j + 1]; j += 2; } else s += text[j++]; }
      t.push({ art: "text", wert: s }); i = j + 1; continue;
    }
    if (c === "/" && regexErlaubt()) {
      let j = i + 1, klasse = false;
      while (j < text.length && (text[j] !== "/" || klasse)) { if (text[j] === "\\") j++; else if (text[j] === "[") klasse = true; else if (text[j] === "]") klasse = false; j++; }
      const quelle = text.slice(i + 1, j);
      const f = text.slice(j + 1).match(/^[gimsuy]*/)[0];
      t.push({ art: "regex", wert: new RegExp(quelle, f) }); i = j + 1 + f.length; continue;
    }
    if (/[A-Za-zÄÖÜäöüß_]/.test(c)) { const m = text.slice(i).match(/^[A-Za-zÄÖÜäöüß_][A-Za-z0-9ÄÖÜäöüß_]*/); t.push({ art: "name", wert: m[0] }); i += m[0].length; continue; }
    const z = ZEICHEN.find((x) => text.startsWith(x, i));
    if (!z) throw new Error("Bases-Formel: unbekanntes Zeichen " + c + " in " + text);
    t.push({ art: "z", wert: z }); i += z.length;
  }
  return t;
}

// ---------- Baum ----------
function baum(text) {
  const t = zerlegen(text);
  let p = 0;
  const ist = (w) => t[p] && t[p].art === "z" && t[p].wert === w;
  const nimm = (w) => { if (!ist(w)) throw new Error(`Bases-Formel: „${w}“ erwartet bei ${p} in ${text}`); p++; };
  const liste = (ende) => { const a = []; if (!ist(ende)) { a.push(oder()); while (ist(",")) { p++; a.push(oder()); } } nimm(ende); return a; };
  const zwei = (unter, ops) => () => { let l = unter(); while (t[p] && t[p].art === "z" && ops.includes(t[p].wert)) { const op = t[p++].wert; l = { op, l, r: unter() }; } return l; };
  const primaer = () => {
    const x = t[p++];
    if (!x) throw new Error("Bases-Formel: Ende zu früh in " + text);
    if (x.art === "zahl" || x.art === "text" || x.art === "regex") return { wert: x.wert };
    if (x.art === "name") { if (ist("(")) { p++; return { ruf: x.wert, args: liste(")") }; } return { name: x.wert }; }
    if (x.wert === "(") { const e = oder(); nimm(")"); return e; }
    if (x.wert === "[") return { liste: liste("]") };
    if (x.wert === "!" || x.wert === "-") return { un: x.wert, e: postfix() };
    throw new Error("Bases-Formel: unerwartet " + x.wert + " in " + text);
  };
  const postfix = () => {
    let e = primaer();
    for (;;) {
      if (ist(".")) { p++; const n = t[p++].wert; if (ist("(")) { p++; e = { methode: n, auf: e, args: liste(")") }; } else e = { feld: n, auf: e }; }
      else if (ist("[")) { p++; const i = oder(); nimm("]"); e = { index: i, auf: e }; }
      else return e;
    }
  };
  const mal = zwei(postfix, ["*", "/"]);
  const plus = zwei(mal, ["+", "-"]);
  const vergleich = zwei(plus, ["<", "<=", ">", ">="]);
  const gleich = zwei(vergleich, ["==", "!="]);
  const und = zwei(gleich, ["&&"]);
  const oder = zwei(und, ["||"]);
  const e = oder();
  if (p < t.length) throw new Error("Bases-Formel: Rest ab " + p + " in " + text);
  return e;
}

// ---------- Werte ----------
class Datum { constructor(d) { this.d = new Date(d.getFullYear(), d.getMonth(), d.getDate()); } }
class Dauer { constructor(ms) { this.ms = ms; } get days() { return this.ms / 864e5; } }
class Html { constructor(s) { this.s = s; } toString() { return this.s; } }
const zwei = (n) => String(n).padStart(2, "0");
const datumAus = (v) => {
  if (v instanceof Datum) return v;
  const m = String(v == null ? "" : v).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) throw new Error("Bases-Formel: kein Datum " + v);
  return new Datum(new Date(+m[1], +m[2] - 1, +m[3]));
};
const wahr = (v) => !(v == null || v === false || v === "" || v === 0 || (Array.isArray(v) && !v.length));
const text = (v) => (v == null ? "" : v instanceof Datum ? `${v.d.getFullYear()}-${zwei(v.d.getMonth() + 1)}-${zwei(v.d.getDate())}` : String(v));
const zahlVon = (v) => (v instanceof Datum ? v.d.getTime() : typeof v === "number" ? v : v == null || v === "" ? NaN : Number(v));
const formatieren = (d, f) => f.replace(/YYYY|MM|DD|E|W|M|D|d/g, (k) => ({
  YYYY: d.getFullYear(), MM: zwei(d.getMonth() + 1), DD: zwei(d.getDate()), M: d.getMonth() + 1, D: d.getDate(), d: d.getDay(), E: d.getDay() || 7,
  W: (() => { const u = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const w = u.getUTCDay() || 7; u.setUTCDate(u.getUTCDate() + 4 - w); return Math.ceil(((u - Date.UTC(u.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7); })(),
})[k]);

// ---------- Auswerten ----------
// welt: { heute: "YYYY-MM-DD", notizen: { pfad: props }, rueckverweise: { pfad: [pfade] } }; notiz: Pfad der Zeile (oder null)
function auswerten(ausdruck, welt, notiz, formeln = {}) {
  const datei = (pfad) => ({ __datei: true, pfad, name: pfad.split("/").pop().replace(/\.md$/, ""), properties: welt.notizen[pfad] || {} });
  const formelWert = {}; // Zwischenspeicher je Formel der Zeile
  const lauf = (e, umgebung) => {
    if ("wert" in e) return e.wert;
    if (e.name) {
      if (e.name in umgebung) return umgebung[e.name];
      if (e.name === "formula") return { __formeln: true };
      if (e.name === "file") return notiz ? datei(notiz) : null;
      if (e.name === "true" || e.name === "false") return e.name === "true";
      if (e.name === "null") return null;
      const props = notiz ? welt.notizen[notiz] || {} : {};
      return props[e.name] === undefined ? null : props[e.name];
    }
    if (e.liste) return e.liste.map((x) => lauf(x, umgebung));
    if (e.un) { const v = lauf(e.e, umgebung); return e.un === "!" ? !wahr(v) : -zahlVon(v); }
    if (e.op) {
      if (e.op === "&&") return wahr(lauf(e.l, umgebung)) && wahr(lauf(e.r, umgebung));
      if (e.op === "||") return wahr(lauf(e.l, umgebung)) || wahr(lauf(e.r, umgebung));
      const l = lauf(e.l, umgebung), r = lauf(e.r, umgebung);
      if (e.op === "==" || e.op === "!=") {
        const g = l instanceof Datum || r instanceof Datum ? zahlVon(l) === zahlVon(r) : (l == null ? null : l) === (r == null ? null : r);
        return e.op === "==" ? g : !g;
      }
      if (e.op === "+") {
        if (l instanceof Datum && r instanceof Dauer) return new Datum(new Date(l.d.getTime() + r.ms + 3600000 * 2));
        if (typeof l === "string" || typeof r === "string" || l instanceof Html || r instanceof Html) return text(l) + text(r);
        return zahlVon(l) + zahlVon(r);
      }
      if (e.op === "-") {
        if (l instanceof Datum && r instanceof Datum) return new Dauer(Math.round((l.d - r.d) / 864e5) * 864e5);
        if (l instanceof Datum && r instanceof Dauer) return new Datum(new Date(l.d.getTime() - r.ms + 3600000 * 2));
        return zahlVon(l) - zahlVon(r);
      }
      if (e.op === "*") return zahlVon(l) * zahlVon(r);
      if (e.op === "/") return zahlVon(l) / zahlVon(r);
      const a = zahlVon(l), b = zahlVon(r);
      return e.op === "<" ? a < b : e.op === "<=" ? a <= b : e.op === ">" ? a > b : a >= b;
    }
    if (e.feld) {
      const o = lauf(e.auf, umgebung);
      if (o && o.__formeln) return formel(e.feld);
      if (o && o.__datei) {
        if (e.feld === "properties") return o.properties;
        if (e.feld === "backlinks") return (welt.rueckverweise[o.pfad] || []).map((p) => ({ __link: p }));
        if (e.feld === "name" || e.feld === "basename") return o.name;
        if (e.feld === "path") return o.pfad;
      }
      if (o instanceof Dauer && e.feld === "days") return o.days;
      if ((typeof o === "string" || Array.isArray(o)) && e.feld === "length") return o.length;
      if (o && typeof o === "object" && !Array.isArray(o)) return o[e.feld] === undefined ? null : o[e.feld];
      if (o == null) return null;
      throw new Error("Bases-Formel: Feld " + e.feld);
    }
    if (e.index) { const o = lauf(e.auf, umgebung), i = zahlVon(lauf(e.index, umgebung)); return Array.isArray(o) || typeof o === "string" ? (o[i] === undefined ? null : o[i]) : null; }
    if (e.ruf) return funktion(e, umgebung);
    if (e.methode) return methode(e, umgebung);
    throw new Error("Bases-Formel: unbekannter Knoten");
  };
  const funktion = (e, u) => {
    const a = () => e.args.map((x) => lauf(x, u));
    switch (e.ruf) {
      case "if": return wahr(lauf(e.args[0], u)) ? lauf(e.args[1], u) : e.args[2] ? lauf(e.args[2], u) : null;
      case "date": return datumAus(a()[0]);
      case "today": return datumAus(welt.heute);
      case "now": return new Datum(new Date(welt.heute + "T12:00:00"));
      case "duration": { const m = String(a()[0]).match(/^(-?\d+)d$/); return new Dauer(+m[1] * 864e5); }
      case "number": { const v = a()[0]; return typeof v === "number" ? v : v instanceof Datum ? v.d.getTime() : parseFloat(text(v)); }
      case "min": return Math.min(...a().map(zahlVon));
      case "max": return Math.max(...a().map(zahlVon));
      case "html": return new Html(text(a()[0]));
      case "file": return datei(text(a()[0]));
      default: throw new Error("Bases-Formel: Funktion " + e.ruf);
    }
  };
  const methode = (e, u) => {
    const o = lauf(e.auf, u), n = e.methode;
    const arg = (i) => lauf(e.args[i], u);
    const je = (wert, index, extra) => lauf(e.args[0], Object.assign({}, u, { value: wert, index }, extra || {}));
    if (o instanceof RegExp && n === "matches") return o.test(text(arg(0)));
    if (n === "toString") return text(o);
    if (n === "isTruthy") return wahr(o);
    if (n === "isType") return arg(0) === "null" ? o == null : typeof o === arg(0);
    if (o && o.__link && n === "asFile") return datei(o.__link);
    if (o instanceof Datum) {
      if (n === "format") return String(formatieren(o.d, text(arg(0))));
      throw new Error("Bases-Formel: Datum." + n);
    }
    if (Array.isArray(o)) {
      if (n === "filter") return o.filter((v, i) => wahr(je(v, i)));
      if (n === "map") return o.map((v, i) => je(v, i));
      if (n === "reduce") { let acc = arg(1); o.forEach((v, i) => { acc = je(v, i, { acc }); }); return acc; }
      if (n === "contains") { const x = arg(0); return o.some((v) => (v instanceof Datum && x instanceof Datum ? zahlVon(v) === zahlVon(x) : v === x)); }
      if (n === "sort") return o.slice().sort((a, b) => (a instanceof Datum ? zahlVon(a) - zahlVon(b) : text(a) < text(b) ? -1 : text(a) > text(b) ? 1 : 0));
      if (n === "flat") return [].concat(...o.map((v) => (Array.isArray(v) ? v : [v])));
      if (n === "join") return o.map(text).join(text(arg(0)));
      if (n === "slice") return o.slice(zahlVon(arg(0)), e.args[1] ? zahlVon(arg(1)) : undefined);
      throw new Error("Bases-Formel: Liste." + n);
    }
    if (typeof o === "number") {
      if (n === "floor") return Math.floor(o);
      if (n === "round") return Math.round(o);
      if (n === "abs") return Math.abs(o);
      if (n === "toFixed") return o.toFixed(zahlVon(arg(0)));
      throw new Error("Bases-Formel: Zahl." + n);
    }
    const s = text(o);
    if (n === "lower") return s.toLowerCase();
    if (n === "upper") return s.toUpperCase();
    if (n === "trim") return s.trim();
    if (n === "contains") return s.indexOf(text(arg(0))) >= 0;
    if (n === "startsWith") return s.startsWith(text(arg(0)));
    if (n === "split") return s.split(text(arg(0)));
    if (n === "slice") return s.slice(zahlVon(arg(0)), e.args[1] ? zahlVon(arg(1)) : undefined);
    if (n === "replace") { const a = arg(0); return s.replace(a instanceof RegExp ? a : text(a), text(arg(1))); }
    throw new Error("Bases-Formel: Text." + n);
  };
  const formel = (name) => {
    if (!(name in formelWert)) {
      if (!(name in formeln)) throw new Error("Bases-Formel: formula." + name + " fehlt");
      formelWert[name] = null; // Schutz gegen Kreise
      formelWert[name] = lauf(baum(formeln[name]), {});
    }
    return formelWert[name];
  };
  return lauf(baum(ausdruck), {});
}

// Formeln eines ```base-Blocks (in einer Karte, „> “ davor) als { name: text }; nimmt einzeilige 'x' und |- Blöcke
function formelnAus(block) {
  const zeilen = block.split("\n").map((z) => z.replace(/^(> ?)+/, ""));
  const aus = {};
  const a = zeilen.findIndex((z) => /^formulas:\s*$/.test(z));
  if (a < 0) return aus;
  for (let i = a + 1; i < zeilen.length && /^\s/.test(zeilen[i]); i++) {
    const m = zeilen[i].match(/^ {2}([A-Za-z0-9_]+):\s*(.*)$/);
    if (!m) continue;
    if (m[2] === "|-") { aus[m[1]] = zeilen[i + 1].trim(); i++; continue; }
    aus[m[1]] = m[2].replace(/^'(.*)'$/, "$1").replace(/''/g, "'");
  }
  return aus;
}

module.exports = { auswerten, formelnAus, Datum, Html };
