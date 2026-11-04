// Formung der Ergebnisse des Connectors, für jede Quelle gleich (mcp-werkzeuge.mjs, mcp-quelle-ordner.mjs, mcp-quelle-server.mjs):
// Texte säubern (sauber: keine aktiven Links, Bilder, Referenz-Definitionen oder HTML, fremde Adressen nur als Domain, unsichtbare
// und Richtungszeichen weg), Zeiten in Europe/Berlin mit Alter, Ergebnisse ohne leere Felder, Listen gekappt, zu lange Ergebnisse
// um ganze Einträge gekürzt.

export const DATUM = /^\d{4}-\d{2}-\d{2}$/;
export const TAGE = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
// Listen höchstens LISTE_MAX Einträge; ERGEBNIS_MAX Zeichen je Ergebnis (rund 18 000 Tokens; Claude Code nimmt standardmäßig
// höchstens 25 000), darüber fallen ganze Einträge weg (einpassen)
export const LISTE_MAX = 100, ERGEBNIS_MAX = 60000;

const UNSICHTBAR = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u00ad\u061c\u180e\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff\u{e0000}-\u{e007f}]/gu;
const UNI = /(^|\.)uni-tuebingen\.de$/i;

// Adresse für ein Ergebnis: https-Seiten der Uni ganz, sonst nur der Name des Rechners, andere Schemata gar nicht.
function adresse(url) {
  try {
    const u = new URL(/^www\./i.test(url) ? "https://" + url : url);
    if (!/^https?:$/.test(u.protocol) || !u.hostname) return "";
    return u.protocol === "https:" && UNI.test(u.hostname) && !u.username && !u.password ? u.href : u.hostname;
  } catch (e) {
    return "";
  }
}

// Benannte Entitäten, wie Obsidian sie zeigt („x&lt;nq>“ in einer Textfassung ist „x<nq>“); erst nach dem Säubern, und nur
// diese, damit daraus nie wieder ein Link oder eine Adresse wird
const ENTITAET = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function sauber(text, max = Infinity) {
  let s = String(text ?? "").normalize("NFC").replace(UNSICHTBAR, "");
  s = s.replace(/^[ \t]{0,3}\[[^\]\n]+\]:[ \t]*\S.*$/gm, "");
  s = s.replace(/!\[([^\]\n]*)\]\([^)\n]*\)/g, (_, alt) => (alt.trim() ? `[Bild: ${alt.trim()}]` : "[Bild]"));
  s = s.replace(/!\[\[([^\]\n]+)\]\]/g, (_, n) => `[Bild: ${n.split("|")[0]}]`);
  s = s.replace(/\[([^\]\n]+)\]\(\s*<?([^)\s>]*)>?[^)\n]*\)/g, (_, t, u) => {
    const a = adresse(u);
    return a ? `${t} (${a})` : t;
  });
  // Ein Tag beginnt mit einem Buchstaben: „0 < q < 1 und a > b“ in Folien bleibt stehen
  s = s.replace(/<!--[\s\S]*?-->|<\/?[A-Za-z][^>\n]*>/g, " ");
  s = s.replace(/\b(?:obsidian|javascript|vbscript):\S*|\bfile:\/\/\S*|\bdata:[a-z]+\/\S*/gi, "");
  s = s.replace(/\bhttps?:\/\/[^\s<>()\[\]"'`]+|\bwww\.[^\s<>()\[\]"'`]+/gi, (u) => adresse(u.replace(/[.,;:!?]+$/, "")));
  s = s.replace(/&([a-z]+);/gi, (ganz, n) => (Object.hasOwn(ENTITAET, n.toLowerCase()) ? ENTITAET[n.toLowerCase()] : ganz));
  s = s.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
  return s.length > max ? s.slice(0, max).replace(/\s+\S*$/, "") + " …" : s;
}

export const textFeld = (v, max = 300) => (v == null || v === "" ? null : sauber(Array.isArray(v) ? v.join(", ") : v, max));
export const liste = (v) => (Array.isArray(v) ? v : v == null || v === "" ? [] : [v]).map(String);
export const zahl = (v) => {
  const n = Number(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

const berlin = (d, optionen) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", ...optionen }).format(d);
export const heuteBerlin = (d) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin" }).format(d);
export const plusTage = (datum, n) => new Date(Date.parse(datum + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);
export const wochentag = (datum) => new Date(datum + "T00:00:00Z").getUTCDay();
export const nachDatum = (a, b) => (a.datum < b.datum ? -1 : a.datum > b.datum ? 1 : 0);

// Zeit als Ortszeit mit Alter, fertig zum Vorlesen: ein Modell rechnet UTC sonst leicht falsch um (Stand 01.11.2026 geprüft)
export const ortszeit = (d) => berlin(d, { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
export function alter(ms) {
  const minuten = Math.max(0, Math.round(ms / 60e3));
  if (minuten < 1) return "gerade eben";
  if (minuten < 60) return `vor ${minuten} ${minuten === 1 ? "Minute" : "Minuten"}`;
  const stunden = Math.round(minuten / 60);
  if (stunden < 48) return `vor ${stunden} ${stunden === 1 ? "Stunde" : "Stunden"}`;
  return `vor ${Math.round(stunden / 24)} Tagen`;
}
// „01.11.2026, 06:43 (vor 9 Stunden)“ bzw. „am 01.11. um 06:43“ (für Warnsätze)
export const wann = (iso, t) => `${ortszeit(new Date(iso))} (${alter(t - Date.parse(iso))})`;
export const tagUhr = (iso) => `am ${berlin(new Date(iso), { day: "2-digit", month: "2-digit" })} um ${berlin(new Date(iso), { hour: "2-digit", minute: "2-digit" })}`;

// Prüfungen: Zwischentest und Nachholtermin nach Titel bzw. Dateiname (wie im Plugin, modell.js pruefungVon)
export const ZWISCHENTEST = /zwischen-?test/i, NACHHOL = /nachhol/i;

// Eine Liste bis max Einträge; nur wenn mehr da sind, mit der Zahl der übrigen
export const gekappt = (eintraege, max = LISTE_MAX) => (eintraege.length <= max ? eintraege
  : { eintraege: eintraege.slice(0, max), weitere: eintraege.length - max });

// Ergebnis ohne leere Felder (null, "", leere Listen unterhalb der obersten Ebene) und ohne nein bei Merkmalen, die sonst fast immer
// nein sind: spart je Ergebnis 6 bis 22 % (die Anleitung sagt: fehlend heißt leer bzw. nein). Oberste Listen bleiben, auch leer, damit
// „keine Termine“ zu sehen ist.
const OHNE_NEIN = new Set(["erledigt", "ueberfaellig", "faellt_aus", "noch_nicht_in_obsidian"]);
export function kompakt(w, tiefe = 0) {
  if (Array.isArray(w)) return w.map((x) => kompakt(x, tiefe + 1));
  if (!w || typeof w !== "object") return w;
  const aus = {};
  for (const [k, v] of Object.entries(w)) {
    if (v == null || v === "" || (v === false && OHNE_NEIN.has(k)) || (tiefe > 0 && Array.isArray(v) && !v.length)) continue;
    aus[k] = kompakt(v, tiefe + 1);
  }
  return aus;
}

// Die längste Liste im Ergebnis (gemessen als JSON), ohne den Stand
function laengsteListe(w, beste = { liste: null, laenge: 0 }) {
  if (Array.isArray(w)) {
    const l = w.length ? JSON.stringify(w).length : 0;
    if (l > beste.laenge) Object.assign(beste, { liste: w, laenge: l });
    for (const x of w) laengsteListe(x, beste);
  } else if (w && typeof w === "object") {
    for (const [k, v] of Object.entries(w)) if (k !== "stand") laengsteListe(v, beste);
  }
  return beste.liste;
}
// JSON ohne Einrückung (15–20 % kürzer); über max fallen ganze Einträge vom Ende der längsten Liste weg, nie mitten im JSON
export function einpassen(ergebnis, max = ERGEBNIS_MAX) {
  let text = JSON.stringify(ergebnis), weg = 0;
  while (text.length > max) {
    const l = laengsteListe(ergebnis);
    if (!l) break;
    const n = Math.max(1, Math.ceil(l.length / 4));
    l.splice(-n, n);
    weg += n;
    text = JSON.stringify(ergebnis);
  }
  if (!weg) return text;
  ergebnis.gekuerzt = `${weg} ${weg === 1 ? "Eintrag" : "Einträge"} weggelassen, das Ergebnis war zu lang: frag enger, z. B. mit modul `
    + "oder einem kürzeren Zeitraum.";
  return JSON.stringify(ergebnis);
}
