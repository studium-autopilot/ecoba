// Signaturen der Update-Liste für Tests: dasselbe Format wie ssh-keygen -Y sign (PROTOCOL.sshsig von OpenSSH), mit einem
// Wegwerf-Schlüssel aus node:crypto, nie dem echten. tests/update-signatur.test.js prüft mit ssh-keygen, dass diese Signaturen
// echte sind; abweichung baut gezielt fehlerhafte (falscher Namensraum, andere Magie, Version, Hash, Schlüsselart).
"use strict";
const crypto = require("node:crypto");

const NAMENSRAUM = "studium-autopilot-plugin";
const RELEASES = "https://github.com/studium-autopilot/ecoba/releases";
const signaturUrl = (v) => `${RELEASES}/download/v${v}/system-dateien.json.sig`;

// string nach RFC 4251: Länge als uint32, dann die Bytes
const sshText = (b) => {
  const by = Buffer.from(b);
  const l = Buffer.alloc(4);
  l.writeUInt32BE(by.length);
  return Buffer.concat([l, by]);
};
const zahl = (n) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };

// → { oeffentlich: „ssh-ed25519 AAAA…“ (wie .pub), blob, roh (32 Bytes), privat }
function schluesselBauen() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const roh = publicKey.export({ format: "der", type: "spki" }).subarray(-32);
  const blob = Buffer.concat([sshText("ssh-ed25519"), sshText(roh)]);
  return { oeffentlich: "ssh-ed25519 " + blob.toString("base64"), blob, roh, privat: privateKey };
}

// Armor wie ssh-keygen: 70 Zeichen je Zeile
function armor(blob) {
  const b64 = Buffer.from(blob).toString("base64");
  const zeilen = [];
  for (let i = 0; i < b64.length; i += 70) zeilen.push(b64.slice(i, i + 70));
  return "-----BEGIN SSH SIGNATURE-----\n" + zeilen.join("\n") + "\n-----END SSH SIGNATURE-----\n";
}

// Signatur über daten → Text der .sig-Datei. abweichung: { namensraum, hash ("sha512" | "sha256" | …), magie, version,
// reserviert, art (Name der Schlüsselart in Schlüssel und Signatur), signaturArt, schluesselBlob, nachher (Bytes am Ende),
// signiertNamensraum (anderer Namensraum in den signierten Daten als im Blob) }
function signieren(daten, s, abweichung = {}) {
  const a = Object.assign({ namensraum: NAMENSRAUM, hash: "sha512", magie: "SSHSIG", version: 1, reserviert: "" }, abweichung);
  const h = crypto.createHash(a.hash).update(Buffer.from(daten)).digest();
  const signiert = Buffer.concat([Buffer.from("SSHSIG"), sshText(a.signiertNamensraum || a.namensraum), sshText(a.reserviert), sshText(a.hash), sshText(h)]);
  const roh = crypto.sign(null, signiert, s.privat);
  const art = a.art || "ssh-ed25519";
  const schluessel = a.schluesselBlob || (a.art ? Buffer.concat([sshText(art), sshText(s.roh)]) : s.blob);
  const sig = Buffer.concat([sshText(a.signaturArt || art), sshText(roh)]);
  const blob = Buffer.concat([Buffer.from(a.magie), zahl(a.version), sshText(schluessel), sshText(a.namensraum), sshText(a.reserviert),
    sshText(a.hash), sshText(sig), a.nachher || Buffer.alloc(0)]);
  return armor(blob);
}

// Hardware-Schlüssel (sk-ssh-ed25519@openssh.com): Schlüssel mit Anwendung, Signatur mit Flags und Zähler. Die Signatur ist
// echt nach dem Verfahren von OpenSSH; das Update lehnt die Schlüsselart trotzdem ab. → { oeffentlich, sig }
function skSignieren(daten, s) {
  const art = "sk-ssh-ed25519@openssh.com", anwendung = "ssh:";
  const blob = Buffer.concat([sshText(art), sshText(s.roh), sshText(anwendung)]);
  const h = crypto.createHash("sha512").update(Buffer.from(daten)).digest();
  const nachricht = Buffer.concat([Buffer.from("SSHSIG"), sshText(NAMENSRAUM), sshText(""), sshText("sha512"), sshText(h)]);
  const flags = Buffer.from([1]), zaehler = zahl(7);
  const signiert = Buffer.concat([crypto.createHash("sha256").update(anwendung).digest(), flags, zaehler,
    crypto.createHash("sha256").update(nachricht).digest()]);
  const roh = crypto.sign(null, signiert, s.privat);
  const sig = Buffer.concat([sshText(art), sshText(roh), flags, zaehler]);
  const sshsig = Buffer.concat([Buffer.from("SSHSIG"), zahl(1), sshText(blob), sshText(NAMENSRAUM), sshText(""), sshText("sha512"), sshText(sig)]);
  return { oeffentlich: art + " " + blob.toString("base64"), sig: armor(sshsig) };
}

// Fest eingetragen: mit ssh-keygen (OpenSSH 10.5) und einem Wegwerf-Schlüssel erzeugt, dessen privater Teil gleich danach gelöscht
// wurde. LISTE mit „ssh-keygen -Y sign -n studium-autopilot-plugin“, SIG_SHA256 dazu mit „-O hashalg=sha256“.
const FEST = {
  schluessel: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIO0ONJ2SOtE2veV3fKRmLws57XwgAZIClUIFgjgRpdPi",
  liste: '{"schema": 1, "version": "9.9.9", "ordner": "Studium Autopilot"}\n',
  sig: "-----BEGIN SSH SIGNATURE-----\n" +
    "U1NIU0lHAAAAAQAAADMAAAALc3NoLWVkMjU1MTkAAAAg7Q40nZI60Ta95Xd8pGYvCzntfC\n" +
    "ABkgKVQgWCOBGl0+IAAAAYc3R1ZGl1bS1hdXRvcGlsb3QtcGx1Z2luAAAAAAAAAAZzaGE1\n" +
    "MTIAAABTAAAAC3NzaC1lZDI1NTE5AAAAQDnQ50WF6b6FPkR1jAnoGnSsZ7udkDLyxIk4Ml\n" +
    "3E1nOw7SO+h9zc52Xxg1v17CoMwzpWpk+MU8gYKeD9eGWbiQA=\n" +
    "-----END SSH SIGNATURE-----\n",
  sigSha256: "-----BEGIN SSH SIGNATURE-----\n" +
    "U1NIU0lHAAAAAQAAADMAAAALc3NoLWVkMjU1MTkAAAAg7Q40nZI60Ta95Xd8pGYvCzntfC\n" +
    "ABkgKVQgWCOBGl0+IAAAAYc3R1ZGl1bS1hdXRvcGlsb3QtcGx1Z2luAAAAAAAAAAZzaGEy\n" +
    "NTYAAABTAAAAC3NzaC1lZDI1NTE5AAAAQHI4oOxQZvtgCchCCZqplqkTdHjHfcr5VaJTva\n" +
    "eoPxm3x+FuZamPcovJCagxc2p1lUnLWcSXNIzz16oh/Tkd3ws=\n" +
    "-----END SSH SIGNATURE-----\n",
};

module.exports = { NAMENSRAUM, RELEASES, signaturUrl, schluesselBauen, signieren, skSignieren, armor, sshText, FEST };
