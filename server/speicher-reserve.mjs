#!/usr/bin/env node
// Speicherreserve gegen das Anhalten bei Leerlauf. Oracle hält Always-Free-Instanzen an, wenn über 7 Tage CPU, Netz und
// (bei A1) Speicher alle unter 20 % liegen; der Server rechnet und funkt meist wenig. Dieser Dienst hält darum einen festen
// Teil des Arbeitsspeichers belegt (Standard 25 %), damit eine der drei Bedingungen nie zutrifft. Kein Rechnen auf
// Vorrat, kein künstlicher Datenverkehr. Läuft mit niedrigster Priorität und wird bei Speichernot als Erstes beendet
// (systemd: Nice=19, OOMScoreAdjust=1000). Abschalten: systemctl disable --now studium-server-speicher.
//   STUDIUM_RESERVE_MB=<n> feste Größe statt Anteil, STUDIUM_RESERVE_ANTEIL=<0..0.5> anderer Anteil
// Meldet sich mit speicher-reserve.json (PID, Größe) in $STUDIUM_SERVER_DATEN; zustand.mjs prüft, ob die PID noch lebt.
import { readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const MB = 2 ** 20;
const STUECK = 128 * MB;

export function reserveBytes(meminfo, env = {}) {
  if (Number(env.STUDIUM_RESERVE_MB) > 0) return Math.floor(Number(env.STUDIUM_RESERVE_MB) * MB);
  const anteil = Math.min(0.5, Math.max(0, Number(env.STUDIUM_RESERVE_ANTEIL) || 0.25));
  const m = /^MemTotal:\s+(\d+)\s*kB/m.exec(meminfo);
  return m ? Math.floor(Number(m[1]) * 1024 * anteil) : 0;
}

// Belegt die Bytes wirklich (jede Seite beschrieben), nicht nur reserviert.
export function belegen(bytes) {
  const teile = [];
  for (let rest = bytes; rest > 0; rest -= STUECK) teile.push(Buffer.allocUnsafeSlow(Math.min(STUECK, rest)).fill(0xa5));
  return teile;
}

// realpathSync: Node löst den Symlink /opt/studium-server/aktuell für import.meta.url auf, für argv[1] nicht.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const bytes = reserveBytes(readFileSync("/proc/meminfo", "utf8"), process.env);
  const teile = belegen(bytes);
  const meldung = join(process.env.STUDIUM_SERVER_DATEN || "/var/lib/studium-server", "speicher-reserve.json");
  writeFileSync(meldung, JSON.stringify({ pid: process.pid, mb: Math.round(bytes / MB), seit: new Date().toISOString() }));
  console.log(`speicherreserve: ${Math.round(bytes / MB)} MB belegt in ${teile.length} Stücken`);
  const halten = setInterval(() => teile.length, 2 ** 30);
  process.on("SIGTERM", () => { clearInterval(halten); rmSync(meldung, { force: true }); process.exit(0); });
}
