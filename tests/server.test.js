// Tests für den eigenen Server (server/: kanal, dienst, verbinden, zustand, speicher-reserve, Skripte). Ohne Netz außer
// 127.0.0.1. Ohne server/ (noch nicht Teil des Releases) werden die Tests übersprungen statt rot.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const assert = require("node:assert/strict");

const SERVER = path.join(__dirname, "..", "server");
const da = fs.existsSync(path.join(SERVER, "dienst.mjs"));
const test = (name, a, b) => require("node:test")(name, { ...(b ? a : {}), skip: (!da && "server/ fehlt in diesem Baum") || (b && a.skip) }, b || a);
const laden = (datei) => import(pathToFileURL(path.join(SERVER, datei)).href);
const ordner = () => fs.mkdtempSync(path.join(os.tmpdir(), "studium-server-"));

test("Kanal: hin und zurück; falscher Schlüssel, falscher Zweck und veränderte Daten scheitern", async () => {
  const { neuerSchluessel, verschluesseln, entschluesseln } = await laden("kanal.mjs");
  const k = neuerSchluessel();
  const paket = await verschluesseln(k, "eingang", { termine: [{ titel: "Übung 3" }] });
  assert.deepEqual(Object.keys(paket).sort(), ["daten", "iv", "schema", "zweck"]);
  assert.deepEqual(await entschluesseln(k, "eingang", paket), { termine: [{ titel: "Übung 3" }] });
  await assert.rejects(entschluesseln(neuerSchluessel(), "eingang", paket));
  await assert.rejects(entschluesseln(k, "stand", paket), /anderen Zweck/);
  await assert.rejects(entschluesseln(k, "stand", { ...paket, zweck: "stand" }), "Zweck steckt in der Verschlüsselung");
  const kaputt = { ...paket, daten: paket.daten.slice(0, -2) + (paket.daten.endsWith("AA") ? "BB" : "AA") };
  await assert.rejects(entschluesseln(k, "eingang", kaputt));
  await assert.rejects(verschluesseln("zu-kurz", "eingang", {}), /32 Byte/);
  await assert.rejects(verschluesseln(k, "anderes", {}), /Zweck/);
});

test("Einmal-Code: gilt einmal, läuft nach 30 Minuten ab, falsche Codes scheitern", async () => {
  const { neuerCode, codeEinloesen, link } = await laden("verbinden.mjs");
  const v = ordner();
  const jetzt = new Date("2026-10-18T10:00:00Z");
  const { code, ablauf } = neuerCode(v, { jetzt });
  assert.match(code, /^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
  assert.equal(ablauf, "2026-10-18T10:30:00.000Z");
  assert.ok(!fs.readdirSync(path.join(v, "verbinden")).some((n) => n.includes(code.replace("-", ""))), "nur der Hash liegt ab");
  assert.equal(codeEinloesen(v, code.toLowerCase().replace("-", " "), jetzt), "cloud-shell", "Schreibweise egal; Herkunft des Codes");
  assert.equal(codeEinloesen(v, code, jetzt), "", "nur einmal");
  const alt = neuerCode(v, { jetzt });
  assert.equal(codeEinloesen(v, alt.code, new Date("2026-10-18T10:31:00Z")), "", "abgelaufen");
  assert.deepEqual(fs.readdirSync(path.join(v, "verbinden")), [], "auch ein abgelaufener ist danach weg");
  assert.equal(codeEinloesen(v, "AAAAA-AAAAA", jetzt), "");
  assert.match(link("https://beispiel.example", code), /^obsidian:\/\/studium-autopilot\?aktion=server-verbinden&adresse=https%3A%2F%2Fbeispiel\.example&code=/);
});

test("Einmal-Code: lösen mehrere zugleich denselben Code ein, bekommt nur einer die Schlüssel (exklusive Marke)", async () => {
  const { Worker } = require("node:worker_threads");
  const { neuerCode } = await laden("verbinden.mjs");
  const v = ordner();
  const GERAETE = 6, CODES = 20;
  const codes = Array.from({ length: CODES }, () => neuerCode(v).code);
  // Alle warten an derselben Stelle (Atomics) und lösen dann dieselben Codes in derselben Reihenfolge ein
  const start = new Int32Array(new SharedArrayBuffer(4));
  const skripte = ordner(), geraet = path.join(skripte, "geraet.mjs");
  fs.writeFileSync(geraet, ['import { workerData as w, parentPort } from "node:worker_threads";', "const { codeEinloesen } = await import(w.modul);",
    'parentPort.postMessage("bereit");', "Atomics.wait(new Int32Array(w.start), 0, 0);", "parentPort.postMessage(w.codes.map((c) => codeEinloesen(w.v, c)));", ""].join("\n"));
  try {
    let bereit = 0;
    const ergebnisse = await Promise.all(Array.from({ length: GERAETE }, () => new Promise((fertig, fehler) => {
      const w = new Worker(geraet, { workerData: { modul: pathToFileURL(path.join(SERVER, "verbinden.mjs")).href, v, codes, start: start.buffer } });
      w.on("message", (m) => {
        if (m !== "bereit") { fertig(m); return; }
        if (++bereit === GERAETE) { Atomics.store(start, 0, 1); Atomics.notify(start, 0); }
      });
      w.once("error", fehler);
    })));
    for (let i = 0; i < CODES; i++) {
      assert.deepEqual(ergebnisse.map((e) => e[i]).filter(Boolean), ["cloud-shell"], `Code ${i}: genau einmal eingelöst`);
    }
    assert.deepEqual(fs.readdirSync(path.join(v, "verbinden")), [], "nichts Halbes liegen geblieben");
  } finally { for (const o of [v, skripte]) fs.rmSync(o, { recursive: true, force: true }); }
});

test("Code für ein weiteres Gerät (Obsidian): 10 Minuten, ein neuer zieht den vorigen zurück, 3 je Stunde und 10 je Tag; Codes der Cloud Shell bleiben", async () => {
  const { geraetCode, neuerCode, codeEinloesen, verbundenLesen, GERAET } = await laden("verbinden.mjs");
  assert.deepEqual([GERAET.minuten, GERAET.stunde, GERAET.tag], [10, 3, 10]);
  const v = ordner();
  const t0 = new Date("2026-11-01T08:00:00Z");
  const um = (min) => new Date(t0.getTime() + min * 60e3);
  let n = 0;
  const holen = (min) => geraetCode(v, { schema: 1, zeit: um(min).toISOString(), nonce: "zufallswert-" + String(n++).padStart(8, "0") }, um(min));
  try {
    const shell = neuerCode(v, { jetzt: t0 });
    const codes = [0, 1, 2].map((min) => {
      const [status, c] = holen(min);
      assert.equal(status, 200);
      assert.match(c.code, /^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
      return c;
    });
    assert.equal(codes[0].ablauf, um(10).toISOString(), "gilt 10 Minuten");
    assert.equal(codeEinloesen(v, codes[0].code, um(2)), "", "zurückgezogen");
    assert.equal(codeEinloesen(v, codes[1].code, um(2)), "", "zurückgezogen");
    assert.deepEqual(holen(3), [429, { fehler: "zu-viele", wieder: um(60).toISOString() }], "höchstens 3 je Stunde");
    assert.equal(codeEinloesen(v, shell.code, um(3)), "cloud-shell", "Code der Cloud Shell bleibt und zählt nicht mit");
    assert.equal(codeEinloesen(v, codes[2].code, um(12)), "", "nach 10 Minuten abgelaufen");
    const [s60, c60] = holen(60);
    assert.equal(s60, 200, "eine Stunde nach dem ersten wieder");
    assert.equal(codeEinloesen(v, c60.code, um(69)), "obsidian");
    for (const min of [61, 62, 120, 121, 122, 180]) assert.equal(holen(min)[0], 200, `um ${min}`);
    assert.deepEqual(holen(181), [429, { fehler: "zu-viele", wieder: um(24 * 60).toISOString() }], "höchstens 10 je Tag");
    assert.equal(holen(24 * 60)[0], 200, "ein Tag nach dem ersten wieder");
    assert.deepEqual(verbundenLesen(v, um(24 * 60)), [{ zeit: um(3).toISOString(), herkunft: "cloud-shell" }, { zeit: um(69).toISOString(), herkunft: "obsidian" }]);
    assert.doesNotMatch(fs.readFileSync(path.join(v, "geraete.json"), "utf8"), new RegExp(c60.code.replace("-", "-?")), "kein Code in geraete.json");
  } finally { fs.rmSync(v, { recursive: true, force: true }); }
});

test("Code für ein weiteres Gerät: nur mit frischer Zeit und neuem Zufallswert, auch nach einem Neustart des Dienstes", async () => {
  const { geraetCode, GERAET } = await laden("verbinden.mjs");
  const v = ordner();
  const jetzt = new Date("2026-11-01T08:00:00Z");
  const zeit = (ms) => new Date(jetzt.getTime() + ms).toISOString();
  try {
    for (const falsch of [null, {}, { schema: 1, zeit: zeit(0) }, { schema: 2, zeit: zeit(0), nonce: "a".repeat(22) },
      { schema: 1, zeit: "gestern", nonce: "a".repeat(22) }, { schema: 1, zeit: zeit(0), nonce: "kurz" }, { schema: 1, zeit: zeit(0), nonce: "<b>".repeat(8) }]) {
      assert.deepEqual(geraetCode(v, falsch, jetzt), [400, { fehler: "anfrage" }], JSON.stringify(falsch));
    }
    assert.deepEqual(geraetCode(v, { schema: 1, zeit: zeit(-GERAET.uhr - 1000), nonce: "alt-".padEnd(22, "x") }, jetzt), [400, { fehler: "uhr" }], "zu alt");
    assert.deepEqual(geraetCode(v, { schema: 1, zeit: zeit(GERAET.uhr + 1000), nonce: "zukunft-".padEnd(22, "x") }, jetzt), [400, { fehler: "uhr" }], "aus der Zukunft");
    const anfrage = { schema: 1, zeit: zeit(-GERAET.uhr + 1000), nonce: "einmal-".padEnd(22, "x") };
    assert.equal(geraetCode(v, anfrage, jetzt)[0], 200, "knapp 2 Minuten alt geht");
    // geraete.json ist der Speicher: ein neuer Aufruf (wie nach einem Neustart) kennt den Zufallswert noch
    assert.deepEqual(geraetCode(v, anfrage, new Date(jetzt.getTime() + 500)), [409, { fehler: "wiederholt" }], "Wiederholung abgelehnt");
    // nach seinem Zeitfenster ist die Anfrage ohnehin zu alt, und der nächste Code vergisst den Zufallswert
    const spaeter = new Date(jetzt.getTime() + 2000);
    assert.deepEqual(geraetCode(v, anfrage, spaeter), [400, { fehler: "uhr" }]);
    assert.equal(geraetCode(v, { schema: 1, zeit: spaeter.toISOString(), nonce: "danach-".padEnd(22, "x") }, spaeter)[0], 200);
    assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(path.join(v, "geraete.json"), "utf8")).nonces), ["danach-".padEnd(22, "x")], "abgelaufener Zufallswert weg");
    // höchstens GERAET.nonces offene Zufallswerte
    const voll = {};
    for (let i = 0; i < GERAET.nonces; i++) voll["voll-" + String(i).padStart(17, "0")] = zeit(60e3);
    fs.writeFileSync(path.join(v, "geraete.json"), JSON.stringify({ ausgestellt: [], nonces: voll, verbunden: [] }));
    assert.deepEqual(geraetCode(v, { schema: 1, zeit: zeit(0), nonce: "noch-einer-".padEnd(22, "x") }, jetzt), [429, { fehler: "zu-viele" }]);
  } finally { fs.rmSync(v, { recursive: true, force: true }); }
});

test("Dienst: Code für ein weiteres Gerät nur mit Zugangsschlüssel und einer Anfrage mit dem Datenschlüssel, Antwort verschlüsselt; Verbinden steht nur im verschlüsselten Eingang", async () => {
  const { erzeugeDienst } = await laden("dienst.mjs");
  const { neuerSchluessel, verschluesseln, entschluesseln } = await laden("kanal.mjs");
  const v = ordner();
  const uhr = { t: new Date("2026-11-01T08:00:00Z") };
  const konfig = { zugang: neuerSchluessel(), schluessel: neuerSchluessel(), adresse: "https://beispiel.example", version: "0.0.0-test" };
  const server = erzeugeDienst({ konfig, verzeichnis: v, jetzt: () => new Date(uhr.t) });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const basis = `http://127.0.0.1:${server.address().port}`;
  const mit = { authorization: `Bearer ${konfig.zugang}` };
  let n = 0;
  const anfrage = (o) => Object.assign({ schema: 1, zeit: new Date(uhr.t).toISOString(), nonce: "anfrage-".padEnd(20, "x") + String(n++).padStart(4, "0") }, o);
  const holen = async (paket, kopf) => fetch(`${basis}/v1/geraet`, { method: "POST", headers: kopf === undefined ? mit : kopf, body: JSON.stringify(paket) });
  try {
    const gut = await verschluesseln(konfig.schluessel, "verbinden", anfrage());
    assert.equal((await holen(gut, {})).status, 401, "ohne Zugangsschlüssel");
    assert.equal((await holen(anfrage())).status, 400, "unverschlüsselt");
    assert.equal((await holen(await verschluesseln(konfig.schluessel, "stand", anfrage()))).status, 400, "anderer Zweck");
    assert.equal((await holen(await verschluesseln(neuerSchluessel(), "verbinden", anfrage()))).status, 400, "anderer Datenschlüssel");
    const alt = await holen(await verschluesseln(konfig.schluessel, "verbinden", anfrage({ zeit: new Date(uhr.t.getTime() - 5 * 60e3).toISOString() })));
    assert.deepEqual([alt.status, await alt.json()], [400, { fehler: "uhr" }], "veraltete Anfrage");
    const antwort = await holen(gut);
    assert.equal(antwort.status, 200);
    const paket = await antwort.json();
    assert.deepEqual(Object.keys(paket).sort(), ["daten", "iv", "schema", "zweck"], "Antwort nur verschlüsselt");
    const { code, ablauf } = await entschluesseln(konfig.schluessel, "verbinden", paket);
    assert.match(code, /^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
    assert.equal(ablauf, new Date(uhr.t.getTime() + 10 * 60e3).toISOString());
    assert.equal((await holen(gut)).status, 409, "dieselbe Anfrage noch einmal");
    assert.equal((await fetch(`${basis}/v1/geraet`, { headers: mit })).status, 405);
    // Einlösen wie ein Code aus der Cloud Shell; danach steht das Verbinden nur im verschlüsselten Eingang
    const verbunden = await fetch(`${basis}/v1/verbinden`, { method: "POST", body: JSON.stringify({ code: code.toLowerCase() }) });
    assert.deepEqual(await verbunden.json(), { adresse: konfig.adresse, zugang: konfig.zugang, schluessel: konfig.schluessel });
    const status = await (await fetch(`${basis}/v1/status`)).text();
    assert.doesNotMatch(status, /obsidian|cloud-shell|verbunden/, "nicht im öffentlichen Status");
    const eingang = await (await fetch(`${basis}/v1/eingang`, { headers: mit })).text();
    assert.doesNotMatch(eingang, /obsidian/);
    assert.deepEqual((await entschluesseln(konfig.schluessel, "eingang", JSON.parse(eingang))).verbunden, [{ zeit: uhr.t.toISOString(), herkunft: "obsidian" }]);
    // höchstens 3 je Stunde, mit dem Zeitpunkt, ab dem es wieder geht
    for (let i = 0; i < 2; i++) assert.equal((await holen(await verschluesseln(konfig.schluessel, "verbinden", anfrage()))).status, 200);
    const zuViele = await holen(await verschluesseln(konfig.schluessel, "verbinden", anfrage()));
    assert.deepEqual([zuViele.status, await zuViele.json()], [429, { fehler: "zu-viele", wieder: new Date(uhr.t.getTime() + 3600e3).toISOString() }]);
  } finally {
    await new Promise((r) => server.close(r));
    fs.rmSync(v, { recursive: true, force: true });
  }
});

test("Öffentlicher Status: nur Werte aus der Freigabeliste, nichts Persönliches", async () => {
  const { oeffentlicherStatus } = await laden("dienst.mjs");
  const s = oeffentlicherStatus({
    claude: "angemeldet", gmail: "ok", weiterleitung: "vielleicht", uniZugang: "gespeichert", speicherReserve: "an",
    letzterLauf: { zeit: "2026-10-18T07:30:00Z", ok: true, notiz: "geheim" },
    fehler: ["claude-abgemeldet", "Passwort falsch für zxabc01", "x".repeat(50)], benutzer: "zxabc01",
  }, { zuletzt: "2026-10-18T08:00:00Z" }, "0.0.0-entwicklung", new Date("2026-10-18T09:00:00Z"));
  assert.equal(s.weiterleitung, "unbekannt");
  assert.deepEqual(s.fehler, ["claude-abgemeldet"]);
  assert.deepEqual(s.letzter_lauf, { zeit: "2026-10-18T07:30:00.000Z", ok: true });
  assert.equal(s.plugin_abruf, "2026-10-18T08:00:00.000Z");
  assert.deepEqual(Object.keys(s), ["schema", "version", "zeit", "claude", "gmail", "weiterleitung", "uni_zugang", "speicher_reserve", "livesync", "plugin_abruf", "letzter_lauf", "claude_lauf", "limit_wieder", "aktualisierung", "fehler"]);
  assert.doesNotMatch(JSON.stringify(s), /zxabc01|geheim|Passwort/);
  // claude_lauf: wartet (Anstoß da) | laeuft (seit unter 100 Minuten, der Zeitgrenze des Laufs) | ruht
  const jetzt = new Date("2026-10-18T09:00:00Z");
  assert.equal(s.claude_lauf, "ruht");
  assert.equal(oeffentlicherStatus({}, {}, "x", jetzt, true).claude_lauf, "wartet");
  assert.equal(oeffentlicherStatus({ laeuftSeit: "2026-10-18T08:30:00Z" }, {}, "x", jetzt).claude_lauf, "laeuft");
  assert.equal(oeffentlicherStatus({ laeuftSeit: "2026-10-18T07:30:00Z" }, {}, "x", jetzt).claude_lauf, "laeuft", "Opus und gewöhnlicher Lauf");
  assert.equal(oeffentlicherStatus({ laeuftSeit: "2026-10-18T07:10:00Z" }, {}, "x", jetzt).claude_lauf, "ruht", "hängt nicht für immer");
  // Gmail „nie“ in Obsidian: aus, nicht das Ergebnis der letzten Suche
  assert.equal(oeffentlicherStatus({ gmail: "ok" }, {}, "x", jetzt, false, { uni_postfach: 15, gmail: 0 }).gmail, "aus");
  assert.equal(oeffentlicherStatus({ gmail: "ok" }, {}, "x", jetzt, false, { uni_postfach: 15, gmail: 1 }).gmail, "ok");
  // letzte neue Version (studium-server aktualisieren): Zeitpunkte, ok, eine Version, ein Grund aus fester Liste; ohne Datei null
  assert.equal(s.aktualisierung, null, "älterer Server");
  const akt = (a) => oeffentlicherStatus({}, {}, "x", jetzt, false, {}, a).aktualisierung;
  assert.deepEqual(akt({ zeit: "2026-10-18T02:10:00Z", ok: false, ziel: "0.6.9", grund: "pruefsumme", erfolg: "2026-10-17T02:05:00Z", text: "geheim" }),
    { zeit: "2026-10-18T02:10:00.000Z", ok: false, ziel: "0.6.9", grund: "pruefsumme", erfolg: "2026-10-17T02:05:00.000Z" });
  assert.deepEqual(akt({ zeit: "2026-10-18T02:10:00Z", ok: true, ziel: "<b>x</b>", grund: "github", erfolg: "" }),
    { zeit: "2026-10-18T02:10:00.000Z", ok: true, ziel: "", grund: "", erfolg: null });
  assert.equal(akt({ zeit: "2026-10-18T02:10:00Z", ok: false, grund: "Passwort falsch für zxabc01" }).grund, "unbekannt");
  assert.equal(akt({ ok: false, grund: "github" }), null, "ohne Zeit");
  // am Limit des Claude-Abos: nur der Zeitpunkt des nächsten Versuchs
  assert.equal(s.limit_wieder, null);
  assert.equal(oeffentlicherStatus({ limit: { seit: "2026-10-18T08:00:00Z", versuche: 2, wieder: "2026-10-18T09:30:00Z", gmail: true } }, {}, "x", jetzt).limit_wieder,
    "2026-10-18T09:30:00.000Z");
  assert.equal(oeffentlicherStatus({ limit: { wieder: "bald" } }, {}, "x", jetzt).limit_wieder, null);
});

test("Limit des Claude-Abos: Der Dienst stößt den nächsten Versuch an, wenn er dran ist, und nur einmal", async () => {
  const { limitWiederholen } = await laden("dienst.mjs");
  const v = fs.mkdtempSync(path.join(os.tmpdir(), "studium-limit-"));
  const t0 = new Date("2026-10-18T09:00:00Z");
  const zustand = (z) => fs.writeFileSync(path.join(v, "zustand.json"), JSON.stringify(z));
  const anstoss = () => fs.existsSync(path.join(v, "web", "anstoss"));
  assert.equal(limitWiederholen(v, t0), false, "ohne Zustand");
  zustand({ limit: { seit: "2026-10-18T08:00:00Z", versuche: 1, wieder: "2026-10-18T09:30:00Z" }, letzterLauf: { zeit: "2026-10-18T09:00:00Z", ok: false } });
  assert.equal(limitWiederholen(v, t0), false, "noch nicht dran");
  const dran = new Date("2026-10-18T09:31:00Z");
  zustand({ limit: { versuche: 1, wieder: "2026-10-18T09:30:00Z" }, letzterLauf: { zeit: "2026-10-18T09:00:00Z", ok: false }, laeuftSeit: "2026-10-18T09:29:00Z" });
  assert.equal(limitWiederholen(v, dran), false, "ein Lauf läuft gerade");
  zustand({ limit: { versuche: 1, wieder: "2026-10-18T09:30:00Z" }, letzterLauf: { zeit: "2026-10-18T09:30:30Z", ok: false } });
  assert.equal(limitWiederholen(v, dran), false, "seit dem Zeitpunkt schon gelaufen");
  zustand({ limit: { versuche: 1, wieder: "2026-10-18T09:30:00Z" }, letzterLauf: { zeit: "2026-10-18T09:00:00Z", ok: false } });
  assert.equal(limitWiederholen(v, dran), true);
  assert.equal(JSON.parse(fs.readFileSync(path.join(v, "web", "anstoss"), "utf8")).grund, "wiederholung");
  assert.equal(limitWiederholen(v, new Date(dran.getTime() + 5 * 60e3)), false, "der Anstoß wartet noch");
  fs.rmSync(path.join(v, "web", "anstoss"));
  fs.writeFileSync(path.join(v, "anstoss"), JSON.stringify({ grund: "gmail" }));
  assert.equal(limitWiederholen(v, new Date(dran.getTime() + 6 * 60e3)), false, "auch einer im Datenordner (Gmail-Zeit) wartet");
  fs.rmSync(path.join(v, "anstoss"));
  zustand({ letzterLauf: { zeit: "2026-10-18T09:31:00Z", ok: true } });
  assert.equal(limitWiederholen(v, new Date(dran.getTime() + 10 * 60e3)), false, "Limit vorbei");
  assert.ok(!anstoss());
});

test("Knopf „Mails durchsuchen“: Anstoß mit Grund knopf, höchstens alle 10 Minuten, auch wenn schon einer wartet", async () => {
  const { knopfAnstoss } = await laden("dienst.mjs");
  const v = fs.mkdtempSync(path.join(os.tmpdir(), "studium-knopf-"));
  const t0 = new Date("2026-10-18T09:00:00Z");
  assert.deepEqual(knopfAnstoss(v, t0), [200, { angestossen: true }]);
  assert.equal(JSON.parse(fs.readFileSync(path.join(v, "web", "anstoss"), "utf8")).grund, "knopf", "im Ordner des Dienstes");
  assert.ok(!fs.existsSync(path.join(v, "anstoss")), "nie im Datenordner selbst (den beschreibt nur der Lauf)");
  const zuFrueh = knopfAnstoss(v, new Date(t0.getTime() + 5 * 60e3));
  assert.deepEqual(zuFrueh, [429, { fehler: "zu-frueh", wieder: "2026-10-18T09:10:00.000Z" }]);
  // wartet schon ein Anstoß (etwa „unterlagen“ nach einem Abruf, bis 0.7.6 blieb er, und Gmail kam nicht dran): knopf ersetzt ihn
  fs.writeFileSync(path.join(v, "web", "anstoss"), JSON.stringify({ grund: "unterlagen" }));
  fs.writeFileSync(path.join(v, "anstoss"), JSON.stringify({ grund: "gmail" }));
  assert.deepEqual(knopfAnstoss(v, new Date(t0.getTime() + 11 * 60e3)), [200, { angestossen: true }]);
  assert.equal(JSON.parse(fs.readFileSync(path.join(v, "web", "anstoss"), "utf8")).grund, "knopf");
  assert.equal(JSON.parse(fs.readFileSync(path.join(v, "anstoss"), "utf8")).grund, "gmail", "der Anstoß eines anderen Schreibers bleibt");
  const { anstossNehmen } = await laden("lauf.mjs");
  assert.equal(anstossNehmen(v).grund, "knopf", "der Lauf nimmt knopf vor allen anderen");
  // knopf.json liest auch der Abruf (anderer Benutzer): 0644, unabhängig von der UMask des Dienstes
  if (process.platform !== "win32") assert.equal(fs.statSync(path.join(v, "web", "knopf.json")).mode & 0o777, 0o644);
});

test("Stand des Plugins: nur Modulcodes und kurze Felder, erledigte Dateien nur mit sicheren Namen", async () => {
  const { standPruefen } = await laden("dienst.mjs");
  const { stand, erledigt } = standPruefen({
    schema: 1, module: ["B110", "SQ888", "B11X", "<script>", "e101"], studienbeginn: "WS 2026/27", variante: "offen",
    erledigt: ["2026-10-18-073000-termine.json", "../dienst.json", "a/b.json", ".versteckt.json"], name: "Max",
  });
  assert.deepEqual(stand, { schema: 1, module: ["B110", "SQ888", "B11X"], studienbeginn: "WS 2026/27", variante: "offen",
    takt: { uni_postfach: 15, gmail: 3 }, tresor: { termine: [], todos: [] } });
  assert.deepEqual(erledigt, ["2026-10-18-073000-termine.json"]);
  assert.throws(() => standPruefen({ schema: 2 }), /Schema/);
  // Takt: nur die Werte aus der Liste, sonst der Standard (auch ohne Takt, älteres Plugin)
  assert.deepEqual(standPruefen({ schema: 1, takt: { uni_postfach: 30, gmail: 0 } }).stand.takt, { uni_postfach: 30, gmail: 0 });
  assert.deepEqual(standPruefen({ schema: 1, takt: { uni_postfach: 5, gmail: "1" } }).stand.takt, { uni_postfach: 15, gmail: 3 });
  assert.deepEqual(standPruefen({ schema: 1, takt: "schnell" }).stand.takt, { uni_postfach: 15, gmail: 3 });
});

test("Unterlagen für Begleitnotizen: nur Lehrmaterial mit gültigem Pfad und Kennung, Ablage für den Lauf, Anstoß bleibt, Grenze", async () => {
  const { unterlagenPruefen, unterlagenAblegen } = await laden("dienst.mjs");
  const k = (c) => c.repeat(64);
  const u = (x) => Object.assign({ datei: "Unterlagen/B110 Einführung/B110 Folien 02 Kosten.pdf", kennung: k("a"), art: "Folien", titel: "B110 Folien 02 Kosten",
    code: "B110", seiten: 42, text: "[S. 1]\nKosten und Erlöse\u0007\n[S. 2]\nDeckungsbeitrag" }, x);
  const geprueft = unterlagenPruefen({ schema: 1, unterlagen: [u(), u({ art: "Mitschrift", kennung: k("b") }), u({ datei: "Unterlagen/../x.pdf", kennung: k("c") }),
    u({ datei: "Termine/x.pdf", kennung: k("d") }), u({ datei: "Unterlagen/x.md", kennung: k("e") }), u({ kennung: "kurz" })] });
  assert.equal(geprueft.length, 1, "nur der erste (höchstens 3 je Anfrage, Rest ungültig)");
  assert.equal(geprueft[0].text, "[S. 1]\nKosten und Erlöse \n[S. 2]\nDeckungsbeitrag", "Steuerzeichen weg, Zeilen bleiben");
  assert.throws(() => unterlagenPruefen({ schema: 2, unterlagen: [] }), /Schema/);

  const v = fs.mkdtempSync(path.join(os.tmpdir(), "studium-unterlagen-"));
  fs.writeFileSync(path.join(v, "anstoss"), JSON.stringify({ zeit: "x", grund: "gmail" }));
  assert.equal(unterlagenAblegen(v, geprueft), 1);
  const datei = fs.readFileSync(path.join(v, "unterlagen", "neu", k("a") + ".md"), "utf8");
  assert.ok(datei.startsWith("# B110 Folien 02 Kosten\n\nDatei: Unterlagen/B110 Einführung/B110 Folien 02 Kosten.pdf\nModul: B110 · Art: Folien · Seiten: 42\n"), datei.slice(0, 200));
  assert.equal(JSON.parse(fs.readFileSync(path.join(v, "anstoss"), "utf8")).grund, "gmail", "wartender Anstoß bleibt");
  assert.ok(!fs.existsSync(path.join(v, "web", "anstoss")), "kein zweiter dazu");
  fs.rmSync(path.join(v, "anstoss"));
  unterlagenAblegen(v, [Object.assign({}, geprueft[0], { kennung: k("f") })]);
  assert.equal(JSON.parse(fs.readFileSync(path.join(v, "web", "anstoss"), "utf8")).grund, "unterlagen");
  const viele = Array.from({ length: 29 }, (_, i) => Object.assign({}, geprueft[0], { kennung: String(i).padStart(64, "0") }));
  assert.throws(() => unterlagenAblegen(v, viele), (e) => e.status === 429, "höchstens 30 warten");
  assert.equal(unterlagenAblegen(v, viele.slice(0, 28)), 28, "bis 30 geht");

  // Auf Wunsch (Knopf „Zusammenfassen“): modell opus → eigener Ordner für den Opus-Lauf, raus aus dem gewöhnlichen
  const w = fs.mkdtempSync(path.join(os.tmpdir(), "studium-unterlagen-"));
  const [gewoehnlich, gewuenscht] = unterlagenPruefen({ schema: 1, unterlagen: [u(), u({ kennung: k("b"), modell: "opus" })] });
  assert.deepEqual([gewoehnlich.opus, gewuenscht.opus], [false, true]);
  unterlagenAblegen(w, [gewoehnlich, Object.assign({}, gewoehnlich, { kennung: k("b") })]);
  unterlagenAblegen(w, [gewuenscht]);
  assert.deepEqual([fs.readdirSync(path.join(w, "unterlagen", "neu")), fs.readdirSync(path.join(w, "unterlagen", "opus"))], [[k("a") + ".md"], [k("b") + ".md"]]);
  assert.equal(unterlagenPruefen({ schema: 1, unterlagen: [u({ modell: "haiku" })] })[0].opus, false, "nur opus zählt");

  // Nur Termine (Module ohne zentrale Termine aus Unterlagen): Kopfzeile für Claude; ein Wunsch mit Opus geht vor
  const [nurT, beides] = unterlagenPruefen({ schema: 1, unterlagen: [u({ kennung: k("c"), nur_termine: true }), u({ kennung: k("d"), nur_termine: true, modell: "opus" })] });
  assert.deepEqual([nurT.nurTermine, beides.nurTermine, beides.opus], [true, false, true]);
  unterlagenAblegen(w, [nurT]);
  assert.match(fs.readFileSync(path.join(w, "unterlagen", "neu", k("c") + ".md"), "utf8"), /\nAuftrag: nur Termine \(keine Begleitnotiz\)\n\n---\n/);
  assert.doesNotMatch(fs.readFileSync(path.join(w, "unterlagen", "neu", k("a") + ".md"), "utf8"), /Auftrag:/);
});

test("Neue Fassung einer Unterlage: Angaben zur früheren Fassung geprüft im Kopf, mit denselben Zeilen wie im Plugin", async () => {
  const { unterlagenPruefen, unterlagenAblegen, fassungPruefen } = await laden("dienst.mjs");
  const F = require(path.join(__dirname, "..", "Studium Autopilot", "System", "Skripte", "fassung.js"));
  const k = { frueher: ["Ziel: Gewinn S. 2", "Stakeholder-Ansatz"], bis: "2026-10-16", geaendert: "2, 4–6", entfallen: 1, zu_tun: ["Blatt 1 abgeben"], fragen: ["Wozu fixe Kosten?"] };
  const u = { datei: "Unterlagen/B110 Einführung/B110 Folien 01.pdf", kennung: "a".repeat(64), art: "Folien", titel: "Folien 01", code: "B110", seiten: 6, text: "[S. 1]\nZiele" };
  const [mit, ohne, nurT] = unterlagenPruefen({ schema: 1, unterlagen: [{ ...u, fassung: k }, { ...u, kennung: "b".repeat(64) },
    { ...u, kennung: "c".repeat(64), nur_termine: true, fassung: k }] });
  assert.deepEqual(mit.fassung, k);
  assert.deepEqual([ohne.fassung, nurT.fassung], [null, null], "ohne Angaben und bei „nur Termine“ kein Kopf");
  const v = fs.mkdtempSync(path.join(os.tmpdir(), "studium-unterlagen-"));
  unterlagenAblegen(v, [mit]);
  const datei = fs.readFileSync(path.join(v, "unterlagen", "neu", "a".repeat(64) + ".md"), "utf8");
  assert.ok(datei.includes("Seiten: 6\n\n" + F.kontextText(k) + "\n\n---\n[S. 1]\nZiele"), datei);
  // was nicht passt, fällt einzeln weg; ohne Datum keine frühere Zusammenfassung
  assert.deepEqual(fassungPruefen({ frueher: ["ok", 5, "<%tp.x%>", "x".repeat(301)], bis: "16.10.2026", geaendert: "1; rm", entfallen: -1, zu_tun: "kein Array",
    fragen: ["[[Link]]?"] }), { frueher: [], bis: "", geaendert: "", entfallen: 0, zu_tun: [], fragen: ["Link ?"] });
  assert.deepEqual(fassungPruefen({ frueher: ["ok", 5, "x".repeat(301)], bis: "2026-10-16" }).frueher, ["ok"]);
  assert.equal(fassungPruefen({ frueher: ["a"] }), null);
  assert.equal(fassungPruefen("x"), null);
  assert.equal(fassungPruefen([k]), null);
});

test("PDF zum Zusammenfassen: verschlüsselt in Stücken über /v1/pdf, Name = SHA-256, Kopfzeile für Opus, Grenzen, verwaiste verfallen", async () => {
  const { createHash, webcrypto } = require("node:crypto");
  const { erzeugeDienst, pdfTeilAblegen, pdfAufraeumen, unterlagenPruefen, unterlagenAblegen, PDF } = await laden("dienst.mjs");
  const { neuerSchluessel, entschluesselnRoh } = await laden("kanal.mjs");
  // wie im Plugin (server.js): Kopfzeile, Zeilenumbruch, Bytes; verschlüsselt wie verschluesselnRoh
  const stueck = (kennung, teil, teile, bytes) => Buffer.concat([Buffer.from(JSON.stringify({ schema: 1, kennung, teil, teile }) + "\n"), bytes]);
  const roh = async (schluessel, zweck, bytes) => {
    const iv = webcrypto.getRandomValues(new Uint8Array(12));
    const key = await webcrypto.subtle.importKey("raw", Buffer.from(schluessel, "base64url"), "AES-GCM", false, ["encrypt"]);
    const geheim = await webcrypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode("studium-autopilot/kanal/v1/" + zweck) }, key, bytes);
    return { schema: 1, zweck, iv: Buffer.from(iv).toString("base64url"), daten: Buffer.from(geheim).toString("base64url") };
  };
  const sha = (b) => createHash("sha256").update(b).digest("hex");
  // größer als ein Stück: zwei Anfragen
  const pdf = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(PDF.teil + 1000, 7)]);
  const kennung = sha(pdf);
  const k = neuerSchluessel();
  const probe = stueck(kennung, 0, 1, Buffer.from("%PDF-"));
  assert.deepEqual(await entschluesselnRoh(k, "pdf", await roh(k, "pdf", probe)), probe, "Bytes hin und zurück");
  await assert.rejects(entschluesselnRoh(k, "unterlagen", await roh(k, "pdf", probe)), /anderen Zweck/);

  const v = ordner();
  const opus = path.join(v, "unterlagen", "opus");
  const konfig = { zugang: "zugang-" + neuerSchluessel(), schluessel: k, adresse: "https://beispiel.example", version: "0.0.0-test" };
  const server = erzeugeDienst({ konfig, verzeichnis: v });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const basis = `http://127.0.0.1:${server.address().port}`;
  const mit = { authorization: `Bearer ${konfig.zugang}` };
  const senden = async (klar, kopf = mit) => fetch(`${basis}/v1/pdf`, { method: "POST", headers: kopf, body: JSON.stringify(await roh(k, "pdf", klar)) });
  try {
    const erstes = stueck(kennung, 0, 2, pdf.subarray(0, PDF.teil)), zweites = stueck(kennung, 1, 2, pdf.subarray(PDF.teil));
    assert.equal((await senden(erstes, {})).status, 401, "nur mit Schlüssel");
    assert.equal((await senden(zweites)).status, 409, "nicht außer der Reihe");
    const a = await senden(erstes);
    assert.deepEqual([a.status, await a.json()], [200, { kennung, fertig: false }]);
    assert.ok(!fs.existsSync(path.join(opus, kennung + ".pdf")), "halb hochgeladen heißt sie noch nicht .pdf");
    const b = await senden(zweites);
    assert.deepEqual([b.status, await b.json()], [200, { kennung, fertig: true }]);
    assert.ok(fs.readFileSync(path.join(opus, kennung + ".pdf")).equals(pdf));
    assert.equal((await senden(stueck("a".repeat(64), 0, 1, Buffer.from("kein PDF")))).status, 400, "nur PDFs");
  } finally {
    server.close();
  }
  // Grenzen: falsche Prüfsumme, falsche Stückgröße, zu viele Stücke, zu viele wartende
  const jetzt = new Date();
  const klein = Buffer.from("%PDF-1.7\nklein\n");
  assert.throws(() => pdfTeilAblegen(v, stueck("b".repeat(64), 0, 1, klein), jetzt), (e) => e.status === 400, "Prüfsumme");
  assert.ok(!fs.existsSync(path.join(opus, "b".repeat(64) + ".pdf.teil")), "verworfen");
  assert.throws(() => pdfTeilAblegen(v, stueck(sha(klein), 0, 2, klein), jetzt), (e) => e.status === 400, "nur das letzte Stück darf kleiner sein");
  assert.throws(() => pdfTeilAblegen(v, stueck(sha(klein), 0, Math.ceil(PDF.bytes / PDF.teil) + 1, klein), jetzt), (e) => e.status === 413);
  for (let i = 1; i < PDF.warten; i++) { const b = Buffer.from(`%PDF-1.7\n${i}\n`); pdfTeilAblegen(v, stueck(sha(b), 0, 1, b), jetzt); }
  assert.throws(() => pdfTeilAblegen(v, stueck(sha(klein), 0, 1, klein), jetzt), (e) => e.status === 429, `höchstens ${PDF.warten} warten`);
  assert.deepEqual(pdfTeilAblegen(v, stueck(kennung, 0, 2, pdf.subarray(0, PDF.teil)), jetzt), { kennung, fertig: false }, "dieselbe PDF noch einmal geht");
  pdfTeilAblegen(v, stueck(kennung, 1, 2, pdf.subarray(PDF.teil)), jetzt);

  // Die Textfassung danach: mit Opus nennt ihr Kopf die PDF, ohne PDF daneben nicht
  const u = (x) => Object.assign({ datei: "Unterlagen/B110/B110 Folien 01.pdf", kennung, art: "Folien", titel: "B110 Folien 01", code: "B110", seiten: 2,
    text: "[S. 1] Kosten", modell: "opus" }, x);
  unterlagenAblegen(v, unterlagenPruefen({ schema: 1, unterlagen: [u(), u({ kennung: "e".repeat(64) })] }));
  assert.match(fs.readFileSync(path.join(opus, kennung + ".md"), "utf8"), new RegExp(`\nPDF: ${kennung}\\.pdf \\(liegt daneben; lies die PDF statt dieses Textes\\)\n\n---\n`));
  assert.doesNotMatch(fs.readFileSync(path.join(opus, "e".repeat(64) + ".md"), "utf8"), /PDF:/);

  // eine verwaiste PDF (ohne Text) und halb Hochgeladenes verfallen nach einem Tag, eine PDF mit Text bleibt
  const halb = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(PDF.teil - 9)]);
  fs.rmSync(path.join(opus, sha(Buffer.from("%PDF-1.7\n1\n")) + ".pdf"));
  pdfTeilAblegen(v, stueck("c".repeat(64), 0, 2, halb), jetzt);
  pdfAufraeumen(opus, new Date(jetzt.getTime() + PDF.verfall + 60e3));
  assert.deepEqual(fs.readdirSync(opus).filter((n) => n.includes(".pdf")), [kennung + ".pdf"], "nur die mit Textfassung bleibt");
});

test("Auszug aus dem Tresor: Termine und To-dos einzeln geprüft und gesäubert, nichts mit Zugangsdaten, Grenzen", async () => {
  const { tresorPruefen } = await laden("dienst.mjs");
  const t = tresorPruefen({
    termine: [
      { titel: "B110 Anmeldung Tutorium", datum: "2026-10-27", kategorie: "Frist", code: "B110", herkunft: "zentral", erledigt: true, zentral_id: "x" },
      { titel: "Eigener <b>Termin</b> [[Link]]", datum: "2026-11-02", bis: "2026-11-03", kategorie: "Party", code: "b110", herkunft: "Böse!" },
      { titel: "Ohne Datum" }, { titel: "", datum: "2026-11-02" }, { titel: "Kaputtes Datum", datum: "2026-02-30" }, "kein Objekt",
    ],
    todos: [
      { text: "Blatt 3 abgeben (bis 02.11.)", code: "E101", frist: "2026-11-02", pfad: "Unterlagen/x.md", id: "t-1k3x9q", aenderbar: true, nr: 7, roh: "- [ ] Blatt 3" },
      { text: "ILIAS-Passwort ändern" }, { text: "Kurs-PW: geheim123" }, { text: "x".repeat(201) }, { text: "" },
      { text: "Folien lesen", pfad: "../geheim.md", id: "x-1", aenderbar: "ja" }, { text: "Lesen", pfad: "Unterlagen/a.pdf", id: "t-" + "a".repeat(14) },
    ],
  });
  assert.deepEqual(t.termine, [
    { titel: "B110 Anmeldung Tutorium", datum: "2026-10-27", bis: "", kategorie: "Frist", code: "B110", herkunft: "zentral", erledigt: true },
    { titel: "Eigener Termin Link", datum: "2026-11-02", bis: "2026-11-03", kategorie: "", code: "", herkunft: "", erledigt: false },
  ]);
  assert.deepEqual(t.todos, [{ text: "Blatt 3 abgeben (bis 02.11.)", code: "E101", frist: "2026-11-02", id: "t-1k3x9q", pfad: "Unterlagen/x.md", aenderbar: true },
    { text: "Folien lesen", code: "", frist: "" }, { text: "Lesen", code: "", frist: "" }], "nur geprüfte Felder, nichts mit Zugangsdaten, nie ein Ausbruch aus dem Tresor");
  const viele = tresorPruefen({ termine: Array.from({ length: 450 }, (_, i) => ({ titel: "T" + i, datum: "2026-11-01" })),
    todos: Array.from({ length: 250 }, (_, i) => ({ text: "A" + i })) });
  assert.deepEqual([viele.termine.length, viele.todos.length], [400, 200]);
  assert.deepEqual(tresorPruefen(undefined), { termine: [], todos: [] });
});

test("Dienst: Status offen, Eingang nur mit Schlüssel und verschlüsselt, Stand räumt auf, Einmal-Code liefert Schlüssel, Sperre je Absender", async () => {
  const { erzeugeDienst } = await laden("dienst.mjs");
  const { neuerSchluessel, verschluesseln, entschluesseln } = await laden("kanal.mjs");
  const { neuerCode } = await laden("verbinden.mjs");
  const v = ordner();
  const konfig = { zugang: "zugang-" + neuerSchluessel(), schluessel: neuerSchluessel(), adresse: "https://beispiel.example", version: "0.0.0-test" };
  fs.mkdirSync(path.join(v, "eingang"));
  fs.writeFileSync(path.join(v, "eingang", "2026-10-18-073000-termine.json"), JSON.stringify({ schema: 1, termine: [{ titel: "Tutorium" }] }));
  fs.writeFileSync(path.join(v, "eingang", "kaputt.json"), "{");
  fs.writeFileSync(path.join(v, "zustand.json"), JSON.stringify({ claude: "angemeldet" }));
  const server = erzeugeDienst({ konfig, verzeichnis: v });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const basis = `http://127.0.0.1:${server.address().port}`;
  const mit = { authorization: `Bearer ${konfig.zugang}` };
  try {
    const status = await (await fetch(`${basis}/v1/status`)).json();
    assert.equal(status.claude, "angemeldet");
    assert.doesNotMatch(JSON.stringify(status), new RegExp(konfig.schluessel));

    assert.equal((await fetch(`${basis}/v1/eingang`)).status, 401);
    const antwort = await fetch(`${basis}/v1/eingang`, { headers: mit });
    assert.equal(antwort.status, 200);
    const paket = await antwort.json();
    assert.doesNotMatch(JSON.stringify(paket), /Tutorium/, "nur verschlüsselt");
    const buendel = await entschluesseln(konfig.schluessel, "eingang", paket);
    assert.deepEqual(buendel.dateien.map((d) => d.name), ["2026-10-18-073000-termine.json"], "kaputte Datei bleibt draußen");
    assert.ok(JSON.parse(fs.readFileSync(path.join(v, "web", "abruf.json"), "utf8")).zuletzt);

    const stand = await verschluesseln(konfig.schluessel, "stand", { schema: 1, module: ["B110"], erledigt: ["2026-10-18-073000-termine.json"],
      takt: { uni_postfach: 60, gmail: 1 } });
    assert.equal((await fetch(`${basis}/v1/stand`, { method: "POST", headers: mit, body: JSON.stringify(stand) })).status, 204);
    assert.ok(!fs.existsSync(path.join(v, "eingang", "2026-10-18-073000-termine.json")), "übernommene Datei gelöscht");
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(v, "web", "stand-plugin.json"), "utf8")).module, ["B110"]);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(v, "web", "takt.json"), "utf8")), { uni_postfach: 60, gmail: 1 }, "Takt auch für abrufen.py");
    // Der Auszug aus dem Tresor ist nur für den Lauf (Gruppe), der Takt auch für den Abruf (anderer Benutzer)
    if (process.platform !== "win32") {
      assert.deepEqual(["stand-plugin.json", "takt.json"].map((n) => fs.statSync(path.join(v, "web", n)).mode & 0o777), [0o640, 0o644]);
    }
    assert.deepEqual(fs.readdirSync(v).filter((n) => !["eingang", "unterlagen", "web", "zustand.json"].includes(n)), [],
      "der Dienst schreibt nur in web/, eingang/ und unterlagen/, nie in den Datenordner selbst");
    // Textfassungen über HTTP, verschlüsselt: landen in unterlagen/neu/
    const kennung = "f".repeat(64);
    const unterlagenPaket = await verschluesseln(konfig.schluessel, "unterlagen", { schema: 1, unterlagen: [{ datei: "Unterlagen/B110/B110 Folien 01.pdf",
      kennung, art: "Folien", titel: "B110 Folien 01", code: "B110", seiten: 2, text: "[S. 1] Kosten" }] });
    const hoch = await fetch(`${basis}/v1/unterlagen`, { method: "POST", headers: mit, body: JSON.stringify(unterlagenPaket) });
    assert.deepEqual([hoch.status, await hoch.json()], [200, { angenommen: 1 }]);
    assert.ok(fs.existsSync(path.join(v, "unterlagen", "neu", kennung + ".md")));
    assert.equal((await fetch(`${basis}/v1/unterlagen`, { method: "POST", body: JSON.stringify(unterlagenPaket) })).status, 401, "nur mit Schlüssel");
    // Knopf „Mails durchsuchen“ über HTTP: Anstoß, Status „wartet“, zweiter Tipp gleich danach zu früh
    const knopf = await fetch(`${basis}/v1/anstoss`, { method: "POST", headers: mit });
    assert.equal(knopf.status, 200);
    assert.equal((await (await fetch(`${basis}/v1/status`)).json()).claude_lauf, "wartet");
    assert.equal((await fetch(`${basis}/v1/anstoss`, { method: "POST", headers: mit })).status, 429);
    fs.rmSync(path.join(v, "web", "anstoss"));
    const fremd = await verschluesseln(neuerSchluessel(), "stand", { schema: 1 });
    assert.equal((await fetch(`${basis}/v1/stand`, { method: "POST", headers: mit, body: JSON.stringify(fremd) })).status, 400);

    const { code } = neuerCode(path.join(v, "web")); // wie studium-server verbinden als Benutzer des Dienstes
    const verbunden = await fetch(`${basis}/v1/verbinden`, { method: "POST", body: JSON.stringify({ code }) });
    assert.deepEqual(await verbunden.json(), { adresse: konfig.adresse, zugang: konfig.zugang, schluessel: konfig.schluessel });
    assert.equal((await fetch(`${basis}/v1/verbinden`, { method: "POST", body: JSON.stringify({ code }) })).status, 403, "Code verbraucht");
    assert.equal((await fetch(`${basis}/v1/eingang`, { method: "POST", headers: mit })).status, 405);
    assert.equal((await fetch(`${basis}/v1/unbekannt`)).status, 404);
    assert.equal((await fetch(`${basis}/v1/stand`, { method: "POST", headers: mit, body: "x".repeat(600 * 1024) })).status, 413);
    assert.equal((await fetch(`${basis}/v1/verbinden`, { method: "POST", body: "x".repeat(5 * 1024) })).status, 413);
    // voller Auszug aus dem Tresor (400 Termine, 200 To-dos) passt in eine Anfrage
    const voll = { schema: 1, module: ["B110"], tresor: {
      termine: Array.from({ length: 400 }, (_, i) => ({ titel: "Ein ziemlich langer Titel eines Termins Nummer " + i, datum: "2026-11-01", bis: "", kategorie: "Frist", code: "B110", herkunft: "zentral", erledigt: false })),
      todos: Array.from({ length: 200 }, (_, i) => ({ text: "Eine Aufgabe mit etwas Text, damit sie realistisch lang ist, Nummer " + i, code: "E101", frist: "2026-11-02" })) } };
    const vollPaket = await verschluesseln(konfig.schluessel, "stand", voll);
    assert.equal((await fetch(`${basis}/v1/stand`, { method: "POST", headers: mit, body: JSON.stringify(vollPaket) })).status, 204);
    assert.equal(JSON.parse(fs.readFileSync(path.join(v, "web", "stand-plugin.json"), "utf8")).tresor.termine.length, 400);

    // Sperre je Absender (X-Forwarded-For von Caddy); ein gültiger Schlüssel wird nie gesperrt
    const von = (wer, extra) => Object.assign({ "x-forwarded-for": "irgendwer, " + wer }, extra);
    for (let i = 0; i < 10; i++) await fetch(`${basis}/v1/eingang`, { headers: von("angreifer", { authorization: "Bearer falsch" }) });
    assert.equal((await fetch(`${basis}/v1/eingang`, { headers: von("angreifer", { authorization: "Bearer falsch" }) })).status, 429, "nach 10 Fehlversuchen gesperrt");
    assert.equal((await fetch(`${basis}/v1/verbinden`, { method: "POST", headers: von("angreifer"), body: JSON.stringify({ code: "AAAAA-AAAAA" }) })).status, 429);
    assert.equal((await fetch(`${basis}/v1/eingang`, { headers: von("angreifer", mit) })).status, 200, "gültiger Schlüssel nie gesperrt");
    assert.equal((await fetch(`${basis}/v1/eingang`, { headers: von("nutzer", { authorization: "Bearer falsch" }) })).status, 401, "andere Absender nicht gesperrt");
    assert.equal((await fetch(`${basis}/v1/status`)).status, 200, "Status bleibt erreichbar");
  } finally {
    await new Promise((r) => server.close(r));
    fs.rmSync(v, { recursive: true, force: true });
  }
});

test("LiveSync: Setup-Link nur mit dem Code lesbar, Einstellungen wie im Tresor bewährt, Zugangsdaten geprüft", async () => {
  const L = await laden("livesync.mjs");
  // Begriffe zerlegt, damit diese Datei (tests/ wird veröffentlicht) sich in pruefen.py nicht selbst meldet
  const HOST = "obsidian.beispiel.example", PW = "Pw2" + "abc", URI = "couch" + "DB_URI";
  const k = { adresse: "https://" + HOST, benutzer: "admin", passwort: PW, datenbank: "studium-autopilot", e2ee: "Geheim7" };
  const code = L.neuerCode();
  assert.match(code, /^[a-km-np-z2-9]{4}-[a-km-np-z2-9]{4}-[a-km-np-z2-9]{4}$/);
  const r = await L.link(k, code);
  assert.equal(r.code, code);
  assert.ok(r.link.startsWith(L.LINK_ANFANG));
  const paket = decodeURIComponent(r.link.slice(L.LINK_ANFANG.length));
  assert.doesNotMatch(paket, new RegExp([PW, "Geheim7", "beispiel"].join("|")), "nur verschlüsselt");
  const e = JSON.parse(await L.entschluesseln(paket, code));
  assert.equal(e[URI], "https://" + HOST);
  assert.equal(e.remoteConfigurations[e.activeConfigurationId].uri, `sls+https://${["admin", PW].join(":")}@${HOST}/?db=studium-autopilot`);
  assert.equal(e["pass" + "phrase"], "Geheim7");
  assert.ok(e.encrypt && e.usePathObfuscation && e.liveSync && e.syncInternalFiles && e.isConfigured);
  assert.equal(e.useAdvancedMode, true, "sonst fehlt der Abschnitt „Hidden Files“ zum Wiedereinschalten");
  assert.equal(e.keepReplicationActiveInBackground, true, "am Computer auch mit verborgenem Fenster abgleichen");
  assert.match(e.syncInternalFilesIgnorePatterns, /obsidian-livesync/, "jedes Gerät behält seine eigene Verbindung");
  await assert.rejects(L.entschluesseln(paket, L.neuerCode()), "falscher Code");
  assert.equal(L.einstellungen({ ...k, adresse: "http://127.0.0.1:8081" })[URI], "http://127.0.0.1:8081", "Testmodus");
  assert.throws(() => L.einstellungen({ ...k, e2ee: "" }), /e2ee fehlt/);
  assert.throws(() => L.einstellungen({ ...k, passwort: PW + ":x" }), /Buchstaben und Ziffern/);
});

test("LiveSync: kurzer Link gilt 30 Minuten, liegt nur als Hash, Seite maskiert und läuft ab", async () => {
  const L = await laden("livesync.mjs");
  const v = ordner();
  const jetzt = new Date("2026-10-21T10:00:00Z");
  const setup = L.LINK_ANFANG + "%25%24abc%22%3C";
  assert.throws(() => L.ablegen(v, "https://boese.example"), /kein Setup-Link/);
  const { kennung, ablauf } = L.ablegen(v, setup, { jetzt });
  assert.match(kennung, L.KENNUNG);
  assert.equal(ablauf, "2026-10-21T10:30:00.000Z");
  assert.ok(!fs.readdirSync(path.join(v, "livesync-links")).some((n) => n.includes(kennung)), "nur der Hash liegt ab");
  assert.equal(L.abholen(v, kennung, jetzt), setup);
  assert.equal(L.abholen(v, kennung, jetzt), setup, "mehrfach abrufbar");
  assert.equal(L.abholen(v, kennung, new Date("2026-10-21T10:31:00Z")), null, "abgelaufen");
  assert.equal(L.abholen(v, "../../etc/passwd", jetzt), null);
  L.ablegen(v, setup, { jetzt: new Date("2026-10-21T11:00:00Z") });
  assert.equal(fs.readdirSync(path.join(v, "livesync-links")).length, 1, "Abgelaufenes wird beim Ablegen gelöscht");
  assert.match(L.seite('obsidian://x?a="><script>'), /href="obsidian:\/\/x\?a=&quot;&gt;&lt;script&gt;"/);
  assert.match(L.seite(null), /abgelaufen/);
  fs.rmSync(v, { recursive: true, force: true });
});

test("Dienst: LiveSync-Seite unter /v1/livesync/<kennung>, unbekannte Kennungen zählen als Fehlversuch, Status livesync", async () => {
  const { erzeugeDienst } = await laden("dienst.mjs");
  const { ablegen, LINK_ANFANG } = await laden("livesync.mjs");
  const v = ordner();
  const server = erzeugeDienst({ konfig: { zugang: "zugang-x", schluessel: "s".repeat(44), adresse: "https://beispiel.example", version: "0.0.0-test" }, verzeichnis: v });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const basis = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal((await (await fetch(`${basis}/v1/status`)).json()).livesync, "aus");
    fs.writeFileSync(path.join(v, "zustand.json"), JSON.stringify({ livesync: "an" }));
    assert.equal((await (await fetch(`${basis}/v1/status`)).json()).livesync, "an");
    const { kennung } = ablegen(path.join(v, "web"), LINK_ANFANG + "%25%24abc"); // wie livesync.sh als Benutzer des Dienstes
    const s = await fetch(`${basis}/v1/livesync/${kennung}`);
    assert.equal(s.status, 200);
    assert.match(s.headers.get("content-security-policy"), /default-src 'none'/);
    assert.equal(s.headers.get("cache-control"), "no-store");
    assert.match(await s.text(), /In Obsidian öffnen/);
    assert.equal((await fetch(`${basis}/v1/livesync/${kennung}`, { method: "POST" })).status, 405);
    const von = { "x-forwarded-for": "rater" };
    for (let i = 0; i < 10; i++) assert.equal((await fetch(`${basis}/v1/livesync/aaaaaaaaaaaaaaaaaaaa`, { headers: von })).status, 404);
    assert.equal((await fetch(`${basis}/v1/livesync/${kennung}`, { headers: von })).status, 429, "Raten wird gesperrt");
    assert.equal((await fetch(`${basis}/v1/livesync/${kennung}`)).status, 200, "andere Absender nicht");
  } finally {
    await new Promise((r) => server.close(r));
    fs.rmSync(v, { recursive: true, force: true });
  }
});

test("Eingang: Nicht Abgeholtes mit künftigen Terminen bleibt über 30 Tage, Vergangenes und sehr Altes fällt weg", async () => {
  const { eingangBuendel } = await laden("dienst.mjs");
  const v = ordner();
  fs.mkdirSync(path.join(v, "eingang"));
  const jetzt = new Date("2026-12-20T10:00:00Z");
  const datei = (name, termine, tage) => {
    const p = path.join(v, "eingang", name);
    fs.writeFileSync(p, JSON.stringify({ schema: 1, termine, hinweise: [] }));
    const t = new Date(jetzt.getTime() - tage * 864e5);
    fs.utimesSync(p, t, t);
  };
  datei("a-kuenftig.json", [{ datum: "2027-01-15" }], 40);
  datei("b-vorbei.json", [{ datum: "2026-11-03" }], 40);
  datei("c-laeuft-noch.json", [{ datum: "2026-11-01", bis: "2026-12-31" }], 40);
  datei("d-neu-vorbei.json", [{ datum: "2026-12-01" }], 5);
  datei("e-uralt.json", [{ datum: "2027-03-01" }], 200);
  fs.writeFileSync(path.join(v, "eingang", "f-kaputt.json"), "{");
  fs.utimesSync(path.join(v, "eingang", "f-kaputt.json"), new Date(jetzt.getTime() - 40 * 864e5), new Date(jetzt.getTime() - 40 * 864e5));
  try {
    assert.deepEqual(eingangBuendel(v, jetzt).dateien.map((d) => d.name), ["a-kuenftig.json", "c-laeuft-noch.json", "d-neu-vorbei.json"]);
    assert.deepEqual(fs.readdirSync(path.join(v, "eingang")).sort(), ["a-kuenftig.json", "c-laeuft-noch.json", "d-neu-vorbei.json"]);
  } finally {
    fs.rmSync(v, { recursive: true, force: true });
  }
});

test("Zustand: Proben setzen Claude, Uni-Zugang und Reserve; Felder anderer Teile bleiben", async () => {
  const { zustandAktualisieren } = await laden("zustand.mjs");
  const v = ordner();
  fs.writeFileSync(path.join(v, "zustand.json"), JSON.stringify({ gmail: "ok", fehler: ["claude-abgemeldet", "gmail-fehlt"] }));
  const proben = (claude, gespeichert) => ({ claude: async () => claude, speicherReserve: async () => "an", uniZugangGespeichert: async () => gespeichert });
  let z = await zustandAktualisieren(v, proben("angemeldet", true));
  assert.equal(z.gmail, "ok");
  assert.equal(z.uniZugang, "gespeichert");
  assert.deepEqual(z.fehler, ["gmail-fehlt"]);
  fs.mkdirSync(path.join(v, "abruf"));
  fs.writeFileSync(path.join(v, "abruf", "uni-zugang-falsch"), "");
  z = await zustandAktualisieren(v, proben("abgemeldet", true));
  assert.equal(z.uniZugang, "falsch");
  assert.deepEqual(z.fehler.sort(), ["claude-abgemeldet", "gmail-fehlt", "uni-zugang-falsch"]);
  z = await zustandAktualisieren(v, proben("angemeldet", false));
  assert.equal(z.uniZugang, "fehlt");
  assert.equal(z.livesync, "aus");
  fs.writeFileSync(path.join(v, "livesync-an"), "");
  assert.equal((await zustandAktualisieren(v, proben("angemeldet", false))).livesync, "an", "Marke von livesync.sh");
  // schreibt der Claude-Lauf, während die Proben laufen, bleibt sein Stand erhalten
  const langsam = Object.assign(proben("angemeldet", false), { claude: async () => {
    fs.writeFileSync(path.join(v, "zustand.json"), JSON.stringify({ gmailZuletzt: "2026-10-18T05:30:00.000Z", fehler: [] }));
    return "angemeldet";
  } });
  z = await zustandAktualisieren(v, langsam);
  assert.equal(z.gmailZuletzt, "2026-10-18T05:30:00.000Z", "Feld des Laufs nicht überschrieben");
  const { reserveLaeuft } = await laden("zustand.mjs");
  assert.equal(reserveLaeuft(v), "aus", "ohne Meldung");
  fs.writeFileSync(path.join(v, "speicher-reserve.json"), JSON.stringify({ pid: process.pid }));
  // /proc nachgestellt: die PID dieses Tests einmal als Reserve, einmal als fremder Prozess (nach einem Neustart)
  const proc = path.join(v, "proc");
  fs.mkdirSync(path.join(proc, String(process.pid)), { recursive: true });
  const cmdline = (befehl) => fs.writeFileSync(path.join(proc, String(process.pid), "cmdline"), befehl.split(" ").join("\0") + "\0");
  cmdline("/usr/bin/node /opt/studium-server/aktuell/speicher-reserve.mjs");
  assert.equal(reserveLaeuft(v, proc), "an", "lebende PID der Reserve");
  cmdline("/usr/sbin/cron -f");
  assert.equal(reserveLaeuft(v, proc), "aus", "PID gehört einem anderen Prozess");
  fs.writeFileSync(path.join(v, "speicher-reserve.json"), JSON.stringify({ pid: 2 ** 22 + 12345 }));
  assert.equal(reserveLaeuft(v, proc), "aus", "PID lebt nicht");
  // die echte Probe: claude auth status ohne Nutzungs- und Fehlerberichte, auch ohne die Umgebung der Einheit (studium-server
  // startet zustand.mjs direkt); die Attrappe schreibt auf, was sie bekam
  const { proben: echt, OHNE_BERICHTE } = await laden("zustand.mjs");
  const attrappe = path.join(v, "claude.cjs"), sah = path.join(v, "sah.json");
  fs.writeFileSync(attrappe, `require("node:fs").writeFileSync(${JSON.stringify(sah)}, JSON.stringify({ args: process.argv.slice(2),
    berichte: [process.env.DISABLE_TELEMETRY, process.env.DISABLE_ERROR_REPORTING] })); process.exit(Number(process.env.ABGEMELDET || 0));`);
  assert.equal(await echt.claude([process.execPath, attrappe]), "angemeldet");
  assert.deepEqual(JSON.parse(fs.readFileSync(sah, "utf8")), { args: ["auth", "status"], berichte: ["1", "1"] });
  assert.deepEqual(OHNE_BERICHTE, { DISABLE_TELEMETRY: "1", DISABLE_ERROR_REPORTING: "1" });
  process.env.ABGEMELDET = "1";
  try { assert.equal(await echt.claude([process.execPath, attrappe]), "abgemeldet"); } finally { delete process.env.ABGEMELDET; }
  fs.rmSync(v, { recursive: true, force: true });
});

test("Speicherreserve: 25 % des Arbeitsspeichers, feste Größe oder Anteil einstellbar, wirklich belegt", async () => {
  const { reserveBytes, belegen } = await laden("speicher-reserve.mjs");
  const meminfo = "MemTotal:       12288000 kB\nMemFree: 100 kB\n";
  assert.equal(reserveBytes(meminfo), Math.floor(12288000 * 1024 * 0.25));
  assert.equal(reserveBytes(meminfo, { STUDIUM_RESERVE_MB: "64" }), 64 * 2 ** 20);
  assert.equal(reserveBytes(meminfo, { STUDIUM_RESERVE_ANTEIL: "0.9" }), Math.floor(12288000 * 1024 * 0.5), "höchstens die Hälfte");
  const teile = belegen(3 * 2 ** 20);
  assert.equal(teile.reduce((s, t) => s + t.length, 0), 3 * 2 ** 20);
  assert.equal(teile[0][4096], 0xa5);
});

test("Shell-Skripte: Syntax gültig (bash -n)", { skip: spawnSync("bash", ["-c", "true"]).status !== 0 && "kein bash" }, () => {
  for (const datei of ["installieren.sh", "studium-server", "fern.sh", "livesync.sh"]) {
    const r = spawnSync("bash", ["-n", path.join(SERVER, datei)], { encoding: "utf8" });
    assert.equal(r.status, 0, `${datei}: ${r.stderr}`);
  }
});

test("Versionen: nur vorwärts, eine Vorabversion zählt weniger als die fertige; gleiche Fassung in studium-server und installieren.sh", { skip: spawnSync("bash", ["-c", "true"]).status !== 0 && "kein bash" }, () => {
  const fassung = (datei) => /^version_neuer\(\) \{\n[\s\S]*?\n\}\n/m.exec(fs.readFileSync(path.join(SERVER, datei), "utf8"))[0];
  const funktion = fassung("studium-server");
  assert.equal(fassung("installieren.sh"), funktion);
  const neuer = (a, b) => spawnSync("bash", ["-c", funktion + 'version_neuer "$1" "$2"', "-", a, b]).status === 0;
  for (const [a, b] of [["0.5.10", "0.5.9"], ["0.5.9", "0.5.9-beta.1"], ["0.5.9-beta.10", "0.5.9-beta.2"], ["0.6.0-beta.1", "0.5.9"], ["1.0.0", "0.9.9"]]) {
    assert.ok(neuer(a, b), `${a} neuer als ${b}`);
    assert.ok(!neuer(b, a), `${b} nicht neuer als ${a}`);
  }
  assert.ok(!neuer("0.5.9", "0.5.9"), "gleich ist nicht neuer");
});

test("Installer: Dienste, die er nicht mehr schreibt (entfernt, umbenannt), schaltet er ab und löscht sie; Einheiten nur über einheit", { skip: spawnSync("bash", ["-c", "true"]).status !== 0 && "kein bash" }, () => {
  const skript = fs.readFileSync(path.join(SERVER, "installieren.sh"), "utf8");
  // Aufbau: jede Einheit über einheit, keine daran vorbei; benutzt wird nur, was er schreibt; aufgeräumt nach der letzten, vor
  // daemon-reload. Kein anderer Teil des Pakets legt Einheiten studium-server* an (der nächste Lauf entfernte sie).
  const geschrieben = [...skript.matchAll(/^einheit (studium-server-[\w@.-]+) <<'UNIT'$/gm)].map((m) => m[1]);
  assert.ok(geschrieben.length >= 12 && new Set(geschrieben).size === geschrieben.length, geschrieben.join(" "));
  // daneben nur der Drop-in für Caddy (Ordner des Admin-Sockets, Schritt „Caddy (HTTPS)“), keine Einheit studium-server*
  assert.doesNotMatch(skript.replace(/^einheit\(\) .*$/m, "").replace(/\/etc\/systemd\/system\/caddy\.service\.d\b/g, ""),
    /\/etc\/systemd\/system\/|\$EINHEITEN\//, "nur einheit schreibt Einheiten");
  for (const n of new Set(skript.match(/studium-server-[a-z-]+@?\.(?:service|timer|path|socket)/g))) assert.ok(geschrieben.includes(n), `${n}: benutzt, aber nicht geschrieben`);
  const letzte = skript.lastIndexOf("\neinheit "), aufraeumen = skript.indexOf('\nalte_einheiten_entfernen "$EINHEITEN"\n');
  assert.ok(letzte > 0 && letzte < aufraeumen && aufraeumen < skript.indexOf("\nsystemctl daemon-reload\n", aufraeumen) && skript.indexOf("\nsystemctl enable") > aufraeumen);
  for (const n of fs.readdirSync(SERVER).filter((n) => n !== "installieren.sh" && !n.endsWith(".md") && fs.statSync(path.join(SERVER, n)).isFile())) {
    assert.doesNotMatch(fs.readFileSync(path.join(SERVER, n), "utf8"), /systemd\/system\/studium-server/, n);
  }
  // Ablauf gegen einen Ordner; systemctl schreibt nur auf, was es tun soll
  const funktion = /^alte_einheiten_entfernen\(\) \{\n[\s\S]*?\n\}\n/m.exec(skript)[0];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "einheiten-"));
  try {
    const bin = path.join(tmp, "bin"), ordner = path.join(tmp, "system"), aufrufe = path.join(tmp, "aufrufe");
    fs.mkdirSync(bin);
    fs.writeFileSync(path.join(bin, "systemctl"), "#!/usr/bin/env bash\necho \"$*\" >> \"$AUFRUFE\"\n", { mode: 0o755 });
    const lauf = () => {
      fs.rmSync(aufrufe, { force: true });
      const r = spawnSync("bash", ["-c", `set -euo pipefail\n${funktion}GESCHRIEBEN=(studium-server-dienst.service studium-server-gmail.timer)\nalte_einheiten_entfernen "$1"`,
        "-", ordner.replace(/\\/g, "/")], { encoding: "utf8", env: Object.assign({}, process.env, { AUFRUFE: aufrufe, PATH: bin + path.delimiter + process.env.PATH }) });
      assert.equal(r.status, 0, r.stderr);
      return { aus: r.stdout.trim().split("\n").filter(Boolean).sort(), aufrufe: fs.existsSync(aufrufe) ? fs.readFileSync(aufrufe, "utf8").trim().split("\n").sort() : [] };
    };
    // erste Installation: noch nichts da
    fs.mkdirSync(ordner);
    assert.deepEqual(lauf(), { aus: [], aufrufe: [] });
    for (const d of ["studium-server-dienst.service.d", "studium-server-alt.service.d", "timers.target.wants"]) fs.mkdirSync(path.join(ordner, d));
    for (const n of ["studium-server-dienst.service", "studium-server-dienst.service.d/eigen.conf", "studium-server-gmail.timer", "studium-server-alt.service",
      "studium-server-alt.service.d/eigen.conf", "studium-server-weg.timer", "studium-server-teil@.service", "caddy.service"]) fs.writeFileSync(path.join(ordner, n), "[Unit]\n");
    assert.deepEqual(lauf(), {
      aus: ["entfernt: studium-server-alt.service", "entfernt: studium-server-teil@.service", "entfernt: studium-server-weg.timer"],
      aufrufe: ["disable --now studium-server-alt.service", "disable --now studium-server-weg.timer", "disable studium-server-teil@.service", "stop studium-server-teil@*.service"],
    });
    assert.deepEqual(fs.readdirSync(ordner).sort(), ["caddy.service", "studium-server-dienst.service", "studium-server-dienst.service.d", "studium-server-gmail.timer", "timers.target.wants"]);
    assert.ok(fs.existsSync(path.join(ordner, "studium-server-dienst.service.d", "eigen.conf")), "Drop-in einer Einheit von heute bleibt");
    assert.deepEqual(lauf(), { aus: [], aufrufe: [] }, "zweiter Lauf: nichts zu tun");
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test("Installer: eigene Ordner für Web-Dienst und Abruf; ein Datenordner bis 0.7.6 zieht einmal um, ohne Daten zu verlieren, ein zweiter Lauf ändert nichts", { skip: spawnSync("bash", ["-c", "true"]).status !== 0 && "kein bash" }, () => {
  const skript = fs.readFileSync(path.join(SERVER, "installieren.sh"), "utf8");
  const anfang = skript.indexOf("\n# Ordnung des Datenordners"), ende = skript.indexOf('\n[ "$(id -u)" -eq 0 ]');
  assert.ok(anfang > 0 && ende > anfang, "ordnung vor dem eigentlichen Ablauf");
  assert.ok(skript.indexOf("\nordnung /var/lib/studium-server\n") > skript.indexOf("--gid studium-web studium-web\n"), "bei jeder Installation, nach den Benutzern");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ordnung-"));
  const p = (...t) => path.join(tmp, ...t);
  const vorwaerts = (x) => x.replace(/\\/g, "/");
  const D = vorwaerts(p("daten"));
  // alle Dateien (relativ) mit Inhalt, ohne Links zu folgen
  const inhalt = (o, vor = "") => Object.fromEntries(fs.readdirSync(o, { withFileTypes: true }).flatMap((e) => e.isDirectory()
    ? Object.entries(inhalt(path.join(o, e.name), vor + e.name + "/")) : [[vor + e.name, e.isFile() ? fs.readFileSync(path.join(o, e.name), "utf8") : "(Link)"]]));
  try {
    fs.mkdirSync(p("bin"));
    // systemctl, chown und chmod schreiben nur auf, was sie tun sollen (find ruft sie als Programme auf); node in ordner (fchmod) auch
    for (const b of ["systemctl", "chown", "chmod"]) fs.writeFileSync(p("bin", b), `#!/usr/bin/env bash\necho "${b} $*" >> "$AUFRUFE"\n`, { mode: 0o755 });
    // sudo -u <benutzer> befehl …: aufschreiben, dann als dieser Benutzer hier (ohne Wechsel) ausführen
    fs.writeFileSync(p("bin", "sudo"), '#!/usr/bin/env bash\necho "sudo $1 $2" >> "$AUFRUFE"\nshift 2\nexec "$@"\n', { mode: 0o755 });
    const ablauf = ["set -euo pipefail", 'fehler() { echo "Fehler: $*" >&2; exit 1; }', skript.slice(anfang, ende),
      'node() { echo "fchmod $4 $3" >> "$AUFRUFE"; }', 'ordnung "$1"'].join("\n");
    const lauf = () => {
      fs.rmSync(p("aufrufe"), { force: true });
      const r = spawnSync("bash", ["-c", ablauf, "-", D], { encoding: "utf8",
        env: Object.assign({}, process.env, { AUFRUFE: p("aufrufe"), PATH: p("bin") + path.delimiter + process.env.PATH }) });
      assert.equal(r.status, 0, r.stderr);
      return fs.existsSync(p("aufrufe")) ? fs.readFileSync(p("aufrufe"), "utf8").split(D).join("D").trim().split("\n") : [];
    };
    // Datenordner einer Installation bis 0.7.6: alles direkt darin
    const alt = {
      "takt.json": '{"uni_postfach":60}', "knopf.json": '{"zuletzt":"x"}', "abruf.json": "{}", "stand-plugin.json": '{"module":["B110"]}',
      "geraete.json": "[]", ["verbinden/" + "a".repeat(64) + ".json"]: "{}", "livesync-links/k1": "link",
      "roh/INDEX.md": "# Neu\n- 1 neue Mail\n", "roh/uni-postfach/1.txt": "Betreff: alt", "abruf-stand.json": '{"uid":1}', "uni-zugang-falsch": "",
      "zustand.json": "{}", "anstoss": '{"grund":"gmail"}', "termine.json": "{}", "laeufe/20261001T050000Z/protokoll.json": "{}",
      "eingang/1.json": "{}", "unterlagen/neu/u.md": "Folie",
    };
    for (const [n, t] of Object.entries(alt)) { fs.mkdirSync(path.dirname(path.join(D, n)), { recursive: true }); fs.writeFileSync(path.join(D, n), t); }
    // ein abgebrochener Umzug hat schon einiges umgezogen: Neueres bleibt, Ordner werden zusammengeführt
    fs.mkdirSync(path.join(D, "web"));
    fs.writeFileSync(path.join(D, "web", "takt.json"), '{"uni_postfach":30}');
    const vorStunde = new Date(Date.now() - 3600e3);
    fs.utimesSync(path.join(D, "takt.json"), vorStunde, vorStunde);
    fs.mkdirSync(path.join(D, "abruf", "roh", "uni-postfach"), { recursive: true });
    fs.writeFileSync(path.join(D, "abruf", "roh", "uni-postfach", "2.txt"), "Betreff: neu");
    // ein Link an der Stelle eines Ordners fällt weg, ohne dass dem Ziel etwas geschieht (Windows: Junction)
    fs.mkdirSync(p("geheim"));
    fs.writeFileSync(p("geheim", "anmeldung.json"), "geheim");
    fs.rmSync(path.join(D, "livesync-links"), { recursive: true });
    let link = false;
    try { fs.symlinkSync(p("geheim"), path.join(D, "livesync-links"), "junction"); link = true; } catch { /* ohne Links */ }

    const erste = lauf();
    const stopp = erste.filter((z) => z.startsWith("systemctl ")).map((z) => z.replace("systemctl stop ", ""));
    for (const n of ["studium-server-dienst.service", "studium-server-abruf.timer", "studium-server-abruf.service", "studium-server-lauf.path",
      "studium-server-lauf.service", "studium-server-gmail.timer", "studium-server-zustand.timer", "studium-server-speicher.service"]) {
      assert.ok(stopp.includes(n), n + " hält vor dem Umzug an");
    }
    assert.ok(!stopp.some((n) => n.startsWith("studium-server-aktualisieren")), "nicht die Aktualisierung, die den Installer startet");
    const rechte = ["fchmod 2711 D", "fchmod 0700 D/laeufe", "fchmod 2770 D/eingang", "fchmod 2750 D/unterlagen", "fchmod 2770 D/unterlagen/neu",
      "fchmod 2770 D/unterlagen/opus", "fchmod 2770 D/unterlagen/kapitel", "fchmod 2771 D/web", "fchmod 2770 D/abruf"];
    assert.deepEqual(erste.filter((z) => z.startsWith("fchmod ")), rechte);
    assert.deepEqual(erste.filter((z) => z.startsWith("chown -h -- ")).map((z) => z.slice(12)), ["studium:studium-web D", "studium:studium D/laeufe",
      "studium:studium-web D/eingang", "studium:studium-web D/unterlagen", "studium:studium-web D/unterlagen/neu", "studium:studium-web D/unterlagen/opus",
      "studium:studium-web D/unterlagen/kapitel", "studium-web:studium-web D/web", "studium-abruf:studium D/abruf"]);
    const nachher = inhalt(D);
    assert.deepEqual(nachher, {
      "web/takt.json": '{"uni_postfach":30}', "web/knopf.json": '{"zuletzt":"x"}', "web/abruf.json": "{}", "web/stand-plugin.json": '{"module":["B110"]}',
      "web/geraete.json": "[]", ["web/verbinden/" + "a".repeat(64) + ".json"]: "{}", ...(link ? {} : { "web/livesync-links/k1": "link" }),
      "abruf/roh/INDEX.md": "# Neu\n- 1 neue Mail\n", "abruf/roh/uni-postfach/1.txt": "Betreff: alt", "abruf/roh/uni-postfach/2.txt": "Betreff: neu",
      "abruf/abruf-stand.json": '{"uid":1}', "abruf/uni-zugang-falsch": "",
      "zustand.json": "{}", "anstoss": '{"grund":"gmail"}', "termine.json": "{}", "laeufe/20261001T050000Z/protokoll.json": "{}",
      "eingang/1.json": "{}", "unterlagen/neu/u.md": "Folie", ".umzug-fertig": "",
    }, "alles umgezogen, nichts verloren; der neuere Takt bleibt");
    assert.deepEqual(fs.readdirSync(p("geheim")), ["anmeldung.json"], "dem Ziel des Links geschah nichts");
    assert.ok(["unterlagen/opus", "unterlagen/kapitel"].every((o) => fs.statSync(path.join(D, o)).isDirectory()));
    assert.equal(erste[erste.length - 1], "sudo -u studium", "Marke zuletzt und als studium: root legt im Datenordner nichts an");
    // Besitzer und Rechte im Umgezogenen; im Datenordner selbst liest der Web-Dienst nur zustand.json (und aktualisierung.json)
    const mit = (anfang) => erste.filter((z) => z.startsWith(anfang)).join(" ");
    for (const [befehl, dateien] of [
      ["chmod 0644 ", ["D/web/takt.json", "D/web/knopf.json"]], ["chmod 0640 ", ["D/web/stand-plugin.json", "D/web/abruf.json", "D/eingang/1.json", "D/unterlagen/neu/u.md", "D/zustand.json"]],
      ["chown -h studium-abruf:studium ", ["D/abruf/roh", "D/abruf/roh/uni-postfach/1.txt", "D/abruf/abruf-stand.json"]], ["chmod 0660 ", ["D/abruf/roh/INDEX.md"]],
      ["chown -h studium:studium-web ", ["D/zustand.json", "D/eingang/1.json"]], ["chown -h studium-web:studium-web ", ["D/web/verbinden", "D/unterlagen/neu/u.md"]],
      ["chown -h studium:studium ", ["D/anstoss", "D/termine.json"]], ["chmod 0600 ", ["D/anstoss", "D/termine.json", "D/web/geraete.json"]]]) {
      for (const d of dateien) assert.ok(` ${mit(befehl)} `.includes(` ${d} `), `${befehl}${d}`);
    }
    assert.doesNotMatch(mit("chmod 0600 "), / D\/zustand\.json /, "zustand.json bleibt für den Web-Dienst lesbar");
    assert.match(mit("chmod 00700 "), / D\/web\/verbinden( |$)/, "Ordner im web/ ohne setgid (00700)");

    // zweiter Lauf: nichts mehr umzuziehen, nichts angehalten, nur die Ordner selbst noch einmal gerichtet
    const zweite = lauf();
    assert.deepEqual(zweite.filter((z) => z.startsWith("fchmod ")), rechte);
    assert.deepEqual(zweite.filter((z) => !z.startsWith("fchmod ") && !z.startsWith("chown -h -- ")), [], "weder angehalten noch Dateien angefasst");
    assert.deepEqual(inhalt(D), nachher);
    // abgebrochener Umzug (die Marke fehlt, die alten Namen sind schon umgezogen): Der nächste Lauf hält wieder an und richtet
    // Besitzer und Rechte noch einmal (bis zur Prüfung vom 02.11.2026 nie wieder, web/verbinden/ blieb studium 0700)
    fs.rmSync(path.join(D, ".umzug-fertig"));
    const dritte = lauf();
    assert.ok(dritte.includes("systemctl stop studium-server-dienst.service"), "angehalten");
    assert.ok(dritte.some((z) => z.startsWith("chown -h studium-web:studium-web ") && z.includes(" D/web/verbinden")), "Besitzer gerichtet");
    assert.ok(fs.existsSync(path.join(D, ".umzug-fertig")), "Marke wieder da");
    // nach dem Abbruch lief noch das alte Paket (Neustart) und schrieb an den alten Ort: Die neuere Datei bleibt, die ältere fällt weg
    fs.utimesSync(path.join(D, "web", "geraete.json"), vorStunde, vorStunde);
    fs.writeFileSync(path.join(D, "geraete.json"), '["neu"]');
    fs.writeFileSync(path.join(D, "takt.json"), '{"uni_postfach":60}');
    fs.utimesSync(path.join(D, "takt.json"), new Date(Date.now() - 7200e3), new Date(Date.now() - 7200e3));
    lauf();
    assert.equal(fs.readFileSync(path.join(D, "web", "geraete.json"), "utf8"), '["neu"]', "neuere vom alten Ort");
    assert.equal(fs.readFileSync(path.join(D, "web", "takt.json"), "utf8"), '{"uni_postfach":30}', "ältere vom alten Ort verliert");
    assert.ok(!fs.existsSync(path.join(D, "geraete.json")) && !fs.existsSync(path.join(D, "takt.json")));
    // was an der Stelle eines Ordners liegt (Datei, Link), fällt weg; der Ordner entsteht neu
    fs.rmSync(path.join(D, "unterlagen", "opus"), { recursive: true });
    fs.writeFileSync(path.join(D, "unterlagen", "opus"), "keine Ordner");
    lauf();
    assert.ok(fs.statSync(path.join(D, "unterlagen", "opus")).isDirectory());
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test("Claude Code aktualisieren: nie während eines Laufs (oneshot: „activating“), sonst als studium", { skip: spawnSync("bash", ["-c", "true"]).status !== 0 && "kein bash" }, () => {
  const funktion = /^claude_aktualisieren\(\) \{\n[\s\S]*?\n\}\n/m.exec(fs.readFileSync(path.join(SERVER, "studium-server"), "utf8"))[0];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "claude-update-"));
  try {
    const bin = path.join(tmp, "bin");
    fs.mkdirSync(bin);
    // systemctl nennt den Zustand aus ZUSTAND, sudo schreibt nur auf, was es ausführen soll
    fs.writeFileSync(path.join(bin, "systemctl"), "#!/usr/bin/env bash\n[ \"$*\" = \"show -P ActiveState studium-server-lauf.service\" ] && echo \"$ZUSTAND\"\n", { mode: 0o755 });
    fs.writeFileSync(path.join(bin, "sudo"), "#!/usr/bin/env bash\necho \"sudo $*\" >> \"$AUFRUFE\"\n", { mode: 0o755 });
    fs.writeFileSync(path.join(tmp, "claude"), "#!/usr/bin/env bash\n", { mode: 0o755 });
    const aufrufe = path.join(tmp, "aufrufe");
    const lauf = (zustand) => {
      fs.rmSync(aufrufe, { force: true });
      const r = spawnSync("bash", ["-c", `${funktion}CLAUDE="$1"; claude_aktualisieren`, "-", path.join(tmp, "claude")], {
        encoding: "utf8", env: Object.assign({}, process.env, { ZUSTAND: zustand, AUFRUFE: aufrufe, PATH: bin + path.delimiter + process.env.PATH }) });
      assert.equal(r.status, 0, r.stderr);
      return { aus: r.stdout, update: fs.existsSync(aufrufe) ? fs.readFileSync(aufrufe, "utf8").trim() : "" };
    };
    for (const z of ["activating", "active", "deactivating", "reloading"]) {
      assert.deepEqual(lauf(z), { aus: "Claude Code: Ein Lauf läuft gerade; Update beim nächsten Mal.\n", update: "" }, z);
    }
    // ohne Nutzungs- und Fehlerberichte an Anthropic, wie im Lauf
    for (const z of ["inactive", "failed"]) assert.match(lauf(z).update, /^sudo -u studium -H env DISABLE_TELEMETRY=1 DISABLE_ERROR_REPORTING=1 \S*claude update$/, z);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test("Nach einem neuen Node.js (auch aus der Nacht): Web-Dienst und Speicherreserve neu, wenn ihr Programm gelöscht ist; was nicht läuft, bleibt", { skip: spawnSync("bash", ["-c", "true"]).status !== 0 && "kein bash" }, () => {
  const skript = fs.readFileSync(path.join(SERVER, "studium-server"), "utf8");
  const funktion = /^veraltete_neu_starten\(\) \{\n[\s\S]*?\n\}\n/m.exec(skript)[0];
  const dienste = /^NODE_DIENSTE=\(.*\)$/m.exec(skript)[0];
  assert.match(skript, /^ {2}pakete_aktualisieren\n {2}veraltete_neu_starten\n/m, "jeden Tag gleich nach den Paketen, auch ohne neue Version");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "veraltet-"));
  try {
    const bin = path.join(tmp, "bin"), aufrufe = path.join(tmp, "aufrufe");
    fs.mkdirSync(bin);
    // systemctl nennt die MainPID aus PID_<dienst> und schreibt try-restart auf; readlink nennt /proc/<pid>/exe aus EXE_<pid>
    fs.writeFileSync(path.join(bin, "systemctl"), "#!/usr/bin/env bash\nif [ \"$1 $2 $3\" = \"show -P MainPID\" ]; then v=\"PID_${4//[^a-z]/_}\"; echo \"${!v:-0}\"; exit 0; fi\n" +
      "echo \"systemctl $*\" >> \"$AUFRUFE\"\n", { mode: 0o755 });
    fs.writeFileSync(path.join(bin, "readlink"), "#!/usr/bin/env bash\nv=\"EXE_${1//[^0-9]/}\"; [ -n \"${!v:-}\" ] || exit 1; echo \"${!v}\"\n", { mode: 0o755 });
    const lauf = (env) => {
      fs.rmSync(aufrufe, { force: true });
      const r = spawnSync("bash", ["-c", `set -euo pipefail\n${dienste}\n${funktion}veraltete_neu_starten`], { encoding: "utf8",
        env: Object.assign({}, process.env, { AUFRUFE: aufrufe, PATH: bin + path.delimiter + process.env.PATH }, env) });
      assert.equal(r.status, 0, r.stderr);
      return fs.existsSync(aufrufe) ? fs.readFileSync(aufrufe, "utf8").trim().split("\n") : [];
    };
    const D = "PID_studium_server_dienst_service", S = "PID_studium_server_speicher_service";
    assert.deepEqual(lauf({ [D]: "101", EXE_101: "/usr/bin/node (deleted)", [S]: "202", EXE_202: "/usr/bin/node" }),
      ["systemctl try-restart studium-server-dienst.service"], "nur der mit dem gelöschten Programm");
    assert.deepEqual(lauf({ [D]: "101", EXE_101: "/usr/bin/node (deleted)", [S]: "202", EXE_202: "/usr/bin/node (deleted)" }),
      ["systemctl try-restart studium-server-dienst.service", "systemctl try-restart studium-server-speicher.service"]);
    assert.deepEqual(lauf({ [D]: "101", EXE_101: "/usr/bin/node" }), [], "aktuell: kein Neustart");
    assert.deepEqual(lauf({ [D]: "0", [S]: "" }), [], "läuft nicht (MainPID 0): bleibt aus");
    assert.deepEqual(lauf({ [D]: "101" }), [], "Prozess schon weg (readlink scheitert): nichts");
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test("Schlüssel erneuern (Gerät verloren): neue Schlüssel, der Rest von dienst.json bleibt, offene Codes weg, der Dienst steht dabei still; installieren.sh behält sie", { skip: spawnSync("bash", ["-c", "true"]).status !== 0 && "kein bash" }, () => {
  const skript = fs.readFileSync(path.join(SERVER, "studium-server"), "utf8");
  assert.match(skript, /^ {2}schluessel-erneuern\) schluessel_erneuern ;;$/m, "Befehl");
  assert.match(skript, /^studium-server schluessel-erneuern {5}\S/m, "in der Hilfe");
  const funktion = /^schluessel_erneuern\(\) \{\n[\s\S]*?\n\}\n/m.exec(skript)[0];
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "schluessel-"));
  const p = (...t) => path.join(tmp, ...t);
  const vorwaerts = (x) => x.replace(/\\/g, "/");
  try {
    fs.mkdirSync(p("bin"));
    fs.mkdirSync(p("daten", "web", "verbinden"), { recursive: true });
    // systemctl und chown schreiben nur auf, was sie tun sollen
    for (const b of ["systemctl", "chown"]) fs.writeFileSync(p("bin", b), `#!/usr/bin/env bash\necho "${b} $*" >> "$AUFRUFE"\n`, { mode: 0o755 });
    const ablauf = ["set -euo pipefail", funktion, "root_noetig() { :; }", 'als_web() { echo "als_web $1" >> "$AUFRUFE"; "$@"; }', "KONFIG=$1 DATEN=$2", "schluessel_erneuern"].join("\n");
    const lauf = () => {
      fs.rmSync(p("aufrufe"), { force: true });
      const r = spawnSync("bash", ["-c", ablauf, "-", vorwaerts(p("dienst.json")), vorwaerts(p("daten"))], { encoding: "utf8",
        env: Object.assign({}, process.env, { AUFRUFE: p("aufrufe"), PATH: p("bin") + path.delimiter + process.env.PATH }) });
      return { status: r.status, aus: r.stdout, fehler: r.stderr, aufrufe: fs.existsSync(p("aufrufe")) ? fs.readFileSync(p("aufrufe"), "utf8").trim().split("\n") : [] };
    };
    const bisher = { zugang: "z".repeat(43), schluessel: "s".repeat(43), adresse: "https://203-0-113-5.ss" + "lip.io", ip: "203.0.113.5", port: 8743, version: "0.7.5" };
    fs.writeFileSync(p("dienst.json"), JSON.stringify(bisher));
    for (const n of ["a".repeat(64) + ".json", "b".repeat(64) + ".json.eingeloest"]) fs.writeFileSync(p("daten", "web", "verbinden", n), "{}");
    let e = lauf();
    assert.equal(e.status, 0, e.fehler);
    const neu = JSON.parse(fs.readFileSync(p("dienst.json"), "utf8"));
    for (const k of ["zugang", "schluessel"]) {
      assert.match(neu[k], /^[A-Za-z0-9_-]{43}$/, k + ": 32 Byte, base64url");
      assert.notEqual(neu[k], bisher[k], k + " neu");
    }
    assert.notEqual(neu.zugang, neu.schluessel);
    assert.deepEqual({ ...neu, zugang: "", schluessel: "" }, { ...bisher, zugang: "", schluessel: "" }, "Adresse, IP, Port und Version bleiben");
    assert.deepEqual(fs.readdirSync(p("daten", "web", "verbinden")), [], "offene Codes weg (als Benutzer des Dienstes)");
    assert.ok(!fs.existsSync(p("dienst.json.neu")));
    assert.deepEqual(e.aufrufe, ["systemctl stop studium-server-dienst.service", "als_web sh", `chown root:studium-web ${vorwaerts(p("dienst.json"))}.neu`,
      "systemctl start studium-server-dienst.service"], "erst still, dann die neue Datei (lesbar für den Dienst), dann wieder an");
    assert.match(e.aus, /Jedes Gerät muss sich neu verbinden/);
    // dienst.json unlesbar: nichts ersetzt, Exit nicht 0, der Dienst läuft wieder
    fs.writeFileSync(p("dienst.json"), "{");
    e = lauf();
    assert.notEqual(e.status, 0);
    assert.equal(fs.readFileSync(p("dienst.json"), "utf8"), "{");
    assert.deepEqual(e.aufrufe, ["systemctl stop studium-server-dienst.service", "als_web sh", "systemctl start studium-server-dienst.service"]);
    // installieren.sh (wiederholbar) behält die neuen Schlüssel: sein Schritt „Schlüssel und Konfiguration“ gegen diese Datei
    const inst = /STUDIUM_KONFIG="\$KONFIG" [^\n]* node --input-type=module -e '\n([\s\S]*?)\n'\n/.exec(fs.readFileSync(path.join(SERVER, "installieren.sh"), "utf8"))[1];
    fs.writeFileSync(p("dienst.json"), JSON.stringify(neu));
    const r = spawnSync(process.execPath, ["--input-type=module", "-e", inst], { encoding: "utf8", env: Object.assign({}, process.env,
      { STUDIUM_KONFIG: p("dienst.json"), STUDIUM_ADRESSE: neu.adresse, STUDIUM_IP: neu.ip, STUDIUM_VERSION: "0.7.6" }) });
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /Schlüssel unverändert/);
    const danach = JSON.parse(fs.readFileSync(p("dienst.json"), "utf8"));
    assert.deepEqual([danach.zugang, danach.schluessel, danach.version], [neu.zugang, neu.schluessel, "0.7.6"]);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

// jq nur für die Filter von „aktualisieren“, wo es fehlt (Windows); mit echtem jq (Linux, GitHub Actions) gilt das echte
const JQ_ATTRAPPE = `#!/usr/bin/env node
const fs = require("node:fs");
const [filter, datei] = process.argv.slice(3);
const d = JSON.parse(fs.readFileSync(datei || 0, "utf8"));
const asset = (name) => (d.assets || []).find((a) => a.name === name) || {};
const paket = asset("studium-server.tar.gz"), signatur = asset("studium-server.tar.gz.sig");
const f = { '.tag_name // "" | ltrimstr("v")': () => String(d.tag_name || "").replace(/^v/, ""), ".ip": () => d.ip, ".ip // empty": () => d.ip,
  '.assets[] | select(.name == "studium-server.tar.gz") | .browser_download_url': () => paket.browser_download_url,
  '.assets[] | select(.name == "studium-server.tar.gz") | .digest // empty': () => paket.digest,
  '.assets[] | select(.name == "studium-server.tar.gz.sig") | .browser_download_url': () => signatur.browser_download_url }[filter];
if (!f) { console.error("jq-Attrappe kennt den Filter nicht: " + filter); process.exit(3); }
const w = f();
if (w != null && w !== "") process.stdout.write(w + "\\n");
`;

const OHNE_BASH = spawnSync("bash", ["-c", "true"]).status !== 0 && "kein bash";
const OHNE_SSH_KEYGEN = OHNE_BASH || (spawnSync("bash", ["-c", "command -v ssh-keygen"]).status !== 0 && "kein ssh-keygen");

test("Neue Version holen: nur mit Prüfsumme und gültiger Signatur; Ergebnis für den Status (Zeit, ok, Ziel, Grund, letzter Erfolg) auch nach Abbruch; Download-Ordner geht weg, Erfolg endet mit 0", { skip: OHNE_SSH_KEYGEN }, async () => {
  const skript = fs.readFileSync(path.join(SERVER, "studium-server"), "utf8");
  const fn = (name) => new RegExp(`^${name}\\(\\) \\{\\n[\\s\\S]*?\\n\\}\\n`, "m").exec(skript)[0];
  // Gründe: dieselben Wörter wie im Status
  const { AKTUALISIERUNG_GRUENDE } = await laden("dienst.mjs");
  assert.deepEqual([...new Set([...skript.matchAll(/AKT_GRUND=([a-z-]+)/g)].map((m) => m[1]))].sort(), [...AKTUALISIERUNG_GRUENDE].sort());
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "neue-version-"));
  const p = (...t) => path.join(tmp, ...t);
  try {
    for (const d of ["bin", "daten", "paket", "release/server"]) fs.mkdirSync(p(d), { recursive: true });
    // Paket des Releases 0.7.0 (der Installer schreibt nur auf) und GitHub: curl antwortet aus info.json (GITHUB=0: gar nicht)
    fs.writeFileSync(p("release", "server", "VERSION"), "0.7.0\n");
    fs.writeFileSync(p("release", "server", "installieren.sh"), "echo \"installieren $*\" >> \"$AUFRUFE\"\nexit \"${INSTALLIEREN:-0}\"\n");
    assert.equal(spawnSync("bash", ["-c", "tar -czf paket.tar.gz server"], { cwd: p("release") }).status, 0);
    const echt = fs.readFileSync(p("release", "paket.tar.gz"));
    const sha = (b) => require("node:crypto").createHash("sha256").update(b).digest("hex");
    const summe = sha(echt);
    // Signatur wie beim Release: Wegwerf-Schlüssel; allowed_signers liegt im LAUFENDEN Paket (nie aus dem Download)
    const keygen = (...a) => {
      const r = spawnSync("bash", ["-c", 'ssh-keygen "$@"', "-", ...a.map((x) => x.replace(/\\/g, "/"))], { encoding: "utf8" });
      assert.equal(r.status, 0, r.stderr);
    };
    for (const n of ["signierer", "fremd"]) keygen("-q", "-t", "ed25519", "-N", "", "-C", n, "-f", p(n));
    const signierer = fs.readFileSync(p("signierer.pub"), "utf8").split(" ").slice(0, 2).join(" ");
    fs.writeFileSync(p("paket", "allowed_signers"), `# Kommentar\nrelease@studium-autopilot namespaces="studium-server" ${signierer}\n`);
    const signieren = (schluessel, namensraum = "studium-server") => {
      fs.rmSync(p("release", "paket.tar.gz.sig"), { force: true });
      keygen("-Y", "sign", "-f", p(schluessel), "-n", namensraum, p("release", "paket.tar.gz"));
    };
    signieren("signierer");
    const info = (digest, mitSignatur = true) => fs.writeFileSync(p("release", "info.json"), JSON.stringify({ tag_name: "v0.7.0",
      assets: [{ name: "studium-server.tar.gz", browser_download_url: "https://beispiel.example/studium-server.tar.gz", digest },
        ...(mitSignatur ? [{ name: "studium-server.tar.gz.sig", browser_download_url: "https://beispiel.example/studium-server.tar.gz.sig" }] : [])] }));
    fs.writeFileSync(p("bin", "curl"), "#!/usr/bin/env bash\n[ \"${GITHUB:-1}\" = 1 ] || exit 6\nziel=\"\"\nwhile [ $# -gt 0 ]; do [ \"$1\" = -o ] && ziel=$2; shift; done\n" +
      "if [ -n \"$ziel\" ]; then echo \"herunterladen $ziel\" >> \"$AUFRUFE\"; cp \"$RELEASE/${ziel##*/}\" \"$ziel\"; else cat \"$RELEASE/info.json\"; fi\n", { mode: 0o755 });
    // apt-get wie das echte: ein Paket, das kein Archiv kennt (ARCHIV), lässt den ganzen Aufruf scheitern („Unable to locate
    // package“); dpkg-query nennt die installierten (INSTALLIERT). Ohne LiveSync gibt es CouchDB und sein Archiv nicht.
    fs.writeFileSync(p("bin", "apt-get"), "#!/usr/bin/env bash\necho \"apt-get $*\" >> \"$AUFRUFE\"\nnur=0\nfor a in \"$@\"; do\n" +
      "  if [ \"$nur\" = 1 ] && [[ \"$a\" != -* ]] && [[ \" ${ARCHIV:-caddy nodejs couchdb} \" != *\" $a \"* ]]; then echo \"E: Unable to locate package $a\" >&2; exit 100; fi\n" +
      "  [ \"$a\" != --only-upgrade ] || nur=1\ndone\nexit \"${APT:-0}\"\n", { mode: 0o755 });
    fs.writeFileSync(p("bin", "dpkg-query"), "#!/usr/bin/env bash\n[[ \" ${INSTALLIERT-caddy nodejs couchdb} \" == *\" ${!#} \"* ]] && printf installed || printf not-installed\n",
      { mode: 0o755 });
    if (spawnSync("bash", ["-c", "command -v jq"]).status !== 0) fs.writeFileSync(p("bin", "jq"), JQ_ATTRAPPE, { mode: 0o755 });
    fs.writeFileSync(p("dienst.json"), JSON.stringify({ ip: "203.0.113.5" }));
    fs.writeFileSync(p("paket", "VERSION"), "0.6.9\n");
    const installiert = new Date("2026-10-20T08:00:00Z");
    fs.utimesSync(p("paket", "VERSION"), installiert, installiert);
    const ablauf = ["set -euo pipefail", fn("version_neuer") + fn("aktualisierung_merken") + fn("aktualisieren_ende") + fn("pakete_aktualisieren") + fn("aktualisieren"),
      "root_noetig() { :; }", "claude_aktualisieren() { :; }", "veraltete_neu_starten() { :; }", 'als_studium() { "$@"; }',
      'PAKET=$1 DATEN=$2 KONFIG=$3 RELEASES=https://api.github.com/repos/studium-autopilot/ecoba/releases/latest AKT_ZIEL="" AKT_GRUND="" AKT_TMP="" PAKETE_FEHLER=0',
      "aktualisieren"].join("\n");
    const lauf = (env) => {
      fs.rmSync(p("aufrufe"), { force: true });
      const r = spawnSync("bash", ["-c", ablauf, "-", ...[p("paket"), p("daten"), p("dienst.json")].map((x) => x.replace(/\\/g, "/"))], { encoding: "utf8",
        env: Object.assign({}, process.env, { AUFRUFE: p("aufrufe"), RELEASE: p("release"), PATH: p("bin") + path.delimiter + process.env.PATH }, env) });
      const aufrufe = fs.existsSync(p("aufrufe")) ? fs.readFileSync(p("aufrufe"), "utf8").trim().split("\n") : [];
      const download = aufrufe.filter((z) => z.startsWith("herunterladen ")).map((z) => z.slice(14).replace(/\/paket\.tar\.gz$/, ""))[0];
      if (download) assert.notEqual(spawnSync("bash", ["-c", '[ -e "$1" ]', "-", download]).status, 0, "Download-Ordner weg");
      assert.deepEqual(fs.readdirSync(p("daten")), ["aktualisierung.json"], "nichts Halbes liegen geblieben");
      const akt = JSON.parse(fs.readFileSync(p("daten", "aktualisierung.json"), "utf8"));
      assert.match(akt.zeit, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
      const apt = aufrufe.filter((z) => z.startsWith("apt-get "));
      return { status: r.status, fehler: r.stderr, akt: { ...akt, zeit: "" }, zeit: akt.zeit, apt,
        aufrufe: aufrufe.filter((z) => !z.startsWith("herunterladen ") && !z.startsWith("apt-get ")),
        geladen: aufrufe.filter((z) => z.startsWith("herunterladen ")).length };
    };
    info("sha256:" + summe);
    // Pakete jeden Tag zuerst, auch ohne neue Version und ohne GitHub; nie während eines anderen apt (Sperre, bis 10 Minuten)
    const PAKETE = ["apt-get -q -o DPkg::Lock::Timeout=600 update",
      "apt-get install -y -q -o DPkg::Lock::Timeout=600 -o Dpkg::Options::=--force-confold --only-upgrade caddy nodejs couchdb"];
    // GitHub nicht erreichbar, noch kein Ergebnis da: letzter Erfolg ist die Installation des laufenden Pakets
    let e = lauf({ GITHUB: "0" });
    assert.equal(e.status, 1);
    assert.deepEqual(e.akt, { zeit: "", ok: false, ziel: "", grund: "github", erfolg: "2026-10-20T08:00:00Z" });
    assert.deepEqual(e.apt, PAKETE, "Pakete auch ohne GitHub");
    // neue Version: Paket und Signatur geladen, installiert und Pakete nachgezogen, Exit 0, Erfolg jetzt
    e = lauf({});
    assert.equal(e.status, 0, e.fehler);
    assert.deepEqual(e.akt, { zeit: "", ok: true, ziel: "0.7.0", grund: "", erfolg: e.zeit });
    assert.deepEqual([e.geladen, e.apt, e.aufrufe], [2, PAKETE, ["installieren --ip 203.0.113.5"]]);
    const erfolg = e.zeit;
    // falsche Prüfsumme: nichts installiert, der letzte Erfolg bleibt stehen
    info("sha256:" + "0".repeat(64));
    e = lauf({});
    assert.deepEqual([e.status, e.akt, e.aufrufe], [1, { zeit: "", ok: false, ziel: "0.7.0", grund: "pruefsumme", erfolg }, []]);
    // keine Signatur im Release (etwa ein Release, das jemand mit dem Konto oder einem Token angelegt hat): nichts geladen
    info("sha256:" + summe, false);
    e = lauf({});
    assert.deepEqual([e.status, e.akt, e.geladen, e.aufrufe], [1, { zeit: "", ok: false, ziel: "0.7.0", grund: "signatur-fehlt", erfolg }, 0, []]);
    info("sha256:" + summe);
    // Signatur eines anderen Schlüssels, eines anderen Namensraums, oder ein anderes Paket mit passender Prüfsumme (die nennt
    // GitHub selbst): nichts installiert
    const ungueltig = (was) => {
      e = lauf({});
      assert.deepEqual([e.status, e.akt, e.aufrufe], [1, { zeit: "", ok: false, ziel: "0.7.0", grund: "signatur", erfolg }, []], was);
    };
    signieren("fremd");
    ungueltig("fremder Schlüssel");
    signieren("signierer", "git");
    ungueltig("anderer Namensraum");
    signieren("signierer");
    const getauscht = Buffer.concat([echt, Buffer.from("fremd")]);
    fs.writeFileSync(p("release", "paket.tar.gz"), getauscht);
    info("sha256:" + sha(getauscht));
    ungueltig("anderes Paket mit passender Prüfsumme");
    fs.writeFileSync(p("release", "paket.tar.gz"), echt);
    info("sha256:" + summe);
    // ohne allowed_signers im laufenden Paket lässt sich nichts prüfen, also nichts installieren
    const erlaubt = fs.readFileSync(p("paket", "allowed_signers"));
    fs.rmSync(p("paket", "allowed_signers"));
    ungueltig("allowed_signers fehlt im laufenden Paket");
    fs.writeFileSync(p("paket", "allowed_signers"), erlaubt);
    // Installer bricht ab
    e = lauf({ INSTALLIEREN: "3" });
    assert.deepEqual([e.status, e.akt, e.aufrufe], [3, { zeit: "", ok: false, ziel: "0.7.0", grund: "installieren", erfolg }, ["installieren --ip 203.0.113.5"]]);
    // noch ohne Adresse (der Server hat sich selbst vorbereitet, die Einrichtung in der Cloud Shell kam noch nicht): nur vorbereiten
    fs.writeFileSync(p("dienst.json"), JSON.stringify({ zugang: "z" }));
    e = lauf({});
    assert.deepEqual([e.status, e.aufrufe[0]], [0, "installieren --vorbereiten"], e.fehler);
    fs.writeFileSync(p("dienst.json"), JSON.stringify({ ip: "203.0.113.5" }));
    // Pakete scheitern (Archiv nicht erreichbar): das neue Paket kommt trotzdem, der Lauf zählt aber als gescheitert
    const bisher = JSON.parse(fs.readFileSync(p("daten", "aktualisierung.json"), "utf8")).erfolg;
    e = lauf({ APT: "100" });
    assert.deepEqual([e.status, e.akt, e.apt, e.aufrufe], [1, { zeit: "", ok: false, ziel: "0.7.0", grund: "pakete", erfolg: bisher }, [PAKETE[0]],
      ["installieren --ip 203.0.113.5"]]);
    // gleiche Version, aber ihre Installation kam nicht bis zum Ende (keine Marke .installiert): noch einmal installieren
    fs.writeFileSync(p("paket", "VERSION"), "0.7.0\n");
    e = lauf({});
    assert.deepEqual([e.status, e.akt.ok, e.aufrufe], [0, true, ["installieren --ip 203.0.113.5"]], e.fehler);
    e = lauf({ INSTALLIEREN: "3" });
    assert.deepEqual([e.status, e.akt.grund, e.aufrufe], [3, "installieren", ["installieren --ip 203.0.113.5"]], "scheitert wieder: gescheitert, nicht „Schon aktuell“");
    // schon aktuell und fertig installiert: Pakete trotzdem, ohne Fehler, nichts installiert
    fs.writeFileSync(p("paket", ".installiert"), "");
    e = lauf({});
    assert.deepEqual([e.status, e.akt.ok, e.akt.ziel, e.akt.erfolg === e.zeit, e.apt, e.aufrufe], [0, true, "0.7.0", true, PAKETE, []]);
    // schon aktuell, aber die Pakete scheitern: gescheitert mit Grund pakete, der letzte Erfolg bleibt
    const zuletzt = e.zeit;
    e = lauf({ APT: "100" });
    assert.deepEqual([e.status, e.akt], [1, { zeit: "", ok: false, ziel: "0.7.0", grund: "pakete", erfolg: zuletzt }]);
    // ohne LiveSync: weder CouchDB noch sein Archiv. Nur Caddy und Node.js, ohne Fehler (bis 0.7.6 scheiterte apt hier jeden Tag an
    // „Unable to locate package couchdb“, und Caddy und Node.js blieben stehen)
    e = lauf({ INSTALLIERT: "caddy nodejs", ARCHIV: "caddy nodejs" });
    assert.deepEqual([e.status, e.akt.ok, e.akt.grund, e.apt], [0, true, "", [PAKETE[0], PAKETE[1].replace(/ couchdb$/, "")]], e.fehler);
    e = lauf({ INSTALLIERT: "", ARCHIV: "caddy nodejs" });
    assert.deepEqual([e.status, e.akt.ok, e.apt], [0, true, []], "nichts davon installiert: kein apt");
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test("Installer: Jedes Modul, das ein installiertes Modul einbindet, kommt mit; jede Datei, die eine Einheit startet, auch", () => {
  const skript = fs.readFileSync(path.join(SERVER, "installieren.sh"), "utf8");
  const liste = /^for datei in ([^\n]*); do$/m.exec(skript)[1].split(" ");
  for (const n of liste.filter((x) => x.endsWith(".mjs"))) {
    for (const m of fs.readFileSync(path.join(SERVER, n), "utf8").matchAll(/^import [^\n]* from "\.\/([\w-]+\.mjs)";$/gm)) {
      assert.ok(liste.includes(m[1]), `${n} bindet ${m[1]} ein, das der Installer nicht mitnimmt`);
    }
  }
  for (const m of skript.matchAll(/\/opt\/studium-server\/aktuell\/([\w.-]+)/g)) assert.ok(liste.includes(m[1]), m[1]);
});

test("Signatur des Server-Pakets: allowed_signers nennt Schlüssel genau für Prinzipal und Namensraum, die „aktualisieren“ prüft; der Installer legt sie mit ab", () => {
  const m = /ssh-keygen -Y verify -f "\$PAKET\/allowed_signers" -I ([\w@.-]+) -n ([\w-]+) /.exec(fs.readFileSync(path.join(SERVER, "studium-server"), "utf8"));
  assert.ok(m, "aktualisieren prüft mit allowed_signers des laufenden Pakets");
  const zeilen = fs.readFileSync(path.join(SERVER, "allowed_signers"), "utf8").split("\n").filter((z) => z.trim() && !z.trim().startsWith("#"));
  assert.ok(zeilen.length >= 1, "mindestens ein Schlüssel");
  for (const z of zeilen) assert.match(z, new RegExp(`^${m[1]} namespaces="${m[2]}" (?:ssh|ecdsa|sk)-[a-z0-9@.-]+ [A-Za-z0-9+/]+=*$`));
  // fehlt sie im installierten Paket, scheitert jedes weitere Update an der Signatur
  assert.match(fs.readFileSync(path.join(SERVER, "installieren.sh"), "utf8"), /^for datei in [^\n]* allowed_signers[ ;][^\n]*do$/m);
});

test("Schutz der Dienste: jeder Dienst ohne root im Sandkasten; der Web-Dienst sieht weder Claude-Anmeldung noch Lauf-Ordner und spricht nur mit 127.0.0.1", () => {
  const skript = fs.readFileSync(path.join(SERVER, "installieren.sh"), "utf8");
  const einheiten = Object.fromEntries([...skript.matchAll(/^einheit (studium-server-[\w@.-]+) <<'UNIT'\n([\s\S]*?)\nUNIT$/gm)].map((m) => [m[1],
    m[2].split("\n").filter((z) => /^\w+=/.test(z)).reduce((o, z) => { const i = z.indexOf("="); (o[z.slice(0, i)] ||= []).push(z.slice(i + 1)); return o; }, {})]));
  const dienste = Object.keys(einheiten).filter((n) => n.endsWith(".service") && einheiten[n].User);
  assert.deepEqual(dienste.sort(), ["abruf", "dienst", "gmail", "lauf", "speicher", "zustand"].map((n) => `studium-server-${n}.service`));
  const PFLICHT = { NoNewPrivileges: "yes", CapabilityBoundingSet: "", ProtectSystem: "strict", ProtectHome: "yes", PrivateTmp: "yes", PrivateDevices: "yes",
    ProtectKernelTunables: "yes", ProtectKernelModules: "yes", ProtectKernelLogs: "yes", ProtectControlGroups: "yes", ProtectClock: "yes", ProtectHostname: "yes",
    ProtectProc: "invisible", RestrictNamespaces: "yes", RestrictRealtime: "yes", RestrictSUIDSGID: "yes", LockPersonality: "yes", SystemCallArchitectures: "native",
    SystemCallErrorNumber: "EPERM" };
  for (const n of dienste) {
    const e = einheiten[n];
    for (const [k, w] of Object.entries(PFLICHT)) assert.deepEqual(e[k], [w], `${n}: ${k}`);
    assert.deepEqual(e.SystemCallFilter, ["@system-service", "~@privileged"], n);
    assert.ok(e.RestrictAddressFamilies && e.UMask && e.ReadWritePaths && e.InaccessiblePaths, n);
    // Node.js und Claude Code übersetzen zur Laufzeit (JIT): nie MemoryDenyWriteExecute
    if (e.ExecStart[0].startsWith("/usr/bin/node ")) assert.equal(e.MemoryDenyWriteExecute, undefined, n);
    // Die Claude-Anmeldung (Home von studium) sieht nur, wer Claude startet
    const sperrt = e.InaccessiblePaths[0].split(" ");
    if (!["studium-server-lauf.service", "studium-server-zustand.service"].includes(n)) assert.ok(sperrt.includes("-/var/lib/studium"), `${n}: Claude-Anmeldung gesperrt`);
    else assert.ok(e.ReadWritePaths[0].split(" ").includes("/var/lib/studium"), `${n}: ~/.claude beschreibbar`);
  }
  const dienst = einheiten["studium-server-dienst.service"];
  for (const p of ["-/var/lib/studium", "-/var/lib/studium-server/laeufe", "/etc/credstore.encrypted", "-/run/credentials", "-/etc/studium-server/livesync.json"]) {
    assert.ok(dienst.InaccessiblePaths[0].split(" ").includes(p), `Web-Dienst: ${p}`);
  }
  assert.deepEqual([dienst.IPAddressDeny, dienst.IPAddressAllow, dienst.RestrictAddressFamilies], [["any"], ["localhost"], ["AF_UNIX AF_INET AF_INET6"]]);
  // Ohne Netz, wer keins braucht; den Lauf erreicht der Uni-Zugang nie
  for (const n of ["speicher", "gmail"]) assert.deepEqual(einheiten[`studium-server-${n}.service`].IPAddressDeny, ["any"], n);
  assert.ok(einheiten["studium-server-lauf.service"].InaccessiblePaths[0].split(" ").includes("/etc/studium-server"));
  // claude auth status alle 15 Minuten: ohne Nutzungs- und Fehlerberichte an Anthropic
  const umgebung = einheiten["studium-server-zustand.service"].Environment.join(" ").split(" ");
  for (const v of ["DISABLE_TELEMETRY=1", "DISABLE_ERROR_REPORTING=1"]) assert.ok(umgebung.includes(v), `Zustand: ${v}`);
  assert.equal(einheiten["studium-server-abruf.service"].MemoryDenyWriteExecute[0], "yes");
  assert.deepEqual([dienst.UMask, einheiten["studium-server-abruf.service"].UMask], [["0027"], ["0007"]]);
  // Jeder Teil als eigener Benutzer und nur in seinem Ordner (ordnung in installieren.sh): Der Web-Dienst kann weder Claudes
  // Anmeldung lesen noch die Prozesse von studium beenden; nur der Lauf bekommt die Gruppe des Web-Dienstes dazu
  const benutzer = Object.fromEntries(dienste.map((n) => [n.replace(/^studium-server-|\.service$/g, ""), [einheiten[n].User[0], einheiten[n].Group[0]]]));
  assert.deepEqual(benutzer, { abruf: ["studium-abruf", "studium"], dienst: ["studium-web", "studium-web"], gmail: ["studium", "studium"],
    lauf: ["studium", "studium"], speicher: ["studium", "studium"], zustand: ["studium", "studium"] });
  assert.deepEqual(dienste.filter((n) => einheiten[n].SupplementaryGroups), ["studium-server-lauf.service"]);
  assert.deepEqual(einheiten["studium-server-lauf.service"].SupplementaryGroups, ["studium-web"]);
  const D = "/var/lib/studium-server";
  assert.deepEqual(dienst.ReadWritePaths, [`${D}/web ${D}/eingang ${D}/unterlagen`], "Web-Dienst schreibt nur in web/, eingang/, unterlagen/");
  assert.ok(dienst.InaccessiblePaths[0].split(" ").includes(`-${D}/abruf`), "Web-Dienst sieht die Rohdaten nicht");
  const abruf = einheiten["studium-server-abruf.service"];
  assert.deepEqual(abruf.ReadWritePaths, [`${D}/abruf`], "Abruf schreibt nur in abruf/");
  for (const p of [`-${D}/laeufe`, `-${D}/eingang`, `-${D}/unterlagen`, `-${D}/web/verbinden`, `-${D}/web/livesync-links`]) {
    assert.ok(abruf.InaccessiblePaths[0].split(" ").includes(p), `Abruf: ${p}`);
  }
  assert.deepEqual(abruf.ConditionPathExists, ["/etc/credstore.encrypted/uni-zugang", `!${D}/abruf/uni-zugang-falsch`]);
  for (const n of ["zustand", "gmail"]) {
    const sperrt = einheiten[`studium-server-${n}.service`].InaccessiblePaths[0].split(" ");
    for (const o of ["unterlagen", "eingang"]) assert.ok(sperrt.includes(`-${D}/${o}`), `${n}: ${o}`);
  }
  // ein Anstoß je Schreiber (lauf.mjs ANSTOESSE)
  assert.deepEqual(einheiten["studium-server-lauf.path"].PathExists, [`${D}/anstoss`, `${D}/web/anstoss`, `${D}/abruf/anstoss`]);
});

test("Pakete: Node.js von NodeSource (Schlüssel am Fingerabdruck geprüft, Pin), Caddy, CouchDB und Node.js unter unattended-upgrades", () => {
  const skript = fs.readFileSync(path.join(SERVER, "installieren.sh"), "utf8");
  assert.match(skript, /^NODE_MAJOR=(2[2-9]|[3-9]\d)$/m, "eine gepflegte LTS-Linie, nicht Node.js 18 von Ubuntu");
  assert.match(skript, /^NODE_SCHLUESSEL=6F71F525282841EEDAF851B42F59B5F99B1BE0B4$/m);
  assert.doesNotMatch(/^for p in ([^\n]*); do$/m.exec(skript)[1], /\bnodejs\b/, "nodejs nicht aus Ubuntu");
  assert.match(skript, /Package: nodejs\nPin: origin deb\.nodesource\.com\nPin-Priority: 600/);
  const muster = /Unattended-Upgrade::Origins-Pattern \{\n([\s\S]*?)\n\};/.exec(skript)[1].split("\n").map((z) => z.trim());
  assert.deepEqual(muster, ['"site=dl.cloudsmith.io,origin=cloudsmith/caddy/stable";', '"site=apache.jfrog.io,origin=Artifactory,codename=noble";',
    '"site=deb.nodesource.com,codename=nodistro";']);
  // die Archive selbst: dieselben Adressen wie in den Mustern
  assert.match(skript, /dl\.cloudsmith\.io\/public\/caddy\/stable/);
  assert.match(fs.readFileSync(path.join(SERVER, "livesync.sh"), "utf8"), /https:\/\/apache\.jfrog\.io\/artifactory\/couchdb-deb\/ noble main/);
  assert.match(skript, /https:\/\/deb\.nodesource\.com\/node_\$NODE_MAJOR\.x nodistro main/);
});

test("Folien für Kapitellisten: nur Folien mit Modulcode und gültigem Pfad, Nummer, Datum und Quelle geprüft, Kopf für Claude, Anstoß, Grenze; Stand nennt die Module", async () => {
  const { kapitelUnterlagenPruefen, kapitelAblegen, standPruefen } = await laden("dienst.mjs");
  const k = (c) => c.repeat(64);
  const u = (x) => Object.assign({ datei: "Unterlagen/B110 Einführung/B110 Folien 00 Einführung.pdf", kennung: k("a"), art: "Folien", titel: "B110 Folien 00 Einführung",
    code: "B110", nummer: 0, seiten: 30, ganz: 8, datum: "2026-10-14", quelle: "ILIAS-Kurs B110", text: "[S. 1]\nGliederung\u0007\n[S. 9] Kapitel 2" }, x);
  const geprueft = kapitelUnterlagenPruefen({ schema: 1, unterlagen: [u(), u({ kennung: k("b"), art: "Skript" }), u({ kennung: k("c"), code: "" })] });
  assert.equal(geprueft.length, 1, "nur Folien mit Modulcode");
  assert.equal(geprueft[0].text, "[S. 1]\nGliederung \n[S. 9] Kapitel 2", "Steuerzeichen weg, Zeilen bleiben");
  const [schief] = kapitelUnterlagenPruefen({ schema: 1, unterlagen: [u({ nummer: 100, datum: "gestern", quelle: "<b>x</b>", ganz: -1 })] });
  assert.deepEqual([schief.nummer, schief.datum, schief.quelle, schief.ganz], [null, "", "x", 0]);
  assert.deepEqual(kapitelUnterlagenPruefen({ schema: 1, unterlagen: [u({ datei: "Unterlagen/../x.pdf" }), u({ kennung: "kurz" }), u({ text: " " })] }), []);
  assert.throws(() => kapitelUnterlagenPruefen({ schema: 2, unterlagen: [] }), /Schema/);

  const v = ordner();
  assert.equal(kapitelAblegen(v, geprueft, new Date("2026-10-18T07:30:00Z")), 1);
  const datei = fs.readFileSync(path.join(v, "unterlagen", "kapitel", k("a") + ".md"), "utf8");
  assert.ok(datei.startsWith("# B110 Folien 00 Einführung\n\nDatei: Unterlagen/B110 Einführung/B110 Folien 00 Einführung.pdf\n" +
    "Modul: B110 · Art: Folien · Nummer: 0 · Seiten: 30\nDatum: 2026-10-14 · Quelle: ILIAS-Kurs B110\n" +
    "Auftrag: nur Kapitelliste (Lernplan); ab Seite 9 steht nur die erste Zeile jeder Seite\n\n---\n[S. 1]"), datei.slice(0, 400));
  assert.equal(JSON.parse(fs.readFileSync(path.join(v, "web", "anstoss"), "utf8")).grund, "lernplan");
  assert.ok(!fs.existsSync(path.join(v, "unterlagen", "neu", k("a") + ".md")), "keine Begleitnotiz");
  const viele = Array.from({ length: 30 }, (_, i) => Object.assign({}, geprueft[0], { kennung: String(i).padStart(64, "0") }));
  assert.throws(() => kapitelAblegen(v, viele), (e) => e.status === 429, "höchstens 30 warten");

  const lp = (l) => standPruefen({ schema: 1, lernplan: l }).stand.lernplan;
  assert.deepEqual(lp({ semester: "WS 2026/27", module: ["B110", "b110", "<x>", "B110", "E101"] }), { semester: "WS 2026/27", module: ["B110", "E101"] });
  assert.equal(lp({ semester: "Winter", module: ["B110"] }), undefined, "unbekanntes Semester: kein Feld");
  assert.equal(lp(undefined), undefined, "älteres Plugin ohne Feld");

  // Listen aus den Lernplan-Notizen: nur gefragte Module, je eines, geprüft wie das Eingang, nur nr, titel, teile; zusammen begrenzt
  const kap = [{ nr: "1", titel: "Mengen", seiten: 23, fertig: true, teile: [{ nr: "1.1", titel: "Teil", fertig: true }] }, { nr: "2", titel: "Funktionen" }];
  assert.deepEqual(lp({ semester: "WS 2026/27", module: ["S100", "E101", "B110"], listen: [
    { code: "S100", kapitel: kap }, { code: "S100", kapitel: [{ nr: "9", titel: "Doppelt" }] }, { code: "B180", kapitel: kap },
    { code: "E101", kapitel: [{ nr: "1", titel: "Mit [[Link]]" }] }, { code: "B110", kapitel: "1 Mengen" }, "S100",
  ] }), { semester: "WS 2026/27", module: ["S100", "E101", "B110"], listen: [{ code: "S100", kapitel: [{ nr: "1", titel: "Mengen", teile: [{ nr: "1.1", titel: "Teil" }] },
    { nr: "2", titel: "Funktionen" }] }] });
  const gross = Array.from({ length: 40 }, (_, i) => ({ nr: String(i + 1), titel: "t".repeat(140), teile: Array.from({ length: 10 }, (_, j) => ({ nr: `${i + 1}.${j + 1}`, titel: "u".repeat(140) })) })); // je Liste etwa 70 000 Zeichen
  const codes = ["B110", "B180", "E101", "S100", "S110"];
  const viel = lp({ semester: "WS 2026/27", module: codes, listen: codes.map((code) => ({ code, kapitel: gross })) });
  assert.ok(viel.listen.length >= 1 && viel.listen.length < codes.length && JSON.stringify(viel.listen).length <= 150000, "höchstens 150 000 Zeichen");
});

// Aus der Prüfung vom 02.11.2026
test("Installer: fertig erst nach „Prüfen“ (.installiert); Caddys Admin-Schnittstelle nur über ihren Socket; Web-Dienst ohne Caddy und CouchDB", () => {
  const skript = fs.readFileSync(path.join(SERVER, "installieren.sh"), "utf8");
  const weg = skript.indexOf('rm -f "$ZIEL/.installiert"'), umschalten = skript.indexOf('ln -sfn "$ZIEL" /opt/studium-server/aktuell');
  const pruefen = skript.indexOf('schritt "Prüfen"'), status = skript.indexOf("\nstudium-server status\n"), marke = skript.indexOf(': >"$ZIEL/.installiert"');
  assert.ok(weg > 0 && weg < umschalten, "Marke weg, bevor das Paket umschaltet");
  assert.ok(pruefen > 0 && status > pruefen && marke > status, "Marke erst nach der Prüfung");
  // ohne admin hörte Caddys Admin-Schnittstelle ohne Anmeldung auf localhost:2019, und der Web-Dienst darf mit 127.0.0.1 sprechen
  assert.match(skript, /\n# studium-server \(installieren\.sh\)[^\n]*\n\{\n\tadmin unix\/\/run\/caddy\/admin\.sock\n\}\n/);
  assert.match(skript, /caddy\.service\.d\/studium-server\.conf <<'UNIT'\n[^\n]*\n\[Service\]\nRuntimeDirectory=caddy\nRuntimeDirectoryMode=0700\nUNIT\n/);
  assert.match(skript, /if systemctl is-active --quiet caddy && \[ -S \/run\/caddy\/admin\.sock \]; then systemctl reload caddy; else systemctl restart caddy; fi/);
  const dienst = /einheit studium-server-dienst\.service <<'UNIT'\n([\s\S]*?)\nUNIT/.exec(skript)[1];
  const gesperrt = ` ${(dienst.match(/^InaccessiblePaths=.*$/gm) || []).map((z) => z.slice(18)).join(" ")} `;
  for (const p of ["/var/lib/caddy", "/run/caddy", "/opt/couchdb/etc", "/var/lib/couchdb", "/var/lib/studium"]) assert.ok(gesperrt.includes(` -${p} `), p);
});

test("Installer: ordner() setzt Rechte nur über einen Deskriptor ohne Links (O_NOFOLLOW, O_DIRECTORY); ein Link an der Stelle scheitert", () => {
  const skript = fs.readFileSync(path.join(SERVER, "installieren.sh"), "utf8");
  const funktion = /^ordner\(\) \{\n[\s\S]*?\n\}\n/m.exec(skript)[0];
  const code = /node -e '\n([\s\S]*?)\n {2}'/.exec(funktion)[1];
  assert.match(code, /c\.O_RDONLY \| c\.O_DIRECTORY \| c\.O_NOFOLLOW/);
  assert.match(code, /fchmodSync\(fd, /);
  // Wirkung (nur unter Linux/macOS: O_NOFOLLOW und Modi gibt es unter Windows so nicht)
  if (process.platform === "win32") return;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ordner-"));
  try {
    const echt = path.join(tmp, "echt"), ziel = path.join(tmp, "ziel"), link = path.join(tmp, "link");
    fs.mkdirSync(echt, { mode: 0o755 });
    fs.mkdirSync(ziel, { mode: 0o755 });
    fs.chmodSync(ziel, 0o755);
    fs.symlinkSync(ziel, link);
    assert.equal(spawnSync(process.execPath, ["-e", code, echt, "2771"]).status, 0);
    assert.equal(fs.statSync(echt).mode & 0o7777, 0o2771, "echter Ordner: Modus genau, auch setgid");
    assert.notEqual(spawnSync(process.execPath, ["-e", code, link, "0777"]).status, 0, "Link: scheitert");
    assert.equal(fs.statSync(ziel).mode & 0o7777, 0o755, "dem Ziel des Links geschah nichts");
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
