// Einstellungen & Hilfe (personalisieren.js): Inhalt der Zeilen „Deine Angaben“ und „Variante“. Läuft ohne Obsidian.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { laden } = require("./laden.js");

// Datenmodell-Ersatz: heute 17.10.2026; ohne Studienbeginn gilt WS 2026/27, mit Beginn 01.10.2025 beginnt das Studium im WS 2025/26
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

test("Deine Angaben leer: „Eintragen“ als Wert, jede Zeile öffnet das Formular am Feld, Einrichtung starten", () => {
  const z = nach(P.angabenZeilen({}, { status: "offen", uebersprungen: [] }));
  assert.deepEqual(Object.keys(z), ["name", "studienbeginn", "zielnote", "einrichtung"]);
  for (const id of ["name", "studienbeginn", "zielnote"]) {
    assert.equal(z[id].wert, "Eintragen", id);
    assert.equal(z[id].ton, "leise", id);
    assert.equal(z[id].rechts, "pfeil", id);
    assert.deepEqual(z[id].aktion, { aktion: "personalisieren", parameter: { feld: id } }, id);
  }
  assert.equal(z.einrichtung.wert, "Starten");
  assert.equal(z.einrichtung.wertArt, "akzent", "etwas wartet auf dich");
  assert.deepEqual(z.einrichtung.aktion, { aktion: "einrichtung", parameter: { ab: "2" } });
  assert.ok(!z.einrichtung.unter);
});

test("Deine Angaben eingetragen: Wert rechts in der Zeile, Studienbeginn als Semester, ohne zweite Zeile", () => {
  const z = nach(P.angabenZeilen({ name: "Lea", studienbeginn: "2025-10-01", zielnote: "1,7" }, { status: "fertig", uebersprungen: [] }));
  assert.equal(z.name.wert, "Lea");
  assert.equal(z.name.ton, "akzent");
  assert.equal(z.studienbeginn.wert, "WS 2025/26");
  assert.equal(z.zielnote.wert, "1,7");
  for (const id of ["name", "studienbeginn", "zielnote"]) assert.ok(!z[id].unter, id);
  assert.equal(z.einrichtung.wert, "Fertig");
  assert.equal(z.einrichtung.ton, "ok");
  assert.equal(z.einrichtung.wertArt, undefined, "Fertig ist gedämpft");
  assert.equal(z.einrichtung.unter, "");
  assert.deepEqual(z.einrichtung.aktion, { aktion: "einrichtung", parameter: { ab: "2" } }, "ein Tipp startet sie erneut");
});

test("Einrichtung: übersprungene Schritte in der zweiten Zeile, angefangene geht dort weiter, wo sie stand", () => {
  const fertig = nach(P.angabenZeilen({}, { status: "fertig", uebersprungen: ["uni", "unbekannt"] }));
  assert.equal(fertig.einrichtung.unter, "Übersprungen: Uni-Login.");
  // aus Einrichtungen bis 0.4.7
  assert.equal(nach(P.angabenZeilen({}, { status: "fertig", uebersprungen: ["alma", "ilias"] })).einrichtung.unter, "Übersprungen: Alma, ILIAS.");
  const laeuft = nach(P.angabenZeilen({}, { status: "laeuft", uebersprungen: [] }));
  assert.equal(laeuft.einrichtung.wert, "Fortsetzen");
  assert.deepEqual(laeuft.einrichtung.aktion, { aktion: "einrichtung", parameter: {} });
  // ohne einrichtung.js: Zustand aus dem Feld „einrichtung“ der Einstellungen
  assert.equal(nach(P.angabenZeilen({ einrichtung: "fertig" })).einrichtung.wert, "Fertig");
});

test("Variante: je Variante eine Zeile ohne Symbol; die gewählte mit Haken und dem, was daraus folgt, die übrigen wählt ein Tipp", () => {
  const offen = P.varianteZeilen({ variante: "offen" });
  assert.deepEqual(offen.map((z) => z.titel), ["Economics", "Business Administration", "Ohne Spezialisierung", "Noch offen"]);
  assert.ok(offen.every((z) => !z.symbol && !z.wert));
  assert.deepEqual(offen[0].aktion, { aktion: "variante", parameter: { wert: "Economics" } });
  assert.equal(offen[0].rechts, "");
  assert.ok(!offen[0].unter, "nicht gewählte ohne zweite Zeile");
  assert.equal(offen[3].aktion, undefined);
  assert.equal(offen[3].rechts, "haken");
  assert.equal(offen[3].unter, P.FOLGE.offen);
  const eco = P.varianteZeilen({ variante: "Economics" });
  assert.equal(eco[0].aktion, undefined);
  assert.equal(eco[0].rechts, "haken");
  assert.equal(eco[0].unter, P.FOLGE.Economics);
  assert.deepEqual(eco[3].aktion.parameter, { wert: "offen" }, "zurück auf „noch offen“ geht auch");
  // unbekannter oder leerer Wert gilt als „noch offen“
  assert.deepEqual(P.varianteZeilen({ variante: "Jura" }).map((z) => !!z.aktion), [true, true, true, false]);
  assert.deepEqual(P.varianteZeilen({}).map((z) => !!z.aktion), [true, true, true, false]);
});

test("Jede Variante hat einen Text, was daraus folgt", () => {
  for (const v of P.VARIANTEN) assert.ok(P.FOLGE[v], v);
});

test("Obsidian: Einstellungen, Dateien mit ihrer Zahl und der Tresor mit Namen; jede Zeile ruft Obsidians eigenen Befehl", () => {
  const z = nach(P.obsidianZeilen("Studium Autopilot", 1234));
  assert.deepEqual(Object.keys(z), ["einstellungen", "dateien", "tresor"]);
  assert.equal(z.einstellungen.wert, "");
  assert.equal(z.dateien.wert, "1.234");
  assert.equal(z.tresor.wert, "Studium Autopilot");
  for (const id of Object.keys(z)) {
    assert.ok(z[id].symbol, id);
    assert.equal(z[id].rechts, "pfeil", id);
    assert.ok(!z[id].unter, id + ": ohne zweite Zeile");
    assert.deepEqual(z[id].aktion, { aktion: "obsidian", parameter: { ziel: id } }, id);
  }
  // was vorher unten in der Schublade stand: Zahnrad, Umschalter zur Dateiliste, Tresore verwalten (wechseln, umbenennen,
  // löschen; app:switch-vault kann auf iPhone und iPad nur wechseln)
  assert.deepEqual(P.OBSIDIAN, { einstellungen: "app:open-settings", dateien: "file-explorer:open", tresor: "app:open-vault" });
  assert.equal(nach(P.obsidianZeilen("", 0)).dateien.wert, "0");
});

test("Hilfe: oben die Zeile Rundgang, neutral wie die Themen darunter; ein Tipp zeigt ihn noch einmal", () => {
  assert.deepEqual(P.hilfeZeilen(), [{ id: "rundgang", symbol: "kompass", ton: "leise", titel: "Rundgang", wert: "",
    aktion: { aktion: "rundgang", parameter: {} }, rechts: "pfeil" }]);
});
