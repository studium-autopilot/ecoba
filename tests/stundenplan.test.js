// Zentraler Stundenplan (zentral.js, veranstaltungen.json): Prüfung, Filter (aktuelles Fachsemester), Auswahl ohne
// Parallelgruppen, „Alma gewinnt“ (auch Vorlesung und Übung direkt hintereinander, c.t./s.t.), Notiztext mit Ausfällen und
// Änderungen fürs Wochenraster, „Besuche ich nicht“ und Zurücknehmen, gelöschte Notiz, Schutz gegen Massenwegfall, eigener
// Uni-Abgleich (kein zentraler Stundenplan).
// Nur ausgedachte Daten (Codes X100 …). Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const nodeCrypto = require("node:crypto");
const path = require("node:path");
const { laden, json } = require("./laden.js");

const EBA = require(path.join(__dirname, "..", "Studium Autopilot", "System", "Skripte", "eba.js"));

const SEM = "WS 2026/27";
const URL_A = "https://alma.uni-tuebingen.de/alma/pages/startFlow.xhtml?_flowId=detailView-flow&unitId=1&periodId=1";

// Ein gültiger Eintrag; jeder Fall ändert nur, was er braucht. Mo 12.10.2026 ist ein Montag.
const v = (anders = {}) => Object.assign({
  id: "ws-2026-27-x100-vorlesung-1-mo-1000", code: "X100", art: "Vorlesung", titel: "Einführung in die Beispielökonomik", gruppe: "1",
  tag: "Mo", von: "10:00", bis: "12:00", ct: true, rhythmus: "wöchentlich", zeitraum: { von: "2026-10-12", bis: "2027-02-01" },
  raum: "Hörsaal 1 (Beispielbau)", semester: SEM, quelle_url: URL_A,
}, anders);
const datei = (...e) => ({ schema: 1, stand: "2026-10-17", veranstaltungen: e });

const Z = laden("zentral").ctx.zentral;

test("Prüfung: gültig, unbekannte Felder ignoriert, unbekannte Art wird Sonstige", () => {
  const r = Z.lehrePruefen(datei(v({ neu: 1 }), v({ id: "ws-2026-27-x100-sonstige-1-mo-1400", art: "Exkursion", von: "14:00", bis: "16:00" })));
  assert.deepEqual(r.verworfen, []);
  assert.equal(r.veranstaltungen.length, 2);
  assert.equal(r.veranstaltungen[0].neu, undefined);
  assert.equal(r.veranstaltungen[1].art, "Sonstige");
  assert.equal(r.veranstaltungen[0].ct, true);
});

test("Prüfung: ungültige Einträge einzeln verworfen, ihre id bleibt bekannt", () => {
  const schlecht = {
    "unbekannter Rhythmus": { rhythmus: "monatlich" },
    "Wochentag passt nicht": { tag: "Di" },
    "Einzeltermin mit Zeitraum": { rhythmus: "Einzeltermin" },
    "Ausfall außerhalb": { ausfall: ["2027-03-01"] },
    "Ausfall unsortiert": { ausfall: ["2026-12-30", "2026-12-23"] },
    "ct kein Wahrheitswert": { ct: "ja" },
    "Zeitraum außerhalb des Semesters": { semester: "SS 2027" },
    "bis vor von": { von: "12:00", bis: "10:00" },
    "Raum mit Klammern": { raum: "[[Raum]]" },
    "Änderung ohne Inhalt": { aenderungen: [{ datum: "2026-11-02" }] },
    "Änderung nur von": { aenderungen: [{ datum: "2026-11-02", von: "14:00" }] },
    "fremde Domain": { quelle_url: "https://example.org/x" },
    "Code klein": { code: "x100" },
    "raum_seit ohne raum_vorher": { raum_seit: "2026-10-19" },
    "raum_seit außerhalb": { raum_seit: "2027-03-01", raum_vorher: "Hörsaal 7" },
    "raum_vorher leer": { raum_seit: "2026-10-19", raum_vorher: "" },
  };
  let i = 0;
  for (const [fall, anders] of Object.entries(schlecht)) {
    const id = "fall-" + i++;
    const r = Z.lehrePruefen(datei(v(Object.assign({ id }, anders))));
    assert.equal(r.veranstaltungen.length, 0, fall);
    assert.equal(r.verworfen.length, 1, fall);
    assert.ok(r.ids.has(id), fall + ": id bleibt bekannt (kein Wegfall)");
  }
  const d = Z.lehrePruefen(datei(v(), v()));
  assert.deepEqual(d.verworfen, [{ id: v().id, grund: "doppelte id" }]);
  // Änderungen: unbekannte Schlüssel ignoriert, Zusatztermin erlaubt
  const a = Z.lehrePruefen(datei(v({ aenderungen: [{ datum: "2026-11-09", raum: "Hörsaal 2", foo: 1 }, { datum: "2026-11-20", von: "08:00", bis: "10:00", zusatz: true }] })));
  assert.deepEqual(a.veranstaltungen[0].aenderungen.map((x) => [x.datum, x.raum, x.von, x.zusatz]), [["2026-11-09", "Hörsaal 2", "", false], ["2026-11-20", "", "08:00", true]]);
});

test("Prüfung: ganze Datei abgelehnt bei falschem Schema oder zu vielen Einträgen", () => {
  assert.ok(Z.lehrePruefen({ schema: 2, veranstaltungen: [] }).fehler);
  assert.ok(Z.lehrePruefen({ schema: 1 }).fehler);
  assert.ok(Z.lehrePruefen({ schema: 1, veranstaltungen: new Array(3001).fill(v()) }).fehler);
});

// ---------- Filter: aktuelles Fachsemester ----------
const MUSTERPLAN = {
  plaene: [{ id: "a", name: "Alpha" }, { id: "b", name: "Beta" }],
  eintraege: [
    { plan: "a", fs: 1, code: "X100" }, { plan: "a", fs: 1, code: "X110" }, { plan: "a", fs: 1, code: "W120" },
    { plan: "b", fs: 1, code: "X100" }, { plan: "b", fs: 1, code: "X110" }, { plan: "b", fs: 1, code: "V130" },
    { plan: "a", fs: 2, code: "Y200" }, { plan: "b", fs: 2, code: "Y200" },
  ],
};
const modul = (code, fm = {}, semester = "") => ({ code, fm: Object.assign({ code }, fm), status: String(fm.status || "offen").toLowerCase(), semester, f: { basename: code + " Beispiel", path: "Module/" + code + ".md" } });
const daten = (anders = {}) => Object.assign({
  aktuell: { name: SEM, fs: 1 }, fachsemester: 1, variante: "offen", studienbeginnStandard: false,
  module: [modul("X100"), modul("X110"), modul("W120"), modul("V130"), modul("Y200")],
}, anders);
const codes = (F) => Object.keys(F.codes).sort();

test("Filter: Variante offen = nur Module, die alle Varianten im Fachsemester haben", () => {
  assert.deepEqual(codes(Z.stundenplanFilter(daten(), MUSTERPLAN)), ["X100", "X110"]);
  assert.deepEqual(codes(Z.stundenplanFilter(daten({ variante: "Alpha" }), MUSTERPLAN)), ["W120", "X100", "X110"]);
  assert.deepEqual(codes(Z.stundenplanFilter(daten({ fachsemester: 2 }), MUSTERPLAN)), ["Y200"], "nur das aktuelle, nicht das nächste");
});

test("Filter: bestanden raus, geplant nur im aktuellen Semester, läuft und gewählt dazu", () => {
  const D = daten({ module: [
    modul("X100", { status: "bestanden" }),
    modul("X110", { semester_geplant: "SS 2027" }),
    modul("Y200", { semester_geplant: SEM }),
    modul("V130", { status: "läuft" }),
    modul("S300", { gewaehlt: true }),
    modul("S310", { gewaehlt: true }, "SS 2027"),
    modul("W120", { status: "anerkannt", gewaehlt: true }),
  ] });
  const F = Z.stundenplanFilter(D, MUSTERPLAN);
  assert.deepEqual(codes(F), ["S300", "V130", "Y200"]);
  assert.equal(F.codes.Y200, "geplant");
  assert.equal(F.semester, SEM);
});

test("Filter: ohne Studienbeginn kein Musterplan, nur was du selbst markiert hast", () => {
  const D = daten({ studienbeginnStandard: true, module: [modul("X100"), modul("X110", { status: "angemeldet" })] });
  const F = Z.stundenplanFilter(D, MUSTERPLAN);
  assert.deepEqual(codes(F), ["X110"]);
  assert.equal(F.ohneBeginn, true);
});

test("Auswahl: Parallelgruppen nie, einzelne Übung ja, ausgeblendet und anderes Semester nicht", () => {
  const liste = Z.lehrePruefen(datei(
    v(),
    v({ id: "ws-2026-27-x100-uebung-1-do-1200", art: "Übung", tag: "Do", zeitraum: { von: "2026-10-15", bis: "2027-02-04" } }),
    v({ id: "ws-2026-27-x110-tutorium-1-di-0800", code: "X110", art: "Tutorium", tag: "Di", gruppe: "1", zeitraum: { von: "2026-10-13", bis: "2027-02-02" } }),
    v({ id: "ws-2026-27-x110-tutorium-2-di-1000", code: "X110", art: "Tutorium", tag: "Di", gruppe: "2", zeitraum: { von: "2026-10-13", bis: "2027-02-02" } }),
    v({ id: "ws-2026-27-x110-vorlesung-1-mi-0800", code: "X110", tag: "Mi", von: "08:00", bis: "10:00", ct: false, zeitraum: { von: "2026-10-14", bis: "2027-02-03" } }),
    v({ id: "ss-2027-x100-vorlesung-1-mo-1000", semester: "SS 2027", zeitraum: { von: "2027-04-12", bis: "2027-07-19" } }),
  )).veranstaltungen;
  const F = { semester: SEM, codes: { X100: "musterplan", X110: "musterplan" } };
  const r = Z.stundenplanAuswahl(liste, F, new Set(["ws-2026-27-x110-vorlesung-1-mi-0800"]));
  assert.deepEqual(r.notizen.map((e) => e.id), ["ws-2026-27-x100-vorlesung-1-mo-1000", "ws-2026-27-x100-uebung-1-do-1200"]);
  assert.equal(r.gruppen, 2);
  assert.equal(r.ausgeblendet, 1);
});

// ---------- Alma gewinnt ----------
const notiz = (pfad, fm) => ({ f: { path: pfad }, fm: Object.assign({ typ: "lehrveranstaltung", semester: SEM }, fm) });
const vl = v();
const ue = v({ id: "ws-2026-27-x100-uebung-1-mo-1200", art: "Übung", von: "12:00", bis: "14:00" }); // direkt danach

test("Alma gewinnt: gleiche Veranstaltung, c.t. an der Alma-Zeit und an der echten Zeit erkannt", () => {
  const alma = notiz("Stundenplan/a.md", { code: "X100", art: "Vorlesung", wochentag: 1, beginn: "10:00", ende: "12:00", alma_schluessel: "x" });
  assert.equal(Z.eigenePaare([vl], [alma]).get(vl.id), alma);
  const hand = notiz("Stundenplan/h.md", { code: "X100", art: "Vorlesung", wochentag: 1, beginn: "10:15", ende: "11:45" });
  assert.equal(Z.eigenePaare([vl], [hand]).get(vl.id), hand);
  const andererTag = notiz("Stundenplan/d.md", { code: "X100", art: "Vorlesung", wochentag: 2, beginn: "10:00", ende: "12:00" });
  assert.equal(Z.eigenePaare([vl], [andererTag]).size, 0);
});

test("Alma gewinnt: Vorlesung und Übung direkt hintereinander verschmelzen nie", () => {
  const almaUe = notiz("Stundenplan/ue.md", { code: "X100", art: "Übung", wochentag: 1, beginn: "12:00", ende: "14:00" });
  const p = Z.eigenePaare([vl, ue], [almaUe]);
  assert.equal(p.get(ue.id), almaUe);
  assert.equal(p.has(vl.id), false, "die Vorlesung bleibt zentral");
  // Alma erkennt die Art nicht („Veranstaltung“): nur bei genau passender Zeit, also die Übung um 12
  const unbestimmt = notiz("Stundenplan/u.md", { code: "X100", art: "Veranstaltung", wochentag: 1, beginn: "12:00", ende: "14:00" });
  const q = Z.eigenePaare([vl, ue], [unbestimmt]);
  assert.deepEqual(Array.from(q.keys()), [ue.id]);
  // Eine Alma-Vorlesung um 10:15 (c.t.) wird nie der Übung um 12 zugeordnet, auch nicht über die Toleranz
  const almaVl = notiz("Stundenplan/v.md", { code: "X100", art: "Vorlesung", wochentag: 1, beginn: "10:15", ende: "11:45" });
  assert.deepEqual(Array.from(Z.eigenePaare([vl, ue], [almaVl]).keys()), [vl.id]);
});

test("Alma gewinnt: s.t. genau vor Toleranz, jede eigene Notiz nur einmal", () => {
  const st10 = v({ id: "ws-2026-27-x100-vorlesung-1-mo-1000-st", ct: false });
  const st1015 = v({ id: "ws-2026-27-x100-vorlesung-1-mo-1015", ct: false, von: "10:15", bis: "11:45" });
  const alma = notiz("Stundenplan/a.md", { code: "X100", art: "Vorlesung", wochentag: 1, beginn: "10:15", ende: "11:45" });
  const p = Z.eigenePaare([st10, st1015], [alma]);
  assert.deepEqual(Array.from(p.keys()), [st1015.id], "die genau passende gewinnt, die andere bleibt zentral");
  // Mehr als 15 Minuten daneben: nicht dieselbe
  const spaet = notiz("Stundenplan/s.md", { code: "X100", art: "Vorlesung", wochentag: 1, beginn: "10:30", ende: "12:00" });
  assert.equal(Z.eigenePaare([st10], [spaet]).size, 0);
});

test("Alma gewinnt: Einzeltermin liegt in einer Alma-Serie (nicht an einem Ausfalltag)", () => {
  const e1 = v({ id: "ws-2026-27-x100-vorlesung-1-20261102-1000", rhythmus: "Einzeltermin", zeitraum: { von: "2026-11-02", bis: "2026-11-02" } });
  const e2 = v({ id: "ws-2026-27-x100-vorlesung-1-20261109-1000", rhythmus: "Einzeltermin", zeitraum: { von: "2026-11-09", bis: "2026-11-09" } });
  const serie = notiz("Stundenplan/a.md", { code: "X100", art: "Vorlesung", wochentag: 1, beginn: "10:00", ende: "12:00", von: "2026-10-12", bis: "2026-11-30", ausfall: ["2026-11-09"] });
  assert.deepEqual(Array.from(Z.eigenePaare([e1, e2], [serie]).keys()), [e1.id]);
});

test("Alma gewinnt: „Übungsteil“ ersetzt die Vorlesung oder Übung zur selben Zeit, nur bei genau passender Zeit", () => {
  // Alma nennt einen Termin der Vorlesung „Übungsteil“, die Daten führen ihn als Vorlesung (montags 14 Uhr, c.t.)
  const vl14 = v({ id: "ws-2026-27-x100-vorlesung-1-mo-1400", von: "14:00", bis: "16:00" });
  // ohne herkunft und alma_schluessel, wie eine Notiz von Hand oder aus einem eigenen Abgleich
  const teil = (beginn, ende) => notiz("Stundenplan/t.md", { code: "X100", art: "Übungsteil", wochentag: 1, beginn, ende, von: "2026-10-12", bis: "2027-02-01" });
  assert.deepEqual(Array.from(Z.eigenePaare([vl, vl14], [teil("14:15", "15:45")]).keys()), [vl14.id], "echte Zeit");
  assert.deepEqual(Array.from(Z.eigenePaare([vl, vl14], [teil("14:00", "16:00")]).keys()), [vl14.id], "Alma-Zeit");
  assert.equal(Z.eigenePaare([vl14], [teil("14:30", "16:00")]).size, 0, "15 Min. daneben reicht bei unbestimmter Art nicht");
  const ue14 = v({ id: "ws-2026-27-x100-uebung-1-mo-1400", art: "Übung", von: "14:00", bis: "16:00" });
  assert.deepEqual(Array.from(Z.eigenePaare([ue14], [teil("14:15", "15:45")]).keys()), [ue14.id]);
  // Eine echte Vorlesung zur selben Zeit geht vor
  const almaVl = notiz("Stundenplan/v.md", { code: "X100", art: "Vorlesung", wochentag: 1, beginn: "14:15", ende: "15:45" });
  assert.equal(Z.eigenePaare([vl14], [teil("14:15", "15:45"), almaVl]).get(vl14.id), almaVl);
});

// ---------- Notiz ----------
test("Notiz: c.t.-Zeiten, Ausfälle und Änderungen in den Feldern, die das Wochenraster liest", () => {
  const e = Z.lehrePruefen(datei(v({ ausfall: ["2026-12-21", "2026-12-28"], aenderungen: [
    { datum: "2026-11-09", raum: "Hörsaal 2" }, { datum: "2026-11-16", von: "14:00", bis: "16:00" }, { datum: "2026-11-20", von: "08:00", bis: "10:00", raum: "Raum 3", zusatz: true },
  ] }))).veranstaltungen[0];
  assert.deepEqual(Z.lehreZeit(e), { beginn: "10:15", ende: "11:45" });
  assert.deepEqual(Z.aenderungenFelder(e), ["2026-11-09|10:15|11:45|Hörsaal 2", "2026-11-16|14:15|15:45|Hörsaal 1 (Beispielbau)"], "Zusatztermin nicht im Raster");
  const t = Z.lehreNotizText("", e, { modulLink: "[[X100 Beispiel]]", kurz: "Einführung in die Beispielökonomik" });
  for (const z of ["typ: lehrveranstaltung", 'titel: "Einführung in die Beispielökonomik · Vorlesung"', "wochentag: 1", 'beginn: "10:15"', 'ende: "11:45"',
    "ausfall:\n  - 2026-12-21\n  - 2026-12-28", 'aenderungen:\n  - "2026-11-09|10:15|11:45|Hörsaal 2"', "einzeltermin: false", "herkunft: zentral",
    "zentral_id: " + e.id, 'uebersicht: "[[Stundenplan]]"']) assert.ok(t.indexOf(z) >= 0, z);
  assert.ok(t.indexOf("aktion=besuche-nicht") < 0, "„Besuche ich nicht“ steht im Kopf der Notiz (kopf.js), nicht im Text");
  assert.ok(/Zusätzlich: Fr 20\.11\. 08:15–09:45 in Raum 3/.test(t));
  // Neu schreiben: eigene Felder und alles unter „## Notizen“ bleiben
  const mitEigenem = t.replace("---\n\n", "dozent: \"Ich\"\n---\n\n").replace(/## Meine Notizen\n- \n$/, "## Meine Notizen\n- Kapitel 1 lesen\n");
  const neu = Z.lehreNotizText(mitEigenem, Object.assign({}, e, { raum: "Hörsaal 9" }), { kurz: "Einführung in die Beispielökonomik" });
  assert.ok(neu.indexOf('dozent: "Ich"') > 0 && neu.indexOf("- Kapitel 1 lesen") > 0 && neu.indexOf('raum: "Hörsaal 9"') > 0);
  assert.equal(Z.lehreMeine(t), "");
  assert.equal(Z.lehreMeine(mitEigenem), "- Kapitel 1 lesen");
});

// ---------- Ablauf beim Abrufer (Tresor im Speicher) ----------
// Mini-YAML für das Frontmatter, das zentral.js schreibt (Schlüssel: Wert, Listen mit „  - “)
const wert = (s) => { s = s.trim(); if (s === "") return null; if (s === "[]") return []; if (/^".*"$/.test(s)) return JSON.parse(s); if (s === "true" || s === "false") return s === "true"; if (/^\d+$/.test(s)) return Number(s); return s; };
const fmLesen = (text) => {
  const m = String(text).match(/^---\n([\s\S]*?)\n---/);
  if (!m) return null;
  const fm = {};
  let k = null;
  for (const z of m[1].split("\n")) {
    const l = z.match(/^\s+-\s*(.*)$/);
    if (l && k) { if (!Array.isArray(fm[k])) fm[k] = []; fm[k].push(wert(l[1])); continue; }
    const p = z.match(/^([\w-]+):(.*)$/);
    if (p) { k = p[1]; fm[k] = wert(p[2]); }
  }
  return fm;
};
const fmSchreiben = (fm, body) => "---\n" + Object.keys(fm).map((k) => (Array.isArray(fm[k]) ? k + ":" + fm[k].map((x) => "\n  - " + JSON.stringify(x)).join("") : k + ": " + (fm[k] == null ? "" : JSON.stringify(fm[k])))).join("\n") + "\n---\n" + body;

function tresor(D) {
  const text = {}, nurFm = {}, papierkorb = [], speicher = {};
  let quelle = {};
  const L = laden("zentral", {
    heute: "2026-10-17",
    kontext: {
      modell: { daten: () => D, naechster: (n) => (n === SEM ? "SS 2027" : null), beiAenderung: () => () => {} },
      plugin: { testZentralAus: true, testPapierkorbLokal: true, testQuelle: async (name) => (name in quelle ? quelle[name] : null) },
      user: { eba: EBA },
    },
  });
  const app = L.ctx.app;
  const datei = (p) => ({ path: p, basename: p.split("/").pop().replace(/\.md$/, ""), extension: "md" });
  const da = (p) => p in text || p in nurFm;
  app.vault.getAbstractFileByPath = (p) => (da(p) || p === "Stundenplan" || p === "System/Daten" ? datei(p) : null);
  app.vault.getMarkdownFiles = () => Object.keys(text).concat(Object.keys(nurFm)).filter((p) => p.endsWith(".md")).map(datei);
  app.vault.read = async (f) => text[f.path];
  app.vault.modify = async (f, t) => { text[f.path] = t; };
  app.vault.create = async (p, t) => { if (da(p)) throw new Error("gibt es schon: " + p); text[p] = t; return datei(p); };
  app.vault.createFolder = async () => {};
  app.vault.trash = async (f) => { papierkorb.push(f.path); delete text[f.path]; };
  app.metadataCache.getFileCache = (f) => {
    if (!f) return null;
    if (f.path in nurFm) return { frontmatter: nurFm[f.path] };
    return f.path in text ? { frontmatter: fmLesen(text[f.path]) } : null;
  };
  app.fileManager = { processFrontMatter: async (f, fn) => {
    if (f.path in nurFm) { fn(nurFm[f.path]); return; }
    const fm = fmLesen(text[f.path]) || {};
    fn(fm);
    text[f.path] = fmSchreiben(fm, text[f.path].replace(/^---\n[\s\S]*?\n---\n/, ""));
  } };
  app.loadLocalStorage = (k) => (k in speicher ? speicher[k] : null);
  app.saveLocalStorage = (k, v2) => { if (v2 == null) delete speicher[k]; else speicher[k] = v2; };
  nurFm["System/Einstellungen.md"] = { typ: "einstellungen" };
  nurFm["System/Daten/Musterplan.md"] = MUSTERPLAN;
  // Daten veröffentlichen: Manifest mit Prüfsumme über die Bytes
  const veroeffentlichen = (d, kaputt) => {
    const t = JSON.stringify(d);
    const b = Buffer.from(t, "utf8");
    quelle = {
      "manifest.json": JSON.stringify({ schema: 1, erstellt: "2026-10-17T06:00:00Z", dateien: { "veranstaltungen.json": {
        sha256: kaputt ? "0".repeat(64) : nodeCrypto.createHash("sha256").update(b).digest("hex"), groesse: b.length } } }),
      "veranstaltungen.json": t,
    };
  };
  const Zt = L.ctx.zentral;
  const notizen = () => Object.keys(text).filter((p) => p.indexOf("Stundenplan/") === 0).sort();
  const zentral = () => notizen().filter((p) => fmLesen(text[p]).herkunft === "zentral");
  return { Z: Zt, text, nurFm, papierkorb, speicher, veroeffentlichen, notizen, zentral, abrufen: (o) => Zt.abrufen(o || { manuell: true }), fm: (p) => fmLesen(text[p]) };
}

const FIXTURE = () => datei(
  v({ ausfall: ["2026-12-21"], aenderungen: [{ datum: "2026-11-09", raum: "Hörsaal 2" }] }),
  v({ id: "ws-2026-27-x100-uebung-1-mo-1200", art: "Übung", von: "12:00", bis: "14:00", gruppe: "1" }),
  v({ id: "ws-2026-27-x110-tutorium-1-di-0800", code: "X110", art: "Tutorium", tag: "Di", gruppe: "1", zeitraum: { von: "2026-10-13", bis: "2027-02-02" } }),
  v({ id: "ws-2026-27-x110-tutorium-2-di-1000", code: "X110", art: "Tutorium", tag: "Di", gruppe: "2", zeitraum: { von: "2026-10-13", bis: "2027-02-02" } }),
  v({ id: "ws-2026-27-x110-vorlesung-1-mi-0800", code: "X110", tag: "Mi", von: "08:00", bis: "10:00", ct: false, zeitraum: { von: "2026-10-14", bis: "2027-02-03" } }),
  v({ id: "ws-2026-27-y200-vorlesung-1-do-1000", code: "Y200", tag: "Do", zeitraum: { von: "2026-10-15", bis: "2027-02-04" } }),
);
const ID_VL = "ws-2026-27-x100-vorlesung-1-mo-1000", ID_UE = "ws-2026-27-x100-uebung-1-mo-1200", ID_X110 = "ws-2026-27-x110-vorlesung-1-mi-0800";

test("Abrufer: legt nur die Veranstaltungen des aktuellen Fachsemesters an, ohne Parallelgruppen", async () => {
  const t = tresor(daten());
  t.veroeffentlichen(FIXTURE());
  const b = await t.abrufen();
  assert.equal(b.art, "ok", b.fehler + b.warnung);
  assert.deepEqual(t.zentral(), ["Stundenplan/Mi 08.00 X110 Vorlesung.md", "Stundenplan/Mo 10.15 X100 Vorlesung.md", "Stundenplan/Mo 12.15 X100 Übung.md"]);
  const fm = t.fm("Stundenplan/Mo 10.15 X100 Vorlesung.md");
  assert.deepEqual([fm.beginn, fm.ende, fm.ausfall, fm.aenderungen, fm.modul], ["10:15", "11:45", ["2026-12-21"], ["2026-11-09|10:15|11:45|Hörsaal 2"], "[[X100 Beispiel]]"]);
  assert.deepEqual(b.lehre, { notizen: 3, gruppen: 2, ausgeblendet: 0, ohneBeginn: false });
  // zweiter Lauf ohne Änderung schreibt nichts
  const b2 = await t.abrufen();
  assert.deepEqual(b2.geschrieben, []);
  assert.equal(t.Z.stundenplan().anzahl, 3);
});

test("Abrufer: Raumänderung und Ausfall kommen in die Notiz, dein Text bleibt", async () => {
  const t = tresor(daten());
  t.veroeffentlichen(FIXTURE());
  await t.abrufen();
  const p = "Stundenplan/Mo 10.15 X100 Vorlesung.md";
  t.text[p] = t.text[p].replace(/## Meine Notizen\n- \n$/, "## Meine Notizen\n- Skript lesen\n");
  const d = FIXTURE();
  d.veranstaltungen[0].ausfall = ["2026-12-21", "2026-12-28"];
  d.veranstaltungen[0].aenderungen = [{ datum: "2026-11-23", raum: "Hörsaal 5" }];
  t.veroeffentlichen(d);
  await t.abrufen();
  assert.deepEqual(t.fm(p).ausfall, ["2026-12-21", "2026-12-28"]);
  assert.deepEqual(t.fm(p).aenderungen, ["2026-11-23|10:15|11:45|Hörsaal 5"]);
  assert.ok(t.text[p].endsWith("## Meine Notizen\n- Skript lesen\n"));
});

test("14-täglich: rhythmus steht in der Notiz, die Woche zeigt sie nur jede zweite Woche; wöchentlich ohne das Feld", () => {
  const e = Z.lehrePruefen(datei(v({ rhythmus: "14-täglich" }))).veranstaltungen[0];
  const t = Z.lehreNotizText("", e, { kurz: "Einführung in die Beispielökonomik" });
  assert.equal(fmLesen(t).rhythmus, "14-täglich");
  assert.match(t, /Montags, alle zwei Wochen, 10:15–11:45/);
  // ab von (Mo 12.10.) jede zweite Woche, wie das Wochenraster es über findetStatt liest
  const M = laden("modell", { heute: "2026-11-02", frontmatter: { "System/Daten/Semester.md": json("semester.json"), "System/Einstellungen.md": {} } }).ctx.modell;
  assert.deepEqual(["2026-11-09", "2026-11-16", "2026-11-23"].map((d) => M.findetStatt(fmLesen(t), d).statt), [true, false, true]);
  // Wird die Serie wöchentlich, fällt das Feld weg
  const w = Z.lehreNotizText(t, Object.assign({}, e, { rhythmus: "wöchentlich" }), { kurz: "Einführung in die Beispielökonomik" });
  assert.equal(fmLesen(w).rhythmus, undefined);
});

test("Verlegung: raum_seit und raum_vorher kommen in die Notiz, die Woche zeigt zwei Wochen „Neuer Raum“; ohne sie fallen die Felder weg", () => {
  const e = Z.lehrePruefen(datei(v({ raum: "Hörsaal 21 (Beispielbau)", raum_seit: "2026-10-19", raum_vorher: "Hörsaal 1 (Beispielbau)" }))).veranstaltungen[0];
  const t = Z.lehreNotizText("", e, { kurz: "Einführung in die Beispielökonomik" });
  assert.deepEqual([fmLesen(t).raum_seit, fmLesen(t).raum_vorher], ["2026-10-19", "Hörsaal 1 (Beispielbau)"]);
  assert.match(t, /Neuer Raum ab 19\.10\., vorher Hörsaal 1 \(Beispielbau\)/);
  const M = laden("modell", { heute: "2026-10-12", frontmatter: { "System/Daten/Semester.md": json("semester.json"), "System/Einstellungen.md": {} } }).ctx.modell;
  const am = (d) => { const s = M.findetStatt(fmLesen(t), d); return [s.raum, s.neuerRaum]; };
  assert.deepEqual(am("2026-10-12"), ["Hörsaal 1 (Beispielbau)", false], "vor der Verlegung der alte Raum");
  assert.deepEqual(am("2026-10-19"), ["Hörsaal 21 (Beispielbau)", true]);
  const ohne = Z.lehreNotizText(t, Object.assign({}, e, { raum_seit: "", raum_vorher: "" }), { kurz: "Einführung in die Beispielökonomik" });
  assert.deepEqual([fmLesen(ohne).raum_seit, fmLesen(ohne).raum_vorher], [undefined, undefined]);
  assert.doesNotMatch(ohne, /Neuer Raum/);
});

test("14-täglich nach dem Update: der Abrufer schreibt ältere Notizen ohne rhythmus einmal neu, auch ohne neue Daten", async () => {
  const t = tresor(daten());
  const d = FIXTURE();
  d.veranstaltungen[0].rhythmus = "14-täglich";
  t.veroeffentlichen(d);
  await t.abrufen();
  const p = "Stundenplan/Mo 10.15 X100 Vorlesung.md";
  assert.equal(t.fm(p).rhythmus, "14-täglich");
  // Stand einer Fassung ohne rhythmus: Notiz ohne das Feld, Filter-Schlüssel ohne Fassung
  t.text[p] = t.text[p].replace(/\nrhythmus: .*/, "");
  const s = t.speicher["eba-zentral-stand"];
  assert.match(s.filter, /,"f":\d+\}$/);
  s.filter = s.filter.replace(/,"f":\d+\}$/, "}");
  const b = await t.abrufen({});
  assert.deepEqual(b.aktualisiert, [p]);
  assert.equal(t.fm(p).rhythmus, "14-täglich");
  assert.deepEqual((await t.abrufen({})).geschrieben, [], "danach wieder still");
});

test("Besuche ich nicht: Notiz weg, kommt nach Änderungen nicht wieder; Zurücknehmen bringt sie zurück", async () => {
  const t = tresor(daten());
  t.veroeffentlichen(FIXTURE());
  await t.abrufen();
  t.nurFm["System/Einstellungen.md"].stundenplan_ausgeblendet = [ID_X110];
  await t.abrufen({ nurCache: true });
  assert.ok(t.papierkorb.indexOf("Stundenplan/Mi 08.00 X110 Vorlesung.md") >= 0);
  const d = FIXTURE();
  d.veranstaltungen[4].raum = "Neuer Raum";
  t.veroeffentlichen(d);
  await t.abrufen();
  assert.equal(t.zentral().indexOf("Stundenplan/Mi 08.00 X110 Vorlesung.md"), -1, "Änderung bringt sie nicht zurück");
  t.nurFm["System/Einstellungen.md"].stundenplan_ausgeblendet = [];
  await t.abrufen({ nurCache: true });
  assert.ok(t.zentral().indexOf("Stundenplan/Mi 08.00 X110 Vorlesung.md") >= 0);
  assert.equal(t.fm("Stundenplan/Mi 08.00 X110 Vorlesung.md").raum, "Neuer Raum");
});

test("Gelöschte zentrale Notiz zählt als „Besuche ich nicht“ (zurücknehmbar)", async () => {
  const t = tresor(daten());
  t.veroeffentlichen(FIXTURE());
  await t.abrufen();
  delete t.text["Stundenplan/Mo 12.15 X100 Übung.md"];
  await t.abrufen();
  assert.deepEqual(t.nurFm["System/Einstellungen.md"].stundenplan_ausgeblendet, [ID_UE]);
  assert.equal(t.zentral().indexOf("Stundenplan/Mo 12.15 X100 Übung.md"), -1);
  assert.deepEqual(t.Z.stundenplan().ausgeblendet, [ID_UE]);
});

test("Alma gewinnt im Tresor: unberührt in den Papierkorb, eigener Text wandert in die Alma-Notiz", async () => {
  const t = tresor(daten());
  t.veroeffentlichen(FIXTURE());
  await t.abrufen();
  const vlP = "Stundenplan/Mo 10.15 X100 Vorlesung.md", ueP = "Stundenplan/Mo 12.15 X100 Übung.md";
  t.text[ueP] = t.text[ueP].replace(/## Meine Notizen\n- \n$/, "## Meine Notizen\n- Blatt 1 abgeben\n");
  // Alma-Import (anderes Gerät, per Sync): beide Veranstaltungen als eigene Notizen, Alma-Zeiten
  const almaVl = "Stundenplan/Mo 10.00 X100 Vorlesung.md", almaUe = "Stundenplan/Mo 12.00 X100 Übung.md";
  t.text[almaVl] = fmSchreiben({ typ: "lehrveranstaltung", code: "X100", art: "Vorlesung", wochentag: 1, beginn: "10:00", ende: "12:00", semester: SEM, alma_schluessel: "a" }, "\n# X100 · Vorlesung\n\n## Notizen\n- \n");
  t.text[almaUe] = fmSchreiben({ typ: "lehrveranstaltung", code: "X100", art: "Übung", wochentag: 1, beginn: "12:00", ende: "14:00", semester: SEM, alma_schluessel: "b" }, "\n# X100 · Übung\n\n## Notizen\n- \n");
  const b = await t.abrufen({ nurCache: true });
  assert.deepEqual(b.ersetzt.sort(), [ID_VL, ID_UE].sort());
  assert.ok(t.papierkorb.indexOf(vlP) >= 0 && t.papierkorb.indexOf(ueP) >= 0);
  assert.ok(/Aus der zentralen Notiz übernommen \(17\.10\.2026\):\n\n- Blatt 1 abgeben\n$/.test(t.text[almaUe]));
  assert.equal(t.text[almaVl].indexOf("übernommen"), -1);
  // Notizen bleiben einzeln: keine zentrale kommt zurück, solange die Alma-Notizen da sind
  await t.abrufen();
  assert.deepEqual(t.zentral(), ["Stundenplan/Mi 08.00 X110 Vorlesung.md"]);
  // Alma-Notiz weg (in Alma abgemeldet): die zentrale gilt wieder
  delete t.text[almaVl];
  await t.abrufen({ nurCache: true });
  assert.ok(t.zentral().indexOf(vlP) >= 0);
});

test("Wegfall: wenige → unberührt weg, mit Text „(entfällt)“; Massenwegfall → nichts", async () => {
  const t = tresor(daten({ module: [modul("X100"), modul("X110"), modul("Y200", { status: "läuft" })] }));
  t.veroeffentlichen(FIXTURE());
  await t.abrufen();
  assert.equal(t.zentral().length, 4);
  const d = FIXTURE();
  // Massenwegfall: nur noch eine von vier laufenden Serien → keine gilt als entfallen
  t.veroeffentlichen(datei(d.veranstaltungen[5]));
  const b = await t.abrufen();
  assert.ok(/fehlen in den Daten/.test(b.warnung));
  assert.equal(t.zentral().length, 4);
  // Eine Serie fällt weg (mit eigenem Text) und eine zweite (unberührt): „(entfällt)“ bzw. Papierkorb
  const p = "Stundenplan/Mi 08.00 X110 Vorlesung.md";
  t.text[p] = t.text[p].replace(/## Meine Notizen\n- \n$/, "## Meine Notizen\n- wichtig\n");
  t.veroeffentlichen(datei(d.veranstaltungen[0], d.veranstaltungen[1]));
  await t.abrufen();
  assert.equal(t.fm(p).entfaellt, true);
  assert.ok(/\(entfällt\)$/.test(t.fm(p).titel));
  assert.ok(t.papierkorb.indexOf("Stundenplan/Do 10.15 Y200 Vorlesung.md") >= 0, "unberührt → Papierkorb");
  assert.equal(t.Z.stundenplan().anzahl, 2, "entfallene zählen nicht");
});

test("Ein Fehler in veranstaltungen.json hält nur den Stundenplan an", async () => {
  const t = tresor(daten());
  t.veroeffentlichen(FIXTURE(), true);
  const b = await t.abrufen();
  assert.notEqual(b.art, "fehler");
  assert.ok(/Stundenplan: Prüfsumme/.test(b.warnung));
  assert.deepEqual(t.zentral(), []);
});

test("Ohne Studienbeginn: keine Vorlesungen aus dem Musterplan", async () => {
  const t = tresor(daten({ studienbeginnStandard: true }));
  t.veroeffentlichen(FIXTURE());
  const b = await t.abrufen();
  assert.deepEqual(t.zentral(), []);
  assert.equal(b.lehre.ohneBeginn, true);
  assert.equal(t.Z.stundenplan().verfuegbar, true, "Daten sind da, Texte bitten um den Studienbeginn");
});

test("Notizen zu deiner Gruppe (aus ILIAS oder gewählt) fasst der Abrufer nie an und ersetzt mit ihnen nichts", async () => {
  const t = tresor(daten());
  t.veroeffentlichen(FIXTURE());
  await t.abrufen();
  const ueP = "Stundenplan/Mo 12.15 X100 Übung.md";
  t.text[ueP] = t.text[ueP].replace(/## Meine Notizen\n- \n$/, "## Meine Notizen\n- Blatt 1 abgeben\n");
  // gleiche Zeit wie die zentrale Übung: eine Notiz aus ILIAS und eine gewählte
  const il = "Stundenplan/Mo 12.15 X100 Übung 2.md", gw = "Stundenplan/Mo 12.15 X100 Übung 3.md";
  const fm = { typ: "lehrveranstaltung", code: "X100", art: "Übung", wochentag: 1, beginn: "12:15", ende: "13:45", semester: SEM, gruppe_id: "ws-2026-27-x100-uebung-1" };
  t.text[il] = fmSchreiben(Object.assign({}, fm, { herkunft: "ilias-gruppe", ilias_gruppe: "9001" }), "\n# X100 · Übung Gruppe 1\n\n## Notizen\n- \n");
  t.text[gw] = fmSchreiben(Object.assign({}, fm, { herkunft: "gruppe-gewaehlt" }), "\n# X100 · Übung Gruppe 1\n\n## Notizen\n- \n");
  const vorher = [t.text[il], t.text[gw]];
  const b = await t.abrufen({ nurCache: true });
  assert.deepEqual(b.ersetzt, [], "keine zentrale Notiz durch eine Gruppen-Notiz ersetzt");
  assert.ok(t.zentral().indexOf(ueP) >= 0, "die zentrale Übung bleibt (die Gruppen-Notiz weicht selbst)");
  assert.deepEqual([t.text[il], t.text[gw]], vorher, "nie geschrieben, nichts angehängt");
  assert.equal(t.papierkorb.filter((p) => p === il || p === gw).length, 0);
});

// ---------- Eigener Uni-Abgleich: kein zentraler Stundenplan ----------
const EIGENER = [
  ["abgleich.js im Tresor", (t, an) => { if (an) t.text["System/Skripte/abgleich.js"] = "// eigener Abgleich"; else delete t.text["System/Skripte/abgleich.js"]; }],
  ["Einstellung extern", (t, an) => { t.nurFm["System/Einstellungen.md"].ilias_unterlagen = an ? " Extern " : ""; }],
  ["Liste quellen_extern mit stundenplan", (t, an) => { if (an) t.nurFm["System/Einstellungen.md"].quellen_extern = ["stundenplan"]; else delete t.nurFm["System/Einstellungen.md"].quellen_extern; }],
];

test("Liste quellen_extern ohne stundenplan: zentrale Vorlesungen trotz abgleich.js", async () => {
  const t = tresor(daten());
  t.text["System/Skripte/abgleich.js"] = "// eigener Abgleich";
  t.nurFm["System/Einstellungen.md"].quellen_extern = ["ilias-dateien", "volltext"];
  t.veroeffentlichen(FIXTURE());
  const b = await t.abrufen();
  assert.equal(b.fehler + b.warnung, "");
  assert.equal(t.zentral().length, 3);
  assert.equal(t.Z.stundenplan().verfuegbar, true);
});

test("Eigener Uni-Abgleich: keine zentralen Vorlesungen, eigene Notizen unberührt, Texte versprechen nichts", async () => {
  for (const [fall, eigener] of EIGENER) {
    const t = tresor(daten());
    eigener(t, true);
    // eine Notiz des eigenen Abgleichs: ohne herkunft, Art „Übungsteil“
    const p = "Stundenplan/Mo 14.15 X100 Übungsteil.md";
    t.text[p] = fmSchreiben({ typ: "lehrveranstaltung", code: "X100", art: "Übungsteil", wochentag: 1, beginn: "14:15", ende: "15:45", semester: SEM }, "\n# X100 · Übungsteil\n\n## Notizen\n- \n");
    const vorher = t.text[p];
    t.veroeffentlichen(FIXTURE());
    const b = await t.abrufen();
    assert.equal(b.fehler + b.warnung, "", fall);
    assert.deepEqual([t.zentral(), t.papierkorb, b.lehre, b.geschrieben.filter((x) => x.indexOf("Stundenplan/") === 0)], [[], [], null, []], fall);
    assert.equal(t.text[p], vorher, fall + ": eigene Notiz nie geschrieben");
    assert.equal(t.Z.stundenplan().verfuegbar, false, fall + ": kein „kommt von selbst“");
  }
});

test("Eigener Uni-Abgleich später eingerichtet: zentrale Notizen bleiben unverändert; ohne ihn geht es weiter", async () => {
  for (const [fall, eigener] of EIGENER) {
    const t = tresor(daten());
    t.veroeffentlichen(FIXTURE());
    await t.abrufen();
    const vorher = t.zentral().map((p) => t.text[p]);
    assert.equal(vorher.length, 3, fall);
    eigener(t, true);
    const d = FIXTURE();
    d.veranstaltungen[0].raum = "Hörsaal 9";
    d.veranstaltungen.splice(4, 1); // eine Serie fällt weg
    t.veroeffentlichen(d);
    await t.abrufen();
    assert.deepEqual(t.zentral().map((p) => t.text[p]), vorher, fall + ": nichts geändert, nichts entfernt");
    assert.deepEqual(t.papierkorb, [], fall);
    assert.equal(t.Z.stundenplan().verfuegbar, false, fall);
    eigener(t, false);
    await t.abrufen();
    assert.equal(t.fm("Stundenplan/Mo 10.15 X100 Vorlesung.md").raum, "Hörsaal 9", fall + ": wieder angewendet");
    assert.ok(t.papierkorb.indexOf("Stundenplan/Mi 08.00 X110 Vorlesung.md") >= 0, fall);
    assert.equal(t.Z.stundenplan().verfuegbar, true, fall);
  }
});
