// Der Tresor als Ordner auf der Platte, nur lesend, für den Connector (mcp.mjs). Prototyp: der Spiegel der LiveSync-Brücke auf
// einem eigenen Rechner; später die Kopie, die das Plugin auf den eigenen Server lädt (docs/architektur/connector.md).
// Gelesen werden nur Markdown-Notizen. Nie: System/ und Anhänge/ (erste Ebene), Ordner und Dateien mit „.“ am Anfang (.obsidian,
// .claude, .trash …), CLAUDE.md und AGENTS.md, Ordner aus „ohne“, Notizen mit privat: true, Dateien über DATEI_MAX und
// symbolische Links (so führt nichts aus dem Ordner hinaus). Werkzeuge greifen nur über die Pfade aus dem Verzeichnis zu, nie über
// einen Pfad, den Claude nennt.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export const NIE_ORDNER = ["System", "Anhänge"];
const NIE_DATEI = new Set(["claude.md", "agents.md"]);
export const DATEI_MAX = 2 * 1024 * 1024;
export const MODULCODE = /\b([A-Z]{1,4}[0-9][0-9X]{2}[A-Z]?)\b/;
const BM25 = { k1: 1.2, b: 0.75 };

const nfc = (s) => String(s).normalize("NFC");
const klein = (s) => nfc(s).toLowerCase();
// Für die Suche: Umlaute wie auf einer Tastatur ohne sie (ä → ae), so findet „Opportunitaetskosten“ auch „Opportunitätskosten“
const falten = (w) => w.replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
// Ein Wort, das in fast jeder Notiz steht, hilft der Suche nicht
const FUELLWOERTER = new Set(("der die das den dem des ein eine einer eines einem einen und oder aber nicht auch als an auf aus bei bis "
  + "durch für gegen im in ins ist sind war wird werden mit nach ohne über um unter von vor zu zum zur es er sie wir ihr ich du man "
  + "wie was wer wo wann sich so noch nur schon sehr mehr dass daß ob wenn dann da hier dort the of and to in is for on with").split(" ").map(falten));

// Wert einer Zeile im Frontmatter: der Teil von YAML, den Studium Autopilot schreibt (Text, "…", '…', true/false, ganze Zahlen,
// [a, b]); alles andere bleibt Text.
function wert(roh) {
  const v = roh.trim();
  if (v.length >= 2 && v.startsWith('"') && v.endsWith('"')) {
    try { return JSON.parse(v); } catch (e) { return v.slice(1, -1); }
  }
  if (v.length >= 2 && v.startsWith("'") && v.endsWith("'")) return v.slice(1, -1).replace(/''/g, "'");
  if (v === "true") return true;
  if (v === "false") return false;
  if (v === "" || v === "null" || v === "~") return null;
  if (/^-?\d{1,9}$/.test(v)) return Number(v);
  if (v.startsWith("[") && v.endsWith("]")) return v.slice(1, -1).split(",").map(wert).filter((x) => x !== null);
  return v;
}

// { fm, text }: Eigenschaften aus dem Frontmatter (Listen aus „- x“-Zeilen) und der Text danach.
export function frontmatter(inhalt) {
  const t = String(inhalt).replace(/^\ufeff/, "");
  const m = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(t);
  if (!m) return { fm: {}, text: t };
  const fm = {};
  let liste = null;
  for (const zeile of m[1].split(/\r?\n/)) {
    const punkt = /^\s+-\s?(.*)$/.exec(zeile);
    if (punkt && liste) {
      fm[liste].push(wert(punkt[1]));
      continue;
    }
    const k = /^([A-Za-z_][\w-]*):(?:\s+(.*)|)$/.exec(zeile);
    if (!k) {
      if (!/^\s/.test(zeile)) liste = null;
      continue;
    }
    liste = null;
    if (k[2] === undefined || k[2].trim() === "") {
      fm[k[1]] = [];
      liste = k[1];
    } else fm[k[1]] = wert(k[2]);
  }
  for (const [k, v] of Object.entries(fm)) if (Array.isArray(v) && !v.length) fm[k] = null;
  return { fm, text: t.slice(m[0].length) };
}

const ohneListe = (ohne) => (ohne || []).map((o) => klein(o).replace(/^\/+|\/+$/g, "")).filter(Boolean);

export function ordnerErlaubt(pfad, ohne = []) {
  const teile = nfc(pfad).split("/");
  if (teile.some((t) => !t || t.startsWith("."))) return false;
  if (NIE_ORDNER.some((o) => klein(o) === klein(teile[0]))) return false;
  const p = klein(pfad);
  return !ohneListe(ohne).some((o) => p === o || p.startsWith(o + "/"));
}

export function dateiErlaubt(pfad, ohne = []) {
  const teile = nfc(pfad).split("/");
  const name = teile[teile.length - 1];
  if (!/\.md$/i.test(name) || name.startsWith(".") || NIE_DATEI.has(klein(name))) return false;
  return teile.length === 1 ? true : ordnerErlaubt(teile.slice(0, -1).join("/"), ohne);
}

// Modulcode einer Notiz: Feld code, sonst aus dem Modul-Link, sonst aus dem Dateinamen.
export function codeVon(n) {
  for (const q of [n.fm.code, n.fm.modul, n.name]) {
    const m = typeof q === "string" ? MODULCODE.exec(q) : null;
    if (m) return m[1];
  }
  return "";
}

// Kapitel unter „## Kapitel“ einer Lernplan-Notiz: [{ titel, erledigt, zusatz, teile: [{ titel, erledigt, zusatz }] }]
export function kapitelAus(text) {
  const zeilen = String(text).split(/\r?\n/);
  const start = zeilen.findIndex((z) => /^## Kapitel\s*$/.test(z));
  if (start < 0) return [];
  const kapitel = [];
  for (const z of zeilen.slice(start + 1)) {
    if (/^## /.test(z)) break;
    const m = /^(\s*)- \[([ xX])\] (.+)$/.exec(z);
    if (!m) continue;
    const [titel, ...zusatz] = m[3].split(" · ");
    const e = { titel: titel.trim(), erledigt: m[2] !== " ", zusatz: zusatz.join(" · ").trim() };
    if (!m[1].length) kapitel.push({ ...e, teile: [] });
    else if (kapitel.length) kapitel[kapitel.length - 1].teile.push(e);
  }
  return kapitel;
}

// Seiten einer Textfassung: je Kasten „> [!eba-quelle]- [[X.pdf#page=N|S. N]]“ die Zeilen danach.
export function seitenAus(text) {
  const seiten = [];
  let akt = null;
  for (const z of String(text).split(/\r?\n/)) {
    const k = /^>\s*\[!eba-quelle\][+-]?\s*\[\[([^\]|#]+)#page=(\d+)(?:\|[^\]]*)?\]\]/.exec(z);
    if (k) {
      akt = { datei: k[1], nr: Number(k[2]), zeilen: [] };
      seiten.push(akt);
    } else if (akt && /^>/.test(z)) akt.zeilen.push(z.replace(/^>\s?/, ""));
    else akt = null;
  }
  return seiten.map((s) => ({ datei: s.datei, nr: s.nr, text: s.zeilen.join("\n").trim() }));
}

const DATUM_TEXT = /(\d{4})-(\d{2})-(\d{2})|\b(\d{1,2})\.(\d{1,2})\.(\d{4}|\d{2}(?!\d))?/;
const zwei = (n) => String(n).padStart(2, "0");

// Frist eines To-dos wie todos.js: das erste Datum nach „bis“, sonst nach einem Wochentag, „ab“, „am“, „vor“, „zum“, „spätestens“
// oder in Klammern, sonst das erste Datum überhaupt. TT.MM. ohne Jahr: dieses Jahr, liegt das über ein halbes Jahr zurück, das
// nächste. Text nach dem letzten „ → “ sind Belege und zählen nicht.
export function fristAus(text, heute) {
  const ohneBelege = String(text).split(" → ")[0];
  const nach = /(?:\bbis|\bab|\bam|\bvor|\bzum|spätestens|\b(?:mo|di|mi|do|fr|sa|so)\.?,?|\()\s*(?:zum\s+)?/i;
  let m = null;
  for (const wort of ohneBelege.matchAll(new RegExp(nach.source + "(" + DATUM_TEXT.source + ")", "gi"))) {
    m = DATUM_TEXT.exec(wort[1]);
    break;
  }
  if (!m) m = DATUM_TEXT.exec(ohneBelege);
  if (!m) return null;
  if (m[1]) return `${m[1]}-${m[2]}-${m[3]}`;
  const tag = Number(m[4]), monat = Number(m[5]);
  if (tag < 1 || tag > 31 || monat < 1 || monat > 12) return null;
  let jahr = m[6] ? Number(m[6].length === 2 ? "20" + m[6] : m[6]) : Number(heute.slice(0, 4));
  let d = `${jahr}-${zwei(monat)}-${zwei(tag)}`;
  if (!m[6] && Date.parse(heute) - Date.parse(d) > 183 * 864e5) d = `${++jahr}-${zwei(monat)}-${zwei(tag)}`;
  return Number.isNaN(Date.parse(d)) ? null : d;
}

const TODO_AUSSCHLUSS = ["module/", "studium/", "lernplan/"];

// Offene Aufgaben (- [ ] Text, auch in Zitaten und Kästen) außerhalb von Module/, Studium/, Lernplan/ und Dashboard.md; unter einer
// Überschrift „Offene Fragen“ oder mit #frage ist es eine Frage. Wie im Plugin (fassung.js) zählt der Abschnitt, nicht das „?“:
// Dort steht auch „Lösung zu Aufgabe I.4 fehlt“.
export function todosAus(n, heute) {
  const p = klein(n.pfad);
  if (TODO_AUSSCHLUSS.some((a) => p.startsWith(a)) || p === "dashboard.md") return [];
  const aus = [];
  let ueberschrift = "";
  for (const z of String(n.text).split(/\r?\n/)) {
    const h = /^#{1,6}\s+(.+)$/.exec(z);
    if (h) {
      ueberschrift = h[1];
      continue;
    }
    const m = /^\s*(?:>\s*)*- \[ \]\s+(\S.*)$/.exec(z);
    if (!m) continue;
    const text = m[1].trim();
    const kern = text.split(" → ")[0].trim();
    const frage = /offene fragen/i.test(ueberschrift) || /#frage\b/.test(kern);
    aus.push({ text, art: frage ? "frage" : "aufgabe", frist: frage ? null : fristAus(text, heute), abschnitt: ueberschrift });
  }
  return aus;
}

// Obsidian-Links, wie Obsidian sie zeigt: [[Ziel|Text]] → Text, [[Ziel#Abschnitt]] → Ziel. Für die Suche (jeder Seitenverweis
// „→ [[<eigene PDF>#page=3|S. 3]]“ wiederholte sonst die Wörter des Titels) und für lesbare To-dos.
export const lesbar = (s) => String(s).replace(/!?\[\[([^\]\n]+)\]\]/g, (_, l) => {
  const [ziel, text] = l.split("|");
  return (text || ziel.split("#")[0]).trim();
});

function woerter(text) {
  return falten(klein(text)).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1 && !FUELLWOERTER.has(w));
}

// Ansichten des Plugins und von Obsidian zeigen erst in der App etwas; im Text stehen nur ihre Codeblöcke (```eba-lernplan```,
// Bases-Abfragen ```base```, auch in Kästen) und der Kopf als HTML. Für Claude: Codeblöcke weg, aus dem Kopf die Überschrift
// (<h1>) und die Eckdaten (eba-meta, „6 ECTS · 1. FS“), ohne die Navigation (eba-pfad, „Dashboard Module“).
const ANSICHT = /^(?:eba-[\w-]*|base|bases|dataview|dataviewjs)(?:\s|$)/i;
export function ohneAnsichten(text) {
  const zeilen = [];
  let zaun = null;
  for (const z of String(text).split(/\r?\n/)) {
    const m = /^(?:\s*>)*\s*(`{3,}|~{3,})(.*)$/.exec(z);
    if (zaun) {
      if (m && m[1][0] === zaun[0] && m[1].length >= zaun.length && !m[2].trim()) zaun = null;
      continue;
    }
    if (m && ANSICHT.test(m[2].trim())) {
      zaun = m[1];
      continue;
    }
    zeilen.push(z);
  }
  const ohneTags = (s) => s.replace(/<[^>\n]*>/g, "").trim();
  return zeilen.join("\n")
    .replace(/<div class="eba-pfad">[\s\S]*?<\/div>/g, "")
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/g, (_, t) => `\n# ${ohneTags(t)}`)
    .replace(/<div class="eba-meta">([\s\S]*?)<\/div>/g, (_, t) => `\n${ohneTags(t.replace(/<\/span>\s*<span[^>]*>/g, " · "))}`);
}

// Abschnitte einer Notiz für die Suche: je „## …“ einer, ohne Ansichten und HTML, ohne die Titelzeile (der Name zählt schon)
// und eingebettete Dateien samt PDF-Kasten (sonst trifft jede Suche nach einem Wort aus dem Titel auch den Kopf), Links lesbar.
function abschnitteAus(text) {
  const rein = lesbar(ohneAnsichten(text).replace(/^# .*$/gm, " ").replace(/!\[\[[^\]\n]*\]\]/g, " ").replace(/^>\s*\[!eba-pdf\].*$/gm, " "))
    .replace(/<[^>\n]+>/g, " ");
  const teile = [];
  let akt = { titel: "", zeilen: [] };
  for (const z of rein.split(/\r?\n/)) {
    const h = /^##\s+(.+)$/.exec(z);
    if (h) {
      teile.push(akt);
      akt = { titel: h[1].trim(), zeilen: [] };
    } else akt.zeilen.push(z);
  }
  teile.push(akt);
  return teile.map((t) => ({ titel: t.titel, text: t.zeilen.join("\n").trim() })).filter((t) => t.text);
}

// Verzeichnis eines Tresor-Ordners. Liest neu, wenn der letzte Blick über „frisch“ ms her ist; geänderte Dateien (Zeit, Größe)
// werden neu gelesen, der Suchindex nur dann neu gebaut. Der Stand ist die jüngste Zeit, zu der eine Datei ankam oder sich
// änderte (zeitVon): ein Sync übernimmt oft die Änderungszeit des Geräts, die Zeit des Schreibens auf diesem Rechner (ctime) zeigt
// die Ankunft.
export function tresorOrdner(wurzel, { ohne = [], jetzt = () => new Date(), frisch = 60e3, zeitVon = (st) => Math.max(st.mtimeMs, st.ctimeMs) } = {}) {
  let dateien = new Map(); // Pfad (NFC) → { pfad, roh, name, fm, text, mtime, groesse }
  // Notizen mit privat: true nur mit Stempel, damit sie nicht bei jedem Blick neu gelesen werden und den Index neu bauen lassen
  let privat = new Map(); // Pfad (NFC) → { mtime, groesse }
  let geblickt = -Infinity, generation = 0, index = null, indexGeneration = -1, geaendert = 0;

  function sammeln(rel, aus) {
    let eintraege = [];
    try { eintraege = readdirSync(rel ? join(wurzel, rel) : wurzel, { withFileTypes: true }); } catch (e) { return; }
    for (const e of eintraege) {
      const roh = rel ? `${rel}/${e.name}` : e.name;
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory() && ordnerErlaubt(roh, ohne)) sammeln(roh, aus);
      else if (e.isFile() && dateiErlaubt(roh, ohne)) aus.push(roh);
    }
  }

  function blicken() {
    const t = jetzt().getTime();
    if (t - geblickt < frisch) return;
    geblickt = t;
    const roh = [];
    sammeln("", roh);
    const neu = new Map(), neuPrivat = new Map();
    let anders = false;
    geaendert = 0;
    for (const r of roh) {
      const pfad = nfc(r);
      let st;
      try { st = statSync(join(wurzel, r)); } catch (e) { continue; }
      if (!st.isFile() || st.size > DATEI_MAX) continue;
      geaendert = Math.max(geaendert, zeitVon(st));
      const alt = dateien.get(pfad);
      if (alt && alt.mtime === st.mtimeMs && alt.groesse === st.size) {
        neu.set(pfad, alt);
        continue;
      }
      const still = privat.get(pfad);
      if (still && still.mtime === st.mtimeMs && still.groesse === st.size) {
        neuPrivat.set(pfad, still);
        continue;
      }
      let inhalt;
      try { inhalt = readFileSync(join(wurzel, r), "utf8"); } catch (e) { continue; }
      const { fm, text } = frontmatter(inhalt);
      if (fm.privat === true) {
        neuPrivat.set(pfad, { mtime: st.mtimeMs, groesse: st.size });
        continue;
      }
      anders = true;
      const name = pfad.split("/").pop().replace(/\.md$/i, "");
      neu.set(pfad, { pfad, roh: r, name, fm, text, mtime: st.mtimeMs, groesse: st.size });
    }
    // ohne neue oder geänderte Notiz ist neu eine Teilmenge von dateien: eine andere Größe heißt, eine fiel weg (oder wurde privat)
    if (anders || neu.size !== dateien.size) generation++;
    dateien = neu;
    privat = neuPrivat;
  }

  function notizen() {
    blicken();
    return [...dateien.values()];
  }

  // Suchindex: Chunks aus Textfassungen (eine Seite je Chunk) und aus den übrigen Notizen (ein Abschnitt je Chunk). Der Name zählt
  // einmal je Datei: bei „Das Wichtigste“, sonst im ersten Abschnitt bzw. auf der ersten Seite; in jedem Chunk machte er aus einem
  // Titelwort Treffer in allen Abschnitten derselben Notiz. Chunks und Worthäufigkeiten zerlegt jede Datei nur einmal (am Eintrag,
  // der bleibt, solange sie sich nicht ändert): nach einer Änderung setzt sich der Index nur neu zusammen, statt alles neu zu lesen
  // (am echten Tresor 570 ms → rund 65 ms, in denen beide Lauscher warten). Postings flach als [Chunk, Häufigkeit, Chunk, …].
  function indexBauen() {
    blicken();
    if (index && indexGeneration === generation) return index;
    const chunks = [], postings = new Map();
    let laengen = 0;
    for (const n of dateien.values()) {
      if (!n.chunks) n.chunks = chunksVon(n);
      for (const { c, ws, fs } of n.chunks) {
        const i = chunks.length;
        chunks.push(c);
        laengen += c.laenge;
        for (let k = 0; k < ws.length; k++) {
          let l = postings.get(ws[k]);
          if (!l) postings.set(ws[k], (l = []));
          l.push(i, fs[k]);
        }
      }
    }
    index = { chunks, postings, schnitt: chunks.length ? laengen / chunks.length : 1 };
    indexGeneration = generation;
    return index;
  }

  function chunksVon(n) {
    const aus = [], code = codeVon(n);
    // Den Kopf einer Begleitnotiz (typ unterlage) schreibt das Plugin: Titel, PDF oder „[[X.html]] · Öffnen“, Hinweiskasten. Er
    // zählt nicht, sobald es Abschnitte gibt; sonst gewann er als kurzer Abschnitt mit dem Dateinamen jede Suche nach dem Titel.
    const teile = n.fm.typ === "volltext"
      ? seitenAus(n.text).map((s) => ({ art: "unterlage", seite: s.nr, datei: s.datei, abschnitt: "", text: s.text }))
      : abschnitteAus(n.text).map((a) => ({ art: "notiz", seite: null, datei: null, abschnitt: a.titel, text: a.text }))
        .filter((a, _, alle) => !(n.fm.typ === "unterlage" && !a.abschnitt && alle.length > 1));
    const mitName = Math.max(0, teile.findIndex((t) => t.abschnitt === "Das Wichtigste"));
    for (const [j, t] of teile.entries()) {
      const w = woerter(`${j === mitName ? n.name : ""} ${t.abschnitt} ${t.text}`);
      if (!w.length) continue;
      const tf = new Map();
      for (const x of w) tf.set(x, (tf.get(x) || 0) + 1);
      aus.push({ c: { ...t, pfad: n.pfad, name: n.name, code, laenge: w.length, typ: n.fm.typ || "" }, ws: [...tf.keys()], fs: [...tf.values()] });
    }
    return aus;
  }

  // Treffer nach BM25. Ein Suchwort ab 4 Zeichen zählt zusätzlich mit halbem Gewicht über längere Wörter, die es enthalten
  // („kosten“ findet „Opportunitätskosten“). Höchstens jeDatei Treffer aus einer Datei; die übrigen Abschnitte, in denen sie
  // ebenfalls trifft, stehen beim ersten Treffer unter weitere (sonst füllte eine Notiz alle zehn Plätze).
  function suchen(frage, { art, code, hoechstens = 10, jeDatei = Infinity } = {}) {
    const { chunks, postings, schnitt } = indexBauen();
    const N = chunks.length || 1;
    const punkte = new Map();
    const passt = (i) => (!art || chunks[i].art === art) && (!code || chunks[i].code === code);
    const zaehlen = (liste, gewicht) => {
      const df = liste.length / 2;
      const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
      for (let k = 0; k < liste.length; k += 2) {
        const i = liste[k], f = liste[k + 1];
        if (!passt(i)) continue;
        const c = chunks[i];
        const s = idf * (f * (BM25.k1 + 1)) / (f + BM25.k1 * (1 - BM25.b + BM25.b * c.laenge / schnitt));
        punkte.set(i, (punkte.get(i) || 0) + gewicht * s);
      }
    };
    const begriffe = [...new Set(woerter(frage))];
    for (const w of begriffe) {
      if (postings.has(w)) zaehlen(postings.get(w), 1);
      if (w.length < 4) continue;
      const teil = [];
      // in einer Schleife, nicht mit push(...liste): ein häufiges Teilwort sprengte sonst die Zahl der Argumente
      for (const [x, liste] of postings) if (x !== w && x.includes(w)) for (const v of liste) teil.push(v);
      if (teil.length) zaehlen(teil, 0.5);
    }
    const aus = [], erster = new Map(), zahl = new Map();
    for (const [i, p] of [...punkte].sort((a, b) => b[1] - a[1])) {
      const c = chunks[i], k = zahl.get(c.pfad) || 0;
      zahl.set(c.pfad, k + 1);
      if (k < jeDatei) {
        if (aus.length >= hoechstens) continue;
        const t = { ...c, punkte: p, begriffe, weitere: [] };
        if (!k) erster.set(c.pfad, t);
        aus.push(t);
      } else if (erster.has(c.pfad) && c.abschnitt) erster.get(c.pfad).weitere.push(c.abschnitt);
    }
    return aus;
  }

  function notiz(pfad) {
    blicken();
    return dateien.get(nfc(String(pfad || "")).replace(/^\/+/, "")) || null;
  }

  // Notizen zu einem Namen, wie ein Link ihn schreibt: „S110 Lernplan“, „[[S110 Lernplan|Plan]]“, „s110 lernplan.md“ (nur unter
  // den erlaubten Dateien, nach Pfad sortiert)
  function finden(name) {
    blicken();
    const n = klein(String(name || "").trim().replace(/^\[\[|\]\]$/g, "").split("|")[0].split("#")[0].trim().replace(/\.md$/i, ""));
    if (!n) return [];
    return [...dateien.values()].filter((d) => klein(d.name) === n).sort((a, b) => a.pfad.localeCompare(b.pfad));
  }

  function stand() {
    blicken();
    return { geaendert: geaendert ? new Date(geaendert).toISOString() : null, notizen: dateien.size };
  }

  // Liest den Tresor und baut den Suchindex vorab, damit nicht der erste Aufruf nach dem Start darauf wartet
  function vorbereiten() {
    indexBauen();
  }

  // wurzel und ohne für die Dateien auf Abruf (mcp-dateien.mjs), mit denselben Ausschlüssen
  return { notizen, notiz, finden, suchen, stand, vorbereiten, wurzel, ohne };
}
