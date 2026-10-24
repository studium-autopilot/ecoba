// Dateien, die das Update verteilt (klasseVon in update.js), haben LF-Zeilenenden. Befund 24.10.2026: Studienverlauf.md lag mit
// CRLF in der Vorlage; ein Gerät hatte dieselbe Fassung mit LF, und das Update hielt die Seite für selbst geändert. update.js
// vergleicht seitdem ohne Zeilenenden, die Vorlage bleibt trotzdem einheitlich.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { laden } = require("./laden.js");

const VAULT = path.join(__dirname, "..", "Studium Autopilot");
const U = laden("update").ctx.update;

function dateien(ordner, rel, aus) {
  for (const e of fs.readdirSync(ordner, { withFileTypes: true })) {
    if (e.name === ".trash" || e.name === ".git") continue;
    const r = rel ? rel + "/" + e.name : e.name;
    if (e.isDirectory()) dateien(path.join(ordner, e.name), r, aus);
    else if (U.klasseVon(r)) aus.push(r);
  }
  return aus;
}

test("Dateien der Vorlage, die das Update verteilt, haben LF-Zeilenenden", () => {
  const alle = dateien(VAULT, "", []);
  assert.ok(alle.length > 50, "Vorlage gefunden");
  const mitCr = alle.filter((r) => fs.readFileSync(path.join(VAULT, r)).includes(13));
  assert.deepEqual(mitCr, []);
});
