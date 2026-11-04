// Claude-App (Connector), Seite des Plugins (server.js, seit-besuch.js, verbindungen.js, lernplan.js): Code nur nach der Rückfrage
// und nur im Fenster, Trennen und Ausschalten, Fehler eines älteren oder abgeschalteten Servers, der Hinweis auf neue Verbindungen
// (einmal je Gerät, Pille „prüfen“ 3 Tage), das Lagebild im Stand nur, solange die Claude-App an ist, mit seinen Grenzen. Gegen den
// echten Web-Dienst aus server/ (dienst.mjs auf einem freien Port) wie tests/server-plugin.test.js; den Weg POST /v1/claude-app und
// claude_app im Eingang spielt hier eine kleine Attrappe davor (so steuert der Test jede Antwort; den echten Weg prüft
// tests/mcp-server.test.js).
// Ohne server/ übersprungen.
"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { pathToFileURL } = require("node:url");
const assert = require("node:assert/strict");
const { laden } = require("./laden.js");

const WURZEL = path.join(__dirname, "..");
const SERVER = path.join(WURZEL, "server");
const SKRIPTE = path.join(WURZEL, "Studium Autopilot", "System", "Skripte");
const da = fs.existsSync(path.join(SERVER, "dienst.mjs"));
const test = (name, fn) => require("node:test")(name, { skip: !da && "server/ fehlt in diesem Baum" }, fn);
const modul = (d) => import(pathToFileURL(path.join(SERVER, d)).href);

const SPERRE = require(path.join(SKRIPTE, "sperre.js"));
const Q = require(path.join(SKRIPTE, "quellen.js"));
const SB = require(path.join(SKRIPTE, "seit-besuch.js"));
const GEHEIM_ID = "studium-autopilot-server-test";
const START = new Date("2026-10-18T10:00:00");
const SIGNIERT_BEWEIS = /^Studium-Signatur v=1,zeit=\d{10},nonce=[\w-]{22},inhalt=[\w-]{43},signatur=[\w-]{43},beweis=[\w-]{43}$/;

// ---------- Attrappen: Fenster (DOM), Obsidian, Hinweise, Zeitgeber ----------
const knoten = (tag, o) => {
  o = o || {};
  const k = { tag, text: o.text || "", cls: o.cls || "", attr: o.attr || {}, kinder: [], hoerer: {}, value: "", disabled: false,
    klassen: new Set(String(o.cls || "").split(" ").filter(Boolean)),
    createEl(t, oo) { const n = knoten(t, oo); k.kinder.push(n); return n; },
    createDiv(oo) { return k.createEl("div", oo); },
    createSpan(oo) { return k.createEl("span", oo); },
    empty() { k.kinder = []; k.text = ""; },
    setText(t) { k.text = t; },
    appendText(t) { k.kinder.push(knoten("#text", { text: t })); },
    addClass(c) { k.klassen.add(c); },
    removeClass(c) { k.klassen.delete(c); },
    addEventListener(e, fn) { k.hoerer[e] = fn; },
    select() {},
  };
  return k;
};
const alle = (n) => [n].concat(...n.kinder.map(alle));
const finde = (n, p) => alle(n).find(p) || null;
const textVon = (n) => alle(n).map((x) => x.text).join("");
class Setting {
  constructor(el) { this.el = el.createDiv({ cls: "setting-item" }); this.el.knoepfe = []; }
  setName(t) { this.el.name = t; return this; }
  setDesc(t) { this.el.desc = t; return this; }
  addButton(fn) {
    const b = { text: "", warn: false, setButtonText(t) { this.text = t; return this; }, setWarning() { this.warn = true; return this; }, onClick(f) { this.klick = f; return this; } };
    fn(b);
    this.el.knoepfe.push(b);
    return this;
  }
}
const hinweise = [], zeitgeber = [];
const Z = laden("zentral", { heute: "2026-10-18" }).ctx.zentral;
const S = laden("server", { heute: "2026-10-18", kontext: {
  zentral: Z, obsidian: { Modal: class {}, Notice: class {}, Platform: {}, Setting },
  hinweis: (t) => { hinweise.push(t); }, zeit: (fn, ms) => { zeitgeber.push({ fn, ms }); return zeitgeber.length; },
} }).ctx.server;
// bis eine Bedingung gilt (die Knöpfe starten Abläufe, die erst nach Anfragen fertig sind)
const bis = async (fn, was) => {
  for (let i = 0; i < 300; i++) { if (fn()) return; await new Promise((r) => setTimeout(r, 10)); }
  assert.fail("wartet vergeblich: " + was);
};

// ---------- Tresor, abh, Server (wie tests/server-plugin.test.js, nur was hier gebraucht wird) ----------
function tresor() {
  const m = new Map();
  return {
    m,
    io: {
      lesenText: async (p) => (m.has(p) ? m.get(p) : null),
      schreibenText: async (p, t) => { m.set(p, t); },
      umbenennen: async (a, b) => { const t = m.get(a); m.delete(a); m.set(b, t); },
      papierkorb: async (p) => { m.delete(p); },
      existiert: (p) => m.has(p),
      begleitnotiz: () => "",
      terminNotizen: () => [],
    },
    json: (p) => JSON.parse(m.get(p)),
  };
}
const netzEcht = async ({ url, method, headers, body }) => {
  const r = await fetch(url, { method, headers: { ...headers, "x-forwarded-for": "198.51.100.7" }, body });
  return { status: r.status, text: await r.text(), headers: Object.fromEntries(r.headers) };
};
function abhBauen(t, o) {
  o = o || {};
  const geheim = o.geheim || new Map(), lokal = o.lokal || new Map(), uhr = o.uhr || { t: START };
  return {
    io: t.io, netz: o.netz || netzEcht,
    geheim: { lesen: (id) => geheim.get(id) || null, schreiben: async (id, w) => { geheim.set(id, w); }, loeschen: async (id) => { geheim.delete(id); } },
    geheimId: () => GEHEIM_ID,
    lokal: (k, v) => { if (v === undefined) return lokal.has(k) ? lokal.get(k) : null; if (v == null) lokal.delete(k); else lokal.set(k, JSON.parse(JSON.stringify(v))); return v; },
    jetzt: () => new Date(uhr.t),
    geraetId: () => o.geraet || "g-pc", zentral: () => Z,
    stand: () => ({ module: ["B110"], studienbeginn: "2026-10-01", variante: "offen" }),
    modulLink: () => "",
    bestaetigen: async (titel, text) => { (o.fragen || []).push({ titel, text }); return o.ja !== false; },
    eintippen: async (titel, text, ja, soll) => soll,
    sperre: SPERRE, quellen: Q, mobil: false,
    standText: (s) => ({ text: s.geprueft ? "Aktualisiert." : "Noch nicht aktualisiert.", symbol: "haken", ton: "ok" }),
    tresor: o.tresor || (async () => ({ termine: [], todos: [] })),
    lagebild: o.lagebild,
    unterlagen: async () => [], pdf: async () => null, kapitelUnterlagen: async () => [], lernplan: () => null, lernplanNotizen: async () => [],
    lokalErlaubt: true, geheimMap: geheim, lokalMap: lokal, uhr,
  };
}
async function serverStarten() {
  const { erzeugeDienst } = await modul("dienst.mjs");
  const { neuerCode } = await modul("verbinden.mjs");
  const { neuerSchluessel } = await modul("kanal.mjs");
  const verzeichnis = fs.mkdtempSync(path.join(os.tmpdir(), "studium-claude-app-"));
  const konfig = { zugang: neuerSchluessel(), schluessel: neuerSchluessel(), adresse: "", version: "0.0.0-test" };
  const dienst = erzeugeDienst({ konfig, verzeichnis });
  await new Promise((fertig) => dienst.listen(0, "127.0.0.1", fertig));
  konfig.adresse = `http://127.0.0.1:${dienst.address().port}`;
  fs.writeFileSync(path.join(verzeichnis, "zustand.json"), JSON.stringify({ claude: "angemeldet", gmail: "ok", uniZugang: "gespeichert" }));
  return {
    konfig,
    code: () => neuerCode(path.join(verzeichnis, "web"), { adresse: konfig.adresse }).code,
    stand: () => JSON.parse(fs.readFileSync(path.join(verzeichnis, "web", "stand-plugin.json"), "utf8")),
    // Schlüssel, mit denen das Gerät fragt: seit den Schlüsseln je Gerät die des zuletzt verbundenen (web/geraete-schluessel.json), sonst
    // die gemeinsamen
    paar: () => {
      let g = [];
      try { g = JSON.parse(fs.readFileSync(path.join(verzeichnis, "web", "geraete-schluessel.json"), "utf8")).geraete || []; } catch (e) { g = []; }
      return g.length ? { zugang: g[g.length - 1].zugang, schluessel: g[g.length - 1].schluessel } : konfig;
    },
    zu: () => new Promise((fertig) => dienst.close(fertig)),
  };
}
// Antwort so signiert, wie es der Server täte (server/kanal.mjs antwortMac)
async function signiert(srv, anfrage, antwort) {
  const { antwortMac } = await modul("kanal.mjs");
  const nonce = (/nonce=([\w-]{22})/.exec(String((anfrage.headers || {}).authorization || "")) || [])[1];
  return Object.assign({}, antwort, { headers: Object.assign({}, antwort.headers, { "studium-signatur": "v=1,mac=" + antwortMac(srv.paar(), nonce, antwort.status, antwort.text) }) });
}
// Kanal mit eigenem Zweck (claude-app, claude-app-antwort), wie server/kanal.mjs: AES-256-GCM, Zusatzdaten mit dem Zweck
const zusatz = (zweck) => Buffer.from("studium-autopilot/kanal/v1/" + zweck);
const kanalAuf = (schluessel, zweck, p) => {
  const d = crypto.createDecipheriv("aes-256-gcm", Buffer.from(schluessel, "base64url"), Buffer.from(p.iv, "base64url"));
  d.setAAD(zusatz(zweck));
  const roh = Buffer.from(p.daten, "base64url");
  d.setAuthTag(roh.subarray(roh.length - 16));
  return JSON.parse(Buffer.concat([d.update(roh.subarray(0, roh.length - 16)), d.final()]).toString("utf8"));
};
const kanalZu = (schluessel, zweck, o) => {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv("aes-256-gcm", Buffer.from(schluessel, "base64url"), iv);
  c.setAAD(zusatz(zweck));
  const daten = Buffer.concat([c.update(JSON.stringify(o), "utf8"), c.final(), c.getAuthTag()]);
  return { schema: 1, zweck, iv: iv.toString("base64url"), daten: daten.toString("base64url") };
};
// Der Weg POST /v1/claude-app vor dem echten Dienst: entschlüsselt die Anfrage (Zweck claude-app), antwortet signiert mit Zweck
// claude-app-antwort. claude: { an, verbindungen, anfragen, fehler (eine Antwort ohne Paket: { status, body, headers }) }
function mitClaudeApp(srv, claude, weiter) {
  return async (a) => {
    if (!a.url.endsWith("/v1/claude-app")) return (weiter || netzEcht)(a);
    const anfrage = kanalAuf(srv.paar().schluessel, "claude-app", JSON.parse(a.body));
    claude.anfragen.push({ anfrage, kopf: a.headers.authorization, body: a.body });
    if (claude.fehler) return signiert(srv, a, { status: claude.fehler.status, text: JSON.stringify(claude.fehler.body || {}), headers: claude.fehler.headers || {} });
    let d;
    if (anfrage.aktion === "code") { claude.an = true; d = { code: "abcde-fghjk", ablauf: new Date(START.getTime() + 10 * 60e3).toISOString(), adresse: srv.konfig.adresse + "/mcp" }; }
    else {
      if (anfrage.aktion === "trennen") claude.verbindungen = claude.verbindungen.filter((v) => v.id !== anfrage.id);
      if (anfrage.aktion === "aus") { claude.an = false; claude.verbindungen = []; }
      d = { an: claude.an, verbindungen: claude.verbindungen };
    }
    return signiert(srv, a, { status: 200, text: JSON.stringify(kanalZu(srv.paar().schluessel, "claude-app-antwort", d)), headers: { "content-type": "application/json" } });
  };
}
// Eingang mit claude_app (claude() → Objekt oder undefined) und Mitschnitt des Stands (staende: entschlüsselt)
function mitEingang(srv, claude, staende) {
  return async (a) => {
    const r = await netzEcht(a);
    const { entschluesseln, verschluesseln } = await modul("kanal.mjs");
    if (a.url.endsWith("/v1/stand")) staende.push({ stand: await entschluesseln(srv.paar().schluessel, "stand", JSON.parse(a.body)), bytes: Buffer.byteLength(a.body), status: r.status });
    if (!a.url.endsWith("/v1/eingang") || r.status !== 200) return r;
    const b = await entschluesseln(srv.paar().schluessel, "eingang", JSON.parse(r.text)), ca = claude();
    // undefined: wie ein Server ohne Connector, ohne claude_app
    if (ca !== undefined) b.claude_app = ca; else delete b.claude_app;
    return signiert(srv, a, { status: 200, text: JSON.stringify(await verschluesseln(srv.paar().schluessel, "eingang", b)), headers: r.headers });
  };
}
async function verbunden(srv, t, o) {
  const a = abhBauen(t, o);
  const m = S.erzeugen(a);
  const r = await m.verbinden(srv.konfig.adresse, srv.code());
  assert.equal(r.ok, true, r.fehler);
  return { a, m };
}
const verbindung = (id, seit, zuletzt) => ({ id, seit, zuletzt, client: "claude.ai" });

// ---------- Tests ----------
test("Claude-App: Code nur nach der Rückfrage, die sagt, was Claude liest; Anfrage verschlüsselt mit Beweis; Code nirgends gespeichert", async () => {
  const srv = await serverStarten();
  try {
    const t = tresor(), claude = { an: false, verbindungen: [], anfragen: [] }, fragen = [];
    const { a, m } = await verbunden(srv, t, { netz: mitClaudeApp(srv, claude), fragen });
    const nein = S.erzeugen(Object.assign({}, a, { bestaetigen: async () => false }));
    assert.deepEqual(await nein.claudeAppCode(), { abgebrochen: true });
    assert.equal(claude.anfragen.length, 0, "abgebrochen: keine Anfrage");
    const r = await m.claudeAppCode();
    assert.deepEqual(r, { ok: true, code: "ABCDE-FGHJK", ablauf: new Date(START.getTime() + 10 * 60e3).toISOString(), adresse: srv.konfig.adresse + "/mcp" });
    // die Rückfrage nennt genau, was Claude in dieser Fassung lesen kann, und dass es nichts ändert
    const f = fragen.find((x) => x.titel === "Mit der Claude-App verbinden?");
    assert.ok(f, "Rückfrage");
    for (const w of ["Termine und Fristen", "offene To-dos", "Lernplans", "fällige Karteikarten je Modul", "Prüfungen mit Noten",
      "Stundenplan der nächsten 14 Tage", "Hinweise deines Servers", "ändert dabei nichts"]) assert.ok(f.text.includes(w), w);
    assert.doesNotMatch(f.text, /Notizen|PDF|Unterlagen/, "Notizen und Unterlagen erst mit der Kopie des Tresors");
    const x = claude.anfragen[0];
    assert.match(x.kopf, SIGNIERT_BEWEIS, "signiert mit dem Beweis des Datenschlüssels");
    assert.deepEqual(Object.keys(x.anfrage).sort(), ["aktion", "nonce", "schema", "zeit"]);
    assert.equal(x.anfrage.aktion, "code");
    assert.equal(x.anfrage.schema, 1);
    assert.match(x.anfrage.nonce, /^[\w-]{22}$/);
    assert.equal(JSON.parse(x.body).zweck, "claude-app");
    // der Code steht nirgends: weder im Tresor noch im Schlüsselbund noch im Gerätespeicher
    const ueberall = JSON.stringify([...t.m.values(), ...a.geheimMap.values(), ...a.lokalMap.values()]);
    assert.doesNotMatch(ueberall, /ABCDE-?FGHJK/i);
    // eine fremde Adresse (anderer Host, anderer Pfad) oder ein kaputter Code gilt nicht
    for (const falsch of [{ adresse: "https://andere.example.org/mcp" }, { adresse: srv.konfig.adresse + "/mcp?x=1" }, { adresse: srv.konfig.adresse + "/oauth" }, { code: "kurz" }]) {
      const netz = async (q) => {
        if (!q.url.endsWith("/v1/claude-app")) return netzEcht(q);
        const d = Object.assign({ code: "ABCDE-FGHJK", ablauf: new Date(START.getTime() + 60e4).toISOString(), adresse: srv.konfig.adresse + "/mcp" }, falsch);
        return signiert(srv, q, { status: 200, text: JSON.stringify(kanalZu(srv.paar().schluessel, "claude-app-antwort", d)), headers: {} });
      };
      assert.deepEqual(await S.erzeugen(Object.assign({}, a, { netz })).claudeAppCode(), { fehler: "paket" }, JSON.stringify(falsch));
    }
    // eine Antwort mit dem Zweck der Anfrage (gespiegelt) gilt nicht
    const gespiegelt = async (q) => (q.url.endsWith("/v1/claude-app") ? signiert(srv, q, { status: 200, text: q.body, headers: {} }) : netzEcht(q));
    assert.deepEqual(await S.erzeugen(Object.assign({}, a, { netz: gespiegelt })).claudeAppCode(), { fehler: "paket" });
    assert.deepEqual(await S.erzeugen(abhBauen(tresor())).claudeAppCode(), { fehler: "nicht-verbunden" });
  } finally { await srv.zu(); }
});

test("Claude-App im Fenster: Adresse zum Kopieren, Code und drei Schritte nur im Fenster; der Code verschwindet zu seinem Ablauf", async () => {
  const srv = await serverStarten();
  const vorher = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const kopiert = [];
  Object.defineProperty(globalThis, "navigator", { value: { clipboard: { writeText: async (x) => { kopiert.push(x); } } }, configurable: true });
  try {
    const t = tresor(), claude = { an: false, verbindungen: [], anfragen: [] };
    const { a, m } = await verbunden(srv, t, { netz: mitClaudeApp(srv, claude) });
    const box = knoten("div"), nachCode = [];
    zeitgeber.length = 0;
    const r = await S.claudeAppZeigen(box, m, { nachCode: () => nachCode.push(1) });
    assert.equal(r.ok, true, "fragt den Server nach dem Stand");
    assert.equal(claude.anfragen[0].anfrage.aktion, "status");
    assert.match(textVon(box), /^Claude-AppNicht verbunden\. /, "Abschnitt mit dem Stand");
    assert.ok(!finde(box, (k) => k.text === "Claude-App ganz ausschalten"), "aus: nichts auszuschalten");
    const los = finde(box, (k) => k.tag === "button" && k.text === "Mit der Claude-App verbinden");
    los.hoerer.click();
    await bis(() => finde(box, (k) => k.klassen.has("eba-server-code")), "Code");
    assert.equal(finde(box, (k) => k.klassen.has("eba-server-code")).text, "ABCDE-FGHJK");
    const feld = finde(box, (k) => k.tag === "input");
    assert.equal(feld.value, srv.konfig.adresse + "/mcp", "Adresse für claude.ai");
    assert.equal(feld.attr.readonly, "readonly");
    const schritte = finde(box, (k) => k.tag === "ol").kinder;
    assert.equal(schritte.length, 3, "drei Schritte");
    assert.match(textVon(schritte[0]), /Konnektoren.*Connectors.*Add custom connector.*nie über einen Link, den dir jemand schickt\.$/);
    assert.match(textVon(schritte[1]), /Studium Autopilot.*MCP server URL.*eigenen Server\..*Weiter.*Continue/);
    assert.match(textVon(schritte[2]), /Code.*Verbinden/);
    assert.match(textVon(box), /Gilt bis .*\d\d:\d\d und nur einmal\./);
    const sicher = finde(box, (k) => k.tag === "details");
    assert.match(textVon(sicher), /^Sicher einstellen.*Gmail.*Senden und Weiterleiten.*Netzzugang der Code-Ausführung/);
    finde(box, (k) => k.tag === "button" && k.text === "Adresse kopieren").hoerer.click();
    await bis(() => kopiert.length, "kopiert");
    assert.deepEqual(kopiert, [srv.konfig.adresse + "/mcp"]);
    assert.match(hinweise[hinweise.length - 1], /^Adresse kopiert\./);
    assert.deepEqual(nachCode, [1], "danach gleich abrufen");
    assert.ok(finde(box, (k) => k.text === "Claude-App ganz ausschalten"), "an: Ausschalten steht da");
    // nie gespeichert, und zu seinem Ablauf ist er weg
    assert.doesNotMatch(JSON.stringify([...t.m.values(), ...a.lokalMap.values(), ...a.geheimMap.values()]), /ABCDE-?FGHJK/i);
    const ablauf = zeitgeber[zeitgeber.length - 1];
    assert.ok(ablauf.ms >= 0);
    ablauf.fn();
    assert.ok(!finde(box, (k) => k.klassen.has("eba-server-code")), "Code verschwindet");
    assert.ok(!finde(box, (k) => k.tag === "input"), "die Adresse mit ihm");
  } finally {
    if (vorher) Object.defineProperty(globalThis, "navigator", vorher); else delete globalThis.navigator;
    await srv.zu();
  }
});

test("Claude-App im Fenster: älterer Server (404) und abgeschaltet (503) ohne Knopf, zu viele (429) mit Uhrzeit, falsche Uhr", async () => {
  const srv = await serverStarten();
  try {
    // ein Server vor dem Connector kennt den Weg nicht: 404 ohne Signatur, auch für ein Gerät mit Riegel
    const { a } = await verbunden(srv, tresor());
    const m = S.erzeugen(Object.assign({}, a, { netz: async (q) => (q.url.endsWith("/v1/claude-app")
      ? { status: 404, text: JSON.stringify({ fehler: "unbekannt" }), headers: { "content-type": "application/json; charset=utf-8" } } : a.netz(q)) }));
    const box = knoten("div");
    assert.deepEqual(await S.claudeAppZeigen(box, m), { fehler: "alt" });
    assert.ok(!finde(box, (k) => k.tag === "button"), "kein Knopf");
    assert.ok(textVon(box).includes("Dein Server bekommt das mit seinem nächsten Update."));
    // ein Gerät mit Riegel nimmt ohne Signatur sonst nichts an
    assert.deepEqual(await S.erzeugen(Object.assign({}, a, { netz: async (q) => (q.url.endsWith("/v1/claude-app") ? { status: 200, text: "{}", headers: {} } : netzEcht(q)) })).claudeAppStatus(),
      { fehler: "netz" });
    const claude = { an: true, verbindungen: [], anfragen: [], fehler: { status: 503, body: { fehler: "abgeschaltet" } } };
    const mit = S.erzeugen(Object.assign({}, a, { netz: mitClaudeApp(srv, claude) }));
    const box2 = knoten("div");
    await S.claudeAppZeigen(box2, mit);
    assert.ok(!finde(box2, (k) => k.tag === "button"));
    assert.ok(textVon(box2).includes("Die Verbindung zur Claude-App ist gerade abgeschaltet."));
    // Code: zu viele (Zeit aus der Antwort, sonst aus Retry-After), Uhr falsch, Anfrage abgelehnt
    claude.fehler = null;
    const box3 = knoten("div");
    await S.claudeAppZeigen(box3, mit);
    const los = finde(box3, (k) => k.tag === "button" && k.text === "Mit der Claude-App verbinden");
    const meldung = finde(box3, (k) => k.klassen.has("eba-modal-meldung"));
    const wieder = new Date(START.getTime() + 3600e3);
    for (const [fehler, satz] of [
      [{ status: 429, body: { fehler: "zu-viele", wieder: wieder.toISOString() } }, "Zu viele Versuche. Wieder möglich ab 18.10., 11:00."],
      [{ status: 400, body: { fehler: "uhr" } }, "Die Uhr dieses Geräts geht falsch. Stell sie richtig und versuch es noch einmal."],
      [{ status: 409, body: { fehler: "wiederholt" } }, "Das hat nicht geklappt. Versuch es noch einmal."],
      [{ status: 403, body: { fehler: "datenschluessel" } }, "Dein Server kennt dieses Gerät nicht mehr. Bitte neu verbinden."],
    ]) {
      claude.fehler = fehler;
      meldung.setText("");
      los.hoerer.click();
      await bis(() => meldung.text, "Meldung " + fehler.status);
      assert.equal(meldung.text, satz, String(fehler.status));
      assert.ok(meldung.klassen.has("fehler"));
      assert.ok(!finde(box3, (k) => k.klassen.has("eba-server-code")), "kein Code");
    }
    claude.fehler = { status: 429, body: {}, headers: { "retry-after": "120" } };
    const r = await mit.claudeAppCode();
    assert.deepEqual(r, { fehler: "zu-viele", wieder: new Date(START.getTime() + 120e3).toISOString() });
  } finally { await srv.zu(); }
});

test("Claude-App im Fenster: je Verbindung Trennen, ganz ausschalten; beides nach einer Rückfrage", async () => {
  const srv = await serverStarten();
  try {
    const claude = { an: true, anfragen: [], verbindungen: [verbindung("g-neu", "2026-10-18T07:00:00.000Z", "2026-10-18T07:30:00.000Z"),
      verbindung("g-alt", "2026-10-11T07:00:00.000Z", "2026-10-12T07:30:00.000Z")] };
    const fragen = [];
    const { m } = await verbunden(srv, tresor(), { netz: mitClaudeApp(srv, claude), fragen });
    const box = knoten("div");
    await S.claudeAppZeigen(box, m);
    let zeilen = alle(box).filter((k) => k.klassen.has("setting-item"));
    assert.deepEqual(zeilen.map((z) => z.name), ["claude.ai", "claude.ai"], "neueste zuerst");
    assert.match(zeilen[0].desc, /^Verbunden seit 18\.10\., \d\d:00 · zuletzt benutzt 18\.10\., \d\d:30$/);
    zeilen[1].knoepfe[0].klick();
    await bis(() => claude.anfragen.some((x) => x.anfrage.aktion === "trennen"), "trennen");
    assert.equal(fragen[fragen.length - 1].titel, "Claude-App trennen?");
    assert.deepEqual(claude.anfragen.filter((x) => x.anfrage.aktion === "trennen").map((x) => x.anfrage.id), ["g-alt"]);
    await bis(() => alle(box).filter((k) => k.klassen.has("setting-item")).length === 1, "eine Zeile weniger");
    assert.equal(hinweise[hinweise.length - 1], "Die Claude-App ist getrennt.");
    // ganz ausschalten: alle Verbindungen weg, kein „ausschalten“ mehr
    finde(box, (k) => k.text === "Claude-App ganz ausschalten").hoerer.click({ preventDefault() {} });
    await bis(() => !alle(box).some((k) => k.klassen.has("setting-item")), "aus");
    assert.equal(fragen[fragen.length - 1].titel, "Claude-App ganz ausschalten?");
    assert.equal(claude.anfragen[claude.anfragen.length - 1].anfrage.aktion, "aus");
    assert.match(textVon(box), /Nicht verbunden\./);
    assert.ok(!finde(box, (k) => k.text === "Claude-App ganz ausschalten"));
    // abgebrochen: nichts geschickt
    const n = claude.anfragen.length;
    const nein = S.erzeugen(Object.assign({}, abhBauen(tresor()), { bestaetigen: async () => false }));
    assert.deepEqual(await nein.claudeAppAus(), { abgebrochen: true });
    assert.deepEqual(await m.claudeAppTrennen("../x"), { fehler: "nochmal" }, "nur gültige Kennungen");
    assert.equal(claude.anfragen.length, n);
  } finally { await srv.zu(); }
});

test("Neue Claude-Verbindung: in server.json für alle Geräte, Pille „prüfen“ 3 Tage, bleibt bekannt nach dem Trennen", async () => {
  const srv = await serverStarten();
  try {
    const t = tresor(), staende = [];
    let ca = { an: true, verbindungen: [verbindung("g1", "2026-10-18T07:00:00.000Z", "2026-10-18T07:45:00.000Z")] };
    const { a, m } = await verbunden(srv, t, { netz: mitEingang(srv, () => ca, staende) });
    assert.equal((await m.abrufen({ manuell: true })).art, "ok");
    const sj = t.json(S.DATEI).claude_app;
    assert.deepEqual(sj, { an: true, verbindungen: [{ id: "g1", seit: "2026-10-18T07:00:00.000Z", client: "claude.ai", zuletzt: "2026-10-18" }],
      bekannt: [{ id: "g1", seit: "2026-10-18T07:00:00.000Z", client: "claude.ai" }] }, "zuletzt nur als Tag");
    const z = m.zeile();
    assert.equal(z.pille, "pruefen");
    assert.equal(z.pilleText, "prüfen");
    assert.equal(z.ton, "warn");
    assert.match(z.unter, /^Neue Claude-Verbindung am 18\.10\. um \d\d:00$/);
    assert.match(z.text, / – warst du das\? Wenn nicht, trennst du sie hier\.$/);
    // ein anderes Gerät ohne Schlüssel (nur server.json über den Sync) sieht dasselbe und erfährt, wo es trennt
    const anders = S.erzeugen(abhBauen(t, { geraet: "g-ipad" }));
    await anders.hinweiseLaden();
    assert.match(anders.zeile().text, /trennst du sie auf einem Gerät, das mit deinem Server verbunden ist\.$/);
    assert.deepEqual((await anders.claudeAppNeu()).map((e) => e.id), ["g1"]);
    const d = await anders.einzelheiten();
    assert.deepEqual(d.liste.find((x) => x[0] === "Claude-App"), ["Claude-App", "verbunden seit " + new Date("2026-10-18T07:00:00.000Z").toTimeString().slice(0, 5) + " · zuletzt benutzt heute"]);
    assert.ok(!(await m.einzelheiten()).liste.some((x) => x[0] === "Claude-App"), "mit Schlüssel im eigenen Abschnitt");
    // die Verbindung wird getrennt: bekannt bleibt sie (eine fremde, die sich selbst abmeldet, fällt trotzdem auf)
    ca = { an: true, verbindungen: [] };
    await m.abrufen({ manuell: true });
    assert.deepEqual(t.json(S.DATEI).claude_app.verbindungen, []);
    assert.deepEqual((await m.claudeAppNeu()).map((e) => e.id), ["g1"]);
    // nach 3 Tagen keine Pille mehr, nach 14 Tagen kein Hinweis
    a.uhr.t = new Date(START.getTime() + 3.5 * 864e5);
    assert.notEqual(m.zeile().pille, "pruefen");
    a.uhr.t = new Date(START.getTime() + 15 * 864e5);
    assert.deepEqual(await m.claudeAppNeu(), []);
    // ein Server ohne Connector schickt nichts: dann auch nichts in server.json
    a.uhr.t = START;
    ca = undefined;
    await m.abrufen({ manuell: true });
    assert.equal(t.json(S.DATEI).claude_app, undefined);
    assert.equal(m.zeile().pilleText, undefined);
  } finally { await srv.zu(); }
});

test("Neue Claude-Verbindung, die vor dem Abholen schon endete (frueher): bekannt mit Ende, Hinweis einmal je Gerät, ausschalten statt trennen", async () => {
  const srv = await serverStarten();
  try {
    const t = tresor();
    // g2 kam und ging zwischen zwei Abrufen (widerrufen), g1 ist bekannt und wird jetzt ersetzt; ein älterer Server schickt frueher nicht
    let ca = { an: true, verbindungen: [verbindung("g1", "2026-10-18T07:00:00.000Z", "2026-10-18T07:00:00.000Z")] };
    const { a, m } = await verbunden(srv, t, { netz: mitEingang(srv, () => ca, []) });
    assert.equal((await m.abrufen({ manuell: true })).art, "ok");
    ca = { an: true, verbindungen: [], frueher: [
      { id: "g2", seit: "2026-10-18T07:30:00.000Z", ende: "2026-10-18T07:31:00.000Z", grund: "widerrufen", client: "claude.ai" },
      { id: "g1", seit: "2026-10-18T07:00:00.000Z", ende: "2026-10-18T07:30:00.000Z", grund: "ersetzt", client: "claude.ai" },
      { id: "ohne-ende", seit: "2026-10-18T07:00:00.000Z" }, { id: "kaputt", seit: "2026-10-18T07:00:00.000Z", ende: "2026-10-18" }] };
    await m.abrufen({ manuell: true });
    const sj = t.json(S.DATEI).claude_app;
    assert.deepEqual(sj.verbindungen, []);
    assert.deepEqual(sj.bekannt, [{ id: "g2", seit: "2026-10-18T07:30:00.000Z", client: "claude.ai", ende: "2026-10-18T07:31:00.000Z" },
      { id: "g1", seit: "2026-10-18T07:00:00.000Z", client: "claude.ai", ende: "2026-10-18T07:30:00.000Z" }], "beide mit Ende, die neueste zuerst");
    assert.equal(sj.frueher, undefined, "nur in bekannt");
    assert.deepEqual((await m.claudeAppNeu()).map((e) => e.id), ["g2", "g1"]);
    const z = m.zeile();
    assert.equal(z.pille, "pruefen");
    assert.match(z.text, /^Neue Claude-Verbindung am 18\.10\. um \d\d:30, schon beendet – warst du das\? Wenn nicht, schaltest du die Claude-App hier aus\.$/);
    const e = SB.claudeAppEintraege(await m.claudeAppNeu(), S.caNeuText);
    assert.match(e[0].titel, /^Neue Claude-Verbindung am 18\.10\. um \d\d:30, schon beendet – warst du das\?$/);
    assert.equal(e[0].meta, "claude.ai · wenn nicht, antippen und ausschalten");
    assert.equal(e[0].k, "ca|g2|2026-10-18T07:30:00.000Z", "derselbe Schlüssel wie für eine laufende: einmal je Gerät");
    // ein Gerät ohne Schlüssel liest nur server.json
    const anders = S.erzeugen(abhBauen(t, { geraet: "g-ipad" }));
    await anders.hinweiseLaden();
    assert.match(anders.zeile().text, /schon beendet – warst du das\? Wenn nicht, schaltest du die Claude-App auf einem Gerät aus, das mit deinem Server verbunden ist\.$/);
    // fällt frueher beim Server nach 30 Tagen weg, bleibt bekannt, wie es war
    ca = { an: true, verbindungen: [] };
    a.uhr.t = new Date(START.getTime() + 864e5);
    await m.abrufen({ manuell: true });
    assert.deepEqual(t.json(S.DATEI).claude_app.bekannt.map((x) => [x.id, !!x.ende]), [["g2", true], ["g1", true]]);
  } finally { await srv.zu(); }
});

test("Zeile „Eigener Server“ mit neuer Claude-Verbindung: rechts „Prüfen“ im Akzent, darunter wann; die Pille heißt „prüfen“", () => {
  const zeile = { text: "Neue Claude-Verbindung am 18.10. um 09:00 – warst du das? Wenn nicht, trennst du sie hier.", unter: "Neue Claude-Verbindung am 18.10. um 09:00",
    symbol: "haken", ton: "warn", pille: "pruefen", pilleText: "prüfen", knopf: { aktion: "verbindung-aktualisieren", text: "Aktualisieren", cta: true, parameter: { id: "server" } },
    link: { aktion: "verbinden", text: "Mehr erfahren", parameter: { id: "server" } } };
  const W = laden("verbindungen", { kontext: {
    obsidian: { Modal: class {}, Notice: class {}, Platform: {}, Setting: class {} },
    link: (aktion, p) => "obsidian://studium-autopilot?aktion=" + aktion + (p && p.id ? "&id=" + p.id : ""),
    server: { sichtbar: () => true, verbunden: () => true, status: () => ({ verbunden: true }), zeile: () => zeile },
  } }).ctx.verbindungen;
  const k = W.kompakt("server");
  assert.equal(k.wert, "Prüfen");
  assert.equal(k.art, "akzent");
  assert.equal(k.unter, "Neue Claude-Verbindung am 18.10. um 09:00");
  assert.ok(("Eigener Server" + k.wert).length <= 24, "Name und Stand passen in eine Zeile");
  assert.match(W.zeile("server").pille, /^<span class="eba-pill warn">prüfen<\/span>$/);
  assert.match(k.ziel, /aktion=verbinden&id=server/, "die Zeile öffnet das Fenster, dort steht Trennen");
});

test("Seit deinem letzten Besuch: neue Claude-Verbindung zuerst, Ziel das Fenster, gesehen nur auf diesem Gerät", () => {
  const neu = [{ id: "g1", seit: "2026-10-18T07:00:00.000Z", client: "claude.ai" }];
  const e = SB.claudeAppEintraege(neu, S.caNeuText);
  assert.equal(e.length, 1);
  assert.match(e[0].titel, /^Neue Claude-Verbindung am 18\.10\. um \d\d:00 – warst du das\?$/);
  assert.equal(e[0].meta, "claude.ai · wenn nicht, antippen und trennen");
  assert.equal(e[0].k, "ca|g1|2026-10-18T07:00:00.000Z");
  const hinweis = SB.claudeEintraege([{ text: "Rundmail.", quelle: "Mail", zeit: "2026-10-18T06:00:00Z" }]);
  const zeilen = SB.zusammenstellen([], hinweis.concat(e), {}, "2026-10-18T09:00:00.000Z");
  assert.deepEqual(zeilen.map((z) => z.q), ["claude-app", "claude"], "zuerst");
  assert.equal(zeilen[0].meta, "claude.ai · wenn nicht, antippen und trennen");
  // gesehen: Schlüssel der Claude-App nur aus der eigenen Datei, alle anderen aus allen
  const dateien = [{ pfad: "S/gesehen-ipad.json", gesehen: { [e[0].k]: "2026-10-18", [hinweis[0].k]: "2026-10-18" } }, { pfad: "S/gesehen-pc.json", gesehen: {} }];
  const g = SB.gesehenVereinen(dateien, "S/gesehen-pc.json");
  assert.deepEqual(Object.keys(g), [hinweis[0].k], "auf dem iPad gesehen zählt hier nicht");
  assert.deepEqual(SB.zusammenstellen([], hinweis.concat(e), g, "2026-10-18T09:00:00.000Z").map((z) => z.q), ["claude-app"]);
  assert.deepEqual(Object.keys(SB.gesehenVereinen(dateien, "S/gesehen-ipad.json")).sort(), [e[0].k, hinweis[0].k].sort(), "auf dem iPad selbst schon");
  assert.deepEqual(SB.claudeAppEintraege(null, S.caNeuText), []);
  // die Karte öffnet das Fenster des Servers
  const code = fs.readFileSync(path.join(SKRIPTE, "seit-besuch.js"), "utf8");
  assert.match(code, /z\.q === "claude-app"\) z\.aktion = \{ name: "verbinden", parameter: \{ id: "server" \} \}/);
});

test("Lagebild: nur solange die Claude-App an ist, in der Form des Vertrags; der ganze Stand bleibt unter der Grenze des Dienstes", async () => {
  const srv = await serverStarten();
  try {
    const t = tresor(), staende = [];
    const roh = {
      lernplan: [{ modul: "B110", kapitel: [{ titel: "Grundlagen", nummer: "1", verstanden: true, woche: "2026-10-12" }, { titel: "Entscheidungen", nummer: "2", verstanden: false, woche: "2026-10-19" }] }],
      karten: [{ modul: "B110", faellig: 12 }],
      pruefungen: [{ modul: "B110", titel: "B110 Klausur", datum: "2027-02-10", anmeldung: "angemeldet", versuch: 1 }, { modul: "E101", titel: "Mathematik I", note: "1,7", versuch: 1 }],
      stundenplan: [{ datum: "2026-10-19", von: "10:15", bis: "11:45", titel: "BWL Vorlesung", ort: "Hörsaal 1", modul: "B110" }],
    };
    let ca;
    const { a, m } = await verbunden(srv, t, { netz: mitEingang(srv, () => ca, staende), lagebild: async () => roh });
    await m.abrufen({ manuell: true });
    assert.ok(staende.length && !("lagebild" in staende[staende.length - 1].stand), "ohne Connector: kein Lagebild");
    ca = { an: false, verbindungen: [] };
    await m.abrufen({ manuell: true });
    assert.ok(!("lagebild" in staende[staende.length - 1].stand), "ausgeschaltet: kein Lagebild");
    ca = { an: true, verbindungen: [] };
    await m.abrufen({ manuell: true });
    const s = staende[staende.length - 1];
    assert.deepEqual(s.stand.lagebild, roh, "an: das Lagebild in der Form des Vertrags");
    assert.ok(s.status === 204 || s.status === 200, "der Dienst nimmt den Stand an");
    // wieder aus: das Feld fehlt ganz
    ca = { an: false, verbindungen: [] };
    await m.abrufen({ manuell: true });
    assert.ok(!("lagebild" in staende[staende.length - 1].stand));
    // Grenzfall: voller Auszug aus dem Tresor und ein riesiges Lagebild; der Stand bleibt unter 512 KB, und der Dienst nimmt ihn
    const lang = (n) => "Titel mit Umlauten äöü ".repeat(20).slice(0, n);
    const voll = {
      lernplan: Array.from({ length: 60 }, (x, i) => ({ modul: "B" + (100 + i), kapitel: Array.from({ length: 260 }, (y, j) => ({ titel: lang(150), nummer: String(j + 1), verstanden: j % 2 === 0, woche: "2026-11-02" })) })),
      karten: Array.from({ length: 60 }, (x, i) => ({ modul: "B" + (100 + i), faellig: i })),
      pruefungen: Array.from({ length: 200 }, (x, i) => ({ modul: "B" + (100 + (i % 60)), titel: lang(150), datum: "2027-02-10", note: "2,3", versuch: 2 })),
      stundenplan: Array.from({ length: 500 }, (x, i) => ({ datum: "2026-10-" + String(19 + (i % 10)), von: "10:15", bis: "11:45", titel: lang(150), ort: lang(150), modul: "B110" })),
    };
    const tv = { termine: Array.from({ length: 450 }, (x, i) => ({ titel: lang(130), datum: "2026-11-" + String(1 + (i % 28)).padStart(2, "0"), bis: "", kategorie: "Frist", code: "B110", herkunft: "zentral", erledigt: false })),
      todos: Array.from({ length: 250 }, (x, i) => ({ text: lang(210), code: "B110", frist: "2026-11-20", id: "t-" + i, pfad: "Unterlagen/" + lang(200) + ".md" })) };
    const gross = S.erzeugen(Object.assign({}, a, { lagebild: async () => voll, tresor: async () => tv }));
    ca = { an: true, verbindungen: [] };
    await gross.abrufen({ manuell: true });
    const g = staende[staende.length - 1];
    assert.ok(g.bytes < 512 * 1024, `Stand ${g.bytes} Bytes`);
    assert.ok(g.status === 204 || g.status === 200, `der Dienst nimmt ihn an (${g.status})`);
    const l = g.stand.lagebild;
    assert.ok(l.lernplan.length <= S.LAGE.module && l.lernplan.every((x) => x.kapitel.length <= S.LAGE.kapitel));
    assert.ok(l.stundenplan.length <= S.LAGE.stundenplan && l.pruefungen.length <= S.LAGE.pruefungen && l.karten.length <= S.LAGE.module);
  } finally { await srv.zu(); }
});

test("Lagebild: jedes Ergebnis des Plugins (auch „endgültig nicht bestanden“) kommt bis in die Werkzeuge; offen bleibt nur ein Modul ohne Ergebnis", async () => {
  const { lagebildPruefen, LAGEBILD, ORDNER, LAGE } = await modul("claude-app.mjs");
  const { quelleServer } = await modul("mcp-quelle-server.mjs");
  const { werkzeuge } = await modul("mcp-werkzeuge.mjs");
  assert.equal(S.LAGE.note, LAGEBILD.note, "eine Grenze für Plugin und Server");
  assert.ok(S.ERGEBNIS_STATUS.includes("endgültig nicht bestanden"));
  assert.ok(S.ERGEBNIS_STATUS.every((x) => x.length <= LAGEBILD.note), "jedes Wort der Liste passt");
  // jedes Wort der Liste, eine Note aus Alma, eine Note als Zahl in der Modulnotiz, ein langes Ergebnis (gekürzt, nicht verworfen)
  const ergebnisse = [...S.ERGEBNIS_STATUS, "1,7", 2.3, "bestanden mit Auszeichnung, sehr gut gemacht"];
  const codes = ergebnisse.map((x, i) => `B${110 + i}`);
  const roh = { pruefungen: ergebnisse.map((note, i) => ({ modul: codes[i], titel: "Klausur", note })).concat({ modul: "E101", titel: "Klausur" }) };
  const geschickt = S.lagebildKurz(roh, null, 1e5).pruefungen;
  const angenommen = lagebildPruefen({ pruefungen: geschickt }, "2026-11-04").pruefungen;
  assert.deepEqual(angenommen.map((p) => p.note), [...S.ERGEBNIS_STATUS, "1,7", "2.3", "bestanden mit Auszeichnung, se", undefined]);
  const v = fs.mkdtempSync(path.join(os.tmpdir(), "studium-claude-app-noten-"));
  try {
    fs.mkdirSync(path.join(v, ORDNER.daten), { recursive: true });
    fs.writeFileSync(path.join(v, ORDNER.daten, LAGE), JSON.stringify({ schema: 1, stand_empfangen: new Date().toISOString(),
      stand: { module: [...codes, "E101"], termine: [], todos: [] }, lagebild: { pruefungen: angenommen }, eingang: { termine: [], hinweise: [] } }));
    const w = werkzeuge(quelleServer(v));
    const module = w.aufrufen("module", {}).daten.module;
    assert.deepEqual(codes.map((c) => module.find((m) => m.code === c).ergebnis), angenommen.slice(0, -1).map((p) => p.note));
    assert.deepEqual(w.aufrufen("pruefungen", {}).daten.module.map((m) => m.code), ["E101"], "nur ohne Ergebnis noch offen");
  } finally { fs.rmSync(v, { recursive: true, force: true }); }
});

test("Lagebild: Note und Versuch nur an der Klausur, zu der sie gehören, nie an einem kommenden Termin (Plugin → Server → Werkzeuge)", async () => {
  const { lagebildPruefen, ORDNER, LAGE } = await modul("claude-app.mjs");
  const { quelleServer } = await modul("mcp-quelle-server.mjs");
  const { werkzeuge } = await modul("mcp-werkzeuge.mjs");
  const L = laden("server", { heute: "2026-10-18", kontext: { zentral: Z, obsidian: { Modal: class {}, Notice: class {}, Platform: {}, Setting } } });
  const heute = new Date(), tag = (n) => { const d = new Date(heute.getFullYear(), heute.getMonth(), heute.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  const m = (code, status, ergebnis) => ({ code, titel: code + " Modul", status, ergebnis, fm: ergebnis ? { versuch: 1 } : {} });
  const p = (code, n, x) => Object.assign({ code, titel: code + " Klausur", datum: tag(n), zwischentest: false, nachhol: false }, x);
  // B110 im Haupttermin bestanden (1,7), danach sein Nachholtermin; E101 mit einer Note von Hand vor der Klausur; S100 nur kommende Termine
  L.ctx.modell = { daten: () => ({ module: [m("B110", "bestanden", "1,7"), m("E101", "offen", "2,0"), m("S100", "angemeldet", "")], stundenplan: [] }),
    pruefungen: () => [p("B110", -30), p("S100", 5, { zwischentest: true }), p("B110", 30, { nachhol: true }), p("E101", 60), p("S100", 60)] };
  const kurz = S.lagebildKurz({ pruefungen: (await L.ctx.server.lagebildObs()).pruefungen }, null, 1e5).pruefungen;
  assert.deepEqual(kurz, [
    { modul: "B110", titel: "B110 Klausur", datum: tag(-30), versuch: 1, note: "1,7" },
    { modul: "S100", titel: "S100 Klausur", datum: tag(5), anmeldung: "angemeldet" },
    { modul: "B110", titel: "B110 Klausur", datum: tag(30) },
    { modul: "E101", titel: "E101 Klausur", datum: tag(60) },
    { modul: "S100", titel: "S100 Klausur", datum: tag(60), anmeldung: "angemeldet" },
    { modul: "E101", titel: "E101 Modul", versuch: 1, note: "2,0" },
  ]);
  const v = fs.mkdtempSync(path.join(os.tmpdir(), "studium-claude-app-note-termin-"));
  try {
    fs.mkdirSync(path.join(v, ORDNER.daten), { recursive: true });
    fs.writeFileSync(path.join(v, ORDNER.daten, LAGE), JSON.stringify({ schema: 1, stand_empfangen: new Date().toISOString(),
      stand: { module: ["B110", "E101", "S100"], termine: [], todos: [] }, lagebild: lagebildPruefen({ pruefungen: kurz }, tag(0)), eingang: { termine: [], hinweise: [] } }));
    const w = werkzeuge(quelleServer(v));
    assert.ok(w.aufrufen("pruefungen", {}).daten.module.every((x) => !x.ergebnis), "kein kommender Termin mit Note");
    const mod = (c) => w.aufrufen("module", {}).daten.module.find((x) => x.code === c);
    assert.deepEqual([mod("B110").ergebnis, mod("B110").versuch, mod("E101").ergebnis], ["1,7", 1, "2,0"], "die Note des Moduls bleibt");
  } finally { fs.rmSync(v, { recursive: true, force: true }); }
});

test("Lagebild: Grenzen je Liste und in Bytes, Texte ohne Links und Zugangsdaten, nur gültige Felder", () => {
  const geheim = (x) => /kennwort|passw/i.test(x);
  const roh = {
    lernplan: [{ modul: "B110", kapitel: [{ titel: "Siehe https://evil.example.com/x und [Link](https://evil.example.com)", nummer: "1.2", verstanden: "ja", woche: "kein Datum" },
      { titel: "Kenn" + "wort: geheim12", nummer: "2" }, { titel: "", nummer: "3" }] }, { modul: "kein Code", kapitel: [{ titel: "x" }] }, { modul: "B110", kapitel: [{ titel: "doppelt" }] }],
    karten: [{ modul: "B110", faellig: 3 }, { modul: "B120", faellig: -1 }, { modul: "B130", faellig: 2.5 }, { modul: "<b>", faellig: 1 }],
    pruefungen: [{ modul: "B110", titel: "Klausur", datum: "2027-02-10T10:00", anmeldung: "abgemeldet", versuch: 12, note: "1,7", extra: "weg" }, { titel: "ohne Modul" }],
    stundenplan: [{ datum: "2026-10-19", von: "10:15 Uhr", bis: "11:45", titel: "Tutorium", ort: "Zoom, Passwort 1234", modul: "?" }, { datum: "", titel: "ohne Tag" }],
  };
  const l = S.lagebildKurz(roh, geheim, 100000);
  assert.deepEqual(l.lernplan, [{ modul: "B110", kapitel: [{ titel: "Siehe evil.example.com und Link", verstanden: false, nummer: "1.2" }] }]);
  assert.deepEqual(l.karten, [{ modul: "B110", faellig: 3 }]);
  assert.deepEqual(l.pruefungen, [{ modul: "B110", titel: "Klausur", datum: "2027-02-10", note: "1,7" }]);
  assert.deepEqual(l.stundenplan, [{ datum: "2026-10-19", titel: "Tutorium", bis: "11:45" }]);
  // Grenzen je Liste (40 Module, 200 Kapitel je Modul, 300 Einträge im Stundenplan, 120 Prüfungen)
  const kapitel = (n) => Array.from({ length: n }, (y, j) => ({ titel: "K" + j, verstanden: false }));
  const breit = S.lagebildKurz({ lernplan: Array.from({ length: 45 }, (x, i) => ({ modul: "B" + (100 + i), kapitel: kapitel(2) })),
    karten: Array.from({ length: 45 }, (x, i) => ({ modul: "B" + (100 + i), faellig: 1 })) }, null, 1e9);
  assert.equal(breit.lernplan.length, 40);
  assert.equal(breit.karten.length, 40);
  assert.equal(S.lagebildKurz({ lernplan: [{ modul: "B110", kapitel: kapitel(210) }] }, null, 1e9).lernplan[0].kapitel.length, 200);
  const viele = {
    lernplan: Array.from({ length: 45 }, (x, i) => ({ modul: "B" + (100 + i), kapitel: kapitel(210) })),
    stundenplan: Array.from({ length: 320 }, () => ({ datum: "2026-10-19", titel: "LV" })),
    pruefungen: Array.from({ length: 130 }, () => ({ modul: "B110" })),
  };
  const v = S.lagebildKurz({ stundenplan: viele.stundenplan, pruefungen: viele.pruefungen }, null, 1e9);
  assert.equal(v.stundenplan.length, 300);
  assert.equal(v.pruefungen.length, 100);
  const w = S.lagebildKurz(viele, null, 1e9);
  assert.ok(w.lernplan.length <= 40 && w.lernplan.every((x) => x.kapitel.length <= 200));
  // in Bytes: höchstens das Budget, die größte Liste verliert zuerst, nie mitten in einem Eintrag
  const k = S.lagebildKurz(viele, null, 20000);
  assert.ok(Buffer.byteLength(JSON.stringify(k)) <= 20000, Buffer.byteLength(JSON.stringify(k)) + " Bytes");
  assert.ok(k.stundenplan.every((e) => e.titel === "LV") && k.lernplan.every((x) => x.kapitel.length > 0));
  assert.ok(Buffer.byteLength(JSON.stringify(S.lagebildKurz(viele, null, 1e9))) <= 120000, "höchstens 120 000 Bytes");
  assert.deepEqual(S.lagebildKurz(viele, null, 0), { lernplan: [], karten: [], pruefungen: [], stundenplan: [] });
  assert.deepEqual(S.lagebildKurz(null, null, 1000), { lernplan: [], karten: [], pruefungen: [], stundenplan: [] });
});

test("Lagebild: ein Ausfall als eigenes Feld, nicht im Titel; ein langer Titel kürzt ihn nicht weg (Plugin → Server → Werkzeuge)", async () => {
  const { lagebildPruefen } = await modul("claude-app.mjs");
  const { ORDNER, LAGE } = await modul("claude-app.mjs");
  const { quelleServer } = await modul("mcp-quelle-server.mjs");
  const { werkzeuge } = await modul("mcp-werkzeuge.mjs");
  const lang = "Vertiefung Mikroökonomik: Spieltheorie, Verhandlungen und Mechanismen im Wettbewerb mit unvollständiger Information (Übung)";
  assert.ok(lang.length > 115);
  const L = laden("server", { heute: "2026-10-18", kontext: { zentral: Z, obsidian: { Modal: class {}, Notice: class {}, Platform: {}, Setting } } });
  const heute = new Date(), tag = (n) => { const d = new Date(heute.getFullYear(), heute.getMonth(), heute.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  L.ctx.modell = { daten: () => ({ module: [], stundenplan: [{ fm: { titel: lang, code: "B110" }, f: { basename: "B110 Übung" } }] }),
    findetStatt: (fm, d) => (d === tag(0) ? { grund: "ausfall", beginn: "10:15", ende: "11:45" } : d === tag(1) ? { statt: true, beginn: "10:15", ende: "11:45", raum: "HS 9" } : {}),
    pruefungen: () => [] };
  const obs = (await L.ctx.server.lagebildObs()).stundenplan;
  assert.deepEqual(obs.map((e) => [e.datum, e.titel, e.ausfall === true]), [[tag(0), lang, true], [tag(1), lang, false]], "Titel ohne „(fällt aus)“");
  const kurz = S.lagebildKurz({ stundenplan: obs }, null, 1e5).stundenplan;
  assert.equal(kurz[0].titel.length, 120, "der Titel ist gekürzt");
  assert.deepEqual([kurz[0].ausfall, kurz[1].ausfall], [true, undefined], "der Ausfall bleibt");
  const angenommen = lagebildPruefen({ stundenplan: kurz }, tag(0)).stundenplan;
  assert.equal(angenommen[0].ausfall, true);
  const v = fs.mkdtempSync(path.join(os.tmpdir(), "studium-claude-app-ausfall-"));
  try {
    fs.mkdirSync(path.join(v, ORDNER.daten), { recursive: true });
    fs.writeFileSync(path.join(v, ORDNER.daten, LAGE), JSON.stringify({ schema: 1, stand_empfangen: new Date().toISOString(),
      stand: { module: ["B110"], termine: [], todos: [] }, lagebild: { stundenplan: angenommen }, eingang: { termine: [], hinweise: [] } }));
    const lehre = werkzeuge(quelleServer(v)).aufrufen("ueberblick", { von: tag(0), tage: 2 }).daten.tage.map((t) => t.lehre[0]);
    assert.deepEqual(lehre.map((x) => x.faellt_aus === true), [true, false]);
  } finally { fs.rmSync(v, { recursive: true, force: true }); }
});

test("Lagebild aus den Lesern: Kapitel mit Häkchen und Woche des Plans (lernplan.js kapitelStand)", async () => {
  const notiz = "---\ntyp: lernplan\ncode: B110\n---\n# B110 Lernplan\n\n## Kapitel\n- [x] 1 Grundlagen · 20 S.\n- [ ] 2 Entscheidungen · 30 S.\n  - [x] 2.1 Teil\n  - [ ] 2.2 Teil\n- [ ] 3 Märkte · 10 S.\n";
  const { ctx } = laden("lernplan", { heute: "2026-10-20", notizen: { "Lernplan/B110 Lernplan.md": { typ: "lernplan", code: "B110" } } });
  ctx.app.vault.cachedRead = async () => notiz;
  ctx.app.metadataCache.getFirstLinkpathDest = () => null;
  const semester = { name: "WS 2026/27", vb: "2026-10-12", ve: "2027-02-05", beginn: "2026-10-01", ende: "2027-03-31" };
  ctx.modell = {
    daten: () => ({ module: [{ code: "B110", titel: "BWL", status: "offen", fm: {}, ects: 6 }], pausen: [], freieTage: [], zielnote: "", einstellungen: {}, termine: [] }),
    semesterFuer: () => semester, semesterNachName: () => semester,
    pruefungVon: (code) => (code === "B110" ? { datum: "2027-02-10", titel: "Klausur" } : null),
    pruefungen: () => [{ code: "B110", datum: "2027-02-10", titel: "Klausur", zwischentest: false, nachhol: false, offen: true }],
  };
  let liste;
  try { liste = await ctx.lernplan.kapitelStand(); } catch (e) { liste = null; console.error(e); }
  assert.ok(Array.isArray(liste), "kapitelStand liefert eine Liste");
  assert.equal(liste.length, 1);
  assert.equal(liste[0].modul, "B110");
  assert.deepEqual(liste[0].kapitel.map((k) => [k.nummer, k.titel, k.verstanden]), [["1", "Grundlagen", true], ["2", "Entscheidungen", false], ["3", "Märkte", false]]);
  assert.ok(liste[0].kapitel.every((k) => /^\d{4}-\d{2}-\d{2}$/.test(k.woche) && new Date(k.woche + "T12:00").getDay() === 1), "Woche als Montag");
  const l = S.lagebildKurz({ lernplan: liste }, null, 1e5);
  assert.deepEqual(l.lernplan[0].kapitel.map((k) => Object.keys(k).sort()), [["nummer", "titel", "verstanden", "woche"], ["nummer", "titel", "verstanden", "woche"], ["nummer", "titel", "verstanden", "woche"]]);
});

test("Name „Eigener Server“: kein „Eigener Server mit Claude“ mehr außer in veröffentlichten Abschnitten des Changelogs", () => {
  // werkzeuge/release.py fehlt im veröffentlichten Baum
  const dateien = ["README.md", "docs/datenschutz.md", "docs/installation.md", "docs/architektur.md", "werkzeuge/release.py"]
    .filter((d) => fs.existsSync(path.join(WURZEL, d))).concat(fs.readdirSync(path.join(WURZEL, "docs", "architektur")).filter((n) => n.endsWith(".md") && n !== "server.md").map((n) => "docs/architektur/" + n));
  const tiefer = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === "node_modules" ? [] : tiefer(path.join(d, e.name)))
    : /\.(md|js)$/.test(e.name) ? [path.relative(WURZEL, path.join(d, e.name)).replace(/\\/g, "/")] : []));
  const funde = dateien.concat(tiefer(path.join(WURZEL, "Studium Autopilot")))
    .filter((d) => /[Ee]igene[rnm]? Server mit Claude/.test(fs.readFileSync(path.join(WURZEL, d), "utf8")));
  assert.deepEqual(funde, []);
  // Unveröffentlicht im Changelog auch nicht
  const changelog = fs.readFileSync(path.join(WURZEL, "CHANGELOG.md"), "utf8").replace(/\r\n/g, "\n");
  const neu = (changelog.split(/^## /m).find((a) => a.startsWith("Unveröffentlicht")) || "");
  assert.doesNotMatch(neu, /Server mit Claude/);
  // die Marke: ein Satz im README
  assert.match(fs.readFileSync(path.join(WURZEL, "README.md"), "utf8"), /Claude ist eine\s+Marke der Anthropic, PBC; Studium Autopilot ist kein Angebot von Anthropic und steht in keiner Verbindung zu Anthropic\./);
});

test("Hilfe „Claude-App“: nur, was diese Fassung kann (keine Notizen, keine PDFs), mit dem Weg über das Fenster", () => {
  const seite = fs.readFileSync(path.join(WURZEL, "Studium Autopilot", "Studium", "Einstellungen & Hilfe.md"), "utf8").replace(/\r\n/g, "\n");
  const karte = seite.slice(seite.indexOf("[!eba-karte|hilfe|claude]"), seite.indexOf("[!eba-karte|hilfe|aufbau]"));
  assert.ok(karte.length > 100, "Karte gefunden");
  assert.match(karte, /\*\*Eigener Server\*\* → \*\*Mit der Claude-App verbinden\*\*/);
  for (const w of ["Termine", "To-dos", "Lernplan", "Karteikarten", "Noten", "Stundenplan", "ändert nichts"]) assert.ok(karte.includes(w), w);
  assert.doesNotMatch(karte, /Notizen|PDF|Texte deiner/, "Notizen und PDFs erst mit der Kopie des Tresors");
  // der Knopf, auf den die Karte zeigt, ist in derselben Fassung da
  assert.match(fs.readFileSync(path.join(SKRIPTE, "server.js"), "utf8"), /text: "Mit der Claude-App verbinden"/);
});
