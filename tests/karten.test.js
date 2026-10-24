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
  // 8. Fehler einer Wiederholungskarte setzt aus
  const lang = [{ k: "x", t: 0, b: 4 }];
  let t = 0;
  for (let i = 0; i < 8; i++) { t += 40 * TAG; lang.push({ k: "x", t, b: 1 }, { k: "x", t: t + 10 * MIN, b: 3 }); }
  const s = K.nachspielen(lang, p, O).stand.get("x");
  assert.equal(s.fehler, 8);
  assert.equal(s.schwierig, true);
  assert.equal(s.ausgesetzt, true);
  const markiert = K.nachspielen(lang, p, K.optionenAus({ karten_schwierig_aussetzen: false })).stand.get("x");
  assert.ok(markiert.schwierig && !markiert.ausgesetzt, "nur markiert");
});

test("Tagesplan: Limits je Modul, fällige, Lernschritte, Geschwister, Zurückstellen", () => {
  const text = Array.from({ length: 30 }, (_, i) => `F${i} :: A${i} ^n${i}`).join("\n\n") + "\n\nU ::: V ^u";
  const ks = karten(text).concat(karten("X :: Y ^m1", "Karteikarten/S100.md", "S100"));
  const p = planer();
  const r0 = K.tagesplan(ks, new Map(), [], O, JETZT, {});
  assert.equal(r0.neu.length, 21, "20 neue aus B110 + 1 aus S100");
  assert.equal(r0.neuGesperrt, 12, "10 neue + 1 Geschwister über dem Limit von B110 (Geschwister zählen nicht doppelt)");
  // u und u-r: nur eine der beiden am selben Tag
  const r1 = K.tagesplan(ks, new Map(), [], Object.assign({}, O, { neu: 100 }), JETZT, {});
  assert.equal(r1.neu.filter((k) => k.nid === "u").length, 1);
  assert.equal(K.tagesplan(ks, new Map(), [], Object.assign({}, O, { neu: 100, geschwister: false }), JETZT, {}).neu.filter((k) => k.nid === "u").length, 2);
  // Heute schon 15 neue in B110 gelernt → noch 5; extra +10 → 15
  const ev = [];
  for (let i = 0; i < 15; i++) ev.push({ k: "n" + i, t: JETZT - 2 * 36e5 + i * 1000, b: 3 });
  const g = K.nachspielen(ev, p, O);
  const r2 = K.tagesplan(ks, g.stand, g.log, O, JETZT, {});
  assert.equal(r2.neu.filter((k) => k.gruppe === "B110").length, 5);
  assert.equal(r2.lernen.length, 15, "die 15 stehen im zweiten Lernschritt (10 Min.)");
  assert.equal(K.tagesplan(ks, g.stand, g.log, O, JETZT, { B110: 10 }).neu.filter((k) => k.gruppe === "B110").length, 15);
  // Fällig und zurückgestellt
  const ev2 = [{ k: "n0", t: JETZT - 30 * TAG, b: 4 }, { k: "n1", t: JETZT - 30 * TAG, b: 4 }, { k: "n1", t: JETZT - MIN, a: "zur" }];
  const g2 = K.nachspielen(ev2, p, O);
  const r3 = K.tagesplan(ks, g2.stand, g2.log, O, JETZT, {});
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
  assert.deepEqual(s.bestand, { neu: 1, lernen: 1, jung: 0, reif: 1, ausgesetzt: 1 }, "a: nach 40 Tagen gewusst → Intervall über 21 Tage");
  assert.equal(s.prognose.length, 31);
  assert.equal(s.prognose.reduce((x, y) => x + y, 0), 1, "nur b (Lernschritt heute); a ist erst in über 30 Tagen fällig");
  assert.equal(s.prognose[0], 1);
});

test("Optionen: Standard wie Anki, Prozent, Grenzen, Schritte, Schalter", () => {
  assert.deepEqual([O.neu, O.wdh, O.ziel, O.schritte, O.neuSchritte, O.tagesbeginn, O.schwierig], [20, 200, 0.9, [1, 10], [10], 4, 8]);
  const o = K.optionenAus({ karten_neu_pro_tag: "5", karten_behalten: 85, karten_lernschritte: "", karten_max_intervall: 999999,
    karten_tagesbeginn: 30, karten_geschwister: false, karten_neu_reihenfolge: "zufall", karten_wdh_pro_tag: "viele" });
  assert.equal(o.neu, 5); assert.equal(o.ziel, 0.85); assert.deepEqual(o.schritte, []);
  assert.equal(o.maxIntervall, 36500); assert.equal(o.tagesbeginn, 23); assert.equal(o.geschwister, false);
  assert.equal(o.neuReihenfolge, "zufall"); assert.equal(o.wdh, 200);
  assert.equal(K.optionenAus({ karten_behalten: 0.5 }).ziel, 0.7);
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
