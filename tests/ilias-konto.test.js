// ILIAS: Sitzung eines anderen Kontos und Abmelden (ilias.js quelleAusNetz, „Konto der Sitzung“; Motor: zugangSpeichern,
// zugangLoeschen). Mit dem echten ilias-netz.js (Transport-Attrappe, iPhone/iPad: folgtSelbst) und ilias-html.js an erfundenen
// Seiten aus tests/daten/ilias-seiten/ (kurs.html zeigt das Kürzel „ab“, anderes-konto.html „xy“). Kein Netz.
// Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { laden } = require("./laden.js");
const { GEHEIM, aufbau, enc } = require("./ilias-attrappen.js");

const ILIAS = "https://ovidius.uni-tuebingen.de", IDP = "https://idp.uni-tuebingen.de";
const seite = (n) => fs.readFileSync(path.join(__dirname, "daten", "ilias-seiten", n + ".html"), "utf8");
const ABMELDEN = "/ilias.php?baseClass=ilstartupgui&cmd=doLogout&rtoken=0erfunden0token0fuer0tests0000000&lang=de";
const AUS = ["GET /Shibboleth.sso/Logout", "GET idp:/idp/profile/Logout"];
const DATEI = { art: "datei", typ: "file", refId: "77", titel: "Skript", endung: "pdf", url: ILIAS + "/ilias.php?baseClass=ilrepositorygui&cmdClass=ilObjFileGUI&cmd=sendfile&ref_id=77" };

// Nachgespieltes ILIAS: jede Seite ist z.seite (Kürzel je nach Seite), Abmelden und IdP antworten mit einer leeren Seite
function umgebung(o) {
  o = o || {};
  const z = { seite: o.seite || "kurs", geholt: [] };
  const html = { "content-type": "text/html; charset=utf-8" };
  const transport = async (a) => {
    z.geholt.push((a.methode || "GET") + " " + a.url.replace(ILIAS, "").replace(IDP, "idp:"));
    if (/cmd=sendfile/.test(a.url)) return { status: 200, kopf: { "content-type": "application/pdf", "content-length": "4" }, daten: enc("%PDF").buffer };
    if (a.url.indexOf(IDP) === 0 || /Shibboleth\.sso|doLogout/.test(a.url)) return { status: 200, kopf: html, text: "<html><body>Abgemeldet</body></html>" };
    return { status: 200, kopf: html, text: typeof z.seite === "function" ? z.seite(a.url) : seite(z.seite) };
  };
  if (o.mobil) transport.folgtSelbst = true;
  const echt = laden("ilias-netz").ergebnis;
  const N = Object.assign({}, echt, { sitzung: (x) => echt.sitzung(Object.assign({}, x, { transport })) });
  z.Q = laden("ilias", { kontext: { user: { "ilias-netz": N, "ilias-html": laden("ilias-html").ergebnis } } }).ctx.ilias;
  return z;
}
// Kürzel wie im Motor (kontoFuer): k = gemerkt, gemerkt = alle merken-Aufrufe
const kontoMit = (k) => { const o = { k, gemerkt: [] }; o.kuerzel = () => o.k; o.merken = (x) => { o.gemerkt.push(x); o.k = x; }; return o; };
// Anmeldung: mit oder ohne Passwort (dann galt eine Sitzung des Geräts), konto wie ilias-anmeldung.js
const anmeldung = (z, gesendet, konto) => async () => { z.geholt.push("ANMELDEN"); return { ok: true, passwortGesendet: gesendet, konto: konto || "" }; };
const zugang = (konto) => ({ benutzer: "zxabc01", kennwortGeber: () => GEHEIM, konto });

test("Fremde Sitzung: anderes Kürzel als gemerkt → abmelden (ILIAS, SP, IdP), nichts lesen, danach keine Anfrage mehr", async () => {
  const z = umgebung({ seite: "anderes-konto" });
  const konto = kontoMit("ab");
  const q = await z.Q.quelleAusNetz(zugang(konto), anmeldung(z, false), { wiederverwenden: true });
  await assert.rejects(q.kurse(), (e) => e.art === "fremd" && e.grund === "fremde-sitzung" && /anderen Konto angemeldet/.test(e.message));
  assert.deepEqual(z.geholt, ["ANMELDEN", "GET /ilias.php?baseClass=ilmembershipoverviewgui", "GET " + ABMELDEN].concat(AUS));
  const n = z.geholt.length;
  await assert.rejects(q.inhalt({ url: ILIAS + "/goto.php/fold/5" }), (e) => e.grund === "fremde-sitzung");
  await assert.rejects(q.laden(DATEI), (e) => e.grund === "fremde-sitzung");
  await assert.rejects(q.kalenderAbo(), (e) => e.grund === "fremde-sitzung");
  assert.equal(z.geholt.length, n, "danach geht nichts mehr hinaus");
  assert.deepEqual(konto.gemerkt, [], "das fremde Kürzel wird nicht gemerkt");
  // die Sitzung ist vergessen: der nächste Lauf meldet sich neu an
  z.seite = "kurs"; z.geholt.length = 0;
  const q2 = await z.Q.quelleAusNetz(zugang(konto), anmeldung(z, true, "ab"), { wiederverwenden: true });
  await q2.kurse();
  assert.deepEqual(z.geholt, ["ANMELDEN", "GET /ilias.php?baseClass=ilmembershipoverviewgui"]);
});

test("Konto: gleiches Kürzel, kein gemerktes oder kein Kürzel auf der Seite → lesen; mit Passwort angemeldet → Kürzel merken", async () => {
  // gleich
  let z = umgebung();
  let konto = kontoMit("ab");
  let q = await z.Q.quelleAusNetz(zugang(konto), anmeldung(z, false));
  await q.kurse(); await q.kurse();
  assert.deepEqual(z.geholt, ["ANMELDEN", "GET /ilias.php?baseClass=ilmembershipoverviewgui", "GET /ilias.php?baseClass=ilmembershipoverviewgui"]);
  // noch nichts gemerkt (vor der ersten Anmeldung mit Passwort): gilt
  z = umgebung({ seite: "anderes-konto" });
  q = await z.Q.quelleAusNetz(zugang(kontoMit("")), anmeldung(z, false));
  await q.kurse();
  // Seite ohne Kürzel (Foto als Profilbild): gilt
  z = umgebung({ seite: "dashboard" });
  q = await z.Q.quelleAusNetz(zugang(kontoMit("ab")), anmeldung(z, false));
  await q.kurse();
  // mit Passwort angemeldet: Kürzel aus der Anmeldung und von der ersten Seite gemerkt, auch wenn vorher ein anderes galt
  z = umgebung({ seite: "anderes-konto" });
  konto = kontoMit("ab");
  q = await z.Q.quelleAusNetz(zugang(konto), anmeldung(z, true, "xy"));
  await q.kurse();
  assert.deepEqual(konto.gemerkt, ["xy", "xy"]);
  assert.ok(z.geholt.every((x) => !/Logout/.test(x)), "kein Abmelden");
  // ohne Konto im Zugang (ältere Aufrufer): wie bisher
  z = umgebung({ seite: "anderes-konto" });
  q = await z.Q.quelleAusNetz({ benutzer: "zxabc01", kennwortGeber: () => GEHEIM }, anmeldung(z, false));
  await q.kurse();
});

test("Konto vor einem Download: erst das Dashboard, solange keine Seite der Sitzung geprüft ist; fremd → keine Datei", async () => {
  let z = umgebung();
  let q = await z.Q.quelleAusNetz(zugang(kontoMit("ab")), anmeldung(z, false));
  const r = await q.laden(DATEI);
  assert.equal(new TextDecoder().decode(r.daten), "%PDF");
  await q.laden(DATEI);
  assert.deepEqual(z.geholt, ["ANMELDEN", "GET /ilias.php?baseClass=ilDashboardGUI&cmd=show", "GET " + DATEI.url.replace(ILIAS, ""), "GET " + DATEI.url.replace(ILIAS, "")]);
  z = umgebung({ seite: "anderes-konto" });
  q = await z.Q.quelleAusNetz(zugang(kontoMit("ab")), anmeldung(z, false));
  await assert.rejects(q.laden(DATEI), (e) => e.grund === "fremde-sitzung");
  assert.ok(!z.geholt.some((x) => /sendfile/.test(x)), "die Datei wird nicht geholt");
  // mit Passwort angemeldet oder ohne gemerktes Kürzel: keine Anfrage zusätzlich
  for (const [gesendet, k] of [[true, "ab"], [false, ""]]) {
    z = umgebung();
    q = await z.Q.quelleAusNetz(zugang(kontoMit(k)), anmeldung(z, gesendet, "ab"));
    await q.laden(DATEI);
    assert.deepEqual(z.geholt, ["ANMELDEN", "GET " + DATEI.url.replace(ILIAS, "")]);
  }
});

test("Prüfende Anmeldung (abmelden): auf iPhone/iPad erst bei ILIAS, SP und IdP abmelden, dann anmelden; am PC nicht", async () => {
  let z = umgebung({ mobil: true, seite: "anderes-konto" });
  await z.Q.quelleAusNetz(zugang(kontoMit("")), anmeldung(z, true, "ab"), { abmelden: true });
  assert.deepEqual(z.geholt, ["GET /ilias.php?baseClass=ilDashboardGUI&cmd=show", "GET " + ABMELDEN].concat(AUS, ["ANMELDEN"]));
  // nicht angemeldet: kein Link, SP und IdP trotzdem
  z = umgebung({ mobil: true, seite: "anmeldung-ilias" });
  await z.Q.quelleAusNetz(zugang(kontoMit("")), anmeldung(z, true), { abmelden: true });
  assert.deepEqual(z.geholt, ["GET /ilias.php?baseClass=ilDashboardGUI&cmd=show"].concat(AUS, ["ANMELDEN"]));
  // am PC beginnt jede Sitzung ohne Kekse
  z = umgebung({ seite: "anderes-konto" });
  await z.Q.quelleAusNetz(zugang(kontoMit("")), anmeldung(z, true), { abmelden: true });
  assert.deepEqual(z.geholt, ["ANMELDEN"]);
  // Abmelden scheitert (Netz): die Anmeldung kommt trotzdem
  z = umgebung({ mobil: true });
  const N = laden("ilias-netz").ergebnis;
  const kaputt = async () => { throw Object.assign(new Error("Netzwerkfehler"), { grund: "netz" }); };
  kaputt.folgtSelbst = true;
  const Q = laden("ilias", { kontext: { user: { "ilias-netz": Object.assign({}, N, { sitzung: (x) => N.sitzung(Object.assign({}, x, { transport: kaputt })) }), "ilias-html": laden("ilias-html").ergebnis } } }).ctx.ilias;
  let angemeldet = 0;
  await Q.quelleAusNetz(zugang(kontoMit("")), async () => { angemeldet++; return { ok: true, passwortGesendet: true }; }, { abmelden: true });
  assert.equal(angemeldet, 1);
});

test("Trennen (uniAbmelden): gemerkte Sitzung abmelden und vergessen; ohne sie am PC nichts, auf iPhone/iPad eine neue", async () => {
  let z = umgebung({ seite: "anderes-konto" });
  await z.Q.quelleAusNetz(zugang(kontoMit("xy")), anmeldung(z, true, "xy"), { wiederverwenden: true });
  z.geholt.length = 0;
  await z.Q.uniAbmelden();
  assert.deepEqual(z.geholt, ["GET /ilias.php?baseClass=ilDashboardGUI&cmd=show", "GET " + ABMELDEN].concat(AUS));
  z.geholt.length = 0;
  await z.Q.quelleAusNetz(zugang(kontoMit("xy")), anmeldung(z, true, "xy"), { wiederverwenden: true });
  assert.deepEqual(z.geholt, ["ANMELDEN"], "vergessen: neu angemeldet");
  z = umgebung();
  await z.Q.uniAbmelden();
  assert.deepEqual(z.geholt, [], "PC ohne gemerkte Sitzung: nichts");
  z = umgebung({ mobil: true, seite: "anmeldung-ilias" });
  await z.Q.uniAbmelden();
  assert.deepEqual(z.geholt, ["GET /ilias.php?baseClass=ilDashboardGUI&cmd=show"].concat(AUS), "iPhone/iPad: die Kekse hält das Gerät");
  // eine neue Quelle wartet, bis das Abmelden fertig ist
  z = umgebung({ mobil: true, seite: "anmeldung-ilias" });
  const p = z.Q.uniAbmelden();
  await z.Q.quelleAusNetz(zugang(kontoMit("")), anmeldung(z, true));
  await p;
  assert.equal(z.geholt[z.geholt.length - 1], "ANMELDEN", "erst abmelden, dann anmelden");
});

test("Motor: Prüfen beim Speichern meldet vorher ab und merkt das Kürzel; Trennen meldet ab und vergisst es", async () => {
  const x = aufbau();
  const optionen = [];
  let abgemeldet = 0;
  const quelle = x.abh.quelle;
  x.abh.quelle = async (z, anmelden, o) => {
    optionen.push(o);
    assert.equal(typeof z.konto.kuerzel, "function");
    z.konto.merken("ab");
    return quelle(z, anmelden, o);
  };
  x.abh.abmelden = async () => { abgemeldet++; };
  assert.equal((await x.m.zugangSpeichern("zxabc01", () => GEHEIM, { pruefen: true })).ok, true);
  assert.deepEqual(optionen, [{ abmelden: true }]);
  assert.deepEqual(x.lok.lokal("eba-ilias-konto"), { benutzer: "zxabc01", kuerzel: "ab" });
  // ein Lauf reicht das Kürzel dieses Benutzernamens weiter, eines anderen nicht
  let gesehen = null;
  x.abh.quelle = async (z, anmelden, o) => { gesehen = z.konto.kuerzel(); return quelle(z, anmelden, o); };
  await x.m.jetztHolen({});
  assert.equal(gesehen, "ab");
  x.lok.lokal("eba-ilias-konto", { benutzer: "zxanders", kuerzel: "ab" });
  await x.m.jetztHolen({ manuell: true });
  assert.equal(gesehen, "");
  await x.m.zugangLoeschen();
  assert.equal(abgemeldet, 1);
  assert.equal(x.lok.lokal("eba-ilias-konto"), null);
});

test("Motor: fremde Sitzung beendet den Lauf mit einem klaren Hinweis, der nächste Lauf versucht es wieder", async () => {
  const x = aufbau();
  await x.m.zugangSpeichern("zxabc01", () => GEHEIM);
  const quelle = x.abh.quelle;
  let fremd = true;
  x.abh.quelle = async (z, anmelden, o) => {
    const q = await quelle(z, anmelden, o);
    if (!fremd) return q;
    const e = Object.assign(new Error("ILIAS war auf diesem Gerät mit einem anderen Konto angemeldet. Studium Autopilot hat es abgemeldet und nichts daraus übernommen."), { art: "fremd", grund: "fremde-sitzung" });
    return Object.assign({}, q, { kurse: async () => { throw e; } });
  };
  const b = await x.m.jetztHolen({ manuell: true });
  assert.deepEqual([b.art, b.grund], ["fehler", "fremde-sitzung"]);
  assert.equal(x.t.pfade("Unterlagen/").length, 0, "nichts übernommen");
  assert.match(x.meldungen[x.meldungen.length - 1], /^ILIAS war auf diesem Gerät mit einem anderen Konto angemeldet\. .* Neuer Versuch in \d+ Min\.$/);
  fremd = false;
  const b2 = await x.m.jetztHolen({ manuell: true, weiter: true });
  assert.equal(b2.art, "ok", b2.fehler);
});

// Profilbild als Foto statt Buchstaben (sonst wie anderes-konto.html bzw. kurs.html)
const mitFoto = (n) => seite(n).replace(/<span class="il-avatar il-avatar-letter[^"]*"[^>]*>\s*<span class="abbreviation">[^<]*<\/span>\s*<\/span>/, '<span class="il-avatar il-avatar-picture il-avatar-size-large"><img src="./data/erfunden/usr_images/bild.jpg" alt="Profilbild"></span>');

test("iPhone/iPad ohne gemerktes Kürzel: vor dem Lesen abmelden und einmal mit Passwort anmelden; am PC nicht", async () => {
  // die Kekse des Geräts reichten (fremde Sitzung), nach dem Abmelden sendet die Anmeldung dein Passwort, nichts aus der ersten Seite, Kürzel gemerkt
  let z = umgebung({ mobil: true, seite: "anderes-konto" });
  let konto = kontoMit("");
  let n = 0;
  const erst = (zz) => async () => { zz.geholt.push("ANMELDEN"); n++; if (n === 2) zz.seite = "kurs"; return { ok: true, passwortGesendet: n > 1, konto: n > 1 ? "ab" : "" }; };
  let q = await z.Q.quelleAusNetz(zugang(konto), erst(z), { wiederverwenden: true });
  await q.kurse();
  const KURSE = "GET /ilias.php?baseClass=ilmembershipoverviewgui";
  assert.deepEqual(z.geholt, ["ANMELDEN", KURSE, "GET " + ABMELDEN].concat(AUS, ["ANMELDEN", KURSE]));
  assert.equal(konto.k, "ab");
  // auch die zweite Anmeldung ohne Passwort (das Abmelden wirkte nicht): einmal versucht, dann gilt die Sitzung
  z = umgebung({ mobil: true, seite: "anderes-konto" });
  konto = kontoMit("");
  q = await z.Q.quelleAusNetz(zugang(konto), anmeldung(z, false));
  await q.kurse(); await q.kurse();
  assert.deepEqual(z.geholt, ["ANMELDEN", KURSE, "GET " + ABMELDEN].concat(AUS, ["ANMELDEN", KURSE, KURSE]));
  assert.deepEqual(konto.gemerkt, []);
  // die erzwungene Anmeldung zählt nicht: eine abgelaufene Sitzung später darf sich noch einmal anmelden
  let abgelaufen = true;
  z.seite = () => (abgelaufen ? (abgelaufen = false, seite("anmeldung-ilias")) : seite("anderes-konto"));
  await q.kurse();
  assert.equal(z.geholt.filter((x) => x === "ANMELDEN").length, 3);
  // am PC (die Sitzung beginnt ohne Kekse) und mit Passwort angemeldet: kein Abmelden
  for (const [mobil, gesendet] of [[false, false], [true, true]]) {
    z = umgebung({ mobil, seite: "anderes-konto" });
    q = await z.Q.quelleAusNetz(zugang(kontoMit("")), anmeldung(z, gesendet, "xy"));
    await q.kurse();
    assert.deepEqual(z.geholt, ["ANMELDEN", KURSE], JSON.stringify([mobil, gesendet]));
  }
  // vor einem Download ebenso
  z = umgebung({ mobil: true, seite: "anderes-konto" });
  n = 0;
  q = await z.Q.quelleAusNetz(zugang(kontoMit("")), erst(z));
  await q.laden(DATEI);
  assert.deepEqual(z.geholt.slice(0, 2), ["ANMELDEN", "GET /ilias.php?baseClass=ilDashboardGUI&cmd=show"]);
  assert.equal(z.geholt.filter((x) => x === "ANMELDEN").length, 2);
  assert.equal(z.geholt[z.geholt.length - 1], "GET " + DATEI.url.replace(ILIAS, ""), "die Datei erst nach der Anmeldung mit Passwort");
});

test("Foto als Profilbild: zählt als eigenes Kürzel; Foto gegen Buchstaben und umgekehrt ist ein anderes Konto", async () => {
  // gemerkt sind Buchstaben, die Sitzung zeigt ein Foto
  let z = umgebung({ seite: () => mitFoto("anderes-konto") });
  let q = await z.Q.quelleAusNetz(zugang(kontoMit("ab")), anmeldung(z, false));
  await assert.rejects(q.kurse(), (e) => e.grund === "fremde-sitzung");
  // mit Passwort angemeldet und Foto: „#foto“ gemerkt; deine Sitzung danach gilt
  z = umgebung({ seite: () => mitFoto("kurs") });
  const konto = kontoMit("");
  q = await z.Q.quelleAusNetz(zugang(konto), anmeldung(z, true, "#foto"));
  await q.kurse();
  assert.equal(konto.k, "#foto");
  q = await z.Q.quelleAusNetz(zugang(konto), anmeldung(z, false));
  await q.kurse();
  // gemerkt ist das Foto, die Sitzung zeigt Buchstaben
  z = umgebung({ seite: "anderes-konto" });
  q = await z.Q.quelleAusNetz(zugang(kontoMit("#foto")), anmeldung(z, false));
  await assert.rejects(q.kurse(), (e) => e.grund === "fremde-sitzung");
});

test("Konto erst an einer Seite mit Metaleiste geprüft: ohne sie erst das Dashboard, bevor die Seite zurückkommt", async () => {
  const TEIL = "<html><body><div>Fenster ohne Metaleiste</div></body></html>";
  const KAL = ILIAS + "/ilias.php?baseClass=ilDashboardGUI&cmd=jumpToCalendar";
  // fremdes Dashboard: die Seite ohne Metaleiste kommt nicht zurück
  let z = umgebung({ seite: (u) => (u === KAL ? TEIL : seite("anderes-konto")) });
  let q = await z.Q.quelleAusNetz(zugang(kontoMit("ab")), anmeldung(z, false));
  await assert.rejects(q.kalenderAbo(), (e) => e.grund === "fremde-sitzung");
  assert.deepEqual(z.geholt.slice(0, 3), ["ANMELDEN", "GET /ilias.php?baseClass=ilDashboardGUI&cmd=jumpToCalendar", "GET /ilias.php?baseClass=ilDashboardGUI&cmd=show"]);
  // eigenes Dashboard: geprüft, danach keine zweite Prüfung
  z = umgebung({ seite: (u) => (u === KAL ? TEIL : seite("kurs")) });
  q = await z.Q.quelleAusNetz(zugang(kontoMit("ab")), anmeldung(z, false));
  await q.kurse();
  z.geholt.length = 0;
  await q.inhalt({ url: ILIAS + "/goto.php/fold/5" });
  assert.equal(z.geholt.filter((x) => /cmd=show$/.test(x)).length, 0);
  // eine Seite ohne Metaleiste verbraucht die Prüfung nicht: die nächste mit Metaleiste prüft
  z = umgebung({ seite: (u) => (u === KAL ? TEIL : seite("anderes-konto")) });
  q = await z.Q.quelleAusNetz(zugang(kontoMit("")), anmeldung(z, false));
  await q.kalenderAbo().catch(() => {});
  await q.kurse();
});

test("Größe vor dem Download erst nach der Prüfung des Kontos; fremd → keine Anfrage nach der Größe", async () => {
  let z = umgebung({ seite: "anderes-konto" });
  let q = await z.Q.quelleAusNetz(zugang(kontoMit("ab")), anmeldung(z, false));
  await assert.rejects(q.groesse(DATEI), (e) => e.grund === "fremde-sitzung");
  assert.ok(!z.geholt.some((x) => /^HEAD/.test(x)), "kein HEAD");
  await assert.rejects(q.groesse(DATEI), (e) => e.grund === "fremde-sitzung");
  z = umgebung();
  q = await z.Q.quelleAusNetz(zugang(kontoMit("ab")), anmeldung(z, false));
  assert.equal(await q.groesse(DATEI), 4);
  assert.deepEqual(z.geholt, ["ANMELDEN", "GET /ilias.php?baseClass=ilDashboardGUI&cmd=show", "HEAD " + DATEI.url.replace(ILIAS, "")]);
  // im Lauf: eine fremde Sitzung bei der Größenfrage beendet den Lauf, statt sie zu übergehen
  const x = aufbau({ mobil: true });
  await x.m.zugangSpeichern("zxabc01", () => GEHEIM);
  const quelle = x.abh.quelle;
  x.abh.quelle = async (zz, anmelden, o) => {
    const q2 = await quelle(zz, anmelden, o);
    return Object.assign({}, q2, { groesse: async () => { throw Object.assign(new Error("fremd"), { art: "fremd", grund: "fremde-sitzung" }); } });
  };
  x.il.def.seiten[x.il.def.kurse[0].url][0].groesse = null;
  const b = await x.m.jetztHolen({});
  assert.deepEqual([b.art, b.grund], ["fehler", "fremde-sitzung"]);
  assert.ok(x.il.geladen().indexOf("1001") < 0, "die Datei ohne Größe wird nicht geladen");
});
