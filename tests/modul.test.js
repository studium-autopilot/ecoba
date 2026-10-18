// Modulfeld auf Modulseiten (modul.js, Codeblock eba-modul): „Als Nächstes“, Semesterband, Note, Titel ohne Kürzel, Zeitraum.
// Nächste Sitzung, Prüfung und Statusfarbe kommen aus dem Fachmodell (tests/fachmodell.test.js). Nur ausgedachte Daten
// (Codes X100 …). Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { laden, json } = require("./laden.js");

const SEMESTER = json("semester.json");
const modell = (heute, notizen = {}) => laden("modell", { heute, notizen, frontmatter: { "System/Daten/Semester.md": SEMESTER } }).ctx.modell;
const M = laden("modul", { kontext: { modell: modell("2026-10-15") } }).ergebnis;
const tag = (s, uhr = "12:00") => new Date(`${s}T${uhr}:00`);
const ist = (d) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : null);
const serie = (o) => Object.assign({ typ: "lehrveranstaltung", code: "X100", wochentag: 1, beginn: "10:00", ende: "12:00", von: "2026-10-12", bis: "2027-02-05", raum: "Hörsaal 1" }, o);

// Termin-Notizen wie ctx.modell.termine() sie liefert
const termin = (name, fm) => ({ ["Termine/" + name + ".md"]: Object.assign({ typ: "termin", code: "X100", kategorie: "Prüfung", status: "offiziell" }, fm) });
const termine = (heute, ...t) => { const D = modell(heute, Object.assign({}, ...t)); return { D, liste: D.termine() }; };

test("Als Nächstes: Sitzungen und Termine nach Tag und Uhrzeit, ohne Erledigtes, höchstens drei, Kürzel aus dem Titel", () => {
  const stundenplan = [{ f: { basename: "Mo 10.00 X100" }, fm: serie() }, { f: { basename: "Mo 14.00 X100" }, fm: serie({ beginn: "14:00", ende: "16:00" }) }];
  const T = [
    termin("2026-10-19 Anmeldung X100", { titel: "Tutorien-Anmeldung X100 (ILIAS)", kategorie: "Anmeldung", datum: "2026-10-19", bis: "2026-10-25", ort: "bis 25.10. · ILIAS-Kurs" }),
    termin("2026-10-16 Erledigt X100", { titel: "Erledigt", kategorie: "Frist", datum: "2026-10-16", erledigt: true }),
    termin("2027-02-06 Klausur X100", { titel: "Klausur X100", datum: "2027-02-06", ort: "10:00–11:30" }),
    termin("2026-10-20 Ausfall X100", { titel: "Vortrag X100 (entfällt)", kategorie: "Lehre", datum: "2026-10-20", entfaellt: true }),
  ];
  const { D, liste } = termine("2026-10-15", ...T);
  const n = M.naechstes({ M: D, code: "X100", stundenplan, termine: liste, jetzt: tag("2026-10-15") });
  assert.deepEqual(n.map((x) => [ist(x.d), x.zeit, x.was, x.art]), [
    ["2026-10-19", "", "Tutorien-Anmeldung (ILIAS)", "termin"],
    ["2026-10-19", "10:00–12:00", "Veranstaltung", "sitzung"],
    ["2026-10-19", "14:00–16:00", "Veranstaltung", "sitzung"],
  ]);
  assert.equal(n[0].wo, "ILIAS-Kurs");
  assert.equal(ist(n[0].bis), "2026-10-25");
  // läuft schon: Tag = heute, Prüfung erkannt
  const m = M.naechstes({ M: D, code: "X100", stundenplan: [], termine: liste, jetzt: tag("2026-10-21"), max: 5 });
  assert.equal(ist(m[0].d), "2026-10-21");
  assert.equal(m[1].art, "pruefung");
  // Christi Himmelfahrt (Do 6.5.2027) fällt aus: nächste Sitzung eine Woche später (Fehler 8)
  const tut = [{ f: { basename: "Do X100" }, fm: serie({ wochentag: 4, von: "2027-04-15", bis: "2027-07-22" }) }];
  assert.equal(ist(M.naechstes({ M: D, code: "X100", stundenplan: tut, termine: [], jetzt: tag("2027-05-04") })[0].d), "2027-05-13");
  // Modul anerkannt: seine Klausur steht nicht mehr unter „Als Nächstes“ (Fehler 6)
  const A = termine("2026-10-15", ...T, { "Module/X100 Beispiel.md": { typ: "modul", code: "X100", status: "anerkannt" } });
  assert.ok(!M.naechstes({ M: A.D, code: "X100", stundenplan: [], termine: A.liste, jetzt: tag("2026-10-21"), max: 5 }).some((x) => x.art === "pruefung"));
});

test("Semesterband: Wochen vorbei/jetzt/Pause, Notizen (offen/nachgearbeitet), Monate, Prüfung in oder nach der Vorlesungszeit", () => {
  const wochen = [
    { mo: "2026-10-12", nr: 1 }, { mo: "2026-10-19", nr: 2 }, { mo: "2026-10-26", nr: 3 },
    { mo: "2026-11-02", nr: 4 }, { mo: "2026-11-09", nr: 0, pause: true },
  ];
  const notizen = [
    { d: tag("2026-10-12", "00:00"), fertig: true },
    { d: tag("2026-10-19", "00:00"), fertig: true }, { d: tag("2026-10-21", "00:00"), fertig: false },
  ];
  const b = M.band({ wochen, notizen, woche: "2026-10-19", pruefung: tag("2026-11-04", "00:00") });
  assert.deepEqual(b.zellen.map((z) => [z.vorbei, z.jetzt, z.pause, z.stand, z.pruefung]), [
    [true, false, false, 2, false],
    [false, true, false, 1, false],
    [false, false, false, 0, false],
    [false, false, false, 0, true],
    [false, false, true, 0, false],
  ]);
  assert.deepEqual(b.monate.map((m) => [m.i, m.name]), [[0, "Okt"], [3, "Nov"]]);
  // Prüfung nach der Vorlesungszeit: eigene Zelle am Ende (Woche der Prüfung)
  const c = M.band({ wochen, notizen: [], woche: "2026-10-19", pruefung: tag("2026-12-03", "00:00") });
  assert.equal(c.zellen.length, 6);
  assert.equal(c.zellen[5].nach, true);
  assert.equal(ist(c.zellen[5].mo), "2026-11-30");
  assert.deepEqual(c.monate.map((m) => m.name), ["Okt", "Nov"]);
});

test("Semesterband am Sonntag: die kommende Woche ist „jetzt“ (Planwoche), die laufende schon vorbei", () => {
  const b = M.band({ wochen: [{ mo: "2026-10-12", nr: 1 }, { mo: "2026-10-19", nr: 2 }], notizen: [], woche: modell("2026-10-18").planwoche().mo });
  assert.deepEqual(b.zellen.map((z) => [z.vorbei, z.jetzt]), [[true, false], [false, true]]);
});

test("Note, Titel ohne Kürzel, Zeitraum", () => {
  for (const n of ["1,0", "1,3", "1.7", "4,0", "5,0"]) assert.equal(M.noteOk(n), true, n);
  for (const n of ["0,7", "5,3", "6,0", "1", "1,33", "gut", ""]) assert.equal(M.noteOk(n), false, n);
  assert.equal(M.titelOhne("Tutorien starten: X100 Kurz", "X100"), "Tutorien starten: Kurz");
  assert.equal(M.titelOhne("Klausur X100", "X100"), "Klausur");
  const h = tag("2026-10-15", "00:00");
  assert.equal(M.spanne(tag("2026-10-19", "00:00"), tag("2026-10-25", "00:00"), h), "19.–25.10.");
  assert.equal(M.spanne(tag("2026-10-28", "00:00"), tag("2026-11-03", "00:00"), h), "28.10. – 03.11.");
  assert.equal(M.spanne(h, tag("2026-10-25", "00:00"), h), "bis So 25.10.");
});
