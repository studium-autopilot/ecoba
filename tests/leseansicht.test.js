// Übersichtsseiten nur in der Leseansicht (start.js, nurLesen): welche Notizen gesperrt sind. Läuft ohne Obsidian.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
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
