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

test("Zufallswerte: jeder nur einmal; je Schlüssel eine Quote, voll fällt der älteste des Schlüssels mit den meisten weg; ein verdrängter gilt nicht noch einmal, aber nur dieser Schlüssel ist gesperrt", async () => {
  const { NonceSpeicher } = await modul("kanal.mjs");
  const s = new NonceSpeicher(4, { quote: 2 });
  // bis: Ende des Fensters (Zeit der Anfrage + Fenster), wie signaturPruefen es gibt; fach: der Schlüssel, unter dem sie signiert ist
  assert.equal(s.merken("a", 1000, 0, "angreifer"), "ok");
  assert.equal(s.merken("a", 1000, 500, "angreifer"), "wiederholt");
  assert.equal(s.merken("b", 1001, 500, "angreifer"), "ok");
  assert.equal(s.merken("c", 1002, 500, "angreifer"), "ok", "Quote: der älteste dieses Schlüssels (a) fällt weg");
  assert.deepEqual([s.werte.has("a"), s.je.get("angreifer"), s.bisVon("angreifer"), s.bisVon("geraet")], [false, 2, 1000, 0]);
  assert.equal(s.merken("a", 1000, 600, "angreifer"), "wiederholt", "verdrängt, aber nicht noch einmal");
  assert.equal(s.merken("d", 900, 600, "angreifer"), "wiederholt", "unter diesem Schlüssel gilt bis dahin keiner");
  assert.equal(s.merken("g0", 900, 600, "geraet"), "ok", "ein anderer Schlüssel ist davon nicht gesperrt");
  assert.equal(s.merken("g1", 1003, 600, "geraet"), "ok");
  assert.equal(s.merken("x", 1005, 600, "drittes"), "ok", "voll: der älteste des Schlüssels mit den meisten fällt weg");
  assert.equal(s.werte.size, 4);
  assert.equal(s.merken("y", 3000, 1500, "drittes"), "ok", "Abgelaufenes fällt zuerst weg");
  assert.equal(s.werte.size, 1);
});

test("Zufallswerte: Wer mit einem Schlüssel flutet (auch mit einer Zeit 5 Minuten voraus), sperrt nur diesen aus; ein mitgelesener Wert gilt danach nicht noch einmal", async () => {
  const { NonceSpeicher } = await modul("kanal.mjs");
  const s = new NonceSpeicher(2000, { quote: 100 });
  const F = 300e3;
  assert.equal(s.merken("echt", F, 0, "geraet"), "ok");
  // 1000 Anfragen eines Geräts, je mit der Zeit 5 Minuten voraus: es verdrängt seine eigenen
  for (let i = 0; i < 1000; i++) assert.equal(s.merken("f" + i, 2 * F + i, 1000, "dieb"), "ok");
  assert.ok(s.bisVon("dieb") >= 2 * F);
  assert.equal(s.merken("neu", 2000 + F, 2000, "geraet"), "ok", "das echte Gerät kommt weiter durch");
  assert.equal(s.merken("echt", F, 2000, "geraet"), "wiederholt", "mitgelesen und wiederholt");
  assert.equal(s.merken("g", 2 * F, 2000, "dieb"), "wiederholt", "nur der flutende Schlüssel ist gesperrt");
  // voll (viele Schlüssel an ihrer Quote): ein verdrängter Wert gilt unter seinem Schlüssel nicht noch einmal
  const v = new NonceSpeicher(20, { quote: 1 });
  assert.equal(v.merken("echt", F, 0, "geraet"), "ok");
  for (let i = 0; i < 20; i++) assert.equal(v.merken("f" + i, 1000 + i + F, 1000 + i, "schluessel" + i), "ok");
  assert.equal(v.werte.has("echt"), false);
  assert.equal(v.merken("echt", F, 2000, "geraet"), "wiederholt", "verdrängt, aber nicht noch einmal");
  assert.equal(v.merken("neu", 3000 + F, 3000, "geraet"), "ok", "eine neue Anfrage des Geräts (späteres Fenster) geht");
});

test("Zufallswerte über einen Neustart: das Protokoll in web/ bringt sie zurück, nur gültige, und bleibt klein", async () => {
  const { NonceSpeicher } = await modul("kanal.mjs");
  const v = ordner(), datei = path.join(v, "nonces.log");
  try {
    const n = (i) => ("n" + i).padEnd(22, "x");
    const a = new NonceSpeicher(3, { quote: 3, datei, jetztMs: 0 });
    assert.equal(a.merken(n(1), 1000, 0, "fach a"), "ok");
    assert.equal(a.merken(n(2), 5000, 0, "fach-b"), "ok");
    fs.appendFileSync(datei, "kaputt\n" + "y".repeat(22) + " nein fach\n");
    const b = new NonceSpeicher(3, { quote: 3, datei, jetztMs: 2000 });
    assert.equal(b.merken(n(2), 5000, 2000, "fach-b"), "wiederholt", "nach dem Neustart bekannt");
    assert.equal(b.merken(n(1), 9000, 2000, "fach-b"), "ok", "abgelaufen, nicht geladen");
    assert.equal(b.werte.get(n(2)).fach, "fach-b");
    for (let i = 3; i < 12; i++) b.merken(n(i), 10000 + i, 2000, "fach-b");
    const zeilen = fs.readFileSync(datei, "utf8").trim().split("\n");
    assert.ok(zeilen.length <= 7, "neu geschrieben, wenn es über 2 × max Zeilen hat");
    // das späteste Ende eines verdrängten Werts je Schlüssel steht mit darin: auch nach dem Neustart gilt keiner von ihnen
    assert.match(zeilen[0], /^~ 100\d\d fach-b$/);
    const c = new NonceSpeicher(3, { quote: 3, datei, jetztMs: 2500 });
    assert.equal(c.bisVon("fach-b"), b.bisVon("fach-b"));
    assert.equal(c.merken(n(3), 10003, 2500, "fach-b"), "wiederholt", "verdrängt vor dem Neustart");
    assert.equal(c.merken(n(30), 10003, 2500, "fach-c"), "ok", "ein anderer Schlüssel nicht");
    // ein Protokoll von vorher (ein Ende ohne Schlüssel) gilt für alle, bis es abläuft
    fs.writeFileSync(datei, "~ 9000\n");
    const d = new NonceSpeicher(3, { quote: 3, datei, jetztMs: 3000 });
    assert.deepEqual([d.merken(n(40), 8000, 3000, "fach-c"), d.merken(n(41), 9500, 3000, "fach-c")], ["wiederholt", "ok"]);
  } finally { fs.rmSync(v, { recursive: true, force: true }); }
});

test("Dienst: wer mit dem Schlüssel eines Geräts flutet (Zeit 5 Minuten voraus), sperrt die anderen Geräte nicht aus; Abgewiesenes (Frist vorbei) merkt der Dienst nicht", async () => {
  const TAG = 864e5;
  // kleiner Speicher (40, je Schlüssel 2), damit wenige Anfragen reichen
  const D = await geraeteDienst({ signatur: { fenster: 5 * 60e3, nonces: 40 } });
  try {
    const A = await D.verbinden(), B = await D.verbinden();
    for (let i = 0; i < 3; i++) assert.equal((await D.holen(A, "/v1/eingang", { zeit: D.uhr.t + 4 * 60e3 })).status, 200);
    assert.equal((await D.holen(A, "/v1/eingang")).status, 401, "A hat sich selbst ausgesperrt");
    for (const g of [B, D.konfig]) assert.equal((await D.holen(g, "/v1/eingang")).status, 200, "die anderen nicht");
    // nach der Frist des gemeinsamen Schlüssels: abgewiesen, ohne den Zufallswert zu merken (dieselbe Anfrage bekommt dieselbe Antwort)
    D.uhr.t += 31 * TAG;
    const nonce = "v".repeat(22);
    const r1 = await D.holen(D.konfig, "/v1/eingang", { nonce }), r2 = await D.holen(D.konfig, "/v1/eingang", { nonce });
    assert.deepEqual([r1.status, r1.o, r1.echt(D.konfig), r2.status, r2.echt(D.konfig)], [401, { fehler: "zugang", signatur: 1 }, true, 401, true]);
    assert.ok(!fs.readFileSync(path.join(D.v, "web", "nonces.log"), "utf8").includes(nonce));
  } finally { await D.ende(); }
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

test("Alte Schlüssel nach dem Erneuern: 401 mit erneuert, signiert unter den alten, kein Fehlversuch, nonce nicht gemerkt; nach 30 Tagen wie ein fremder Schlüssel", async () => {
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
    // dieselbe Anfrage noch einmal: abgewiesen wird sie ohnehin, darum ist ihr Zufallswert nicht gemerkt (füllt den Speicher nicht)
    await senden("/v1/eingang", alt, { nonce: "w".repeat(22) });
    const nochmal = await senden("/v1/eingang", alt, { nonce: "w".repeat(22) });
    assert.deepEqual([nochmal.status, nochmal.o.erneuert, nochmal.echtAlt], [401, 1, true]);
    const log = path.join(v, "web", "nonces.log");
    assert.ok(!fs.existsSync(log) || !fs.readFileSync(log, "utf8").includes("w".repeat(22)));
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

test("Verbinden am Dienst: schema 2 bekommt die verschlüsselte Antwort, ein falscher Code 403 mit schema 2 und zählt als Fehlversuch; der Code im Klartext nur, bis ein Gerät eigene Schlüssel hat", async () => {
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
    // Plugins bis 0.7.7 (Code im Klartext): die gemeinsamen Schlüssel, solange noch kein Gerät eigene hat
    const alt = neuerCode(path.join(v, "web"), { adresse: konfig.adresse });
    assert.deepEqual(await senden({ code: alt.code }), [200, { adresse: konfig.adresse, zugang: konfig.zugang, schluessel: konfig.schluessel }]);
    const { code } = neuerCode(path.join(v, "web"), { adresse: konfig.adresse });
    const g = await geraet(code, HOST);
    const [s, o] = await senden(g.anfrage);
    assert.equal(s, 200);
    assert.equal(o.schema, 2);
    // eigene Schlüssel für dieses Gerät mit seiner Kennung, nicht die gemeinsamen
    const d = g.entschluesseln(o);
    assert.deepEqual(Object.keys(d).sort(), ["adresse", "geraet", "schluessel", "zugang"]);
    assert.equal(d.adresse, konfig.adresse);
    assert.match(d.geraet, /^[\w-]{22}$/);
    assert.ok([d.zugang, d.schluessel].every((k) => /^[\w-]{43}$/.test(k) && k !== konfig.zugang && k !== konfig.schluessel));
    assert.deepEqual(await senden(g.anfrage), [403, { fehler: "code", schema: 2 }], "verbraucht");
    // falscher Code: Fehlversuch; nach 10 sperrt das Netz
    const falsch = (await geraet("AAAAA-AAAAA", HOST)).anfrage;
    for (let i = 0; i < 10; i++) await senden(falsch, "203.0.113.9");
    assert.equal((await senden(falsch, "203.0.113.9"))[0], 429);
    // danach nicht mehr: Er gäbe jedem mit einem Code den gemeinsamen Schlüssel, den kein Trennen erreicht (der Code bleibt, kein Fehlversuch)
    const spaet = neuerCode(path.join(v, "web"), { adresse: konfig.adresse });
    for (let i = 0; i < 11; i++) assert.deepEqual(await senden({ code: spaet.code }, "198.51.100.99"), [403, { fehler: "veraltet", schema: 2 }]);
    const g2 = await geraet(spaet.code, HOST);
    assert.equal((await senden(g2.anfrage, "198.51.100.99"))[0], 200, "derselbe Code mit einem aktuellen Plugin");
  } finally {
    await new Promise((r) => server.close(r));
    fs.rmSync(v, { recursive: true, force: true });
  }
});

// ---------- Geräte mit eigenen Schlüsseln (server/geraete.mjs) ----------
// Dienst mit Uhr in einem Wegwerf-Ordner; holen() signiert mit einem Paar { zugang, schluessel } (wie jedes Plugin ab 0.7.8, das von
// der Kennung nichts weiß) und gibt Status, Körper, ob die Antwort unter diesem Paar signiert ist, und den Kopf zurück
async function geraeteDienst(o = {}) {
  const { erzeugeDienst } = await modul("dienst.mjs");
  const { neuerSchluessel, signieren, inhaltVon, INHALT_LEER, antwortMac } = await modul("kanal.mjs");
  const { neuerCode } = await modul("verbinden.mjs");
  const v = o.v || ordner();
  const uhr = o.uhr || { t: Date.parse("2026-11-03T08:00:00Z") };
  const konfig = o.konfig || { zugang: neuerSchluessel(), schluessel: neuerSchluessel(), adresse: "https://" + HOST, version: "0.0.0-test" };
  const server = erzeugeDienst({ konfig, verzeichnis: v, jetzt: () => new Date(uhr.t), uhr: () => uhr.t, ...(o.signatur ? { signatur: o.signatur } : {}) });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const basis = `http://127.0.0.1:${server.address().port}`;
  const holen = async (paar, pfad, { methode = "GET", body, beweis = false, wer = "198.51.100.7", nonce, zeit } = {}) => {
    const x = nonce || crypto.randomBytes(16).toString("base64url");
    const kopf = paar === null ? undefined : typeof paar === "string" ? paar : signieren(paar, methode, pfad, body == null ? INHALT_LEER : inhaltVon(body),
      { zeit: Math.floor((zeit === undefined ? uhr.t : zeit) / 1000), nonce: x, mitBeweis: beweis });
    const r = await fetch(basis + pfad, { method: methode, headers: Object.assign({ "x-forwarded-for": wer }, kopf ? { authorization: kopf } : {}), body });
    const text = await r.text(), mac = r.headers.get("studium-signatur");
    const echt = (p) => !!p && typeof paar !== "string" && mac === "v=1,mac=" + antwortMac(p, x, r.status, text);
    return { status: r.status, o: text ? JSON.parse(text) : null, text, mac, echt, kopf };
  };
  // ein neues Gerät mit einem Code aus der Cloud Shell (o.name: Name, den es von sich sagt) → { zugang, schluessel, geraet, adresse }
  const verbinden = async (wer = "198.51.100.7", name) => {
    const { code } = neuerCode(path.join(v, "web"), { adresse: konfig.adresse, jetzt: new Date(uhr.t) });
    const g = await geraet(code, HOST);
    const r = await fetch(basis + "/v1/verbinden", { method: "POST", headers: { "x-forwarded-for": wer }, body: JSON.stringify(Object.assign({}, g.anfrage, name ? { geraet: name } : {})) });
    assert.equal(r.status, 200);
    return g.entschluesseln(await r.json());
  };
  // POST /v1/geraete: felder verschlüsselt (Zweck geraete) mit Zeit und Zufallswert; Antwort 200 entschlüsselt (geraete-antwort)
  const geraeteSenden = async (paar, felder, x = {}) => {
    const { verschluesseln, entschluesseln } = await modul("kanal.mjs");
    const anfrage = Object.assign({ schema: 1, zeit: new Date(uhr.t).toISOString(), nonce: crypto.randomBytes(16).toString("base64url") }, felder);
    const body = JSON.stringify(await verschluesseln(x.mitSchluessel || paar.schluessel, "geraete", anfrage));
    const r = await holen(paar, "/v1/geraete", { methode: "POST", body, beweis: x.beweis !== false, wer: x.wer });
    return Object.assign(r, { anfrage, d: r.status === 200 ? await entschluesseln(paar.schluessel, "geraete-antwort", r.o) : null });
  };
  const verzeichnis = () => JSON.parse(fs.readFileSync(path.join(v, "web", "geraete-schluessel.json"), "utf8"));
  const zu = () => new Promise((r) => server.close(r));
  return { v, uhr, konfig, server, basis, holen, verbinden, geraeteSenden, verzeichnis, zu, ende: async () => { await zu(); if (!o.v) fs.rmSync(v, { recursive: true, force: true }); } };
}
const schluesselIn = (text, ...paare) => paare.some((p) => [p.zugang, p.schluessel].some((k) => text.includes(k)));

test("Signatur gegen mehrere Paare: das passende kommt zurück und gilt für den Beweis; kein Paar, kein Zugang", async () => {
  const { signaturPruefen, signieren, neuerSchluessel, NonceSpeicher, INHALT_LEER } = await modul("kanal.mjs");
  const a = { zugang: neuerSchluessel(), schluessel: neuerSchluessel() }, b = { id: "b", zugang: neuerSchluessel(), schluessel: neuerSchluessel() };
  const t = 1793000000000, nonces = new NonceSpeicher(100, { quote: 100 });
  const kopf = (paar, nonce, mitBeweis = true) => signieren(paar, "GET", "/v1/eingang", INHALT_LEER, { zeit: t / 1000, nonce: nonce.padEnd(22, "x"), mitBeweis });
  const p = signaturPruefen(kopf(b, "a"), [a, b], "GET", "/v1/eingang", t, nonces);
  assert.deepEqual([p.ok, p.paar, p.beweis], [true, b, true]);
  // der Beweis gilt nur mit dem Datenschlüssel des passenden Paars
  const fremd = signieren({ zugang: b.zugang, schluessel: a.schluessel }, "GET", "/v1/eingang", INHALT_LEER, { zeit: t / 1000, nonce: "b".padEnd(22, "x"), mitBeweis: true });
  assert.deepEqual([signaturPruefen(fremd, [a, b], "GET", "/v1/eingang", t, nonces).beweis], [false]);
  assert.equal(signaturPruefen(kopf(a, "c"), a, "GET", "/v1/eingang", t, nonces).paar, a, "ein Paar allein wie bisher");
  assert.deepEqual(signaturPruefen(kopf({ zugang: neuerSchluessel(), schluessel: a.schluessel }, "d"), [a, b], "GET", "/v1/eingang", t, nonces), { ok: false, fehler: "zugang" });
  assert.deepEqual(signaturPruefen(kopf(b, "e"), [a, b], "GET", "/v1/eingang", t + 6 * 60e3, nonces), { ok: false, fehler: "uhr", nonce: "e".padEnd(22, "x"), paar: b });
});

test("Schlüssel je Gerät: jedes neue Gerät eigene, ein Plugin wie 0.7.8 signiert einfach mit ihnen; Antworten je Gerät signiert und verschlüsselt", async () => {
  const { entschluesseln, verschluesseln } = await modul("kanal.mjs");
  const D = await geraeteDienst();
  try {
    const A = await D.verbinden("198.51.100.7", "iPad"), B = await D.verbinden("203.0.113.9");
    assert.notEqual(A.geraet, B.geraet);
    assert.ok(![A.zugang, A.schluessel].some((k) => [B.zugang, B.schluessel, D.konfig.zugang, D.konfig.schluessel].includes(k)), "lauter verschiedene Schlüssel");
    // Verzeichnis (nur der Dienst, 0600), Marke für den Übergang des gemeinsamen Schlüssels
    const vz = D.verzeichnis();
    assert.deepEqual(vz.geraete.map((g) => [g.id, g.herkunft, g.netz, g.name]), [[A.geraet, "cloud-shell", "198.51.100.0/24", "iPad"], [B.geraet, "cloud-shell", "203.0.113.0/24", undefined]]);
    if (process.platform !== "win32") assert.equal(fs.statSync(path.join(D.v, "web", "geraete-schluessel.json")).mode & 0o777, 0o600);
    assert.ok(fs.existsSync(path.join(D.v, "web", "geraete-seit.json")));
    // A holt den Eingang mit seinen Schlüsseln: signiert und verschlüsselt nur für A, die Liste mit „dieses“, nie mit Schlüsseln
    const e = await D.holen(A, "/v1/eingang");
    assert.equal(e.status, 200);
    assert.deepEqual([e.echt(A), e.echt(B), e.echt(D.konfig)], [true, false, false]);
    const buendel = await entschluesseln(A.schluessel, "eingang", e.o);
    for (const k of [B.schluessel, D.konfig.schluessel]) await assert.rejects(entschluesseln(k, "eingang", e.o));
    assert.deepEqual(buendel.geraete.map((g) => [g.id, g.dieses, g.name]), [[A.geraet, true, "iPad"], [B.geraet, false, undefined]]);
    assert.deepEqual(Object.keys(buendel.geraete[0]).sort(), ["dieses", "herkunft", "id", "name", "netz", "seit", "von", "zuletzt"]);
    assert.equal(buendel.geraete[0].von, "cloud-shell", "wer es hereinließ");
    assert.ok(!schluesselIn(JSON.stringify(buendel), A, B, D.konfig), "keine Schlüssel in der Liste");
    // B: Status mit seiner Liste; der Körper einer Anfrage nur mit seinem Datenschlüssel
    const s = await D.holen(B, "/v1/status");
    assert.deepEqual([s.status, s.echt(B), s.o.geraete.map((g) => g.dieses)], [200, true, [false, true]]);
    assert.ok(!schluesselIn(s.text, A, B, D.konfig));
    const stand = JSON.stringify(await verschluesseln(B.schluessel, "stand", { schema: 1, module: ["B110"] }));
    assert.equal((await D.holen(B, "/v1/stand", { methode: "POST", body: stand })).status, 204);
    assert.equal((await D.holen(A, "/v1/stand", { methode: "POST", body: stand })).status, 400, "mit dem Schlüssel eines anderen Geräts nicht lesbar");
    // der Anstoß mit dem Beweis seines eigenen Datenschlüssels; der gemeinsame Schlüssel geht weiter (bis zu seiner Frist)
    assert.deepEqual((await D.holen(A, "/v1/anstoss", { methode: "POST", beweis: true })).o, { angestossen: true });
    const g = await D.holen(D.konfig, "/v1/eingang");
    assert.deepEqual([g.status, g.echt(D.konfig)], [200, true]);
    assert.ok((await entschluesseln(D.konfig.schluessel, "eingang", g.o)).geraete.every((x) => !x.dieses));
    // ohne Schlüssel keine Liste (Übergang ohne Marke: offen wie bis 0.7.7; direkt auf 127.0.0.1)
    const v2 = await geraeteDienst();
    try {
      await v2.verbinden();
      assert.equal("geraete" in (await v2.holen(null, "/v1/status")).o, false);
      assert.equal("geraete" in (await (await fetch(v2.basis + "/v1/status")).json()), false);
    } finally { await v2.ende(); }
  } finally { await D.ende(); }
});

test("Geräte trennen: nur signiert mit Beweis, Zeit und Zufallswert einmal; danach kennt der Server das Gerät nicht mehr, die anderen gehen weiter", async () => {
  const D = await geraeteDienst();
  try {
    const A = await D.verbinden(), B = await D.verbinden();
    // ohne Beweis (auch als Bearer) nicht, und das zählt als Fehlversuch
    assert.deepEqual([(await D.geraeteSenden(B, { aktion: "liste" }, { beweis: false })).status, (await D.holen("Bearer " + D.konfig.zugang, "/v1/geraete", { methode: "POST", body: "{}" })).o],
      [403, { fehler: "datenschluessel" }]);
    const l = await D.geraeteSenden(B, { aktion: "liste" });
    assert.deepEqual([l.status, l.echt(B), l.o.zweck], [200, true, "geraete-antwort"]);
    assert.deepEqual(l.d.geraete.map((g) => [g.id, g.dieses]), [[A.geraet, false], [B.geraet, true]]);
    assert.ok(!schluesselIn(JSON.stringify(l.d), A, B, D.konfig));
    // die Anfrage ist an den Datenschlüssel gebunden, an Zeit und Zufallswert, und die Signatur an diese eine Anfrage
    assert.equal((await D.geraeteSenden(B, { aktion: "liste" }, { mitSchluessel: A.schluessel })).status, 400, "fremder Datenschlüssel");
    assert.deepEqual((await D.geraeteSenden(B, { aktion: "liste", nonce: l.anfrage.nonce })).o, { fehler: "wiederholt" }, "Zufallswert schon gesehen");
    assert.deepEqual((await D.geraeteSenden(B, { aktion: "liste", zeit: new Date(D.uhr.t - 3 * 60e3).toISOString() })).o, { fehler: "uhr" });
    assert.deepEqual((await D.geraeteSenden(B, { aktion: "kaputt" })).o, { fehler: "anfrage" });
    const nochmal = await fetch(D.basis + "/v1/geraete", { method: "POST", headers: { authorization: l.kopf, "x-forwarded-for": "198.51.100.7" }, body: "x" });
    assert.equal(nochmal.status, 401, "dieselbe signierte Anfrage noch einmal");
    // B trennt A: A kommt nicht mehr hinein (ein unbekannter Schlüssel, ohne Signatur der Antwort), B weiter
    assert.deepEqual((await D.geraeteSenden(B, { aktion: "trennen", id: "x".repeat(22) })).o, { fehler: "unbekannt" });
    const t = await D.geraeteSenden(B, { aktion: "trennen", id: A.geraet });
    assert.deepEqual([t.status, t.d.getrennt, t.d.geraete.map((g) => g.id)], [200, [A.geraet], [B.geraet]]);
    const a = await D.holen(A, "/v1/eingang");
    assert.deepEqual([a.status, a.o, a.mac], [401, { fehler: "zugang", signatur: 1 }, null]);
    assert.equal((await D.holen(B, "/v1/eingang")).status, 200);
    assert.deepEqual(D.verzeichnis().geraete.map((g) => g.id), [B.geraet], "auch im Verzeichnis weg");
    // ein Gerät trennt sich selbst: die Antwort noch unter seinem Paar, danach nichts mehr
    const selbst = await D.geraeteSenden(B, { aktion: "trennen", id: B.geraet });
    assert.deepEqual([selbst.status, selbst.echt(B), selbst.d.geraete], [200, true, []]);
    assert.equal((await D.holen(B, "/v1/status")).status, 401);
  } finally { await D.ende(); }
});

test("studium-server geraet-trennen: Marke web/getrennt/<id>, die der Dienst vor der nächsten Anfrage und beim Start anwendet; geraete zeigt nie Schlüssel", async () => {
  const { befehl, geraeteLesen } = await modul("geraete.mjs");
  const v = ordner();
  const D = await geraeteDienst({ v });
  try {
    const A = await D.verbinden("198.51.100.7", "iPhone"), B = await D.verbinden(), C = await D.verbinden();
    const web = path.join(v, "web"), aus = [], fehler = [];
    const cli = (...argv) => befehl(web, D.konfig, argv, (z) => aus.push(z), (z) => fehler.push(z));
    assert.equal(cli("liste"), 0);
    assert.equal(aus.length, 3);
    assert.match(aus[0], new RegExp(`^${A.geraet}  iPhone  seit 2026-11-03 08:00 UTC, zuletzt 2026-11-03 08:00 UTC \\(Cloud Shell, Netz 198\\.51\\.100\\.0/24\\)$`));
    assert.match(aus[1], /Gerät ohne Namen/);
    assert.ok(!schluesselIn(aus.join("\n"), A, B, C, D.konfig));
    assert.deepEqual([cli("trennen", "kurz"), cli("trennen", "y".repeat(22))], [2, 1]);
    assert.equal(cli("trennen", A.geraet), 0);
    assert.ok(fs.existsSync(path.join(web, "getrennt", A.geraet)));
    assert.deepEqual(geraeteLesen(web, D.konfig).map((g) => g.id), [B.geraet, C.geraet], "schon in der Liste weg");
    assert.equal(D.verzeichnis().geraete.length, 3, "das Verzeichnis schreibt nur der Dienst");
    // die nächste signierte Anfrage (hier von B) wendet sie an
    assert.equal((await D.holen(B, "/v1/eingang")).status, 200);
    assert.deepEqual([D.verzeichnis().geraete.map((g) => g.id), fs.readdirSync(path.join(web, "getrennt"))], [[B.geraet, C.geraet], []]);
    assert.equal((await D.holen(A, "/v1/eingang")).status, 401);
    // beim Start: die Marke liegt da, während der Dienst steht
    await D.zu();
    assert.equal(cli("trennen", B.geraet), 0);
    const neu = await geraeteDienst({ v, konfig: D.konfig, uhr: D.uhr });
    try {
      assert.deepEqual(neu.verzeichnis().geraete.map((g) => g.id), [C.geraet], "gleich beim Start");
      assert.equal((await neu.holen(B, "/v1/eingang")).status, 401);
      assert.equal((await neu.holen(C, "/v1/eingang")).status, 200);
    } finally { await neu.zu(); }
    // zu anderen gemeinsamen Schlüsseln (neue Schlüssel, noch bevor der Dienst neu startet) zeigt die Liste nichts
    assert.deepEqual(geraeteLesen(web, { zugang: "a".repeat(43), schluessel: "b".repeat(43) }), []);
  } finally { await D.zu(); fs.rmSync(v, { recursive: true, force: true }); }
});

test("Volle Platte am Verzeichnis: Trennen gilt erst geschrieben oder mit Marke, sonst 503; die Marke bleibt, bis der Stand in der Datei steht; ein neues Gerät nur, wenn es gespeichert ist", async () => {
  const { neuerCode } = await modul("verbinden.mjs");
  const v = ordner();
  let D = await geraeteDienst({ v });
  const web = path.join(v, "web"), datei = path.join(web, "geraete-schluessel.json"), marken = path.join(web, "getrennt");
  // Schreiben scheitert: an der Stelle der Datei ein Ordner (die Zwischendatei lässt sich dann nicht umbenennen); zurück: der alte Inhalt
  const sperren = () => { const alt = fs.readFileSync(datei, "utf8"); fs.rmSync(datei); fs.mkdirSync(datei); return () => { fs.rmSync(datei, { recursive: true }); fs.writeFileSync(datei, alt); }; };
  try {
    const A = await D.verbinden(), B = await D.verbinden(), C = await D.verbinden();
    let frei = sperren();
    // B trennt A: die Datei nicht, aber die Marke geschrieben, also dauerhaft (200); A kommt sofort nicht mehr hinein
    const t = await D.geraeteSenden(B, { aktion: "trennen", id: A.geraet });
    assert.deepEqual([t.status, fs.existsSync(path.join(marken, A.geraet))], [200, true]);
    assert.equal((await D.holen(A, "/v1/eingang")).status, 401);
    assert.equal((await D.holen(B, "/v1/eingang")).status, 200);
    assert.ok(fs.existsSync(path.join(marken, A.geraet)), "die Marke bleibt, solange der Stand nicht in der Datei steht");
    // ein neues Gerät: nicht gespeichert, also keins (503), und der Code bleibt
    const { code } = neuerCode(web, { adresse: D.konfig.adresse, jetzt: new Date(D.uhr.t) });
    const g = await geraet(code, HOST);
    const einloesen = () => fetch(D.basis + "/v1/verbinden", { method: "POST", headers: { "x-forwarded-for": "198.51.100.7" }, body: JSON.stringify(g.anfrage) });
    const r = await einloesen();
    assert.deepEqual([r.status, await r.json()], [503, { fehler: "speichern", schema: 2 }]);
    assert.equal((await D.geraeteSenden(D.konfig, { aktion: "umziehen", umzug: "u".repeat(22) })).status, 503, "Umziehen ebenso");
    // Neustart mit der alten Datei (A steht noch darin): die Marke bringt das Trennen zurück
    await D.zu();
    frei();
    D = await geraeteDienst({ v, konfig: D.konfig, uhr: D.uhr });
    assert.deepEqual(D.verzeichnis().geraete.map((x) => x.id), [B.geraet, C.geraet], "nach dem Neustart weiter getrennt");
    assert.ok(!fs.existsSync(path.join(marken, A.geraet)), "jetzt geschrieben, die Marke weg");
    assert.equal((await D.holen(A, "/v1/eingang")).status, 401);
    const neu = await einloesen();
    assert.equal(neu.status, 200, "derselbe Code geht, sobald gespeichert werden kann");
    const id = g.entschluesseln(await neu.json()).geraet;
    assert.ok(D.verzeichnis().geraete.some((x) => x.id === id));
    // weder Datei noch Marke: 503, getrennt nur im Speicher; nach einem Neustart wieder da (und in der Liste der Kommandozeile)
    frei = sperren();
    fs.rmSync(marken, { recursive: true, force: true });
    fs.writeFileSync(marken, "");
    const z = await D.geraeteSenden(B, { aktion: "trennen", id: C.geraet });
    assert.deepEqual([z.status, z.o], [503, { fehler: "speichern" }]);
    assert.equal((await D.holen(C, "/v1/eingang")).status, 401, "bis zum Neustart getrennt");
    await D.zu();
    frei();
    fs.rmSync(marken);
    D = await geraeteDienst({ v, konfig: D.konfig, uhr: D.uhr });
    assert.equal((await D.holen(C, "/v1/eingang")).status, 200, "nichts gespeichert: nach dem Neustart wieder verbunden");
  } finally { await D.zu(); fs.rmSync(v, { recursive: true, force: true }); }
});

test("Verbinden: Wird der Code gerade anderswo eingelöst, nimmt der Dienst das eben eingetragene Gerät wieder heraus (403, kein Gerät ohne Besitzer)", async () => {
  const { neuerCode } = await modul("verbinden.mjs");
  const D = await geraeteDienst();
  try {
    const A = await D.verbinden();
    const ordner = path.join(D.v, "web", "verbinden");
    const { code } = neuerCode(path.join(D.v, "web"), { adresse: D.konfig.adresse, jetzt: new Date(D.uhr.t) });
    const datei = fs.readdirSync(ordner).find((n) => n.endsWith(".json"));
    // die Marke eines Einlösens, das gerade läuft (oder abbrach): eingetragen wird zuerst, eingelöst dann nicht
    fs.writeFileSync(path.join(ordner, datei + ".eingeloest"), "");
    const g = await geraet(code, HOST);
    const r = await fetch(D.basis + "/v1/verbinden", { method: "POST", headers: { "x-forwarded-for": "198.51.100.7" }, body: JSON.stringify(g.anfrage) });
    assert.deepEqual([r.status, await r.json()], [403, { fehler: "code", schema: 2 }]);
    assert.deepEqual(D.verzeichnis().geraete.map((x) => x.id), [A.geraet], "das eingetragene Gerät ist wieder heraus, auch in der Datei");
    assert.ok(!fs.existsSync(path.join(D.v, "web", "getrennt", A.geraet)));
    assert.equal((await D.holen(A, "/v1/eingang")).status, 200, "die anderen bleiben");
    // ist die Marke weg (das andere Einlösen scheiterte), geht derselbe Code
    fs.rmSync(path.join(ordner, datei + ".eingeloest"));
    const wieder = await fetch(D.basis + "/v1/verbinden", { method: "POST", headers: { "x-forwarded-for": "198.51.100.7" }, body: JSON.stringify(g.anfrage) });
    assert.equal(wieder.status, 200);
    assert.equal(D.verzeichnis().geraete.length, 2);
  } finally { await D.ende(); }
});

// Code für ein weiteres Gerät über POST /v1/geraet, signiert unter paar (wie „Weiteres Gerät verbinden“) → Code
async function codeVon(D, paar) {
  const { verschluesseln, entschluesseln } = await modul("kanal.mjs");
  const body = JSON.stringify(await verschluesseln(paar.schluessel, "verbinden", { schema: 1, zeit: new Date(D.uhr.t).toISOString(), nonce: crypto.randomBytes(16).toString("base64url") }));
  const r = await D.holen(paar, "/v1/geraet", { methode: "POST", body });
  assert.equal(r.status, 200, JSON.stringify(r.o));
  return (await entschluesseln(paar.schluessel, "verbinden-antwort", r.o)).code;
}
// ein neues Gerät mit diesem Code → { zugang, schluessel, geraet, adresse }
async function mitCode(D, code, wer = "203.0.113.9") {
  const g = await geraet(code, HOST);
  const r = await fetch(D.basis + "/v1/verbinden", { method: "POST", headers: { "x-forwarded-for": wer }, body: JSON.stringify(g.anfrage) });
  assert.equal(r.status, 200);
  return g.entschluesseln(await r.json());
}
// Codes in web/verbinden/ mit ihrem von
const offeneCodes = (D) => fs.readdirSync(path.join(D.v, "web", "verbinden")).filter((n) => n.endsWith(".json")).map((n) => JSON.parse(fs.readFileSync(path.join(D.v, "web", "verbinden", n), "utf8")).von || "");

test("Trennen nimmt mit, was das Gerät hereinließ: Geräte über seine Codes (auch weiter verbunden), seine offenen Codes, Verbindungen der Claude-App aus seinen Codes; behalten, das fragende und „nur dieses“ bleiben", async () => {
  const { claudeApp } = await modul("claude-app.mjs");
  const D = await geraeteDienst();
  const ca = (...t) => path.join(D.v, "claude-app", ...t);
  // Verbindungen, wie sie der Connector meldet (mit von aus dem Code)
  const verbindungen = (liste) => { fs.mkdirSync(ca("aus-mcp"), { recursive: true }); fs.writeFileSync(ca("aus-mcp", "verbindungen.json"), JSON.stringify({ schema: 1, verbindungen: liste, frueher: [] })); };
  try {
    const A = await D.verbinden("198.51.100.7", "iPhone"), X = await D.verbinden("198.51.100.7", "iPad");
    const B = await mitCode(D, await codeVon(D, A)), C = await mitCode(D, await codeVon(D, B));
    const vz = () => D.verzeichnis().geraete;
    assert.deepEqual(vz().map((g) => [g.id, g.herkunft, g.von]), [[A.geraet, "cloud-shell", "cloud-shell"], [X.geraet, "cloud-shell", "cloud-shell"],
      [B.geraet, "obsidian", A.geraet], [C.geraet, "obsidian", B.geraet]]);
    // die Liste nennt von, das Plugin zeigt daraus „über Code von …“
    assert.deepEqual((await D.holen(X, "/v1/status")).o.geraete.map((g) => g.von), ["cloud-shell", "cloud-shell", A.geraet, B.geraet]);
    // A hat einen Code offen und einen für die Claude-App geholt; mit einem Code von A entstand eine Verbindung, eine mit einem von X
    await codeVon(D, A);
    assert.deepEqual(offeneCodes(D), [A.geraet]);
    claudeApp(D.v, { schema: 1, zeit: new Date(D.uhr.t).toISOString(), nonce: crypto.randomBytes(16).toString("base64url"), aktion: "code" }, { jetzt: new Date(D.uhr.t), von: A.geraet });
    verbindungen([{ id: "verbindungA1", seit: "2026-11-03T07:00:00Z", client: "claude.ai", von: A.geraet }, { id: "verbindungX1", seit: "2026-11-03T07:00:00Z", client: "claude.ai", von: X.geraet }]);
    // X trennt A: B und C gehen mit, Codes von A gelten nicht mehr, die Verbindung aus dem Code von A wird getrennt, die von X nicht
    const t = await D.geraeteSenden(X, { aktion: "trennen", id: A.geraet });
    assert.deepEqual([t.status, t.d.getrennt, t.d.geraete.map((g) => g.id)], [200, [A.geraet, B.geraet, C.geraet], [X.geraet]]);
    for (const g of [A, B, C]) assert.equal((await D.holen(g, "/v1/eingang")).status, 401);
    assert.deepEqual([offeneCodes(D), fs.readdirSync(ca("codes"))], [[], []]);
    assert.deepEqual(fs.readdirSync(ca("trennen")), ["verbindungA1"]);
    assert.deepEqual((await D.holen(X, "/v1/eingang")).status, 200);
  } finally { await D.ende(); }
  // behalten, das fragende Gerät, „Dieses Gerät trennen“
  const E = await geraeteDienst();
  try {
    const A = await E.verbinden(), X = await E.verbinden();
    const B = await mitCode(E, await codeVon(E, A)), C = await mitCode(E, await codeVon(E, B)), F = await mitCode(E, await codeVon(E, A));
    E.uhr.t += 61 * 60e3; // höchstens 3 Codes je Stunde
    const ids = () => E.verzeichnis().geraete.map((g) => g.id);
    // B ist deins: behalten (C, das B hereinließ, bleibt mit), F nicht
    const t = await E.geraeteSenden(X, { aktion: "trennen", id: A.geraet, behalten: [B.geraet] });
    assert.deepEqual([t.d.getrennt, ids()], [[A.geraet, F.geraet], [X.geraet, B.geraet, C.geraet]]);
    // B trennt sich selbst: nur B (C bleibt), seine offenen Codes gelten nicht mehr
    await codeVon(E, B);
    const selbst = await E.geraeteSenden(B, { aktion: "trennen", id: B.geraet });
    assert.deepEqual([selbst.d.getrennt, ids(), offeneCodes(E)], [[B.geraet], [X.geraet, C.geraet], []]);
    // C trennt X, das C nicht hereinließ: C bleibt ohnehin; ein Gerät, das von dem getrennten kam, trennt ihn und bleibt selbst
    const Y = await mitCode(E, await codeVon(E, X));
    const z = await E.geraeteSenden(Y, { aktion: "trennen", id: X.geraet });
    assert.deepEqual([z.d.getrennt, ids()], [[X.geraet], [C.geraet, Y.geraet]], "das fragende Gerät bleibt");
  } finally { await E.ende(); }
});

test("Ein Code eines getrennten Geräts geht nicht mehr, auch wenn er noch daliegt; ein Code mit dem gemeinsamen Schlüssel nur bis zu dessen Ende", async () => {
  const D = await geraeteDienst();
  try {
    const A = await D.verbinden(), X = await D.verbinden();
    const code = await codeVon(D, A);
    const datei = fs.readdirSync(path.join(D.v, "web", "verbinden")).find((n) => n.endsWith(".json"));
    const inhalt = fs.readFileSync(path.join(D.v, "web", "verbinden", datei));
    assert.equal((await D.geraeteSenden(X, { aktion: "trennen", id: A.geraet })).status, 200);
    fs.writeFileSync(path.join(D.v, "web", "verbinden", datei), inhalt); // als hätte das Zurückziehen ihn nicht erreicht
    const g = await geraet(code, HOST);
    const r = await fetch(D.basis + "/v1/verbinden", { method: "POST", headers: { "x-forwarded-for": "203.0.113.9" }, body: JSON.stringify(g.anfrage) });
    assert.deepEqual([r.status, await r.json()], [403, { fehler: "code", schema: 2 }]);
    assert.ok(!fs.existsSync(path.join(D.v, "web", "verbinden", datei)), "und ist danach weg");
    // Code über den gemeinsamen Schlüssel: geht, bis der gemeinsame endet
    const G = await mitCode(D, await codeVon(D, D.konfig));
    assert.equal(D.verzeichnis().geraete.find((x) => x.id === G.geraet).von, "gemeinsam");
    const spaet = await codeVon(D, D.konfig);
    fs.writeFileSync(path.join(D.v, "web", "gemeinsam-aus.json"), JSON.stringify({ seit: new Date(D.uhr.t).toISOString() }));
    const h = await geraet(spaet, HOST);
    const s = await fetch(D.basis + "/v1/verbinden", { method: "POST", headers: { "x-forwarded-for": "203.0.113.9" }, body: JSON.stringify(h.anfrage) });
    assert.equal(s.status, 403);
    assert.equal((await D.holen(G, "/v1/eingang")).status, 200, "das Gerät von damals bleibt");
  } finally { await D.ende(); }
});

test("studium-server geraet-trennen nimmt mit, was das Gerät hereinließ, und nennt es; mit --nur-dieses nur das Gerät; geraete nennt, woher jedes kam", async () => {
  const { befehl, geraeteLesen } = await modul("geraete.mjs");
  const D = await geraeteDienst();
  try {
    const A = await D.verbinden("198.51.100.7", "iPhone");
    const B = await mitCode(D, await codeVon(D, A)), C = await mitCode(D, await codeVon(D, B)), F = await mitCode(D, await codeVon(D, A));
    const web = path.join(D.v, "web"), aus = [], fehler = [];
    const cli = (...argv) => { aus.length = 0; return befehl(web, D.konfig, argv, (z) => aus.push(z), (z) => fehler.push(z)); };
    assert.equal(cli("liste"), 0);
    assert.match(aus[1], new RegExp(`^${B.geraet}  Gerät ohne Namen  seit .* \\(Code von ${A.geraet} \\(iPhone\\), Netz 203\\.0\\.113\\.0/24\\)$`));
    assert.equal(cli("trennen", A.geraet, "--alles"), 2);
    // nur dieses: B geht, C (über den Code von B) bleibt
    assert.equal(cli("trennen", B.geraet, "--nur-dieses"), 0);
    assert.ok(!aus.some((z) => z.includes(C.geraet)));
    assert.deepEqual(geraeteLesen(web, D.konfig).map((g) => g.id), [A.geraet, C.geraet, F.geraet]);
    assert.equal((await D.holen(A, "/v1/eingang")).status, 200);
    assert.deepEqual(D.verzeichnis().geraete.map((g) => g.id), [A.geraet, C.geraet, F.geraet]);
    cli("liste");
    assert.match(aus.find((z) => z.startsWith(C.geraet)), new RegExp(`\\(Code von ${B.geraet} \\(getrennt\\), Netz`));
    // ohne: F (über den Code von A) geht mit, die Ausgabe nennt es; die Liste zeigt es gleich nicht mehr
    assert.equal(cli("trennen", A.geraet), 0);
    assert.ok(aus.some((z) => z.trim().startsWith(F.geraet)), aus.join("\n"));
    assert.deepEqual(geraeteLesen(web, D.konfig).map((g) => g.id), [C.geraet]);
    assert.equal((await D.holen(C, "/v1/eingang")).status, 200);
    assert.deepEqual([D.verzeichnis().geraete.map((g) => g.id), (await D.holen(F, "/v1/eingang")).status], [[C.geraet], 401]);
  } finally { await D.ende(); }
});

test("Höchstens 30 Geräte: ein weiteres bekommt 409 zu-viele-geraete, und sein Code bleibt; Umziehen ebenso; keins wird verdrängt", async () => {
  const { GERAETE, fingerabdruck } = await modul("geraete.mjs");
  const { neuerCode } = await modul("verbinden.mjs");
  const { neuerSchluessel } = await modul("kanal.mjs");
  assert.equal(GERAETE.hoechstens, 30);
  const v = ordner();
  const konfig = { zugang: neuerSchluessel(), schluessel: neuerSchluessel(), adresse: "https://" + HOST, version: "0.0.0-test" };
  // 29 Geräte schon im Verzeichnis (so schnell wie ein Test sein soll), eins kommt mit einem Code dazu
  const b = () => crypto.randomBytes(32).toString("base64url");
  const da = Array.from({ length: GERAETE.hoechstens - 1 }, () => ({ id: crypto.randomBytes(16).toString("base64url"), zugang: b(), schluessel: b(),
    seit: "2026-11-01T08:00:00.000Z", zuletzt: "2026-11-01T08:00:00.000Z", herkunft: "obsidian" }));
  fs.mkdirSync(path.join(v, "web"), { recursive: true });
  fs.writeFileSync(path.join(v, "web", "geraete-schluessel.json"), JSON.stringify({ schema: 1, fuer: fingerabdruck(konfig), geraete: da }));
  const D = await geraeteDienst({ v, konfig });
  try {
    const letztes = await D.verbinden();
    assert.equal(D.verzeichnis().geraete.length, 30);
    const { code } = neuerCode(path.join(v, "web"), { adresse: konfig.adresse, jetzt: new Date(D.uhr.t) });
    const g = await geraet(code, HOST);
    const einloesen = () => fetch(D.basis + "/v1/verbinden", { method: "POST", headers: { "x-forwarded-for": "198.51.100.7" }, body: JSON.stringify(g.anfrage) });
    const voll = await einloesen();
    assert.deepEqual([voll.status, await voll.json()], [409, { fehler: "zu-viele-geraete", schema: 2 }]);
    assert.equal(D.verzeichnis().geraete.length, 30);
    assert.equal((await D.holen(da[0], "/v1/eingang")).status, 200, "kein Gerät verdrängt");
    assert.deepEqual((await D.geraeteSenden(D.konfig, { aktion: "umziehen", umzug: "u".repeat(22) })).o, { fehler: "zu-viele-geraete" });
    // nach dem Trennen eines Geräts geht derselbe Code
    assert.equal((await D.geraeteSenden(letztes, { aktion: "trennen", id: da[3].id })).status, 200);
    const r = await einloesen();
    assert.equal(r.status, 200);
    assert.ok(g.entschluesseln(await r.json()).geraet);
  } finally { await D.ende(); }
});

test("Umziehen: ein Gerät mit dem gemeinsamen Schlüssel bekommt eigene (umzug, mit Namen), verschlüsselt unter seinem Datenschlüssel; mit eigenen kommen dieselben zurück", async () => {
  const D = await geraeteDienst();
  try {
    assert.ok(!fs.existsSync(path.join(D.v, "web", "geraete-seit.json")));
    assert.deepEqual((await D.geraeteSenden(D.konfig, { aktion: "umziehen" })).o, { fehler: "anfrage" }, "ohne Kennung des Umzugs nicht");
    const kennung = crypto.randomBytes(16).toString("base64url");
    const u = await D.geraeteSenden(D.konfig, { aktion: "umziehen", umzug: kennung, name: "Windows-PC <b>" }, { wer: "203.0.113.20" });
    assert.deepEqual([u.status, u.echt(D.konfig), Object.keys(u.d).sort()], [200, true, ["adresse", "geraet", "schluessel", "zugang"]]);
    assert.equal(u.d.adresse, D.konfig.adresse);
    assert.ok(!schluesselIn(u.text, u.d), "die neuen Schlüssel nur verschlüsselt");
    assert.deepEqual(D.verzeichnis().geraete.map((g) => [g.id, g.herkunft, g.von, g.name, g.netz]), [[u.d.geraet, "umzug", "gemeinsam", "Windows-PC", "203.0.113.0/24"]]);
    assert.ok(!JSON.stringify(D.verzeichnis()).includes(kennung), "die Kennung des Umzugs nur als SHA-256");
    assert.ok(fs.existsSync(path.join(D.v, "web", "geraete-seit.json")), "das erste Gerät mit eigenen Schlüsseln");
    // die Antwort ging verloren: dieselbe Kennung ergibt dasselbe Gerät, kein zweites
    const wieder = await D.geraeteSenden(D.konfig, { aktion: "umziehen", umzug: kennung });
    assert.deepEqual([wieder.status, wieder.d, D.verzeichnis().geraete.length], [200, u.d, 1]);
    // ab jetzt mit den eigenen; noch einmal umziehen ändert nichts
    const nochmal = await D.geraeteSenden(u.d, { aktion: "umziehen" });
    assert.deepEqual([nochmal.status, nochmal.echt(u.d), nochmal.d], [200, true, u.d]);
    assert.equal(D.verzeichnis().geraete.length, 1);
    assert.deepEqual((await D.holen(u.d, "/v1/status")).o.geraete.map((g) => g.dieses), [true]);
  } finally { await D.ende(); }
});

test("Umziehen mit dem gemeinsamen Schlüssel ist begrenzt (5 je Stunde, 10 zusammen); ein umgezogenes Gerät, das nie fragte, fällt nach 7 Tagen weg", async () => {
  const { UMZUG } = await modul("geraete.mjs");
  const TAG = 864e5;
  assert.deepEqual(UMZUG, { stunde: 5, hoechstens: 10, verwaist: 7 * TAG });
  const D = await geraeteDienst();
  try {
    const umziehen = () => D.geraeteSenden(D.konfig, { aktion: "umziehen", umzug: crypto.randomBytes(16).toString("base64url") });
    const erste = [];
    for (let i = 0; i < 5; i++) erste.push((await umziehen()).d);
    const zuViele = await umziehen();
    assert.deepEqual([zuViele.status, zuViele.o], [429, { fehler: "zu-viele", wieder: new Date(D.uhr.t + 3600e3).toISOString() }]);
    // das erste fragt mit seinen Schlüsseln, die anderen nie
    assert.equal((await D.holen(erste[0], "/v1/eingang")).status, 200);
    D.uhr.t += 3600e3;
    for (let i = 0; i < 5; i++) assert.equal((await umziehen()).status, 200);
    D.uhr.t += 3600e3;
    assert.deepEqual((await umziehen()).o, { fehler: "zu-viele-umzuege" }, "höchstens 10 zu einem gemeinsamen Schlüssel");
    assert.equal(D.verzeichnis().geraete.length, 10);
    // nach 7 Tagen: die nie benutzten sind weg (beim nächsten Abgleich), das benutzte bleibt
    D.uhr.t += 7 * TAG;
    assert.equal((await D.holen(erste[0], "/v1/eingang")).status, 200);
    assert.deepEqual(D.verzeichnis().geraete.map((g) => g.id), [erste[0].geraet]);
    assert.equal((await D.holen(erste[1], "/v1/eingang")).status, 401);
    assert.deepEqual((await umziehen()).o, { fehler: "zu-viele-umzuege" }, "Wegfallen gibt keine neuen frei");
  } finally { await D.ende(); }
});

test("studium-server gemeinsam-beenden: der gemeinsame Schlüssel (auch als Bearer) und seine offenen Codes gelten sofort nicht mehr; Geräte mit eigenen bleiben; ohne eines nicht", async () => {
  const { befehl } = await modul("geraete.mjs");
  const { claudeApp } = await modul("claude-app.mjs");
  const D = await geraeteDienst();
  try {
    const web = path.join(D.v, "web"), aus = [], fehler = [];
    const cli = (...argv) => { aus.length = 0; fehler.length = 0; return befehl(web, D.konfig, argv, (z) => aus.push(z), (z) => fehler.push(z)); };
    assert.equal(cli("gemeinsam-beenden"), 1, "ohne ein Gerät mit eigenen Schlüsseln käme keins mehr hinein");
    assert.match(fehler[0], /schluessel-erneuern/);
    assert.ok(!fs.existsSync(path.join(web, "gemeinsam-aus.json")));
    const A = await D.verbinden();
    const u = await D.geraeteSenden(D.konfig, { aktion: "umziehen", umzug: "k".repeat(22), name: "iPad" });
    const code = await codeVon(D, D.konfig);
    claudeApp(D.v, { schema: 1, zeit: new Date(D.uhr.t).toISOString(), nonce: crypto.randomBytes(16).toString("base64url"), aktion: "code" }, { jetzt: new Date(D.uhr.t), von: "gemeinsam" });
    assert.equal(fs.readdirSync(path.join(D.v, "claude-app", "codes")).length, 1);
    assert.equal(cli("gemeinsam-beenden"), 0);
    assert.ok(aus.some((z) => z.includes(u.d.geraet) && /Umzug/.test(z)), "nennt, was mit dem gemeinsamen Schlüssel kam");
    for (const k of [D.konfig, "Bearer " + D.konfig.zugang]) assert.equal((await D.holen(k, "/v1/eingang")).status, 401);
    for (const g of [A, u.d]) assert.equal((await D.holen(g, "/v1/eingang")).status, 200);
    assert.deepEqual([offeneCodes(D), fs.readdirSync(path.join(D.v, "claude-app", "codes"))], [[], []], "seine offenen Codes weg");
    const g = await geraet(code, HOST);
    const r = await fetch(D.basis + "/v1/verbinden", { method: "POST", headers: { "x-forwarded-for": "203.0.113.9" }, body: JSON.stringify(g.anfrage) });
    assert.equal(r.status, 403);
    assert.equal(cli("gemeinsam-beenden"), 0, "noch einmal: nichts Neues");
  } finally { await D.ende(); }
});

test("Gemeinsamer Schlüssel für Signaturen: ab dem ersten Gerät mit eigenen höchstens 30 Tage, nach 7 Tagen ohne früher; danach 401 zugang, signiert, ohne Fehlversuch, für immer", async () => {
  const { GEMEINSAM_FRIST, GEMEINSAM_SCHLUSS } = await modul("dienst.mjs");
  const TAG = 864e5;
  assert.deepEqual([GEMEINSAM_FRIST, GEMEINSAM_SCHLUSS], [7 * TAG, 30 * TAG]);
  const v = ordner();
  let D = await geraeteDienst({ v });
  try {
    // ohne Gerät mit eigenen Schlüsseln geht der gemeinsame über jede Frist hinaus
    D.uhr.t += 40 * TAG;
    assert.equal((await D.holen(D.konfig, "/v1/eingang")).status, 200);
    const A = await D.verbinden();
    const erstes = D.uhr.t;
    // alle 6 Tage eine Signatur: bis 30 Tage nach dem ersten Gerät
    while (D.uhr.t + 6 * TAG <= erstes + 30 * TAG) {
      D.uhr.t += 6 * TAG;
      assert.equal((await D.holen(D.konfig, "/v1/eingang")).status, 200, "Tag " + (D.uhr.t - erstes) / TAG);
    }
    D.uhr.t = erstes + 30 * TAG + 60e3;
    const aus = await D.holen(D.konfig, "/v1/eingang");
    assert.deepEqual([aus.status, aus.o, aus.echt(D.konfig)], [401, { fehler: "zugang", signatur: 1 }, true], "signiert: das Gerät soll sich gleich neu verbinden");
    assert.ok(fs.existsSync(path.join(v, "web", "gemeinsam-aus.json")));
    // kein Fehlversuch: ein falscher Schlüssel aus demselben Netz ist auch danach nicht gesperrt
    for (let i = 0; i < 12; i++) await D.holen(D.konfig, "/v1/status");
    assert.equal((await D.holen({ zugang: A.schluessel, schluessel: A.zugang }, "/v1/eingang")).status, 401);
    assert.equal((await D.holen(A, "/v1/eingang")).status, 200, "eigene Schlüssel gehen weiter");
    assert.equal((await D.holen("Bearer " + D.konfig.zugang, "/v1/eingang")).status, 401, "der Bearer hat seine eigene Frist (hier auch vorbei)");
    // Uhr zurück, Neustart: bleibt aus
    D.uhr.t -= 10 * TAG;
    assert.equal((await D.holen(D.konfig, "/v1/eingang")).status, 401, "Uhr zurück");
    await D.zu();
    D = await geraeteDienst({ v, konfig: D.konfig, uhr: D.uhr });
    assert.equal((await D.holen(D.konfig, "/v1/eingang")).status, 401, "nach dem Neustart");
    assert.equal((await D.holen(A, "/v1/eingang")).status, 200);
  } finally { await D.zu(); fs.rmSync(v, { recursive: true, force: true }); }
  // 7 Tage ohne Signatur unter dem gemeinsamen nach dem ersten Gerät: aus
  const E = await geraeteDienst();
  try {
    assert.equal((await E.holen(E.konfig, "/v1/eingang")).status, 200);
    await E.verbinden();
    E.uhr.t += 6 * TAG;
    assert.equal((await E.holen(E.konfig, "/v1/eingang")).status, 200, "6 Tage");
    E.uhr.t += 7 * TAG + 60e3;
    assert.equal((await E.holen(E.konfig, "/v1/eingang")).status, 401, "7 Tage nach der letzten");
  } finally { await E.ende(); }
});

test("Verbinden bis 0.7.7 (Code im Klartext): die gemeinsamen Schlüssel, solange der Bearer gilt; danach 403 veraltet, der Code bleibt, kein Fehlversuch", async () => {
  const { neuerCode } = await modul("verbinden.mjs");
  const TAG = 864e5;
  const D = await geraeteDienst();
  try {
    const alt = (code) => fetch(D.basis + "/v1/verbinden", { method: "POST", headers: { "x-forwarded-for": "198.51.100.7" }, body: JSON.stringify({ code }) });
    const r = await alt(neuerCode(path.join(D.v, "web"), { adresse: D.konfig.adresse, jetzt: new Date(D.uhr.t) }).code);
    assert.deepEqual(await r.json(), { adresse: D.konfig.adresse, zugang: D.konfig.zugang, schluessel: D.konfig.schluessel });
    assert.ok(!fs.existsSync(path.join(D.v, "web", "geraete-schluessel.json")), "kein Gerät mit eigenen Schlüsseln");
    // ein Gerät signiert, danach 7 Tage kein Bearer: der Bearer ist aus
    assert.equal((await D.holen(D.konfig, "/v1/eingang")).status, 200);
    D.uhr.t += 7 * TAG + 60e3;
    assert.equal((await D.holen("Bearer " + D.konfig.zugang, "/v1/eingang")).status, 401);
    const { code } = neuerCode(path.join(D.v, "web"), { adresse: D.konfig.adresse, jetzt: new Date(D.uhr.t) });
    for (let i = 0; i < 12; i++) {
      const x = await alt(code);
      assert.deepEqual([x.status, await x.json()], [403, { fehler: "veraltet", schema: 2 }]);
    }
    // kein Fehlversuch: ein falscher Code auf dem neuen Weg aus demselben Netz ist nicht gesperrt
    const falsch = await fetch(D.basis + "/v1/verbinden", { method: "POST", headers: { "x-forwarded-for": "198.51.100.7" }, body: JSON.stringify((await geraet("AAAAA-AAAAA", HOST)).anfrage) });
    assert.equal(falsch.status, 403);
    // derselbe Code geht auf dem Weg ab 0.7.8, mit eigenen Schlüsseln
    const g = await geraet(code, HOST);
    const neu = await fetch(D.basis + "/v1/verbinden", { method: "POST", headers: { "x-forwarded-for": "198.51.100.7" }, body: JSON.stringify(g.anfrage) });
    assert.equal(neu.status, 200, "kein Fehlversuch, der Code bleibt");
    assert.notEqual(g.entschluesseln(await neu.json()).zugang, D.konfig.zugang);
  } finally { await D.ende(); }
});

test("Wege bis 0.7.7 halten den gemeinsamen Schlüssel nicht am Leben: Bearer endet mit ihm, Codes über den Bearer nur, bis ein Gerät eigene Schlüssel hat", async () => {
  const { verschluesseln, entschluesseln } = await modul("kanal.mjs");
  const D = await geraeteDienst();
  try {
    const bearer = "Bearer " + D.konfig.zugang;
    const codeHolen = async () => D.holen(bearer, "/v1/geraet", { methode: "POST", body: JSON.stringify(await verschluesseln(D.konfig.schluessel, "verbinden",
      { schema: 1, zeit: new Date(D.uhr.t).toISOString(), nonce: crypto.randomBytes(16).toString("base64url") })) });
    const vorher = await codeHolen();
    assert.equal(vorher.status, 200, "solange kein Gerät eigene Schlüssel hat, wie bis 0.7.7");
    assert.match((await entschluesseln(D.konfig.schluessel, "verbinden", vorher.o)).code, /^[A-Z2-9]{5}-[A-Z2-9]{5}$/);
    await D.verbinden();
    assert.deepEqual([(await codeHolen()).status, (await codeHolen()).o], [403, { fehler: "veraltet" }], "danach kein Code mehr über den Bearer");
    assert.equal((await D.holen(bearer, "/v1/eingang")).status, 200, "abholen geht weiter");
    // ist der gemeinsame Schlüssel aus (Frist oder studium-server gemeinsam-beenden), gilt auch der Bearer nicht mehr
    fs.writeFileSync(path.join(D.v, "web", "gemeinsam-aus.json"), JSON.stringify({ seit: new Date(D.uhr.t).toISOString() }));
    const aus = await D.holen(bearer, "/v1/eingang");
    assert.deepEqual([aus.status, aus.o], [401, { fehler: "veraltet", signatur: 1 }]);
  } finally { await D.ende(); }
});

test("Neue Schlüssel (schluessel-erneuern): Geräte mit eigenen bekommen 30 Tage lang 401 erneuert, signiert unter ihren; die Liste ist leer, neue Geräte gehen; eine neue Adresse trennt alle", async () => {
  const { neuerSchluessel } = await modul("kanal.mjs");
  const TAG = 864e5;
  const v = ordner();
  let D = await geraeteDienst({ v });
  try {
    const A = await D.verbinden(), B = await D.verbinden();
    assert.equal((await D.holen(A, "/v1/eingang")).status, 200);
    // wie schluessel_erneuern in server/studium-server (der Dienst liest dienst.json beim Start; hier dasselbe Objekt)
    Object.assign(D.konfig, { zugang_alt: D.konfig.zugang, schluessel_alt: D.konfig.schluessel, erneuert: new Date(D.uhr.t).toISOString(),
      zugang: neuerSchluessel(), schluessel: neuerSchluessel() });
    const a = await D.holen(A, "/v1/eingang");
    assert.deepEqual([a.status, a.o, a.echt(A)], [401, { fehler: "zugang", erneuert: 1, signatur: 1 }, true]);
    const vz = D.verzeichnis();
    assert.deepEqual([vz.geraete, vz.alt.geraete.map((g) => g.id).sort()], [[], [A.geraet, B.geraet].sort()]);
    assert.ok(vz.alt.geraete.every((g) => Object.keys(g).sort().join() === "id,schluessel,zugang"), "von den alten nur die Schlüssel");
    assert.deepEqual((await D.holen(D.konfig, "/v1/status")).o.geraete, [], "mit den neuen gilt keins");
    const C = await D.verbinden();
    assert.equal((await D.holen(C, "/v1/eingang")).status, 200, "ein neu verbundenes Gerät geht");
    // auch nach einem Neustart (dienst.json mit zugang_alt), bis 30 Tage nach dem Erneuern
    await D.zu();
    D = await geraeteDienst({ v, konfig: D.konfig, uhr: D.uhr });
    assert.equal((await D.holen(B, "/v1/status")).o.erneuert, 1);
    D.uhr.t += 31 * TAG;
    const spaet = await D.holen(B, "/v1/eingang");
    assert.deepEqual([spaet.status, spaet.o, spaet.mac], [401, { fehler: "zugang", signatur: 1 }, null], "nach 30 Tagen wie ein fremder Schlüssel");
    assert.equal(D.verzeichnis().alt, undefined, "die alten fallen weg");
    // neue Adresse (installieren.sh: neue Schlüssel ohne die alten): kein Gerät gilt mehr
    await D.zu();
    const k = Object.assign({}, D.konfig, { zugang: neuerSchluessel(), schluessel: neuerSchluessel() });
    D = await geraeteDienst({ v, konfig: k, uhr: D.uhr });
    assert.deepEqual([(await D.holen(C, "/v1/eingang")).status, D.verzeichnis().geraete], [401, []]);
  } finally { await D.zu(); fs.rmSync(v, { recursive: true, force: true }); }
});
