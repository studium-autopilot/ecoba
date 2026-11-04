// Geräte mit eigenen Schlüsseln. Bis 0.7.11 teilten sich alle Geräte Zugangs- und Datenschlüssel aus dienst.json; ein verlorenes Gerät
// hieß: neue Schlüssel für alle und jedes Gerät neu verbinden. Seitdem bekommt jedes Gerät, das sich mit einem Code verbindet (POST
// /v1/verbinden ab 0.7.8, verbinden.mjs codeEinloesenNeu), ein eigenes Paar; ein Gerät mit dem gemeinsamen zieht mit POST /v1/geraete
// („umziehen“, dienst.mjs) einmal auf eigene um. So lässt sich ein Gerät allein trennen, und jedes sieht die Liste der anderen.
// Das Verzeichnis web/geraete-schluessel.json (0600) liest und schreibt nur der Web-Dienst:
//   { schema: 1, fuer, geraete: [{ id, zugang, schluessel, seit, zuletzt, herkunft, von, netz?, name?, umzug?, neu? }], umzuege: [Zeit],
//   alt?: { fuer, geraete: [{ id, zugang, schluessel }] } }
// id: 16 Zufallsbytes, zugang und schluessel je 32 (base64url). herkunft: wie der Code kam (cloud-shell, obsidian) oder umzug; von: wer
// das Gerät hereinließ (VON: cloud-shell, die Kennung des Geräts, dessen Code es einlöste, oder gemeinsam: ein Code oder Umzug mit dem
// gemeinsamen Schlüssel); netz: grobes Netz beim Verbinden (verbinden.mjs ipNetz); name: was das Gerät von sich sagt (gesäubert,
// höchstens 40 Zeichen); zuletzt: höchstens stündlich nachgetragen; neu: noch keine Anfrage mit diesen Schlüsseln (die erste trägt es
// aus). Höchstens GERAETE.hoechstens Geräte; voll nimmt der Server keins mehr an und verdrängt nie eins.
// Umzug mit dem gemeinsamen Schlüssel (umziehen): Jede Anfrage trägt eine Kennung des Umzugs, die das Gerät vorher speichert; umzug ist
// ihr SHA-256. Fragt es noch einmal mit derselben (die Antwort ging verloren, der Schlüsselbund scheiterte), bekommt es dasselbe Gerät,
// statt dass ein weiteres entsteht. Neue Umzüge höchstens UMZUG.stunde je Stunde und UMZUG.hoechstens zu einem gemeinsamen Schlüssel
// (umzuege: wann; mit neuen gemeinsamen Schlüsseln leer): Wer nur den gemeinsamen Schlüssel hat, legt so nicht beliebig viele Geräte an,
// die ihn überleben. Ein umgezogenes Gerät, das seine Schlüssel nach UMZUG.verwaist noch nie benutzt hat, fällt weg (eine verlorene
// Antwort ohne zweiten Versuch).
// fuer: Fingerabdruck der gemeinsamen Schlüssel, zu denen die Geräte gehören. Passt er nicht mehr zu dienst.json („studium-server
// schluessel-erneuern“, neue Adresse), gilt keins der Geräte mehr: Nach dem Erneuern stehen sie, solange der Dienst die alten
// gemeinsamen Schlüssel noch kennt (zugang_alt, ALT_FRIST in dienst.mjs), nur noch unter alt (ohne Namen), damit er ihnen sagen kann,
// dass es neue gibt.
// Trennen (kaskade): Mit einem Gerät gehen die Geräte, die es hereinließ (von, auch über mehrere Stufen), außer dem fragenden und denen,
// die behalten werden sollen; trennt sich ein Gerät selbst oder heißt es „nur dieses“, geht nur es. Wer ein Gerät stiehlt und damit ein
// zweites verbindet, verliert so beide mit einem Trennen. Was sonst dazugehört (seine offenen Codes, die Verbindungen der Claude-App aus
// seinen Codes), räumt dienst.mjs weg (folgen). Über den Dienst (POST /v1/geraete) oder „studium-server geraet-trennen“; beides legt
// zuerst eine Marke web/getrennt/<id> an ({ fragt?, behalten?, nur? }; die Kommandozeile nur sie), die der Dienst vor der nächsten
// signierten Anfrage und beim Start anwendet. So schreibt nur er das Verzeichnis. Eine Marke löscht er erst, wenn der Stand ohne die
// Geräte in der Datei steht: Scheitert das Schreiben (volle Platte), gilt der Stand im Speicher, und die Marke bringt das Trennen nach
// einem Neustart wieder. Ein neues Gerät gilt erst, wenn es in der Datei steht (sonst kein Gerät und kein Schlüssel, der Code bleibt):
// So gibt es kein Gerät nur im Speicher, das die Kommandozeile nicht sähe.
//   node geraete.mjs liste                       die Geräte, ohne Schlüssel (studium-server geraete, als studium-web)
//   node geraete.mjs trennen <id> [--nur-dieses] Marke web/getrennt/<id> (studium-server geraet-trennen, als studium-web); nennt, was
//                                                mitgeht; Exit 1 ohne solches Gerät
//   node geraete.mjs gemeinsam-beenden           der gemeinsame Schlüssel gilt ab sofort nicht mehr (Marke web/gemeinsam-aus.json, wie
//                                                nach seiner Frist in dienst.mjs), seine offenen Codes auch nicht; nennt, was mit ihm
//                                                kam (studium-server gemeinsam-beenden, als studium-web); Exit 1 ohne ein Gerät mit
//                                                eigenen Schlüsseln (dann käme keins mehr hinein)
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { claudeAppVon, verbindungenLesen } from "./claude-app.mjs";
import { jsonLesen, schreibenAtomar } from "./dateien.mjs";
import { codesZurueckziehen, geraetName } from "./verbinden.mjs";

export const GERAETE = { hoechstens: 30, zuletzt: 3600e3 };
export const UMZUG = { stunde: 5, hoechstens: 10, verwaist: 7 * 864e5 };
export const GERAETE_DATEI = "geraete-schluessel.json", GETRENNT = "getrennt";
// Marke in web/: Der gemeinsame Schlüssel gilt nicht mehr (dienst.mjs schreibt sie nach seiner Frist, studium-server gemeinsam-beenden sofort)
export const GEMEINSAM_AUS = "gemeinsam-aus.json";
export const GERAET_ID = /^[A-Za-z0-9_-]{22}$/;
export const HERKUNFT_GERAET = ["cloud-shell", "obsidian", "umzug"];
export const VON = /^(?:cloud-shell|gemeinsam|[A-Za-z0-9_-]{22})$/;
const SCHLUESSEL = /^[A-Za-z0-9_-]{43}$/;
const NETZ = /^[0-9a-f.:]{3,45}\/\d{1,3}$/;
const BEHALTEN = /^[A-Za-z0-9_-]{1,64}$/; // Kennung eines Geräts oder einer Verbindung der Claude-App
export const UMZUG_KENNUNG = /^[A-Za-z0-9_-]{22,64}$/; // Kennung eines Umzugs (das Plugin nimmt 16 Zufallsbytes)
const umzugHash = (kennung) => createHash("sha256").update(`studium-autopilot/umzug/v1\n${kennung}`).digest("base64url");
const iso = (s) => (typeof s === "string" && s.length <= 40 && !Number.isNaN(Date.parse(s)) ? new Date(s).toISOString() : "");

// Fingerabdruck der gemeinsamen Schlüssel { zugang, schluessel } (gekürzter SHA-256; steht nur im Verzeichnis, das selbst Schlüssel hat)
const gerechnet = new Map(); // je Anfrage dieselben zwei (gemeinsame und alte): nicht jedes Mal neu
export function fingerabdruck(k) {
  const ein = `studium-autopilot/geraete/v1\n${k.zugang}\n${k.schluessel}`;
  if (!gerechnet.has(ein)) {
    if (gerechnet.size >= 8) gerechnet.clear();
    gerechnet.set(ein, createHash("sha256").update(ein).digest("base64url").slice(0, 22));
  }
  return gerechnet.get(ein);
}

// Wer ein Gerät hereinließ, wenn der Eintrag es nicht nennt (Einträge vor dieser Fassung): die Cloud Shell, sonst der gemeinsame Schlüssel
const vonVon = (von, herkunft) => (typeof von === "string" && VON.test(von) ? von : herkunft === "cloud-shell" ? "cloud-shell" : "gemeinsam");
// Eintrag aus der Datei → Gerät | null (Ungültiges fällt weg)
const nurSchluessel = (g) => (g && GERAET_ID.test(g.id) && SCHLUESSEL.test(g.zugang) && SCHLUESSEL.test(g.schluessel) ? { id: g.id, zugang: g.zugang, schluessel: g.schluessel } : null);
function geraetPruefen(g) {
  const k = nurSchluessel(g), seit = g && iso(g.seit);
  if (!k || !seit || !HERKUNFT_GERAET.includes(g.herkunft)) return null;
  const e = { ...k, seit, zuletzt: iso(g.zuletzt) || seit, herkunft: g.herkunft, von: vonVon(g.von, g.herkunft) };
  if (typeof g.netz === "string" && NETZ.test(g.netz)) e.netz = g.netz;
  const name = geraetName(g.name);
  if (name) e.name = name;
  if (g.herkunft === "umzug" && SCHLUESSEL.test(String(g.umzug || ""))) e.umzug = g.umzug;
  if (g.neu === true) e.neu = true;
  return e;
}

// Verzeichnis aus der Datei, geprüft → { fuer, geraete, alt }
function verzeichnisLesen(web) {
  let roh = null;
  try { roh = JSON.parse(readFileSync(join(web, GERAETE_DATEI), "utf8")); } catch (e) { roh = null; }
  const o = roh && typeof roh === "object" ? roh : {};
  const altRoh = o.alt && typeof o.alt === "object" ? o.alt : null;
  return {
    fuer: typeof o.fuer === "string" ? o.fuer : "",
    geraete: (Array.isArray(o.geraete) ? o.geraete : []).map(geraetPruefen).filter(Boolean).slice(0, GERAETE.hoechstens),
    umzuege: (Array.isArray(o.umzuege) ? o.umzuege : []).map(iso).filter(Boolean).slice(-UMZUG.hoechstens),
    alt: altRoh && typeof altRoh.fuer === "string" ? { fuer: altRoh.fuer, geraete: (Array.isArray(altRoh.geraete) ? altRoh.geraete : []).map(nurSchluessel).filter(Boolean) } : null,
  };
}
const markenLesen = (web) => { try { return readdirSync(join(web, GETRENNT)); } catch (e) { return []; } };
// Wie eine Marke trennt: { fragt (das fragende Gerät, bleibt immer), behalten (Kennungen von Geräten und Verbindungen der Claude-App),
// nur (nichts mitnehmen) }; eine leere oder unlesbare Marke (studium-server geraet-trennen ohne --nur-dieses) nimmt alles mit
export function trennenWie(o) {
  const x = o && typeof o === "object" ? o : {};
  return { fragt: typeof x.fragt === "string" && GERAET_ID.test(x.fragt) ? x.fragt : "", nur: x.nur === true,
    behalten: (Array.isArray(x.behalten) ? x.behalten : []).filter((k) => typeof k === "string" && BEHALTEN.test(k)).slice(0, 64) };
}
const markeWie = (web, n) => trennenWie(jsonLesen(join(web, GETRENNT, n), {}, 4096));
// Was mit dem Gerät id geht (geraete: Einträge mit von; o wie trennenWie) → { weg: [Kennung, zuerst id], folgen (auch Verbindungen der
// Claude-App aus seinen Codes) }
export function kaskade(geraete, id, o = {}) {
  const w = trennenWie(o), weg = [id];
  if (w.nur || id === w.fragt) return { weg, folgen: false };
  const bleibt = new Set([w.fragt, ...w.behalten].filter(Boolean));
  for (let i = 0; i < weg.length; i++) {
    for (const g of geraete) if (g.von === weg[i] && !weg.includes(g.id) && !bleibt.has(g.id)) weg.push(g.id);
  }
  return { weg, folgen: true };
}
// Ein Gerät, wie es Plugin und Status sehen (nie mit Schlüsseln); dieses: Kennung des fragenden Geräts
const ohneSchluessel = (g, dieses) => ({ id: g.id, ...(g.name ? { name: g.name } : {}), seit: g.seit, zuletzt: g.zuletzt, herkunft: g.herkunft,
  von: g.von, ...(g.netz ? { netz: g.netz } : {}), dieses: !!dieses && g.id === dieses });

// web: Ordner des Dienstes; jetzt: Uhr (Tests) → Verzeichnis im Speicher
export function geraeteVerzeichnis(web, { jetzt = () => new Date() } = {}) {
  const datei = join(web, GERAETE_DATEI), marken = join(web, GETRENNT);
  let d = verzeichnisLesen(web);
  let altGilt = [];
  // offen: Der Stand im Speicher steht noch nicht in der Datei (das letzte Schreiben scheiterte); bis dahin bleiben die Marken liegen
  let offen = false;
  // → true, wenn der Stand jetzt in der Datei steht
  const schreiben = () => {
    try {
      schreibenAtomar(datei, JSON.stringify({ schema: 1, fuer: d.fuer, geraete: d.geraete, umzuege: d.umzuege, ...(d.alt ? { alt: d.alt } : {}) }), 0o600);
      offen = false;
    } catch (e) { offen = true; }
    return !offen;
  };
  const markeSetzen = (id, wie) => {
    try {
      mkdirSync(marken, { recursive: true, mode: 0o700 });
      writeFileSync(join(marken, id), JSON.stringify(wie), { mode: 0o600 });
      return true;
    } catch (e) { return false; }
  };
  const markenWeg = (namen) => {
    for (const n of namen) { try { rmSync(join(marken, n), { force: true }); } catch (e) { /* kein Eintrag, den rm nimmt (ein Ordner): bleibt */ } }
  };
  const finden = (id) => d.geraete.find((g) => g.id === id) || null;
  const paarNeu = () => ({ id: randomBytes(16).toString("base64url"), zugang: randomBytes(32).toString("base64url"), schluessel: randomBytes(32).toString("base64url") });
  // id und was mit ihm geht aus dem Speicher → { weg, folgen, behalten } | null (kein solches Gerät)
  const nehmen = (id, wie) => {
    if (!finden(id)) return null;
    const k = kaskade(d.geraete, id, wie);
    d.geraete = d.geraete.filter((g) => !k.weg.includes(g.id));
    return { ...k, behalten: wie.behalten };
  };
  return {
    // Vor jeder signierten Anfrage und beim Start: gehört das Verzeichnis zu den gemeinsamen Schlüsseln konfig (sonst gilt kein Gerät
    // mehr; die unter alt, den Schlüsseln vor dem Erneuern, nur noch für „erneuert“)? Dazu die Marken zum Trennen → [{ weg, folgen,
    // behalten }] (was die Marken eben getrennt haben, für dienst.mjs folgen)
    abgleichen(konfig, alt) {
      const fuer = fingerabdruck(konfig), altFuer = alt ? fingerabdruck(alt) : "";
      let geaendert = false;
      if (d.fuer !== fuer) {
        const vorher = altFuer && d.fuer === altFuer ? { fuer: altFuer, geraete: d.geraete.map(nurSchluessel) } : d.alt;
        geaendert = !!d.fuer;
        d = { fuer, geraete: [], umzuege: [], alt: vorher && vorher.geraete.length ? vorher : null };
      }
      if (d.alt && d.alt.fuer !== altFuer) { d.alt = null; geaendert = true; }
      altGilt = d.alt ? d.alt.geraete : [];
      const namen = markenLesen(web), getrennt = [];
      for (const n of namen) {
        const r = nehmen(n, markeWie(web, n));
        if (r) { getrennt.push(r); geaendert = true; }
      }
      // umgezogen, aber nie benutzt (UMZUG.verwaist): weg, wie getrennt (was es hereinließ, gibt es nicht: es fragte nie)
      const t = jetzt().getTime();
      for (const g of d.geraete.filter((x) => x.herkunft === "umzug" && x.neu && t - Date.parse(x.seit) > UMZUG.verwaist)) {
        getrennt.push(nehmen(g.id, trennenWie({ nur: true })));
        geaendert = true;
      }
      // erst geschrieben, dann die Marken weg (auch die, deren Gerät schon fehlte); scheitert es, bleiben sie für den nächsten Versuch
      if ((geaendert || offen) && !schreiben()) return getrennt;
      markenWeg(namen);
      return getrennt;
    },
    // gültige Geräte (Kandidaten für signaturPruefen) und die unter den alten gemeinsamen Schlüsseln
    get geraete() { return d.geraete; },
    get alt() { return altGilt; },
    // neues Paar mit Kennung, noch nicht eingetragen
    neu: paarNeu,
    // Paar aus neu() eintragen (info: { herkunft, von, netz, name }) → { g } | { fehler: zu-viele-geraete | speichern (nicht in die Datei
    // geschrieben: dann gilt es auch nicht) }
    dazu(paar, info = {}) {
      if (d.geraete.length >= GERAETE.hoechstens) return { fehler: "zu-viele-geraete" };
      const t = jetzt().toISOString(), herkunft = HERKUNFT_GERAET.includes(info.herkunft) ? info.herkunft : "obsidian";
      const g = geraetPruefen({ ...paar, seit: t, zuletzt: t, herkunft, von: info.von, netz: info.netz, name: info.name, neu: true });
      d.geraete.push(g);
      if (schreiben()) return { g };
      d.geraete.pop();
      return { fehler: "speichern" };
    },
    // Umzug mit dem gemeinsamen Schlüssel (kennung: UMZUG_KENNUNG; info: { netz, name }): dasselbe Gerät für dieselbe Kennung, sonst ein
    // neues (umzug, von gemeinsam) → { g } | { fehler: zu-viele (mit wieder: höchstens UMZUG.stunde je Stunde) | zu-viele-umzuege
    // (UMZUG.hoechstens zu diesem gemeinsamen Schlüssel) | zu-viele-geraete | speichern }
    umziehen(kennung, info = {}) {
      const h = umzugHash(kennung);
      const da = d.geraete.find((g) => g.herkunft === "umzug" && g.umzug === h);
      if (da) return { g: da };
      const t = jetzt().getTime(), stunde = d.umzuege.filter((z) => t - Date.parse(z) < 3600e3);
      if (d.umzuege.length >= UMZUG.hoechstens) return { fehler: "zu-viele-umzuege" };
      if (stunde.length >= UMZUG.stunde) return { fehler: "zu-viele", wieder: new Date(Date.parse(stunde[stunde.length - UMZUG.stunde]) + 3600e3).toISOString() };
      if (d.geraete.length >= GERAETE.hoechstens) return { fehler: "zu-viele-geraete" };
      const seit = new Date(t).toISOString();
      const g = geraetPruefen({ ...paarNeu(), seit, zuletzt: seit, herkunft: "umzug", von: "gemeinsam", umzug: h, neu: true, netz: info.netz, name: info.name });
      d.geraete.push(g);
      d.umzuege.push(seit);
      if (schreiben()) return { g };
      d.geraete.pop();
      d.umzuege.pop();
      return { fehler: "speichern" };
    },
    finden,
    // Ein Gerät trennen (wie: { fragt, behalten, nur }, kaskade): erst die Marke (bringt es nach einem Neustart wieder, falls das
    // Verzeichnis nicht geschrieben wird), dann aus dem Speicher und in die Datei → { status: weg | unbekannt | speichern (weder Datei
    // noch Marke geschrieben: getrennt nur bis zum Neustart), weg, folgen, behalten }
    trennen(id, wie = {}) {
      const w = trennenWie(wie);
      if (!finden(id)) return { status: "unbekannt", weg: [], folgen: false, behalten: [] };
      const marke = markeSetzen(id, w);
      const r = nehmen(id, w);
      if (schreiben()) { markenWeg([id]); return { status: "weg", ...r }; }
      return { status: marke ? "weg" : "speichern", ...r };
    },
    // eine Anfrage dieses Geräts: zuletzt höchstens stündlich nachtragen, die erste gleich (neu fällt weg)
    benutzt(id) {
      const g = finden(id), t = jetzt().getTime();
      if (!g || (!g.neu && t - Date.parse(g.zuletzt) <= GERAETE.zuletzt)) return;
      g.zuletzt = new Date(t).toISOString();
      delete g.neu;
      schreiben();
    },
    // für Plugin und Status, nie mit Schlüsseln; dieses: Kennung des fragenden Geräts → [{ id, name?, seit, zuletzt, herkunft, von, netz?,
    // dieses }]
    liste: (dieses = "") => d.geraete.map((g) => ohneSchluessel(g, dieses)),
  };
}

// Für studium-server, nur lesend: die Geräte, wie der Dienst sie bei der nächsten Anfrage sähe (zu den gemeinsamen Schlüsseln aus
// konfig, ohne die schon getrennten samt dem, was mit ihnen geht) → [Gerät ohne Schlüssel]
export function geraeteLesen(web, konfig) {
  const d = verzeichnisLesen(web);
  if (!konfig || typeof konfig.zugang !== "string" || typeof konfig.schluessel !== "string" || d.fuer !== fingerabdruck(konfig)) return [];
  let geraete = d.geraete;
  for (const n of markenLesen(web)) {
    if (geraete.some((g) => g.id === n)) { const { weg } = kaskade(geraete, n, markeWie(web, n)); geraete = geraete.filter((g) => !weg.includes(g.id)); }
  }
  return geraete.map((g) => ohneSchluessel(g, ""));
}

// Woher ein Gerät kam, für die Kommandozeile (liste: alle Geräte, für die Namen)
const herkunftText = (g, liste) => {
  if (g.herkunft === "cloud-shell") return "Cloud Shell";
  if (g.herkunft === "umzug") return "Umzug vom gemeinsamen Schlüssel";
  if (!GERAET_ID.test(g.von)) return "Code eines Geräts mit dem gemeinsamen Schlüssel";
  const v = liste.find((x) => x.id === g.von);
  return v ? `Code von ${v.id}${v.name ? ` (${v.name})` : ""}` : `Code von ${g.von} (getrennt)`;
};

// node geraete.mjs liste | trennen <id> [--nur-dieses] | gemeinsam-beenden → Exit-Code; aus, fehler: Ausgabe je Zeile
export function befehl(web, konfig, [was, id, ...mehr] = [], aus = console.log, fehler = console.error) {
  const liste = geraeteLesen(web, konfig);
  const zeit = (s) => s.slice(0, 16).replace("T", " ") + " UTC";
  if (was === "liste") {
    if (!liste.length) aus("Noch kein Gerät mit eigenen Schlüsseln.");
    for (const g of liste) {
      aus(`${g.id}  ${g.name || "Gerät ohne Namen"}  seit ${zeit(g.seit)}, zuletzt ${zeit(g.zuletzt)} (${herkunftText(g, liste)}${g.netz ? `, Netz ${g.netz}` : ""})`);
    }
    return 0;
  }
  if (was === "trennen") {
    const nur = mehr.includes("--nur-dieses");
    if (!GERAET_ID.test(String(id || "")) || mehr.some((m) => m !== "--nur-dieses")) {
      fehler("Erwartet: die Kennung eines Geräts (22 Zeichen), siehe sudo studium-server geraete; dazu höchstens --nur-dieses");
      return 2;
    }
    if (!liste.some((g) => g.id === id)) { fehler("Kein Gerät mit dieser Kennung (sudo studium-server geraete)."); return 1; }
    try {
      mkdirSync(join(web, GETRENNT), { recursive: true, mode: 0o700 });
      writeFileSync(join(web, GETRENNT, id), nur ? JSON.stringify({ nur: true }) : "", { mode: 0o600 });
    } catch (e) { fehler(`Die Marke zum Trennen ließ sich nicht anlegen (${e.code || e.message}); ist der Speicher voll?`); return 1; }
    const { weg, folgen } = kaskade(liste, id, { nur });
    const ca = folgen ? verbindungenLesen(dirname(web)).verbindungen.filter((v) => weg.includes(v.von)) : [];
    aus("Getrennt. Ab seiner nächsten Anfrage nimmt dein Server dieses Gerät nicht mehr an; mit einem neuen Code verbindet es sich wieder.");
    if (weg.length > 1 || ca.length) {
      aus("Mit ihm getrennt, weil über einen Code von ihm verbunden (mit --nur-dieses wären sie geblieben):");
      for (const g of liste.filter((x) => weg.includes(x.id) && x.id !== id)) aus(`  ${g.id}  ${g.name || "Gerät ohne Namen"}`);
      for (const v of ca) aus(`  Claude-App: Verbindung ${v.id} seit ${zeit(v.seit)}`);
    }
    aus("Seine offenen Codes gelten nicht mehr.");
    return 0;
  }
  if (was === "gemeinsam-beenden") {
    if (!liste.length) {
      fehler("Noch kein Gerät hat eigene Schlüssel: Ohne den gemeinsamen käme keins mehr hinein. Neue Schlüssel für alle: sudo studium-server schluessel-erneuern");
      return 1;
    }
    try {
      if (!existsSync(join(web, GEMEINSAM_AUS))) writeFileSync(join(web, GEMEINSAM_AUS), JSON.stringify({ seit: new Date().toISOString() }), { mode: 0o600 });
    } catch (e) { fehler(`Die Marke ließ sich nicht anlegen (${e.code || e.message}); ist der Speicher voll?`); return 1; }
    codesZurueckziehen(web, ["gemeinsam"]);
    claudeAppVon(dirname(web), ["gemeinsam"]);
    aus("Der gemeinsame Schlüssel gilt ab jetzt nicht mehr, seine offenen Codes auch nicht. Geräte mit eigenen Schlüsseln bleiben verbunden;");
    aus("eins, das noch umziehen müsste, verbindet sich mit einem neuen Code.");
    const mit = liste.filter((g) => g.von === "gemeinsam");
    const ca = verbindungenLesen(dirname(web)).verbindungen.filter((v) => v.von === "gemeinsam");
    if (mit.length || ca.length) {
      aus("Mit dem gemeinsamen Schlüssel kamen (Umzug oder sein Code); was du nicht kennst, trennst du mit sudo studium-server geraet-trennen <id>");
      aus("bzw. in Obsidian unter Claude-App:");
      for (const g of mit) aus(`  ${g.id}  ${g.name || "Gerät ohne Namen"}  seit ${zeit(g.seit)} (${herkunftText(g, liste)}${g.netz ? `, Netz ${g.netz}` : ""})`);
      for (const v of ca) aus(`  Claude-App: Verbindung ${v.id} seit ${zeit(v.seit)}`);
    }
    return 0;
  }
  fehler("Aufruf: node geraete.mjs liste | trennen <id> [--nur-dieses] | gemeinsam-beenden");
  return 2;
}

// realpathSync: Node löst den Symlink /opt/studium-server/aktuell für import.meta.url auf, für argv[1] nicht.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  let konfig = null;
  try { konfig = JSON.parse(readFileSync(process.env.STUDIUM_SERVER_KONFIG || "/etc/studium-server/dienst.json", "utf8")); } catch (e) { konfig = null; }
  process.exitCode = befehl(join(process.env.STUDIUM_SERVER_DATEN || "/var/lib/studium-server", "web"), konfig, process.argv.slice(2));
}
