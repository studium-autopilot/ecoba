// Zentrale Literaturlisten (literatur.json): Prüfung und Abruf in zentral.js (literaturPruefen, gerätelokaler Stand) und die Notiz
// „<Code> Literatur 00 Literaturliste“ daraus in literatur.js: Text, Links auf Unterlagen im Tresor, Status und „Meine Notizen“
// bleiben, ein Schreiber, gelöscht bleibt gelöscht, Übernahme einer Notiz ohne herkunft. Nur ausgedachte Module und Werke.
// Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { laden } = require("./laden.js");
const { frontmatter } = require("./stundenplan-attrappe.js");

const EBA = require(path.join(__dirname, "..", "Studium Autopilot", "System", "Skripte", "eba.js"));
const { literaturPruefen } = laden("zentral").ctx.zentral;

const SPRINGER = "https://link.springer.com/book/10.1007/978-3-000-00000-0";
const roh = (o) => Object.assign({
  code: "X100", semester: "WS 2026/27", stand: "2026-10-20", quelle: "X100 Folien 00, S. 4",
  hinweis: "Lehrbücher der Vorlesung; die Folien nennen je Kapitel die passenden Stellen.",
  beleg: { art: "Folien", nummer: 0, seite: 4 },
  werke: [
    { id: "muster", rolle: "Lehrbuch", spalte: "Muster", angabe: "Muster, Beispiel (2024): Grundlagen der Beispielkunde, 3. Auflage, Beispielverlag",
      hinweis: "Auch als Ausleihexemplar.", katalog: "123456789X", links: [{ text: "E-Book (Uni-Zugang)", url: SPRINGER }] },
    { id: "probe", rolle: "Ergänzend", spalte: "Probe", angabe: "Probe (2020): Übungsbuch Beispielkunde, Beispielverlag",
      links: [{ text: "Kapitel 1 als PDF", unterlage: { art: "Literatur", nummer: 1 } }] },
    { id: "lesestoff", rolle: "Begleitend", abschnitt: "weitere", angabe: "Lesestoff (2019): Zahlen im Alltag, Beispielverlag", suche: "Lesestoff Zahlen im Alltag" },
  ],
  lesen: [
    { zu: "1 Grundlagen", beleg: { art: "Folien", nummer: 1, seite: 12 }, stellen: { muster: "Kap. 1", probe: "Abschn. 1.1–1.3" } },
    { zu: "2 Anwendungen", stellen: { muster: "Kap. 2 (ohne 2.4)" } },
  ],
}, o || {});
const geprueft = (o) => { const R = literaturPruefen({ schema: 1, module: [roh(o)] }); assert.deepEqual(R.verworfen, []); return R.module[0]; };

test("Prüfung: gültige Liste, Felder normalisiert, unbekannte Felder fallen weg", () => {
  const R = literaturPruefen({ schema: 1, stand: "2026-10-24T06:00:00Z", module: [roh({ extra: "egal", kopf: "" })] });
  assert.equal(R.stand, "2026-10-24");
  assert.deepEqual(R.verworfen, []);
  const m = R.module[0];
  assert.deepEqual(Object.keys(m), ["code", "semester", "stand", "quelle", "hinweis", "kopf", "beleg", "werke", "lesen"]);
  assert.equal(m.kopf, "Kapitel", "ohne kopf heißt die erste Spalte „Kapitel“");
  assert.deepEqual(m.werke[1], { id: "probe", rolle: "Ergänzend", angabe: "Probe (2020): Übungsbuch Beispielkunde, Beispielverlag", abschnitt: "haupt",
    spalte: "Probe", hinweis: "", katalog: "", suche: "", links: [{ text: "Kapitel 1 als PDF", unterlage: { art: "Literatur", nummer: 1, seite: null } }] });
  assert.deepEqual(m.lesen[1], { zu: "2 Anwendungen", beleg: null, stellen: { muster: "Kap. 2 (ohne 2.4)" } });
});

test("Prüfung: ein schlechter Teil verwirft sein Modul, die anderen bleiben; ganze Datei nur bei falschem Format", () => {
  const werk = (w) => roh({ code: "X200", werke: [Object.assign({ id: "a", rolle: "Lehrbuch", angabe: "A (2020): Buch" }, w)], lesen: [] });
  const R = literaturPruefen({ schema: 1, module: [roh(),
    werk({ links: [{ text: "Online", url: "https://evil.example/buch" }] }),
    roh({ code: "X300", lesen: [{ zu: "1", stellen: { lesestoff: "Kap. 1" } }] }),
    roh({ code: "X400", werke: roh().werke.concat([roh().werke[0]]) }),
    roh({ code: "X500", beleg: { art: "Mitschrift", nummer: 1 } }),
    roh({ code: "X600", quelle: "" }),
    roh({ code: "X700", werke: [] }),
    roh(),
  ] });
  assert.deepEqual(R.module.map((m) => m.code), ["X100"]);
  assert.deepEqual(R.verworfen.map((v) => v.id + ": " + v.grund), [
    "X200 WS 2026/27: werk a: link: Domain nicht erlaubt: evil.example",
    "X300 WS 2026/27: lesen: Werk lesestoff ohne Spalte",
    "X400 WS 2026/27: doppelte Werk-id",
    "X500 WS 2026/27: beleg ungültig",
    "X600 WS 2026/27: quelle fehlt",
    "X700 WS 2026/27: werke ungültig",
    "X100 WS 2026/27: doppelt",
  ]);
  const grund = (w) => literaturPruefen({ schema: 1, module: [werk(w)] }).verworfen[0].grund;
  assert.equal(grund({ links: [{ text: "Online", url: SPRINGER + "?token=abc" }] }), "werk a: link: Link mit Sitzung oder Schlüssel");
  assert.equal(grund({ links: [{ text: "Online", url: "https://doi.org/10.0000/x?sid=1" }] }), "werk a: link: Link mit Sitzung oder Schlüssel");
  assert.equal(grund({ links: [{ text: "Online", url: "https://doi.org/10.0000/x;jsessionid=1" }] }), "werk a: link: Link mit Sitzung oder Schlüssel");
  assert.equal(grund({ links: [{ text: "Online", url: "http://doi.org/10.0000/x" }] }), "werk a: link: Link nicht https");
  assert.equal(grund({ katalog: "12" }), "werk a: katalog ungültig");
  assert.equal(grund({ angabe: "[[Fremde Notiz]]" }), "werk a: angabe unzulässig");
  assert.equal(grund({ abschnitt: "spaeter" }), "werk a: abschnitt ungültig");
  assert.equal(grund({ links: [{ text: "Ohne Ziel" }] }), "werk a: link: Ziel fehlt");
  assert.ok(literaturPruefen({ schema: 2, module: [] }).fehler);
  assert.ok(literaturPruefen({ schema: 1 }).fehler);
  assert.ok(literaturPruefen({ schema: 1, module: new Array(61).fill(roh()) }).fehler, "höchstens 60 Module");
});

// ---------- Ein Gerät an einem Tresor im Speicher ----------
// tresor: { dateien: Map Pfad → Text, ordner: Set }; was der Sync teilt. schritte: geschriebene Literaturlisten.
const ABRUF = "System/Daten/abruf.json", ORDNER = "Unterlagen/X100 Beispielkunde";
const P = ORDNER + "/Literatur/X100 Literatur 00 Literaturliste.md";
const MODUL = { code: "X100", status: "offen", semester: "WS 2026/27", titel: "Beispielkunde", fm: { titel: "Beispielkunde" }, f: { basename: "X100 Beispielkunde" } };
const neuerTresor = () => ({
  dateien: new Map([[ABRUF, JSON.stringify({ geraet: "g-pc", zuletzt: "2026-10-20T10:00:00Z", angewendet: { t1: "abc" }, lernplan: { angewendet: { X100: "k" }, zeilen: {} } }, null, 1) + "\n"]]),
  ordner: new Set(["System", "System/Daten", "Unterlagen", ORDNER, ORDNER + "/Vorlesung"]),
});
const geraet = (tresor, o) => {
  o = o || {};
  const { dateien, ordner } = tresor, schritte = [], speicher = {};
  const lokal = { liste: o.liste || geprueft(), abrufer: o.abrufer !== false, module: o.module || [MODUL] };
  const { ctx, ergebnis: L } = laden("literatur", { heute: "2026-10-20", kontext: {
    zentral: { literatur: () => ({ module: [lokal.liste] }), abruferHier: async () => lokal.abrufer },
    modell: { daten: () => ({ module: lokal.module }), semesterFuer: () => ({ name: "WS 2026/27" }) },
    user: { eba: EBA },
  } });
  const V = ctx.app.vault;
  const name = (p) => p.split("/").pop();
  const elternVon = (p) => p.split("/").slice(0, -1).join("/");
  const datei = (p) => ({ path: p, name: name(p), basename: name(p).replace(/\.\w+$/, ""), extension: name(p).split(".").pop() });
  V.getAbstractFileByPath = (p) => {
    if (dateien.has(p)) return datei(p);
    if (!ordner.has(p)) return null;
    const kinder = [...ordner].filter((x) => elternVon(x) === p).map((x) => ({ path: x, name: name(x), children: [] }))
      .concat([...dateien.keys()].filter((x) => elternVon(x) === p).map(datei));
    return { path: p, name: name(p), children: kinder };
  };
  V.getMarkdownFiles = () => [...dateien.keys()].filter((p) => p.endsWith(".md")).map(datei);
  V.read = async (f) => dateien.get(f.path);
  V.process = async (f, fn) => { const t = fn(dateien.get(f.path)); dateien.set(f.path, t); if (f.path !== ABRUF) schritte.push("neu geschrieben: " + f.path); };
  V.create = async (p, t) => {
    if (dateien.has(p)) throw new Error("gibt es schon: " + p);
    if (!ordner.has(elternVon(p))) throw new Error("Ordner fehlt: " + elternVon(p));
    dateien.set(p, t); schritte.push("neu: " + p);
  };
  V.createFolder = async (p) => { if (!ordner.has(elternVon(p)) && elternVon(p)) throw new Error("Elternordner fehlt: " + p); ordner.add(p); };
  ctx.app.metadataCache.getFileCache = (f) => { const t = f && f.path.endsWith(".md") ? dateien.get(f.path) : null; return t ? { frontmatter: frontmatter(t) || {} } : null; };
  ctx.app.loadLocalStorage = (k) => (k in speicher ? speicher[k] : null);
  ctx.app.saveLocalStorage = (k, v) => { if (v == null) delete speicher[k]; else speicher[k] = JSON.parse(JSON.stringify(v)); };
  return { L, ctx, schritte, lokal, speicher };
};
// Begleitnotiz einer Unterlage wie unterlagen.js (nur die Felder, die literatur.js liest), dazu ihre Datei
const unterlage = (tresor, ordner, art, nummer, titel) => {
  const n = `X100 ${art} ${String(nummer).padStart(2, "0")} ${titel}`;
  tresor.ordner.add(ordner);
  tresor.dateien.set(`${ordner}/${n}.pdf`, "%PDF");
  tresor.dateien.set(`${ordner}/${n}.md`, ["---", "typ: unterlage", 'code: "X100"', `art: "${art}"`, `nummer: ${nummer}`, `datei: "[[${n}.pdf]]"`, "status: neu", "---", "", `# ${n}`, ""].join("\n"));
};

const ERWARTET = `---
typ: unterlage
code: "X100"
modul: "[[X100 Beispielkunde]]"
art: "Literatur"
nummer: 0
titel: "Literaturliste"
datei: ""
link: "${SPRINGER}"
original: ""
format: ""
seiten:
semester: "WS 2026/27"
status: neu
datum: 2026-10-20
quelle: "X100 Folien 00, S. 4"
herkunft: zentral
literatur_id: x100
uebersicht: "[[Unterlagen]]"
cssclasses:
  - eba-s-begleitnotiz
tags:
  - unterlage
---

# X100 · Literatur 00 · Literaturliste

## Das Wichtigste
Lehrbücher der Vorlesung; die Folien nennen je Kapitel die passenden Stellen. → Folien 00, S. 4

- **Lehrbuch:** Muster, Beispiel (2024): Grundlagen der Beispielkunde, 3. Auflage, Beispielverlag. Auch als Ausleihexemplar. · [E-Book (Uni-Zugang) ↗](${SPRINGER}) · [UB-Katalog ↗](https://rds-tue.ibs-bw.de/opac/RDSIndexrecord/123456789X)
- **Ergänzend:** Probe (2020): Übungsbuch Beispielkunde, Beispielverlag.

## Lesen je Kapitel
| Kapitel | Muster | Probe |
| --- | --- | --- |
| 1 Grundlagen · Folien 01, S. 12 | Kap. 1 | Abschn. 1.1–1.3 |
| 2 Anwendungen | Kap. 2 (ohne 2.4) | – |

## Weitere Literatur
- **Begleitend:** Lesestoff (2019): Zahlen im Alltag, Beispielverlag. · [UB-Katalog ↗](https://rds-tue.ibs-bw.de/opac/RDSIndex/Search?lookfor=Lesestoff+Zahlen+im+Alltag&type=AllFields)

## Meine Notizen
`;

test("Notiz: Werke, Tabelle und weitere Literatur; Folien ohne Unterlage im Tresor stehen als Text da", async () => {
  const tresor = neuerTresor(), pc = geraet(tresor);
  await pc.L.abgleichen();
  assert.deepEqual(pc.schritte, ["neu: " + P]);
  assert.equal(tresor.dateien.get(P), ERWARTET);
  const abruf = JSON.parse(tresor.dateien.get(ABRUF));
  assert.deepEqual(Object.keys(abruf.literatur.angewendet), ["X100"], "geschriebene Liste steht im Tresor");
  assert.deepEqual(Object.keys(abruf.literatur.ziele), ["X100"]);
  assert.deepEqual([abruf.geraet, abruf.angewendet, abruf.lernplan.angewendet], ["g-pc", { t1: "abc" }, { X100: "k" }], "Sperre, Grabsteine und Lernplan bleiben");
});

test("Notiz: Folien und Unterlagen im Tresor werden Links (PDF mit Seite); neue Folien schreiben die Notiz neu, Eigenes bleibt", async () => {
  const tresor = neuerTresor(), pc = geraet(tresor);
  await pc.L.abgleichen();
  // Du liest und schreibst mit; danach kommen Folien und das Kapitel als PDF dazu
  tresor.dateien.set(P, tresor.dateien.get(P).replace("status: neu", "status: gelesen").replace("tags:\n  - unterlage", "tags:\n  - unterlage\n  - pruefung")
    .replace("cssclasses:", "eigenes: ja\ncssclasses:") + "\nKapitel 2 zuerst.\n");
  await pc.L.abgleichen();
  assert.deepEqual(pc.schritte, ["neu: " + P], "gleiche Liste, gleiche Unterlagen: kein Schreiben bei jedem Start");
  unterlage(tresor, ORDNER + "/Vorlesung", "Folien", 0, "Einführung");
  unterlage(tresor, ORDNER + "/Vorlesung", "Folien", 1, "Grundlagen");
  unterlage(tresor, ORDNER, "Literatur", 1, "Probe Kapitel 1");
  await pc.L.abgleichen();
  assert.deepEqual(pc.schritte, ["neu: " + P, "neu geschrieben: " + P]);
  const t = tresor.dateien.get(P);
  assert.ok(t.includes("Stellen. → [[X100 Folien 00 Einführung.pdf#page=4|Folien 00, S. 4]]\n"), "Beleg mit Seite");
  assert.ok(t.includes("Beispielverlag. · [[X100 Literatur 01 Probe Kapitel 1.pdf|Kapitel 1 als PDF]]\n"), "Link auf die Unterlage");
  assert.ok(t.includes("| 1 Grundlagen · [[X100 Folien 01 Grundlagen.pdf#page=12\\|S. 12]] | Kap. 1 |"), "Seite in der Tabelle");
  assert.ok(t.includes("\nstatus: gelesen\n") && t.includes("\neigenes: ja\n") && t.includes("  - unterlage\n  - pruefung\n---"), "Status, eigene Felder, Tags bleiben");
  assert.ok(t.endsWith("## Meine Notizen\n\nKapitel 2 zuerst.\n"), "dein Text bleibt");
  assert.equal(frontmatter(t).herkunft, "zentral");
  assert.equal(pc.L.notizText(geprueft(), "X100 Beispielkunde", pc.L.zieleVon(geprueft(), {}), ERWARTET, "2026-10-21"), ERWARTET, "stabil");
});

test("Notiz: Markdown in den Daten ist entschärft, auch eine Liste am Zeilenanfang", () => {
  const { L } = geraet(neuerTresor());
  const e = geprueft({ hinweis: "1. Auflage reicht.", werke: [{ id: "a", rolle: "Lehrbuch", angabe: "A (2020): Formeln *fett* mit $x$ und #tag" }], lesen: [] });
  const t = L.notizText(e, "X100 Beispielkunde", {}, "", "2026-10-20");
  assert.ok(t.includes("\n1\\. Auflage reicht. → Folien 00, S. 4\n"));
  assert.ok(t.includes("- **Lehrbuch:** A (2020): Formeln \\*fett\\* mit \\$x\\$ und \\#tag.\n"));
  assert.ok(!t.includes("## Lesen je"), "ohne Stellen keine Tabelle");
  assert.ok(t.includes('link: ""'), "ohne Online-Fassung kein ↗");
});

test("Abgleich: von dir gelöscht bleibt gelöscht (auch für ein anderes Gerät), eine neue Liste legt sie wieder an", async () => {
  const tresor = neuerTresor(), pc = geraet(tresor);
  await pc.L.abgleichen();
  tresor.dateien.delete(P);
  await pc.L.abgleichen();
  await geraet(tresor).L.abgleichen();
  assert.equal(tresor.dateien.get(P), undefined);
  const ipad = geraet(tresor, { liste: geprueft({ stand: "2026-10-27" }) });
  await ipad.L.abgleichen();
  assert.deepEqual(ipad.schritte, ["neu: " + P]);
});

test("Abgleich: Ordner wie unterlagen.js, wenn es noch keinen gibt; eine fremde Notiz unter dem Namen bleibt", async () => {
  const tresor = { dateien: neuerTresor().dateien, ordner: new Set(["System", "System/Daten"]) };
  const m = Object.assign({}, MODUL, { fm: { titel: "Beispielkunde: Grundlagen und Anwendungen" } });
  const pc = geraet(tresor, { module: [m] });
  await pc.L.abgleichen();
  const p = "Unterlagen/X100 Beispielkunde – Grundlagen und Anwendungen/Literatur/X100 Literatur 00 Literaturliste.md";
  assert.deepEqual(pc.schritte, ["neu: " + p]);
  const fremd = neuerTresor();
  fremd.ordner.add(ORDNER + "/Literatur");
  fremd.dateien.set(P, "---\ntyp: notiz\n---\n\nMeine eigene Liste.\n");
  const g = geraet(fremd);
  await g.L.abgleichen();
  assert.deepEqual(g.schritte, []);
  assert.equal(fremd.dateien.get(P), "---\ntyp: notiz\n---\n\nMeine eigene Liste.\n");
});

test("Übernahme: eine Literaturliste ohne herkunft wird an ihrem Ort die zentrale, Status, Datum und „Meine Notizen“ bleiben", async () => {
  const tresor = neuerTresor(), alt = ORDNER + "/X100 Literatur 00 Literaturliste.md";
  tresor.dateien.set(alt, ["---", "typ: unterlage", 'code: "X100"', 'art: "Literatur"', "nummer: 0", "status: gelesen", "datum: 2026-10-19",
    "literatur_id: x100", "cssclasses:", "  - eba-s-begleitnotiz", "tags:", "  - unterlage", "---", "", "# X100 · Literatur 00 · Literaturliste", "",
    "Alter Text.", "", "## Meine Notizen", "", "Mein Text.", ""].join("\n"));
  const pc = geraet(tresor);
  await pc.L.abgleichen();
  assert.deepEqual(pc.schritte, ["neu geschrieben: " + alt], "am alten Ort, keine zweite Notiz");
  const t = tresor.dateien.get(alt), fm = frontmatter(t);
  assert.deepEqual([fm.herkunft, fm.status, fm.datum, fm.literatur_id], ["zentral", "gelesen", "2026-10-19", "x100"]);
  assert.ok(!t.includes("Alter Text.") && t.includes("## Lesen je Kapitel") && t.endsWith("## Meine Notizen\n\nMein Text.\n"));
  await pc.L.abgleichen();
  assert.equal(pc.schritte.length, 1, "danach wie jede zentrale Notiz");
});

test("Abgleich: andere herkunft, kein Abrufer, Modul bestanden oder ohne lesbaren Stand: nichts geschrieben", async () => {
  const eigen = neuerTresor();
  eigen.ordner.add(ORDNER + "/Literatur");
  const text = "---\ntyp: unterlage\nherkunft: claude\nliteratur_id: x100\n---\n\nVon meiner KI.\n";
  eigen.dateien.set(P, text);
  const g = geraet(eigen);
  await g.L.abgleichen();
  assert.equal(eigen.dateien.get(P), text);
  for (const o of [{ abrufer: false }, { module: [Object.assign({}, MODUL, { status: "bestanden" })] }, { module: [Object.assign({}, MODUL, { semester: "SS 2027" })] }]) {
    const tresor = neuerTresor(), x = geraet(tresor, o);
    await x.L.abgleichen();
    assert.deepEqual(x.schritte, [], JSON.stringify(o));
  }
  const ohne = neuerTresor();
  ohne.dateien.set(ABRUF, "{ kaputt");
  const y = geraet(ohne);
  await y.L.abgleichen();
  assert.deepEqual(y.schritte, []);
});

test("Auswahl: laufendes Semester und Module deines Plans (oder läuft/angemeldet), nie bestandene", () => {
  const { L } = geraet(neuerTresor());
  const D = { module: [
    { code: "X100", semester: "WS 2026/27", status: "offen" },
    { code: "X200", semester: "SS 2027", status: "angemeldet" },
    { code: "X300", semester: "SS 2027", status: "offen" },
    { code: "X400", semester: "WS 2026/27", status: "anerkannt" },
  ] };
  const E = ["X100", "X200", "X300", "X400", "X999"].map((code) => ({ code, semester: "WS 2026/27" })).concat([{ code: "X100", semester: "SS 2027" }]);
  assert.deepEqual(L.auswahl(E, D, "WS 2026/27").map((e) => e.code + " " + e.semester), ["X100 WS 2026/27", "X200 WS 2026/27"]);
  assert.equal(L.ordnerName("X100", "egal", ["X1000 Anderes", "X100", "X100 Beispielkunde"]), "X100", "vorhandener Ordner zuerst");
  assert.equal(L.ordnerName("X100", "Einführung in die Beispielkunde und", []), "X100 Einführung in die Beispielkunde");
});

test("Abruf: literatur.json holt jedes Gerät selbst, ungültige Module stehen im Bericht; fehlt sie im Manifest, ist der Stand weg", async () => {
  const crypto = require("node:crypto");
  const speicher = {}, quelle = {};
  let neu = 0;
  const L = laden("zentral", {
    frontmatter: { "System/Einstellungen.md": {} },
    kontext: { plugin: { testZentralAus: true, testQuelle: async (n) => quelle[n] }, modell: { daten: () => ({ module: [], fachsemester: 1 }) },
      literaturAnzeige: { neu: () => { neu++; } } },
  });
  const app = L.ctx.app;
  app.loadLocalStorage = (k) => (k in speicher ? JSON.parse(speicher[k]) : null);
  app.saveLocalStorage = (k, v) => { if (v == null) delete speicher[k]; else speicher[k] = JSON.stringify(v); };
  app.vault.create = async (p) => ({ path: p });
  const datei = (name, text) => { quelle[name] = text; const b = Buffer.from(text, "utf8"); return { sha256: crypto.createHash("sha256").update(b).digest("hex"), groesse: b.length }; };
  const termine = datei("termine.json", JSON.stringify({ schema: 1, termine: [] }));
  const lit = datei("literatur.json", JSON.stringify({ schema: 1, stand: "2026-10-24T06:00:00Z", module: [roh(), roh({ code: "X200", werke: [] })] }));
  quelle["manifest.json"] = JSON.stringify({ schema: 1, erstellt: "2026-10-24T06:00:00Z", dateien: { "termine.json": termine, "literatur.json": lit } });
  const ZZ = L.ctx.zentral;
  const b = await ZZ.abrufen({});
  assert.equal(b.art, "ok");
  assert.deepEqual(b.verworfen, [{ id: "literatur X200 WS 2026/27", grund: "werke ungültig" }]);
  assert.deepEqual(ZZ.literatur().module.map((m) => m.code), ["X100"]);
  assert.equal(ZZ.literatur().sha256, lit.sha256);
  assert.equal(neu, 1, "literatur.js erfährt von der neuen Liste");
  assert.equal(JSON.parse(speicher["eba-zentral-daten"] || "{}")["literatur.json"], undefined, "nicht zusätzlich im Speicher der Termine");
  quelle["manifest.json"] = JSON.stringify({ schema: 1, erstellt: "2026-10-24T07:00:00Z", dateien: { "termine.json": termine } });
  await ZZ.abrufen({ manuell: true });
  assert.equal(ZZ.literatur(), null, "zurückgezogen");
  assert.equal(neu, 2);
});
