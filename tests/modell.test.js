// Datenmodell (modell.js): Semesterliste aus Studienbeginn + zentralen Daten, Semesterregel, Vorlesungswochen.
// Semesterdaten: Schnappschuss der öffentlichen zentralen Daten (tests/daten/v1/semester.json, gleiche Felder wie
// System/Daten/Semester.md). Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { laden, json } = require("./laden.js");

const SEMESTER = json("semester.json");
const modell = (heute, einstellungen = {}) => laden("modell", {
  heute,
  frontmatter: { "System/Daten/Semester.md": SEMESTER, "System/Einstellungen.md": einstellungen },
}).ctx.modell;

test("Semestername aus dem Datum (WS 1.10.–31.3., SS 1.4.–30.9.)", () => {
  const M = modell("2026-10-15");
  assert.equal(M.semesterAusDatum("2026-10-15"), "WS 2026/27");
  assert.equal(M.semesterAusDatum("2027-03-31"), "WS 2026/27");
  assert.equal(M.semesterAusDatum("2027-04-01"), "SS 2027");
  assert.equal(M.semesterAusDatum("2027-09-30"), "SS 2027");
  assert.equal(M.naechster("WS 2026/27"), "SS 2027");
  assert.equal(M.naechster("SS 2027"), "WS 2027/28");
  assert.equal(M.voriger("WS 2026/27"), "SS 2026");
});

test("Standard ohne Studienbeginn: aktuelles Semester ist das 1. Fachsemester, Regelstudienzeit 6", () => {
  const D = modell("2026-10-15").daten();
  assert.equal(D.studienbeginnStandard, true);
  assert.equal(D.variante, "offen");
  assert.equal(D.semesterliste.length, 6);
  assert.deepEqual(D.semesterliste.map((s) => s.name), ["WS 2026/27", "SS 2027", "WS 2027/28", "SS 2028", "WS 2028/29", "SS 2029"]);
  assert.equal(D.fachsemester, 1);
  assert.equal(D.aktuell.vb, "2026-10-12");
  assert.equal(D.lehrphase, "Vorlesungszeit");
});

test("Studienbeginn WS 2025/26 → im WS 2026/27 drittes Fachsemester (Semester ohne Daten nach Regel)", () => {
  const D = modell("2026-10-15", { studienbeginn: "2025-10-01" }).daten();
  assert.equal(D.semesterliste[0].name, "WS 2025/26");
  assert.equal(D.semesterliste[0].status, "geschätzt", "WS 2025/26 steht nicht in den Daten → Regel");
  assert.equal(D.fachsemester, 3);
});

test("Semesterregel für Semester ohne zentrale Daten", () => {
  const M = modell("2026-10-15");
  const ws = M.semesterNachName("WS 2035/36");
  assert.equal(ws.vb, "2035-10-15", "erster Montag ab 10.10.");
  assert.equal(ws.ve, "2036-02-09", "Samstag nach 17 Wochen");
  const ss = M.semesterNachName("SS 2036");
  assert.equal(ss.vb, "2036-04-14", "erster Montag ab 10.4.");
  assert.equal(ss.ve, "2036-07-26", "Samstag nach 15 Wochen");
});

test("Vorlesungswochen WS 2026/27: 16, die Woche 28.12.–03.01. zählt nicht", () => {
  const M = modell("2026-10-15");
  const W = M.vorlesungswochen(M.semesterNachName("WS 2026/27"));
  assert.equal(W.gesamt, 16);
  const pause = W.wochen.filter((w) => w.nr === 0).map((w) => w.mo);
  assert.deepEqual(pause, ["2026-12-28"]);
  assert.equal(W.wochen[0].mo, "2026-10-12");
});

test("Wochenanzeige an typischen Tagen", () => {
  const faelle = {
    "2026-10-01": ["vor", "noch 11 Tage bis Vorlesungsbeginn"],
    "2026-10-11": ["vor", "Vorlesungsbeginn morgen"],
    "2026-10-15": ["vorlesung", "Vorlesungswoche 1 von 16"],
    "2026-12-29": ["pause", "Weihnachtspause bis 06.01."],
    "2027-01-07": ["vorlesung", "Vorlesungswoche 12 von 16"],
    "2027-02-02": ["vorlesung", "Vorlesungswoche 16 von 16 · Prüfungsphase"],
    "2027-02-10": ["pruefung", "Prüfungsphase bis 13.02."],
  };
  for (const [tag, [art, text]] of Object.entries(faelle)) {
    const w = modell(tag).woche(tag);
    assert.equal(w.art, art, tag);
    assert.equal(w.text, text, tag);
  }
});

test("Abgeleitete Felder für die Einstellungen (Format fs|name|beginn|ende|vb|ve)", () => {
  const D = modell("2026-10-15").daten();
  assert.equal(D.abgeleitet.semesterliste[0], "1|WS 2026/27|2026-10-01|2027-03-31|2026-10-12|2027-02-06");
  assert.ok(D.abgeleitet.pausen.includes("2026-12-23|2027-01-06|Weihnachtspause"));
  assert.ok(D.abgeleitet.pruefungsphasen.includes("2027-01-29|2027-02-13|Haupttermin|offiziell"));
});
