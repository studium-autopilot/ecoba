// Studienverlauf (verlauf.js, rechnen): Fähnchen der Prüfungen. Zwischentests sind nie die nächste Prüfung und verdecken keine
// Klausur am selben Tag. Nur ausgedachte Daten. Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { laden } = require("./laden.js");

const { rechnen } = laden("verlauf", { heute: "2026-10-17" }).ergebnis;
const d = (tag, monat, jahr) => new Date(jahr || 2026, monat - 1, tag);
const modul = (code, klausur) => ({ pfad: `Module/${code}.md`, code, titel: "Beispiel", ects: 6, sem: "WS 2026/27", semFs: "", status: "offen",
  ergebnis: "", klausur, op: false, zusatz: false, gewaehlt: false, gruppe: "Grundstudium", pruefung: "Klausur" });
const termin = (titel, datum, code = "X100") => ({ datum, titel, code, geschaetzt: false, pfad: `Termine/${titel}.md` });
const daten = (module, termine) => ({ c: {}, variante: "offen", sq: 0, pausen: [], phasen: [], module, termine,
  sems: [{ fs: 1, name: "WS 2026/27", sb: d(1, 10), se: d(31, 3, 2027), vb: d(12, 10), ve: d(12, 2, 2027), geschaetzt: false, hinweis: "" }] });

test("Nächste Prüfung überspringt Zwischentests (Titel, Groß- und Kleinschreibung egal)", () => {
  const R = rechnen(daten([modul("X100", null)], [
    termin("Zwischentest 1 X100 Beispiel", d(13, 11)),
    termin("zwischentest X100", d(20, 11)),
    termin("Klausur X100 Beispiel", d(30, 1, 2027)),
  ]));
  assert.equal(R.naechste.titel, "Klausur X100 Beispiel");
  assert.deepEqual(R.pruef.map((p) => [p.label, !!p.test, p.haupt]), [
    ["X100 Zwischentest 1", true, false],
    ["X100 Zwischentest", true, false],
    ["X100 Prüfung", false, true],
  ]);
});

test("Ein Zwischentest am selben Tag verdeckt die Klausur des Moduls nicht", () => {
  const R = rechnen(daten([modul("X100", d(13, 11))], [termin("Zwischentest 1 X100", d(13, 11))]));
  assert.equal(R.pruef.length, 2);
  assert.equal(R.naechste.art, "klausur");
});
