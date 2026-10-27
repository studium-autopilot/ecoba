// Kalender (kalender.js, art, frisch): Farbe des Punkts je Art nach der Regel des Fachmodells (ctx.modell.terminArt). Zwischentests
// (Titel) sind keine Prüfung und bekommen eine eigene Art. Die Auswahl von Monat und Tag verfällt am nächsten Tag und nach 30 Min.
// Die Legende (legendeVon) hat je Farbe einen Eintrag, nur für Arten, die im Monat vorkommen. Im Raster (gewicht) Pflicht vor
// Freiwilligem, dann die Angebote der Uni, Erledigtes zuletzt. Unter dem Raster (zeichnen) stehen die Termine des gewählten
// Tags, ohne Tipp die von heute.
// Je Tag drei Terminzeilen (spuren), bei mehr Terminen zwei und „+n weitere“; das CSS hat so viele Zeilen wie SPUREN.
// Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { laden } = require("./laden.js");

const modell = laden("modell", { heute: "2026-10-17" }).ctx.modell;
const { art } = laden("kalender", { heute: "2026-10-17", kontext: { modell } }).ergebnis;

test("art: Prüfung rot, Zwischentest eigene Art, Rest wie bisher", () => {
  assert.equal(art("Prüfung", "Klausur X100 Beispiel"), "pruefung");
  assert.equal(art("Prüfung", "Zwischentest 1 X100 Beispiel"), "zwischentest");
  assert.equal(art("Prüfung", "2026-12-04 zwischentest 2 X100"), "zwischentest");
  assert.equal(art("Prüfung"), "pruefung");
  assert.equal(art("Frist", "Zwischentest anmelden"), "frist");
  assert.equal(art("Fachschaft"), "event");
  assert.equal(art("Lehre"), "uni");
});

test("frisch: die Auswahl gilt nur am selben Tag und 30 Minuten nach dem letzten Tipp, dann wieder heute", () => {
  const { frisch } = laden("kalender", { heute: "2026-10-17", kontext: { modell } }).ergebnis;
  const um = (s) => new Date(s);
  const z = { monat: new Date(2026, 10, 1), tag: new Date(2026, 10, 12), am: new Date(2026, 9, 17), zeit: um("2026-10-17T10:00:00").getTime() };
  assert.equal(frisch(z, um("2026-10-17T10:29:00")), true);
  assert.equal(frisch(z, um("2026-10-17T10:31:00")), false, "30 Minuten ohne Tipp");
  assert.equal(frisch(Object.assign({}, z, { zeit: um("2026-10-17T23:50:00").getTime() }), um("2026-10-18T00:05:00")), false, "neuer Tag");
  assert.equal(frisch({ monat: null, tag: null, am: null, zeit: 0 }, um("2026-10-17T10:00:00")), false, "noch nichts gewählt");
  assert.equal(frisch({ monat: z.monat, tag: z.tag }, um("2026-10-17T10:00:00")), false, "Stand vor dem Update (ohne am)");
});

// Ersatz für Obsidians Elemente (wie tests/uebungen.test.js)
const knoten = (tag, o = {}) => {
  const k = { tag, cls: String(o.cls || "").split(" ").filter(Boolean), attr: Object.assign({}, o.attr || {}), text: o.text || "", kinder: [], an: {}, style: {} };
  k.createEl = (t, p) => { const c = knoten(t, p); k.kinder.push(c); return c; };
  k.createDiv = (p) => k.createEl("div", p);
  k.createSpan = (p) => k.createEl("span", p);
  k.empty = () => { k.kinder = []; };
  k.setText = (t) => { k.text = t; };
  k.appendText = (t) => { k.kinder.push(knoten("#text", { text: t })); };
  k.addClass = (...c) => { for (const x of c) if (!k.cls.includes(x)) k.cls.push(x); };
  k.addEventListener = (e, f) => { k.an[e] = f; };
  k.alle = () => k.kinder.flatMap((c) => [c, ...c.alle()]);
  k.finde = (klasse) => k.alle().filter((c) => c.cls.includes(klasse));
  return k;
};

// Rückmeldung vom 27.10.2026: „die Detail Ansicht unten von heute soll ausgeklappt sein“ (vorher für heute erst nach einem Tipp)
test("zeichnen: unter dem Raster die Termine des gewählten Tags, ohne Tipp die von heute", () => {
  const termin = (datum, titel, kategorie) => ({ [`Termine/${datum} ${titel}.md`]: { typ: "termin", titel, datum, kategorie, status: "offiziell", erledigt: false } });
  const notizen = Object.assign(termin("2026-10-17", "Fachschaftssitzung", "Fachschaft"), termin("2026-10-19", "Klausur X100", "Prüfung"));
  const M = laden("modell", { heute: "2026-10-17", notizen }).ctx.modell;
  const { zeichnen } = laden("kalender", { heute: "2026-10-17", kontext: { modell: M } }).ergebnis;
  const el = knoten("div");
  zeichnen(el, {});
  const datum = () => el.finde("eba-kal-datum").map((k) => k.text);
  const links = () => el.finde("eba-kal-link").map((k) => k.text);
  assert.deepEqual(datum(), ["Samstag, 17. Oktober · heute"]);
  assert.deepEqual(links(), ["Fachschaftssitzung"]);
  // Ein Tipp auf einen anderen Tag wählt ihn und zeigt seine Termine
  const tag = (label) => el.finde("eba-kal-tag").find((k) => k.attr["aria-label"].startsWith(label));
  tag("Montag, 19. Oktober").an.click({ preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(datum(), ["Montag, 19. Oktober"]);
  assert.deepEqual(links(), ["Klausur X100"]);
  assert.ok(tag("Montag, 19. Oktober").cls.includes("is-gewaehlt"));
  tag("Sonntag, 18. Oktober").an.click({ preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(datum(), ["Sonntag, 18. Oktober · morgen"]);
  assert.deepEqual(el.finde("eba-kal-leer").map((k) => k.text), ["Keine Termine."]);
});

test("legendeVon: je Farbe ein Eintrag, Prüfung immer, Zwischentest bei der Uni, freiwillig nur wenn vorhanden", () => {
  const { legendeVon } = laden("kalender", { heute: "2026-10-17", kontext: { modell } }).ergebnis;
  assert.deepEqual(legendeVon([]), [["pruefung", "Prüfung"]]);
  assert.deepEqual(legendeVon([{ art: "uni" }, { art: "event", sq: true }, { art: "event" }]),
    [["pruefung", "Prüfung"], ["uni", "Uni"], ["event", "Veranstaltung"], ["is-freiwillig", "freiwillig"]]);
  assert.deepEqual(legendeVon([{ art: "zwischentest" }]), [["pruefung", "Prüfung"], ["uni", "Zwischentest"]]);
  assert.deepEqual(legendeVon([{ art: "uni" }, { art: "zwischentest" }, { art: "pruefung" }]),
    [["pruefung", "Prüfung"], ["uni", "Uni, Zwischentest"]]);
});

test("gewicht: Pflicht vor Freiwilligem, dann Angebote der Uni (rücken bei Platzmangel zuerst in „+n weitere“), Erledigtes zuletzt", () => {
  const { gewicht } = laden("kalender", { heute: "2026-10-17", kontext: { modell } }).ergebnis;
  const reihe = [{ art: "event", angebot: true }, { art: "uni", erledigt: true }, { art: "event", sq: true }, { art: "event" }, { art: "pruefung" }]
    .sort((x, y) => gewicht(x) - gewicht(y));
  assert.deepEqual(reihe.map((t) => (t.erledigt ? "erledigt" : t.angebot ? "angebot" : t.sq ? "freiwillig" : t.art)), ["pruefung", "event", "freiwillig", "angebot", "erledigt"]);
});

// Rückmeldung vom 27.10.2026: die Zellen eine Reihe weniger hoch (vorher vier Terminzeilen je Tag)
test("spuren: je Tag drei Terminzeilen, ein voller Tag zeigt zwei und „+n weitere“", () => {
  const { spuren, SPUREN } = laden("kalender", { heute: "2026-10-17", kontext: { modell } }).ergebnis;
  assert.equal(SPUREN, 3);
  const montag = new Date(2026, 9, 26);
  const t = (tag, titel, o = {}) => Object.assign({ von: new Date(2026, 9, tag), bis: null, art: "uni", titel, zeit: "", minuten: -1 }, o);
  const drei = spuren([t(29, "A"), t(29, "B"), t(29, "C")], montag);
  assert.deepEqual(drei.segs.map((g) => [g.t.titel, g.z]), [["A", 0], ["B", 1], ["C", 2]], "genau drei: alle als Chip");
  assert.deepEqual(drei.mehr, [0, 0, 0, 0, 0, 0, 0]);
  const vier = spuren([t(29, "A"), t(29, "B"), t(29, "C"), t(29, "D")], montag);
  assert.deepEqual(vier.segs.map((g) => g.t.titel), ["A", "B"], "vier: zwei Chips, die dritte Zeile für „+2“");
  assert.deepEqual(vier.mehr, [0, 0, 0, 2, 0, 0, 0]);
  // Ein Balken über die Woche belegt an jedem seiner Tage eine Zeile
  const balken = spuren([t(26, "Woche", { bis: new Date(2026, 9, 30) }), t(29, "A"), t(29, "B"), t(29, "C")], montag);
  assert.deepEqual(balken.segs.map((g) => [g.t.titel, g.z]), [["Woche", 0], ["A", 1]]);
  assert.deepEqual(balken.mehr, [0, 0, 0, 2, 0, 0, 0]);
  assert.ok([drei, vier, balken].every((s) => s.segs.every((g) => g.z < SPUREN)), "kein Chip unter der letzten Zeile");
});

test("CSS: je Woche Zeilen für die Tageszahl, SPUREN Terminzeilen und Luft, breit und schmal", () => {
  const { SPUREN } = laden("kalender", { heute: "2026-10-17", kontext: { modell } }).ergebnis;
  const css = fs.readFileSync(path.join(__dirname, "..", "Studium Autopilot", ".obsidian", "snippets", "eba-core.css"), "utf8");
  const zeilen = [...css.matchAll(/\.eba-kal-woche \{ grid-template-rows: \S+ repeat\((\d+), \S+\) \S+; \}/g)].map((m) => Number(m[1]));
  assert.deepEqual(zeilen, [SPUREN, SPUREN]);
});
