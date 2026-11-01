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
// Claude Code endet am Limit nicht immer mit einem Fehlercode
if (modus === "limit-ohne-code") { console.log(JSON.stringify({ is_error: true, result: "You've hit your limit · resets 7pm (Europe/Berlin)" })); process.exit(0); }
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
if (modus === "kapitel") {
  // merkt sich, was es sah (Folien, bisherige Listen); liefert eine Liste für B110 (Vorlesung in der Zukunft) und eine ungefragte
  fs.writeFileSync("gesehen.json", JSON.stringify({ kapitel: fs.readdirSync("kapitel"), bisher: JSON.parse(fs.readFileSync("kapitel-bisher.json", "utf8")) }));
  fs.writeFileSync("ausgabe.json", JSON.stringify({ quellen: [], termine: [], hinweise: [], kapitel: [
    { code: "B110", semester: "WS 2026/27", quelle: "Folien 00, S. 3", kapitel: [{ nr: "1", titel: "Grundlagen", seiten: 20, folien: 1, vorlesung: "2026-10-14" },
      { nr: "2", titel: "Kosten", vorlesung: "2027-01-01" }] },
    { code: "E101", semester: "WS 2026/27", quelle: "", kapitel: [{ nr: "1", titel: "Märkte" }] },
  ] }));
}
if (modus === "ok") fs.writeFileSync("ausgabe.json", JSON.stringify({
  quellen: ["gmail", "uni-postfach"], gmail: "ok", weiterleitung: "fehlt",
  termine: [
    { schluessel: "uni-postfach:9#1", titel: "B110 Anmeldung Tutorium", datum: "2026-10-27", kategorie: "Frist", status: "offiziell", code: "B110", quelle_text: "Mail des Lehrstuhls, 17.10.2026" },
    { schluessel: "kaputt", titel: "<b>x</b>", datum: "2026-10-27", kategorie: "Frist", status: "offiziell" }
  ],
  hinweise: [{ text: "Neue Folien in E101.", quelle: "Kursmail, 17.10.2026" }]
}));
console.log(JSON.stringify({ is_error: false, result: "fertig", num_turns: 3, duration_ms: 1200, total_cost_usd: 0.123456,
  usage: { input_tokens: 10, output_tokens: 200, cache_read_input_tokens: 3000, cache_creation_input_tokens: 400 } }));
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
  await laufen({ verzeichnis: v, jetzt: new Date(JETZT.getTime() + 36e5), claude, skill, holen: async () => ({ ok: false }) }); // nach dem Limit
  assert.deepEqual(fs.readdirSync(neu).sort(), ["b".repeat(64) + ".md", "c".repeat(64) + ".md"], "150 000 + 150 000 Zeichen passen nicht zusammen");
  await laufen({ verzeichnis: v, jetzt: new Date(JETZT.getTime() + 36e5 + 60e3), claude, skill, holen: async () => ({ ok: false }) });
  assert.deepEqual(fs.readdirSync(neu), [], "150 000 + 1 000 schon");
});

test("Kapitellisten: Folien gefragter Module in den gewöhnlichen Lauf, ungefragte weg; nur neue oder geänderte Listen ins Eingang, bisherige für Claude", async () => {
  const { laufen, anstossSchreiben } = await laden("lauf.mjs");
  const { v, skill, claude } = umgebung();
  fs.rmSync(path.join(v, "roh"), { recursive: true, force: true });
  const lernplan = { semester: "WS 2026/27", module: ["B110"] };
  // aus der Lernplan-Notiz (Server neu eingerichtet, kapitel.json fehlt); S100 ist nicht gefragt
  const listen = [{ code: "B110", kapitel: [{ nr: "1", titel: "Grundlagen der BWL" }] }, { code: "S100", kapitel: [{ nr: "1", titel: "Mengen" }] }];
  fs.writeFileSync(path.join(v, "stand-plugin.json"), JSON.stringify({ schema: 1, module: ["B110", "S100"], lernplan: { ...lernplan, listen }, tresor: { termine: [], todos: [] } }));
  fs.writeFileSync(path.join(v, "zustand.json"), JSON.stringify({ gmailZuletzt: JETZT.toISOString() })); // Gmail gerade durchsucht
  const ordnerK = path.join(v, "unterlagen", "kapitel");
  fs.mkdirSync(ordnerK, { recursive: true });
  const folien = (c, code, nr) => fs.writeFileSync(path.join(ordnerK, c.repeat(64) + ".md"),
    `# ${code} Folien 0${nr}\n\nDatei: Unterlagen/${code}/${code} Folien 0${nr}.pdf\nModul: ${code} · Art: Folien · Nummer: ${nr}\nAuftrag: nur Kapitelliste (Lernplan)\n\n---\n[S. 1]\nGliederung`);
  folien("a", "B110", 0);
  folien("b", "S100", 0);
  process.env.ATTRAPPE = "kapitel";
  anstossSchreiben(v, "lernplan", JETZT);
  const r = await laufen({ verzeichnis: v, jetzt: JETZT, claude, skill, holen: async () => ({ ok: false }) });
  assert.deepEqual([r.status, r.kapitel, r.verworfen], ["ok", 1, 1], "E101 ist nicht gefragt");
  const arbeit = path.join(v, "laeufe", ordner(v)[0]);
  assert.deepEqual(lesen(path.join(arbeit, "gesehen.json")), { kapitel: ["a".repeat(64) + ".md"],
    bisher: [{ code: "B110", semester: "WS 2026/27", herkunft: "notiz", kapitel: [{ nr: "1", titel: "Grundlagen der BWL" }] }] }, "ohne eigene Liste die aus der Notiz");
  assert.deepEqual(fs.readdirSync(ordnerK), [], "S100 ist nicht gefragt: weg, ohne Lauf");
  const auftrag = fs.readFileSync(path.join(arbeit, "auftrag.md"), "utf8");
  assert.match(auftrag, /Neue Folien für Kapitellisten \(Lernplan\): 1 \(Ordner kapitel\/, bisherige Listen in kapitel-bisher\.json\)\./);
  assert.match(auftrag, /für die Kapitellisten auch skill\/lernplan\.md/);
  assert.deepEqual(lesen(path.join(arbeit, "stand.json")).lernplan, lernplan, "die Listen nur in kapitel-bisher.json");
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(arbeit, ".rechte.json"), "utf8")).permissions.allow.filter((x) => x.startsWith("Write")).length, 1, "schreibt nur ausgabe.json");
  const eingang = lesen(path.join(v, "eingang", fs.readdirSync(path.join(v, "eingang"))[0]));
  assert.deepEqual(eingang.kapitel, [{ code: "B110", semester: "WS 2026/27", quelle: "Folien 00, S. 3", stand: "2026-10-18", vorlaeufig: false,
    kapitel: [{ nr: "1", titel: "Grundlagen", seiten: 20, folien: 1, vorlesung: "2026-10-14" }, { nr: "2", titel: "Kosten" }] }]);
  assert.deepEqual(Object.keys(lesen(path.join(v, "kapitel.json"))), ["B110 WS 2026/27"], "Bestand auf dem Server");
  assert.equal(lesen(path.join(arbeit, "protokoll.json")).modell, "sonnet", "Modell des Servers, kein Opus");

  // neue Folien, dieselbe Liste: Claude sieht die bisherige, ins Eingang kommt nichts
  fs.rmSync(path.join(v, "eingang"), { recursive: true, force: true });
  folien("c", "B110", 1);
  anstossSchreiben(v, "lernplan", JETZT);
  const r2 = await laufen({ verzeichnis: v, jetzt: new Date(JETZT.getTime() + 60e3), claude, skill, holen: async () => ({ ok: false }) });
  assert.deepEqual([r2.status, r2.kapitel], ["ok", 0]);
  const zweiter = path.join(v, "laeufe", ordner(v).sort()[1]);
  assert.deepEqual(lesen(path.join(zweiter, "gesehen.json")).bisher.map((e) => [e.code, e.herkunft, e.kapitel[0].titel]), [["B110", undefined, "Grundlagen"]],
    "die eigene Liste geht vor");
  assert.deepEqual(fs.readdirSync(path.join(v, "eingang")), [], "nichts Neues");

  // ohne neue Folien und ohne Mails läuft Claude nicht; ein Fehlschlag legt die Folien zurück
  anstossSchreiben(v, "lernplan", JETZT);
  assert.equal((await laufen({ verzeichnis: v, jetzt: new Date(JETZT.getTime() + 120e3), claude, skill, holen: async () => ({ ok: false }) })).status, "nichts-zu-tun");
  folien("d", "B110", 2);
  process.env.ATTRAPPE = "limit";
  anstossSchreiben(v, "lernplan", JETZT);
  assert.equal((await laufen({ verzeichnis: v, jetzt: new Date(JETZT.getTime() + 180e3), claude, skill, holen: async () => ({ ok: false }) })).status, "claude-limit");
  assert.deepEqual(fs.readdirSync(ordnerK), ["d".repeat(64) + ".md"], "zurück in unterlagen/kapitel");
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

  // Fehlschlag des Opus-Laufs am Limit: Unterlage mit PDF zurück nach opus/; der gewöhnliche Lauf hinge ebenso und wartet auf den
  // nächsten Versuch, neue Mails bleiben in roh/
  fs.writeFileSync(path.join(opus, "d".repeat(64) + ".pdf"), "%PDF-1.7\n");
  fs.mkdirSync(path.join(v, "roh", "uni-postfach"), { recursive: true });
  fs.writeFileSync(path.join(v, "roh", "uni-postfach", "10.txt"), "Betreff: Neu");
  process.env.ATTRAPPE = "limit";
  const r2 = await laufen({ verzeichnis: v, jetzt: new Date(JETZT.getTime() + 60e3), claude, skill, holen: async () => ({ ok: false }) });
  assert.equal(r2.status, "claude-limit");
  assert.deepEqual(fs.readdirSync(opus).sort(), ["d".repeat(64) + ".md", "d".repeat(64) + ".pdf"]);
  assert.equal(ordner(v).length, 3, "kein gewöhnlicher Lauf nach dem Opus-Lauf am Limit");
  assert.deepEqual(fs.readdirSync(path.join(v, "roh", "uni-postfach")), ["10.txt"]);
  assert.equal(lesen(path.join(v, "zustand.json")).limit.versuche, 1);
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
  anstossSchreiben(v, "knopf", JETZT); // am Limit startet nur der Knopf einen Lauf
  assert.equal((await laufen({ verzeichnis: v, jetzt: JETZT, claude, skill })).status, "ausgabe-ungueltig");
  z = lesen(path.join(v, "zustand.json"));
  assert.deepEqual(z.fehler, ["ausgabe-ungueltig"], "alter Fehler ersetzt");
  assert.equal(z.limit, undefined, "ein anderer Fehler beendet die Versuche");
  assert.match(fs.readFileSync(path.join(v, "roh", "INDEX.md"), "utf8"), /1 neue Mail/);
});

test("Limit des Claude-Abos: nächster Versuch nach 30 Min., 1 Std., dann alle 2 Std.; bis dahin nur der Knopf; Gmail kommt mit; Verbrauch je Lauf und Tag", async () => {
  const { laufen, anstossSchreiben, limitWarten, nutzungBuchen } = await laden("lauf.mjs");
  const { v, skill, claude } = umgebung();
  const MIN = 60e3, zustand = () => lesen(path.join(v, "zustand.json"));
  const lauf = (grund, minuten, modus) => {
    process.env.ATTRAPPE = modus;
    anstossSchreiben(v, grund, JETZT);
    return laufen({ verzeichnis: v, jetzt: new Date(JETZT.getTime() + minuten * MIN), claude, skill, holen: async () => ({ ok: false }) });
  };
  assert.deepEqual([1, 2, 3, 7].map(limitWarten), [30 * MIN, 60 * MIN, 120 * MIN, 120 * MIN]);

  // Gmail-Zeit am Limit
  const r = await lauf("gmail", 0, "limit");
  assert.deepEqual([r.status, r.wieder], ["claude-limit", "2026-10-18T06:00:00.000Z"]);
  assert.deepEqual(zustand().limit, { seit: JETZT.toISOString(), versuche: 1, wieder: "2026-10-18T06:00:00.000Z", gmail: true });
  assert.ok(fs.existsSync(path.join(v, "roh", "uni-postfach", "9.txt")), "Rohdaten zurück");

  // neue Mail vor dem nächsten Versuch: kein Lauf, nichts angefasst
  assert.deepEqual(await lauf("quellen", 10, "ok"), { status: "limit-wartet", wieder: "2026-10-18T06:00:00.000Z" });
  assert.equal(ordner(v).length, 1, "kein Lauf-Ordner");
  assert.ok(fs.existsSync(path.join(v, "roh", "uni-postfach", "9.txt")));
  assert.ok(!fs.existsSync(path.join(v, "anstoss")), "Anstoß verbraucht, kein Kreis");

  // der Knopf versucht es trotzdem; wieder am Limit (ohne Fehlercode): länger warten
  assert.equal((await lauf("knopf", 15, "limit-ohne-code")).status, "claude-limit");
  assert.deepEqual([zustand().limit.versuche, zustand().limit.wieder, zustand().limit.seit], [2, "2026-10-18T06:45:00.000Z", JETZT.toISOString()]);

  // nächster Versuch (vom Dienst angestoßen): mit Gmail, weil eine Gmail-Suche am Limit hing; danach ist das Limit vorbei
  const ok = await lauf("wiederholung", 76, "ok");
  assert.equal(ok.status, "ok");
  const letzter = path.join(v, "laeufe", ordner(v).sort().pop());
  assert.equal(lesen(path.join(letzter, "protokoll.json")).gmail, true);
  assert.equal(zustand().limit, undefined);
  assert.deepEqual(lesen(path.join(letzter, "protokoll.json")).nutzung,
    { eingabe: 10, ausgabe: 200, cache_lesen: 3000, cache_schreiben: 400, runden: 3, dauer_ms: 1200, listenpreis_usd: 0.1235 });
  assert.deepEqual(lesen(path.join(v, "nutzung.json")), { "2026-10-18": { laeufe: 3, opus: 0, limit: 2, eingabe: 10, ausgabe: 200, cache_lesen: 3000, cache_schreiben: 400 } });

  // nichts mehr zu tun beim nächsten Versuch (ohne Gmail): das Limit ist trotzdem vorbei
  fs.writeFileSync(path.join(v, "zustand.json"), JSON.stringify({ ...zustand(), limit: { versuche: 1, wieder: JETZT.toISOString(), gmail: false } }));
  assert.equal((await lauf("wiederholung", 90, "ok")).status, "nichts-zu-tun");
  assert.equal(zustand().limit, undefined);

  // Verbrauch: Tage in Berlin, nach 30 Tagen weg
  fs.writeFileSync(path.join(v, "nutzung.json"), JSON.stringify({ "2026-09-19": { laeufe: 1 }, "2026-09-20": { laeufe: 1 } }));
  nutzungBuchen(v, new Date("2026-10-18T22:30:00Z"), { opus: true, limit: false, nutzung: null });
  assert.deepEqual(Object.keys(lesen(path.join(v, "nutzung.json"))), ["2026-09-20", "2026-10-19"], "30 Tage; 00:30 in Berlin ist schon der 19.");
  delete process.env.ATTRAPPE;
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

test("Abgebrochener Lauf (Zeitgrenze, Neustart): Rohdaten und Unterlagen zurück, „läuft“ weg, kein neuer Anstoß; der nächste Lauf holt sie", async () => {
  const { laufen, anstossSchreiben, verwaisteZurueck } = await laden("lauf.mjs");
  const { v, skill, claude } = umgebung();
  // Zustand mitten im Lauf nachgestellt: Ordner wie von einLauf, ohne protokoll.json
  const arbeit = path.join(v, "laeufe", "20261018T053000Z");
  fs.mkdirSync(path.join(arbeit, "unterlagen"), { recursive: true });
  fs.renameSync(path.join(v, "roh"), path.join(arbeit, "roh"));
  fs.writeFileSync(path.join(arbeit, ".lauf.json"), JSON.stringify({ opus: true }));
  fs.writeFileSync(path.join(arbeit, "unterlagen", "a".repeat(64) + ".md"), "# Folien");
  fs.writeFileSync(path.join(v, "zustand.json"), JSON.stringify({ laeuftSeit: JETZT.toISOString(), gmail: "ok" }));
  assert.deepEqual(verwaisteZurueck(v, JETZT), ["20261018T053000Z"]);
  assert.ok(fs.existsSync(path.join(v, "roh", "uni-postfach", "9.txt")), "Rohdaten zurück");
  assert.deepEqual(fs.readdirSync(path.join(v, "unterlagen", "opus")), ["a".repeat(64) + ".md"], "Unterlage zurück nach opus/");
  const z = lesen(path.join(v, "zustand.json"));
  assert.deepEqual([z.laeuftSeit, z.fehler, z.letzterLauf.ok, z.gmail], [undefined, ["claude-lauf"], false, "ok"]);
  assert.equal(lesen(path.join(arbeit, "protokoll.json")).code, "abgebrochen");
  assert.ok(!fs.existsSync(path.join(v, "anstoss")), "kein neuer Anstoß");
  assert.deepEqual(verwaisteZurueck(v, JETZT), [], "nur einmal");

  // ein Abbruch ohne SIGTERM (Absturz): laufen holt es vor dem nächsten Lauf nach
  fs.rmSync(path.join(v, "unterlagen"), { recursive: true });
  fs.rmSync(path.join(arbeit, "protokoll.json"));
  fs.rmSync(path.join(arbeit, "roh"), { recursive: true });
  fs.renameSync(path.join(v, "roh"), path.join(arbeit, "roh"));
  process.env.ATTRAPPE = "ok";
  anstossSchreiben(v, "quellen", JETZT);
  const r = await laufen({ verzeichnis: v, jetzt: new Date(JETZT.getTime() + 60e3), claude, skill, holen: async () => ({ ok: false }) });
  delete process.env.ATTRAPPE;
  assert.equal(r.status, "ok");
  const neuer = ordner(v).sort().pop();
  assert.ok(fs.existsSync(path.join(v, "laeufe", neuer, "roh", "uni-postfach", "9.txt")), "die Mails im nächsten Lauf");
  assert.equal(lesen(path.join(v, "laeufe", neuer, ".lauf.json")).opus, false);
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
  // drittes Beispiel: Kapitellisten, ganz übernommen
  const kap = JSON.parse("{" + [...text.matchAll(/```json\n([\s\S]*?)\n```/g)][2][1] + "}");
  const c = eingangNormal(Object.assign({ termine: [], hinweise: [] }, kap), { jetzt: JETZT });
  assert.deepEqual(c.verworfen, []);
  assert.deepEqual(c.eingang.kapitel, kap.kapitel.map((e) => Object.assign({ vorlaeufig: false }, e)));
  // lernplan.md nennt dieselben Felder wie ausgabe.md
  const lernplan = fs.readFileSync(path.join(SERVER, "skill", "studium-autopilot", "lernplan.md"), "utf8");
  for (const f of ["code", "semester", "quelle", "stand", "nr", "titel", "teile", "seiten", "folien", "vorlesung", "zwischentest", "url", "vorlaeufig"]) {
    assert.ok(lernplan.includes("`" + f + "`"), "lernplan.md: " + f);
  }
  assert.match(fs.readFileSync(path.join(SERVER, "skill", "studium-autopilot", "SKILL.md"), "utf8"), /\[lernplan\.md\]\(lernplan\.md\)/);
});
