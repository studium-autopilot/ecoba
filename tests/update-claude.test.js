// Hinweise für Claude im Update (update.js, seit 0.6.9): Klasse claude nur im Schlüssel „weitere“ der Liste, Planen mit früher
// ausgelieferten Fassungen (CLAUDE_FRUEHER, Merker), das Update selbst und der Nachholer je Computer (claudeNachholenMit,
// claudeNachholen). Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { laden } = require("./laden.js");

const U = laden("update").ctx.update;
const enc = (s) => new TextEncoder().encode(s);
const dec = (b) => new TextDecoder("utf-8").decode(b);
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const KERN = ".obsidian/plugins/studium-autopilot/";
const CLAUDE = ".claude/CLAUDE.md", SKILL = ".claude/skills/studium-autopilot/SKILL.md", TRESOR = ".claude/skills/studium-autopilot/tresor.md";
const BASIS = "https://test.invalid/v9.0.0/";
const url = (pfad) => BASIS + ("Studium Autopilot/" + pfad).split("/").map(encodeURIComponent).join("/");

// Liste mit Plugin-Kern in „dateien“ und den Hinweisen für Claude in „weitere“; inhalte: pfad → Text
const eintrag = (pfad, text, klasse) => { const b = enc(text); return { pfad, klasse, sha256: sha(b), groesse: b.length }; };
const listeVon = (version, inhalte, weitere) => ({
  schema: 1, version, ordner: "Studium Autopilot",
  dateien: [eintrag(KERN + "main.js", "// kern\n", "system"), eintrag(KERN + "manifest.json", "{}\n", "system")]
    .concat(Object.keys(inhalte).map((p) => eintrag(p, inhalte[p], U.klasseVon(p)))),
  weitere: Object.keys(weitere).map((p) => eintrag(p, weitere[p], "claude")),
});
// Dateien im Speicher, Netz aus einer Tabelle url → Bytes; holen zählt mit
const speicher = (start, netz) => {
  const d = {};
  for (const p of Object.keys(start || {})) d[p] = enc(start[p]);
  const io = {
    d, abrufe: [],
    holen: async (u) => { io.abrufe.push(u); if (!netz || !netz[u]) throw new Error("HTTP 404"); return netz[u]; },
    lesen: async (p) => d[p] || null,
    schreiben: async (p, b) => { if (io.kaputt && io.kaputt(p)) throw new Error("voll"); d[p] = b; },
    loeschen: async (p) => { delete d[p]; },
    liste: async () => [],
    text: (p) => (d[p] ? dec(d[p]) : null),
  };
  return io;
};
const netzVon = (inhalte) => { const n = {}; for (const p of Object.keys(inhalte)) n[url(p)] = enc(inhalte[p]); return n; };
const geprueft = (roh) => { const lp = U.listePruefen(roh); assert.ok(lp.wert, lp.fehler); return lp.wert; };
const ALT = "# alt\n", NEU = "# neu\n";

test("Liste: Klasse claude nur in „weitere“, dort Unbekanntes übergangen, in „dateien“ abgelehnt", () => {
  assert.deepEqual(U.WEITERE, ["claude"]);
  const roh = listeVon("9.0.0", { "System/Skripte/x.js": "// x\n" }, { [CLAUDE]: NEU, [TRESOR]: "# tresor\n" });
  const w = geprueft(roh);
  assert.deepEqual(w.dateien.filter((e) => e.klasse === "claude").map((e) => e.pfad), [CLAUDE, TRESOR]);
  // Ohne „weitere“ (Listen bis 0.6.8) wie bisher
  assert.ok(geprueft(Object.assign({}, roh, { weitere: undefined })).dateien.every((e) => e.klasse !== "claude"));
  // In „dateien“ lehnten die Planer bis 0.6.8 die ganze Liste ab; dieser auch, damit es nie dorthin gerät
  const falsch = Object.assign({}, roh, { dateien: roh.dateien.concat([eintrag(SKILL, "# s\n", "claude")]) });
  assert.match(U.listePruefen(falsch).fehler, /Datei nicht erlaubt/);
  // Eine spätere Version darf in „weitere“ Neues nennen: Planer, die es nicht kennen, übergehen es, statt abzubrechen
  const spaeter = Object.assign({}, roh, { weitere: roh.weitere.concat([
    eintrag("Vorlagen/Neu.md", "x", "vorlage"), eintrag(".claude/skills/studium-autopilot/unter/x.md", "x", "claude"),
    eintrag(".claude/settings.json", "{}", "claude"), eintrag("System/Skripte/y.js", "y", "system"),
    Object.assign(eintrag(SKILL, "s", "claude"), { sha256: "xyz" }), eintrag(TRESOR, "doppelt", "claude"), null, "kaputt",
  ]) });
  assert.deepEqual(geprueft(spaeter).dateien.filter((e) => e.klasse === "claude").map((e) => e.pfad), [CLAUDE, TRESOR]);
  assert.ok(!geprueft(spaeter).dateien.some((e) => e.pfad === "System/Skripte/y.js"), "system gehört nach „dateien“");
  // Größe zählt mit: zusammen höchstens 40 MiB wie bisher
  const viele = [];
  for (let i = 0; i < 10; i++) viele.push(Object.assign(eintrag(`.claude/skills/studium-autopilot/t${i}.md`, "x", "claude"), { groesse: 4194304 }));
  assert.match(U.listePruefen(Object.assign({}, roh, { weitere: viele })).fehler, /zu groß/);
});

test("Früher ausgelieferte Fassungen: eingefroren, nur Pfade der Klasse claude", () => {
  const F = U.CLAUDE_FRUEHER;
  assert.equal(Object.keys(F).length, 7);
  for (const p of Object.keys(F)) {
    assert.equal(U.klasseVon(p), "claude", p);
    assert.ok(F[p].length >= 1 && F[p].every((s) => /^[0-9a-f]{64}$/.test(s)), p);
  }
});

test("Planen: bekannte alte Fassung → ersetzen, geänderte → neue mit Sicherung, fehlende → anlegen, Zeilenenden egal", async () => {
  const neu = geprueft(listeVon("9.0.0", {}, { [CLAUDE]: NEU, [SKILL]: "# s neu\n", [TRESOR]: "# t neu\n", ".claude/skills/studium-autopilot/lesen.md": "# l\n" }));
  const ist = {
    [CLAUDE]: await U.istVon(CLAUDE, enc(ALT), "claude"),
    [SKILL]: await U.istVon(SKILL, enc("# meins\n"), "claude"),
    [".claude/skills/studium-autopilot/lesen.md"]: await U.istVon("", enc("# l\n"), "claude"),
    [TRESOR]: await U.istVon(TRESOR, enc("# t alt\r\n"), "claude"),
  };
  const bekannt = { [CLAUDE]: [sha(enc(ALT))], [TRESOR]: [sha(enc("# t alt\n"))] };
  const art = (s) => Object.fromEntries(s.filter((x) => x.klasse === "claude").map((x) => [x.pfad, x.art]));
  assert.deepEqual(art(U.planen(neu, null, ist, bekannt)), { [CLAUDE]: "ersetzen", [SKILL]: "ersetzen-sichern", [TRESOR]: "ersetzen",
    ".claude/skills/studium-autopilot/lesen.md": "gleich" });
  // Ohne bekannt (wie bei Systemdateien ohne alte Liste): jede abweichende gilt als geändert
  assert.equal(art(U.planen(neu, null, ist))[CLAUDE], "ersetzen-sichern");
  // Fehlt eine, kommt sie (auch wenn die alte Liste sie hatte: kein „übersprungen“ wie bei Seiten)
  const ohne = Object.assign({}, ist);
  delete ohne[SKILL];
  assert.equal(art(U.planen(neu, neu, ohne, bekannt))[SKILL], "anlegen");
  // Nicht mehr gelistet: unverändert (alte Liste oder bekannt) → weg, geändert → weg mit Sicherung
  const alt = geprueft(listeVon("8.0.0", {}, { [CLAUDE]: ALT, ".claude/skills/studium-autopilot/weg.md": "# weg\n" }));
  const nur = geprueft(listeVon("9.0.0", {}, { [SKILL]: "# s neu\n" }));
  const ist2 = { [CLAUDE]: await U.istVon(CLAUDE, enc(ALT), "claude"), ".claude/skills/studium-autopilot/weg.md": await U.istVon("", enc("# meins\n"), "claude") };
  assert.deepEqual(art(U.planen(nur, alt, ist2)), { [SKILL]: "anlegen", [CLAUDE]: "entfernen", ".claude/skills/studium-autopilot/weg.md": "entfernen-sichern" });
});

test("Update: Hinweise für Claude wie Systemdateien, eigene Skills und Einstellungen nie", async () => {
  const altRoh = listeVon("8.0.0", {}, { [CLAUDE]: ALT });
  const neuRoh = listeVon("9.0.0", {}, { [CLAUDE]: NEU, [SKILL]: "# s neu\n", [TRESOR]: "# t neu\n" });
  const lb = enc(JSON.stringify(neuRoh, null, 1) + "\n");
  const netz = netzVon({ [CLAUDE]: NEU, [SKILL]: "# s neu\n", [TRESOR]: "# t neu\n", [KERN + "main.js"]: "// kern\n", [KERN + "manifest.json"]: "{}\n" });
  netz[url("System/Daten/system-dateien.json")] = lb;
  const eigene = { ".claude/skills/meine-regeln/SKILL.md": "# meine\n", ".claude/settings.json": "{}\n", ".claude/settings.local.json": "{}\n" };
  // CLAUDE.md wie in der alten Liste, SKILL.md wie 0.4.7 ausgeliefert (bekannt), tresor.md selbst geändert
  const io = speicher(Object.assign({ [CLAUDE]: ALT, [SKILL]: "# s 0.4.7\n", [TRESOR]: "# meins\n" }, eigene), netz);
  const b = await U.aktualisierenMit(io, { release: { version: "9.0.0", url_basis: BASIS, sha256: sha(lb) }, alt: geprueft(altRoh), altVersion: "8.0.0",
    zeit: new Date(2026, 9, 24, 12, 0), bekannt: { [SKILL]: [sha(enc("# s 0.4.7\n"))] } });
  assert.ok(b.ok, b.fehler);
  assert.equal(io.text(CLAUDE), NEU);
  assert.equal(io.text(SKILL), "# s neu\n");
  assert.equal(io.text(TRESOR), "# t neu\n");
  assert.deepEqual(b.gesichert, [{ pfad: TRESOR, sicherung: ".claude/skills/studium-autopilot/tresor (deine Fassung vor 9.0.0).md.txt" }]);
  assert.equal(io.text(".claude/skills/studium-autopilot/tresor (deine Fassung vor 9.0.0).md.txt"), "# meins\n");
  assert.equal(io.text(".claude/skills/studium-autopilot/SKILL (deine Fassung vor 9.0.0).md.txt"), null, "bekannte Fassung: keine Sicherung daneben");
  for (const p of Object.keys(eigene)) assert.equal(io.text(p), eigene[p], p);
  // installiert.json behält „weitere“ (Planer bis 0.6.8 schreiben die Liste auch so, wie sie kam)
  assert.ok(JSON.parse(io.text("System/Daten/installiert.json")).weitere.length === 3);
});

test("Nachholen: nur was fehlt oder alt ist, geprüft vom Tag der Version, alles oder nichts", async () => {
  const inhalte = { [CLAUDE]: NEU, [SKILL]: "# s neu\n", [TRESOR]: "# t neu\n" };
  const liste = geprueft(listeVon("9.0.0", {}, inhalte));
  const bekannt = { [CLAUDE]: [sha(enc(ALT))] };
  const zeit = new Date(2026, 9, 24, 12, 0);
  const SICH = ".trash/Studium Autopilot Sicherung 9.0.0 2026-10-24 12-00/";

  // Alles schon da: kein Abruf, nichts geschrieben, auch ohne Netz
  let io = speicher(inhalte, {});
  let b = await U.claudeNachholenMit(io, { liste, basis: "", bekannt, zeit });
  assert.ok(b.ok && !io.abrufe.length && !b.geaendert.length && !b.sicherung);

  // Alt (bekannt) und fehlend: laden, ersetzen, Altes in die Sicherung, nichts daneben
  io = speicher({ [CLAUDE]: ALT, [TRESOR]: "# t neu\n", ".claude/skills/meine-regeln/SKILL.md": "# meine\n" }, netzVon(inhalte));
  b = await U.claudeNachholenMit(io, { liste, basis: BASIS, bekannt, zeit });
  assert.ok(b.ok, b.fehler);
  assert.deepEqual(io.abrufe.sort(), [url(CLAUDE), url(SKILL)].sort());
  assert.deepEqual([b.geaendert, b.angelegt, b.gesichert], [[CLAUDE], [SKILL], []]);
  assert.equal(io.text(CLAUDE), NEU);
  assert.equal(io.text(SKILL), "# s neu\n");
  assert.equal(io.text(SICH + CLAUDE), ALT);
  assert.equal(io.text(".claude/skills/meine-regeln/SKILL.md"), "# meine\n");

  // Selbst geändert: neue Fassung, deine daneben (und in der Sicherung)
  io = speicher({ [CLAUDE]: "# meins\n", [SKILL]: "# s neu\n", [TRESOR]: "# t neu\n" }, netzVon(inhalte));
  b = await U.claudeNachholenMit(io, { liste, basis: BASIS, bekannt, zeit });
  assert.ok(b.ok, b.fehler);
  assert.deepEqual(b.gesichert, [{ pfad: CLAUDE, sicherung: ".claude/CLAUDE (deine Fassung vor 9.0.0).md.txt" }]);
  assert.equal(io.text(".claude/CLAUDE (deine Fassung vor 9.0.0).md.txt"), "# meins\n");
  assert.equal(io.text(CLAUDE), NEU);

  // Laden aus (zentrale Daten aus): nichts geschrieben, nichts abgerufen
  io = speicher({ [CLAUDE]: ALT }, netzVon(inhalte));
  b = await U.claudeNachholenMit(io, { liste, basis: "", bekannt, zeit });
  assert.equal(b.art, "aus");
  assert.ok(!io.abrufe.length && io.text(CLAUDE) === ALT && Object.keys(io.d).length === 1);

  // Falsche Prüfsumme oder kein Netz: nichts geschrieben
  const falsch = netzVon(inhalte);
  falsch[url(SKILL)] = enc("# untergeschoben\n");
  for (const netz of [falsch, {}]) {
    io = speicher({ [CLAUDE]: ALT }, netz);
    b = await U.claudeNachholenMit(io, { liste, basis: BASIS, bekannt, zeit });
    assert.ok(!b.ok && (b.art === "pruefsumme" || b.art === "netz"), b.art);
    assert.deepEqual(Object.keys(io.d), [CLAUDE]);
    assert.equal(io.text(CLAUDE), ALT);
  }

  // Schreibfehler: alles zurück
  io = speicher({ [CLAUDE]: ALT }, netzVon(inhalte));
  io.kaputt = (p) => p === TRESOR;
  b = await U.claudeNachholenMit(io, { liste, basis: BASIS, bekannt, zeit });
  assert.ok(!b.ok && b.art === "schreiben" && b.zurueckgesetzt);
  assert.equal(io.text(CLAUDE), ALT);
  assert.equal(io.text(SKILL), null);
  assert.deepEqual(b.geaendert, []);
});

test("Nachholen: Dateien, die die Vorlage nicht mehr hat, nur wenn bekannt; deine eigenen bleiben", async () => {
  const W = ".claude/skills/studium-autopilot/weg.md", G = ".claude/skills/studium-autopilot/geaendert.md", M = ".claude/skills/studium-autopilot/meine.md";
  const liste = geprueft(listeVon("9.0.0", {}, { [CLAUDE]: NEU }));
  const bekannt = { [W]: [sha(enc("# weg\n"))], [G]: [sha(enc("# g\n"))], "Module/x.md": [sha(enc("x"))] };
  const io = speicher({ [CLAUDE]: NEU, [W]: "# weg\n", [G]: "# g, geändert\n", [M]: "# meine\n", "Module/x.md": "x" }, {});
  const b = await U.claudeNachholenMit(io, { liste, basis: "", bekannt, zeit: new Date(2026, 9, 24, 12, 0) });
  assert.ok(b.ok, b.fehler);
  assert.deepEqual(b.entfernt.sort(), [G, W].sort());
  assert.equal(io.text(W), null);
  assert.equal(io.text(G), null);
  assert.equal(io.text(".claude/skills/studium-autopilot/geaendert (deine Fassung vor 9.0.0).md.txt"), "# g, geändert\n");
  assert.equal(io.text(M), "# meine\n", "nie ausgeliefert: bleibt");
  assert.equal(io.text("Module/x.md"), "x", "nur Pfade der Klasse claude");
});

// Gerät mit Dateien im Speicher (Adapter), Netz über requestUrl, Merker in localStorage
const geraet = (o) => {
  const hinweise = [], abrufe = [];
  const r = laden("update", { kontext: {
    obsidian: { Notice: class { constructor(t) { hinweise.push(String(t)); } setMessage() {} hide() {} }, Platform: { isMobile: !!o.mobil },
      requestUrl: async (a) => { abrufe.push(a.url); const b = o.netz[a.url]; return b ? { status: 200, arrayBuffer: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) } : { status: 404 }; } },
    zentral: { status: () => ({ an: !!o.zentral }), RELEASE_ROH: "https://test.invalid/" },
  } });
  const d = {}, lokal = {};
  for (const p of Object.keys(o.dateien || {})) d[p] = enc(o.dateien[p]);
  const app = r.ctx.app;
  app.loadLocalStorage = (k) => (k in lokal ? lokal[k] : null);
  app.saveLocalStorage = (k, v) => { lokal[k] = v; };
  app.vault.adapter = {
    stat: async (p) => (d[p] ? { type: "file" } : null),
    readBinary: async (p) => d[p].buffer.slice(d[p].byteOffset, d[p].byteOffset + d[p].byteLength),
    writeBinary: async (p, buf) => { d[p] = new Uint8Array(buf); },
    exists: async (p) => !!d[p] || Object.keys(d).some((k) => k.indexOf(p + "/") === 0),
    mkdir: async () => {},
    remove: async (p) => { delete d[p]; },
  };
  return { U: r.ctx.update, d, lokal, hinweise, abrufe, text: (p) => (d[p] ? dec(d[p]) : null) };
};

test("Nachholen je Computer: einmal je Version, nicht auf iPhone und iPad, Netz nur mit zentralen Daten", async () => {
  const inhalte = { [CLAUDE]: NEU, [TRESOR]: "# t neu\n" };
  const roh = listeVon("9.0.0", {}, inhalte);
  const liste = geprueft(roh);
  const netz = {};
  for (const p of Object.keys(inhalte)) netz["https://test.invalid/v9.0.0/" + ("Studium Autopilot/" + p).split("/").map(encodeURIComponent).join("/")] = enc(inhalte[p]);
  const F = U.CLAUDE_FRUEHER[CLAUDE][0];

  // Zentrale Daten aus: kein Abruf, kein Merker (beim nächsten Lauf noch einmal)
  let g = geraet({ netz, zentral: false, dateien: { [CLAUDE]: "# meins\n" } });
  let b = await g.U.claudeNachholen(false, { liste });
  assert.equal(b.art, "aus");
  assert.ok(!g.abrufe.length && !g.lokal[g.U.L_CLAUDE] && g.text(CLAUDE) === "# meins\n");

  // Zentrale Daten an: holt, merkt sich Version und Fassungen, sagt es, wenn deine Fassung daneben liegt
  g = geraet({ netz, zentral: true, dateien: { [CLAUDE]: "# meins\n" } });
  b = await g.U.claudeNachholen(false, { liste });
  assert.ok(b.ok, b.fehler);
  assert.equal(g.text(CLAUDE), NEU);
  assert.equal(g.text(TRESOR), "# t neu\n");
  assert.equal(g.text(".claude/CLAUDE (deine Fassung vor 9.0.0).md.txt"), "# meins\n");
  assert.deepEqual(g.lokal[g.U.L_CLAUDE], { version: "9.0.0", sha: { [CLAUDE]: liste.dateien.find((e) => e.pfad === CLAUDE).sha256, [TRESOR]: liste.dateien.find((e) => e.pfad === TRESOR).sha256 } });
  assert.equal(g.hinweise.length, 1);
  assert.match(g.hinweise[0], /Hinweise für Claude.*Version 9\.0\.0.*Sicherung daneben/);
  // Zweiter Lauf derselben Version: nichts
  assert.equal(await g.U.claudeNachholen(false, { liste }), null);

  // Der Merker zählt als bekannt: Ein Gerät, dessen .claude/ eine Version hinterherhinkt, bekommt keine Sicherung daneben
  const bekannt = g.U.claudeBekannt();
  assert.ok(bekannt[CLAUDE].indexOf(F) >= 0 && bekannt[CLAUDE].indexOf(liste.dateien.find((e) => e.pfad === CLAUDE).sha256) >= 0);
  assert.deepEqual(bekannt[TRESOR].slice(-1), [liste.dateien.find((e) => e.pfad === TRESOR).sha256]);
  g.lokal[g.U.L_CLAUDE].sha["../x.md"] = "0".repeat(64);
  g.lokal[g.U.L_CLAUDE].sha[".claude/skills/eigener/SKILL.md"] = "0".repeat(64);
  assert.ok(!("../x.md" in g.U.claudeBekannt()) && !(".claude/skills/eigener/SKILL.md" in g.U.claudeBekannt()));
  const roh2 = listeVon("9.1.0", {}, { [CLAUDE]: "# neuer\n", [TRESOR]: "# t neu\n" });
  const netz2 = { ["https://test.invalid/v9.1.0/" + ["Studium Autopilot", ".claude", "CLAUDE.md"].map(encodeURIComponent).join("/")]: enc("# neuer\n") };
  const g2 = geraet({ netz: netz2, zentral: true, dateien: { [CLAUDE]: NEU, [TRESOR]: "# t neu\n" } });
  g2.lokal[g2.U.L_CLAUDE] = g.lokal[g.U.L_CLAUDE];
  b = await g2.U.claudeNachholen(false, { liste: geprueft(roh2) });
  assert.ok(b.ok, b.fehler);
  assert.deepEqual([b.geaendert, b.gesichert], [[CLAUDE], []]);
  assert.equal(g2.hinweise.length, 0);

  // iPhone und iPad: nie (Claude Code läuft dort nicht); mit immer (Test) doch
  g = geraet({ netz, zentral: true, mobil: true, dateien: { [CLAUDE]: NEU } });
  assert.equal(await g.U.claudeNachholen(false, { liste }), null);
  assert.ok(!g.abrufe.length && g.text(TRESOR) === null);
  b = await g.U.claudeNachholen(true, { liste });
  assert.ok(b.ok && g.text(TRESOR) === "# t neu\n");
});
