// Knopf „Öffnen“ (aktion=oeffnen, aktionen.js): Am PC öffnet er nur Dateiarten, die beim Öffnen nichts ausführen (EXTERN_ARTEN).
// Ein Link „obsidian://studium-autopilot?aktion=oeffnen&datei=…“ kann in jeder Notiz stehen, auch in Text aus einer Mail, von
// Claude oder aus ILIAS; ohne die Liste startete er eine Datei aus dem Tresor als Programm. Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { laden } = require("./laden.js");

const dateiVon = (p) => {
  const name = p.split("/").pop();
  const punkt = name.lastIndexOf(".");
  return { path: p, name, basename: punkt > 0 ? name.slice(0, punkt) : name, extension: punkt > 0 ? name.slice(punkt + 1) : "" };
};

const aufbau = (dateien, desktop = true) => {
  const hinweise = [];
  class Notice { constructor(t) { hinweise.push(String(t)); } setMessage() {} hide() {} }
  const r = laden("aktionen", { kontext: { obsidian: { Platform: { isDesktopApp: desktop }, MarkdownView: class {}, Notice } } });
  const geoeffnet = [], gezeigt = [];
  r.ctx.app.openWithDefaultApp = async (p) => { geoeffnet.push(p); };
  r.ctx.app.showInFolder = (p) => { gezeigt.push(p); };
  r.ctx.app.vault.getFiles = () => dateien.map(dateiVon);
  r.ctx.app.metadataCache.getFirstLinkpathDest = (l) => {
    const d = dateien.find((p) => p === l || p.split("/").pop() === l);
    return d ? dateiVon(d) : null;
  };
  const oeffnen = (datei) => r.ergebnis.aktionen.oeffnen.ausfuehren({ parameter: { datei }, quelle: null });
  return { r, oeffnen, geoeffnet, gezeigt, hinweise };
};

test("Öffnen: Unterlagen, Tabellen und Bilder öffnen sich am PC im Standardprogramm", async () => {
  const dateien = ["Unterlagen/B110/B110 Folien 01.pdf", "Unterlagen/B110/Blatt.DOCX", "Unterlagen/S110/daten.csv", "Unterlagen/S110/lab.R",
    "Unterlagen/E101/Grafik.png", "Unterlagen/E101/Folien.pptx"];
  const A = aufbau(dateien);
  for (const d of dateien) await A.oeffnen(d.split("/").pop());
  assert.deepEqual(A.geoeffnet, dateien);
  assert.deepEqual(A.hinweise, []);
});

test("Öffnen: Programme, Skripte, Verknüpfungen, Makro-Formate, HTML und Dateien ohne Endung öffnet der Knopf nie", async () => {
  const gefaehrlich = ["x.cmd", "x.bat", "x.exe", "x.com", "x.scr", "x.lnk", "x.url", "x.hta", "x.ps1", "x.vbs", "x.js", "x.jse", "x.wsf",
    "x.msi", "x.jar", "x.py", "x.sh", "x.reg", "x.html", "x.htm", "x.svg", "x.docm", "x.xlsm", "x.pptm", "x.library-ms", "x.cpl", "Makefile",
    "x.pdf.exe", "x.PDF.LNK"];
  const A = aufbau(gefaehrlich.map((n) => "Unterlagen/B110/" + n));
  for (const n of gefaehrlich) await A.oeffnen(n);
  assert.deepEqual(A.geoeffnet, [], "nichts gestartet");
  assert.equal(A.hinweise.length, gefaehrlich.length);
  assert.match(A.hinweise[0], /„x\.cmd“ öffnet Studium Autopilot nicht, weil die Datei ein Programm sein könnte/);
});

test("Öffnen: alte Office-Formate, RTF und Archive zeigt der Knopf am PC nur im Ordner", async () => {
  const dateien = ["Unterlagen/B110/Blatt.doc", "Unterlagen/B110/Folien 2009.PPT", "Unterlagen/S110/Daten.xls", "Unterlagen/S110/Text.rtf",
    "Unterlagen/E101/Material.zip"];
  const A = aufbau(dateien);
  for (const d of dateien) await A.oeffnen(d.split("/").pop());
  assert.deepEqual(A.geoeffnet, [], "nichts geöffnet");
  assert.deepEqual(A.gezeigt, dateien);
  assert.match(A.hinweise[0], /„Blatt\.doc“ liegt im Ordner, der sich gerade öffnet/);
});

test("Öffnen: ohne Notiz sucht der Knopf eine Datei gleichen Namens nur unter Unterlagen/", async () => {
  const A = aufbau(["System/Daten/geheim.txt", "Anhänge/Plan.pdf", "Unterlagen/B110/Plan.pdf"]);
  A.r.ctx.app.metadataCache.getFirstLinkpathDest = () => null;
  A.r.ctx.app.vault.getMarkdownFiles = () => [];
  for (const notiz of ["geheim", "Plan"]) await A.r.ergebnis.aktionen.oeffnen.ausfuehren({ parameter: { notiz }, quelle: null });
  assert.deepEqual(A.geoeffnet, ["Unterlagen/B110/Plan.pdf"]);
  assert.match(A.hinweise[0], /Keine Datei zu „geheim“ gefunden/);
});

// Fenster wie Obsidians Modal: merkt sich Titel, Text und Knöpfe; antwort = Knopf, den der Test tippt (null: Esc)
const fensterMit = (antwort, fenster) => {
  const el = (o) => {
    const e = { text: (o && o.text) || "", cls: (o && o.cls) || "", kinder: [], hoerer: {}, fokus: false };
    e.addClass = () => {}; e.setText = (t) => { e.text = t; }; e.empty = () => { e.kinder = []; };
    e.createEl = (_t, x) => { const k = el(x); e.kinder.push(k); return k; };
    e.createDiv = (x) => e.createEl("div", x);
    e.addEventListener = (typ, fn) => { e.hoerer[typ] = fn; };
    e.focus = () => { e.fokus = true; };
    return e;
  };
  return class {
    constructor() { this.modalEl = el(); this.titleEl = el(); this.contentEl = el(); }
    open() {
      const knoepfe = this.contentEl.kinder[1].kinder;
      const f = { titel: this.titleEl.text, text: this.contentEl.kinder[0].text, knoepfe: knoepfe.map((k) => k.text), knoepfeEl: knoepfe };
      fenster.push(f);
      setTimeout(() => {
        f.fokus = knoepfe.filter((k) => k.fokus).map((k) => k.text);
        const k = knoepfe.find((x) => x.text === antwort);
        if (k) k.hoerer.click(); else this.close();
      }, 0);
    }
    close() { if (this.onClose) this.onClose(); }
  };
};
const vonAussen = (dateien, antwort, desktop = true) => {
  const hinweise = [], fenster = [];
  class Notice { constructor(t) { hinweise.push(String(t)); } setMessage() {} hide() {} }
  const r = laden("aktionen", { kontext: { obsidian: { Platform: { isDesktopApp: desktop }, MarkdownView: class {}, Notice, Modal: fensterMit(antwort, fenster) } } });
  const geoeffnet = [], gezeigt = [];
  r.ctx.app.openWithDefaultApp = async (p) => { geoeffnet.push(p); };
  r.ctx.app.showInFolder = (p) => { gezeigt.push(p); };
  r.ctx.app.vault.getFiles = () => dateien.map(dateiVon);
  r.ctx.app.metadataCache.getFirstLinkpathDest = (l) => { const d = dateien.find((p) => p === l || p.split("/").pop() === l); return d ? dateiVon(d) : null; };
  const oeffnen = (datei, extern) => r.ergebnis.aktionen.oeffnen.ausfuehren({ parameter: { datei }, quelle: null, extern });
  return { oeffnen, geoeffnet, gezeigt, hinweise, fenster };
};

test("Öffnen von außen: erst eine Rückfrage mit Name und Art, „Abbrechen“ ist vorgewählt und öffnet nichts", async () => {
  const A = vonAussen(["Unterlagen/B110/B110 Folien 01.pdf"], "Abbrechen");
  await A.oeffnen("B110 Folien 01.pdf", true);
  assert.deepEqual(A.geoeffnet, [], "abgebrochen");
  assert.equal(A.fenster.length, 1);
  assert.equal(A.fenster[0].titel, "Datei öffnen?");
  assert.match(A.fenster[0].text, /„B110 Folien 01\.pdf“ öffnen \(PDF-Datei\)/);
  assert.deepEqual(A.fenster[0].knoepfe, ["Öffnen", "Abbrechen"]);
  assert.deepEqual(A.fenster[0].fokus, ["Abbrechen"], "Abbrechen hat den Fokus");
  const Esc = vonAussen(["Unterlagen/B110/B110 Folien 01.pdf"], null);
  await Esc.oeffnen("B110 Folien 01.pdf", true);
  assert.deepEqual(Esc.geoeffnet, [], "Esc öffnet nichts");
  const B = vonAussen(["Unterlagen/B110/B110 Folien 01.pdf", "Unterlagen/B110/Material.zip"], "Öffnen");
  await B.oeffnen("B110 Folien 01.pdf", true);
  await B.oeffnen("Material.zip", true);
  assert.deepEqual([B.geoeffnet, B.gezeigt], [["Unterlagen/B110/B110 Folien 01.pdf"], ["Unterlagen/B110/Material.zip"]], "erst nach „Öffnen“");
  assert.match(B.fenster[1].text, /\(ZIP-Datei\)/);
});

test("Öffnen von außen: nur Dateien unter Unterlagen/, alles andere ein Hinweis ohne Fenster", async () => {
  const A = vonAussen(["Anhänge/Plan.pdf", "System/Daten/geheim.txt", "Unterlagen/B110/x.cmd"], "Öffnen");
  for (const d of ["Plan.pdf", "geheim.txt"]) await A.oeffnen(d, true);
  assert.deepEqual([A.geoeffnet, A.gezeigt, A.fenster.length], [[], [], 0]);
  assert.deepEqual(A.hinweise, ["Links von außerhalb von Obsidian öffnen nur Unterlagen, „Plan.pdf“ liegt woanders.",
    "Links von außerhalb von Obsidian öffnen nur Unterlagen, „geheim.txt“ liegt woanders."]);
  // ein Programm unter Unterlagen/: wie in der App abgelehnt, ohne Rückfrage
  await A.oeffnen("x.cmd", true);
  assert.deepEqual([A.geoeffnet, A.fenster.length], [[], 0]);
  assert.match(A.hinweise[2], /„x\.cmd“ öffnet Studium Autopilot nicht/);
});

test("Öffnen in der App: wie bisher ohne Rückfrage, auch außerhalb von Unterlagen/", async () => {
  const A = vonAussen(["Unterlagen/B110/B110 Folien 01.pdf", "Anhänge/Plan.pdf"], "Abbrechen");
  await A.oeffnen("B110 Folien 01.pdf", false);
  await A.oeffnen("Plan.pdf");
  assert.deepEqual([A.geoeffnet, A.fenster.length, A.hinweise], [["Unterlagen/B110/B110 Folien 01.pdf", "Anhänge/Plan.pdf"], 0, []]);
});
