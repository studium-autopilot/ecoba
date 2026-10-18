// Menü „Übersicht“ (menue.js, ZIELE als einzige Liste): Lesezeichen der Vorlage folgen den Zielen, jedes Ziel ist eine Seite der
// Vorlage mit eigenem Symbol, das Menü steht auf allen Geräten in der Kopfleiste jeder Notiz. Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const VAULT = path.join(__dirname, "..", "Studium Autopilot");
const { ZIELE } = require(path.join(VAULT, "System", "Skripte", "menue.js"));
const pfadVon = (z) => (z === "Dashboard" ? "Dashboard.md" : `Studium/${z}.md`);

test("Ziele: Dashboard zuerst, Stundenplan dabei, jede Seite gibt es in der Vorlage", () => {
  assert.equal(ZIELE[0], "Dashboard", "„Dashboard“ ist der Weg zurück zum Start");
  assert.ok(ZIELE.indexOf("Stundenplan") >= 0);
  for (const z of ZIELE) assert.ok(fs.existsSync(path.join(VAULT, pfadVon(z))), z);
});

test("Lesezeichen der Vorlage = Ziele des Menüs (ohne den Lernplan, den es nur mit KI gibt)", () => {
  const b = JSON.parse(fs.readFileSync(path.join(VAULT, ".obsidian", "bookmarks.json"), "utf8"));
  const soll = ZIELE.filter((z) => z !== "Lernplan");
  assert.deepEqual(b.items.map((x) => x.title), soll);
  assert.deepEqual(b.items.map((x) => x.path), soll.map(pfadVon));
});

test("Jedes Ziel hat ein eigenes Symbol in eba-core.css", () => {
  const css = fs.readFileSync(path.join(VAULT, ".obsidian", "snippets", "eba-core.css"), "utf8");
  const symbole = ZIELE.map((z) => {
    const m = css.match(new RegExp(`li:has\\(> a\\[data-href\\$="${z.replace(/[&]/g, "\\$&")}"\\]\\)\\s*\\{\\s*--eba-icon:\\s*(url\\("[^"]+"\\))`));
    assert.ok(m, "Symbol für " + z);
    return m[1];
  });
  assert.equal(new Set(symbole).size, symbole.length, "keine zwei Ziele mit demselben Symbol");
});

test("Menü in der Kopfleiste jeder Notiz auf allen Geräten, kein zweites im Seitenkopf", () => {
  const code = fs.readFileSync(path.join(VAULT, "System", "Skripte", "menue.js"), "utf8");
  assert.match(code, /addAction\(/);
  assert.doesNotMatch(code, /Platform\.isMobile|ebaMenueKopfImmer|createEl\("button", \{ cls: "eba-menue-knopf"/);
});
