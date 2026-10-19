// Zentrale Kapitellisten (kapitel.json): Prüfung in zentral.js (kapitelPruefen) und die Lernplan-Notiz daraus in lernplan.js
// (zentralNotiz, zentralAuswahl): Häkchen, eigene Felder und „Meine Notizen“ bleiben, nur Module deines laufenden Semesters.
// Nur ausgedachte Module und Kapitel. Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { laden } = require("./laden.js");

const { kapitelPruefen } = laden("zentral").ctx.zentral;
const { zentralNotiz, zentralAuswahl, kapitelLesen } = laden("lernplan").ergebnis;

const modul = (o) => Object.assign({ code: "X100", semester: "WS 2026/27", quelle: "Folien 00, S. 3", stand: "2026-10-18",
  kapitel: [{ nr: "1", titel: "Grundbegriffe", seiten: 40, folien: 1, teile: [{ nr: "1.1", titel: "Erster Teil" }, { nr: "1.2", titel: "Zweiter Teil" }] },
    { nr: "2", titel: "Märkte", folien: 2 }] }, o || {});

test("Prüfung: gültige Liste, Felder normalisiert, unbekannte Felder fallen weg", () => {
  const R = kapitelPruefen({ schema: 1, stand: "2026-10-19T06:30:00Z", module: [modul({ extra: "egal" })] });
  assert.equal(R.stand, "2026-10-19");
  assert.deepEqual(R.verworfen, []);
  assert.deepEqual(R.module[0], { code: "X100", semester: "WS 2026/27", quelle: "Folien 00, S. 3", stand: "2026-10-18", vorlaeufig: false,
    kapitel: [{ nr: "1", titel: "Grundbegriffe", seiten: 40, folien: 1, url: "", teile: [{ nr: "1.1", titel: "Erster Teil" }, { nr: "1.2", titel: "Zweiter Teil" }] },
      { nr: "2", titel: "Märkte", seiten: null, folien: 2, url: "", teile: [] }] });
});

test("Prüfung: ein schlechtes Kapitel verwirft sein Modul, die anderen bleiben; ganze Datei nur bei falschem Format", () => {
  const schlecht = (k) => modul({ code: "X200", kapitel: [k] });
  const R = kapitelPruefen({ schema: 1, module: [modul(),
    schlecht({ nr: "1", titel: "[[Link]] im Titel" }),
    schlecht({ nr: "1", titel: "Gut", url: "http://lehrbuch.example/1" }),
    modul({ code: "X300", kapitel: [{ nr: "1", titel: "Gut", url: "https://evil.example/1" }] }),
    modul({ code: "X400", kapitel: [{ nr: "1", titel: "A" }, { nr: "1", titel: "B" }] }),
    modul({ code: "X500", semester: "Winter 26" }),
    modul({ code: "X100" }),
  ] });
  assert.deepEqual(R.module.map((m) => m.code), ["X100"]);
  assert.deepEqual(R.verworfen.map((v) => v.id + ": " + v.grund), [
    "X200 WS 2026/27: kapitel 1: titel unzulässig",
    "X200 WS 2026/27: doppelt",
    "X300 WS 2026/27: kapitel 1: url: Domain nicht erlaubt: evil.example",
    "X400 WS 2026/27: doppelte Kapitelnummer",
    "X500 Winter 26: semester ungültig",
    "X100 WS 2026/27: doppelt",
  ]);
  assert.ok(kapitelPruefen({ schema: 2, module: [] }).fehler);
  assert.ok(kapitelPruefen({ schema: 1 }).fehler);
});

test("Prüfung: Lehrbuch-Link nur auf erlaubten Seiten (Uni, CORE), Seiten und Folien als ganze Zahlen", () => {
  const ok = kapitelPruefen({ schema: 1, module: [modul({ kapitel: [{ nr: "3", titel: "Knappheit", url: "https://books.core-econ.org/the-economy-v1/book/de/text/03.html" }] })] });
  assert.equal(ok.module[0].kapitel[0].url, "https://books.core-econ.org/the-economy-v1/book/de/text/03.html");
  const nein = kapitelPruefen({ schema: 1, module: [modul({ kapitel: [{ nr: "1", titel: "A", seiten: 12.5 }] })] });
  assert.equal(nein.verworfen[0].grund, "kapitel 1: seiten ungültig");
});

test("Notiz: Kapitel als Aufgaben mit Folien-Nummer, Seiten und Unterkapiteln; liest sich mit kapitelLesen zurück", () => {
  const e = kapitelPruefen({ schema: 1, module: [modul({ kapitel: [{ nr: "I", titel: "Erster Teil", seiten: 13, folien: 1 },
    { nr: "II", titel: "Zweiter Teil", seiten: 20, folien: 1, teile: [{ nr: "2.1", titel: "Abschnitt" }] }] })] }).module[0];
  const text = zentralNotiz(e, "");
  assert.match(text, /^---\ntyp: lernplan\ncode: X100\nherkunft: zentral\nsemester: "WS 2026\/27"\n/);
  assert.match(text, /\n- \[ \] I Erster Teil · 13 S\.\n- \[ \] II Zweiter Teil · Folien 1 · 20 S\.\n {2}- \[ \] 2\.1 Abschnitt\n/,
    "Folien 1 steht nur, wenn sie von der Kapitelnummer abweicht (I = 1)");
  assert.match(text, /\n## Meine Notizen\n$/);
  const K = kapitelLesen(text);
  assert.deepEqual(K.map((k) => [k.nr, k.titel, k.folien, k.seiten]), [["I", "Erster Teil", null, 13], ["II", "Zweiter Teil", 1, 20]]);
});

test("Notiz: neue Liste behält Häkchen, seit/verstanden_bis und „Meine Notizen“; sonst unverändert = gleicher Text", () => {
  const e1 = kapitelPruefen({ schema: 1, module: [modul()] }).module[0];
  let alt = zentralNotiz(e1, "");
  alt = alt.replace("- [ ] 1 Grundbegriffe", "- [x] 1 Grundbegriffe").replace("  - [ ] 1.2 Zweiter Teil", "  - [x] 1.2 Zweiter Teil")
    .replace("stand: 2026-10-18\n", "stand: 2026-10-18\nseit: 2026-11-02\n").replace("## Meine Notizen\n", "## Meine Notizen\n\nKapitel 2 mit Altklausur üben.\n");
  assert.equal(zentralNotiz(e1, alt), alt, "nichts geändert");
  const e2 = kapitelPruefen({ schema: 1, module: [modul({ stand: "2026-10-25", kapitel: e1.kapitel.concat([{ nr: "3", titel: "Neu", folien: 3 }]) })] }).module[0];
  const neu = zentralNotiz(e2, alt);
  assert.match(neu, /\n- \[x\] 1 Grundbegriffe · 40 S\.\n {2}- \[ \] 1\.1 Erster Teil\n {2}- \[x\] 1\.2 Zweiter Teil\n- \[ \] 2 Märkte\n- \[ \] 3 Neu\n/);
  assert.match(neu, /\nseit: 2026-11-02\n/);
  assert.match(neu, /\nstand: 2026-10-25\n/);
  assert.match(neu, /## Meine Notizen\n\nKapitel 2 mit Altklausur üben\.\n$/);
});

test("Abgleich: gleiche Liste fasst die Notiz nicht an (Eigenes bleibt), eine neue Liste schreibt sie mit Häkchen neu", async () => {
  const frontmatter = {}, dateien = {}, schritte = [];
  let speicher = null;
  let liste = { code: "X100", semester: "WS 2026/27", quelle: "Folien", stand: "2026-10-19", vorlaeufig: false,
    kapitel: [{ nr: "1", titel: "Einführung", seiten: 30, folien: 1, url: "", teile: [] }, { nr: "2", titel: "Märkte", seiten: null, folien: 2, url: "", teile: [] }] };
  const { ctx, ergebnis: L } = laden("lernplan", { heute: "2026-10-19", frontmatter, kontext: {
    zentral: { kapitel: () => ({ module: [liste] }), abruferHier: async () => true },
    modell: { daten: () => ({ module: [{ code: "X100", status: "geplant", semester: "WS 2026/27" }] }), semesterFuer: () => ({ name: "WS 2026/27" }) },
  } });
  const V = ctx.app.vault, P = "Lernplan/X100 Lernplan.md";
  V.getAbstractFileByPath = (p) => (p in dateien ? { path: p, basename: p.slice(9, -3), extension: "md" } : p === "Lernplan" ? { path: p } : null);
  V.createFolder = async () => {};
  V.create = async (p, t) => { dateien[p] = t; frontmatter[p] = { typ: "lernplan", herkunft: "zentral" }; schritte.push("neu"); };
  V.read = async (f) => dateien[f.path];
  V.process = async (f, fn) => { dateien[f.path] = fn(dateien[f.path]); schritte.push("neu geschrieben"); };
  ctx.app.loadLocalStorage = () => speicher;
  ctx.app.saveLocalStorage = (_k, v) => { speicher = JSON.parse(JSON.stringify(v)); };

  await L.zentralAbgleichen();
  assert.deepEqual(schritte, ["neu"]);
  dateien[P] = dateien[P].replace("- [ ] 1 Einführung", "- [x] 1 Einführung").replace("## Kapitel\n", "## Kapitel\n\nMein Satz.\n");
  await L.zentralAbgleichen();
  assert.deepEqual(schritte, ["neu"], "gleiche Liste: kein Schreiben bei jedem Start");
  assert.ok(dateien[P].includes("Mein Satz."));
  liste = Object.assign({}, liste, { kapitel: liste.kapitel.concat([{ nr: "3", titel: "Preise", seiten: null, folien: 3, url: "", teile: [] }]) });
  await L.zentralAbgleichen();
  assert.deepEqual(schritte, ["neu", "neu geschrieben"], "neue Liste: neu geschrieben");
  assert.ok(dateien[P].includes("- [x] 1 Einführung") && dateien[P].includes("3 Preise"), "Häkchen bleiben, neues Kapitel da");
});

test("Auswahl: nur das laufende Semester und Module deines Plans (oder läuft/angemeldet), nie bestandene", () => {
  const D = { module: [
    { code: "X100", semester: "WS 2026/27", status: "offen" },
    { code: "X200", semester: "SS 2027", status: "läuft" },
    { code: "X300", semester: "SS 2027", status: "offen" },
    { code: "X400", semester: "WS 2026/27", status: "bestanden" },
  ] };
  const E = ["X100", "X200", "X300", "X400", "X999"].map((code) => ({ code, semester: "WS 2026/27" })).concat([{ code: "X100", semester: "SS 2027" }]);
  assert.deepEqual(zentralAuswahl(E, D, "WS 2026/27").map((e) => e.code + " " + e.semester), ["X100 WS 2026/27", "X200 WS 2026/27"]);
});
