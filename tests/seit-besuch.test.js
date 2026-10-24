// „Seit deinem letzten Besuch“ (seit-besuch.js, Codeblock eba-seit-besuch): Einträge aus den zentralen Terminen nur bei fachlichen
// Änderungen und nie im ersten Lauf, abgeleitete Zeilen aus Stundenplan, ILIAS-Kalender und ILIAS-Index, Mischen mehrerer
// Gerätedateien, „gesehen“ als Schlüssel statt Uhrzeit. Nur ausgedachte Werte. Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { laden } = require("./laden.js");

const SB = require(path.join(__dirname, "..", "Studium Autopilot", "System", "Skripte", "seit-besuch.js"));
const TRESOR = path.join(__dirname, "..", "Studium Autopilot");

const T = "2026-11-02T09:00:00.000Z";
const termin = (o) => Object.assign({ titel: "Klausur X110", datum: "2027-02-10", bis: "", ort: "10:00 · Hörsaal 1", status: "offiziell", code: "X110" }, o);

test("zentral: erster Lauf und Termine nur durch deine Auswahl melden nichts", () => {
  const roh = [{ art: "neu", id: "x110-klausur", neu: termin() }];
  assert.deepEqual(SB.zentralEintraege(roh, { erster: true, altIds: new Set(), heute: "2026-11-02", t: T }), []);
  assert.deepEqual(SB.zentralEintraege(roh, { altIds: new Set(["x110-klausur"]), heute: "2026-11-02", t: T }), [], "id war schon in den Daten");
  assert.deepEqual(SB.zentralEintraege(roh, { altIds: null, heute: "2026-11-02", t: T }), [], "ohne letzten Stand kein „neu“");
  const e = SB.zentralEintraege(roh, { altIds: new Set(["anderes"]), heute: "2026-11-02", t: T });
  assert.equal(e.length, 1);
  assert.equal(e[0].art, "neu");
  assert.equal(e[0].titel, "Klausur X110");
  assert.match(e[0].k, /^z\|x110-klausur\|neu\|/);
});

test("zentral: nur Datum, Ende, Ort und Titel zählen; geschätzt → offiziell heißt bestätigt", () => {
  const o = { altIds: new Set(), heute: "2026-11-02", t: T };
  const nurInfo = SB.zentralEintraege([{ art: "geaendert", id: "a", alt: termin(), neu: termin() }], o);
  assert.deepEqual(nurInfo, [], "Info, Quelle oder Aufbau der Notiz: kein Eintrag");
  const [d] = SB.zentralEintraege([{ art: "geaendert", id: "a", alt: termin({ status: "geschätzt", datum: "2027-02-08" }), neu: termin() }], o);
  assert.equal(d.art, "geaendert");
  assert.equal(d.bestaetigt, true);
  assert.deepEqual(d.aenderung, [{ feld: "datum", alt: "2027-02-08", neu: "2027-02-10" }]);
  const [b] = SB.zentralEintraege([{ art: "geaendert", id: "a", alt: termin({ status: "geschätzt" }), neu: termin() }], o);
  assert.deepEqual(b.aenderung, []);
  assert.equal(b.bestaetigt, true);
  const [w] = SB.zentralEintraege([{ art: "geaendert", id: "a", alt: termin({ titel: "Klausur X110 (entfällt)", entfaellt: true }), neu: termin() }], o);
  assert.equal(w.art, "wieder");
  assert.equal(w.titel, "Klausur X110");
});

test("zentral: nichts zu Terminen, die schon vorbei sind; höchstens 30 je Lauf", () => {
  const o = { altIds: new Set(), heute: "2026-11-02", t: T };
  assert.deepEqual(SB.zentralEintraege([{ art: "abgesagt", id: "a", alt: termin({ datum: "2026-10-30" }) }], o), []);
  assert.deepEqual(SB.zentralEintraege([{ art: "neu", id: "a", neu: termin({ datum: "2026-10-30" }) }], o), []);
  assert.deepEqual(SB.zentralEintraege([{ art: "geaendert", id: "a", alt: termin({ datum: "2026-10-29" }), neu: termin({ datum: "2026-10-30" }) }], o), []);
  assert.equal(SB.zentralEintraege([{ art: "neu", id: "a", neu: termin({ datum: "2026-10-30", bis: "2026-11-05" }) }], o).length, 1, "läuft noch");
  const [a] = SB.zentralEintraege([{ art: "abgesagt", id: "a", alt: termin({ titel: "Tutorium (entfällt)" }) }], o);
  assert.equal(a.art, "abgesagt");
  assert.equal(a.titel, "Tutorium");
  const viele = [];
  for (let i = 0; i < 45; i++) viele.push({ art: "neu", id: "t" + i, neu: termin({ titel: "Termin " + i }) });
  const e = SB.zentralEintraege(viele, o);
  assert.equal(e.length, 30);
  assert.equal(e[29].art, "mehr");
  assert.equal(e[29].anzahl, 16);
});

test("Gerätedatei: je Schlüssel einmal, nichts älter als 60 Tage, höchstens 500", () => {
  const alt = [{ k: "a", t: "2026-08-01T00:00:00Z" }, { k: "b", t: "2026-10-20T00:00:00Z" }];
  const r = SB.protokollMischen(alt, [{ k: "b", t: T }, { k: "c", t: T }], T);
  assert.deepEqual(r.map((e) => e.k), ["b", "c"]);
  assert.equal(r[0].t, "2026-10-20T00:00:00Z", "der erste bleibt");
  const viele = [];
  for (let i = 0; i < 520; i++) viele.push({ k: "k" + i, t: T });
  const v = SB.protokollMischen([], viele, T);
  assert.equal(v.length, 500);
  assert.equal(v[0].k, "k20", "die neuesten bleiben");
});

test("gesehen: Schlüssel mit Tag, alte fallen nach 180 Tagen weg", () => {
  const g = SB.gesehenMischen({ alt: "2026-03-01", mittel: "2026-06-01" }, ["neu", "", 5], "2026-11-02");
  assert.deepEqual(g, { neu: "2026-11-02", mittel: "2026-06-01" });
});

test("Stundenplan: Ausfall, Änderung an einem Tag und neuer Raum je einmal, „Besuche ich nicht“ nie", () => {
  const notiz = (pfad, fm) => ({ f: { path: pfad, basename: path.basename(pfad, ".md") }, fm: Object.assign({ typ: "lehrveranstaltung" }, fm) });
  const liste = [
    notiz("Stundenplan/X110 Vorlesung.md", { titel: "X110 Vorlesung", zentral_id: "x110-v", code: "X110" }),
    notiz("Stundenplan/X120 Übung.md", { titel: "X120 Übung", zentral_id: "x120-u", raum_seit: "2026-11-03" }),
    notiz("Stundenplan/X130 Tutorium.md", { titel: "X130 Tutorium", zentral_id: "x130-t" }),
  ];
  const statt = (fm, d) => {
    if (fm.zentral_id === "x110-v") {
      if (d === "2026-11-04") return { statt: false, grund: "ausfall" };
      if (d === "2026-11-11") return { statt: true, beginn: "12:15", ende: "13:45", raum: "Hörsaal 9", raumGeaendert: true, raumAlt: "Hörsaal 1", zeitGeaendert: true, zeitAlt: "10:15–11:45" };
      return { statt: false, grund: "anderer Tag" };
    }
    if (fm.zentral_id === "x120-u") return ["2026-11-03", "2026-11-10"].indexOf(d) >= 0 ? { statt: true, raum: "Raum 2", neuerRaum: true, raumGeaendert: true, raumAlt: "Raum 1" } : { statt: false };
    return d === "2026-11-05" ? { statt: false, grund: "ausfall" } : { statt: false };
  };
  const e = SB.stundenplanEintraege(liste, statt, (fm) => fm.zentral_id === "x130-t", "2026-11-02");
  assert.deepEqual(e.map((x) => [x.art, x.datum]), [["ausfall", "2026-11-04"], ["verlegt", "2026-11-11"], ["raum", "2026-11-03"]]);
  assert.equal(e[1].zeit, "12:15–13:45");
  assert.equal(e[1].raumAlt, "Hörsaal 1");
  assert.equal(e[0].pfad, "Stundenplan/X110 Vorlesung.md");
  assert.equal(e[2].seit, "", "Raumwechsel erst morgen: „ab“ der nächsten Sitzung");
  assert.equal(SB.zusammenstellen([], [e[2]], {}, T)[0].meta, "Neuer Raum ab Di 03.11. · Raum 2 statt Raum 1");
  // Raumwechsel gilt schon: „seit“ dem Wechsel, nicht „ab“ der nächsten Sitzung
  const [r] = SB.stundenplanEintraege([notiz("Stundenplan/X120 Übung.md", { titel: "X120 Übung", zentral_id: "x120-u", raum_seit: "2026-10-27" })], statt, null, "2026-11-02");
  assert.equal(r.seit, "2026-10-27");
  assert.equal(SB.zusammenstellen([], [r], {}, T)[0].meta, "Neuer Raum seit Di 27.10. · Raum 2 statt Raum 1");
});

test("ILIAS-Kalender: nur offene Abgaben ab heute", () => {
  const t = (pfad, fm) => ({ f: { path: pfad, basename: path.basename(pfad, ".md") }, fm: Object.assign({ typ: "termin", herkunft: "ilias-kalender", ilias_kalender_id: "exc/1/abgabe/" + pfad.length }, fm) });
  const e = SB.abgabenEintraege([
    t("Termine/2026-11-10 X110 Abgabe in ILIAS.md", { titel: "X110 Abgabe 3", datum: "2026-11-10" }),
    t("Termine/2026-10-30 X110 Abgabe in ILIAS.md", { titel: "X110 Abgabe 2", datum: "2026-10-30" }),
    t("Termine/2026-11-12 X120 Abgabe in ILIAS.md", { titel: "X120 Abgabe 1", datum: "2026-11-12", erledigt: true }),
    { f: { path: "Termine/zentral.md", basename: "zentral" }, fm: { typ: "termin", herkunft: "zentral", datum: "2026-11-10" } },
  ], "2026-11-02");
  assert.deepEqual(e.map((x) => x.titel), ["X110 Abgabe 3"]);
  assert.match(e[0].k, /^ik\|exc\/1\/abgabe\/\d+\|2026-11-10$/);
});

test("ILIAS-Dateien: neu geladene und aktualisierte der letzten 30 Tage, nie vom ersten Tag eines Kurses, vorhandene oder gelöschte", () => {
  const index = {
    kurse: { 11: { code: "X110" }, 12: { code: "X120" } },
    dateien: {
      a: { kurs: "11", seit: "2026-10-30", wie: "neu" }, // erster Tag des Kurses: erstes Laden, keine Änderung
      f: { kurs: "11", seit: "2026-10-31", wie: "neu" },
      b: { kurs: "11", seit: "2026-10-30", wie: "vorhanden" },
      c: { kurs: "12", seit: "2026-09-01", wie: "neu" },
      d: { kurs: "12", seit: "2026-09-01", wie: "neu", aktualisiert: "2026-11-01" },
      e: { kurs: "12", seit: "2026-10-31", wie: "neu", geloescht: true },
    },
  };
  const e = SB.iliasEintraege(index, "2026-11-02");
  assert.deepEqual(e.map((x) => [x.k, x.code, x.art]), [["if|f|neu", "X110", "datei"], ["if|d|2026-11-01", "X120", "aktualisiert"]]);
  assert.deepEqual(SB.iliasEintraege(null, "2026-11-02"), []);
});

test("Zusammenstellen: zwei Geräte mit derselben Änderung einmal, Gesehenes nie, ILIAS je Modul eine Zeile", () => {
  const z = SB.zentralEintraege([
    { art: "geaendert", id: "x110-klausur", alt: termin({ datum: "2027-02-08", ort: "Hörsaal 1" }), neu: termin({ ort: "Hörsaal 9" }) },
    { art: "abgesagt", id: "x120-info", alt: termin({ titel: "Infoabend", datum: "2026-11-20", code: "" }) },
  ], { altIds: new Set(), heute: "2026-11-02", t: T });
  const [ort] = SB.zusammenstellen([SB.zentralEintraege([{ art: "geaendert", id: "y", alt: termin({ ort: "18:00 · Hörsaal 1" }), neu: termin({ ort: "18:00 · Hörsaal 9" }) }],
    { altIds: new Set(), heute: "2026-11-02", t: T })], [], {}, T);
  assert.equal(ort.meta, "Hörsaal 9 statt Hörsaal 1", "gleiche Uhrzeit nur einmal");
  const ilias = [{ q: "ilias", art: "datei", code: "X110", datum: "2026-10-30", k: "if|a|neu" }, { q: "ilias", art: "datei", code: "X110", datum: "2026-10-31", k: "if|b|neu" },
    { q: "ilias", art: "aktualisiert", code: "X110", datum: "2026-11-01", k: "if|c|2026-11-01" }];
  const abgabe = { q: "ilias-kalender", art: "abgabe", titel: "X110 Abgabe 3", datum: "2026-11-10", k: "ik|1|2026-11-10" };
  const ausfall = { q: "stundenplan", art: "ausfall", titel: "X110 Vorlesung", datum: "2026-11-04", k: "lv|x|2026-11-04|ausfall" };
  const zeilen = SB.zusammenstellen([z, z.slice(0, 1)], ilias.concat([abgabe, ausfall]), { "lv|x|2026-11-04|ausfall": "2026-11-02" }, T);
  assert.deepEqual(zeilen.map((x) => x.q), ["zentral", "zentral", "ilias-kalender", "ilias"]);
  assert.equal(zeilen[0].meta, "Mi 10.02. statt Mo 08.02. · Hörsaal 9 statt Hörsaal 1");
  assert.equal(zeilen[1].meta, "Entfällt · Fr 20.11.");
  assert.equal(zeilen[2].meta, "Neue Abgabe · bis Di 10.11.");
  assert.equal(zeilen[3].titel, "X110 · Unterlagen aus ILIAS");
  assert.equal(zeilen[3].meta, "2 neue Dateien · 1 aktualisiert");
  assert.equal(zeilen[3].keys.length, 3);
  // alles gesehen → nichts mehr
  const g = SB.gesehenMischen({}, [].concat(...zeilen.map((x) => x.keys)), "2026-11-02");
  assert.deepEqual(SB.zusammenstellen([z], ilias.concat([abgabe]), g, T), []);
  // Einträge älter als 60 Tage zählen nicht
  assert.deepEqual(SB.zusammenstellen([z], [], {}, "2027-01-15T00:00:00Z"), []);
});

test("Hin und zurück: je Termin die neueste Meldung; zurückverlegt ist eine neue Änderung, auch nach „Alles gesehen“", () => {
  const lauf = (alt, neu, t) => SB.zentralEintraege([{ art: "geaendert", id: "x110-klausur", alt: termin({ datum: alt }), neu: termin({ datum: neu }) }],
    { altIds: new Set(), heute: "2026-11-02", t });
  const hin = lauf("2027-02-08", "2027-02-10", "2026-11-02T09:00:00.000Z");
  const weiter = lauf("2027-02-10", "2027-02-12", "2026-11-03T09:00:00.000Z");
  const zurueck = lauf("2027-02-12", "2027-02-10", "2026-11-04T09:00:00.000Z");
  assert.notEqual(zurueck[0].k, hin[0].k, "gleicher neuer Stand, anderer alter: anderer Schlüssel");
  const jetzt = "2026-11-04T10:00:00.000Z";
  const g = SB.gesehenMischen({}, SB.zusammenstellen([hin], [], {}, jetzt)[0].keys, "2026-11-02");
  const zeilen = SB.zusammenstellen([hin.concat(weiter), zurueck], [], g, jetzt);
  assert.equal(zeilen.length, 1);
  assert.equal(zeilen[0].meta, "Mi 10.02. statt Fr 12.02.");
  assert.deepEqual(zeilen[0].keys, [weiter[0].k, zurueck[0].k]);
  // neueste gesehen → der Termin steht nicht mehr da, auch wenn eine ältere Meldung ungesehen ist
  assert.deepEqual(SB.zusammenstellen([hin.concat(weiter), zurueck], [], SB.gesehenMischen({}, [zurueck[0].k], "2026-11-04"), jetzt), []);
  // ungesehen neu, dann geändert → bleibt „Neu“ mit dem Stand von jetzt
  const neu = SB.zentralEintraege([{ art: "neu", id: "x110-klausur", neu: termin({ datum: "2027-02-08" }) }], { altIds: new Set(["anderes"]), heute: "2026-11-02", t: "2026-11-01T09:00:00.000Z" });
  const [n] = SB.zusammenstellen([neu, hin], [], {}, jetzt);
  assert.equal(n.art, "neu");
  assert.equal(n.meta, "Neu · Mi 10.02.");
  // abgesagt, wieder da, erneut abgesagt am selben Tag des Termins: zwei Absagen
  const ab = (t) => SB.zentralEintraege([{ art: "abgesagt", id: "x120-info", alt: termin({ datum: "2026-11-20" }) }], { altIds: new Set(), heute: "2026-11-02", t })[0].k;
  assert.notEqual(ab("2026-11-02T09:00:00.000Z"), ab("2026-11-05T09:00:00.000Z"));
});

test("Karte liest alle Gerätedateien; „Alles gesehen“ schreibt nur die Datei dieses Geräts", async () => {
  const dateien = {
    "System/Daten/seit-besuch/g-aaa.json": { version: 1, eintraege: SB.zentralEintraege([{ art: "abgesagt", id: "x120-info", alt: termin({ titel: "Infoabend", datum: "2026-11-20" }) }],
      { altIds: new Set(), heute: "2026-11-02", t: T }) },
    "System/Daten/seit-besuch/g-bbb.json": { version: 1, eintraege: SB.zentralEintraege([{ art: "abgesagt", id: "x130-vortrag", alt: termin({ titel: "Vortrag", datum: "2026-11-21" }) }],
      { altIds: new Set(), heute: "2026-11-02", t: T }) },
  };
  dateien["System/Daten/seit-besuch/gesehen-g-bbb.json"] = { version: 1, gesehen: { [dateien["System/Daten/seit-besuch/g-bbb.json"].eintraege[0].k]: "2026-11-02" } };
  const { ctx, ergebnis } = laden("seit-besuch", { kontext: {
    zentral: { geraetId: () => "g-aaa" },
    modell: { daten: () => ({ stundenplan: [], termine: [], module: [], einstellungen: {} }), zeit: { heute: () => "2026-11-02" } },
    date: { jetzt: () => new Date("2026-11-02T12:00:00Z") },
  } });
  const V = ctx.app.vault, text = {};
  for (const p of Object.keys(dateien)) text[p] = JSON.stringify(dateien[p]);
  const f = (p) => ({ path: p, name: p.split("/").pop(), extension: "json" });
  V.getAbstractFileByPath = (p) => (p === "System/Daten/seit-besuch" ? { path: p, children: Object.keys(text).map(f) } : p in text ? f(p) : null);
  V.read = async (x) => text[x.path];
  V.process = async (x, fn) => { text[x.path] = fn(text[x.path]); };
  V.create = async (p, t) => { text[p] = t; return f(p); };
  V.createFolder = async () => {};
  const d = await ergebnis.daten();
  assert.deepEqual(d.zeilen.map((z) => z.titel), ["Infoabend"], "gesehen auf einem anderen Gerät gilt auch hier");
  await ergebnis.allesGesehen(d.zeilen);
  assert.deepEqual(Object.keys(JSON.parse(text["System/Daten/seit-besuch/gesehen-g-aaa.json"]).gesehen), d.zeilen[0].keys);
  assert.equal(Object.keys(JSON.parse(text["System/Daten/seit-besuch/gesehen-g-bbb.json"]).gesehen).length, 1, "fremde Datei unberührt");
  assert.equal(await ergebnis.daten(), null);
});

test("Aufgeklappt Angezeigtes gilt nach dem Besuch als gesehen, auch nach einem Neustart; Fehler beim Schreiben verliert nichts", async () => {
  const eintraege = SB.zentralEintraege([{ art: "abgesagt", id: "x120-info", alt: termin({ titel: "Infoabend", datum: "2026-11-20" }) }],
    { altIds: new Set(), heute: "2026-11-02", t: T });
  const text = { "System/Daten/seit-besuch/g-aaa.json": JSON.stringify({ version: 1, eintraege }) };
  const { ctx, ergebnis } = laden("seit-besuch", { kontext: {
    zentral: { geraetId: () => "g-aaa" },
    modell: { daten: () => ({ stundenplan: [], termine: [], module: [], einstellungen: {} }), zeit: { heute: () => "2026-11-02" } },
    date: { jetzt: () => new Date("2026-11-02T12:00:00Z") },
  } });
  const speicher = {};
  ctx.app.loadLocalStorage = (k) => (k in speicher ? JSON.parse(speicher[k]) : null);
  ctx.app.saveLocalStorage = (k, v) => { if (v == null) delete speicher[k]; else speicher[k] = JSON.stringify(v); };
  const V = ctx.app.vault, f = (p) => ({ path: p, name: p.split("/").pop(), extension: "json" });
  let kaputt = false;
  V.getAbstractFileByPath = (p) => (p === "System/Daten/seit-besuch" ? { path: p, children: Object.keys(text).map(f) } : p in text ? f(p) : null);
  V.read = async (x) => text[x.path];
  V.process = async (x, fn) => { text[x.path] = fn(text[x.path]); };
  V.create = async (p, t) => { if (kaputt) throw new Error("voll"); text[p] = t; return f(p); };
  V.createFolder = async () => {};

  assert.equal(await ergebnis.besuchVorbei(), false, "nichts aufgeklappt: nichts einzutragen");
  const d = await ergebnis.daten();
  assert.equal(d.zeilen.length, 1);
  ergebnis.angezeigtMerken(d.zeilen);
  assert.equal((await ergebnis.daten()).zeilen.length, 1, "während des Besuchs bleibt die Zeile stehen");
  kaputt = true;
  const fehler = console.error;
  console.error = () => {};
  try { assert.equal(await ergebnis.besuchVorbei(), false); } finally { console.error = fehler; }
  assert.deepEqual(ctx.app.loadLocalStorage("eba-seit-besuch-angezeigt"), d.zeilen[0].keys, "bleibt gemerkt");
  kaputt = false;
  assert.equal(await ergebnis.besuchVorbei(), true);
  assert.equal(ctx.app.loadLocalStorage("eba-seit-besuch-angezeigt"), null);
  assert.deepEqual(Object.keys(JSON.parse(text["System/Daten/seit-besuch/gesehen-g-aaa.json"]).gesehen), d.zeilen[0].keys);
  assert.equal(await ergebnis.daten(), null);
});

test("Skript lädt ohne Obsidian und meldet ctx.seitBesuch; Dashboard trägt den Block, nie „Was ist neu“", () => {
  const { ctx, ergebnis } = laden("seit-besuch");
  assert.equal(typeof ergebnis.registrieren, "function");
  assert.equal(typeof ctx.seitBesuch.zentral, "function");
  assert.equal(ctx.seitBesuch.ORDNER, "System/Daten/seit-besuch");
  const dash = fs.readFileSync(path.join(TRESOR, "Dashboard.md"), "utf8");
  assert.match(dash, /```eba-seit-besuch\r?\n```/);
  const code = fs.readFileSync(path.join(TRESOR, "System", "Skripte", "seit-besuch.js"), "utf8");
  assert.doesNotMatch(code, /Was ist neu|Neuigkeit/, "Namen gehören dem Changelog-Fenster (update.js)");
});
