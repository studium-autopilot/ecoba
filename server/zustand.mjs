#!/usr/bin/env node
// Schreibt die Fakten für den öffentlichen Status (dienst.mjs, /v1/status) nach $STUDIUM_SERVER_DATEN/zustand.json.
// Läuft per Timer alle 15 Minuten als Benutzer „studium“. Prüft selbst: Claude angemeldet, Uni-Zugang gespeichert bzw.
// abgelehnt, Speicherreserve aktiv (ihre Meldung speicher-reserve.json mit lebender PID). Felder, die andere Teile setzen
// (gmail, weiterleitung, letzterLauf), bleiben stehen.
import { execFile } from "node:child_process";
import { existsSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const UNI_ZUGANG = "/etc/credstore.encrypted/uni-zugang";

const ausfuehren = (befehl, args) => new Promise((fertig) => {
  execFile(befehl, args, { timeout: 60e3 }, (err, stdout) => fertig({ ok: !err, ausgabe: String(stdout || "") }));
});

// Speicherreserve läuft, wenn ihre Meldung eine lebende PID nennt (ohne systemctl: braucht als Benutzer kein D-Bus).
export function reserveLaeuft(verzeichnis) {
  try {
    const { pid } = JSON.parse(readFileSync(join(verzeichnis, "speicher-reserve.json"), "utf8"));
    process.kill(Number(pid), 0);
    return "an";
  } catch (e) {
    return "aus";
  }
}

// Echte Proben; in Tests ersetzt.
export const proben = {
  claude: async () => ((await ausfuehren(join(homedir(), ".local", "bin", "claude"), ["auth", "status"])).ok ? "angemeldet" : "abgemeldet"),
  speicherReserve: async (verzeichnis) => reserveLaeuft(verzeichnis),
  uniZugangGespeichert: async () => existsSync(UNI_ZUGANG),
};

async function messen(verzeichnis, p) {
  const claude = await p.claude();
  const speicherReserve = await p.speicherReserve(verzeichnis);
  const uniZugang = !(await p.uniZugangGespeichert()) ? "fehlt" : existsSync(join(verzeichnis, "uni-zugang-falsch")) ? "falsch" : "gespeichert";
  return { claude, speicherReserve, uniZugang };
}

// Eigene Felder in den Zustand; Felder des Claude-Laufs (letzterLauf, gmail, fehler anderer Art) bleiben
function mischen(alt, m) {
  const z = { ...(alt || {}), ...m };
  const fehler = new Set((Array.isArray(z.fehler) ? z.fehler : []).filter((f) => !["claude-abgemeldet", "uni-zugang-falsch"].includes(f)));
  if (z.claude === "abgemeldet") fehler.add("claude-abgemeldet");
  if (z.uniZugang === "falsch") fehler.add("uni-zugang-falsch");
  z.fehler = [...fehler];
  z.geprueft = new Date().toISOString();
  return z;
}

// Erst die langsamen Proben (claude auth status bis 60 s), dann lesen, mischen und schreiben ohne Pause dazwischen: So geht
// nichts verloren, was lauf.mjs inzwischen geschrieben hat (lauf.mjs liest ebenso direkt vor dem Schreiben).
export async function zustandAktualisieren(verzeichnis, p = proben) {
  const datei = join(verzeichnis, "zustand.json");
  const m = await messen(verzeichnis, p);
  let alt = {};
  try { alt = JSON.parse(readFileSync(datei, "utf8")); } catch (e) { alt = {}; }
  const z = mischen(alt, m);
  writeFileSync(datei + ".neu", JSON.stringify(z, null, 2));
  renameSync(datei + ".neu", datei);
  return z;
}

// realpathSync: Node löst den Symlink /opt/studium-server/aktuell für import.meta.url auf, für argv[1] nicht.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  zustandAktualisieren(process.env.STUDIUM_SERVER_DATEN || "/var/lib/studium-server")
    .then((z) => console.log(`zustand: claude ${z.claude}, uni-zugang ${z.uniZugang}, speicherreserve ${z.speicherReserve}`));
}
