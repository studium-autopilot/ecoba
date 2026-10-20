// Eingang v1: Ergebnisse eines Claude-Laufs auf dem eigenen Server, geprüft und vereinheitlicht, bevor das Plugin sie abholt.
// Claude liefert nur Inhalte mit einem stabilen Schlüssel je Termin (z. B. Quelle + laufende Nummer); die id leitet der Server
// daraus ab (nie das Modell). Die Regeln entsprechen termineNormal in zentral.js (docs/daten-v1.md, termine.json), damit das
// Plugin die Termine mit derselben Prüfung übernimmt (tests/server-eingang.test.js prüft das gegen zentral.js).
// Gleicher Schlüssel in einem späteren Lauf = Änderung desselben Termins.
import { createHash } from "node:crypto";

export const EINGANG_SCHEMA = 1;
export const KATEGORIEN = ["Semester", "Vorlesungsfrei", "Prüfung", "Frist", "Einführung", "Lehre", "Fachschaft", "Veranstaltung"];
// Nur Mails: Quellen, die das Plugin selbst holt (eba.QUELLEN, z. B. ilias-kalender), liefert der Server nicht. Übernähme er
// eine davon, müsste die Einrichtung genau diesen Schlüssel in quellen_extern setzen (ein Schreiber je Quelle).
export const QUELLEN = ["gmail", "uni-postfach"];
const STATUS = ["offiziell", "geschätzt"];
export const MODULCODE = /^[A-Z]{1,4}[0-9][0-9X]{2}[A-Z]?$/;
const GEFAEHRLICH = /<\s*\/?\s*[a-z!]|<%|%>|obsidian:\/\/|\[\[|\]\]|`|[\r\n]|javascript:/i;
const G = { titel: 120, ort: 120, info: 200, quelleText: 200, schluessel: 200, hinweis: 300, punkt: 300, aufgabe: 200, frage: 200,
  termine: 300, hinweise: 50, begleitnotizen: 50, punkte: 12, aufgaben: 12, fragen: 10, pfad: 240, todoDoppel: 50 };
// Kennung eines To-dos im Auszug aus dem Tresor (tresor.json, vom Plugin: „t-“ und eine Kurz-Prüfsumme aus Notiz und Zeile)
export const TODO_ID = /^t-[0-9a-z]{1,13}$/;

const istObjekt = (x) => !!x && typeof x === "object" && !Array.isArray(x);
export const datumOk = (d) => {
  if (typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d) || d < "2020-01-01" || d > "2040-12-31") return false;
  const t = new Date(d + "T00:00:00Z");
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
};
const tage = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 864e5);

// Wie „Säubern“ in docs/daten-v1.md: HTML, Templater, Links, Backticks, Steuer- und Richtungszeichen weg, Leerraum
// zusammenfassen. Zu lang danach: Fehler (nicht kürzen).
export function saeubern(v, max, pflicht) {
  if (v == null || v === "") return pflicht ? { fehler: "fehlt" } : { wert: "" };
  if (typeof v !== "string") return { fehler: "kein Text" };
  const s = v.replace(/<%[\s\S]*?%>/g, " ").replace(/<\/?[a-z!][^>]*>/gi, " ").replace(/obsidian:\/\/\S*/gi, " ").replace(/javascript:/gi, " ")
    .replace(/\[\[|\]\]|`/g, " ").replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, " ").replace(/\s+/g, " ").trim();
  if (!s) return pflicht ? { fehler: "leer" } : { wert: "" };
  if (s.length > max) return { fehler: "zu lang" };
  return { wert: s };
}

export const idAus = (schluessel) => "c-" + createHash("sha256").update(String(schluessel)).digest("hex").slice(0, 20);

// Ein Termin aus Claudes Ausgabe → { wert } im Format von termine.json oder { fehler }.
export function terminNormal(e, heute) {
  if (!istObjekt(e)) return { fehler: "kein Objekt" };
  const schluessel = saeubern(e.schluessel, G.schluessel, true);
  if (schluessel.fehler) return { fehler: "schluessel " + schluessel.fehler };
  if (typeof e.titel !== "string" || GEFAEHRLICH.test(e.titel) || /[\[\]<>{}|\\]/.test(e.titel)) return { fehler: "titel unzulässig" };
  const titel = saeubern(e.titel, G.titel, true);
  if (titel.fehler) return { fehler: "titel " + titel.fehler };
  if (!datumOk(e.datum)) return { fehler: "datum ungültig" };
  let bis = "";
  if (e.bis != null && e.bis !== "") {
    if (!datumOk(e.bis) || e.bis < e.datum || tage(e.datum, e.bis) > 400) return { fehler: "bis ungültig" };
    bis = e.bis === e.datum ? "" : e.bis;
  }
  let uhrzeit = "";
  if (e.uhrzeit != null && e.uhrzeit !== "") {
    const m = typeof e.uhrzeit === "string" && e.uhrzeit.match(/^([01]\d|2[0-3]):([0-5]\d)(?:\s*[–-]\s*([01]\d|2[0-3]):([0-5]\d))?$/);
    if (!m) return { fehler: "uhrzeit ungültig" };
    uhrzeit = `${m[1]}:${m[2]}` + (m[3] ? `–${m[3]}:${m[4]}` : "");
  }
  const ort = saeubern(e.ort, G.ort, false);
  if (ort.fehler) return { fehler: "ort " + ort.fehler };
  if (!KATEGORIEN.includes(e.kategorie)) return { fehler: "kategorie nicht erlaubt" };
  if (!STATUS.includes(e.status)) return { fehler: "status ungültig" };
  let code = "";
  if (e.code != null && e.code !== "") {
    if (typeof e.code !== "string" || !MODULCODE.test(e.code)) return { fehler: "code ungültig" };
    code = e.code;
  }
  const quelle = saeubern(e.quelle_text, G.quelleText, false);
  if (quelle.fehler) return { fehler: "quelle_text " + quelle.fehler };
  const info = saeubern(e.info, G.info, false);
  if (info.fehler) return { fehler: "info " + info.fehler };
  const wert = { id: idAus(schluessel.wert), schluessel: schluessel.wert, titel: titel.wert, datum: e.datum, bis, uhrzeit, ort: ort.wert,
    kategorie: e.kategorie, status: e.status, code, quelle_url: "", quelle_text: quelle.wert, info: info.wert, geprueft: heute };
  if (e.entfaellt === true) wert.entfaellt = true;
  return { wert };
}

function listeText(liste, max, anzahl, art, verworfen) {
  const aus = [];
  for (const roh of Array.isArray(liste) ? liste.slice(0, anzahl) : []) {
    const r = saeubern(istObjekt(roh) ? roh.text : roh, max, true);
    if (r.fehler) { verworfen.push({ art, grund: r.fehler }); continue; }
    const eintrag = { text: r.wert };
    if (istObjekt(roh) && Number.isInteger(roh.seite) && roh.seite > 0 && roh.seite < 10000) eintrag.seite = roh.seite;
    if (istObjekt(roh) && datumOk(roh.frist)) eintrag.frist = roh.frist;
    aus.push(eintrag);
  }
  return aus;
}

// Begleitnotiz: Pfad unter Unterlagen/ (keine Ausbrüche), dazu die drei Abschnitte wie in unterlagen.js.
function begleitnotizNormal(b, verworfen) {
  if (!istObjekt(b) || typeof b.datei !== "string") return { fehler: "datei fehlt" };
  const datei = b.datei.replace(/\\/g, "/").trim();
  if (!datei.startsWith("Unterlagen/") || datei.length > G.pfad || datei.split("/").some((t) => !t || t === "." || t === "..") ||
    /[\u0000-\u001f<>:"|?*]/.test(datei)) return { fehler: "datei unzulässig" };
  const wert = {
    datei,
    wichtigste: listeText(b.wichtigste, G.punkt, G.punkte, "begleitnotiz", verworfen),
    zu_tun: listeText(b.zu_tun, G.aufgabe, G.aufgaben, "begleitnotiz", verworfen).map(({ text, frist }) => (frist ? { text, frist } : { text })),
    fragen: listeText(b.fragen, G.frage, G.fragen, "begleitnotiz", verworfen).map(({ text }) => ({ text })),
  };
  if (!wert.wichtigste.length && !wert.zu_tun.length && !wert.fragen.length) return { fehler: "leer" };
  return { wert };
}

// Claudes Ausgabe eines Laufs → { eingang, verworfen }. Einzelne ungültige Einträge fallen weg, der Rest bleibt.
export function eingangNormal(roh, { jetzt = new Date(), lauf = "" } = {}) {
  const heute = jetzt.toISOString().slice(0, 10);
  const verworfen = [];
  if (!istObjekt(roh)) return { fehler: "Ausgabe ist kein Objekt" };
  const termine = [];
  const ids = new Set();
  for (const e of Array.isArray(roh.termine) ? roh.termine.slice(0, G.termine) : []) {
    const r = terminNormal(e, heute);
    if (r.fehler) { verworfen.push({ art: "termin", schluessel: istObjekt(e) ? String(e.schluessel || "").slice(0, 80) : "", grund: r.fehler }); continue; }
    if (ids.has(r.wert.id)) { verworfen.push({ art: "termin", schluessel: r.wert.schluessel.slice(0, 80), grund: "doppelter schluessel" }); continue; }
    ids.add(r.wert.id);
    termine.push(r.wert);
  }
  const begleitnotizen = [];
  for (const b of Array.isArray(roh.begleitnotizen) ? roh.begleitnotizen.slice(0, G.begleitnotizen) : []) {
    const r = begleitnotizNormal(b, verworfen);
    if (r.fehler) verworfen.push({ art: "begleitnotiz", grund: r.fehler });
    else begleitnotizen.push(r.wert);
  }
  const hinweise = [];
  for (const h of Array.isArray(roh.hinweise) ? roh.hinweise.slice(0, G.hinweise) : []) {
    const text = saeubern(istObjekt(h) ? h.text : h, G.hinweis, true);
    const quelle = saeubern(istObjekt(h) ? h.quelle : "", G.quelleText, false);
    if (text.fehler || quelle.fehler) { verworfen.push({ art: "hinweis", grund: text.fehler || quelle.fehler }); continue; }
    hinweise.push(quelle.wert ? { text: text.wert, quelle: quelle.wert } : { text: text.wert });
  }
  // Doppelte To-dos: Paare { behalten, weg } aus Kennungen des Auszugs; jedes To-do höchstens einmal als „weg“, nie beides
  const todo_doppel = [];
  const wegSchon = new Set(), behaltenSchon = new Set();
  for (const p of Array.isArray(roh.todo_doppel) ? roh.todo_doppel.slice(0, G.todoDoppel) : []) {
    const ok = istObjekt(p) && TODO_ID.test(String(p.behalten)) && TODO_ID.test(String(p.weg)) && p.behalten !== p.weg;
    if (!ok || wegSchon.has(p.weg) || wegSchon.has(p.behalten) || behaltenSchon.has(p.weg)) { verworfen.push({ art: "todo_doppel", grund: ok ? "Kette oder doppelt" : "Kennung" }); continue; }
    wegSchon.add(p.weg); behaltenSchon.add(p.behalten);
    todo_doppel.push({ behalten: p.behalten, weg: p.weg });
  }
  const quellen = (Array.isArray(roh.quellen) ? roh.quellen : []).filter((q) => QUELLEN.includes(q));
  return {
    eingang: { schema: EINGANG_SCHEMA, erstellt: jetzt.toISOString(), lauf: String(lauf).slice(0, 80), quellen: [...new Set(quellen)], termine, begleitnotizen, hinweise,
      todo_doppel },
    verworfen,
  };
}

// Vergleicht mit dem Bestand (id → Termin): Nur neue oder geänderte Termine gehen ins Eingang. `geprueft` zählt nicht als Änderung.
// Ein Termin, der schon vorbei ist (Ende vor dem Tag des Laufs), kommt nur als Änderung eines bekannten Termins durch (z. B. Absage).
export function nurNeueOderGeaenderte(eingang, bestand) {
  const heute = String(eingang.erstellt || "").slice(0, 10);
  const ohneZeit = (t) => JSON.stringify({ ...t, geprueft: "" });
  const termine = eingang.termine.filter((t) => (bestand[t.id] ? ohneZeit(bestand[t.id]) !== ohneZeit(t) : (t.bis || t.datum) >= heute));
  const neuerBestand = { ...bestand };
  for (const t of eingang.termine) if (bestand[t.id] || termine.includes(t)) neuerBestand[t.id] = t;
  return { eingang: { ...eingang, termine }, bestand: neuerBestand };
}

// Hinweise nur einmal: Claude liest dieselbe Mail manchmal zweimal (überlappende Gmail-Zeiträume, Sicherheitslauf). bisher:
// { Kurz-Hash des Texts ohne Groß-/Kleinschreibung, Leer- und Satzzeichen: Datum }, 60 Tage. → { hinweise, bisher }
const HINWEIS_TAGE = 60;
export const hinweisSchluessel = (text) => createHash("sha256").update(String(text).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()).digest("hex").slice(0, 16);
export function nurNeueHinweise(hinweise, bisher, jetzt = new Date()) {
  const grenze = new Date(jetzt.getTime() - HINWEIS_TAGE * 864e5).toISOString().slice(0, 10);
  const neuBisher = {};
  for (const [k, d] of Object.entries(bisher && typeof bisher === "object" ? bisher : {})) if (/^[0-9a-f]{16}$/.test(k) && String(d) >= grenze) neuBisher[k] = String(d).slice(0, 10);
  const heute = jetzt.toISOString().slice(0, 10);
  const neu = [];
  for (const h of hinweise) {
    const k = hinweisSchluessel(h.text);
    if (neuBisher[k]) continue;
    neuBisher[k] = heute;
    neu.push(h);
  }
  return { hinweise: neu, bisher: neuBisher };
}

export const istLeer = (e) => !e.termine.length && !e.begleitnotizen.length && !e.hinweise.length && !(e.todo_doppel || []).length;
