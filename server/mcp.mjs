#!/usr/bin/env node
// Connector: MCP-Server über HTTP (Streamable HTTP, zustandslos, nur JSON-Antworten, kein SSE), nur lesend, über eine Quelle (den
// Tresor als Ordner, mcp-quelle-ordner.mjs, oder die Daten des eigenen Servers ohne Kopie, mcp-quelle-server.mjs) und die Werkzeuge aus
// mcp-werkzeuge.mjs. Von Hand geschriebenes JSON-RPC ohne Abhängigkeiten, in beiden
// Arten des Protokolls: bis 2025-11-25 mit initialize und ping, ab 2026-07-28 ohne (jede Anfrage trägt ihre Fassung in _meta,
// server/discover); dazu tools/list, tools/call; Benachrichtigungen bekommen 202. Lauscht nur auf 127.0.0.1; davor steht
// ein Proxy mit HTTPS (Tailscale Serve, auf dem eigenen Server Caddy). Je Lauscher ein Zugang: ein festes Bearer-Token (Datei, nur für den Dienst
// lesbar; für Claude Code im eigenen Netz) oder die Anmeldung per OAuth für claude.ai (mcp-oauth.mjs), nie beides
// (docs/architektur/connector.md).
//   node mcp.mjs dienst <konfig.json>             Dienst
//   node mcp.mjs code <konfig.json>               Einmal-Code für die Anmeldung in claude.ai (10 Minuten; nicht mit daten, dort aus Obsidian)
//   node mcp.mjs verbindungen <konfig.json>       Verbindungen aus claude.ai
//   node mcp.mjs trennen <konfig.json> <id|alle>  Verbindung beenden
// konfig.json: { tresor: "<Ordner>", ohne: ["<Ordner>" …] | daten: "<Datenordner des eigenen Servers>", zustand: "<Ordner für oauth.json>",
//                abgleich: "<JSON { geprueft, fehlend } einer Prüfung, ob alles aus dem Sync im Ordner ist>" (wahlweise),
//                hoeren: [{ host: "127.0.0.1", port: 8096, token_datei: "<Datei>" },
//                         { host: "127.0.0.1", port: 8097, oauth: { adresse: "https://<host>[:port]", client_ids: [], code_hinweis },
//                           app: true }] }   app: ueberblick mit Wochenansicht (mcp-app.mjs), dazu resources/list und resources/read
// Mit daten (eigener Server, installieren.sh): Quelle quelleServer, Codes aus Obsidian und Trennen über claude-app/ (claude-app.mjs);
// oauth.zugriff: was die Anmeldeseite als lesbar nennt.
import { createHash, timingSafeEqual } from "node:crypto";
import { readFileSync, realpathSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { app as appVon, APP_WERKZEUG } from "./mcp-app.mjs";
import { ORDNER, VERBINDUNGEN } from "./claude-app.mjs";
import { neuerCode, oauth as oauthDienst, trennen, verbindungen } from "./mcp-oauth.mjs";
import { quelleOrdner } from "./mcp-quelle-ordner.mjs";
import { quelleServer } from "./mcp-quelle-server.mjs";
import { tresorOrdner } from "./mcp-tresor.mjs";
import { werkzeuge } from "./mcp-werkzeuge.mjs";

// Unterstützte Fassungen des Protokolls, die neueste zuerst: mit initialize (PROTOKOLLE) und ohne (PROTOKOLLE_NEU). Claude Code und
// claude.ai probieren seit Ende Oktober 2026 zuerst 2026-07-28 und fielen nach einer Absage auf initialize zurück (eine Anfrage mehr
// je Verbindung, und ohne Rückfall gar keine Verbindung mehr).
export const PROTOKOLLE = ["2025-11-25", "2025-06-18", "2025-03-26"];
export const PROTOKOLLE_NEU = ["2026-07-28"];
const META = "io.modelcontextprotocol/";
// Ab 2026-07-28: so lange dürfen Clients Listen, Ressourcen und discover behalten (nur für diesen Zugang); Fehlercodes für Köpfe,
// die dem Körper widersprechen, und für eine Fassung, die der Server nicht spricht
const CACHE = { ttlMs: 3600e3, cacheScope: "private" };
const KOPF_WIDERSPRICHT = -32020, FASSUNG_UNBEKANNT = -32022;
const KOERPER_MAX = 256 * 1024;
// Ohne gültigen Zugang höchstens so viele Anfragen je Fenster, dann 429 (ein gültiger Zugang wird nie gesperrt)
const SPERRE = { fehler: 20, fenster: 10 * 60e3 };

const digest = (text) => createHash("sha256").update(String(text || "")).digest();
const gleich = (a, b) => timingSafeEqual(digest(a), digest(b));

function senden(res, status, kopf, koerper) {
  res.writeHead(status, { "cache-control": "no-store", "x-content-type-options": "nosniff", ...kopf });
  res.end(koerper);
}
const json = (res, status, wert, kopf = {}) => senden(res, status, { "content-type": "application/json", ...kopf }, JSON.stringify(wert));
const rpcFehler = (id, code, message) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
// Ein Wert aus dem Körper als kurzer Text fürs Journal: nur Text, Zahl oder Wahrheitswert; String() auf ein Objekt wie
// {"toString": 1} würfe, und ein Wurf im Handler beendete den Dienst
const kurz = (v, n) => (["string", "number", "boolean"].includes(typeof v) ? String(v) : "?").slice(0, n);

// Körper bis max Bytes. Darüber wird der Rest bis zum Achtfachen weggelesen, damit die Antwort 413 ankommt; noch mehr bricht ab.
function lesen(req, max) {
  return new Promise((ok, falsch) => {
    const teile = [];
    let laenge = 0;
    req.on("data", (t) => {
      laenge += t.length;
      if (laenge <= max) teile.push(t);
      else if (laenge > 8 * max) req.destroy();
    });
    req.on("end", () => (laenge > max ? falsch(Object.assign(new Error("zu groß"), { status: 413 })) : ok(Buffer.concat(teile).toString("utf8"))));
    req.on("error", falsch);
  });
}

// Ein JSON-RPC-Aufruf → { status, antwort }. a: die App (mcp-app.mjs) oder null. neu: Anfrage in der Art ab 2026-07-28 (Ergebnisse
// mit resultType und dem Server in _meta, Listen mit CACHE; initialize und ping gibt es dort nicht, eine unbekannte Methode ist 404)
async function beantworten(nachricht, w, version, a, protokoll, neu) {
  const { id, method, params } = nachricht;
  const p = params && typeof params === "object" ? params : {};
  const server = { name: "studium-autopilot", title: "Studium Autopilot", version };
  const ok = (result, cache = false) => ({ status: 200, antwort: { jsonrpc: "2.0", id,
    result: neu ? { ...result, resultType: "complete", ...(cache ? CACHE : {}), _meta: { ...result._meta, [`${META}serverInfo`]: server } } : result } });
  const fehler = (code, text, status = 200) => ({ status, antwort: rpcFehler(id, code, text) });
  const faehigkeiten = { tools: { listChanged: false },
    ...(a ? { resources: { listChanged: false }, extensions: { [`${META}ui`]: {} } } : {}) };
  switch (method) {
    case "initialize": {
      if (neu) break;
      const gewuenscht = typeof p.protocolVersion === "string" ? p.protocolVersion : "";
      return ok({ protocolVersion: PROTOKOLLE.includes(gewuenscht) ? gewuenscht : PROTOKOLLE[0], capabilities: faehigkeiten,
        serverInfo: server, instructions: w.anleitung });
    }
    case "server/discover":
      if (!neu) break;
      return ok({ supportedVersions: [...PROTOKOLLE_NEU, ...PROTOKOLLE], capabilities: faehigkeiten, instructions: w.anleitung }, true);
    case "ping":
      if (neu) break;
      return ok({});
    case "tools/list":
      return ok({ tools: w.liste().map((d) => (a && d.name === APP_WERKZEUG ? { ...d, _meta: a.meta } : d)) }, true);
    case "tools/call": {
      if (typeof p.name !== "string") return fehler(-32602, "name fehlt");
      const r = await w.aufrufen(p.name, p.arguments);
      if (!r) return fehler(-32602, `Unbekanntes Werkzeug: ${p.name.slice(0, 60)}`);
      if (r.ausnahme) protokoll(`fehler ${p.name.slice(0, 40)}: ${r.ausnahme.message}`);
      const strukturiert = a && p.name === APP_WERKZEUG ? a.strukturiert(r) : null;
      // ein Bild (datei_lesen) als eigener Inhalt neben dem Text; claude.ai und Claude Code zeigen es Claude als Bild
      const inhalt = [{ type: "text", text: r.text }, ...(r.bild ? [{ type: "image", data: r.bild.daten, mimeType: r.bild.mimeType }] : [])];
      return ok({ content: inhalt, isError: r.fehler, ...(strukturiert ? { structuredContent: strukturiert } : {}) });
    }
    case "resources/list":
      if (!a) break;
      return ok({ resources: a.ressourcen() }, true);
    case "resources/templates/list":
      if (!a) break;
      return ok({ resourceTemplates: [] }, true);
    case "resources/read": {
      if (!a) break;
      const inhalt = a.lesen(p.uri);
      return inhalt ? ok({ contents: inhalt }, true) : fehler(neu ? -32602 : -32002, "Ressource nicht gefunden");
    }
    default:
  }
  return fehler(-32601, "Unbekannte Methode", neu ? 404 : 200);
}

// Ab 2026-07-28 trägt eine Anfrage ihre Fassung in params._meta; Kopf MCP-Protocol-Version, Mcp-Method und Mcp-Name (Werkzeug bzw.
// Ressource, Sonderzeichen als =?base64?…?=) müssen dazu passen. Ergebnis: { neu: false } für die Art mit initialize, { neu: true }
// oder { status, code, grund, daten } für eine Absage. Ein fehlender Kopf zählt nicht als Widerspruch (er steht im Journal): Proxys
// davor lesen keine Köpfe, und ein Client, der einen weglässt, wäre sonst ausgesperrt; ein widersprechender wird immer abgelehnt.
function artVon(nachricht, kopf, protokoll) {
  const p = nachricht.params && typeof nachricht.params === "object" ? nachricht.params : {};
  const meta = p._meta && typeof p._meta === "object" ? p._meta : {};
  const fassung = meta[`${META}protocolVersion`];
  if (fassung === undefined || nachricht.method === "initialize") return { neu: false };
  const absage = (code, grund, daten) => ({ status: 400, code, grund, daten });
  if (typeof fassung !== "string") return absage(KOPF_WIDERSPRICHT, "_meta: Fassung fehlt oder ist kein Text");
  const name = nachricht.method === "tools/call" ? p.name : nachricht.method === "resources/read" ? p.uri : undefined;
  const erwartet = { "mcp-protocol-version": fassung, "mcp-method": nachricht.method, "mcp-name": name };
  const fehlend = [];
  for (const [k, soll] of Object.entries(erwartet)) {
    if (typeof soll !== "string") continue; // ein Name, der kein Text ist, scheitert danach in beantworten
    const ist = kopf[k];
    if (ist === undefined) fehlend.push(k);
    else if (dekodieren(String(ist)) !== soll) return absage(KOPF_WIDERSPRICHT, `Kopf ${k} passt nicht zum Körper`);
  }
  if (fehlend.length) protokoll(`ohne Kopf ${fehlend.join(", ")} (${kurz(nachricht.method, 40)})`);
  if (!PROTOKOLLE_NEU.includes(fassung)) {
    return absage(FASSUNG_UNBEKANNT, "Protokollfassung nicht unterstützt", { supported: [...PROTOKOLLE_NEU, ...PROTOKOLLE], requested: fassung.slice(0, 40) });
  }
  return { neu: true };
}
const dekodieren = (wert) => {
  const m = /^=\?base64\?(.*)\?=$/.exec(wert);
  return m ? Buffer.from(m[1], "base64").toString("utf8") : wert;
};

// Für das Journal: welcher Client sich meldet und ob er Ansichten (MCP-Apps) zeigen kann; keine Inhalte. Beim initialize stehen die
// Angaben in params, ab 2026-07-28 in params._meta
function clientVon(p, neu) {
  const m = neu ? (p && p._meta) || {} : p || {};
  const info = (neu ? m[`${META}clientInfo`] : m.clientInfo) || {};
  const faehig = (neu ? m[`${META}clientCapabilities`] : m.capabilities) || {};
  const ui = !!(faehig.extensions && faehig.extensions[`${META}ui`]);
  return `${JSON.stringify(kurz(info.name, 60))} ${JSON.stringify(kurz(info.version, 30))}, ui: ${ui ? "ja" : "nein"}`;
}

// Prüfung des Abgleichs aus einer Datei, die ein anderer Dienst schreibt ({ geprueft: ISO-Zeit, fehlend: Anzahl }): neu gelesen,
// wenn sie sich ändert; fehlt sie oder ist sie kaputt, gibt es keine (null), und der Stand fällt auf die letzte Änderung zurück.
export function abgleichAus(datei) {
  if (!datei) return () => null;
  let stempel = null, wert = null;
  return () => {
    try {
      const st = statSync(datei);
      const s = `${st.mtimeMs}:${st.size}`;
      if (s !== stempel) {
        stempel = s;
        const j = JSON.parse(readFileSync(datei, "utf8"));
        const fehlend = Number(j.fehlend);
        wert = typeof j.geprueft === "string" && !Number.isNaN(Date.parse(j.geprueft)) && Number.isInteger(fehlend) && fehlend >= 0
          ? { geprueft: new Date(j.geprueft).toISOString(), fehlend } : null;
      }
    } catch (e) {
      stempel = null;
      wert = null;
    }
    return wert;
  };
}

// HTTP-Server (noch nicht gestartet). Daten: quelle (quelleServer bzw. quelleOrdner) oder tresor (ein Tresor-Ordner aus
// mcp-tresor.mjs, dazu wahlweise abgleich). Zugang entweder token (fester Zugang dieses Lauschers) oder oauth (aus mcp-oauth.mjs, dann
// auch die Wege für die Anmeldung); ohne beides nimmt er nichts an.
export function erzeugeMcp({ quelle, tresor, token, oauth, app = false, abgleich, version = "0", jetzt = () => new Date(), protokoll = () => {} }) {
  if (token && oauth) throw new Error("Ein Lauscher hat entweder ein Token oder OAuth, nie beides.");
  const w = werkzeuge(quelle || quelleOrdner(tresor, { abgleich }), { jetzt });
  const a = app ? appVon({ jetzt }) : null;
  let fehlversuche = [];

  // Sicherheitsnetz: was im Handler doch wirft, wird 500 und eine Zeile im Journal, nie eine unbehandelte Ablehnung, die den Dienst
  // beendete (jeder mit Zugang hätte ihn so abstellen können)
  const server = createServer((req, res) => {
    bearbeiten(req, res).catch((e) => {
      protokoll(`fehler http: ${e && e.message}`);
      if (!res.headersSent) json(res, 500, rpcFehler(null, -32603, "Interner Fehler"));
      else res.destroy();
    });
  });
  async function bearbeiten(req, res) {
    const start = Date.now();
    let pfad = "";
    try { pfad = new URL(req.url, "http://x").pathname; } catch (e) { /* bleibt leer */ }
    // Mit OAuth (aus dem Internet) ins Journal: die Anmeldung und abgelehnte Anfragen an /mcp, je Methode, Pfad, Status, Client; nie
    // Abfrage, Köpfe mit Tokens oder Adressen. Erfolgreiche Aufrufe stehen schon mit Methode und Dauer darin, Anfragen von Scannern an
    // andere Pfade nicht.
    if (oauth) {
      res.on("finish", () => {
        if (pfad === "/mcp" ? res.statusCode < 300 : !/^\/(oauth|\.well-known)\//.test(pfad)) return;
        protokoll(`http ${req.method} ${JSON.stringify(pfad.slice(0, 80))} ${res.statusCode} `
          + JSON.stringify(String(req.headers["user-agent"] || "").slice(0, 60)));
      });
    }
    try {
      if (oauth && (await oauth.routen(req, res, pfad))) return;
    } catch (e) {
      protokoll(`fehler oauth: ${e && e.message}`);
      return json(res, 500, { error: "server_error" });
    }
    if (pfad !== "/mcp") return json(res, 404, { fehler: "unbekannt" });
    if (req.method !== "POST") return senden(res, 405, { allow: "POST" }, "");
    // Aufrufe aus einem Browser (Origin) nie: der Connector spricht nur mit Claude, nicht mit Webseiten (DNS-Rebinding). Mit OAuth
    // auch https://claude.ai und https://claude.com, falls Claude den Kopf mitschickt (dort zählt nur das Token, nie ein Cookie)
    if (req.headers.origin && !(oauth && ["https://claude.ai", "https://claude.com"].includes(req.headers.origin))) {
      protokoll(`origin abgelehnt: ${JSON.stringify(String(req.headers.origin).slice(0, 100))}`);
      return json(res, 403, { fehler: "origin" });
    }
    if (oauth) {
      // Ohne Token antwortet /mcp mit 401 und dem Verweis auf die Anmeldung (so beginnt claude.ai); keine Sperre je Absender,
      // denn alle Anfragen von claude.ai kommen aus denselben Adressen
      const z = oauth.zugang(req);
      if (!z.verbindung) return json(res, 401, { error: "invalid_token" }, { "www-authenticate": oauth.herausforderung(z.fehler) });
      if (!oauth.aufrufErlaubt(z.verbindung)) return json(res, 429, { error: "zu-viele" }, { "retry-after": "300" });
    } else {
      const t = jetzt().getTime();
      fehlversuche = fehlversuche.filter((x) => t - x < SPERRE.fenster);
      const kopf = String(req.headers.authorization || "");
      const zugang = !!token && kopf.startsWith("Bearer ") && gleich(kopf.slice(7), token);
      if (!zugang) {
        if (fehlversuche.length >= SPERRE.fehler) return json(res, 429, { fehler: "zu-viele" }, { "retry-after": "600" });
        fehlversuche.push(t);
        return json(res, 401, { error: "invalid_token" }, { "www-authenticate": 'Bearer realm="studium-autopilot"' });
      }
    }
    if (!/^application\/json\b/i.test(String(req.headers["content-type"] || ""))) return json(res, 415, { fehler: "content-type" });
    // Abgelehnte Anfragen mit Grund ins Journal (Fassung und Methode sind keine Inhalte), damit neue Fassungen von Claude auffallen
    const abgelehnt = (code, grund, wert = "") => {
      protokoll(`abgelehnt: ${grund}${wert ? " " + JSON.stringify(kurz(wert, 40)) : ""}`);
      return json(res, 400, rpcFehler(null, code, grund));
    };
    // Ein angekündigter zu großer Körper wird gar nicht erst gelesen
    if (Number(req.headers["content-length"]) > KOERPER_MAX) return json(res, 413, rpcFehler(null, -32600, "Anfrage zu groß"), { connection: "close" });
    let nachricht;
    try {
      nachricht = JSON.parse(await lesen(req, KOERPER_MAX));
    } catch (e) {
      if (e.status === 413) return json(res, 413, rpcFehler(null, -32600, "Anfrage zu groß"), { connection: "close" });
      return abgelehnt(-32700, "Kein gültiges JSON");
    }
    if (Array.isArray(nachricht)) return abgelehnt(-32600, "Mehrere Nachrichten in einer Anfrage werden nicht unterstützt");
    if (!nachricht || typeof nachricht !== "object" || nachricht.jsonrpc !== "2.0") return abgelehnt(-32600, "Kein JSON-RPC 2.0", nachricht?.method);
    if (nachricht.method !== undefined && typeof nachricht.method !== "string") return abgelehnt(-32600, "method ist kein Text");
    const art = artVon(nachricht, req.headers, protokoll);
    if (art.code) {
      protokoll(`abgelehnt: ${art.grund} (${kurz(nachricht.method, 40)})`);
      return json(res, art.status, { jsonrpc: "2.0", id: nachricht.id ?? null, error: { code: art.code, message: art.grund, ...(art.daten ? { data: art.daten } : {}) } });
    }
    // In der Art mit initialize gilt der Kopf erst danach: initialize handelt die Fassung im Körper aus (Claude schickt ihn schon
    // dort mit 2026-07-28). Eine unbekannte Fassung ohne _meta lehnt -32600 ab, kein Code ab 2026-07-28: so fällt ein Client auf
    // initialize zurück, statt den Server für einen der neuen Art zu halten.
    const fassung = req.headers["mcp-protocol-version"];
    if (!art.neu && fassung && nachricht.method !== "initialize" && !PROTOKOLLE.includes(String(fassung))) {
      return abgelehnt(-32600, `Protokollfassung nicht unterstützt (${kurz(nachricht.method, 40)})`, fassung);
    }
    // Benachrichtigung (ohne id) oder Antwort des Clients: angenommen, keine Antwort
    if (nachricht.id === undefined || typeof nachricht.method !== "string") return senden(res, 202, {}, "");
    let r;
    try {
      r = await beantworten(nachricht, w, version, a, protokoll, art.neu);
    } catch (e) {
      r = { status: 200, antwort: rpcFehler(nachricht.id, -32603, "Interner Fehler") };
      protokoll(`fehler ${nachricht.method}: ${e && e.message}`);
    }
    // Ins Journal nur Methode, Werkzeug und Dauer, nie Argumente (Suchwörter können persönlich sein); wer sich meldet, beim
    // initialize bzw. ab 2026-07-28 bei server/discover und tools/list
    const zusatz = nachricht.method === "tools/call" ? ` ${kurz(nachricht.params?.name, 40)}`
      : nachricht.method === "initialize" || (art.neu && ["server/discover", "tools/list"].includes(nachricht.method))
        ? ` ${clientVon(nachricht.params, art.neu)}` : "";
    protokoll(`${nachricht.method}${art.neu ? " (2026)" : ""}${zusatz} ${Date.now() - start} ms`);
    json(res, r.status, r.antwort);
  }
  // Langsame Verbindungen aus dem Internet halten keine Sockets lange (Node wartet sonst 60 s auf Köpfe, 300 s auf die Anfrage).
  // Ruhende Verbindungen bleiben länger offen als beim Proxy davor (Tailscale: 90 s): schlösse Node sie nach seinen 5 s, nähme der
  // Proxy womöglich gerade eine schließende Verbindung für die nächste Anfrage, und die scheiterte mit 502.
  server.headersTimeout = 15e3;
  server.requestTimeout = 30e3;
  server.keepAliveTimeout = 95e3;
  return server;
}

function versionLesen() {
  try { return readFileSync(join(dirname(fileURLToPath(import.meta.url)), "VERSION"), "utf8").trim(); } catch (e) { return "0"; }
}

const zustandVon = (konfig) => konfig.zustand || "/var/lib/studium-mcp";

async function main(argv) {
  const [befehl, datei, ziel] = argv;
  if (!["dienst", "code", "verbindungen", "trennen"].includes(befehl) || !datei || (befehl === "trennen" && !ziel)) {
    console.error("Aufruf: node mcp.mjs dienst|code|verbindungen <konfig.json>, node mcp.mjs trennen <konfig.json> <id|alle>");
    process.exit(2);
  }
  const konfig = JSON.parse(readFileSync(datei, "utf8"));
  // Die Kommandozeile schreibt Dateien, die der Dienst lesen muss: nur als Besitzer des Zustands (sudo -u studium-mcp …), nie als root
  if (befehl !== "dienst" && typeof process.getuid === "function") {
    let besitzer = null;
    try { besitzer = statSync(zustandVon(konfig)).uid; } catch (e) { /* fehlt: legt der Dienst an */ }
    if (besitzer !== null && besitzer !== process.getuid()) {
      console.error(`Bitte als Besitzer von ${zustandVon(konfig)} aufrufen (sudo -u studium-mcp node mcp.mjs ${befehl} …).`);
      process.exit(2);
    }
  }
  if (befehl === "code") {
    if (konfig.daten) {
      console.error("Auf dem eigenen Server kommt der Code aus Obsidian (Eigener Server → Mit der Claude-App verbinden).");
      process.exit(2);
    }
    const { code, ablauf } = neuerCode(zustandVon(konfig));
    const bis = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(new Date(ablauf));
    return console.log(`Code: ${code} (gilt bis ${bis} Uhr, einmal)`);
  }
  if (befehl === "verbindungen") return console.log(JSON.stringify(verbindungen(zustandVon(konfig)), null, 1));
  if (befehl === "trennen") return console.log(`${trennen(zustandVon(konfig), ziel)} Verbindung(en) beendet`);
  // Eigener Server (daten): was Obsidian und der Web-Dienst hinlegen; sonst ein Tresor-Ordner (Prototyp)
  const tresor = konfig.daten ? null : tresorOrdner(konfig.tresor, { ohne: konfig.ohne || [] });
  const quelle = konfig.daten ? quelleServer(konfig.daten) : quelleOrdner(tresor, { abgleich: abgleichAus(konfig.abgleich) });
  const uebergabe = konfig.daten ? { codes: join(konfig.daten, ORDNER.codes), trennen: join(konfig.daten, ORDNER.trennen),
    verbindungen: join(konfig.daten, ORDNER.ausMcp, VERBINDUNGEN) } : null;
  const version = versionLesen();
  const protokoll = (z) => console.log(z);
  for (const h of konfig.hoeren || []) {
    if (h.host !== "127.0.0.1" && h.host !== "::1") throw new Error("Der Connector lauscht nur auf 127.0.0.1 oder ::1.");
    let token = null, oauth = null;
    if (h.oauth) {
      oauth = oauthDienst({ adresse: h.oauth.adresse, verzeichnis: zustandVon(konfig), clientIds: h.oauth.client_ids || [],
        codeHinweis: h.oauth.code_hinweis || "", uebergabe, ...(h.oauth.zugriff ? { zugriff: h.oauth.zugriff } : {}), protokoll });
    } else if (konfig.daten) {
      throw new Error("Auf dem eigenen Server nur mit OAuth (claude.ai), nie mit einem festen Token.");
    } else {
      token = readFileSync(h.token_datei, "utf8").trim();
      if (token.length < 32) throw new Error(`Token in ${h.token_datei} zu kurz (mindestens 32 Zeichen).`);
    }
    const server = erzeugeMcp({ quelle, token, oauth, app: h.app === true, version, protokoll });
    server.listen(h.port, h.host, () => console.log(`Connector ${version} lauscht auf ${h.host}:${h.port} (${oauth ? "OAuth" : "Token"})`));
  }
  if (tresor) setImmediate(() => tresor.vorbereiten());
}

// realpathSync: Node löst den Symlink /opt/studium-server/aktuell für import.meta.url auf, für argv[1] nicht.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
