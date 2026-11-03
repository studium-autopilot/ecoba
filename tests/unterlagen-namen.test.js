// Namen der Unterlagen aus den zentralen Daten (unterlagen.json, seit 03.11.2026): Prüfung und Abruf in zentral.js
// (unterlagenPruefen, unterlageName) und ihre Nutzung in ilias.js: neue Dateien bekommen den zentralen Namen, schon geladene mit
// dem Namen von Studium Autopilot werden umbenannt (Datei, Notiz, Index), von dir geänderte nie. Nur ausgedachte Dateien.
// Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { laden } = require("./laden.js");
const A = require("./ilias-attrappen.js");
const { I, GEHEIM, B, aufbau, datei, standardIlias } = A;

const sha = (text) => crypto.createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
const fm = (text, k) => { const m = String(text).match(new RegExp("^" + k + ": (.*)$", "m")); return m ? m[1] : undefined; };
const B110 = "Unterlagen/B110 Einführung in die Betriebswirtschaftslehre";
const echteUnterlagen = () => {
  const eba = laden("eba").ergebnis;
  const obs = { TFile: class {}, TFolder: class {}, Platform: { isMobile: false }, Notice: class {}, loadPdfJs: async () => { throw new Error("kein pdf.js im Test"); } };
  return laden("unterlagen", { kontext: { user: { eba: () => eba }, obsidian: obs } }).ergebnis;
};

test("unterlagen.json prüfen: gültige Einträge bleiben, ungültige einzeln verworfen, eine Prüfsumme nur einmal", () => {
  const { unterlagenPruefen } = laden("zentral").ctx.zentral;
  const gut = { sha256: sha("eins"), code: "X100", art: "Tutorium", nummer: 3, titel: "Kontenabschluss und Erfolgskonten" };
  const R = unterlagenPruefen({ schema: 1, stand: "2026-11-03T08:00:00Z", dateien: [
    gut,
    Object.assign({}, gut, { titel: "doppelt" }),
    { sha256: sha("zwei"), code: "X100", art: "Folien", titel: "Ohne Nummer" },
    { sha256: "abc", code: "X100", art: "Folien", titel: "x" },
    { sha256: sha("drei"), code: "x100", art: "Folien", titel: "Kleiner Code" },
    { sha256: sha("vier"), code: "X100", art: "Mitschrift", titel: "Eigenes" },
    { sha256: sha("fünf"), code: "X100", art: "Übung", nummer: 100, titel: "Zu groß" },
    { sha256: sha("sechs"), code: "X100", art: "Übung", titel: "[[Link]]" },
    { sha256: sha("sieben"), code: "X100", art: "Übung", titel: "" },
  ] });
  assert.equal(R.stand, "2026-11-03");
  assert.deepEqual(R.dateien, [gut, { sha256: sha("zwei"), code: "X100", art: "Folien", nummer: null, titel: "Ohne Nummer" }]);
  assert.deepEqual(R.verworfen.map((v) => v.grund), ["doppelt", "sha256 ungültig", "code ungültig", "art ungültig", "nummer ungültig", "titel unzulässig", "titel fehlt"]);
  assert.match(unterlagenPruefen({ schema: 2, dateien: [] }).fehler, /Format/);
});

test("Abruf: unterlagen.json holt jedes Gerät selbst, unterlageName findet den Namen über die Prüfsumme; zurückgezogen → weg", async () => {
  const speicher = {}, quelle = {};
  const L = laden("zentral", {
    frontmatter: { "System/Einstellungen.md": {} },
    kontext: { plugin: { testZentralAus: true, testQuelle: async (n) => quelle[n] }, modell: { daten: () => ({ module: [], fachsemester: 1 }) } },
  });
  const app = L.ctx.app;
  app.loadLocalStorage = (k) => (k in speicher ? JSON.parse(speicher[k]) : null);
  app.saveLocalStorage = (k, v) => { if (v == null) delete speicher[k]; else speicher[k] = JSON.stringify(v); };
  app.vault.create = async (p) => ({ path: p });
  const angabe = (name, text) => { quelle[name] = text; const b = Buffer.from(text, "utf8"); return { sha256: crypto.createHash("sha256").update(b).digest("hex"), groesse: b.length }; };
  const termine = angabe("termine.json", JSON.stringify({ schema: 1, termine: [] }));
  const namen = angabe("unterlagen.json", JSON.stringify({ schema: 1, dateien: [
    { sha256: sha("blatt"), code: "X100", art: "Tutorium", nummer: 3, titel: "Kontenabschluss und Erfolgskonten" },
    { sha256: sha("kaputt"), code: "X100", art: "Tutorium", titel: "" },
  ] }));
  quelle["manifest.json"] = JSON.stringify({ schema: 1, erstellt: "2026-11-03T08:00:00Z", dateien: { "termine.json": termine, "unterlagen.json": namen } });
  const ZZ = L.ctx.zentral;
  const b = await ZZ.abrufen({});
  assert.equal(b.art, "ok");
  assert.deepEqual(b.verworfen, [{ id: "unterlage " + sha("kaputt").slice(0, 12), grund: "titel fehlt" }]);
  assert.deepEqual(ZZ.unterlageName(sha("blatt")), { code: "X100", art: "Tutorium", nr: 3, titel: "Kontenabschluss und Erfolgskonten" });
  assert.equal(ZZ.unterlageName(sha("anders")), null);
  quelle["manifest.json"] = JSON.stringify({ schema: 1, erstellt: "2026-11-03T09:00:00Z", dateien: { "termine.json": termine } });
  await ZZ.abrufen({ manuell: true });
  assert.equal(ZZ.unterlageName(sha("blatt")), null, "zurückgezogen");
});

// ILIAS mit einem Tutoriumsblatt, dessen Dateiname nichts sagt (wie „JA_Tutorium_3_WiSe26_27.pdf“)
const mitBlatt = () => {
  const def = standardIlias();
  def.seiten[B + "kurs/100"].push(datei("1801", "Tutorium_3_WiSe26_27", "pdf", "2026-11-02T08:00"));
  def.dateien["1801"] = "%PDF Tutorium drei";
  return def;
};
const ZENTRAL = { [sha("%PDF Tutorium drei")]: { code: "B110", art: "Tutorium", nr: 3, titel: "Kontenabschluss und Erfolgskonten" } };
const verbinden = async (x) => { const r = await x.m.zugangSpeichern("zxabc01", () => GEHEIM); assert.equal(r.ok, true, r.fehler); };
const ZIEL = B110 + "/Tutorium/B110 Tutorium 03 Kontenabschluss und Erfolgskonten";

test("Neue Datei: Name, Art und Nummer aus den zentralen Daten statt aus dem Dateinamen", async () => {
  const x = aufbau({ ilias: mitBlatt() });
  x.abh.einordner = () => I.einordnerAus(echteUnterlagen());
  x.abh.namen = (s) => ZENTRAL[s] || null;
  await verbinden(x);
  await x.m.jetztHolen({});
  assert.equal(x.t.index().dateien["1801"].pfad, ZIEL + ".pdf");
  const n = x.t.text(ZIEL + ".md");
  assert.equal(fm(n, "art"), '"Tutorium"');
  assert.equal(fm(n, "nummer"), "3");
  assert.equal(fm(n, "titel"), '"Kontenabschluss und Erfolgskonten"');
});

test("Schon geladen mit dem Namen aus ILIAS: Datei und Notiz bekommen den zentralen Namen; von dir geändert bleibt; danach nichts mehr", async () => {
  const def = mitBlatt();
  def.seiten[B + "kurs/100"].push(datei("1802", "Tutorium_4_WiSe26_27", "pdf", "2026-11-02T08:00"));
  def.dateien["1802"] = "%PDF Tutorium vier";
  const x = aufbau({ ilias: def });
  x.abh.einordner = () => I.einordnerAus(echteUnterlagen());
  x.t.io.umbenennen = async (alt, neu) => x.t.umbenennen(alt, neu);
  await verbinden(x);
  await x.m.jetztHolen({});
  const p1 = x.t.index().dateien["1801"].pfad, p2 = x.t.index().dateien["1802"].pfad;
  assert.equal(p1, B110 + "/Tutorium/B110 Tutorium 03 WS 2026-27.pdf", "ohne zentrale Daten: Name aus ILIAS");
  // die zweite Notiz hast du selbst betitelt
  const n2 = p2.replace(/\.pdf$/, ".md");
  x.t.setzen(n2, x.t.text(n2).replace(/^titel: .*$/m, 'titel: "Mein Titel"'));
  x.abh.namen = (s) => Object.assign({ [sha("%PDF Tutorium vier")]: { code: "B110", art: "Tutorium", nr: 4, titel: "Abschreibungen" } }, ZENTRAL)[s] || null;
  x.u.vor(4 * 3600e3); x.il.leeren();
  const b = await x.m.jetztHolen({});
  assert.equal(b.namen, 1);
  assert.equal(x.il.anzahl("laden"), 0, "nichts neu geladen");
  assert.equal(x.t.index().dateien["1801"].pfad, ZIEL + ".pdf");
  assert.equal(x.t.text(p1), null, "alte Datei weg");
  const n = x.t.text(ZIEL + ".md");
  assert.equal(fm(n, "titel"), '"Kontenabschluss und Erfolgskonten"');
  assert.equal(fm(n, "nummer"), "3");
  assert.equal(fm(n, "datei"), '"[[B110 Tutorium 03 Kontenabschluss und Erfolgskonten.pdf]]"');
  assert.match(n, /^# B110 · Tutorium 03 · Kontenabschluss und Erfolgskonten$/m);
  assert.match(n, /!\[\[B110 Tutorium 03 Kontenabschluss und Erfolgskonten\.pdf#height=560\]\]/);
  assert.equal(x.t.index().dateien["1802"].pfad, p2, "dein Titel bleibt, die Datei auch");
  assert.equal(fm(x.t.text(n2), "titel"), '"Mein Titel"');
  x.t.schreibvorgaenge.length = 0;
  x.u.vor(4 * 3600e3);
  const b2 = await x.m.jetztHolen({});
  assert.equal(b2.namen, 0);
  assert.deepEqual(x.t.schreibvorgaenge.filter((p) => /\.md$/.test(p)), []);
});
