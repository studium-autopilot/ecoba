// Vorlesungsnotizen sichtbarer (seit 19.10.2026): ein Name überall („Vorlesung 1 · Mo 13.10. · Thema“, ctx.modell.vorlesung),
// eigener Abschnitt „Vorlesungen“ auf der Modulseite direkt unter dem Modulfeld (modul.js), „Nachzuarbeiten“ auf dem Dashboard
// (dashboard.js), Fenster „Neue Vorlesungsnotiz“ mit Thema (notizen.js). Folien der Sitzung (seit 24.10.2026, ctx.modell.folien)
// nach Mustern echter Module: Kapitel über Wochen, ein Kapitel je Woche, Sitzungsdatum aus ILIAS, deine Wahl, spät angekommene
// Folien. Nur ausgedachte Daten (Codes X100 …).
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

// Ersatz für Obsidians Elemente (wie tests/darstellung.test.js), dazu empty, setText, addClass, toggleClass, hide/show und SVG-Symbole
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
  k.setAttribute = k.setAttr;
  k.appendChild = (c) => { k.kinder.push(c); return c; };
  k.ownerDocument = { createElementNS: (_ns, t) => knoten(t) };
  k.hide = () => k.toggleClass("verborgen", true);
  k.show = () => k.toggleClass("verborgen", false);
  k.addEventListener = (e, f) => { k.an[e] = f; };
  // für die Kopf-Karte (vorlesung.js): SVG-Symbole, Text neben Elementen, Sichtbarkeit
  k.ownerDocument = { createElementNS: (_ns, t) => Object.assign(knoten(t), { setAttribute() {} }) };
  k.appendChild = (c) => { k.kinder.push(c); };
  k.appendText = (t) => { k.kinder.push(knoten("#text", { text: t })); };
  k.hide = () => { k.versteckt = true; };
  k.show = () => { k.versteckt = false; };
  k.remove = () => {};
  Object.defineProperty(k, "childNodes", { get: () => k.kinder });
  Object.defineProperty(k, "childElementCount", { get: () => k.kinder.length });
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
  assert.match(angelegt[0].inhalt, /^folien: ""$/m, "Folien wählt das Modell beim Zeichnen, nicht das Anlegen");
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

test("Neue Vorlesungsnotiz: Dozent nicht kopiert, der Kopf liest ihn live aus dem Stundenplan (24.10.2026)", async () => {
  const notizen = notizenMit(vl("2026-10-13", 1));
  const M = modell("2026-10-20", notizen);
  const plugin = { testAntworten: [], testProtokoll: [] };
  const X = { f: { basename: "X100 Beispielmodul", path: MODUL }, fm: { code: "X100", titel: "Beispielmodul" } };
  const LV = { path: "Stundenplan/Di 10.15 X100 Vorlesung.md" };
  const E = laden("eba", { heute: "2026-10-20", notizen, kontext: { modell: M } }).ergebnis;
  const angelegt = [];
  const eba = Object.assign({}, E, {
    jetztLaufend: () => ({ f: X.f, fm: X.fm, modul: X, quelle: LV, lv: { typ: "lehrveranstaltung", dozent: "Dr. Beispiel" }, titel: "X100 · Vorlesung", eindeutig: true }),
    heutigeNotiz: () => null,
    ablegen: async (ordner, name, inhalt) => { angelegt.push({ ordner, name, inhalt }); return { path: ordner + "/" + name + ".md" }; },
  });
  const N = laden("notizen", { heute: "2026-10-20", kontext: { plugin, modell: M, user: { eba: () => eba } } });
  await N.ergebnis.aktionen.vorlesung.ausfuehren({ parameter: {}, datei: null });
  assert.equal(angelegt[0].name, "2026-10-20 X100 VL 02");
  assert.match(angelegt[0].inhalt, /^folien: ""$/m);
  assert.match(angelegt[0].inhalt, /^dozent: ""$/m, "Dozent nicht kopiert");
  assert.match(angelegt[0].inhalt, /^veranstaltung: "\[\[Stundenplan\/Di 10\.15 X100 Vorlesung\]\]"$/m);
});

test("Kopf der Vorlesungsnotiz: Dozent und Wochentag live aus dem Stundenplan, neu am nächsten Tag", () => {
  const VL = "Vorlesungen/X100/2026-10-20 X100 VL 02.md";
  const notizen = notizenMit(vl("2026-10-20", 2), { "Stundenplan/Di 10.15 X100 Vorlesung.md": {
    typ: "lehrveranstaltung", code: "X100", art: "Vorlesung", wochentag: 2, beginn: "10:15", ende: "11:45", raum: "Hörsaal 1",
    dozent: "Dr. Beispiel", von: "2026-10-13", bis: "2027-02-02" } });
  const intervalle = [], neu = [];
  const L = laden("vorlesung", { heute: "2026-10-20", notizen, kontext: { modell: modell("2026-10-20", notizen),
    intervall: (fn) => intervalle.push(fn), codeblock: (sprache) => ({ neu: () => neu.push(sprache) }) } });
  L.ctx.app.vault.cachedRead = async () => "";
  const kopf = () => { const el = knoten("div"); L.ergebnis.zeichnen(el, { sourcePath: VL }); return el; };
  const el = kopf();
  assert.deepEqual(el.finde("eba-vorl-dozent")[0].texte(), ["Dr. Beispiel"], "seit 24.10.2026 live statt beim Anlegen kopiert");
  assert.deepEqual(el.finde("plan")[0].texte(), ["Stundenplan", "Di 10:15"], "Wochentag aus wochentag (das Feld tag fällt weg)");
  notizen[VL].dozent = "Gast aus der Praxis";
  assert.deepEqual(kopf().finde("eba-vorl-dozent")[0].texte(), ["Gast aus der Praxis"], "selbst eingetragen geht vor");
  // Tageswechsel: „heute“ und die Perle dieser Woche zeichnen sich neu (die Abgabe einer Übung zeichnet kopf.js)
  let tag = "2026-10-20";
  L.ctx.date.now = () => tag;
  L.ergebnis.registrieren();
  intervalle[0]();
  assert.deepEqual(neu, []);
  tag = "2026-10-21";
  intervalle[0]();
  assert.deepEqual(neu, ["eba-vorlesung"]);
});

// ---------- Folien einer Vorlesungsnotiz (ctx.modell.folien) ----------
// Begleitnotiz zu Folien, wie ILIAS sie ablegt: datum = Tag der Ablage, dazu die PDF unter ihrem Namen
const folie = (code, nr, titel, datum, fm = {}) => {
  const name = `${code} Folien ${String(nr).padStart(2, "0")} ${titel}`;
  return { [`Unterlagen/${code}/${name}.md`]: Object.assign({ typ: "unterlage", art: "Folien", code, nummer: nr, titel, datum, datei: `[[${name}.pdf]]` }, fm) };
};
const notiz = (code, datum, nummer, fm = {}) => ({ [`Vorlesungen/${code}/${datum} ${code} VL ${String(nummer).padStart(2, "0")}.md`]:
  Object.assign({ typ: "vorlesung", code, datum, nummer, folien: "" }, fm) });
const sitzung = (code, wochentag, beginn, art = "Vorlesung") => ({ [`Stundenplan/${code} ${wochentag} ${beginn}.md`]: { typ: "lehrveranstaltung", code, art,
  semester: "WS 2026/27", wochentag, beginn, ende: "", von: "2026-10-12", bis: "2027-02-06" } });
// Links wie in Obsidian: [[Name]] findet die Notiz dieses Namens, [[x.pdf]] die PDF, die eine Begleitnotiz nennt
const verlinken = (app, notizen) => {
  app.metadataCache.getFirstLinkpathDest = (p) => {
    if (/\.pdf$/.test(p)) return Object.keys(notizen).some((k) => notizen[k].datei === `[[${p}]]`) ? { path: "PDF/" + p, name: p, basename: p.slice(0, -4), extension: "pdf" } : null;
    const k = Object.keys(notizen).find((x) => x === p || path.basename(x, ".md") === p);
    return k ? app.vault.getAbstractFileByPath(k) : null;
  };
};
// Fachmodell mit Links; zu(Notiz) = ctx.modell.folien, namen(Notiz) = die Namen der gezeigten Folien
const folienModell = (notizen) => {
  const L = laden("modell", { heute: "2026-10-30", notizen, frontmatter: { "System/Daten/Semester.md": SEMESTER } });
  verlinken(L.ctx.app, notizen);
  const zu = (p) => L.ctx.modell.folien(L.ctx.app.vault.getAbstractFileByPath(p));
  return { M: L.ctx.modell, zu, namen: (p) => zu(p).folien.map((d) => d.f.basename) };
};
const pfad = (n) => Object.keys(n)[0];

test("Folien: Kapitel über mehrere Wochen, alle zu Semesterbeginn online; eine Fassung mit dem Datum der Sitzung gilt dort", () => {
  const vl1 = notiz("X100", "2026-10-15", 1), vl2 = notiz("X100", "2026-10-15", 2), vl3 = notiz("X100", "2026-10-22", 3);
  const notizen = Object.assign({}, sitzung("X100", 4, "10:15"), sitzung("X100", 4, "14:15"),
    folie("X100", 0, "Organisation", "2026-10-13", { seiten: 24 }), folie("X100", 0, "Organisation und Überblick", "2026-10-14", { seiten: 20 }),
    folie("X100", 1, "Einführung", "2026-10-13"), folie("X100", 2, "Lagemaße", "2026-10-13"), folie("X100", 3, "Streuung", "2026-10-14"),
    folie("X100", 4, "Zusammenhang", "2026-10-14"), folie("X100", 5, "Regression", "2026-10-14"),
    folie("X100", 1, "Einführung aus dem Vorjahr", "2026-10-13", { original: "X100_Kapitel_1_23.10.2025.pdf" }), vl1, vl2, vl3);
  const { zu, namen } = folienModell(notizen);
  const null0 = ["X100 Folien 00 Organisation und Überblick"];
  assert.deepEqual(namen(pfad(vl1)), null0, "erste Sitzung: die kleinste Nummer, davon die neueste Fassung (auch mit weniger Seiten)");
  assert.deepEqual(namen(pfad(vl2)), null0, "zweite Vorlesung am selben Tag");
  assert.deepEqual(namen(pfad(vl3)), null0, "nichts Neues seit der vorigen Sitzung: weiter mit deren Folien");
  assert.equal(zu(pfad(vl3)).gewaehlt, false);
  // Kapitel 1 mit Anmerkungen, am Tag danach abgelegt, das Datum dieser Sitzung im Dateinamen
  Object.assign(notizen, folie("X100", 1, "Einführung mit Anmerkungen", "2026-10-23", { original: "X100_Kapitel_1_22.10.2026.pdf" }));
  assert.deepEqual(namen(pfad(vl3)), ["X100 Folien 01 Einführung mit Anmerkungen"]);
  assert.deepEqual(namen(pfad(vl1)), null0, "die erste Sitzung bleibt");
  const alle = zu(pfad(vl3)).alle.map((d) => d.f.basename);
  assert.equal(alle.length, 9, "zur Wahl stehen alle Folien des Moduls");
  assert.ok(alle.includes("X100 Folien 01 Einführung aus dem Vorjahr"), "die Fassung aus dem Vorjahr nur zur Wahl, nie von selbst");
  assert.deepEqual(alle.slice(0, 3), ["X100 Folien 00 Organisation und Überblick", "X100 Folien 00 Organisation", "X100 Folien 01 Einführung mit Anmerkungen"],
    "nach Nummer, je Nummer die neueste zuerst");
  // dieselben Dateien in anderer Reihenfolge geladen: dieselbe Wahl
  const { namen: rueckwaerts } = folienModell(Object.fromEntries(Object.entries(notizen).reverse()));
  for (const n of [vl1, vl2, vl3]) assert.deepEqual(rueckwaerts(pfad(n)), namen(pfad(n)), pfad(n));
});

test("Folien: ein Kapitel je Woche; jede Vorlesung zeigt, was seit der vorigen angekommen ist, auch ohne Stundenplan", () => {
  for (const plan of [sitzung("Y200", 2, "10:15"), {}]) {
    const vls = [notiz("Y200", "2026-10-13", 1), notiz("Y200", "2026-10-20", 2), notiz("Y200", "2026-10-27", 3)];
    // dazu eine kürzere Fassung von Kapitel 2 und, erst jetzt abgelegt, Folien des Sommersemesters und eine Fassung aus dem
    // Vorjahr (Datum im Dateinamen): die zählen nie von selbst
    const notizen = Object.assign({}, plan, folie("Y200", 0, "Organisation", "2026-10-13"), folie("Y200", 1, "Märkte", "2026-10-16"),
      folie("Y200", 2, "Preise", "2026-10-22", { seiten: 30 }), folie("Y200", 2, "Preise kurz", "2026-10-22", { seiten: 12 }),
      folie("Y200", 7, "Wiederholung", "2026-10-16", { semester: "SS 2026" }),
      folie("Y200", 1, "Märkte aus dem Vorjahr", "2026-10-16", { original: "Y200_Kapitel_1_21.10.2025.pdf" }), ...vls);
    const { namen } = folienModell(notizen);
    assert.deepEqual(vls.map((n) => namen(pfad(n))), [["Y200 Folien 00 Organisation"], ["Y200 Folien 01 Märkte"], ["Y200 Folien 02 Preise"]],
      Object.keys(plan).length ? "mit Stundenplan" : "ohne Stundenplan: die Tage der Notizen sind die Sitzungen");
  }
});

test("Folien: Übung und Tutorium sind keine Sitzungen der Vorlesung", () => {
  const vl1 = notiz("Y200", "2026-10-13", 1), vl2 = notiz("Y200", "2026-10-20", 2);
  const notizen = Object.assign({}, sitzung("Y200", 2, "10:15"), sitzung("Y200", 4, "14:15", "Übung"), sitzung("Y200", 5, "8:30", "Tutorium"),
    folie("Y200", 0, "Organisation", "2026-10-13"), folie("Y200", 1, "Märkte", "2026-10-14"), folie("Y200", 2, "Preise", "2026-10-17"), vl1, vl2);
  const { namen } = folienModell(notizen);
  assert.deepEqual(namen(pfad(vl1)), ["Y200 Folien 00 Organisation"]);
  assert.deepEqual(namen(pfad(vl2)), ["Y200 Folien 01 Märkte", "Y200 Folien 02 Preise"], "alles seit Dienstag, nicht erst seit der Übung");
});

test("Folien: ILIAS ordnet Folien einer Sitzung zu, auch zwei auf einmal; eine später angelegte Notiz gehört zur Sitzung davor", () => {
  const vl1 = notiz("Z300", "2026-10-12", 1), nachgeholt = notiz("Z300", "2026-10-14", 2), vl3 = notiz("Z300", "2026-10-19", 3);
  const plan = sitzung("Z300", 1, "10:15");
  plan[pfad(plan)].ausfall = ["2026-10-26"];
  const notizen = Object.assign({}, plan,
    folie("Z300", 0, "Organisation", "2026-10-12", { quelle: "ILIAS: Z300 / 2026-10-12, 10:15 - 11:45: Vorlesung 1" }),
    folie("Z300", 1, "Grundlagen", "2026-10-12", { quelle: "ILIAS: Z300 / 2026-10-12, 10:15 - 11:45: Vorlesung 1" }),
    folie("Z300", 1, "Grundlagen ergänzt", "2026-10-19", { quelle: "ILIAS-Kurs Z300, Ordner 2026-10-19, 10:15 - 11:45: Vorlesung 2 (Z300_2_post.pdf)" }),
    vl1, nachgeholt, vl3);
  const { namen } = folienModell(notizen);
  assert.deepEqual(namen(pfad(vl1)), ["Z300 Folien 00 Organisation", "Z300 Folien 01 Grundlagen"]);
  assert.deepEqual(namen(pfad(nachgeholt)), ["Z300 Folien 00 Organisation", "Z300 Folien 01 Grundlagen"], "Mittwoch: die Sitzung vom Montag");
  assert.deepEqual(namen(pfad(vl3)), ["Z300 Folien 01 Grundlagen ergänzt"]);
  // 26.10. fällt aus, Ersatztermin am Dienstag danach mit eigenem Ordner in ILIAS (mehr als 6 Tage nach der letzten Sitzung)
  const ersatz = notiz("Z300", "2026-10-27", 4);
  Object.assign(notizen, folie("Z300", 2, "Entscheidungen", "2026-10-27", { quelle: "ILIAS: Z300 / 2026-10-27, 14:15 - 15:45: Vorlesung 3 (Ersatztermin)" }), ersatz);
  assert.deepEqual(namen(pfad(ersatz)), ["Z300 Folien 02 Entscheidungen"]);
});

test("Folien, die erst nach dem Anlegen der Notiz ankommen, erscheinen von selbst", () => {
  const vl2 = notiz("Y200", "2026-10-20", 2);
  const notizen = Object.assign({}, sitzung("Y200", 2, "10:15"), folie("Y200", 0, "Organisation", "2026-10-13"), notiz("Y200", "2026-10-13", 1), vl2);
  const { namen } = folienModell(notizen);
  assert.deepEqual(namen(pfad(vl2)), ["Y200 Folien 00 Organisation"], "noch nichts Neues: die Folien der vorigen Sitzung");
  Object.assign(notizen, folie("Y200", 1, "Märkte", "2026-10-20"));
  assert.deepEqual(namen(pfad(vl2)), ["Y200 Folien 01 Märkte"]);
  // erste Sitzung, Folien erst am Tag danach abgelegt; Folien 00 mit Hinweisen zur Klausur kommen im Januar
  const erste = notiz("Y200", "2026-10-13", 1);
  const spaet = folienModell(Object.assign({}, sitzung("Y200", 2, "10:15"), folie("Y200", 1, "Märkte", "2026-10-14"),
    folie("Y200", 0, "Hinweise zur Klausur", "2027-01-19"), erste));
  assert.deepEqual(spaet.namen(pfad(erste)), ["Y200 Folien 01 Märkte"], "erste Sitzung: die kleinste Nummer bis zur nächsten Sitzung");
  // alle Kapitel auf einmal, erst vor der dritten Sitzung: davor nichts, dann das erste
  const drei = [notiz("Y200", "2026-10-13", 1), notiz("Y200", "2026-10-20", 2), notiz("Y200", "2026-10-27", 3)];
  const sammel = folienModell(Object.assign({}, sitzung("Y200", 2, "10:15"), ...[0, 1, 2, 3, 4].map((n) => folie("Y200", n, "Kapitel " + n, "2026-10-24")), ...drei));
  assert.deepEqual(drei.map((n) => sammel.namen(pfad(n))), [[], [], ["Y200 Folien 00 Kapitel 0"]]);
});

test("Folien: deine Wahl (PDF oder Begleitnotiz) gilt, die nächste Vorlesung macht dort weiter; ein Link ins Leere zählt nicht", () => {
  const vl2 = notiz("Y200", "2026-10-20", 2, { folien: "[[Y200 Folien 02 Preise.pdf]]" }), vl3 = notiz("Y200", "2026-10-27", 3);
  const vl4 = notiz("Y200", "2026-11-03", 4, { folien: "[[Y200 Folien 03 Wettbewerb]]" }), vl5 = notiz("Y200", "2026-11-10", 5, { folien: "[[Gibt es nicht.pdf]]" });
  const notizen = Object.assign({}, sitzung("Y200", 2, "10:15"), folie("Y200", 0, "Organisation", "2026-10-13"), folie("Y200", 1, "Märkte", "2026-10-13"),
    folie("Y200", 2, "Preise", "2026-10-13"), folie("Y200", 3, "Wettbewerb", "2026-10-13"), notiz("Y200", "2026-10-13", 1), vl2, vl3, vl4, vl5);
  const { zu, namen } = folienModell(notizen);
  assert.deepEqual([namen(pfad(vl2)), zu(pfad(vl2)).gewaehlt], [["Y200 Folien 02 Preise"], true], "PDF: ihre Begleitnotiz");
  assert.deepEqual([namen(pfad(vl3)), zu(pfad(vl3)).gewaehlt], [["Y200 Folien 02 Preise"], false]);
  assert.deepEqual([namen(pfad(vl4)), zu(pfad(vl4)).gewaehlt], [["Y200 Folien 03 Wettbewerb"], true], "Begleitnotiz");
  assert.deepEqual([namen(pfad(vl5)), zu(pfad(vl5)).gewaehlt], [["Y200 Folien 03 Wettbewerb"], false], "Link ins Leere: wie ohne Wahl");
});

test("Folien: zwei Vorlesungen am selben Tag mit verschiedener Wahl; die nächste macht mit der höheren Nummer weiter, gleich in welcher Reihenfolge", () => {
  const a = notiz("X100", "2026-10-15", 1, { folien: "[[X100 Folien 01 Einführung.pdf]]" }), b = notiz("X100", "2026-10-15", 2, { folien: "[[X100 Folien 00 Organisation.pdf]]" });
  const c = notiz("X100", "2026-10-15", 3), naechste = notiz("X100", "2026-10-22", 4);
  const notizen = Object.assign({}, sitzung("X100", 4, "10:15"), ...[0, 1, 2, 3, 4].map((n) => folie("X100", n, ["Organisation", "Einführung", "Lagemaße", "Streuung", "Regression"][n], "2026-10-13")),
    a, b, c, naechste);
  for (const n of [notizen, Object.fromEntries(Object.entries(notizen).reverse())]) {
    const { namen } = folienModell(n);
    assert.deepEqual(namen(pfad(c)), ["X100 Folien 00 Organisation", "X100 Folien 01 Einführung"], "dritte Vorlesung des Tages: beide");
    assert.deepEqual(namen(pfad(naechste)), ["X100 Folien 01 Einführung"]);
  }
});

test("Kopf einer Vorlesungsnotiz: Links zu den Folien der Sitzung, „⋯“ → „Andere Folien …“ schreibt deine Wahl ins Feld folien", async () => {
  const vl = notiz("Z300", "2026-10-12", 1), VL = pfad(vl);
  const notizen = Object.assign({}, folie("Z300", 0, "Organisation", "2026-10-12", { quelle: "ILIAS: Z300 / 2026-10-12, 10:15 - 11:45: Vorlesung 1" }),
    folie("Z300", 1, "Grundlagen", "2026-10-12", { quelle: "ILIAS: Z300 / 2026-10-12, 10:15 - 11:45: Vorlesung 1" }),
    folie("Z300", 2, "Entscheidungen", "2026-10-12"), vl);
  const { M } = folienModell(notizen);
  const menue = [], formulare = [];
  const L = laden("vorlesung", { heute: "2026-10-12", notizen, kontext: { modell: M, kopf: { mehr: (_el, _f, extra) => menue.push(...extra) },
    formular: async (o) => { formulare.push(o); return { folien: o.felder[0].optionen[3].wert }; } } });
  verlinken(L.ctx.app, notizen);
  L.ctx.app.vault.cachedRead = async () => "";
  L.ctx.app.fileManager = { processFrontMatter: async (f, fn) => fn(notizen[f.path]) };
  const chips = () => { const el = knoten("div"); L.ergebnis.zeichnen(el, { sourcePath: VL }); return el.finde("folien").map((c) => c.texte()); };
  assert.deepEqual(chips(), [["Folien 00", "Organisation"], ["Folien 01", "Grundlagen"]]);
  assert.deepEqual(menue.map((m) => m.titel), ["Andere Folien …"]);
  await menue[0].aktion();
  assert.equal(formulare[0].titel, "Folien zu dieser Vorlesung");
  assert.deepEqual(formulare[0].felder[0].optionen.map((o) => o.text),
    ["Automatisch (passend zu dieser Vorlesung)", "Folien 00 · Organisation", "Folien 01 · Grundlagen", "Folien 02 · Entscheidungen"]);
  assert.equal(notizen[VL].folien, "[[Z300 Folien 02 Entscheidungen.pdf]]", "verlinkt wird die PDF");
  assert.deepEqual(chips(), [["Folien 02", "Entscheidungen"]]);
});

// ---------- Zwei Fassungen derselben Folien (seit 24.10.2026) ----------
// Neue Fassung neben deinen bearbeiteten Folien, wie ILIAS sie ablegt: „<Name> neue Fassung JJJJ-MM-TT“, datum = Tag der Ablage
const kopie = (code, nr, titel, tag, fm = {}) => {
  const name = `${code} Folien ${String(nr).padStart(2, "0")} ${titel} neue Fassung ${tag}`;
  return { [`Unterlagen/${code}/${name}.md`]: Object.assign({ typ: "unterlage", art: "Folien", code, nummer: nr, titel, datum: tag, datei: `[[${name}.pdf]]` }, fm) };
};

test("Folien: deine bearbeitete und die neue Fassung nebeneinander, beschriftet; die neue gehört nicht zur Sitzung, in der sie kam", () => {
  const vls = [notiz("Y200", "2026-10-13", 1), notiz("Y200", "2026-10-20", 2), notiz("Y200", "2026-10-27", 3)];
  const notizen = Object.assign({}, sitzung("Y200", 2, "10:15"), folie("Y200", 0, "Organisation", "2026-10-13"), folie("Y200", 1, "Märkte", "2026-10-16"),
    folie("Y200", 2, "Preise", "2026-10-22"), kopie("Y200", 1, "Märkte", "2026-10-27"), ...vls);
  const { zu, namen } = folienModell(notizen);
  const paar = ["Y200 Folien 01 Märkte", "Y200 Folien 01 Märkte neue Fassung 2026-10-27"];
  assert.deepEqual(vls.map((n) => namen(pfad(n))), [["Y200 Folien 00 Organisation"], paar, ["Y200 Folien 02 Preise"]],
    "die neue Fassung von Kapitel 1 kam zur dritten Sitzung, ist aber nicht deren Kapitel");
  assert.deepEqual(zu(pfad(vls[1])).folien.map((d) => d.fassung), [{ rolle: "eigen", text: "Deine bearbeitete Fassung" }, { rolle: "neu", text: "Neue Fassung vom 27.10.2026" }]);
  assert.equal(zu(pfad(vls[0])).folien[0].fassung, null, "eine Fassung: keine Beschriftung");
  // zur Wahl: je Nummer die neueste zuerst, beide beschriftet
  assert.deepEqual(zu(pfad(vls[1])).alle.map((d) => [d.f.basename, d.fassung && d.fassung.text]).slice(1, 3),
    [[paar[1], "Neue Fassung vom 27.10.2026"], [paar[0], "Deine bearbeitete Fassung"]]);
  // die Kopie wurde später durch eine noch neuere Fassung ersetzt (aktualisiert): ihr Tag
  Object.assign(notizen[Object.keys(kopie("Y200", 1, "Märkte", "2026-10-27"))[0]], { aktualisiert: "2026-11-03" });
  assert.equal(zu(pfad(vls[1])).folien[1].fassung.text, "Neue Fassung vom 03.11.2026");
});

test("Folien mit zwei Fassungen: deine Wahl der neuesten gilt allein, die Wahl deiner bearbeiteten zeigt die neueste mit", () => {
  const nur = notiz("Y200", "2026-10-20", 2, { folien: "[[Y200 Folien 01 Märkte neue Fassung 2026-10-27]]" });
  const deine = notiz("Y200", "2026-10-27", 3, { folien: "[[Y200 Folien 01 Märkte.pdf]]" });
  const notizen = Object.assign({}, sitzung("Y200", 2, "10:15"), folie("Y200", 0, "Organisation", "2026-10-13"), folie("Y200", 1, "Märkte", "2026-10-16"),
    kopie("Y200", 1, "Märkte", "2026-10-27"), notiz("Y200", "2026-10-13", 1), nur, deine);
  const { zu, namen } = folienModell(notizen);
  assert.deepEqual([namen(pfad(nur)), zu(pfad(nur)).gewaehlt], [["Y200 Folien 01 Märkte neue Fassung 2026-10-27"], true]);
  assert.deepEqual(zu(pfad(nur)).folien[0].fassung.text, "Neue Fassung vom 27.10.2026");
  assert.deepEqual(namen(pfad(deine)), ["Y200 Folien 01 Märkte", "Y200 Folien 01 Märkte neue Fassung 2026-10-27"], "die neue bleibt nicht hinter deiner Wahl verborgen");
});

test("Kopf einer Vorlesungsnotiz mit zwei Fassungen: beide Chips beschriftet, deine zuerst; „Andere Folien“ nennt die Fassung", async () => {
  const vl = notiz("Z300", "2026-10-12", 1), VL = pfad(vl);
  const notizen = Object.assign({}, folie("Z300", 1, "Grundlagen", "2026-10-12", { quelle: "ILIAS: Z300 / 2026-10-12, 10:15 - 11:45: Vorlesung 1" }),
    kopie("Z300", 1, "Grundlagen", "2026-10-19", { quelle: "ILIAS: Z300 / 2026-10-12, 10:15 - 11:45: Vorlesung 1" }), vl);
  const { M } = folienModell(notizen);
  const menue = [], formulare = [];
  const L = laden("vorlesung", { heute: "2026-10-19", notizen, kontext: { modell: M, kopf: { mehr: (_el, _f, extra) => menue.push(...extra) },
    formular: async (o) => { formulare.push(o); return null; } } });
  verlinken(L.ctx.app, notizen);
  L.ctx.app.vault.cachedRead = async () => "";
  const el = knoten("div");
  L.ergebnis.zeichnen(el, { sourcePath: VL });
  const chips = el.finde("folien");
  assert.deepEqual(chips.map((c) => c.texte()), [["Folien 01", "Grundlagen", "Deine bearbeitete Fassung"], ["Folien 01", "Grundlagen", "Neue Fassung vom 19.10.2026"]]);
  assert.deepEqual(chips.map((c) => c.finde("eba-vorl-fassung")[0].cls), [["eba-vorl-fassung", "eigen"], ["eba-vorl-fassung", "neu"]]);
  await menue[0].aktion();
  assert.deepEqual(formulare[0].felder[0].optionen.map((o) => o.text).slice(1),
    ["Folien 01 · Grundlagen · Neue Fassung vom 19.10.2026", "Folien 01 · Grundlagen · Deine bearbeitete Fassung"]);
});
