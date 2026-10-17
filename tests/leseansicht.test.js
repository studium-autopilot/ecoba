// Leseansicht: Übersichtsseiten nur in der Leseansicht (start.js, nurLesen), welche Notizen gesperrt sind; und die Snippets
// blenden keinen Abschnitt der Leseansicht mit display:none aus. Läuft ohne Obsidian.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { laden } = require("./laden.js");

const frontmatter = {
  "Dashboard.md": { typ: "dashboard" },
  "Studium/Noten & ECTS.md": { typ: "übersicht" },
  "Studium/Termine & Anmeldungen.md": { typ: "übersicht" },
  "System/Einstellungen.md": { typ: "einstellungen" },
  "System/Daten/Semester.md": { typ: "daten" },
  "Module/1 Grundstudium/B110 BWL.md": { typ: "modul" },
  "Vorlesungen/B110/VL 01.md": { typ: "vorlesung" },
  "Eigene Übersicht.md": { typ: "übersicht", ansicht: "bearbeiten" },
  "Meine Liste.md": { ansicht: "Lesen" },
  "Studium/Prüfungen.md": { typ: "Übersicht" },
};
const L = laden("start", { frontmatter }).ctx.leseansicht;
const datei = (path) => ({ path });

test("Gesperrt: Dashboard, Übersichten, Einstellungen und Daten", () => {
  for (const p of ["Dashboard.md", "Studium/Noten & ECTS.md", "Studium/Prüfungen.md", "System/Einstellungen.md", "System/Daten/Semester.md"]) {
    assert.equal(L.nurLesen(datei(p)), true, p);
  }
});

test("Frei: Module, deine Notizen, Notizen ohne Eigenschaften; Termine & Anmeldungen ist gesperrt", () => {
  assert.equal(L.nurLesen(datei("Studium/Termine & Anmeldungen.md")), true);
  for (const p of ["Module/1 Grundstudium/B110 BWL.md", "Vorlesungen/B110/VL 01.md", "Neu.md"]) {
    assert.equal(L.nurLesen(datei(p)), false, p);
  }
});

test("Feld „ansicht“ geht vor: lesen sperrt, bearbeiten gibt frei; Dashboard ohne Eigenschaften bleibt gesperrt", () => {
  assert.equal(L.nurLesen(datei("Meine Liste.md")), true);
  assert.equal(L.nurLesen(datei("Eigene Übersicht.md")), false);
  assert.equal(L.nurLesen(datei("Dashboard.md")), true);
  assert.equal(laden("start", { frontmatter: { "Dashboard.md": {} } }).ctx.leseansicht.nurLesen(datei("Dashboard.md")), true);
});

test("Nur Markdown: Bilder, PDFs und leere Angaben nie", () => {
  assert.equal(L.nurLesen(datei("Anhänge/Folie.png")), false);
  assert.equal(L.nurLesen(null), false);
});

// Obsidian misst einen Abschnitt der Leseansicht (.el-*, Kind von .markdown-preview-sizer) als Abstand seines offsetTop bis zum
// nächsten. Mit display:none ist offsetTop 0, der Abschnitt gilt dann als so hoch wie alles darüber: Was darunter steht,
// zeichnet Obsidian erst viel weiter unten (17.10.2026: Semestertermine im Studienverlauf leer unter dem ausgeblendeten Block
// „Schwerpunkte“). Ausblenden darum immer als Faltung auf Höhe 0 (eba-core.css, Abschnitt 36).
const SNIPPETS = path.join(__dirname, "..", "Studium Autopilot", ".obsidian", "snippets");
const oben = (text, trenner) => { // an trenner(c) teilen, nicht innerhalb von Klammern
  const teile = [];
  let t = "", tiefe = 0;
  for (const c of text) {
    if (c === "(") tiefe++;
    if (c === ")") tiefe--;
    if (tiefe === 0 && trenner(c)) { teile.push(t); t = ""; } else t += c;
  }
  teile.push(t);
  return teile;
};
// [{ selektor, block }] je Selektor aller innersten Regeln (auch in @media/@container)
const regeln = (css) => {
  const r = [];
  const muster = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  css = css.replace(/\/\*[\s\S]*?\*\//g, "");
  while ((m = muster.exec(css))) for (const sel of oben(m[1], (c) => c === ",")) r.push({ selektor: sel.trim(), block: m[2] });
  return r;
};
const istAbschnitt = (selektor) => {
  const teile = oben(selektor.replace(/\s*([>+~])\s*/g, " $1 "), (c) => c === " ").filter(Boolean);
  return /^\.el-/.test(teile[teile.length - 1] || "") || teile.slice(-3, -1).join(" ") === ".markdown-preview-sizer >";
};

test("Snippets: kein Abschnitt der Leseansicht mit display:none (sonst bleibt darunter alles leer)", () => {
  const css = fs.readdirSync(SNIPPETS).filter((n) => n.endsWith(".css"));
  assert.ok(css.indexOf("eba-core.css") >= 0);
  const funde = [];
  for (const n of css) {
    for (const r of regeln(fs.readFileSync(path.join(SNIPPETS, n), "utf8"))) {
      if (/display\s*:\s*none/.test(r.block) && istAbschnitt(r.selektor)) funde.push(`${n}: ${r.selektor}`);
    }
  }
  assert.deepEqual(funde, []);
});

test("Prüfung selbst: erkennt ausgeblendete Abschnitte, lässt Blöcke darin und Live Preview in Ruhe", () => {
  const funde = (css) => regeln(css).filter((r) => /display\s*:\s*none/.test(r.block) && istAbschnitt(r.selektor)).map((r) => r.selektor);
  assert.deepEqual(funde(".el-pre:has(> .block-language-eba-x.aus), .block-language-eba-x.aus { display: none !important; }"),
    [".el-pre:has(> .block-language-eba-x.aus)"]);
  assert.deepEqual(funde("@container k (max-width: 400px) { .eba .markdown-preview-sizer>div:has(> p.x) { display:none } }"),
    [".eba .markdown-preview-sizer>div:has(> p.x)"]);
  assert.deepEqual(funde(".el-pre:has(> .aus) { display: block; height: 0; overflow: hidden; }"), []);
  assert.deepEqual(funde(".markdown-source-view .cm-embed-block:has(> .aus), .el-div .callout .x { display: none; }"), []);
});
