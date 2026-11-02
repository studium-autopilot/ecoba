// Studium Autopilot – schlanker Kern des Vaults (ersetzt Templater). Handgeschrieben, kein Build-Schritt.
// Aufgaben:
//  1. Beim Start alle Skripte aus System/Skripte/*.js laden (CommonJS, per eval) und die Erweiterungen starten
//     (Skripte mit `registrieren(` oder `aktionen:`). Jedes Skript bekommt das Kontextobjekt `ctx` (siehe kontextBauen).
//  2. Aktionen ausführen: Knöpfe `obsidian://studium-autopilot?aktion=<name>&…` (Klick wird im Capture-Modus abgefangen,
//     zusätzlich Protokoll-Handler), Befehle in der Befehlspalette, Ordner-Automatik für neue leere Notizen.
//  3. Hot-Reload: Geänderte Skripte werden ohne Neustart neu geladen. Vorher meldet der Kern alles ab, was die alte Fassung
//     über die Helfer in ctx angemeldet hat (ctx.an, ctx.dom, ctx.intervall, ctx.zeit, ctx.codeblock, ctx.postprozessor,
//     ctx.editor, ctx.aufraeumen), und entfernt ihre Aktionen und Befehle. Beim Entladen des Plugins dasselbe für alle Skripte.
//  4. Prüfung der Skripte: Ein Skript läuft nur, wenn seine SHA-256 in der signierten Liste System/Daten/system-dateien.json
//     (mit system-dateien.json.sig) steht, auf diesem Gerät erlaubt ist oder der Entwicklermodus an ist; beim Start und bei
//     jedem Hot-Reload. Die Signatur prüft der Kern selbst (ctx.signatur, auch für update.js). Doku: docs/architektur/skripte-pruefen.md.
// Fehler einer Erweiterung oder Aktion stoppen nie den Rest; sie erscheinen als Hinweis (Notice) und in der Konsole.
// iOS-sicher: keine Node-APIs, kein Regex-Lookbehind, kein .at()/findLast/structuredClone.
// Doku für Entwickler: docs/architektur.md im Projektordner.
"use strict";
const obsidian = require("obsidian");
const { Plugin, Modal, FuzzySuggestModal, Notice, TFile } = obsidian;

const SKRIPTE = "System/Skripte/";
const PROTOKOLL = "studium-autopilot";
const LINK = "obsidian://" + PROTOKOLL;
const CURSOR = String.fromCharCode(0xE000); // Platzhalter für die Cursor-Position in erzeugten Notizen (siehe eba.js, ablegen)
const HINWEIS_RUHE = 3000; // ms ohne neues Skript, bis der Hinweis nach dem Hot-Reload kommt (hinweisSammeln)
// CodeMirror 6 stellt Obsidian Plugins per require bereit (auch auf Mobilgeräten); für echte Editor-Erweiterungen.
const cmLaden = (name) => { try { return require(name); } catch (e) { return null; } };
const CM = { view: cmLaden("@codemirror/view"), state: cmLaden("@codemirror/state") };

// ---------- Kleine Helfer ----------
const enc = (s) => new TextEncoder().encode(s);
const dec = (b) => new TextDecoder("utf-8").decode(b);
const hat = (o, k) => !!o && typeof o === "object" && Object.prototype.hasOwnProperty.call(o, k);
const nfc = (s) => { try { return String(s).normalize("NFC"); } catch (e) { return String(s); } };
const grund = (e) => (e && e.message) || e;
const HEX = /^[0-9a-f]{64}$/;
const gleich = (a, b) => {
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
};
const sha256Hex = async (by) => {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", by));
  let s = "";
  for (let i = 0; i < h.length; i++) s += h[i].toString(16).padStart(2, "0");
  return s;
};
// Versionen X.Y.Z und Beta X.Y.Z-beta.N wie update.js (Beta vor der fertigen Version)
const semver = (s) => { const m = String(s || "").match(/^(\d{1,4})\.(\d{1,4})\.(\d{1,4})(?:-beta\.(\d{1,4}))?$/); return m ? [+m[1], +m[2], +m[3], m[4] == null ? Infinity : +m[4]] : null; };
const neuer = (a, b) => { const x = semver(a), y = semver(b); if (!x || !y) return false; for (let i = 0; i < 4; i++) { if (x[i] !== y[i]) return x[i] > y[i]; } return false; };

// ---------- Ed25519 prüfen ohne Web Crypto (Geräte ohne Ed25519 in Web Crypto: iOS bis 16, ältere WebViews) ----------
// Übernommen aus noble-ed25519 3.2.0 (npm @noble/ed25519@3.2.0, integrity
// sha512-criDgRlnUA09hchYrTy/JUWPIEap5rZxQe6wDWzRx51oWWpDRcUpuNzlgPxDJaOK6AsW9c0wKcj3rKRv6t+bPQ==), nur der Weg zum Prüfen:
// verifyAsync mit zip215: false (streng nach RFC 8032: S < L, kanonische Punkte, keine Schlüssel kleiner Ordnung), Formeln und
// Reihenfolge unverändert. Weggelassen ist nur, was das Prüfen nicht braucht: Signieren, Schlüssel erzeugen, Hex-Eingaben und die
// Vorberechnung für den Basispunkt (wNAF, laut noble abschaltbar; die Multiplikation ist dann dieselbe Schleife wie für jeden
// Punkt). Klassenfelder setzt der Konstruktor (Safari 16); Zahlen über BigInt(…) statt Literalen, damit der Kern auch ohne BigInt
// lädt (dann meldet der Prüfer „krypto“). Lizenz (MIT): THIRD_PARTY_NOTICES.md. Tests: tests/ed25519.test.js.
/*! noble-ed25519 - MIT License (c) 2019 Paul Miller (paulmillr.com) */
const ED25519 = typeof BigInt !== "function" ? Object.freeze({ verifyAsync: async () => { throw kryptoFehler("BigInt", "fehlt"); } }) : (() => {
  // Zahlen als BigInt(…), nie als BigInt-Literal: Das wäre auf einem Gerät ohne BigInt ein Syntaxfehler im ganzen Kern
  const big = BigInt;
  const _0n = big(0), _1n = big(1), _2n = big(2), _8n = big(8), _19n = big(19), _255n = big(255), _256n = big(256);
  const P = big("0x7fffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffed");
  const N = big("0x1000000000000000000000000000000014def9dea2f79cd65812631a5cf5d3ed");
  const _d = big("0x52036cee2b6ffe738cc740797779e89800700a4d4141d8ab75eb4dca135978a3");
  const Gx = big("0x216936d3cd6e53fec0a4e231fdd6dc5c692cc7609525a7b2c9562d608f25d51a");
  const Gy = big("0x6666666666666666666666666666666666666666666666666666666666666658");
  const _a = P - _1n;
  const LEN = 32;
  const B256 = _2n ** _256n;
  const P_MASK = (_1n << _255n) - _1n;
  const RM1 = big("0x2b8324804fc1df0b2b4d00993dfbd7a72f431806ad2fe478c4ee1b274a0ea0b0"); // sqrt(-1)
  const abytes = (value, length, title) => {
    if (value instanceof Uint8Array && (length === undefined || value.length === length)) return value;
    throw new RangeError('"' + title + '" expected Uint8Array' + (length !== undefined ? " of length " + length : ""));
  };
  const arange = (n, min, max) => {
    if (typeof n !== "bigint") throw new TypeError("bad number: out of range");
    if (min <= n && n < max) return n;
    throw new RangeError("bad number: out of range");
  };
  const mod = (a, b) => { const m = b === undefined ? P : b; const r = a % m; return r >= _0n ? r : m + r; };
  const modP = (num) => {
    if (num < _0n) throw new RangeError("negative coordinate");
    let r = (num >> _255n) * _19n + (num & P_MASK);
    r = (r >> _255n) * _19n + (r & P_MASK);
    return r % P;
  };
  const modN = (a) => mod(a, N);
  const bytesToHex = (bytes) => { let hex = ""; for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, "0"); return hex; };
  const bytesToNumberLE = (b) => BigInt("0x" + bytesToHex(Uint8Array.from(b).reverse()));
  const concatBytes = (teile) => {
    let sum = 0;
    for (const a of teile) sum += a.length;
    const res = new Uint8Array(sum);
    let pad = 0;
    for (const a of teile) { res.set(a, pad); pad += a.length; }
    return res;
  };
  const pow2 = (x, power) => { let r = x; while (power-- > 0) r = modP(r * r); return r; };
  const pow_2_252_3 = (x) => {
    const x2 = modP(x * x);
    const b2 = modP(x2 * x);
    const b4 = modP(pow2(b2, 2) * b2);
    const b5 = modP(pow2(b4, 1) * x);
    const b10 = modP(pow2(b5, 5) * b5);
    const b20 = modP(pow2(b10, 10) * b10);
    const b40 = modP(pow2(b20, 20) * b20);
    const b80 = modP(pow2(b40, 40) * b40);
    const b160 = modP(pow2(b80, 80) * b80);
    const b240 = modP(pow2(b160, 80) * b80);
    const b250 = modP(pow2(b240, 10) * b10);
    return modP(pow2(b250, 2) * x);
  };
  // RFC 8032 5.1.3: Wurzel für das Entpacken eines Punkts
  const uvRatio = (u, v) => {
    const v3 = modP(v * modP(v * v));
    const v7 = modP(modP(v3 * v3) * v);
    const pow = pow_2_252_3(modP(u * v7));
    let x = modP(u * modP(v3 * pow));
    const vx2 = modP(v * modP(x * x));
    const root1 = x;
    const root2 = modP(x * RM1);
    const useRoot1 = vx2 === u;
    const useRoot2 = vx2 === mod(-u);
    const noRoot = vx2 === mod(-u * RM1);
    if (useRoot1) x = root1;
    if (useRoot2 || noRoot) x = root2;
    if ((mod(x) & _1n) === _1n) x = mod(-x);
    return { isValid: useRoot1 || useRoot2, value: x };
  };
  const modL_LE = (hash) => modN(bytesToNumberLE(hash));
  // Punkt in erweiterten Koordinaten XYZT
  class Point {
    constructor(X, Y, Z, T) {
      this.X = arange(X, _0n, B256);
      this.Y = arange(Y, _0n, B256);
      this.Z = arange(Z, _1n, B256);
      this.T = arange(T, _0n, B256);
      Object.freeze(this);
    }
    // RFC 8032 5.1.3: Bytes → Punkt (zip215 = false: nur kanonische Kodierungen)
    static fromBytes(bytes, zip215) {
      const normed = Uint8Array.from(abytes(bytes, LEN, "point"));
      const lastByte = normed[31];
      normed[31] = lastByte & ~0x80;
      const y = bytesToNumberLE(normed);
      if (!zip215) arange(y, _0n, P);
      const y2 = modP(y * y);
      const u = mod(y2 - _1n);
      const v = modP(_d * y2 + _1n);
      const r = uvRatio(u, v);
      let x = r.value;
      if (!r.isValid) throw new Error("bad point: y not sqrt");
      const isLastByteOdd = !!(lastByte & 0x80);
      if (!zip215 && x === _0n && isLastByteOdd) throw new Error("bad point: x==0, isLastByteOdd");
      if (isLastByteOdd !== !!(x & _1n)) x = mod(-x);
      return new Point(x, y, _1n, modP(x * y));
    }
    equals(other) {
      return modP(this.X * other.Z) === modP(other.X * this.Z) && modP(this.Y * other.Z) === modP(other.Y * this.Z);
    }
    is0() { return this.equals(I); }
    negate() { return new Point(mod(-this.X), this.Y, this.Z, mod(-this.T)); }
    double() {
      const X1 = this.X, Y1 = this.Y, Z1 = this.Z;
      const A = modP(X1 * X1);
      const B = modP(Y1 * Y1);
      const C = modP(_2n * Z1 * Z1);
      const D = modP(_a * A);
      const x1y1 = mod(X1 + Y1);
      const E = mod(modP(x1y1 * x1y1) - A - B);
      const G2 = mod(D + B);
      const F = mod(G2 - C);
      const H = mod(D - B);
      return new Point(modP(E * F), modP(G2 * H), modP(F * G2), modP(E * H));
    }
    add(other) {
      const X1 = this.X, Y1 = this.Y, Z1 = this.Z, T1 = this.T, X2 = other.X, Y2 = other.Y, Z2 = other.Z, T2 = other.T;
      const A = modP(X1 * X2);
      const B = modP(Y1 * Y2);
      const C = modP(modP(T1 * _d) * T2);
      const D = modP(Z1 * Z2);
      const E = mod(modP(mod(X1 + Y1) * mod(X2 + Y2)) - A - B);
      const F = mod(D - C);
      const G2 = mod(D + C);
      const H = mod(B - modP(_a * A));
      return new Point(modP(E * F), modP(G2 * H), modP(F * G2), modP(E * H));
    }
    subtract(other) { return this.add(other.negate()); }
    // multiply(n, false) aus noble: ohne Schutz vor Zeitmessung (beim Prüfen ist nichts geheim), n = 0 ergibt den Nullpunkt
    multiplyUnsafe(n) {
      if (n === _0n) return I;
      arange(n, _1n, N);
      if (this.is0()) return I;
      if (n === _1n) return this;
      let p = I, d = this;
      while (n > _0n) {
        if (n & _1n) p = p.add(d);
        d = d.double();
        n >>= _1n;
      }
      return p;
    }
    clearCofactor() { return this.multiplyUnsafe(_8n); }
    isSmallOrder() { return this.clearCofactor().is0(); }
  }
  const G = new Point(Gx, Gy, _1n, mod(Gx * Gy));
  const I = new Point(_0n, _1n, _1n, _0n);
  // RFC 8032 5.1.7 (_verify und verifyAsync mit zip215: false). sha512(bytes) → Promise<Uint8Array(64)>. → true | false
  const verifyAsync = async (sig, msg, publicKey, sha512) => {
    abytes(sig, 64, "signature");
    abytes(msg, undefined, "message");
    abytes(publicKey, LEN, "publicKey");
    const r = sig.subarray(0, LEN);
    const s = bytesToNumberLE(sig.subarray(LEN, 64));
    let A, R, SB, hashable = new Uint8Array(0), finished = false;
    try {
      A = Point.fromBytes(publicKey, false);
      R = Point.fromBytes(r, false);
      SB = G.multiplyUnsafe(s); // 0 <= s < L, sonst Fehler
      hashable = concatBytes([r, publicKey, msg]);
      finished = true;
    } catch (e) { /* ungültig */ }
    const hashed = abytes(await sha512(hashable), 64, "digest");
    if (!finished) return false;
    if (A.isSmallOrder()) return false;
    const k = modL_LE(hashed);
    const RkA = R.add(A.multiplyUnsafe(k));
    return RkA.subtract(SB).clearCofactor().is0();
  };
  return Object.freeze({ verifyAsync });
})();

// ---------- Signatur der Liste (seit 01.11.2026, vorher in update.js; docs/architektur/update.md „Signatur der Liste“) ----------
// Die Prüfsumme im Manifest der zentralen Daten schützt nur vor einem kaputten Download. Darum gilt eine Liste nur mit gültiger
// Signatur system-dateien.json.sig: SSH-Signatur (ssh-keygen -Y sign, Format PROTOCOL.sshsig von OpenSSH) eines Schlüssels aus
// SIGNATUR_SCHLUESSEL im Namensraum SIGNATUR_NAMENSRAUM mit Hash sha512. Geprüft mit Web Crypto (Ed25519: Safari ab 17, Chromium
// ab 137), sonst mit dem eingebauten Prüfer (ED25519 oben). Gleicher Schlüssel wie für die Pakete des eigenen Servers
// (server/allowed_signers; tests/update-signatur.test.js vergleicht beide), eigener Namensraum. release.py --zip signiert und
// liest die Schlüssel aus dieser Datei. Schlüssel wechseln: Der neue kommt zuerst als zweiter Eintrag mit einem Release, das noch
// der alte signiert (docs/release.md). Für update.js und andere Skripte als ctx.signatur.
const SIGNATUR_SCHLUESSEL = Object.freeze([
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIBVvg98K+YQb1YhQFh5w2EE4QEs8QG7gN3jRK6G8pzjc", // release@studium-autopilot
]);
const SIGNATUR_NAMENSRAUM = "studium-autopilot-plugin";
const SIGNATUR_HASH = "sha512";
const SIGNATUR_MAX = 8192; // Bytes der Datei (eine Ed25519-Signatur hat rund 300)
const MAGIE = enc("SSHSIG");
const ARMOR = ["-----BEGIN SSH SIGNATURE-----", "-----END SSH SIGNATURE-----"];
// Base64 in genau einer Schreibweise (mit Auffüllung, ohne überzählige Bits) → Bytes | null
const base64 = (s) => {
  if (!s || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s)) return null;
  let bin;
  try { bin = atob(s); } catch (e) { return null; }
  if (btoa(bin) !== s) return null;
  const by = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) by[i] = bin.charCodeAt(i);
  return by;
};
// SSH-Daten (RFC 4251): uint32 und string (Länge als uint32, dann die Bytes). Liest der Leser über das Ende, wirft er.
const blobLeser = (by) => {
  const dv = new DataView(by.buffer, by.byteOffset, by.byteLength);
  let i = 0;
  const zahl = () => { if (by.length - i < 4) throw new Error("unvollständig"); const n = dv.getUint32(i); i += 4; return n; };
  const bytes = (n) => { if (by.length - i < n) throw new Error("unvollständig"); const b = by.subarray(i, i + n); i += n; return b; };
  return { zahl, bytes, text: () => bytes(zahl()), ende: () => i === by.length };
};
const sshText = (b) => { const x = new Uint8Array(4 + b.length); new DataView(x.buffer).setUint32(0, b.length); x.set(b, 4); return x; };
const verketten = (teile) => {
  const x = new Uint8Array(teile.reduce((n, t) => n + t.length, 0));
  let i = 0;
  for (const t of teile) { x.set(t, i); i += t.length; }
  return x;
};
const kryptoFehler = (was, e) => { const x = new Error("Web Crypto ohne " + was + " (" + grund(e) + ")"); x.krypto = true; return x; };
// „typ base64“ (wie in .pub und allowed_signers) → Blob des Schlüssels | null (Typ im Blob muss gleich sein)
const schluesselBlob = (zeile) => {
  const t = String(zeile || "").split(" ");
  const by = t.length === 2 ? base64(t[1]) : null;
  if (!by) return null;
  try { return dec(blobLeser(by).text()) === t[0] ? by : null; } catch (e) { return null; }
};
// Kann Web Crypto auf diesem Gerät Ed25519? Probe mit dem ersten festen Schlüssel, ohne Netz; je subtle einmal.
const ED25519_DA = new WeakMap();
const ed25519Da = async (subtle) => {
  if (!subtle || (typeof subtle !== "object" && typeof subtle !== "function")) return false;
  if (ED25519_DA.has(subtle)) return ED25519_DA.get(subtle);
  let da = false;
  try {
    const r = blobLeser(schluesselBlob(SIGNATUR_SCHLUESSEL[0]));
    r.text();
    await subtle.importKey("raw", r.text(), { name: "Ed25519" }, false, ["verify"]);
    da = true;
  } catch (e) { da = false; }
  ED25519_DA.set(subtle, da);
  return da;
};
// SHA-512 über subtle (für den eingebauten Prüfer)
const sha512Mit = (subtle) => async (b) => new Uint8Array(await subtle.digest("SHA-512", b));
// Kann dieses Gerät Signaturen prüfen? Web Crypto mit Ed25519, sonst der eingebaute Prüfer (braucht SHA-512 und BigInt).
const pruefbar = async (subtle) => {
  const s = subtle || (typeof crypto !== "undefined" ? crypto.subtle : null);
  if (await ed25519Da(s)) return true;
  try { return typeof BigInt === "function" && (await sha512Mit(s)(new Uint8Array(0))).length === 64; } catch (e) { return false; }
};
// Schlüsselarten, die geprüft werden können: je Name Leser für den Rest des Schlüssel- bzw. Signatur-Blobs und die Prüfung.
// Nur ssh-ed25519. Hardware-Schlüssel (sk-ssh-ed25519@openssh.com) signieren andere Daten (Hash der Anwendung, Flags, Zähler)
// und werden bewusst abgelehnt; sie kämen als eigener Eintrag hierher, mit Test.
const SCHLUESSEL_ARTEN = {
  "ssh-ed25519": {
    schluessel: (r) => { const k = r.text(); if (k.length !== 32) throw new Error("Ed25519-Schlüssel nicht 32 Bytes"); return k; },
    signatur: (r) => { const s = r.text(); if (s.length !== 64) throw new Error("Ed25519-Signatur nicht 64 Bytes"); return s; },
    pruefen: async (subtle, k, s, daten) => {
      if (!(await ed25519Da(subtle))) return ED25519.verifyAsync(s, daten, k, sha512Mit(subtle));
      let key;
      try { key = await subtle.importKey("raw", k, { name: "Ed25519" }, false, ["verify"]); } catch (e) { throw kryptoFehler("Ed25519", e); }
      return subtle.verify({ name: "Ed25519" }, key, s, daten);
    },
  },
};
// Blob einer SSH-Signatur zerlegen (PROTOCOL.sshsig): byte[6] "SSHSIG", uint32 Version 1, string Schlüssel, string Namensraum,
// string reserviert, string Hash, string Signatur; danach nichts mehr. Wirft bei jeder Abweichung in der Form.
const sshsigLesen = (blob) => {
  const r = blobLeser(blob);
  if (!gleich(r.bytes(6), MAGIE)) throw new Error("kein SSHSIG");
  if (r.zahl() !== 1) throw new Error("Version unbekannt");
  const f = { schluessel: r.text(), namensraum: r.text(), reserviert: r.text(), hash: r.text(), signatur: r.text() };
  if (!r.ende()) throw new Error("Daten nach der Signatur");
  const k = blobLeser(f.schluessel);
  f.art = dec(k.text());
  if (!hat(SCHLUESSEL_ARTEN, f.art)) throw new Error("Schlüsselart nicht erlaubt: " + f.art.slice(0, 40));
  const A = SCHLUESSEL_ARTEN[f.art];
  f.roh = A.schluessel(k);
  if (!k.ende()) throw new Error("Daten nach dem Schlüssel");
  const s = blobLeser(f.signatur);
  if (dec(s.text()) !== f.art) throw new Error("Signatur passt nicht zur Schlüsselart");
  f.sroh = A.signatur(s);
  if (!s.ende()) throw new Error("Daten nach der Signatur");
  return f;
};
// Signatur sig (Bytes von system-dateien.json.sig) über daten (Bytes der Liste). o: { schluessel (Standard SIGNATUR_SCHLUESSEL),
// subtle (Standard crypto.subtle) } → { ok: true, schluessel } | { ok: false, art: "signatur" | "krypto", fehler }
const signaturPruefen = async (sig, daten, o) => {
  const x = o || {}, subtle = x.subtle || crypto.subtle, erlaubt = x.schluessel || SIGNATUR_SCHLUESSEL;
  const nein = (text) => ({ ok: false, art: "signatur", fehler: "Signatur: " + text });
  if (!sig || !sig.length || sig.length > SIGNATUR_MAX) return nein("fehlt oder zu groß");
  const z = dec(sig).replace(/\r\n/g, "\n").replace(/\n$/, "").split("\n");
  const blob = z.length >= 3 && z[0] === ARMOR[0] && z[z.length - 1] === ARMOR[1] ? base64(z.slice(1, -1).join("")) : null;
  if (!blob || z.slice(1, -1).some((t) => !t)) return nein("Form ungültig");
  let f;
  try { f = sshsigLesen(blob); } catch (e) { return nein(grund(e)); }
  const passend = erlaubt.filter((e) => gleich(schluesselBlob(e), f.schluessel))[0];
  if (!passend) return nein("Schlüssel nicht erlaubt");
  if (!gleich(f.namensraum, enc(SIGNATUR_NAMENSRAUM))) return nein("Namensraum nicht " + SIGNATUR_NAMENSRAUM);
  if (f.reserviert.length) return nein("reserviert nicht leer");
  if (!gleich(f.hash, enc(SIGNATUR_HASH))) return nein("Hash nicht " + SIGNATUR_HASH);
  // Signiert sind: byte[6] "SSHSIG", string Namensraum, string reserviert, string Hash, string H(Liste)
  let h, gut;
  try { h = await sha512Mit(subtle)(daten); } catch (e) { return { ok: false, art: "krypto", fehler: grund(kryptoFehler("SHA-512", e)) }; }
  try {
    gut = await SCHLUESSEL_ARTEN[f.art].pruefen(subtle, f.roh, f.sroh,
      verketten([MAGIE, sshText(f.namensraum), sshText(f.reserviert), sshText(f.hash), sshText(h)]));
  } catch (e) {
    return e && e.krypto ? { ok: false, art: "krypto", fehler: grund(e) } : nein("Prüfung gescheitert (" + grund(e) + ")");
  }
  return gut === true ? { ok: true, schluessel: passend } : nein("ungültig");
};
// ctx.signatur: für update.js (Update-Liste) und Tests. pruefen = signaturPruefen, pruefbar(subtle) → bool
const SIGNATUR = Object.freeze({ pruefen: signaturPruefen, pruefbar, ed25519Da, sshsigLesen, schluesselBlob,
  SCHLUESSEL: SIGNATUR_SCHLUESSEL, NAMENSRAUM: SIGNATUR_NAMENSRAUM, HASH: SIGNATUR_HASH, MAX: SIGNATUR_MAX });

// ---------- Prüfung der Skripte (docs/architektur/skripte-pruefen.md) ----------
const LISTE = "System/Daten/system-dateien.json";
const LISTE_SIG = LISTE + ".sig";
const LISTE_MAX = 2097152; // Bytes, wie update.js
const SKRIPT_PFAD = /^System\/Skripte\/[^/]+\.js$/;
// Dateien des Kerns in der Liste (wie KERN und KERN_DATEIEN in update.js): nachgeholt mit „Neu laden“, wenn der Kern hinterherhinkt
const KERN_PFADE = ["main.js", "styles.css", "manifest.json"].map((n) => ".obsidian/plugins/" + PROTOKOLL + "/" + n);
const ORDNER = "Studium Autopilot"; // Ordner des Tresors im Repo
// Woher die Signatur im Übergang und die echte Fassung beim Reparieren kommen: wie RELEASES und RELEASE_ROH in zentral.js
// (ein Fork setzt beide auf sein Repo, hier wie dort)
const RELEASES = "https://github.com/studium-autopilot/ecoba/releases";
const RELEASE_ROH = "https://raw.githubusercontent.com/studium-autopilot/ecoba/";
const SICHERUNG = ".trash/Studium Autopilot Sicherung "; // wie update.js
const SIG_FRIST = 10000; // ms höchstens für einen Abruf aus dem Release von selbst (ohne Netz: sofort)
const REPARIEREN_FRIST = 30000; // ms höchstens für einen Abruf aus dem Release nach einem Tipp auf Reparieren
const ABLEHNUNG_START = 5000; // ms nach dem Start bis zum Hinweis auf gesperrte Skripte
const ABLEHNUNG_SYNC = 60000; // ms Ruhe nach einem gesperrten Hot-Reload (Liste und Signatur kommen vielleicht noch über den Sync)
// Gerätespeicher (app.loadLocalStorage: je Gerät und Tresor, nie in einer Datei des Tresors)
const L_LISTEN = "eba-skripte-listen";       // angenommene Listen (behalten) [{ art: signiert, version, liste (SHA-256), skripte, kern: pfad → { sha256, groesse } }]
const L_HOECHSTE = "eba-skripte-hoechste";   // neueste fertige Version (X.Y.Z), deren Liste dieses Gerät angenommen hat
const L_HOECHSTE_BETA = "eba-skripte-hoechste-beta"; // neueste Testversion (X.Y.Z-beta.N), deren Liste es angenommen hat
const L_BETA = "eba-skripte-beta";           // true: Listen von Testversionen (X.Y.Z-beta.N) gelten (Schalter „Beta-Versionen“ in der App)
const L_ERLAUBT = "eba-skripte-erlaubt";     // pfad → SHA-256: auf diesem Gerät erlaubte Skripte
const L_ENTWICKLER = "eba-skripte-entwickler"; // true: Entwicklermodus
const L_FRUEHER = ["eba-skripte-signiert", "eba-skripte-tofu"]; // Schlüssel früherer Entwicklungsstände der Prüfung: beim Start weg
const NEUERE_MAX = 3; // so viele angenommene Listen neuer als der laufende Kern bleiben (dazu die seiner Version)
// Skripte und Dateien des Kerns einer Liste (system-dateien.json): { version, skripte: pfad → { sha256, groesse }, kern: ebenso }
// | null. Nur, was der Kern braucht; die volle Prüfung macht update.js (listePruefen). Gültig ist die Liste dafür ohnehin nur mit
// Signatur.
const skripteAusListe = (by) => {
  let d;
  try { d = JSON.parse(dec(by)); } catch (e) { return null; }
  if (!d || typeof d !== "object" || Array.isArray(d) || d.schema !== 1 || !semver(d.version) || d.ordner !== ORDNER || !Array.isArray(d.dateien)) return null;
  const skripte = {}, kern = {};
  for (const e of d.dateien) {
    const p = e && typeof e === "object" && typeof e.pfad === "string" ? nfc(e.pfad) : "";
    const ziel = SKRIPT_PFAD.test(p) ? skripte : KERN_PFADE.indexOf(p) >= 0 ? kern : null;
    if (!ziel || e.klasse !== "system" || typeof e.sha256 !== "string" || !HEX.test(e.sha256)
      || !Number.isInteger(e.groesse) || e.groesse < 0 || e.groesse > LISTE_MAX) continue;
    ziel[p] = { sha256: e.sha256, groesse: e.groesse };
  }
  return { version: d.version, skripte, kern };
};
const mengeOk = (m) => !!m && typeof m === "object" && m.art === "signiert" && !!semver(m.version)
  && typeof m.liste === "string" && HEX.test(m.liste) && !!m.skripte && typeof m.skripte === "object" && !Array.isArray(m.skripte)
  && (m.kern === undefined || (!!m.kern && typeof m.kern === "object" && !Array.isArray(m.kern)));
const inMenge = (m, pfad, sha) => hat(m.skripte, pfad) && !!m.skripte[pfad] && m.skripte[pfad].sha256 === sha;
// Versionen absteigend (neueste zuerst)
const neuesteZuerst = (a, b) => (neuer(a.version, b.version) ? -1 : neuer(b.version, a.version) ? 1 : 0);
const istTestversion = (v) => String(v).indexOf("-") >= 0; // X.Y.Z-beta.N
// Zeilenenden CRLF → LF (für JavaScript ohne Bedeutung); sonst genau die gelesenen Bytes
const ohneCR = (by) => {
  let n = 0;
  for (let i = 0; i + 1 < by.length; i++) if (by[i] === 13 && by[i + 1] === 10) n++;
  if (!n) return by;
  const aus = new Uint8Array(by.length - n);
  for (let i = 0, j = 0; i < by.length; i++) if (!(by[i] === 13 && by[i + 1] === 10)) aus[j++] = by[i];
  return aus;
};
// Signatur einer Liste prüfen: über ihre Bytes; scheitert das und stehen CR darin (git unter Windows, ein Sync-Dienst), noch einmal
// mit LF statt CRLF. → Ergebnis von signaturPruefen
const listeSigniert = async (sig, by) => {
  const r = await signaturPruefen(sig, by);
  if (r.ok || by.indexOf(13) < 0) return r;
  const lf = await signaturPruefen(sig, ohneCR(by));
  return lf.ok ? lf : r;
};
const puffer = (by) => by.buffer.slice(by.byteOffset, by.byteOffset + by.byteLength);
const stempel = (d) => {
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}-${p(d.getMinutes())}`;
};
const mitFrist = (p, ms) => new Promise((ja, nein) => {
  const t = setTimeout(() => nein(new Error("Zeit abgelaufen")), ms);
  Promise.resolve(p).then((x) => { clearTimeout(t); ja(x); }, (e) => { clearTimeout(t); nein(e); });
});
const namenText = (namen) => (namen.length > 6 ? namen.slice(0, 5).join(", ") + " und " + (namen.length - 5) + " weitere" : namen.join(", "));
const BETA_TEXT = (v, namen) => (namen ? `Teile der App starten nicht, weil Version ${v} eine Testversion ist (${namenText(namen)}).` : `Version ${v} ist eine Testversion.`)
  + " Auf diesem Gerät gelten Testversionen erst, wenn du hier unter „Updates“ den Schalter „Beta-Versionen“ einschaltest.";
const REPARIEREN_FEHLER = {
  offline: "Keine Verbindung. Versuch es später noch einmal.",
  netz: "Keine Verbindung. Versuch es später noch einmal.",
  fehlt: "Reparieren geht gerade nicht, weil sich die Liste der App nicht prüfen lässt.",
  pruefung: "Die echte Fassung kam nicht vollständig an. Es wurde nichts geändert.",
};

// ---------- Eingabefenster (ersetzt tp.system.prompt) ----------
class Eingabe extends Modal {
  constructor(app, frage, vorschlag, fertig) {
    super(app);
    this.frage = String(frage == null ? "" : frage);
    this.vorschlag = String(vorschlag == null ? "" : vorschlag);
    this.fertig = fertig;
    this.erledigt = false;
  }
  onOpen() {
    this.modalEl.addClass("sa-eingabe");
    this.contentEl.createEl("p", { text: this.frage, cls: "sa-frage" });
    const feld = this.contentEl.createEl("input", { type: "text", cls: "sa-feld" });
    feld.value = this.vorschlag;
    feld.style.width = "100%";
    const knoepfe = this.contentEl.createDiv({ cls: "modal-button-container" });
    const ok = knoepfe.createEl("button", { text: "OK", cls: "mod-cta" });
    const ab = knoepfe.createEl("button", { text: "Abbrechen" });
    const senden = () => { this.erledigt = true; const w = feld.value; this.close(); this.fertig(w); };
    ok.addEventListener("click", senden);
    ab.addEventListener("click", () => this.close());
    feld.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); senden(); } });
    setTimeout(() => { feld.focus(); feld.select(); }, 30);
  }
  onClose() { this.contentEl.empty(); if (!this.erledigt) { this.erledigt = true; this.fertig(null); } }
}

// ---------- Auswahlliste (ersetzt tp.system.suggester) ----------
class Auswahl extends FuzzySuggestModal {
  constructor(app, texte, werte, platzhalter, fertig) {
    super(app);
    this.texte = texte; this.werte = werte; this.fertig = fertig; this.erledigt = false;
    if (platzhalter) this.setPlaceholder(String(platzhalter));
  }
  getItems() { return this.werte.map((w, i) => i); }
  getItemText(i) { return String(this.texte[i]); }
  // Obsidian schließt das Fenster VOR onChooseItem; darum hier merken, dass gewählt wurde (sonst meldet onClose „Esc“)
  selectSuggestion(wert, evt) { this.erledigt = true; this.close(); this.onChooseSuggestion(wert, evt); }
  onChooseItem(i) { this.fertig(this.werte[i]); }
  onClose() { if (!this.erledigt) { this.erledigt = true; this.fertig(null); } }
}

// ---------- Bestätigung (Entwicklermodus, Erlauben, Reparieren) ----------
// o = { titel, text: [Absätze], knopf, warnung (roter Knopf) } → fertig(true | false)
class Frage extends Modal {
  constructor(app, o, fertig) {
    super(app);
    this.o = o; this.fertig = fertig; this.erledigt = false;
  }
  onOpen() {
    this.modalEl.addClass("eba-modal");
    this.titleEl.setText(this.o.titel);
    for (const t of this.o.text) this.contentEl.createEl("p", { cls: "eba-modal-text", text: t });
    const knoepfe = this.contentEl.createDiv({ cls: "modal-button-container" });
    knoepfe.createEl("button", { text: "Abbrechen" }).addEventListener("click", () => this.close());
    knoepfe.createEl("button", { text: this.o.knopf, cls: this.o.warnung ? "mod-warning" : "mod-cta" }).addEventListener("click", () => {
      this.erledigt = true; this.close(); this.fertig(true);
    });
  }
  onClose() { this.contentEl.empty(); if (!this.erledigt) { this.erledigt = true; this.fertig(false); } }
}

// Query-Teil eines Links lesen. Eigene Zerlegung statt URLSearchParams: „+“ bleibt „+“ (Bases-Formeln kodieren als %2B).
const parameterAus = (href) => {
  const p = {};
  const q = String(href || "").split("?").slice(1).join("?").split("#")[0];
  for (const teil of q.split("&")) {
    if (!teil) continue;
    const i = teil.indexOf("=");
    const k = i < 0 ? teil : teil.slice(0, i), v = i < 0 ? "" : teil.slice(i + 1);
    let kk = k, vv = v;
    try { kk = decodeURIComponent(k); } catch (e) { /* roh lassen */ }
    try { vv = decodeURIComponent(v); } catch (e) { /* roh lassen */ }
    p[kk] = vv;
  }
  return p;
};

module.exports = class StudiumAutopilot extends Plugin {
  async onload() {
    this.skripte = {};       // Name → module.exports jedes Skripts (ctx.user)
    this.quellen = {};       // Name → Quelltext (für Hot-Reload: nur bei Änderung neu laden)
    this.erweiterungen = {}; // Name → Rückgabe der Fabrik (registrieren, start, aktionen …)
    this.aktionen = {};      // Aktionsname → { titel, ausfuehren, ordner, editor, skript }
    this.laufend = new Set(); // gerade laufende Aktionen (Doppelklick-Schutz)
    this.testAntworten = [];  // Nur für Tests: vorbereitete Antworten für Eingabe/Auswahl (siehe docs/architektur/testeinstiege.md)
    this.testProtokoll = [];
    this.stillBis = 0;        // bis zu diesem Zeitpunkt (ms) keine Hinweise beim Hot-Reload (update.js während eines Updates, hinweisSammeln)
    this.testDatum = null;    // Nur für Tests: "YYYY-MM-DD" ersetzt das heutige Datum in ctx.date (Uhrzeit bleibt)
    // Aufräumen je Skript (Helfer in ctx, siehe skriptKontext)
    this.kontexte = {};      // Skript → eigener Kontext (Proxy auf ctx mit den Helfern)
    this.aufraeumer = {};    // Skript → [Funktion], beim Abmelden rückwärts aufgerufen
    this.timer = {};         // Skript → Set offener Timer/Intervalle
    this.zustaende = {};     // "Skript/Schlüssel" → Wert, überlebt den Hot-Reload (ctx.bleibend)
    this.bloecke = {};       // Codeblock-Sprache → { fn, skript, instanzen }: EIN Prozessor je Sprache und Plugin-Instanz
    this.nachbearbeiter = []; // [{ skript, fn }] für den einen gemeinsamen Post-Processor
    this.editorErw = [];     // CodeMirror-Erweiterungen; das Array ist einmal angemeldet, Inhalt wird getauscht
    this.befehle = {};       // Befehls-ID → Skript (zum Entfernen beim Hot-Reload)
    // Prüfung der Skripte (docs/architektur/skripte-pruefen.md)
    this.pruefung = null;    // { mengen: [angenommene Listen], zustand, liste, version } aus listeAuswerten
    this.pruefsummen = {};   // Name → SHA-256 der geladenen Fassung
    this.abgelehnt = {};     // Name → { name, pfad, sha, grund: geaendert | unbekannt }: gesperrt, nicht ausgewertet
    this.sigGeholt = {};     // Version → Signatur aus dem Release (Bytes) oder null (eine Antwort ohne): je Lauf gemerkt
    this.sigAndere = "";     // die eine Version außer der des Kerns, nach der der Kern in diesem Lauf von selbst fragt
    this.ctx = this.kontextBauen();
    // Klassen am body, die ein Skript für dieses Gerät gemerkt hat (Gerätespeicher „eba-start-klassen“, z. B. das Design aus
    // darstellung.js): gleich jetzt setzen, nicht erst nach dem Laden der Skripte, sonst springt das Aussehen beim Start um
    const start = this.app.loadLocalStorage("eba-start-klassen");
    this.startKlassen = (Array.isArray(start) ? start : []).filter((k) => /^eba-[a-z0-9-]+$/.test(String(k)));
    for (const k of this.startKlassen) document.body.classList.add(k);
    // Blendet auf dem Dashboard den Hinweis „Studium Autopilot ist noch aus“ aus (eba-core.css)
    document.body.classList.add("eba-plugin-an");

    // Knöpfe: Klick im Capture-Modus abfangen, bevor Obsidian den Link selbst behandelt (Lese-/Bearbeitungsansicht,
    // Bases-html(), Callouts, Hover-Vorschau, auf allen Geräten). Protokoll-Handler als Rückfall (Link von außen).
    this.klickAbfangen(document);
    this.registerEvent(this.app.workspace.on("window-open", (ww) => { try { this.klickAbfangen(ww.doc); } catch (e) { console.error(e); } }));
    // Gerenderte Knöpfe merken sich ihre Notiz (auch in Einbettungen und Hover-Vorschauen, wo kein Tab dazugehört)
    this.registerMarkdownPostProcessor((el, c) => {
      for (const a of el.querySelectorAll('a[href^="' + LINK + '"]')) if (c && c.sourcePath) a.setAttribute("data-sa-quelle", c.sourcePath);
    });
    // Ein gemeinsamer Post-Processor für alle Skripte (ctx.postprozessor); ruft immer die aktuell angemeldeten Fassungen
    this.registerMarkdownPostProcessor((el, c) => {
      for (const n of this.nachbearbeiter.slice()) { try { n.fn(el, c); } catch (e) { console.error("Studium Autopilot: Post-Processor " + n.skript, e); } }
    });
    // Ein gemeinsames Array für Editor-Erweiterungen (ctx.editor); Obsidian liest es bei updateOptions() neu
    this.registerEditorExtension(this.editorErw);
    // Link von außen (Browser, andere App, obsidian://-Adresse): extern = true, Aktionen sehen es als c.extern
    this.registerObsidianProtocolHandler(PROTOKOLL, (p) => {
      this.aktionAusfuehren(p.aktion, p, { quelle: this.app.workspace.getActiveFile(), extern: true });
    });

    this.addCommand({ id: "neue-notiz", name: "Neue Notiz aus Vorlage …", callback: () => this.neueNotizWaehlen() });
    this.addCommand({ id: "erweiterungen-neu-laden", name: "Erweiterungen neu laden", callback: () => this.skripteLaden(false) });
    // Prüfung der Skripte: nur Befehle des Kerns, keine Aktionen (über einen Knopf oder obsidian://studium-autopilot nicht erreichbar)
    const gesperrt = () => Object.keys(this.abgelehnt).length > 0;
    this.addCommand({ id: "skripte-reparieren", name: "Skripte reparieren …",
      checkCallback: (pruefen) => { if (!gesperrt()) return false; if (!pruefen) this.reparierenFragen(); return true; } });
    this.addCommand({ id: "skript-erlauben", name: "Skript auf diesem Gerät erlauben …",
      checkCallback: (pruefen) => { if (!gesperrt()) return false; if (!pruefen) this.erlaubenFragen(); return true; } });
    this.addCommand({ id: "entwicklermodus-an", name: "Entwicklermodus einschalten …",
      checkCallback: (pruefen) => { if (this.entwickler()) return false; if (!pruefen) this.entwicklerFragen(); return true; } });
    this.addCommand({ id: "kern-aufholen", name: "Neue Version auf diesem Gerät laden …",
      checkCallback: (pruefen) => { if (!this.kernAufholbar()) return false; if (!pruefen) this.kernAufholenFragen(); return true; } });
    this.addCommand({ id: "entwicklermodus-aus", name: "Entwicklermodus ausschalten",
      checkCallback: (pruefen) => { if (!this.entwickler()) return false; if (!pruefen) this.entwicklerAus(); return true; } });

    this.wischenBeimStart();
    this.app.workspace.onLayoutReady(() => this.starten());
  }

  // Wischen beim Start (iPhone und iPad, seit 01.11.2026, Rückmeldung: „Sidebar shouldn't be visible in this vault“, iPad-Foto der
  // linken Seitenleiste kurz nach dem Öffnen): Die Skripte laden erst, wenn Obsidian fertig ist, eines nach dem anderen (am PC gut
  // eine Sekunde, bis seitenleiste.js an der Reihe ist; auf dem iPad nach einem Kaltstart länger). Bis seitenleiste.js seine Hülle
  // um workspace.trigger legt (wischenUebernehmen), zog ein Finger, der waagerecht wischt, Obsidians Seitenleiste auf. Diese Hülle
  // nimmt solche Gesten, bis der Start durch ist: ein Finger, waagerecht, beide Seitenleisten zu oder angeheftet (dieselbe Regel
  // wie seitenGeste in seitenleiste.js; eine offene schließt Wischen weiter). Danach reicht sie alles durch. Beim Entladen gibt sie
  // trigger zurück, wenn niemand sie seither umhüllt hat; sonst reicht sie nur noch durch.
  wischenBeimStart() {
    const ws = this.app.workspace;
    if (!obsidian.Platform || !obsidian.Platform.isMobile || !ws || typeof ws.trigger !== "function") return;
    const eigen = Object.prototype.hasOwnProperty.call(ws, "trigger");
    const alt = ws.trigger;
    const zu = (s) => !!s && (s.collapsed === true || s.isPinned === true);
    const plugin = this;
    const huelle = function (...a) {
      const g = a[1];
      const nehmen = !plugin.gestartet && !plugin.entladen && a[0] === "swipe" && !!g && g.points === 1 && g.direction === "x"
        && zu(ws.leftSplit) && zu(ws.rightSplit);
      return nehmen ? undefined : alt.apply(this, a);
    };
    ws.trigger = huelle;
    this.register(() => {
      if (ws.trigger !== huelle) return;
      if (eigen) ws.trigger = alt; else delete ws.trigger;
    });
  }

  onunload() {
    // Ab jetzt nichts mehr anmelden: ein noch laufendes await (Hot-Reload, Start) darf nach dem Entladen keinen Codeblock-
    // Prozessor o. Ä. registrieren – der bliebe sonst für immer angemeldet, und die nächste Instanz (Plugin neu laden,
    // Update) bekäme „already registered“.
    this.entladen = true;
    clearTimeout(this.hinweisTimer);
    clearTimeout(this.ablehnungTimer);
    // Je Skript: abmelden() der Erweiterung, dann alles, was über die Helfer in ctx angemeldet wurde.
    // Codeblock-Prozessoren, Post-Processor, Editor-Array und Befehle meldet Obsidian beim Entladen des Plugins selbst ab.
    for (const name of Object.keys(this.erweiterungen).concat(Object.keys(this.aufraeumer))) this.skriptAbmelden(name);
    for (const k of this.startKlassen || []) document.body.classList.remove(k);
    document.body.classList.remove("eba-plugin-an");
    this.zustaende = {};
  }

  // ---------- Kontextobjekt (ersetzt Templaters „tp“) ----------
  // Datum für ctx.date: heute, im Test (this.testDatum = "YYYY-MM-DD") dieser Tag mit der aktuellen Uhrzeit
  jetzt() {
    const d = new Date();
    const m = this.testDatum && String(this.testDatum).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? new Date(+m[1], +m[2] - 1, +m[3], d.getHours(), d.getMinutes(), d.getSeconds()) : d;
  }

  // Kontext je Skript: alles aus ctx plus Helfer, die sich merken, was dieses Skript angemeldet hat. Zuweisungen
  // (z. B. ctx.modell = …) landen im gemeinsamen ctx; Ableitungen per Object.create bekommen eigene Felder.
  skriptKontext(name) {
    if (this.kontexte[name]) return this.kontexte[name];
    const plugin = this;
    const merken = (fn) => { (plugin.aufraeumer[name] = plugin.aufraeumer[name] || []).push(fn); return fn; };
    const timer = (plugin.timer[name] = plugin.timer[name] || new Set());
    const eigen = {
      skript: name,
      // beliebige Aufräumfunktion (z. B. die Rückgabe von ctx.modell.beiAenderung)
      aufraeumen: (fn) => { if (typeof fn === "function") merken(fn); return fn; },
      // Ereignis von app.workspace, app.vault oder app.metadataCache (wie registerEvent)
      an: (quelle, ereignis, fn) => { const ref = quelle.on(ereignis, fn); merken(() => quelle.offref(ref)); return ref; },
      // DOM-Ereignis auf einem langlebigen Element (document, window, Popout-Dokument)
      dom: (el, typ, fn, opt) => { el.addEventListener(typ, fn, opt); merken(() => el.removeEventListener(typ, fn, opt)); return fn; },
      intervall: (fn, ms) => { const id = setInterval(fn, ms); timer.add(id); return id; },
      zeit: (fn, ms) => { const id = setTimeout(() => { timer.delete(id); fn(); }, ms); timer.add(id); return id; },
      stopp: (id) => { if (id == null) return; clearTimeout(id); clearInterval(id); timer.delete(id); },
      // entprellte Funktion: ruft fn erst, wenn ms lang kein weiterer Aufruf kam
      entprellen: (fn, ms) => { let id = null; return function () { const a = arguments; eigen.stopp(id); id = eigen.zeit(() => { id = null; fn.apply(null, a); }, ms); }; },
      codeblock: (sprache, fn) => plugin.codeblockAnmelden(name, sprache, fn, merken),
      postprozessor: (fn) => {
        const e = { skript: name, fn };
        plugin.nachbearbeiter.push(e);
        merken(() => { const i = plugin.nachbearbeiter.indexOf(e); if (i >= 0) plugin.nachbearbeiter.splice(i, 1); });
      },
      editor: (ext) => {
        plugin.editorErw.push(ext);
        plugin.editorAktualisieren();
        merken(() => { const i = plugin.editorErw.indexOf(ext); if (i >= 0) plugin.editorErw.splice(i, 1); plugin.editorAktualisieren(); });
      },
      // Wert, der den Hot-Reload überlebt (z. B. gewählter Monat), beim Entladen des Plugins vergessen
      bleibend: (schluessel, anfang) => {
        const k = name + "/" + schluessel;
        if (!Object.prototype.hasOwnProperty.call(plugin.zustaende, k)) plugin.zustaende[k] = typeof anfang === "function" ? anfang() : anfang;
        return plugin.zustaende[k];
      },
    };
    const hat = (k) => Object.prototype.hasOwnProperty.call(eigen, k);
    const p = new Proxy(this.ctx, {
      get: (t, k, r) => (hat(k) ? eigen[k] : Reflect.get(t, k, r)),
      set: (t, k, v, r) => {
        if (r !== p) return Reflect.defineProperty(r, k, { value: v, writable: true, enumerable: true, configurable: true });
        if (hat(k)) return false;
        t[k] = v;
        return true;
      },
      has: (t, k) => hat(k) || k in t,
    });
    this.kontexte[name] = p;
    return p;
  }

  // Alles abmelden, was ein Skript angemeldet hat: abmelden() der Erweiterung, Helfer (rückwärts), Timer, Aktionen, Befehle
  skriptAbmelden(name) {
    const m = this.erweiterungen[name];
    if (m && typeof m.abmelden === "function") { try { m.abmelden(); } catch (e) { console.error("Studium Autopilot: abmelden " + name, e); } }
    const liste = this.aufraeumer[name] || [];
    delete this.aufraeumer[name];
    for (let i = liste.length - 1; i >= 0; i--) { try { liste[i](); } catch (e) { console.error("Studium Autopilot: aufräumen " + name, e); } }
    const t = this.timer[name];
    if (t) { for (const id of t) { clearTimeout(id); clearInterval(id); } t.clear(); }
    this.aktionenEntfernen(name);
    delete this.erweiterungen[name];
  }

  editorAktualisieren() { try { this.app.workspace.updateOptions(); } catch (e) { /* ältere Fassung */ } }

  // ---------- Codeblöcke: ein Prozessor je Sprache, ruft immer die aktuelle Fassung ----------
  codeblockAnmelden(skript, sprache, fn, merken) {
    if (this.entladen) return { sprache, instanzen: () => [], neu: () => {} };
    let b = this.bloecke[sprache];
    if (!b) {
      b = this.bloecke[sprache] = { sprache, fn: null, skript: null, instanzen: new Set() };
      this.registerMarkdownCodeBlockProcessor(sprache, (quelle, el, c) => this.codeblockNeu(b, quelle, el, c));
    }
    if (b.fn && b.skript !== skript) console.warn(`Studium Autopilot: Codeblock ${sprache} von ${b.skript} wird durch ${skript} ersetzt`);
    b.fn = fn; b.skript = skript;
    merken(() => { if (b.fn === fn) { b.fn = null; b.skript = null; } });
    const plugin = this;
    return {
      sprache,
      // angezeigte Blöcke dieser Sprache: [{ quelle, el, ctx, sprache, … }]; Skripte dürfen eigene Felder anhängen
      instanzen: () => plugin.codeblockInstanzen(b),
      // alle (oder die mit filter(inst) === true) mit der aktuellen Fassung neu zeichnen
      neu: (filter) => { for (const i of plugin.codeblockInstanzen(b)) if (!filter || filter(i)) plugin.codeblockAufrufen(b, i); },
    };
  }

  codeblockNeu(b, quelle, el, c) {
    const inst = { quelle, el, ctx: c, sprache: b.sprache };
    b.instanzen.add(inst);
    // Vergessen, sobald Obsidian den Abschnitt entlädt (neu zeichnen, Tab zu)
    try { if (c && typeof c.addChild === "function" && obsidian.MarkdownRenderChild) { const k = new obsidian.MarkdownRenderChild(el); k.register(() => b.instanzen.delete(inst)); c.addChild(k); } } catch (e) { /* dann über isConnected */ }
    if (b.instanzen.size > 100) for (const i of Array.from(b.instanzen)) if (i !== inst && !i.el.isConnected) b.instanzen.delete(i);
    return this.codeblockAufrufen(b, inst);
  }

  codeblockInstanzen(b) { return Array.from(b.instanzen).filter((i) => i.el.isConnected); }

  codeblockAufrufen(b, inst) {
    const el = inst.el;
    const fehler = (e) => {
      console.error("Studium Autopilot: Codeblock " + b.sprache, e);
      try { el.empty(); el.createDiv({ cls: "sa-block-fehler", text: `${b.sprache}: Fehler – ${(e && e.message) || e}` }); } catch (x) { /* egal */ }
    };
    if (!b.fn) { // Skript fehlt oder ist nicht geladen: Text des Blocks zeigen
      try { el.empty(); el.createDiv({ cls: "sa-block-ersatz", text: String(inst.quelle || "").trim() || b.sprache }); } catch (x) { /* egal */ }
      return undefined;
    }
    try {
      const r = b.fn(inst.quelle, el, inst.ctx, inst);
      if (r && typeof r.then === "function") return r.catch(fehler);
    } catch (e) { fehler(e); }
    return undefined;
  }

  kontextBauen() {
    const plugin = this;
    return {
      app: this.app,
      obsidian,
      plugin,
      user: this.skripte,
      cm: CM, // { view: @codemirror/view, state: @codemirror/state } für registerEditorExtension
      signatur: SIGNATUR, // Signatur der Update-Liste prüfen (update.js): pruefen(sig, daten, o), pruefbar(subtle)
      // Listen, die dieses Gerät geprüft hat (nur lesen): update.js holt Kern und Hinweise für Claude nur nach diesen nach.
      // beta(an): Listen von Testversionen auf diesem Gerät gelten lassen oder nicht (nur der Schalter „Beta-Versionen“ in update.js);
      // betaAn(): ob der Schalter auf diesem Gerät an ist
      skripte: Object.freeze({ listen: () => plugin.signierteListen(), beta: (an) => plugin.testversionenSetzen(an),
        betaAn: () => plugin.lokal(L_BETA) === true }),
      system: {
        prompt: (frage, vorschlag) => plugin.eingabe(frage, vorschlag),
        suggester: (texte, werte, _fehlerBeiAbbruch, platzhalter) => plugin.auswahl(texte, werte, platzhalter),
      },
      date: {
        now: (format, tage) => obsidian.moment(plugin.jetzt()).add(Number(tage) || 0, "days").format(format || "YYYY-MM-DD"),
        jetzt: () => plugin.jetzt(), // Date-Objekt (statt new Date(), damit Tests ein Datum vorgeben können)
      },
      // Je Aktionsaufruf überschrieben (Object.create): Parameter des Knopfs, zu befüllende Datei, Notiz mit dem Knopf, Aufruf von
      // außen (obsidian://-Link aus Browser oder anderer App)
      parameter: {},
      datei: null,
      quelle: null,
      extern: false,
      CURSOR,
      aktion: (name, parameter, extra) => plugin.aktionAusfuehren(name, parameter, extra),
      link: (aktion, parameter) => plugin.linkBauen(aktion, parameter),
      oeffnen: (datei, optionen) => plugin.notizOeffnen(datei, optionen),
      neuZeichnen: (pfade) => plugin.neuZeichnen(pfade),
    };
  }

  // ---------- Eingabe/Auswahl ----------
  eingabe(frage, vorschlag) {
    if (this.testAntworten.length) {
      const a = this.testAntworten.shift();
      this.testProtokoll.push({ frage: String(frage), antwort: a });
      return Promise.resolve(a == null ? null : String(a));
    }
    return new Promise((fertig) => new Eingabe(this.app, frage, vorschlag, fertig).open());
  }

  auswahl(texte, werte, platzhalter) {
    texte = typeof texte === "function" ? werte.map(texte) : texte;
    if (this.testAntworten.length) {
      const a = this.testAntworten.shift();
      this.testProtokoll.push({ frage: String(platzhalter || ""), antwort: a });
      if (a == null) return Promise.resolve(null);
      if (typeof a === "object" && "index" in a) return Promise.resolve(werte[a.index]);
      let i = werte.findIndex((w) => w === a);
      if (i < 0) i = texte.findIndex((t) => String(t).includes(String(a)));
      return Promise.resolve(i < 0 ? null : werte[i]);
    }
    return new Promise((fertig) => new Auswahl(this.app, texte, werte, platzhalter, fertig).open());
  }

  // Bestätigung → true (Knopf) | false (Abbrechen, Esc). Tests: true/false in testAntworten
  bestaetigen(o) {
    if (this.testAntworten.length) {
      const a = this.testAntworten.shift();
      this.testProtokoll.push({ frage: String(o.titel), text: o.text, antwort: a });
      return Promise.resolve(a === true);
    }
    return new Promise((fertig) => new Frage(this.app, o, fertig).open());
  }

  // ---------- Start ----------
  async starten() {
    for (const k of L_FRUEHER) if (this.lokal(k) != null) this.lokal(k, null);
    // Hot-Reload: geänderte/neue Skripte nach kurzer Pause neu laden (Sync schreibt evtl. in mehreren Schritten). Liste und
    // Signatur: danach neu prüfen und laden, was jetzt passt (skripteNachpruefen); sie kommen in beliebiger Reihenfolge.
    // Angemeldet schon vor dem ersten Laden (das wartet vielleicht bis zu SIG_FRIST auf das Release), damit keine Änderung
    // aus dieser Zeit verloren geht; ausgeführt wird erst danach.
    let geladen;
    const erstesLaden = new Promise((r) => { geladen = r; });
    const danach = (fn) => erstesLaden.then(() => { if (!this.entladen) return fn(); }).catch((e) => console.error("Studium Autopilot", e));
    const warten = {};
    const spaeter = (k, fn) => { clearTimeout(warten[k]); warten[k] = setTimeout(() => { delete warten[k]; danach(fn); }, 1500); };
    const istListe = (p) => p === LISTE || p === LISTE_SIG;
    const geaendert = (f) => {
      if (f && istListe(f.path)) { spaeter(LISTE, () => this.skripteNachpruefen()); return; }
      if (!this.istSkript(f)) return;
      spaeter(f.path, () => this.skriptNeuLaden(f));
    };
    this.register(() => { for (const k of Object.keys(warten)) clearTimeout(warten[k]); });
    this.registerEvent(this.app.vault.on("modify", geaendert));
    this.registerEvent(this.app.vault.on("create", geaendert));
    this.registerEvent(this.app.vault.on("delete", (f) => {
      if (f && istListe(f.path)) spaeter(LISTE, () => this.skripteNachpruefen());
      else if (this.istSkript(f)) danach(() => this.skriptEntfernen(f.basename));
    }));
    this.registerEvent(this.app.vault.on("rename", (f, alt) => {
      const a = String(alt || "");
      if (a.startsWith(SKRIPTE) && /\.js$/.test(a) && a.slice(SKRIPTE.length).indexOf("/") < 0) danach(() => this.skriptEntfernen(a.slice(SKRIPTE.length, -3)));
      if (istListe(a)) spaeter(LISTE, () => this.skripteNachpruefen());
      geaendert(f);
    }));
    // Wieder online und die Liste im Tresor gilt noch nicht: einmal je Lauf neu prüfen (holt, was offline nicht versucht wurde)
    let online = false;
    this.registerDomEvent(window, "online", () => danach(() => {
      if (online || !this.pruefung || this.pruefung.zustand === "signiert") return null;
      online = true;
      return this.skripteNachpruefen();
    }));
    try { await this.skripteLaden(true); } finally { geladen(); }
    this.gestartet = true; // wischenBeimStart: ab jetzt entscheidet seitenleiste.js
    if (this.entladen) return;
    // Ordner-Automatik: erst nach dem Start anmelden (beim Einlesen des Vaults meldet Obsidian jede Datei als „create“)
    this.registerEvent(this.app.vault.on("create", (f) => this.neueDatei(f)));
  }

  istSkript(f) {
    return f && f.path && f.path.startsWith(SKRIPTE) && f.extension === "js" && f.path.slice(SKRIPTE.length).indexOf("/") < 0;
  }

  // Erweiterung = liefert registrieren oder aktionen (Funktion, Kurzschreibweise im Rückgabeobjekt oder aktionen: …)
  istErweiterung(code) { return /\bregistrieren\s*(\(|=|:|,|\})|\baktionen\s*:/.test(code); }

  auswerten(code, pfad) {
    const modul = { exports: {} };
    // require für Skripte: Obsidians Plugin-require (obsidian, @codemirror/*), am PC ersatzweise window.require
    const req = (n) => { try { return require(n); } catch (e) { return window.require ? window.require(n) : undefined; } };
    const fn = window.eval("(function anonymous(require, module, exports){" + code + "\n})\n//# sourceURL=" + encodeURI(pfad));
    fn(req, modul, modul.exports);
    return modul.exports;
  }

  skriptDateien() {
    return this.app.vault.getFiles().filter((f) => this.istSkript(f)).sort((a, b) => a.basename.localeCompare(b.basename));
  }

  // Alle Skripte laden, dann die Erweiterungen starten (alphabetisch; Abhängigkeiten laufen über ctx.user, das zu
  // diesem Zeitpunkt schon vollständig ist). Vorher die Liste prüfen; gesperrte Skripte werden nie ausgewertet.
  async skripteLaden(start) {
    const fehler = [];
    // „Erweiterungen neu laden“: erst alles abmelden, was die laufenden Fassungen angemeldet haben
    if (!start) for (const name of Object.keys(this.erweiterungen)) this.skriptAbmelden(name);
    await this.listeAuswerten();
    if (this.entladen) return fehler;
    const dateien = this.skriptDateien();
    this.abgelehnt = {};
    for (const f of dateien) {
      try {
        const s = await this.skriptLesen(f);
        if (this.entladen) return fehler;
        if (!this.zulassen(f, s.sha)) { delete this.skripte[f.basename]; delete this.quellen[f.basename]; delete this.pruefsummen[f.basename]; continue; }
        this.skripte[f.basename] = this.auswerten(s.code, f.path);
        this.quellen[f.basename] = s.code;
        this.pruefsummen[f.basename] = s.sha;
      } catch (e) { console.error("Studium Autopilot: Skript " + f.path, e); fehler.push(`${f.basename} (${(e && e.message) || e})`); }
    }
    for (const f of dateien) {
      if (this.entladen) return fehler;
      if (!this.quellen[f.basename] || !this.istErweiterung(this.quellen[f.basename])) continue;
      try { await this.erweiterungStarten(f.basename, start); } catch (e) {
        console.error("Studium Autopilot: Erweiterung " + f.basename, e); fehler.push(`${f.basename} (${(e && e.message) || e})`);
      }
    }
    // Hinweis ohne Fehlertext (der steht in der Konsole); Wortliste: docs/design.md, „Sprache“
    if (fehler.length) new Notice(`Ein Teil der App ließ sich nicht laden (${fehler.map((x) => x.split(" (")[0]).join(", ")}). Bitte Obsidian einmal neu starten.`, 10000);
    if (start && this.entwickler()) new Notice("Der Entwicklermodus ist an. Skripte laufen auf diesem Gerät ohne Prüfung.", 8000);
    if (Object.keys(this.abgelehnt).length) this.ablehnungPlanen(ABLEHNUNG_START);
    this.neuZeichnen();
    return fehler;
  }

  // ---------- Prüfung der Skripte (docs/architektur/skripte-pruefen.md) ----------
  // Gerätespeicher lesen/schreiben (app.loadLocalStorage: je Gerät und Tresor); v = null löscht
  lokal(k, v) {
    if (v === undefined) { try { return this.app.loadLocalStorage(k); } catch (e) { return null; } }
    try { this.app.saveLocalStorage(k, v); } catch (e) { console.error("Studium Autopilot: Gerätespeicher " + k, e); }
    return v;
  }

  entwickler() { return this.lokal(L_ENTWICKLER) === true; }

  erlaubtAufGeraet() {
    const e = this.lokal(L_ERLAUBT);
    return e && typeof e === "object" && !Array.isArray(e) ? e : {};
  }

  mengenLesen() {
    const m = this.lokal(L_LISTEN);
    return (Array.isArray(m) ? m : []).filter(mengeOk);
  }

  kernVersion() { return (this.manifest && this.manifest.version) || ""; }

  // Listen von Testversionen gelten nur mit dem Schalter „Beta-Versionen“ (in der App umgelegt) oder im Entwicklermodus
  testversionen() { return this.lokal(L_BETA) === true || this.entwickler(); }

  // ctx.skripte.beta(an): nur der Schalter „Beta-Versionen“ in update.js ruft das, wenn du ihn in der App umlegst
  async testversionenSetzen(an) {
    this.lokal(L_BETA, an ? true : null);
    await this.skripteNachpruefen();
    return this.testversionen();
  }

  // Darf eine Liste dieser Version gelten? → "" | "zurueck" (älter als der laufende Kern oder, für eine neue Liste, als die Marke
  // hoch) | "beta" (Testversion ohne testversionen()). Die Liste der Version des laufenden Kerns gilt immer. Für eine schon
  // angenommene Liste ist hoch "": Sie bleibt nach behalten().
  versionGrund(v, hoch) {
    const kern = this.kernVersion();
    if (v === kern) return "";
    if (neuer(kern, v) || (hoch && neuer(hoch, v))) return "zurueck";
    return istTestversion(v) && !this.testversionen() ? "beta" : "";
  }

  // Marke: keine neue Liste darunter. Die neueste angenommene fertige Version (L_HOECHSTE; fehlt sie, die neueste fertige der
  // gemerkten Listen); Testversionen zählen nur mit testversionen() (L_HOECHSTE_BETA), sonst gilt nach dem Ausschalten des
  // Schalters keine fertige Version darunter mehr. → Version oder ""
  hoechste(mengen) {
    const gilt = (v, test) => typeof v === "string" && !!semver(v) && istTestversion(v) === test;
    const hoeher = (a, b) => (a && (!b || neuer(a, b)) ? a : b);
    const stabil = gilt(this.lokal(L_HOECHSTE), false) ? this.lokal(L_HOECHSTE)
      : mengen.map((m) => m.version).filter((v) => !istTestversion(v)).reduce(hoeher, "");
    const test = this.testversionen() && gilt(this.lokal(L_HOECHSTE_BETA), true) ? this.lokal(L_HOECHSTE_BETA) : "";
    return hoeher(test, stabil);
  }

  // Marke nachziehen, wenn eine neuere Liste angenommen wurde (fertige und Testversionen getrennt)
  hoechsteMerken(v) {
    const k = istTestversion(v) ? L_HOECHSTE_BETA : L_HOECHSTE, alt = this.lokal(k);
    if (!(typeof alt === "string" && semver(alt) && istTestversion(alt) === istTestversion(v) && !neuer(v, alt))) this.lokal(k, v);
  }

  // Welche angenommenen Listen bleiben: die der Version des laufenden Kerns und die NEUERE_MAX neuesten neueren (bis zur Marke, über
  // ihr nimmt der Kern keine an). Ältere als der Kern fallen weg (nie zurück auf alten Code), Testversionen ohne testversionen()
  // auch (außer der des Kerns). Ein Kern, der hinterherhinkt, behält so auch die Liste, nach der der Tresor gerade läuft.
  behalten(mengen) {
    const kern = this.kernVersion();
    const gilt = mengen.filter((m) => m.version === kern || (neuer(m.version, kern) && (!istTestversion(m.version) || this.testversionen())));
    const eigene = gilt.filter((m) => m.version === kern).slice(0, 1);
    const neuere = gilt.filter((m) => m.version !== kern).sort(neuesteZuerst).slice(0, NEUERE_MAX);
    return eigene.concat(neuere);
  }

  // Für ctx.skripte.listen(): die signierten Listen, die dieses Gerät gerade gelten lässt, neueste zuerst → [{ version, liste }]
  signierteListen() {
    const mengen = this.pruefung ? this.pruefung.mengen : this.behalten(this.mengenLesen());
    return mengen.filter((m) => m.art === "signiert").sort(neuesteZuerst).map((m) => ({ version: m.version, liste: m.liste }));
  }

  // Bytes einer Datei im Tresor oder null
  async dateiBytes(pfad) {
    try {
      const f = this.app.vault.getAbstractFileByPath(pfad);
      if (f instanceof TFile) return new Uint8Array(await this.app.vault.readBinary(f));
      const a = this.app.vault.adapter;
      if (a && (await a.exists(pfad))) return new Uint8Array(await a.readBinary(pfad));
    } catch (e) { console.error("Studium Autopilot: lesen " + pfad, e); }
    return null;
  }

  // Ein Skript lesen: SHA-256 über die Bytes mit LF statt CRLF, und genau diese Bytes als Code. → { sha, code }
  async skriptLesen(f) {
    const by = ohneCR(new Uint8Array(await this.app.vault.readBinary(f)));
    return { sha: await sha256Hex(by), code: dec(by) };
  }

  // Datei name (system-dateien.json oder ihre .sig) aus dem GitHub-Release der Version: fester Ort, Version geprüft, höchstens max
  // Bytes und frist ms. → { by } | { fehler: "offline" (das Gerät meldet, dass es offline ist: keine Anfrage) | "netz" (Netzfehler,
  // Zeit abgelaufen, eine andere Antwort als 2xx oder 404) | "fehlt" (404, oder die Antwort taugt nicht) }
  async releaseHolen(version, name, max, frist) {
    if (!semver(version)) return { fehler: "fehlt" };
    if (typeof navigator !== "undefined" && navigator && navigator.onLine === false) return { fehler: "offline" };
    const url = this.testUpdateBasis ? String(this.testUpdateBasis).replace(/\/?$/, "/") + name : RELEASES + "/download/v" + version + "/" + name;
    let r;
    try { r = await mitFrist(obsidian.requestUrl({ url, method: "GET", throw: false }), Number(this.testSigFrist) || frist); } catch (e) { return { fehler: "netz" }; }
    const status = r ? Number(r.status) : 0;
    if (status !== 404 && !(status >= 200 && status < 300)) return { fehler: "netz" };
    const by = status === 200 ? new Uint8Array(r.arrayBuffer) : null;
    return by && by.length && by.length <= max ? { by } : { fehler: "fehlt" };
  }

  // Signatur der Liste einer Version aus dem Release → Bytes | null. Gemerkt (sigGeholt) wird nur eine echte Antwort (2xx oder 404),
  // dann fragt der Kern in diesem Lauf von selbst nicht mehr; nach einem Netzfehler oder „offline“ später noch einmal. Nach einem
  // Tipp (neu) immer.
  async signaturHolen(version, neu) {
    if (!neu && hat(this.sigGeholt, version)) return this.sigGeholt[version];
    const r = await this.releaseHolen(version, "system-dateien.json.sig", SIGNATUR_MAX, neu ? REPARIEREN_FRIST : SIG_FRIST);
    if (r.fehler === "offline" || r.fehler === "netz") return null;
    this.sigGeholt[version] = r.by || null;
    return this.sigGeholt[version];
  }

  // Liste und Signatur auf der Platte prüfen und this.pruefung setzen. Neu gilt eine Liste nur mit gültiger Signatur (listeSigniert)
  // und einer Version, die versionGrund() zulässt; ohne gültige Signatur nie. Dieselben Bytes (bis auf CRLF) wie eine angenommene
  // Liste gelten ohne neue Prüfung (schneller Start mit dem eingebauten Prüfer). Fehlt die Signatur im Tresor, kommt sie aus dem
  // Release (signaturHolen): erst die der Version des laufenden Kerns, dann die der Liste, wenn diese gelten kann (von selbst je Lauf
  // außer der Kern-Version nur eine Version, sigAndere). Das ist eine
  // Anfrage an GitHub wie beim Update, darum auch bei ausgeschalteten zentralen Daten. Angenommene Listen bleiben nach behalten();
  // ein Skript gilt, wenn es zu einer davon passt. o.holen: nach einem Tipp (Reparieren) holen, auch wenn die im Tresor nicht passt.
  async listeAuswerten(o) {
    const holen = !!(o && o.holen), kern = this.kernVersion(), vorher = this.mengenLesen(), hoch = this.hoechste(vorher);
    const listeBy = await this.dateiBytes(LISTE);
    let neu = null, zustand = "keine-liste", listeSha = "", version = "";
    if (listeBy && listeBy.length <= LISTE_MAX) {
      const liste = skripteAusListe(listeBy);
      listeSha = await sha256Hex(ohneCR(listeBy));
      zustand = "liste-ungueltig";
      if (liste) {
        version = liste.version;
        const bekannt = vorher.some((m) => m.liste === listeSha);
        const grund = this.versionGrund(liste.version, bekannt ? "" : hoch);
        let r = bekannt ? { ok: true } : null;
        if (!r) {
          const sig = await this.dateiBytes(LISTE_SIG);
          r = sig ? await listeSigniert(sig, listeBy) : null;
          if ((!r || (!r.ok && r.art !== "krypto")) && (holen || !sig)) {
            // Nach einem Tipp zuerst die Signatur der Version, die die Liste nennt (so zeigt sich auch eine echte Testversion als
            // solche), dann die der Kern-Version; von selbst erst die Kern-Version, die der Liste nur, wenn sie gelten kann
            const versionen = holen ? [liste.version, kern] : grund ? [kern] : [kern, liste.version];
            for (const v of versionen.filter((x, i) => versionen.indexOf(x) === i)) {
              // Von selbst je Lauf nur die Kern-Version und eine weitere; mehr erst nach einem Tipp
              if (!holen && v !== kern) {
                if (this.sigAndere && this.sigAndere !== v) continue;
                this.sigAndere = v;
              }
              const geholt = await this.signaturHolen(v, holen);
              const rg = geholt ? await listeSigniert(geholt, listeBy) : null;
              // Die Signatur einer anderen Version passt nie; dass sie nicht passt, sagt nichts über diese Liste
              if (rg && (rg.ok || (!r && v === liste.version))) r = rg;
              if (r && r.ok) break;
            }
          }
        }
        if (r && r.ok) {
          if (grund) zustand = grund;
          else { neu = { art: "signiert", version: liste.version, liste: listeSha, skripte: liste.skripte, kern: liste.kern }; zustand = "signiert"; }
        }
        else if (r && r.art === "krypto") zustand = "nicht-pruefbar";
        else zustand = r ? "signatur-ungueltig" : "ohne-signatur";
      }
    }
    const mengen = this.behalten(neu ? [neu].concat(vorher.filter((m) => m.liste !== neu.liste)) : vorher), roh = this.lokal(L_LISTEN);
    if (JSON.stringify(mengen) !== JSON.stringify(roh == null ? [] : roh)) this.lokal(L_LISTEN, mengen.length ? mengen : null);
    if (neu) this.hoechsteMerken(neu.version);
    this.pruefung = { mengen, zustand, liste: listeSha, version };
    return this.pruefung;
  }

  // Darf das Skript laufen? → "liste" | "geraet" | "entwickler" | "" (gesperrt)
  skriptPruefen(pfad, sha) {
    if (this.entwickler()) return "entwickler";
    const p = nfc(pfad), mengen = (this.pruefung && this.pruefung.mengen) || [];
    if (mengen.some((m) => inMenge(m, p, sha))) return "liste";
    const e = this.erlaubtAufGeraet();
    return hat(e, p) && e[p] === sha ? "geraet" : "";
  }

  // Prüfen und merken: gesperrt → in this.abgelehnt (nie ausgewertet), sonst dort heraus. → true, wenn es laufen darf
  zulassen(f, sha) {
    const name = f.basename;
    if (this.skriptPruefen(f.path, sha)) { delete this.abgelehnt[name]; return true; }
    const p = nfc(f.path), mengen = (this.pruefung && this.pruefung.mengen) || [];
    this.abgelehnt[name] = { name, pfad: f.path, sha, grund: mengen.some((m) => hat(m.skripte, p)) ? "geaendert" : "unbekannt" };
    return false;
  }

  // Nach einer neuen Liste oder Signatur (auch per Sync, in beliebiger Reihenfolge) und nach dem Entwicklermodus: neu prüfen und
  // gesperrte Skripte laden, die jetzt passen. Läufe nacheinander.
  skripteNachpruefen() {
    const lauf = (this.nachpruefenLauf || Promise.resolve()).then(async () => {
      if (this.entladen) return;
      await this.listeAuswerten();
      await this.gesperrteNachladen();
    }).catch((e) => console.error("Studium Autopilot: Prüfung der Skripte", e));
    this.nachpruefenLauf = lauf;
    return lauf;
  }

  // Jedes gesperrte Skript noch einmal durch die Prüfung (lädt, was jetzt passt)
  async gesperrteNachladen() {
    for (const f of this.skriptDateien()) if (this.abgelehnt[f.basename]) await this.skriptNeuLaden(f);
  }

  // Hinweis auf gesperrte Skripte nach ms Ruhe (jeder neue Fund verschiebt ihn), nicht während eines Updates (stillBis)
  ablehnungPlanen(ms) {
    clearTimeout(this.ablehnungTimer);
    if (this.entladen) return;
    this.ablehnungTimer = setTimeout(() => this.ablehnungZeigen(), ms);
  }

  ablehnungZeigen() {
    clearTimeout(this.ablehnungTimer);
    this.ablehnungTimer = null;
    if (this.entladen) return null;
    if (this.stillBis > Date.now()) { this.ablehnungPlanen(this.stillBis - Date.now() + 1000); return null; }
    const namen = Object.keys(this.abgelehnt).sort();
    const merk = namen.map((n) => n + ":" + this.abgelehnt[n].sha).join(",");
    if (!namen.length || merk === this.ablehnungGezeigt) return null;
    this.ablehnungGezeigt = merk;
    const p = this.pruefung || { mengen: [], zustand: "keine-liste", version: "" }, ohneListe = !p.mengen.length;
    let text;
    if (p.zustand === "beta") text = BETA_TEXT(p.version, namen);
    else if (ohneListe && p.zustand === "ohne-signatur") text = `Die App startet, sobald sie einmal geprüft hat, dass ihre Teile echt sind (${namenText(namen)}). Dafür braucht dieses Gerät einmal eine Verbindung zum Internet. Ist es verbunden, tippe auf „Reparieren“.`;
    else if (ohneListe && p.zustand === "nicht-pruefbar") text = `Die App startet nicht, weil dieses Gerät nicht prüfen kann, ob ihre Teile echt sind (${namenText(namen)}). Dafür braucht es eine neuere Version des Betriebssystems.`;
    // Diese Zustände kann jeder herstellen, der in den Tresor schreibt: Der Hinweis bietet nur Reparieren an, nie den
    // Entwicklermodus oder das Erlauben
    else if (ohneListe && p.zustand === "keine-liste") text = `Die App startet nicht, weil im Tresor die Liste ihrer Teile fehlt (${namenText(namen)}).`;
    else if (ohneListe && p.zustand === "zurueck") text = `Die App startet nicht, weil im Tresor die Liste einer älteren Version liegt (${namenText(namen)}).`;
    else if (ohneListe) text = `Die App startet nicht, weil sich die Liste ihrer Teile nicht prüfen lässt (${namenText(namen)}).`;
    else {
      // geändert (eine geprüfte Liste nennt den Pfad): passt nicht zur Version; unbekannt: gehört nicht zur App
      const geaendert = namen.filter((n) => this.abgelehnt[n].grund === "geaendert"), fremd = namen.filter((n) => this.abgelehnt[n].grund !== "geaendert");
      const saetze = [];
      if (geaendert.length === 1) saetze.push(`Ein Teil der App wurde nicht gestartet, weil er nicht zur installierten Version passt (${geaendert[0]}).`);
      else if (geaendert.length) saetze.push(`Teile der App wurden nicht gestartet, weil sie nicht zur installierten Version passen (${namenText(geaendert)}).`);
      if (fremd.length === 1) saetze.push(`${fremd[0]} gehört nicht zur App und wurde nicht geladen.`);
      else if (fremd.length) saetze.push(`${namenText(fremd)} gehören nicht zur App und wurden nicht geladen.`);
      text = saetze.join(" ");
    }
    // Reparieren: echte Fassung für geänderte; gilt die Liste im Tresor nicht, holt der Tipp ihre Signatur oder die echte Liste.
    // Bei einer Testversion hilft nur der Schalter. Hinkt der Kern hinterher: Neu laden holt ihn nach (kernAufholen).
    const knoepfe = [], auf = this.kernAufholbar();
    if (p.zustand !== "beta" && (this.reparierbare().length || this.listeReparierbar())) knoepfe.push({ text: "Reparieren", tun: () => this.reparierenFragen() });
    if (auf) {
      text += ` Auf diesem Gerät läuft noch Version ${this.kernVersion()}; „Neu laden“ holt Version ${auf.version}.`;
      knoepfe.push({ text: "Neu laden", tun: () => this.kernAufholenFragen() });
    }
    this.ablehnungHinweis = this.knopfHinweis(text, knoepfe, 20000);
    return this.ablehnungHinweis;
  }

  // Alles Gesperrte ist geladen: Hinweis weg
  ablehnungErledigt() {
    if (Object.keys(this.abgelehnt).length) return;
    this.ablehnungGezeigt = "";
    clearTimeout(this.ablehnungTimer);
    this.ablehnungTimer = null;
    try { if (this.ablehnungHinweis) this.ablehnungHinweis.hide(); } catch (e) { /* schon weg */ }
    this.ablehnungHinweis = null;
  }

  // Hinweis mit Knöpfen in der Gestalt von ctx.hinweis (.eba-toast); hinweis.js kann selbst gesperrt sein. knoepfe: [{ text, tun }],
  // der Hauptknopf zuletzt (wie in allen Fenstern)
  knopfHinweis(text, knoepfe, dauer) {
    if (!knoepfe.length || typeof document === "undefined" || typeof document.createDocumentFragment !== "function") return new Notice(text, dauer);
    const f = document.createDocumentFragment();
    const box = f.createDiv({ cls: "eba-toast" });
    box.createDiv({ cls: "eba-toast-text", text });
    const reihe = box.createDiv({ cls: "eba-toast-knoepfe" });
    let n = null;
    knoepfe.forEach((k, i) => {
      reihe.createEl("button", { text: k.text, cls: "eba-toast-knopf" + (i === knoepfe.length - 1 ? " mod-cta" : ""), attr: { type: "button" } }).addEventListener("click", () => {
        try { if (n) n.hide(); } catch (e) { /* schon weg */ }
        Promise.resolve().then(k.tun).catch((e) => console.error("Studium Autopilot: " + k.text, e));
      });
    });
    n = new Notice(f, dauer);
    return n;
  }

  // Liste, nach der repariert wird: die im Tresor, wenn dieses Gerät sie angenommen hat, sonst die neueste angenommene
  zielListe() {
    const p = this.pruefung;
    if (!p || !p.mengen.length) return null;
    return p.mengen.filter((m) => m.liste === p.liste)[0] || p.mengen.slice().sort(neuesteZuerst)[0];
  }

  // Gesperrte Skripte, die die Liste m (Standard: die Zielliste) mit einer anderen Prüfsumme nennt → [{ name, pfad, sha, grund }]
  reparierbare(m) {
    const z = m || this.zielListe();
    if (!z) return [];
    return Object.keys(this.abgelehnt).sort().map((n) => this.abgelehnt[n])
      .filter((a) => hat(z.skripte, nfc(a.pfad)) && z.skripte[nfc(a.pfad)].sha256 !== a.sha);
  }

  // Version, deren Liste Reparieren in den Tresor legt: die höhere von Kern-Version und Marke, nie eine darunter (sonst setzte ein
  // Gerät, das hinterherhinkt, den gemeinsamen Tresor zurück)
  zielVersion() {
    const kern = this.kernVersion(), hoch = this.hoechste(this.mengenLesen());
    return hoch && neuer(hoch, kern) ? hoch : kern;
  }

  // Gilt die Liste im Tresor nicht und kann ein Tipp das ändern (Signatur holen, sonst die echte Liste der Zielversion)? Eine echte
  // Testversion (beta) ersetzt Reparieren nie.
  listeReparierbar() {
    const z = this.pruefung ? this.pruefung.zustand : "keine-liste";
    return z !== "signiert" && z !== "beta" && z !== "nicht-pruefbar" && !!semver(this.zielVersion());
  }

  // Befehl „Skripte reparieren …“ und Knopf im Hinweis; ein Tipp darf abrufen, auch bei ausgeschalteten zentralen Daten. Nur der
  // Kern, darum auch, wenn update.js selbst gesperrt ist. → true, wenn alles Reparierbare repariert ist
  // 1. Gilt die Liste im Tresor nicht: ihre Signatur neu aus dem Release; was dann passt, läuft ohne Download.
  // 2. Gilt sie immer noch nicht (lässt sich nicht prüfen, fehlt, liegt unter der Marke): die echte Liste der Zielversion samt
  //    Signatur aus dem Release (zielListeHolen), nach Bestätigung statt der im Tresor (listeErsetzen); Liste und Signatur aus dem
  //    Tresor kommen vorher in die Sicherung.
  // 3. Gesperrte Skripte, die die Liste nennt: die echte Fassung vom Tag (reparieren).
  async reparierenFragen() {
    if (!Object.keys(this.abgelehnt).length) { new Notice("Es gibt nichts zu reparieren.", 6000); return false; }
    if (!this.pruefung || this.pruefung.zustand !== "signiert") {
      await this.listeAuswerten({ holen: true });
      await this.gesperrteNachladen();
      if (!Object.keys(this.abgelehnt).length) { new Notice("Alles ist wieder da.", 6000); return true; }
    }
    if (this.pruefung.zustand === "beta") { new Notice(BETA_TEXT(this.pruefung.version), 10000); return false; }
    let ersatz = null;
    if (this.listeReparierbar()) {
      ersatz = await this.zielListeHolen();
      if (ersatz.fehler) { new Notice(REPARIEREN_FEHLER[ersatz.fehler], 8000); return false; }
    }
    const m = ersatz ? ersatz.menge : this.zielListe(), faelle = this.reparierbare(m);
    if (!faelle.length && !ersatz) {
      new Notice(this.pruefung.mengen.length ? "Reparieren geht hier nicht, weil diese Teile nicht zur App gehören." : REPARIEREN_FEHLER.fehlt, 6000);
      return false;
    }
    const namen = faelle.map((a) => a.name), p = this.pruefung;
    const lage = p.zustand === "zurueck" ? `Im Tresor liegt die Liste von Version ${p.version}; dieses Gerät kennt schon Version ${m.version}.`
      : p.zustand === "keine-liste" ? "Im Tresor fehlt die Liste der App." : "Die Liste der App im Tresor lässt sich nicht prüfen.";
    const ja = await this.bestaetigen({ titel: "Reparieren?", knopf: "Reparieren", text: ersatz ? [
      `${lage} Die echte Liste von Version ${m.version} kommt neu von GitHub` + (namen.length ? `, dazu die echte Fassung von ${namenText(namen)}.` : "."),
      "Was jetzt im Tresor liegt, kommt vorher in die Sicherung."] : [
      `Die echte Fassung von ${namenText(namen)} kommt aus Version ${m.version} neu von GitHub.`,
      "Die Fassung, die jetzt im Tresor liegt, kommt vorher in die Sicherung."] });
    if (!ja) return false;
    const ordner = SICHERUNG + m.version + " " + stempel(new Date());
    if (!ersatz) return this.reparieren(faelle, m, ordner, []);
    if (!(await this.listeErsetzen(ersatz, ordner))) return false;
    return this.reparieren(this.reparierbare(), this.zielListe(), ordner, ["Liste der App"]);
  }

  // Echte Liste der Zielversion samt Signatur aus ihrem GitHub-Release, geprüft: Signatur, Version, und hat dieses Gerät die Liste
  // dieser Version schon angenommen, dieselbe SHA-256 → { liste, sig, menge } | { fehler }
  async zielListeHolen() {
    const v = this.zielVersion();
    const s = await this.releaseHolen(v, "system-dateien.json.sig", SIGNATUR_MAX, REPARIEREN_FRIST);
    if (s.fehler) return s;
    const l = await this.releaseHolen(v, "system-dateien.json", LISTE_MAX, REPARIEREN_FRIST);
    if (l.fehler) return l;
    const liste = skripteAusListe(l.by), r = await listeSigniert(s.by, l.by);
    if (!r.ok) return { fehler: r.art === "krypto" ? "fehlt" : "pruefung" };
    const sha = await sha256Hex(ohneCR(l.by));
    if (!liste || liste.version !== v || this.mengenLesen().some((m) => m.version === v && m.liste !== sha)) return { fehler: "pruefung" };
    return { liste: l.by, sig: s.by, menge: { art: "signiert", version: v, liste: sha, skripte: liste.skripte, kern: liste.kern } };
  }

  // Liste und Signatur aus zielListeHolen in den Tresor: was dort lag, vorher in die Sicherung (ordner). Danach neu prüfen und
  // laden, was jetzt passt. → true, wenn die neue Liste gilt
  async listeErsetzen(e, ordner) {
    this.stillBis = Math.max(Number(this.stillBis) || 0, Date.now() + HINWEIS_RUHE + 2000); // kein „Aktualisiert: …“ je Datei
    try {
      for (const [pfad, by] of [[LISTE, e.liste], [LISTE_SIG, e.sig]]) {
        const alt = await this.dateiBytes(pfad);
        if (alt) await this.sicherungSchreiben(ordner + "/" + pfad, alt);
        const f = this.app.vault.getAbstractFileByPath(pfad);
        if (f instanceof TFile) { await this.app.vault.modifyBinary(f, puffer(by)); continue; }
        await this.ordnerAnlegen(pfad);
        try { await this.app.vault.createBinary(pfad, puffer(by)); } catch (x) { await this.app.vault.adapter.writeBinary(pfad, puffer(by)); }
      }
      await this.listeAuswerten();
      await this.gesperrteNachladen();
    } catch (x) { console.error("Studium Autopilot: Reparieren", x); }
    if (this.pruefung && this.pruefung.zustand === "signiert" && this.pruefung.liste === e.menge.liste) return true;
    new Notice("Reparieren hat nicht ganz geklappt. Bitte noch einmal versuchen.", 8000);
    return false;
  }

  // Jede Datei vom Tag v<version> laden und mit Größe und SHA-256 der Liste prüfen; erst wenn alle da sind, die alte Fassung in
  // die Sicherung (ordner, wie update.js), die neue schreiben und laden. vorab: schon Repariertes für den Hinweis. → true | false
  async reparieren(faelle, m, ordner, vorab) {
    const basis = this.testUpdateBasis ? String(this.testUpdateBasis).replace(/\/?$/, "/") : RELEASE_ROH + "v" + m.version + "/";
    const geladen = [];
    try {
      for (const a of faelle) {
        const p = nfc(a.pfad), e = m.skripte[p];
        const url = basis + (ORDNER + "/" + p).split("/").map(encodeURIComponent).join("/");
        let r;
        try { r = await obsidian.requestUrl({ url, method: "GET", throw: false }); } catch (x) { r = null; }
        if (!r || r.status !== 200) throw Object.assign(new Error("nicht geladen: " + a.pfad), { art: "netz" });
        const by = new Uint8Array(r.arrayBuffer);
        if (by.length !== e.groesse || (await sha256Hex(by)) !== e.sha256) throw Object.assign(new Error("Prüfsumme: " + a.pfad), { art: "pruefsumme" });
        geladen.push({ a, by });
      }
    } catch (e) {
      console.error("Studium Autopilot: Reparieren", e);
      new Notice(e.art === "netz" ? REPARIEREN_FEHLER.netz : REPARIEREN_FEHLER.pruefung, 8000);
      return false;
    }
    const fertig = vorab.slice();
    this.stillBis = Math.max(Number(this.stillBis) || 0, Date.now() + HINWEIS_RUHE + 2000); // kein „Aktualisiert: …“ je Datei
    try {
      for (const g of geladen) {
        const f = this.app.vault.getAbstractFileByPath(g.a.pfad);
        if (!(f instanceof TFile)) continue;
        await this.sicherungSchreiben(ordner + "/" + g.a.pfad, new Uint8Array(await this.app.vault.readBinary(f)));
        await this.app.vault.modifyBinary(f, puffer(g.by));
        await this.skriptNeuLaden(f);
        fertig.push(g.a.name);
      }
    } catch (e) {
      console.error("Studium Autopilot: Reparieren", e);
      new Notice("Reparieren hat nicht ganz geklappt. Bitte noch einmal versuchen.", 8000);
      return false;
    }
    new Notice(`Repariert (${namenText(fertig)}). Die alte Fassung liegt in der Sicherung.`, 8000);
    return true;
  }

  // Ordner einer Datei anlegen, wo sie fehlen (über den Adapter: auch versteckte wie .trash)
  async ordnerAnlegen(pfad) {
    const a = this.app.vault.adapter, teile = pfad.split("/");
    let p = "";
    for (let i = 0; i < teile.length - 1; i++) {
      p = p ? p + "/" + teile[i] : teile[i];
      if (!(await a.exists(p))) await a.mkdir(p);
    }
  }

  // Datei in die Sicherung (.trash/…, versteckt: über den Adapter, Ordner zuerst)
  async sicherungSchreiben(pfad, by) {
    await this.ordnerAnlegen(pfad);
    await this.app.vault.adapter.writeBinary(pfad, puffer(by));
  }

  // Hinkt der Kern hinterher (Marke über seiner Version) und nennt die angenommene Liste der Marke die Dateien des Kerns: diese Liste,
  // sonst null
  kernAufholbar() {
    const kern = this.kernVersion(), hoch = this.hoechste(this.mengenLesen());
    if (!hoch || !neuer(hoch, kern)) return null;
    const mengen = this.pruefung ? this.pruefung.mengen : this.behalten(this.mengenLesen());
    const m = mengen.filter((x) => x.version === hoch)[0];
    return m && m.kern && Object.keys(m.kern).length ? m : null;
  }

  // Befehl „Neue Version auf diesem Gerät laden …“ und Knopf „Neu laden“ im Hinweis (nie über einen Link): Der Kern holt sich selbst
  // nach, auch wenn update.js gesperrt ist. → true, wenn der neue Kern läuft
  async kernAufholenFragen() {
    const m = this.kernAufholbar();
    if (!m) { new Notice("Auf diesem Gerät läuft schon die neueste geprüfte Version.", 6000); return false; }
    const ja = await this.bestaetigen({ titel: "Neu laden?", knopf: "Neu laden", text: [
      `Auf diesem Gerät läuft noch Version ${this.kernVersion()}. Die Dateien der App von Version ${m.version} kommen neu von GitHub, danach startet die App neu.`,
      "Die Fassung, die jetzt auf diesem Gerät liegt, kommt vorher in die Sicherung."] });
    return ja ? this.kernAufholen(m) : false;
  }

  // Dateien des Kerns vom Tag v<m.version> laden, Größe und SHA-256 aus der angenommenen Liste m; was schon so auf der Platte liegt,
  // bleibt. Erst wenn alle da sind: die alte Fassung in die Sicherung (wie update.js), die neue schreiben, manifest.json zuletzt (ein
  // Schreibfehler setzt das schon Geschriebene zurück), dann das Plugin neu laden. → true | false
  async kernAufholen(m) {
    const basis = this.testUpdateBasis ? String(this.testUpdateBasis).replace(/\/?$/, "/") : RELEASE_ROH + "v" + m.version + "/";
    const a = this.app.vault.adapter, faelle = [];
    try {
      for (const p of KERN_PFADE) {
        const e = hat(m.kern, p) ? m.kern[p] : null;
        if (!e) continue;
        const alt = await this.dateiBytes(p);
        if (alt && alt.length === e.groesse && (await sha256Hex(alt)) === e.sha256) continue;
        const url = basis + (ORDNER + "/" + p).split("/").map(encodeURIComponent).join("/");
        let r;
        try { r = await obsidian.requestUrl({ url, method: "GET", throw: false }); } catch (x) { r = null; }
        if (!r || r.status !== 200) throw Object.assign(new Error("nicht geladen: " + p), { art: "netz" });
        const by = new Uint8Array(r.arrayBuffer);
        if (by.length !== e.groesse || (await sha256Hex(by)) !== e.sha256) throw Object.assign(new Error("Prüfsumme: " + p), { art: "pruefsumme" });
        faelle.push({ p, alt, by });
      }
    } catch (e) {
      console.error("Studium Autopilot: Neu laden", e);
      new Notice(e.art === "netz" ? REPARIEREN_FEHLER.netz : REPARIEREN_FEHLER.pruefung, 8000);
      return false;
    }
    const ordner = SICHERUNG + this.kernVersion() + " " + stempel(new Date()), fertig = [];
    try {
      for (const f of faelle) {
        if (f.alt) await this.sicherungSchreiben(ordner + "/" + f.p, f.alt);
        await this.ordnerAnlegen(f.p);
        await a.writeBinary(f.p, puffer(f.by));
        fertig.push(f);
      }
    } catch (e) {
      console.error("Studium Autopilot: Neu laden", e);
      for (const f of fertig) {
        try { if (f.alt) await a.writeBinary(f.p, puffer(f.alt)); else if (typeof a.remove === "function") await a.remove(f.p); } catch (x) { console.error("Studium Autopilot: zurück " + f.p, x); }
      }
      new Notice("Neu laden hat nicht geklappt. Es wurde nichts geändert.", 8000);
      return false;
    }
    if (await this.kernNeuStarten()) return true;
    new Notice("Bitte Obsidian einmal schließen und wieder öffnen.", 10000);
    return false;
  }

  // Das Plugin aus- und wieder einschalten (wie update.js nach einem Update): lädt den Kern von der Platte neu → true, wenn er läuft
  async kernNeuStarten() {
    const pl = this.app.plugins, id = (this.manifest && this.manifest.id) || PROTOKOLL;
    if (!pl || typeof pl.disablePlugin !== "function" || typeof pl.enablePlugin !== "function") return false;
    try {
      await pl.disablePlugin(id);
      if (typeof pl.loadManifests === "function") await pl.loadManifests();
      await pl.enablePlugin(id);
      return !!(pl.plugins && pl.plugins[id]);
    } catch (e) { console.error("Studium Autopilot: neu starten", e); return false; }
  }

  // Befehl „Skript auf diesem Gerät erlauben …“: ein gesperrtes Skript wählen, mit Pfad und Warnung bestätigen; erlaubt ist genau
  // diese Fassung (SHA-256), jede Änderung ist wieder gesperrt. → true, wenn erlaubt
  async erlaubenFragen() {
    const liste = Object.keys(this.abgelehnt).sort().map((n) => this.abgelehnt[n]);
    if (!liste.length) { new Notice("Gerade ist kein Skript gesperrt.", 5000); return false; }
    const wahl = await this.auswahl(liste.map((a) => a.pfad), liste, "Welches Skript erlauben?");
    if (!wahl) return false;
    const ja = await this.bestaetigen({ titel: "Skript auf diesem Gerät erlauben?", knopf: "Erlauben", warnung: true, text: [
      `${wahl.pfad} gehört nicht zur installierten Version der App.`,
      "Erlaubst du es, startet die App es auf diesem Gerät mit allen Rechten von Obsidian: Am Computer kann es alle deine Dateien lesen und ändern und Programme starten.",
      "Erlaube nur ein Skript, das du selbst geschrieben hast. Ändert es sich, ist es wieder gesperrt."] });
    if (!ja) return false;
    const f = this.app.vault.getAbstractFileByPath(wahl.pfad);
    const jetzt = f instanceof TFile ? await this.skriptLesen(f) : null;
    if (!jetzt || jetzt.sha !== wahl.sha) { new Notice("Das Skript hat sich gerade geändert. Bitte noch einmal versuchen.", 6000); return false; }
    const e = this.erlaubtAufGeraet();
    e[nfc(wahl.pfad)] = wahl.sha;
    this.lokal(L_ERLAUBT, e);
    await this.skriptNeuLaden(f);
    if (this.abgelehnt[wahl.name]) return false;
    new Notice(`${wahl.name} ist auf diesem Gerät erlaubt und läuft.`, 6000);
    return true;
  }

  // Befehl „Entwicklermodus einschalten …“: nur nach Bestätigung, nur dieses Gerät und dieser Tresor
  async entwicklerFragen() {
    const ja = await this.bestaetigen({ titel: "Entwicklermodus einschalten?", knopf: "Einschalten", warnung: true, text: [
      "Nur für einen Tresor, in dem du die App selbst weiterentwickelst.",
      "Dann startet die App auf diesem Gerät in diesem Tresor jedes Skript aus System/Skripte ohne Prüfung, auch geänderte und unbekannte, und lädt jede Änderung sofort. Ein Skript darf alles, was Obsidian darf: Am Computer kann es alle deine Dateien lesen und ändern und Programme starten.",
      "Ausschalten mit dem Befehl „Entwicklermodus ausschalten“."] });
    if (!ja) return false;
    this.lokal(L_ENTWICKLER, true);
    await this.skripteNachpruefen();
    new Notice("Der Entwicklermodus ist an. Skripte laufen auf diesem Gerät ohne Prüfung.", 8000);
    return true;
  }

  // Befehl „Entwicklermodus ausschalten“: alles neu laden, ab jetzt wieder nur geprüfte Skripte
  async entwicklerAus() {
    this.lokal(L_ENTWICKLER, null);
    await this.skripteLaden(false);
    new Notice("Der Entwicklermodus ist aus. Es laufen nur noch geprüfte Skripte.", 6000);
    return true;
  }

  async erweiterungStarten(name, start) {
    const fabrik = this.skripte[name];
    if (typeof fabrik !== "function") throw new Error("kein module.exports = function (ctx) {…}");
    const m = await fabrik(this.skriptKontext(name));
    if (this.entladen) return;
    if (!m) throw new Error("Fabrik liefert nichts");
    this.erweiterungen[name] = m;
    if (m.aktionen) this.aktionenUebernehmen(name, m.aktionen);
    if (typeof m.registrieren === "function") await m.registrieren(this);
    if (start && typeof m.start === "function") {
      // start() läuft nur beim App-Start (nicht beim Hot-Reload); Fehler darin melden, aber nicht weiterreichen
      Promise.resolve().then(() => m.start()).catch((e) => { console.error("Studium Autopilot: start " + name, e); new Notice(`Beim Start ging etwas schief (${name}). Bitte Obsidian einmal neu starten.`, 8000); });
    }
  }

  // Hot-Reload eines Skripts, immer durch die Prüfung: Gesperrt (Prüfsumme in keiner geprüften Liste, nicht erlaubt) wird es nicht
  // ausgewertet und wartet, bis eine passende Liste kommt (skripteNachpruefen); eine geladene Fassung läuft so lange weiter.
  async skriptNeuLaden(f) {
    try {
      const { sha, code } = await this.skriptLesen(f);
      if (this.entladen) return;
      if (!this.zulassen(f, sha)) { this.ablehnungPlanen(ABLEHNUNG_SYNC); return; }
      this.ablehnungErledigt();
      if (code === this.quellen[f.basename]) return;
      const neu = this.auswerten(code, f.path); // Syntaxfehler: alte Fassung läuft weiter
      // Alte Fassung vollständig abmelden (abmelden(), Helfer, Timer, Aktionen, Befehle), dann die neue starten
      this.skriptAbmelden(f.basename);
      this.skripte[f.basename] = neu;
      this.quellen[f.basename] = code;
      this.pruefsummen[f.basename] = sha;
      if (this.istErweiterung(code)) await this.erweiterungStarten(f.basename, false);
      this.neuZeichnen();
      this.hinweisSammeln(f.basename);
    } catch (e) {
      console.error("Studium Autopilot: neu laden " + f.path, e);
      new Notice(`${f.basename} nicht geladen: ${(e && e.message) || e}`, 8000); // nur beim Bearbeiten eines Skripts
    }
  }

  // Hinweis nach dem Hot-Reload, gesammelt bis HINWEIS_RUHE lang kein Skript mehr kam: genau eines (du hast es bearbeitet) →
  // „Aktualisiert: name“; mehrere auf einmal (ein Update kommt über den Sync) → kein Hinweis und eine Minute Ruhe für Nachzügler,
  // das Update meldet die Zeile „Version … ist da. Einmal neu laden.“ (update.js). Während eines Updates (stillBis) nie.
  hinweisSammeln(name) {
    if (this.stillBis > Date.now()) return;
    this.hinweisNamen = (this.hinweisNamen || []).concat([name]);
    clearTimeout(this.hinweisTimer);
    this.hinweisTimer = setTimeout(() => {
      const namen = this.hinweisNamen || [];
      this.hinweisNamen = [];
      this.hinweisTimer = null;
      if (this.entladen || this.stillBis > Date.now()) return;
      if (namen.length === 1) new Notice("Aktualisiert: " + namen[0], 2000);
      else this.stillBis = Date.now() + 60000;
    }, HINWEIS_RUHE);
  }

  // Skriptdatei gelöscht oder umbenannt: abmelden und vergessen
  skriptEntfernen(name) {
    this.skriptAbmelden(name);
    delete this.skripte[name]; delete this.quellen[name]; delete this.pruefsummen[name]; delete this.abgelehnt[name];
    this.ablehnungErledigt();
    this.neuZeichnen();
  }

  // Offene Notizen neu zeichnen (Codeblöcke der Erweiterungen erscheinen sofort)
  neuZeichnen(pfade) {
    for (const l of this.app.workspace.getLeavesOfType("markdown")) {
      const p = l.view && l.view.file && l.view.file.path;
      if (pfade && pfade.indexOf(p) < 0) continue;
      try {
        if (l.view.getMode && l.view.getMode() === "source") { if (l.rebuildView) l.rebuildView(); }
        else if (l.view.previewMode && l.view.previewMode.rerender) l.view.previewMode.rerender(true);
      } catch (e) { /* nächste Ansicht */ }
    }
  }

  // ---------- Aktionen ----------
  // Befehle: je Aktion mit titel einer (ID „aktion-<name>“, gleiche ID ersetzt, also keine Doppelten). checkCallback blendet
  // den Befehl aus, falls die Aktion inzwischen fehlt; beim Abmelden eines Skripts werden seine Befehle entfernt.
  aktionenUebernehmen(skript, aktionen) {
    for (const name of Object.keys(aktionen)) {
      let def = aktionen[name];
      if (typeof def === "function") def = { ausfuehren: def };
      if (!def || typeof def.ausfuehren !== "function") continue;
      const alt = this.aktionen[name];
      if (alt && alt.skript !== skript) console.warn(`Studium Autopilot: Aktion „${name}“ aus ${alt.skript} wird durch ${skript} ersetzt`);
      this.aktionen[name] = Object.assign({}, def, { skript });
      if (!def.titel) continue;
      const id = "aktion-" + name;
      const da = () => !!(this.aktionen[name] && this.aktionen[name].titel);
      const pruefen = (checking) => { if (!da()) return false; if (!checking) this.aktionAusfuehren(name, {}); return true; };
      if (def.editor) this.addCommand({ id, name: def.titel, editorCheckCallback: (checking) => pruefen(checking) });
      else this.addCommand({ id, name: def.titel, checkCallback: (checking) => pruefen(checking) });
      this.befehle[id] = skript;
    }
  }

  aktionenEntfernen(skript) {
    for (const k of Object.keys(this.aktionen)) if (this.aktionen[k].skript === skript) delete this.aktionen[k];
    for (const id of Object.keys(this.befehle)) {
      if (this.befehle[id] !== skript) continue;
      delete this.befehle[id];
      try {
        if (typeof this.removeCommand === "function") this.removeCommand(id); // API ab 1.7.2
        else if (this.app.commands && this.app.commands.removeCommand) this.app.commands.removeCommand(this.manifest.id + ":" + id);
      } catch (e) { /* checkCallback blendet ihn aus */ }
    }
  }

  // Führt eine Aktion aus. parameter: Werte aus dem Knopf-Link (Strings) oder vom Aufrufer; extra.datei: leere Notiz, die
  // befüllt werden soll (Ordner-Automatik); extra.quelle: Notiz, in der der Knopf steht; extra.extern: true nur vom
  // Protokoll-Handler (Link von außerhalb der App), als c.extern; Klicks in der App (klickAbfangen) und ctx.aktion: false.
  async aktionAusfuehren(name, parameter, extra) {
    const def = hat(this.aktionen, name) ? this.aktionen[name] : null; // nur eigene Einträge (kein „constructor“ o. Ä. aus einem Link)
    if (!def) {
      new Notice(name ? "Dieser Knopf geht gerade nicht. Bitte kurz warten oder Obsidian neu starten." : "Dieser Knopf hat keine Aktion.", 6000);
      return undefined;
    }
    const schluessel = name + JSON.stringify(parameter || {});
    if (this.laufend.has(schluessel)) return undefined; // Doppelklick
    this.laufend.add(schluessel);
    const c = Object.create(this.kontexte[def.skript] || this.ctx);
    c.parameter = Object.assign({}, parameter || {});
    c.datei = (extra && extra.datei) || null;
    c.quelle = (extra && extra.quelle) || this.app.workspace.getActiveFile();
    c.extern = !!(extra && extra.extern === true);
    try {
      return await def.ausfuehren(c);
    } catch (e) {
      console.error("Studium Autopilot: Aktion " + name, e);
      new Notice(`„${def.titel || name}“ hat nicht geklappt. Bitte noch einmal versuchen.`, 8000);
      return undefined;
    } finally {
      this.laufend.delete(schluessel);
    }
  }

  linkBauen(aktion, parameter) {
    let s = LINK + "?aktion=" + encodeURIComponent(aktion);
    for (const k of Object.keys(parameter || {})) {
      const v = parameter[k];
      if (v === undefined || v === null || v === false || v === "") continue;
      s += "&" + encodeURIComponent(k) + "=" + encodeURIComponent(v === true ? "1" : String(v));
    }
    return s;
  }

  // Klicks auf Knöpfe abfangen: Capture-Modus auf document, damit weder Obsidian noch CodeMirror noch Bases den Link
  // zuerst bekommen. Kein Umweg über das Betriebssystem, kein Tab, keine Hilfsnotiz.
  klickAbfangen(doc) {
    if (!doc || doc.__studiumAutopilot) return;
    doc.__studiumAutopilot = true;
    const knopf = (e) => {
      const t = e.target;
      return t && typeof t.closest === "function" ? t.closest('a[href^="' + LINK + '"]') : null;
    };
    const sperren = (e) => { if (knopf(e)) { e.preventDefault(); e.stopPropagation(); } };
    // Wo zuletzt getippt wurde: ctx.oeffnen öffnet eine Notiz im Tab, in dem du getippt hast (Skripte stoppen mousedown oft selbst)
    this.registerDomEvent(doc, "pointerdown", (e) => { this.letzterTipp = { el: e.target, zeit: Date.now() }; }, { capture: true });
    for (const typ of ["mousedown", "mouseup", "pointerdown", "auxclick", "contextmenu"]) this.registerDomEvent(doc, typ, sperren, { capture: true });
    this.registerDomEvent(doc, "click", (e) => {
      const a = knopf(e);
      if (!a) return;
      e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation();
      const p = parameterAus(a.getAttribute("href"));
      this.aktionAusfuehren(p.aktion, p, { quelle: this.dateiVon(a) });
    }, { capture: true });
    this.register(() => { try { delete doc.__studiumAutopilot; } catch (e) { doc.__studiumAutopilot = false; } });
  }

  // Notiz, zu der ein Knopf gehört: 1. vom Post-Processor gemerkte Quelle (Leseansicht, Einbettung, Hover-Vorschau),
  // 2. Notiz des Tabs, in dem er steht (Live Preview, Bases-html()), 3. die aktive Notiz.
  dateiVon(el) {
    const q = el.closest && el.closest("[data-sa-quelle]");
    const gemerkt = q && this.app.vault.getAbstractFileByPath(q.getAttribute("data-sa-quelle"));
    if (gemerkt instanceof TFile) return gemerkt;
    let datei = null;
    this.app.workspace.iterateAllLeaves((l) => {
      if (!datei && l.view && l.view.file && l.view.containerEl && l.view.containerEl.contains(el)) datei = l.view.file;
    });
    return datei || this.app.workspace.getActiveFile();
  }

  // Befehl „Neue Notiz aus Vorlage …“ (Strg/Cmd+Umschalt+N): alle Aktionen, die eine Notiz anlegen (mit „ordner“)
  async neueNotizWaehlen() {
    const liste = Object.keys(this.aktionen).filter((k) => this.aktionen[k].ordner && this.aktionen[k].titel);
    if (!liste.length) { new Notice("Die Vorlagen sind noch nicht geladen. Bitte kurz warten.", 5000); return; }
    const wahl = await this.auswahl(liste.map((k) => this.aktionen[k].titel), liste, "Welche Notiz?");
    if (wahl) await this.aktionAusfuehren(wahl, {});
  }

  // ---------- Ordner-Automatik ----------
  aktionFuerPfad(pfad) {
    let beste = null, laenge = -1;
    for (const k of Object.keys(this.aktionen)) {
      for (const o of [].concat(this.aktionen[k].ordner || [])) {
        if ((pfad.startsWith(o + "/")) && o.length > laenge) { beste = k; laenge = o.length; }
      }
    }
    return beste;
  }

  // Neue LEERE Notiz in einem Aktionsordner, die auf DIESEM Gerät angelegt wurde und gerade aktiv ist → Aktion befüllt sie.
  // Per Sync ankommende Dateien sind nicht die aktive Datei und werden darum nie befüllt.
  neueDatei(f) {
    if (!(f instanceof TFile) || f.extension !== "md") return;
    const aktion = this.aktionFuerPfad(f.path);
    if (!aktion) return;
    let versuche = 0;
    const pruefen = async () => {
      if (this.app.vault.getAbstractFileByPath(f.path) !== f) return;
      const aktiv = this.app.workspace.getActiveFile();
      if (!aktiv || aktiv.path !== f.path) { if (++versuche < 4) setTimeout(pruefen, 400); return; }
      try { if ((await this.app.vault.read(f)).trim()) return; } catch (e) { return; }
      this.aktionAusfuehren(aktion, {}, { datei: f, quelle: f });
    };
    setTimeout(pruefen, 300);
  }

  // Tab für ctx.oeffnen, wenn nicht im getippten Tab (keiner, angeheftet oder Seitenleiste): der aktive, wenn er navigieren kann,
  // sonst der zuletzt benutzte der Hauptfläche, der es kann, auch hinter einem anderen (im Hintergrund noch nicht geladene zählen,
  // solange sie nicht angeheftet sind); erst ohne einen solchen ein neuer. Obsidians getLeaf(false) nimmt nur den vorderen Tab einer
  // Gruppe: Aus einem angehefteten Tab (etwa dem Dashboard) legte so jeder Tipp einen neuen Tab an (seit 27.10.2026, Rückmeldung:
  // „Still too many tabs open after a few clicks around“).
  freiesBlatt() {
    const ws = this.app.workspace, a = ws.activeLeaf;
    const wurzel = (l) => (l && l.getRoot ? l.getRoot() : null);
    const frei = (l) => !l.getViewState().pinned && (l.isDeferred || l.canNavigate());
    if (a && wurzel(a) !== ws.leftSplit && wurzel(a) !== ws.rightSplit && frei(a)) return a;
    let bestes = null;
    ws.iterateAllLeaves((l) => { if (wurzel(l) === ws.rootSplit && frei(l) && (!bestes || (l.activeTime || 0) > (bestes.activeTime || 0))) bestes = l; });
    return bestes || ws.getLeaf("tab");
  }

  // Notiz öffnen: DER Weg für alle Skripte (ctx.oeffnen, Bedien-Bausteine seit 0.4.6; docs/architektur/bedien-bausteine.md).
  // ziel: TFile, Pfad oder Linktext (mit „#Überschrift“). o = { neu (neuer Tab, Strg/⌘-Klick), quelle (Notiz, von der ein
  // Linktext ausgeht), zeile (0-basiert), cursor ({ line, ch }), modus („preview“ | „source“ erzwingt), von (Element, auf das
  // getippt wurde; sonst der letzte Tipp der letzten 2 s) }.
  // Ansicht: Übersichtsseiten (Dashboard, Studium/, Einstellungen, Daten; ctx.leseansicht.nurLesen aus start.js) und Begleitnotizen
  // (ctx.leseansicht.zuerstLesen, seit 19.10.2026) in der Leseansicht, deine Notizen in der Bearbeitungsansicht (Live Preview). Im Tab, in dem getippt wurde (sonst der aktive), Zurück führt
  // zurück, auch wenn die Notiz schon in einem anderen Tab offen ist (seit 27.10.2026; vorher wechselte es dorthin, und in jenem Tab
  // führte Zurück nicht dorthin, wo du herkamst).
  // Fokus und Cursor nur mit cursor (sonst springt auf iPhone und iPad die Tastatur auf). Andere Dateien (PDF, Bild) wie ein Link.
  async notizOeffnen(ziel, optionen) {
    const o = optionen || {};
    let datei = ziel, anker = "";
    if (!(ziel instanceof TFile)) {
      const s = String(ziel == null ? "" : ziel).replace(/^\[\[|\]\]$/g, "").split("|")[0].trim();
      const i = s.indexOf("#");
      const pfad = i >= 0 ? s.slice(0, i) : s;
      anker = i >= 0 ? s.slice(i) : "";
      datei = this.app.vault.getAbstractFileByPath(pfad) || this.app.vault.getAbstractFileByPath(pfad + ".md")
        || this.app.metadataCache.getFirstLinkpathDest(pfad, o.quelle || "");
    }
    if (!(datei instanceof TFile)) return null;
    if (datei.extension !== "md") { const b = o.neu ? this.app.workspace.getLeaf("tab") : this.freiesBlatt(); await b.openFile(datei, { active: true }); return b; }
    const L = this.ctx.leseansicht;
    const lesen = o.modus ? o.modus === "preview" : !!(L && ((typeof L.nurLesen === "function" && L.nurLesen(datei))
      || (typeof L.zuerstLesen === "function" && L.zuerstLesen(datei))));
    let blatt = null;
    if (!o.neu) {
      const t = this.letzterTipp, von = o.von || (t && Date.now() - t.zeit < 2000 ? t.el : null);
      if (von) this.app.workspace.iterateAllLeaves((l) => { if (!blatt && l.view && l.view.containerEl && l.view.containerEl.contains(von)) blatt = l; });
      const ws = this.app.workspace, wurzel = blatt && blatt.getRoot ? blatt.getRoot() : null;
      if (blatt && (blatt.getViewState().pinned || wurzel === ws.leftSplit || wurzel === ws.rightSplit)) blatt = null; // nie in der Seitenleiste
    }
    if (!blatt) blatt = o.neu ? this.app.workspace.getLeaf("tab") : this.freiesBlatt();
    const eState = o.zeile != null ? { line: Number(o.zeile) } : anker ? { subpath: anker } : undefined;
    await blatt.openFile(datei, { active: true, state: lesen ? { mode: "preview" } : { mode: "source", source: false }, eState });
    this.app.workspace.setActiveLeaf(blatt, { focus: !!o.cursor });
    if (o.cursor) {
      const setzen = () => { const ed = blatt.view && blatt.view.editor; if (!ed) return false; ed.setCursor(o.cursor); ed.focus(); return true; };
      if (!setzen()) setTimeout(setzen, 200);
    }
    return blatt;
  }
};

// Für Tests ohne Obsidian (tests/kern.js): die Signaturprüfung und der eingebaute Ed25519-Prüfer, wie ctx.signatur
module.exports.signatur = SIGNATUR;
module.exports.ed25519 = ED25519;
