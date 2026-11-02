#!/usr/bin/env node
// Einmal-Codes zum Verbinden eines Geräts (Plugin) mit dem eigenen Server. Zwei Wege zu einem Code:
//   - Cloud Shell: sudo studium-server verbinden (node verbinden.mjs) zeigt den Link
//     obsidian://studium-autopilot?aktion=server-verbinden&adresse=…&code=…; der Code gilt 30 Minuten (Herkunft „cloud-shell“).
//   - Obsidian: Ein verbundenes Gerät holt über POST /v1/geraet (dienst.mjs, geraetCode) einen Code für ein weiteres Gerät, das
//     ihn eintippt. Er gilt GERAET.minuten, höchstens einer ist offen (ein neuer zieht den vorigen zurück), höchstens
//     GERAET.stunde je Stunde und GERAET.tag je Tag (Herkunft „obsidian“). Codes aus der Cloud Shell zählen dabei nicht mit.
// Zugangs- und Datenschlüssel holt das Plugin mit dem Code über HTTPS (POST /v1/verbinden) und legt sie in den Schlüsselbund. So
// stehen die Schlüssel nie in einem Link, auf dem Bildschirm oder im Chat. Gespeichert wird nur der SHA-256 des Codes. Ein Code gilt
// einmal: Einlösen legt zuerst exklusiv eine Marke an (atomar), so bekommt von zwei gleichzeitigen Anfragen nur eine die Schlüssel.
// Codes und geraete.json liegen im Ordner des Web-Dienstes (web/ im Datenordner; die Cloud Shell legt ihren Code als dessen Benutzer
// studium-web ab, studium-server verbinden). geraete.json: { ausgestellt: [Zeit] (Codes aus Obsidian der letzten 24 Stunden), nonces: { Zufallswert: Ablauf }
// (gegen wiederholte Anfragen), verbunden: [{ zeit, herkunft }] (die letzten VERBUNDEN; ans Plugin nur im verschlüsselten
// Eingang, nie im öffentlichen Status) }.
//   node verbinden.mjs   neuer Code, Ausgabe als JSON { code, link, ablauf }
import { createHash, randomBytes, randomInt } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ZEICHEN = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // ohne 0/O, 1/I
export const GUELTIG_MIN = 30;
// Codes aus Obsidian: Minuten gültig, höchstens so viele je Stunde und je Tag; die Zeit der Anfrage höchstens so weit neben der
// Uhr des Servers; höchstens so viele Zufallswerte zugleich gemerkt (jeder nur bis zum Ende seines Zeitfensters)
export const GERAET = { minuten: 10, stunde: 3, tag: 10, uhr: 2 * 60e3, nonces: 200 };
export const HERKUNFT = ["cloud-shell", "obsidian"];
const VERBUNDEN = 20;
const STUNDE = 3600e3, TAG = 864e5;
const NONCE = /^[A-Za-z0-9_-]{16,64}$/;
const MARKE = ".eingeloest"; // <hash>.json.eingeloest: dieser Code wird gerade eingelöst

export const codeNormal = (code) => String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const hash = (code) => createHash("sha256").update(codeNormal(code)).digest("hex");
const ordner = (verzeichnis) => join(verzeichnis, "verbinden");
const zeitOk = (s) => typeof s === "string" && s.length <= 40 && !Number.isNaN(Date.parse(s));

// Löscht abgelaufene Codes und legt einen neuen an.
export function neuerCode(verzeichnis, { jetzt = new Date(), minuten = GUELTIG_MIN, herkunft = "cloud-shell" } = {}) {
  mkdirSync(ordner(verzeichnis), { recursive: true, mode: 0o700 });
  aufraeumen(verzeichnis, jetzt);
  let code = "";
  for (let i = 0; i < 10; i++) code += ZEICHEN[randomInt(ZEICHEN.length)];
  code = `${code.slice(0, 5)}-${code.slice(5)}`;
  const ablauf = new Date(jetzt.getTime() + minuten * 60e3).toISOString();
  writeFileSync(join(ordner(verzeichnis), `${hash(code)}.json`), JSON.stringify({ ablauf, herkunft }), { mode: 0o600 });
  return { code, ablauf };
}

// Herkunft des Codes („cloud-shell“ | „obsidian“), wenn er gültig war, sonst "". Er ist danach verbraucht, das Verbinden steht in
// geraete.json. Wer einlöst, legt zuerst die Marke <hash>.json.eingeloest exklusiv an (Flag wx, O_EXCL: atomar, auch unter
// Windows, wo zwei gleichzeitige rename derselben Datei beide gelingen können): Lösen zwei Anfragen denselben Code zugleich ein,
// bekommt nur eine die Marke, und nur sie liest und löscht den Code.
export function codeEinloesen(verzeichnis, code, jetzt = new Date()) {
  if (codeNormal(code).length !== 10) return "";
  const datei = join(ordner(verzeichnis), `${hash(code)}.json`), marke = datei + MARKE;
  try { writeFileSync(marke, "", { flag: "wx", mode: 0o600 }); } catch (e) { return ""; }
  let eintrag = null;
  try {
    eintrag = JSON.parse(readFileSync(datei, "utf8"));
    rmSync(datei);
  } catch (e) {
    eintrag = null;
  } finally {
    rmSync(marke, { force: true });
  }
  if (!eintrag || !(new Date(eintrag.ablauf) > jetzt)) return "";
  const herkunft = HERKUNFT.includes(eintrag.herkunft) ? eintrag.herkunft : "cloud-shell"; // Codes älterer Fassungen: nur Cloud Shell
  try { verbundenMerken(verzeichnis, herkunft, jetzt); } catch (e) { /* nur die Anzeige im Plugin fehlt dann; der Code bleibt verbraucht */ }
  return herkunft;
}

// Abgelaufene Codes und Ungültiges löschen; eine Marke erst, wenn sie über eine Minute liegt (sonst löst gerade jemand ein; sie
// bleibt nur nach einem Absturz mitten im Einlösen)
function aufraeumen(verzeichnis, jetzt) {
  for (const name of readdirSync(ordner(verzeichnis))) {
    const datei = join(ordner(verzeichnis), name);
    if (name.endsWith(MARKE)) {
      try { if (jetzt.getTime() - statSync(datei).mtimeMs > 60e3) rmSync(datei, { force: true }); } catch (e) { /* schon weg */ }
      continue;
    }
    try {
      if (new Date(JSON.parse(readFileSync(datei, "utf8")).ablauf) <= jetzt) rmSync(datei, { force: true });
    } catch (e) {
      rmSync(datei, { force: true });
    }
  }
}

// Offene Codes einer Herkunft löschen (ein neuer Code aus Obsidian zieht den vorigen zurück)
function zurueckziehen(verzeichnis, herkunft) {
  let namen = [];
  try { namen = readdirSync(ordner(verzeichnis)); } catch (e) { return; }
  for (const name of namen) {
    const datei = join(ordner(verzeichnis), name);
    try { if (JSON.parse(readFileSync(datei, "utf8")).herkunft === herkunft) rmSync(datei, { force: true }); } catch (e) { /* schon weg */ }
  }
}

// geraete.json lesen; Abgelaufenes fällt weg (Zufallswerte nach ihrem Ablauf, Codes aus Obsidian nach einem Tag)
function zustandLesen(verzeichnis, jetzt) {
  let roh = null;
  try { roh = JSON.parse(readFileSync(join(verzeichnis, "geraete.json"), "utf8")); } catch (e) { roh = null; }
  const o = roh && typeof roh === "object" ? roh : {};
  const t = jetzt.getTime();
  const ausgestellt = (Array.isArray(o.ausgestellt) ? o.ausgestellt : []).filter((z) => zeitOk(z) && t - Date.parse(z) < TAG)
    .map((z) => new Date(z).toISOString()).sort().slice(-100);
  const nonces = {}, n = o.nonces && typeof o.nonces === "object" ? o.nonces : {};
  for (const k of Object.keys(n)) if (NONCE.test(k) && zeitOk(n[k]) && Date.parse(n[k]) >= t) nonces[k] = n[k];
  const verbunden = (Array.isArray(o.verbunden) ? o.verbunden : []).filter((e) => e && zeitOk(e.zeit) && HERKUNFT.includes(e.herkunft))
    .map((e) => ({ zeit: new Date(e.zeit).toISOString(), herkunft: e.herkunft })).slice(-VERBUNDEN);
  return { ausgestellt, nonces, verbunden };
}
// Atomar über eine eigene Zwischendatei (schreibt doch einmal ein zweiter Prozess, gewinnt der letzte, statt dass einer scheitert)
function zustandSchreiben(verzeichnis, z) {
  const datei = join(verzeichnis, "geraete.json"), neu = `${datei}.${randomBytes(6).toString("hex")}.neu`;
  writeFileSync(neu, JSON.stringify(z), { mode: 0o600 });
  renameSync(neu, datei);
}
function verbundenMerken(verzeichnis, herkunft, jetzt) {
  const z = zustandLesen(verzeichnis, jetzt);
  z.verbunden = z.verbunden.concat({ zeit: jetzt.toISOString(), herkunft }).slice(-VERBUNDEN);
  zustandSchreiben(verzeichnis, z);
}
// Wann ein Gerät zuletzt verbunden wurde, die letzten VERBUNDEN (für den Eingang, verschlüsselt) → [{ zeit, herkunft }]
export function verbundenLesen(verzeichnis, jetzt = new Date()) {
  return zustandLesen(verzeichnis, jetzt).verbunden;
}

// Ab wann wieder ein Code aus Obsidian geht (ausgestellt: aufsteigend, letzte 24 Stunden) → ISO-Zeit oder "" (sofort)
function wiederAb(ausgestellt, jetzt) {
  const stunde = ausgestellt.filter((z) => jetzt.getTime() - Date.parse(z) < STUNDE);
  const ab = [];
  if (stunde.length >= GERAET.stunde) ab.push(Date.parse(stunde[stunde.length - GERAET.stunde]) + STUNDE);
  if (ausgestellt.length >= GERAET.tag) ab.push(Date.parse(ausgestellt[ausgestellt.length - GERAET.tag]) + TAG);
  return ab.length ? new Date(Math.max(...ab)).toISOString() : "";
}

// Code für ein weiteres Gerät aus Obsidian (POST /v1/geraet). dienst.mjs hat den Zugangsschlüssel geprüft und die Anfrage mit dem
// Datenschlüssel entschlüsselt (Zweck „verbinden“): Der Zugangsschlüssel steht im Kopf jeder Anfrage; wer nur ihn kennt, bekommt so
// keinen Code und über ihn nie den Datenschlüssel. anfrage: { schema: 1, zeit, nonce }; zeit höchstens GERAET.uhr neben der Uhr
// des Servers, jeder Zufallswert nur einmal (auch eine abgelehnte Anfrage verbraucht ihn). → [Status, Antwort]: 200 { code,
// ablauf }, 400 { fehler: anfrage | uhr }, 409 { fehler: wiederholt }, 429 { fehler: zu-viele, wieder? }
export function geraetCode(verzeichnis, anfrage, jetzt = new Date()) {
  const a = anfrage && typeof anfrage === "object" ? anfrage : {};
  if (a.schema !== 1 || typeof a.nonce !== "string" || !NONCE.test(a.nonce) || !zeitOk(a.zeit)) return [400, { fehler: "anfrage" }];
  const zeit = Date.parse(a.zeit);
  if (Math.abs(jetzt.getTime() - zeit) > GERAET.uhr) return [400, { fehler: "uhr" }];
  const z = zustandLesen(verzeichnis, jetzt);
  if (z.nonces[a.nonce]) return [409, { fehler: "wiederholt" }];
  if (Object.keys(z.nonces).length >= GERAET.nonces) return [429, { fehler: "zu-viele" }];
  z.nonces[a.nonce] = new Date(zeit + GERAET.uhr).toISOString();
  const wieder = wiederAb(z.ausgestellt, jetzt);
  if (!wieder) z.ausgestellt.push(jetzt.toISOString());
  zustandSchreiben(verzeichnis, z); // erst gemerkt, dann der Code: scheitert das Schreiben, gibt es keinen
  if (wieder) return [429, { fehler: "zu-viele", wieder }];
  zurueckziehen(verzeichnis, "obsidian");
  return [200, neuerCode(verzeichnis, { jetzt, minuten: GERAET.minuten, herkunft: "obsidian" })];
}

export function link(adresse, code) {
  const p = new URLSearchParams({ aktion: "server-verbinden", adresse, code });
  return `obsidian://studium-autopilot?${p.toString()}`;
}

// realpathSync: Node löst den Symlink /opt/studium-server/aktuell für import.meta.url auf, für argv[1] nicht.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const konfig = JSON.parse(readFileSync(process.env.STUDIUM_SERVER_KONFIG || "/etc/studium-server/dienst.json", "utf8"));
  const verzeichnis = join(process.env.STUDIUM_SERVER_DATEN || "/var/lib/studium-server", "web");
  const { code, ablauf } = neuerCode(verzeichnis);
  console.log(JSON.stringify({ code, ablauf, link: link(konfig.adresse, code) }));
}
