// Privater Datenkanal zwischen dem eigenen Server und dem Plugin: AES-256-GCM über Web Crypto, damit das Plugin
// (Obsidian, auch iPhone/iPad) mit derselben API entschlüsselt. Ein Paket ist { schema, zweck, iv, daten } (base64url).
// Der Zweck („eingang“, „stand“, „unterlagen“, „kapitel“, „pdf“, „verbinden“, „verbinden-antwort“, „geraete“, „geraete-antwort“,
// „claude-app“, „claude-app-antwort“, „aktualisieren“) steckt als Zusatzdaten in der Verschlüsselung: Ein Paket für den einen Zweck lässt sich nicht als
// das andere ausgeben. Der Schlüssel (32 Byte) kennen nur Server und Plugin; er geht nie über den Kanal selbst.
// Dazu die Signatur jeder Anfrage (ab 0.7.8, unten): Der Zugangsschlüssel selbst geht dann nie mehr über das Netz.
import { createHash, createHmac, hkdfSync, timingSafeEqual, webcrypto } from "node:crypto";
import { appendFileSync, readFileSync, renameSync, writeFileSync } from "node:fs";

export const KANAL_SCHEMA = 1;
// verbinden-antwort: Antwort auf POST /v1/geraet (ab 0.7.8; die Anfrage hat verbinden, so geht keine als die andere durch); geraete und
// geraete-antwort: Anfrage und Antwort von POST /v1/geraete (Geräte mit eigenen Schlüsseln, geraete.mjs); ebenso claude-app und
// claude-app-antwort für POST /v1/claude-app (Connector); aktualisieren: Anfrage von POST /v1/aktualisieren („Server jetzt aktualisieren“)
const ZWECKE = new Set(["eingang", "stand", "unterlagen", "kapitel", "pdf", "verbinden", "verbinden-antwort", "geraete", "geraete-antwort", "claude-app",
  "claude-app-antwort", "aktualisieren"]);
const kodieren = new TextEncoder();
const dekodieren = new TextDecoder();
const b64 = (bytes) => Buffer.from(bytes).toString("base64url");
const unb64 = (text) => Buffer.from(String(text || ""), "base64url");
const zusatz = (zweck) => kodieren.encode(`studium-autopilot/kanal/v${KANAL_SCHEMA}/${zweck}`);

export function neuerSchluessel() {
  return b64(webcrypto.getRandomValues(new Uint8Array(32)));
}

async function schluesselLaden(schluessel) {
  const roh = unb64(schluessel);
  if (roh.length !== 32) throw new Error("Schlüssel muss 32 Byte lang sein");
  return webcrypto.subtle.importKey("raw", roh, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function zweckPruefen(zweck) {
  if (!ZWECKE.has(zweck)) throw new Error(`Unbekannter Zweck: ${zweck}`);
}

export async function verschluesseln(schluessel, zweck, objekt) {
  zweckPruefen(zweck);
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const klar = kodieren.encode(JSON.stringify(objekt));
  const geheim = await webcrypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: zusatz(zweck) }, await schluesselLaden(schluessel), klar);
  return { schema: KANAL_SCHEMA, zweck, iv: b64(iv), daten: b64(geheim) };
}

// Wirft bei falschem Schlüssel, falschem Zweck, verändertem Inhalt oder unbekanntem Schema.
export async function entschluesseln(schluessel, zweck, paket) {
  return JSON.parse(dekodieren.decode(await entschluesselnRoh(schluessel, zweck, paket)));
}

// Wie entschluesseln, aber ohne JSON: die Bytes selbst (Zweck „pdf“: die PDF, wie sie im Tresor liegt). → Buffer
export async function entschluesselnRoh(schluessel, zweck, paket) {
  zweckPruefen(zweck);
  if (!paket || paket.schema !== KANAL_SCHEMA) throw new Error("Unbekanntes Schema des Pakets");
  if (paket.zweck !== zweck) throw new Error("Paket für einen anderen Zweck");
  const iv = unb64(paket.iv);
  if (iv.length !== 12) throw new Error("IV muss 12 Byte lang sein");
  return Buffer.from(await webcrypto.subtle.decrypt({ name: "AES-GCM", iv, additionalData: zusatz(zweck) },
    await schluesselLaden(schluessel), unb64(paket.daten)));
}

// ---------- Signierte Anfragen (Plugin ab 0.7.8) ----------
// Statt „Authorization: Bearer <Zugangsschlüssel>“ (Plugins bis 0.7.7; wer eine Anfrage sieht, hätte den Schlüssel für immer)
// trägt jede Anfrage eine Signatur, die nur für diese eine Anfrage gilt:
//   Authorization: Studium-Signatur v=1,zeit=<Unix-Sekunden>,nonce=<16 Zufallsbytes>,inhalt=<SHA-256 des Körpers>,signatur=<HMAC>[,beweis=<HMAC>]
// (Werte base64url ohne „=“, genau in dieser Reihenfolge, ohne Leerzeichen). Signiert wird der Text
//   studium-autopilot/anfrage/v1, Methode, Pfad, zeit, nonce, inhalt (je eine Zeile, getrennt durch \n)
// mit HMAC-SHA256 unter HKDF-SHA256(Zugangsschlüssel, Salz leer, Info „studium-autopilot/anfrage/v1/zugang“). beweis ist derselbe
// Text unter HKDF-SHA256(Datenschlüssel, …/datenschluessel): Er zeigt, dass das Gerät auch den Datenschlüssel hat (POST /v1/anstoss
// verlangt ihn). zeit höchstens SIGNATUR.fenster neben der Uhr des Servers; jede nonce gilt einmal (NonceSpeicher). Den Körper
// prüft der Dienst nach dem Lesen gegen inhalt; so prüft er die Signatur, bevor er überhaupt etwas liest.
export const SIGNATUR = { fenster: 5 * 60e3, nonces: 20000 }; // je Schlüssel höchstens ein Zwanzigstel (NonceSpeicher)
const ANFRAGE = "studium-autopilot/anfrage/v1";
const KOPF = /^Studium-Signatur v=1,zeit=(\d{1,12}),nonce=([A-Za-z0-9_-]{22}),inhalt=([A-Za-z0-9_-]{43}),signatur=([A-Za-z0-9_-]{43})(?:,beweis=([A-Za-z0-9_-]{43}))?$/;
export const inhaltVon = (bytes) => createHash("sha256").update(bytes || "").digest("base64url");
export const INHALT_LEER = inhaltVon("");
export const anfrageText = (methode, pfad, zeit, nonce, inhalt) => [ANFRAGE, methode, pfad, zeit, nonce, inhalt].join("\n");
// art: „zugang“ (jede Anfrage) | „datenschluessel“ (beweis) → 32 Byte
export const signaturSchluessel = (schluessel, art) => Buffer.from(hkdfSync("sha256", unb64(schluessel), Buffer.alloc(0), `${ANFRAGE}/${art}`, 32));
const mac = (schluessel, text) => createHmac("sha256", schluessel).update(text, "utf8").digest();

// Kopf für eine Anfrage (Gegenstück zum Plugin; Tests und Werkzeuge). konfig: { zugang, schluessel }; mitBeweis: dazu beweis
export function signieren(konfig, methode, pfad, inhalt, { zeit, nonce, mitBeweis = false }) {
  const text = anfrageText(methode, pfad, String(zeit), nonce, inhalt);
  return `Studium-Signatur v=1,zeit=${zeit},nonce=${nonce},inhalt=${inhalt},signatur=${mac(signaturSchluessel(konfig.zugang, "zugang"), text).toString("base64url")}` +
    (mitBeweis ? `,beweis=${mac(signaturSchluessel(konfig.schluessel, "datenschluessel"), text).toString("base64url")}` : "");
}

// Signatur der Antwort auf eine signierte Anfrage (Kopf studium-signatur: v=1,mac=…): HMAC-SHA256 unter HKDF(Zugangsschlüssel ‖
// Datenschlüssel, „…/anfrage/v1/antwort“) über „studium-autopilot/antwort/v1“, die nonce der Anfrage, den Status und den SHA-256 des
// Körpers (je eine Zeile). So nimmt ein Gerät mit Riegel nur Antworten an, die von diesem Server zu genau dieser Anfrage kamen. Der
// Datenschlüssel gehört dazu, weil Plugins bis 0.7.7 den Zugangsschlüssel im Kopf schickten: Wer ihn so mitlas, kann trotzdem keine
// Antwort fälschen. konfig: { zugang, schluessel } → base64url
export const antwortText = (nonce, status, inhalt) => ["studium-autopilot/antwort/v1", nonce, String(status), inhalt].join("\n");
const antwortSchluessel = (konfig) => Buffer.from(hkdfSync("sha256", Buffer.concat([unb64(konfig.zugang), unb64(konfig.schluessel)]), Buffer.alloc(0), `${ANFRAGE}/antwort`, 32));
export const antwortMac = (konfig, nonce, status, body) => mac(antwortSchluessel(konfig), antwortText(nonce, status, inhaltVon(body))).toString("base64url");

// Zufallswerte schon gesehener Anfragen bis zum Ende ihres Fensters (nur gültig signierte kommen hinein), je Schlüssel (fach: die
// Kennung eines Geräts oder „gemeinsam“ für den Schlüssel aus dienst.json; signaturPruefen nimmt es aus dem passenden Paar) höchstens
// quote (sonst fällt der älteste dieses Schlüssels weg), zusammen höchstens max (sonst der älteste des Schlüssels mit den meisten,
// nachdem Abgelaufenes weg ist). Was so wegfällt, gälte sonst noch einmal; darum merkt sich der Speicher je Schlüssel das späteste Ende
// eines verdrängten Werts (verdraengt) und nimmt unter diesem Schlüssel keine Anfrage an, deren Fenster nicht danach endet. Verdrängen
// kann nur, wer mit dem Schlüssel signiert, und er sperrt so nur diesen einen aus: Wer ein Gerät hat, kann die anderen nicht
// aussperren, und kein mitgelesener Wert gilt ein zweites Mal (er gilt nur unter dem Schlüssel, mit dem er signiert ist).
// Bis zu dieser Fassung zählte der Speicher je Netz des Absenders und merkte sich ein Ende für alle (alleBis, aus einem älteren
// Protokoll noch geladen). datei: Protokoll, an das jeder Wert angehängt wird (eine Zeile „nonce bis fach“), damit nach einem Neustart
// des Dienstes keine Anfrage der letzten Minuten noch einmal gilt; hat es mehr als 2 × max Zeilen, schreibt der Speicher es neu mit dem,
// was noch gilt (dazu je Schlüssel eine Zeile „~ bis fach“). Scheitert das Schreiben, fehlt nur dieser Schutz über einen Neustart.
const NONCE_ZEILE = /^([A-Za-z0-9_-]{22}) (\d{1,15}) (\S{0,64})$/, VERDRAENGT_ZEILE = /^~ (\d{1,15})(?: (\S{1,64}))?$/;
const fachVon = (roh) => String(roh || "").replace(/\s/g, "_").slice(0, 64);
export class NonceSpeicher {
  constructor(max = SIGNATUR.nonces, { quote = Math.max(1, Math.floor(max / 20)), datei = "", jetztMs = Date.now() } = {}) {
    Object.assign(this, { max, quote, datei, werte: new Map(), je: new Map(), zeilen: 0, verdraengt: new Map(), alleBis: 0 });
    if (!datei) return;
    let text = "";
    try { text = readFileSync(datei, "utf8"); } catch (e) { return; }
    for (const z of text.split("\n")) {
      const v = VERDRAENGT_ZEILE.exec(z);
      if (v && v[2]) this.verdraengt.set(v[2], Math.max(this.verdraengt.get(v[2]) || 0, Number(v[1])));
      else if (v) this.alleBis = Math.max(this.alleBis, Number(v[1]));
      const m = NONCE_ZEILE.exec(z);
      if (!m) continue;
      this.zeilen++;
      if (Number(m[2]) >= jetztMs && !this.werte.has(m[1])) this.platz(m[3], jetztMs) && this.dazu(m[1], Number(m[2]), m[3]);
    }
  }
  dazu(nonce, bis, fach) {
    this.werte.set(nonce, { bis, fach });
    this.je.set(fach, (this.je.get(fach) || 0) + 1);
    return true;
  }
  weg(nonce) {
    const w = this.werte.get(nonce);
    this.werte.delete(nonce);
    const n = (this.je.get(w.fach) || 1) - 1;
    if (n) this.je.set(w.fach, n); else this.je.delete(w.fach);
  }
  // verdrängt (nicht abgelaufen): sein Fenster gilt danach unter diesem Schlüssel für niemanden mehr
  aeltesterWeg(fach) {
    for (const [k, w] of this.werte) {
      if (w.fach !== fach) continue;
      this.verdraengt.set(fach, Math.max(this.verdraengt.get(fach) || 0, w.bis));
      this.weg(k);
      return;
    }
  }
  // macht Platz für einen Wert unter fach → true
  platz(fach, jetztMs) {
    if (this.werte.size < this.max && (this.je.get(fach) || 0) < this.quote) return true;
    for (const [k, w] of this.werte) if (w.bis < jetztMs) this.weg(k);
    if ((this.je.get(fach) || 0) >= this.quote) this.aeltesterWeg(fach);
    else if (this.werte.size >= this.max) {
      let meiste = "", n = -1;
      for (const [k, c] of this.je) if (c > n) { meiste = k; n = c; }
      this.aeltesterWeg(meiste);
    }
    return true;
  }
  // Ende des Fensters, bis zu dem unter fach nichts mehr gilt (verdrängt), oder 0
  bisVon(fach) {
    return Math.max(this.alleBis, this.verdraengt.get(fach) || 0);
  }
  // → "ok" | "wiederholt"
  merken(nonce, bis, jetztMs, fachRoh = "") {
    const fach = fachVon(fachRoh);
    const alt = this.werte.get(nonce);
    if ((alt && alt.bis >= jetztMs) || bis <= this.bisVon(fach)) return "wiederholt";
    if (alt) this.weg(nonce);
    this.platz(fach, jetztMs);
    this.dazu(nonce, bis, fach);
    if (this.datei) {
      try {
        if (++this.zeilen > 2 * this.max) {
          for (const [k, w] of this.werte) if (w.bis < jetztMs) this.weg(k);
          for (const [k, b] of this.verdraengt) if (b < jetztMs) this.verdraengt.delete(k);
          const neu = `${this.datei}.neu`;
          writeFileSync(neu, (this.alleBis >= jetztMs ? `~ ${this.alleBis}\n` : "") + [...this.verdraengt].map(([k, b]) => `~ ${b} ${k}\n`).join("") +
            [...this.werte].map(([k, w]) => `${k} ${w.bis} ${w.fach}\n`).join(""), { mode: 0o600 });
          renameSync(neu, this.datei);
          this.zeilen = this.werte.size;
        } else appendFileSync(this.datei, `${nonce} ${bis} ${fach}\n`, { mode: 0o600 });
      } catch (e) { /* nur der Schutz über einen Neustart fehlt dann */ }
    }
    return "ok";
  }
}

// Signatur aus dem Kopf gegen die erwartete, als Text verglichen: base64url hat im letzten Zeichen zwei freie Bits, die Buffer.from
// überginge (sonst gälten vier Schreibweisen derselben Signatur)
const gleicheSignatur = (soll, ist) => timingSafeEqual(Buffer.from(soll.toString("base64url")), Buffer.from(ist));

// Prüft den Kopf einer signierten Anfrage. kandidaten: Schlüsselpaare { zugang, schluessel, … } (oder eins allein), unter denen die
// Signatur stimmen darf: der gemeinsame Schlüssel aus dienst.json und die Geräte mit eigenen Schlüsseln (geraete.mjs, höchstens 31). Die
// Signatur wird gegen jedes Paar gerechnet und jedes Mal in fester Zeit verglichen, erst danach einmal Zeit und Zufallswert. Das
// passende Paar (paar) gilt für die ganze Anfrage: Beweis, Pakete und Signatur der Antwort. nonces: NonceSpeicher. o: { fenster,
// fach (paar → Name des Schlüssels im NonceSpeicher; sonst paar.id), nein (paar → Fehler, wenn die Anfrage trotz gültiger Signatur
// abgelehnt wird, etwa ein Schlüssel nach seiner Frist; dann bleibt ihr Zufallswert ungemerkt: Was ohnehin abgewiesen wird, füllt den
// Speicher nicht) }. → { ok: true, nonce, inhalt, paar, beweis (true, wenn beweis da und richtig) } | { ok: false, fehler: zugang (Form
// falsch oder kein Paar passt) | uhr (dann mit nonce und paar: die Signatur stimmte) | wiederholt | was nein sagt (mit nonce und paar) }
export function signaturPruefen(kopf, kandidaten, methode, pfad, jetztMs, nonces, o = {}) {
  const { fenster = SIGNATUR.fenster, fach = (p) => p.id || "", nein = () => "" } = o;
  const m = KOPF.exec(String(kopf || ""));
  if (!m) return { ok: false, fehler: "zugang" };
  const [, zeit, nonce, inhalt, signatur, beweis] = m;
  const text = anfrageText(methode, pfad, zeit, nonce, inhalt);
  let paar = null;
  for (const k of [].concat(kandidaten || [])) {
    if (k && gleicheSignatur(mac(signaturSchluessel(k.zugang, "zugang"), text), signatur) && !paar) paar = k;
  }
  if (!paar) return { ok: false, fehler: "zugang" };
  const t = Number(zeit) * 1000;
  if (Math.abs(jetztMs - t) > fenster) return { ok: false, fehler: "uhr", nonce, paar };
  const abgelehnt = nein(paar);
  if (abgelehnt) return { ok: false, fehler: abgelehnt, nonce, paar };
  const gemerkt = nonces.merken(nonce, t + fenster, jetztMs, fach(paar));
  if (gemerkt !== "ok") return { ok: false, fehler: gemerkt };
  return { ok: true, nonce, inhalt, paar, beweis: !!beweis && gleicheSignatur(mac(signaturSchluessel(paar.schluessel, "datenschluessel"), text), beweis) };
}
