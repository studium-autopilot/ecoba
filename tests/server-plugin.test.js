// Eigener Server, Seite des Plugins (server.js) gegen den echten Web-Dienst aus server/ (dienst.mjs auf einem freien Port,
// Tresor im Speicher): Verbinden mit Einmal-Code, Abruf und Entschlüsseln, Termine als Notizen (herkunft: claude), Änderungen,
// Absagen, Doppel zu vorhandenen Terminen und einer id, Grabstein, Sperre zwischen Geräten, Fehler, Status und Zeile nach dem
// Quellen-Vertrag, kein „Bitte prüfen“.
// Ohne server/ (noch nicht im Release) übersprungen.
"use strict";
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

const Z = laden("zentral", { heute: "2026-10-18" }).ctx.zentral;
const S = laden("server", { heute: "2026-10-18", kontext: { zentral: Z } }).ctx.server;
const SPERRE = require(path.join(__dirname, "..", "Studium Autopilot", "System", "Skripte", "sperre.js"));
const Q = require(path.join(__dirname, "..", "Studium Autopilot", "System", "Skripte", "quellen.js"));
const OBS = { Modal: class {}, Notice: class {}, Platform: {}, Setting: class {} };
const GEHEIM_ID = "studium-autopilot-server-test";
const START = new Date("2026-10-18T10:00:00");

// ---------- Attrappen ----------
// Tresor im Speicher; Frontmatter einfach gelesen (Schlüssel: Wert, Werte in Anführungszeichen als JSON)
function tresor(dateien) {
  const m = new Map(Object.entries(dateien || {}));
  const korb = [];
  const fmLesen = (text) => {
    const k = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
    if (!k) return null;
    const fm = {};
    for (const z of k[1].split(/\r?\n/)) {
      const x = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(z);
      if (!x) continue;
      const w = x[2].trim();
      fm[x[1]] = /^".*"$/.test(w) ? JSON.parse(w) : w === "true" ? true : w === "false" ? false : w;
    }
    return fm;
  };
  return {
    m, korb,
    io: {
      lesenText: async (p) => (m.has(p) ? m.get(p) : null),
      schreibenText: async (p, t) => { m.set(p, t); },
      umbenennen: async (a, b) => { const t = m.get(a); m.delete(a); m.set(b, t); },
      papierkorb: async (p) => { korb.push(p); m.delete(p); },
      existiert: (p) => [...m.keys()].some((k) => k.toLowerCase() === p.toLowerCase()),
      begleitnotiz: (pdf) => { const md = pdf.replace(/\.pdf$/i, ".md"); return m.has(md) ? md : ""; },
      terminNotizen: () => [...m.entries()].filter(([p]) => p.endsWith(".md")).map(([pfad, t]) => ({ pfad, fm: fmLesen(t) })).filter((x) => x.fm && x.fm.typ === "termin"),
    },
    pfade: (praefix) => [...m.keys()].filter((p) => p.startsWith(praefix)).sort(),
    fm: (p) => fmLesen(m.get(p)),
    json: (p) => JSON.parse(m.get(p)),
  };
}

const netzEcht = async ({ url, method, headers, body }) => {
  const r = await fetch(url, { method, headers, body });
  return { status: r.status, text: await r.text() };
};

// standText aus verbindungen.js (eine Formulierung für alle Zeilen), mit der Uhr des Tests statt Date.now()
const standTextMit = (uhr) => laden("verbindungen", {
  kontext: { obsidian: OBS, user: { quellen: Object.assign({}, Q, { vorText: (iso) => Q.vorText(iso, new Date(uhr.t).getTime()) }) } },
}).ctx.verbindungen.standText;

// abh für server.js; o: { ja (Rückfrage), geraet, netz, geheim (Map, geteilt zwischen Läufen eines Geräts) }
function abhBauen(t, o) {
  o = o || {};
  const geheim = o.geheim || new Map();
  const lokal = o.lokal || new Map();
  const uhr = o.uhr || { t: START };
  return {
    io: t.io, netz: o.netz || netzEcht,
    geheim: { lesen: (id) => geheim.get(id) || null, schreiben: async (id, w) => { geheim.set(id, w); }, loeschen: async (id) => { geheim.delete(id); } },
    geheimId: () => GEHEIM_ID,
    lokal: (k, v) => { if (v === undefined) return lokal.has(k) ? lokal.get(k) : null; if (v == null) lokal.delete(k); else lokal.set(k, JSON.parse(JSON.stringify(v))); return v; },
    jetzt: () => new Date(uhr.t),
    geraetId: () => o.geraet || "g-pc",
    zentral: () => Z,
    stand: () => ({ module: ["B110", "E101"], studienbeginn: "2026-10-01", variante: "offen" }),
    modulLink: (code) => (code === "B110" ? "[[B110 Einführung in die BWL]]" : ""),
    bestaetigen: async (titel, text) => { (o.fragen || []).push(text); return o.ja !== false; },
    sperre: SPERRE, quellen: Q, standText: standTextMit(uhr), mobil: false,
    tresor: o.tresor || (async () => ({ termine: [], todos: [] })),
    unterlagen: o.unterlagen || (async () => []),
    lokalErlaubt: true,
    geheimMap: geheim, lokalMap: lokal, uhr,
  };
}

// Echter Web-Dienst in einem Wegwerf-Ordner; Eingang-Dateien über eingang.mjs wie nach einem Claude-Lauf
async function serverStarten() {
  const { erzeugeDienst } = await modul("dienst.mjs");
  const { neuerCode } = await modul("verbinden.mjs");
  const { neuerSchluessel } = await modul("kanal.mjs");
  const { eingangNormal } = await modul("eingang.mjs");
  const verzeichnis = fs.mkdtempSync(path.join(os.tmpdir(), "studium-plugin-"));
  const konfig = { zugang: neuerSchluessel(), schluessel: neuerSchluessel(), adresse: "", version: "0.0.0-test" };
  const dienst = erzeugeDienst({ konfig, verzeichnis });
  await new Promise((fertig) => dienst.listen(0, "127.0.0.1", fertig));
  konfig.adresse = `http://127.0.0.1:${dienst.address().port}`;
  fs.writeFileSync(path.join(verzeichnis, "zustand.json"), JSON.stringify({ claude: "angemeldet", gmail: "ok", uniZugang: "gespeichert", letzterLauf: { zeit: "2026-10-18T07:30:00Z", ok: true } }));
  let nr = 0;
  return {
    verzeichnis, konfig,
    code: () => neuerCode(verzeichnis).code,
    zustand: (z) => fs.writeFileSync(path.join(verzeichnis, "zustand.json"), JSON.stringify(z)),
    eingang: (roh) => {
      const { eingang } = eingangNormal(roh, { jetzt: new Date("2026-10-18T07:30:00Z"), lauf: "test" });
      const name = `20261018-0730${String(nr++).padStart(2, "0")}-lauf.json`;
      fs.mkdirSync(path.join(verzeichnis, "eingang"), { recursive: true });
      fs.writeFileSync(path.join(verzeichnis, "eingang", name), JSON.stringify(eingang));
      return name;
    },
    eingangRoh: (name, inhalt) => {
      fs.mkdirSync(path.join(verzeichnis, "eingang"), { recursive: true });
      fs.writeFileSync(path.join(verzeichnis, "eingang", name), JSON.stringify(inhalt));
    },
    imEingang: () => (fs.existsSync(path.join(verzeichnis, "eingang")) ? fs.readdirSync(path.join(verzeichnis, "eingang")) : []),
    stand: () => JSON.parse(fs.readFileSync(path.join(verzeichnis, "stand-plugin.json"), "utf8")),
    zu: () => new Promise((fertig) => dienst.close(fertig)),
  };
}

const termin = (x) => Object.assign({ schluessel: "uni-postfach:9#1", titel: "B110 Anmeldung Tutorium", datum: "2026-10-27", uhrzeit: "10:00", ort: "ILIAS",
  kategorie: "Frist", status: "offiziell", code: "B110", quelle_text: "Mail des Lehrstuhls, 17.10.2026", info: "Anmeldung über ILIAS." }, x);
const blatt = termin({ schluessel: "ilias-kalender:u2", titel: "Abgabe Übungsblatt 2", datum: "2026-11-03", uhrzeit: "", ort: "", code: "", quelle_text: "ILIAS-Kalender", info: "" });

// verbundenes Gerät (Tresor, abh, Ablauf)
async function verbunden(srv, t, o) {
  const a = abhBauen(t || tresor(), o);
  const m = S.erzeugen(a);
  const r = await m.verbinden(srv.konfig.adresse, srv.code());
  assert.equal(r.ok, true, r.fehler);
  return { t: t || null, a, m };
}

// ---------- Tests ----------
test("Verbinden: Rückfrage, Einmal-Code gegen Schlüssel, Code danach verbraucht; falsche Links und Antworten abgelehnt", async () => {
  const srv = await serverStarten();
  try {
    const t = tresor();
    const nein = S.erzeugen(abhBauen(t, { ja: false }));
    assert.deepEqual(await nein.verbinden(srv.konfig.adresse, srv.code()), { ok: false, abgebrochen: true });
    const a = abhBauen(t), m = S.erzeugen(a);
    for (const [adresse, code] of [["http://beispiel.example", "ABCDE-FGHJK"], ["https://beispiel.example/pfad", "ABCDE-FGHJK"],
      ["https://nutzer:" + "pw" + "@" + "beispiel.example", "ABCDE-FGHJK"], [srv.konfig.adresse, "kurz"], [srv.konfig.adresse, "ABCDE-FGHJ0"]]) {
      assert.match((await m.verbinden(adresse, code)).fehler, /unvollständig/, adresse + " " + code);
    }
    assert.match((await m.verbinden(srv.konfig.adresse, "ABCDE-FGHJK")).fehler, /gilt nicht mehr/, "unbekannter Code");
    // Link nennt eine andere Adresse als der Server selbst
    assert.match((await m.verbinden(srv.konfig.adresse.replace("127.0.0.1", "localhost"), srv.code())).fehler, /passt nicht/);
    assert.equal(a.geheimMap.size, 0, "nichts gespeichert");
    const code = srv.code();
    const r = await m.verbinden(srv.konfig.adresse, code.toLowerCase());
    assert.equal(r.ok, true, r.fehler);
    assert.deepEqual(JSON.parse(a.geheimMap.get(GEHEIM_ID)), { adresse: srv.konfig.adresse, zugang: srv.konfig.zugang, schluessel: srv.konfig.schluessel });
    assert.equal(m.verbunden(), true);
    assert.match((await S.erzeugen(abhBauen(tresor())).verbinden(srv.konfig.adresse, code)).fehler, /gilt nicht mehr/, "Code nur einmal");
    // Link zu einer anderen Adresse: die Rückfrage nennt, welche Verbindung ersetzt wird
    const fragen = [];
    const mitFrage = S.erzeugen(Object.assign(abhBauen(tresor(), { fragen, geheim: a.geheimMap }), {}));
    await mitFrage.verbinden(srv.konfig.adresse.replace("127.0.0.1", "localhost"), "ABCDE-FGHJK");
    assert.match(fragen[0], /Die Verbindung zu 127\.0\.0\.1:\d+ wird dabei ersetzt\./);
    await m.trennen();
    assert.equal(m.verbunden(), false);
    assert.deepEqual(await m.abrufen(), { art: "nicht-verbunden" });
  } finally { await srv.zu(); }
});

test("Abruf: Termine als Notizen mit herkunft claude, Hinweise, Stand zurück, Server räumt auf; zweiter Abruf ändert nichts", async () => {
  const srv = await serverStarten();
  try {
    const name = srv.eingang({ quellen: ["uni-postfach"], termine: [termin(), blatt], hinweise: [{ text: "Neue Folien in E101.", quelle: "Kursmail, 17.10.2026" }] });
    const t = tresor();
    const { m } = await verbunden(srv, t);
    const b = await m.abrufen();
    assert.equal(b.art, "ok", b.fehler);
    assert.deepEqual(b.angelegt, ["Termine/2026-10-27 B110 Anmeldung Tutorium.md", "Termine/2026-11-03 Abgabe Übungsblatt 2.md"]);
    assert.equal(b.hinweise, 1);
    const p = "Termine/2026-10-27 B110 Anmeldung Tutorium.md";
    const fm = t.fm(p);
    assert.equal(fm.herkunft, "claude");
    assert.match(fm.claude_id, /^c-[0-9a-f]{20}$/);
    assert.equal(fm.zentral_id, undefined, "keine zentrale id");
    assert.equal(fm.modul, "[[B110 Einführung in die BWL]]");
    assert.equal(fm.quelle, "Mail des Lehrstuhls, 17.10.2026");
    assert.equal(fm.erledigt, false);
    assert.match(t.m.get(p), /^## Meine Notizen$/m);
    const z = t.json("System/Daten/server.json");
    assert.deepEqual(Object.keys(z.erledigt), [name]);
    assert.deepEqual(z.hinweise.map((h) => h.text), ["Neue Folien in E101."]);
    assert.equal(t.json("System/Daten/server-abruf.json").geraet, "g-pc", "gemeinsame Sperre");
    assert.deepEqual(srv.imEingang(), [], "übernommene Datei auf dem Server gelöscht");
    assert.deepEqual(srv.stand(), { schema: 1, module: ["B110", "E101"], studienbeginn: "2026-10-01", variante: "offen", takt: { uni_postfach: 15, gmail: 3 },
      tresor: { termine: [], todos: [] } });
    const vorher = new Map(t.m);
    const b2 = await m.abrufen();
    assert.equal(b2.art, "ok");
    assert.deepEqual([b2.angelegt, b2.aktualisiert, b2.hinweise], [[], [], 0]);
    assert.deepEqual(t.m, vorher, "nichts neu geschrieben");
  } finally { await srv.zu(); }
});

test("Auszug aus dem Tresor: Termine und To-dos gehen mit, nur geprüfte Felder, nie Zugangsdaten; Änderung wird neu gesendet", async () => {
  const srv = await serverStarten();
  try {
    let tresor = {
      termine: [{ titel: "Eigener Termin", datum: "2026-10-30", bis: "", kategorie: "Lehre", code: "B110", herkunft: "", erledigt: false, geheim: "x" },
        { titel: "Ohne Datum" }],
      todos: [{ text: "Blatt 3 abgeben", code: "E101", frist: "2026-11-02", pfad: "Übungsblätter/E101 Blatt 03.md", id: "t-abc", aenderbar: false, nr: 7,
        roh: "- [ ] Blatt 3 abgeben (bis 02.11.)" }, { text: "ILIAS-Passwort neu setzen" }],
    };
    const { m } = await verbunden(srv, undefined, { tresor: async () => tresor });
    assert.equal((await m.abrufen()).art, "ok");
    assert.deepEqual(srv.stand().tresor, {
      termine: [{ titel: "Eigener Termin", datum: "2026-10-30", bis: "", kategorie: "Lehre", code: "B110", herkunft: "", erledigt: false }],
      todos: [{ text: "Blatt 3 abgeben", code: "E101", frist: "2026-11-02", id: "t-abc", pfad: "Übungsblätter/E101 Blatt 03.md" }],
    }, "Kennung und Notiz gehen mit, Zeile und Zeilennummer nicht");
    tresor = { termine: [], todos: [{ text: "Folien 2 lesen", code: "B110", frist: "" }] };
    await m.abrufen();
    assert.deepEqual(srv.stand().tresor.todos, [{ text: "Folien 2 lesen", code: "B110", frist: "" }], "geänderter Auszug geht gleich mit");
  } finally { await srv.zu(); }
});

// To-dos im Tresor wie tresorObs: offene Aufgaben mit Kennung aus Notiz und Zeile, aenderbar unter „Zu tun“ einer Begleitnotiz
const todosAus = (t) => {
  const aus = [];
  for (const [pfad, text] of t.m) {
    if (!pfad.endsWith(".md")) continue;
    const fm = t.fm(pfad) || {};
    let ueber = "";
    text.split("\n").forEach((roh, nr) => {
      const h = /^#{1,6} (.*)$/.exec(roh);
      if (h) { ueber = h[1]; return; }
      const a = /^([\s>]*[-*+] )\[ \] +(\S.*)$/.exec(roh);
      if (a) aus.push({ text: a[2], code: "B110", frist: "", id: "t-" + Q.kurzHash(pfad + "\n" + roh), pfad, aenderbar: fm.typ === "unterlage" && /^Zu tun\b/.test(ueber), nr, roh });
    });
  }
  return { termine: [], todos: aus };
};

test("Doppelte To-dos: aus „weg“ wird ein Punkt mit Link auf „behalten“; nur unter „Zu tun“ einer Begleitnotiz, nur unverändert, nie abgehakt", async () => {
  const srv = await serverStarten();
  try {
    const faq = "Unterlagen/B110 Einführung/B110 Sonstiges FAQ.md", folien = "Unterlagen/B110 Einführung/B110 Folien 01.md";
    const vorlesung = "Vorlesungen/B110/2026-10-14 B110 VL 01.md";
    const t = tresor({
      [faq]: "---\ntyp: unterlage\n---\n\n# FAQ\n\n## Zu tun\n- [ ] Für das Tutorium in ILIAS anmelden (bis 27.10.)\n",
      [folien]: "---\ntyp: unterlage\n---\n\n# Folien 01\n\n## Das Wichtigste\n- Kosten\n\n## Zu tun\n- [ ] Tutorium B110 anmelden → [[B110 Folien 01.pdf#page=3|S. 3]]\n- [ ] Blatt 1 rechnen\n",
      [vorlesung]: "---\ntyp: vorlesung\n---\n\n# Vorlesung 1\n\n## Nacharbeit\n- [ ] Im Tutorium anmelden\n",
    });
    let stand = todosAus(t);
    const id = (pfad, anfang) => stand.todos.find((x) => x.pfad === pfad && x.roh.indexOf(anfang) >= 0).id;
    const { m } = await verbunden(srv, t, { tresor: async () => stand });
    const A = id(faq, "- [ ] Für"), B = id(folien, "- [ ] Tutorium"), V = id(vorlesung, "- [ ] Im"), BL = id(folien, "- [ ] Blatt");
    srv.eingang({ termine: [], todo_doppel: [{ behalten: A, weg: V }, { behalten: A, weg: B }] });
    const b = await m.abrufen({ manuell: true });
    assert.equal(b.art, "ok", b.fehler);
    assert.deepEqual(b.todoDoppel, [folien], "nur die Begleitnotiz, nicht die Vorlesungsnotiz");
    assert.match(t.m.get(folien), /\n- Tutorium B110 anmelden → \[\[B110 Folien 01\.pdf#page=3\|S\. 3\]\] – steht schon in \[\[Unterlagen\/B110 Einführung\/B110 Sonstiges FAQ\|B110 Sonstiges FAQ\]\]\n- \[ \] Blatt 1 rechnen\n$/);
    assert.match(t.m.get(faq), /- \[ \] Für das Tutorium in ILIAS anmelden \(bis 27\.10\.\)/, "behalten bleibt offen");
    assert.match(t.m.get(vorlesung), /- \[ \] Im Tutorium anmelden/, "fremde Notiz unberührt");
    assert.doesNotMatch([...t.m.values()].join("\n"), /\[x\]/, "nie abgehakt");
    assert.equal(t.json("System/Daten/server.json").laeufe.slice(-1)[0].todos, 1);
    // geänderte Zeile (Sync, Hand) oder Kette: nichts
    stand = todosAus(t);
    const C = id(folien, "- [ ] Blatt");
    assert.equal(C, BL, "Kennung bleibt, solange die Zeile gleich ist");
    t.m.set(folien, t.m.get(folien).replace("- [ ] Blatt 1 rechnen", "- [ ] Blatt 1 rechnen und abgeben"));
    srv.eingang({ termine: [], todo_doppel: [{ behalten: A, weg: C }] });
    const vorher = t.m.get(folien);
    assert.deepEqual((await m.abrufen()).todoDoppel, [], "Zeile hat sich geändert");
    assert.equal(t.m.get(folien), vorher);
  } finally { await srv.zu(); }
});

test("Takt: aus den Einstellungen mit dem Stand an den Server (takt.json), eine Änderung geht gleich mit; fremde Werte → Standard", async () => {
  assert.deepEqual(S.taktAus({}), { uni_postfach: 15, gmail: 3 });
  assert.deepEqual(S.taktAus({ server_uni_postfach: "60", server_gmail: 0 }), { uni_postfach: 60, gmail: 0 });
  assert.deepEqual(S.taktAus({ server_uni_postfach: 5, server_gmail: null }), { uni_postfach: 15, gmail: 3 }, "leeres Feld ist nicht „nie“");
  assert.deepEqual(S.taktAus({ server_uni_postfach: "", server_gmail: "oft" }), { uni_postfach: 15, gmail: 3 });
  const srv = await serverStarten();
  try {
    const { a, m } = await verbunden(srv, tresor());
    const takt = { uni_postfach: 30, gmail: 1 };
    a.stand = () => ({ module: ["B110"], studienbeginn: "2026-10-01", variante: "offen", takt });
    const amServer = () => JSON.parse(fs.readFileSync(path.join(srv.verzeichnis, "takt.json"), "utf8"));
    assert.equal((await m.abrufen()).art, "ok");
    assert.deepEqual(amServer(), { uni_postfach: 30, gmail: 1 });
    assert.deepEqual(srv.stand().takt, { uni_postfach: 30, gmail: 1 });
    takt.gmail = 0;
    assert.equal((await m.abrufen()).art, "ok");
    assert.deepEqual(amServer(), { uni_postfach: 30, gmail: 0 }, "Änderung gleich beim nächsten Abruf, nicht erst nach 6 Stunden");
  } finally { await srv.zu(); }
});

test("Änderung: neues Datum benennt um, erledigt und Meine Notizen bleiben; Absage markiert; gelöscht bleibt gelöscht", async () => {
  const srv = await serverStarten();
  try {
    srv.eingang({ termine: [termin(), blatt] });
    const t = tresor();
    const { m } = await verbunden(srv, t);
    await m.abrufen();
    const p = "Termine/2026-10-27 B110 Anmeldung Tutorium.md";
    t.m.set(p, t.m.get(p).replace("erledigt: false", "erledigt: true") + "Gruppe 3 nehmen.\n");
    srv.eingang({ termine: [termin({ datum: "2026-10-28", info: "Neue Frist." }), Object.assign({}, blatt, { entfaellt: true })] });
    const b = await m.abrufen();
    assert.deepEqual(b.umbenannt, [p + " → Termine/2026-10-28 B110 Anmeldung Tutorium.md"]);
    const neu = t.m.get("Termine/2026-10-28 B110 Anmeldung Tutorium.md");
    assert.match(neu, /^erledigt: true$/m);
    assert.match(neu, /^datum: 2026-10-28$/m);
    assert.match(neu, /Gruppe 3 nehmen\./);
    assert.equal((neu.match(/^claude_id:/gm) || []).length, 1, "claude_id genau einmal");
    const abgesagt = t.m.get("Termine/2026-11-03 Abgabe Übungsblatt 2.md");
    assert.match(abgesagt, /^titel: "Abgabe Übungsblatt 2 \(entfällt\)"$/m);
    assert.match(abgesagt, /Laut deinem Server entfällt dieser Termin/);
    assert.deepEqual(b.entfaellt, ["Termine/2026-11-03 Abgabe Übungsblatt 2.md"]);
    // gelöscht: kommt mit gleichem Inhalt nicht zurück, nach einer Änderung schon
    t.m.delete("Termine/2026-10-28 B110 Anmeldung Tutorium.md");
    srv.eingang({ termine: [termin({ datum: "2026-10-28", info: "Neue Frist." })] });
    const b2 = await m.abrufen();
    assert.deepEqual([b2.angelegt.length, b2.ausgeblendet], [0, 1]);
    const id = t.fm("Termine/2026-11-03 Abgabe Übungsblatt 2.md").claude_id;
    assert.ok(t.json("System/Daten/server-abruf.json").angewendet[id], "Grabstein in der Sperr-Datei");
    assert.equal(t.json("System/Daten/server-abruf.json").geraet, "g-pc", "Sperrfelder bleiben");
    assert.equal(t.json("System/Daten/server.json").angewendet, undefined, "nicht in server.json");
    srv.eingang({ termine: [termin({ datum: "2026-10-29" })] });
    assert.deepEqual((await m.abrufen()).angelegt, ["Termine/2026-10-29 B110 Anmeldung Tutorium.md"]);
  } finally { await srv.zu(); }
});

test("Doppel: zentraler oder eigener Termin am selben Tag mit ähnlichem Titel → keine zweite Notiz; anderes Blatt zählt nicht", async () => {
  const srv = await serverStarten();
  try {
    const t = tresor({
      "Termine/2026-11-03 Bewerbungsfrist Deutschlandstipendium.md": "---\ntyp: termin\ntitel: \"Bewerbungsfrist Deutschlandstipendium\"\ndatum: 2026-11-03\nherkunft: zentral\nzentral_id: x\n---\n",
      "Termine/2026-11-10 Abgabe Übungsblatt 2.md": "---\ntyp: termin\ndatum: 2026-11-10\n---\n",
    });
    srv.eingang({ termine: [
      termin({ schluessel: "gmail:a#1", titel: "Deutschlandstipendium: Bewerbungsfrist", datum: "2026-11-02", code: "" }),
      termin({ schluessel: "gmail:a#2", titel: "Abgabe Übungsblatt 3", datum: "2026-11-10", code: "" }),
      termin({ schluessel: "gmail:a#3", titel: "Abgabe Übungsblatt 2", datum: "2026-11-11", code: "" }),
    ] });
    const { m } = await verbunden(srv, t);
    const b = await m.abrufen();
    assert.deepEqual(b.doppelt.map((d) => d.zu), ["Termine/2026-11-03 Bewerbungsfrist Deutschlandstipendium.md", "Termine/2026-11-10 Abgabe Übungsblatt 2.md"]);
    assert.deepEqual(b.angelegt, ["Termine/2026-11-10 Abgabe Übungsblatt 3.md"]);
    assert.equal(t.json("System/Daten/server.json").laeufe[0].doppelt, 2);
  } finally { await srv.zu(); }
});

test("Später auch zentral: unberührte Notiz vom Server weicht der zentralen, angefasste bleibt; kein neues Doppel", async () => {
  const srv = await serverStarten();
  try {
    const info = termin({ schluessel: "uni-postfach:12#1", titel: "Infoveranstaltung Auslandssemester", datum: "2026-11-04", code: "", kategorie: "Veranstaltung" });
    srv.eingang({ termine: [info, termin()] });
    const t = tresor();
    const { m } = await verbunden(srv, t);
    await m.abrufen();
    const tut = "Termine/2026-10-27 B110 Anmeldung Tutorium.md";
    t.m.set(tut, t.m.get(tut).replace("erledigt: false", "erledigt: true"));
    const zentral = (datum, titel) => `---\ntyp: termin\ntitel: "${titel}"\ndatum: ${datum}\nherkunft: zentral\nzentral_id: z\n---\n`;
    t.m.set("Termine/2026-11-04 Infoveranstaltung zum Auslandssemester.md", zentral("2026-11-04", "Infoveranstaltung zum Auslandssemester"));
    t.m.set("Termine/2026-10-27 Anmeldung Tutorien B110.md", zentral("2026-10-27", "Anmeldung Tutorien B110"));
    const b = await m.abrufen();
    assert.deepEqual(b.zusammengefuehrt.map((x) => x.pfad), ["Termine/2026-11-04 Infoveranstaltung Auslandssemester.md"]);
    assert.deepEqual(t.korb, ["Termine/2026-11-04 Infoveranstaltung Auslandssemester.md"], "Papierkorb, nicht gelöscht");
    assert.ok(t.m.has(tut), "erledigt: bleibt");
    srv.eingang({ termine: [Object.assign({}, info, { uhrzeit: "18:00" })] });
    const b2 = await m.abrufen();
    assert.deepEqual([b2.angelegt.length, b2.doppelt.length], [0, 1], "Änderung legt kein Doppel an");
  } finally { await srv.zu(); }
});

test("Doppel einer id (Sync-Verzug): kürzester Name bleibt, erledigt und eigene Zeilen kommen dazu, die Kopie in den Papierkorb", async () => {
  const srv = await serverStarten();
  try {
    srv.eingang({ termine: [termin()] });
    const t = tresor();
    const { m } = await verbunden(srv, t);
    await m.abrufen();
    const p = "Termine/2026-10-27 B110 Anmeldung Tutorium.md", kopie = "Termine/2026-10-27 B110 Anmeldung Tutorium 1.md";
    t.m.set(kopie, t.m.get(p).replace("erledigt: false", "erledigt: true") + "Raum steht in ILIAS.\n");
    srv.eingang({ termine: [termin({ uhrzeit: "11:00" })] });
    const b = await m.abrufen();
    assert.deepEqual(b.zusammengefuehrt, [{ pfad: kopie, zu: p }]);
    assert.deepEqual(t.korb, [kopie]);
    const text = t.m.get(p);
    assert.match(text, /^erledigt: true$/m);
    assert.match(text, /Raum steht in ILIAS\./);
    assert.match(text, /^ort: "11:00 · ILIAS"$/m, "Änderung landet in der verbliebenen Notiz");
    assert.deepEqual(b.angelegt, []);
  } finally { await srv.zu(); }
});

test("Begleitnotiz ergänzen: neue Notiz bekommt Abschnitte über dem PDF-Kasten, Platzhalter werden ersetzt, dein Text bleibt, zweimal ändert nichts", () => {
  const kopf = "---\ntyp: unterlage\ncode: \"B110\"\nart: Folien\n---\n\n# B110 · Folien 02 · Kosten\n\n> [!eba-regel] Eckdaten\n> B110 · Folien\n\n";
  const pdf = "> [!eba-pdf]- PDF (42 Seiten)\n> ![[B110 Folien 02 Kosten.pdf#height=560]]\n";
  const bn = { wichtigste: [{ text: "Deckungsbeitrag: Erlös minus variable Kosten.", seite: 7 }, { text: "Fixkosten zählen kurzfristig nicht." }],
    zu_tun: [{ text: "Aufgabe 2.3 vorbereiten", frist: "2026-10-29" }], fragen: [{ text: "Warum zählen fixe Kosten nicht?" }] };
  const name = "B110 Folien 02 Kosten.pdf";
  const neu = S.begleitnotizErgaenzen(kopf + pdf, bn, name);
  assert.equal(neu, kopf +
    "## Das Wichtigste\n- Deckungsbeitrag: Erlös minus variable Kosten. ([[B110 Folien 02 Kosten.pdf#page=7|S. 7]])\n- Fixkosten zählen kurzfristig nicht.\n\n" +
    "## Zu tun\n- [ ] Aufgabe 2.3 vorbereiten (bis 29.10.)\n\n## Offene Fragen\n- [ ] Warum zählen fixe Kosten nicht?\n\n" + pdf);
  assert.equal(S.begleitnotizErgaenzen(neu, bn, name), null, "zweimal dasselbe: keine Änderung");
  // ältere Notiz mit leeren Platzhaltern
  const alt = kopf + "## Das Wichtigste\n- \n\n## Offene Fragen\n- [ ] \n\n" + pdf;
  const alt2 = S.begleitnotizErgaenzen(alt, bn, name);
  assert.ok(!/^- \s*$|^- \[ \] \s*$/m.test(alt2), "keine leeren Punkte mehr");
  assert.ok(alt2.indexOf("## Das Wichtigste") < alt2.indexOf("## Zu tun") && alt2.indexOf("## Zu tun") < alt2.indexOf("## Offene Fragen") &&
    alt2.indexOf("## Offene Fragen") < alt2.indexOf("> [!eba-pdf]"), "Reihenfolge, alles über dem PDF-Kasten");
  // eigener Text: „Das Wichtigste“ bleibt, bei den Fragen nur, was fehlt
  const eigen = kopf + "## Das Wichtigste\n- Mein eigener Punkt\n\n## Offene Fragen\n- [ ] Warum zählen fixe Kosten nicht?\n- [ ] Meine Frage?\n\n" + pdf;
  const eigen2 = S.begleitnotizErgaenzen(eigen, bn, name);
  assert.match(eigen2, /## Das Wichtigste\n- Mein eigener Punkt\n\n## Zu tun\n- \[ \] Aufgabe 2\.3 vorbereiten \(bis 29\.10\.\)\n\n## Offene Fragen\n- \[ \] Warum zählen fixe Kosten nicht\?\n- \[ \] Meine Frage\?\n\n> \[!eba-pdf\]/);
  assert.ok(!eigen2.includes("Deckungsbeitrag"), "dein „Das Wichtigste“ bleibt, wie es ist");
  // ohne PDF-Kasten: ans Ende
  assert.match(S.begleitnotizErgaenzen(kopf, { wichtigste: [{ text: "A" }] }, name), /# B110 · Folien 02 · Kosten\n\n> \[!eba-regel\] Eckdaten\n> B110 · Folien\n\n## Das Wichtigste\n- A\n/);
});

test("Textfassung → Text mit Seitenmarken für den Server", () => {
  const roh = "---\ntyp: volltext\nquelle: \"Unterlagen/B110/x.pdf\"\n---\n\n# x · Volltext\n\nAutomatisch erzeugt, nicht bearbeiten. PDF: [[x.pdf]]\n\n" +
    "> [!eba-quelle]- [[x.pdf#page=1|S. 1]]\n> Kosten und Erlöse\n> zweite Zeile\n\n> [!eba-quelle]- [[x.pdf#page=2|S. 2]]\n> Deckungsbeitrag\n";
  assert.equal(S.volltextText(roh), "[S. 1]\nKosten und Erlöse\nzweite Zeile\n\n[S. 2]\nDeckungsbeitrag");
});

test("Begleitnotizen vom Server: Übernahme in die Notiz neben der PDF, gleiche Lieferung nie zweimal; Textfassungen bis 9 je Abruf in Anfragen zu 3, jede einmal", async () => {
  const srv = await serverStarten();
  try {
    const notiz = "Unterlagen/B110 Einführung/B110 Folien 02 Kosten.md", pdf = "Unterlagen/B110 Einführung/B110 Folien 02 Kosten.pdf";
    const t = tresor({ [notiz]: "---\ntyp: unterlage\nart: Folien\n---\n\n# B110 · Folien 02 · Kosten\n\n> [!eba-pdf]- PDF\n> ![[B110 Folien 02 Kosten.pdf]]\n" });
    const k = (c) => c.repeat(64);
    const unterlagen = [
      { datei: pdf, kennung: k("a"), art: "Folien", titel: "B110 Folien 02 Kosten", code: "B110", seiten: 42, text: "[S. 1]\nKosten" },
      { datei: "Unterlagen/B110 Einführung/B110 Skript.pdf", kennung: k("b"), art: "Skript", titel: "Skript", code: "B110", seiten: 80, text: "[S. 1]\nSkript" },
      { datei: "Unterlagen/B110 Einführung/B110 Mitschrift.pdf", kennung: k("c"), art: "Mitschrift", titel: "Mitschrift", code: "B110", text: "privat" },
      { datei: "Unterlagen/B110 Einführung/B110 Übung 01.pdf", kennung: k("d"), art: "Übung", titel: "Übung 01", code: "B110", text: "[S. 1]\nAufgabe" },
      { datei: "Unterlagen/B110 Einführung/B110 Lösung 01.pdf", kennung: k("e"), art: "Lösung", titel: "Lösung 01", code: "B110", text: "[S. 1]\nLösung" },
    ];
    const aufrufe = [];
    const { m } = await verbunden(srv, t, { unterlagen: async (o) => { aufrufe.push(JSON.parse(JSON.stringify(o))); return unterlagen; } });
    const b1 = await m.abrufen();
    assert.equal(b1.unterlagen, 4, "alle in einem Abruf (zwei Anfragen), keine Mitschrift");
    const warten = () => fs.readdirSync(path.join(srv.verzeichnis, "unterlagen", "neu")).sort();
    assert.deepEqual(warten(), [k("a"), k("b"), k("d"), k("e")].map((x) => x + ".md"));
    assert.deepEqual(Object.keys(t.json("System/Daten/server.json").gesendet).sort(), [k("a"), k("b"), k("d"), k("e")]);
    assert.equal((await m.abrufen()).unterlagen, 0, "jede PDF nur einmal");
    assert.deepEqual([aufrufe[0].hoechstens, Object.keys(aufrufe[1].ohne).sort()], [9, [k("a"), k("b"), k("d"), k("e")]], "Gesendetes gar nicht erst lesen");

    srv.eingang({ begleitnotizen: [{ datei: pdf, wichtigste: [{ text: "Deckungsbeitrag: Erlös minus variable Kosten.", seite: 7 }], fragen: [{ text: "Wozu fixe Kosten?" }] },
      { datei: "Unterlagen/B110 Einführung/Gelöscht.pdf", wichtigste: [{ text: "x" }] }] });
    const b2 = await m.abrufen();
    assert.deepEqual(b2.begleitnotizen, [notiz]);
    const text = t.m.get(notiz);
    assert.match(text, /## Das Wichtigste\n- Deckungsbeitrag: Erlös minus variable Kosten\. \(\[\[B110 Folien 02 Kosten\.pdf#page=7\|S\. 7\]\]\)\n\n## Offene Fragen\n- \[ \] Wozu fixe Kosten\?\n\n> \[!eba-pdf\]/);
    assert.ok(!t.pfade("Unterlagen/").some((p) => p.includes("Gelöscht")), "fehlt die Notiz, entsteht keine");
    // dieselbe Lieferung noch einmal (z. B. nach einem Fehler auf dem Server): nichts doppelt
    srv.eingang({ begleitnotizen: [{ datei: pdf, wichtigste: [{ text: "Deckungsbeitrag: Erlös minus variable Kosten.", seite: 7 }], fragen: [{ text: "Wozu fixe Kosten?" }] }] });
    const b3 = await m.abrufen();
    assert.deepEqual([b3.begleitnotizen, t.m.get(notiz)], [[], text]);
  } finally { await srv.zu(); }
});

test("Zusammenfassen auf Wunsch: gewünschte Unterlage geht mit Opus in den eigenen Ordner, wieder nach neuem Wunsch; die Begleitnotiz löscht den Wunsch", async () => {
  const srv = await serverStarten();
  try {
    const notiz = "Unterlagen/B110 Einführung/B110 Folien 03 Erlöse.md", pdf = "Unterlagen/B110 Einführung/B110 Folien 03 Erlöse.pdf";
    const t = tresor({ [notiz]: "---\ntyp: unterlage\nart: Folien\nzusammenfassung_angefordert: 2026-10-20T17:50Z\n---\n\n# B110 · Folien 03\n\n> [!eba-pdf]- PDF\n> ![[B110 Folien 03 Erlöse.pdf]]\n" });
    const k = "f".repeat(64);
    let wunsch = "2099-01-01T00:00"; // Uhr dieses Geräts geht nach: trotzdem nur einmal
    const { m } = await verbunden(srv, t, { unterlagen: async () => [{ datei: pdf, kennung: k, art: "Folien", titel: "Folien 03", code: "B110", seiten: 12, angefordert: wunsch, text: "[S. 1]\nErlöse" }] });
    assert.equal((await m.abrufen()).unterlagen, 1);
    assert.ok(fs.existsSync(path.join(srv.verzeichnis, "unterlagen", "opus", k + ".md")), "mit Opus");
    assert.equal((await m.abrufen()).unterlagen, 0, "derselbe Wunsch nur einmal");
    wunsch = "2099-01-02T00:00"; // später noch einmal gewünscht (z. B. hat es auf dem Server nicht geklappt)
    assert.equal((await m.abrufen()).unterlagen, 1, "neuer Wunsch geht wieder");

    srv.eingang({ begleitnotizen: [{ datei: pdf, wichtigste: [{ text: "Erlös: Menge mal Preis.", seite: 3 }] }] });
    assert.deepEqual((await m.abrufen()).begleitnotizen, [notiz]);
    const text = t.m.get(notiz);
    assert.ok(!text.includes("zusammenfassung_angefordert"), "Wunsch erledigt");
    assert.match(text, /^---\ntyp: unterlage\nart: Folien\n---\n/);
    assert.match(text, /## Das Wichtigste\n- Erlös: Menge mal Preis\./);
  } finally { await srv.zu(); }
});

test("Textfassungen: sagt der Server „zu viele warten“, kommt der Rest beim nächsten Abruf; nichts geht doppelt", async () => {
  const srv = await serverStarten();
  try {
    const k = (c) => c.repeat(64);
    const neu = path.join(srv.verzeichnis, "unterlagen", "neu");
    fs.mkdirSync(neu, { recursive: true });
    for (let i = 0; i < 27; i++) fs.writeFileSync(path.join(neu, String(i).padStart(64, "0") + ".md"), "# alt\n");
    const unterlagen = ["a", "b", "c", "d"].map((c, i) => ({ datei: `Unterlagen/B110 Einführung/B110 Folien 0${i + 1}.pdf`, kennung: k(c), art: "Folien",
      titel: `Folien 0${i + 1}`, code: "B110", seiten: 10, text: "[S. 1]\nKosten" }));
    const t = tresor();
    const { m } = await verbunden(srv, t, { unterlagen: async () => unterlagen });
    assert.equal((await m.abrufen()).unterlagen, 3, "erste Anfrage geht durch, die zweite nicht (30 warten)");
    assert.deepEqual(Object.keys(t.json("System/Daten/server.json").gesendet).sort(), [k("a"), k("b"), k("c")]);
    for (let i = 0; i < 5; i++) fs.rmSync(path.join(neu, String(i).padStart(64, "0") + ".md")); // Claude hat gearbeitet
    assert.equal((await m.abrufen()).unterlagen, 1, "der Rest");
    assert.ok(fs.existsSync(path.join(neu, k("d") + ".md")));
  } finally { await srv.zu(); }
});

test("Mails durchsuchen: Anstoß auf dem Server, die Zeile zeigt den Lauf, ein zweiter Tipp gleich danach ist zu früh", async () => {
  const srv = await serverStarten();
  try {
    const { m } = await verbunden(srv, tresor());
    assert.deepEqual(await m.anstossen(), { ok: true });
    assert.equal(JSON.parse(fs.readFileSync(path.join(srv.verzeichnis, "anstoss"), "utf8")).grund, "knopf");
    assert.equal(m.zeile().text, "Claude durchsucht gerade deine Mails auf deinem Server …");
    assert.equal(m.zeile().symbol, "uhr");
    const r = await m.anstossen();
    assert.equal(r.fehler, "zu-frueh");
    assert.ok(!isNaN(Date.parse(r.wieder)), "mit Zeitpunkt");
    fs.rmSync(path.join(srv.verzeichnis, "anstoss"));
    srv.zustand({ claude: "angemeldet", letzterLauf: { zeit: "2026-10-18T07:30:00Z", ok: true } });
    await m.abrufen({ manuell: true });
    assert.doesNotMatch(m.zeile().text, /durchsucht gerade/, "danach wieder der Stand");
    const ohne = S.erzeugen(abhBauen(tresor()));
    assert.deepEqual(await ohne.anstossen(), { fehler: "nicht-verbunden" });
  } finally { await srv.zu(); }
});

test("Ähnliche Titel", () => {
  const ja = [["Dies Universitatis", "Dies Universitatis 2026"], ["B110 Anmeldung Tutorium", "Anmeldung zu den Tutorien B110"],
    ["Bewerbungsfrist Deutschlandstipendium", "Deutschlandstipendium: Bewerbungsfrist"], ["Prüfungsanmeldung", "Prüfungsanmeldung (entfällt)"]];
  const nein = [["Abgabe Übungsblatt 2", "Abgabe Übungsblatt 3"], ["B110 Klausur", "B110 Nachklausur"], ["E101 Vorlesung", "B110 Vorlesung"], ["", "x"]];
  for (const [a, b] of ja) assert.equal(S.aehnlich(a, b), true, a + " | " + b);
  for (const [a, b] of nein) assert.equal(S.aehnlich(a, b), false, a + " | " + b);
});

test("Prüfung: ungültige Termine und fremde ids fallen einzeln weg, unbekanntes Schema bleibt für später liegen", async () => {
  const srv = await serverStarten();
  try {
    srv.eingangRoh("20261018-070000-lauf.json", { schema: 1, termine: [
      { id: "c-0123456789abcdef0123", titel: "Gültig", datum: "2026-11-05", kategorie: "Frist", status: "offiziell" },
      { id: "c-0123456789abcdef0124", titel: "[[Link]]", datum: "2026-11-05", kategorie: "Frist", status: "offiziell" },
      { id: "b110-klausur", titel: "Fremde id", datum: "2026-11-05", kategorie: "Prüfung", status: "offiziell" },
    ] });
    srv.eingangRoh("20261018-070100-lauf.json", { schema: 2, termine: [] });
    const t = tresor();
    const { m } = await verbunden(srv, t);
    const b = await m.abrufen();
    assert.deepEqual(b.angelegt, ["Termine/2026-11-05 Gültig.md"]);
    assert.deepEqual(b.verworfen.map((v) => v.grund).sort(), ["id nicht vom Server", "titel unzulässig"]);
    assert.equal(b.neuereVersion, true);
    assert.deepEqual(srv.imEingang(), ["20261018-070100-lauf.json"], "neueres Schema bleibt auf dem Server");
  } finally { await srv.zu(); }
});

test("Sperre (sperre.js): ein anderes Gerät holt gerade ab → nichts geschrieben, „Hier aktualisieren“ holt sie her; nach 80 Minuten Stille übernimmt dieses", async () => {
  const srv = await serverStarten();
  try {
    srv.eingang({ termine: [termin()] });
    const handy = { geraet: "g-handy", seit: START.toISOString(), zuletzt: new Date(START.getTime() - 10 * 60e3).toISOString(), mobil: true };
    const t = tresor({ "System/Daten/server-abruf.json": JSON.stringify(handy) });
    const { m } = await verbunden(srv, t);
    assert.equal((await m.abrufen()).art, "anderes-geraet");
    assert.deepEqual(t.pfade("Termine/"), []);
    const zh = m.zeile();
    assert.deepEqual([zh.text, zh.pille, zh.knopf.text, zh.knopf.aktion, zh.knopf.parameter],
      ["Ein anderes Gerät aktualisiert, alles kommt über deinen Sync.", "an", "Hier aktualisieren", "verbindung-aktualisieren", { id: "server", uebernehmen: "1" }]);
    assert.equal(m.status().zustand, "anderes-geraet");
    const b = await m.abrufen({ uebernehmen: true });
    assert.deepEqual([b.art, b.angelegt.length], ["ok", 1], "Hier aktualisieren");
    assert.equal(t.json("System/Daten/server-abruf.json").geraet, "g-pc");
    assert.equal(t.json("System/Daten/server.json").abrufer, undefined, "keine eigene Sperre mehr in server.json");
    assert.deepEqual([m.status().zustand, m.zeile().knopf.text], ["an", "Aktualisieren"], "danach wieder Aktualisieren");
    // Stille-Grenze: ein anderes Gerät war 85 Minuten still → dieses übernimmt ohne Knopf
    const t2 = tresor({ "System/Daten/server-abruf.json": JSON.stringify(Object.assign({}, handy, { zuletzt: new Date(START.getTime() - 85 * 60e3).toISOString() })) });
    srv.eingang({ termine: [termin({ schluessel: "gmail:x#2", titel: "Zweiter Termin", datum: "2026-11-20" })] });
    const z = await verbunden(srv, t2);
    assert.equal((await z.m.abrufen()).art, "ok");
    await z.m.trennen();
    assert.equal(t2.json("System/Daten/server-abruf.json").frei, true, "Trennen gibt die Sperre frei");
  } finally { await srv.zu(); }
});

test("Grenze je Abruf: höchstens 50 neue Notizen, der Rest beim nächsten; Hinweise nur einmal; Vergangenes nicht neu", async () => {
  const srv = await serverStarten();
  try {
    const viele = [];
    for (let i = 1; i <= 55; i++) viele.push(termin({ schluessel: `gmail:viele#${i}`, titel: `Termin Nummer ${i}`, datum: "2026-11-05", code: "" }));
    viele.push(termin({ schluessel: "gmail:alt#1", titel: "Schon vorbei", datum: "2026-10-01", code: "" }));
    const name = srv.eingang({ termine: viele, hinweise: [{ text: "Viele Termine auf einmal." }] });
    const t = tresor();
    const { m } = await verbunden(srv, t);
    const b = await m.abrufen();
    assert.deepEqual([b.angelegt.length, b.mehr], [50, true]);
    assert.deepEqual(srv.imEingang(), [name], "Datei bleibt auf dem Server");
    const b2 = await m.abrufen();
    assert.deepEqual([b2.angelegt.length, b2.mehr, b2.hinweise], [5, false, 1]);
    assert.deepEqual(srv.imEingang(), []);
    assert.equal(t.json("System/Daten/server.json").hinweise.length, 1, "Hinweis nur einmal");
    assert.ok(!t.pfade("Termine/").some((x) => x.includes("Schon vorbei")), "vergangener Termin nicht angelegt");
  } finally { await srv.zu(); }
});

test("Fehler: fremder Zugang, verändertes Paket, kein Netz; Status nach dem Vertrag, die Zeile sagt, was los ist (kein „Bitte prüfen“)", async () => {
  const srv = await serverStarten();
  try {
    srv.eingang({ termine: [termin()] });
    const t = tresor();
    const { a, m } = await verbunden(srv, t);
    const v = JSON.parse(a.geheimMap.get(GEHEIM_ID));
    a.geheimMap.set(GEHEIM_ID, JSON.stringify(Object.assign({}, v, { zugang: "A".repeat(43) })));
    assert.equal((await m.abrufen()).fehler, "zugang");
    assert.equal(m.zeile().pille, "pruefen");
    assert.match(m.zeile().text, /kennt dieses Gerät nicht mehr/);
    const s = m.status();
    assert.deepEqual([s.zustand, s.code, s.geprueft, s.fehlerZeit], ["fehler", "zugang", "", START.toISOString()]);
    assert.match(s.fehler, /kennt dieses Gerät nicht mehr/);
    assert.equal(m.meldungen, undefined, "kein Meldekanal an dich: der Zustand steht in der Zeile");
    a.geheimMap.set(GEHEIM_ID, JSON.stringify(v));
    // Paket unterwegs verändert: AES-GCM lehnt ab, nichts wird übernommen
    const verfaelscht = S.erzeugen(Object.assign({}, a, { netz: async (x) => {
      const r = await netzEcht(x);
      if (!x.url.endsWith("/v1/eingang")) return r;
      const p = JSON.parse(r.text);
      p.daten = (p.daten[0] === "A" ? "B" : "A") + p.daten.slice(1);
      return { status: r.status, text: JSON.stringify(p) };
    } }));
    assert.equal((await verfaelscht.abrufen()).fehler, "paket");
    assert.deepEqual(t.pfade("Termine/"), []);
    const ohneNetz = S.erzeugen(Object.assign({}, a, { netz: async () => { throw new Error("offline"); } }));
    assert.equal((await ohneNetz.abrufen({ manuell: true })).fehler, "netz");
    assert.equal(ohneNetz.zeile().text, "Dein Server ist gerade nicht erreichbar.", "noch nie aktualisiert: nur der Satz");
    assert.equal(ohneNetz.zeile().knopf.text, "Aktualisieren", "Aktualisieren bleibt");
    assert.equal(ohneNetz.zeile().pille, "an", "nicht erreichbar löst sich selbst: keine Pille „prüfen“");
    // danach wieder normal
    const b = await m.abrufen({ manuell: true });
    assert.equal(b.art, "ok");
    assert.equal(m.zeile().symbol, "haken");
    const vorLauf = Q.vorText("2026-10-18T07:30:00Z", START.getTime());
    assert.equal(m.zeile().text, `Aktualisiert gerade eben. Letzter Lauf des Servers ${vorLauf.replace(/\.$/, "")}. 1 Termin neu oder geändert.`);
    assert.doesNotMatch(m.zeile().text, /\.\./, "nie zwei Punkte („vor 5 Min.“ endet schon auf einen)");
    assert.deepEqual([m.status().fehler, m.status().fehlerZeit, m.status().geprueft], ["", "", START.toISOString()], "Fehler weg nach Erfolg");
    a.uhr.t = new Date(START.getTime() + 20 * 60e3);
    assert.match(m.zeile().text, /^Aktualisiert vor 20 Min\./);
    await ohneNetz.abrufen({ manuell: true });
    assert.equal(ohneNetz.zeile().text, "Dein Server ist gerade nicht erreichbar. Zuletzt aktualisiert vor 20 Min.", "Wortlaut wie bei allen Quellen");
  } finally { await srv.zu(); }
});

test("Zeile: Claude abgemeldet, Uni-Anmeldung abgelehnt, Claude-Limit; nur Werte aus festen Listen", async () => {
  const srv = await serverStarten();
  try {
    const t = tresor();
    const { m } = await verbunden(srv, t);
    const fall = async (zustand) => { srv.zustand(zustand); await m.abrufen({ manuell: true }); return m.zeile(); };
    const ab = await fall({ claude: "abgemeldet" });
    assert.match(ab.text, /Claude ist auf deinem Server nicht mehr verbunden/);
    assert.equal(ab.pille, "pruefen");
    const uni = await fall({ claude: "angemeldet", uniZugang: "falsch" });
    assert.match(uni.text, /Uni nimmt das Passwort auf deinem Server nicht an/);
    assert.equal(uni.pille, "pruefen");
    const limit = await fall({ claude: "angemeldet", fehler: ["claude-limit"] });
    assert.deepEqual([limit.symbol, limit.pille], ["uhr", "an"], "Limit löst sich selbst");
    srv.zustand({ claude: "<b>x</b>", uniZugang: "irgendwas", fehler: ["<script>", "claude-limit"] });
    await m.abrufen({ manuell: true });
    const s = m.status().werte;
    assert.deepEqual([s.claude, s.uniZugang, s.fehler], ["unbekannt", "unbekannt", ["claude-limit"]]);
    const d = await m.einzelheiten();
    assert.deepEqual(d.liste.map((x) => x[0]), ["Adresse", "Claude", "Gmail", "Uni-Postfach", "Zuletzt aktualisiert"]);
  } finally { await srv.zu(); }
});

test("Neue Hinweise: Link „Hinweise ansehen“ in der Zeile, kein „Bitte prüfen“; gesehen je Gerät, nach 14 Tagen nicht mehr neu", async () => {
  const srv = await serverStarten();
  try {
    const t = tresor();
    const { a, m } = await verbunden(srv, t);
    assert.deepEqual([m.neueHinweise(), m.zeile().link.text], [0, "Mehr erfahren"], "ohne Hinweise nichts");
    srv.eingang({ termine: [], hinweise: [{ text: "Neue Folien in E101.", quelle: "Kursmail, 17.10.2026" }, { text: "Zentraler Termin wohl falsch: B110 Klausur." }] });
    assert.equal((await m.abrufen()).art, "ok");
    assert.equal(m.neueHinweise(), 2);
    assert.doesNotMatch(JSON.stringify(m.zeile()), /Folien|B110/, "nie der Text eines Hinweises in der Zeile");
    assert.deepEqual([m.zeile().link.text, m.zeile().link.aktion], ["Hinweise ansehen", "verbinden"]);
    // zweites Gerät am selben Tresor, nicht verbunden: liest server.json selbst und merkt sich „gesehen“ selbst
    const ipad = S.erzeugen(abhBauen(t, { geraet: "g-ipad" }));
    assert.equal(ipad.neueHinweise(), 0, "vor dem Lesen nichts");
    await ipad.hinweiseLaden();
    assert.equal(ipad.status().zustand, "anderswo");
    assert.equal(ipad.zeile().link.text, "Hinweise ansehen");
    assert.equal(ipad.neueHinweise(), 2);
    m.hinweiseGesehen();
    assert.equal(m.zeile().link.text, "Mehr erfahren", "im Fenster gesehen: wieder „Mehr erfahren“");
    assert.equal(ipad.neueHinweise(), 2, "gesehen gilt nur auf diesem Gerät");
    // ein weiterer Hinweis zählt allein; derselbe Text noch einmal kommt nicht dazu
    srv.eingang({ termine: [], hinweise: [{ text: "Tutorium verschoben." }, { text: "Neue Folien in E101." }] });
    assert.equal((await m.abrufen()).art, "ok");
    assert.deepEqual([m.neueHinweise(), m.zeile().link.text], [1, "Hinweise ansehen"]);
    // Fehler und Hinweis zugleich: die Zeile sagt den Fehler, die Hinweise stehen weiter im Fenster
    srv.zustand({ claude: "abgemeldet" });
    await m.abrufen({ manuell: true });
    assert.deepEqual([m.zeile().pille, m.zeile().link.text, m.neueHinweise()], ["pruefen", "Mehr erfahren", 1]);
    // nach 14 Tagen nicht mehr neu
    a.uhr.t = new Date(START.getTime() + 15 * 1440 * 60e3);
    assert.equal(m.neueHinweise(), 0);
  } finally { await srv.zu(); }
});

test("Verbindungen: ohne Server leise „Für Technische“ mit Mehr erfahren, verbunden Aktualisieren; Schritte je Stand", () => {
  const aufbau = (server) => laden("verbindungen", {
    kontext: { obsidian: OBS, server, link: (aktion, p) => "obsidian://studium-autopilot?aktion=" + aktion + Object.keys(p || {}).map((k) => "&" + k + "=" + p[k]).join("") },
  }).ctx.verbindungen;
  const MEHR = { aktion: "verbinden", text: "Mehr erfahren", parameter: { id: "server" } };
  assert.equal(aufbau(undefined).liste.server.sichtbar(), false, "ohne server.js keine Zeile");
  const echt = S.erzeugen(abhBauen(tresor()));
  const ohne = aufbau({ sichtbar: echt.sichtbar, verbunden: echt.verbunden, status: echt.status, zeile: echt.zeile });
  const z0 = ohne.zeile("server");
  assert.match(z0.text, /^Für Technische: Claude sucht auf einem eigenen, kostenlosen Server/);
  assert.deepEqual([z0.pille, z0.symbol, z0.ton, z0.link], ["", "extern", "leise", ""]);
  assert.match(z0.knopf, /aktion=verbinden&id=server">Mehr erfahren</);
  assert.doesNotMatch(z0.knopf, /cta/, "leise, kein Hauptknopf");
  assert.match(ohne.liste.server.schritte[0], /\*\*Prompt kopieren\*\*/);
  assert.match(ohne.liste.server.erklaerung, /Claude Pro oder Max, ein Oracle-Konto und Gmail/);
  const anderswo = aufbau({ sichtbar: () => true, verbunden: () => false, status: () => ({ verbunden: false }),
    zeile: () => ({ text: "Auf einem anderen Gerät verbunden.", symbol: "haken", pille: "", knopf: null, link: MEHR }) });
  assert.match(anderswo.liste.server.schritte[0], /sudo studium-server verbinden/, "anderes Gerät: Schritte zum Verbinden");
  assert.equal(anderswo.zeile("server").knopf, "");
  const hier = aufbau({ sichtbar: () => true, verbunden: () => true, status: () => ({ verbunden: true }),
    zeile: () => ({ text: "Ein anderes Gerät holt die Termine ab.", symbol: "haken", pille: "an",
      knopf: { aktion: "verbindung-aktualisieren", text: "Hier aktualisieren", cta: true, parameter: { id: "server", uebernehmen: "1" } }, link: MEHR }) }).zeile("server");
  assert.match(hier.knopf, /aktion=verbindung-aktualisieren&id=server&uebernehmen=1/);
  assert.match(hier.knopf, />Hier aktualisieren</);
  const V = aufbau({ sichtbar: () => true, verbunden: () => true, status: () => ({ verbunden: true }),
    zeile: () => ({ text: "Aktualisiert vor 5 Min.", symbol: "haken", pille: "an",
      knopf: { aktion: "verbindung-aktualisieren", text: "Aktualisieren", cta: true, parameter: { id: "server" } }, link: MEHR }) });
  const z = V.zeile("server");
  assert.deepEqual([z.text, z.ton], ["Aktualisiert vor 5 Min.", "ok"]);
  assert.match(z.pille, />verbunden</);
  assert.match(z.knopf, /class="eba-vb-knopf cta" href="[^"]*aktion=verbindung-aktualisieren&id=server">Aktualisieren</);
  assert.match(z.link, /aktion=verbinden&id=server/);
  assert.deepEqual(V.liste.server.schritte, [], "verbunden: keine Schritte");
});

test("Prompt kopieren: derselbe Text wie im README unter „Für Technische“, mit dem Weg zum Skill", () => {
  const readme = fs.readFileSync(path.join(__dirname, "..", "README.md"), "utf8").replace(/\r\n/g, "\n");
  assert.ok(readme.includes(S.PROMPT), "README enthält den Prompt wörtlich");
  assert.match(S.PROMPT, /server\/skill\/server-einrichten\/SKILL\.md/);
  assert.match(S.PROMPT, /releases\/latest/, "Anleitung aus dem neuesten Release");
  assert.doesNotMatch(S.PROMPT, /\/(blob|raw|tree)\/main\//, "nie von main");
  assert.ok(fs.existsSync(path.join(SERVER, "skill", "server-einrichten", "SKILL.md")), "der Skill liegt dort");
});
