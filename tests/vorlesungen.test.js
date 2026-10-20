// Vorlesungsnotizen sichtbarer (seit 19.10.2026): ein Name überall („Vorlesung 1 · Mo 13.10. · Thema“, ctx.modell.vorlesung),
// eigener Abschnitt „Vorlesungen“ auf der Modulseite direkt unter dem Modulfeld (modul.js), „Nachzuarbeiten“ auf dem Dashboard
// (dashboard.js), Fenster „Neue Vorlesungsnotiz“ mit Thema (notizen.js). Nur ausgedachte Daten (Codes X100 …).
// Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { laden, json } = require("./laden.js");

const SEMESTER = json("semester.json");
const VAULT = path.join(__dirname, "..", "Studium Autopilot");
const MODUL = "Module/1 Grundstudium/X100 Beispielmodul.md";
const vl = (datum, nummer, fm = {}) => ({ [`Vorlesungen/X100/${datum} X100 VL ${String(nummer).padStart(2, "0")}.md`]:
  Object.assign({ typ: "vorlesung", code: "X100", datum, nummer, nachgearbeitet: false }, fm) });
const notizenMit = (...n) => Object.assign({ [MODUL]: { typ: "modul", code: "X100", titel: "Beispielmodul", status: "läuft" } }, ...n);
// Fachmodell mit Notizen; ueberschriften: Pfad → erste Überschrift (der Testersatz liefert sonst nur das Frontmatter)
const modell = (heute, notizen, ueberschriften = {}) => {
  const L = laden("modell", { heute, notizen, frontmatter: { "System/Daten/Semester.md": SEMESTER } });
  const mc = L.ctx.app.metadataCache, alt = mc.getFileCache;
  mc.getFileCache = (f) => { const c = alt(f); return c && ueberschriften[f.path] ? Object.assign({ headings: [{ heading: ueberschriften[f.path], level: 1 }] }, c) : c; };
  return L.ctx.modell;
};

test("Name einer Vorlesungsnotiz: Nummer, Datum mit Wochentag, Thema nur, wenn bekannt", () => {
  const M = modell("2026-10-19", {});
  assert.equal(M.vorlesungTitel({ nummer: 1, datum: "2026-10-13", thema: "Einführung", code: "X100" }), "Vorlesung 1 · Di 13.10. · Einführung");
  assert.equal(M.vorlesungTitel({ nummer: 3, datum: "2026-10-27", code: "X100" }), "Vorlesung 3 · Di 27.10.");
  assert.equal(M.vorlesungTitel({ datum: "2026-10-27", code: "X100" }), "Vorlesung · Di 27.10.", "ohne Nummer");
  assert.equal(M.vorlesungTitel({ datum: "2026-10-27", code: "" }), "Mitschrift · Di 27.10.", "ohne Modul: Mitschrift zu einem Termin");
  assert.equal(M.vorlesungTitel({ nummer: 2, datum: "2027-10-12", code: "X100" }), "Vorlesung 2 · Di 12.10.2027", "Jahr außerhalb des Studienjahrs");
  assert.equal(M.vorlesungNummer("", "2026-10-13 X100 VL 03"), 3, "Nummer aus dem Dateinamen");
  assert.equal(M.vorlesungNummer(4, "egal"), 4);
  assert.equal(M.vorlesungNummer("", "2026-10-13 Mitschrift Workshop"), null);
});

test("Thema: Feld, sonst erste Überschrift mit eigener Aussage, sonst Titel der Folien; nie erfunden", () => {
  const M = modell("2026-10-19", {});
  const t = (o) => M.vorlesungThema(Object.assign({ modulTitel: "Beispielmodul" }, o));
  assert.equal(t({ thema: "Lineare Regression", ueberschrift: "Etwas anderes" }), "Lineare Regression", "Feld geht vor");
  for (const generisch of ["X100 · VL 01", "Vorlesung 1 · Di 13.10.", "2026-10-13 X100 VL 01", "Mitschrift", "X100 · VL 03 – Beispielmodul", "Nacharbeit"]) {
    assert.equal(t({ ueberschrift: generisch }), "", `„${generisch}“ sagt nichts Eigenes`);
  }
  assert.equal(t({ ueberschrift: "Vorlesung 1 · Di 13.10. · Verteilungen" }), "Verteilungen");
  assert.equal(t({ ueberschrift: "X100 · VL 02 · Kapitel 2: Lagemaße" }), "Kapitel 2: Lagemaße");
  assert.equal(t({ ueberschrift: "So funktioniert ein Markt" }), "So funktioniert ein Markt", "„So“ ist hier kein Wochentag");
  assert.equal(t({ ueberschrift: "X100 · VL 01", folien: "Gegenstand und Zweck der Statistik WS 2026-27" }), "Gegenstand und Zweck der Statistik",
    "Folien, ohne Semester");
  assert.equal(t({ ueberschrift: "X100 · VL 01", folien: "X100 Folien 01 Einführung" }), "Einführung", "Name der PDF ohne Kürzel und Nummer");
  assert.equal(t({ ueberschrift: "X100 · VL 01", folien: "" }), "");
  assert.ok(t({ thema: "", ueberschrift: "A ".repeat(60) + "Ende" }).length <= 72, "lange Themen gekürzt");
});

test("Vorlesungen eines Moduls: neueste zuerst, Name mit Thema aus Feld, Überschrift oder Folien", () => {
  const notizen = notizenMit(vl("2026-10-13", 1, { nachgearbeitet: true }), vl("2026-10-20", 2, { thema: "Lagemaße" }), vl("2026-10-27", 3),
    { "Vorlesungen/Y200/2026-10-28 Y200 VL 01.md": { typ: "vorlesung", code: "Y200", datum: "2026-10-28", nummer: 1 } });
  const M = modell("2026-10-28", notizen, { "Vorlesungen/X100/2026-10-27 X100 VL 03.md": "Vorlesung 3 · Di 27.10. · Streuung" });
  const L = M.vorlesungen({ code: "X100" });
  assert.deepEqual(L.map((v) => v.titel), ["Vorlesung 3 · Di 27.10. · Streuung", "Vorlesung 2 · Di 20.10. · Lagemaße", "Vorlesung 1 · Di 13.10."]);
  assert.deepEqual(L.map((v) => v.nachgearbeitet), [false, false, true]);
  assert.equal(M.vorlesungen().length, 4, "ohne Code: alle Module");
  assert.equal(M.statusArt("nachgearbeitet"), "ok");
});

// Ersatz für Obsidians Elemente (wie tests/darstellung.test.js), dazu empty, setText, addClass, toggleClass
const knoten = (tag, o = {}) => {
  const k = { tag, cls: String(o.cls || "").split(" ").filter(Boolean), attr: Object.assign({}, o.attr || {}, o.href ? { href: o.href } : {}),
    text: o.text || "", kinder: [], an: {} };
  k.createEl = (t, p) => { const c = knoten(t, p); k.kinder.push(c); return c; };
  k.createDiv = (p) => k.createEl("div", p);
  k.createSpan = (p) => k.createEl("span", p);
  k.empty = () => { k.kinder = []; };
  k.setText = (t) => { k.text = t; };
  k.addClass = (c) => { if (!k.cls.includes(c)) k.cls.push(c); };
  k.toggleClass = (c, an) => { k.cls = k.cls.filter((x) => x !== c); if (an) k.cls.push(c); };
  k.setAttr = (n, v) => { k.attr[n] = String(v); };
  k.addEventListener = (e, f) => { k.an[e] = f; };
  k.alle = () => k.kinder.flatMap((c) => [c, ...c.alle()]);
  k.finde = (klasse) => k.alle().filter((c) => c.cls.includes(klasse));
  k.texte = () => [k.text].concat(k.kinder.flatMap((c) => c.texte())).filter(Boolean);
  return k;
};
const modulseite = (heute, notizen) => {
  const M = modell(heute, notizen);
  const geoeffnet = [];
  const L = laden("modul", { heute, notizen, kontext: { modell: M, oeffnen: (f) => geoeffnet.push(f.path) } });
  const el = knoten("div");
  L.ergebnis.zeichnen(el, { sourcePath: MODUL });
  return { el, geoeffnet };
};

test("Modulseite: „Vorlesungen“ direkt unter dem Modulfeld, Zeilen neueste zuerst, Tipp öffnet, ein Knopf für neue Notizen", () => {
  const { el, geoeffnet } = modulseite("2026-10-28", notizenMit(vl("2026-10-13", 1, { nachgearbeitet: true }), vl("2026-10-20", 2), vl("2026-10-27", 3)));
  assert.deepEqual(el.kinder.map((k) => k.cls[0]), ["eba-mod", "eba-mod-vl"], "Modulfeld, dann Vorlesungen (darunter folgt ## Unterlagen)");
  const s = el.kinder[1];
  assert.deepEqual([s.kinder[0].tag, s.kinder[0].text], ["h2", "Vorlesungen"], "Überschrift wie jedes ## der Seite");
  const zeilen = s.finde("eba-ul-zeile");
  assert.deepEqual(zeilen.map((z) => z.texte()), [["Vorlesung 3 · Di 27.10."], ["Vorlesung 2 · Di 20.10."], ["Vorlesung 1 · Di 13.10.", "nachgearbeitet"]]);
  zeilen[0].an.click({ preventDefault() {}, stopPropagation() {} });
  assert.deepEqual(geoeffnet, ["Vorlesungen/X100/2026-10-27 X100 VL 03.md"]);
  const neu = s.finde("eba-mod-knopf");
  assert.equal(neu.length, 1);
  assert.deepEqual(neu[0].texte(), ["Neue Vorlesungsnotiz"]);
  assert.match(neu[0].attr.href, /aktion=vorlesung&code=X100$/);
  assert.equal(s.finde("eba-ul-leer").length, 0);
  assert.ok(!el.kinder[0].alle().some((k) => k.text === "Neue Vorlesung"), "keine zweite Handlung im Modulfeld");
  assert.equal(s.finde("eba-mod-vl-mehr").length, 0, "bis sechs Notizen ohne „Alle zeigen“");
});

test("Modulseite ohne Vorlesungsnotizen: ein leiser Satz und der Knopf, kein Erklärtext", () => {
  const { el } = modulseite("2026-10-28", notizenMit());
  const s = el.kinder[1];
  assert.deepEqual(s.kinder.map((k) => k.tag + "." + k.cls[0]), ["h2.eba-mod-vl-titel", "div.eba-mod-vl-fuss"]);
  assert.deepEqual(s.kinder[1].texte(), ["Noch keine Vorlesungsnotizen.", "Neue Vorlesungsnotiz"]);
});

test("Modulseite mit vielen Notizen: erst die fünf neuesten, „Alle n zeigen“ klappt die übrigen auf", () => {
  const viele = Array.from({ length: 8 }, (_, i) => vl(`2026-10-${String(13 + i).padStart(2, "0")}`, i + 1));
  const { el } = modulseite("2026-10-28", notizenMit(...viele));
  const s = el.kinder[1];
  assert.equal(s.finde("eba-ul-zeile").length, 8);
  assert.equal(s.finde("eba-mod-vl-alt").length, 3);
  const mehr = s.finde("eba-mod-vl-mehr")[0];
  assert.equal(mehr.text, "Alle 8 zeigen");
  mehr.an.click({ preventDefault() {}, stopPropagation() {} });
  assert.ok(s.cls.includes("alle"));
  assert.equal(mehr.text, "Weniger zeigen");
});

test("Modulnotizen: Modulfeld vor „## Unterlagen“, „Zum Modul“ ohne Vorlesungen (keine Dopplung)", () => {
  const dateien = [];
  const suchen = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) suchen(p); else if (e.name.endsWith(".md")) dateien.push(p); } };
  suchen(path.join(VAULT, "Module"));
  dateien.push(path.join(VAULT, "System", "Gerüste", "Modul.md"));
  assert.ok(dateien.length >= 80);
  for (const p of dateien) {
    const s = fs.readFileSync(p, "utf8");
    const modulfeld = s.indexOf("```eba-modul"), unterlagen = s.indexOf("## Unterlagen"), zum = s.indexOf("## Zum Modul");
    assert.ok(modulfeld > 0 && modulfeld < unterlagen && unterlagen < zum, path.basename(p) + ": Reihenfolge");
    const teil = s.slice(zum, s.indexOf("## Steckbrief"));
    assert.match(teil, /'typ != "vorlesung"'/, path.basename(p));
    assert.doesNotMatch(teil, /Vorlesungen|nachgearbeitet/, path.basename(p));
  }
});

test("Dashboard „Nachzuarbeiten“: Vorlesungen ohne Haken, älteste zuerst, links das Modul, dann ihr Name", () => {
  const notizen = notizenMit(vl("2026-10-13", 1, { nachgearbeitet: true }), vl("2026-10-20", 2), vl("2026-10-27", 3, { thema: "Streuung" }));
  notizen[MODUL].kurz = "Beispiel";
  const M = modell("2026-10-28", notizen);
  const B = laden("dashboard").ergebnis;
  const z = B.zeilenBauen("nachzuarbeiten", M, "2026-10-28");
  assert.deepEqual(z.map((x) => [x.wann, x.was]), [["Beispiel", "Vorlesung 2 · Di 20.10."], ["Beispiel", "Vorlesung 3 · Di 27.10. · Streuung"]]);
  assert.equal(B.artVon("Vorlesungen zum Nacharbeiten erscheinen, sobald Studium Autopilot läuft.\n"), "nachzuarbeiten");
  const dashboard = fs.readFileSync(path.join(VAULT, "Dashboard.md"), "utf8");
  assert.match(dashboard, /\+ Nachzuarbeiten\n> ```eba-liste nachzuarbeiten\n/);
});

test("Neue Vorlesungsnotiz von der Modulseite: Fenster mit Modul vorgewählt und Thema, Titel = Name der Notiz", async () => {
  const M = modell("2026-10-15", {});
  const plugin = { testAntworten: [{ thema: "Lineare Regression" }], testProtokoll: [] };
  const X = { f: { basename: "X100 Beispielmodul", path: MODUL }, fm: { code: "X100", titel: "Beispielmodul" } };
  const E = laden("eba", { kontext: { modell: M } }).ergebnis;
  const angelegt = [];
  const eba = Object.assign({}, E, {
    codeAusTitel: () => "X100",
    modulNachCode: (k) => (k === "X100" ? X : null),
    modulFeld: () => ({ name: "modul", titel: "Modul", art: "auswahl", optionen: [{ wert: null, text: "Ohne Modul" }, { wert: X, text: "X100 · Beispielmodul" }], vorgabe: X }),
    jetztLaufend: () => null,
    abbrechen: () => {},
    ablegen: async (ordner, name, inhalt) => { angelegt.push({ ordner, name, inhalt }); return { path: ordner + "/" + name + ".md" }; },
  });
  const F = laden("formular", { kontext: { plugin, user: { eba: () => eba } } });
  const N = laden("notizen", { kontext: { plugin, modell: M, formular: F.ctx.formular, user: { eba: () => eba, formular: require("../Studium Autopilot/System/Skripte/formular.js") } } });
  await N.ergebnis.aktionen.vorlesung.ausfuehren({ parameter: { code: "X100" }, datei: null });
  assert.deepEqual(plugin.testProtokoll.map((p) => p.formular), ["Neue Vorlesungsnotiz"], "ein Fenster, auch vom Modul-Knopf");
  assert.equal(angelegt.length, 1);
  assert.equal(angelegt[0].name, "2026-10-15 X100 VL 01", "Dateiname wie bisher");
  assert.match(angelegt[0].inhalt, /^thema: "Lineare Regression"$/m);
  assert.match(angelegt[0].inhalt, /^# Vorlesung 1 · Do 15\.10\. · Lineare Regression$/m);
  assert.equal(N.ergebnis.aktionen.vorlesung.titel, "Neue Vorlesungsnotiz", "Befehl heißt wie der Knopf");
});

test("Läuft gerade (Neue Vorlesungsnotiz ohne Frage): Stundenplan mit der Zeit dieses Tages, geänderte Zeit und Pause zählen", () => {
  const LV = "Stundenplan/Di X100.md";
  const notizen = notizenMit({ [LV]: { typ: "lehrveranstaltung", titel: "Beispielmodul · Vorlesung", code: "X100", art: "Vorlesung", semester: "WS 2026/27",
    wochentag: 2, beginn: "10:00", ende: "12:00", von: "2026-10-13", bis: "2027-02-02", aenderungen: ["2026-10-27|14:15|15:45|Hörsaal 9"] } });
  const E = laden("eba", { heute: "2026-10-20", notizen, kontext: { modell: modell("2026-10-20", notizen) } }).ergebnis;
  const laufend = (wann) => { const l = E.jetztLaufend(new Date(wann)); return l && [l.fm.code, l.quelle.path, l.eindeutig]; };
  assert.deepEqual(laufend("2026-10-20T10:30:00"), ["X100", LV, true], "übliche Zeit");
  // 27.10. auf 14:15–15:45 verschoben: zur üblichen Zeit läuft nichts, zur neuen schon (30 Minuten vorher bis 15 danach)
  assert.equal(laufend("2026-10-27T10:30:00"), null);
  assert.equal(laufend("2026-10-27T13:40:00"), null);
  assert.deepEqual(laufend("2026-10-27T13:45:00"), ["X100", LV, true]);
  assert.deepEqual(laufend("2026-10-27T16:00:00"), ["X100", LV, true]);
  assert.equal(laufend("2026-10-27T16:01:00"), null);
  assert.equal(laufend("2026-12-29T10:30:00"), null, "Weihnachtspause");
});
