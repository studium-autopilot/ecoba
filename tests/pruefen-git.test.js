// pruefen.py in einem git-Arbeitsordner: geprüft wird, was git veröffentlichen würde (getrackt und neu, ohne Ignoriertes);
// --alles und ein Ordner innerhalb eines Repos (wie der Release-Baum) prüfen jede Datei. Braucht Python und git.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const PRUEFEN = path.join(__dirname, "..", "werkzeuge", "pruefen.py");
const python = ["python3", "python"].find((p) => spawnSync(p, ["--version"]).status === 0);
const git = spawnSync("git", ["--version"]).status === 0;
const FUND = "```mermaid\ngraph TD\n```\n"; // jede .md-Datei mit diesem Block ist ein Fund

function repo() {
  const baum = fs.mkdtempSync(path.join(os.tmpdir(), "pruefen-git-"));
  const g = (...args) => assert.equal(spawnSync("git", ["-C", baum, ...args]).status, 0, "git " + args.join(" "));
  g("init", "-q");
  fs.writeFileSync(path.join(baum, ".gitignore"), "geheim/\n");
  fs.mkdirSync(path.join(baum, "geheim"));
  fs.mkdirSync(path.join(baum, "teil", "geheim"), { recursive: true });
  fs.writeFileSync(path.join(baum, "getrackt.md"), FUND);
  fs.writeFileSync(path.join(baum, "neu.md"), FUND);
  fs.writeFileSync(path.join(baum, "geheim", "ignoriert.md"), FUND);
  fs.writeFileSync(path.join(baum, "teil", "geheim", "ignoriert.md"), FUND);
  g("add", ".gitignore", "getrackt.md");
  return baum;
}

// GITHUB_ACTIONS leer: in der CI schreibt pruefen.py sonst zu jedem Fund eine Zeile „::error file=…“, die hier als Datei zählte
function lauf(baum, ...args) {
  const r = spawnSync(python, [PRUEFEN, baum, "--ohne-node", ...args],
    { encoding: "utf8", env: Object.assign({}, process.env, { PYTHONIOENCODING: "utf-8", GITHUB_ACTIONS: "" }) });
  const dateien = r.stdout.split(/\r?\n/).filter((z) => z && !z.startsWith(" ") && !/^(Prüfung|Hinweis|Ergebnis):/.test(z));
  return { dateien, hinweis: /Hinweis: git-Arbeitsordner/.test(r.stdout) };
}

test("Wurzel eines git-Arbeitsordners: getrackt und neu geprüft, Ignoriertes nicht", { skip: (!python || !git) && "kein Python oder git" }, () => {
  const baum = repo();
  try {
    const r = lauf(baum);
    assert.ok(r.hinweis, "Hinweis auf die Auswahl");
    assert.deepEqual(r.dateien, ["getrackt.md", "neu.md"]);
  } finally {
    fs.rmSync(baum, { recursive: true, force: true });
  }
});

test("--alles prüft auch Ignoriertes", { skip: (!python || !git) && "kein Python oder git" }, () => {
  const baum = repo();
  try {
    const r = lauf(baum, "--alles");
    assert.ok(!r.hinweis);
    assert.deepEqual(r.dateien, ["geheim/ignoriert.md", "getrackt.md", "neu.md", "teil/geheim/ignoriert.md"]);
  } finally {
    fs.rmSync(baum, { recursive: true, force: true });
  }
});

test("Ordner innerhalb eines Repos (wie der Release-Baum): jede Datei", { skip: (!python || !git) && "kein Python oder git" }, () => {
  const baum = repo();
  try {
    const r = lauf(path.join(baum, "teil"));
    assert.ok(!r.hinweis);
    assert.deepEqual(r.dateien, ["geheim/ignoriert.md"]);
  } finally {
    fs.rmSync(baum, { recursive: true, force: true });
  }
});
