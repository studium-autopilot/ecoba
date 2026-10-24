// Lernplan (lernplan.js, kapitelLesen, zielVon, kapazitaet, planen, stand): Kapitelzeilen lesen, Ziel „70/100“, Wochen mit Pausen,
// Fälligkeit je Kapitel bei gleichem Aufwand je Woche, Stand eines Moduls. Nur ausgedachte Kapitel. Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { laden } = require("./laden.js");

const { kapitelLesen, gewichte, zielVon, kapazitaet, planen, stand } = laden("lernplan").ergebnis;

const NOTIZ = [
  "---",
  "typ: lernplan",
  "code: X100",
  "- [x] 9 Steht im Frontmatter und zählt nicht",
  "---",
  "",
  "```eba-lernplan modul",
  "- [ ] 8 Steht im Codeblock und zählt nicht",
  "```",
  "",
  "## Kapitel",
  "",
  "- [x] 1 Grundbegriffe · [[X100 Folien 01 Grundbegriffe]] · 40 S.",
  "- [ ] 2 Märkte und Preise · [[X100 Folien 02 Märkte.pdf#page=3|S. 3–20]]",
  "  - [x] 2.1 Angebot",
  "  - [ ] 2.2 Nachfrage",
  "\t- [x] 2.3 Gleichgewicht ^k1a2b3",
  "- [ ] IV Steuern · 12 S. ^abc123",
  "- [ ] E Einführung",
  "- [ ] Ohne Nummer",
  "Text dazwischen",
  "* [X] 5 Andere Aufzählung",
].join("\n");

test("Kapitel lesen: Frontmatter und Codeblöcke zählen nicht, Nummern, Links, Seiten, Unterkapitel", () => {
  const K = kapitelLesen(NOTIZ);
  assert.deepEqual(K.map((k) => [k.nr, k.titel, k.fertig]), [
    ["1", "Grundbegriffe", true], ["2", "Märkte und Preise", false], ["IV", "Steuern", false],
    ["E", "Einführung", false], ["", "Ohne Nummer", false], ["5", "Andere Aufzählung", true],
  ]);
  assert.deepEqual(K[0].links, ["X100 Folien 01 Grundbegriffe"]);
  assert.equal(K[0].seiten, 40);
  assert.deepEqual(K[1].links, ["X100 Folien 02 Märkte.pdf"], "Link ohne #page und ohne Anzeigetext");
  assert.equal(K[1].seiten, null, "„S. 3–20“ im Anzeigetext ist keine Seitenzahl");
  assert.deepEqual(K[1].teile.map((t) => [t.nr, t.titel, t.fertig]), [["2.1", "Angebot", true], ["2.2", "Nachfrage", false], ["2.3", "Gleichgewicht", true]]);
  assert.equal(K[2].seiten, 12, "Block-ID am Ende stört nicht");
  assert.equal(K[0].zeile, 12);
  assert.equal(K[0].roh, "- [x] 1 Grundbegriffe · [[X100 Folien 01 Grundbegriffe]] · 40 S.");
});

test("Kapitel lesen: Nummern in jeder Form der Kapitellisten (E1, 1a, A.1, 2.3b), ein gewöhnliches Wort ist keine", () => {
  const K = kapitelLesen(["- [ ] E1 Einstieg", "- [ ] 1a Teil A", "- [ ] A.1 Anhang", "- [ ] 2.3b Rest", "- [ ] 1. Mit Punkt", "- [ ] IV) Steuern",
    "- [ ] Ohne Nummer", "- [ ] KI und Recht", "- [ ] Anhang Literatur"].join("\n"));
  assert.deepEqual(K.map((k) => [k.nr, k.titel]), [["E1", "Einstieg"], ["1a", "Teil A"], ["A.1", "Anhang"], ["2.3b", "Rest"], ["1", "Mit Punkt"],
    ["IV", "Steuern"], ["", "Ohne Nummer"], ["", "KI und Recht"], ["", "Anhang Literatur"]]);
});

test("Nicht mehr dran: bestanden oder anerkannt, Notiz eines anderen Semesters, Modul liegt jetzt anderswo", () => {
  const { nichtMehrDran } = laden("lernplan").ergebnis;
  const fm = { semester: "WS 2026/27" }, m = (o) => Object.assign({ code: "X100", status: "offen", semester: "WS 2026/27" }, o);
  assert.equal(nichtMehrDran(fm, m(), "WS 2026/27"), "");
  assert.equal(nichtMehrDran(fm, m({ status: "anerkannt" }), "WS 2026/27"), "Modul anerkannt");
  assert.equal(nichtMehrDran({}, m({ status: "bestanden" }), "WS 2026/27"), "Modul bestanden", "auch ohne semester (eigene KI)");
  assert.equal(nichtMehrDran(fm, m(), "SS 2027"), "Plan für WS 2026/27", "Semesterwechsel");
  assert.equal(nichtMehrDran(fm, m({ semester: "SS 2027" }), "WS 2026/27"), "liegt jetzt in SS 2027");
  assert.equal(nichtMehrDran(fm, m({ semester: "SS 2027", status: "läuft" }), "WS 2026/27"), "", "läuft: bleibt dran");
  assert.equal(nichtMehrDran(fm, m({ semester: "" }), "WS 2026/27"), "nicht mehr in deinem Plan");
  assert.equal(nichtMehrDran({}, m({ semester: "SS 2027" }), "WS 2026/27"), "", "ohne semester (eigene KI) nur bestanden/anerkannt");
  assert.equal(nichtMehrDran(fm, null, "WS 2026/27"), "", "ohne Modulnotiz");
});

test("Folien je Kapitel: neue Fassung daneben gilt vor deiner älteren, Anmerkungen und Videos zählen nie", () => {
  const u = (art, nummer, seiten) => ({ typ: "unterlage", code: "X100", art, nummer, seiten });
  const { folienVon } = laden("lernplan", { notizen: {
    "Unterlagen/X100/X100 Folien 01 Grundbegriffe neue Fassung 2026-11-02.md": u("Folien", 1, 44),
    "Unterlagen/X100/X100 Folien 01 Grundbegriffe.md": u("Folien", 1, 40),
    "Unterlagen/X100/X100 Folien 01 Grundbegriffe neue Fassung 2026-10-20.md": u("Folien", 1, 42),
    "Unterlagen/X100/X100 Folien 02 Märkte.md": u("Folien", 2, 30),
    "Unterlagen/X100/X100 Folien 02 Märkte mit Anmerkungen neue Fassung 2026-12-01.md": u("Folien", 2, 31),
    "Unterlagen/X100/X100 Übung 01.md": u("Übung", 1, 3),
  } }).ergebnis;
  const f = folienVon("X100");
  assert.deepEqual(Object.keys(f), ["1", "2"]);
  assert.deepEqual([f[1].f.basename, f[1].seiten], ["X100 Folien 01 Grundbegriffe neue Fassung 2026-11-02", 44]);
  assert.equal(f[2].f.basename, "X100 Folien 02 Märkte");
  // am selben Tag mehrmals: „(10)“ ist neuer als „(9)“
  const { folienVon: zehn } = laden("lernplan", { notizen: {
    "Unterlagen/X100/X100 Folien 03 Preise neue Fassung 2026-11-02 (10).md": u("Folien", 3, 12),
    "Unterlagen/X100/X100 Folien 03 Preise neue Fassung 2026-11-02 (9).md": u("Folien", 3, 11),
  } }).ergebnis;
  assert.equal(zehn("X100")[3].seiten, 12);
});

test("Kapitel lesen: Link im Titel zeigt seinen Text, leere Notiz ergibt nichts", () => {
  assert.deepEqual(kapitelLesen("- [ ] 3 [[X100 Folien 03 Kosten|Kosten]] und Erlöse").map((k) => [k.titel, k.links]), [["Kosten und Erlöse", []]]);
  assert.deepEqual(kapitelLesen(""), []);
  assert.deepEqual(kapitelLesen("---\ntyp: lernplan\n---\nNur Text"), []);
});

test("Kapitel lesen: Lehrbuch online (https-Link) wird erkannt, andere Links nicht", () => {
  const K = kapitelLesen([
    "- [ ] 3 Knappheit, Arbeit und Entscheidungen · [online](https://lehrbuch.example/text/03.html)",
    "- [ ] 4 Ohne Link · [alt](http://lehrbuch.example/04.html) · [[X100 Folien 04]]",
  ].join("\n"));
  assert.deepEqual(K[0].web, ["https://lehrbuch.example/text/03.html"]);
  assert.equal(K[0].titel, "Knappheit, Arbeit und Entscheidungen");
  assert.deepEqual(K[1].web, [], "nur https");
  assert.deepEqual(K[1].links, ["X100 Folien 04"]);
});

test("Gewichte: Seiten zuerst (fehlende = Mittelwert), ohne Seiten die Zahl der Unterkapitel, sonst gleich", () => {
  const u = (n) => Array.from({ length: n }, () => ({}));
  assert.deepEqual(gewichte([{ seitenWert: 40, teile: u(3) }, { seitenWert: null, teile: u(9) }, { seitenWert: 20, teile: [] }]), [40, 30, 20]);
  assert.deepEqual(gewichte([{ seitenWert: null, teile: u(9) }, { seitenWert: null, teile: u(1) }, { seitenWert: null, teile: [] }]), [9, 1, 5]);
  assert.deepEqual(gewichte([{ seitenWert: null, teile: [] }, { seitenWert: null, teile: [] }]), [1, 1]);
});

test("Ziel 70/100: Sonntag der Woche nach 70 % der Zeit, höchstens der Sonntag vor der Klausurwoche", () => {
  // Mo 12.10.2026 bis Sa 6.2.2027 = 117 Tage; 70 % = 82 Tage → Sa 2.1.2027 → So 3.1.2027
  assert.equal(zielVon("2026-10-12", "2027-02-06"), "2027-01-03");
  assert.equal(zielVon("2026-10-12", "2027-02-06", 1), "2027-01-31", "nie in der Klausurwoche");
  assert.equal(zielVon("2026-10-12", "2027-02-06", 0.5), "2026-12-13");
});

test("Wochen: frei = Montag bis Freitag ohne Pausen und freie Tage, ganz frei zählt 30 %", () => {
  const pausen = [{ von: "2026-12-23", bis: "2027-01-06" }];
  assert.equal(kapazitaet("2026-11-02", pausen, []), 1);
  assert.equal(kapazitaet("2026-12-21", pausen, []), 0.4, "Mo und Di vor der Pause");
  assert.equal(kapazitaet("2026-12-28", pausen, []), 0.3);
  assert.equal(kapazitaet("2026-11-02", [], [{ datum: "2026-11-02" }, "2026-11-03"]), 0.6);
});

const kap = (gewichte, anteile, da) => gewichte.map((g, i) => ({ gewicht: g, anteil: (anteile || [])[i] || 0, da: da ? da[i] : true, nr: String(i + 1) }));

test("Plan: gleicher Aufwand je Woche, eine Pausenwoche verschiebt, Gewichte nach Seiten", () => {
  const P = planen({ kapitel: kap([1, 1, 1, 1]), beginn: "2026-11-02", ziel: "2026-11-29", heute: "2026-11-10", pausen: [], freie: [] });
  assert.deepEqual(P.faellig, ["2026-11-08", "2026-11-15", "2026-11-22", "2026-11-29"]);
  assert.equal(P.w, 1);
  assert.equal(P.gesamt, 4);
  // Woche 3 ganz in einer Pause (30 %): Kapitel 3 rutscht in Woche 4
  const Q = planen({ kapitel: kap([1, 1, 1, 1]), beginn: "2026-11-02", ziel: "2026-11-29", heute: "2026-11-02", pausen: [{ von: "2026-11-16", bis: "2026-11-20" }], freie: [] });
  assert.deepEqual(Q.faellig, ["2026-11-08", "2026-11-15", "2026-11-29", "2026-11-29"]);
  // Ein dickes Kapitel (3 von 4 Teilen des Gewichts) braucht drei Wochen
  const R = planen({ kapitel: kap([90, 30], [0.5, 0]), beginn: "2026-11-02", ziel: "2026-11-29", heute: "2026-11-02", pausen: [], freie: [] });
  assert.deepEqual(R.faellig, ["2026-11-22", "2026-11-29"]);
  assert.equal(R.ist, 45);
  // vor dem Beginn und nach dem Ziel
  assert.equal(planen({ kapitel: kap([1]), beginn: "2026-11-02", ziel: "2026-11-08", heute: "2026-10-20", pausen: [], freie: [] }).w, -1);
  assert.equal(planen({ kapitel: kap([1]), beginn: "2026-11-02", ziel: "2026-11-08", heute: "2026-11-20", pausen: [], freie: [] }).w, 1);
});

const standAm = (heute, anteile, da, o) => {
  const k = kap([1, 1, 1, 1], anteile, da);
  const plan = planen({ kapitel: k, beginn: "2026-11-02", ziel: "2026-11-29", heute, pausen: [], freie: [] });
  return stand(Object.assign({ kapitel: k, plan, heute, ziel: "2026-11-29", klausur: "2027-02-06" }, o || {}));
};

test("Stand: im Plan, voraus, hinterher, wartet auf ein Kapitel, das noch nicht da ist", () => {
  let S = standAm("2026-11-10", [1]);
  assert.equal(S.art, "plan"); assert.equal(S.pille, null, "im Plan ist der Normalfall ohne Pille"); assert.deepEqual(S.woche, [1], "Kapitel 2 ist diese Woche dran");
  S = standAm("2026-11-10", [1, 1, 1]);
  assert.equal(S.art, "voraus"); assert.deepEqual(S.pille, { art: "ok", text: "1 Kapitel voraus" });
  S = standAm("2026-11-17", []);
  assert.equal(S.art, "hinterher"); assert.deepEqual(S.pille, { art: "warn", text: "2 Kapitel hinterher" }); assert.deepEqual(S.woche, [0, 1, 2]);
  S = standAm("2026-11-17", [1], [true, false, false, false]);
  assert.equal(S.art, "wartet"); assert.deepEqual(S.pille, { art: "info", text: "wartet auf Kapitel 2" });
  S = standAm("2026-11-17", [], [true, false, false, false]);
  assert.equal(S.art, "hinterher", "Kapitel 1 ist da und offen"); assert.equal(S.pille.text, "1 Kapitel hinterher");
  S = standAm("2026-11-10", [1, 0.5]);
  assert.equal(S.art, "plan", "Unterkapitel zur Hälfte: Kapitel 2 bleibt diese Woche dran"); assert.deepEqual(S.woche, [1]);
});

test("Stand: alles verstanden, Klausurvorbereitung nach dem Ziel, Klausur vorbei", () => {
  assert.equal(standAm("2026-11-10", [1, 1, 1, 1]).pille.text, "alles verstanden");
  let S = standAm("2026-12-01", [1, 1, 1, 1]);
  assert.equal(S.art, "vorbereitung"); assert.deepEqual(S.pille, { art: "leer", text: "Klausurvorbereitung" }, "neutral, kein Akzent als Statusfarbe");
  S = standAm("2026-12-01", [1, 1]);
  assert.equal(S.art, "vorbereitung"); assert.equal(S.pille.text, "2 Kapitel offen"); assert.deepEqual(S.woche, [2, 3]);
  assert.equal(standAm("2027-02-07", [1]).art, "vorbei");
});

test("Registrieren vor dem Fachmodell: kein Fehler beim Start, das Abo kommt kurz danach", () => {
  // Das Plugin startet Erweiterungen alphabetisch: lernplan.js vor modell.js, ctx.modell fehlt beim Registrieren noch
  let spaeter = null, abo = null;
  const { ctx, ergebnis } = laden("lernplan", { kontext: { zeit: (fn) => { spaeter = fn; return 0; } } });
  assert.equal(ctx.modell, undefined);
  assert.doesNotThrow(() => ergebnis.registrieren());
  assert.equal(typeof spaeter, "function", "Anmeldung beim Fachmodell nachgeholt");
  ctx.modell = { beiAenderung: (fn) => { abo = fn; return () => {}; } };
  spaeter();
  assert.equal(typeof abo, "function", "Lernplan zeichnet bei Änderungen im Fachmodell neu");
});

test("Neuer Tag (auch Semesterwechsel): Bereich neu zeichnen und die Notizen mit den Kapitellisten abgleichen", () => {
  let tag = "2027-03-31", takt = null, abgleiche = 0;
  const { ergebnis } = laden("lernplan", { kontext: {
    date: { jetzt: () => new Date(tag + "T12:00:00"), now: () => tag },
    intervall: (fn) => { takt = fn; return 0; },
    zentral: { kapitel: () => { abgleiche++; return null; }, abruferHier: async () => true },
    modell: { daten: () => ({ module: [] }), semesterFuer: () => null, beiAenderung: () => () => {} },
  } });
  ergebnis.registrieren();
  takt();
  assert.equal(abgleiche, 0, "gleicher Tag: nichts");
  tag = "2027-04-01";
  takt();
  assert.equal(abgleiche, 1, "neuer Tag: Abgleich");
});
