// Karteikarten (karten.js): Kartennotizen lesen, Kennungen, Lerngeschichte, Tageslimits, Lernrunde, Statistik, Optionen.
// Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { laden } = require("./laden");

const FSRS = laden("fsrs").ergebnis;
const K = laden("karten", { kontext: { user: { fsrs: () => FSRS } } }).ergebnis;
const MIN = 60e3, TAG = 864e5;
const O = K.optionenAus({});
const JETZT = new Date(2026, 9, 17, 10, 0, 0).getTime(); // Sa 17.10.2026, 10 Uhr Ortszeit

// Karten wie im Index: Schlüssel, Gruppe (Modul), Pfad
const karten = (text, pfad = "Karteikarten/B110 BWL.md", gruppe = "B110") => {
  const aus = [];
  for (const n of K.parsen(text, pfad)) for (const k of n.karten) Object.assign(k, { schluessel: k.basis, gruppe, code: gruppe, pfad, reihe: aus.length }), aus.push(k);
  return aus;
};
const planer = () => K.planerFuer(O);

test("Kartennotiz lesen: alle Formen", () => {
  const text = [
    "---", "typ: karteikarten", "code: B110", "---", "",
    "```eba-karten stapel", "Frage im Code :: zählt nicht", "```", "",
    "%%", "Kommentar :: zählt nicht", "", "Noch im Kommentar ::: nein", "%%", "",
    "<div class=\"eba-kopf\">Kopf :: nein</div>", "",
    "> [!info] Callout :: nein", "",
    "## Kapitel 1",
    "Was ist BWL? :: Lehre vom Wirtschaften ^k1", "",
    "- Begriff A :: Definition A ^k2", "- Begriff B ::: Definition B ^k3", "",
    "Lange Frage", "über zwei Zeilen", "?", "Antwort", "- mit Liste ^k4", "",
    "## Kapitel 2",
    "Umgekehrt", "??", "Gegenrichtung ^k5", "",
    "Die {{c1::Grenzkosten}} sind die Kosten der {{c2::letzten Einheit::Hinweis}}. ^k6", "",
    "Formel $a::b$ und `x::y` ohne Trenner", "",
    "Nur ein Absatz ohne Karte.",
  ].join("\n");
  const n = K.parsen(text, "Karteikarten/B110 BWL.md");
  assert.deepEqual(n.map((x) => [x.art, x.id, x.kapitel]), [
    ["einfach", "k1", "Kapitel 1"], ["einfach", "k2", "Kapitel 1"], ["umgekehrt", "k3", "Kapitel 1"],
    ["einfach", "k4", "Kapitel 1"], ["umgekehrt", "k5", "Kapitel 2"], ["luecke", "k6", "Kapitel 2"],
  ]);
  assert.equal(n[0].vorne, "Was ist BWL?"); assert.equal(n[0].hinten, "Lehre vom Wirtschaften");
  assert.equal(n[1].vorne, "Begriff A", "Listenpunkt entfernt");
  assert.equal(n[3].vorne, "Lange Frage\nüber zwei Zeilen"); assert.equal(n[3].hinten, "Antwort\n- mit Liste");
  assert.deepEqual(n[2].karten.map((k) => k.basis), ["k3", "k3-r"]);
  assert.deepEqual(n[5].karten.map((k) => k.basis), ["k6-c1", "k6-c2"]);
  assert.equal(n[3].von, 25); assert.equal(n[3].bis, 29); assert.equal(n[3].idZeile, 29);
});

test("Trenner: :: einfach, ::: umgekehrt, nicht in Lücken, Code, Formeln oder bei ::::", () => {
  assert.deepEqual(K.trenner("A :: B"), { pos: 2, laenge: 2, umgekehrt: false });
  assert.equal(K.trenner("A ::: B").umgekehrt, true);
  assert.equal(K.trenner("{{c1::x}} ohne"), null);
  assert.equal(K.trenner("`a::b` und $c::d$"), null);
  assert.equal(K.trenner("a :::: b"), null);
  assert.equal(K.trenner("A::B").pos, 1);
});

test("Ohne Kennung: vorläufiger Schlüssel, ändert sich nicht beim Neulesen", () => {
  const a = K.parsen("Frage :: Antwort", "Karteikarten/X.md")[0];
  const b = K.parsen("\n\nFrage :: Antwort\n", "Karteikarten/X.md")[0];
  assert.equal(a.id, null);
  assert.ok(a.karten[0].ohneId);
  assert.ok(a.karten[0].basis.startsWith("?"));
  assert.equal(a.karten[0].basis, b.karten[0].basis);
});

test("Seiten: einfach, umgekehrt, Lückentext", () => {
  const [e, u, ur, l1, l2] = karten("A :: B ^a\n\nC ::: D ^b\n\nDie {{c1::Hauptstadt}} ist {{c2::Paris::Stadt}}. ^c");
  assert.deepEqual(K.seiten(e), { frage: "A", antwort: "B", linie: true });
  assert.equal(K.seiten(u).frage, "C");
  assert.deepEqual([K.seiten(ur).frage, K.seiten(ur).antwort], ["D", "C"]);
  assert.equal(K.seiten(l1).frage, 'Die <span class="eba-lk-luecke">[…]</span> ist Paris.');
  assert.equal(K.seiten(l1).antwort, 'Die <span class="eba-lk-loesung">Hauptstadt</span> ist Paris.');
  assert.equal(K.seiten(l2).frage, 'Die Hauptstadt ist <span class="eba-lk-luecke">[Stadt]</span>.');
  assert.equal(K.klartext("**Fett** {{c1::Lücke}} [[Seite|Text]] $x$"), "Fett Lücke Text x");
});

test("Kennungen einfügen: fehlende, doppelte und fremde ersetzen, sonst nichts ändern", () => {
  let n = 0;
  const neueId = () => "kneu" + ++n;
  const text = "---\na: 1\n---\nA :: B\r\n\r\nC :: D ^k1\r\n\r\nE :: F ^k1\r\n\r\nG\r\n?\r\nH ^fremd\r\n\r\n- I :: J\r\n- K :: L ^k2";
  const r = K.kennungenEinfuegen(text, "Karteikarten/X.md", new Set(["fremd"]), neueId);
  assert.equal(r.neu, 4);
  assert.ok(r.text.indexOf("\r\n") > 0, "Zeilenenden bleiben");
  const ids = K.parsen(r.text, "Karteikarten/X.md").map((x) => x.id);
  assert.deepEqual(ids, ["kneu1", "k1", "kneu2", "kneu3", "kneu4", "k2"]);
  assert.equal(K.kennungenEinfuegen(r.text, "Karteikarten/X.md", new Set(["fremd"]), neueId).neu, 0, "zweiter Lauf ändert nichts");
});

test("Kennung in einer anderen Zeile der Karte: bleibt die Kennung und wandert ans Ende", () => {
  let n = 0;
  const neueId = () => "kneu" + ++n;
  const text = "Frage :: Antwort ^k00a001\nund noch ein Satz\n\nG ^k00a002\n?\nH\n\nI :: J ^k00a001\nweiter";
  const vorher = K.parsen(text, "Karteikarten/X.md");
  assert.deepEqual(vorher.map((x) => [x.id, x.idStelle, x.idZeile]), [["k00a001", 0, 1], ["k00a002", 3, 5], ["k00a001", 7, 8]]);
  assert.equal(vorher[0].hinten, "Antwort\nund noch ein Satz", "die Kennung steht nicht in der Antwort");
  const r = K.kennungenEinfuegen(text, "Karteikarten/X.md", new Set(), neueId);
  assert.equal(r.neu, 3);
  assert.equal(r.text, "Frage :: Antwort\nund noch ein Satz ^k00a001\n\nG\n?\nH ^k00a002\n\nI :: J\nweiter ^kneu1", "doppelte Kennung: neue am Ende, die alte fällt weg");
  assert.equal(K.kennungenEinfuegen(r.text, "Karteikarten/X.md", new Set(), neueId).neu, 0, "zweiter Lauf ändert nichts");
});

test("Vor der letzten Zeile ist nur eine Kennung des Plugins eine Kennung: „r ^2“ bleibt Text", () => {
  const text = "Frage\n?\nFläche = pi r ^2\nmit r = Radius";
  const [n] = K.parsen(text, "Karteikarten/X.md");
  assert.equal(n.id, null);
  assert.equal(n.hinten, "Fläche = pi r ^2\nmit r = Radius");
  const r = K.kennungenEinfuegen(text, "Karteikarten/X.md", new Set(), () => "k00b001");
  assert.equal(r.text, "Frage\n?\nFläche = pi r ^2\nmit r = Radius ^k00b001");
  assert.equal(K.parsen("A :: B ^eigen\nC :: D ^auch-eigen", "Karteikarten/X.md").map((x) => x.id).join(), "eigen,auch-eigen", "je Zeile eine Karte: Kennung jeder Form");
});

test("Karte hinzufügen: Text, der wieder als dieselbe Karte gelesen wird", () => {
  assert.equal(K.karteText("einfach", "Frage", "Antwort", "k9"), "Frage :: Antwort ^k9");
  assert.equal(K.karteText("umgekehrt", "Frage", "Antwort", "k9"), "Frage ::: Antwort ^k9");
  assert.equal(K.karteText("einfach", "Zeile 1\n\nZeile 2", "Antwort", "k9"), "Zeile 1\nZeile 2\n?\nAntwort ^k9");
  assert.equal(K.karteText("einfach", "a :: b", "c", "k9"), "a :: b\n?\nc ^k9");
  for (const [art, v, h] of [["einfach", "F", "A"], ["umgekehrt", "F\nmehr", "A"], ["luecke", "Die {{c1::x}} ist da", ""]]) {
    const n = K.parsen(K.karteText(art, v, h, "k9"), "Karteikarten/X.md");
    assert.equal(n.length, 1); assert.equal(n[0].art, art); assert.equal(n[0].id, "k9"); assert.equal(n[0].vorne, v);
  }
});

test("Lerngeschichte lesen: kaputte Zeilen fallen weg", () => {
  const t = ['{"v":1,"geraet":"g-1"}', '{"k":"k1","t":1,"b":3,"d":5000}', '{"k":"k1","t":2,"b":5}', "kaputt", '{"k":"k2","t":3,"a":"aus"}', '{"k":"k2","t":4,"a":"weg"}', '{"t":5,"b":1}'].join("\n");
  assert.deepEqual(K.zeilenLesen(t), [{ k: "k1", t: 1, b: 3, d: 5000 }, { k: "k2", t: 3, a: "aus" }]);
});

test("Nachspielen: Stand aus der Geschichte, Aussetzen, Zurücksetzen, schwierige Karten", () => {
  const p = planer();
  const ev = [
    { k: "a", t: JETZT - 10 * TAG, b: 3 }, { k: "a", t: JETZT - 10 * TAG + 10 * MIN, b: 3 }, // Abschluss nach 2 Lernschritten
    { k: "b", t: JETZT - 5 * TAG, b: 4 },
    { k: "c", t: JETZT - 3 * TAG, b: 3 }, { k: "c", t: JETZT - 3 * TAG + MIN, a: "aus" },
    { k: "d", t: JETZT - 2 * TAG, b: 3 }, { k: "d", t: JETZT - 2 * TAG + MIN, a: "neu" },
  ];
  const r = K.nachspielen(ev, p, O);
  assert.equal(r.stand.get("a").zustand, 2);
  assert.equal(r.stand.get("a").wdh, 2);
  assert.equal(r.stand.get("b").zustand, 2);
  assert.equal(r.stand.get("c").ausgesetzt, true);
  assert.equal(r.stand.get("d").zustand, 0);
  assert.equal(r.log.length, 5);
  assert.equal(r.log[0].vor, 0); assert.equal(r.log[1].vor, 1);
  // 8. Fehler einer Wiederholungskarte: als schwierig markiert, nie ausgesetzt (auch nicht mit der alten Option)
  const lang = [{ k: "x", t: 0, b: 4 }];
  let t = 0;
  for (let i = 0; i < 8; i++) { t += 40 * TAG; lang.push({ k: "x", t, b: 1 }, { k: "x", t: t + 10 * MIN, b: 3 }); }
  const s = K.nachspielen(lang.slice(0, -2), p, O).stand.get("x");
  assert.equal(s.fehler, 7);
  assert.ok(!s.schwierig, "beim 7. Fehler noch nicht");
  for (const o of [O, K.optionenAus({ karten_schwierig_aussetzen: true })]) {
    const x = K.nachspielen(lang, p, o).stand.get("x");
    assert.equal(x.fehler, 8);
    assert.equal(x.schwierig, true);
    assert.ok(!x.ausgesetzt, "nie ausgesetzt");
  }
  // „Nicht mehr als schwierig markieren“ (an) nimmt die Markierung weg
  assert.ok(!K.nachspielen(lang.concat({ k: "x", t: t + TAG, a: "an" }), p, O).stand.get("x").schwierig);
});

test("Tagesplan: Limits je Modul, fällige, Lernschritte, Geschwister, Zurückstellen", () => {
  const text = Array.from({ length: 30 }, (_, i) => `F${i} :: A${i} ^n${i}`).join("\n\n") + "\n\nU ::: V ^u";
  const ks = karten(text).concat(karten("X :: Y ^m1", "Karteikarten/S100.md", "S100"));
  const p = planer();
  const OV = Object.assign({}, O, { neuGesamt: 9999 }); // hier nur die Limits je Modul
  const r0 = K.tagesplan(ks, new Map(), [], OV, JETZT, {});
  assert.equal(r0.neu.length, 21, "20 neue aus B110 + 1 aus S100");
  assert.equal(r0.neuGesperrt, 11, "10 neue + u über dem Limit von B110; u-r zählt als Geschwister nicht noch einmal");
  // u und u-r: nur eine der beiden am selben Tag
  const r1 = K.tagesplan(ks, new Map(), [], Object.assign({}, OV, { neu: 100 }), JETZT, {});
  assert.equal(r1.neu.filter((k) => k.nid === "u").length, 1);
  assert.equal(K.tagesplan(ks, new Map(), [], Object.assign({}, OV, { neu: 100, geschwister: false }), JETZT, {}).neu.filter((k) => k.nid === "u").length, 2);
  // Heute schon 15 neue in B110 gelernt → noch 5; extra +10 → 15
  const ev = [];
  for (let i = 0; i < 15; i++) ev.push({ k: "n" + i, t: JETZT - 2 * 36e5 + i * 1000, b: 3 });
  const g = K.nachspielen(ev, p, O);
  const r2 = K.tagesplan(ks, g.stand, g.log, OV, JETZT, {});
  assert.equal(r2.neu.filter((k) => k.gruppe === "B110").length, 5);
  assert.equal(r2.lernen.length, 15, "die 15 stehen im zweiten Lernschritt (10 Min.)");
  assert.equal(K.tagesplan(ks, g.stand, g.log, OV, JETZT, { B110: 10 }).neu.filter((k) => k.gruppe === "B110").length, 15);
  // Fällig und zurückgestellt
  const ev2 = [{ k: "n0", t: JETZT - 30 * TAG, b: 4 }, { k: "n1", t: JETZT - 30 * TAG, b: 4 }, { k: "n1", t: JETZT - MIN, a: "zur" }];
  const g2 = K.nachspielen(ev2, p, O);
  const r3 = K.tagesplan(ks, g2.stand, g2.log, OV, JETZT, {});
  assert.deepEqual(r3.faellig.map((k) => k.schluessel), ["n0"]);
  assert.equal(r3.neu.some((k) => k.schluessel === "n1"), false);
  assert.deepEqual(r3.zahlen, { neu: 21, lernen: 0, faellig: 1 });
});

test("Lernrunde: neue und fällige gemischt, Lernschritte kommen zurück, Ende mit Zeitpunkt", () => {
  const ks = karten(Array.from({ length: 4 }, (_, i) => `F${i} :: A${i} ^n${i}`).join("\n\n"));
  const p = planer();
  const ev = [{ k: "n2", t: JETZT - 30 * TAG, b: 4 }, { k: "n3", t: JETZT - 30 * TAG, b: 4 }];
  const g = K.nachspielen(ev, p, O);
  const tp = K.tagesplan(ks, g.stand, g.log, O, JETZT, {});
  const s = K.sitzungBauen(tp, g.stand);
  const arten = [];
  let jetzt = JETZT;
  for (let i = 0; i < 4; i++) {
    const n = K.naechsteKarte(s, jetzt);
    arten.push(n.art);
    const alt = g.stand.get(n.schluessel) || p.leer();
    const neu = p.bewerten(alt, 3, jetzt, n.schluessel);
    g.stand.set(n.schluessel, neu);
    K.sitzungNehmen(s, n.schluessel, n.art, neu, true);
    jetzt += 5000;
  }
  assert.deepEqual(arten.slice().sort(), ["faellig", "faellig", "neu", "neu"]);
  assert.notDeepEqual(arten, ["neu", "neu", "faellig", "faellig"], "gemischt, nicht erst alle neuen");
  assert.equal(s.lernen.size, 2, "neue Karten stehen im zweiten Lernschritt");
  const n = K.naechsteKarte(s, jetzt);
  assert.equal(n.art, "lernen", "Lernschritt bis 20 Min. im Voraus statt warten");
  // Rückgängig legt die Karte wieder vorn in ihre Warteschlange
  const s2 = K.sitzungBauen(tp, g.stand);
  const erste = K.naechsteKarte(s2, JETZT);
  K.sitzungNehmen(s2, erste.schluessel, erste.art, null, true);
  K.sitzungZurueck(s2, { schluessel: erste.schluessel, art: erste.art, vorher: g.stand.get(erste.schluessel), gezaehlt: true });
  assert.equal(K.naechsteKarte(s2, JETZT).schluessel, erste.schluessel);
  // Nur noch Lernschritte in über 20 Min.: fertig mit Zeitpunkt
  const s3 = { neu: [], faellig: [], lernen: new Map([["n0", JETZT + 30 * MIN]]), start: { neu: 0, faellig: 0 }, gezeigt: { neu: 0, faellig: 0 } };
  assert.deepEqual(K.naechsteKarte(s3, JETZT), { fertig: true, spaeter: JETZT + 30 * MIN, anzahl: 1 });
  // Zahl „Lernen“ im Fenster: nur, was jetzt (bis 20 Min. im Voraus) dran ist, wie in der Übersicht
  assert.equal(K.lernenJetzt({ lernen: new Map([["a", JETZT + 5 * MIN], ["b", JETZT + 30 * MIN]]) }, JETZT), 1);
});

test("Lernrunde auffrischen: Stand eines anderen Geräts zählt, Zähler bleiben, gezeigte Karte bleibt, solange sie dran ist", () => {
  const ks = karten(Array.from({ length: 3 }, (_, i) => `F${i} :: A${i} ^n${i}`).join("\n\n"));
  const p = planer();
  const g = K.nachspielen([], p, O);
  const s = K.sitzungBauen(K.tagesplan(ks, g.stand, g.log, O, JETZT, {}), g.stand);
  const erste = K.naechsteKarte(s, JETZT);
  assert.equal(erste.schluessel, "n0", "neue Karten in der Reihenfolge der Notiz");
  const neu = p.bewerten(p.leer(), 3, JETZT, erste.schluessel);
  K.sitzungNehmen(s, erste.schluessel, erste.art, neu, true);
  s.gelernt = 1; s.verlauf.push({ schluessel: erste.schluessel });
  // Auf dem iPad gelernt: n1 ist dort mit „Einfach“ bewertet und damit erst in Tagen wieder dran
  const g2 = K.nachspielen([{ k: erste.schluessel, t: JETZT, b: 3 }, { k: "n1", t: JETZT + 1000, b: 4 }], p, O);
  const tp = K.tagesplan(ks, g2.stand, g2.log, O, JETZT + 2000, {});
  const r = K.sitzungAuffrischen(s, tp, g2.stand, "n1", JETZT + 2000);
  assert.equal(r.art, "", "n1 ist nicht mehr dran");
  assert.deepEqual(r.s.neu, ["n2"]);
  assert.ok(r.s.lernen.has(erste.schluessel), "die eben bewertete Karte bleibt im Lernschritt");
  assert.equal(r.s.gelernt, 1); assert.equal(r.s.verlauf.length, 1); assert.deepEqual(r.s.gezeigt, { neu: 1, faellig: 0 });
  assert.deepEqual(r.s.start, { neu: r.s.neu.length + 1, faellig: 0 });
  assert.equal(K.sitzungAuffrischen(s, tp, g2.stand, "n2", JETZT + 2000).art, "neu", "noch dran: bleibt mit ihrer Warteschlange");
  assert.equal(K.sitzungAuffrischen(s, tp, g2.stand, erste.schluessel, JETZT + 2000).art, "lernen", "Lernschritt in 1 Minute");
  assert.equal(K.sitzungAuffrischen(s, tp, g2.stand, null, JETZT + 2000).art, "");
});

test("Eigener Lernstand: von außen geändert oder gelöscht wird neu gelesen, eigenes Schreiben nicht", async () => {
  const DATEN = "System/Daten/Karteikarten", EIGEN = DATEN + "/g-1.jsonl";
  const inhalt = new Map(), stat = new Map(), an = {};
  let uhr = 0, gelesen = 0;
  const datei = (p) => (inhalt.has(p) ? { path: p, extension: "jsonl", stat: stat.get(p) } : null);
  const setzen = (p, t) => { inhalt.set(p, t); stat.set(p, { mtime: ++uhr, size: t.length }); };
  const L = laden("karten", { kontext: { user: { fsrs: () => FSRS }, zentral: { geraetId: () => "g-1" }, an: (_q, name, fn) => { an[name] = fn; return {}; } } });
  const v = L.ctx.app.vault;
  v.getAbstractFileByPath = (p) => (p === DATEN ? { path: p, children: Array.from(inhalt.keys()).map(datei) } : datei(p));
  v.cachedRead = async (f) => { gelesen++; return inhalt.get(f.path); };
  let tor = null; // hält das Anhängen auf, bis der Test es freigibt
  v.append = async (f, z) => { if (tor) await tor; setzen(f.path, inhalt.get(f.path) + z); an.modify(datei(f.path)); };
  setzen(EIGEN, '{"v":1}\n{"k":"k1","t":1,"b":3}\n');
  setzen(DATEN + "/g-2.jsonl", '{"v":1}\n{"k":"x1","t":5,"b":3}\n');
  L.ergebnis.registrieren();
  const schluessel = async () => (await L.ctx.karten.datenLaden()).log.map((e) => e.k);
  assert.deepEqual(await schluessel(), ["k1", "x1"]);
  // Eigene Bewertung: das modify (während und nach dem Schreiben) kommt von hier, gelesen wird nichts
  await L.ctx.karten.anhaengen({ k: "k2", t: 6, b: 3 });
  an.modify(datei(EIGEN));
  const vorher = gelesen;
  assert.deepEqual(await schluessel(), ["k1", "x1", "k2"]);
  assert.equal(gelesen, vorher);
  // Von außen geändert (Sync, Sicherung zurückgespielt): neu gelesen
  setzen(EIGEN, '{"v":1}\n{"k":"k3","t":3,"b":3}\n');
  an.modify(datei(EIGEN));
  assert.deepEqual(await schluessel(), ["k3", "x1"]);
  // Bewertet, während die Datei neu gelesen wird (und bevor sie in der Datei steht): bleibt im Speicher
  setzen(EIGEN, '{"v":1}\n{"k":"k4","t":4,"b":3}\n');
  an.modify(datei(EIGEN));
  let auf = null;
  tor = new Promise((r) => { auf = r; });
  const laeuft = L.ctx.karten.datenLaden();
  const geschrieben = L.ctx.karten.anhaengen({ k: "k5", t: 7, b: 3 });
  assert.deepEqual((await laeuft).log.map((e) => e.k), ["k4", "x1", "k5"]);
  auf(); tor = null;
  await geschrieben;
  assert.ok(inhalt.get(EIGEN).includes('"k5"'));
  // Gelöscht: kein eigener Lernstand mehr
  inhalt.delete(EIGEN);
  an.delete({ path: EIGEN });
  assert.deepEqual(await schluessel(), ["x1"]);
});

test("Neuer Lerntag: Kartenliste neu, sonst alle 5 Minuten nur die Zahlen", () => {
  let jetzt = new Date(2026, 9, 18, 3, 50).getTime(), takt = null;
  const gezeichnet = [];
  const L = laden("karten", { kontext: { user: { fsrs: () => FSRS }, date: { jetzt: () => new Date(jetzt) }, intervall: (fn) => { takt = fn; },
    codeblock: () => ({ instanzen: () => [], neu: (wahl) => gezeichnet.push(["liste", "heute"].filter((art) => !wahl || wahl({ art }))) }) } });
  L.ergebnis.registrieren();
  takt();
  jetzt += 15 * MIN; takt(); // 4:05 Uhr: neuer Lerntag
  takt();
  assert.deepEqual(gezeichnet, [["heute"], ["liste", "heute"], ["heute"]]);
});

test("Statistik: heute, Behaltensquote, Bestand, Prognose", () => {
  const ks = karten("A :: 1 ^a\n\nB :: 2 ^b\n\nC :: 3 ^c\n\nD :: 4 ^d");
  const p = planer();
  const ev = [
    { k: "a", t: JETZT - 40 * TAG, b: 4 }, { k: "a", t: JETZT - MIN * 30, b: 3, d: 6000 },
    { k: "b", t: JETZT - 40 * TAG, b: 4 }, { k: "b", t: JETZT - MIN * 20, b: 1, d: 4000 },
    { k: "c", t: JETZT - 40 * TAG, b: 4 }, { k: "c", t: JETZT - MIN, a: "aus" },
  ];
  const g = K.nachspielen(ev, p, O);
  const s = K.statistik(ks, g.stand, g.log, O, JETZT);
  assert.deepEqual(s.heute, { karten: 2, zeit: 10000, richtig: 1 });
  assert.deepEqual(s.behalten, { richtig: 1, gesamt: 2 });
  assert.deepEqual(s.bestand, { neu: 1, lernen: 1, jung: 0, reif: 1, ausgesetzt: 1, pausiert: 0 }, "a: nach 40 Tagen gewusst → Intervall über 21 Tage");
  assert.equal(s.schwierig, 0);
  assert.equal(s.prognose.length, 31);
  assert.equal(s.prognose.reduce((x, y) => x + y, 0), 1, "nur b (Lernschritt heute); a ist erst in über 30 Tagen fällig");
  assert.equal(s.prognose[0], 1);
});

test("Statistik: Gelerntes je Tag der letzten 30 Tage, heute zuletzt", () => {
  const ks = karten("A :: 1 ^a\n\nB :: 2 ^b");
  const ev = [
    { k: "a", t: JETZT - 40 * TAG, b: 3 }, // vor dem Zeitraum
    { k: "a", t: JETZT - 29 * TAG, b: 3, d: 5000 }, { k: "b", t: JETZT - 29 * TAG + MIN, b: 1, d: 3000 },
    { k: "b", t: JETZT - 2 * MIN, b: 3, d: 2000 }, { k: "z", t: JETZT - MIN, b: 3 }, // z: nicht in der Auswahl
  ];
  const g = K.nachspielen(ev, planer(), O);
  const v = K.statistik(ks, g.stand, g.log, O, JETZT).verlauf;
  assert.equal(v.length, 30);
  assert.equal(v[29].tag, K.tagVon(JETZT, O.tagesbeginn));
  assert.deepEqual(v[0], { tag: v[29].tag - 29, karten: 2, neu: 1, richtig: 1, zeit: 8000 }, "a war schon gelernt, b neu");
  assert.deepEqual([v[29].karten, v[29].neu, v[29].richtig], [1, 0, 1]);
  assert.equal(v.reduce((x, y) => x + y.karten, 0), 3);
});

test("Je Modul: Karten, schon gelernt, reif, Behalten und Lernzeit der letzten 30 Tage, zuletzt gelernt", () => {
  const b = karten("A :: 1 ^a\n\nB :: 2 ^b\n\nC :: 3 ^c"), s = karten("D :: 4 ^d", "Karteikarten/S100.md", "S100");
  const gruppen = [{ gruppe: "B110", code: "B110", titel: "BWL", karten: b }, { gruppe: "S100", code: "S100", titel: "Mathe", karten: s, pausiert: true }];
  const ev = [
    { k: "a", t: JETZT - 80 * TAG, b: 4 }, { k: "a", t: JETZT - 20 * TAG, b: 3, d: 4000 }, // a: reif, eine Wiederholung gewusst
    { k: "b", t: JETZT - 40 * TAG, b: 4 }, { k: "b", t: JETZT - 3 * TAG, b: 1, d: 6000 },  // b: vergessen
    { k: "d", t: JETZT - 50 * TAG, b: 3 },
  ];
  const g = K.nachspielen(ev, planer(), O);
  const [m1, m2] = K.jeModul(gruppen, g.stand, g.log, O, JETZT);
  const heute = K.tagVon(JETZT, O.tagesbeginn);
  assert.deepEqual([m1.karten, m1.gelernt, m1.reif, m1.wdh, m1.richtig, m1.zeit, m1.zuletzt], [3, 2, 1, 2, 1, 10000, heute - 3]);
  assert.deepEqual([m2.karten, m2.gelernt, m2.wdh, m2.zeit, m2.pausiert, m2.zuletzt], [1, 1, 0, 0, true, heute - 50], "pausiert zählt mit, nichts in 30 Tagen");
});

test("Verlauf einer Karte: jede Bewertung mit Art und Intervall danach, Aktionen, gleicher Stand wie nachspielen", () => {
  const p = planer();
  const ev = [
    { k: "a", t: JETZT - 10 * TAG, b: 1, d: 8000 }, { k: "a", t: JETZT - 10 * TAG + MIN, b: 3, d: 3000 },
    { k: "a", t: JETZT - 10 * TAG + 12 * MIN, b: 3 },
    { k: "a", t: JETZT - TAG, b: 1, d: 9000 }, { k: "a", t: JETZT - TAG + MIN, a: "aus" }, { k: "a", t: JETZT - TAG + 2 * MIN, a: "an" },
  ];
  const v = K.kartenVerlauf(ev, p, O);
  assert.deepEqual(v.zeilen.map((z) => z.a || z.b), [1, 3, 3, 1, "aus", "an"]);
  assert.deepEqual(v.zeilen.slice(0, 4).map((z) => z.vor), [0, 1, 1, 2], "neu, zwei Lernschritte, Wiederholung");
  assert.deepEqual(v.zeilen.slice(0, 2).map((z) => (z.nach.faellig - z.t) / MIN), [1, 10], "Lernschritte 1m 10m");
  assert.equal(v.zeilen[2].nach.zustand, 2, "nach dem letzten Lernschritt: Wiederholung mit Intervall in Tagen");
  assert.ok(v.zeilen[2].nach.intervall >= 1);
  assert.equal(v.zeilen[3].nach.zustand, 3, "Nochmal: erneut lernen");
  assert.deepEqual(v.zeilen.map((z) => z.d || 0).slice(0, 4), [8000, 3000, 0, 9000]);
  assert.deepEqual(v.stand, K.nachspielen(ev, p, O).stand.get("a"));
  // „an“ bei einer Karte, die nur schwierig ist: „Nicht mehr als schwierig markieren“
  const lang = [{ k: "x", t: 0, b: 4 }];
  let t = 0;
  for (let i = 0; i < 8; i++) { t += 40 * TAG; lang.push({ k: "x", t, b: 1 }, { k: "x", t: t + 10 * MIN, b: 3 }); }
  const w = K.kartenVerlauf(lang.concat({ k: "x", t: t + TAG, a: "an" }), p, O);
  assert.equal(w.zeilen.filter((z) => z.schwierig).length, 1, "einmal schwierig geworden");
  assert.equal(w.zeilen[w.zeilen.length - 1].a, "leicht");
  assert.ok(!w.stand.schwierig);
  assert.deepEqual(K.kartenVerlauf([], p, O).zeilen, []);
});

test("Optionen: Standard wie Anki, Grenze über alle Module, Prozent, Grenzen, Schritte, Schalter", () => {
  assert.deepEqual([O.neu, O.neuGesamt, O.wdh, O.ziel, O.schritte, O.neuSchritte, O.tagesbeginn, O.schwierig], [20, 20, 200, 0.9, [1, 10], [10], 4, 8]);
  assert.equal("schwierigAussetzen" in O, false, "schwierige Karten werden nie ausgesetzt");
  const o = K.optionenAus({ karten_neu_pro_tag: "5", karten_neu_gesamt: 40, karten_behalten: 85, karten_lernschritte: "", karten_max_intervall: 999999,
    karten_tagesbeginn: 30, karten_geschwister: false, karten_neu_reihenfolge: "zufall", karten_wdh_pro_tag: "viele" });
  assert.equal(o.neu, 5); assert.equal(o.neuGesamt, 40); assert.equal(o.ziel, 0.85); assert.deepEqual(o.schritte, []);
  assert.equal(o.maxIntervall, 36500); assert.equal(o.tagesbeginn, 23); assert.equal(o.geschwister, false);
  assert.equal(o.neuReihenfolge, "zufall"); assert.equal(o.wdh, 200);
  assert.equal(K.optionenAus({ karten_behalten: 0.5 }).ziel, 0.7);
});

test("Lernoptionen prüfen: ganze Zahlen in Grenzen, Lernschritte als Zeiten, leer = Standard", () => {
  const w = { neu: "20", neuGesamt: "", wdh: "200", maxIntervall: "36500", schwierig: "8", schritte: "1m 10m", neuSchritte: "10m" };
  assert.equal(K.optionenPruefen(w), null);
  assert.equal(K.optionenPruefen(Object.assign({}, w, { neu: "zehn" })).feld, "neu");
  assert.equal(K.optionenPruefen(Object.assign({}, w, { maxIntervall: "0" })).feld, "maxIntervall");
  assert.equal(K.optionenPruefen(Object.assign({}, w, { schwierig: "2,5" })).feld, "schwierig");
  const f = K.optionenPruefen(Object.assign({}, w, { schritte: "1m 10x" }));
  assert.equal(f.feld, "schritte");
  assert.ok(f.fehler.includes("„10x“"), f.fehler);
  assert.equal(K.optionenPruefen(Object.assign({}, w, { schritte: "", neuSchritte: "1h 1d" })), null, "ohne Lernschritte geht auch");
  assert.equal(K.optionenPruefen(Object.assign({}, w, { neuSchritte: "40d" })).feld, "neuSchritte", "länger als 30 Tage");
});

test("Grenze über alle Module: abwechselnd aus den Modulen, zählt auch Gelerntes außerhalb der Auswahl, „mehr“ gibt genau 10", () => {
  const b = karten(Array.from({ length: 30 }, (_, i) => `B${i} :: A ^b${i}`).join("\n\n"));
  const s = karten(Array.from({ length: 30 }, (_, i) => `S${i} :: A ^s${i}`).join("\n\n"), "Karteikarten/S100.md", "S100");
  const ks = b.concat(s);
  const r = K.tagesplan(ks, new Map(), [], O, JETZT, {});
  assert.equal(r.neu.length, 20, "20 über alle, nicht 20 je Modul");
  assert.deepEqual(r.neu.slice(0, 4).map((k) => k.schluessel), ["b0", "s0", "b1", "s1"], "abwechselnd");
  assert.equal(r.neuGesperrt, 40);
  // Heute schon 12 in S100 gelernt: für B110 allein bleiben 8, nicht 20
  const ev = [];
  for (let i = 0; i < 12; i++) ev.push({ k: "s" + i, t: JETZT - 36e5 + i * 1000, b: 3 });
  const g = K.nachspielen(ev, planer(), O);
  assert.equal(K.tagesplan(b, g.stand, g.log, O, JETZT, {}).neu.length, 8);
  // „10 neue Karten mehr“ bei „Alles lernen“: genau 10 mehr, abwechselnd verteilt
  const m = K.mehrNeu(r, {});
  assert.equal(m.anzahl, 10);
  assert.deepEqual(m.werte, { B110: 5, S100: 5, gesamt: 10 });
  assert.equal(K.tagesplan(ks, new Map(), [], O, JETZT, m.werte).neu.length, 30);
  // Halten nur die Limits je Modul auf: ebenfalls genau 10 mehr, nicht 10 je Modul
  const OV = Object.assign({}, O, { neuGesamt: 9999 });
  const r2 = K.tagesplan(ks, new Map(), [], OV, JETZT, {});
  assert.equal(K.tagesplan(ks, new Map(), [], OV, JETZT, K.mehrNeu(r2, {}).werte).neu.length, r2.neu.length + 10);
  assert.equal(K.mehrNeu(K.tagesplan(b.slice(0, 3), new Map(), [], O, JETZT, {}), {}).anzahl, 0, "nichts gesperrt: nichts mehr");
});

test("Pausierte Stapel: nicht im Tagesplan, in der Statistik für sich, Status „Pausiert“", () => {
  const ks = karten("A :: 1 ^a\n\nB :: 2 ^b").concat(karten("C :: 3 ^c", "Karteikarten/S100.md", "S100").map((k) => Object.assign(k, { pausiert: true })));
  const g = K.nachspielen([{ k: "c", t: JETZT - 40 * TAG, b: 4 }], planer(), O);
  const r = K.tagesplan(ks, g.stand, g.log, O, JETZT, {});
  assert.deepEqual(r.neu.map((k) => k.schluessel), ["a", "b"]);
  assert.deepEqual([r.faellig.length, r.lernen.length], [0, 0], "c wäre fällig, sein Stapel ist pausiert");
  const s = K.statistik(ks, g.stand, g.log, O, JETZT);
  assert.equal(s.bestand.pausiert, 1);
  assert.equal(s.prognose.reduce((x, y) => x + y, 0), 0);
  assert.equal(K.statusVon(g.stand.get("c"), r.heute, true).art, "pause");
  assert.equal(K.statusVon(g.stand.get("c"), r.heute, false).art, "faellig");
});

test("Üben: Auswahl nach Stapel, Kapitel und Fehlern; Nochmal kommt wieder; Rückgängig", () => {
  const ks = karten("## K1\nA :: 1 ^a\n\nB :: 2 ^b\n\n## K2\nC :: 3 ^c").concat(karten("D :: 4 ^d", "Karteikarten/S100.md", "S100"));
  const ev = [{ k: "a", t: JETZT - 2 * TAG, b: 1 }, { k: "a", t: JETZT - 2 * TAG + MIN, b: 3 }, { k: "c", t: JETZT - TAG, b: 3 },
    { k: "d", t: JETZT - TAG, b: 1 }, { k: "d", t: JETZT - MIN, a: "aus" }];
  const g = K.nachspielen(ev, planer(), O);
  const wahl = (w) => K.auswahlVon(ks, g.stand, g.log, w).map((k) => k.schluessel);
  assert.deepEqual(wahl({ art: "alle" }), ["a", "b", "c"], "ausgesetzte fehlen");
  assert.deepEqual(wahl({ gruppe: "B110", kapitel: "K2", art: "alle" }), ["c"]);
  assert.deepEqual(wahl({ art: "fehler" }), ["a"], "schon einmal Nochmal; d ist ausgesetzt");
  assert.deepEqual(wahl({ art: "schwierig" }), []);
  assert.deepEqual(K.uebungBauen(ks, 7).reihe, K.uebungBauen(ks, 7).reihe, "gemischt, mit demselben Samen gleich");
  const u = K.uebungBauen(ks.slice(0, 3), 1);
  const [x, y, z] = u.reihe;
  K.uebungNehmen(u, x, false);
  assert.deepEqual(u.reihe, [y, z, x], "Nochmal: nach den übrigen (weniger als 4) wieder");
  K.uebungNehmen(u, y, true);
  assert.deepEqual(u.reihe, [z, x]);
  K.uebungZurueck(u);
  assert.deepEqual([u.reihe, u.fertig, u.richtig], [[y, z, x], 0, 0]);
  K.uebungZurueck(u);
  assert.deepEqual([u.reihe, u.gesehen.size], [[x, y, z], 0]);
  for (const k of [x, y, z]) K.uebungNehmen(u, k, k !== x);
  K.uebungNehmen(u, x, true);
  assert.deepEqual([u.reihe.length, u.fertig, u.richtig], [0, 3, 2], "x beim ersten Mal nicht gewusst");
  const lang = K.uebungBauen(karten(Array.from({ length: 6 }, (_, i) => `F${i} :: A ^f${i}`).join("\n\n")), 1);
  const erste = lang.reihe[0];
  K.uebungNehmen(lang, erste, false);
  assert.equal(lang.reihe.indexOf(erste), 4, "Nochmal: nach 4 anderen Karten wieder");
});

test("Rückgängig im Hinweis: nimmt genau diese Zeilen heraus, auch wenn danach weitere kamen", async () => {
  const text = ['{"v":1}', '{"k":"a","t":1,"a":"aus"}', '{"k":"b","t":2,"b":3,"d":100}', '{"k":"c","t":1,"a":"aus"}', '{"k":"a","t":5,"b":1}', ""].join("\n");
  assert.equal(K.zeilenOhne(text, [{ k: "a", t: 1, a: "aus" }, { k: "c", t: 1, a: "aus" }]), ['{"v":1}', '{"k":"b","t":2,"b":3,"d":100}', '{"k":"a","t":5,"b":1}', ""].join("\n"));
  assert.equal(K.zeilenOhne(text, [{ k: "x", t: 1, a: "aus" }]), text, "nichts Passendes: unverändert");
  // Im Plugin: Aktion für zwei Karten in einem Schreibvorgang, danach eine Bewertung, dann Rückgängig mit gleichen Inhalten
  const DATEN = "System/Daten/Karteikarten", EIGEN = DATEN + "/g-1.jsonl";
  let inhalt = '{"v":1}\n', schreiben = 0;
  const L = laden("karten", { kontext: { user: { fsrs: () => FSRS }, zentral: { geraetId: () => "g-1" } } });
  const v = L.ctx.app.vault, datei = { path: EIGEN, extension: "jsonl", stat: { mtime: 1, size: 1 } };
  v.getAbstractFileByPath = (p) => (p === DATEN ? { path: p, children: [datei] } : p === EIGEN ? datei : null);
  v.cachedRead = async () => inhalt;
  v.append = async (_f, z) => { inhalt += z; schreiben++; };
  v.process = async (_f, fn) => { inhalt = fn(inhalt); };
  await L.ctx.karten.datenLaden();
  const aus = [{ k: "a", t: 10, a: "aus" }, { k: "b", t: 10, a: "aus" }];
  await L.ctx.karten.anhaengen(aus);
  assert.equal(schreiben, 1, "zwei Einträge, ein Schreibvorgang");
  await L.ctx.karten.anhaengen({ k: "c", t: 11, b: 3 });
  await L.ctx.karten.zuruecknehmen(aus.map((e) => Object.assign({}, e)));
  assert.equal(inhalt, '{"v":1}\n{"k":"c","t":11,"b":3}\n');
  const d = await L.ctx.karten.datenLaden();
  assert.deepEqual([d.log.map((e) => e.k), d.stand.get("a"), d.stand.has("c")], [["c"], undefined, true]);
});

test("Neu zeichnen nach einer Änderung: jeder Block bekommt den neuen Stand, nicht nur der erste", async () => {
  const S100 = "Karteikarten/S100 Karteikarten.md", S110 = "Karteikarten/S110 Karteikarten.md";
  const notizen = { [S100]: { typ: "karteikarten", code: "S100" } }, stat = { [S100]: { mtime: 1, size: 1 } }, an = {};
  const L = laden("karten", { notizen, kontext: { user: { fsrs: () => FSRS }, zentral: { geraetId: () => "g-1" }, an: (_q, name, fn) => { an[name] = fn; return {}; } } });
  L.ctx.app.vault.getMarkdownFiles = () => Object.keys(notizen).map((p) => ({ path: p, basename: p.split("/").pop().slice(0, -3), extension: "md", stat: stat[p] }));
  L.ctx.app.vault.cachedRead = async () => { await new Promise((r) => setTimeout(r, 5)); return "A :: 1 ^ka00001"; };
  L.ergebnis.registrieren();
  assert.equal((await L.ctx.karten.datenLaden()).idx.stapel[0].pausiert, false);
  // „Pausieren“: Frontmatter und Datei ändern sich, dann zeichnen drei Blöcke zugleich neu (Übersicht, Statistik, Liste)
  notizen[S100].pausiert = true; stat[S100] = { mtime: 2, size: 2 };
  an.changed({ path: S100 });
  const d = await Promise.all([1, 2, 3].map(() => L.ctx.karten.datenLaden()));
  assert.deepEqual(d.map((x) => x.idx.stapel[0].pausiert), [true, true, true]);
  // Kommt während des Neuaufbaus ein Stapel dazu, folgt danach noch einer
  stat[S100] = { mtime: 3, size: 3 };
  an.changed({ path: S100 });
  const erster = L.ctx.karten.datenLaden();
  notizen[S110] = { typ: "karteikarten", code: "S110" }; stat[S110] = { mtime: 1, size: 1 };
  an.create({ path: S110 });
  const zweiter = L.ctx.karten.datenLaden();
  assert.deepEqual([(await erster).idx.stapel.length, (await zweiter).idx.stapel.length], [1, 2]);
});

test("Lerntag beginnt um 4 Uhr", () => {
  const vor = new Date(2026, 9, 18, 3, 59).getTime(), nach = new Date(2026, 9, 18, 4, 0).getTime();
  assert.equal(K.tagVon(vor, 4) + 1, K.tagVon(nach, 4));
  assert.equal(K.tagVon(JETZT, 4), K.tagVon(new Date(2026, 9, 17, 23, 0).getTime(), 4));
  assert.equal(K.tagBeginnVon(K.tagVon(nach, 4), 4), nach);
  // Zeitumstellung (25.10.2026): Tage zählen weiter am Stück
  assert.equal(K.tagVon(new Date(2026, 9, 26, 12).getTime(), 4) - K.tagVon(new Date(2026, 9, 24, 12).getTime(), 4), 2);
});

test("Name eines neuen Stapels: nie gleich dem einer anderen Notiz (Modulnotiz)", () => {
  const vergeben = (n) => ({ "s100 mathematische methoden": "modul", vokabeln: "notiz" })[n.toLowerCase()] || "";
  assert.equal(K.stapelName("S100", "", vergeben), "S100 Karteikarten");
  assert.equal(K.stapelName("S100", " Kapitel 2 ", vergeben), "S100 Kapitel 2");
  assert.equal(K.stapelName("S100", "Mathematische Methoden", vergeben), "S100 Mathematische Methoden (Karteikarten)");
  assert.equal(K.stapelName("", "Latein", vergeben), "Latein");
  assert.equal(K.stapelName("", "Vokabeln", vergeben), "Vokabeln (Karteikarten)");
});

test("Umbenennen älterer Stapel: wie die Modulnotiz → „<Code> Karteikarten“, sonst Zusatz, nie auf einen vergebenen Namen", () => {
  const vergeben = (n) => ({ "s100 mathematische methoden": "modul", "b110 begriffe": "vorlesung", notizen: "notiz" })[n.toLowerCase()] || "";
  const frei = () => true;
  assert.equal(K.stapelUmbenennung("S100 Mathematische Methoden", "S100", vergeben, frei), "S100 Karteikarten");
  assert.equal(K.stapelUmbenennung("S100 Mathematische Methoden", "S100", vergeben, (n) => n !== "S100 Karteikarten"), "S100 Mathematische Methoden (Karteikarten)");
  assert.equal(K.stapelUmbenennung("B110 Begriffe", "B110", vergeben, frei), "B110 Begriffe (Karteikarten)", "keine Modulnotiz: Kapitelname bleibt");
  assert.equal(K.stapelUmbenennung("Notizen", "", vergeben, frei), "Notizen (Karteikarten)");
  assert.equal(K.stapelUmbenennung("E101 Kapitel 1", "E101", vergeben, frei), null, "eindeutig: bleibt");
  assert.equal(K.stapelUmbenennung("S100 Mathematische Methoden", "S100", vergeben, () => false), null, "kein freier Name: bleibt");
});

test("Beim Start: nur der Abrufer benennt Stapel um, die wie eine Modulnotiz heißen; Links ziehen über den fileManager mit", async () => {
  const datei = (p) => ({ path: p, basename: p.split("/").pop().replace(/\.md$/, ""), parent: { path: p.split("/").slice(0, -1).join("/") }, stat: { mtime: 1, size: 1 } });
  const MODUL = "Module/1 Grundstudium/S100 Mathematische Methoden.md";
  const fm = { [MODUL]: { typ: "modul", code: "S100" }, "Karteikarten/S100 Mathematische Methoden.md": { typ: "karteikarten", code: "S100" }, "Karteikarten/E101 Kapitel 1.md": { typ: "karteikarten", code: "E101" } };
  const lauf = async (abrufer) => {
    const L = laden("karten", { frontmatter: fm, kontext: { user: { fsrs: () => FSRS }, zentral: { abruferHier: async () => abrufer } } });
    const umbenannt = [];
    L.ctx.app.vault.getMarkdownFiles = () => Object.keys(fm).map(datei);
    L.ctx.app.fileManager = { renameFile: async (f, ziel) => umbenannt.push([f.path, ziel]) };
    return [await L.ctx.karten.namenPruefen(), umbenannt];
  };
  assert.deepEqual(await lauf(true), [1, [["Karteikarten/S100 Mathematische Methoden.md", "Karteikarten/S100 Karteikarten.md"]]]);
  assert.deepEqual(await lauf(false), [0, []]);
});

test("Leseansicht: Karten je Abschnitt, Fortsetzung einer Karte, gemischte Abschnitte bleiben", () => {
  const text = [
    "---", "code: S100", "---", "", "## Ableitungen", "",                           // 0–5
    "Ableitung von $x^n$ :: $n x^{n-1}$ ^k1", "",                                     // 6
    "Produktregel", "?", "$(uv)' = u'v + uv'$ ^k2", "",                               // 8–10
    "Lange Frage", "?", "Antwort", "- mit Liste ^k3", "",                             // 12–15 (Obsidian: Absatz 12–14, Liste 15)
    "- A :: B ^k4", "- C ::: D ^k5", "",                                              // 17–18
    "Ein Satz ohne Karte.", "",                                                        // 20
    "Ist $f'' < 0$, liegt ein {{c1::Maximum}} vor. ^k6",                               // 22
  ].join("\n");
  const n = K.parsen(text, "Karteikarten/S100.md"), z = text.split("\n");
  const ids = (a) => a && { karten: a.karten.map((x) => x.id), weiter: a.weiter };
  assert.equal(K.abschnittKarten(n, z, 4, 4), null, "Überschrift");
  assert.deepEqual(ids(K.abschnittKarten(n, z, 6, 6)), { karten: ["k1"], weiter: false });
  assert.deepEqual(ids(K.abschnittKarten(n, z, 8, 10)), { karten: ["k2"], weiter: false });
  assert.deepEqual(ids(K.abschnittKarten(n, z, 12, 14)), { karten: ["k3"], weiter: false });
  assert.deepEqual(ids(K.abschnittKarten(n, z, 15, 15)), { karten: [], weiter: true }, "Liste gehört zur Karte darüber");
  assert.deepEqual(ids(K.abschnittKarten(n, z, 17, 18)), { karten: ["k4", "k5"], weiter: false });
  assert.equal(K.abschnittKarten(n, z, 20, 20), null, "Text ohne Karte bleibt");
  assert.equal(K.abschnittKarten(n, z, 18, 20), null, "Abschnitt mit Karte und anderem Text bleibt");
  const l = K.zeilenSeiten(n.find((x) => x.id === "k6"));
  assert.equal(l.hinten, "");
  assert.ok(l.vorne.includes('<span class="eba-lk-k-l"><span class="eba-lk-luecke">[…]</span><span class="eba-lk-loesung">Maximum</span></span>'));
  assert.ok(l.vorne.startsWith("Ist $f'' < 0$, liegt ein "), "Formeln bleiben Markdown");
  assert.ok(K.zeilenSeiten(K.parsen("Die {{c1::x::<Tipp>}} ^k7", "K/a.md")[0]).vorne.includes("[&lt;Tipp&gt;]"), "Hinweis maskiert");
  assert.deepEqual(K.zeilenSeiten(n.find((x) => x.id === "k1")), { vorne: "Ableitung von $x^n$", hinten: "$n x^{n-1}$" });
});
