// Tests für die Anmeldung des Connectors per OAuth (server/mcp-oauth.mjs): der ganze Weg wie claude.ai ihn geht, mit den Helfern
// des offiziellen MCP-SDK (Erkennung, PKCE, Tausch, Erneuern; nur Entwicklung), und alles, was abgelehnt werden muss. Ohne Netz
// außer 127.0.0.1; die Uhr ist eingespielt.
const fs = require("node:fs");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const assert = require("node:assert/strict");

const SERVER = path.join(__dirname, "..", "server");
const da = fs.existsSync(path.join(SERVER, "mcp-oauth.mjs"));
const test = (name, f) => require("node:test")(name, { skip: !da && "server/mcp-oauth.mjs fehlt in diesem Baum" }, f);
const laden = (datei) => import(pathToFileURL(path.join(SERVER, datei)).href);

const CLIENT = "https://claude.ai/oauth/mcp-oauth-client-metadata";
const START = Date.parse("2026-11-04T09:00:00Z");

const freierPort = () => new Promise((ok) => {
  const s = net.createServer().listen(0, "127.0.0.1", () => {
    const { port } = s.address();
    s.close(() => ok(port));
  });
});

async function starten({ clientIds = [], token } = {}) {
  const { erzeugeMcp } = await laden("mcp.mjs");
  const { oauth, neuerCode, RUECKSPRUENGE } = await laden("mcp-oauth.mjs");
  const { tresorOrdner } = await laden("mcp-tresor.mjs");
  const wurzel = fs.mkdtempSync(path.join(os.tmpdir(), "studium-mcp-tresor-"));
  fs.mkdirSync(path.join(wurzel, "Eigenes"));
  fs.writeFileSync(path.join(wurzel, "Eigenes", "Notiz.md"), "Hallo\n");
  const zustand = fs.mkdtempSync(path.join(os.tmpdir(), "studium-mcp-zustand-"));
  const uhr = { t: START };
  const jetzt = () => new Date(uhr.t);
  const port = await freierPort();
  const adresse = `http://127.0.0.1:${port}`;
  const protokoll = [];
  const o = oauth({ adresse, verzeichnis: zustand, clientIds, jetzt, protokoll: (z) => protokoll.push(z) });
  const server = erzeugeMcp({ tresor: tresorOrdner(wurzel, { jetzt }), oauth: o, token, jetzt });
  await new Promise((r) => server.listen(port, "127.0.0.1", r));
  return { adresse, zustand, uhr, protokoll, RUECKSPRUNG: RUECKSPRUENGE[0], code: () => neuerCode(zustand, jetzt()).code,
    schliessen: () => new Promise((r) => server.close(r)) };
}

const formular = (werte) => ({ "content-type": "application/x-www-form-urlencoded", body: new URLSearchParams(werte).toString() });
const post = (url, werte, kopf = {}) => {
  const f = formular(werte);
  return fetch(url, { method: "POST", redirect: "manual", headers: { "content-type": f["content-type"], ...kopf }, body: f.body });
};

// Seite zum Anmelden öffnen: { status, sitzung, cookie, location, html, res }
async function oeffnen(url) {
  const res = await fetch(url, { redirect: "manual" });
  const html = res.status === 200 || res.status === 400 ? await res.text() : "";
  const sitzung = (/name="sitzung" value="([^"]+)"/.exec(html) || [])[1];
  const cookie = (res.headers.get("set-cookie") || "").split(";")[0];
  return { status: res.status, sitzung, cookie, location: res.headers.get("location"), html, res };
}

async function sdk() {
  const auth = await import("@modelcontextprotocol/sdk/client/auth.js");
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StreamableHTTPClientTransport } = await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
  return { ...auth, Client, StreamableHTTPClientTransport };
}

// Der Weg von claude.ai bis zu Tokens; liefert dazu, was die Tests weiter brauchen
async function anmelden(s, { state = "zustand-1", rueck = s.RUECKSPRUNG } = {}) {
  const k = await sdk();
  const metadata = await k.discoverAuthorizationServerMetadata(s.adresse);
  const { authorizationUrl, codeVerifier } = await k.startAuthorization(s.adresse, { metadata, clientInformation: { client_id: CLIENT },
    redirectUrl: rueck, scope: "lesen", state, resource: new URL(`${s.adresse}/mcp`) });
  const seite = await oeffnen(authorizationUrl);
  assert.equal(seite.status, 200, seite.html);
  const r = await post(`${s.adresse}/oauth/anmelden`, { sitzung: seite.sitzung, code: s.code() }, { cookie: seite.cookie });
  assert.equal(r.status, 302);
  const ziel = new URL(r.headers.get("location"));
  const tokens = await k.exchangeAuthorization(s.adresse, { metadata, clientInformation: { client_id: CLIENT }, authorizationCode: ziel.searchParams.get("code"),
    codeVerifier, redirectUri: rueck, resource: new URL(`${s.adresse}/mcp`) });
  return { k, metadata, tokens, ziel, seite };
}

// Bis zum Autorisierungscode, ohne Tausch: { code, verifier }
async function autorisieren(s, { rueck = s.RUECKSPRUNG } = {}) {
  const k = await sdk();
  const metadata = await k.discoverAuthorizationServerMetadata(s.adresse);
  const { authorizationUrl, codeVerifier } = await k.startAuthorization(s.adresse, { metadata, clientInformation: { client_id: CLIENT },
    redirectUrl: rueck, scope: "lesen", state: "x" });
  const seite = await oeffnen(authorizationUrl);
  const r = await post(`${s.adresse}/oauth/anmelden`, { sitzung: seite.sitzung, code: s.code() }, { cookie: seite.cookie });
  return { code: new URL(r.headers.get("location")).searchParams.get("code"), verifier: codeVerifier, location: r.headers.get("location") };
}

const erneuernVon = (s) => (r, mehr = {}) => post(`${s.adresse}/oauth/token`, { grant_type: "refresh_token", refresh_token: r, client_id: CLIENT, ...mehr });

const mcpAufruf = (s, zugriff, kopf = {}) => fetch(`${s.adresse}/mcp`, { method: "POST",
  headers: { "content-type": "application/json", ...(zugriff ? { authorization: `Bearer ${zugriff}` } : {}), ...kopf },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }) });

test("OAuth: nur Tokens dieser Anmeldung, nie ein festes; Origin nur https://claude.ai", async () => {
  const s = await starten();
  try {
    const fest = await mcpAufruf(s, "t".repeat(48));
    assert.equal(fest.status, 401, "ein festes Token wie im Tailnet gilt hier nicht");
    assert.match(fest.headers.get("www-authenticate"), /error="invalid_token"/);
    assert.equal((await fetch(`${s.adresse}/mcp`, { method: "POST", headers: { "content-type": "application/json", authorization: "Basic eDp5" }, body: "{}" })).status, 401);
    const { tokens } = await anmelden(s);
    assert.equal((await mcpAufruf(s, tokens.access_token, { origin: "https://claude.ai" })).status, 200);
    assert.equal((await mcpAufruf(s, tokens.access_token, { origin: "https://evil.example" })).status, 403);
    assert.equal((await mcpAufruf(s, tokens.access_token, { origin: "https://claude.ai.evil.example" })).status, 403);
    assert.equal((await fetch(`${s.adresse}/oauth/token`)).status, 405);
    assert.equal((await fetch(`${s.adresse}/.well-known/openid-configuration`)).status, 404);
    const klein = await fetch(`${s.adresse}/mcp`, { method: "POST", headers: { "content-type": "application/json", authorization: `bearer ${tokens.access_token}` },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" }) });
    assert.equal(klein.status, 200, "Schema Bearer in jeder Schreibweise");
    // Fremde Werte nur als JSON ins Journal: ein Zeilenumbruch schreibt keine eigene Zeile
    await oeffnen(`${s.adresse}/oauth/anmelden?` + new URLSearchParams({ client_id: "x\noauth: client_id gefälscht verbunden", redirect_uri: s.RUECKSPRUNG }));
    await oeffnen(`${s.adresse}/oauth/anmelden?` + new URLSearchParams({ response_type: "code", client_id: "https://claude.ai/anders", redirect_uri: s.RUECKSPRUNG,
      code_challenge: "a".repeat(43), code_challenge_method: "S256" }));
    assert.ok(s.protokoll.every((z) => !z.includes("\n")));
    assert.ok(s.protokoll.includes('oauth: client_id abgelehnt: "https://claude.ai/anders"'), "eine andere Adresse auf claude.ai lernt der Server nicht");
  } finally {
    await s.schliessen();
  }
});

test("OAuth: paralleles oder wiederholtes Erneuern beendet die Verbindung nicht", async () => {
  const s = await starten();
  try {
    const { tokens } = await anmelden(s);
    const erneuern = erneuernVon(s);
    const [a, b] = await Promise.all([erneuern(tokens.refresh_token), erneuern(tokens.refresh_token)]);
    assert.deepEqual([a.status, b.status], [200, 200]);
    const ta = await a.json(), tb = await b.json();
    assert.equal((await mcpAufruf(s, ta.access_token)).status, 200);
    assert.equal((await mcpAufruf(s, tb.access_token)).status, 200);
    // Der Client behält eines der beiden; später erneuert er damit, das andere war nie bei ihm
    s.uhr.t += 50 * 60e3;
    const c = await erneuern(ta.refresh_token);
    assert.equal(c.status, 200);
    const tc = await c.json();
    s.uhr.t += 61e3;
    const verwaist = await erneuern(tb.refresh_token);
    assert.equal((await verwaist.json()).error, "invalid_grant");
    assert.equal((await mcpAufruf(s, tc.access_token)).status, 401, "ein Geschwister des eingelösten Tokens gilt als gestohlen");
  } finally {
    await s.schliessen();
  }
});

test("OAuth: wer ein eben ersetztes Token hat, verdrängt die echte Verbindung nicht", async () => {
  const s = await starten();
  try {
    const { tokens } = await anmelden(s);
    const erneuern = erneuernVon(s);
    const echt = await (await erneuern(tokens.refresh_token)).json();
    // Jemand hat das eben eingelöste Token und spielt es immer wieder ein: höchstens zwei weitere Paare, beim dritten Mal endet die
    // Verbindung (auch für ihn)
    const geraubt = [];
    for (let i = 0; i < 2; i++) {
      const r = await erneuern(tokens.refresh_token);
      assert.equal(r.status, 200);
      geraubt.push(await r.json());
    }
    assert.equal((await erneuern(tokens.refresh_token)).status, 400);
    for (const p of [echt, ...geraubt]) assert.equal((await mcpAufruf(s, p.access_token)).status, 401);
    assert.equal((await (await erneuern(geraubt[1].refresh_token)).json()).error, "invalid_grant");
    assert.ok(s.protokoll.some((z) => /altes Erneuerungstoken wiederverwendet/.test(z)), "im Journal sichtbar");

    // Ein Token ohne Kennung einer Verbindung beendet nichts
    const neu = (await anmelden(s)).tokens;
    assert.match(neu.refresh_token, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/);
    for (const falsch of ["x", ".abc", `unbekannt.${"a".repeat(43)}`]) assert.equal((await erneuern(falsch)).status, 400);
    assert.equal((await mcpAufruf(s, neu.access_token)).status, 200);
    // Viele Erneuerungen hintereinander: ein Token von ganz früher wird trotzdem erkannt
    let p = neu;
    for (let i = 0; i < 30; i++) {
      s.uhr.t += 61e3;
      p = await (await erneuern(p.refresh_token)).json();
    }
    s.uhr.t += 61e3;
    assert.equal((await erneuern(neu.refresh_token)).status, 400);
    assert.equal((await mcpAufruf(s, p.access_token)).status, 401, "auch nach 30 Erneuerungen endet die Verbindung");
  } finally {
    await s.schliessen();
  }
});

test("OAuth: wer nur die Kennung einer Verbindung kennt, beendet sie nicht; ein ausgegebenes altes Token schon", async () => {
  const s = await starten();
  try {
    const { tokens } = await anmelden(s);
    const erneuern = erneuernVon(s);
    const id = tokens.refresh_token.split(".")[0];
    const datei = path.join(s.zustand, "oauth.json");
    const vorher = fs.readFileSync(datei, "utf8");
    // Die Kennung steht in server.json, im Eingang und im Journal: mit ihr und erfundenem Rest nur invalid_grant, nichts geändert
    for (const falsch of [`${id}.${"a".repeat(43)}`, `${id}.x`, `${id}.`]) {
      const r = await erneuern(falsch);
      assert.deepEqual([r.status, (await r.json()).error], [400, "invalid_grant"], falsch);
    }
    assert.equal(fs.readFileSync(datei, "utf8"), vorher, "oauth.json unverändert");
    assert.equal((await mcpAufruf(s, tokens.access_token)).status, 200);
    assert.ok(!s.protokoll.some((z) => /wiederverwendet/.test(z)));
    // Erneuern geht weiter; das eingelöste und danach ersetzte Token war ausgegeben: es beendet die Verbindung
    const p = await (await erneuern(tokens.refresh_token)).json();
    const p2 = await (await erneuern(p.refresh_token)).json();
    assert.equal((await mcpAufruf(s, p2.access_token)).status, 200);
    assert.equal((await erneuern(tokens.refresh_token)).status, 400);
    assert.equal((await mcpAufruf(s, p2.access_token)).status, 401, "ein ausgegebenes altes Token: gestohlen");
    const v = JSON.parse(fs.readFileSync(datei, "utf8")).verbindungen;
    assert.deepEqual(v, [], "Verbindung beendet");
  } finally {
    await s.schliessen();
  }
});

test("OAuth: oauth.json in der älteren Form führt nicht zu Fehlern", async () => {
  const s = await starten();
  try {
    fs.writeFileSync(path.join(s.zustand, "oauth.json"), JSON.stringify({ schema: 1, verbindungen: [{ id: "alt", client_id: CLIENT, umfang: "lesen",
      bis: START + 864e5, zugriff: [], erneuern: { hash: "a".repeat(64), ablauf: START + 864e5 }, verbraucht: ["b".repeat(64)] }] }));
    assert.equal((await post(`${s.adresse}/oauth/widerrufen`, { token: "x", client_id: CLIENT })).status, 200);
    assert.equal((await post(`${s.adresse}/oauth/token`, { grant_type: "refresh_token", refresh_token: "alt.x", client_id: CLIENT })).status, 400);
  } finally {
    await s.schliessen();
  }
});

test("OAuth: Erkennung, Anmeldung mit Code, Tausch mit PKCE, Werkzeuge und Erneuern wie mit dem offiziellen Client", async () => {
  const s = await starten();
  try {
    const k = await sdk();
    const ohne = await mcpAufruf(s);
    assert.equal(ohne.status, 401);
    const w = k.extractWWWAuthenticateParams(ohne);
    assert.equal(String(w.resourceMetadataUrl), `${s.adresse}/.well-known/oauth-protected-resource/mcp`);
    assert.equal(w.scope, "lesen");
    const prm = await k.discoverOAuthProtectedResourceMetadata(`${s.adresse}/mcp`);
    assert.equal(prm.resource, `${s.adresse}/mcp`, "resource genau die Adresse des Connectors");
    assert.deepEqual(prm.authorization_servers, [s.adresse]);
    const as = await k.discoverAuthorizationServerMetadata(s.adresse);
    assert.equal(as.client_id_metadata_document_supported, true, "sonst nimmt Claude DCR");
    assert.deepEqual(as.token_endpoint_auth_methods_supported, ["none"]);
    assert.deepEqual(as.code_challenge_methods_supported, ["S256"]);
    assert.equal(as.registration_endpoint, undefined, "kein /register");

    const { tokens, ziel, seite, metadata } = await anmelden(s);
    assert.equal(ziel.origin + ziel.pathname, s.RUECKSPRUNG);
    assert.equal(ziel.searchParams.get("state"), "zustand-1");
    assert.equal(ziel.searchParams.get("iss"), s.adresse);
    assert.match(seite.html, /nicht zu Anthropic/);
    assert.match(seite.html, /Hat dir jemand einen Link zu dieser Seite geschickt, gib nichts ein\./);
    assert.match(seite.res.headers.get("content-security-policy"), /frame-ancestors 'none'/);
    assert.equal(seite.res.headers.get("x-frame-options"), "DENY");
    assert.match(seite.res.headers.get("set-cookie"), /^__Host-sa-anmeldung=[^;]+; Path=\/; Secure; HttpOnly; SameSite=Strict/);
    assert.equal(tokens.token_type.toLowerCase(), "bearer");
    assert.equal(tokens.expires_in, 3600);
    assert.ok(tokens.refresh_token);

    const client = new k.Client({ name: "test", version: "1" });
    await client.connect(new k.StreamableHTTPClientTransport(new URL(`${s.adresse}/mcp`), { requestInit: { headers: { authorization: `Bearer ${tokens.access_token}` } } }));
    assert.equal((await client.listTools()).tools.length, 12);
    await client.close();

    const neu = await k.refreshAuthorization(s.adresse, { metadata, clientInformation: { client_id: CLIENT }, refreshToken: tokens.refresh_token, resource: new URL(`${s.adresse}/mcp`) });
    assert.notEqual(neu.refresh_token, tokens.refresh_token, "Erneuern tauscht das Erneuerungstoken aus");
    assert.equal((await mcpAufruf(s, neu.access_token)).status, 200);
    // Ist das neue eingelöst, ist das alte Erneuerungstoken gestohlen: die ganze Verbindung endet
    s.uhr.t += 61e3;
    const neuer = await k.refreshAuthorization(s.adresse, { metadata, clientInformation: { client_id: CLIENT }, refreshToken: neu.refresh_token, resource: new URL(`${s.adresse}/mcp`) });
    const r = await post(`${s.adresse}/oauth/token`, { grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: CLIENT });
    assert.equal(r.status, 400);
    assert.equal((await r.json()).error, "invalid_grant");
    assert.equal((await mcpAufruf(s, neuer.access_token)).status, 401);
    assert.ok(s.protokoll.some((z) => /altes Erneuerungstoken wiederverwendet/.test(z)));
  } finally {
    await s.schliessen();
  }
});

test("OAuth: falscher Client oder Rücksprung bekommt eine Fehlerseite, nie eine Weiterleitung", async () => {
  const s = await starten();
  try {
    const url = (werte) => `${s.adresse}/oauth/anmelden?` + new URLSearchParams({ response_type: "code", client_id: CLIENT, redirect_uri: s.RUECKSPRUNG,
      code_challenge: "a".repeat(43), code_challenge_method: "S256", state: "x", ...werte });
    // Ohne client_ids nur Claudes veröffentlichte Kennung, genau so (keine andere Adresse auf claude.ai, claude.com, anthropic.com)
    for (const client_id of ["https://evil.example/claude", "http://claude.ai/oauth/x", "https://claude.ai.evil.example/x", "https://claude.ai:8443/x",
      Object.assign(new URL("https://claude.ai/x"), { username: "nutzer" }).href, "", "https://claude.ai/anders", "https://claude.com/oauth/mcp-oauth-client-metadata",
      "https://anthropic.com/x", `${CLIENT}/`, `${CLIENT}?x=1`, CLIENT.toUpperCase()]) {
      const r = await oeffnen(url({ client_id }));
      assert.equal(r.status, 400, client_id);
      assert.equal(r.location, null, client_id);
    }
    for (const redirect_uri of ["https://evil.example/cb", `${s.RUECKSPRUNG}/`, `${s.RUECKSPRUNG}?x=1`, "http://localhost:3118/callback",
      "http://127.0.0.1:3118/callback", "https://claude.ai/api/mcp/auth_callback#x", "https://claude.com/api/mcp/auth_callback/",
      "http://claude.com/api/mcp/auth_callback", "https://www.claude.com/api/mcp/auth_callback", "https://anthropic.com/api/mcp/auth_callback",
      "https://claude.com/api/mcp/auth_callback?x=1", "https://CLAUDE.com/api/mcp/auth_callback"]) {
      const r = await oeffnen(url({ redirect_uri }));
      assert.equal(r.status, 400, redirect_uri);
      assert.equal(r.location, null, redirect_uri);
    }
    const fehler = async (werte) => new URL((await oeffnen(url(werte))).location).searchParams.get("error");
    assert.equal(await fehler({ code_challenge_method: "plain" }), "invalid_request");
    assert.equal(await fehler({ code_challenge: "" }), "invalid_request");
    assert.equal(await fehler({ response_type: "token" }), "unsupported_response_type");
    assert.equal(await fehler({ scope: "lesen schreiben" }), "invalid_scope");
    assert.equal(await fehler({ resource: "https://evil.example/mcp" }), "invalid_target");
  } finally {
    await s.schliessen();
  }

  const fest = await starten({ clientIds: ["https://claude.ai/fest"] });
  try {
    const r = await oeffnen(`${fest.adresse}/oauth/anmelden?` + new URLSearchParams({ response_type: "code", client_id: CLIENT, redirect_uri: fest.RUECKSPRUNG,
      code_challenge: "a".repeat(43), code_challenge_method: "S256" }));
    assert.equal(r.status, 400, "eingetragen: nur genau diese Kennung");
    const eigene = await oeffnen(`${fest.adresse}/oauth/anmelden?` + new URLSearchParams({ response_type: "code", client_id: "https://claude.ai/fest",
      redirect_uri: fest.RUECKSPRUNG, code_challenge: "a".repeat(43), code_challenge_method: "S256" }));
    assert.equal(eigene.status, 200, "die eingetragene ersetzt Claudes Kennung");
  } finally {
    await fest.schliessen();
  }
});

test("OAuth: Code nur mit dem Cookie dieser Anmeldung, höchstens 5 Versuche, einmal, 10 Minuten", async () => {
  const s = await starten();
  try {
    const k = await sdk();
    const metadata = await k.discoverAuthorizationServerMetadata(s.adresse);
    const neueSeite = async () => oeffnen((await k.startAuthorization(s.adresse, { metadata, clientInformation: { client_id: CLIENT }, redirectUrl: s.RUECKSPRUNG,
      scope: "lesen", state: "x" })).authorizationUrl);
    const a = await neueSeite(), b = await neueSeite();
    const code = s.code();
    assert.equal((await post(`${s.adresse}/oauth/anmelden`, { sitzung: a.sitzung, code })).status, 400, "ohne Cookie");
    assert.equal((await post(`${s.adresse}/oauth/anmelden`, { sitzung: a.sitzung, code }, { cookie: b.cookie })).status, 400, "Cookie einer anderen Anmeldung");
    for (let i = 1; i <= 4; i++) {
      const r = await post(`${s.adresse}/oauth/anmelden`, { sitzung: a.sitzung, code: "AAAAA-AAAAA" }, { cookie: a.cookie });
      assert.match(await r.text(), new RegExp(`Noch ${5 - i} Versuche`));
    }
    const fuenfter = await post(`${s.adresse}/oauth/anmelden`, { sitzung: a.sitzung, code: "AAAAA-AAAAA" }, { cookie: a.cookie });
    assert.equal(fuenfter.status, 400);
    assert.equal((await post(`${s.adresse}/oauth/anmelden`, { sitzung: a.sitzung, code }, { cookie: a.cookie })).status, 400, "Anmeldung danach vorbei");

    assert.equal((await post(`${s.adresse}/oauth/anmelden`, { sitzung: b.sitzung, code }, { cookie: b.cookie })).status, 302);
    const c = await neueSeite();
    assert.match(await (await post(`${s.adresse}/oauth/anmelden`, { sitzung: c.sitzung, code }, { cookie: c.cookie })).text(), /stimmt nicht/, "Code nur einmal");

    const spaet = s.code();
    s.uhr.t += 11 * 60e3;
    const d = await neueSeite();
    assert.match(await (await post(`${s.adresse}/oauth/anmelden`, { sitzung: d.sitzung, code: spaet }, { cookie: d.cookie })).text(), /stimmt nicht/, "abgelaufen");
    assert.match(d.res.headers.get("content-security-policy"), /form-action 'self' https:\/\/claude\.ai https:\/\/claude\.com;/);
  } finally {
    await s.schliessen();
  }
});

test("OAuth: Tausch nur einmal, nur 60 s, nur mit passendem PKCE, Rücksprung, Client und Ziel", async () => {
  const s = await starten();
  try {
    const k = await sdk();
    const metadata = await k.discoverAuthorizationServerMetadata(s.adresse);
    const autorisierung = async () => {
      const { authorizationUrl, codeVerifier } = await k.startAuthorization(s.adresse, { metadata, clientInformation: { client_id: CLIENT },
        redirectUrl: s.RUECKSPRUNG, scope: "lesen", state: "x" });
      const seite = await oeffnen(authorizationUrl);
      const r = await post(`${s.adresse}/oauth/anmelden`, { sitzung: seite.sitzung, code: s.code() }, { cookie: seite.cookie });
      return { code: new URL(r.headers.get("location")).searchParams.get("code"), verifier: codeVerifier };
    };
    const tausch = (werte) => post(`${s.adresse}/oauth/token`, { grant_type: "authorization_code", client_id: CLIENT, redirect_uri: s.RUECKSPRUNG, ...werte });
    const fehler = async (r) => [r.status, (await r.json()).error];

    let a = await autorisierung();
    assert.deepEqual(await fehler(await tausch({ code: a.code, code_verifier: "x".repeat(43) })), [400, "invalid_grant"], "falscher Verifier");
    assert.deepEqual(await fehler(await tausch({ code: a.code, code_verifier: a.verifier })), [400, "invalid_grant"], "nach einem Fehlversuch verbraucht");
    a = await autorisierung();
    assert.deepEqual(await fehler(await tausch({ code: a.code, code_verifier: a.verifier, redirect_uri: "https://evil.example/cb" })), [400, "invalid_grant"]);
    a = await autorisierung();
    assert.deepEqual(await fehler(await tausch({ code: a.code, code_verifier: a.verifier, client_id: "https://evil.example/c" })), [401, "invalid_client"]);
    a = await autorisierung();
    assert.deepEqual(await fehler(await tausch({ code: a.code, code_verifier: a.verifier, resource: "https://evil.example/mcp" })), [400, "invalid_target"]);
    a = await autorisierung();
    s.uhr.t += 61e3;
    assert.deepEqual(await fehler(await tausch({ code: a.code, code_verifier: a.verifier })), [400, "invalid_grant"], "nach 60 s");
    a = await autorisierung();
    const ok = await tausch({ code: a.code, code_verifier: a.verifier, resource: `${s.adresse}/mcp` });
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get("cache-control"), "no-store");
    assert.deepEqual(await fehler(await tausch({ code: a.code, code_verifier: a.verifier })), [400, "invalid_grant"], "zweimal");
    assert.deepEqual(await fehler(await post(`${s.adresse}/oauth/token`, { grant_type: "password", client_id: CLIENT })), [400, "unsupported_grant_type"]);
    const alsJson = await fetch(`${s.adresse}/oauth/token`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(alsJson.status, 415);
    a = await autorisierung();
    const ohneRueck = await post(`${s.adresse}/oauth/token`, { grant_type: "authorization_code", client_id: CLIENT, code: a.code, code_verifier: a.verifier });
    assert.equal(ohneRueck.status, 200, "redirect_uri darf beim Tausch fehlen (OAuth 2.1), der Code ist an den einen Rücksprung gebunden");
    // Kein Zähler, der alle aussperrt: viele falsche Anfragen, das echte Erneuern geht weiter
    for (let i = 0; i < 60; i++) await post(`${s.adresse}/oauth/token`, { grant_type: "refresh_token", refresh_token: "x", client_id: "https://evil.example/c" });
    const echt = await post(`${s.adresse}/oauth/token`, { grant_type: "refresh_token", refresh_token: (await ohneRueck.json()).refresh_token, client_id: CLIENT });
    assert.equal(echt.status, 200);
  } finally {
    await s.schliessen();
  }
});

test("OAuth: Fristen der Tokens, eine Verbindung ersetzt die vorige, Trennen und Widerrufen", async () => {
  const { verbindungen, trennen } = await laden("mcp-oauth.mjs");
  const s = await starten();
  try {
    const { tokens: erste, metadata } = await anmelden(s);
    s.uhr.t += 3601e3;
    const abgelaufen = await mcpAufruf(s, erste.access_token);
    assert.equal(abgelaufen.status, 401);
    assert.match(abgelaufen.headers.get("www-authenticate"), /error="invalid_token"/);
    const k = await sdk();
    const neu = await k.refreshAuthorization(s.adresse, { metadata, clientInformation: { client_id: CLIENT }, refreshToken: erste.refresh_token });
    assert.equal((await mcpAufruf(s, neu.access_token)).status, 200);

    const zweite = (await anmelden(s)).tokens;
    assert.equal((await mcpAufruf(s, neu.access_token)).status, 401, "eine Verbindung: die neue ersetzt die alte");
    assert.equal((await mcpAufruf(s, zweite.access_token)).status, 200);
    assert.equal(verbindungen(s.zustand).length, 1);
    const frueher = () => JSON.parse(fs.readFileSync(path.join(s.zustand, "oauth.json"), "utf8")).frueher.map((f) => f.grund);
    assert.deepEqual(frueher(), ["ersetzt"], "die beendete bleibt 30 Tage in oauth.json");

    s.uhr.t += 31 * 864e5;
    const ruhend = await post(`${s.adresse}/oauth/token`, { grant_type: "refresh_token", refresh_token: zweite.refresh_token, client_id: CLIENT });
    assert.equal((await ruhend.json()).error, "invalid_grant", "30 Tage nicht benutzt");

    const dritte = (await anmelden(s)).tokens;
    assert.equal(trennen(s.zustand, "alle", new Date(s.uhr.t)), 1);
    assert.equal((await mcpAufruf(s, dritte.access_token)).status, 401, "Trennen auf der Kommandozeile wirkt sofort");
    assert.equal(frueher()[0], "getrennt");

    const vierte = (await anmelden(s)).tokens;
    assert.equal((await post(`${s.adresse}/oauth/widerrufen`, { token: vierte.refresh_token, client_id: CLIENT })).status, 200);
    assert.equal((await mcpAufruf(s, vierte.access_token)).status, 401);
    // Mit Grund und ohne Tokens, die neueste zuerst; die erste (vor 31 Tagen ersetzt) ist weg
    const liste = JSON.parse(fs.readFileSync(path.join(s.zustand, "oauth.json"), "utf8")).frueher;
    assert.deepEqual(liste.map((f) => f.grund), ["widerrufen", "getrennt", "ersetzt"]);
    assert.ok(liste.every((f) => Object.keys(f).sort().join() === "client_id,ende,grund,id,seit"), JSON.stringify(liste));
  } finally {
    await s.schliessen();
  }
});

test("OAuth: höchstens 90 Tage, Aufrufe je Verbindung begrenzt, nie zugleich mit festem Token", async () => {
  const { erzeugeMcp } = await laden("mcp.mjs");
  const { oauth, GRENZEN } = await laden("mcp-oauth.mjs");
  assert.throws(() => erzeugeMcp({ tresor: {}, token: "t".repeat(40), oauth: oauth({ adresse: "https://x.test", verzeichnis: os.tmpdir() }) }), /nie beides/);
  const s = await starten();
  try {
    const k = await sdk();
    let { tokens: t, metadata } = await anmelden(s);
    for (let i = 0; i < 3; i++) {
      s.uhr.t += 25 * 864e5;
      t = await k.refreshAuthorization(s.adresse, { metadata, clientInformation: { client_id: CLIENT }, refreshToken: t.refresh_token });
    }
    s.uhr.t += 25 * 864e5;
    const r = await post(`${s.adresse}/oauth/token`, { grant_type: "refresh_token", refresh_token: t.refresh_token, client_id: CLIENT });
    assert.equal((await r.json()).error, "invalid_grant", "nach 90 Tagen neu anmelden");

    const frisch = (await anmelden(s)).tokens;
    let letzte;
    for (let i = 0; i <= GRENZEN.jeFenster; i++) letzte = await mcpAufruf(s, frisch.access_token);
    assert.equal(letzte.status, 429);
    s.uhr.t += GRENZEN.fenster + 1;
    assert.equal((await mcpAufruf(s, frisch.access_token)).status, 200);
  } finally {
    await s.schliessen();
  }
});

test("OAuth: Einmal-Code der Kommandozeile hat die Form ABCDE-FGHJK, nur einer offen", async () => {
  const { neuerCode, codeEinloesen } = await laden("mcp-oauth.mjs");
  const v = fs.mkdtempSync(path.join(os.tmpdir(), "studium-mcp-code-"));
  const a = neuerCode(v), b = neuerCode(v);
  assert.match(a.code, /^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
  assert.equal(codeEinloesen(v, a.code), false, "ein neuer Code löscht den vorigen");
  assert.equal(codeEinloesen(v, b.code.toLowerCase().replace("-", " ")), true, "Schreibweise egal");
  assert.equal(codeEinloesen(v, b.code), false);
  assert.equal(fs.readdirSync(path.join(v, "codes")).length, 0);
});

test("OAuth: auch der Rücksprung auf claude.com, zurück immer zu dem der Anfrage", async () => {
  const { RUECKSPRUENGE } = await laden("mcp-oauth.mjs");
  assert.deepEqual(RUECKSPRUENGE, ["https://claude.ai/api/mcp/auth_callback", "https://claude.com/api/mcp/auth_callback"]);
  const s = await starten();
  try {
    const { tokens, ziel } = await anmelden(s, { rueck: RUECKSPRUENGE[1] });
    assert.equal(ziel.origin + ziel.pathname, RUECKSPRUENGE[1]);
    assert.equal(ziel.searchParams.get("iss"), s.adresse);
    assert.equal((await mcpAufruf(s, tokens.access_token)).status, 200);
    const fehler = new URL((await oeffnen(`${s.adresse}/oauth/anmelden?` + new URLSearchParams({ response_type: "token", client_id: CLIENT,
      redirect_uri: RUECKSPRUENGE[1] }))).location);
    assert.equal(fehler.origin + fehler.pathname, RUECKSPRUENGE[1], "auch Fehler gehen dorthin zurück");
    assert.equal(fehler.searchParams.get("error"), "unsupported_response_type");
    // Der Autorisierungscode gehört zum Rücksprung seiner Anmeldung
    const a = await autorisieren(s, { rueck: RUECKSPRUENGE[1] });
    assert.ok(a.location.startsWith(`${RUECKSPRUENGE[1]}?`));
    const r = await post(`${s.adresse}/oauth/token`, { grant_type: "authorization_code", client_id: CLIENT, code: a.code, code_verifier: a.verifier,
      redirect_uri: RUECKSPRUENGE[0] });
    assert.equal((await r.json()).error, "invalid_grant");
  } finally {
    await s.schliessen();
  }
});

test("OAuth: eine verlorene Antwort beim Erneuern beendet die Verbindung nicht, auch Minuten später", async () => {
  const s = await starten();
  try {
    const { tokens } = await anmelden(s);
    const erneuern = erneuernVon(s);
    assert.equal((await erneuern(tokens.refresh_token)).status, 200); // die Antwort kommt nie bei claude.ai an
    s.uhr.t += 10 * 60e3;
    const wieder = await erneuern(tokens.refresh_token);
    assert.equal(wieder.status, 200, "10 Minuten später mit demselben Token");
    const p = await wieder.json();
    assert.equal((await mcpAufruf(s, p.access_token)).status, 200);
    s.uhr.t += 50 * 60e3;
    const p2 = await (await erneuern(p.refresh_token)).json();
    assert.equal((await mcpAufruf(s, p2.access_token)).status, 200);
    // Ist das neue eingelöst, gilt das alte nicht mehr: es beendet die Verbindung
    s.uhr.t += 60e3;
    assert.equal((await (await erneuern(tokens.refresh_token)).json()).error, "invalid_grant");
    assert.equal((await mcpAufruf(s, p2.access_token)).status, 401);
    assert.equal((await erneuern(p2.refresh_token)).status, 400);
  } finally {
    await s.schliessen();
  }
});

test("OAuth: eine kaputte oauth.json wird nie überschrieben", async () => {
  const { trennen, verbindungen } = await laden("mcp-oauth.mjs");
  const s = await starten();
  try {
    const { tokens } = await anmelden(s);
    const datei = path.join(s.zustand, "oauth.json");
    const gut = fs.readFileSync(datei, "utf8"), kaputt = gut.slice(0, 40);
    fs.writeFileSync(datei, kaputt);
    assert.equal((await mcpAufruf(s, tokens.access_token)).status, 200, "die zuletzt gelesenen Verbindungen gelten weiter");
    const r = await erneuernVon(s)(tokens.refresh_token);
    assert.equal(r.status, 503);
    assert.equal((await r.json()).error, "temporarily_unavailable");
    const a = await autorisieren(s);
    const tausch = await post(`${s.adresse}/oauth/token`, { grant_type: "authorization_code", client_id: CLIENT, code: a.code, code_verifier: a.verifier });
    assert.equal(tausch.status, 503, "auch keine neue Verbindung");
    assert.equal((await post(`${s.adresse}/oauth/widerrufen`, { token: tokens.refresh_token })).status, 503);
    assert.throws(() => trennen(s.zustand, "alle"), /lässt sich nicht lesen/);
    assert.throws(() => verbindungen(s.zustand), /lässt sich nicht lesen/);
    assert.equal(fs.readFileSync(datei, "utf8"), kaputt, "nichts überschrieben");
    assert.equal(s.protokoll.filter((z) => z.startsWith("oauth: FEHLER: oauth.json lässt sich nicht lesen") && /zuletzt gelesenen/.test(z)).length, 1,
      "laut im Journal, einmal je Fassung der Datei");

    fs.writeFileSync(datei, gut);
    assert.equal((await erneuernVon(s)(tokens.refresh_token)).status, 200, "repariert: weiter wie vorher");
    assert.ok(s.protokoll.includes("oauth: oauth.json ist wieder lesbar"));
    assert.ok(!fs.readdirSync(s.zustand).some((n) => n.endsWith(".tmp")), "keine Hilfsdatei bleibt liegen");
  } finally {
    await s.schliessen();
  }

  // Start mit kaputter Datei: keine Daten im Speicher, also auch keine Tokens, statt „keine Verbindungen“ zu schreiben
  const neu = await starten();
  try {
    const datei = path.join(neu.zustand, "oauth.json");
    fs.writeFileSync(datei, "");
    const a = await autorisieren(neu);
    const r = await post(`${neu.adresse}/oauth/token`, { grant_type: "authorization_code", client_id: CLIENT, code: a.code, code_verifier: a.verifier });
    assert.equal(r.status, 503);
    assert.equal(fs.readFileSync(datei, "utf8"), "");
    assert.ok(neu.protokoll.some((z) => z.startsWith("oauth: FEHLER: oauth.json lässt sich nicht lesen") && /keine Tokens/.test(z)));
  } finally {
    await neu.schliessen();
  }
});

test("OAuth: viele falsche Codes sperren das Verbinden nicht für alle", async () => {
  const { GRENZEN } = await laden("mcp-oauth.mjs");
  assert.deepEqual(Object.keys(GRENZEN).sort(), ["anmeldungen", "fenster", "jeFenster", "jeTag", "versuche"]);
  const s = await starten();
  try {
    const seite = () => oeffnen(`${s.adresse}/oauth/anmelden?` + new URLSearchParams({ response_type: "code", client_id: CLIENT, redirect_uri: s.RUECKSPRUNG,
      code_challenge: "a".repeat(43), code_challenge_method: "S256", state: "x" }));
    for (let i = 0; i < 21; i++) {
      const a = await seite();
      for (let j = 0; j < GRENZEN.versuche; j++) await (await post(`${s.adresse}/oauth/anmelden`, { sitzung: a.sitzung, code: "AAAAA-AAAAA" }, { cookie: a.cookie })).text();
    }
    const b = await seite();
    const r = await post(`${s.adresse}/oauth/anmelden`, { sitzung: b.sitzung, code: s.code() }, { cookie: b.cookie });
    assert.equal(r.status, 302, "105 falsche Codes in einer Stunde, der richtige gilt trotzdem");
  } finally {
    await s.schliessen();
  }
});

test("OAuth: die Anmeldung steht im signierten Cookie; viele Aufrufe der Anmeldeseite verdrängen keine offene", async () => {
  const { GRENZEN } = await laden("mcp-oauth.mjs");
  const s = await starten(), anderer = await starten();
  const grenze = GRENZEN.anmeldungen;
  try {
    const url = (a) => `${a.adresse}/oauth/anmelden?` + new URLSearchParams({ response_type: "code", client_id: CLIENT, redirect_uri: a.RUECKSPRUNG,
      code_challenge: "a".repeat(43), code_challenge_method: "S256", state: "student" });
    const eigene = await oeffnen(url(s));
    // Jemand ruft die Seite sehr oft auf (früher wich die älteste von höchstens 50 offenen Anmeldungen) und gibt in vielen davon
    // falsche Codes ein (mitgezählt werden höchstens GRENZEN.anmeldungen; hier klein)
    GRENZEN.anmeldungen = 3;
    for (let i = 0; i < 120; i++) assert.equal((await oeffnen(url(s))).status, 200);
    for (let i = 0; i < 6; i++) {
      const fremd = await oeffnen(url(s));
      await (await post(`${s.adresse}/oauth/anmelden`, { sitzung: fremd.sitzung, code: "AAAAA-AAAAA" }, { cookie: fremd.cookie })).text();
    }
    // Geändertes Cookie, Cookie eines anderen Servers, abgelaufen: abgelehnt
    const [name, wert] = eigene.cookie.split("=");
    const geaendert = `${name}=${(wert[0] === "e" ? "f" : "e") + wert.slice(1)}`;
    const nein = /abgelaufen oder gehört zu einem anderen Browser/;
    assert.match(await (await post(`${s.adresse}/oauth/anmelden`, { sitzung: eigene.sitzung, code: "AAAAA-AAAAA" }, { cookie: geaendert })).text(), nein);
    const dort = await oeffnen(url(anderer));
    assert.match(await (await post(`${s.adresse}/oauth/anmelden`, { sitzung: dort.sitzung, code: s.code() }, { cookie: dort.cookie })).text(), nein,
      "Cookie eines anderen Servers");
    const spaet = await oeffnen(url(s));
    s.uhr.t += 10 * 60e3 + 1;
    assert.match(await (await post(`${s.adresse}/oauth/anmelden`, { sitzung: spaet.sitzung, code: s.code() }, { cookie: spaet.cookie })).text(), nein,
      "nach 10 Minuten");
    s.uhr.t -= 10 * 60e3 + 1;
    // Die eigene Anmeldung gilt trotzdem, zurück mit ihrem state; danach ist sie vorbei, auch mit einem neuen Code
    const r = await post(`${s.adresse}/oauth/anmelden`, { sitzung: eigene.sitzung, code: s.code() }, { cookie: eigene.cookie });
    assert.equal(r.status, 302);
    assert.equal(new URL(r.headers.get("location")).searchParams.get("state"), "student");
    assert.match(await (await post(`${s.adresse}/oauth/anmelden`, { sitzung: eigene.sitzung, code: s.code() }, { cookie: eigene.cookie })).text(), nein);
  } finally {
    GRENZEN.anmeldungen = grenze;
    await s.schliessen();
    await anderer.schliessen();
  }
});

test("OAuth: ein Zugriffstoken gilt nie länger als seine Verbindung", async () => {
  const s = await starten();
  try {
    const k = await sdk();
    let { tokens: t, metadata } = await anmelden(s);
    for (let i = 0; i < 3; i++) {
      s.uhr.t += 25 * 864e5;
      t = await k.refreshAuthorization(s.adresse, { metadata, clientInformation: { client_id: CLIENT }, refreshToken: t.refresh_token });
    }
    const ende = START + 90 * 864e5;
    s.uhr.t = ende - 30 * 60e3;
    const halb = await (await erneuernVon(s)(t.refresh_token)).json();
    assert.equal(halb.expires_in, 1800);
    const v = JSON.parse(fs.readFileSync(path.join(s.zustand, "oauth.json"), "utf8")).verbindungen[0];
    assert.equal(v.bis, ende);
    assert.equal(v.zugriff.at(-1).ablauf, ende);
    s.uhr.t = ende - 500;
    const knapp = await (await erneuernVon(s)(halb.refresh_token)).json();
    assert.equal(knapp.expires_in, 1, "ganze Sekunden, mindestens 1");
    assert.equal((await mcpAufruf(s, knapp.access_token)).status, 200);
    s.uhr.t = ende;
    assert.equal((await mcpAufruf(s, knapp.access_token)).status, 401);
  } finally {
    await s.schliessen();
  }
});

test("OAuth: resource in Schema und Host in beliebiger Schreibweise, der Pfad genau", async () => {
  const { oauth, RUECKSPRUENGE } = await laden("mcp-oauth.mjs");
  const o = oauth({ adresse: "https://Studium.Example", verzeichnis: fs.mkdtempSync(path.join(os.tmpdir(), "studium-mcp-zustand-")) });
  const ziel = async (resource) => {
    const res = { writeHead(status, kopf) { this.status = status; this.kopf = kopf; }, end() {} };
    const url = "/oauth/anmelden?" + new URLSearchParams({ response_type: "code", client_id: CLIENT, redirect_uri: RUECKSPRUENGE[0], code_challenge: "a".repeat(43),
      code_challenge_method: "S256", resource });
    await o.routen({ method: "GET", url, headers: {} }, res, "/oauth/anmelden");
    return res.status === 302 ? new URL(res.kopf.location).searchParams.get("error") : res.status;
  };
  for (const r of ["https://studium.example/mcp", "HTTPS://STUDIUM.EXAMPLE/mcp", "https://Studium.Example/mcp"]) assert.equal(await ziel(r), 200, r);
  for (const r of ["https://studium.example/MCP", "https://studium.example/mcp/", "https://studium.example:443/mcp", "https://studium.example/mcp?x=1",
    "http://studium.example/mcp", "https://evil.example/mcp", "https://studium.example.evil/mcp"]) assert.equal(await ziel(r), "invalid_target", r);

  const s = await starten();
  try {
    const gross = s.adresse.replace("http", "HTTP");
    const a = await autorisieren(s);
    const tausch = await post(`${s.adresse}/oauth/token`, { grant_type: "authorization_code", client_id: CLIENT, code: a.code, code_verifier: a.verifier,
      resource: `${gross}/mcp` });
    assert.equal(tausch.status, 200);
    const { refresh_token } = await tausch.json();
    assert.equal((await (await erneuernVon(s)(refresh_token, { resource: `${gross}/MCP` })).json()).error, "invalid_target");
    assert.equal((await erneuernVon(s)(refresh_token, { resource: `${gross}/mcp` })).status, 200);
  } finally {
    await s.schliessen();
  }
});

test("OAuth: Kommandozeile und Dienst schreiben oauth.json nur unter einer Sperre", async () => {
  const { trennen, verbindungen, SPERRE } = await laden("mcp-oauth.mjs");
  const { execFile } = require("node:child_process");
  const s = await starten();
  const warten = SPERRE.warten;
  try {
    const { tokens } = await anmelden(s);
    const sperre = path.join(s.zustand, "oauth.json.sperre");
    assert.ok(!fs.existsSync(sperre), "nach dem Schreiben wieder frei");
    // Gehalten: nach SPERRE.warten ein Fehler, nie ein Schreiben ohne Sperre
    fs.writeFileSync(sperre, "");
    SPERRE.warten = 300;
    assert.throws(() => trennen(s.zustand, "alle"), /gesperrt/);
    const r = await erneuernVon(s)(tokens.refresh_token);
    assert.equal(r.status, 503);
    assert.equal(verbindungen(s.zustand).length, 1);
    SPERRE.warten = warten;
    // Ein anderer Prozess wartet, bis die Sperre frei ist, und schreibt erst dann
    const kind = new Promise((ok, nein) => execFile(process.execPath, ["-e",
      `import(${JSON.stringify(pathToFileURL(path.join(SERVER, "mcp-oauth.mjs")).href)}).then((m) => console.log(m.trennen(${JSON.stringify(s.zustand)}, "alle")))`],
    (e, aus) => (e ? nein(e) : ok(aus.trim()))));
    await new Promise((r) => setTimeout(r, 600));
    assert.equal(verbindungen(s.zustand).length, 1, "wartet noch");
    fs.rmSync(sperre);
    assert.equal(await kind, "1");
    assert.equal((await mcpAufruf(s, tokens.access_token)).status, 401);
    // Liegengeblieben (älter als SPERRE.alt): wird entfernt
    const neu = (await anmelden(s)).tokens;
    fs.writeFileSync(sperre, "");
    const alt = new Date(Date.now() - SPERRE.alt - 1000);
    fs.utimesSync(sperre, alt, alt);
    assert.equal((await erneuernVon(s)(neu.refresh_token)).status, 200);
    assert.ok(!fs.existsSync(sperre));
  } finally {
    SPERRE.warten = warten;
    await s.schliessen();
  }
});

test("OAuth: Widerrufen trifft auch das zuletzt eingelöste Erneuerungstoken (nach einer verlorenen Antwort)", async () => {
  const s = await starten();
  try {
    const { tokens } = await anmelden(s);
    const erneuern = erneuernVon(s);
    assert.equal((await erneuern(tokens.refresh_token)).status, 200, "Antwort geht verloren, der Client hält noch das alte");
    assert.equal((await post(`${s.adresse}/oauth/widerrufen`, { token: tokens.refresh_token, client_id: CLIENT })).status, 200);
    assert.equal((await erneuern(tokens.refresh_token)).status, 400, "nach dem Widerrufen nichts mehr");
    assert.equal((await mcpAufruf(s, tokens.access_token)).status, 401);
  } finally {
    await s.schliessen();
  }
});

test("OAuth: eine Sperre eines beendeten Prozesses gilt sofort als liegengeblieben, ohne dass der Dienst wartet", async () => {
  const { execFileSync } = require("node:child_process");
  const s = await starten();
  try {
    const { tokens } = await anmelden(s);
    // Prozess-Nummer eines Prozesses, der schon beendet ist
    const tot = Number(execFileSync(process.execPath, ["-e", "console.log(process.pid)"], { encoding: "utf8" }).trim());
    const sperre = path.join(s.zustand, "oauth.json.sperre");
    fs.writeFileSync(sperre, `${tot} abc`);
    const start = Date.now();
    assert.equal((await erneuernVon(s)(tokens.refresh_token)).status, 200);
    assert.ok(Date.now() - start < 1000, `${Date.now() - start} ms`);
    assert.ok(!fs.existsSync(sperre), "die eigene Sperre ist wieder frei");
  } finally {
    await s.schliessen();
  }
});
