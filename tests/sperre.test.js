// Abrufer-Sperre (sperre.js): ein Schreiber je Funktion, gleiche Regeln wie ilias.js und zentral.js. Läuft ohne Obsidian.
"use strict";
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const S = require(path.join(__dirname, "..", "Studium Autopilot", "System", "Skripte", "sperre.js"));
const { laden } = require("./laden.js");
const EBA = require(path.join(__dirname, "..", "Studium Autopilot", "System", "Skripte", "eba.js"));

const MIN = 60e3;
const PFAD = "System/Daten/test-abruf.json";
// Tresor mit einer Datei, Uhr zum Vorstellen; zaehlt Schreibvorgänge
function welt(start) {
  const t = { m: new Map(), schreiben: 0, uhr: Date.parse(start || "2026-11-02T08:00:00Z") };
  t.io = { lesen: async (p) => (t.m.has(p) ? t.m.get(p) : null), schreiben: async (p, x) => { t.schreiben++; t.m.set(p, x); } };
  t.jetzt = () => new Date(t.uhr);
  t.vor = (ms) => { t.uhr += ms; };
  t.geraet = (id, mobil, mehr) => S.erzeugen(Object.assign({ io: t.io, pfad: PFAD, geraetId: () => id, jetzt: t.jetzt, mobil: !!mobil }, mehr || {}));
  t.inhalt = () => JSON.parse(t.m.get(PFAD));
  return t;
}

test("Vorgaben gleich ilias.js (UEBERNAHME, PULS), damit die Sperren nicht auseinanderlaufen", () => {
  const I = laden("ilias", { kontext: { user: { eba: EBA } } }).ctx.ilias;
  assert.equal(S.K.UEBERNAHME, I.K.UEBERNAHME);
  assert.equal(S.K.PULS, I.K.PULS);
  const t = welt();
  const a = t.geraet("g-a");
  assert.equal(a.uebernahme, 80 * MIN);
  assert.equal(a.pulsMs, 50 * MIN);
  assert.throws(() => S.erzeugen({ pfad: PFAD }), /io/);
  assert.throws(() => S.erzeugen({ io: t.io, quelle: "../x" }), /Quelle/);
});

test("Erstes Gerät nimmt sie, das zweite wartet, nach 80 Min. Stille übernimmt es", async () => {
  const t = welt();
  const a = t.geraet("g-a"), b = t.geraet("g-b");
  assert.deepEqual(await a.pruefen(), { hier: false, anderes: false, darf: true, sperre: null });
  assert.equal(await a.nehmen(), true);
  assert.deepEqual([(await a.pruefen()).hier, (await a.pruefen()).darf], [true, true], "hier = dieses Gerät hält sie");
  assert.equal(t.inhalt().geraet, "g-a");
  assert.equal(t.inhalt().mobil, false);
  const p = await b.pruefen();
  assert.equal(p.hier, false);
  assert.equal(p.anderes, true);
  assert.equal(p.darf, false);
  assert.equal(await b.nehmen(), false, "nicht ohne erzwingen");
  t.vor(80 * MIN);
  assert.equal((await b.pruefen()).anderes, true, "genau 80 Min. still: gilt noch als aktiv");
  t.vor(1);
  assert.equal(await b.nehmen(), true);
  assert.equal(t.inhalt().geraet, "g-b");
});

test("Halter schreibt nur bei Wechsel, frei oder nach dem Puls (nicht bei jedem Lauf)", async () => {
  const t = welt();
  const a = t.geraet("g-a");
  await a.nehmen();
  const seit = t.inhalt().seit;
  assert.equal(t.schreiben, 1);
  t.vor(10 * MIN);
  await a.nehmen();
  assert.equal(t.schreiben, 1, "innerhalb des Pulses kein Schreiben");
  t.vor(41 * MIN);
  await a.nehmen();
  assert.equal(t.schreiben, 2);
  assert.equal(t.inhalt().seit, seit, "seit bleibt beim Halter");
  t.vor(10 * MIN);
  assert.equal(await a.puls(), true);
  assert.equal(t.schreiben, 2, "puls() schreibt erst nach 50 Min.");
});

test("erzwingen holt sie her (Knopf „Hier prüfen“); puls() merkt die Übernahme", async () => {
  const t = welt();
  const a = t.geraet("g-a"), b = t.geraet("g-b");
  await a.nehmen();
  assert.equal(await b.nehmen({ erzwingen: true }), true);
  assert.equal(t.inhalt().geraet, "g-b");
  assert.equal(await a.puls(), false, "a hat sie verloren: Lauf beenden");
  assert.equal(t.inhalt().geraet, "g-b");
});

test("freigeben: frei: true, ein anderes Gerät übernimmt sofort; fremde Sperre gibt man nicht frei", async () => {
  const t = welt();
  const a = t.geraet("g-a"), b = t.geraet("g-b");
  await a.nehmen();
  assert.equal(await b.freigeben(), false);
  assert.equal(await a.freigeben(), true);
  assert.equal(t.inhalt().frei, true);
  assert.equal((await a.pruefen()).hier, false, "frei gehört niemandem");
  assert.equal((await b.pruefen()).darf, true);
  assert.equal(await b.nehmen(), true);
  assert.equal(t.inhalt().frei, undefined);
  // erzwingen (ILIAS gibt verwaiste Gruppen frei): ein Schreibvorgang, danach frei auf diesem Gerät
  const n = t.schreiben;
  assert.equal(await a.freigeben({ erzwingen: true }), true);
  assert.equal(t.schreiben, n + 1);
  assert.deepEqual([t.inhalt().geraet, t.inhalt().frei], ["g-a", true]);
});

test("computerVorrang: ein Computer löst ein iPhone sofort ab, nie umgekehrt; ohne Vorrang nicht", async () => {
  const t = welt();
  const handy = t.geraet("g-handy", true, { computerVorrang: true }), pc = t.geraet("g-pc", false, { computerVorrang: true });
  await handy.nehmen();
  assert.equal(t.inhalt().mobil, true);
  assert.equal((await pc.pruefen()).darf, true);
  assert.equal(await pc.nehmen(), true);
  assert.equal(t.inhalt().geraet, "g-pc");
  assert.equal((await handy.pruefen()).darf, false, "das iPhone verdrängt den Computer nicht");
  const t2 = welt();
  await t2.geraet("g-handy", true).nehmen();
  assert.equal((await t2.geraet("g-pc", false).pruefen()).darf, false, "ohne computerVorrang gilt die normale Regel");
});

test("Unlesbare oder fremde Datei gilt als keine Sperre; Lesefehler auch", async () => {
  const t = welt();
  t.m.set(PFAD, "{ halb geschrieb");
  assert.equal((await t.geraet("g-a").pruefen()).darf, true);
  t.m.set(PFAD, JSON.stringify({ geraet: 7 }));
  assert.equal((await t.geraet("g-a").pruefen()).sperre, null);
  const kaputt = S.erzeugen({ io: { lesen: async () => { throw new Error("weg"); }, schreiben: async () => {} }, pfad: PFAD, geraetId: () => "g-a", jetzt: () => 0 });
  assert.equal((await kaputt.pruefen()).darf, true);
  assert.deepEqual(S.lesenAus('{"geraet":"g-x","seit":"a","zuletzt":"b","mobil":true,"frei":true,"name":"x"}'),
    { geraet: "g-x", seit: "a", zuletzt: "b", mobil: true, frei: true }, "nur bekannte Felder");
});

test("Bibliothek: kein Netz, keine Zeitgeber beim Laden; Aufruf über ctx.user.sperre", () => {
  let n = 0;
  const z = () => { n++; return 0; };
  const r = laden("sperre", { kontext: { zeit: z, intervall: z } }).ergebnis;
  assert.equal(n, 0);
  assert.equal(typeof r.erzeugen, "function");
  assert.deepEqual(r.K, S.K);
});

test("Quelle als Schlüssel: Datei System/Daten/<quelle>-abruf.json; weitere Felder der Datei bleiben (z. B. angewendet)", async () => {
  const t = welt();
  assert.equal(S.pfadVon("alma-konto"), "System/Daten/alma-konto-abruf.json");
  assert.throws(() => S.pfadVon("Alma Konto"), /Quelle/);
  const a = S.erzeugen({ io: t.io, quelle: "ilias-kalender", geraetId: () => "g-a", jetzt: t.jetzt });
  assert.equal(a.pfad, "System/Daten/ilias-kalender-abruf.json");
  await a.nehmen();
  assert.equal(JSON.parse(t.m.get("System/Daten/ilias-kalender-abruf.json")).geraet, "g-a");
  // zentrale Daten: abruf.json trägt zusätzlich „angewendet“ – bleibt beim Nehmen, Puls und Freigeben
  t.m.set("System/Daten/abruf.json", JSON.stringify({ geraet: "g-alt", seit: "2026-10-01T00:00:00.000Z", zuletzt: "2026-10-01T00:00:00.000Z", angewendet: { x: "h1" } }));
  const z = S.erzeugen({ io: t.io, pfad: "System/Daten/abruf.json", geraetId: () => "g-a", jetzt: t.jetzt });
  assert.equal(await z.nehmen(), true, "alte Sperre: übernehmen");
  assert.deepEqual(JSON.parse(t.m.get("System/Daten/abruf.json")).angewendet, { x: "h1" });
  t.vor(60 * MIN);
  await z.puls();
  await z.freigeben();
  const o = JSON.parse(t.m.get("System/Daten/abruf.json"));
  assert.deepEqual([o.geraet, o.frei, o.angewendet], ["g-a", true, { x: "h1" }]);
});
