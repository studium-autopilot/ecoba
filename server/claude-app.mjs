#!/usr/bin/env node
// Claude-App (Connector, docs/architektur/connector.md): die Seite des Web-Dienstes (dienst.mjs, POST /v1/claude-app) und die Ordner,
// über die er mit dem Connector (mcp.mjs, eigener Benutzer studium-mcp, ohne Netz) spricht. Beide schreiben nur in ihre eigenen
// Ordner unter <Datenordner>/claude-app/ (der Ordner selbst gehört root; installieren.sh legt alles an):
//   schalter/an             Marke des Dienstes: Der Connector ist an. Nur ihr Dasein zählt: Eine Pfad-Einheit von root
//                           (studium-server claude-app anwenden) startet dann die Einheit des Connectors und die Wege in Caddy,
//                           ohne sie mehr ist beides aus. Den Inhalt liest niemand (nur der Dienst sieht den Ordner).
//   codes/<sha256>.json     Einmal-Codes für die Anmeldung in claude.ai: { ablauf, von } (von: welches Gerät ihn holte, Kennung oder
//                           „gemeinsam“; der Connector schreibt es zur Verbindung), nie der Code selbst; höchstens einer offen.
//                           Der Connector liest sie nur; eingelöst ist ein Code, sobald er seine exklusive Marke in seinem Zustand
//                           anlegt (er kann hier nichts löschen). Getrennt von den Codes für Geräte (web/verbinden/): /v1/verbinden
//                           löst nie einen Code für die Claude-App ein.
//   trennen/<id>, trennen/alle   Wunsch aus Obsidian, eine Verbindung bzw. alle (bis zu ihrer Zeit) zu beenden; der Connector sieht
//                           bei jeder Anfrage und beim Start nach. <id> bleibt, bis er die Verbindung nicht mehr meldet.
//   daten/lage.json         was der Connector zeigen darf, solange er an ist (lageSchreiben): der Stand aus Obsidian ohne den Rest
//                           von web/, Hinweise aus Mails, noch nicht übernommene Termine aus dem Eingang. Der Dienst kopiert es, damit
//                           der Connector nichts anderes vom Dienst lesen muss.
//   aus-mcp/verbindungen.json   das Einzige, was der Connector außerhalb seines Zustands schreibt: { schema, verbindungen: [{ id, seit,
//                           zuletzt, client, von? }], frueher: [{ id, seit, ende, grund, client }] (beendete der letzten 30 Tage) }; der
//                           Dienst gibt es geprüft weiter (Status, Eingang).
// Anfragen aus Obsidian: { schema: 1, zeit, nonce, aktion: code | status | trennen | aus, id? } (verschlüsselt mit dem Datenschlüssel,
// Zweck claude-app; dienst.mjs prüft vorher Signatur und Beweis). zeit höchstens CODE.uhr neben der Uhr des Servers, jeder Zufallswert
// nur einmal (web/claude-app.json, wie geraetCode in verbinden.mjs).
//   node claude-app.mjs status|aus    (als studium-web; studium-server claude-app)
import { createHash, randomInt } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { da, istDatei, jsonLesen, schreibenAtomar } from "./dateien.mjs";
import { datumOk, hatZugangsdaten, MODULCODE, ohneLinks, saeubern, wieAnweisung } from "./eingang.mjs";

export const ORDNER = { wurzel: "claude-app", schalter: "claude-app/schalter", codes: "claude-app/codes", trennen: "claude-app/trennen",
  daten: "claude-app/daten", ausMcp: "claude-app/aus-mcp" };
export const AN = "an", LAGE = "lage.json", VERBINDUNGEN = "verbindungen.json", ALLE = "alle";
// Codes: Minuten gültig, höchstens so viele je Stunde und je Tag; die Zeit der Anfrage höchstens so weit neben der Uhr des Servers;
// höchstens so viele Zufallswerte je Schlüssel zugleich gemerkt (jeder nur bis zum Ende seines Zeitfensters; je Schlüssel, damit kein Gerät
// mit vielen Anfragen die der anderen aufhält, etwa ein Trennen)
export const CODE = { minuten: 10, stunde: 3, tag: 10, uhr: 2 * 60e3, nonces: 200 };
export const AKTIONEN = ["code", "status", "trennen", "aus"];
// Kennung einer Verbindung (mcp-oauth.mjs: 9 Zufallsbytes, base64url); wer einen Code holte (Kennung des Geräts oder „gemeinsam“)
export const ID = /^[A-Za-z0-9_-]{8,32}$/;
const VON = /^(?:gemeinsam|[A-Za-z0-9_-]{22})$/;
const NONCE = /^[A-Za-z0-9_-]{16,64}$/;
const ZEICHEN = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // ohne 0/O, 1/I
const STUNDE = 3600e3, TAG = 864e5;
// Länger gilt keine Verbindung (mcp-oauth.mjs FRIST.hoechstens): Ein Wunsch zum Trennen, den der Connector so lange nicht umsetzen
// konnte, ist danach gegenstandslos
const TRENNEN_HOECHSTENS = 90 * TAG;
// Hinweise aus Mails, die Obsidian schon übernommen hat, merkt sich der Dienst für den Connector so lange (nur solange er an ist)
const HINWEISE = { tage: 30, hoechstens: 100 };
// In lage.json höchstens so viele Termine und Hinweise aus dem Eingang
const LAGE_MAX = { termine: 1000, hinweise: 300 };
const VERBINDUNGEN_MAX = 10, FRUEHER_MAX = 20;
// Warum eine Verbindung endete (mcp-oauth.mjs FRUEHER_GRUENDE); anderes heißt unbekannt
const GRUENDE = ["getrennt", "widerrufen", "ersetzt", "wiederverwendet", "abgelaufen"];

export const codeNormal = (code) => String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
export const codeHash = (code) => createHash("sha256").update(codeNormal(code)).digest("hex");
const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
const zeitOk = (s) => typeof s === "string" && s.length <= 40 && !Number.isNaN(Date.parse(s));
const zeitpunkt = (s) => (zeitOk(s) ? new Date(s).toISOString() : null);
const pfad = (verzeichnis, art, name) => (name ? join(verzeichnis, ORDNER[art], name) : join(verzeichnis, ORDNER[art]));
// Ordner des Dienstes unter claude-app/ (auf dem Server legt sie der Installer an, in Tests fehlen sie)
const ordner = (verzeichnis, art) => {
  const o = pfad(verzeichnis, art);
  mkdirSync(o, { recursive: true });
  return o;
};
const leeren = (o, behalten = () => false) => {
  let namen = [];
  try { namen = readdirSync(o); } catch (e) { return; }
  for (const n of namen) if (!behalten(n)) rmSync(join(o, n), { force: true, recursive: true });
};

// Notschalter im signierten Server-Paket (CONNECTOR neben diesem Modul, erste Zeile ohne #): Mit „aus“ ist der Connector auf jedem
// Server ab dessen nächstem Update aus (installieren.sh und studium-server claude-app anwenden lesen dieselbe Datei), und der Dienst
// gibt keine Codes mehr aus. Fehlt die Datei oder steht etwas anderes als „an“ darin: aus.
export function abgeschaltet(datei = new URL("./CONNECTOR", import.meta.url)) {
  try {
    return readFileSync(datei, "utf8").split(/\r?\n/).map((z) => z.trim()).find((z) => z && !z.startsWith("#")) !== "an";
  } catch (e) {
    return true;
  }
}

// Ist der Connector eingeschaltet (Marke schalter/an)?
export const istAn = (verzeichnis) => da(pfad(verzeichnis, "schalter", AN));

// Verbindungen, die der Connector meldet (aus-mcp/verbindungen.json), geprüft → { verbindungen: [{ id, seit, zuletzt, client, von? }],
// frueher: [{ id, seit, ende, grund, client }] } (von: das Gerät, dessen Code die Verbindung einlöste)
const client = (c) => (typeof c === "string" && /^[a-z0-9.-]{1,40}$/.test(c) ? c : "unbekannt");
const mitIdUndSeit = (v) => istObjekt(v) && typeof v.id === "string" && ID.test(v.id) && zeitpunkt(v.seit);
export function verbindungenLesen(verzeichnis) {
  const d = jsonLesen(pfad(verzeichnis, "ausMcp", VERBINDUNGEN), null, 64 * 1024);
  const liste = (k) => (istObjekt(d) && Array.isArray(d[k]) ? d[k] : []);
  const verbindungen = liste("verbindungen").filter(mitIdUndSeit).slice(0, VERBINDUNGEN_MAX).map((v) => ({
    id: v.id, seit: zeitpunkt(v.seit), zuletzt: zeitpunkt(v.zuletzt) || zeitpunkt(v.seit), client: client(v.client),
    ...(typeof v.von === "string" && VON.test(v.von) ? { von: v.von } : {}) }));
  const frueher = liste("frueher").filter((v) => mitIdUndSeit(v) && zeitpunkt(v.ende) && !verbindungen.some((x) => x.id === v.id))
    .slice(0, FRUEHER_MAX).map((v) => ({ id: v.id, seit: zeitpunkt(v.seit), ende: zeitpunkt(v.ende), grund: GRUENDE.includes(v.grund) ? v.grund : "unbekannt",
      client: client(v.client) }));
  return { verbindungen, frueher };
}

// Für Status und Eingang: { an, verbindungen, frueher? } (frueher nur, wenn es beendete gibt; ein Plugin vor Release A übergeht es).
// Eine Verbindung mit offenem Wunsch zum Trennen (trennen/<id>) fehlt schon: Der Connector sieht vor jeder Anfrage nach und lässt sie
// nicht mehr durch, auch wenn er sie noch meldet. Abgeschaltet (Notschalter im Paket) oder aus: an false, keine Verbindungen.
export function claudeAppStatus(verzeichnis, abgeschaltet = false) {
  const an = !abgeschaltet && istAn(verzeichnis);
  if (!an) return { an, verbindungen: [] };
  let offen = [];
  try { offen = readdirSync(pfad(verzeichnis, "trennen")); } catch (e) { /* noch keine */ }
  const gemeldet = verbindungenLesen(verzeichnis), verbindungen = gemeldet.verbindungen.filter((v) => !offen.includes(v.id));
  return gemeldet.frueher.length ? { an, verbindungen, frueher: gemeldet.frueher } : { an, verbindungen };
}

// web/claude-app.json: { ausgestellt: [Zeit] (Codes der letzten 24 Stunden), nonces: { Zufallswert: [Ablauf, Schlüssel] } } (Schlüssel der
// Anfrage: Kennung des Geräts oder „gemeinsam“; eine ältere Fassung schrieb nur den Ablauf)
function zustandLesen(verzeichnis, jetzt) {
  const o = jsonLesen(join(verzeichnis, "web", "claude-app.json"), {}, 256 * 1024);
  const t = jetzt.getTime();
  const ausgestellt = (istObjekt(o) && Array.isArray(o.ausgestellt) ? o.ausgestellt : []).filter((z) => zeitOk(z) && t - Date.parse(z) < TAG)
    .map((z) => new Date(z).toISOString()).sort().slice(-100);
  const nonces = {}, n = istObjekt(o) && istObjekt(o.nonces) ? o.nonces : {};
  for (const k of Object.keys(n)) {
    const [bis, wer] = Array.isArray(n[k]) ? n[k] : [n[k], ""];
    if (NONCE.test(k) && zeitOk(bis) && Date.parse(bis) >= t) nonces[k] = [bis, typeof wer === "string" ? wer.slice(0, 64) : ""];
  }
  return { ausgestellt, nonces };
}
const zustandSchreiben = (verzeichnis, z) => {
  mkdirSync(join(verzeichnis, "web"), { recursive: true });
  schreibenAtomar(join(verzeichnis, "web", "claude-app.json"), JSON.stringify(z), 0o600);
};

// Ab wann wieder ein Code geht (ausgestellt: aufsteigend, letzte 24 Stunden) → ISO-Zeit oder "" (sofort)
function wiederAb(ausgestellt, jetzt) {
  const stunde = ausgestellt.filter((z) => jetzt.getTime() - Date.parse(z) < STUNDE);
  const ab = [];
  if (stunde.length >= CODE.stunde) ab.push(Date.parse(stunde[stunde.length - CODE.stunde]) + STUNDE);
  if (ausgestellt.length >= CODE.tag) ab.push(Date.parse(ausgestellt[ausgestellt.length - CODE.tag]) + TAG);
  return ab.length ? new Date(Math.max(...ab)).toISOString() : "";
}

// Neuer Einmal-Code: zieht alle offenen zurück (höchstens einer), schaltet den Connector ein; von: wer ihn holt → { code, ablauf }
function neuerCode(verzeichnis, jetzt, von) {
  const o = ordner(verzeichnis, "codes");
  leeren(o);
  let code = "";
  for (let i = 0; i < 10; i++) code += ZEICHEN[randomInt(ZEICHEN.length)];
  code = `${code.slice(0, 5)}-${code.slice(5)}`;
  const ablauf = new Date(jetzt.getTime() + CODE.minuten * 60e3).toISOString();
  schreibenAtomar(join(o, `${codeHash(code)}.json`), JSON.stringify({ ablauf, ...(VON.test(String(von || "")) ? { von } : {}) }), 0o640);
  if (!istAn(verzeichnis)) schreibenAtomar(join(ordner(verzeichnis, "schalter"), AN), JSON.stringify({ seit: jetzt.toISOString() }), 0o600);
  return { code, ablauf };
}

// Wünsche zum Trennen räumt der Dienst erst weg, wenn der Connector die Verbindung nicht mehr meldet (aus-mcp/verbindungen.json): War
// er länger aus oder hing er, sieht er den Wunsch beim nächsten Start noch; vorher wegräumen hieße, die Verbindung lebte wieder auf.
// Lässt sich die Datei nicht lesen, bleibt alles; fehlt sie, hat root den Connector samt Zustand gelöscht (aus). Nach
// TRENNEN_HOECHSTENS ist jede Verbindung ohnehin vorbei. „alle“ bleibt: Es gilt nur für Verbindungen bis zu seiner Zeit. Lässt es
// sich nicht lesen (etwa leer nach einem Absturz beim Schreiben), schreibt der Dienst es mit der Zeit der Datei neu, höchstens jetzt
// (der Connector nimmt bis dahin dieselbe): So trennt es weiter alle bis dahin und sperrt keine späteren.
function trennenAufraeumen(verzeichnis, jetzt) {
  const o = pfad(verzeichnis, "trennen");
  const datei = pfad(verzeichnis, "ausMcp", VERBINDUNGEN);
  const gemeldet = !da(datei) ? new Set() : jsonLesen(datei, null, 64 * 1024) === null ? null
    : new Set(verbindungenLesen(verzeichnis).verbindungen.map((v) => v.id));
  leeren(o, (n) => {
    if (n === ALLE) return true;
    let st = null;
    try { st = statSync(join(o, n)); } catch (e) { return false; }
    return ID.test(n) && st.isFile() && jetzt.getTime() - st.mtimeMs < TRENNEN_HOECHSTENS && (gemeldet === null || gemeldet.has(n));
  });
  const alle = join(o, ALLE);
  if (!da(alle) || zeitOk((jsonLesen(alle, null, 4096) || {}).zeit)) return;
  let ms = jetzt.getTime();
  try { ms = Math.min(statSync(alle).mtimeMs, ms); } catch (e) { /* ohne Zeit: jetzt */ }
  rmSync(alle, { force: true, recursive: true });
  schreibenAtomar(alle, JSON.stringify({ zeit: new Date(ms).toISOString() }), 0o640, true);
}

// Was ein getrenntes Gerät (dienst.mjs, geraete.mjs kaskade) bei der Claude-App hinterlässt: offene Codes, die es holte, gelten nicht
// mehr; mit trennen auch die Verbindungen, die mit einem seiner Codes entstanden (Wunsch trennen/<id>), außer denen in behalten. von:
// [Kennung]. Ohne Ordner (Connector nie benutzt) nichts.
export function claudeAppVon(verzeichnis, von, { trennen = false, behalten = [], jetzt = new Date() } = {}) {
  let namen = [];
  try { namen = readdirSync(pfad(verzeichnis, "codes")); } catch (e) { namen = []; }
  for (const n of namen) {
    const c = jsonLesen(pfad(verzeichnis, "codes", n), null, 4096);
    if (c && von.includes(c.von)) rmSync(pfad(verzeichnis, "codes", n), { force: true });
  }
  if (!trennen) return;
  for (const v of verbindungenLesen(verzeichnis).verbindungen) {
    if (!v.von || !von.includes(v.von) || behalten.includes(v.id)) continue;
    schreibenAtomar(join(ordner(verzeichnis, "trennen"), v.id), JSON.stringify({ zeit: jetzt.toISOString() }), 0o640, true);
  }
}

// Ganz aus: alle Verbindungen beenden (trennen/alle mit der Zeit), offene Codes weg, die Marke weg (root hält dann den Connector an,
// entfernt die Wege in Caddy und löscht seinen Zustand), dazu alles, was nur für ihn da war (lage.json, Lagebild, Hinweise).
export function ausschalten(verzeichnis, jetzt = new Date()) {
  schreibenAtomar(join(ordner(verzeichnis, "trennen"), ALLE), JSON.stringify({ zeit: jetzt.toISOString() }), 0o640, true);
  // einzelne Wünsche deckt „alle“ jetzt ab
  leeren(pfad(verzeichnis, "trennen"), (n) => n === ALLE);
  leeren(pfad(verzeichnis, "codes"));
  rmSync(pfad(verzeichnis, "schalter", AN), { force: true });
  rmSync(pfad(verzeichnis, "daten", LAGE), { force: true });
  for (const n of ["lagebild.json", "hinweise.json"]) rmSync(join(verzeichnis, "web", n), { force: true });
}

// POST /v1/claude-app, entschlüsselt (dienst.mjs). adresse: die des Servers (dienst.json); abgeschaltet: Notschalter im Paket
// (CONNECTOR „aus“); lage: schreibt daten/lage.json neu (nach dem Einschalten); wer: Schlüssel der Anfrage (Zufallswerte je Schlüssel);
// von: das fragende Gerät (Kennung oder „gemeinsam“), steht im Code.
// → [Status, Antwort]: 200 je Aktion (siehe oben), 400 { fehler: anfrage | uhr }, 409 { fehler: wiederholt }, 429 { fehler: zu-viele,
// wieder? }, 503 { fehler: abgeschaltet }
export function claudeApp(verzeichnis, anfrage, { jetzt = new Date(), adresse = "", abgeschaltet = false, lage = () => {}, wer = "", von = "" } = {}) {
  const a = istObjekt(anfrage) ? anfrage : {};
  if (a.schema !== 1 || typeof a.nonce !== "string" || !NONCE.test(a.nonce) || !zeitOk(a.zeit) || !AKTIONEN.includes(a.aktion)
    || (a.aktion === "trennen" && (typeof a.id !== "string" || !ID.test(a.id)))) return [400, { fehler: "anfrage" }];
  const zeit = Date.parse(a.zeit);
  if (Math.abs(jetzt.getTime() - zeit) > CODE.uhr) return [400, { fehler: "uhr" }];
  const z = zustandLesen(verzeichnis, jetzt);
  if (z.nonces[a.nonce]) return [409, { fehler: "wiederholt" }];
  if (Object.values(z.nonces).filter((x) => x[1] === wer).length >= CODE.nonces) return [429, { fehler: "zu-viele" }];
  z.nonces[a.nonce] = [new Date(zeit + CODE.uhr).toISOString(), wer];
  trennenAufraeumen(verzeichnis, jetzt);
  if (a.aktion === "code") {
    const wieder = abgeschaltet ? "" : wiederAb(z.ausgestellt, jetzt);
    if (!abgeschaltet && !wieder) z.ausgestellt.push(jetzt.toISOString());
    zustandSchreiben(verzeichnis, z); // erst gemerkt, dann der Code: scheitert das Schreiben, gibt es keinen
    if (abgeschaltet) return [503, { fehler: "abgeschaltet" }];
    if (wieder) return [429, { fehler: "zu-viele", wieder }];
    const { code, ablauf } = neuerCode(verzeichnis, jetzt, von);
    lage();
    return [200, { code, ablauf, adresse: `${String(adresse).replace(/\/+$/, "")}/mcp` }];
  }
  zustandSchreiben(verzeichnis, z);
  if (a.aktion === "trennen") {
    schreibenAtomar(join(ordner(verzeichnis, "trennen"), a.id), JSON.stringify({ zeit: jetzt.toISOString() }), 0o640, true);
    return [200, claudeAppStatus(verzeichnis, abgeschaltet)];
  }
  if (a.aktion === "aus") {
    ausschalten(verzeichnis, jetzt);
    return [200, { an: false, verbindungen: [] }];
  }
  return [200, claudeAppStatus(verzeichnis, abgeschaltet)];
}

// ---------- Lagebild aus dem Stand (POST /v1/stand, nur solange der Connector an ist) ----------
// Nur geprüfte, kurze Fakten aus den Parsern des Plugins: Häkchen im Lernplan, fällige Karten, Prüfungen mit Anmeldung, Versuch und
// Note, Stundenplan der nächsten 14 Tage. Unbekannte Felder fallen weg; ein Eintrag ohne Pflichtfeld oder mit falschem Typ ganz, ein
// falsches freiwilliges Feld nur selbst. Texte ohne Links und HTML (saeubern wie die Hinweise im Eingang), nichts, was nach
// Zugangsdaten aussieht. Grenzen: LAGEBILD (wie LAGE in server.js des Plugins; note: Zeichen einer Note oder eines Ergebnisses wie
// „endgültig nicht bestanden“, gilt auch in mcp-quelle-server.mjs); den ganzen Stand begrenzt dienst.mjs auf 512 KB.
export const LAGEBILD = { module: 40, kapitel: 200, karten: 40, pruefungen: 100, stundenplan: 300, tage: 14, note: 30 };
const lesetext = (v, max) => {
  if (typeof v !== "string") return "";
  const r = saeubern(ohneLinks(v), max, false, []);
  return r.fehler || hatZugangsdaten(r.wert) ? "" : r.wert;
};
const UHRZEIT = /^([01]\d|2[0-3]):[0-5]\d$/;
const nummer = (n) => (Number.isInteger(n) && n >= 0 && n <= 999 ? String(n)
  : typeof n === "string" && /^[0-9A-Z][0-9A-Za-z.]{0,7}$/.test(n) ? n : "");
const woche = (w) => (Number.isInteger(w) && w >= 1 && w <= 53 ? w
  : typeof w === "string" && (datumOk(w) || /^\d{4}-W(?:0[1-9]|[1-4]\d|5[0-3])$/.test(w)) ? w : null);
const note = (n) => (typeof n === "number" && Number.isFinite(n) && n >= 1 && n <= 5 ? n.toFixed(1).replace(".", ",") : lesetext(n, LAGEBILD.note));
const tagPlus = (heute, n) => new Date(Date.parse(heute + "T00:00:00Z") + n * TAG).toISOString().slice(0, 10);
const jeModul = (liste, max, f) => {
  const aus = [];
  for (const x of (Array.isArray(liste) ? liste : []).slice(0, max)) {
    if (!istObjekt(x) || typeof x.modul !== "string" || !MODULCODE.test(x.modul) || aus.some((y) => y.modul === x.modul)) continue;
    const e = f(x);
    if (e) aus.push(e);
  }
  return aus;
};
export function lagebildPruefen(l, heute = new Date().toISOString().slice(0, 10)) {
  if (!istObjekt(l)) return null;
  const aus = {};
  if (Array.isArray(l.lernplan)) {
    aus.lernplan = jeModul(l.lernplan, LAGEBILD.module, (m) => (!Array.isArray(m.kapitel) ? null : {
      modul: m.modul,
      kapitel: m.kapitel.slice(0, LAGEBILD.kapitel).map((k) => {
        const titel = istObjekt(k) && typeof k.verstanden === "boolean" ? lesetext(k.titel, 160) : "";
        if (!titel) return null;
        const e = { titel, verstanden: k.verstanden };
        if (nummer(k.nummer)) e.nummer = nummer(k.nummer);
        if (woche(k.woche) !== null) e.woche = woche(k.woche);
        return e;
      }).filter(Boolean),
    }));
  }
  if (Array.isArray(l.karten)) {
    aus.karten = jeModul(l.karten, LAGEBILD.karten, (k) => (Number.isInteger(k.faellig) && k.faellig >= 0 && k.faellig <= 100000
      ? { modul: k.modul, faellig: k.faellig } : null));
  }
  if (Array.isArray(l.pruefungen)) {
    aus.pruefungen = [];
    for (const p of l.pruefungen.slice(0, LAGEBILD.pruefungen)) {
      if (!istObjekt(p) || typeof p.modul !== "string" || !MODULCODE.test(p.modul)) continue;
      const e = { modul: p.modul };
      if (lesetext(p.titel, 160)) e.titel = lesetext(p.titel, 160);
      if (datumOk(p.datum)) e.datum = p.datum;
      const anmeldung = datumOk(p.anmeldung) ? p.anmeldung : lesetext(p.anmeldung, 60);
      if (anmeldung) e.anmeldung = anmeldung;
      if (Number.isInteger(p.versuch) && p.versuch >= 1 && p.versuch <= 10) e.versuch = p.versuch;
      if (note(p.note)) e.note = note(p.note);
      aus.pruefungen.push(e);
    }
  }
  if (Array.isArray(l.stundenplan)) {
    // die nächsten 14 Tage (einen Tag Spielraum je Seite für Zeitzone und Uhr des Geräts)
    const von = tagPlus(heute, -1), bis = tagPlus(heute, LAGEBILD.tage + 1);
    aus.stundenplan = [];
    for (const s of l.stundenplan.slice(0, LAGEBILD.stundenplan)) {
      const titel = istObjekt(s) && datumOk(s.datum) && s.datum >= von && s.datum <= bis ? lesetext(s.titel, 160) : "";
      if (!titel) continue;
      const e = { datum: s.datum, titel };
      if (UHRZEIT.test(String(s.von))) e.von = s.von;
      if (UHRZEIT.test(String(s.bis))) e.bis = s.bis;
      if (lesetext(s.ort, 120)) e.ort = lesetext(s.ort, 120);
      if (typeof s.modul === "string" && MODULCODE.test(s.modul)) e.modul = s.modul;
      if (s.ausfall === true) e.ausfall = true;
      aus.stundenplan.push(e);
    }
  }
  return aus;
}

// ---------- Hinweise und Lage für den Connector ----------
// Text aus einer Mail (Hinweis, Termin aus dem Eingang) für claude.ai: wie lesetext, dazu nichts, was nach Zugangsdaten aussieht oder
// einen Link enthält oder wie eine Anweisung an ein Modell aussieht (wieAnweisung, wie für tresor.json im Lauf und die Titel zentraler
// Termine), geprüft vor und nach dem Säubern → Text oder "" (dann fällt der Eintrag bzw. das Feld weg). Eine Heuristik; dazu sagen die
// Werkzeuge, dass Texte aus Mails Daten sind.
const mailText = (v, max) => {
  const t = lesetext(v, max);
  return !t || [v, t].some((x) => hatZugangsdaten(x) || wieAnweisung(x)) ? "" : t;
};
const UHRZEIT_MAIL = /^([01]\d|2[0-3]):[0-5]\d(?:–([01]\d|2[0-3]):[0-5]\d)?$/;
// Hinweise der Eingang-Dateien, die Obsidian eben übernommen hat (POST /v1/stand löscht sie danach): Der Connector zeigt sie
// HINWEISE.tage lang weiter (web/hinweise.json, nur der Dienst liest es), solange er an ist.
export function hinweiseMerken(verzeichnis, namen, jetzt = new Date()) {
  if (!istAn(verzeichnis)) return;
  const datei = join(verzeichnis, "web", "hinweise.json");
  const alt = jsonLesen(datei, [], 1024 * 1024);
  const neu = [];
  for (const name of namen) {
    const inhalt = jsonLesen(join(verzeichnis, "eingang", name), null, 4 * 1024 * 1024);
    if (!istObjekt(inhalt) || !Array.isArray(inhalt.hinweise)) continue;
    for (const h of inhalt.hinweise) if (istObjekt(h)) neu.push({ ...h, seit: zeitpunkt(inhalt.erstellt) || jetzt.toISOString() });
  }
  if (!neu.length) return;
  const grenze = jetzt.getTime() - HINWEISE.tage * TAG;
  const liste = (Array.isArray(alt) ? alt : []).concat(neu).filter((h) => istObjekt(h) && zeitOk(h.seit) && Date.parse(h.seit) >= grenze)
    .slice(-HINWEISE.hoechstens);
  schreibenAtomar(datei, JSON.stringify(liste), 0o600);
}

// Ein Hinweis aus dem Eingang (eingangNormal in eingang.mjs hat ihn schon geprüft; hier noch einmal, er kommt aus einer Datei); Text
// und Quelle wie mailText: ohne lesbaren Text fällt er weg, eine fragwürdige Quelle nur selbst
const hinweis = (h, inObsidian) => {
  const text = mailText(h.text, 300);
  if (!text) return null;
  const e = { text, seit: zeitpunkt(h.seit), in_obsidian: inObsidian };
  const quelle = mailText(h.quelle, 200);
  if (quelle) e.quelle = quelle;
  if (typeof h.code === "string" && MODULCODE.test(h.code)) e.code = h.code;
  return e;
};
// Ein Termin aus Mails im Eingang (terminNormal hat ihn geprüft): nur die Felder, die der Connector zeigt; Titel wie mailText (sonst
// fällt der Termin weg), Ort und Info ebenso (sonst nur sie)
const mailTermin = (t) => {
  const titel = mailText(t.titel, 160);
  if (!titel || !datumOk(t.datum)) return null;
  const e = { id: typeof t.id === "string" ? t.id.slice(0, 40) : "", titel, datum: t.datum, bis: datumOk(t.bis) ? t.bis : "",
    uhrzeit: typeof t.uhrzeit === "string" && UHRZEIT_MAIL.test(t.uhrzeit) ? t.uhrzeit : "", ort: mailText(t.ort, 160), kategorie: t.kategorie,
    status: t.status, code: typeof t.code === "string" && MODULCODE.test(t.code) ? t.code : "", info: mailText(t.info, 300) };
  if (t.entfaellt === true) e.entfaellt = true;
  return e;
};

// daten/lage.json für den Connector schreiben, wenn er an ist, sonst löschen, und mit ihr alles, was nur für ihn da ist (Lagebild,
// gemerkte Hinweise): aus in Obsidian oder abgeschaltet (Notschalter im Paket). eingang: das Bündel wie für /v1/eingang
// (eingangBuendel in dienst.mjs). Enthält nur, was das Plugin ohnehin schickt bzw. abholt: Stand ohne Takt, Lagebild, Hinweise,
// noch nicht übernommene Termine; dazu, wann der Stand ankam und wann Obsidian zuletzt abgeholt hat (für den Stand der Werkzeuge).
// Texte aus Mails (Hinweise, Titel, Ort und Info der Termine) nur wie mailText; Termine und To-dos aus dem Stand hat standPruefen
// (tresorPruefen in dienst.mjs) schon so geprüft. Gemerkte Hinweise nur aus den letzten HINWEISE.tage: Ältere fallen auch aus
// web/hinweise.json, nicht erst mit dem nächsten neuen Hinweis.
// → true, wenn geschrieben
export function lageSchreiben(verzeichnis, eingang, jetzt = new Date(), notschalter = false) {
  const ziel = pfad(verzeichnis, "daten", LAGE);
  const web = (n) => join(verzeichnis, "web", n);
  if (notschalter || !istAn(verzeichnis)) {
    for (const f of [ziel, web("lagebild.json"), web("hinweise.json")]) rmSync(f, { force: true });
    return false;
  }
  const s = jsonLesen(web("stand-plugin.json"), null, 2 * 1024 * 1024);
  let empfangen = null;
  try { if (istDatei(web("stand-plugin.json"))) empfangen = new Date(statSync(web("stand-plugin.json")).mtimeMs).toISOString(); } catch (e) { /* ohne */ }
  const abruf = jsonLesen(web("abruf.json"), {}, 4096);
  const dateien = istObjekt(eingang) && Array.isArray(eingang.dateien) ? eingang.dateien : [];
  const offen = dateien.flatMap((d) => (istObjekt(d.inhalt) && Array.isArray(d.inhalt.hinweise)
    ? d.inhalt.hinweise.filter(istObjekt).map((h) => ({ ...h, seit: d.inhalt.erstellt })) : []));
  const gemerkt = jsonLesen(web("hinweise.json"), [], 1024 * 1024);
  const grenze = jetzt.getTime() - HINWEISE.tage * TAG;
  const frisch = (Array.isArray(gemerkt) ? gemerkt : []).filter((h) => istObjekt(h) && zeitOk(h.seit) && Date.parse(h.seit) >= grenze);
  if (Array.isArray(gemerkt) && frisch.length < gemerkt.length) {
    if (frisch.length) schreibenAtomar(web("hinweise.json"), JSON.stringify(frisch), 0o600);
    else rmSync(web("hinweise.json"), { force: true });
  }
  // die neuesten (Eingang-Dateien nach Namen, also Zeit), damit lage.json klein bleibt (der Connector liest höchstens 4 MB)
  const hinweise = [...frisch.map((h) => hinweis(h, true)),
    ...offen.map((h) => hinweis(h, false))].filter(Boolean).slice(-LAGE_MAX.hinweise);
  const termine = dateien.flatMap((d) => (istObjekt(d.inhalt) && Array.isArray(d.inhalt.termine) ? d.inhalt.termine.filter(istObjekt) : []))
    .slice(-LAGE_MAX.termine).map(mailTermin).filter(Boolean);
  const lagebild = jsonLesen(web("lagebild.json"), null, 1024 * 1024);
  const stand = istObjekt(s) ? { module: Array.isArray(s.module) ? s.module : [], studienbeginn: s.studienbeginn || "", variante: s.variante || "",
    semester: istObjekt(s.lernplan) ? s.lernplan.semester || "" : "",
    termine: istObjekt(s.tresor) && Array.isArray(s.tresor.termine) ? s.tresor.termine : [],
    todos: istObjekt(s.tresor) && Array.isArray(s.tresor.todos) ? s.tresor.todos : [] } : null;
  const lage = { schema: 1, erzeugt: jetzt.toISOString(), stand_empfangen: empfangen, abruf: istObjekt(abruf) ? zeitpunkt(abruf.zuletzt) : null,
    stand, lagebild: istObjekt(lagebild) ? lagebild : null, eingang: { termine, hinweise } };
  schreibenAtomar(join(ordner(verzeichnis, "daten"), LAGE), JSON.stringify(lage), 0o640);
  return true;
}

// realpathSync: Node löst den Symlink /opt/studium-server/aktuell für import.meta.url auf, für argv[1] nicht.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const verzeichnis = process.env.STUDIUM_SERVER_DATEN || "/var/lib/studium-server";
  const befehl = process.argv[2];
  if (befehl === "aus") {
    ausschalten(verzeichnis);
    console.log("Claude-App aus: alle Verbindungen beendet, offene Codes weg.");
  } else if (befehl === "status") {
    console.log(JSON.stringify(claudeAppStatus(verzeichnis, abgeschaltet())));
  } else {
    console.error("Aufruf: node claude-app.mjs status|aus");
    process.exit(2);
  }
}
