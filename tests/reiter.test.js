// Reiter am iPhone (reiter.js, Codeblock eba-reiter): welche Karten einer Seite Reiter werden und welches Markdown der Reiter
// zeichnet (dieselbe Karte, eine Ebene oberste, ohne Klappen und ohne reiter=). Dazu das Dashboard der Vorlage: vier Reiter
// in der Reihenfolge der Seite, der Block steht vor der ersten Karte. Läuft ohne Obsidian.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { laden } = require("./laden.js");

const R = laden("reiter").ergebnis;
const DASH = fs.readFileSync(path.join(__dirname, "..", "Studium Autopilot", "Dashboard.md"), "utf8").replace(/\r/g, "");

test("Name aus den Angaben: mit | oder Leerzeichen getrennt, sonst leer", () => {
  assert.equal(R.nameAus("|schlicht|handy-zu|reiter=Fristen"), "Fristen");
  assert.equal(R.nameAus("|2 reiter=To-dos"), "To-dos");
  assert.equal(R.nameAus("|schlicht|handy-zu"), "");
  assert.equal(R.nameAus("|reiter="), "", "ohne Namen kein Reiter");
});

test("Karte in einem Raster: eine Ebene oberste, Kopf ohne handy-zu, reiter= und Klappen, endet vor der Nachbarkarte", () => {
  const text = [
    "> [!eba-raster|2]",
    "> > [!eba-termin|schlicht|handy-zu|reiter=Fristen]+ Fristen · 30 Tage",
    "> > ```eba-liste fristen",
    "> > Fristen erscheinen.",
    "> > ```",
    ">",
    "> > [!eba-termin|handy-zu|reiter=Termine]- Termine",
    "> > Text",
    "",
    "> [!eba-karte] Ohne Reiter",
    "> bleibt",
  ].join("\n");
  assert.deepEqual(R.reiterAus(text), [
    { name: "Fristen", md: "> [!eba-termin|schlicht] Fristen · 30 Tage\n> ```eba-liste fristen\n> Fristen erscheinen.\n> ```" },
    { name: "Termine", md: "> [!eba-termin] Termine\n> Text" },
  ]);
});

test("Raster mit reiter=: als Ganzes, auch die Karten darin ohne Klappen; Spaltenzahl bleibt", () => {
  const text = "> [!eba-raster|2 reiter=To-dos]\n> > [!eba-fragen|handy-zu]+ Offene Fragen\n> > Frage?\n>\n> > [!eba-todo|handy-zu]+ To-dos\n> > - [ ] a\n";
  assert.deepEqual(R.reiterAus(text), [
    { name: "To-dos", md: "> [!eba-raster|2]\n> > [!eba-fragen] Offene Fragen\n> > Frage?\n>\n> > [!eba-todo] To-dos\n> > - [ ] a" },
  ]);
});

test("Gleicher Name: ein Reiter mit beiden Karten; Karten in Codeblöcken zählen nicht", () => {
  const text = "> [!eba-karte|reiter=A] Eins\n> 1\n\n```md\n> [!eba-karte|reiter=B] Beispiel\n```\n\n> [!eba-karte|reiter=A] Zwei\n> 2\n";
  assert.deepEqual(R.reiterAus(text), [{ name: "A", md: "> [!eba-karte] Eins\n> 1\n\n> [!eba-karte] Zwei\n> 2" }]);
  assert.deepEqual(R.reiterAus(""), []);
});

test("Offen beim ersten Öffnen: auf iPad und PC der Reiter mit reiter-offen (Dashboard: Fristen), auf dem iPhone keiner", () => {
  const text = "> [!eba-karte|reiter=A] Eins\n> 1\n\n> [!eba-karte|schlicht|reiter=B|reiter-offen]+ Zwei\n> 2\n";
  const reiter = R.reiterAus(text);
  assert.deepEqual(reiter, [{ name: "A", md: "> [!eba-karte] Eins\n> 1" }, { name: "B", md: "> [!eba-karte|schlicht] Zwei\n> 2", offen: true }],
    "reiter-offen fällt aus der Kopfzeile wie reiter=");
  assert.equal(R.offenerName(reiter, undefined, false), "B");
  assert.equal(R.offenerName(reiter, undefined, true), "", "iPhone: keiner");
  assert.equal(R.offenerName(reiter, "A", false), "A", "die eigene Wahl geht vor");
  assert.equal(R.offenerName(reiter, "", false), "", "selbst geschlossen bleibt zu");
  assert.equal(R.offenerName([{ name: "A", md: "" }], undefined, false), "", "ohne reiter-offen keiner");
  assert.deepEqual(R.reiterAus(DASH).filter((r) => r.offen).map((r) => r.name), ["Fristen"]);
});

test("Blöcke eines Reiters: Sprache, Argument und Text, auch in einem Raster", () => {
  const md = (n) => R.reiterAus(DASH).filter((r) => r.name === n)[0].md;
  assert.deepEqual(R.bloeckeAus(md("Fristen")), [{ sprache: "eba-liste", arg: "fristen", quelle: "Fristen erscheinen, sobald Studium Autopilot läuft." }]);
  assert.deepEqual(R.bloeckeAus(md("To-dos")).map((b) => b.sprache + "|" + b.arg), ["eba-todos|fragen", "eba-todos|"]);
  assert.deepEqual(R.bloeckeAus("> [!eba-karte] Ohne Liste\n> Text"), []);
});

test("Zahl am Reiter: Summe der Zähler seiner Blöcke; fehlt ein Zähler oder kennt er die Zahl nicht, keine Zahl", async () => {
  const mit = (erweiterungen) => laden("reiter", { kontext: { plugin: { erweiterungen } } }).ergebnis;
  const todos = R.reiterAus(DASH).filter((r) => r.name === "To-dos")[0].md;
  assert.equal(await mit({ todos: { zaehler: { "eba-todos": async (arg) => (arg === "fragen" ? 2 : 3) } } }).anzahl(todos), 5);
  assert.equal(await mit({ todos: { zaehler: { "eba-todos": () => 0 } } }).anzahl(todos), 0);
  assert.equal(await mit({ todos: { zaehler: { "eba-todos": () => null } } }).anzahl(todos), null);
  assert.equal(await mit({}).anzahl(todos), null);
  assert.equal(await mit({}).anzahl("> [!eba-karte] Ohne Liste\n> Text"), null);
});

test("Dashboard: Block eba-reiter vor den Karten, vier Reiter in dieser Reihenfolge, Listen darin unverändert", () => {
  const reiter = R.reiterAus(DASH);
  assert.deepEqual(reiter.map((r) => r.name), ["Fristen", "Termine", "Nacharbeiten", "To-dos"]);
  assert.ok(DASH.indexOf("```eba-reiter\n```") >= 0 && DASH.indexOf("```eba-reiter\n```") < DASH.indexOf("reiter=Fristen"), "Block vor der ersten Karte");
  const md = (n) => reiter.filter((r) => r.name === n)[0].md;
  assert.match(md("Fristen"), /^> \[!eba-termin\|schlicht\|umbruch\] Fristen · 30 Tage\n> ```eba-liste fristen\n/);
  assert.match(md("Termine"), /^> \[!eba-termin\|schlicht\|umbruch\] Termine · 14 Tage\n> ```eba-liste termine\n/);
  assert.match(md("Nacharbeiten"), /```eba-liste nachzuarbeiten\n/);
  assert.match(md("To-dos"), /^> \[!eba-raster\|2\]\n> > \[!eba-fragen\] Offene Fragen\n[\s\S]*> > \[!eba-todo\] To-dos\n/);
  for (const r of reiter) assert.ok(!/handy-zu|reiter=|\]\+/.test(r.md), r.name);
});

test("Höhe in der Leseansicht: Abschnitt nachmessen, Seite nur bei neuer Höhe neu einteilen, weggescrollt nie", () => {
  const renderer = (neu) => {
    const r = { s: { height: 488 }, neuEingeteilt: 0 };
    r.getSectionForElement = () => r.s;
    r.measureSection = (s) => { s.height = neu; };
    r.updateVirtualDisplay = () => { r.neuEingeteilt++; };
    return r;
  };
  const da = { isConnected: true, offsetParent: {} };
  let r = renderer(265);
  assert.equal(R.abschnittNachmessen(r, da), true, "kürzerer Reiter");
  assert.equal(r.s.height, 265);
  assert.equal(r.neuEingeteilt, 1);
  r = renderer(489);
  assert.equal(R.abschnittNachmessen(r, da), false, "Höhe fast gleich: nichts neu einteilen");
  assert.equal(r.neuEingeteilt, 0);
  r = renderer(0);
  assert.equal(R.abschnittNachmessen(r, { isConnected: false, offsetParent: null }), false, "ausgehängt");
  assert.equal(R.abschnittNachmessen(r, { isConnected: true, offsetParent: null }), false, "unsichtbar");
  assert.equal(r.s.height, 488, "nie als 0 px gemessen");
  assert.equal(R.abschnittNachmessen({}, da), false, "Renderer ohne diese Funktionen (Obsidian-Update)");
  assert.equal(R.abschnittNachmessen(Object.assign(renderer(100), { getSectionForElement: () => null }), da), false);
});
