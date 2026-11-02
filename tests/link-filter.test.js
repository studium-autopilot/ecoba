// Links im Fließtext (linksEntschaerfen): derselbe Code steht in zentral.js (Termine, Gruppen, Angebote), server.js (Begleitnotizen,
// punktText) und server/eingang.mjs (eigener Server). Hier laufen alle drei durch dieselben Fälle, und jede Ausgabe geht durch ein
// Modell der Link-Erkennung von Obsidian: Danach darf es keinen Link geben, der nicht http(s) auf einer erlaubten Domain ist.
// Läuft ohne Obsidian: node --test tests/
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const test = require("node:test");
const assert = require("node:assert/strict");
const { laden } = require("./laden.js");

const SERVER = path.join(__dirname, "..", "server", "eingang.mjs");
const Z = laden("zentral", { heute: "2026-11-01" }).ctx.zentral;
const S = laden("server", { heute: "2026-11-01", kontext: { zentral: Z } }).ctx.server;
const TEXT = ["uni-tuebingen.de", "ffwtuebingen.de"];
const PUNKT = [...TEXT, "core-econ.org"];

// Link-Erkennung von Obsidian (app.js 1.14.5): im Bearbeiten-Modus „https:…“ (mit bis zu drei „/“ oder ohne), „www.…“ und
// „domain.tld/…“ dort, wo ein Wort mit einem Buchstaben beginnt, bis vor Leerzeichen, „<“ und Klammern (außer ausgeglichenen),
// ohne Satzzeichen am Ende; in der Lesefassung (remark-parse 8) „https://…“ und „www.…“ auch mitten im Wort bis zum nächsten
// Leerzeichen oder „<“, und HTML-Entitäten im Link werden dort entschlüsselt. „file:“ öffnet Obsidian im Tresor ohne Rückfrage
// (dazu „data:“ und „jar:“); andere Schemata nur nach Rückfrage, sie zählen hier nicht.
const BEARBEITEN = /(?<![a-z0-9])(?=[a-z])(?:https?:(?:\/{1,3}|[a-z0-9%])|www\d{0,3}[.]|[a-z0-9.-]+[.][a-z]{2,4}\/)(?:[^\s()<>]|\([^\s()<>]*\))+(?:\([^\s()<>]*\)|[^\s`*!()[\]{};:'".,<>?«»“”‘’])/gi;
const LESEN = /(?:https?:\/\/|www\d{0,3}\.)[^\s<]+/gi;
const ENTITAETEN = { amp: "&", sol: "/", period: ".", commat: "@", colon: ":", lt: "<", gt: ">", quot: '"', num: "#", bsol: "\\" };
const entschluesseln = (s) => s.replace(/&#x([0-9a-f]{1,6});/gi, (z, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&#(\d{1,7});/g, (z, d) => String.fromCodePoint(Number(d))).replace(/&([a-z]{2,8});/gi, (z, n) => ENTITAETEN[n.toLowerCase()] || z);
const fremdeLinks = (text, domains) => {
  const aus = [], erlaubt = [];
  for (const muster of [BEARBEITEN, LESEN]) {
    for (const t of String(text).matchAll(muster)) {
      const m = t[0], url = entschluesseln(m).replace(/[.,:;"')\]!?*_~“”»]+$/, "");
      let u = null;
      try { u = new URL(/^https?:/i.test(url) ? url : "https://" + url); } catch (e) { continue; }
      const host = u.hostname.toLowerCase();
      const ok = /^https?:$/.test(u.protocol) && !u.username && !u.password && domains.some((d) => host === d || host.endsWith("." + d));
      if (ok) erlaubt.push([t.index, t.index + m.length]);
      else aus.push(m);
    }
  }
  // „file:“ mitten in einem erlaubten Link gehört zu diesem Link (eigene Links erkennt Obsidian nur am Wortanfang)
  for (const t of String(text).matchAll(/(?<![a-z0-9])(?:file|data|jar):(?:\/|[a-z0-9%])/gi)) {
    if (!erlaubt.some(([von, bis]) => t.index >= von && t.index < bis)) aus.push(t[0]);
  }
  return aus;
};

// Angriffe und Grenzfälle; „=“ genau diese Ausgabe (alle drei Fassungen), sonst nur: kein fremder Link
const z = String.fromCharCode;
const FAELLE = [
  ["https://uni-tuebingen.de'@evil.example/x", "evil.example"],
  ["https://uni-tuebingen.de\"@evil.example/x", "evil.example"],
  ["https://uni-tuebingen.de(@evil.example/x", "evil.example"],
  ["https://uni-tuebingen.de\\@evil.example/x", "https://uni-tuebingen.de/@evil.example/x"],
  ["https://user:pw" + "@alma.uni-tuebingen.de/x", "alma.uni-tuebingen.de"], // getrennt: pruefen.py sähe sonst Zugangsdaten
  ["https://alma.uni-tuebingen.de:8443/x", "alma.uni-tuebingen.de"],
  ["HTTPS://EVIL.EXAMPLE/x", "evil.example"],
  ["Login evil.example/login", "Login evil.example /login"],
  ["Login evil.com/login?x=1", "Login evil.com /login?x=1"],
  ["Login: EVIL.COM/x", "Login: EVIL.COM /x"],
  ["siehe www1.evil.example", "siehe evil.example"],
  ["WWW.evil.example/x", "evil.example"],
  ["xhttps://evil.example/a", "evil.example"],
  ["Linkhttps://evil.example", "evil.example"],
  ["smb://evil.example/share", "evil.example"],
  ["https://uni-tuebingen.de.evil.example/x", "uni-tuebingen.de.evil.example"],
  ["https://evil.example/https://uni-tuebingen.de/", "evil.example"],
  ["https://uni-tuebingen.de/x[a](https://evil.example)", "https://uni-tuebingen.de/x%5Ba%5D%28https://evil.example%29"],
  ["https://uni-tuebingen.de/a%%b", "https://uni-tuebingen.de/a%25%25b"],
  ["https://uni-tuebingen.de/a\"onmouseover='x'", "https://uni-tuebingen.de/a%22onmouseover=%27x'"],
  ["https://xn--uni-tbingen-xhb.de/", "xn--uni-tbingen-xhb.de"],
  ["https://uni-tuebingen.de" + z(0x3002) + "evil.example/", "uni-tuebingen.de.evil.example"],
  ["evil" + z(0xad) + ".example/x", "evil.example /x"],
  ["ht" + z(0x200b) + "tps://evil.example/x", null],
  ["https://evil.example/" + "a".repeat(30) + " danach", "evil.example danach"],
  ["Mail:www.evil.example", "Mail:evil.example"],
  ["evil.example/www.evil.example/x", "evil.example /evil.example /x"],
  // Was stehen bleibt: Uni-Links (auch in Anführungszeichen, mit Satzzeichen danach), Gendern mit Doppelpunkt, Wörter mit „www“
  ["„https://alma.uni-tuebingen.de“", "„https://alma.uni-tuebingen.de/“"],
  ["Mehr: https://uni-tuebingen.de!", "Mehr: https://uni-tuebingen.de/!"],
  ["Siehe https://alma.uni-tuebingen.de.", "Siehe https://alma.uni-tuebingen.de/."],
  ["(https://alma.uni-tuebingen.de/a_(b)).", "(https://alma.uni-tuebingen.de/a_%28b%29)."],
  ["https://www.ffwtuebingen.de/blank-3", "https://www.ffwtuebingen.de/blank-3"],
  ["https://alma.uni-tuebingen.de/alma/pages/startFlow.xhtml?_flowId=detailView-flow&unitId=39084&periodId=237",
    "https://alma.uni-tuebingen.de/alma/pages/startFlow.xhtml?_flowId=detailView-flow&unitId=39084&periodId=237"],
  ["alma.uni-tuebingen.de/qisserver", "https://alma.uni-tuebingen.de/qisserver"],
  ["Stipendiat:innen der Stiftungen, Startup:con", "Stipendiat:innen der Stiftungen, Startup:con"],
  ["Bauwww.de", "Bau de"], // die Lesefassung macht auch mitten im Wort einen Link aus „www.“
  ["Raum 1.OG/EG", "Raum 1.OG /EG"],
  ["10:15 Uhr, z.B. Kap.3", "10:15 Uhr, z.B. Kap.3"],
  // Zweite Prüfung (01.11.2026): Entität im Host, „www.“ und „domain.tld/“ direkt nach einem Wortzeichen, „https:“ ohne „//“
  ["https://evil.example&sol;.uni-tuebingen.de/x", "evil.example sol .uni-tuebingen.de"],
  ["https://evil.example&#x2F;.uni-tuebingen.de/x", "evil.example"],
  ["Info_www.evil.example/x", "Info_evil.example /x"],
  ["xwww.evil.com/a", "xww.evil.com /a"],
  ["Login_evil.com/login", "Login_evil.com /login"],
  ["https:/evil.example/x", "evil.example"],
  ["https:evil.example", "evil.example"],
  ["https:/uni-tuebingen.de/x", "https://uni-tuebingen.de/x"],
  // Abschlussprüfung (01.11.2026): ein Name darf keinen neuen „www.“-Link ergeben, auch nicht mit dem Wort davor; „file:“ ohne „//“
  ["Anmeldung https://wwww.ww.evil.example/login", "Anmeldung ww.ww.evil.example"],
  ["https://wwww.ww.uni-tuebingen.de.evil.example/x", "ww.ww.uni-tuebingen.de.evil.example"],
  ["ww xwwwhttp:" + z(0x3002) + "evil.com", null],
  ["wwwhttp:/1" + z(0x3002) + "www.evil.com", null],
  ["https:/wwwww.ww.ww.evil.example/login", null],
  ["file:/D:/Tresor/Unterlagen/x.hta", ""],
  ["Siehe file:%5C%5Cevil.example%5Cs%5Cx.hta", "Siehe"],
  ["data:text/html,x und jar:file:/x!/y", "und"],
  ["java" + z(0xad) + "script:alert(1)", "alert(1)"],
  [".evil.com/login", ".evil.com /login"],
  ["x..evil.com/login", "x..evil.com /login"],
  ["File: Skript.pdf, Metadata:x", "File: Skript.pdf, Metadata:x"],
];

const eingang = () => import(pathToFileURL(SERVER).href);
const termin = (info) => ({ id: "l-1", titel: "Test", datum: "2026-11-02", bis: "", uhrzeit: "", ort: "", kategorie: "Veranstaltung",
  status: "offiziell", code: "", quelle_url: "", quelle_text: "", info, geprueft: "" });

test("Links: alle drei Fassungen geben dasselbe aus, und Obsidian sieht darin keinen fremden Link", { skip: !fs.existsSync(SERVER) && "server/ fehlt" }, async () => {
  const E = await eingang();
  for (const [ein, soll] of FAELLE) {
    const server = E.saeubern(ein, 1000, false).wert;
    const t = Z.terminePruefen({ schema: 1, termine: [termin(ein)] }).termine[0];
    const punkt = (S.begleitnotizSauber({ wichtigste: [{ text: ein }] }).wichtigste[0] || { text: "" }).text;
    assert.equal(t && t.info, server, "Plugin (zentral.js) = Server: " + JSON.stringify(ein));
    // punktText nimmt zusätzlich Markdown-Links und Entitäten heraus; ohne die gleich wie der Server
    if (!/[[&]/.test(ein)) assert.equal(E.saeubern(ein, 1000, false, PUNKT).wert, punkt, "Plugin (server.js) = Server: " + JSON.stringify(ein));
    if (soll !== null) assert.equal(server, soll, JSON.stringify(ein));
    assert.deepEqual(fremdeLinks(server, TEXT), [], "kein fremder Link: " + JSON.stringify(ein) + " → " + server);
    assert.deepEqual(fremdeLinks(punkt, PUNKT), [], "kein fremder Link (Begleitnotiz): " + JSON.stringify(ein) + " → " + punkt);
    assert.equal(E.saeubern(server, 1000, false).wert, server, "zweimal säubern ändert nichts: " + JSON.stringify(ein));
  }
});

test("Links: Teams und Zoom sind keine Uni-Domains (jede:r kann dort Seiten anlegen)", { skip: !fs.existsSync(SERVER) && "server/ fehlt" }, async () => {
  const E = await eingang();
  assert.equal(E.saeubern("Teams https://teams.microsoft.com/l/meetup-join/x und https://uni-tuebingen.zoom.us/j/1", 300, false).wert,
    "Teams teams.microsoft.com und uni-tuebingen.zoom.us");
});

test("Begleitnotiz: aus verschachtelten Klammern wird kein Link, kein Bild und keine Link-Definition", () => {
  const sauber = S.begleitnotizSauber({ wichtigste: [
    { text: "[a [b] c](mailto:x" + "@evil.example)" }, { text: "![a [b] c](https\\://evil.example/p.png)" },
    { text: "[x][r] und [r]: https://evil.example" }, { text: "Intervall $[0,1]$ und [Folie 3]" },
  ] }).wichtigste.map((p) => p.text);
  for (const s of sauber) assert.doesNotMatch(s, /\][(:[]/, s);
  assert.equal(sauber[2], "[x] [r] und [r] : evil.example");
  assert.equal(sauber[3], "Intervall $[0,1]$ und [Folie 3]", "Formeln und Klammern im Text bleiben");
});

test("Unsichtbare Zeichen: Variantenwähler, weiches Trennzeichen und Hangul-Füller fallen weg, Richtungszeichen werden Leerzeichen", { skip: !fs.existsSync(SERVER) && "server/ fehlt" }, async () => {
  const E = await eingang();
  const versteckt = "Vor" + z(0xad) + "lesung" + z(0xfe0f) + String.fromCodePoint(0xe0100, 0xe0041) + z(0x3164, 0x34f) + " heute" + z(0x61c) + "x";
  const soll = "Vorlesung heute x";
  assert.equal(E.saeubern(versteckt, 300, false).wert, soll);
  assert.equal(Z.terminePruefen({ schema: 1, termine: [termin(versteckt)] }).termine[0].info, soll);
  assert.equal(S.begleitnotizSauber({ wichtigste: [{ text: versteckt }] }).wichtigste[0].text, soll);
});

test("Termin-Notiz: ein erlaubter Link bleibt ohne „\\“ anklickbar, Text daneben bleibt entschärft", () => {
  const url = "https://alma.uni-tuebingen.de/alma/pages/startFlow.xhtml?_flowId=detailView-flow&unitId=39084&periodId=237";
  const t = Z.terminePruefen({ schema: 1, termine: [termin("Anmeldung *bis* Freitag: " + url + ".")] }).termine[0];
  const notiz = Z.notizText("", t, {});
  assert.ok(notiz.includes("Anmeldung \\*bis\\* Freitag: " + url + "."), notiz);
});

// ---------- Linkziele (fremdeZiele in allen drei Fassungen) ----------
// Ziel eines Links in Markdown (CommonMark, wie Obsidian liest): hinter „](“ und „]:“ (auch in „<…>“) und direkt hinter „<“, davor
// Leerraum; ein „\“ davor maskiert. Im Ziel gelten Zeichenreferenzen und „\“ vor einem Satzzeichen als das Zeichen; Tab und
// Zeilenumbruch übergeht der Browser im Schema, Leerraum und Steuerzeichen am Anfang auch. Rückgabe: Ziele mit einem anderen Schema
// als http(s).
const REFS = { colon: ":", period: ".", plus: "+", tab: "\t", newline: "\n" };
const zielSchemata = (text) => {
  const zeichen = (z, c) => (c <= 0x10ffff ? String.fromCodePoint(c) : z);
  const t = String(text).replace(/&#x([0-9a-f]{1,6});?/gi, (z, h) => zeichen(z, parseInt(h, 16)))
    .replace(/&#(\d{1,7});?/g, (z, d) => zeichen(z, Number(d))).replace(/&([a-z]{2,8});/gi, (z, n) => REFS[n.toLowerCase()] || ENTITAETEN[n.toLowerCase()] || z);
  const aus = [];
  for (const m of t.matchAll(/(?<!\\)(?:\]\(|\]:|<)[\s\u0000-\u001f]*(?:<[\s\u0000-\u001f]*)?([a-z][a-z0-9+.\-\t\n\r\\]*):/gi)) {
    if (!/^https?$/i.test(m[1].replace(/[\t\n\r\\]/g, ""))) aus.push(m[0]);
  }
  return aus;
};
const ANGRIFFE = [
  "[a](javascript:alert(1))", "[a](JaVaScRiPt:alert(1))", "[a](vbscript:msgbox(1))", "[a](data:text/html,<b>x</b>)", "[a](file:///C:/x.hta)",
  "[a](obsidian:open?vault=x)", "[a](obsidian&colon;//open?vault=x)", "[a](javascript&colon;alert(1))", "[a](java&#115;cript:alert(1))",
  "[a](&#106;avascript:alert(1))", "[a](&#x6A;avascript&#58;alert(1))", "[a](java\tscript:alert(1))", "[a](&#x09;javascript:alert(1))",
  "[a](&Tab;vbscript:x)", "[a](&#32;&#32;data:text/html,x)", "[a](javascript\\:alert(1))", "[a](java\\.x:alert(1))", "[a](<vbscript:x>)",
  "[a](< vbscript: x>)", "[a]: vbscript:x", "[a]:obsidian:open", "[a]: <javascript&colon;x>", "<vbscript:x>", "< javascript:x>",
  "[a](mailto:x" + "@evil.example)", "[a](smb:x)", "[a](https&colon;//evil.example/x)", "[a](h&#116;tps://evil.example)", "[a](\u0001vbscript:x)",
  "[[a]](vbscript:x)", "[a](javascript:vbscript:x)", "[a]javascript:(vbscript:x)",
];

test("Linkziele: nur http(s) bleibt ein Ziel, jedes andere Schema wird Text, auch kodiert", { skip: !fs.existsSync(SERVER) && "server/ fehlt" }, async () => {
  const E = await eingang();
  // das Modell selbst: ungesäubert ist fast jeder Angriff ein fremdes Ziel (die übrigen sind http(s) oder kein Ziel)
  assert.equal(ANGRIFFE.filter((a) => zielSchemata(a).length).length, ANGRIFFE.length - 3);
  for (const ein of ANGRIFFE) {
    const ausgaben = [["Server", E.saeubern(ein, 1000, false).wert, TEXT], ["Server ohne Links", E.saeubern(ein, 1000, false, []).wert, []],
      ["Plugin (zentral.js)", (Z.terminePruefen({ schema: 1, termine: [termin(ein)] }).termine[0] || { info: "" }).info, TEXT],
      ["Plugin (server.js)", (S.begleitnotizSauber({ wichtigste: [{ text: ein }] }).wichtigste[0] || { text: "" }).text, PUNKT]];
    for (const [wer, aus, domains] of ausgaben) {
      assert.deepEqual(zielSchemata(aus), [], `${wer}: ${JSON.stringify(ein)} → ${JSON.stringify(aus)}`);
      assert.deepEqual(fremdeLinks(aus, domains), [], `${wer}, kein fremder Link: ${JSON.stringify(ein)} → ${JSON.stringify(aus)}`);
    }
    const server = ausgaben[0][1];
    assert.equal(E.saeubern(server, 1000, false).wert, server, "zweimal säubern ändert nichts: " + JSON.stringify(ein));
  }
  // was keine fremden Ziele hat, bleibt: ein erlaubter Link, Wörter mit Doppelpunkt, Uhrzeiten
  for (const ein of ["[Seite](https://uni-tuebingen.de/x)", "Hinweis:x, Metadata:x, Tel.:0123 um 10:15 (Raum: N6)"]) {
    assert.equal(E.saeubern(ein, 1000, false).wert, ein);
  }
  assert.equal(E.saeubern("[a](vbscript:msgbox(1)) und [b]: data:x", 1000, false).wert, "[a] ( msgbox(1)) und [b]:");
});

test("Linkziele: vom Server über das Plugin bis in die Termin-Notiz bleibt kein fremdes Ziel", { skip: !fs.existsSync(SERVER) && "server/ fehlt" }, async () => {
  const E = await eingang();
  const info = "Formular [hier](java&#115;cript&colon;alert(1)), [b]: vbscript:x, [c](&#x09;obsidian:open) und <javascript:x>";
  const roh = { schluessel: "mail:abc@uni#1", titel: "Anmeldung Tutorium B110", datum: "2026-11-05", uhrzeit: "10:00", ort: "ILIAS",
    kategorie: "Frist", status: "offiziell", code: "B110", quelle_text: "Mail des Lehrstuhls", info };
  const server = E.terminNormal(roh, "2026-11-01");
  assert.ok(server.wert, JSON.stringify(server));
  assert.deepEqual(zielSchemata(server.wert.info), [], server.wert.info);
  const plugin = Z.terminePruefen({ schema: 1, termine: [server.wert] });
  assert.deepEqual(plugin.verworfen, []);
  const notiz = Z.notizText("", plugin.termine[0], {});
  assert.ok(notiz.includes("Formular"), notiz);
  assert.deepEqual(zielSchemata(notiz), [], notiz);
  assert.deepEqual(fremdeLinks(notiz, TEXT), [], notiz);
  assert.doesNotMatch(notiz, /(?:java|vb)script/i, notiz);
});

// Aus dem Sicherheits-Audit (01.11.2026): Link-Definition mit maskiertem Schema in einem Punkt, Verweis darauf in einem anderen
test("Begleitnotiz: Link-Definitionen und Verweise darauf (auch mit „obsidian\\://“) ergeben keinen Link", () => {
  const faelle = [
    ["[Lösung](obsidian\\://studium-autopilot?aktion=oeffnen&datei=Blatt3.hta)"],
    ["[l]: obsidian\\://studium-autopilot?aktion=oeffnen&datei=Blatt3.hta", "Musterlösung zu Blatt 3: [hier öffnen][l]"],
    ["[m]: obsidian\\://new?file=System/Skripte/hinweis.js&append=1&silent=1&content=%0Arequire('child_process').exec('calc')", "Lösungsskizze: [Blatt 3][m]"],
    ["[Blatt 3 Lösung]: obsidian\\://studium-autopilot?aktion=oeffnen&datei=Blatt3.hta", "Siehe [Blatt 3 Lösung][]"],
    ["[Lösungen]: obsidian:\\/\\/studium-autopilot?aktion=oeffnen&datei=Blatt3.hta", "Die [Lösungen] stehen bereit"],
  ];
  for (const texte of faelle) {
    const sauber = S.begleitnotizSauber({ wichtigste: texte.map((text) => ({ text })) }).wichtigste.map((p) => p.text);
    for (const s of sauber) assert.doesNotMatch(s, /\][(:[]/, "weder Link noch Verweis noch Definition: " + s);
  }
});


test("Links: lange Eingaben brauchen keine Rekursion und keine quadratische Zeit", { skip: !fs.existsSync(SERVER) && "server/ fehlt" }, async () => {
  const E = await eingang();
  for (const ein of ["https://uni-tuebingen.de/" + ")".repeat(40000), "a.de/".repeat(20000), "x".repeat(50000) + ".de/", "www.".repeat(20000)]) {
    const t0 = Date.now();
    const aus = E.saeubern(ein, 1e6, false).wert;
    assert.ok(Date.now() - t0 < 1500, "schnell genug: " + ein.slice(0, 30));
    assert.deepEqual(fremdeLinks(aus, TEXT), [], ein.slice(0, 30));
  }
});

// Zufällige Eingaben aus Bausteinen, die sich zu Links zusammensetzen können (fester Startwert, also bei jedem Lauf dieselben)
test("Links: aus zufällig zusammengesetzten Bausteinen entsteht nie ein fremder Link, auch nicht nach erneutem Säubern", { skip: !fs.existsSync(SERVER) && "server/ fehlt" }, async () => {
  const E = await eingang();
  const BAUSTEINE = ["w", "ww", "www", "wwww", ".", "..", "http:", "https:/", "https://", z(0x3002), "%2e", "1", "/", "x", "evil", "com", "de",
    "uni-tuebingen.de", " ", "_", "&sol;", "&#46;", "file:", "@", "'", "(", ")", "[", "]", ":", "-"];
  let zustand = 20261101;
  const zufall = (n) => { zustand = (Math.imul(zustand ^ (zustand >>> 15), 2246822507) + 0x6d2b79f5) >>> 0; return zustand % n; };
  for (let i = 0; i < 4000; i++) {
    let ein = "";
    for (let k = 1 + zufall(12); k > 0; k--) ein += BAUSTEINE[zufall(BAUSTEINE.length)];
    // der Server säubert, das Plugin noch einmal: jede Runde ohne fremden Link (gleich bleiben muss der Text nur bei echten Eingaben,
    // siehe FAELLE; aus Bruchstücken wie „…dehttp:“ kann eine zweite Runde noch ein Leerzeichen machen)
    let aus = ein;
    for (let runde = 1; runde <= 3; runde++) {
      aus = E.saeubern(aus, 1e6, false).wert;
      assert.deepEqual(fremdeLinks(aus, TEXT), [], `Runde ${runde}: ${JSON.stringify(ein)} → ${JSON.stringify(aus)}`);
    }
  }
});

// ---------- Zweite Sicherung beim Schreiben (linkZeichenEntwerten in zentral.js und server.js) ----------
// Text mit „\“ in Obsidian 1.14.5 (nachgeprüft am 02.11.2026 mit MarkdownRenderer an über 11 000 erzeugten Fällen): „\“ vor einem
// ASCII-Satzzeichen maskiert es und ist unsichtbar; in einer Formel ($…$) wirkt kein „\“, und dort machen nur MathJax-Befehle
// einen Link oder HTML-Merkmale (TEX_HTML, etwa \href und \mmlToken, beide in Obsidian nachgeprüft); außerhalb machen „](“, „][“, „]:“ (Link, Definition), „<“ vor einem späteren „>“ (Tag, Link in spitzen Klammern, darin
// wirkt kein „\“) und „`“ (Code) etwas anderes aus dem Text. Formeln erkennt Obsidian wie FORMEL (an Obsidian gemessen).
const FORMEL = /\\[!-/:-@[-`{-~]|\[\[[^[\]]*\]\]|\$\$[\s\S]*?\$\$|\$(?![\s$])(?:\\[\s\S]|[^\\$])*?(?:\\[\s\S]|[^\s\\$])\$(?!\d)/g;
const TEX_HTML = ["href", "mmlToken", "data", "class", "cssId", "style", "bbox", "require", "unicode"];
const formeln = (text) => [...String(text).matchAll(FORMEL)].filter((m) => m[0][0] === "$");
const ausserhalb = (text) => {
  let aus = "", bis = 0;
  for (const m of formeln(text)) { aus += text.slice(bis, m.index) + " ".repeat(m[0].length); bis = m.index + m[0].length; }
  return aus + text.slice(bis);
};
const obsidianMachtDaraus = (text, domains) => {
  const draussen = ausserhalb(text), zu = text.lastIndexOf(">");
  const aus = fremdeLinks(draussen, domains);
  for (const m of formeln(text)) if ((m[0].match(/\\(?:[a-z]+|[\s\S]?)/gi) || []).some((z) => TEX_HTML.includes(z.slice(1)))) aus.push(m[0]);
  for (let i = 0; i < draussen.length; i++) {
    const c = draussen[i], n = draussen[i + 1] || "";
    if (c === "\\" && /[!-/:-@[-`{-~]/.test(n)) i++;
    else if ((c === "]" && /[(:[]/.test(n)) || c === "`" || (c === "<" && /\S/.test(n) && i < zu)) aus.push(draussen.slice(i, i + 20));
  }
  return aus;
};
// was man sieht: außerhalb von Formeln ohne die maskierenden „\“, „&lt;“ als „<“
const sichtbar = (text) => {
  let aus = "", bis = 0;
  const ohne = (t) => t.replace(/\\([!-/:-@[-`{-~])/g, "$1").replace(/&lt;/g, "<");
  for (const m of formeln(text)) { aus += ohne(text.slice(bis, m.index)) + m[0]; bis = m.index + m[0].length; }
  return aus + ohne(text.slice(bis));
};
// Zeile einer Begleitnotiz ohne punktText davor: so wirkt die zweite Sicherung allein
const zuTun = (text) => (S.begleitnotizErgaenzen("", { zu_tun: [{ text }] }, "x.pdf") || "").split("\n").find((z) => z.startsWith("- [ ] ")).slice(6);

test("Zweite Sicherung: was in Obsidian geprüft wurde, kommt genau so heraus", () => {
  const b = String.fromCharCode(92);
  const faelle = [
    ["Formel $x<y$ und $a" + b + "href{https://evil.example}{k}$ und $" + b + b + "href$", "Formel $x<y$ und $a{https://evil.example}{k}$ und $" + b + b + "href$"],
    ["Stipendiat:innen um 10:15 am 12.11. siehe https://alma.uni-tuebingen.de/x.", "Stipendiat:innen um 10:15 am 12.11. siehe https://alma.uni-tuebingen.de/x."],
    ["<b>x</b> [a](https://evil.example) www.evil.example/x xhttps://evil.example",
      b + "<b>x" + b + "</b> [a" + b + "](https" + b + "://evil.example) www" + b + ".evil" + b + ".example/x xhttps" + b + "://evil.example"],
    ["[x]: https://evil.example", "[x" + b + "]: https" + b + "://evil.example"],
    ["<https://evil.example> <javascript:alert(1)>", b + "<https" + b + "://evil.example> " + b + "<javascript:alert(1)>"],
    ["$a`$https://evil.example$", "$a" + b + "`$https" + b + "://evil.example$"],
    ["[[$]]https://evil.example$", "[[$]]https" + b + "://evil.example$"],
    ["<https://x$a>$", b + "<https" + b + "://x$a>$"],
    ["`$`https://evil.example$", b + "`$" + b + "`https://evil.example$"],
    ["$x$" + b + "href{https://evil.example}{k}", "$x${https" + b + "://evil.example}{k}"],
    ["https" + b + "://evil.example und www" + b + ".evil.example", "https" + b + "://evil.example und www" + b + ".evil.example"],
    ["Abgabe <10 Seiten", "Abgabe <10 Seiten"],
    // Zweite Prüfung (02.11.2026): Satzzeichen hinter einem erlaubten Link gehören nicht zu ihm; \mmlToken macht in einer Formel einen Link
    ["[Musterlösung https://uni-tuebingen.de/x]( https://evil.example/login)",
      "[Musterlösung https://uni-tuebingen.de/x" + b + "]( https" + b + "://evil" + b + ".example/login)"],
    ["$" + b + "mmlToken{mi}[href=\"https://evil.example\"]{click}$", "${mi}[href=\"https://evil.example\"]{click}$"],
    ["Siehe https://alma.uni-tuebingen.de/x.", "Siehe https://alma.uni-tuebingen.de/x."],
  ];
  for (const [ein, soll] of faelle) assert.equal(zuTun(ein), soll, JSON.stringify(ein));
  // Termine: Text bleibt Text; „1. …“ am Anfang wird keine Liste, und der „\“ steht vor dem Punkt (vor der Ziffer bliebe er sichtbar)
  assert.equal(Z.mdText("1. Vorlesung"), "1" + b + ". Vorlesung");
  assert.equal(Z.mdText("12.11. Anmeldung"), "12" + b + ".11. Anmeldung");
  assert.equal(Z.mdText("- Punkt"), b + "- Punkt");
  assert.equal(Z.mdText("a[ Login https://alma.uni-tuebingen.de/]( https&colon;//evil.example)"),
    "a" + b + "[ Login https://alma.uni-tuebingen.de/" + b + "]( https&colon;//evil.example)");
  assert.equal(Z.mdText("Kosten $5 <b>x</b> www.evil.example"), "Kosten " + b + "$5 " + b + "<b" + b + ">x" + b + "</b" + b + "> www" + b + ".evil.example");
});

test("Zweite Sicherung allein: aus zufälligen Bausteinen wird nie ein fremder Link, kein HTML, kein Code, und der Text sieht gleich aus", () => {
  const b = String.fromCharCode(92);
  const BAUSTEINE = ["w", "ww", "www", "wwww", ".", "..", "http:", "https:/", "https://", "1", "/", "x", "evil", "com", "de", "uni-tuebingen.de", " ",
    "_", "&sol;", "&#46;", "file:", "@", "'", "(", ")", "[", "]", ":", "-", "$", "$$", b, "<b>", "</b>", "<", ">", "](", "]:", "][", b + "href{", "}",
    "{", "www.", ".com/", "*", "`", "~", "!", "#", "obsidian://", "mailto:", "smb://", "file:///", "data:", "<https://", "javascript:", "%", "a",
    b + "$", b + ":", "[[", "]]", "https://uni-tuebingen.de/x", b + "mmlToken{mi}[href=", b + "data{"];
  let zustand = 20261102;
  const zufall = (n) => { zustand = (Math.imul(zustand ^ (zustand >>> 15), 2246822507) + 0x6d2b79f5) >>> 0; return zustand % n; };
  for (let i = 0; i < 4000; i++) {
    let ein = "";
    for (let k = 1 + zufall(14); k > 0; k--) ein += BAUSTEINE[zufall(BAUSTEINE.length)];
    ein = ein.trim();
    if (!ein) continue;
    const md = Z.mdText(ein);
    assert.deepEqual(obsidianMachtDaraus(md, TEXT), [], "Termin: " + JSON.stringify(ein) + " → " + JSON.stringify(md));
    assert.equal(sichtbar(md), ein, "Termin zeigt den Text, wie er kam: " + JSON.stringify(ein));
    const zeile = zuTun(ein);
    assert.deepEqual(obsidianMachtDaraus(zeile, PUNKT), [], "Begleitnotiz: " + JSON.stringify(ein) + " → " + JSON.stringify(zeile));
    // TEX_HTML fällt weg; mit „`“ ändert das Maskieren, was eine Formel ist (beides kommt nach punktText nicht mehr vor)
    if (!TEX_HTML.some((n) => ein.includes(b + n)) && !ein.includes("`")) assert.equal(sichtbar(zeile), sichtbar(ein), "Begleitnotiz sieht gleich aus: " + JSON.stringify(ein));
  }
});

test("Begleitnotiz: ein Punkt aus einer früheren Fassung ohne „\\“ zählt als schon vorhanden", () => {
  const alt = "## Zu tun\n- [ ] Lies www.evil.example/x und [Folie](3)\n";
  assert.equal(S.begleitnotizErgaenzen(alt, { zu_tun: [{ text: "Lies www.evil.example/x und [Folie](3)" }] }, "x.pdf"), null);
});

test("Zweite Sicherung: lange Eingaben brauchen keine quadratische Zeit", () => {
  const b = String.fromCharCode(92);
  for (const ein of ["$a".repeat(20000), "<a".repeat(20000) + ">", b.repeat(40000), "`".repeat(40000), "[[".repeat(20000), "$$x".repeat(13000),
    ("https://uni-tuebingen.de/ " + "<".repeat(25)).repeat(800) + ">", "$a" + (b + "$").repeat(20000)]) {
    const t0 = Date.now();
    zuTun(ein);
    Z.mdText(ein);
    assert.ok(Date.now() - t0 < 1500, "schnell genug: " + ein.slice(0, 30));
  }
});

test("Säubern: viel zu lange Texte weist es ab, bevor die Muster laufen (die brauchen dort mehr als lineare Zeit)", { skip: !fs.existsSync(SERVER) && "server/ fehlt" }, async () => {
  const E = await eingang();
  for (const ein of ["a.".repeat(20000), "a.b".repeat(15000), "<a".repeat(20000)]) {
    const t0 = Date.now();
    assert.equal(Z.terminePruefen({ schema: 1, termine: [termin(ein)] }).termine.length, 0, "Termin verworfen: " + ein.slice(0, 12));
    assert.equal(E.saeubern(ein, 1000, false).fehler, "zu lang");
    assert.ok(S.begleitnotizSauber({ wichtigste: [{ text: ein }] }).wichtigste.every((x) => x.text.length <= 300));
    assert.ok(Date.now() - t0 < 1500, "schnell genug: " + ein.slice(0, 12));
  }
});
