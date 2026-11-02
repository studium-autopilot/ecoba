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
