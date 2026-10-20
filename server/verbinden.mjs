#!/usr/bin/env node
// Einmal-Codes zum Verbinden eines Geräts (Plugin) mit dem eigenen Server. Der Code steht im Link
// obsidian://studium-autopilot?aktion=server-verbinden&adresse=…&code=…; Zugangs- und Datenschlüssel holt das Plugin
// danach über HTTPS (POST /v1/verbinden) und legt sie in den Schlüsselbund. So stehen die Schlüssel nie in einem Link,
// auf dem Bildschirm oder im Chat. Gespeichert wird nur der SHA-256 des Codes; ein Code gilt einmal und 30 Minuten.
//   node verbinden.mjs   neuer Code, Ausgabe als JSON { code, link, ablauf }
import { createHash, randomInt } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const ZEICHEN = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // ohne 0/O, 1/I
export const GUELTIG_MIN = 30;

export const codeNormal = (code) => String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
const hash = (code) => createHash("sha256").update(codeNormal(code)).digest("hex");
const ordner = (verzeichnis) => join(verzeichnis, "verbinden");

// Löscht abgelaufene Codes und legt einen neuen an.
export function neuerCode(verzeichnis, { jetzt = new Date(), minuten = GUELTIG_MIN } = {}) {
  mkdirSync(ordner(verzeichnis), { recursive: true, mode: 0o700 });
  aufraeumen(verzeichnis, jetzt);
  let code = "";
  for (let i = 0; i < 10; i++) code += ZEICHEN[randomInt(ZEICHEN.length)];
  code = `${code.slice(0, 5)}-${code.slice(5)}`;
  const ablauf = new Date(jetzt.getTime() + minuten * 60e3).toISOString();
  writeFileSync(join(ordner(verzeichnis), `${hash(code)}.json`), JSON.stringify({ ablauf }), { mode: 0o600 });
  return { code, ablauf };
}

// true, wenn der Code gültig war; er ist danach verbraucht.
export function codeEinloesen(verzeichnis, code, jetzt = new Date()) {
  if (codeNormal(code).length !== 10) return false;
  const datei = join(ordner(verzeichnis), `${hash(code)}.json`);
  let eintrag;
  try { eintrag = JSON.parse(readFileSync(datei, "utf8")); } catch (e) { return false; }
  rmSync(datei, { force: true });
  return new Date(eintrag.ablauf) > jetzt;
}

function aufraeumen(verzeichnis, jetzt) {
  for (const name of readdirSync(ordner(verzeichnis))) {
    const datei = join(ordner(verzeichnis), name);
    try {
      if (new Date(JSON.parse(readFileSync(datei, "utf8")).ablauf) <= jetzt) rmSync(datei, { force: true });
    } catch (e) {
      rmSync(datei, { force: true });
    }
  }
}

export function link(adresse, code) {
  const p = new URLSearchParams({ aktion: "server-verbinden", adresse, code });
  return `obsidian://studium-autopilot?${p.toString()}`;
}

// realpathSync: Node löst den Symlink /opt/studium-server/aktuell für import.meta.url auf, für argv[1] nicht.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const konfig = JSON.parse(readFileSync(process.env.STUDIUM_SERVER_KONFIG || "/etc/studium-server/dienst.json", "utf8"));
  const verzeichnis = process.env.STUDIUM_SERVER_DATEN || "/var/lib/studium-server";
  const { code, ablauf } = neuerCode(verzeichnis);
  console.log(JSON.stringify({ code, ablauf, link: link(konfig.adresse, code) }));
}
