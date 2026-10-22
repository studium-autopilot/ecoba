#!/usr/bin/env bash
# fern.sh: den eigenen Server aus der Oracle Cloud Shell bedienen, ohne IP-Adresse und ssh-Befehle von Hand (server/README.md).
# Holt bei jedem Aufruf die Adresse mit `einrichten.mjs adresse` (prüft dabei den Schlüssel) und ruft dann ssh auf. Läuft aus
# jedem Ordner, auch in einer neuen Cloud-Shell-Sitzung.
#   bash ~/studium-autopilot/server/fern.sh <befehl>
# Exit: wie `einrichten.mjs adresse` (1 Fehler, 2 anderer Schlüssel), 3 unbekannter Befehl, 4 Server läuft nicht (RUNNING),
# sonst der Exit des Befehls auf dem Server.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
SCHLUESSEL="$HOME/.ssh/studium_autopilot"

hilfe() {
  cat >&2 <<'TEXT'
Aufruf: bash ~/studium-autopilot/server/fern.sh <befehl>
  installieren                     Server-Paket auf den Server kopieren und installieren (wiederholbar)
  neustart                         Server neu starten (nach „Boot-Volume … vergrößert“)
  claude-anmelden                  Claude Code auf dem Server mit deinem Abo anmelden, danach den Zustand prüfen
  status | zustand | verbinden | jetzt | lauf | aktualisieren
  uni-zugang setzen|loeschen|pruefen
  livesync [einschalten|verbinden]
  modell sonnet|opus
TEXT
}

[ $# -gt 0 ] || { hilfe; exit 3; }
case "$1" in
  installieren|neustart|claude-anmelden|status|zustand|verbinden|jetzt|lauf|aktualisieren|uni-zugang|livesync|modell) ;;
  *) echo "Unbekannter Befehl: $1" >&2; hilfe; exit 3 ;;
esac
for a in "$@"; do
  [[ "$a" =~ ^[a-z-]+$ ]] || { echo "Ungültige Angabe: $a" >&2; exit 3; }
done

code=0
info=$(node server/einrichten.mjs adresse --json) || code=$?
# Feld aus der JSON-Ausgabe von `adresse`; „meldungen“ sind die Zeilen [status] text wie ohne --json
feld() {
  node -e 'const j = JSON.parse(require("fs").readFileSync(0, "utf8")); const f = process.argv[1];
    console.log(f === "meldungen" ? (j.schritte || []).map((s) => `[${s.status}] ${s.text}`).join("\n") : j[f] || "")' "$1" <<<"$info"
}
if [ "$code" -ne 0 ]; then
  feld meldungen
  exit "$code"
fi
IP=$(feld ip)
ZUSTAND=$(feld zustand)
if [ "$ZUSTAND" != RUNNING ]; then
  echo "[warten] Der Server ist $ZUSTAND, nicht RUNNING."
  exit 4
fi

SSH=(-i "$SCHLUESSEL" -o StrictHostKeyChecking=accept-new)
TERMINAL=()
[ -t 0 ] && TERMINAL=(-t)
fern() { ssh "${SSH[@]}" "${TERMINAL[@]}" "ubuntu@$IP" "$1"; }

case "$1" in
  installieren)
    scp "${SSH[@]}" studium-server.tar.gz "ubuntu@$IP:"
    fern "tar -xzf studium-server.tar.gz && sudo bash server/installieren.sh --ip $IP" ;;
  neustart)
    fern "sudo reboot" || true
    echo "Der Server startet neu. Nach etwa einer Minute weiter." ;;
  claude-anmelden)
    fern "sudo -u studium -H /var/lib/studium/.local/bin/claude auth login; sudo studium-server zustand" ;;
  *)
    fern "sudo studium-server $*" ;;
esac
