#!/usr/bin/env bash
# fern.sh: den eigenen Server aus der Oracle Cloud Shell bedienen, ohne IP-Adresse und ssh-Befehle von Hand (server/README.md).
# Holt bei jedem Aufruf die Adresse mit `einrichten.mjs adresse` (prüft dabei den Schlüssel) und ruft dann ssh auf. Läuft aus
# jedem Ordner, auch in einer neuen Cloud-Shell-Sitzung.
#   bash ~/studium-autopilot/server/fern.sh <befehl>
# Exit: wie `einrichten.mjs adresse` (1 Fehler, 2 anderer Schlüssel oder kein Konto), 3 unbekannter Befehl, 4 Server läuft
# nicht (RUNNING), 5 Server antwortet nicht auf ssh, 6 Server meldet sich mit einem anderen Schlüssel als beim letzten Mal (neu
# angelegt unter derselben IP), 7 Paket ohne gültige Signatur (installieren), sonst der Exit des Befehls auf dem Server.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
SCHLUESSEL="$HOME/.ssh/studium_autopilot"
# Wer Server-Pakete signieren darf: dieselben Schlüssel wie server/allowed_signers und start.sh (tests/paket-pruefen.test.js), fest
# hier statt aus dem Paket, das gleich als root auf den Server geht
SIGNIERSCHLUESSEL=('ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIBVvg98K+YQb1YhQFh5w2EE4QEs8QG7gN3jRK6G8pzjc')

hilfe() {
  cat >&2 <<'TEXT'
Aufruf: bash ~/studium-autopilot/server/fern.sh <befehl>
  installieren                     Server-Paket auf den Server kopieren und installieren (wiederholbar)
  neustart                         Server neu starten (nach „Boot-Volume … vergrößert“)
  claude-anmelden                  Claude Code auf dem Server mit deinem Abo anmelden, danach den Zustand prüfen
  status | zustand | verbinden | jetzt | lauf | aktualisieren [--jetzt]
  schluessel-erneuern              neue Schlüssel, wenn ein Gerät verloren ist (danach jedes Gerät neu verbinden)
  uni-zugang setzen|loeschen|pruefen
  livesync [einschalten|verbinden|aufbauen]
  livesync-erneuern [--neue-passphrase]   neue Zugangsdaten für LiveSync (jedes Gerät braucht danach einen neuen Link)
  modell sonnet|opus
TEXT
}

[ $# -gt 0 ] || { hilfe; exit 3; }
case "$1" in
  installieren|neustart|claude-anmelden|status|zustand|verbinden|jetzt|lauf|aktualisieren|uni-zugang|livesync|livesync-erneuern|modell|schluessel-erneuern) ;;
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
# Meldungen von ssh und scp gehen wie immer auf stderr und zugleich in eine Datei: Ein anderer Schlüssel des Servers (neu
# angelegt, und Oracle gab ihm eine IP, die ~/.ssh/known_hosts schon kennt) sähe sonst aus wie „antwortet nicht“, und
# Warten hülfe nie.
MELDUNG=$(mktemp)
trap 'rm -f "$MELDUNG"' EXIT
# (stdout über Kanal 3 unverändert, stderr durch tee; mit pipefail bleibt der Exit der des Befehls)
mitschreiben() {
  local c=0
  { "$@" 2>&1 1>&3 3>&- | tee "$MELDUNG" >&2; } 3>&1 || c=$?
  return "$c"
}
anderer_schluessel() {
  if grep -q -e "REMOTE HOST IDENTIFICATION HAS CHANGED" -e "Host key verification failed" "$MELDUNG"; then
    echo "[fern] Der Server meldet sich mit einem anderen Schlüssel als beim letzten Mal. So ist es, wenn er neu angelegt wurde;" \
      "dann den alten Eintrag löschen und noch einmal: ssh-keygen -R $IP" >&2
    exit 6
  fi
}
fern() {
  local c=0
  mitschreiben ssh "${SSH[@]}" "${EINGABE[@]}" "ubuntu@$IP" "$1" || c=$?
  if [ "$c" -eq 255 ]; then
    anderer_schluessel
    echo "[fern] Der Server antwortet nicht auf ssh. $NICHT_ERREICHBAR" >&2
    exit 5
  fi
  return "$c"
}

# Signatur von studium-server.tar.gz (daneben .sig) wie in start.sh: ssh-keygen -Y verify, sonst Node.js mit server/paket-pruefen.mjs
# (Cloud Shell im FIPS-Modus). Namensraum studium-server; studium-server-test nur mit STUDIUM_TESTPAKET=1 (start.sh --paket-da, Beta).
paket_gueltig() {
  local d s ns c=1 namensraeume=(studium-server)
  [ "${STUDIUM_TESTPAKET:-}" != 1 ] || namensraeume+=(studium-server-test)
  [ -f studium-server.tar.gz ] && [ -f studium-server.tar.gz.sig ] || return 1
  d=$(mktemp -d)
  for ns in "${namensraeume[@]}"; do
    for s in "${SIGNIERSCHLUESSEL[@]}"; do printf 'release@studium-autopilot namespaces="%s" %s\n' "$ns" "$s"; done >"$d/erlaubt"
    if ssh-keygen -Y verify -f "$d/erlaubt" -I release@studium-autopilot -n "$ns" -s studium-server.tar.gz.sig <studium-server.tar.gz >/dev/null 2>&1 \
      || node server/paket-pruefen.mjs "$d/erlaubt" release@studium-autopilot "$ns" studium-server.tar.gz.sig studium-server.tar.gz >/dev/null; then
      c=0
      break
    fi
  done
  rm -rf "$d"
  return "$c"
}

case "$1" in
  installieren)
    paket_gueltig || {
      echo "[signatur] studium-server.tar.gz hat keine gültige Signatur (studium-server.tar.gz.sig daneben); nichts auf den Server kopiert." >&2
      exit 7
    }
    mitschreiben scp "${SSH[@]}" studium-server.tar.gz "ubuntu@$IP:" || {
      anderer_schluessel
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
