// Darstellung (darstellung.js): Umschalter Hell · Dunkel · Automatisch, je Gerät. Mit einem Ersatz für Obsidians Einstellung
// „theme“, den Gerätespeicher, die CSS-Bausteine und die Klassen am body. Läuft ohne Obsidian.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { laden } = require("./laden.js");

// body mit classList (contains, toggle) wie im Browser
const body = (dunkel) => {
  const k = new Set([dunkel ? "theme-dark" : "theme-light"]);
  return { k, classList: { contains: (n) => k.has(n), toggle: (n, an) => { if (an) k.add(n); else k.delete(n); } } };
};
// Ersatz für app.vault.getConfig("theme"), app.changeTheme, Gerätespeicher und app.customCss; protokolliert, was geschah
const mitObsidian = (theme, an, { gespeichert = null, dunkel = false } = {}) => {
  const { ctx } = laden("darstellung");
  const app = ctx.app, log = [], speicher = new Map();
  if (gespeichert) speicher.set("eba-darstellung", gespeichert);
  const enabledSnippets = new Set(an);
  global.document = { body: body(dunkel) };
  app.vault.getConfig = (k) => (k === "theme" ? theme : undefined);
  app.changeTheme = (t) => { log.push("theme " + t); };
  app.loadLocalStorage = (k) => (speicher.has(k) ? speicher.get(k) : null);
  app.saveLocalStorage = (k, v) => { speicher.set(k, v); log.push("gerät " + v); };
  app.workspace.trigger = (e) => { log.push(e); };
  app.customCss = { enabledSnippets, setCssEnabledStatus: (n, ein) => { if (ein) enabledSnippets.add(n); else enabledSnippets.delete(n); log.push((ein ? "an " : "aus ") + n); } };
  return { D: ctx.darstellung, log, enabledSnippets, speicher, klassen: () => [...global.document.body.k] };
};
test.after(() => { delete global.document; });

test("Obsidians Wert wird zu hell, dunkel oder automatisch; Unbekanntes gilt wie bei Obsidian als hell", () => {
  const { D } = mitObsidian("moonstone", []);
  assert.equal(D.modusAus("moonstone"), "hell");
  assert.equal(D.modusAus("obsidian"), "dunkel");
  assert.equal(D.modusAus("system"), "automatisch");
  assert.equal(D.modusAus(undefined), "hell");
  assert.equal(D.modusAus("bunt"), "hell");
});

test("Was gilt: die Wahl dieses Geräts, sonst Obsidians Einstellung", () => {
  assert.equal(mitObsidian("system", []).D.modus(), "automatisch");
  assert.equal(mitObsidian("moonstone", [], { gespeichert: "dunkel" }).D.modus(), "dunkel");
  assert.equal(mitObsidian("obsidian", [], { gespeichert: "bunt" }).D.modus(), "dunkel", "Unbekanntes im Speicher zählt nicht");
});

test("Automatisch folgt dem Gerät, Hell und Dunkel nicht", () => {
  const { D } = mitObsidian("system", []);
  assert.equal(D.dunkelFuer("dunkel", false), true);
  assert.equal(D.dunkelFuer("hell", true), false);
  assert.equal(D.dunkelFuer("automatisch", true), true);
  assert.equal(D.dunkelFuer("automatisch", false), false);
});

test("Umschalter: drei Teile ohne Untertexte, genau einer an", () => {
  const { D } = mitObsidian("obsidian", []);
  assert.deepEqual(D.segmente("dunkel"), [
    { wert: "hell", titel: "Hell", an: false },
    { wert: "dunkel", titel: "Dunkel", an: true },
    { wert: "automatisch", titel: "Automatisch", an: false },
  ]);
});

test("Wählen gilt nur auf diesem Gerät: Obsidians synchronisierte Einstellung bleibt, die Klassen wechseln sofort", () => {
  const o = mitObsidian("moonstone", ["eba-core", "eba-paper-tuebingen"]);
  assert.equal(o.D.setzen(" Dunkel ").wert, "dunkel");
  assert.equal(o.speicher.get("eba-darstellung"), "dunkel");
  assert.deepEqual(o.klassen(), ["theme-dark"]);
  assert.ok(o.enabledSnippets.has("eba-paper-elfenbein") && !o.enabledSnippets.has("eba-paper-tuebingen"), "Farbschema gesichert");
  assert.ok(!o.log.some((x) => x.startsWith("theme ")), "appearance.json wird nie geschrieben");
  assert.ok(o.log.includes("css-change"));
});

test("Durchsetzen: schaltet Obsidian nach seiner Einstellung um, stellt anwenden() die Wahl wieder her, ohne Schleife", () => {
  const o = mitObsidian("moonstone", ["eba-core", "eba-paper-elfenbein"], { gespeichert: "dunkel" });
  assert.equal(o.D.anwenden(), true);
  assert.deepEqual(o.klassen(), ["theme-dark"]);
  assert.equal(o.D.anwenden(), false, "schon richtig: kein zweites css-change");
  assert.equal(o.log.filter((x) => x === "css-change").length, 1);
  const ohne = mitObsidian("obsidian", [], { dunkel: true });
  assert.equal(ohne.D.anwenden(), false, "ohne Wahl auf dem Gerät entscheidet Obsidian");
  assert.deepEqual(ohne.klassen(), ["theme-dark"]);
});

test("Unbekanntes ändert nichts, das Farbschema wird nur bei Bedarf eingeschaltet", () => {
  const o = mitObsidian("system", ["eba-core", "eba-paper-elfenbein"]);
  assert.equal(o.D.setzen("bunt"), null);
  assert.equal(o.D.setzen(""), null);
  assert.deepEqual(o.log, []);
  assert.equal(o.D.schemaSichern(), false);
});
