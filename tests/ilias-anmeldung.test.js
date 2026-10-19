// ILIAS-Anmeldung (ilias-anmeldung.js) mit der echten Sitzung aus ilias-netz.js und einer Attrappe als Transport (Server
// von ovidius und IdP nachgespielt). Prüft Ablauf, Fehlerfälle und dass das Passwort nur an den IdP geht und nirgends
// zurückkommt. Kein Netz. Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { laden } = require("./laden.js");

const N = laden("ilias-netz").ergebnis;
const A = laden("ilias-anmeldung").ergebnis;
const H = laden("ilias-html").ergebnis;
const I = "https://ovidius.uni-tuebingen.de", P = "https://idp.uni-tuebingen.de";
const seite = (name) => fs.readFileSync(path.join(__dirname, "daten", "ilias-netz", name), "utf8");
const IDP_FORM = seite("idp.html");
const SAML_FORM = seite("saml-post.html");
const DASHBOARD = '<html><body><ul class="il-maincontrols-metabar"><li><a href="ilias.php?baseClass=ilDashboardGUI">Dashboard</a></li></ul></body></html>';
const GEHEIM = "Sentinel-Geheim-4711";

const html = (text) => ({ status: 200, kopf: { "content-type": "text/html; charset=utf-8" }, text });
const weiter = (ort) => ({ status: 302, kopf: { location: ort } });
const host = (u) => new URL(u).host;

// Nachgespielter Server: Regeln „METHODE host+pfad“ → Antwort (oder Funktion der Anfrage)
function server(regeln) {
  const anfragen = [];
  const transport = async (a) => {
    anfragen.push(a);
    const u = new URL(a.url);
    const schluessel = `${a.methode || "GET"} ${u.host}${u.pathname}`;
    const r = regeln[schluessel];
    if (!r) throw Object.assign(new Error("keine Regel für " + schluessel), { grund: "netz" });
    return typeof r === "function" ? r(a) : r;
  };
  return { transport, anfragen };
}
const koerper = (a) => String(a.body == null ? "" : (typeof a.body === "string" ? a.body : Buffer.from(a.body).toString("utf8")));

function grundRegeln(nachLogin) {
  return {
    [`GET ovidius.uni-tuebingen.de/shib_login.php`]: weiter(`${P}/idp/profile/SAML2/Redirect/SSO?SAMLRequest=abc%2Bdef&RelayState=xyz`),
    [`GET idp.uni-tuebingen.de/idp/profile/SAML2/Redirect/SSO`]: (a) => (/execution=/.test(a.url) ? html(IDP_FORM) : weiter(`${P}/idp/profile/SAML2/Redirect/SSO?execution=e1s1`)),
    [`POST idp.uni-tuebingen.de/idp/profile/SAML2/Redirect/SSO`]: nachLogin,
    [`POST ovidius.uni-tuebingen.de/Shibboleth.sso/SAML2/POST`]: weiter(`${I}/ilias.php?baseClass=ilDashboardGUI&cmd=show`),
    [`GET ovidius.uni-tuebingen.de/ilias.php`]: html(DASHBOARD),
  };
}

// mobil: wie requestUrl auf iPhone/iPad folgt der Transport Weiterleitungen selbst und nennt keine Adressen
async function lauf(regeln, zugang, { mobil = false, anmeldung = A } = {}) {
  const s = server(regeln);
  let transport = s.transport;
  if (mobil) {
    transport = async (a) => {
      let r = await s.transport(a), url = a.url;
      for (let i = 0; i < 12 && r.status >= 300 && r.status < 400 && r.kopf && r.kopf.location; i++) {
        url = new URL(r.kopf.location, url).href;
        r = await s.transport({ url, methode: "GET", kopf: {} });
      }
      return r;
    };
    transport.folgtSelbst = true;
  }
  const sitzung = N.sitzung({ transport });
  let geholt = 0;
  const z = zugang || { benutzer: "abc12345", kennwortGeber: () => { geholt++; return GEHEIM; } };
  const ergebnis = await anmeldung.anmelden(sitzung, z, { netz: N, html: H });
  return { ergebnis, anfragen: s.anfragen, geholt: () => geholt };
}

test("Erfolg: IdP-Formular, SAML zurück an ILIAS, Dashboard ohne Login-Seite", async () => {
  const { ergebnis, anfragen, geholt } = await lauf(grundRegeln(html(SAML_FORM)));
  assert.deepEqual(ergebnis, { ok: true });
  assert.equal(geholt(), 1, "Passwort genau einmal geholt");
  const mitGeheim = anfragen.filter((a) => koerper(a).indexOf(GEHEIM) >= 0);
  assert.equal(mitGeheim.length, 1, "Passwort genau einmal gesendet");
  assert.equal(host(mitGeheim[0].url), "idp.uni-tuebingen.de", "Passwort nur an den IdP");
  assert.equal(mitGeheim[0].methode, "POST");
  const b = new URLSearchParams(koerper(mitGeheim[0]));
  assert.equal(b.get("j_username"), "abc12345");
  assert.equal(b.get("_eventId_proceed"), "");
  assert.equal(b.has("donotcache"), false, "Kästchen bleiben leer");
  assert.equal(b.has("_shib_idp_revokeConsent"), false);
  const saml = anfragen.filter((a) => a.methode === "POST" && host(a.url) === "ovidius.uni-tuebingen.de")[0];
  const sb = new URLSearchParams(koerper(saml));
  assert.equal(sb.get("SAMLResponse"), "VEVTVC1TQU1MLVBMQVRaSEFMVEVS+/dGVzdA==", "Entitäten entschlüsselt");
  assert.equal(sb.get("RelayState"), "cookie:1700000000_TEST");
  assert.equal(sb.has("j_password"), false);
  // die Weiterleitungen enden auf dem Dashboard: kein zweiter Abruf zur Prüfung
  assert.equal(anfragen.filter((a) => /\/ilias\.php/.test(a.url)).length, 1);
});

test("Endet die Anmeldung nicht auf einer ILIAS-Seite, wird das Dashboard eigens geprüft", async () => {
  const r = grundRegeln(html(SAML_FORM));
  r[`POST ovidius.uni-tuebingen.de/Shibboleth.sso/SAML2/POST`] = html("<html><body>Weiter …</body></html>");
  const { ergebnis, anfragen } = await lauf(r);
  assert.deepEqual(ergebnis, { ok: true });
  assert.equal(anfragen.filter((a) => /\/ilias\.php/.test(a.url)).length, 1, "Dashboard geholt");
});

test("Falsches Passwort – der IdP zeigt das Formular wieder → zugang-falsch, Hinweis ohne Passwort", async () => {
  const { ergebnis } = await lauf(grundRegeln(html(IDP_FORM.replace("<form", '<p class="form-error">Falsch</p><form'))));
  assert.equal(ergebnis.ok, false);
  assert.equal(ergebnis.grund, "zugang-falsch");
  assert.ok(ergebnis.hinweis && ergebnis.hinweis.indexOf(GEHEIM) < 0);
  assert.equal(JSON.stringify(ergebnis).indexOf(GEHEIM), -1);
});

test("Zustimmungsseite der Uni → zustimmung, nie selbst zustimmen", async () => {
  const zustimmung = '<html><body><form id="attributeRelease" action="/idp/profile/SAML2/Redirect/SSO?execution=e1s2" method="post">'
    + '<input type="radio" name="_shib_idp_consentOptions" value="_shib_idp_doNotRememberConsent">'
    + '<input type="submit" name="_eventId_proceed" value="Accept"></form></body></html>';
  const { ergebnis, anfragen } = await lauf(grundRegeln(html(zustimmung)));
  assert.equal(ergebnis.grund, "zustimmung");
  assert.equal(anfragen.filter((a) => a.methode === "POST").length, 1, "nach der Zustimmungsseite nichts mehr abgeschickt");
});

test("Zwei-Faktor-Abfrage → zwei-faktor", async () => {
  const tfa = '<html><body><form id="fudiscr-form" method="post" action="/idp/x"><input name="fudis_otp_input"></form></body></html>';
  const { ergebnis } = await lauf(grundRegeln(html(tfa)));
  assert.equal(ergebnis.grund, "zwei-faktor");
});

test("IdP-Sitzung gilt noch: direkt SAML-Formular, Passwort wird nicht geholt", async () => {
  const r = grundRegeln(null);
  r[`GET idp.uni-tuebingen.de/idp/profile/SAML2/Redirect/SSO`] = html(SAML_FORM);
  const { ergebnis, geholt, anfragen } = await lauf(r);
  assert.deepEqual(ergebnis, { ok: true });
  assert.equal(geholt(), 0);
  assert.equal(anfragen.filter((a) => host(a.url) === "idp.uni-tuebingen.de" && a.methode === "POST").length, 0);
});

test("Schon angemeldet: shib_login.php führt direkt zu ILIAS → ok ohne Passwort", async () => {
  const r = grundRegeln(null);
  r[`GET ovidius.uni-tuebingen.de/shib_login.php`] = weiter(`${I}/ilias.php?baseClass=ilDashboardGUI&cmd=show`);
  const { ergebnis, geholt } = await lauf(r);
  assert.deepEqual(ergebnis, { ok: true });
  assert.equal(geholt(), 0);
});

test("SAML-Formular zeigt auf fremden Server → unerwartet, nichts dorthin gesendet", async () => {
  const boese = SAML_FORM.replace("ovidius.uni-tuebingen.de", "boese.example.org");
  const { ergebnis, anfragen } = await lauf(grundRegeln(html(boese)));
  assert.equal(ergebnis.grund, "unerwartet");
  assert.equal(anfragen.filter((a) => host(a.url) === "boese.example.org").length, 0);
});

test("IdP-Formular zeigt auf fremden Server → unerwartet, Passwort nie geholt", async () => {
  const r = grundRegeln(null);
  r[`GET idp.uni-tuebingen.de/idp/profile/SAML2/Redirect/SSO`] = (a) => (/execution=/.test(a.url)
    ? html(IDP_FORM.replace('action="/idp/profile/SAML2/Redirect/SSO?execution=', 'action="https://boese.example.org/sammeln?execution='))
    : weiter(`${P}/idp/profile/SAML2/Redirect/SSO?execution=e1s1`));
  const { ergebnis, geholt, anfragen } = await lauf(r);
  assert.equal(ergebnis.grund, "unerwartet");
  assert.equal(geholt(), 0);
  assert.equal(anfragen.filter((a) => host(a.url) === "boese.example.org").length, 0);
});

test("Weiterleitung auf fremden Server blockiert die Sitzung → unerwartet", async () => {
  const r = grundRegeln(null);
  r[`GET ovidius.uni-tuebingen.de/shib_login.php`] = weiter("https://boese.example.org/idp");
  const { ergebnis, anfragen } = await lauf(r);
  assert.equal(ergebnis.grund, "unerwartet");
  assert.equal(anfragen.filter((a) => host(a.url) === "boese.example.org").length, 0);
  assert.ok(ergebnis.code.startsWith("blockiert-boese.example.org bei start · PC "), ergebnis.code);
});

test("Netzfehler und 5xx → netz, Code nennt Grund und Schritt", async () => {
  const r = grundRegeln(null);
  r[`GET ovidius.uni-tuebingen.de/shib_login.php`] = () => { throw Object.assign(new Error("ECONNRESET"), { grund: "netz" }); };
  assert.equal((await lauf(r)).ergebnis.grund, "netz");
  const r5 = grundRegeln(null);
  r5[`GET ovidius.uni-tuebingen.de/shib_login.php`] = { status: 503, kopf: {}, text: "weg" };
  const e5 = (await lauf(r5)).ergebnis;
  assert.equal(e5.grund, "netz");
  assert.ok(e5.code.startsWith("netz-http-503 · "), e5.code);
  const rz = grundRegeln(() => { throw Object.assign(new Error("Zeit"), { grund: "zeitueberschreitung" }); });
  const ez = (await lauf(rz)).ergebnis;
  assert.equal(ez.grund, "netz");
  assert.ok(ez.code.startsWith("netz-zeitueberschreitung bei passwort · "), ez.code);
  assert.ok(ez.hinweis.endsWith(" Code: " + ez.code));
});

test("Nach SAML immer noch Login-Seite → unerwartet", async () => {
  const r = grundRegeln(html(SAML_FORM));
  r[`GET ovidius.uni-tuebingen.de/ilias.php`] = html(seite("login.html"));
  assert.equal((await lauf(r)).ergebnis.grund, "unerwartet");
});

test("Fehlender Benutzer oder Passwort-Geber → zugang-falsch ohne Anfrage", async () => {
  const { ergebnis, anfragen } = await lauf(grundRegeln(null), { benutzer: "", kennwortGeber: () => GEHEIM });
  assert.equal(ergebnis.grund, "zugang-falsch");
  assert.equal(anfragen.length, 0);
});

test("Unbekannte Seite nach dem Passwort → unerwartet; Code mit Stelle, Spur, Titel und Feldnamen, nie Werte oder Zugangsdaten", async () => {
  const seiteNeu = '<html><head><title>Hinweis für ABC12345</title></head><body><form method="post" action="/idp/x">'
    + '<input type="hidden" name="csrf_token" value="WERT-99"><button name="_eventId_proceed">Weiter</button></form></body></html>';
  const { ergebnis } = await lauf(grundRegeln(html(seiteNeu)));
  assert.equal(ergebnis.grund, "unerwartet");
  const c = ergebnis.code;
  assert.ok(c.startsWith("nach-passwort · PC ? · start 200 idp/idp/profile/SAML2/Redirect/SSO idp-anmeldung › passwort 200 "), c);
  assert.ok(c.endsWith("unbekannt „Hinweis für •••“ [csrf_token,_eventId_proceed]"), c);
  assert.equal(ergebnis.hinweis, A.HINWEISE.unerwartet + " Code: " + c);
  for (const nie of ["WERT-99", GEHEIM, "abc12345", "ABC12345", "execution="]) assert.equal(JSON.stringify(ergebnis).indexOf(nie), -1, nie);
});

test("Zustimmung gleich beim Einstieg (IdP-Sitzung gilt noch) → zustimmung, nichts abgeschickt", async () => {
  const r = grundRegeln(null);
  r[`GET idp.uni-tuebingen.de/idp/profile/SAML2/Redirect/SSO`] = html('<html><body><form id="attributeRelease" method="post" action="/idp/y">'
    + '<input type="submit" name="_eventId_proceed" value="Accept"></form></body></html>');
  const { ergebnis, anfragen, geholt } = await lauf(r);
  assert.equal(ergebnis.grund, "zustimmung");
  assert.equal(ergebnis.hinweis, A.HINWEISE.zustimmung, "ohne Code: der Hinweis sagt, was zu tun ist");
  assert.equal(geholt(), 0);
  assert.equal(anfragen.filter((a) => a.methode === "POST").length, 0);
});

test("iPad: Anmeldung endet nicht in ILIAS → Code mit Gerät, Version und Seitenart je Schritt (ohne Adressen)", async () => {
  const ipad = laden("ilias-anmeldung", { kontext: {
    obsidian: { Platform: { isIosApp: true, isTablet: true, isMobile: true } }, plugin: { manifest: { version: "9.9.9" } },
  } }).ergebnis;
  const r = grundRegeln(html(SAML_FORM));
  r[`GET ovidius.uni-tuebingen.de/ilias.php`] = html(seite("login.html"));
  const { ergebnis } = await lauf(r, null, { mobil: true, anmeldung: ipad });
  assert.equal(ergebnis.grund, "unerwartet");
  assert.ok(ergebnis.code.startsWith("nicht-angemeldet · iPad 9.9.9 · start 200 idp-anmeldung › passwort 200 saml-weiterleitung › saml 200 ilias-anmeldung „Bei ILIAS anmelden"), ergebnis.code);
  assert.ok(/› dashboard 200 ilias-anmeldung „Bei ILIAS anmelden/.test(ergebnis.code), ergebnis.code);
  assert.ok(ergebnis.code.length <= 450);
});

test("iPad: erfolgreiche Anmeldung wie am PC", async () => {
  const { ergebnis } = await lauf(grundRegeln(html(SAML_FORM)), null, { mobil: true });
  assert.deepEqual(ergebnis, { ok: true });
});
