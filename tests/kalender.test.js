// Kalender (kalender.js, art, frisch): Farbe des Punkts je Art nach der Regel des Fachmodells (ctx.modell.terminArt). Zwischentests
// (Titel) sind keine Prüfung und bekommen eine eigene Art. Die Auswahl von Monat und Tag verfällt am nächsten Tag und nach 30 Min.
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

test("frisch: die Auswahl gilt nur am selben Tag und 30 Minuten nach dem letzten Tipp, dann wieder heute", () => {
  const { frisch } = laden("kalender", { heute: "2026-10-17", kontext: { modell } }).ergebnis;
  const um = (s) => new Date(s);
  const z = { monat: new Date(2026, 10, 1), tag: new Date(2026, 10, 12), am: new Date(2026, 9, 17), zeit: um("2026-10-17T10:00:00").getTime() };
  assert.equal(frisch(z, um("2026-10-17T10:29:00")), true);
  assert.equal(frisch(z, um("2026-10-17T10:31:00")), false, "30 Minuten ohne Tipp");
  assert.equal(frisch(Object.assign({}, z, { zeit: um("2026-10-17T23:50:00").getTime() }), um("2026-10-18T00:05:00")), false, "neuer Tag");
  assert.equal(frisch({ monat: null, tag: null, am: null, zeit: 0 }, um("2026-10-17T10:00:00")), false, "noch nichts gewählt");
  assert.equal(frisch({ monat: z.monat, tag: z.tag }, um("2026-10-17T10:00:00")), false, "Stand vor dem Update (ohne am)");
});
