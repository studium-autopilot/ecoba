// Nachträge in Notizen (nachtraege.js): geratene Folien in alten Vorlesungsnotizen, Pausentage in ausfall von Hand angelegter
// Lehrveranstaltungen, einmal je Tresor (System/Daten/nachtraege.json), nur auf dem Gerät, das für alle schreibt.
// Semesterdaten: Schnappschuss der öffentlichen Daten (tests/daten/v1/semester.json), Notizen ausgedacht (Codes X100 …).
// Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
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

test("lauf: nur auf dem Gerät, das für alle schreibt; schreibt Felder und nachtraege.json, danach nichts mehr", async () => {
  const hier = { wert: false };
  const fm = { "Vorlesungen/X100/V1.md": { typ: "vorlesung", code: "X100", datum: "2026-10-14", nummer: 1, folien: pdf(1) } };
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
  assert.equal(await L.lauf(), null, "anderes Gerät schreibt");
  assert.deepEqual(geschrieben, []);
  hier.wert = true;
  const b = await L.lauf();
  assert.deepEqual(b.neu, ["folien-geraten", "ausfall-pausen"]);
  assert.deepEqual(geschrieben, [["Vorlesungen/X100/V1.md", ""]]);
  assert.deepEqual(JSON.parse(dateien[L.DATEI]), { erledigt: ["folien-geraten", "ausfall-pausen"] });
  assert.equal(await L.lauf(), null, "alles erledigt");
  // Neuer Start (neues Skript), Datei schon da: liest sie und tut nichts
  const zweit = laden("nachtraege", { notizen: Object.assign({}, folie(1), fm), kontext: { zentral: { abruferHier: async () => true } } });
  zweit.ctx.app.vault.adapter = app.vault.adapter;
  zweit.ctx.app.fileManager = { processFrontMatter: async () => { throw new Error("darf nicht schreiben"); } };
  assert.equal(await zweit.ergebnis.lauf(), null);
});
