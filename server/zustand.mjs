#!/usr/bin/env node
// Schreibt die Fakten für den öffentlichen Status (dienst.mjs, /v1/status) nach $STUDIUM_SERVER_DATEN/zustand.json.
// Läuft per Timer alle 15 Minuten als Benutzer „studium“. Prüft selbst: Claude angemeldet, Uni-Zugang gespeichert bzw. abgelehnt
// (Marke abruf/uni-zugang-falsch, schreibt abrufen.py), Speicherreserve aktiv (ihre Meldung speicher-reserve.json mit lebender PID),
// LiveSync eingeschaltet (Marke livesync-an, schreibt livesync.sh). Felder, die andere Teile setzen (gmail, weiterleitung,
// letzterLauf), bleiben stehen.
import { execFile } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { da, jsonLesen, schreibenAtomar } from "./dateien.mjs";

export const UNI_ZUGANG = "/etc/credstore.encrypted/uni-zugang";
// claude auth status ohne Nutzungs- und Fehlerberichte an Anthropic, wie im Lauf (lauf.mjs): hier statt nur in der Einheit, weil
// studium-server und livesync.sh zustand.mjs auch direkt starten
export const OHNE_BERICHTE = { DISABLE_TELEMETRY: "1", DISABLE_ERROR_REPORTING: "1" };

const ausfuehren = (befehl, args) => new Promise((fertig) => {
  execFile(befehl, args, { timeout: 60e3, env: { ...process.env, ...OHNE_BERICHTE } }, (err, stdout) => fertig({ ok: !err, ausgabe: String(stdout || "") }));
});

// Speicherreserve läuft, wenn ihre Meldung eine lebende PID nennt (ohne systemctl: braucht als Benutzer kein D-Bus) und diese
// PID die Reserve ist: Nach einem Neustart bleibt die Meldung liegen, und ihre PID kann einem anderen Prozess gehören. proc: in
// Tests ein eigener Ordner; ohne /proc (nicht Linux) nur die PID.
export function reserveLaeuft(verzeichnis, proc = "/proc") {
  try {
    const { pid } = jsonLesen(join(verzeichnis, "speicher-reserve.json"), {}, 4096);
    process.kill(Number(pid), 0);
    if (existsSync(proc) && !readFileSync(join(proc, String(Number(pid)), "cmdline"), "utf8").includes("speicher-reserve")) return "aus";
    return "an";
  } catch (e) {
    return "aus";
  }
}

// Echte Proben; in Tests ersetzt (claude: [Befehl, ...Argumente] vor „auth status“, in Tests eine Attrappe).
export const proben = {
  claude: async (claude = [join(homedir(), ".local", "bin", "claude")]) =>
    ((await ausfuehren(claude[0], [...claude.slice(1), "auth", "status"])).ok ? "angemeldet" : "abgemeldet"),
  speicherReserve: async (verzeichnis) => reserveLaeuft(verzeichnis),
  uniZugangGespeichert: async () => existsSync(UNI_ZUGANG),
};

async function messen(verzeichnis, p) {
  const claude = await p.claude();
  const speicherReserve = await p.speicherReserve(verzeichnis);
  const uniZugang = !(await p.uniZugangGespeichert()) ? "fehlt" : da(join(verzeichnis, "abruf", "uni-zugang-falsch")) ? "falsch" : "gespeichert";
  const livesync = da(join(verzeichnis, "livesync-an")) ? "an" : "aus";
  return { claude, speicherReserve, uniZugang, livesync };
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
// nichts verloren, was lauf.mjs inzwischen geschrieben hat (lauf.mjs liest ebenso direkt vor dem Schreiben). Nur eine echte Datei,
// nie über einen Link (dateien.mjs): Läge an ihrer Stelle ein Link auf die Claude-Anmeldung, landete deren Inhalt sonst in einer
// gewöhnlichen Datei, die der Web-Dienst liest; geschrieben wird über eine eigene Zwischendatei, die den Link ersetzt. 0640: Der
// Web-Dienst (anderer Benutzer) liest den Zustand über die Gruppe studium-web, die der Datenordner vererbt.
export async function zustandAktualisieren(verzeichnis, p = proben) {
  const datei = join(verzeichnis, "zustand.json");
  const m = await messen(verzeichnis, p);
  const alt = jsonLesen(datei, {}, 1024 * 1024);
  const z = mischen(alt && typeof alt === "object" && !Array.isArray(alt) ? alt : {}, m);
  schreibenAtomar(datei, JSON.stringify(z, null, 2), 0o640);
  return z;
}

// realpathSync: Node löst den Symlink /opt/studium-server/aktuell für import.meta.url auf, für argv[1] nicht.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  zustandAktualisieren(process.env.STUDIUM_SERVER_DATEN || "/var/lib/studium-server")
    .then((z) => console.log(`zustand: claude ${z.claude}, uni-zugang ${z.uniZugang}, speicherreserve ${z.speicherReserve}, livesync ${z.livesync}`));
}
