// Signatur der Update-Liste (seit 01.11.2026; geprüft im Kern, main.js, ctx.signatur): Das Update (update.js) nimmt
// system-dateien.json nur mit einer gültigen SSH-Signatur system-dateien.json.sig aus dem Release (ssh-keygen -Y sign,
// PROTOCOL.sshsig), Namensraum studium-autopilot-plugin, Hash sha512, Schlüssel aus SIGNATUR_SCHLUESSEL in main.js
// (= server/allowed_signers), und legt die Signatur neben die Liste in den Tresor. Jede Abweichung und eine fehlende Signatur
// heißen: nichts installiert. Ohne Ed25519 in Web Crypto prüft der eingebaute Prüfer (tests/ed25519.test.js), ohne SHA-512
// gar nichts. Signiert wird mit Wegwerf-Schlüsseln:
// fest eingetragene Signaturen von ssh-keygen (unten), zur Laufzeit mit ssh-keygen (wenn da) und mit tests/signatur.js, dessen
// Signaturen ssh-keygen ebenfalls prüft. Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { laden } = require("./laden.js");
const S = require("./signatur.js");
const P = require("./kern.js").signatur;

const U = laden("update").ctx.update;
const enc = (s) => new TextEncoder().encode(s);
const dec = (b) => new TextDecoder("utf-8").decode(b);

const { FEST } = S; // Signaturen von ssh-keygen, fest eingetragen (tests/signatur.js)
const pruefen = (sig, daten, schluessel, o) => P.pruefen(typeof sig === "string" ? enc(sig) : sig, enc(daten),
  Object.assign({ schluessel }, o));
const abgelehnt = async (sig, daten, schluessel, grund, was) => {
  const r = await pruefen(sig, daten, schluessel);
  assert.equal(r.ok, false, was);
  assert.equal(r.art, "signatur", was);
  assert.match(r.fehler, grund, was);
};

test("Signatur von ssh-keygen (fest eingetragen): gültig mit ihrem Schlüssel; ein Byte der Liste anders → ungültig", async () => {
  assert.deepEqual(await pruefen(FEST.sig, FEST.liste, [FEST.schluessel]), { ok: true, schluessel: FEST.schluessel });
  // auch mit CRLF und ohne letzten Zeilenumbruch (die Signatur selbst ist dieselbe)
  assert.equal((await pruefen(FEST.sig.replace(/\n/g, "\r\n"), FEST.liste, [FEST.schluessel])).ok, true);
  assert.equal((await pruefen(FEST.sig.replace(/\n$/, ""), FEST.liste, [FEST.schluessel])).ok, true);
  // jedes einzelne Byte der Liste zählt
  const by = enc(FEST.liste);
  for (const i of [0, 20, by.length - 1]) {
    const anders = by.slice();
    anders[i] ^= 1;
    await abgelehnt(FEST.sig, dec(anders), [FEST.schluessel], /ungültig/, "Byte " + i);
  }
  await abgelehnt(FEST.sig, FEST.liste + " ", [FEST.schluessel], /ungültig/, "ein Byte mehr");
  await abgelehnt(FEST.sig, FEST.liste.slice(0, -1), [FEST.schluessel], /ungültig/, "ein Byte weniger");
});

test("Signatur: fremder Schlüssel, und die echten festen Schlüssel nehmen keine fremde Signatur an", async () => {
  const fremd = S.schluesselBauen();
  await abgelehnt(FEST.sig, FEST.liste, [fremd.oeffentlich], /Schlüssel nicht erlaubt/, "anderer fester Schlüssel");
  await abgelehnt(FEST.sig, FEST.liste, [], /Schlüssel nicht erlaubt/, "leere Liste");
  // ohne schluessel gelten SIGNATUR_SCHLUESSEL aus main.js: der Wegwerf-Schlüssel steht nicht darin
  const r = await P.pruefen(enc(FEST.sig), enc(FEST.liste));
  assert.deepEqual([r.ok, r.fehler], [false, "Signatur: Schlüssel nicht erlaubt"]);
  // Signatur eines fremden Schlüssels, der sich als der erlaubte ausgibt (Schlüssel im Blob getauscht): ungültig
  const getauscht = S.signieren(enc(FEST.liste), fremd, { schluesselBlob: Buffer.from(FEST.schluessel.split(" ")[1], "base64") });
  await abgelehnt(getauscht, FEST.liste, [FEST.schluessel], /ungültig/, "Blob mit erlaubtem Schlüssel, signiert von einem anderen");
});

test("Signatur: Namensraum genau studium-autopilot-plugin, Hash genau sha512, reserviert leer", async () => {
  const s = S.schluesselBauen(), ok = [s.oeffentlich], daten = enc(FEST.liste);
  assert.equal((await pruefen(S.signieren(daten, s), FEST.liste, ok)).ok, true, "Wegwerf-Signatur ohne Abweichung gilt");
  for (const ns of ["studium-server", "git", "file", "studium-autopilot-plugin ", "Studium-Autopilot-Plugin", ""]) {
    await abgelehnt(S.signieren(daten, s, { namensraum: ns }), FEST.liste, ok, /Namensraum/, "Namensraum " + JSON.stringify(ns));
  }
  // Namensraum im Blob richtig, signiert aber über einen anderen (etwa eine Signatur für Server-Pakete): ungültig
  await abgelehnt(S.signieren(daten, s, { signiertNamensraum: "studium-server" }), FEST.liste, ok, /ungültig/, "signiert für studium-server");
  // sha256 ist bei ssh-keygen erlaubt, hier nicht (fest eingetragen von ssh-keygen, und selbst gebaut)
  await abgelehnt(FEST.sigSha256, FEST.liste, [FEST.schluessel], /Hash nicht sha512/, "ssh-keygen -O hashalg=sha256");
  for (const hash of ["sha256", "sha384", "SHA512", "sha1"]) {
    await abgelehnt(S.signieren(daten, s, { hash }), FEST.liste, ok, /Hash nicht sha512/, hash);
  }
  await abgelehnt(S.signieren(daten, s, { reserviert: "x" }), FEST.liste, ok, /reserviert nicht leer/, "reserviert");
});

test("Signatur: falsche Magie oder Version, Daten danach, falsche Schlüsselart der Signatur", async () => {
  const s = S.schluesselBauen(), ok = [s.oeffentlich], daten = enc(FEST.liste);
  await abgelehnt(S.signieren(daten, s, { magie: "SSHSIH" }), FEST.liste, ok, /kein SSHSIG/, "Magie");
  await abgelehnt(S.signieren(daten, s, { magie: "sshsig" }), FEST.liste, ok, /kein SSHSIG/, "Magie klein");
  for (const version of [0, 2, 0x01000000]) await abgelehnt(S.signieren(daten, s, { version }), FEST.liste, ok, /Version unbekannt/, "Version " + version);
  await abgelehnt(S.signieren(daten, s, { nachher: Buffer.from([0]) }), FEST.liste, ok, /Daten nach der Signatur/, "ein Byte danach");
  await abgelehnt(S.signieren(daten, s, { signaturArt: "ssh-rsa" }), FEST.liste, ok, /passt nicht zur Schlüsselart/, "Signatur als ssh-rsa");
  // Schlüssel-Blob mit Rest: Schlüssel nicht erlaubt, auch wenn der Anfang passt (bytegenauer Vergleich)
  await abgelehnt(S.signieren(daten, s, { schluesselBlob: Buffer.concat([s.blob, Buffer.from([0])]) }), FEST.liste, ok, /Daten nach dem Schlüssel/, "Schlüssel mit Rest");
});

test("Signatur: Hardware-Schlüssel (sk-ssh-ed25519@openssh.com) abgelehnt, auch wenn er fest eingetragen wäre", async () => {
  const s = S.schluesselBauen(), sk = S.skSignieren(enc(FEST.liste), s);
  await abgelehnt(sk.sig, FEST.liste, [sk.oeffentlich], /Schlüsselart nicht erlaubt: sk-ssh-ed25519@openssh\.com/, "sk-ssh-ed25519");
  // andere Schlüsselarten ebenso
  for (const art of ["ssh-rsa", "ecdsa-sha2-nistp256", "ssh-ed448", "__proto__", "constructor"]) {
    await abgelehnt(S.signieren(enc(FEST.liste), s, { art }), FEST.liste, [s.oeffentlich], /Schlüsselart nicht erlaubt/, art);
  }
});

test("Signatur: Armor und Base64 nur in der Form von ssh-keygen", async () => {
  const ok = [FEST.schluessel], z = FEST.sig.split("\n");
  const form = (sig, was) => abgelehnt(sig, FEST.liste, ok, /Form ungültig|fehlt/, was);
  await form("", "leer");
  await form(new Uint8Array(0), "leer (Bytes)");
  await form(FEST.sig.replace("BEGIN SSH SIGNATURE", "BEGIN SSH SIGNATUR"), "Anfang");
  await form(FEST.sig.replace("-----END SSH SIGNATURE-----\n", ""), "Ende fehlt");
  await form("Text davor\n" + FEST.sig, "Text davor");
  await form(FEST.sig + "Text danach\n", "Text danach");
  await form(FEST.sig + "\n", "zwei Zeilenumbrüche am Ende");
  await form([z[0], z[1], "", ...z.slice(2)].join("\n"), "leere Zeile");
  await form([z[0], z[1] + " ", ...z.slice(2)].join("\n"), "Leerzeichen am Zeilenende");
  await form(FEST.sig.replace("U1NIU0lH", "U1NIU0l*"), "Zeichen außerhalb von Base64");
  await form(FEST.sig.replace("QA=\n", "QA\n"), "Auffüllung fehlt");
  await form(FEST.sig.replace("QA=\n", "QB=\n"), "überzählige Bits (zweite Schreibweise derselben Bytes)");
  await form(FEST.sig.replace("U1NIU0lH", "U1NIU0lH===="), "Auffüllung mitten im Text");
  await form("-----BEGIN SSH SIGNATURE-----\n-----END SSH SIGNATURE-----\n", "ohne Inhalt");
  await abgelehnt("x".repeat(8193), FEST.liste, ok, /fehlt oder zu groß/, "zu groß");
  // gekürzt (an einer Grenze von vier Zeichen, also gültiges Base64): unvollständig
  const b64 = z.slice(1, -2).join("");
  for (const n of [4, 40, 200, b64.length - 4]) {
    await abgelehnt(z[0] + "\n" + b64.slice(0, n) + "\n" + z[z.length - 2] + "\n", FEST.liste, ok, /unvollständig|kein SSHSIG|Daten nach/, "gekürzt auf " + n);
  }
  // ein Bit der Signatur selbst: ungültig (Form bleibt richtig)
  await abgelehnt(FEST.sig.replace("AAAAQDnQ", "AAAAQDnR"), FEST.liste, ok, /ungültig/, "Signatur verändert");
});

// Web Crypto wie in Safari 16 (iOS 16): SHA-512 ja, Ed25519 nicht
const ohneEd25519 = {
  digest: (a, d) => crypto.subtle.digest(a, d),
  importKey: async () => { throw new DOMException("Unrecognized algorithm name", "NotSupportedError"); },
  verify: async () => { throw new Error("nie erreicht"); },
};

// Web Crypto ganz ohne SHA-512 (kommt in Obsidian nicht vor): nichts prüfbar
const ohneSha512 = {
  digest: async () => { throw new DOMException("Unrecognized algorithm name", "NotSupportedError"); },
  importKey: ohneEd25519.importKey, verify: ohneEd25519.verify,
};

test("Signatur: Gerät ohne Ed25519 in Web Crypto → der eingebaute Prüfer, gleiches Ergebnis; ohne SHA-512 → „krypto“, nie gültig", async () => {
  assert.deepEqual(await pruefen(FEST.sig, FEST.liste, [FEST.schluessel], { subtle: ohneEd25519 }), { ok: true, schluessel: FEST.schluessel });
  assert.equal(await P.ed25519Da(ohneEd25519), false);
  assert.equal(await P.pruefbar(ohneEd25519), true);
  const anders = enc(FEST.liste);
  anders[3] ^= 1;
  assert.deepEqual(await P.pruefen(enc(FEST.sig), anders, { schluessel: [FEST.schluessel], subtle: ohneEd25519 }),
    { ok: false, art: "signatur", fehler: "Signatur: ungültig" });
  const verbogen = await pruefen(FEST.sig.replace("AAAAQDnQ", "AAAAQDnR"), FEST.liste, [FEST.schluessel], { subtle: ohneEd25519 });
  assert.deepEqual([verbogen.ok, verbogen.art], [false, "signatur"], "Signatur verändert, eingebauter Prüfer");
  const fremd = S.schluesselBauen(), s = S.signieren(enc(FEST.liste), fremd);
  assert.equal((await pruefen(s, FEST.liste, [fremd.oeffentlich], { subtle: ohneEd25519 })).ok, true, "Wegwerf-Signatur");
  const anderer = S.signieren(enc(FEST.liste), fremd, { signiertNamensraum: "studium-server" });
  assert.equal((await pruefen(anderer, FEST.liste, [fremd.oeffentlich], { subtle: ohneEd25519 })).ok, false, "signiert für studium-server");
  const r = await pruefen(FEST.sig, FEST.liste, [FEST.schluessel], { subtle: ohneSha512 });
  assert.deepEqual([r.ok, r.art], [false, "krypto"]);
  assert.match(r.fehler, /Web Crypto ohne SHA-512 \(Unrecognized algorithm name\)/);
  assert.equal(await P.pruefbar(ohneSha512), false);
  // verify antwortet etwas anderes als true (etwa eine fehlerhafte Umsetzung): ungültig
  const komisch = { digest: ohneEd25519.digest, importKey: (...a) => crypto.subtle.importKey(...a), verify: async () => 1 };
  assert.deepEqual(await pruefen(FEST.sig, FEST.liste, [FEST.schluessel], { subtle: komisch }), { ok: false, art: "signatur", fehler: "Signatur: ungültig" });
});

// ---------- Das Update mit Signatur (aktualisierenMit) ----------
const KERN = ".obsidian/plugins/studium-autopilot/";
const BASIS = (v) => `https://raw.githubusercontent.com/studium-autopilot/ecoba/v${v}/`;
const ASSET = (v) => `${S.RELEASES}/download/v${v}/system-dateien.json`;
const stand = (v) => ({ [KERN + "main.js"]: `// kern ${v}\n`, [KERN + "manifest.json"]: `{"version":"${v}"}\n`, "System/Skripte/neu.js": `// ${v}\n` });
async function listeBauen(version, dateien) {
  const liste = { schema: 1, version, ordner: "Studium Autopilot", erstellt: "2026-11-01T12:00:00Z", dateien: [] };
  for (const pfad of Object.keys(dateien).sort()) {
    const by = enc(dateien[pfad]);
    liste.dateien.push({ pfad, klasse: U.klasseVon(pfad), groesse: by.length, sha256: await U.sha256(by) });
  }
  return JSON.stringify(liste, null, 1) + "\n";
}

// Update von 0.7.5 auf v (Standard 0.7.6). o: { sig: Text | null (404) | "netz", liste: Text (sonst die echte), version,
// altVersion, subtle, schluessel, ohneAdresse }. → { b, abrufe, m (Tresor), vorher }
async function lauf(o = {}) {
  const v = o.version || "0.7.6", ALT = stand("0.7.5"), NEU = stand(v);
  const schluessel = o.signierer || S.schluesselBauen();
  const liste = o.liste || await listeBauen(v, NEU);
  const sig = o.sig === undefined ? S.signieren(enc(liste), schluessel) : o.sig;
  const abrufe = [], m = new Map(Object.entries(ALT).map(([k, x]) => [k, enc(x)]));
  const io = {
    holen: async (url) => {
      abrufe.push(url);
      if (url === S.signaturUrl(v)) {
        if (sig === "netz") throw new Error("offline");
        if (sig == null) throw new Error("HTTP 404");
        return enc(sig);
      }
      if (url === ASSET(v)) return enc(liste);
      const pfad = decodeURIComponent(url.slice((BASIS(v) + "Studium%20Autopilot/").length));
      if (Object.prototype.hasOwnProperty.call(NEU, pfad)) return enc(NEU[pfad]);
      throw new Error("HTTP 404");
    },
    lesen: async (p) => (m.has(p) ? m.get(p) : null),
    schreiben: async (p, b) => { m.set(p, b); },
    loeschen: async (p) => { m.delete(p); },
  };
  const vorher = JSON.stringify(Array.from(m));
  const release = { version: v, url_basis: BASIS(v), sha256: await U.sha256(enc(liste)), notiz: "" };
  const b = await U.aktualisierenMit(io, { release, alt: null, altVersion: o.altVersion === undefined ? "0.7.5" : o.altVersion,
    zeit: new Date(2026, 10, 1, 12, 0), listeRelease: ASSET(v), signatur: o.ohneAdresse ? undefined : S.signaturUrl(v),
    schluessel: o.schluessel || [schluessel.oeffentlich], subtle: o.subtle });
  return { b, abrufe, m, vorher, unveraendert: () => JSON.stringify(Array.from(m)) === vorher, schluessel, sig };
}

test("Update: mit gültiger Signatur installiert; Signatur zuerst und aus dem Release, Bericht nennt den Schlüssel", async () => {
  const r = await lauf();
  assert.equal(r.b.ok, true, r.b.fehler);
  assert.equal(r.b.signiert, r.schluessel.oeffentlich);
  assert.deepEqual(r.abrufe.slice(0, 2), [S.signaturUrl("0.7.6"), ASSET("0.7.6")]);
  assert.equal(dec(r.m.get("System/Skripte/neu.js")), "// 0.7.6\n");
  // Die Signatur liegt danach Byte für Byte neben der Liste im Tresor: Damit prüft der Kern auf jedem Gerät die Skripte
  assert.equal(U.LISTE_SIG, U.LISTE + ".sig");
  assert.equal(dec(r.m.get(U.LISTE_SIG)), r.sig);
  assert.equal((await P.pruefen(r.m.get(U.LISTE_SIG), r.m.get(U.LISTE), { schluessel: [r.schluessel.oeffentlich] })).ok, true);
  assert.equal(U.signaturUrl("0.7.6"), "https://github.com/studium-autopilot/ecoba/releases/download/v0.7.6/system-dateien.json.sig");
  assert.equal(U.SIGNATUR_ASSET, U.LISTE_ASSET + ".sig");
});

test("Update: Signatur fehlt (404), kommt nicht an, ist ungültig oder von einem fremden Schlüssel → nichts installiert, keine Datei geladen", async () => {
  const faelle = [
    [{ sig: null }, "signatur", /Signatur fehlt \(HTTP 404\)/],
    [{ sig: "netz" }, "netz", /Signatur nicht geladen \(offline\)/],
    [{ sig: "kein armor" }, "signatur", /Form ungültig/],
    [{ ohneAdresse: true }, "signatur", /keine Adresse/],
  ];
  for (const [o, art, grund] of faelle) {
    const r = await lauf(o);
    assert.deepEqual([r.b.ok, r.b.art], [false, art], JSON.stringify(o));
    assert.match(r.b.fehler, grund);
    assert.ok(r.unveraendert(), "nichts geschrieben: " + JSON.stringify(o));
    assert.ok(!r.abrufe.some((u) => u.startsWith(BASIS("0.7.6"))), "keine Datei geladen: " + JSON.stringify(o));
    assert.equal(U.ergebnisSatz(r.b), art === "netz" ? U.ergebnisSatz({ ok: false, art: "netz" }) : "Die neue Version ließ sich nicht als echt bestätigen. Darum wurde nichts geändert.");
  }
  // Wer Konto und Manifest hat, kann eine eigene Liste mit passender Prüfsumme ausliefern, aber nicht signieren: Die Signatur der
  // echten Liste passt nicht zur getauschten, die eigene Signatur stammt von einem fremden Schlüssel
  const echt = S.schluesselBauen(), fremd = S.schluesselBauen();
  const listeEcht = await listeBauen("0.7.6", stand("0.7.6"));
  const getauscht = await listeBauen("0.7.6", Object.assign(stand("0.7.6"), { "System/Skripte/fremd.js": "// fremder Code\n" }));
  for (const [sig, grund] of [[S.signieren(enc(listeEcht), echt), /ungültig/], [S.signieren(enc(getauscht), fremd), /Schlüssel nicht erlaubt/]]) {
    const r = await lauf({ liste: getauscht, sig, schluessel: [echt.oeffentlich] });
    assert.deepEqual([r.b.ok, r.b.art], [false, "signatur"]);
    assert.match(r.b.fehler, grund);
    assert.ok(r.unveraendert() && !r.abrufe.some((u) => u.endsWith("fremd.js")), "fremder Code nie geladen");
  }
});

test("Update: Gerät ohne Ed25519 (iOS 16) installiert mit dem eingebauten Prüfer; ohne SHA-512 nichts geladen, der Satz sagt, was zu tun ist", async () => {
  const ok = await lauf({ subtle: ohneEd25519 });
  assert.equal(ok.b.ok, true, ok.b.fehler);
  // eine Liste, die kein fester Schlüssel signiert hat, nimmt auch der eingebaute Prüfer nicht
  const fremd = await lauf({ subtle: ohneEd25519, schluessel: [S.schluesselBauen().oeffentlich] });
  assert.deepEqual([fremd.b.ok, fremd.b.art], [false, "signatur"]);
  assert.ok(fremd.unveraendert());
  const r = await lauf({ subtle: ohneSha512 });
  assert.deepEqual([r.b.ok, r.b.art], [false, "krypto"]);
  assert.deepEqual(r.abrufe, [], "kein Abruf: auch die Liste zählt nicht als Update");
  assert.ok(r.unveraendert());
  const satz = U.ergebnisSatz(r.b);
  assert.match(satz, /nicht prüfen, ob die neue Version echt ist/);
  assert.match(satz, /auf einem anderen Gerät/);
  assert.doesNotMatch(satz, /iOS \(ab 17\)/, "iOS 16 kann jetzt prüfen");
});

test("Update: ein älterer Kern ohne ctx.signatur installiert nichts und lädt nichts; der Satz sagt „Neu laden“", async () => {
  const { ctx } = laden("update", { kontext: { signatur: undefined } });
  const abrufe = [];
  const b = await ctx.update.aktualisierenMit({ holen: async (u) => { abrufe.push(u); throw new Error("nie"); } },
    { release: { version: "0.7.6", url_basis: BASIS("0.7.6"), sha256: "0".repeat(64) }, altVersion: "0.7.5", signatur: S.signaturUrl("0.7.6") });
  assert.deepEqual([b.ok, b.art, abrufe], [false, "kern", []]);
  const satz = ctx.update.ergebnisSatz(b);
  assert.match(satz, /„Neu laden“/);
  assert.doesNotMatch(satz, /aktualisiere Obsidian/);
});

test("Update: nur vorwärts, auch mit gültiger Signatur (dieselbe, eine ältere oder keine bekannte Version → nichts)", async () => {
  for (const [version, altVersion] of [["0.7.5", "0.7.5"], ["0.7.4", "0.7.5"], ["0.7.6-beta.1", "0.7.6"], ["0.7.6", ""], ["0.7.6", null], ["0.7.6", "x"]]) {
    const r = await lauf({ version, altVersion });
    assert.deepEqual([r.b.ok, r.b.art], [false, "liste"], version + " über " + altVersion);
    assert.match(r.b.fehler, /ist nicht neuer als/);
    assert.deepEqual(r.abrufe, [], "nichts geladen");
    assert.ok(r.unveraendert());
  }
  // angebot() bietet so eine Version gar nicht erst an
  assert.equal(U.angebot({ version: "0.7.5" }, null, "stabil", "0.7.5"), null);
  assert.equal(U.angebot({ version: "0.7.4" }, { version: "0.7.6-beta.1" }, "beta", "0.7.6"), null);
  // eine Beta vor der fertigen Version ist neuer als die Version davor
  assert.equal((await lauf({ version: "0.7.6-beta.1" })).b.ok, true);
});

// ---------- Fester Schlüssel = server/allowed_signers ----------
test("Feste Schlüssel: gleich denen in server/allowed_signers, gültige ssh-ed25519-Schlüssel, eigener Namensraum", async () => {
  const datei = path.join(__dirname, "..", "server", "allowed_signers");
  const server = fs.readFileSync(datei, "utf8").split("\n").filter((z) => z.trim() && !z.trim().startsWith("#"))
    .map((z) => z.trim().split(/\s+/).slice(-2).join(" "));
  assert.ok(server.length >= 1);
  assert.deepEqual([...P.SCHLUESSEL].sort(), [...new Set(server)].sort(),
    "SIGNATUR_SCHLUESSEL in main.js und server/allowed_signers nennen dieselben Schlüssel (Schlüsselwechsel: docs/release.md)");
  assert.ok(Object.isFrozen(P.SCHLUESSEL));
  for (const k of P.SCHLUESSEL) {
    const [art, b64] = k.split(" ");
    const blob = Buffer.from(b64, "base64");
    assert.equal(art, "ssh-ed25519");
    assert.equal(blob.toString("base64"), b64);
    assert.equal(blob.readUInt32BE(0), 11);
    assert.equal(blob.subarray(4, 15).toString(), "ssh-ed25519");
    assert.deepEqual([blob.readUInt32BE(15), blob.length], [32, 51]);
  }
  assert.equal(P.NAMENSRAUM, "studium-autopilot-plugin");
  assert.ok(!fs.readFileSync(datei, "utf8").includes(P.NAMENSRAUM), "Server-Pakete und Update-Liste in getrennten Namensräumen");
  // Dieses Gerät (Node) kann Ed25519 prüfen; sonst wären alle Tests oben ohne Aussage
  assert.equal((await lauf()).b.ok, true);
});

// ---------- Echte Signatur eines Releases (nur beim Release, docs/release.md „2. Prüfen“) ----------
// ECOBA_RELEASE = Ordner mit den Assets von release.py --zip (im Baum: ..). Die Signatur muss mit den festen Schlüsseln aus
// main.js gelten, so wie das Plugin dieser Version die nächste prüft, und Liste und Signatur müssen die im Baum sein.
const RELEASE_ORDNER = process.env.ECOBA_RELEASE;
test("Release: die Signatur aus release.py --zip gilt mit den festen Schlüsseln aus main.js", { skip: !RELEASE_ORDNER && "nur mit ECOBA_RELEASE=<Ordner der Assets>" }, async () => {
  const liste = fs.readFileSync(path.join(RELEASE_ORDNER, "system-dateien.json"));
  const sig = fs.readFileSync(path.join(RELEASE_ORDNER, "system-dateien.json.sig"));
  const r = await P.pruefen(new Uint8Array(sig), new Uint8Array(liste));
  assert.equal(r.ok, true, r.fehler);
  assert.ok(P.SCHLUESSEL.includes(r.schluessel));
  const baum = path.join(__dirname, "..", "Studium Autopilot", "System", "Daten", "system-dateien.json");
  if (fs.existsSync(baum)) {
    assert.ok(liste.equals(fs.readFileSync(baum)), "dieselben Bytes wie die Liste im Baum");
    assert.ok(sig.equals(fs.readFileSync(baum + ".sig")), "die Signatur liegt im Baum neben der Liste (der Kern prüft damit die Skripte)");
  }
});

// ---------- Gegenprobe mit ssh-keygen (in GitHub Actions immer da) ----------
const OHNE_SSH_KEYGEN = spawnSync("bash", ["-c", "command -v ssh-keygen"]).status !== 0 && "kein ssh-keygen";
const keygen = (...a) => spawnSync("bash", ["-c", 'ssh-keygen "$@"', "-", ...a.map((x) => x.replace(/\\/g, "/"))], { encoding: "utf8" });

test("ssh-keygen: seine Signaturen gelten im Update (sha512), andere Namensräume und sha256 nicht; die Test-Signaturen prüft ssh-keygen", { skip: OHNE_SSH_KEYGEN }, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "signatur-"));
  try {
    const p = (n) => path.join(tmp, n);
    assert.equal(keygen("-q", "-t", "ed25519", "-N", "", "-C", "wegwerf", "-f", p("k")).status, 0);
    const pub = fs.readFileSync(p("k.pub"), "utf8").trim().split(/\s+/).slice(0, 2).join(" ");
    fs.writeFileSync(p("liste.json"), FEST.liste);
    const signieren = (ns, ...extra) => {
      fs.rmSync(p("liste.json.sig"), { force: true });
      const r = keygen("-Y", "sign", "-f", p("k"), "-n", ns, ...extra, p("liste.json"));
      assert.equal(r.status, 0, r.stderr);
      return fs.readFileSync(p("liste.json.sig"), "utf8");
    };
    assert.deepEqual(await pruefen(signieren("studium-autopilot-plugin"), FEST.liste, [pub]), { ok: true, schluessel: pub });
    await abgelehnt(signieren("studium-server"), FEST.liste, [pub], /Namensraum/, "ssh-keygen -n studium-server");
    await abgelehnt(signieren("git"), FEST.liste, [pub], /Namensraum/, "ssh-keygen -n git");
    await abgelehnt(signieren("studium-autopilot-plugin", "-O", "hashalg=sha256"), FEST.liste, [pub], /Hash nicht sha512/, "ssh-keygen sha256");
    // Gegenrichtung: tests/signatur.js signiert wie ssh-keygen; ssh-keygen nimmt sie an, eine abweichende nicht
    const s = S.schluesselBauen();
    fs.writeFileSync(p("erlaubt"), `test namespaces="studium-autopilot-plugin" ${s.oeffentlich}\n`);
    const verify = (sig) => {
      fs.writeFileSync(p("test.sig"), sig);
      return spawnSync("bash", ["-c", 'ssh-keygen -Y verify -f "$1" -I test -n studium-autopilot-plugin -s "$2" < "$3"', "-",
        ...[p("erlaubt"), p("test.sig"), p("liste.json")].map((x) => x.replace(/\\/g, "/"))], { encoding: "utf8" });
    };
    const echt = verify(S.signieren(enc(FEST.liste), s));
    assert.equal(echt.status, 0, echt.stderr + echt.stdout);
    assert.notEqual(verify(S.signieren(enc(FEST.liste), s, { signiertNamensraum: "studium-server" })).status, 0);
    assert.notEqual(verify(S.signieren(enc(FEST.liste + "x"), s)).status, 0);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
