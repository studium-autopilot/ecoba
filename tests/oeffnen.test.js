// Ein Weg, eine Notiz zu öffnen (Bedien-Bausteine): ctx.oeffnen im Kern (main.js) entscheidet die Ansicht (Übersichten lesen,
// eigene Notizen bearbeiten) und den Tab (derselbe, Zurück führt zurück). Kein Skript öffnet an ihm vorbei. Läuft ohne Obsidian:
// node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const VAULT = path.join(__dirname, "..", "Studium Autopilot");
const SKRIPTE = path.join(VAULT, "System", "Skripte");

test("Wächter: Notizen öffnen nur über ctx.oeffnen (Ausnahme: das Dashboard beim Start, start.js)", () => {
  const funde = [];
  for (const n of fs.readdirSync(SKRIPTE).filter((x) => x.endsWith(".js") && x !== "start.js")) {
    const zeilen = fs.readFileSync(path.join(SKRIPTE, n), "utf8").split("\n");
    zeilen.forEach((z, i) => { if (!z.trim().startsWith("//") && /openLinkText\(|\.openFile\(|workspace\.getLeaf\(/.test(z)) funde.push(`${n}:${i + 1}`); });
  }
  assert.deepEqual(funde, [], "ctx.oeffnen(ziel, { neu, quelle, zeile, cursor, modus })");
});

test("Kern: ctx.oeffnen nimmt Datei, Pfad oder Linktext, Ansicht nach ctx.leseansicht.nurLesen, Fokus nur mit Cursor", () => {
  const kern = fs.readFileSync(path.join(VAULT, ".obsidian", "plugins", "studium-autopilot", "main.js"), "utf8");
  const a = kern.indexOf("async notizOeffnen(");
  const f = kern.slice(a, kern.indexOf("return blatt;", a));
  assert.match(f, /getFirstLinkpathDest/);
  assert.match(f, /nurLesen\(datei\)/);
  assert.match(f, /zuerstLesen\(datei\)/, "Begleitnotizen in der Leseansicht (seit 19.10.2026)");
  assert.match(f, /focus: !!o\.cursor/);
  assert.match(f, /getLeaf\(o\.neu \? "tab" : false\)/, "derselbe Tab, Zurück geht; Strg/⌘ neuer Tab");
  // Auch wenn die Notiz in einem anderen Tab offen ist: nie dorthin wechseln, sonst führt Zurück nicht zurück (Rückmeldung vom 27.10.2026)
  assert.doesNotMatch(f, /getLeavesOfType\("markdown"\)\.find/);
  const start = fs.readFileSync(path.join(SKRIPTE, "start.js"), "utf8");
  assert.match(start, /ctx\.leseansicht = \{ nurLesen, zuerstLesen \}/);
  assert.doesNotMatch(start, /setPinned\(true\)/, "das Dashboard wird nicht mehr angeheftet (E6)");
});

test("Übergang: Mit einem Kern vor 0.4.6 öffnet ctx.oeffnen auch Pfade und Linktexte (start.js), mit dem neuen Kern bleibt seiner", async () => {
  const { laden } = require("./laden.js");
  class TFile { constructor(p) { this.path = p; this.extension = p.split(".").pop(); } }
  const B110 = new TFile("Module/1 Grundstudium/B110 BWL.md");
  const protokoll = [];
  const blatt = { view: { file: null }, openFile: async (f, s) => { protokoll.push([f.path, s.state && s.state.mode, s.eState]); } };
  const aufbau = (version) => {
    const kernOeffnen = async () => "kern";
    const r = laden("start", { frontmatter: { "Dashboard.md": { typ: "dashboard" } },
      kontext: { plugin: { manifest: { version } }, oeffnen: kernOeffnen, obsidian: { TFile, Platform: {} } } });
    Object.assign(r.ctx.app.vault, { getAbstractFileByPath: (p) => (p === B110.path ? B110 : p === "Dashboard.md" ? new TFile(p) : null) });
    r.ctx.app.metadataCache.getFirstLinkpathDest = (p) => (p === "B110 BWL" ? B110 : null);
    r.ctx.app.metadataCache.getFileCache = (f) => (f.path === "Dashboard.md" ? { frontmatter: { typ: "dashboard" } } : null);
    Object.assign(r.ctx.app.workspace, { getLeavesOfType: () => [], getLeaf: () => blatt, setActiveLeaf: () => {} });
    return { ctx: r.ctx, kernOeffnen };
  };
  for (const v of ["0.4.6", "0.4.6-beta.1", "0.5.0", "1.0.0"]) {
    const x = aufbau(v);
    assert.equal(x.ctx.oeffnen, x.kernOeffnen, v);
  }
  const alt = aufbau("0.4.5");
  assert.notEqual(alt.ctx.oeffnen, alt.kernOeffnen);
  assert.equal(await alt.ctx.oeffnen("B110 BWL#Prüfung", { quelle: "Dashboard.md" }), blatt);
  assert.equal(await alt.ctx.oeffnen("Dashboard"), blatt);
  assert.equal(await alt.ctx.oeffnen(B110, { zeile: 3 }), blatt);
  assert.equal(await alt.ctx.oeffnen("Gibt es nicht"), null);
  assert.deepEqual(protokoll, [
    [B110.path, "source", { subpath: "#Prüfung" }],
    ["Dashboard.md", "preview", undefined],
    [B110.path, "source", { line: 3 }],
  ]);
  const a044 = aufbau("0.4.4");
  assert.notEqual(a044.ctx.oeffnen, a044.kernOeffnen, "ein Kern von 0.4.4 bekommt den Ersatz auch");
});
