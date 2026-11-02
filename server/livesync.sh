#!/usr/bin/env bash
# LiveSync auf dem eigenen Server (server/README.md, „LiveSync“): eine CouchDB nur für den eigenen Tresor, damit Obsidian mit dem
# Plugin Self-hosted LiveSync zwischen Windows, iPhone, iPad und Android abgleicht. Aufruf über `sudo studium-server livesync`.
#   livesync.sh               einschalten (falls nötig), dann Link und Code für ein Gerät
#   livesync.sh einschalten   CouchDB aus dem Paketarchiv von Apache, nur auf 127.0.0.1; Caddy unter https://obsidian.<IP>.sslip.io
#   livesync.sh verbinden     Link (30 Minuten) und QR-Code für ein Gerät, dazu der Code zum Eintippen
#   livesync.sh aufbauen      eine Stunde lang darf der Gerätezugang die Datenbank neu aufbauen („Overwrite remote“)
#   livesync.sh erneuern [--neue-passphrase]
#                             neue Zugangsdaten (Administrator und Gerätezugang); mit --neue-passphrase auch ein neuer Schlüssel
#                             der Ende-zu-Ende-Verschlüsselung (der Tresor auf dem Server wird dafür geleert und neu aufgebaut)
#   livesync.sh adresse       Adresse und Caddy-Teil auf die IP aus dienst.json (ruft installieren.sh nach einem IP-Wechsel auf)
#   livesync.sh absichern     Erlang-Cookie nicht in debconf (stand er dort, ein neuer), epmd nur auf 127.0.0.1 (täglich)
#   livesync.sh aufbau-ende   Aufbau-Fenster schließen (ruft der Zeitgeber von „aufbauen“ auf)
#   livesync.sh aufbau-pruefen  abgelaufenes Aufbau-Fenster schließen, für ein offenes den Zeitgeber stellen (täglich, beim Start)
# Auf einem Server aus `installieren.sh --test` (ohne IP) ohne HTTPS: CouchDB über Caddy auf http://127.0.0.1:8081 (nur für Tests).
# Wiederholbar: Zugangsdaten bleiben in /etc/studium-server/livesync.json (nur root), jeder Schritt prüft, ob er schon erledigt ist.
# Passwörter gehen nur über Pipes und Dateien, nie über eine Befehlszeile.
set -euo pipefail

PAKET=/opt/studium-server/aktuell
KONFIG=/etc/studium-server/dienst.json
LS_KONFIG=/etc/studium-server/livesync.json
DATEN=/var/lib/studium-server
COUCH_ETC=/opt/couchdb/etc
COUCH_STANDARD=/etc/default/couchdb
INI=$COUCH_ETC/local.d/50-studium-livesync.ini
CADDY_TEIL=/etc/caddy/studium-server.d/livesync.caddy
COUCH=http://127.0.0.1:5984
# Aufbau-Fenster: Ende (Sekunden seit 1970) und Zeitgeber; ERSTES: Die Datenbank ist neu und noch von keinem Gerät aufgebaut (das
# nächste „verbinden“ öffnet das Fenster einmal). Beides nur root.
AUFBAU=/etc/studium-server/livesync-aufbau
AUFBAU_ERSTES=/etc/studium-server/livesync-erstes-geraet
AUFBAU_EINHEIT=studium-livesync-aufbau
AUFBAU_MIN=60
DEBCONF=/var/cache/debconf

schritt() { printf '\n==> %s\n' "$*"; }
fehler() { echo "Fehler: $*" >&2; exit 1; }
[ "$(id -u)" -eq 0 ] || fehler "bitte mit sudo starten: sudo studium-server livesync"
wert() { jq -r ".$1 // empty" "$LS_KONFIG"; }
# curl als Administrator mit den Zugangsdaten aus der Datei (über -K von stdin, nicht in der Befehlszeile)
couch() { printf 'user = "%s:%s"\n' "$(wert benutzer)" "$(wert passwort)" | curl -sS -K - "$@"; }
code() { couch -o /dev/null -w '%{http_code}' "$@" 2>/dev/null || true; }

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
# Nach außen nur, was Self-hosted LiveSync braucht (geprüft im Quelltext von 1.0.44 und der Bibliothek livesync-commonlib 0.2.3):
# die eine Datenbank (/<db>, /<db>/…: Abgleich, _local, _changes, _bulk_docs, Aufbau) und GET/HEAD/OPTIONS auf / (PouchDB liest
# dort bei jedem Start des Abgleichs die Kennung des Servers). Alles andere antwortet 404: Fauxton (/_utils), die Einstellungen von
# CouchDB (/_node/…), Benutzer (/_users), andere Datenbanken, /_session, /_up. Nur „Check database configuration“ im Einrichten von
# LiveSync liest /_node/_local/_config; das zeigt dann Fehler, die Einstellungen setzt ohnehin livesync.sh. Bis 0.7.7 ging alles
# an CouchDB.
adresse_nachziehen() {
  local adresse seite db
  ziel
  [ ! -f "$LS_KONFIG" ] || [ "$(wert adresse)" = "$adresse" ] \
    || { (umask 077; jq --arg a "$adresse" '.adresse = $a' "$LS_KONFIG" >"$LS_KONFIG.neu") && mv "$LS_KONFIG.neu" "$LS_KONFIG" && chmod 0600 "$LS_KONFIG"; }
  db=studium-autopilot
  [ ! -f "$LS_KONFIG" ] || db=$(wert datenbank)
  [[ "$db" =~ ^[a-z][a-z0-9-]*$ ]] || fehler "Datenbank in $LS_KONFIG ungültig"
  install -d -m 0755 /etc/caddy/studium-server.d
  cat >"$CADDY_TEIL.neu" <<CADDY
# studium-server (livesync.sh): CouchDB für LiveSync, wird bei jedem Lauf neu geschrieben. Nur die Datenbank und / (Lesen), sonst 404.
$seite {
	@datenbank path /$db /$db/*
	handle @datenbank {
		reverse_proxy 127.0.0.1:5984
	}
	@wurzel {
		path /
		method GET HEAD OPTIONS
	}
	handle @wurzel {
		reverse_proxy 127.0.0.1:5984
	}
	handle {
		respond 404
	}
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

# Dateien von CouchDB (in /opt/couchdb/etc, das dem Benutzer couchdb gehört) liest und schreibt root nie selbst, sondern nur als
# couchdb (runuser): Ein Link an der Stelle einer Datei oder eines Ordners führt dann nur dorthin, wo couchdb ohnehin hin darf, und
# eine Named Pipe statt der Datei hält höchstens bis zur Zeitgrenze auf (timeout). Lesen: höchstens 1 MB. Schreiben: aus stdin in eine
# neue Datei daneben (couchdb:couchdb, 0640), dann mit mv -T an ihren Platz (ein Link dort wird ersetzt, nicht verfolgt).
couch_lesen() { timeout 30 runuser -u couchdb -- head -c 1048576 -- "$1"; }
couch_datei() {
  timeout 60 runuser -u couchdb -- sh -c 'umask 027 && n="$1.studium-neu" && rm -f -- "$n" && cat >"$n" && chmod 0640 -- "$n" && mv -fT -- "$n" "$1"' - "$1" \
    || fehler "$1 ließ sich nicht schreiben (als couchdb)"
}

# Erlang-Cookie und Verteilung (server/README.md, „LiveSync“, „Erlang“): Das Paket von Apache legt den Cookie auch in debconf ab,
# als Typ string in /var/cache/debconf/config.dat, die für alle lesbar ist, und debconf behält die vorige Fassung in config.dat-old;
# mit dem Cookie kann jeder Benutzer des Servers über die Erlang-Verteilung auf 127.0.0.1 Code als couchdb ausführen. Steht er dort
# (bei bestehenden Servern seit der Installation; nach einem Update von CouchDB holt das Konfigurationsskript des Pakets ihn aus
# vm.args wieder hinein), gilt er als bekannt: Ein neuer, zufälliger Cookie kommt nach vm.args (dort liest CouchDB ihn; gelesen
# und geschrieben als couchdb, couch_datei), in beiden Dateien von debconf wird genau dieser Eintrag leer (die Dateien bleiben),
# und CouchDB startet einmal neu. studium-server aktualisieren ruft das jeden Tag auf. epmd und die Verteilung nur auf 127.0.0.1: Das Paket setzt im Modus
# standalone ERL_EPMD_ADDRESS=127.0.0.1 in /etc/default/couchdb (die Einheit liest die Datei) und -kernel inet_dist_use_interface
# {127,0,0,1} in vm.args; hier wird nur nachgesehen und ergänzt, was fehlt. Die Dienste von Studium Autopilot sehen
# /var/cache/debconf ohnehin nicht (InaccessiblePaths in installieren.sh).
cookie_in_debconf() {
  [ -f "$1" ] && [ ! -L "$1" ] || return 1
  awk '/^Name: /{n=($0=="Name: couchdb/cookie")} /^$/{n=0} n && /^Value: /{v=$0; sub(/^Value: /,"",v); if (v ~ /[^ \t]/) f=1} END{exit !f}' "$1"
}
cookie_aus_debconf() {
  local f
  echo "couchdb couchdb/cookie string " | debconf-set-selections
  for f in "$DEBCONF/config.dat" "$DEBCONF/config.dat-old"; do
    cookie_in_debconf "$f" || continue
    awk '/^Name: /{n=($0=="Name: couchdb/cookie")} /^$/{n=0} n && /^Value: /{print "Value: "; next} {print}' "$f" >"$f.studium-neu"
    chown --reference="$f" "$f.studium-neu"
    chmod --reference="$f" "$f.studium-neu"
    mv -f "$f.studium-neu" "$f"
  done
}
absichern() {
  local args=$COUCH_ETC/vm.args standard=$COUCH_STANDARD inhalt neu=0 bekannt=0
  dpkg -s couchdb >/dev/null 2>&1 && [ -e "$args" ] || return 0
  if cookie_in_debconf "$DEBCONF/config.dat" || cookie_in_debconf "$DEBCONF/config.dat-old"; then bekannt=1; fi
  inhalt=$(couch_lesen "$args") || fehler "$args ließ sich nicht lesen (als couchdb)"
  if [ "$bekannt" -eq 1 ] || ! grep -Eq "^-setcookie +'?[A-Za-z0-9]" <<<"$inhalt"; then
    inhalt="$(grep -v '^-setcookie' <<<"$inhalt" || true)"$'\n'"-setcookie '$(head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9')'"
    neu=1
  fi
  if ! grep -Eq '^-kernel +inet_dist_use_interface +\{127,0,0,1\}' <<<"$inhalt"; then
    inhalt+=$'\n''-kernel inet_dist_use_interface {127,0,0,1}'
    neu=1
  fi
  [ "$neu" -eq 0 ] || printf '%s\n' "$inhalt" | couch_datei "$args"
  if ! grep -Eq '^ERL_EPMD_ADDRESS=127\.0\.0\.1$' "$standard" 2>/dev/null; then
    sed -i '/^ERL_EPMD_ADDRESS=/d' "$standard" 2>/dev/null || true
    echo "ERL_EPMD_ADDRESS=127.0.0.1" >>"$standard"
    neu=1
  fi
  [ "$bekannt" -eq 0 ] || cookie_aus_debconf
  if [ "$neu" -eq 1 ]; then
    [ "$bekannt" -eq 0 ] || echo "CouchDB: Der Erlang-Cookie stand in debconf; neuer Cookie, dort geleert"
    echo "CouchDB: Erlang nur auf 127.0.0.1 bzw. Cookie in vm.args erneuert, Neustart"
    systemctl try-restart couchdb
  fi
}

# Einstellungen von CouchDB (Werte wie in der Anleitung von LiveSync); CORS für die Obsidian-Apps (Windows/Mac: app://obsidian.md,
# iPhone/iPad: capacitor://localhost, Android: http://localhost). [admins] mit dem Passwort aus livesync.json: CouchDB ersetzt es
# beim Start durch einen Hash.
ini_text() {
  cat <<INI
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
}
ini_schreiben() {
  ini_text | couch_datei "$INI"
  systemctl restart couchdb
}
# CouchDB antwortet (200, oder 401, wenn das Passwort aus livesync.json nicht gilt: einschalten setzt es dann neu)
couch_bereit() {
  local i
  for i in $(seq 1 30); do
    case "$(code "$COUCH/_up")" in 200|401) return 0 ;; esac
    sleep 2
  done
  fehler "CouchDB antwortet nicht (journalctl -u couchdb)"
}

# Gerätezugang (server/README.md, „LiveSync“): ein Benutzer in _users ohne Rollen, als einziges Mitglied der Datenbank (_security).
# Mitglieder lesen und schreiben Dokumente; die Datenbank löschen oder anlegen, _security, Entwürfe und die Einstellungen von CouchDB
# dürfen sie nicht. Fehlt er in livesync.json (LiveSync von vor diesem Zugang), entsteht er hier; Geräte mit dem Administrator
# gleichen weiter ab. Setzt sein Passwort jedes Mal auf das aus livesync.json (wiederholbar).
geraetezugang() {
  local d rev name
  if [ -z "$(wert geraet_benutzer)" ]; then
    LS_KONFIG="$LS_KONFIG" node "$PAKET/livesync.mjs" geraet-neu
    echo "Gerätezugang angelegt"
  fi
  name=$(wert geraet_benutzer)
  [[ "$name" =~ ^[a-z][a-z0-9]*$ ]] || fehler "Gerätezugang in $LS_KONFIG ungültig"
  d=$(mktemp -d)
  rev=$(couch "$COUCH/_users/org.couchdb.user:$name" 2>/dev/null | jq -r '._rev // empty' 2>/dev/null || true)
  (umask 077 && LS_KONFIG="$LS_KONFIG" node "$PAKET/livesync.mjs" benutzer "$rev" >"$d/benutzer.json")
  case "$(code -X PUT -H 'Content-Type: application/json' --data-binary "@$d/benutzer.json" "$COUCH/_users/org.couchdb.user:$name")" in
    201|202) ;;
    *) rm -rf "$d"; fehler "Gerätezugang ließ sich nicht anlegen" ;;
  esac
  rm -rf "$d"
  case "$(code -X PUT -H 'Content-Type: application/json' \
    -d "{\"admins\":{\"names\":[],\"roles\":[]},\"members\":{\"names\":[\"$name\"],\"roles\":[]}}" "$COUCH/$(wert datenbank)/_security")" in
    200|201) ;;
    *) fehler "Rechte der Datenbank ließen sich nicht setzen" ;;
  esac
}

# Aufbau-Fenster (server/README.md, „LiveSync“): „Initialise or overwrite the remote“ löscht die Datenbank und legt sie neu an; das
# darf in CouchDB nur ein Administrator, der Gerätezugang ist sonst nur Mitglied. Für den Aufbau wird derselbe Name mit demselben
# Passwort für AUFBAU_MIN Minuten auch Administrator (CouchDB nimmt einen Administrator aus den Einstellungen vor dem Benutzer in
# _users), danach wieder nur Mitglied; das Gerät ändert dafür nichts. Geöffnet vom ersten „verbinden“ nach dem Anlegen der Datenbank
# (AUFBAU_ERSTES, eine Datei von root; nie nach etwas in der Datenbank, das ein Mitglied ändern kann) oder von Hand mit „aufbauen“.
# Das Ende steht nur in AUFBAU (root). Geschlossen von einem Zeitgeber; ging der verloren (Neustart), schließt „aufbau-pruefen“ es:
# beim Start (studium-server-livesync-aufbau.service), täglich (studium-server aktualisieren), bei jedem Update und „verbinden“.
aufbau_oeffnen() {
  local d name
  name=$(wert geraet_benutzer)
  [ -n "$name" ] || return 0
  d=$(mktemp -d)
  # als JSON-Text ("…"): -r oder -j gäben das Passwort roh aus, das nimmt CouchDB nicht an
  (umask 077 && wert geraet_passwort | jq -R . >"$d/passwort.json")
  if [ "$(code -X PUT -H 'Content-Type: application/json' --data-binary "@$d/passwort.json" "$COUCH/_node/_local/_config/admins/$name")" != 200 ]; then
    rm -rf "$d"
    fehler "Aufbau-Fenster ließ sich nicht öffnen"
  fi
  rm -rf "$d"
  echo $(($(date +%s) + AUFBAU_MIN * 60)) >"$AUFBAU"
  systemctl stop "$AUFBAU_EINHEIT.timer" 2>/dev/null || true
  zeitgeber $((AUFBAU_MIN * 60))
  echo "Die nächsten $AUFBAU_MIN Minuten darf ein Gerät den Tresor auf dem Server neu aufbauen („Initialise or overwrite the remote“)."
}
# Zeitgeber, der das Fenster in $1 Sekunden schließt (nur, wenn keiner läuft)
zeitgeber() {
  systemctl is-active --quiet "$AUFBAU_EINHEIT.timer" 2>/dev/null && return 0
  systemctl reset-failed "$AUFBAU_EINHEIT.service" 2>/dev/null || true
  systemd-run --quiet --unit="$AUFBAU_EINHEIT" --on-active="${1}s" /bin/bash "$PAKET/livesync.sh" aufbau-ende \
    || echo "Zeitgeber ließ sich nicht stellen; das Fenster schließt beim nächsten Update, Start oder täglichen Lauf." >&2
}
aufbau_ende() {
  local name
  name=$(wert geraet_benutzer)
  [ -n "$name" ] || { rm -f "$AUFBAU"; return 0; }
  case "$(code -X DELETE "$COUCH/_node/_local/_config/admins/$name")" in
    200|404) rm -f "$AUFBAU" ;;
    *) fehler "Aufbau-Fenster ließ sich nicht schließen (CouchDB läuft?)" ;;
  esac
}
# Offen (Ende in AUFBAU noch nicht erreicht): Zeitgeber für den Rest stellen. Sonst schließen, auch ohne Datei (ein Abbruch zwischen
# Öffnen und Datei): DELETE ist wiederholbar, 404 heißt schon zu. Antwortet CouchDB nicht, bleibt AUFBAU für den nächsten Versuch;
# läuft CouchDB gar nicht (etwa gleich nach dem Start), endet es still, und der tägliche Lauf prüft wieder.
aufbau_pruefen() {
  local bis jetzt
  [ -f "$LS_KONFIG" ] && [ -n "$(wert geraet_benutzer)" ] || return 0
  bis=$(tr -dc '0-9' <"$AUFBAU" 2>/dev/null | head -c 12 || true)
  jetzt=$(date +%s)
  if [ -n "$bis" ] && [ "$jetzt" -lt "$bis" ]; then zeitgeber $((bis - jetzt)); return 0; fi
  if ! systemctl is-active --quiet couchdb; then echo "CouchDB läuft nicht; Aufbau-Fenster beim nächsten Mal prüfen."; return 0; fi
  couch_bereit
  aufbau_ende
}

einschalten() {
  local adresse seite
  ziel
  grep -q '^import /etc/caddy/studium-server.d/' /etc/caddy/Caddyfile 2>/dev/null \
    || fehler "das Server-Paket ist zu alt; erst aktualisieren (Cloud Shell: bash ~/studium-autopilot/server/fern.sh aktualisieren --jetzt)"

  schritt "Zugangsdaten"
  if [ -f "$LS_KONFIG" ]; then
    echo "schon da"
  else
    # Administrator admin nur auf dem Server (Einrichten, Aufbau-Fenster); die Geräte bekommen den Gerätezugang (unten). e2ee
    # verschlüsselt den Tresor zusätzlich in der Datenbank.
    LS_KONFIG="$LS_KONFIG" LS_ADRESSE="$adresse" node "$PAKET/livesync.mjs" konfig-neu
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
  absichern

  schritt "CouchDB für LiveSync einstellen"
  # Nur neu schreiben, wenn sich außer [admins] etwas ändert (CouchDB hat das Passwort dort durch einen Hash ersetzt), oder wenn das
  # Passwort aus livesync.json nicht mehr gilt (etwa ein abgebrochenes „erneuern“)
  if [ -e "$INI" ] && diff -q <(couch_lesen "$INI" | sed '/^\[admins\]/,$d') <(ini_text | sed '/^\[admins\]/,$d') >/dev/null; then
    echo "unverändert"
  else
    ini_schreiben
    echo "geschrieben"
  fi
  systemctl enable -q couchdb
  systemctl is-active --quiet couchdb || systemctl start couchdb
  couch_bereit
  if [ "$(code "$COUCH/")" = 401 ]; then
    echo "Passwort des Administrators aus $LS_KONFIG neu gesetzt"
    ini_schreiben
    couch_bereit
  fi

  schritt "Datenbank"
  case "$(code -X PUT "$COUCH/$(wert datenbank)")" in
    201|202) echo "angelegt"; : >"$AUFBAU_ERSTES" ;;
    412) echo "schon da" ;;
    *) fehler "Datenbank ließ sich nicht anlegen" ;;
  esac
  geraetezugang

  schritt "Caddy ($adresse)"
  adresse_nachziehen
  # Das Zertifikat holt Caddy beim ersten Aufruf; bis zu 2 Minuten. / mit Anmeldung (/_up gibt Caddy nicht mehr nach außen)
  for i in $(seq 1 24); do
    [ "$(code --max-time 10 "$adresse/")" = 200 ] && break
    sleep 5
    [ "$i" -lt 24 ] || fehler "$adresse ist von außen nicht erreichbar (journalctl -u caddy)"
  done
  echo "erreichbar"

  # Marke als studium (root legt nichts in einem Ordner an, den ein anderer Benutzer ändert)
  sudo -u studium sh -c 'umask 077 && : >>"$1"' - "$DATEN/livesync-an"
  sudo -u studium env STUDIUM_SERVER_DATEN="$DATEN" node "$PAKET/zustand.mjs" >/dev/null || true
}

an_noetig() {
  [ -f "$LS_KONFIG" ] && [ -f "$DATEN/livesync-an" ] || fehler "LiveSync ist noch nicht eingeschaltet; erst einschalten (Cloud Shell: bash ~/studium-autopilot/server/fern.sh livesync)"
}

verbinden() {
  an_noetig
  adresse_nachziehen
  geraetezugang
  aufbau_pruefen
  # Datenbank neu (seit dem Anlegen noch kein Link): Das Gerät, das diesen Link zuerst öffnet, legt den Tresor auf dem Server an und
  # braucht dafür das Fenster. Nur einmal; danach von Hand mit „aufbauen“.
  if [ -f "$AUFBAU_ERSTES" ]; then aufbau_oeffnen; rm -f "$AUFBAU_ERSTES"; fi
  local paket code kennung link
  paket=$(node "$PAKET/livesync.mjs" link "$LS_KONFIG")
  code=$(jq -r '.code' <<<"$paket")
  # Der lange Setup-Link geht nur über die Pipe an den Benutzer des Web-Dienstes (web/livesync-links/); angezeigt wird der kurze
  kennung=$(jq -r '.link' <<<"$paket" | sudo -u studium-web env STUDIUM_SERVER_DATEN="$DATEN" node "$PAKET/livesync.mjs" ablegen | jq -r '.kennung')
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

# Neue Zugangsdaten (server/README.md, „LiveSync“, „Zugangsdaten erneuern“): neues Passwort für den Administrator, neuer Gerätezugang
# (Name geraet). Mit --neue-passphrase auch ein neuer Schlüssel für die Ende-zu-Ende-Verschlüsselung; die Datenbank wird dafür
# geleert, denn mit dem alten Schlüssel Verschlüsseltes kann kein Gerät mit dem neuen lesen. livesync.json zuerst (ein Abbruch
# danach: „livesync einschalten“ setzt die Werte daraus), dann CouchDB, dann der Gerätezugang.
erneuern() {
  local passphrase=0
  case "${1:-}" in
    "") ;;
    --neue-passphrase) passphrase=1 ;;
    *) echo "Aufruf: sudo studium-server livesync-erneuern [--neue-passphrase]" >&2; exit 2 ;;
  esac
  an_noetig
  LS_KONFIG="$LS_KONFIG" LS_PASSPHRASE="$passphrase" node "$PAKET/livesync.mjs" erneuern
  chown root:root "$LS_KONFIG"
  chmod 0600 "$LS_KONFIG"
  systemctl stop "$AUFBAU_EINHEIT.timer" 2>/dev/null || true
  rm -f "$AUFBAU"
  # schreibt [admins] neu: Das Passwort des Administrators gilt sofort, ein offenes Aufbau-Fenster ist zu
  ini_schreiben
  couch_bereit
  if [ "$passphrase" -eq 1 ]; then
    case "$(code -X DELETE "$COUCH/$(wert datenbank)")" in 200|202|404) ;; *) fehler "Datenbank ließ sich nicht leeren" ;; esac
    case "$(code -X PUT "$COUCH/$(wert datenbank)")" in 201|202) : >"$AUFBAU_ERSTES" ;; *) fehler "Datenbank ließ sich nicht neu anlegen" ;; esac
  fi
  geraetezugang
  if [ "$passphrase" -eq 1 ]; then
    cat <<'TEXT'

Neue Zugangsdaten und ein neuer Schlüssel für die Verschlüsselung gelten ab jetzt; der Tresor auf dem Server ist leer (auf den
Geräten ist alles noch da). LiveSync gleicht auf keinem Gerät mehr ab, bis es den neuen Link hat:
  1. Zuerst das Gerät mit dem aktuellsten Tresor: neuer Link (sudo studium-server livesync verbinden, in der Cloud Shell
     bash ~/studium-autopilot/server/fern.sh livesync verbinden), auf dem Gerät öffnen, Code eintippen, bei „Mostly Complete:
     Decision Required“ „Initialise or overwrite the remote“ wählen. Das lädt den Tresor wieder hoch.
  2. Dann jedes weitere Gerät mit einem eigenen neuen Link, dort „Join this device“ wählen.
TEXT
  else
    cat <<'TEXT'

Neue Zugangsdaten für LiveSync gelten ab jetzt, die alten (auch die eines Links von früher) nicht mehr. Der Schlüssel der
Verschlüsselung und der Tresor auf dem Server bleiben. Auf jedem Gerät mit LiveSync:
  1. Einen neuen Link holen: sudo studium-server livesync verbinden (in der Cloud Shell:
     bash ~/studium-autopilot/server/fern.sh livesync verbinden); jedes Gerät braucht einen eigenen.
  2. Auf dem Gerät öffnen und den Code eintippen wie beim ersten Mal; bei „Mostly Complete: Decision Required“
     „Join this device“ wählen (nicht „overwrite“). Die Notizen bleiben.
Bis dahin zeigt LiveSync auf dem Gerät einen Fehler bei der Anmeldung.
TEXT
  fi
}

case "${1:-}" in
  "") [ -f "$DATEN/livesync-an" ] || einschalten; verbinden ;;
  einschalten) einschalten ;;
  verbinden) verbinden ;;
  aufbauen) an_noetig; geraetezugang; aufbau_oeffnen ;;
  aufbau-ende) [ ! -f "$LS_KONFIG" ] || aufbau_ende ;;
  aufbau-pruefen) aufbau_pruefen ;;
  erneuern) shift; erneuern "$@" ;;
  # ruft der Installer bei jeder Installation auf: Ein Fehler beim Aufbau-Fenster (CouchDB gerade aus) hält ihn nicht auf
  adresse) adresse_nachziehen; (aufbau_pruefen) || echo "Aufbau-Fenster nicht geprüft; beim nächsten Mal." >&2 ;;
  absichern) absichern ;;
  *) echo "Aufruf: sudo studium-server livesync [einschalten|verbinden|aufbauen]" >&2; exit 2 ;;
esac
