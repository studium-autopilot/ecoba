// Weniger Tabs (start.js, seit 27.10.2026; Rückmeldung: „Es entstehen zuviele offene tabs“): Der Start zeigt das Dashboard in jedem Tab,
// der navigieren kann (auch nach einer PDF kein neuer Tab), und leere Tabs schließen, sobald ein anderer vorn ist.
// Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { laden } = require("./laden.js");

const START = fs.readFileSync(path.join(__dirname, "..", "Studium Autopilot", "System", "Skripte", "start.js"), "utf8");

test("Start: das Dashboard im zuletzt benutzten Tab, wenn er navigieren kann (auch eine PDF), sonst ein neuer", () => {
  assert.match(START, /zuletzt && typeof zuletzt\.canNavigate === "function" && zuletzt\.canNavigate\(\) \? zuletzt : app\.workspace\.getLeaf\("tab"\)/);
  assert.doesNotMatch(START, /art === "markdown" \|\| art === "empty"/, "nach einer PDF kam bei jedem Start ein Tab dazu");
});

test("Leere Tabs: schließen, wenn ein anderer vorn ist und die Gruppe weitere Tabs hat", () => {
  const { leereZuSchliessen } = laden("start").ergebnis;
  const b = (leer, aktiv, geschwister) => ({ leer, aktiv, geschwister });
  const liste = [b(true, false, 3), b(true, true, 3), b(false, false, 3), b(true, false, 1)];
  assert.deepEqual(leereZuSchliessen(liste), [liste[0]], "nur der leere, nicht vordere Tab einer Gruppe mit weiteren");
  assert.deepEqual(leereZuSchliessen([b(true, false, 1)]), [], "eine leere Hälfte einer geteilten Fläche bleibt");
  assert.deepEqual(leereZuSchliessen([b(true, true, 2)]), [], "der leere Tab, in dem du gerade bist, bleibt");
});

test("Leere Tabs: bei jedem Wechsel des vorderen Tabs, nur in der Hauptfläche, Art aus getViewState", () => {
  assert.match(START, /an\(ws, "active-leaf-change", ctx\.entprellen\(leereSchliessen, 400\)\)/);
  assert.match(START, /if \(!aktiv \|\| !aktiv\.getRoot \|\| aktiv\.getRoot\(\) !== ws\.rootSplit\) return;/);
  assert.match(START, /leer: vs\.type === "empty"/, "im Hintergrund nicht geladene Tabs zählen nicht als leer");
});
