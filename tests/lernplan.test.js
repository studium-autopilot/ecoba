// Lernplan (lernplan.js, kapitelLesen, zielVon, kapazitaet, planen, stand): Kapitelzeilen lesen, Ziel „70/100“, Wochen mit Pausen,
// Fälligkeit je Kapitel bei gleichem Aufwand je Woche, Stand eines Moduls. Nur ausgedachte Kapitel. Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { laden } = require("./laden.js");

const { kapitelLesen, gewichte, zielVon, kapazitaet, planen, stand, anteilAusZielnote, faktorenLesen, nachVorlesung, altklausurPlan, altersSchluessel, planBild,
  sollHeute, heldDaten, heldText, NOTEN, stufeVon, zielBei, zielVorschau, zielTeile,
  vorlernenSetzen } = laden("lernplan").ergebnis;

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

test("Zeile eines Moduls: in der Lernplan-Notiz der Name als Link zur Modulseite, in der Übersicht Kürzel und Name (26.10.2026)", () => {
  const { titelHtml } = laden("lernplan").ergebnis;
  const P = { code: "X100", f: { basename: "X100 Lernplan" }, modul: { titel: "Märkte & Preise", f: { path: "Module/X100 Märkte & Preise.md" } } };
  assert.equal(titelHtml(P, true), '<a class="internal-link eba-kopf-modul" data-href="Module/X100 Märkte &amp; Preise.md" '
    + 'href="Module/X100 Märkte &amp; Preise.md">Märkte &amp; Preise</a>', "der Titel „X100 Lernplan“ nennt das Kürzel schon");
  assert.equal(titelHtml(P, false), "X100 Märkte &amp; Preise");
  assert.equal(titelHtml({ code: "X100", f: { basename: "X100 Lernplan" }, modul: null }, true), "X100 Lernplan", "ohne Modulnotiz der Name der Notiz");
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
  assert.equal(S.art, "hinterher"); assert.deepEqual(S.pille, { art: "warn", text: "2 Kapitel überfällig" }); assert.deepEqual(S.woche, [0, 1, 2]);
  S = standAm("2026-11-17", [1], [true, false, false, false]);
  assert.equal(S.art, "wartet"); assert.deepEqual(S.pille, { art: "info", text: "wartet auf Kapitel 2" });
  S = standAm("2026-11-17", [], [true, false, false, false]);
  assert.equal(S.art, "hinterher", "Kapitel 1 ist da und offen"); assert.equal(S.pille.text, "1 Kapitel überfällig");
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

test("Kapitel lesen: Tag der Vorlesung und des Zwischentests, Folien als Link mit Text", () => {
  const [k] = kapitelLesen("- [ ] 1 Grundlagen · [[X100 Folien 01 Grundlagen|Folien]] · 42 S. · Vorlesung 19.10.2026 · Zwischentest 3.11.2026");
  assert.deepEqual([k.nr, k.titel, k.links, k.seiten, k.vorlesung, k.zwischentest], ["1", "Grundlagen", ["X100 Folien 01 Grundlagen"], 42, "2026-10-19", "2026-11-03"]);
  assert.equal(kapitelLesen("- [ ] 2 Märkte · Vorlesung bald")[0].vorlesung, "", "nur ein Datum zählt");
});

test("Wochen: weniger Zeit (deine Angabe) nimmt einen Teil der Woche, auch in der Pause", () => {
  assert.equal(kapazitaet("2026-11-02", [], [], 0.5), 0.5);
  assert.equal(kapazitaet("2026-11-02", [], [], 0), 0);
  assert.equal(Math.round(kapazitaet("2026-12-28", [{ von: "2026-12-23", bis: "2027-01-06" }], [], 0.5) * 100) / 100, 0.15);
  assert.deepEqual(faktorenLesen(["2026-11-18 50", "2026-11-23 0 %", "quatsch", "2026-11-30 150", 7]), { "2026-11-16": 0.5, "2026-11-23": 0 },
    "Montag der Woche, ungültiges fällt weg");
  assert.deepEqual(faktorenLesen("2026-11-18 50"), {});
});

test("Ziel nach der Zielnote: bis 1,5 nach 60 %, bis 2,5 nach 70 %, sonst nach 80 %", () => {
  assert.deepEqual(["1,0", "1.5", "1,7", "2,5", "2,7", "4,0", "", "5", "gut"].map(anteilAusZielnote), [0.6, 0.6, 0.7, 0.7, 0.8, 0.8, 0.7, 0.7, 0.7]);
});

test("Plan: ein Zwischentest zieht seine Kapitel vor, danach gleichmäßig weiter; Wochen ohne Zeit tragen nichts", () => {
  const k = kap([1, 1, 1, 1]);
  k[2].frist = "2026-11-15"; // Zwischentest in der Woche ab 16.11.: Kapitel 1–3 bis So 15.11.
  const P = planen({ kapitel: k, beginn: "2026-11-02", ziel: "2026-11-29", heute: "2026-11-02", pausen: [], freie: [] });
  assert.deepEqual(P.wochen.map((w) => w.soll), [1.5, 3, 3.5, 4]);
  assert.deepEqual(P.faellig, ["2026-11-08", "2026-11-15", "2026-11-15", "2026-11-29"]);
  // Eine Frist, die der gleichmäßige Plan ohnehin schafft, ändert nichts
  const k2 = kap([1, 1, 1, 1]);
  k2[0].frist = "2026-11-22";
  assert.deepEqual(planen({ kapitel: k2, beginn: "2026-11-02", ziel: "2026-11-29", heute: "2026-11-02", pausen: [], freie: [] }).faellig,
    ["2026-11-08", "2026-11-15", "2026-11-22", "2026-11-29"]);
  // Woche ab 16.11. ohne Zeit: Kapitel 3 rutscht in die letzte Woche
  const Q = planen({ kapitel: kap([1, 1, 1, 1]), beginn: "2026-11-02", ziel: "2026-11-29", heute: "2026-11-02", pausen: [], freie: [], faktoren: { "2026-11-16": 0 } });
  assert.deepEqual(Q.faellig, ["2026-11-08", "2026-11-15", "2026-11-29", "2026-11-29"]);
  // Alle Wochen ohne Zeit: trotzdem ein Plan
  assert.equal(planen({ kapitel: kap([1]), beginn: "2026-11-02", ziel: "2026-11-08", heute: "2026-11-02", pausen: [], freie: [], faktoren: { "2026-11-02": 0 } }).faellig[0], "2026-11-08");
});

test("Ohne Vorlernen: frühestens eine Woche nach der Vorlesung; den Rest schätzt die Vorlesungszeit", () => {
  const G = nachVorlesung([{ gewicht: 1, vorlesung: "2026-10-19" }, { gewicht: 1 }, { gewicht: 2 }], "2026-10-12", "2026-11-30");
  assert.deepEqual(G, [{ tag: "2026-11-01", geschaetzt: false }, { tag: "2026-11-08", geschaetzt: true }, { tag: "2026-11-22", geschaetzt: true }]);
  // Ein übersprungenes Kapitel gilt mit dem nächsten als behandelt; ganz ohne Vorlesung schätzt der Plan ab Vorlesungsbeginn
  assert.deepEqual(nachVorlesung([{ gewicht: 1, vorlesung: "2026-10-19" }, { gewicht: 1 }, { gewicht: 1, vorlesung: "2026-11-02" }], "2026-10-12", "2026-11-30")[1],
    { tag: "2026-11-15", geschaetzt: false });
  assert.deepEqual(nachVorlesung([{ gewicht: 1 }, { gewicht: 1 }], "2026-10-12", "2026-11-09").map((x) => x.tag), ["2026-10-25", "2026-11-08"]);
});

test("Stand: hinterher nur mit Kapiteln, die die Vorlesung schon hatte; sonst vorlernen bzw. ohne Vorlernen wartet", () => {
  const am = (erreicht, o) => {
    const k = kap([1, 1, 1, 1]).map((x, i) => Object.assign(x, { erreicht: erreicht[i] }));
    const plan = planen({ kapitel: k, beginn: "2026-11-02", ziel: "2026-11-29", heute: "2026-11-17", pausen: [], freie: [] });
    return stand(Object.assign({ kapitel: k, plan, heute: "2026-11-17", ziel: "2026-11-29", klausur: "2027-02-06" }, o || {}));
  };
  assert.deepEqual(am([true, false, false, false]).pille, { art: "warn", text: "1 Kapitel überfällig" }, "Kapitel 1 hatte die Vorlesung");
  let S = am([false, false, false, false]);
  assert.equal(S.art, "vorlernen"); assert.deepEqual(S.pille, { art: "info", text: "2 Kapitel vorlernen" });
  assert.deepEqual(S.woche, [0, 1, 2], "die Kapitel bleiben in der Woche");
  assert.deepEqual(am([false, false, false, false], { vorlernen: false }).pille, { art: "info", text: "wartet auf Kapitel 1" });
});

test("Altklausuren: von alt nach neu auf die Wochen bis zur Klausur, die neueste offene für den Vortag", () => {
  const titel = ["WS 2023/24 Haupttermin", "WS 2018/19 Nachtermin", "SS 2020 Haupttermin", "WS 2018/19 Haupttermin"];
  assert.deepEqual(titel.slice().sort((a, b) => altersSchluessel(a) - altersSchluessel(b)),
    ["WS 2018/19 Haupttermin", "WS 2018/19 Nachtermin", "SS 2020 Haupttermin", "WS 2023/24 Haupttermin"]);
  const alt = [{ titel: "A", fertig: true }, { titel: "B", fertig: false }, { titel: "C", fertig: false }, { titel: "D", fertig: false }];
  const A = altklausurPlan(alt, "2027-01-04", "2027-02-08");
  assert.deepEqual([A.fertig, A.offen.length, A.dieseWoche, A.naechste.titel, A.vortag.titel], [1, 3, 1, "B", "D"]);
  const B = altklausurPlan(alt.slice(0, 2), "2027-02-01", "2027-02-08");
  assert.deepEqual([B.dieseWoche, B.naechste.titel, B.vortag], [1, "B", null], "die letzte offene ist die nächste");
  assert.equal(altklausurPlan([], "2027-02-01", "2027-02-08").naechste, null);
});

test("Semesterplan: Säulen je Woche nach ECTS (verstanden, offen, überfällig), Bahn mit Stand, überfällig bis heute, Ziel, Klausur", () => {
  const r = (v) => Math.round(v * 1000) / 1000;
  const kapitel = kap([1, 1, 1, 1], [1, 0, 0, 0], [true, true, true, false]);
  kapitel[2].zwischentest = "2026-11-13";
  const P = { code: "X100", ects: 6, ziel: "2026-11-15", klausur: { datum: "2026-11-25" }, stand: { art: "hinterher" }, kapitel,
    plan: { wochen: [{ mo: "2026-11-02", soll: 2 }, { mo: "2026-11-09", soll: 4 }], gesamt: 4, ist: 1,
      faellig: ["2026-11-08", "2026-11-08", "2026-11-15", "2026-11-15"] } };
  const B = planBild([P], "2026-11-11", [{ von: "2026-11-16", bis: "2026-11-20", name: "Lesewoche" }]);
  // Montag der ersten Planwoche bis Sonntag der Klausurwoche: 4 Wochen
  assert.equal(B.von, "2026-11-02"); assert.equal(B.tage, 28); assert.equal(B.jetzt, 1);
  assert.deepEqual(B.wochen.map((w) => [w.fertig, w.offen, w.ueber]), [[1.5, 0, 1.5], [0, 3, 0], [0, 0, 0], [0, 0, 0]],
    "je Kapitel 6 ECTS / 4; Kapitel 2 ist vor dieser Woche fällig und da: überfällig; Kapitel 4 noch nicht da: offen");
  assert.equal(B.max, 3);
  const [x] = B.bahnen;
  assert.equal(x.P, P);
  assert.deepEqual([x.beginn, x.stand, x.ueber, x.ziel, x.klausur].map(r), [0, r(3.5 / 28), r(9.5 / 28), 0.5, r(23.5 / 28)],
    "Stand: ein Kapitel von zwei der ersten Woche = Mitte der Woche; überfällig bis heute (Mittag); Ziel = Ende des Sonntags");
  assert.deepEqual(x.tests.map(r), [r(11.5 / 28)]);
  assert.equal(r(B.heute), r(9.5 / 28));
  assert.deepEqual(B.monate, [{ x: 0, text: "Nov" }], "kein Dezember: die Achse endet am 29.11.");
  assert.deepEqual(B.pausen.map((q) => [q.a, r(q.b), q.name]), [[0.5, r(19 / 28), "Lesewoche"]]);
  // Alles verstanden: Stand am Ziel, nichts überfällig; Stand „vorlernen“: nichts in Warnfarbe
  const fertig = planBild([Object.assign({}, P, { kapitel: kap([1, 1, 1, 1], [1, 1, 1, 1]), plan: Object.assign({}, P.plan, { ist: 4 }), stand: { art: "fertig" } })], "2026-11-11");
  assert.deepEqual([fertig.bahnen[0].stand, fertig.bahnen[0].ueber], [0.5, null]);
  assert.equal(planBild([Object.assign({}, P, { stand: { art: "vorlernen" } })], "2026-11-11").bahnen[0].ueber, null);
  // Monate: ein Monatsanfang später als zwei Wochen nach Beginn bekommt eine Marke, der erste Monat auch
  const lang = planBild([Object.assign({}, P, { klausur: { datum: "2027-01-20" } })], "2026-11-11");
  assert.deepEqual(lang.monate.map((m) => m.text), ["Nov", "Dez", "Jan"]);
  assert.equal(planBild([], "2026-11-11"), null);
  assert.equal(planBild([P], "2027-03-01").heute, null, "heute außerhalb: keine Linie");
  // Je Modul ein Teil der Säule, mit seiner Farbe
  const zwei = planBild([Object.assign({}, P, { farbe: 3 }), Object.assign({}, P, { code: "Y200", ects: 3, farbe: 5 })], "2026-11-11");
  assert.deepEqual(zwei.wochen[0].module, [{ farbe: 3, fertig: 1.5, offen: 0, ueber: 1.5 }, { farbe: 5, fertig: 0.75, offen: 0, ueber: 0.75 }]);
  assert.deepEqual(zwei.wochen.map((w) => w.fertig + w.offen + w.ueber), [4.5, 4.5, 0, 0], "die Säule ist die Summe der Module");
});

test("Kopf des Bereichs: Stand nach ECTS gegen den Plan von heute, Rückstand, Vorsprung, diese Woche, nächste Klausur, Satz dazu", () => {
  const r = (v) => Math.round(v * 1000) / 1000;
  const P = { code: "X100", ects: 6, klausur: { datum: "2026-11-25" }, stand: { art: "hinterher" }, kapitel: kap([1, 1, 1, 1], [1, 0, 0, 0], [true, true, true, false]),
    plan: { wochen: [{ mo: "2026-11-02", soll: 2 }, { mo: "2026-11-09", soll: 4 }], gesamt: 4, ist: 1, faellig: ["2026-11-08", "2026-11-08", "2026-11-15", "2026-11-15"] } };
  const Q = { code: "Y200", ects: 3, klausur: { datum: "2026-11-20" }, stand: { art: "vorlernen" }, kapitel: kap([1, 1], [1, 1]),
    plan: { wochen: [{ mo: "2026-11-09", soll: 1 }, { mo: "2026-11-16", soll: 2 }], gesamt: 2, ist: 2, faellig: ["2026-11-15", "2026-11-22"] } };
  // Plan von heute: innerhalb einer Woche gleichmäßig, Mittwochmittag = 2,5 von 7 Tagen
  assert.equal(r(sollHeute(P, "2026-11-11")), r(2 + (2 * 2.5) / 7));
  assert.equal(sollHeute(P, "2026-11-01"), 0, "vor dem Plan");
  assert.equal(sollHeute(P, "2026-11-20"), 4, "danach alles");
  const ueber = (M, i) => M.plan.faellig[i] < "2026-11-09" && M.kapitel[i].da;
  const H = heldDaten([P, Q], "2026-11-11", ueber);
  assert.equal(r(H.ist), r((6 * 1 / 4 + 3 * 2 / 2) / 9), "nach ECTS gewichtet");
  assert.equal(r(H.soll), r((6 * sollHeute(P, "2026-11-11") / 4 + 3 * sollHeute(Q, "2026-11-11") / 2) / 9));
  assert.deepEqual([H.rueckstand, H.vorsprung, H.woche, H.alleFertig], [1, 1, { fertig: 1, gesamt: 3 }, false],
    "Kapitel 2 von X100 ist überfällig; Kapitel 2 von Y200 ist erst nächste Woche dran und schon verstanden");
  assert.deepEqual(H.aufholen, { extra: 1, bis: "2026-11-15" }, "bis zwei Kapitel: diese Woche");
  assert.deepEqual([H.klausur.P.code, H.klausur.tage], ["Y200", 9]);
  assert.deepEqual(heldText(H), { titel: "1 Kapitel im Rückstand", satz: "Hol es bis So 15.11. nach, dann bist du wieder im Plan." });
  const viel = heldDaten([P], "2026-11-11", () => true);
  assert.deepEqual([viel.rueckstand, viel.aufholen], [3, { extra: 1, bis: "2026-11-29" }], "mehr: verteilt auf diese und die zwei nächsten Wochen");
  assert.equal(heldText(Object.assign({}, viel, { rueckstand: 7, aufholen: { extra: 3, bis: "2026-11-29" } })).satz,
    "Mit 3 Kapiteln mehr pro Woche bist du bis So 29.11. wieder im Plan.");
  const ohne = Object.assign({}, H, { rueckstand: 0, aufholen: null });
  assert.deepEqual(heldText(ohne), { titel: "1 Kapitel Vorsprung", satz: "Diese Woche sind noch 2 Kapitel dran." });
  assert.deepEqual(heldText(Object.assign({}, ohne, { vorsprung: 0, woche: { fertig: 3, gesamt: 3 } })), { titel: "Du liegst im Plan.", satz: "Diese Woche ist geschafft." });
  assert.equal(heldText(Object.assign({}, ohne, { vorsprung: 0, woche: { fertig: 0, gesamt: 0 } })).satz, "");
  const fertig = heldDaten([Q], "2026-11-11", ueber);
  assert.deepEqual([fertig.alleFertig, heldText(fertig).titel], [true, "Alles verstanden."]);
  assert.equal(heldDaten([], "2026-11-11", ueber).alleFertig, false, "ohne Module nicht „alles verstanden“");
});

test("Zielnote: drei Stufen wie anteilAusZielnote, Vorschau je Anteil, Satz dazu; eigenes Ziel und Vorlesung bleiben", () => {
  assert.deepEqual(NOTEN.map(stufeVon), [0, 0, 1, 1, 1, 2, 2, 2, 2, 2]);
  for (const n of NOTEN) assert.equal(anteilAusZielnote(n), [0.6, 0.7, 0.8][stufeVon(n)], n);
  assert.equal(stufeVon("1,5"), 0); assert.equal(stufeVon("2,5"), 1);
  const P = { beginn: "2026-10-12", klausur: { datum: "2027-02-08" }, ziel: "2027-01-10", zielPlan: "2027-01-10" };
  const Q = { beginn: "2026-10-12", klausur: { datum: "2027-02-22" }, ziel: "2027-01-17", zielPlan: "2027-01-17" };
  const V = zielVorschau([P], 0.6), z = zielVon(P.beginn, P.klausur.datum, 0.6);
  assert.deepEqual(V, { von: z, bis: z, wochenVon: 6, wochenBis: 6 });
  assert.equal(z, "2026-12-27");
  assert.equal(zielTeile(V, 0.6).map((t) => t.text).join(""), "Alles verstanden nach 60 % der Zeit, bis So 27.12., danach 6 Wochen Klausurvorbereitung.");
  assert.deepEqual(zielTeile(V, 0.6).filter((t) => t.wert).map((t) => t.text), ["60 % der Zeit", "So 27.12.", "6 Wochen"]);
  const W = zielVorschau([P, Q], 0.6);
  assert.equal(zielTeile(W, 0.6).map((t) => t.text).join(""), `Alles verstanden nach 60 % der Zeit, bis 27.12.–${+W.bis.slice(8)}.${+W.bis.slice(5, 7)}., danach 6–7 Wochen Klausurvorbereitung.`);
  // Eigenes „verstanden bis“ zählt nicht; nur eigene: kein Datum
  assert.deepEqual(zielVorschau([P, Object.assign({}, Q, { eigenesZiel: true })], 0.6), V);
  assert.equal(zielVorschau([Object.assign({}, P, { eigenesZiel: true })], 0.6), null);
  assert.equal(zielTeile(null, 0.6)[0].text, "Deine Module haben ein eigenes Datum, bis wann alles verstanden sein soll.");
  // Erst nach der Vorlesung lernen: Hält die Vorlesung das Ziel schon später, rückt es nicht früher
  const spaet = Object.assign({}, P, { zielPlan: "2026-12-27", ziel: "2027-01-10" });
  assert.equal(zielBei(spaet, 0.6), "2027-01-10", "geplant 27.12., die Vorlesung hält es bis 10.1.");
  assert.equal(zielBei(spaet, 0.8), "2027-01-17", "80 %: später als die Vorlesung");
  assert.equal(zielBei(P, 0.8), "2027-01-17");
});

test("Modulfarben wie im Stundenplan, Module ohne Stundenplan bekommen die nächsten Farben", () => {
  const { modulFarben: ohneWoche } = laden("lernplan").ergebnis;
  assert.deepEqual(ohneWoche(["S100", "B110", "E101"]), { B110: 1, E101: 2, S100: 3 }, "nach Kürzel");
  const { modulFarben: mitWoche } = laden("lernplan", { kontext: { woche: { modulFarben: () => ({ S100: 1, B110: 2 }) } } }).ergebnis;
  assert.deepEqual(mitWoche(["S100", "B110", "E101", "A000"]), { S100: 1, B110: 2, A000: 3, E101: 4 });
  const { modulFarben: kaputt } = laden("lernplan", { kontext: { woche: { modulFarben: () => { throw new Error("kein Stundenplan"); } } } }).ergebnis;
  assert.deepEqual(kaputt(["B110"]), { B110: 1 });
});

test("Plan: weniger Zeit in einer späteren Woche verschiebt nichts in vergangene Wochen und nichts in diese", () => {
  const P0 = planen({ kapitel: kap([1, 1, 1, 1, 1, 1]), beginn: "2026-11-02", ziel: "2026-12-13", heute: "2026-11-17", pausen: [], freie: [] });
  assert.deepEqual(P0.wochen.map((w) => w.soll), [1, 2, 3, 4, 5, 6]);
  // Woche ab 7.12. ohne Zeit, heute in der dritten Woche: die ersten drei bleiben, der Rest (3) verteilt sich auf zwei Wochen
  const P1 = planen({ kapitel: kap([1, 1, 1, 1, 1, 1]), beginn: "2026-11-02", ziel: "2026-12-13", heute: "2026-11-17", pausen: [], freie: [], faktoren: { "2026-12-07": 0 } });
  assert.deepEqual(P1.wochen.map((w) => Math.round(w.soll * 100) / 100), [1, 2, 3, 4.5, 6, 6]);
  assert.deepEqual(P1.faellig, ["2026-11-08", "2026-11-15", "2026-11-22", "2026-11-29", "2026-12-06", "2026-12-06"]);
  // Eine Woche ohne Zeit, die schon vorbei ist, zählt: Der Plan war damals langsamer
  const P2 = planen({ kapitel: kap([1, 1, 1, 1, 1, 1]), beginn: "2026-11-02", ziel: "2026-12-13", heute: "2026-11-17", pausen: [], freie: [], faktoren: { "2026-11-09": 0 } });
  assert.deepEqual(P2.wochen.map((w) => Math.round(w.soll * 100) / 100), [1.2, 1.2, 2.4, 3.6, 4.8, 6]);
  // Diese Woche ohne Zeit: Vergangene Wochen bleiben, diese trägt nichts, der Rest verteilt sich auf die drei danach
  const P3 = planen({ kapitel: kap([1, 1, 1, 1, 1, 1]), beginn: "2026-11-02", ziel: "2026-12-13", heute: "2026-11-17", pausen: [], freie: [], faktoren: { "2026-11-16": 0 } });
  assert.deepEqual(P3.wochen.map((w) => Math.round(w.soll * 100) / 100), [1, 2, 2, 3.33, 4.67, 6]);
  // Vor dem ersten Montag zählt jede Angabe gleich
  const P4 = planen({ kapitel: kap([1, 1, 1, 1, 1, 1]), beginn: "2026-11-02", ziel: "2026-12-13", heute: "2026-10-28", pausen: [], freie: [], faktoren: { "2026-12-07": 0 } });
  assert.deepEqual(P4.wochen.map((w) => Math.round(w.soll * 100) / 100), [1.2, 2.4, 3.6, 4.8, 6, 6]);
});

test("Schalter „Vor der Vorlesung lernen“: schreibt nur die Zeile vorlernen, der Rest des Frontmatters bleibt Zeichen für Zeichen", () => {
  const notiz = '---\ntyp: lernplan\ncode: "X100"\nsemester: "WS 2026/27"\nquelle: "https://uni.example/folien"\n---\n\n## Kapitel\n- [ ] 1 Märkte\n';
  const aus = vorlernenSetzen(notiz, false);
  assert.equal(aus, notiz.replace('folien"\n---', 'folien"\nvorlernen: false\n---'));
  assert.equal(vorlernenSetzen(aus, true), notiz, "wieder an: die Zeile ist weg");
  assert.equal(vorlernenSetzen(aus, false), aus, "zweimal aus: eine Zeile");
  assert.equal(vorlernenSetzen(notiz.replace(/\n/g, "\r\n"), false).split("\r\n").slice(0, 7).join("|"),
    '---|typ: lernplan|code: "X100"|semester: "WS 2026/27"|quelle: "https://uni.example/folien"|vorlernen: false|---', "Windows-Zeilenenden");
  assert.equal(vorlernenSetzen("## Kapitel\n- [ ] 1 Märkte\n", false), null, "ohne Frontmatter: nichts");
});
