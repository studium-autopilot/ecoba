// Musterstudienpläne (musterplan.js): Hinweise stehen einmal unter allen Plänen statt unter jedem. Nur ausgedachte Texte.
// Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { laden } = require("./laden.js");

const DATEN = "System/Daten/Musterplan.md";
const PLAENE = [{ id: "economics", name: "Economics" }, { id: "ba", name: "Business Administration" }, { id: "ohne", name: "ohne Spezialisierung" }];
const HINWEISE = [
  { plan: "alle", text: "Gemeinsam 1" },
  { plan: "economics", text: "Nur Economics" },
  { plan: "alle", text: "Gemeinsam 2" },
  { plan: "ba", text: "BA 1" },
  { plan: "ba", text: "BA 2" },
  { plan: "ohne", text: "" },
];

const MP = laden("musterplan", { frontmatter: { [DATEN]: { plaene: PLAENE, eintraege: [], hinweise: HINWEISE } } }).ergebnis;

test("mehrere Pläne: gemeinsame Hinweise einmal, danach je Variante in Planreihenfolge, leere fallen weg", () => {
  const { gemeinsam, jePlan } = MP.hinweiseOrdnen(HINWEISE, PLAENE);
  assert.deepEqual(gemeinsam, ["Gemeinsam 1", "Gemeinsam 2"]);
  assert.deepEqual(jePlan, [
    { id: "economics", name: "Economics", texte: ["Nur Economics"] },
    { id: "ba", name: "Business Administration", texte: ["BA 1", "BA 2"] },
  ]);
});

test("nur gezeigte Pläne: Hinweise anderer Varianten erscheinen nicht", () => {
  const { jePlan } = MP.hinweiseOrdnen(HINWEISE, PLAENE.filter((p) => p.id !== "economics"));
  assert.deepEqual(jePlan.map((g) => g.id), ["ba"]);
});

test("ein Plan: eine Liste, erst die gemeinsamen, dann die der Variante", () => {
  assert.deepEqual(MP.hinweiseOrdnen(HINWEISE, [PLAENE[1]]), { gemeinsam: ["Gemeinsam 1", "Gemeinsam 2", "BA 1", "BA 2"], jePlan: [] });
  assert.deepEqual(MP.hinweiseOrdnen(HINWEISE, [PLAENE[2]]), { gemeinsam: ["Gemeinsam 1", "Gemeinsam 2"], jePlan: [] });
});

test("lesen: Hinweise aus der Datennotiz, ohne Hinweise leere Listen", () => {
  const M = MP.lesen();
  assert.deepEqual(M.hinweise, HINWEISE);
  assert.deepEqual(MP.hinweiseOrdnen([], PLAENE), { gemeinsam: [], jePlan: [] });
});

// Gemeinsamer Stamm (seit 17.10.2026): bis zu welchem Fachsemester alle gezeigten Pläne dieselben Einträge haben
const E = (plan, fs, code, ects, extra) => Object.assign({ plan, fs, code, titel: `${code} Titel`, ects, op: false, art: "modul" }, extra);
const STAMM = [
  E("economics", 1, "A1", 6), E("economics", 2, "A2", 6), E("economics", 3, "E3", 6),
  E("ba", 1, "A1", 6), E("ba", 2, "A2", 6), E("ba", 3, "B3", 6),
  E("ohne", 1, "A1", 6), E("ohne", 2, "A2", 6), E("ohne", 3, "O3", 6),
];

test("stamm: die ersten Semester sind in allen Plänen gleich, danach trennen sie sich", () => {
  assert.equal(MP.stamm(STAMM, PLAENE), 2);
  assert.equal(MP.stamm(STAMM, PLAENE.slice(0, 2)), 2);
  assert.equal(MP.stamm(STAMM.filter((e) => e.fs <= 2), PLAENE), 2, "leere Semester zählen nicht als gemeinsam");
});

test("stamm: Unterschiede in ECTS, Code, Reihenfolge oder OP beenden den Stamm", () => {
  const ohne = (pl, fs) => STAMM.filter((e) => !(e.plan === pl && e.fs === fs));
  assert.equal(MP.stamm(ohne("ba", 2).concat([E("ba", 2, "A2", 9)]), PLAENE), 1);
  assert.equal(MP.stamm(ohne("ohne", 1).concat([E("ohne", 1, "X1", 6)]), PLAENE), 0);
  assert.equal(MP.stamm(ohne("ba", 1).concat([E("ba", 1, "A1", 6, { op: true })]), PLAENE), 0);
  const zwei = STAMM.concat([E("economics", 1, "Z1", 3), E("ba", 1, "Z1", 3), E("ohne", 1, "Z1", 3)]);
  assert.equal(MP.stamm(zwei, PLAENE), 2, "gleiche Einträge in gleicher Reihenfolge");
  assert.equal(MP.stamm(zwei.filter((e) => !(e.plan === "ba" && e.code === "Z1")).concat([E("ba", 1, "Z1", 3)]), PLAENE), 2, "Reihenfolge der Liste zählt nur je Semester");
});

test("stamm: ein Plan oder keine Einträge haben keinen Stamm", () => {
  assert.equal(MP.stamm(STAMM, [PLAENE[0]]), 0);
  assert.equal(MP.stamm([], PLAENE), 0);
});
