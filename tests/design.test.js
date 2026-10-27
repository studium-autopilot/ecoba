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
  assert.deepEqual(funde, [], "Farben nur über --eba-*-Variablen (docs/design.md, Grundsatz 8)");
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
  assert.deepEqual(funde, [], "Schatten nur über --eba-shadow (Karten: keiner) und --eba-shadow-schwebend (Fenster), docs/design.md");
});

test("Symbole nur mit Bedeutung: --callout-icon nur für Ort, Kontakt, Achtung und die Themen der Hilfe", () => {
  const funde = deklarationen(CORE).filter((d) => d.eigenschaft === "--callout-icon"
    && !/eba-ort|eba-kontakt|eba-achtung|hilfe/.test(d.selektor)).map((d) => `Z. ${d.zeile}: ${d.selektor}`);
  assert.deepEqual(funde, [], "ein Symbol nur, wo es etwas sagt, das der Titel nicht sagt (docs/design.md, Grundsatz 9)");
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
  // eba-uebersicht-knopf: kein eigener Stil, Obsidians Umschalter mit dessen Klassen (kopfleiste.js), im CSS nur ein- und ausgeblendet
  const BESTAND = ["eba-ei-knopf", "eba-gr-knopf", "eba-mod-alma-knopf", "eba-mod-knopf", "eba-toast-knopf",
    "eba-uebersicht-knopf", "eba-uh-knopf", "eba-vb-knopf"];
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

// Farben der Termin-Arten (eba-core.css Abschnitt 1, Werte je Design): Variablen eines Farbschemas in der Reihenfolge, in der
// Obsidian sie anwendet (später gewinnt), var(--x) aufgelöst. Abstand in OKLab, Lesbarkeit als WCAG-Kontrast.
const DATEI = Object.fromEntries(DESIGNS);
const OHNE_DESIGN = ':where(:not([class*="eba-design-"]))';
const SCHEMATA = {
  "Elfenbein hell": [[CORE, "body"], [DATEI["eba-paper-elfenbein.css"], `:is(.theme-light, .theme-dark)${OHNE_DESIGN}`],
    [DATEI["eba-paper-elfenbein.css"], `.theme-light${OHNE_DESIGN}`]],
  "Dunkel (alle Designs)": [[CORE, "body"], [DATEI["eba-paper-elfenbein.css"], ".theme-dark"]],
  "Flieder hell": [[CORE, "body"], [DATEI["eba-flieder.css"], ".eba-design-flieder.theme-light"]],
  "Klar hell": [[CORE, "body"], [DATEI["eba-klar.css"], ".eba-design-klar.theme-light"]],
};
const variablen = (bloecke) => {
  const v = {};
  for (const [css, selektor] of bloecke) {
    for (const d of deklarationen(css)) if (d.selektor === selektor && d.eigenschaft.startsWith("--")) v[d.eigenschaft] = d.wert;
  }
  const wert = (n, tiefe = 0) => {
    const m = /^var\((--[\w-]+)\)$/.exec(v[n] || "");
    return m && tiefe < 9 ? wert(m[1], tiefe + 1) : v[n];
  };
  return wert;
};
const rgb = (h) => {
  const m = /^#([0-9a-f]{6})$/i.exec(String(h));
  assert.ok(m, `Farbe als #rrggbb erwartet: ${h}`);
  return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255);
};
const linear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const oklab = (c) => {
  const [r, g, b] = c.map(linear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
};
const abstand = (a, b) => { const x = oklab(a), y = oklab(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); };
const mischen = (a, b, t) => a.map((x, i) => x * t + b[i] * (1 - t)); // color-mix(in srgb, a t, b)
const helligkeit = (c) => { const [r, g, b] = c.map(linear); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const kontrast = (a, b) => { const [h, d] = [helligkeit(a), helligkeit(b)].sort((x, y) => y - x); return (h + 0.05) / (d + 0.05); };
const farbton = (c) => { const [, a, b] = oklab(c); return ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360; }; // OKLCH-Farbton in Grad
const buntheit = (c) => { const [, a, b] = oklab(c); return Math.hypot(a, b); };
const ARTEN = ["pruefung", "uni", "event"];

test("Kalender: Prüfung, Uni und Veranstaltung sind in jedem Design auf einen Blick verschieden und im Chip lesbar", () => {
  const funde = [];
  for (const [name, bloecke] of Object.entries(SCHEMATA)) {
    const wert = variablen(bloecke);
    const art = Object.fromEntries(ARTEN.map((a) => [a, rgb(wert("--eba-art-" + a))]));
    const karte = rgb(wert("--eba-card-bg")), text = rgb(wert("--eba-text")), akzent = rgb(wert("--eba-accent"));
    // 0,2: so weit wie Rot, Blau und Grün mittlerer Sättigung; Flieder hatte bis 24.10.2026 Uni und Veranstaltung bei 0,08
    for (const [i, a] of ARTEN.entries()) {
      for (const b of ARTEN.slice(i + 1)) if (abstand(art[a], art[b]) < 0.2) funde.push(`${name}: ${a}/${b} ${abstand(art[a], art[b]).toFixed(3)}`);
    }
    // Uni und Veranstaltung nicht im Akzent (heute, gewählter Tag)
    for (const a of ["uni", "event"]) if (abstand(art[a], akzent) < 0.09) funde.push(`${name}: ${a} zu nah am Akzent`);
    // Jede Farbe eine Bedeutung (seit 0.7.0): Grün heißt erledigt. Veranstaltungen sind nicht grün (Farbton 100–180°), und der
    // Akzent liegt nicht in der Familie von „erledigt“ (bis 0.6.14 in Elfenbein Waldgrün neben Grün, Abstand 0,09)
    const gut = rgb(wert("--eba-good")), ton = (c) => farbton(c);
    if (ton(art.event) >= 100 && ton(art.event) <= 180) funde.push(`${name}: Veranstaltung grün (${ton(art.event).toFixed(0)}°)`);
    const tonAbstand = Math.abs(((ton(akzent) - ton(gut) + 540) % 360) - 180);
    if (abstand(akzent, gut) < 0.15 || (buntheit(akzent) >= 0.05 && tonAbstand < 45)) funde.push(`${name}: Akzent wie erledigt`);
    // Chip wie in eba-core.css: Fläche 17 % auf der Karte, Schrift 82 % mit der Textfarbe
    for (const a of ARTEN) {
      const k = kontrast(mischen(art[a], text, 0.82), mischen(art[a], karte, 0.17));
      if (k < 4.5) funde.push(`${name}: ${a} im Chip schlecht lesbar (${k.toFixed(1)})`);
      // Vorbei (seit 0.7.0): 40 % --eba-muted in --eba-faint auf 7 % Farbe tritt zurück und bleibt lesbar; bis 0.6.14
      // Deckkraft 0,6, etwa 2 : 1
      const v = kontrast(mischen(rgb(wert("--eba-muted")), rgb(wert("--eba-faint")), 0.4), mischen(art[a], karte, 0.07));
      if (v < 4.5) funde.push(`${name}: ${a} vorbei schlecht lesbar (${v.toFixed(2)})`);
    }
  }
  assert.deepEqual(funde, []);
});

// Farbe je Modul im Wochenraster (seit 27.10.2026; eba-core.css Abschnitt 1, dunkel in eba-paper-elfenbein.css, Flieder und Klar
// tauschen je einen Ton): sechs Töne, die man auseinanderhält und die keinen Zustand nachahmen (docs/design.md, „Farbe je Modul im
// Wochenraster“). Rückmeldung vom 27.10.2026: „Timetable Colors aren't distinguishable too faint“ (dunkel auf dem iPad). Danach
// waren hell die Flächen zweier Module kaum zu unterscheiden (bei 18 % nur 0,019 auseinander, Übungen bei 10 % 0,010, bei 15 %
// 0,016): Flächen untereinander unten, mit Grenzen, die man sieht (Vorlesungen 0,03, Übungen 0,025), nicht knapp unter den Werten.
const MODULE = [1, 2, 3, 4, 5, 6];
// Art und Raum im Kasten: --eba-ev-raum aus eba-core.css Abschnitt 55, ein Grau mit --eba-ev-raum-anteil Textfarbe (je Schema)
const RAUM = deklarationen(CORE).find((d) => d.selektor === ".eba-woche .eba-ev" && d.eigenschaft === "--eba-ev-raum");
test("Wochenraster: sechs Modulfarben je Design verschieden, kein Zustand, Kante sichtbar, Fläche nicht blass, Schrift lesbar", () => {
  const funde = [];
  for (const [name, bloecke] of Object.entries(SCHEMATA)) {
    const wert = variablen(bloecke), farbe = (v) => rgb(wert(v));
    const m = MODULE.map((n) => farbe("--eba-modul-" + n));
    const seite = farbe("--eba-bg"), karte = farbe("--eba-card-bg"), text = farbe("--eba-text"), leise = farbe("--eba-muted");
    const ton = parseFloat(wert("--eba-modul-ton")) / 100, tonUe = parseFloat(wert("--eba-modul-ton-ue")) / 100;
    assert.ok(ton >= 0.15 && ton <= 0.4 && tonUe >= 0.08 && tonUe < ton, `${name}: Flächen ${ton} / ${tonUe}`);
    assert.equal(RAUM && RAUM.wert, "color-mix(in srgb, var(--eba-text) var(--eba-ev-raum-anteil), var(--eba-muted))", "Abschnitt 55: --eba-ev-raum");
    const anteil = parseFloat(wert("--eba-ev-raum-anteil")) / 100;
    assert.ok(anteil > 0 && anteil <= 0.5, `${name}: --eba-ev-raum-anteil ${anteil}`);
    const raum = mischen(text, leise, anteil);
    // bleibt ein Grau: deutlich leiser als der Kurzname
    if (kontrast(raum, seite) > 0.7 * kontrast(text, seite)) funde.push(`${name}: Raumzeile so kräftig wie der Kurzname`);
    const flaechen = [], flaechenUe = [];
    const tonAbstand = (a, b) => Math.abs(((farbton(a) - farbton(b) + 540) % 360) - 180);
    m.forEach((a, i) => {
      const n = i + 1;
      // 0,1 wie im Kalender für Töne, die man in einer Woche nebeneinander sieht (sechs statt drei, darum nicht 0,2)
      for (let j = i + 1; j < m.length; j++) if (abstand(a, m[j]) < 0.1) funde.push(`${name}: ${n}/${j + 1} ${abstand(a, m[j]).toFixed(3)}`);
      // Ausnahmen stehen in derselben Woche als Fläche und Kante in --eba-warn; der Akzent markiert heute, jetzt und Auswahl
      if (abstand(a, farbe("--eba-warn")) < 0.12 || tonAbstand(a, farbe("--eba-warn")) < 45) funde.push(`${name}: ${n} wie eine Ausnahme`);
      if (abstand(a, farbe("--eba-accent")) < 0.1) funde.push(`${name}: ${n} wie der Akzent`);
      // Jede Farbe eine Bedeutung: 1–4 liegen in keiner Familie einer Statusfarbe (Farbton ≥ 25° entfernt), Grün (5) und Rosa (6)
      // leihen sich eine und sind dort nie die Farbe selbst (≥ 0,05)
      for (const v of ["--eba-good", "--eba-bad", "--eba-art-pruefung", "--eba-art-event"]) {
        const s = farbe(v);
        if (n <= 4 && tonAbstand(a, s) < 25) funde.push(`${name}: ${n} in der Familie von ${v} (${tonAbstand(a, s).toFixed(0)}°)`);
        if (abstand(a, s) < 0.05) funde.push(`${name}: ${n} gleich ${v}`);
      }
      if (kontrast(a, karte) < 3) funde.push(`${name}: Kante ${n} kaum sichtbar (${kontrast(a, karte).toFixed(1)})`);
      // Fläche wie in eba-core.css Abschnitt 55: Ton auf der Seite. Kurzname in --eba-text, Art und Raum in --eba-ev-raum
      const vl = mischen(a, seite, ton), ue = mischen(a, seite, tonUe);
      flaechen.push(vl);
      flaechenUe.push(ue);
      for (const [art, f] of [["Vorlesung", vl], ["Übung", ue]]) {
        for (const [wer, s] of [["Schrift", text], ["Raum", raum]]) if (kontrast(s, f) < 4.5) funde.push(`${name}: ${wer} auf ${art} ${n} (${kontrast(s, f).toFixed(2)})`);
      }
      // nicht zu blass: Fläche hebt sich von der Karte ab, Übung sichtbar heller bzw. leiser als Vorlesung
      if (abstand(vl, karte) < 0.075 || abstand(ue, karte) < 0.04 || abstand(vl, ue) < 0.03) funde.push(`${name}: Fläche ${n} zu blass`);
    });
    // Flächen untereinander: zwei Vorlesungen verschiedener Module unterscheidet man an der Fläche, nicht erst an der Kante, zwei
    // Übungen ebenso, nur etwas leiser
    for (let i = 0; i < 6; i++) {
      for (let j = i + 1; j < 6; j++) {
        if (abstand(flaechen[i], flaechen[j]) < 0.03) funde.push(`${name}: Flächen ${i + 1}/${j + 1} kaum verschieden (${abstand(flaechen[i], flaechen[j]).toFixed(3)})`);
        if (abstand(flaechenUe[i], flaechenUe[j]) < 0.025) funde.push(`${name}: Übungsflächen ${i + 1}/${j + 1} kaum verschieden (${abstand(flaechenUe[i], flaechenUe[j]).toFixed(3)})`);
      }
    }
  }
  assert.deepEqual(funde, []);
  // Art und Raum nutzen dieses Grau, nicht --eba-muted
  for (const s of [".eba-woche .eba-ev > b i", ".eba-woche .eba-ev > span"]) {
    const farben = deklarationen(CORE).filter((d) => d.selektor === s && d.eigenschaft === "color").map((d) => d.wert);
    assert.deepEqual(farben, ["var(--eba-ev-raum)"], s);
  }
});

// Ring „jetzt“ im Wochenraster (eba-core.css, .eba-ev.jetzt): In dunkel war er in --eba-accent (#4b5566) auf den Flächen der Module
// 1,33 : 1 (Prüfung vom 27.10.2026). Als Rand eines Bedienelements mindestens 3 : 1 auf jeder Fläche (Vorlesung, Übung) und auf der Seite.
test("Wochenraster: der Ring „jetzt“ ist auf jeder Fläche jedes Designs zu sehen (mindestens 3 : 1)", () => {
  const ring = deklarationen(CORE).filter((d) => d.selektor === ".eba-ev.jetzt:not(.spaeter)" && d.eigenschaft === "box-shadow").map((d) => d.wert);
  assert.deepEqual(ring, ["inset 0 0 0 2px var(--eba-accent-text)"]);
  const funde = [];
  for (const [name, bloecke] of Object.entries(SCHEMATA)) {
    const wert = variablen(bloecke), farbe = (v) => rgb(wert(v));
    const seite = farbe("--eba-bg"), r = farbe("--eba-accent-text");
    const ton = parseFloat(wert("--eba-modul-ton")) / 100, tonUe = parseFloat(wert("--eba-modul-ton-ue")) / 100;
    for (const n of MODULE) {
      const a = farbe("--eba-modul-" + n);
      for (const [art, f] of [["Vorlesung", mischen(a, seite, ton)], ["Übung", mischen(a, seite, tonUe)]]) {
        if (kontrast(r, f) < 3) funde.push(`${name}: auf ${art} ${n} ${kontrast(r, f).toFixed(2)}`);
      }
    }
    if (kontrast(r, seite) < 3) funde.push(`${name}: auf der Seite`);
  }
  assert.deepEqual(funde, []);
});

// Online-Sitzung im Wochenraster (seit 27.10.2026, Rückmeldung zum Data Science Lab von S110: „isn't distinct in timetable but should
// be since it's online“): gestrichelte Kante, Fläche in Streifen aus dem Ton des Moduls und 60 % davon, Kamera vor dem Raum. Art und
// Raum bleiben auf beiden Streifen lesbar (mindestens 4,5 : 1), der hellere Streifen ist noch zu sehen.
test("Wochenraster: Online-Sitzung schraffiert und gestrichelt, Schrift auf beiden Streifen jedes Designs lesbar", () => {
  const regel = (sel, eig) => deklarationen(CORE).filter((d) => d.selektor === sel && d.eigenschaft === eig).map((d) => d.wert.replace(/\s+/g, " "));
  assert.deepEqual(regel(".eba-woche .eba-ev.online", "border-left-style"), ["dashed"]);
  assert.deepEqual(regel(".eba-woche .eba-ev.online", "background"), ["repeating-linear-gradient(135deg, color-mix(in srgb, var(--eba-ev-farbe) var(--eba-ev-ton), var(--eba-bg)) 0 6px, color-mix(in srgb, var(--eba-ev-farbe) calc(var(--eba-ev-ton) * 0.6), var(--eba-bg)) 6px 12px)"]);
  assert.deepEqual(regel(".eba-woche .eba-ev.online", "--eba-ev-ton"), ["var(--eba-modul-ton)"]);
  assert.deepEqual(regel(".eba-woche .eba-ev.online.ue", "--eba-ev-ton"), ["var(--eba-modul-ton-ue)"]);
  assert.deepEqual(regel(".eba-woche .eba-ev.online.ausnahme", "border-left-style"), ["dashed"], "eine Ausnahme bleibt gestrichelt");
  // Reihenfolge: nach Übung (ersetzt deren Fläche), vor den Ausnahmen (die ersetzen sie)
  const i = (s) => CORE.indexOf(s);
  assert.ok(i(".eba-woche .eba-ev.ue {") < i(".eba-woche .eba-ev.online {") && i(".eba-woche .eba-ev.online {") < i(".eba-woche .eba-ev.ausnahme {"));
  const funde = [];
  for (const [name, bloecke] of Object.entries(SCHEMATA)) {
    const wert = variablen(bloecke), farbe = (v) => rgb(wert(v));
    const seite = farbe("--eba-bg"), text = farbe("--eba-text"), raum = mischen(text, farbe("--eba-muted"), parseFloat(wert("--eba-ev-raum-anteil")) / 100);
    for (const n of MODULE) {
      const a = farbe("--eba-modul-" + n);
      for (const [art, t] of [["Vorlesung", parseFloat(wert("--eba-modul-ton")) / 100], ["Übung", parseFloat(wert("--eba-modul-ton-ue")) / 100]]) {
        const voll = mischen(a, seite, t), hell = mischen(a, seite, t * 0.6);
        for (const [wer, s] of [["Schrift", text], ["Raum", raum]]) {
          for (const f of [voll, hell]) if (kontrast(s, f) < 4.5) funde.push(`${name}: ${wer} auf ${art} ${n} online (${kontrast(s, f).toFixed(2)})`);
        }
        if (abstand(voll, hell) < 0.012) funde.push(`${name}: Streifen ${art} ${n} kaum zu sehen (${abstand(voll, hell).toFixed(3)})`);
      }
    }
  }
  assert.deepEqual(funde, []);
});

// Die Vorschau-Kacheln unter „Design“ zeigen die hellen Farben ihres Designs; bis 0.6.14 war die von Elfenbein noch waldgrün
test("Vorschau eines Designs: Seite, Karte, Text und Akzent wie das Design selbst", () => {
  const vorschau = { "Elfenbein hell": "", "Flieder hell": '[data-design="flieder"]', "Klar hell": '[data-design="klar"]' };
  const funde = [];
  for (const [name, attr] of Object.entries(vorschau)) {
    const wert = variablen(SCHEMATA[name]);
    const m = Object.fromEntries(deklarationen(CORE).filter((d) => d.selektor === ".eba-dk button.eba-dk-wahl" + attr).map((d) => [d.eigenschaft, d.wert]));
    for (const [v, ist] of [["--m-seite", "--eba-bg"], ["--m-karte", "--eba-card-bg"], ["--m-text", "--eba-text"], ["--m-akzent", "--eba-accent"]]) {
      if (m[v] !== wert(ist)) funde.push(`${name}: ${v} ${m[v]} statt ${wert(ist)}`);
    }
  }
  assert.deepEqual(funde, []);
});

// Kleine graue Schrift (Label, Nummern, Pfeile) war bis 0.6.14 mit 3,4–3,5 : 1 auf hellem Grund schwer lesbar
test("Text, Metazeile und Nebensachen sind in jedem Design auf Seite und Karte lesbar (mindestens 4,5 : 1)", () => {
  const funde = [];
  for (const [name, bloecke] of Object.entries(SCHEMATA)) {
    const wert = variablen(bloecke);
    for (const v of ["--eba-text", "--eba-muted", "--eba-faint"]) {
      for (const grund of ["--eba-bg", "--eba-card-bg"]) {
        const k = kontrast(rgb(wert(v)), rgb(wert(grund)));
        if (k < 4.5) funde.push(`${name}: ${v} auf ${grund} ${k.toFixed(2)}`);
      }
    }
  }
  assert.deepEqual(funde, []);
});

// Bis 0.6.14 stand über jedem Titel ein Pfad („DASHBOARD / STUDIUM“), auf dem iPad direkt unter Obsidians eigenem
test("Seitenkopf ohne Pfad: keine Seite, kein Gerüst und kein Skript schreibt ihn, ältere Notizen blendet das CSS aus", () => {
  const dateien = [path.join(VAULT, "Dashboard.md"), path.join(VAULT, "System", "Einstellungen.md")];
  const sammeln = (ordner) => {
    for (const e of fs.readdirSync(ordner, { withFileTypes: true })) {
      const p = path.join(ordner, e.name);
      if (e.isDirectory()) sammeln(p);
      else if (/\.(md|js)$/.test(e.name)) dateien.push(p);
    }
  };
  for (const o of ["Studium", "Module", path.join("System", "Daten"), path.join("System", "Gerüste"), SKRIPTE]) sammeln(path.resolve(VAULT, o));
  assert.ok(dateien.length > 100);
  // nachtraege.js erkennt den alten Kopf nur, um ihn zu ersetzen (Nachtrag folien-kopf)
  const schreibt = (p) => lesen(p).includes("eba-pfad") && path.basename(p) !== "nachtraege.js";
  assert.deepEqual(dateien.filter(schreibt).map((p) => path.relative(VAULT, p)), []);
  assert.match(CORE, /\.eba \.eba-kopf > \.eba-pfad,\s*\.eba \.eba-pfad-start,[^{]*\{ display: none; \}/);
});

test("Der Wächter erkennt Verstöße", () => {
  const d = deklarationen(".a { color: #fff; --x: #000; } @container k (max-width: 4px) { .b { box-shadow: 0 2px 8px rgba(0,0,0,.2) } }");
  assert.deepEqual(d.map((x) => [x.selektor, x.eigenschaft]), [[".a", "color"], [".a", "--x"], [".b", "box-shadow"]]);
  assert.ok(FARBE.test("#fff") && FARBE.test("rgba(0, 0, 0, 0.1)") && !FARBE.test("var(--eba-text)"));
  assert.deepEqual(teilen("0 0 0 1px var(--a), inset 0 0 0 2px color-mix(in srgb, red 10%, transparent)"),
    ["0 0 0 1px var(--a)", "inset 0 0 0 2px color-mix(in srgb, red 10%, transparent)"]);
  assert.equal(ohneUrl('url("data:image/svg+xml,%23fff") no-repeat'), "url() no-repeat");
  assert.ok(abstand(rgb("#4a5ba6"), rgb("#7446a6")) < 0.2, "Indigo und Violett (Flieder bis 24.10.2026) gelten als zu ähnlich");
  assert.equal(variablen([[".a { --x: var(--y); --y: #123456; }", ".a"]])("--x"), "#123456");
  const k = deklarationen('.callout[data-callout="eba-neu"] li > a { -webkit-hyphens: auto; overflow-wrap: anywhere; } .eba-mod-knopf { hyphens: manual; } .eba-wt b { hyphens: auto; }');
  assert.deepEqual(k.filter(trenntImKnopf).map((x) => x.eigenschaft), ["-webkit-hyphens", "overflow-wrap"]);
  assert.deepEqual(fensterRegelnOhneTelefon("@media (min-width: 600px) { body.is-phone .a, .b { x: 1 } @container k (min-width: 4px) {"
    + " body.is-phonex .c { x: 1 } body.is-phone:not(.d) .e { x: 1 } } } @media (max-height: 599px) { .f { x: 1 } }"
    + " @media print { .g { x: 1 } } .h { x: 1 }"), [".b", "body.is-phonex .c", ".f"]);
});
