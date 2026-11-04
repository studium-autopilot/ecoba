#!/usr/bin/env bash
# Installiert oder aktualisiert den eigenen Server von Studium Autopilot (server/README.md) auf Ubuntu 24.04.
# Wiederholbar: Jeder Schritt prüft zuerst, ob er schon erledigt ist; Schlüssel und Uni-Zugang bleiben erhalten (die Schlüssel
# nicht, wenn sich die Adresse ändert: „Schlüssel und Konfiguration“).
#   sudo bash installieren.sh --ip <öffentliche IP>   Adresse wird https://<IP mit Bindestrichen>.sslip.io (Let's Encrypt)
#   sudo bash installieren.sh --test                  ohne HTTPS und ohne Claude Code (Caddy auf :8080, nur für Tests)
#   sudo bash installieren.sh --vorbereiten           alles außer Adresse und HTTPS (erster Start, einrichten.mjs serverStart);
#                                                     eine schon gesetzte Adresse bleibt. Den Rest macht ein Lauf mit --ip.
#   --reserve-mb <n>                                  feste Speicherreserve statt 25 % (speicher-reserve.mjs)
# Exit: 0 fertig, 1 Fehler, 2 falsche Angabe, 10 gescheitert und auf das bisherige Paket zurückgerollt, 11 gescheitert, aber
# Zurückrollen verweigert (das bisherige Paket liegt unter der Mindestversion; der Server bleibt auf diesem): „Zurückrollen“ unten.
set -euo pipefail

QUELLE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
# Dieselben Angaben bekommt beim Zurückrollen der Installer des bisherigen Pakets (zurueckrollen unten)
ANGABEN=("$@")
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
#   studium-zentral (zentrale Daten)  zentral/ (zentral.mjs: öffentliche Daten für den Connector, 0644)
#   Connector (Claude-App)            claude-app/ gehört root (nur root legt dort Ordner an); darin schreibt der Web-Dienst schalter/
#                                     (nur er), codes/, trennen/ und daten/ (Gruppe studium-mcp: der Connector liest sie), der Connector
#                                     (studium-mcp) nur aus-mcp/ (Gruppe studium-web: der Web-Dienst liest es); claude-app.mjs
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
  ordner "$d/zentral" studium-zentral:studium-zentral 0755
  ordner "$d/claude-app" root:root 0755
  ordner "$d/claude-app/schalter" studium-web:studium-web 0700
  for n in codes trennen daten; do ordner "$d/claude-app/$n" studium-web:studium-mcp 2750; done
  ordner "$d/claude-app/aus-mcp" studium-mcp:studium-web 2750
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
# Abbruch von außen (systemd am Ende von TimeoutStartSec, Strg+C) zählt als Fehler: Ohne diese Fallen liefe die Falle EXIT mit dem
# Exit des letzten Befehls (oft 0), es gäbe kein Zurückrollen, und der Lauf zählte als gelungen.
trap 'exit 143' TERM
trap 'exit 130' INT
# Zurückrollen (server/README.md, „Updates des Server-Pakets“): Scheitert die Installation, nachdem aktuell schon auf dieses Paket zeigt (etwa
# antwortet der neue Web-Dienst bei „Prüfen“ nicht, oder ein Schritt davor bricht ab), geht der Server auf das bisher laufende Paket
# zurück: aktuell wieder dorthin, dann dessen Installer mit denselben Angaben. Der schreibt Einheiten, Caddy und
# /usr/local/bin/studium-server wieder auf seinen Stand, startet die Dienste neu und prüft sie; „Alte Pakete“ räumt dabei dieses
# Paket weg. Er nimmt dieselbe Sperre, darum gibt dieser Lauf sie vorher frei. Exit 10 heißt „zurückgerollt“ (studium-server
# aktualisieren versucht dieselbe Version dann höchstens einmal am Tag); scheitert auch der bisherige Installer, Exit 1. Nur, wenn
# das bisherige Paket fertig installiert war (.installiert); ein Paket, das schon auf sich selbst zurückrollen würde, tut nichts.
# Nie unter die Mindestversion (MINDEST, unten): Dann bleibt der Server auf diesem Paket, Exit 11.
# ZURUECK_OFFEN (nur root) nennt Ziel und gescheiterte Version, solange ein Zurückrollen aussteht: vom Umschalten bis .installiert
# bzw. bis der bisherige Installer fertig ist. Bricht der Lauf ab (Zeitgrenze, Strg+C: dann stellt zurueckrollen nur aktuell zurück;
# Neustart), holt der nächste „studium-server aktualisieren“ das Zurückrollen vor allem anderen nach.
ZURUECK_NACH=""
ZURUECK_OFFEN=/opt/studium-server/.zurueckrollen-offen
MINDEST=/etc/studium-server/mindestversion
zurueckrollen() {
  local code=$1 bisher c=0
  trap - EXIT
  if [ "$code" -eq 0 ] || [ -z "$ZURUECK_NACH" ]; then exit "$code"; fi
  set +e
  trap - TERM INT
  bisher=$(tr -d '[:space:]' <"$ZURUECK_NACH/VERSION" 2>/dev/null)
  if unter_mindestversion "$bisher"; then
    rm -f "$ZURUECK_OFFEN"
    echo "Installation von $VERSION gescheitert (Exit $code). Zurück auf ${bisher:-?} geht nicht: Mindestversion $(cat "$MINDEST")." \
      "Der Server bleibt auf $VERSION; der nächste Lauf installiert es noch einmal." >&2
    exit 11
  fi
  if [ "$code" -eq 143 ] || [ "$code" -eq 130 ]; then
    # Von außen abgebrochen (Zeitgrenze, Strg+C): Für den bisherigen Installer bliebe keine Zeit, systemd beendet den Lauf gleich
    # ganz. Nur aktuell und /usr/local/bin/studium-server zurückstellen (das holt das Zurückrollen nach, also soll es das des
    # bisherigen Pakets sein); die Marke bleibt, und der nächste „studium-server aktualisieren“ führt den Installer aus, der auch die
    # Einheiten wieder auf den Stand des bisherigen Pakets schreibt.
    ln -sfn "$ZURUECK_NACH" /opt/studium-server/aktuell
    install -m 0755 "$ZURUECK_NACH/studium-server" /usr/local/bin/studium-server
    echo "Installation von $VERSION abgebrochen (Exit $code): aktuell zeigt wieder auf ${ZURUECK_NACH##*/}; der nächste Lauf rollt" \
      "zu Ende zurück." >&2
    exit "$code"
  fi
  echo "Installation von $VERSION gescheitert (Exit $code): zurück auf ${ZURUECK_NACH##*/}" >&2
  ln -sfn "$ZURUECK_NACH" /opt/studium-server/aktuell
  flock -u 9
  bash "$ZURUECK_NACH/installieren.sh" "${ANGABEN[@]}" || c=$?
  if [ "$c" -eq 0 ]; then
    rm -f "$ZURUECK_OFFEN"
    echo "Zurückgerollt: Es läuft wieder ${ZURUECK_NACH##*/}." >&2
    exit 10
  fi
  # Von außen abgebrochen (Signal): die Marke bleibt, der nächste Lauf versucht es noch einmal
  [ "$c" -ge 128 ] || rm -f "$ZURUECK_OFFEN"
  echo "Auch ${ZURUECK_NACH##*/} ließ sich nicht wieder installieren (journalctl -u studium-server-aktualisieren)." >&2
  exit 1
}
# Liegt Version $1 unter der Mindestversion, die root festhält? (Gleiche Fassung in studium-server.)
unter_mindestversion() {
  local m
  m=$(tr -d '[:space:]' <"$MINDEST" 2>/dev/null || true)
  [ -n "$m" ] && [ -n "$1" ] && version_neuer "$m" "$1"
}
# Mindestversion (docs/release.md, „Mindestversion“): Ein Paket kann in MINDESTVERSION (im signierten Paket) nennen, auf welche
# Version höchstens zurückgerollt werden darf, etwa weil ältere eine Lücke haben oder eine Sperre nicht kennen. root behält die
# höchste je genannte; sie sinkt nie. Erste Zeile ohne # zählt.
mindestversion_merken() {
  local m bisher
  m=$(grep -v -m 1 -e '^#' -e '^[[:space:]]*$' "$QUELLE/MINDESTVERSION" 2>/dev/null | tr -d '[:space:]' || true)
  [[ "$m" =~ ^[0-9A-Za-z.+-]{1,40}$ ]] || return 0
  bisher=$(tr -d '[:space:]' <"$MINDEST" 2>/dev/null || true)
  [ -z "$bisher" ] || version_neuer "$m" "$bisher" || return 0
  echo "$m" >"$MINDEST.neu"
  chmod 0644 "$MINDEST.neu"
  mv -f "$MINDEST.neu" "$MINDEST"
  echo "Mindestversion: $m"
}
# Gesperrte Schlüssel (docs/release.md, „Schlüssel sperren“): Die Liste SPERRLISTE gehört root und wächst nur. Jede Installation
# ergänzt sie um revoked_keys ihres Pakets, und „studium-server aktualisieren“ prüft jedes neue Paket gegen sie. So nimmt kein
# Zurückrollen und kein älteres Paket eine Sperre zurück. (Gleiche Fassung in studium-server.)
SPERRLISTE=/etc/studium-server/revoked_keys
sperrliste_ergaenzen() {
  local z d form='^(ssh-[a-z0-9-]+|ecdsa-sha2-nistp[0-9]+|sk-[a-z0-9@.-]+) [A-Za-z0-9+/]+=*( |$)'
  [ -f "$1" ] || return 0
  d=$(mktemp -d)
  # Nur Zeilen, die mit dem Typ eines Schlüssels beginnen und die ssh-keygen als öffentlichen Schlüssel liest: Eine kaputte Zeile
  # ließe sonst jede Prüfung scheitern (ssh-keygen -Y verify -r bricht mit 255 ab), und kein Update käme mehr durch. Das gilt auch für
  # Optionen wie in authorized_keys davor („restrict“, „cert-authority“, from="…"), die ssh-keygen -l durchlässt. Auch schon gemerkte
  # Zeilen werden so jedes Mal neu geprüft.
  {
    echo "# studium-server: gesperrte Schlüssel aus jedem installierten Paket; wird nur ergänzt, nie gekürzt"
    { grep -v '^#' "$SPERRLISTE" 2>/dev/null || true; grep -v '^#' "$1" || true; } | sed 's/[[:space:]]*$//' | { grep -v '^$' || true; } | sort -u \
      | while IFS= read -r z; do
        printf '%s\n' "$z" >"$d/schluessel"
        if [[ "$z" =~ $form ]] && ssh-keygen -l -f "$d/schluessel" >/dev/null 2>&1; then
          printf '%s\n' "$z"
        else
          echo "Gesperrte Schlüssel: Zeile ohne lesbaren Schlüssel übergangen (${z:0:30}…)" >&2
        fi
      done
  } >"$SPERRLISTE.neu"
  rm -rf "$d"
  chmod 0644 "$SPERRLISTE.neu"
  mv -f "$SPERRLISTE.neu" "$SPERRLISTE"
}

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
# Sperren und Mindestversion vor allem anderen: Auch eine Installation, die danach scheitert oder zurückrollt, nimmt sie nie zurück.
# (Die Gruppe studium-web gibt es auf einem neuen Server erst unten; „Benutzer und Ordner“ setzt sie.)
[ -d /etc/studium-server ] || install -d -m 0750 /etc/studium-server
sperrliste_ergaenzen "$QUELLE/revoked_keys"
mindestversion_merken
export DEBIAN_FRONTEND=noninteractive
# apt wartet höchstens 5 Minuten auf die Sperre (etwa während unattended-upgrades läuft), statt sofort zu scheitern
APT=(apt-get -o DPkg::Lock::Timeout=300)

schritt "Pakete"
fehlend=()
for p in jq qrencode curl ca-certificates gnupg python3 poppler-utils iptables iptables-persistent unattended-upgrades; do
  dpkg -s "$p" >/dev/null 2>&1 || fehlend+=("$p")
done
if [ ${#fehlend[@]} -gt 0 ]; then
  echo "iptables-persistent iptables-persistent/autosave_v4 boolean false" | debconf-set-selections
  echo "iptables-persistent iptables-persistent/autosave_v6 boolean false" | debconf-set-selections
  "${APT[@]}" update -q
  "${APT[@]}" install -y -q --no-install-recommends "${fehlend[@]}"
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
  curl -fsSL --max-time 120 https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key -o "$tmp/schluessel.asc"
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
  "${APT[@]}" update -q
  "${APT[@]}" install -y -q --no-install-recommends nodejs
  [ "$(node -p 'process.versions.node.split(".")[0]')" = "$NODE_MAJOR" ] || fehler "Node.js $NODE_MAJOR ließ sich nicht installieren"
  echo "installiert: Node.js $(node --version)"
else
  echo "schon da ($(node --version))"
fi

schritt "Caddy (offizielles Paketarchiv)"
if ! command -v caddy >/dev/null; then
  curl -1sLf --max-time 120 https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf --max-time 120 https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt -o /etc/apt/sources.list.d/caddy-stable.list
  "${APT[@]}" update -q
  "${APT[@]}" install -y -q caddy
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
# Eigener Benutzer für den Connector (Claude-App, mcp.mjs): Er nimmt Anfragen von claude.ai an und sieht nur, was der Web-Dienst ihm
# unter claude-app/ hinlegt, und die zentralen Daten; Zustand (Tokens) nur in /var/lib/studium-mcp (StateDirectory). Den gibt es auf
# jedem Server, der Connector läuft aber nur, solange er in Obsidian eingeschaltet ist.
getent group studium-mcp >/dev/null || groupadd --system studium-mcp
id studium-mcp >/dev/null 2>&1 || useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin --gid studium-mcp studium-mcp
# Eigener Benutzer für die zentralen Daten (zentral.mjs, bis 03.11.2026 als studium): Er holt aus dem Internet und schreibt nur zentral/.
# Als studium hätte ein übernommener Abruf über /proc/<PID>/ einen laufenden Claude-Lauf gesehen (Umgebung, Ordner, Speicher) und
# darüber die Claude-Anmeldung.
getent group studium-zentral >/dev/null || groupadd --system studium-zentral
id studium-zentral >/dev/null 2>&1 || useradd --system --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin --gid studium-zentral studium-zentral
install -d -m 0750 -o root -g studium-web /etc/studium-server
ordnung /var/lib/studium-server
install -d -m 0755 /etc/credstore.encrypted
install -d -m 0755 "$ZIEL"
# Paket nach $ZIEL. Beim Zurückrollen startet der Installer des bisherigen Pakets aus dessen installiertem Ordner: Quelle und Ziel
# sind dann derselbe Ordner, und es gibt nichts zu kopieren (install bräche mit „are the same file“ ab, rm -rf nähme skill/ mit).
# allowed_signers: Mit diesen Schlüsseln prüft „studium-server aktualisieren“ die Signatur des nächsten Pakets
# revoked_keys: gesperrte Schlüssel (leer, solange keiner gesperrt ist)
if [ "$QUELLE" -ef "$ZIEL" ]; then
  echo "Paket liegt schon unter $ZIEL"
else
  for datei in VERSION README.md kanal.mjs dateien.mjs dienst.mjs verbinden.mjs geraete.mjs zustand.mjs speicher-reserve.mjs eingang.mjs lauf.mjs abrufen.py livesync.mjs livesync.sh studium-server installieren.sh allowed_signers revoked_keys claude-app.mjs zentral.mjs mcp.mjs mcp-app.mjs mcp-oauth.mjs mcp-tresor.mjs mcp-werkzeuge.mjs mcp-ergebnis.mjs mcp-quelle-ordner.mjs mcp-quelle-server.mjs mcp-dateien.mjs CONNECTOR; do
    install -m 0644 "$QUELLE/$datei" "$ZIEL/$datei"
  done
  rm -rf "$ZIEL/skill"
  cp -r "$QUELLE/skill" "$ZIEL/skill"
  chmod -R a+rX "$ZIEL/skill"
fi
# Marke einer fertigen Installation (unten nach „Prüfen“) erst nach dem Kopieren weg; bis „Prüfen“ gilt dieses Paket dann als nicht
# fertig installiert
rm -f "$ZIEL/.installiert"
# bisher laufende Version: bleibt bei „Alte Pakete“ zum Zurückgehen von Hand und ist das Ziel beim Zurückrollen
VORHER=$(readlink -f /opt/studium-server/aktuell 2>/dev/null || true)
# Ab dem Umschalten zeigt aktuell auf dieses Paket: Scheitert ein Schritt, rollt der Installer zurück (zurueckrollen), sofern das
# bisherige Paket ein anderes und fertig installiert war. Die Marke steht vor dem Umschalten, damit kein Abbruch dazwischen fällt.
if [ -n "$VORHER" ] && [ "$VORHER" != "$ZIEL" ] && [ -f "$VORHER/.installiert" ] && [ -f "$VORHER/installieren.sh" ]; then
  ZURUECK_NACH=$VORHER
  printf '%s\n%s\n' "$VORHER" "$VERSION" >"$ZURUECK_OFFEN"
fi
ln -sfn "$ZIEL" /opt/studium-server/aktuell
if [ -n "$ZURUECK_NACH" ]; then
  trap 'zurueckrollen $?' EXIT
fi
install -m 0755 "$ZIEL/studium-server" /usr/local/bin/studium-server
echo "Paket $VERSION unter $ZIEL"

schritt "Schlüssel und Konfiguration"
KONFIG=/etc/studium-server/dienst.json
# Bestehende Schlüssel bleiben; sonst neue (32 Byte, base64url). Adresse, IP und Version werden nachgezogen.
# Neue Adresse (die IP des Servers hat sich geändert): auch neue Schlüssel, und offene Einmal-Codes gelten nicht mehr. Die Geräte
# schicken den Zugangsschlüssel weiter an die alte Adresse, und wer deren IP danach bei Oracle bekommt, kann dort ein Zertifikat
# für sie holen und ihn mitlesen. Mit neuen Schlüsseln nützt ihm das nichts; jedes Gerät verbindet sich neu. Nur, wenn schon eine
# Adresse da war: Der erste Lauf mit --ip nach dem Vorbereiten (noch ohne Adresse) behält die Schlüssel, --vorbereiten die Adresse.
ADRESSE_BISHER=$(jq -r '.adresse // empty' "$KONFIG" 2>/dev/null || true)
ADRESSE_NEU=0
if [ -n "$ADRESSE_BISHER" ] && [ -n "$ADRESSE" ] && [ "$ADRESSE_BISHER" != "$ADRESSE" ]; then ADRESSE_NEU=1; fi
STUDIUM_KONFIG="$KONFIG" STUDIUM_ADRESSE="$ADRESSE" STUDIUM_IP="$IP" STUDIUM_VERSION="$VERSION" STUDIUM_ADRESSE_NEU="$ADRESSE_NEU" node --input-type=module -e '
  import { readFileSync, writeFileSync } from "node:fs";
  import { randomBytes } from "node:crypto";
  const datei = process.env.STUDIUM_KONFIG;
  let k = {};
  try { k = JSON.parse(readFileSync(datei, "utf8")); } catch (e) { k = {}; }
  const neu = !k.zugang || !k.schluessel;
  const wechsel = !neu && process.env.STUDIUM_ADRESSE_NEU === "1";
  if (wechsel) {
    k.zugang = randomBytes(32).toString("base64url");
    k.schluessel = randomBytes(32).toString("base64url");
  }
  k.zugang ||= randomBytes(32).toString("base64url");
  k.schluessel ||= randomBytes(32).toString("base64url");
  Object.assign(k, { adresse: process.env.STUDIUM_ADRESSE, ip: process.env.STUDIUM_IP, port: k.port || 8743, version: process.env.STUDIUM_VERSION });
  writeFileSync(datei, JSON.stringify(k, null, 2) + "\n", { mode: 0o640 });
  console.log(neu ? "neue Schlüssel erzeugt" : wechsel ? "neue Adresse: neue Schlüssel erzeugt" : "Schlüssel unverändert");
'
chown root:studium-web "$KONFIG"
chmod 0640 "$KONFIG"
if [ "$ADRESSE_NEU" -eq 1 ]; then
  # als studium-web wie „studium-server schluessel-erneuern“: Die Codes liegen in seinem Ordner. Nur echte Dateien, keinem Link
  # folgen (find -P), und was dort sonst liegt (ein Ordner, ein Link), hält die Installation nicht auf
  if [ ! -d /var/lib/studium-server/web/verbinden ] \
    || sudo -u studium-web find -P /var/lib/studium-server/web/verbinden -mindepth 1 -maxdepth 1 -type f -delete; then
    echo "offene Einmal-Codes gelöscht ($ADRESSE_BISHER → $ADRESSE)"
  else
    echo "Offene Einmal-Codes ließen sich nicht alle löschen (web/verbinden/); weiter." >&2
  fi
  # Die Claude-App kennt die alte Adresse: Connector aus, Tokens weg; verbunden wird neu aus Obsidian
  studium-server claude-app aus || echo "Die Claude-App ließ sich nicht ausschalten; weiter." >&2
fi
# Konfiguration des Connectors (mcp.mjs): Adresse für Anmeldung und Tokens, Datenordner, Zustand; liest nur er (root:studium-mcp 0640).
# Ohne Adresse (vorbereitet) startet ihn studium-server claude-app anwenden nicht.
install -d -m 0750 -o root -g studium-mcp /etc/studium-server-mcp
jq -n --arg adresse "$ADRESSE" '{ daten: "/var/lib/studium-server", zustand: "/var/lib/studium-mcp",
  hoeren: [{ host: "127.0.0.1", port: 8744, oauth: { adresse: $adresse,
    zugriff: "Termine, Fristen, To-dos, Lernplan, Prüfungen mit Noten und Hinweise aus deinen Mails, wie dein Obsidian sie an deinen Server schickt",
    code_hinweis: "Den Code zeigt Obsidian unter Eigener Server → Mit der Claude-App verbinden." } }] }' >/etc/studium-server-mcp/konfig.json.neu
chown root:studium-mcp /etc/studium-server-mcp/konfig.json.neu
chmod 0640 /etc/studium-server-mcp/konfig.json.neu
mv -f /etc/studium-server-mcp/konfig.json.neu /etc/studium-server-mcp/konfig.json
# Zufallswert für die gestaffelte Verteilung neuer Versionen (studium-server, staffel_bis): einmal angelegt, danach unverändert
if [ ! -s /etc/studium-server/staffel ]; then
  (umask 077 && od -An -N4 -tu4 /dev/urandom | tr -d ' ' >/etc/studium-server/staffel)
fi
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
# hört nicht dort, siehe „Caddy (HTTPS)“). Schreiben darf er nur in web/, eingang/, unterlagen/ und seine Ordner unter claude-app/ (die
# Übergabe an den Connector; aus-mcp/ dort liest er nur), den Zustand des Connectors sieht er nicht.
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
ReadWritePaths=/var/lib/studium-server/web /var/lib/studium-server/eingang /var/lib/studium-server/unterlagen /var/lib/studium-server/claude-app
InaccessiblePaths=-/var/lib/studium -/var/lib/studium-server/laeufe -/var/lib/studium-server/abruf /etc/credstore.encrypted -/run/credentials -/etc/studium-server/livesync.json -/var/lib/studium-mcp
InaccessiblePaths=-/var/lib/caddy -/run/caddy -/opt/couchdb/etc -/var/lib/couchdb -/var/cache/debconf

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
SocketBindDeny=any
IPAddressDeny=any
ReadWritePaths=/var/lib/studium-server
InaccessiblePaths=-/var/lib/studium /etc/studium-server /etc/credstore.encrypted -/run/credentials -/var/cache/debconf

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
SocketBindDeny=any
ReadWritePaths=/var/lib/studium-server /var/lib/studium
InaccessiblePaths=/etc/studium-server -/run/credentials -/var/lib/studium-server/web -/var/lib/studium-server/unterlagen -/var/lib/studium-server/eingang -/var/cache/debconf
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
# Grenze für den ganzen Lauf (Pakete, Claude Code, Download, Installer samt Zurückrollen); ohne sie hielte ein hängender Schritt
# jeden weiteren Tag auf (oneshot hat sonst keine). Die langsamen Schritte haben eigene Grenzen (apt wartet höchstens 5 Minuten
# auf seine Sperre, Downloads höchstens 5 Minuten mit wenigen Wiederholungen, claude update 10 Minuten), damit die Grenze
# hier nur greift, wenn wirklich etwas hängt. Bricht systemd ab (SIGTERM), zählt der Lauf als gescheitert; ein offenes
# Zurückrollen holt der nächste Lauf vor allem anderen nach (installieren.sh, ZURUECK_OFFEN), eine nicht fertige Installation
# ebenso.
TimeoutStartSec=60min
UNIT
# Aufbau-Fenster von LiveSync (livesync.sh, „aufbauen“): Ein Neustart verliert den Zeitgeber, der es schließt. Nach dem Start
# schließt dieser Dienst ein abgelaufenes Fenster und stellt für ein offenes den Zeitgeber neu; das Ende steht nur in einer Datei
# von root. Läuft als root wie livesync.sh selbst (Einstellungen von CouchDB über 127.0.0.1 mit dem Administrator). Läuft CouchDB
# nicht oder antwortet es nicht, endet er still („-“): Das Ende bleibt vermerkt; der Zeitgeber unten prüft 15 Minuten nach dem
# Start noch einmal (CouchDB ist dann meist da), sonst der tägliche Lauf. Wie die übrigen Dienste außer dem Web-Dienst darf er
# keinen Port öffnen (SocketBindDeny): Niemand außer dem Web-Dienst soll während eines Neustarts dessen Port 8743 belegen und sich
# als er ausgeben können.
einheit studium-server-livesync-aufbau.service <<'UNIT'
[Unit]
Description=Studium Autopilot: Aufbau-Fenster von LiveSync nach dem Start prüfen
After=couchdb.service network-online.target
Wants=network-online.target
ConditionPathExists=/etc/studium-server/livesync.json

[Service]
Type=oneshot
ExecStart=-/bin/bash /opt/studium-server/aktuell/livesync.sh aufbau-pruefen
TimeoutStartSec=5min
SocketBindDeny=any

[Install]
WantedBy=multi-user.target
UNIT
einheit studium-server-livesync-aufbau.timer <<'UNIT'
[Unit]
Description=Studium Autopilot: Aufbau-Fenster von LiveSync 15 Minuten nach dem Start noch einmal prüfen

[Timer]
OnBootSec=15min

[Install]
WantedBy=timers.target
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
SocketBindDeny=any
ReadWritePaths=/var/lib/studium-server/abruf
InaccessiblePaths=-/var/lib/studium /etc/studium-server -/var/lib/studium-server/laeufe -/var/lib/studium-server/eingang -/var/lib/studium-server/unterlagen -/var/lib/studium-server/web/verbinden -/var/lib/studium-server/web/livesync-links -/var/cache/debconf
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
SocketBindDeny=any
ReadWritePaths=/var/lib/studium-server /var/lib/studium
InaccessiblePaths=/etc/studium-server /etc/credstore.encrypted -/run/credentials -/var/cache/debconf -/var/lib/studium-server/claude-app -/var/lib/studium-mcp
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
SocketBindDeny=any
IPAddressDeny=any
ReadWritePaths=/var/lib/studium-server
InaccessiblePaths=-/var/lib/studium -/var/lib/studium-server/laeufe -/var/lib/studium-server/abruf -/var/lib/studium-server/unterlagen -/var/lib/studium-server/eingang /etc/studium-server /etc/credstore.encrypted -/run/credentials -/var/cache/debconf
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
# Connector für die Claude-App (mcp.mjs, docs/architektur/connector.md): eigener Benutzer studium-mcp, kein Netz außer 127.0.0.1 (Caddy
# davor), Port nur 8744; den Port des Web-Dienstes auf 127.0.0.1 sperrt ihm eine Regel nach Besitzer (studium-server claude-app anwenden,
# connector_netz_sperren), denn direkt dort gibt der Web-Dienst den ganzen Status ohne Schlüssel. Lesen darf er nur claude-app/ (ohne schalter/) und zentral/; schreiben nur in seinen Zustand
# (/var/lib/studium-mcp) und aus-mcp/. Web-Dienst, Lauf, Abruf, Claude-Anmeldung, Schlüssel, Uni-Zugang, LiveSync, Caddy sieht er nicht.
# Ohne [Install]: Er läuft nur, solange die Marke aus Obsidian da ist (studium-server-mcp-schalter.service startet und hält ihn an;
# die Bedingung hält ihn sonst auch von Hand aus).
einheit studium-server-mcp.service <<'UNIT'
[Unit]
Description=Studium Autopilot: Connector für die Claude-App (nur 127.0.0.1, nur lesend)
ConditionPathExists=/var/lib/studium-server/claude-app/schalter/an
ConditionPathExists=/etc/studium-server-mcp/konfig.json

[Service]
User=studium-mcp
Group=studium-mcp
UMask=0077
ExecStart=/usr/bin/node /opt/studium-server/aktuell/mcp.mjs dienst /etc/studium-server-mcp/konfig.json
Restart=on-failure
RestartSec=5
StateDirectory=studium-mcp
StateDirectoryMode=0700
MemoryMax=512M
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
RemoveIPC=yes
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
SocketBindAllow=tcp:8744
SocketBindDeny=any
ReadWritePaths=/var/lib/studium-server/claude-app/aus-mcp
InaccessiblePaths=-/var/lib/studium -/var/lib/studium-server/laeufe -/var/lib/studium-server/abruf -/var/lib/studium-server/web -/var/lib/studium-server/eingang -/var/lib/studium-server/unterlagen -/var/lib/studium-server/claude-app/schalter /etc/studium-server /etc/credstore.encrypted -/run/credentials
InaccessiblePaths=-/var/lib/caddy -/run/caddy -/opt/couchdb/etc -/var/lib/couchdb -/var/cache/debconf
UNIT
# An oder aus nach der Marke des Web-Dienstes (claude-app/schalter/): root sieht nur, ob sie da ist, und liest sie nie (ein
# übernommener Web-Dienst kann den Connector so höchstens ein- oder ausschalten). Läuft auch bei jedem Start des Servers und am Ende
# jeder Installation (Notschalter im Paket).
einheit studium-server-mcp.path <<'UNIT'
[Unit]
Description=Studium Autopilot: Connector für die Claude-App an oder aus, sobald Obsidian es ändert

[Path]
PathChanged=/var/lib/studium-server/claude-app/schalter
Unit=studium-server-mcp-schalter.service

[Install]
WantedBy=paths.target
UNIT
einheit studium-server-mcp-schalter.service <<'UNIT'
[Unit]
Description=Studium Autopilot: Connector, seine Wege in Caddy und seinen Zustand nach der Marke aus Obsidian richten
After=caddy.service

[Service]
Type=oneshot
ExecStart=/usr/local/bin/studium-server claude-app anwenden
TimeoutStartSec=2min
SocketBindDeny=any

[Install]
WantedBy=multi-user.target
UNIT
# Zentrale Daten für den Connector (zentral.mjs): nur solange er an ist, als eigener Benutzer studium-zentral mit Netz (GitHub Pages),
# schreibt nur zentral/; höchstens 256 MB Speicher (er liest jede Datei nur bis zu ihrer Größe aus dem Manifest)
einheit studium-server-zentral.service <<'UNIT'
[Unit]
Description=Studium Autopilot: zentrale Daten für den Connector holen
After=network-online.target
Wants=network-online.target
ConditionPathExists=/var/lib/studium-server/claude-app/schalter/an

[Service]
Type=oneshot
User=studium-zentral
Group=studium-zentral
UMask=0077
Environment=STUDIUM_SERVER_DATEN=/var/lib/studium-server
ExecStart=/usr/bin/node /opt/studium-server/aktuell/zentral.mjs
TimeoutStartSec=5min
MemoryMax=256M
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
SocketBindDeny=any
ReadWritePaths=/var/lib/studium-server/zentral
InaccessiblePaths=-/var/lib/studium -/var/lib/studium-server/laeufe -/var/lib/studium-server/abruf -/var/lib/studium-server/web -/var/lib/studium-server/eingang -/var/lib/studium-server/unterlagen -/var/lib/studium-server/claude-app /etc/studium-server /etc/credstore.encrypted -/run/credentials -/var/cache/debconf
UNIT
einheit studium-server-zentral.timer <<'UNIT'
[Unit]
Description=Studium Autopilot: zentrale Daten für den Connector alle 15 Minuten (nur, solange er an ist)

[Timer]
OnBootSec=4min
OnCalendar=*:0/15
RandomizedDelaySec=2min

[Install]
WantedBy=timers.target
UNIT
alte_einheiten_entfernen "$EINHEITEN"
systemctl daemon-reload
systemctl enable -q studium-server-dienst.service studium-server-speicher.service studium-server-zustand.timer \
  studium-server-abruf.timer studium-server-lauf.path studium-server-gmail.timer studium-server-livesync-aufbau.timer \
  studium-server-livesync-aufbau.service
# Connector für die Claude-App: nur die Pfad-Einheit, das Anwenden beim Start und der Zeitgeber der zentralen Daten; der Connector
# selbst und das Holen laufen nur mit der Marke aus Obsidian (ConditionPathExists)
systemctl enable -q studium-server-mcp.path studium-server-mcp-schalter.service studium-server-zentral.timer
[ "$TEST" -eq 1 ] || systemctl enable -q studium-server-aktualisieren.timer
systemctl restart studium-server-dienst.service studium-server-speicher.service
systemctl start studium-server-zustand.timer studium-server-abruf.timer studium-server-lauf.path studium-server-gmail.timer \
  studium-server-mcp.path studium-server-zentral.timer
# ein laufender Connector mit dem neuen Paket (ob er laufen soll, richtet „Connector“ unten)
systemctl try-restart studium-server-mcp.service
[ "$TEST" -eq 1 ] || systemctl start studium-server-aktualisieren.timer

schritt "Caddy (HTTPS)"
CADDYFILE=/etc/caddy/Caddyfile
if [ -f "$CADDYFILE" ] && ! grep -q '^# studium-server' "$CADDYFILE"; then
  cp "$CADDYFILE" "$CADDYFILE.vor-studium-server"
  echo "bisherige Caddyfile gesichert: $CADDYFILE.vor-studium-server"
fi
if [ "$TEST" -eq 1 ]; then SEITE=":8080"; else SEITE="${ADRESSE#https://}"; fi
# Weitere Adressen (LiveSync, livesync.sh) legen ihre Teile in studium-server.d/ ab; sie bleiben bei jeder Installation. Wege unter
# der Adresse selbst (der Connector, solange er an ist: studium-server claude-app anwenden) in studium-server.d/seite/
install -d -m 0755 /etc/caddy/studium-server.d /etc/caddy/studium-server.d/seite
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
	# Connector für die Claude-App (/mcp, /oauth/*, /.well-known/oauth-*), nur solange er an ist; ohne ihn gibt es hier nichts davon
	import /etc/caddy/studium-server.d/seite/*.caddy
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

schritt "Connector für die Claude-App"
# Nach Paket, Einheiten und Caddy: an nur mit der Marke aus Obsidian, einer Adresse und ohne Notschalter im Paket (CONNECTOR). Er ist
# freiwillig: Scheitert das, bleibt die Installation gültig, und der Connector bleibt aus.
studium-server claude-app anwenden || echo "Connector ließ sich nicht richten; er bleibt aus, nächster Versuch beim nächsten Update." >&2

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
# Bei einem Update hält ein Fehler hier nichts auf (der Ordner gehört studium; fehlt Claude Code dort, entscheidet das nicht über
# ein Zurückrollen); bei der ersten Installation schon, sonst ginge die Einrichtung ohne Claude weiter
elif ! timeout 600 sudo -u studium -H bash -c 'curl -fsSL --max-time 300 https://claude.ai/install.sh | bash'; then
  [ -n "$ZURUECK_NACH" ] || fehler "Claude Code ließ sich nicht installieren"
  echo "Claude Code ließ sich nicht installieren; nächster Versuch beim nächsten Update." >&2
fi

schritt "Prüfen"
# Ob dieses Paket gilt, entscheidet nur der neue Web-Dienst selbst: /v1/status direkt auf 127.0.0.1, ohne Caddy und ohne Kopf einer
# Weiterleitung (so braucht er keinen Zugangsschlüssel, auch nachdem ein Gerät den Status über Caddy mit Schlüssel geholt hat), muss
# mit der Version dieses Pakets antworten, und auf dem Port muss genau sein Prozess lauschen (MainPID der Einheit, ss -p): Ein
# anderer lokaler Prozess, der den Port während des Neustarts belegt, gilt nicht (die übrigen Dienste dürfen ohnehin keinen Port
# öffnen, SocketBindDeny). Fehlt ss, zählt nur die Antwort. Was danach Dateien anderer Benutzer liest (Zustand, studium-server status:
# takt.json des Web-Dienstes), ist nur Anzeige und kann nie ein Zurückrollen auslösen; sonst könnte, wer den Web-Dienst übernommen
# hat, mit einer kaputten Datei jedes Update zurückrollen lassen.
port=$(jq -r '.port // 8743' "$KONFIG" 2>/dev/null || true)
[[ "$port" =~ ^[0-9]{1,5}$ ]] || port=8743
dienst_lauscht() {
  local pid
  command -v ss >/dev/null || return 0
  pid=$(systemctl show -P MainPID studium-server-dienst.service 2>/dev/null || true)
  [[ "$pid" =~ ^[1-9][0-9]*$ ]] && ss -ltnpH "sport = :$port" 2>/dev/null | grep -q "pid=$pid,"
}
for i in $(seq 1 30); do
  antwort=$(curl -fsS --max-time 5 "http://127.0.0.1:$port/v1/status" 2>/dev/null || true)
  [ "$(jq -r '.version // empty' <<<"$antwort" 2>/dev/null || true)" != "$VERSION" ] || ! dienst_lauscht || break
  sleep 1
  [ "$i" -lt 30 ] || fehler "der Web-Dienst antwortet nicht mit Version $VERSION (journalctl -u studium-server-dienst)"
done
systemctl start studium-server-zustand.service || true
studium-server status || true
# Erst jetzt ist dieses Paket fertig installiert. Fehlt die Marke (ein Schritt oben scheiterte), installiert „studium-server
# aktualisieren“ dieselbe Version beim nächsten Mal noch einmal, statt „Schon aktuell“ zu melden. Ab jetzt gilt dieses Paket; was
# danach scheitert (Aufräumen), ist kein Grund zum Zurückrollen, und kein Zurückrollen steht aus. Die Marke ZURUECK_OFFEN fällt
# darum vor .installiert weg: Bricht der Lauf genau dazwischen ab, installiert der nächste dieselbe Version noch einmal, statt ein
# gutes Paket zurückzurollen.
ZURUECK_NACH=""
rm -f "$ZURUECK_OFFEN"
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
if [ "$ADRESSE_NEU" -eq 1 ]; then
  cat <<TEXT

Die Adresse des Servers hat sich geändert ($ADRESSE_BISHER → $ADRESSE). Darum gelten neue Schlüssel: Jedes Gerät muss sich neu
verbinden, das erste mit „verbinden“ unten, jedes weitere in Obsidian mit „Weiteres Gerät verbinden“. Mit LiveSync braucht jedes
Gerät einen neuen Link; vorher am besten neue Zugangsdaten: sudo studium-server livesync-erneuern.
TEXT
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
