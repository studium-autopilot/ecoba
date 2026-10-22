// Ruhige Notizen des Plugins (seit 19.10.2026): leere Abschnitte und der Kasten „Eckdaten“ (kopf.js), PDF-Kasten als Knopf
// (pdfkasten.js), Eigenschaften nur über „⋯“ im Kopf (start.js eba-notiz, eba-core.css 25b), Begleitnotizen in der Leseansicht
// (start.js zuerstLesen), keine leeren Punkte in erzeugten Notizen, Rahmen der laufenden Lehrveranstaltung im Wochenraster.
// Das Zeichnen selbst prüft man in Obsidian (docs/tests.md). Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { laden } = require("./laden.js");

const VAULT = path.join(__dirname, "..", "Studium Autopilot");
const SKRIPTE = path.join(VAULT, "System", "Skripte");
const K = require(path.join(SKRIPTE, "kopf.js"));
const PK = require(path.join(SKRIPTE, "pdfkasten.js"));
const CSS = fs.readFileSync(path.join(VAULT, ".obsidian", "snippets", "eba-core.css"), "utf8").replace(/\r\n/g, "\n");
const zeilen = (t) => t.split("\n");

test("Leere Abschnitte: Überschrift mit nur leeren Punkten bis zur nächsten Überschrift, zum PDF-Kasten oder zum Ende", () => {
  const alt = zeilen("---\ntyp: unterlage\n---\n\n# B110 · Folien 01\n\n> [!eba-regel] Eckdaten\n> x\n\n## Das Wichtigste\n- \n\n## Offene Fragen\n- [ ] \n\n> [!eba-pdf]- PDF\n> ![[a.pdf]]\n");
  assert.deepEqual(K.leereAbschnitte(alt), [[9, 11], [12, 14]]);
  // Uni-Abgleich: „Das Wichtigste“ gefüllt, „Offene Fragen“ leer → nur dieser Abschnitt
  const gefuellt = zeilen("# T\n\n## Das Wichtigste\n- **Punkt** [[a.pdf#page=2|S. 2]]\n\n## Offene Fragen\n- [ ]\n\n## Zu tun\n- [ ] Blatt 1 (bis 20.10.)\n");
  assert.deepEqual(K.leereAbschnitte(gefuellt), [[5, 7]]);
  // eigener Text nach einem leeren Punkt, ein fremder Kasten oder eine Unterüberschrift: bleibt stehen
  assert.deepEqual(K.leereAbschnitte(zeilen("## A\n- \n\nmein Text\n")), []);
  assert.deepEqual(K.leereAbschnitte(zeilen("## A\n- \n> [!info] Mein Kasten\n")), []);
  assert.deepEqual(K.leereAbschnitte(zeilen("## A\n\n### A.1\nText\n")), []);
  assert.deepEqual(K.leereAbschnitte(zeilen("## A\n\n> [!eba-pdf]- PDF\n")), [], "ohne Punkte gehört der Kasten zur Überschrift");
  // leere Überschriften (Vorlesung ohne Prüfungsrelevantes), nicht der Titel, nicht in Codeblöcken
  assert.deepEqual(K.leereAbschnitte(zeilen("# Titel\n## Prüfungsrelevant\n\n## Offene Fragen\n\n## Nacharbeit\n- Kernaussagen:\n")), [[1, 2], [3, 4]]);
  assert.deepEqual(K.leereAbschnitte(zeilen("```\n## Code\n```\n")), []);
});

test("Eckdaten: nur Zeilen, die das Plugin geschrieben hat, verschwinden", () => {
  assert.equal(K.eckZeileErzeugt("Modul: S110 · Art: Folien · Seiten: 164 · Semester: WS 2026/27", []), true);
  assert.equal(K.eckZeileErzeugt("Öffnen ↗ · Größe ⇅", ["Öffnen ↗", "Größe ⇅"]), true);
  assert.equal(K.eckZeileErzeugt("Öffnen ↗ · Original öffnen ↗ · Größe ⇅", ["Öffnen ↗", "Original öffnen ↗", "Größe ⇅"]), true);
  assert.equal(K.eckZeileErzeugt("Original: x.pptx (am PC öffnet es die passende App; auf iPad und iPhone über die Dateien-App)", []), true);
  assert.equal(K.eckZeileErzeugt("Aus ILIAS: Kurs / Folien / VL 1.pdf", []), true);
  assert.equal(K.eckZeileErzeugt("Weitere Dateien: a.zip", []), false, "Links auf weitere Dateien bleiben");
  assert.equal(K.eckZeileErzeugt("Modul: S110 · Mein Hinweis", []), false, "eigener Text bleibt");
  assert.equal(K.eckZeileErzeugt("Öffnen ↗ · Größe ⇅", []), false, "Text, der nur so aussieht wie ein Knopf, bleibt");
});

test("Eckdaten ganz weg nur mit PDF-Kasten: ohne ist „Öffnen ↗“ dort der einzige Weg zur Datei", () => {
  const pos = (a, b) => ({ start: { line: a }, end: { line: b == null ? a : b } });
  const kasten = { sections: [{ type: "heading", position: pos(14) }, { type: "callout", position: pos(20, 21) }],
    embeds: [{ link: "B110 Folien 01.pdf#height=560", position: pos(21) }] };
  assert.equal(K.hatPdfKasten(kasten), true, "PDF im Kasten [!eba-pdf]");
  assert.equal(K.hatPdfKasten({ sections: [{ type: "paragraph", position: pos(30) }], embeds: [{ link: "x.pdf", position: pos(30) }] }), false,
    "PDF frei eingebettet: kein Kasten, kein „Öffnen“ darin");
  assert.equal(K.hatPdfKasten({ sections: kasten.sections, embeds: [] }), false, "Word, PowerPoint, sehr große PDF: keine Einbettung");
  assert.equal(K.hatPdfKasten({ sections: kasten.sections, embeds: [{ link: "bild.png", position: pos(21) }] }), false);
  assert.equal(K.hatPdfKasten(null), false, "ohne Metadaten bleiben die Eckdaten");
});

test("PDF-Kasten: Inhalt nur aus Einbettungen lädt spät, Seitenzahl im Titel", () => {
  assert.equal(PK.nurEinbettungen([["a.pdf#height=560"]]), "![[a.pdf#height=560]]");
  assert.equal(PK.nurEinbettungen([["a.pdf", "b.pdf"], ["c.pdf"]]), "![[a.pdf]]\n![[b.pdf]]\n\n![[c.pdf]]", "Absätze bleiben (Gitter)");
  assert.equal(PK.nurEinbettungen([[""]]), null, "anderer Inhalt: bleibt, wie Obsidian ihn zeichnet");
  assert.equal(PK.nurEinbettungen([]), null);
  assert.equal(PK.titelMitSeiten("PDF", 37), "PDF (37 Seiten)");
  assert.equal(PK.titelMitSeiten("PDF", 1), "PDF (1 Seite)");
  assert.equal(PK.titelMitSeiten("Folien als PDF (164 Seiten)", 164), "Folien als PDF (164 Seiten)");
  assert.equal(PK.titelMitSeiten("PDF", ""), "PDF");
  assert.equal(PK.titelMitSeiten("", null), "PDF");
  // Kopfzeile fängt den Tipp vor Obsidian ab (Einfangen am Kasten), nie bis zum Editor; Knöpfe in der Gestalt der leisen Knöpfe
  const code = fs.readFileSync(path.join(SKRIPTE, "pdfkasten.js"), "utf8");
  assert.match(code, /callout\.addEventListener\(n, \(e\) => \{[\s\S]*?e\.stopPropagation\(\);[\s\S]*?\}, true\);/);
  assert.match(code, /eba-vb-knopf leise eba-pdf-knopf/);
});

test("Eigenschaften: eba-notiz an jeder Notiz des Plugins, nie an deinen; Klassen einer vorigen Notiz gehen wieder ab", () => {
  const S = laden("start").ergebnis;
  assert.deepEqual(S.klassenVon({ typ: "unterlage", cssclasses: ["eba-s-begleitnotiz"] }).soll, ["eba-s-begleitnotiz", "eba-notiz"]);
  assert.deepEqual(S.klassenVon({ typ: "sq_kurs" }).soll, ["eba-notiz"]);
  assert.deepEqual(S.klassenVon({ typ: "unterlage", cssclasses: ["eba", "eba-folien"] }).soll, ["eba-notiz"], "Folien als Markdown: ohne Seitenklasse");
  assert.deepEqual(S.klassenVon({}).soll, []);
  assert.deepEqual(S.klassenVon({ cssclasses: "eba-s-termin, eigene" }).eigen, ["eba-s-termin", "eigene"]);
  // CSS: aus in der Bearbeitungsansicht nur bei Notizen des Plugins, „⋯ → Eigenschaften“ zeigt sie wieder
  assert.match(CSS, /\.markdown-source-view\.is-live-preview:is\(\.eba-notiz, [^)]*\) \.metadata-container \{ display: none !important; \}/);
  assert.match(CSS, /\.eba-eigenschaften :is\(\.markdown-source-view\.is-live-preview, \.markdown-preview-view\) \.metadata-container \{ display: block !important; \}/);
});

test("Begleitnotizen und Volltexte öffnen in der Leseansicht, ohne Sperre; ansicht: bearbeiten geht vor", () => {
  const L = laden("start", { frontmatter: { "U/a.md": { typ: "unterlage" }, "U/_Volltext/a.md": { typ: "volltext" },
    "U/b.md": { typ: "unterlage", ansicht: "bearbeiten" }, "V/v.md": { typ: "vorlesung" } } }).ctx.leseansicht;
  const d = (p) => ({ path: p });
  assert.deepEqual(["U/a.md", "U/_Volltext/a.md", "U/b.md", "V/v.md", "U/a.pdf"].map((p) => L.zuerstLesen(d(p))), [true, true, false, false, false]);
  assert.equal(L.nurLesen(d("U/a.md")), false, "nicht gesperrt: das Buch oben schaltet zum Bearbeiten");
});

test("Erzeugte Notizen: keine leeren Punkte („- “, „- [ ] “) außer dort, wo der Cursor steht", () => {
  const notizen = fs.readFileSync(path.join(SKRIPTE, "notizen.js"), "utf8");
  const leer = notizen.split("\n").map((z, i) => [i + 1, z]).filter(([, z]) => /^\s*[-*+](?:\s+\[ \])?\s*$/.test(z));
  assert.deepEqual(leer, [], "Vorlesung und Übungsblatt: Überschriften ohne leere Punkte");
  const U = laden("unterlagen", { kontext: { user: { eba: () => laden("eba").ergebnis }, obsidian: { TFile: class {}, TFolder: class {}, Platform: {} } } }).ergebnis;
  const I = require("./ilias-attrappen.js").I;
  const texte = [U.begleitnotiz({ code: "B110", art: "Folien", nummer: 1, titel: "T", datei: "a.pdf", groesse: 1 }),
    I.notizText({ code: "B110", art: "Folien", nr: 1, titel: "T", datei: "a.pdf", endung: "pdf", groesse: 1 })];
  for (const t of texte) {
    assert.doesNotMatch(t, /^\s*[-*+](?:\s+\[ \])?\s*$/m);
    assert.doesNotMatch(t, /Eckdaten|aktion=pdf/);
  }
});

test("Wortliste: eine Lehrveranstaltung aus Alma ohne erkannte Art heißt im Kopf Vorlesung, nie „Veranstaltung“", () => {
  const Kx = laden("kopf").ergebnis;
  assert.equal(Kx.labelVon("lehrveranstaltung", { path: "S/x.md" }, { art: "Veranstaltung", code: "S110" }), "Vorlesung · S110");
  assert.equal(Kx.labelVon("lehrveranstaltung", { path: "S/x.md" }, { art: "Tutorium", code: "S110", gruppe: "4" }), "Tutorium · Gruppe 4 · S110");
});

test("Modulseite: eine leere Liste fällt samt Überschrift weg, auf Höhe 0 gefaltet", () => {
  assert.match(fs.readFileSync(path.join(SKRIPTE, "tabellen.js"), "utf8"), /ohne\(liste, !alle\.length \|\| !order\.length\);/);
  assert.match(CSS, /\.eba-s-modul \.markdown-preview-sizer > :is\(\.el-div\.eba-tl-ohne, \.el-h2:has\(\+ \.el-div\.eba-tl-ohne \+ :is\(\.el-h1, \.el-h2, \.mod-footer\)\),/);
});

test("Leere Abschnitte: eine zugeklappte Überschrift bleibt stehen, auch wenn gleich die nächste folgt", () => {
  // Obsidian nimmt den Inhalt eines zugeklappten Kapitels aus der Seite; ohne :not(.is-collapsed) verschwanden die Kapitel der Folien
  assert.match(CSS, /\.el-h2\.eba-abschnitt:not\(\.is-collapsed\):has\(\+ :is\(\.el-h1, \.el-h2, \.mod-footer\)\),/);
  assert.match(CSS, /\.el-h2\.eba-abschnitt:not\(\.is-collapsed\):last-child,/);
  assert.doesNotMatch(CSS, /\.el-h2\.eba-abschnitt:(?:has\(\+ :is\(\.el-h1|last-child)/);
});

test("Folien als Markdown: Kapitel beim ersten Öffnen zu, auf jedem Gerät; die Leseansicht faltet erst, wenn sie gezeichnet hat", async () => {
  const an = {}, timer = [], dom = [];
  const F = { typ: "unterlage", cssclasses: ["eba", "eba-folien"] };
  const { ctx, ergebnis: S } = laden("start", { frontmatter: { "U/f.md": F },
    kontext: { an: (_q, n, fn) => { (an[n] = an[n] || []).push(fn); }, zeit: (fn) => timer.push(fn), dom: (_el, typ, fn) => dom.push([typ, fn]) } });
  const h = (heading, line) => ({ level: 2, heading, position: { start: { line } } });
  const f = { path: "U/f.md" };
  const gespeichert = [];
  let gezeichnet = false, angewandt = 0, vonDerAnsicht = 0;
  const modus = { info: null, applyFoldInfo(i) { angewandt++; if (gezeichnet) this.info = i; }, getFoldInfo() { return this.info || { folds: [], lines: 9 }; } };
  Object.assign(ctx.app, {
    foldManager: { save: async (_f, i) => { gespeichert.push(i); } },
    loadLocalStorage: () => [], saveLocalStorage: () => {},
    workspace: { on: () => ({}), getLeavesOfType: () => [{ view: { file: f, currentMode: modus, onMarkdownFold: () => { vonDerAnsicht++; } } }] },
  });
  ctx.app.vault.cachedRead = async () => "\n".repeat(8);
  ctx.app.metadataCache.getFileCache = () => ({ frontmatter: F, headings: [h("Das Wichtigste", 1), h("1.1 Grundbegriffe", 4), h("1.2 Ziele", 6)] });
  const klassen = new Set();
  globalThis.document = { body: { classList: { add: (k) => klassen.add(k), remove: (k) => klassen.delete(k) } } };
  try { S.registrieren(); } finally { delete globalThis.document; }
  assert.ok(klassen.has("eba-plugin-an"), "blendet den Hinweis „Studium Autopilot ist noch aus“ aus, auch mit älterem Kern");
  const vorher = timer.length;
  for (const fn of an["file-open"]) await fn(f);
  assert.deepEqual(gespeichert, [{ folds: [{ from: 4, to: 5 }, { from: 6, to: 8 }], lines: 9 }], "„Das Wichtigste“ bleibt offen");
  assert.equal(vonDerAnsicht, 0, "noch nicht gezeichnet: nichts speichern, was die Faltung überschreibt");
  gezeichnet = true;
  for (const fn of timer.slice(vorher)) if (fn.length === 0 && /anwenden/.test(String(fn))) fn();
  assert.equal(angewandt, 2);
  assert.equal(vonDerAnsicht, 1);
  // Tipp auf die Kapitelzeile klappt auf, ein Link darin bleibt ein Link
  const tipp = dom.find(([typ]) => typ === "click")[1];
  let geklickt = 0;
  const pfeil = { click: () => { geklickt++; } };
  const kapitel = { querySelector: () => pfeil };
  const ziel = (link) => ({ closest: (sel) => (sel.indexOf(".eba-folien h2") >= 0 ? kapitel : link ? {} : null) });
  tipp({ target: ziel(false) });
  tipp({ target: ziel(true) });
  assert.equal(geklickt, 1);
});

test("Wochenraster: Rahmen der laufenden Lehrveranstaltung innen (auch iPhone), nie bei einem Kasten vor seinem Beginn", () => {
  assert.match(CSS, /\.eba-ev\.jetzt:not\(\.spaeter\) \{ box-shadow: inset 0 0 0 2px var\(--eba-accent\); \}/);
  assert.doesNotMatch(CSS, /\.eba-ev\.jetzt \{ box-shadow: 0 0 0/, "kein Rahmen außen (am iPhone ohne Platz)");
  assert.match(CSS, /\.eba-ev \.eba-ev-knapp \{ display: inline; \}/, "schmal die knappe Zeile, mit „ab TT.MM.“ und einer anderen Zeit (woche.js zeileZeichnen)");
});
