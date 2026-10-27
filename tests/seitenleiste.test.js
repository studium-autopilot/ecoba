// Seitenleiste „Übersicht“ (seitenleiste.js, ZIELE als einzige Liste der Seiten): jede Seite gibt es in der Vorlage und hat ein
// eigenes Symbol, die Lesezeichen der Vorlage folgen der Liste; darunter die Module dieses Semesters nach derselben Regel wie das
// Fenster „Neu …“ (eba.js, diesesSemester). Das Raster-Menü oben in jeder Notiz (menue.js bis 0.4.6) gibt es nicht mehr. Auf
// iPhone und iPad steht dieselbe Liste seit 26.10.2026 im Menü hinter Obsidians ≡ unten rechts.
// Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { laden } = require("./laden");

const VAULT = path.join(__dirname, "..", "Studium Autopilot");
const SKRIPTE = path.join(VAULT, "System", "Skripte");
const seitenleiste = require(path.join(SKRIPTE, "seitenleiste.js"));
const { ZIELE } = seitenleiste;
const pfadVon = (z) => (z === "Dashboard" ? "Dashboard.md" : `Studium/${z}.md`);

test("Seiten: Dashboard zuerst, jede Seite gibt es in der Vorlage", () => {
  assert.equal(ZIELE[0], "Dashboard", "„Dashboard“ ist der Weg zurück zum Start");
  for (const z of ZIELE) assert.ok(fs.existsSync(path.join(VAULT, pfadVon(z))), z);
});

test("Seiten: der Lernplan nur, wenn es ihn gibt", () => {
  const ohne = ZIELE.filter((z) => z !== "Lernplan");
  assert.deepEqual(seitenleiste.sichtbareZiele({}), ohne);
  assert.deepEqual(seitenleiste.sichtbareZiele({ lernplan: { sichtbar: () => false } }), ohne);
  assert.deepEqual(seitenleiste.sichtbareZiele({ lernplan: { sichtbar: () => true } }), ZIELE);
});

// Das Dashboard zeigt die Woche auf jedem Gerät als Raster (seit 24.10.2026; 0.6.6 führte die Seite Stundenplan noch am iPhone,
// wo das Dashboard nur einen Tag zeigte). Die Seite selbst bleibt: Lehrveranstaltungen verweisen auf sie (uebersicht).
test("Seiten: Stundenplan auf keinem Gerät, die Seite selbst bleibt", () => {
  const PLATTFORMEN = [{ isPhone: true, isMobile: true }, { isPhone: false, isMobile: true, isTablet: true }, { isPhone: false, isMobile: false }];
  for (const Platform of PLATTFORMEN) assert.ok(seitenleiste.sichtbareZiele({ obsidian: { Platform } }).indexOf("Stundenplan") < 0, JSON.stringify(Platform));
  assert.ok(fs.existsSync(path.join(VAULT, "Studium", "Stundenplan.md")));
});

test("Lesezeichen der Vorlage = Seiten der Übersicht (ohne den Lernplan, den es nur mit Lernplan-Notizen gibt)", () => {
  const b = JSON.parse(fs.readFileSync(path.join(VAULT, ".obsidian", "bookmarks.json"), "utf8"));
  const soll = ZIELE.filter((z) => z !== "Lernplan");
  assert.deepEqual(b.items.map((x) => x.title), soll);
  assert.deepEqual(b.items.map((x) => x.path), soll.map(pfadVon));
});

test("Jede Seite hat ein eigenes Symbol in eba-core.css", () => {
  const css = fs.readFileSync(path.join(VAULT, ".obsidian", "snippets", "eba-core.css"), "utf8");
  const symbole = ZIELE.map((z) => {
    const m = css.match(new RegExp(`li:has\\(> a\\[data-href\\$="${z.replace(/[&]/g, "\\$&")}"\\]\\)\\s*\\{\\s*--eba-icon:\\s*(url\\("[^"]+"\\))`));
    assert.ok(m, "Symbol für " + z);
    return m[1];
  });
  assert.equal(new Set(symbole).size, symbole.length, "keine zwei Seiten mit demselben Symbol");
});

test("Dieses Semester: Plan im aktuellen Semester, laufend oder angemeldet; nach Code sortiert", () => {
  const modul = (code, felder) => Object.assign({ typ: "modul", code, titel: "Modul " + code }, felder);
  const notizen = {
    "Module/1 Grundstudium/S110 Explorative Datenanalyse.md": modul("S110", { plan: "WS 2026/27" }),
    "Module/1 Grundstudium/B110 Einführung.md": modul("B110", { plan: "WS 2026/27" }),
    "Module/1 Grundstudium/E130 Makro.md": modul("E130", { plan: "SoSe 2027" }),
    "Module/2 Schlüsselqualifikationen/SQ100 Kurs.md": modul("SQ100", { status: "angemeldet" }),
    "Module/3 Schwerpunktkatalog/B320 Market Research.md": modul("B320", { status: "läuft", plan: "" }),
    "Module/3 Schwerpunktkatalog/B321 Marketing.md": modul("B321", {}),
    "Termine/2026-11-01 Klausur.md": { typ: "termin", code: "B110" },
  };
  const modell = {
    aktuell: { fs: 1, name: "WS 2026/27" },
    imPlan: (fm) => !!fm.plan,
    modulSemester: (fm) => fm.plan,
  };
  const { ergebnis: eba } = laden("eba", { notizen, kontext: { modell } });
  const codes = seitenleiste.moduleJetzt(eba).map((x) => x.fm.code);
  assert.deepEqual(codes, ["B110", "B320", "S110", "SQ100"]);
  // Dieselbe Regel wie im Fenster „Neu …“: diese Module stehen dort in der Gruppe „Dieses Semester“
  const gruppe = eba.modulFeld().optionen.filter((o) => o.gruppe === "Dieses Semester").map((o) => o.wert.fm.code).sort();
  assert.deepEqual(gruppe, codes.slice().sort());
});

test("Ansicht: eigener Tab „Übersicht“, öffnet über ctx.oeffnen, Stil in eba-core.css Abschnitt 66", () => {
  const code = fs.readFileSync(path.join(SKRIPTE, "seitenleiste.js"), "utf8");
  assert.equal(seitenleiste.TYP, "eba-uebersicht");
  assert.match(code, /getDisplayText\(\) \{ return "Übersicht"; \}/);
  assert.match(code, /ctx\.oeffnen\(/);
  assert.match(code, /sichtbareZiele\(ctx\)/, "Seiten nur aus ZIELE, keine zweite Liste");
  const css = fs.readFileSync(path.join(VAULT, ".obsidian", "snippets", "eba-core.css"), "utf8");
  assert.match(css, /66\. Seitenleiste „Übersicht“/);
  for (const k of ["eba-sl-zeile", "eba-sl-code", "eba-sl-label"]) assert.ok(css.includes("." + k), k);
});

// Ein kleines Gerüst statt Obsidian: Elemente mit createEl/createSpan/createDiv, die Ansicht gezeichnet wie beim Öffnen des Tabs
const element = (tag = "div", o = {}) => ({
  tag, cls: new Set(String(o.cls || "").split(" ").filter(Boolean)), text: o.text || "", attr: Object.assign({}, o.attr), kinder: [],
  empty() { this.kinder = []; },
  addClass(c) { this.cls.add(c); },
  setAttribute(k, v) { this.attr[k] = v; },
  addEventListener() {},
  createEl(t, x) { const k = element(t, x); this.kinder.push(k); return k; },
  createSpan(x) { return this.createEl("span", x); },
  createDiv(x) { return this.createEl("div", x); },
});
const zeichnen = () => {
  let fabrik = null;
  const vorher = { window: global.window, document: global.document };
  global.document = {};
  global.window = { app: {
    workspace: { getMostRecentLeaf: () => null },
    metadataCache: { getFirstLinkpathDest: (ziel) => ({ path: ziel }), getFileCache: () => null },
  } };
  try {
    class ItemView { constructor() { this.contentEl = element(); } }
    seitenleiste({
      obsidian: { ItemView, Platform: { isMobile: true }, addIcon() {} }, // ohne app.mobileNavbar: nur die Ansicht
      plugin: { registerView: (typ, f) => { fabrik = f; } },
      lernplan: { sichtbar: () => true }, user: {},
      aufraeumen() {}, entprellen: (f) => f, an() {}, zeit() {}, dom() {},
    }).registrieren();
    const ansicht = fabrik({});
    ansicht.onOpen();
    return ansicht.contentEl;
  } finally {
    global.window = vorher.window;
    global.document = vorher.document;
  }
};

test("In Entwicklung: diese Seiten abgeblendet mit der Pille „in Entwicklung“, die übrigen nicht", () => {
  const { IN_ENTWICKLUNG } = seitenleiste;
  assert.ok(IN_ENTWICKLUNG.length, "Liste leer: dann auch die Prüfung hier streichen");
  for (const z of IN_ENTWICKLUNG) assert.ok(ZIELE.includes(z), z + " ist keine Seite der Übersicht");
  const zeilen = zeichnen().kinder[0].kinder;
  assert.deepEqual(zeilen.map((li) => li.kinder.find((k) => k.tag === "a").attr["data-href"]), ZIELE);
  for (const li of zeilen) {
    const ziel = li.kinder.find((k) => k.tag === "a").attr["data-href"];
    const soll = IN_ENTWICKLUNG.includes(ziel);
    assert.equal(li.cls.has("is-entwicklung"), soll, ziel);
    const pille = li.kinder.find((k) => k.cls.has("eba-sl-entwicklung"));
    assert.equal(pille ? pille.text : null, soll ? "in Entwicklung" : null, ziel);
  }
  const css = fs.readFileSync(path.join(VAULT, ".obsidian", "snippets", "eba-core.css"), "utf8");
  const a66 = css.slice(css.indexOf("66. Seitenleiste „Übersicht“"), css.indexOf("Ende Abschnitt 66"));
  for (const k of [".eba-sl-zeile.is-entwicklung", ".eba-sl-entwicklung"]) assert.ok(a66.includes(k), k);
  assert.doesNotMatch(css, /eba-sl-zeile:has\(> a\[data-href=/, "keine Seite fest im CSS, nur über IN_ENTWICKLUNG");
});

test("Symbol des Tabs: eigenes SVG über addIcon (setIcon blieb auf dem iPad leer), Strich und Farbe als Attribute", () => {
  const code = fs.readFileSync(path.join(SKRIPTE, "seitenleiste.js"), "utf8");
  assert.match(code, /getIcon\(\) \{ return eigenesSymbol \? SYMBOL : "layout-grid"; \}/);
  assert.match(code, /if \(eigenesSymbol\) addIcon\(SYMBOL, SYMBOL_SVG\);/);
  const svg = seitenleiste.SYMBOL_SVG;
  assert.match(svg, /^<g fill="none" stroke="currentColor" stroke-width="[\d.]+"/);
  assert.equal((svg.match(/<rect /g) || []).length, 4);
  for (const m of svg.matchAll(/(?:x|y|width|height)="([\d.]+)"/g)) assert.ok(Number(m[1]) >= 0 && Number(m[1]) <= 100, "im 100er-Feld");
});

test("Kein Raster-Menü mehr: kein Skript setzt ein Symbol „Übersicht“ in die Kopfleiste der Notizen", () => {
  assert.ok(!fs.existsSync(path.join(SKRIPTE, "menue.js")), "menue.js ist entfernt (das Update löscht es)");
  for (const n of fs.readdirSync(SKRIPTE).filter((x) => x.endsWith(".js"))) {
    const code = fs.readFileSync(path.join(SKRIPTE, n), "utf8");
    assert.doesNotMatch(code, /addAction\("layout-grid"|eba-menue-(?:aktion|tafel|knopf)/, n);
  }
});

// Was bis 24.10.2026 oben in der Schublade stand (Zahnrad, Dateien, Tresor), steht auf der Seite Einstellungen & Hilfe. Die Schublade
// zeigt Obsidian seit 26.10.2026 wieder ganz: Die Übersicht ist auf iPhone und iPad nicht mehr darin.
test("Obsidians Einstellungen, Dateien und Tresor: Abschnitt „Obsidian“ auf Einstellungen & Hilfe, die Schublade wie gewohnt", () => {
  const css = fs.readFileSync(path.join(VAULT, ".obsidian", "snippets", "eba-core.css"), "utf8");
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ""), /\.workspace-drawer[^{}]*\{[^}]*display:\s*none/);
  const seite = fs.readFileSync(path.join(VAULT, "Studium", "Einstellungen & Hilfe.md"), "utf8");
  assert.match(seite, /## Obsidian\n\n```eba-personalisieren obsidian\n/);
});

test("Oben rechts keine Obsidian-Knöpfe auf iPhone und iPad, am PC und ohne Plugin alles wie gewohnt", () => {
  const css = fs.readFileSync(path.join(VAULT, ".obsidian", "snippets", "eba-core.css"), "utf8");
  const a66 = css.slice(css.indexOf("66. Seitenleiste „Übersicht“"), css.indexOf("Ende Abschnitt 66"));
  const KNOEPFE = [".workspace-tab-header-tab-list", ".sidebar-toggle-button.mod-right", ".view-action.mod-bookmark",
    ".view-actions > .view-action:has(> .lucide-more-vertical)"];
  for (const k of KNOEPFE) assert.ok(a66.includes(`body.eba-plugin-an.is-mobile ${k}`), k);
  const ohneKommentare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const regeln = ohneKommentare.match(/[^{}]*(?:tab-header-tab-list|mod-right|mod-bookmark|lucide-more-vertical)[^{}]*\{[^}]*display:\s*none[^}]*\}/g) || [];
  assert.ok(regeln.length > 0);
  for (const regel of regeln) {
    for (const sel of regel.slice(0, regel.indexOf("{")).split(",")) {
      assert.ok(sel.trim().startsWith("body.eba-plugin-an.is-mobile "), sel.trim());
    }
  }
  // Lesen/Bearbeiten bleibt (Obsidians Knopf dafür heißt modeButtonEl und hat sonst keine Klasse)
  assert.doesNotMatch(ohneKommentare, /lucide-(?:book-open|edit-3)[^{]*\{[^}]*display:\s*none/);
});

test("Menü hinter ≡: rechts bündig mit der Leiste, 8 px darüber, höchstens bis unter die Statusleiste", () => {
  const { menueLage, RAND, MIN_HOEHE } = seitenleiste;
  const leiste = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height });
  // Gemessen im Emulator: iPhone 390 × 844, Obsidians Leiste 37–353 ab 760, Statusleiste 59 px
  assert.deepEqual(menueLage(leiste(37, 760, 316, 52), 390, 844, 59), { rechts: 37, unten: 92, max: 681 });
  // iPad 1376 × 1032: nur das ≡, rund, 32 px vom rechten und vom unteren Rand
  assert.deepEqual(menueLage(leiste(1292, 948, 52, 52), 1376, 1032, 24), { rechts: 32, unten: 92, max: 904 });
  assert.equal(menueLage(leiste(340, 760, 52, 52), 390, 844, 0).rechts, RAND, "nie bis an den Rand");
  assert.equal(menueLage(leiste(37, 200, 316, 52), 390, 844, 59).max, MIN_HOEHE, "wenig Platz: so hoch, dann scrollt es");
});

test("iPhone und iPad: Tipp auf Obsidians ≡ öffnet das Menü, auch nachdem Obsidian ihn zurücksetzt; abgemeldet gehört er Obsidian", () => {
  const vorher = { window: global.window, document: global.document };
  const knoten = () => ({ attr: {}, kinder: [], setAttribute(k, v) { this.attr[k] = String(v); }, appendChild(c) { this.kinder.push(c); } });
  global.document = { createElementNS: knoten };
  // Obsidians updateRibbonMenuItem (1.14.5) setzt Tipp und Symbol, nicht die Beschriftung
  class Leiste { updateRibbonMenuItem() { this.onRibbonMenuClick = this.obsidians; this.ribbonMenuItemEl.symbol = "Obsidians"; } }
  const lauf = (isMobile, name) => {
    const n = new Leiste();
    n.obsidians = () => "Obsidians Menü";
    n.onRibbonMenuClick = n.obsidians;
    n.ribbonMenuItemEl = Object.assign(knoten(), {
      empty() { this.kinder = []; },
      getAttribute(k) { return k in this.attr ? this.attr[k] : null; },
      removeAttribute(k) { delete this.attr[k]; },
    });
    if (name !== undefined) n.ribbonMenuItemEl.setAttribute("aria-label", name);
    const aufraeumen = [];
    global.window = { app: { mobileNavbar: n, workspace: { getLeavesOfType: () => [] } } };
    seitenleiste({
      obsidian: { ItemView: class {}, Platform: { isMobile }, addIcon() {} }, plugin: { registerView() {} }, user: {},
      aufraeumen: (f) => aufraeumen.push(f), entprellen: (f) => f, an() {}, zeit() {}, dom() {},
    }).registrieren();
    return { n, aufraeumen };
  };
  try {
    const { n, aufraeumen } = lauf(true);
    assert.notEqual(n.onRibbonMenuClick, n.obsidians, "≡ öffnet das Menü");
    n.updateRibbonMenuItem(); // so beim Start und wenn sich „Quick ribbon item“ ändert
    assert.notEqual(n.onRibbonMenuClick, n.obsidians, "auch danach");
    for (const f of aufraeumen) f();
    assert.equal(n.onRibbonMenuClick, n.obsidians, "abgemeldet: Obsidians Tipp");
    assert.ok(!Object.prototype.hasOwnProperty.call(n, "updateRibbonMenuItem"), "Obsidians Methode wieder aus dem Prototyp");
    assert.ok(!("aria-label" in n.ribbonMenuItemEl.attr), "ohne eigene Beschriftung vorher: keine danach (nicht mehr „Seiten“)");
    assert.equal(n.ribbonMenuItemEl.symbol, "Obsidians", "Obsidians Symbol zurück");
    const mit = lauf(true, "Menü");
    assert.equal(mit.n.ribbonMenuItemEl.attr["aria-label"], "Seiten", "übernommen: „Seiten“");
    for (const f of mit.aufraeumen) f();
    assert.equal(mit.n.ribbonMenuItemEl.attr["aria-label"], "Menü", "abgemeldet: die Beschriftung von vorher");
  } finally {
    global.window = vorher.window;
    global.document = vorher.document;
  }
});

// Wischen nach rechts (Rückmeldung vom 26.10.2026: „Swiping from the left shouldn't open the sidebar but do the same as the back arrow“).
// Geste und Ablauf wie in Obsidians app.js 1.14.5: workspace.trigger("swipe", g), beim Loslassen finish(x, y, Hochrechnung).
test("Zurück nur vom linken Rand: Streifen von ZURUECK_RAND ab dem sicheren Rand, so breit wie RAND im Wochenraster", () => {
  const { amRand, ZURUECK_RAND } = seitenleiste;
  const z = { richtung: 1, breite: 390, sicher: 0 };
  assert.equal(amRand(0, z), true);
  assert.equal(amRand(ZURUECK_RAND - 1, z), true);
  assert.equal(amRand(ZURUECK_RAND, z), false, "weiter innen: nichts");
  assert.equal(amRand(200, z), false, "mitten auf der Seite, etwa auf einem Kasten im Wochenraster oder einer breiten Tabelle");
  const quer = { richtung: 1, breite: 844, sicher: 47 };
  assert.equal(amRand(47 + ZURUECK_RAND - 1, quer), true, "iPhone quer: ab dem sicheren Rand neben der Notch");
  assert.equal(amRand(47 + ZURUECK_RAND, quer), false);
  const rtl = { richtung: -1, breite: 390, sicher: 0 };
  assert.equal(amRand(390 - ZURUECK_RAND + 1, rtl), true, "Sprachen von rechts nach links: rechter Rand");
  assert.equal(amRand(20, rtl), false);
  assert.equal(amRand(undefined, z), false);
  // Das Wochenraster blättert ab RAND (woche.js); Zurück gehört der Streifen davor, ohne Spalt (beide ab dem sicheren Rand,
  // Pixel für Pixel in tests/wochenraster.test.js)
  const woche = fs.readFileSync(path.join(SKRIPTE, "woche.js"), "utf8");
  assert.equal(Number((woche.match(/const RAND = (\d+);/) || [])[1]), ZURUECK_RAND);
});

test("Wischen nach rechts: nur die Geste, die die linke Seitenleiste aufzöge; zurück erst, wenn weit genug", () => {
  const { zurueckGeste, zurueckWeit, WISCH_MIN, WISCH_WEIT } = seitenleiste;
  const geste = (x, o = {}) => Object.assign({ points: 1, direction: "x", startX: 100, startY: 400, x, registerCallback() {} }, o);
  // iPhone 390 × 844 wie im Emulator, sicherer Rand unten 34 px
  const z = { bereit: true, richtung: 1, linksZu: true, rechtsZu: true, phone: true, hoehe: 844, unten: 34 };
  const mit = (o) => Object.assign({}, z, o);
  assert.equal(zurueckGeste(geste(104), z), true, "ein Finger nach rechts: da zöge Obsidian die linke Seitenleiste auf");
  assert.equal(zurueckGeste(geste(96), z), false, "nach links: die rechte Seitenleiste wie gewohnt");
  assert.equal(zurueckGeste(geste(104, { points: 2 }), z), false, "zwei Finger: Obsidians Zurück und Vor");
  assert.equal(zurueckGeste(geste(104, { direction: "y" }), z), false, "senkrecht: Scrollen und Herunterziehen");
  assert.equal(zurueckGeste(geste(104), mit({ rechtsZu: false })), false, "rechte Seitenleiste offen: Wischen schließt sie");
  assert.equal(zurueckGeste(geste(104), mit({ linksZu: false })), false, "linke offen: Wischen gehört ihr");
  assert.equal(zurueckGeste(geste(104), mit({ bereit: false })), false, "Obsidian lädt noch");
  assert.equal(zurueckGeste(geste(104, { startY: 820 }), z), false, "iPhone, im sicheren Rand unten: dort tut Obsidian nichts");
  assert.equal(zurueckGeste(geste(104, { startY: 820 }), mit({ phone: false })), true, "iPad: auch unten");
  assert.equal(zurueckGeste(geste(96), mit({ richtung: -1 })), true, "Sprachen von rechts nach links: gespiegelt");
  for (const feld of ["x", "startX", "startY", "registerCallback"]) {
    const g = geste(104);
    delete g[feld];
    assert.equal(zurueckGeste(g, z), false, "Obsidian hat die Geste umgebaut (" + feld + "): dann wie Obsidian");
  }
  assert.equal(zurueckGeste(null, z), false);
  assert.equal(zurueckWeit(WISCH_MIN, WISCH_WEIT), true);
  assert.equal(zurueckWeit(160, 180), true, "langsam und weit");
  assert.equal(zurueckWeit(45, 400), true, "kurz und schnell");
  assert.equal(zurueckWeit(10, 300), false, "Blättern im Wochenraster: Obsidian sieht davon nur die ersten 10 px");
  assert.equal(zurueckWeit(80, 60), false, "weit gewischt, aber zurückgezogen");
});

// Herunterziehen (Rückmeldung vom 26.10.2026: „Remove access to command palette via swiping down. No users uses it it opens often by mistake.“)
// Hinweis beim Wischen (Rückmeldung vom 27.10.2026: „Ich hab nur die eine spezifische Pille nicht gemocht“): Obsidians eigener von Zurück
// mit zwei Fingern, gerechnet wie in app.js 1.14.5, nur ganz da bei WISCH_WEIT statt 90 px
test("Hinweis beim Wischen: rutscht mit dem Finger herein, aktiv ab der Strecke, ab der ein langsames Wischen zurückgeht", () => {
  const { hinweisLage, zurueckWeit, WISCH_WEIT } = seitenleiste;
  assert.deepEqual(hinweisLage(0, 1, 120), { anteil: 0, aktiv: false, x: -120, ende: -144, dauer: 0 }, "noch ganz hinter der linken Kante");
  assert.deepEqual(hinweisLage(WISCH_WEIT / 2, 1, 120), { anteil: 0.5, aktiv: false, x: -60, ende: -144, dauer: 50 });
  assert.deepEqual(hinweisLage(WISCH_WEIT, 1, 120), { anteil: 1, aktiv: true, x: 0, ende: -144, dauer: 100 }, "ganz da und aktiv");
  assert.deepEqual(hinweisLage(3 * WISCH_WEIT, 1, 120), hinweisLage(WISCH_WEIT, 1, 120), "weiter gewischt: bleibt an der Kante");
  assert.deepEqual(hinweisLage(-30, 1, 120), hinweisLage(0, 1, 120), "zurückgezogen: wieder hinter der Kante");
  assert.deepEqual(hinweisLage(WISCH_WEIT / 2, -1, 120), { anteil: 0.5, aktiv: false, x: 60, ende: 144, dauer: 50 },
    "Sprachen von rechts nach links: von rechts, wie bei Obsidian");
  // Langsam (Hochrechnung etwa der Weg): aktiv genau dann, wenn es beim Loslassen zurückgeht
  for (let w = 0; w <= 2 * WISCH_WEIT; w += 5) assert.equal(hinweisLage(w, 1, 120).aktiv, zurueckWeit(w, w), w + " px");
  // Kurz und schnell: zurück, ohne dass er ganz da war
  assert.equal(zurueckWeit(45, 400), true);
  assert.equal(hinweisLage(45, 1, 120).aktiv, false);
});

test("Hinweis beim Wischen: steht nur während der Geste da, nach Zurück, zu kurz, Abbrechen und Abmelden weg; ohne Befehl zurück ohne ihn", () => {
  const vorher = { window: global.window, document: global.document, getComputedStyle: global.getComputedStyle };
  const hinweise = [];
  const el = () => ({ createDiv: el, setAttribute() {}, appendChild() {}, addEventListener() {}, remove() {} });
  // Ein Hinweis wie von Obsidians createDiv: Klassen, Text, Stil, Breite; remove() nimmt ihn aus dem Dokument
  const hinweisEl = (o) => {
    const h = {
      cls: o.cls, text: o.text, style: {}, offsetWidth: 120, klassen: new Set(), drin: true, on: {},
      toggleClass(k, an) { if (an) this.klassen.add(k); else this.klassen.delete(k); },
      getBoundingClientRect() { return {}; }, addEventListener(t, f) { this.on[t] = f; }, remove() { this.drin = false; },
    };
    hinweise.push(h);
    return h;
  };
  class Workspace { trigger(...a) { this.protokoll.push("obsidian " + a[0]); } }
  const lauf = (befehle, mitDiv = true) => {
    const aufraeumen = [], uhren = new Map(), ws = new Workspace();
    let n = 0;
    Object.assign(ws, {
      protokoll: [], layoutReady: true, leftSplit: { collapsed: true }, rightSplit: { collapsed: true },
      rootSplit: { containerEl: { contains: (x) => x === "haupt" } }, getLeavesOfType: () => [],
      activeLeaf: { history: { go: (k) => { ws.protokoll.push("go " + k); return Promise.resolve(); } } },
    });
    global.window = { app: { workspace: ws, commands: befehle }, innerHeight: 1032 };
    global.document = { body: Object.assign(el(), { classList: { contains: () => false }, createDiv: mitDiv ? hinweisEl : undefined }), createElementNS: el };
    global.getComputedStyle = () => ({ getPropertyValue: () => "0px" });
    seitenleiste({
      obsidian: { ItemView: class {}, Platform: { isMobile: true, isPhone: false }, addIcon() {} }, plugin: { registerView() {} }, user: {},
      aufraeumen: (f) => aufraeumen.push(f), entprellen: (f) => f, an() {}, dom() {},
      zeit: (f, ms) => { n += 1; uhren.set(n, { f, ms }); return n; }, stopp: (id) => uhren.delete(id),
    }).registrieren();
    // Alle fälligen Uhren laufen lassen (auch die, die eine Uhr neu stellt)
    const uhrenLaufen = () => { while (uhren.size) { const [id, u] = uhren.entries().next().value; uhren.delete(id); u.f(); } };
    return { ws, uhrenLaufen, abmelden: () => { for (const f of aufraeumen) f(); } };
  };
  // Eine Geste wie von Obsidian, am linken Rand begonnen (START); weiter innen gibt es keinen Hinweis
  const START = 10;
  const wischen = (ws, start = START) => {
    const rueck = [];
    ws.trigger("swipe", { points: 1, direction: "x", startX: start, startY: 400, x: start + 4, targetEl: "haupt", registerCallback: (r) => rueck.push(r) });
    return rueck[0];
  };
  // Obsidian auf Englisch: der Hinweis bleibt deutsch
  const BEFEHLE = { findCommand: (id) => (id === "app:go-back" ? { id, name: "Navigate back" } : null) };
  try {
    let { ws, uhrenLaufen, abmelden } = lauf(BEFEHLE);
    // Zurück: herein mit dem Finger, aktiv ab WISCH_WEIT, beim Loslassen hinaus und weg
    let r = wischen(ws);
    let h = hinweise[0];
    assert.equal(h.cls, "pull-action pull-out-action", "Obsidians Hinweis, mit Obsidians Stil");
    assert.equal(h.text, "Zurück", "deutsch wie das Plugin, nicht Obsidians Name des Befehls (Rückmeldung: „Zurück anstatt navigate back“)");
    assert.equal(h.style.left, "0");
    r.move(START + 50, 400);
    assert.equal(h.style.transform, "translateX(-60px)");
    assert.ok(!h.klassen.has("mod-activated"));
    r.move(START + 100, 400);
    assert.equal(h.style.transform, "translateX(0px)");
    assert.ok(h.klassen.has("mod-activated"), "ganz da: aktiv");
    r.move(START + 80, 400);
    assert.ok(!h.klassen.has("mod-activated"), "zurückgezogen: nicht mehr aktiv");
    r.finish(START + 160, 400, 180);
    assert.deepEqual(ws.protokoll, ["go -1"]);
    assert.ok(h.drin, "gleitet erst hinaus");
    uhrenLaufen();
    assert.equal(h.style.transition, "all 100ms ease-in-out");
    assert.equal(h.style.transform, "translateX(-144px)");
    assert.ok(!h.drin, "danach weg");
    // Zu kurz: kein Zurück, der Hinweis gleitet hinaus und ist weg
    ws.protokoll.length = 0;
    r = wischen(ws);
    h = hinweise[1];
    r.move(START + 20, 400);
    r.finish(START + 20, 400, 30);
    uhrenLaufen();
    assert.deepEqual(ws.protokoll, []);
    assert.ok(!h.drin);
    // Abgebrochen (etwa ein zweiter Finger): sofort weg
    r = wischen(ws);
    h = hinweise[2];
    r.move(START + 50, 400);
    r.cancel();
    assert.ok(!h.drin);
    // Abmelden mitten in der Geste und während des Hinausgleitens: weg
    const mitten = wischen(ws);
    mitten.move(START + 50, 400);
    r = wischen(ws);
    r.move(START + 50, 400);
    r.finish(START + 160, 400, 180);
    abmelden();
    assert.ok(!hinweise[3].drin && !hinweise[4].drin, "nichts bleibt im Dokument");
    ws.protokoll.length = 0;
    mitten.move(START + 120, 400);
    mitten.finish(START + 160, 400, 180);
    uhrenLaufen();
    assert.deepEqual(ws.protokoll, [], "abgemeldet: eine Geste, die noch lief, geht nicht mehr zurück");
    assert.ok(!hinweise[3].drin && hinweise.length === 5, "und zeigt keinen Hinweis mehr");
    // Mitten auf der Seite: kein Hinweis
    ({ ws, uhrenLaufen, abmelden } = lauf(BEFEHLE));
    let zahl = hinweise.length;
    assert.equal(wischen(ws, 200), undefined);
    assert.equal(hinweise.length, zahl, "nur vom Rand");
    abmelden();
    // Ohne Obsidians Befehle derselbe Hinweis; ohne createDiv keiner, zurück trotzdem
    ({ ws, uhrenLaufen, abmelden } = lauf(undefined));
    wischen(ws).finish(START + 160, 400, 180);
    assert.equal(hinweise[hinweise.length - 1].text, "Zurück");
    assert.deepEqual(ws.protokoll, ["go -1"]);
    abmelden();
    ({ ws, uhrenLaufen, abmelden } = lauf(BEFEHLE, false));
    zahl = hinweise.length;
    wischen(ws).finish(START + 160, 400, 180);
    assert.equal(hinweise.length, zahl, "kein Hinweis");
    assert.deepEqual(ws.protokoll, ["go -1"], "zurück wie ‹");
    abmelden();
    assert.ok(hinweise.every((x) => !x.drin));
  } finally {
    global.window = vorher.window;
    global.document = vorher.document;
    global.getComputedStyle = vorher.getComputedStyle;
  }
});

test("Herunterziehen: dieselbe Regel wie Obsidians Schnellaktion (ein Finger, senkrecht, nicht nach oben)", () => {
  const { herunterGeste } = seitenleiste;
  const geste = (y, o = {}) => Object.assign({ points: 1, direction: "y", startX: 200, startY: 250, x: 200, y }, o);
  const z = { bereit: true };
  assert.equal(herunterGeste(geste(270), z), true, "nach unten: da zeigte Obsidian den Hinweis und öffnete die Befehlspalette");
  assert.equal(herunterGeste(geste(250), z), true, "noch auf der Stelle: Obsidian nimmt sie auch");
  assert.equal(herunterGeste(geste(230), z), false, "nach oben: nicht die Schnellaktion");
  assert.equal(herunterGeste(geste(270, { direction: "x" }), z), false, "waagerecht: Zurück und Seitenleisten");
  assert.equal(herunterGeste(geste(270, { points: 2 }), z), false);
  assert.equal(herunterGeste(geste(270), { bereit: false }), false, "Obsidian lädt noch");
  for (const feld of ["y", "startY"]) {
    const g = geste(270);
    delete g[feld];
    assert.equal(herunterGeste(g, z), false, "Obsidian hat die Geste umgebaut (" + feld + "): dann wie Obsidian");
  }
  assert.equal(herunterGeste(null, z), false);
});

test("Wischen nach rechts geht zurück wie ‹ (history.go(-1)), Herunterziehen tut nichts; sonst Obsidian, abgemeldet und am PC unberührt", () => {
  const vorher = { window: global.window, document: global.document, getComputedStyle: global.getComputedStyle };
  const el = () => ({ createDiv: el, setAttribute() {}, getAttribute: () => null, setText() {}, appendChild() {}, addEventListener() {}, remove() {} });
  class Workspace { trigger(...a) { this.protokoll.push("obsidian " + a[0]); } }
  const lauf = (isMobile, felder = {}) => {
    const aufraeumen = [], ws = new Workspace();
    Object.assign(ws, {
      protokoll: [], layoutReady: true, leftSplit: { collapsed: true }, rightSplit: { collapsed: true },
      rootSplit: { containerEl: { contains: (x) => x === "haupt", appendChild() {} } }, getLeavesOfType: () => [],
      activeLeaf: { history: { go: (n) => { ws.protokoll.push("go " + n); return Promise.resolve(); } } },
    }, felder);
    global.window = { app: { workspace: ws }, innerHeight: 844 };
    global.document = { body: Object.assign(el(), { classList: { contains: () => false } }), createElementNS: el };
    global.getComputedStyle = () => ({ getPropertyValue: () => "34px" });
    seitenleiste({
      obsidian: { ItemView: class {}, Platform: { isMobile, isPhone: isMobile }, addIcon() {} }, plugin: { registerView() {} }, user: {},
      aufraeumen: (f) => aufraeumen.push(f), entprellen: (f) => f, an() {}, zeit() {}, dom() {},
    }).registrieren();
    return { ws, abmelden: () => { for (const f of aufraeumen) f(); } };
  };
  // Eine Geste wie von Obsidian: Start am linken Rand (START, sonst start), erste Bewegung um dx; liefert die angemeldeten Rückrufe
  const START = 10;
  const wischen = (ws, dx, wo = "haupt", start = START) => {
    const rueck = [];
    ws.trigger("swipe", { points: 1, direction: "x", startX: start, startY: 400, x: start + dx, targetEl: wo, registerCallback: (r) => rueck.push(r) });
    return rueck;
  };
  const ziehen = (ws, y, wo = "haupt") => {
    const rueck = [];
    ws.trigger("swipe", { points: 1, direction: "y", startX: 200, startY: 400, x: 200, y, targetEl: wo, registerCallback: (r) => rueck.push(r) });
    return rueck;
  };
  try {
    let { ws, abmelden } = lauf(true);
    assert.ok(Object.prototype.hasOwnProperty.call(ws, "trigger"), "Hülle an der Instanz");
    let r = wischen(ws, 4);
    assert.equal(r.length, 1, "statt der Seitenleiste ein eigener Rückruf");
    assert.deepEqual(ws.protokoll, [], "Obsidians Hörer bekommen diese Geste nicht: keine Seitenleiste");
    r[0].move(START + 50, 400);
    r[0].finish(START + 20, 400, 30);
    assert.deepEqual(ws.protokoll, [], "zu kurz: nichts");
    r = wischen(ws, 4);
    r[0].finish(START + 160, 400, 180);
    assert.deepEqual(ws.protokoll, ["go -1"], "weit genug: eine Seite zurück, derselbe Weg wie ‹");
    ws.protokoll.length = 0;
    assert.deepEqual(wischen(ws, 4, "seitenleiste"), [], "außerhalb der Hauptfläche: weder zurück noch Seitenleiste");
    assert.deepEqual(wischen(ws, 4, "haupt", 200), [], "mitten auf der Seite: weder zurück noch Seitenleiste (Rückmeldung: „Nur vom linken Rand“)");
    assert.deepEqual(ws.protokoll, []);
    wischen(ws, -4);
    ws.trigger("layout-change");
    assert.deepEqual(ws.protokoll, ["obsidian swipe", "obsidian layout-change"], "nach links und alle anderen Ereignisse wie gewohnt");
    ws.protokoll.length = 0;
    // Herunterziehen oben auf der Seite: kein Hinweis, keine Befehlspalette, kein eigener Rückruf
    assert.deepEqual(ziehen(ws, 430), [], "nach unten in der Hauptfläche");
    assert.deepEqual(ws.protokoll, [], "Obsidians Schnellaktion bekommt die Geste nicht");
    ziehen(ws, 370);
    ziehen(ws, 430, "seitenleiste");
    assert.deepEqual(ws.protokoll, ["obsidian swipe", "obsidian swipe"], "nach oben und außerhalb der Hauptfläche wie gewohnt");
    ws.protokoll.length = 0;
    ws.leftSplit = { collapsed: false, isPinned: true };
    wischen(ws, 4)[0].finish(START + 160, 400, 180);
    assert.deepEqual(ws.protokoll, ["go -1"], "angeheftete Seitenleiste zählt wie eine geschlossene (auf dem iPad liegt am Rand dann aber sie, siehe Doku)");
    abmelden();
    assert.ok(!Object.prototype.hasOwnProperty.call(ws, "trigger"), "abgemeldet: Obsidians trigger aus dem Prototyp");
    ws.protokoll.length = 0;
    wischen(ws, 4);
    ziehen(ws, 430);
    assert.deepEqual(ws.protokoll, ["obsidian swipe", "obsidian swipe"]);

    ({ ws, abmelden } = lauf(true, { activeLeaf: null }));
    wischen(ws, 4);
    assert.deepEqual(ws.protokoll, ["obsidian swipe"], "kein Tab mit Verlauf: wie Obsidian");
    assert.deepEqual(ziehen(ws, 430), []);
    assert.deepEqual(ws.protokoll, ["obsidian swipe"], "Herunterziehen tut auch ohne Verlauf nichts");
    ({ ws, abmelden } = lauf(true, { rootSplit: null }));
    wischen(ws, 4);
    assert.deepEqual(ws.protokoll, ["obsidian swipe"], "Obsidian umgebaut: wie Obsidian");
    const fehler = console.error;
    console.error = () => {};
    try {
      ({ ws, abmelden } = lauf(true, { rootSplit: { containerEl: { contains: () => { throw new Error("umgebaut"); } } } }));
      wischen(ws, 4);
    } finally {
      console.error = fehler;
    }
    assert.deepEqual(ws.protokoll, ["obsidian swipe"], "Fehler beim Entscheiden: wie Obsidian");

    // Hat jemand trigger nach uns umhüllt, bleibt dessen Hülle beim Abmelden, unsere reicht nur noch durch
    ({ ws, abmelden } = lauf(true));
    const unsere = ws.trigger;
    const fremd = function (...a) { return unsere.apply(this, a); };
    ws.trigger = fremd;
    abmelden();
    assert.equal(ws.trigger, fremd);
    wischen(ws, 4);
    assert.deepEqual(ws.protokoll, ["obsidian swipe"]);

    ({ ws } = lauf(false));
    assert.ok(!Object.prototype.hasOwnProperty.call(ws, "trigger"), "PC: unberührt");
  } finally {
    global.window = vorher.window;
    global.document = vorher.document;
    global.getComputedStyle = vorher.getComputedStyle;
  }
});

test("Zahnrad hinter Obsidians „+“: wie dessen Knöpfe, öffnet Einstellungen & Hilfe, die dann im Menü fehlt; ohne „+“ kein Zahnrad", () => {
  const vorher = { window: global.window, document: global.document };
  const el = (tag) => ({
    tag, className: "", attr: {}, kinder: [], on: {},
    setAttribute(k, v) { this.attr[k] = v; }, appendChild(k) { this.kinder.push(k); return k; },
    addEventListener(t, f) { this.on[t] = f; }, remove() { this.weg = true; }, after(k) { this.danach = k; },
  });
  global.document = { createElement: el, createElementNS: (ns, tag) => el(tag) };
  const lauf = (plus) => {
    const geoeffnet = [], aufraeumen = [];
    global.window = { app: {
      mobileNavbar: { containerEl: { querySelector: (s) => (s === ".mobile-navbar-action-new-tab" ? plus : null) } },
      workspace: { getLeavesOfType: () => [] },
      metadataCache: { getFirstLinkpathDest: (ziel) => ({ path: ziel }) },
    } };
    seitenleiste({
      obsidian: { ItemView: class {}, Platform: { isMobile: true }, addIcon() {} }, plugin: { registerView() {} }, user: {},
      oeffnen: (d) => { geoeffnet.push(d.path); return Promise.resolve(); },
      aufraeumen: (f) => aufraeumen.push(f), entprellen: (f) => f, an() {}, zeit() {}, dom() {},
    }).registrieren();
    return { geoeffnet, aufraeumen };
  };
  try {
    const plus = el("div");
    const { geoeffnet, aufraeumen } = lauf(plus);
    const z = plus.danach;
    assert.ok(z, "gleich hinter „+“, das bleibt");
    assert.equal(z.className, "mobile-navbar-action eba-nav-zahnrad");
    assert.equal(z.kinder[0].className, "clickable-icon", "Markup wie Obsidians Knöpfe: gleiches Aussehen, gleiche Rückmeldung");
    assert.equal(z.kinder[0].attr["aria-label"], "Einstellungen & Hilfe");
    assert.match(z.kinder[0].kinder[0].attr.class, /^svg-icon lucide-settings$/);
    z.on.click({ preventDefault() {} });
    assert.deepEqual(geoeffnet, ["Einstellungen & Hilfe"]);
    for (const f of aufraeumen) f();
    assert.ok(z.weg, "abgemeldet weg");
    assert.doesNotThrow(() => lauf(null), "Obsidian hat die Leiste umgebaut: dann kein Zahnrad");
  } finally {
    global.window = vorher.window;
    global.document = vorher.document;
  }
  // Im Menü fehlt die Seite nur, solange das Zahnrad dasteht; ohne Zahnrad (der Tab aus früheren Fassungen) alle Seiten
  const code = fs.readFileSync(path.join(SKRIPTE, "seitenleiste.js"), "utf8");
  assert.match(code, /const menueOhne = \(\) => \(zahnrad \? \[EINSTELLUNGEN\] : \[\]\);/);
  assert.match(code, /zahnrad = k;\n {4}ctx\.aufraeumen\(\(\) => \{ k\.remove\(\); zahnrad = null; \}\);/);
  assert.match(code, /zeichnen\(this\.contentEl\)/);
  assert.equal(zeichnen().kinder[0].kinder.length, ZIELE.length, "ohne Zahnrad: alle Seiten");
});

// Rückmeldung vom 27.10.2026: „iPad und iPhone und pc die gleichen 7 Symbole“ (am PC standen bis dahin nur Zahnrad und ≡)
test("PC: eigene Leiste unten rechts mit denselben sieben Knöpfen wie auf iPhone und iPad, auch mit der Tastatur; Obsidians Leiste unberührt", () => {
  const vorher = { window: global.window, document: global.document };
  const el = (tag, o = {}) => ({
    tag, cls: o.cls || "", attr: Object.assign({}, o.attr), kinder: [], on: {}, text: "",
    createDiv(x) { const k = el("div", x); this.kinder.push(k); return k; },
    setAttribute(k, v) { this.attr[k] = v; }, getAttribute(k) { return k in this.attr ? this.attr[k] : null; },
    appendChild(k) { this.kinder.push(k); return k; }, setText(t) { this.text = t; },
    get classList() { const e = this; return { contains: (c) => e.cls.split(" ").includes(c) }; },
    addEventListener(t, f) { this.on[t] = f; }, remove() { this.weg = true; },
    getBoundingClientRect: () => ({ left: 1336, top: 816, width: 40, height: 40 }),
  });
  global.document = { body: el("body"), createElementNS: (ns, tag) => el(tag) };
  const geoeffnet = [], befehle = [], gesucht = [], gewechselt = [], menues = [], aufraeumen = [], ereignisse = {};
  const navbar = { onRibbonMenuClick: "Obsidians" };
  const verlauf = { backHistory: [{}], forwardHistory: [], gegangen: [], go(n) { this.gegangen.push(n); return Promise.resolve(); } };
  const blaetter = [{ view: { getDisplayText: () => "Dashboard", getIcon: () => "lucide-file" } }, { view: { getDisplayText: () => "B110", getIcon: () => "lucide-file" } }];
  const vorn = Object.assign(blaetter[1], { history: verlauf });
  const ws = {
    getLeavesOfType: () => [], rootSplit: { containerEl: el("div") }, getMostRecentLeaf: (wo) => (wo === ws.rootSplit ? vorn : null),
    iterateRootLeaves: (f) => { for (const b of blaetter) f(b); }, setActiveLeaf: (b, o) => gewechselt.push([b.view.getDisplayText(), o]),
  };
  global.window = { app: {
    mobileNavbar: navbar, workspace: ws, commands: { executeCommandById: (id) => befehle.push(id) },
    internalPlugins: { getPluginById: (id) => (id === "switcher" ? { instance: { onOpen: () => gesucht.push("Schnellwechsler") } } : null) },
    metadataCache: { getFirstLinkpathDest: (ziel) => ({ path: ziel }) },
  } };
  // Obsidians Menü (nur, was die Leiste braucht)
  class Menu {
    constructor() { this.eintraege = []; menues.push(this); this.dom = { isConnected: true, offsetHeight: 64, style: {} }; }
    addItem(f) {
      const e = { setTitle(t) { this.titel = t; return this; }, setIcon(i) { this.symbol = i; return this; }, setChecked(c) { this.haken = c; return this; }, onClick(g) { this.los = g; return this; } };
      f(e);
      this.eintraege.push(e);
      return this;
    }
    setParentElement(p) { this.eltern = p; return this; }
    showAtPosition(o) { this.lage = o; return this; }
  }
  try {
    seitenleiste({
      obsidian: { ItemView: class {}, Platform: { isMobile: false }, addIcon() {}, Menu }, plugin: { registerView() {} }, user: {},
      oeffnen: (d) => { geoeffnet.push(d.path); return Promise.resolve(); },
      aufraeumen: (f) => aufraeumen.push(f), entprellen: (f) => f, an: (q, typ, f) => { ereignisse[typ] = f; }, zeit() {}, dom() {},
    }).registrieren();
    const leiste = ws.rootSplit.containerEl.kinder[0];
    assert.equal(leiste.cls, "eba-nav-leiste");
    assert.deepEqual(leiste.kinder.map((k) => [k.cls, k.attr["aria-label"], k.attr.role, k.attr.tabindex]), [
      ["clickable-icon eba-nav-zurueck", "Zurück", "button", "0"], ["clickable-icon eba-nav-vor", "Vor", "button", "0"],
      ["clickable-icon eba-nav-suche", "Suche", "button", "0"], ["clickable-icon eba-nav-neu", "Neuer Tab", "button", "0"],
      ["clickable-icon eba-nav-zahnrad", "Einstellungen & Hilfe", "button", "0"], ["clickable-icon eba-nav-tabs", "Tabs, 2 offen", "button", "0"],
      ["clickable-icon eba-nav-seiten", "Seiten", "button", "0"],
    ], "‹ › Suche + Zahnrad Tabs ≡ wie auf iPhone und iPad (Zahnrad und ≡: die Klassen findet der Rundgang)");
    assert.deepEqual(leiste.kinder.map((k) => k.kinder[0].attr.class), ["svg-icon lucide-chevron-left", "svg-icon lucide-chevron-right",
      "svg-icon lucide-search", "svg-icon lucide-plus", "svg-icon lucide-settings", "svg-icon tab-frame", "svg-icon lucide-menu"]);
    const [zurueck, vor, suche, neu, zahnrad, tabs] = leiste.kinder;
    const taste = (k, key) => { const e = { key, type: "keydown", verhindert: false, preventDefault() { this.verhindert = true; } }; k.on.keydown(e); return e; };
    // Zurück und Vor: Verlauf des Tabs vorn in der Hauptfläche, ohne Verlauf ausgegraut und ohne Wirkung
    assert.equal(zurueck.attr["aria-disabled"], "false");
    assert.equal(vor.attr["aria-disabled"], "true", "noch nichts vor");
    zurueck.on.click({ type: "click" });
    vor.on.click({ type: "click" });
    assert.ok(taste(zurueck, "Enter").verhindert, "Enter, ohne dass die Seite darunter etwas tut");
    assert.deepEqual(verlauf.gegangen, [-1, -1]);
    verlauf.forwardHistory.push({});
    ereignisse["file-open"]();
    assert.equal(vor.attr["aria-disabled"], "false", "neu nach dem Öffnen einer Seite");
    assert.ok(taste(vor, " ").verhindert, "Leertaste scrollt nicht");
    assert.deepEqual(verlauf.gegangen, [-1, -1, 1]);
    // Suche, „+“, Zahnrad
    suche.on.click({ type: "click" });
    neu.on.click({ type: "click" });
    zahnrad.on.click({ type: "click", preventDefault() {} });
    assert.deepEqual(gesucht, ["Schnellwechsler"], "Obsidians Schnellwechsler wie die Suche auf iPhone und iPad");
    assert.deepEqual(befehle, ["workspace:new-tab"]);
    assert.deepEqual(geoeffnet, ["Einstellungen & Hilfe"]);
    // Tabs: Zahl im Rahmen, Obsidians Menü mit allen Tabs, Haken am vorderen, über der Leiste rechts bündig mit dem Knopf
    assert.equal(tabs.kinder[1].cls, "eba-nav-tabs-zahl");
    assert.equal(tabs.kinder[1].text, "2");
    tabs.on.click({ type: "click" });
    const m = menues[0];
    assert.deepEqual(m.eintraege.map((e) => [e.titel, e.haken]), [["Dashboard", false], ["B110", true]]);
    assert.equal(m.eltern, tabs);
    assert.deepEqual(m.lage, { x: 1336, y: 806, width: 40, overlap: true, left: true });
    assert.equal(m.dom.style.top, (816 - 8 - 64) + "px", "über der Leiste, nicht darunter");
    m.eintraege[0].los();
    assert.deepEqual(gewechselt, [["Dashboard", { focus: true }]]);
    blaetter.push({ view: { getDisplayText: () => "Neuer Tab", getIcon: () => "lucide-file" } });
    ereignisse["layout-change"]();
    assert.equal(tabs.kinder[1].text, "3", "neu bei layout-change");
    assert.equal(tabs.attr["aria-label"], "Tabs, 3 offen");
    assert.equal(navbar.onRibbonMenuClick, "Obsidians");
    for (const f of aufraeumen) f();
    assert.ok(leiste.weg, "abgemeldet weg");
  } finally {
    global.window = vorher.window;
    global.document = vorher.document;
  }
  const css = fs.readFileSync(path.join(VAULT, ".obsidian", "snippets", "eba-core.css"), "utf8");
  assert.match(css, /\.eba-nav-leiste \{[^}]*position: absolute;[^}]*right: 20px;[^}]*bottom: 40px;[^}]*background: var\(--raised-background\);/,
    "unten rechts in der Hauptfläche über der Statusleiste, Glasfläche wie Obsidians Leiste");
  assert.ok(css.includes('.eba-nav-leiste > .clickable-icon[aria-disabled="true"] { opacity: 0.35;'), "ausgegraut wie die Pfeile beim Schreiben auf dem iPad");
  assert.ok(css.includes(".eba-nav-leiste { max-width: calc(100% - 40px); box-sizing: border-box; flex-wrap: wrap; justify-content: flex-end; }"),
    "schmale Hauptfläche: umbrechen statt über die rechte Seitenleiste ragen");
  const code = fs.readFileSync(path.join(SKRIPTE, "seitenleiste.js"), "utf8");
  assert.doesNotMatch(code, /createLeafInParent|getLeftLeaf/, "kein Tab „Übersicht“ mehr in der linken Seitenleiste");
});

// Gerüst für das Menü hinter ≡ (menueAuf): Elemente wie Obsidians (createDiv, remove, Stil, Rechteck), Hörer über ctx.dom und
// Aufräumen über ctx.aufraeumen gesammelt wie im Kern. document und window haben kein addEventListener: Skripte melden alles
// über ctx.dom an (docs/architektur.md, Regeln für Skript-Autoren), ein direkter Aufruf wirft hier.
const menueUmgebung = (isMobile, o = {}) => {
  const vorher = { window: global.window, document: global.document, getComputedStyle: global.getComputedStyle };
  const el = (tag, x = {}) => ({
    tag, cls: String(x.cls || ""), attr: Object.assign({}, x.attr), kinder: [], style: {}, on: {}, eltern: null,
    rect: { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 },
    createEl(t, y) { const k = el(t, y); k.eltern = this; this.kinder.push(k); return k; },
    createDiv(y) { return this.createEl("div", y); },
    createSpan(y) { return this.createEl("span", y); },
    empty() { this.kinder = []; },
    addClass(c) { this.cls += " " + c; },
    setAttribute(k, v) { this.attr[k] = v; },
    getAttribute(k) { return k in this.attr ? this.attr[k] : null; },
    removeAttribute(k) { delete this.attr[k]; },
    appendChild(k) { k.remove(); k.eltern = this; this.kinder.push(k); return k; },
    insertBefore(k, vor) {
      k.remove();
      k.eltern = this;
      const i = vor ? this.kinder.indexOf(vor) : -1;
      if (i < 0) this.kinder.push(k); else this.kinder.splice(i, 0, k);
      return k;
    },
    get firstChild() { return this.kinder[0] || null; },
    get parentElement() { return this.eltern; },
    addEventListener(t, f) { this.on[t] = f; },
    remove() { if (this.eltern) this.eltern.kinder = this.eltern.kinder.filter((k) => k !== this); this.eltern = null; },
    after(k) { this.danach = k; },
    setText(t) { this.text = t; },
    classList: { contains: () => false },
    querySelector() { return null; },
    // Nachkommen mit einer Klasse (".x") bzw. einem Tag, wie querySelectorAll
    querySelectorAll(sel) {
      const alle = (e) => e.kinder.flatMap((k) => [k, ...alle(k)]);
      return alle(this).filter((k) => (sel.startsWith(".") ? k.cls.split(" ").includes(sel.slice(1)) : k.tag === sel));
    },
    focus() { global.document.activeElement = this; },
    get isConnected() { let e = this; while (e.eltern) e = e.eltern; return e === global.document.body || e === ws.rootSplit.containerEl; },
    getBoundingClientRect() { return this.rect; },
    scrollIntoView() {},
  });
  const body = Object.assign(el("body"), { classList: { k: new Set(), contains(c) { return this.k.has(c); } } });
  body.style = { werte: {}, setProperty(k, v) { this.werte[k] = v; }, removeProperty(k) { delete this.werte[k]; } };
  const hoerer = [], aufraeumen = [], uhren = [], ereignisse = [], entprellt = new Map();
  let oeffnen = () => {};
  global.document = { body, activeElement: null, createElementNS: (ns, t) => el(t), createElement: (t) => el(t) };
  global.getComputedStyle = () => ({ getPropertyValue: () => "0px" });
  class Workspace { trigger() {} }
  const verlauf = [];
  const ws = Object.assign(new Workspace(), {
    layoutReady: true, rootSplit: { containerEl: el("div") }, getMostRecentLeaf: () => null, getLeavesOfType: () => [],
    activeLeaf: { history: { backHistory: [], forwardHistory: [], go: (n) => { verlauf.push(n); return Promise.resolve(); } } },
  });
  const breite = (o.fenster && o.fenster.innerWidth) || 1440;
  ws.rootSplit.containerEl.rect = { left: 0, top: 0, right: breite, bottom: 900, width: breite, height: 900 }; // Hauptfläche: ganzes Fenster
  // Obsidians Werkzeugleiste beim Schreiben (app.mobileToolbar): darin schon die Liste der Befehle
  const werkzeug = isMobile ? { containerEl: el("div") } : undefined;
  if (werkzeug) werkzeug.containerEl.appendChild(el("div", { cls: "mobile-toolbar-options-list-container" }));
  const navbar = isMobile ? {
    containerEl: el("div"), ribbonMenuItemEl: el("span"), restoreNavigation() {}, updateRibbonMenuItem() {}, onRibbonMenuClick() {},
  } : undefined;
  global.window = Object.assign({ innerWidth: 1440, innerHeight: 900, app: {
    workspace: ws, mobileNavbar: navbar, mobileToolbar: werkzeug, metadataCache: { getFirstLinkpathDest: (ziel) => ({ path: ziel }), getFileCache: () => null },
  } }, o.fenster);
  seitenleiste({
    obsidian: { ItemView: class {}, Platform: { isMobile, isPhone: isMobile && !o.tablet, isTablet: !!o.tablet }, addIcon() {} },
    plugin: { registerView() {} }, user: {},
    oeffnen: (datei, opt) => { oeffnen(datei, opt); return Promise.resolve(); }, aufraeumen: (f) => aufraeumen.push(f),
    an: (q, typ, f) => ereignisse.push({ q, typ, f }),
    zeit: (f) => { uhren.push(f); return uhren.length; },
    // Wie ctx.entprellen: der letzte Aufruf zählt, ausgeführt erst später (ruhe())
    entprellen: (f) => { const id = {}; return (...a) => { entprellt.set(id, () => f(...a)); }; },
    dom: (ziel, typ, f, opt) => { hoerer.push({ ziel, typ, f, opt }); return f; },
  }).registrieren();
  return {
    body, navbar, ws, el, werkzeug, verlauf,
    leiste: () => ws.rootSplit.containerEl.kinder.find((k) => k.cls === "eba-nav-leiste"),
    // ≡ der Leiste am PC (der letzte ihrer sieben Knöpfe)
    seiten: () => ws.rootSplit.containerEl.kinder.find((k) => k.cls === "eba-nav-leiste").kinder.find((k) => k.cls.includes("eba-nav-seiten")),
    ereignis: (typ) => { for (const e of ereignisse) if (e.q === ws && e.typ === typ) e.f(); },
    ruhe: () => { const f = [...entprellt.values()]; entprellt.clear(); for (const x of f) x(); },
    menue: () => body.kinder.filter((k) => /\beba-nav-(?:menue|hinter)\b/.test(k.cls)).map((k) => k.cls),
    hoerer: (ziel, typ) => hoerer.filter((h) => h.ziel === ziel && h.typ === typ),
    oeffnen: (f) => { oeffnen = f; },
    abmelden: () => { for (const f of aufraeumen.reverse()) f(); },
    zurueck: () => { global.window = vorher.window; global.document = vorher.document; global.getComputedStyle = vorher.getComputedStyle; },
  };
};

// iPad beim Schreiben: Obsidian nimmt die Leiste weg, solange der Editor den Fokus hat (mobileNavbar.hide), und zeigt seine
// Werkzeugleiste. Bis 27.10.2026 gab es dann keine Navigation (Review-Foto ipad-editor-fokus.png).
test("iPad beim Schreiben: ‹ › vorn in Obsidians Werkzeugleiste, wie dessen Knöpfe, ohne Verlauf ausgegraut; abgemeldet weg", () => {
  const u = menueUmgebung(true);
  try {
    const [gruppe, liste] = u.werkzeug.containerEl.kinder;
    assert.equal(gruppe.className, "mobile-toolbar-floating-options mod-raised eba-nav-werkzeug", "eigene Gruppe vorn, wie Obsidians Knopf für die Tastatur");
    assert.equal(liste.cls, "mobile-toolbar-options-list-container", "Obsidians Befehle danach, unberührt");
    const [zurueck, vor] = gruppe.kinder;
    assert.deepEqual([zurueck, vor].map((k) => [k.className, k.attr["aria-label"], k.kinder[0].attr.class]),
      [["mobile-toolbar-option", "Zurück", "svg-icon lucide-chevron-left"], ["mobile-toolbar-option", "Vor", "svg-icon lucide-chevron-right"]]);
    let behalten = false;
    zurueck.on.mousedown({ preventDefault() { behalten = true; } });
    assert.ok(behalten, "mousedown ohne Folgen: der Editor behält den Fokus, die Werkzeugleiste bleibt");
    assert.deepEqual([zurueck.attr["aria-disabled"], vor.attr["aria-disabled"]], ["true", "true"], "ohne Verlauf ausgegraut");
    u.ws.activeLeaf.history.backHistory.push({});
    u.ereignis("file-open");
    assert.deepEqual([zurueck.attr["aria-disabled"], vor.attr["aria-disabled"]], ["false", "true"], "nach dem Öffnen einer Notiz: zurück geht");
    zurueck.on.click({ preventDefault() {} });
    vor.on.click({ preventDefault() {} });
    assert.deepEqual(u.verlauf, [-1, 1], "derselbe Weg wie ‹ › der Leiste: history.go des aktiven Tabs");
    u.abmelden();
    assert.deepEqual(u.werkzeug.containerEl.kinder.map((k) => k.cls), ["mobile-toolbar-options-list-container"], "abgemeldet weg");
  } finally {
    u.zurueck();
  }
  const css = fs.readFileSync(path.join(VAULT, ".obsidian", "snippets", "eba-core.css"), "utf8");
  assert.ok(css.includes("body:not(.is-tablet) .eba-nav-werkzeug { display: none; }"), "nur auf dem iPad");
});

// iPad mit angehefteter rechter Seitenleiste: Obsidians Leiste stand in der Fensterecke unter ihr, ≡ und Zahnrad waren nicht zu
// erreichen (bis 27.10.2026). hauptRechts misst die Hauptfläche und setzt --eba-haupt-rechts, eba-core.css 66 rückt die Leiste so
// weit nach links.
test("iPad: mit angehefteter rechter Seitenleiste steht die Leiste links neben ihr (Abstand der Hauptfläche vom rechten Rand)", () => {
  const vorher = global.ResizeObserver;
  const beobachter = [];
  global.ResizeObserver = class {
    constructor(f) { this.f = f; this.ziele = new Set(); beobachter.push(this); }
    observe(e) { this.ziele.add(e); }
    unobserve(e) { this.ziele.delete(e); }
    disconnect() { this.ziele.clear(); this.weg = true; }
  };
  const u = menueUmgebung(true, { tablet: true, fenster: { innerWidth: 1376, innerHeight: 1032 } });
  try {
    const haupt = u.ws.rootSplit.containerEl, werte = u.body.style.werte;
    assert.equal(werte["--eba-haupt-rechts"], "0px", "ohne Seitenleiste: in der Ecke");
    assert.ok(beobachter[0].ziele.has(haupt), "beobachtet die Hauptfläche");
    haupt.rect = Object.assign({}, haupt.rect, { right: 1026 });
    beobachter[0].f();
    assert.equal(werte["--eba-haupt-rechts"], "350px", "rechte Seitenleiste angeheftet (350 px): so weit nach links");
    // Neue Hauptfläche (anderes Layout): wird beobachtet, die alte nicht mehr
    u.ws.rootSplit = { containerEl: u.el("div") };
    u.ereignis("layout-change");
    assert.ok(beobachter[0].ziele.has(u.ws.rootSplit.containerEl) && !beobachter[0].ziele.has(haupt));
    assert.equal(werte["--eba-haupt-rechts"], "1376px", "neu gemessen an der neuen Hauptfläche (im Gerüst 0 px breit)");
    u.abmelden();
    assert.ok(beobachter[0].weg && !("--eba-haupt-rechts" in werte), "abgemeldet: kein Beobachter, keine Variable");
  } finally {
    u.zurueck();
    global.ResizeObserver = vorher;
  }
  const css = fs.readFileSync(path.join(VAULT, ".obsidian", "snippets", "eba-core.css"), "utf8");
  assert.match(css, /body\.eba-plugin-an\.is-tablet \.mobile-navbar \{[^}]*right: max\(var\(--safe-area-inset-right\), calc\(var\(--eba-haupt-rechts, 0px\) \+ var\(--navbar-bottom-offset\) - 2px\)\);/);
  // Beginnt ein iPad schmal (Split View: Obsidian zählt es dann als iPhone) und wird breit, gilt die Variable trotzdem: gemessen
  // wird auf jedem mobilen Gerät, die Regel gilt nur mit body.is-tablet
  global.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
  const schmal = menueUmgebung(true, { fenster: { innerWidth: 500, innerHeight: 1032 } });
  try {
    assert.equal(schmal.body.style.werte["--eba-haupt-rechts"], "0px", "auch in der iPhone-Ansicht gemessen");
  } finally {
    schmal.zurueck();
    global.ResizeObserver = vorher;
  }
  const pc = menueUmgebung(false);
  try {
    assert.equal(pc.body.style.werte["--eba-haupt-rechts"], undefined, "PC: nichts");
  } finally {
    pc.zurueck();
  }
});

test("Menü: Esc schließt es (Hörer über ctx.dom), beim Abmelden ist es weg, am PC wie auf iPhone und iPad", () => {
  for (const isMobile of [false, true]) {
    const u = menueUmgebung(isMobile);
    try {
      const auf = () => (isMobile ? u.navbar.onRibbonMenuClick({ preventDefault() {} }) : u.seiten().on.click({ preventDefault() {} }));
      auf();
      assert.deepEqual(u.menue(), ["eba-nav-hinter", "eba-nav-menue eba-sl"], "offen: Fläche zum Schließen und Menü");
      const esc = u.hoerer(global.document, "keydown");
      assert.equal(esc.length, 1, "ein Hörer für Esc, über ctx.dom");
      esc[0].f({ key: "Enter", preventDefault() {}, stopPropagation() {} });
      assert.equal(u.menue().length, 2, "andere Tasten: bleibt offen");
      esc[0].f({ key: "Escape", preventDefault() {}, stopPropagation() {} });
      assert.deepEqual(u.menue(), [], "Esc: zu");
      auf();
      u.abmelden();
      assert.deepEqual(u.body.kinder.concat(u.ws.rootSplit.containerEl.kinder).map((k) => k.cls), [],
        "abgemeldet mit offenem Menü: nichts bleibt im Dokument");
    } finally {
      u.zurueck();
    }
  }
  const code = fs.readFileSync(path.join(SKRIPTE, "seitenleiste.js"), "utf8");
  assert.doesNotMatch(code, /document\.(?:add|remove)EventListener/, "Hörer am Dokument nur über ctx.dom");
});

// Am PC erreichte die Tastatur keine Zeile des Menüs (Prüfung vom 27.10.2026): die Zeilen waren <li> ohne Fokus und ohne Enter
test("Menü mit der Tastatur (PC): Enter auf ≡ öffnet es mit dem Fokus auf der ersten Zeile, ↑ ↓ wandern, Enter öffnet, Esc gibt den Fokus zurück", () => {
  const u = menueUmgebung(false);
  const geoeffnet = [];
  try {
    const knopf = u.seiten();
    knopf.focus();
    const taste = (key) => ({ key, type: "keydown", preventDefault() {}, stopPropagation() {} });
    knopf.on.keydown(taste("Enter"));
    const menue = u.body.kinder.find((k) => k.cls.includes("eba-nav-menue"));
    const zeilen = menue.querySelectorAll(".eba-sl-zeile");
    assert.ok(zeilen.length >= 3, "Zeilen da");
    assert.deepEqual(zeilen.map((z) => [z.attr.role, z.attr.tabindex]), zeilen.map(() => ["menuitem", "-1"]), "Einträge eines Menüs, mit Fokus erreichbar");
    assert.ok(menue.querySelectorAll("ul").every((ul) => ul.attr.role === "none"), "die Listen dazwischen ohne eigene Rolle");
    assert.equal(global.document.activeElement, zeilen[0], "mit der Tastatur geöffnet: Fokus auf der ersten Zeile");
    const [hoerer] = u.hoerer(global.document, "keydown");
    hoerer.f(taste("ArrowDown"));
    assert.equal(global.document.activeElement, zeilen[1], "↓");
    hoerer.f(taste("ArrowUp"));
    hoerer.f(taste("ArrowUp"));
    assert.equal(global.document.activeElement, zeilen[zeilen.length - 1], "↑ von der ersten: die letzte");
    hoerer.f(taste("Escape"));
    assert.deepEqual(u.menue(), [], "Esc: zu");
    assert.equal(global.document.activeElement, knopf, "der Fokus wieder auf ≡");
    // Enter auf einer Zeile öffnet sie (wie ein Tipp) und schließt das Menü
    knopf.on.keydown(taste(" "));
    const zweite = u.body.kinder.find((k) => k.cls.includes("eba-nav-menue")).querySelectorAll(".eba-sl-zeile")[1];
    u.oeffnen((datei) => geoeffnet.push(datei.path));
    zweite.on.keydown(taste("Enter"));
    assert.deepEqual(u.menue(), [], "Enter: zu");
    assert.equal(geoeffnet.length, 1, "und geöffnet");
    // Mit der Maus geöffnet: kein Fokus im Menü (sonst stünde der Ring nach jedem Tipp da)
    global.document.activeElement = null;
    knopf.on.click({ type: "click", preventDefault() {} });
    assert.equal(global.document.activeElement, null);
  } finally {
    u.zurueck();
  }
});

// Seitenende (eba-core.css 36d): Wo das Plugin Obsidians Auslauf am Seitenende kürzt (Abschnitte 34 und 4: 1.5rem bzw. 24 px),
// stand auf iPad und PC der letzte Block unter der Leiste unten rechts (bis 27.10.2026, iPad 12 bis 44 px, PC bis 33 px). Jede
// solche Regel, die nicht nur fürs iPhone gilt, braucht für iPad und PC eine in 36d, die dieselben Seiten trifft. Wie viel Platz:
// Lücke = Seitenende + Rand der Leseansicht unten (Obsidian: PC 32 px, iPad 16 px) − Abstand der Oberkante der Leiste vom unteren
// Rand; mindestens 12 px wie überall.
test("Seitenende auf iPad und PC: wo das Plugin es kürzt, steht der letzte Block über der Leiste unten rechts", () => {
  const css = fs.readFileSync(path.join(VAULT, ".obsidian", "snippets", "eba-core.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  // Selektorliste an den Kommas außerhalb von Klammern trennen (:is(.eba, .eba-s-…) bleibt ganz)
  const trennen = (s) => s.split(/,(?![^()]*\))\s*/).map((x) => x.trim());
  const regeln = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({ sel: trennen(m[1].trim()), dekl: m[2] }));
  // Klassen der Seite an der Ansicht (.markdown-preview-view.eba, :is(.eba-s-vorlesung, …))
  const seiten = (sel) => new Set((sel.match(/\.markdown-(?:preview|source)-view(?:[^ (]|\([^)]*\))*/g) || []).join(" ")
    .match(/\.eba(?:-s-[\w-]+)?\b/g) || []);
  const kurz = regeln.filter((r) => /padding-bottom:\s*(?:1\.5rem|24px)\s*!important/.test(r.dekl))
    .flatMap((r) => r.sel).filter((s) => /\.markdown-preview-sizer|\.cm-content/.test(s) && !s.startsWith("body.is-phone"));
  assert.ok(kurz.length >= 3, "Abschnitte 34 und 4 gefunden");
  const platz = (geraet) => regeln.filter((r) => r.sel.some((s) => s.startsWith(geraet)) && /padding-bottom:[^;]*!important/.test(r.dekl));
  const tablet = platz("body.eba-plugin-an.is-tablet .workspace-leaf"), pc = platz("body.eba-plugin-an:not(.is-mobile) .workspace-leaf");
  assert.equal(tablet.length, 1, "iPad: eine Regel in 36d");
  assert.equal(pc.length, 1, "PC: eine Regel in 36d");
  for (const [name, r] of [["iPad", tablet[0]], ["PC", pc[0]]]) {
    for (const s of kurz) {
      const art = s.includes(".cm-content") ? ".cm-content" : ".markdown-preview-sizer";
      const gedeckt = r.sel.filter((x) => x.includes(art)).flatMap((x) => [...seiten(x)]);
      for (const k of seiten(s)) assert.ok(gedeckt.includes(k), `${name}: ${k} (${art}) aus „${s}“ fehlt in 36d`);
    }
  }
  // iPad: Obsidians Maße der Leiste (Höhe + Abstand unten) weniger 4 px: + 16 px Rand der Leseansicht = 12 px Lücke
  assert.match(tablet[0].dekl, /padding-bottom: calc\(var\(--navbar-height, 52px\) \+ var\(--navbar-bottom-offset, 0px\) - 4px\) !important/);
  // PC: Oberkante der eigenen Leiste aus ihrem Stil (Abstand unten + Knopf + Innenabstand + Rand)
  const px = (sel, feld) => Number((css.match(new RegExp(sel.replace(/[.>]/g, "\\$&") + " \\{[^}]*?" + feld + ":\\s*(\\d+)px")) || [])[1]);
  const oben = px(".eba-nav-leiste", "bottom") + px(".eba-nav-leiste > .clickable-icon", "height") + 2 * px(".eba-nav-leiste", "padding") + 2;
  assert.equal(oben, 88, "Leiste am PC: 40 px über dem Rand, 48 px hoch");
  const ende = Number((pc[0].dekl.match(/padding-bottom:\s*(\d+)px/) || [])[1]);
  assert.ok(ende + 32 - oben >= 12, `PC: ${ende} px reichen nicht für 12 px Lücke`);
});

test("Menü: Drehen oder eine andere Fenstergröße schließt es (es stünde sonst an der alten Lage der Leiste, nach dem Drehen über dem Rand)", () => {
  for (const isMobile of [true, false]) {
    const u = menueUmgebung(isMobile);
    try {
      if (isMobile) u.navbar.onRibbonMenuClick({ preventDefault() {} });
      else u.seiten().on.click({ preventDefault() {} });
      assert.equal(u.menue().length, 2, "offen");
      const groesse = u.hoerer(global.window, "resize");
      assert.equal(groesse.length, 1, "ein Hörer über ctx.dom");
      groesse[0].f({});
      assert.deepEqual(u.menue(), [], "zu");
      groesse[0].f({});
      assert.deepEqual(u.menue(), [], "ohne offenes Menü: nichts");
    } finally {
      u.zurueck();
    }
  }
});

test("iPhone, Seitenende: die Leiste kommt auch nach einem einzigen Sprung ans Ende wieder (Obsidian verbirgt sie im selben Ereignis)", () => {
  const u = menueUmgebung(true);
  try {
    let gezeigt = 0;
    u.navbar.restoreNavigation = () => { gezeigt += 1; u.body.classList.k.delete("is-hidden-nav"); };
    const hoerer = u.hoerer(global.document, "scroll");
    assert.equal(hoerer.length, 1);
    assert.deepEqual(hoerer[0].opt, { capture: true, passive: true }, "scroll steigt nicht auf: im Einfangen");
    const flaeche = (oben, art = "markdown-preview-view") => ({
      classList: { contains: (c) => c === art }, isConnected: true, scrollHeight: 2000, clientHeight: 800, scrollTop: oben,
    });
    // Sprung ans Ende (Link zu einer Überschrift): beim Ereignis steht die Leiste noch, Obsidians Hörer an der Fläche verbirgt sie
    // danach im selben Ereignis; erst die Ruhe danach entscheidet
    const sprung = (s) => { hoerer[0].f({ target: s }); u.body.classList.k.add("is-hidden-nav"); u.ruhe(); };
    sprung(flaeche(1200));
    assert.equal(gezeigt, 1, "am Ende: die Leiste ist wieder da");
    sprung(flaeche(1200, "cm-scroller"));
    assert.equal(gezeigt, 2, "auch in der Bearbeitung");
    sprung(flaeche(600));
    assert.equal(gezeigt, 2, "nicht am Ende: bleibt verborgen");
    u.body.classList.k.delete("is-hidden-nav");
    hoerer[0].f({ target: flaeche(1200) });
    u.ruhe();
    assert.equal(gezeigt, 2, "Leiste ohnehin da: nichts");
    sprung(flaeche(1200, "workspace-leaf-content"));
    assert.equal(gezeigt, 2, "andere Fläche: nichts");
  } finally {
    u.zurueck();
  }
  // iPad, das Obsidian beim Start als iPad zählt und das dann im Split View schmal wird (iPhone-Ansicht, die Leiste verschwindet
  // beim Scrollen): Auch dort kommt sie am Ende wieder (bis 27.10.2026 nur, wenn es beim Start ein iPhone war)
  const ipad = menueUmgebung(true, { tablet: true });
  try {
    let gezeigt = 0;
    ipad.navbar.restoreNavigation = () => { gezeigt += 1; };
    const [hoerer] = ipad.hoerer(global.document, "scroll");
    assert.ok(hoerer, "auch auf dem iPad angemeldet");
    ipad.body.classList.k.add("is-hidden-nav");
    hoerer.f({ target: { classList: { contains: (c) => c === "cm-scroller" }, isConnected: true, scrollHeight: 2000, clientHeight: 800, scrollTop: 1200 } });
    ipad.ruhe();
    assert.equal(gezeigt, 1);
  } finally {
    ipad.zurueck();
  }
});

test("PC: die Leiste steht in der Hauptfläche, nicht in der Fensterecke (über der rechten Seitenleiste); ein neues Layout nimmt sie mit", () => {
  const u = menueUmgebung(false);
  try {
    assert.ok(u.leiste(), "in rootSplit.containerEl, folgt so der rechten Seitenleiste");
    assert.equal(u.body.kinder.length, 0, "nicht im body");
    // Obsidian ersetzt die Hauptfläche (anderes Layout): beim nächsten layout-change zieht die Leiste mit
    const alt = u.ws.rootSplit.containerEl;
    u.ws.rootSplit = { containerEl: u.el("div") };
    u.ereignis("layout-change");
    assert.ok(u.leiste(), "in der neuen Hauptfläche");
    assert.equal(alt.kinder.length, 0);
    u.ereignis("layout-change");
    assert.equal(u.ws.rootSplit.containerEl.kinder.length, 1, "nur einmal");
    u.abmelden();
    assert.equal(u.ws.rootSplit.containerEl.kinder.length, 0, "abgemeldet weg");
  } finally {
    u.zurueck();
  }
});

test("Am Seitenende: unter ENDE_REST px bis unten, auch in Bruchteilen; die Leiste kommt über Obsidians restoreNavigation", () => {
  const s = (scrollHeight, scrollTop, clientHeight) => ({ scrollHeight, scrollTop, clientHeight });
  assert.equal(seitenleiste.amEnde(s(1103, 259, 844)), true, "ganz unten (Dashboard im Emulator)");
  assert.equal(seitenleiste.amEnde(s(1103, 255.5, 844)), true, "iOS: 3,5 px vor dem Ende zählt");
  assert.equal(seitenleiste.amEnde(s(1103, 255, 844)), false, "4 px davor nicht");
  assert.equal(seitenleiste.amEnde(s(844, 0, 844)), true, "kurze Seite");
  const code = fs.readFileSync(path.join(SKRIPTE, "seitenleiste.js"), "utf8");
  assert.match(code, /if \(verborgen\(\) && s\.isConnected && amEnde\(s\)\) n\.restoreNavigation\(\); \}, ENDE_RUHE\);/,
    "erst nach ENDE_RUHE ms ohne Scrollen, nur wenn Obsidian sie verborgen hat");
  assert.match(code, /ctx\.dom\(document, "scroll", [\s\S]{0,260}\{ capture: true, passive: true \}\);/, "scroll steigt nicht auf: im Einfangen");
  assert.match(code, /wischenUebernehmen\(\);\n {8}leisteAmEnde\(\);/, "nur auf iPhone und iPad");
});

test("iPhone und iPad: ⎕ fällt weg, das iPad zeigt Obsidians Leiste mit denselben sieben Knöpfen wie das iPhone; Zurück, Vor und „+“ oben auf iPad und PC nicht mehr, ohne Plugin wie gewohnt", () => {
  const css = fs.readFileSync(path.join(VAULT, ".obsidian", "snippets", "eba-core.css"), "utf8");
  const a66 = css.slice(css.indexOf("66. Seitenleiste „Übersicht“"), css.indexOf("Ende Abschnitt 66"));
  for (const k of [".view-action.mod-left-split-toggle", ".sidebar-toggle-button.mod-left:not(.eba-uebersicht-knopf)"]) {
    assert.ok(a66.includes(`body.eba-plugin-an.is-mobile ${k}`), k);
  }
  assert.match(a66, /body\.eba-plugin-an\.is-tablet \.mobile-navbar \{[^}]*display: flex;/);
  // Dieselben sieben Knöpfe im selben Maß wie auf dem iPhone (Rückmeldung: „Die gleichen 7 icons wie bei iphone in der Leiste auch bei ipad“)
  const a66ohne = a66.replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(a66ohne, /is-tablet[^{]*\.mobile-navbar-action[^{]*\{[^}]*(?:display:\s*none|margin-inline-start)/, "keiner fehlt, gleiche Abstände");
  assert.doesNotMatch(a66ohne.slice(a66ohne.indexOf("body.eba-plugin-an.is-tablet .mobile-navbar {")).split("}")[0], /padding|max-width/, "Obsidians Maß wie auf dem iPhone");
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ""), /(?<!:not\()\.mobile-navbar-action-new-tab[^{]*\{[^}]*display:\s*none/, "„+“ bleibt");
  // Oben fehlen sie auf iPad und PC und nur in der Hauptfläche: Sie stehen dort in der Leiste unten (Rückmeldung: „Move the arrows to the
  // Bar down there“; am PC seit 27.10.2026: „iPad und iPhone und pc die gleichen 7 Symbole“)
  assert.ok(a66.includes("body.eba-plugin-an.is-tablet .mod-root :is(.view-header-nav-buttons, .workspace-tab-header-new-tab) { display: none; }"));
  // Am PC nur, wo die Leiste hängt: Popout-Fenster haben auch eine .mod-root, aber keine Leiste (Prüfung vom 27.10.2026)
  assert.ok(a66.includes("body.eba-plugin-an:not(.is-mobile) .mod-root:has(> .eba-nav-leiste) :is(.view-header-nav-buttons, .workspace-tab-header-new-tab) { display: none; }"));
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ""), /:not\(\.is-mobile\) \.mod-root :is\(\.view-header-nav-buttons/, "nicht in Popout-Fenstern");
  assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ""), /(?:is-phone|is-mobile(?!\)))[^{]*(?:view-header-nav-buttons|workspace-tab-header-new-tab)[^{]*\{[^}]*display:\s*none/,
    "das iPhone hat dort keine (seine Leiste unten ist Obsidians)");
  for (const k of [".eba-nav-hinter {", ".eba-nav-menue {"]) assert.ok(a66.includes(k), k);
  const ohneKommentare = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const regeln = ohneKommentare.match(/[^{}]*(?:mobile-navbar|mod-left-split-toggle|sidebar-toggle-button\.mod-left)[^{}]*\{[^}]*\}/g) || [];
  assert.ok(regeln.length >= 2, "⎕ ausgeblendet, Leiste auf dem iPad");
  for (const regel of regeln) {
    for (const sel of regel.slice(0, regel.indexOf("{")).split(",")) assert.match(sel.trim(), /^body\.eba-plugin-an\.is-(?:mobile|tablet) /);
  }
});
