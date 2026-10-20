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
  assert.equal(codeEinloesen(v, code.toLowerCase().replace("-", " "), jetzt), true, "Schreibweise egal");
  assert.equal(codeEinloesen(v, code, jetzt), false, "nur einmal");
  const alt = neuerCode(v, { jetzt });
  assert.equal(codeEinloesen(v, alt.code, new Date("2026-10-18T10:31:00Z")), false, "abgelaufen");
  assert.equal(codeEinloesen(v, "AAAAA-AAAAA", jetzt), false);
  assert.match(link("https://beispiel.example", code), /^obsidian:\/\/studium-autopilot\?aktion=server-verbinden&adresse=https%3A%2F%2Fbeispiel\.example&code=/);
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
  assert.deepEqual(Object.keys(s), ["schema", "version", "zeit", "claude", "gmail", "weiterleitung", "uni_zugang", "speicher_reserve", "plugin_abruf", "letzter_lauf", "claude_lauf", "fehler"]);
  assert.doesNotMatch(JSON.stringify(s), /zxabc01|geheim|Passwort/);
  // claude_lauf: wartet (Anstoß da) | laeuft (seit unter einer Stunde) | ruht
  const jetzt = new Date("2026-10-18T09:00:00Z");
  assert.equal(s.claude_lauf, "ruht");
  assert.equal(oeffentlicherStatus({}, {}, "x", jetzt, true).claude_lauf, "wartet");
  assert.equal(oeffentlicherStatus({ laeuftSeit: "2026-10-18T08:30:00Z" }, {}, "x", jetzt).claude_lauf, "laeuft");
  assert.equal(oeffentlicherStatus({ laeuftSeit: "2026-10-18T07:30:00Z" }, {}, "x", jetzt).claude_lauf, "ruht", "hängt nicht für immer");
});

test("Knopf „Mails durchsuchen“: Anstoß mit Grund knopf, höchstens alle 10 Minuten, ein wartender Anstoß bleibt", async () => {
  const { knopfAnstoss } = await laden("dienst.mjs");
  const v = fs.mkdtempSync(path.join(os.tmpdir(), "studium-knopf-"));
  const t0 = new Date("2026-10-18T09:00:00Z");
  assert.deepEqual(knopfAnstoss(v, t0), [200, { angestossen: true }]);
  assert.equal(JSON.parse(fs.readFileSync(path.join(v, "anstoss"), "utf8")).grund, "knopf");
  const zuFrueh = knopfAnstoss(v, new Date(t0.getTime() + 5 * 60e3));
  assert.deepEqual(zuFrueh, [429, { fehler: "zu-frueh", wieder: "2026-10-18T09:10:00.000Z" }]);
  fs.writeFileSync(path.join(v, "anstoss"), JSON.stringify({ grund: "gmail" }));
  assert.deepEqual(knopfAnstoss(v, new Date(t0.getTime() + 11 * 60e3)), [200, { angestossen: true, wartete: true }]);
  assert.equal(JSON.parse(fs.readFileSync(path.join(v, "anstoss"), "utf8")).grund, "gmail", "wartender Anstoß bleibt");
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
  fs.rmSync(path.join(v, "anstoss"));
  unterlagenAblegen(v, [Object.assign({}, geprueft[0], { kennung: k("f") })]);
  assert.equal(JSON.parse(fs.readFileSync(path.join(v, "anstoss"), "utf8")).grund, "unterlagen");
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
    assert.ok(JSON.parse(fs.readFileSync(path.join(v, "abruf.json"), "utf8")).zuletzt);

    const stand = await verschluesseln(konfig.schluessel, "stand", { schema: 1, module: ["B110"], erledigt: ["2026-10-18-073000-termine.json"],
      takt: { uni_postfach: 60, gmail: 1 } });
    assert.equal((await fetch(`${basis}/v1/stand`, { method: "POST", headers: mit, body: JSON.stringify(stand) })).status, 204);
    assert.ok(!fs.existsSync(path.join(v, "eingang", "2026-10-18-073000-termine.json")), "übernommene Datei gelöscht");
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(v, "stand-plugin.json"), "utf8")).module, ["B110"]);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(v, "takt.json"), "utf8")), { uni_postfach: 60, gmail: 1 }, "Takt auch für abrufen.py");
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
    fs.rmSync(path.join(v, "anstoss"));
    const fremd = await verschluesseln(neuerSchluessel(), "stand", { schema: 1 });
    assert.equal((await fetch(`${basis}/v1/stand`, { method: "POST", headers: mit, body: JSON.stringify(fremd) })).status, 400);

    const { code } = neuerCode(v);
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
    assert.equal(JSON.parse(fs.readFileSync(path.join(v, "stand-plugin.json"), "utf8")).tresor.termine.length, 400);

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
  fs.writeFileSync(path.join(v, "uni-zugang-falsch"), "");
  z = await zustandAktualisieren(v, proben("abgemeldet", true));
  assert.equal(z.uniZugang, "falsch");
  assert.deepEqual(z.fehler.sort(), ["claude-abgemeldet", "gmail-fehlt", "uni-zugang-falsch"]);
  z = await zustandAktualisieren(v, proben("angemeldet", false));
  assert.equal(z.uniZugang, "fehlt");
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
  assert.equal(reserveLaeuft(v), "an", "lebende PID");
  fs.writeFileSync(path.join(v, "speicher-reserve.json"), JSON.stringify({ pid: 2 ** 22 + 12345 }));
  assert.equal(reserveLaeuft(v), "aus", "PID lebt nicht");
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
  for (const datei of ["installieren.sh", "studium-server"]) {
    const r = spawnSync("bash", ["-n", path.join(SERVER, datei)], { encoding: "utf8" });
    assert.equal(r.status, 0, `${datei}: ${r.stderr}`);
  }
});
