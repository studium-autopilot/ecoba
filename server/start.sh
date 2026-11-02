#!/usr/bin/env bash
# start.sh: die Einrichtung des eigenen Servers in der Oracle Cloud Shell mit einem Befehl (server/README.md, „start.sh“; Skill
# server-einrichten). Holt das Server-Paket dieser Version (geprüft gegen die Prüfsumme im Release und die Signatur mit den Schlüsseln
# unten, nie aus dem Download) und geht dann der Reihe nach
# durch: Bestand, Schutz vor Kosten, Netz, Schlüssel (mit Kopie im eigenen Konto), Server oder Platzsucher, Abschließen,
# Installieren, Claude auf dem Server, Obsidian verbinden, erster Lauf, Kostenprüfung. Jeder Schritt erkennt, was schon erledigt
# ist; weiter geht es immer mit demselben Befehl. Die letzte Zeile sagt, wie es weitergeht: [fertig] oder
# [halt:<schritt>:<grund>] (Bedeutung im Skill, schritte.md).
# Entscheidungen bleiben beim Menschen: nie --ja, nie ssh-keygen -R, nie einen anderen Schlüssel an den festen Ort kopieren, nie
# das Uni-Passwort. Angelegt wird im Konto nur über einrichten.mjs.
#   bash ~/studium-autopilot/start.sh [--mail <adresse>] [--paket-da]
#   --mail      Adresse für die Warnungen von Oracle (nur beim ersten Mal nötig; danach steht sie im Budget)
#   --paket-da  das Paket in ~/studium-autopilot/server nicht neu laden (Testpaket vor einem Release, Tests); fern.sh nimmt dann
#               auch ein Paket mit Signatur für Tests (Namensraum studium-server-test) an
# Exit: 0 [fertig], 3 [halt:…] (ein Mensch oder Warten ist dran), 1 unerwarteter Fehler ([halt:<schritt>:fehler]).
set -uo pipefail

# Wer Server-Pakete signieren darf: dieselben Schlüssel wie server/allowed_signers (tests/paket-pruefen.test.js vergleicht), hier fest
# im Skript, denn das Paket, das sie prüfen, ist noch nicht da. NAMENSRAUM setzt release.py für Test- und Beta-Pakete auf
# studium-server-test (docs/release.md, „Test- und Beta-Pakete“).
SIGNIERSCHLUESSEL=('ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIBVvg98K+YQb1YhQFh5w2EE4QEs8QG7gN3jRK6G8pzjc')
NAMENSRAUM=studium-server

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
# Testpaket (--paket-da) oder Beta (Namensraum studium-server-test): fern.sh installieren nimmt auch dessen Signatur an
fern() {
  if [ "$PAKET_DA" -eq 1 ] || [ "$NAMENSRAUM" != studium-server ]; then STUDIUM_TESTPAKET=1 bash "$ORDNER/server/fern.sh" "$@"
  else bash "$ORDNER/server/fern.sh" "$@"; fi
}
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
  local info url summe sig tag d
  info=$(curl -fsSL https://api.github.com/repos/studium-autopilot/ecoba/releases/tags/v0.7.9) || halt paket netz
  url=$(jq -r '.assets[] | select(.name == "studium-server.tar.gz") | .browser_download_url' <<<"$info")
  summe=$(jq -r '.assets[] | select(.name == "studium-server.tar.gz") | .digest // empty' <<<"$info")
  sig=$(jq -r '.assets[] | select(.name == "studium-server.tar.gz.sig") | .browser_download_url' <<<"$info")
  tag=$(jq -r '.tag_name // empty' <<<"$info")
  [[ "$url" == https://github.com/studium-autopilot/ecoba/releases/download/* ]] && [[ "$summe" =~ ^sha256:[0-9a-f]{64}$ ]] || halt paket pruefsumme
  [[ "$sig" == https://github.com/studium-autopilot/ecoba/releases/download/* ]] || halt paket signatur
  rm -f studium-server.tar.gz.neu studium-server.tar.gz.sig.neu
  curl -fsSL "$url" -o studium-server.tar.gz.neu && curl -fsSL "$sig" -o studium-server.tar.gz.sig.neu \
    || { rm -f studium-server.tar.gz.neu studium-server.tar.gz.sig.neu; halt paket netz; }
  echo "${summe#sha256:}  studium-server.tar.gz.neu" | sha256sum -c --quiet - || { rm -f studium-server.tar.gz.neu studium-server.tar.gz.sig.neu; halt paket pruefsumme; }
  signatur_gueltig studium-server.tar.gz.neu studium-server.tar.gz.sig.neu "$NAMENSRAUM" \
    || { rm -f studium-server.tar.gz.neu studium-server.tar.gz.sig.neu; halt paket signatur; }
  # Erst in einen eigenen Ordner: Die Version im signierten Paket muss der Tag des Releases sein (ein altes signiertes Paket unter
  # einem neuen Release gilt nicht), sonst bleibt der bisherige Ordner server/
  d=$(mktemp -d "$ORDNER/.paket.XXXXXX") || fehler paket
  tar -xzf studium-server.tar.gz.neu -C "$d" || { rm -rf "$d"; fehler paket; }
  if [ -z "$tag" ] || [ "$(tr -d '[:space:]' <"$d/server/VERSION" 2>/dev/null)" != "${tag#v}" ]; then
    rm -rf "$d" studium-server.tar.gz.neu studium-server.tar.gz.sig.neu
    halt paket version
  fi
  mv -f studium-server.tar.gz.neu studium-server.tar.gz
  mv -f studium-server.tar.gz.sig.neu studium-server.tar.gz.sig
  rm -rf server && mv "$d/server" server && rm -rf "$d" || fehler paket
  echo "Paket $(cat server/VERSION) geladen und geprüft (Prüfsumme, Signatur)."
}

# Signatur des Pakets (docs/release.md, „Signatur des Server-Pakets“) mit den Schlüsseln oben im Namensraum $3: zuerst ssh-keygen -Y
# verify. Die Cloud Shell kann das oft nicht (FIPS-Modus: OpenSSH lehnt ed25519 ab; Oracle Linux 8 hat OpenSSH 8.0 ohne -Y); dann
# prüft Node.js mit dem Prüfer unten. Gültig ist das Paket, wenn eins von beiden es bestätigt.
signatur_gueltig() {
  local d s c=1
  d=$(mktemp -d) || return 1
  for s in "${SIGNIERSCHLUESSEL[@]}"; do printf 'release@studium-autopilot namespaces="%s" %s\n' "$3" "$s"; done >"$d/erlaubt"
  if ssh-keygen -Y verify -f "$d/erlaubt" -I release@studium-autopilot -n "$3" -s "$2" <"$1" >/dev/null 2>&1; then
    c=0
  else
    pruefer >"$d/pruefen.mjs"
    node "$d/pruefen.mjs" "$d/erlaubt" release@studium-autopilot "$3" "$2" "$1" && c=0
  fi
  rm -rf "$d"
  return "$c"
}

# Prüfer für Node.js: genau server/paket-pruefen.mjs (tests/paket-pruefen.test.js vergleicht), hier eingebettet aus demselben Grund
# wie die Schlüssel
pruefer() {
  cat <<'JS'
// paket-pruefen.mjs: Signatur eines Server-Pakets (ssh-keygen -Y sign, Format SSHSIG) mit Node.js prüfen, für Orte, an denen
// ssh-keygen es nicht kann. Die Oracle Cloud Shell läuft im FIPS-Modus (ed25519 lehnt OpenSSH dort ab) und hat je nach Abbild ein
// OpenSSH ohne -Y (vor 8.1). start.sh und fern.sh fragen zuerst ssh-keygen; sagt es nicht „gültig“, entscheidet dieses Skript.
// start.sh trägt dieselben Zeilen fest in sich (dort ist noch kein Paket da, dem es trauen könnte); tests/paket-pruefen.test.js
// prüft, dass beide gleich sind, und das Ergebnis gegen ssh-keygen.
//
// Geprüft wird wie bei ssh-keygen -Y verify: Format und Version, Namensraum, der Schlüssel in der Signatur steht in den erlaubten
// Zeilen für Prinzipal und Namensraum, und die Ed25519-Signatur über „SSHSIG“, Namensraum, Hash-Verfahren und Hash des Pakets.
// Nur ssh-ed25519 (der Schlüssel der Releases). Ed25519 rechnet zuerst OpenSSL über node:crypto; lehnt es das Verfahren ab (FIPS),
// rechnet ein eigener Prüfer nach RFC 8032 (BigInt, nur öffentliche Daten, darum ohne Schutz gegen Zeitmessung).
//
//   node paket-pruefen.mjs <erlaubt> <prinzipal> <namensraum> <signatur> <paket>   Exit 0 gültig, 1 ungültig, 2 Aufruf
//   (<erlaubt> im Format von allowed_signers: prinzipal namespaces="…" ssh-ed25519 <base64>)
import { createHash, createPublicKey, verify } from "node:crypto";
import { readFileSync, realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

// ---------- Ed25519 nach RFC 8032 ----------
const P = 2n ** 255n - 19n;
const L = 2n ** 252n + 27742317777372353535851937790883648493n;
const m = (a) => { const r = a % P; return r >= 0n ? r : r + P; };
const pot = (b, e) => {
  let r = 1n;
  b = m(b);
  while (e > 0n) {
    if (e & 1n) r = (r * b) % P;
    b = (b * b) % P;
    e >>= 1n;
  }
  return r;
};
const inv = (x) => pot(x, P - 2n);
const D = m(-121665n * inv(121666n));
const WURZEL_MINUS_1 = pot(2n, (P - 1n) / 4n);
const zahl = (bytes) => bytes.reduceRight((n, b) => (n << 8n) | BigInt(b), 0n);
const bytesVon = (n) => Buffer.from(Array.from({ length: 32 }, (_, i) => Number((n >> BigInt(8 * i)) & 255n)));
// Punkte in erweiterten Koordinaten [X, Y, Z, T]; Addition nach RFC 8032, 5.1.4 (gilt auch für das Verdoppeln)
const plus = ([X1, Y1, Z1, T1], [X2, Y2, Z2, T2]) => {
  const a = m((Y1 - X1) * (Y2 - X2)), b = m((Y1 + X1) * (Y2 + X2)), c = m(2n * D * T1 * T2), d = m(2n * Z1 * Z2);
  const e = m(b - a), f = m(d - c), g = m(d + c), h = m(b + a);
  return [m(e * f), m(g * h), m(f * g), m(e * h)];
};
const mal = (p, n) => {
  let q = [0n, 1n, 1n, 0n];
  while (n > 0n) {
    if (n & 1n) q = plus(q, p);
    p = plus(p, p);
    n >>= 1n;
  }
  return q;
};
const kodieren = ([X, Y, Z]) => {
  const z = inv(Z), x = m(X * z), y = m(Y * z);
  return bytesVon(y | ((x & 1n) << 255n));
};
// RFC 8032, 5.1.3; null, wenn die Bytes keinen Punkt beschreiben
const punkt = (bytes) => {
  if (bytes.length !== 32) return null;
  const n = zahl(bytes), y = n & ((1n << 255n) - 1n), vorzeichen = n >> 255n;
  if (y >= P) return null;
  const u = m(y * y - 1n), v = m(D * y * y + 1n);
  let x = m(u * pot(v, 3n) * pot(u * pot(v, 7n), (P - 5n) / 8n));
  const vx2 = m(v * x * x);
  if (vx2 !== u) {
    if (vx2 !== m(-u)) return null;
    x = m(x * WURZEL_MINUS_1);
  }
  if (x === 0n && vorzeichen === 1n) return null;
  if ((x & 1n) !== vorzeichen) x = m(-x);
  return [x, y, 1n, m(x * y)];
};
const BASIS = punkt(bytesVon(m(4n * inv(5n))));

// Ed25519-Signatur (64 Byte) über nachricht mit dem öffentlichen Schlüssel (32 Byte) prüfen, nach RFC 8032, 5.1.7: S < L, A ein
// Punkt, und [S]B − [k]A muss genau die Bytes von R ergeben (wie ref10 in OpenSSH)
export function ed25519Pruefen(schluessel, nachricht, signatur) {
  if (schluessel.length !== 32 || signatur.length !== 64) return false;
  const A = punkt(schluessel);
  const S = zahl(signatur.subarray(32));
  if (!A || S >= L) return false;
  const R = signatur.subarray(0, 32);
  const k = zahl(createHash("sha512").update(R).update(schluessel).update(nachricht).digest()) % L;
  const [X, Y, Z, T] = mal(A, k);
  return kodieren(plus(mal(BASIS, S), [m(-X), Y, Z, m(-T)])).equals(R);
}

function ed25519(schluessel, nachricht, signatur) {
  try {
    const k = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: schluessel.toString("base64url") }, format: "jwk" });
    return verify(null, nachricht, k, signatur);
  } catch (e) {
    return ed25519Pruefen(schluessel, nachricht, signatur);
  }
}

// ---------- SSHSIG (PROTOCOL.sshsig in OpenSSH) ----------
const leser = (buf) => {
  let i = 0;
  const u32 = () => {
    if (i + 4 > buf.length) throw new Error("zu kurz");
    i += 4;
    return buf.readUInt32BE(i - 4);
  };
  const text = () => {
    const n = u32();
    if (i + n > buf.length) throw new Error("zu kurz");
    i += n;
    return buf.subarray(i - n, i);
  };
  return { u32, text, roh: (n) => { if (i + n > buf.length) throw new Error("zu kurz"); i += n; return buf.subarray(i - n, i); }, ende: () => i === buf.length };
};
const feld = (s) => {
  const n = Buffer.alloc(4);
  n.writeUInt32BE(s.length);
  return Buffer.concat([n, Buffer.from(s)]);
};

// Erlaubte Schlüssel aus Zeilen im Format von allowed_signers, nur der Form „prinzipal namespaces="a,b" ssh-ed25519 <base64>“
// (andere Angaben, etwa cert-authority, gelten nicht) → [{ prinzipal, namensraeume, blob }]
export function erlaubtLesen(text) {
  const liste = [];
  for (const zeile of String(text).split("\n")) {
    const r = /^(\S+)\s+namespaces="([^"]*)"\s+(ssh-ed25519)\s+([A-Za-z0-9+/]+=*)(?:\s.*)?$/.exec(zeile.trim());
    if (r) liste.push({ prinzipal: r[1], namensraeume: r[2].split(","), blob: Buffer.from(r[4], "base64") });
  }
  return liste;
}

// Gilt die Signatur (Text der .sig) für daten im namensraum, von einem Schlüssel aus erlaubt (Text) für prinzipal? eigener: nur
// der Prüfer nach RFC 8032, auch wo OpenSSL Ed25519 kann (für Tests)
export function signaturPruefen({ daten, signatur, erlaubt, prinzipal, namensraum, eigener = false }) {
  try {
    const t = /-----BEGIN SSH SIGNATURE-----([\s\S]*?)-----END SSH SIGNATURE-----/.exec(String(signatur));
    if (!t) return false;
    const r = leser(Buffer.from(t[1].replace(/\s+/g, ""), "base64"));
    if (r.roh(6).toString("latin1") !== "SSHSIG" || r.u32() !== 1) return false;
    const blob = r.text(), ns = r.text(), reserviert = r.text(), verfahren = r.text().toString("latin1"), sig = r.text();
    if (!r.ende() || ns.toString("utf8") !== namensraum || !["sha256", "sha512"].includes(verfahren)) return false;
    if (!erlaubtLesen(erlaubt).some((e) => e.prinzipal === prinzipal && e.namensraeume.includes(namensraum) && e.blob.equals(blob))) return false;
    const k = leser(blob);
    if (k.text().toString("latin1") !== "ssh-ed25519") return false;
    const schluessel = k.text();
    const s = leser(sig);
    if (!k.ende() || s.text().toString("latin1") !== "ssh-ed25519") return false;
    const roh = s.text();
    if (!s.ende()) return false;
    const nachricht = Buffer.concat([Buffer.from("SSHSIG"), feld(ns), feld(reserviert), feld(verfahren),
      feld(createHash(verfahren).update(daten).digest())]);
    return eigener ? ed25519Pruefen(schluessel, nachricht, roh) : ed25519(schluessel, nachricht, roh);
  } catch (e) {
    return false;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const a = process.argv.slice(2);
  if (a.length !== 5) {
    console.error("Aufruf: node paket-pruefen.mjs <erlaubt> <prinzipal> <namensraum> <signatur> <paket>");
    process.exit(2);
  }
  const gueltig = signaturPruefen({ erlaubt: readFileSync(a[0], "utf8"), prinzipal: a[1], namensraum: a[2],
    signatur: readFileSync(a[3], "utf8"), daten: readFileSync(a[4]) });
  console.log(gueltig ? `Gültige Signatur (Namensraum ${a[2]}).` : "Signatur ungültig.");
  process.exit(gueltig ? 0 : 1);
}
JS
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
    # RSA, weil die Cloud Shell ed25519 ablehnt (FIPS); alle späteren Schritte erwarten genau diese Datei. Ohne Passphrase, damit
    # jede neue Sitzung ohne Eingabe weiterläuft; wer ihn (hier oder im Bucket) lesen kann, verwaltet das Konto ohnehin
    # (server/README.md, „Schlüssel im Konto“)
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
    7) halt installieren signatur ;;
    10) halt installieren zurueckgerollt ;;
    11) halt installieren mindestversion ;;
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

# Stand des Servers über ssh: studium-server status --json fragt den Web-Dienst direkt auf 127.0.0.1 (der ganze Stand). Nie über
# die öffentliche Adresse: Dort braucht /v1/status den Zugangsschlüssel, sobald ein Gerät verbunden ist, und jedes „Weiter mit der
# Einrichtung“ hielte danach an. Vorher einmal https://<Adresse>/ (jede Antwort von Caddy genügt, auch 404): Caddy holt das
# Zertifikat beim ersten Abruf, darum mit Wiederholung; erst dann taugen Links für die Geräte.
status_lesen() {
  local adresse i
  adresse=$(einrichten adresse --json 2>/dev/null | jq -r '.adresse // empty')
  [ -n "$adresse" ] || return 1
  for i in 1 2 3 4 5; do
    if curl -sS --max-time 20 -o /dev/null "$adresse/" && status_holen; then return 0; fi
    sleep 10
  done
  return 1
}
# Ein Server, dessen studium-server „status --json“ noch nicht kennt, gibt die Ausgabe von „status“: vorneweg der Stand als JSON
# (jq ., endet mit einer Zeile „}“), dann die Dienste. Darum zählt immer nur der Block bis zur ersten Zeile „}“ (die Ausgabe von
# --json ist genau dieser Block): jq gäbe auf den ganzen Text schon den Wert aus dem ersten Block aus, bevor es am Rest scheitert.
status_holen() {
  STATUS=$(fern status --json 2>/dev/null) || return 1
  STATUS=$(sed -n '1,/^}$/p' <<<"$STATUS")
  [ -n "$(feld '.schema // empty' 2>/dev/null)" ]
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
