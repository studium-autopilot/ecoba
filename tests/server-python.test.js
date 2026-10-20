// Führt die Python-Tests des eigenen Servers aus (server/test_*.py, unittest). Ohne Python oder ohne server/ übersprungen.
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const assert = require("node:assert/strict");

const SERVER = path.join(__dirname, "..", "server");
const python = ["python3", "python"].find((p) => spawnSync(p, ["--version"]).status === 0);
const grund = !fs.existsSync(path.join(SERVER, "abrufen.py")) ? "server/ fehlt in diesem Baum" : !python ? "kein Python" : false;

require("node:test")("Python-Tests des Servers (abrufen.py)", { skip: grund }, () => {
  const r = spawnSync(python, ["-m", "unittest", "discover", "-s", SERVER, "-p", "test_*.py"], { encoding: "utf8", cwd: SERVER });
  assert.equal(r.status, 0, r.stderr.slice(-3000));
});
