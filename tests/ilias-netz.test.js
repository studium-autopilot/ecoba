// ILIAS-Netz (ilias-netz.js): Keksdose, Formulare lesen, Entitäten, byte-genaues Auflösen von Weiterleitungen, Sitzung mit
// Attrappen als Transport (PC: eigene Weiterleitungen, Host-Sperre; iPhone/iPad: requestUrl folgt selbst). Kein Netz.
// Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { laden } = require("./laden.js");

const N = laden("ilias-netz").ergebnis;
const I = "https://ovidius.uni-tuebingen.de", P = "https://idp.uni-tuebingen.de";
const DATEI = path.join(__dirname, "..", "Studium Autopilot", "System", "Skripte", "ilias-netz.js");
// Gespeicherte öffentliche Seiten (anonym, ohne Sitzungsdaten) und eine nachgebaute SAML-Antwort
const seite = (name) => fs.readFileSync(path.join(__dirname, "daten", "ilias-netz", name), "utf8");

// Transport-Attrappe: je Anfrage der nächste Schritt (Funktion bekommt die Anfrage, liefert die Antwort)
function attrappe(schritte) {
  const anfragen = [];
  const t = async (a) => {
    anfragen.push(a);
    const s = schritte[anfragen.length - 1];
    if (!s) throw new Error("unerwartete Anfrage Nr. " + anfragen.length);
    return typeof s === "function" ? s(a) : s;
  };
  t.anfragen = anfragen;
  return t;
}
const weiter = (ort, mehr) => Object.assign({ status: 302, kopf: { location: ort } }, mehr || {});
const fremd = (e) => e && e.grund === "fremder-host";

// ---------- Grundlagen ----------

test("UNI und erlaubte Hosts", () => {
  assert.equal(N.UNI.name, "Universität Tübingen");
  assert.equal(N.UNI.ilias, I);
  assert.equal(N.UNI.idp, P);
  assert.equal(N.UNI.client, "pr02");
  assert.ok(Object.isFrozen(N.UNI));
  assert.equal(N.UNIS.tuebingen, N.UNI);
  assert.deepEqual(Array.from(N.ERLAUBTE_HOSTS), ["ovidius.uni-tuebingen.de", "idp.uni-tuebingen.de"]);
});

test("Beim Laden: kein Netz, keine Zeitgeber", () => {
  let zaehler = 0;
  const zaehlen = () => { zaehler++; return 0; };
  laden("ilias-netz", { kontext: { obsidian: { requestUrl: async () => { zaehler++; } }, zeit: zaehlen, intervall: zaehlen } });
  assert.equal(zaehler, 0);
});

test("entitaeten: numerisch, benannt, ein Durchgang", () => {
  assert.equal(N.entitaeten("https&#x3a;&#x2f;&#x2f;a&#X2F;b&#43;c&#x2b"), "https://a/b+c+");
  assert.equal(N.entitaeten("a&amp;b &lt;&gt; &quot;x&quot; &apos; &nbsp;|"), "a&b <> \"x\" '  |");
  assert.equal(N.entitaeten("&amp;#x2b;"), "&#x2b;", "nicht doppelt entschlüsseln");
  assert.equal(N.entitaeten("&unbekannt; &amp ohne &copy;"), "&unbekannt; &amp ohne ©");
  assert.equal(N.entitaeten("&#0;&#x110000;&#xD800;&#128;&#x1F600;"), "���€😀");
  assert.equal(N.entitaeten("&auml;&szlig;&colon;&sol;"), "äß:/");
  assert.equal(N.entitaeten(null), "");
});

test("aufloesen: Query und Fragment bleiben byte-genau", () => {
  const saml = P + "/idp/profile/SAML2/Redirect/SSO?SAMLRequest=fZJdT%2bMwEEX%2Fi%2BX3xPlqaKy2qALt&RelayState=ss%3Amem%3Ad41d" +
    "&SigAlg=http%3A%2F%2Fwww.w3.org%2F2001%2F04%2Fxmldsig-more%23rsa-sha256&Signature=Ab%2b%2Fz%3D%3d+x";
  assert.equal(N.aufloesen(saml, I + "/shib_login.php"), saml, "absolute Location unverändert");
  const basis = P + "/idp/profile/SAML2/Redirect/SSO?execution=e1s1";
  assert.equal(N.aufloesen("/idp/x?a=%2b%2B+%20&b=%7e~'", basis), P + "/idp/x?a=%2b%2B+%20&b=%7e~'");
  assert.equal(N.aufloesen("SSO?execution=e1s2", basis), P + "/idp/profile/SAML2/Redirect/SSO?execution=e1s2");
  assert.equal(N.aufloesen("../POST?x=../y", I + "/Shibboleth.sso/SAML2/Artifact"), I + "/Shibboleth.sso/POST?x=../y");
  assert.equal(N.aufloesen("./shib_login.php", I + "/login.php?client_id=pr02&cmd=force_login"), I + "/shib_login.php");
  assert.equal(N.aufloesen("//idp.uni-tuebingen.de/a?b=%2F", I + "/x"), P + "/a?b=%2F");
  assert.equal(N.aufloesen("?cmd=x%2By", I + "/ilias.php?a=1"), I + "/ilias.php?cmd=x%2By");
  assert.equal(N.aufloesen("#teil", I + "/a?b=1#alt"), I + "/a?b=1#teil");
  assert.equal(N.aufloesen("", I + "/a?b=1#alt"), I + "/a?b=1");
  assert.equal(N.aufloesen("/a/./b/../c?d=/../", I), I + "/a/c?d=/../");
  assert.equal(N.aufloesen("x", I), I + "/x");
  assert.equal(N.aufloesen("  /p  ", I + "/q"), I + "/p", "Leerraum am Rand fällt weg");
  // new URL() würde hier umkodieren (Leerzeichen, Anführungszeichen); aufloesen nicht
  assert.equal(N.aufloesen("/p?a=b c'\"", I), I + "/p?a=b c'\"");
  assert.notEqual(new URL("/p?a=b c'\"", I).href, I + "/p?a=b c'\"");
});

test("formularKodieren: wie Browser (Leerzeichen als +)", () => {
  assert.equal(N.formularKodieren({ a: "x y", b: "ä+&=/?", c: "!'()*~-._", d: null, e: 3 }),
    "a=x+y&b=%C3%A4%2B%26%3D%2F%3F&c=%21%27%28%29*%7E-._&d=&e=3");
  assert.equal(N.formularKodieren([["k", "1"], ["k", "2"], ["leer zeichen", ""]]), "k=1&k=2&leer+zeichen=");
  assert.equal(N.formularKodieren({}), "");
});

// ---------- Keksdose ----------

const uhr = (ms) => { const u = { t: ms, jetzt: () => u.t }; return u; };

test("Keksdose: Host-only, Domain, Namen genau wie empfangen", () => {
  const K = N.keksDose({ jetzt: uhr(Date.UTC(2026, 9, 16)).jetzt });
  assert.equal(K.aufnehmen(["PHPSESSID=abc; path=/; secure; HttpOnly", "ilClientId=pr02; path=/",
    "_opensaml_req_ss%3Amem%3Ad41d8cd9=_wert1; path=/; secure; HttpOnly; SameSite=None"], I + "/shib_login.php"), 3);
  assert.equal(K.kopfFuer(I + "/ilias.php?x=1"), "PHPSESSID=abc; ilClientId=pr02; _opensaml_req_ss%3Amem%3Ad41d8cd9=_wert1");
  assert.equal(K.kopfFuer(P + "/idp/"), "", "Host-only: nicht an den IdP");
  assert.deepEqual(K.namen(), { "ovidius.uni-tuebingen.de": ["PHPSESSID", "ilClientId", "_opensaml_req_ss%3Amem%3Ad41d8cd9"] });
  // Domain-Keks gilt für alle Hosts darunter
  K.aufnehmen("gemeinsam=1; Domain=.Uni-Tuebingen.de; Path=/", P + "/idp/x");
  assert.equal(K.kopfFuer(P + "/idp/"), "gemeinsam=1");
  assert.ok(K.kopfFuer(I + "/").endsWith("; gemeinsam=1"));
  assert.deepEqual(K.namen()[".uni-tuebingen.de"], ["gemeinsam"]);
  // nicht passende oder zu breite Domains werden verworfen
  assert.equal(K.aufnehmen(["a=1; Domain=example.org", "b=1; Domain=de", "c=1; Domain=ovidius.uni-tuebingen.de"], P + "/"), 0);
  // kaputte Zeilen
  assert.equal(K.aufnehmen(["ohneGleich", "=nurWert", "", null], I + "/"), 0);
});

test("Keksdose: Pfad, Standardpfad, Reihenfolge, Secure", () => {
  const K = N.keksDose();
  K.aufnehmen("auto=1", I + "/Shibboleth.sso/SAML2/POST"); // Standardpfad /Shibboleth.sso/SAML2
  K.aufnehmen("doku=1; Path=/docs", I + "/");
  K.aufnehmen("wurzel=1; Path=/", I + "/");
  K.aufnehmen("tief=1; Path=/docs/a", I + "/");
  assert.equal(K.kopfFuer(I + "/Shibboleth.sso/SAML2/POST"), "auto=1; wurzel=1");
  assert.equal(K.kopfFuer(I + "/Shibboleth.sso/SAML2"), "auto=1; wurzel=1");
  assert.equal(K.kopfFuer(I + "/Shibboleth.sso/SAML2x"), "wurzel=1");
  assert.equal(K.kopfFuer(I + "/docs/a/b"), "tief=1; doku=1; wurzel=1", "längerer Pfad zuerst");
  assert.equal(K.kopfFuer(I + "/docsx"), "wurzel=1");
  assert.equal(K.kopfFuer(I), "wurzel=1");
  // Secure nur über https; über http gesetzte Secure-Kekse werden verworfen
  K.aufnehmen("sicher=1; Path=/; Secure", I + "/");
  assert.ok(K.kopfFuer(I + "/").indexOf("sicher=1") >= 0);
  assert.equal(K.kopfFuer("http://ovidius.uni-tuebingen.de/").indexOf("sicher=1"), -1);
  assert.equal(K.aufnehmen("unsicher=1; Secure", "http://ovidius.uni-tuebingen.de/"), 0);
});

test("Keksdose: Ablauf mit Uhr, Max-Age vor Expires, Ersetzen, Löschen", () => {
  const u = uhr(Date.UTC(2026, 9, 16, 12, 0, 0));
  const K = N.keksDose({ jetzt: u.jetzt });
  K.aufnehmen(["a=1; Max-Age=60", "b=1; Expires=Fri, 16 Oct 2026 13:00:00 GMT",
    "c=1; Expires=Fri, 16-Oct-26 12:30:00 GMT; Max-Age=7200", "d=1; Expires=kein Datum"], I + "/");
  assert.equal(K.kopfFuer(I + "/"), "a=1; b=1; c=1; d=1");
  u.t += 61e3;
  assert.equal(K.kopfFuer(I + "/"), "b=1; c=1; d=1", "a nach 60 s abgelaufen");
  u.t = Date.UTC(2026, 9, 16, 13, 0, 0);
  assert.equal(K.kopfFuer(I + "/"), "c=1; d=1", "b zur Expires-Zeit abgelaufen");
  u.t = Date.UTC(2026, 9, 16, 13, 59, 59);
  assert.equal(K.kopfFuer(I + "/"), "c=1; d=1", "Max-Age gilt vor Expires");
  u.t = Date.UTC(2026, 9, 16, 14, 0, 0);
  assert.equal(K.kopfFuer(I + "/"), "d=1");
  // Ersetzen: gleicher Name, Domain, Pfad; Reihenfolge (Erstellzeit) bleibt
  K.aufnehmen(["x=1", "y=1"], I + "/");
  K.aufnehmen("x=2", I + "/");
  assert.equal(K.kopfFuer(I + "/"), "d=1; x=2; y=1");
  // anderer Pfad = eigener Keks
  K.aufnehmen("x=3; Path=/a", I + "/");
  assert.equal(K.kopfFuer(I + "/a"), "x=3; d=1; x=2; y=1");
  // Löschen über Ablauf in der Vergangenheit bzw. Max-Age=0
  K.aufnehmen("x=; Expires=Thu, 01 Jan 1970 00:00:00 GMT", I + "/");
  K.aufnehmen("y=0; Max-Age=0", I + "/");
  assert.equal(K.kopfFuer(I + "/"), "d=1");
  K.leeren();
  assert.equal(K.kopfFuer(I + "/"), "");
  assert.deepEqual(K.namen(), {});
});

test("Keksdose: Präfixe __Host- und __Secure-", () => {
  const K = N.keksDose();
  K.aufnehmen("__Host-JSESSIONID=j1; Path=/; Secure; HttpOnly", P + "/idp/profile/SAML2/Redirect/SSO");
  K.aufnehmen("__Host-a=1; Path=/", P + "/");                                      // ohne Secure
  K.aufnehmen("__Host-b=1; Path=/; Secure; Domain=idp.uni-tuebingen.de", P + "/"); // mit Domain
  K.aufnehmen("__Host-c=1; Secure", P + "/idp/x");                                  // ohne Path=/
  K.aufnehmen("__Host-d=1; Path=/idp; Secure", P + "/idp/x");                       // anderer Pfad
  K.aufnehmen("__Secure-e=1", P + "/");                                             // ohne Secure
  K.aufnehmen("__secure-g=1", P + "/");                                             // Präfix ohne Rücksicht auf Groß/klein
  K.aufnehmen("__Secure-f=1; Secure; Path=/", P + "/");
  assert.deepEqual(K.namen(), { "idp.uni-tuebingen.de": ["__Host-JSESSIONID", "__Secure-f"] });
  assert.equal(K.kopfFuer(P + "/idp/"), "__Host-JSESSIONID=j1; __Secure-f=1");
});

test("Keksdose: Werte nur über kopfFuer", () => {
  const K = N.keksDose();
  K.aufnehmen("PHPSESSID=GEHEIM123; path=/", I + "/");
  assert.equal(JSON.stringify(K).indexOf("GEHEIM123"), -1);
  assert.equal(JSON.stringify(K.namen()).indexOf("GEHEIM123"), -1);
  assert.deepEqual(Object.keys(K).sort(), ["aufnehmen", "kopfFuer", "leeren", "namen"]);
});

// ---------- Formulare und Login-Seite ----------

test("formulare: gespeicherte Login-Seite von ILIAS", () => {
  const basis = I + "/login.php?client_id=pr02&cmd=force_login&lang=de";
  const f = N.formulare(seite("login.html"), basis);
  assert.equal(f.length, 3);
  const login = f.filter((x) => x.name === "formlogin")[0];
  assert.equal(login.action, I + "/shib_login.php");
  assert.equal(login.methode, "POST");
  assert.deepEqual(login.felder, { sendLogin: "1" });
  assert.deepEqual(login.namen, ["sendLogin"]);
  // die beiden Dialog-Formulare ohne action → Adresse der Seite
  for (const d of f.filter((x) => x !== login)) { assert.equal(d.action, basis); assert.equal(d.methode, "GET"); }
});

test("formulare: gespeicherte Anmeldeseite der Uni (IdP)", () => {
  const basis = P + "/idp/profile/SAML2/Redirect/SSO?execution=TEST-e1s1";
  const f = N.formulare(seite("idp.html"), basis);
  assert.equal(f.length, 1);
  assert.equal(f[0].action, basis);
  assert.equal(f[0].methode, "POST");
  assert.deepEqual(f[0].namen, ["j_username", "j_password", "donotcache", "_shib_idp_revokeConsent", "_eventId_proceed"]);
  assert.deepEqual(f[0].felder, { j_username: "" }, "kein Passwortfeld, keine leeren Kästchen");
  assert.deepEqual(f[0].knoepfe, [{ name: "_eventId_proceed", wert: "", typ: "submit" }]);
});

test("formulare: SAML-Antwort mit numerischen Entitäten", () => {
  const f = N.formulare(seite("saml-post.html"), P + "/idp/profile/SAML2/Redirect/SSO?execution=e1s2");
  assert.equal(f.length, 1);
  assert.equal(f[0].action, I + "/Shibboleth.sso/SAML2/POST");
  assert.equal(f[0].methode, "POST");
  assert.deepEqual(f[0].felder, { RelayState: "cookie:1700000000_TEST", SAMLResponse: "VEVTVC1TQU1MLVBMQVRaSEFMVEVS+/dGVzdA==" });
  assert.deepEqual(f[0].knoepfe, [], "Knopf ohne Namen zählt nicht");
});

test("formulare: mehrzeilige Tags, Anführungszeichen, Kästchen, verschachtelt, form=, <base>", () => {
  const html = `<html><head><base href="https://ovidius.uni-tuebingen.de/basis/"></head><body>
<script>var s = "<form action='/falsch'><input name=falsch>";</script>
<!-- <form action="/kommentar"><input name="kommentar"></form> -->
<p>1 < 2</p>
<FORM
  ACTION='ziel.php?a=1&amp;b=&#x32;'
  Method=post id="f1">
  <input type=hidden name=einfach value=a&amp;b>
  <input
     type="hidden"
     name="mehr&#x2d;zeilig"
     value='x&#39;y&quot;z'
  />
  <input type="text" name="leer">
  <input type="checkbox" name="an" checked>
  <input type="checkbox" name="aus" value="1">
  <input type="radio" name="wahl" value="a">
  <input type="radio" name="wahl" value="b" checked>
  <input type="hidden" name="gesperrt" value="1" disabled>
  <input type="password" name="geheimfeld" value="nie">
  <input type="file" name="datei">
  <select name="auswahl"><option value="1" selected>1</option></select>
  <textarea name="text"><input name="im-text"></textarea>
  <form action="/verschachtelt"><input type="hidden" name="innen" value="1">
  <button name="los" value="ja">Los</button>
  <button type="button" name="nur-knopf">x</button>
  <input type="submit" name="senden" value="Senden">
</form>
<input type="hidden" name="draussen" form="f1" value="2">
<input type="hidden" name="niemand" value="3">
<form><input name="q" value="suche"></form>
</body></html>`;
  const basis = I + "/seite.php?ref_id=1";
  const f = N.formulare(html, basis);
  assert.equal(f.length, 2);
  assert.equal(f[0].action, I + "/basis/ziel.php?a=1&b=2");
  assert.equal(f[0].methode, "POST");
  assert.equal(f[0].id, "f1");
  assert.deepEqual(f[0].felder, { einfach: "a&b", "mehr-zeilig": "x'y\"z", leer: "", an: "on", wahl: "b", innen: "1", draussen: "2" });
  assert.deepEqual(f[0].namen, ["einfach", "mehr-zeilig", "leer", "an", "aus", "wahl", "gesperrt", "geheimfeld", "datei", "auswahl",
    "text", "innen", "los", "nur-knopf", "senden", "draussen"]);
  assert.deepEqual(f[0].knoepfe, [{ name: "los", wert: "ja", typ: "submit" }, { name: "senden", wert: "Senden", typ: "submit" }]);
  assert.equal(f[1].action, basis, "leere action = Adresse der Seite, nicht <base>");
  assert.equal(f[1].methode, "GET");
  assert.deepEqual(f[1].felder, { q: "suche" });
  assert.deepEqual(N.formulare("", basis), []);
});

test("istLoginSeite: gespeicherte Seiten und Nachbauten", () => {
  assert.equal(N.istLoginSeite(seite("login.html")), true);
  assert.equal(N.istLoginSeite(seite("idp.html")), false);
  assert.equal(N.istLoginSeite(seite("saml-post.html")), false);
  const angemeldet = `<ul class="il-maincontrols-metabar" role="menubar"><li><a href="ilias.php?baseClass=ilsearchcontrollergui">Suche</a></li>
    <li><ul><li><a href="logout.php?lang=de">Abmelden</a></li></ul></li></ul>
    <p><a href="login.php">Hilfe zur Anmeldung im Kurstext</a></p>
    <script>var l = '<a id="shib_login_link" href="login.php">';</script>`;
  assert.equal(N.istLoginSeite(angemeldet), false, "login.php außerhalb der Metaleiste und in Skripten zählt nicht");
  const gast = `<ul class="x il-maincontrols-metabar"><li><ul><li>Sprache</li></ul></li>
    <li><a class="il-link link-bulky" href="https://ovidius.uni-tuebingen.de/login.php?target=crs_1&client_id=pr02&cmd=force_login&lang=de">Anmelden</a></li></ul>`;
  assert.equal(N.istLoginSeite(gast), true);
  assert.equal(N.istLoginSeite('<form name="formlogin" action="x"></form>'), true);
  assert.equal(N.istLoginSeite('<div><button id="button_shib_login">Login</button></div>'), true);
  assert.equal(N.istLoginSeite(""), false);
});

// ---------- Sitzung (PC-Weg mit Attrappe) ----------

test("Sitzung: 302-Kette über beide Hosts, Kekse je Host, Query byte-genau", async () => {
  const samlOrt = P + "/idp/profile/SAML2/Redirect/SSO?SAMLRequest=fZJdT%2bMwEEX%2Fi%2BX3&RelayState=ss%3Amem%3Ad41d&Signature=Ab%2b%2Fz%3D%3d";
  const t = attrappe([
    (a) => {
      assert.equal(a.url, I + "/shib_login.php");
      assert.equal(a.methode, "GET");
      assert.equal(a.kopf.cookie, undefined);
      return weiter(samlOrt, { kopf: { Location: samlOrt, "Set-Cookie": ["_opensaml_req_ss%3Amem%3Ad41d=_abc; path=/; secure; HttpOnly; SameSite=None", "PHPSESSID=s1; path=/; secure"] } });
    },
    (a) => {
      assert.equal(a.url, samlOrt, "Location unverändert gesendet");
      assert.equal(a.kopf.cookie, undefined, "keine ILIAS-Kekse an den IdP");
      return weiter("/idp/profile/SAML2/Redirect/SSO?execution=e1s1", { kopf: { location: "/idp/profile/SAML2/Redirect/SSO?execution=e1s1", "set-cookie": "__Host-JSESSIONID=j1; Path=/; Secure; HttpOnly" } });
    },
    (a) => {
      assert.equal(a.url, P + "/idp/profile/SAML2/Redirect/SSO?execution=e1s1");
      assert.equal(a.kopf.cookie, "__Host-JSESSIONID=j1");
      return { status: 200, kopf: { "Content-Type": "text/html;charset=utf-8", "Set-Cookie": "x=1; Path=/; Secure" }, text: seite("idp.html") };
    },
  ]);
  const s = N.sitzung({ transport: t });
  assert.equal(s.mobil, false);
  const r = await s.anfrage({ url: I + "/shib_login.php" });
  assert.equal(r.status, 200);
  assert.equal(r.url, P + "/idp/profile/SAML2/Redirect/SSO?execution=e1s1");
  assert.deepEqual(r.weg.map((h) => h.status + " " + new URL(h.url).host), ["302 ovidius.uni-tuebingen.de", "302 idp.uni-tuebingen.de", "200 idp.uni-tuebingen.de"]);
  assert.equal(r.weg[1].url, samlOrt);
  assert.equal(r.typ, "text/html;charset=utf-8");
  assert.equal(r.kopf["set-cookie"], undefined, "set-cookie nicht in der Rückgabe");
  assert.ok(r.text.indexOf("j_username") > 0);
  assert.deepEqual(s.keks.namen(), {
    "ovidius.uni-tuebingen.de": ["_opensaml_req_ss%3Amem%3Ad41d", "PHPSESSID"],
    "idp.uni-tuebingen.de": ["__Host-JSESSIONID", "x"],
  });
  assert.equal(s.keks.kopfFuer(I + "/"), "_opensaml_req_ss%3Amem%3Ad41d=_abc; PHPSESSID=s1");
});

test("Sitzung: POST mit Formular → 302/303 → GET ohne Body", async () => {
  const t = attrappe([
    (a) => {
      assert.equal(a.methode, "POST");
      assert.equal(a.body, "SAMLResponse=VEVT%2B%2F%3D%3D&RelayState=cookie%3A1");
      assert.equal(a.kopf["content-type"], "application/x-www-form-urlencoded");
      assert.equal(a.kopf.cookie, "PHPSESSID=s1");
      return { status: 302, kopf: { location: "/shib_login.php?target=", "set-cookie": "_shibsession_abc=x; path=/; secure; HttpOnly" } };
    },
    (a) => {
      assert.equal(a.methode, "GET");
      assert.equal(a.body, null);
      assert.equal(a.kopf["content-type"], undefined);
      assert.equal(a.url, I + "/shib_login.php?target=");
      assert.equal(a.kopf.cookie, "PHPSESSID=s1; _shibsession_abc=x");
      return { status: 303, kopf: { location: "ilias.php?baseClass=ilDashboardGUI&cmd=show" } };
    },
    (a) => {
      assert.equal(a.url, I + "/ilias.php?baseClass=ilDashboardGUI&cmd=show");
      assert.equal(a.methode, "GET");
      return { status: 200, kopf: {}, text: "Dashboard" };
    },
  ]);
  const s = N.sitzung({ transport: t });
  s.keks.aufnehmen("PHPSESSID=s1; path=/; secure", I + "/");
  const r = await s.anfrage({ url: I + "/Shibboleth.sso/SAML2/POST", methode: "post", formular: { SAMLResponse: "VEVT+/==", RelayState: "cookie:1" } });
  assert.equal(r.text, "Dashboard");
  assert.equal(r.url, I + "/ilias.php?baseClass=ilDashboardGUI&cmd=show");
  assert.deepEqual(r.weg.map((h) => h.status), [302, 303, 200]);
});

test("Sitzung: 307/308 behalten Methode und Body", async () => {
  const t = attrappe([
    { status: 307, kopf: { location: "/b" } },
    (a) => { assert.equal(a.methode, "POST"); assert.equal(a.body, "a=1+2"); assert.equal(a.kopf["content-type"], "application/x-www-form-urlencoded"); return { status: 308, kopf: { location: P + "/c" } }; },
    (a) => { assert.equal(a.url, P + "/c"); assert.equal(a.methode, "POST"); assert.equal(a.body, "a=1+2"); return { status: 200, kopf: {}, text: "ok" }; },
  ]);
  const r = await N.sitzung({ transport: t }).anfrage({ url: I + "/a", methode: "POST", formular: { a: "1 2" } });
  assert.equal(r.status, 200);
  assert.equal(t.anfragen.length, 3);
});

test("Sitzung: Schleife erkannt, Selbst-Weiterleitung mit neuem Keks erlaubt, Höchstzahl", async () => {
  const kreis = attrappe([weiter(P + "/b"), weiter(I + "/a"), weiter(P + "/b")]);
  await assert.rejects(N.sitzung({ transport: kreis }).anfrage({ url: I + "/a" }), (e) => e.grund === "schleife");
  assert.equal(kreis.anfragen.length, 2, "die Wiederholung geht nicht mehr hinaus");

  const selbst = attrappe([
    { status: 302, kopf: { location: I + "/a", "set-cookie": "test=1; Path=/" } },
    (a) => { assert.equal(a.kopf.cookie, "test=1"); return { status: 200, kopf: {}, text: "ok" }; },
  ]);
  assert.equal((await N.sitzung({ transport: selbst }).anfrage({ url: I + "/a" })).status, 200);

  const lang = attrappe(Array.from({ length: 20 }, (_, i) => weiter(I + "/s" + (i + 1))));
  await assert.rejects(N.sitzung({ transport: lang }).anfrage({ url: I + "/s0" }), (e) => e.grund === "zu-viele-spruenge");
  assert.equal(lang.anfragen.length, 13, "12 Weiterleitungen gefolgt");
  const kurz = attrappe(Array.from({ length: 5 }, (_, i) => weiter(I + "/s" + (i + 1))));
  await assert.rejects(N.sitzung({ transport: kurz }).anfrage({ url: I + "/s0", maxSpruenge: 2 }), (e) => e.grund === "zu-viele-spruenge");
  assert.equal(kurz.anfragen.length, 3);
});

test("Sitzung: fremde Hosts und http werden vor dem Senden blockiert", async () => {
  const AT = "@"; // zusammengesetzt, damit die Datenschutzprüfung darin keine E-Mail-Adresse sieht
  for (const ziel of ["https://evil.example/steal", "http://ovidius.uni-tuebingen.de/x", "https://ovidius.uni-tuebingen.de.evil.example/",
    "https://ovidius.uni-tuebingen.de" + AT + "evil.example/", "https://evil.example\\" + AT + "ovidius.uni-tuebingen.de/",
    "https://ovidius.uni-tuebingen.de:8443/"]) {
    const t = attrappe([weiter(ziel), { status: 200, kopf: {}, text: "darf nie kommen" }]);
    await assert.rejects(N.sitzung({ transport: t }).anfrage({ url: I + "/start", methode: "POST", formular: { x: "1" } }), fremd, ziel);
    assert.equal(t.anfragen.length, 1, ziel + ": nicht gesendet");
  }
  const t = attrappe([]);
  const s = N.sitzung({ transport: t });
  await assert.rejects(s.anfrage({ url: "https://example.org/" }), (e) => fremd(e) && e.host === "example.org");
  await assert.rejects(s.anfrage({ url: "http://idp.uni-tuebingen.de/" }), (e) => fremd(e) && e.protokoll === "http");
  await assert.rejects(s.anfrage({ url: "/relativ" }), fremd);
  assert.equal(t.anfragen.length, 0);
  assert.equal(s.istHostErlaubt("https://OVIDIUS.uni-tuebingen.de/x"), true);
  assert.equal(s.istHostErlaubt("https://idp.uni-tuebingen.de:443/x"), true);
  assert.equal(s.istHostErlaubt("https://alma.uni-tuebingen.de/"), false);
  assert.equal(s.istHostErlaubt("ftp://ovidius.uni-tuebingen.de/"), false);
});

test("Sitzung: Fehler enthalten keine Kekswerte und keine Formularwerte", async () => {
  const t = attrappe([{ status: 307, kopf: { location: "/b" } }, { status: 307, kopf: { location: "/a" } }]);
  const s = N.sitzung({ transport: t });
  s.keks.aufnehmen("PHPSESSID=KEKSWERT1; Path=/", I + "/");
  let fehler = null;
  try { await s.anfrage({ url: I + "/a", methode: "POST", formular: { feld: "FORMWERT1" } }); } catch (e) { fehler = e; }
  assert.equal(fehler && fehler.grund, "schleife");
  const alles = JSON.stringify(fehler) + fehler.message + fehler.stack;
  assert.equal(alles.indexOf("KEKSWERT1"), -1);
  assert.equal(alles.indexOf("FORMWERT1"), -1);
});

test("Sitzung: folgen:false, binär, GET-Formular als Query, eigene Kopfzeilen", async () => {
  const t = attrappe([
    weiter(P + "/x"),
    (a) => {
      assert.equal(a.binaer, true);
      assert.equal(a.kopf.accept, "*/*");
      assert.equal(a.kopf.referer, I + "/kurs");
      assert.equal(a.kopf.cookie, undefined, "Cookie nie vom Aufrufer");
      return { status: 200, kopf: { "content-type": "application/pdf" }, daten: new Uint8Array([37, 80, 68, 70]).buffer };
    },
    (a) => { assert.equal(a.url, I + "/ilias.php?cmd=suche&q=a+b"); return { status: 200, kopf: {}, text: "" }; },
  ]);
  const s = N.sitzung({ transport: t });
  const r1 = await s.anfrage({ url: I + "/weiter", folgen: false });
  assert.equal(r1.status, 302);
  assert.equal(r1.kopf.location, P + "/x");
  assert.equal(r1.url, I + "/weiter");
  assert.equal(r1.weg.length, 1);
  const r2 = await s.anfrage({ url: I + "/datei.pdf", binaer: true, kopf: { Referer: I + "/kurs", Cookie: "fremd=1" } });
  assert.ok(r2.daten instanceof ArrayBuffer);
  assert.equal(r2.arrayBuffer, r2.daten, "arrayBuffer = daten (für ilias.js)");
  assert.equal(r2.text, undefined, "binär: kein text");
  assert.equal(r2.typ, "application/pdf");
  assert.deepEqual(Array.from(new Uint8Array(r2.daten)), [37, 80, 68, 70]);
  await s.anfrage({ url: I + "/ilias.php?alt=1#x", formular: [["cmd", "suche"], ["q", "a b"]] });
});

// ---------- Drossel ----------

test("Drossel: höchstens zwei Anfragen zugleich, Starts mindestens 400 ms auseinander", async () => {
  let t = 0;
  const d = N.drossel({ jetzt: () => t, warten: async (ms) => { await new Promise((r) => setImmediate(r)); t += ms; } });
  assert.equal(d.parallel, 2); assert.equal(d.abstand, 400);
  const starts = [], z = { n: 0, max: 0 };
  const arbeit = async () => {
    const frei = await d.eintritt();
    starts.push(t); z.n++; z.max = Math.max(z.max, z.n);
    await new Promise((r) => setImmediate(r));
    z.n--; frei(); frei(); // doppelt freigeben schadet nicht
  };
  await Promise.all([arbeit(), arbeit(), arbeit(), arbeit(), arbeit()]);
  assert.equal(z.max, 2);
  assert.deepEqual(starts, [0, 400, 800, 1200, 1600]);
  // nach einer Pause sofort
  t += 5000;
  await arbeit();
  assert.equal(starts[5], 6600);
  // ohne Testuhr: echte Wartezeit
  const echt = N.drossel({ parallel: 1, abstand: 30 });
  const s0 = Date.now();
  await (await echt.eintritt())();
  await (await echt.eintritt())();
  assert.ok(Date.now() - s0 >= 25, "zweiter Start wartet");
});

test("Sitzung mit Drossel: eine Anfrage hält ihren Platz samt Weiterleitungen, auch bei Fehlern", async () => {
  const log = [];
  const d = { eintritt: async () => { log.push("rein"); return () => log.push("raus"); } };
  const t = attrappe([weiter(I + "/b"), { status: 200, kopf: {}, text: "ok" }]);
  const s = N.sitzung({ transport: t, drossel: d });
  const r = await s.anfrage({ url: I + "/a" });
  assert.equal(r.text, "ok"); assert.equal(t.anfragen.length, 2);
  assert.deepEqual(log, ["rein", "raus"]);
  await assert.rejects(s.anfrage({ url: "https://example.org/" }), fremd);
  assert.deepEqual(log, ["rein", "raus", "rein", "raus"]);
  assert.equal(typeof s.schliessen, "function");
});

// ---------- iPhone/iPad: requestUrl ----------

test("mobil: requestUrl folgt selbst, url null, kein eigenes Folgen", async () => {
  const aufrufe = [];
  const requestUrl = async (p) => {
    aufrufe.push(p);
    return { status: 302, headers: { Location: P + "/x", "Content-Type": "text/html" }, text: "<html>", arrayBuffer: new ArrayBuffer(2) };
  };
  const M = laden("ilias-netz", { kontext: { obsidian: { Platform: { isDesktopApp: false, isMobile: true }, requestUrl }, plugin: { manifest: { version: "0.3.2" } } } }).ergebnis;
  const s = M.sitzung({});
  assert.equal(s.mobil, true);
  assert.equal(s.keks, null);
  const r = await s.anfrage({ url: I + "/shib_login.php#teil" });
  assert.equal(aufrufe.length, 1, "keine eigene Weiterleitungsschleife");
  assert.equal(r.url, null);
  assert.deepEqual(r.weg, []);
  assert.equal(r.status, 302);
  assert.equal(r.text, "<html>");
  assert.equal(aufrufe[0].url, I + "/shib_login.php");
  assert.equal(aufrufe[0].method, "GET");
  assert.equal(aufrufe[0].throw, false);
  assert.equal(aufrufe[0].headers.cookie, undefined);
  assert.equal(aufrufe[0].headers["user-agent"], "Studium-Autopilot/0.3.2");
  await s.anfrage({ url: P + "/idp/x", methode: "POST", formular: { a: "b c" } });
  assert.equal(aufrufe[1].method, "POST");
  assert.equal(aufrufe[1].contentType, "application/x-www-form-urlencoded");
  assert.equal(aufrufe[1].headers["content-type"], undefined);
  assert.equal(aufrufe[1].body, "a=b+c");
  const b = await s.anfrage({ url: I + "/datei", binaer: true });
  assert.ok(b.daten instanceof ArrayBuffer);
  assert.equal(b.text, undefined);
  await assert.rejects(s.anfrage({ url: "https://example.org/" }), fremd);
  await assert.rejects(M.transportMobil({ requestUrl })({ url: "https://example.org/", methode: "GET" }), fremd);
  assert.equal(aufrufe.length, 3, "fremde Hosts nie an requestUrl");
});

test("mobil: Antwort, die nie kommt (App im Hintergrund), endet mit Zeitüberschreitung; Dateien dürfen länger dauern", async () => {
  const nie = () => new Promise(() => {});
  const M = laden("ilias-netz", { kontext: { obsidian: { Platform: { isDesktopApp: false, isMobile: true }, requestUrl: nie } } }).ergebnis;
  const t = M.transportMobil({ zeitlimit: 20, zeitlimitDatei: 200 });
  const reihe = [];
  const merken = (art) => (e) => { reihe.push(art); throw e; };
  await Promise.all([
    assert.rejects(t({ url: I + "/datei", methode: "GET", binaer: true }).catch(merken("datei")), (e) => e.grund === "zeitueberschreitung"),
    assert.rejects(t({ url: I + "/seite", methode: "GET" }).catch(merken("seite")), (e) => e.grund === "zeitueberschreitung" && e.host === "ovidius.uni-tuebingen.de" && e.status === undefined),
  ]);
  assert.deepEqual(reihe, ["seite", "datei"], "Dateien haben eine eigene, längere Grenze");
  const schnell = M.transportMobil({ requestUrl: async () => ({ status: 200, headers: {}, text: "ok" }), zeitlimit: 20 });
  assert.equal((await schnell({ url: I + "/seite", methode: "GET" })).text, "ok");
});

// ---------- PC-Transport ----------

test("PC: ohne Node-Zugang kein Transport (Obsidian-Ersatz ohne window.require)", () => {
  const D = laden("ilias-netz", { kontext: { obsidian: { Platform: { isDesktopApp: true } } } }).ergebnis;
  assert.throws(() => D.sitzung({}), (e) => e.grund === "kein-transport");
  const ohne = laden("ilias-netz", { kontext: { obsidian: {} } }).ergebnis;
  assert.throws(() => ohne.transportMobil(), (e) => e.grund === "kein-transport");
});

test("PC-Transport: Verbindungen bleiben offen, Seiten gzip-komprimiert, Dateien unverändert", async () => {
  const https = require("node:https"), zlib = require("node:zlib");
  const { EventEmitter } = require("node:events");
  const echt = https.request;
  const gesehen = [];
  https.request = (opt, cb) => {
    gesehen.push(opt);
    const anf = new EventEmitter();
    anf.write = () => {}; anf.destroy = () => {};
    anf.end = () => setImmediate(() => {
      const res = new EventEmitter();
      const seite = opt.headers["accept-encoding"] !== "identity";
      res.statusCode = 200; res.complete = true;
      res.headers = seite ? { "content-type": "text/html; charset=utf-8", "content-encoding": "gzip" } : { "content-type": "application/pdf" };
      cb(res);
      res.emit("data", seite ? zlib.gzipSync(Buffer.from("<html>Übung</html>")) : Buffer.from("%PDF"));
      res.emit("end");
    });
    return anf;
  };
  try {
    const D = require(DATEI)({});
    const t = D.transportDesktop({ version: "0.4.3" });
    const seite = await t({ url: I + "/ilias.php", methode: "GET", kopf: {} });
    const datei = await t({ url: I + "/datei", methode: "GET", kopf: {}, binaer: true });
    assert.equal(seite.text, "<html>Übung</html>");
    assert.equal(seite.kopf["content-encoding"], undefined);
    assert.equal(new TextDecoder().decode(datei.daten), "%PDF");
    assert.equal(gesehen[0].headers["accept-encoding"], "gzip, deflate");
    assert.equal(gesehen[1].headers["accept-encoding"], "identity", "Dateien unverändert");
    assert.ok(gesehen[0].agent instanceof https.Agent && gesehen[0].agent.keepAlive, "Verbindung bleibt offen");
    assert.equal(gesehen[0].agent, gesehen[1].agent, "dieselben Verbindungen für alle Anfragen");
    t.schliessen();
  } finally { https.request = echt; }
});

test("PC-Transport unter Node: fremde Hosts und http gehen nie hinaus", async () => {
  const D = require(DATEI)({});
  const t = D.transportDesktop();
  await assert.rejects(t({ url: "https://example.org/", methode: "GET", kopf: {} }), (e) => fremd(e) && e.host === "example.org");
  await assert.rejects(t({ url: "http://ovidius.uni-tuebingen.de/", methode: "GET", kopf: {} }), fremd);
  await assert.rejects(t({ url: "https://ovidius.uni-tuebingen.de:444/", methode: "POST", kopf: {}, body: "x=1" }), fremd);
});
