// Schwerpunkte im Studienverlauf (schwerpunkte.js, rechnen und sichtbarFuer): Regeln der Prüfungsordnung für die
// Schwerpunktbereiche (genau 3, je 15–30 ECTS, Summe je Variante, VWL/BWL-Seite), was als Elective Studies zählt, wann der
// Block erscheint, Abgleich mit dem Fachmodell (bestandene und anerkannte Module zählen ohne „gewählt“). Nur ausgedachte Pläne.
// Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { laden, json } = require("./laden.js");

const { rechnen, sichtbarFuer } = laden("schwerpunkte").ergebnis;
const sp = (code, anrechnung, ects, o) => Object.assign({ code, titel: "Beispiel", ects, gruppe: "Schwerpunkt", anrechnung, imPlan: true, gewaehlt: true,
  pfad: `Module/3 Schwerpunktkatalog/${code}.md`, bereiche: [anrechnung] }, o || {});
const profil = (code, rollen, o) => Object.assign({ code, titel: "Profil", ects: 6, gruppe: "Profil & Vertiefung", anrechnung: "", imPlan: true, gewaehlt: true,
  pfad: `Module/2 Profil & Vertiefung/${code}.md`, bereiche: [], rolle_economics: rollen[0], rolle_ba: rollen[1] }, o || {});
const ects = (R) => Object.fromEntries(R.belegt.map((b) => [b.name, b.ects]));

test("Economics: drei Bereiche, je 15–30 ECTS, 75 ECTS, zwei VWL-Bereiche → alles erfüllt", () => {
  const R = rechnen([
    sp("E313", "Economic Policy", 6), sp("E314", "Economic Policy", 9), sp("E315", "Economic Policy", 9),
    sp("E370", "International Economics", 9), sp("E374", "International Economics", 9), sp("E375", "International Economics", 6),
    sp("B321", "Marketing", 9), sp("B322", "Marketing", 9), sp("B323", "Marketing", 9),
  ], "Economics");
  assert.deepEqual(ects(R), { "Economic Policy": 24, "International Economics": 24, "Marketing": 27 });
  assert.equal(R.summe, 75); assert.equal(R.soll, 75); assert.equal(R.vwl, 2); assert.equal(R.bwl, 1);
  assert.deepEqual(R.pruefung, { drei: true, rahmen: true, summe: true, seite: true });
  assert.equal(R.ok, true);
  assert.equal(R.seiteText, "mind. 2 VWL-Bereiche (2)");
});

test("Verstöße: zu wenig in einem Bereich, vier Bereiche, Summe falsch, Seite der Variante fehlt", () => {
  const R = rechnen([sp("B3X1", "Banking and Finance", 9), sp("B390", "International Business", 18), sp("B321", "Marketing", 15), sp("B331", "Managerial Accounting and Organisation", 33)],
    "Business Administration");
  assert.deepEqual(R.bereiche.filter((b) => b.ects).map((b) => b.stand), ["warn", "ok", "warn", "ok"]);
  assert.deepEqual(R.pruefung, { drei: false, rahmen: false, summe: false, seite: true });
  assert.equal(R.soll, 63);
  const E = rechnen([sp("B321", "Marketing", 30), sp("B390", "International Business", 18), sp("E313", "Economic Policy", 15)], "Economics");
  assert.equal(E.pruefung.seite, false, "Economics braucht zwei VWL-Bereiche");
  assert.equal(E.seiteText, "mind. 2 VWL-Bereiche (1)");
});

test("Data Science zählt für VWL und BWL; ohne Spezialisierung und offen: je ein Bereich, Soll 63", () => {
  for (const v of ["ohne Spezialisierung", "offen", ""]) {
    const R = rechnen([sp("DS320", "Data Science", 15), sp("E313", "Economic Policy", 24), sp("E381", "Elective Studies", 24)], v);
    assert.equal(R.vwl, 2); assert.equal(R.bwl, 1); assert.equal(R.soll, 63); assert.equal(R.summe, 63);
    assert.equal(R.pruefung.seite, true, v);
    assert.equal(R.seiteText, "mind. 1 VWL- und 1 BWL-Bereich (2 / 1)");
  }
  assert.equal(rechnen([], "").variante, "offen");
});

test("Profil & Vertiefung: Elective Studies nach Rolle der Variante oder „Zählt als“, nie als Pflicht", () => {
  const b220 = profil("B220", ["Elective Studies", "Pflicht"]);
  const e210 = profil("E210", ["Pflicht", "Wahlpflicht: Profilbildungsbereich (oder Elective Studies)"], { anrechnung: "Elective Studies" });
  assert.deepEqual(ects(rechnen([b220, e210], "Economics")), { "Elective Studies": 6 }, "B220 nach Rolle, E210 ist in Economics Pflicht");
  assert.deepEqual(ects(rechnen([b220, e210], "Business Administration")), { "Elective Studies": 6 }, "B220 ist Pflicht, E210 nach „Zählt als“");
  assert.deepEqual(ects(rechnen([b220, e210], "ohne Spezialisierung")), { "Elective Studies": 6 }, "nur E210 mit „Zählt als“");
  assert.deepEqual(ects(rechnen([Object.assign({}, b220, { imPlan: false, gewaehlt: false })], "Economics")), {}, "nicht im Plan");
});

test("Nur Module im Plan zählen; ohne gültige Anrechnung stehen sie unter „Ohne Bereich“", () => {
  const R = rechnen([sp("E313", "Economic Policy", 6), sp("E314", "Economic Policy", 9, { imPlan: false, gewaehlt: false }), sp("S312", "", 6), sp("X1", "Tippfehler", 3)], "Economics");
  assert.deepEqual(ects(R), { "Economic Policy": 6 });
  assert.deepEqual(R.ohne.map((m) => m.code), ["S312", "X1"]);
  assert.equal(R.bereiche.length, 11, "zehn Schwerpunktbereiche und Elective Studies");
  assert.deepEqual(R.bereiche.find((b) => b.name === "Economic Policy").module.map((m) => m.code), ["E313"]);
});

test("Sichtbar ab dem 2. Fachsemester oder mit einem Schwerpunkt- oder Profilmodul im Plan", () => {
  const nichts = [sp("E313", "Economic Policy", 6, { imPlan: false, gewaehlt: false }), { code: "B110", gruppe: "Grundstudium", gewaehlt: true }];
  assert.equal(sichtbarFuer(1, false, nichts), false);
  assert.equal(sichtbarFuer(2, false, nichts), true);
  assert.equal(sichtbarFuer(3, true, nichts), false, "vor Studienbeginn");
  assert.equal(sichtbarFuer(1, false, nichts.concat(sp("E314", "Economic Policy", 9))), true);
  assert.equal(sichtbarFuer(1, false, [profil("B220", ["Elective Studies", "Pflicht"])]), true);
});

// ---------- Abgleich mit dem Fachmodell: dieselbe Regel „im Plan“ wie bei ECTS und Gesamtnote ----------
// Das Skript läuft mit dem echten ctx.modell und zeichnet in einen Ersatz-Knoten; ausgelesen wird das HTML des Blocks.
const SEMESTER = json("semester.json");
const notiz = (code, o) => ({ [`Module/3 Schwerpunktkatalog/${code} Beispiel.md`]: Object.assign({ typ: "modul", code, titel: code + " Beispiel", gruppe: "Schwerpunkt",
  ects: 6, anrechnung: "Economic Policy", bereiche: ["Economic Policy"], status: "offen", gewaehlt: false }, o) });
const zeichnen = (notizen) => {
  const frontmatter = { "System/Daten/Semester.md": SEMESTER, "System/Einstellungen.md": { variante: "Economics" } };
  const { ctx: { modell } } = laden("modell", { notizen, frontmatter });
  let zeichner = null;
  const { ergebnis } = laden("schwerpunkte", { notizen, frontmatter, kontext: { modell, codeblock: (_sprache, fn) => { zeichner = fn; return { neu: () => {} }; } } });
  ergebnis.registrieren();
  const el = { classList: { add() {}, remove() {} }, innerHTML: "", firstElementChild: { querySelector: () => null, addEventListener() {} } };
  zeichner("", el, {}, undefined);
  return { modell, html: el.innerHTML };
};

test("Aus Alma bestanden, nie „gewählt“: das Modul zählt im Bereich wie bei ECTS und Note (E311)", () => {
  const { modell, html } = zeichnen(notiz("E311", { status: "bestanden", ergebnis: "1,7", notenblock: "66 %" }));
  assert.equal(modell.ects().ist, 6, "ECTS zählen es");
  assert.equal(modell.noten().note, "1,70", "die Note zählt es");
  assert.match(html, /title="Economic Policy: E311"/, "der Bereich zeigt es");
  assert.match(html, /<span class="z">6<\/span>/);
  assert.doesNotMatch(html, /Ohne Bereich/);
});

test("Anerkannt, geplant und läuft zählen ebenso; ein offenes, nie geplantes Modul nicht", () => {
  const { html } = zeichnen(Object.assign({}, notiz("E311", { status: "anerkannt" }), notiz("E312", { status: "läuft" }),
    notiz("E313", { semester_geplant: "SS 2027" }), notiz("E314", { gewaehlt: true }), notiz("E315", {})));
  assert.match(html, /title="Economic Policy: E311, E312, E313, E314"/);
  assert.match(html, /<span class="z">24<\/span>/);
});

test("Bestanden ohne Bereich in „Anrechnung in“ steht unter „Ohne Bereich“", () => {
  const { html } = zeichnen(notiz("E311", { status: "bestanden", anrechnung: "" }));
  assert.match(html, /Ohne Bereich: .*E311/);
});
