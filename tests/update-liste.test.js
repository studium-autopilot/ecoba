// Mitzählen ohne eigenen Abruf (update.js, seit 0.7.1): Das Update lädt die Dateiliste zuerst als Datei system-dateien.json aus
// dem GitHub-Release der neuen Version (GitHub zählt die Abrufe je Version), sonst still wie bisher frisch vom Tag. Verwendet wird
// nur eine Liste mit der Prüfsumme aus dem Manifest. Bis 0.7.0 rief jedes Gerät zaehler.txt ab, mit einem Schalter „Mitzählen“;
// wer ihn ausgeschaltet hat (zaehlen: false), lädt die Liste nur vom Tag. Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { laden } = require("./laden.js");

const U = laden("update").ctx.update;
const enc = (s) => new TextEncoder().encode(s);
const dec = (b) => new TextDecoder("utf-8").decode(b);
const RELEASES = "https://github.com/studium-autopilot/ecoba/releases";
const BASIS = (v) => `https://raw.githubusercontent.com/studium-autopilot/ecoba/v${v}/`;
const ASSET = (v) => `${RELEASES}/download/v${v}/system-dateien.json`;
const ROH = (v) => BASIS(v) + "Studium%20Autopilot/System/Daten/system-dateien.json";

async function listeBauen(version, dateien) {
  const liste = { schema: 1, version, ordner: "Studium Autopilot", erstellt: "2026-10-27T12:00:00Z", dateien: [] };
  for (const pfad of Object.keys(dateien).sort()) {
    const by = enc(dateien[pfad]);
    liste.dateien.push({ pfad, klasse: U.klasseVon(pfad), groesse: by.length, sha256: await U.sha256(by) });
  }
  return liste;
}
const KERN = ".obsidian/plugins/studium-autopilot/";
const stand = (v) => ({ [KERN + "main.js"]: `// kern ${v}\n`, [KERN + "manifest.json"]: `{"version":"${v}"}\n`, "Dashboard.md": `# Dashboard ${v}\n` });
const ALT = stand("0.7.1"), NEU = stand("0.7.2");
const FREMD = "System/Skripte/fremd.js"; // steht nur in einer Liste, die nicht zur Prüfsumme passt

// Update von 0.7.1 auf 0.7.2 mit aktualisierenMit. o.asset: Antwort auf die Liste aus dem Release ("gleich" | "anders" | "gross" |
// "404" | "netz"), o.roh: Antwort vom Tag ("gleich" | "anders"), o.ohneAsset: listeRelease = null.
async function lauf(o) {
  const text = JSON.stringify(await listeBauen("0.7.2", NEU), null, 1);
  const anders = JSON.stringify(await listeBauen("0.7.2", Object.assign({}, NEU, { [FREMD]: "// fremd\n" })), null, 1);
  const abrufe = [], m = new Map(Object.entries(ALT).map(([k, v]) => [k, enc(v)]));
  const io = {
    holen: async (url, x) => {
      abrufe.push({ url, frisch: !!(x && x.frisch) });
      if (url === ASSET("0.7.2")) {
        if (o.asset === "netz") throw new Error("offline");
        if (o.asset === "404") throw new Error("HTTP 404");
        return o.asset === "gross" ? new Uint8Array(2097153) : enc(o.asset === "anders" ? anders : text);
      }
      if (url === ROH("0.7.2")) return enc(o.roh === "anders" ? anders : text);
      const pfad = decodeURIComponent(url.slice((BASIS("0.7.2") + "Studium%20Autopilot/").length));
      if (url.startsWith(BASIS("0.7.2")) && Object.prototype.hasOwnProperty.call(NEU, pfad)) return enc(NEU[pfad]);
      throw new Error("HTTP 404");
    },
    lesen: async (p) => (m.has(p) ? m.get(p) : null),
    schreiben: async (p, b) => { m.set(p, b); },
    loeschen: async (p) => { m.delete(p); },
  };
  const release = { version: "0.7.2", url_basis: BASIS("0.7.2"), sha256: await U.sha256(enc(text)), notiz: "" };
  const b = await U.aktualisierenMit(io, { release, alt: U.listePruefen(await listeBauen("0.7.1", ALT)).wert, altVersion: "0.7.1",
    zeit: new Date(2026, 9, 27, 12, 0), listeRelease: o.ohneAsset ? null : ASSET("0.7.2") });
  return { b, abrufe, m, text, listen: abrufe.filter((a) => a.url.includes("system-dateien.json")) };
}

test("Liste aus dem Release: passt die Prüfsumme, wird sie verwendet, ohne Abruf vom Tag", async () => {
  const r = await lauf({ asset: "gleich" });
  assert.equal(r.b.ok, true, r.b.fehler);
  assert.equal(r.b.listeQuelle, "release");
  assert.deepEqual(r.listen, [{ url: ASSET("0.7.2"), frisch: false }], "Releases sind unveränderlich: ohne frisch");
  assert.equal(dec(r.m.get("Dashboard.md")), NEU["Dashboard.md"]);
  assert.equal(dec(r.m.get(U.LISTE)), r.text, "die geprüfte Liste kommt in den Tresor");
});

test("Liste aus dem Release: bei 404, ohne Netz, falscher Prüfsumme oder zu groß still vom Tag", async () => {
  for (const asset of ["404", "netz", "anders", "gross"]) {
    const r = await lauf({ asset });
    assert.equal(r.b.ok, true, asset + ": " + r.b.fehler);
    assert.equal(r.b.listeQuelle, "raw", asset);
    assert.deepEqual(r.listen, [{ url: ASSET("0.7.2"), frisch: false }, { url: ROH("0.7.2"), frisch: true }], asset);
    assert.equal(dec(r.m.get("Dashboard.md")), NEU["Dashboard.md"], asset);
    // Die Liste mit der falschen Prüfsumme nennt eine Datei mehr: Sie wird nie geladen und nie geschrieben
    assert.ok(!r.abrufe.some((a) => a.url.endsWith("fremd.js")) && !r.m.has(FREMD), asset);
    assert.equal(dec(r.m.get(U.LISTE)), r.text, asset);
  }
});

test("Liste: passt auch die vom Tag nicht, wird nichts geschrieben", async () => {
  const r = await lauf({ asset: "anders", roh: "anders" });
  assert.deepEqual([r.b.ok, r.b.art, r.b.listeQuelle], [false, "pruefsumme", ""]);
  assert.equal(dec(r.m.get("Dashboard.md")), ALT["Dashboard.md"]);
  assert.ok(!r.m.has(U.LISTE));
});

test("Liste ohne Adresse im Release (listeRelease null): nur vom Tag, frisch", async () => {
  const r = await lauf({ ohneAsset: true });
  assert.equal(r.b.ok, true, r.b.fehler);
  assert.equal(r.b.listeQuelle, "raw");
  assert.deepEqual(r.listen, [{ url: ROH("0.7.2"), frisch: true }]);
});

test("Adresse der Liste im Release: RELEASES aus zentral.js, ein Fork setzt seine eigene", () => {
  assert.equal(U.listeReleaseUrl("0.7.2"), ASSET("0.7.2"), "ohne zentral.js die Vorgabe");
  assert.equal(U.listeReleaseUrl("0.8.0-beta.1"), `${RELEASES}/download/v0.8.0-beta.1/system-dateien.json`);
  const fork = laden("update", { kontext: { zentral: { RELEASES: "https://github.com/beispiel/fork/releases" } } }).ctx.update;
  assert.equal(fork.listeReleaseUrl("1.0.0"), "https://github.com/beispiel/fork/releases/download/v1.0.0/system-dateien.json");
});

// update.js wie in Obsidian, mit Manifest (Angebot 0.7.2), Einstellungen (Frontmatter) und Gerätespeicher; ohne Netz
// (anfragen: jeder Abruf über requestUrl). Das Update antwortet ohne Fenster (testUpdateAntwort).
function geraet(o = {}) {
  const anfragen = [], speicher = new Map(o.speicher || []), zaehler = { manifest: 0 };
  const rel = { version: "0.7.2", url_basis: BASIS("0.7.2"), sha256: "a".repeat(64), notiz: "" };
  const L = laden("update", {
    frontmatter: { "System/Einstellungen.md": Object.assign({ typ: "einstellungen" }, o.einstellungen) },
    kontext: {
      obsidian: { requestUrl: async (p) => { anfragen.push(p); throw new Error("kein Netz im Test"); } },
      plugin: Object.assign({ manifest: { version: "0.7.1" }, testUpdateAntwort: true }, o.plugin),
      zentral: {
        geraetId: () => "g-ich", stand: () => ({ release: rel, beta: null, plugin_aktuell: "0.7.2", geprueft: o.geprueft || new Date().toISOString() }),
        status: () => ({ an: true }), manifestHolen: async () => { zaehler.manifest++; return { release: rel, beta: null }; },
        abruferHier: async () => true, frischUrl: (u) => u + "?t=7", FRISCH_KOPF: { "Cache-Control": "no-cache" },
      },
      zeit: (f) => { f(); return 0; },
    },
  });
  L.ctx.app.vault.adapter = { stat: async () => null, exists: async () => false, mkdir: async () => {}, writeBinary: async () => {} };
  L.ctx.app.loadLocalStorage = (k) => (speicher.has(k) ? speicher.get(k) : null);
  L.ctx.app.saveLocalStorage = (k, v) => { if (v == null) speicher.delete(k); else speicher.set(k, v); };
  L.ctx.app.metadataCache.initialized = true;
  return { U: L.ctx.update, registrieren: L.ergebnis.registrieren, anfragen, speicher, zaehler };
}
const listenVon = (G) => G.anfragen.filter((a) => a.url.includes("system-dateien.json")).map((a) => a.url);

test("Update: zuerst die Liste aus dem Release der neuen Version, ohne Netz dann vom Tag", async () => {
  const G = geraet();
  const b = await G.U.aktualisieren();
  assert.equal(b.art, "netz");
  assert.deepEqual(listenVon(G), [ASSET("0.7.2"), ROH("0.7.2") + "?t=7"]);
});

test("Update: nur vom Tag mit zaehlen: false (Mitzählen bis 0.7.0 aus) und mit plugin.testUpdateBasis", async () => {
  let G = geraet({ einstellungen: { zaehlen: false } });
  await G.U.aktualisieren();
  assert.deepEqual(listenVon(G), [ROH("0.7.2") + "?t=7"]);
  G = geraet({ einstellungen: { zaehlen: true } });
  await G.U.aktualisieren();
  assert.deepEqual(listenVon(G), [ASSET("0.7.2"), ROH("0.7.2") + "?t=7"], "zaehlen: true wie ohne Feld");
  G = geraet({ plugin: { testUpdateBasis: "http://127.0.0.1:8080/" } });
  await G.U.aktualisieren();
  assert.deepEqual(listenVon(G), ["http://127.0.0.1:8080/Studium%20Autopilot/System/Daten/system-dateien.json?t=7"]);
});

test("Start: kein Abruf zum Zählen mehr, der Merker eba-update-gezaehlt (bis 0.7.0) ist weg", async () => {
  const dokument = globalThis.document;
  globalThis.document = { visibilityState: "visible" };
  const fehler = console.error;
  console.error = () => {};
  try {
    // Letzte Prüfung lange her: Der Start holt das Manifest frisch (wie bisher), sonst nichts
    const G = geraet({ speicher: [["eba-update-gezaehlt", "0.7.0"], ["eba-update-gesehen", "0.7.1"]], geprueft: "2026-10-01T00:00:00Z" });
    G.registrieren();
    await new Promise((f) => setTimeout(f, 20));
    assert.equal(G.zaehler.manifest, 1, "die frische Prüfung lief");
    assert.deepEqual(G.anfragen.map((a) => a.url), [], "beim Start ruft update.js nichts über requestUrl ab");
    assert.equal(G.speicher.has("eba-update-gezaehlt"), false);
    assert.equal(G.speicher.get("eba-update-gesehen"), "0.7.1", "andere Merker bleiben");
    assert.equal(G.U.zaehlen, undefined);
    assert.equal(G.U.zaehlenSchalter, undefined);
  } finally {
    console.error = fehler;
    if (dokument === undefined) delete globalThis.document; else globalThis.document = dokument;
  }
});
