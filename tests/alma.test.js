// Alma-Stundenplan (alma.js): von Hand angelegte Notizen löscht Alma nie, und ein Link, dessen erster Abruf scheitert,
// bleibt nicht gespeichert. Tresor im Speicher, nur ausgedachte Daten. Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { laden } = require("./laden.js");

const MODULCODE = "[A-Z]{1,4}[0-9][0-9X]{2}[A-Z]?";
const SEM = "WS 2026/27";

// Kleiner Tresor: Frontmatter und Text je Pfad, dazu Papierkorb, angelegte Dateien und gerätelokaler Speicher
function tresor({ testAbruf, prompt } = {}) {
  const fm = {}, text = {}, papierkorb = [], speicher = {};
  const L = laden("alma", {
    frontmatter: fm,
    kontext: {
      user: { eba: { MODULCODE } },
      modell: { semesterVon: () => ({ name: SEM }) },
      plugin: { testAbruf },
      system: { prompt: prompt || (async () => null) },
    },
  });
  const app = L.ctx.app;
  const datei = (p) => ({ path: p, basename: p.split("/").pop().replace(/\.md$/, "") });
  app.vault.getMarkdownFiles = () => Object.keys(fm).map(datei);
  app.vault.getAbstractFileByPath = (p) => (p === "Stundenplan" || fm[p] ? datei(p) : null);
  app.vault.cachedRead = async (f) => text[f.path] || "";
  app.vault.create = async (p, t) => { text[p] = t; fm[p] = { typ: "lehrveranstaltung", semester: SEM }; return datei(p); };
  app.vault.createFolder = async () => {};
  app.vault.trash = async (f) => { papierkorb.push(f.path); delete fm[f.path]; delete text[f.path]; };
  app.fileManager = { processFrontMatter: async (f, fn) => fn(fm[f.path]) };
  app.loadLocalStorage = (k) => (k in speicher ? speicher[k] : null);
  app.saveLocalStorage = (k, v) => { if (v == null) delete speicher[k]; else speicher[k] = v; };
  return { A: L.ergebnis, fm, text, papierkorb, speicher };
}

const ereignis = (uid, titel, start, ende) => [
  "BEGIN:VEVENT", "UID:" + uid, "SUMMARY:" + titel, "DTSTART:" + start, "DTEND:" + ende, "RRULE:FREQ=WEEKLY;COUNT=3", "END:VEVENT",
].join("\n");
const kalender = (...e) => ["BEGIN:VCALENDAR", ...e, "END:VCALENDAR"].join("\n");
const B110 = ereignis("1", "B110 Einführung in die BWL Vorlesung", "20261019T100000", "20261019T120000"); // Mo
const B130 = ereignis("2", "B130 Internes Rechnungswesen Übung", "20261020T140000", "20261020T160000");     // Di
const S100 = ereignis("3", "S100 Mathematik Vorlesung", "20261021T080000", "20261021T100000");             // Mi

test("Wegfall in Alma: eigene Notiz verliert nur die Verknüpfung, Alma-Notiz kommt in den Papierkorb", async () => {
  const t = tresor();
  const hand = "Stundenplan/Mo 10.15 B110 Vorlesung.md";
  t.fm[hand] = { typ: "lehrveranstaltung", code: "B110", art: "Vorlesung", wochentag: 1, beginn: "10:15", ende: "11:45", semester: SEM };
  t.text[hand] = "---\n---\n\n# B110 · Vorlesung\n\nMeine eigenen Notizen.\n";
  const alma = "Stundenplan/Di 14.00 B130 Übung.md";
  t.fm[alma] = { typ: "lehrveranstaltung", code: "B130", art: "Übung", wochentag: 2, beginn: "14:00", ende: "16:00", semester: SEM,
    quelle: "alma", alma_schluessel: `${SEM}|B130 Internes Rechnungswesen Übung|2|14:00|16:00` };
  t.text[alma] = "---\n---\n\n# B130 · Übung\n\n> [!info]- Aus Alma\n> B130 Internes Rechnungswesen Übung\n\n## Notizen\n- \n";

  // 1. Abruf: Alma übernimmt die Hand-Notiz (c.t. bleibt), die Alma-Notiz bleibt zugeordnet
  const b1 = await t.A.aktualisieren({ text: kalender(B110, B130), still: true });
  assert.deepEqual([b1.neu, b1.entfernt], [0, 0]);
  assert.equal(t.fm[hand].quelle, "alma");
  assert.ok(t.fm[hand].alma_schluessel);
  assert.deepEqual([t.fm[hand].beginn, t.fm[hand].ende], ["10:15", "11:45"]);

  // 2. Abruf: B110 und B130 fehlen in Alma (gleiches Semester geliefert)
  const b2 = await t.A.aktualisieren({ text: kalender(S100), still: true });
  assert.deepEqual([b2.neu, b2.entfernt, b2.behalten], [1, 1, 1]);
  assert.deepEqual(t.papierkorb, [alma]);
  assert.ok(t.fm[hand], "eigene Notiz bleibt");
  for (const k of ["quelle", "alma_schluessel", "alma_titel", "alma_raum"]) assert.equal(k in t.fm[hand], false, k);
  assert.equal(t.fm[hand].code, "B110");

  // 3. Abruf: die gelöste Notiz bleibt unangetastet (kein zweites Löschen)
  const b3 = await t.A.aktualisieren({ text: kalender(S100), still: true });
  assert.deepEqual([b3.entfernt, b3.behalten], [0, 0]);
  assert.ok(t.fm[hand]);
});

test("Verbinden: scheitert der erste Abruf, gilt wieder der vorherige Link", async () => {
  const alt = "https://alma.uni-tuebingen.de/alma/ical/alt";
  const neu = "https://alma.uni-tuebingen.de/alma/ical/neu";
  let antwort = { status: 404 };
  const t = tresor({ testAbruf: async () => antwort, prompt: async () => neu });

  // ohne vorherigen Link (Eingabefenster, nicht das Verbinden-Fenster): nichts bleibt gespeichert
  assert.equal(await t.A.verbinden(), null);
  assert.equal(t.A.hatLink(), false);
  assert.match(t.A.fehler(), /Fehler 404/);

  // mit vorherigem Link: der alte bleibt, auch über aktualisierenOderVerbinden({ neuerLink })
  t.speicher["eba-alma-ics"] = alt;
  t.speicher["eba-alma-seit"] = "2026-10-01T08:00:00.000Z";
  assert.equal(await t.A.aktualisierenOderVerbinden({ neuerLink: true }), null);
  assert.equal(t.speicher["eba-alma-ics"], alt);
  assert.equal(t.speicher["eba-alma-seit"], "2026-10-01T08:00:00.000Z");

  // Erfolg: neuer Link gespeichert
  antwort = { status: 200, text: kalender(S100) };
  const b = await t.A.verbinden(undefined, { nurBeiErfolg: true });
  assert.equal(b.neu, 1);
  assert.equal(t.speicher["eba-alma-ics"], neu);
});
