#!/usr/bin/env node
// Web-Dienst des eigenen Servers. Lauscht nur auf 127.0.0.1; Caddy stellt ihn per HTTPS unter /v1/ bereit.
//   GET  /v1/status     mit Zugangsschlüssel: Stand des Servers (nur feste Werte aus einer Freigabeliste, statusWerte), dazu
//                       verbunden (die letzten Verbindungen von Geräten wie im Eingang), geraete (Geräte mit eigenen Schlüsseln wie
//                       im Eingang; nie ohne Schlüssel, auch nicht direkt auf 127.0.0.1) und grenzen (Grenzen je Tag: Läufe,
//                       wartende Mails, Zeichen je Topf, Mails in Quarantäne; lauf.mjs, abrufen.py). Direkt auf
//                       127.0.0.1 ohne Weiterleitung (installieren.sh, studium-server status; dort fragen nur root und die
//                       Dienstbenutzer) dasselbe ohne Schlüssel. Über Caddy ohne Schlüssel 401, sobald ein Gerät den Status
//                       einmal mit Schlüssel geholt hat (web/status-geschuetzt.json); bis dahin wie bis 0.7.7 offen, denn Plugins
//                       bis 0.7.7 schicken den Schlüssel dort nicht mit (danach zeigen sie den Server als nicht erreichbar,
//                       Termine holen sie über /v1/eingang weiter)
//   GET  /v1/eingang    mit Zugangsschlüssel: noch nicht übernommene Ergebnisse als verschlüsseltes Paket (kanal.mjs), dazu unter
//                       verbunden die letzten Verbindungen von Geräten (Zeit, Herkunft, Netz, Gerät) und unter geraete die Geräte
//                       mit eigenen Schlüsseln (geraete.mjs liste, ohne Schlüssel; beides ebenso im Status mit Schlüssel)
//   POST /v1/stand      mit Zugangsschlüssel: verschlüsselter Stand des Plugins (Modulcodes, Studienbeginn, Variante, ein
//                       Auszug aus dem Tresor gegen Doppel: Termine mit Titel und Datum, offene To-dos; der Takt aus den
//                       Einstellungen, auch als takt.json für abrufen.py und lauf.mjs; schon übernommene Eingang-Dateien, diese
//                       werden danach auf dem Server gelöscht; dazu lernplan: laufendes Semester und die Module, für die eine
//                       Kapitelliste fehlt)
//   POST /v1/unterlagen mit Zugangsschlüssel: verschlüsselt bis zu 3 Textfassungen von PDFs (Folien, Skripte …), zu denen
//                       Claude eine Begleitnotiz schreiben soll; landen in unterlagen/neu/ (mit modell: "opus", auf Wunsch per
//                       Knopf: unterlagen/opus/, eigener Lauf mit Opus; mit nur_termine nur nach Terminen durchsuchen, ohne
//                       Begleitnotiz), ein Anstoß startet den Lauf
//   POST /v1/pdf        mit Zugangsschlüssel: verschlüsselt ein Stück (8 MB) einer PDF zu einer gewünschten Zusammenfassung;
//                       zusammengesetzt und geprüft (SHA-256) landet sie als unterlagen/opus/<SHA-256>.pdf neben der Textfassung,
//                       die gleich danach kommt, und Opus liest sie
//   POST /v1/kapitel    mit Zugangsschlüssel: verschlüsselt bis zu 3 Textfassungen von Folien der Module, für die das Plugin eine
//                       Kapitelliste für den Lernplan braucht (Stand: lernplan), mit Nummer, Datum und Quelle der Unterlage;
//                       landen in unterlagen/kapitel/, ein Anstoß startet den Lauf
//   POST /v1/anstoss    mit Zugangsschlüssel (signiert nur mit Beweis des Datenschlüssels, sonst 403): Knopf „Mails durchsuchen“
//                       in Obsidian startet einen Claude-Lauf (mit Gmail), höchstens alle 30 Minuten und 12-mal in 24 Stunden
//                       (sonst 429 mit wieder); mit dem Körper {"quarantaene":"erneut"} reiht der Lauf dazu alle Mails der
//                       Quarantäne einmal wieder ein (zählt wie ein Knopf)
//   POST /v1/verbinden  Einmal-Code (verbinden.mjs) gegen Adresse, Zugangs- und Datenschlüssel: ab 0.7.8 (schema 2) ohne den Code,
//                       Antwort verschlüsselt (codeEinloesenNeu), seit dieser Fassung mit eigenen Schlüsseln für das Gerät und seiner
//                       Kennung (geraete.mjs; höchstens 30 Geräte, sonst 409 zu-viele-geraete und der Code bleibt; lässt sich das
//                       Verzeichnis nicht schreiben, 503 speichern, der Code bleibt), bis 0.7.7 mit dem
//                       Code selbst, offener Antwort und den gemeinsamen Schlüsseln (nur solange der Bearer gilt und noch kein Gerät
//                       eigene Schlüssel hat); jedes Einlösen
//                       steht mit Zeit, grobem Netz (/24 bzw. /48) und Gerätenamen (geraet, wenn das Plugin einen schickt) in
//                       web/geraete.json (die letzten 20)
//   POST /v1/geraet     mit Zugangsschlüssel und einer Anfrage, verschlüsselt mit dem Datenschlüssel (Zweck „verbinden“, Zeit und
//                       Zufallswert): Einmal-Code für ein weiteres Gerät (verbinden.mjs geraetCode), die Antwort ebenso verschlüsselt;
//                       als Bearer nur, solange kein Gerät eigene Schlüssel hat (sonst 403 veraltet)
//   POST /v1/geraete    signiert mit Beweis des Datenschlüssels, die Anfrage verschlüsselt (Zweck „geraete“, Zeit und Zufallswert wie
//                       bei /v1/geraet): aktion liste (die Geräte mit eigenen Schlüsseln, nie die Schlüssel), trennen (ein Gerät,
//                       auch das fragende, mit dem, was es hereinließ, außer behalten; geraete.mjs kaskade) oder umziehen (ein Gerät mit
//                       dem gemeinsamen Schlüssel bekommt eigene, mit einer Kennung des Umzugs, begrenzt); Antwort mit
//                       Zweck „geraete-antwort“ (geraete.mjs, geraeteAnfrage unten)
//   POST /v1/claude-app signiert mit Beweis des Datenschlüssels (sonst 403 datenschluessel, Bearer 403 veraltet), verschlüsselt (Zweck
//                       „claude-app“, Zeit und Zufallswert): Connector für die Claude-App (claude-app.mjs): Code zum Verbinden
//                       (schaltet ihn ein), Status, eine Verbindung trennen, ganz aus; Antwort verschlüsselt (claude-app-antwort).
//                       Mit dem Notschalter im Paket (CONNECTOR aus) gibt es keine Codes (503 abgeschaltet). Solange er an ist,
//                       legt der Dienst ihm nach jedem Stand und Abholen und alle 5 Minuten daten/lage.json hin (lageAktualisieren)
//   POST /v1/aktualisieren  signiert mit Beweis des Datenschlüssels, verschlüsselt (Zweck „aktualisieren“, Zeit und Zufallswert, sonst
//                       nichts): „Server jetzt aktualisieren“ in Obsidian. Der Dienst legt nur die Marke aktualisieren/jetzt hin; root
//                       (studium-server-jetzt.path) führt dann „studium-server aktualisieren --jetzt“ aus. Grenzen JETZT (sonst 429 mit
//                       wieder); der Status mit Schlüssel sagt unter aktualisieren_jetzt bereit | angefordert | laeuft (jetztStand)
// „mit Zugangsschlüssel“ heißt: signiert (Kopf Studium-Signatur, kanal.mjs; Plugin ab 0.7.8) oder, für Plugins bis 0.7.7, der
// Schlüssel selbst im Kopf (Bearer). Signierte Anfragen an /v1/anstoss brauchen dazu den Beweis mit dem Datenschlüssel. Signiert ist
// eine Anfrage mit dem gemeinsamen Schlüssel aus dienst.json oder dem eigenen eines Geräts (geraete.mjs): Der Dienst rechnet die
// Signatur gegen jedes Paar, und das passende gilt für die ganze Anfrage (Beweis, Pakete, Signatur der Antwort).
//   GET  /v1/livesync/<kennung>  Seite mit dem Setup-Link für LiveSync (livesync.mjs, 30 Minuten; verschlüsselt mit einem Code,
//                       den nur das Terminal zeigt)
// Konfiguration $STUDIUM_SERVER_KONFIG (Standard /etc/studium-server/dienst.json: zugang, schluessel, adresse, port,
// version; nach „studium-server schluessel-erneuern“ dazu zugang_alt, schluessel_alt und erneuert, siehe ALT_FRIST), Daten $STUDIUM_SERVER_DATEN (Standard /var/lib/studium-server). Der Dienst läuft als eigener Benutzer (studium-web) und
// schreibt nur in web/ (seine Dateien: abruf.json, takt.json, knopf.json, stand-plugin.json, geraete.json, geraete-schluessel.json, geraete-seit.json,
// status-geschuetzt.json, signatur-gesehen.json, bearer.json, bearer-aus.json, gemeinsam.json, gemeinsam-aus.json, nonces.log, anstoss, verbinden/,
// getrennt/ (legt studium-server geraet-trennen an, der Dienst löscht), livesync-links/), unterlagen/ (für den Lauf) und eingang/ (vom Lauf; er löscht Übernommenes), dazu für den Connector claude-app.json, lagebild.json, hinweise.json in web/ und
// seine Ordner unter claude-app/ (schalter/, codes/, trennen/, daten/; claude-app.mjs), für „Server jetzt aktualisieren“ web/jetzt.json und
// die Marke in aktualisieren/. zustand.json und
// aktualisierung.json liest er nur (server/README.md, „Wer was liest und schreibt“).
import { createHash, timingSafeEqual } from "node:crypto";
import { appendFileSync, closeSync, existsSync, lstatSync, mkdirSync, openSync, readFileSync, readdirSync, readSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { schreibenAtomar } from "./dateien.mjs";
import { datumOk, hatZugangsdaten, kapitelModulNormal, KATEGORIEN, MODULCODE, saeubern, SEMESTER, TODO_ID, wieAnweisung } from "./eingang.mjs";
import { GEMEINSAM_AUS, geraeteVerzeichnis, UMZUG_KENNUNG } from "./geraete.mjs";
import { antwortMac, entschluesseln, entschluesselnRoh, INHALT_LEER, inhaltVon, NonceSpeicher, SIGNATUR, signaturPruefen, verschluesseln } from "./kanal.mjs";
import { abgeschaltet, claudeApp, claudeAppStatus, claudeAppVon, hinweiseMerken, istAn, lagebildPruefen, lageSchreiben } from "./claude-app.mjs";
import { abholen, seite } from "./livesync.mjs";
import { anfrageEinmal, codeEinloesen, codeEinloesenNeu, codesZurueckziehen, geraetCode, ipNetz, verbundenLesen } from "./verbinden.mjs";

const TAG = 864e5;
const EINGANG_TAGE = 30, EINGANG_HOECHSTENS = 180;
// PDFs zu gewünschten Zusammenfassungen: in Stücken zu 8 MB (jedes ein eigenes Paket, so braucht weder das Gerät noch der Dienst
// die ganze PDF auf einmal im Speicher), je PDF bis 500 MB, höchstens 6 und zusammen 1 GB warten (die Platte); eine PDF ohne
// Textfassung daneben oder ein halb hochgeladenes Stück verfällt nach einem Tag (das Plugin schickt die PDF vor dem Text)
export const PDF = { teil: 8 * 1024 * 1024, bytes: 500 * 1024 * 1024, gesamt: 1024 * 1024 * 1024, warten: 6, verfall: TAG };
// Größte Anfrage je Weg (verschlüsselt, base64): Stand mit Auszug aus dem Tresor bis 512 KB, Textfassungen bis 4 MB, ein Stück
// einer PDF mit Kopfzeile und dem Aufschlag von base64
const MAX_KOERPER = { "/v1/verbinden": 4 * 1024, "/v1/geraet": 1024, "/v1/geraete": 2 * 1024, "/v1/claude-app": 1024, "/v1/aktualisieren": 1024, "/v1/stand": 512 * 1024, "/v1/unterlagen": 4 * 1024 * 1024, "/v1/kapitel": 1024 * 1024, "/v1/anstoss": 1024,
  "/v1/pdf": Math.ceil((PDF.teil + 1024) * 4 / 3) + 4096 };
// Knopf „Mails durchsuchen“ (POST /v1/anstoss): Jeder angenommene Anstoß startet einen Lauf mit Claude und Gmail und kostet
// Abo-Limit. Wer den Zugangsschlüssel hat, kommt darum höchstens alle 30 Minuten und 12-mal in 24 Stunden durch.
export const KNOPF = { abstand: 30 * 60e3, tag: 12 };
// „Server jetzt aktualisieren“ (POST /v1/aktualisieren): höchstens alle 10 Minuten und 6-mal in 24 Stunden; als angefordert bzw. laufend
// gilt eine Anfrage höchstens hoechstens lang (Zeitgrenze der Einheit studium-server-jetzt.service, ein Lauf, der abbrach, hängt nicht)
export const JETZT = { abstand: 10 * 60e3, tag: 6, hoechstens: 2 * 3600e3 };
export const JETZT_MARKE = ["aktualisieren", "jetzt"];
// „läuft“ gilt höchstens so lange wie die Zeitgrenze des Laufs (TimeoutStartSec in installieren.sh; ein abgebrochener Lauf hängt
// nicht für immer)
const LAUF_HOECHSTENS = 100 * 60e3;
// so oft sieht der Dienst nach, ob nach dem Limit des Claude-Abos der nächste Versuch dran ist (limitWiederholen)
export const LIMIT_PRUEFEN = 5 * 60e3;
// Textfassungen: höchstens 3 je Anfrage (das Plugin schickt bis zu 3 Anfragen je Abruf), je 400 000 Zeichen, höchstens 30 warten
// auf einen Lauf
const UNTERLAGEN = { anfrage: 3, zeichen: 400000, warten: 30 };
// Folien für Kapitellisten: höchstens 3 je Anfrage, je 60 000 Zeichen (das Plugin schickt die ersten Seiten ganz, danach nur die
// erste Zeile jeder Seite), höchstens 30 warten
const KAPITEL = { anfrage: 3, zeichen: 60000, warten: 30 };
const ARTEN = ["Folien", "Skript", "Übung", "Tutorium", "Lab", "Lösung", "Altklausur", "Literatur"];
// Je Netz des Absenders höchstens 10 Fehlversuche in 10 Minuten, dann 429. Ein gültiger Zugangsschlüssel, ein gültiger Einmal-Code
// und eine gültige LiveSync-Kennung gehen immer durch (geprüft wird vor der Sperre): sonst könnte jeder das Plugin aussperren, und
// ein Campus-Netz mit einer Adresse für viele sperrte mit fremden Fehlversuchen den richtigen Code. Absender = letzter Eintrag in
// X-Forwarded-For (setzt Caddy; der Dienst lauscht nur auf 127.0.0.1), gezählt je /24 (IPv4) bzw. /56 (IPv6), nicht je Adresse.
// Höchstens SPERRE.absender Netze; ist die Liste voll, fällt zuerst Abgelaufenes weg, und neue Netze zählen danach gemeinsam unter
// einem Eintrag (UEBERLAUF): Wer viele Netze hat, kann so keine laufende Sperre aus der Liste drängen. Die Liste ist nach dem letzten
// Fehlversuch geordnet (jeder neue rückt seinen Eintrag ans Ende), so liegt Abgelaufenes vorn und fällt weg, ohne alles
// durchzugehen. Dass ein gültiger Code vor der Sperre geprüft wird, bremst das Raten nicht; das braucht es nicht: Ein Einmal-Code
// hat 50 Bit und gilt höchstens 30 Minuten (verbinden.mjs).
const SPERRE = { fehler: 10, fenster: 10 * 60e3, absender: 5000 };
const UEBERLAUF = "*";
export const DATEINAME = /^[0-9A-Za-z][0-9A-Za-z._-]{0,119}\.json$/;

const lesen = (datei, ersatz) => {
  try { return JSON.parse(readFileSync(datei, "utf8")); } catch (e) { return ersatz; }
};
// Ordner des Dienstes im Datenordner; legt ihn an, wo er fehlt (Tests; auf dem Server legt ihn der Installer an)
export const WEB = "web";
const webOrdner = (verzeichnis) => {
  const o = join(verzeichnis, WEB);
  mkdirSync(o, { recursive: true });
  return o;
};
// Anstoß des Dienstes (web/anstoss); der Lauf, Gmail-Zeit und studium-server schreiben ihren in den Datenordner (anstoss), der
// Abruf in abruf/ (den sieht der Dienst nicht). Wartet einer, sagt der Status „wartet“.
const ANSTOSS = [["anstoss"], [WEB, "anstoss"]];
// Marke in web/: Ein Gerät hat den Status mit Zugangsschlüssel geholt; von da an bekommt ihn niemand mehr ohne (GET /v1/status)
const STATUS_GESCHUETZT = "status-geschuetzt.json";
// Marken in web/ für den Zugangsschlüssel im Kopf (Bearer, Plugins bis 0.7.7): signatur-gesehen.json, sobald eine gültige Signatur kam
// (von da an startet ein Bearer keinen Anstoß mehr), bearer.json mit dem letzten Bearer, der durchging (höchstens stündlich
// geschrieben). Kam BEARER_FRIST lang kein Bearer mehr durch (gezählt ab dem letzten, sonst ab der ersten Signatur) oder ist die erste
// Signatur BEARER_SCHLUSS her (egal, wie oft seitdem einer kam), nimmt der Dienst keinen mehr an und schreibt bearer-aus.json; die
// sieht er zuerst an, so bleibt es dabei, auch wenn die Uhr zurückgeht. Scheitert das Schreiben einer Marke (volle Platte), gilt sie
// im Speicher weiter, und keine Anfrage scheitert daran.
const SIGNATUR_GESEHEN = "signatur-gesehen.json", BEARER = "bearer.json", BEARER_AUS = "bearer-aus.json";
export const BEARER_FRIST = 7 * TAG, BEARER_SCHLUSS = 30 * TAG;
// Ebenso der gemeinsame Schlüssel für signierte Anfragen (Plugins ab 0.7.8, die sich vor den Schlüsseln je Gerät verbunden haben; ab
// dieser Fassung ziehen sie mit „umziehen“ auf eigene um): geraete-seit.json, sobald das erste Gerät eigene Schlüssel hat, gemeinsam.json
// mit der letzten Signatur unter dem gemeinsamen (höchstens stündlich). Kam GEMEINSAM_FRIST lang keine mehr (gezählt ab der letzten,
// sonst ab dem ersten Gerät) oder ist das erste Gerät GEMEINSAM_SCHLUSS her, nimmt der Dienst keine mehr an (401 zugang, signiert und
// ohne Fehlversuch: das Gerät soll sich mit einem Code neu verbinden) und schreibt gemeinsam-aus.json. Ab dann gilt auch der Bearer nicht mehr.
// Dieselbe Marke legt „studium-server gemeinsam-beenden“ an (geraete.mjs), wenn ein Gerät mit dem gemeinsamen Schlüssel verloren ist.
const GERAETE_SEIT = "geraete-seit.json", GEMEINSAM = "gemeinsam.json";
export const GEMEINSAM_FRIST = 7 * TAG, GEMEINSAM_SCHLUSS = 30 * TAG;
// Nach „studium-server schluessel-erneuern“ stehen die alten Schlüssel noch ALT_FRIST lang in dienst.json (zugang_alt, schluessel_alt,
// erneuert): Eine Anfrage, deren Signatur nur unter ihnen stimmt, bekommt 401 mit erneuert (signiert unter den alten Schlüsseln, kein
// Fehlversuch). So sagt das Gerät gleich „Dein Server hat neue Schlüssel“, statt den Server tagelang als nicht erreichbar zu zeigen.
export const ALT_FRIST = 30 * TAG;
export const anstossWartet = (verzeichnis) => ANSTOSS.some((t) => existsSync(join(verzeichnis, ...t)));
const digest = (text) => createHash("sha256").update(String(text || "")).digest();
const gleich = (a, b) => timingSafeEqual(digest(a), digest(b));
const aus = (wert, erlaubt) => (erlaubt.includes(wert) ? wert : "unbekannt");

// Letztes „studium-server aktualisieren“ (aktualisierung.json, schreibt studium-server als studium, 0640): zeit, ok, ziel (Version des
// neuesten Releases), grund (der Schritt, an dem es scheiterte, aus dieser Liste), erfolg (zuletzt ohne Fehler). Fehlt die Datei
// (ein älterer Server, Testmodus ohne den täglichen Zeitgeber, noch nie gelaufen): null, das Plugin sagt dann nichts. Ein Grund, den
// diese Liste nicht kennt (ein neueres studium-server), heißt „unbekannt“; Plugins bis 0.7.7 lesen grund gar nicht.
// Mit mehr (nur im Status mit Schlüssel) dazu, wenn studium-server sie schreibt: installiert (laufende Version) und warten_bis
// (gestaffelte Verteilung: frühestens dann installiert er); sonst fehlen die Felder.
export const AKTUALISIERUNG_GRUENDE = ["github", "pruefsumme-fehlt", "signatur-fehlt", "herunterladen", "pruefsumme", "signatur", "paket", "installieren",
  "pakete", "aelter", "kein-paket", "zurueckgerollt", "version", "mindestversion"];
const zeitpunkt = (s) => (typeof s === "string" && !Number.isNaN(Date.parse(s)) ? new Date(s).toISOString() : null);
const versionOk = (v) => typeof v === "string" && /^[0-9A-Za-z.+-]{1,40}$/.test(v);
export function aktualisierungPruefen(a, mehr = false) {
  if (!a || typeof a !== "object" || !zeitpunkt(a.zeit)) return null;
  const erg = { zeit: zeitpunkt(a.zeit), ok: a.ok === true, ziel: versionOk(a.ziel) ? a.ziel : "",
    grund: a.ok === true ? "" : aus(a.grund, AKTUALISIERUNG_GRUENDE), erfolg: zeitpunkt(a.erfolg) };
  if (mehr && versionOk(a.installiert)) erg.installiert = a.installiert;
  if (mehr && zeitpunkt(a.warten_bis)) erg.warten_bis = zeitpunkt(a.warten_bis);
  return erg;
}

// Status (GET /v1/status mit Zugangsschlüssel): nur Werte aus festen Listen und Zeitpunkte, nie Namen, Adressen, Texte oder
// Schlüssel. Feldnamen klein mit Unterstrich wie in den zentralen Daten (docs/daten-v1.md).
// claude_lauf: wartet (Anstoß liegt da) | laeuft (seit weniger als LAUF_HOECHSTENS) | ruht. gmail: aus, solange der Takt aus
// Obsidian (takt.json) Gmail auf „nie“ stellt; sonst stünde dort das Ergebnis der letzten Suche, als liefe sie noch.
export function statusWerte(zustand, abruf, version, jetzt = new Date(), anstossWartet = false, takt = {}, aktualisierung = null) {
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
    // am Limit des Claude-Abos: wann der Server es wieder versucht (lauf.mjs, zustand.limit), sonst null
    limit_wieder: zeitpunkt(z.limit && z.limit.wieder),
    aktualisierung: aktualisierungPruefen(aktualisierung),
    fehler: (Array.isArray(z.fehler) ? z.fehler : []).filter((f) => /^[a-z0-9-]{1,40}$/.test(f)).slice(0, 10),
  };
}

// Stand der Grenzen heute (zustand.grenzen, lauf.mjs grenzenStand), nur im Status mit Schlüssel: ganze Zahlen, sonst null
const GRENZEN_FELDER = ["laeufe", "laeufe_max", ...["mails", "mails_uni", "pruefen", "gmail", "unterlagen"].flatMap((k) => [`laeufe_${k}`, `laeufe_${k}_max`]), "laeufe_knopf",
  "mails_wartend", "mails_verworfen", "mails_zurueckgestellt", "mails_verschoben", "zeichen_uni", "zeichen_andere",
  "mails_verdacht", "quarantaene", "quarantaene_geloescht", "fehlschlaege_gmail", "ausgesetzt_gmail", "unterlagen_ausgelassen", "kapitel_ausgelassen"];
export function grenzenPruefen(g) {
  if (!g || typeof g !== "object" || typeof g.tag !== "string" || !datumOk(g.tag)) return null;
  const aus = { tag: g.tag };
  for (const k of GRENZEN_FELDER) aus[k] = Number.isInteger(g[k]) && g[k] >= 0 && g[k] < 1e9 ? g[k] : 0;
  return aus;
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
// gesäubert wie das Eingang, Ungültiges fällt weg. Termine und To-dos, die nach Zugangsdaten aussehen (hatZugangsdaten in
// eingang.mjs), einen Link enthalten oder wie eine Anweisung an Claude aussehen (wieAnweisung: was Claude einmal in eine Notiz
// schrieb, käme sonst in jedem Lauf wieder), kommen nie an; beides Heuristiken, geprüft vor und nach dem Säubern.
const TRESOR_MAX = { termine: 400, todos: 200 };
const ungeeignet = (roh, gesaeubert) => [roh, gesaeubert].some((t) => hatZugangsdaten(t) || wieAnweisung(t));
export function tresorPruefen(roh) {
  const t = roh && typeof roh === "object" ? roh : {};
  const tag = (d) => (datumOk(d) ? d : "");
  const code = (c) => (typeof c === "string" && MODULCODE.test(c) ? c : "");
  const termine = (Array.isArray(t.termine) ? t.termine : []).slice(0, TRESOR_MAX.termine).map((x) => {
    const titel = saeubern(x && x.titel, 120, true);
    if (titel.fehler || !tag(x.datum) || ungeeignet(x.titel, titel.wert)) return null;
    return { titel: titel.wert, datum: x.datum, bis: tag(x.bis), kategorie: KATEGORIEN.includes(x.kategorie) ? x.kategorie : "", code: code(x.code),
      herkunft: typeof x.herkunft === "string" && /^[a-z][a-z-]{0,29}$/.test(x.herkunft) ? x.herkunft : "", erledigt: x.erledigt === true };
  }).filter(Boolean);
  // To-dos mit Kennung (für doppelte), Notiz und ob sie zusammengeführt werden dürfen (offene Aufgabe unter „Zu tun“ einer
  // Begleitnotiz; das Plugin prüft es beim Anwenden noch einmal)
  const todos = (Array.isArray(t.todos) ? t.todos : []).slice(0, TRESOR_MAX.todos).map((x) => {
    const text = saeubern(x && x.text, 200, true);
    if (text.fehler || ungeeignet(x.text, text.wert)) return null;
    const pfad = saeubern(x.pfad, 240, false, null);
    if (!pfad.fehler && ungeeignet(pfad.wert, "")) return null;
    const o = { text: text.wert, code: code(x.code), frist: tag(x.frist) };
    if (TODO_ID.test(String(x.id))) o.id = x.id;
    if (!pfad.fehler && pfad.wert && !pfad.wert.split("/").includes("..") && pfad.wert.endsWith(".md")) o.pfad = pfad.wert;
    if (x.aenderbar === true) o.aenderbar = true;
    return o;
  }).filter(Boolean);
  return { termine, todos };
}

// Frühere Fassung einer Unterlage (Plugin, fassung.js kontext): kurze Listen reiner Texte, Datum, Seiten → Objekt oder null.
// Grenzen wie im Plugin (GRENZE); was nicht passt, fällt einzeln weg.
const FASSUNG = { frueher: 8, zu_tun: 15, fragen: 10, zeichen: 300 };
export function fassungPruefen(f) {
  if (!f || typeof f !== "object" || Array.isArray(f)) return null;
  const liste = (l, max) => (Array.isArray(l) ? l : []).slice(0, max).map((x) => saeubern(x, FASSUNG.zeichen, true)).filter((x) => !x.fehler).map((x) => x.wert);
  const bis = datumOk(f.bis) ? f.bis : "";
  const aus = { frueher: bis ? liste(f.frueher, FASSUNG.frueher) : [], bis,
    geaendert: typeof f.geaendert === "string" && /^[0-9, –]{1,200}$/.test(f.geaendert) ? f.geaendert.trim() : "",
    entfallen: Number.isInteger(f.entfallen) && f.entfallen > 0 && f.entfallen < 10000 ? f.entfallen : 0,
    zu_tun: liste(f.zu_tun, FASSUNG.zu_tun), fragen: liste(f.fragen, FASSUNG.fragen) };
  return aus.frueher.length || aus.geaendert || aus.entfallen || aus.zu_tun.length || aus.fragen.length ? aus : null;
}
// Dieselben Zeilen wie im Plugin (fassung.js kontextText), für den Kopf der Textfassung → [Zeilen]
export function fassungKopf(f) {
  if (!f) return [];
  const z = [], liste = (l) => l.map((x) => "- " + x);
  if (f.frueher.length) z.push(`Frühere Fassung: Die Notiz hatte eine Zusammenfassung der früheren Fassung dieser Unterlage (bis ${f.bis.slice(8, 10)}.${f.bis.slice(5, 7)}.${f.bis.slice(0, 4)}):`, ...liste(f.frueher));
  if (f.geaendert || f.entfallen) {
    z.push([f.geaendert ? `Neu oder geändert: S. ${f.geaendert}.` : "", f.entfallen ? `Entfallen: ${f.entfallen} ${f.entfallen === 1 ? "Seite" : "Seiten"}.` : ""].filter(Boolean).join(" "));
  }
  if (f.zu_tun.length) z.push("Steht schon unter „Zu tun“:", ...liste(f.zu_tun));
  if (f.fragen.length) z.push("Steht schon unter „Offene Fragen“:", ...liste(f.fragen));
  return z;
}

// Pfad einer PDF wie im Eingang (unter Unterlagen/, keine Ausbrüche, .pdf) → Pfad oder ""
const pdfPfad = (datei) => {
  const pfad = datei.replace(/\\/g, "/").trim();
  return !pfad.startsWith("Unterlagen/") || !/\.pdf$/i.test(pfad) || pfad.length > 240 || pfad.split("/").some((t) => !t || t === "." || t === "..") ||
    /[\u0000-\u001f<>:"|?*]/.test(pfad) ? "" : pfad;
};
// Text einer Textfassung ohne Steuerzeichen außer Zeilenumbruch, gekürzt
const textfassung = (text, max) => text.replace(/[\u0000-\u0008\u000b-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, " ").slice(0, max);

// Textfassungen von PDFs für Begleitnotizen: Pfad wie im Eingang, Kennung = SHA-256 der PDF (Dateiname auf dem Server), nur
// Lehrmaterial (ARTEN), Text ohne Steuerzeichen außer Zeilenumbruch. → [{ … }] oder wirft
export function unterlagenPruefen(roh) {
  if (!roh || roh.schema !== 1 || !Array.isArray(roh.unterlagen)) throw new Error("Unterlagen: unbekanntes Schema");
  const aus = [];
  for (const u of roh.unterlagen.slice(0, UNTERLAGEN.anfrage)) {
    if (!u || typeof u !== "object" || typeof u.datei !== "string" || typeof u.text !== "string") continue;
    const pfad = pdfPfad(u.datei);
    if (!pfad || typeof u.kennung !== "string" || !/^[0-9a-f]{64}$/.test(u.kennung) || !ARTEN.includes(u.art)) continue;
    const text = textfassung(u.text, UNTERLAGEN.zeichen);
    if (!text.trim()) continue;
    const titel = saeubern(u.titel, 160, false);
    aus.push({ datei: pfad, kennung: u.kennung, art: u.art, titel: titel.fehler ? "" : titel.wert, code: typeof u.code === "string" && MODULCODE.test(u.code) ? u.code : "",
      seiten: Number.isInteger(u.seiten) && u.seiten > 0 && u.seiten < 10000 ? u.seiten : 0, opus: u.modell === "opus", nurTermine: u.modell !== "opus" && u.nur_termine === true,
      fassung: u.modell !== "opus" && u.nur_termine === true ? null : fassungPruefen(u.fassung), text });
  }
  return aus;
}

// Legt geprüfte Textfassungen für den nächsten Lauf ab (unterlagen/neu/<kennung>.md) und stößt ihn an, wenn nicht schon einer
// wartet (ein wartender Anstoß, z. B. Gmail, bleibt, wie er ist). Im Kopf: Titel, Datei, Modul, Art, Seiten, „Auftrag: nur
// Termine“, die PDF daneben und die frühere Fassung (fassungKopf; Regel „Neue Fassung“ in skill/studium-autopilot/begleitnotiz.md).
// → Zahl der neuen Dateien; wirft bei zu vielen wartenden
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
      ...(u.fassung ? ["", ...fassungKopf(u.fassung)] : []),
      "", "---", ""];
    writeFileSync(ziel + ".neu", kopf.join("\n") + u.text + "\n");
    renameSync(ziel + ".neu", ziel);
    n++;
  }
  if (n) anstossWennFrei(verzeichnis, "unterlagen", jetzt);
  return n;
}
// Anstoß für den nächsten Lauf (web/anstoss), wenn nicht schon einer wartet
function anstossWennFrei(verzeichnis, grund, jetzt) {
  if (anstossWartet(verzeichnis)) return false;
  schreibenAtomar(join(webOrdner(verzeichnis), "anstoss"), JSON.stringify({ zeit: jetzt.toISOString(), grund }));
  return true;
}

// Nach dem Limit des Claude-Abos (zustand.limit, lauf.mjs) oder der Grenze der Läufe am Tag je Anlass (zustand.tagesgrenze): Ist der nächste
// Versuch dran, ein Anstoß „wiederholung“. Nicht, wenn schon einer wartet, ein Lauf läuft oder seit dem Zeitpunkt schon einer
// gestartet ist (der hat Limit und Grenze dann neu gesetzt oder gelöscht). Der Dienst liest den Zustand nur; schreiben tut ihn der
// Lauf. → true, wenn angestoßen
export function limitWiederholen(verzeichnis, jetzt = new Date()) {
  const z = lesen(join(verzeichnis, "zustand.json"), {}) || {};
  const dran = [z.limit && z.limit.wieder, z.tagesgrenze && z.tagesgrenze.wieder].map((w) => Date.parse(w || ""))
    .filter((w) => Number.isFinite(w) && w <= jetzt.getTime());
  if (!dran.length || anstossWartet(verzeichnis)) return false;
  const wieder = Math.max(...dran);
  const seit = Date.parse(z.laeuftSeit || "");
  if (Number.isFinite(seit) && jetzt.getTime() - seit < LAUF_HOECHSTENS) return false;
  const zuletzt = Date.parse((z.letzterLauf && z.letzterLauf.zeit) || "");
  if (Number.isFinite(zuletzt) && zuletzt >= wieder) return false;
  anstossWennFrei(verzeichnis, "wiederholung", jetzt);
  return true;
}

// Folien für Kapitellisten (Lernplan): wie die Unterlagen, nur Art Folien mit Modulcode, dazu Nummer, Datum und Quelle der Unterlage
// (daraus setzt Claude folien und vorlesung) und wie viele Seiten ganz im Text stehen (danach nur die erste Zeile jeder Seite).
// → [{ … }] oder wirft
export function kapitelUnterlagenPruefen(roh) {
  if (!roh || roh.schema !== 1 || !Array.isArray(roh.unterlagen)) throw new Error("Kapitel: unbekanntes Schema");
  const aus = [];
  for (const u of roh.unterlagen.slice(0, KAPITEL.anfrage)) {
    if (!u || typeof u !== "object" || typeof u.datei !== "string" || typeof u.text !== "string" || u.art !== "Folien") continue;
    const pfad = pdfPfad(u.datei);
    if (!pfad || typeof u.kennung !== "string" || !/^[0-9a-f]{64}$/.test(u.kennung) || typeof u.code !== "string" || !MODULCODE.test(u.code)) continue;
    const text = textfassung(u.text, KAPITEL.zeichen);
    if (!text.trim()) continue;
    const titel = saeubern(u.titel, 160, false), quelle = saeubern(u.quelle, 200, false);
    const zahl = (x, max) => (Number.isInteger(x) && x >= 0 && x <= max ? x : null);
    aus.push({ datei: pfad, kennung: u.kennung, titel: titel.fehler ? "" : titel.wert, code: u.code, nummer: zahl(u.nummer, 99),
      seiten: zahl(u.seiten, 9999) || 0, ganz: zahl(u.ganz, 9999) || 0, datum: datumOk(u.datum) ? u.datum : "", quelle: quelle.fehler ? "" : quelle.wert, text });
  }
  return aus;
}
// Legt sie für den nächsten gewöhnlichen Lauf ab (unterlagen/kapitel/<kennung>.md) und stößt ihn an. Im Kopf: Titel, Datei,
// Modul, Nummer, Seiten, Datum, Quelle und der Auftrag (skill/studium-autopilot/lernplan.md). → Zahl; wirft bei zu vielen wartenden
export function kapitelAblegen(verzeichnis, unterlagen, jetzt = new Date()) {
  const ordner = join(verzeichnis, "unterlagen", "kapitel");
  mkdirSync(ordner, { recursive: true });
  if (readdirSync(ordner).filter((n) => n.endsWith(".md")).length + unterlagen.length > KAPITEL.warten) throw Object.assign(new Error("zu viele"), { status: 429 });
  for (const u of unterlagen) {
    const ziel = join(ordner, u.kennung + ".md");
    const kopf = [`# ${u.titel || u.datei.slice(u.datei.lastIndexOf("/") + 1)}`, "", `Datei: ${u.datei}`,
      `Modul: ${u.code} · Art: Folien${u.nummer != null ? ` · Nummer: ${u.nummer}` : ""}${u.seiten ? ` · Seiten: ${u.seiten}` : ""}`,
      ...(u.datum || u.quelle ? [[u.datum ? `Datum: ${u.datum}` : "", u.quelle ? `Quelle: ${u.quelle}` : ""].filter(Boolean).join(" · ")] : []),
      "Auftrag: nur Kapitelliste (Lernplan)" + (u.ganz ? `; ab Seite ${u.ganz + 1} steht nur die erste Zeile jeder Seite` : ""),
      "", "---", ""];
    writeFileSync(ziel + ".neu", kopf.join("\n") + u.text + "\n");
    renameSync(ziel + ".neu", ziel);
  }
  if (unterlagen.length) anstossWennFrei(verzeichnis, "lernplan", jetzt);
  return unterlagen.length;
}

// PDFs ohne Textfassung daneben und halb hochgeladene, älter als PDF.verfall, löschen (auch lauf.mjs vor einem Lauf mit Opus; dort
// legt ein anderer Benutzer ab: lstat, also das Alter des Eintrags selbst, nie das Ziel eines Links)
export function pdfAufraeumen(ordner, jetzt = new Date()) {
  if (!existsSync(ordner)) return;
  for (const n of readdirSync(ordner)) {
    const m = /^([0-9a-f]{64})\.pdf(\.teil)?$/.exec(n);
    if (!m || (!m[2] && existsSync(join(ordner, m[1] + ".md")))) continue;
    try { if (jetzt.getTime() - lstatSync(join(ordner, n)).mtimeMs > PDF.verfall) rmSync(join(ordner, n), { force: true }); } catch (e) { /* schon weg */ }
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

// Knopf „Mails durchsuchen“: Anstoß für einen Lauf mit Gmail (Grund knopf), immer in web/anstoss, auch wenn dort schon einer wartet:
// Der Lauf nimmt alle Anstöße und den mit dem höchsten Vorrang (knopf), und Unterlagen und Folien übernimmt er unabhängig vom Grund.
// Vorher blieb ein wartender Anstoß mit anderem Grund (etwa „quellen“ vom Abruf, „unterlagen“), und Gmail kam nicht dran. Grenzen:
// KNOPF (sonst 429 mit wieder, ab wann es wieder geht). knopf.json: { zuletzt, tag: [angenommene der letzten 24 Stunden] }; eine Datei
// einer früheren Fassung hat nur zuletzt, das zählt mit. knopf.json liest auch der Abruf (anderer Benutzer, nur zuletzt): 0644.
// wunsch (Körper der Anfrage, JSON; Plugins bis 0.7.7 schicken keinen): { quarantaene: "erneut" } reiht die Quarantäne wieder ein
// (lauf.mjs quarantaeneErneut); ein wartender Wunsch bleibt, wenn ein gewöhnlicher Knopf den Anstoß ersetzt. → [Status, Antwort]
export function knopfAnstoss(verzeichnis, jetzt = new Date(), wunsch = null) {
  const knopf = join(webOrdner(verzeichnis), "knopf.json");
  const alt = lesen(knopf, {}) || {};
  const t = jetzt.getTime();
  const zuletzt = Date.parse(alt.zuletzt || "");
  const tag = [...new Set((Array.isArray(alt.tag) ? alt.tag : []).concat(alt.zuletzt || []).map((z) => Date.parse(z)))]
    .filter((z) => Number.isFinite(z) && z <= t && t - z < TAG).sort((a, b) => a - b);
  const ab = [];
  if (Number.isFinite(zuletzt) && zuletzt <= t && t - zuletzt < KNOPF.abstand) ab.push(zuletzt + KNOPF.abstand);
  if (tag.length >= KNOPF.tag) ab.push(tag[tag.length - KNOPF.tag] + TAG);
  if (ab.length) return [429, { fehler: "zu-frueh", wieder: new Date(Math.max(...ab)).toISOString() }];
  schreibenAtomar(knopf, JSON.stringify({ zuletzt: jetzt.toISOString(), tag: tag.concat(t).slice(-KNOPF.tag).map((z) => new Date(z).toISOString()) }), 0o644);
  const erneut = (wunsch && wunsch.quarantaene === "erneut") || (lesen(join(webOrdner(verzeichnis), "anstoss"), {}) || {}).quarantaene === "erneut";
  schreibenAtomar(join(webOrdner(verzeichnis), "anstoss"), JSON.stringify({ zeit: jetzt.toISOString(), grund: "knopf", ...(erneut ? { quarantaene: "erneut" } : {}) }));
  return [200, { angestossen: true, ...(wunsch && wunsch.quarantaene === "erneut" ? { quarantaene: "erneut" } : {}) }];
}

// „Server jetzt aktualisieren“: Grenzen JETZT (429 mit wieder), gemerkt in web/jetzt.json { zuletzt, tag }, dann die Marke
// aktualisieren/jetzt. Deren Inhalt liest niemand: root sieht nur, dass sie da ist, und nimmt nichts aus der Anfrage. → [Status, Antwort]
export function jetztAnstoss(verzeichnis, jetzt = new Date()) {
  const datei = join(webOrdner(verzeichnis), "jetzt.json");
  const alt = lesen(datei, {}) || {};
  const t = jetzt.getTime();
  const tag = (Array.isArray(alt.tag) ? alt.tag : []).map((z) => Date.parse(z)).filter((z) => Number.isFinite(z) && z <= t && t - z < TAG).sort((a, b) => a - b);
  const ab = [];
  if (tag.length && t - tag[tag.length - 1] < JETZT.abstand) ab.push(tag[tag.length - 1] + JETZT.abstand);
  if (tag.length >= JETZT.tag) ab.push(tag[tag.length - JETZT.tag] + TAG);
  if (ab.length) return [429, { fehler: "zu-frueh", wieder: new Date(Math.max(...ab)).toISOString() }];
  // erst gemerkt, dann die Marke: scheitert das Schreiben, gibt es keine
  schreibenAtomar(datei, JSON.stringify({ zuletzt: jetzt.toISOString(), tag: tag.concat(t).slice(-JETZT.tag).map((z) => new Date(z).toISOString()) }));
  const marke = join(verzeichnis, ...JETZT_MARKE);
  mkdirSync(join(verzeichnis, JETZT_MARKE[0]), { recursive: true });
  schreibenAtomar(marke, JSON.stringify({ zeit: jetzt.toISOString() }));
  return [200, { angefordert: jetzt.toISOString() }];
}
// Stand für den Status: angefordert (die Marke liegt noch), laeuft (root hat sie genommen, aktualisierung.json ist älter als die
// Anfrage), sonst bereit; beides höchstens JETZT.hoechstens nach der Anfrage
export function jetztStand(verzeichnis, jetzt = new Date(), aktualisierung = null) {
  const zuletzt = Date.parse(String((lesen(join(verzeichnis, WEB, "jetzt.json"), {}) || {}).zuletzt || ""));
  if (!Number.isFinite(zuletzt) || jetzt.getTime() - zuletzt > JETZT.hoechstens) return "bereit";
  if (existsSync(join(verzeichnis, ...JETZT_MARKE))) return "angefordert";
  const fertig = Date.parse(String((aktualisierung && aktualisierung.zeit) || ""));
  return Number.isFinite(fertig) && fertig >= zuletzt - 1000 ? "bereit" : "laeuft";
}

// Takt aus den Einstellungen in Obsidian: Uni-Postfach alle 15, 30 oder 60 Minuten, Gmail 3-, 1- oder 0-mal am Tag; alles
// andere (auch ein älteres Plugin ohne Takt) → Standard
export const TAKT = { uni_postfach: [15, 30, 60], gmail: [3, 1, 0] };
export function taktPruefen(roh) {
  const o = roh && typeof roh === "object" ? roh : {};
  const wahl = (k) => (TAKT[k].includes(o[k]) ? o[k] : TAKT[k][0]);
  return { uni_postfach: wahl("uni_postfach"), gmail: wahl("gmail") };
}

// Prüft den entschlüsselten Stand des Plugins; liefert { stand, erledigt, lagebild } oder wirft. lagebild (nur solange der Connector an
// ist, claude-app.mjs lagebildPruefen) bleibt getrennt vom Stand: stand-plugin.json liest auch der Lauf, das Lagebild (mit Noten) nur der
// Dienst für den Connector.
export function standPruefen(roh, heute = new Date().toISOString().slice(0, 10)) {
  if (!roh || roh.schema !== 1) throw new Error("Stand: unbekanntes Schema");
  const module = Array.isArray(roh.module) ? roh.module.filter((m) => MODULCODE.test(m)).slice(0, 80) : [];
  const text = (w, n) => (typeof w === "string" ? w.slice(0, n) : "");
  const erledigt = Array.isArray(roh.erledigt) ? roh.erledigt.filter((n) => typeof n === "string" && DATEINAME.test(n)).slice(0, 500) : [];
  const stand = { schema: 1, module, studienbeginn: text(roh.studienbeginn, 20), variante: text(roh.variante, 40), takt: taktPruefen(roh.takt),
    tresor: tresorPruefen(roh.tresor) };
  const lernplan = lernplanPruefen(roh.lernplan);
  if (lernplan) stand.lernplan = lernplan;
  return { stand, erledigt, lagebild: lagebildPruefen(roh.lagebild, heute) };
}

// Lage für den Connector (claude-app/daten/lage.json): neu, solange er an ist, sonst weg, mit Lagebild und gemerkten Hinweisen; ebenso
// mit dem Notschalter im Paket (aus). Scheitert es, bleibt dem Connector die vorige.
export function lageAktualisieren(verzeichnis, jetzt = new Date(), aus = abgeschaltet()) {
  try {
    lageSchreiben(verzeichnis, istAn(verzeichnis) && !aus ? eingangBuendel(verzeichnis, jetzt) : null, jetzt, aus);
  } catch (e) { /* nächster Versuch beim nächsten Stand, Abholen oder in 5 Minuten */ }
}
// Für welche Module das Plugin eine Kapitelliste vom Server will: laufendes Semester, Module ohne zentrale Liste, dazu die Listen
// der Lernplan-Notizen, die schon vom Server stammen (listen: nur nr, titel, teile; für lauf.mjs, falls kapitel.json sie nicht hat).
// Jede Liste geprüft wie im Eingang (kapitelModulNormal; ungültig → weg), nur für gefragte Module, zusammen höchstens
// LISTEN_ZEICHEN. → Objekt oder null (älteres Plugin ohne das Feld)
const LISTEN_ZEICHEN = 150000;
export function lernplanPruefen(l, heute = new Date().toISOString().slice(0, 10)) {
  if (!l || typeof l !== "object" || typeof l.semester !== "string" || !SEMESTER.test(l.semester)) return null;
  const module = Array.isArray(l.module) ? [...new Set(l.module.filter((m) => typeof m === "string" && MODULCODE.test(m)))].slice(0, 60) : [];
  const listen = [];
  let zeichen = 0;
  for (const x of Array.isArray(l.listen) ? l.listen.slice(0, 60) : []) {
    if (!x || typeof x !== "object" || !module.includes(x.code) || listen.some((y) => y.code === x.code) || !Array.isArray(x.kapitel)) continue;
    const r = kapitelModulNormal({ code: x.code, semester: l.semester, kapitel: x.kapitel.map((k) => (k && typeof k === "object" ? { nr: k.nr, titel: k.titel, teile: k.teile } : k)) }, heute);
    if (r.fehler) continue;
    const kapitel = r.wert.kapitel.map((k) => (k.teile ? { nr: k.nr, titel: k.titel, teile: k.teile } : { nr: k.nr, titel: k.titel }));
    zeichen += JSON.stringify(kapitel).length;
    if (zeichen > LISTEN_ZEICHEN) break;
    listen.push({ code: x.code, kapitel });
  }
  return listen.length ? { semester: l.semester, module, listen } : { semester: l.semester, module };
}

// sperre: Grenzen der Sperre (Tests geben kleinere); uhr: Zeit für die Signaturen in Millisekunden (die echte, auch wenn ein Test
// jetzt verstellt, denn das Plugin signiert mit der echten); signatur: Fenster und Zahl der gemerkten Zufallswerte (kanal.mjs SIGNATUR);
// connectorAus: Notschalter (CONNECTOR im Paket)
export function erzeugeDienst({ konfig, verzeichnis, jetzt = () => new Date(), sperre = SPERRE, uhr = () => Date.now(), signatur = SIGNATUR,
  connectorAus = abgeschaltet }) {
  const web = webOrdner(verzeichnis);
  const nonces = new NonceSpeicher(signatur.nonces, { datei: join(web, "nonces.log"), jetztMs: uhr() });
  const fehlversuche = new Map(); // Netz des Absenders → Zeitpunkte
  const absenderVon = (req) => String(req.headers["x-forwarded-for"] || "").split(",").pop().trim() || req.socket.remoteAddress || "?";
  const netzVon = (wer) => ipNetz(wer, 56) || wer;
  const frisch = (k) => {
    const grenze = jetzt().getTime() - sperre.fenster;
    const liste = (fehlversuche.get(k) || []).filter((t) => t >= grenze);
    if (liste.length) fehlversuche.set(k, liste); else fehlversuche.delete(k);
    return liste;
  };
  // ein Netz, das nicht in der vollen Liste steht, zählt unter UEBERLAUF
  const schluesselVon = (wer) => (fehlversuche.has(netzVon(wer)) || fehlversuche.size < sperre.absender ? netzVon(wer) : UEBERLAUF);
  const gesperrt = (wer) => frisch(schluesselVon(wer)).length >= sperre.fehler;
  // Einträge, deren letzter Fehlversuch abgelaufen ist, von vorn weg (die Liste ist danach geordnet)
  const abgelaufeneWeg = () => {
    const grenze = jetzt().getTime() - sperre.fenster;
    for (const [k, liste] of fehlversuche) {
      if (liste[liste.length - 1] >= grenze) break;
      fehlversuche.delete(k);
    }
  };
  const fehlversuch = (wer) => {
    if (!fehlversuche.has(netzVon(wer)) && fehlversuche.size >= sperre.absender) abgelaufeneWeg();
    const k = schluesselVon(wer);
    const liste = (fehlversuche.get(k) || []).concat(jetzt().getTime()).slice(-sperre.fehler);
    fehlversuche.delete(k);
    fehlversuche.set(k, liste);
  };
  // 429 mit wieder (ab wann es wieder geht): dazu Retry-After in Sekunden. Auf eine gültig signierte Anfrage (res.nonce, auch bei 401
  // uhr) dazu studium-signatur: v=1,mac=… (kanal.mjs antwortMac) unter dem Paar, mit dem sie signiert war (res.paar: gemeinsam, eigenes
  // eines Geräts oder ein altes nach dem Erneuern, ALT_FRIST)
  const antwort = (res, code, objekt) => {
    const kopf = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };
    const text = objekt === undefined ? "" : JSON.stringify(objekt);
    if (res.nonce && res.paar) kopf["studium-signatur"] = `v=1,mac=${antwortMac(res.paar, res.nonce, code, text)}`;
    const wieder = code === 429 && objekt && Date.parse(objekt.wieder || "");
    if (Number.isFinite(wieder)) kopf["retry-after"] = String(Math.max(1, Math.ceil((wieder - jetzt().getTime()) / 1000)));
    res.writeHead(code, code === 413 ? { ...kopf, connection: "close" } : kopf);
    res.end(text);
  };
  // inhalt: SHA-256 (base64url) aus dem Kopf einer signierten Anfrage; der Körper muss genau ihn haben
  const koerper = (req, max, inhalt) => new Promise((fertig, fehler) => {
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
      const roh = Buffer.concat(teile);
      if (inhalt && inhaltVon(roh) !== inhalt) return fehler(Object.assign(new Error("Körper passt nicht zur Signatur"), { status: 400 }));
      try { fertig(JSON.parse(roh.toString("utf8") || "null")); } catch (e) { fehler(Object.assign(e, { status: 400 })); }
    });
    req.on("error", fehler);
  });
  // Direkt auf 127.0.0.1, nicht über Caddy: Caddy setzt bei jeder weitergeleiteten Anfrage X-Forwarded-For (und -Proto, -Host),
  // ein Absender aus dem Internet kann das nicht verhindern. So fragen installieren.sh und studium-server status.
  const direktLokal = (req) => ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress) &&
    !["x-forwarded-for", "x-forwarded-proto", "x-forwarded-host", "forwarded"].some((k) => k in req.headers);
  // Marke in web/ schreiben; scheitert es (volle Platte), gilt der Zustand nur im Speicher
  const marke = (name, objekt) => {
    try { schreibenAtomar(join(web, name), JSON.stringify(objekt)); } catch (e) { /* nur im Speicher */ }
  };
  // Marke mit dem Beginn von etwas (seit: Millisekunden; eine unlesbare Marke zählt wie eine von 1970) oder null; setzen() schreibt sie,
  // wenn sie fehlt. Einmal gesetzt, bleibt es.
  const beginn = (name) => {
    let ms = null;
    const seit = () => {
      if (ms === null && existsSync(join(web, name))) {
        const t = Date.parse(String((lesen(join(web, name), {}) || {}).seit || ""));
        ms = Number.isFinite(t) ? t : 0;
      }
      return ms;
    };
    seit.setzen = () => {
      if (seit() !== null) return;
      ms = jetzt().getTime();
      marke(name, { seit: jetzt().toISOString() });
    };
    return seit;
  };
  // erste gültige Signatur; erstes Gerät mit eigenen Schlüsseln
  const signaturSeit = beginn(SIGNATUR_GESEHEN), geraeteSeit = beginn(GERAETE_SEIT);
  const signaturGesehen = () => signaturSeit() !== null;
  // Übergang, der nur in eine Richtung geht (Bearer bis 0.7.7: BEARER_FRIST, BEARER_SCHLUSS; gemeinsamer Schlüssel für Signaturen:
  // GEMEINSAM_FRIST, GEMEINSAM_SCHLUSS): ab seit() höchstens schluss lang, und nur, solange er nicht frist lang ungenutzt war (die letzte
  // Benutzung in der Marke zuletzt, höchstens stündlich geschrieben). Das erste Nein schreibt die Marke aus und gilt für immer, auch wenn
  // die Uhr zurückgeht. vorbei() fragt nur; erlaubt() zählt die Anfrage dazu als Benutzung.
  const uebergang = ({ seit, zuletzt, aus, frist, schluss }) => {
    let ist = false, zuletztMs = NaN;
    const letzte = () => {
      const datei = Date.parse(String((lesen(join(web, zuletzt), {}) || {}).zuletzt || ""));
      return Math.max(Number.isFinite(datei) ? datei : -Infinity, Number.isFinite(zuletztMs) ? zuletztMs : -Infinity);
    };
    const vorbei = () => {
      if (ist || (ist = existsSync(join(web, aus)))) return true;
      const t = jetzt().getTime(), s = seit();
      if (s !== null && (t - Math.max(letzte(), s) > frist || t - s > schluss)) {
        ist = true;
        marke(aus, { seit: jetzt().toISOString() });
      }
      return ist;
    };
    const erlaubt = () => {
      if (vorbei()) return false;
      const t = jetzt().getTime(), b = letzte();
      if (!Number.isFinite(b) || t - b > 3600e3) {
        zuletztMs = t;
        marke(zuletzt, { zuletzt: jetzt().toISOString() });
      }
      return true;
    };
    return { vorbei, erlaubt };
  };
  const bearer = uebergang({ seit: signaturSeit, zuletzt: BEARER, aus: BEARER_AUS, frist: BEARER_FRIST, schluss: BEARER_SCHLUSS });
  const gemeinsam = uebergang({ seit: geraeteSeit, zuletzt: GEMEINSAM, aus: GEMEINSAM_AUS, frist: GEMEINSAM_FRIST, schluss: GEMEINSAM_SCHLUSS });
  // die Schlüssel vor dem letzten Erneuern, solange sie noch zählen (ALT_FRIST) → { zugang, schluessel } | null
  const altKonfig = () => {
    const t = Date.parse(String(konfig.erneuert || ""));
    if (typeof konfig.zugang_alt !== "string" || typeof konfig.schluessel_alt !== "string" || !Number.isFinite(t) || jetzt().getTime() - t > ALT_FRIST) return null;
    return { zugang: konfig.zugang_alt, schluessel: konfig.schluessel_alt };
  };
  // Geräte mit eigenen Schlüsseln (geraete.mjs); vor jeder signierten Anfrage und beim Start an dienst.json und die Marken angeglichen
  const geraete = geraeteVerzeichnis(web, { jetzt });
  // Was getrennte Geräte hinterlassen (r: { weg, folgen, behalten } aus geraete.mjs): ihre offenen Codes (für Geräte und die Claude-App)
  // gelten nicht mehr, und mit folgen sind die Verbindungen der Claude-App aus ihren Codes getrennt, außer behalten. Lässt sich davon
  // etwas nicht löschen, hält es das Einlösen auf (vonGilt) bzw. der nächste Versuch, wenn die Marke noch liegt.
  const folgen = (r) => {
    try { codesZurueckziehen(web, r.weg); } catch (e) { /* vonGilt hält sie auf */ }
    try { claudeAppVon(verzeichnis, r.weg, { trennen: r.folgen, behalten: r.behalten, jetzt: jetzt() }); } catch (e) { /* nur dieser Teil fehlt */ }
  };
  const geraeteAktuell = () => { for (const r of geraete.abgleichen(konfig, altKonfig())) folgen(r); };
  geraeteAktuell();
  // Zugang einer Anfrage → { ok: true, art: bearer | signatur, paar (das Schlüsselpaar dieser Anfrage), geraet (Kennung, "" beim
  // gemeinsamen), inhalt?, beweis? } | { ok: false, fehler, nonce?, paar? }. Bearer: Plugins bis 0.7.7 (der gemeinsame Schlüssel selbst im
  // Kopf): nur, solange der Bearer gilt (BEARER_FRIST) und der gemeinsame Schlüssel (GEMEINSAM_FRIST; ein Bearer zählt dort als
  // Benutzung), sonst veraltet. Signatur: kanal.mjs signaturPruefen gegen den gemeinsamen Schlüssel und jedes Gerät
  // erneuert: die Signatur stimmt nur unter den alten Schlüsseln (ALT_FRIST, die gemeinsamen oder die Geräte von damals); gemeinsam-aus:
  // der gemeinsame Schlüssel, aber seine Frist für Signaturen ist vorbei (GEMEINSAM_FRIST). Beides wird abgewiesen, ohne den Zufallswert
  // zu merken. Die Zufallswerte zählt der NonceSpeicher je Schlüssel (fach: Kennung des Geräts oder „gemeinsam“)
  const fach = (paar) => (paar === konfig ? "gemeinsam" : paar.id);
  const zugang = (req, pfad) => {
    const kopf = String(req.headers.authorization || "");
    if (kopf.startsWith("Bearer ")) {
      if (!gleich(kopf.slice(7), konfig.zugang)) return { ok: false, fehler: "zugang" };
      if (gemeinsam.vorbei() || !bearer.erlaubt()) return { ok: false, fehler: "veraltet" };
      gemeinsam.erlaubt();
      return { ok: true, art: "bearer", paar: konfig, geraet: "" };
    }
    if (!kopf.startsWith("Studium-Signatur ")) return { ok: false, fehler: "zugang" };
    geraeteAktuell();
    const p = signaturPruefen(kopf, [konfig, ...geraete.geraete], req.method, pfad, uhr(), nonces,
      { fenster: signatur.fenster, fach, nein: (paar) => (paar === konfig && gemeinsam.vorbei() ? "gemeinsam-aus" : "") });
    if (p.ok) {
      signaturSeit.setzen();
      const geraet = p.paar === konfig ? "" : p.paar.id;
      if (!geraet && !gemeinsam.erlaubt()) return { ok: false, fehler: "gemeinsam-aus", nonce: p.nonce, paar: konfig };
      if (geraet) geraete.benutzt(geraet);
      return { ...p, art: "signatur", geraet };
    }
    if (p.fehler === "gemeinsam-aus") {
      signaturSeit.setzen();
      return p;
    }
    const alt = p.fehler === "zugang" && altKonfig();
    if (alt) {
      const q = signaturPruefen(kopf, [alt, ...geraete.alt], req.method, pfad, uhr(), nonces, { fenster: signatur.fenster, nein: () => "erneuert" });
      if (q.fehler === "erneuert" || q.fehler === "uhr") return { ok: false, fehler: "erneuert", nonce: q.nonce, paar: q.paar };
    }
    return p;
  };
  // Abgelehnt → 401 mit signatur: 1 (daran erkennt das Plugin ab 0.7.8 einen Server, der Signaturen kennt; einer bis 0.7.7 sagt nur
  // zugang). uhr (Zeit außerhalb des Fensters) zählt nicht als Fehlversuch: Die Signatur stimmte, nur die Uhr des Geräts geht falsch.
  // Eine wiederholte Anfrage schickt das Plugin nie: Fehlversuch. Ein getrenntes Gerät ist ein unbekannter Schlüssel: Fehlversuch.
  // Die alten Schlüssel nach dem Erneuern (erneuert): kein Fehlversuch, das Gerät soll es nur erfahren. Der gemeinsame Schlüssel nach
  // seiner Frist (gemeinsam-aus): 401 zugang wie ein unbekannter, aber signiert (das Gerät soll sich gleich neu verbinden) und ohne
  // Fehlversuch.
  const abweisen = (res, wer, p) => {
    if (p.fehler === "uhr") return antwort(res, 401, { fehler: "uhr", signatur: 1 });
    if (p.fehler === "erneuert") return antwort(res, 401, { fehler: "zugang", erneuert: 1, signatur: 1 });
    if (p.fehler === "gemeinsam-aus") return antwort(res, 401, { fehler: "zugang", signatur: 1 });
    // der richtige Schlüssel als Bearer, aber dessen Frist ist vorbei: kein Fehlversuch (Plugin bis 0.7.7, es braucht ein Update)
    if (p.fehler === "veraltet") return antwort(res, 401, { fehler: "veraltet", signatur: 1 });
    if (gesperrt(wer)) return antwort(res, 429, { fehler: "zu-viele-versuche" });
    fehlversuch(wer);
    return antwort(res, 401, { fehler: p.fehler === "wiederholt" ? "wiederholt" : "zugang", signatur: 1 });
  };
  // POST /v1/geraete, entschlüsselt (Zweck „geraete“): { schema: 1, zeit, nonce, aktion, id?, behalten?, name? }; Zeit und Zufallswert
  // wie bei /v1/geraet (verbinden.mjs anfrageEinmal). p: Zugang der Anfrage (paar, geraet); wer: Absender (Netz eines neuen Geräts).
  // trennen: id mit allem, was es hereinließ (geraete.mjs kaskade; nie das fragende Gerät; behalten: Kennungen von Geräten und
  // Verbindungen der Claude-App, die bleiben sollen). → [Status, Antwort]: 200 liste { geraete } | trennen { getrennt: [Kennung], geraete } |
  // umziehen { adresse, geraet, zugang, schluessel } (verschlüsselt mit Zweck „geraete-antwort“); 404 { fehler: unbekannt } (trennen:
  // kein solches Gerät, auch nicht der gemeinsame Schlüssel); 409 { fehler: zu-viele-geraete | zu-viele-umzuege } (umziehen: voll); 429
  // { fehler: zu-viele, wieder } (umziehen: zu viele je Stunde); 400 { fehler: anfrage | uhr }, 409 { fehler: wiederholt }, 429 { fehler:
  // zu-viele } wie anfrageEinmal. umziehen mit dem gemeinsamen Schlüssel braucht umzug (Kennung des Umzugs, geraete.mjs umziehen); mit
  // eigenen Schlüsseln gibt es dieselben zurück (so erfährt ein Gerät von 0.7.8 bis 0.7.11 seine Kennung).
  // Gilt noch, wer einen Code ausgab (verbinden.mjs codeVon)? Die Cloud Shell immer, der gemeinsame Schlüssel bis zu seinem Ende, ein
  // Gerät, solange es verbunden ist: Der Code eines getrennten Geräts geht nicht mehr, auch wenn ihn das Zurückziehen nicht erreichte.
  const vonGilt = (von) => von === "cloud-shell" || (von === "gemeinsam" ? !gemeinsam.vorbei() : !!geraete.finden(von));
  const geraeteAnfrage = (a, p, wer) => {
    const nein = anfrageEinmal(web, a, jetzt(), fach(p.paar));
    if (nein) return nein;
    const meins = (g) => ({ adresse: konfig.adresse, geraet: g.id, zugang: g.zugang, schluessel: g.schluessel });
    if (a.aktion === "liste") return [200, { geraete: geraete.liste(p.geraet) }];
    if (a.aktion === "trennen") {
      const r = typeof a.id === "string" ? geraete.trennen(a.id, { fragt: p.geraet, behalten: a.behalten }) : { status: "unbekannt" };
      if (r.status === "unbekannt") return [404, { fehler: "unbekannt" }];
      folgen(r);
      if (r.status === "speichern") return [503, { fehler: "speichern" }];
      return [200, { getrennt: r.weg, geraete: geraete.liste(p.geraet) }];
    }
    if (a.aktion !== "umziehen") return [400, { fehler: "anfrage" }];
    if (p.geraet) return [200, meins(geraete.finden(p.geraet))];
    // mit dem gemeinsamen Schlüssel nur mit Kennung des Umzugs (dieselbe ergibt dasselbe Gerät) und begrenzt (geraete.mjs UMZUG)
    if (typeof a.umzug !== "string" || !UMZUG_KENNUNG.test(a.umzug)) return [400, { fehler: "anfrage" }];
    const r = geraete.umziehen(a.umzug, { netz: ipNetz(wer, 48), name: a.name });
    if (r.fehler === "zu-viele") return [429, { fehler: "zu-viele", wieder: r.wieder }];
    if (r.fehler) return [r.fehler === "speichern" ? 503 : 409, { fehler: r.fehler }];
    geraeteSeit.setzen();
    return [200, meins(r.g)];
  };

  return createServer(async (req, res) => {
    const pfad = new URL(req.url, "http://lokal").pathname;
    try {
      const wer = absenderVon(req);
      if (pfad === "/v1/status") {
        if (req.method !== "GET") return antwort(res, 405, { fehler: "methode" });
        const aktualisierung = () => lesen(join(verzeichnis, "aktualisierung.json"), null);
        const werte = () => statusWerte(lesen(join(verzeichnis, "zustand.json"), {}), lesen(join(web, "abruf.json"), {}), konfig.version, jetzt(),
          anstossWartet(verzeichnis), lesen(join(web, "takt.json"), {}), aktualisierung());
        const alles = () => ({ ...werte(), aktualisierung: aktualisierungPruefen(aktualisierung(), true), aktualisieren_jetzt: jetztStand(verzeichnis, jetzt(), aktualisierung()),
          verbunden: verbundenLesen(web, jetzt()),
          grenzen: grenzenPruefen((lesen(join(verzeichnis, "zustand.json"), {}) || {}).grenzen) });
        const p = zugang(req, pfad);
        Object.assign(res, { nonce: p.nonce, paar: p.paar });
        if (p.ok && p.inhalt && p.inhalt !== INHALT_LEER) return antwort(res, 400, { fehler: "anfrage" });
        // mit Schlüssel dazu die Geräte mit eigenen Schlüsseln (dieses: das fragende), nie ohne
        if (p.ok) {
          if (!existsSync(join(web, STATUS_GESCHUETZT))) marke(STATUS_GESCHUETZT, { seit: jetzt().toISOString() });
          return antwort(res, 200, { ...alles(), geraete: geraete.liste(p.geraet) });
        }
        // direkt auf dem Server (installieren.sh, studium-server status): alles wie mit Schlüssel außer den Geräten, ohne die Marke zu setzen
        if (direktLokal(req)) return antwort(res, 200, alles());
        // ein signierter Kopf, der nicht stimmt, wird immer abgewiesen (das Plugin ab 0.7.8 soll es merken); ohne Kopf oder mit einem
        // falschen Bearer erst, sobald der Status geschützt ist
        if (String(req.headers.authorization || "").startsWith("Studium-Signatur ") || existsSync(join(web, STATUS_GESCHUETZT))) return abweisen(res, wer, p);
        return antwort(res, 200, werte()); // Übergang: noch kein Gerät hat den Status mit Schlüssel geholt (Plugin bis 0.7.7)
      }
      if (pfad.startsWith("/v1/livesync/")) {
        if (req.method !== "GET") return antwort(res, 405, { fehler: "methode" });
        // erst die Kennung, dann die Sperre: eine gültige geht immer
        const setupLink = abholen(web, pfad.slice("/v1/livesync/".length), jetzt());
        if (!setupLink) {
          if (gesperrt(wer)) { fehlversuch(wer); return antwort(res, 429, { fehler: "zu-viele-versuche" }); }
          fehlversuch(wer);
        }
        res.writeHead(setupLink ? 200 : 404, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store",
          "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'", "referrer-policy": "no-referrer" });
        return res.end(seite(setupLink));
      }
      if (!["/v1/eingang", "/v1/stand", "/v1/unterlagen", "/v1/kapitel", "/v1/pdf", "/v1/anstoss", "/v1/verbinden", "/v1/geraet", "/v1/geraete", "/v1/claude-app", "/v1/aktualisieren"].includes(pfad)) {
        return antwort(res, 404, { fehler: "unbekannt" });
      }

      if (pfad === "/v1/verbinden") {
        if (req.method !== "POST") return antwort(res, 405, { fehler: "methode" });
        const daten = await koerper(req, MAX_KOERPER[pfad]);
        // erst der Code, dann die Sperre: ein gültiger Code geht immer (eingelöst mit grobem Netz und Gerätenamen fürs Protokoll)
        const d = daten && typeof daten === "object" ? daten : {};
        const info = { netz: ipNetz(wer, 48), geraet: d.geraet };
        // ab 0.7.8: Kennung statt Code, Antwort verschlüsselt, mit eigenen Schlüsseln für dieses Gerät (geraete.mjs; voll: 409, der Code
        // bleibt); ohne schema der Weg bis 0.7.7 mit dem Code selbst und den gemeinsamen Schlüsseln, nur solange der Bearer gilt und noch
        // kein Gerät eigene Schlüssel hat (geraeteSeit): Danach gäbe er jedem mit einem Code den gemeinsamen Schlüssel, den kein Trennen
        // erreicht, und ein solches Plugin muss vor dem Verbinden aktualisiert werden (403 veraltet, der Code bleibt, kein Fehlversuch)
        if (d.schema === 2) {
          geraeteAktuell();
          const g = geraete.neu();
          // eingetragen, bevor der Code verbraucht ist: Lässt sich das Verzeichnis nicht schreiben, gibt es keine Schlüssel (503), und
          // der Code bleibt
          const neu = codeEinloesenNeu(web, d, { adresse: konfig.adresse, zugang: g.zugang, schluessel: g.schluessel, geraet: g.id,
            eintragen: (code) => (!vonGilt(code.von) ? "code" : geraete.dazu(g, { herkunft: code.herkunft, von: code.von, netz: info.netz, name: d.geraet }).fehler || ""),
            zuruecknehmen: () => geraete.trennen(g.id, { nur: true }) }, jetzt(), info);
          if (neu && neu.fehler) return antwort(res, neu.fehler === "speichern" ? 503 : 409, { fehler: neu.fehler, schema: 2 });
          if (neu) {
            geraeteSeit.setzen();
            return antwort(res, 200, neu.antwort);
          }
        } else if (bearer.vorbei() || geraeteSeit() !== null) {
          return antwort(res, 403, { fehler: "veraltet", schema: 2 });
        } else if (codeEinloesen(web, d.code, jetzt(), info)) {
          return antwort(res, 200, { adresse: konfig.adresse, zugang: konfig.zugang, schluessel: konfig.schluessel });
        }
        const zuViele = gesperrt(wer);
        fehlversuch(wer);
        // schema: 2 sagt dem Plugin ab 0.7.8, dass dieser Server den neuen Austausch kennt (dann stimmt der Code nicht)
        return zuViele ? antwort(res, 429, { fehler: "zu-viele-versuche" }) : antwort(res, 403, { fehler: "code", schema: 2 });
      }
      const p = zugang(req, pfad);
      Object.assign(res, { nonce: p.nonce, paar: p.paar });
      if (!p.ok) return abweisen(res, wer, p);
      const inhaltLesen = () => koerper(req, MAX_KOERPER[pfad], p.inhalt);
      // Datenschlüssel dieser Anfrage: der gemeinsame oder der eigene des Geräts
      const schluessel = p.paar.schluessel;

      if (pfad === "/v1/eingang") {
        if (req.method !== "GET") return antwort(res, 405, { fehler: "methode" });
        if (p.inhalt && p.inhalt !== INHALT_LEER) return antwort(res, 400, { fehler: "anfrage" });
        const paket = await verschluesseln(schluessel, "eingang", { ...eingangBuendel(verzeichnis, jetzt()), verbunden: verbundenLesen(web, jetzt()),
          geraete: geraete.liste(p.geraet), claude_app: claudeAppStatus(verzeichnis, connectorAus()) });
        marke("abruf.json", { zuletzt: jetzt().toISOString() });
        lageAktualisieren(verzeichnis, jetzt(), connectorAus());
        return antwort(res, 200, paket);
      }
      if (req.method !== "POST") return antwort(res, 405, { fehler: "methode" });
      if (pfad === "/v1/anstoss") {
        // signiert (ab 0.7.8) nur mit dem Beweis des Datenschlüssels: Ein Lauf kostet Abo-Limit, der Zugangsschlüssel allein reicht nicht
        if (p.art === "signatur" && !p.beweis) {
          fehlversuch(wer);
          return antwort(res, 403, { fehler: "datenschluessel" });
        }
        // Bearer (bis 0.7.7) startet keinen Lauf mehr, sobald ein Gerät signiert: wer den Zugangsschlüssel mitlas, hat den Datenschlüssel
        // nicht (keine Zählung als Fehlversuch, es kann ein altes Plugin sein)
        if (p.art === "bearer" && signaturGesehen()) return antwort(res, 403, { fehler: "veraltet" });
        return antwort(res, ...knopfAnstoss(verzeichnis, jetzt(), await inhaltLesen()));
      }
      if (pfad === "/v1/claude-app") {
        // Bearer (bis 0.7.7) nie: Diese Plugins kennen die Claude-App nicht. Signiert nur mit dem Beweis des Datenschlüssels: Ein Code gibt
        // claude.ai Zugriff auf Termine, To-dos und Noten, der Zugangsschlüssel allein reicht dafür nicht
        if (p.art !== "signatur") return antwort(res, 403, { fehler: "veraltet" });
        if (!p.beweis) {
          fehlversuch(wer);
          return antwort(res, 403, { fehler: "datenschluessel" });
        }
        const [status, aus] = claudeApp(verzeichnis, await entschluesseln(schluessel, "claude-app", await inhaltLesen()),
          { jetzt: jetzt(), adresse: konfig.adresse, abgeschaltet: connectorAus(), lage: () => lageAktualisieren(verzeichnis, jetzt(), connectorAus()),
            wer: fach(p.paar), von: fach(p.paar) });
        return antwort(res, status, status === 200 ? await verschluesseln(schluessel, "claude-app-antwort", aus) : aus);
      }
      if (pfad === "/v1/aktualisieren") {
        // wie /v1/claude-app: nur signiert mit dem Beweis des Datenschlüssels; die Anfrage trägt nur Zeit und Zufallswert (anfrageEinmal)
        if (p.art !== "signatur") return antwort(res, 403, { fehler: "veraltet" });
        if (!p.beweis) {
          fehlversuch(wer);
          return antwort(res, 403, { fehler: "datenschluessel" });
        }
        const nein = anfrageEinmal(web, await entschluesseln(schluessel, "aktualisieren", await inhaltLesen()), jetzt(), fach(p.paar));
        return antwort(res, ...(nein || jetztAnstoss(verzeichnis, jetzt())));
      }
      if (pfad === "/v1/geraet") {
        // Bearer (bis 0.7.7) nur, solange kein Gerät eigene Schlüssel hat: Ein Code ergibt eigene Schlüssel, die den gemeinsamen
        // überleben; wer nur ihn mitlas, bekäme so dauerhaft Zugang (kein Fehlversuch, es kann ein altes Plugin sein)
        if (p.art === "bearer" && geraeteSeit() !== null) return antwort(res, 403, { fehler: "veraltet" });
        const [status, aus] = geraetCode(web, await entschluesseln(schluessel, "verbinden", await inhaltLesen()), jetzt(), konfig.adresse, { wer: fach(p.paar), von: fach(p.paar) });
        // signiert (ab 0.7.8) mit eigenem Zweck für die Antwort; Plugins bis 0.7.7 erwarten verbinden
        return antwort(res, status, status === 200 ? await verschluesseln(schluessel, p.art === "signatur" ? "verbinden-antwort" : "verbinden", aus) : aus);
      }
      if (pfad === "/v1/geraete") {
        // nur signiert mit dem Beweis des Datenschlüssels: Trennen und Umziehen ändern, wer den Server erreicht
        if (p.art !== "signatur" || !p.beweis) {
          fehlversuch(wer);
          return antwort(res, 403, { fehler: "datenschluessel" });
        }
        const [status, aus] = geraeteAnfrage(await entschluesseln(schluessel, "geraete", await inhaltLesen()), p, wer);
        return antwort(res, status, status === 200 ? await verschluesseln(schluessel, "geraete-antwort", aus) : aus);
      }
      if (pfad === "/v1/unterlagen") {
        const n = unterlagenAblegen(verzeichnis, unterlagenPruefen(await entschluesseln(schluessel, "unterlagen", await inhaltLesen())), jetzt());
        return antwort(res, 200, { angenommen: n });
      }
      if (pfad === "/v1/kapitel") {
        const n = kapitelAblegen(verzeichnis, kapitelUnterlagenPruefen(await entschluesseln(schluessel, "kapitel", await inhaltLesen())), jetzt());
        return antwort(res, 200, { angenommen: n });
      }
      if (pfad === "/v1/pdf") {
        return antwort(res, 200, pdfTeilAblegen(verzeichnis, await entschluesselnRoh(schluessel, "pdf", await inhaltLesen()), jetzt()));
      }
      // /v1/stand
      const { stand, erledigt, lagebild } = standPruefen(await entschluesseln(schluessel, "stand", await inhaltLesen()), jetzt().toISOString().slice(0, 10));
      // stand-plugin.json nur für den Lauf (0640, Gruppe studium-web), takt.json auch für abrufen.py (anderer Benutzer, ohne den Stand)
      schreibenAtomar(join(web, "stand-plugin.json"), JSON.stringify(stand), 0o640);
      schreibenAtomar(join(web, "takt.json"), JSON.stringify(stand.takt), 0o644);
      // das Lagebild nur für den Connector und nur, solange er an ist und das Paket ihn erlaubt (0600: nicht für den Lauf)
      const fuerConnector = istAn(verzeichnis) && !connectorAus();
      if (lagebild && fuerConnector) schreibenAtomar(join(web, "lagebild.json"), JSON.stringify(lagebild), 0o600);
      else rmSync(join(web, "lagebild.json"), { force: true });
      if (fuerConnector) hinweiseMerken(verzeichnis, erledigt, jetzt());
      for (const name of erledigt) rmSync(join(verzeichnis, "eingang", name), { force: true });
      lageAktualisieren(verzeichnis, jetzt(), connectorAus());
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
  setInterval(() => {
    try {
      if (limitWiederholen(verzeichnis)) console.log("Limit des Claude-Abos: nächster Versuch angestoßen");
    } catch (e) {
      console.error("Limit: " + (e && e.message));
    }
    // neue Hinweise und Termine im Eingang auch dann für den Connector, wenn Obsidian gerade nicht abholt
    lageAktualisieren(verzeichnis);
  }, LIMIT_PRUEFEN);
}
