// Seitenleiste „Übersicht“ (seitenleiste.js, ZIELE als einzige Liste der Seiten): jede Seite gibt es in der Vorlage und hat ein
// eigenes Symbol, die Lesezeichen der Vorlage folgen der Liste; darunter die Module dieses Semesters nach derselben Regel wie das
// Fenster „Neu …“ (eba.js, diesesSemester). Das Raster-Menü oben in jeder Notiz (menue.js bis 0.4.6) gibt es nicht mehr.
// Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { laden } = require("./laden");

const VAULT = path.join(__dirname, "..", "Studium Autopilot");
const SKRIPTE = path.join(VAULT, "System", "Skripte");
const seitenleiste = require(path.join(SKRIPTE, "seitenleiste.js"));
const { ZIELE } = seitenleiste;
const pfadVon = (z) => (z === "Dashboard" ? "Dashboard.md" : `Studium/${z}.md`);

test("Seiten: Dashboard zuerst, Stundenplan dabei, jede Seite gibt es in der Vorlage", () => {
  assert.equal(ZIELE[0], "Dashboard", "„Dashboard“ ist der Weg zurück zum Start");
  assert.ok(ZIELE.indexOf("Stundenplan") >= 0);
  for (const z of ZIELE) assert.ok(fs.existsSync(path.join(VAULT, pfadVon(z))), z);
});

test("Seiten: der Lernplan nur, wenn es ihn gibt", () => {
  const ohne = ZIELE.filter((z) => z !== "Lernplan");
  assert.deepEqual(seitenleiste.sichtbareZiele({}), ohne);
  assert.deepEqual(seitenleiste.sichtbareZiele({ lernplan: { sichtbar: () => false } }), ohne);
  assert.deepEqual(seitenleiste.sichtbareZiele({ lernplan: { sichtbar: () => true } }), ZIELE);
});

test("Lesezeichen der Vorlage = Seiten der Übersicht (ohne den Lernplan, den es nur mit Lernplan-Notizen gibt)", () => {
  const b = JSON.parse(fs.readFileSync(path.join(VAULT, ".obsidian", "bookmarks.json"), "utf8"));
  const soll = ZIELE.filter((z) => z !== "Lernplan");
  assert.deepEqual(b.items.map((x) => x.title), soll);
  assert.deepEqual(b.items.map((x) => x.path), soll.map(pfadVon));
});

test("Jede Seite hat ein eigenes Symbol in eba-core.css", () => {
  const css = fs.readFileSync(path.join(VAULT, ".obsidian", "snippets", "eba-core.css"), "utf8");
  const symbole = ZIELE.map((z) => {
    const m = css.match(new RegExp(`li:has\\(> a\\[data-href\\$="${z.replace(/[&]/g, "\\$&")}"\\]\\)\\s*\\{\\s*--eba-icon:\\s*(url\\("[^"]+"\\))`));
    assert.ok(m, "Symbol für " + z);
    return m[1];
  });
  assert.equal(new Set(symbole).size, symbole.length, "keine zwei Seiten mit demselben Symbol");
});

test("Dieses Semester: Plan im aktuellen Semester, laufend oder angemeldet; nach Code sortiert", () => {
  const modul = (code, felder) => Object.assign({ typ: "modul", code, titel: "Modul " + code }, felder);
  const notizen = {
    "Module/1 Grundstudium/S110 Explorative Datenanalyse.md": modul("S110", { plan: "WS 2026/27" }),
    "Module/1 Grundstudium/B110 Einführung.md": modul("B110", { plan: "WS 2026/27" }),
    "Module/1 Grundstudium/E130 Makro.md": modul("E130", { plan: "SoSe 2027" }),
    "Module/2 Schlüsselqualifikationen/SQ100 Kurs.md": modul("SQ100", { status: "angemeldet" }),
    "Module/3 Schwerpunktkatalog/B320 Market Research.md": modul("B320", { status: "läuft", plan: "" }),
    "Module/3 Schwerpunktkatalog/B321 Marketing.md": modul("B321", {}),
    "Termine/2026-11-01 Klausur.md": { typ: "termin", code: "B110" },
  };
  const modell = {
    aktuell: { fs: 1, name: "WS 2026/27" },
    imPlan: (fm) => !!fm.plan,
    modulSemester: (fm) => fm.plan,
  };
  const { ergebnis: eba } = laden("eba", { notizen, kontext: { modell } });
  const codes = seitenleiste.moduleJetzt(eba).map((x) => x.fm.code);
  assert.deepEqual(codes, ["B110", "B320", "S110", "SQ100"]);
  // Dieselbe Regel wie im Fenster „Neu …“: diese Module stehen dort in der Gruppe „Dieses Semester“
  const gruppe = eba.modulFeld().optionen.filter((o) => o.gruppe === "Dieses Semester").map((o) => o.wert.fm.code).sort();
  assert.deepEqual(gruppe, codes.slice().sort());
});

test("Ansicht: eigener Tab „Übersicht“, öffnet über ctx.oeffnen, Stil in eba-core.css Abschnitt 66", () => {
  const code = fs.readFileSync(path.join(SKRIPTE, "seitenleiste.js"), "utf8");
  assert.equal(seitenleiste.TYP, "eba-uebersicht");
  assert.match(code, /getDisplayText\(\) \{ return "Übersicht"; \}/);
  assert.match(code, /ctx\.oeffnen\(/);
  assert.match(code, /sichtbareZiele\(ctx\)/, "Seiten nur aus ZIELE, keine zweite Liste");
  const css = fs.readFileSync(path.join(VAULT, ".obsidian", "snippets", "eba-core.css"), "utf8");
  assert.match(css, /66\. Seitenleiste „Übersicht“/);
  for (const k of ["eba-sl-zeile", "eba-sl-code", "eba-sl-label"]) assert.ok(css.includes("." + k), k);
});

test("Symbol des Tabs: eigenes SVG über addIcon (setIcon blieb auf dem iPad leer), Strich und Farbe als Attribute", () => {
  const code = fs.readFileSync(path.join(SKRIPTE, "seitenleiste.js"), "utf8");
  assert.match(code, /getIcon\(\) \{ return eigenesSymbol \? SYMBOL : "layout-grid"; \}/);
  assert.match(code, /if \(eigenesSymbol\) addIcon\(SYMBOL, SYMBOL_SVG\);/);
  const svg = seitenleiste.SYMBOL_SVG;
  assert.match(svg, /^<g fill="none" stroke="currentColor" stroke-width="[\d.]+"/);
  assert.equal((svg.match(/<rect /g) || []).length, 4);
  for (const m of svg.matchAll(/(?:x|y|width|height)="([\d.]+)"/g)) assert.ok(Number(m[1]) >= 0 && Number(m[1]) <= 100, "im 100er-Feld");
});

test("Kein Raster-Menü mehr: kein Skript setzt ein Symbol „Übersicht“ in die Kopfleiste der Notizen", () => {
  assert.ok(!fs.existsSync(path.join(SKRIPTE, "menue.js")), "menue.js ist entfernt (das Update löscht es)");
  for (const n of fs.readdirSync(SKRIPTE).filter((x) => x.endsWith(".js"))) {
    const code = fs.readFileSync(path.join(SKRIPTE, n), "utf8");
    assert.doesNotMatch(code, /addAction\("layout-grid"|eba-menue-(?:aktion|tafel|knopf)/, n);
  }
});
