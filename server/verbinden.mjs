#!/usr/bin/env node
// Einmal-Codes zum Verbinden eines Geräts (Plugin) mit dem eigenen Server. Zwei Wege zu einem Code:
//   - Cloud Shell: sudo studium-server verbinden (node verbinden.mjs) zeigt den Link
//     obsidian://studium-autopilot?aktion=server-verbinden&adresse=…&code=…; der Code gilt 30 Minuten (Herkunft „cloud-shell“).
//   - Obsidian: Ein verbundenes Gerät holt über POST /v1/geraet (dienst.mjs, geraetCode) einen Code für ein weiteres Gerät, das
//     ihn eintippt. Er gilt GERAET.minuten, höchstens einer ist offen (ein neuer zieht den vorigen zurück), höchstens
//     GERAET.stunde je Stunde und GERAET.tag je Tag (Herkunft „obsidian“). Codes aus der Cloud Shell zählen dabei nicht mit.
// Zugangs- und Datenschlüssel holt das Plugin mit dem Code über HTTPS (POST /v1/verbinden) und legt sie in den Schlüsselbund. So
// stehen die Schlüssel nie in einem Link, auf dem Bildschirm oder im Chat. Gespeichert wird der SHA-256 des Codes und, mit der
// Adresse des Servers, was der Austausch ab 0.7.8 braucht (codeAbleiten, unten), nie der Code selbst. Ein Code gilt
// einmal: Einlösen legt zuerst exklusiv eine Marke an (atomar), so bekommt von zwei gleichzeitigen Anfragen nur eine die Schlüssel.
// Austausch ab 0.7.8 (schema 2, codeEinloesenNeu): Der Code geht nie über das Netz, und die Schlüssel kommen nur verschlüsselt
// zurück, unter einem Schlüssel aus dem Code und einem Diffie-Hellman-Tausch (P-256) mit Schlüsseln nur für diese eine Anfrage.
// Wer das Zertifikat der Adresse hat (eine neu vergebene IP, der Dienst hinter dem Namen, wer das DNS umlenkt), liest so nichts
// mit und kann ohne den Code keine eigenen Schlüssel unterschieben. Plugins bis 0.7.7 schicken den Code selbst (schema fehlt); das
// geht weiter, ohne diesen Schutz.
// Codes und geraete.json liegen im Ordner des Web-Dienstes (web/ im Datenordner; die Cloud Shell legt ihren Code als dessen Benutzer
// studium-web ab, studium-server verbinden). geraete.json: { ausgestellt: [Zeit] (Codes aus Obsidian der letzten 24 Stunden), nonces: { Zufallswert: Ablauf }
// (gegen wiederholte Anfragen), verbunden: [{ zeit, herkunft, netz?, geraet? }] (die letzten VERBUNDEN: jedes Einlösen mit Zeit,
// Herkunft, grobem Netz des Absenders (IPv4 /24, IPv6 /48, ipNetz) und dem Namen des Geräts, wenn es einen nennt; ans Plugin im
// verschlüsselten Eingang und im Status mit Zugangsschlüssel, nie ohne) }.
//   node verbinden.mjs   neuer Code, Ausgabe als JSON { code, link, ablauf }
import { createCipheriv, createECDH, createHash, createHmac, hkdfSync, pbkdf2Sync, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { saeubern } from "./eingang.mjs";

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

// Grobes Netz einer Adresse (nie die Adresse selbst): IPv4 → a.b.c.0/24, IPv6 → die ersten bits (/48 im Protokoll des Verbindens,
// /56 für die Sperre in dienst.mjs), auch IPv4 in IPv6 (::ffff:a.b.c.d). Ungültig → ""
export function ipNetz(adresse, bits6 = 48) {
  const s = String(adresse || "").trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/%.*$/, "");
  const v4 = /^(?:::ffff:)?(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (v4) return v4.slice(1).every((x) => Number(x) <= 255) ? `${Number(v4[1])}.${Number(v4[2])}.${Number(v4[3])}.0/24` : "";
  if (!s.includes(":") || !/^[0-9a-f:]+$/.test(s)) return "";
  const teile = s.split("::");
  if (teile.length > 2) return "";
  const vorn = teile[0] ? teile[0].split(":") : [], hinten = teile.length === 2 && teile[1] ? teile[1].split(":") : [];
  const fehlen = 8 - vorn.length - hinten.length;
  if (teile.length === 2 ? fehlen < 1 : fehlen !== 0) return "";
  const gruppen = [...vorn, ...Array(Math.max(0, fehlen)).fill("0"), ...hinten];
  if (gruppen.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return "";
  const n = Math.ceil(bits6 / 16), rest = bits6 % 16;
  return gruppen.slice(0, n).map((g, i) => (i === n - 1 && rest ? parseInt(g, 16) & (0xffff << (16 - rest)) & 0xffff : parseInt(g, 16)).toString(16)).join(":") + "::/" + bits6;
}
const NETZ = /^[0-9a-f.:]{3,45}\/\d{1,3}$/;
// Name eines Geräts (vom Plugin, wenn es einen schickt): gesäubert, ohne Links, höchstens 40 Zeichen, sonst ""
export const geraetName = (g) => { const r = saeubern(typeof g === "string" ? g : "", 40, false, []); return r.fehler ? "" : r.wert; };

export const codeNormal = (code) => String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const hash = (code) => createHash("sha256").update(codeNormal(code)).digest("hex");
const ordner = (verzeichnis) => join(verzeichnis, "verbinden");
const zeitOk = (s) => typeof s === "string" && s.length <= 40 && !Number.isNaN(Date.parse(s));

// ---------- Austausch ab 0.7.8 (Gegenstück: codeVerbinden in server.js des Plugins) ----------
// Aus Code und Host des Servers (klein, mit Port, falls einer dasteht) mit PBKDF2-SHA256, KDF.runden Runden, Salz
// „studium-autopilot/verbinden/v2/code\n<host>“ → 32 Byte m; daraus mit HKDF-SHA256 (Salz leer, Info „…/v2/<zweck>“):
//   kennung  geht statt des Codes an den Server (Name des Codes, verrät ihn nur, wer alle 2^50 Codes mit je KDF.runden Runden
//            durchprobiert; in den 30 Minuten, die ein Code gilt, ist das nicht zu schaffen)
//   beweis   HMAC-Schlüssel: Das Gerät bindet damit seinen öffentlichen Schlüssel an den Code; wer die Anfrage abfängt, kann den
//            Schlüssel nicht gegen seinen tauschen
//   antwort  geht mit dem Geheimnis aus dem Diffie-Hellman-Tausch in den Schlüssel der Antwort ein
// Der Host im Salz: Ein Code gilt nur für den Namen, den das Gerät ansprechen wollte. Die Runden: etwa 0,15 s auf einem PC von 2018
// (Node 24, Web Crypto wie im Plugin; auf dem Telefon grob das Doppelte bis Dreifache), so viel wie die Empfehlung von OWASP.
export const KDF = { runden: 600000 };
const V2 = "studium-autopilot/verbinden/v2/";
const B64 = (n) => new RegExp(`^[A-Za-z0-9_-]{${n}}$`);
const B64_32 = B64(43), B64_PUNKT = B64(87); // 32 Byte; ein Punkt auf P-256 unkomprimiert (65 Byte)
const hkdf = (ikm, info) => Buffer.from(hkdfSync("sha256", ikm, Buffer.alloc(0), info, 32));
export const hostVon = (adresse) => { try { return new URL(String(adresse || "")).host.toLowerCase(); } catch (e) { return ""; } };
// → { kennung, beweis, antwort } (base64url)
export function codeAbleiten(code, host) {
  const m = pbkdf2Sync(codeNormal(code), `${V2}code\n${host}`, KDF.runden, 32, "sha256");
  return Object.fromEntries(["kennung", "beweis", "antwort"].map((k) => [k, hkdf(m, V2 + k).toString("base64url")]));
}
// Text, den beweis signiert, und Kontext der Antwort (Info für HKDF und Zusatzdaten für AES-GCM); öffentliche Schlüssel base64url
export const beweisText = (host, pub) => `${V2}beweis\n${host}\n${pub}`;
export const antwortKontext = (host, pubGeraet, pubServer) => `${V2}antwort\n${host}\n${pubGeraet}\n${pubServer}`;

// Löscht abgelaufene Codes und legt einen neuen an. adresse: die des Servers (dienst.json); ohne sie (Tests) geht nur der Weg bis 0.7.7.
export function neuerCode(verzeichnis, { jetzt = new Date(), minuten = GUELTIG_MIN, herkunft = "cloud-shell", adresse = "" } = {}) {
  mkdirSync(ordner(verzeichnis), { recursive: true, mode: 0o700 });
  aufraeumen(verzeichnis, jetzt);
  let code = "";
  for (let i = 0; i < 10; i++) code += ZEICHEN[randomInt(ZEICHEN.length)];
  code = `${code.slice(0, 5)}-${code.slice(5)}`;
  const ablauf = new Date(jetzt.getTime() + minuten * 60e3).toISOString();
  const host = hostVon(adresse);
  writeFileSync(join(ordner(verzeichnis), `${hash(code)}.json`), JSON.stringify({ ablauf, herkunft, ...(host ? codeAbleiten(code, host) : {}) }), { mode: 0o600 });
  return { code, ablauf };
}

// Herkunft des Codes („cloud-shell“ | „obsidian“), wenn er gültig war, sonst "". Er ist danach verbraucht, das Verbinden steht in
// geraete.json (mit info: { netz, geraet }, siehe oben).
export function codeEinloesen(verzeichnis, code, jetzt = new Date(), info = {}) {
  if (codeNormal(code).length !== 10) return "";
  return einloesen(join(ordner(verzeichnis), `${hash(code)}.json`), verzeichnis, jetzt, info);
}

// Austausch ab 0.7.8. anfrage: { schema: 2, kennung, pub (öffentlicher Schlüssel des Geräts, P-256 unkomprimiert), beweis
// (HMAC-SHA256 unter beweis über beweisText) }; konfig: { adresse, zugang, schluessel }. Der Code ist nur verbraucht, wenn alles
// stimmt: Wer die Kennung mitliest und mit eigenem Schlüssel weiterschickt, scheitert am Beweis, und der Code bleibt dem Gerät.
// → { antwort: { schema: 2, pub (des Servers, nur für diese Anfrage), iv, daten }, herkunft } | null. daten: AES-256-GCM (Tag hinten
// wie bei Web Crypto) von { adresse, zugang, schluessel } unter HKDF-SHA256(ECDH-Geheimnis ‖ antwort, Info antwortKontext),
// Zusatzdaten antwortKontext
export function codeEinloesenNeu(verzeichnis, anfrage, konfig, jetzt = new Date(), info = {}) {
  const a = anfrage && typeof anfrage === "object" ? anfrage : {};
  const host = hostVon(konfig.adresse);
  if (a.schema !== 2 || !host || !B64_32.test(a.kennung) || !B64_PUNKT.test(a.pub) || !B64_32.test(a.beweis)) return null;
  let namen = [];
  try { namen = readdirSync(ordner(verzeichnis)).filter((n) => /^[0-9a-f]{64}\.json$/.test(n)); } catch (e) { return null; }
  let datei = "", e = null;
  for (const name of namen) {
    try { e = JSON.parse(readFileSync(join(ordner(verzeichnis), name), "utf8")); } catch (x) { e = null; }
    if (e && e.kennung === a.kennung) { datei = join(ordner(verzeichnis), name); break; }
  }
  if (!datei || !(new Date(e.ablauf) > jetzt) || !B64_32.test(e.beweis) || !B64_32.test(e.antwort)) return null;
  const soll = createHmac("sha256", Buffer.from(e.beweis, "base64url")).update(beweisText(host, a.pub)).digest();
  if (!timingSafeEqual(soll, Buffer.from(a.beweis, "base64url"))) return null;
  const ecdh = createECDH("prime256v1");
  const pub = ecdh.generateKeys().toString("base64url");
  let geheimnis;
  try { geheimnis = ecdh.computeSecret(Buffer.from(a.pub, "base64url")); } catch (x) { return null; } // kein Punkt auf der Kurve
  const herkunft = einloesen(datei, verzeichnis, jetzt, info);
  if (!herkunft) return null;
  const kontext = antwortKontext(host, a.pub, pub);
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", hkdf(Buffer.concat([geheimnis, Buffer.from(e.antwort, "base64url")]), kontext), iv);
  c.setAAD(Buffer.from(kontext, "utf8"));
  const klar = JSON.stringify({ adresse: konfig.adresse, zugang: konfig.zugang, schluessel: konfig.schluessel });
  const daten = Buffer.concat([c.update(klar, "utf8"), c.final(), c.getAuthTag()]);
  return { antwort: { schema: 2, pub, iv: iv.toString("base64url"), daten: daten.toString("base64url") }, herkunft };
}

// Löst die Datei eines Codes ein → Herkunft | "". Wer einlöst, legt zuerst die Marke <hash>.json.eingeloest exklusiv an (Flag wx,
// O_EXCL: atomar, auch unter Windows, wo zwei gleichzeitige rename derselben Datei beide gelingen können): Lösen zwei Anfragen
// denselben Code zugleich ein, bekommt nur eine die Marke, und nur sie liest und löscht den Code.
function einloesen(datei, verzeichnis, jetzt, info) {
  const marke = datei + MARKE;
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
  try { verbundenMerken(verzeichnis, herkunft, jetzt, info); } catch (e) { /* nur die Anzeige im Plugin fehlt dann; der Code bleibt verbraucht */ }
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
    .map((e) => verbindung(e.zeit, e.herkunft, e)).slice(-VERBUNDEN);
  return { ausgestellt, nonces, verbunden };
}
// Atomar über eine eigene Zwischendatei (schreibt doch einmal ein zweiter Prozess, gewinnt der letzte, statt dass einer scheitert)
function zustandSchreiben(verzeichnis, z) {
  const datei = join(verzeichnis, "geraete.json"), neu = `${datei}.${randomBytes(6).toString("hex")}.neu`;
  writeFileSync(neu, JSON.stringify(z), { mode: 0o600 });
  renameSync(neu, datei);
}
// Ein Eintrag im Protokoll des Verbindens; netz und geraet nur, wenn gültig
function verbindung(zeit, herkunft, { netz, geraet } = {}) {
  const e = { zeit: new Date(zeit).toISOString(), herkunft };
  if (typeof netz === "string" && NETZ.test(netz)) e.netz = netz;
  const name = geraetName(geraet);
  if (name) e.geraet = name;
  return e;
}
function verbundenMerken(verzeichnis, herkunft, jetzt, info) {
  const z = zustandLesen(verzeichnis, jetzt);
  z.verbunden = z.verbunden.concat(verbindung(jetzt, herkunft, info)).slice(-VERBUNDEN);
  zustandSchreiben(verzeichnis, z);
}
// Wann Geräte verbunden wurden, die letzten VERBUNDEN (für den Eingang, verschlüsselt, und den Status mit Zugangsschlüssel)
// → [{ zeit, herkunft, netz?, geraet? }]
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
// Datenschlüssel entschlüsselt (Zweck „verbinden“): Der Zugangsschlüssel stand bis 0.7.7 im Kopf jeder Anfrage; wer nur ihn kennt, bekommt so
// keinen Code und über ihn nie den Datenschlüssel. anfrage: { schema: 1, zeit, nonce }; zeit höchstens GERAET.uhr neben der Uhr
// des Servers, jeder Zufallswert nur einmal (auch eine abgelehnte Anfrage verbraucht ihn). → [Status, Antwort]: 200 { code,
// ablauf }, 400 { fehler: anfrage | uhr }, 409 { fehler: wiederholt }, 429 { fehler: zu-viele, wieder? }. adresse: die des Servers
// (für den Austausch ab 0.7.8, neuerCode)
export function geraetCode(verzeichnis, anfrage, jetzt = new Date(), adresse = "") {
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
  return [200, neuerCode(verzeichnis, { jetzt, minuten: GERAET.minuten, herkunft: "obsidian", adresse })];
}

export function link(adresse, code) {
  const p = new URLSearchParams({ aktion: "server-verbinden", adresse, code });
  return `obsidian://studium-autopilot?${p.toString()}`;
}

// realpathSync: Node löst den Symlink /opt/studium-server/aktuell für import.meta.url auf, für argv[1] nicht.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const konfig = JSON.parse(readFileSync(process.env.STUDIUM_SERVER_KONFIG || "/etc/studium-server/dienst.json", "utf8"));
  const verzeichnis = join(process.env.STUDIUM_SERVER_DATEN || "/var/lib/studium-server", "web");
  const { code, ablauf } = neuerCode(verzeichnis, { adresse: konfig.adresse });
  console.log(JSON.stringify({ code, ablauf, link: link(konfig.adresse, code) }));
}
