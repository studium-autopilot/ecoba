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

// Lupe statt Tabelle „Semestertermine“ (17.10.2026): Rückmeldung fürs nächste Semester als Meilenstein, vorlesungsfreie Tage
// als Striche im Band und als eine Legenden-Zeile
const { lupe } = laden("verlauf", { heute: "2026-10-17" }).ergebnis;
const frei = (name, datum, geschaetzt = false, hinweis = "") => ({ name, datum, geschaetzt, hinweis });
const rueck = (fuer, von, bis, extra = {}) => Object.assign({ fuer, von, bis, pfad: "", erledigt: false, geschaetzt: false, hinweis: "" }, extra);
const mitTerminen = (extra) => Object.assign(daten([], []), {
  pausen: [{ name: "Weihnachtspause", von: d(23, 12), bis: d(6, 1, 2027), geschaetzt: false, hinweis: "" }],
  frei: [frei("Allerheiligen", d(1, 11)), frei("Neujahr", d(1, 1, 2027)), frei("Karfreitag", d(26, 3, 2027))],
  rueck: [rueck("SS 2027", d(15, 1, 2027), d(15, 2, 2027), { pfad: "Termine/Rückmeldung SS 2027.md" }), rueck("WS 2027/28", d(1, 6, 2027), d(15, 8, 2027))],
}, extra);

test("Lupe: freie Tage nur in der Vorlesungszeit und außerhalb von Pausen, Rückmeldung des Fensters in diesem Semester", () => {
  const s = rechnen(mitTerminen()).sems[0];
  assert.deepEqual(s.frei.map((x) => x.name), ["Allerheiligen"]);
  assert.equal(s.rueck.fuer, "SS 2027");
  assert.equal(rechnen(mitTerminen({ rueck: [], frei: [] })).sems[0].rueck, null);
});

test("Lupe zeigt Rückmeldung (mit Link auf die Termin-Notiz) und freie Tage", () => {
  const D = mitTerminen(), R = rechnen(D);
  const html = lupe(D, R, R.sems[0]);
  assert.match(html, /<span data-pfad="Termine\/Rückmeldung SS 2027\.md" role="link" tabindex="0"><i class="raute"><\/i><b>Rückmeldung fürs SS 2027<\/b>: 15\.01\. – 15\.02\.<\/span>/);
  assert.match(html, /<i class="eba-vl-b pause frei"><\/i>Frei 01\.11\.<\/span>/);
  assert.equal((html.match(/class="eba-vl-b pause frei"/g) || []).length, 2, "ein Strich im Band, einer in der Legende");
  assert.doesNotMatch(html, /geschätzt/);
});

test("Lupe: geschätzte Rückmeldung und freie Tage tragen „(geschätzt)“ und ihren Hinweis; abgehakt = gefüllte Raute", () => {
  const D = mitTerminen({
    frei: [frei("Allerheiligen", d(1, 11), true, "Liste der Uni noch nicht veröffentlicht")],
    rueck: [rueck("SS 2027", d(15, 1, 2027), d(15, 2, 2027), { geschaetzt: true, hinweis: "Regelmäßige Frist fortgeschrieben", erledigt: true })],
  });
  const R = rechnen(D), html = lupe(D, R, R.sems[0]);
  assert.match(html, /<i class="raute ok"><\/i><b>Rückmeldung fürs SS 2027<\/b>: 15\.01\. – 15\.02\. \(geschätzt\)/);
  assert.match(html, /Frei 01\.11\. \(geschätzt\)/);
  assert.match(html, /<b>Allerheiligen 01\.11\.<\/b> \(geschätzt\): Liste der Uni noch nicht veröffentlicht/);
  assert.match(html, /<b>Rückmeldung fürs SS 2027<\/b> \(geschätzt\): Regelmäßige Frist fortgeschrieben/);
});
