// Zeitleiste auf Prüfungen (klausurzeit.js, Codeblock eba-klausurzeit): welche Termine als Prüfung zählen und welche als
// Zwischentest (eigene Farbe, keine Prüfung). Nur ausgedachte Daten. Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { laden } = require("./laden.js");

function zeitleiste(notizen) {
  const fm = Object.assign({
    "System/Einstellungen.md": {
      semesterliste: ["1|WS 2026/27|2026-10-01|2027-03-31|2026-10-12|2027-02-12"],
      pruefungsphasen: ["2027-01-29|2027-02-12|Haupttermin|offiziell"],
    },
  }, notizen);
  const L = laden("klausurzeit", { heute: "2026-10-17", frontmatter: fm });
  L.ctx.app.vault.getMarkdownFiles = () => Object.keys(fm).map((p) => ({ path: p, basename: p.split("/").pop().replace(/\.md$/, "") }));
  return L.ergebnis.lesen(new Date(2026, 9, 17));
}

const termin = (titel, datum, anders = {}) => Object.assign({ typ: "termin", titel, datum, kategorie: "Prüfung", code: "X100" }, anders);

test("Zwischentests sind markiert, Klausuren nicht", () => {
  const { pruef } = zeitleiste({
    "Termine/a.md": termin("Zwischentest 1 X100 Beispiel", "2026-11-13"),
    "Termine/b.md": termin("Klausur X100 Beispiel", "2027-02-01"),
    "Termine/c.md": termin("Klausur Y200 Beispiel", "2027-02-03", { code: "Y200" }),
  });
  assert.deepEqual(pruef.map((k) => [k.code, k.titel, k.test]), [
    ["X100", "Zwischentest 1 X100 Beispiel", true],
    ["X100", "Klausur X100 Beispiel", false],
    ["Y200", "Klausur Y200 Beispiel", false],
  ]);
});

test("Ohne Titel zählt der Dateiname, Groß- und Kleinschreibung egal", () => {
  const { pruef } = zeitleiste({ "Termine/2026-12-04 zwischentest 2 X100.md": termin("", "2026-12-04") });
  assert.equal(pruef.length, 1);
  assert.equal(pruef[0].test, true);
});

test("Nur eintägige Prüfungs-Termine mit Kürzel erscheinen", () => {
  const { pruef } = zeitleiste({
    "Termine/a.md": termin("Zwischentest 1 X100", "2026-11-13", { kategorie: "Frist" }),
    "Termine/b.md": termin("Zwischentest 2 X100", "2026-12-04", { code: "" }),
    "Termine/c.md": termin("Prüfungsphase", "2027-01-29", { bis: "2027-02-12" }),
    "Termine/d.md": termin("Zwischentest 3 X100", "2027-01-15", { erledigt: true }),
  });
  assert.deepEqual(pruef, []);
});

test("Ein Zwischentest am selben Tag verdeckt den Klausurtermin des Moduls nicht", () => {
  const { pruef } = zeitleiste({
    "Module/X100.md": { typ: "modul", code: "X100", gruppe: "Grundstudium", fachsemester: 1, klausur: "2026-11-13" },
    "Termine/a.md": termin("Zwischentest 1 X100", "2026-11-13"),
  });
  assert.deepEqual(pruef.map((k) => [k.code, !!k.test, !!k.modul]), [["X100", true, false], ["X100", false, true]]);
});
