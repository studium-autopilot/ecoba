#!/usr/bin/env node
// Web-Dienst des eigenen Servers. Lauscht nur auf 127.0.0.1; Caddy stellt ihn per HTTPS unter /v1/ bereit.
//   GET  /v1/status     öffentlich: Stand ohne persönliche Daten (nur feste Werte aus einer Freigabeliste)
//   GET  /v1/eingang    mit Zugangsschlüssel: noch nicht übernommene Ergebnisse als verschlüsseltes Paket (kanal.mjs)
//   POST /v1/stand      mit Zugangsschlüssel: verschlüsselter Stand des Plugins (Modulcodes, Studienbeginn, Variante, ein
//                       Auszug aus dem Tresor gegen Doppel: Termine mit Titel und Datum, offene To-dos; der Takt aus den
//                       Einstellungen, auch als takt.json für abrufen.py und lauf.mjs; schon übernommene Eingang-Dateien, diese
//                       werden danach auf dem Server gelöscht)
//   POST /v1/unterlagen mit Zugangsschlüssel: verschlüsselt bis zu 3 Textfassungen von PDFs (Folien, Skripte …), zu denen
//                       Claude eine Begleitnotiz schreiben soll; landen in unterlagen/neu/ (mit modell: "opus", auf Wunsch per
//                       Knopf: unterlagen/opus/, eigener Lauf mit Opus; mit nur_termine nur nach Terminen durchsuchen, ohne
//                       Begleitnotiz), ein Anstoß startet den Lauf
//   POST /v1/pdf        mit Zugangsschlüssel: verschlüsselt ein Stück (8 MB) einer PDF zu einer gewünschten Zusammenfassung;
//                       zusammengesetzt und geprüft (SHA-256) landet sie als unterlagen/opus/<SHA-256>.pdf neben der Textfassung,
//                       die gleich danach kommt, und Opus liest sie
//   POST /v1/anstoss    mit Zugangsschlüssel: Knopf „Mails durchsuchen“ in Obsidian startet einen Claude-Lauf (mit Gmail),
//                       höchstens einmal in 10 Minuten; wartet schon ein Anstoß, bleibt er
//   POST /v1/verbinden  Einmal-Code (verbinden.mjs) gegen Adresse, Zugangs- und Datenschlüssel
//   GET  /v1/livesync/<kennung>  Seite mit dem Setup-Link für LiveSync (livesync.mjs, 30 Minuten; verschlüsselt mit einem Code,
//                       den nur das Terminal zeigt)
// Konfiguration $STUDIUM_SERVER_KONFIG (Standard /etc/studium-server/dienst.json: zugang, schluessel, adresse, port,
// version), Daten $STUDIUM_SERVER_DATEN (Standard /var/lib/studium-server).
import { createHash, timingSafeEqual } from "node:crypto";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readdirSync, readSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { datumOk, KATEGORIEN, MODULCODE, saeubern, TODO_ID } from "./eingang.mjs";
import { entschluesseln, entschluesselnRoh, verschluesseln } from "./kanal.mjs";
import { abholen, seite } from "./livesync.mjs";
import { codeEinloesen } from "./verbinden.mjs";

const TAG = 864e5;
const EINGANG_TAGE = 30, EINGANG_HOECHSTENS = 180;
// PDFs zu gewünschten Zusammenfassungen: in Stücken zu 8 MB (jedes ein eigenes Paket, so braucht weder das Gerät noch der Dienst
// die ganze PDF auf einmal im Speicher), je PDF bis 500 MB, höchstens 6 und zusammen 1 GB warten (die Platte); eine PDF ohne
// Textfassung daneben oder ein halb hochgeladenes Stück verfällt nach einem Tag (das Plugin schickt die PDF vor dem Text)
export const PDF = { teil: 8 * 1024 * 1024, bytes: 500 * 1024 * 1024, gesamt: 1024 * 1024 * 1024, warten: 6, verfall: TAG };
// Größte Anfrage je Weg (verschlüsselt, base64): Stand mit Auszug aus dem Tresor bis 512 KB, Textfassungen bis 4 MB, ein Stück
// einer PDF mit Kopfzeile und dem Aufschlag von base64
const MAX_KOERPER = { "/v1/verbinden": 4 * 1024, "/v1/stand": 512 * 1024, "/v1/unterlagen": 4 * 1024 * 1024, "/v1/anstoss": 1024,
  "/v1/pdf": Math.ceil((PDF.teil + 1024) * 4 / 3) + 4096 };
const KNOPF_ABSTAND = 10 * 60e3; // Knopf „Mails durchsuchen“: höchstens so oft (jeder Lauf kostet Abo-Limit)
// „läuft“ gilt höchstens so lange wie die Zeitgrenze des Laufs (TimeoutStartSec in installieren.sh; ein abgebrochener Lauf hängt
// nicht für immer)
const LAUF_HOECHSTENS = 100 * 60e3;
// Textfassungen: höchstens 3 je Anfrage (das Plugin schickt bis zu 3 Anfragen je Abruf), je 400 000 Zeichen, höchstens 30 warten
// auf einen Lauf
const UNTERLAGEN = { anfrage: 3, zeichen: 400000, warten: 30 };
const ARTEN = ["Folien", "Skript", "Übung", "Tutorium", "Lab", "Lösung", "Altklausur", "Literatur"];
// Je Absender höchstens 10 Fehlversuche in 10 Minuten, dann 429. Ein gültiger Zugangsschlüssel wird nie gesperrt (sonst könnte
// jeder das Plugin aussperren). Absender = letzter Eintrag in X-Forwarded-For (setzt Caddy; der Dienst lauscht nur auf 127.0.0.1).
const SPERRE = { fehler: 10, fenster: 10 * 60e3, absender: 5000 };
export const DATEINAME = /^[0-9A-Za-z][0-9A-Za-z._-]{0,119}\.json$/;

const lesen = (datei, ersatz) => {
  try { return JSON.parse(readFileSync(datei, "utf8")); } catch (e) { return ersatz; }
};
const digest = (text) => createHash("sha256").update(String(text || "")).digest();
const gleich = (a, b) => timingSafeEqual(digest(a), digest(b));
const aus = (wert, erlaubt) => (erlaubt.includes(wert) ? wert : "unbekannt");

// Öffentlicher Status: nur Werte aus festen Listen und Zeitpunkte, nie Namen, Adressen, Texte oder Schlüssel. Feldnamen klein
// mit Unterstrich wie in den zentralen Daten (docs/daten-v1.md).
// claude_lauf: wartet (Anstoß liegt da) | laeuft (seit weniger als LAUF_HOECHSTENS) | ruht. gmail: aus, solange der Takt aus
// Obsidian (takt.json) Gmail auf „nie“ stellt; sonst stünde dort das Ergebnis der letzten Suche, als liefe sie noch.
export function oeffentlicherStatus(zustand, abruf, version, jetzt = new Date(), anstossWartet = false, takt = {}) {
  const z = zustand || {};
  const seit = Date.parse(z.laeuftSeit || "");
  const claudeLauf = anstossWartet ? "wartet" : !Number.isNaN(seit) && jetzt.getTime() - seit < LAUF_HOECHSTENS ? "laeuft" : "ruht";
  const lauf = z.letzterLauf && !Number.isNaN(Date.parse(z.letzterLauf.zeit))
    ? { zeit: new Date(z.letzterLauf.zeit).toISOString(), ok: z.letzterLauf.ok === true } : null;
  return {
    schema: 1,
    version: String(version || "").slice(0, 40),
    zeit: jetzt.toISOString(),
    claude: aus(z.claude, ["angemeldet", "abgemeldet"]),
    gmail: taktPruefen(takt).gmail === 0 ? "aus" : aus(z.gmail, ["ok", "fehlt"]),
    weiterleitung: aus(z.weiterleitung, ["ok", "fehlt"]),
    uni_zugang: aus(z.uniZugang, ["gespeichert", "fehlt", "falsch"]),
    speicher_reserve: aus(z.speicherReserve, ["an", "aus"]),
    livesync: z.livesync === "an" ? "an" : "aus",
    plugin_abruf: abruf && !Number.isNaN(Date.parse(abruf.zuletzt)) ? new Date(abruf.zuletzt).toISOString() : null,
    letzter_lauf: lauf,
    claude_lauf: claudeLauf,
    fehler: (Array.isArray(z.fehler) ? z.fehler : []).filter((f) => /^[a-z0-9-]{1,40}$/.test(f)).slice(0, 10),
  };
}

// Eingang-Dateien, die das Plugin noch nicht übernommen hat (übernommene löscht POST /v1/stand). Wer Obsidian länger nicht
// öffnet (Semesterferien), verliert nichts: Nach 30 Tagen fällt eine Datei nur weg, wenn alle ihre Termine vorbei sind
// (Hinweise sind dann veraltet), spätestens nach 180 Tagen. Ungültige Dateien gehen nicht raus und fallen nach 30 Tagen weg.
const allesVorbei = (inhalt, heute) => !inhalt || !Array.isArray(inhalt.termine)
  || inhalt.termine.every((t) => !t || String(t.bis || t.datum || "") < heute);
export function eingangBuendel(verzeichnis, jetzt = new Date()) {
  const ordner = join(verzeichnis, "eingang");
  mkdirSync(ordner, { recursive: true });
  const heute = jetzt.toISOString().slice(0, 10);
  const dateien = [];
  for (const name of readdirSync(ordner).filter((n) => DATEINAME.test(n)).sort()) {
    const datei = join(ordner, name);
    const alter = jetzt - statSync(datei).mtime;
    const inhalt = lesen(datei, null);
    const gueltig = inhalt && typeof inhalt === "object";
    if (alter > EINGANG_HOECHSTENS * TAG || (alter > EINGANG_TAGE * TAG && (!gueltig || allesVorbei(inhalt, heute)))) {
      rmSync(datei, { force: true });
      continue;
    }
    if (gueltig) dateien.push({ name, inhalt });
  }
  return { schema: 1, erzeugt: jetzt.toISOString(), dateien };
}

// Auszug aus dem Tresor, nur für Claude auf diesem Server (tresor.json im Lauf, gegen Doppel): Termine mit Titel, Datum,
// Kategorie, Modulcode, Herkunft und erledigt; offene To-dos mit Text, Modulcode und Frist. Jeder Eintrag einzeln geprüft und
// gesäubert wie das Eingang, Ungültiges fällt weg. To-dos, die nach Zugangsdaten aussehen, kommen nie an.
const TRESOR_MAX = { termine: 400, todos: 200 };
const GEHEIM = /passw|kennw|password|\bpw\b|zugangscode|\bpin\b/i;
export function tresorPruefen(roh) {
  const t = roh && typeof roh === "object" ? roh : {};
  const tag = (d) => (datumOk(d) ? d : "");
  const code = (c) => (typeof c === "string" && MODULCODE.test(c) ? c : "");
  const termine = (Array.isArray(t.termine) ? t.termine : []).slice(0, TRESOR_MAX.termine).map((x) => {
    const titel = saeubern(x && x.titel, 120, true);
    if (titel.fehler || !tag(x.datum)) return null;
    return { titel: titel.wert, datum: x.datum, bis: tag(x.bis), kategorie: KATEGORIEN.includes(x.kategorie) ? x.kategorie : "", code: code(x.code),
      herkunft: typeof x.herkunft === "string" && /^[a-z][a-z-]{0,29}$/.test(x.herkunft) ? x.herkunft : "", erledigt: x.erledigt === true };
  }).filter(Boolean);
  // To-dos mit Kennung (für doppelte), Notiz und ob sie zusammengeführt werden dürfen (offene Aufgabe unter „Zu tun“ einer
  // Begleitnotiz; das Plugin prüft es beim Anwenden noch einmal)
  const todos = (Array.isArray(t.todos) ? t.todos : []).slice(0, TRESOR_MAX.todos).map((x) => {
    const text = saeubern(x && x.text, 200, true);
    if (text.fehler || GEHEIM.test(text.wert)) return null;
    const pfad = saeubern(x.pfad, 240, false);
    const o = { text: text.wert, code: code(x.code), frist: tag(x.frist) };
    if (TODO_ID.test(String(x.id))) o.id = x.id;
    if (!pfad.fehler && pfad.wert && !pfad.wert.split("/").includes("..") && pfad.wert.endsWith(".md")) o.pfad = pfad.wert;
    if (x.aenderbar === true) o.aenderbar = true;
    return o;
  }).filter(Boolean);
  return { termine, todos };
}

// Textfassungen von PDFs für Begleitnotizen: Pfad wie im Eingang (unter Unterlagen/, keine Ausbrüche, .pdf), Kennung = SHA-256
// der PDF (Dateiname auf dem Server), nur Lehrmaterial (ARTEN), Text ohne Steuerzeichen außer Zeilenumbruch. → [{ … }] oder wirft
export function unterlagenPruefen(roh) {
  if (!roh || roh.schema !== 1 || !Array.isArray(roh.unterlagen)) throw new Error("Unterlagen: unbekanntes Schema");
  const aus = [];
  for (const u of roh.unterlagen.slice(0, UNTERLAGEN.anfrage)) {
    if (!u || typeof u !== "object" || typeof u.datei !== "string" || typeof u.text !== "string") continue;
    const pfad = u.datei.replace(/\\/g, "/").trim();
    if (!pfad.startsWith("Unterlagen/") || !/\.pdf$/i.test(pfad) || pfad.length > 240 || pfad.split("/").some((t) => !t || t === "." || t === "..") ||
      /[\u0000-\u001f<>:"|?*]/.test(pfad)) continue;
    if (typeof u.kennung !== "string" || !/^[0-9a-f]{64}$/.test(u.kennung) || !ARTEN.includes(u.art)) continue;
    const text = u.text.replace(/[\u0000-\u0008\u000b-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, " ").slice(0, UNTERLAGEN.zeichen);
    if (!text.trim()) continue;
    const titel = saeubern(u.titel, 160, false);
    aus.push({ datei: pfad, kennung: u.kennung, art: u.art, titel: titel.fehler ? "" : titel.wert, code: typeof u.code === "string" && MODULCODE.test(u.code) ? u.code : "",
      seiten: Number.isInteger(u.seiten) && u.seiten > 0 && u.seiten < 10000 ? u.seiten : 0, opus: u.modell === "opus", nurTermine: u.modell !== "opus" && u.nur_termine === true, text });
  }
  return aus;
}

// Legt geprüfte Textfassungen für den nächsten Lauf ab (unterlagen/neu/<kennung>.md) und stößt ihn an, wenn nicht schon einer
// wartet (ein wartender Anstoß, z. B. Gmail, bleibt, wie er ist). → Zahl der neuen Dateien; wirft bei zu vielen wartenden
export function unterlagenAblegen(verzeichnis, unterlagen, jetzt = new Date()) {
  const ordner = (art) => join(verzeichnis, "unterlagen", art);
  for (const art of ["neu", "opus"]) mkdirSync(ordner(art), { recursive: true });
  const da = ["neu", "opus"].reduce((s, art) => s + readdirSync(ordner(art)).filter((n) => n.endsWith(".md")).length, 0);
  if (da + unterlagen.length > UNTERLAGEN.warten) throw Object.assign(new Error("zu viele"), { status: 429 });
  let n = 0;
  for (const u of unterlagen) {
    const ziel = join(ordner(u.opus ? "opus" : "neu"), u.kennung + ".md");
    if (u.opus) rmSync(join(ordner("neu"), u.kennung + ".md"), { force: true }); // auf Wunsch mit Opus statt im gewöhnlichen Lauf
    const kopf = [`# ${u.titel || u.datei.slice(u.datei.lastIndexOf("/") + 1)}`, "", `Datei: ${u.datei}`,
      `Modul: ${u.code || "–"} · Art: ${u.art}${u.seiten ? ` · Seiten: ${u.seiten}` : ""}`,
      ...(u.nurTermine ? ["Auftrag: nur Termine (keine Begleitnotiz)"] : []),
      ...(u.opus && existsSync(join(ordner("opus"), u.kennung + ".pdf")) ? [`PDF: ${u.kennung}.pdf (liegt daneben; lies die PDF statt dieses Textes)`] : []),
      "", "---", ""];
    writeFileSync(ziel + ".neu", kopf.join("\n") + u.text + "\n");
    renameSync(ziel + ".neu", ziel);
    n++;
  }
  const anstoss = join(verzeichnis, "anstoss");
  if (n && !existsSync(anstoss)) {
    writeFileSync(anstoss + ".neu", JSON.stringify({ zeit: jetzt.toISOString(), grund: "unterlagen" }));
    renameSync(anstoss + ".neu", anstoss);
  }
  return n;
}

// PDFs ohne Textfassung daneben und halb hochgeladene, älter als PDF.verfall, löschen (auch lauf.mjs vor einem Lauf mit Opus)
export function pdfAufraeumen(ordner, jetzt = new Date()) {
  if (!existsSync(ordner)) return;
  for (const n of readdirSync(ordner)) {
    const m = /^([0-9a-f]{64})\.pdf(\.teil)?$/.exec(n);
    if (!m || (!m[2] && existsSync(join(ordner, m[1] + ".md")))) continue;
    try { if (jetzt.getTime() - statSync(join(ordner, n)).mtimeMs > PDF.verfall) rmSync(join(ordner, n), { force: true }); } catch (e) { /* schon weg */ }
  }
}

// Ein Stück einer PDF für den Lauf mit Opus (unterlagen/opus/<SHA-256>.pdf, die Kennung der Textfassung). Entschlüsselt: eine
// Kopfzeile { schema: 1, kennung, teil, teile } als JSON, Zeilenumbruch, dann die Bytes; alle Stücke außer dem letzten genau
// PDF.teil groß, der Reihe nach (sonst 409). Das erste beginnt mit „%PDF-“ (sonst 400) und prüft die Grenzen (413, 429); nach dem
// letzten muss der SHA-256 stimmen (sonst 400), erst dann heißt die Datei .pdf. → { kennung, fertig }
export function pdfTeilAblegen(verzeichnis, klar, jetzt = new Date()) {
  const fehler = (status, text) => Object.assign(new Error(text), { status });
  const nl = klar.indexOf(10);
  if (nl < 0 || nl > 1024) throw fehler(400, "Kopfzeile fehlt");
  let k;
  try { k = JSON.parse(klar.subarray(0, nl).toString("utf8")); } catch (e) { throw fehler(400, "Kopfzeile ungültig"); }
  const bytes = klar.subarray(nl + 1);
  if (!k || k.schema !== 1 || typeof k.kennung !== "string" || !/^[0-9a-f]{64}$/.test(k.kennung) || !Number.isInteger(k.teile) || !Number.isInteger(k.teil) ||
    k.teile < 1 || k.teil < 0 || k.teil >= k.teile) throw fehler(400, "Kopfzeile ungültig");
  if (k.teile > Math.ceil(PDF.bytes / PDF.teil)) throw fehler(413, "zu groß");
  const letztes = k.teil === k.teile - 1;
  if (letztes ? !bytes.length || bytes.length > PDF.teil : bytes.length !== PDF.teil) throw fehler(400, "Stück falsch groß");
  const ordner = join(verzeichnis, "unterlagen", "opus");
  mkdirSync(ordner, { recursive: true });
  const ziel = join(ordner, k.kennung + ".pdf"), teil = ziel + ".teil";
  if (k.teil === 0) {
    if (bytes.subarray(0, 5).toString("latin1") !== "%PDF-") throw fehler(400, "keine PDF");
    pdfAufraeumen(ordner, jetzt);
    const andere = readdirSync(ordner).filter((n) => /^[0-9a-f]{64}\.pdf(\.teil)?$/.test(n) && !n.startsWith(k.kennung));
    const belegt = andere.reduce((s, n) => { try { return s + statSync(join(ordner, n)).size; } catch (e) { return s; } }, 0);
    if (andere.length >= PDF.warten || belegt + k.teile * PDF.teil > PDF.gesamt) throw fehler(429, "zu viele");
    writeFileSync(teil, bytes);
  } else {
    let da = -1;
    try { da = statSync(teil).size; } catch (e) { /* fehlt */ }
    if (da !== k.teil * PDF.teil) throw fehler(409, "Stück außer der Reihe");
    appendFileSync(teil, bytes);
  }
  if (!letztes) return { kennung: k.kennung, fertig: false };
  const h = createHash("sha256"), puffer = Buffer.alloc(PDF.teil), fd = openSync(teil, "r");
  try { for (let n; (n = readSync(fd, puffer, 0, puffer.length, null)) > 0;) h.update(puffer.subarray(0, n)); } finally { closeSync(fd); }
  if (h.digest("hex") !== k.kennung) { rmSync(teil, { force: true }); throw fehler(400, "Prüfsumme"); }
  renameSync(teil, ziel);
  return { kennung: k.kennung, fertig: true };
}

// Knopf „Mails durchsuchen“: Anstoß für einen Lauf mit Gmail (Grund knopf). Wartet schon einer, bleibt er (ein wartender
// Gmail-Anstoß sucht ohnehin). Höchstens einmal in KNOPF_ABSTAND. → [Status, Antwort]
export function knopfAnstoss(verzeichnis, jetzt = new Date()) {
  const knopf = join(verzeichnis, "knopf.json");
  const zuletzt = Date.parse((lesen(knopf, {}) || {}).zuletzt || "");
  if (!Number.isNaN(zuletzt) && jetzt.getTime() - zuletzt < KNOPF_ABSTAND) {
    return [429, { fehler: "zu-frueh", wieder: new Date(zuletzt + KNOPF_ABSTAND).toISOString() }];
  }
  writeFileSync(knopf, JSON.stringify({ zuletzt: jetzt.toISOString() }));
  const anstoss = join(verzeichnis, "anstoss");
  if (existsSync(anstoss)) return [200, { angestossen: true, wartete: true }];
  writeFileSync(anstoss + ".neu", JSON.stringify({ zeit: jetzt.toISOString(), grund: "knopf" }));
  renameSync(anstoss + ".neu", anstoss);
  return [200, { angestossen: true }];
}

// Takt aus den Einstellungen in Obsidian: Uni-Postfach alle 15, 30 oder 60 Minuten, Gmail 3-, 1- oder 0-mal am Tag; alles
// andere (auch ein älteres Plugin ohne Takt) → Standard
export const TAKT = { uni_postfach: [15, 30, 60], gmail: [3, 1, 0] };
export function taktPruefen(roh) {
  const o = roh && typeof roh === "object" ? roh : {};
  const wahl = (k) => (TAKT[k].includes(o[k]) ? o[k] : TAKT[k][0]);
  return { uni_postfach: wahl("uni_postfach"), gmail: wahl("gmail") };
}

// Prüft den entschlüsselten Stand des Plugins; liefert { stand, erledigt } oder wirft.
export function standPruefen(roh) {
  if (!roh || roh.schema !== 1) throw new Error("Stand: unbekanntes Schema");
  const module = Array.isArray(roh.module) ? roh.module.filter((m) => MODULCODE.test(m)).slice(0, 80) : [];
  const text = (w, n) => (typeof w === "string" ? w.slice(0, n) : "");
  const erledigt = Array.isArray(roh.erledigt) ? roh.erledigt.filter((n) => typeof n === "string" && DATEINAME.test(n)).slice(0, 500) : [];
  return { stand: { schema: 1, module, studienbeginn: text(roh.studienbeginn, 20), variante: text(roh.variante, 40), takt: taktPruefen(roh.takt),
    tresor: tresorPruefen(roh.tresor) }, erledigt };
}

export function erzeugeDienst({ konfig, verzeichnis, jetzt = () => new Date() }) {
  const fehlversuche = new Map(); // Absender → Zeitpunkte
  const absenderVon = (req) => String(req.headers["x-forwarded-for"] || "").split(",").pop().trim() || req.socket.remoteAddress || "?";
  const gesperrt = (wer) => {
    const grenze = jetzt().getTime() - SPERRE.fenster;
    const liste = (fehlversuche.get(wer) || []).filter((t) => t >= grenze);
    if (liste.length) fehlversuche.set(wer, liste); else fehlversuche.delete(wer);
    return liste.length >= SPERRE.fehler;
  };
  const fehlversuch = (wer) => {
    if (!fehlversuche.has(wer) && fehlversuche.size >= SPERRE.absender) fehlversuche.delete(fehlversuche.keys().next().value);
    fehlversuche.set(wer, (fehlversuche.get(wer) || []).concat(jetzt().getTime()).slice(-SPERRE.fehler));
  };
  const antwort = (res, code, objekt) => {
    const kopf = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
    res.writeHead(code, code === 413 ? { ...kopf, connection: "close" } : kopf);
    res.end(objekt === undefined ? "" : JSON.stringify(objekt));
  };
  const koerper = (req, max) => new Promise((fertig, fehler) => {
    const teile = [];
    let laenge = 0;
    req.on("data", (t) => {
      laenge += t.length;
      if (laenge > max) {
        // Rest verwerfen statt speichern; die Antwort 413 schließt die Verbindung.
        req.removeAllListeners("data");
        req.resume();
        fehler(Object.assign(new Error("zu groß"), { status: 413 }));
        return;
      }
      teile.push(t);
    });
    req.on("end", () => {
      try { fertig(JSON.parse(Buffer.concat(teile).toString("utf8") || "null")); } catch (e) { fehler(Object.assign(e, { status: 400 })); }
    });
    req.on("error", fehler);
  });
  const angemeldet = (req) => {
    const kopf = String(req.headers.authorization || "");
    return kopf.startsWith("Bearer ") && gleich(kopf.slice(7), konfig.zugang);
  };

  return createServer(async (req, res) => {
    const pfad = new URL(req.url, "http://lokal").pathname;
    try {
      if (pfad === "/v1/status") {
        if (req.method !== "GET") return antwort(res, 405, { fehler: "methode" });
        return antwort(res, 200, oeffentlicherStatus(lesen(join(verzeichnis, "zustand.json"), {}),
          lesen(join(verzeichnis, "abruf.json"), {}), konfig.version, jetzt(), existsSync(join(verzeichnis, "anstoss")),
          lesen(join(verzeichnis, "takt.json"), {})));
      }
      const wer = absenderVon(req);
      if (pfad.startsWith("/v1/livesync/")) {
        if (gesperrt(wer)) return antwort(res, 429, { fehler: "zu-viele-versuche" });
        if (req.method !== "GET") return antwort(res, 405, { fehler: "methode" });
        const setupLink = abholen(verzeichnis, pfad.slice("/v1/livesync/".length), jetzt());
        if (!setupLink) fehlversuch(wer);
        res.writeHead(setupLink ? 200 : 404, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store",
          "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'", "referrer-policy": "no-referrer" });
        return res.end(seite(setupLink));
      }
      if (!["/v1/eingang", "/v1/stand", "/v1/unterlagen", "/v1/pdf", "/v1/anstoss", "/v1/verbinden"].includes(pfad)) return antwort(res, 404, { fehler: "unbekannt" });

      if (pfad === "/v1/verbinden") {
        if (gesperrt(wer)) return antwort(res, 429, { fehler: "zu-viele-versuche" });
        if (req.method !== "POST") return antwort(res, 405, { fehler: "methode" });
        const daten = await koerper(req, MAX_KOERPER[pfad]);
        if (!codeEinloesen(verzeichnis, daten && daten.code, jetzt())) { fehlversuch(wer); return antwort(res, 403, { fehler: "code" }); }
        return antwort(res, 200, { adresse: konfig.adresse, zugang: konfig.zugang, schluessel: konfig.schluessel });
      }
      if (!angemeldet(req)) {
        if (gesperrt(wer)) return antwort(res, 429, { fehler: "zu-viele-versuche" });
        fehlversuch(wer);
        return antwort(res, 401, { fehler: "zugang" });
      }

      if (pfad === "/v1/eingang") {
        if (req.method !== "GET") return antwort(res, 405, { fehler: "methode" });
        const paket = await verschluesseln(konfig.schluessel, "eingang", eingangBuendel(verzeichnis, jetzt()));
        writeFileSync(join(verzeichnis, "abruf.json"), JSON.stringify({ zuletzt: jetzt().toISOString() }));
        return antwort(res, 200, paket);
      }
      if (req.method !== "POST") return antwort(res, 405, { fehler: "methode" });
      if (pfad === "/v1/anstoss") return antwort(res, ...knopfAnstoss(verzeichnis, jetzt()));
      if (pfad === "/v1/unterlagen") {
        const n = unterlagenAblegen(verzeichnis, unterlagenPruefen(await entschluesseln(konfig.schluessel, "unterlagen", await koerper(req, MAX_KOERPER[pfad]))), jetzt());
        return antwort(res, 200, { angenommen: n });
      }
      if (pfad === "/v1/pdf") {
        return antwort(res, 200, pdfTeilAblegen(verzeichnis, await entschluesselnRoh(konfig.schluessel, "pdf", await koerper(req, MAX_KOERPER[pfad])), jetzt()));
      }
      // /v1/stand
      const { stand, erledigt } = standPruefen(await entschluesseln(konfig.schluessel, "stand", await koerper(req, MAX_KOERPER[pfad])));
      writeFileSync(join(verzeichnis, "stand-plugin.json"), JSON.stringify(stand));
      writeFileSync(join(verzeichnis, "takt.json"), JSON.stringify(stand.takt)); // für abrufen.py (eigener Benutzer) ohne den Stand
      for (const name of erledigt) rmSync(join(verzeichnis, "eingang", name), { force: true });
      return antwort(res, 204);
    } catch (e) {
      if (e && e.status) return antwort(res, e.status, { fehler: e.status === 413 ? "zu-gross" : e.status === 429 ? "zu-viele" : "anfrage" });
      return antwort(res, 400, { fehler: "anfrage" });
    }
  });
}

// realpathSync: Node löst den Symlink /opt/studium-server/aktuell für import.meta.url auf, für argv[1] nicht.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const konfig = JSON.parse(readFileSync(process.env.STUDIUM_SERVER_KONFIG || "/etc/studium-server/dienst.json", "utf8"));
  const verzeichnis = process.env.STUDIUM_SERVER_DATEN || "/var/lib/studium-server";
  const port = Number(konfig.port) || 8743;
  erzeugeDienst({ konfig, verzeichnis }).listen(port, "127.0.0.1", () => console.log(`studium-server-dienst lauscht auf 127.0.0.1:${port}`));
}
