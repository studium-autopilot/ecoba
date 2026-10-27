// Nachträge in Notizen (nachtraege.js): geratene Folien in alten Vorlesungsnotizen, Pausentage in ausfall von Hand angelegter
// Lehrveranstaltungen, einmal je Tresor (System/Daten/nachtraege.json), nur auf dem Gerät, das für alle schreibt.
// Semesterdaten: Schnappschuss der öffentlichen Daten (tests/daten/v1/semester.json), Notizen ausgedacht (Codes X100 …).
// Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { laden, json } = require("./laden.js");

const SEMESTER = json("semester.json");
const N = laden("nachtraege").ergebnis;
const nachtrag = (id) => N.NACHTRAEGE.find((n) => n.id === id);
// Notizen wie im Lauf: [{ f, fm }]
const notizen = (o) => Object.keys(o).map((p) => ({ f: { path: p }, fm: o[p] }));
const pfade = (aenderungen) => aenderungen.map((a) => a.f.path).sort();

const folie = (nr, o) => ({ ["Unterlagen/X100/Folien " + nr + ".md"]: Object.assign({ typ: "unterlage", art: "Folien", code: "X100", nummer: nr,
  datei: "[[Unterlagen/X100/X100 Folien " + nr + ".pdf]]" }, o) });
const vl = (name, datum, nummer, folien, o) => ({ ["Vorlesungen/X100/" + name + ".md"]: Object.assign({ typ: "vorlesung", code: "X100", datum, nummer, folien }, o) });
const pdf = (nr) => "[[Unterlagen/X100/X100 Folien " + nr + ".pdf]]";

test("Nachträge: jede id nur einmal, jeder Nachtrag mit aendern", () => {
  const ids = N.NACHTRAEGE.map((n) => n.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const n of N.NACHTRAEGE) assert.equal(typeof n.aendern, "function", n.id);
  assert.equal(N.linkName("[[Unterlagen/X100/a.pdf|Kapitel 1]]"), "Unterlagen/X100/a.pdf");
  assert.equal(N.linkName("[[Unterlagen/X100/a.pdf#Seite 3]]"), "Unterlagen/X100/a.pdf");
  assert.equal(N.linkName("Unterlagen/Ökonomie.pdf".normalize("NFD")), "Unterlagen/Ökonomie.pdf".normalize("NFC"));
});

test("Nachtrag folien-geraten: leert Folien, die bis 0.6.2 geraten wurden; eigene Wahl und neuere Notizen bleiben", () => {
  const alle = notizen(Object.assign({},
    folie(1), folie(2), folie(4), folie("", { datei: "[[Unterlagen/X100/Zusatz.pdf]]" }),
    vl("V1 kleinste", "2026-10-14", 1, pdf(1)),
    vl("V2 gleiche Nummer", "2026-10-21", 2, pdf(2)),
    vl("V3 wie die vorige", "2026-10-22", 3, pdf(2)),
    vl("V4 mit Anzeigetext", "2026-10-23", 4, "[[Unterlagen/X100/X100 Folien 4.pdf|Kapitel 4]]"),
    vl("V5 eigene Wahl", "2026-10-23", 5, "[[Unterlagen/X100/Übungsfolien.pdf]]"),
    vl("V6 am 24.10.", "2026-10-24", 6, pdf(1)),
    vl("V7 nach 0.6.3", "2026-10-26", 7, pdf(1)),
    vl("V8 ohne Folien", "2026-10-20", 8, ""),
    vl("Termin ohne Nummer", "2026-10-19", "", "[[Unterlagen/X100/Zusatz.pdf]]"),
    vl("Y200 anderes Modul", "2026-10-15", 1, pdf(1), { code: "Y200" }),
  ));
  const a = nachtrag("folien-geraten").aendern(alle);
  assert.deepEqual(pfade(a), ["V1 kleinste", "V2 gleiche Nummer", "V3 wie die vorige", "V4 mit Anzeigetext", "V6 am 24.10."]
    .map((n) => "Vorlesungen/X100/" + n + ".md").sort());
  assert.ok(a.every((x) => x.felder.folien === "" && Object.keys(x.felder).length === 1), "nur folien, leer");
  // V5 trägt die Folien der vorigen Notiz V4 (am selben Tag zählt die Nummer); der Termin ohne Nummer oben gleicht keiner
  // Nummer, auch nicht den Folien ohne Nummer
  const v5 = nachtrag("folien-geraten").aendern(notizen(Object.assign({}, folie(1), folie(4),
    vl("V4", "2026-10-23", 4, pdf(4)), vl("V5", "2026-10-23", 5, pdf(4)))));
  assert.deepEqual(pfade(v5), ["Vorlesungen/X100/V4.md", "Vorlesungen/X100/V5.md"]);
  assert.deepEqual(nachtrag("folien-geraten").aendern([]), []);
});

test("Nachtrag ausfall-pausen: Pausentage gehen aus ausfall von Hand angelegter Lehrveranstaltungen weg, sonst nichts", () => {
  const M = laden("modell", { heute: "2026-10-20", frontmatter: { "System/Daten/Semester.md": SEMESTER } }).ctx.modell;
  const lv = (o) => Object.assign({ typ: "lehrveranstaltung", code: "X100", art: "Vorlesung", wochentag: 3, beginn: "10:15", ende: "11:45",
    von: "2026-10-14", bis: "2027-02-03", semester: "WS 2026/27", tag: "Mi" }, o);
  // Weihnachtspause 23.12.–06.01.: alle Mittwoche darin, wie „Neue Lehrveranstaltung“ sie bis 24.10.2026 eintrug
  const PAUSE = ["2026-12-23", "2026-12-30", "2027-01-06"];
  const alle = notizen({
    "Stundenplan/X100 Vorlesung.md": lv({ ausfall: PAUSE.concat(["2026-11-18"]) }),
    "Stundenplan/X100 nur Pause.md": lv({ ausfall: PAUSE }),
    "Stundenplan/X100 eigener Ausfall.md": lv({ ausfall: ["2026-11-25"] }),
    "Stundenplan/X100 Alma.md": lv({ quelle: "alma", ausfall: PAUSE }),
    "Stundenplan/X100 zentral.md": lv({ herkunft: "zentral", zentral_id: "x100-vl", ausfall: PAUSE }),
    "Stundenplan/X100 ein Tag.md": lv({ ausfall: "2026-12-23" }),
  });
  const a = nachtrag("ausfall-pausen").aendern(alle, M);
  const je = {};
  for (const x of a) je[x.f.path.slice(12, -3)] = x.felder;
  assert.deepEqual(je, { "X100 Vorlesung": { ausfall: ["2026-11-18"] }, "X100 nur Pause": { ausfall: [] }, "X100 ein Tag": { ausfall: [] } });
  // Pausen noch nicht gelesen: später wieder (null), ohne Kandidaten gleich erledigt
  const ohne = laden("modell", { heute: "2026-10-20" }).ctx.modell;
  assert.equal(nachtrag("ausfall-pausen").aendern(alle, ohne), null);
  assert.equal(nachtrag("ausfall-pausen").aendern(alle, null), null);
  assert.deepEqual(nachtrag("ausfall-pausen").aendern(notizen({ "Stundenplan/a.md": lv({}) }), ohne), []);
});

test("nachtragenMit: Erledigtes übersprungen, null bleibt offen, ein gescheitertes Schreiben auch, die übrigen laufen weiter", async () => {
  const f = (p) => ({ path: p });
  const liste = [
    { id: "alt", aendern: () => { throw new Error("darf nicht laufen"); } },
    { id: "spaeter", aendern: () => null },
    { id: "kaputt", aendern: () => [{ f: f("a.md"), felder: { x: 1 } }] },
    { id: "gut", aendern: () => [{ f: f("b.md"), felder: { y: 2 } }, { f: f("c.md"), felder: { y: 3 } }] },
  ];
  const gesetzt = [];
  const b = await N.nachtragenMit({ notizen: [], erledigt: ["alt"], liste,
    setzen: async (d, felder) => { if (d.path === "a.md") throw new Error("gesperrt"); gesetzt.push([d.path, felder]); } });
  assert.deepEqual(b.erledigt, ["alt", "gut"]);
  assert.deepEqual(b.neu, ["gut"]);
  assert.deepEqual(b.geaendert, [{ id: "gut", pfad: "b.md" }, { id: "gut", pfad: "c.md" }]);
  assert.match(b.fehler, /^kaputt: gesperrt/);
  assert.deepEqual(gesetzt, [["b.md", { y: 2 }], ["c.md", { y: 3 }]]);
});

test("lauf: nur auf dem Gerät, das für alle schreibt; schreibt Felder, Text und nachtraege.json, danach nichts mehr", async () => {
  const hier = { wert: false };
  const fm = { "Vorlesungen/X100/V1.md": { typ: "vorlesung", code: "X100", datum: "2026-10-14", nummer: 1, folien: pdf(1) },
    "Unterlagen/X100/Lesefassung.md": { typ: "unterlage", code: "X100", art: "Folien", nummer: 2, titel: "Märkte", cssclasses: ["eba", "eba-folien"] },
    "Unterlagen/X100/Schon neu.md": { typ: "unterlage", code: "X100", art: "Folien", nummer: 3, titel: "Preise", cssclasses: ["eba", "eba-folien"] } };
  const texte = {
    "Unterlagen/X100/Lesefassung.md": "---\ntyp: unterlage\n---\n\n<div class=\"eba-kopf\">\n<div class=\"eba-pfad\"><span>Folien 02</span></div>\n<h1>Modul</h1>\n</div>\n\nText\n",
    "Unterlagen/X100/Schon neu.md": "---\ntyp: unterlage\n---\n\n# X100 · Folien 03 · Preise\n" };
  const { ctx, ergebnis: L } = laden("nachtraege", {
    notizen: Object.assign({}, folie(1), fm),
    kontext: { zentral: { abruferHier: async () => hier.wert } },
  });
  const dateien = {}, geschrieben = [];
  const app = ctx.app;
  app.vault.adapter = { read: async (p) => { if (!(p in dateien)) throw new Error("fehlt"); return dateien[p]; } };
  app.vault.create = async (p, t) => { dateien[p] = t; };
  app.vault.modify = async (d, t) => { dateien[d.path] = t; };
  app.fileManager = { processFrontMatter: async (d, fn) => { const x = Object.assign({}, fm[d.path]); fn(x); geschrieben.push([d.path, x.folien]); } };
  app.vault.read = async (d) => texte[d.path];
  app.vault.process = async (d, fn) => { texte[d.path] = fn(texte[d.path]); geschrieben.push([d.path, "Text"]); };
  assert.equal(await L.lauf(), null, "anderes Gerät schreibt");
  assert.deepEqual(geschrieben, []);
  hier.wert = true;
  const b = await L.lauf();
  assert.deepEqual(b.neu, ["folien-geraten", "ausfall-pausen", "folien-kopf", "modul-notizspalte", "modul-reihenfolge"]);
  assert.deepEqual(geschrieben, [["Vorlesungen/X100/V1.md", ""], ["Unterlagen/X100/Lesefassung.md", "Text"]], "die neue Notiz bleibt ungeschrieben");
  assert.equal(texte["Unterlagen/X100/Lesefassung.md"], "---\ntyp: unterlage\n---\n\n# X100 · Folien 02 · Märkte\n\nText\n");
  assert.deepEqual(JSON.parse(dateien[L.DATEI]), { erledigt: ["folien-geraten", "ausfall-pausen", "folien-kopf", "modul-notizspalte", "modul-reihenfolge"] });
  assert.equal(await L.lauf(), null, "alles erledigt");
  // Neuer Start (neues Skript), Datei schon da: liest sie und tut nichts
  const zweit = laden("nachtraege", { notizen: Object.assign({}, folie(1), fm), kontext: { zentral: { abruferHier: async () => true } } });
  zweit.ctx.app.vault.adapter = app.vault.adapter;
  zweit.ctx.app.fileManager = { processFrontMatter: async () => { throw new Error("darf nicht schreiben"); } };
  assert.equal(await zweit.ergebnis.lauf(), null);
});

test("Nachtrag modul-notizspalte: die alte Formel der Spalte Notiz wird die der Vorlage, sonst ändert sich nichts", () => {
  const alt = "> formulas:\n>   notiz: " + N.NOTIZ_ALT.slice("notiz: ".length) + "\n> properties:\n";
  assert.equal(N.notizSpalte(alt), "> formulas:\n>   " + N.NOTIZ_NEU + "\n> properties:\n");
  assert.equal(N.notizSpalte(N.notizSpalte(alt)), N.notizSpalte(alt), "einmal genügt");
  const eigen = alt.replace("replace(code", "replace(titel");
  assert.equal(N.notizSpalte(eigen), eigen, "selbst geänderte Formel bleibt");
  // Vorlage und Gerüst haben genau die neue Formel, keine Modulnotiz mehr die alte
  const vorlage = path.join(__dirname, "..", "Studium Autopilot");
  const md = [path.join(vorlage, "System", "Gerüste", "Modul.md")];
  const sammeln = (o) => { for (const e of fs.readdirSync(o, { withFileTypes: true })) { const p = path.join(o, e.name); if (e.isDirectory()) sammeln(p); else if (e.name.endsWith(".md")) md.push(p); } };
  sammeln(path.join(vorlage, "Module"));
  for (const p of md) {
    const t = fs.readFileSync(p, "utf8");
    assert.ok(t.includes(N.NOTIZ_NEU) && !t.includes(N.NOTIZ_ALT), path.basename(p));
  }
});

test("Nachtrag modul-reihenfolge: Zum Modul nach Datum aufsteigend, dann Wochentag und Beginn; eigene Sortierung bleibt", () => {
  const alt = "> views:\n" + N.REIHE_ALT + "\n>       formula.notiz: 330\n";
  assert.equal(N.reihenfolge(alt), "> views:\n" + N.REIHE_NEU + "\n>       formula.notiz: 330\n");
  assert.equal(N.reihenfolge(N.reihenfolge(alt)), N.reihenfolge(alt), "einmal genügt");
  const eigen = alt.replace("direction: DESC", "direction: ASC");
  assert.equal(N.reihenfolge(eigen), eigen, "selbst geänderte Sortierung bleibt");
  const vorlage = path.join(__dirname, "..", "Studium Autopilot");
  const md = [path.join(vorlage, "System", "Gerüste", "Modul.md")];
  const sammeln = (o) => { for (const e of fs.readdirSync(o, { withFileTypes: true })) { const p = path.join(o, e.name); if (e.isDirectory()) sammeln(p); else if (e.name.endsWith(".md")) md.push(p); } };
  sammeln(path.join(vorlage, "Module"));
  for (const p of md) {
    const t = fs.readFileSync(p, "utf8");
    assert.ok(t.includes(N.REIHE_NEU) && !t.includes(N.REIHE_ALT), path.basename(p));
  }
});

test("Nachtrag folien-kopf: der alte Seitenkopf einer Lesefassung wird der Titel jeder Begleitnotiz, sonst ändert sich nichts", async () => {
  const fm = { typ: "unterlage", code: "X100", art: "Folien", nummer: 0, titel: "Einführung", cssclasses: ["eba", "eba-folien"] };
  const eig = "---\ntyp: unterlage\ncode: X100\ncssclasses:\n  - eba\n  - eba-folien\n---\n\n";
  const kopf = '<div class="eba-kopf">\n<div class="eba-pfad"><a class="internal-link" data-href="X100 Modul" href="X100 Modul">X100</a>'
    + '<a class="internal-link" data-href="Unterlagen" href="Unterlagen">Unterlagen</a><span>Folien 00 · Einführung</span></div>\n'
    + "<h1>Name des Moduls</h1>\n";
  const meta = '<div class="eba-meta"><span>Dozentin</span><span>Lehrstuhl</span></div>\n';
  const rest = "\n> [!eba-regel] Eckdaten\n> Eigener Satz\n\n## Das Wichtigste\n- Punkt\n";
  const alt = eig + kopf + meta + "</div>\n" + rest;
  assert.equal(N.folienKopf(alt, fm), eig + "# X100 · Folien 00 · Einführung\n" + rest);
  assert.equal(N.folienKopf(eig + kopf + "</div>\n" + rest, fm), eig + "# X100 · Folien 00 · Einführung\n" + rest, "ohne Zeile zum Dozenten");
  assert.equal(N.folienKopf((eig + kopf + meta + "</div>\n" + rest).replace(/\n/g, "\r\n"), fm).split("\r\n")[8], "# X100 · Folien 00 · Einführung\n",
    "Zeilenenden CRLF");
  // Schon umgestellt, selbst geändert (eigene Zeile im Kopf) oder der Kopf steht nicht oben: bleibt
  const neu = eig + "# X100 · Folien 00 · Einführung\n" + rest;
  assert.equal(N.folienKopf(neu, fm), neu);
  const eigenerKopf = eig + kopf + "<p>Meine Zeile</p>\n</div>\n" + rest;
  assert.equal(N.folienKopf(eigenerKopf, fm), eigenerKopf);
  const weiterUnten = eig + "Text\n\n" + kopf + "</div>\n";
  assert.equal(N.folienKopf(weiterUnten, fm), weiterUnten);
  assert.equal(N.folienKopf(alt, { typ: "unterlage", nummer: 1, art: "Folien" }).split("\n")[8], "# Folien 01", "ohne Kürzel und Titel");
  // Kandidaten: nur Begleitnotizen mit eba-folien und etwas für den Titel
  const a = nachtrag("folien-kopf").aendern(notizen({
    "Unterlagen/X100/X100 Folien 00 Einführung.md": fm,
    "Unterlagen/X100/X100 Folien 01.md": Object.assign({}, fm, { cssclasses: "eba eba-folien", nummer: 1, titel: "" }),
    "Unterlagen/X100/X100 Übung 01.md": Object.assign({}, fm, { art: "Übung", cssclasses: ["eba-s-begleitnotiz"] }),
    "Vorlesungen/X100/V1.md": { typ: "vorlesung", cssclasses: ["eba-folien"] },
  }));
  assert.deepEqual(pfade(a), ["Unterlagen/X100/X100 Folien 00 Einführung.md", "Unterlagen/X100/X100 Folien 01.md"]);
  assert.equal(a[0].text(alt).split("\n")[8], "# X100 · Folien 00 · Einführung");
});

test("nachtragenMit: Text nur schreiben, wenn er sich ändert; nur Geschriebenes zählt als geändert", async () => {
  const f = (p) => ({ path: p });
  const texte = { "a.md": "alt", "b.md": "bleibt" };
  const liste = [{ id: "text", aendern: () => [{ f: f("a.md"), text: (t) => t.replace("alt", "neu") }, { f: f("b.md"), text: (t) => t.replace("alt", "neu") }] }];
  const b = await N.nachtragenMit({ notizen: [], erledigt: [], liste, setzen: async () => { throw new Error("keine Felder"); },
    textSetzen: async (d, fn) => { const neu = fn(texte[d.path]); if (neu === texte[d.path]) return false; texte[d.path] = neu; return true; } });
  assert.deepEqual(b.geaendert, [{ id: "text", pfad: "a.md" }]);
  assert.deepEqual(b.erledigt, ["text"]);
  assert.deepEqual(texte, { "a.md": "neu", "b.md": "bleibt" });
});
