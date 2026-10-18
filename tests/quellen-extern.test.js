// Quellen außerhalb des Plugins (eba.js, quelleExtern und quellenExtern): ausdrückliche Liste „quellen_extern“ in den
// Einstellungen, sonst beim eigenen Uni-Abgleich alles außer den Übungsgruppen, sonst nichts. Läuft ohne Obsidian.
"use strict";
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const EBA = require(path.join(__dirname, "..", "Studium Autopilot", "System", "Skripte", "eba.js"));
const ALLE = ["stundenplan", "ilias-dateien", "ilias-gruppen", "ilias-kalender", "alma-konto", "volltext"];
const OHNE_GRUPPEN = ALLE.filter((q) => q !== "ilias-gruppen");
const nichts = () => false;
const mitAbgleich = (p) => p === "System/Skripte/abgleich.js";

test("Schlüssel: sechs Quellen, fest", () => {
  assert.deepEqual(Array.from(EBA.QUELLEN), ALLE);
  assert.throws(() => { "use strict"; EBA.QUELLEN.push("mail"); }, TypeError);
});

test("Ohne Liste: ohne eigenen Abgleich nichts extern, mit ihm alles außer den Übungsgruppen", () => {
  assert.deepEqual(EBA.quellenExtern(nichts, {}), []);
  assert.deepEqual(EBA.quellenExtern(nichts, null), []);
  for (const q of ALLE) assert.equal(EBA.quelleExtern(q, nichts, {}), false, q);
  for (const [fall, existiert, einstellungen] of [
    ["abgleich.js im Tresor", mitAbgleich, {}],
    ["ilias_unterlagen: extern", nichts, { ilias_unterlagen: " Extern " }],
  ]) {
    assert.deepEqual(EBA.quellenExtern(existiert, einstellungen), OHNE_GRUPPEN, fall);
    assert.equal(EBA.quelleExtern("ilias-gruppen", existiert, einstellungen), false, fall + ": Übungsgruppen prüft das Plugin");
    assert.equal(EBA.quelleExtern("ilias-dateien", existiert, einstellungen), true, fall);
    assert.equal(EBA.quelleExtern("stundenplan", existiert, einstellungen), true, fall);
  }
  // „quellen_extern:“ ohne Wert (YAML null) oder leerer Text gilt als nicht gesetzt
  assert.deepEqual(EBA.quellenExtern(mitAbgleich, { quellen_extern: null }), OHNE_GRUPPEN);
  assert.deepEqual(EBA.quellenExtern(mitAbgleich, { quellen_extern: "  " }), OHNE_GRUPPEN);
});

test("Ausdrückliche Liste entscheidet, auch leer; Schreibweise egal, Unbekanntes zählt nicht", () => {
  assert.deepEqual(EBA.quellenExtern(mitAbgleich, { quellen_extern: [] }), [], "leere Liste: nichts extern, trotz abgleich.js");
  assert.deepEqual(EBA.quellenExtern(mitAbgleich, { quellen_extern: ["volltext"] }), ["volltext"]);
  assert.deepEqual(EBA.quellenExtern(nichts, { quellen_extern: [" ILIAS-Gruppen ", "alma-konto", "mail", 42, null] }), ["ilias-gruppen", "alma-konto"]);
  assert.deepEqual(EBA.quellenExtern(nichts, { quellen_extern: "volltext, ilias-dateien" }), ["ilias-dateien", "volltext"], "Text mit Kommas");
  assert.deepEqual(EBA.quellenExtern(nichts, { quellen_extern: ALLE.slice().reverse() }), ALLE, "Reihenfolge wie QUELLEN");
  assert.equal(EBA.quelleExtern("ilias-gruppen", mitAbgleich, { quellen_extern: ALLE }), true, "Liste mit Übungsgruppen");
  assert.equal(EBA.quelleExtern("mail", nichts, { quellen_extern: ["mail"] }), false, "unbekannter Schlüssel");
});

test("Fehler beim Nachsehen: nichts extern statt Absturz", () => {
  const kaputt = () => { throw new Error("Tresor nicht bereit"); };
  assert.deepEqual(EBA.quellenExtern(kaputt, {}), []);
  assert.equal(EBA.quelleExtern("volltext", kaputt, {}), false);
  const kaputteEinstellungen = { get quellen_extern() { throw new Error("kaputt"); } };
  assert.deepEqual(EBA.quellenExtern(nichts, kaputteEinstellungen), []);
  assert.equal(EBA.quelleExtern("volltext", nichts, kaputteEinstellungen), false);
});

// ---------- Gemischte Fassungen (Sync liefert Skripte einzeln; eba.js bis 0.4.4 kennt nur eigenerAbgleich) ----------
const Q = require(path.join(__dirname, "..", "Studium Autopilot", "System", "Skripte", "quellen.js"));
const { laden } = require("./laden.js");
const fs = require("node:fs");
// eba.js aus 0.4.4: nur eigenerAbgleich (dieselbe Regel wie heute: abgleich.js im Tresor oder ilias_unterlagen: extern)
const EBA_044 = { eigenerAbgleich: EBA.eigenerAbgleich };
// Sicht eines Geräts mit 0.4.4 (zentral.js, ilias.js, verbindungen.js aus 0.4.4): Stundenplan und ILIAS-Dateien kommen beim eigenen
// Abgleich von außen, die Übungsgruppen nie; die Quellen seit 0.4.5 kennt es nicht (es schreibt sie also nie)
const SICHT_044 = { stundenplan: true, "ilias-dateien": true, "ilias-gruppen": false };
const FAELLE = [
  ["nichts", nichts, {}], ["abgleich.js", mitAbgleich, {}], ["ilias_unterlagen: extern", nichts, { ilias_unterlagen: "extern" }],
  ["Liste leer", mitAbgleich, { quellen_extern: [] }], ["Liste volltext", nichts, { quellen_extern: ["volltext"] }],
  ["Liste als Text", mitAbgleich, { quellen_extern: "Stundenplan, ilias-gruppen" }], ["Liste null", mitAbgleich, { quellen_extern: null }],
  ["Liste alle", nichts, { quellen_extern: ALLE }],
];

test("Gemischte Fassungen: quellen.js extern entscheidet mit eba.js aus 0.4.4 genau wie eba.quelleExtern", () => {
  for (const [fall, existiert, einstellungen] of FAELLE) for (const q of ALLE) {
    const soll = EBA.quelleExtern(q, existiert, einstellungen);
    assert.equal(Q.extern(EBA, q, existiert, einstellungen), soll, fall + ": " + q);
    assert.equal(Q.extern(EBA_044, q, existiert, einstellungen), soll, fall + ": " + q + " (eba.js aus 0.4.4)");
  }
  assert.equal(Q.extern(null, "volltext", mitAbgleich, {}), false, "ohne eba.js nichts extern");
  assert.equal(Q.extern(EBA_044, "volltext", () => { throw new Error("Tresor nicht bereit"); }, {}), false);
});

test("Gerät mit 0.4.4 und Gerät mit 0.4.6 im selben Tresor: ohne Liste dieselbe Entscheidung je Quelle", () => {
  for (const [fall, existiert, einstellungen] of FAELLE.filter((f) => !("quellen_extern" in f[2]) || f[2].quellen_extern == null)) {
    const eigener = EBA.eigenerAbgleich(existiert, einstellungen);
    for (const q of Object.keys(SICHT_044)) {
      assert.equal(EBA.quelleExtern(q, existiert, einstellungen), SICHT_044[q] && eigener, fall + ": " + q);
      assert.equal(Q.extern(EBA_044, q, existiert, einstellungen), SICHT_044[q] && eigener, fall + ": " + q + " (neue Skripte, alte eba.js)");
    }
  }
});

test("Neue Skripte mit eba.js aus 0.4.4 und eigenem Abgleich: Alma-Stundenplan und Volltext bleiben aus", async () => {
  let abrufe = 0;
  const A = laden("alma", {
    frontmatter: { "System/Einstellungen.md": {}, "System/Skripte/abgleich.js": {} },
    kontext: { user: { eba: Object.assign({ MODULCODE: "[A-Z]{1,4}[0-9][0-9X]{2}[A-Z]?" }, EBA_044) }, plugin: { testAbruf: async () => { abrufe++; return { status: 200, text: "" }; } } },
  }).ergebnis;
  assert.equal(await A.aktualisieren({ automatisch: true }), null);
  assert.equal(A.status().zustand, "extern");
  assert.equal(abrufe, 0);
  const V = laden("volltext").ctx.volltext;
  assert.equal(V.quelleExternAus(EBA_044, mitAbgleich, {}, Q), true);
  assert.equal(V.quelleExternAus(EBA_044, nichts, {}, Q), false);
  assert.equal(V.quelleExternAus(EBA_044, nichts, { quellen_extern: ["volltext"] }, Q), true);
});

test("Kein Skript fragt eba.quelleExtern ohne quellen.js extern (sonst gilt mit alter eba.js „vom Plugin“)", () => {
  const ordner = path.join(__dirname, "..", "Studium Autopilot", "System", "Skripte");
  for (const n of fs.readdirSync(ordner).filter((x) => /\.js$/.test(x) && x !== "eba.js" && x !== "quellen.js")) {
    const t = fs.readFileSync(path.join(ordner, n), "utf8");
    if (/\.quelleExtern\(/.test(t)) assert.match(t, /\.extern\(eba, /, n);
  }
});
