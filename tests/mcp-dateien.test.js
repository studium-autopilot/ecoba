// Tests für Dateien auf Abruf im Connector (server/mcp-dateien.mjs, dateien_suchen, datei_lesen, große Notizen in notizen_suchen und
// notiz_lesen): der offizielle MCP-Client gegen den echten Server über einem Test-Tresor. pdfinfo, pdftotext, pdftoppm und ffmpeg
// ersetzt eine Attrappe (sie schreibt jeden Aufruf mit); ob die echten Programme laufen, prüft der Prototyp nach dem Ausrollen.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const assert = require("node:assert/strict");

const SERVER = path.join(__dirname, "..", "server");
const da = fs.existsSync(path.join(SERVER, "mcp-dateien.mjs"));
const test = (name, f) => require("node:test")(name, { skip: !da && "server/mcp-dateien.mjs fehlt in diesem Baum" }, f);
const laden = (datei) => import(pathToFileURL(path.join(SERVER, datei)).href);

const JETZT = new Date("2026-11-04T09:00:00Z");
const TOKEN = "t".repeat(40);
const WORT = "Quokkastelle";

// großer Text: über 2 MB, das Suchwort nach etwa 1,5 MB
const grosserText = () => {
  const zeile = "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor.\n";
  const vorn = zeile.repeat(Math.ceil(1.5 * 1024 * 1024 / zeile.length));
  return `# Lehrbuch\n\n${vorn}\n## Kapitel 9\n\nHier steht die ${WORT} mit Text.\n\n${zeile.repeat(8000)}`;
};

function tresorAnlegen() {
  const w = fs.mkdtempSync(path.join(os.tmpdir(), "studium-mcp-dateien-"));
  const datei = (rel, inhalt) => {
    fs.mkdirSync(path.join(w, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(w, rel), inhalt);
  };
  datei("Unterlagen/S110/S110 Folien 01.pdf", "%PDF-1.4 nur eine Attrappe");
  datei("Anhänge/Tafel klein.png", Buffer.from("89504e470d0a1a0a0000000d49484452", "hex"));
  datei("Anhänge/Tafel gross.jpg", Buffer.alloc(200 * 1024, 7));
  datei("Unterlagen/S110/Uebung 3.R", "x <- c(1, 2, 3)\nmean(x)\n");
  datei("Unterlagen/S110/Seite.html", "<html><head><script>alert('weg')</script><style>p{}</style></head><body><p>Hallo &amp; "
    + "<a href=\"https://evil.example/x\">Link</a></p></body></html>");
  datei("Unterlagen/B110/Vorlage.docx", "PK\u0003\u0004");
  datei("Literatur/Lehrbuch (Volltext).md", "---\ntyp: notiz\n---\n" + grosserText());
  datei("Literatur/Tagebuch gross.md", "---\nprivat: true\n---\n" + grosserText());
  datei("Notizen/Klein.md", "---\ntyp: notiz\n---\nkleine Notiz\n");
  datei("System/geheim.png", "geheim");
  datei(".obsidian/bild.png", "geheim");
  datei("Ausgeschlossen/z.pdf", "geheim");
  datei("CLAUDE.md", "geheim");
  let link = false;
  try {
    fs.symlinkSync(path.join(w, "System", "geheim.png"), path.join(w, "Anhänge", "link.png"));
    link = true;
  } catch (e) { /* ohne Recht auf Links (Windows): dieser Fall fällt weg */ }
  return { w, link };
}

// Attrappe der Programme: pdfinfo (3 Seiten), pdftotext (je Seite ein Text mit Link), pdftoppm (zu groß bis zur Kante 800), ffmpeg
function attrappe() {
  const aufrufe = [];
  const ausfuehren = async (befehl, a) => {
    aufrufe.push({ befehl, a });
    if (befehl === "pdfinfo") return Buffer.from("Title:          Folien\nPages:          3\n");
    if (befehl === "pdftotext") {
      const von = Number(a[a.indexOf("-f") + 1]), bis = Number(a[a.indexOf("-l") + 1]);
      return Buffer.from(Array.from({ length: bis - von + 1 }, (x, i) => `Seite ${von + i}: Formel [hier](https://evil.example/p)`).join("\f") + "\f");
    }
    if (befehl === "pdftoppm") return Buffer.alloc(Number(a[a.indexOf("-scale-to") + 1]) >= 1100 ? 200 * 1024 : 50 * 1024, 1);
    if (befehl === "ffmpeg") return Buffer.alloc(40 * 1024, 2);
    throw new Error("unbekanntes Programm " + befehl);
  };
  return { aufrufe, ausfuehren };
}

async function starten() {
  const { erzeugeMcp } = await laden("mcp.mjs");
  const { tresorOrdner } = await laden("mcp-tresor.mjs");
  const { quelleOrdner } = await laden("mcp-quelle-ordner.mjs");
  const { dateienOrdner } = await laden("mcp-dateien.mjs");
  const { w, link } = tresorAnlegen();
  const p = attrappe();
  const tresor = tresorOrdner(w, { ohne: ["Ausgeschlossen"], jetzt: () => JETZT });
  const quelle = quelleOrdner(tresor, { dateien: dateienOrdner(w, { ohne: ["Ausgeschlossen"], ausfuehren: p.ausfuehren, jetzt: () => JETZT }) });
  const server = erzeugeMcp({ quelle, token: TOKEN, version: "9.9.9", jetzt: () => JETZT });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StreamableHTTPClientTransport } = await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
  const client = new Client({ name: "test", version: "1" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${server.address().port}/mcp`),
    { requestInit: { headers: { authorization: `Bearer ${TOKEN}` } } }));
  const rufen = async (name, a = {}) => {
    const r = await client.callTool({ name, arguments: a });
    return { fehler: r.isError === true, text: r.content[0].text, daten: r.isError ? null : JSON.parse(r.content[0].text), inhalt: r.content };
  };
  return { w, link, aufrufe: p.aufrufe, rufen, zu: async () => { await client.close(); await new Promise((r) => server.close(r)); } };
}

test("Dateien: Pfade nur im Tresor, nie System/, Punkt-Ordner, ausgeschlossene Ordner, CLAUDE.md, Rückwärtsschritte", async () => {
  const { pfadErlaubt } = await laden("mcp-dateien.mjs");
  assert.equal(pfadErlaubt("Anhänge/Tafel.png"), "Anhänge/Tafel.png");
  assert.equal(pfadErlaubt("/Unterlagen/S110/a.pdf"), "Unterlagen/S110/a.pdf");
  assert.equal(pfadErlaubt("Anha\u0308nge/Tafel.png"), "Anhänge/Tafel.png", "NFD wird NFC");
  for (const p of ["", "../x.pdf", "Unterlagen/../System/a.png", "System/a.png", "system/a.png", ".obsidian/a.png", "Unterlagen/.trash/a.pdf",
    "CLAUDE.md", "Ordner/agents.md", "Anhänge\\Tafel.png", "C:/x.pdf", "a\u0000b.pdf", "Ausgeschlossen/z.pdf", "ausgeschlossen/Tief/z.pdf",
    "Unterlagen//a.pdf", "x".repeat(401)]) {
    assert.equal(pfadErlaubt(p, ["Ausgeschlossen"]), "", JSON.stringify(p).slice(0, 40));
  }
});

test("Dateien: dateien_suchen nennt PDFs, Bilder, Textdateien und große Notizen, nie Verbotenes oder Privates", async () => {
  const s = await starten();
  try {
    const alle = (await s.rufen("dateien_suchen")).daten.dateien;
    const pfade = alle.map((d) => d.pfad);
    for (const p of ["Unterlagen/S110/S110 Folien 01.pdf", "Anhänge/Tafel klein.png", "Anhänge/Tafel gross.jpg", "Unterlagen/S110/Uebung 3.R",
      "Unterlagen/S110/Seite.html", "Unterlagen/B110/Vorlage.docx", "Literatur/Lehrbuch (Volltext).md"]) assert.ok(pfade.includes(p), p);
    for (const p of pfade) assert.doesNotMatch(p, /System|\.obsidian|Ausgeschlossen|CLAUDE|Tagebuch|Klein\.md|link\.png/, p);
    const gross = alle.find((d) => d.art === "notiz");
    assert.match(gross.groesse, /MB$/);
    assert.match(gross.hinweis, /zu groß/);
    assert.deepEqual((await s.rufen("dateien_suchen", { name: "s110 folien" })).daten.dateien.map((d) => d.pfad), ["Unterlagen/S110/S110 Folien 01.pdf"]);
    assert.deepEqual((await s.rufen("dateien_suchen", { art: "bild" })).daten.dateien.map((d) => d.pfad).sort(), ["Anhänge/Tafel gross.jpg", "Anhänge/Tafel klein.png"]);
    assert.deepEqual((await s.rufen("dateien_suchen", { ordner: "Unterlagen/B110" })).daten.dateien.map((d) => d.art), ["andere"]);
    assert.equal((await s.rufen("dateien_suchen", { name: "uebung" })).daten.dateien[0].pfad, "Unterlagen/S110/Uebung 3.R", "ae wie ä");
    assert.equal((await s.rufen("dateien_suchen", { art: "zip" })).fehler, true);
  } finally {
    await s.zu();
  }
});

test("Dateien: PDF-Seite als Bild samt gesäubertem Text, verkleinert bis sie passt; ohne Bild mehrere Seiten; Programme nur mit Pfad", async () => {
  const s = await starten();
  try {
    const r = await s.rufen("datei_lesen", { pfad: "Unterlagen/S110/S110 Folien 01.pdf", seite: 2 });
    assert.equal(r.fehler, false);
    assert.equal(r.inhalt.length, 2);
    assert.equal(r.inhalt[1].type, "image");
    assert.equal(r.inhalt[1].mimeType, "image/jpeg");
    assert.equal(Buffer.from(r.inhalt[1].data, "base64").length, 50 * 1024);
    assert.equal(r.daten.seiten_gesamt, 3);
    assert.deepEqual(r.daten.seiten.map((x) => x.seite), [2]);
    assert.doesNotMatch(r.daten.seiten[0].text, /https?:|\]\(/);
    assert.equal(r.daten.weiter_ab, 3);
    assert.deepEqual(s.aufrufe.filter((x) => x.befehl === "pdftoppm").map((x) => x.a[x.a.indexOf("-scale-to") + 1]), ["1400", "1100", "800"]);
    for (const x of s.aufrufe) {
      const datei = x.befehl === "pdftotext" ? x.a[x.a.length - 2] : x.befehl === "ffmpeg" ? x.a[x.a.indexOf("-i") + 1] : x.a[x.a.length - 1];
      assert.ok(path.isAbsolute(datei), `${x.befehl}: ${datei}`);
    }
    const t = await s.rufen("datei_lesen", { pfad: "Unterlagen/S110/S110 Folien 01.pdf", bild: false, seite: 1, bis: 3 });
    assert.equal(t.inhalt.length, 1, "ohne Bild");
    assert.deepEqual(t.daten.seiten.map((x) => x.seite), [1, 2, 3]);
    assert.equal(t.daten.weiter_ab, undefined, "letzte Seite: kein weiter_ab");
    assert.match((await s.rufen("datei_lesen", { pfad: "Unterlagen/S110/S110 Folien 01.pdf", seite: 9 })).text, /hat 3 Seiten/);
    assert.match((await s.rufen("datei_lesen", { pfad: "Unterlagen/S110/S110 Folien 01.pdf", seite: 1, bis: 2 })).text, /nur mit bild: false/);
  } finally {
    await s.zu();
  }
});

test("Dateien: Bilder als Bild (große verkleinert), R und HTML als Text ohne Skripte und Links, anderes nur mit Name", async () => {
  const s = await starten();
  try {
    const klein = await s.rufen("datei_lesen", { pfad: "Anhänge/Tafel klein.png" });
    assert.equal(klein.inhalt[1].mimeType, "image/png");
    assert.equal(Buffer.from(klein.inhalt[1].data, "base64").toString("hex"), "89504e470d0a1a0a0000000d49484452");
    const gross = await s.rufen("datei_lesen", { pfad: "Anhänge/Tafel gross.jpg" });
    assert.equal(gross.inhalt[1].mimeType, "image/jpeg");
    assert.equal(Buffer.from(gross.inhalt[1].data, "base64").length, 40 * 1024);
    assert.match(gross.daten.verkleinert, /1400/);
    assert.match((await s.rufen("datei_lesen", { pfad: "Unterlagen/S110/Uebung 3.R" })).daten.text, /mean\(x\)/);
    const html = (await s.rufen("datei_lesen", { pfad: "Unterlagen/S110/Seite.html" })).daten.text;
    assert.match(html, /Hallo & Link/);
    assert.doesNotMatch(html, /alert|<|evil|https?:/);
    const docx = await s.rufen("datei_lesen", { pfad: "Unterlagen/B110/Vorlage.docx" });
    assert.equal(docx.inhalt.length, 1);
    assert.match(docx.daten.hinweis, /nur Name und Größe/);
  } finally {
    await s.zu();
  }
});

test("Dateien: nichts Verbotenes, Privates, Ausgeschlossenes oder über Links", async () => {
  const s = await starten();
  try {
    const nein = ["System/geheim.png", ".obsidian/bild.png", "Ausgeschlossen/z.pdf", "CLAUDE.md", "Literatur/Tagebuch gross.md", "../geheim.png",
      "Anhänge\\Tafel klein.png", "Anhänge", "Anhänge/fehlt.png", "/etc/passwd"];
    if (s.link) nein.push("Anhänge/link.png");
    for (const p of nein) {
      const r = await s.rufen("datei_lesen", { pfad: p });
      assert.equal(r.fehler, true, p);
      assert.doesNotMatch(r.text, /geheim|Lorem/, p);
    }
    assert.equal(s.aufrufe.length, 0, "kein Programm für Abgelehntes");
  } finally {
    await s.zu();
  }
});

test("Dateien: große Notiz langsam gesucht, ab der Stelle gelesen, ganz in Teilen; notiz_lesen sagt, dass sie zu groß ist", async () => {
  const s = await starten();
  try {
    const pfad = "Literatur/Lehrbuch (Volltext).md";
    const such = (await s.rufen("notizen_suchen", { frage: WORT.toLowerCase() })).daten;
    assert.equal(such.grosse_notizen.length, 1, "nur die eigene große Notiz, nicht die private");
    assert.equal(such.grosse_notizen[0].notiz, pfad);
    assert.match(such.grosse_notizen[0].stellen[0].auszug, new RegExp(WORT));
    const ab = such.grosse_notizen[0].stellen[0].ab;
    assert.ok(ab > 1024 * 1024);
    assert.match((await s.rufen("datei_lesen", { pfad, ab })).daten.text, new RegExp(WORT));
    assert.match((await s.rufen("notiz_lesen", { pfad: "Lehrbuch (Volltext)" })).text, /zu groß für den Index.*datei_lesen/);
    assert.match((await s.rufen("notiz_lesen", { pfad: "Literatur/Tagebuch gross.md" })).text, /^Keine Notiz/, "privat bleibt unbekannt");
    // ganz in Teilen: nichts fehlt, nichts doppelt
    const teile = [];
    let weiter = 0;
    while (weiter != null && teile.length < 200) {
      const d = (await s.rufen("datei_lesen", { pfad, ab: weiter })).daten;
      assert.ok(d.text.length <= 30000);
      teile.push(d.text);
      weiter = d.weiter_ab;
    }
    assert.equal(weiter, undefined);
    const ganz = fs.readFileSync(path.join(s.w, "Literatur", "Lehrbuch (Volltext).md"), "utf8");
    assert.equal(teile.join("").replace(/\s+/g, ""), ganz.replace(/\s+/g, ""));
  } finally {
    await s.zu();
  }
});

test("Dateien: Teile schneiden nie ein UTF-8-Zeichen, auch wenn ab mitten in einem steht", async () => {
  const { dateienOrdner } = await laden("mcp-dateien.mjs");
  const w = fs.mkdtempSync(path.join(os.tmpdir(), "studium-mcp-utf8-"));
  fs.writeFileSync(path.join(w, "Text.txt"), "äöü€😀".repeat(30000));
  const d = dateienOrdner(w, { ausfuehren: async () => { throw new Error("nicht gebraucht"); } });
  for (const ab of [0, 1, 2, 3, 5, 7]) {
    const r = await d.lesen("Text.txt", { ab });
    assert.doesNotMatch(r.daten.text, /\uFFFD/, `ab ${ab}`);
  }
});
