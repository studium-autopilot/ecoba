// pruefen.py: persönliche Daten aus Alma (Matrikelnummer, Geburtsdatum), Testseiten nur mit Kopf „Erfundene Testseite“ bzw.
// „Öffentliche Seite ohne Anmeldung“, Dateien, die ein Tresor selbst anlegt, persönliche Felder der Module, IP-Adressen
// außer Beispieladressen und Telefonnummern. Braucht Python;
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

test("IP-Adressen sind Funde, Beispieladressen (RFC 5737) und localhost nicht", { skip: !python && "kein Python" }, () => {
  // zerlegt, damit diese Datei sich selbst nicht meldet
  const echt = ["10", "20", "30", "40"].join(".");
  const r = pruefen({
    "docs/echt.md": `Server unter ${echt}\n`,
    "docs/beispiel.md": "Beispiele: 192.0.2.10, 198.51.100.7, 203.0.113.5, 127.0.0.1\n",
    "docs/nah-dran.md": `Nicht reserviert: ${["203", "0", "114", "5"].join(".")}\n`,
  });
  assert.match((r.funde["docs/echt.md"] || []).join("\n"), /\[IP-Adresse\]/);
  assert.match((r.funde["docs/nah-dran.md"] || []).join("\n"), /\[IP-Adresse\]/);
  assert.equal(r.funde["docs/beispiel.md"], undefined);
});

test("Telefonnummern mit Landesvorwahl sind Funde, Nachkommastellen einer Zahl nicht", { skip: !python && "kein Python" }, () => {
  // zerlegt, damit diese Datei sich selbst nicht meldet
  const r = pruefen({
    "docs/plus.md": `Ruf an: ${["+49", "7071", "123456"].join(" ")}\n`,
    "docs/null.md": `Ruf an: ${["0049", "7071", "123456"].join(" ")}\n`,
    "tests/formel.test.js": "const l = 0.2104542553 * a - 0.0040720468 * s;\n",
  });
  assert.match((r.funde["docs/plus.md"] || []).join("\n"), /\[Telefonnummer\?\]/);
  assert.match((r.funde["docs/null.md"] || []).join("\n"), /\[Telefonnummer\?\]/);
  assert.equal(r.funde["tests/formel.test.js"], undefined);
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
    [`${VAULT}/System/Daten/seit-besuch/g-0a1b2c3d4e5f.json`]: "{}\n",
    [`${VAULT}/System/Daten/seit-besuch/gesehen-g-0a1b2c3d4e5f.json`]: "{}\n",
    [`${VAULT}/Module/B110 ausgeblendet.md`]: modul("alma_ausgeblendet:\n  - 1a2b3c4d\n"),
    [`${VAULT}/Module/B111 verzicht.md`]: modul("anmeldung_verzicht: WS 2026/27\n"),
    [`${VAULT}/Module/B112 leer.md`]: modul("alma_ausgeblendet: []\nanmeldung_verzicht: \"\"\n"),
    [`${VAULT}/System/Einstellungen.md`]: "---\ntyp: einstellungen\nzaehlen: false\n---\n",
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
  for (const p of ["g-0a1b2c3d4e5f.json", "gesehen-g-0a1b2c3d4e5f.json"]) {
    assert.match(fund("System/Daten/seit-besuch/" + p), /\[persönliche Daten \(Seit deinem letzten Besuch\)\]/, p);
  }
  assert.match(fund("Module/B110 ausgeblendet.md"), /persönliches Feld gesetzt\]\s+alma_ausgeblendet/);
  assert.match(fund("Module/B111 verzicht.md"), /persönliches Feld gesetzt\]\s+anmeldung_verzicht/);
  assert.equal(fund("Module/B112 leer.md"), "", "leere Felder sind kein Fund");
  assert.match(fund("System/Einstellungen.md"), /persönliches Feld gesetzt\]\s+zaehlen: false/, "zaehlen: false nie in der Vorlage, sonst zählte kein Update");
});

test("Gerätelokale und private Dateien sind Funde: Widget-Daten, lokale Claude-Dateien, .mcp.json, jede .env", { skip: !python && "kein Python" }, () => {
  const PLUGIN = `${VAULT}/.obsidian/plugins/studium-autopilot`;
  const dateien = {
    [`${PLUGIN}/manifest.json`]: MANIFEST + "\n",
    [`${PLUGIN}/widget-iphone.json`]: "{}\n",
    [`${PLUGIN}/widget-ipad.json`]: "{}\n",
    [`${PLUGIN}/main.js`]: "module.exports = {};\n",
    ".claude/settings.local.json": "{}\n",
    [`${VAULT}/.claude/settings.local.json`]: "{}\n",
    "CLAUDE.local.md": "# lokal\n",
    "docs/CLAUDE.local.md": "# lokal\n",
    ".mcp.json": "{}\n",
    "server/.mcp.json": "{}\n",
    ".env": "A=1\n",
    "server/.env": "A=1\n",
    "server/.env.production": "A=1\n",
    "server/dienst.env": "A=1\n",
    // erlaubt: gemeinsame Einstellungen von Claude Code, Dateien, die nur so ähnlich heißen
    ".claude/settings.json": "{}\n",
    "docs/env-datei.md": "# Umgebung\n",
    "server/environment.json": "{}\n",
  };
  const r = pruefen(dateien);
  const fund = (p) => (r.funde[p] || []).join("\n");
  assert.match(fund(`${PLUGIN}/widget-iphone.json`), /\[gerätelokal \(Stundenplan und Fristen der Widgets\)\]/);
  assert.match(fund(`${PLUGIN}/widget-ipad.json`), /\[gerätelokal \(Stundenplan und Fristen der Widgets\)\]/);
  for (const p of [".claude/settings.local.json", `${VAULT}/.claude/settings.local.json`]) assert.match(fund(p), /\[lokale Einstellungen von Claude Code\]/, p);
  for (const p of ["CLAUDE.local.md", "docs/CLAUDE.local.md"]) assert.match(fund(p), /\[lokale Hinweise für Claude Code\]/, p);
  for (const p of [".mcp.json", "server/.mcp.json"]) assert.match(fund(p), /\[MCP-Konfiguration/, p);
  for (const p of [".env", "server/.env", "server/.env.production"]) assert.match(fund(p), /\[Umgebungsdatei/, p);
  assert.match(fund("server/dienst.env"), /\[Dateityp nicht erlaubt\]/);
  for (const p of [`${PLUGIN}/main.js`, ".claude/settings.json", "docs/env-datei.md", "server/environment.json"]) assert.equal(r.funde[p], undefined, p);
});

test("Erkennung: Mat.-Nr., macOS-Benutzerpfad, Zugangsdaten mit Namen, Passwort mit Bezug, persönliche Uni-Adressen", { skip: !python && "kein Python" }, () => {
  // alles zerlegt, damit diese Datei (tests/ wird veröffentlicht) sich selbst nicht meldet; alle Werte erfunden
  const MAT = "Mat.-" + "Nr.";
  const MAC = "/Us" + "ers/";
  const PW = "Pass" + "word";
  const PWDE = "Pass" + "wort";
  const KENNUNG = "abc01";
  const r = pruefen({
    "docs/mat.md": `${MAT} 1234567\n${MAT} ohne Wert\n`,
    "docs/mat-sonst.md": "Das Format Nr. 1234567 und mat 7654321 sind keine Matrikelnummer.\n",
    "docs/mac.md": `Pfad: ${MAC}jan/Documents/x\n`,
    "docs/mac-erlaubt.md": `Alle Nutzer liegen unter ${MAC} und ${MAC}Shared/ und ${MAC}<name>/ und /Applications/.\n`,
    "docs/umgebung.md": `DB_${PW.toUpperCase()}=hunter22\nmysql_root_${PW.toLowerCase()}: geheim99\n`,
    "docs/umgebung-code.md": `felder.j_${PW.toLowerCase()} = zugang.kennwortGeber() || "";\nconst c = { db_${PW.toLowerCase()}: k.${PWDE.toLowerCase()} };\n`,
    "docs/bezug.md": `${PWDE} für den Kurs: Gelb42\n`,
    "docs/bezug-en.md": `${PW} for the course: Gelb42\n`,
    "docs/bezug-ohne.md": `Das ${PWDE} für den Kurs steht im Postfach.\n`,
    "docs/uni-adressen.md": [`${KENNUNG}` + "@uni-tuebingen.de", `${KENNUNG}` + "@student.uni-tuebingen.de"].join("\n") + "\n",
    "docs/uni-funktion.md": ["pruefungsamt" + "@uni-tuebingen.de", "ilias" + "@uni-tuebingen.de", "x" + "@wiwi.uni-tuebingen.de"].join("\n") + "\n",
  });
  const fund = (p) => (r.funde[p] || []).join("\n");
  assert.match(fund("docs/mat.md"), /\[Matrikelnummer mit Wert\]/);
  assert.equal(r.funde["docs/mat.md"].length, 1, "nur die Zeile mit Wert");
  assert.equal(r.funde["docs/mat-sonst.md"], undefined);
  assert.match(fund("docs/mac.md"), /\[macOS-Benutzerpfad\]/);
  assert.equal(r.funde["docs/mac-erlaubt.md"], undefined, "„Users/“ allein, Shared und Platzhalter sind kein Fund");
  assert.equal(r.funde["docs/umgebung.md"].length, 2);
  assert.match(fund("docs/umgebung.md"), /\[Passwort mit Wert\]/);
  assert.equal(r.funde["docs/umgebung-code.md"], undefined, "Zuweisung im Quelltext ist keine Zugangsdaten");
  assert.match(fund("docs/bezug.md"), /\[Passwort mit Bezug\]/);
  assert.match(fund("docs/bezug-en.md"), /\[Passwort mit Bezug\]/);
  assert.equal(r.funde["docs/bezug-ohne.md"], undefined);
  assert.equal(r.funde["docs/uni-adressen.md"].length, 2, "beide persönlichen Adressen");
  assert.match(fund("docs/uni-adressen.md"), /\[E-Mail-Adresse\]/);
  assert.equal(r.funde["docs/uni-funktion.md"], undefined, "Funktionsadressen der Uni bleiben erlaubt");
  for (const wert of ["1234567", "hunter22", "geheim99", "Gelb42"]) assert.ok(!r.ausgabe.includes(wert), `${wert} nicht ausgeben`);
});

test("Vault: nur bekannte Pfade der Vorlage, jeder andere ist ein Fund (Erlaubnisliste)", { skip: !python && "kein Python" }, () => {
  const bekannt = [
    ".obsidian/plugins/studium-autopilot/manifest.json", ".obsidian/plugins/studium-autopilot/main.js",
    ".obsidian/plugins/studium-autopilot/styles.css", ".obsidian/app.json", ".obsidian/appearance.json", ".obsidian/types.json",
    ".obsidian/snippets/eba-core.css", ".claude/CLAUDE.md", ".claude/settings.json", ".claude/skills/studium-autopilot/SKILL.md",
    "Dashboard.md", "Studium/Prüfungen.md", "Module/1 Grundstudium/B110 Beispiel.md", "Termine/2026-11-01 Beispiel.md",
    "System/Einstellungen.md", "System/Daten/Semester.md", "System/Daten/Musterplan.md", "System/Skripte/kern.js", "System/Gerüste/Modul.md",
    "Unterlagen/.gitkeep", "Karteikarten/.gitkeep", "Anhänge/.gitkeep",
    // vom Export erzeugt: die Update-Liste mit Signatur
    "System/Daten/system-dateien.json", "System/Daten/system-dateien.json.sig",
  ];
  const unbekannt = [
    "Notizen.md", "Sicherung/alt.md", ".obsidian/themes/x.css", ".obsidian/plugins/studium-autopilot/notiz.md",
    ".obsidian/plugins/studium-autopilot/widget-scriptable.js", ".obsidian/snippets/eigenes.css", ".obsidian/graph.json",
    ".claude/skills/anderer/SKILL.md", ".claude/agents/x.md", "Studium/Unterordner/x.md","Module/B110.txt",
    "Termine/unter/x.md", "Termine/x.json", "System/Daten/geheim.json", "System/Daten/Unterordner/x.md", "System/Skripte/neu.json",
    "System/Skripte/unter/x.js", "System/Gerüste/x.txt", "Dashboard.md.bak", "Unterlagen/Folien.md", "Stundenplan/Woche.md",
  ];
  const dateien = {};
  for (const p of [...bekannt, ...unbekannt]) dateien[`${VAULT}/${p}`] = p.endsWith(".json") || p.endsWith(".sig") ? "{}\n" : "x\n";
  dateien[`${VAULT}/.obsidian/plugins/studium-autopilot/manifest.json`] = MANIFEST + "\n";
  const r = pruefen(dateien);
  const meldung = (p) => (r.funde[`${VAULT}/${p}`] || []).join("\n");
  for (const p of unbekannt) assert.ok(meldung(p), `${p} muss ein Fund sein`);
  for (const p of unbekannt.filter((x) => !/^(Unterlagen|Stundenplan)\//.test(x))) assert.match(meldung(p), /Pfad nicht in der Vorlage/, p);
  for (const p of ["Unterlagen/Folien.md", "Stundenplan/Woche.md"]) {
    assert.match(meldung(p), /persönlicher Ordner nicht leer/, "die persönlichen Ordner meldet die Vorlagenprüfung: " + p);
  }
  for (const p of bekannt) assert.doesNotMatch(meldung(p), /nicht in der Vorlage/, p);
});
