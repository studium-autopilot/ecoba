#!/usr/bin/env node
// Claude-Lauf des eigenen Servers. Startet, wenn $STUDIUM_SERVER_DATEN/anstoss da ist (systemd: studium-server-lauf.path):
// neue Rohdaten (abrufen.py), Gmail-Zeit (Timer), Knopf (Obsidian oder studium-server jetzt) oder der tägliche Sicherheitslauf
// (abrufen.py ab 06:30 Uhr: Uni-Mails der letzten 24 Stunden noch einmal, dazu Gmail und Liegengebliebenes). Den Takt für Gmail
// stellst du in Obsidian ein (takt.json vom Dienst: 3-, 1- oder 0-mal am Tag).
//   1. Anstoß und roh/ übernehmen, Arbeitsordner laeufe/<zeit>/ mit auftrag.md, roh/, bisher.json, stand.json, tresor.json,
//      Textfassungen von Unterlagen (unterlagen/, vom Dienst; bis zu 6, zusammen höchstens 200 000 Zeichen) und dem Skill
//   2. claude -p mit engen Rechten: lesen nur im Arbeitsordner, schreiben nur ausgabe.json, kein Bash, kein Web, keine
//      Unteragenten; Gmail nur lesend und nur, wenn Gmail dran ist; nie der Uni-Zugang, die Schlüssel oder ~/.claude
//   3. ausgabe.json prüfen (eingang.mjs), nur Neues bzw. Geändertes nach eingang/, Bestand und Zustand nachziehen
// Schlägt der Lauf fehl, kommen die Rohdaten zurück nach roh/ (nichts geht verloren).
//   node lauf.mjs                 ein Lauf (vom Dienst gestartet)
//   node lauf.mjs --anstoss <grund>   nur den Anstoß schreiben (gmail: nur wenn der Takt es will | knopf)
import { spawn } from "node:child_process";
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { eingangNormal, istLeer, nurNeueHinweise, nurNeueOderGeaenderte } from "./eingang.mjs";

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
// Öffentliche zentrale Termine (für alle EcoBA-Studierenden): kommen über das Plugin ohnehin, Claude liefert sie nicht doppelt.
export const ZENTRAL = "https://studium-autopilot.github.io/ecoba-daten/v1/termine.json";
const GMAIL_SCHREIBEND = ["create_draft", "update_draft", "delete_draft", "send_message", "reply", "forward", "create_label", "update_label",
  "delete_label", "label_message", "label_thread", "unlabel_message", "unlabel_thread", "update_message_labels", "mark_message_spam",
  "mark_thread_spam", "unmark_message_spam", "unmark_thread_spam", "trash_message", "trash_thread", "untrash_message", "untrash_thread",
  "apply_sensitive_message_label", "apply_sensitive_thread_label"].map((t) => "mcp__claude_ai_Gmail__" + t);
const GMAIL_LESEND = ["search_threads", "get_thread", "get_message", "list_labels"].map((t) => "mcp__claude_ai_Gmail__" + t);

const lesen = (datei, ersatz) => {
  try { return JSON.parse(readFileSync(datei, "utf8")); } catch (e) { return ersatz; }
};
const schreiben = (datei, daten) => {
  writeFileSync(datei + ".neu", JSON.stringify(daten, null, 2));
  renameSync(datei + ".neu", datei);
};
const stempel = (d) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
const abs = (p) => "/" + p.replace(/\\/g, "/").replace(/^\/+/, ""); // Claude-Rechte: //pfad = absoluter Pfad

export function anstossSchreiben(verzeichnis, grund, jetzt = new Date()) {
  schreiben(join(verzeichnis, "anstoss"), { zeit: jetzt.toISOString(), grund });
}

// Takt aus Obsidian (dienst.mjs schreibt takt.json); fehlt er, der Standard
export function taktLesen(verzeichnis) {
  const t = lesen(join(verzeichnis, "takt.json"), {}) || {};
  return { uni_postfach: [15, 30, 60].includes(t.uni_postfach) ? t.uni_postfach : 15, gmail: [3, 1, 0].includes(t.gmail) ? t.gmail : 3 };
}

// Gmail ist dran bei Gmail-Zeit, Knopf und Sicherheitslauf, sonst wenn die letzte Suche länger her ist (GMAIL_NACH); bei Takt 0
// nie.
export function gmailDran(anstoss, zustand, jetzt, takt = 3) {
  if (!takt) return false;
  if (["gmail", "knopf", "taeglich"].includes(anstoss.grund)) return true;
  const zuletzt = Date.parse(zustand.gmailZuletzt || "");
  return !Number.isFinite(zuletzt) || jetzt - zuletzt > GMAIL_NACH[takt];
}
export function gmailZeitDran(zustand, jetzt, takt = 3) {
  if (!takt) return false;
  const zuletzt = Date.parse(zustand.gmailZuletzt || "");
  return !Number.isFinite(zuletzt) || jetzt - zuletzt > GMAIL_ZEIT_NACH[takt];
}

export function rechte(arbeit, gmail) {
  const a = abs(arbeit);
  return {
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

export function auftragText({ jetzt, grund, gmail, gmailTage, meldungen, unterlagen = 0, opus = false }) {
  const zeit = jetzt.toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "full", timeStyle: "short" });
  return [
    "# Auftrag für diesen Lauf", "",
    `Jetzt: ${zeit} (Europe/Berlin). Anlass: ${grund}.`,
    `Gmail durchsuchen: ${gmail ? `ja, Zeitraum newer_than:${gmailTage}d` : "nein (nicht öffnen)"}.`,
    "Neue Rohdaten: " + (meldungen.length ? meldungen.join("; ") : "keine") + ".",
    `Neue Unterlagen für Begleitnotizen: ${unterlagen ? `${unterlagen} (Ordner unterlagen/)` : "keine"}.`,
    ...(opus ? ["Dieser Lauf schreibt nur die Begleitnotizen zu den Unterlagen, die die Person ausgewählt hat. Sie wünscht sich besonders " +
      "gründliche Zusammenfassungen: lies jede Unterlage ganz."] : []),
    ...(grund === "taeglich" ? ["Täglicher Sicherheitslauf: Die Uni-Mails in roh/ sind die der letzten 24 Stunden, einige kennst du schon. " +
      "Liefere nur, was in bisher.json fehlt oder sich geändert hat."] : []), "",
    "Lies skill/SKILL.md, skill/termine.md und skill/ausgabe.md" + (unterlagen ? ", für die Unterlagen auch skill/begleitnotiz.md" : "") +
      ", arbeite danach und schreibe das Ergebnis nach ausgabe.json.",
    "",
  ].join("\n");
}

// Textfassungen für Begleitnotizen (der Dienst legt sie nach unterlagen/neu/): die ältesten im Rahmen der Grenzen in den
// Lauf-Ordner; scheitert der Lauf, zurück (unterlagenZurueck). → Namen
function unterlagenUebernehmen(von, nach, hoechstens = UNTERLAGEN_JE_LAUF) {
  if (!existsSync(von)) return [];
  const alle = readdirSync(von).filter((n) => /^[0-9a-f]{64}\.md$/.test(n)).map((n) => ({ n, s: statSync(join(von, n)) }))
    .sort((a, b) => a.s.mtimeMs - b.s.mtimeMs || (a.n < b.n ? -1 : 1));
  const namen = [];
  let summe = 0;
  for (const { n, s } of alle) {
    if (namen.length >= hoechstens || (namen.length && summe + s.size > UNTERLAGEN_ZEICHEN)) break;
    namen.push(n);
    summe += s.size;
  }
  if (namen.length) mkdirSync(nach, { recursive: true });
  for (const n of namen) renameSync(join(von, n), join(nach, n));
  return namen;
}
function unterlagenZurueck(arbeitU, neu) {
  if (!existsSync(arbeitU)) return;
  mkdirSync(neu, { recursive: true });
  for (const n of readdirSync(arbeitU)) if (!existsSync(join(neu, n))) renameSync(join(arbeitU, n), join(neu, n));
}

// Rohdaten in den Lauf-Ordner: als Ganzes umbenennen, ein Schritt. abrufen.py schreibt jede Datei fertig (Zwischendatei +
// Umbenennen) und legt roh/ bei Bedarf neu an; was während des Laufs kommt, wartet dort auf den nächsten.
function rohUebernehmen(von, nach) {
  if (existsSync(von)) renameSync(von, nach);
  else mkdirSync(nach, { recursive: true });
}

// Lauf gescheitert: Rohdaten zurück, Datei für Datei, auch in Ordner, die abrufen.py inzwischen neu angelegt hat. Vorhandenes
// bleibt; INDEX.md wird zusammengeführt (die Meldungen des gescheiterten Laufs zuerst). Neue Ordner bekommen 0770: abrufen.py
// läuft als eigener Benutzer (studium-abruf, Gruppe studium) und muss dort weiter ablegen können; der Lauf selbst hat UMask 0022.
function rohZurueck(arbeitRoh, roh) {
  if (!existsSync(arbeitRoh)) return;
  if (!existsSync(roh)) { mkdirSync(roh, { recursive: true }); chmodSync(roh, 0o770); }
  for (const e of readdirSync(arbeitRoh, { withFileTypes: true })) {
    const von = join(arbeitRoh, e.name), ziel = join(roh, e.name);
    if (e.isDirectory()) rohZurueck(von, ziel);
    else if (e.name === "INDEX.md" && existsSync(ziel)) writeFileSync(ziel, readFileSync(von, "utf8") + readFileSync(ziel, "utf8").replace(/^# .*\n/, ""));
    else if (!existsSync(ziel)) cpSync(von, ziel);
  }
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

const wartet = (ordner) => existsSync(ordner) && readdirSync(ordner).some((n) => n.endsWith(".md"));

// Ein Anstoß: zuerst die gewünschten Zusammenfassungen mit Opus (falls welche warten), dann der gewöhnliche Lauf. → Ergebnis des
// gewöhnlichen Laufs, mit opus: Ergebnis des Opus-Laufs (hatte der gewöhnliche nichts zu tun, das Ergebnis des Opus-Laufs)
export async function laufen(o = {}) {
  const { verzeichnis } = o;
  const anstossDatei = join(verzeichnis, "anstoss");
  const anstoss = lesen(anstossDatei, null);
  if (!anstoss) return { status: "kein-anstoss" };
  rmSync(anstossDatei, { force: true });
  const opus = wartet(join(verzeichnis, "unterlagen", "opus")) ? await einLauf({ ...o, anstoss, opus: true }) : null;
  const r = await einLauf({ ...o, anstoss, opus: false });
  if (!opus) return r;
  return r.status === "nichts-zu-tun" ? opus : { ...r, opus };
}

async function einLauf({ verzeichnis, jetzt = new Date(), claude = ["claude"], skill = join(PAKET, "skill", "studium-autopilot"), modell, timeout, holen = fetch, anstoss, opus }) {
  const zustand = lesen(join(verzeichnis, "zustand.json"), {});
  const einstellungen = lesen(join(verzeichnis, "einstellungen.json"), {});
  const gmail = !opus && gmailDran(anstoss, zustand, jetzt, taktLesen(verzeichnis).gmail);
  const tage = Math.min(14, Math.max(1, Math.ceil((jetzt - (Date.parse(zustand.gmailZuletzt || "") || jetzt - 14 * 24 * STUNDE)) / (24 * STUNDE))));

  // eigener Ordner je Lauf, auch bei zwei Läufen in derselben Sekunde
  let name = stempel(jetzt);
  for (let i = 2; existsSync(join(verzeichnis, "laeufe", name)); i++) name = `${stempel(jetzt)}-${i}`;
  const arbeit = join(verzeichnis, "laeufe", name);
  mkdirSync(arbeit, { recursive: true });
  if (opus) mkdirSync(join(arbeit, "roh"));
  else rohUebernehmen(join(verzeichnis, "roh"), join(arbeit, "roh"));
  const unterlagenNeu = join(verzeichnis, "unterlagen", opus ? "opus" : "neu");
  const unterlagen = unterlagenUebernehmen(unterlagenNeu, join(arbeit, "unterlagen"), opus ? UNTERLAGEN_OPUS_JE_LAUF : UNTERLAGEN_JE_LAUF);
  const index = existsSync(join(arbeit, "roh", "INDEX.md")) ? readFileSync(join(arbeit, "roh", "INDEX.md"), "utf8") : "";
  const meldungen = index.split("\n").filter((z) => z.startsWith("- ")).map((z) => z.replace(/^- [\d.]+ [\d:]+ UTC: /, "").trim());
  if (!gmail && !meldungen.length && !unterlagen.length) {
    rmSync(arbeit, { recursive: true, force: true });
    return { status: "nichts-zu-tun" };
  }
  // „läuft“ für den Status (Knopf „Mails durchsuchen“ zeigt es), am Ende wieder weg
  const vorher = lesen(join(verzeichnis, "zustand.json"), {});
  schreiben(join(verzeichnis, "zustand.json"), { ...vorher, laeuftSeit: jetzt.toISOString() });
  const bestand = lesen(join(verzeichnis, "termine.json"), {});
  writeFileSync(join(arbeit, "auftrag.md"), auftragText({ jetzt, grund: opus ? "Zusammenfassungen auf Wunsch" : anstoss.grund, gmail, gmailTage: tage, meldungen, unterlagen: unterlagen.length, opus }));
  writeFileSync(join(arbeit, "bisher.json"), JSON.stringify(Object.values(bestand).map((t) => ({ schluessel: t.schluessel, titel: t.titel,
    datum: t.datum, bis: t.bis, uhrzeit: t.uhrzeit, ort: t.ort, kategorie: t.kategorie, status: t.status, code: t.code, entfaellt: t.entfaellt === true })), null, 1));
  // Stand des Plugins: stand.json (Modulcodes, Studienbeginn, Variante) und tresor.json (was schon in Obsidian steht)
  const { tresor, ...stand } = lesen(join(verzeichnis, "stand-plugin.json"), { schema: 1, module: [] });
  writeFileSync(join(arbeit, "stand.json"), JSON.stringify(stand));
  writeFileSync(join(arbeit, "tresor.json"), JSON.stringify(tresor || { termine: [], todos: [] }, null, 1));
  writeFileSync(join(arbeit, "zentral.json"), JSON.stringify(await zentralHolen(holen), null, 1));
  cpSync(skill, join(arbeit, "skill"), { recursive: true });
  const rechteDatei = join(arbeit, ".rechte.json");
  writeFileSync(rechteDatei, JSON.stringify(rechte(arbeit, gmail), null, 2));

  const prompt = "Du bist der Lauf von Studium Autopilot auf dem eigenen Server. Arbeitsordner: " + abs(arbeit) +
    ". Lies auftrag.md und folge ihm. Schreibe nur ausgabe.json.";
  const modellLauf = opus ? "opus" : modell || einstellungen.modell || "sonnet";
  const args = [...claude.slice(1), "-p", prompt, "--model", modellLauf, "--settings", rechteDatei,
    "--permission-mode", "dontAsk", "--tools", "Read,Write,Edit,Glob,Grep", "--output-format", "json"];
  const env = { ...process.env };
  delete env.ANTHROPIC_API_KEY;
  const r = await ausfuehren(claude[0], args, { cwd: arbeit, env, timeout });

  const neuerZustand = lesen(join(verzeichnis, "zustand.json"), {});
  const fehler = new Set((neuerZustand.fehler || []).filter((f) => !["claude-lauf", "claude-limit", "ausgabe-ungueltig"].includes(f)));
  const ende = (ok, code, mehr = {}) => {
    if (!ok) { fehler.add(code); rohZurueck(join(arbeit, "roh"), join(verzeichnis, "roh")); unterlagenZurueck(join(arbeit, "unterlagen"), unterlagenNeu); }
    // warten noch Unterlagen, gleich der nächste Lauf (nur nach Erfolg, sonst liefe ein Fehler im Kreis)
    else if (["neu", "opus"].some((u) => wartet(join(verzeichnis, "unterlagen", u))) && !existsSync(join(verzeichnis, "anstoss"))) {
      anstossSchreiben(verzeichnis, "unterlagen", jetzt);
    }
    neuerZustand.fehler = [...fehler];
    neuerZustand.letzterLauf = { zeit: jetzt.toISOString(), ok };
    delete neuerZustand.laeuftSeit;
    schreiben(join(verzeichnis, "zustand.json"), neuerZustand);
    writeFileSync(join(arbeit, "protokoll.json"), JSON.stringify({ ok, code, exit: r.code, modell: modellLauf, gmail, unterlagen: unterlagen.length, ...mehr }, null, 2));
    aufraeumen(join(verzeichnis, "laeufe"));
    return { status: ok ? "ok" : code, ...mehr };
  };
  if (r.code !== 0) return ende(false, /limit/i.test(r.aus + r.err) ? "claude-limit" : "claude-lauf");
  const ausgabe = lesen(join(arbeit, "ausgabe.json"), null);
  if (!ausgabe) return ende(false, "ausgabe-ungueltig");
  const { eingang, verworfen, fehler: formfehler } = eingangNormal(ausgabe, { jetzt, lauf: name });
  if (formfehler) return ende(false, "ausgabe-ungueltig");
  const { eingang: nurNeu, bestand: neuerBestand } = nurNeueOderGeaenderte(eingang, bestand);
  const { hinweise, bisher: hinweiseBisher } = nurNeueHinweise(nurNeu.hinweise, lesen(join(verzeichnis, "hinweise-bisher.json"), {}), jetzt);
  const neu = { ...nurNeu, hinweise };
  schreiben(join(verzeichnis, "termine.json"), neuerBestand);
  schreiben(join(verzeichnis, "hinweise-bisher.json"), hinweiseBisher);
  mkdirSync(join(verzeichnis, "eingang"), { recursive: true });
  if (!istLeer(neu)) schreiben(join(verzeichnis, "eingang", `${name}-lauf.json`), neu);
  if (gmail && ["ok", "fehlt"].includes(ausgabe.gmail)) {
    neuerZustand.gmail = ausgabe.gmail;
    if (ausgabe.gmail === "ok") neuerZustand.gmailZuletzt = jetzt.toISOString();
  }
  if (["ok", "fehlt"].includes(ausgabe.weiterleitung)) neuerZustand.weiterleitung = ausgabe.weiterleitung;
  return ende(true, "ok", { termine: neu.termine.length, begleitnotizen: neu.begleitnotizen.length, hinweise: neu.hinweise.length, verworfen: verworfen.length });
}

function aufraeumen(laeufe) {
  const alle = existsSync(laeufe) ? readdirSync(laeufe).sort() : [];
  for (const alt of alle.slice(0, Math.max(0, alle.length - LAEUFE_BEHALTEN))) rmSync(join(laeufe, alt), { recursive: true, force: true });
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
    laufen({ verzeichnis, claude: [claude] }).then((r) => console.log("lauf:", JSON.stringify(r)));
  }
}
