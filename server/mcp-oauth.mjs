// Anmeldung per OAuth für den Connector (mcp.mjs), gebaut nur für claude.ai: ein Client (Claudes veröffentlichte Kennung als
// Metadaten-Dokument, CIMD; in der Konfiguration ersetzbar), genau zwei Rücksprungadressen (claude.ai und claude.com, wohin Claude
// umziehen will), PKCE S256, eine Person je Server. Wer sich anmeldet, beweist es mit einem Einmal-Code (hier aus der
// Kommandozeile auf dem Server: node mcp.mjs code; auf dem eigenen Server aus Obsidian über den Web-Dienst, uebergabe unten). Kein /register, kein Abruf fremder Dokumente, keine
// Rücksprünge nach localhost (Claude Code meldet sich so nicht an; es braucht den Connector nicht).
//   GET  /.well-known/oauth-protected-resource[/mcp]   welcher Server die Tokens ausstellt (RFC 9728)
//   GET  /.well-known/oauth-authorization-server       Endpunkte und Verfahren (RFC 8414)
//   GET  /oauth/anmelden    prüft die Anfrage von claude.ai, legt die Anmeldung in ein signiertes Cookie und zeigt das Feld für den Code
//   POST /oauth/anmelden    Code richtig: Autorisierungscode (60 s, einmal) und zurück zu claude.ai; falsch: noch einmal
//   POST /oauth/token       Autorisierungscode + PKCE gegen Zugriffs- (1 h) und Erneuerungstoken; Erneuern tauscht beide aus. Das
//                           zuletzt eingelöste Erneuerungstoken gilt weiter, bis das neue eingelöst ist (verlorene Antwort), jedes
//                           ältere beendet die ganze Verbindung (gestohlen)
//   POST /oauth/widerrufen  beendet die Verbindung eines Tokens (RFC 7009)
// Tokens und Codes sind Zufallswerte, gespeichert wird nur ihr SHA-256. Zustand in <verzeichnis>/oauth.json (Verbindungen, dazu die
// beendeten der letzten 30 Tage) und <verzeichnis>/codes/ (Einmal-Codes); Autorisierungscodes nur im Speicher (sie gelten eine Minute),
// Anmeldungen im Cookie des Browsers.
// Auf dem eigenen Server (uebergabe: Ordner unter claude-app/, claude-app.mjs) kommen die Codes aus Obsidian (codes/, nur lesend;
// eingelöst über eine exklusive Marke in <verzeichnis>/eingeloest/), Wünsche zum Trennen aus trennen/, und die Verbindungen gehen nach
// aus-mcp/verbindungen.json (für Obsidian, mit den beendeten der letzten 30 Tage: Auch eine Verbindung, die vor dem nächsten Abholen
// schon wieder endet, sieht jedes Gerät einmal).
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { closeSync, fsyncSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync, writeSync } from "node:fs";
import { join } from "node:path";
import { dateiLesen, schreibenAtomar } from "./dateien.mjs";

// Nur diese beiden, Byte für Byte; zurück geht es zu dem, den die Anfrage nennt
export const RUECKSPRUENGE = ["https://claude.ai/api/mcp/auth_callback", "https://claude.com/api/mcp/auth_callback"];
// Claudes Kennung für claude.ai (veröffentlicht); client_ids in der Konfiguration ersetzt sie, falls Claude eine andere nimmt
export const CLAUDE_KENNUNG = "https://claude.ai/oauth/mcp-oauth-client-metadata";
const UMFANG = ["lesen"];
export const FRIST = { code: 10 * 60e3, anmeldung: 10 * 60e3, autorisierung: 60e3, zugriff: 3600e3, ruhend: 30 * 864e5, hoechstens: 90 * 864e5 };
// Falsche Codes: 5 je Anmeldung, danach beginnt das Verbinden in claude.ai neu. Die Anmeldung selbst steht im Cookie des Browsers
// (signiert, siehe entsiegeln), es gibt also keine gemeinsame Liste, aus der viele Aufrufe von /oauth/anmelden die eines Studierenden
// verdrängen könnten. Mitgezählt werden die falschen Codes von höchstens 1000 Anmeldungen (die älteste weicht; sie beginnt dann
// wieder bei null, wie eine neue). Keine Grenze für den ganzen Server: mit ihr könnte jeder, der den Hostnamen kennt, das Verbinden
// eine Stunde lang sperren, und einen Code aus 32^10 in seinen 10 Minuten zu erraten bleibt auch ohne sie aussichtslos. Nie je
// Absender (alle Anfragen von claude.ai kommen aus denselben Adressen, und Studierende teilen sich die Adresse des Uni-Netzes).
// Aufrufe je Verbindung (jede Anfrage an /mcp, auch initialize und tools/list): 300 in 5 Minuten, 5000 am Tag.
export const GRENZEN = { versuche: 5, anmeldungen: 1000, fenster: 5 * 60e3, jeFenster: 300, jeTag: 5000 };
// Sperre um jedes Lesen-Ändern-Schreiben (Dienst und Kommandozeile): so lange wartet die Kommandozeile (warten) bzw. der Dienst
// (dienst; er wartet synchron, und beide Lauscher stehen so lange), und eine ältere Sperre ist liegengeblieben (alt). Lebt der
// Prozess nicht mehr, der sie hält, gilt sie sofort als liegengeblieben.
export const SPERRE = { warten: 7e3, dienst: 250, alt: 5e3 };
const ZEICHEN = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // ohne 0/O, 1/I
const VERIFIER = /^[A-Za-z0-9._~-]{43,128}$/;
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;
// wer einen Code aus Obsidian holte (Kennung des Geräts oder „gemeinsam“, server/geraete.mjs VON); steht im Code und geht mit der Verbindung
const VON = /^(?:gemeinsam|[A-Za-z0-9_-]{22})$/;
// Das zuletzt eingelöste Erneuerungstoken bekommt höchstens so viele weitere Paare (parallele Anfragen von claude.ai, verlorene
// Antwort); danach beendet es die Verbindung wie jedes ältere
const NACHREICHEN = 2;
// Als altes Token einer Verbindung (gestohlen) zählt nur eines, das der Server ihr wirklich ausgegeben hat: die SHA-256 der letzten so
// vielen Erneuerungstokens (ausgegeben). Wer nur die Kennung kennt (sie steht in server.json, im Eingang und im Journal), bekommt
// invalid_grant und beendet nichts.
const AUSGEGEBEN = 100;

const sha = (t) => createHash("sha256").update(String(t)).digest("hex");
const zufall = (n = 32) => randomBytes(n).toString("base64url");
const esc = (s) => String(s).replace(/[&<>"']/g, (z) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[z]);
const codeNormal = (code) => String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
// Schema und Host in Kleinschrift (RFC 3986: in beliebiger Schreibweise gleich), Pfad und Rest unverändert
const ohneSchreibweise = (u) => String(u).replace(/^[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/?#]*/, (k) => k.toLowerCase());
const nichtJetzt = (satz) => Object.assign(new Error(satz), { status: 503 });

// Schreibt über eine Hilfsdatei und gibt deren Stempel zurück (Umbenennen behält Zeit, Größe und Inode), damit ein Schreiben eines
// anderen Prozesses dazwischen nicht für das eigene gehalten wird. Die Hilfsdatei ist vor dem Umbenennen auf der Platte (fsync),
// sonst kann nach einem Absturz eine leere oauth.json übrig bleiben.
function atomar(datei, inhalt) {
  const tmp = `${datei}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
  try {
    const b = Buffer.from(inhalt), fd = openSync(tmp, "wx", 0o600);
    try {
      for (let n = 0; n < b.length;) n += writeSync(fd, b, n, b.length - n);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    const st = statSync(tmp);
    renameSync(tmp, datei);
    return stempelVon(st);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
}
const stempelVon = (st) => `${st.mtimeMs}:${st.size}:${st.ino}`;

// f() unter einer Sperrdatei (wx) in verzeichnis: Dienst und Kommandozeile sind getrennte Prozesse und ändern dieselben Dateien.
// In der Datei stehen Prozess und eine Marke des Halters. Hält sie ein anderer, kurz warten (synchron, die Sperre gilt nur
// Millisekunden); nach der Wartezeit ein Fehler, nie ein Schreiben ohne Sperre. Freigeben nur, wenn die eigene Marke noch drinsteht.
const schlaf = new Int32Array(new SharedArrayBuffer(4));
function lebt(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === "EPERM";
  }
}
function gesperrt(verzeichnis, f, dienst = false) {
  mkdirSync(verzeichnis, { recursive: true, mode: 0o700 });
  const datei = join(verzeichnis, "oauth.json.sperre"), bis = Date.now() + (dienst ? SPERRE.dienst : SPERRE.warten);
  const marke = `${process.pid} ${randomBytes(8).toString("hex")}`;
  for (;;) {
    try {
      const fd = openSync(datei, "wx", 0o600);
      try { writeSync(fd, marke); } finally { closeSync(fd); }
      break;
    } catch (e) {
      if (e.code !== "EEXIST") throw e;
    }
    let alter = 0, halter = NaN;
    try {
      alter = Date.now() - statSync(datei).mtimeMs;
      halter = Number(readFileSync(datei, "utf8").split(" ")[0]);
    } catch (e) {
      if (e.code === "ENOENT") continue; // eben frei geworden
      throw e;
    }
    const verwaist = Number.isInteger(halter) && halter > 0 && halter !== process.pid && !lebt(halter);
    if (verwaist || alter > SPERRE.alt) {
      rmSync(datei, { force: true });
      continue;
    }
    if (Date.now() >= bis) throw nichtJetzt("oauth.json ist gesperrt (ein anderer Aufruf schreibt gerade oder hängt)");
    Atomics.wait(schlaf, 0, 0, 20);
  }
  try {
    return f();
  } finally {
    try { if (readFileSync(datei, "utf8") === marke) rmSync(datei, { force: true }); } catch (e) { /* schon weg */ }
  }
}

// Einmal-Code für die Anmeldung: gilt FRIST.code, höchstens einer ist offen (ein neuer löscht die übrigen)
export function neuerCode(verzeichnis, jetzt = new Date()) {
  return gesperrt(verzeichnis, () => {
    const ordner = join(verzeichnis, "codes");
    mkdirSync(ordner, { recursive: true, mode: 0o700 });
    for (const n of readdirSync(ordner)) rmSync(join(ordner, n), { force: true });
    let code = "";
    for (let i = 0; i < 10; i++) code += ZEICHEN[randomInt(ZEICHEN.length)];
    code = `${code.slice(0, 5)}-${code.slice(5)}`;
    const ablauf = new Date(jetzt.getTime() + FRIST.code).toISOString();
    writeFileSync(join(ordner, `${sha(codeNormal(code))}.json`), JSON.stringify({ ablauf }), { mode: 0o600 });
    return { code, ablauf };
  });
}

// true, wenn der Code gültig war; er ist danach verbraucht. Wie codeEinloesen in verbinden.mjs: zuerst exklusiv eine Marke
// (wx), so löst von zwei gleichzeitigen Anfragen nur eine ein.
export function codeEinloesen(verzeichnis, code, jetzt = new Date()) {
  if (codeNormal(code).length !== 10) return false;
  const datei = join(verzeichnis, "codes", `${sha(codeNormal(code))}.json`), marke = `${datei}.eingeloest`;
  try { writeFileSync(marke, "", { flag: "wx", mode: 0o600 }); } catch (e) { return false; }
  try {
    const e = JSON.parse(readFileSync(datei, "utf8"));
    rmSync(datei);
    return new Date(e.ablauf) > jetzt;
  } catch (e) {
    return false;
  } finally {
    rmSync(marke, { force: true });
  }
}

const leer = () => ({ schema: 3, verbindungen: [], frueher: [] });
// Beendete Verbindungen (frueher in oauth.json und aus-mcp/verbindungen.json): so lange und höchstens so viele; grund: getrennt (in
// Obsidian oder auf der Kommandozeile), widerrufen (vom Client), ersetzt (eine neue Verbindung), wiederverwendet (ein altes
// Erneuerungstoken), abgelaufen (90 Tage)
export const FRUEHER = { tage: 30, hoechstens: 20 };
const FRUEHER_GRUENDE = ["getrennt", "widerrufen", "ersetzt", "wiederverwendet", "abgelaufen"];
// Verbindungen aus d.verbindungen nehmen, die weg() trifft, und in d.frueher vermerken (Ende: t, abgelaufen: ihr bis) → die genommenen
function beenden(d, weg, grund, t) {
  const genommen = d.verbindungen.filter(weg);
  d.verbindungen = d.verbindungen.filter((v) => !weg(v));
  const ende = (v) => new Date(grund === "abgelaufen" ? v.bis : t).toISOString();
  d.frueher = genommen.map((v) => ({ id: v.id, client_id: v.client_id, seit: v.seit, ende: ende(v), grund })).concat(d.frueher || [])
    .filter((f) => t - Date.parse(f.ende) <= FRUEHER.tage * 864e5).sort((a, b) => Date.parse(b.ende) - Date.parse(a.ende)).slice(0, FRUEHER.hoechstens);
  return genommen;
}
// Gelesene Daten prüfen und ältere Formen auf die heutige bringen; ohne Liste von Verbindungen ein Fehler (die Datei ist kaputt)
function gepruefte(d) {
  if (!d || typeof d !== "object" || !Array.isArray(d.verbindungen) || d.verbindungen.some((v) => !v || typeof v !== "object" || typeof v.id !== "string")) {
    throw new Error("keine Liste von Verbindungen");
  }
  for (const v of d.verbindungen) { // ältere Form: erneuern als ein Eintrag; verbraucht (Liste der früheren Nachfrist) entfällt
    if (!Array.isArray(v.erneuern)) v.erneuern = v.erneuern ? [v.erneuern] : [];
    if (!Array.isArray(v.zugriff)) v.zugriff = [];
    if (!v.eingeloest || typeof v.eingeloest !== "object") v.eingeloest = null;
    if (!Array.isArray(v.ausgegeben)) v.ausgegeben = v.erneuern.concat(v.eingeloest || []).map((e) => e && e.hash).filter((h) => typeof h === "string");
    delete v.verbraucht;
  }
  d.frueher = (Array.isArray(d.frueher) ? d.frueher : []).filter((f) => f && typeof f === "object" && typeof f.id === "string"
    && typeof f.seit === "string" && !Number.isNaN(Date.parse(f.ende)) && FRUEHER_GRUENDE.includes(f.grund));
  d.schema = 3;
  return d;
}

// Verbindungen in oauth.json: [{ id, client_id, umfang, seit, zuletzt, bis, zugriff: [{ hash, ablauf }], erneuern: [{ hash, ablauf }],
// eingeloest: { hash, ablauf, nachgereicht } (das zuletzt eingelöste Erneuerungstoken), ausgegeben: [hash] (AUSGEGEBEN) }], dazu
// frueher: [{ id, client_id, seit, ende, grund }] (FRUEHER, die neuesten zuerst). Gelesen bei jeder Anfrage, wenn sich die
// Datei geändert hat (die Kommandozeile trennt Verbindungen). Lässt sie sich nicht lesen (von Hand verdorben, halb geschrieben),
// bleiben die zuletzt gelesenen Daten im Speicher, und geschrieben wird nichts, bis sie repariert oder entfernt ist: sonst stünde
// beim nächsten Schreiben „keine Verbindungen“ darin. Ohne frühere Daten (Start mit kaputter Datei) gibt es so lange keine Tokens.
function zustand(verzeichnis, protokoll = () => {}, dienst = false) {
  const datei = join(verzeichnis, "oauth.json");
  let stempel = null, daten = leer(), kaputt = "", gelesen = false;
  const lesen = () => {
    let st = null;
    try { st = statSync(datei); } catch (e) { /* noch keine */ }
    const s = st ? stempelVon(st) : "";
    if (s === stempel) return daten;
    stempel = s;
    try {
      daten = st ? gepruefte(JSON.parse(readFileSync(datei, "utf8"))) : leer();
      if (kaputt) protokoll("oauth: oauth.json ist wieder lesbar");
      kaputt = "";
      gelesen = true;
    } catch (e) {
      kaputt = `oauth.json lässt sich nicht lesen (${e.message}), geschrieben wird nichts, bis die Datei repariert oder entfernt ist`;
      protokoll(`oauth: FEHLER: ${kaputt}; ${gelesen ? "bis dahin gelten die zuletzt gelesenen Verbindungen" : "bis dahin gibt es keine Tokens"}`);
    }
    return daten;
  };
  const schreiben = () => {
    if (kaputt) throw nichtJetzt(kaputt);
    mkdirSync(verzeichnis, { recursive: true, mode: 0o700 });
    stempel = atomar(datei, JSON.stringify(daten));
  };
  // Lesen, ändern, schreiben unter der Sperre; f(daten) ruft schreiben(), wenn es etwas geändert hat. Geht dabei etwas schief, wird
  // beim nächsten Mal neu gelesen (nichts halb Geändertes bleibt im Speicher).
  const aendern = (f) => gesperrt(verzeichnis, () => {
    const d = lesen();
    if (kaputt) throw nichtJetzt(kaputt);
    try { return f(d); } catch (e) { stempel = null; throw e; }
  }, dienst);
  return { lesen, schreiben, aendern, kaputt: () => kaputt };
}

export function verbindungen(verzeichnis) {
  const z = zustand(verzeichnis), d = z.lesen();
  if (z.kaputt()) throw new Error(z.kaputt());
  return d.verbindungen.map((v) => ({ id: v.id, client_id: v.client_id, seit: v.seit, zuletzt: v.zuletzt, bis: v.bis }));
}

export function trennen(verzeichnis, id, jetzt = new Date()) {
  const z = zustand(verzeichnis);
  return z.aendern((d) => {
    const weg = beenden(d, (v) => id === "alle" || v.id === id, "getrennt", jetzt.getTime());
    z.schreiben();
    return weg.length;
  });
}

const SEITE_STIL = "body{font:17px/1.5 -apple-system,system-ui,sans-serif;margin:0;background:#f6f6f4;color:#1d1d1f}"
  + "main{max-width:30rem;margin:8vh auto;padding:0 1.25rem}h1{font-size:1.4rem}label{display:block;margin:1.25rem 0 .4rem;font-weight:600}"
  + "input{font:1.3rem ui-monospace,monospace;letter-spacing:.08em;width:100%;box-sizing:border-box;padding:.6rem;border:1px solid #bbb;border-radius:.5rem}"
  + "button{margin-top:1rem;font:inherit;font-weight:600;padding:.6rem 1.4rem;border:0;border-radius:.5rem;background:#1d5fbf;color:#fff}"
  + ".fehler{color:#a4161a;font-weight:600}.klein{color:#666;font-size:.9rem;margin-top:2rem}"
  + "@media (prefers-color-scheme:dark){body{background:#1c1c1e;color:#f2f2f7}input{background:#2c2c2e;color:#f2f2f7;border-color:#555}.klein{color:#aaa}}";

function seite(res, status, { titel, absaetze, formular, setzen }) {
  const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">`
    + `<meta name="referrer" content="no-referrer"><title>${esc(titel)}</title><style>${SEITE_STIL}</style></head><body><main><h1>${esc(titel)}</h1>`
    + absaetze.map((a) => `<p${a.klasse ? ` class="${a.klasse}"` : ""}>${a.html}</p>`).join("") + (formular || "")
    + `<p class="klein">Diese Seite gehört zu deinem eigenen Server (Studium Autopilot), nicht zu Anthropic.</p></main></body></html>`;
  res.writeHead(status, {
    "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-content-type-options": "nosniff", "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self' https://claude.ai https://claude.com; frame-ancestors 'none'; base-uri 'none'",
    ...(setzen ? { "set-cookie": setzen } : {}),
  });
  res.end(html);
}

const json = (res, status, wert, kopf = {}) => {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store", pragma: "no-cache", "x-content-type-options": "nosniff", ...kopf });
  res.end(JSON.stringify(wert));
};

function formular(req, max) {
  return new Promise((ok, falsch) => {
    if (!/^application\/x-www-form-urlencoded\b/i.test(String(req.headers["content-type"] || ""))) return falsch(Object.assign(new Error("art"), { status: 415 }));
    const teile = [];
    let laenge = 0;
    req.on("data", (t) => {
      laenge += t.length;
      if (laenge <= max) teile.push(t);
      else if (laenge > 8 * max) req.destroy();
    });
    req.on("end", () => (laenge > max ? falsch(Object.assign(new Error("groß"), { status: 413 })) : ok(new URLSearchParams(Buffer.concat(teile).toString("utf8")))));
    req.on("error", falsch);
  });
}

const cookieVon = (req, name) => {
  for (const teil of String(req.headers.cookie || "").split(";")) {
    const [k, ...v] = teil.trim().split("=");
    if (k === name) return v.join("=");
  }
  return "";
};

// Was die Anmeldeseite über den Zugriff sagt (Prototyp: der ganze Tresor; eigener Server ohne Kopie: zugriff in der Konfiguration)
const ZUGRIFF = "Termine, Fristen, Prüfungen, Noten, Lernplan, Notizen und die Textfassungen deiner Unterlagen";
// Kennung einer Verbindung (zufall(9)); Wünsche zum Trennen tragen sie als Dateinamen (claude-app.mjs, ID)
const VERBINDUNG = /^[A-Za-z0-9_-]{8,32}$/;
// aus-mcp/verbindungen.json: zuletzt benutzt höchstens so oft neu geschrieben (eine neue oder beendete Verbindung sofort)
const AUS_TAKT = 10 * 60e3;

// adresse: https://<host>[:port] ohne Pfad (Herausgeber; der Connector ist adresse + "/mcp"). clientIds: statt CLAUDE_KENNUNG
// (wahlweise, wenn Claude eine andere veröffentlicht). uebergabe (eigener Server): { codes, trennen, verbindungen } (Ordner bzw. Datei
// unter claude-app/, siehe oben); zugriff: was die Anmeldeseite als lesbar nennt.
export function oauth({ adresse, verzeichnis, clientIds = [], codeHinweis = "", eineVerbindung = true, uebergabe = null, zugriff = ZUGRIFF,
  jetzt = () => new Date(), protokoll = () => {} }) {
  const ausgeber = String(adresse).replace(/\/+$/, "");
  const ressource = `${ausgeber}/mcp`;
  const kennungen = clientIds.length ? clientIds : [CLAUDE_KENNUNG];
  const z = zustand(verzeichnis, protokoll, true);
  // Anmeldungen stehen im Cookie, signiert mit diesem Schlüssel (nur im Speicher: ein Neustart beendet offene Anmeldungen); hier nur
  // die falschen Codes je Anmeldung (Kennung → { versuche, ablauf }; Infinity: vorbei, auch nach dem richtigen Code)
  const siegel = randomBytes(32);
  const gezaehlt = new Map();
  const autorisierungen = new Map(); // SHA-256 des Codes → { client_id, rueck, challenge, umfang, ablauf }
  const aufrufe = new Map(); // Verbindung → [Zeit]

  // ---------- Übergabe mit dem Web-Dienst (eigener Server) ----------
  // Einmal-Code aus Obsidian (codes/<sha256>.json { ablauf, von? }, nur lesend): gültig, wenn er nicht abgelaufen ist (und nicht länger
  // gilt als FRIST.code, falls der Dienst etwas anderes schriebe), einmal: Wer ihn einlöst, legt zuerst exklusiv die Marke
  // eingeloest/<sha256> an (wx), so löst von zwei gleichzeitigen Anfragen nur eine ein. Marken älter als ein Tag fallen weg (der
  // Code gilt dann längst nicht mehr; gemessen an der Uhr der Platte, nicht an jetzt). → { von } | false; von: das Gerät, das den Code
  // holte (geht mit der Verbindung nach aus-mcp/verbindungen.json: Trennt Obsidian dieses Gerät, trennt der Dienst auch sie)
  function codeAusObsidian(roh, t) {
    const n = codeNormal(roh);
    if (n.length !== 10) return false;
    const h = sha(n), b = dateiLesen(join(uebergabe.codes, `${h}.json`), 4096);
    let ablauf = NaN, von = "";
    try {
      const c = JSON.parse(b.toString("utf8"));
      ablauf = Date.parse(c.ablauf);
      von = typeof c.von === "string" && VON.test(c.von) ? c.von : "";
    } catch (e) { return false; }
    if (!(ablauf > t) || ablauf > t + FRIST.code + 60e3) return false;
    const marken = join(verzeichnis, "eingeloest");
    mkdirSync(marken, { recursive: true, mode: 0o700 });
    for (const m of readdirSync(marken)) {
      try { if (Date.now() - statSync(join(marken, m)).mtimeMs > 864e5) rmSync(join(marken, m), { force: true }); } catch (e) { /* schon weg */ }
    }
    try { writeFileSync(join(marken, h), "", { flag: "wx", mode: 0o600 }); } catch (e) { return false; }
    return { von };
  }
  // Wünsche aus Obsidian (trennen/<id>, trennen/alle { zeit }): bei jeder Anfrage nachgesehen (die Namen im Ordner und die Datei
  // alle; neu ausgewertet, wenn sich etwas davon ändert). Nicht die Zeit des Ordners: Sie ändert sich unter Linux nur in groben
  // Schritten, und der Dienst schreibt erst eine Zwischendatei und benennt sie dann um; im selben Schritt gelesen, ginge die
  // Umbenennung verloren. Bis das Löschen aus oauth.json gelungen ist (die Sperre kann kurz belegt sein), gelten die betroffenen
  // Verbindungen schon im Speicher als getrennt (getrennt), und verbindungen.json nennt sie noch: So räumt der Dienst den Wunsch erst
  // weg, wenn er umgesetzt ist (claude-app.mjs). „alle“ ohne lesbare Zeit (etwa leer nach einem Absturz beim Schreiben) trennt alle bis
  // zur Zeit der Datei, höchstens bis jetzt, wie der Dienst es dann neu schreibt; spätere Verbindungen sperrt es nicht.
  let trennenStempel = null, getrennt = () => false;
  function trennenPruefen() {
    if (!uebergabe) return;
    let namen = [];
    try { namen = readdirSync(uebergabe.trennen).filter((n) => n === "alle" || VERBINDUNG.test(n)).sort(); } catch (e) { return; }
    let st = null;
    try { if (namen.includes("alle")) st = statSync(join(uebergabe.trennen, "alle")); } catch (e) { /* eben gelöscht */ }
    const stempel = `${namen.join("/")}|${st ? `${st.mtimeMs}:${st.size}:${st.ino}` : ""}`;
    if (stempel === trennenStempel) return;
    const ids = new Set(namen.filter((n) => n !== "alle"));
    let alle = -Infinity;
    if (namen.includes("alle")) {
      const b = dateiLesen(join(uebergabe.trennen, "alle"), 4096);
      try { alle = Date.parse(JSON.parse(b.toString("utf8")).zeit); } catch (e) { alle = NaN; }
      if (Number.isNaN(alle)) {
        alle = Math.min(st ? st.mtimeMs : Infinity, jetzt().getTime());
        protokoll(`oauth: trennen/alle unlesbar, gilt für alle Verbindungen bis ${new Date(alle).toISOString()}`);
      }
    }
    getrennt = (v) => ids.has(v.id) || Date.parse(v.seit) <= alle;
    if (z.lesen().verbindungen.some(getrennt)) {
      try {
        z.aendern((d) => {
          const weg = beenden(d, getrennt, "getrennt", jetzt().getTime());
          z.schreiben();
          protokoll(`oauth: in Obsidian getrennt: ${weg.map((v) => v.id).join(", ")}`);
        });
      } catch (e) {
        protokoll(`oauth: Trennen aus Obsidian noch nicht gespeichert (${e.message}); bis dahin nur im Speicher`);
        return;
      }
    }
    trennenStempel = stempel;
    ausSchreiben(true);
  }
  // aus-mcp/verbindungen.json: { schema: 1, verbindungen: [{ id, seit, zuletzt, client, von? }], frueher: [{ id, seit, ende, grund, client }] };
  // zuletzt ist der letzte Aufruf an /mcp bzw. das letzte Erneuern; frueher die beendeten der letzten FRUEHER.tage (auch abgelaufene,
  // die noch in oauth.json stehen). Neu geschrieben, wenn sich die Verbindungen ändern (erzwingen), sonst höchstens alle AUS_TAKT.
  const zuletztAufgerufen = new Map();
  let ausText = null, ausIds = null, ausZeit = 0;
  function ausSchreiben(erzwingen = false) {
    if (!uebergabe) return;
    const d = z.lesen(), t = jetzt().getTime();
    if (z.kaputt()) return;
    const host = (v) => { try { return new URL(v.client_id).host; } catch (e) { return "unbekannt"; } };
    const liste = d.verbindungen.filter((v) => v.bis > t).map((v) => ({ id: v.id, seit: v.seit,
      zuletzt: new Date(Math.max(Date.parse(v.zuletzt || v.seit) || 0, zuletztAufgerufen.get(v.id) || 0)).toISOString(), client: host(v),
      ...(typeof v.von === "string" && VON.test(v.von) ? { von: v.von } : {}) }));
    const abgelaufen = d.verbindungen.filter((v) => v.bis <= t).map((v) => ({ ...v, ende: new Date(v.bis).toISOString(), grund: "abgelaufen" }));
    const frueher = abgelaufen.concat(d.frueher).filter((f) => t - Date.parse(f.ende) <= FRUEHER.tage * 864e5)
      .sort((a, b) => Date.parse(b.ende) - Date.parse(a.ende)).slice(0, FRUEHER.hoechstens)
      .map((f) => ({ id: f.id, seit: f.seit, ende: f.ende, grund: f.grund, client: host(f) }));
    const text = JSON.stringify({ schema: 1, verbindungen: liste, frueher }), ids = liste.map((v) => v.id).join(",") + "|" + frueher.map((f) => f.id).join(",");
    if (text === ausText || (!erzwingen && ids === ausIds && t - ausZeit < AUS_TAKT)) return;
    try {
      schreibenAtomar(uebergabe.verbindungen, text, 0o640, true);
      ausText = text;
      ausIds = ids;
      ausZeit = t;
    } catch (e) {
      protokoll(`oauth: verbindungen.json ließ sich nicht schreiben (${e.message})`);
    }
  }

  const metadatenRessource = () => ({ resource: ressource, authorization_servers: [ausgeber], scopes_supported: UMFANG,
    bearer_methods_supported: ["header"], resource_name: "Studium Autopilot" });
  const metadatenServer = () => ({ issuer: ausgeber, authorization_endpoint: `${ausgeber}/oauth/anmelden`, token_endpoint: `${ausgeber}/oauth/token`,
    revocation_endpoint: `${ausgeber}/oauth/widerrufen`, scopes_supported: [...UMFANG, "offline_access"], response_types_supported: ["code"],
    response_modes_supported: ["query"], grant_types_supported: ["authorization_code", "refresh_token"], token_endpoint_auth_methods_supported: ["none"],
    revocation_endpoint_auth_methods_supported: ["none"], code_challenge_methods_supported: ["S256"], client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true });

  const clientErlaubt = (id) => typeof id === "string" && kennungen.includes(id);
  // resource (RFC 8707), wenn gesendet: die Adresse von /mcp; Schema und Host in beliebiger Schreibweise, der Pfad genau
  const ressourceKlein = ohneSchreibweise(ressource);
  const fremdesZiel = (liste) => liste.some((r) => ohneSchreibweise(r) !== ressourceKlein);
  // Fremde Werte nur als JSON-Text ins Journal (ein Zeilenumbruch darin schreibt sonst eine eigene, gefälschte Zeile)
  const wert = (x) => JSON.stringify(String(x ?? "").slice(0, 300));

  const aufraeumen = (t) => {
    for (const [k, v] of gezaehlt) if (v.ablauf <= t) gezaehlt.delete(k);
    for (const [k, v] of autorisierungen) if (v.ablauf <= t) autorisierungen.delete(k);
  };

  const fehlerSeite = (res, satz) => seite(res, 400, { titel: "Verbinden nicht möglich", absaetze: [{ html: esc(satz), klasse: "fehler" }] });
  // Zurück zu dem Rücksprung, den die Anfrage nennt (vorher gegen RUECKSPRUENGE geprüft)
  const zurueck = (res, werte, ziel) => {
    const u = new URL(werte.redirect_uri);
    for (const [k, v] of Object.entries(ziel)) u.searchParams.set(k, v);
    if (werte.state) u.searchParams.set("state", werte.state);
    u.searchParams.set("iss", ausgeber);
    res.writeHead(302, { location: u.href, "cache-control": "no-store", "referrer-policy": "no-referrer" });
    res.end();
  };

  function codeFormular(res, id, { fehler, setzen } = {}) {
    const absaetze = [
      { html: `<strong>claude.ai</strong> möchte lesen: ${esc(zugriff)}. Schreiben kann es nichts.` },
      { html: "Gib den Code nur ein, wenn du selbst gerade in claude.ai „Verbinden“ gedrückt hast." },
      { html: "Hat dir jemand einen Link zu dieser Seite geschickt, gib nichts ein." },
    ];
    if (codeHinweis) absaetze.push({ html: esc(codeHinweis) });
    if (fehler) absaetze.push({ html: esc(fehler), klasse: "fehler" });
    seite(res, 200, { titel: "Mit der Claude-App verbinden", absaetze, setzen,
      formular: `<form method="post" action="/oauth/anmelden"><input type="hidden" name="sitzung" value="${esc(id)}">`
        + `<label for="code">Code</label><input id="code" name="code" required maxlength="20" autocomplete="one-time-code" autocapitalize="characters" `
        + `autocorrect="off" spellcheck="false" autofocus><button type="submit">Verbinden</button></form>` });
  }

  // Anmeldung im Cookie: JSON (base64url) und HMAC-SHA256 darüber mit siegel. Wer das Cookie ändert, fälscht die Signatur; eine
  // Anmeldung gilt nur im Browser, der sie bekam (das Feld sitzung muss zur Kennung darin passen), und FRIST.anmeldung lang.
  const COOKIE = "__Host-sa-anmeldung";
  const mac = (daten) => createHmac("sha256", siegel).update(`sa-anmeldung:${daten}`).digest();
  const versiegeln = (o) => {
    const daten = Buffer.from(JSON.stringify(o)).toString("base64url");
    return `${daten}.${mac(daten).toString("base64url")}`;
  };
  // → { id, client_id, redirect_uri, state, challenge, ablauf } oder null (fehlt, geändert, abgelaufen, andere Anmeldung)
  const entsiegeln = (wert, id, t) => {
    const [daten, unterschrift, ...rest] = String(wert || "").split(".");
    if (!daten || !unterschrift || rest.length || daten.length > 4096) return null;
    const soll = mac(daten), ist = Buffer.from(unterschrift, "base64url");
    if (ist.length !== soll.length || !timingSafeEqual(ist, soll)) return null;
    let a = null;
    try { a = JSON.parse(Buffer.from(daten, "base64url").toString("utf8")); } catch (e) { return null; }
    return a && typeof a === "object" && typeof a.id === "string" && a.id === id && a.ablauf > t ? a : null;
  };

  function anmeldenZeigen(req, res, u) {
    const p = u.searchParams;
    const werte = { client_id: p.get("client_id"), redirect_uri: p.get("redirect_uri"), state: p.get("state") || "" };
    // Ohne gültigen Client und Rücksprung nie zurückleiten (sonst wäre die Seite eine offene Weiterleitung)
    if (!clientErlaubt(werte.client_id)) {
      protokoll(`oauth: client_id abgelehnt: ${wert(werte.client_id)}`);
      return fehlerSeite(res, "Diese Anwendung darf sich hier nicht anmelden.");
    }
    if (!RUECKSPRUENGE.includes(werte.redirect_uri)) return fehlerSeite(res, "Die Rücksprungadresse ist nicht die von claude.ai.");
    if (werte.state.length > 500) return fehlerSeite(res, "Die Anfrage ist ungültig.");
    if (p.get("response_type") !== "code") return zurueck(res, werte, { error: "unsupported_response_type" });
    if (p.get("code_challenge_method") !== "S256" || !CHALLENGE.test(p.get("code_challenge") || "")) {
      return zurueck(res, werte, { error: "invalid_request", error_description: "PKCE mit S256 erforderlich" });
    }
    const umfang = (p.get("scope") || "lesen").split(" ").filter(Boolean);
    if (umfang.some((s) => s !== "lesen" && s !== "offline_access")) return zurueck(res, werte, { error: "invalid_scope" });
    const res8707 = p.getAll("resource");
    if (res8707.length > 1 || fremdesZiel(res8707)) return zurueck(res, werte, { error: "invalid_target" });
    const id = zufall(18);
    const cookie = versiegeln({ id, client_id: werte.client_id, redirect_uri: werte.redirect_uri, state: werte.state, challenge: p.get("code_challenge"),
      ablauf: jetzt().getTime() + FRIST.anmeldung });
    codeFormular(res, id, { setzen: `${COOKIE}=${cookie}; Path=/; Secure; HttpOnly; SameSite=Strict; Max-Age=${FRIST.anmeldung / 1000}` });
  }

  async function anmeldenPruefen(req, res) {
    const f = await formular(req, 4096);
    const t = jetzt().getTime();
    aufraeumen(t);
    const id = f.get("sitzung") || "";
    const a = entsiegeln(cookieVon(req, COOKIE), id, t);
    const bisher = a && gezaehlt.get(id);
    if (!a || (bisher && bisher.versuche >= GRENZEN.versuche)) {
      return fehlerSeite(res, "Diese Anmeldung ist abgelaufen oder gehört zu einem anderen Browser. Starte das Verbinden in claude.ai neu.");
    }
    // Falsche Codes zählen; mit dem richtigen Code oder nach zu vielen falschen ist die Anmeldung vorbei, auch wenn der Browser das
    // Cookie noch hat (neu eingetragen, damit die älteste zuerst weicht)
    const merken = (versuche) => {
      gezaehlt.delete(id);
      if (gezaehlt.size >= GRENZEN.anmeldungen) gezaehlt.delete(gezaehlt.keys().next().value);
      gezaehlt.set(id, { versuche, ablauf: a.ablauf });
    };
    const eingeloest = uebergabe ? codeAusObsidian(f.get("code"), t) : codeEinloesen(verzeichnis, f.get("code"), new Date(t));
    if (!eingeloest) {
      const versuche = (bisher ? bisher.versuche : 0) + 1;
      merken(versuche);
      if (versuche >= GRENZEN.versuche) return fehlerSeite(res, "Zu viele falsche Codes für diese Anmeldung. Starte das Verbinden in claude.ai neu.");
      return codeFormular(res, id, { fehler: `Der Code stimmt nicht oder ist abgelaufen. Noch ${GRENZEN.versuche - versuche} Versuche.` });
    }
    merken(Infinity);
    const code = zufall(32);
    autorisierungen.set(sha(code), { client_id: a.client_id, rueck: a.redirect_uri, challenge: a.challenge, umfang: "lesen", ablauf: t + FRIST.autorisierung,
      von: eingeloest.von || "" });
    protokoll("oauth: Code richtig, zurück zu claude.ai");
    zurueck(res, a, { code });
  }

  // Neue Tokens für eine Verbindung. Ein Erneuerungstoken beginnt mit der Kennung seiner Verbindung („<id>.<Zufall>“): so findet der
  // Server seine Verbindung; ein altes erkennt er an ausgegeben (die letzten AUSGEGEBEN). Normal ersetzt das neue alle
  // gültigen; dazu (nachgereicht für das zuletzt eingelöste) kommt es neben sie, denn welches der Client behält, weiß nur er
  // (höchstens drei). Ein Zugriffstoken gilt nie länger als seine Verbindung.
  function tokensAusgeben(v, t, { dazu = false } = {}) {
    const zugriff = zufall(32), erneuern = `${v.id}.${zufall(32)}`;
    const ablauf = Math.min(t + FRIST.zugriff, v.bis);
    v.zugriff = (v.zugriff || []).filter((x) => x.ablauf > t).slice(-2).concat({ hash: sha(zugriff), ablauf });
    const neu = { hash: sha(erneuern), ablauf: Math.min(t + FRIST.ruhend, v.bis) };
    v.erneuern = dazu ? (v.erneuern || []).slice(-2).concat(neu) : [neu];
    v.ausgegeben = (v.ausgegeben || []).concat(neu.hash).slice(-AUSGEGEBEN);
    v.zuletzt = new Date(t).toISOString();
    return { access_token: zugriff, token_type: "Bearer", expires_in: Math.max(1, Math.floor((ablauf - t) / 1000)), refresh_token: erneuern, scope: v.umfang };
  }

  // Kein Zähler für Fehlversuche: hier lässt sich nichts erraten (Codes und Tokens 256 Bit, einmal, PKCE), und eine Sperre für alle
  // träfe nur das Erneuern der echten Verbindung
  async function token(req, res) {
    const f = await formular(req, 8192);
    const t = jetzt().getTime();
    aufraeumen(t);
    trennenPruefen();
    const nein = (status, error) => json(res, status, { error });
    const art = f.get("grant_type");
    if (!clientErlaubt(f.get("client_id"))) return nein(401, "invalid_client");
    if (art === "authorization_code") {
      const schluessel = sha(f.get("code") || "");
      const a = autorisierungen.get(schluessel);
      autorisierungen.delete(schluessel); // einmal, auch wenn der Rest nicht stimmt
      const verifier = f.get("code_verifier") || "";
      // redirect_uri darf fehlen (OAuth 2.1); gesendet muss es der Rücksprung sein
      if (!a || a.ablauf <= t || a.client_id !== f.get("client_id") || (f.has("redirect_uri") && a.rueck !== f.get("redirect_uri"))) {
        return nein(400, "invalid_grant");
      }
      if (fremdesZiel(f.getAll("resource"))) return nein(400, "invalid_target");
      if (!VERIFIER.test(verifier) || createHash("sha256").update(verifier).digest("base64url") !== a.challenge) return nein(400, "invalid_grant");
      const antwort = z.aendern((d) => {
        if (eineVerbindung && d.verbindungen.length) protokoll(`oauth: ${d.verbindungen.length} frühere Verbindung(en) ersetzt`);
        const v = { id: zufall(9), client_id: a.client_id, umfang: a.umfang, seit: new Date(t).toISOString(), bis: t + FRIST.hoechstens, eingeloest: null,
          ...(a.von ? { von: a.von } : {}) };
        const neu = tokensAusgeben(v, t);
        // eine abgelaufene zählt als abgelaufen, nicht als ersetzt
        if (eineVerbindung) {
          beenden(d, (x) => x.bis <= t, "abgelaufen", t);
          beenden(d, () => true, "ersetzt", t);
        }
        d.verbindungen = d.verbindungen.concat(v);
        z.schreiben();
        protokoll(`oauth: neue Verbindung ${v.id}`);
        return neu;
      });
      ausSchreiben(true);
      return json(res, 200, antwort);
    }
    if (art === "refresh_token") {
      const roh = f.get("refresh_token") || "";
      const punkt = roh.indexOf(".");
      const [status, antwort] = z.aendern((d) => {
        const v = punkt > 0 ? d.verbindungen.find((x) => x.id === roh.slice(0, punkt)) : null;
        if (!v || getrennt(v) || v.client_id !== f.get("client_id") || v.bis <= t) return [400, { error: "invalid_grant" }];
        if (fremdesZiel(f.getAll("resource"))) return [400, { error: "invalid_target" }];
        const h = sha(roh);
        const e = v.erneuern.find((x) => x.hash === h);
        if (e) {
          if (e.ablauf <= t) return [400, { error: "invalid_grant" }];
          // Wie Cloudflares workers-oauth-provider: das eben eingelöste Token gilt ohne Frist weiter (geht die Antwort verloren,
          // wiederholt der Client damit), bis das neue eingelöst ist; seine Geschwister und das vorher eingelöste nicht mehr
          v.eingeloest = { hash: h, ablauf: Math.min(t + FRIST.ruhend, v.bis), nachgereicht: 0 };
          const neu = tokensAusgeben(v, t);
          z.schreiben();
          return [200, neu];
        }
        const alt = v.eingeloest;
        if (alt && alt.hash === h && alt.ablauf <= t) return [400, { error: "invalid_grant" }];
        if (alt && alt.hash === h && (alt.nachgereicht || 0) < NACHREICHEN) {
          alt.nachgereicht = (alt.nachgereicht || 0) + 1;
          const neu = tokensAusgeben(v, t, { dazu: true });
          z.schreiben();
          protokoll(`oauth: Erneuern mit dem zuletzt eingelösten Token wiederholt, Verbindung ${v.id}`);
          return [200, neu];
        }
        // Nie ausgegeben (nur die Kennung ist echt, etwa aus server.json): abgelehnt, nichts ändert sich
        if (!v.ausgegeben.includes(h)) return [400, { error: "invalid_grant" }];
        // Ein Token dieser Verbindung, das nicht mehr gilt: gestohlen; die Verbindung endet, damit auch der, der es zuerst benutzt
        // hat, nichts mehr bekommt
        beenden(d, (x) => x === v, "wiederverwendet", t);
        z.schreiben();
        protokoll(`oauth: altes Erneuerungstoken wiederverwendet, Verbindung ${v.id} beendet`);
        return [400, { error: "invalid_grant" }];
      });
      ausSchreiben(true);
      return json(res, status, antwort);
    }
    return nein(400, "unsupported_grant_type");
  }

  async function widerrufen(req, res) {
    const f = await formular(req, 4096);
    const h = sha(f.get("token") || "");
    z.aendern((d) => {
      // auch das zuletzt eingelöste Erneuerungstoken: nach einer verlorenen Antwort hält claude.ai noch dieses
      const v = d.verbindungen.find((x) => (x.erneuern || []).some((e) => e.hash === h) || (x.zugriff || []).some((a) => a.hash === h)
        || (x.eingeloest && x.eingeloest.hash === h));
      if (!v) return;
      beenden(d, (x) => x === v, "widerrufen", jetzt().getTime());
      z.schreiben();
      protokoll(`oauth: Verbindung ${v.id} widerrufen`);
    });
    ausSchreiben(true);
    res.writeHead(200, { "cache-control": "no-store" });
    res.end();
  }

  // beim Start: was Obsidian inzwischen getrennt hat (etwa während der Connector aus war), und der Stand für Obsidian
  trennenPruefen();
  ausSchreiben(true);

  return {
    ressource,
    // true, wenn die Anfrage hierher gehörte (und beantwortet ist)
    async routen(req, res, pfad) {
      try {
        if (req.method === "GET" && (pfad === "/.well-known/oauth-protected-resource" || pfad === "/.well-known/oauth-protected-resource/mcp")) {
          json(res, 200, metadatenRessource());
        } else if (req.method === "GET" && pfad === "/.well-known/oauth-authorization-server") json(res, 200, metadatenServer());
        else if (pfad === "/oauth/anmelden" && req.method === "GET") anmeldenZeigen(req, res, new URL(req.url, ausgeber));
        else if (pfad === "/oauth/anmelden" && req.method === "POST") await anmeldenPruefen(req, res);
        else if (pfad === "/oauth/token" && req.method === "POST") await token(req, res);
        else if (pfad === "/oauth/widerrufen" && req.method === "POST") await widerrufen(req, res);
        else if (pfad.startsWith("/oauth/") || pfad.startsWith("/.well-known/")) json(res, pfad.startsWith("/oauth/") ? 405 : 404, { error: "unbekannt" });
        else return false;
      } catch (e) {
        if (e.status === 415 || e.status === 413) json(res, e.status, { error: "invalid_request" }, e.status === 413 ? { connection: "close" } : {});
        else if (e.status === 503) { // oauth.json kaputt oder gesperrt: lieber nichts als etwas Falsches schreiben
          protokoll(`oauth: FEHLER: Anfrage abgelehnt: ${e.message}`);
          json(res, 503, { error: "temporarily_unavailable" }, { "retry-after": "60" });
        } else throw e;
      }
      return true;
    },
    // { verbindung } oder { fehler: "fehlt" | "ungueltig" } für den Kopf Authorization einer Anfrage an /mcp
    zugang(req) {
      const kopf = String(req.headers.authorization || "");
      if (!kopf) return { fehler: "fehlt" };
      const m = /^bearer +(\S+)$/i.exec(kopf); // das Schema in beliebiger Schreibweise (RFC 6750, RFC 9110)
      if (!m) return { fehler: "ungueltig" };
      const h = sha(m[1]), t = jetzt().getTime();
      trennenPruefen();
      const v = z.lesen().verbindungen.find((x) => x.bis > t && !getrennt(x) && (x.zugriff || []).some((a) => a.hash === h && a.ablauf > t));
      return v ? { verbindung: v } : { fehler: "ungueltig" };
    },
    herausforderung(fehler) {
      return `Bearer resource_metadata="${ausgeber}/.well-known/oauth-protected-resource/mcp", scope="lesen"`
        + (fehler === "ungueltig" ? ', error="invalid_token"' : "");
    },
    // false: zu viele Aufrufe dieser Verbindung (Fenster oder Tag)
    aufrufErlaubt(v) {
      const t = jetzt().getTime();
      const liste = (aufrufe.get(v.id) || []).filter((x) => t - x < 864e5);
      if (liste.length >= GRENZEN.jeTag || liste.filter((x) => t - x < GRENZEN.fenster).length >= GRENZEN.jeFenster) return false;
      liste.push(t);
      zuletztAufgerufen.set(v.id, t);
      ausSchreiben();
      aufrufe.set(v.id, liste);
      return true;
    },
  };
}
