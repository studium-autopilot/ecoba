// Dashboard der Vorlage (Dashboard.md) und dashboard.js: Kacheln und Listen kommen seit 18.10.2026 aus dem Fachmodell (keine
// Bases-Formeln mehr). Erste Kachel ist immer „Nächste Frist“; „Fristen · 30 Tage“ zeigt Fristen, Prüfungen und Abgaben nach dem
// Tag, den die Zeile zeigt (höchstens 6); „Termine · 14 Tage“ zeigt Fachschaft und Veranstaltungen nur heute und morgen, nach
// Tag und Uhrzeit (höchstens 8). Notizen ausgedacht (Codes X100 …), Semesterdaten aus tests/daten/v1. Läuft ohne Obsidian.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { laden, json } = require("./laden.js");

const DASH = fs.readFileSync(path.join(__dirname, "..", "Studium Autopilot", "Dashboard.md"), "utf8").replace(/\r/g, "");
const PRUEF = fs.readFileSync(path.join(__dirname, "..", "Studium Autopilot", "Studium", "Prüfungen.md"), "utf8").replace(/\r/g, "");
const SEMESTER = json("semester.json");

// Dashboard-Skript auf einem Modell mit diesen Notizen
const dashboard = (heute, notizen = {}, einstellungen = {}) => {
  const M = laden("modell", { heute, notizen, frontmatter: { "System/Daten/Semester.md": SEMESTER, "System/Einstellungen.md": einstellungen } }).ctx.modell;
  return { M, B: laden("dashboard", { heute, kontext: { modell: M } }).ergebnis };
};
const termin = (datum, titel, o) => ({ ["Termine/" + datum + " " + titel + ".md"]: Object.assign({ typ: "termin", titel, datum, status: "offiziell", erledigt: false }, o) });
const alle = (...t) => Object.assign({}, ...t);

test("Seiten: Kacheln und Listen sind Codeblöcke aus dem Fachmodell, keine Bases-Formeln", () => {
  assert.match(DASH, /\n> \[!eba-kennzahlen\]\n> ```eba-kacheln\n/);
  assert.match(DASH, /> > \[!eba-termin\|[^\n]*\]\+ Fristen · 30 Tage\n> > ```eba-liste fristen\n> > Fristen erscheinen/);
  assert.match(DASH, /> > \[!eba-termin\|[^\n]*\]\+ Termine · 14 Tage\n> > ```eba-liste termine\n> > Termine erscheinen/);
  assert.match(PRUEF, /> \[!eba-tabelle\|[^\n]*\] Termine\n> ```eba-liste pruefungen\n> Prüfungen erscheinen/);
  for (const f of ["formula.tf", "formula.kl", "formula.wochetext", "eba-kz-reihe"]) assert.ok(!DASH.includes(f), "Formel noch da: " + f);
});

test("Ersatztext entscheidet, welche Liste (verschachtelte Karten liefern den Abschnitt beider Listen)", () => {
  const { B } = dashboard("2026-10-18");
  assert.equal(B.artVon("Termine erscheinen, sobald Studium Autopilot läuft.\n"), "termine");
  assert.equal(B.artVon("Fristen erscheinen, sobald Studium Autopilot läuft.\n"), "fristen");
  assert.equal(B.artVon("Prüfungen erscheinen, sobald Studium Autopilot läuft.\n"), "pruefungen");
  assert.equal(B.artVon("Prüfungstermine erscheinen, sobald Studium Autopilot läuft.\n"), "pruefungen", "Seite vor 0.4.6");
});

const NOTIZEN = alle(
  termin("2026-10-12", "TCP-Kurse – Belegung", { kategorie: "Frist", bis: "2026-10-25", bereich: "schluesselqualifikation" }),
  termin("2026-10-18", "Belegfrist Kolloquium", { kategorie: "Frist" }),
  termin("2026-10-19", "Tutorien-Anmeldung X110 (ILIAS)", { kategorie: "Frist", ort: "ab 17:00 · ILIAS-Kurs" }),
  termin("2026-11-13", "Zwischentest 1 X100", { kategorie: "Prüfung", code: "X100", ort: "17:00–18:00 · online" }),
  termin("2026-10-18", "Spieleabend", { kategorie: "Fachschaft", ort: "17:00–21:00 · Fachschaftsraum" }),
  termin("2026-10-20", "Übung X100 spät", { kategorie: "Lehre", ort: "12:15–13:45" }),
  termin("2026-10-20", "Übung X100 früh", { kategorie: "Lehre", ort: "9:15–10:45" }),
  termin("2026-10-21", "Kneipentour", { kategorie: "Fachschaft" }),
  termin("2026-10-22", "Vortrag (entfällt)", { kategorie: "Lehre", entfaellt: true }),
  { "Module/1 Grundstudium/X180 Beispiel.md": { typ: "modul", code: "X180", titel: "Beispielabschluss", status: "anerkannt", ects: 6, gruppe: "Grundstudium" } },
  termin("2027-01-30", "Klausur X180", { kategorie: "Prüfung", code: "X180" }),
  { "Module/1 Grundstudium/X100 Beispiel.md": { typ: "modul", code: "X100", titel: "Beispielmathematik", ects: 9, gruppe: "Grundstudium", klausur: "2027-02-08" } },
  { "Übungsblätter/X100 Blatt 01.md": { typ: "übungsblatt", code: "X100", nummer: 1, faellig: "2026-10-16", status: "offen" } },
);

test("Kacheln: Nächste Frist zuerst (akzent frist), dann Prüfung (Modulstatus gilt), Semester, ECTS, Gesamtnote; Leiste mit Planwoche", () => {
  const { B, M } = dashboard("2026-10-18", NOTIZEN, { name: "Alex" });
  const K = B.kachelnBauen(M, new Date("2026-10-18T09:00:00"));
  assert.equal(K.gruss, "Guten Morgen, Alex");
  assert.equal(K.datum, "Sonntag, 18. Oktober 2026");
  assert.deepEqual(K.kacheln.map((k) => (k.cls ? k.cls + "|" : "|") + k.k), ["akzent frist|Nächste Frist", "|Nächste Prüfung", "|Semester", "|ECTS", "|Gesamtnote"]);
  assert.deepEqual([K.kacheln[0].v, K.kacheln[0].s], ["Belegfrist Kolloquium", "18.10. · heute"]);
  assert.deepEqual([K.kacheln[1].v, K.kacheln[1].s], ["X100 · Beispielmathematik", "08.02. · in 113 Tagen"], "X180 ist anerkannt");
  assert.equal(K.kacheln[2].s, "Vorlesungszeit · noch 111 Tage Vorlesungen");
  assert.match(K.kacheln[3].v, /^6<small>/, "anerkanntes Modul zählt");
  assert.equal(K.leiste.text, "Vorlesungswoche 2 von 16");
  const jetzt = K.leiste.wochen.findIndex((w) => w.zustand === "jetzt");
  assert.match(K.leiste.wochen[jetzt].titel, /^KW 43 · 19\.10\.–25\.10\.$/, "Sonntag: die kommende Woche");
  assert.equal(K.leiste.wochen[jetzt - 1].zustand, "vorbei");
  assert.deepEqual(K.leiste.wochen.slice(0, 3).map((w) => w.art), ["f", "f", "v"]);
  assert.ok(K.leiste.wochen.some((w) => w.art === "w") && K.leiste.wochen.some((w) => w.art === "p"));
});

test("Fristen · 30 Tage: Fristen, Prüfungen, Abgaben nach dem gezeigten Tag; läuft → Ende; Uhrzeit aus „ab …“", () => {
  const { B, M } = dashboard("2026-10-18", NOTIZEN);
  const z = B.zeilenBauen("fristen", M, "2026-10-18");
  assert.deepEqual(z.map((x) => `${x.wann}|${x.was}|${x.pille.text}`), [
    "überfällig|X100 · Blatt 1|Abgabe",
    "Heute|Belegfrist Kolloquium|Frist",
    "Morgen|Tutorien-Anmeldung X110|Frist",
    "läuft bis So 25.10.|TCP-Kurse – Belegung|Frist · freiwillig",
    "Fr 13.11.|Zwischentest 1 X100|Zwischentest",
  ]);
  assert.equal(z[2].uhr, "17:00");
  assert.deepEqual([z[1].bald, z[3].bald], [true, false]);
});

test("Termine · 14 Tage: ohne Fristen und Prüfungen, Fachschaft nur heute und morgen, Uhrzeit als Zahl, Entfallenes fehlt", () => {
  const { B, M } = dashboard("2026-10-18", NOTIZEN);
  const z = B.zeilenBauen("termine", M, "2026-10-18");
  assert.deepEqual(z.map((x) => `${x.wann}|${x.uhr}|${x.was}|${x.pille.ton}`), [
    "Heute|17:00–21:00|Spieleabend|akzent",
    "Di 20.10.|9:15–10:45|Übung X100 früh|info",
    "Di 20.10.|12:15–13:45|Übung X100 spät|info",
  ]);
});

test("Prüfungstermine: kommende Prüfungen samt Modulfeld, ohne Erledigtes und Anerkanntes, Zwischentest markiert", () => {
  const { B, M } = dashboard("2026-10-18", NOTIZEN);
  const z = B.zeilenBauen("pruefungen", M, "2026-10-18");
  assert.deepEqual(z.map((x) => `${x.wann}|${x.was}|${x.pille ? x.pille.text : ""}`), [
    "Fr 13.11. · in 26 Tagen|Zwischentest 1 X100|Zwischentest",
    "Mo 08.02. · in 113 Tagen|X100 · Beispielmathematik|",
  ]);
});
