#!/usr/bin/env bash
# fern.sh: den eigenen Server aus der Oracle Cloud Shell bedienen, ohne IP-Adresse und ssh-Befehle von Hand (server/README.md).
# Holt bei jedem Aufruf die Adresse mit `einrichten.mjs adresse` (prüft dabei den Schlüssel) und ruft dann ssh auf. Läuft aus
# jedem Ordner, auch in einer neuen Cloud-Shell-Sitzung.
#   bash ~/studium-autopilot/server/fern.sh <befehl>
# Exit: wie `einrichten.mjs adresse` (1 Fehler, 2 anderer Schlüssel oder kein Konto), 3 unbekannter Befehl, 4 Server läuft
# nicht (RUNNING), 5 Server antwortet nicht auf ssh, sonst der Exit des Befehls auf dem Server.
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
# Feld aus der JSON-Ausgabe von `adresse`; „meldungen“ sind die Zeilen [status] text wie ohne --json. Ohne JSON (kein Konto
# gefunden: die Meldung steht dann schon auf stderr) leer.
feld() {
  node -e 'let j = {}; try { j = JSON.parse(require("fs").readFileSync(0, "utf8")); } catch (e) { j = {}; }
    const f = process.argv[1];
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

SSH=(-i "$SCHLUESSEL" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)
# Nur Befehle, die etwas abfragen (Code, Passwort), lesen von der Tastatur, im Terminal mit -t. Alle anderen bekommen -n: So
# schluckt ssh keine Zeilen, die nach dem Befehl eingefügt oder getippt wurden; sie laufen danach in der Cloud Shell.
case "$1" in
  claude-anmelden|uni-zugang) EINGABE=(); [ -t 0 ] && EINGABE=(-t) ;;
  *) EINGABE=(-n) ;;
esac
NICHT_ERREICHBAR="Ist er gerade erst angelegt oder neu gestartet: eine Minute warten, dann noch einmal."
fern() {
  local c=0
  ssh "${SSH[@]}" "${EINGABE[@]}" "ubuntu@$IP" "$1" || c=$?
  if [ "$c" -eq 255 ]; then
    echo "[fern] Der Server antwortet nicht auf ssh. $NICHT_ERREICHBAR" >&2
    exit 5
  fi
  return "$c"
}

case "$1" in
  installieren)
    scp "${SSH[@]}" studium-server.tar.gz "ubuntu@$IP:" || {
      echo "[fern] Das Paket ließ sich nicht auf den Server kopieren (Meldung von scp darüber). $NICHT_ERREICHBAR" >&2
      exit 5
    }
    fern "rm -rf server && tar -xzf studium-server.tar.gz && sudo bash server/installieren.sh --ip $IP" ;;
  neustart)
    # Neustart erst nach zwei Sekunden: So kommt ssh noch sauber zurück, statt mit 255 abzubrechen
    fern "sudo systemd-run --quiet --on-active=2 /usr/bin/systemctl reboot"
    echo "Der Server startet neu. Nach etwa einer Minute weiter." ;;
  claude-anmelden)
    fern "sudo -u studium -H /var/lib/studium/.local/bin/claude auth login; sudo studium-server zustand" ;;
  *)
    fern "sudo studium-server $*" ;;
esac
