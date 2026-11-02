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
