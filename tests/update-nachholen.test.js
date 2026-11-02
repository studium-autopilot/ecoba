// Nachholen und Reparieren nach dem Update (update.js, seit 02.11.2026): Was „Neu laden“ (Kern nachholen), die Reparatur und die
// Hinweise für Claude schreiben, kommt nur aus einer Liste, die der Kern geprüft und angenommen hat (ctx.skripte), nie aus einer
// Version älter als der laufende Kern. installiert.json im Tresor kann jeder ändern, der dort schreibt: Eine untergeschobene
// ältere Fassung lädt keinen alten Kern und keine alten Hinweise für Claude. Ein Link von außen installiert nichts und lädt nichts
// neu. Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { laden } = require("./laden.js");

const enc = (s) => new TextEncoder().encode(s);
const dec = (b) => new TextDecoder("utf-8").decode(b);
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const KERN = ".obsidian/plugins/studium-autopilot/";
const INSTALLIERT = "System/Daten/installiert.json", LISTE = "System/Daten/system-dateien.json";
const CLAUDE = ".claude/CLAUDE.md";
const ROH = "https://test.invalid/";
const url = (v, pfad) => ROH + "v" + v + "/" + ("Studium Autopilot/" + pfad).split("/").map(encodeURIComponent).join("/");

// Liste einer Version: Kern (main.js, manifest.json) und die Hinweise für Claude, je mit Text dieser Version
const kernText = (v) => `// kern ${v}\n`, manifestText = (v) => JSON.stringify({ id: "studium-autopilot", version: v }) + "\n";
const eintrag = (pfad, text, klasse) => { const b = enc(text); return { pfad, klasse, sha256: sha(b), groesse: b.length }; };
const listeText = (v) => JSON.stringify({ schema: 1, version: v, ordner: "Studium Autopilot",
  dateien: [eintrag(KERN + "main.js", kernText(v), "system"), eintrag(KERN + "manifest.json", manifestText(v), "system")],
  weitere: [eintrag(CLAUDE, `# Claude ${v}\n`, "claude")] }) + "\n";
// Das Release jeder Version am Tag: Kern und Hinweise für Claude
const netzFuer = (...versionen) => {
  const n = {};
  for (const v of versionen) {
    n[url(v, KERN + "main.js")] = enc(kernText(v));
    n[url(v, KERN + "manifest.json")] = enc(manifestText(v));
    n[url(v, CLAUDE)] = enc(`# Claude ${v}\n`);
  }
  return n;
};

// Gerät: Dateien im Adapter, Netz aus einer Tabelle, laufender Kern lauf, geprüfte Listen des Kerns (skripte: Versionen, deren
// listeText der Kern angenommen hat; null = Kern ohne ctx.skripte, bis 0.7.6)
const geraet = (o) => {
  const hinweise = [], abrufe = [], lokal = {};
  const geprueft = o.skripte === null ? undefined
    : { listen: () => (o.skripte || []).map((v) => ({ version: v, liste: sha(enc(listeText(v))) })) };
  const kontext = {
    obsidian: { Notice: class { constructor(t) { hinweise.push(String(t)); } setMessage() {} hide() {} }, Platform: { isMobile: false },
      requestUrl: async (a) => { abrufe.push(a.url); const b = (o.netz || {})[a.url]; return b ? { status: 200, arrayBuffer: b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) } : { status: 404 }; } },
    plugin: { manifest: { version: o.lauf } },
    zentral: { status: () => ({ an: true }), RELEASE_ROH: ROH, abruferHier: async () => true },
  };
  if (geprueft) kontext.skripte = geprueft;
  const r = laden("update", { kontext });
  const d = {};
  for (const p of Object.keys(o.dateien || {})) d[p] = enc(o.dateien[p]);
  const app = r.ctx.app;
  app.loadLocalStorage = (k) => (k in lokal ? lokal[k] : null);
  app.saveLocalStorage = (k, v) => { lokal[k] = v; };
  app.vault.adapter = {
    stat: async (p) => (d[p] ? { type: "file" } : null),
    readBinary: async (p) => d[p].buffer.slice(d[p].byteOffset, d[p].byteOffset + d[p].byteLength),
    writeBinary: async (p, buf) => { d[p] = new Uint8Array(buf); },
    exists: async (p) => !!d[p] || Object.keys(d).some((k) => k.indexOf(p + "/") === 0),
    mkdir: async () => {}, remove: async (p) => { delete d[p]; }, list: async () => ({ files: [], folders: [] }),
  };
  return { U: r.ctx.update, A: r.ergebnis.aktionen, d, lokal, hinweise, abrufe, text: (p) => (d[p] ? dec(d[p]) : null) };
};
// Tresor mit dem Kern einer Version auf der Platte
const kernAufPlatte = (v) => ({ [KERN + "main.js"]: kernText(v), [KERN + "manifest.json"]: manifestText(v) });
const stumm = async (fn) => { const e = console.error; console.error = () => {}; try { return await fn(); } finally { console.error = e; } };

test("Neu laden: installiert.json mit einer älteren Version (untergeschoben) lädt keinen alten Kern, es gilt die geprüfte Liste", async () => {
  // Kern 0.7.8 läuft, seine Liste ist geprüft; installiert.json nennt 0.7.6 mit den öffentlichen Prüfsummen dieser Version
  const g = geraet({ lauf: "0.7.8", skripte: ["0.7.8"], netz: netzFuer("0.7.6", "0.7.8"),
    dateien: Object.assign(kernAufPlatte("0.7.8"), { [LISTE]: listeText("0.7.8"), [INSTALLIERT]: listeText("0.7.6") }) });
  assert.equal((await g.U.gepruefteListe()).liste.version, "0.7.8");
  await stumm(() => g.A["vorlage-neu-laden"].ausfuehren({ extern: false }));
  assert.deepEqual(g.abrufe, [], "nichts geladen: der Kern der geprüften Liste liegt schon da");
  assert.equal(g.text(KERN + "main.js"), kernText("0.7.8"));
  // Auch wenn die Liste im Tresor fehlt: installiert.json allein gilt nie
  delete g.d[LISTE];
  assert.equal(await g.U.gepruefteListe(), null);
  await stumm(() => g.A["vorlage-neu-laden"].ausfuehren({ extern: false }));
  assert.deepEqual(g.abrufe, []);
  assert.equal(g.text(KERN + "main.js"), kernText("0.7.8"));
});

test("Neu laden: eine geprüfte neuere Liste holt den fehlenden Kern vom Tag dieser Version; eine nicht geprüfte nicht", async () => {
  // Update auf einem anderen Gerät: Liste und installiert.json 0.7.9 per Sync da (vom Kern geprüft), der Kern nicht
  const g = geraet({ lauf: "0.7.8", skripte: ["0.7.8", "0.7.9"], netz: netzFuer("0.7.9"),
    dateien: Object.assign(kernAufPlatte("0.7.8"), { [LISTE]: listeText("0.7.9"), [INSTALLIERT]: listeText("0.7.9") }) });
  await stumm(() => g.A["vorlage-neu-laden"].ausfuehren({ extern: false }));
  assert.deepEqual(g.abrufe.sort(), [url("0.7.9", KERN + "main.js"), url("0.7.9", KERN + "manifest.json")].sort());
  assert.equal(g.text(KERN + "main.js"), kernText("0.7.9"));
  // Dieselbe Liste, aber vom Kern nicht angenommen: nichts geladen
  const n = geraet({ lauf: "0.7.8", skripte: ["0.7.8"], netz: netzFuer("0.7.9"),
    dateien: Object.assign(kernAufPlatte("0.7.8"), { [LISTE]: listeText("0.7.9"), [INSTALLIERT]: listeText("0.7.9") }) });
  await stumm(() => n.A["vorlage-neu-laden"].ausfuehren({ extern: false }));
  assert.deepEqual(n.abrufe, []);
  assert.equal(n.text(KERN + "main.js"), kernText("0.7.8"));
});

test("Neu laden mit einem Kern ohne Prüfung der Skripte (bis 0.7.6): installiert.json nur für eine Version, nie älter als er", async () => {
  const neuer = geraet({ lauf: "0.7.6", skripte: null, netz: netzFuer("0.7.5", "0.7.7"),
    dateien: Object.assign(kernAufPlatte("0.7.6"), { [INSTALLIERT]: listeText("0.7.7") }) });
  await stumm(() => neuer.A["vorlage-neu-laden"].ausfuehren({ extern: false }));
  assert.equal(neuer.text(KERN + "main.js"), kernText("0.7.7"), "der Kern der neueren Version vom Tag");
  const aelter = geraet({ lauf: "0.7.6", skripte: null, netz: netzFuer("0.7.5"),
    dateien: Object.assign(kernAufPlatte("0.7.6"), { [INSTALLIERT]: listeText("0.7.5") }) });
  await stumm(() => aelter.A["vorlage-neu-laden"].ausfuehren({ extern: false }));
  assert.deepEqual(aelter.abrufe, []);
  assert.equal(aelter.text(KERN + "main.js"), kernText("0.7.6"));
});

test("Von außen (c.extern): Neu laden lädt nichts und schreibt nichts, sagt nur, wo es geht", async () => {
  const g = geraet({ lauf: "0.7.8", skripte: ["0.7.8", "0.7.9"], netz: netzFuer("0.7.9"),
    dateien: Object.assign(kernAufPlatte("0.7.8"), { [LISTE]: listeText("0.7.9"), [INSTALLIERT]: listeText("0.7.9") }) });
  await g.A["vorlage-neu-laden"].ausfuehren({ extern: true });
  assert.deepEqual(g.abrufe, []);
  assert.equal(g.text(KERN + "main.js"), kernText("0.7.8"));
  assert.deepEqual(g.hinweise, ["Neu laden geht nur in der App: Tippe dort auf „Neu laden“."]);
});

test("Reparatur und Hinweise für Claude: nur nach der geprüften Liste, nie nach einer älteren installiert.json", async () => {
  // installiert.json nennt 0.7.6 (untergeschoben); geprüft ist nur 0.7.8, deren Liste fehlt im Tresor: nichts nachgeholt
  const g = geraet({ lauf: "0.7.8", skripte: ["0.7.8"], netz: netzFuer("0.7.6", "0.7.8"),
    dateien: Object.assign(kernAufPlatte("0.7.8"), { [INSTALLIERT]: listeText("0.7.6"), [CLAUDE]: "# Claude 0.7.8\n" }) });
  assert.equal(await g.U.heilen(true), null);
  assert.deepEqual(g.abrufe, [], "keine alten Hinweise für Claude geladen");
  assert.equal(g.text(CLAUDE), "# Claude 0.7.8\n");
  // Mit der geprüften Liste im Tresor: nachgeholt wird ihre Version
  const h = geraet({ lauf: "0.7.8", skripte: ["0.7.8"], netz: netzFuer("0.7.8"),
    dateien: Object.assign(kernAufPlatte("0.7.8"), { [LISTE]: listeText("0.7.8"), [INSTALLIERT]: listeText("0.7.6") }) });
  assert.ok(await h.U.heilen(true));
  assert.deepEqual(h.abrufe, [url("0.7.8", CLAUDE)]);
  assert.equal(h.text(CLAUDE), "# Claude 0.7.8\n");
  // claudeNachholen selbst nimmt nie eine Version älter als der laufende Kern
  assert.equal(await h.U.claudeNachholen(true, { liste: JSON.parse(listeText("0.7.6")) }), null);
});

test("Update planen nach der geprüften Liste: installiert.json zählt dafür nicht, nie eine Version älter als der laufende Kern", async () => {
  const g = geraet({ lauf: "0.7.8", skripte: ["0.7.8"], dateien: { [LISTE]: listeText("0.7.8"), [INSTALLIERT]: listeText("0.7.6") } });
  assert.equal((await g.U.gepruefteListe()).liste.version, "0.7.8");
  const abrufe = [];
  const b = await g.U.aktualisierenMit({ holen: async (u) => { abrufe.push(u); throw new Error("nie"); } },
    { release: { version: "0.7.7", url_basis: url("0.7.7", ""), sha256: "0".repeat(64) }, altVersion: "0.7.6", kernVersion: "0.7.8", signatur: "https://test.invalid/sig" });
  assert.deepEqual([b.ok, b.art, abrufe], [false, "liste", []], "älter als der laufende Kern: nichts geladen");
});

test("Geprüfte Liste mit CRLF im Tresor (git unter Windows, Sync-Dienst): gilt wie im Kern, verglichen mit LF", async () => {
  const crlf = (t) => t.split("\n").join("\r\n");
  const g = geraet({ lauf: "0.7.8", skripte: ["0.7.8"], dateien: Object.assign(kernAufPlatte("0.7.8"), { [LISTE]: crlf(listeText("0.7.8")) }) });
  assert.equal((await g.U.gepruefteListe()).liste.version, "0.7.8");
  // Ein anderes Byte bleibt anders
  g.d[LISTE] = enc(crlf(listeText("0.7.8")) + " ");
  assert.equal(await g.U.gepruefteListe(), null);
});
