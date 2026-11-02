#!/usr/bin/env bash
# Installiert oder aktualisiert den eigenen Server von Studium Autopilot (server/README.md) auf Ubuntu 24.04.
# Wiederholbar: Jeder Schritt prüft zuerst, ob er schon erledigt ist; Schlüssel und Uni-Zugang bleiben erhalten.
#   sudo bash installieren.sh --ip <öffentliche IP>   Adresse wird https://<IP mit Bindestrichen>.sslip.io (Let's Encrypt)
#   sudo bash installieren.sh --test                  ohne HTTPS und ohne Claude Code (Caddy auf :8080, nur für Tests)
#   sudo bash installieren.sh --vorbereiten           alles außer Adresse und HTTPS (erster Start, einrichten.mjs serverStart);
#                                                     eine schon gesetzte Adresse bleibt. Den Rest macht ein Lauf mit --ip.
#   --reserve-mb <n>                                  feste Speicherreserve statt 25 % (speicher-reserve.mjs)
set -euo pipefail

QUELLE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
IP=""
TEST=0
VORBEREITEN=0
RESERVE_MB=""
while [ $# -gt 0 ]; do
  case "$1" in
    --ip) IP="${2:-}"; shift 2 ;;
    --test) TEST=1; shift ;;
    --vorbereiten) VORBEREITEN=1; shift ;;
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

# Ordnung des Datenordners (server/README.md, „Wer was liest und schreibt“): Jeder Benutzer schreibt nur in seinen Ordner.
#   studium (Lauf, Zustand, Reserve)  der Datenordner selbst (2711: Web-Dienst und Abruf gehen nur hindurch), laeufe/
#   studium-web (Web-Dienst)          web/, dazu eingang/ (Ergebnisse des Laufs; er löscht Übernommenes) und unterlagen/ (für den Lauf)
#   studium-abruf (Abruf)             abruf/ (roh/ und den Anstoß übernimmt der Lauf über die Gruppe studium)
# Datenordner, eingang/ und unterlagen/ gehören der Gruppe studium-web und vererben sie (setgid). Lesen kann der Web-Dienst dort nur,
# was der Lauf ausdrücklich so schreibt (zustand.json, Ergebnisse: 0640); alles andere bleibt 0600. Den Lauf lässt seine Einheit in
# die Gruppe (SupplementaryGroups=), nicht der Benutzer studium.
# ordner: Ordner $1 direkt in einem Ordner, den nur root oder studium ändert, mit Besitzer $2 und Rechten $3 anlegen bzw. richten. Ein
# Link oder eine Datei an seiner Stelle fällt weg. root folgt dabei keinem Link: chown -h ändert den Link selbst, die Rechte setzt
# fchmod über einen Deskriptor, den open mit O_NOFOLLOW und O_DIRECTORY nur für einen echten Ordner bekommt (liegt zwischen Prüfung
# und Öffnen plötzlich ein Link da, scheitert es, statt die Rechte des Ziels zu ändern). fchmod setzt den Modus genau, auch setgid
# aus; chmod(1) ließe das Bit eines Ordners bei einer Zahl wie 0700 stehen.
ordner() {
  if [ -L "$1" ] || { [ -e "$1" ] && [ ! -d "$1" ]; }; then rm -f -- "$1"; fi
  [ -d "$1" ] || (umask 077 && mkdir -- "$1")
  chown -h -- "$2" "$1"
  node -e '
    const { openSync, fchmodSync, closeSync, constants: c } = require("node:fs");
    const fd = openSync(process.argv[1], c.O_RDONLY | c.O_DIRECTORY | c.O_NOFOLLOW);
    fchmodSync(fd, parseInt(process.argv[2], 8));
    closeSync(fd);
  ' "$1" "$3" || fehler "$1: Rechte ließen sich nicht setzen (ein Link an seiner Stelle?)"
}
# Bis 0.7.6 liefen Web-Dienst und Claude-Lauf beide als studium, und der Abruf schrieb über die Gruppe direkt in den Datenordner. Was
# die beiden dort ablegten, zieht einmal in ihren Ordner um (umziehen, zusammenfuehren): nur echte Dateien und Ordner, alles andere
# fällt weg; liegt dort schon eine Datei gleichen Namens (ein abgebrochener Umzug, danach lief nach einem Neustart noch das alte
# Paket), bleibt die neuere (ersetzt: neuer).
ALT_WEB=(takt.json knopf.json abruf.json stand-plugin.json geraete.json verbinden livesync-links)
ALT_ABRUF=(roh abruf-stand.json uni-zugang-falsch)
ersetzt() { [ -f "$1" ] && [ ! -L "$1" ] && [ -f "$2" ] && [ ! -L "$2" ] && [ "$1" -nt "$2" ]; }
zusammenfuehren() {
  local e n
  for e in "$1"/* "$1"/.[!.]*; do
    [ -e "$e" ] || [ -L "$e" ] || continue
    n=${e##*/}
    if [ -d "$e" ] && [ ! -L "$e" ] && [ -d "$2/$n" ] && [ ! -L "$2/$n" ]; then
      zusammenfuehren "$e" "$2/$n"
    elif { [ ! -e "$2/$n" ] && [ ! -L "$2/$n" ]; } || ersetzt "$e" "$2/$n"; then
      mv -fT -- "$e" "$2/$n"
    fi
  done
  rm -rf -- "$1"
}
umziehen() {
  local von="$1/$2" nach="$1/$3/$2"
  if [ ! -e "$von" ] && [ ! -L "$von" ]; then return 0; fi
  if [ -L "$von" ] || { [ ! -f "$von" ] && [ ! -d "$von" ]; }; then
    rm -f -- "$von"
  elif [ -d "$von" ] && [ -d "$nach" ] && [ ! -L "$nach" ]; then
    zusammenfuehren "$von" "$nach"
  elif ersetzt "$von" "$nach"; then
    mv -fT -- "$von" "$nach"
  elif [ -e "$nach" ] || [ -L "$nach" ]; then
    rm -rf -- "$von"
  else
    mv -T -- "$von" "$nach"
  fi
}
# Datenordner $1 einrichten bzw. richten, bei jeder Installation; zweimal hintereinander ändert der zweite Lauf nichts. Vor einem
# Umzug hält sie alle Dienste an, die im Datenordner schreiben (ein laufender Lauf legt Rohdaten und Unterlagen dabei zurück,
# lauf.mjs), damit keiner währenddessen schreibt und root keinem Link folgt, den einer gerade legt; der Installer startet sie am
# Ende wieder (nicht die Aktualisierung: Sie ist es, die diesen Installer startet). Nach dem Umzug: Besitzer und Rechte im
# Umgezogenen; im Datenordner selbst liest der Web-Dienst nur zustand.json und aktualisierung.json, alles andere nur studium.
# Fertig ist der Umzug erst mit der Marke UMZUG_MARKE (zuletzt angelegt): Brach er ab (Neustart, Speicher), richtet die nächste
# Installation Besitzer und Rechte noch einmal, auch wenn die alten Namen schon weg sind. Auf einem neuen Server richtet sie so die
# leeren Ordner.
UMZUG_ANHALTEN=(studium-server-dienst.service studium-server-abruf.timer studium-server-abruf.service studium-server-lauf.path
  studium-server-lauf.service studium-server-gmail.timer studium-server-gmail.service studium-server-zustand.timer
  studium-server-zustand.service studium-server-speicher.service)
UMZUG_MARKE=.umzug-fertig
ordnung() {
  local d=$1 n umzug=0
  if [ ! -f "$d/$UMZUG_MARKE" ] || [ -L "$d/$UMZUG_MARKE" ]; then umzug=1; fi
  for n in "${ALT_WEB[@]}" "${ALT_ABRUF[@]}"; do
    if [ -e "$d/$n" ] || [ -L "$d/$n" ]; then umzug=1; fi
  done
  if [ "$umzug" -eq 1 ]; then
    echo "Datenordner: Web-Dienst und Abruf in eigene Ordner, Besitzer und Rechte richten (dafür halten die Dienste kurz an)"
    for n in "${UMZUG_ANHALTEN[@]}"; do systemctl stop "$n" 2>/dev/null || true; done
  fi
  ordner "$d" studium:studium-web 2711
  ordner "$d/laeufe" studium:studium 0700
  ordner "$d/eingang" studium:studium-web 2770
  ordner "$d/unterlagen" studium:studium-web 2750
  for n in neu opus kapitel; do ordner "$d/unterlagen/$n" studium:studium-web 2770; done
  ordner "$d/web" studium-web:studium-web 2771
  ordner "$d/abruf" studium-abruf:studium 2770
  [ "$umzug" -eq 1 ] || return 0
  for n in "${ALT_WEB[@]}"; do umziehen "$d" "$n" web; done
  for n in "${ALT_ABRUF[@]}"; do umziehen "$d" "$n" abruf; done
  find -P "$d/web" "$d/abruf" "$d/eingang" "$d/unterlagen" -mindepth 1 ! -type f ! -type d -delete
  # 00700: mit der zusätzlichen Null nimmt chmod(1) auch ein setgid-Bit eines Ordners weg
  find -P "$d/web" -mindepth 1 -exec chown -h studium-web:studium-web {} +
  find -P "$d/web" -mindepth 1 -type d -exec chmod 00700 {} +
  find -P "$d/web" -mindepth 1 -type f -exec chmod 0600 {} +
  find -P "$d/web" -maxdepth 1 -type f \( -name takt.json -o -name knopf.json \) -exec chmod 0644 {} +
  find -P "$d/web" -maxdepth 1 -type f \( -name stand-plugin.json -o -name abruf.json \) -exec chmod 0640 {} +
  find -P "$d/abruf" -mindepth 1 -exec chown -h studium-abruf:studium {} +
  find -P "$d/abruf" -mindepth 1 -type d -exec chmod 2770 {} +
  find -P "$d/abruf" -mindepth 1 -type f -exec chmod 0660 {} +
  find -P "$d/eingang" -mindepth 1 -maxdepth 1 -type f -exec chown -h studium:studium-web {} + -exec chmod 0640 {} +
  find -P "$d/unterlagen" -mindepth 2 -maxdepth 2 -type f -exec chown -h studium-web:studium-web {} + -exec chmod 0640 {} +
  find -P "$d" -mindepth 1 -maxdepth 1 ! -type f ! -type d -delete
  find -P "$d" -maxdepth 1 -type f \( -name zustand.json -o -name aktualisierung.json \) \
    -exec chown -h studium:studium-web {} + -exec chmod 0640 {} +
  find -P "$d" -maxdepth 1 -type f ! -name zustand.json ! -name aktualisierung.json -exec chown -h studium:studium {} + -exec chmod 0600 {} +
  # als studium wie alles im Datenordner: root folgte sonst einem Link, den studium an die Stelle legt
  rm -f -- "$d/$UMZUG_MARKE"
  sudo -u studium sh -c 'umask 077 && : >>"$1"' - "$d/$UMZUG_MARKE"
}

[ "$(id -u)" -eq 0 ] || fehler "bitte mit sudo starten"
# Nie zwei Läufe zugleich (der erste Start bereitet vor, während die Einrichtung schon installiert): der zweite wartet
exec 9>/run/studium-server-installieren.lock
flock 9
# shellcheck disable=SC1091
. /etc/os-release
[ "${ID:-}" = ubuntu ] && [ "${VERSION_ID:-}" = 24.04 ] || fehler "nur für Ubuntu 24.04 (gefunden: ${PRETTY_NAME:-unbekannt})"
if [ "$TEST" -eq 1 ]; then
  ADRESSE="http://127.0.0.1:8080"
elif [ "$VORBEREITEN" -eq 1 ]; then
  # Ohne IP aus dem Konto keine neue Adresse; eine schon gesetzte (Lauf mit --ip vorher) bleibt mit ihrer IP
  [ -z "$IP" ] || fehler "--vorbereiten ohne --ip"
  IP=$(jq -r '.ip // empty' /etc/studium-server/dienst.json 2>/dev/null || true)
  ADRESSE=$(jq -r '.adresse // empty' /etc/studium-server/dienst.json 2>/dev/null || true)
else
  [[ "$IP" =~ ^([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})$ ]] || fehler "--ip <öffentliche IP> fehlt oder ist ungültig"
  ADRESSE="https://${IP//./-}.sslip.io"
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
for p in jq qrencode curl ca-certificates gnupg python3 poppler-utils iptables iptables-persistent unattended-upgrades; do
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

# Ubuntu 24.04 bringt Node.js 18 aus universe, ohne Sicherheitsupdates seit April 2025. NodeSource baut die LTS-Linien für
# Ubuntu in einem signierten Paketarchiv; der Schlüssel muss genau dieser eine sein (Fingerabdruck), sonst ändert der Schritt
# nichts. Ein Pin hält nodejs bei NodeSource, unattended-upgrades holt Updates der Linie (Schritt „Sicherheitsupdates“). Server
# mit Node.js 18 kommen hier beim nächsten Update herüber. Node.js 24 wird bis April 2028 gepflegt; danach NODE_MAJOR erhöhen.
NODE_MAJOR=24
schritt "Node.js $NODE_MAJOR (Paketarchiv von NodeSource)"
NODE_SCHLUESSEL=6F71F525282841EEDAF851B42F59B5F99B1BE0B4
NODE_KEYRING=/usr/share/keyrings/nodesource.gpg
NODE_LISTE=/etc/apt/sources.list.d/nodesource.list
NODE_ZEILE="deb [signed-by=$NODE_KEYRING] https://deb.nodesource.com/node_$NODE_MAJOR.x nodistro main"
if [ "$(cat "$NODE_LISTE" 2>/dev/null)" != "$NODE_ZEILE" ] || [ ! -s "$NODE_KEYRING" ]; then
  tmp=$(mktemp -d)
  curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key -o "$tmp/schluessel.asc"
  schluessel=$(gpg --homedir "$tmp" --show-keys --with-colons "$tmp/schluessel.asc" 2>/dev/null | awk -F: '$1 == "pub" { n++ } $1 == "fpr" && !f { f = $10 } END { if (n == 1) print f }')
  if [ "$schluessel" != "$NODE_SCHLUESSEL" ]; then rm -rf "$tmp"; fehler "unerwarteter Schlüssel von NodeSource (${schluessel:-mehrere oder keiner}); nichts geändert"; fi
  gpg --dearmor --yes -o "$NODE_KEYRING" "$tmp/schluessel.asc"
  rm -rf "$tmp"
  chmod 0644 "$NODE_KEYRING"
  echo "$NODE_ZEILE" >"$NODE_LISTE"
fi
cat >/etc/apt/preferences.d/studium-server-nodejs <<'PIN'
# studium-server (installieren.sh): nodejs nur von NodeSource, nie zurück auf Node.js 18 von Ubuntu
Package: nodejs
Pin: origin deb.nodesource.com
Pin-Priority: 600
PIN
if [ "$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || true)" != "$NODE_MAJOR" ]; then
  apt-get update -q
  apt-get install -y -q --no-install-recommends nodejs
  [ "$(node -p 'process.versions.node.split(".")[0]')" = "$NODE_MAJOR" ] || fehler "Node.js $NODE_MAJOR ließ sich nicht installieren"
  echo "installiert: Node.js $(node --version)"
else
  echo "schon da ($(node --version))"
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
# studium: Claude-Lauf, Zustand, Speicherreserve, Gmail-Anstoß; Claude Code und seine Anmeldung liegen in seinem Home (nur er)
id studium >/dev/null 2>&1 || useradd --system --create-home --home-dir /var/lib/studium --shell /bin/bash studium
chmod 0700 /var/lib/studium
# Eigener Benutzer für den Abruf mit Uni-Zugang: Das entschlüsselte Passwort (/run/credentials/…) liest nur er. Gruppe studium,
# damit der Lauf die Rohdaten übernehmen kann.
id studium-abruf >/dev/null 2>&1 || useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin --gid studium studium-abruf
# Eigener Benutzer für den Web-Dienst (bis 0.7.6 lief er als studium): Er nimmt Anfragen aus dem Internet an. Als anderer
# Benutzer kann er weder die Claude-Anmeldung, die Lauf-Ordner oder die Mails lesen noch die Prozesse von studium beenden oder über
# /proc in sie hineinsehen (kill und /proc/<PID>/root, cwd, environ verlangen denselben Benutzer).
getent group studium-web >/dev/null || groupadd --system studium-web
id studium-web >/dev/null 2>&1 || useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin --gid studium-web studium-web
install -d -m 0750 -o root -g studium-web /etc/studium-server
ordnung /var/lib/studium-server
install -d -m 0755 /etc/credstore.encrypted
install -d -m 0755 "$ZIEL"
# Marke einer fertigen Installation (unten nach „Prüfen“); bis dahin gilt dieses Paket als nicht fertig installiert
rm -f "$ZIEL/.installiert"
# allowed_signers: Mit diesen Schlüsseln prüft „studium-server aktualisieren“ die Signatur des nächsten Pakets
for datei in VERSION README.md kanal.mjs dateien.mjs dienst.mjs verbinden.mjs zustand.mjs speicher-reserve.mjs eingang.mjs lauf.mjs abrufen.py livesync.mjs livesync.sh studium-server installieren.sh allowed_signers; do
  install -m 0644 "$QUELLE/$datei" "$ZIEL/$datei"
done
rm -rf "$ZIEL/skill"
cp -r "$QUELLE/skill" "$ZIEL/skill"
chmod -R a+rX "$ZIEL/skill"
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
chown root:studium-web "$KONFIG"
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
# Schutz der Dienste (systemd-analyze security): Jeder Dienst bekommt den Satz unten, der zu ihm passt. Gemeinsam: keine neuen
# Rechte und keine Capabilities, System schreibgeschützt, eigene /tmp und /dev, Kernel, Uhr, Hostname und Cgroups unberührt,
# Systemaufrufe nur aus @system-service ohne @privileged (ein gesperrter Aufruf scheitert mit EPERM, statt den Dienst zu beenden),
# UMask 0077, wo niemand sonst die Dateien liest. Nicht MemoryDenyWriteExecute für Node.js und Claude Code (JIT). Wer welchen Ordner
# beschreibt: ordnung oben.
# Der Web-Dienst nimmt Anfragen aus dem Internet an. Damit ein Fehler darin nicht bis zu Claude reicht, läuft er als eigener Benutzer
# studium-web: Das Home von studium (/var/lib/studium: Claude-Anmeldung in .claude/ und .claude.json, Claude Code selbst), die
# Lauf-Ordner (Mails, Rechte des Laufs), roh/ und alles, was der Lauf nur für sich schreibt (0600), kann er nicht lesen, und die
# Prozesse von studium kann er weder beenden noch über /proc ansehen. Zusätzlich sperrt systemd ihm diese Ordner, den Uni-Zugang,
# LiveSync und CouchDB, Caddys Schlüssel und Admin-Socket, und er darf nur mit 127.0.0.1 sprechen (Caddy; dessen Admin-Schnittstelle
# hört nicht dort, siehe „Caddy (HTTPS)“). Schreiben darf er nur in web/, eingang/ und unterlagen/.
einheit studium-server-dienst.service <<'UNIT'
[Unit]
Description=Studium Autopilot: Web-Dienst des eigenen Servers (nur 127.0.0.1)
After=network-online.target
Wants=network-online.target

[Service]
User=studium-web
Group=studium-web
# Was er schreibt, liest der Lauf über die Gruppe (0640); takt.json und knopf.json für den Abruf schreibt er ausdrücklich mit 0644
UMask=0027
Environment=STUDIUM_SERVER_KONFIG=/etc/studium-server/dienst.json STUDIUM_SERVER_DATEN=/var/lib/studium-server
ExecStart=/usr/bin/node /opt/studium-server/aktuell/dienst.mjs
Restart=on-failure
RestartSec=5
NoNewPrivileges=yes
CapabilityBoundingSet=
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectKernelLogs=yes
ProtectControlGroups=yes
ProtectClock=yes
ProtectHostname=yes
ProtectProc=invisible
ProcSubset=pid
RestrictNamespaces=yes
RestrictRealtime=yes
RestrictSUIDSGID=yes
LockPersonality=yes
SystemCallArchitectures=native
SystemCallFilter=@system-service
SystemCallFilter=~@privileged
SystemCallErrorNumber=EPERM
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
IPAddressDeny=any
IPAddressAllow=localhost
ReadWritePaths=/var/lib/studium-server/web /var/lib/studium-server/eingang /var/lib/studium-server/unterlagen
InaccessiblePaths=-/var/lib/studium -/var/lib/studium-server/laeufe -/var/lib/studium-server/abruf /etc/credstore.encrypted -/run/credentials -/etc/studium-server/livesync.json
InaccessiblePaths=-/var/lib/caddy -/run/caddy -/opt/couchdb/etc -/var/lib/couchdb

[Install]
WantedBy=multi-user.target
UNIT
einheit studium-server-speicher.service <<'UNIT'
[Unit]
Description=Studium Autopilot: Speicherreserve gegen Anhalten bei Leerlauf

[Service]
User=studium
Group=studium
UMask=0077
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
CapabilityBoundingSet=
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectKernelLogs=yes
ProtectControlGroups=yes
ProtectClock=yes
ProtectHostname=yes
ProtectProc=invisible
RestrictNamespaces=yes
RestrictRealtime=yes
RestrictSUIDSGID=yes
LockPersonality=yes
SystemCallArchitectures=native
SystemCallFilter=@system-service
SystemCallFilter=~@privileged
SystemCallErrorNumber=EPERM
RestrictAddressFamilies=AF_UNIX
IPAddressDeny=any
ReadWritePaths=/var/lib/studium-server
InaccessiblePaths=-/var/lib/studium /etc/studium-server /etc/credstore.encrypted -/run/credentials

[Install]
WantedBy=multi-user.target
UNIT
# Prüft Claude (claude auth status, kann die Anmeldung erneuern: ~/.claude beschreibbar) und ob der Uni-Zugang da ist (darum
# bleibt /etc/credstore.encrypted sichtbar; die Datei darin liest nur root). Claude Code ohne Nutzungs- und Fehlerberichte (setzt
# auch zustand.mjs selbst, für die Aufrufe von studium-server)
einheit studium-server-zustand.service <<'UNIT'
[Unit]
Description=Studium Autopilot: Zustand für den Status prüfen

[Service]
Type=oneshot
User=studium
Group=studium
UMask=0077
Environment=STUDIUM_SERVER_DATEN=/var/lib/studium-server DISABLE_TELEMETRY=1 DISABLE_ERROR_REPORTING=1
ExecStart=/usr/bin/node /opt/studium-server/aktuell/zustand.mjs
NoNewPrivileges=yes
CapabilityBoundingSet=
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectKernelLogs=yes
ProtectControlGroups=yes
ProtectClock=yes
ProtectHostname=yes
ProtectProc=invisible
ProcSubset=pid
RestrictNamespaces=yes
RestrictRealtime=yes
RestrictSUIDSGID=yes
LockPersonality=yes
SystemCallArchitectures=native
SystemCallFilter=@system-service
SystemCallFilter=~@privileged
SystemCallErrorNumber=EPERM
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6 AF_NETLINK
ReadWritePaths=/var/lib/studium-server /var/lib/studium
InaccessiblePaths=/etc/studium-server -/run/credentials -/var/lib/studium-server/web -/var/lib/studium-server/unterlagen -/var/lib/studium-server/eingang
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
# Läuft als root und muss alles dürfen, was installieren.sh tut (Pakete, Benutzer, Einheiten, /opt, /etc): kein Sandkasten
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
# Er liest fremde Mails mit dem Uni-Zugang: Er sieht weder die Claude-Anmeldung noch die Schlüssel des Dienstes noch, was er
# nicht braucht (Lauf-Ordner, Eingang, Unterlagen, Einmal-Codes), und schreibt nur in abruf/; aus web/ liest er takt.json und
# knopf.json. Python ohne JIT: auch kein beschreibbarer Code im Speicher.
einheit studium-server-abruf.service <<'UNIT'
[Unit]
Description=Studium Autopilot: Uni-Postfach ohne KI lesen (nur mit gespeichertem Uni-Zugang)
After=network-online.target
Wants=network-online.target
ConditionPathExists=/etc/credstore.encrypted/uni-zugang
ConditionPathExists=!/var/lib/studium-server/abruf/uni-zugang-falsch

[Service]
Type=oneshot
User=studium-abruf
Group=studium
UMask=0007
Environment=STUDIUM_SERVER_DATEN=/var/lib/studium-server
LoadCredentialEncrypted=uni-zugang:/etc/credstore.encrypted/uni-zugang
ExecStart=/usr/bin/python3 /opt/studium-server/aktuell/abrufen.py
NoNewPrivileges=yes
CapabilityBoundingSet=
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectKernelLogs=yes
ProtectControlGroups=yes
ProtectClock=yes
ProtectHostname=yes
ProtectProc=invisible
ProcSubset=pid
RestrictNamespaces=yes
RestrictRealtime=yes
RestrictSUIDSGID=yes
LockPersonality=yes
MemoryDenyWriteExecute=yes
SystemCallArchitectures=native
SystemCallFilter=@system-service
SystemCallFilter=~@privileged
SystemCallErrorNumber=EPERM
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6 AF_NETLINK
ReadWritePaths=/var/lib/studium-server/abruf
InaccessiblePaths=-/var/lib/studium /etc/studium-server -/var/lib/studium-server/laeufe -/var/lib/studium-server/eingang -/var/lib/studium-server/unterlagen -/var/lib/studium-server/web/verbinden -/var/lib/studium-server/web/livesync-links
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
# Ein Anstoß je Schreiber, jeder in seinem Ordner: Lauf, Gmail-Zeit und studium-server jetzt (anstoss), Web-Dienst (web/anstoss),
# Abruf (abruf/anstoss). lauf.mjs nimmt alle, die da sind (anstossNehmen). Mehrere PathExists= beobachten mehrere Pfade
# (systemd.path); liegt nach dem Lauf noch einer da, startet er gleich wieder.
einheit studium-server-lauf.path <<'UNIT'
[Unit]
Description=Studium Autopilot: Claude-Lauf, sobald ein Anstoß da ist

[Path]
PathExists=/var/lib/studium-server/anstoss
PathExists=/var/lib/studium-server/web/anstoss
PathExists=/var/lib/studium-server/abruf/anstoss
Unit=studium-server-lauf.service

[Install]
WantedBy=paths.target
UNIT
# Der Claude-Lauf bekommt nie den Uni-Zugang und sieht weder die Schlüssel noch die Credentials. Zeitgrenze: ein Lauf mit Opus
# und der gewöhnliche danach, je bis 45 Minuten (lauf.mjs), dazu Luft; bricht systemd trotzdem ab (oder ein Neustart), legt
# lauf.mjs Rohdaten und Unterlagen zurück. Claude Code braucht Netz, sein Programm und ein beschreibbares ~/.claude (beides in
# /var/lib/studium); /etc/studium-server ist ganz gesperrt (lauf.env liest systemd vor dem Start). Nur der Lauf bekommt die Gruppe
# studium-web: Er liest, was der Web-Dienst ihm hinlegt (Stand, Unterlagen), und nimmt dessen Anstoß und Unterlagen an sich.
einheit studium-server-lauf.service <<'UNIT'
[Unit]
Description=Studium Autopilot: Claude-Lauf mit dem Skill (ohne Zugangsdaten)
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=studium
Group=studium
SupplementaryGroups=studium-web
UMask=0077
Environment=STUDIUM_SERVER_DATEN=/var/lib/studium-server HOME=/var/lib/studium
EnvironmentFile=-/etc/studium-server/lauf.env
ExecStart=/usr/bin/node /opt/studium-server/aktuell/lauf.mjs
TimeoutStartSec=100min
NoNewPrivileges=yes
CapabilityBoundingSet=
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectKernelLogs=yes
ProtectControlGroups=yes
ProtectClock=yes
ProtectHostname=yes
ProtectProc=invisible
ProcSubset=pid
RestrictNamespaces=yes
RestrictRealtime=yes
RestrictSUIDSGID=yes
LockPersonality=yes
SystemCallArchitectures=native
SystemCallFilter=@system-service
SystemCallFilter=~@privileged
SystemCallErrorNumber=EPERM
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6 AF_NETLINK
ReadWritePaths=/var/lib/studium-server /var/lib/studium
InaccessiblePaths=/etc/studium-server /etc/credstore.encrypted -/run/credentials
UNIT
einheit studium-server-gmail.service <<'UNIT'
[Unit]
Description=Studium Autopilot: Anstoß für die Gmail-Suche

[Service]
Type=oneshot
User=studium
Group=studium
UMask=0077
Environment=STUDIUM_SERVER_DATEN=/var/lib/studium-server
ExecStart=/usr/bin/node /opt/studium-server/aktuell/lauf.mjs --anstoss gmail
NoNewPrivileges=yes
CapabilityBoundingSet=
ProtectSystem=strict
ProtectHome=yes
PrivateTmp=yes
PrivateDevices=yes
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectKernelLogs=yes
ProtectControlGroups=yes
ProtectClock=yes
ProtectHostname=yes
ProtectProc=invisible
ProcSubset=pid
RestrictNamespaces=yes
RestrictRealtime=yes
RestrictSUIDSGID=yes
LockPersonality=yes
SystemCallArchitectures=native
SystemCallFilter=@system-service
SystemCallFilter=~@privileged
SystemCallErrorNumber=EPERM
RestrictAddressFamilies=AF_UNIX
IPAddressDeny=any
ReadWritePaths=/var/lib/studium-server
InaccessiblePaths=-/var/lib/studium -/var/lib/studium-server/laeufe -/var/lib/studium-server/abruf -/var/lib/studium-server/unterlagen -/var/lib/studium-server/eingang /etc/studium-server /etc/credstore.encrypted -/run/credentials
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
if [ -z "$SEITE" ]; then
  # Vorbereitet ohne Adresse: nichts auf 80 oder 443 (Caddys Standardseite eingeschlossen), bis der Lauf mit --ip kommt
  systemctl disable -q --now caddy 2>/dev/null || true
  echo "noch keine Adresse: Caddy aus, bis die Einrichtung sie setzt"
else
# Caddys Admin-Schnittstelle nur über einen Socket, an den nur Caddy kommt: Ohne das hört sie ohne Anmeldung auf localhost:2019,
# und der Web-Dienst (darf mit 127.0.0.1 sprechen) könnte Caddy umbauen: Daten nach außen leiten, die Anmeldung von LiveSync
# abgreifen, Caddys Schlüssel lesen. /run/caddy legt systemd bei jedem Start leer an (0700, Benutzer caddy); systemctl reload caddy
# läuft auch als caddy.
install -d -m 0755 /etc/systemd/system/caddy.service.d
cat >/etc/systemd/system/caddy.service.d/studium-server.conf <<'UNIT'
# studium-server (installieren.sh): Ordner für Caddys Admin-Socket (admin in /etc/caddy/Caddyfile)
[Service]
RuntimeDirectory=caddy
RuntimeDirectoryMode=0700
UNIT
systemctl daemon-reload
cat >"$CADDYFILE" <<CADDY
# studium-server (installieren.sh): wird bei jeder Installation neu geschrieben
{
	admin unix//run/caddy/admin.sock
}

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
# Neu laden geht nur, wenn das laufende Caddy schon auf dem Socket hört; sonst (bis 0.7.6: localhost:2019) neu starten
if systemctl is-active --quiet caddy && [ -S /run/caddy/admin.sock ]; then systemctl reload caddy; else systemctl restart caddy; fi
# Mit LiveSync: dessen Adresse und Caddy-Teil auf die IP von eben (nach einem Wechsel zeigten sie sonst auf die alte)
[ ! -f /etc/caddy/studium-server.d/livesync.caddy ] || bash "$ZIEL/livesync.sh" adresse
fi

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
# Ubuntu-Archive allein reichen nicht: Caddy (aus dem Internet erreichbar), CouchDB (mit LiveSync ebenso) und Node.js kommen aus
# eigenen Archiven. Die Werte stehen in deren Release-Dateien (apt-cache policy, geprüft 01.11.2026); „site“ hält jedes Muster
# bei seinem Archiv, denn Origin „Artifactory“ tragen alle Archive bei JFrog.
cat >/etc/apt/apt.conf.d/52studium-server-quellen <<'APT'
// studium-server (installieren.sh): auch Caddy, CouchDB und Node.js automatisch aktualisieren
Unattended-Upgrade::Origins-Pattern {
	"site=dl.cloudsmith.io,origin=cloudsmith/caddy/stable";
	"site=apache.jfrog.io,origin=Artifactory,codename=noble";
	"site=deb.nodesource.com,codename=nodistro";
};
APT
echo "automatisch (Ubuntu, Caddy, CouchDB, Node.js), bei Bedarf Neustart um 03:30 Uhr (UTC)"

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
# Erst jetzt ist dieses Paket fertig installiert. Fehlt die Marke (ein Schritt oben scheiterte), installiert „studium-server
# aktualisieren“ dieselbe Version beim nächsten Mal noch einmal, statt „Schon aktuell“ zu melden.
: >"$ZIEL/.installiert"

schritt "Alte Pakete"
# Es bleiben dieses und das bisher laufende (zum Zurückgehen von Hand); alle anderen fallen weg
alte=$(find /opt/studium-server -mindepth 1 -maxdepth 1 -type d ! -path "$ZIEL" ! -path "${VORHER:-$ZIEL}")
if [ -n "$alte" ]; then
  while IFS= read -r d; do rm -rf "$d"; echo "entfernt: ${d##*/}"; done <<<"$alte"
else
  echo "nichts zu tun"
fi

if [ -z "$ADRESSE" ]; then
  echo
  echo "Vorbereitet (ohne Adresse). Den Rest erledigt die Einrichtung in der Cloud Shell: bash ~/studium-autopilot/start.sh"
  exit 0
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
