// Quellen außerhalb des Plugins (eba.js, quelleExtern und quellenExtern): ausdrückliche Liste „quellen_extern“ in den
// Einstellungen, sonst beim eigenen Uni-Abgleich alles außer den Übungsgruppen, sonst nichts. Läuft ohne Obsidian.
"use strict";
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const EBA = require(path.join(__dirname, "..", "Studium Autopilot", "System", "Skripte", "eba.js"));
const ALLE = ["stundenplan", "ilias-dateien", "ilias-gruppen", "ilias-kalender", "alma-konto", "volltext"];
const OHNE_GRUPPEN = ALLE.filter((q) => q !== "ilias-gruppen");
const nichts = () => false;
const mitAbgleich = (p) => p === "System/Skripte/abgleich.js";

test("Schlüssel: sechs Quellen, fest", () => {
  assert.deepEqual(Array.from(EBA.QUELLEN), ALLE);
  assert.throws(() => { "use strict"; EBA.QUELLEN.push("mail"); }, TypeError);
});

test("Ohne Liste: ohne eigenen Abgleich nichts extern, mit ihm alles außer den Übungsgruppen", () => {
  assert.deepEqual(EBA.quellenExtern(nichts, {}), []);
  assert.deepEqual(EBA.quellenExtern(nichts, null), []);
  for (const q of ALLE) assert.equal(EBA.quelleExtern(q, nichts, {}), false, q);
  for (const [fall, existiert, einstellungen] of [
    ["abgleich.js im Tresor", mitAbgleich, {}],
    ["ilias_unterlagen: extern", nichts, { ilias_unterlagen: " Extern " }],
  ]) {
    assert.deepEqual(EBA.quellenExtern(existiert, einstellungen), OHNE_GRUPPEN, fall);
    assert.equal(EBA.quelleExtern("ilias-gruppen", existiert, einstellungen), false, fall + ": Übungsgruppen prüft das Plugin");
    assert.equal(EBA.quelleExtern("ilias-dateien", existiert, einstellungen), true, fall);
    assert.equal(EBA.quelleExtern("stundenplan", existiert, einstellungen), true, fall);
  }
  // „quellen_extern:“ ohne Wert (YAML null) oder leerer Text gilt als nicht gesetzt
  assert.deepEqual(EBA.quellenExtern(mitAbgleich, { quellen_extern: null }), OHNE_GRUPPEN);
  assert.deepEqual(EBA.quellenExtern(mitAbgleich, { quellen_extern: "  " }), OHNE_GRUPPEN);
});

test("Ausdrückliche Liste entscheidet, auch leer; Schreibweise egal, Unbekanntes zählt nicht", () => {
  assert.deepEqual(EBA.quellenExtern(mitAbgleich, { quellen_extern: [] }), [], "leere Liste: nichts extern, trotz abgleich.js");
  assert.deepEqual(EBA.quellenExtern(mitAbgleich, { quellen_extern: ["volltext"] }), ["volltext"]);
  assert.deepEqual(EBA.quellenExtern(nichts, { quellen_extern: [" ILIAS-Gruppen ", "alma-konto", "mail", 42, null] }), ["ilias-gruppen", "alma-konto"]);
  assert.deepEqual(EBA.quellenExtern(nichts, { quellen_extern: "volltext, ilias-dateien" }), ["ilias-dateien", "volltext"], "Text mit Kommas");
  assert.deepEqual(EBA.quellenExtern(nichts, { quellen_extern: ALLE.slice().reverse() }), ALLE, "Reihenfolge wie QUELLEN");
  assert.equal(EBA.quelleExtern("ilias-gruppen", mitAbgleich, { quellen_extern: ALLE }), true, "Liste mit Übungsgruppen");
  assert.equal(EBA.quelleExtern("mail", nichts, { quellen_extern: ["mail"] }), false, "unbekannter Schlüssel");
});

test("Fehler beim Nachsehen: nichts extern statt Absturz", () => {
  const kaputt = () => { throw new Error("Tresor nicht bereit"); };
  assert.deepEqual(EBA.quellenExtern(kaputt, {}), []);
  assert.equal(EBA.quelleExtern("volltext", kaputt, {}), false);
  const kaputteEinstellungen = { get quellen_extern() { throw new Error("kaputt"); } };
  assert.deepEqual(EBA.quellenExtern(nichts, kaputteEinstellungen), []);
  assert.equal(EBA.quelleExtern("volltext", nichts, kaputteEinstellungen), false);
});
