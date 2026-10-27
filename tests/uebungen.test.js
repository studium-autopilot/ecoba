// Übungen (seit 24.10.2026): Ein Übungsblatt ist seine Begleitnotiz (typ unterlage, art Übung). Fachmodell (ctx.modell.uebung,
// uebungen, blattNummer: Abgabe aus den Fristen, ein Haken für beides, Lösungen mit gleicher Nummer), Kopf der Notiz (kopf.js:
// Status, Abgabe, Lösungen; die Frist zeigt ihr Blatt), Abschnitt „Übungen“ auf der Seite Unterlagen (dashboard.js). Dazu ältere
// Übungsblatt-Notizen (typ übungsblatt, bis 0.6.7): Abschnitte (vorlesung.js), Status in drei Stufen (kopf.js), leeres Gerüst (leer.js).
// Nur ausgedachte Daten (Codes X100, Y200, S100). Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { laden, json } = require("./laden.js");

const K = require("../Studium Autopilot/System/Skripte/kopf.js");
const { abschnitte } = laden("vorlesung").ergebnis;
const { istLeer } = laden("leer").ergebnis;
const SEMESTER = json("semester.json");
const HEUTE = "2026-10-29"; // Donnerstag, WS 2026/27

// ---------- Notizen ----------
const ORDNER = { X100: "Unterlagen/X100 Beispiel/", Y200: "Unterlagen/Y200 Beispiel/" };
const unterlage = (code, name, fm) => ({ [ORDNER[code] + code + " " + name + ".md"]: Object.assign({ typ: "unterlage", code, status: "neu", datum: "2026-10-20" }, fm) });
const frist = (datum, titel, o) => ({ ["Termine/" + datum + " " + titel + ".md"]: Object.assign({ typ: "termin", titel, datum, kategorie: "Frist", code: "X100",
  ort: "bis 23:55 Uhr · ILIAS", herkunft: "ilias-kalender", status: "offiziell", erledigt: false }, o) });
const WS = "WS 2026/27";
const NOTIZEN = () => Object.assign({},
  unterlage("X100", "Übung 01 Ableitungen", { art: "Übung", nummer: 1, titel: "Ableitungen", semester: WS, status: "gelesen" }),
  unterlage("X100", "Übung 02 Integrale", { art: "Übung", nummer: 2, titel: "Integrale", semester: WS }),
  unterlage("X100", "Übung 03 Matrizen", { art: "Übung", nummer: 3, titel: "Matrizen", semester: WS, status: "bearbeitet" }),
  unterlage("X100", "Übung 04 Reihen", { art: "Übung", nummer: 4, titel: "Reihen", semester: WS }),
  unterlage("X100", "Übung 05 Vorkurs", { art: "übung", nummer: 5, titel: "Vorkurs", semester: WS }),
  unterlage("X100", "Übung Aufgabenkatalog", { art: "Übung", titel: "Aufgabenkatalog", semester: WS }),
  unterlage("X100", "Lösung 01 WS 2025-26", { art: "Lösung", nummer: 1, titel: "Kurzlösung", semester: "WS 2025/26" }),
  unterlage("X100", "Lösung 01 Kurzlösung", { art: "Lösung", nummer: 1, titel: "Kurzlösung", semester: WS }),
  unterlage("X100", "Eigene Lösung 01", { art: "Eigene Lösung", nummer: 1 }),
  unterlage("X100", "Folien 01 Einführung", { art: "Folien", nummer: 1, titel: "Einführung", semester: WS }),
  unterlage("Y200", "Übung 01", { art: "Übung", nummer: 1, semester: "WS 2025/26", datum: "2025-11-03" }),
  frist("2026-10-27", "X100 Abgabe 1"),
  frist("2026-10-30", "X100 Abgabe 2", { ort: "bis 12:00 Uhr · ILIAS", erledigt: true }),
  frist("2026-11-02", "X100 Feedback Abgabe 2"),
  frist("2026-11-05", "X100 Abgabe Übungsblatt 04"),
  frist("2026-10-12", "X100 Abgabe 5"),
  frist("2027-05-03", "X100 Abgabe 1"),
  frist("2026-11-06", "X100 Hausaufgabe 4", { kategorie: "Termin" }));
const modell = (notizen, heute = HEUTE) => laden("modell", { heute, notizen,
  frontmatter: { "System/Daten/Semester.md": SEMESTER, "System/Einstellungen.md": {} } }).ctx.modell;
const PFAD = (code, name) => ORDNER[code] + code + " " + name + ".md";
const datei = (p) => ({ path: p, basename: p.split("/").pop().replace(/\.md$/, ""), extension: "md" });

test("Blattnummer im Titel einer Frist: Abgabe, Blatt, Hausaufgabe, Assignment, „3. Übungsblatt“; Jahreszahlen und Ohne-Nummer nicht", () => {
  const M = modell({});
  assert.equal(M.blattNummer("B110 Abgabe 3"), 3);
  assert.equal(M.blattNummer("Abgabe Übungsblatt 03"), 3);
  assert.equal(M.blattNummer("Ueberblick Uebungsblatt Nr. 12"), 12);
  assert.equal(M.blattNummer("3. Hausaufgabe (Gruppe)"), 3);
  assert.equal(M.blattNummer("Assignment #7 due"), 7);
  assert.equal(M.blattNummer("Abgabe 0"), 0);
  assert.equal(M.blattNummer("Blatt 2026"), 0, "Jahreszahl ist keine Blattnummer");
  assert.equal(M.blattNummer("Abgabe Hausarbeit"), 0);
});

test("Übungen: Abgabe aus der Frist mit gleichem Code und gleicher Nummer im Semester des Blatts, ohne Feedback; mit Abgabe zuerst", () => {
  const M = modell(NOTIZEN());
  const L = M.uebungen();
  assert.deepEqual(L.map((u) => [u.nummer, u.datum]), [[5, "2026-10-12"], [1, "2026-10-27"], [2, "2026-10-30"], [4, "2026-11-05"], [3, ""], [null, ""]],
    "nur das aktuelle Semester; ohne Nummer zuletzt; Art klein geschrieben zählt auch");
  const u1 = L[1];
  assert.deepEqual([u1.titel, u1.uhr, u1.erledigt, u1.ueberfaellig, u1.abgaben.length], ["Ableitungen", "23:55", false, true, 1],
    "„gelesen“ heißt bei einem Blatt: noch nicht bearbeitet; die Abgabe 1 im SS 2027 gehört zu einem anderen Blatt");
  assert.equal(u1.abgabe.pfad, "Termine/2026-10-27 X100 Abgabe 1.md");
  assert.equal(u1.loesung.f.path, PFAD("X100", "Lösung 01 Kurzlösung"), "Musterlösung aus demselben Semester");
  assert.equal(u1.eigene.f.path, PFAD("X100", "Eigene Lösung 01"), "ohne Semester passt jede Nummer");
  const u2 = L[2];
  assert.deepEqual([u2.erledigt, u2.ueberfaellig, u2.uhr, u2.abgaben.length], [true, false, "12:00", 1], "Haken der Frist; „Feedback“ ist keine zweite Abgabe");
  assert.equal(L[4].erledigt, true, "ohne Abgabe: status bearbeitet");
  assert.deepEqual([L[3].abgabe.titel, L[3].loesung], ["X100 Abgabe Übungsblatt 04", null], "Hausaufgabe 4 ist ein Termin, keine Frist");
  assert.deepEqual(M.uebungen({ semester: "WS 2025/26" }).map((u) => u.code), ["Y200"]);
  assert.equal(M.uebungen({ alle: true }).length, 7);
  assert.deepEqual(M.uebungen({ code: "Y200" }), [], "Y200 lief im vorigen Semester");
  assert.deepEqual(M.uebungen({ frist: "Termine/2026-10-30 X100 Abgabe 2.md" }).map((u) => u.nummer), [2], "das Blatt zur Frist");
});

test("Übung einer Datei: nur Unterlagen der Art Übung", () => {
  const N = NOTIZEN(), M = modell(N);
  assert.equal(M.uebung(datei(PFAD("X100", "Übung 04 Reihen"))).datum, "2026-11-05");
  assert.equal(M.uebung(datei(PFAD("X100", "Folien 01 Einführung"))), null);
  assert.equal(M.uebung(datei("Termine/2026-10-27 X100 Abgabe 1.md")), null);
});

test("Status einer Übung: Offen ⇄ Abgegeben, ohne Abgabe Offen ⇄ Bearbeitet; Farbe aus statusArt", () => {
  const M = modell(NOTIZEN());
  const [u5, u1, u2, , u3] = M.uebungen();
  const s = (u) => { const x = K.statusVon("übung", u.fm, u); return [x.text, x.fertig, x.neu, K.klasseVon(x, M.statusArt("unterlage", x.wort))]; };
  assert.deepEqual(s(u1), ["Offen", false, true, ""]);
  assert.deepEqual(s(u5), ["Offen", false, true, ""], "überfällig bleibt offen");
  assert.deepEqual(s(u2), ["Abgegeben", true, false, "fertig"]);
  assert.deepEqual(s(u3), ["Bearbeitet", true, false, "fertig"]);
});

// ---------- Kopf der Begleitnotiz und der Frist (kopf.js) ----------
// Ersatz für Obsidians Elemente (wie tests/vorlesungen.test.js)
const knoten = (tag, o = {}) => {
  const k = { tag, cls: String(o.cls || "").split(" ").filter(Boolean), attr: Object.assign({}, o.attr || {}), text: o.text || "", kinder: [], an: {} };
  k.createEl = (t, p) => { const c = knoten(t, p); k.kinder.push(c); return c; };
  k.createDiv = (p) => k.createEl("div", p);
  k.createSpan = (p) => k.createEl("span", p);
  k.empty = () => { k.kinder = []; };
  k.setText = (t) => { k.text = t; };
  k.appendText = (t) => { k.kinder.push(knoten("#text", { text: t })); };
  k.addClass = (...c) => { for (const x of c) if (!k.cls.includes(x)) k.cls.push(x); };
  k.toggleClass = (c, an) => { k.cls = k.cls.filter((x) => x !== c).concat(an ? [c] : []); };
  k.setAttr = (n, v) => { k.attr[n] = String(v); };
  k.addEventListener = (e, f) => { k.an[e] = f; };
  k.appendChild = (c) => { k.kinder.push(c); };
  k.ownerDocument = { createElementNS: (_ns, t) => Object.assign(knoten(t), { setAttribute() {} }) };
  k.alle = () => k.kinder.flatMap((c) => [c, ...c.alle()]);
  k.finde = (klasse) => k.alle().filter((c) => c.cls.includes(klasse));
  k.texte = () => [k.text].concat(k.kinder.flatMap((c) => c.texte())).filter(Boolean);
  return k;
};
const kopf = (notizen) => {
  const L = laden("kopf", { heute: HEUTE, notizen, kontext: { modell: modell(notizen) } });
  const geschrieben = [];
  L.ctx.app.fileManager = { processFrontMatter: async (f, fn) => { fn(notizen[f.path]); geschrieben.push(f.path.split("/").pop()); } };
  const zeichnen = (p) => { const el = knoten("div"); L.ergebnis.zeichnen(el, datei(p)); return el; };
  return { zeichnen, geschrieben };
};
const chips = (el) => el.finde("eba-vorl-chip").map((c) => [c.cls.filter((x) => !["internal-link", "eba-vorl-chip"].includes(x)).join(" "), c.texte().join(" ")]);
const knopf = (el) => el.finde("eba-vorl-status")[0];

test("Kopf einer Übung: Abgabe mit Tag, Uhrzeit und Restzeit, Musterlösung und deine Lösung; ein Tipp hakt Frist und Blatt ab", async () => {
  const N = NOTIZEN(), K1 = kopf(N);
  const u1 = K1.zeichnen(PFAD("X100", "Übung 01 Ableitungen"));
  assert.deepEqual(knopf(u1).texte(), ["Offen"]);
  // Art und Nummer nennt schon der Titel („X100 · Übung 01 · Ableitungen“); ohne Modulseite steht das Kürzel für das Modul
  assert.deepEqual(u1.finde("eba-vorl-label")[0].texte(), ["X100 · WS\u00a02026/27"]);
  const mitModul = Object.assign(NOTIZEN(), { "Module/X100 Beispielmodul.md": { typ: "modul", code: "X100", titel: "Beispielmodul" } });
  const lab = kopf(mitModul).zeichnen(PFAD("X100", "Übung 01 Ableitungen")).finde("eba-vorl-label")[0];
  assert.deepEqual(lab.texte(), ["Beispielmodul", " · WS\u00a02026/27"], "mit Modulseite: ihr Name");
  assert.equal(lab.finde("eba-kopf-modul")[0].attr.href, "Module/X100 Beispielmodul.md", "der Name öffnet die Modulseite");
  assert.deepEqual(chips(u1), [["frist spaet", "Abgabe Di 27.10., 23:55 · vorbei"], ["loesung", "Musterlösung"], ["stift", "Meine Lösung"]]);
  assert.equal(u1.finde("frist")[0].attr.href, "Termine/2026-10-27 X100 Abgabe 1.md", "Tipp öffnet die Frist");
  const u4 = K1.zeichnen(PFAD("X100", "Übung 04 Reihen"));
  assert.deepEqual(chips(u4), [["frist", "Abgabe Do 05.11., 23:55 · in 7 Tagen"]]);
  knopf(u4).an.click({ preventDefault() {}, stopPropagation() {} });
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(K1.geschrieben, ["2026-11-05 X100 Abgabe Übungsblatt 04.md", "X100 Übung 04 Reihen.md"]);
  assert.deepEqual([N["Termine/2026-11-05 X100 Abgabe Übungsblatt 04.md"].erledigt, N[PFAD("X100", "Übung 04 Reihen")].status], [true, "bearbeitet"]);
  const K2 = kopf(NOTIZEN());
  const u2 = K2.zeichnen(PFAD("X100", "Übung 02 Integrale"));
  assert.deepEqual([knopf(u2).texte(), chips(u2)], [["Abgegeben"], [["frist", "Abgabe Fr 30.10., 12:00"]]], "abgegeben: ohne Restzeit, ohne Warnung");
  assert.deepEqual(chips(K2.zeichnen(PFAD("X100", "Übung Aufgabenkatalog"))), [], "ohne Abgabe und Lösung keine Chips");
  assert.deepEqual(chips(K2.zeichnen(PFAD("X100", "Folien 01 Einführung"))), [], "Folien bleiben Folien");
  assert.deepEqual(knopf(K2.zeichnen(PFAD("X100", "Folien 01 Einführung"))).texte(), ["Noch nicht gelesen"]);
});

test("Kopf einer Abgabe-Frist: das Blatt dazu", () => {
  const K1 = kopf(NOTIZEN());
  assert.deepEqual(chips(K1.zeichnen("Termine/2026-11-05 X100 Abgabe Übungsblatt 04.md")), [["blatt", "Übung 04 Reihen"]]);
  assert.deepEqual(chips(K1.zeichnen("Termine/2026-11-02 X100 Feedback Abgabe 2.md")), []);
});

// ---------- Seite Unterlagen, Abschnitt „Übungen“ (dashboard.js) ----------
test("Abschnitt Übungen: offene Abgaben nach Tag, überfällige 14 Tage lang; Kacheln zählen dieselben Blätter, ohne Blätter keine", () => {
  const M = modell(NOTIZEN());
  const B = laden("dashboard", { heute: HEUTE, kontext: { modell: M } }).ergebnis;
  const z = B.zeilenBauen("uebungen", M, HEUTE);
  assert.deepEqual(z.map((r) => [r.wann, r.uhr, r.was, r.pille.ton]), [
    ["überfällig", "23:55", "X100 · Übung 01 · Ableitungen", "bad"],
    ["Do 05.11.", "23:55", "X100 · Übung 04 · Reihen", "warn"],
  ], "Blatt 05 ist seit 17 Tagen vorbei, Blatt 02 abgegeben");
  assert.equal(z[0].pfad, PFAD("X100", "Übung 01 Ableitungen"), "Tipp öffnet das Blatt");
  assert.deepEqual(B.uebungKachelnBauen(M, HEUTE).map((k) => [k.cls, k.k, k.v, k.s]),
    [["akzent", "Offen", "2", "1 überfällig"], ["", "Fällig in 7 Tagen", "1", ""], ["", "Erledigt", "2", "von 6 Blättern"]]);
  const E = modell(unterlage("X100", "Übung 03 Matrizen", { art: "Übung", nummer: 3, titel: "Matrizen", semester: WS, status: "bearbeitet" }));
  assert.deepEqual(laden("dashboard", { heute: HEUTE, kontext: { modell: E } }).ergebnis.uebungKachelnBauen(E, HEUTE).map((k) => [k.cls, k.k, k.v]),
    [["", "Offen", "0"], ["", "Fällig in 7 Tagen", "0"], ["", "Erledigt", "1"]], "nichts offen: kein Akzent");
  const L = modell({}), BL = laden("dashboard", { heute: HEUTE, kontext: { modell: L } }).ergebnis;
  assert.deepEqual(BL.uebungKachelnBauen(L, HEUTE), [], "nichts offen, nichts erledigt: keine Kacheln, nur die leere Liste");
  assert.equal(B.artVon("Übungen mit Abgabe erscheinen, sobald Studium Autopilot läuft."), "uebungen");
});

// ---------- Übungsblatt-Notiz (typ übungsblatt, bis 0.6.7) ----------
// wie notizen.js (Aktion „uebungsblatt“) sie bis 0.6.7 anlegte, Cursor-Zeichen schon entfernt
const blatt = (aufgabe = "") => `---
typ: übungsblatt
code: "S100"
modul: "[[S100 Mathematische Methoden der Wirtschaftswissenschaft]]"
nummer: 3
faellig: 2026-10-27
status: offen
datei: ""
eigene_loesung: ""
uebersicht: "[[Unterlagen]]"
tags:
  - übungsblatt
cssclasses:
  - eba-s-notizen
  - eba-s-uebungsblatt
---

# S100 · Blatt 03

\`\`\`eba-uebungsblatt
Kopf mit Modul, Abgabe, Status und Unterlagen: erscheint, sobald das Plugin „Studium Autopilot“ geladen ist.
\`\`\`

## Aufgabe 1
- ${aufgabe}

## Aufgabe 2
-

## Knackpunkte
-

## Fürs Tutorium
- [ ]
`;

const zeile = (text, anfang) => text.split("\n").findIndex((z) => z.startsWith(anfang));

test("Übungsblatt-Notiz: frisch angelegt ist leer, eigener Text nicht", () => {
  assert.equal(istLeer(blatt()), true);
  assert.equal(istLeer(blatt("Ableitung mit der Kettenregel")), false);
  assert.equal(istLeer(blatt().replace("## Knackpunkte\n-", "## Knackpunkte\n- Erst substituieren")), false);
});

test("Abschnitte des Übungsblatts: Aufgaben, Knackpunkte als Kasten, Tutorium als Fragen", () => {
  const t = blatt().replace("## Knackpunkte\n-", "## Knackpunkte\n- Erst substituieren\n- Dann ableiten");
  const k = abschnitte(t.split("\n"));
  assert.equal(k[zeile(t, "## Aufgabe 1")], "eba-vorl-h eba-vorl-h-aufgabe");
  assert.equal(k[zeile(t, "## Aufgabe 2")], "eba-vorl-h eba-vorl-h-aufgabe");
  assert.equal(k[zeile(t, "## Knackpunkte")], "eba-vorl-h eba-vorl-h-pruef");
  assert.equal(k[zeile(t, "- Erst")], "eba-vorl-z eba-vorl-z-pruef eba-vorl-z-anfang");
  assert.equal(k[zeile(t, "- Dann")], "eba-vorl-z eba-vorl-z-pruef eba-vorl-z-ende");
  assert.equal(k[zeile(t, "## Fürs Tutorium")], "eba-vorl-h eba-vorl-h-fragen");
  // Der Kopf-Codeblock und der Titel bekommen nichts
  assert.equal(k[zeile(t, "# S100")], undefined);
  assert.equal(k[zeile(t, "Kopf mit")], undefined);
});

test("Vorlesungsnotiz behält ihre Abschnitte; der Typ kommt aus dem Frontmatter", () => {
  const v = "---\ntyp: vorlesung\n---\n\n# B110 · VL 01\n\n## Mitschrift\n- a\n\n## Prüfungsrelevant\n- b\n\n## Aufgabe 1\n- c\n";
  const k = abschnitte(v.split("\n"));
  assert.equal(k[zeile(v, "## Mitschrift")], "eba-vorl-h eba-vorl-h-mitschrift");
  assert.equal(k[zeile(v, "## Prüfungsrelevant")], "eba-vorl-h eba-vorl-h-pruef");
  assert.equal(k[zeile(v, "## Aufgabe 1")], "eba-vorl-h eba-vorl-h-anders");
  // „Prüfungsrelevant“ darf auch im Übungsblatt stehen
  const b = blatt().replace("## Knackpunkte", "## Prüfungsrelevant");
  assert.equal(abschnitte(b.split("\n"))[zeile(b, "## Prüfungsrelevant")], "eba-vorl-h eba-vorl-h-pruef");
});

test("Übungsblatt-Notiz im Kopf: drei Stufen im Menü (offen, abgegeben, korrigiert), Unbekanntes gilt als offen", () => {
  const s = K.statusVon("übungsblatt", { status: "Abgegeben " });
  assert.deepEqual([s.wert, s.text, s.fertig, s.neu, s.menue], ["abgegeben", "Abgegeben", false, "korrigiert", ["offen", "abgegeben", "korrigiert"]]);
  assert.equal(K.statusVon("übungsblatt", { status: "korrigiert" }).fertig, true);
  assert.equal(K.statusVon("übungsblatt", { status: "korrigiert" }).neu, "offen");
  for (const x of ["", undefined, "in Arbeit"]) assert.equal(K.statusVon("übungsblatt", { status: x }).wert, "offen", String(x));
  const N = { "Übungsblätter/S100 Blatt 03.md": { typ: "übungsblatt", code: "S100", nummer: 3, faellig: "2026-10-27", status: "offen" } };
  const el = kopf(N).zeichnen("Übungsblätter/S100 Blatt 03.md");
  assert.deepEqual(el.finde("eba-vorl-label")[0].texte(), ["Übungsblatt 3 · S100 · Abgabe Di 27.10."]);
  assert.deepEqual([knopf(el).texte(), knopf(el).attr["aria-haspopup"]], [["Offen"], "menu"]);
});
