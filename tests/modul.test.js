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
    ["2026-10-19", "10:00–12:00", "Vorlesung", "sitzung"],
    ["2026-10-19", "14:00–16:00", "Vorlesung", "sitzung"],
  ]);
  // Art wie im Wochenraster: ohne Art oder „Veranstaltung“ (Alma ohne erkannte Art) eine Vorlesung, sonst die Art der Notiz
  const arten = [serie({ art: "Veranstaltung" }), serie({ art: "Tutorium", beginn: "14:00", ende: "16:00" })].map((fm) => ({ f: { basename: "X" }, fm }));
  assert.deepEqual(M.naechstes({ M: D, code: "X100", stundenplan: arten, termine: [], jetzt: tag("2026-10-15") }).map((x) => x.was), ["Vorlesung", "Tutorium"]);
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

test("Als Nächstes: Ausfall der nächsten 14 Tage mit „fällt aus“, Änderung mit kurzem Text und dem üblichen Wert (20.10.2026)", () => {
  const D = modell("2026-10-15");
  const mit = (fm) => M.naechstes({ M: D, code: "X100", stundenplan: [{ f: { basename: "Mo X100" }, fm: serie(fm) }], termine: [], jetzt: tag("2026-10-15"), max: 5 });
  // Mo 19.10. fällt aus: erst der Ausfall, dann die nächste Sitzung (vorher stand nur diese da, der Ausfall fehlte)
  const a = mit({ ausfall: ["2026-10-19"] });
  assert.deepEqual(a.map((x) => [ist(x.d), x.ausfall, x.marke, x.zeit]), [["2026-10-19", true, "fällt aus", "10:00–12:00"], ["2026-10-26", false, "", "10:00–12:00"]]);
  // Ausfall nach 14 Tagen oder wegen einer Pause: kein Eintrag
  assert.equal(mit({ ausfall: ["2026-11-02"] }).filter((x) => x.ausfall).length, 0);
  assert.equal(M.naechstes({ M: modell("2026-12-21"), code: "X100", stundenplan: [{ fm: serie({ wochentag: 3, ausfall: ["2026-12-23"] }) }], termine: [], jetzt: tag("2026-12-21") })
    .filter((x) => x.ausfall).length, 0, "Weihnachtspause");
  const r = mit({ aenderungen: ["2026-10-19|10:00|12:00|Hörsaal 21"] })[0];
  assert.deepEqual([r.marke, r.wo, r.raumNeu, r.raumAlt, r.zeitNeu, r.zeitAlt], ["anderer Raum", "Hörsaal 21", true, "Hörsaal 1", false, ""]);
  const z = mit({ aenderungen: ["2026-10-19|14:00|16:00|Hörsaal 1"] })[0];
  assert.deepEqual([z.marke, z.zeit, z.zeitAlt, z.raumNeu], ["andere Zeit", "14:00–16:00", "10:00–12:00", false]);
  const v = mit({ raum: "Hörsaal 21", raum_vorher: "Hörsaal 1", raum_seit: "2026-10-19" })[0];
  assert.deepEqual([v.marke, v.wo, v.raumAlt], ["neuer Raum", "Hörsaal 21", "Hörsaal 1"]);
  assert.equal(mit({})[0].marke, "");
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

// Ersatz für Obsidians Elemente, Menü und Fenster (wie tests/vorlesungen.test.js), dazu die Lage des Ankers fürs Menü
const knoten = (tag, o = {}) => {
  const k = { tag, o, cls: String(o.cls || "").split(" ").filter(Boolean), text: o.text || "", kinder: [], an: {} };
  k.createEl = (t, p) => { const c = knoten(t, p); k.kinder.push(c); return c; };
  k.createDiv = (p) => k.createEl("div", p);
  k.createSpan = (p) => k.createEl("span", p);
  k.empty = () => { k.kinder = []; };
  k.setText = (t) => { k.text = t; };
  k.addClass = (c) => { k.cls.push(c); };
  k.toggleClass = () => {};
  k.setAttr = () => {};
  k.addEventListener = (e, f) => { k.an[e] = f; };
  k.getBoundingClientRect = () => ({ left: 0, bottom: 0 });
  k.alle = () => k.kinder.flatMap((c) => [c, ...c.alle()]);
  return k;
};
const klick = (k) => k.an.click({ preventDefault() {}, stopPropagation() {} });

test("Status bestanden ⇄ nicht bestanden: Eine Note, die nicht passt, fällt weg, und das Fenster fragt neu (24.10.2026)", async () => {
  assert.equal(M.notePasst("bestanden", "1,7"), true);
  assert.equal(M.notePasst("bestanden", "5,0"), false);
  assert.equal(M.notePasst("nicht bestanden", "5,0"), true);
  assert.equal(M.notePasst("nicht bestanden", "1.7"), false);
  assert.equal(M.notePasst("läuft", "5,0"), true, "andere Status lassen die Note stehen");
  assert.equal(M.notePasst("bestanden", ""), true);
  const statusWaehlen = async (fm, neu) => {
    const pfad = "Module/1 Grundstudium/X100 Beispiel.md";
    const notizen = { [pfad]: Object.assign({ typ: "modul", code: "X100", titel: "Beispiel", benotet: true }, fm) };
    const menues = [], fenster = [], geschrieben = [];
    class Menu { constructor() { this.punkte = []; menues.push(this); } addItem(f) { const p = {}; f({ setTitle: (t) => { p.titel = t; }, setChecked() {}, setIcon() {}, onClick: (g) => { p.tun = g; } }); this.punkte.push(p); } addSeparator() {} showAtPosition() {} }
    class Modal { constructor() { this.contentEl = knoten("div"); } open() { fenster.push(this); this.onOpen(); } close() {} }
    const L = laden("modul", { heute: "2026-10-15", notizen, kontext: { modell: modell("2026-10-15", notizen), obsidian: { Menu, Modal } } });
    L.ctx.app.fileManager = { processFrontMatter: async (f, fn) => { const m = {}; fn(m); geschrieben.push(m); } };
    const el = knoten("div");
    L.ergebnis.zeichnen(el, { sourcePath: pfad });
    klick(el.alle().find((k) => k.cls.includes("eba-mod-status")));
    await menues[0].punkte.find((p) => p.titel === neu).tun();
    return { geschrieben, fenster: fenster.map((x) => x.contentEl.alle().find((k) => k.tag === "input").o.value) };
  };
  assert.deepEqual(await statusWaehlen({ status: "nicht bestanden", ergebnis: "5,0" }, "Bestanden"),
    { geschrieben: [{ status: "bestanden", ergebnis: "" }], fenster: [""] }, "Wiederholung bestanden: 5,0 fällt weg");
  assert.deepEqual(await statusWaehlen({ status: "bestanden", ergebnis: "1,7" }, "Nicht bestanden"),
    { geschrieben: [{ status: "nicht bestanden", ergebnis: "" }], fenster: [""] });
  assert.deepEqual(await statusWaehlen({ status: "läuft", ergebnis: "2,3" }, "Bestanden"), { geschrieben: [{ status: "bestanden" }], fenster: [] },
    "passende Note bleibt, kein Fenster");
  assert.deepEqual(await statusWaehlen({ status: "läuft" }, "Bestanden"), { geschrieben: [{ status: "bestanden" }], fenster: [""] }, "ohne Note: Fenster wie bisher");
  assert.deepEqual(await statusWaehlen({ status: "bestanden", ergebnis: "5,0" }, "Läuft"), { geschrieben: [{ status: "läuft" }], fenster: [] });
});
