// Tests für die App des Connectors (server/mcp-app.mjs): ueberblick mit Verweis auf die Ansicht, die Ansicht als Ressource
// (text/html;profile=mcp-app) und die Daten für sie; ohne app: true bleibt alles wie vorher.
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const assert = require("node:assert/strict");

const SERVER = path.join(__dirname, "..", "server");
const da = fs.existsSync(path.join(SERVER, "mcp-app.mjs"));
const test = (name, f) => require("node:test")(name, { skip: !da && "server/mcp-app.mjs fehlt in diesem Baum" }, f);
const laden = (datei) => import(pathToFileURL(path.join(SERVER, datei)).href);
const TOKEN = "t".repeat(40);
const JETZT = new Date("2026-11-04T09:00:00Z");

const freierPort = () => new Promise((ok) => {
  const s = net.createServer().listen(0, "127.0.0.1", () => {
    const { port } = s.address();
    s.close(() => ok(port));
  });
});

async function starten(app) {
  const { erzeugeMcp } = await laden("mcp.mjs");
  const { tresorOrdner } = await laden("mcp-tresor.mjs");
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), "studium-mcp-app-"));
  fs.mkdirSync(path.join(wurzel, "Termine"));
  fs.writeFileSync(path.join(wurzel, "Termine", "2026-11-05 Vortrag.md"),
    "---\ntyp: termin\ntitel: Vortrag\ndatum: 2026-11-05\nkategorie: Veranstaltung\nort: \"18:15 · online\"\n---\n");
  const protokoll = [];
  const server = erzeugeMcp({ tresor: tresorOrdner(wurzel, { jetzt: () => JETZT }), token: TOKEN, app, jetzt: () => JETZT,
    protokoll: (z) => protokoll.push(z) });
  const port = await freierPort();
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StreamableHTTPClientTransport } = await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
  const client = new Client({ name: "test", version: "1" }, { capabilities: { extensions: { "io.modelcontextprotocol/ui": { mimeTypes: ["text/html;profile=mcp-app"] } } } });
  await client.connect(new StreamableHTTPClientTransport(new URL(`http://127.0.0.1:${port}/mcp`), { requestInit: { headers: { authorization: `Bearer ${TOKEN}` } } }));
  return { client, protokoll, schliessen: async () => { await client.close(); await new Promise((r) => server.close(r)); } };
}

test("App: ueberblick verweist auf die Ansicht und gibt ihr nur, was sie zeichnet; kein zweites Werkzeug", async () => {
  const { APP_URI, APP_MIME } = await laden("mcp-app.mjs");
  const s = await starten(true);
  try {
    const { tools } = await s.client.listTools();
    assert.equal(tools.length, 12, "kein eigenes Werkzeug für die Ansicht");
    const werkzeug = tools.find((t) => t.name === "ueberblick");
    assert.equal(werkzeug._meta.ui.resourceUri, APP_URI);
    assert.equal(werkzeug.annotations.readOnlyHint, true);
    const { resources } = await s.client.listResources();
    assert.deepEqual(resources.map((r) => [r.uri, r.mimeType]), [[APP_URI, APP_MIME]]);
    const { contents } = await s.client.readResource({ uri: APP_URI });
    assert.equal(contents[0].mimeType, APP_MIME);
    const html = contents[0].text;
    assert.match(html, /^<!doctype html>/i);
    assert.match(html, /ui\/initialize/);
    assert.match(html, /ui\/notifications\/initialized/);
    assert.doesNotMatch(html, /https?:\/\//, "keine fremden Adressen: die Ansicht lädt nichts nach");
    assert.doesNotMatch(html, /innerHTML|insertAdjacentHTML|document\.write|eval\(/, "Daten nur als Text ins DOM");
    await assert.rejects(s.client.readResource({ uri: "ui://studium-autopilot/anders.html" }));

    const r = await s.client.callTool({ name: "ueberblick", arguments: { von: "2026-11-02", tage: 7 } });
    assert.equal(r.isError, false);
    assert.deepEqual(Object.keys(r.structuredContent), ["ansicht"], "die Daten nicht ein zweites Mal");
    const { ansicht } = r.structuredContent;
    assert.ok(JSON.parse(r.content[0].text).termine.some((t) => t.titel === "Vortrag"), "das Modell bekommt die Daten als Text");
    assert.equal(ansicht.titel, "Woche 02.11.–08.11.");
    assert.deepEqual(ansicht.tage.map((t) => t.heute), [false, false, true, false, false, false, false], "heute in Europe/Berlin");
    assert.deepEqual(ansicht.tage[3].eintraege.map((e) => [e.zeit, e.titel]), [["18:15", "Vortrag"]]);
    const falsch = await s.client.callTool({ name: "ueberblick", arguments: { von: "gestern" } });
    assert.equal(falsch.isError, true);
    assert.equal(falsch.structuredContent, undefined);
    assert.ok(s.protokoll.some((z) => /^initialize .*ui: ja/.test(z)), "ob der Client Ansichten zeigen kann, steht im Journal");
  } finally {
    await s.schliessen();
  }
});

test("App: je Tag eine Liste nach Uhrzeit, ganztägige und Fristen zuerst, To-dos zuletzt", async () => {
  const { ansichtVon } = await laden("mcp-app.mjs");
  // Montag wie am 02.11.2026 auf dem iPad gesehen: Termine kamen nach der Lehre, „ab 20:15“ vor 18:15
  const a = ansichtVon({
    zeitraum: { von: "2026-11-02", bis: "2026-11-03" },
    tage: [
      { datum: "2026-11-02", tag: "Montag", lehre: [{ titel: "BWL", beginn: "14:15", ende: "15:45", raum: "HS 25" },
        { titel: "Datenanalyse", beginn: "08:15", ende: "09:45", raum: "HS 25" }, { titel: "Mathe", beginn: "10:15", ende: "11:45", faellt_aus: true }] },
      { datum: "2026-11-03", tag: "Dienstag" },
    ],
    termine: [
      { titel: "Fachschaftssitzung", datum: "2026-11-02", uhrzeit: "ab 20:15", ort: "E02" },
      { titel: "Online-Talk", datum: "2026-11-02", uhrzeit: "18:15–19:15", ort: "online" },
      { titel: "Bewerbungsfrist", datum: "2026-11-02", bis: "2026-11-03", kategorie: "Frist", ort: "online" },
    ],
    todos: { eintraege: [{ text: "Blatt lösen", frist: "2026-11-02" }], weitere: 3 },
    stand: { tresor: "01.11.2026, 06:43 (vor 1 Tag)", abgeglichen: "02.11.2026, 08:45 (vor 2 Minuten)" },
  }, "2026-11-02");
  assert.deepEqual(a.tage[0].eintraege.map((e) => e.zeit), ["", "08:15–09:45", "10:15–11:45", "14:15–15:45", "18:15–19:15", "ab 20:15", "To-do"]);
  assert.deepEqual(a.tage[0].eintraege[0], { zeit: "", titel: "Bewerbungsfrist", ort: "online", aus: false, hinweis: "bis 03.11." });
  assert.deepEqual([a.tage[0].eintraege[2].aus, a.tage[0].eintraege[2].hinweis], [true, "fällt aus"]);
  assert.deepEqual(a.tage[1].eintraege.map((e) => [e.zeit, e.hinweis]), [["Frist", "endet heute"]]);
  assert.deepEqual([a.tage[0].name, a.tage[0].heute, a.tage[1].heute], ["Mo 02.11.", true, false]);
  assert.equal(a.stand, "Abgeglichen 02.11.2026, 08:45 (vor 2 Minuten)");
});

test("App: ohne app: true kein Verweis auf die Ansicht, keine Ressourcen", async () => {
  const s = await starten(false);
  try {
    const { tools } = await s.client.listTools();
    assert.equal(tools.find((t) => t.name === "ueberblick")._meta, undefined);
    const r = await s.client.callTool({ name: "ueberblick", arguments: {} });
    assert.equal(r.structuredContent, undefined);
    await assert.rejects(s.client.listResources());
  } finally {
    await s.schliessen();
  }
});
