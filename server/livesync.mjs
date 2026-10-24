#!/usr/bin/env node
// LiveSync auf dem eigenen Server (server/README.md, „LiveSync“): baut aus /etc/studium-server/livesync.json (livesync.sh
// legt sie an, nur root) die Einstellungen für das Obsidian-Plugin Self-hosted LiveSync und daraus einen Setup-Link
// obsidian://setuplivesync?settings=… mit einem neuen Übertragungs-Code. Den Code tippt man auf dem Gerät ein; ohne ihn ist
// der Link nur Datensalat.
//
// Format des Links wie LiveSync 1.0.x (encodeSettingsToSetupURI, Modus „persistent“, geprüft mit 1.0.38): Einstellungen als
// JSON, verschlüsselt mit encryptWithEphemeralSalt aus octagonal-wheels: PBKDF2-SHA-256 (310 000 Runden, Salz 32 Byte) über
// den Code → HKDF-SHA-256 (Salz 32 Byte, ohne info) → AES-256-GCM (IV 12 Byte); Text "%$" + base64(PBKDF2-Salz | IV |
// HKDF-Salz | Geheimtext). LiveSync liest dieses Format auch in älteren Fassungen.
//
// Kurzer Link: Der Setup-Link ist gut 1 000 Zeichen lang, als QR-Code im Terminal zu groß. livesync.sh legt ihn darum als
// Benutzer „studium“ für 30 Minuten unter einer Zufallskennung ab (nur ihr SHA-256 ist Dateiname); dienst.mjs zeigt unter
// https://<Adresse>/v1/livesync/<kennung> eine Seite mit dem Knopf „In Obsidian öffnen“. Ohne den Code nützt der Link nichts.
//
//   node livesync.mjs link [konfig]   → JSON { link, code } auf stdout (als root: liest die Zugangsdaten)
//   node livesync.mjs ablegen         Setup-Link von stdin → JSON { kennung, ablauf } (als studium, $STUDIUM_SERVER_DATEN)
import { createHash, webcrypto } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const { subtle } = webcrypto;
export const KONFIG = "/etc/studium-server/livesync.json";
export const LINK_ANFANG = "obsidian://setuplivesync?settings=";
const PRAEFIX = "%$";
const RUNDEN = 310000;
const ZEICHEN = "abcdefghijkmnpqrstuvwxyz23456789"; // ohne l, o, 0, 1: auf dem Handy leicht abzutippen
// Wie im Tresor „Studium EBA“ bewährt: versteckte Dateien (Plugins, CSS, Vorlagen) mit, aber nicht LiveSync selbst
// (jedes Gerät hat seine eigene Verbindung) und nicht die Fensteranordnung.
const VERSTECKT_OHNE = "/node_modules/, /.git/, /obsidian-livesync/, /workspace(-mobile)?.json$";

export function neuerCode(zufall = webcrypto.getRandomValues(new Uint8Array(12))) {
  const z = Array.from(zufall, (b) => ZEICHEN[b % ZEICHEN.length]).join("");
  return `${z.slice(0, 4)}-${z.slice(4, 8)}-${z.slice(8, 12)}`;
}

// konfig: { adresse: "https://obsidian.<IP>.sslip.io", benutzer, passwort, datenbank, e2ee }
export function einstellungen(k) {
  for (const f of ["adresse", "benutzer", "passwort", "datenbank", "e2ee"]) {
    if (typeof k[f] !== "string" || !k[f]) throw new Error(`livesync.json: ${f} fehlt`);
  }
  if (!/^[A-Za-z0-9]+$/.test(k.benutzer + k.passwort)) throw new Error("livesync.json: Benutzer und Passwort nur aus Buchstaben und Ziffern");
  const { protocol, host } = new URL(k.adresse);
  const schema = protocol === "http:" ? "http" : "https"; // http nur im Testmodus (livesync.sh)
  const id = "studium-autopilot";
  return {
    remoteType: "",
    couchDB_URI: `${schema}://${host}`,
    couchDB_USER: k.benutzer,
    couchDB_PASSWORD: k.passwort,
    couchDB_DBNAME: k.datenbank,
    remoteConfigurations: { [id]: { id, name: "Eigener Server (Studium Autopilot)", uri: `sls+${schema}://${k.benutzer}:${k.passwort}@${host}/?db=${k.datenbank}`, isEncrypted: false } },
    activeConfigurationId: id,
    encrypt: true,
    passphrase: k.e2ee,
    E2EEAlgorithm: "v2",
    usePathObfuscation: true,
    liveSync: true,
    syncOnStart: false,
    syncOnSave: false,
    periodicReplication: false,
    // Am Computer weiter abgleichen, wenn das Fenster verborgen ist (minimiert, anderer Schreibtisch). Sonst hält LiveSync an,
    // und was Studium Autopilot in der Zeit schreibt, sehen die anderen Geräte erst, wenn das Fenster wieder sichtbar ist.
    // iPhone/iPad übergehen die Einstellung (LiveSync: nur am Computer, seit 1.0.38 geprüft).
    keepReplicationActiveInBackground: true,
    // Versteckte Dateien: Beim Aufbau („overwrite the remote“) und Beitritt („Join this device“) schaltet LiveSync sie aus
    // (suspendExtraSync); danach schaltet man sie im Reiter „Sync Settings“ wieder ein. Den Abschnitt „Hidden Files“ zeigt
    // LiveSync nur im erweiterten Modus (livesync.md, L2 und L3).
    useAdvancedMode: true,
    syncInternalFiles: true,
    watchInternalFileChanges: true,
    syncInternalFilesIgnorePatterns: VERSTECKT_OHNE,
    trashInsteadDelete: true,
    isConfigured: true,
  };
}

const schluessel = async (code, pbkdf2Salz, hkdfSalz) => {
  const roh = await subtle.importKey("raw", new TextEncoder().encode(code), { name: "PBKDF2" }, false, ["deriveBits"]);
  const master = await subtle.deriveBits({ name: "PBKDF2", salt: pbkdf2Salz, iterations: RUNDEN, hash: "SHA-256" }, roh, 256);
  const hkdf = await subtle.importKey("raw", master, { name: "HKDF" }, false, ["deriveKey"]);
  return subtle.deriveKey({ name: "HKDF", salt: hkdfSalz, info: new Uint8Array(0), hash: "SHA-256" }, hkdf, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
};

export async function verschluesseln(text, code) {
  const pbkdf2Salz = webcrypto.getRandomValues(new Uint8Array(32));
  const hkdfSalz = webcrypto.getRandomValues(new Uint8Array(32));
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const k = await schluessel(code, pbkdf2Salz, hkdfSalz);
  const geheim = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv, tagLength: 128 }, k, new TextEncoder().encode(text)));
  return PRAEFIX + Buffer.concat([pbkdf2Salz, iv, hkdfSalz, geheim]).toString("base64");
}

// Gegenstück für Tests (wie decryptWithEphemeralSalt in LiveSync)
export async function entschluesseln(paket, code) {
  if (!paket.startsWith(PRAEFIX)) throw new Error("kein LiveSync-Paket");
  const b = Buffer.from(paket.slice(PRAEFIX.length), "base64");
  const k = await schluessel(code, b.subarray(0, 32), b.subarray(44, 76));
  return new TextDecoder().decode(await subtle.decrypt({ name: "AES-GCM", iv: b.subarray(32, 44), tagLength: 128 }, k, b.subarray(76)));
}

export async function link(konfig, code = neuerCode()) {
  return { link: LINK_ANFANG + encodeURIComponent(await verschluesseln(JSON.stringify(einstellungen(konfig)), code)), code };
}

// ---------- Kurzer Link ----------
export const GUELTIG_MIN = 30;
export const KENNUNG = /^[a-z2-9]{20}$/;
const ordner = (verzeichnis) => join(verzeichnis, "livesync-links");
const dateiVon = (verzeichnis, kennung) => join(ordner(verzeichnis), createHash("sha256").update(kennung).digest("hex") + ".json");

export function ablegen(verzeichnis, setupLink, { jetzt = new Date() } = {}) {
  if (!setupLink.startsWith(LINK_ANFANG)) throw new Error("kein Setup-Link");
  mkdirSync(ordner(verzeichnis), { recursive: true, mode: 0o700 });
  for (const name of readdirSync(ordner(verzeichnis))) {
    const d = join(ordner(verzeichnis), name);
    try { if (new Date(JSON.parse(readFileSync(d, "utf8")).ablauf) <= jetzt) rmSync(d, { force: true }); } catch (e) { rmSync(d, { force: true }); }
  }
  const kennung = Array.from(webcrypto.getRandomValues(new Uint8Array(20)), (b) => ZEICHEN[b % ZEICHEN.length]).join("");
  const ablauf = new Date(jetzt.getTime() + GUELTIG_MIN * 60e3).toISOString();
  writeFileSync(dateiVon(verzeichnis, kennung), JSON.stringify({ link: setupLink, ablauf }), { mode: 0o600 });
  return { kennung, ablauf };
}

// Setup-Link zur Kennung oder null (unbekannt, abgelaufen). Mehrfach abrufbar, solange er gilt: Eine Vorschau der Kamera oder
// ein zweiter Versuch soll ihn nicht verbrauchen; der Code schützt ihn.
export function abholen(verzeichnis, kennung, jetzt = new Date()) {
  if (!KENNUNG.test(String(kennung || ""))) return null;
  try {
    const e = JSON.parse(readFileSync(dateiVon(verzeichnis, kennung), "utf8"));
    return new Date(e.ablauf) > jetzt && String(e.link).startsWith(LINK_ANFANG) ? e.link : null;
  } catch (e) {
    return null;
  }
}

const html = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
// Seite für /v1/livesync/<kennung>: ein Knopf, der den Setup-Link öffnet (ein Klick ist sicherer als eine Weiterleitung, die
// Browser für fremde Schemata teils blockieren)
export function seite(setupLink) {
  const text = setupLink
    ? `<p>Tippe auf den Knopf. Obsidian fragt danach nach dem Code, den dir dein Server gezeigt hat.</p><p><a class="k" href="${html(setupLink)}">In Obsidian öffnen</a></p>`
    : "<p>Dieser Link ist abgelaufen. Lass dir in Claude Desktop einen neuen geben („Verbinde noch ein Gerät mit LiveSync“).</p>";
  return "<!doctype html><html lang=\"de\"><head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
    "<title>Studium Autopilot: LiveSync</title><style>body{font:18px/1.5 system-ui,sans-serif;max-width:32em;margin:3em auto;padding:0 1em}" +
    ".k{display:inline-block;padding:.7em 1.4em;border-radius:.5em;background:#5b4bd5;color:#fff;text-decoration:none;font-weight:600}</style>" +
    `</head><body><h1>LiveSync einrichten</h1>${text}</body></html>`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const [befehl, datei] = process.argv.slice(2);
  if (befehl === "link") {
    link(JSON.parse(readFileSync(datei || KONFIG, "utf8"))).then((r) => console.log(JSON.stringify(r)));
  } else if (befehl === "ablegen") {
    console.log(JSON.stringify(ablegen(process.env.STUDIUM_SERVER_DATEN || "/var/lib/studium-server", readFileSync(0, "utf8").trim())));
  } else {
    console.error("Aufruf: node livesync.mjs link [konfig] | ablegen");
    process.exit(2);
  }
}
