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
