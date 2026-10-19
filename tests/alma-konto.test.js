// Noten & Anmeldungen (alma-konto.js): ganzer Ablauf mit einem erfundenen Alma (Seiten aus tests/daten/alma-konto/, alle Werte
// erfunden), am PC (eigene Weiterleitungen und Kekse über ilias-netz.js) und wie auf iPhone/iPad (requestUrlWieIOS: folgt selbst,
// eigene Keksdose, keine End-URL). Uni-Zugang, Zeitplan (geprueft/stand), Sperre, Grabstein, Konfliktkopien, Beta-Schranke,
// Vorschläge, Erinnerung an die Prüfungsanmeldung, Datenschutz-Spione. Kein Netz. Läuft ohne Obsidian.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const test = require("node:test");
const assert = require("node:assert/strict");
const { laden, json } = require("./laden.js");
const { uhr, tresor, dec } = require("./ilias-attrappen.js");

const SKRIPTE = path.join(__dirname, "..", "Studium Autopilot", "System", "Skripte");
const K = require(path.join(SKRIPTE, "alma-konto.js"));
const S = require(path.join(SKRIPTE, "sperre.js"));
const H = require(path.join(SKRIPTE, "ilias-html.js"));
const A = require(path.join(SKRIPTE, "alma-konto-html.js")).erzeugen(H);
const N = laden("ilias-netz").ergebnis;

const GEHEIM = "Kw-Alma/9 ü&x";
const BENUTZER = "zxabc01";
const CODES = ["B110", "B180", "S100", "SQ100", "E101"];
const MIN = 60e3, STUNDE = 60 * MIN;
const START_PFAD = "/alma/pages/cs/sys/portal/hisinoneStartPage.faces";
const seite = (n) => fs.readFileSync(path.join(__dirname, "daten", "alma-konto", n + ".html"), "utf8");

// ---------- Erfundenes Alma: eine Antwort je Schritt (Weiterleitungen folgt der Aufrufer) ----------
function almaServer(o) {
  o = Object.assign({ benutzer: BENUTZER, geheim: GEHEIM, leistungen: "leistungen-leer", belegungen: "belegungen-leer" }, o || {});
  const s = { o, log: [], sitzungen: new Map(), nr: 1 };
  s.antwort = ({ url, methode, body, kekse }) => {
    s.log.push({ url, methode, body: body == null ? "" : String(body) });
    const u = new URL(url);
    if (u.hostname !== "alma.uni-tuebingen.de") return { status: 200, kopf: { "content-type": "text/html" }, text: "<html><body>fremd</body></html>" };
    const m = /JSESSIONID=([^;\s]+)/.exec(kekse || "");
    let id = m && s.sitzungen.has(m[1]) ? m[1] : null, neu = null;
    if (!id) { id = "S" + s.nr++; s.sitzungen.set(id, { an: !!o.schonAn }); neu = "JSESSIONID=" + id + "; Path=/alma; Secure; HttpOnly"; }
    const z = s.sitzungen.get(id);
    const mit = (r) => { r.kopf = r.kopf || {}; if (neu) r.kopf["set-cookie"] = [neu]; return r; };
    const ok = (n) => mit({ status: 200, kopf: { "content-type": "text/html;charset=UTF-8" }, text: seite(n) });
    const weiter = (ort, status) => mit({ status: status || 302, kopf: { location: ort } });
    const p = u.pathname, q = u.search;
    if (o.stoerung) { const r = o.stoerung({ methode, p, q, z, s }); if (r) return mit(r); }
    if (p === START_PFAD) { const f = z.fehler; z.fehler = false; return ok(z.an ? "nach-anmeldung" : f ? "anmeldung-fehler" : "start-anonym"); }
    if (p === "/alma/rds" && /category=auth\.login/.test(q) && methode === "POST") {
      const f = new URLSearchParams(String(body || ""));
      // Erfolg: neue Sitzung (neuer Keks auf der Weiterleitung, wie üblich gegen Session Fixation)
      if (f.get("asdf") === o.benutzer && f.get("fdsa") === o.geheim && f.get("ajax-token")) {
        s.sitzungen.delete(id);
        const nid = "S" + s.nr++;
        s.sitzungen.set(nid, { an: true });
        return { status: 302, kopf: { location: "/alma/rds", "set-cookie": ["JSESSIONID=" + nid + "; Path=/alma; Secure; HttpOnly"] } };
      }
      z.fehler = true;
      return weiter(START_PFAD);
    }
    if (p === "/alma/rds" && /category=auth\.logout/.test(q)) { z.an = false; return weiter(START_PFAD); }
    if (p === "/alma/rds") return weiter(START_PFAD);
    const flow = (name, aufgeklappt) => {
      if (!z.an) return ok("start-anonym");
      if (methode === "POST") { s.aufgeklappt = (s.aufgeklappt || 0) + 1; return ok(aufgeklappt); }
      if (!/_flowExecutionKey/.test(q)) return weiter(p + q + "&_flowExecutionKey=e1s1");
      return ok(name);
    };
    if (p === "/alma/pages/sul/examAssessment/personExamsReadonly.xhtml") return flow(o.leistungen, o.aufgeklappt || "leistungen-voll");
    if (p === "/alma/pages/cm/exa/enrollment/info/start.xhtml") return flow(o.belegungen);
    if (p === "/alma/pages/plan/individualTimetable.xhtml") return flow(o.stundenplan || "stundenplan");
    return { status: 404, kopf: {}, text: "" };
  };
  s.posts = () => s.log.filter((x) => x.methode === "POST" && /auth\.login/.test(x.url)).length;
  s.abmeldungen = () => s.log.filter((x) => /category=auth\.logout/.test(x.url)).length;
  return s;
}
// PC: ilias-netz.js folgt selbst und verwaltet die Kekse; der Transport liefert je Schritt die Antwort
// zeiten: Start jeder Anfrage des Aufrufers (Weiterleitungen gehören zu ihrer Anfrage)
function pcTransport(server, u) {
  let umleitung = false;
  const t = async (a) => {
    if (!umleitung) t.zeiten.push(u.t);
    const r = server.antwort({ url: a.url, methode: a.methode, body: a.body, kekse: a.kopf && a.kopf.cookie });
    umleitung = [301, 302, 303, 307, 308].indexOf(r.status) >= 0;
    return r;
  };
  t.zeiten = [];
  return t;
}
// Wie requestUrl auf iOS: folgt 301/302/303 (GET) und 307/308 (mit Body) selbst, eigene Keksdose je Host, keine End-URL.
// kekseVerlieren: Kekse aus Zwischen-Weiterleitungen gehen verloren (wie Electron).
function requestUrlWieIOS(server, u, o) {
  const dose = new Map();
  const f = async (p) => {
    f.zeiten.push(u.t);
    let url = p.url, methode = p.method || "GET", body = p.body;
    for (let i = 0; i < 12; i++) {
      const host = new URL(url).hostname;
      const r = server.antwort({ url, methode, body, kekse: dose.get(host) || "" });
      const umleitung = [301, 302, 303, 307, 308].indexOf(r.status) >= 0 && r.kopf.location;
      if (r.kopf["set-cookie"] && !(umleitung && o && o.kekseVerlieren)) dose.set(host, r.kopf["set-cookie"].map((k) => k.split(";")[0]).join("; "));
      if (!umleitung) return { status: r.status, headers: r.kopf, text: r.text || "" };
      if (r.status !== 307 && r.status !== 308) { methode = "GET"; body = undefined; }
      url = new URL(r.kopf.location, url).href;
    }
    throw new Error("zu viele Weiterleitungen");
  };
  f.zeiten = [];
  return f;
}

// gerätelokaler Speicher wie app.saveLocalStorage
function lokalSpeicher() {
  const m = new Map();
  return { m, lokal: (k, v) => { if (v === undefined) return m.has(k) ? JSON.parse(m.get(k)) : null; if (v == null) m.delete(k); else m.set(k, JSON.stringify(v)); return v; },
    alles: () => Array.from(m.entries()).map((e) => e.join("=")).join("\n") };
}

// Ein Gerät mit Tresor, Alma, Uhr. o: { server, tresor, mobil, kekseVerlieren, geraet, beta, extern, phase, zugang, start }
function geraet(o) {
  o = o || {};
  const u = o.uhr || uhr(o.start || "2026-12-08T07:00:00.000Z");
  const t = o.tresor || tresor({});
  t.io.liste = (ordner) => t.pfade(ordner + "/").map((p) => p.slice(ordner.length + 1)).filter((n) => n.indexOf("/") < 0);
  const server = o.server || almaServer();
  const lok = lokalSpeicher();
  const meldungen = [], marker = [];
  const zugang = Object.assign({ benutzer: BENUTZER, gesperrt: false, bestaetigt: true }, o.zugang);
  const transport = o.mobil ? N.transportMobil({ requestUrl: requestUrlWieIOS(server, u, { kekseVerlieren: o.kekseVerlieren }) }) : pcTransport(server, u);
  const abh = {
    io: t.io, lokal: lok.lokal, sperre: S, zugang: () => zugang, kennwort: () => GEHEIM, abgelehnt: async (d) => { marker.push(d); },
    quelleExtern: (q) => q === "alma-konto" && !!o.extern, beta: () => o.beta !== false, phase: () => !!o.phase, netz: () => N, html: () => A, codes: () => CODES,
    jetzt: u.jetzt, warten: u.warten, mobil: !!o.mobil, geraetId: () => o.geraet || "g-ich", transport,
    melden: (x) => meldungen.push(x), geaendert: () => {},
  };
  const m = K.erzeugen(abh);
  return { m, t, u, server, lok, meldungen, marker, zugang, abh, transport };
}
const zustand = (g) => JSON.parse(g.t.text(K.K.STAND));
const einschalten = async (g) => { const b = await g.m.einschalten(); return b; };

// ---------- Ablauf ----------

test("Einschalten: leer/leer am PC; Passwort nur im POST an Alma; Abmelden mit type=4; geprueft und stand gesetzt", async () => {
  const g = geraet();
  const b = await einschalten(g);
  assert.equal(b.art, "ok", JSON.stringify(b));
  const z = zustand(g);
  assert.deepEqual([z.leistungen.art, z.belegungen.art, z.belegungen.semester], ["leer", "leer", "WS 2026/27"]);
  assert.equal(z.geprueft, "2026-12-08T07:00:00.000Z".replace("07:00:00", z.geprueft.slice(11, 19)));
  assert.equal(z.stand, z.geprueft);
  assert.equal(g.server.posts(), 1);
  assert.equal(g.server.abmeldungen(), 1);
  assert.ok(g.server.log.some((x) => /type=4&category=auth\.logout/.test(x.url)));
  const mitGeheim = g.server.log.filter((x) => x.body.indexOf(encodeURIComponent(GEHEIM).replace(/%20/g, "+")) >= 0 || x.body.indexOf(GEHEIM) >= 0);
  assert.deepEqual(mitGeheim.map((x) => [x.methode, new URL(x.url).hostname, new URL(x.url).pathname]), [["POST", "alma.uni-tuebingen.de", "/alma/rds"]]);
  const post = new URLSearchParams(g.server.log.filter((x) => x.methode === "POST")[0].body);
  assert.deepEqual(Array.from(post.keys()), ["userInfo", "ajax-token", "asdf", "fdsa", "submit"]);
  assert.deepEqual(g.meldungen, ["Alma geprüft, nichts Neues."]);
});

test("Voll: Module mit Status und Note, Belegungen je Code; Vorschlag fürs Modulfeld", async () => {
  const g = geraet({ server: almaServer({ leistungen: "leistungen-voll", belegungen: "belegungen-voll" }) });
  assert.equal((await einschalten(g)).art, "ok");
  const z = zustand(g);
  assert.deepEqual(z.leistungen.module.B110, { status: "bestanden", note: "1,7", unbenotet: false, versuch: 1, semester: "WS 2026/27", datum: "2027-02-12",
    eindeutig: true, stati: [{ status: "bestanden", semester: "WS 2026/27" }] });
  assert.deepEqual(z.belegungen.pruefungen, { B110: { status: "angemeldet" }, S100: { status: "zurückgetreten" }, B180: { status: "zugelassen" } });
  assert.match(g.meldungen[0], /^Alma geprüft, 5 neue Angaben auf deinen Modulseiten\.$/);
  const v = g.m.vorschlag({ code: "B110", status: "offen", ergebnis: null, versuch: null });
  assert.deepEqual(v.felder, { status: "bestanden", ergebnis: "1,7" });
  assert.equal(v.text, "Alma: bestanden · 1,7 · Stand 12.02.");
  // Nichts im Zustand außer Codes, Status, Noten, Versuch, Semester, Datum
  const roh = g.t.text(K.K.STAND);
  for (const x of ["Musterfrau", "Mustermann", "Erika", "7654321", "Einführung", "Freiversuch", "Klausur", "Parallelgruppe", BENUTZER]) assert.ok(roh.indexOf(x) < 0, x);
});

test("iPhone/iPad (requestUrl folgt selbst, keine End-URL): derselbe Ablauf, Abmelden inklusive", async () => {
  const g = geraet({ mobil: true, server: almaServer({ leistungen: "leistungen-voll", belegungen: "belegungen-voll" }) });
  const b = await einschalten(g);
  assert.equal(b.art, "ok");
  assert.equal(zustand(g).leistungen.art, "ok");
  assert.equal(g.server.posts(), 1);
  assert.equal(g.server.abmeldungen(), 1);
});

test("Schon angemeldet (iOS hat den letzten Lauf vor dem Abmelden beendet): keine zweite Anmeldung", async () => {
  const g = geraet({ server: almaServer({ schonAn: true }) });
  assert.equal((await einschalten(g)).art, "ok");
  assert.equal(g.server.posts(), 0);
  assert.equal(g.server.abmeldungen(), 1);
  assert.equal(g.m.lstand().versuch, "", "ohne POST kein Versuch");
});

test("Drossel: eine Anfrage zugleich, Starts mindestens 2 s auseinander (eine Anfrage hält ihren Platz samt Weiterleitungen)", async () => {
  const g = geraet();
  await einschalten(g);
  const z = g.transport.zeiten;
  assert.equal(z.length, 5, "Start, Anmeldung, Leistungen, Belegungen, Abmelden");
  for (let i = 1; i < z.length; i++) assert.ok(z[i] - z[i - 1] >= 2000, `Schritt ${i}: ${z[i] - z[i - 1]} ms`);
});

// ---------- Stundenplan-Link (Uni-Login) ----------
const ALMA_LINK = "https://alma.uni-tuebingen.de:443/alma/pages/cm/exa/timetable/individualTimetableCalendarExport.faces"
  + "?user=00000000-0000-4000-8000-00000000e1a7&hash=0123456789abcdef0123456789abcdef&termgroup=";

test("Stundenplan-Link: anmelden, Seite „Stundenplan“ lesen, abmelden; ohne Beta und Einschalten; Noten & Anmeldungen unberührt", async () => {
  const g = geraet({ beta: false });
  assert.deepEqual(await g.m.stundenplanLink(), { art: "ok", link: ALMA_LINK });
  assert.deepEqual(g.server.log.map((x) => [x.methode, new URL(x.url).pathname]).filter((x) => x[1] !== "/alma/rds" || x[0] === "POST").map((x) => x.join(" ")),
    ["GET " + START_PFAD, "POST /alma/rds", "GET " + START_PFAD, "GET /alma/pages/plan/individualTimetable.xhtml", "GET /alma/pages/plan/individualTimetable.xhtml", "GET " + START_PFAD]);
  assert.equal(g.server.posts(), 1);
  assert.equal(g.server.abmeldungen(), 1);
  // Das Passwort nur im POST an /alma/rds; nichts wird an die Stundenplan-Seite geschickt („Sicherheitsmaßnahmen erneuern“)
  const mitGeheim = g.server.log.filter((x) => x.body.indexOf(encodeURIComponent(GEHEIM).replace(/%20/g, "+")) >= 0 || x.body.indexOf(GEHEIM) >= 0);
  assert.deepEqual(mitGeheim.map((x) => [x.methode, new URL(x.url).pathname]), [["POST", "/alma/rds"]]);
  assert.ok(!g.server.log.some((x) => x.methode === "POST" && /individualTimetable/.test(x.url)));
  assert.deepEqual([g.m.lstand().versuch, g.m.lstand().letzter, g.t.text(K.K.STAND), g.m.an()], ["", "", null, ""]);
  assert.deepEqual(g.meldungen, []);
});

test("Stundenplan-Link auf iPhone/iPad (requestUrl folgt selbst, keine End-URL); schon angemeldet: kein POST", async () => {
  const g = geraet({ mobil: true });
  assert.deepEqual(await g.m.stundenplanLink(), { art: "ok", link: ALMA_LINK });
  assert.equal(g.server.abmeldungen(), 1);
  const h = geraet({ server: almaServer({ schonAn: true }) });
  assert.equal((await h.m.stundenplanLink()).art, "ok");
  assert.equal(h.server.posts(), 0);
});

test("Stundenplan-Link: abgelehnt → Marker; ohne Bestätigung durch ILIAS oder nach Ablehnung keine Anfrage; ohne Link → unerwartet", async () => {
  const g = geraet({ server: almaServer({ geheim: "anders" }) });
  assert.deepEqual(await g.m.stundenplanLink(), { art: "zugang-falsch", grund: "zugang-falsch" });
  assert.deepEqual(g.marker, ["alma"]);
  assert.equal(g.server.abmeldungen(), 0);
  for (const zugang of [{ bestaetigt: false }, { gesperrt: true }, { benutzer: "" }]) {
    const h = geraet({ zugang });
    assert.ok(["wartet-ilias", "abgelehnt", "ohne-zugang"].indexOf((await h.m.stundenplanLink()).art) >= 0);
    assert.equal(h.server.log.length, 0, JSON.stringify(zugang));
  }
  const i = geraet({ server: almaServer({ stundenplan: "nach-anmeldung" }) });
  assert.deepEqual(await i.m.stundenplanLink(), { art: "unerwartet", grund: "kein-link" });
  assert.equal(i.server.abmeldungen(), 1);
});

test("Stundenplan-Link und Lauf von Noten & Anmeldungen nie zugleich (eine Alma-Sitzung); nach einer Bremse keine Anmeldung", async () => {
  const g = geraet({ server: almaServer({ leistungen: "leistungen-voll", belegungen: "belegungen-voll" }) });
  await g.m.einschalten();
  g.u.vor(13 * STUNDE);
  const n = g.server.log.length;
  const [b, l] = await Promise.all([g.m.jetztPruefen({ manuell: true }), g.m.stundenplanLink()]);
  assert.equal(b.art, "ok", JSON.stringify(b));
  assert.equal(l.art, "ok");
  // Je Sitzung: Start … Abmelden; die zweite beginnt erst nach dem Abmelden der ersten
  const wege = g.server.log.slice(n).map((x) => (/auth\.logout/.test(x.url) ? "ab" : /auth\.login/.test(x.url) ? "an" : ""));
  const erstesAb = wege.indexOf("ab"), zweitesAn = wege.lastIndexOf("an");
  assert.ok(erstesAb >= 0 && zweitesAn > erstesAb, wege.join(","));
  assert.equal(g.server.abmeldungen(), 3);
  // Alma hat gebremst (Stopp für den Tag): der Link-Abruf meldet sich bis dahin nicht an
  const h = geraet({ server: almaServer({ stoerung: ({ p }) => (p === START_PFAD ? { status: 429, kopf: {}, text: "" } : null) }) });
  await h.m.einschalten();
  assert.equal(h.m.lstand().pauseBis > "", true);
  const vorher = h.server.log.length;
  assert.deepEqual(await h.m.stundenplanLink(), { art: "stopp", grund: "pause" });
  assert.equal(h.server.log.length, vorher);
});

test("Stundenplan-Link: zwei Aufrufe zugleich teilen einen Abruf", async () => {
  const g = geraet();
  const [a, b] = await Promise.all([g.m.stundenplanLink(), g.m.stundenplanLink()]);
  assert.deepEqual(a, b);
  assert.equal(g.server.posts(), 1);
  assert.equal((await g.m.stundenplanLink()).art, "ok");
  assert.equal(g.server.posts(), 2, "danach ein neuer Abruf");
});

// ---------- Uni-Zugang ----------

test("Abgelehnt (bekannte Meldung): Marker über ILIAS, kein zweiter Versuch, kein Abmelden, nichts geschrieben", async () => {
  const g = geraet({ server: almaServer({ geheim: "anders" }) });
  const b = await einschalten(g);
  assert.equal(b.art, "zugang-falsch");
  assert.deepEqual(g.marker, ["alma"]);
  assert.equal(g.server.posts(), 1);
  assert.equal(g.server.abmeldungen(), 0);
  assert.equal(g.t.text(K.K.STAND), null);
  assert.deepEqual(g.meldungen, ["Alma hat dein Passwort abgelehnt. Bitte deinen Uni-Login neu eingeben."]);
  // Der Marker kommt (über ILIAS) zurück: kein Versuch mehr, auch nicht per Knopf
  g.zugang.gesperrt = true; g.zugang.bestaetigt = false;
  g.u.vor(13 * STUNDE);
  assert.equal(g.m.faellig(), false);
  assert.equal((await g.m.jetztPruefen({ manuell: true })).art, "abgelehnt");
  assert.equal(g.server.posts(), 1);
  assert.equal(g.m.status().art, "abgelehnt");
});

test("Alma nie vor ILIAS: ohne Bestätigung des Passworts keine Anfrage; ohne Benutzername ebenso", async () => {
  const g = geraet({ zugang: { bestaetigt: false } });
  assert.deepEqual(await g.m.einschalten(), { art: "wartet-ilias" });
  assert.equal((await g.m.jetztPruefen({ manuell: true })).art, "wartet-ilias");
  assert.equal(g.server.log.length, 0);
  assert.equal(g.m.status().art, "wartet-ilias");
  const h = geraet({ zugang: { benutzer: "" } });
  assert.equal(h.m.status().art, "ohne-zugang");
  assert.equal((await h.m.jetztPruefen({ manuell: true })).art, "aus");
  assert.equal(h.server.log.length, 0);
});

test("Unklare Ablehnung, zweiter Faktor, Zustimmung: nur Alma auf diesem Gerät pausiert, kein Marker; Erneut versuchen geht", async () => {
  for (const [fall, stoerung, art] of [
    ["unklar", (x) => (x.methode === "POST" && x.p === "/alma/rds" ? { status: 200, kopf: {}, text: seite("start-anonym") } : null), "abgelehnt-unklar"],
    ["zwei-faktor", (x) => (x.methode === "POST" && x.p === "/alma/rds" ? { status: 200, kopf: {}, text: seite("zwei-faktor") } : null), "zwei-faktor"],
    ["zustimmung", (x) => (x.methode === "POST" && x.p === "/alma/rds" ? { status: 200, kopf: {}, text: seite("zustimmung") } : null), "zustimmung"],
  ]) {
    const g = geraet({ server: almaServer({ stoerung }) });
    assert.equal((await einschalten(g)).art, art, fall);
    assert.deepEqual(g.marker, [], fall);
    assert.equal(g.m.status().art, art, fall);
    g.u.vor(13 * STUNDE);
    assert.equal(g.m.faellig(), false, fall + ": automatisch nie wieder");
    g.server.o.stoerung = null;
    assert.equal((await g.m.jetztPruefen({ manuell: true })).art, "ok", fall + ": Erneut versuchen");
    assert.equal(g.m.status().art, "an", fall);
  }
});

test("Kekse aus Zwischen-Weiterleitungen verloren (wie Electron): endet ohne Marker und ohne zweiten Versuch", async () => {
  const g = geraet({ mobil: true, kekseVerlieren: true });
  const b = await einschalten(g);
  assert.ok(["abgelehnt-unklar", "unerwartet"].indexOf(b.art) >= 0, b.art);
  assert.deepEqual(g.marker, []);
  assert.equal(g.server.posts(), 1);
});

// ---------- Zeitplan (B1): fällig nach geprueft, Versuche je Fenster ----------

test("Zwei Läufe ohne Änderung im Abstand von 30 Min.: genau eine Anmeldung; nach 12 Std. geprueft neu, stand alt", async () => {
  const g = geraet();
  await einschalten(g);
  const z1 = zustand(g);
  g.u.vor(30 * MIN);
  assert.equal(g.m.faellig(), false);
  assert.equal((await g.m.jetztPruefen({})).art, "nicht-faellig");
  assert.equal(g.server.posts(), 1);
  g.u.vor(12 * STUNDE);
  assert.equal(g.m.faellig(), true);
  assert.equal((await g.m.jetztPruefen({})).art, "ok");
  const z2 = zustand(g);
  assert.equal(g.server.posts(), 2);
  assert.ok(z2.geprueft > z1.geprueft);
  assert.equal(z2.stand, z1.stand, "keine inhaltliche Änderung");
  assert.deepEqual(g.meldungen, ["Alma geprüft, nichts Neues."], "automatische Läufe ohne Hinweis");
});

test("Anmeldephase: alle 3 Std.; ein Versuch zählt, auch wenn er scheiterte; Fehler vor dem POST: neuer Blick nach 30 Min.", async () => {
  const g = geraet({ phase: true });
  await einschalten(g);
  g.u.vor(2 * STUNDE);
  assert.equal(g.m.faellig(), false);
  g.u.vor(61 * MIN);
  assert.equal(g.m.faellig(), true);
  // Server-Fehler nach dem POST: zählt als Versuch → wieder erst in 3 Std.
  g.server.o.stoerung = (x) => (x.p.indexOf("personExamsReadonly") >= 0 ? { status: 503, kopf: {}, text: "" } : null);
  assert.equal((await g.m.jetztPruefen({})).art, "server");
  assert.equal(g.server.abmeldungen(), 2, "Abmelden auch nach dem Fehler");
  g.u.vor(2 * STUNDE);
  assert.equal(g.m.faellig(), false);
  // kein Netz vor dem POST: nach 30 Min. wieder
  const h = geraet();
  await einschalten(h);
  h.u.vor(13 * STUNDE);
  h.server.o.stoerung = () => { throw Object.assign(new Error("offline"), { code: "ENOTFOUND" }); };
  assert.equal((await h.m.jetztPruefen({})).art, "netz");
  h.server.o.stoerung = null;
  h.u.vor(20 * MIN);
  assert.equal(h.m.faellig(), false);
  h.u.vor(11 * MIN);
  assert.equal(h.m.faellig(), true);
});

test("Stopp für den Tag bei 429; drei unerwartete Antworten in Folge: 24 Std. Pause; Knopf frühestens nach 2 Min.", async () => {
  const g = geraet({ server: almaServer({ stoerung: (x) => (x.p === START_PFAD ? { status: 429, kopf: {}, text: "" } : null) }) });
  assert.equal((await einschalten(g)).art, "stopp");
  assert.equal(g.m.status().art, "pause");
  g.u.vor(6 * STUNDE);
  g.server.o.stoerung = null;
  assert.equal(g.m.faellig(), false, "heute nicht mehr");
  g.u.vor(18 * STUNDE);
  assert.equal(g.m.faellig(), true, "am nächsten Tag wieder");
  const h = geraet({ server: almaServer({ stoerung: (x) => (x.p === START_PFAD ? { status: 200, kopf: {}, text: "<html></html>" } : null) }) });
  await einschalten(h);
  for (let i = 0; i < 2; i++) { h.u.vor(31 * MIN); await h.m.jetztPruefen({ manuell: true }); }
  assert.equal(h.m.status().art, "unerwartet");
  h.u.vor(13 * STUNDE);
  assert.equal(h.m.faellig(), false, "24 Std. Pause");
  h.u.vor(12 * STUNDE);
  assert.equal(h.m.faellig(), true);
  assert.equal((await h.m.jetztPruefen({ manuell: true })).art, "unerwartet");
  assert.equal((await h.m.jetztPruefen({ manuell: true })).art, "zu-frueh");
});

// ---------- Leser im Ablauf ----------

test("Zugeklappt: genau ein Aufklappen; bleibt es zu, unsicher (alte Werte bleiben, geprueft nicht neu)", async () => {
  const g = geraet({ server: almaServer({ leistungen: "leistungen-zugeklappt", belegungen: "belegungen-voll" }) });
  assert.equal((await einschalten(g)).art, "ok");
  assert.equal(g.server.aufgeklappt, 1);
  assert.equal(zustand(g).leistungen.module.B110.note, "1,7");
  const vorher = zustand(g);
  g.server.o.aufgeklappt = "leistungen-zugeklappt";
  g.u.vor(13 * STUNDE);
  const b = await g.m.jetztPruefen({});
  assert.equal(b.art, "unsicher");
  assert.equal(b.grund, "leistungen-zugeklappt");
  assert.equal(g.server.aufgeklappt, 2);
  const z = zustand(g);
  assert.equal(z.leistungen.art, "unsicher");
  assert.deepEqual(z.leistungen.module, vorher.leistungen.module, "alte Werte bleiben");
  assert.equal(z.geprueft, vorher.geprueft);
  assert.equal(g.m.status().art, "unsicher");
  const aufbau = g.m.status().aufbau;
  assert.match(aufbau, /leistungen: zugeklappt/);
  for (const x of ["1,7", "B110", BENUTZER, "Musterfrau"]) assert.ok(aufbau.indexOf(x) < 0, x);
});

test("Unbekannter Hinweis statt Leerseite: unsicher, keine Erinnerung daraus", async () => {
  const g = geraet({ server: almaServer({ leistungen: "leistungen-unbekannter-hinweis" }) });
  assert.equal((await einschalten(g)).art, "unsicher");
  const z = zustand(g);
  assert.equal(z.leistungen.art, "unsicher");
  assert.equal(z.geprueft, "");
  const r = K.fehlendeAnmeldungen({ module: [{ code: "B110", status: "läuft", semester: "WS 2026/27", fm: {} }], termine: TERMINE, zustand: z,
    heute: "2026-12-08", jetzt: Date.parse("2026-12-08T08:00:00Z"), aktuell: { name: "WS 2026/27" } });
  assert.deepEqual(r, { art: "selbst" });
});

// ---------- Weiterleitungen (ehrlich: PC prüft jeden Sprung, iOS folgt selbst) ----------

test("Fremder Host im Formular: kein POST, kein Passwort hinaus", async () => {
  const andersAction = seite("start-anonym").split("https://alma.uni-tuebingen.de:443/alma/rds").join("https://alma.example.org/alma/rds");
  const g = geraet({ server: almaServer({ stoerung: (x) => (x.p === START_PFAD && !x.z.an ? { status: 200, kopf: {}, text: andersAction } : null) }) });
  const b = await einschalten(g);
  assert.equal(b.art, "unerwartet");
  assert.equal(b.grund, "formular");
  assert.equal(g.server.log.filter((x) => x.methode === "POST").length, 0);
  assert.ok(g.server.log.every((x) => x.body.indexOf("fdsa") < 0));
});

test("307 nach der Anmeldung auf einen fremden Host: PC blockiert den Sprung; iOS folgt selbst (festgehalten), endet unerwartet ohne Marker", async () => {
  const stoerung = (x) => (x.methode === "POST" && x.p === "/alma/rds" ? { status: 307, kopf: { location: "https://alma.example.org/stehlen" } } : null);
  const pc = geraet({ server: almaServer({ stoerung }) });
  const b = await einschalten(pc);
  assert.equal(b.art, "unerwartet");
  assert.equal(pc.server.log.filter((x) => new URL(x.url).hostname !== "alma.uni-tuebingen.de").length, 0, "PC: nichts an den fremden Host");
  const ios = geraet({ mobil: true, server: almaServer({ stoerung }) });
  const c = await einschalten(ios);
  assert.equal(c.art, "unerwartet");
  const fremd = ios.server.log.filter((x) => new URL(x.url).hostname !== "alma.uni-tuebingen.de");
  assert.equal(fremd.length, 1, "iOS: requestUrl schickt den POST samt Body weiter (Grenze, in docs/datenschutz.md benannt)");
  assert.equal(fremd[0].methode, "POST");
  assert.deepEqual(ios.marker, []);
});

// ---------- Ein Schreiber, Grabstein, Konfliktkopien ----------

test("Sperre: ein anderes Gerät war vor kurzem dran → keine Anfrage; Hier prüfen holt sie her", async () => {
  const t = tresor({});
  const a = geraet({ tresor: t, geraet: "g-a" });
  await einschalten(a);
  const b = geraet({ tresor: t, geraet: "g-b", uhr: a.u, server: almaServer() });
  b.lok.lokal(K.K.L.an, a.u.jetzt().toISOString());
  a.u.vor(13 * STUNDE);
  // a war vor 13 Std. dran (länger als 80 Min.): b darf
  assert.equal((await b.m.jetztPruefen({})).art, "ok");
  assert.equal(JSON.parse(t.text(K.K.ABRUF)).geraet, "g-b");
  // jetzt ist b frisch dran: a fragt nichts (auch nicht per Knopf ohne „hier“)
  a.u.vor(3 * MIN);
  assert.equal((await a.m.jetztPruefen({ manuell: true })).art, "anderes-geraet");
  assert.equal(a.server.posts(), 1);
  assert.equal(a.m.status().art, "anderes-geraet");
  assert.equal((await a.m.jetztPruefen({ manuell: true, hier: true })).art, "ok");
  assert.equal(JSON.parse(t.text(K.K.ABRUF)).geraet, "g-a");
});

test("Daten aus Alma löschen: Grabstein, Datei und Kopien endgültig weg; ein Gerät mit älterer Zustimmung schaltet sich aus", async () => {
  const t = tresor({});
  const a = geraet({ tresor: t, geraet: "g-a", server: almaServer({ leistungen: "leistungen-voll", belegungen: "belegungen-voll" }) });
  await einschalten(a);
  const b = geraet({ tresor: t, geraet: "g-b", uhr: a.u });
  b.lok.lokal(K.K.L.an, "2026-12-01T00:00:00.000Z");
  t.setzen("System/Daten/alma-konto 2.json", t.text(K.K.STAND));
  t.setzen("System/Daten/alma-konto (conflicted copy).json", t.text(K.K.STAND));
  a.u.vor(MIN);
  await a.m.loeschen();
  assert.deepEqual(t.pfade("System/Daten/").sort(), [K.K.ABRUF, K.K.AUS].sort());
  assert.equal(t.pfade(".trash").length, 0);
  assert.equal(a.m.an(), "");
  assert.deepEqual(Object.keys(JSON.parse(t.text(K.K.AUS))).sort(), ["geloescht", "geraet"]);
  // b: Zustimmung älter als der Grabstein → aus, sagt es; neue Zustimmung gilt wieder
  await b.m.lesen();
  assert.equal(b.m.an(), "");
  assert.equal(b.m.status().art, "aus-anderes-geraet");
  b.u.vor(MIN);
  assert.equal((await b.m.einschalten()).art, "ok");
  assert.equal(b.m.status().art, "an");
});

test("Konfliktkopien räumt jeder Lauf weg; unlesbare alma-konto.json wird neu geschrieben", async () => {
  const t = tresor({ "System/Daten/alma-konto.json": "{ halb gesch", "System/Daten/alma-konto 2.json": "{}", "System/Daten/alma-konto-abruf 3.json": "{}" });
  const g = geraet({ tresor: t });
  assert.equal(g.m.vorschlag({ code: "B110" }), null);
  assert.equal((await einschalten(g)).art, "ok");
  assert.equal(zustand(g).version, 1);
  assert.deepEqual(t.pfade("System/Daten/").sort(), [K.K.STAND, K.K.ABRUF].sort());
});

// ---------- Beta-Schranke und eigener Abgleich ----------

test("Ohne Beta: keine Anfrage; ohne Zustimmung und Daten keine Zeile, sonst Zeile mit Löschen", async () => {
  const g = geraet({ beta: false });
  assert.equal(g.m.status().art, "unsichtbar");
  assert.equal(g.m.sichtbar(), false);
  assert.equal((await g.m.jetztPruefen({ manuell: true })).art, "beta-aus");
  assert.equal(g.server.log.length, 0);
  g.lok.lokal(K.K.L.an, "2026-12-01T00:00:00.000Z");
  assert.equal(g.m.status().art, "beta-aus");
  assert.equal(g.m.faellig(), false);
  assert.equal(K.K.ALMA_KONTO_STABIL, false, "erst nach dem Abgleich mit echten Seiten, in einem eigenen Commit");
});

test("Eigener Abgleich (quellen_extern alma-konto): keine Anfrage, keine Vorschläge", async () => {
  const g = geraet({ extern: true });
  g.lok.lokal(K.K.L.an, "2026-12-01T00:00:00.000Z");
  assert.equal((await g.m.jetztPruefen({ manuell: true })).art, "extern");
  assert.equal(g.server.log.length, 0);
  assert.equal(g.m.status().art, "extern");
});

// ---------- Vorschläge und Erinnerung ----------

const Z = (module, pruefungen, mehr) => Object.assign({ version: 1, geprueft: "2026-12-08T07:00:00.000Z", stand: "2026-12-08T07:00:00.000Z", geraet: "g",
  leistungen: { art: "ok", module: module || {} }, belegungen: { art: "ok", semester: "WS 2026/27", pruefungen: pruefungen || {}, unzugeordnet: 0 } }, mehr || {});
const M = (status, note, versuch, mehr) => Object.assign({ status, note: note || "", unbenotet: false, versuch: versuch || 1, semester: "WS 2026/27", datum: "2027-02-12", eindeutig: true, stati: [{ status, semester: "WS 2026/27" }] }, mehr || {});

test("Vorschläge: nur Abweichungen, nur eindeutige; endgültig mit Satz; ausgeblendet per Prüfsumme (keine lesbare Note)", () => {
  const v = K.vorschlagAus;
  assert.deepEqual(v({ code: "B110", status: "offen" }, Z({ B110: M("bestanden", "1,7") })).felder, { status: "bestanden", ergebnis: "1,7" });
  assert.equal(v({ code: "B110", status: "bestanden", ergebnis: "1.7" }, Z({ B110: M("bestanden", "1,7") })), null, "steht schon so da");
  assert.deepEqual(v({ code: "B110", status: "bestanden", ergebnis: "2,0" }, Z({ B110: M("bestanden", "1,7") })).felder, { ergebnis: "1,7" });
  assert.deepEqual(v({ code: "S100", status: "läuft" }, Z({ S100: M("nicht bestanden", "5,0", 2) })).felder, { status: "nicht bestanden", ergebnis: "5,0", versuch: 2 });
  const e = v({ code: "E101", status: "nicht bestanden", ergebnis: "5,0", versuch: 2 }, Z({ E101: M("endgültig nicht bestanden", "5,0", 3) }));
  assert.deepEqual(e.felder, { versuch: 3 });
  assert.match(e.satz, /Prüfungsamt/);
  assert.equal(e.text, "Alma: endgültig nicht bestanden · 5,0 · 3. Versuch · Stand 12.02.");
  assert.equal(v({ code: "B110", status: "offen" }, Z({ B110: M("bestanden", "1,7", 1, { eindeutig: false }) })), null, "nicht eindeutig");
  assert.deepEqual(v({ code: "B180", status: "offen" }, Z({}, { B180: { status: "zugelassen" } })).felder, { status: "angemeldet" });
  assert.equal(v({ code: "B180", status: "bestanden" }, Z({}, { B180: { status: "angemeldet" } })), null, "angemeldet nur bei offen/läuft");
  assert.deepEqual(v({ code: "SQ100", status: "offen" }, Z({ SQ100: M("anerkannt", "", 1, { unbenotet: true }) })).felder, { status: "anerkannt" });
  const s = v({ code: "B110", status: "offen" }, Z({ B110: M("bestanden", "1,7") }));
  assert.match(s.schluessel, /^[0-9a-f]{8}$/);
  assert.notEqual(s.schluessel.indexOf("1,7"), 0);
  assert.equal(v({ code: "B110", status: "offen", alma_ausgeblendet: [s.schluessel] }, Z({ B110: M("bestanden", "1,7") })), null);
  assert.ok(v({ code: "B110", status: "offen", alma_ausgeblendet: [s.schluessel] }, Z({ B110: M("bestanden", "2,3") })), "neue Note: neuer Vorschlag");
});

test("sha256 (synchron) stimmt mit node:crypto überein", () => {
  for (const x of ["", "abc", "B110|bestanden|1,7|1", "ü€😀".repeat(40), "x".repeat(1000)]) {
    assert.equal(K.sha256(x), crypto.createHash("sha256").update(x, "utf8").digest("hex"), x.slice(0, 10));
  }
});

const TERMINE = [
  { fm: { titel: "Prüfungsanmeldung Haupttermin WS 2026/27", kategorie: "Frist", datum: "2026-12-07", bis: "2027-01-18" } },
  { fm: { titel: "Prüfungsanmeldung Nachholtermin WS 2026/27", kategorie: "Frist", datum: "2027-03-08", bis: "2027-03-22" } },
  { fm: { titel: "Klausur B110", code: "B110", kategorie: "Prüfung", datum: "2027-02-12" } },
  { fm: { titel: "Klausur S100", code: "S100", kategorie: "Prüfung", datum: "2027-02-15" } },
  { fm: { titel: "Zwischentest B180", code: "B180", kategorie: "Prüfung", datum: "2026-12-20" } },
  { fm: { titel: "Klausur E101", code: "E101", kategorie: "Prüfung", datum: "2027-02-20" } },
];
// Prüfung eines Moduls aus dem Fachmodell (ctx.modell.pruefungVon) über dieselben Termine und Module wie in der Erinnerung
const pruefungVonAus = (heute, module, termine) => {
  const notizen = {};
  for (const m of module) notizen["Module/" + m.code + ".md"] = Object.assign({ typ: "modul", code: m.code, titel: m.code, ects: 6, status: m.status }, m.fm);
  termine.forEach((t, i) => { notizen["Termine/" + i + " " + t.fm.titel + ".md"] = Object.assign({ typ: "termin" }, t.fm); });
  const M = laden("modell", { heute, notizen, frontmatter: { "System/Daten/Semester.md": json("semester.json"), "System/Einstellungen.md": {} } }).ctx.modell;
  return (code) => M.pruefungVon(code, { heute });
};
test("Erinnerung an die Prüfungsanmeldung: Wahrheitstabelle (nur fehlende, nie „alles angemeldet“)", () => {
  const sem = { name: "WS 2026/27" };
  const module = [
    { code: "B110", status: "läuft", semester: "WS 2026/27", fm: {} },
    { code: "S100", status: "offen", semester: "WS 2026/27", fm: {} },
    { code: "B180", status: "läuft", semester: "WS 2026/27", fm: {} },
    { code: "E101", status: "bestanden", semester: "WS 2026/27", fm: {} },
    { code: "B220", status: "offen", semester: "SS 2027", fm: {} },
  ];
  const f = (z, heute, mehr) => K.fehlendeAnmeldungen(Object.assign({ module, termine: TERMINE, zustand: z, heute: heute || "2026-12-08", jetzt: Date.parse("2026-12-08T09:00:00Z"), aktuell: sem,
    pruefungVon: pruefungVonAus(heute || "2026-12-08", (mehr && mehr.module) || module, TERMINE) }, mehr || {}));
  assert.equal(f(Z(), "2026-12-01"), null, "Fenster noch zu");
  assert.equal(f(Z(), "2027-03-10"), null, "Nachholtermin zählt nicht");
  assert.deepEqual(f(Z()), { art: "fehlt", codes: ["B110", "S100"], stand: "2026-12-08T07:00:00.000Z" }, "B180 ohne Klausur (nur Zwischentest), E101 bestanden, B220 nicht dieses Semester");
  assert.deepEqual(f(Z({}, { B110: { status: "angemeldet" } })).codes, ["S100"]);
  assert.deepEqual(f(Z({}, { B110: { status: "zurückgetreten" } })).codes, ["B110", "S100"], "zurückgetreten zählt nicht");
  assert.deepEqual(f(Z({ S100: M("angemeldet", "", 2, { stati: [{ status: "angemeldet", semester: "" }] }) }, { B110: { status: "zugelassen" } })), null, "alle angemeldet: nichts (kein grünes Häkchen)");
  assert.deepEqual(f(Z({ S100: M("nicht bestanden", "5,0", 1, { stati: [{ status: "nicht bestanden", semester: "SS 2026" }] }) }, { B110: { status: "angemeldet" } })).codes, ["S100"], "altes Semester zählt nicht");
  assert.deepEqual(f(Z(), "2026-12-08", { module: module.map((m) => (m.code === "S100" ? Object.assign({}, m, { fm: { anmeldung_verzicht: "WS 2026/27" } }) : m)) }).codes, ["B110"], "bewusst nicht anmelden");
  // Nr. 2 trifft nicht zu → nur „selbst prüfen“
  assert.deepEqual(f(Z({}, {}, { geprueft: "2026-12-07T06:00:00.000Z" })), { art: "selbst" }, "älter als 26 Std.");
  assert.deepEqual(f(Z({}, {}, { belegungen: { art: "ok", semester: "SS 2026", pruefungen: {}, unzugeordnet: 0 } })), { art: "selbst" }, "anderes Semester");
  assert.deepEqual(f(Z({}, {}, { belegungen: { art: "unsicher", semester: "WS 2026/27", pruefungen: {}, unzugeordnet: 0 } })), { art: "selbst" });
  assert.deepEqual(f(Z({}, {}, { belegungen: { art: "ok", semester: "WS 2026/27", pruefungen: {}, unzugeordnet: 1 } })), { art: "selbst" }, "unzugeordnete Anmeldung");
  assert.deepEqual(f(null), { art: "selbst" });
});

test("Erinnerung: welche Prüfung zählt, sagt das Fachmodell (pruefungVon), keine eigene Regel", () => {
  const sem = { name: "WS 2026/27" };
  const Z0 = Z();
  const termine = [
    TERMINE[0],
    { fm: { titel: "Klausur B110", code: "B110", kategorie: "Prüfung", datum: "2027-02-12", entfaellt: true } },
    { fm: { titel: "Klausur S100", code: "S100", kategorie: "Prüfung", datum: "2027-02-15", erledigt: true } },
    { fm: { titel: "Nachholklausur B130", code: "B130", kategorie: "Prüfung", datum: "2027-01-20" } },
    { fm: { titel: "Nachholklausur B140", code: "B140", kategorie: "Prüfung", datum: "2027-01-22" } },
  ];
  const module = [
    { code: "B110", status: "läuft", semester: "WS 2026/27", fm: {} },
    { code: "S100", status: "läuft", semester: "WS 2026/27", fm: {} },
    { code: "B130", status: "nicht bestanden", semester: "WS 2026/27", fm: {} },
    { code: "B140", status: "läuft", semester: "WS 2026/27", fm: {} },
    { code: "B150", status: "läuft", semester: "WS 2026/27", fm: { klausur: "2027-02-01" } },
  ];
  const r = K.fehlendeAnmeldungen({ module, termine, zustand: Z0, heute: "2026-12-08", jetzt: Date.parse("2026-12-08T09:00:00Z"), aktuell: sem,
    pruefungVon: pruefungVonAus("2026-12-08", module, termine) });
  assert.deepEqual(r.codes, ["B130", "B150"], "entfallen und abgehakt zählen nicht; Nachholtermin nur nach „nicht bestanden“; Modulfeld klausur");
  assert.deepEqual(K.fehlendeAnmeldungen({ module, termine, zustand: Z0, heute: "2026-12-08", jetzt: Date.parse("2026-12-08T09:00:00Z"), aktuell: sem }), null,
    "ohne Fachmodell keine Prüfung, also keine Erinnerung");
});

// ---------- Datenschutz-Spione ----------

test("Datenschutz: Passwort nirgends; Noten nur in alma-konto.json (nie in Hinweisen, Konsole, Protokoll, gerätelokal)", async () => {
  const konsole = [];
  const alt = { warn: console.warn, log: console.log, error: console.error, info: console.info };
  for (const k of Object.keys(alt)) console[k] = (...a) => konsole.push(a.map(String).join(" "));
  try {
    const g = geraet({ server: almaServer({ leistungen: "leistungen-voll", belegungen: "belegungen-voll" }) });
    await einschalten(g);
    g.u.vor(13 * STUNDE);
    g.server.o.stoerung = (x) => (x.p.indexOf("start.xhtml") >= 0 ? { status: 500, kopf: {}, text: "Fehler 1,7 " + GEHEIM } : null);
    await g.m.jetztPruefen({ manuell: true });
    g.u.vor(13 * STUNDE);
    g.server.o.geheim = "anders";
    g.server.sitzungen.clear();
    await g.m.jetztPruefen({ manuell: true });
    const ausserhalb = [g.meldungen.join("\n"), konsole.join("\n"), g.lok.alles(), JSON.stringify(g.m.protokoll()), JSON.stringify(g.m.status())].join("\n");
    for (const x of [GEHEIM, encodeURIComponent(GEHEIM), "1,7", "5,0", "Musterfrau", "7654321"]) assert.ok(ausserhalb.indexOf(x) < 0, x + "\n" + ausserhalb);
    const tresorText = g.t.alles();
    assert.ok(tresorText.indexOf(GEHEIM) < 0 && tresorText.indexOf(BENUTZER) < 0);
    for (const p of g.t.pfade("")) if (p !== K.K.STAND) assert.ok(dec(g.t.m.get(p)).indexOf("1,7") < 0, p);
  } finally { Object.assign(console, alt); }
});

test("Laden in Obsidian-Ersatz: kein Netz, keine Zeitgeber beim Laden; Aktion und ctx.almaKonto da", () => {
  let n = 0;
  const z = () => { n++; return 0; };
  const r = laden("alma-konto", { kontext: { zeit: z, intervall: z, obsidian: { Notice: class {}, requestUrl: async () => { n++; } } } });
  assert.equal(n, 0);
  assert.ok(r.ergebnis.aktionen["alma-konto-pruefen"]);
  assert.equal(!!r.ergebnis.aktionen["alma-konto-pruefen"].titel, K.K.ALMA_KONTO_STABIL, "Beta: kein Befehl in der Befehlsübersicht");
  assert.equal(typeof r.ctx.almaKonto.zeile, "function");
  assert.equal(r.ctx.almaKonto.zeile(), null, "ohne Beta, Zustimmung und Daten: keine Zeile");
});

test("Gemeinsame Statusform { zustand, geprueft, fehler, fehlerZeit, warnungen } ohne Noten; Sperre über den Quellen-Schlüssel", async () => {
  assert.equal(K.K.ABRUF, S.pfadVon("alma-konto"));
  const g = geraet({ server: almaServer({ leistungen: "leistungen-unbekannter-hinweis" }) });
  await einschalten(g);
  let s = g.m.status();
  assert.deepEqual([s.zustand, s.fehler, s.fehlerZeit], ["unsicher", "", ""]);
  assert.deepEqual(s.warnungen, ["Die Seite „Leistungen“ sah anders aus als erwartet."]);
  assert.equal(s.geprueft, "", "unsicher setzt geprueft nicht");
  const h = geraet({ server: almaServer({ stoerung: (x) => (x.methode === "POST" && x.p === "/alma/rds" ? { status: 200, kopf: {}, text: seite("zwei-faktor") } : null) }) });
  await einschalten(h);
  s = h.m.status();
  assert.equal(s.zustand, "zwei-faktor");
  assert.match(s.fehler, /zweiten Faktor/);
  assert.equal(s.fehlerZeit, h.u.jetzt().toISOString());
  const ok = geraet({ server: almaServer({ leistungen: "leistungen-voll", belegungen: "belegungen-voll" }) });
  await einschalten(ok);
  s = ok.m.status();
  assert.deepEqual([s.zustand, s.fehler, s.warnungen], ["an", "", []]);
  assert.ok(JSON.stringify(s).indexOf("1,7") < 0);
});
