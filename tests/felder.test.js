// Feld-Register (felder.js): Variante, Studienbeginn, Note und Zielnote an einer Stelle beschrieben; Einrichtung, Formular,
// Zeilen „Variante“, Befehl und Modulfeld nutzen dieselben Werte, Wörter und Prüfungen. Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { laden } = require("./laden.js");

const F = require(path.join(__dirname, "..", "Studium Autopilot", "System", "Skripte", "felder.js"));

test("Variante: Werte in einer Reihenfolge, Titel, im Satz, Unbekanntes gilt als offen", () => {
  assert.deepEqual(F.VARIANTE.werte, ["Economics", "Business Administration", "ohne Spezialisierung", "offen"]);
  assert.equal(F.varianteLesen({ variante: "Economics" }), "Economics");
  assert.equal(F.varianteLesen({ variante: "BWL" }), "offen");
  assert.equal(F.varianteLesen({}), "offen");
  assert.deepEqual(F.VARIANTE.werte.map(F.varianteTitel), ["Economics", "Business Administration", "Ohne Spezialisierung", "Noch offen"]);
  assert.deepEqual(F.VARIANTE.werte.map(F.varianteImSatz), ["Economics", "Business Administration", "ohne Spezialisierung", "noch offen"]);
  assert.equal(F.varianteFinden("noch offen"), "offen");
  assert.equal(F.varianteFinden("OHNE SPEZIALISIERUNG"), "ohne Spezialisierung");
  assert.equal(F.varianteFinden("BWL"), null);
});

test("Studienbeginn: Datum oder leer (= aktuelles Semester, wandert mit)", () => {
  assert.equal(F.studienbeginnLesen({ studienbeginn: "2026-10-12" }), "2026-10-12");
  assert.equal(F.studienbeginnLesen({ studienbeginn: "irgendwann" }), "");
  assert.equal(F.studienbeginnLeerTitel("WS 2026/27"), "Aktuelles Semester (WS 2026/27)");
  assert.equal(F.studienbeginnLeerTitel(""), "Aktuelles Semester");
});

test("Note und Zielnote: eine Prüfung je Feld, gespeichert mit Komma", () => {
  for (const n of ["1,0", "1,3", "1.7", "4,0", "5,0"]) assert.equal(F.notePruefen(n).ok, true, n);
  for (const n of ["0,7", "5,3", "6,0", "1", "1,33", "gut"]) assert.equal(F.notePruefen(n).ok, false, n);
  assert.deepEqual(F.notePruefen("1.7"), { ok: true, wert: "1,7" });
  assert.deepEqual(F.notePruefen(""), { ok: true, wert: "" });
  assert.deepEqual(F.zielnotePruefen("2"), { ok: true, wert: "2,0" });
  assert.deepEqual(F.zielnotePruefen("1.75"), { ok: true, wert: "1,75" });
  assert.equal(F.zielnotePruefen("4,5").ok, false);
  assert.equal(F.zielnotePruefen("5").ok, false);
  assert.deepEqual(F.zielnotePruefen(""), { ok: true, wert: "" });
});

test("Alle Stellen nehmen das Register: Formular, Zeilen „Variante“, Einrichtung, Modulfeld", () => {
  const OBS = { obsidian: { Modal: class {}, Notice: class {} } };
  const P = laden("personalisieren", { kontext: OBS }).ctx.personalisieren;
  assert.deepEqual(P.VARIANTEN, F.VARIANTE.werte, "Formular in derselben Reihenfolge");
  assert.deepEqual(P.varianteZeilen({ variante: "offen" }).map((z) => z.titel), ["Economics", "Business Administration", "Ohne Spezialisierung", "Noch offen"]);
  assert.equal(P.zielnotePruefen("2").wert, "2,0");
  const E = laden("einrichtung", { kontext: OBS }).ctx.einrichtung;
  assert.deepEqual(E.VARIANTEN.map((v) => [v.wert, v.titel]), F.VARIANTE.werte.map((w) => [w, F.varianteTitel(w)]), "Einrichtung: „Noch offen“ statt eigenem Wort");
  const M = laden("modul").ergebnis;
  assert.equal(M.noteOk("1.7"), true);
  assert.equal(M.noteOk(""), false);
});

test("Einrichtung lädt auch, wenn felder.js noch fehlt (Update über den Sync), und liest die Varianten danach", () => {
  const r = laden("einrichtung", { kontext: { obsidian: { Modal: class {}, Notice: class {} }, user: { felder: undefined } } });
  r.ctx.user.felder = F;
  assert.deepEqual(r.ctx.einrichtung.VARIANTEN.map((v) => v.wert), F.VARIANTE.werte);
});
