// Design-Wächter (docs/design.md, „Prüfen vor dem Pull Request“): Regeln der Designsprache, die sich ohne Obsidian prüfen
// lassen. Wo es heute noch Bestand gibt, gilt eine Obergrenze: Sie darf kleiner werden, nicht größer. Läuft ohne Obsidian:
// node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const VAULT = path.join(__dirname, "..", "Studium Autopilot");
const SNIPPETS = path.join(VAULT, ".obsidian", "snippets");
const SKRIPTE = path.join(VAULT, "System", "Skripte");
const lesen = (p) => fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
// Kommentare durch Leerzeichen ersetzen (Zeilennummern bleiben)
const ohneKommentare = (css) => css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
const CORE = ohneKommentare(lesen(path.join(SNIPPETS, "eba-core.css")));
const DESIGNS = ["eba-paper-elfenbein.css", "eba-flieder.css", "eba-klar.css"].map((n) => [n, ohneKommentare(lesen(path.join(SNIPPETS, n)))]);
const FARBE = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/;

// Alle Deklarationen der innersten Regeln (auch in @container): { selektor, eigenschaft, wert, zeile }
const deklarationen = (css) => {
  const aus = [];
  const muster = /([^{}]+)\{([^{}]*)\}/g;
  let m, bis = 0, zeile = 1;
  while ((m = muster.exec(css))) {
    const ende = m.index + m[1].length;
    for (; bis < ende; bis++) if (css[bis] === "\n") zeile++;
    const selektor = m[1].trim();
    for (const d of m[2].split(";")) {
      const i = d.indexOf(":");
      if (i < 0) continue;
      aus.push({ selektor, eigenschaft: d.slice(0, i).trim(), wert: d.slice(i + 1).trim(), zeile });
    }
  }
  return aus;
};
const ohneUrl = (w) => w.replace(/url\((?:"[^"]*"|'[^']*'|[^)]*)\)/g, "url()");
// An Kommas der obersten Ebene teilen (nicht in Klammern)
const teilen = (w) => {
  const teile = [];
  let t = "", tiefe = 0;
  for (const c of w) {
    if (c === "(") tiefe++;
    if (c === ")") tiefe--;
    if (c === "," && tiefe === 0) { teile.push(t.trim()); t = ""; } else t += c;
  }
  teile.push(t.trim());
  return teile;
};

test("Nur Variablen: feste Farben in eba-core.css nur in Tokens und als Rückfall von --text-on-accent", () => {
  const funde = [];
  for (const d of deklarationen(CORE)) {
    if (d.eigenschaft.startsWith("--")) continue; // Token oder Farbmuster eines Designs
    const w = ohneUrl(d.wert).replace(/var\(--text-on-accent,\s*#fff\)/g, "");
    if (FARBE.test(w)) funde.push(`Z. ${d.zeile}: ${d.selektor} { ${d.eigenschaft}: ${d.wert} }`);
  }
  assert.deepEqual(funde, [], "Farben nur über --eba-*-Variablen (docs/design.md, Grundsatz 7)");
});

test("Designs: feste Farben nur in Variablen, Regeln nehmen die Variablen", () => {
  for (const [name, css] of DESIGNS) {
    const funde = deklarationen(css).filter((d) => !d.eigenschaft.startsWith("--") && FARBE.test(ohneUrl(d.wert)))
      .map((d) => `${name} Z. ${d.zeile}: ${d.eigenschaft}: ${d.wert}`);
    assert.deepEqual(funde, []);
  }
});

test("Kein Schatten: box-shadow nur als Linie oder Ring (ohne Unschärfe) oder --eba-shadow", () => {
  const funde = [];
  const css = [["eba-core.css", CORE], ...DESIGNS];
  for (const [name, text] of css) {
    for (const d of deklarationen(text)) {
      if (d.eigenschaft !== "box-shadow") continue;
      const w = d.wert.replace(/\s*!important$/, "");
      if (w === "none" || /^var\(--eba-shadow/.test(w)) continue;
      for (const s of teilen(w)) {
        const z = s.replace(/^inset\s+/, "").split(/\s+/);
        const unschaerfe = z.length > 2 && /^[\d.]+(px)?$/.test(z[2]) ? parseFloat(z[2]) : 0;
        if (unschaerfe > 0) funde.push(`${name} Z. ${d.zeile}: ${d.selektor} { box-shadow: ${d.wert} }`);
      }
    }
  }
  assert.deepEqual(funde, [], "Schatten gibt es nicht (docs/design.md, „Form, Schrift und Abstände“)");
});

test("Symbole nur mit Bedeutung: --callout-icon nur für Ort, Kontakt, Achtung und die Themen der Hilfe", () => {
  const funde = deklarationen(CORE).filter((d) => d.eigenschaft === "--callout-icon"
    && !/eba-ort|eba-kontakt|eba-achtung|hilfe/.test(d.selektor)).map((d) => `Z. ${d.zeile}: ${d.selektor}`);
  assert.deepEqual(funde, [], "ein Symbol nur, wo es etwas sagt, das der Titel nicht sagt (docs/design.md, Grundsatz 8)");
});

// Fenstermaße (@media mit width/height) nur für die Telefon-Ansicht: Dort zeigt Obsidian eine Notiz über das ganze Fenster,
// das Fenster ist also die Notiz (seit 20.10.2026, breite flache Fenster; docs/design.md „iPhone und iPad“). Liefert die
// Selektoren in solchen Blöcken, die nicht mit body.is-phone beginnen.
const fensterRegelnOhneTelefon = (css) => {
  const funde = [];
  const muster = /@media[^{]*(?:width|height)[^{]*\{/g;
  while (muster.exec(css)) {
    let tiefe = 1, i = muster.lastIndex;
    for (; i < css.length && tiefe; i++) { if (css[i] === "{") tiefe++; else if (css[i] === "}") tiefe--; }
    for (const d of deklarationen(css.slice(muster.lastIndex, i - 1))) {
      for (const s of teilen(d.selektor)) if (!/^body\.is-phone[\s.:[]/.test(s)) funde.push(s);
    }
  }
  return [...new Set(funde)];
};

test("iPhone und iPad: Fenstermaße (@media) nur mit body.is-phone, Safari 16: kein CSS-Nesting, keine Stilabfragen, kein @property", () => {
  for (const [name, css] of [["eba-core.css", CORE], ...DESIGNS]) {
    assert.deepEqual(fensterRegelnOhneTelefon(css), [], `${name}: Breiten über body.is-phone oder @container; @media nur in der Telefon-Ansicht`);
    assert.ok(!/@container[^{]*style\(/.test(css), `${name}: keine Stilabfragen in @container (Safari 16)`);
    assert.ok(!/@property\b/.test(css), `${name}: kein @property (Safari 16.0–16.3)`);
    const ohneTexte = css.replace(/"[^"\n]*"|'[^'\n]*'/g, "\"\"");
    assert.ok(!/&/.test(ohneTexte), `${name}: kein CSS-Nesting (Safari 16)`);
  }
});

// Knöpfe und Knopfkacheln brechen nur an Leerzeichen (docs/design.md, „iPhone und iPad“; seit 20.10.2026, vorher „Vorlesung-snotiz“)
const KNOPF = /data-callout="eba-(?:neu|links)"\][^,{]*li > a|knopf\b|\bbutton\b/;
const trenntImKnopf = (d) => KNOPF.test(d.selektor) && ((/(^|-)hyphens$/.test(d.eigenschaft) && /^auto\b/.test(d.wert))
  || (d.eigenschaft === "overflow-wrap" && /^anywhere\b/.test(d.wert)));

test("Knöpfe trennen nie: kein hyphens: auto, kein overflow-wrap: anywhere an Knöpfen und Knopfkacheln", () => {
  const funde = deklarationen(CORE).filter(trenntImKnopf).map((d) => `Z. ${d.zeile}: ${d.selektor} { ${d.eigenschaft}: ${d.wert} }`);
  assert.deepEqual(funde, [], "Knöpfe brechen nur an Leerzeichen; passt ein Wort nicht, kleinere Schrift oder weniger Knöpfe je Reihe");
});

// Obergrenzen (Stand 18.10.2026): neue Werte nur nach docs/design.md, Bestand darf nur weniger werden.
test("Schriftgrößen in px: keine neue Stufe (docs/design.md, „Schriftgrößen“)", () => {
  const BESTAND = [9, 9.5, 10, 10.5, 11, 11.5, 12, 12.5, 13, 13.5, 14, 14.5, 15, 15.5, 16, 17, 18, 19, 21, 24, 26];
  const neu = [...new Set((CORE.match(/font-size\s*:\s*[0-9.]+px/g) || []).map((s) => parseFloat(s.replace(/[^0-9.]/g, ""))))]
    .filter((x) => BESTAND.indexOf(x) < 0);
  assert.deepEqual(neu, [], "eine vorhandene Größe nehmen (Meta 13 px, Klein 12 px, Label 10,5 px)");
});

test("Knöpfe: keine neue Knopf-Klasse (vorhandene nehmen, docs/design.md „Knöpfe“)", () => {
  const BESTAND = ["eba-ei-knopf", "eba-gr-knopf", "eba-mod-alma-knopf", "eba-mod-knopf", "eba-toast-knopf",
    "eba-uh-knopf", "eba-vb-knopf"];
  const neu = [...new Set((CORE.match(/\.eba-[a-z0-9-]*knopf\b/g) || []).map((s) => s.slice(1)))].filter((x) => BESTAND.indexOf(x) < 0);
  assert.deepEqual(neu, []);
});

test("Skripte: keine weiteren Zeichen als Symbole (✓ ↗ ● ▶ ⇅ ✎ ✗ …), Linien-Symbole statt Zeichen", () => {
  const ZEICHEN = /[✓✔↗●▶⇅✎✗✕↓▸▾★☆⚠]/g;
  const HOECHSTENS = { "eba.js": 2, "ilias.js": 2, "karten.js": 4, "literatur.js": 1, "modul.js": 1, "musterplan.js": 1, "notizen.js": 4, "tabellen.js": 1,
    "unterlagen.js": 12, "unterlagenliste.js": 2, "verbindungen.js": 2, "verlauf.js": 1 };
  const funde = [];
  for (const n of fs.readdirSync(SKRIPTE).filter((x) => x.endsWith(".js"))) {
    const code = lesen(path.join(SKRIPTE, n)).split("\n").filter((z) => !z.trim().startsWith("//")).join("\n");
    const zahl = (code.match(ZEICHEN) || []).length;
    if (zahl > (HOECHSTENS[n] || 0)) funde.push(`${n}: ${zahl} (höchstens ${HOECHSTENS[n] || 0})`);
  }
  assert.deepEqual(funde, []);
});

test("Erzeugte Notizen: Obsidians Callouts ([!info], [!warning] …) nur, wo es sie schon gibt", () => {
  const BESTAND = ["alma.js", "meine-gruppe.js", "zentral.js"];
  const neu = fs.readdirSync(SKRIPTE).filter((n) => n.endsWith(".js") && BESTAND.indexOf(n) < 0
    && /\[!(?:info|warning|note|tip|danger|success|question|abstract|todo|example|quote|bug|failure)\]/.test(lesen(path.join(SKRIPTE, n))));
  assert.deepEqual(neu, [], "Kopf der Notiz als eba-Karte oder Codeblock, nicht als Standard-Callout");
});

test("Der Wächter erkennt Verstöße", () => {
  const d = deklarationen(".a { color: #fff; --x: #000; } @container k (max-width: 4px) { .b { box-shadow: 0 2px 8px rgba(0,0,0,.2) } }");
  assert.deepEqual(d.map((x) => [x.selektor, x.eigenschaft]), [[".a", "color"], [".a", "--x"], [".b", "box-shadow"]]);
  assert.ok(FARBE.test("#fff") && FARBE.test("rgba(0, 0, 0, 0.1)") && !FARBE.test("var(--eba-text)"));
  assert.deepEqual(teilen("0 0 0 1px var(--a), inset 0 0 0 2px color-mix(in srgb, red 10%, transparent)"),
    ["0 0 0 1px var(--a)", "inset 0 0 0 2px color-mix(in srgb, red 10%, transparent)"]);
  assert.equal(ohneUrl('url("data:image/svg+xml,%23fff") no-repeat'), "url() no-repeat");
  const k = deklarationen('.callout[data-callout="eba-neu"] li > a { -webkit-hyphens: auto; overflow-wrap: anywhere; } .eba-mod-knopf { hyphens: manual; } .eba-wt b { hyphens: auto; }');
  assert.deepEqual(k.filter(trenntImKnopf).map((x) => x.eigenschaft), ["-webkit-hyphens", "overflow-wrap"]);
  assert.deepEqual(fensterRegelnOhneTelefon("@media (min-width: 600px) { body.is-phone .a, .b { x: 1 } @container k (min-width: 4px) {"
    + " body.is-phonex .c { x: 1 } body.is-phone:not(.d) .e { x: 1 } } } @media (max-height: 599px) { .f { x: 1 } }"
    + " @media print { .g { x: 1 } } .h { x: 1 }"), [".b", "body.is-phonex .c", ".f"]);
});
