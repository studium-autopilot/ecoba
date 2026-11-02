// Aktionen von außen (main.js, aktionAusfuehren): Ein Link aus dem Browser oder einer anderen App kommt über den Protokoll-Handler
// (obsidian://studium-autopilot?aktion=…) und trägt c.extern = true; Klicks in einer Notiz (klickAbfangen), ctx.aktion und Befehle
// tragen false. Aktionen, die etwas Riskantes tun, fragen damit nach oder lehnen ab (docs/architektur/aktionen.md). Nur eigene
// Aktionen zählen, keine Namen wie „constructor“. Der Kern läuft mit einem Tresor im Speicher (tests/kern.js). Läuft ohne
// Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const nc = require("node:crypto");
const K = require("./kern.js");
const S = require("./signatur.js");

const SCHLUESSEL = S.schluesselBauen();
const PROBE = "module.exports = function (ctx) { return { aktionen: { probe: { titel: \"Probe\", ausfuehren: (c) => " +
  "{ (ctx.plugin.extern = ctx.plugin.extern || []).push(c.extern); return c.extern; } } } }; };\n";
// Tresor mit dem einen Skript und seiner signierten Liste (der Kern lädt nur geprüfte Skripte)
const dateien = () => {
  const liste = JSON.stringify({ schema: 1, version: "1.2.3", ordner: "Studium Autopilot", dateien: [{ pfad: "System/Skripte/probe.js",
    klasse: "system", groesse: Buffer.byteLength(PROBE), sha256: nc.createHash("sha256").update(PROBE).digest("hex") }] }) + "\n";
  return { "System/Skripte/probe.js": PROBE, "System/Daten/system-dateien.json": liste,
    "System/Daten/system-dateien.json.sig": S.signieren(new TextEncoder().encode(liste), SCHLUESSEL) };
};
const bis = async (fn, was) => { for (let i = 0; i < 400; i++) { if (fn()) return; await new Promise((r) => setTimeout(r, 5)); } assert.fail("nicht eingetreten: " + was); };

test("c.extern: true nur für einen Link von außen (Protokoll-Handler), false für Klicks in der App, ctx.aktion und Befehle", async () => {
  const x = K.aufbau({ version: "1.2.3", schluessel: [SCHLUESSEL.oeffentlich], dateien: dateien() });
  await x.start();
  try {
    x.protokoll({ aktion: "probe", extern: "0" });
    await bis(() => (x.k.extern || []).length === 1, "von außen; ein Parameter extern zählt nicht");
    // Klick in einer Notiz (klickAbfangen, Capture auf document), auch mit extern=1 im Link
    const klick = x.k.ersatzDom.find((d) => d.typ === "click");
    const a = { getAttribute: () => "obsidian://studium-autopilot?aktion=probe&extern=1", closest: () => null };
    klick.fn({ target: { closest: () => a }, preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} });
    await bis(() => (x.k.extern || []).length === 2, "Klick");
    assert.equal(await x.k.ctx.aktion("probe", {}), false, "ctx.aktion");
    assert.equal(await x.k.aktionAusfuehren("probe", {}, { extern: "ja" }), false, "nur genau true");
    x.befehl("aktion-probe");
    await bis(() => (x.k.extern || []).length === 5, "Befehl");
    assert.deepEqual(x.k.extern, [true, false, false, false, false]);
    assert.equal(x.k.ctx.extern, false, "Vorgabe im ctx");
  } finally { x.weg(); }
});

test("Ein Link nennt nur eigene Aktionen: Namen aus dem Objekt-Prototyp sind keine", async () => {
  const x = K.aufbau({ version: "1.2.3", schluessel: [SCHLUESSEL.oeffentlich], dateien: dateien() });
  await x.start();
  try {
    for (const aktion of ["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"]) {
      assert.equal(await x.k.aktionAusfuehren(aktion, { aktion }, { extern: true }), undefined, aktion);
    }
    assert.ok(x.texte().length === 5 && x.texte().every((t) => t === "Dieser Knopf geht gerade nicht. Bitte kurz warten oder Obsidian neu starten."), x.texte().join(" | "));
  } finally { x.weg(); }
});
