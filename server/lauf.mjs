#!/usr/bin/env node
// Claude-Lauf des eigenen Servers. Startet, wenn ein Anstoß da ist (systemd: studium-server-lauf.path; ANSTOESSE): neue Rohdaten
// (abrufen.py), Gmail-Zeit (Timer), Knopf (Obsidian oder studium-server jetzt) oder der tägliche Sicherheitslauf (abrufen.py ab
// 06:30 Uhr: Uni-Mails der letzten 24 Stunden noch einmal, dazu Gmail und Liegengebliebenes). Den Takt für Gmail stellst du in
// Obsidian ein (web/takt.json vom Dienst: 3-, 1- oder 0-mal am Tag). Läuft als studium mit der Gruppe studium-web (Einheit): Was der
// Web-Dienst (web/, unterlagen/) und der Abruf (abruf/) ablegen, liest und übernimmt er nur über dateien.mjs, nie über einen Link.
//   1. Anstöße und abruf/roh/ übernehmen, Arbeitsordner laeufe/<zeit>/ mit auftrag.md, roh/, bisher.json, stand.json, tresor.json,
//      Textfassungen von Unterlagen (unterlagen/, vom Dienst; bis zu 6, zusammen höchstens 200 000 Zeichen; auf Wunsch mit der PDF
//      daneben, die nach einem erfolgreichen Lauf gelöscht wird), Folien für Kapitellisten (kapitel/, vom Dienst; nur Module, nach
//      denen der Stand des Plugins fragt; bis zu 12, zusammen höchstens 150 000 Zeichen) mit den bisher gelieferten Listen
//      (kapitel-bisher.json) und dem Skill
//   2. claude -p mit engen Rechten: lesen nur im Arbeitsordner, schreiben nur ausgabe.json, kein Bash, kein Web, keine
//      Unteragenten; Gmail nur lesend und nur, wenn Gmail dran ist (feste Suchen, dazu ein Überblick über alle neuen Mails seit
//      der letzten Suche, aus dem Claude nur liest, was zum Studium gehört); nie der Uni-Zugang, die Schlüssel oder ~/.claude
//   3. ausgabe.json prüfen (eingang.mjs), nur Neues bzw. Geändertes nach eingang/, Bestand (termine.json, kapitel.json) und
//      Zustand nachziehen
//   4. Lauf-Ordner leeren bis auf Protokoll, Auftrag und Rechte (laufOrdnerLeeren): keine Mails, kein Auszug aus dem Tresor
// Schlägt der Lauf fehl, kommen die Rohdaten zurück nach abruf/roh/ (nichts geht verloren); ebenso nach einem Abbruch (Zeitgrenze von
// systemd, Neustart): beim Beenden und beim nächsten Start (verwaisteZurueck). Am Limit des Claude-Abos wartet der Server und
// versucht es von selbst wieder (LIMIT_WARTEN, dienst.mjs limitWiederholen). Den Verbrauch je Lauf schreibt protokoll.json, je Tag
// nutzung.json.
//   node lauf.mjs                 ein Lauf (vom Dienst gestartet)
//   node lauf.mjs --anstoss <grund>   nur den Anstoß schreiben (gmail: nur wenn der Takt es will | knopf)
import { spawn } from "node:child_process";
import { cpSync, existsSync, linkSync, mkdirSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { art, da, dateiLesen, istDatei, istOrdner, jsonLesen, nurDateienUndOrdner, schreibenAtomar } from "./dateien.mjs";
import { pdfAufraeumen } from "./dienst.mjs";
import { eingangNormal, gmailUeberblick, istLeer, nurNeueHinweise, nurNeueKapitel, nurNeueOderGeaenderte } from "./eingang.mjs";

const PAKET = dirname(fileURLToPath(import.meta.url));
const STUNDE = 36e5;
// Läuft Claude ohnehin und war Gmail länger her, wird Gmail mit durchsucht: bei dreimal am Tag nach 3 Stunden, bei einmal nach 20
export const GMAIL_NACH = { 3: 3 * STUNDE, 1: 20 * STUNDE };
// Gmail-Zeit (07:30, 13:30, 19:30): Anstoß nur, wenn die letzte Suche so lange her ist (der Sicherheitslauf um 06:30 ersetzt bei
// dreimal am Tag die Suche um 07:30, bei einmal am Tag alle drei)
export const GMAIL_ZEIT_NACH = { 3: 2 * STUNDE, 1: 20 * STUNDE };
const LAEUFE_BEHALTEN = 10;
// Begleitnotizen je Lauf: bis zu 6 Textfassungen, zusammen höchstens 200 000 Zeichen (Bytes, etwa Zeichen; eine größere allein),
// damit alles in Claudes Kontext passt und das Abo-Limit für Mails übrig bleibt; der Rest kommt gleich im nächsten Lauf
const UNTERLAGEN_JE_LAUF = 6;
const UNTERLAGEN_ZEICHEN = 200000;
// Auf Wunsch (Knopf „Zusammenfassen“ in Obsidian, unterlagen/opus/): ein eigener Lauf mit Opus vor dem gewöhnlichen, nur diese
// Unterlagen, ohne Mails; je Lauf höchstens 3, damit Opus jede gründlich liest
const UNTERLAGEN_OPUS_JE_LAUF = 3;
// Kapitellisten (Lernplan): Folien der Module ohne zentrale Liste im gewöhnlichen Lauf mit dem Modell des Servers (Gliederung
// lesen braucht kein Opus, und niemand hat darum gebeten), nur wenn neue da sind; je Lauf bis zu 12, zusammen höchstens
// 150 000 Zeichen (das Plugin schickt die ersten Seiten ganz, danach nur die erste Zeile jeder Seite)
const KAPITEL_JE_LAUF = 12;
const KAPITEL_ZEICHEN = 150000;
// Limit des Claude-Abos: Der Lauf legt alles zurück und merkt sich in zustand.json unter limit, wann der nächste Versuch dran ist;
// bis dahin startet kein Lauf (außer auf Knopfdruck), danach stößt ihn der Dienst an (dienst.mjs limitWiederholen). Wann das
// Limit endet, sagt Claude Code nur als Satz für Menschen; darum feste Abstände, mit jedem weiteren Treffer länger. Ein Versuch
// am Limit bricht gleich ab.
export const LIMIT_WARTEN = [30 * 60e3, 60 * 60e3, 2 * STUNDE];
// Verbrauch je Tag (nutzung.json, aus der JSON-Ausgabe von claude -p): so lange aufheben
const NUTZUNG_TAGE = 30;
// Öffentliche zentrale Termine (für alle EcoBA-Studierenden): kommen über das Plugin ohnehin, Claude liefert sie nicht doppelt.
export const ZENTRAL = "https://studium-autopilot.github.io/ecoba-daten/v1/termine.json";
// Gmail-Connector von claude.ai (Server von Google, Werkzeuge mcp__claude_ai_Gmail__*). Erlaubt sind nur die vier lesenden aus
// GMAIL_LESEND; im Modus dontAsk ist alles andere ohnehin verboten. Die Sperrliste ist die zweite Sicherung, falls eine Freigabe
// einmal zu weit gerät: alles, was sendet, Entwürfe liest oder schreibt, Filter, Labels oder Spam ändert oder löscht. Stand der
// Werkzeuge: Verzeichnis der Connectors auf claude.com (29 Werkzeuge, geprüft 01.11.2026), dazu ältere Namen (delete_draft,
// update_message_labels), die frühere Fassungen kannten. Google kann Werkzeuge ohne Ankündigung ergänzen.
const GMAIL_SCHREIBEND = ["create_draft", "update_draft", "delete_draft", "list_drafts", "send_message", "reply", "forward", "create_filter",
  "list_filters", "create_label", "update_label", "delete_label", "label_message", "label_thread", "unlabel_message", "unlabel_thread",
  "update_message_labels", "mark_message_spam", "mark_thread_spam", "unmark_message_spam", "unmark_thread_spam", "trash_message",
  "trash_thread", "untrash_message", "untrash_thread", "apply_sensitive_message_label", "apply_sensitive_thread_label"]
  .map((t) => "mcp__claude_ai_Gmail__" + t);
const GMAIL_LESEND = ["search_threads", "get_thread", "get_message", "list_labels"].map((t) => "mcp__claude_ai_Gmail__" + t);

// Lesen und Schreiben nie über einen Link (dateien.mjs): Unterlagen, Anstöße und Rohdaten legen andere Benutzer ab
const lesen = (datei, ersatz) => jsonLesen(datei, ersatz);
const schreiben = (datei, daten, modus) => schreibenAtomar(datei, JSON.stringify(daten, null, 2), modus);
// zustand.json und die Ergebnisse in eingang/ liest der Web-Dienst (Gruppe studium-web, vom Ordner geerbt): 0640. Alles andere, was
// der Lauf schreibt, bleibt 0600 (UMask 0077).
const FUER_DEN_DIENST = 0o640;
const zustandSchreiben = (verzeichnis, z) => schreiben(join(verzeichnis, "zustand.json"), z, FUER_DEN_DIENST);
// Rohdaten des Abrufs (eigener Benutzer, eigener Ordner)
const rohOrdner = (verzeichnis) => join(verzeichnis, "abruf", "roh");
const stempel = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
const abs = (p) => "/" + p.replace(/\\/g, "/").replace(/^\/+/, ""); // Claude-Rechte: //pfad = absoluter Pfad

// Anstöße: einer je Schreiber, jeder in seinem Ordner (keiner schreibt in den eines anderen): dieser Lauf, die Gmail-Zeit und
// studium-server jetzt (anstoss), der Web-Dienst (web/anstoss), der Abruf (abruf/anstoss). Gründe nach Vorrang: Hängt ein Lauf am
// Limit, startet nur der Knopf trotzdem; danach die Gründe mit Gmail (gmailDran).
export const ANSTOESSE = [["anstoss"], ["web", "anstoss"], ["abruf", "anstoss"]];
export const GRUENDE = ["knopf", "taeglich", "gmail", "wiederholung", "quellen", "unterlagen", "lernplan"];
export function anstossSchreiben(verzeichnis, grund, jetzt = new Date()) {
  schreiben(join(verzeichnis, "anstoss"), { zeit: jetzt.toISOString(), grund });
}
// Alle Anstöße nehmen (lesen und löschen; auch einen ungültigen, sonst startete der Lauf immer wieder) → { grund: der mit dem höchsten
// Vorrang, gruende: alle bekannten } oder null. Unbekannte Gründe fallen weg: Der Grund steht im Auftrag für Claude.
export function anstossNehmen(verzeichnis) {
  const gruende = new Set();
  for (const t of ANSTOESSE) {
    const datei = join(verzeichnis, ...t);
    if (!da(datei)) continue;
    const a = lesen(datei, null);
    // was sich nicht löschen lässt (ein Ordner mit fremdem Inhalt an der Stelle), zählt nicht; die anderen Anstöße gelten weiter
    try { rmSync(datei, { force: true, recursive: !istDatei(datei) }); } catch (e) { continue; }
    if (a && GRUENDE.includes(a.grund)) gruende.add(a.grund);
  }
  const liste = GRUENDE.filter((g) => gruende.has(g));
  return liste.length ? { grund: liste[0], gruende: liste } : null;
}
const anstossWartet = (verzeichnis) => ANSTOESSE.some((t) => da(join(verzeichnis, ...t)));

// Takt aus Obsidian (dienst.mjs schreibt web/takt.json); fehlt er, der Standard
export function taktLesen(verzeichnis) {
  const t = lesen(join(verzeichnis, "web", "takt.json"), {}) || {};
  return { uni_postfach: [15, 30, 60].includes(t.uni_postfach) ? t.uni_postfach : 15, gmail: [3, 1, 0].includes(t.gmail) ? t.gmail : 3 };
}

// Gmail ist dran bei Gmail-Zeit, Knopf und Sicherheitslauf, beim Versuch nach dem Limit, wenn einer davon am Limit hing, sonst
// wenn die letzte Suche länger her ist (GMAIL_NACH); bei Takt 0 nie.
const GMAIL_GRUENDE = ["gmail", "knopf", "taeglich"];
export function gmailDran(anstoss, zustand, jetzt, takt = 3) {
  if (!takt) return false;
  if (GMAIL_GRUENDE.includes(anstoss.grund)) return true;
  if (anstoss.grund === "wiederholung" && zustand.limit && zustand.limit.gmail === true) return true;
  const zuletzt = Date.parse(zustand.gmailZuletzt || "");
  return !Number.isFinite(zuletzt) || jetzt - zuletzt > GMAIL_NACH[takt];
}
export function gmailZeitDran(zustand, jetzt, takt = 3) {
  if (!takt) return false;
  const zuletzt = Date.parse(zustand.gmailZuletzt || "");
  return !Number.isFinite(zuletzt) || jetzt - zuletzt > GMAIL_ZEIT_NACH[takt];
}

// Zeitraum der Gmail-Suche seit der letzten erfolgreichen Suche: tage für die festen Suchen nach Uni-Mails (newer_than, ganze
// Tage, höchstens GMAIL_TAGE); seit für den Überblick über alle neuen Mails (after mit Sekunden, skill termine.md), eine Stunde
// früher, damit keine Mail zwischen zwei Suchen durchrutscht, und höchstens UEBERBLICK_TAGE zurück: Beim ersten Mal und nach
// einer Pause bliebe der Überblick sonst nicht in seinen Grenzen (200 Mails, 30 ganz gelesen), und was darüber hinausgeht,
// käme nie wieder dran; Uni-Mails holen die festen Suchen weiter zurück.
const GMAIL_TAGE = 14;
const UEBERBLICK_TAGE = 3;
const GMAIL_UEBERLAPPUNG = STUNDE;
export function gmailZeitraum(zustand, jetzt) {
  const frueheste = jetzt.getTime() - GMAIL_TAGE * 24 * STUNDE;
  const zuletzt = Math.min(Date.parse(zustand.gmailZuletzt || "") || frueheste, jetzt.getTime());
  return { tage: Math.min(GMAIL_TAGE, Math.max(1, Math.ceil((jetzt - zuletzt) / (24 * STUNDE)))),
    seit: new Date(Math.max(jetzt.getTime() - UEBERBLICK_TAGE * 24 * STUNDE, zuletzt - GMAIL_UEBERLAPPUNG)) };
}

export function rechte(arbeit, gmail) {
  const a = abs(arbeit);
  return {
    // wie CLAUDE_CODE_DISABLE_AUTO_MEMORY und CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING im Lauf (einLauf): kein Gedächtnis, keine Sicherungen
    autoMemoryEnabled: false,
    fileCheckpointingEnabled: false,
    permissions: {
      defaultMode: "dontAsk",
      // Glob und Grep ohne eigene Freigabe: im Arbeitsordner erlaubt, außerhalb verweigert; Schreiben regelt Edit(…), nur
      // ausgabe.json (beides am 18.10.2026 mit Claude Code im Modus dontAsk geprüft)
      allow: [`Read(/${a}/**)`, `Write(/${a}/ausgabe.json)`, `Edit(/${a}/ausgabe.json)`, ...(gmail ? GMAIL_LESEND : [])],
      deny: ["Bash", "Agent", "WebFetch", "WebSearch", "NotebookEdit", "Read(//etc/**)", "Read(//run/**)", "Read(//proc/**)",
        "Read(//var/lib/studium/.claude/**)", "Read(//var/lib/studium/.claude.json)", ...GMAIL_SCHREIBEND, ...(gmail ? [] : GMAIL_LESEND)],
    },
  };
}

export function auftragText({ jetzt, grund, gmail, gmailTage, gmailSeit, meldungen, unterlagen = 0, kapitel = 0, opus = false, taeglich = grund === "taeglich" }) {
  const berlin = (d, o) => d.toLocaleString("de-DE", { timeZone: "Europe/Berlin", ...o });
  const zeit = berlin(jetzt, { dateStyle: "full", timeStyle: "short" });
  // Überblick ab gmailSeit (gmailZeitraum); die Uhrzeit nur zum Lesen, mit MEZ/MESZ (eindeutig auch in der Stunde der Zeitumstellung)
  const seit = () => `after:${Math.floor(gmailSeit.getTime() / 1000)} (` +
    berlin(gmailSeit, { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit", timeZoneName: "short" }) + ")";
  return [
    "# Auftrag für diesen Lauf", "",
    `Jetzt: ${zeit} (Europe/Berlin). Anlass: ${grund}.`,
    `Gmail durchsuchen: ${gmail ? `ja, Zeitraum newer_than:${gmailTage}d; Überblick über alle neuen Mails ab ${seit()}` : "nein (nicht öffnen)"}.`,
    "Neue Rohdaten: " + (meldungen.length ? meldungen.join("; ") : "keine") + ".",
    `Neue Unterlagen für Begleitnotizen: ${unterlagen ? `${unterlagen} (Ordner unterlagen/)` : "keine"}.`,
    ...(opus ? [] : [`Neue Folien für Kapitellisten (Lernplan): ${kapitel ? `${kapitel} (Ordner kapitel/, bisherige Listen in kapitel-bisher.json)` : "keine"}.`]),
    ...(opus ? ["Dieser Lauf schreibt nur die Begleitnotizen zu den Unterlagen, die die Person ausgewählt hat. Sie wünscht sich besonders " +
      "gründliche Zusammenfassungen: lies jede Unterlage ganz, und nennt ihr Kopf eine PDF, die PDF (skill/begleitnotiz.md, „Mit PDF“)."] : []),
    ...(taeglich ? ["Täglicher Sicherheitslauf: Die Uni-Mails in roh/ sind die der letzten 24 Stunden, einige kennst du schon. " +
      "Liefere nur, was in bisher.json fehlt oder sich geändert hat."] : []), "",
    "Lies skill/SKILL.md, skill/termine.md und skill/ausgabe.md" + (unterlagen ? ", für die Unterlagen auch skill/begleitnotiz.md" : "") +
      (kapitel ? ", für die Kapitellisten auch skill/lernplan.md" : "") +
      ", arbeite danach und schreibe das Ergebnis nach ausgabe.json.",
    "",
  ].join("\n");
}

// Textfassungen für Begleitnotizen (der Dienst legt sie nach unterlagen/neu/): die ältesten im Rahmen der Grenzen in den
// Lauf-Ordner, eine PDF gleichen Namens (auf Wunsch, nur unterlagen/opus/) mit; scheitert der Lauf, zurück (unterlagenZurueck).
// → Namen der Textfassungen
// Nur echte Dateien (keine Links, die der Dienst an ihre Stelle gelegt haben könnte; dateien.mjs). Was nach dem Umbenennen im
// Lauf-Ordner keine echte Datei ist (ausgetauscht zwischen Prüfen und Umbenennen), fällt dort weg, wo nur der Lauf schreibt.
function unterlagenUebernehmen(von, nach, hoechstens = UNTERLAGEN_JE_LAUF, zeichen = UNTERLAGEN_ZEICHEN) {
  if (!istOrdner(von)) return [];
  const alle = readdirSync(von).filter((n) => /^[0-9a-f]{64}\.md$/.test(n)).map((n) => ({ n, s: art(join(von, n)) }))
    .filter((x) => x.s && x.s.isFile()).sort((a, b) => a.s.mtimeMs - b.s.mtimeMs || (a.n < b.n ? -1 : 1));
  const namen = [];
  let summe = 0;
  for (const { n, s } of alle) {
    if (namen.length >= hoechstens || (namen.length && summe + s.size > zeichen)) break;
    namen.push(n);
    summe += s.size;
  }
  if (namen.length) mkdirSync(nach, { recursive: true });
  const nehmen = (n) => {
    try { renameSync(join(von, n), join(nach, n)); } catch (e) { return false; }
    if (istDatei(join(nach, n))) return true;
    rmSync(join(nach, n), { recursive: true, force: true });
    return false;
  };
  const genommen = namen.filter(nehmen);
  for (const n of genommen) {
    const pdf = n.slice(0, -3) + ".pdf";
    if (istDatei(join(von, pdf))) nehmen(pdf);
  }
  return genommen;
}
// Folien für Kapitellisten von Modulen, nach denen der Stand nicht (mehr) fragt (inzwischen zentrale Liste, anderes Semester),
// kosten nur: weg, bevor ein Lauf startet. Modul steht in der Kopfzeile „Modul: <Code> · …“ (dienst.mjs kapitelAblegen). Was keine
// echte Datei ist (Ordner, Link: der Dienst schreibt hier), fällt ebenso weg; was sich nicht löschen lässt, bleibt liegen, statt den
// Lauf zu beenden (gelesen wird nur über dateiLesen, unterlagenUebernehmen nimmt nur echte Dateien).
function kapitelAussortieren(ordner, lernplan) {
  if (!istOrdner(ordner)) return;
  const gefragt = lernplan && Array.isArray(lernplan.module) ? lernplan.module : [];
  for (const n of readdirSync(ordner).filter((x) => x.endsWith(".md"))) {
    const p = join(ordner, n), s = art(p);
    const inhalt = s && s.isFile() ? dateiLesen(p, KAPITEL_ZEICHEN * 4) : null;
    const m = inhalt && /^Modul: (\S+) ·/m.exec(inhalt.toString("utf8").slice(0, 2000));
    if (m && gefragt.includes(m[1])) continue;
    try { rmSync(p, { force: true, recursive: !!s && s.isDirectory() }); } catch (e) { /* bleibt liegen */ }
  }
}
// Ordner, in den auch die Gruppe schreibt (roh/ für den Abruf, unterlagen/<art>/ für den Web-Dienst), mit UMask 0007 anlegen: So
// bekommt er 0770 und erbt setgid und Gruppe vom Ordner darüber. Nicht mit chmod: Ein Modus ohne setgid löschte das geerbte Bit, und
// setgid selbst setzen verbietet die Einheit des Laufs (RestrictSUIDSGID=yes, der Aufruf scheiterte mit EPERM).
function gruppenOrdner(pfad) {
  const alt = process.umask(0o007);
  try { mkdirSync(pfad, { recursive: true, mode: 0o770 }); } finally { process.umask(alt); }
}
// Unterlagen zurück, wenn der Lauf scheitert; was dort inzwischen liegt (eine neuere Fassung derselben Datei), bleibt
function unterlagenZurueck(arbeitU, neu) {
  if (!istOrdner(arbeitU)) return;
  if (!da(neu)) gruppenOrdner(neu);
  for (const n of readdirSync(arbeitU)) if (istDatei(join(arbeitU, n)) && !da(join(neu, n))) renameSync(join(arbeitU, n), join(neu, n));
}

// Rohdaten in den Lauf-Ordner: jede echte Datei einzeln umbenannt (abrufen.py schreibt jede fertig: Zwischendatei + Umbenennen), in
// Ordner, die der Lauf selbst anlegt. Die Ordner des Abrufs bleiben, wo sie sind: Übernähme der Lauf sie, könnte ein noch laufender
// Abruf darin weiter ablegen (Links, FIFOs), und einen Unterordner mit 0700 könnte der Lauf weder leeren noch zurückgeben (bis
// 0.7.6 hing danach jeder Lauf). Was sich nicht nehmen lässt, wartet auf den nächsten Lauf. Im Lauf-Ordner (nur der Lauf schreibt
// dort) fällt danach alles weg, was weder Datei noch Ordner ist: Claude liest roh/ ganz.
function rohUebernehmen(von, nach) {
  mkdirSync(nach, { recursive: true });
  const s = art(von);
  if (s && !s.isDirectory()) { try { rmSync(von, { force: true }); } catch (e) { /* bleibt */ } }
  if (s && s.isDirectory()) dateienUebernehmen(von, nach);
  nurDateienUndOrdner(nach);
}
function dateienUebernehmen(von, nach) {
  let eintraege = [];
  try { eintraege = readdirSync(von); } catch (e) { return; }
  for (const e of eintraege) {
    const q = join(von, e), z = join(nach, e), t = art(q);
    if (t && t.isDirectory()) { mkdirSync(z, { recursive: true }); dateienUebernehmen(q, z); }
    else if (t && t.isFile()) { try { renameSync(q, z); } catch (e2) { /* bleibt für den nächsten Lauf */ } }
  }
}

// Datei zurück, nur wenn dort nichts liegt: link + unlink scheitert, sobald es dort etwas gibt, auch wenn der Abruf es gerade erst
// geschrieben hat (Prüfen und Umbenennen ersetzte es dazwischen). Lässt das System den Link nicht zu, wie früher. → true, wenn zurück
function dateiZurueck(von, nach) {
  try {
    linkSync(von, nach);
  } catch (e) {
    if (e.code === "EEXIST" || da(nach)) return false;
    try { renameSync(von, nach); } catch (e2) { return false; }
    return true;
  }
  rmSync(von, { force: true });
  return true;
}
// Lauf gescheitert: Rohdaten zurück, auch in Ordner, die abrufen.py inzwischen neu angelegt hat. Vorhandenes bleibt; INDEX.md wird
// zusammengeführt (die Meldungen des gescheiterten Laufs zuerst). Nur echte Dateien und Ordner, nie durch einen Link: abrufen.py
// läuft als eigener Benutzer und kann in roh/ ablegen, was es will. Ordner legt der Lauf für die Gruppe an (gruppenOrdner), damit
// abrufen.py darin weiter ablegen kann, und Dateien wandern einzeln zurück (behalten Besitzer und Rechte vom Abruf); INDEX.md bekommt
// 0660. Liegt an der Stelle von roh/ etwas anderes, fällt es weg: Sonst gingen die Mails mit dem Lauf-Ordner verloren.
function rohZurueck(arbeitRoh, roh) {
  if (!istOrdner(arbeitRoh)) return;
  const ziel = art(roh);
  if (ziel && !ziel.isDirectory()) { try { rmSync(roh, { force: true }); } catch (e) { return; } }
  if (!ziel || !ziel.isDirectory()) gruppenOrdner(roh);
  for (const e of readdirSync(arbeitRoh)) {
    const von = join(arbeitRoh, e), nach = join(roh, e), quelle = art(von);
    if (!quelle || (!quelle.isFile() && !quelle.isDirectory())) continue;
    if (quelle.isDirectory()) {
      const dort = art(nach);
      if (!dort || dort.isDirectory()) rohZurueck(von, nach);
    } else if (!dateiZurueck(von, nach) && e === "INDEX.md" && istDatei(nach)) {
      const alt = dateiLesen(von), neu = dateiLesen(nach);
      if (alt && neu) schreibenAtomar(nach, alt.toString("utf8") + neu.toString("utf8").replace(/^# .*\n/, ""), 0o660);
    }
  }
}

// Nach dem Lauf bleibt im Lauf-Ordner nur, was der Code und die Fehlersuche brauchen: protokoll.json (studium-server lauf,
// verwaisteZurueck), auftrag.md (Anlass und Zahl der Mails, keine Inhalte), .rechte.json und .lauf.json, dazu ausgabe.json nur in
// der geprüften Fassung (geprueft: true; ungeprüft könnte sie enthalten, was Claude im Gmail-Überblick von anderen Mails sah,
// darum löscht ende sie nach einem Fehlschlag, und aus Läufen bis 0.7.6 geht sie hier weg). Alles andere geht weg: Mails und ihre PDF-Anhänge (roh/), der Auszug aus dem Tresor (tresor.json),
// Stand, Unterlagen, Folien, bisherige Termine und die Kopie des Skills. Nach einem Fehlschlag liegen Rohdaten und Unterlagen
// dann schon wieder in roh/ bzw. unterlagen/ (was dort schon lag, ist eine neuere Fassung derselben Datei).
const BLEIBT = ["protokoll.json", "auftrag.md", ".rechte.json", ".lauf.json"];
function laufOrdnerLeeren(arbeit) {
  if (!existsSync(arbeit)) return;
  const geprueft = (lesen(join(arbeit, "ausgabe.json"), null) || {}).geprueft === true;
  // je Eintrag: Was sich nicht löschen lässt, bleibt, statt den Lauf (und verwaisteZurueck bei jedem Start) zu beenden
  for (const n of readdirSync(arbeit)) {
    if (BLEIBT.includes(n) || (n === "ausgabe.json" && geprueft)) continue;
    try { rmSync(join(arbeit, n), { recursive: true, force: true }); } catch (e) { /* bleibt */ }
  }
}

// Abgebrochene Läufe (Lauf-Ordner ohne protokoll.json: systemd hat nach der Zeitgrenze beendet, Neustart, Absturz): Rohdaten und
// Unterlagen zurück wie bei einem Fehlschlag, „läuft“ aus dem Zustand. Kein neuer Anstoß (ein Lauf, der jedes Mal zu lange
// braucht, liefe sonst im Kreis); die Daten kommen mit dem nächsten. → Namen der Lauf-Ordner
export function verwaisteZurueck(verzeichnis, jetzt = new Date()) {
  const laeufe = join(verzeichnis, "laeufe");
  const verwaist = existsSync(laeufe) ? readdirSync(laeufe).filter((n) => !existsSync(join(laeufe, n, "protokoll.json"))) : [];
  for (const n of verwaist) {
    const arbeit = join(laeufe, n);
    const opus = (lesen(join(arbeit, ".lauf.json"), {}) || {}).opus === true;
    rohZurueck(join(arbeit, "roh"), rohOrdner(verzeichnis));
    unterlagenZurueck(join(arbeit, "unterlagen"), join(verzeichnis, "unterlagen", opus ? "opus" : "neu"));
    unterlagenZurueck(join(arbeit, "kapitel"), join(verzeichnis, "unterlagen", "kapitel"));
    laufOrdnerLeeren(arbeit);
    writeFileSync(join(arbeit, "protokoll.json"), JSON.stringify({ ok: false, code: "abgebrochen", opus }, null, 2));
  }
  if (verwaist.length) {
    const z = lesen(join(verzeichnis, "zustand.json"), {});
    delete z.laeuftSeit;
    z.fehler = [...new Set([...(z.fehler || []), "claude-lauf"])];
    z.letzterLauf = { zeit: jetzt.toISOString(), ok: false };
    zustandSchreiben(verzeichnis, z);
  }
  return verwaist;
}

const ausfuehren = (befehl, args, optionen) => new Promise((fertig) => {
  const p = spawn(befehl, args, { ...optionen, stdio: ["ignore", "pipe", "pipe"] });
  let aus = "";
  let err = "";
  p.stdout.on("data", (d) => { aus += d; });
  p.stderr.on("data", (d) => { err += d; });
  const uhr = setTimeout(() => p.kill("SIGTERM"), optionen.timeout || 45 * 60e3);
  p.on("close", (code) => { clearTimeout(uhr); fertig({ code, aus, err }); });
  p.on("error", (e) => { clearTimeout(uhr); fertig({ code: -1, aus, err: String(e) }); });
});

// Ein Lauf. claude: [befehl, ...args] (Tests geben eine Attrappe), skill: Ordner des Skills.
// Zentrale Termine kompakt (Titel, Datum, Kategorie); Fehler → leere Liste (der Lauf geht trotzdem).
export async function zentralHolen(holen = fetch) {
  try {
    const r = await holen(ZENTRAL, { signal: AbortSignal.timeout(20e3) });
    if (!r.ok) return [];
    const d = await r.json();
    return (Array.isArray(d.termine) ? d.termine : []).slice(0, 3000).map((t) => ({ titel: String(t.titel || "").slice(0, 120),
      datum: String(t.datum || "").slice(0, 10), bis: String(t.bis || "").slice(0, 10), kategorie: String(t.kategorie || "").slice(0, 20) }));
  } catch (e) {
    return [];
  }
}

const wartet = (ordner) => istOrdner(ordner) && readdirSync(ordner, { withFileTypes: true }).some((e) => e.isFile() && e.name.endsWith(".md"));

// Limit: n-ter Treffer in Folge → Wartezeit
export const limitWarten = (versuche) => LIMIT_WARTEN[Math.min(Math.max(1, versuche), LIMIT_WARTEN.length) - 1];
// Neuer Treffer: seit (erster Treffer), versuche, wieder (nächster Versuch), gmail (ein Anstoß mit Gmail hing am Limit)
export function limitNeu(alt, jetzt, gmail) {
  const versuche = (alt && Number.isInteger(alt.versuche) ? alt.versuche : 0) + 1;
  return { seit: alt && alt.seit ? alt.seit : jetzt.toISOString(), versuche, wieder: new Date(jetzt.getTime() + limitWarten(versuche)).toISOString(),
    gmail: gmail || (alt ? alt.gmail === true : false) };
}
const zustandAendern = (verzeichnis, fn) => {
  const z = lesen(join(verzeichnis, "zustand.json"), {}) || {};
  fn(z);
  zustandSchreiben(verzeichnis, z);
};

// Ein Anstoß: zuerst die gewünschten Zusammenfassungen mit Opus (falls welche warten), dann der gewöhnliche Lauf. → Ergebnis des
// gewöhnlichen Laufs, mit opus: Ergebnis des Opus-Laufs (hatte der gewöhnliche nichts zu tun, das Ergebnis des Opus-Laufs)
// Am Limit (zustand.limit, nächster Versuch noch nicht dran) startet nur der Knopf einen Lauf; Rohdaten und Unterlagen bleiben
// liegen. Hängt der Opus-Lauf am Limit, wartet auch der gewöhnliche (er hinge ebenso).
export async function laufen(o = {}) {
  const { verzeichnis } = o;
  const jetzt = o.jetzt || new Date();
  verwaisteZurueck(verzeichnis);
  const anstoss = anstossNehmen(verzeichnis);
  if (!anstoss) return { status: "kein-anstoss" };
  const limit = (lesen(join(verzeichnis, "zustand.json"), {}) || {}).limit;
  const gmailGrund = GMAIL_GRUENDE.includes(anstoss.grund);
  if (limit && Date.parse(limit.wieder) > jetzt.getTime() && anstoss.grund !== "knopf") {
    if (gmailGrund && limit.gmail !== true) zustandAendern(verzeichnis, (z) => { if (z.limit) z.limit.gmail = true; });
    return { status: "limit-wartet", wieder: limit.wieder };
  }
  const opus = wartet(join(verzeichnis, "unterlagen", "opus")) ? await einLauf({ ...o, jetzt, anstoss, opus: true }) : null;
  if (opus && opus.status === "claude-limit") {
    if (gmailGrund) zustandAendern(verzeichnis, (z) => { if (z.limit) z.limit.gmail = true; });
    return opus;
  }
  const r = await einLauf({ ...o, jetzt, anstoss, opus: false });
  // nichts mehr zu tun: auch kein Versuch nach dem Limit mehr nötig
  if (r.status === "nichts-zu-tun" && !opus && limit) zustandAendern(verzeichnis, (z) => { delete z.limit; });
  if (!opus) return r;
  return r.status === "nichts-zu-tun" ? opus : { ...r, opus };
}

// JSON-Ausgabe von claude -p (--output-format json: ein Objekt mit is_error, result, usage …) → Objekt oder null
export function ergebnisLesen(aus) {
  try {
    const o = JSON.parse(String(aus || "").trim());
    return o && typeof o === "object" && !Array.isArray(o) ? o : null;
  } catch (e) {
    return null;
  }
}
// Verbrauch daraus (usage, total_cost_usd: Listenpreis der API, beim Abo nur zum Vergleich) → Zahlen oder null
const zahl = (x) => (Number.isFinite(x) && x >= 0 ? x : 0);
export function nutzungLesen(o) {
  if (!o || !o.usage || typeof o.usage !== "object") return null;
  const u = o.usage;
  return { eingabe: zahl(u.input_tokens), ausgabe: zahl(u.output_tokens), cache_lesen: zahl(u.cache_read_input_tokens),
    cache_schreiben: zahl(u.cache_creation_input_tokens), runden: zahl(o.num_turns), dauer_ms: zahl(o.duration_ms),
    listenpreis_usd: Math.round(zahl(o.total_cost_usd) * 1e4) / 1e4 };
}
// Tag in Berlin (YYYY-MM-DD)
const tagBerlin = (d) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
// nutzung.json: je Tag Läufe, Läufe mit Opus, Treffer am Limit und die Token, dazu gmail_begrenzt (Gmail-Überblick an seiner
// Grenze, nur wenn es vorkam); NUTZUNG_TAGE lang (studium-server nutzung)
export function nutzungBuchen(verzeichnis, jetzt, { opus, limit, nutzung, begrenzt = false }) {
  const datei = join(verzeichnis, "nutzung.json");
  const alle = lesen(datei, {}) || {};
  const tag = tagBerlin(jetzt);
  const t = alle[tag] || { laeufe: 0, opus: 0, limit: 0, eingabe: 0, ausgabe: 0, cache_lesen: 0, cache_schreiben: 0 };
  t.laeufe++;
  if (opus) t.opus++;
  if (limit) t.limit++;
  if (begrenzt) t.gmail_begrenzt = (t.gmail_begrenzt || 0) + 1;
  if (nutzung) for (const k of ["eingabe", "ausgabe", "cache_lesen", "cache_schreiben"]) t[k] += nutzung[k];
  alle[tag] = t;
  const grenze = tagBerlin(new Date(jetzt.getTime() - NUTZUNG_TAGE * 24 * STUNDE));
  for (const k of Object.keys(alle)) if (k <= grenze) delete alle[k];
  schreiben(datei, alle);
}

async function einLauf({ verzeichnis, jetzt = new Date(), claude = ["claude"], skill = join(PAKET, "skill", "studium-autopilot"), modell, timeout, holen = fetch, anstoss, opus }) {
  const zustand = lesen(join(verzeichnis, "zustand.json"), {});
  const einstellungen = lesen(join(verzeichnis, "einstellungen.json"), {});
  const gmail = !opus && gmailDran(anstoss, zustand, jetzt, taktLesen(verzeichnis).gmail);
  const zeitraum = gmailZeitraum(zustand, jetzt);

  // eigener Ordner je Lauf, auch bei zwei Läufen in derselben Sekunde
  let name = stempel(jetzt);
  for (let i = 2; existsSync(join(verzeichnis, "laeufe", name)); i++) name = `${stempel(jetzt)}-${i}`;
  const arbeit = join(verzeichnis, "laeufe", name);
  mkdirSync(arbeit, { recursive: true });
  // für verwaisteZurueck: wohin die Unterlagen nach einem Abbruch zurückgehen
  writeFileSync(join(arbeit, ".lauf.json"), JSON.stringify({ opus }));
  if (opus) mkdirSync(join(arbeit, "roh"));
  else rohUebernehmen(rohOrdner(verzeichnis), join(arbeit, "roh"));
  const unterlagenNeu = join(verzeichnis, "unterlagen", opus ? "opus" : "neu");
  if (opus) pdfAufraeumen(unterlagenNeu, jetzt);
  const unterlagen = unterlagenUebernehmen(unterlagenNeu, join(arbeit, "unterlagen"), opus ? UNTERLAGEN_OPUS_JE_LAUF : UNTERLAGEN_JE_LAUF);
  // Stand des Plugins: stand.json (Modulcodes, Studienbeginn, Variante, lernplan) und tresor.json (was schon in Obsidian steht)
  const { tresor, ...stand } = lesen(join(verzeichnis, "web", "stand-plugin.json"), { schema: 1, module: [] });
  // Folien für Kapitellisten nur im gewöhnlichen Lauf und nur für Module, nach denen der Stand fragt
  const kapitelNeu = join(verzeichnis, "unterlagen", "kapitel");
  if (!opus) kapitelAussortieren(kapitelNeu, stand.lernplan);
  const kapitel = opus ? [] : unterlagenUebernehmen(kapitelNeu, join(arbeit, "kapitel"), KAPITEL_JE_LAUF, KAPITEL_ZEICHEN);
  const index = (dateiLesen(join(arbeit, "roh", "INDEX.md")) || "").toString("utf8");
  const meldungen = index.split("\n").filter((z) => z.startsWith("- ")).map((z) => z.replace(/^- [\d.]+ [\d:]+ UTC: /, "").trim());
  if (!gmail && !meldungen.length && !unterlagen.length && !kapitel.length) {
    // Rohdaten ohne Meldung (der Abruf brach zwischen Mail und INDEX.md ab) sind kein Grund für Claude, gehen aber zurück: Sie
    // kommen mit dem nächsten Lauf, statt mit dem Lauf-Ordner gelöscht zu werden
    const roh = join(arbeit, "roh");
    if (istOrdner(roh) && readdirSync(roh).length) rohZurueck(roh, rohOrdner(verzeichnis));
    rmSync(arbeit, { recursive: true, force: true });
    return { status: "nichts-zu-tun" };
  }
  // „läuft“ für den Status (Knopf „Mails durchsuchen“ zeigt es), am Ende wieder weg
  const vorher = lesen(join(verzeichnis, "zustand.json"), {});
  zustandSchreiben(verzeichnis, { ...vorher, laeuftSeit: jetzt.toISOString() });
  const bestand = lesen(join(verzeichnis, "termine.json"), {});
  writeFileSync(join(arbeit, "auftrag.md"), auftragText({ jetzt, grund: opus ? "Zusammenfassungen auf Wunsch" : anstoss.gruende.join(", "),
    taeglich: !opus && anstoss.gruende.includes("taeglich"), gmail, gmailTage: zeitraum.tage, gmailSeit: zeitraum.seit, meldungen,
    unterlagen: unterlagen.length, kapitel: kapitel.length, opus }));
  writeFileSync(join(arbeit, "bisher.json"), JSON.stringify(Object.values(bestand).map((t) => ({ schluessel: t.schluessel, titel: t.titel,
    datum: t.datum, bis: t.bis, uhrzeit: t.uhrzeit, ort: t.ort, kategorie: t.kategorie, status: t.status, code: t.code, entfaellt: t.entfaellt === true })), null, 1));
  // Kapitellisten, die Claude schon geliefert hat (kapitel.json), für die gefragten Module: Claude berichtigt sie, statt neu zu bauen.
  // Fehlt dem Server eine (neu eingerichtet, Datei verloren), gilt die aus der Lernplan-Notiz (Stand: lernplan.listen, nur Nummern,
  // Titel und Unterkapitel, herkunft: notiz); die eigene geht vor.
  const kapitelBestand = lesen(join(verzeichnis, "kapitel.json"), {});
  const { listen: notizListen, ...lernplanKurz } = stand.lernplan || {};
  if (kapitel.length) {
    const eigene = Object.values(kapitelBestand).filter((e) => e && e.semester === lernplanKurz.semester && lernplanKurz.module.includes(e.code));
    const ausNotiz = (Array.isArray(notizListen) ? notizListen : []).filter((x) => lernplanKurz.module.includes(x.code) && !eigene.some((e) => e.code === x.code))
      .map((x) => ({ code: x.code, semester: lernplanKurz.semester, herkunft: "notiz", kapitel: x.kapitel }));
    writeFileSync(join(arbeit, "kapitel-bisher.json"), JSON.stringify([...eigene, ...ausNotiz], null, 1));
  }
  writeFileSync(join(arbeit, "stand.json"), JSON.stringify(stand.lernplan ? { ...stand, lernplan: lernplanKurz } : stand));
  writeFileSync(join(arbeit, "tresor.json"), JSON.stringify(tresor || { termine: [], todos: [] }, null, 1));
  writeFileSync(join(arbeit, "zentral.json"), JSON.stringify(await zentralHolen(holen), null, 1));
  cpSync(skill, join(arbeit, "skill"), { recursive: true });
  const rechteDatei = join(arbeit, ".rechte.json");
  writeFileSync(rechteDatei, JSON.stringify(rechte(arbeit, gmail), null, 2));

  const prompt = "Du bist der Lauf von Studium Autopilot auf dem eigenen Server. Arbeitsordner: " + abs(arbeit) +
    ". Lies auftrag.md und folge ihm. Schreibe nur ausgabe.json.";
  const modellLauf = opus ? "opus" : modell || einstellungen.modell || "sonnet";
  const args = [...claude.slice(1), "-p", prompt, "--model", modellLauf, "--settings", rechteDatei,
    "--permission-mode", "dontAsk", "--tools", "Read,Write,Edit,Glob,Grep", "--output-format", "json",
    // kein Gesprächsprotokoll unter ~/.claude: Es enthielte, was Claude in Gmail gesehen hat (auch Betreffs privater Mails)
    "--no-session-persistence"];
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  // keine Nutzungs- und Fehlerberichte von Claude Code an Anthropic. Nicht CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: Es schaltete
  // auch die eingebauten Updates von Claude Code ab. Aktuell hält Claude Code außerdem täglich „claude update“ aus „studium-server
  // aktualisieren“ (claude_aktualisieren, nie während eines Laufs, ebenso ohne Berichte).
  env.DISABLE_TELEMETRY = "1";
  env.DISABLE_ERROR_REPORTING = "1";
  // Kein Gedächtnis über Läufe hinweg (auto memory unter ~/.claude/projects/<Ordner>/memory/: Claude schriebe dort sonst selbst
  // Notizen, auch zu Mails) und keine Sicherungen der Dateien, die Claude ändert (file-history/ für /rewind; ob Claude Code sie mit
  // -p und --no-session-persistence anlegt, sagt die Anleitung nicht, darum ausdrücklich aus). Dasselbe steht in .rechte.json.
  env.CLAUDE_CODE_DISABLE_AUTO_MEMORY = "1";
  env.CLAUDE_CODE_DISABLE_FILE_CHECKPOINTING = "1";
  // Ohne Gmail lädt Claude Code die Connectors von claude.ai gar nicht (auch keine anderen, die jemand in seinem Konto verbunden
  // hat). --strict-mcp-config ginge nicht: Es schaltet auch Gmail ab, wenn Gmail dran ist.
  if (!gmail) env.ENABLE_CLAUDEAI_MCP_SERVERS = "false";
  const r = await ausfuehren(claude[0], args, { cwd: arbeit, env, timeout });
  const ergebnis = ergebnisLesen(r.aus), nutzung = nutzungLesen(ergebnis);

  const neuerZustand = lesen(join(verzeichnis, "zustand.json"), {});
  const fehler = new Set((neuerZustand.fehler || []).filter((f) => !["claude-lauf", "claude-limit", "ausgabe-ungueltig"].includes(f)));
  const ende = (ok, code, mehr = {}) => {
    // am Limit: nächster Versuch später (limitNeu); jeder andere Ausgang beendet die Versuche (ein anderer Fehler liefe sonst im
    // Kreis)
    if (code === "claude-limit") neuerZustand.limit = limitNeu(neuerZustand.limit, jetzt, gmail);
    else delete neuerZustand.limit;
    // Claudes ausgabe.json bleibt nur in der geprüften Fassung (unten) im Lauf-Ordner: Ungeprüft könnte sie enthalten, was Claude
    // im Gmail-Überblick von anderen Mails sah
    if (!ok) {
      rmSync(join(arbeit, "ausgabe.json"), { force: true });
      fehler.add(code);
      rohZurueck(join(arbeit, "roh"), rohOrdner(verzeichnis));
      unterlagenZurueck(join(arbeit, "unterlagen"), unterlagenNeu);
      unterlagenZurueck(join(arbeit, "kapitel"), kapitelNeu);
    }
    laufOrdnerLeeren(arbeit);
    // warten noch Unterlagen, gleich der nächste Lauf (nur nach Erfolg, sonst liefe ein Fehler im Kreis)
    if (ok && ["neu", "opus", "kapitel"].some((u) => wartet(join(verzeichnis, "unterlagen", u))) && !anstossWartet(verzeichnis)) {
      anstossSchreiben(verzeichnis, "unterlagen", jetzt);
    }
    neuerZustand.fehler = [...fehler];
    neuerZustand.letzterLauf = { zeit: jetzt.toISOString(), ok };
    delete neuerZustand.laeuftSeit;
    zustandSchreiben(verzeichnis, neuerZustand);
    writeFileSync(join(arbeit, "protokoll.json"), JSON.stringify({ ok, code, exit: r.code, modell: modellLauf, gmail, unterlagen: unterlagen.length, kapitelFolien: kapitel.length,
      ...(nutzung ? { nutzung } : {}), ...mehr }, null, 2));
    nutzungBuchen(verzeichnis, jetzt, { opus, limit: code === "claude-limit", nutzung, begrenzt: !!(mehr.gmailUeberblick && mehr.gmailUeberblick.begrenzt) });
    aufraeumen(join(verzeichnis, "laeufe"));
    return { status: ok ? "ok" : code, ...(code === "claude-limit" ? { wieder: neuerZustand.limit.wieder } : {}), ...mehr };
  };
  // gescheitert: Code ungleich 0 oder is_error in der Ausgabe (Claude Code endet am Limit nicht immer mit einem Fehlercode)
  if (r.code !== 0 || (ergebnis && ergebnis.is_error === true)) return ende(false, /limit/i.test(r.aus + r.err) ? "claude-limit" : "claude-lauf");
  const ausgabe = lesen(join(arbeit, "ausgabe.json"), null);
  if (!ausgabe) return ende(false, "ausgabe-ungueltig");
  const { eingang, verworfen, fehler: formfehler } = eingangNormal(ausgabe, { jetzt, lauf: name });
  if (formfehler) return ende(false, "ausgabe-ungueltig");
  const { eingang: nurNeu, bestand: neuerBestand } = nurNeueOderGeaenderte(eingang, bestand);
  const { hinweise, bisher: hinweiseBisher } = nurNeueHinweise(nurNeu.hinweise, lesen(join(verzeichnis, "hinweise-bisher.json"), {}), jetzt);
  // Kapitellisten: nur gefragte Module, nur Neues oder Geändertes
  const k = nurNeueKapitel(eingang.kapitel, kapitelBestand, stand.lernplan);
  const neu = { ...nurNeu, hinweise, kapitel: k.kapitel };
  if (eingang.kapitel.length) schreiben(join(verzeichnis, "kapitel.json"), k.bestand);
  schreiben(join(verzeichnis, "termine.json"), neuerBestand);
  schreiben(join(verzeichnis, "hinweise-bisher.json"), hinweiseBisher);
  mkdirSync(join(verzeichnis, "eingang"), { recursive: true });
  if (!istLeer(neu)) schreiben(join(verzeichnis, "eingang", `${name}-lauf.json`), neu, FUER_DEN_DIENST);
  if (gmail && ["ok", "fehlt"].includes(ausgabe.gmail)) {
    neuerZustand.gmail = ausgabe.gmail;
    if (ausgabe.gmail === "ok") neuerZustand.gmailZuletzt = jetzt.toISOString();
  }
  if (["ok", "fehlt"].includes(ausgabe.weiterleitung)) neuerZustand.weiterleitung = ausgabe.weiterleitung;
  // Gmail-Überblick: nur die Zahlen, fürs Protokoll (wie viele Mails Claude sah und ganz las), nur wenn die Suche lief
  const ueberblick = gmail && ausgabe.gmail === "ok" ? gmailUeberblick(ausgabe) : null;
  schreiben(join(arbeit, "ausgabe.json"), { geprueft: true, ...eingang, verworfen,
    ...(["ok", "fehlt"].includes(ausgabe.gmail) ? { gmail: ausgabe.gmail } : {}), ...(ueberblick ? { gmail_ueberblick: ueberblick } : {}) });
  return ende(true, "ok", { termine: neu.termine.length, begleitnotizen: neu.begleitnotizen.length, hinweise: neu.hinweise.length, kapitel: neu.kapitel.length,
    verworfen: verworfen.length + k.verworfen.length, ...(ueberblick ? { gmailUeberblick: ueberblick } : {}) });
}

function aufraeumen(laeufe) {
  const alle = existsSync(laeufe) ? readdirSync(laeufe).sort() : [];
  for (const alt of alle.slice(0, Math.max(0, alle.length - LAEUFE_BEHALTEN))) rmSync(join(laeufe, alt), { recursive: true, force: true });
  // Fertige Läufe einer früheren Fassung (bis 0.7.6 blieb alles im Ordner, auch die Mails) leeren wie den eigenen
  for (const n of alle.slice(-LAEUFE_BEHALTEN)) {
    const protokoll = lesen(join(laeufe, n, "protokoll.json"), null);
    if (protokoll) laufOrdnerLeeren(join(laeufe, n));
  }
}

// realpathSync: Node löst den Symlink /opt/studium-server/aktuell für import.meta.url auf, für argv[1] nicht.
if (process.argv[1] && import.meta.url === pathToFileURL(realpathSync(process.argv[1])).href) {
  const verzeichnis = process.env.STUDIUM_SERVER_DATEN || "/var/lib/studium-server";
  const i = process.argv.indexOf("--anstoss");
  if (i >= 0) {
    const grund = process.argv[i + 1];
    if (!["gmail", "knopf"].includes(grund)) { console.error("--anstoss gmail | knopf"); process.exit(2); }
    if (grund === "gmail" && !gmailZeitDran(lesen(join(verzeichnis, "zustand.json"), {}), new Date(), taktLesen(verzeichnis).gmail)) {
      console.log("Gmail: laut Takt noch nicht dran");
    } else anstossSchreiben(verzeichnis, grund);
  } else {
    const claude = process.env.STUDIUM_CLAUDE || join(process.env.HOME || "/var/lib/studium", ".local", "bin", "claude");
    // systemd beendet nach TimeoutStartSec (oder beim Herunterfahren) mit SIGTERM: Rohdaten und Unterlagen gleich zurück
    process.on("SIGTERM", () => { verwaisteZurueck(verzeichnis); process.exit(143); });
    laufen({ verzeichnis, claude: [claude] }).then((r) => console.log("lauf:", JSON.stringify(r)));
  }
}
