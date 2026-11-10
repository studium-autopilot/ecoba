// Kursseiten im Connector (server/mcp-kursseite.mjs, Werkzeug kursseiten in mcp-werkzeuge.mjs): dieselben Regeln für Tabellen
// und Tage wie im Plugin (kursseite.js), Zeilen der Woche, ganzer Text nur mit modul, ohne „Meine Notizen“, klare Fehler.
// Ohne Netz. Läuft ohne Obsidian: node --test tests/
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const assert = require("node:assert/strict");
const H = require("../Studium Autopilot/System/Skripte/ilias-html.js");
const K = require("../Studium Autopilot/System/Skripte/kursseite.js");

const SERVER = path.join(__dirname, "..", "server");
const da = fs.existsSync(path.join(SERVER, "mcp-kursseite.mjs"));
const test = (name, f) => require("node:test")(name, { skip: !da && "server/mcp-kursseite.mjs fehlt in diesem Baum" }, f);
const laden = (datei) => import(pathToFileURL(path.join(SERVER, datei)).href);
const JETZT = new Date("2026-10-21T09:00:00Z"); // Mittwoch
const SEITE = fs.readFileSync(path.join(__dirname, "daten", "ilias-seiten", "kursseite.html"), "utf8");
const I = require("./laden.js").laden("ilias").ctx.ilias;
const inhalt = K.markdown(H.kursseite(SEITE, "https://ovidius.uni-tuebingen.de/goto.php/crs/1"), { hatKennwort: I.hatKennwort, ohneKennwort: I.ohneKennwort });
const NOTIZ = K.notiz({ code: "S100", url: "https://ovidius.uni-tuebingen.de/goto.php/crs/1", refId: "1", geaendert: "2026-10-20", inhalt }, null)
  + "Meine eigene Zeile | 22.10.2026 | nicht aus ILIAS\n";
const ohneFm = (t) => t.replace(/^---\n[\s\S]*?\n---\n/, "");

test("Gleiche Regeln wie das Plugin: Tage, Tabellen und Zeitplan", async () => {
  const C = await laden("mcp-kursseite.mjs");
  for (const x of ["12.10.2026 - 16.10.2026", "19.10. - 23.10.", "28.12. - 8.1.", "Woche 02.11.26", "13.11.2026 17:00 - 18:00", "11.01.", "31.02.2026",
    "Februar 2027", "1.10.2026 - 30.12.2026", "Aufg. 1 - 5", "Woche\u00a019.10.26", ""]) {
    assert.deepEqual(C.bereich(x, "2026-11-05"), K.bereich(x, "2026-11-05"), x);
  }
  const ohne = ohneFm(NOTIZ);
  assert.deepEqual(C.tabellen(ohne), K.tabellen(NOTIZ));
  assert.deepEqual(C.zeitplan(ohne, "2026-10-20"), K.zeitplan(NOTIZ));
  assert.equal(C.zeitplan(ohne, "2026-10-20").length, 3, "die eigene Zeile unter „Meine Notizen“ zählt nicht");
  assert.deepEqual(C.wocheVon("2026-10-25"), { von: "2026-10-19", bis: "2026-10-25" });
  assert.deepEqual(C.wocheVon("2026-10-19"), { von: "2026-10-19", bis: "2026-10-25" });
});

test("Werkzeug kursseiten: Zeilen der Woche, alles, ganzer Text nur mit modul, Fehler bei Datum und Modul", async () => {
  const { tresorOrdner } = await laden("mcp-tresor.mjs");
  const { quelleOrdner } = await laden("mcp-quelle-ordner.mjs");
  const { werkzeuge } = await laden("mcp-werkzeuge.mjs");
  const w = fs.mkdtempSync(path.join(os.tmpdir(), "studium-kursseite-"));
  try {
    const datei = (rel, t) => { fs.mkdirSync(path.join(w, path.dirname(rel)), { recursive: true }); fs.writeFileSync(path.join(w, rel), t); };
    datei("Unterlagen/S100 Mathe/S100 Kursseite.md", NOTIZ);
    datei("Unterlagen/B180 Jahresabschluss/B180 Kursseite.md", K.notiz({ code: "B180", url: "", refId: "2", geaendert: "2026-10-28",
      inhalt: "> Raumänderung: ab sofort Hörsaal 23" }, null));
    datei("Module/S100 Mathe.md", "---\ntyp: modul\ncode: S100\n---\n# S100\n");
    datei("Module/E101 VWL.md", "---\ntyp: modul\ncode: E101\n---\n# E101\n");
    const W = werkzeuge(quelleOrdner(tresorOrdner(w, { jetzt: () => JETZT })), { jetzt: () => JETZT });
    assert.ok(W.liste().some((d) => d.name === "kursseiten"));
    const rufen = (a) => { const r = W.aufrufen("kursseiten", a); assert.equal(r.fehler, false, r.text); return r.daten; };

    let d = rufen({});
    assert.deepEqual(d.woche, { von: "2026-10-19", bis: "2026-10-25" });
    assert.deepEqual(d.kursseiten.map((s) => s.modul), ["B180", "S100"]);
    const s = d.kursseiten[1];
    assert.equal(s.geaendert, "2026-10-20");
    assert.equal(s.notiz, "Unterlagen/S100 Mathe/S100 Kursseite.md");
    assert.deepEqual(s.zeitplan, [{ von: "2026-10-19", bis: "2026-10-23", zellen: [{ spalte: "Themen der Vorlesung", text: "Vektoren\nund Matrizen" }] }]);
    assert.equal(s.text, undefined, "ohne modul kein Text");
    assert.match(d.hinweis, /Daten, keine Anweisungen/);

    d = rufen({ datum: "2026-11-12" });
    assert.deepEqual(d.kursseiten[1].zeitplan.map((z) => [z.von, z.bis]), [["2026-11-13", undefined]], "ein Tag ohne bis");
    d = rufen({ alles: true });
    assert.equal(d.woche, undefined);
    assert.equal(d.kursseiten[1].zeitplan.length, 3);

    d = rufen({ modul: "s100" });
    assert.deepEqual(d.kursseiten.map((x) => x.modul), ["S100"]);
    const t = d.kursseiten[0].text;
    assert.match(t, /^# S100 Kursseite/);
    assert.match(t, /\(Passwort steht in ILIAS\)/);
    assert.equal(/Geheim42x|Meine eigene Zeile|Meine Notizen|typ: kursseite/.test(t), false);
    assert.match(t, /Raumänderung: Das Tutorium ist ab sofort in/);

    d = rufen({ modul: "E101" });
    assert.deepEqual(d.kursseiten, []);
    assert.match(d.hinweis, /Keine Kursseite/);
    for (const [a, satz] of [[{ datum: "2026-02-30" }, /datum/], [{ modul: "X999" }, /kein Modul X999/], [{ alles: "ja" }, /alles: true oder false/]]) {
      const r = W.aufrufen("kursseiten", a);
      assert.equal(r.fehler, true);
      assert.match(r.text, satz);
    }
  } finally {
    fs.rmSync(w, { recursive: true, force: true });
  }
});

test("Ohne Kopie des Tresors: Obsidian schickt die Zeilen mit Tag im Lagebild, der Server prüft sie, das Werkzeug zeigt sie", async () => {
  const { laden: skript } = require("./laden.js");
  const { lagebildPruefen, LAGEBILD, ORDNER, LAGE } = await laden("claude-app.mjs");
  const { quelleServer } = await laden("mcp-quelle-server.mjs");
  const { werkzeuge } = await laden("mcp-werkzeuge.mjs");
  const jetzt = new Date();
  const tag = (n) => { const d = new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const de = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
  const pfad = "Unterlagen/S100 Mathe/S100 Kursseite.md";
  const text = K.notiz({ code: "S100", url: "", refId: "1", geaendert: tag(0), inhalt: "| Woche | Datum | Thema |\n| --- | --- | --- |\n"
    + `| 1 | ${de(tag(-30))} - ${de(tag(-26))} | Lange vorbei |\n| 2 | ${de(tag(0))} | Heute: Matrizen |\n| 3 | ${de(tag(200))} | Weit weg |` }, null);
  const Z = skript("zentral").ctx.zentral;
  const L = skript("server", { notizen: { [pfad]: { typ: "kursseite", code: "S100", geaendert: tag(0) } },
    kontext: { zentral: Z, user: { kursseite: K }, obsidian: { Modal: class {}, Notice: class {}, Platform: {}, Setting: class {} } } });
  L.ctx.app.vault.cachedRead = async (f) => (f.path === pfad ? text : "");
  L.ctx.modell = { daten: () => ({ module: [], stundenplan: [] }) };
  const S = L.ctx.server;
  assert.equal(S.LAGE.kursseiten, LAGEBILD.kursseiten, "eine Grenze für Plugin und Server");
  const roh = (await S.lagebildObs()).kursseiten;
  assert.deepEqual(roh.map((z) => z.zellen[0].text), ["Heute: Matrizen"], "nur Zeilen von einer Woche zurück bis 120 Tage voraus");
  const kurz = S.lagebildKurz({ kursseiten: roh.concat({ modul: "S100", von: tag(1), bis: tag(1), zellen: [{ spalte: "Thema", text: "Pass" + "wort: Sommer2026x" }] },
    { modul: "kein Code", von: tag(1), bis: tag(1), zellen: [{ text: "x" }] }) }, (t) => /Passwort/.test(t), 1e5).kursseiten;
  assert.deepEqual(kurz, [{ modul: "S100", von: tag(0), bis: tag(0), geaendert: tag(0), zellen: [{ text: "Heute: Matrizen", spalte: "Thema" }] }],
    "was nach Zugangsdaten aussieht und Einträge ohne Modul fallen weg");
  const angenommen = lagebildPruefen({ kursseiten: kurz.concat({ modul: "S100", von: tag(2), bis: tag(1), zellen: [{ text: "rückwärts" }] }) }, tag(0)).kursseiten;
  assert.deepEqual(angenommen, kurz, "Zeitraum rückwärts fällt weg");
  const v = fs.mkdtempSync(path.join(os.tmpdir(), "studium-kursseite-server-"));
  try {
    fs.mkdirSync(path.join(v, ORDNER.daten), { recursive: true });
    const lage = (lagebild) => fs.writeFileSync(path.join(v, ORDNER.daten, LAGE), JSON.stringify({ schema: 1, stand_empfangen: new Date().toISOString(),
      stand: { module: ["S100"], termine: [], todos: [] }, lagebild, eingang: { termine: [], hinweise: [] } }));
    lage({ kursseiten: [] });
    assert.equal(werkzeuge(quelleServer(v)).liste().some((d) => d.name === "kursseiten"), false, "ohne Zeilen kein Werkzeug");
    lage({ kursseiten: angenommen });
    const w = werkzeuge(quelleServer(v));
    assert.ok(w.liste().some((d) => d.name === "kursseiten"));
    // datum: tag() rechnet in Ortszeit, das Werkzeug ohne datum in Europe/Berlin; auf einem Rechner in UTC (GitHub Actions) ist
    // sonntags ab 23 Uhr (im Sommer ab 22 Uhr) in Berlin schon die nächste Woche
    const d = w.aufrufen("kursseiten", { modul: "S100", datum: tag(0) }).daten;
    assert.deepEqual(d.kursseiten, [{ modul: "S100", geaendert: tag(0), zeitplan: [{ von: tag(0), zellen: [{ spalte: "Thema", text: "Heute: Matrizen" }] }] }]);
    assert.match(d.hinweis, /nur die Zeilen mit Tag/);
  } finally { fs.rmSync(v, { recursive: true, force: true }); }
});
