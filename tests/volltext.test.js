// Volltext der PDFs (volltext.js): Entschärfen wie der Volltext eines eigenen Uni-Abgleichs (plus obsidian:// und „::“), Zeilen
// aus pdf.js-Textstücken, Format der Notiz, Namen bei Kollision, planen (alle Fälle), ein Schreiber mit Computer-Vorrang, nur
// eigene Notizen (fremde → aus, nichts überschrieben oder gelöscht), Wartezeiten, Absturz-Merker, Grenzen je Geräteklasse, Budget.
// Tresor im Speicher und erfundene PDFs (falsches pdf.js); läuft ohne Obsidian.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const nodeCrypto = require("node:crypto");
const { laden } = require("./laden.js");

const V = laden("volltext").ctx.volltext;
const SPERRE = require("../Studium Autopilot/System/Skripte/sperre.js");
const K = V.K;
const MIN = 60e3, MB = 1048576;
const START = Date.parse("2026-11-02T10:00:00Z");

// ---------- Attrappen: Tresor im Speicher, pdf.js, Uhr ----------
// Erfundene PDF: Bytes „%PDF-test:<id>“ (+ Füllbytes für die Größe); spec je id: { seiten: [[Textstücke]] | Zahl, geschuetzt,
// kaputt, msProSeite, zeichenProSeite }
const pdfBytes = (id, groesse) => {
  const kopf = Buffer.from("%PDF-test:" + id + "\n");
  const b = Buffer.alloc(Math.max(groesse || 0, kopf.length), 32);
  kopf.copy(b);
  return new Uint8Array(b);
};
const zeile = (s, y) => ({ str: s, hasEOL: true, transform: [10, 0, 0, 10, 50, y] });
const seite = (...zeilen) => zeilen.map((z, i) => zeile(z, 700 - i * 14));

const aufbau = (o) => {
  o = o || {};
  const uhr = { t: o.jetzt || START };
  const dateien = new Map(); // pfad → { text } | { bytes, mtime }
  const ohneCache = new Set(o.ohneCache || []);
  const papierkorb = [];
  const schreibLog = [];
  const lokalSpeicher = Object.assign({}, o.lokal || {});
  const specs = Object.assign({}, o.specs || {});
  const gelesen = [];
  const kleinKey = (p) => String(p).toLowerCase();
  const finden = (p) => { for (const k of dateien.keys()) if (kleinKey(k) === kleinKey(p)) return k; return null; };
  const fmVon = (text) => {
    const m = /^---\n([\s\S]*?)\n---/.exec(text);
    if (!m) return {};
    const fm = {};
    for (const z of m[1].split("\n")) {
      const r = /^([\w_]+):\s*(.*)$/.exec(z);
      if (!r) continue;
      let v = r[2];
      if (/^".*"$/.test(v)) v = JSON.parse(v);
      else if (/^\d+$/.test(v)) v = Number(v);
      else if (v === "") v = null;
      fm[r[1]] = v;
    }
    return fm;
  };
  const pdf = (pfad, id, x) => { x = x || {}; dateien.set(pfad, { bytes: pdfBytes(id, x.groesse), mtime: x.mtime != null ? x.mtime : uhr.t - 10 * MIN }); };
  const notiz = (pfad, text) => dateien.set(pfad, { text, mtime: uhr.t });
  const io = {
    pdfs: () => Array.from(dateien.keys()).filter((p) => V.istPdf(p)).map((p) => ({ pfad: p, groesse: dateien.get(p).bytes.length, mtime: dateien.get(p).mtime })),
    notizen: () => Array.from(dateien.keys()).filter((p) => p.indexOf("Unterlagen/") === 0 && /\.md$/.test(p)).map((p) => ({ pfad: p, fm: ohneCache.has(p) ? null : fmVon(dateien.get(p).text) }))
      .filter((n) => n.pfad.indexOf(K.ZIEL + "/") === 0 || (n.fm && n.fm.typ === "volltext")),
    belegt: () => Array.from(dateien.keys()).filter((p) => p.indexOf(K.ZIEL + "/") === 0),
    existiert: (p) => !!finden(p),
    lesenText: async (p) => { const k = finden(p); return k && dateien.get(k).text != null ? dateien.get(k).text : null; },
    lesenBinaer: async (p) => { const k = finden(p); if (!k) return null; gelesen.push(k); return new Uint8Array(dateien.get(k).bytes); },
    anlegen: async (p, t) => { if (finden(p)) throw new Error("existiert schon"); schreibLog.push(["anlegen", p]); dateien.set(p, { text: t, mtime: uhr.t }); },
    aendern: async (p, t) => { const k = finden(p); if (!k) throw new Error("fehlt"); schreibLog.push(["aendern", k]); dateien.set(k, { text: t, mtime: uhr.t }); },
    umbenennen: async (a, n) => { const k = finden(a); schreibLog.push(["umbenennen", k, n]); const d = dateien.get(k); dateien.delete(k); dateien.set(n, d); },
    papierkorb: async (p) => { const k = finden(p); schreibLog.push(["papierkorb", k]); papierkorb.push(k); dateien.delete(k); },
    schreiben: async (p, t) => { schreibLog.push(["sperre", p]); dateien.set(p, { text: t, mtime: uhr.t }); },
    link: (ziel, von, sub, alias) => (finden(ziel) ? "[[" + ziel.split("/").pop().replace(/\.md$/, "") + (sub || "") + (alias ? "|" + alias : "") + "]]" : null),
    linktext: (ziel) => (finden(ziel) ? ziel.split("/").pop().replace(/\.md$/, "") : null),
  };
  const pdfjs = {
    getDocument: ({ data }) => {
      const id = /^%PDF-test:([^\n]*)/.exec(Buffer.from(data).toString("latin1"));
      const spec = id ? specs[id[1]] : null;
      const fehler = (name) => { const e = new Error(name); e.name = name; return e; };
      if (spec && spec.haengt) return { promise: new Promise(() => {}), destroy: async () => { x.abgebrochen++; } };
      const promise = (async () => {
        if (!spec || spec.kaputt) throw fehler("InvalidPDFException");
        if (spec.geschuetzt) throw fehler("PasswordException");
        if (spec.absturz) throw new RangeError("Array buffer allocation failed");
        const n = typeof spec.seiten === "number" ? spec.seiten : spec.seiten.length;
        const doc = {
          numPages: n,
          offen: true,
          getPage: async (i) => ({
            getTextContent: async () => {
              if (spec.seiteHaengt === i) return new Promise(() => {});
              uhr.t += spec.msProSeite || 0;
              if (spec.beiSeite) spec.beiSeite(i);
              if (typeof spec.seiten === "number") return { items: [zeile("Seite " + i + " " + "x".repeat(spec.zeichenProSeite || 10), 700)] };
              return { items: spec.seiten[i - 1] };
            },
            cleanup: () => {},
          }),
          destroy: () => { doc.offen = false; x.zerstoert++; return spec.zuHaengt ? new Promise(() => {}) : Promise.resolve(); },
        };
        return doc;
      })();
      return { promise };
    },
  };
  const einstellungen = Object.assign({}, o.einstellungen || {});
  const x = {
    uhr, dateien, papierkorb, schreibLog, lokalSpeicher, specs, gelesen, einstellungen, zerstoert: 0, abgebrochen: 0, ereignisse: [], fristen: [], pdf, notiz,
    lese: { pfad: null },
    text: (p) => { const k = finden(p); return k ? dateien.get(k).text : null; },
    vor: (ms) => { uhr.t += ms; },
  };
  x.abh = {
    io,
    lokal: (k, v) => { if (v === undefined) return hasOwn(lokalSpeicher, k) ? JSON.parse(JSON.stringify(lokalSpeicher[k])) : null; if (v == null) delete lokalSpeicher[k]; else lokalSpeicher[k] = JSON.parse(JSON.stringify(v)); return v; },
    pdfjs: async () => pdfjs,
    sha256: async (b) => nodeCrypto.createHash("sha256").update(Buffer.from(b)).digest("hex"),
    einstellungen: () => einstellungen,
    extern: () => V.quelleExternAus(o.eba || null, (p) => !!finden(p), einstellungen),
    jetzt: () => new Date(uhr.t),
    mobil: !!o.mobil,
    version: o.version || "0.4.5",
    geraetId: () => o.geraet || "g-pc",
    pause: async () => {},
    // Frist für pdf.js: in Tests sofort abgelaufen, aber erst nach allen anderen Schritten (setImmediate)
    wecker: o.wecker ? (n) => { x.fristen.push(n); return { promise: new Promise((r) => setImmediate(r)), aus: () => {} }; } : undefined,
    geaendert: (e) => x.ereignisse.push(e),
    lese: x.lese,
  };
  x.m = V.erzeugen(x.abh);
  return x;
};
const hasOwn = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const B110 = "Unterlagen/B110 Einführung in die Betriebswirtschaftslehre";
const S100 = "Unterlagen/S100 Mathematische Methoden";
const vollPfad = (name) => K.ZIEL + "/" + name + " (Volltext).md";
const folien = () => ({ seiten: [seite("Unternehmensziele", "Gewinn und Rentabilität"), seite("Stakeholder-Ansatz", "Kunden, Mitarbeitende, Staat")] });

// ---------- Entschärfen ----------
test("Entschärfen: gleiches Ergebnis wie der Volltext eines eigenen Uni-Abgleichs (Erwartungswerte einmal erzeugt)", () => {
  const faelle = [
    ["Einführung in die BWL\nKapitel 1", "> Einführung in die BWL\n> Kapitel 1"],
    ["Unter-\nnehmen und Märkte", "> Unternehmen und Märkte"],
    ["Pfad C:\\Temp\\x und <b>fett</b> <%tp.date%> <!-- k --> <?php", "> Pfad C:\\\\Temp\\\\x und &lt;b>fett&lt;/b> &lt;%tp.date%> &lt;!-- k --> &lt;?php"],
    ["x > 0 und f(x) = [a, b] sowie a < b", "> x > 0 und f(x) = [a, b] sowie a < b"],
    ["Preis 5 $ und `code` und %%Kommentar%%", "> Preis 5 \\$ und \\`code\\` und \\%\\%Kommentar\\%\\%"],
    ["[[Link]] und [Text](https://x.de) #Tag #3a #12 C#", "> \\[\\[Link]] und [Text]\\(https://x.de) \\#Tag \\#3a #12 C#"],
    ["> Zitat\n# Titel\n## Unter\n1. Erstens\n- Punkt\n* Stern\n+ Plus\n- [ ] Aufgabe", "> \\> Zitat\n> \\# Titel\n> \\## Unter\n> 1\\. Erstens\n> \\- Punkt\n> \\* Stern\n> \\+ Plus\n> \\- [ ] Aufgabe"],
    ["Satz mit Block ^abc-1\n---\n***\n===\n___", "> Satz mit Block \\^abc-1\n> \\---\n> \\***\n> \\===\n> \\___"],
    ["  Leerzeichen  \n\n\n  zwei  \r\nDrei", "> Leerzeichen\n> zwei\n> Drei"],
    ["Ende-\nZeile Groß-\nschreibung bleibt", "> Ende-\n> Zeile Großschreibung bleibt"],
  ];
  for (const [ein, aus] of faelle) {
    assert.equal(V.entschaerfenGrund(ein), aus, ein);
    assert.equal(V.entschaerfen(ein), aus, "ohne obsidian:// und :: gleich: " + ein);
  }
});

test("Entschärfen: obsidian:// nicht anklickbar, keine Inline-Felder, keine Aufgaben für die To-dos", () => {
  const t = V.entschaerfen("Knopf obsidian://studium-autopilot?aktion=trennen&id=ilias und OBSIDIAN://open\nNote:: 1,7\nA:::B\n- [ ] Lesen\n1. [ ] Rechnen");
  assert.ok(!/obsidian:\/\//i.test(t), t);
  assert.ok(t.includes("obsidian\\://studium-autopilot"));
  assert.ok(!/[^\\]::/.test(t.replace(/\\:/g, "")) && !/::/.test(t.replace(/:\\:/g, "")), t);
  assert.ok(t.includes("Note:\\: 1,7") && t.includes("A:\\:\\:B"), t);
  // wie todos.js: offene Aufgabe „- [ ] Text“ (auch in Zitat/Karte)
  for (const z of t.split("\n")) assert.ok(!/^([\s>]*[-*+] )\[ \] +(\S.*)$/.test(z) && !/^[\s>]*\d+[.)] \[ \]/.test(z), z);
});

// ---------- Text aus pdf.js ----------
test("Seitentext: Zeilen aus hasEOL und y-Lage, hochgestellt bleibt, NFC, weiches Trennzeichen und Richtungszeichen weg", () => {
  const items = [
    { str: "Kosten", hasEOL: false, transform: [10, 0, 0, 10, 50, 700] },
    { str: " K(x) = x", hasEOL: false, transform: [10, 0, 0, 10, 90, 700] },
    { str: "2", hasEOL: false, transform: [6, 0, 0, 6, 150, 704] },
    { str: "Zweite Zeile", hasEOL: false, transform: [10, 0, 0, 10, 50, 680] },
    { type: "beginMarkedContent" },
    { str: "Ver\u00adtrag \u202eabc", hasEOL: true, transform: [10, 0, 0, 10, 50, 660] },
    { str: "Mu\u0308ller und a\u00a8hnlich", hasEOL: true, transform: [10, 0, 0, 10, 50, 640] },
    { str: "", hasEOL: true, transform: [10, 0, 0, 10, 50, 620] },
  ];
  assert.equal(V.seiteText(items), "Kosten K(x) = x2\nZweite Zeile\nVertrag abc\nMüller und ähnlich");
  assert.equal(V.seiteText([]), "");
  assert.equal(V.seiteText(null), "");
});

// ---------- Notiz ----------
test("Notiz: Besitzmarke, Felder, Links auf jede Seite, Hinweise, keine Zeitstempel", async () => {
  const x = aufbau({ specs: { f: folien() } });
  x.pdf(B110 + "/B110 Folien 01 Ziele.pdf", "f", { groesse: 4000 });
  x.notiz(B110 + "/B110 Folien 01 Ziele.md", "---\ntyp: unterlage\n---\n");
  const b = await x.m.lauf({});
  assert.equal(b.art, "ok", JSON.stringify(b));
  assert.equal(b.neu, 1);
  const t = x.text(vollPfad("B110 Folien 01 Ziele"));
  const sha = nodeCrypto.createHash("sha256").update(Buffer.from(pdfBytes("f", 4000))).digest("hex");
  assert.equal(t, [
    "---", "typ: volltext", "volltext_von: plugin", "fassung: 1", "datei: \"[[B110 Folien 01 Ziele.pdf]]\"", "unterlage: \"[[B110 Folien 01 Ziele]]\"",
    "quelle: \"" + B110 + "/B110 Folien 01 Ziele.pdf\"", "seiten: 2", "groesse: 4000", "pdf_sha256: \"" + sha + "\"", "ergebnis: text",
    "cssclasses:", "  - eba-s-begleitnotiz", "  - eba-s-volltext", "---", "",
    "# B110 Folien 01 Ziele · Volltext", "",
    "Automatisch erzeugt, nicht bearbeiten. Zur Unterlage: [[B110 Folien 01 Ziele]] · PDF: [[B110 Folien 01 Ziele.pdf]]", "",
    "> [!eba-quelle]- [[B110 Folien 01 Ziele.pdf#page=1|S. 1]]\n> Unternehmensziele\n> Gewinn und Rentabilität", "",
    "> [!eba-quelle]- [[B110 Folien 01 Ziele.pdf#page=2|S. 2]]\n> Stakeholder-Ansatz\n> Kunden, Mitarbeitende, Staat", "",
  ].join("\n"));
  assert.equal(V.kopfLesen(t).eigen, true);
  assert.equal(x.zerstoert, 1, "pdf.js-Dokument wieder geschlossen");
  // gleiche PDF auf einem anderen Gerät, eine Stunde später → derselbe Text (keine Zeitstempel)
  const y = aufbau({ specs: { f: folien() }, jetzt: START + 3600e3, geraet: "g-anderes" });
  y.pdf(B110 + "/B110 Folien 01 Ziele.pdf", "f", { groesse: 4000 });
  y.notiz(B110 + "/B110 Folien 01 Ziele.md", "---\ntyp: unterlage\n---\n");
  await y.m.lauf({});
  assert.equal(y.text(vollPfad("B110 Folien 01 Ziele")), t);
});

test("Notiz: Scan, geschützte und kaputte PDF bekommen eine kurze Notiz und werden nicht bei jedem Lauf neu versucht", async () => {
  const x = aufbau({ specs: { scan: { seiten: [[], []] }, pw: { geschuetzt: true }, kaputt: { kaputt: true } } });
  x.pdf(S100 + "/S100 Scan Blatt 1.pdf", "scan");
  x.pdf(S100 + "/S100 Altklausur.pdf", "pw");
  x.pdf(S100 + "/S100 Sonstiges.pdf", "kaputt");
  const b = await x.m.lauf({});
  assert.equal(b.ohneText, 3, JSON.stringify(b));
  const scan = x.text(vollPfad("S100 Scan Blatt 1"));
  assert.match(scan, /^ergebnis: kein-text$/m);
  assert.match(scan, /> \[!eba-info\] Kein Text gefunden/);
  assert.ok(!scan.includes("[!eba-quelle]"));
  assert.match(x.text(vollPfad("S100 Altklausur")), /ergebnis: geschuetzt[\s\S]*\[!eba-info\] Geschützt/);
  assert.match(x.text(vollPfad("S100 Sonstiges")), /ergebnis: nicht-lesbar[\s\S]*\[!eba-info\] Nicht lesbar/);
  assert.ok(!x.text(vollPfad("S100 Altklausur")).includes("unterlage:"), "ohne Begleitnotiz kein Link darauf");
  const vorher = x.gelesen.length;
  x.vor(31 * MIN);
  const b2 = await x.m.lauf({});
  assert.equal(b2.art, "aktuell");
  assert.equal(x.gelesen.length, vorher, "keine PDF neu gelesen");
});

test("Namen: gleicher Dateiname aus anderem Modulordner bekommt den Code, dann eine Nummer", async () => {
  const belegt = new Set([vollPfad("Blatt 1").toLowerCase(), (K.ZIEL + "/Blatt 1 (Volltext, S100).md").toLowerCase()]);
  const b = (p) => belegt.has(p.toLowerCase());
  assert.equal(V.zielName("Unterlagen/B110 X/Blatt 1.pdf", () => false), vollPfad("Blatt 1"));
  assert.equal(V.zielName("Unterlagen/B110 X/Übungen/Blatt 1.pdf", b), K.ZIEL + "/Blatt 1 (Volltext, B110).md");
  assert.equal(V.zielName("Unterlagen/S100 Y/Blatt 1.pdf", b), K.ZIEL + "/Blatt 1 (Volltext, S100 2).md");
  assert.equal(V.zielName("Unterlagen/Blatt 1.pdf", b), K.ZIEL + "/Blatt 1 (Volltext, Unterlagen).md");
  const x = aufbau({ specs: { a: folien(), b: folien() } });
  x.pdf(B110 + "/Blatt 1.pdf", "a", { groesse: 3000 });
  x.pdf(S100 + "/Blatt 1.pdf", "b", { groesse: 3001 });
  await x.m.lauf({});
  assert.match(x.text(vollPfad("Blatt 1")), /quelle: "Unterlagen\/B110/);
  assert.match(x.text(K.ZIEL + "/Blatt 1 (Volltext, S100).md"), /quelle: "Unterlagen\/S100/);
});

// ---------- planen ----------
test("planen: neu, aktuell, Größe oder Prüfsumme anders, Prüfsumme unbekannt, alte Fassung, Reihenfolge", () => {
  const n = (pfad, quelle, groesse, sha, fassung) => ({ pfad, quelle, groesse, sha: sha || "", fassung: fassung == null ? 1 : fassung, ergebnis: "text" });
  const p = (pfad, groesse) => ({ pfad, groesse, mtime: 0 });
  const h = (c) => c.repeat(64);
  const plan = V.planen({
    pdfs: [p("Unterlagen/A/neu-gross.pdf", 900), p("Unterlagen/A/neu-klein.pdf", 100), p("Unterlagen/A/gleich.pdf", 5), p("Unterlagen/A/groesse.pdf", 6),
      p("Unterlagen/A/hash.pdf", 7), p("Unterlagen/A/unbekannt.pdf", 8), p("Unterlagen/A/alt.pdf", 9)],
    eigene: [n(vollPfad("gleich"), "Unterlagen/A/gleich.pdf", 5, h("a")), n(vollPfad("groesse"), "Unterlagen/A/groesse.pdf", 60, h("b")),
      n(vollPfad("hash"), "Unterlagen/A/hash.pdf", 7, h("c")), n(vollPfad("unbekannt"), "Unterlagen/A/unbekannt.pdf", 8, h("d")),
      n(vollPfad("alt"), "Unterlagen/A/alt.pdf", 9, h("e"), 0)],
    hashes: { "unterlagen/a/gleich.pdf": h("a"), "unterlagen/a/hash.pdf": h("f") },
    belegt: [vollPfad("gleich"), vollPfad("groesse"), vollPfad("hash"), vollPfad("unbekannt"), vollPfad("alt")],
    grenze: K.GRENZEN.pc,
  });
  assert.deepEqual(plan.aufgaben.map((a) => [a.art, a.pdf.pfad.split("/").pop()]), [
    ["aendern", "groesse.pdf"], ["aendern", "hash.pdf"], ["neu", "neu-klein.pdf"], ["neu", "neu-gross.pdf"], ["fassung", "alt.pdf"]]);
  assert.equal(plan.aktuell, 2, "gleich + Prüfsumme unbekannt bei gleicher Größe");
  assert.equal(plan.aufgaben[2].ziel, vollPfad("neu-klein"));
});

test("planen: Notiz ohne PDF → Partner gleicher Größe und Prüfsumme umbenennen, sonst Waise; Doppel; Grenzen je Gerät", () => {
  const h = (c) => c.repeat(64);
  const n = (pfad, quelle, groesse, sha) => ({ pfad, quelle, groesse, sha, fassung: 1, ergebnis: "text" });
  const plan = V.planen({
    pdfs: [{ pfad: "Unterlagen/B/neu benannt.pdf", groesse: 50, mtime: 0 }, { pfad: "Unterlagen/B/andere.pdf", groesse: 50, mtime: 0 },
      { pfad: "Unterlagen/B/riesig.pdf", groesse: 30 * MB, mtime: 0 }, { pfad: "Unterlagen/B/schwer.pdf", groesse: 10, mtime: 0 }],
    eigene: [n(vollPfad("alt"), "Unterlagen/B/alt.pdf", 50, h("1")), n(vollPfad("weg"), "Unterlagen/B/weg.pdf", 70, h("2")),
      n(vollPfad("schwer"), "Unterlagen/B/schwer.pdf", 10, h("3")), n(K.ZIEL + "/schwer (Volltext) 2.md", "Unterlagen/B/schwer.pdf", 10, h("3"))],
    hashes: { "unterlagen/b/neu benannt.pdf": h("1"), "unterlagen/b/andere.pdf": h("9") },
    belegt: [vollPfad("alt"), vollPfad("weg"), vollPfad("schwer"), K.ZIEL + "/schwer (Volltext) 2.md"],
    grenze: K.GRENZEN.mobil, mobil: true,
  });
  assert.deepEqual(plan.umbenennen.map((u) => [u.notiz.pfad, u.pdf.pfad, u.ziel]), [[vollPfad("alt"), "Unterlagen/B/neu benannt.pdf", vollPfad("neu benannt")]]);
  assert.deepEqual(plan.waisen.map((w) => w.pfad), [vollPfad("weg")]);
  assert.deepEqual(plan.doppelt.map((w) => w.pfad), [K.ZIEL + "/schwer (Volltext) 2.md"]);
  assert.deepEqual(plan.aufgaben.map((a) => a.pdf.pfad), ["Unterlagen/B/andere.pdf"]);
  assert.deepEqual(plan.warten.map((a) => a.pfad), ["Unterlagen/B/riesig.pdf"], "über 25 MB wartet auf einen Computer");
  // derselbe Fall am Computer: über 80 MB → kurze Notiz „Zu groß“, 30 MB wird gelesen
  const pc = V.planen({ pdfs: [{ pfad: "Unterlagen/B/riesig.pdf", groesse: 30 * MB, mtime: 0 }, { pfad: "Unterlagen/B/riesiger.pdf", groesse: 90 * MB, mtime: 0 }],
    eigene: [], hashes: {}, belegt: [], grenze: K.GRENZEN.pc });
  assert.deepEqual(pc.aufgaben.map((a) => [a.art, a.pdf.pfad]), [["neu", "Unterlagen/B/riesig.pdf"], ["zu-gross", "Unterlagen/B/riesiger.pdf"]]);
  // auf diesem Gerät ausgelassen → warten
  const aus = V.planen({ pdfs: [{ pfad: "Unterlagen/B/x.pdf", groesse: 1, mtime: 0 }], eigene: [], hashes: {}, belegt: [], grenze: K.GRENZEN.pc, ausgelassen: () => true });
  assert.equal(aus.aufgaben.length, 0); assert.equal(aus.warten.length, 1);
});

// ---------- Nur eigene Notizen ----------
const ORACLE = (quelle) => ["---", "typ: volltext", "datei: \"[[X.pdf]]\"", "quelle: \"" + quelle + "\"", "seiten: 3", "stand: \"123-456\"", "---", "", "# X · Volltext", ""].join("\n");

test("Fremde Textfassung (ohne Besitzmarke) im Tresor → Volltext aus, nichts geschrieben, nichts gelöscht", async () => {
  const x = aufbau({ specs: { f: folien() } });
  x.pdf(B110 + "/B110 Folien 01.pdf", "f");
  x.pdf(B110 + "/B110 Folien 02.pdf", "f");
  x.notiz(vollPfad("B110 Folien 01"), ORACLE(B110 + "/B110 Folien 01.pdf"));
  const vorher = x.text(vollPfad("B110 Folien 01"));
  const b = await x.m.lauf({ manuell: true });
  assert.equal(b.art, "fremd");
  assert.deepEqual(x.schreibLog, [], "nichts geschrieben, auch keine Sperre");
  assert.equal(x.text(vollPfad("B110 Folien 01")), vorher);
  assert.equal(x.m.status().text, K.TEXT.fremd);
  // auch außerhalb von _Volltext und auch, wenn der metadataCache die Notiz noch nicht kennt (Text wird gelesen)
  const y = aufbau({ specs: { f: folien() }, ohneCache: [vollPfad("Z")] });
  y.pdf(B110 + "/B110 Folien 01.pdf", "f");
  y.notiz(vollPfad("Z"), ORACLE(B110 + "/Z.pdf"));
  assert.equal((await y.m.lauf({})).art, "fremd");
  const z = aufbau({ specs: { f: folien() } });
  z.pdf(B110 + "/B110 Folien 01.pdf", "f");
  z.notiz(B110 + "/Alt/Text.md", ORACLE(B110 + "/B110 Folien 01.pdf"));
  assert.equal((await z.m.lauf({})).art, "fremd");
  assert.deepEqual(z.schreibLog, []);
});

test("Frischer Tresor: eigene Notizen zuerst, fremde kommen später → Volltext hört auf, eigene bleiben stehen", async () => {
  const x = aufbau({ specs: { f: folien(), g: { seiten: 3 } } });
  x.pdf(B110 + "/B110 Folien 01.pdf", "f", { groesse: 2000 });
  x.pdf(B110 + "/B110 Folien 02.pdf", "g", { groesse: 3000 });
  // die fremde Notiz kommt per Sync, während der Lauf die erste PDF liest
  x.specs.f.beiSeite = (i) => { if (i === 2) x.notiz(K.ZIEL + "/Fremd.md", ORACLE(B110 + "/B110 Folien 02.pdf")); };
  const b = await x.m.lauf({});
  assert.equal(b.art, "fremd", JSON.stringify(b));
  assert.equal(b.neu, 1, "die erste Notiz war schon fertig");
  assert.ok(x.text(vollPfad("B110 Folien 01")), "eigene bleibt");
  assert.equal(x.text(vollPfad("B110 Folien 02")), null, "keine weitere");
  assert.equal((await x.m.lauf({})).art, "fremd");
  assert.deepEqual(x.papierkorb, []);
});

test("Zielpfad mit fremder Datei → nichts überschrieben, Volltext aus", async () => {
  const x = aufbau({ specs: { f: folien() } });
  x.pdf(B110 + "/B110 Folien 01.pdf", "f");
  // eigene Notiz eines anderen Geräts mit gleicher Quelle, aber eine Datei ohne Marke liegt am Ziel einer neuen PDF
  x.notiz(vollPfad("B110 Folien 01"), "Meine eigene Mitschrift, kein Frontmatter.");
  const b = await x.m.lauf({});
  assert.equal(b.art, "fremd");
  assert.equal(x.text(vollPfad("B110 Folien 01")), "Meine eigene Mitschrift, kein Frontmatter.");
});

test("Eigener Abgleich, Liste quellen_extern und Schalter → kein Lauf, nichts geschrieben", async () => {
  // gemeinsame Regel aus eba.js (quelleExtern, Schlüssel „volltext“)
  const eba = require("../Studium Autopilot/System/Skripte/eba.js");
  const fall = async (o) => {
    const x = aufbau(Object.assign({ specs: { f: folien() }, eba }, o));
    x.pdf(B110 + "/B110 Folien 01.pdf", "f");
    if (o.abgleich) x.notiz("System/Skripte/abgleich.js", "");
    const b = await x.m.lauf({ manuell: true });
    return { art: b.art, log: x.schreibLog.length, text: x.m.status().text };
  };
  assert.deepEqual(await fall({ abgleich: true }), { art: "extern", log: 0, text: K.TEXT.extern });
  assert.equal((await fall({ einstellungen: { ilias_unterlagen: "extern" } })).art, "extern");
  assert.equal((await fall({ abgleich: true, einstellungen: { quellen_extern: ["ilias-gruppen"] } })).art, "ok", "Liste geht vor");
  assert.equal((await fall({ einstellungen: { quellen_extern: ["alma-konto", "Volltext"] } })).art, "extern");
  assert.equal((await fall({ einstellungen: { quellen_extern: "volltext, ilias-dateien" } })).art, "extern");
  assert.equal((await fall({ einstellungen: { quellen_extern: [] } })).art, "ok");
  assert.deepEqual(await fall({ einstellungen: { volltext: "aus" } }), { art: "aus", log: 0, text: K.TEXT.aus });
  assert.equal((await fall({ einstellungen: { volltext: "an" } })).art, "ok");
  assert.equal((await fall({ eba: null, abgleich: true })).art, "ok", "ohne eba.js nie extern (fremde Notizen schützen trotzdem)");
  assert.equal(V.eingeschaltet(undefined), true); assert.equal(V.eingeschaltet(false), false); assert.equal(V.eingeschaltet("Aus"), false);
});

test("Leerer Tresor (Vorlage): kein Lauf schreibt etwas, auch keine Sperre", async () => {
  const x = aufbau();
  assert.equal((await x.m.lauf({})).art, "leer");
  assert.deepEqual(x.schreibLog, []);
  assert.equal(x.m.status().text, K.TEXT.leer);
});

// ---------- Ein Schreiber ----------
test("Sperre: gleiche Werte wie ILIAS und zentrale Daten", () => {
  const { I } = require("./ilias-attrappen.js");
  assert.equal(K.UEBERNAHME, I.K.UEBERNAHME);
  assert.equal(K.PULS, I.K.PULS);
});

test("Sperre mit Computer-Vorrang: Computer löst iPhone sofort ab, iPhone wartet auf einen Computer, Stille → Übernahme", async () => {
  const datei = { text: null };
  const io = { lesen: async () => datei.text, schreiben: async (p, t) => { datei.text = t; } };
  const uhr = { t: START };
  // die gemeinsame Abrufer-Sperre (sperre.js) mit den Werten, die volltext.js ihr gibt
  const s = (geraet, mobil) => SPERRE.erzeugen({ io, pfad: K.ABRUF, geraetId: () => geraet, jetzt: () => new Date(uhr.t), mobil, uebernahme: K.UEBERNAHME, puls: K.PULS, computerVorrang: true });
  const iphone = s("g-iphone", true), pc = s("g-pc", false), pc2 = s("g-pc2", false), ipad = s("g-ipad", true);
  assert.equal(await iphone.nehmen(), true);
  assert.equal(JSON.parse(datei.text).mobil, true);
  assert.equal((await ipad.pruefen()).anderes, true, "anderes Mobilgerät liest gerade");
  assert.equal(await ipad.nehmen(), false);
  assert.equal(await pc.nehmen(), true, "Computer-Vorrang");
  assert.equal(JSON.parse(datei.text).geraet, "g-pc");
  uhr.t += 30 * MIN;
  assert.equal(await iphone.nehmen(), false, "iPhone wartet auf den Computer");
  assert.equal(await pc2.nehmen(), false, "zweiter Computer wartet");
  assert.equal(await pc2.nehmen({ erzwingen: true }), true, "Hier lesen");
  uhr.t += K.UEBERNAHME + 1;
  assert.equal(await iphone.nehmen(), true, "nach Stille übernimmt auch ein iPhone");
  // Puls: höchstens alle PULS
  const vorher = datei.text;
  uhr.t += 10 * MIN;
  await iphone.puls();
  assert.equal(datei.text, vorher);
  uhr.t += K.PULS;
  await iphone.puls();
  assert.notEqual(datei.text, vorher);
});

test("Lauf: anderes Gerät hält die Sperre → nichts gelesen; Hier lesen holt sie her", async () => {
  const x = aufbau({ specs: { f: folien() }, mobil: true, geraet: "g-iphone" });
  x.pdf(B110 + "/B110 Folien 01.pdf", "f");
  x.dateien.set(K.ABRUF, { text: JSON.stringify({ geraet: "g-pc", seit: new Date(START - MIN).toISOString(), zuletzt: new Date(START - MIN).toISOString(), mobil: false }) });
  const b = await x.m.lauf({});
  assert.equal(b.art, "anderes-geraet");
  assert.deepEqual(x.gelesen, []);
  assert.equal(x.m.status().anderes, true);
  const c = await x.m.lauf({ manuell: true, hier: true });
  assert.equal(c.art, "ok");
  assert.equal(JSON.parse(x.text(K.ABRUF)).geraet, "g-iphone");
});

// ---------- Inkrementell ----------
test("Inkrementell: unverändert → nichts gelesen; Größe anders → neu; gleiche Größe, andere Prüfsumme in ilias.json → neu", async () => {
  const x = aufbau({ specs: { f: folien(), g: { seiten: [seite("Neue Fassung")] } } });
  const pfad = B110 + "/B110 Folien 01.pdf";
  x.pdf(pfad, "f", { groesse: 3000 });
  await x.m.lauf({});
  const n1 = x.gelesen.length;
  x.vor(30 * MIN);
  assert.equal((await x.m.lauf({})).art, "aktuell");
  assert.equal(x.gelesen.length, n1);
  // gleiche Größe, neue Bytes, ILIAS kennt die neue Prüfsumme
  x.pdf(pfad, "g", { groesse: 3000, mtime: x.uhr.t - 5 * MIN });
  const sha = nodeCrypto.createHash("sha256").update(Buffer.from(pdfBytes("g", 3000))).digest("hex");
  x.dateien.set("System/Daten/ilias.json", { text: JSON.stringify({ version: 1, dateien: { 7: { pfad, sha256: sha, groesse: 3000 } } }) });
  const b = await x.m.lauf({});
  assert.equal(b.neu, 1, JSON.stringify(b));
  assert.match(x.text(vollPfad("B110 Folien 01")), /Neue Fassung/);
  // Größe anders
  x.vor(10 * MIN);
  x.pdf(pfad, "f", { groesse: 3500, mtime: x.uhr.t - 5 * MIN });
  assert.equal((await x.m.lauf({})).neu, 1);
  assert.match(x.text(vollPfad("B110 Folien 01")), /groesse: 3500/);
});

test("Inkrementell: auf diesem Gerät geändert bei gleicher Größe → Prüfsumme neu berechnet", async () => {
  const x = aufbau({ specs: { f: folien(), g: { seiten: [seite("Anders")] } } });
  const pfad = B110 + "/B110 Folien 01.pdf";
  x.pdf(pfad, "f", { groesse: 3000 });
  await x.m.lauf({});
  x.vor(5 * MIN);
  x.pdf(pfad, "g", { groesse: 3000, mtime: x.uhr.t - 2 * MIN });
  const b = await x.m.lauf({});
  assert.equal(b.neu, 1, JSON.stringify(b));
  assert.match(x.text(vollPfad("B110 Folien 01")), /Anders/);
});

test("Neues Gerät ohne Gerätespeicher: Notizen gleicher Größe gelten als aktuell, keine PDF wird gelesen", async () => {
  const x = aufbau({ specs: { f: folien() } });
  x.pdf(B110 + "/B110 Folien 01.pdf", "f", { groesse: 3000 });
  await x.m.lauf({});
  const text = x.text(vollPfad("B110 Folien 01"));
  const y = aufbau({ specs: { f: folien() }, geraet: "g-neu" });
  y.pdf(B110 + "/B110 Folien 01.pdf", "f", { groesse: 3000 });
  y.notiz(vollPfad("B110 Folien 01"), text);
  assert.equal((await y.m.lauf({})).art, "aktuell");
  assert.deepEqual(y.gelesen, []);
});

test("Umbenannte PDF: Notiz zieht mit (Name, Quelle, Links), ohne die PDF neu zu lesen", async () => {
  const x = aufbau({ specs: { f: folien() } });
  x.pdf(B110 + "/B110 Folien 01.pdf", "f", { groesse: 3000 });
  await x.m.lauf({});
  const alt = x.text(vollPfad("B110 Folien 01"));
  const d = x.dateien.get(B110 + "/B110 Folien 01.pdf");
  x.dateien.delete(B110 + "/B110 Folien 01.pdf");
  x.dateien.set(B110 + "/B110 Folien 01 Ziele.pdf", d);
  // auf diesem Gerät umbenannt: die Prüfsumme wandert im Gerätespeicher mit (registrieren, Ereignis rename)
  const c = x.abh.lokal(K.L.cache);
  c[B110 + "/B110 Folien 01 Ziele.pdf"] = c[B110 + "/B110 Folien 01.pdf"];
  x.abh.lokal(K.L.cache, c);
  const n = x.gelesen.length;
  x.vor(5 * MIN);
  const b = await x.m.lauf({});
  assert.equal(b.umbenannt, 1, JSON.stringify(b));
  assert.equal(x.gelesen.length, n, "nicht neu gelesen");
  assert.equal(x.text(vollPfad("B110 Folien 01")), null);
  const neu = x.text(vollPfad("B110 Folien 01 Ziele"));
  assert.match(neu, /quelle: "Unterlagen\/B110 [^"]*\/B110 Folien 01 Ziele\.pdf"/);
  assert.match(neu, /\[\[B110 Folien 01 Ziele\.pdf#page=2\|S\. 2\]\]\n> Stakeholder-Ansatz/);
  assert.equal(neu.split("\n").length, alt.split("\n").length);
  assert.equal((await x.m.lauf({})).art, "aktuell");
});

// Läufe, bis eine Notiz ohne PDF reif ist: WAISE_LAEUFE Läufe mit ruhigem Tresor und WAISE_ALTER seit dem ersten Fehlen
const reifen = async (x) => {
  const b = [];
  for (let i = 0; i < K.WAISE_LAEUFE; i++) { x.vor(i === K.WAISE_LAEUFE - 1 ? K.WAISE_ALTER : MIN); b.push(await x.m.lauf({})); }
  return b;
};

test("Gelöschte PDF: Notiz erst nach mehreren Läufen und 2 Std. in den Papierkorb; viele auf einmal → nichts löschen", async () => {
  const specs = {};
  for (let i = 1; i <= 24; i++) specs["p" + i] = { seiten: [seite("Text " + i)] };
  const x = aufbau({ specs });
  for (let i = 1; i <= 24; i++) x.pdf(B110 + "/Blatt " + i + ".pdf", "p" + i, { groesse: 2000 + i });
  await x.m.lauf({});
  assert.equal(Array.from(x.dateien.keys()).filter((p) => p.indexOf("Unterlagen/") === 0).length, 48);
  x.dateien.delete(B110 + "/Blatt 1.pdf");
  x.vor(MIN);
  await x.m.lauf({});
  x.vor(K.WAISE_ALTER);
  await x.m.lauf({});
  assert.ok(x.text(vollPfad("Blatt 1")), "2 Std., aber erst zwei Läufe: noch nicht");
  x.vor(MIN);
  const b = await x.m.lauf({});
  assert.equal(b.geloescht, 1);
  assert.deepEqual(x.papierkorb, [vollPfad("Blatt 1")]);
  assert.equal(x.lokalSpeicher[K.L.waisen][vollPfad("Blatt 1")], undefined);
  // 13 von 23 auf einmal (mehr als die Hälfte und mehr als 10) → nichts
  for (let i = 2; i <= 14; i++) x.dateien.delete(B110 + "/Blatt " + i + ".pdf");
  const c = await reifen(x);
  assert.equal(c[c.length - 1].geloescht, 0);
  assert.equal(c[c.length - 1].massenwegfall, true);
  assert.equal(x.papierkorb.length, 1);
});

test("PDF nie auf diesem Gerät (anderer Sync-Umfang, noch nicht angekommen): Notiz bleibt, wie sie ist", async () => {
  const x = aufbau({ specs: { f: folien() } });
  x.pdf(B110 + "/B110 Folien 01.pdf", "f", { groesse: 3000 });
  await x.m.lauf({});
  const t = x.text(vollPfad("B110 Folien 01"));
  // zweites Gerät: die Notiz kam per Sync, die PDF nie
  const y = aufbau({ specs: { f: folien() }, geraet: "g-zwei", jetzt: START + 3 * 3600e3 });
  y.notiz(vollPfad("B110 Folien 01"), t);
  for (let i = 0; i < 6; i++) { await y.m.lauf({}); y.vor(K.WAISE_ALTER); }
  assert.equal(y.text(vollPfad("B110 Folien 01")), t, "weder gelöscht noch markiert");
  assert.deepEqual(y.papierkorb, []);
  assert.deepEqual(y.schreibLog.filter((e) => e[0] !== "sperre"), []);
});

test("Notiz ohne PDF: nie, solange ilias.json die PDF kennt oder der Tresor nicht ruhig ist", async () => {
  const x = aufbau({ specs: { f: folien() } });
  const pdf = B110 + "/B110 Folien 01.pdf";
  x.pdf(pdf, "f", { groesse: 3000 });
  await x.m.lauf({});
  x.dateien.delete(pdf);
  // laut ILIAS-Abgleich gibt es die PDF noch (nur auf diesem Gerät fehlt sie)
  const ilias = (geloescht) => x.notiz("System/Daten/ilias.json", JSON.stringify({ dateien: { a: Object.assign({ pfad: pdf, groesse: 3000 }, geloescht ? { geloescht: true } : {}) } }));
  ilias(false);
  await reifen(x); await reifen(x);
  assert.ok(x.text(vollPfad("B110 Folien 01")), "ilias.json: noch da");
  // Tresor nicht ruhig (Sync läuft): weder zählen noch handeln
  ilias(true);
  x.abh.ruhig = () => false;
  await reifen(x); await reifen(x);
  assert.ok(x.text(vollPfad("B110 Folien 01")), "Sync läuft");
  x.abh.ruhig = () => true;
  const b = await reifen(x);
  assert.deepEqual(b.map((r) => r.geloescht), [0, 0, 1], "erst nach WAISE_LAEUFE ruhigen Läufen");
});

test("iPhone/iPad und eigener Text: „(PDF fehlt)“ statt Papierkorb; kommt die PDF wieder, ist die Marke weg", async () => {
  const x = aufbau({ specs: { f: folien() }, mobil: true, geraet: "g-iphone" });
  const pdf = B110 + "/B110 Folien 01.pdf", n = vollPfad("B110 Folien 01");
  x.pdf(pdf, "f", { groesse: 3000 });
  await x.m.lauf({});
  const original = x.text(n);
  const d = x.dateien.get(pdf);
  x.dateien.delete(pdf);
  const b = await reifen(x);
  assert.equal(b[b.length - 1].markiert, 1);
  assert.deepEqual(x.papierkorb, []);
  const t = x.text(n);
  assert.match(t, /\nentfaellt: true\n---\n/);
  assert.match(t, /^# B110 Folien 01 · Volltext \(PDF fehlt\)$/m);
  assert.ok(t.indexOf(K.FEHLT_KARTE) > 0);
  assert.match(t, /> Stakeholder-Ansatz/, "Seitentexte bleiben");
  assert.equal(V.kopfLesen(t).entfaellt, true);
  await reifen(x);
  assert.equal(x.text(n), t, "schon markiert: bleibt");
  // die PDF ist wieder da (z. B. aus der iCloud geladen): Marke weg, Text wie vorher, nichts neu gelesen
  x.dateien.set(pdf, d);
  const gelesen = x.gelesen.length;
  x.vor(MIN);
  const z = await x.m.lauf({});
  assert.equal(z.zurueck, 1);
  assert.equal(x.text(n), original);
  assert.equal(x.gelesen.length, gelesen);
  // Computer mit eigenem Text unter „## Meine Notizen“: Marke statt Papierkorb (quellen.js wegfall)
  const y = aufbau({ specs: { f: folien() } });
  y.pdf(pdf, "f", { groesse: 3000 });
  await y.m.lauf({});
  y.notiz(n, y.text(n) + "\n## Meine Notizen\n- Folie 2 klausurrelevant\n");
  y.dateien.delete(pdf);
  assert.equal((await reifen(y))[K.WAISE_LAEUFE - 1].markiert, 1);
  assert.match(y.text(n), /Folie 2 klausurrelevant/);
  assert.deepEqual(y.papierkorb, []);
});

test("Marke einmal je Zeuge: nimmt ein anderes Gerät die Marke weg, setzt dieses sie nicht wieder", async () => {
  const x = aufbau({ specs: { f: folien() }, mobil: true, geraet: "g-iphone" });
  const pdf = B110 + "/B110 Folien 01.pdf", n = vollPfad("B110 Folien 01");
  x.pdf(pdf, "f", { groesse: 3000 });
  await x.m.lauf({});
  x.dateien.delete(pdf);
  await reifen(x);
  x.notiz(n, V.fehltEntfernen(x.text(n))); // ein Computer mit der PDF hat die Marke genommen (per Sync)
  const ohne = x.text(n);
  await reifen(x); await reifen(x);
  assert.equal(x.text(n), ohne);
});

test("Marke „(PDF fehlt)“: hin und zurück derselbe Text; umbenannte PDF nimmt sie mit weg", async () => {
  const t = V.notizText({ titel: "X", quelle: "Unterlagen/B/X.pdf", seiten: 1, groesse: 10, sha: "", ergebnis: "kein-text", dateiFm: "X.pdf",
    dateiLink: "[[X.pdf]]", seitenTexte: [], hinweis: V.hinweisText("kein-text") });
  const m = V.fehltMarkieren(t);
  assert.notEqual(m, t);
  assert.equal(V.fehltMarkieren(m), m, "zweimal markieren ändert nichts");
  assert.equal(V.fehltEntfernen(m), t);
  assert.equal(V.fehltEntfernen(t), t);
  assert.equal(V.kopfLesen(m).entfaellt, true);
  assert.equal(V.ausFm({ entfaellt: true }).entfaellt, true);
  // Notiz mit Marke, die PDF taucht unter neuem Namen wieder auf (gleiche Größe und Prüfsumme): Notiz zieht um, ohne Marke
  const x = aufbau({ specs: { f: folien() }, mobil: true });
  x.pdf(B110 + "/B110 Folien 01.pdf", "f", { groesse: 3000 });
  await x.m.lauf({});
  const d = x.dateien.get(B110 + "/B110 Folien 01.pdf");
  x.dateien.delete(B110 + "/B110 Folien 01.pdf");
  await reifen(x);
  assert.match(x.text(vollPfad("B110 Folien 01")), /PDF fehlt/);
  x.dateien.set(B110 + "/B110 Folien 01 neu.pdf", d);
  const c = x.abh.lokal(K.L.cache) || {};
  c[B110 + "/B110 Folien 01 neu.pdf"] = [3000, d.mtime, nodeCrypto.createHash("sha256").update(Buffer.from(d.bytes)).digest("hex")];
  x.abh.lokal(K.L.cache, c);
  x.vor(MIN);
  assert.equal((await x.m.lauf({})).umbenannt, 1);
  const neu = x.text(vollPfad("B110 Folien 01 neu"));
  assert.doesNotMatch(neu, /PDF fehlt|entfaellt/);
  assert.match(neu, /> Stakeholder-Ansatz/);
});

test("waisenPruefen: Zeuge, ilias.json, Ruhe, Läufe und Zeit; alte Merker aus 0.4.5 (Zahl) zählen die Läufe neu", () => {
  const n = { pfad: vollPfad("A"), quelle: "Unterlagen/B/A.pdf", groesse: 5 };
  const r = (o) => V.waisenPruefen(Object.assign({ waisen: [n], alt: {}, gesehen: { "unterlagen/b/a.pdf": 5 }, vorhanden: {}, ruhig: true, jetzt: START }, o));
  assert.deepEqual(r({ gesehen: {} }), { reif: [], merken: {} }, "nie gesehen: nicht einmal gemerkt");
  assert.deepEqual(r({ vorhanden: { "unterlagen/b/a.pdf": true } }).merken, {}, "laut ilias.json da");
  assert.deepEqual(r({}).merken[n.pfad], { seit: START, laeufe: 1 });
  assert.deepEqual(r({ ruhig: false }).merken[n.pfad], { seit: START, laeufe: 0 });
  assert.equal(r({ alt: { [n.pfad]: START - K.WAISE_ALTER } }).reif.length, 0, "alter Merker aus 0.4.5 (Zahl): Läufe zählen neu");
  assert.equal(r({ alt: { [n.pfad]: { seit: START - K.WAISE_ALTER, laeufe: K.WAISE_LAEUFE - 1 } } }).reif.length, 1);
  assert.equal(r({ alt: { [n.pfad]: { seit: START - K.WAISE_ALTER + 1, laeufe: 9 } } }).reif.length, 0, "zu früh");
  assert.equal(r({ alt: { [n.pfad]: { seit: START - K.WAISE_ALTER, laeufe: 9 } }, ruhig: false }).reif.length, 0, "unruhig: nie");
  assert.equal(r({ waisen: [Object.assign({ entfaellt: true }, n)] }).reif.length, 0, "schon markiert");
});

test("Nach dem Update aus 0.4.5: was der Gerätespeicher kannte, war auf diesem Gerät (Zeuge)", async () => {
  const x = aufbau({ specs: { f: folien() } });
  const pdf = B110 + "/B110 Folien 01.pdf";
  x.pdf(pdf, "f", { groesse: 3000 });
  await x.m.lauf({});
  delete x.lokalSpeicher[K.L.gesehen]; // Stand wie nach 0.4.5: nur eba-volltext-cache
  assert.ok(x.lokalSpeicher[K.L.cache][pdf]);
  x.dateien.delete(pdf);
  const b = await reifen(x);
  assert.equal(b[b.length - 1].geloescht, 1);
});

test("Gerade geänderte PDF (unter 60 s) wartet bis zum nächsten Lauf", async () => {
  const x = aufbau({ specs: { f: folien() } });
  x.pdf(B110 + "/B110 Folien 01.pdf", "f", { mtime: START - 20e3 });
  const b = await x.m.lauf({});
  assert.equal(b.neu, 0); assert.equal(b.rest, 1);
  x.vor(K.STABIL);
  assert.equal((await x.m.lauf({})).neu, 1);
});

// ---------- Grenzen, Budget, Absturz ----------
test("Grenzen: iPhone/iPad 300 Seiten und 500 000 Zeichen → wartet auf einen Computer; Computer kürzt bei 600 Seiten", async () => {
  const specs = { lang: { seiten: 650, zeichenProSeite: 100 }, viel: { seiten: 60, zeichenProSeite: 9990 }, breit: { seiten: [[zeile("y".repeat(30000), 700)]] } };
  const m = aufbau({ specs, mobil: true });
  m.pdf(B110 + "/Lang.pdf", "lang", { groesse: 1000 });
  m.pdf(B110 + "/Viel.pdf", "viel", { groesse: 2000 });
  const b = await m.m.lauf({});
  assert.equal(b.warten, 2, JSON.stringify(b));
  assert.equal(m.text(vollPfad("Lang")), null);
  assert.match(m.m.status().text, /2 warten auf einen Computer\./);
  assert.equal((await m.m.lauf({})).art, "aktuell", "auf diesem Gerät nicht wieder versucht");
  const pc = aufbau({ specs });
  pc.pdf(B110 + "/Lang.pdf", "lang", { groesse: 1000 });
  pc.pdf(B110 + "/Viel.pdf", "viel", { groesse: 2000 });
  pc.pdf(B110 + "/Breit.pdf", "breit", { groesse: 3000 });
  await pc.m.lauf({});
  const lang = pc.text(vollPfad("Lang"));
  assert.match(lang, /^ergebnis: gekuerzt$/m);
  assert.match(lang, /Text bis Seite 600 von 650\./);
  assert.ok(lang.includes("#page=600|") && !lang.includes("#page=601|"));
  assert.match(pc.text(vollPfad("Viel")), /^ergebnis: text$/m);
  const breit = pc.text(vollPfad("Breit"));
  assert.match(breit, /Sehr lange Seiten sind gekürzt\./);
  assert.ok(breit.length < K.SEITE_ZEICHEN + 2000);
});

test("Budget: iPhone 45 s je Lauf, die erste PDF immer; Rest im nächsten Stapel", async () => {
  const specs = {};
  for (let i = 1; i <= 6; i++) specs["p" + i] = { seiten: 10, msProSeite: 1000 };
  const x = aufbau({ specs, mobil: true });
  for (let i = 1; i <= 6; i++) x.pdf(B110 + "/Blatt " + i + ".pdf", "p" + i, { groesse: 1000 + i });
  const b = await x.m.lauf({});
  assert.equal(b.neu, 5, JSON.stringify(b));
  assert.equal(b.rest, 1);
  assert.ok(b.dauer <= K.GRENZEN.mobil.lauf + 10e3);
  assert.equal((await x.m.lauf({})).neu, 1);
  // eine PDF über 120 s auf dem iPhone → wartet auf einen Computer
  const y = aufbau({ specs: { zaeh: { seiten: 200, msProSeite: 1000 } }, mobil: true });
  y.pdf(B110 + "/Zäh.pdf", "zaeh");
  const c = await y.m.lauf({});
  assert.equal(c.warten, 1);
  assert.equal(y.lokalSpeicher[K.L.zuSchwer][B110 + "/Zäh.pdf"].grund, "zeit");
});

test("Absturz-Merker: Abbruch beim Lesen → PDF auf diesem Gerät ausgelassen (iPhone sofort, Computer beim zweiten), neue Version versucht neu", async () => {
  const pfad = B110 + "/B110 Folien 01.pdf";
  const merker = { pfad, groesse: 4000, version: "0.4.5" };
  // iPhone: ein Absturz reicht
  const m = aufbau({ specs: { f: folien() }, mobil: true, lokal: { [K.L.inArbeit]: merker } });
  m.pdf(pfad, "f", { groesse: 4000 });
  assert.equal(m.m.nachAbsturz(), pfad);
  assert.equal(m.lokalSpeicher[K.L.inArbeit], undefined, "Merker weg");
  const b = await m.m.lauf({});
  assert.equal(b.warten, 1); assert.deepEqual(m.gelesen, []);
  assert.match(m.m.status().text, /1 wartet auf einen Computer/);
  // Computer: erster Absturz → noch ein Versuch, zweiter → ausgelassen
  const p = aufbau({ specs: { f: folien() }, lokal: { [K.L.inArbeit]: merker } });
  p.pdf(pfad, "f", { groesse: 4000 });
  p.m.nachAbsturz();
  assert.equal(V.planen({ pdfs: p.abh.io.pdfs(), eigene: [], hashes: {}, belegt: [], grenze: K.GRENZEN.pc }).aufgaben.length, 1);
  p.abh.lokal(K.L.inArbeit, merker);
  p.m.nachAbsturz();
  assert.equal((await p.m.lauf({})).warten, 1);
  assert.match(p.m.status().text, /1 PDF ließ sich nicht lesen\./);
  // neue Plugin-Version: wieder versuchen
  const q = aufbau({ specs: { f: folien() }, mobil: true, version: "0.4.6", lokal: { [K.L.zuSchwer]: m.lokalSpeicher[K.L.zuSchwer] } });
  q.pdf(pfad, "f", { groesse: 4000 });
  assert.equal((await q.m.lauf({})).neu, 1);
  // im Hintergrund (iOS beendet Apps dort jederzeit) oder beim Beenden zählt ein Abbruch nicht
  for (const flag of ["hintergrund", "beendet"]) {
    const h = aufbau({ specs: { f: folien() }, mobil: true, lokal: { [K.L.inArbeit]: Object.assign({ [flag]: true }, merker) } });
    h.pdf(pfad, "f", { groesse: 4000 });
    assert.equal(h.m.nachAbsturz(), null);
    assert.equal((await h.m.lauf({})).neu, 1, flag);
  }
  // Lesen läuft in dieser Sitzung noch (Hot-Reload): kein Absturz
  const r = aufbau({ specs: { f: folien() }, mobil: true, lokal: { [K.L.inArbeit]: merker } });
  r.lese.pfad = pfad;
  assert.equal(r.m.nachAbsturz(), null);
  assert.ok(r.lokalSpeicher[K.L.inArbeit]);
});

test("Absturz-Merker: während des Lesens gesetzt, danach leer, auch bei Fehlern", async () => {
  const x = aufbau({ specs: { f: folien(), boom: { absturz: true } } });
  x.pdf(B110 + "/A.pdf", "f", { groesse: 1000 });
  x.pdf(B110 + "/B.pdf", "boom", { groesse: 2000 });
  // der Merker steht, bevor pdf.js die Datei bekommt (hier: beim Berechnen der Prüfsumme davor)
  let gesehen = null;
  const sha = x.abh.sha256;
  x.abh.sha256 = async (bytes) => { gesehen = x.abh.lokal(K.L.inArbeit); assert.equal(x.lese.pfad, gesehen.pfad); return sha(bytes); };
  const b = await x.m.lauf({});
  assert.deepEqual(gesehen, { pfad: B110 + "/B.pdf", groesse: 2000, version: "0.4.5" });
  assert.equal(x.abh.lokal(K.L.inArbeit), null);
  assert.equal(x.lese.pfad, null);
  assert.equal(b.fehler, 1);
  assert.equal(x.text(vollPfad("B")), null, "kein Ergebnis, keine Notiz");
});

test("pdf.js kommt nicht zurück → Frist, Ladeaufgabe beendet, PDF auf diesem Gerät ausgelassen; andere PDFs normal", async () => {
  const x = aufbau({ specs: { haengt: { haengt: true }, f: folien() }, mobil: true, wecker: true });
  x.pdf(B110 + "/Hängt.pdf", "haengt", { groesse: 1000 });
  x.pdf(B110 + "/B110 Folien 01.pdf", "f", { groesse: 2000 });
  const b = await x.m.lauf({});
  assert.equal(b.warten, 1, JSON.stringify(b));
  assert.equal(b.neu, 1);
  assert.equal(x.abgebrochen, 1);
  assert.equal(x.lokalSpeicher[K.L.zuSchwer][B110 + "/Hängt.pdf"].grund, "zeit");
  assert.equal(x.abh.lokal(K.L.inArbeit), null);
});

test("Seite kommt nicht zurück → Frist je Seite, PDF auf diesem Gerät übersprungen, Dokument zu, Lauf frei, Warnung im Status", async () => {
  const x = aufbau({ specs: { s: { seiten: 3, seiteHaengt: 2 }, f: folien() }, wecker: true });
  x.pdf(B110 + "/Hängt auf Seite 2.pdf", "s", { groesse: 1000 });
  x.pdf(B110 + "/B110 Folien 01.pdf", "f", { groesse: 2000 });
  const b = await x.m.lauf({});
  assert.deepEqual([b.art, b.zeit, b.warten, b.neu], ["ok", 1, 1, 1], JSON.stringify(b));
  assert.equal(x.zerstoert, 2, "beide Dokumente geschlossen");
  assert.equal(x.lokalSpeicher[K.L.zuSchwer][B110 + "/Hängt auf Seite 2.pdf"].grund, "zeit");
  assert.ok(x.fristen.indexOf(K.GRENZEN.pc.seite) >= 0, "Frist je Seite: " + x.fristen.join(", "));
  assert.equal(x.m.laeuft, false);
  assert.equal(x.abh.lokal(K.L.inArbeit), null);
  let s = x.m.status();
  assert.deepEqual(s.warnungen, ["Eine PDF brauchte zu lange und wird auf diesem Gerät übersprungen."]);
  assert.match(s.text, /1 PDF ließ sich nicht lesen/);
  x.vor(MIN);
  await x.m.lauf({});
  s = x.m.status();
  assert.deepEqual(s.warnungen, [], "nächster Lauf ohne Frist: keine Warnung mehr");
});

test("Schließen oder Laden von pdf.js kommt nicht zurück → der Lauf endet trotzdem; pdf.js fehlt: Fehler, keine PDF ausgelassen", async () => {
  const x = aufbau({ specs: { z: { seiten: [seite("Text")], zuHaengt: true }, f: folien() }, wecker: true });
  x.pdf(B110 + "/Schließt nicht.pdf", "z", { groesse: 1000 });
  x.pdf(B110 + "/B110 Folien 01.pdf", "f", { groesse: 2000 });
  assert.equal((await x.m.lauf({})).neu, 2);
  assert.equal(x.m.laeuft, false);
  // pdf.js lädt nicht: Lauf mit Fehler zu Ende, die PDF wird nicht ausgelassen, der nächste Lauf liest sie
  const y = aufbau({ specs: { f: folien() }, wecker: true });
  y.pdf(B110 + "/B110 Folien 01.pdf", "f", { groesse: 2000 });
  const pdfjs = y.abh.pdfjs;
  y.abh.pdfjs = () => new Promise(() => {});
  const b = await y.m.lauf({});
  assert.equal(b.art, "fehler");
  assert.equal(y.m.status().zustand, "fehler");
  assert.equal(y.lokalSpeicher[K.L.zuSchwer], undefined);
  assert.equal(y.m.laeuft, false);
  y.abh.pdfjs = pdfjs;
  y.vor(MIN);
  assert.equal((await y.m.lauf({})).neu, 1);
  assert.equal(y.m.status().zustand, "an");
});

test("Datei lesen kommt nicht zurück (Platzhalter) → Frist, nächster Lauf, nichts ausgelassen", async () => {
  const x = aufbau({ specs: { f: folien() }, mobil: true, wecker: true });
  x.pdf(B110 + "/B110 Folien 01.pdf", "f");
  const lesen = x.abh.io.lesenBinaer;
  x.abh.io.lesenBinaer = () => new Promise(() => {});
  const b = await x.m.lauf({});
  assert.deepEqual([b.rest, b.fehler, b.warten], [1, 0, 0]);
  assert.ok(x.fristen.indexOf(K.LESEN_FRIST) >= 0);
  assert.equal(x.lokalSpeicher[K.L.zuSchwer], undefined);
  x.abh.io.lesenBinaer = lesen;
  assert.equal((await x.m.lauf({})).neu, 1);
});

test("Lesefehler der Datei (noch nicht ganz da) → nächster Lauf, kein Absturz-Zähler", async () => {
  const x = aufbau({ specs: { f: folien() }, mobil: true });
  x.pdf(B110 + "/B110 Folien 01.pdf", "f");
  const lesen = x.abh.io.lesenBinaer;
  x.abh.io.lesenBinaer = async () => { throw new Error("nicht geladen"); };
  const b = await x.m.lauf({});
  assert.equal(b.rest, 1); assert.equal(b.fehler, 0);
  assert.equal(x.lokalSpeicher[K.L.zuSchwer], undefined);
  x.abh.io.lesenBinaer = lesen;
  assert.equal((await x.m.lauf({})).neu, 1);
});

test("Ein Computer übernimmt mitten im Lauf eines iPhones → das iPhone hört nach der aktuellen PDF auf", async () => {
  const specs = {};
  for (let i = 1; i <= 3; i++) specs["p" + i] = { seiten: [seite("Text " + i)] };
  const x = aufbau({ specs, mobil: true, geraet: "g-iphone" });
  for (let i = 1; i <= 3; i++) x.pdf(B110 + "/Blatt " + i + ".pdf", "p" + i, { groesse: 1000 + i });
  specs.p1.beiSeite = () => { x.dateien.set(K.ABRUF, { text: JSON.stringify({ geraet: "g-pc", seit: new Date(x.uhr.t).toISOString(), zuletzt: new Date(x.uhr.t).toISOString(), mobil: false }) }); };
  const b = await x.m.lauf({});
  assert.equal(b.neu, 1, JSON.stringify(b));
  assert.equal(b.abgeloest, true);
  assert.equal((await x.m.lauf({})).art, "anderes-geraet");
});

test("Ausgeschaltet: „fertig“ nur beim Wechsel, nicht bei jedem Takt", async () => {
  const x = aufbau({ specs: { f: folien() }, einstellungen: { volltext: "aus" } });
  x.pdf(B110 + "/B110 Folien 01.pdf", "f");
  await x.m.lauf({}); await x.m.lauf({}); await x.m.lauf({});
  assert.equal(x.ereignisse.filter((e) => e.art === "fertig").length, 1);
});

test("Stoppen (Hot-Reload, Ausschalten): Lauf endet nach der aktuellen Seite, ohne halbe Notiz", async () => {
  const x = aufbau({ specs: { lang: { seiten: 50 } } });
  x.pdf(B110 + "/Lang.pdf", "lang");
  const lesen = x.abh.io.lesenBinaer;
  x.abh.io.lesenBinaer = async (p) => { x.m.stoppen(); return lesen(p); };
  const b = await x.m.lauf({});
  assert.equal(b.art, "gestoppt");
  assert.equal(x.text(vollPfad("Lang")), null);
  assert.equal(x.abh.lokal(K.L.inArbeit), null);
});

// ---------- Status ----------
test("Status: Zahlen und Sätze für die Zeile unter Verbindungen, Fortschritt ohne Dateinamen", async () => {
  const x = aufbau({ specs: { f: folien(), s: { seiten: [[]] }, g: folien() } });
  x.pdf(B110 + "/B110 Folien 01.pdf", "f", { groesse: 1000 });
  x.pdf(B110 + "/B110 Scan.pdf", "s", { groesse: 2000 });
  assert.equal(x.m.status().text, "0 PDFs durchsuchbar. 2 folgen.");
  let mitte = null;
  x.abh.geaendert = (e) => { x.ereignisse.push(e); if (e.art === "fortschritt" && e.erledigt === 1) mitte = x.m.status(); };
  await x.m.lauf({ manuell: true });
  assert.equal(mitte.text, "Liest 2 von 2 PDFs …");
  assert.equal(x.m.status().text, "1 PDF durchsuchbar, 1 ohne Text.");
  const json = JSON.stringify(x.ereignisse);
  assert.ok(!json.includes("Folien") && !json.includes("Unterlagen"), json);
  assert.deepEqual(x.ereignisse.map((e) => e.art), ["start", "fortschritt", "fortschritt", "fertig"]);
  x.pdf(B110 + "/B110 Folien 02.pdf", "g", { groesse: 3000 });
  assert.equal(x.m.status().text, "1 PDF durchsuchbar, 1 ohne Text. 1 folgt.");
  // Quellen-Vertrag: gemeinsame Form; ein abgebrochener Durchgang bleibt als Fehler stehen, bis einer klappt
  let s = x.m.status();
  assert.deepEqual([s.zustand, s.geprueft, s.fehler, s.warnungen], ["an", new Date(START).toISOString(), "", []]);
  const pdfs = x.abh.io.pdfs;
  x.abh.io.pdfs = () => { throw new Error("Lesefehler"); };
  assert.equal((await x.m.lauf({})).art, "fehler");
  x.abh.io.pdfs = pdfs;
  s = x.m.status();
  assert.deepEqual([s.zustand, s.geprueft, !!s.fehler, !!s.fehlerZeit], ["fehler", "", true, true]);
  await x.m.lauf({});
  assert.equal(x.m.status().zustand, "an");
});
