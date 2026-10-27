// Kopfleiste (kopfleiste.js, eba-core.css Abschnitt 70): Der Name einer Seite steht einmal. Obsidians Kopfleiste zeigt ihn nur,
// solange der Titel der Notiz nicht zu sehen ist; Tabs erscheinen erst ab dem zweiten, auf dem iPad sind Tab-Leiste und Kopfleiste
// eine Zeile, mit einem Tab wie mit mehreren; angeheftete Übersicht mit eigenem Umschalter; jede Notiz eine Spalte an derselben
// Stelle (37.tablet). Das Messen und Zeichnen prüft man in Obsidian (docs/tests.md). Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const K = require("../Studium Autopilot/System/Skripte/kopfleiste.js");
const CSS = fs.readFileSync(path.join(__dirname, "..", "Studium Autopilot", ".obsidian", "snippets", "eba-core.css"), "utf8");
const A70 = CSS.slice(CSS.indexOf("/* ---------- 70. Kopfleiste"), CSS.indexOf("/* ---------- Ende Abschnitt 70"));
const ohneKommentare = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");

// Rechtecke wie getBoundingClientRect: Scrollfläche oben bei 100, Kopfleiste darüber endet bei 100
const messung = (o) => Object.assign({ titel: { oben: 140, unten: 200 }, inhaltOben: 100, linie: 100, scroll: 0, vorher: null }, o);

test("Titel zu sehen: kein Name in der Kopfleiste; oben aus dem Bild: der Name erscheint", () => {
  assert.deepEqual(K.zustandAus(messung({})), { titel: true, weg: false });
  // gescrollt: der Titel steht 60 px über der Linie, ganz verschwunden
  assert.deepEqual(K.zustandAus(messung({ titel: { oben: 40, unten: 99 }, inhaltOben: 0, scroll: 100 })), { titel: true, weg: true });
  // halb zu sehen: noch kein Name oben
  assert.deepEqual(K.zustandAus(messung({ titel: { oben: 70, unten: 130 }, inhaltOben: 30, scroll: 70 })), { titel: true, weg: false });
  // iPhone: die Kopfleiste schwebt über dem Inhalt, die Linie ist ihre Unterkante
  assert.deepEqual(K.zustandAus(messung({ titel: { oben: 120, unten: 150 }, inhaltOben: 60, linie: 160, scroll: 40 })), { titel: true, weg: true });
});

test("titelIn: erster sichtbarer Titel außerhalb eingebetteter Notizen, in der Form, die zustandAus liest", () => {
  // Ersatz für Elemente: Rechteck wie getBoundingClientRect, eingebettet = in .markdown-embed
  const el = (top, bottom, o = {}) => ({ getBoundingClientRect: () => ({ top, bottom, height: o.leer ? 0 : bottom - top, width: o.leer ? 0 : 800 }),
    closest: (sel) => (sel === ".markdown-embed" && o.eingebettet ? {} : null) });
  const flaeche = (...els) => ({ querySelectorAll: (sel) => { assert.equal(sel, K.TITEL); return els; } });
  // Inline-Titel ausgeblendet (Höhe 0), eine eingebettete Notiz, dann der Titel der Seite
  const t = K.titelIn(flaeche(el(0, 0, { leer: true }), el(-900, -860, { eingebettet: true }), el(-733, -688)));
  assert.deepEqual(t, { oben: -733, unten: -688 });
  assert.deepEqual(K.zustandAus(messung({ titel: t, inhaltOben: -749, linie: 151, scroll: 900 })), { titel: true, weg: true }, "gescrollt: weg");
  assert.equal(K.titelIn(flaeche(el(0, 0, { leer: true }))), null);
});

test("Ohne Titel oben (PDF, eigene Notiz ohne Titel, # erst weiter unten) bleibt der Name in der Kopfleiste", () => {
  assert.deepEqual(K.zustandAus(messung({ titel: null })), { titel: false, weg: false });
  const tief = 100 + K.OBEN_MAX + 1;
  assert.deepEqual(K.zustandAus(messung({ titel: { oben: tief, unten: tief + 40 } })), { titel: false, weg: false });
  // Dashboard: Update-Hinweis und „Seit deinem letzten Besuch“ schieben den Gruß nach unten, er zählt noch
  assert.deepEqual(K.zustandAus(messung({ titel: { oben: 400, unten: 460 } })), { titel: true, weg: false });
});

test("Weit gescrollt, Abschnitt mit dem Titel entladen: Name bleibt oben, wenn die Notiz vorher einen Titel hatte", () => {
  const weit = K.ENTLADEN_AB + 1;
  assert.deepEqual(K.zustandAus(messung({ titel: null, scroll: weit, vorher: { titel: true, weg: true } })), { titel: true, weg: true });
  assert.deepEqual(K.zustandAus(messung({ titel: null, scroll: weit, vorher: { titel: false, weg: false } })), { titel: false, weg: false });
  assert.deepEqual(K.zustandAus(messung({ titel: null, scroll: 10, vorher: { titel: true, weg: false } })), { titel: false, weg: false }, "oben ohne Titel");
});

test("Abschnitt 70 gilt nur, solange das Plugin läuft; iPad und PC getrennt, iPhone ohne Tab-Leiste", () => {
  const regeln = ohneKommentare(A70).match(/[^{}]+\{[^}]*\}/g) || [];
  assert.ok(regeln.length >= 8, "Regeln gefunden");
  for (const r of regeln) {
    const sel = r.slice(0, r.indexOf("{")).trim();
    if (sel.startsWith("@media")) continue;
    // Kommas nur auf oberster Ebene trennen Selektoren (nicht die in :is(…))
    for (const s of sel.split(/,(?![^()]*\))/)) assert.match(s.trim(), /^body\.eba-plugin-an[.:\s]/, s.trim());
  }
  // Tabs ab dem zweiten: am PC nur der eine Tab weg, auf dem iPad eine Zeile; gestapelte Tabs bleiben, wie sie sind
  assert.match(A70, /body\.eba-plugin-an:not\(\.is-mobile\) \.mod-root \.workspace-tabs:not\(\.mod-stacked\):not\(:has\(\.workspace-tab-header \+ \.workspace-tab-header\)\)/);
  assert.match(A70, /body\.eba-plugin-an\.is-tablet \.mod-root \.workspace-tabs:not\(\.mod-stacked\):not\(:has\(\.workspace-tab-header \+ \.workspace-tab-header\)\)/);
  assert.doesNotMatch(ohneKommentare(A70), /is-phone[^{]*workspace-tab-header/, "das iPhone hat keine Tab-Leiste");
  // Ohne Bewegung, wer sie abgeschaltet hat
  assert.match(A70, /@media \(prefers-reduced-motion: reduce\)/);
});

test("Abschnitt 70 blendet keine Knöpfe aus: Zurück, Vor und „+“ nimmt auf dem iPad nur Abschnitt 66 aus der Zeile (mit der Leiste unten)", () => {
  const aus = ohneKommentare(A70).match(/[^{}]+\{[^}]*display:\s*none[^}]*\}/g) || [];
  for (const r of aus) assert.doesNotMatch(r.slice(0, r.indexOf("{")), /view-header-nav-buttons|sidebar-toggle-button|workspace-tab-header-new-tab|view-header-left/, r);
});

test("platzAus: Tabs ab dem Rand wie der Text bzw. hinter dem Umschalter bis vor Lesen/Bearbeiten; ohne Gruppe die Werte aus dem CSS", () => {
  // Rechtecke wie getBoundingClientRect, iPad quer: Gruppe über die ganze Breite (Zurück, Vor und „+“ stehen unten)
  const r = (left, width) => ({ left, width, right: left + width });
  const gruppe = r(0, 1608);
  assert.deepEqual(K.platzAus({ gruppe, vorn: null, aktionen: r(1596, 0) }), { links: K.RAND, rechts: K.RAND }, "Seite ohne Lesen/Bearbeiten: von Rand zu Rand");
  assert.deepEqual(K.platzAus({ gruppe, vorn: null, aktionen: r(1544, 52) }), { links: K.RAND, rechts: 1608 - 1544 + K.ABSTAND }, "Notiz: bis vor Lesen/Bearbeiten");
  // Seitenleiste angeheftet: die Gruppe beginnt rechts von ihr, vorn in der Zeile steht ihr Umschalter
  assert.deepEqual(K.platzAus({ gruppe: r(350, 1258), vorn: r(362, 40), aktionen: null }), { links: 402 - 350 + K.ABSTAND, rechts: K.RAND });
  assert.deepEqual(K.platzAus({ gruppe, vorn: r(0, 0), aktionen: null }), { links: K.RAND, rechts: K.RAND }, "Umschalter unsichtbar");
  assert.equal(K.platzAus({ gruppe: null, vorn: null, aktionen: null }), null);
  assert.ok(A70.includes("left: var(--eba-kopf-links, " + K.RAND + "px);"), "vor der ersten Messung derselbe Rand");
});

test("iPad mit zwei Tabs: eine Zeile wie mit einem, Tabs im gemessenen Platz, der Name nicht noch einmal in der Kopfleiste", () => {
  const css = ohneKommentare(A70);
  const tabs = "body.eba-plugin-an.is-tablet .mod-root .workspace-tabs:not(.mod-stacked)";
  const regel = (sel) => { const i = css.indexOf(sel + " {"); assert.ok(i >= 0, sel); return css.slice(i, css.indexOf("}", i)); };
  // Die Tab-Leiste liegt mit jeder Zahl von Tabs über der Kopfleiste (kein eigener Streifen, kein Sprung des Titels)
  assert.match(regel(tabs + " > .workspace-tab-header-container"), /position: absolute;[\s\S]*background: transparent;[\s\S]*pointer-events: none;/);
  assert.match(regel(tabs + " > .workspace-tab-header-container > .workspace-tab-header-container-inner"),
    /position: absolute;[\s\S]*left: var\(--eba-kopf-links, \d+px\);[\s\S]*max-width: calc\(100% - var\(--eba-kopf-links, \d+px\) - var\(--eba-kopf-rechts, \d+px\)\);[\s\S]*background: var\(--eba-surface-2\);[\s\S]*pointer-events: auto;/);
  assert.match(css, /\.workspace-split\.mod-root:not\(:has\(\.workspace-tabs\.mod-stacked\)\) \{ background-color: var\(--background-primary\); \}/,
    "Statusleiste in der Farbe der Seite, auch mit zwei Tabs");
  // Ab zwei Tabs nennt der offene Tab die Seite, die Kopfleiste nicht
  assert.match(css, /:has\(\.workspace-tab-header \+ \.workspace-tab-header\) > \.workspace-tab-container \.view-header-title-container \{ visibility: hidden; \}/);
  // Wie ein Segmentschalter: Schiene in der Farbe einer Leiste (sonst las sich ein Tab hinter den Pfeilen wie ein Pfad), der offene
  // Tab wie die Wahl, ohne Obsidians Reiterform
  assert.match(regel(tabs + " .workspace-tab-header.is-active"), /var\(--eba-accent\) 45%[\s\S]*background: var\(--eba-card-bg\)/);
  assert.match(css, /\.workspace-tab-header::before,\s*body[^{]*\.workspace-tab-header::after,\s*body[^{]*\.workspace-tab-header-inner::after \{ display: none; \}/);
});

test("iPad, ein Tab, Notizen des Plugins: Zeile über dem Inhalt mit dem Titel darin, durchsichtig, solange er zu sehen ist („Empty Space up top“)", () => {
  const css = ohneKommentare(A70);
  const ein = "body.eba-plugin-an.is-tablet .mod-root .workspace-tabs:not(.mod-stacked):not(:has(.workspace-tab-header + .workspace-tab-header))"
    + ":not(:has(> .workspace-tab-header-container > .eba-uebersicht-knopf)) .workspace-leaf-content[data-type=\"markdown\"]"
    + ":has(> .view-content > .markdown-reading-view > .markdown-preview-view:is(.eba, [class*=\" eba-s-\"]))";
  assert.ok(css.includes(ein + " > .view-header {\n  position: absolute;"), "an den Klassen der Notiz, nicht am gemessenen Titel: nichts springt");
  assert.ok(css.includes(ein + ".eba-titel:not(.eba-titel-weg) > .view-header {\n  background-color: transparent;\n  pointer-events: none;\n}"));
  assert.ok(css.includes(ein + " > .view-header .view-actions { pointer-events: auto; }"), "Lesen/Bearbeiten bleibt bedienbar");
  // Weg erst über der Oberkante der Zeile wie auf dem iPhone, sonst gälte der Titel in ihr sofort als weg und die Leiste deckte ihn zu
  const code = fs.readFileSync(path.join(__dirname, "..", "Studium Autopilot", "System", "Skripte", "kopfleiste.js"), "utf8");
  assert.match(code, /\|\| \(!!kopf && getComputedStyle\(kopf\)\.position === "absolute"\);/);
  assert.match(code, /schwebend: schwebendAus\(v\.headerEl\)/);
  // Gemessen im Emulator (1376 × 1032, Statusleiste 59 px): Zeile 59–111, Titel der Folien-Notiz bei 75–115
  const kopf = { top: 59, bottom: 111, height: 52 };
  const oben = messung({ titel: { oben: 75, unten: 115 }, inhaltOben: 59, linie: K.linieAus({ scrollOben: 59, kopf, schwebend: true }) });
  assert.deepEqual(K.zustandAus(oben), { titel: true, weg: false });
  // Bearbeitung: Titel so hoch wie beim Lesen (ohne Abstand über der Leerzeile und über „# …“)
  const lp = "body.eba-plugin-an.is-tablet .markdown-source-view.is-live-preview:is(.eba, [class*=\" eba-s-\"])";
  assert.ok(css.includes(lp + " .cm-scroller { padding-top: 0; }"));
  assert.ok(css.includes(lp + " .cm-content > .cm-line.HyperMD-header-1 { padding-top: 0; }"));
});

// Eigene Notizen behielten über ihrem Titel die leere Zeile der Kopfleiste (Prüfung vom 27.10.2026), auf iPhone und iPad
test("Eigene Notizen: der Titel steht oben in der Zeile wie bei Notizen des Plugins, ohne negativen Rand im Editor", () => {
  const css = ohneKommentare(A70);
  // iPhone: der Inline-Titel in Lese- und Bearbeitungsansicht (außerhalb von CodeMirror), Wege ganz ausgeschrieben, damit keine
  // eingebettete Notiz mitrückt; rechts frei neben Lesen/Bearbeiten
  const it = "body.eba-plugin-an.is-phone.is-floating-nav.show-inline-title .workspace-leaf-content:not(.eba-gesperrt) :is(.markdown-reading-view > "
    + ".markdown-preview-view > .markdown-preview-sizer > .mod-header, .markdown-source-view.is-live-preview > .cm-editor > .cm-scroller > .cm-sizer) > .inline-title {";
  const i = css.indexOf(it);
  assert.ok(i >= 0, "Inline-Titel");
  const regel = css.slice(i, css.indexOf("}", i));
  assert.match(regel, /margin-top: calc\(-0\.5 \* var\(--view-header-height\) - 16px - 0\.5em - 0\.6em\);/);
  assert.match(regel, /padding-right: calc\(var\(--size-4-3\) \+ var\(--view-header-height\) - 4px\);/);
  // iPhone, Leseansicht: „# …“ ganz am Anfang (ohne Eigenschaften) wie nach den Eigenschaften
  const vorn = "body.eba-plugin-an.is-phone.is-floating-nav .workspace-leaf-content:not(.eba-gesperrt) .markdown-reading-view > .markdown-preview-view > .markdown-preview-sizer > .mod-header + .el-h1";
  assert.ok(css.includes(vorn + " > h1 {\n  margin-top: calc(-0.5 * var(--view-header-height) - 16px - 0.56em);"), "„# …“ hoch");
  assert.ok(css.includes(vorn + "::before {\n  content: \"\";\n  float: right;"), "„# …“ neben Lesen/Bearbeiten frei");
  assert.doesNotMatch(css, /cm-(?:html-embed|line)[^{]*\{[^}]*margin-top:\s*-/, "kein negativer Rand an Zeilen des Editors");
  // Nie in eingebetteten Notizen (bis 27.10.2026 schnitten die Regeln dort „# …“ weg): Jeder Weg zu .mod-header bzw.
  // .mod-frontmatter + … beginnt bei der Leseansicht der Notiz selbst
  const wege = [...css.matchAll(/[^,{}]*\.markdown-preview-sizer > \.mod-(?:header|frontmatter) \+[^,{]*/g)].map((m) => m[0].trim());
  assert.ok(wege.length >= 8, "Regeln gefunden");
  for (const w of wege) assert.match(w, /\.markdown-reading-view > \.markdown-preview-view > \.markdown-preview-sizer > \.mod-/, w);
  // iPad: mit Inline-Titel liegt die Zeile auf allen Notizen über dem Inhalt (ein Tab, keine angeheftete Seitenleiste)
  const ein = "body.eba-plugin-an.is-tablet.show-inline-title .mod-root .workspace-tabs:not(.mod-stacked):not(:has(.workspace-tab-header + .workspace-tab-header))"
    + ":not(:has(> .workspace-tab-header-container > .eba-uebersicht-knopf)) .workspace-leaf-content[data-type=\"markdown\"]";
  assert.ok(css.includes(ein + " > .view-header {\n  position: absolute;"));
  assert.ok(css.includes(ein + ".eba-titel:not(.eba-titel-weg) > .view-header {\n  background-color: transparent;\n  pointer-events: none;\n}"));
  assert.ok(css.includes(ein + " > .view-header .view-actions { pointer-events: auto; }"), "Lesen/Bearbeiten bleibt bedienbar");
  assert.ok(css.includes("body.eba-plugin-an.is-tablet.show-inline-title .markdown-source-view.is-live-preview .cm-content > .cm-line.HyperMD-header-1:first-child { padding-top: 0; }"),
    "„# …“ am Anfang in der Bearbeitung so hoch wie beim Lesen");
  // Gemessen im Emulator (iPad 1376 × 1032): Zeile 59–111, Inline-Titel einer eigenen Notiz vorher bei 127, jetzt 75–119 in Lese- und
  // Bearbeitungsansicht. Er gilt als zu sehen, die Zeile bleibt durchsichtig und ohne Namen.
  const kopf = { top: 59, bottom: 111, height: 52 };
  assert.deepEqual(K.zustandAus(messung({ titel: { oben: 75, unten: 119 }, inhaltOben: 59, linie: K.linieAus({ scrollOben: 59, kopf, schwebend: true }) })), { titel: true, weg: false });
});

// Beim Umschalten zwischen Lesen und Bearbeiten sprang der Titel einer Notiz des Plugins (Prüfung vom 27.10.2026): iPhone etwa
// 20 px (Leerzeile vor „# …“ nur auf Seiten mit der Klasse eba flach), iPad 10 px (volle Leerzeile ohne den Abstand oben)
// Danach war der Cursor in dieser Zeile unsichtbar (Schrift 0, Prüfung vom 27.10.2026): flach nur ohne Cursor oder ohne Fokus
test("Titel springt beim Umschalten nicht: die Leerzeile vor „# …“ ist auf dem iPhone 3 px, auf dem iPad 14 px hoch; mit Fokus und Cursor eine volle Zeile", () => {
  const css = ohneKommentare(A70);
  const lp = ".markdown-source-view.is-live-preview:is(.eba, [class*=\" eba-s-\"]) ";
  const zeile = (aktiv) => ".cm-content > .cm-line" + (aktiv ? ":not(.cm-active)" : "") + ":nth-child(-n+2):has(> br:only-child):has(+ .cm-line.HyperMD-header-1)";
  for (const [vorn, px] of [["body.eba-plugin-an.is-phone.is-floating-nav ", 3], ["body.eba-plugin-an.is-tablet ", 14]]) {
    const sel = vorn + lp + zeile(true) + ",\n" + vorn + lp + ".cm-editor:not(.cm-focused) " + zeile(false) + " {";
    const i = css.indexOf(sel);
    assert.ok(i >= 0, vorn + ": ohne Cursor, oder mit Cursor ohne Fokus (anfangs steht er dort, der Titel springt nicht)");
    const regel = css.slice(i, css.indexOf("}", i));
    assert.match(regel, new RegExp(`height: ${px}px; min-height: 0; padding: 0 !important; font-size: 0; line-height: ${px}px; overflow: hidden;`), vorn);
  }
  // PC: Die Leerzeile bleibt eine ganze Zeile, oben fällt dafür so viel weg (Obsidians Abstand ist größer als eine Zeile). Gemessen
  // bei 1440 × 900: Titel beim Lesen 72–103 (Schrift ab 70), beim Bearbeiten vorher ab 152, jetzt Zeile und Schrift ab 70, auch mit
  // dem Cursor in der Leerzeile
  const pc = "body.eba-plugin-an:not(.is-mobile) " + lp.trim();
  assert.ok(css.includes(pc + " .cm-scroller { padding-top: calc(var(--size-4-8) - 2px - var(--line-height-normal) * var(--font-text-size)); }"));
  assert.ok(css.includes(pc + " .cm-content > .cm-line.HyperMD-header-1 { padding-top: 0; }"));
  assert.equal(32 - 2 - 1.5 * 16, 6, "bei 16 px Schrift: 6 px oben, 24 px Leerzeile, Schrift 2 px tiefer");
  assert.doesNotMatch(css, /:not\(\.is-mobile\)[^{]*br:only-child\):has\(\+ \.cm-line\.HyperMD-header-1\)/, "keine flache Leerzeile vor „# …“");
  // In Abschnitt 70 und 36c macht keine Regel eine Zeile mit dem Cursor bei Fokus flach (Schrift 0): jede mit font-size: 0 an einer
  // Leerzeile ist an :not(.cm-active) oder an .cm-editor:not(.cm-focused) gebunden. (Termin- und Begleitnotizen auf dem iPhone
  // machen alle Leerzeilen flach, mit Absicht ohne Bezug auf die Cursorzeile, damit beim Bewegen des Cursors nichts springt.)
  const a36c = CSS.slice(CSS.indexOf("/* ---------- 36c."), CSS.indexOf("/* ---------- 36e."));
  assert.ok(a36c.length > 100, "36c gefunden");
  for (const m of ohneKommentare(A70 + a36c).matchAll(/([^{}]+)\{[^}]*font-size: 0[^}]*\}/g)) {
    for (const s of m[1].split(/,(?![^()]*\))/).map((x) => x.trim()).filter((x) => /cm-line[^,]*br:only-child/.test(x))) {
      assert.match(s, /:not\(\.cm-active\)|\.cm-editor:not\(\.cm-focused\)/, s);
    }
  }
});

// iPad in schmalen Fenstern (unter etwa 900 px): Ein langer Titel lief unter Lesen/Bearbeiten (Prüfung vom 27.10.2026, bei 694 px
// erste Zeile bis x 654, Knopf ab 646)
test("iPad, ein Tab: rechts neben dem Titel Platz für Lesen/Bearbeiten (Float bzw. Innenabstand, beim Lesen und Bearbeiten)", () => {
  const css = ohneKommentare(A70);
  const ein = "body.eba-plugin-an.is-tablet .mod-root .workspace-tabs:not(.mod-stacked):not(:has(.workspace-tab-header + .workspace-tab-header))"
    + ":not(:has(> .workspace-tab-header-container > .eba-uebersicht-knopf)) .workspace-leaf-content[data-type=\"markdown\"]";
  const lesen = " .markdown-reading-view > .markdown-preview-view > .markdown-preview-sizer > ";
  const float = [lesen + ":is(.mod-frontmatter, .mod-header) + .el-h1::before", lesen + ".mod-frontmatter + .el-div > .eba-kopf:first-child::before",
    " .markdown-source-view.is-live-preview .cm-content > .cm-html-embed > .eba-kopf:first-child::before"].map((x) => ein + x).join(",\n");
  assert.ok(css.includes(float + " {\n  content: \"\";\n  float: right;\n  width: 34px;\n  height: 36px;\n}"), "Seitenkopf und „# …“");
  assert.ok(css.includes(ein + " :is(.markdown-reading-view > .markdown-preview-view > .markdown-preview-sizer > .mod-header, .markdown-source-view.is-live-preview > "
    + ".cm-editor > .cm-scroller > .cm-sizer) > .inline-title,\n" + ein + " .markdown-source-view.is-live-preview .cm-content > .cm-line.HyperMD-header-1 { padding-right: 34px; }"),
  "Inline-Titel und „# …“ im Editor");
  // Gemessen im Emulator (iPad, 694 px): Knopf 646–682, also endet die erste Zeile spätestens 8 px davor, bei 694 − 22 − 34 = 638
  assert.ok(694 - 22 - 34 <= 646 - 8);
});

// PC: Die Zeile unter der Tab-Leiste hielt nur noch Lesen/Bearbeiten und „⋮“, ein leeres Band über dem Titel (Prüfung vom
// 27.10.2026 bei 1440 × 900: Zeile 40–78, Titel ab 110; Rückmeldung vom 27.10.2026: „Ja wie auf dem ipad“)
test("PC, eine Tab-Gruppe: Kopfleiste über dem Inhalt wie auf dem iPad, durchsichtig, bis der Titel weg ist; Klicks nehmen nur ihre Knöpfe", () => {
  const css = ohneKommentare(A70);
  const gruppe = ".mod-root:has(> .eba-nav-leiste):not(:has(.workspace-tabs ~ .workspace-tabs)) > .workspace-tabs:not(.mod-stacked)";
  const pc = "body.eba-plugin-an:not(.is-mobile) " + gruppe, pcI = "body.eba-plugin-an.show-inline-title:not(.is-mobile) " + gruppe;
  const md = " .workspace-leaf-content[data-type=\"markdown\"]";
  const eba = md + ":has(> .view-content > .markdown-reading-view > .markdown-preview-view:is(.eba, [class*=\" eba-s-\"]))";
  assert.ok(css.includes(pc + eba + " > .view-header,\n" + pcI + md + " > .view-header {\n  position: absolute;"), "Notizen des Plugins, mit Inline-Titel alle");
  assert.ok(css.includes(pc + eba + ".eba-titel:not(.eba-titel-weg) > .view-header,\n" + pcI + md
    + ".eba-titel:not(.eba-titel-weg) > .view-header {\n  background-color: transparent;\n  pointer-events: none;\n}"));
  // Nur die Knöpfe (48–72) nehmen Klicks, nicht die Gruppe .view-actions: Die ist so hoch wie die Zeile (40–80), der Inhalt beginnt bei 72
  assert.ok(css.includes(pc + eba + " > .view-header .view-actions .clickable-icon,\n" + pcI + md + " > .view-header .view-actions .clickable-icon { pointer-events: auto; }"));
  assert.doesNotMatch(css, /:not\(\.is-mobile\)[^{]*\.view-actions \{ pointer-events: auto; \}/);
  // Dashboard: Datum und Karten reichen bis unter Lesezeichen und „⋮“, der Inhalt beginnt an der Unterkante der Zeile
  assert.ok(css.includes(pc + md + " > .view-content > .markdown-reading-view > .markdown-preview-view.eba-s-dashboard { padding-top: var(--header-height); }"));
  // Wie bei Obsidian mit geteilter Hauptfläche, in Popout-Fenstern (ohne Leiste unten) und auf anderen Ansichten als Markdown;
  // anders als auf dem iPad auch ab zwei Tabs (die stehen in der Tab-Leiste darüber, sonst spränge der Inhalt beim zweiten Tab)
  const pcAbsolut = [...css.matchAll(/([^{}]+)\{\s*position: absolute;\s*top: 0;\s*left: 0;\s*right: 0;\s*\}/g)]
    .flatMap((m) => m[1].split(/,(?![^()]*\))/).map((x) => x.trim())).filter((x) => x.includes(":not(.is-mobile)"));
  assert.equal(pcAbsolut.length, 2);
  for (const s of pcAbsolut) {
    assert.ok(s.includes(gruppe) && s.includes("[data-type=\"markdown\"]"), s);
    assert.doesNotMatch(s, /workspace-tab-header \+ \.workspace-tab-header/, s);
  }
  // Gemessen im Emulator (1440 × 900): Zeile 40–80 über der Scrollfläche ab 40, Titel 72–103 beim Lesen und Bearbeiten, Knöpfe
  // 48–72. Der Titel gilt erst über der Oberkante der Zeile als weg (schwebendAus erkennt sie an position: absolute wie auf dem
  // iPad): um 60 px gescrollt noch da, um 64 px weg. Ein Sprung zu einer Überschrift landet bei 80, unter der Zeile.
  const kopf = { top: 40, bottom: 80, height: 40 };
  const linie = K.linieAus({ scrollOben: 40, kopf, schwebend: true });
  assert.deepEqual(K.zustandAus(messung({ titel: { oben: 72, unten: 103 }, inhaltOben: 40, linie })), { titel: true, weg: false }, "oben");
  assert.deepEqual(K.zustandAus(messung({ titel: { oben: 12, unten: 43 }, inhaltOben: -20, linie, scroll: 60 })), { titel: true, weg: false });
  assert.deepEqual(K.zustandAus(messung({ titel: { oben: 8, unten: 39 }, inhaltOben: -24, linie, scroll: 64 })), { titel: true, weg: true });
  assert.equal(K.ueberdecktAus({ kopf, schwebend: true, verschoben: 0, scrollOben: 40 }), 40, "Sprungziele und Cursor 40 px tiefer");
  assert.ok(48 + 24 <= 40 + 32, "die Knöpfe enden, wo der Titel mit Obsidians Abstand oben beginnt");
});

// Seit die Kopfleiste über dem Inhalt liegt, landeten Sprungziele und der Cursor unter ihr (Prüfung vom 27.10.2026; iPad: Ziel bei
// 59–87 unter der Leiste 59–111, iPhone schon mit Obsidians schwebender Leiste: Ziel bei 0–28, Cursor bei 6)
test("Sprungziele und Cursor nicht unter der Kopfleiste: verdeckte Höhe, CodeMirrors Ränder, Sprung beim Lesen", () => {
  // Gemessen im Emulator: iPad mit einem Tab (Leiste absolut 59–111, Scrollfläche ab 59), iPhone (Leiste fest 59–104, Scrollfläche
  // ab 0, gescrollt um 103 px nach oben geschoben), iPad mit zwei Tabs (Leiste nicht darüber)
  assert.equal(K.ueberdecktAus({ kopf: { top: 59, bottom: 111, height: 52 }, schwebend: true, verschoben: 0, scrollOben: 59 }), 52, "iPad, ein Tab");
  assert.equal(K.ueberdecktAus({ kopf: { top: -44, bottom: 1, height: 45 }, schwebend: true, verschoben: -103, scrollOben: 0 }), 104, "iPhone: wo sie wieder steht");
  assert.equal(K.ueberdecktAus({ kopf: { top: 59, bottom: 111, height: 52 }, schwebend: false, verschoben: 0, scrollOben: 111 }), 0, "nicht darüber");
  assert.equal(K.ueberdecktAus({ kopf: null, schwebend: true, scrollOben: 0 }), 0);
  assert.equal(K.ueberdecktAus({ kopf: { top: 0, bottom: 0, height: 0 }, schwebend: true, scrollOben: 0 }), 0, "unsichtbar");

  // Gerüst: eine Notiz auf dem iPad, Kopfleiste absolut 59–111, Leseansicht ab 59
  const vorher = { window: global.window, document: global.document, getComputedStyle: global.getComputedStyle };
  const kopf = { getBoundingClientRect: () => ({ top: 59, bottom: 111, height: 52 }) };
  const blatt = { querySelector: (q) => (q === ":scope > .view-header" ? kopf : null) };
  const flaeche = () => ({ scrollTop: 0, closest: (q) => (q === ".workspace-leaf-content" ? blatt : null), getBoundingClientRect: () => ({ top: 59 }) });
  class Renderer {
    constructor() { this.previewEl = flaeche(); }
    // wie Obsidian: setzt scrollTop selbst; muss es einen Abschnitt erst zeigen, ruft es sich noch einmal auf
    applyScroll(zeile, opt) {
      if (opt && opt.zeigen) { opt.zeigen = false; return this.applyScroll(zeile, opt); }
      this.previewEl.scrollTop = zeile * 10;
      return true;
    }
  }
  const alt = Renderer.prototype.applyScroll;
  const aufraeumen = [], erweiterungen = [];
  global.window = { app: { workspace: { getLeavesOfType: () => [] } } };
  global.document = { querySelector: () => null, querySelectorAll: () => [], body: { classList: { contains: () => false } } };
  global.getComputedStyle = () => ({ position: "absolute", transform: "none" });
  try {
    K({
      an() {}, dom() {}, zeit() {}, aufraeumen: (f) => aufraeumen.push(f), editor: (e) => erweiterungen.push(e),
      cm: { view: { EditorView: { scrollMargins: { of: (f) => ({ raender: f }) } } } }, obsidian: { MarkdownPreviewRenderer: Renderer },
    }).registrieren();
    // Bearbeiten: CodeMirror hält oben so viel frei, wie die Leiste verdeckt
    assert.equal(erweiterungen.length, 1);
    assert.deepEqual(erweiterungen[0].raender({ scrollDOM: flaeche() }), { top: 52 });
    // Lesen: ein Sprung (highlight ohne center) rückt das Ziel unter die Leiste, auch wenn applyScroll sich selbst aufruft (einmal)
    const r = new Renderer();
    r.applyScroll(100, { highlight: true });
    assert.equal(r.previewEl.scrollTop, 1000 - 52, "Link, Gliederung, Rückverweis");
    r.applyScroll(100, { highlight: true, zeigen: true });
    assert.equal(r.previewEl.scrollTop, 1000 - 52, "nur der äußerste Aufruf");
    r.applyScroll(100);
    assert.equal(r.previewEl.scrollTop, 1000, "Position wiederherstellen, Umschalten: wie Obsidian (sonst wanderte sie)");
    r.applyScroll(100, { highlight: true, center: true });
    assert.equal(r.previewEl.scrollTop, 1000, "Suchtreffer in der Mitte: wie Obsidian");
    r.applyScroll(3, { highlight: true });
    assert.equal(r.previewEl.scrollTop, 0, "nie über den Anfang");
    for (const f of aufraeumen) f();
    assert.equal(Renderer.prototype.applyScroll, alt, "abgemeldet: Obsidians applyScroll");
  } finally {
    global.window = vorher.window;
    global.document = vorher.document;
    global.getComputedStyle = vorher.getComputedStyle;
  }
});

// iPhone, nach dem Scrollen (Leiste weggeschoben): Cursor in einer Zeile dicht unter der Statusleiste, der erste Tastendruck
// rückte den Text 48 px (Prüfung vom 27.10.2026; CodeMirrors Rand gilt für die Leiste, wie sie steht, wenn sie zu sehen ist)
test("Cursor gesetzt unter der Leiste: seine Zeile rückt gleich darunter, nicht erst beim Tippen", () => {
  assert.equal(K.unterLeisteAus({ oben: 104, cursor: 61, flaeche: 0 }), true, "unter der Leiste");
  assert.equal(K.unterLeisteAus({ oben: 104, cursor: 109, flaeche: 0 }), false, "darunter: nichts zu tun");
  assert.equal(K.unterLeisteAus({ oben: 104, cursor: -2257, flaeche: 0 }), false, "nicht im Bild (Notiz steht woanders)");
  assert.equal(K.unterLeisteAus({ oben: 0, cursor: 10, flaeche: 0 }), false, "PC mit geteilter Hauptfläche: keine Leiste über dem Inhalt");
  assert.equal(K.unterLeisteAus({ oben: 40, cursor: 60, flaeche: 40 }), true, "PC, eine Tab-Gruppe");
  assert.equal(K.unterLeisteAus({ oben: 52, cursor: 70, flaeche: 59 }), true, "iPad, ein Tab");

  // Gerüst: iPhone, Leiste fest 59–104 (weggeschoben um 103 px), Scrollfläche ab 0
  const vorher = { window: global.window, document: global.document, getComputedStyle: global.getComputedStyle, requestAnimationFrame: global.requestAnimationFrame };
  const kopf = { getBoundingClientRect: () => ({ top: -44, bottom: 1, height: 45 }) };
  const blatt = { querySelector: (q) => (q === ":scope > .view-header" ? kopf : null) };
  const scrollDOM = { closest: (q) => (q === ".workspace-leaf-content" ? blatt : null), getBoundingClientRect: () => ({ top: 0 }) };
  const erweiterungen = [], bilder = [], gesendet = [];
  global.window = { app: { workspace: { getLeavesOfType: () => [] } } };
  global.document = { querySelector: () => null, querySelectorAll: () => [], body: { classList: { contains: (k) => k === "is-phone" || k === "is-floating-nav" } } };
  global.getComputedStyle = () => ({ position: "fixed", transform: "matrix(1, 0, 0, 1, 0, -103)" });
  global.DOMMatrixReadOnly = class { constructor() { this.m42 = -103; } };
  global.requestAnimationFrame = (f) => { bilder.push(f); return bilder.length; };
  try {
    K({
      an() {}, dom() {}, zeit() {}, aufraeumen() {}, editor: (e) => erweiterungen.push(e),
      cm: { view: { EditorView: { scrollMargins: { of: (f) => ({ raender: f }) }, updateListener: { of: (f) => ({ hoeren: f }) },
        scrollIntoView: (stelle, o) => ({ ziel: stelle, o }) } } },
    }).registrieren();
    const hoeren = erweiterungen.find((e) => e.hoeren).hoeren;
    assert.deepEqual(erweiterungen.find((e) => e.raender).raender({ scrollDOM }), { top: 104 }, "Rand: wo die Leiste steht, wenn sie zu sehen ist");
    // Ansicht mit Cursor an Stelle 500, im Bild bei y
    const ansicht = (y) => ({
      hasFocus: true, scrollDOM, dom: { isConnected: true }, state: { selection: { main: { empty: true, head: 500 } } },
      coordsAtPos: () => ({ top: y }), dispatch: (t) => gesendet.push(t),
    });
    const update = (v, o = {}) => Object.assign({ view: v, state: v.state, selectionSet: true, docChanged: false, transactions: [{ scrollIntoView: false }] }, o);
    const fall = (v, o) => { bilder.length = 0; gesendet.length = 0; hoeren(update(v, o)); for (const f of bilder.splice(0)) f(); return gesendet.slice(); };
    assert.deepEqual(fall(ansicht(61)), [{ effects: { ziel: 500, o: { y: "nearest" } } }], "Cursor gesetzt, unter der Leiste: gleich darunter");
    assert.deepEqual(fall(ansicht(109)), [], "schon darunter");
    assert.deepEqual(fall(ansicht(61), { docChanged: true }), [], "beim Tippen rückt CodeMirror selbst");
    assert.deepEqual(fall(ansicht(61), { transactions: [{ scrollIntoView: true }] }), [], "rückt ohnehin");
    assert.deepEqual(fall(Object.assign(ansicht(61), { hasFocus: false })), [], "ohne Fokus (Öffnen, Wiederherstellen)");
    const markiert = ansicht(61);
    markiert.state = { selection: { main: { empty: false, head: 500 } } };
    assert.deepEqual(fall(markiert), [], "Markieren bleibt, wie es ist");
    assert.deepEqual(fall(ansicht(61), { selectionSet: false }), []);
  } finally {
    global.window = vorher.window;
    global.document = vorher.document;
    global.getComputedStyle = vorher.getComputedStyle;
    global.requestAnimationFrame = vorher.requestAnimationFrame;
    delete global.DOMMatrixReadOnly;
  }
});

// iPhone: Eine eigene Notiz, die mit „# …“ beginnt, stand beim Bearbeiten 52 px tiefer als beim Lesen (Prüfung vom 27.10.2026).
// Danach sprang der Titel beim Tippen von „# “ zweimal, 10 px tiefer und 2 s später 55 px hoch (die Klasse kam aus Obsidians
// Metadaten), und mit einer Leerzeile vor „# …“ blieb über ihm die leere Zeile der Kopfleiste, 76 px (beides Prüfung vom 27.10.2026)
test("anfangAus: „# …“ am Anfang aus dem Text, wie CodeMirror und Abschnitt 26 es sehen", () => {
  const a = (text) => K.anfangAus(text.split("\n"));
  assert.deepEqual(a("# Titel\n\nText"), { h1: true, eigenschaften: false });
  // Im Emulator gemessen (27.10.2026): CodeMirror zeigt „#“, „# “ und „# T“ am Anfang als Überschrift, „#T“, „ # T“, „#<Tab>T“ nicht
  assert.deepEqual(a("#"), { h1: true, eigenschaften: false }, "„#“ allein ist schon eine Überschrift");
  assert.deepEqual(a("# "), { h1: true, eigenschaften: false });
  for (const t of ["#Tag", " # eingerückt", "   # eingerückt", "#\tTab", "## Zwei", "Text\n# Titel", "  \n# Titel", ""]) {
    assert.equal(a(t).h1, false, JSON.stringify(t));
  }
  // Leerzeilen davor: so viele, wie Abschnitt 26 zulässt (Überschrift unter den ersten drei Kindern des Editors)
  assert.deepEqual(a("\n# Titel"), { h1: true, eigenschaften: false });
  assert.deepEqual(a("\n\n# Titel"), { h1: true, eigenschaften: false });
  assert.deepEqual(a("\n\n\n# Titel"), { h1: false, eigenschaften: false }, "drei: Abschnitt 26 zeigt den Inline-Titel");
  // Eigenschaften sind im Editor eines dieser Kinder
  assert.deepEqual(a("---\na: 1\n---\n# Titel"), { h1: true, eigenschaften: true });
  assert.deepEqual(a("---\na: 1\n---\n\n# Titel"), { h1: true, eigenschaften: true });
  assert.deepEqual(a("---\na: 1\n---\n\n\n# Titel"), { h1: false, eigenschaften: true });
  assert.deepEqual(a("---\na: 1"), { h1: false, eigenschaften: false }, "nicht geschlossen");
  // Aus dem Editor (den führt Obsidian auch beim Lesen), sonst aus dem Text der Ansicht
  assert.deepEqual(K.ersteZeilen({ editor: { lineCount: () => 3, getLine: (i) => ["# A", "", "B"][i] } }), ["# A", "", "B"]);
  assert.deepEqual(K.ersteZeilen({ data: "x\r\ny" }), ["x", "y"]);
  assert.equal(K.ersteZeilen({ editor: { lineCount: () => 1e6, getLine: () => "" } }).length, 200, "nur die ersten Zeilen");
});

test("eba-h1-anfang und eba-h1-oben: wechseln beim Tippen im selben Bild (editor-change), bewirken oben in der Zeile und keinen Inline-Titel", () => {
  const vorher = { window: global.window, document: global.document, requestAnimationFrame: global.requestAnimationFrame };
  const hoerer = {}, klassen = new Set();
  let zeilen = ["Tippen", "", "Text"];
  const ansicht = {
    containerEl: { classList: { toggle: (k, an) => (an ? klassen.add(k) : klassen.delete(k)), remove: (...k) => k.forEach((x) => klassen.delete(x)) } },
    file: { path: "Eigene/Tippen.md" }, getViewType: () => "markdown", editor: { lineCount: () => zeilen.length, getLine: (i) => zeilen[i] },
  };
  global.window = { app: { workspace: { getLeavesOfType: () => [] }, metadataCache: {} } };
  global.document = { querySelector: () => null, querySelectorAll: () => [], body: { classList: { contains: () => false } } };
  global.requestAnimationFrame = () => 1;
  try {
    K({ an: (quelle, name, f) => { hoerer[name] = f; }, dom() {}, zeit() {}, aufraeumen() {}, editor() {} }).registrieren();
    zeilen = ["# Tippen", "", "Text"];
    hoerer["editor-change"](ansicht.editor, ansicht);
    assert.deepEqual([...klassen].sort(), ["eba-h1-anfang", "eba-h1-oben"], "sofort, nicht erst im nächsten Bild oder mit den Metadaten");
    zeilen = ["---", "a: 1", "---", "# Tippen"];
    hoerer["editor-change"](ansicht.editor, ansicht);
    assert.deepEqual([...klassen], ["eba-h1-anfang"], "Eigenschaften davor: nicht oben in der Zeile");
    zeilen = ["Tippen"];
    hoerer["editor-change"](ansicht.editor, ansicht);
    assert.deepEqual([...klassen], []);
    assert.equal(typeof hoerer.changed, "function", "Rückfall: von außen geändert");
  } finally {
    global.window = vorher.window;
    global.document = vorher.document;
    global.requestAnimationFrame = vorher.requestAnimationFrame;
  }
  const code = fs.readFileSync(path.join(__dirname, "..", "Studium Autopilot", "System", "Skripte", "kopfleiste.js"), "utf8");
  assert.doesNotMatch(code, /getFileCache/, "nicht aus Obsidians Metadaten (die folgen dem Tippen etwa 2 s später)");

  const css = ohneKommentare(A70);
  // Inline-Titel aus, auch weit gescrollt (Abschnitt 26 erkennt „# …“ an den ersten Zeilen des Editors, die entlädt CodeMirror)
  assert.ok(css.includes("body.eba-plugin-an .workspace-leaf-content.eba-h1-anfang > .view-content > .markdown-source-view.is-live-preview > .cm-editor > .cm-scroller > .cm-sizer > .inline-title { display: none; }"));
  const handy = "body.eba-plugin-an.is-phone.is-floating-nav .workspace-leaf-content.eba-h1-oben:not(.eba-gesperrt) .markdown-source-view.is-live-preview";
  const ipad = "body.eba-plugin-an.is-tablet.show-inline-title .workspace-leaf-content.eba-h1-oben .markdown-source-view.is-live-preview";
  const h1 = ".cm-content > .cm-line.HyperMD-header-1:nth-child(-n+3):not(.HyperMD-header-1 ~ *)";
  assert.ok(css.includes(handy + " {\n  --view-top-spacing-markdown: calc(var(--safe-area-inset-top) + 5px);\n}"), "iPhone: oben in der Zeile");
  assert.ok(css.includes(handy + " " + h1 + " {\n  padding-top: 0;\n  padding-right: calc(var(--size-4-3) + var(--view-header-height) - 4px);"),
    "das erste „# …“, auch nach Leerzeilen, neben Lesen/Bearbeiten frei");
  assert.ok(css.includes(ipad + " " + h1 + " { padding-top: 0; }"), "iPad: so hoch wie beim Lesen");
  const pc = "body.eba-plugin-an.show-inline-title:not(.is-mobile) .workspace-leaf-content.eba-h1-oben .markdown-source-view.is-live-preview";
  assert.ok(css.includes(pc + " " + h1 + " { padding-top: 0; }"), "PC ebenso");
  // Leerzeilen vor dem ersten „# …“ fallen weg, mit Fokus und Cursor darin nicht (sonst wäre der Cursor unsichtbar, 36c)
  const leer = ".cm-line:nth-child(-n+2):has(> br:only-child):not(.HyperMD-header-1 ~ *):has(~ .cm-line.HyperMD-header-1:nth-child(-n+3))";
  const regel = css.slice(css.indexOf(handy + " .cm-content > .cm-line:not(.cm-active)"));
  const kopf = regel.slice(0, regel.indexOf("{"));
  assert.deepEqual(kopf.split(",\n").map((x) => x.trim()), [
    handy + " .cm-content > " + leer.replace(".cm-line:", ".cm-line:not(.cm-active):"),
    handy + " .cm-editor:not(.cm-focused) .cm-content > " + leer,
    ipad + " .cm-content > " + leer.replace(".cm-line:", ".cm-line:not(.cm-active):"),
    ipad + " .cm-editor:not(.cm-focused) .cm-content > " + leer,
  ]);
  assert.match(regel, /^[^}]*\{\s*height: 0; min-height: 0; padding: 0 !important; font-size: 0; line-height: 0; overflow: hidden;\s*\}/);
  assert.ok(css.includes(pc + " .cm-content > " + leer.replace(".cm-line:", ".cm-line:not(.cm-active):") + ",\n" + pc + " .cm-editor:not(.cm-focused) .cm-content > "
    + leer + " {\n  height: 0; min-height: 0; padding: 0 !important; font-size: 0; line-height: 0; overflow: hidden;\n}"), "PC ebenso");
});

test("Seitenleiste angeheftet: eigener Umschalter mit Obsidians Klassen löst sie über Obsidians Befehl", () => {
  const js = fs.readFileSync(path.join(__dirname, "..", "Studium Autopilot", "System", "Skripte", "kopfleiste.js"), "utf8");
  assert.match(js, /"sidebar-toggle-button mod-primary mod-left " \+ KNOPF/, "gleiche Klassen: gleicher Platz, gleiche Regeln in 70.2");
  assert.match(js, /executeCommandById\("app:toggle-left-sidebar"\)/, "Obsidians Befehl löst und schließt eine angeheftete Seitenleiste");
  assert.match(js, /classList\.contains\("is-pinned"\)/);
  assert.match(js, /attributeFilter: \["class"\]/, "Anheften und Lösen melden sich nur über die Klasse der Schublade");
  // Nur der eigene rückt die Kopfleiste ein; Obsidians Umschalter ist auf dem iPad ausgeblendet (Abschnitt 66)
  assert.match(ohneKommentare(A70), /:has\(> \.workspace-tab-header-container > \.eba-uebersicht-knopf\) > \.workspace-tab-container \.view-header \{ padding-inline-start: 64px; \}/);
  assert.doesNotMatch(ohneKommentare(A70), /:has\(> \.workspace-tab-header-container > \.sidebar-toggle-button\.mod-left\)/);
});

test("Leiste ohne Ordnerpfad; auf dem iPhone kein Name in der Leiste, auch gescrollt nicht (keine Glasfläche)", () => {
  const css = ohneKommentare(A70);
  assert.match(css, /body\.eba-plugin-an \.view-header-title-parent \{ display: none; \}/, "auch über PDFs und eigenen Notizen nur der Name");
  assert.doesNotMatch(css, /is-phone[^{]*\.view-header::before/, "keine Fläche über die ganze Breite");
  assert.doesNotMatch(css, /is-phone[^{]*eba-titel-weg[^{]*\.view-header-title-container\s*\{[^}]*display:\s*flex/, "Obsidian blendet den Namen aus, er bleibt weg");
});

test("iPhone: Titel in der Zeile der Leiste, weg erst über ihrer Oberkante (sonst Name doppelt)", () => {
  const kopf = { top: 59, bottom: 103, height: 44 };
  assert.equal(K.linieAus({ scrollOben: 100, kopf: { top: 50, bottom: 100, height: 50 }, schwebend: false }), 100, "iPad ab zwei Tabs, PC mit geteilter Hauptfläche: Unterkante");
  assert.equal(K.linieAus({ scrollOben: 0, kopf, schwebend: true }), 59, "iPhone: Oberkante");
  assert.equal(K.linieAus({ scrollOben: 0, kopf: null, schwebend: true }), 0);
  assert.equal(K.linieAus({ scrollOben: 0, kopf: { top: 0, bottom: 0, height: 0 }, schwebend: true }), 0, "ohne sichtbare Leiste");
  // Gescrollt schiebt Obsidian die Leiste um 103 px nach oben (gemessen): Es zählt, wo sie beim Zurückscrollen wieder steht
  assert.equal(K.linieAus({ scrollOben: 0, kopf: { top: -44, bottom: 1, height: 45 }, schwebend: true, verschoben: -103 }), 59);
  // Gemessen im Emulator (390 × 844, Statusleiste 59 px): Titel in der Zeile der Leiste bei 69–94
  const neben = messung({ titel: { oben: 69, unten: 94 }, inhaltOben: 0 });
  assert.deepEqual(K.zustandAus(Object.assign(neben, { linie: K.linieAus({ scrollOben: 0, kopf, schwebend: true }) })), { titel: true, weg: false });
  assert.deepEqual(K.zustandAus(Object.assign({}, neben, { linie: 103 })), { titel: true, weg: true }, "mit der Unterkante wäre er gleich weg");
  assert.deepEqual(K.zustandAus(messung({ titel: { oben: 10, unten: 35 }, inhaltOben: -59, linie: 59, scroll: 59 })), { titel: true, weg: true }, "gescrollt");
  const css = ohneKommentare(A70);
  const vorn = "body.eba-plugin-an.is-phone.is-floating-nav .workspace-leaf-content:not(.eba-gesperrt) .markdown-reading-view > .markdown-preview-view > .markdown-preview-sizer > .mod-frontmatter + ";
  for (const t of [".el-div > .eba-kopf:first-child > h1", ".el-h1 > h1"]) {
    assert.ok(css.includes(vorn + t + ",") || css.includes(vorn + t + " {"), "hoch: " + t);
    assert.ok(!css.includes(vorn + t + "::before"), "links kein Platz mehr frei, ⎕ gibt es nicht mehr: " + t);
  }
  assert.ok(css.includes("margin-top: calc(-0.5 * var(--view-header-height) - 16px - 0.56em);"), "erste Zeile mittig in der Leiste");
  assert.ok(css.includes(".workspace-leaf-content:not(.eba-gesperrt) .markdown-reading-view > .markdown-preview-view > .markdown-preview-sizer > .mod-frontmatter + .el-h1::before"),
    "Platz neben Lesen/Bearbeiten, nicht auf gesperrten Seiten");
  // Gesperrte Seiten: keine Knöpfe in der Leiste, die Seite beginnt gleich unter der Statusleiste, auch beim Scrollen derselbe Abstand
  const gesperrt = "body.eba-plugin-an.is-phone.is-floating-nav .workspace-leaf-content.eba-gesperrt";
  assert.ok(css.includes(gesperrt + " { --view-top-spacing-markdown: calc(var(--safe-area-inset-top) + 6px); }"));
  assert.ok(css.includes(gesperrt + " {\n  --view-top-fade-mask: linear-gradient(to bottom, rgba(0, 0, 0, var(--view-top-fade-opacity)) 0%, #000000 var(--safe-area-inset-top));"));
  assert.doesNotMatch(css, /eba-gesperrt[.:][^{,]*\{[^}]*--view-top-spacing/, "der Abstand hängt nicht am Scrollen");
  // Die leere Leiste darüber lässt Tipps durch, ihre Knöpfe nicht (Rückmeldung vom 27.10.2026: die Karte „Änderungen seit deinem
  // letzten Besuch“ ganz oben im Dashboard ließ sich nicht antippen)
  assert.ok(css.includes(gesperrt + " > .view-header,\nbody.eba-plugin-an.is-phone.is-floating-nav.show-inline-title .workspace-leaf-content[data-type=\"markdown\"] > .view-header { pointer-events: none; }"));
  assert.ok(css.includes("body.eba-plugin-an.is-phone.is-floating-nav .workspace-leaf-content > .view-header .clickable-icon { pointer-events: auto; }"));
  // Bearbeitung: Notizen des Plugins beginnen unter der Statusleiste; nur die Bearbeitung, nie die Leseansicht daneben
  const lp = ".markdown-source-view.is-live-preview:is(.eba, [class*=\" eba-s-\"]) {\n  --view-top-spacing-markdown: calc(var(--safe-area-inset-top) + 2px);";
  assert.ok(css.includes(lp), "Bearbeitung ohne leere Zeile oben");
  assert.ok(css.includes(".cm-content > .cm-html-embed > .eba-kopf:first-child::before {\n  content: \"\";\n  float: right;"), "Seitenkopf neben Lesen/Bearbeiten frei");
  assert.ok(css.includes(".cm-content > .cm-line.HyperMD-header-1 {\n  padding-top: 0;\n  padding-right: calc(var(--size-4-3) + var(--view-header-height) - 4px);"), "„# …“ neben Lesen/Bearbeiten frei");
  assert.doesNotMatch(css, /markdown-source-view[^{]*:has\([^{]*\{[^}]*--view-top-spacing/, "nicht am Titel erkannt: der Editor nimmt ihn beim Scrollen aus der Seite");
  assert.doesNotMatch(css, /(?:workspace-leaf-content|view-content)[^{,]*:has\([^{]*markdown-source-view[^{]*\{[^}]*--view-top-spacing/, "die Leseansicht desselben Tabs bleibt");
  assert.doesNotMatch(css, /cm-(?:html-embed|line)[^{]*\{[^}]*margin-top:\s*-/, "kein negativer Rand im Editor");
  assert.match(css, /\.eba-titel:not\(\.eba-titel-weg\)[^{]*\{\s*--view-top-fade-mask: linear-gradient\(to bottom, rgba\(0, 0, 0, var\(--view-top-fade-opacity\)\) 0%, #000000 var\(--safe-area-inset-top\)\);/,
    "solange der Titel oben steht, blendet die Maske ihn nicht aus");
});

test("Jede Notiz eine Spalte, links bündig mit den Seiten (iPad und breites Telefon-Fenster); Seiten volle Breite", () => {
  const T = CSS.slice(CSS.indexOf("/* --- 37.tablet --- */"), CSS.indexOf("/* ---------- 2. Ruhiger Rhythmus"));
  const notiz = ".is-readable-line-width:not(.eba-weit, .eba-s-modul)";
  for (const geraet of ["body.is-tablet", "  body.is-phone"]) {
    assert.ok(T.includes(`${geraet} :is(.markdown-preview-view, .markdown-source-view.mod-cm6)${notiz} { --file-line-width: 52rem; --file-margins: 16px 22px; }`), geraet);
    assert.ok(T.includes(`${geraet} .markdown-source-view.mod-cm6${notiz} .cm-sizer { margin-left: 0 !important; margin-right: auto !important; }`), geraet);
  }
  // Seiten: nur eba-weit und Modulseiten, keine Notiz mehr über die ganze Breite
  assert.doesNotMatch(T, /eba-s-begleitnotiz|eba-s-vorlesung|eba-s-termin|\.eba:not\(\.eba-folien\)/);
  // Eine aufgeklappte PDF bleibt breit: Abschnitt 27 wiegt mehr als die Spalte
  assert.match(CSS, /:is\(\.markdown-preview-view, \.markdown-source-view\)\.is-readable-line-width:has\(\.pdf-embed\):not\(:has\(\.callout\[data-callout="eba-pdf"\]\.is-collapsed\)\) \{ --file-line-width: 100%; \}/);
});
