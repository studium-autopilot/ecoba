// Zentrale Kapitellisten (kapitel.json): Prüfung in zentral.js (kapitelPruefen) und die Lernplan-Notiz daraus in lernplan.js
// (zentralNotiz, zentralAuswahl): Häkchen, eigene Felder und „Meine Notizen“ bleiben, nur Module deines laufenden Semesters.
// Nur ausgedachte Module und Kapitel. Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { laden } = require("./laden.js");

const { kapitelPruefen } = laden("zentral").ctx.zentral;
const { zentralNotiz, zentralAuswahl, kapitelLesen, listeZeilen } = laden("lernplan").ergebnis;

const modul = (o) => Object.assign({ code: "X100", semester: "WS 2026/27", quelle: "Folien 00, S. 3", stand: "2026-10-18",
  kapitel: [{ nr: "1", titel: "Grundbegriffe", seiten: 40, folien: 1, teile: [{ nr: "1.1", titel: "Erster Teil" }, { nr: "1.2", titel: "Zweiter Teil" }] },
    { nr: "2", titel: "Märkte", folien: 2 }] }, o || {});

test("Prüfung: gültige Liste, Felder normalisiert, unbekannte Felder fallen weg", () => {
  const R = kapitelPruefen({ schema: 1, stand: "2026-10-19T06:30:00Z", module: [modul({ extra: "egal" })] });
  assert.equal(R.stand, "2026-10-19");
  assert.deepEqual(R.verworfen, []);
  assert.deepEqual(R.module[0], { code: "X100", semester: "WS 2026/27", quelle: "Folien 00, S. 3", stand: "2026-10-18", vorlaeufig: false,
    kapitel: [{ nr: "1", titel: "Grundbegriffe", seiten: 40, folien: 1, url: "", teile: [{ nr: "1.1", titel: "Erster Teil" }, { nr: "1.2", titel: "Zweiter Teil" }] },
      { nr: "2", titel: "Märkte", seiten: null, folien: 2, url: "", teile: [] }] });
});

test("Prüfung: ein schlechtes Kapitel verwirft sein Modul, die anderen bleiben; ganze Datei nur bei falschem Format", () => {
  const schlecht = (k) => modul({ code: "X200", kapitel: [k] });
  const R = kapitelPruefen({ schema: 1, module: [modul(),
    schlecht({ nr: "1", titel: "[[Link]] im Titel" }),
    schlecht({ nr: "1", titel: "Gut", url: "http://lehrbuch.example/1" }),
    modul({ code: "X300", kapitel: [{ nr: "1", titel: "Gut", url: "https://evil.example/1" }] }),
    modul({ code: "X400", kapitel: [{ nr: "1", titel: "A" }, { nr: "1", titel: "B" }] }),
    modul({ code: "X500", semester: "Winter 26" }),
    modul({ code: "X100" }),
  ] });
  assert.deepEqual(R.module.map((m) => m.code), ["X100"]);
  assert.deepEqual(R.verworfen.map((v) => v.id + ": " + v.grund), [
    "X200 WS 2026/27: kapitel 1: titel unzulässig",
    "X200 WS 2026/27: doppelt",
    "X300 WS 2026/27: kapitel 1: url: Domain nicht erlaubt: evil.example",
    "X400 WS 2026/27: doppelte Kapitelnummer",
    "X500 Winter 26: semester ungültig",
    "X100 WS 2026/27: doppelt",
  ]);
  assert.ok(kapitelPruefen({ schema: 2, module: [] }).fehler);
  assert.ok(kapitelPruefen({ schema: 1 }).fehler);
});

test("Prüfung: Lehrbuch-Link nur auf erlaubten Seiten (Uni, CORE), Seiten und Folien als ganze Zahlen", () => {
  const ok = kapitelPruefen({ schema: 1, module: [modul({ kapitel: [{ nr: "3", titel: "Knappheit", url: "https://books.core-econ.org/the-economy-v1/book/de/text/03.html" }] })] });
  assert.equal(ok.module[0].kapitel[0].url, "https://books.core-econ.org/the-economy-v1/book/de/text/03.html");
  const nein = kapitelPruefen({ schema: 1, module: [modul({ kapitel: [{ nr: "1", titel: "A", seiten: 12.5 }] })] });
  assert.equal(nein.verworfen[0].grund, "kapitel 1: seiten ungültig");
});

test("Notiz: Kapitel als Aufgaben mit Folien-Nummer, Seiten und Unterkapiteln; liest sich mit kapitelLesen zurück", () => {
  const e = kapitelPruefen({ schema: 1, module: [modul({ kapitel: [{ nr: "I", titel: "Erster Teil", seiten: 13, folien: 1 },
    { nr: "II", titel: "Zweiter Teil", seiten: 20, folien: 1, teile: [{ nr: "2.1", titel: "Abschnitt" }] }] })] }).module[0];
  const text = zentralNotiz(e, "");
  assert.match(text, /^---\ntyp: lernplan\ncode: X100\nherkunft: zentral\nsemester: "WS 2026\/27"\n/);
  assert.match(text, /\n- \[ \] I Erster Teil · 13 S\.\n- \[ \] II Zweiter Teil · Folien 1 · 20 S\.\n {2}- \[ \] 2\.1 Abschnitt\n/,
    "Folien 1 steht nur, wenn sie von der Kapitelnummer abweicht (I = 1)");
  assert.match(text, /\n## Meine Notizen\n$/);
  const K = kapitelLesen(text);
  assert.deepEqual(K.map((k) => [k.nr, k.titel, k.folien, k.seiten]), [["I", "Erster Teil", null, 13], ["II", "Zweiter Teil", 1, 20]]);
});

test("Notiz: neue Liste behält Häkchen, seit/verstanden_bis und „Meine Notizen“; sonst unverändert = gleicher Text", () => {
  const e1 = kapitelPruefen({ schema: 1, module: [modul()] }).module[0];
  let alt = zentralNotiz(e1, "");
  alt = alt.replace("- [ ] 1 Grundbegriffe", "- [x] 1 Grundbegriffe").replace("  - [ ] 1.2 Zweiter Teil", "  - [x] 1.2 Zweiter Teil")
    .replace("stand: 2026-10-18\n", "stand: 2026-10-18\nseit: 2026-11-02\n").replace("## Meine Notizen\n", "## Meine Notizen\n\nKapitel 2 mit Altklausur üben.\n");
  assert.equal(zentralNotiz(e1, alt), alt, "nichts geändert");
  const e2 = kapitelPruefen({ schema: 1, module: [modul({ stand: "2026-10-25", kapitel: e1.kapitel.concat([{ nr: "3", titel: "Neu", folien: 3 }]) })] }).module[0];
  const neu = zentralNotiz(e2, alt);
  assert.match(neu, /\n- \[x\] 1 Grundbegriffe · 40 S\.\n {2}- \[ \] 1\.1 Erster Teil\n {2}- \[x\] 1\.2 Zweiter Teil\n- \[ \] 2 Märkte\n- \[ \] 3 Neu\n/);
  assert.match(neu, /\nseit: 2026-11-02\n/);
  assert.match(neu, /\nstand: 2026-10-25\n/);
  assert.match(neu, /## Meine Notizen\n\nKapitel 2 mit Altklausur üben\.\n$/);
});

test("Notiz: Häkchen gehen mit dem Titel, nicht mit der Nummer (eingefügtes, verschobenes, ersetztes Kapitel)", () => {
  const liste = (kapitel) => kapitelPruefen({ schema: 1, module: [modul({ kapitel })] }).module[0];
  const vorher = liste([{ nr: "1", titel: "Grundbegriffe", teile: [{ nr: "1.1", titel: "Märkte" }, { nr: "1.2", titel: "Preise" }] },
    { nr: "2", titel: "Angebot" }, { nr: "3", titel: "Nachfrage" }]);
  const alt = zentralNotiz(vorher, "")
    .replace("- [ ] 1 Grundbegriffe", "- [x] 1 Grundbegriffe").replace("  - [ ] 1.2 Preise", "  - [x] 1.2 Preise").replace("- [ ] 2 Angebot", "- [x] 2 Angebot");
  // Neu: Kapitel 2 eingefügt (Angebot wird 3), Nachfrage ersetzt durch ein anderes Kapitel 4, Preise wandert nach 2.1
  const neu = zentralNotiz(liste([{ nr: "1", titel: "Grundbegriffe", teile: [{ nr: "1.1", titel: "Märkte" }] },
    { nr: "2", titel: "Haushalte", teile: [{ nr: "2.1", titel: "preise" }] }, { nr: "3", titel: "Angebot" }, { nr: "4", titel: "Wettbewerb" }]), alt, listeZeilen(vorher));
  assert.deepEqual(kapitelLesen(neu).map((k) => [k.nr, k.titel, k.fertig, k.teile.map((t) => t.nr + (t.fertig ? " x" : ""))]), [
    ["1", "Grundbegriffe", true, ["1.1"]],
    ["2", "Haushalte", false, ["2.1 x"]],
    ["3", "Angebot", true, []],
    ["4", "Wettbewerb", false, []],
  ]);
  // Gleiche Nummer, anderer Titel: kein Häkchen; gleicher Titel zweimal: zuerst das mit gleicher Nummer
  const uebung = liste([{ nr: "1", titel: "Übung" }, { nr: "2", titel: "Übung" }]);
  const zwei = zentralNotiz(uebung, "").replace("- [ ] 2 Übung", "- [x] 2 Übung");
  assert.deepEqual(kapitelLesen(zentralNotiz(uebung, zwei, listeZeilen(uebung))).map((k) => k.fertig), [false, true]);
  assert.deepEqual(kapitelLesen(zentralNotiz(liste([{ nr: "2", titel: "Etwas anderes" }]), zwei, listeZeilen(uebung))).map((k) => k.fertig), [false]);
});

test("Notiz: Nummern wie E1, 1a und A.1 haben je ihr eigenes Häkchen; eigene Aufgaben ohne Nummer bleiben, alte Kapitel nicht", () => {
  const e = kapitelPruefen({ schema: 1, module: [modul({ kapitel: [{ nr: "E1", titel: "Einstieg" }, { nr: "1a", titel: "Teil A" }, { nr: "A.1", titel: "Anhang" }] })] }).module[0];
  const vorher = Object.assign({}, e, { kapitel: e.kapitel.concat([{ nr: "9", titel: "Gestrichenes Kapitel", teile: [] }]) });
  const alt = zentralNotiz(vorher, "").replace("- [ ] 1a Teil A", "- [x] 1a Teil A")
    .replace("- [ ] A.1 Anhang", "- [ ] A.1 Anhang\n- [ ] Altklausur 2025 rechnen\n  - [x] Aufgabe 1").replace("- [ ] 9 Gestrichenes", "- [x] 9 Gestrichenes");
  const K = kapitelLesen(alt);
  assert.deepEqual(K.map((k) => k.nr), ["E1", "1a", "A.1", "", "9"]);
  const neu = zentralNotiz(e, alt, listeZeilen(vorher));
  assert.deepEqual(kapitelLesen(neu).map((k) => [k.nr || k.titel, k.fertig]), [["E1", false], ["1a", true], ["A.1", false], ["Altklausur 2025 rechnen", false]]);
  assert.ok(neu.includes("- [ ] Altklausur 2025 rechnen\n  - [x] Aufgabe 1\n"), "eigene Aufgabe mit Unterpunkt bleibt");
  assert.ok(!neu.includes("Gestrichenes Kapitel"), "ein Kapitel, das die Liste nicht mehr hat, fällt weg");
  assert.equal(zentralNotiz(e, neu, listeZeilen(e)), neu, "stabil");
});

test("Notiz: eigene Aufgaben mit Nummer oder Großbuchstaben vorn bleiben samt Häkchen; Wortnummern der Liste gehen mit ihr", () => {
  const liste = (kapitel) => kapitelPruefen({ schema: 1, module: [modul({ kapitel })] }).module[0];
  const vorher = liste([{ nr: "1", titel: "Märkte" }, { nr: "Anhang", titel: "Literatur" }]);
  const alt = zentralNotiz(vorher, "")
    .replace("- [ ] 1 Märkte", "- [ ] 1 Märkte\n- [x] 3 Altklausuren rechnen\n- [ ] A und B wiederholen\nMein Satz dazu.");
  const neu = zentralNotiz(liste([{ nr: "1", titel: "Märkte" }, { nr: "2", titel: "Preise" }, { nr: "Anhang", titel: "Literaturliste" }]), alt, listeZeilen(vorher));
  assert.ok(neu.includes("- [ ] 1 Märkte\n- [x] 3 Altklausuren rechnen\n- [ ] A und B wiederholen\nMein Satz dazu.\n\n- [ ] 2 Preise"),
    "eigene Aufgaben und der Satz bleiben hinter ihrem Kapitel");
  assert.ok(neu.includes("- [ ] Anhang Literaturliste") && !/Anhang Literatur(\n|$)/.test(neu), "alte Zeile der Liste mit Wortnummer fällt weg");
  // Ohne bekannte alte Liste (älterer Stand) bleibt im Zweifel alles mit Nummer, was keinem Kapitel entspricht
  assert.ok(zentralNotiz(liste([{ nr: "1", titel: "Märkte" }]), alt).includes("- [x] 3 Altklausuren rechnen"));
});

// Ein Gerät mit eigenem gerätelokalem Speicher an einem gemeinsamen Tresor (tresor.dateien, tresor.frontmatter: was der Sync teilt).
// schritte: was an Lernplan-Notizen geschrieben wurde.
const ABRUF = "System/Daten/abruf.json", P = "Lernplan/X100 Lernplan.md";
const LISTE = { code: "X100", semester: "WS 2026/27", quelle: "Folien", stand: "2026-10-19", vorlaeufig: false,
  kapitel: [{ nr: "1", titel: "Einführung", seiten: 30, folien: 1, url: "", teile: [] }, { nr: "2", titel: "Märkte", seiten: null, folien: 2, url: "", teile: [] }] };
const geraet = (tresor, o) => {
  const { dateien, frontmatter } = tresor, schritte = [];
  const lokal = { speicher: Object.assign({}, o && o.speicher), liste: (o && o.liste) || LISTE };
  const { ctx, ergebnis: L } = laden("lernplan", { heute: "2026-10-19", frontmatter, kontext: {
    zentral: { kapitel: () => ({ module: [lokal.liste] }), abruferHier: async () => true },
    modell: { daten: () => ({ module: [{ code: "X100", status: "geplant", semester: "WS 2026/27" }] }), semesterFuer: () => ({ name: "WS 2026/27" }) },
  } });
  const V = ctx.app.vault;
  V.getAbstractFileByPath = (p) => (p in dateien ? { path: p, basename: p.split("/").pop().replace(/\.\w+$/, ""), extension: "md" } : p === "Lernplan" ? { path: p } : null);
  V.createFolder = async () => {};
  V.create = async (p, t) => { dateien[p] = t; frontmatter[p] = { typ: "lernplan", herkunft: "zentral" }; schritte.push("neu"); };
  V.read = async (f) => dateien[f.path];
  V.process = async (f, fn) => { dateien[f.path] = fn(dateien[f.path]); if (f.path !== ABRUF) schritte.push("neu geschrieben"); };
  ctx.app.loadLocalStorage = (k) => (k in lokal.speicher ? lokal.speicher[k] : null);
  ctx.app.saveLocalStorage = (k, v) => { if (v == null) delete lokal.speicher[k]; else lokal.speicher[k] = JSON.parse(JSON.stringify(v)); };
  return { L, schritte, lokal };
};
const neuerTresor = () => ({ dateien: { [ABRUF]: JSON.stringify({ geraet: "g-pc", zuletzt: "2026-10-19T10:00:00Z", angewendet: { t1: "abc" } }, null, 1) + "\n" }, frontmatter: {} });
const mitKapitel3 = (l) => Object.assign({}, l, { kapitel: l.kapitel.concat([{ nr: "3", titel: "Preise", seiten: null, folien: 3, url: "", teile: [] }]) });

test("Abgleich: gleiche Liste fasst die Notiz nicht an (Eigenes bleibt), eine neue Liste schreibt sie mit Häkchen neu", async () => {
  const tresor = neuerTresor(), { dateien } = tresor;
  const pc = geraet(tresor);
  await pc.L.zentralAbgleichen();
  assert.deepEqual(pc.schritte, ["neu"]);
  const abruf = JSON.parse(dateien[ABRUF]);
  assert.deepEqual(Object.keys(abruf.lernplan.angewendet), ["X100"], "geschriebene Liste steht im Tresor");
  assert.equal(abruf.lernplan.zeilen.X100.length, 2, "dazu ihre Kapitelzeilen");
  assert.deepEqual(abruf.angewendet, { t1: "abc" }, "Grabsteine der Termine und Sperre bleiben");
  assert.equal(abruf.geraet, "g-pc");
  dateien[P] = dateien[P].replace("- [ ] 1 Einführung", "- [x] 1 Einführung").replace("## Kapitel\n", "## Kapitel\n\nMein Satz.\n");
  await pc.L.zentralAbgleichen();
  assert.deepEqual(pc.schritte, ["neu"], "gleiche Liste: kein Schreiben bei jedem Start");
  assert.ok(dateien[P].includes("Mein Satz."));
  pc.lokal.liste = mitKapitel3(LISTE);
  await pc.L.zentralAbgleichen();
  assert.deepEqual(pc.schritte, ["neu", "neu geschrieben"], "neue Liste: neu geschrieben");
  assert.ok(dateien[P].includes("- [x] 1 Einführung") && dateien[P].includes("3 Preise"), "Häkchen bleiben, neues Kapitel da");
  assert.ok(dateien[P].includes("## Kapitel\n\nMein Satz.\n\n- [x] 1 Einführung"), "eigener Satz bleibt an seiner Stelle");
});

test("Abgleich: ein anderer Abrufer (iPad nach dem PC) kennt den Stand aus dem Tresor; gelöscht bleibt gelöscht, Eigenes bleibt", async () => {
  const tresor = neuerTresor(), { dateien } = tresor;
  const pc = geraet(tresor);
  await pc.L.zentralAbgleichen();
  dateien[P] = dateien[P].replace("herkunft: zentral\n", "herkunft: zentral\ntags:\n  - pruefung\n").replace("- [ ] 2 Märkte", "- [ ] 2 Märkte\n  Übungsblatt 2 zuerst");
  const ipad = geraet(tresor);
  await ipad.L.zentralAbgleichen();
  assert.deepEqual(ipad.schritte, [], "gleiche Liste: das iPad schreibt nichts neu");
  ipad.lokal.liste = mitKapitel3(LISTE);
  await ipad.L.zentralAbgleichen();
  assert.deepEqual(ipad.schritte, ["neu geschrieben"]);
  assert.ok(dateien[P].includes("\ntags:\n  - pruefung\ncssclasses:"), "eigene Eigenschaft bleibt");
  assert.ok(dateien[P].includes("- [ ] 2 Märkte\n  Übungsblatt 2 zuerst\n- [ ] 3 Preise"), "eigene Zeile bleibt unter ihrem Kapitel");
  delete dateien[P];
  await ipad.L.zentralAbgleichen();
  await geraet(tresor, { liste: mitKapitel3(LISTE) }).L.zentralAbgleichen();
  assert.equal(dateien[P], undefined, "von dir gelöscht: kein Gerät legt sie mit derselben Liste wieder an");
  const neu = geraet(tresor, { liste: Object.assign(mitKapitel3(LISTE), { stand: "2026-10-26" }) });
  await neu.L.zentralAbgleichen();
  assert.deepEqual(neu.schritte, ["neu"], "neue Liste: wieder da");
});

test("Abgleich: Übergang vom gerätelokalen Stand: eine dort gemerkte, gelöschte Notiz bleibt weg, der alte Speicher wird geleert", async () => {
  const tresor = neuerTresor();
  const alt = geraet(tresor, { speicher: { "eba-lernplan-zentral": { X100: JSON.stringify(LISTE) } } });
  await alt.L.zentralAbgleichen();
  assert.deepEqual(alt.schritte, [], "früher auf diesem Gerät geschrieben und dann gelöscht");
  assert.equal(alt.lokal.speicher["eba-lernplan-zentral"], undefined, "alter Speicher geleert");
  assert.ok(JSON.parse(tresor.dateien[ABRUF]).lernplan.angewendet.X100, "jetzt im Tresor gemerkt");
  await geraet(tresor).L.zentralAbgleichen();
  assert.equal(tresor.dateien[P], undefined, "auch ein anderes Gerät legt sie nicht an");
});

test("Abgleich: alte gerätelokale Liste sagt, welche Aufgaben aus ihr stammen; eigene mit Nummer bleiben", async () => {
  const tresor = neuerTresor(), { dateien } = tresor;
  const pc = geraet(tresor);
  await pc.L.zentralAbgleichen();
  // Stand wie vor dem Tresor-Feld: nur der gerätelokale Speicher mit der alten Liste
  const abruf = JSON.parse(dateien[ABRUF]);
  delete abruf.lernplan;
  dateien[ABRUF] = JSON.stringify(abruf);
  dateien[P] = dateien[P].replace("- [ ] 2 Märkte", "- [ ] 2 Märkte\n- [x] 4 Altklausur rechnen");
  const neu = Object.assign({}, LISTE, { kapitel: [LISTE.kapitel[0], { nr: "2", titel: "Preise", seiten: null, folien: 2, url: "", teile: [] }] });
  const alt = geraet(tresor, { liste: neu, speicher: { "eba-lernplan-zentral": { X100: JSON.stringify(LISTE) } } });
  await alt.L.zentralAbgleichen();
  assert.ok(dateien[P].includes("- [x] 4 Altklausur rechnen") && !dateien[P].includes("2 Märkte"), "Märkte war aus der Liste, die Altklausur deine");
});

test("Abgleich: ohne lesbaren Stand schreibt kein Gerät; fehlt nur das Feld, gilt die Kopie dieses Geräts", async () => {
  const tresor = neuerTresor(), { dateien } = tresor;
  const pc = geraet(tresor);
  await pc.L.zentralAbgleichen();
  delete dateien[P];
  const sicherung = dateien[ABRUF];
  delete dateien[ABRUF];
  const neu = geraet(tresor);
  await neu.L.zentralAbgleichen();
  dateien[ABRUF] = "{ kaputt";
  await neu.L.zentralAbgleichen();
  assert.deepEqual(neu.schritte, [], "Datei fehlt oder ist unlesbar: nichts angelegt");
  dateien[ABRUF] = JSON.stringify({ geraet: "g-pc", zuletzt: "2026-10-19T11:00:00Z" }); // eben neu angelegt, ohne „lernplan“
  await pc.L.zentralAbgleichen();
  assert.deepEqual(pc.schritte, ["neu"], "die Kopie weiß: von dir gelöscht");
  assert.deepEqual(JSON.parse(dateien[ABRUF]).lernplan, JSON.parse(sicherung).lernplan, "und schreibt den Stand zurück");
});

test("Auswahl: nur das laufende Semester und Module deines Plans (oder läuft/angemeldet), nie bestandene", () => {
  const D = { module: [
    { code: "X100", semester: "WS 2026/27", status: "offen" },
    { code: "X200", semester: "SS 2027", status: "läuft" },
    { code: "X300", semester: "SS 2027", status: "offen" },
    { code: "X400", semester: "WS 2026/27", status: "bestanden" },
  ] };
  const E = ["X100", "X200", "X300", "X400", "X999"].map((code) => ({ code, semester: "WS 2026/27" })).concat([{ code: "X100", semester: "SS 2027" }]);
  assert.deepEqual(zentralAuswahl(E, D, "WS 2026/27").map((e) => e.code + " " + e.semester), ["X100 WS 2026/27", "X200 WS 2026/27"]);
});
