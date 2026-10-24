// Unterlagen „gesehen“ (gesehen.js): Welche Notiz gehört zu einer geöffneten Datei, und wird das erste Öffnen genau einmal
// eingetragen? Dazu die Regel, nach der der PDF-Kasten einer Notiz ohne eigenen Inhalt gleich offen ist (istLeer aus leer.js).
// Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { laden } = require("./laden.js");

const ORDNER = "Unterlagen/B110 Einführung in die BWL";
const NOTIZ = `${ORDNER}/B110 Folien 03 Entscheidungstheorie.md`;
const datei = (p) => {
  const name = p.slice(p.lastIndexOf("/") + 1), punkt = name.lastIndexOf(".");
  return { path: p, basename: name.slice(0, punkt), extension: name.slice(punkt + 1), parent: { path: p.slice(0, p.lastIndexOf("/")) } };
};

const mitVault = (frontmatter) => {
  const { ctx, ergebnis } = laden("gesehen", { heute: "2026-10-24", frontmatter });
  const geschrieben = [];
  ctx.app.fileManager = {
    processFrontMatter: async (f, tun) => { const fm = frontmatter[f.path]; tun(fm); geschrieben.push(f.path); },
  };
  return { G: ergebnis, geschrieben };
};

test("Notiz zu PDF, Notiz selbst, fremde Dateien", () => {
  const { G } = mitVault({ [NOTIZ]: { typ: "unterlage", datei: "[[B110 Folien 03 Entscheidungstheorie.pdf]]" }, "Vorlesungen/VL.md": { typ: "vorlesung" } });
  assert.equal(G.notizZu(datei(`${ORDNER}/B110 Folien 03 Entscheidungstheorie.pdf`)).path, NOTIZ);
  assert.equal(G.notizZu(datei(`${ORDNER}/B110 Folien 03 Entscheidungstheorie.pptx`)).path, NOTIZ);
  assert.equal(G.notizZu(datei(NOTIZ)).path, NOTIZ);
  assert.equal(G.notizZu(datei(`${ORDNER}/Andere.pdf`)), null);
  assert.equal(G.notizZu(datei("Vorlesungen/VL.md")), null);
  assert.equal(G.notizZu(null), null);
});

test("Erstes Öffnen wird einmal eingetragen, das Feld status bleibt", async () => {
  const fm = { typ: "unterlage", status: "neu" };
  const { G, geschrieben } = mitVault({ [NOTIZ]: fm });
  assert.equal(await G.vermerken(datei(`${ORDNER}/B110 Folien 03 Entscheidungstheorie.pdf`)), true);
  assert.equal(fm.geoeffnet, "2026-10-24");
  assert.equal(fm.status, "neu");
  assert.equal(await G.vermerken(datei(NOTIZ)), false);
  assert.deepEqual(geschrieben, [NOTIZ]);
});

test("Schon geöffnet: kein Schreiben", async () => {
  const { G, geschrieben } = mitVault({ [NOTIZ]: { typ: "unterlage", geoeffnet: "2026-10-01" } });
  assert.equal(await G.vermerken(datei(NOTIZ)), false);
  assert.deepEqual(geschrieben, []);
});

// So legt unterlagen.js (begleitnotiz) die Notiz an, dazu eine Notiz von vor 0.4.7 mit leeren Abschnitten
const { istLeer } = laden("leer").ergebnis;
const KOPF = "---\ntyp: unterlage\ncode: \"B110\"\nstatus: neu\n---\n\n# B110 · Folien 03 · Entscheidungstheorie\n\n";
const KASTEN = "> [!eba-pdf]- PDF (37 Seiten)\n> ![[B110 Folien 03 Entscheidungstheorie.pdf#height=560]]\n";

test("PDF-Kasten offen: Notiz ohne eigenen Inhalt", () => {
  assert.equal(istLeer(KOPF + KASTEN), true);
  assert.equal(istLeer(KOPF + "> [!eba-info] Neue Fassung aus ILIAS\n> Die alte liegt daneben.\n\n" + KASTEN), true);
  assert.equal(istLeer(KOPF + "> [!eba-regel] Eckdaten\n> **Modul:** B110\n\n## Das Wichtigste\n- \n\n## Offene Fragen\n- [ ] \n\n" + KASTEN), true);
});

test("PDF-Kasten zu: Zusammenfassung oder eigene Notizen", () => {
  assert.equal(istLeer(KOPF + "## Das Wichtigste\n- Erwartungswert entscheidet bei Risikoneutralität.\n\n" + KASTEN), false);
  assert.equal(istLeer(KOPF + KASTEN + "\n## Meine Notizen\nKlausurrelevant laut Übung.\n"), false);
});
