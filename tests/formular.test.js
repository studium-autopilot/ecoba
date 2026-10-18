// Fenster „Neu …“ (formular.js): Felder lesen und prüfen, Vorgaben, die anderen Feldern folgen, versteckte Felder, Antworten in
// Tests (plugin.testAntworten). Das Fenster selbst prüft man in Obsidian (docs/tests.md). Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { laden } = require("./laden.js");

const F = laden("formular").ergebnis;
const hilfen = { datum: (t) => (t === "27.10." ? "2026-10-27" : ""), zeitraum: (t) => (t === "12.11.–15.11." ? { von: "2026-11-12", bis: "2026-11-15" } : null) };

test("Uhrzeit: Doppelpunkt, Punkt, Komma, „Uhr“; nur die Stunde = volle Stunde, mit c.t. Viertel nach", () => {
  assert.equal(F.uhrLesen("10:15"), "10:15");
  assert.equal(F.uhrLesen("9.15"), "09:15");
  assert.equal(F.uhrLesen("9,15"), "09:15");
  assert.equal(F.uhrLesen("14 Uhr"), "14:00");
  assert.equal(F.uhrLesen("14", true), "14:15");
  assert.equal(F.uhrLesen("24:00"), null);
  assert.equal(F.uhrLesen("10:75"), null);
  assert.equal(F.uhrPlus("10:15", 90), "11:45");
  assert.equal(F.uhrPlus("23:00", 90), "23:59", "nicht über Mitternacht");
  assert.equal(F.uhrPlus("", 90), "");
});

test("Felder lesen: Text, Zahl, Datum, Zeitraum, Auswahl; leer und Pflicht", () => {
  assert.deepEqual(F.lesen({ art: "text" }, "  Lerngruppe "), { wert: "Lerngruppe" });
  assert.deepEqual(F.lesen({ art: "text", pflicht: true, fehlt: "Bitte eintragen." }, " "), { fehler: "Bitte eintragen." });
  assert.deepEqual(F.lesen({ art: "zahl" }, "7,5"), { wert: 7.5 });
  assert.deepEqual(F.lesen({ art: "zahl" }, ""), { wert: null });
  assert.ok(F.lesen({ art: "zahl", ganz: true }, "2,5").fehler);
  assert.ok(F.lesen({ art: "zahl", min: 1, max: 30 }, "31").fehler);
  assert.deepEqual(F.lesen({ art: "datum" }, "27.10.", hilfen), { wert: "2026-10-27" });
  assert.deepEqual(F.lesen({ art: "datum" }, "", hilfen), { wert: "" });
  assert.ok(F.lesen({ art: "datum" }, "31.02.", hilfen).fehler);
  assert.deepEqual(F.lesen({ art: "zeitraum" }, "12.11.–15.11.", hilfen), { wert: { von: "2026-11-12", bis: "2026-11-15" } });
  assert.deepEqual(F.lesen({ art: "zeitraum" }, "", hilfen), { wert: { von: "", bis: "" } });
  const auswahl = { art: "auswahl", optionen: [{ wert: "a", text: "A" }, { wert: 2, text: "Zwei" }] };
  assert.deepEqual(F.lesen(auswahl, 1), { wert: 2 });
  assert.deepEqual(F.lesen(auswahl, -1), { wert: null });
  assert.ok(F.lesen(Object.assign({ pflicht: true }, auswahl), -1).fehler);
  assert.ok(F.lesen({ art: "text", muster: /^[A-Z]\d{3}$/ }, "E38").fehler);
});

test("Vorgaben folgen anderen Feldern, versteckte Felder liefern null und werden nicht geprüft", () => {
  const def = { felder: [
    { name: "beginn", art: "uhrzeit", ct: true, vorgabe: "10:15" },
    { name: "ende", art: "uhrzeit", vorgabe: (w) => F.uhrPlus(w.beginn, 90) },
    { name: "teil", art: "auswahl", pflicht: true, optionen: [{ wert: "Schwerpunkt", text: "Schwerpunkt" }, { wert: "Grundstudium", text: "Grundstudium" }], vorgabe: "Schwerpunkt" },
    { name: "bereich", art: "text", pflicht: true, wenn: (w) => w.teil === "Schwerpunkt" },
  ] };
  const a = F.auswerten(def, { beginn: "14", teil: 1 }, hilfen, true);
  assert.deepEqual(a.werte, { beginn: "14:15", ende: "15:45", teil: "Grundstudium", bereich: null });
  assert.deepEqual(a.fehler, {});
  const b = F.auswerten(def, {}, hilfen, true);
  assert.equal(b.werte.ende, "11:45");
  assert.ok(b.fehler.bereich, "sichtbares Pflichtfeld ohne Eingabe");
  const c = F.auswerten(Object.assign({ pruefen: (w) => (w.ende <= w.beginn ? { feld: "ende", fehler: "Ende vor Beginn." } : null) }, def),
    { beginn: "14:00", ende: "13:00", teil: 1 }, hilfen, true);
  assert.deepEqual(c.fehler, { ende: "Ende vor Beginn." });
});

test("Antworten in Tests: null = Esc, Objekt = Eingaben, Auswahl als Wert, Text oder Index; Fehler ins Protokoll", async () => {
  const plugin = { testAntworten: [null, { titel: "B110 · BWL", n: "3" }, { n: "x" }, { titel: { index: 1 } }], testProtokoll: [] };
  const { ctx } = laden("formular", { kontext: { plugin } });
  const def = { titel: "Neu", felder: [
    { name: "titel", art: "auswahl", pflicht: true, optionen: [{ wert: "a", text: "B110 · BWL" }, { wert: "b", text: "B180 · Jahresabschluss" }] },
    { name: "n", art: "zahl", ganz: true, vorgabe: "1" },
  ] };
  assert.equal(await ctx.formular(def), null);
  assert.deepEqual(await ctx.formular(def), { titel: "a", n: 3 });
  assert.equal(await ctx.formular(def), null);
  assert.ok(plugin.testProtokoll[2].fehler.n);
  assert.deepEqual(await ctx.formular(def), { titel: "b", n: 1 });
  assert.equal(plugin.testAntworten.length, 0);
});
