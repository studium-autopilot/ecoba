// Modulfeld auf Modulseiten (modul.js, Codeblock eba-modul): nächste Sitzung einer Stundenplan-Serie, Regel „Nächste Prüfung“,
// „Als Nächstes“, Semesterband, Note, Statusfarbe, Titel ohne Kürzel, Zeitraum. Nur ausgedachte Daten (Codes X100 …).
// Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { laden } = require("./laden.js");

const M = laden("modul").ergebnis;
const tag = (s, uhr = "12:00") => new Date(`${s}T${uhr}:00`);
const ist = (d) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : null);
const serie = (o) => Object.assign({ typ: "lehrveranstaltung", code: "X100", wochentag: 1, beginn: "10:00", ende: "12:00", von: "2026-10-12", bis: "2027-02-05", raum: "Hörsaal 1" }, o);

test("Sitzung: nächster passender Wochentag, heute nur bis zum Ende, von/bis begrenzen", () => {
  // Donnerstag 15.10. → Montag 19.10.
  assert.equal(ist(M.sitzung(serie(), tag("2026-10-15"), []).d), "2026-10-19");
  // Montag 19.10. um 11:00 läuft sie noch, um 12:30 ist sie vorbei
  assert.equal(ist(M.sitzung(serie(), tag("2026-10-19", "11:00"), []).d), "2026-10-19");
  assert.equal(ist(M.sitzung(serie(), tag("2026-10-19", "12:30"), []).d), "2026-10-26");
  // vor dem ersten Termin: erst ab „von“
  assert.equal(ist(M.sitzung(serie({ von: "2026-11-02" }), tag("2026-10-15"), []).d), "2026-11-02");
  // nach „bis“: keine
  assert.equal(M.sitzung(serie({ bis: "2026-10-18" }), tag("2026-10-15"), []), null);
  assert.equal(M.sitzung(serie({ entfaellt: true }), tag("2026-10-15"), []), null);
});

test("Sitzung: Ausfall und Pausen überspringen, Änderungen gelten an ihrem Tag, Einzeltermin nur an seinem Datum", () => {
  assert.equal(ist(M.sitzung(serie({ ausfall: ["2026-10-19"] }), tag("2026-10-15"), []).d), "2026-10-26");
  const pause = [{ von: tag("2026-12-23", "00:00"), bis: tag("2027-01-06", "00:00") }];
  assert.equal(ist(M.sitzung(serie(), tag("2026-12-22"), pause).d), "2027-01-11");
  const g = M.sitzung(serie({ aenderungen: ["2026-10-19|14:00|16:00|Raum 5"] }), tag("2026-10-15"), []);
  assert.deepEqual([g.beginn, g.ende, g.raum, g.geaendert], ["14:00", "16:00", "Raum 5", true]);
  const e = serie({ einzeltermin: true, wochentag: 3, von: "2026-10-21", bis: "2026-10-21" });
  assert.equal(ist(M.sitzung(e, tag("2026-10-15"), []).d), "2026-10-21");
  assert.equal(M.sitzung(e, tag("2026-10-22"), []), null);
});

const termin = (name, o) => ({ f: { basename: name, path: `Termine/${name}.md` }, fm: Object.assign({ typ: "termin", code: "X100", kategorie: "Prüfung", status: "offiziell" }, o) });

test("Nächste Prüfung: Termin-Notiz mit Kürzel, ohne Zwischentest, Nachholtermin und Zeitraum; sonst Feld klausur", () => {
  const termine = [
    termin("2027-02-06 Klausur X100", { titel: "Klausur X100", datum: "2027-02-06", ort: "10:00–11:30" }),
    termin("2026-12-01 Zwischentest X100", { titel: "Zwischentest X100", datum: "2026-12-01" }),
    termin("2027-04-01 Nachholklausur X100", { titel: "Nachholklausur X100", datum: "2027-04-01" }),
    termin("2027-01-10 Prüfungsphase", { titel: "Prüfungsphase", datum: "2027-01-10", bis: "2027-02-20" }),
    termin("2027-01-20 Klausur X200", { titel: "Klausur X200", code: "X200", datum: "2027-01-20" }),
  ];
  const p = M.pruefungVon({ code: "X100", fm: {}, termine, heute: tag("2026-10-15") });
  assert.equal(ist(p.d), "2027-02-06");
  assert.equal(p.zeit, "10:00–11:30");
  assert.equal(p.f.basename, "2027-02-06 Klausur X100");
  // vorbei: die letzte bleibt stehen
  assert.equal(ist(M.pruefungVon({ code: "X100", fm: {}, termine, heute: tag("2027-03-01") }).d), "2027-02-06");
  // ohne Notiz: Feld klausur
  assert.equal(ist(M.pruefungVon({ code: "X100", fm: { klausur: "2027-02-10" }, termine: [], heute: tag("2026-10-15") }).d), "2027-02-10");
  assert.equal(M.pruefungVon({ code: "X100", fm: {}, termine: [], heute: tag("2026-10-15") }), null);
});

test("Als Nächstes: Sitzungen und Termine nach Tag und Uhrzeit, ohne Erledigtes, höchstens drei, Kürzel aus dem Titel", () => {
  const stundenplan = [{ f: { basename: "Mo 10.00 X100" }, fm: serie() }, { f: { basename: "Mo 14.00 X100" }, fm: serie({ beginn: "14:00", ende: "16:00" }) }];
  const termine = [
    termin("2026-10-19 Anmeldung X100", { titel: "Tutorien-Anmeldung X100 (ILIAS)", kategorie: "Anmeldung", datum: "2026-10-19", bis: "2026-10-25", ort: "bis 25.10. · ILIAS-Kurs" }),
    termin("2026-10-16 Erledigt X100", { titel: "Erledigt", kategorie: "Frist", datum: "2026-10-16", erledigt: true }),
    termin("2027-02-06 Klausur X100", { titel: "Klausur X100", datum: "2027-02-06", ort: "10:00–11:30" }),
  ];
  const n = M.naechstes({ code: "X100", stundenplan, termine, pausen: [], jetzt: tag("2026-10-15") });
  assert.deepEqual(n.map((x) => [ist(x.d), x.zeit, x.was, x.art]), [
    ["2026-10-19", "", "Tutorien-Anmeldung (ILIAS)", "termin"],
    ["2026-10-19", "10:00–12:00", "Veranstaltung", "sitzung"],
    ["2026-10-19", "14:00–16:00", "Veranstaltung", "sitzung"],
  ]);
  assert.equal(n[0].wo, "ILIAS-Kurs");
  assert.equal(ist(n[0].bis), "2026-10-25");
  // läuft schon: Tag = heute, Prüfung erkannt
  const m = M.naechstes({ code: "X100", stundenplan: [], termine, pausen: [], jetzt: tag("2026-10-21"), max: 5 });
  assert.equal(ist(m[0].d), "2026-10-21");
  assert.equal(m[1].art, "pruefung");
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
  const b = M.band({ wochen, notizen, heute: tag("2026-10-21"), pruefung: tag("2026-11-04", "00:00") });
  assert.deepEqual(b.zellen.map((z) => [z.vorbei, z.jetzt, z.pause, z.stand, z.pruefung]), [
    [true, false, false, 2, false],
    [false, true, false, 1, false],
    [false, false, false, 0, false],
    [false, false, false, 0, true],
    [false, false, true, 0, false],
  ]);
  assert.deepEqual(b.monate.map((m) => [m.i, m.name]), [[0, "Okt"], [3, "Nov"]]);
  // Prüfung nach der Vorlesungszeit: eigene Zelle am Ende (Woche der Prüfung)
  const c = M.band({ wochen, notizen: [], heute: tag("2026-10-21"), pruefung: tag("2026-12-03", "00:00") });
  assert.equal(c.zellen.length, 6);
  assert.equal(c.zellen[5].nach, true);
  assert.equal(ist(c.zellen[5].mo), "2026-11-30");
  assert.deepEqual(c.monate.map((m) => m.name), ["Okt", "Nov"]);
});

test("Note, Statusfarbe, Titel ohne Kürzel, Zeitraum", () => {
  for (const n of ["1,0", "1,3", "1.7", "4,0", "5,0"]) assert.equal(M.noteOk(n), true, n);
  for (const n of ["0,7", "5,3", "6,0", "1", "1,33", "gut", ""]) assert.equal(M.noteOk(n), false, n);
  assert.deepEqual(["bestanden", "anerkannt", "nicht bestanden", "angemeldet", "läuft", "offen", ""].map(M.statusArt),
    ["ok", "ok", "bad", "warn", "info", "leer", "leer"]);
  assert.equal(M.titelOhne("Tutorien starten: X100 Kurz", "X100"), "Tutorien starten: Kurz");
  assert.equal(M.titelOhne("Klausur X100", "X100"), "Klausur");
  const h = tag("2026-10-15", "00:00");
  assert.equal(M.spanne(tag("2026-10-19", "00:00"), tag("2026-10-25", "00:00"), h), "19.–25.10.");
  assert.equal(M.spanne(tag("2026-10-28", "00:00"), tag("2026-11-03", "00:00"), h), "28.10.–03.11.");
  assert.equal(M.spanne(h, tag("2026-10-25", "00:00"), h), "bis So 25.10.");
});
