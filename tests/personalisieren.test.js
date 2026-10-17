// Einstellungen & Hilfe (personalisieren.js): Inhalt der Zeilen „Deine Angaben“ und „Variante“. Läuft ohne Obsidian.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { laden } = require("./laden.js");

// Datenmodell-Ersatz: heute 17.10.2026; ohne Studienbeginn gilt WS 2026/27, mit Beginn 01.10.2025 ist heute das 3. FS
const SEMESTER = [
  { name: "WS 2025/26", beginn: "2025-10-01", ende: "2026-03-31", fs: 1 },
  { name: "SS 2026", beginn: "2026-04-01", ende: "2026-09-30", fs: 2 },
  { name: "WS 2026/27", beginn: "2026-10-01", ende: "2027-03-31", fs: 3 },
];
const modell = {
  daten: () => ({ heute: "2026-10-17" }),
  vorschau: (beginn) => (beginn ? SEMESTER : [{ name: "WS 2026/27", beginn: "2026-10-01", ende: "2027-03-31", fs: 1 }]),
};
const P = laden("personalisieren", { kontext: { obsidian: { Modal: class {}, Notice: class {} }, modell } }).ctx.personalisieren;
const nach = (zeilen) => Object.fromEntries(zeilen.map((z) => [z.id, z]));

test("Deine Angaben leer: „Nicht eingetragen.“, Studienbeginn nennt das geltende Semester, Einrichtung starten", () => {
  const z = nach(P.angabenZeilen({}, { status: "offen", uebersprungen: [] }));
  assert.deepEqual(Object.keys(z), ["name", "studienbeginn", "zielnote", "einrichtung"]);
  assert.equal(z.name.wert, "");
  assert.equal(z.name.text, "Nicht eingetragen.");
  assert.equal(z.name.ton, "leise");
  assert.equal(z.studienbeginn.text, "Nicht eingetragen, es gilt WS 2026/27.");
  assert.deepEqual(z.zielnote.knopf, { text: "Ändern", aktion: "personalisieren", parameter: { feld: "zielnote" } });
  assert.deepEqual(z.einrichtung.pille, { text: "offen", art: "leer" });
  assert.deepEqual(z.einrichtung.knopf, { text: "Starten", aktion: "einrichtung", parameter: { ab: "2" }, cta: true });
});

test("Deine Angaben eingetragen: Wert in der Zeile, Studienbeginn mit Fachsemester, Knopf öffnet das Formular am Feld", () => {
  const z = nach(P.angabenZeilen({ name: "Lea", studienbeginn: "2025-10-01", zielnote: "1,7" }, { status: "fertig", uebersprungen: [] }));
  assert.equal(z.name.wert, "Lea");
  assert.equal(z.name.text, "");
  assert.equal(z.name.ton, "akzent");
  assert.equal(z.studienbeginn.wert, "WS 2025/26");
  assert.equal(z.studienbeginn.text, "heute 3. Fachsemester");
  assert.deepEqual(z.studienbeginn.knopf.parameter, { feld: "studienbeginn" });
  assert.equal(z.zielnote.wert, "1,7");
  assert.equal(z.einrichtung.text, "Alle Schritte erledigt.");
  assert.deepEqual(z.einrichtung.knopf, { text: "Erneut starten", aktion: "einrichtung", parameter: { ab: "2" } });
});

test("Einrichtung: übersprungene Schritte in Worten, angefangene geht dort weiter, wo sie stand", () => {
  const fertig = nach(P.angabenZeilen({}, { status: "fertig", uebersprungen: ["alma", "ilias", "unbekannt"] }));
  assert.equal(fertig.einrichtung.text, "Übersprungen: Alma, ILIAS.");
  assert.deepEqual(fertig.einrichtung.pille, { text: "fertig", art: "ok" });
  const laeuft = nach(P.angabenZeilen({}, { status: "laeuft", uebersprungen: [] }));
  assert.deepEqual(laeuft.einrichtung.knopf, { text: "Fortsetzen", aktion: "einrichtung", parameter: {}, cta: true });
  // ohne einrichtung.js: Zustand aus dem Feld „einrichtung“ der Einstellungen
  assert.equal(nach(P.angabenZeilen({ einrichtung: "fertig" })).einrichtung.knopf.text, "Erneut starten");
});

test("Variante: je Variante eine Zeile mit dem, was daraus folgt; die gewählte ohne Knopf", () => {
  const offen = P.varianteZeilen({ variante: "offen" });
  assert.deepEqual(offen.map((z) => z.titel), ["Economics", "Business Administration", "Ohne Spezialisierung", "Noch offen"]);
  assert.deepEqual(offen.map((z) => z.text), ["Economics", "Business Administration", "ohne Spezialisierung", "offen"].map((v) => P.FOLGE[v]));
  assert.deepEqual(offen[0].knopf, { text: "Wählen", aktion: "variante", parameter: { wert: "Economics" } });
  assert.equal(offen[3].knopf, undefined);
  assert.deepEqual(offen[3].pille, { text: "aktuell", art: "leer" });
  const eco = P.varianteZeilen({ variante: "Economics" });
  assert.equal(eco[0].knopf, undefined);
  assert.equal(eco[0].symbol, "haken");
  assert.deepEqual(eco[0].pille, { text: "gewählt", art: "ok" });
  assert.deepEqual(eco[3].knopf.parameter, { wert: "offen" }, "zurück auf „noch offen“ geht auch");
  // unbekannter oder leerer Wert gilt als „noch offen“
  assert.deepEqual(P.varianteZeilen({ variante: "Jura" }).map((z) => !!z.knopf), [true, true, true, false]);
  assert.deepEqual(P.varianteZeilen({}).map((z) => !!z.knopf), [true, true, true, false]);
});

test("Jede Variante hat einen Text, was daraus folgt", () => {
  for (const v of P.VARIANTEN) assert.ok(P.FOLGE[v], v);
});
