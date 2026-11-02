// Lädt den Kern (main.js) ohne Obsidian: ein kleiner Ersatz für das Modul „obsidian“ (Plugin, Modal, Notice, TFile,
// requestUrl), ein Tresor im Speicher mit Ereignissen wie beim Sync, Gerätespeicher und Netz als Attrappen. Für die Prüfung der
// Skripte (tests/skripte-pruefen.test.js), Aktionen von außen (tests/aktionen-extern.test.js) und ctx.signatur in tests/laden.js.
// Die festen Schlüssel der Signatur lassen sich nur hier ersetzen (eine Kopie des Quelltexts mit Wegwerf-Schlüsseln); der Kern
// selbst hat dafür keinen Einstieg.
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const KERN = path.join(__dirname, "..", "Studium Autopilot", ".obsidian", "plugins", "studium-autopilot", "main.js");
const enc = (s) => new TextEncoder().encode(s);
const dec = (b) => new TextDecoder("utf-8").decode(b);
const puffer = (by) => by.buffer.slice(by.byteOffset, by.byteOffset + by.byteLength);

// Element für Fragmente und Fenster: createDiv/createEl/createSpan, Text, Klassen, Lauscher; alle() = es selbst und alles darunter
class El {
  constructor(tag, o) {
    this.tag = tag; this.kinder = []; this.text = (o && o.text) || ""; this.cls = (o && o.cls) || ""; this.lauscher = {};
  }
  createDiv(o) { return this.createEl("div", o); }
  createSpan(o) { return this.createEl("span", o); }
  createEl(tag, o) { const e = new El(tag, o); this.kinder.push(e); return e; }
  addEventListener(typ, fn) { this.lauscher[typ] = fn; }
  addClass(c) { this.cls = (this.cls ? this.cls + " " : "") + c; }
  setAttr(k, v) { (this.attr = this.attr || {})[k] = v; }
  setText(t) { this.text = t; }
  remove() { this.entfernt = true; }
  empty() { this.kinder = []; }
  alle() { return [this].concat(...this.kinder.map((k) => k.alle())); }
  get textContent() { return [this.text].concat(this.kinder.map((k) => k.textContent)).filter(Boolean).join(" "); }
}

class TFile {
  constructor(p) {
    this.path = p; this.name = p.split("/").pop();
    const i = this.name.lastIndexOf(".");
    this.basename = i > 0 ? this.name.slice(0, i) : this.name;
    this.extension = i > 0 ? this.name.slice(i + 1) : "";
  }
}

// Ersatz für „obsidian“. hinweise: Liste, in die jede Notice kommt ({ text, el, dauer, weg }); netz(url) → { status, bytes } oder
// wirft (kein Netz); anfragen: Liste der abgerufenen Adressen
function obsidianErsatz({ hinweise = [], netz = null, anfragen = [] } = {}) {
  class Plugin {
    constructor(app, manifest) {
      this.app = app; this.manifest = manifest;
      this.ersatzBefehle = {}; this.ersatzHandler = {}; this.ersatzDom = []; this.ersatzWeg = []; this.ersatzStatus = [];
    }
    // Eintrag in der Statusleiste (wie Obsidian: beim Entladen weg)
    addStatusBarItem() { const e = new El("div", { cls: "status-bar-item" }); this.ersatzStatus.push(e); this.ersatzWeg.push(() => e.remove()); return e; }
    addCommand(c) { this.ersatzBefehle[c.id] = c; return c; }
    removeCommand(id) { delete this.ersatzBefehle[id]; }
    registerObsidianProtocolHandler(name, fn) { this.ersatzHandler[name] = fn; }
    registerEvent() {}
    register(fn) { this.ersatzWeg.push(fn); }
    registerDomEvent(el, typ, fn) { this.ersatzDom.push({ el, typ, fn }); }
    registerMarkdownPostProcessor() {}
    registerEditorExtension() {}
    registerMarkdownCodeBlockProcessor() {}
  }
  class Modal { constructor(app) { this.app = app; } open() { throw new Error("Fenster im Test: Antwort in plugin.testAntworten"); } close() {} }
  // Wie Obsidian: containerEl ist das Element des Hinweises, ein Tipp darauf schließt ihn (Lauscher, dann hide), danach ist es
  // nicht mehr im Dokument. eintrag.schliessen() tippt darauf.
  class Notice {
    constructor(inhalt, dauer) {
      const el = inhalt && typeof inhalt === "object" ? inhalt : null, n = this, klick = [];
      this.eintrag = { text: el ? el.textContent : String(inhalt), el, dauer, weg: false };
      this.containerEl = {
        get isConnected() { return !n.eintrag.weg; },
        addEventListener: (typ, fn) => { if (typ === "click") klick.push(fn); },
      };
      Object.defineProperty(this.eintrag, "schliessen", { value: () => { for (const fn of klick) fn(); n.hide(); } });
      hinweise.push(this.eintrag);
    }
    hide() { this.eintrag.weg = true; }
    setMessage() {}
  }
  const requestUrl = async ({ url }) => {
    anfragen.push(url);
    if (!netz) throw new Error("kein Netz im Test");
    const r = await netz(url);
    return { status: r.status, arrayBuffer: puffer(typeof r.bytes === "string" ? enc(r.bytes) : r.bytes || new Uint8Array(0)) };
  };
  return { Plugin, Modal, FuzzySuggestModal: Modal, Notice, TFile, requestUrl, moment: null, Platform: {} };
}

// main.js als Modul mit dem Ersatz für „obsidian“. schluessel: feste Schlüssel der Kopie (statt SIGNATUR_SCHLUESSEL)
function kernModul(obs, schluessel) {
  let code = fs.readFileSync(KERN, "utf8");
  if (schluessel) {
    const re = /const SIGNATUR_SCHLUESSEL = Object\.freeze\(\[[\s\S]*?\]\);/;
    if ((code.match(new RegExp(re.source, "g")) || []).length !== 1) throw new Error("SIGNATUR_SCHLUESSEL nicht genau einmal in main.js");
    code = code.replace(re, "const SIGNATUR_SCHLUESSEL = Object.freeze(" + JSON.stringify(schluessel) + ");");
  }
  const modul = { exports: {} };
  new Function("require", "module", "exports", code + "\n//# sourceURL=main.js")((n) => (n === "obsidian" ? obs : require(n)), modul, modul.exports);
  return modul.exports;
}

// Tresor im Speicher. anfang: { pfad: Text | Bytes }. Versteckte Pfade (.obsidian, .trash) kennt nur der Adapter.
function tresorBauen(anfang) {
  const daten = new Map(), dateien = new Map(), ordner = new Set(), lauscher = {};
  const versteckt = (p) => p.split("/").some((t) => t.charAt(0) === ".");
  const datei = (p) => { if (!dateien.has(p)) dateien.set(p, new TFile(p)); return dateien.get(p); };
  const melden = (ev, ...a) => { for (const fn of (lauscher[ev] || []).slice()) fn(...a); };
  const bytes = (x) => (typeof x === "string" ? enc(x) : new Uint8Array(x));
  for (const p of Object.keys(anfang || {})) daten.set(p, bytes(anfang[p]));
  const vault = {
    getFiles: () => [...daten.keys()].filter((p) => !versteckt(p)).sort().map(datei),
    getAbstractFileByPath: (p) => (daten.has(p) && !versteckt(p) ? datei(p) : null),
    readBinary: async (f) => puffer(daten.get(f.path)),
    read: async (f) => dec(daten.get(f.path)),
    modifyBinary: async (f, buf) => { daten.set(f.path, new Uint8Array(buf)); melden("modify", f); },
    createBinary: async (p, buf) => { daten.set(p, new Uint8Array(buf)); melden("create", datei(p)); return datei(p); },
    on: (ev, fn) => { (lauscher[ev] = lauscher[ev] || []).push(fn); return { ev, fn }; },
    offref: (r) => { const l = lauscher[r.ev] || []; const i = l.indexOf(r.fn); if (i >= 0) l.splice(i, 1); },
    adapter: {
      exists: async (p) => daten.has(p) || ordner.has(p) || [...daten.keys()].some((k) => k.indexOf(p + "/") === 0),
      readBinary: async (p) => { if (!daten.has(p)) throw new Error("fehlt: " + p); return puffer(daten.get(p)); },
      writeBinary: async (p, buf) => { daten.set(p, new Uint8Array(buf)); },
      mkdir: async (p) => { ordner.add(p); },
    },
  };
  // Wie ein Sync oder ein anderes Programm: Datei setzen (create bzw. modify), löschen (delete); ohne melden: still
  const setzen = (p, inhalt, o) => {
    const neu = !daten.has(p);
    daten.set(p, bytes(inhalt));
    if (!(o && o.still) && !versteckt(p)) melden(neu ? "create" : "modify", datei(p));
  };
  const loeschen = (p) => { const f = datei(p); daten.delete(p); melden("delete", f); };
  return { vault, setzen, loeschen, daten, text: (p) => (daten.has(p) ? dec(daten.get(p)) : null), lauscher };
}

// Gerätespeicher wie app.loadLocalStorage/saveLocalStorage (JSON, null löscht)
function speicherBauen(anfang) {
  const m = new Map(Object.entries(anfang || {}).map(([k, v]) => [k, JSON.stringify(v)]));
  return {
    m,
    laden: (k) => (m.has(k) ? JSON.parse(m.get(k)) : null),
    speichern: (k, v) => { if (v == null) m.delete(k); else m.set(k, JSON.stringify(v)); },
  };
}

// Ein Kern mit Tresor. o: { dateien, version (Kern), schluessel (feste Schlüssel der Kopie), netz, speicher (Gerätespeicher am
// Anfang), einstellungen (Frontmatter von System/Einstellungen.md für den metadataCache) } → { k, tresor, speicher, hinweise,
// anfragen, start(), befehl(id), protokoll(parameter), offen() (Hinweise, die noch stehen), oeffnen(pfad), weg() }
function aufbau(o = {}) {
  const hinweise = [], anfragen = [];
  const obs = obsidianErsatz({ hinweise, netz: o.netz || null, anfragen });
  const Kern = kernModul(obs, o.schluessel);
  const tresor = tresorBauen(o.dateien);
  const speicher = speicherBauen(o.speicher);
  const arbeitsflaeche = {}; // Ereignis von app.workspace → [Lauscher]
  global.window = global.window || { eval: (c) => (0, eval)(c) };
  global.document = global.document || { body: { classList: { add() {}, remove() {} } }, createDocumentFragment: () => new El("fragment") };
  const app = {
    vault: tresor.vault,
    metadataCache: {
      getFileCache: (f) => (o.einstellungen && f && f.path === "System/Einstellungen.md" ? { frontmatter: o.einstellungen } : null),
      on: () => ({}), offref: () => {},
    },
    workspace: {
      onLayoutReady: () => {}, on: (ev, fn) => { (arbeitsflaeche[ev] = arbeitsflaeche[ev] || []).push(fn); return {}; },
      getActiveFile: () => null, getLeavesOfType: () => [], iterateAllLeaves: () => {}, updateOptions: () => {},
    },
    loadLocalStorage: speicher.laden,
    saveLocalStorage: speicher.speichern,
  };
  const k = new Kern(app, { id: "studium-autopilot", version: o.version || "1.0.0" });
  const x = {
    k, Kern, obs, app, tresor, speicher, hinweise, anfragen,
    start: async () => { await k.onload(); await k.starten(); return k; },
    // Befehl aus der Befehlspalette ausführen (wie Obsidian: checkCallback(false) bzw. callback) → Rückgabe
    befehl: (id) => { const c = k.ersatzBefehle[id]; if (!c) throw new Error("kein Befehl " + id); return c.checkCallback ? c.checkCallback(false) : c.callback(); },
    sichtbar: (id) => { const c = k.ersatzBefehle[id]; return !!c && (c.checkCallback ? c.checkCallback(true) : true); },
    // Link von außen (obsidian://studium-autopilot?…), wie Obsidian ihn an den Protokoll-Handler gibt
    protokoll: (p) => k.ersatzHandler["studium-autopilot"](Object.assign({ action: "studium-autopilot" }, p)),
    texte: () => hinweise.map((h) => h.text),
    offen: () => hinweise.filter((h) => !h.weg),
    // Notiz öffnen, wie Obsidian es meldet (Ereignis file-open)
    oeffnen: (p) => { for (const fn of arbeitsflaeche["file-open"] || []) fn(p ? new TFile(p) : null); },
    weg: () => { for (const fn of k.ersatzWeg) fn(); k.onunload(); },
  };
  return x;
}

// Unveränderter Kern (echte feste Schlüssel): seine Signaturprüfung für ctx.signatur in tests/laden.js
const kern = kernModul(obsidianErsatz());

module.exports = { aufbau, kernModul, obsidianErsatz, tresorBauen, El, TFile, signatur: kern.signatur, ed25519: kern.ed25519, KERN, enc, dec };
