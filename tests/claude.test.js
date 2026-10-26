// Claude ohne Server (claude.js): Form des Schlüssels, Verbinden (auch mit einem Schlüssel ohne Workspace), Anfrage nach den
// Regeln der API (Structured Outputs, PDF vor dem Text, keine Sampling-Parameter), Datenstrom lesen, Fehler je Fall, Rückfall
// auf den Text, Verbrauch und Zeile, dazu der Knopf im PDF-Kasten bis in die Notiz (mit den Begleitnotiz-Helfern aus server.js).
// Netz, Schlüsselbund und Speicher sind Attrappen; läuft ohne Obsidian und ohne Guthaben bei Anthropic.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { laden } = require("./laden.js");

const C = laden("claude").ctx.claude;
const Z = laden("zentral", { heute: "2026-10-24" }).ctx.zentral;
const S = laden("server", { heute: "2026-10-24", kontext: { zentral: Z } }).ctx.server;
// Zur Laufzeit gebaut: pruefen.py meldet Schlüssel, die so im Quelltext stehen
const SCHLUESSEL = "sk-ant-api03-" + "A1b2_C3d4-".repeat(9) + "AA";
const JETZT = new Date("2026-10-24T10:00:00");

// ---------- Attrappen ----------
// Server-Sent Events wie von /v1/messages mit stream: true
const strom = (...ereignisse) => ereignisse.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n`).join("\n");
const BN = {
  lesbar: true,
  wichtigste: [{ begriff: "Deckungsbeitrag", text: "Erlös minus variable Kosten.", seite: 7, bis: null }, { begriff: "Organisation", text: "Klausur 60 Minuten.", seite: null, bis: null }],
  zu_tun: [{ text: "Aufgabe 2.3 vorbereiten", frist: "2026-10-29", seite: 9, bis: 10 }],
  fragen: [],
};
// Antwort mit Denken und JSON in zwei Stücken; 10 000 Token Eingabe, 2000 Ausgabe → 0,04 $ + 0,04 $
const antwort = (j, o) => {
  const text = JSON.stringify(j === undefined ? BN : j);
  return strom(
    { type: "message_start", message: { usage: { input_tokens: 10000, output_tokens: 1 } } },
    { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } },
    { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "Ich lese die Folien." } },
    { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "abc" } },
    { type: "content_block_start", index: 1, content_block: { type: "text", text: "" } },
    { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: text.slice(0, 20) } },
    { type: "content_block_delta", index: 1, delta: { type: "text_delta", text: text.slice(20) } },
    { type: "message_delta", delta: { stop_reason: (o && o.stop) || "end_turn" }, usage: { output_tokens: 2000 } },
    { type: "message_stop" });
};
const fehler = (status, message, extra) => ({ status, text: JSON.stringify({ type: "error", error: Object.assign({ type: "invalid_request_error", message }, extra) }) });
const OK = { status: 200, text: JSON.stringify({ data: [{ id: "claude-opus-5-5", type: "model" }] }) };
const GUTHABEN = "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.";
const OHNE_WS = "This API key is not scoped to a workspace. Please provide the anthropic-workspace-id header.";

// Ablauf mit Attrappen; antworten: Liste je Anfrage ({ status, text } oder Funktion), leer → kein Netz
const motor = (antworten, o) => {
  const anfragen = [], speicher = {}, geheim = new Map();
  const uhr = { jetzt: (o && o.jetzt) || JETZT };
  const m = C.erzeugen({
    netz: async (a) => {
      anfragen.push(a);
      const r = antworten.shift();
      if (!r) throw new Error("kein Netz");
      return typeof r === "function" ? r(a) : r;
    },
    geheim: (o && o.geheim) || { lesen: (id) => geheim.get(id) || null, schreiben: async (id, w) => { geheim.set(id, w); }, loeschen: async (id) => { geheim.delete(id); } },
    geheimId: () => "studium-autopilot-claude-test",
    lokal: (k, v) => { if (v === undefined) return Object.prototype.hasOwnProperty.call(speicher, k) ? speicher[k] : null; speicher[k] = v; return v; },
    jetzt: () => uhr.jetzt,
  });
  return { m, anfragen, speicher, geheim, uhr };
};
const verbunden = async (antworten, o) => {
  const x = motor([OK].concat(antworten), o);
  assert.deepEqual(await x.m.verbinden(SCHLUESSEL), { ok: true });
  x.anfragen.length = 0;
  return x;
};
const U = { titel: "Folien 02 · Kosten", code: "B110", art: "Folien", seiten: 12, heute: "2026-10-24", text: "[S. 1]\nKosten und Erlöse", pdf: "JVBERi0=" };

// ---------- Schlüssel ----------
test("Schlüssel: Leerraum vom Kopieren fällt weg, Abo-Token und Admin-Schlüssel werden mit Grund abgelehnt", () => {
  assert.equal(C.schluesselNormal(` ${SCHLUESSEL.slice(0, 30)}\n${SCHLUESSEL.slice(30)} \t`), SCHLUESSEL);
  assert.equal(C.schluesselNormal(null), "");
  assert.equal(C.schluesselFehler(SCHLUESSEL), "");
  assert.equal(C.schluesselFehler(""), "Bitte füg deinen API-Schlüssel ein.");
  assert.match(C.schluesselFehler("sk-ant-oat01-" + "x".repeat(60)), /Claude-Abo.*nur in Claude selbst/);
  assert.match(C.schluesselFehler("sk-ant-admin01-" + "x".repeat(60)), /Admin-Schlüssel/);
  assert.match(C.schluesselFehler("sk-proj-" + "x".repeat(60)), /beginnt mit sk-ant-/);
  assert.match(C.schluesselFehler("sk-ant-api03-kurz"), /beginnt mit sk-ant-/);
  assert.match(C.schluesselFehler(SCHLUESSEL + "ä"), /beginnt mit sk-ant-/);
});

test("Verbinden: Form zuerst ohne Netz, dann GET /v1/models; gespeichert wird nur ein angenommener Schlüssel", async () => {
  let x = motor([]);
  assert.deepEqual(await x.m.verbinden("sk-ant-oat01-" + "x".repeat(60)), { ok: false, fehler: C.schluesselFehler("sk-ant-oat01-" + "x".repeat(60)) });
  assert.equal(x.anfragen.length, 0, "falsche Form: keine Anfrage");

  x = motor([fehler(401, "invalid x-api-key", { type: "authentication_error" })]);
  assert.deepEqual(await x.m.verbinden(SCHLUESSEL), { ok: false, fehler: "Anthropic kennt diesen Schlüssel nicht. Bitte ihn noch einmal ganz kopieren." });
  assert.equal(x.geheim.size, 0);
  assert.equal(x.m.verbunden(), false);

  x = motor([]);
  assert.deepEqual(await x.m.verbinden(SCHLUESSEL), { ok: false, fehler: "Anthropic ist gerade nicht erreichbar. Bitte die Internetverbindung prüfen." });

  x = motor([OK]);
  x.speicher["eba-claude-problem"] = "schluessel";
  assert.deepEqual(await x.m.verbinden(" " + SCHLUESSEL + "\n"), { ok: true });
  const a = x.anfragen[0];
  assert.equal(a.url, "https://api.anthropic.com/v1/models?limit=1");
  assert.equal(a.method, "GET");
  assert.deepEqual(a.headers, { "x-api-key": SCHLUESSEL, "anthropic-version": "2026-10-21" }, "GET ohne content-type, ohne Workspace");
  assert.equal(a.body, undefined);
  assert.deepEqual(JSON.parse(x.geheim.get("studium-autopilot-claude-test")), { schluessel: SCHLUESSEL, workspace: "" });
  assert.equal(x.speicher["eba-claude-problem"], null, "neu verbunden: altes Problem vergessen");
  assert.equal(x.m.verbunden(), true);

  // Obsidian ohne Schlüsselbund (app.secretStorage fehlt)
  x = motor([OK], { geheim: { lesen: () => null, schreiben: async () => { throw new Error("kein Schlüsselbund"); }, loeschen: async () => {} } });
  assert.deepEqual(await x.m.verbinden(SCHLUESSEL), { ok: false, fehler: "Dieses Obsidian hat noch keinen Schlüsselbund. Bitte Obsidian aktualisieren." });
});

test("Verbinden ohne Workspace: der einzige Workspace oder der Default Workspace, sonst ein Satz, was zu tun ist", async () => {
  const ws = (...l) => ({ status: 200, text: JSON.stringify({ data: l }) });
  let x = motor([fehler(400, OHNE_WS), ws({ id: "wrkspc_alt", name: "Alt", archived_at: "2026-01-01T00:00:00Z" }, { id: "wrkspc_01Abc", name: "Studium" }), OK]);
  assert.deepEqual(await x.m.verbinden(SCHLUESSEL), { ok: true });
  assert.equal(x.anfragen[1].url, "https://api.anthropic.com/v1/organizations/workspaces?include_default=true&limit=100");
  assert.equal(x.anfragen[2].headers["anthropic-workspace-id"], "wrkspc_01Abc", "archivierte zählen nicht");
  assert.deepEqual(JSON.parse(x.geheim.get("studium-autopilot-claude-test")), { schluessel: SCHLUESSEL, workspace: "wrkspc_01Abc" });

  x = motor([fehler(400, OHNE_WS), ws({ id: "wrkspc_a", name: "Arbeit" }, { id: "wrkspc_d", name: "Default" }), OK]);
  assert.deepEqual(await x.m.verbinden(SCHLUESSEL), { ok: true });
  assert.equal(JSON.parse(x.geheim.get("studium-autopilot-claude-test")).workspace, "wrkspc_d");

  x = motor([fehler(400, OHNE_WS), ws({ id: "wrkspc_a", name: "Arbeit" }, { id: "wrkspc_b", name: "Studium" }, { id: "nicht-so<b>", name: "Default" })]);
  assert.deepEqual(await x.m.verbinden(SCHLUESSEL), { ok: false, fehler: "Dieser Schlüssel gehört zu keinem Workspace. Bitte in der Console einen Schlüssel in einem Workspace anlegen." });
  assert.equal(x.geheim.size, 0);
});

// ---------- Anfrage ----------
test("Anfrage: Opus 5.5 im Datenstrom, Denken adaptiv und zusammengefasst, JSON-Schema, PDF als Dokument vor dem Text", () => {
  const a = C.anfrageBauen(U);
  assert.equal(a.model, "claude-opus-5-5");
  assert.equal(a.stream, true);
  assert.equal(a.max_tokens, 16000);
  assert.equal(a.system, C.SYSTEM);
  assert.deepEqual(a.thinking, { type: "adaptive", display: "summarized" });
  assert.deepEqual(a.output_config, { effort: "medium", format: { type: "json_schema", schema: C.SCHEMA } });
  for (const k of ["temperature", "top_p", "top_k", "budget_tokens"]) assert.ok(!(k in a), k + " lehnt die API-Version 2026-10-21 ab");
  assert.equal(a.messages.length, 1);
  const [doc, text] = a.messages[0].content;
  assert.deepEqual(doc, { type: "document", source: { type: "base64", media_type: "application/pdf", data: "JVBERi0=" } });
  assert.equal(text.type, "text");
  assert.equal(text.text, "Unterlage: Folien 02 · Kosten\nModul: B110\nArt: Folien\nSeiten: 12\nHeute: 2026-10-24\n\nDie Unterlage ist die PDF oben.");
  assert.ok(!text.text.includes("Kosten und Erlöse"), "mit PDF nicht noch einmal der Text");

  const t = C.anfrageBauen(Object.assign({}, U, { pdf: "", code: "", seiten: 0 }));
  assert.equal(t.messages[0].content.length, 1);
  assert.equal(t.messages[0].content[0].text, "Unterlage: Folien 02 · Kosten\nArt: Folien\nHeute: 2026-10-24\n\nTextfassung der Unterlage:\n<unterlage>\n[S. 1]\nKosten und Erlöse\n</unterlage>");
  const lang = C.anfrageBauen(Object.assign({}, U, { pdf: "", text: "x".repeat(2000100) })).messages[0].content[0].text;
  assert.ok(lang.length < 2000200 && /x\n<\/unterlage>$/.test(lang), "Textfassung gekürzt, der Abschluss bleibt");
});

test("Schema: jedes Objekt geschlossen und ganz Pflicht, höchstens 16 Vereinigungen; die Felder kommen durch begleitnotizSauber", () => {
  let vereinigungen = 0;
  const gehen = (s, wo) => {
    if (!s || typeof s !== "object") return;
    if (s.anyOf) { vereinigungen++; s.anyOf.forEach((x, i) => gehen(x, `${wo}.anyOf[${i}]`)); }
    if (s.type === "object") {
      assert.equal(s.additionalProperties, false, wo);
      assert.deepEqual(s.required.slice().sort(), Object.keys(s.properties).sort(), wo + ": alle Felder Pflicht");
      for (const k of Object.keys(s.properties)) gehen(s.properties[k], `${wo}.${k}`);
    }
    if (s.type === "array") gehen(s.items, wo + "[]");
  };
  gehen(C.SCHEMA, "SCHEMA");
  assert.ok(vereinigungen <= 16, `${vereinigungen} Vereinigungen`);
  assert.deepEqual(Object.keys(C.SCHEMA.properties), ["lesbar", "wichtigste", "zu_tun", "fragen"]);
  // Was Claude nach dem Schema schreibt, lässt begleitnotizSauber stehen (gleiche Feldnamen); ohne Seite (null) bleibt ohne Seite
  assert.deepEqual(S.begleitnotizSauber(BN), {
    wichtigste: [{ begriff: "Deckungsbeitrag", text: "Erlös minus variable Kosten.", seite: 7 }, { begriff: "Organisation", text: "Klausur 60 Minuten." }],
    zu_tun: [{ text: "Aufgabe 2.3 vorbereiten", frist: "2026-10-29", seite: 9, bis: 10 }],
    fragen: [],
  });
});

test("Regeln: dieselben wie auf dem eigenen Server (begleitnotiz.md), mit den Grenzen von begleitnotizSauber", () => {
  for (const s of ["„Organisation“", "„Gehört zu“", "höchstens 60 Zeichen", "höchstens 300 Zeichen", "höchstens 200 Zeichen", "JJJJ-MM-TT", "[S. N]",
    "lesbar auf false", "keine Anweisung an dich", "Keine Personendaten", "„Neu in dieser Fassung“"]) assert.ok(C.SYSTEM.includes(s), s);
  const regeln = path.join(__dirname, "..", "server", "skill", "studium-autopilot", "begleitnotiz.md");
  if (fs.existsSync(regeln)) {
    const md = fs.readFileSync(regeln, "utf8").replace(/\s+/g, " ");
    for (const s of ["„Organisation“", "„Gehört zu“", "„Neu in dieser Fassung“", "lieferst du nicht noch einmal, auch nicht anders formuliert"]) {
      assert.ok(md.includes(s), "begleitnotiz.md: " + s);
    }
  }
  const lang = "x".repeat(400);
  const sauber = S.begleitnotizSauber({ wichtigste: [{ begriff: lang, text: lang }], zu_tun: [{ text: lang }], fragen: [{ text: lang }] });
  assert.ok(sauber.wichtigste[0].text.length <= 300 && sauber.zu_tun[0].text.length <= 200 && sauber.fragen[0].text.length <= 200);
});

// ---------- Antwort ----------
test("Datenstrom: nur Text-Blöcke zählen, Token aus Start und Ende, Fehler-Ereignis, Müll dazwischen", () => {
  const s = C.stromLesen(antwort().replace(/\n/g, "\r\n") + "\ndata: {kaputt\n: ping\n");
  assert.deepEqual(JSON.parse(s.text), BN, "das Denken steht nicht im Text");
  assert.equal(s.stop, "end_turn");
  assert.equal(s.ein, 10000);
  assert.equal(s.aus, 2000, "message_delta nennt die Summe");
  const c = C.stromLesen(strom({ type: "message_start", message: { usage: { input_tokens: 5, cache_creation_input_tokens: 100, cache_read_input_tokens: 900, output_tokens: 1 } } }));
  assert.equal(c.ein, 1005, "Cache zählt als Eingabe");
  assert.deepEqual(C.stromLesen(strom({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } })).fehler, { typ: "overloaded_error", text: "Overloaded" });
  assert.deepEqual(C.stromLesen(null), { text: "", stop: "", ein: 0, aus: 0, fehler: null });
});

test("Antwort lesen: Zusammenfassung mit Kosten; unlesbar, abgelehnt, abgebrochen, kaputt und Fehler im Strom", () => {
  const e = C.ergebnisLesen({ status: 200, text: antwort() });
  assert.equal(e.ok, true);
  assert.equal(e.lesbar, true);
  assert.ok(Math.abs(e.usd - 0.08) < 1e-9, String(e.usd));
  assert.deepEqual(e.bn, { wichtigste: BN.wichtigste, zu_tun: BN.zu_tun, fragen: BN.fragen });
  assert.equal(C.ergebnisLesen({ status: 200, text: antwort(Object.assign({}, BN, { lesbar: false, wichtigste: [] })) }).lesbar, false);
  assert.equal(C.ergebnisLesen({ status: 200, text: antwort(BN, { stop: "refusal" }) }).code, "abgelehnt");
  const lang = C.ergebnisLesen({ status: 200, text: antwort(BN, { stop: "max_tokens" }) });
  assert.equal(lang.code, "lang");
  assert.ok(lang.usd > 0, "abgebrochen kostet trotzdem");
  assert.equal(C.ergebnisLesen({ status: 200, text: strom({ type: "content_block_start", index: 0, content_block: { type: "text" } }, { type: "content_block_delta", index: 0, delta: { type: "text_delta", text: "{halb" } }) }).code, "antwort");
  assert.equal(C.ergebnisLesen({ status: 200, text: strom({ type: "error", error: { type: "overloaded_error", message: "Overloaded" } }) }).code, "warten");
  assert.deepEqual(C.ergebnisLesen(Object.assign({ fehlerText: GUTHABEN }, fehler(400, GUTHABEN))), { ok: false, usd: 0, code: "guthaben", text: "Dein Guthaben bei Anthropic ist aufgebraucht. Du kannst es in der Console aufladen." });
});

test("Fehler: jeder Fall hat einen Code und höchstens zwei Sätze ohne Fachwörter", () => {
  const F = (status, fehlerText, fehlerCode) => C.fehlerSatz({ status, fehlerText: fehlerText || "", fehlerCode: fehlerCode || "" });
  const faelle = [
    [F(0), "netz"],
    [F(401, "invalid x-api-key"), "schluessel"],
    [F(403, "permission"), "recht"],
    [F(400, GUTHABEN), "guthaben"],
    [F(400, "You have reached your specified API usage limits. You will regain access on 2026-11-01 at 00:00 UTC."), "limit"],
    [F(400, "You have reached your specified workspace API usage limits."), "limit"],
    [F(429, "This request would exceed your organization's monthly spend limit.", "enforced_spend_limit_reached"), "limit"],
    [F(400, OHNE_WS), "workspace"],
    [F(429, "This request would exceed the rate limit for your organization of 30,000 input tokens per minute."), "minute"],
    [F(429, "Number of request tokens has exceeded your per-minute rate limit"), "warten"],
    [F(529, "Overloaded"), "warten"],
    [F(500, "Internal server error"), "warten"],
    [F(413, "Request exceeds the maximum allowed number of bytes."), "gross"],
    [F(404, "model: claude-opus-5-5"), "modell"],
    [F(400, "messages.0.content.0: unknown field"), "anfrage"],
  ];
  for (const [f, code] of faelle) {
    assert.equal(f.code, code, f.text);
    assert.ok(!/\n|Credits|Vault|Zugangsdaten|Kennwort/.test(f.text), f.text);
    assert.ok((f.text.match(/[.!?](?:\s|$)/g) || []).length <= 2, f.text);
  }
  assert.equal(C.fehlerSatz({ status: 401 }, true).text, "Anthropic kennt diesen Schlüssel nicht. Bitte ihn noch einmal ganz kopieren.");
  assert.equal(F(400, "kaputt").text, "Anthropic hat die Anfrage abgelehnt (Fehler 400). Bitte es noch einmal versuchen.");
});

// ---------- Zusammenfassen ----------
test("Zusammenfassen: POST /v1/messages mit JSON, Kosten im Monat auf diesem Gerät, ohne Schlüssel keine Anfrage", async () => {
  let x = motor([]);
  assert.equal((await x.m.zusammenfassen(U)).code, "schluessel");
  assert.equal(x.anfragen.length, 0);

  x = await verbunden([{ status: 200, text: antwort() }]);
  const e = await x.m.zusammenfassen(U);
  assert.equal(e.ok, true);
  const a = x.anfragen[0];
  assert.equal(a.url, "https://api.anthropic.com/v1/messages");
  assert.equal(a.method, "POST");
  assert.deepEqual(a.headers, { "x-api-key": SCHLUESSEL, "anthropic-version": "2026-10-21", "content-type": "application/json" });
  assert.deepEqual(JSON.parse(a.body), C.anfrageBauen(U));
  assert.deepEqual(x.m.verbrauch(), { monat: "2026-10", anzahl: 1, usd: 0.08 });
  // abgebrochen: Kosten ja, Zusammenfassung nein
  x = await verbunden([{ status: 200, text: antwort() }, { status: 200, text: antwort(BN, { stop: "max_tokens" }) }]);
  await x.m.zusammenfassen(U);
  await x.m.zusammenfassen(U);
  assert.deepEqual(x.m.verbrauch(), { monat: "2026-10", anzahl: 1, usd: 0.16 });
  // neuer Monat: neu gezählt
  x.uhr.jetzt = new Date("2026-11-01T08:00:00");
  assert.deepEqual(x.m.verbrauch(), { monat: "2026-11", anzahl: 0, usd: 0 });
});

test("Zusammenfassen: lehnt Anthropic die PDF ab, geht dieselbe Anfrage einmal nur mit dem Text", async () => {
  for (const abgelehnt of [fehler(413, "Request too large"), fehler(429, "This request would exceed the rate limit for your organization of 30,000 input tokens per minute.", { type: "rate_limit_error" }),
    fehler(400, "The PDF specified was not valid.")]) {
    const x = await verbunden([abgelehnt, { status: 200, text: antwort() }]);
    const e = await x.m.zusammenfassen(U);
    assert.equal(e.ok, true, abgelehnt.text);
    assert.equal(e.nurText, true);
    assert.equal(x.anfragen.length, 2);
    assert.equal(JSON.parse(x.anfragen[0].body).messages[0].content[0].type, "document");
    assert.deepEqual(JSON.parse(x.anfragen[1].body), C.anfrageBauen(Object.assign({}, U, { pdf: "" })));
  }
  // kein Text da, oder der Fehler hat nichts mit der PDF zu tun: kein zweiter Versuch
  let x = await verbunden([fehler(413, "Request too large")]);
  assert.equal((await x.m.zusammenfassen(Object.assign({}, U, { text: "" }))).code, "gross");
  assert.equal(x.anfragen.length, 1);
  x = await verbunden([fehler(400, GUTHABEN)]);
  assert.equal((await x.m.zusammenfassen(U)).code, "guthaben");
  assert.equal(x.anfragen.length, 1);
});

test("Zeile: nicht verbunden, verbunden, Verbrauch, Guthaben leer und Schlüssel abgelehnt bis zum nächsten Erfolg, Trennen", async () => {
  const MEHR = { aktion: "verbinden", text: "Mehr erfahren", parameter: { id: "claude" } };
  let x = motor([]);
  assert.deepEqual(x.m.zeile(), { text: "Für Fortgeschrittene: Mit einem eigenen API-Schlüssel kostet jede Zusammenfassung extra.", symbol: "extern", pille: "", knopf: MEHR, link: null });

  x = await verbunden([fehler(400, GUTHABEN), { status: 200, text: antwort() }, fehler(401, "invalid x-api-key", { type: "authentication_error" })]);
  assert.deepEqual(x.m.zeile(), { text: "Tipp im PDF-Kasten einer Unterlage auf „Zusammenfassen“.", symbol: "haken", pille: "an", knopf: null, link: MEHR });

  await x.m.zusammenfassen(U);
  assert.deepEqual(x.m.zeile(), { text: "Dein Guthaben bei Anthropic ist aufgebraucht.", symbol: "warnung", pille: "",
    knopf: { href: "https://platform.claude.com/settings/billing", text: "Guthaben aufladen" }, link: MEHR });
  assert.equal(x.m.status().problem, "guthaben");

  await x.m.zusammenfassen(U);
  assert.deepEqual(x.m.zeile(), { text: "Diesen Monat auf diesem Gerät 1 Zusammenfassung für etwa 0,08 $.", symbol: "haken", pille: "an", knopf: null, link: MEHR });

  await x.m.zusammenfassen(U);
  assert.deepEqual(x.m.zeile(), { text: "Anthropic nimmt deinen API-Schlüssel nicht mehr an.", symbol: "warnung", pille: "pruefen",
    knopf: { aktion: "verbinden", text: "Verbinden", cta: true, parameter: { id: "claude" } }, link: null });

  await x.m.trennen();
  assert.equal(x.m.verbunden(), false);
  assert.equal(x.m.status().problem, "");
  assert.equal(x.m.zeile().symbol, "extern");
});

test("Kosten: grob geschätzt, mit PDF teurer, ohne Textfassung zählt der Text der Seiten; mit Komma geschrieben", () => {
  assert.equal(C.kostenText(0.004), "weniger als 1 Cent");
  assert.equal(C.kostenText(0.137), "etwa 0,14 $");
  assert.equal(C.kostenText(2), "etwa 2,00 $");
  assert.ok(C.kostenSchaetzen(40, 60000, true) > C.kostenSchaetzen(40, 60000, false));
  assert.equal(C.kostenSchaetzen(100, 0, true), C.kostenSchaetzen(100, 100 * 1500 * 3.5, true));
  assert.ok(C.kostenSchaetzen(2, 3000, true) < 0.5, "kurze Folien: keine Rückfrage");
  assert.ok(C.kostenSchaetzen(300, 600000, true) > 0.5, "dickes Skript mit PDF: erst fragen");
});

test("Base64 in Stücken wie Buffer, auch über die Stückgrenze", () => {
  const b = new Uint8Array(0x8000 * 2 + 7);
  for (let i = 0; i < b.length; i++) b[i] = (i * 31 + 7) & 255;
  assert.equal(C.base64(b), Buffer.from(b).toString("base64"));
  assert.equal(C.base64(new Uint8Array(0)), "");
});

// ---------- PDF-Kasten bis in die Notiz ----------
const NOTIZ = "Unterlagen/B110/B110 Folien 02 Kosten.md";
const PDF = "Unterlagen/B110/B110 Folien 02 Kosten.pdf";
const VOLLTEXT = "Unterlagen/_Volltext/B110 Folien 02 Kosten.md";
const KOPF = "---\ntyp: unterlage\ncode: \"B110\"\nart: Folien\n---\n\n# B110 · Folien 02 · Kosten\n\n";
const KASTEN = "> [!eba-pdf]- PDF (2 Seiten)\n> ![[B110 Folien 02 Kosten.pdf#height=560]]\n";
// Plugin-Seite mit Tresor im Speicher; o: { netz(a) antwortet auf requestUrl, fm (Eigenschaften der Notiz), verbunden, text (der
// Notiz), vfm (Eigenschaften der Textfassung; Größe wie die PDF = aktuell), extern (ILIAS-Dateien kommen von außen) }.
// zugang.an: ein Schlüssel liegt im Schlüsselbund (unter der Kennung je Tresor, die claude.js bildet)
const knopf = (o) => {
  const hinweise = [], anfragen = [], speicher = new Map(), zugang = { an: !!o.verbunden };
  const dateien = new Map([[NOTIZ, o.text || KOPF + KASTEN], [VOLLTEXT, "---\ntyp: volltext\n---\n\n> [!eba-quelle]- [[x.pdf#page=1|S. 1]]\n> Kosten und Erlöse\n"]]);
  const pdf = { path: PDF, name: "B110 Folien 02 Kosten.pdf", stat: { size: 9 } };
  const r = laden("claude", {
    notizen: { [NOTIZ]: Object.assign({ typ: "unterlage", code: "B110", art: "Folien", titel: "Folien 02 · Kosten" }, o.fm) },
    kontext: {
      obsidian: { requestUrl: async (a) => { anfragen.push(a); return o.netz(a); } },
      hinweis: (text, h) => { hinweise.push({ text, h }); return { hide() { hinweise.push({ text: "(weg)" }); } }; },
      // Begleitnotiz-Helfer echt aus server.js, Tresor-Zugriffe als Attrappe
      server: { begleitnotizSauber: S.begleitnotizSauber, begleitnotizErgaenzen: S.begleitnotizErgaenzen, wunschWeg: S.wunschWeg, ARTEN_SENDEN: S.ARTEN_SENDEN,
        volltextText: S.volltextText, pdfZurNotiz: () => pdf, volltexte: () => ({ [PDF]: { f: { path: VOLLTEXT }, fm: o.vfm || { seiten: 2, groesse: 9 } } }),
        fassungExtern: () => !!o.extern,
        wahl: async () => { throw new Error("keine Rückfrage erwartet"); } },
    },
  });
  const app = r.ctx.app;
  app.secretStorage = {
    getSecret: (id) => (zugang.an && id.indexOf("studium-autopilot-claude-") === 0 ? JSON.stringify({ schluessel: SCHLUESSEL, workspace: "" }) : null),
    setSecret: async () => {},
  };
  app.loadLocalStorage = (k) => (speicher.has(k) ? speicher.get(k) : null);
  app.saveLocalStorage = (k, v) => { speicher.set(k, v); };
  app.vault.cachedRead = async (f) => dateien.get(f.path);
  app.vault.readBinary = async () => new TextEncoder().encode("%PDF-1.4\n").buffer;
  app.vault.process = async (f, fn) => { dateien.set(f.path, fn(dateien.get(f.path))); };
  return { C2: r.ctx.claude, hinweise, anfragen, dateien, zugang };
};

test("PDF-Kasten: Knopf nur verbunden und bei Lehrmaterial ohne „Das Wichtigste“; danach steht die Zusammenfassung in der Notiz", async () => {
  let stand = "";
  const k = knopf({ netz: async () => { stand = await k.C2.zusammenfassenStand(NOTIZ); return { status: 200, text: antwort() }; } });
  assert.equal(await k.C2.zusammenfassenStand(NOTIZ), "", "nicht verbunden: kein Knopf");
  k.zugang.an = true;
  assert.equal(await k.C2.zusammenfassenStand(NOTIZ), "frei");

  let gewartet = 0;
  assert.equal(await k.C2.zusammenfassen(NOTIZ, () => { gewartet++; }), true);
  assert.equal(gewartet, 1);
  assert.equal(stand, "angefordert", "während Claude arbeitet");
  const a = k.anfragen[0];
  assert.equal(a.url, "https://api.anthropic.com/v1/messages");
  assert.equal(a.contentType, "application/json");
  assert.equal(a.throw, false);
  const body = JSON.parse(a.body);
  assert.deepEqual(body.messages[0].content[0].source, { type: "base64", media_type: "application/pdf", data: Buffer.from("%PDF-1.4\n").toString("base64") });
  assert.match(body.messages[0].content[1].text, /^Unterlage: Folien 02 · Kosten\nModul: B110\nArt: Folien\nSeiten: 2\nHeute: \d{4}-\d{2}-\d{2}\n/);
  assert.equal(k.dateien.get(NOTIZ), KOPF +
    "## Das Wichtigste\n- **Deckungsbeitrag:** Erlös minus variable Kosten. → [[B110 Folien 02 Kosten.pdf#page=7|S. 7]]\n- **Organisation:** Klausur 60 Minuten.\n\n" +
    "## Zu tun\n- [ ] Aufgabe 2.3 vorbereiten (bis 29.10.) → [[B110 Folien 02 Kosten.pdf#page=9|S. 9–10]]\n\n" + KASTEN);
  assert.deepEqual(k.hinweise.map((h) => h.text), ["Fasse die Unterlage mit Claude zusammen …", "(weg)", "Zusammenfassung fertig, für etwa 0,08 $ von deinem Guthaben."]);
  assert.equal(k.hinweise[0].h.dauer, 0, "Fortschritt bleibt, bis er fertig ist");
  assert.equal(await k.C2.zusammenfassenStand(NOTIZ), "", "„Das Wichtigste“ steht: kein Knopf mehr");
});

test("Neue Fassung: beim Öffnen von selbst neu zusammengefasst, mit der früheren als Material; die frühere steht eingeklappt darunter", async () => {
  const frueher = "## Das Wichtigste (frühere Fassung, bis 16.10.2026)\n- **Kosten:** Alt. → [[B110 Folien 02 Kosten.pdf#page=1|S. 1]]\n\n" +
    "## Zu tun\n- [x] Blatt 1 abgeben\n\n";
  const k = knopf({ verbunden: true, text: KOPF + frueher + KASTEN, vfm: { seiten: 2, groesse: 9, vorher_sha256: "a".repeat(64), geaendert: "2" },
    netz: async () => ({ status: 200, text: antwort() }) });
  assert.equal(await k.C2.zusammenfassenStand(NOTIZ), "nachfuehren");
  assert.equal(await k.C2.zusammenfassen(NOTIZ, null, { still: true }), true);
  const text = JSON.parse(k.anfragen[0].body).messages[0].content[1].text;
  assert.ok(text.endsWith("Die Unterlage ist die PDF oben.\n\nAus der Notiz neben der Unterlage:\n<notiz>\n" +
    "Frühere Fassung: Die Notiz hatte eine Zusammenfassung der früheren Fassung dieser Unterlage (bis 16.10.2026):\n- Kosten: Alt. S. 1\n" +
    "Neu oder geändert: S. 2.\nSteht schon unter „Zu tun“:\n- Blatt 1 abgeben\n</notiz>"), text);
  const n = k.dateien.get(NOTIZ);
  assert.ok(n.startsWith(KOPF + "## Das Wichtigste\n- **Deckungsbeitrag:** Erlös minus variable Kosten. → [[B110 Folien 02 Kosten.pdf#page=7|S. 7]]\n" +
    "- **Organisation:** Klausur 60 Minuten.\n\n> [!eba-info]- Frühere Fassung (bis 16.10.2026)\n> - **Kosten:** Alt. → [[B110 Folien 02 Kosten.pdf#page=1|S. 1]]\n\n" +
    "## Zu tun\n- [x] Blatt 1 abgeben\n"), n);
  assert.deepEqual(k.hinweise.map((h) => h.text), ["Fasse die neue Fassung der Unterlage mit Claude zusammen …", "(weg)",
    "Zusammenfassung der neuen Fassung fertig, für etwa 0,08 $ von deinem Guthaben."]);
  assert.equal(await k.C2.zusammenfassenStand(NOTIZ), "");
});

test("Neue Fassung: bräuchte es eine Rückfrage zu den Kosten, bleibt der Knopf; eine alte Textfassung geht nie mit", async () => {
  const frueher = "## Das Wichtigste (frühere Fassung, bis 16.10.2026)\n- Alt\n\n";
  const k = knopf({ verbunden: true, fm: { seiten: 200 }, text: KOPF + frueher + KASTEN, vfm: { seiten: 2, groesse: 5 },
    netz: async () => { throw new Error("keine Anfrage erwartet"); } });
  assert.equal(await k.C2.zusammenfassenStand(NOTIZ), "nachfuehren");
  assert.equal(await k.C2.zusammenfassen(NOTIZ, null, { still: true }), false);
  assert.deepEqual([k.anfragen.length, k.hinweise.length], [0, 0], "still: keine Anfrage, kein Hinweis");
  assert.equal(await k.C2.zusammenfassenStand(NOTIZ), "frei", "einmal je Fassung und Gerät, danach der Knopf");
  assert.equal(k.dateien.get(NOTIZ), KOPF + frueher + KASTEN);

  const e = knopf({ verbunden: true, extern: true, text: KOPF + frueher + KASTEN, netz: async () => { throw new Error("keine Anfrage erwartet"); } });
  assert.equal(await e.C2.zusammenfassenStand(NOTIZ), "frei", "ILIAS-Dateien von außen: Der eigene Uni-Abgleich führt nach, hier nur auf Wunsch");
});

test("PDF-Kasten: kein Lehrmaterial kein Knopf; Guthaben leer → Hinweis mit Knopf zur Console, die Notiz bleibt", async () => {
  let k = knopf({ verbunden: true, fm: { art: "Mitschrift" }, netz: async () => { throw new Error("keine Anfrage erwartet"); } });
  assert.equal(await k.C2.zusammenfassenStand(NOTIZ), "");

  k = knopf({ verbunden: true, netz: async () => fehler(400, GUTHABEN) });
  assert.equal(await k.C2.zusammenfassen(NOTIZ), false);
  assert.equal(k.dateien.get(NOTIZ), KOPF + KASTEN);
  const h = k.hinweise[k.hinweise.length - 1];
  assert.equal(h.text, "Dein Guthaben bei Anthropic ist aufgebraucht. Du kannst es in der Console aufladen.");
  assert.equal(h.h.aktion.text, "Console öffnen");
  assert.equal(k.C2.zeile().text, "Dein Guthaben bei Anthropic ist aufgebraucht.");
});
