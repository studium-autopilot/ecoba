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

test("Übung und Tutorium im Stundenplan: Unterlagen aus dem eigenen Bereich, neueste Nummer zuerst, ohne Nummer danach, höchstens drei", () => {
  const u = (code, art, nummer, titel) => ({ f: { basename: `${code} ${art} ${titel}` }, fm: { typ: "unterlage", code, art, nummer, titel } });
  const unterlagen = [
    u("X100", "Übung", 1, "Aufgabenblatt Vorkurs"), u("X100", "Übung", "", "Aufgabenkatalog"), u("X100", "Übung", 3, "Integrale"),
    u("X100", "Lösung", 1, "Kurzlösung"), u("X100", "Folien", 2, "Ableitungen"), u("Y200", "Übung", 4, "Fremdes Modul"),
    { f: { basename: "X100 Übung 02" }, fm: { typ: "unterlage", code: "X100", art: "übung", nummer: 2 } },
    { f: { basename: "X100 Übung WS 2026" }, fm: { typ: "unterlage", code: "X100", art: "Übung" } },
    u("X100", "Tutorium", 1, "Aufgabenblatt"), u("X100", "Tutorium", "", "Vorlage Abgabe"),
    { f: { basename: "X100 Tutorium 02" }, fm: { typ: "unterlage", code: "X100", art: "Tutorium", nummer: 2 } },
  ];
  const titel = (r) => r.blaetter.map((b) => [b.nr, b.titel]);
  const tut = K.blaetterFuer(serie({ art: "Tutorium" }), unterlagen);
  assert.equal(tut.art, "Tutorium");
  assert.deepEqual(titel(tut), [[2, ""], [1, "Aufgabenblatt"], [null, "Vorlage Abgabe"]], "nur der Bereich Tutorium; ohne Titel: Dateiname ohne Kürzel, Art, Nummer");
  assert.equal(tut.mehr, 0);
  const ue = K.blaetterFuer(serie({ art: "Übung" }), unterlagen);
  assert.equal(ue.art, "Übung");
  assert.deepEqual(titel(ue), [[3, "Integrale"], [2, ""], [1, "Aufgabenblatt Vorkurs"]], "keine Tutoriumsunterlagen bei der Übung");
  assert.equal(ue.mehr, 2, "die Blätter ohne Nummer kommen über „Alle Unterlagen“");
  assert.deepEqual(titel(K.blaetterFuer(serie({ art: "Übungsteil" }), unterlagen, 10)).slice(3), [[null, "Aufgabenkatalog"], [null, "WS 2026"]]);
  assert.equal(K.blaetterFuer(serie({ art: "Vorlesung" }), unterlagen), null, "Vorlesung: keine Chips");
  assert.equal(K.blaetterFuer(serie({ art: "Tutorium", code: "" }), unterlagen), null, "ohne Modul: nichts");
  assert.deepEqual(K.blaetterFuer(serie({ art: "Tutorium", code: "Z300" }), unterlagen), { art: "Tutorium", blaetter: [], mehr: 0 });
});

test("Lab im Stundenplan: Unterlagen aus dem Bereich Lab, auch unter dem offiziellen Namen („Data Science Lab“)", () => {
  const u = (art, nummer, titel) => ({ f: { basename: `X100 ${art} ${titel}` }, fm: { typ: "unterlage", code: "X100", art, nummer, titel } });
  const unterlagen = [u("Lab", 1, "Notebook Grundlagen"), u("Lab", 2, "Regression"), u("Übung", 3, "Integrale"), u("Sonstiges", "", "Lab Daten")];
  for (const art of ["Lab", "Data Science Lab", "R Lab", "Python Labs"]) {
    const r = K.blaetterFuer(serie({ art }), unterlagen);
    assert.equal(r.art, "Lab", art);
    assert.deepEqual(r.blaetter.map((b) => [b.nr, b.titel]), [[2, "Regression"], [1, "Notebook Grundlagen"]], art);
  }
  for (const art of ["Praktikum", "Laborpraktikum", "Matlab-Kurs", "Kollaboration"]) assert.equal(K.blaetterFuer(serie({ art }), unterlagen), null, art);
  assert.equal(K.blaetterFuer(serie({ art: "Übung" }), unterlagen).art, "Übung");
});

test("Lab im Stundenplan: ein Chip je Sitzung, zum Lesen vor Notebook, Code und Daten, Lösung zuletzt; der Rest über „Alle Unterlagen“", () => {
  const u = (nummer, titel, format, datei) => ({ f: { basename: `X100 Lab ${nummer} ${titel}` }, fm: { typ: "unterlage", code: "X100", art: "Lab", nummer, titel, format, datei } });
  const unterlagen = [u(2, "Daten", "csv"), u(2, "Lösung", "pdf"), u(2, "Code", "r"), u(2, "", "html, rmd"), u(1, "Daten", "csv"), u(1, "Grundlagen", "html, rmd"), u("", "Einrichtung", "pdf")];
  const r = K.blaetterFuer(serie({ art: "Data Science Lab" }), unterlagen);
  assert.deepEqual(r.blaetter.map((b) => [b.nr, b.titel]), [[2, ""], [1, "Grundlagen"], [null, "Einrichtung"]]);
  assert.equal(r.mehr, 4, "Daten, Lösung und Code bleiben über die Modulseite erreichbar");
  // aus der ILIAS-Ablage: Notebook und HTML-Fassung getrennt, ohne „format“ zählt die Endung der Datei
  const ilias = [u(1, "Notebook Grundlagen", "rmd"), u(1, "Notebook Grundlagen mit Ausgaben", "html"), u(3, "Daten", "", "[[X100 Lab 03 Daten.csv]]"), u(3, "Notebook", "", "[[X100 Lab 03 Notebook.Rmd]]")];
  assert.deepEqual(K.blaetterFuer(serie({ art: "Lab" }), ilias).blaetter.map((b) => b.titel), ["Notebook", "Notebook Grundlagen mit Ausgaben"]);
  // eine Lösung auch als „Lsg“ oder nur im Link der Datei (mit Alias) zuletzt; „Lsg“ nur als ganzes Wort
  const lsg = [u(4, "Lsg", "pdf"), u(4, "Aufgaben", "pdf", "[[X100 Lab 04 Loesung.pdf|Aufgaben]]"), u(4, "Notebook", "", "[[X100 Lab 04 Notebook.Rmd|Notebook]]")];
  assert.deepEqual(K.blaetterFuer(serie({ art: "Lab" }), lsg).blaetter.map((b) => b.titel), ["Notebook"]);
  const ohne = [u(5, "Notebook", "rmd"), u(5, "Halsgrat", "pdf")];
  assert.deepEqual(K.blaetterFuer(serie({ art: "Lab" }), ohne).blaetter.map((b) => b.titel), ["Halsgrat"]);
  const ue = [u(3, "A", "pdf"), u(3, "B", "pdf")].map((x) => ({ f: x.f, fm: Object.assign({}, x.fm, { art: "Übung" }) }));
  assert.equal(K.blaetterFuer(serie({ art: "Übung" }), ue).blaetter.length, 2, "Übungen mit gleicher Nummer bleiben einzeln");
});
