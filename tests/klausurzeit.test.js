// Zeitleiste auf Prüfungen (klausurzeit.js, Codeblock eba-klausurzeit): welche Termine als Prüfung zählen und welche als
// Zwischentest (eigene Farbe, keine Prüfung), abgehakte Klausuren, Modulstatus. Prüfungen und Phasen kommen aus dem
// Fachmodell (Semesterdaten tests/daten/v1). Nur ausgedachte Notizen. Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { laden, json } = require("./laden.js");

function zeitleiste(notizen) {
  const modell = laden("modell", { heute: "2026-10-17", notizen, frontmatter: { "System/Daten/Semester.md": json("semester.json") } }).ctx.modell;
  return laden("klausurzeit", { heute: "2026-10-17", kontext: { modell } }).ergebnis.lesen(new Date(2026, 9, 17));
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

test("Nur eintägige Prüfungs-Termine mit Kürzel erscheinen, Entfallenes nicht", () => {
  const { pruef } = zeitleiste({
    "Termine/a.md": termin("Zwischentest 1 X100", "2026-11-13", { kategorie: "Frist" }),
    "Termine/b.md": termin("Zwischentest 2 X100", "2026-12-04", { code: "" }),
    "Termine/c.md": termin("Prüfungsphase", "2027-01-29", { bis: "2027-02-12" }),
    "Termine/e.md": termin("Klausur X100 (entfällt)", "2027-02-01", { entfaellt: true }),
  });
  assert.deepEqual(pruef, []);
});

test("Abgehakte Klausur bleibt (erledigt) und zählt nicht als „Termin folgt“ (Fehler 5)", () => {
  const { pruef, module } = zeitleiste({
    "Module/X100.md": { typ: "modul", code: "X100", gruppe: "Grundstudium", fachsemester: 1 },
    "Termine/a.md": termin("Klausur X100", "2027-02-01", { erledigt: true }),
  });
  assert.deepEqual(pruef.map((k) => [k.code, k.erledigt, k.termin]), [["X100", true, true]]);
  assert.equal(module.length, 1, "Modul des 1. Fachsemesters");
});

test("Modul anerkannt: seine Klausur steht als bestanden da (Fehler 6)", () => {
  const { pruef } = zeitleiste({
    "Module/X180.md": { typ: "modul", code: "X180", gruppe: "Grundstudium", fachsemester: 1, status: "anerkannt" },
    "Termine/a.md": termin("Klausur X180", "2027-01-30", { code: "X180" }),
  });
  assert.deepEqual(pruef.map((k) => [k.code, k.fertig, k.erledigt]), [["X180", true, false]]);
});

test("Ein Zwischentest am selben Tag verdeckt den Klausurtermin des Moduls nicht", () => {
  const { pruef } = zeitleiste({
    "Module/X100.md": { typ: "modul", code: "X100", gruppe: "Grundstudium", fachsemester: 1, klausur: "2026-11-13" },
    "Termine/a.md": termin("Zwischentest 1 X100", "2026-11-13"),
  });
  assert.deepEqual(pruef.map((k) => [k.code, !!k.test, !!k.modul]).sort(), [["X100", false, true], ["X100", true, false]]);
});

test("Prüfungsphasen nur aus den Semesterdaten (ein Master), die nächsten zwei", () => {
  const { phasen } = zeitleiste({ "Termine/c.md": termin("Klausurphase", "2027-01-20", { bis: "2027-02-20", code: "" }) });
  assert.deepEqual(phasen.map((p) => [p.art, p.von.getDate(), p.bis.getDate()]), [["Haupttermin", 29, 13], ["Nachholtermin", 30, 10]]);
});
