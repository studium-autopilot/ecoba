// Kalender (kalender.js, art): Farbe des Punkts je Art nach der Regel des Fachmodells (ctx.modell.terminArt). Zwischentests
// (Titel) sind keine Prüfung und bekommen eine eigene Art.
// Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { laden } = require("./laden.js");

const modell = laden("modell", { heute: "2026-10-17" }).ctx.modell;
const { art } = laden("kalender", { heute: "2026-10-17", kontext: { modell } }).ergebnis;

test("art: Prüfung rot, Zwischentest eigene Art, Rest wie bisher", () => {
  assert.equal(art("Prüfung", "Klausur X100 Beispiel"), "pruefung");
  assert.equal(art("Prüfung", "Zwischentest 1 X100 Beispiel"), "zwischentest");
  assert.equal(art("Prüfung", "2026-12-04 zwischentest 2 X100"), "zwischentest");
  assert.equal(art("Prüfung"), "pruefung");
  assert.equal(art("Frist", "Zwischentest anmelden"), "frist");
  assert.equal(art("Fachschaft"), "event");
  assert.equal(art("Lehre"), "uni");
});
