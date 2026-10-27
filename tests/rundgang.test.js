// Rundgang (rundgang.js, eba-core.css Abschnitt 71): einmal je Gerät zeigen, wo die neue Navigation steht. Geprüft wird die reine
// Logik: Schritte je Gerät und Wortlaut, Lage von Ring und Blase an den echten Knöpfen (mit sicherem Rand), wann er von selbst
// kommt, dazu die Zeile in Einstellungen & Hilfe, die Regeln für Skripte und die Gestalt im CSS. Das Zeichnen selbst ist in
// Obsidian geprüft (docs/tests.md). Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const VAULT = path.join(__dirname, "..", "Studium Autopilot");
const SKRIPTE = path.join(VAULT, "System", "Skripte");
const R = require(path.join(SKRIPTE, "rundgang.js"));
const seitenleiste = require(path.join(SKRIPTE, "seitenleiste.js"));
const lesen = (p) => fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");

const OHNE = { oben: 0, unten: 0, links: 0, rechts: 0 };
const IPHONE = { breite: 390, hoehe: 844 }, IPHONE_RAND = { oben: 59, unten: 34, links: 0, rechts: 0 };
// Rechteck wie getBoundingClientRect
const rechteck = (left, top, width, height) => ({ left, top, right: left + width, bottom: top + height });

test("Schritte: am PC Seiten und Einstellungen, auf iPhone und iPad dazu Wischen vom Rand", () => {
  const ids = (o) => R.schritte(o).map((s) => s.id);
  assert.deepEqual(ids({ mobil: false }), ["seiten", "zahnrad"]);
  assert.deepEqual(ids({ mobil: true }), ["seiten", "zahnrad", "wischen"]);
  // Angeheftete linke Seitenleiste (iPad): Sie liegt am Rand, Wischen geht dort nicht zurück
  assert.deepEqual(ids({ mobil: true, angeheftet: true }), ["seiten", "zahnrad"]);
});

test("Wortlaut: wer die alte Navigation kennt, liest „jetzt“; nach einer neuen Einrichtung nur „hier“", () => {
  const texte = (o) => R.schritte(Object.assign({ mobil: true }, o)).map((s) => s.text);
  assert.deepEqual(texte({ neu: false }), [
    "Alle Seiten und deine Module findest du jetzt hier.",
    "**Einstellungen & Hilfe** öffnest du jetzt hier.",
    "Vom linken Rand nach rechts wischen bringt dich jetzt eine Seite zurück.",
  ]);
  assert.deepEqual(texte({ neu: true }), [
    "Alle Seiten und deine Module findest du hier.",
    "**Einstellungen & Hilfe** öffnest du hier.",
    "Vom linken Rand nach rechts wischen bringt dich eine Seite zurück.",
  ]);
  assert.equal(texte({ rtl: true })[2], "Vom rechten Rand nach links wischen bringt dich jetzt eine Seite zurück.");
  for (const t of texte({}).concat(texte({ neu: true }))) {
    assert.ok(t.length <= 80, `kurz: ${t}`);
    assert.equal((t.match(/[.!?]/g) || []).length, 1, `ein Satz: ${t}`);
  }
  // Fett nur die Beschriftung der App, genau so wie die Seite heißt
  assert.ok(seitenleiste.ZIELE.includes("Einstellungen & Hilfe"));
});

test("Ring: um den Knopf, als Kreis so groß wie seine längere Seite; der Streifen am Rand bleibt ein Rechteck", () => {
  // ≡ in Obsidians Leiste auf dem iPhone: 42 × 52 px
  const k = R.ringLage(rechteck(303, 780, 42, 52), R.RING, true);
  assert.deepEqual(k, { left: 294, top: 776, right: 354, bottom: 836, width: 60, height: 60, radius: 30 });
  const s = R.ringLage(rechteck(0, 300, 30, 160), 0, false);
  assert.deepEqual([s.left, s.top, s.width, s.height], [0, 300, 30, 160]);
});

test("Streifen zum Wischen: so breit wie der Rand, an dem Zurück geht, ab dem sicheren Rand, mittig in der Höhe", () => {
  const b = seitenleiste.ZURUECK_RAND;
  const s = R.randStreifen(IPHONE, IPHONE_RAND, 1, b);
  assert.deepEqual([s.left, s.right], [0, b]);
  assert.equal(s.bottom - s.top, 160, "ein Viertel der Höhe, höchstens 160 px");
  assert.equal(Math.round((s.top + s.bottom) / 2), Math.round(59 + (844 - 59 - 34) / 2));
  // iPhone quer: neben der Notch; Sprache von rechts nach links: rechter Rand
  assert.equal(R.randStreifen({ breite: 844, hoehe: 390 }, { oben: 0, unten: 21, links: 59, rechts: 59 }, 1, b).left, 59);
  const rtl = R.randStreifen({ breite: 844, hoehe: 390 }, { oben: 0, unten: 21, links: 59, rechts: 59 }, -1, b);
  assert.deepEqual([rtl.left, rtl.right], [844 - 59 - b, 844 - 59]);
  // Höhe 80 bis 160 px
  assert.equal(R.randStreifen({ breite: 1032, hoehe: 1376 }, OHNE, 1, b).bottom - R.randStreifen({ breite: 1032, hoehe: 1376 }, OHNE, 1, b).top, 160);
  assert.equal(R.randStreifen({ breite: 600, hoehe: 200 }, OHNE, 1, b).bottom - R.randStreifen({ breite: 600, hoehe: 200 }, OHNE, 1, b).top, 80);
});

test("Blase über dem Knopf unten rechts: im Fenster, Spitze genau über dem Knopf", () => {
  const ring = R.ringLage(rechteck(303, 780, 42, 52), R.RING, true);
  const g = { b: 300, h: 130 };
  const l = R.blasenLage(ring, g, IPHONE, IPHONE_RAND, "oben");
  assert.equal(l.seite, "oben");
  assert.equal(l.x, 390 - R.RAND - 300, "rechts bündig mit RAND Abstand vom Fensterrand");
  assert.equal(l.y, ring.top - R.ABSTAND - 130, "ABSTAND über dem Ring");
  assert.equal(l.x + l.pfeil, (ring.left + ring.right) / 2, "Spitze über der Mitte des Knopfs");
  // Zahnrad weiter links: Blase rückt mit, bleibt im Fenster
  const z = R.ringLage(rechteck(212, 780, 42, 52), R.RING, true);
  const lz = R.blasenLage(z, g, IPHONE, IPHONE_RAND, "oben");
  assert.ok(lz.x >= R.RAND && lz.x + 300 <= 390 - R.RAND);
  assert.equal(lz.x + lz.pfeil, (z.left + z.right) / 2);
});

test("Blase: Spitze nie in der Ecke, sicherer Rand gilt, ohne Platz oben darunter", () => {
  const g = { b: 300, h: 130 };
  // Knopf ganz rechts außen: Spitze höchstens bis SPITZE vor die Ecke
  const l = R.blasenLage(rechteck(380, 780, 10, 40), g, IPHONE, OHNE, "oben");
  assert.equal(l.pfeil, 300 - R.SPITZE);
  // sicherer Rand rechts (iPhone quer): die Blase bleibt davor
  const q = R.blasenLage(rechteck(740, 300, 60, 60), g, { breite: 844, hoehe: 390 }, { oben: 0, unten: 21, links: 59, rechts: 59 }, "oben");
  assert.equal(q.x + 300, 844 - 59 - R.RAND);
  // oben kein Platz (Knopf oben): darunter, Spitze oben
  const u = R.blasenLage(rechteck(100, 20, 40, 40), g, IPHONE, IPHONE_RAND, "oben");
  assert.equal(u.seite, "unten");
  assert.equal(u.y, 60 + R.ABSTAND);
  // weder oben noch unten Platz: oben (dort steht die Leiste nicht)
  assert.equal(R.blasenLage(rechteck(100, 150, 40, 40), g, { breite: 390, hoehe: 340 }, OHNE, "oben").seite, "oben");
});

test("Blase neben dem Streifen: rechts davon, mittig zu ihm, im sicheren Bereich; Breite, was bis zum Rand bleibt", () => {
  const s = R.randStreifen(IPHONE, IPHONE_RAND, 1, seitenleiste.ZURUECK_RAND);
  const g = { b: 300, h: 130 };
  const l = R.blasenLage(s, g, IPHONE, IPHONE_RAND, "rechts");
  assert.equal(l.seite, "rechts");
  assert.equal(l.x, s.right + R.ABSTAND);
  assert.equal(l.y + l.pfeil, (s.top + s.bottom) / 2);
  // links davon (Sprache von rechts nach links)
  const rtl = R.randStreifen(IPHONE, IPHONE_RAND, -1, 30);
  assert.equal(R.blasenLage(rtl, g, IPHONE, IPHONE_RAND, "links").x, rtl.left - R.ABSTAND - 300);
  // ganz oben: in der Höhe in den sicheren Bereich geschoben, Spitze bleibt am Streifen, nie in der Ecke
  const oben = R.blasenLage(rechteck(0, 40, 30, 80), g, IPHONE, IPHONE_RAND, "rechts");
  assert.equal(oben.y, 59 + R.RAND);
  assert.equal(oben.pfeil, R.SPITZE);
  assert.equal(R.blasenBreite(s, { breite: 300, hoehe: 600 }, OHNE, "rechts", 300), 300 - R.RAND - 30 - R.ABSTAND);
  assert.equal(R.blasenBreite(s, IPHONE, IPHONE_RAND, "rechts", 300), 300);
});

test("Von selbst: nur, wenn nichts anderes dran ist", () => {
  const frei = { gesehen: false, offen: false, bereit: true, sichtbar: true, fenster: false, einrichtung: false, menue: false,
    seitenleiste: false, hinweis: false, tippt: false, ziele: true };
  assert.equal(R.faellig(frei), true);
  for (const [k, v] of [["gesehen", true], ["offen", true], ["bereit", false], ["sichtbar", false], ["fenster", true], ["einrichtung", true],
    ["menue", true], ["seitenleiste", true], ["hinweis", true], ["tippt", true], ["ziele", false]]) {
    assert.equal(R.faellig(Object.assign({}, frei, { [k]: v })), false, k);
  }
});

// zustand() mit einem kleinen Gerüst statt Obsidian: eine aufgezogene Seitenleiste hält ihn zurück, eine angeheftete (iPad) nicht,
// links wie rechts. Bis 27.10.2026 zählte rechts jede offene, und auf dem iPad mit angehefteter rechter Seitenleiste kam er nie.
test("Von selbst: eine angeheftete Seitenleiste stört nicht, links wie rechts; eine aufgezogene schon", () => {
  const vorher = { window: global.window, document: global.document };
  const lauf = (links, rechts, angeheftet = []) => {
    const ctx = { obsidian: { Platform: { isMobile: true } }, user: {}, entprellen: (f) => f, zeit() {} };
    global.document = {
      activeElement: null, visibilityState: "visible",
      querySelector: (s) => {
        if (s === ".eba-nav-zahnrad") return { isConnected: true };
        const m = s.match(/^\.workspace-drawer\.mod-(left|right)\.is-pinned$/);
        return m && angeheftet.includes(m[1]) ? {} : null;
      },
    };
    global.window = { app: {
      workspace: { layoutReady: true, leftSplit: links, rightSplit: rechts }, metadataCache: { initialized: true },
      mobileNavbar: { ribbonMenuItemEl: { isConnected: true } }, loadLocalStorage: () => null,
    } };
    R(ctx);
    return ctx.rundgang.zustand();
  };
  const zu = { collapsed: true }, offen = { collapsed: false }, gepinnt = { collapsed: false, isPinned: true };
  try {
    assert.equal(lauf(zu, zu).seitenleiste, false);
    assert.equal(lauf(offen, zu).seitenleiste, true, "links aufgezogen: über der Seite");
    assert.equal(lauf(zu, offen).seitenleiste, true, "rechts aufgezogen: über der Seite");
    assert.equal(lauf(gepinnt, zu).seitenleiste, false, "links angeheftet (isPinned)");
    assert.equal(lauf(zu, gepinnt).seitenleiste, false, "rechts angeheftet (isPinned)");
    assert.equal(lauf(offen, offen, ["left", "right"]).seitenleiste, false, "angeheftet (Klasse der Schublade), links und rechts");
    assert.equal(lauf(zu, offen, ["left"]).seitenleiste, true, "links angeheftet, rechts aufgezogen");
    const z = lauf(gepinnt, gepinnt);
    assert.equal(R.faellig(Object.assign({}, z, { tippt: false, hinweis: false })), true, "iPad mit beiden angeheftet: er kommt");
  } finally {
    global.window = vorher.window;
    global.document = vorher.document;
  }
});

test("Einrichtung: offen oder gleich fällig → warten; danach Wortlaut für Neue", () => {
  assert.equal(R.einrichtungWartet({ fenster: true }), true);
  // fällig und in dieser Sitzung noch nicht gezeigt: einrichtung.js öffnet sie gleich (beim Start nach höchstens etwa 15 s)
  assert.equal(R.einrichtungWartet({ soll: true, gezeigt: false, seit: 5000 }), true);
  assert.equal(R.einrichtungWartet({ soll: true, gezeigt: false, seit: R.EINRICHTUNG_WARTEN }), false, "kommt nicht mehr");
  assert.equal(R.einrichtungWartet({ soll: true, gezeigt: true, seit: 5000 }), false, "schon gezeigt und geschlossen (Später)");
  assert.equal(R.einrichtungWartet({ soll: false, gezeigt: false, seit: 0 }), false, "eingerichtet: nichts zu warten");
  assert.equal(R.ersterStart({ soll: true }), true);
  assert.equal(R.ersterStart({ soll: false, gezeigt: true }), true, "Einrichtung lief eben, jetzt fertig");
  assert.equal(R.ersterStart({ soll: false, gezeigt: false }), false, "kennt die alte Navigation");
});

test("Einmal je Gerät, nicht an die Version gebunden; nur über die Helfer angemeldet, iOS-sicher", () => {
  assert.equal(R.GESEHEN, "eba-rundgang");
  assert.ok(Number.isInteger(R.FASSUNG) && R.FASSUNG >= 1);
  const code = lesen(path.join(SKRIPTE, "rundgang.js"));
  assert.match(code, /app\.saveLocalStorage\(k, v\)/, "gerätelokal, geht mit keinem Sync mit");
  // ohne Kommentare (ganze Zeilen und am Zeilenende)
  const ohneKommentare = code.split("\n").filter((z) => !z.trim().startsWith("//")).map((z) => z.replace(/\s\/\/ .*$/, "")).join("\n");
  assert.doesNotMatch(ohneKommentare, /manifest|version/i, "kein Vergleich mit der Version: der Entwicklungstresor zeigt ihn ohne Release");
  assert.doesNotMatch(ohneKommentare, /\b(?:setTimeout|setInterval)\(|document\.addEventListener|window\.addEventListener|workspace\.on\(/,
    "Zeiten und Hörer nur über ctx.zeit, ctx.intervall, ctx.dom");
  assert.doesNotMatch(ohneKommentare, /\(\?<[=!]|\.at\(|findLast|structuredClone|require\(/, "iOS-sicher, kein Node-API");
  assert.doesNotMatch(ohneKommentare, /innerHTML/, "Text ohne innerHTML");
  assert.match(code, /ctx\.aufraeumen\(\(\) => \{ an = false; schliessen\(false\); \}\)/, "Abmelden nimmt alles weg, ohne es als gesehen zu merken");
  assert.match(code, /restoreNavigation\(\)/, "verborgene Leiste auf dem iPhone erst zurückholen");
});

// Rückmeldung vom 27.10.2026: „nur wenn man auf die Blase klickt“ (bis dahin ging jeder Tipp irgendwohin weiter, im Schritt Wischen
// auch ein Wischen)
test("Bedienung: nur ein Tipp auf die Blase geht weiter (Knopf oder Satz); Fläche und Ring schlucken Tipps, nichts darunter", async () => {
  const vorher = { window: global.window, document: global.document, getComputedStyle: global.getComputedStyle };
  const el = (tag, o = {}) => {
    const e = {
      tag, cls: String(o.cls || ""), attr: Object.assign({}, o.attr), kinder: [], hoerer: {}, style: { setProperty() {} }, eltern: null, text: "",
      isConnected: true, offsetWidth: 280, offsetHeight: 90,
      createEl(t, x) { const k = el(t, x); k.eltern = this; this.kinder.push(k); if (x && x.text) k.text = x.text; return k; },
      createDiv(x) { return this.createEl("div", x); },
      createSpan(x) { return this.createEl("span", x); },
      appendChild(k) { this.kinder.push(k); return k; },
      appendText(t) { this.text += t; }, setText(t) { this.text = t; }, empty() { this.kinder = []; this.text = ""; },
      addClass() {}, removeClass() {}, toggleClass() {}, setAttribute(k, v) { this.attr[k] = v; },
      addEventListener(t, f) { (this.hoerer[t] = this.hoerer[t] || []).push(f); },
      remove() { this.weg = true; }, focus() {}, getBoundingClientRect: () => ({ left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }),
    };
    return e;
  };
  // Ein Klick wie im Browser: am Ziel, dann aufsteigend, solange niemand stopPropagation ruft
  const klick = (ziel) => {
    const ev = { type: "click", gestoppt: false, verhindert: false, stopPropagation() { this.gestoppt = true; }, preventDefault() { this.verhindert = true; } };
    for (let x = ziel; x && !ev.gestoppt; x = x.eltern) for (const f of x.hoerer.click || []) f(ev);
    return ev;
  };
  const body = Object.assign(el("body"), { classList: { contains: () => false } });
  const knopf = (left) => Object.assign(el("div"), { getBoundingClientRect: () => ({ left, top: 820, right: left + 44, bottom: 864, width: 44, height: 44 }) });
  const seiten = knopf(1380), zahnrad = knopf(1330);
  const gespeichert = {};
  global.window = { innerWidth: 1440, innerHeight: 900, app: { workspace: {}, metadataCache: {}, loadLocalStorage: (k) => gespeichert[k], saveLocalStorage: (k, v) => { gespeichert[k] = v; } } };
  global.document = { body, activeElement: null, createElementNS: (ns, t) => el(t),
    querySelector: (q) => (q === ".eba-nav-leiste .eba-nav-seiten" ? seiten : q === ".eba-nav-zahnrad" ? zahnrad : null) };
  global.getComputedStyle = () => ({ getPropertyValue: () => "0px" });
  try {
    const ctx = { obsidian: { Platform: { isMobile: false } }, user: {}, zeit() {}, intervall() {}, stopp() {}, entprellen: (f) => f, dom() {}, aufraeumen() {}, hinweis() {} };
    R(ctx);
    assert.equal(await ctx.rundgang.zeigen({ wieder: true }), true);
    const [hinter, ring, blase] = body.kinder;
    const satz = blase.kinder.find((k) => k.tag === "p"), fuss = blase.kinder.find((k) => k.cls === "eba-rg-fuss");
    const weiterKnopf = fuss.kinder.find((k) => k.tag === "button");
    const schritt = () => blase.kinder.find((k) => k.cls === "eba-rg-fuss").kinder[0].text;
    assert.equal(schritt(), "1 von 2");
    // daneben: geschluckt (nichts darunter), kein Schritt weiter
    for (const x of [hinter, ring]) {
      const ev = klick(x);
      assert.ok(ev.gestoppt && ev.verhindert, "geschluckt");
      assert.equal(schritt(), "1 von 2", "Tipp daneben: bleibt");
    }
    assert.ok(!hinter.hoerer.touchend, "kein Wischen mehr als Weiter");
    // auf den Satz: weiter
    klick(satz);
    assert.equal(schritt(), "2 von 2", "Tipp auf den Satz");
    assert.equal(weiterKnopf.text, "Fertig");
    klick(hinter);
    assert.equal(ctx.rundgang.offen, true, "daneben schließt auch der letzte Schritt nicht");
    // auf den Knopf: einmal weiter (sein Klick steigt zur Blase auf), im letzten Schritt zu und gesehen
    klick(weiterKnopf);
    assert.equal(ctx.rundgang.offen, false);
    assert.equal(gespeichert[R.GESEHEN], R.FASSUNG);
    assert.ok(hinter.weg && ring.weg && blase.weg);
  } finally {
    global.window = vorher.window;
    global.document = vorher.document;
    global.getComputedStyle = vorher.getComputedStyle;
  }
});

test("Noch einmal zeigen: Zeile Rundgang oben in der Hilfe von Einstellungen & Hilfe", () => {
  const seite = lesen(path.join(VAULT, "Studium", "Einstellungen & Hilfe.md"));
  const hilfe = seite.slice(seite.indexOf("## Hilfe"));
  assert.match(hilfe, /^## Hilfe\n\n> \[!eba-zeilen\]\n> ```eba-personalisieren hilfe\n> Rundgang: [^\n]+\n> ```\n>\n> > \[!eba-karte\|hilfe\|bedienung\]- Bedienung/);
  const code = lesen(path.join(SKRIPTE, "rundgang.js"));
  assert.match(code, /rundgang: \{\n\s+titel: "Rundgang zeigen",/, "Aktion (auch als Befehl) heißt wie die Zeile");
  // Selbst aufgerufen ohne „jetzt“ (soll irgendwann wegfallen), von selbst mit
  assert.match(code, /ausfuehren: async \(\) => \{\n\s+if \(!\(await zeigen\(\{ wieder: true \}\)\)\)/);
  assert.match(code, /neu: !!o\.wieder \|\| ersterStart\(einrichtung\(\)\)/);
  assert.match(code, /if \(faellig\(zustand\(\)\)\) zeigen\(\)\.catch/, "von selbst: Wortlaut nach der Einrichtung");
});

test("Gestalt (eba-core.css 71): Ebene der Fenster, Blase wie ein Fenster, Bewegung nur ohne „Bewegung reduzieren“", () => {
  const css = lesen(path.join(VAULT, ".obsidian", "snippets", "eba-core.css"));
  const a = css.slice(css.indexOf("/* ---------- 71. Rundgang"), css.indexOf("/* ---------- Ende Abschnitt 71"));
  assert.ok(a.length > 0, "Abschnitt 71");
  for (const k of ["eba-rg-hinter", "eba-rg-ring", "eba-rg-blase"]) assert.match(a, new RegExp(`\\.${k} \\{[^}]*z-index: var\\(--layer-modal\\)`), k);
  assert.match(a, /\.eba-rg-blase \{[^}]*border-radius: var\(--eba-radius\);[^}]*box-shadow: var\(--eba-shadow-schwebend\);/);
  assert.match(a, /body\.is-mobile \.eba-rg-fuss > button \{ min-height: 44px;/, "Tippfläche 44 px");
  // Bewegung nur in @media (prefers-reduced-motion: no-preference)
  const ohneMedia = a.replace(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}/, "");
  assert.doesNotMatch(ohneMedia.replace(/@keyframes[^\n]*\n/g, ""), /animation:|transition:(?! none)/, "Bewegung nur ohne „Bewegung reduzieren“");
});
