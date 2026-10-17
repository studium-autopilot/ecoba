// Datenkanal (zentral.js): id-Regel, Dateinamen und die strenge Prüfung der zentralen Daten (docs/daten-v1.md).
// Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { laden, json, bytes } = require("./laden.js");

const Z = laden("zentral").ctx.zentral;

// Ein gültiger Termin als Ausgangspunkt; jeder Fall ändert genau ein Feld
const termin = (anders = {}) => Object.assign({
  id: "2026-10-12-vorlesungsbeginn-ws-2026-27", titel: "Vorlesungsbeginn WS 2026/27", datum: "2026-10-12", bis: "",
  uhrzeit: "", ort: "", kategorie: "Semester", status: "offiziell", code: "", quelle_url: "https://uni-tuebingen.de/studium/",
  quelle_text: "", info: "", geprueft: "2026-10-14",
}, anders);
const pruefe = (...eintraege) => Z.terminePruefen({ schema: 1, termine: eintraege });

test("id-Regel: Prüfwerte aus docs/daten-v1.md", () => {
  const faelle = {
    "2026-10-08 Kneipentour 😍 und Semester Opening": "2026-10-08-kneipentour-und-semester-opening",
    "2027-01-29 Klausurphase Haupttermin WS 2026-27": "2027-01-29-klausurphase-haupttermin-ws-2026-27",
    "2026-10-06 Neu an der Uni – wie geht’s nun weiter": "2026-10-06-neu-an-der-uni-wie-geht-s-nun-weiter",
    "2026-10-05 Alma-Einführung für neue Studierende": "2026-10-05-alma-einfuehrung-fuer-neue-studierende",
    "2026-11-02 Tutorien starten – B110 BWL": "2026-11-02-tutorien-starten-b110-bwl",
  };
  for (const [name, id] of Object.entries(faelle)) assert.equal(Z.idAusName(name), id, name);
});

test("id-Regel: .md, Akzente, ß und Höchstlänge", () => {
  assert.equal(Z.idAusName("2026-12-01 Café Größe.md"), "2026-12-01-cafe-groesse");
  const lang = Z.idAusName("2026-12-01 " + "Sehr lange Überschrift ".repeat(10));
  assert.ok(lang.length <= 80, "höchstens 80 Zeichen");
  assert.ok(!lang.endsWith("-"), "kein - am Ende");
});

test("Dateiname der Termin-Notiz", () => {
  assert.equal(Z.dateiName("2026-10-20", "UB-Kurs: Zotero"), "2026-10-20 UB-Kurs – Zotero");
  assert.equal(Z.dateiName("2027-01-29", "Klausurphase WS 2026/27"), "2027-01-29 Klausurphase WS 2026-27");
  assert.equal(Z.dateiName("2026-10-20", "Was ist neu?..."), "2026-10-20 Was ist neu-");
});

test("Termine: gültiger Eintrag wird übernommen, unbekannte Felder ignoriert", () => {
  const r = pruefe(termin({ neu_in_v1_1: "x" }));
  assert.equal(r.verworfen.length, 0);
  assert.equal(r.termine.length, 1);
  assert.equal(r.termine[0].titel, "Vorlesungsbeginn WS 2026/27");
  assert.equal(r.termine[0].neu_in_v1_1, undefined);
});

test("Termine: ungültige Einträge werden einzeln verworfen", () => {
  const schlecht = {
    "id ungültig": { id: "Gross Und Leer" },
    "titel unzulässig": { titel: "<b>fett</b>" },
    "wikilink im titel": { titel: "Siehe [[Notiz]]" },
    "datum ungültig": { datum: "2027-02-30" },
    "bis vor datum": { bis: "2026-10-01" },
    "kategorie nicht erlaubt": { kategorie: "Party" },
    "status ungültig": { status: "vielleicht" },
    "code ungültig": { code: "b110" },
    "nicht https": { quelle_url: "http://uni-tuebingen.de/" },
    "fremde domain": { quelle_url: "https://example.org/" },
    "uhrzeit ungültig": { uhrzeit: "25:00" },
    "info zu lang": { info: "x".repeat(201) },
  };
  let i = 0;
  for (const [fall, anders] of Object.entries(schlecht)) {
    const r = pruefe(termin(Object.assign({ id: anders.id || "fall-" + i++ }, anders)));
    assert.equal(r.termine.length, 0, fall);
    assert.equal(r.verworfen.length, 1, fall);
  }
});

test("Termine: doppelte id, Bereich und Säubern von info", () => {
  const r = pruefe(
    termin({ id: "a-1", info: "Mehr unter <a href=x>Link</a> und [[Notiz]] obsidian://open?x" }),
    termin({ id: "a-1" }),
    termin({ id: "b-1", bereich: "schluesselqualifikation" }),
    termin({ id: "c-1", bereich: "unbekannt" }),
  );
  assert.deepEqual(r.verworfen, [{ id: "a-1", grund: "doppelte id" }]);
  assert.equal(r.termine.length, 3);
  assert.ok(!/[<>]|\[\[|obsidian:/.test(r.termine[0].info), "info ist reiner Text: " + r.termine[0].info);
  assert.equal(r.termine[1].bereich, "schluesselqualifikation");
  assert.equal(r.termine[2].bereich, undefined);
});

test("Termine: falsches Format oder zu viele Einträge → ganze Datei abgelehnt", () => {
  assert.ok(Z.terminePruefen({ schema: 2, termine: [] }).fehler);
  assert.ok(Z.terminePruefen({ schema: 1 }).fehler);
  assert.ok(Z.terminePruefen({ schema: 1, termine: new Array(2001).fill(termin()) }).fehler);
});

test("Manifest: Pflichtfelder, Prüfsummen, Version", () => {
  const m = { schema: 1, erstellt: "2026-10-15T09:40:12Z", dateien: { "termine.json": { sha256: "a".repeat(64), groesse: 10 } }, plugin_aktuell: "0.1.0", hinweis: "", pause: false };
  const ok = Z.manifestPruefen(m);
  assert.equal(ok.fehler, undefined);
  assert.equal(ok.wert.plugin_aktuell, "0.1.0");
  assert.ok(Z.manifestPruefen(Object.assign({}, m, { schema: 2 })).fehler);
  assert.ok(Z.manifestPruefen(Object.assign({}, m, { erstellt: "gestern" })).fehler);
  assert.ok(Z.manifestPruefen(Object.assign({}, m, { dateien: { "termine.json": { sha256: "xyz", groesse: 10 } } })).fehler);
  assert.equal(Z.manifestPruefen(Object.assign({}, m, { plugin_aktuell: "1.0" })).wert.plugin_aktuell, "");
  assert.equal(Z.manifestPruefen(Object.assign({}, m, { pause: "ja" })).wert.pause, false, "pause nur bei true");
});

test("Semesterdaten: ungültige Semester fallen weg, ohne gültige → Fehler", () => {
  const d = { schema: 1, semester: [
    { name: "WS 2026/27", beginn: "2026-10-01", ende: "2027-03-31", vorlesung_beginn: "2026-10-12", vorlesung_ende: "2027-02-06", status: "offiziell" },
    { name: "Winter 26", beginn: "2026-10-01", ende: "2027-03-31", vorlesung_beginn: "2026-10-12", vorlesung_ende: "2027-02-06", status: "offiziell" },
  ] };
  const r = Z.semesterPruefen(d);
  assert.equal(r.wert.semester.length, 1);
  assert.equal(r.verworfen.length, 1);
  assert.ok(Z.semesterPruefen({ schema: 1, semester: [] }).fehler);
});

// ---------- Öffentliche zentrale Daten (Schnappschuss in tests/daten/v1/) ----------

test("Schnappschuss: Prüfsummen stimmen mit dem Manifest überein", async () => {
  const m = Z.manifestPruefen(json("manifest.json"));
  assert.equal(m.fehler, undefined, m.fehler);
  for (const name of Object.keys(m.wert.dateien)) {
    const b = bytes(name);
    assert.equal(b.length, m.wert.dateien[name].groesse, name + ": Größe");
    assert.equal(await Z.sha256(b), m.wert.dateien[name].sha256, name + ": SHA-256");
  }
});

test("Schnappschuss: alle Termine und Semester sind gültig", () => {
  const t = Z.terminePruefen(json("termine.json"));
  assert.equal(t.fehler, undefined, t.fehler);
  assert.deepEqual(t.verworfen, [], "verworfene Termine");
  assert.ok(t.termine.length > 0);
  const s = Z.semesterPruefen(json("semester.json"));
  assert.equal(s.fehler, undefined, s.fehler);
  assert.deepEqual(s.verworfen, [], "verworfene Semesterangaben");
});

// Aktuelle Daten von GitHub Pages (nur mit ECOBA_LIVE=1, braucht Netz)
test("Live: aktuelle zentrale Daten sind gültig", { skip: process.env.ECOBA_LIVE !== "1" && "nur mit ECOBA_LIVE=1" }, async () => {
  const holen = async (name) => {
    const r = await fetch(Z.BASIS + name, { cache: "no-store" });
    assert.equal(r.status, 200, name);
    return new Uint8Array(await r.arrayBuffer());
  };
  const m = Z.manifestPruefen(JSON.parse(new TextDecoder().decode(await holen("manifest.json"))));
  assert.equal(m.fehler, undefined, m.fehler);
  for (const name of Object.keys(m.wert.dateien)) {
    const b = await holen(name);
    assert.equal(await Z.sha256(b), m.wert.dateien[name].sha256, name + ": SHA-256");
    const d = JSON.parse(new TextDecoder().decode(b));
    const r = name === "termine.json" ? Z.terminePruefen(d) : name === "gruppen.json" ? Z.gruppenPruefen(d) : Z.semesterPruefen(d);
    assert.equal(r.fehler, undefined, r.fehler);
    assert.deepEqual(r.verworfen, [], name + ": verworfen");
  }
});

// ---------- Übungs- und Tutoriengruppen (gruppen.json, docs/daten-v1.md) – nur ausgedachte Daten ----------

const gruppe = (anders = {}) => Object.assign({
  id: "ws-2026-27-x100-uebung-1", code: "X100", art: "Übung", gruppe: "1", tag: "Di", von: "08:00", bis: "10:00", ct: true,
  raum: "Hörsaal 1 (Beispielbau)", leitung: "", anmeldung: "Über den ILIAS-Kurs, ab Mo 19.10., 12:00.",
  quelle_url: "https://alma.uni-tuebingen.de/alma/pages/startFlow.xhtml?_flowId=detailView-flow&unitId=1&periodId=1",
  semester: "WS 2026/27", zeitraum: { von: "2026-10-20", bis: "2027-02-02" }, geprueft: "2026-10-17",
}, anders);
const gruppenPruefe = (...g) => Z.gruppenPruefen({ schema: 1, stand: "2026-10-17", gruppen: g });

test("Gruppen: gültiger Eintrag wird übernommen, unbekannte Felder ignoriert", () => {
  const r = gruppenPruefe(gruppe({ neu_in_v1_2: "x", leitung: "Dr. Erika Beispiel" }));
  assert.deepEqual(r.verworfen, []);
  assert.equal(r.stand, "2026-10-17");
  assert.deepEqual(r.gruppen[0], {
    id: "ws-2026-27-x100-uebung-1", code: "X100", art: "Übung", gruppe: "1", tag: "Di", von: "08:00", bis: "10:00", ct: true,
    raum: "Hörsaal 1 (Beispielbau)", leitung: "Dr. Erika Beispiel", anmeldung: "Über den ILIAS-Kurs, ab Mo 19.10., 12:00.",
    quelle_url: gruppe().quelle_url, semester: "WS 2026/27", zeitraum: { von: "2026-10-20", bis: "2027-02-02" }, geprueft: "2026-10-17",
  });
  const ohne = gruppenPruefe(gruppe({ gruppe: "", ct: "ja", zeitraum: undefined, geprueft: "" })).gruppen[0];
  assert.equal(ohne.ct, false, "ct nur bei true");
  assert.equal(ohne.zeitraum, null);
  assert.equal(ohne.gruppe, "");
});

test("Gruppen: ungültige Einträge werden einzeln verworfen", () => {
  const schlecht = {
    "id ungültig": { id: "Gross" },
    "code ungültig": { code: "x100" },
    "art nicht erlaubt": { art: "Vorlesung" },
    "samstag": { tag: "Sa" },
    "bis vor von": { von: "10:00", bis: "08:00" },
    "uhrzeit kaputt": { von: "8:00" },
    "semester ungültig": { semester: "Winter 26" },
    "ohne quelle": { quelle_url: "" },
    "fremde domain": { quelle_url: "https://example.org/x" },
    "nicht https": { quelle_url: "http://alma.uni-tuebingen.de/x" },
    "zeitraum verkehrt": { zeitraum: { von: "2027-02-02", bis: "2026-10-20" } },
    "zeitraum kein objekt": { zeitraum: "WS" },
    "wikilink in gruppe": { gruppe: "[[1]]" },
    "gruppe zu lang": { gruppe: "Gruppe mit sehr langem Namen" },
    "leitung zu lang": { leitung: "x".repeat(121) },
    "anmeldung zu lang": { anmeldung: "x".repeat(201) },
  };
  let i = 0;
  for (const [fall, anders] of Object.entries(schlecht)) {
    const r = gruppenPruefe(gruppe(Object.assign({ id: anders.id || "fall-" + i++ }, anders)));
    assert.equal(r.gruppen.length, 0, fall);
    assert.equal(r.verworfen.length, 1, fall);
  }
});

test("Gruppen: doppelte id, Säubern, ganze Datei abgelehnt", () => {
  const r = gruppenPruefe(gruppe({ raum: "<b>HS 1</b> obsidian://open?x" }), gruppe());
  assert.deepEqual(r.verworfen, [{ id: "ws-2026-27-x100-uebung-1", grund: "doppelte id" }]);
  assert.equal(r.gruppen[0].raum, "HS 1");
  assert.ok(Z.gruppenPruefen({ schema: 2, gruppen: [] }).fehler);
  assert.ok(Z.gruppenPruefen({ schema: 1 }).fehler);
  assert.ok(Z.gruppenPruefen({ schema: 1, gruppen: new Array(1001).fill(gruppe()) }).fehler);
});

test("Manifest: gruppen.json ist bekannt (Prüfsumme, Höchstgröße)", () => {
  const m = { schema: 1, erstellt: "2026-10-17T09:00:00Z", dateien: { "gruppen.json": { sha256: "b".repeat(64), groesse: 900 } } };
  assert.deepEqual(Z.manifestPruefen(m).wert.dateien, { "gruppen.json": { sha256: "b".repeat(64), groesse: 900 } });
  assert.ok(Z.manifestPruefen(Object.assign({}, m, { dateien: { "gruppen.json": { sha256: "b".repeat(64), groesse: 600000 } } })).fehler);
});

// Abruf mit Testquelle: Gruppen holt jedes Gerät selbst, auch wenn ein anderes Gerät die Termine schreibt
test("Abruf: gruppen.json wird gerätelokal übernommen, auch ohne Abrufer-Rolle; falsche Prüfsumme → nichts", async () => {
  const crypto = require("node:crypto");
  const speicher = {};
  const quelle = {};
  const fremd = JSON.stringify({ geraet: "g-anderes", seit: new Date().toISOString(), zuletzt: new Date().toISOString(), angewendet: {} });
  const L = laden("zentral", {
    frontmatter: { "System/Einstellungen.md": {}, "System/Daten/abruf.json": {} },
    kontext: { plugin: { testZentralAus: true, testQuelle: async (n) => quelle[n] }, modell: { daten: () => ({ module: [], fachsemester: 1 }) } },
  });
  const app = L.ctx.app;
  app.loadLocalStorage = (k) => (k in speicher ? JSON.parse(speicher[k]) : null);
  app.saveLocalStorage = (k, v) => { if (v == null) delete speicher[k]; else speicher[k] = JSON.stringify(v); };
  app.vault.read = async () => fremd;
  let gezeichnet = 0;
  L.ctx.gruppenAnzeige = { neu: () => { gezeichnet++; } };
  const ZZ = L.ctx.zentral;
  const setzen = (daten, falsch) => {
    quelle["gruppen.json"] = JSON.stringify(daten);
    const b = Buffer.from(quelle["gruppen.json"], "utf8");
    quelle["manifest.json"] = JSON.stringify({ schema: 1, erstellt: "2026-10-17T09:00:00Z",
      dateien: { "gruppen.json": { sha256: falsch ? "0".repeat(64) : crypto.createHash("sha256").update(b).digest("hex"), groesse: b.length } } });
  };
  assert.equal(ZZ.gruppen(), null);
  setzen({ schema: 1, stand: "2026-10-17", gruppen: [gruppe(), gruppe({ id: "kaputt", tag: "So" })] });
  const b1 = await ZZ.abrufen({});
  assert.equal(b1.art, "anderes-geraet");
  assert.equal(ZZ.gruppen().gruppen.length, 1);
  assert.equal(ZZ.gruppen().stand, "2026-10-17");
  assert.deepEqual(b1.verworfen, [{ id: "gruppe kaputt", grund: "tag ungültig" }]);
  assert.equal(gezeichnet, 1);
  // gleiche Prüfsumme: nicht neu holen, nicht neu zeichnen
  await ZZ.abrufen({});
  assert.equal(gezeichnet, 1);
  // falsche Prüfsumme: Fehler, alter Stand bleibt
  setzen({ schema: 1, gruppen: [] }, true);
  const b3 = await ZZ.abrufen({});
  assert.equal(b3.art, "fehler");
  assert.match(b3.fehler, /Prüfsumme von gruppen\.json/);
  assert.equal(ZZ.gruppen().gruppen.length, 1);
});
