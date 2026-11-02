// Die CI installiert ihre Werkzeuge nur mit festen Versionen und Prüfsummen: Ruff aus .github/requirements-ci.txt mit
// pip --require-hashes, esbuild aus package.json und package-lock.json mit npm ci. Dieser Test hält das fest, damit ein
// späterer Umbau der Workflows nicht stillschweigend wieder ungesichert installiert.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const WURZEL = path.join(__dirname, "..");
const lesen = (rel) => fs.readFileSync(path.join(WURZEL, rel), "utf8");
const WORKFLOW = lesen(".github/workflows/pruefen.yml");

// Anforderungen einer requirements-Datei: Zeilen mit \ am Ende gehören zusammen, Kommentare und Leerzeilen entfallen.
function anforderungen(text) {
  const zeilen = [];
  let offen = "";
  for (const roh of text.split("\n")) {
    const zeile = roh.trim();
    if (!offen && (zeile === "" || zeile.startsWith("#"))) continue;
    if (zeile.endsWith("\\")) { offen += zeile.slice(0, -1) + " "; continue; }
    zeilen.push((offen + zeile).trim());
    offen = "";
  }
  assert.equal(offen, "", "Die Datei endet nicht mitten in einer fortgesetzten Zeile");
  return zeilen;
}

test("requirements-ci.txt: jede Anforderung hat eine feste Version und Prüfsummen", () => {
  const liste = anforderungen(lesen(".github/requirements-ci.txt"));
  assert.ok(liste.length >= 1);
  for (const eintrag of liste) {
    const teile = eintrag.split(/\s+/);
    assert.match(teile[0], /^[A-Za-z0-9_.-]+==\d+(\.\d+)*$/, "Name==Version, genau eine Version: " + teile[0]);
    const summen = teile.slice(1);
    assert.ok(summen.length >= 1, teile[0] + " ohne Prüfsummen");
    for (const s of summen) assert.match(s, /^--hash=sha256:[0-9a-f]{64}$/, "Prüfsumme in " + teile[0]);
    assert.equal(new Set(summen).size, summen.length, "Doppelte Prüfsumme in " + teile[0]);
  }
  // Ruff gibt es für viele Systeme (2026: 17 Räder und der Quelltext). Fehlt eine Summe, scheitert pip dort, wo das Rad fehlt,
  // zum Beispiel auf ubuntu-24.04 (manylinux_2_17_x86_64). Darum alle Dateien der Version eintragen, nicht nur eine.
  const ruff = liste.find((e) => e.startsWith("ruff=="));
  assert.ok(ruff, "Ruff steht in der Datei");
  assert.ok(ruff.split(/\s+/).length - 1 >= 10, "Prüfsummen für alle Dateien der Version, nicht nur für eine");
});

test("Workflow: Ruff nur mit Prüfsummen aus requirements-ci.txt, esbuild und Node-Pakete nur mit npm ci", () => {
  assert.match(WORKFLOW, /pip install [^\n]*--require-hashes[^\n]* -r \.github\/requirements-ci\.txt/);
  const pipZeilen = WORKFLOW.split("\n").filter((z) => /\bpip install\b/.test(z));
  assert.ok(pipZeilen.length >= 1);
  for (const z of pipZeilen) assert.match(z, /--require-hashes/, "pip install ohne Prüfsummen: " + z.trim());
  assert.ok(!/\bnpm install\b|\bnpm i\b|\bnpx esbuild@/.test(WORKFLOW), "Keine ungesperrte npm-Installation im Workflow");
  assert.match(WORKFLOW, /npm ci\b/);
  assert.ok(!/ESBUILD_VERSION|RUFF_VERSION/.test(WORKFLOW), "Versionen stehen in package.json bzw. requirements-ci.txt");
});

test("esbuild: feste Version in package.json, im Lockfile mit Integrität, auch das Paket für Linux x86_64", () => {
  const paket = JSON.parse(lesen("package.json"));
  const version = paket.devDependencies.esbuild;
  assert.match(version, /^\d+\.\d+\.\d+$/, "esbuild ohne ^ oder ~");
  const lock = JSON.parse(lesen("package-lock.json")).packages;
  assert.equal(lock["node_modules/esbuild"].version, version);
  assert.equal(lock[""].devDependencies.esbuild, version);
  for (const name of ["esbuild", "@esbuild/linux-x64"]) {
    const eintrag = lock["node_modules/" + name];
    assert.ok(eintrag, name + " fehlt im Lockfile");
    assert.equal(eintrag.version, version, name);
    assert.match(eintrag.integrity, /^sha512-/, name + " ohne Integrität");
    assert.match(eintrag.resolved, /^https:\/\/registry\.npmjs\.org\//, name);
  }
});

test("dependabot.yml: Wartezeit für jede Art von Updates, auch für die Python-Werkzeuge in .github/", () => {
  const text = lesen(".github/dependabot.yml");
  const bloecke = text.split(/^ {2}- package-ecosystem: /m).slice(1);
  const arten = bloecke.map((b) => b.split("\n")[0].trim());
  assert.deepEqual(arten.sort(), ["github-actions", "npm", "pip"]);
  for (const b of bloecke) {
    const tage = /^ {4}cooldown:\n {6}default-days: (\d+)$/m.exec(b);
    assert.ok(tage && Number(tage[1]) >= 7, "cooldown mit mindestens 7 Tagen in " + b.split("\n")[0]);
  }
  const pip = bloecke.find((b) => b.startsWith("pip"));
  assert.match(pip, /^ {4}directory: \/\.github$/m);
  assert.ok(fs.existsSync(path.join(WURZEL, ".github", "requirements-ci.txt")), "Dependabot findet die Datei im Ordner");
});
