// Neue Notizen (notizen.js) über das Fenster „Neu …“ (formular.js): Esc legt nichts an, ohne Eingabe gelten die Vorgaben, ein
// Fehler (keine Zahl, Uhrzeit, Code schon vergeben) legt auch nichts an. Antworten wie im Plugin über plugin.testAntworten: null =
// Esc, ein Objekt = Eingaben je Feld. Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { laden } = require("./laden.js");

const MODUL = { f: { basename: "B110 Einführung in die BWL", path: "Module/1 Grundstudium/B110 Einführung in die BWL.md" }, fm: { code: "B110", titel: "Einführung in die BWL" } };
const pad = (n) => String(n).padStart(2, "0");
// Fachmodell, soweit eba.datumLesen es braucht (Jahr zu „TT.MM.“)
const gueltig = (t, m) => new Date(2026, m - 1, t).getDate() === Number(t);
const modell = { zeit: { jahrRaten: (t, m) => (gueltig(t, m) ? `2026-${pad(m)}-${pad(t)}` : "") }, istZwischentest: (t) => /zwischentest/i.test(t) };

// Eine Aktion mit den Antworten für das Fenster; Modul: B110 (das einzige). → { angelegt, abgebrochen, protokoll, rest }
async function anlegen(aktion, antworten, parameter = {}, codes = ["B110"]) {
  const plugin = { testAntworten: antworten.slice(), testProtokoll: [] };
  const E = laden("eba", { kontext: { modell } }).ergebnis;
  const angelegt = [];
  let abgebrochen = 0;
  const eba = Object.assign({}, E, {
    modulNachCode: (k) => (codes.indexOf(k) >= 0 ? MODUL : null),
    modulFeld: (o = {}) => ({ name: "modul", titel: "Modul", art: "auswahl", pflicht: !o.optional,
      optionen: (o.optional ? [{ wert: null, text: "Ohne Modul" }] : []).concat([{ wert: MODUL, text: "B110 · Einführung in die BWL" }]),
      vorgabe: o.optional ? null : MODUL, waehlen: (k) => (codes.indexOf(k) >= 0 ? MODUL : null) }),
    abbrechen: () => { abgebrochen++; },
    ablegen: async (ordner, name, inhalt) => { angelegt.push({ ordner, name, inhalt }); return { path: ordner + "/" + name + ".md" }; },
  });
  const F = laden("formular", { kontext: { plugin, user: { eba: () => eba } } });
  const L = laden("notizen", { frontmatter: { "System/Gerüste/Modul.md": {} },
    kontext: { plugin, modell, formular: F.ctx.formular, user: { eba: () => eba, formular: require("../Studium Autopilot/System/Skripte/formular.js") } } });
  L.ctx.app.vault.read = async () => "# {{code}} {{titel}}"; // Gerüst des eigenen Moduls
  const jetzt = L.ctx.date.now;
  L.ctx.date.now = (format, tage) => (format === "DD.MM.YYYY" ? "15.10.2026" : jetzt(format, tage));
  const N = L.ergebnis;
  await N.aktionen[aktion].ausfuehren({ parameter, datei: null });
  return { angelegt, abgebrochen, protokoll: plugin.testProtokoll, rest: plugin.testAntworten };
}

test("Esc im Fenster: nichts entsteht, auch keine Vorgabe", async () => {
  for (const aktion of ["vorlesung", "uebungsblatt", "termin", "lehrveranstaltung", "sq-kurs", "modul"]) {
    const r = await anlegen(aktion, [null]);
    assert.deepEqual([r.angelegt.length, r.abgebrochen, r.rest.length], [0, 1, 0], aktion);
    assert.equal(r.protokoll.length, 1, aktion + ": genau ein Fenster");
  }
});

test("Ohne Eingabe gelten die Vorgaben (Nummer, Beginn, Ende, ECTS); geraten wird nichts", async () => {
  const b = await anlegen("uebungsblatt", [{}]);
  assert.equal(b.angelegt[0].name, "B110 Blatt 01");
  assert.match(b.angelegt[0].inhalt, /^faellig: ?$/m, "Abgabe leer: eine geratene stünde wie eine echte bei den Fristen (bis 24.10.2026 in einer Woche)");
  const b2 = await anlegen("uebungsblatt", [{ faellig: "27.10." }]);
  assert.match(b2.angelegt[0].inhalt, /^faellig: 2026-10-27$/m, "eingetragene Abgabe");
  const l = await anlegen("lehrveranstaltung", [{ wochentag: 2 }]);
  assert.match(l.angelegt[0].inhalt, /^beginn: "10:15"$/m);
  assert.match(l.angelegt[0].inhalt, /^ende: "11:45"$/m, "Ende = Beginn + 90 Min.");
  assert.match(l.angelegt[0].inhalt, /^wochentag: 2$/m);
  assert.match(l.angelegt[0].inhalt, /^ausfall: \[\]$/m, "Pausen prüft das Fachmodell beim Lesen, nicht beim Anlegen");
  assert.doesNotMatch(l.angelegt[0].inhalt, /^tag:/m, "Wochentag nur einmal (wochentag)");
  assert.match(l.angelegt[0].inhalt, /^## Meine Notizen$/m);
  const s = await anlegen("sq-kurs", [{ titel: "Spanisch A1" }]);
  assert.match(s.angelegt[0].inhalt, /^ects: 3$/m);
  assert.match(s.angelegt[0].inhalt, /^status: geplant$/m);
  assert.match(s.angelegt[0].inhalt, /^\*\*Transdisciplinary Course Program \(TCP\)\*\* · für \[\[SQ100/m, "ECTS und Semester zeigt der Kopf, nicht der Text");
  assert.doesNotMatch(s.angelegt[0].inhalt, /Eigenschaften/, "Stand ändert der Kopf der Notiz, nicht die Eigenschaften");
  const a = await anlegen("sq-kurs", [{ titel: "Semester in Lyon", anbieter: "Auslandssemester" }]);
  assert.match(a.angelegt[0].inhalt, /^ects: 6$/m, "ECTS folgen dem Anbieter, solange du sie nicht änderst");
});

test("Eingaben werden gelesen: Uhrzeit c.t., Zeitraum, Art aus dem Titel, Modul aus dem Titel", async () => {
  const l = await anlegen("lehrveranstaltung", [{ beginn: "14", raum: "Kupferbau HS 25" }]);
  assert.match(l.angelegt[0].inhalt, /^beginn: "14:15"$/m);
  assert.match(l.angelegt[0].inhalt, /^ende: "15:45"$/m);
  assert.match(l.angelegt[0].inhalt, /^raum: "Kupferbau HS 25"$/m);
  const t = await anlegen("termin", [{ titel: "Klausur B110", wann: "12.11.–15.11.", uhrzeit: "9.15" }]);
  const i = t.angelegt[0].inhalt;
  assert.equal(t.angelegt[0].name, "2026-11-12 Klausur B110");
  assert.match(i, /^bis: 2026-11-15$/m);
  assert.match(i, /^kategorie: Prüfung$/m);
  assert.match(i, /^uhrzeit: "09:15"$/m);
  assert.match(i, /^code: "B110"$/m, "Modulcode im Titel wählt das Modul vor");
  const f = await anlegen("termin", [{ titel: "Lerngruppe", kategorie: "Fachschaft" }]);
  assert.match(f.angelegt[0].inhalt, /^kategorie: Fachschaft$/m, "Art im Fenster geändert");
  assert.match(f.angelegt[0].inhalt, /^datum: 2026-10-15$/m, "ohne Eingabe: heute");
});

test("Fehler im Fenster legen nichts an und stehen beim Feld", async () => {
  const faelle = [
    ["uebungsblatt", { nummer: "drei" }, "nummer"],
    ["termin", { titel: "  " }, "titel"],
    ["termin", { titel: "X", wann: "31.02." }, "wann"],
    ["lehrveranstaltung", { beginn: "25:00" }, "beginn"],
    ["lehrveranstaltung", { beginn: "14:00", ende: "13:00" }, "ende"],
    ["sq-kurs", { titel: "X", ects: "viele" }, "ects"],
    ["modul", { code: "Spieltheorie", titel: "X" }, "code"],
    ["modul", { code: "b110", titel: "X" }, "code"], // gibt es schon
  ];
  for (const [aktion, eingabe, feld] of faelle) {
    const r = await anlegen(aktion, [eingabe]);
    assert.equal(r.angelegt.length, 0, aktion + " " + JSON.stringify(eingabe));
    assert.ok(r.protokoll[0].fehler && r.protokoll[0].fehler[feld], `${aktion}: Fehler bei ${feld}`);
  }
});

test("Eigenes Modul: Schwerpunktbereich nur beim Teil Schwerpunkt, Code groß geschrieben", async () => {
  const s = await anlegen("modul", [{ code: "e385", titel: "Spieltheorie", gruppe: "Schwerpunkt", bereich: "Data Science" }], {}, []);
  assert.equal(s.angelegt[0].name, "E385 Spieltheorie");
  assert.match(s.angelegt[0].inhalt, /^anrechnung: "Data Science"$/m);
  const g = await anlegen("modul", [{ code: "E386", titel: "Recht", gruppe: "Grundstudium", bereich: "Data Science" }], {}, []);
  assert.match(g.angelegt[0].inhalt, /^anrechnung: ""$/m, "verstecktes Feld zählt nicht");
});

test("Termin mit Titel und Datum aus dem Knopf: ohne Fenster", async () => {
  const r = await anlegen("termin", [], { titel: "Lerngruppe", wann: "20.11." });
  assert.equal(r.protokoll.length, 0);
  assert.equal(r.angelegt[0].name, "2026-11-20 Lerngruppe");
});

test("Anlegen fragt nie in einer Kette: keine Eingabe- und Auswahlfenster in den Anlege-Aktionen", () => {
  const skripte = path.join(__dirname, "..", "Studium Autopilot", "System", "Skripte");
  const notizen = fs.readFileSync(path.join(skripte, "notizen.js"), "utf8");
  assert.doesNotMatch(notizen, /ctx\.system\.(prompt|suggester)/);
  const karten = fs.readFileSync(path.join(skripte, "karten.js"), "utf8");
  const stapel = karten.slice(karten.indexOf("const stapelAnlegen"), karten.indexOf("const notizZeigen"));
  assert.match(stapel, /ctx\.formular/);
  assert.doesNotMatch(stapel, /ctx\.system\./);
  const eba = fs.readFileSync(path.join(skripte, "eba.js"), "utf8");
  assert.doesNotMatch(eba, /ctx\.system\./, "eba.js fragt nicht selbst (bis 0.4.5 modulWaehlen, datumFragen, zeitraumFragen)");
});
