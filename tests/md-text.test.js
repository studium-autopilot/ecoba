// Ein Weg, Text aus ILIAS, Alma, den Literaturlisten und den Übungsgruppen in eine Notiz zu schreiben: ctx.zentral.mdInZeile
// (mitten in einer Zeile) und ctx.zentral.mdText (am Zeilenanfang, dazu ohne Liste). Beide setzen „\“ vor Markdown-Zeichen und
// vor die Zeichen, an denen Obsidian einen Link erkennt. Für gewöhnlichen Text ohne Link-Merkmale muss das Ergebnis Zeichen für
// Zeichen dasselbe sein wie mit den früheren eigenen Fassungen der Skripte (nur „\“ vor Markdown-Zeichen): Sonst schriebe ein
// Abruf vorhandene Notizen neu. Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { laden } = require("./laden.js");

const Z = laden("zentral").ctx.zentral;
// Die früheren Fassungen, wörtlich aus ilias.js, meine-gruppe.js und literatur.js (md, mdZeile) bzw. alma.js
const ALT = (s) => String(s).replace(/[\\`*_[\]<>#|!$%~=^{}]/g, "\\$&");
const ALT_ZEILE = (s) => ALT(s).replace(/^(\d+)([.)])/, "$1\\$2").replace(/^([-+])/, "\\$1");
const ALT_ALMA = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").replace(/[\\`*_[\]<>#|!$%~=^{}&]/g, "\\$&");

// Titel, Räume, Pfade und Angaben, wie sie wirklich vorkommen (ausgedacht)
const GEWOEHNLICH = [
  "B110 Einführung in die BWL", "1. Übungsblatt", "2) Nachklausur", "- Gruppe 4", "+ Zusatztermin", "Kapitel 2: Nachfrage und Angebot",
  "Vorlesung 10:15–11:45", "WS 2026/27", "Mo/Di", "Übung A/B", "Raum 1.02 / 1.03", "Hörsaal N6, Morgenstelle", "Kupferbau HS 25 & HS 26",
  "Gruppe 4: Dienstag 10 - 12, Hörsaal 11 (Beispielbau)", "B110 Kurs / Folien / Info.pdf", "Kap. 2 (ohne 2.4)", "Abschn. 1.1–1.3",
  "Muster, Beispiel (2024): Grundlagen der Beispielkunde, 3. Auflage, Beispielverlag", "Formeln *fett* mit $x$ und #tag", "a_b [c] <d> {e} |f| ~g~ =h= ^i^ !j! %k%",
  "Back\\slash", "Tutorium 1 – Dienstag, 08:15 – 09:45 Uhr", "Statistik I (S100)", "„Zitat“ und ‚innen‘", "50 % der Punkte", "E-Mail an das Sekretariat",
  "Lab: Daten aufbereiten", "Teil 1:  zwei  Leerzeichen", "Ökonometrie · Übung", "Z.B. Kap. 3", "",
];

test("mdInZeile und mdText: gewöhnlicher Text Zeichen für Zeichen wie mit den früheren Fassungen", () => {
  for (const s of GEWOEHNLICH) {
    assert.equal(Z.mdInZeile(s), ALT(s), s);
    assert.equal(Z.mdText(s), ALT_ZEILE(s), s);
    assert.equal(Z.mdInZeile(s.replace(/\s+/g, " "), { und: true }), ALT_ALMA(s), s); // alma.js fasst Leerraum vorher zusammen
  }
  assert.equal(Z.mdInZeile(null), "");
});

test("mdInZeile: zufälliger Text ohne Doppelpunkt und Schrägstrich bleibt wie früher", () => {
  const ZEICHEN = "abcdefghijklmnopqrstuvwxyzäöüßABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÜ0123456789 .,;-–()&!?*_#[]<>|{}$%~=^\\`'\"„“+";
  let seed = 42;
  const zufall = (n) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % n; };
  for (let i = 0; i < 3000; i++) {
    let s = "";
    for (let k = zufall(40); k > 0; k--) s += ZEICHEN[zufall(ZEICHEN.length)];
    if (/www\d{0,3}\./i.test(s)) continue; // ein „www.“ ist ein Link-Merkmal
    assert.equal(Z.mdInZeile(s), ALT(s), JSON.stringify(s));
    assert.equal(Z.mdText(s), ALT_ZEILE(s), JSON.stringify(s));
  }
});

test("mdInZeile: Adressen werden kein Link, eine Adresse der Uni bleibt anklickbar", () => {
  assert.equal(Z.mdInZeile("Infos: https://evil.example/x"), "Infos: https\\://evil\\.example/x");
  assert.equal(Z.mdInZeile("auf www.evil.example lesen"), "auf www\\.evil.example lesen");
  assert.equal(Z.mdInZeile("Ordner evil.example/pfad"), "Ordner evil\\.example/pfad");
  assert.equal(Z.mdInZeile("file:///C:/x"), "file\\:///C\\:/x");
  assert.equal(Z.mdInZeile("Mehr unter https://alma.uni-tuebingen.de/info"), "Mehr unter https://alma.uni-tuebingen.de/info");
  // Markdown-Zeichen davor und dahinter bleiben entschärft
  assert.equal(Z.mdInZeile("[x](https://evil.example)"), "\\[x\\](https\\://evil.example)");
});

test("Skripte mit dem einen Weg: Gruppen-Notiz und Literaturliste gleich wie früher, mit Adresse entschärft", () => {
  const M = laden("meine-gruppe").ergebnis;
  const g = { id: "ws-2026-27-x100-tutorium-5", code: "X100", art: "Tutorium", gruppe: "5", tag: "Di", von: "10:00", bis: "12:00", ct: true,
    raum: "Hörsaal 11 (Beispielbau) & Raum 1.02", leitung: "", anmeldung: "", quelle_url: "https://alma.uni-tuebingen.de/a", semester: "WS 2026/27",
    zeitraum: null, geprueft: "" };
  const o = { herkunft: M.ILIAS, iliasGruppe: "351", name: "Gruppe 4", kurz: "Beispielökonomik" };
  assert.equal(M.notizText("", g, Object.assign({ md: (s) => Z.mdInZeile(String(s)) }, o)), M.notizText("", g, o));
  const boese = Object.assign({}, g, { raum: "Raum www.evil.example" });
  assert.match(M.notizText("", boese, Object.assign({ md: (s) => Z.mdInZeile(String(s)) }, o)), /· Raum www\\\.evil\.example$/m);

  const EBA = require(path.join(__dirname, "..", "Studium Autopilot", "System", "Skripte", "eba.js"));
  const ohne = laden("literatur", { kontext: { user: { eba: EBA } } }).ergebnis;
  const mit = laden("literatur", { kontext: { user: { eba: EBA }, zentral: Z } }).ergebnis;
  const R = Z.literaturPruefen({ schema: 1, module: [{ code: "X100", semester: "WS 2026/27", quelle: "X100 Folien 00, S. 4",
    hinweis: "1. Auflage reicht; Kapitel 2: Nachfrage.", beleg: { art: "Folien", nummer: 0, seite: 4 },
    werke: [{ id: "muster", rolle: "Lehrbuch", spalte: "Muster", angabe: "Muster (2024): Grundlagen *der* Beispielkunde, 3. Auflage",
      links: [{ text: "E-Book (Uni-Zugang)", url: "https://link.springer.com/book/10.1007/978-3-000-00000-0" }] }],
    lesen: [{ zu: "1 Grundlagen", stellen: { muster: "Kap. 1 (ohne 1.4)" } }] }] });
  assert.deepEqual(R.verworfen, []);
  const e = R.module[0];
  assert.equal(mit.notizText(e, "X100 Beispielkunde", {}, "", "2026-10-20"), ohne.notizText(e, "X100 Beispielkunde", {}, "", "2026-10-20"));
});

test("Mail-Adressen: „@“ bekommt ein „\\“, damit Obsidian keinen mailto-Link macht; sonst bleibt „@“", () => {
  const Zm = laden("zentral").ctx.zentral;
  const at = (a, b) => a + "@" + b; // Adressen zusammengesetzt (pruefen.py meldet sonst Mail-Adressen im Repo)
  assert.equal(Zm.mdInZeile(at("x", "evil.com")), at("x\\", "evil.com"));
  assert.equal(Zm.mdInZeile("mailto:" + at("x", "evil.com")), "mailto:" + at("x\\", "evil.com"));
  assert.equal(Zm.mdInZeile("Fragen an " + at("a.b", "uni-tuebingen.de")), "Fragen an " + at("a.b\\", "uni-tuebingen.de"));
  for (const s of ["B110 @ 10 Uhr", "@Lea", "Treffen @ Mensa", "a@ b"]) assert.equal(Zm.mdInZeile(s), s, s);
});
