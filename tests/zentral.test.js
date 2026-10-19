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
    const pruefen = { "termine.json": Z.terminePruefen, "gruppen.json": Z.gruppenPruefen, "angebote.json": Z.angebotePruefen };
    const r = (pruefen[name] || Z.semesterPruefen)(d);
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
test("Abruf: gruppen.json wird gerätelokal übernommen, auch ohne Abrufer-Rolle; falsche Prüfsumme → alter Stand, Warnung", async () => {
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
  // falsche Prüfsumme: alter Stand bleibt, nur eine Warnung (der Lauf geht weiter)
  setzen({ schema: 1, gruppen: [] }, true);
  const b3 = await ZZ.abrufen({});
  assert.equal(b3.art, "anderes-geraet");
  assert.equal(b3.fehler, "");
  assert.match(b3.warnung, /Prüfsumme von gruppen\.json/);
  assert.equal(ZZ.gruppen().gruppen.length, 1);
});

// Kaputte gruppen.json hält Termine und Semesterdaten nicht an; verworfene Gruppen bleiben im Bericht
test("Abruf: Fehler in gruppen.json → Termine werden trotzdem übernommen", async () => {
  const crypto = require("node:crypto");
  const speicher = {};
  const quelle = {};
  const geschrieben = {};
  const L = laden("zentral", {
    frontmatter: { "System/Einstellungen.md": {} },
    kontext: { plugin: { testZentralAus: true, testQuelle: async (n) => quelle[n] }, modell: { daten: () => ({ module: [], fachsemester: 1 }) } },
  });
  const app = L.ctx.app;
  app.loadLocalStorage = (k) => (k in speicher ? JSON.parse(speicher[k]) : null);
  app.saveLocalStorage = (k, v) => { if (v == null) delete speicher[k]; else speicher[k] = JSON.stringify(v); };
  app.vault.create = async (p, t) => { geschrieben[p] = t; return { path: p }; };
  const ZZ = L.ctx.zentral;
  const datei = (name, daten) => { quelle[name] = JSON.stringify(daten); const b = Buffer.from(quelle[name], "utf8"); return { sha256: crypto.createHash("sha256").update(b).digest("hex"), groesse: b.length }; };
  const termine = datei("termine.json", { schema: 1, termine: [{ id: "kaputt", titel: "<b>x</b>", datum: "2026-11-02", kategorie: "Frist", status: "offiziell" }] });
  const gruppen = datei("gruppen.json", { schema: 1, gruppen: [gruppe(), gruppe({ id: "kaputt-g", tag: "So" })] });
  quelle["manifest.json"] = JSON.stringify({ schema: 1, erstellt: "2026-10-17T09:00:00Z", dateien: { "termine.json": termine, "gruppen.json": gruppen } });
  // gültige Gruppen: verworfene Gruppe und verworfener Termin stehen beide im Bericht
  const b1 = await ZZ.abrufen({});
  assert.equal(b1.art, "ok");
  assert.deepEqual(b1.verworfen.map((v) => v.id).sort(), ["gruppe kaputt-g", "kaputt"]);
  assert.ok(geschrieben["System/Daten/abruf.json"], "abruf.json geschrieben (Abrufer)");
  // falsche Prüfsumme der Gruppen: Termine laufen weiter, nur Warnung
  quelle["manifest.json"] = JSON.stringify({ schema: 1, erstellt: "2026-10-17T10:00:00Z",
    dateien: { "termine.json": termine, "gruppen.json": Object.assign({}, gruppen, { sha256: "0".repeat(64) }) } });
  const b2 = await ZZ.abrufen({ manuell: true });
  assert.notEqual(b2.art, "fehler");
  assert.match(b2.warnung, /^Gruppen: Prüfsumme von gruppen\.json/);
  assert.deepEqual(b2.verworfen.map((v) => v.id), ["kaputt"]);
  assert.equal(ZZ.gruppen().gruppen.length, 1);
});

// ---------- Angebote der Uni (angebote.json, docs/daten-v1.md) – nur ausgedachte Daten ----------

const angebot = (anders = {}) => Object.assign({
  id: "2026-10-19-vortrag-beispiel", kategorie: "vortrag", reihe: "Studium Generale", titel: "Beispielvortrag über Beispiele",
  datum: "2026-10-19", von: "18:15", bis: "19:45", ort: "Hörsaal 9 (Beispielbau)", online: true,
  url: "https://uni-tuebingen.de/studium-generale/beispiel", anmeldung: { ab: "2026-10-12", bis: "2026-10-18T23:59" },
}, anders);
const angebotePruefe = (...e) => Z.angebotePruefen({ schema: 1, stand: "2026-10-17", angebote: e });

test("Angebote: gültiger Eintrag wird übernommen, unbekannte Felder ignoriert", () => {
  const r = angebotePruefe(angebot({ beschreibung: "wird nicht übernommen" }));
  assert.deepEqual(r.verworfen, []);
  assert.equal(r.stand, "2026-10-17");
  assert.deepEqual(r.angebote[0], {
    id: "2026-10-19-vortrag-beispiel", kategorie: "vortrag", reihe: "Studium Generale", titel: "Beispielvortrag über Beispiele",
    datum: "2026-10-19", von: "18:15", bis: "19:45", ort: "Hörsaal 9 (Beispielbau)", online: true,
    url: "https://uni-tuebingen.de/studium-generale/beispiel", anmeldung: { ab: "2026-10-12", bis: "2026-10-18T23:59" },
  });
  const knapp = angebotePruefe(angebot({ kategorie: "sport", von: undefined, bis: "", ort: "", online: "ja", anmeldung: { ab: "2026-10-19T17:00" },
    url: "https://hochschulsport.uni-tuebingen.de/kurse" })).angebote[0];
  assert.equal(knapp.von, "");
  assert.equal(knapp.online, false, "online nur bei true");
  assert.deepEqual(knapp.anmeldung, { ab: "2026-10-19T17:00", bis: "" });
  assert.equal(angebotePruefe(angebot({ anmeldung: null })).angebote[0].anmeldung, null);
  assert.equal(angebotePruefe(angebot({ anmeldung: {} })).angebote[0].anmeldung, null, "leere Anmeldung = keine");
});

test("Angebote: ungültige Einträge werden einzeln verworfen", () => {
  const schlecht = {
    "id ungültig": { id: "Gross" },
    "kategorie unbekannt": { kategorie: "party" },
    "kategorie gross": { kategorie: "Vortrag" },
    "reihe fehlt": { reihe: "" },
    "reihe mit strich": { reihe: "A | B" },
    "reihe zu lang": { reihe: "x".repeat(81) },
    "titel html": { titel: "<b>fett</b>" },
    "titel wikilink": { titel: "Siehe [[Notiz]]" },
    "titel zu lang": { titel: "x".repeat(121) },
    "datum ungültig": { datum: "2026-02-30" },
    "von kaputt": { von: "8:00" },
    "bis ohne von": { von: "", bis: "10:00" },
    "bis vor von": { von: "10:00", bis: "09:00" },
    "ort zu lang": { ort: "x".repeat(121) },
    "url fehlt": { url: "" },
    "url http": { url: "http://uni-tuebingen.de/x" },
    "url fremd": { url: "https://example.org/x" },
    "url fachschaft": { url: "https://www.ffwtuebingen.de/x" },
    "anmeldung kein objekt": { anmeldung: "ab Montag" },
    "anmeldung liste": { anmeldung: ["2026-10-12"] },
    "anmeldung zeit kaputt": { anmeldung: { ab: "2026-10-12 17:00" } },
    "anmeldung verkehrt": { anmeldung: { ab: "2026-10-18", bis: "2026-10-12" } },
  };
  let i = 0;
  for (const [fall, anders] of Object.entries(schlecht)) {
    const r = angebotePruefe(angebot(Object.assign({ id: anders.id || "fall-" + i++ }, anders)));
    assert.equal(r.angebote.length, 0, fall);
    assert.equal(r.verworfen.length, 1, fall);
  }
});

test("Angebote: doppelte id, Säubern, ganze Datei abgelehnt", () => {
  const r = angebotePruefe(angebot({ ort: "<i>Hörsaal 9</i> obsidian://open?x" }), angebot());
  assert.deepEqual(r.verworfen, [{ id: "2026-10-19-vortrag-beispiel", grund: "doppelte id" }]);
  assert.equal(r.angebote[0].ort, "Hörsaal 9");
  assert.equal(Z.angebotePruefen({ schema: 1, stand: "2026-10-17T06:00:00Z", angebote: [] }).stand, "2026-10-17");
  assert.ok(Z.angebotePruefen({ schema: 2, angebote: [] }).fehler);
  assert.ok(Z.angebotePruefen({ schema: 1 }).fehler);
  assert.ok(Z.angebotePruefen({ schema: 1, angebote: new Array(1001).fill(angebot()) }).fehler);
});

test("Manifest: angebote.json ist bekannt (Prüfsumme, Höchstgröße)", () => {
  const m = { schema: 1, erstellt: "2026-10-17T09:00:00Z", dateien: { "angebote.json": { sha256: "c".repeat(64), groesse: 900 } } };
  assert.deepEqual(Z.manifestPruefen(m).wert.dateien, { "angebote.json": { sha256: "c".repeat(64), groesse: 900 } });
  assert.ok(Z.manifestPruefen(Object.assign({}, m, { dateien: { "angebote.json": { sha256: "c".repeat(64), groesse: 600000 } } })).fehler);
});

// Abruf mit Testquelle: Angebote holt jedes Gerät selbst; Fehler → alter Stand und Warnung; aus dem Manifest entfernt → gelöscht
test("Abruf: angebote.json gerätelokal, Fehler halten nichts an, ohne Eintrag im Manifest wird der Stand gelöscht", async () => {
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
  L.ctx.angeboteAnzeige = { neu: () => { gezeichnet++; } };
  const ZZ = L.ctx.zentral;
  const datei = (name, daten, falsch) => {
    quelle[name] = JSON.stringify(daten);
    const b = Buffer.from(quelle[name], "utf8");
    return { sha256: falsch ? "0".repeat(64) : crypto.createHash("sha256").update(b).digest("hex"), groesse: b.length };
  };
  const manifest = (dateien, pause) => { quelle["manifest.json"] = JSON.stringify({ schema: 1, erstellt: "2026-10-17T09:00:00Z", dateien, pause: !!pause }); };
  assert.equal(ZZ.angebote(), null);
  manifest({ "angebote.json": datei("angebote.json", { schema: 1, stand: "2026-10-17", angebote: [angebot(), angebot({ id: "kaputt", kategorie: "party" })] }) });
  const b1 = await ZZ.abrufen({});
  assert.equal(b1.art, "anderes-geraet", "Angebote auch ohne Abrufer-Rolle");
  assert.equal(ZZ.angebote().angebote.length, 1);
  assert.equal(ZZ.angebote().stand, "2026-10-17");
  assert.deepEqual(b1.verworfen, [{ id: "angebot kaputt", grund: "kategorie nicht erlaubt" }]);
  assert.equal(gezeichnet, 1);
  // gleiche Prüfsumme: nicht neu zeichnen
  await ZZ.abrufen({});
  assert.equal(gezeichnet, 1);
  // falsche Prüfsumme und kaputte Gruppen: alter Stand bleibt, je eine Warnung
  manifest({
    "angebote.json": datei("angebote.json", { schema: 1, angebote: [] }, true),
    "gruppen.json": datei("gruppen.json", { schema: 2, gruppen: [] }),
  });
  const b3 = await ZZ.abrufen({});
  assert.equal(b3.fehler, "");
  assert.match(b3.warnung, /Gruppen: gruppen\.json: Format ungültig/);
  assert.match(b3.warnung, /Angebote: Prüfsumme von angebote\.json/);
  assert.equal(ZZ.angebote().angebote.length, 1);
  // Pause: nichts anfassen, auch wenn die Datei fehlt
  manifest({}, true);
  await ZZ.abrufen({});
  assert.equal(ZZ.angebote().angebote.length, 1, "pausiert: Stand bleibt");
  // aus dem Manifest entfernt: zurückgezogen → Stand gelöscht, Anzeige neu
  manifest({});
  await ZZ.abrufen({});
  assert.equal(ZZ.angebote(), null);
  assert.equal(speicher["eba-zentral-angebote"], undefined);
  assert.equal(gezeichnet, 2);
});

// Eine kaputte angebote.json hält Termine nicht an
test("Abruf: Fehler in angebote.json → Termine werden trotzdem übernommen", async () => {
  const crypto = require("node:crypto");
  const speicher = {};
  const quelle = {};
  const geschrieben = {};
  const L = laden("zentral", {
    frontmatter: { "System/Einstellungen.md": {} },
    kontext: { plugin: { testZentralAus: true, testQuelle: async (n) => quelle[n] }, modell: { daten: () => ({ module: [], fachsemester: 1 }) } },
  });
  const app = L.ctx.app;
  app.loadLocalStorage = (k) => (k in speicher ? JSON.parse(speicher[k]) : null);
  app.saveLocalStorage = (k, v) => { if (v == null) delete speicher[k]; else speicher[k] = JSON.stringify(v); };
  app.vault.create = async (p, t) => { geschrieben[p] = t; return { path: p }; };
  const ZZ = L.ctx.zentral;
  const datei = (name, text) => { quelle[name] = text; const b = Buffer.from(text, "utf8"); return { sha256: crypto.createHash("sha256").update(b).digest("hex"), groesse: b.length }; };
  const termine = datei("termine.json", JSON.stringify({ schema: 1, termine: [{ id: "frist-1", titel: "Frist", datum: "2026-11-02", kategorie: "Frist", status: "offiziell" }] }));
  quelle["manifest.json"] = JSON.stringify({ schema: 1, erstellt: "2026-10-17T09:00:00Z",
    dateien: { "termine.json": termine, "angebote.json": datei("angebote.json", "{ kaputt") } });
  const b = await ZZ.abrufen({});
  assert.equal(b.art, "ok");
  assert.match(b.warnung, /^Angebote: angebote\.json unlesbar/);
  assert.ok(Object.keys(geschrieben).some((p) => p.startsWith("Termine/2026-11-02 Frist")), "Termin-Notiz angelegt");
  assert.equal(ZZ.angebote(), null);
});

test("Ein Schreiber: dieses Gerät schreibt für alle, wenn es Abrufer ist, es noch keinen gibt oder der Abrufer seit 80 Min. still ist", () => {
  const jetzt = Date.parse("2026-10-17T20:00:00Z"), vor = (min) => new Date(jetzt - min * 60e3).toISOString();
  assert.equal(Z.abruferHierAus(null, "g-a", jetzt), true, "noch kein Abrufer");
  assert.equal(Z.abruferHierAus({ geraet: "g-a", zuletzt: vor(500) }, "g-a", jetzt), true, "dieses Gerät");
  assert.equal(Z.abruferHierAus({ geraet: "g-b", zuletzt: vor(10) }, "g-a", jetzt), false, "anderes Gerät ist aktiv");
  assert.equal(Z.abruferHierAus({ geraet: "g-b", zuletzt: vor(79) }, "g-a", jetzt), false);
  assert.equal(Z.abruferHierAus({ geraet: "g-b", zuletzt: vor(81) }, "g-a", jetzt), true, "Abrufer still: dieses Gerät springt ein");
  assert.equal(Z.abruferHierAus({ geraet: "g-b", zuletzt: "" }, "g-a", jetzt), true, "ohne Zeit gilt der Abrufer als still");
});

// ---------- Übergabe nach id: Notizen eines eigenen Uni-Abgleichs (abgleich_id, docs/daten-v1.md) – nur ausgedachte Daten ----------

// Tresor im Speicher für einen ganzen Abruf: Pfad → Datei, Frontmatter wie der metadataCache (stundenplan-attrappe.js)
function tresorAbruf(start, mehr) {
  const crypto = require("node:crypto");
  const { frontmatter } = require("./stundenplan-attrappe.js");
  const speicher = {}, quelle = {};
  // haken.holen(name): vor jeder geholten Datei (z. B. ein anderes Gerät übernimmt mitten im Abruf); hinweise: Texte der Notices
  const haken = {}, hinweise = [], geschrieben = [];
  const L = laden("zentral", {
    kontext: {
      plugin: { testZentralAus: true, testQuelle: async (n) => { if (haken.holen) haken.holen(n); return quelle[n]; } },
      modell: { daten: () => ({ module: [], fachsemester: 1 }) },
      obsidian: { Notice: class { constructor(t) { hinweise.push(String(t)); } } },
      ...mehr,
    },
  });
  const app = L.ctx.app;
  app.loadLocalStorage = (k) => (k in speicher ? JSON.parse(speicher[k]) : null);
  app.saveLocalStorage = (k, v) => { if (v == null) delete speicher[k]; else speicher[k] = JSON.stringify(v); };
  const dateien = new Map(), ordner = new Set(["Termine", "System", "System/Daten"]), papierkorb = [];
  const neueDatei = (p, text) => { const f = { path: p, basename: p.split("/").pop().replace(/\.md$/, ""), text }; dateien.set(p, f); return f; };
  for (const [p, t] of Object.entries(start || {})) neueDatei(p, t);
  app.vault.getAbstractFileByPath = (p) => dateien.get(p) || (ordner.has(p) ? { path: p } : null);
  app.vault.getMarkdownFiles = () => Array.from(dateien.values()).filter((f) => f.path.endsWith(".md"));
  app.vault.read = async (f) => f.text;
  app.vault.modify = async (f, t) => { geschrieben.push(f.path); f.text = t; };
  app.vault.create = async (p, t) => { if (dateien.has(p)) throw new Error("gibt es schon: " + p); geschrieben.push(p); return neueDatei(p, t); };
  app.vault.createFolder = async (p) => { ordner.add(p); };
  app.vault.trash = async (f) => { dateien.delete(f.path); papierkorb.push(f.path); };
  app.fileManager = { renameFile: async (f, ziel) => {
    if (dateien.has(ziel)) throw new Error("gibt es schon: " + ziel);
    dateien.delete(f.path); f.path = ziel; f.basename = ziel.split("/").pop().replace(/\.md$/, ""); dateien.set(ziel, f);
  },
  // nur „erledigt“ (Doppel zusammenführen)
  processFrontMatter: async (f, fn) => { const fm = frontmatter(f.text); fn(fm); geschrieben.push(f.path); f.text = f.text.replace(/^erledigt: .*$/m, "erledigt: " + fm.erledigt); } };
  app.metadataCache.getFileCache = (f) => {
    const x = f && dateien.get(f.path);
    const fm = x && x.path.endsWith(".md") ? frontmatter(x.text) : null;
    return fm ? { frontmatter: fm } : null;
  };
  const daten = (termine) => {
    quelle["termine.json"] = JSON.stringify({ schema: 1, termine });
    const b = Buffer.from(quelle["termine.json"], "utf8");
    quelle["manifest.json"] = JSON.stringify({ schema: 1, erstellt: "2026-10-18T09:00:00Z",
      dateien: { "termine.json": { sha256: crypto.createHash("sha256").update(b).digest("hex"), groesse: b.length } } });
  };
  return {
    Z: L.ctx.zentral, daten, papierkorb, haken, hinweise, geschrieben,
    text: (p) => (dateien.get(p) ? dateien.get(p).text : null),
    fm: (p) => frontmatter(dateien.get(p).text),
    pfade: () => Array.from(dateien.keys()).filter((p) => p.startsWith("Termine/")).sort(),
    schreiben: (p, t) => { if (dateien.has(p)) dateien.get(p).text = t; else neueDatei(p, t); },
    loeschen: (p) => { dateien.delete(p); },
    angewendet: () => JSON.parse(dateien.get("System/Daten/abruf.json").text).angewendet,
  };
}

// So sieht eine Notiz des eigenen Uni-Abgleichs aus (Frontmatter wie die zentralen Termine, abgleich_id statt herkunft)
const abgleichNotiz = (id, datum, titel, o = {}) => [
  "---", "typ: termin", `titel: "${titel}"`, `datum: ${datum}`, "bis:", "kategorie: Frist", "status: offiziell", "ort: \"\"", "modul:",
  `code: "${o.code || ""}"`, `erledigt: ${o.erledigt ? "true" : "false"}`, "quelle: \"Rundmail vom 01.10.2026\"", `abgleich_id: ${id}`,
  "uebersicht: \"[[Prüfungen]]\"", "cssclasses:", "  - eba-s-termin", "tags:", "  - termin",
].concat(o.eigen ? [o.eigen] : []).concat(["---", "", `# ${titel}`, "", "Text aus dem eigenen Abgleich.", ""])
  .concat(o.meine ? ["## Meine Notizen", "", o.meine, ""] : []).join("\n");
const zentraleNotiz = (id, datum, titel) => Z.notizText("", termin({ id, datum, titel, kategorie: "Veranstaltung" }), {});

test("Doppel einer id (Konfliktkopie, Sync-Verzug): zusammengeführt wie termine-sync.py, erledigt gewinnt, deine Zeilen bleiben", async () => {
  const id = "2026-11-03-bewerbungsfrist-stipendium";
  const T = tresorAbruf();
  T.daten([termin({ id, titel: "Bewerbungsfrist Stipendium", datum: "2026-11-03", kategorie: "Frist" })]);
  await T.Z.abrufen({});
  const pfad = "Termine/2026-11-03 Bewerbungsfrist Stipendium.md", kopie = "Termine/2026-11-03 Bewerbungsfrist Stipendium 2.md";
  assert.match(T.text(pfad), /^erledigt: false$/m);
  T.schreiben(kopie, T.text(pfad).replace("erledigt: false", "erledigt: true").replace("## Meine Notizen\n", "## Meine Notizen\n\nUnterlagen bis Freitag.\n"));
  const b = await T.Z.abrufen({ manuell: true });
  assert.equal(b.doppel, 1);
  assert.deepEqual(T.papierkorb, [kopie]);
  assert.deepEqual(T.pfade(), [pfad]);
  assert.equal(T.fm(pfad).erledigt, true, "erledigt gewinnt");
  assert.match(T.text(pfad), /## Meine Notizen\n\nUnterlagen bis Freitag\.\n/);
  // Quellen-Vertrag: gemeinsame Form; ein Fehler bleibt mit Satz und Zeit, geprueft ist der letzte Erfolg
  const ok = T.Z.status();
  assert.deepEqual([ok.zustand, ok.fehler, ok.warnungen], ["an", "", []]);
  assert.ok(ok.geprueft);
  T.haken.holen = () => { throw new Error("offline"); };
  await T.Z.abrufen({});
  const s = T.Z.status();
  assert.deepEqual([s.zustand, s.fehler, s.geprueft], ["fehler", "Keine Verbindung zu den zentralen Daten.", ok.geprueft]);
  assert.ok(s.fehlerZeit);
});

test("Übergabe nach id: eine Notiz des eigenen Abgleichs wird übernommen, nicht verdoppelt und nicht als gelöscht gewertet", async () => {
  const id = "2026-11-03-bewerbungsfrist-stipendium";
  const T = tresorAbruf();
  T.daten([termin({ id, titel: "Bewerbungsfrist Stipendium", datum: "2026-11-03", kategorie: "Frist" })]);
  // 1. normal angelegt (wie bei allen Nutzer:innen)
  const b1 = await T.Z.abrufen({});
  const pfad = "Termine/2026-11-03 Bewerbungsfrist Stipendium.md";
  assert.deepEqual(b1.angelegt, [pfad]);
  assert.ok(T.angewendet()[id], "angewendet gemerkt");
  // 2. Der eigene Abgleich übernimmt die Notiz (zurückgehalten): gleiche Datei, abgleich_id, Häkchen und eigene Zeilen
  T.schreiben(pfad, abgleichNotiz(id, "2026-11-03", "Bewerbungsfrist Stipendium", { erledigt: true, eigen: "gruppe: 3", meine: "Eigene Zeile." }));
  // 3. Wieder veröffentlicht, Daten unverändert: bis 0.4.3 „von dir gelöscht“ (nichts angelegt, Notiz ohne Pflege)
  const b3 = await T.Z.abrufen({ manuell: true });
  assert.deepEqual(b3.ausgeblendet, [], "nicht als gelöscht gewertet");
  assert.deepEqual(b3.angelegt, [], "keine zweite Notiz");
  assert.deepEqual(b3.uebernommen, [pfad]);
  assert.deepEqual(T.pfade(), [pfad]);
  const fm = T.fm(pfad);
  assert.equal(fm.herkunft, "zentral");
  assert.equal(fm.zentral_id, id);
  assert.equal(fm.abgleich_id, undefined, "abgleich_id fällt weg: ein Schreiber");
  assert.equal(fm.erledigt, true, "Häkchen bleibt");
  assert.equal(fm.gruppe, 3, "eigenes Feld bleibt");
  assert.match(T.text(pfad), /## Meine Notizen\n\nEigene Zeile\.\n/);
  assert.doesNotMatch(T.text(pfad), /Text aus dem eigenen Abgleich/, "verwalteter Teil kommt aus den Daten");
  // 4. ab jetzt eine normale zentrale Notiz: nichts mehr zu übernehmen
  const b4 = await T.Z.abrufen({ manuell: true });
  assert.deepEqual(b4.uebernommen, []);
  assert.deepEqual(b4.aktualisiert, []);
});

test("Übergabe nach id: ohne eigenen Abgleich bleibt eine gelöschte Notiz gelöscht", async () => {
  const id = "2026-11-05-infoabend";
  const T = tresorAbruf();
  T.daten([termin({ id, titel: "Infoabend", datum: "2026-11-05", kategorie: "Veranstaltung" })]);
  await T.Z.abrufen({});
  T.loeschen("Termine/2026-11-05 Infoabend.md");
  const b = await T.Z.abrufen({ manuell: true });
  assert.deepEqual(b.ausgeblendet, [id]);
  assert.deepEqual(b.uebernommen, []);
  assert.deepEqual(T.pfade(), []);
});

test("Übergabe nach id: neues Datum benennt um; gefilterte, nicht veröffentlichte und doppelte Notizen bleiben unberührt", async () => {
  const a = abgleichNotiz("2026-11-02-tutorien-starten", "2026-11-02", "Tutorien starten", { meine: "Gruppe gewählt." });
  const gefiltert = abgleichNotiz("2026-11-04-tutorium-x100", "2026-11-04", "Tutorium X100", { code: "X100" });
  const privat = abgleichNotiz("2026-11-06-eigene-frist", "2026-11-06", "Eigene Frist");
  const doppel = abgleichNotiz("2026-11-07-vortrag", "2026-11-07", "Vortrag", { erledigt: true });
  const T = tresorAbruf({
    "Termine/2026-11-02 Tutorien starten.md": a, "Termine/2026-11-04 Tutorium X100.md": gefiltert,
    "Termine/2026-11-06 Eigene Frist.md": privat, "Termine/2026-11-07 Vortrag.md": zentraleNotiz("2026-11-07-vortrag", "2026-11-07", "Vortrag"),
    "Termine/2026-11-07 Vortrag (alt).md": doppel,
  });
  T.daten([
    termin({ id: "2026-11-02-tutorien-starten", titel: "Tutorien starten", datum: "2026-11-03", kategorie: "Lehre" }),
    termin({ id: "2026-11-04-tutorium-x100", titel: "Tutorium X100", datum: "2026-11-04", kategorie: "Lehre", code: "X100" }),
    termin({ id: "2026-11-07-vortrag", titel: "Vortrag", datum: "2026-11-07", kategorie: "Veranstaltung" }),
  ]);
  const b = await T.Z.abrufen({});
  assert.deepEqual(b.uebernommen, ["Termine/2026-11-02 Tutorien starten.md"]);
  assert.deepEqual(b.umbenannt, ["Termine/2026-11-02 Tutorien starten.md → Termine/2026-11-03 Tutorien starten.md"]);
  assert.match(T.text("Termine/2026-11-03 Tutorien starten.md"), /## Meine Notizen\n\nGruppe gewählt\.\n/);
  assert.equal(T.text("Termine/2026-11-04 Tutorium X100.md"), gefiltert, "Modul nicht im Plan: nicht übernommen, nicht im Papierkorb");
  assert.equal(T.text("Termine/2026-11-06 Eigene Frist.md"), privat, "nicht in den Daten: nicht angefasst");
  assert.equal(T.text("Termine/2026-11-07 Vortrag (alt).md"), doppel, "schon eine zentrale Notiz: die andere bleibt, wie sie ist");
  assert.equal(T.fm("Termine/2026-11-07 Vortrag.md").herkunft, "zentral");
  assert.deepEqual(T.papierkorb, []);
  assert.equal(T.pfade().length, 5, "keine neue Notiz");
});

// ---------- Abrufer-Wechsel: „Jetzt aktualisieren“ übernimmt auf jedem Gerät (wie „Hier laden“ bei ILIAS) ----------

const ABRUF = "System/Daten/abruf.json";
const MIN = 60e3;
// abruf.json eines anderen Geräts, das vor min Minuten zuletzt abgerufen hat
const fremdeSperre = (T, min, angewendet) => T.schreiben(ABRUF, JSON.stringify({ geraet: "g-anderes", seit: new Date(Date.now() - 180 * MIN).toISOString(),
  zuletzt: new Date(Date.now() - min * MIN).toISOString(), angewendet: angewendet || {} }, null, 1) + "\n");
const sperreVon = (T) => JSON.parse(T.text(ABRUF));
const fristA = termin({ id: "2026-11-02-frist-a", titel: "Frist A", datum: "2026-11-02", kategorie: "Frist" });
const fristB = termin({ id: "2026-11-03-frist-b", titel: "Frist B", datum: "2026-11-03", kategorie: "Frist" });
const fristC = termin({ id: "2026-11-04-frist-c", titel: "Frist C", datum: "2026-11-04", kategorie: "Frist" });
const GERADE_ANDERS = "Ein anderes Gerät hat die zentralen Daten gerade aktualisiert, deine Notizen kommen über deinen Sync.";

test("Abrufer-Wechsel: „Jetzt aktualisieren“ übernimmt nach 54 Min., schreibt abruf.json vor den Notizen, „angewendet“ bleibt", async () => {
  const T = tresorAbruf();
  T.daten([fristA, fristB]);
  await T.Z.abrufen({});
  const angewendet = T.angewendet();
  T.loeschen("Termine/2026-11-03 Frist B.md"); // von dir gelöscht
  fremdeSperre(T, 54, angewendet); // das andere Gerät war zuletzt Abrufer
  T.daten([fristA, fristB, fristC]);
  T.geschrieben.length = 0;
  // automatisch wie bisher: das andere Gerät bleibt Abrufer
  assert.equal((await T.Z.abrufen({})).art, "anderes-geraet");
  assert.deepEqual(T.geschrieben, []);
  // von Hand: dieses Gerät übernimmt
  const b = await T.Z.abrufen({ manuell: true });
  assert.equal(b.art, "ok");
  assert.equal(T.geschrieben[0], ABRUF, "abruf.json mit diesem Gerät vor der ersten Notiz");
  assert.deepEqual(b.angelegt, ["Termine/2026-11-04 Frist C.md"]);
  assert.deepEqual(b.ausgeblendet, [fristB.id], "gelöschte Notiz kommt nicht zurück: „angewendet“ übernommen");
  const s = sperreVon(T);
  assert.equal(s.geraet, T.Z.geraetId());
  assert.ok(Date.now() - Date.parse(s.zuletzt) < MIN);
  assert.deepEqual(Object.keys(s.angewendet).sort(), [fristA.id, fristB.id, fristC.id]);
  assert.deepEqual(T.hinweise, ["Zentrale Daten aktualisiert, 1 Eintrag geändert."]);
  assert.equal(T.Z.stand().abrufer, true);
});

test("Abrufer-Wechsel: unter 2 Min. nach dem anderen Gerät übernimmt auch „Jetzt aktualisieren“ nicht", async () => {
  const T = tresorAbruf();
  T.daten([fristA]);
  fremdeSperre(T, 1);
  const vorher = T.text(ABRUF);
  assert.equal((await T.Z.abrufen({ manuell: true })).art, "anderes-geraet");
  assert.deepEqual(T.geschrieben, []);
  assert.equal(T.text(ABRUF), vorher);
  assert.deepEqual(T.hinweise, [GERADE_ANDERS]);
  fremdeSperre(T, 3);
  assert.equal((await T.Z.abrufen({ manuell: true })).art, "ok");
  assert.equal(sperreVon(T).geraet, T.Z.geraetId());
});

test("Abrufer-Wechsel: automatisch wie bisher erst nach 80 Min. Stille, ohne Hinweis", async () => {
  const T = tresorAbruf();
  T.daten([fristA]);
  fremdeSperre(T, 79);
  assert.equal((await T.Z.abrufen({})).art, "anderes-geraet");
  assert.deepEqual(T.geschrieben, []);
  fremdeSperre(T, 81);
  assert.equal((await T.Z.abrufen({})).art, "ok");
  assert.equal(sperreVon(T).geraet, T.Z.geraetId());
  assert.deepEqual(T.hinweise, []);
});

test("Abrufer-Wechsel: wer schreiben will, liest abruf.json direkt davor neu und weicht einem Gerät, das inzwischen übernommen hat", async () => {
  // bisheriger Abrufer, automatischer Lauf: ein anderes Gerät übernimmt, während dieses die Termine holt
  const T = tresorAbruf();
  T.daten([fristA]);
  await T.Z.abrufen({});
  T.daten([fristA, fristC]);
  T.haken.holen = (n) => { if (n === "termine.json") fremdeSperre(T, 0, T.angewendet()); };
  T.geschrieben.length = 0;
  assert.equal((await T.Z.abrufen({})).art, "anderes-geraet");
  assert.deepEqual(T.geschrieben, [], "keine Notiz, abruf.json bleibt beim anderen Gerät");
  assert.equal(sperreVon(T).geraet, "g-anderes");
  assert.equal(T.Z.stand().abrufer, false);
  // von Hand: Ruft das andere Gerät ab, während dieses übernehmen will, weicht dieses
  const U = tresorAbruf();
  U.daten([fristA]);
  fremdeSperre(U, 30);
  U.haken.holen = (n) => { if (n === "termine.json") fremdeSperre(U, 0); };
  assert.equal((await U.Z.abrufen({ manuell: true })).art, "anderes-geraet");
  assert.deepEqual(U.geschrieben, []);
  assert.deepEqual(U.hinweise, [GERADE_ANDERS]);
});

test("Dateinamen nach einer Regel (eba.dateiTitel): Emojis weg, auch in alten Namen ohne neues Datum; kürzere Namen bleiben", async () => {
  const EBA = require("../Studium Autopilot/System/Skripte/eba.js");
  const ZE = laden("zentral", { kontext: { user: { eba: EBA } } }).ctx.zentral;
  assert.equal(EBA.dateiTitel("Lerngruppe 👨‍👩‍👧 ☕️ heute 🇩🇪 1️⃣"), "Lerngruppe heute 1");
  assert.equal(EBA.dateiTitel("UB-Kurs: Zotero. "), "UB-Kurs – Zotero", "gleiche Regel wie bisher für Termine");
  assert.equal(ZE.dateiName("2026-11-08", "Kneipentour 😍 und Semester Opening"), "2026-11-08 Kneipentour und Semester Opening");
  assert.equal(ZE.neuerName("2026-11-08 Kneipentour 😍 und Semester Opening", "2026-11-08", "Kneipentour und Semester Opening"), "2026-11-08 Kneipentour und Semester Opening");
  assert.equal(ZE.neuerName("2026-11-08 Dies Universitatis", "2026-11-08", "Dies Universitatis – Semestereröffnung der Uni"), "", "bewusst kürzerer Name bleibt");
  assert.equal(ZE.neuerName("2026-11-08 Vortrag 2", "2026-11-08", "Vortrag"), "", "Zähler bleibt");
  assert.equal(ZE.neuerName("2026-11-08 Vortrag", "2026-11-09", "Vortrag"), "2026-11-09 Vortrag", "neues Datum: nach Datum und Titel");

  const id = "2026-11-08-kneipentour-und-semester-opening";
  const alt = "Termine/2026-11-08 Kneipentour 😍 und Semester Opening.md";
  const T = tresorAbruf({ [alt]: zentraleNotiz(id, "2026-11-08", "Kneipentour und Semester Opening") }, { user: { eba: EBA } });
  T.daten([termin({ id, titel: "Kneipentour und Semester Opening", datum: "2026-11-08", kategorie: "Veranstaltung" })]);
  const b = await T.Z.abrufen({});
  assert.deepEqual(b.umbenannt, [alt + " → Termine/2026-11-08 Kneipentour und Semester Opening.md"]);
  assert.deepEqual(T.pfade(), ["Termine/2026-11-08 Kneipentour und Semester Opening.md"]);
  const b2 = await T.Z.abrufen({ manuell: true });
  assert.deepEqual(b2.umbenannt, [], "danach kein Umbenennen mehr");
});

test("Abruf frisch vom Server: Adresse je Minute und no-cache, 304 noch einmal mit eigenem Zeitstempel", async () => {
  // GitHub Pages schickt max-age=600: Ohne eigene Adresse kam das Manifest bis zu 10 Min. alt aus dem Zwischenspeicher
  assert.equal(Z.frischUrl("https://x.example/v1/manifest.json", 3 * 60e3 + 59e3), "https://x.example/v1/manifest.json?t=3");
  assert.equal(Z.frischUrl("https://x.example/a.json?v=1", 60e3), "https://x.example/a.json?v=1&t=1");
  assert.deepEqual(Object.assign({}, Z.FRISCH_KOPF), { "Cache-Control": "no-cache" });
  const anfragen = [];
  const manifest = JSON.stringify({ schema: 1, erstellt: "2026-10-19T09:41:00Z", dateien: {} });
  const antwort = (status) => ({ status, arrayBuffer: new TextEncoder().encode(status === 200 ? manifest : "").buffer });
  let erste = 200;
  const ZN = laden("zentral", { kontext: { obsidian: { requestUrl: async (p) => { anfragen.push(p); return antwort(anfragen.length === 1 ? erste : 200); } } } }).ctx.zentral;
  const vorher = Math.floor(Date.now() / 60e3);
  await ZN.manifestHolen();
  const nachher = Math.floor(Date.now() / 60e3);
  assert.equal(anfragen.length, 1);
  const t = Number(anfragen[0].url.match(/^https:\/\/studium-autopilot\.github\.io\/ecoba-daten\/v1\/manifest\.json\?t=(\d+)$/)[1]);
  assert.ok(t >= vorher && t <= nachher, "Minute des Abrufs");
  assert.deepEqual(anfragen[0].headers, { "Cache-Control": "no-cache" });
  assert.equal(anfragen[0].throw, false);
  // 304 ohne Inhalt: einmal mit Zeitstempel in ms an der Adresse ohne Minute
  anfragen.length = 0; erste = 304;
  await ZN.manifestHolen();
  assert.equal(anfragen.length, 2);
  assert.match(anfragen[1].url, /\/manifest\.json\?t=\d{13}$/);
});
