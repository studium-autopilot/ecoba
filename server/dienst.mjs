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
//   POST /v1/anstoss    mit Zugangsschlüssel: Knopf „Mails durchsuchen“ in Obsidian startet einen Claude-Lauf (mit Gmail),
//                       höchstens einmal in 10 Minuten; wartet schon ein Anstoß, bleibt er
//   POST /v1/verbinden  Einmal-Code (verbinden.mjs) gegen Adresse, Zugangs- und Datenschlüssel
// Konfiguration $STUDIUM_SERVER_KONFIG (Standard /etc/studium-server/dienst.json: zugang, schluessel, adresse, port,
// version), Daten $STUDIUM_SERVER_DATEN (Standard /var/lib/studium-server).
import { createHash, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { datumOk, KATEGORIEN, MODULCODE, saeubern, TODO_ID } from "./eingang.mjs";
import { entschluesseln, verschluesseln } from "./kanal.mjs";
import { codeEinloesen } from "./verbinden.mjs";

const TAG = 864e5;
const EINGANG_TAGE = 30, EINGANG_HOECHSTENS = 180;
// Größte Anfrage je Weg (verschlüsselt, base64): Stand mit Auszug aus dem Tresor bis 512 KB, Textfassungen bis 4 MB
const MAX_KOERPER = { "/v1/verbinden": 4 * 1024, "/v1/stand": 512 * 1024, "/v1/unterlagen": 4 * 1024 * 1024, "/v1/anstoss": 1024 };
const KNOPF_ABSTAND = 10 * 60e3; // Knopf „Mails durchsuchen“: höchstens so oft (jeder Lauf kostet Abo-Limit)
const LAUF_HOECHSTENS = 60 * 60e3; // „läuft“ gilt höchstens so lange (ein abgebrochener Lauf hängt nicht für immer)
// Textfassungen: höchstens 3 je Anfrage (das Plugin schickt bis zu 3 Anfragen je Abruf), je 400 000 Zeichen, höchstens 30 warten
// auf einen Lauf
const UNTERLAGEN = { anfrage: 3, zeichen: 400000, warten: 30 };
const ARTEN = ["Folien", "Skript", "Übung", "Tutorium", "Lösung", "Altklausur", "Literatur"];
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
// claude_lauf: wartet (Anstoß liegt da) | laeuft (seit weniger als einer Stunde) | ruht
export function oeffentlicherStatus(zustand, abruf, version, jetzt = new Date(), anstossWartet = false) {
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
    gmail: aus(z.gmail, ["ok", "fehlt"]),
    weiterleitung: aus(z.weiterleitung, ["ok", "fehlt"]),
    uni_zugang: aus(z.uniZugang, ["gespeichert", "fehlt", "falsch"]),
    speicher_reserve: aus(z.speicherReserve, ["an", "aus"]),
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
      ...(u.nurTermine ? ["Auftrag: nur Termine (keine Begleitnotiz)"] : []), "", "---", ""];
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
          lesen(join(verzeichnis, "abruf.json"), {}), konfig.version, jetzt(), existsSync(join(verzeichnis, "anstoss"))));
      }
      if (!["/v1/eingang", "/v1/stand", "/v1/unterlagen", "/v1/anstoss", "/v1/verbinden"].includes(pfad)) return antwort(res, 404, { fehler: "unbekannt" });
      const wer = absenderVon(req);

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
