// Dashboard der Vorlage (Dashboard.md): Regeln, die nicht wieder verloren gehen sollen. Erste Kachel ist immer „Nächste Frist“;
// „Termine · 14 Tage“ zeigt Fachschaft und Veranstaltungen von heute und morgen, nach Tag und Uhrzeit, höchstens 8 (seit
// 14.10.2026 im privaten Tresor, seit 18.10.2026 wieder in der Vorlage). Die Bases-Formeln selbst prüft man in Obsidian
// (docs/tests.md).
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const DASH = fs.readFileSync(path.join(__dirname, "..", "Studium Autopilot", "Dashboard.md"), "utf8");
const zeilen = DASH.split("\n");
// Inhalt des Base-Blocks einer Karte mit diesem Titel (ohne die Zitat-Zeichen)
const karte = (titel) => {
  const a = zeilen.findIndex((z) => z.indexOf("]+ " + titel) >= 0);
  assert.ok(a >= 0, "Karte fehlt: " + titel);
  const b = zeilen.findIndex((z, i) => i > a + 1 && /^[> ]*```\s*$/.test(z));
  return zeilen.slice(a + 1, b).map((z) => z.replace(/^(> ?)+/, "")).join("\n");
};

test("Kacheln: „Nächste Frist“ zuerst (akzent frist), dann Prüfung, Semester, ECTS, Notenschnitt; nur eine Akzent-Kachel", () => {
  const formel = zeilen.find((z) => z.indexOf("html(\"<div class='eba-kz'>") >= 0);
  assert.ok(formel, "Formel karte fehlt");
  const kacheln = formel.split("<div class='eba-kachel").slice(1).map((k) => k.slice(0, k.indexOf("'>")).trim() + "|" + k.match(/"([^"]+)" \+ "<\/span>/)[1]);
  assert.deepEqual(kacheln, ["akzent frist|Nächste Frist", "|Nächste Prüfung", "|Semester", "|ECTS", "|Notenschnitt"]);
  assert.match(formel, /<div class='eba-kz-reihe'>/, "fünf Kacheln, ohne Klasse vier");
  // Formeln der Frist: nur Kategorie Frist, offen (formula.t ohne erledigt), läuft noch oder kommt
  assert.match(DASH, /\n> {3}tf: \|-\n> {5}formula\.t\.filter\(value\.properties\.kategorie == "Frist" && value\.properties\.datum && date\(if\(value\.properties\.bis, value\.properties\.bis, value\.properties\.datum\)\) >= today\(\)\)/);
  for (const f of ["f0", "fstart", "fende", "ftage", "ftext"]) assert.match(DASH, new RegExp("\\n> {3}" + f + ": \\|-\\n"), "Formel " + f);
});

test("Termine · 14 Tage: Fachschaft und Veranstaltung von heute und morgen, nach Tag und Uhrzeit, höchstens 8", () => {
  const t = karte("Termine · 14 Tage");
  assert.match(t, /- and:\n {8}- 'typ == "termin"'\n {8}- '\["Fachschaft", "Veranstaltung"\]\.contains\(kategorie\)'\n {8}- 'erledigt != true'\n {8}- 'date\(datum\) <= today\(\) \+ duration\("1d"\)'\n {8}- 'date\(if\(bis, bis, datum\)\) >= today\(\)'/);
  assert.match(t, /'!\["Fachschaft", "Veranstaltung", "Frist", "Prüfung"\]\.contains\(kategorie\)'/, "sonst ohne Fachschaft und Veranstaltung");
  assert.match(t, /\n {2}uhr: /);
  assert.match(t, /sort:\n {6}- property: formula\.wann\n {8}direction: ASC\n {6}- property: formula\.uhr\n {8}direction: ASC\n {4}limit: 8\n/);
  assert.match(karte("Fristen · 30 Tage"), /limit: 6\n/, "Fristen unverändert");
});
