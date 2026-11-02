// Tests für server/paket-pruefen.mjs: Signatur eines Server-Pakets in Node.js prüfen (für die Cloud Shell, deren ssh-keygen es nicht
// kann). Der eigene Ed25519-Prüfer gegen node:crypto und RFC 8032, das Ganze gegen Signaturen von ssh-keygen; start.sh trägt
// dieselben Zeilen, fern.sh und start.sh dieselben Schlüssel wie server/allowed_signers.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");

const SERVER = path.join(__dirname, "..", "server");
const da = fs.existsSync(path.join(SERVER, "paket-pruefen.mjs"));
const ohneKeygen = spawnSync("bash", ["-c", "ssh-keygen -Y verify 2>&1 | grep -q namespace"]).status !== 0 && "kein ssh-keygen mit -Y";
const test = (name, a, b) => require("node:test")(name, { ...(b ? a : {}), skip: (!da && "server/ fehlt in diesem Baum") || (b && a.skip) }, b || a);
const laden = () => import(pathToFileURL(path.join(SERVER, "paket-pruefen.mjs")).href);

test("Ed25519 (eigener Prüfer): RFC 8032 und wie node:crypto, auch bei veränderter Nachricht, Signatur oder falschem Schlüssel", async () => {
  const { ed25519Pruefen } = await laden();
  const hex = (h) => Buffer.from(h, "hex");
  // RFC 8032, 7.1, Test 1 (leere Nachricht) und Test 2 (ein Byte)
  assert.ok(ed25519Pruefen(hex("d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a"), Buffer.alloc(0),
    hex("e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b")));
  assert.ok(ed25519Pruefen(hex("3d4017c3e843895a92b70aa74d1b7ebc9c982ccf2ec4968cc0cd55f12af4660c"), hex("72"),
    hex("92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00")));
  for (let i = 0; i < 12; i++) {
    const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
    const pub = Buffer.from(publicKey.export({ format: "jwk" }).x, "base64url");
    const nachricht = crypto.randomBytes(i * 37);
    const sig = crypto.sign(null, nachricht, privateKey);
    assert.ok(ed25519Pruefen(pub, nachricht, sig), "gültig");
    const kippen = (b, stelle) => { const k = Buffer.from(b); k[stelle % k.length] ^= 1 << (i % 8); return k; };
    if (nachricht.length) assert.ok(!ed25519Pruefen(pub, kippen(nachricht, i * 7), sig), "Nachricht verändert");
    assert.ok(!ed25519Pruefen(pub, nachricht, kippen(sig, i * 5)), "R verändert");
    assert.ok(!ed25519Pruefen(pub, nachricht, kippen(sig, 32 + i)), "S verändert");
    assert.ok(!ed25519Pruefen(kippen(pub, i), nachricht, sig), "anderer Schlüssel");
    const andere = Buffer.from(crypto.generateKeyPairSync("ed25519").publicKey.export({ format: "jwk" }).x, "base64url");
    assert.ok(!ed25519Pruefen(andere, nachricht, sig));
  }
  // S ≥ L (formbar) und falsche Längen: ungültig
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const pub = Buffer.from(publicKey.export({ format: "jwk" }).x, "base64url");
  const sig = crypto.sign(null, Buffer.from("x"), privateKey);
  const L = 2n ** 252n + 27742317777372353535851937790883648493n;
  let s = 0n;
  for (let j = 63; j >= 32; j--) s = (s << 8n) | BigInt(sig[j]);
  const formbar = Buffer.from(sig);
  let n = s + L;
  for (let j = 32; j < 64; j++) { formbar[j] = Number(n & 255n); n >>= 8n; }
  assert.equal(crypto.verify(null, Buffer.from("x"), publicKey, formbar), false, "auch OpenSSL lehnt S + L ab");
  assert.ok(!ed25519Pruefen(pub, Buffer.from("x"), formbar));
  assert.ok(!ed25519Pruefen(pub.subarray(1), Buffer.from("x"), sig) && !ed25519Pruefen(pub, Buffer.from("x"), sig.subarray(1)));
});

test("Signatur eines Pakets wie ssh-keygen -Y verify: Namensraum, Prinzipal, erlaubter Schlüssel; Aufruf mit Exit 0/1/2", { skip: ohneKeygen }, async () => {
  const { signaturPruefen } = await laden();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "paket-pruefen-"));
  const p = (...t) => path.join(tmp, ...t);
  const vorwaerts = (x) => x.replace(/\\/g, "/");
  const keygen = (...a) => spawnSync("bash", ["-c", 'ssh-keygen "$@"', "-", ...a.map(vorwaerts)], { encoding: "utf8" });
  try {
    for (const n of ["signierer", "fremd"]) assert.equal(keygen("-q", "-t", "ed25519", "-N", "", "-C", n, "-f", p(n)).status, 0);
    const schluessel = (n) => fs.readFileSync(p(n + ".pub"), "utf8").split(" ").slice(0, 2).join(" ");
    const daten = crypto.randomBytes(5000);
    fs.writeFileSync(p("paket"), daten);
    const signieren = (n, ns) => { fs.rmSync(p("paket.sig"), { force: true }); assert.equal(keygen("-Y", "sign", "-f", p(n), "-n", ns, p("paket")).status, 0); return fs.readFileSync(p("paket.sig"), "utf8"); };
    const erlaubt = `# Kommentar\nrelease@studium-autopilot namespaces="studium-server" ${schluessel("signierer")}\n`;
    // jede Prüfung mit OpenSSL (node:crypto) und mit dem eigenen Prüfer (so in der Cloud Shell im FIPS-Modus); beide sagen dasselbe
    const pruefen = (signatur, x = {}) => {
      const a = { daten, signatur, erlaubt, prinzipal: "release@studium-autopilot", namensraum: "studium-server", ...x };
      const openssl = signaturPruefen(a), eigener = signaturPruefen({ ...a, eigener: true });
      assert.equal(eigener, openssl, "eigener Prüfer wie OpenSSL");
      return openssl;
    };
    const gut = signieren("signierer", "studium-server");
    assert.ok(pruefen(gut));
    // dasselbe sagt ssh-keygen
    fs.writeFileSync(p("erlaubt"), erlaubt);
    const echt = (ns) => spawnSync("bash", ["-c", 'ssh-keygen -Y verify -f "$1" -I release@studium-autopilot -n "$2" -s "$3" < "$4"', "-",
      ...[p("erlaubt"), ns, p("paket.sig"), p("paket")].map(vorwaerts)]).status === 0;
    assert.ok(echt("studium-server"));
    assert.ok(!pruefen(gut, { daten: Buffer.concat([daten, Buffer.from("x")]) }), "anderes Paket");
    assert.ok(!pruefen(gut, { namensraum: "studium-server-test" }), "anderer Namensraum verlangt");
    assert.ok(!pruefen(gut, { prinzipal: "jemand@anders" }), "anderer Prinzipal");
    assert.ok(!pruefen(gut, { erlaubt: erlaubt.replace('"studium-server"', '"git"') }), "Schlüssel nur für einen anderen Namensraum erlaubt");
    assert.ok(!pruefen(gut, { erlaubt: `release@studium-autopilot cert-authority ${schluessel("signierer")}\n` }), "andere Angaben gelten nicht");
    // ein Zeichen in der letzten vollen Zeile (dort steht die Ed25519-Signatur)
    const zeilen = gut.trim().split("\n"), z = zeilen.length - 3;
    zeilen[z] = zeilen[z].slice(0, 5) + (zeilen[z][5] === "A" ? "B" : "A") + zeilen[z].slice(6);
    assert.ok(!pruefen(zeilen.join("\n")), "Signatur verändert");
    assert.ok(!pruefen("kein Text einer Signatur") && !pruefen(""), "kein SSHSIG");
    const test = signieren("signierer", "studium-server-test");
    assert.ok(!pruefen(test) && !echt("studium-server"), "Signatur für Tests gilt nicht für studium-server");
    assert.ok(pruefen(test, { namensraum: "studium-server-test", erlaubt: erlaubt.replace('"studium-server"', '"studium-server-test"') }));
    assert.ok(!pruefen(signieren("fremd", "studium-server")), "fremder Schlüssel");
    // Aufruf wie in start.sh und fern.sh
    signieren("signierer", "studium-server");
    const cli = (...a) => spawnSync(process.execPath, [path.join(SERVER, "paket-pruefen.mjs"), ...a], { encoding: "utf8" }).status;
    assert.equal(cli(p("erlaubt"), "release@studium-autopilot", "studium-server", p("paket.sig"), p("paket")), 0);
    assert.equal(cli(p("erlaubt"), "release@studium-autopilot", "studium-server-test", p("paket.sig"), p("paket")), 1);
    assert.equal(cli(p("erlaubt")), 2);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test("Feste Schlüssel: start.sh, fern.sh und einrichten.mjs nennen dieselben wie server/allowed_signers; start.sh trägt paket-pruefen.mjs unverändert", async () => {
  const erlaubt = fs.readFileSync(path.join(SERVER, "allowed_signers"), "utf8").split("\n").filter((z) => z.trim() && !z.startsWith("#"))
    .map((z) => z.split(" ").slice(2, 4).join(" ")).sort();
  const fest = (datei) => {
    const r = /^SIGNIERSCHLUESSEL=\(\n?([^)]*)\)$/m.exec(fs.readFileSync(path.join(SERVER, datei), "utf8"));
    assert.ok(r, datei);
    return [...r[1].matchAll(/'([^']+)'/g)].map((x) => x[1]).sort();
  };
  assert.deepEqual(fest("start.sh"), erlaubt);
  assert.deepEqual(fest("fern.sh"), erlaubt);
  const E = await import(pathToFileURL(path.join(SERVER, "einrichten.mjs")).href);
  assert.deepEqual([...E.SIGNIERSCHLUESSEL].sort(), erlaubt);
  const start = fs.readFileSync(path.join(SERVER, "start.sh"), "utf8");
  const eingebettet = /^pruefer\(\) \{\n {2}cat <<'JS'\n([\s\S]*?\n)JS\n\}$/m.exec(start);
  assert.ok(eingebettet, "Prüfer in start.sh");
  assert.equal(eingebettet[1], fs.readFileSync(path.join(SERVER, "paket-pruefen.mjs"), "utf8"));
});
