#!/usr/bin/env bash
# Installiert oder aktualisiert den eigenen Server von Studium Autopilot (server/README.md) auf Ubuntu 24.04.
# Wiederholbar: Jeder Schritt prüft zuerst, ob er schon erledigt ist; Schlüssel und Uni-Zugang bleiben erhalten.
#   sudo bash installieren.sh --ip <öffentliche IP>   Adresse wird https://<IP mit Bindestrichen>.sslip.io (Let's Encrypt)
#   sudo bash installieren.sh --test                  ohne HTTPS und ohne Claude Code (Caddy auf :8080, nur für Tests)
#   --reserve-mb <n>                                  feste Speicherreserve statt 25 % (speicher-reserve.mjs)
set -euo pipefail

QUELLE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
IP=""
TEST=0
RESERVE_MB=""
while [ $# -gt 0 ]; do
  case "$1" in
    --ip) IP="${2:-}"; shift 2 ;;
    --test) TEST=1; shift ;;
    --reserve-mb) RESERVE_MB="${2:-}"; shift 2 ;;
    *) echo "Unbekannte Option: $1" >&2; exit 2 ;;
  esac
done

schritt() { printf '\n==> %s\n' "$*"; }
fehler() { echo "Fehler: $*" >&2; exit 1; }
# Ist Version $1 neuer als $2? Wie bei SemVer zählt eine Vorabversion weniger als die fertige mit derselben Nummer
# (0.5.9-beta.1 < 0.5.9 < 0.5.10); sort -V allein sähe 0.5.9-beta.1 nach 0.5.9. Gleiche Fassung in studium-server.
version_neuer() {
  local a=$1 b=$2 ka=${1%%-*} kb=${2%%-*}
  [ "$a" != "$b" ] || return 1
  if [ "$ka" = "$kb" ]; then
    [ "$a" != "$ka" ] || return 0
    [ "$b" != "$kb" ] || return 1
    ka=${a#*-} kb=${b#*-}
  fi
  [ "$(printf '%s\n%s\n' "$ka" "$kb" | sort -V | tail -n 1)" = "$ka" ]
}
# Einheiten, die dieses Paket nicht mehr schreibt (entfernt oder umbenannt), abschalten und löschen: jede Datei studium-server*
# in $1, deren Name nicht in GESCHRIEBEN steht (einheit unten); sonst liefe ein alter Dienst auf jedem Server für immer weiter.
# Ordner bleiben (Drop-ins *.d der Einheiten von heute; *.wants räumt systemctl disable auf), nur der Drop-in einer gelöschten
# Einheit geht mit. Eine Vorlage (name@.service) hat keine Instanz unter ihrem Namen: alle ihre Instanzen anhalten.
alte_einheiten_entfernen() {
  local datei name
  for datei in "$1"/studium-server*; do
    [ ! -d "$datei" ] || continue
    [ -e "$datei" ] || [ -L "$datei" ] || continue
    name=${datei##*/}
    case " ${GESCHRIEBEN[*]} " in *" $name "*) continue ;; esac
    if [[ "$name" == *@.* ]]; then
      systemctl stop "${name%%@*}@*.${name##*.}" || true
      systemctl disable "$name" || true
    else
      systemctl disable --now "$name" || true
    fi
    rm -rf "$datei" "$datei.d"
    echo "entfernt: $name"
  done
}

[ "$(id -u)" -eq 0 ] || fehler "bitte mit sudo starten"
# shellcheck disable=SC1091
. /etc/os-release
[ "${ID:-}" = ubuntu ] && [ "${VERSION_ID:-}" = 24.04 ] || fehler "nur für Ubuntu 24.04 (gefunden: ${PRETTY_NAME:-unbekannt})"
if [ "$TEST" -eq 0 ]; then
  [[ "$IP" =~ ^([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$ ]] || fehler "--ip <öffentliche IP> fehlt oder ist ungültig"
  ADRESSE="https://${IP//./-}.sslip.io"
else
  ADRESSE="http://127.0.0.1:8080"
fi
[ -z "$RESERVE_MB" ] || [[ "$RESERVE_MB" =~ ^[0-9]+$ ]] || fehler "--reserve-mb erwartet eine Zahl"
VERSION=$(tr -d '[:space:]' <"$QUELLE/VERSION")
ZIEL="/opt/studium-server/$VERSION"
# Nur vorwärts: Eine ältere Kopie des Pakets (etwa aus einer früheren Cloud-Shell-Sitzung) ersetzt nie einen neueren Stand.
INSTALLIERT=""
[ ! -f /opt/studium-server/aktuell/VERSION ] || INSTALLIERT=$(tr -d '[:space:]' </opt/studium-server/aktuell/VERSION)
if [ -n "$INSTALLIERT" ] && version_neuer "$INSTALLIERT" "$VERSION"; then
  fehler "installiert ist $INSTALLIERT, dieses Paket ist älter ($VERSION); nichts geändert. Das neueste holt: sudo studium-server aktualisieren (Cloud Shell: bash ~/studium-autopilot/server/fern.sh aktualisieren)"
fi
export DEBIAN_FRONTEND=noninteractive

schritt "Pakete"
fehlend=()
for p in nodejs jq qrencode curl ca-certificates gnupg python3 poppler-utils iptables iptables-persistent unattended-upgrades; do
  dpkg -s "$p" >/dev/null 2>&1 || fehlend+=("$p")
done
if [ ${#fehlend[@]} -gt 0 ]; then
  echo "iptables-persistent iptables-persistent/autosave_v4 boolean false" | debconf-set-selections
  echo "iptables-persistent iptables-persistent/autosave_v6 boolean false" | debconf-set-selections
  apt-get update -q
  apt-get install -y -q --no-install-recommends "${fehlend[@]}"
else
  echo "schon da"
fi

schritt "Caddy (offizielles Paketarchiv)"
if ! command -v caddy >/dev/null; then
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt -o /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -q
  apt-get install -y -q caddy
else
  echo "schon da ($(caddy version | cut -d' ' -f1))"
fi

schritt "Benutzer und Ordner"
id studium >/dev/null 2>&1 || useradd --system --create-home --home-dir /var/lib/studium --shell /bin/bash studium
# Eigener Benutzer für den Abruf mit Uni-Zugang: Das entschlüsselte Passwort (/run/credentials/…) liest nur er, nicht studium,
# unter dem der Web-Dienst und der Claude-Lauf laufen. Gruppe studium, damit der Lauf die Rohdaten übernehmen kann.
id studium-abruf >/dev/null 2>&1 || useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin --gid studium studium-abruf
install -d -m 0750 -o root -g studium /etc/studium-server
install -d -m 0770 -o studium -g studium /var/lib/studium-server
install -d -m 0750 -o studium -g studium /var/lib/studium-server/eingang
install -d -m 0700 -o studium -g studium /var/lib/studium-server/verbinden
install -d -m 0755 /etc/credstore.encrypted
install -d -m 0755 "$ZIEL"
for datei in VERSION README.md kanal.mjs dienst.mjs verbinden.mjs zustand.mjs speicher-reserve.mjs eingang.mjs lauf.mjs abrufen.py livesync.mjs livesync.sh studium-server installieren.sh; do
  install -m 0644 "$QUELLE/$datei" "$ZIEL/$datei"
done
rm -rf "$ZIEL/skill"
cp -r "$QUELLE/skill" "$ZIEL/skill"
chmod -R a+rX "$ZIEL/skill"
install -d -m 0750 -o studium -g studium /var/lib/studium-server/laeufe
# bisher laufende Version: bleibt bei „Alte Pakete“ zum Zurückgehen von Hand
VORHER=$(readlink -f /opt/studium-server/aktuell 2>/dev/null || true)
ln -sfn "$ZIEL" /opt/studium-server/aktuell
install -m 0755 "$ZIEL/studium-server" /usr/local/bin/studium-server
echo "Paket $VERSION unter $ZIEL"

schritt "Schlüssel und Konfiguration"
KONFIG=/etc/studium-server/dienst.json
# Bestehende Schlüssel bleiben; sonst neue (32 Byte, base64url). Adresse, IP und Version werden nachgezogen.
STUDIUM_KONFIG="$KONFIG" STUDIUM_ADRESSE="$ADRESSE" STUDIUM_IP="$IP" STUDIUM_VERSION="$VERSION" node --input-type=module -e '
  import { readFileSync, writeFileSync } from "node:fs";
  import { randomBytes } from "node:crypto";
  const datei = process.env.STUDIUM_KONFIG;
  let k = {};
  try { k = JSON.parse(readFileSync(datei, "utf8")); } catch (e) { k = {}; }
  const neu = !k.zugang || !k.schluessel;
  k.zugang ||= randomBytes(32).toString("base64url");
  k.schluessel ||= randomBytes(32).toString("base64url");
  Object.assign(k, { adresse: process.env.STUDIUM_ADRESSE, ip: process.env.STUDIUM_IP, port: k.port || 8743, version: process.env.STUDIUM_VERSION });
  writeFileSync(datei, JSON.stringify(k, null, 2) + "\n", { mode: 0o640 });
  console.log(neu ? "neue Schlüssel erzeugt" : "Schlüssel unverändert");
'
chown root:studium "$KONFIG"
chmod 0640 "$KONFIG"
if [ -n "$RESERVE_MB" ]; then
  echo "STUDIUM_RESERVE_MB=$RESERVE_MB" >/etc/studium-server/speicher.env
  chmod 0644 /etc/studium-server/speicher.env
fi

schritt "Dienste (systemd)"
# Jede Einheit über einheit: Es merkt sich den Namen für alte_einheiten_entfernen (nach der letzten). Einheiten studium-server*
# legt nur dieses Skript an (tests/server.test.js prüft das); eine von anderswo entfernte der nächste Lauf.
EINHEITEN=/etc/systemd/system
GESCHRIEBEN=()
einheit() { cat >"$EINHEITEN/$1"; GESCHRIEBEN+=("$1"); }
einheit studium-server-dienst.service <<'UNIT'
[Unit]
Description=Studium Autopilot: Web-Dienst des eigenen Servers (nur 127.0.0.1)
After=network-online.target
Wants=network-online.target

[Service]
User=studium
Group=studium
Environment=STUDIUM_SERVER_KONFIG=/etc/studium-server/dienst.json STUDIUM_SERVER_DATEN=/var/lib/studium-server
ExecStart=/usr/bin/node /opt/studium-server/aktuell/dienst.mjs
Restart=on-failure
RestartSec=5
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
ProtectProc=invisible
ReadWritePaths=/var/lib/studium-server
InaccessiblePaths=/etc/credstore.encrypted -/run/credentials

[Install]
WantedBy=multi-user.target
UNIT
einheit studium-server-speicher.service <<'UNIT'
[Unit]
Description=Studium Autopilot: Speicherreserve gegen Anhalten bei Leerlauf

[Service]
User=studium
Group=studium
Environment=STUDIUM_SERVER_DATEN=/var/lib/studium-server
EnvironmentFile=-/etc/studium-server/speicher.env
ExecStart=/usr/bin/node /opt/studium-server/aktuell/speicher-reserve.mjs
Restart=on-failure
RestartSec=60
Nice=19
CPUWeight=1
IOWeight=1
OOMScoreAdjust=1000
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
ReadWritePaths=/var/lib/studium-server

[Install]
WantedBy=multi-user.target
UNIT
einheit studium-server-zustand.service <<'UNIT'
[Unit]
Description=Studium Autopilot: Zustand für den Status prüfen

[Service]
Type=oneshot
User=studium
Group=studium
Environment=STUDIUM_SERVER_DATEN=/var/lib/studium-server
ExecStart=/usr/bin/node /opt/studium-server/aktuell/zustand.mjs
UNIT
einheit studium-server-zustand.timer <<'UNIT'
[Unit]
Description=Studium Autopilot: Zustand alle 15 Minuten prüfen

[Timer]
OnBootSec=2min
OnUnitActiveSec=15min

[Install]
WantedBy=timers.target
UNIT
einheit studium-server-aktualisieren.service <<'UNIT'
[Unit]
Description=Studium Autopilot: Server-Paket aktualisieren (nur mit passender Prüfsumme)
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/usr/local/bin/studium-server aktualisieren
UNIT
einheit studium-server-aktualisieren.timer <<'UNIT'
[Unit]
Description=Studium Autopilot: täglich nach einem neuen Server-Paket sehen

[Timer]
OnCalendar=daily
RandomizedDelaySec=2h
Persistent=true

[Install]
WantedBy=timers.target
UNIT
# Abruf ohne KI: nur das Uni-Postfach (Termine aus dem ILIAS-Kalender holt das Plugin selbst). Läuft nur mit gespeichertem
# Uni-Zugang und nie nach einer abgelehnten Anmeldung; den Zugang bekommt nur dieser Dienst. Zeitplan nach der Uhr
# (OnCalendar), weil ein übersprungener Dienst (Bedingung nicht erfüllt) einen relativen Zeitgeber nicht weiterstellt.
einheit studium-server-abruf.service <<'UNIT'
[Unit]
Description=Studium Autopilot: Uni-Postfach ohne KI lesen (nur mit gespeichertem Uni-Zugang)
After=network-online.target
Wants=network-online.target
ConditionPathExists=/etc/credstore.encrypted/uni-zugang
ConditionPathExists=!/var/lib/studium-server/uni-zugang-falsch

[Service]
Type=oneshot
User=studium-abruf
Group=studium
UMask=0007
Environment=STUDIUM_SERVER_DATEN=/var/lib/studium-server
LoadCredentialEncrypted=uni-zugang:/etc/credstore.encrypted/uni-zugang
ExecStart=/usr/bin/python3 /opt/studium-server/aktuell/abrufen.py
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
ProtectProc=invisible
ReadWritePaths=/var/lib/studium-server
UNIT
einheit studium-server-abruf.timer <<'UNIT'
[Unit]
Description=Studium Autopilot: Uni-Postfach ohne KI prüfen (alle 15 Minuten oder seltener laut Takt, ab 06:30 der Sicherheitslauf)

[Timer]
OnBootSec=3min
OnCalendar=*:0/15
RandomizedDelaySec=1min

[Install]
WantedBy=timers.target
UNIT
einheit studium-server-lauf.path <<'UNIT'
[Unit]
Description=Studium Autopilot: Claude-Lauf, sobald ein Anstoß da ist

[Path]
PathExists=/var/lib/studium-server/anstoss
Unit=studium-server-lauf.service

[Install]
WantedBy=paths.target
UNIT
# Der Claude-Lauf bekommt nie den Uni-Zugang und sieht weder die Schlüssel noch die Credentials. Zeitgrenze: ein Lauf mit Opus
# und der gewöhnliche danach, je bis 45 Minuten (lauf.mjs), dazu Luft; bricht systemd trotzdem ab (oder ein Neustart), legt
# lauf.mjs Rohdaten und Unterlagen zurück.
einheit studium-server-lauf.service <<'UNIT'
[Unit]
Description=Studium Autopilot: Claude-Lauf mit dem Skill (ohne Zugangsdaten)
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=studium
Group=studium
Environment=STUDIUM_SERVER_DATEN=/var/lib/studium-server HOME=/var/lib/studium
EnvironmentFile=-/etc/studium-server/lauf.env
ExecStart=/usr/bin/node /opt/studium-server/aktuell/lauf.mjs
TimeoutStartSec=100min
NoNewPrivileges=yes
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
ReadWritePaths=/var/lib/studium-server /var/lib/studium
InaccessiblePaths=/etc/credstore.encrypted -/etc/studium-server/dienst.json -/run/credentials
ProtectProc=invisible
ProcSubset=pid
UNIT
einheit studium-server-gmail.service <<'UNIT'
[Unit]
Description=Studium Autopilot: Anstoß für die Gmail-Suche

[Service]
Type=oneshot
User=studium
Group=studium
Environment=STUDIUM_SERVER_DATEN=/var/lib/studium-server
ExecStart=/usr/bin/node /opt/studium-server/aktuell/lauf.mjs --anstoss gmail
UNIT
einheit studium-server-gmail.timer <<'UNIT'
[Unit]
Description=Studium Autopilot: Gmail bis zu dreimal am Tag durchsuchen (laut Takt)

[Timer]
OnCalendar=*-*-* 07,13,19:30:00 Europe/Berlin
RandomizedDelaySec=10min
Persistent=true

[Install]
WantedBy=timers.target
UNIT
alte_einheiten_entfernen "$EINHEITEN"
systemctl daemon-reload
systemctl enable -q studium-server-dienst.service studium-server-speicher.service studium-server-zustand.timer \
  studium-server-abruf.timer studium-server-lauf.path studium-server-gmail.timer
[ "$TEST" -eq 1 ] || systemctl enable -q studium-server-aktualisieren.timer
systemctl restart studium-server-dienst.service studium-server-speicher.service
systemctl start studium-server-zustand.timer studium-server-abruf.timer studium-server-lauf.path studium-server-gmail.timer
[ "$TEST" -eq 1 ] || systemctl start studium-server-aktualisieren.timer

schritt "Caddy (HTTPS)"
CADDYFILE=/etc/caddy/Caddyfile
if [ -f "$CADDYFILE" ] && ! grep -q '^# studium-server' "$CADDYFILE"; then
  cp "$CADDYFILE" "$CADDYFILE.vor-studium-server"
  echo "bisherige Caddyfile gesichert: $CADDYFILE.vor-studium-server"
fi
if [ "$TEST" -eq 1 ]; then SEITE=":8080"; else SEITE="${ADRESSE#https://}"; fi
# Weitere Adressen (LiveSync, livesync.sh) legen ihre Teile in studium-server.d/ ab; sie bleiben bei jeder Installation
install -d -m 0755 /etc/caddy/studium-server.d
cat >"$CADDYFILE" <<CADDY
# studium-server (installieren.sh): wird bei jeder Installation neu geschrieben
$SEITE {
	# handle statt loser Direktiven: Caddy sortiert respond sonst vor reverse_proxy, und alles wäre 404.
	handle /v1/* {
		reverse_proxy 127.0.0.1:8743
	}
	handle {
		respond 404
	}
}

import /etc/caddy/studium-server.d/*.caddy
CADDY
caddy validate --config "$CADDYFILE" --adapter caddyfile >/dev/null
systemctl enable -q caddy
if systemctl is-active --quiet caddy; then systemctl reload caddy; else systemctl start caddy; fi
# Mit LiveSync: dessen Adresse und Caddy-Teil auf die IP von eben (nach einem Wechsel zeigten sie sonst auf die alte)
[ ! -f /etc/caddy/studium-server.d/livesync.caddy ] || bash "$ZIEL/livesync.sh" adresse

schritt "Firewall des Servers (Port 443)"
if iptables -L INPUT -n >/dev/null 2>&1; then
  if iptables -C INPUT -p tcp --dport 443 -m state --state NEW -j ACCEPT 2>/dev/null; then
    echo "schon offen"
  else
    # Oracle-Abbilder enden mit einer REJECT-Regel; die Freigabe muss davor stehen.
    pos=$(iptables -L INPUT --line-numbers -n | awk '$2 == "REJECT" { print $1; exit }')
    if [ -n "$pos" ]; then iptables -I INPUT "$pos" -p tcp --dport 443 -m state --state NEW -j ACCEPT
    else iptables -A INPUT -p tcp --dport 443 -m state --state NEW -j ACCEPT; fi
    netfilter-persistent save >/dev/null 2>&1 || true
    echo "Port 443 freigegeben"
  fi
else
  echo "iptables nicht verfügbar, übersprungen"
fi

schritt "SSH nur mit Schlüssel"
# Oracles Ubuntu-Abbild stellt das schon so ein; die eigene Datei kommt vor denen des Abbilds (60-…) und hält es fest
if [ -d /etc/ssh/sshd_config.d ] && command -v sshd >/dev/null; then
  cat >/etc/ssh/sshd_config.d/10-studium-server.conf <<'SSHD'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
SSHD
  if sshd -t; then systemctl reload ssh 2>/dev/null || true; echo "festgelegt"
  else rm -f /etc/ssh/sshd_config.d/10-studium-server.conf; fehler "SSH-Einstellungen ungültig, nichts geändert"; fi
else
  echo "kein SSH-Server, übersprungen"
fi

schritt "Sicherheitsupdates"
cat >/etc/apt/apt.conf.d/20auto-upgrades <<'APT'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT
# Kernel-Updates wirken erst nach einem Neustart; der Server startet nur, wenn eins wartet, und vor dem Sicherheitslauf (06:30 Berlin)
cat >/etc/apt/apt.conf.d/52studium-server-neustart <<'APT'
Unattended-Upgrade::Automatic-Reboot "true";
Unattended-Upgrade::Automatic-Reboot-Time "03:30";
APT
echo "automatisch, bei Bedarf Neustart um 03:30 Uhr (UTC)"

schritt "Claude Code für den Benutzer studium"
if [ "$TEST" -eq 1 ]; then
  echo "im Testmodus übersprungen"
elif [ -x /var/lib/studium/.local/bin/claude ]; then
  echo "schon da"
else
  sudo -u studium -H bash -c 'curl -fsSL https://claude.ai/install.sh | bash'
fi

schritt "Prüfen"
for i in $(seq 1 20); do
  curl -fsS http://127.0.0.1:8743/v1/status >/dev/null 2>&1 && break
  sleep 1
  [ "$i" -lt 20 ] || fehler "der Web-Dienst antwortet nicht (journalctl -u studium-server-dienst)"
done
systemctl start studium-server-zustand.service || true
studium-server status

schritt "Alte Pakete"
# Es bleiben dieses und das bisher laufende (zum Zurückgehen von Hand); alle anderen fallen weg
alte=$(find /opt/studium-server -mindepth 1 -maxdepth 1 -type d ! -path "$ZIEL" ! -path "${VORHER:-$ZIEL}")
if [ -n "$alte" ]; then
  while IFS= read -r d; do rm -rf "$d"; echo "entfernt: ${d##*/}"; done <<<"$alte"
else
  echo "nichts zu tun"
fi

cat <<TEXT

Fertig. Adresse: $ADRESSE
Nächste Schritte in der Cloud Shell (bash ~/studium-autopilot/server/fern.sh <befehl>):
  claude-anmelden      Claude auf dem Server anmelden
  uni-zugang setzen    (freiwillig) Uni-Zugang verschlüsselt speichern
  verbinden            Link und QR-Code, um Obsidian zu verbinden
  livesync             (freiwillig) LiveSync: Tresor zwischen Windows, iPhone und iPad abgleichen
Direkt auf dem Server: sudo studium-server <befehl>, Claude anmelden mit sudo -u studium -i claude auth login
TEXT
