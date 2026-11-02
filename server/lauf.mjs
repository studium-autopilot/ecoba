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
//   3. ausgabe.json prüfen (eingang.mjs; Herkunft der Termine aus dem Kopf der Mails in roh/, mailsLesen), nur Neues bzw.
//      Geändertes nach eingang/, Bestand (termine.json, kapitel.json) und Zustand nachziehen
//   4. Lauf-Ordner leeren bis auf Protokoll, Auftrag und Rechte (laufOrdnerLeeren): keine Mails, kein Auszug aus dem Tresor
// Schlägt der Lauf fehl, kommen die Rohdaten zurück nach abruf/roh/ (nichts geht verloren); ebenso nach einem Abbruch (Zeitgrenze von
// systemd, Neustart): beim Beenden und beim nächsten Start (verwaisteZurueck). Welche Mails in einen Lauf kommen, entscheidet
// rohSichten: frische zuerst, dann Gruppen von Mails, mit denen ein Lauf scheiterte (halbiert, bis eine allein scheitert: dann
// Quarantäne), dann Mails mit nicht bestätigtem Absender in einem eigenen Lauf, aus dem alles nur „geschätzt“ kommt. Am Limit des Claude-Abos wartet der Server und
// versucht es von selbst wieder (LIMIT_WARTEN, dienst.mjs limitWiederholen). Den Verbrauch je Lauf schreibt protokoll.json, je Tag
// nutzung.json.
//   node lauf.mjs                 ein Lauf (vom Dienst gestartet)
//   node lauf.mjs --anstoss <grund>   nur den Anstoß schreiben (gmail: nur wenn der Takt es will | knopf)
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, linkSync, mkdirSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { art, da, dateiLesen, istDatei, istOrdner, jsonLesen, nurDateienUndOrdner, schreibenAtomar } from "./dateien.mjs";
import { pdfAufraeumen } from "./dienst.mjs";
import { datumOk, domainNormal, eingangNormal, gmailUeberblick, herkunftAnwenden, istLeer, KATEGORIEN, nurNeueHinweise, nurNeueKapitel, nurNeueOderGeaenderte, URTEILE,
  zentralTitel } from "./eingang.mjs";

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
// Gegen eine Flut von Anstößen und gegen Mails, an denen jeder Lauf scheitert:
// - laeufe: höchstens so viele Läufe am Tag (Berlin, gezählt in nutzung.json unter quellen) je Anlass, damit keiner die Läufe eines
//   anderen aufbraucht: mails (frische Mails aus dem Abruf, auch der Sicherheitslauf), mails_uni (Reserve nur für frische Mails aus
//   dem Topf der Uni, wenn mails aufgebraucht ist: 40 Mails von außen zu verschiedenen Zeiten halten so keine der Uni auf), pruefen (Mails nach einem Fehlschlag und
//   Mails nicht bestätigter Absender), gmail (Gmail durchsucht), unterlagen (Begleitnotizen, auch mit Opus, und Kapitellisten). Ein
//   Lauf zählt für jeden Anlass, den er erledigt; ein Lauf auf Knopfdruck nur als knopf, er hat eigene Grenzen (dienst.mjs, KNOPF)
//   und darf alles. Was über der Grenze seines Anlasses wartet, wartet bis kurz nach Mitternacht (zustand.tagesgrenze, dann stößt
//   der Dienst an); die anderen Anlässe laufen weiter. Ein gewöhnlicher Tag hat einige Läufe für neue Mails, drei für Gmail und
//   einen Sicherheitslauf.
// - allein: Scheitert ein Lauf so, dass der Inhalt seiner Mails schuld sein kann (inhaltKannSchuldSein), werden sie halbiert und
//   jede Hälfte für sich noch einmal versucht (Gruppen in mail-fehler.json), bis eine Mail allein scheitert; scheitert sie allein so
//   oft, kommt sie in Quarantäne (quarantaene/, im Status gezählt) statt noch einmal in einen Lauf. Eine Mail, die einen Lauf scheitern
//   lässt, zieht so keine andere mit hinein.
// - Gmail, Unterlagen und Folien („Extras“): Ein Lauf mit Mails und Extras, der scheitert, zählt nicht gegen seine Mails; sie laufen
//   gleich noch einmal ohne Extras. Unterlagen und Folien werden wie Mails je Datei gezählt (unterlagen-fehler.json, Kennung aus
//   ihrem Inhalt) und halbiert; eine, die allein GRENZEN.allein-mal scheitert, bleibt liegen und wird ausgelassen (im Status
//   gezählt), bis eine neue Fassung kommt. Gmail hat keine einzelne Mail zum Auslassen: Es zählt gescheiterte Läufe am Tag
//   (extra-fehler.json) und setzt nach extra Fehlschlägen bis zum nächsten Tag aus. Ein Extra mit Fehlschlag läuft allein, nie mit
//   Mails; der tägliche Sicherheitslauf nimmt es vor den Mails dran, so kommt es auch an Tagen mit vielen Mails an die Reihe.
// - quarantaene: Die Quarantäne bleibt, bis die Person sie wieder einreiht (Knopf in Obsidian, POST /v1/anstoss mit quarantaene:
//   erneut) oder root sie leert; nur über diesen Grenzen fallen die ältesten Mails weg, gezählt im Status (quarantaene_geloescht).
export const GRENZEN = { laeufe: { mails: 40, mails_uni: 10, pruefen: 30, gmail: 8, unterlagen: 30 }, allein: 2, extra: 2, quarantaene: { mails: 200, bytes: 500 * 1024 * 1024 } };
const EXTRAS = ["gmail", "unterlagen", "kapitel"];
const LEER = { namen: new Set(), verdacht: false, ausgelassen: 0, kennung: new Map() };
// Topf der Uni wie in abrufen.py (topf): Domain aus From unter uni-tuebingen.de, Urteil nicht „fehlgeschlagen“
const UNI = "uni-tuebingen.de";
const ausDerUni = (k) => !!k && (k.domain === UNI || String(k.domain).endsWith("." + UNI)) && k.urteil !== "fehlgeschlagen";
const EXTRA_FEHLER = "extra-fehler.json";
const ANLAESSE = [...Object.keys(GRENZEN.laeufe), "knopf"];
const MAIL_FEHLER = "mail-fehler.json";
const QUARANTAENE = "quarantaene";
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
// Vorrang, gruende: alle bekannten, quarantaene: true, wenn der Dienst oder studium-server die Quarantäne wieder einreihen will } oder
// null. Unbekannte Gründe fallen weg: Der Grund steht im Auftrag für Claude. Den Wunsch zur Quarantäne nimmt der Lauf nicht vom Abruf.
export function anstossNehmen(verzeichnis) {
  const gruende = new Set();
  let quarantaene = false;
  for (const t of ANSTOESSE) {
    const datei = join(verzeichnis, ...t);
    if (!da(datei)) continue;
    const a = lesen(datei, null);
    // was sich nicht löschen lässt (ein Ordner mit fremdem Inhalt an der Stelle), zählt nicht; die anderen Anstöße gelten weiter
    try { rmSync(datei, { force: true, recursive: !istDatei(datei) }); } catch (e) { continue; }
    if (a && GRUENDE.includes(a.grund)) gruende.add(a.grund);
    if (a && a.quarantaene === "erneut" && t[0] !== "abruf") quarantaene = true;
  }
  const liste = GRUENDE.filter((g) => gruende.has(g));
  return liste.length ? { grund: liste[0], gruende: liste, ...(quarantaene ? { quarantaene } : {}) } : null;
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
// nur: Namen, die dieser Lauf nehmen darf (unterlagenWahl)
function unterlagenUebernehmen(von, nach, hoechstens, zeichen, nur) {
  if (!istOrdner(von)) return [];
  const alle = readdirSync(von).filter((n) => /^[0-9a-f]{64}\.md$/.test(n) && nur.has(n)).map((n) => ({ n, s: art(join(von, n)) }))
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

// ---------- Fehlschläge je Mail und Quarantäne ----------
// Mails im Lauf-Ordner (roh/<Quelle>/<UIDVALIDITY>-<UID>.txt, bis zu dieser Fassung <UID>.txt) samt ihren Anhängen
// (<Name>-anhang-<n>.pdf) → [{ name, dateien }] (Pfade unter roh/), nach Namen geordnet. Der Name ist die Kennung einer Mail in
// mail-fehler.json und in der Quarantäne; mit UIDVALIDITY trifft er nach einer neuen Vergabe der UIDs keine andere Mail.
function mailsIn(roh) {
  const aus = [];
  for (const q of istOrdner(roh) ? readdirSync(roh).filter((n) => istOrdner(join(roh, n))) : []) {
    const namen = readdirSync(join(roh, q));
    for (const n of namen.filter((x) => x.endsWith(".txt") && istDatei(join(roh, q, x)))) {
      const stamm = n.slice(0, -4);
      aus.push({ name: `${q}/${n}`, dateien: [n, ...namen.filter((x) => x.startsWith(stamm + "-anhang-"))].map((x) => `${q}/${x}`) });
    }
  }
  return aus.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}
// mail-fehler.json: { "<Quelle>/<Name der Mail>": { n (gescheiterte Läufe), allein (davon allein), gruppe (mit welchen sie als Nächstes
// läuft), zeit } }. Einträge fallen nach FEHLER_TAGE weg, außer die Mail liegt in der Quarantäne. Einträge einer früheren Fassung
// ({ n, zeit }) laufen allein.
const FEHLER_TAGE = 30;
function mailFehlerLesen(verzeichnis, jetzt) {
  const grenze = jetzt.getTime() - FEHLER_TAGE * 864e5;
  const aus = {};
  for (const [k, e] of Object.entries(lesen(join(verzeichnis, MAIL_FEHLER), {}) || {})) {
    if (!e || !Number.isInteger(e.n) || !(Date.parse(e.zeit) >= grenze || istDatei(join(verzeichnis, QUARANTAENE, k)))) continue;
    aus[k] = { n: e.n, allein: Number.isInteger(e.allein) ? e.allein : 0, gruppe: typeof e.gruppe === "string" ? e.gruppe : "einzeln:" + k, zeit: e.zeit };
  }
  return aus;
}
// Dateien einer Mail aus dem Lauf-Ordner nach quarantaene/<Quelle>/
// Nie über eine Mail, die dort schon liegt. Ein Name <UIDVALIDITY>-<UID> gehört zu genau einer Mail: Liegt er dort schon, ist es
// dieselbe (etwa aus dem Sicherheitslauf), und die neue Kopie fällt samt Anhängen weg. Ein Name einer früheren Fassung (nur die UID)
// kann eine andere Mail sein: dann mit „~2“, „~3“ … hinter dem Namen, samt Anhängen.
function inQuarantaene(verzeichnis, roh, mail) {
  const [q, datei] = mail.name.split("/");
  const stamm = datei.slice(0, -4), o = join(verzeichnis, QUARANTAENE, q);
  if (/^\d+-\d+$/.test(stamm) && da(join(o, datei))) {
    for (const d of mail.dateien) rmSync(join(roh, d), { force: true });
    return;
  }
  let frei = stamm;
  for (let i = 2; da(join(o, frei + ".txt")); i++) frei = `${stamm}~${i}`;
  mkdirSync(o, { recursive: true });
  for (const d of mail.dateien) {
    const name = d.slice(q.length + 1);
    try { renameSync(join(roh, d), join(o, frei + name.slice(stamm.length))); } catch (e) { /* bleibt im Lauf-Ordner */ }
  }
}
const ZAEHLER = join(QUARANTAENE, ".zaehler.json");
// Quarantäne in ihren Grenzen (GRENZEN.quarantaene): darüber fallen die ältesten Mails samt Anhängen weg, gezählt in
// quarantaene/.zaehler.json (geloescht). → { mails, bytes, geloescht }
export function quarantaeneZaehlen(verzeichnis) {
  const o = join(verzeichnis, QUARANTAENE);
  const mails = mailsIn(o).map((m) => {
    const groesse = m.dateien.reduce((s, d) => s + ((art(join(o, d)) || {}).size || 0), 0);
    return { ...m, groesse, zeit: (art(join(o, m.dateien[0])) || {}).mtimeMs || 0 };
  }).sort((a, b) => a.zeit - b.zeit);
  let bytes = mails.reduce((s, m) => s + m.groesse, 0);
  const zaehler = lesen(join(verzeichnis, ZAEHLER), {}) || {};
  let geloescht = Number.isInteger(zaehler.geloescht) ? zaehler.geloescht : 0;
  while (mails.length > GRENZEN.quarantaene.mails || bytes > GRENZEN.quarantaene.bytes) {
    const m = mails.shift();
    for (const d of m.dateien) rmSync(join(o, d), { force: true });
    bytes -= m.groesse;
    geloescht++;
  }
  if (geloescht !== (zaehler.geloescht || 0)) schreiben(join(verzeichnis, ZAEHLER), { geloescht });
  return { mails: mails.length, bytes, geloescht };
}
// Quarantäne wieder einreihen (Anstoß mit quarantaene: erneut): alle Mails zurück nach abruf/roh/, jede in einer eigenen Gruppe mit
// einem Fehlschlag allein weniger als die Grenze, so läuft jede einmal allein; scheitert sie wieder, kommt sie zurück. → Zahl der Mails
function quarantaeneErneut(verzeichnis, jetzt) {
  const o = join(verzeichnis, QUARANTAENE);
  const mails = mailsIn(o);
  if (!mails.length) return 0;
  const fehler = mailFehlerLesen(verzeichnis, jetzt);
  for (const m of mails) {
    const e = fehler[m.name] || { n: GRENZEN.allein };
    fehler[m.name] = { n: e.n, allein: GRENZEN.allein - 1, gruppe: `erneut-${stempel(jetzt)}-${m.name}`, zeit: jetzt.toISOString() };
  }
  schreiben(join(verzeichnis, MAIL_FEHLER), fehler);
  for (const q of readdirSync(o).filter((n) => istOrdner(join(o, n)))) {
    rohZurueck(join(o, q), join(rohOrdner(verzeichnis), q));
    if (!readdirSync(join(o, q)).length) rmSync(join(o, q), { recursive: true, force: true });
  }
  return mails.length;
}
// Fehlschläge, an denen der Inhalt der Mails schuld sein kann: ungültige Ausgabe, oder Claude lief zu Ende und meldete einen Fehler
// (is_error), der nicht nach Anmeldung, Limit, Netz, Überlastung oder Zeitüberschreitung aussieht. Nie ein Abbruch (Zeitgrenze,
// Neustart, Signal), nie ein Lauf ohne Ergebnis, nie, solange Claude abgemeldet ist. Geprüft wird nur, was Claude Code selbst meldet
// (result des Ergebnisses, Fehlerausgabe), nie Text aus den Mails.
const NICHT_DER_INHALT = new RegExp(["login", "authenticat", "api key", "credit", "overloaded", "network", "connection", "fetch failed", "socket hang up",
  "ECONN", "ETIMEDOUT", "EAI_AGAIN", "ENOTFOUND", "EPIPE", "timed? ?out", "timeout", "aborted", "SIGTERM", "SIGKILL", "rate.?limit", "unavailable",
  "\\b(?:429|5\\d\\d)\\b"].join("|"), "i");
export const inhaltKannSchuldSein = (code, ergebnis, fehlertext, zustand) => (zustand || {}).claude !== "abgemeldet" &&
  (code === "ausgabe-ungueltig" || (code === "claude-lauf" && !!ergebnis && ergebnis.is_error === true &&
    !NICHT_DER_INHALT.test(String(ergebnis.result || "").slice(0, 2000) + " " + String(fehlertext || "").slice(-4000))));
// Gescheitert, und der Inhalt kann schuld sein: Mails des Lauf-Ordners halbieren (zwei neue Gruppen) oder, war es eine allein, ihren
// Zähler allein erhöhen; erreicht er GRENZEN.allein, kommt sie in Quarantäne statt zurück. → Zahl der Mails, die in Quarantäne kamen
function fehlschlagZaehlen(verzeichnis, roh, jetzt, lauf) {
  const fehler = mailFehlerLesen(verzeichnis, jetzt);
  const mails = mailsIn(roh);
  const haelfte = Math.ceil(mails.length / 2);
  let neu = 0;
  mails.forEach((m, i) => {
    const e = fehler[m.name] || { n: 0, allein: 0 };
    const allein = e.allein + (mails.length === 1 ? 1 : 0);
    fehler[m.name] = { n: e.n + 1, allein, gruppe: mails.length === 1 ? e.gruppe || "einzeln:" + m.name : `${lauf}-${i < haelfte ? "a" : "b"}`,
      zeit: jetzt.toISOString() };
    if (allein >= GRENZEN.allein) { inQuarantaene(verzeichnis, roh, m); neu++; }
  });
  schreiben(join(verzeichnis, MAIL_FEHLER), fehler);
  if (neu) quarantaeneZaehlen(verzeichnis);
  return neu;
}
// Erfolg: Zähler der Mails dieses Laufs weg
function fehlschlaegeLoeschen(verzeichnis, roh, jetzt) {
  const fehler = mailFehlerLesen(verzeichnis, jetzt), vorher = Object.keys(fehler).length;
  for (const m of mailsIn(roh)) delete fehler[m.name];
  if (Object.keys(fehler).length !== vorher || da(join(verzeichnis, MAIL_FEHLER))) schreiben(join(verzeichnis, MAIL_FEHLER), fehler);
}
// extra-fehler.json: { gmail: { n (gescheiterte Läufe heute), tag } } → gescheiterte Läufe mit Gmail heute (Berlin)
function gmailFehlerLesen(verzeichnis, jetzt) {
  const g = (lesen(join(verzeichnis, EXTRA_FEHLER), {}) || {}).gmail;
  return g && g.tag === tagBerlin(jetzt) && Number.isInteger(g.n) ? g.n : 0;
}
// nach einem Lauf mit Gmail: gescheitert (und der Inhalt kann schuld sein) → eins mehr, gelungen → zurück auf 0
function gmailFehlerBuchen(verzeichnis, jetzt, gescheitert) {
  schreiben(join(verzeichnis, EXTRA_FEHLER), gescheitert ? { gmail: { n: gmailFehlerLesen(verzeichnis, jetzt) + 1, tag: tagBerlin(jetzt) } } : {});
}

// unterlagen-fehler.json: { "<neu|opus|kapitel>/<SHA-256 des Inhalts>": { n, allein, gruppe, zeit } } wie mail-fehler.json, für
// Textfassungen (Begleitnotizen) und Folien (Kapitellisten). Die Kennung kommt aus dem Inhalt: Eine neue Fassung derselben Unterlage
// ist eine andere Datei und hat eine neue Chance. Einträge einer ausgelassenen (allein GRENZEN.allein-mal gescheitert) bleiben ein
// Jahr, die anderen FEHLER_TAGE.
const UNTERLAGEN_FEHLER = "unterlagen-fehler.json";
function unterlagenFehlerLesen(verzeichnis, jetzt) {
  const aus = {};
  for (const [k, e] of Object.entries(lesen(join(verzeichnis, UNTERLAGEN_FEHLER), {}) || {})) {
    if (!e || !Number.isInteger(e.n) || !Number.isInteger(e.allein) || typeof e.gruppe !== "string") continue;
    const tage = e.allein >= GRENZEN.allein ? 365 : FEHLER_TAGE;
    if (Date.parse(e.zeit) >= jetzt.getTime() - tage * 864e5) aus[k] = { n: e.n, allein: e.allein, gruppe: e.gruppe, zeit: e.zeit };
  }
  return aus;
}
// Welche Unterlagen eines Ordners (art: neu, opus, kapitel) darf der Lauf nehmen? Mit Gruppen aus Fehlschlägen nur die älteste Gruppe
// (verdacht), sonst alle ohne Eintrag; ausgelassene nie. → { namen (Set), verdacht, ausgelassen (Zahl), kennung (Name → Kennung) }
function unterlagenWahl(verzeichnis, ordner, art_, jetzt) {
  const fehler = unterlagenFehlerLesen(verzeichnis, jetzt);
  const dateien = istOrdner(ordner) ? readdirSync(ordner).filter((n) => /^[0-9a-f]{64}\.md$/.test(n) && istDatei(join(ordner, n))) : [];
  const kennung = new Map(dateien.map((n) => {
    const b = dateiLesen(join(ordner, n));
    return [n, `${art_}/${createHash("sha256").update(b || "").digest("hex")}`];
  }));
  const eintrag = (n) => fehler[kennung.get(n)];
  const gruppen = new Map();
  for (const n of dateien.filter((x) => eintrag(x) && eintrag(x).allein < GRENZEN.allein)) {
    const e = eintrag(n);
    if (!gruppen.has(e.gruppe)) gruppen.set(e.gruppe, { zeit: e.zeit, namen: [] });
    gruppen.get(e.gruppe).namen.push(n);
  }
  const aelteste = [...gruppen.values()].sort((a, b) => (a.zeit < b.zeit ? -1 : a.zeit > b.zeit ? 1 : 0))[0];
  return { namen: new Set(aelteste ? aelteste.namen : dateien.filter((n) => !eintrag(n))), verdacht: !!aelteste,
    ausgelassen: dateien.filter((n) => eintrag(n) && eintrag(n).allein >= GRENZEN.allein).length, kennung };
}
// Lauf mit diesen Unterlagen (Kennungen): gescheitert → halbiert bzw. allein gezählt wie Mails (fehlschlagZaehlen), gelungen → weg
function unterlagenBuchen(verzeichnis, kennungen, jetzt, lauf, gescheitert) {
  if (!kennungen.length) return;
  const fehler = unterlagenFehlerLesen(verzeichnis, jetzt);
  const sortiert = [...kennungen].sort(), haelfte = Math.ceil(sortiert.length / 2);
  sortiert.forEach((k, i) => {
    if (!gescheitert) { delete fehler[k]; return; }
    const e = fehler[k] || { n: 0, allein: 0, gruppe: "" };
    fehler[k] = { n: e.n + 1, allein: e.allein + (sortiert.length === 1 ? 1 : 0),
      gruppe: sortiert.length === 1 ? e.gruppe || "einzeln:" + k : `${lauf}-${k.split("/")[0]}-${i < haelfte ? "a" : "b"}`, zeit: jetzt.toISOString() };
  });
  schreiben(join(verzeichnis, UNTERLAGEN_FEHLER), fehler);
}
// Lauf mit Mails und Extras gescheitert: Die Mails laufen gleich noch einmal ohne Extras (eine Gruppe, ohne Zähler allein und ohne
// Halbieren), statt gegen sie zu zählen
function ohneExtrasNochmal(verzeichnis, roh, jetzt, lauf) {
  const fehler = mailFehlerLesen(verzeichnis, jetzt);
  for (const m of mailsIn(roh)) {
    const e = fehler[m.name] || { n: 0, allein: 0 };
    fehler[m.name] = { n: e.n, allein: e.allein, gruppe: `${lauf}-ohne-extras`, zeit: jetzt.toISOString() };
  }
  schreiben(join(verzeichnis, MAIL_FEHLER), fehler);
}

// Gleich nach dem Übernehmen: Welche Mails nimmt dieser Lauf? Mails, die allein schon GRENZEN.allein-mal scheiterten, gleich in
// Quarantäne (etwa im Sicherheitslauf wieder da). Dann in dieser Reihenfolge eine Art: frische Mails (art „frisch“, mit INDEX.md);
// sonst die älteste Gruppe aus mail-fehler.json („pruefen“); sonst die Mails mit Urteil „fehlgeschlagen“ („unbestaetigt“, eigener
// Lauf). Nur Arten, deren Anlass heute noch Läufe hat (erlaubt: frisch → mails, die anderen → pruefen); sind die Läufe für mails
// aufgebraucht, frische Mails aus dem Topf der Uni noch aus der Reserve mails_uni (uni: true). Alle anderen gehen zurück
// nach abruf/roh/ (über zurueck/ im Lauf-Ordner, das auch verwaisteZurueck zurücklegt) und kommen mit dem nächsten Lauf.
// → { art, mails (Zahl), unbestaetigt (ein Urteil „fehlgeschlagen“ darunter: alles nur geschätzt), quarantaene, gesperrt (Anlässe,
// deren Mails nur wegen der Grenze des Tages warten) }
// pause: diesmal keine Mails (der Sicherheitslauf nimmt ein Extra mit Fehlschlag zuerst); sie warten, ohne als gesperrt zu gelten
function rohSichten(verzeichnis, arbeit, jetzt, erlaubt, pause = false) {
  const roh = join(arbeit, "roh"), zurueck = join(arbeit, "zurueck");
  const fehler = mailFehlerLesen(verzeichnis, jetzt), kopf = mailsLesen(roh);
  const unbestaetigt = (m) => (kopf[m.name] || {}).urteil === "fehlgeschlagen";
  let quarantaene = 0;
  const frisch = [], gruppen = new Map(), ohneUrteil = [];
  for (const m of mailsIn(roh)) {
    const e = fehler[m.name];
    if (e && e.allein >= GRENZEN.allein) { inQuarantaene(verzeichnis, roh, m); quarantaene++; continue; }
    if (e) { if (!gruppen.has(e.gruppe)) gruppen.set(e.gruppe, { zeit: e.zeit, mails: [] }); gruppen.get(e.gruppe).mails.push(m); continue; }
    (unbestaetigt(m) ? ohneUrteil : frisch).push(m);
  }
  if (quarantaene) quarantaeneZaehlen(verzeichnis);
  const aelteste = [...gruppen].sort(([a, x], [b, y]) => (x.zeit < y.zeit ? -1 : x.zeit > y.zeit ? 1 : a < b ? -1 : a > b ? 1 : 0))[0];
  if (pause) { frisch.length = 0; gruppen.clear(); ohneUrteil.length = 0; }
  const frischUni = erlaubt.mails ? [] : erlaubt.mails_uni ? frisch.filter((m) => ausDerUni(kopf[m.name])) : [];
  const [art, nehmen] = frisch.length && erlaubt.mails ? ["frisch", frisch] : frischUni.length ? ["frisch", frischUni] : aelteste && erlaubt.pruefen
    ? ["pruefen", aelteste[1].mails] : ohneUrteil.length && erlaubt.pruefen ? ["unbestaetigt", ohneUrteil] : ["", []];
  const gesperrt = [...(frisch.length > frischUni.length && !erlaubt.mails ? ["mails"] : []), ...((aelteste || ohneUrteil.length) && !erlaubt.pruefen ? ["pruefen"] : [])];
  const behalten = new Set(nehmen.map((m) => m.name));
  const weg = mailsIn(roh).filter((m) => !behalten.has(m.name)).flatMap((m) => m.dateien)
    .concat(art !== "frisch" && istDatei(join(roh, "INDEX.md")) ? ["INDEX.md"] : []);
  for (const d of weg) {
    mkdirSync(dirname(join(zurueck, d)), { recursive: true });
    renameSync(join(roh, d), join(zurueck, d));
  }
  if (weg.length) {
    rohZurueck(zurueck, rohOrdner(verzeichnis));
    rmSync(zurueck, { recursive: true, force: true });
  }
  return { art, mails: nehmen.length, unbestaetigt: nehmen.some(unbestaetigt), quarantaene, gesperrt, ...(frischUni.length && art === "frisch" ? { uni: true } : {}) };
}
// Warten Mails in abruf/roh/ (zurückgelegt, weil dieser Lauf nur eine Art nahm), deren Anlass heute noch Läufe hat (erlaubt)?
function rohDran(verzeichnis, jetzt, erlaubt) {
  const roh = rohOrdner(verzeichnis), fehler = mailFehlerLesen(verzeichnis, jetzt), kopf = mailsLesen(roh);
  return mailsIn(roh).some((m) => (fehler[m.name] || (kopf[m.name] || {}).urteil === "fehlgeschlagen" ? erlaubt.pruefen
    : erlaubt.mails || (erlaubt.mails_uni && ausDerUni(kopf[m.name]))));
}

// Kopf der Mails im Lauf-Ordner (roh/<Quelle>/<Datei>.txt, abrufen.py mail_text): die Zeilen bis zur ersten Leerzeile kommen nur
// aus Kopfzeilen der Mail, je eine (ein Zeilenumbruch darin wird dort zum Leerzeichen), also nie aus ihrem Text. Daraus Domain des
// Absenders, Urteil (Authentifiziert) und Tag der Mail (Berlin) → { "<Quelle>/<Datei>": { domain, urteil, datum } }. Mails einer
// früheren Fassung ohne diese Zeilen: Domain leer, Urteil „unbekannt“.
export function mailsLesen(roh) {
  const aus = {};
  const ordner = istOrdner(roh) ? readdirSync(roh).filter((n) => istOrdner(join(roh, n))) : [];
  for (const q of ordner) {
    for (const n of readdirSync(join(roh, q)).filter((x) => x.endsWith(".txt"))) {
      const b = dateiLesen(join(roh, q, n));
      if (!b) continue;
      const kopf = Object.create(null);
      for (const z of b.toString("utf8").split("\n\n")[0].split("\n")) {
        const m = /^([A-Za-z-]+): (.*)$/.exec(z);
        if (m && !(m[1] in kopf)) kopf[m[1]] = m[2].trim();
      }
      const zeit = Date.parse(kopf.Datum || "");
      aus[`${q}/${n}`] = { domain: domainNormal(kopf["Absender-Domain"]), urteil: URTEILE.includes(kopf.Authentifiziert) ? kopf.Authentifiziert : "unbekannt",
        datum: Number.isFinite(zeit) ? tagBerlin(new Date(zeit)) : "" };
    }
  }
  return aus;
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
// Unterlagen zurück wie bei einem Fehlschlag, „läuft“ aus dem Zustand. Ein Abbruch zählt nie gegen die Mails (der nächtliche
// Neustart, eine Zeitgrenze im Netz). Kein neuer Anstoß (ein Lauf, der jedes Mal zu lange braucht, liefe sonst im Kreis); die Daten
// kommen mit dem nächsten. → Namen der Lauf-Ordner
export function verwaisteZurueck(verzeichnis, jetzt = new Date()) {
  const laeufe = join(verzeichnis, "laeufe");
  const verwaist = existsSync(laeufe) ? readdirSync(laeufe).filter((n) => !existsSync(join(laeufe, n, "protokoll.json"))) : [];
  for (const n of verwaist) {
    const arbeit = join(laeufe, n);
    const opus = (lesen(join(arbeit, ".lauf.json"), {}) || {}).opus === true;
    rohZurueck(join(arbeit, "roh"), rohOrdner(verzeichnis));
    rohZurueck(join(arbeit, "zurueck"), rohOrdner(verzeichnis));
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
  p.on("close", (code, signal) => { clearTimeout(uhr); fertig({ code, signal, aus, err }); });
  p.on("error", (e) => { clearTimeout(uhr); fertig({ code: -1, aus, err: String(e) }); });
});

// Zentrale Termine kompakt (Titel, Datum, Kategorie); Fehler → leere Liste (der Lauf geht trotzdem). Jeder Titel geprüft wie im
// Plugin (zentralTitel: kein HTML, keine Klammern, gesäubert, nichts, was wie eine Anweisung aussieht), das Datum gültig; was nicht
// passt, fällt einzeln weg. Claude liest zentral.json als Daten (Skill).
export async function zentralHolen(holen = fetch) {
  try {
    const r = await holen(ZENTRAL, { signal: AbortSignal.timeout(20e3) });
    if (!r.ok) return [];
    const d = await r.json();
    return (Array.isArray(d.termine) ? d.termine : []).slice(0, 3000).map((t) => {
      const titel = zentralTitel(t && t.titel);
      if (titel.fehler || !datumOk(t.datum)) return null;
      return { titel: titel.wert, datum: t.datum, bis: datumOk(t.bis) ? t.bis : "", kategorie: KATEGORIEN.includes(t.kategorie) ? t.kategorie : "" };
    }).filter(Boolean);
  } catch (e) {
    return [];
  }
}

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
// liegen. Hängt der Opus-Lauf am Limit, wartet auch der gewöhnliche (er hinge ebenso). Grenzen je Anlass (GRENZEN.laeufe,
// erlaubtHeute): Was nur deshalb wartet, steht in zustand.tagesgrenze (quellen), und der Dienst stößt kurz nach Mitternacht an.
export async function laufen(o = {}) {
  const { verzeichnis } = o;
  const jetzt = o.jetzt || new Date();
  verwaisteZurueck(verzeichnis);
  const anstoss = anstossNehmen(verzeichnis);
  if (!anstoss) return { status: "kein-anstoss" };
  if (anstoss.quarantaene) quarantaeneErneut(verzeichnis, jetzt);
  const limit = (lesen(join(verzeichnis, "zustand.json"), {}) || {}).limit;
  const gmailGrund = GMAIL_GRUENDE.includes(anstoss.grund);
  if (limit && Date.parse(limit.wieder) > jetzt.getTime() && anstoss.grund !== "knopf") {
    if (gmailGrund && limit.gmail !== true) zustandAendern(verzeichnis, (z) => { if (z.limit) z.limit.gmail = true; });
    return { status: "limit-wartet", wieder: limit.wieder };
  }
  const knopf = anstoss.grund === "knopf";
  const gesperrt = new Set();
  const opusWartet = unterlagenWahl(verzeichnis, join(verzeichnis, "unterlagen", "opus"), "opus", jetzt).namen.size > 0;
  if (opusWartet && !erlaubtHeute(verzeichnis, jetzt, knopf).unterlagen) gesperrt.add("unterlagen");
  const opus = opusWartet && !gesperrt.size ? await einLauf({ ...o, jetzt, anstoss, opus: true, erlaubt: erlaubtHeute(verzeichnis, jetzt, knopf) }) : null;
  if (opus && opus.status === "claude-limit") {
    if (gmailGrund) zustandAendern(verzeichnis, (z) => { if (z.limit) z.limit.gmail = true; });
    return opus;
  }
  const r = await einLauf({ ...o, jetzt, anstoss, opus: false, erlaubt: erlaubtHeute(verzeichnis, jetzt, knopf) });
  for (const q of r.gesperrt || []) gesperrt.add(q);
  delete r.gesperrt;
  if (opus) delete opus.gesperrt;
  // Grenze des Tages: Wartet etwas nur ihretwegen, stößt der Dienst kurz nach Mitternacht an
  const wieder = naechsterTag(jetzt).toISOString();
  zustandAendern(verzeichnis, (z) => {
    z.grenzen = grenzenStand(verzeichnis, jetzt);
    if (gesperrt.size) z.tagesgrenze = { tag: tagBerlin(jetzt), wieder, quellen: [...gesperrt] }; else delete z.tagesgrenze;
  });
  if (r.status === "nichts-zu-tun" && !opus && gesperrt.size) return { status: "tagesgrenze", wieder, quellen: [...gesperrt] };
  // nichts mehr zu tun: auch kein Versuch nach dem Limit mehr nötig
  if (r.status === "nichts-zu-tun" && !opus && limit) zustandAendern(verzeichnis, (z) => { delete z.limit; });
  if (!opus) return r;
  return r.status === "nichts-zu-tun" ? opus : { ...r, opus };
}

// Läufe heute je Anlass (nutzung.json, quellen) → { mails, pruefen, gmail, unterlagen, knopf }
function laeufeHeute(verzeichnis, jetzt) {
  const q = (((lesen(join(verzeichnis, "nutzung.json"), {}) || {})[tagBerlin(jetzt)] || {}).quellen) || {};
  return Object.fromEntries(ANLAESSE.map((k) => [k, Number.isInteger(q[k]) && q[k] >= 0 ? q[k] : 0]));
}
// Welche Anlässe heute noch einen Lauf haben (GRENZEN.laeufe); auf Knopfdruck alle
const erlaubtHeute = (verzeichnis, jetzt, knopf) => {
  const n = laeufeHeute(verzeichnis, jetzt);
  return Object.fromEntries(Object.keys(GRENZEN.laeufe).map((k) => [k, knopf || n[k] < GRENZEN.laeufe[k]]));
};

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
// Tag in Berlin (YYYY-MM-DD); erste Viertelstunde des nächsten Tags
const tagBerlin = (d) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
const naechsterTag = (jetzt) => {
  const tag = tagBerlin(jetzt);
  let t = jetzt.getTime();
  while (tagBerlin(new Date(t)) === tag) t += 15 * 60e3;
  return new Date(t);
};
// Stand der Grenzen heute (zustand.grenzen, im Status mit Zugangsschlüssel): Läufe, zusammen und je Anlass mit Grenze; Mails, die der Abruf wartend hält, heute auf
// einen späteren Tag zurückgestellt oder auf den nächsten Abruf verschoben hat oder nicht mehr merken konnte; Zeichen je Topf
// (abruf/abruf-stand.json); Mails, mit denen ein Lauf scheiterte und die noch einmal laufen (mails_verdacht); Mails in Quarantäne
// und wie viele davon über ihren Grenzen wegfielen; gescheiterte Läufe mit Gmail heute und ob es ausgesetzt ist; ausgelassene
// Unterlagen und Folien
function grenzenStand(verzeichnis, jetzt) {
  const tag = tagBerlin(jetzt), n = (x) => (Number.isInteger(x) && x >= 0 ? x : 0);
  const abruf = lesen(join(verzeichnis, "abruf", "abruf-stand.json"), {}) || {};
  const t = abruf.tag && abruf.tag.datum === tag ? abruf.tag : {};
  const wartend = abruf.uni_postfach && abruf.uni_postfach.wartend && typeof abruf.uni_postfach.wartend === "object" ? Object.keys(abruf.uni_postfach.wartend).length : 0;
  const q = quarantaeneZaehlen(verzeichnis), gmailFehler = gmailFehlerLesen(verzeichnis, jetzt);
  const ausgelassen = (o, a) => unterlagenWahl(verzeichnis, join(verzeichnis, "unterlagen", o), a, jetzt).ausgelassen;
  const je = laeufeHeute(verzeichnis, jetzt);
  return { tag, laeufe: n(((lesen(join(verzeichnis, "nutzung.json"), {}) || {})[tag] || {}).laeufe),
    laeufe_max: Object.values(GRENZEN.laeufe).reduce((a, b) => a + b, 0),
    ...Object.fromEntries(ANLAESSE.map((k) => ["laeufe_" + k, je[k]])), ...Object.fromEntries(Object.keys(GRENZEN.laeufe).map((k) => [`laeufe_${k}_max`, GRENZEN.laeufe[k]])),
    mails_wartend: wartend,
    mails_verworfen: n(t.verworfen), mails_zurueckgestellt: n(t.zurueckgestellt), mails_verschoben: n(t.verschoben), zeichen_uni: n((t.uni || {}).zeichen),
    zeichen_andere: n((t.andere || {}).zeichen), mails_verdacht: Object.keys(mailFehlerLesen(verzeichnis, jetzt)).filter((k) => !istDatei(join(verzeichnis, QUARANTAENE, k))).length,
    quarantaene: q.mails, quarantaene_geloescht: q.geloescht,
    fehlschlaege_gmail: gmailFehler, ausgesetzt_gmail: gmailFehler >= GRENZEN.extra ? 1 : 0,
    unterlagen_ausgelassen: ausgelassen("neu", "neu") + ausgelassen("opus", "opus"), kapitel_ausgelassen: ausgelassen("kapitel", "kapitel") };
}
// nutzung.json: je Tag Läufe, Läufe mit Opus, Treffer am Limit und die Token, dazu gmail_begrenzt (Gmail-Überblick an seiner
// Grenze, nur wenn es vorkam) und quellen (Läufe je Anlass, GRENZEN.laeufe); NUTZUNG_TAGE lang (studium-server nutzung)
export function nutzungBuchen(verzeichnis, jetzt, { opus, limit, nutzung, begrenzt = false, quellen = [] }) {
  const datei = join(verzeichnis, "nutzung.json");
  const alle = lesen(datei, {}) || {};
  const tag = tagBerlin(jetzt);
  const t = alle[tag] || { laeufe: 0, opus: 0, limit: 0, eingabe: 0, ausgabe: 0, cache_lesen: 0, cache_schreiben: 0 };
  t.laeufe++;
  if (opus) t.opus++;
  if (limit) t.limit++;
  if (begrenzt) t.gmail_begrenzt = (t.gmail_begrenzt || 0) + 1;
  if (nutzung) for (const k of ["eingabe", "ausgabe", "cache_lesen", "cache_schreiben"]) t[k] += nutzung[k];
  if (quellen.length) {
    t.quellen = t.quellen && typeof t.quellen === "object" ? t.quellen : {};
    for (const q of quellen) t.quellen[q] = (Number.isInteger(t.quellen[q]) ? t.quellen[q] : 0) + 1;
  }
  alle[tag] = t;
  const grenze = tagBerlin(new Date(jetzt.getTime() - NUTZUNG_TAGE * 24 * STUNDE));
  for (const k of Object.keys(alle)) if (k <= grenze) delete alle[k];
  schreiben(datei, alle);
}

// Ein Lauf. claude: [befehl, ...args] (Tests geben eine Attrappe), skill: Ordner des Skills.
// erlaubt: Anlässe, die heute noch einen Lauf haben (erlaubtHeute); was nur deshalb wartet, steht im Ergebnis unter gesperrt.
async function einLauf({ verzeichnis, jetzt = new Date(), claude = ["claude"], skill = join(PAKET, "skill", "studium-autopilot"), modell, timeout, holen = fetch, anstoss, opus,
  erlaubt }) {
  const zustand = lesen(join(verzeichnis, "zustand.json"), {});
  const einstellungen = lesen(join(verzeichnis, "einstellungen.json"), {});
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
  const kapitelNeu = join(verzeichnis, "unterlagen", "kapitel");
  // Stand des Plugins: stand.json (Modulcodes, Studienbeginn, Variante, lernplan) und tresor.json (was schon in Obsidian steht)
  const { tresor, ...stand } = lesen(join(verzeichnis, "web", "stand-plugin.json"), { schema: 1, module: [] });
  // Folien für Kapitellisten nur im gewöhnlichen Lauf und nur für Module, nach denen der Stand fragt
  if (!opus) kapitelAussortieren(kapitelNeu, stand.lernplan);
  // Extras: was dran wäre (fällig, Anlass mit Läufen; Gmail nicht ausgesetzt, ausgelassene Unterlagen nie) und was einen Fehlschlag hat
  const gmailFehler = gmailFehlerLesen(verzeichnis, jetzt);
  const wahl = { unterlagen: unterlagenWahl(verzeichnis, unterlagenNeu, opus ? "opus" : "neu", jetzt), kapitel: opus ? LEER : unterlagenWahl(verzeichnis, kapitelNeu, "kapitel", jetzt) };
  const faellig = { gmail: !opus && gmailDran(anstoss, zustand, jetzt, taktLesen(verzeichnis).gmail) && gmailFehler < GRENZEN.extra,
    unterlagen: wahl.unterlagen.namen.size > 0, kapitel: wahl.kapitel.namen.size > 0 };
  const mitFehler = { gmail: gmailFehler > 0, unterlagen: wahl.unterlagen.verdacht, kapitel: wahl.kapitel.verdacht };
  const anlass = { gmail: "gmail", unterlagen: "unterlagen", kapitel: "unterlagen" };
  const kandidaten = EXTRAS.filter((x) => faellig[x] && erlaubt[anlass[x]]);
  const verdacht = kandidaten.find((x) => mitFehler[x]);
  // Sicherheitslauf: ein Extra mit Fehlschlag vor den Mails (sonst käme es an Tagen mit vielen Mails nie dran)
  const sicht = opus ? { art: "", mails: 0, unbestaetigt: false, quarantaene: 0, gesperrt: [] }
    : rohSichten(verzeichnis, arbeit, jetzt, erlaubt, !!verdacht && anstoss.gruende.includes("taeglich"));
  const gesperrt = new Set(sicht.gesperrt);
  // Mails nach einem Fehlschlag und Mails nicht bestätigter Absender laufen ohne Extras; aus Mails nicht bestätigter Absender kommt
  // alles nur geschätzt (unbestaetigt)
  const nurMails = sicht.art === "pruefen" || sicht.art === "unbestaetigt";
  for (const x of EXTRAS) if (faellig[x] && !erlaubt[anlass[x]] && !nurMails) gesperrt.add(anlass[x]);
  // welche Extras dieser Lauf nimmt: keine zu Mails nach einem Fehlschlag; zu frischen Mails nur die ohne Fehlschlag; ohne Mails ein
  // Extra mit Fehlschlag allein, sonst alle
  const extras = nurMails ? [] : sicht.mails ? kandidaten.filter((x) => !mitFehler[x]) : verdacht ? [verdacht] : kandidaten;
  // dran, aber nicht in diesem Lauf: kommt mit dem nächsten (ende stößt ihn an)
  const ausgelassen = kandidaten.filter((x) => !extras.includes(x));
  const gmail = extras.includes("gmail");
  if (opus) pdfAufraeumen(unterlagenNeu, jetzt);
  const unterlagen = !extras.includes("unterlagen") ? [] : unterlagenUebernehmen(unterlagenNeu, join(arbeit, "unterlagen"), opus ? UNTERLAGEN_OPUS_JE_LAUF : UNTERLAGEN_JE_LAUF,
    UNTERLAGEN_ZEICHEN, wahl.unterlagen.namen);
  const kapitel = !extras.includes("kapitel") ? [] : unterlagenUebernehmen(kapitelNeu, join(arbeit, "kapitel"), KAPITEL_JE_LAUF, KAPITEL_ZEICHEN, wahl.kapitel.namen);
  const index = (dateiLesen(join(arbeit, "roh", "INDEX.md")) || "").toString("utf8");
  const meldungen = index.split("\n").filter((z) => z.startsWith("- ")).map((z) => z.replace(/^- [\d.]+ [\d:]+ UTC: /, "").trim());
  if (sicht.art === "pruefen") meldungen.push(`${sicht.mails} Mail(s), mit denen ein Lauf gescheitert ist, noch einmal (ohne neue)`);
  if (sicht.unbestaetigt) {
    meldungen.push(`${sicht.mails} Mail(s) mit nicht bestätigtem Absender (eigener Lauf, alles daraus nur „geschätzt“)`);
  }
  if (!gmail && !meldungen.length && !unterlagen.length && !kapitel.length) {
    // Rohdaten ohne Meldung (der Abruf brach zwischen Mail und INDEX.md ab) sind kein Grund für Claude, gehen aber zurück: Sie
    // kommen mit dem nächsten Lauf, statt mit dem Lauf-Ordner gelöscht zu werden
    const roh = join(arbeit, "roh");
    if (istOrdner(roh) && readdirSync(roh).length) rohZurueck(roh, rohOrdner(verzeichnis));
    rmSync(arbeit, { recursive: true, force: true });
    return { status: "nichts-zu-tun", gesperrt: [...gesperrt] };
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
    let quarantaene = sicht.quarantaene;
    // ein Fehlschlag, an dem der Inhalt schuld sein kann, und es waren Mails dabei: Diese sind halbiert bzw. gezählt, der nächste Lauf
    // kommt also weiter (nie im Kreis)
    const inhalt = !ok && r.signal == null && inhaltKannSchuldSein(code, ergebnis, r.err, neuerZustand);
    // Extras dieses Laufs: gezählt bei einem solchen Fehlschlag, zurück auf 0 bei Erfolg. Waren Extras dabei, zählt der Fehlschlag
    // nicht gegen die Mails: Sie laufen gleich noch einmal ohne (ohneExtrasNochmal); sonst halbiert bzw. allein gezählt
    const extrasDabei = [...(gmail ? ["gmail"] : []), ...(unterlagen.length ? ["unterlagen"] : []), ...(kapitel.length ? ["kapitel"] : [])];
    if ((ok || inhalt) && gmail) gmailFehlerBuchen(verzeichnis, jetzt, !ok);
    if (ok || inhalt) {
      unterlagenBuchen(verzeichnis, unterlagen.map((n) => wahl.unterlagen.kennung.get(n)), jetzt, name, !ok);
      unterlagenBuchen(verzeichnis, kapitel.map((n) => wahl.kapitel.kennung.get(n)), jetzt, name, !ok);
    }
    const gezaehlt = inhalt && !opus && sicht.mails > 0;
    if (ok) fehlschlaegeLoeschen(verzeichnis, join(arbeit, "roh"), jetzt);
    if (!ok) {
      rmSync(join(arbeit, "ausgabe.json"), { force: true });
      fehler.add(code);
      if (gezaehlt && extrasDabei.length) ohneExtrasNochmal(verzeichnis, join(arbeit, "roh"), jetzt, name);
      else if (gezaehlt) quarantaene += fehlschlagZaehlen(verzeichnis, join(arbeit, "roh"), jetzt, name);
      rohZurueck(join(arbeit, "roh"), rohOrdner(verzeichnis));
      unterlagenZurueck(join(arbeit, "unterlagen"), unterlagenNeu);
      unterlagenZurueck(join(arbeit, "kapitel"), kapitelNeu);
    }
    laufOrdnerLeeren(arbeit);
    // Anlässe dieses Laufs (GRENZEN.laeufe); auf Knopfdruck nur knopf
    const quellen = anstoss.grund === "knopf" ? ["knopf"] : [...(sicht.art === "frisch" ? [sicht.uni ? "mails_uni" : "mails"] : sicht.art ? ["pruefen"] : []), ...(gmail ? ["gmail"] : []),
      ...(opus || unterlagen.length || kapitel.length ? ["unterlagen"] : [])];
    nutzungBuchen(verzeichnis, jetzt, { opus, limit: code === "claude-limit", nutzung, begrenzt: !!(mehr.gmailUeberblick && mehr.gmailUeberblick.begrenzt), quellen });
    // warten noch Unterlagen oder zurückgelegte Mails, gleich der nächste Lauf: nur nach Erfolg (sonst liefe ein Fehler im Kreis) oder
    // nach einem gezählten Fehlschlag (dann ist der nächste Lauf ein anderer: halbiert, allein oder ohne die Mail in Quarantäne), und
    // nur, wenn ihr Anlass heute noch Läufe hat
    const noch = erlaubtHeute(verzeichnis, jetzt, false);
    const unterlagenDran = noch.unterlagen && [["neu", "neu"], ["opus", "opus"], ["kapitel", "kapitel"]]
      .some(([o, a]) => unterlagenWahl(verzeichnis, join(verzeichnis, "unterlagen", o), a, jetzt).namen.size > 0);
    if ((ok || inhalt) && !anstossWartet(verzeichnis)) {
      if (!opus && rohDran(verzeichnis, jetzt, noch)) anstossSchreiben(verzeichnis, "quellen", jetzt);
      else if (unterlagenDran) anstossSchreiben(verzeichnis, "unterlagen", jetzt);
      else if (ausgelassen.includes("gmail") && noch.gmail && gmailFehlerLesen(verzeichnis, jetzt) < GRENZEN.extra) anstossSchreiben(verzeichnis, "gmail", jetzt);
    }
    neuerZustand.fehler = [...fehler];
    neuerZustand.letzterLauf = { zeit: jetzt.toISOString(), ok };
    neuerZustand.grenzen = grenzenStand(verzeichnis, jetzt);
    delete neuerZustand.laeuftSeit;
    zustandSchreiben(verzeichnis, neuerZustand);
    writeFileSync(join(arbeit, "protokoll.json"), JSON.stringify({ ok, code, exit: r.code, modell: modellLauf, gmail, unterlagen: unterlagen.length, kapitelFolien: kapitel.length,
      ...(sicht.art ? { mails: { art: sicht.art, zahl: sicht.mails, ...(sicht.unbestaetigt ? { unbestaetigt: true } : {}) } } : {}),
      ...(extrasDabei.length < kandidaten.length ? { ausgelassen } : {}), ...(gezaehlt ? { gezaehlt, ...(extrasDabei.length ? { ohneExtras: true } : {}) } : {}),
      ...(quarantaene ? { quarantaene } : {}), ...(nutzung ? { nutzung } : {}), ...mehr }, null, 2));
    aufraeumen(join(verzeichnis, "laeufe"));
    return { status: ok ? "ok" : code, ...(code === "claude-limit" ? { wieder: neuerZustand.limit.wieder } : {}), ...mehr, gesperrt: [...gesperrt] };
  };
  // gescheitert: Code ungleich 0 oder is_error in der Ausgabe (Claude Code endet am Limit nicht immer mit einem Fehlercode)
  if (r.code !== 0 || (ergebnis && ergebnis.is_error === true)) return ende(false, /limit/i.test(r.aus + r.err) ? "claude-limit" : "claude-lauf");
  const ausgabe = lesen(join(arbeit, "ausgabe.json"), null);
  if (!ausgabe) return ende(false, "ausgabe-ungueltig");
  const { eingang: claudes, verworfen, herkunft: herkunftClaude, fehler: formfehler } = eingangNormal(ausgabe, { jetzt, lauf: name, mails: mailsLesen(join(arbeit, "roh")) });
  if (formfehler) return ende(false, "ausgabe-ungueltig");
  // Lauf nur mit Mails nicht bestätigter Absender: Was er liefert, kommt aus ihnen, gleich welche Herkunft Claude nennt (unbestaetigt)
  const { eingang: geprueft, herkunft } = sicht.unbestaetigt ? unbestaetigt(claudes, herkunftClaude) : { eingang: claudes, herkunft: herkunftClaude };
  // Herkunft: Absender nicht bestätigt, Änderungen aus einer anderen Quelle (termine-quellen.json: Quelle je Termin, nur für
  // Termine im Bestand)
  const h = herkunftAnwenden(geprueft.termine, herkunft, { bestand, quellen: lesen(join(verzeichnis, "termine-quellen.json"), {}), heute: tagBerlin(jetzt) });
  const eingang = { ...geprueft, termine: h.termine };
  const { eingang: nurNeu, bestand: neuerBestand } = nurNeueOderGeaenderte(eingang, bestand);
  const { hinweise, bisher: hinweiseBisher } = nurNeueHinweise(nurNeu.hinweise, lesen(join(verzeichnis, "hinweise-bisher.json"), {}), jetzt);
  // Kapitellisten: nur gefragte Module, nur Neues oder Geändertes
  const k = nurNeueKapitel(eingang.kapitel, kapitelBestand, stand.lernplan);
  const neu = { ...nurNeu, hinweise, kapitel: k.kapitel };
  if (eingang.kapitel.length) schreiben(join(verzeichnis, "kapitel.json"), k.bestand);
  schreiben(join(verzeichnis, "termine.json"), neuerBestand);
  schreiben(join(verzeichnis, "termine-quellen.json"), Object.fromEntries(Object.entries(h.quellen).filter(([id]) => neuerBestand[id])));
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

// Ergebnis eines Laufs nur mit Mails nicht bestätigter Absender: jeder Termin mit Herkunft aus einer solchen Mail (Domain nur, wenn
// Claude eine solche Mail nennt), damit herkunftAnwenden ihn „geschätzt“ mit „Absender nicht bestätigt.“ liefert; Hinweise mit
// diesem Satz vorn; keine Begleitnotizen, Kapitellisten oder doppelten To-dos (die Mails sollen nichts am Tresor ändern).
// → { eingang, herkunft }
const NICHT_BESTAETIGT_HINWEIS = "Absender nicht bestätigt: ";
function unbestaetigt(eingang, herkunft) {
  const aus = {};
  for (const t of eingang.termine) {
    const h = herkunft[t.id] && herkunft[t.id].urteil === "fehlgeschlagen" ? herkunft[t.id] : null;
    aus[t.id] = { art: "mail", domain: h ? h.domain : "", urteil: "fehlgeschlagen", datum: h ? h.datum : "" };
  }
  const hinweise = eingang.hinweise.map((x) => ({ ...x, text: (NICHT_BESTAETIGT_HINWEIS + x.text).slice(0, 300) }));
  return { eingang: { ...eingang, hinweise, begleitnotizen: [], kapitel: [], todo_doppel: [] }, herkunft: aus };
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
