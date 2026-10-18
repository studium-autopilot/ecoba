// Fachmodell (modell.js, ctx.modell): eine Regel je Begriff für alle Bildschirme – Datum und Text (ctx.modell.zeit), Termine,
// Prüfungen (pruefungVon, naechstePruefung), Fristen, Woche (kalenderwoche, planwoche), Stundenplan (findetStatt,
// naechsteSitzung), imPlan, ECTS, Noten, Statusfarben, Zwischentests. Semesterdaten: Schnappschuss der öffentlichen Daten
// (tests/daten/v1/semester.json), Notizen ausgedacht (Codes X100 …). Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { laden, json } = require("./laden.js");

const SEMESTER = json("semester.json");
const modell = (heute, notizen = {}, einstellungen = {}) => laden("modell", {
  heute, notizen, frontmatter: { "System/Daten/Semester.md": SEMESTER, "System/Einstellungen.md": einstellungen },
}).ctx.modell;

// ---------- Notizen ----------
const termin = (datum, titel, o) => ({ ["Termine/" + datum + " " + titel + ".md"]: Object.assign({ typ: "termin", titel, datum, status: "offiziell", erledigt: false }, o) });
const modul = (code, o) => ({ ["Module/1 Grundstudium/" + code + " Beispiel.md"]: Object.assign({ typ: "modul", code, titel: code + " Beispiel", gruppe: "Grundstudium", ects: 6, status: "offen" }, o) });
const alle = (...teile) => Object.assign({}, ...teile);

test("zeit: Datum wie in docs/design.md – Wochentag, Jahr nur außerhalb des Studienjahrs, Spannen, Abstand", () => {
  const Z = modell("2026-10-18").zeit;
  assert.equal(Z.heute(), "2026-10-18");
  assert.equal(Z.datum("2026-10-19"), "Mo 19.10.");
  assert.equal(Z.datum("2027-09-30"), "Do 30.09.", "letzter Tag des Studienjahrs ohne Jahr");
  assert.equal(Z.datum("2027-10-01"), "Fr 01.10.2027");
  assert.equal(Z.kurz("2028-02-06"), "06.02.2028");
  assert.equal(Z.datum("2026-10-15", { lang: true }), "Donnerstag, 15.10.");
  assert.equal(Z.datum(new Date(2026, 9, 20)), "Di 20.10.");
  assert.equal(Z.datum("kein Datum"), "");
  assert.equal(Z.spanne("2026-10-19", "2026-10-25"), "19.–25.10.");
  assert.equal(Z.spanne("2026-10-12", "2027-02-06"), "12.10. – 06.02.");
  assert.equal(Z.spanne("2027-09-28", "2027-10-06"), "28.09. – 06.10.2027");
  assert.equal(Z.spanne("2026-10-19", "2026-10-19"), "19.10.");
  assert.deepEqual(["2026-10-18", "2026-10-19", "2026-10-23", "2026-10-17", "2026-10-15"].map((d) => Z.abstand(d)), ["heute", "morgen", "in 5 Tagen", "gestern", "vor 3 Tagen"]);
  assert.equal(Z.tageBis("2026-10-25"), 7);
});

test("zeit und Ort: „bis 24:00 Uhr“ ist das Ende des Tages (Abgaben aus dem ILIAS-Kalender) und kommt nach 23:55", () => {
  const M = modell("2026-10-18", alle(
    termin("2026-11-03", "B110 Abgabe 3", { kategorie: "Frist", ort: "bis 24:00 Uhr · ILIAS" }),
    termin("2026-11-03", "S100 Abgabe 2", { kategorie: "Frist", ort: "bis 23:55 Uhr · ILIAS" })));
  assert.equal(M.zeit.uhrzeitIn("bis 24:00 Uhr · ILIAS"), "24:00");
  assert.ok(M.zeit.minuten("24:00") > M.zeit.minuten("23:59"));
  assert.deepEqual(M.ortTeilen("bis 24:00 Uhr · ILIAS"), { ab: "", bis: "24:00", schluss: true, zeit: "", wo: "ILIAS" });
  assert.equal(M.zeit.uhrzeitIn("ab 25:00"), "", "nach 24:00 keine Uhrzeit");
  assert.equal(M.zeit.uhrzeitIn("24:30"), "");
  assert.deepEqual(M.fristen({ heute: "2026-10-18" }).map((t) => [t.titel, t.zeit]), [["S100 Abgabe 2", "23:55"], ["B110 Abgabe 3", "24:00"]]);
});

test("zeit: Uhrzeit, Kalenderwoche, Mehrzahl, HTML-Schutz", () => {
  const Z = modell("2026-10-18").zeit;
  assert.equal(Z.uhr("9:15"), "09:15");
  assert.equal(Z.minuten("9:15") < Z.minuten("12:15"), true);
  assert.equal(Z.uhrzeitIn("17:00–18:00 · online in ILIAS"), "17:00–18:00");
  assert.equal(Z.uhrzeitIn("Mo 12:15–14:00 · HS N06"), "12:15–14:00");
  assert.equal(Z.uhrzeitIn("Belegung in Alma bis 18.10."), "", "ein Datum ist keine Uhrzeit");
  assert.equal(Z.kw("2026-10-18"), 42);
  assert.equal(Z.kw("2026-12-28"), 53);
  assert.equal(Z.montag("2026-10-18"), "2026-10-12");
  assert.deepEqual([Z.plural(1, "Tag", "Tage"), Z.plural(0, "Tag", "Tage"), Z.plural(3, "Modul", "Module")], ["1 Tag", "0 Tage", "3 Module"]);
  assert.equal(Z.esc(`<a href="x">&'`), "&lt;a href=&quot;x&quot;&gt;&amp;&#39;");
});

test("zeit.jahrRaten: höchstens 60 Tage zurück, sonst das nächste Jahr; Ende eines Zeitraums nach seinem Beginn", () => {
  const Z = modell("2026-10-18").zeit;
  assert.equal(Z.jahrRaten(1, 10), "2026-10-01", "17 Tage zurück: dieses Jahr");
  assert.equal(Z.jahrRaten(5, 8), "2027-08-05", "74 Tage zurück: nächstes Jahr");
  assert.equal(Z.jahrRaten(15, 3), "2027-03-15");
  assert.equal(Z.jahrRaten(5, 1, { bezug: "2026-12-18" }), "2027-01-05");
  assert.equal(Z.jahrRaten(20, 12, { bezug: "2027-01-05" }), "2026-12-20", "kurz nach Neujahr: Dezember davor");
  assert.equal(Z.jahrRaten(7, 1, { ab: "2026-12-28" }), "2027-01-07");
  assert.equal(Z.jahrRaten(31, 2), "");
});

test("Zwischentest: im Titel oder Dateinamen, auch „Zwischen-Test“; Nachholtermin", () => {
  const M = modell("2026-10-18");
  assert.equal(M.istZwischentest("Zwischentest 1 S100 Mathe"), true);
  assert.equal(M.istZwischentest("2. Zwischen-Test X100"), true);
  assert.equal(M.istZwischentest({ f: { basename: "2026-11-13 Zwischentest X100" }, fm: { titel: "Test X100" } }), true);
  assert.equal(M.istZwischentest({ fm: { titel: "Klausur X100" } }), false);
  assert.equal(M.istNachhol({ fm: { titel: "Nachholklausur X100" } }), true);
});

test("Termine: Uhrzeit als Zahl sortiert (9:15 vor 12:15), eigenes Feld uhrzeit, Ort ohne Uhrzeit, Entfallenes zählt nicht", () => {
  const M = modell("2026-10-18", alle(
    termin("2026-10-20", "Spät", { kategorie: "Lehre", ort: "12:15–13:45 · Hörsaal 1" }),
    termin("2026-10-20", "Früh", { kategorie: "Lehre", ort: "9:15–10:45 · Hörsaal 2" }),
    termin("2026-10-20", "Ganztägig", { kategorie: "Lehre" }),
    termin("2026-10-21", "Mit Feld", { kategorie: "Lehre", uhrzeit: "14:00–16:00", ort: "Hörsaal 3" }),
    termin("2026-10-22", "Abgesagt (entfällt)", { kategorie: "Fachschaft", entfaellt: true }),
  ));
  const t = M.termine();
  assert.deepEqual(t.map((x) => x.titel), ["Ganztägig", "Früh", "Spät", "Mit Feld"]);
  assert.deepEqual([t[1].zeit, t[1].wo], ["9:15–10:45", "Hörsaal 2"]);
  assert.deepEqual([t[3].zeit, t[3].wo], ["14:00–16:00", "Hörsaal 3"]);
  assert.equal(M.termine({ alle: true }).length, 5);
});

test("Frist der Orientierungsprüfung nur für den passenden Jahrgang (Ende des 4. Fachsemesters)", () => {
  const op = termin("2028-09-30", "Orientierungsprüfung: Frist", { kategorie: "Frist", herkunft: "zentral" });
  assert.equal(modell("2026-10-18", op).opFrist(), "2028-09-30");
  assert.equal(modell("2026-10-18", op).fristen().length, 1, "Beginn WS 2026/27");
  const ss = modell("2026-10-18", op, { studienbeginn: "2027-04-01" });
  assert.equal(ss.opFrist(), "2029-03-31");
  assert.equal(ss.fristen().length, 0, "Beginn SS 2027: 30.09.2028 gilt nicht");
  assert.equal(ss.ects().opFrist, "2029-03-31");
});

const PRUEFUNGEN = alle(
  modul("X100", { klausur: "2027-02-06" }),
  termin("2027-02-06", "Klausur X100", { kategorie: "Prüfung", code: "X100", ort: "10:00–11:30" }),
  termin("2027-02-06", "Zwischentest 3 X100", { kategorie: "Prüfung", code: "X100" }),
  termin("2026-11-13", "Zwischentest 1 X100", { kategorie: "Prüfung", code: "X100" }),
  termin("2027-01-29", "Klausurphase", { kategorie: "Prüfung", bis: "2027-02-13" }),
  termin("2027-04-01", "Nachholklausur X100", { kategorie: "Prüfung", code: "X100" }),
  modul("X200", { status: "anerkannt" }),
  termin("2027-01-30", "Klausur X200", { kategorie: "Prüfung", code: "X200" }),
  modul("X300"),
  termin("2027-02-10", "Klausur X300 (entfällt)", { kategorie: "Prüfung", code: "X300", entfaellt: true }),
  modul("X400", { klausur: "2027-02-12" }),
);

test("Prüfungen: Kürzel + Tag einmal (Notiz gewinnt), Zwischentest verdeckt keine Klausur, ohne Phasen und Entfallenes", () => {
  const P = modell("2026-10-18", PRUEFUNGEN).pruefungen();
  assert.deepEqual(P.map((p) => `${p.datum} ${p.code} ${p.quelle}${p.zwischentest ? " zt" : ""}`), [
    "2026-11-13 X100 termin zt", "2027-01-30 X200 termin", "2027-02-06 X100 termin zt", "2027-02-06 X100 termin", "2027-02-12 X400 modul", "2027-04-01 X100 termin",
  ]);
  const k = P.find((p) => p.code === "X100" && !p.zwischentest && p.datum === "2027-02-06");
  assert.deepEqual([k.zeit, k.titel, k.offen, k.modul.code], ["10:00–11:30", "Klausur X100", true, "X100"]);
  const x200 = P.find((p) => p.code === "X200");
  assert.deepEqual([x200.fertig, x200.erledigt, x200.offen], [true, true, false], "Modulstatus gilt auch für die Termin-Notiz");
  assert.equal(P.find((p) => p.code === "X400").titel, "X400 · X400 Beispiel");
});

test("Nächste Prüfung und pruefungVon: Modulstatus, erledigt, entfällt, Nachholtermin nur nach „nicht bestanden“", () => {
  const M = modell("2026-10-18", PRUEFUNGEN);
  assert.equal(M.naechstePruefung().code, "X100", "X200 ist anerkannt (Fehler 6)");
  assert.equal(M.pruefungVon("X200"), null, "anerkannt: kommende Klausur ist keine mehr");
  assert.equal(M.pruefungVon("X300"), null, "entfallen (Fehler 4)");
  assert.equal(M.pruefungVon("X100").datum, "2027-02-06");
  assert.equal(M.pruefungVon("X400").quelle, "modul");
  // Haken an der Klausur-Notiz (Fehler 5): keine nächste Prüfung mehr, das Datum bleibt als erledigt
  const erledigt = Object.assign({}, PRUEFUNGEN, termin("2027-02-06", "Klausur X100", { kategorie: "Prüfung", code: "X100", ort: "10:00–11:30", erledigt: true }));
  const E = modell("2026-10-18", erledigt);
  const p = E.pruefungVon("X100");
  assert.deepEqual([p.datum, p.erledigt, p.offen], ["2027-02-06", true, false]);
  assert.equal(E.naechstePruefung().code, "X400");
  // Nach „nicht bestanden“ zählt der Nachholtermin
  const nb = Object.assign({}, PRUEFUNGEN, modul("X100", { klausur: "2027-02-06", status: "nicht bestanden" }));
  assert.equal(modell("2027-02-20", nb).pruefungVon("X100").datum, "2027-04-01");
  assert.equal(modell("2027-02-20", PRUEFUNGEN).pruefungVon("X100").datum, "2027-02-06", "sonst die letzte geschriebene");
});

test("Fristen: offen, laufend oder kommend, nach dem nächsten Stichtag (läuft: Ende, sonst Beginn)", () => {
  const M = modell("2026-10-18", alle(
    termin("2026-10-12", "Belegung läuft", { kategorie: "Frist", bis: "2026-10-25" }),
    termin("2026-10-18", "Heute", { kategorie: "Frist" }),
    termin("2026-12-07", "Prüfungsanmeldung", { kategorie: "Frist", bis: "2026-12-21" }),
    termin("2026-10-19", "Morgen", { kategorie: "Frist", status: "geschätzt" }),
    termin("2026-10-16", "Abgehakt", { kategorie: "Frist", erledigt: true }),
    termin("2026-10-10", "Vorbei", { kategorie: "Frist" }),
  ));
  const F = M.fristen();
  assert.deepEqual(F.map((f) => f.titel), ["Heute", "Morgen", "Belegung läuft", "Prüfungsanmeldung"]);
  assert.deepEqual([F[2].laeuft, F[2].stichtag], [true, "2026-10-25"]);
  assert.equal(F[1].geschaetzt, true);
  assert.deepEqual(M.fristen({ tage: 30 }).map((f) => f.titel), ["Heute", "Morgen", "Belegung läuft"]);
});

test("Abgaben: offene Übungsblätter mit Fälligkeit, überfällige bleiben bis zur Abgabe", () => {
  const M = modell("2026-10-18", {
    "Übungsblätter/X100 Blatt 01.md": { typ: "übungsblatt", code: "X100", nummer: 1, faellig: "2026-10-16", status: "offen" },
    "Übungsblätter/X100 Blatt 02.md": { typ: "übungsblatt", code: "X100", nummer: 2, faellig: "2026-10-23", status: "in Arbeit" },
    "Übungsblätter/X100 Blatt 03.md": { typ: "übungsblatt", code: "X100", nummer: 3, faellig: "2026-10-20", status: "abgegeben" },
  });
  assert.deepEqual(M.abgaben().map((a) => `${a.nummer} ${a.ueberfaellig}`), ["1 true", "2 false"]);
});

test("Woche: eine Wochenend-Regel – am Samstag und Sonntag ist „diese Woche“ schon die kommende (Fehler 10)", () => {
  const M = modell("2026-10-18"); // Sonntag
  assert.deepEqual([M.kalenderwoche().mo, M.kalenderwoche().kw], ["2026-10-12", 42]);
  const p = M.planwoche();
  assert.deepEqual([p.mo, p.fr, p.so, p.kw, p.vorgezogen], ["2026-10-19", "2026-10-23", "2026-10-25", 43, true]);
  assert.equal(M.planwoche("2026-10-23").mo, "2026-10-19", "Freitag: die laufende");
  assert.equal(M.planwoche("2026-10-24").mo, "2026-10-26", "Samstag: die kommende");
  assert.equal(M.woche().text, "Vorlesungswoche 2 von 16", "Sonntag zählt die kommende Vorlesungswoche");
  assert.equal(modell("2026-10-16").woche().text, "Vorlesungswoche 1 von 16");
  assert.equal(modell("2026-10-11").woche().text, "Vorlesungsbeginn morgen", "Tagesangaben bleiben am Tag");
});

const serie = (o) => Object.assign({ typ: "lehrveranstaltung", code: "X100", wochentag: 4, beginn: "10:15", ende: "11:45", von: "2027-04-15", bis: "2027-07-22", raum: "Hörsaal 1", semester: "SS 2027" }, o);

test("findetStatt: freie Tage (Christi Himmelfahrt), Pausen, Ausfall, Änderungen, Einzeltermin, Besuche ich nicht (Fehler 8)", () => {
  const M = modell("2027-04-20", {}, { stundenplan_ausgeblendet: ["ss-2027-x100"] });
  assert.equal(M.findetStatt(serie(), "2027-04-22").statt, true);
  assert.deepEqual([M.findetStatt(serie(), "2027-05-06").grund, M.findetStatt(serie(), "2027-05-06").name], ["frei", "Christi Himmelfahrt"]);
  assert.deepEqual([M.findetStatt(serie({ wochentag: 3 }), "2027-05-19").grund, M.findetStatt(serie({ wochentag: 3 }), "2027-05-19").name], ["pause", "Pfingstferien"]);
  assert.equal(M.findetStatt(serie({ ausfall: ["2027-04-29"] }), "2027-04-29").grund, "ausfall");
  const g = M.findetStatt(serie({ aenderungen: ["2027-04-29|14:00|16:00|Raum 5"] }), "2027-04-29");
  assert.deepEqual([g.statt, g.beginn, g.ende, g.raum, g.geaendert], [true, "14:00", "16:00", "Raum 5", true]);
  assert.equal(M.findetStatt(serie(), "2027-04-21").grund, "anderer Tag");
  assert.equal(M.findetStatt(serie(), "2027-07-29").grund, "ausserhalb");
  assert.equal(M.findetStatt(serie({ einzeltermin: true, wochentag: 2, von: "2027-04-27", bis: "2027-04-27" }), "2027-04-27").statt, true);
  assert.equal(M.findetStatt(serie({ entfaellt: true }), "2027-04-22").grund, "entfaellt");
  assert.equal(M.findetStatt(serie({ herkunft: "zentral", zentral_id: "ss-2027-x100" }), "2027-04-22").grund, "ausgeblendet");
});

test("naechsteSitzung: überspringt freie Tage und Pausen, heute nur bis zum Ende", () => {
  const M = modell("2027-05-03");
  assert.equal(M.naechsteSitzung(serie(), new Date("2027-05-03T12:00:00")).datum, "2027-05-13", "Do 6.5. Christi Himmelfahrt");
  assert.equal(M.naechsteSitzung(serie(), new Date("2027-04-22T11:00:00")).datum, "2027-04-22");
  assert.equal(M.naechsteSitzung(serie(), new Date("2027-04-22T12:00:00")).datum, "2027-04-29");
  assert.equal(M.naechsteSitzung(serie({ bis: "2027-04-22" }), new Date("2027-04-23T12:00:00")), null);
});

test("imPlan: Grundstudium, Pflicht der Variante, gewählt, geplant, begonnen; nie Zusatz", () => {
  const eco = modell("2026-10-18", {}, { variante: "Economics" });
  const offen = modell("2026-10-18");
  const pv = (o) => Object.assign({ gruppe: "Profil & Vertiefung", rolle_economics: "Elective Studies", rolle_ba: "Pflicht", rolle_ohne: "Pflicht" }, o);
  assert.equal(eco.imPlan({ gruppe: "Grundstudium" }), true);
  assert.equal(eco.imPlan(pv()), false, "Elective Studies in Economics");
  assert.equal(modell("2026-10-18", {}, { variante: "Business Administration" }).imPlan(pv()), true);
  assert.equal(offen.imPlan(pv()), false, "Variante offen: nur Pflicht in allen");
  assert.equal(offen.imPlan(pv({ rolle_economics: "Pflicht" })), true);
  assert.equal(eco.imPlan(pv({ gewaehlt: true })), true);
  assert.equal(eco.imPlan(pv({ semester_geplant: "SS 2027" })), true);
  assert.equal(eco.imPlan(pv({ status: "läuft" })), true);
  assert.equal(eco.imPlan({ gruppe: "Schwerpunkt" }), false);
  assert.equal(eco.imPlan({ gruppe: "Grundstudium", zusatz: true }), false);
});

test("ECTS und Orientierungsprüfung: bestanden und anerkannt ohne Zusatz, SQ-Kurse höchstens 9 solange SQ100 offen", () => {
  const notizen = alle(
    modul("X100", { status: "bestanden", ects: 6, op_modul: true }), modul("X110", { status: "Anerkannt", ects: "7,5", op_modul: true }),
    modul("X120", { status: "bestanden", ects: 6, zusatz: true }), modul("X130", { status: "läuft", ects: 6, op_modul: true }),
    modul("SQ100", { ects: 12 }),
    { "Schlüsselqualifikationen/A.md": { typ: "sq_kurs", status: "bestanden", ects: 6 } }, { "Schlüsselqualifikationen/B.md": { typ: "sq_kurs", status: "bestanden", ects: 4 } },
  );
  const E = modell("2026-10-18", notizen).ects();
  assert.deepEqual([E.ist, E.sqTeil, E.zusatz, E.op, E.gesamt], [22.5, 9, 6, 2, 180]);
  const fertig = Object.assign({}, notizen, modul("SQ100", { ects: 12, status: "bestanden" }));
  assert.equal(modell("2026-10-18", fertig).ects().ist, 25.5, "SQ100 bestanden: zählt als Modul, Kurse nicht mehr extra");
});

test("Noten: 66 %- und 34 %-Block nach ECTS, abgeschnitten; Elective Studies zählt 66 %; ungültige Noten", () => {
  const n = (code, o) => modul(code, Object.assign({ status: "bestanden", notenblock: "34 %" }, o));
  const M = modell("2026-10-18", alle(
    n("X100", { ergebnis: "1,7", ects: 6 }), n("X110", { ergebnis: "2.3", ects: 6 }),
    n("X300", { ergebnis: "1,3", ects: 9, notenblock: "66 %" }),
    n("X400", { ergebnis: "2,0", ects: 6, gruppe: "Profil & Vertiefung", rolle_economics: "Elective Studies" }),
    n("X500", { ergebnis: "bestanden", ects: 3 }), n("X600", { ergebnis: "–", notenblock: "–", ects: 3 }),
  ), { variante: "Economics" });
  const N = M.noten();
  assert.equal(N.w34, 12);
  assert.equal(N.w66, 15);
  assert.equal(N.note, "1,72"); // 0,66 · 1,58 + 0,34 · 2,0 = 1,7228 → abgeschnitten
  assert.equal(N.unter, "Note ungültig: X500");
  assert.equal(modell("2026-10-18").noten().note, "–");
  assert.equal(modell("2026-10-18").noten().unter, "noch keine Noten eingetragen");
});

test("statusArt: eine Farbe je Zustand (docs/design.md), „angemeldet“ grün, „neu“ neutral", () => {
  const M = modell("2026-10-18");
  assert.deepEqual(["offen", "läuft", "angemeldet", "bestanden", "nicht bestanden", "anerkannt"].map((s) => M.statusArt("modul", s)),
    ["leer", "info", "ok", "ok", "bad", "ok"]);
  assert.deepEqual(["Prüfung", "Frist", "Fachschaft", "Veranstaltung", "Lehre", "Zwischentest 1 X100"].map((s) => M.statusArt("termin", s)),
    ["bad", "warn", "akzent", "akzent", "info", "info"]);
  assert.deepEqual(["neu", "gelesen", "in Arbeit", "überfällig", "geschätzt"].map((s) => M.statusArt(s)), ["leer", "ok", "warn", "bad", "leer"]);
});

test("Tabellen: Datum ohne Jahr im Studienjahr, „heute“ zur Zeit des Zeichnens (Fehler 18); Chip-Farbe aus statusArt", () => {
  const T = laden("tabellen", { kontext: { modell: modell("2026-12-30") } }).ergebnis;
  assert.equal(T.datumText("2027-02-06"), "06.02.", "nach Neujahr im selben Studienjahr kein Jahr");
  assert.equal(T.datumText("2027-10-06"), "06.10.2027");
  assert.deepEqual(["angemeldet", "neu", "überfällig"].map(T.chipArt), ["ok", "leer", "bad"]);
});

test("Neuer Termin: „Zwischentest“ im Titel wird eine Prüfung (Fehler 19), Jahr nach jahrRaten, Feld uhrzeit", async () => {
  const M = modell("2026-10-18");
  const E = laden("eba", { heute: "2026-10-18", kontext: { modell: M } }).ergebnis;
  const angelegt = [];
  const eba = Object.assign({}, E, { ablegen: async (ordner, name, inhalt) => { angelegt.push({ name, inhalt }); return { path: ordner + "/" + name + ".md" }; } });
  const N = laden("notizen", { heute: "2026-10-18", kontext: { modell: M, user: { eba: () => eba } } }).ergebnis;
  await N.aktionen.termin.ausfuehren({ parameter: { titel: "Zwischentest 2 X100", wann: "04.12." }, datei: null });
  await N.aktionen.termin.ausfuehren({ parameter: { titel: "Lerngruppe", wann: "05.08." }, datei: null });
  assert.equal(angelegt[0].name, "2026-12-04 Zwischentest 2 X100");
  assert.match(angelegt[0].inhalt, /^kategorie: Prüfung$/m);
  assert.match(angelegt[0].inhalt, /^uhrzeit: ""$/m);
  assert.equal(angelegt[1].name, "2027-08-05 Lerngruppe", "mehr als 60 Tage zurück: nächstes Jahr");
});

test("Zentrale Daten: Frist der Orientierungsprüfung nur für den Jahrgang, zu dem ihr Datum passt (Fehler 7)", () => {
  const e = { kategorie: "Frist", titel: "Orientierungsprüfung: Frist", datum: "2028-09-30", code: "" };
  const filter = (einstellungen) => laden("zentral", { heute: "2026-10-18", kontext: { modell: modell("2026-10-18", {}, einstellungen) } }).ctx.zentral.filterBauen();
  assert.equal(filter({}).aufnehmen(e), true, "Beginn WS 2026/27");
  assert.equal(filter({ studienbeginn: "2027-04-01" }).aufnehmen(e), false, "Beginn SS 2027: Frist wäre 31.03.2029");
  assert.equal(filter({ studienbeginn: "2027-04-01" }).aufnehmen(Object.assign({}, e, { titel: "Belegfrist Kolloquium" })), true, "andere Fristen bleiben");
});
