#!/usr/bin/env node
// Zentrale Daten (ecoba-daten, docs/daten-v1.md) für den Connector (mcp-quelle-server.mjs), der selbst kein Netz hat: holt
// manifest.json, termine.json und kapitel.json von GitHub Pages wie der Lauf (ZENTRAL in lauf.mjs), alle 15 Minuten, solange der
// Connector an ist (studium-server-zentral.timer). Jede Datei nur mit der Prüfsumme und Größe aus dem Manifest, jeder Eintrag geprüft
// wie im Plugin (zentral.js termineNormal, kapitelPruefen; tests/mcp-server.test.js vergleicht beides); was nicht passt, fällt
// einzeln weg. Eine Datei, deren Prüfsumme gleich blieb, lädt er nicht neu. Ergebnis: <Datenordner>/zentral/zentral-cache.json
// { schema, abgerufen, erstellt, sha, termine, kapitel }, 0644 (öffentliche Daten). Je Termin erstmals: wann er zum ersten Mal da
// war (beim allerersten Abruf 1970), damit der Connector nur Termine als neu nennt, die nach dem letzten Stand aus Obsidian kamen.
// Scheitert der Abruf, bleibt der letzte Stand, und abgerufen bleibt alt (der Connector sagt es dann). Mit pause im Manifest
// (Notbremse) bleiben die Einträge, wie sie sind.
//   node zentral.mjs        als studium-zentral, Datenordner aus STUDIUM_SERVER_DATEN
import { createHash } from "node:crypto";
import { mkdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { jsonLesen, schreibenAtomar } from "./dateien.mjs";
import { datumOk, KATEGORIEN, kapitelModulNormal, MODULCODE, saeubern, zentralTitel } from "./eingang.mjs";

export const BASIS = "https://studium-autopilot.github.io/ecoba-daten/v1/";
// Größen wie in docs/daten-v1.md („Dateien“)
const DATEIEN = { "termine.json": 1000000, "kapitel.json": 512 * 1024 };
const MANIFEST_MAX = 16 * 1024, TERMINE_MAX = 2000, KAPITEL_MAX = 60;
const ID = /^[a-z0-9](?:[a-z0-9-]{0,78}[a-z0-9])?$/;
const UHRZEIT = /^([01]\d|2[0-3]):([0-5]\d)(?:\s*[–-]\s*([01]\d|2[0-3]):([0-5]\d))?$/;
const FRUEH = "1970-01-01T00:00:00.000Z";
// Wie im Plugin (zentral.js): Bereiche, die es kennt; Links der Quelle nur https auf diese Domains; Zeitpunkt der Prüfung
const BEREICHE = ["schluesselqualifikation"];
const QUELLE_DOMAINS = ["uni-tuebingen.de", "ffwtuebingen.de"];
const ISO_ZEIT = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const tage = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);
// Ort und Info wie textFeld im Plugin (titelZeichenWeg): Pfeile als Zeichen, keine spitzen, eckigen oder geschweiften Klammern, kein | oder \
const zeichenWeg = (s) => s.replace(/-+>|=>/g, "→").replace(/<-+/g, "←").replace(/[<>]/g, "").replace(/ {2,}/g, " ").trim()
  .replace(/[[{]/g, "(").replace(/[\]}]/g, ")").replace(/[|\\]/g, "/");
function datenText(v, max) {
  if (v == null || v === "") return { wert: "" };
  if (typeof v !== "string") return { fehler: "kein Text" };
  if (v.length > max * 4 + 1000) return { fehler: "zu lang" };
  const r = saeubern(v, Infinity, false);
  if (r.fehler) return r;
  const w = zeichenWeg(r.wert);
  return w.length > max ? { fehler: "zu lang" } : { wert: w };
}
function quelleOk(v) {
  if (v == null || v === "") return true;
  if (typeof v !== "string" || v.length > 500 || /[\s"'<>`\\]/.test(v)) return false;
  try {
    const u = new URL(v), h = u.hostname.toLowerCase();
    return u.protocol === "https:" && !u.username && !u.password && !u.port && QUELLE_DOMAINS.some((d) => h === d || h.endsWith("." + d));
  } catch (e) {
    return false;
  }
}

// Ein Eintrag aus termine.json wie termineNormal im Plugin (dazu der Titel nie wie eine Anweisung, zentralTitel) → { wert } | { fehler }.
// Was das Plugin prüft, aber der Connector nicht braucht (quelle_url, quelle_text, geprueft), nur geprüft: Verwirft das Plugin einen
// Termin deswegen, zeigt ihn auch der Connector nicht.
export function zentralerTermin(e) {
  if (!istObjekt(e)) return { fehler: "kein Objekt" };
  if (typeof e.id !== "string" || !ID.test(e.id)) return { fehler: "id ungültig" };
  const titel = zentralTitel(e.titel);
  if (titel.fehler) return { fehler: titel.fehler };
  if (!datumOk(e.datum)) return { fehler: "datum ungültig" };
  let bis = "";
  if (e.bis != null && e.bis !== "") {
    if (!datumOk(e.bis) || e.bis < e.datum || tage(e.datum, e.bis) > 400) return { fehler: "bis ungültig" };
    bis = e.bis === e.datum ? "" : e.bis;
  }
  let uhrzeit = "";
  if (e.uhrzeit != null && e.uhrzeit !== "") {
    const m = typeof e.uhrzeit === "string" && UHRZEIT.exec(e.uhrzeit);
    if (!m) return { fehler: "uhrzeit ungültig" };
    uhrzeit = `${m[1]}:${m[2]}` + (m[3] ? `–${m[3]}:${m[4]}` : "");
  }
  if (!KATEGORIEN.includes(e.kategorie)) return { fehler: "kategorie nicht erlaubt" };
  if (!["offiziell", "geschätzt"].includes(e.status)) return { fehler: "status ungültig" };
  if (e.code != null && e.code !== "" && (typeof e.code !== "string" || !MODULCODE.test(e.code))) return { fehler: "code ungültig" };
  const ort = datenText(e.ort, 120), info = datenText(e.info, 200);
  if (ort.fehler || info.fehler) return { fehler: ort.fehler ? "ort " + ort.fehler : "info " + info.fehler };
  if (!quelleOk(e.quelle_url)) return { fehler: "quelle_url ungültig" };
  if (datenText(e.quelle_text, 200).fehler) return { fehler: "quelle_text ungültig" };
  if (e.geprueft != null && e.geprueft !== "" && !(typeof e.geprueft === "string" && e.geprueft.length <= 40 && ISO_ZEIT.test(e.geprueft)
    && datumOk(e.geprueft.slice(0, 10)))) return { fehler: "geprueft ungültig" };
  const wert = { id: e.id, titel: titel.wert, datum: e.datum, bis, uhrzeit, ort: ort.wert, kategorie: e.kategorie, status: e.status, code: e.code || "", info: info.wert };
  if (BEREICHE.includes(e.bereich)) wert.bereich = e.bereich;
  return { wert };
}

// Manifest → { erstellt, pause, dateien: { name: { sha256, groesse } } } | null
function manifestPruefen(m) {
  if (!istObjekt(m) || m.schema !== 1 || typeof m.erstellt !== "string" || Number.isNaN(Date.parse(m.erstellt)) || !istObjekt(m.dateien)) return null;
  const dateien = {};
  for (const [name, max] of Object.entries(DATEIEN)) {
    const d = m.dateien[name];
    if (istObjekt(d) && /^[0-9a-f]{64}$/.test(String(d.sha256)) && Number.isInteger(d.groesse) && d.groesse > 0 && d.groesse <= max) dateien[name] = { sha256: d.sha256, groesse: d.groesse };
  }
  return { erstellt: new Date(m.erstellt).toISOString(), pause: m.pause === true, dateien };
}

// Körper einer Antwort, höchstens max Bytes: eine angekündigte größere Länge liest er gar nicht, sonst zählt er beim Lesen und bricht
// ab, sobald es mehr wird (ein Server, der mehr schickt oder keine Länge nennt, füllt so nie den Speicher) → Buffer | null
async function lesenBis(r, max) {
  const angekuendigt = Number(r.headers.get("content-length"));
  if (!r.body || (Number.isFinite(angekuendigt) && angekuendigt > max)) {
    if (r.body) await r.body.cancel().catch(() => {});
    return null;
  }
  const leser = r.body.getReader(), teile = [];
  let n = 0;
  for (;;) {
    const { done, value } = await leser.read();
    if (done) return Buffer.concat(teile, n);
    n += value.byteLength;
    if (n > max) {
      await leser.cancel().catch(() => {});
      return null;
    }
    teile.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
  }
}

// Bytes einer Datei, höchstens max; mit sha256: nur, wenn die Prüfsumme stimmt → Buffer | null
async function laden(holen, name, max, sha256) {
  try {
    const r = await holen(BASIS + name, { signal: AbortSignal.timeout(20e3) });
    if (!r.ok) return null;
    const b = await lesenBis(r, max);
    if (!b) return null;
    return !sha256 || createHash("sha256").update(b).digest("hex") === sha256 ? b : null;
  } catch (e) {
    return null;
  }
}
const json = (b) => {
  try { return b ? JSON.parse(b.toString("utf8")) : null; } catch (e) { return null; }
};

// Holt und schreibt den Cache. holen: fetch (Tests ersetzen es). → { ok, termine, kapitel } (ok false: nichts geändert)
export async function zentralAbrufen(verzeichnis, { holen = fetch, jetzt = new Date() } = {}) {
  const ordner = join(verzeichnis, "zentral"), datei = join(ordner, "zentral-cache.json");
  const alt = jsonLesen(datei, null, 8 * 1024 * 1024);
  const bisher = istObjekt(alt) && alt.schema === 1 ? alt : null;
  const m = manifestPruefen(json(await laden(holen, "manifest.json", MANIFEST_MAX)));
  if (!m) return { ok: false };
  const sha = istObjekt(bisher && bisher.sha) ? bisher.sha : {};
  const neu = { schema: 1, abgerufen: jetzt.toISOString(), erstellt: m.erstellt, sha: { ...sha },
    termine: bisher && Array.isArray(bisher.termine) ? bisher.termine : [], kapitel: bisher && Array.isArray(bisher.kapitel) ? bisher.kapitel : [] };
  if (!m.pause) {
    const t = m.dateien["termine.json"];
    if (t && t.sha256 !== sha["termine.json"]) {
      const d = json(await laden(holen, "termine.json", t.groesse, t.sha256));
      if (!istObjekt(d) || d.schema !== 1 || !Array.isArray(d.termine)) return { ok: false };
      const erstmals = new Map((neu.termine || []).filter((x) => istObjekt(x) && typeof x.id === "string").map((x) => [x.id, x.erstmals]));
      const ids = new Set(), termine = [];
      for (const roh of d.termine.slice(0, TERMINE_MAX)) {
        const r = zentralerTermin(roh);
        if (r.fehler || ids.has(r.wert.id)) continue;
        ids.add(r.wert.id);
        termine.push({ ...r.wert, erstmals: erstmals.get(r.wert.id) || (bisher ? jetzt.toISOString() : FRUEH) });
      }
      Object.assign(neu, { termine });
      neu.sha["termine.json"] = t.sha256;
    }
    const k = m.dateien["kapitel.json"];
    if (k && k.sha256 !== sha["kapitel.json"]) {
      const d = json(await laden(holen, "kapitel.json", k.groesse, k.sha256));
      if (!istObjekt(d) || d.schema !== 1 || !Array.isArray(d.module)) return { ok: false };
      const heute = jetzt.toISOString().slice(0, 10), gesehen = new Set(), kapitel = [];
      for (const e of d.module.slice(0, KAPITEL_MAX)) {
        const r = kapitelModulNormal(e, heute);
        const id = r.wert ? `${r.wert.code} ${r.wert.semester}` : "";
        if (r.fehler || gesehen.has(id)) continue;
        gesehen.add(id);
        kapitel.push(r.wert);
      }
      Object.assign(neu, { kapitel });
      neu.sha["kapitel.json"] = k.sha256;
    }
  }
  mkdirSync(ordner, { recursive: true });
  schreibenAtomar(datei, JSON.stringify(neu), 0o644);
  return { ok: true, termine: neu.termine.length, kapitel: neu.kapitel.length };
}

// realpathSync: Node löst den Symlink /opt/studium-server/aktuell für import.meta.url auf, für argv[1] nicht.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  zentralAbrufen(process.env.STUDIUM_SERVER_DATEN || "/var/lib/studium-server").then((r) => {
    if (!r.ok) {
      console.error("Zentrale Daten: nicht erreichbar oder ungültig; der letzte Stand bleibt.");
      process.exit(1);
    }
    console.log(`Zentrale Daten: ${r.termine} Termine, ${r.kapitel} Kapitellisten`);
  });
}
