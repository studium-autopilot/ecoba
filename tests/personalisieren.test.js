// Einstellungen & Hilfe (personalisieren.js): Inhalt der Zeilen „Deine Angaben“ (mit der Variante) und „Obsidian“. Läuft ohne Obsidian.
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
  assert.deepEqual(Object.keys(z), ["name", "studienbeginn", "variante", "zielnote", "einrichtung"]);
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

test("Variante: eine Zeile unter „Deine Angaben“, nur die gewählte; offen heißt „Wählen“, ein Tipp öffnet die Auswahl", () => {
  const offen = nach(P.angabenZeilen({ variante: "offen" }, { status: "offen", uebersprungen: [] })).variante;
  assert.equal(offen.titel, "Variante");
  assert.equal(offen.wert, "Wählen");
  assert.equal(offen.ton, "leise");
  assert.ok(offen.symbol);
  assert.ok(!offen.unter);
  assert.equal(offen.rechts, "pfeil");
  assert.deepEqual(offen.aktion, { aktion: "variante", parameter: {} }, "ohne Wert: die Auswahl");
  const eco = nach(P.angabenZeilen({ variante: "ohne Spezialisierung" }, { status: "offen", uebersprungen: [] })).variante;
  assert.equal(eco.wert, "Ohne Spezialisierung");
  assert.equal(eco.ton, "akzent");
  // unbekannter oder leerer Wert gilt als „noch offen“
  assert.equal(nach(P.angabenZeilen({ variante: "Jura" }, { status: "offen", uebersprungen: [] })).variante.wert, "Wählen");
  assert.equal(nach(P.angabenZeilen({}, { status: "offen", uebersprungen: [] })).variante.wert, "Wählen");
});

test("Obsidian: Einstellungen und der Tresor mit Namen, keine Dateiliste; jede Zeile ruft Obsidians eigenen Befehl", () => {
  const z = nach(P.obsidianZeilen("Studium Autopilot"));
  // Ohne „Dateien“ (Rückmeldung vom 01.11.2026: „Sidebar shouldn't be visible in this vault“): die Zeile öffnete Obsidians linke Seitenleiste
  assert.deepEqual(Object.keys(z), ["einstellungen", "tresor"]);
  assert.equal(z.einstellungen.wert, "");
  assert.equal(z.tresor.wert, "Studium Autopilot");
  for (const id of Object.keys(z)) {
    assert.ok(z[id].symbol, id);
    assert.equal(z[id].rechts, "pfeil", id);
    assert.ok(!z[id].unter, id + ": ohne zweite Zeile");
    assert.deepEqual(z[id].aktion, { aktion: "obsidian", parameter: { ziel: id } }, id);
  }
  // was vorher unten in der Schublade stand: Zahnrad, Tresore verwalten (wechseln, umbenennen, löschen; app:switch-vault kann
  // auf iPhone und iPad nur wechseln)
  assert.deepEqual(P.OBSIDIAN, { einstellungen: "app:open-settings", tresor: "app:open-vault" });
  assert.ok(!Object.values(P.OBSIDIAN).some((b) => /file-explorer|sidebar/.test(b)), "keine Zeile öffnet eine Seitenleiste");
});

test("Hilfe: oben die Zeile Rundgang, neutral wie die Themen darunter; ein Tipp zeigt ihn noch einmal; Widgets nur auf iPhone und iPad", () => {
  assert.deepEqual(P.hilfeZeilen(), [{ id: "rundgang", symbol: "kompass", ton: "leise", titel: "Rundgang", wert: "",
    aktion: { aktion: "rundgang", parameter: {} }, rechts: "pfeil" }]);
  assert.deepEqual(P.hilfeZeilen(true)[1], { id: "widget", symbol: "widget", ton: "leise", titel: "Widgets", wert: "",
    aktion: { aktion: "widget", parameter: {} }, rechts: "pfeil" });
});
