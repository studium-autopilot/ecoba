// Kopf-Karte jeder Notiz (kopf.js): genau ein Status-Knopf je Notiztyp, Farbe aus ctx.modell.statusArt, „Besuche ich nicht“ für
// jede Lehrveranstaltung (Quelle über ihren Schlüssel in den Einstellungen, eigene Notiz über ein Feld). Das Zeichnen in Lese- und
// Bearbeitungsansicht prüft man in Obsidian (docs/tests.md). Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { laden, json } = require("./laden.js");

const K = require("../Studium Autopilot/System/Skripte/kopf.js");
const SEMESTER = json("semester.json");
const modell = (heute, einstellungen = {}) => laden("modell", {
  heute, frontmatter: { "System/Daten/Semester.md": SEMESTER, "System/Einstellungen.md": einstellungen },
}).ctx.modell;
const serie = (o) => Object.assign({ typ: "lehrveranstaltung", code: "X100", wochentag: 4, beginn: "10:15", ende: "11:45", von: "2027-04-15", bis: "2027-07-22", semester: "SS 2027" }, o);

test("Genau ein Status je Notiztyp; Vorlesung und Übungsblatt haben ihren Kopf schon im Text", () => {
  assert.deepEqual(K.TYPEN, ["termin", "unterlage", "sq_kurs", "lehrveranstaltung"]);
  for (const typ of K.TYPEN) assert.ok(K.statusVon(typ, {}, false), typ);
  assert.equal(K.statusVon("vorlesung", {}), null);
});

test("Termin: Offen ⇄ Erledigt; Unterlage: Noch nicht gelesen ⇄ Gelesen („bearbeitet“ zählt als gelesen)", () => {
  assert.deepEqual(K.statusVon("termin", { erledigt: false }), { wert: false, text: "Offen", wort: "offen", fertig: false, neu: true });
  assert.equal(K.statusVon("termin", { erledigt: true }).neu, false);
  const u = K.statusVon("unterlage", { status: "neu" });
  assert.deepEqual([u.text, u.neu, u.fertig], ["Noch nicht gelesen", "gelesen", false]);
  assert.deepEqual([K.statusVon("unterlage", { status: "gelesen" }).neu, K.statusVon("unterlage", { status: "bearbeitet" }).text], ["neu", "Bearbeitet"]);
  assert.equal(K.statusVon("unterlage", {}).wert, "neu", "ohne Feld: neu");
});

test("SQ-Kurs: vier Stufen im Menü, unbekannt = geplant; Lehrveranstaltung: Im Stundenplan ⇄ Besuche ich nicht", () => {
  const s = K.statusVon("sq_kurs", { status: "angemeldet" });
  assert.deepEqual([s.text, s.fertig, s.menue], ["Angemeldet", false, ["geplant", "angemeldet", "zugelassen", "bestanden"]]);
  assert.equal(K.statusVon("sq_kurs", { status: "irgendwas" }).wert, "geplant");
  assert.equal(K.statusVon("sq_kurs", { status: "bestanden" }).fertig, true);
  assert.deepEqual([K.statusVon("lehrveranstaltung", {}, false).text, K.statusVon("lehrveranstaltung", {}, true).text], ["Im Stundenplan", "Besuche ich nicht"]);
});

test("Farbe aus statusArt: erledigt gefüllt, Zwischenstand getönt, offen warm, Besuche ich nicht leise", () => {
  const M = modell("2026-10-18");
  const klasse = (typ, fm, nicht) => { const s = K.statusVon(typ, fm, nicht); return K.klasseVon(s, M.statusArt(typ, s.wort)); };
  assert.equal(klasse("termin", { erledigt: true }), "fertig");
  assert.equal(klasse("termin", { erledigt: false }), "");
  assert.equal(klasse("unterlage", { status: "gelesen" }), "fertig");
  assert.equal(klasse("sq_kurs", { status: "angemeldet" }), "zwischen");
  assert.equal(klasse("sq_kurs", { status: "bestanden" }), "fertig");
  assert.equal(klasse("sq_kurs", { status: "geplant" }), "");
  assert.equal(klasse("lehrveranstaltung", {}, false), "fertig");
  assert.equal(klasse("lehrveranstaltung", {}, true), "leise");
});

test("Besuche ich nicht: zentral über die id, andere Quellen über „<herkunft>:<id>“, eigene Notiz über das Feld", () => {
  const alma = serie({ herkunft: "alma", alma_schluessel: "SS 2027|X100|4|10:15|11:45" });
  const M = modell("2027-04-20", { stundenplan_ausgeblendet: ["ss-2027-x100", "alma:SS 2027|X100|4|10:15|11:45"] });
  assert.equal(M.besuchSchluessel(serie({ herkunft: "zentral", zentral_id: "ss-2027-x100" })), "ss-2027-x100");
  assert.equal(M.besuchSchluessel(alma), "alma:SS 2027|X100|4|10:15|11:45");
  assert.equal(M.besuchSchluessel(serie()), "", "eigene Notiz: kein Schlüssel");
  assert.equal(M.findetStatt(alma, "2027-04-22").grund, "ausgeblendet");
  assert.equal(M.findetStatt(serie({ besuche_nicht: true }), "2027-04-22").grund, "ausgeblendet");
  assert.equal(M.findetStatt(serie(), "2027-04-22").statt, true);
  assert.equal(M.naechsteSitzung(alma, new Date("2027-04-20T12:00:00")), null, "keine nächste Sitzung");
  assert.equal(modell("2027-04-20").besuchtNicht(alma), false);
});
