// Neue Fassung einer Unterlage (fassung.js): was sich geändert hat, frühere Zusammenfassung, Kontext für Claude, Kopie daneben.
// Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const F = require(path.join(__dirname, "..", "Studium Autopilot", "System", "Skripte", "fassung.js"));

const KOPF = "---\ntyp: unterlage\ncode: \"S100\"\nart: \"Folien\"\n---\n\n# S100 · Folien 03 · Vektoren\n\n";
const PDF = "> [!eba-pdf]- PDF\n> ![[S100 Folien 03 Vektoren.pdf#height=560]]\n";
const SHA = "a".repeat(64);

test("Seiten vergleichen: verrutschte Seiten sind gleich, neue und geänderte gezählt, alte ohne Gegenstück entfallen", () => {
  const alt = [[1, "Titel"], [2, "Vektoren  addieren"], [3, "Skalarprodukt"], [4, "Ende"]];
  const neu = [[1, "Titel"], [2, "Neue Folie: Normen"], [3, "Vektoren addieren"], [4, "Skalarprodukt (korrigiert)"], [5, "Ende"], [6, ""]];
  assert.deepEqual(F.seitenVergleichen(alt, neu), { neu: [2, 4], weg: 1 });
  assert.deepEqual(F.seitenVergleichen(alt, alt), { neu: [], weg: 0 });
  // gleich oft: zwei gleiche Trennfolien in der neuen, eine in der alten
  assert.deepEqual(F.seitenVergleichen([[1, "Teil"]], [[1, "Teil"], [2, "Teil"]]), { neu: [2], weg: 0 });
});

test("Seiten als Text: Bereiche mit Gedankenstrich", () => {
  assert.equal(F.seitenText([12, 3, 7, 8, 9]), "3, 7–9, 12");
  assert.equal(F.seitenText([]), "");
});

test("Satz im PDF-Kasten: mit Vergleich, ohne Vergleich, gleich geblieben, durchgehend neu, nach FASSUNG_TAGE nichts", () => {
  const v = (geaendert, entfallen, seiten) => ({ vorher_sha256: SHA, geaendert, entfallen, seiten });
  const heute = "2026-10-26";
  assert.equal(F.aenderungSatz({ datum: "2026-10-24", vfm: v("12–14", 1), heute }), "Neue Fassung vom 24.10.2026: S. 12–14 neu oder geändert, 1 Seite entfallen.");
  assert.equal(F.aenderungSatz({ datum: "2026-10-24", vfm: v("", 2), heute }), "Neue Fassung vom 24.10.2026: 2 Seiten entfallen.");
  assert.equal(F.aenderungSatz({ datum: "2026-10-24", vfm: v("", 0), heute }), "Neue Fassung vom 24.10.2026, der Text ist gleich geblieben.");
  assert.equal(F.aenderungSatz({ datum: "2026-10-24", vfm: v("1–30", 0, 30), heute }), "Neue Fassung vom 24.10.2026, durchgehend neu oder geändert.");
  assert.equal(F.aenderungSatz({ datum: "2026-10-24", vfm: { groesse: 5 }, heute }), "Neue Fassung vom 24.10.2026.");
  assert.equal(F.aenderungSatz({ datum: "2026-10-24", vfm: null, heute: "2026-12-01" }), "");
  assert.equal(F.aenderungSatz({ datum: "", vfm: null, heute }), "");
});

test("Veraltet: nur mit früherer Fassung und ohne aktuelles „Das Wichtigste“", () => {
  const alt = KOPF + "## Das Wichtigste (frühere Fassung, bis 24.10.2026)\n- **Vektoren:** addieren\n\n" + PDF;
  assert.equal(F.veraltet(alt), true);
  assert.equal(F.veraltetSeit(alt), "2026-10-24");
  assert.equal(F.veraltet(KOPF + "## Das Wichtigste\n- **Vektoren:** addieren\n\n" + PDF), false);
  assert.equal(F.veraltet(alt.replace("\n\n> [!eba-pdf]", "\n\n## Das Wichtigste\n- Eigenes\n\n> [!eba-pdf]")), false);
  assert.equal(F.veraltetSeit(KOPF + PDF), "");
});

test("Einklappen: neue Punkte oben, frühere Zusammenfassung samt eigenem Text im Kasten, ältere Kästen bleiben darunter", () => {
  const alt = KOPF + "## Das Wichtigste (frühere Fassung, bis 24.10.2026)\n- **Vektoren:** addieren → [[S100 Folien 03 Vektoren.pdf#page=2|S. 2]]\n" +
    "Mein Satz dazu.\n\n> [!eba-info]- Frühere Fassung (bis 01.10.2026)\n> - **Alt:** ganz alt\n\n## Zu tun\n- [x] Blatt lesen\n\n" + PDF;
  const neu = F.einklappen(alt, ["- **Normen:** neu"]);
  assert.equal(neu, KOPF + "## Das Wichtigste\n- **Normen:** neu\n\n> [!eba-info]- Frühere Fassung (bis 24.10.2026)\n" +
    "> - **Vektoren:** addieren → [[S100 Folien 03 Vektoren.pdf#page=2|S. 2]]\n> Mein Satz dazu.\n\n" +
    "> [!eba-info]- Frühere Fassung (bis 01.10.2026)\n> - **Alt:** ganz alt\n\n## Zu tun\n- [x] Blatt lesen\n\n" + PDF);
  assert.equal(F.veraltet(neu), false);
  // Wird die Datei noch einmal ersetzt (ilias.js benennt den Abschnitt um), kommt beim nächsten Mal ein dritter Kasten dazu
  const wieder = F.einklappen(neu.replace("## Das Wichtigste\n", "## Das Wichtigste (frühere Fassung, bis 30.10.2026)\n"), ["- **Drei:** x"]);
  assert.match(wieder, /## Das Wichtigste\n- \*\*Drei:\*\* x\n\n> \[!eba-info\]- Frühere Fassung \(bis 30\.10\.2026\)\n> - \*\*Normen:\*\* neu\n\n> \[!eba-info\]- Frühere Fassung \(bis 24\.10\.2026\)\n/);
  assert.match(wieder, /Frühere Fassung \(bis 01\.10\.2026\)/);
  // ohne frühere Fassung, mit aktuellem Abschnitt oder ohne Punkte: nichts
  assert.equal(F.einklappen(KOPF + PDF, ["- x"]), null);
  assert.equal(F.einklappen(alt, []), null);
  // nur leere Punkte in der früheren Fassung: kein leerer Kasten
  assert.equal(F.einklappen(KOPF + "## Das Wichtigste (frühere Fassung, bis 24.10.2026)\n- \n\n" + PDF, ["- n"]), KOPF + "## Das Wichtigste\n- n\n\n" + PDF);
});

test("Kontext für Claude: frühere Punkte als reiner Text, geänderte Seiten, was unter Zu tun und Offene Fragen steht", () => {
  const t = KOPF + "## Das Wichtigste (frühere Fassung, bis 24.10.2026)\n- **Vektoren:** addieren → [[S100 Folien 03 Vektoren.pdf#page=2|S. 2]]\n\n" +
    "> [!eba-info]- Frühere Fassung (bis 01.10.2026)\n> - **Alt:** ganz alt\n\n## Zu tun\n- [ ] Blatt 3 lesen (bis 30.10.)\n- [x] Quiz\n- [ ] \n\n" +
    "## Offene Fragen\n- [ ] Gilt das auch im R³?\n\n" + PDF;
  assert.deepEqual(F.kontext(t, { vorher_sha256: SHA, geaendert: "2–3", entfallen: 1 }), {
    frueher: ["Vektoren: addieren S. 2"], bis: "2026-10-24", geaendert: "2–3", entfallen: 1,
    zu_tun: ["Blatt 3 lesen (bis 30.10.)", "Quiz"], fragen: ["Gilt das auch im R³?"],
  });
  // ohne Vergleich der Seiten (Textfassung ohne vorher_sha256): nur die Zusammenfassung
  assert.deepEqual(F.kontext(t, { geaendert: "2" }).geaendert, undefined);
  // aktuelle Notiz: nur Zu tun und Fragen; leere Notiz: null
  assert.deepEqual(F.kontext(KOPF + "## Das Wichtigste\n- a\n\n## Zu tun\n- [ ] b\n\n" + PDF, null), { zu_tun: ["b"] });
  assert.equal(F.kontext(KOPF + PDF, null), null);
});

test("Textfassung aktuell: nur bei gleicher Größe", () => {
  assert.equal(F.textAktuell({ groesse: 1200 }, 1200), true);
  assert.equal(F.textAktuell({ groesse: "1200" }, 1200), true);
  assert.equal(F.textAktuell({ groesse: 1100 }, 1200), false);
  assert.equal(F.textAktuell(null, 1200), false);
  assert.equal(F.textAktuell({ groesse: 0 }, 0), false);
});

test("Frühere Zusammenfassung in die Notiz der neuen Fassung, vor die Datei", () => {
  const altNotiz = KOPF + "## Das Wichtigste\n- **Vektoren:** addieren\n\n## Zu tun\n- [ ] lesen\n\n" + PDF;
  const neuNotiz = KOPF + "> [!eba-info] Neue Fassung aus ILIAS\n> Deine veränderte Datei bleibt.\n\n" + PDF.replace("Vektoren.pdf", "Vektoren neue Fassung 2026-10-24.pdf");
  const t = F.fruehereUebernehmen(altNotiz, neuNotiz, "2026-10-24");
  assert.equal(t, KOPF + "> [!eba-info] Neue Fassung aus ILIAS\n> Deine veränderte Datei bleibt.\n\n## Das Wichtigste (frühere Fassung, bis 24.10.2026)\n" +
    "- **Vektoren:** addieren\n\n" + PDF.replace("Vektoren.pdf", "Vektoren neue Fassung 2026-10-24.pdf"));
  assert.equal(F.veraltet(t), true);
  // Zu tun kommt nicht mit (sonst stünde die Aufgabe doppelt in den To-dos)
  assert.doesNotMatch(t, /Zu tun/);
  // Schon frühere Fassung in der alten Notiz: ihr Datum bleibt
  const frueher = altNotiz.replace("## Das Wichtigste\n", "## Das Wichtigste (frühere Fassung, bis 20.10.2026)\n");
  assert.match(F.fruehereUebernehmen(frueher, neuNotiz, "2026-10-24"), /## Das Wichtigste \(frühere Fassung, bis 20\.10\.2026\)\n- \*\*Vektoren/);
  // Nichts zu übernehmen
  assert.equal(F.fruehereUebernehmen(KOPF + PDF, neuNotiz, "2026-10-24"), null);
  assert.equal(F.fruehereUebernehmen(altNotiz, t, "2026-10-24"), null);
  // Notiz ohne PDF-Kasten: ans Ende
  assert.equal(F.fruehereUebernehmen(altNotiz, KOPF, "2026-10-24"), KOPF + "## Das Wichtigste (frühere Fassung, bis 24.10.2026)\n- **Vektoren:** addieren\n");
});

test("Kasten „Deine bearbeitete Fassung“: nach dem Titel, beim nächsten Mal ersetzt statt doppelt, auch der ältere „Neuere Fassung“", () => {
  const altNotiz = KOPF + "## Das Wichtigste\n- a\n\n" + PDF;
  const eins = F.neuereKasten(altNotiz, "S100 Folien 03 Vektoren neue Fassung 2026-10-24", "2026-10-24");
  assert.equal(eins, KOPF + "> [!eba-info] Deine bearbeitete Fassung\n> Am 24.10.2026 kam eine neue Fassung aus ILIAS: [[S100 Folien 03 Vektoren neue Fassung 2026-10-24]]. " +
    "Diese Datei hier bleibt, wie sie ist.\n\n## Das Wichtigste\n- a\n\n" + PDF);
  const zwei = F.neuereKasten(eins, "S100 Folien 03 Vektoren neue Fassung 2026-11-02", "2026-11-02");
  assert.equal((zwei.match(/\[!eba-info\]/g) || []).length, 1);
  assert.match(zwei, /Am 02\.11\.2026 kam .*2026-11-02\]\]/);
  assert.equal(F.neuereKasten(zwei, "S100 Folien 03 Vektoren neue Fassung 2026-11-02", "2026-11-02"), zwei);
  // Kasten aus 0.6.9 („Neuere Fassung“): ersetzt, nicht ein zweiter darüber
  const alt069 = KOPF + "> [!eba-info] Neuere Fassung\n> Am 24.10.2026 kam eine neuere Fassung dieser Unterlage: [[S100 Folien 03 Vektoren neue Fassung 2026-10-24]]. " +
    "Deine Datei hier bleibt, wie sie ist.\n\n## Das Wichtigste\n- a\n\n" + PDF;
  assert.equal(F.neuereKasten(alt069, "S100 Folien 03 Vektoren neue Fassung 2026-11-02", "2026-11-02"), zwei);
  // eine Kopie, die du inzwischen bearbeitet hast: ihr Kasten „Neue Fassung aus ILIAS“ wird zu „Deine bearbeitete Fassung“
  const kopie = KOPF + "> [!eba-info] Neue Fassung aus ILIAS\n> Das ist die neue Fassung vom 24.10.2026. Deine bearbeitete Fassung bleibt daneben, " +
    "wie sie ist: [[S100 Folien 03 Vektoren]].\n\n## Das Wichtigste\n- a\n\n" + PDF;
  assert.equal(F.neuereKasten(kopie, "S100 Folien 03 Vektoren neue Fassung 2026-11-02", "2026-11-02"), zwei);
});

test("Beide Fassungen: deine bearbeitete und die neueste am Namen erkannt, je Ordner, beschriftet", () => {
  assert.deepEqual(F.fassungVon("S100 Folien 03 Vektoren neue Fassung 2026-10-24 (2)"), { stamm: "S100 Folien 03 Vektoren", datum: "2026-10-24", n: 2 });
  assert.deepEqual(F.fassungVon("S100 Folien 03 Vektoren"), { stamm: "S100 Folien 03 Vektoren", datum: "", n: 0 });
  // „(10)“ nach „(9)“, nicht nach „(1)“ (Textvergleich)
  const folge = ["X neue Fassung 2026-10-24 (10)", "X", "X neue Fassung 2026-10-24 (9)", "X neue Fassung 2026-10-24", "X neue Fassung 2026-10-02"]
    .map(F.fassungVon).sort(F.fassungFolge).map((v) => v.datum + "/" + v.n);
  assert.deepEqual(folge, ["/0", "2026-10-02/1", "2026-10-24/1", "2026-10-24/9", "2026-10-24/10"]);
  const U = "Unterlagen/S100/Folien/";
  const fam = F.familien([U + "S100 Folien 03 Vektoren neue Fassung 2026-10-24.md", U + "S100 Folien 03 Vektoren.md", U + "S100 Folien 04 Matrizen.md",
    "Unterlagen/S100/Anderswo/S100 Folien 03 Vektoren.md"]);
  assert.deepEqual(Object.keys(fam).sort(), [U + "S100 Folien 03 Vektoren neue Fassung 2026-10-24.md", U + "S100 Folien 03 Vektoren.md"],
    "nur Dateien mit einer zweiten Fassung im selben Ordner");
  const eigen = fam[U + "S100 Folien 03 Vektoren.md"], neu = fam[U + "S100 Folien 03 Vektoren neue Fassung 2026-10-24.md"];
  assert.deepEqual([eigen.rolle, neu.rolle, neu.eigen, neu.neu], ["eigen", "neu", U + "S100 Folien 03 Vektoren.md", U + "S100 Folien 03 Vektoren neue Fassung 2026-10-24.md"]);
  assert.equal(F.fassungText(eigen), "Deine bearbeitete Fassung");
  assert.equal(F.fassungText(neu), "Neue Fassung vom 24.10.2026");
  assert.equal(F.fassungText(neu, "2026-11-02"), "Neue Fassung vom 02.11.2026", "nach dem Ersetzen der Kopie: der Tag der neuesten");
  assert.equal(F.fassungText(neu, "2026-10-01"), "Neue Fassung vom 24.10.2026");
  assert.equal(F.fassungText(null), "");
  // drei: die mittlere ist deine bearbeitete, die erste deine ältere
  const drei = F.familien(["A/X.md", "A/X neue Fassung 2026-10-24.md", "A/X neue Fassung 2026-11-02.md"]);
  assert.deepEqual(["A/X.md", "A/X neue Fassung 2026-10-24.md", "A/X neue Fassung 2026-11-02.md"].map((p) => F.fassungText(drei[p])),
    ["Deine ältere Fassung", "Deine bearbeitete Fassung", "Neue Fassung vom 02.11.2026"]);
});
