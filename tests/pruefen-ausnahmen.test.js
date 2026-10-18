// pruefen.py: Ausnahme für server/ (Funktion „Eigener Server“). Allgemeine Server-Begriffe sind dort erlaubt, sonst nicht;
// Tailnet-Namen bleiben überall gesperrt. Braucht Python; ohne Python wird der Test übersprungen.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const PRUEFEN = path.join(__dirname, "..", "werkzeuge", "pruefen.py");
const python = ["python3", "python"].find((p) => spawnSync(p, ["--version"]).status === 0);

// Begriffe zerlegt, damit diese Datei (tests/ wird veröffentlicht) sich selbst nicht meldet.
const ANBIETER = "Orac" + "le Cloud";
const ADRESSE = "beispiel." + "ss" + "lip.io";
const TAILNET = "rechner.tail" + "net.ts" + ".net";

test("Server-Begriffe: in server/ erlaubt, anderswo gemeldet; Tailnet-Namen überall gemeldet", { skip: !python && "kein Python" }, () => {
  const baum = fs.mkdtempSync(path.join(os.tmpdir(), "pruefen-"));
  try {
    fs.mkdirSync(path.join(baum, "server"));
    fs.mkdirSync(path.join(baum, "docs"));
    fs.writeFileSync(path.join(baum, "server", "README.md"), `In der ${ANBIETER} Shell; Adresse ${ADRESSE}.\nNicht: ${TAILNET}\n`);
    fs.writeFileSync(path.join(baum, "docs", "anderes.md"), `Auch hier ${ANBIETER}.\n`);
    const r = spawnSync(python, [PRUEFEN, baum, "--ohne-node"], { encoding: "utf8" });
    const zeilen = r.stdout.split("\n");
    const funde = (datei) => {
      const i = zeilen.findIndex((z) => z.trim() === datei);
      if (i < 0) return [];
      const ende = zeilen.findIndex((z, j) => j > i && !z.startsWith("   "));
      return zeilen.slice(i + 1, ende < 0 ? undefined : ende).join("\n");
    };
    const server = funde("server/README.md");
    assert.match(server, /\[Server-Hinweis\]/, "Tailnet-Name in server/ gemeldet");
    assert.doesNotMatch(server, /allgemein/, "allgemeine Begriffe in server/ erlaubt");
    assert.match(funde("docs/anderes.md"), /\[Server-Hinweis \(allgemein\)\]/, "außerhalb von server/ gemeldet");
  } finally {
    fs.rmSync(baum, { recursive: true, force: true });
  }
});
