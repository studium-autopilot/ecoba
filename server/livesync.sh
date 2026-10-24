#!/usr/bin/env bash
# LiveSync auf dem eigenen Server (server/README.md, „LiveSync“): eine CouchDB nur für den eigenen Tresor, damit Obsidian mit dem
# Plugin Self-hosted LiveSync zwischen Windows, iPhone, iPad und Android abgleicht. Aufruf über `sudo studium-server livesync`.
#   livesync.sh               einschalten (falls nötig), dann Link und Code für ein Gerät
#   livesync.sh einschalten   CouchDB aus dem Paketarchiv von Apache, nur auf 127.0.0.1; Caddy unter https://obsidian.<IP>.sslip.io
#   livesync.sh verbinden     Link (30 Minuten) und QR-Code für ein Gerät, dazu der Code zum Eintippen
#   livesync.sh adresse       Adresse und Caddy-Teil auf die IP aus dienst.json (ruft installieren.sh nach einem IP-Wechsel auf)
# Auf einem Server aus `installieren.sh --test` (ohne IP) ohne HTTPS: CouchDB über Caddy auf http://127.0.0.1:8081 (nur für Tests).
# Wiederholbar: Zugangsdaten bleiben in /etc/studium-server/livesync.json (nur root), jeder Schritt prüft, ob er schon erledigt ist.
# Passwörter gehen nur über Pipes und Dateien, nie über eine Befehlszeile.
set -euo pipefail

PAKET=/opt/studium-server/aktuell
KONFIG=/etc/studium-server/dienst.json
LS_KONFIG=/etc/studium-server/livesync.json
DATEN=/var/lib/studium-server
INI=/opt/couchdb/etc/local.d/50-studium-livesync.ini
CADDY_TEIL=/etc/caddy/studium-server.d/livesync.caddy
COUCH=http://127.0.0.1:5984

schritt() { printf '\n==> %s\n' "$*"; }
fehler() { echo "Fehler: $*" >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || fehler "bitte mit sudo starten: sudo studium-server livesync"
wert() { jq -r ".$1" "$LS_KONFIG"; }
# curl mit den Zugangsdaten aus der Datei (über -K von stdin, nicht in der Befehlszeile)
couch() { printf 'user = "%s:%s"\n' "$(wert benutzer)" "$(wert passwort)" | curl -sS -K - "$@"; }

# Adresse für LiveSync aus der IP in dienst.json: setzt $adresse und $seite (Kopf des Caddy-Teils)
ziel() {
  local ip
  ip=$(jq -r '.ip // empty' "$KONFIG" 2>/dev/null || true)
  if [[ "$ip" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]]; then
    adresse="https://obsidian.${ip//./-}.sslip.io"
    seite="${adresse#https://}"
  elif [ "$(jq -r '.adresse' "$KONFIG" 2>/dev/null)" = "http://127.0.0.1:8080" ]; then
    adresse="http://127.0.0.1:8081"
    seite=":8081"
  else
    fehler "keine öffentliche IP in $KONFIG (Server mit --ip installiert?)"
  fi
}

# Adresse in livesync.json und Caddy-Teil auf die aktuelle IP; nach einem IP-Wechsel zeigten Link und HTTPS sonst auf die alte.
# Lädt Caddy nur neu, wenn sich der Teil geändert hat.
adresse_nachziehen() {
  local adresse seite
  ziel
  [ ! -f "$LS_KONFIG" ] || [ "$(wert adresse)" = "$adresse" ] \
    || { (umask 077; jq --arg a "$adresse" '.adresse = $a' "$LS_KONFIG" >"$LS_KONFIG.neu") && mv "$LS_KONFIG.neu" "$LS_KONFIG" && chmod 0600 "$LS_KONFIG"; }
  install -d -m 0755 /etc/caddy/studium-server.d
  cat >"$CADDY_TEIL.neu" <<CADDY
# studium-server (livesync.sh): CouchDB für LiveSync, wird bei jedem Lauf neu geschrieben
$seite {
	reverse_proxy 127.0.0.1:5984
}
CADDY
  if cmp -s "$CADDY_TEIL" "$CADDY_TEIL.neu"; then
    rm -f "$CADDY_TEIL.neu"
  else
    mv "$CADDY_TEIL.neu" "$CADDY_TEIL"
    caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
    systemctl reload caddy
    echo "LiveSync-Adresse: $adresse"
  fi
}

einschalten() {
  local adresse seite
  ziel
  grep -q '^import /etc/caddy/studium-server.d/' /etc/caddy/Caddyfile 2>/dev/null \
    || fehler "das Server-Paket ist zu alt; erst aktualisieren (Cloud Shell: bash ~/studium-autopilot/server/fern.sh aktualisieren)"

  schritt "Zugangsdaten"
  if [ -f "$LS_KONFIG" ]; then
    echo "schon da"
  else
    # Benutzer admin: der Server gehört nur dir, und LiveSync braucht Admin-Rechte, um die Datenbank neu aufzubauen
    # („Overwrite remote“). e2ee verschlüsselt den Tresor zusätzlich in der Datenbank.
    LS_ADRESSE="$adresse" node --input-type=module -e '
      import { randomInt } from "node:crypto";
      import { writeFileSync } from "node:fs";
      const Z = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
      const zufall = (n) => Array.from({ length: n }, () => Z[randomInt(Z.length)]).join("");
      writeFileSync("'"$LS_KONFIG"'", JSON.stringify({ adresse: process.env.LS_ADRESSE, benutzer: "admin", ["passwort"]: zufall(32),
        datenbank: "studium-autopilot", e2ee: zufall(32) }, null, 2) + "\n", { mode: 0o600 });
    '
    echo "neu erzeugt"
  fi
  chown root:root "$LS_KONFIG"
  chmod 0600 "$LS_KONFIG"

  schritt "CouchDB (Paketarchiv von Apache)"
  if dpkg -s couchdb >/dev/null 2>&1; then
    echo "schon da ($(dpkg-query -W -f='${Version}' couchdb))"
  else
    curl -fsSL https://couchdb.apache.org/repo/keys.asc | gpg --dearmor --yes -o /usr/share/keyrings/couchdb-archive-keyring.gpg
    echo "deb [signed-by=/usr/share/keyrings/couchdb-archive-keyring.gpg] https://apache.jfrog.io/artifactory/couchdb-deb/ noble main" \
      >/etc/apt/sources.list.d/couchdb.list
    # Antworten für den Installer: ein Knoten, nur 127.0.0.1, Admin-Passwort aus der Datei (über stdin)
    {
      echo "couchdb couchdb/mode select standalone"
      echo "couchdb couchdb/bindaddress string 127.0.0.1"
      echo "couchdb couchdb/cookie string $(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')"
      echo "couchdb couchdb/adminpass password $(wert passwort)"
      echo "couchdb couchdb/adminpass_again password $(wert passwort)"
    } | debconf-set-selections
    apt-get update -q
    DEBIAN_FRONTEND=noninteractive apt-get install -y -q couchdb
    echo "couchdb couchdb/adminpass password " | debconf-set-selections
    echo "couchdb couchdb/adminpass_again password " | debconf-set-selections
  fi

  schritt "CouchDB für LiveSync einstellen"
  # Werte wie in der Anleitung von LiveSync; CORS für die Obsidian-Apps (Windows/Mac: app://obsidian.md, iPhone/iPad:
  # capacitor://localhost, Android: http://localhost)
  umask 077
  cat >"$INI.neu" <<INI
; studium-server (livesync.sh): wird bei jedem Lauf neu geschrieben
[couchdb]
single_node = true
max_document_size = 50000000

[chttpd]
bind_address = 127.0.0.1
port = 5984
require_valid_user = true
max_http_request_size = 4294967296
enable_cors = true

[chttpd_auth]
require_valid_user = true
authentication_redirect = /_utils/session.html

[httpd]
WWW-Authenticate = Basic realm="couchdb"
enable_cors = true

[cors]
origins = app://obsidian.md,capacitor://localhost,http://localhost
credentials = true
headers = accept, authorization, content-type, origin, referer
methods = GET, PUT, POST, HEAD, DELETE
max_age = 3600

[admins]
$(wert benutzer) = $(wert passwort)
INI
  umask 022
  # CouchDB ersetzt das Passwort beim Start durch einen Hash; nur neu schreiben, wenn sich außer [admins] etwas ändert
  if [ -f "$INI" ] && diff -q <(sed '/^\[admins\]/,$d' "$INI") <(sed '/^\[admins\]/,$d' "$INI.neu") >/dev/null; then
    rm -f "$INI.neu"
    echo "unverändert"
  else
    mv "$INI.neu" "$INI"
    chown couchdb:couchdb "$INI"
    chmod 0640 "$INI"
    systemctl restart couchdb
    echo "geschrieben"
  fi
  systemctl enable -q couchdb
  systemctl is-active --quiet couchdb || systemctl start couchdb
  for i in $(seq 1 30); do
    [ "$(couch -o /dev/null -w '%{http_code}' "$COUCH/_up" 2>/dev/null || true)" = 200 ] && break
    sleep 2
    [ "$i" -lt 30 ] || fehler "CouchDB antwortet nicht (journalctl -u couchdb)"
  done

  schritt "Datenbank"
  case "$(couch -o /dev/null -w '%{http_code}' -X PUT "$COUCH/$(wert datenbank)")" in
    201|202) echo "angelegt" ;;
    412) echo "schon da" ;;
    *) fehler "Datenbank ließ sich nicht anlegen" ;;
  esac

  schritt "Caddy ($adresse)"
  adresse_nachziehen
  # Das Zertifikat holt Caddy beim ersten Aufruf; bis zu 2 Minuten
  for i in $(seq 1 24); do
    [ "$(couch -o /dev/null -w '%{http_code}' --max-time 10 "$adresse/_up" 2>/dev/null || true)" = 200 ] && break
    sleep 5
    [ "$i" -lt 24 ] || fehler "$adresse ist von außen nicht erreichbar (journalctl -u caddy)"
  done
  echo "erreichbar"

  install -o studium -g studium -m 0644 /dev/null "$DATEN/livesync-an"
  sudo -u studium env STUDIUM_SERVER_DATEN="$DATEN" node "$PAKET/zustand.mjs" >/dev/null || true
}

verbinden() {
  [ -f "$LS_KONFIG" ] && [ -f "$DATEN/livesync-an" ] || fehler "LiveSync ist noch nicht eingeschaltet; erst einschalten (Cloud Shell: bash ~/studium-autopilot/server/fern.sh livesync)"
  adresse_nachziehen
  local paket code kennung link
  paket=$(node "$PAKET/livesync.mjs" link "$LS_KONFIG")
  code=$(jq -r '.code' <<<"$paket")
  # Der lange Setup-Link geht nur über die Pipe an den Dienst-Benutzer; angezeigt wird der kurze
  kennung=$(jq -r '.link' <<<"$paket" | sudo -u studium env STUDIUM_SERVER_DATEN="$DATEN" node "$PAKET/livesync.mjs" ablegen | jq -r '.kennung')
  link="$(jq -r '.adresse' "$KONFIG")/v1/livesync/$kennung"
  cat <<TEXT

Ein Gerät mit LiveSync verbinden (gilt 30 Minuten):
  Link: $link
  Code: $code

Auf dem Gerät: Obsidian mit dem Tresor öffnen, in dem LiveSync installiert ist. Am Handy den QR-Code mit der Kamera
scannen, am Computer den Link im Browser öffnen. Dann „In Obsidian öffnen“ und den Code eintippen.
TEXT
  qrencode -t ANSIUTF8 "$link"
}

case "${1:-}" in
  "") [ -f "$DATEN/livesync-an" ] || einschalten; verbinden ;;
  einschalten) einschalten ;;
  verbinden) verbinden ;;
  adresse) adresse_nachziehen ;;
  *) echo "Aufruf: sudo studium-server livesync [einschalten|verbinden|adresse]" >&2; exit 2 ;;
esac
