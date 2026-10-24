// Postfach (postfach.js): Zustimmung je Gerät, Uni-Login nur bestätigt und nicht abgelehnt, Anmeldung mit dem Passwort nur im
// POST an das Webmail, Ablehnung schreibt den Marker (Dienst „mail“), abgelaufene Sitzung einmal neu, Zahl ungelesener Mails
// mit Seite 1 (fehlt sie, bleibt die Liste), Mail öffnen = gelesen,
// Abmelden nach Leerlauf und beim Ausschalten, anderer Uni-Login meldet ab und vergisst die Mails, Datum der Mails von heute bleibt
// nach Mitternacht richtig, nichts im Tresor. Webmail als Attrappe (tests/daten/postfach/). Ohne Obsidian.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const SKRIPTE = path.join(__dirname, "..", "Studium Autopilot", "System", "Skripte");
const H = require(path.join(SKRIPTE, "ilias-html.js"));
const P = require(path.join(SKRIPTE, "postfach-html.js")).erzeugen(H);
const { erzeugen } = require(path.join(SKRIPTE, "postfach.js"));
const seite = (name) => fs.readFileSync(path.join(__dirname, "daten", "postfach", name + ".html"), "utf8");
const W = "https://webmail.uni-tuebingen.de";

// Webmail-Attrappe: login.php (GET) → Formular; POST mit dem richtigen Passwort → Portal; Liste und Mail nur angemeldet
function webmail(o) {
  o = o || {};
  const w = { anfragen: [], angemeldet: false, posts: 0 };
  w.sitzung = () => ({
    anfrage: async (a) => {
      w.anfragen.push({ url: a.url, methode: a.methode || "GET", formular: a.formular ? a.formular.slice() : null });
      if (o.netz) { const e = new Error("Netzwerkfehler"); e.grund = "netz"; throw e; }
      const u = a.url.replace(W, "");
      if (u === "/login.php" && a.methode === "POST") {
        w.posts++;
        const f = Object.fromEntries(a.formular);
        if (f.horde_pass === "richtig" && f.horde_user === "zx123") { w.angemeldet = true; return { status: 200, text: seite("portal") }; }
        return { status: 200, text: seite("login-falsch") };
      }
      if (u === "/login.php") return { status: 200, text: w.angemeldet ? seite("portal") : seite("login") };
      if (u.indexOf("/login.php?horde_logout_token=") === 0) { w.angemeldet = false; return { status: 200, text: seite("login") }; }
      if (!w.angemeldet) return { status: 200, text: seite("login") };
      if (u.indexOf("/imp/basic.php?page=mailbox") === 0) { if (o.beiListe) o.beiListe(); return { status: 200, text: o.liste || seite("posteingang") }; }
      if (u === "/imp/minimal.php?page=mailbox&mailbox=SU5CT1g") return o.zahlen === null ? { status: 500, text: "" } : { status: 200, text: o.zahlen || seite("zahlen") };
      if (u.indexOf("/imp/minimal.php?mailbox=SU5CT1g&buid=64&page=message") === 0) return { status: 200, text: seite("nachricht") };
      return { status: 404, text: "" };
    },
  });
  return w;
}
function aufbau(o) {
  o = o || {};
  const w = webmail(o);
  const lokal = Object.assign({}, o.lokal);
  const t = { jetzt: Date.parse("2026-10-22T10:00:00Z"), timer: [], abgelehnt: [], gezeichnet: 0 };
  const M = erzeugen({
    html: P, sitzung: w.sitzung,
    zugang: () => (o.zugang === undefined ? { benutzer: "zx123", gesperrt: false, bestaetigt: true } : o.zugang),
    kennwort: () => (o.geheim === undefined ? "richtig" : o.geheim),
    ablehnen: async (d) => { t.abgelehnt.push(d); },
    lokal: (k, v) => { if (v === undefined) return lokal[k] || null; if (v == null) delete lokal[k]; else lokal[k] = v; return v; },
    jetzt: () => t.jetzt,
    heute: () => o.heute || "2026-10-22",
    zeit: (fn, ms) => { t.timer.push({ fn, ms }); return t.timer.length; },
    stopp: () => {},
    geaendert: () => { t.gezeichnet++; },
    z: {},
  });
  return { M, w, t, lokal };
}
const AN = { "eba-postfach-an": "2026-10-22T09:00:00.000Z" };

test("Status: ohne Uni-Login, abgelehnt, noch nicht von ILIAS bestätigt, ohne Zustimmung, bereit", () => {
  assert.equal(aufbau({ zugang: null }).M.status(), "ohne-login");
  assert.equal(aufbau({ zugang: { benutzer: "", bestaetigt: true } }).M.status(), "ohne-login");
  assert.equal(aufbau({ zugang: { benutzer: "zx123", gesperrt: true, bestaetigt: false }, lokal: AN }).M.status(), "gesperrt");
  assert.equal(aufbau({ zugang: { benutzer: "zx123", gesperrt: false, bestaetigt: false }, lokal: AN }).M.status(), "unbestaetigt");
  assert.equal(aufbau().M.status(), "aus");
  assert.equal(aufbau({ lokal: AN }).M.status(), "bereit");
});

test("Ohne Zustimmung oder Bestätigung geht nichts hinaus", async () => {
  for (const o of [{}, { zugang: { benutzer: "zx123", gesperrt: true, bestaetigt: true }, lokal: AN }, { zugang: { benutzer: "zx123", bestaetigt: false }, lokal: AN }]) {
    const { M, w } = aufbau(o);
    assert.equal(await M.laden({ seite: 1 }), false);
    assert.equal(M.faellig(), false);
    assert.equal(w.anfragen.length, 0);
  }
});

test("Einschalten: Anmeldung mit versteckten Feldern, Passwort nur im POST an das Webmail, dann die Liste", async () => {
  const { M, w, lokal } = aufbau();
  assert.equal(await M.einschalten(), true);
  assert.ok(lokal["eba-postfach-an"]);
  assert.deepEqual(w.anfragen.map((a) => a.methode + " " + a.url.replace(W, "")),
    ["GET /login.php", "POST /login.php", "GET /imp/basic.php?page=mailbox&mailbox=SU5CT1g&mpage=1",
      "GET /imp/minimal.php?page=mailbox&mailbox=SU5CT1g"]);
  const post = w.anfragen[1];
  assert.deepEqual(post.formular.map((x) => x[0]), ["app", "url", "anchor_string", "login_post", "horde_user", "horde_pass", "horde_select_view", "new_lang"]);
  assert.deepEqual(Object.fromEntries(post.formular), { app: "", url: "", anchor_string: "", login_post: "1", horde_user: "zx123", horde_pass: "richtig",
    horde_select_view: "mobile_nojs", new_lang: "de_DE" });
  for (const a of [w.anfragen[0], w.anfragen[2], w.anfragen[3]]) assert.doesNotMatch(JSON.stringify(a), /richtig/);
  const z = M.zustand();
  assert.equal(z.fehler, "");
  assert.deepEqual(z.seiten[1].mails.map((m) => m.buid), [64, 63, 12]);
  assert.equal(z.seiten[1].gesamt, 64);
  assert.equal(z.ungelesen, 2);
  assert.equal(z.abmelden, "/login.php?horde_logout_token=AbC123-x_Yz&logout_reason=4");
});

test("Abgelehnt: Marker für den Dienst mail, Status gesperrt-Text, kein zweiter Versuch im selben Abruf", async () => {
  const { M, w, t } = aufbau({ geheim: "alt", lokal: AN });
  assert.equal(await M.laden({ seite: 1 }), false);
  assert.deepEqual(t.abgelehnt, ["mail"]);
  assert.equal(w.posts, 1);
  assert.equal(M.zustand().fehler, "zugang-falsch");
  assert.match(M.TEXTE["zugang-falsch"], /Uni-Login neu eingeben/);
  // nach einem Fehler erst nach 5 Minuten wieder von selbst
  assert.equal(M.faellig(), false);
  t.jetzt += M.K.WIEDER + 1;
  assert.equal(M.faellig(), true);
});

test("Fremdes Formular oder Netzfehler: nie ein Passwort gesendet, Fehler ohne Inhalt", async () => {
  const fremd = aufbau({ lokal: AN });
  const orig = fremd.w.sitzung;
  fremd.w.sitzung = () => { const s = orig(); return { anfrage: async (a) => (a.methode !== "POST" && a.url === W + "/login.php" ? { status: 200, text: seite("login-fremd") } : s.anfrage(a)) }; };
  const M2 = erzeugen({ html: P, sitzung: fremd.w.sitzung, zugang: () => ({ benutzer: "zx123", bestaetigt: true }), kennwort: () => "richtig",
    ablehnen: async () => {}, lokal: () => "an", jetzt: () => 0, zeit: () => 0, stopp: () => {}, geaendert: () => {}, z: {} });
  assert.equal(await M2.laden({ seite: 1 }), false);
  assert.equal(M2.zustand().fehler, "unerwartet");
  assert.equal(fremd.w.posts, 0);
  const netz = aufbau({ netz: true, lokal: AN });
  assert.equal(await netz.M.laden({ seite: 1 }), false);
  assert.equal(netz.M.zustand().fehler, "netz");
  // Seite, die keine Liste ist: unsicher → unerwartet, nie „leer“
  const komisch = aufbau({ lokal: AN, liste: seite("portal") });
  assert.equal(await komisch.M.laden({ seite: 1 }), false);
  assert.equal(komisch.M.zustand().fehler, "unerwartet");
  assert.equal(komisch.M.zustand().seiten[1], undefined);
});

test("Sitzung abgelaufen: einmal neu anmelden, dann die Liste", async () => {
  const { M, w } = aufbau({ lokal: AN });
  await M.laden({ seite: 1 });
  w.angemeldet = false; // die Uni hat die Sitzung beendet
  assert.equal(await M.laden({ seite: 2 }), true);
  assert.equal(w.posts, 2);
  assert.equal(M.zustand().seite, 2);
});

test("Zahl ungelesener Mails: mit Seite 1 neu, weiter hinten nur, wenn sie fehlt; fehlt sie, bleibt die Liste", async () => {
  const zahl = (w) => w.anfragen.filter((a) => a.url === W + "/imp/minimal.php?page=mailbox&mailbox=SU5CT1g").length;
  const { M, w } = aufbau({ lokal: AN });
  await M.laden({ seite: 1 });
  await M.laden({ seite: 2 });
  assert.equal(zahl(w), 1);
  assert.equal(M.zustand().ungelesen, 2);
  const kaputt = aufbau({ lokal: AN, zahlen: null });
  assert.equal(await kaputt.M.laden({ seite: 1 }), true);
  assert.equal(kaputt.M.zustand().fehler, "");
  assert.equal(kaputt.M.zustand().ungelesen, null);
  assert.equal(kaputt.M.zustand().seiten[1].mails.length, 3);
  await kaputt.M.laden({ seite: 2 });
  assert.equal(zahl(kaputt.w), 2, "fehlt die Zahl, fragt auch Seite 2 danach");
  const fremd = aufbau({ lokal: AN, zahlen: seite("portal") });
  await fremd.M.laden({ seite: 1 });
  assert.equal(fremd.M.zustand().ungelesen, null);
});

test("Mail öffnen: Kopf und Text, danach gelesen und eine ungelesene weniger; zweites Öffnen ohne Anfrage", async () => {
  const { M, w } = aufbau({ lokal: AN });
  await M.laden({ seite: 1 });
  const n = await M.oeffnen(64);
  assert.equal(n.betreff, "Anmeldung zu den Prüfungen & Fristen");
  assert.match(n.text, /^Liebe Studierende,/);
  assert.equal(M.zustand().seiten[1].mails[0].ungelesen, false);
  assert.equal(M.zustand().ungelesen, 1);
  const vorher = w.anfragen.length;
  await M.oeffnen(64);
  assert.equal(w.anfragen.length, vorher);
  assert.equal(M.zustand().ungelesen, 1, "nur einmal abgezogen");
  await assert.rejects(M.oeffnen("64&a=d"), /ungültige Mail/);
});

test("Aktualisieren frühestens nach 15 s; beim Zeichnen nur, wenn die Liste älter als 5 Minuten ist", async () => {
  const { M, w, t } = aufbau({ lokal: AN });
  await M.laden({ seite: 1 });
  const n = w.anfragen.length;
  assert.equal(await M.laden({ seite: 1, manuell: true }), false);
  assert.equal(w.anfragen.length, n);
  t.jetzt += M.K.KNOPF_ABSTAND + 1;
  assert.equal(await M.laden({ seite: 1, manuell: true }), true);
  assert.equal(M.faellig(), false);
  t.jetzt += M.K.FRISCH + 1;
  assert.equal(M.faellig(), true);
});

test("Leerlauf und Ausschalten melden ab; Ausschalten vergisst alles im Speicher", async () => {
  const { M, w, t, lokal } = aufbau({ lokal: AN });
  await M.laden({ seite: 1 });
  const leer = t.timer[t.timer.length - 1];
  assert.equal(leer.ms, M.K.LEERLAUF);
  await leer.fn();
  assert.equal(w.anfragen[w.anfragen.length - 1].url, W + "/login.php?horde_logout_token=AbC123-x_Yz&logout_reason=4");
  assert.equal(M.zustand().sitzung, null);
  await M.oeffnen(64); // meldet sich dafür neu an
  await M.ausschalten();
  assert.equal(lokal["eba-postfach-an"], undefined);
  assert.equal(w.angemeldet, false);
  assert.deepEqual(M.zustand().seiten, {});
  assert.deepEqual(M.zustand().mails, {});
  assert.equal(M.zustand().ungelesen, null);
  assert.equal(M.status(), "aus");
});

test("Anderer Uni-Login: alte Sitzung abgemeldet, Mails vergessen; ein Abruf unterwegs verwirft seine Liste", async () => {
  const o = { lokal: AN };
  const { M, w } = aufbau(o);
  await M.laden({ seite: 1 });
  await M.oeffnen(64);
  assert.equal(M.zustand().benutzer, "zx123");
  assert.equal(M.status(), "bereit", "gleicher Benutzer: nichts passiert");
  assert.equal(w.angemeldet, true);
  o.zugang = { benutzer: "zy999", gesperrt: false, bestaetigt: true };
  assert.equal(M.status(), "bereit");
  assert.equal(w.anfragen[w.anfragen.length - 1].url, W + "/login.php?horde_logout_token=AbC123-x_Yz&logout_reason=4");
  assert.equal(w.angemeldet, false);
  const z = M.zustand();
  assert.deepEqual([z.seiten, z.mails, z.ungelesen, z.benutzer, z.sitzung, z.abmelden], [{}, {}, null, "", null, ""]);
  // Kurz kein Uni-Login (ilias.js lädt neu): alles bleibt; ausdrücklich entfernt (Trennen): ebenso abgemeldet und vergessen
  const p = { lokal: AN };
  const b = aufbau(p);
  await b.M.laden({ seite: 1 });
  p.zugang = null;
  assert.equal(b.M.status(), "ohne-login");
  assert.equal(b.M.kontoPruefen(), false);
  assert.equal(b.w.angemeldet, true);
  assert.equal(b.M.zustand().seiten[1].mails.length, 3);
  p.zugang = undefined;
  assert.equal(b.M.status(), "bereit", "derselbe Benutzer wieder da: Liste und Sitzung wie vorher");
  assert.equal(b.M.zustand().benutzer, "zx123");
  p.zugang = null;
  assert.equal(b.M.kontoPruefen({ entfernt: true }), true);
  assert.equal(b.w.angemeldet, false);
  assert.deepEqual(b.M.zustand().seiten, {});
  // Wechsel, während die Liste unterwegs ist: verworfen, kein zweiter Abruf zugleich
  const q = { lokal: AN };
  const c = aufbau(q);
  await c.M.laden({ seite: 1 });
  q.beiListe = () => { q.beiListe = null; q.zugang = { benutzer: "zy999", gesperrt: false, bestaetigt: true }; assert.equal(c.M.status(), "bereit"); assert.equal(c.M.zustand().laeuft, true); };
  assert.equal(await c.M.laden({ seite: 2 }), false);
  assert.deepEqual(c.M.zustand().seiten, {});
  assert.equal(c.M.zustand().fehler, "");
  assert.equal(c.M.zustand().laeuft, false);
});

test("Datum: Mails von heute (nur Uhrzeit) behalten ihr Datum, nach Mitternacht Tag und Monat", async () => {
  const { M } = aufbau({ lokal: AN });
  await M.laden({ seite: 1 });
  const m = M.zustand().seiten[1].mails[0];
  assert.equal(m.datum, "22.10.2026 08:40:00");
  assert.equal(P.datumKurz(m.datum, "2026-10-22"), "08:40");
  assert.equal(P.datumKurz(m.datum, "2026-10-23"), "22.10.");
});

test("Neuer Tag: der Block zeichnet neu (alle 30 Minuten und beim Zurückkommen, nur sichtbar); Wechsel des Uni-Logins meldet ab", async () => {
  const { laden } = require("./laden.js");
  const alt = globalThis.document;
  globalThis.document = { visibilityState: "visible" };
  try {
    let tag = "2026-10-22", neu = 0, hoerer = null, zugang = { benutzer: "zx123", gesperrt: false, bestaetigt: true };
    const intervalle = [], dom = [], w = webmail();
    const zustand = {};
    const r = laden("postfach", { kontext: {
      date: { now: () => tag, jetzt: () => new Date("2026-10-22T10:00:00Z") },
      codeblock: () => ({ neu: () => { neu++; } }),
      intervall: (fn, ms) => { intervalle.push({ fn, ms }); return 0; },
      dom: (_ziel, art, fn) => { dom.push({ art, fn }); },
      bleibend: () => zustand,
      ilias: { beobachten: (fn) => { hoerer = fn; return () => {}; }, uniZugang: () => zugang },
      user: { "ilias-netz": { sitzung: w.sitzung, drossel: () => undefined }, "postfach-html": P },
    } });
    r.ergebnis.registrieren();
    assert.deepEqual(intervalle.map((x) => x.ms), [30 * 60e3]);
    assert.deepEqual(dom.map((x) => x.art), ["visibilitychange"]);
    intervalle[0].fn();
    assert.equal(neu, 0, "gleicher Tag");
    tag = "2026-10-23";
    globalThis.document.visibilityState = "hidden";
    dom[0].fn();
    assert.equal(neu, 0, "verborgen: nichts");
    globalThis.document.visibilityState = "visible";
    dom[0].fn();
    assert.equal(neu, 1);
    intervalle[0].fn();
    assert.equal(neu, 1, "nur einmal je Tag");
    // Uni-Login gewechselt, Seite nicht offen: der Hörer von ilias.js meldet die alte Sitzung ab
    Object.assign(zustand, { benutzer: "zx123", sitzung: w.sitzung(), abmelden: "/login.php?horde_logout_token=AbC123-x_Yz&logout_reason=4",
      seiten: { 1: { mails: [{ buid: 64 }], seiten: 1, gesamt: 1, zeit: 0 } }, mails: {} });
    assert.equal(r.ergebnis.status(), "aus");
    zugang = null;
    hoerer({ art: "fertig" });
    assert.equal(zustand.seiten[1].mails.length, 1, "kurz leer, ohne Meldung „zugang“: bleibt");
    zugang = { benutzer: "zy999", gesperrt: false, bestaetigt: true };
    hoerer({ art: "zugang" });
    assert.deepEqual(zustand.seiten, {});
    assert.equal(w.anfragen[w.anfragen.length - 1].url, W + "/login.php?horde_logout_token=AbC123-x_Yz&logout_reason=4");
  } finally {
    if (alt === undefined) delete globalThis.document; else globalThis.document = alt;
  }
});

// Ohne Uni-Login auf diesem Gerät führt „Mit Uni-Login verbinden“ gleich zur Anmeldung (auch=1), nicht zum Fenster „über ein
// anderes Gerät verbunden“: Mails kommen nie über den Sync, jedes Gerät braucht den Login.
test("Mit Uni-Login verbinden öffnet die Anmeldung auch, wenn ILIAS anderswo verbunden ist", () => {
  const { laden } = require("./laden.js");
  const element = () => {
    const e = { kinder: [], attr: {} };
    const neu = (tag, o) => { const k = element(); k.tag = tag; Object.assign(k.attr, o || {}); e.kinder.push(k); return k; };
    Object.assign(e, {
      createDiv: (o) => neu("div", o), createSpan: (o) => neu("span", o), createEl: neu,
      empty: () => { e.kinder.length = 0; }, setText: () => {}, addEventListener: () => {},
    });
    return e;
  };
  let zeichnen = null;
  const { ergebnis } = laden("postfach", { kontext: {
    user: { "ilias-netz": {}, "postfach-html": P },
    ilias: { uniZugang: () => null },
    link: (aktion, p) => aktion + "?" + new URLSearchParams(p),
    codeblock: (_s, fn) => { zeichnen = fn; return { neu: () => {} }; },
  } });
  const alt = globalThis.document;
  globalThis.document = { visibilityState: "visible" };
  try { ergebnis.registrieren(); } finally {
    if (alt === undefined) delete globalThis.document; else globalThis.document = alt;
  }
  const el = element();
  zeichnen("", el);
  const links = [];
  const sammeln = (e) => { if (e.tag === "a") links.push(e.attr.href); e.kinder.forEach(sammeln); };
  sammeln(el);
  assert.deepEqual(links, ["verbinden?id=ilias&auch=1"]);
});
