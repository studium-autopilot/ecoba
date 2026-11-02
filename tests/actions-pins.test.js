// Jede Action in .github/workflows/*.yml (und in eigenen Actions unter .github/actions/) ist auf einen Commit festgelegt
// (40 Hexzeichen) und nennt die Version im Kommentar dahinter; eigene Actions mit ./ sind erlaubt. Jeder Checkout lässt das
// Token nicht im Arbeitsordner liegen (persist-credentials: false), solange kein Schritt des Workflows mit dem Token pusht.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const GITHUB = path.join(__dirname, "..", ".github");

function yamlDateien(ordner, aus) {
  if (!fs.existsSync(ordner)) return aus;
  for (const e of fs.readdirSync(ordner, { withFileTypes: true })) {
    const pfad = path.join(ordner, e.name);
    if (e.isDirectory()) yamlDateien(pfad, aus);
    else if (/\.ya?ml$/.test(e.name)) aus.push(pfad);
  }
  return aus;
}

const SHA = /^[\w.-]+\/[\w.-]+(\/[\w./-]+)?@[0-9a-f]{40}$/;
const VERSION = /^# v\d+(\.\d+){0,2}\s*$/;

// Funde je Datei: Liste von Sätzen. Liest die Zeilen, ohne einen YAML-Parser: ein Schritt beginnt mit "- " und reicht bis zur
// nächsten Zeile mit gleicher oder kleinerer Einrückung.
function pruefe(text, name) {
  const zeilen = text.split("\n");
  const funde = [];
  const pusht = /\bgit push\b/.test(text);
  zeilen.forEach((zeile, i) => {
    const m = /^(\s*)(- )?uses:\s*(\S+)(.*)$/.exec(zeile);
    if (!m) return;
    const ziel = m[3];
    const wo = name + ":" + (i + 1) + " " + ziel;
    if (ziel.startsWith("./")) return;
    if (!SHA.test(ziel)) { funde.push(wo + " ist nicht auf einen Commit (40 Hexzeichen) festgelegt"); return; }
    if (!VERSION.test(m[4].trim())) funde.push(wo + " hat keinen Kommentar mit der Version (# vX.Y.Z)");
    if (!/^actions\/checkout@/.test(ziel)) return;
    const einzug = m[2] ? m[1].length : m[1].length - 2;
    let anfang = i;
    while (anfang > 0 && !(zeilen[anfang].search(/\S/) === einzug && zeilen[anfang].slice(einzug, einzug + 2) === "- ")) anfang--;
    let ende = i + 1;
    while (ende < zeilen.length && (zeilen[ende].trim() === "" || zeilen[ende].search(/\S/) > einzug)) ende++;
    const schritt = zeilen.slice(anfang, ende).join("\n");
    if (!pusht && !/^\s*persist-credentials:\s*false\s*$/m.test(schritt)) funde.push(wo + " ohne persist-credentials: false");
  });
  return funde;
}

test("Actions: jede auf einen Commit festgelegt, mit Version im Kommentar; Checkout ohne gespeicherte Zugangsdaten", () => {
  const dateien = yamlDateien(path.join(GITHUB, "workflows"), []).concat(yamlDateien(path.join(GITHUB, "actions"), []));
  assert.ok(dateien.length >= 1, "Workflow gefunden");
  const funde = [];
  let verwendet = 0;
  for (const d of dateien) {
    const text = fs.readFileSync(d, "utf8");
    verwendet += (text.match(/^\s*(- )?uses:/gm) || []).length;
    funde.push(...pruefe(text, path.relative(GITHUB, d).replace(/\\/g, "/")));
  }
  assert.ok(verwendet >= 3, "Actions gefunden");
  assert.deepEqual(funde, []);
});

test("Actions-Prüfung erkennt Tags, fehlende Versionskommentare und Checkouts mit Token", () => {
  const sha = "3d3c42e5aac5ba805825da76410c181273ba90b1";
  const gut = [
    "steps:",
    `  - uses: actions/checkout@${sha} # v7.0.1`,
    "    with:",
    "      persist-credentials: false",
    "      fetch-depth: 0",
    "  - uses: ./.github/actions/eigene",
    `  - name: x`,
    `    uses: actions/setup-node@${sha} # v7.1.0`,
    "",
  ].join("\n");
  assert.deepEqual(pruefe(gut, "gut.yml"), []);
  assert.equal(pruefe(gut.replace(sha + " # v7.0.1", "v4"), "a.yml").length, 1);
  assert.equal(pruefe(gut.replace(" # v7.1.0", ""), "b.yml").length, 1);
  assert.equal(pruefe(gut.replace(" # v7.1.0", " # latest"), "b2.yml").length, 1);
  assert.equal(pruefe(gut.replace("      persist-credentials: false\n", ""), "c.yml").length, 1);
  assert.equal(pruefe(gut.replace("persist-credentials: false", "persist-credentials: true"), "d.yml").length, 1);
  assert.equal(pruefe(gut.replace(sha, sha.slice(1)), "e.yml").length, 1);
  // Der Schritt nach dem Checkout zählt nicht mit: persist-credentials dort rettet den Checkout nicht
  const falsch = gut.replace("      persist-credentials: false\n", "") + "    with:\n      persist-credentials: false\n";
  assert.equal(pruefe(falsch, "f.yml").length, 1);
  // Pusht der Workflow selbst mit dem Token, darf der Checkout es behalten
  assert.deepEqual(pruefe(gut.replace("      persist-credentials: false\n", "") + "  - run: git push\n", "g.yml"), []);
});
