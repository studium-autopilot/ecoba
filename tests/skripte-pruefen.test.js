// Prüfung der Skripte im Kern (main.js, docs/architektur/skripte-pruefen.md): Ein Skript aus System/Skripte/ wird nur
// ausgewertet, wenn seine SHA-256 in der signierten Liste steht (system-dateien.json mit system-dateien.json.sig), es auf diesem
// Gerät erlaubt ist oder der Entwicklermodus an ist, beim Start und bei jedem Hot-Reload. Dazu: ohne gültige Signatur gilt nie
// eine Liste (fehlt sie im Tresor, je Version eine Anfrage ans Release je Lauf, erst die Kern-Version), CRLF, welche Listen bleiben
// (die der Kern-Version und die neueste, nie ältere, keine unter der neuesten angenommenen), Testversionen, ctx.skripte, die
// Befehle (nie über einen Link erreichbar), der Hinweis (bleibt stehen; geschlossen holen ihn Statusleiste bzw. Dashboard
// zurück), Reparieren (auch mit der echten Liste der Kern-Version) und Ereignisse während des ersten Ladens.
// Der Kern läuft mit einem Tresor im Speicher (tests/kern.js) und einem Wegwerf-Schlüssel. Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const nc = require("node:crypto");
const K = require("./kern.js");
const S = require("./signatur.js");

const LISTE = "System/Daten/system-dateien.json", SIG = LISTE + ".sig";
const SCHLUESSEL = S.schluesselBauen();
const enc = (s) => new TextEncoder().encode(s);
const sha = (t) => nc.createHash("sha256").update(typeof t === "string" ? Buffer.from(t, "utf8") : t).digest("hex");
const pfad = (n) => "System/Skripte/" + n + ".js";
const RAW = (v) => `https://raw.githubusercontent.com/studium-autopilot/ecoba/v${v}/Studium%20Autopilot/System/Skripte/`;
const REL = (v) => `https://github.com/studium-autopilot/ecoba/releases/download/v${v}/`;
const SIG_URL = (v) => REL(v) + "system-dateien.json.sig";

// Ein Skript, das beim Auswerten (oberste Ebene) und beim Start (registrieren) mitschreibt: so zeigt der Test, dass ein
// gesperrtes nie ausgewertet wurde
const skript = (name, fassung = 1, mehr = "") => `globalThis.AUSGEWERTET.push("${name}@${fassung}");\n` +
  `module.exports = function (ctx) { return { registrieren() { (ctx.plugin.registriert = ctx.plugin.registriert || []).push("${name}@${fassung}"); }${mehr} }; };\n`;
const listeBauen = (version, skripte) => JSON.stringify({ schema: 1, version, ordner: "Studium Autopilot", erstellt: "2026-11-01T12:00:00Z",
  dateien: Object.keys(skripte).sort().map((n) => ({ pfad: pfad(n), klasse: "system", groesse: Buffer.byteLength(skripte[n]), sha256: sha(skripte[n]) })) }, null, 1) + "\n";
const signieren = (liste, s = SCHLUESSEL) => S.signieren(enc(liste), s);
// Tresor: Skripte (Name → Text), Liste dieser Version, Signatur (o.sig: Text, false = keine), o.ist: Skripte, die anders auf der
// Platte liegen als in der Liste, o.extra: weitere Dateien
const dateienBauen = (version, skripte, o = {}) => {
  const liste = o.liste || listeBauen(version, skripte), d = { [LISTE]: liste };
  for (const n of Object.keys(skripte)) d[pfad(n)] = skripte[n];
  for (const n of Object.keys(o.ist || {})) d[pfad(n)] = o.ist[n];
  if (o.sig !== false) d[SIG] = o.sig || signieren(liste);
  return Object.assign(d, o.extra || {});
};
const STAND = { a: skript("a"), b: skript("b") };

// Kern starten. o wie K.aufbau, dazu version (Kern, Standard 1.2.3)
async function kern(o = {}) {
  globalThis.AUSGEWERTET = [];
  const x = K.aufbau(Object.assign({ version: "1.2.3", schluessel: [SCHLUESSEL.oeffentlich] }, o));
  await x.start();
  return x;
}
const datei = (x, n) => x.app.vault.getAbstractFileByPath(pfad(n));
const gesperrt = (x) => Object.keys(x.k.abgelehnt).sort();
const knopf = (h, text) => (h && h.el ? h.el.alle().find((e) => e.tag === "button" && e.text === text) : null);
const bis = async (fn, was) => { for (let i = 0; i < 400; i++) { if (fn()) return; await new Promise((r) => setTimeout(r, 5)); } assert.fail("nicht eingetreten: " + was); };

test("Skripte mit ihrer Prüfsumme in der signierten Liste laufen; die Liste gilt danach auf diesem Gerät", async () => {
  const x = await kern({ dateien: dateienBauen("1.2.3", STAND) });
  try {
    assert.deepEqual(globalThis.AUSGEWERTET, ["a@1", "b@1"]);
    assert.deepEqual(x.k.registriert, ["a@1", "b@1"]);
    assert.deepEqual(gesperrt(x), []);
    assert.equal(x.k.pruefung.zustand, "signiert");
    assert.ok(!x.k.ablehnungTimer, "kein Hinweis geplant");
    assert.deepEqual(x.texte(), []);
    // Nichts gesperrt: kein Eintrag in der Statusleiste, auch auf Wunsch kein Hinweis, mobil zeigt das Dashboard keinen
    assert.deepEqual(x.k.ersatzStatus, []);
    assert.equal(x.k.ablehnungZeigen(true), null);
    x.obs.Platform.isMobile = true;
    x.oeffnen("Dashboard.md");
    x.oeffnen("Studium/Einstellungen & Hilfe.md");
    assert.deepEqual(x.texte(), []);
    assert.deepEqual(x.k.ersatzStatus, []);
    const m = x.speicher.laden("eba-skripte-listen");
    assert.deepEqual(m.map((e) => [e.art, e.version, Object.keys(e.skripte)]), [["signiert", "1.2.3", [pfad("a"), pfad("b")]]]);
    assert.equal(x.speicher.laden("eba-skripte-hoechste"), "1.2.3", "neueste angenommene Version");
    assert.deepEqual(x.anfragen, [], "Signatur im Tresor: kein Abruf");
    // Gerätespeicher, nie eine Datei im Tresor
    for (const [p, b] of x.tresor.daten) assert.ok(!Buffer.from(b).toString("utf8").includes("eba-skripte-"), p);
  } finally { x.weg(); }
});

test("Ein Byte anders: dieses Skript wird nie ausgewertet, die anderen laufen; ein Hinweis nennt es, mit Reparieren", async () => {
  const x = await kern({ dateien: dateienBauen("1.2.3", STAND, { ist: { b: STAND.b + " " } }) });
  try {
    assert.deepEqual(globalThis.AUSGEWERTET, ["a@1"]);
    assert.deepEqual(x.k.registriert, ["a@1"]);
    assert.deepEqual(gesperrt(x), ["b"]);
    assert.equal(x.k.abgelehnt.b.grund, "geaendert");
    assert.equal(x.k.skripte.b, undefined, "nicht in ctx.user");
    assert.ok(x.k.ablehnungTimer, "Hinweis kurz nach dem Start");
    const h = x.k.ablehnungZeigen();
    assert.ok(h);
    assert.equal(x.hinweise.length, 1);
    assert.equal(x.hinweise[0].text, "Ein Teil der App wurde nicht gestartet, weil er nicht zur installierten Version passt (b). Reparieren");
    assert.ok(knopf(x.hinweise[0], "Reparieren"), "Knopf Reparieren");
    assert.equal(x.k.ablehnungZeigen(), null, "derselbe Stand: kein zweiter Hinweis");
    assert.equal(x.sichtbar("skripte-reparieren"), true);
    assert.equal(x.sichtbar("skript-erlauben"), true);
  } finally { x.weg(); }
});

test("Unbekannte Skripte (Konfliktkopie, „neue Fassung“, untergeschoben) laufen nie; Dateien in Unterordnern sind keine Skripte", async () => {
  const extra = { [pfad("a 2")]: skript("a 2"), [pfad("b (neue Fassung)")]: skript("b neu"), [pfad("x")]: skript("x"),
    "System/Skripte/unter/y.js": skript("y"), "Notizen/z.js": skript("z") };
  const x = await kern({ dateien: dateienBauen("1.2.3", STAND, { extra }) });
  try {
    assert.deepEqual(globalThis.AUSGEWERTET, ["a@1", "b@1"]);
    assert.deepEqual(gesperrt(x), ["a 2", "b (neue Fassung)", "x"]);
    assert.ok(Object.values(x.k.abgelehnt).every((a) => a.grund === "unbekannt"));
    x.k.ablehnungZeigen();
    assert.equal(x.hinweise[0].text, "a 2, b (neue Fassung), x gehören nicht zur App und wurden nicht geladen.");
    assert.ok(!knopf(x.hinweise[0], "Reparieren"), "nichts zu reparieren");
    assert.equal(x.sichtbar("skript-erlauben"), true, "der Befehl bleibt, der Hinweis nennt ihn nicht");
  } finally { x.weg(); }
});

test("Hot-Reload: ein geändertes Skript wird nicht ausgewertet, die geprüfte Fassung läuft weiter; zurück auf die echte lädt nichts doppelt", async () => {
  const x = await kern({ dateien: dateienBauen("1.2.3", STAND) });
  try {
    const altA = x.k.skripte.a;
    x.tresor.setzen(pfad("a"), skript("a", 2), { still: true });
    await x.k.skriptNeuLaden(datei(x, "a"));
    assert.deepEqual(globalThis.AUSGEWERTET, ["a@1", "b@1"], "a@2 nie ausgewertet");
    assert.deepEqual(gesperrt(x), ["a"]);
    assert.equal(x.k.skripte.a, altA, "die geprüfte Fassung läuft weiter");
    assert.ok(x.k.ablehnungTimer, "Hinweis erst nach Ruhe (Sync)");
    // auch „Erweiterungen neu laden“ prüft: jetzt ist a weg
    await x.k.skripteLaden(false);
    assert.deepEqual(globalThis.AUSGEWERTET, ["a@1", "b@1", "b@1"]);
    assert.equal(x.k.skripte.a, undefined);
    x.tresor.setzen(pfad("a"), STAND.a, { still: true });
    await x.k.skriptNeuLaden(datei(x, "a"));
    assert.deepEqual(gesperrt(x), []);
    assert.deepEqual(globalThis.AUSGEWERTET.slice(-1), ["a@1"]);
  } finally { x.weg(); }
});

test("Update über den Sync, Dateien in beliebiger Reihenfolge: neue Skripte warten auf Liste und Signatur, alte laufen bis dahin weiter", async () => {
  const NEU = { a: skript("a", 2), b: skript("b", 2) };
  const listeNeu = listeBauen("1.2.4", NEU), sigNeu = signieren(listeNeu);
  for (const reihe of [["a", "liste", "sig", "b"], ["sig", "a", "liste", "b"], ["a", "b", "liste", "sig"]]) {
    const x = await kern({ dateien: dateienBauen("1.2.3", STAND) });
    try {
      const da = new Set();
      for (const was of reihe) {
        da.add(was);
        if (was === "liste" || was === "sig") {
          x.tresor.setzen(was === "liste" ? LISTE : SIG, was === "liste" ? listeNeu : sigNeu, { still: true });
          await x.k.skripteNachpruefen();
        } else {
          x.tresor.setzen(pfad(was), NEU[was], { still: true });
          await x.k.skriptNeuLaden(datei(x, was));
        }
        // Solange Liste oder Signatur fehlen: das neue a wartet, die alte Fassung läuft
        if (da.has("a") && !(da.has("liste") && da.has("sig"))) {
          assert.deepEqual(gesperrt(x).filter((n) => n === "a"), ["a"], reihe.join(" → "));
          assert.ok(x.k.skripte.a && !globalThis.AUSGEWERTET.includes("a@2"), "a@1 läuft weiter");
        }
      }
      assert.deepEqual(gesperrt(x), [], reihe.join(" → "));
      assert.deepEqual(x.k.registriert.slice(-2).sort(), ["a@2", "b@2"], reihe.join(" → "));
      assert.deepEqual(globalThis.AUSGEWERTET.filter((n) => n.endsWith("@2")).sort(), ["a@2", "b@2"], "je einmal ausgewertet");
      assert.deepEqual(x.k.pruefung.mengen.map((m) => m.version), ["1.2.3", "1.2.4"], "die Liste des laufenden Kerns bleibt, die neue dazu");
      x.k.ablehnungZeigen();
      assert.deepEqual(x.texte(), [], "kein Hinweis, alles passt");
    } finally { x.weg(); }
  }
});

test("Neustart mitten im Sync: die Liste des laufenden Kerns gilt weiter, die neue dazu; mit dem neuen Kern gilt die alte nicht mehr", async () => {
  const NEU = { a: skript("a", 2), b: skript("b", 2) };
  const listeNeu = listeBauen("1.2.4", NEU);
  const x = await kern({ dateien: dateienBauen("1.2.3", STAND) });
  const speicher = Object.fromEntries([...x.speicher.m].map(([k, v]) => [k, JSON.parse(v)]));
  x.weg();
  // Liste, Signatur und a sind neu, b und der Kern noch alt
  const dateien = Object.assign(dateienBauen("1.2.4", NEU, { ist: { b: STAND.b } }), { [SIG]: signieren(listeNeu) });
  const y = await kern({ speicher, dateien });
  try {
    assert.deepEqual(globalThis.AUSGEWERTET, ["a@2", "b@1"]);
    assert.deepEqual(y.k.pruefung.mengen.map((m) => m.version), ["1.2.3", "1.2.4"]);
    y.tresor.setzen(pfad("b"), NEU.b, { still: true });
    await y.k.skriptNeuLaden(datei(y, "b"));
    assert.deepEqual(gesperrt(y), []);
  } finally { y.weg(); }
  // Der neue Kern ist da: die Liste der alten Version fällt weg, ihre Fassungen gelten nicht mehr
  const speicher2 = Object.fromEntries([...y.speicher.m].map(([k, v]) => [k, JSON.parse(v)]));
  const z = await kern({ version: "1.2.4", speicher: speicher2, dateien: Object.assign({}, dateien, { [pfad("b")]: STAND.b }) });
  try {
    assert.deepEqual(z.k.pruefung.mengen.map((m) => m.version), ["1.2.4"]);
    assert.deepEqual(z.speicher.laden("eba-skripte-listen").map((m) => m.version), ["1.2.4"]);
    assert.deepEqual(globalThis.AUSGEWERTET, ["a@2"]);
    assert.deepEqual(gesperrt(z), ["b"]);
  } finally { z.weg(); }
});

// Echte Releases 1.2.3 bis 1.2.7 (Liste, Signatur, Skripte a und update): öffentlich, jeder kann sie in den Tresor legen
const REL_V = {};
for (const [i, v] of ["1.2.3", "1.2.4", "1.2.5", "1.2.6", "1.2.7"].entries()) {
  const skripte = { a: skript("a", i + 1), update: skript("update", i + 1) }, liste = listeBauen(v, skripte);
  REL_V[v] = { skripte, liste, sig: signieren(liste) };
}
const releaseNetz = async (url) => {
  for (const v of Object.keys(REL_V)) {
    const r = REL_V[v];
    if (url === REL(v) + "system-dateien.json") return { status: 200, bytes: r.liste };
    if (url === SIG_URL(v)) return { status: 200, bytes: r.sig };
    for (const n of Object.keys(r.skripte)) if (url === RAW(v) + n + ".js") return { status: 200, bytes: r.skripte[n] };
  }
  return { status: 404 };
};
const releaseTresor = (v) => ({ [LISTE]: REL_V[v].liste, [SIG]: REL_V[v].sig, [pfad("a")]: REL_V[v].skripte.a, [pfad("update")]: REL_V[v].skripte.update });
// Liste und Signatur einer Version hinlegen (wie der Sync oder jemand mit Schreibzugriff), mit skripte auch die Skripte
const legen = async (x, v, skripte) => {
  x.tresor.setzen(SIG, REL_V[v].sig, { still: true });
  x.tresor.setzen(LISTE, REL_V[v].liste, { still: true });
  for (const n of skripte ? Object.keys(REL_V[v].skripte) : []) x.tresor.setzen(pfad(n), REL_V[v].skripte[n], { still: true });
  await x.k.skripteNachpruefen();
  for (const n of skripte ? Object.keys(REL_V[v].skripte) : []) await x.k.skriptNeuLaden(datei(x, n));
};
const stand = (x) => ({ speicher: Object.fromEntries([...x.speicher.m].map(([k, v]) => [k, JSON.parse(v)])), dateien: Object.fromEntries([...x.tresor.daten]) });

test("Bis zu vier Listen bleiben: die der Kern-Version und die drei neuesten neueren; neuere echte Listen verdrängen die des Kerns nie", async () => {
  const x = await kern({ dateien: releaseTresor("1.2.3") });
  try {
    await legen(x, "1.2.4");
    await legen(x, "1.2.5");
    assert.deepEqual(x.speicher.laden("eba-skripte-listen").map((m) => m.version), ["1.2.3", "1.2.5", "1.2.4"], "n+1, dann n+2: n und n+1 bleiben");
    assert.equal(x.speicher.laden("eba-skripte-hoechste"), "1.2.5");
  } finally { x.weg(); }
  // Nach einem Neustart läuft die Fassung des Kerns weiter (die Liste im Tresor ist eine neuere, echte)
  const y = await kern(stand(x));
  try {
    assert.deepEqual(globalThis.AUSGEWERTET, ["a@1", "update@1"]);
    assert.deepEqual(gesperrt(y), []);
    // Eine schon angenommene Liste unter der Marke gilt weiter, ihre Skripte auch
    await legen(y, "1.2.4", true);
    assert.equal(y.k.pruefung.zustand, "signiert");
    assert.deepEqual(gesperrt(y), []);
    await legen(y, "1.2.6");
    await legen(y, "1.2.7");
    assert.deepEqual(y.k.pruefung.mengen.map((m) => m.version), ["1.2.3", "1.2.7", "1.2.6", "1.2.5"], "erst drei neuere verdrängen n+1");
    // Jetzt ist 1.2.4 weg und liegt unter der Marke: ihre Liste gilt nicht mehr, ihre Skripte nicht
    await legen(y, "1.2.4", true);
    assert.equal(y.k.pruefung.zustand, "zurueck");
    assert.deepEqual(gesperrt(y), ["a", "update"]);
    // Die des Kerns gilt immer
    await legen(y, "1.2.3", true);
    assert.equal(y.k.pruefung.zustand, "signiert");
    assert.deepEqual(gesperrt(y), []);
    // ctx.skripte: nur lesen, neueste zuerst
    const listen = y.k.ctx.skripte.listen();
    assert.deepEqual(listen.map((m) => m.version), ["1.2.7", "1.2.6", "1.2.5", "1.2.3"]);
    assert.equal(listen[0].liste, sha(REL_V["1.2.7"].liste));
    assert.ok(Object.isFrozen(y.k.ctx.skripte));
    listen.length = 0;
    assert.equal(y.k.ctx.skripte.listen().length, 4, "eine Kopie");
  } finally { y.weg(); }
});

test("Eine echte Liste unter der Marke, die dieses Gerät nie angenommen hat (überholt), gilt nie; ihre Skripte laufen nie", async () => {
  const x = await kern({ dateien: releaseTresor("1.2.3") });
  try {
    await legen(x, "1.2.5", true);
    assert.deepEqual(globalThis.AUSGEWERTET.slice(-2), ["a@3", "update@3"]);
    await legen(x, "1.2.4", true);
    assert.equal(x.k.pruefung.zustand, "zurueck");
    assert.ok(!globalThis.AUSGEWERTET.includes("a@2"));
    assert.deepEqual(x.k.pruefung.mengen.map((m) => m.version), ["1.2.3", "1.2.5"]);
  } finally { x.weg(); }
});

test("Kern hinkt hinterher (Kern k, Tresor n): eine echte Liste n+1 verdrängt n nicht, nach dem Neustart laufen die Skripte von n weiter", async () => {
  const x = await kern({ dateien: releaseTresor("1.2.3") });
  try {
    await legen(x, "1.2.4", true); // das Update kam über den Sync, der neue Kern noch nicht
    assert.deepEqual(x.k.pruefung.mengen.map((m) => m.version), ["1.2.3", "1.2.4"]);
    await legen(x, "1.2.5"); // nur Liste und Signatur einer neueren Version
  } finally { x.weg(); }
  const y = await kern(stand(x));
  try {
    assert.deepEqual(globalThis.AUSGEWERTET, ["a@2", "update@2"], "auch update.js läuft");
    assert.deepEqual(gesperrt(y), []);
    assert.deepEqual(y.k.pruefung.mengen.map((m) => m.version), ["1.2.3", "1.2.5", "1.2.4"]);
  } finally { y.weg(); }
});

test("Reparieren auf einem Kern, der hinterherhinkt: legt die Liste der Marke in den Tresor, nie eine ältere, geprüft mit der gemerkten SHA-256", async () => {
  // Gerät mit Kern 1.2.3, der Tresor läuft schon auf 1.2.4; jemand macht die Liste kaputt und ändert ein Skript
  const kaputtMachen = async (x) => {
    x.tresor.setzen(LISTE, "{", { still: true });
    x.tresor.setzen(pfad("a"), REL_V["1.2.4"].skripte.a + "// x\n", { still: true });
    await x.k.skripteNachpruefen();
    await x.k.skriptNeuLaden(datei(x, "a"));
  };
  const x = await kern({ dateien: releaseTresor("1.2.4"), netz: releaseNetz });
  try {
    assert.equal(x.k.pruefung.zustand, "signiert");
    await kaputtMachen(x);
    assert.equal(x.k.pruefung.zustand, "liste-ungueltig");
    x.k.testAntworten = [true];
    assert.equal(await x.k.reparierenFragen(), true);
    assert.deepEqual(x.k.testProtokoll.slice(-1)[0].text, ["Die Liste der App im Tresor lässt sich nicht prüfen. Die echte Liste von Version 1.2.4 kommt neu von GitHub, dazu die echte Fassung von a.",
      "Was jetzt im Tresor liegt, kommt vorher in die Sicherung."]);
    assert.equal(x.tresor.text(LISTE), REL_V["1.2.4"].liste, "die Liste der Marke, nicht die der Kern-Version 1.2.3");
    assert.equal(x.tresor.text(pfad("a")), REL_V["1.2.4"].skripte.a);
    assert.ok(!x.anfragen.some((u) => u.indexOf("/v1.2.3/") >= 0), "nichts von 1.2.3 geladen");
  } finally { x.weg(); }
  // Ein Gerät mit Kern 1.2.4 öffnet den Tresor danach: alles läuft
  const y = await kern({ version: "1.2.4", dateien: stand(x).dateien });
  try { assert.deepEqual(gesperrt(y), []); } finally { y.weg(); }
  // Liefert das Release für 1.2.4 eine andere, gültig signierte Liste als die gemerkte: nichts geändert
  const anders = listeBauen("1.2.4", { a: skript("a", 9), update: REL_V["1.2.4"].skripte.update });
  const z = await kern({ dateien: releaseTresor("1.2.4"),
    netz: async (url) => (url === REL("1.2.4") + "system-dateien.json" ? { status: 200, bytes: anders } : url === SIG_URL("1.2.4") ? { status: 200, bytes: signieren(anders) } : releaseNetz(url)) });
  try {
    await kaputtMachen(z);
    z.k.testAntworten = [true];
    assert.equal(await z.k.reparierenFragen(), false);
    assert.deepEqual(z.texte().slice(-1), ["Die echte Fassung kam nicht vollständig an. Es wurde nichts geändert."]);
    assert.equal(z.tresor.text(LISTE), "{");
    assert.deepEqual(z.k.testAntworten, [true], "nicht gefragt");
  } finally { z.weg(); }
});

// Liste mit den Dateien des Kerns (wie release.py sie schreibt): skripte und kern je Name → Text
const KERN_ORDNER = ".obsidian/plugins/studium-autopilot/";
const KERN_ROH = (v) => `https://raw.githubusercontent.com/studium-autopilot/ecoba/v${v}/Studium%20Autopilot/.obsidian/plugins/studium-autopilot/`;
const listeMitKern = (version, skripte, kernDateien) => {
  const d = JSON.parse(listeBauen(version, skripte));
  for (const n of Object.keys(kernDateien).sort()) d.dateien.push({ pfad: KERN_ORDNER + n, klasse: "system", groesse: Buffer.byteLength(kernDateien[n]), sha256: sha(kernDateien[n]) });
  return JSON.stringify(d, null, 1) + "\n";
};

test("Kern hinkt hinterher: „Neu laden“ holt die Dateien des Kerns der Marke vom Tag, geprüft mit der angenommenen Liste, sichert die alten und startet neu", async () => {
  const ALT = { "main.js": "// kern 1.2.3\n", "manifest.json": "{\"id\":\"studium-autopilot\",\"version\":\"1.2.3\"}\n" };
  const NEU = { "main.js": "// kern 1.2.4\n", "manifest.json": "{\"id\":\"studium-autopilot\",\"version\":\"1.2.4\"}\n" };
  const SK = { a: skript("a", 2), b: STAND.b }, L4 = listeMitKern("1.2.4", SK, NEU);
  const tresor = (kernDateien) => Object.assign({ [LISTE]: L4, [SIG]: signieren(L4), [pfad("a")]: SK.a + " ", [pfad("b")]: SK.b },
    ...Object.keys(kernDateien).map((n) => ({ [KERN_ORDNER + n]: kernDateien[n] })));
  const netzMit = (k) => async (url) => (Object.prototype.hasOwnProperty.call(k, url) ? { status: 200, bytes: k[url] } : { status: 404 });
  const echt = { [KERN_ROH("1.2.4") + "main.js"]: NEU["main.js"], [KERN_ROH("1.2.4") + "manifest.json"]: NEU["manifest.json"] };
  // Obsidians Plugin-Verwaltung: schreibt mit, was passiert
  const plugins = (x) => {
    const p = { plugins: {}, schritte: [] };
    p.disablePlugin = async (id) => { p.schritte.push("aus " + id); };
    p.loadManifests = async () => { p.schritte.push("manifeste"); };
    p.enablePlugin = async (id) => { p.schritte.push("an " + id); p.plugins[id] = {}; };
    x.app.plugins = p;
    return p;
  };
  const x = await kern({ dateien: tresor(ALT), netz: netzMit(echt) });
  try {
    const pl = plugins(x);
    assert.equal(x.k.pruefung.zustand, "signiert");
    assert.deepEqual(gesperrt(x), ["a"]);
    x.k.ablehnungZeigen();
    assert.equal(x.hinweise[0].text, "Ein Teil der App wurde nicht gestartet, weil er nicht zur installierten Version passt (a). Auf diesem Gerät läuft noch Version 1.2.3; „Neu laden“ holt Version 1.2.4. Reparieren Neu laden");
    const knoepfe = x.hinweise[0].el.alle().filter((e) => e.tag === "button");
    assert.deepEqual(knoepfe.map((e) => [e.text, e.cls.includes("mod-cta")]), [["Reparieren", false], ["Neu laden", true]], "Hauptknopf zuletzt");
    assert.equal(x.sichtbar("kern-aufholen"), true);
    // Abgebrochen: nichts geladen, nichts geschrieben
    x.k.testAntworten = [false];
    assert.equal(await x.k.kernAufholenFragen(), false);
    assert.deepEqual(x.anfragen, []);
    // Bestätigt (über den Knopf im Hinweis)
    x.k.testAntworten = [true];
    knopf(x.hinweise[0], "Neu laden").lauscher.click();
    await bis(() => pl.schritte.length === 3, "neu gestartet");
    assert.deepEqual(x.k.testProtokoll.slice(-1)[0], { frage: "Neu laden?", antwort: true, text: [
      "Auf diesem Gerät läuft noch Version 1.2.3. Die Dateien der App von Version 1.2.4 kommen neu von GitHub, danach startet die App neu.",
      "Die Fassung, die jetzt auf diesem Gerät liegt, kommt vorher in die Sicherung."] });
    assert.deepEqual(x.anfragen, [KERN_ROH("1.2.4") + "main.js", KERN_ROH("1.2.4") + "manifest.json"], "manifest.json zuletzt");
    assert.equal(x.tresor.text(KERN_ORDNER + "main.js"), NEU["main.js"]);
    assert.equal(x.tresor.text(KERN_ORDNER + "manifest.json"), NEU["manifest.json"]);
    const sicherung = [...x.tresor.daten.keys()].filter((q) => q.startsWith(".trash/")).sort();
    assert.equal(sicherung.length, 2);
    assert.ok(sicherung.every((q) => /^\.trash\/Studium Autopilot Sicherung 1\.2\.3 \d{4}-\d{2}-\d{2} \d{2}-\d{2}\/\.obsidian\/plugins\/studium-autopilot\//.test(q)));
    assert.equal(x.tresor.text(sicherung.find((q) => q.endsWith("/main.js"))), ALT["main.js"]);
    assert.deepEqual(pl.schritte, ["aus studium-autopilot", "manifeste", "an studium-autopilot"]);
  } finally { x.weg(); }
  // Falsche Bytes oder kein Netz: nichts geschrieben, nicht neu gestartet
  for (const [name, netz, satz] of [["falsche Bytes", netzMit(Object.assign({}, echt, { [KERN_ROH("1.2.4") + "main.js"]: "// anders\n" })), "Die echte Fassung kam nicht vollständig an. Es wurde nichts geändert."],
    ["kein Netz", async () => { throw new Error("offline"); }, "Keine Verbindung. Versuch es später noch einmal."]]) {
    const y = await kern({ dateien: tresor(ALT), netz });
    try {
      const pl = plugins(y);
      y.k.testAntworten = [true];
      assert.equal(await y.k.kernAufholenFragen(), false, name);
      assert.deepEqual(y.texte().slice(-1), [satz], name);
      assert.equal(y.tresor.text(KERN_ORDNER + "main.js"), ALT["main.js"], name);
      assert.ok(![...y.tresor.daten.keys()].some((q) => q.startsWith(".trash/")), name);
      assert.deepEqual(pl.schritte, [], name);
    } finally { y.weg(); }
  }
  // Der Sync hat die neuen Dateien schon gebracht: nichts laden, nur neu starten; ohne Plugin-Verwaltung ein Satz
  const z = await kern({ dateien: tresor(NEU), netz: netzMit({}) });
  try {
    z.k.testAntworten = [true];
    assert.equal(await z.k.kernAufholenFragen(), false);
    assert.deepEqual(z.anfragen, []);
    assert.deepEqual(z.texte().slice(-1), ["Bitte Obsidian einmal schließen und wieder öffnen."]);
  } finally { z.weg(); }
  // Läuft schon der Kern der Marke: kein Befehl, nichts zu tun
  const w = await kern({ version: "1.2.4", dateien: tresor(NEU) });
  try {
    assert.equal(w.sichtbar("kern-aufholen"), false);
    assert.equal(await w.k.kernAufholenFragen(), false);
    assert.deepEqual(w.texte().slice(-1), ["Auf diesem Gerät läuft schon die neueste geprüfte Version."]);
  } finally { w.weg(); }
});

test("Reparieren bei einer älteren echten Liste im Tresor: holt die Liste der Marke; das Fenster sagt, was passiert", async () => {
  const x = await kern({ dateien: releaseTresor("1.2.5"), netz: releaseNetz });
  try {
    await legen(x, "1.2.4", true);
    assert.equal(x.k.pruefung.zustand, "zurueck");
    assert.deepEqual(gesperrt(x), ["a", "update"]);
    x.k.ablehnungZeigen();
    assert.equal(x.hinweise[0].text, "Teile der App wurden nicht gestartet, weil sie nicht zur installierten Version passen (a, update). Reparieren");
    x.k.testAntworten = [true];
    assert.equal(await x.k.reparierenFragen(), true);
    assert.deepEqual(x.k.testProtokoll.slice(-1)[0].text, ["Im Tresor liegt die Liste von Version 1.2.4; dieses Gerät kennt schon Version 1.2.5. Die echte Liste von Version 1.2.5 kommt neu von GitHub, dazu die echte Fassung von a, update.",
      "Was jetzt im Tresor liegt, kommt vorher in die Sicherung."]);
    assert.equal(x.tresor.text(LISTE), REL_V["1.2.5"].liste);
    assert.deepEqual(gesperrt(x), []);
    assert.deepEqual(globalThis.AUSGEWERTET.slice(-2), ["a@3", "update@3"]);
  } finally { x.weg(); }
});

test("Ungültige Signatur: die Liste gilt nicht; zuvor geprüfte Skripte laufen weiter, fremde nicht", async () => {
  const fremd = S.schluesselBauen();
  for (const sig of ["kein armor\n", signieren(listeBauen("1.2.3", STAND), fremd), signieren(listeBauen("1.2.3", STAND) + " ")]) {
    const x = await kern({ dateien: dateienBauen("1.2.3", STAND, { sig }), netz: async () => { throw new Error("nie"); } });
    try {
      assert.deepEqual(globalThis.AUSGEWERTET, [], "nichts ausgewertet");
      assert.equal(x.k.pruefung.zustand, "signatur-ungueltig");
      assert.deepEqual(x.speicher.laden("eba-skripte-listen"), null, "nichts angenommen");
      assert.deepEqual(x.anfragen, [], "kein Abruf von selbst: die Signatur fehlt nicht, sie ist falsch");
      x.k.ablehnungZeigen();
      assert.match(x.hinweise[0].text, /^Die App startet nicht, weil sich die Liste ihrer Teile nicht prüfen lässt \(a, b\)\./);
      assert.ok(knopf(x.hinweise[0], "Reparieren"), "Reparieren holt die echte Liste");
    } finally { x.weg(); }
  }
  // Mit einer zuvor geprüften Liste: Liste und Signatur getauscht, ein fremdes Skript dazu → nur die geprüften laufen
  const x = await kern({ dateien: dateienBauen("1.2.3", STAND) });
  const speicher = Object.fromEntries([...x.speicher.m].map(([k, v]) => [k, JSON.parse(v)]));
  x.weg();
  // Dieselbe Liste wie schon geprüft, nur die Signatur kaputt: Die Bytes der Liste sind dieselben, sie gilt weiter
  const gleich = await kern({ speicher, dateien: dateienBauen("1.2.3", STAND, { sig: "kein armor\n" }) });
  try {
    assert.deepEqual(globalThis.AUSGEWERTET, ["a@1", "b@1"]);
    assert.equal(gleich.k.pruefung.zustand, "signiert");
  } finally { gleich.weg(); }
  const boese = Object.assign({}, STAND, { c: skript("c") });
  const y = await kern({ speicher, dateien: dateienBauen("1.2.3", boese, { sig: signieren(listeBauen("1.2.3", boese), fremd) }) });
  try {
    assert.deepEqual(globalThis.AUSGEWERTET, ["a@1", "b@1"]);
    assert.deepEqual(gesperrt(y), ["c"]);
    assert.equal(y.k.pruefung.zustand, "signatur-ungueltig");
  } finally { y.weg(); }
});

test("Signatur fehlt im Tresor (Update von 0.7.6 oder älter) → aus dem Release holen, prüfen und merken", async () => {
  const d = dateienBauen("1.2.3", STAND, { sig: false }), sig = signieren(d[LISTE]);
  const netz = async (url) => (url === SIG_URL("1.2.3") ? { status: 200, bytes: sig } : { status: 404 });
  const x = await kern({ dateien: d, netz });
  try {
    assert.deepEqual(x.anfragen, [SIG_URL("1.2.3")]);
    assert.deepEqual(globalThis.AUSGEWERTET, ["a@1", "b@1"]);
    assert.equal(x.k.pruefung.zustand, "signiert");
    assert.deepEqual(x.speicher.laden("eba-skripte-listen").map((m) => [m.art, m.liste]), [["signiert", sha(d[LISTE])]], "geprüft gemerkt");
    assert.equal(x.tresor.text(SIG), null, "der Kern schreibt beim Start keine Datei");
    // „Erweiterungen neu laden“ im selben Lauf: kein zweiter Abruf
    await x.k.skripteLaden(false);
    assert.equal(x.anfragen.length, 1);
  } finally { x.weg(); }
  // Nächster Start ohne Netz: dieselbe Liste ist schon geprüft, kein Abruf
  const speicher = Object.fromEntries([...x.speicher.m].map(([k, v]) => [k, JSON.parse(v)]));
  const y = await kern({ dateien: d, speicher, netz: async () => { throw new Error("offline"); } });
  try {
    assert.deepEqual(y.anfragen, []);
    assert.equal(y.k.pruefung.zustand, "signiert");
    assert.deepEqual(globalThis.AUSGEWERTET, ["a@1", "b@1"]);
  } finally { y.weg(); }
  // Die geholte Signatur passt nicht (eine andere Liste): gesperrt
  const falsch = await kern({ dateien: d, netz: async () => ({ status: 200, bytes: signieren(d[LISTE] + " ") }) });
  try {
    assert.equal(falsch.k.pruefung.zustand, "signatur-ungueltig");
    assert.deepEqual(globalThis.AUSGEWERTET, []);
    assert.equal(falsch.speicher.laden("eba-skripte-listen"), null);
  } finally { falsch.weg(); }
  // Mit zentralen Daten aus: die eine Anfrage ans Release geht trotzdem (wie beim Update)
  const an = await kern({ dateien: Object.assign({}, d, { "System/Einstellungen.md": "---\nzentrale_daten: false\n---\n" }), netz });
  try {
    assert.equal(an.k.pruefung.zustand, "signiert");
    assert.deepEqual(an.anfragen, [SIG_URL("1.2.3")]);
  } finally { an.weg(); }
});

test("Ohne gültige Signatur gilt nie eine Liste: ohne Netz oder ohne Release-Datei warten die Skripte mit Hinweis, bis die Signatur da ist", async () => {
  const d = dateienBauen("1.2.3", STAND, { sig: false }), sigEcht = signieren(d[LISTE]);
  const faelle = [["ohne Netz", async () => { throw new Error("offline"); }, 4], ["Server gestört (503)", async () => ({ status: 503 }), 4],
    ["404", async () => ({ status: 404 }), 1]];
  for (const [name, netz, anfragen] of faelle) {
    const x = await kern({ dateien: d, netz });
    try {
      assert.deepEqual(x.anfragen, [SIG_URL("1.2.3")], name);
      assert.deepEqual(globalThis.AUSGEWERTET, [], name);
      assert.equal(x.k.pruefung.zustand, "ohne-signatur", name);
      assert.equal(x.speicher.laden("eba-skripte-listen"), null, name);
      assert.deepEqual(x.k.ctx.skripte.listen(), [], name);
      x.k.ablehnungZeigen();
      assert.equal(x.hinweise[0].text, "Die App startet, sobald sie einmal geprüft hat, dass ihre Teile echt sind (a, b). Dafür braucht dieses Gerät einmal eine Verbindung zum Internet. Ist es verbunden, tippe auf „Reparieren“. Reparieren", name);
      // Eine echte Antwort (404) merkt sich der Kern für diesen Lauf: keine Anfrage mehr, auch wenn sich die Liste wieder und wieder
      // ändert. Nach einem Netzfehler oder einer gestörten Antwort fragt jede neue Prüfung noch einmal.
      for (let i = 0; i < 3; i++) { x.tresor.setzen(LISTE, d[LISTE], { still: true }); await x.k.skripteNachpruefen(); }
      assert.equal(x.anfragen.length, anfragen, name);
    } finally { x.weg(); }
  }
  // Kommt die Signatur später (Sync, nächstes Update), gilt die Liste
  const w = await kern({ dateien: d, netz: async () => { throw new Error("offline"); } });
  try {
    w.tresor.setzen(SIG, sigEcht, { still: true });
    await w.k.skripteNachpruefen();
    assert.equal(w.k.pruefung.zustand, "signiert");
    assert.deepEqual(globalThis.AUSGEWERTET, ["a@1", "b@1"]);
  } finally { w.weg(); }
  // Nächster Start mit Netz: neuer Versuch
  const n = await kern({ dateien: d, netz: async () => ({ status: 200, bytes: sigEcht }) });
  try { assert.equal(n.k.pruefung.zustand, "signiert"); } finally { n.weg(); }
});

test("Netzfehler beim Start (das Gerät meldet „online“): nicht gemerkt, das Ereignis „online“ fragt noch einmal", async () => {
  const d = dateienBauen("1.2.3", STAND, { sig: false }), sigEcht = signieren(d[LISTE]);
  let netzOk = false;
  const x = await kern({ dateien: d, netz: async () => { if (!netzOk) throw new Error("DNS"); return { status: 200, bytes: sigEcht }; } });
  try {
    assert.equal(x.k.pruefung.zustand, "ohne-signatur");
    assert.equal(x.anfragen.length, 1);
    netzOk = true;
    x.k.ersatzDom.filter((e) => e.typ === "online")[0].fn();
    await bis(() => (x.k.registriert || []).length === 2, "geladen");
    assert.equal(x.k.pruefung.zustand, "signiert");
    assert.equal(x.anfragen.length, 2);
  } finally { x.weg(); }
});

test("Von selbst je Lauf nur die Signatur der Kern-Version und einer weiteren Version; Listen mit immer neuen Versionen fragen nicht mehr", async () => {
  const x = await kern({ dateien: { [LISTE]: listeBauen("1.2.3", STAND), [pfad("a")]: STAND.a, [pfad("b")]: STAND.b },
    netz: async (url) => (url === SIG_URL("1.2.3") ? { status: 200, bytes: signieren(listeBauen("1.2.3", STAND)) } : { status: 404 }) });
  try {
    assert.equal(x.k.pruefung.zustand, "signiert");
    for (let i = 10; i < 30; i++) {
      x.tresor.setzen(LISTE, listeBauen("1.2." + i, { a: skript("a", 666), b: STAND.b }), { still: true });
      await x.k.skripteNachpruefen();
    }
    assert.deepEqual(x.anfragen, [SIG_URL("1.2.3"), SIG_URL("1.2.10")]);
    assert.equal(x.k.pruefung.zustand, "ohne-signatur");
    // Ein Tipp auf Reparieren fragt trotzdem nach der Version der Liste
    await x.k.listeAuswerten({ holen: true });
    assert.ok(x.anfragen.includes(SIG_URL("1.2.29")));
  } finally { x.weg(); }
});

test("Wieder online: meldet das Gerät beim Start „offline“, geht keine Anfrage raus; das Ereignis „online“ holt die Signatur einmal je Lauf", async () => {
  const d = dateienBauen("1.2.3", STAND, { sig: false }), sigEcht = signieren(d[LISTE]);
  const navi = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const netzAn = (an) => Object.defineProperty(globalThis, "navigator", { value: { onLine: an }, configurable: true, writable: true });
  netzAn(false);
  try {
    let antwort = { status: 404 };
    const x = await kern({ dateien: d, netz: async () => antwort });
    try {
      assert.deepEqual(x.anfragen, [], "offline: keine Anfrage");
      assert.equal(x.k.pruefung.zustand, "ohne-signatur");
      const online = x.k.ersatzDom.filter((e) => e.typ === "online");
      assert.equal(online.length, 1);
      assert.equal(online[0].el, globalThis.window);
      netzAn(true);
      online[0].fn();
      await bis(() => x.anfragen.length === 1, "geholt");
      await x.k.nachpruefenLauf;
      assert.equal(x.k.pruefung.zustand, "ohne-signatur", "im Release fehlte sie noch");
      // Ein zweites „online“ im selben Lauf fragt nicht noch einmal; der nächste Start schon
      antwort = { status: 200, bytes: sigEcht };
      online[0].fn();
      await new Promise((r) => setTimeout(r, 50));
      await x.k.nachpruefenLauf;
      assert.equal(x.anfragen.length, 1);
    } finally { x.weg(); }
    const y = await kern({ dateien: d, netz: async () => antwort });
    try {
      assert.equal(y.k.pruefung.zustand, "signiert");
      assert.deepEqual(globalThis.AUSGEWERTET, ["a@1", "b@1"]);
    } finally { y.weg(); }
    // Erst „online“ mit Netz: geholt, die wartenden Skripte laufen
    netzAn(false);
    const z = await kern({ dateien: d, netz: async () => ({ status: 200, bytes: sigEcht }) });
    try {
      netzAn(true);
      z.k.ersatzDom.filter((e) => e.typ === "online")[0].fn();
      await bis(() => (z.k.registriert || []).length === 2, "geladen");
      assert.equal(z.k.pruefung.zustand, "signiert");
      assert.deepEqual(z.anfragen, [SIG_URL("1.2.3")]);
    } finally { z.weg(); }
  } finally {
    if (navi) Object.defineProperty(globalThis, "navigator", navi); else delete globalThis.navigator;
  }
});

// Wie jemand, der Dateien in den Tresor schreiben kann (Sync, Link, anderes Programm), aber nicht signieren
for (const umweg of [false, true]) {
  test("Eine untergeschobene Liste der Kern-Version ohne Signatur gilt nie" + (umweg ? ", auch nicht, wenn vorher eine Liste einer anderen Version den Abruf bekam" : "") + "; auch nicht nach einem Neustart mit Netz", async () => {
    const echt = signieren(listeBauen("1.2.3", { a: skript("a") }));
    const BOESE = { a: skript("a", 666) };
    const netz = async (url) => (url === SIG_URL("1.2.3") ? { status: 200, bytes: echt } : { status: 404 });
    const x = await kern({ dateien: { [LISTE]: listeBauen(umweg ? "9.9.9" : "1.2.3", BOESE), [pfad("a")]: BOESE.a }, netz });
    try {
      if (umweg) {
        assert.deepEqual(x.anfragen, [SIG_URL("1.2.3"), SIG_URL("9.9.9")], "erst die Kern-Version, dann die der Liste");
        x.tresor.setzen(LISTE, listeBauen("1.2.3", BOESE));
        await new Promise((r) => setTimeout(r, 1700));
        await x.k.nachpruefenLauf;
        assert.equal(x.anfragen.length, 2, "je Version eine Anfrage");
      } else assert.deepEqual(x.anfragen, [SIG_URL("1.2.3")]);
      assert.ok(!globalThis.AUSGEWERTET.includes("a@666"));
      assert.equal(x.k.pruefung.zustand, "signatur-ungueltig", "die Signatur der Kern-Version passt nicht dazu");
      assert.equal(x.speicher.laden("eba-skripte-listen"), null);
    } finally { x.weg(); }
    const speicher = Object.fromEntries([...x.speicher.m].map(([k, v]) => [k, JSON.parse(v)]));
    const y = await kern({ speicher, dateien: Object.fromEntries([...x.tresor.daten]), netz });
    try {
      assert.deepEqual(globalThis.AUSGEWERTET, []);
      assert.equal(y.k.pruefung.zustand, "signatur-ungueltig");
      assert.deepEqual(y.k.pruefung.mengen, []);
    } finally { y.weg(); }
  });
}

for (const fall of ["zentrale Daten aus (per Datei)", "ohne Netz", "Signatur gelöscht"]) {
  test("Nach einer signierten Liste: " + fall + " → eine untergeschobene Liste und ihr Skript gelten nicht, die geprüften laufen weiter", async () => {
    const liste = listeBauen("1.2.3", STAND), sigEcht = signieren(liste);
    let online = true;
    const netz = async () => { if (!online) throw new Error("offline"); return { status: 200, bytes: sigEcht }; };
    // Update von 0.7.6 oder älter: keine Signatur im Tresor, der Kern holt sie und prüft
    const x = await kern({ dateien: { [LISTE]: liste, [pfad("a")]: STAND.a, [pfad("b")]: STAND.b }, netz });
    const BOESE = { a: skript("a", 666), b: STAND.b };
    try {
      assert.equal(x.k.pruefung.zustand, "signiert");
      if (fall === "ohne Netz") online = false;
      else if (fall === "Signatur gelöscht") { x.tresor.setzen(SIG, sigEcht); x.tresor.loeschen(SIG); }
      else x.tresor.setzen("System/Einstellungen.md", "---\nzentrale_daten: false\n---\n");
      x.tresor.setzen(pfad("a"), BOESE.a);
      x.tresor.setzen(LISTE, listeBauen("1.2.3", BOESE));
      await new Promise((r) => setTimeout(r, 1700));
      await x.k.nachpruefenLauf;
      assert.ok(!globalThis.AUSGEWERTET.includes("a@666"), "das untergeschobene Skript lief");
      assert.equal(x.k.pruefung.zustand, "signatur-ungueltig", "die Signatur dieser Version (schon geholt) passt nicht");
      assert.equal(x.anfragen.length, 1, "kein zweiter Abruf für dieselbe Version");
      assert.deepEqual(gesperrt(x), ["a"]);
      assert.equal(x.k.skripte.b !== undefined, true, "b (geprüft) läuft weiter");
    } finally { x.weg(); }
    // Auch nach einem Neustart: die gemerkte Liste gilt, das fremde a nicht
    const speicher = Object.fromEntries([...x.speicher.m].map(([k, v]) => [k, JSON.parse(v)]));
    const y = await kern({ speicher, dateien: Object.fromEntries([...x.tresor.daten].filter(([k]) => k !== SIG)), netz });
    try {
      assert.deepEqual(y.anfragen, [SIG_URL("1.2.3")], "neuer Lauf: wieder eine Anfrage für die Version");
      assert.deepEqual(globalThis.AUSGEWERTET, ["b@1"]);
      assert.deepEqual(gesperrt(y), ["a"]);
      assert.equal(y.k.pruefung.zustand, online ? "signatur-ungueltig" : "ohne-signatur");
      y.k.ablehnungZeigen();
      assert.ok(knopf(y.hinweise[0], "Reparieren"), "Reparieren holt die echte Fassung");
    } finally { y.weg(); }
  });
}

test("Abruf beim Start: wartet höchstens SIG_FRIST", async () => {
  const d = dateienBauen("1.2.3", STAND, { sig: false });
  globalThis.AUSGEWERTET = [];
  const x = K.aufbau({ version: "1.2.3", schluessel: [SCHLUESSEL.oeffentlich], dateien: d, netz: () => new Promise(() => {}) });
  x.k.testSigFrist = 50;
  const t0 = Date.now();
  await x.start();
  try {
    assert.ok(Date.now() - t0 < 2000, "hängt nicht");
    assert.equal(x.k.pruefung.zustand, "ohne-signatur");
    assert.deepEqual(globalThis.AUSGEWERTET, []);
  } finally { x.weg(); }
});

test("Zeilenenden: Liste und Signatur mit CRLF (git unter Windows, Sync-Dienst) gelten; geprüft wird erst die Bytes, dann mit LF", async () => {
  const echt = { a: skript("a") }, L = listeBauen("1.2.3", echt), sigEcht = signieren(L);
  const crlf = (t) => t.replace(/\n/g, "\r\n");
  const d = { [LISTE]: crlf(L), [SIG]: crlf(Buffer.from(sigEcht).toString("utf8")), [pfad("a")]: crlf(echt.a) };
  const x = await kern({ dateien: d, netz: async () => { throw new Error("nie"); } });
  try {
    assert.equal(x.k.pruefung.zustand, "signiert");
    assert.deepEqual(globalThis.AUSGEWERTET, ["a@1"]);
    assert.deepEqual(x.anfragen, []);
    assert.equal(x.k.pruefung.liste, sha(L), "gemerkt mit LF: dieselbe Liste wie im Release");
    assert.deepEqual(x.k.ctx.skripte.listen().map((m) => m.liste), [sha(L)]);
  } finally { x.weg(); }
  // Signiert über CRLF (fremde Bytes) gilt nur genau so; ein anderes Byte bleibt anders, ein CR allein auch
  const andere = await kern({ dateien: { [LISTE]: crlf(L).replace("\r\n", "\n\r"), [SIG]: sigEcht, [pfad("a")]: echt.a } });
  try { assert.equal(andere.k.pruefung.zustand, "signatur-ungueltig"); } finally { andere.weg(); }
  const nurCR = await kern({ dateien: { [LISTE]: L.replace(/\n/g, "\r"), [SIG]: sigEcht, [pfad("a")]: echt.a } });
  try { assert.notEqual(nurCR.k.pruefung.zustand, "signiert"); } finally { nurCR.weg(); }
});

test("Testversionen (X.Y.Z-beta.N): ihre Liste gilt nur mit dem Schalter „Beta-Versionen“ auf diesem Gerät oder im Entwicklermodus", async () => {
  const BETA = { a: skript("a", 2), b: STAND.b }, listeBeta = listeBauen("1.3.0-beta.1", BETA);
  const legen = async (x) => {
    x.tresor.setzen(SIG, signieren(listeBeta), { still: true });
    x.tresor.setzen(LISTE, listeBeta, { still: true });
    x.tresor.setzen(pfad("a"), BETA.a, { still: true });
    await x.k.skripteNachpruefen();
    await x.k.skriptNeuLaden(datei(x, "a"));
  };
  // update_kanal: beta in der Datei allein reicht nicht
  const x = await kern({ dateien: dateienBauen("1.2.3", STAND, { extra: { "System/Einstellungen.md": "---\nupdate_kanal: beta\n---\n" } }),
    einstellungen: { update_kanal: "beta" } });
  try {
    await legen(x);
    assert.equal(x.k.pruefung.zustand, "beta");
    assert.deepEqual(gesperrt(x), ["a"]);
    assert.ok(!globalThis.AUSGEWERTET.includes("a@2"));
    assert.deepEqual(x.k.pruefung.mengen.map((m) => m.version), ["1.2.3"]);
    x.k.ablehnungZeigen();
    assert.equal(x.texte()[0], "Teile der App starten nicht, weil Version 1.3.0-beta.1 eine Testversion ist (a). Auf diesem Gerät gelten Testversionen erst, wenn du hier unter „Updates“ den Schalter „Beta-Versionen“ einschaltest.");
    assert.ok(!knopf(x.hinweise[0], "Reparieren"), "Reparieren hülfe nicht");
    assert.equal(await x.k.reparierenFragen(), false, "der Befehl sagt dasselbe, ändert nichts");
    assert.equal(x.tresor.text(pfad("a")), BETA.a);
    assert.deepEqual(x.texte().slice(-1), ["Version 1.3.0-beta.1 ist eine Testversion. Auf diesem Gerät gelten Testversionen erst, wenn du hier unter „Updates“ den Schalter „Beta-Versionen“ einschaltest."]);
    // Der Schalter in der App (ctx.skripte.beta): gilt, die wartenden Skripte laufen
    assert.equal(await x.k.ctx.skripte.beta(true), true);
    assert.equal(x.speicher.laden("eba-skripte-beta"), true);
    assert.equal(x.k.pruefung.zustand, "signiert");
    assert.deepEqual(gesperrt(x), []);
    assert.deepEqual(x.k.pruefung.mengen.map((m) => m.version), ["1.2.3", "1.3.0-beta.1"]);
    // Aus: die Liste der Testversion fällt weg
    assert.equal(await x.k.ctx.skripte.beta(false), false);
    assert.equal(x.speicher.laden("eba-skripte-beta"), null);
    assert.deepEqual(x.k.pruefung.mengen.map((m) => m.version), ["1.2.3"]);
    assert.equal(x.k.pruefung.zustand, "beta");
  } finally { x.weg(); }
  // Entwicklermodus: gilt auch
  const e = await kern({ speicher: { "eba-skripte-entwickler": true }, dateien: dateienBauen("1.3.0-beta.1", BETA) });
  try { assert.equal(e.k.pruefung.zustand, "signiert"); } finally { e.weg(); }
  // Läuft der Kern selbst als Testversion, gilt seine Liste
  const k = await kern({ version: "1.3.0-beta.1", dateien: dateienBauen("1.3.0-beta.1", BETA) });
  try {
    assert.equal(k.k.pruefung.zustand, "signiert");
    assert.deepEqual(globalThis.AUSGEWERTET, ["a@2", "b@1"]);
  } finally { k.weg(); }
});

test("Marke und Testversionen: ist der Schalter aus, zählt eine angenommene Testversion nicht, fertige Listen gelten ab der neuesten fertigen", async () => {
  const BETA = { a: skript("a", 2), b: STAND.b }, listeBeta = listeBauen("1.3.0-beta.1", BETA);
  const L129 = listeBauen("1.2.9", { a: skript("a", 3), b: STAND.b });
  const legen = async (x, liste) => {
    x.tresor.setzen(SIG, signieren(liste), { still: true });
    x.tresor.setzen(LISTE, liste, { still: true });
    await x.k.skripteNachpruefen();
  };
  const x = await kern({ dateien: dateienBauen("1.2.3", STAND) });
  try {
    await x.k.ctx.skripte.beta(true);
    await legen(x, listeBeta);
    assert.equal(x.k.pruefung.zustand, "signiert");
    assert.deepEqual([x.speicher.laden("eba-skripte-hoechste"), x.speicher.laden("eba-skripte-hoechste-beta")], ["1.2.3", "1.3.0-beta.1"]);
    // Mit dem Schalter an liegt 1.2.9 unter der Testversion
    await legen(x, L129);
    assert.equal(x.k.pruefung.zustand, "zurueck");
    await x.k.ctx.skripte.beta(false);
    await legen(x, L129);
    assert.equal(x.k.pruefung.zustand, "signiert", "Schalter aus: die Testversion zählt nicht für die Marke");
    assert.equal(x.speicher.laden("eba-skripte-hoechste"), "1.2.9");
    assert.deepEqual(x.k.pruefung.mengen.map((m) => m.version), ["1.2.3", "1.2.9"]);
    // Eine ältere fertige Liste bleibt darunter
    await legen(x, listeBauen("1.2.5", STAND));
    assert.equal(x.k.pruefung.zustand, "zurueck");
  } finally { x.weg(); }
});

test("Testversion kommt vor ihrer Signatur (die alte liegt noch da): ein Tipp auf Reparieren holt ihre Signatur und ersetzt sie nie", async () => {
  const BETA = { a: skript("a", 2), b: STAND.b }, listeBeta = listeBauen("1.3.0-beta.1", BETA);
  const karte = { [SIG_URL("1.3.0-beta.1")]: signieren(listeBeta), [SIG_URL("1.2.3")]: signieren(listeBauen("1.2.3", STAND)),
    [REL("1.2.3") + "system-dateien.json"]: listeBauen("1.2.3", STAND), [RAW("1.2.3") + "a.js"]: STAND.a };
  const x = await kern({ dateien: dateienBauen("1.2.3", STAND), netz: async (url) => (karte[url] ? { status: 200, bytes: karte[url] } : { status: 404 }) });
  try {
    x.tresor.setzen(LISTE, listeBeta, { still: true });
    x.tresor.setzen(pfad("a"), BETA.a, { still: true });
    await x.k.skripteNachpruefen();
    await x.k.skriptNeuLaden(datei(x, "a"));
    assert.equal(x.k.pruefung.zustand, "signatur-ungueltig", "die Signatur im Tresor gehört zur alten Liste");
    x.k.testAntworten = [true];
    assert.equal(await x.k.reparierenFragen(), false);
    assert.deepEqual(x.anfragen, [SIG_URL("1.3.0-beta.1")], "zuerst die Signatur der Version der Liste, sonst nichts");
    assert.equal(x.k.pruefung.zustand, "beta");
    assert.deepEqual(x.k.testAntworten, [true], "keine Frage, nichts ersetzt");
    assert.equal(x.tresor.text(LISTE), listeBeta);
    assert.equal(x.tresor.text(pfad("a")), BETA.a);
    assert.deepEqual(x.texte().slice(-1), ["Version 1.3.0-beta.1 ist eine Testversion. Auf diesem Gerät gelten Testversionen erst, wenn du hier unter „Updates“ den Schalter „Beta-Versionen“ einschaltest."]);
  } finally { x.weg(); }
});

test("Gerätespeicher früherer Entwicklungsstände der Prüfung: beim Start gelöscht, Listen ohne Signatur darin gelten nicht", async () => {
  const L = listeBauen("1.2.3", STAND);
  const speicher = { "eba-skripte-signiert": true, "eba-skripte-tofu": { version: "1.2.3", liste: sha(L) },
    "eba-skripte-listen": [{ art: "tofu", version: "1.2.3", liste: sha(L), skripte: { [pfad("a")]: { sha256: sha(STAND.a), groesse: 1 } } }] };
  const x = await kern({ speicher, dateien: dateienBauen("1.2.3", STAND, { sig: false }), netz: async () => { throw new Error("offline"); } });
  try {
    assert.equal(x.speicher.laden("eba-skripte-signiert"), null);
    assert.equal(x.speicher.laden("eba-skripte-tofu"), null);
    assert.deepEqual(globalThis.AUSGEWERTET, []);
    assert.equal(x.k.pruefung.zustand, "ohne-signatur");
    assert.equal(x.speicher.laden("eba-skripte-listen"), null);
  } finally { x.weg(); }
});

test("Zurück auf eine Liste älter als der laufende Kern: abgelehnt, auch echt signiert; die der Kern-Version gilt, im Entwicklermodus läuft alles", async () => {
  const NEU = { a: skript("a", 2), b: skript("b", 2) };
  const x = await kern({ version: "2.0.0", dateien: dateienBauen("2.0.0", NEU) });
  const speicher = Object.fromEntries([...x.speicher.m].map(([k, v]) => [k, JSON.parse(v)]));
  x.weg();
  // Alte, echt signierte Liste und alte Skripte (öffentlich, jeder kann sie hinlegen)
  const alt = dateienBauen("1.9.0", STAND);
  const y = await kern({ version: "2.0.0", speicher, dateien: alt });
  try {
    assert.equal(y.k.pruefung.zustand, "zurueck");
    assert.deepEqual(globalThis.AUSGEWERTET, []);
    assert.deepEqual(gesperrt(y), ["a", "b"]);
    assert.deepEqual(y.k.pruefung.mengen.map((m) => m.version), ["2.0.0"], "nicht gemerkt");
    // Reparieren holt die Fassung der geprüften Liste (2.0.0), nicht die der alten
    assert.deepEqual(y.k.reparierbare().map((a) => a.name), ["a", "b"]);
    assert.equal(y.k.zielListe().version, "2.0.0");
  } finally { y.weg(); }
  // Kern selbst ist 1.9.0 (von Hand zurück installiert): seine Liste gilt, die neuere geprüfte bleibt
  const z = await kern({ version: "1.9.0", speicher, dateien: alt });
  try {
    assert.equal(z.k.pruefung.zustand, "signiert");
    assert.deepEqual(globalThis.AUSGEWERTET, ["a@1", "b@1"]);
    assert.deepEqual(z.k.pruefung.mengen.map((m) => m.version), ["1.9.0", "2.0.0"]);
  } finally { z.weg(); }
  const e = await kern({ version: "2.0.0", speicher: Object.assign({}, speicher, { "eba-skripte-entwickler": true }), dateien: alt });
  try {
    assert.deepEqual(globalThis.AUSGEWERTET, ["a@1", "b@1"]);
  } finally { e.weg(); }
});

test("Entwicklermodus: nur nach Bestätigung, nur auf diesem Gerät; lädt alles ohne Prüfung, sagt es bei jedem Start; aus = wieder geprüft", async () => {
  // Tresor zum Entwickeln: keine Liste (release.py erzeugt sie)
  const d = { [pfad("a")]: STAND.a, [pfad("b")]: STAND.b };
  const x = await kern({ dateien: d });
  try {
    assert.deepEqual(globalThis.AUSGEWERTET, []);
    assert.equal(x.k.pruefung.zustand, "keine-liste");
    x.k.ablehnungZeigen();
    // Den Hinweis kann jeder herstellen, der in den Tresor schreibt: er nennt den Entwicklermodus nicht, der Befehl bleibt
    assert.equal(x.hinweise[0].text, "Die App startet nicht, weil im Tresor die Liste ihrer Teile fehlt (a, b). Reparieren");
    assert.equal(x.sichtbar("entwicklermodus-an"), true);
    assert.equal(x.sichtbar("entwicklermodus-aus"), false);
    x.k.testAntworten = [false];
    assert.equal(x.befehl("entwicklermodus-an"), true);
    await bis(() => x.k.testAntworten.length === 0, "gefragt");
    assert.equal(x.speicher.laden("eba-skripte-entwickler"), null, "abgebrochen: aus");
    assert.deepEqual(globalThis.AUSGEWERTET, []);
    x.k.testAntworten = [true];
    assert.equal(await x.k.entwicklerFragen(), true);
    assert.equal(x.k.testProtokoll.slice(-1)[0].frage, "Entwicklermodus einschalten?");
    assert.equal(x.speicher.laden("eba-skripte-entwickler"), true);
    assert.deepEqual(globalThis.AUSGEWERTET, ["a@1", "b@1"]);
    assert.deepEqual(gesperrt(x), []);
    assert.ok(x.hinweise[0].weg, "nichts mehr gesperrt: der Hinweis geht");
    assert.ok(x.k.ersatzStatus[0].entfernt, "und der Eintrag in der Statusleiste");
    // Hot-Reload wie bisher: jede Änderung sofort
    x.tresor.setzen(pfad("a"), skript("a", 2), { still: true });
    await x.k.skriptNeuLaden(datei(x, "a"));
    assert.deepEqual(globalThis.AUSGEWERTET.slice(-1), ["a@2"]);
    assert.equal(x.sichtbar("entwicklermodus-an"), false);
    assert.equal(x.sichtbar("entwicklermodus-aus"), true);
  } finally { x.weg(); }
  const speicher = Object.fromEntries([...x.speicher.m].map(([k, v]) => [k, JSON.parse(v)]));
  const y = await kern({ dateien: Object.assign({}, d, { [pfad("a")]: skript("a", 2) }), speicher });
  try {
    assert.deepEqual(globalThis.AUSGEWERTET, ["a@2", "b@1"]);
    assert.deepEqual(y.texte(), ["Der Entwicklermodus ist an. Skripte laufen auf diesem Gerät ohne Prüfung."], "einmal je Start");
    assert.equal(y.hinweise[0].dauer, 8000, "geht von selbst, kein stehender Hinweis");
    assert.deepEqual(y.k.ersatzStatus, [], "kein Eintrag in der Statusleiste");
    y.befehl("entwicklermodus-aus");
    await bis(() => y.texte().length === 2, "ausgeschaltet");
    assert.deepEqual(y.texte().slice(-1), ["Der Entwicklermodus ist aus. Es laufen nur noch geprüfte Skripte."]);
    assert.equal(y.speicher.laden("eba-skripte-entwickler"), null);
    assert.deepEqual(gesperrt(y), ["a", "b"]);
    assert.equal(y.k.skripte.a, undefined, "nach dem Ausschalten nicht mehr geladen");
  } finally { y.weg(); }
  // Ein anderes Gerät (eigener Gerätespeicher) bleibt geprüft
  const z = await kern({ dateien: d });
  try { assert.deepEqual(globalThis.AUSGEWERTET, []); } finally { z.weg(); }
});

test("Auf diesem Gerät erlauben: genau diese Fassung, mit Pfad und Warnung bestätigt; jede spätere Änderung ist wieder gesperrt", async () => {
  const x = await kern({ dateien: dateienBauen("1.2.3", STAND, { extra: { [pfad("meins")]: skript("meins") } }) });
  try {
    assert.deepEqual(gesperrt(x), ["meins"]);
    x.k.testAntworten = [pfad("meins"), false];
    assert.equal(await x.k.erlaubenFragen(), false, "abgebrochen");
    assert.equal(x.speicher.laden("eba-skripte-erlaubt"), null);
    x.k.testAntworten = [pfad("meins"), true];
    assert.equal(await x.k.erlaubenFragen(), true);
    assert.deepEqual(x.k.testProtokoll.map((p) => p.frage), ["Welches Skript erlauben?", "Skript auf diesem Gerät erlauben?", "Welches Skript erlauben?", "Skript auf diesem Gerät erlauben?"]);
    assert.deepEqual(x.speicher.laden("eba-skripte-erlaubt"), { [pfad("meins")]: sha(skript("meins")) });
    assert.deepEqual(globalThis.AUSGEWERTET, ["a@1", "b@1", "meins@1"]);
    assert.deepEqual(x.texte().slice(-1), ["meins ist auf diesem Gerät erlaubt und läuft."]);
    x.tresor.setzen(pfad("meins"), skript("meins", 2), { still: true });
    await x.k.skriptNeuLaden(datei(x, "meins"));
    assert.deepEqual(gesperrt(x), ["meins"], "geändert: wieder gesperrt");
    assert.ok(!globalThis.AUSGEWERTET.includes("meins@2"));
    // Ändert sich die Datei zwischen Auswahl und Bestätigung, wird nichts erlaubt
    x.tresor.setzen(pfad("meins"), skript("meins", 3), { still: true });
    x.k.testAntworten = [pfad("meins"), true];
    assert.equal(await x.k.erlaubenFragen(), false);
    assert.deepEqual(x.texte().slice(-1), ["Das Skript hat sich gerade geändert. Bitte noch einmal versuchen."]);
    assert.ok(!globalThis.AUSGEWERTET.includes("meins@3"));
  } finally { x.weg(); }
  // Ein neuer Start nimmt die erlaubte Fassung, ein anderes Gerät nicht
  const zwei = { [pfad("meins")]: skript("meins") };
  const speicher = { "eba-skripte-erlaubt": { [pfad("meins")]: sha(skript("meins")) } };
  const y = await kern({ dateien: dateienBauen("1.2.3", STAND, { extra: zwei }), speicher });
  try { assert.deepEqual(globalThis.AUSGEWERTET, ["a@1", "b@1", "meins@1"]); } finally { y.weg(); }
  const z = await kern({ dateien: dateienBauen("1.2.3", STAND, { extra: zwei }) });
  try { assert.deepEqual(gesperrt(z), ["meins"]); } finally { z.weg(); }
});

test("Zeilenenden: ein Skript mit CRLF gilt wie mit LF (nur das wird angeglichen), jede andere Abweichung nicht", async () => {
  const crlf = STAND.a.replace(/\n/g, "\r\n");
  const x = await kern({ dateien: dateienBauen("1.2.3", STAND, { ist: { a: crlf, b: STAND.b.replace(/\n/g, "\r") } }) });
  try {
    assert.deepEqual(globalThis.AUSGEWERTET, ["a@1"]);
    assert.deepEqual(gesperrt(x), ["b"], "nur CR: kein CRLF, also anders");
    assert.equal(x.k.pruefsummen.a, sha(STAND.a));
    assert.equal(x.k.quellen.a, STAND.a, "ausgewertet wird genau, was geprüft wurde");
  } finally { x.weg(); }
  // BOM am Anfang ist eine Abweichung
  const y = await kern({ dateien: dateienBauen("1.2.3", STAND, { ist: { a: "﻿" + STAND.a } }) });
  try { assert.deepEqual(gesperrt(y), ["a"]); } finally { y.weg(); }
});

test("Reparieren: echte Fassung vom Tag der Liste, Größe und SHA-256 geprüft, deine in die Sicherung, dann geladen; sonst nichts geändert", async () => {
  const kaputt = STAND.b.replace("b@1", "b@9");
  const zuliefern = { [RAW("1.2.3") + "b.js"]: STAND.b };
  const netzMit = (karte) => async (url) => (Object.prototype.hasOwnProperty.call(karte, url) ? { status: 200, bytes: karte[url] } : { status: 404 });
  // Netz liefert falsche Bytes: nichts geschrieben
  const f = await kern({ dateien: dateienBauen("1.2.3", STAND, { ist: { b: kaputt } }), netz: netzMit({ [RAW("1.2.3") + "b.js"]: kaputt }) });
  try {
    f.k.testAntworten = [true];
    assert.equal(await f.k.reparierenFragen(), false);
    assert.equal(f.tresor.text(pfad("b")), kaputt);
    assert.deepEqual(f.texte().slice(-1), ["Die echte Fassung kam nicht vollständig an. Es wurde nichts geändert."]);
    assert.ok(![...f.tresor.daten.keys()].some((p) => p.startsWith(".trash/")), "keine Sicherung");
  } finally { f.weg(); }
  const o = await kern({ dateien: dateienBauen("1.2.3", STAND, { ist: { b: kaputt } }), netz: async () => { throw new Error("offline"); } });
  try {
    o.k.testAntworten = [true];
    assert.equal(await o.k.reparierenFragen(), false);
    assert.deepEqual(o.texte().slice(-1), ["Keine Verbindung. Versuch es später noch einmal."]);
  } finally { o.weg(); }
  // Über den Knopf im Hinweis, bestätigt
  const x = await kern({ dateien: dateienBauen("1.2.3", STAND, { ist: { b: kaputt } }), netz: netzMit(zuliefern) });
  try {
    x.k.ablehnungZeigen();
    x.k.testAntworten = [true];
    knopf(x.hinweise[0], "Reparieren").lauscher.click();
    await bis(() => x.texte().some((t) => t.startsWith("Repariert")), "repariert");
    assert.deepEqual(x.anfragen, [RAW("1.2.3") + "b.js"]);
    assert.equal(x.k.testProtokoll[0].frage, "Reparieren?");
    assert.equal(x.tresor.text(pfad("b")), STAND.b);
    const sicherung = [...x.tresor.daten.keys()].filter((p) => p.startsWith(".trash/"));
    assert.equal(sicherung.length, 1);
    assert.match(sicherung[0], /^\.trash\/Studium Autopilot Sicherung 1\.2\.3 \d{4}-\d{2}-\d{2} \d{2}-\d{2}\/System\/Skripte\/b\.js$/);
    assert.equal(x.tresor.text(sicherung[0]), kaputt);
    assert.deepEqual(gesperrt(x), []);
    assert.deepEqual(globalThis.AUSGEWERTET, ["a@1", "b@1"]);
    assert.ok(!globalThis.AUSGEWERTET.includes("b@9"), "die geänderte Fassung lief nie");
    assert.deepEqual(x.texte().slice(-1), ["Repariert (b). Die alte Fassung liegt in der Sicherung."]);
    assert.equal(x.hinweise[0].weg, true, "der Hinweis ist weg");
    assert.equal(x.sichtbar("skripte-reparieren"), false, "nichts mehr zu reparieren");
  } finally { x.weg(); }
  // Abgebrochen: nichts geladen, nichts geschrieben
  const n = await kern({ dateien: dateienBauen("1.2.3", STAND, { ist: { b: kaputt } }), netz: netzMit(zuliefern) });
  try {
    n.k.testAntworten = [false];
    assert.equal(await n.k.reparierenFragen(), false);
    assert.deepEqual(n.anfragen, []);
    assert.equal(n.tresor.text(pfad("b")), kaputt);
  } finally { n.weg(); }
  // Erster Start ohne Netz: ein Tipp holt die Signatur, dann wird repariert
  const d = dateienBauen("1.2.3", STAND, { sig: false, ist: { b: kaputt } });
  let online = false;
  const karte = netzMit({ [SIG_URL("1.2.3")]: signieren(d[LISTE]), [RAW("1.2.3") + "b.js"]: STAND.b });
  const t = await kern({ dateien: d, netz: async (url) => { if (!online) throw new Error("offline"); return karte(url); } });
  try {
    assert.equal(t.k.pruefung.zustand, "ohne-signatur");
    assert.deepEqual(globalThis.AUSGEWERTET, []);
    online = true;
    t.k.testAntworten = [true];
    assert.equal(await t.k.reparierenFragen(), true);
    assert.equal(t.k.pruefung.zustand, "signiert");
    assert.deepEqual(gesperrt(t), []);
    assert.equal(t.tresor.text(pfad("b")), STAND.b);
  } finally { t.weg(); }
  // Neue Liste da, ihre Signatur noch nicht (Sync): der Tipp holt nur die Signatur, lädt keine Datei
  const NEU = { a: skript("a", 2), b: STAND.b };
  const listeNeu = listeBauen("1.2.4", NEU);
  const s = await kern({ dateien: dateienBauen("1.2.3", STAND), netz: netzMit({ [SIG_URL("1.2.4")]: signieren(listeNeu) }) });
  try {
    s.tresor.setzen(LISTE, listeNeu, { still: true });
    s.tresor.setzen(pfad("a"), NEU.a, { still: true });
    await s.k.skripteNachpruefen();
    await s.k.skriptNeuLaden(datei(s, "a"));
    assert.equal(s.k.pruefung.zustand, "signatur-ungueltig", "die Signatur der alten Liste liegt noch da");
    assert.deepEqual(gesperrt(s), ["a"]);
    s.k.ablehnungZeigen();
    assert.ok(knopf(s.hinweise[0], "Reparieren"));
    assert.equal(await s.k.reparierenFragen(), true);
    assert.deepEqual(s.anfragen, [SIG_URL("1.2.4")], "nach einem Tipp zuerst die Version der Liste");
    assert.deepEqual(gesperrt(s), []);
    assert.deepEqual(s.texte().slice(-1), ["Alles ist wieder da."]);
    assert.ok(globalThis.AUSGEWERTET.includes("a@2"));
  } finally { s.weg(); }
  // Pfade in NFD (etwa vom Mac): die Adresse nimmt die NFC-Form wie die Liste
  const NAME = "Übung", NFC = NAME.normalize("NFC");
  const mitUmlaut = { a: STAND.a, [NFC]: skript("u") };
  const listeU = listeBauen("1.2.3", mitUmlaut);
  const u = await kern({ dateien: { [LISTE]: listeU, [SIG]: signieren(listeU), [pfad("a")]: STAND.a, [pfad(NAME)]: skript("u", 9) },
    netz: netzMit({ [RAW("1.2.3") + encodeURIComponent(NFC + ".js")]: skript("u") }) });
  try {
    assert.deepEqual(gesperrt(u), [NAME]);
    u.k.testAntworten = [true];
    assert.equal(await u.k.reparierenFragen(), true);
    assert.deepEqual(u.anfragen, [RAW("1.2.3") + encodeURIComponent(NFC + ".js")]);
    assert.equal(u.tresor.text(pfad(NAME)), skript("u"));
  } finally { u.weg(); }
});

test("Reparieren ersetzt eine Liste, die nicht gilt (untergeschoben, kaputt, gelöscht), durch die echte der Kern-Version aus dem Release, auch wenn update.js gesperrt ist", async () => {
  const ECHT = Object.assign({}, STAND, { update: skript("update") });
  const L = listeBauen("1.2.3", ECHT), sigEcht = signieren(L);
  const BOESE = Object.assign({}, ECHT, { b: skript("b", 666), x: skript("x") });
  const karte = { [REL("1.2.3") + "system-dateien.json"]: L, [SIG_URL("1.2.3")]: sigEcht, [RAW("1.2.3") + "b.js"]: ECHT.b };
  const netzMit = (k) => async (url) => (Object.prototype.hasOwnProperty.call(k, url) ? { status: 200, bytes: k[url] } : { status: 404 });
  const tresor = (liste) => Object.assign({ [pfad("a")]: ECHT.a, [pfad("b")]: BOESE.b, [pfad("update")]: ECHT.update, [pfad("x")]: BOESE.x }, liste);
  const faelle = [
    ["untergeschoben", { [LISTE]: listeBauen("1.2.3", BOESE), [SIG]: "kein armor\n" }, [LISTE, SIG, pfad("b")]],
    ["kaputt", { [LISTE]: "{", [SIG]: sigEcht }, [LISTE, SIG, pfad("b")]],
    ["gelöscht", {}, [pfad("b")]],
  ];
  for (const [name, liste, gesichert] of faelle) {
    const x = await kern({ dateien: tresor(liste), netz: netzMit(karte) });
    try {
      assert.deepEqual(globalThis.AUSGEWERTET, [], name);
      x.k.ablehnungZeigen();
      assert.ok(knopf(x.hinweise[0], "Reparieren"), name);
      x.k.testAntworten = [true];
      assert.equal(await x.k.reparierenFragen(), true, name);
      assert.deepEqual(x.k.testProtokoll.map((e) => e.frage), ["Reparieren?"], name + ": eine Frage");
      assert.equal(x.tresor.text(LISTE), L, name);
      assert.equal(x.tresor.text(SIG), Buffer.from(sigEcht).toString("utf8"), name);
      assert.equal(x.k.pruefung.zustand, "signiert", name);
      assert.equal(x.tresor.text(pfad("b")), ECHT.b, name);
      assert.deepEqual(gesperrt(x), ["x"], name + ": was nicht zur App gehört, bleibt gesperrt");
      assert.deepEqual(globalThis.AUSGEWERTET.slice().sort(), ["a@1", "b@1", "update@1"], name);
      const sicherung = [...x.tresor.daten.keys()].filter((q) => q.startsWith(".trash/"));
      assert.ok(sicherung.every((q) => /^\.trash\/Studium Autopilot Sicherung 1\.2\.3 \d{4}-\d{2}-\d{2} \d{2}-\d{2}\//.test(q)), name);
      assert.deepEqual(sicherung.map((q) => q.split("/").slice(2).join("/")).sort(), gesichert.slice().sort(), name);
      if (liste[LISTE]) assert.equal(x.tresor.text(sicherung.find((q) => q.endsWith("/" + LISTE))), liste[LISTE], name);
      assert.deepEqual(x.texte().slice(-1), ["Repariert (Liste der App, b). Die alte Fassung liegt in der Sicherung."], name);
    } finally { x.weg(); }
  }
  // Was schiefgeht, ändert nichts: kein Netz, Release ohne diese Version, eine Liste, die nicht zur Signatur passt oder zu einer
  // anderen Version gehört, abgebrochen
  const L4 = listeBauen("1.2.4", ECHT);
  const schief = [
    ["kein Netz", async () => { throw new Error("offline"); }, "Keine Verbindung. Versuch es später noch einmal."],
    ["fehlt im Release", netzMit({}), "Reparieren geht gerade nicht, weil sich die Liste der App nicht prüfen lässt."],
    ["andere Bytes", netzMit(Object.assign({}, karte, { [REL("1.2.3") + "system-dateien.json"]: L + " " })), "Die echte Fassung kam nicht vollständig an. Es wurde nichts geändert."],
    ["andere Version", netzMit(Object.assign({}, karte, { [REL("1.2.3") + "system-dateien.json"]: L4, [SIG_URL("1.2.3")]: signieren(L4) })), "Die echte Fassung kam nicht vollständig an. Es wurde nichts geändert."],
    ["abgebrochen", netzMit(karte), null],
  ];
  for (const [name, netz, text] of schief) {
    const liste = { [LISTE]: listeBauen("1.2.3", BOESE), [SIG]: "kein armor\n" };
    const x = await kern({ dateien: tresor(liste), netz });
    try {
      x.k.testAntworten = [false];
      assert.equal(await x.k.reparierenFragen(), false, name);
      if (text) assert.deepEqual(x.texte().slice(-1), [text], name);
      else assert.deepEqual(x.k.testAntworten, [], name + ": gefragt");
      assert.equal(x.tresor.text(LISTE), liste[LISTE], name);
      assert.equal(x.tresor.text(SIG), liste[SIG], name);
      assert.ok(![...x.tresor.daten.keys()].some((q) => q.startsWith(".trash/")), name + ": keine Sicherung");
      assert.deepEqual(globalThis.AUSGEWERTET, [], name);
    } finally { x.weg(); }
  }
});

test("Ereignisse während des ersten Ladens gehen nicht verloren: kommt die Signatur per Sync, während der Kern noch auf das Release wartet, laufen die Skripte danach", async () => {
  const d = dateienBauen("1.2.3", STAND, { sig: false }), sigEcht = signieren(d[LISTE]);
  let los;
  const warten = new Promise((r) => { los = r; });
  globalThis.AUSGEWERTET = [];
  const x = K.aufbau({ version: "1.2.3", schluessel: [SCHLUESSEL.oeffentlich], dateien: d, netz: async () => { await warten; return { status: 404 }; } });
  const start = x.start();
  try {
    await bis(() => x.anfragen.length === 1, "Abruf läuft");
    x.tresor.setzen(SIG, sigEcht);
    los();
    await start;
    assert.equal(x.k.pruefung.zustand, "ohne-signatur", "beim ersten Laden fehlte sie noch");
    for (let i = 0; i < 800 && (x.k.registriert || []).length < 2; i++) await new Promise((r) => setTimeout(r, 5));
    assert.equal(x.k.pruefung.zustand, "signiert");
    assert.deepEqual(x.k.registriert, ["a@1", "b@1"]);
    assert.equal(x.anfragen.length, 1);
  } finally { x.weg(); }
});

test("Während des ersten Ladens geändert, gelöscht, neu: ein untergeschobenes Skript läuft nie, ein gelöschtes ist weg, ein fremdes wartet gesperrt", async () => {
  const d = dateienBauen("1.2.3", STAND, { sig: false }), sigEcht = signieren(d[LISTE]);
  let los;
  const warten = new Promise((r) => { los = r; });
  globalThis.AUSGEWERTET = [];
  const x = K.aufbau({ version: "1.2.3", schluessel: [SCHLUESSEL.oeffentlich], dateien: d,
    netz: async () => { await warten; return { status: 200, bytes: sigEcht }; } });
  const start = x.start();
  try {
    await bis(() => x.anfragen.length === 1, "Abruf läuft");
    x.tresor.setzen(pfad("a"), skript("a", 666));
    x.tresor.loeschen(pfad("b"));
    x.tresor.setzen(pfad("c"), skript("c"));
    los();
    await start;
    await new Promise((r) => setTimeout(r, 1700));
    await x.k.nachpruefenLauf;
    assert.equal(x.k.pruefung.zustand, "signiert");
    assert.deepEqual(globalThis.AUSGEWERTET, [], "weder a@666 noch c liefen");
    assert.deepEqual(gesperrt(x), ["a", "c"]);
    assert.equal(x.k.abgelehnt.a.grund, "geaendert");
    assert.equal(x.k.skripte.b, undefined, "b ist weg");
  } finally { x.weg(); }
});

// Diese Zustände kann jeder herstellen, der in den Tresor schreibt
test("Hinweis ohne geltende Liste (Signatur falsch oder fehlt, Liste fehlt, kaputt oder alt): nur Reparieren, nie Entwicklermodus oder Erlauben", async () => {
  const L = listeBauen("1.2.3", STAND), sigEcht = signieren(L);
  const karte = { [SIG_URL("1.2.3")]: sigEcht, [REL("1.2.3") + "system-dateien.json"]: L };
  let netzOk = false;
  const netz = async (url) => { if (!netzOk) throw new Error("offline"); return karte[url] ? { status: 200, bytes: karte[url] } : { status: 404 }; };
  const faelle = [
    ["signatur-ungueltig", { [LISTE]: L, [SIG]: "kaputt\n" }, "Die App startet nicht, weil sich die Liste ihrer Teile nicht prüfen lässt (a, b). Reparieren"],
    ["ohne-signatur", { [LISTE]: L }, "Die App startet, sobald sie einmal geprüft hat, dass ihre Teile echt sind (a, b). Dafür braucht dieses Gerät einmal eine Verbindung zum Internet. Ist es verbunden, tippe auf „Reparieren“. Reparieren"],
    ["keine-liste", {}, "Die App startet nicht, weil im Tresor die Liste ihrer Teile fehlt (a, b). Reparieren"],
    ["liste-ungueltig", { [LISTE]: "{" }, "Die App startet nicht, weil sich die Liste ihrer Teile nicht prüfen lässt (a, b). Reparieren"],
    ["zurueck", { [LISTE]: listeBauen("1.2.2", STAND), [SIG]: signieren(listeBauen("1.2.2", STAND)) }, "Die App startet nicht, weil im Tresor die Liste einer älteren Version liegt (a, b). Reparieren"],
  ];
  for (const [zustand, liste, text] of faelle) {
    netzOk = false;
    const x = await kern({ dateien: Object.assign({ [pfad("a")]: STAND.a, [pfad("b")]: STAND.b }, liste), netz });
    try {
      assert.equal(x.k.pruefung.zustand, zustand);
      x.k.ablehnungZeigen();
      assert.equal(x.hinweise[0].text, text, zustand);
      assert.deepEqual(x.hinweise[0].el.alle().filter((e) => e.tag === "button").map((e) => e.text), ["Reparieren"], zustand);
      assert.doesNotMatch(x.hinweise[0].text, /Entwickl|erlaub/i, zustand);
      // Online fragt der Kern von selbst nur, wenn die Signatur fehlt; Reparieren hilft in jedem Fall
      netzOk = true;
      x.k.testAntworten = [true];
      assert.equal(await x.k.reparierenFragen(), true, zustand);
      assert.equal(x.k.pruefung.zustand, "signiert", zustand);
      assert.deepEqual(globalThis.AUSGEWERTET, ["a@1", "b@1"], zustand);
    } finally { x.weg(); }
  }
});

test("Hinweis: geänderte Teile mit Reparieren, unbekannte nur „gehört nicht zur App“, ohne den Befehl zum Erlauben", async () => {
  const x = await kern({ dateien: dateienBauen("1.2.3", STAND, { ist: { b: STAND.b + " " }, extra: { [pfad("meins")]: skript("meins") } }) });
  try {
    x.k.ablehnungZeigen();
    assert.equal(x.hinweise[0].text, "Ein Teil der App wurde nicht gestartet, weil er nicht zur installierten Version passt (b). meins gehört nicht zur App und wurde nicht geladen. Reparieren");
    assert.doesNotMatch(x.hinweise[0].text, /erlauben/);
  } finally { x.weg(); }
});

test("Hinweis auf gesperrte Skripte bleibt stehen, bis alles läuft; geschlossen holt ihn am Computer ein Eintrag in der Statusleiste zurück", async () => {
  const x = await kern({ dateien: dateienBauen("1.2.3", STAND, { ist: { b: STAND.b + " " } }) });
  try {
    assert.deepEqual(x.k.ersatzStatus, [], "vor dem Hinweis kein Eintrag");
    x.k.ablehnungZeigen();
    assert.equal(x.hinweise.length, 1);
    assert.equal(x.hinweise[0].dauer, 0, "ohne Zeitgrenze");
    assert.equal(x.offen().length, 1);
    assert.equal(x.k.ersatzStatus.length, 1);
    const zeichen = x.k.ersatzStatus[0];
    assert.equal(zeichen.text, "Studium Autopilot prüfen");
    assert.equal(zeichen.attr["aria-label"], "Hinweis noch einmal zeigen");
    assert.match(zeichen.cls, /\bmod-clickable\b/);
    // Geschlossen: derselbe Stand kommt von selbst nicht wieder, am Computer auch nicht beim Öffnen des Dashboards
    x.hinweise[0].schliessen();
    assert.deepEqual(x.offen(), []);
    assert.equal(x.k.ablehnungZeigen(), null);
    x.oeffnen("Dashboard.md");
    assert.equal(x.hinweise.length, 1);
    assert.ok(!zeichen.entfernt, "der Eintrag bleibt");
    // Ein Klick darauf zeigt ihn wieder, mit seinen Knöpfen; ein weiterer ersetzt ihn, nie zwei
    zeichen.lauscher.click();
    assert.equal(x.hinweise.length, 2);
    assert.equal(x.hinweise[1].text, x.hinweise[0].text);
    assert.equal(x.hinweise[1].dauer, 0);
    assert.ok(knopf(x.hinweise[1], "Reparieren"));
    zeichen.lauscher.click();
    assert.equal(x.hinweise.length, 3);
    assert.deepEqual(x.offen(), [x.hinweise[2]], "nie zwei");
    // Ein weiteres gesperrtes Skript: der neue Hinweis ersetzt den offenen, der Eintrag bleibt einer
    x.tresor.setzen(pfad("a"), STAND.a + " ", { still: true });
    await x.k.skriptNeuLaden(datei(x, "a"));
    x.k.ablehnungZeigen();
    assert.equal(x.hinweise.length, 4);
    assert.match(x.hinweise[3].text, /\(a, b\)/);
    assert.deepEqual(x.offen(), [x.hinweise[3]]);
    assert.equal(x.k.ersatzStatus.length, 1);
    // Wieder echt (Hot-Reload, dann „Erweiterungen neu laden“): erst wenn nichts mehr gesperrt ist, gehen Hinweis und Eintrag
    x.tresor.setzen(pfad("a"), STAND.a, { still: true });
    await x.k.skriptNeuLaden(datei(x, "a"));
    assert.equal(x.offen().length, 1, "b ist noch gesperrt");
    x.tresor.setzen(pfad("b"), STAND.b, { still: true });
    await x.k.skripteLaden(false);
    assert.deepEqual(gesperrt(x), []);
    assert.deepEqual(x.offen(), []);
    assert.ok(zeichen.entfernt);
    zeichen.lauscher.click(); // ein Klick, der zu spät kommt
    assert.equal(x.hinweise.length, 4, "nichts gesperrt: kein Hinweis");
  } finally { x.weg(); }
  // Entladen (Neu laden, Update): Hinweis und Eintrag gehen mit, die nächste Instanz zeigt ihre eigenen
  const y = await kern({ dateien: dateienBauen("1.2.3", STAND, { ist: { b: STAND.b + " " } }) });
  y.k.ablehnungZeigen();
  y.weg();
  assert.deepEqual(y.offen(), []);
  assert.ok(y.k.ersatzStatus[0].entfernt);
});

test("Ohne Netz beim ersten Start: der Hinweis wartet ohne Zeitgrenze, die Statusleiste sagt „wartet“; Reparieren ohne Netz lässt den Weg zurück, die Signatur schließt beides", async () => {
  const d = dateienBauen("1.2.3", STAND, { sig: false });
  const x = await kern({ dateien: d, netz: async () => { throw new Error("offline"); } });
  try {
    x.k.ablehnungZeigen();
    assert.match(x.hinweise[0].text, /^Die App startet, sobald sie einmal geprüft hat/);
    assert.equal(x.hinweise[0].dauer, 0);
    const zeichen = x.k.ersatzStatus[0];
    assert.equal(zeichen.text, "Studium Autopilot wartet");
    // Der Knopf schließt den Hinweis; ohne Netz klappt Reparieren nicht, der Eintrag bleibt und zeigt ihn wieder
    knopf(x.hinweise[0], "Reparieren").lauscher.click();
    assert.ok(x.hinweise[0].weg);
    await bis(() => x.texte().includes("Keine Verbindung. Versuch es später noch einmal."), "Reparieren ohne Netz");
    assert.ok(!zeichen.entfernt);
    zeichen.lauscher.click();
    assert.equal(x.offen().filter((h) => h.dauer === 0).length, 1);
    assert.match(x.hinweise[x.hinweise.length - 1].text, /^Die App startet, sobald/);
    // Die Signatur kommt (Sync): alle Skripte laufen, Hinweis und Eintrag gehen von selbst
    x.tresor.setzen(SIG, signieren(d[LISTE]), { still: true });
    await x.k.skripteNachpruefen();
    assert.deepEqual(globalThis.AUSGEWERTET, ["a@1", "b@1"]);
    assert.deepEqual(x.offen().filter((h) => h.dauer === 0), []);
    assert.ok(zeichen.entfernt);
  } finally { x.weg(); }
});

test("Mobil ohne Statusleiste: geschlossen, zeigt das Öffnen von Dashboard oder Einstellungen & Hilfe den Hinweis wieder, andere Seiten nicht", async () => {
  const x = await kern({ dateien: dateienBauen("1.2.3", STAND, { ist: { b: STAND.b + " " } }) });
  try {
    x.obs.Platform.isMobile = true;
    x.oeffnen("Dashboard.md");
    assert.deepEqual(x.hinweise, [], "vor dem ersten Hinweis nicht (er kommt kurz nach dem Start)");
    x.k.ablehnungZeigen();
    assert.equal(x.hinweise[0].dauer, 0);
    assert.deepEqual(x.k.ersatzStatus, [], "keine Statusleiste");
    x.oeffnen("Dashboard.md");
    assert.equal(x.hinweise.length, 1, "offen: kein zweiter");
    x.hinweise[0].schliessen();
    x.oeffnen("Module/B110.md");
    x.oeffnen("System/Einstellungen.md");
    x.oeffnen(null);
    assert.equal(x.hinweise.length, 1, "andere Seiten nicht");
    x.oeffnen("Dashboard.md");
    assert.equal(x.hinweise.length, 2);
    assert.equal(x.hinweise[1].text, x.hinweise[0].text);
    assert.ok(knopf(x.hinweise[1], "Reparieren"));
    assert.deepEqual(x.offen(), [x.hinweise[1]]);
    // Auf dem iPhone lässt er sich auch wegwischen: Obsidian nimmt ihn aus dem Dokument, ohne Tipp
    x.hinweise[1].weg = true;
    x.k.stillBis = Date.now() + 60000;
    x.oeffnen("Studium/Einstellungen & Hilfe.md");
    assert.equal(x.hinweise.length, 2, "nicht während eines Updates");
    x.k.stillBis = 0;
    x.oeffnen("Studium/Einstellungen & Hilfe.md");
    assert.equal(x.hinweise.length, 3);
    assert.deepEqual(x.offen(), [x.hinweise[2]]);
    // Repariert: Hinweis weg, das Dashboard zeigt nichts mehr
    x.tresor.setzen(pfad("b"), STAND.b, { still: true });
    await x.k.skriptNeuLaden(datei(x, "b"));
    assert.deepEqual(x.offen(), []);
    x.oeffnen("Dashboard.md");
    assert.equal(x.hinweise.length, 3);
  } finally { x.weg(); }
});

test("Kein Link erreicht die neuen Befehle: obsidian://studium-autopilot kennt nur Aktionen, keine Aktion ist einer davon", async () => {
  const x = await kern({ dateien: dateienBauen("1.2.3", STAND, { extra: { [pfad("meins")]: skript("meins") } }) });
  try {
    const vorher = JSON.stringify([...x.speicher.m]);
    x.k.testAntworten = [true, pfad("meins"), true, true];
    const namen = ["skripte-reparieren", "skript-erlauben", "entwicklermodus-an", "entwicklermodus-aus", "reparierenFragen", "reparieren",
      "erlaubenFragen", "entwicklerFragen", "entwicklerAus", "skripteNachpruefen", "listeAuswerten", "skripteLaden", "zulassen", "lokal",
      "testversionenSetzen", "zielListeHolen", "zielVersion", "listeErsetzen", "kern-aufholen", "kernAufholenFragen", "kernAufholen",
      "kernNeuStarten", "aktion-entwicklermodus-an", "__proto__", "constructor", "toString"];
    for (const aktion of namen) await x.k.aktionAusfuehren(aktion, { aktion, pfad: pfad("meins"), an: "1" }, { extern: true });
    for (const aktion of namen) x.protokoll({ aktion, pfad: pfad("meins"), an: "1" }); // wie Obsidian: ohne auf das Ergebnis zu warten
    await bis(() => x.hinweise.length === 2 * namen.length, "je Link ein Hinweis");
    assert.equal(x.k.testAntworten.length, 4, "keine Frage gestellt");
    assert.equal(JSON.stringify([...x.speicher.m]), vorher, "Gerätespeicher unverändert");
    assert.deepEqual(gesperrt(x), ["meins"]);
    assert.ok(x.texte().every((t) => t === "Dieser Knopf geht gerade nicht. Bitte kurz warten oder Obsidian neu starten."));
    for (const id of ["skripte-reparieren", "skript-erlauben", "entwicklermodus-an", "entwicklermodus-aus", "kern-aufholen"]) {
      assert.ok(x.k.ersatzBefehle[id], "Befehl " + id);
      assert.ok(!Object.prototype.hasOwnProperty.call(x.k.aktionen, id), "keine Aktion " + id);
    }
  } finally { x.weg(); }
  // Kein Skript der App ruft sie auf oder fasst den Gerätespeicher der Prüfung an
  const ordner = path.join(__dirname, "..", "Studium Autopilot", "System", "Skripte");
  for (const n of fs.readdirSync(ordner).filter((d) => d.endsWith(".js"))) {
    const code = fs.readFileSync(path.join(ordner, n), "utf8");
    assert.doesNotMatch(code, /eba-skripte-|\b(?:entwicklerFragen|entwicklerAus|erlaubenFragen|reparierenFragen|skripteNachpruefen|listeAuswerten|erlaubtAufGeraet|ablehnungZeigen|ablehnungSeite|testversionenSetzen|zielListeHolen|listeErsetzen|kernAufholenFragen|kernAufholen|kernNeuStarten)\b/, n);
    // Listen von Testversionen schaltet nur der Schalter „Beta-Versionen“ in update.js frei
    assert.equal((code.match(/skripte\.beta\(/g) || []).length, n === "update.js" ? 1 : 0, n);
  }
});

test("Hot-Reload über Ereignisse: Liste und Signatur per Sync (create/modify) laden wartende Skripte nach 1,5 s; nie während eines Updates ein Hinweis", async () => {
  const NEU = { a: skript("a", 2), b: STAND.b };
  const listeNeu = listeBauen("1.2.4", NEU);
  const x = await kern({ dateien: dateienBauen("1.2.3", STAND) });
  try {
    x.tresor.setzen(pfad("a"), NEU.a);
    x.tresor.setzen(SIG, signieren(listeNeu));
    x.tresor.setzen(LISTE, listeNeu);
    await bis(() => (x.k.registriert || []).includes("a@2"), "a@2 geladen");
    await x.k.nachpruefenLauf;
    assert.deepEqual(gesperrt(x), []);
    // Gesperrt während eines Updates (stillBis): Hinweis erst danach
    x.tresor.setzen(pfad("b"), STAND.b + " ", { still: true });
    await x.k.skriptNeuLaden(datei(x, "b"));
    x.k.stillBis = Date.now() + 60000;
    assert.equal(x.k.ablehnungZeigen(), null);
    assert.ok(x.k.ablehnungTimer, "neu geplant");
    x.k.stillBis = 0;
    assert.ok(x.k.ablehnungZeigen());
  } finally { x.weg(); }
});
