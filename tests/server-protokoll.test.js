// Verbinden ab 0.7.8 und signierte Anfragen zwischen Plugin (server.js) und eigenem Server (server/verbinden.mjs, server/kanal.mjs,
// server/dienst.mjs): bekannte Werte für die Bausteine, dieselben Ableitungen auf beiden Seiten, Zeitfenster, Zufallswerte, Körper,
// Beweis des Datenschlüssels beim Anstoß, der Weg bis 0.7.7 (Code und Bearer) beim Server. Ohne server/ übersprungen.
"use strict";
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const assert = require("node:assert/strict");
const { laden } = require("./laden.js");

const SERVER = path.join(__dirname, "..", "server");
const da = fs.existsSync(path.join(SERVER, "dienst.mjs"));
const test = (name, fn) => require("node:test")(name, { skip: !da && "server/ fehlt in diesem Baum" }, fn);
const modul = (d) => import(pathToFileURL(path.join(SERVER, d)).href);
const ordner = () => fs.mkdtempSync(path.join(os.tmpdir(), "studium-protokoll-"));
const P = laden("server", { heute: "2026-10-18", kontext: { zentral: {} } }).ctx.server.protokoll;
const hex = (b) => Buffer.from(b).toString("hex");
const b64u = (b) => Buffer.from(b).toString("base64url");
const text = (s) => new TextEncoder().encode(s);

// Name eines Servers, wie ihn die Einrichtung vergibt (IP mit Bindestrichen bei einem Dienst, der ihn auf diese IP zeigen lässt)
const HOST = "1-2-3-4.ss" + "lip.io", ANDERER = "5-6-7-8.ss" + "lip.io";

// Feste Schlüssel für bekannte Werte: 32 Byte 0x01 bzw. 0x02
const FEST = { zugang: b64u(Buffer.alloc(32, 1)), schluessel: b64u(Buffer.alloc(32, 2)) };

test("Bausteine im Plugin: PBKDF2 (RFC 7914), HKDF (RFC 5869), HMAC (RFC 4231) über Web Crypto", async () => {
  // RFC 7914, Abschnitt 11 (PBKDF2-HMAC-SHA256): die ersten 32 Byte
  assert.equal(hex(await P.pbkdf2(text("passwd"), text("salt"), 1)), "55ac046e56e3089fec1691c22544b605f94185216dde0465e68b9d57c20dacbc");
  assert.equal(hex(await P.pbkdf2(text("Password"), text("NaCl"), 80000)), "4ddcd8f60b98be21830cee5ef22701f9641a4418d04c0414aeff08876b34ab56");
  // RFC 5869, Testfall 1: die ersten 32 Byte
  assert.equal(hex(await P.hkdf(new Uint8Array(22).fill(0x0b), Buffer.from("f0f1f2f3f4f5f6f7f8f9", "hex"), Buffer.from("000102030405060708090a0b0c", "hex"))),
    "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf");
  // RFC 4231, Testfall 2
  assert.equal(hex(await P.hmac(text("Jefe"), text("what do ya want for nothing?"))), "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843");
});

test("Ableitung aus dem Code: Plugin (Web Crypto) und Server (node:crypto) ergeben dieselben festen Werte; Host im Salz; mindestens 300 000 Runden", async () => {
  const { codeAbleiten, KDF, hostVon } = await modul("verbinden.mjs");
  assert.ok(KDF.runden >= 300000);
  assert.equal(P.KDF_RUNDEN, KDF.runden, "dieselben Runden auf beiden Seiten");
  const fest = { kennung: "gsChuR4fUdCQ3usC44QJAkQnt5LRRcbproN_898vI94", beweis: "NZzumtKnQ0zHIOWK2qc8RzctlNnhCAzrYasAqHi7XSU",
    antwort: "UxGAFo00WaHknlXSGzgQfZRMpazQAvFaba2Omi1mOPI" };
  assert.deepEqual(codeAbleiten("ABCDE-FGHJK", HOST), fest);
  const p = await P.codeAbleiten("abcde fghjk", HOST);
  assert.deepEqual({ kennung: b64u(p.kennung), beweis: b64u(p.beweis), antwort: b64u(p.antwort) }, fest, "Schreibweise des Codes egal");
  // unabhängig nachgerechnet, wie die Doku es beschreibt
  const m = crypto.pbkdf2Sync("ABCDEFGHJK", "studium-autopilot/verbinden/v2/code\n" + HOST, 600000, 32, "sha256");
  assert.equal(b64u(crypto.hkdfSync("sha256", m, Buffer.alloc(0), "studium-autopilot/verbinden/v2/kennung", 32)), fest.kennung);
  assert.notEqual(codeAbleiten("ABCDE-FGHJK", ANDERER).kennung, fest.kennung, "ein anderer Host, eine andere Kennung");
  assert.notEqual(codeAbleiten("ABCDE-FGHJL", HOST).kennung, fest.kennung);
  assert.equal(hostVon("https://1-2-3-4.SS" + "LIP.io"), HOST);
  assert.equal(hostVon("kaputt"), "");
});

test("Signatur einer Anfrage: Plugin und Server ergeben denselben Kopf (fester Wert), mit und ohne Beweis", async () => {
  const { signieren, inhaltVon, INHALT_LEER } = await modul("kanal.mjs");
  const body = "{\"quarantaene\":\"erneut\"}";
  const kopf = "Studium-Signatur v=1,zeit=1793000000,nonce=AAAAAAAAAAAAAAAAAAAAAA,inhalt=B7pxvQNJluEvQ95-mkYLoVAKUSze_9xEsaQawPCcPe4," +
    "signatur=qrx3f0Y0fMi_uFwrcWJ1ih6KDeEZrIQ57ELFxPlJlDw,beweis=w_ZH8dUTmE6Mv9t5ENTv-OHnKM-_8CFM3y8V7KAryyQ";
  const o = { zeit: 1793000000, nonce: "A".repeat(22) };
  assert.equal(await P.anfrageKopf(FEST, "POST", "/v1/anstoss", body, true, o), kopf);
  assert.equal(signieren(FEST, "POST", "/v1/anstoss", inhaltVon(body), Object.assign({ mitBeweis: true }, o)), kopf);
  const ohne = await P.anfrageKopf(FEST, "GET", "/v1/eingang", undefined, false, o);
  assert.equal(ohne, signieren(FEST, "GET", "/v1/eingang", INHALT_LEER, o));
  assert.doesNotMatch(ohne, /beweis=/);
  assert.ok(!ohne.includes(FEST.zugang) && !kopf.includes(FEST.schluessel), "kein Schlüssel im Kopf");
  // eine echte Anfrage: jedes Mal ein anderer Zufallswert
  const a = await P.anfrageKopf(FEST, "GET", "/v1/eingang"), b = await P.anfrageKopf(FEST, "GET", "/v1/eingang");
  assert.notEqual(a, b);
  assert.ok(Math.abs(Number(/zeit=(\d+)/.exec(a)[1]) * 1000 - Date.now()) < 5000, "die echte Uhr");
});

test("Zufallswerte: jeder nur einmal; je Netz eine Quote, voll fällt der älteste des Netzes mit den meisten weg, nie ein Aussperren; ein verdrängter gilt nicht noch einmal", async () => {
  const { NonceSpeicher } = await modul("kanal.mjs");
  const s = new NonceSpeicher(4, { quote: 2 });
  // bis: Ende des Fensters (Zeit der Anfrage + Fenster), wie signaturPruefen es gibt
  assert.equal(s.merken("a", 1000, 0, "angreifer"), "ok");
  assert.equal(s.merken("a", 1000, 500, "angreifer"), "wiederholt");
  assert.equal(s.merken("b", 1001, 500, "angreifer"), "ok");
  assert.equal(s.merken("c", 1002, 500, "angreifer"), "ok", "Quote: der älteste dieses Netzes (a) fällt weg");
  assert.deepEqual([s.werte.has("a"), s.je.get("angreifer"), s.verdraengtBis], [false, 2, 1000]);
  assert.equal(s.merken("a", 1000, 600, "angreifer"), "wiederholt", "verdrängt, aber nicht noch einmal");
  assert.equal(s.merken("g1", 1003, 500, "geraet"), "ok", "das Gerät kommt immer durch");
  assert.equal(s.merken("g2", 1004, 500, "geraet"), "ok");
  assert.equal(s.merken("x", 1005, 500, "drittes"), "ok", "voll: der älteste des Netzes mit den meisten fällt weg");
  assert.equal(s.werte.size, 4);
  assert.equal(s.merken("g1", 1003, 600, "geraet"), "wiederholt", "die Werte des Geräts bleiben");
  assert.equal(s.merken("y", 3000, 1500, "drittes"), "ok", "Abgelaufenes fällt zuerst weg");
  assert.equal(s.werte.size, 1);
});

test("Zufallswerte: Wer aus vielen Netzen flutet, verdrängt den Wert des Geräts, aber der mitgelesene gilt danach nicht noch einmal", async () => {
  const { NonceSpeicher } = await modul("kanal.mjs");
  const s = new NonceSpeicher(20, { quote: 1 });
  const F = 300e3;
  assert.equal(s.merken("echt", F, 0, "geraet"), "ok");
  // 20 Netze, je eine Anfrage, ein paar Sekunden später: der Wert des Geräts ist weg
  for (let i = 0; i < 20; i++) assert.equal(s.merken("f" + i, 1000 + i + F, 1000 + i, "netz" + i), "ok");
  assert.equal(s.werte.has("echt"), false);
  assert.equal(s.merken("echt", F, 2000, "anderes"), "wiederholt", "mitgelesen und nach der Flut wiederholt");
  // eine neue Anfrage des Geräts (späteres Fenster) geht
  assert.equal(s.merken("neu", 3000 + F, 3000, "geraet"), "ok");
});

test("Zufallswerte über einen Neustart: das Protokoll in web/ bringt sie zurück, nur gültige, und bleibt klein", async () => {
  const { NonceSpeicher } = await modul("kanal.mjs");
  const v = ordner(), datei = path.join(v, "nonces.log");
  try {
    const n = (i) => ("n" + i).padEnd(22, "x");
    const a = new NonceSpeicher(3, { quote: 3, datei, jetztMs: 0 });
    assert.equal(a.merken(n(1), 1000, 0, "netz a"), "ok");
    assert.equal(a.merken(n(2), 5000, 0, "netz-b"), "ok");
    fs.appendFileSync(datei, "kaputt\n" + "y".repeat(22) + " nein netz\n");
    const b = new NonceSpeicher(3, { quote: 3, datei, jetztMs: 2000 });
    assert.equal(b.merken(n(2), 5000, 2000, "netz-b"), "wiederholt", "nach dem Neustart bekannt");
    assert.equal(b.merken(n(1), 9000, 2000, "netz-b"), "ok", "abgelaufen, nicht geladen");
    assert.equal(b.werte.get(n(2)).netz, "netz-b");
    for (let i = 3; i < 12; i++) b.merken(n(i), 10000 + i, 2000, "netz-b");
    const zeilen = fs.readFileSync(datei, "utf8").trim().split("\n");
    assert.ok(zeilen.length <= 7, "neu geschrieben, wenn es über 2 × max Zeilen hat");
    // das späteste Ende eines verdrängten Werts steht mit darin: auch nach dem Neustart gilt keiner von ihnen
    assert.match(zeilen[0], /^~ 100\d\d$/);
    const c = new NonceSpeicher(3, { quote: 3, datei, jetztMs: 2500 });
    assert.equal(c.verdraengtBis, b.verdraengtBis);
    assert.equal(c.merken(n(3), 10003, 2500, "netz-c"), "wiederholt", "verdrängt vor dem Neustart");
  } finally { fs.rmSync(v, { recursive: true, force: true }); }
});

test("Dienst: eine signierte Anfrage gilt nach einem Neustart nicht noch einmal; die freien Bits der Signatur ändern nichts", async () => {
  const { erzeugeDienst } = await modul("dienst.mjs");
  const { neuerSchluessel, signieren, INHALT_LEER } = await modul("kanal.mjs");
  const v = ordner();
  const konfig = { zugang: neuerSchluessel(), schluessel: neuerSchluessel(), adresse: "https://beispiel.example", version: "0.0.0-test" };
  const starten = async () => { const s = erzeugeDienst({ konfig, verzeichnis: v }); await new Promise((r) => s.listen(0, "127.0.0.1", r)); return s; };
  const holen = async (s, authorization) => (await fetch(`http://127.0.0.1:${s.address().port}/v1/eingang`, { headers: { authorization } })).status;
  let s = await starten();
  try {
    const k = signieren(konfig, "GET", "/v1/eingang", INHALT_LEER, { zeit: Math.floor(Date.now() / 1000), nonce: "r".repeat(22) });
    assert.equal(await holen(s, k), 200);
    await new Promise((r) => s.close(r));
    s = await starten();
    assert.equal(await holen(s, k), 401, "nach dem Neustart wiederholt");
    // dieselbe Signatur in einer anderen Schreibweise (letztes Zeichen, freie Bits) gilt nicht
    const k2 = signieren(konfig, "GET", "/v1/eingang", INHALT_LEER, { zeit: Math.floor(Date.now() / 1000), nonce: "s".repeat(22) });
    const sig = /signatur=([\w-]{43})/.exec(k2)[1], A = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const i = A.indexOf(sig[42]), anders = A[(i & ~3) | ((i + 1) & 3)];
    assert.equal(await holen(s, k2.replace("signatur=" + sig, "signatur=" + sig.slice(0, 42) + anders)), 401);
    assert.equal(await holen(s, k2), 200);
  } finally {
    await new Promise((r) => s.close(r));
    fs.rmSync(v, { recursive: true, force: true });
  }
});

test("Signierte Anfragen am Dienst: Fenster von 5 Minuten, Zufallswert einmal, Pfad, Methode und Körper geprüft; Anstoß nur mit Beweis; Bearer bis 0.7.7 geht weiter", async () => {
  const { erzeugeDienst } = await modul("dienst.mjs");
  const { neuerSchluessel, signieren, inhaltVon, INHALT_LEER, verschluesseln } = await modul("kanal.mjs");
  const v = ordner();
  const uhr = { t: Date.parse("2026-11-02T08:00:00Z") };
  const konfig = { zugang: neuerSchluessel(), schluessel: neuerSchluessel(), adresse: "https://beispiel.example", version: "0.0.0-test" };
  const server = erzeugeDienst({ konfig, verzeichnis: v, jetzt: () => new Date(uhr.t), uhr: () => uhr.t });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const basis = `http://127.0.0.1:${server.address().port}`;
  let n = 0;
  const kopf = (methode, pfad, body, o = {}) => signieren(o.konfig || konfig, methode, pfad, body == null ? INHALT_LEER : inhaltVon(body),
    { zeit: Math.floor((o.zeit === undefined ? uhr.t : o.zeit) / 1000), nonce: o.nonce || ("z" + String(n++)).padEnd(22, "x"), mitBeweis: !!o.beweis });
  const holen = async (pfad, { methode = "GET", body, authorization, wer = "198.51.100.7" } = {}) => {
    const r = await fetch(basis + pfad, { method: methode, headers: Object.assign({ "x-forwarded-for": wer }, authorization ? { authorization } : {}), body });
    const t = await r.text();
    return [r.status, t ? JSON.parse(t) : null];
  };
  try {
    const k = kopf("GET", "/v1/eingang");
    assert.equal((await holen("/v1/eingang", { authorization: k }))[0], 200, "signiert");
    assert.deepEqual(await holen("/v1/eingang", { authorization: k }), [401, { fehler: "wiederholt", signatur: 1 }], "dieselbe Anfrage noch einmal");
    for (const d of [-5 * 60e3 - 1000, 5 * 60e3 + 1000]) {
      assert.deepEqual(await holen("/v1/eingang", { authorization: kopf("GET", "/v1/eingang", null, { zeit: uhr.t + d }) }), [401, { fehler: "uhr", signatur: 1 }], "abgelaufen: " + d);
    }
    assert.equal((await holen("/v1/eingang", { authorization: kopf("GET", "/v1/eingang", null, { zeit: uhr.t - 4 * 60e3 }) }))[0], 200, "4 Minuten alt geht");
    // falscher Schlüssel, anderer Pfad, andere Methode, verfälschter Kopf
    const fremd = { zugang: neuerSchluessel(), schluessel: konfig.schluessel };
    assert.deepEqual(await holen("/v1/eingang", { authorization: kopf("GET", "/v1/eingang", null, { konfig: fremd }) }), [401, { fehler: "zugang", signatur: 1 }]);
    assert.equal((await holen("/v1/eingang", { authorization: kopf("GET", "/v1/status") }))[0], 401, "für einen anderen Pfad signiert");
    assert.equal((await holen("/v1/eingang", { authorization: kopf("POST", "/v1/eingang") }))[0], 401, "für eine andere Methode signiert");
    assert.equal((await holen("/v1/eingang", { authorization: kopf("GET", "/v1/eingang").replace("v=1", "v=2") }))[0], 401);
    assert.equal((await holen("/v1/eingang", { authorization: kopf("GET", "/v1/eingang", "{}") }))[0], 400, "GET mit Körper-Prüfsumme");
    // Körper: genau der signierte
    const stand = JSON.stringify(await verschluesseln(konfig.schluessel, "stand", { schema: 1, module: ["B110"] }));
    assert.equal((await holen("/v1/stand", { methode: "POST", body: stand, authorization: kopf("POST", "/v1/stand", stand) }))[0], 204);
    const anders = JSON.stringify(await verschluesseln(konfig.schluessel, "stand", { schema: 1, module: ["E101"] }));
    assert.equal((await holen("/v1/stand", { methode: "POST", body: anders, authorization: kopf("POST", "/v1/stand", stand) }))[0], 400, "Körper unterwegs getauscht");
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(v, "web", "stand-plugin.json"), "utf8")).module, ["B110"]);
    // Status signiert: alles, und ab dann geschützt
    const [st, status] = await holen("/v1/status", { authorization: kopf("GET", "/v1/status") });
    assert.equal(st, 200);
    assert.ok("grenzen" in status);
    assert.deepEqual(await holen("/v1/status"), [401, { fehler: "zugang", signatur: 1 }]);
    // Anstoß: signiert nur mit Beweis des Datenschlüssels, ein falscher Beweis zählt nicht
    assert.deepEqual(await holen("/v1/anstoss", { methode: "POST", authorization: kopf("POST", "/v1/anstoss") }), [403, { fehler: "datenschluessel" }]);
    const falscherBeweis = kopf("POST", "/v1/anstoss", null, { beweis: true, konfig: { zugang: konfig.zugang, schluessel: neuerSchluessel() } });
    assert.deepEqual(await holen("/v1/anstoss", { methode: "POST", authorization: falscherBeweis }), [403, { fehler: "datenschluessel" }]);
    assert.ok(!fs.existsSync(path.join(v, "web", "anstoss")), "kein Lauf ohne Beweis");
    assert.deepEqual(await holen("/v1/anstoss", { methode: "POST", authorization: kopf("POST", "/v1/anstoss", null, { beweis: true }) }), [200, { angestossen: true }]);
    // Plugins bis 0.7.7: der Schlüssel selbst im Kopf geht weiter, nur keinen Anstoß mehr, seit hier ein Gerät signiert
    const bearer = "Bearer " + konfig.zugang;
    assert.equal((await holen("/v1/eingang", { authorization: bearer }))[0], 200);
    assert.equal((await holen("/v1/status", { authorization: bearer }))[0], 200);
    uhr.t += 31 * 60e3;
    const quarantaene = JSON.stringify({ quarantaene: "erneut" });
    assert.deepEqual(await holen("/v1/anstoss", { methode: "POST", authorization: bearer, body: quarantaene }), [403, { fehler: "veraltet" }], "kein Lauf ohne Datenschlüssel");
    assert.equal(JSON.parse(fs.readFileSync(path.join(v, "web", "anstoss"), "utf8")).quarantaene, undefined, "auch keine Quarantäne wieder eingereiht");
    // falsche Signaturen zählen als Fehlversuche wie ein falscher Bearer; dann sperrt das Netz, eine gültige Signatur geht trotzdem
    for (let i = 0; i < 10; i++) await holen("/v1/eingang", { wer: "203.0.113.9", authorization: kopf("GET", "/v1/eingang", null, { konfig: fremd }) });
    assert.equal((await holen("/v1/eingang", { wer: "203.0.113.9", authorization: kopf("GET", "/v1/eingang", null, { konfig: fremd }) }))[0], 429);
    assert.equal((await holen("/v1/eingang", { wer: "203.0.113.9", authorization: kopf("GET", "/v1/eingang") }))[0], 200);
  } finally {
    await new Promise((r) => server.close(r));
    fs.rmSync(v, { recursive: true, force: true });
  }
});

test("Bearer bis 0.7.7: geht, solange kein Gerät signiert hat (auch der Anstoß); danach ohne Anstoß und nur, bis 7 Tage lang keiner durchkam", async () => {
  const { erzeugeDienst, BEARER_FRIST } = await modul("dienst.mjs");
  const { neuerSchluessel, signieren, INHALT_LEER } = await modul("kanal.mjs");
  const v = ordner();
  const uhr = { t: Date.parse("2026-11-02T08:00:00Z") };
  const konfig = { zugang: neuerSchluessel(), schluessel: neuerSchluessel(), adresse: "https://beispiel.example", version: "0.0.0-test" };
  const server = erzeugeDienst({ konfig, verzeichnis: v, jetzt: () => new Date(uhr.t), uhr: () => uhr.t });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  let n = 0;
  const holen = async (pfad, authorization, methode = "GET") => {
    const r = await fetch(`http://127.0.0.1:${server.address().port}${pfad}`, { method: methode, headers: { "x-forwarded-for": "198.51.100.7", authorization } });
    const t = await r.text();
    return [r.status, t ? JSON.parse(t) : null];
  };
  const signiert = (pfad) => signieren(konfig, "GET", pfad, INHALT_LEER, { zeit: Math.floor(uhr.t / 1000), nonce: ("b" + String(n++)).padEnd(22, "x") });
  const bearer = "Bearer " + konfig.zugang, TAG = 864e5;
  try {
    assert.equal(BEARER_FRIST, 7 * TAG);
    // ein Server, mit dem nur Plugins bis 0.7.7 sprechen: alles wie bisher, auch der Anstoß, über jede Frist hinaus
    assert.deepEqual(await holen("/v1/anstoss", bearer, "POST"), [200, { angestossen: true }]);
    uhr.t += 30 * TAG;
    assert.equal((await holen("/v1/eingang", bearer))[0], 200);
    // das erste Gerät signiert: Bearer geht weiter (ohne Anstoß), jeder Bearer verlängert die Frist
    assert.equal((await holen("/v1/eingang", signiert("/v1/eingang")))[0], 200);
    assert.ok(fs.existsSync(path.join(v, "web", "signatur-gesehen.json")));
    uhr.t += 6 * TAG;
    assert.equal((await holen("/v1/eingang", bearer))[0], 200, "nach 6 Tagen");
    uhr.t += 6 * TAG;
    assert.equal((await holen("/v1/eingang", bearer))[0], 200, "6 Tage nach dem letzten Bearer");
    // 7 Tage lang kein Bearer: danach keiner mehr, auf keinem Weg, kein Fehlversuch; Signaturen gehen weiter
    uhr.t += 7 * TAG + 60e3;
    assert.deepEqual(await holen("/v1/eingang", bearer), [401, { fehler: "veraltet", signatur: 1 }]);
    for (let i = 0; i < 12; i++) await holen("/v1/eingang", bearer);
    assert.equal((await holen("/v1/eingang", signiert("/v1/eingang")))[0], 200, "kein Fehlversuch, nichts gesperrt");
    uhr.t += 60e3;
    assert.equal((await holen("/v1/eingang", bearer))[0], 401, "ein abgelehnter verlängert nichts");
  } finally {
    await new Promise((r) => server.close(r));
    fs.rmSync(v, { recursive: true, force: true });
  }
});

test("Bearer bis 0.7.7: kam nach der ersten Signatur nie einer durch, zählen die 7 Tage ab ihr", async () => {
  const { erzeugeDienst } = await modul("dienst.mjs");
  const { neuerSchluessel, signieren, INHALT_LEER } = await modul("kanal.mjs");
  const v = ordner();
  const uhr = { t: Date.parse("2026-11-02T08:00:00Z") };
  const konfig = { zugang: neuerSchluessel(), schluessel: neuerSchluessel(), adresse: "https://beispiel.example", version: "0.0.0-test" };
  const server = erzeugeDienst({ konfig, verzeichnis: v, jetzt: () => new Date(uhr.t), uhr: () => uhr.t });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const holen = async (authorization) => (await fetch(`http://127.0.0.1:${server.address().port}/v1/eingang`, { headers: { authorization } })).status;
  try {
    assert.equal(await holen(signieren(konfig, "GET", "/v1/eingang", INHALT_LEER, { zeit: Math.floor(uhr.t / 1000), nonce: "c".repeat(22) })), 200);
    uhr.t += 7 * 864e5 + 60e3;
    assert.equal(await holen("Bearer " + konfig.zugang), 401);
  } finally {
    await new Promise((r) => server.close(r));
    fs.rmSync(v, { recursive: true, force: true });
  }
});

test("Bearer bis 0.7.7: 30 Tage nach der ersten Signatur Schluss, auch wenn alle paar Tage einer kam; danach nie wieder, auch nicht mit zurückgestellter Uhr oder nach einem Neustart", async () => {
  const { erzeugeDienst, BEARER_SCHLUSS } = await modul("dienst.mjs");
  const { neuerSchluessel, signieren, INHALT_LEER } = await modul("kanal.mjs");
  const v = ordner();
  const TAG = 864e5, uhr = { t: Date.parse("2026-11-02T08:00:00Z") };
  const konfig = { zugang: neuerSchluessel(), schluessel: neuerSchluessel(), adresse: "https://beispiel.example", version: "0.0.0-test" };
  const starten = async () => { const s = erzeugeDienst({ konfig, verzeichnis: v, jetzt: () => new Date(uhr.t), uhr: () => uhr.t }); await new Promise((r) => s.listen(0, "127.0.0.1", r)); return s; };
  const holen = async (s, authorization) => (await fetch(`http://127.0.0.1:${s.address().port}/v1/eingang`, { headers: { authorization } })).status;
  const bearer = "Bearer " + konfig.zugang;
  let s = await starten();
  try {
    assert.equal(BEARER_SCHLUSS, 30 * TAG);
    assert.equal(await holen(s, signieren(konfig, "GET", "/v1/eingang", INHALT_LEER, { zeit: Math.floor(uhr.t / 1000), nonce: "d".repeat(22) })), 200);
    const erste = uhr.t;
    // alle 6 Tage ein Bearer: bis 30 Tage nach der ersten Signatur geht er
    while (uhr.t + 6 * TAG <= erste + 30 * TAG) {
      uhr.t += 6 * TAG;
      assert.equal(await holen(s, bearer), 200, "Tag " + (uhr.t - erste) / TAG);
    }
    uhr.t = erste + 30 * TAG + 60e3;
    assert.equal(await holen(s, bearer), 401, "30 Tage nach der ersten Signatur");
    assert.ok(fs.existsSync(path.join(v, "web", "bearer-aus.json")), "Marke geschrieben");
    uhr.t -= 5 * TAG;
    assert.equal(await holen(s, bearer), 401, "Uhr zurück: bleibt aus");
    await new Promise((r) => s.close(r));
    s = await starten();
    assert.equal(await holen(s, bearer), 401, "nach dem Neustart: bleibt aus");
  } finally {
    await new Promise((r) => s.close(r));
    fs.rmSync(v, { recursive: true, force: true });
  }
});

test("Bearer bis 0.7.7: nach 7 Tagen ohne Bearer aus; die Uhr zurückzustellen bringt ihn nicht wieder", async () => {
  const { erzeugeDienst } = await modul("dienst.mjs");
  const { neuerSchluessel, signieren, INHALT_LEER } = await modul("kanal.mjs");
  const v = ordner();
  const TAG = 864e5, uhr = { t: Date.parse("2026-11-02T08:00:00Z") };
  const konfig = { zugang: neuerSchluessel(), schluessel: neuerSchluessel(), adresse: "https://beispiel.example", version: "0.0.0-test" };
  const server = erzeugeDienst({ konfig, verzeichnis: v, jetzt: () => new Date(uhr.t), uhr: () => uhr.t });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const holen = async (authorization) => (await fetch(`http://127.0.0.1:${server.address().port}/v1/eingang`, { headers: { authorization } })).status;
  try {
    assert.equal(await holen(signieren(konfig, "GET", "/v1/eingang", INHALT_LEER, { zeit: Math.floor(uhr.t / 1000), nonce: "e".repeat(22) })), 200);
    uhr.t += 7 * TAG + 60e3;
    assert.equal(await holen("Bearer " + konfig.zugang), 401);
    uhr.t -= 2 * TAG;
    assert.equal(await holen("Bearer " + konfig.zugang), 401, "Uhr zwei Tage zurück");
  } finally {
    await new Promise((r) => server.close(r));
    fs.rmSync(v, { recursive: true, force: true });
  }
});

test("Volle Platte: scheitern die Marken in web/, gehen signierte Anfragen trotzdem durch, und die Marken gelten im Speicher", async () => {
  const { erzeugeDienst } = await modul("dienst.mjs");
  const { neuerSchluessel, signieren, INHALT_LEER } = await modul("kanal.mjs");
  const v = ordner();
  const TAG = 864e5, uhr = { t: Date.parse("2026-11-02T08:00:00Z") };
  const konfig = { zugang: neuerSchluessel(), schluessel: neuerSchluessel(), adresse: "https://beispiel.example", version: "0.0.0-test" };
  const server = erzeugeDienst({ konfig, verzeichnis: v, jetzt: () => new Date(uhr.t), uhr: () => uhr.t });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  let n = 0;
  const holen = async (pfad, authorization) => (await fetch(`http://127.0.0.1:${server.address().port}${pfad}`, { headers: { "x-forwarded-for": "198.51.100.7", authorization } })).status;
  const signiert = (pfad) => signieren(konfig, "GET", pfad, INHALT_LEER, { zeit: Math.floor(uhr.t / 1000), nonce: ("p" + String(n++)).padEnd(22, "x") });
  try {
    // web/ ist nicht mehr beschreibbar: an seiner Stelle eine Datei (so scheitert jedes Schreiben dort, auf jedem System)
    fs.rmSync(path.join(v, "web"), { recursive: true, force: true });
    fs.writeFileSync(path.join(v, "web"), "");
    assert.equal(await holen("/v1/eingang", signiert("/v1/eingang")), 200, "erste Signatur, Marke scheitert");
    assert.equal(await holen("/v1/status", signiert("/v1/status")), 200, "Status, Marke scheitert");
    assert.equal(await holen("/v1/eingang", "Bearer " + konfig.zugang), 200, "Bearer, bearer.json scheitert");
    uhr.t += 7 * TAG + 60e3;
    assert.equal(await holen("/v1/eingang", "Bearer " + konfig.zugang), 401, "die Signatur gilt im Speicher als gesehen");
    uhr.t -= 3 * TAG;
    assert.equal(await holen("/v1/eingang", "Bearer " + konfig.zugang), 401, "bearer-aus gilt im Speicher");
    assert.equal(await holen("/v1/eingang", signiert("/v1/eingang")), 200);
  } finally {
    await new Promise((r) => server.close(r));
    fs.rmSync(v, { recursive: true, force: true });
  }
});

test("Alte Schlüssel nach dem Erneuern: 401 mit erneuert, signiert unter den alten, kein Fehlversuch, nonce gemerkt; nach 30 Tagen wie ein fremder Schlüssel", async () => {
  const { erzeugeDienst, ALT_FRIST } = await modul("dienst.mjs");
  const { neuerSchluessel, signieren, INHALT_LEER, antwortMac } = await modul("kanal.mjs");
  const v = ordner();
  const TAG = 864e5, uhr = { t: Date.parse("2026-11-02T08:00:00Z") };
  const alt = { zugang: neuerSchluessel(), schluessel: neuerSchluessel() };
  const konfig = { zugang: neuerSchluessel(), schluessel: neuerSchluessel(), zugang_alt: alt.zugang, schluessel_alt: alt.schluessel,
    erneuert: new Date(uhr.t - TAG).toISOString(), adresse: "https://beispiel.example", version: "0.0.0-test" };
  const server = erzeugeDienst({ konfig, verzeichnis: v, jetzt: () => new Date(uhr.t), uhr: () => uhr.t });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  let n = 0;
  const senden = async (pfad, mit, o = {}) => {
    const nonce = o.nonce || ("q" + String(n++)).padEnd(22, "x");
    const r = await fetch(`http://127.0.0.1:${server.address().port}${pfad}`, { headers: { "x-forwarded-for": "198.51.100.7",
      authorization: signieren(mit, "GET", pfad, INHALT_LEER, { zeit: Math.floor((o.zeit || uhr.t) / 1000), nonce }) } });
    const text = await r.text(), mac = r.headers.get("studium-signatur");
    return { status: r.status, o: text ? JSON.parse(text) : null, echtAlt: mac === "v=1,mac=" + antwortMac(alt, nonce, r.status, text),
      echtNeu: mac === "v=1,mac=" + antwortMac(konfig, nonce, r.status, text) };
  };
  try {
    assert.equal(ALT_FRIST, 30 * TAG);
    for (const pfad of ["/v1/eingang", "/v1/status"]) {
      const r = await senden(pfad, alt);
      assert.deepEqual([r.status, r.o, r.echtAlt, r.echtNeu], [401, { fehler: "zugang", erneuert: 1, signatur: 1 }, true, false], pfad);
    }
    // kein Fehlversuch: auch nach vielen bleibt es bei 401 erneuert, und ein falscher Schlüssel aus demselben Netz ist nicht gesperrt
    for (let i = 0; i < 12; i++) assert.equal((await senden("/v1/eingang", alt)).o.erneuert, 1);
    const fremd = { zugang: neuerSchluessel(), schluessel: neuerSchluessel() };
    assert.deepEqual((await senden("/v1/eingang", fremd)).o, { fehler: "zugang", signatur: 1 });
    // dieselbe Anfrage noch einmal: die nonce ist gemerkt, kein erneuert mehr
    await senden("/v1/eingang", alt, { nonce: "w".repeat(22) });
    const nochmal = await senden("/v1/eingang", alt, { nonce: "w".repeat(22) });
    assert.deepEqual([nochmal.status, nochmal.o.erneuert, nochmal.echtAlt], [401, undefined, false]);
    // die neuen gehen
    assert.equal((await senden("/v1/eingang", konfig)).status, 200);
    // nach ALT_FRIST: wie ein fremder Schlüssel, ohne Signatur der Antwort
    uhr.t += 30 * TAG;
    const spaet = await senden("/v1/eingang", alt);
    assert.deepEqual([spaet.status, spaet.o, spaet.echtAlt], [401, { fehler: "zugang", signatur: 1 }, false]);
  } finally {
    await new Promise((r) => server.close(r));
    fs.rmSync(v, { recursive: true, force: true });
  }
});

test("Antworten auf signierte Anfragen sind signiert (auch 401 uhr, 403, 204), Antworten auf Bearer nicht; die Antwort auf /v1/geraet hat ihren eigenen Zweck", async () => {
  const { erzeugeDienst } = await modul("dienst.mjs");
  const { neuerSchluessel, signieren, inhaltVon, INHALT_LEER, verschluesseln, entschluesseln, antwortMac } = await modul("kanal.mjs");
  const v = ordner();
  const konfig = { zugang: neuerSchluessel(), schluessel: neuerSchluessel(), adresse: "https://beispiel.example", version: "0.0.0-test" };
  const server = erzeugeDienst({ konfig, verzeichnis: v });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  let n = 0;
  const senden = async (methode, pfad, body, o = {}) => {
    const nonce = ("a" + String(n++)).padEnd(22, "x");
    const kopf = o.bearer ? "Bearer " + konfig.zugang : signieren(konfig, methode, pfad, body == null ? INHALT_LEER : inhaltVon(body),
      { zeit: Math.floor((Date.now() + (o.versatz || 0)) / 1000), nonce, mitBeweis: !!o.beweis });
    const r = await fetch(`http://127.0.0.1:${server.address().port}${pfad}`, { method: methode, headers: { "x-forwarded-for": "198.51.100.7", authorization: kopf }, body });
    const text = await r.text();
    const mac = r.headers.get("studium-signatur");
    return { status: r.status, text, mac, echt: mac === "v=1,mac=" + antwortMac(konfig, nonce, r.status, text) };
  };
  try {
    for (const x of [await senden("GET", "/v1/eingang"), await senden("GET", "/v1/status"), await senden("POST", "/v1/anstoss"),
      await senden("GET", "/v1/eingang", null, { versatz: 10 * 60e3 })]) assert.equal(x.echt, true, x.status + " " + x.text);
    const stand = JSON.stringify(await verschluesseln(konfig.schluessel, "stand", { schema: 1, module: [] }));
    const st = await senden("POST", "/v1/stand", stand);
    assert.deepEqual([st.status, st.echt], [204, true]);
    // jede andere Anfrage, ein anderer Status oder ein anderer Körper: die Signatur passt nicht
    const e = await senden("GET", "/v1/eingang");
    assert.notEqual(e.mac, "v=1,mac=" + antwortMac(konfig, "b".repeat(22), e.status, e.text));
    assert.notEqual(e.mac, "v=1,mac=" + antwortMac(konfig, "a" + String(n - 1).padEnd(21, "x"), 500, e.text));
    // Bearer (bis 0.7.7): keine Signatur der Antwort
    assert.equal((await senden("GET", "/v1/eingang", null, { bearer: true })).mac, null);
    // /v1/geraet: signiert mit Zweck verbinden-antwort, Bearer mit verbinden (Plugins bis 0.7.7)
    const anfrage = async () => JSON.stringify(await verschluesseln(konfig.schluessel, "verbinden", { schema: 1, zeit: new Date().toISOString(), nonce: "g".repeat(16) + String(n++).padStart(6, "0") }));
    const neu = await senden("POST", "/v1/geraet", await anfrage());
    assert.equal(JSON.parse(neu.text).zweck, "verbinden-antwort");
    assert.ok((await entschluesseln(konfig.schluessel, "verbinden-antwort", JSON.parse(neu.text))).code);
    await assert.rejects(entschluesseln(konfig.schluessel, "verbinden", JSON.parse(neu.text)));
    const b = await anfrage();
    const altR = await fetch(`http://127.0.0.1:${server.address().port}/v1/geraet`, { method: "POST", headers: { authorization: "Bearer " + konfig.zugang }, body: b });
    assert.equal((await altR.json()).zweck, "verbinden");
  } finally {
    await new Promise((r) => server.close(r));
    fs.rmSync(v, { recursive: true, force: true });
  }
});

// Gerät ab 0.7.8 von Hand (wie austauschen in server.js, hier mit node:crypto): → { anfrage, entschluesseln(antwort) }
async function geraet(code, host) {
  const { codeAbleiten, beweisText, antwortKontext } = await modul("verbinden.mjs");
  const k = codeAbleiten(code, host);
  const e = crypto.createECDH("prime256v1");
  const pub = e.generateKeys().toString("base64url");
  const beweis = crypto.createHmac("sha256", Buffer.from(k.beweis, "base64url")).update(beweisText(host, pub)).digest("base64url");
  const entschluesseln = (o, privat = e) => {
    const kontext = antwortKontext(host, pub, o.pub);
    const z = privat.computeSecret(Buffer.from(o.pub, "base64url"));
    const schl = Buffer.from(crypto.hkdfSync("sha256", Buffer.concat([z, Buffer.from(k.antwort, "base64url")]), Buffer.alloc(0), kontext, 32));
    const d = Buffer.from(o.daten, "base64url");
    const x = crypto.createDecipheriv("aes-256-gcm", schl, Buffer.from(o.iv, "base64url"));
    x.setAAD(Buffer.from(kontext, "utf8"));
    x.setAuthTag(d.subarray(-16));
    return JSON.parse(Buffer.concat([x.update(d.subarray(0, -16)), x.final()]).toString("utf8"));
  };
  return { anfrage: { schema: 2, kennung: k.kennung, pub, beweis }, entschluesseln };
}

test("Verbinden ab 0.7.8 am Server: Kennung und Beweis statt Code, Antwort verschlüsselt; falscher Beweis lässt den Code stehen; Weg bis 0.7.7 geht weiter", async () => {
  const { neuerCode, codeEinloesen, codeEinloesenNeu, codeAbleiten, beweisText } = await modul("verbinden.mjs");
  const { neuerSchluessel } = await modul("kanal.mjs");
  const v = ordner();
  const jetzt = new Date("2026-11-02T08:00:00Z");
  const konfig = { adresse: "https://" + HOST, zugang: neuerSchluessel(), schluessel: neuerSchluessel() };
  try {
    const { code } = neuerCode(v, { jetzt, adresse: konfig.adresse });
    const datei = fs.readdirSync(path.join(v, "verbinden"))[0];
    assert.ok(!fs.readFileSync(path.join(v, "verbinden", datei), "utf8").includes(code.replace("-", "")), "kein Code auf der Platte");
    const g = await geraet(code, HOST);
    // jemand tauscht den öffentlichen Schlüssel gegen seinen (Beweis passt nicht mehr) oder fälscht den Beweis
    const mitm = crypto.createECDH("prime256v1");
    assert.equal(codeEinloesenNeu(v, Object.assign({}, g.anfrage, { pub: mitm.generateKeys().toString("base64url") }), konfig, jetzt), null);
    assert.equal(codeEinloesenNeu(v, Object.assign({}, g.anfrage, { beweis: b64u(crypto.randomBytes(32)) }), konfig, jetzt), null);
    // kein Punkt auf der Kurve (mit passendem Beweis, also erst am Tausch abgelehnt)
    const kaputt = b64u(Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 7)]));
    const beweisKaputt = crypto.createHmac("sha256", Buffer.from(codeAbleiten(code, HOST).beweis, "base64url")).update(beweisText(HOST, kaputt)).digest("base64url");
    assert.equal(codeEinloesenNeu(v, Object.assign({}, g.anfrage, { pub: kaputt, beweis: beweisKaputt }), konfig, jetzt), null);
    // ein Server unter einem anderen Namen (der Code wurde für HOST ausgegeben)
    assert.equal(codeEinloesenNeu(v, g.anfrage, Object.assign({}, konfig, { adresse: "https://" + ANDERER }), jetzt), null);
    assert.ok(fs.existsSync(path.join(v, "verbinden", datei)), "der Code bleibt dem Gerät");
    const r = codeEinloesenNeu(v, g.anfrage, konfig, jetzt, { netz: "198.51.100.0/24" });
    assert.deepEqual(Object.keys(r.antwort).sort(), ["daten", "iv", "pub", "schema"]);
    assert.ok(!JSON.stringify(r.antwort).includes(konfig.zugang) && !JSON.stringify(r.antwort).includes(konfig.schluessel), "Schlüssel nur verschlüsselt");
    assert.deepEqual(g.entschluesseln(r.antwort), { adresse: konfig.adresse, zugang: konfig.zugang, schluessel: konfig.schluessel });
    // wer alles mitschnitt und später sogar den Code kennt, braucht noch das Geheimnis aus dem Tausch
    const fremd = crypto.createECDH("prime256v1");
    fremd.generateKeys();
    assert.throws(() => g.entschluesseln(r.antwort, fremd));
    assert.equal(codeEinloesenNeu(v, g.anfrage, konfig, jetzt), null, "nur einmal");
    // abgelaufen
    const spaet = neuerCode(v, { jetzt, adresse: konfig.adresse });
    assert.equal(codeEinloesenNeu(v, (await geraet(spaet.code, HOST)).anfrage, konfig, new Date(jetzt.getTime() + 31 * 60e3)), null);
    // ein Code mit Adresse geht auch für Plugins bis 0.7.7 (Code im Klartext); einer ohne Adresse nur so
    const alt = neuerCode(v, { jetzt, adresse: konfig.adresse });
    assert.equal(codeEinloesen(v, alt.code, jetzt), "cloud-shell");
    const ohne = neuerCode(v, { jetzt });
    assert.equal(codeEinloesenNeu(v, (await geraet(ohne.code, HOST)).anfrage, konfig, jetzt), null);
  } finally { fs.rmSync(v, { recursive: true, force: true }); }
});

test("Verbinden am Dienst: schema 2 bekommt die verschlüsselte Antwort, ein falscher Code 403 mit schema 2 und zählt als Fehlversuch; der Code im Klartext geht weiter", async () => {
  const { erzeugeDienst } = await modul("dienst.mjs");
  const { neuerCode } = await modul("verbinden.mjs");
  const { neuerSchluessel } = await modul("kanal.mjs");
  const v = ordner();
  const konfig = { zugang: neuerSchluessel(), schluessel: neuerSchluessel(), adresse: "https://" + HOST, version: "0.0.0-test" };
  const server = erzeugeDienst({ konfig, verzeichnis: v });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const senden = async (body, wer = "198.51.100.7") => {
    const r = await fetch(`http://127.0.0.1:${server.address().port}/v1/verbinden`, { method: "POST", headers: { "x-forwarded-for": wer }, body: JSON.stringify(body) });
    return [r.status, await r.json()];
  };
  try {
    const { code } = neuerCode(path.join(v, "web"), { adresse: konfig.adresse });
    const g = await geraet(code, HOST);
    const [s, o] = await senden(g.anfrage);
    assert.equal(s, 200);
    assert.equal(o.schema, 2);
    assert.deepEqual(g.entschluesseln(o), { adresse: konfig.adresse, zugang: konfig.zugang, schluessel: konfig.schluessel });
    assert.deepEqual(await senden(g.anfrage), [403, { fehler: "code", schema: 2 }], "verbraucht");
    // falscher Code: Fehlversuch; nach 10 sperrt das Netz
    const falsch = (await geraet("AAAAA-AAAAA", HOST)).anfrage;
    for (let i = 0; i < 10; i++) await senden(falsch, "203.0.113.9");
    assert.equal((await senden(falsch, "203.0.113.9"))[0], 429);
    // Plugins bis 0.7.7
    const alt = neuerCode(path.join(v, "web"), { adresse: konfig.adresse });
    assert.deepEqual(await senden({ code: alt.code }), [200, { adresse: konfig.adresse, zugang: konfig.zugang, schluessel: konfig.schluessel }]);
  } finally {
    await new Promise((r) => server.close(r));
    fs.rmSync(v, { recursive: true, force: true });
  }
});
