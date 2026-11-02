#!/usr/bin/env bash
# start.sh: die Einrichtung des eigenen Servers in der Oracle Cloud Shell mit einem Befehl (server/README.md, „start.sh“; Skill
# server-einrichten). Holt das Server-Paket dieser Version (geprüft gegen die Prüfsumme im Release) und geht dann der Reihe nach
# durch: Bestand, Schutz vor Kosten, Netz, Schlüssel (mit Kopie im eigenen Konto), Server oder Platzsucher, Abschließen,
# Installieren, Claude auf dem Server, Obsidian verbinden, erster Lauf, Kostenprüfung. Jeder Schritt erkennt, was schon erledigt
# ist; weiter geht es immer mit demselben Befehl. Die letzte Zeile sagt, wie es weitergeht: [fertig] oder
# [halt:<schritt>:<grund>] (Bedeutung im Skill, schritte.md).
# Entscheidungen bleiben beim Menschen: nie --ja, nie ssh-keygen -R, nie einen anderen Schlüssel an den festen Ort kopieren, nie
# das Uni-Passwort. Angelegt wird im Konto nur über einrichten.mjs.
#   bash ~/studium-autopilot/start.sh [--mail <adresse>] [--paket-da]
#   --mail      Adresse für die Warnungen von Oracle (nur beim ersten Mal nötig; danach steht sie im Budget)
#   --paket-da  das Paket in ~/studium-autopilot/server nicht neu laden (Testpaket vor einem Release, Tests)
# Exit: 0 [fertig], 3 [halt:…] (ein Mensch oder Warten ist dran), 1 unerwarteter Fehler ([halt:<schritt>:fehler]).
set -uo pipefail

main() {
  ORDNER="$HOME/studium-autopilot"
  MAIL=""
  PAKET_DA=0
  while [ $# -gt 0 ]; do
    case "$1" in
      --mail) MAIL="${2:-}"; shift 2 ;;
      --paket-da) PAKET_DA=1; shift ;;
      *) echo "Unbekannte Angabe: $1" >&2; echo "[halt:start:aufruf]"; exit 1 ;;
    esac
  done
  [ -z "$MAIL" ] || [[ "$MAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] || { echo "[halt:start:mail]"; exit 3; }
  mkdir -p "$ORDNER" && cd "$ORDNER" || fehler start
  # Nie zwei Läufe zugleich (zwei Tabs der Cloud Shell)
  exec 8>"$ORDNER/.start.lock"
  if command -v flock >/dev/null && ! flock -n 8; then halt start laeuft-schon; fi
  VERGROESSERT=0

  paket
  bestand
  schutz
  netz
  schluessel
  server
  abschliessen
  installieren
  claude_anmelden
  verbinden
  erster_lauf
  kosten
  echo
  echo "[fertig]"
  exit 0
}

halt() { echo; echo "[halt:$1:$2]"; exit 3; }
fehler() { echo; echo "[halt:$1:fehler]"; exit 1; }
schritt() { printf '\n== %s\n' "$*"; }
einrichten() { node "$ORDNER/server/einrichten.mjs" "$@"; }
fern() { bash "$ORDNER/server/fern.sh" "$@"; }
# Befehl ausführen, Ausgabe zeigen und in AUS merken; Rückgabe: sein Exit
lauf() {
  local datei c
  datei=$(mktemp)
  "$@" 2>&1 | tee "$datei"
  c=${PIPESTATUS[0]}
  AUS=$(cat "$datei")
  rm -f "$datei"
  return "$c"
}
warte_minute() { echo "$1 Nächster Versuch in einer Minute."; sleep 60; }

paket() {
  schritt "Server-Paket"
  if [ "$PAKET_DA" -eq 1 ]; then
    [ -f server/einrichten.mjs ] || fehler paket
    echo "vorhandenes Paket: $(cat server/VERSION 2>/dev/null)"
    return
  fi
  local info url summe
  info=$(curl -fsSL https://api.github.com/repos/studium-autopilot/ecoba/releases/tags/v0.7.7) || halt paket netz
  url=$(jq -r '.assets[] | select(.name == "studium-server.tar.gz") | .browser_download_url' <<<"$info")
  summe=$(jq -r '.assets[] | select(.name == "studium-server.tar.gz") | .digest // empty' <<<"$info")
  [[ "$url" == https://github.com/studium-autopilot/ecoba/releases/download/* ]] && [[ "$summe" =~ ^sha256:[0-9a-f]{64}$ ]] || halt paket pruefsumme
  curl -fsSL "$url" -o studium-server.tar.gz.neu || { rm -f studium-server.tar.gz.neu; halt paket netz; }
  echo "${summe#sha256:}  studium-server.tar.gz.neu" | sha256sum -c --quiet - || { rm -f studium-server.tar.gz.neu; halt paket pruefsumme; }
  mv -f studium-server.tar.gz.neu studium-server.tar.gz
  rm -rf server && tar -xzf studium-server.tar.gz || fehler paket
  echo "Paket $(cat server/VERSION) geladen und geprüft."
}

bestand() {
  schritt "Bestand im Oracle-Konto"
  node server/stand.mjs
  [ $? -ne 2 ] || halt stand unvollstaendig
}

schutz() {
  schritt "Schutz vor Kosten"
  local args=()
  [ -z "$MAIL" ] || args=(--mail "$MAIL")
  lauf einrichten schutz "${args[@]}"
  case $? in
    0) ;;
    2) if grep -q -- '--mail' <<<"$AUS"; then halt schutz mail; else halt schutz frage; fi ;;
    *) fehler schutz ;;
  esac
}

netz() {
  schritt "Netz"
  lauf einrichten netz || fehler netz
}

schluessel() {
  schritt "Schlüssel zum Server"
  if [ ! -f "$HOME/.ssh/studium_autopilot" ]; then
    lauf einrichten schluessel-holen || fehler schluessel
  fi
  if [ ! -f "$HOME/.ssh/studium_autopilot" ]; then
    # RSA, weil die Cloud Shell ed25519 ablehnt (FIPS); alle späteren Schritte erwarten genau diese Datei
    mkdir -p "$HOME/.ssh" && chmod 700 "$HOME/.ssh"
    ssh-keygen -q -t rsa -b 4096 -N "" -C studium-autopilot -f "$HOME/.ssh/studium_autopilot" || fehler schluessel
    echo "Neuer Schlüssel unter ~/.ssh/studium_autopilot."
  fi
  lauf einrichten schluessel-sichern
  case $? in
    0) ;;
    2) halt schluessel abweichend ;;
    *) fehler schluessel ;;
  esac
}

server() {
  schritt "Server"
  lauf einrichten server --schluessel "$HOME/.ssh/studium_autopilot.pub"
  case $? in
    0) ;;
    3) platzsucher ;;
    1) if grep -q 'passt nicht' <<<"$AUS"; then halt server passt-nicht; else fehler server; fi ;;
    *) fehler server ;;
  esac
}

platzsucher() {
  schritt "Platzsucher"
  lauf einrichten platzsucher --schluessel "$HOME/.ssh/studium_autopilot.pub"
  case $? in
    0) halt platzsucher sucht ;;
    3) halt platzsucher kein-platz ;;
    2) if grep -q -- '--mail' <<<"$AUS"; then halt platzsucher mail; else fehler platzsucher; fi ;;
    1) if grep -qE '^\[(angehalten|still)\]' <<<"$AUS"; then halt platzsucher angehalten; else fehler platzsucher; fi ;;
    *) fehler platzsucher ;;
  esac
}

abschliessen() {
  schritt "Abschließen"
  local i c=0
  for i in 1 2 3 4 5 6 7 8 9 10; do
    lauf einrichten abschliessen
    c=$?
    [ "$c" -eq 2 ] || break
    [ "$i" -eq 10 ] || warte_minute "Der Platzsucher räumt noch auf."
  done
  case $c in
    0) ;;
    2) halt abschliessen helfer-laeuft ;;
    *) fehler abschliessen ;;
  esac
  ! grep -q '^\[vergroessert\]' <<<"$AUS" || VERGROESSERT=1
}

installieren() {
  schritt "Installieren"
  local i c=0
  for i in 1 2 3 4 5 6 7 8 9 10; do
    lauf fern installieren
    c=$?
    case $c in
      4) if grep -q 'STOPPED' <<<"$AUS"; then halt server gestoppt; fi ;;
      5) ;;
      *) break ;;
    esac
    [ "$i" -eq 10 ] || warte_minute "Der Server ist noch nicht so weit."
  done
  case $c in
    0) ;;
    4|5) halt installieren warten ;;
    6) halt installieren hostschluessel ;;
    2) if grep -q '^\[anderer\]' <<<"$AUS"; then halt installieren schluessel-kopieren; else fehler installieren; fi ;;
    1) if grep -q '^\[fehlt\] Kein Schlüssel' <<<"$AUS"; then halt installieren schluessel-fehlt; else fehler installieren; fi ;;
    *) fehler installieren ;;
  esac
  if [ "$VERGROESSERT" -eq 1 ]; then
    # Ubuntu vergrößert das Dateisystem beim Start auf das größere Boot-Volume
    fern neustart || fehler neustart
    sleep 30
    for i in 1 2 3 4 5 6 7 8 9 10; do
      fern status >/dev/null 2>&1 && return
      [ "$i" -eq 10 ] || warte_minute "Der Server startet noch."
    done
    halt neustart warten
  fi
}

# Öffentlicher Status des Servers (ohne persönliche Daten); Caddy holt beim ersten Abruf das Zertifikat, darum mit Wiederholung
status_lesen() {
  local adresse i
  adresse=$(einrichten adresse --json 2>/dev/null | jq -r '.adresse // empty')
  [ -n "$adresse" ] || return 1
  for i in 1 2 3 4 5; do
    STATUS=$(curl -fsS --max-time 20 "$adresse/v1/status") && return 0
    sleep 10
  done
  return 1
}
feld() { jq -r "$1" <<<"$STATUS"; }

claude_anmelden() {
  schritt "Claude auf dem Server"
  status_lesen || halt status nicht-erreichbar
  if [ "$(feld '.claude')" = angemeldet ]; then echo "Claude ist auf dem Server angemeldet."; return; fi
  # Die Anmeldung fragt einen Code ab: nur in einem Terminal
  [ -t 0 ] && [ -t 1 ] || halt claude anmelden
  echo "[mensch:claude-anmelden] Link öffnen, anmelden und Autorisieren, dann den Code hier einfügen."
  fern claude-anmelden
  status_lesen || halt status nicht-erreichbar
  [ "$(feld '.claude')" = angemeldet ] || halt claude anmelden
}

verbinden() {
  schritt "Obsidian verbinden"
  if [ "$(feld '.plugin_abruf // empty')" != "" ]; then echo "Obsidian holt schon ab."; return; fi
  # Die Adresse aus dem Konto: Claude vergleicht sie mit der im Link, bevor es ihn öffnet (schritte.md, Schritt 6)
  einrichten adresse | grep '^\[da\] Server' || fehler verbinden
  fern verbinden || fehler verbinden
  halt verbinden link
}

erster_lauf() {
  schritt "Erster Lauf"
  if [ "$(feld '.letzter_lauf.ok')" = true ]; then echo "Der letzte Lauf ging gut."; return; fi
  if [ "$(feld '.letzter_lauf // empty')" = "" ] && [ "$(feld '.claude_lauf')" = ruht ]; then
    fern jetzt || fehler lauf
  fi
  echo "Claude läuft; das dauert einige Minuten."
  local i
  for i in $(seq 1 30); do
    sleep 30
    status_lesen || continue
    [ "$(feld '.claude_lauf')" = ruht ] || continue
    case "$(feld '.letzter_lauf.ok')" in
      true) echo "Der erste Lauf ging gut."; return ;;
      false) fern lauf; halt lauf fehler ;;
    esac
  done
  halt lauf laeuft
}

kosten() {
  schritt "Kostenprüfung"
  node server/stand.mjs --kosten
  case $? in
    0) ;;
    2) halt kosten unvollstaendig ;;
    *) halt kosten befund ;;
  esac
}

main "$@"
