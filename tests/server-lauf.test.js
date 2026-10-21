// Tests für server/lauf.mjs (Claude-Lauf) mit einer Claude-Attrappe; dazu die Beispiele des Skills gegen eingang.mjs.
// Ohne server/ (noch nicht im Release) übersprungen.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const assert = require("node:assert/strict");

const SERVER = path.join(__dirname, "..", "server");
const da = fs.existsSync(path.join(SERVER, "lauf.mjs"));
const test = (name, fn) => require("node:test")(name, { skip: !da && "server/ fehlt in diesem Baum" }, fn);
const laden = (d) => import(pathToFileURL(path.join(SERVER, d)).href);
const JETZT = new Date("2026-10-18T05:30:00Z");

// Attrappe: schreibt je nach ATTRAPPE eine Ausgabe und merkt sich ihre Argumente.
const ATTRAPPE = `
const fs = require("node:fs");
fs.writeFileSync("argumente.json", JSON.stringify(process.argv.slice(2)));
const modus = process.env.ATTRAPPE || "ok";
if (modus === "limit") { console.log(JSON.stringify({ is_error: true, result: "You've hit your session limit" })); process.exit(1); }
if (modus === "limit-neu") {
  // während des Laufs holt abrufen.py neue Mails und legt roh/ neu an, dann scheitert der Lauf
  fs.mkdirSync("../../roh/uni-postfach", { recursive: true });
  fs.writeFileSync("../../roh/uni-postfach/106.txt", "Betreff: Neu");
  fs.writeFileSync("../../roh/INDEX.md", "# Neu seit dem letzten Lauf\\n- 18.10.2026 05:30 UTC: Uni-Postfach: 1 neue Mail(s)\\n");
  console.log(JSON.stringify({ is_error: true, result: "You've hit your session limit" }));
  process.exit(1);
}
if (modus === "begleitnotiz") {
  // je Textfassung in unterlagen/ eine Begleitnotiz zur Datei aus ihrer Kopfzeile
  const begleitnotizen = fs.readdirSync("unterlagen").filter((n) => n.endsWith(".md")).map((n) => ({
    datei: /^Datei: (.+)$/m.exec(fs.readFileSync("unterlagen/" + n, "utf8"))[1],
    wichtigste: [{ text: "Deckungsbeitrag = Erlös minus variable Kosten.", seite: 2 }], zu_tun: [], fragen: [{ text: "Wozu fixe Kosten?" }],
  }));
  fs.writeFileSync("ausgabe.json", JSON.stringify({ quellen: [], termine: [], hinweise: [], begleitnotizen }));
}
if (modus === "ok") fs.writeFileSync("ausgabe.json", JSON.stringify({
  quellen: ["gmail", "uni-postfach"], gmail: "ok", weiterleitung: "fehlt",
  termine: [
    { schluessel: "uni-postfach:9#1", titel: "B110 Anmeldung Tutorium", datum: "2026-10-27", kategorie: "Frist", status: "offiziell", code: "B110", quelle_text: "Mail des Lehrstuhls, 17.10.2026" },
    { schluessel: "kaputt", titel: "<b>x</b>", datum: "2026-10-27", kategorie: "Frist", status: "offiziell" }
  ],
  hinweise: [{ text: "Neue Folien in E101.", quelle: "Kursmail, 17.10.2026" }]
}));
console.log(JSON.stringify({ is_error: false, result: "fertig" }));
`;

function umgebung() {
  const v = fs.mkdtempSync(path.join(os.tmpdir(), "studium-lauf-"));
  const skill = path.join(v, "skill");
  fs.mkdirSync(skill);
  fs.writeFileSync(path.join(skill, "SKILL.md"), "# Skill");
  const attrappe = path.join(v, "claude-attrappe.cjs");
  fs.writeFileSync(attrappe, ATTRAPPE);
  fs.mkdirSync(path.join(v, "roh", "uni-postfach"), { recursive: true });
  fs.writeFileSync(path.join(v, "roh", "uni-postfach", "9.txt"), "Betreff: Tutorium\n\nText");
  fs.writeFileSync(path.join(v, "roh", "INDEX.md"), "# Neu seit dem letzten Lauf\n- 18.10.2026 05:15 UTC: Uni-Postfach: 1 neue Mail(s)\n");
  return { v, skill, claude: [process.execPath, attrappe] };
}
const lesen = (d) => JSON.parse(fs.readFileSync(d, "utf8"));
const ordner = (v) => fs.readdirSync(path.join(v, "laeufe"));

test("Lauf: Rohdaten in den Arbeitsordner, Claude mit engen Rechten, geprüfte Ausgabe ins Eingang, Bestand und Zustand nachgezogen", async () => {
  const { laufen, anstossSchreiben } = await laden("lauf.mjs");
  const { v, skill, claude } = umgebung();
  const tresor = { termine: [{ titel: "Eigener Termin", datum: "2026-10-30", bis: "", kategorie: "", code: "", herkunft: "", erledigt: false }],
    todos: [{ text: "Blatt 3 abgeben", code: "E101", frist: "2026-11-02" }] };
  fs.writeFileSync(path.join(v, "stand-plugin.json"), JSON.stringify({ schema: 1, module: ["B110"], studienbeginn: "2026-10-01", variante: "offen", tresor }));
  anstossSchreiben(v, "quellen", JETZT);
  process.env.ATTRAPPE = "ok";
  const zentral = async () => ({ ok: true, json: async () => ({ schema: 1, termine: [{ id: "x", titel: "Dies Universitatis", datum: "2026-10-14", kategorie: "Einführung", quelle_url: "geheim?" }] }) });
  const r = await laufen({ verzeichnis: v, jetzt: JETZT, claude, skill, holen: zentral });
  assert.equal(r.status, "ok");
  assert.deepEqual([r.termine, r.hinweise, r.verworfen], [1, 1, 1]);
  assert.ok(!fs.existsSync(path.join(v, "anstoss")), "Anstoß verbraucht");
  assert.ok(!fs.existsSync(path.join(v, "roh")), "roh übernommen");
  const arbeit = path.join(v, "laeufe", ordner(v)[0]);
  assert.ok(fs.existsSync(path.join(arbeit, "roh", "uni-postfach", "9.txt")));
  assert.ok(fs.existsSync(path.join(arbeit, "skill", "SKILL.md")));
  assert.deepEqual(lesen(path.join(arbeit, "stand.json")), { schema: 1, module: ["B110"], studienbeginn: "2026-10-01", variante: "offen" }, "Stand ohne Auszug");
  assert.deepEqual(lesen(path.join(arbeit, "tresor.json")), tresor, "Auszug aus dem Tresor für Claude");
  assert.deepEqual(lesen(path.join(arbeit, "zentral.json")), [{ titel: "Dies Universitatis", datum: "2026-10-14", bis: "", kategorie: "Einführung" }], "nur kompakte Felder");
  assert.match(fs.readFileSync(path.join(arbeit, "auftrag.md"), "utf8"), /Gmail durchsuchen: ja, Zeitraum newer_than:14d/, "noch nie gesucht: 14 Tage");
  assert.match(fs.readFileSync(path.join(arbeit, "auftrag.md"), "utf8"), /Neue Rohdaten: Uni-Postfach: 1 neue Mail\(s\)\./, "Meldung ohne Zeitstempel");

  assert.equal(lesen(path.join(v, "zustand.json")).laeuftSeit, undefined, "„läuft“ nach dem Lauf wieder weg");
  const argumente = lesen(path.join(arbeit, "argumente.json"));
  assert.equal(argumente[argumente.indexOf("--model") + 1], "sonnet");
  assert.equal(argumente[argumente.indexOf("--tools") + 1], "Read,Write,Edit,Glob,Grep");
  const rechte = lesen(path.join(arbeit, ".rechte.json")).permissions;
  for (const verboten of ["Bash", "Agent", "WebFetch", "Read(//etc/**)", "Read(//run/**)", "mcp__claude_ai_Gmail__send_message", "mcp__claude_ai_Gmail__trash_thread"]) {
    assert.ok(rechte.deny.includes(verboten), verboten);
  }
  assert.ok(rechte.allow.includes("mcp__claude_ai_Gmail__search_threads"), "Gmail lesend erlaubt, weil dran");
  assert.ok(rechte.allow.every((x) => !/^(Write|Edit)\(/.test(x) || x.endsWith("/ausgabe.json)")), "schreiben nur ausgabe.json");
  assert.ok(!rechte.allow.includes("Glob") && !rechte.allow.includes("Grep"), "Glob und Grep nicht pauschal frei");

  const eingang = fs.readdirSync(path.join(v, "eingang"));
  assert.equal(eingang.length, 1);
  const e = lesen(path.join(v, "eingang", eingang[0]));
  assert.deepEqual(e.termine.map((t) => t.titel), ["B110 Anmeldung Tutorium"]);
  assert.deepEqual(e.quellen, ["gmail", "uni-postfach"]);
  assert.equal(Object.keys(lesen(path.join(v, "termine.json"))).length, 1);
  const z = lesen(path.join(v, "zustand.json"));
  assert.deepEqual([z.gmail, z.weiterleitung, z.gmailZuletzt, z.letzterLauf.ok], ["ok", "fehlt", JETZT.toISOString(), true]);
});

test("Zweiter Lauf mit gleichem Ergebnis legt nichts Neues ins Eingang; ohne Neues und ohne Gmail läuft Claude gar nicht", async () => {
  const { laufen, anstossSchreiben } = await laden("lauf.mjs");
  const { v, skill, claude } = umgebung();
  process.env.ATTRAPPE = "ok";
  anstossSchreiben(v, "quellen", JETZT);
  await laufen({ verzeichnis: v, jetzt: JETZT, claude, skill });
  const spaeter = new Date(JETZT.getTime() + 36e5);
  anstossSchreiben(v, "knopf", spaeter);
  const r = await laufen({ verzeichnis: v, jetzt: spaeter, claude, skill });
  assert.equal(r.status, "ok");
  assert.equal(r.termine, 0);
  assert.equal(fs.readdirSync(path.join(v, "eingang")).length, 1, "nichts Neues, auch der Hinweis nicht ein zweites Mal");
  anstossSchreiben(v, "quellen", new Date(spaeter.getTime() + 60e3));
  assert.equal((await laufen({ verzeichnis: v, jetzt: new Date(spaeter.getTime() + 60e3), claude, skill })).status, "nichts-zu-tun");
});

test("Takt und Sicherheitslauf: Auftrag nennt den Sicherheitslauf, Gmail aus sperrt Gmail auch beim Knopf; Hinweise nur einmal (60 Tage)", async () => {
  const { laufen, anstossSchreiben, auftragText } = await laden("lauf.mjs");
  const { nurNeueHinweise } = await laden("eingang.mjs");
  assert.match(auftragText({ jetzt: JETZT, grund: "taeglich", gmail: true, gmailTage: 1, meldungen: [] }), /Täglicher Sicherheitslauf/);
  assert.doesNotMatch(auftragText({ jetzt: JETZT, grund: "quellen", gmail: false, gmailTage: 1, meldungen: ["x"] }), /Sicherheitslauf/);
  const { v, skill, claude } = umgebung();
  fs.writeFileSync(path.join(v, "takt.json"), JSON.stringify({ uni_postfach: 15, gmail: 0 }));
  process.env.ATTRAPPE = "ok";
  anstossSchreiben(v, "knopf", JETZT);
  assert.equal((await laufen({ verzeichnis: v, jetzt: JETZT, claude, skill })).status, "ok");
  const arbeit = path.join(v, "laeufe", ordner(v)[0]);
  assert.ok(lesen(path.join(arbeit, ".rechte.json")).permissions.deny.includes("mcp__claude_ai_Gmail__search_threads"), "Gmail aus: auch der Knopf öffnet Gmail nicht");
  assert.match(fs.readFileSync(path.join(arbeit, "auftrag.md"), "utf8"), /Gmail durchsuchen: nein/);
  // Hinweise: gleicher Text (auch anders geschrieben) nur einmal, nach 60 Tagen wieder
  const h = (text) => ({ text });
  const a = nurNeueHinweise([h("Neue Folien in E101."), h("neue folien in e101")], {}, JETZT);
  assert.deepEqual(a.hinweise.map((x) => x.text), ["Neue Folien in E101."]);
  assert.deepEqual(nurNeueHinweise([h("Neue Folien in E101!")], a.bisher, JETZT).hinweise, []);
  assert.equal(nurNeueHinweise([h("Neue Folien in E101.")], a.bisher, new Date(JETZT.getTime() + 61 * 864e5)).hinweise.length, 1);
  assert.deepEqual(Object.keys(lesen(path.join(v, "hinweise-bisher.json"))).length, 1, "der Lauf merkt sich seinen Hinweis");
});

test("Unterlagen: bis 6 je Lauf (älteste zuerst) in den Arbeitsordner, Begleitnotizen ins Eingang, Rest stößt den nächsten Lauf an, Fehlschlag legt sie zurück", async () => {
  const { laufen, anstossSchreiben } = await laden("lauf.mjs");
  const { v, skill, claude } = umgebung();
  fs.rmSync(path.join(v, "roh"), { recursive: true, force: true });
  const neu = path.join(v, "unterlagen", "neu");
  fs.mkdirSync(neu, { recursive: true });
  for (let i = 1; i <= 7; i++) {
    const p = path.join(neu, String(i).repeat(64) + ".md");
    fs.writeFileSync(p, `# B110 Folien 0${i}\n\nDatei: Unterlagen/B110 Einführung/B110 Folien 0${i}.pdf\nModul: B110 · Art: Folien\n\n---\n[S. 1]\nText`);
    fs.utimesSync(p, new Date(2026, 9, i), new Date(2026, 9, i)); // älteste zuerst
  }
  process.env.ATTRAPPE = "begleitnotiz";
  anstossSchreiben(v, "unterlagen", JETZT);
  const r = await laufen({ verzeichnis: v, jetzt: JETZT, claude, skill, holen: async () => ({ ok: false }) });
  assert.deepEqual([r.status, r.begleitnotizen], ["ok", 6]);
  const arbeit = path.join(v, "laeufe", ordner(v)[0]);
  assert.deepEqual(fs.readdirSync(path.join(arbeit, "unterlagen")).sort(), ["1", "2", "3", "4", "5", "6"].map((c) => c.repeat(64) + ".md"));
  assert.match(fs.readFileSync(path.join(arbeit, "auftrag.md"), "utf8"), /Neue Unterlagen für Begleitnotizen: 6 \(Ordner unterlagen\/\)\./);
  assert.match(fs.readFileSync(path.join(arbeit, "auftrag.md"), "utf8"), /auch skill\/begleitnotiz\.md/);
  const eingang = lesen(path.join(v, "eingang", fs.readdirSync(path.join(v, "eingang"))[0]));
  assert.deepEqual(eingang.begleitnotizen.map((b) => b.datei), [1, 2, 3, 4, 5, 6].map((i) => `Unterlagen/B110 Einführung/B110 Folien 0${i}.pdf`));
  assert.deepEqual(eingang.begleitnotizen[0].wichtigste, [{ text: "Deckungsbeitrag = Erlös minus variable Kosten.", seite: 2 }]);
  assert.deepEqual(fs.readdirSync(neu), ["7".repeat(64) + ".md"], "eine wartet noch");
  assert.equal(lesen(path.join(v, "anstoss")).grund, "unterlagen", "nächster Lauf gleich angestoßen");

  // Fehlschlag: die übernommene Unterlage kommt zurück, kein neuer Anstoß
  process.env.ATTRAPPE = "limit";
  const r2 = await laufen({ verzeichnis: v, jetzt: new Date(JETZT.getTime() + 60e3), claude, skill, holen: async () => ({ ok: false }) });
  assert.equal(r2.status, "claude-limit");
  assert.deepEqual(fs.readdirSync(neu), ["7".repeat(64) + ".md"], "zurück in unterlagen/neu");
  assert.ok(!fs.existsSync(path.join(v, "anstoss")), "kein Anstoß im Kreis");

  // Grenze in Zeichen: große Textfassungen kommen einzeln (Claudes Kontext), die erste immer
  fs.rmSync(neu, { recursive: true, force: true });
  fs.mkdirSync(neu, { recursive: true });
  for (const [i, c] of [[1, "a"], [2, "b"], [3, "c"]]) {
    const p = path.join(neu, c.repeat(64) + ".md");
    fs.writeFileSync(p, `# B110 Skript ${i}\n\nDatei: Unterlagen/B110 Einführung/B110 Skript ${i}.pdf\nModul: B110 · Art: Skript\n\n---\n` + "x".repeat(i === 3 ? 1000 : 150000));
    fs.utimesSync(p, new Date(2026, 9, i), new Date(2026, 9, i));
  }
  process.env.ATTRAPPE = "begleitnotiz";
  anstossSchreiben(v, "unterlagen", JETZT);
  await laufen({ verzeichnis: v, jetzt: new Date(JETZT.getTime() + 120e3), claude, skill, holen: async () => ({ ok: false }) });
  assert.deepEqual(fs.readdirSync(neu).sort(), ["b".repeat(64) + ".md", "c".repeat(64) + ".md"], "150 000 + 150 000 Zeichen passen nicht zusammen");
  await laufen({ verzeichnis: v, jetzt: new Date(JETZT.getTime() + 180e3), claude, skill, holen: async () => ({ ok: false }) });
  assert.deepEqual(fs.readdirSync(neu), [], "150 000 + 1 000 schon");
});

test("Zusammenfassen auf Wunsch: eigener Lauf mit Opus vor dem gewöhnlichen, nur diese Unterlagen, ohne Mails; PDFs mit und danach weg; Fehlschlag legt sie zurück", async () => {
  const { laufen, anstossSchreiben } = await laden("lauf.mjs");
  const { v, skill, claude } = umgebung();
  const opus = path.join(v, "unterlagen", "opus"), neu = path.join(v, "unterlagen", "neu");
  for (const [d, c] of [[opus, "a"], [opus, "b"], [opus, "c"], [opus, "d"], [neu, "e"]]) {
    fs.mkdirSync(d, { recursive: true });
    fs.writeFileSync(path.join(d, c.repeat(64) + ".md"), `# B110 Folien ${c}

Datei: Unterlagen/B110 Einführung/B110 Folien ${c}.pdf
Modul: B110 · Art: Folien

---
[S. 1]
Text`);
  }
  fs.writeFileSync(path.join(opus, "a".repeat(64) + ".pdf"), "%PDF-1.7\n");
  process.env.ATTRAPPE = "begleitnotiz";
  anstossSchreiben(v, "gmail", JETZT);
  const r = await laufen({ verzeichnis: v, jetzt: JETZT, claude, skill, holen: async () => ({ ok: false }) });
  assert.deepEqual([r.status, r.opus.status, r.opus.begleitnotizen], ["ok", "ok", 3]);
  const [erster, zweiter] = ordner(v).sort();
  const argumente = (o) => lesen(path.join(v, "laeufe", o, "argumente.json"));
  const modell = (o) => argumente(o)[argumente(o).indexOf("--model") + 1];
  assert.deepEqual([modell(erster), modell(zweiter)], ["opus", "sonnet"]);
  assert.equal(fs.readdirSync(path.join(v, "laeufe", erster, "unterlagen")).length, 3, "höchstens 3 je Opus-Lauf");
  assert.deepEqual(fs.readdirSync(path.join(v, "laeufe", erster, "roh")), [], "keine Mails im Opus-Lauf");
  const auftrag = fs.readFileSync(path.join(v, "laeufe", erster, "auftrag.md"), "utf8");
  assert.match(auftrag, /Gmail durchsuchen: nein/);
  assert.match(auftrag, /die die Person ausgewählt hat/);
  assert.match(auftrag, /nennt ihr Kopf eine PDF, die PDF/);
  assert.ok(!fs.readdirSync(path.join(v, "laeufe", erster, "unterlagen")).some((n) => n.endsWith(".pdf")), "PDF mit in den Lauf, danach gelöscht");
  assert.ok(!lesen(path.join(v, "laeufe", erster, ".rechte.json")).permissions.allow.some((x) => x.includes("Gmail")), "kein Gmail im Opus-Lauf");
  assert.ok(fs.existsSync(path.join(v, "laeufe", zweiter, "roh", "uni-postfach", "9.txt")), "die Mails im gewöhnlichen Lauf");
  assert.equal(lesen(path.join(v, "laeufe", zweiter, "protokoll.json")).gmail, true, "der Anlass gmail gilt weiter");
  assert.deepEqual(fs.readdirSync(opus), ["d".repeat(64) + ".md"], "eine wartet noch");
  assert.equal(lesen(path.join(v, "anstoss")).grund, "unterlagen", "nächster Lauf gleich angestoßen");

  // Fehlschlag des Opus-Laufs: Unterlage mit PDF zurück nach opus/, der gewöhnliche Lauf läuft trotzdem
  fs.writeFileSync(path.join(opus, "d".repeat(64) + ".pdf"), "%PDF-1.7\n");
  process.env.ATTRAPPE = "limit";
  const r2 = await laufen({ verzeichnis: v, jetzt: new Date(JETZT.getTime() + 60e3), claude, skill, holen: async () => ({ ok: false }) });
  assert.equal(r2.status, "claude-limit");
  assert.deepEqual(fs.readdirSync(opus).sort(), ["d".repeat(64) + ".md", "d".repeat(64) + ".pdf"]);
  delete process.env.ATTRAPPE;
});

test("Fehlschläge: Rohdaten kommen zurück, Zustand meldet Limit bzw. ungültige Ausgabe", async () => {
  const { laufen, anstossSchreiben } = await laden("lauf.mjs");
  const { v, skill, claude } = umgebung();
  process.env.ATTRAPPE = "limit";
  anstossSchreiben(v, "gmail", JETZT);
  assert.equal((await laufen({ verzeichnis: v, jetzt: JETZT, claude, skill })).status, "claude-limit");
  assert.ok(fs.existsSync(path.join(v, "roh", "uni-postfach", "9.txt")), "Rohdaten zurück");
  let z = lesen(path.join(v, "zustand.json"));
  assert.deepEqual([z.letzterLauf.ok, z.fehler], [false, ["claude-limit"]]);
  process.env.ATTRAPPE = "keine-ausgabe";
  anstossSchreiben(v, "gmail", JETZT);
  assert.equal((await laufen({ verzeichnis: v, jetzt: JETZT, claude, skill })).status, "ausgabe-ungueltig");
  z = lesen(path.join(v, "zustand.json"));
  assert.deepEqual(z.fehler, ["ausgabe-ungueltig"], "alter Fehler ersetzt");
  assert.match(fs.readFileSync(path.join(v, "roh", "INDEX.md"), "utf8"), /1 neue Mail/);
});

test("Fehlschlag, während neue Mails kommen: die alten kommen zurück in den neu angelegten Ordner, nichts geht verloren", async () => {
  const { laufen, anstossSchreiben } = await laden("lauf.mjs");
  const { v, skill, claude } = umgebung();
  process.env.ATTRAPPE = "limit-neu";
  anstossSchreiben(v, "quellen", JETZT);
  const r = await laufen({ verzeichnis: v, jetzt: JETZT, claude, skill, holen: async () => ({ ok: false }) });
  assert.equal(r.status, "claude-limit");
  assert.deepEqual(fs.readdirSync(path.join(v, "roh", "uni-postfach")).sort(), ["106.txt", "9.txt"]);
  const index = fs.readFileSync(path.join(v, "roh", "INDEX.md"), "utf8");
  assert.match(index, /05:15 UTC: Uni-Postfach: 1 neue Mail/, "Meldung des gescheiterten Laufs");
  assert.match(index, /05:30 UTC: Uni-Postfach: 1 neue Mail/, "neue Meldung");
  assert.equal((index.match(/^# /gm) || []).length, 1, "eine Überschrift");
});

// Rechte gibt es so nur unter Linux/macOS (unter Windows übersprungen, GitHub Actions prüft es)
require("node:test")("Fehlschlag: zurückgelegte Ordner bleiben für den Abruf (eigener Benutzer, gleiche Gruppe) beschreibbar", {
  skip: (!da && "server/ fehlt in diesem Baum") || (process.platform === "win32" && "Rechte nur unter Linux/macOS"),
}, async () => {
  const { laufen, anstossSchreiben } = await laden("lauf.mjs");
  const { v, skill, claude } = umgebung();
  const alt = process.umask(0o022);
  try {
    process.env.ATTRAPPE = "limit";
    anstossSchreiben(v, "gmail", JETZT);
    assert.equal((await laufen({ verzeichnis: v, jetzt: JETZT, claude, skill })).status, "claude-limit");
    for (const o of ["roh", path.join("roh", "uni-postfach")]) assert.equal(fs.statSync(path.join(v, o)).mode & 0o777, 0o770, o);
  } finally { process.umask(alt); }
});

test("Zentrale Termine: ohne Netz oder bei Fehler leere Liste, der Lauf geht weiter", async () => {
  const { zentralHolen } = await laden("lauf.mjs");
  assert.deepEqual(await zentralHolen(async () => { throw new Error("offline"); }), []);
  assert.deepEqual(await zentralHolen(async () => ({ ok: false })), []);
  assert.deepEqual(await zentralHolen(async () => ({ ok: true, json: async () => ({ termine: "kaputt" }) })), []);
});

test("Gmail: dran bei Gmail-Zeit, Knopf und Sicherheitslauf, sonst nach dem Takt; Takt 0 nie; Rechte sperren Gmail, wenn nicht dran", async () => {
  const { gmailDran, gmailZeitDran, taktLesen, rechte } = await laden("lauf.mjs");
  const vor = (h) => new Date(JETZT.getTime() - h * 36e5).toISOString();
  assert.equal(gmailDran({ grund: "quellen" }, { gmailZuletzt: vor(1) }, JETZT), false);
  assert.equal(gmailDran({ grund: "quellen" }, { gmailZuletzt: vor(4) }, JETZT), true);
  assert.equal(gmailDran({ grund: "knopf" }, { gmailZuletzt: vor(0) }, JETZT), true);
  assert.equal(gmailDran({ grund: "taeglich" }, { gmailZuletzt: vor(0) }, JETZT), true);
  // einmal am Tag: ein anderer Lauf nimmt Gmail erst nach 20 Stunden mit; nie: auch Knopf und Sicherheitslauf nicht
  assert.equal(gmailDran({ grund: "quellen" }, { gmailZuletzt: vor(4) }, JETZT, 1), false);
  assert.equal(gmailDran({ grund: "quellen" }, { gmailZuletzt: vor(21) }, JETZT, 1), true);
  assert.equal(gmailDran({ grund: "knopf" }, {}, JETZT, 0), false);
  assert.equal(gmailDran({ grund: "taeglich" }, {}, JETZT, 0), false);
  // Gmail-Zeit (07:30, 13:30, 19:30): dreimal → nur, wenn die letzte Suche über 2 Stunden her ist (06:30 ersetzt 07:30);
  // einmal → über 20 Stunden; nie → nie
  assert.equal(gmailZeitDran({ gmailZuletzt: vor(1) }, JETZT, 3), false);
  assert.equal(gmailZeitDran({ gmailZuletzt: vor(6) }, JETZT, 3), true);
  assert.equal(gmailZeitDran({ gmailZuletzt: vor(6) }, JETZT, 1), false);
  assert.equal(gmailZeitDran({}, JETZT, 1), true);
  assert.equal(gmailZeitDran({}, JETZT, 0), false);
  const v = fs.mkdtempSync(path.join(os.tmpdir(), "studium-takt-"));
  assert.deepEqual(taktLesen(v), { uni_postfach: 15, gmail: 3 }, "ohne takt.json der Standard");
  fs.writeFileSync(path.join(v, "takt.json"), JSON.stringify({ uni_postfach: 60, gmail: 0 }));
  assert.deepEqual(taktLesen(v), { uni_postfach: 60, gmail: 0 });
  fs.writeFileSync(path.join(v, "takt.json"), JSON.stringify({ uni_postfach: 1, gmail: 7 }));
  assert.deepEqual(taktLesen(v), { uni_postfach: 15, gmail: 3 });
  const r = rechte("/var/lib/studium-server/laeufe/x", false).permissions;
  assert.ok(r.deny.includes("mcp__claude_ai_Gmail__search_threads"));
  assert.ok(r.allow.includes("Read(//var/lib/studium-server/laeufe/x/**)"));
});

test("Skill: Beispiel aus ausgabe.md besteht die Prüfung, Kategorien gleich wie eingang.mjs", async () => {
  const { eingangNormal, KATEGORIEN } = await laden("eingang.mjs");
  const text = fs.readFileSync(path.join(SERVER, "skill", "studium-autopilot", "ausgabe.md"), "utf8");
  const beispiel = JSON.parse(/```json\n([\s\S]*?)\n```/.exec(text)[1]);
  const { eingang, verworfen } = eingangNormal(beispiel, { jetzt: JETZT });
  assert.deepEqual(verworfen, []);
  assert.equal(eingang.termine.length, 1);
  const zeile = text.split("\n").find((z) => z.startsWith("| `kategorie` |"));
  assert.deepEqual(zeile.match(/`([A-ZÄÖÜ][a-zäöüß]+)`/g).map((k) => k.slice(1, -1)), KATEGORIEN);
  // zweites Beispiel: Begleitnotizen
  const teil = JSON.parse("{" + [...text.matchAll(/```json\n([\s\S]*?)\n```/g)][1][1] + "}");
  const b = eingangNormal(Object.assign({ termine: [], hinweise: [] }, teil), { jetzt: JETZT });
  assert.deepEqual(b.verworfen, []);
  assert.equal(b.eingang.begleitnotizen.length, 1);
  assert.deepEqual(b.eingang.begleitnotizen[0].wichtigste[0], { begriff: "Deckungsbeitrag", text: "Erlös minus variable Kosten.", seite: 7, bis: 8 });
});
