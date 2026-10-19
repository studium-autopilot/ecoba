// pruefen.py: persönliche Daten aus Alma (Matrikelnummer, Geburtsdatum), Testseiten nur mit Kopf „Erfundene Testseite“ bzw.
// „Öffentliche Seite ohne Anmeldung“, Dateien, die ein Tresor selbst anlegt, und persönliche Felder der Module. Braucht Python;
// ohne Python wird der Test übersprungen.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const PRUEFEN = path.join(__dirname, "..", "werkzeuge", "pruefen.py");
const python = ["python3", "python"].find((p) => spawnSync(p, ["--version"]).status === 0);

// Bezeichnungen zerlegt, damit diese Datei (tests/ wird veröffentlicht) sich selbst nicht meldet. Alle Werte erfunden.
const MATR = "Matrikel" + "nummer";
const GEB = "Geburts" + "datum";
const VAULT = "Studium Autopilot";
const MANIFEST = JSON.stringify({ id: "studium-autopilot", name: "Studium Autopilot", version: "1.2.3" });

// dateien: { rel: inhalt } → { rel: [Zeilen der Funde] } (nur Dateien mit Fund)
const pruefen = (dateien) => {
  const baum = fs.mkdtempSync(path.join(os.tmpdir(), "pruefen-daten-"));
  try {
    for (const [rel, inhalt] of Object.entries(dateien)) {
      const p = path.join(baum, ...rel.split("/"));
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, inhalt);
    }
    const r = spawnSync(python, [PRUEFEN, baum, "--ohne-node"], { encoding: "utf8", env: Object.assign({}, process.env, { PYTHONIOENCODING: "utf-8" }) });
    const zeilen = String(r.stdout).replace(/\r\n/g, "\n").split("\n");
    const funde = {};
    let datei = null;
    for (const z of zeilen.slice(zeilen.findIndex((x) => x.startsWith("Ergebnis:")) + 1)) {
      if (!z) continue;
      if (z.startsWith("   ")) funde[datei].push(z.trim());
      else { datei = z.trim(); funde[datei] = []; }
    }
    return { status: r.status, funde, ausgabe: r.stdout };
  } finally {
    fs.rmSync(baum, { recursive: true, force: true });
  }
};

test("Matrikelnummer und Geburtsdatum mit Wert: gemeldet, auch über Tabellenzellen; Wert nie in der Ausgabe", { skip: !python && "kein Python" }, () => {
  const r = pruefen({
    "docs/zelle.md": `| ${MATR} | 4123456 |\n`,
    "tests/daten/kopf.html": `<!-- Erfundene Testseite -->\n<table><tr><th>${MATR}</th><td><span>4987654</span></td></tr></table>\n`,
    "tests/daten/geburt.html": `<!-- Erfundene Testseite -->\n<dl><dt>${GEB}</dt><dd>01.02.2003</dd></dl>\n`,
    "docs/englisch.md": "Matriculation" + ` number: 41234567\n`,
    "docs/ohne-wert.md": `Bitte keine ${MATR}, keine Noten und kein ${GEB} in Issues.\nRaum 2000031, Seite 4123456.\n`,
  });
  assert.equal(r.status, 1);
  assert.equal(r.funde["docs/zelle.md"].length, 1);
  assert.match(r.funde["docs/zelle.md"][0], /\[Matrikelnummer mit Wert\]/);
  assert.match(r.funde["tests/daten/kopf.html"].join("\n"), /\[Matrikelnummer mit Wert\]/);
  assert.match(r.funde["tests/daten/geburt.html"].join("\n"), /\[Geburtsdatum mit Wert\]/);
  assert.match(r.funde["docs/englisch.md"].join("\n"), /\[Matrikelnummer mit Wert\]/);
  assert.equal(r.funde["docs/ohne-wert.md"], undefined, "Bezeichnung ohne Wert und Zahlen ohne Bezeichnung sind kein Fund");
  for (const wert of ["4123456", "4987654", "01.02.2003", "41234567"]) assert.ok(!r.ausgabe.includes(wert), `${wert} nicht ausgeben`);
});

test("Testseiten unter tests/daten/ brauchen den Kopf; andere HTML-Dateien nicht", { skip: !python && "kein Python" }, () => {
  const seite = "<html><body><p>Hallo</p></body></html>\n";
  const r = pruefen({
    "tests/daten/ohne-kopf.html": "<!DOCTYPE html>\n" + seite,
    "tests/daten/alma/tief/ohne-kopf.htm": seite,
    "tests/daten/kopf-spaet.html": "<!DOCTYPE html>\n" + " ".repeat(2100) + "<!-- Erfundene Testseite -->\n" + seite,
    "tests/daten/erfunden.html": "<!DOCTYPE html>\n<!-- Erfundene Testseite: Aufbau wie Alma, Werte erfunden. -->\n" + seite,
    "tests/daten/oeffentlich.html": "<!DOCTYPE html>\n<!-- Öffentliche Seite ohne Anmeldung: Startseite. -->\n" + seite,
    "tests/daten/v1/termine.json": "{}\n",
    "docs/beispiel.html": seite,
  });
  for (const p of ["tests/daten/ohne-kopf.html", "tests/daten/alma/tief/ohne-kopf.htm", "tests/daten/kopf-spaet.html"]) {
    assert.match((r.funde[p] || []).join("\n"), /\[Testseite ohne Kopf\]/, p);
  }
  for (const p of ["tests/daten/erfunden.html", "tests/daten/oeffentlich.html", "tests/daten/v1/termine.json", "docs/beispiel.html"]) {
    assert.equal(r.funde[p], undefined, p);
  }
});

test("Dateien, die ein Tresor selbst anlegt, und persönliche Modulfelder sind Funde", { skip: !python && "kein Python" }, () => {
  const modul = (felder) => `---\ntyp: modul\ncode: B110\nstatus: offen\n${felder}---\n# B110\n`;
  const r = pruefen({
    [`${VAULT}/.obsidian/plugins/studium-autopilot/manifest.json`]: MANIFEST + "\n",
    [`${VAULT}/System/Daten/alma-konto.json`]: "{}\n",
    [`${VAULT}/System/Daten/alma-konto 2.json`]: "{}\n",
    [`${VAULT}/System/Daten/alma-konto-abruf.json`]: "{}\n",
    [`${VAULT}/System/Daten/alma-konto-aus.json`]: "{}\n",
    [`${VAULT}/System/Daten/uni-zugang.json`]: "{}\n",
    [`${VAULT}/System/Daten/update.json`]: "{}\n",
    [`${VAULT}/System/Daten/volltext-abruf.json`]: "{}\n",
    [`${VAULT}/System/Daten/alma-abruf.json`]: "{}\n",
    [`${VAULT}/System/Daten/ilias-kalender.json`]: "{}\n",
    [`${VAULT}/System/Daten/ilias-kalender-abruf.json`]: "{}\n",
    [`${VAULT}/Unterlagen/_Volltext/Folien 01 (Volltext).md`]: "# Folien 01\n",
    [`${VAULT}/Module/B110 ausgeblendet.md`]: modul("alma_ausgeblendet:\n  - 1a2b3c4d\n"),
    [`${VAULT}/Module/B111 verzicht.md`]: modul("anmeldung_verzicht: WS 2026/27\n"),
    [`${VAULT}/Module/B112 leer.md`]: modul("alma_ausgeblendet: []\nanmeldung_verzicht: \"\"\n"),
  });
  const fund = (p) => (r.funde[`${VAULT}/${p}`] || []).join("\n");
  for (const p of ["alma-konto.json", "alma-konto 2.json", "alma-konto-abruf.json", "alma-konto-aus.json"]) {
    assert.match(fund("System/Daten/" + p), /\[persönliche Daten \(Noten aus Alma\)\]/, p);
  }
  assert.match(fund("System/Daten/uni-zugang.json"), /\[vaultlokale Datei \(Uni-Zugang\)\]/);
  assert.match(fund("System/Daten/update.json"), /\[vaultlokale Datei \(Update-Stand\)\]/);
  assert.match(fund("System/Daten/volltext-abruf.json"), /\[vaultlokale Datei \(Abrufer-Sperre\)\]/);
  assert.match(fund("System/Daten/alma-abruf.json"), /\[vaultlokale Datei \(Abrufer-Sperre\)\]/);
  assert.match(fund("System/Daten/ilias-kalender.json"), /\[vaultlokale Datei \(ILIAS-Kalender\)\]/);
  assert.match(fund("System/Daten/ilias-kalender-abruf.json"), /\[vaultlokale Datei \(ILIAS-Kalender\)\]/);
  assert.match(fund("Unterlagen/_Volltext/Folien 01 (Volltext).md"), /\[persönliche Textfassung einer PDF \(Volltext\)\]/);
  assert.match(fund("Module/B110 ausgeblendet.md"), /persönliches Feld gesetzt\]\s+alma_ausgeblendet/);
  assert.match(fund("Module/B111 verzicht.md"), /persönliches Feld gesetzt\]\s+anmeldung_verzicht/);
  assert.equal(fund("Module/B112 leer.md"), "", "leere Felder sind kein Fund");
});
