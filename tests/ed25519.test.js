// Eingebauter Ed25519-Prüfer im Kern (main.js, ED25519 aus noble-ed25519 3.2.0, streng nach RFC 8032): für Geräte ohne Ed25519
// in Web Crypto (iOS bis 16, ältere WebViews). Er muss genau dann „gültig“ sagen, wenn Web Crypto es sagt: Prüfwerte aus RFC 8032,
// die echte Signatur von ssh-keygen (tests/signatur.js), abgelehnte Fälle (S ≥ L, nicht kanonische Punkte, falscher Schlüssel,
// gekippte Bits, falscher Namensraum) und einige hundert Zufallsnachrichten im Vergleich mit Web Crypto von Node. Ohne BigInt
// lädt der Kern trotzdem und meldet „krypto“. Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const nc = require("node:crypto");
const K = require("./kern.js");
const S = require("./signatur.js");

const ED = K.ed25519, P = K.signatur;
const hex = (h) => new Uint8Array(Buffer.from(h, "hex"));
const sha512 = async (b) => new Uint8Array(await crypto.subtle.digest("SHA-512", b));
const eingebaut = (sig, msg, pub) => ED.verifyAsync(sig, msg, pub, sha512);
const webcrypto = async (sig, msg, pub) => {
  const k = await crypto.subtle.importKey("raw", pub, { name: "Ed25519" }, false, ["verify"]);
  return crypto.subtle.verify({ name: "Ed25519" }, k, sig, msg);
};
const beide = async (sig, msg, pub) => [await eingebaut(sig, msg, pub), await webcrypto(sig, msg, pub)];
const L = 2n ** 252n + 27742317777372353535851937790883648493n;
const P_FELD = 2n ** 255n - 19n;
const le = (n) => { const b = new Uint8Array(32); for (let i = 0; i < 32; i++) { b[i] = Number(n & 255n); n >>= 8n; } return b; };
const zahl = (b) => { let n = 0n; for (let i = b.length - 1; i >= 0; i--) n = (n << 8n) + BigInt(b[i]); return n; };
const kippen = (b, bit) => { const x = Uint8Array.from(b); x[bit >> 3] ^= 1 << (bit & 7); return x; };
// BigInt-Literal (1n, 0xffn) im Quelltext, nicht als Teil eines Namens oder einer Zahl mit Punkt
const LITERAL = /(?:^|[^\w$."])(?:0x[0-9a-fA-F]+|\d+)n\b/g;

// RFC 8032, Abschnitt 7.1: TEST 1, TEST 2, TEST 3 und TEST SHA(abc) (geheimer Schlüssel, öffentlicher, Nachricht, Signatur)
const RFC = [
  ["9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60", "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a", "",
    "e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b"],
  ["4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb", "3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c", "72",
    "92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00"],
  ["c5aa8df43f9f837bedb7442f31dcb7b166d38535076f094b85ce3a2e0b4458f7", "fc51cd8e6218a1a38da47ed00230f0580816ed13ba3303ac5deb911548908025", "af82",
    "6291d657deec24024827e69c3abe01a30ce548a284743a445e3680d7db5ac3ac18ff9b538d16f290ae67f760984dc6594a7c15e9716ed28dc027beceea1ec40a"],
  ["833fe62409237b9d62ec77587520911e9a759cec1d19755b7da901b96dca3d42", "ec172b93ad5e563bf4932c70e1245034c35467ef2efd4d64ebf819683467e2bf",
    "ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f",
    "dc2a4459e7369633a52b1bf277839a00201009a3efbf3ecb69bea2186c26b58909351fc9ac90b3ecfdfbc7c66431e0303dca179c138ac17ad9bef1177331a704"],
];

test("Eingebauter Prüfer: Prüfwerte aus RFC 8032 gelten (wie bei Node), mit gekipptem Bit nicht", async () => {
  for (const [geheim, pub, msg, sig] of RFC) {
    // Die Prüfwerte selbst: Node signiert mit dem geheimen Schlüssel genau diese Signatur
    const k = nc.createPrivateKey({ key: Buffer.concat([Buffer.from("302e020100300506032b657004220420", "hex"), Buffer.from(geheim, "hex")]), format: "der", type: "pkcs8" });
    assert.equal(nc.sign(null, Buffer.from(msg, "hex"), k).toString("hex"), sig);
    assert.deepEqual(await beide(hex(sig), hex(msg), hex(pub)), [true, true], sig.slice(0, 16));
    for (const bit of [0, 255, 256, 511]) assert.deepEqual(await beide(kippen(hex(sig), bit), hex(msg), hex(pub)), [false, false], "Signatur, Bit " + bit);
    if (msg) assert.deepEqual(await beide(hex(sig), kippen(hex(msg), 0), hex(pub)), [false, false], "Nachricht");
    assert.deepEqual(await beide(hex(sig), hex(msg), kippen(hex(pub), 3)), [false, false], "Schlüssel");
  }
});

test("Eingebauter Prüfer: die Signatur von ssh-keygen aus tests/signatur.js gilt, über den ganzen Weg (ctx.signatur ohne Ed25519)", async () => {
  const z = S.FEST.sig.trim().split("\n");
  const f = P.sshsigLesen(new Uint8Array(Buffer.from(z.slice(1, -1).join(""), "base64")));
  const h = await sha512(new TextEncoder().encode(S.FEST.liste));
  const signiert = Buffer.concat([Buffer.from("SSHSIG"), S.sshText(f.namensraum), S.sshText(f.reserviert), S.sshText(f.hash), S.sshText(h)]);
  assert.deepEqual(await beide(f.sroh, new Uint8Array(signiert), f.roh), [true, true]);
  // Ganzer Weg wie auf einem Gerät ohne Ed25519 in Web Crypto: der eingebaute Prüfer nimmt sie an, eine andere Liste nicht
  const ohne = { digest: (a, d) => crypto.subtle.digest(a, d), importKey: async () => { throw new Error("NotSupportedError"); }, verify: async () => { throw new Error("nie"); } };
  const r = await P.pruefen(new TextEncoder().encode(S.FEST.sig), new TextEncoder().encode(S.FEST.liste), { schluessel: [S.FEST.schluessel], subtle: ohne });
  assert.deepEqual(r, { ok: true, schluessel: S.FEST.schluessel });
  const falsch = await P.pruefen(new TextEncoder().encode(S.FEST.sig), new TextEncoder().encode(S.FEST.liste + " "), { schluessel: [S.FEST.schluessel], subtle: ohne });
  assert.equal(falsch.ok, false);
});

test("Eingebauter Prüfer lehnt ab: S ≥ L, nicht kanonische Punkte, Schlüssel kleiner Ordnung, falscher Schlüssel, falscher Namensraum", async () => {
  const [, pub, msg, sigHex] = RFC[1];
  const sig = hex(sigHex), m = hex(msg), A = hex(pub);
  const R = sig.subarray(0, 32), s = zahl(sig.subarray(32));
  const mitS = (n) => { const x = new Uint8Array(64); x.set(R); x.set(le(n), 32); return x; };
  // S nicht reduziert: S + L ist dieselbe Signatur nach Formel, aber nicht kanonisch (Formbarkeit); L selbst und 2^256 - 1 ebenso
  assert.ok(s + L < 2n ** 256n);
  for (const n of [s + L, L, 2n ** 256n - 1n]) assert.deepEqual(await beide(mitS(n), m, A), [false, false], "S = " + n.toString(16).slice(0, 8));
  // R und A nicht kanonisch: y ≥ p (y = p + 1 kodiert den Nullpunkt; 2^255 - 1 liegt über p), x = 0 mit gesetztem Vorzeichen
  const yGross = le(P_FELD + 1n), yMax = le(2n ** 255n - 1n), x0 = le(1n);
  x0[31] |= 0x80;
  for (const [name, r] of [["R = p + 1", yGross], ["R = 2^255 - 1", yMax], ["R mit x = 0 und Vorzeichen", x0]]) {
    const x = Uint8Array.from(sig); x.set(r, 0);
    assert.deepEqual(await beide(x, m, A), [false, false], name);
  }
  for (const [name, a] of [["A = p + 1", yGross], ["A mit x = 0 und Vorzeichen", x0]]) assert.equal(await eingebaut(sig, m, a), false, name);
  // Schlüssel kleiner Ordnung (Nullpunkt, kanonisch kodiert) mit einer Signatur aus Nullpunkt und S = 0: nach der Formel „gültig“
  // für jede Nachricht, streng nach RFC 8032 (und bei noble mit zip215: false) abgelehnt
  const null32 = le(1n), sNull = new Uint8Array(64);
  sNull.set(null32, 0);
  assert.equal(await eingebaut(sNull, m, null32), false, "Nullpunkt als Schlüssel");
  // Falscher Schlüssel: eine andere echte Signatur
  assert.deepEqual(await beide(sig, m, hex(RFC[2][1])), [false, false]);
  // Falscher Namensraum: über den ganzen Weg ohne Ed25519 in Web Crypto
  const ohne = { digest: (a, d) => crypto.subtle.digest(a, d), importKey: async () => { throw new Error("NotSupportedError"); }, verify: async () => { throw new Error("nie"); } };
  const w = S.schluesselBauen(), daten = new TextEncoder().encode("liste");
  for (const [abw, was] of [[{ signiertNamensraum: "studium-server" }, /ungültig/], [{ namensraum: "git" }, /Namensraum/]]) {
    const r = await P.pruefen(new TextEncoder().encode(S.signieren(daten, w, abw)), daten, { schluessel: [w.oeffentlich], subtle: ohne });
    assert.equal(r.ok, false);
    assert.match(r.fehler, was);
  }
  // Falsche Längen werfen (der Aufrufer, sshsigLesen, prüft sie vorher)
  await assert.rejects(() => eingebaut(sig.subarray(0, 63), m, A), RangeError);
  await assert.rejects(() => eingebaut(sig, m, A.subarray(0, 31)), RangeError);
});

test("Eingebauter Prüfer = Web Crypto von Node: 300 Zufallsnachrichten, je gültig und mit gekipptem Bit, dazu Zufallssignaturen", async () => {
  const schluessel = [];
  for (let i = 0; i < 6; i++) {
    const { publicKey, privateKey } = nc.generateKeyPairSync("ed25519");
    schluessel.push({ privat: privateKey, roh: new Uint8Array(publicKey.export({ format: "der", type: "spki" }).subarray(-32)) });
  }
  let gueltig = 0;
  for (let i = 0; i < 300; i++) {
    const k = schluessel[i % schluessel.length];
    const msg = new Uint8Array(nc.randomBytes(nc.randomInt(0, 300)));
    const sig = new Uint8Array(nc.sign(null, msg, k.privat));
    const ja = await beide(sig, msg, k.roh);
    assert.deepEqual(ja, [true, true], "gültig " + i);
    gueltig++;
    const ziel = nc.randomInt(0, msg.length ? 3 : 2);
    const bit = nc.randomInt(0, ziel === 2 ? msg.length * 8 : 512);
    const nein = ziel === 2 ? await beide(sig, kippen(msg, bit), k.roh) : await beide(kippen(sig, bit), msg, k.roh);
    assert.equal(nein[0], nein[1], "gleiches Urteil " + i);
    assert.equal(nein[0], false, "gekippt " + i);
    if (i % 10 === 0) {
      const zufall = new Uint8Array(nc.randomBytes(64));
      const z = await beide(zufall, msg, k.roh);
      assert.deepEqual(z, [false, false], "Zufallssignatur " + i);
    }
  }
  assert.equal(gueltig, 300);
});

test("Ohne BigInt (sehr alte Geräte): der Kern lädt trotzdem, der eingebaute Prüfer meldet „krypto“; kein BigInt-Literal im Kern", async () => {
  const code = require("node:fs").readFileSync(K.KERN, "utf8");
  assert.equal(code.match(LITERAL), null, "ein BigInt-Literal wäre dort ein Syntaxfehler im ganzen Kern");
  const modul = { exports: {} };
  new Function("BigInt", "require", "module", "exports", code)(undefined, (n) => (n === "obsidian" ? K.obsidianErsatz() : require(n)), modul, modul.exports);
  const ohne = { digest: (a, d) => crypto.subtle.digest(a, d), importKey: async () => { throw new Error("NotSupportedError"); }, verify: async () => { throw new Error("nie"); } };
  await assert.rejects(modul.exports.ed25519.verifyAsync(new Uint8Array(64), new Uint8Array(0), new Uint8Array(32), sha512), (e) => e.krypto === true);
  assert.equal(await modul.exports.signatur.pruefbar(ohne), false);
  const r = await modul.exports.signatur.pruefen(new TextEncoder().encode(S.FEST.sig), new TextEncoder().encode(S.FEST.liste), { schluessel: [S.FEST.schluessel], subtle: ohne });
  assert.deepEqual([r.ok, r.art], [false, "krypto"]);
});
