// Volltext der PDFs (seit 0.4.5): Zu jeder PDF unter „Unterlagen/“ legt das Plugin eine Textfassung
// „Unterlagen/_Volltext/<Name> (Volltext).md“ an, je Seite eine eingeklappte Karte mit Link auf genau diese Seite. So findet die
// Suche von Obsidian Wörter aus den PDFs, auch auf iPhone und iPad. Doku: docs/architektur.md, „Volltext der PDFs“.
//
// Nur eigene Notizen: Jede Textfassung trägt die Besitzmarke „volltext_von: plugin“. Nur solche Notizen schreibt, benennt oder
//   löscht dieses Skript, und es prüft die Marke vorher im Text der Datei (nie nur im metadataCache). Liegt irgendwo unter
//   Unterlagen/ eine Notiz „typ: volltext“ ohne Marke (z. B. von einem eigenen Uni-Abgleich) oder in _Volltext/ eine fremde
//   Datei, bleibt der Volltext für diesen Tresor aus: nichts wird geschrieben oder gelöscht, die fremde Fassung gewinnt.
// Wann es läuft: Einstellung „volltext“ (System/Einstellungen.md, fehlt = an, „aus“ = aus), nicht extern (quelleExtern:
//   Liste „quellen_extern“ mit „volltext“ bzw. ohne Liste der eigene Uni-Abgleich), keine fremde Textfassung. Der erste Lauf
//   kommt erst, wenn der metadataCache eingelesen ist und RUHE lang keine neue Datei im Tresor ankam (Erstabgleich eines neuen
//   Geräts); danach bei neuen, geänderten, umbenannten oder gelöschten PDFs (STABIL unverändert), alle TAKT und auf Knopfdruck
//   (gemeinsamer Zeitplan der Quellen, quellen.js planen).
// Ein Schreiber (System/Daten/volltext-abruf.json, synchronisiert): die gemeinsame Abrufer-Sperre (sperre.js, UEBERNAHME, PULS)
//   mit Computer-Vorrang. Geschrieben wird die Sperre nur in Tresoren mit PDFs oder eigenen Textfassungen.
//   Gleiche PDF ergibt auf jedem Gerät dieselbe Notiz (keine Zeitstempel), darum bleibt eine weiche Sperre harmlos.
// Auslesen: pdf.js von Obsidian (loadPdfJs), Seite für Seite getTextContent, Zeilen aus hasEOL bzw. der y-Lage, NFC, ohne
//   weiches Trennzeichen; Fremdtext entschärft (entschaerfen). Keine Texterkennung: Scans bekommen eine kurze Notiz „Kein Text
//   gefunden“, geschützte PDFs „Geschützt“; so wird nichts bei jedem Lauf neu versucht.
// Grenzen je Geräteklasse (GRENZEN): iPhone/iPad 25 MB, 300 Seiten, 500 000 Zeichen, Lauf 45 s, eine PDF höchstens 120 s;
//   größere warten auf einen Computer. Computer 80 MB (größer: Notiz „Zu groß“), 600 Seiten und 1 000 000 Zeichen (mehr:
//   „Gekürzt“), Lauf 120 s. Je Seite höchstens SEITE_ZEICHEN. Alle LUFT_SEITEN Seiten eine kurze Pause für die Oberfläche.
// Absturz-Schutz: Vor dem Öffnen einer PDF merkt sich das Gerät { pfad, groesse, version } (eba-volltext-in-arbeit), danach
//   ist es leer. Steht der Merker beim nächsten Start noch da und war die App dabei im Vordergrund (iOS beendet Obsidian z. B.
//   bei Speichermangel), kommt die PDF in eba-volltext-zu-schwer: iPhone/iPad lassen sie ab dem ersten, ein Computer ab dem
//   zweiten Abbruch aus, bis eine neue Plugin-Version kommt. Andere Geräte versuchen sie weiter.
// Neu, geändert oder aktuell (planen): Größe aus der Notiz; gleiche Größe → Prüfsumme aus ilias.json oder dem Gerätespeicher
//   (eba-volltext-cache, je PDF Größe, Änderungszeit und SHA-256), sonst gilt die Notiz als aktuell. Notiz ohne PDF: Partner
//   gleicher Größe und Prüfsumme → umbenennen, sonst nach WAISE_ALTER in den Papierkorb (mehr als die Hälfte und mehr als
//   MASSE auf einmal → nichts). Neue FASSUNG → nach und nach neu.
// Für andere Skripte: ctx.volltext = { status(), setzen(an), nachholen({ hier }), beobachten(fn) } (siehe api unten).
// Gerätelokal (app.saveLocalStorage): eba-volltext-cache, eba-volltext-in-arbeit, eba-volltext-zu-schwer, eba-volltext-waisen,
//   eba-volltext-stand, eba-geraet. Testeinstiege: plugin.testVolltextAus (kein automatischer Lauf); ctx.volltext.erzeugen(abh)
//   baut den Ablauf mit Tresor im Speicher und falschem pdf.js (tests/volltext.test.js).
// iOS-sicher: keine Node-APIs, kein Lookbehind, kein .at()/findLast/structuredClone. Web Crypto für SHA-256.

// ---------- Konstanten ----------
const ZIEL = "Unterlagen/_Volltext";
const QUELLE = "Unterlagen";
const ABRUF = "System/Daten/volltext-abruf.json";
const EINSTELLUNGEN = "System/Einstellungen.md";
const ILIAS_INDEX = "System/Daten/ilias.json";
const FASSUNG = 1;              // Aufbau der Notiz; höher → vorhandene Notizen werden nach und nach neu geschrieben
const MIN = 60e3, MB = 1048576;
const GRENZEN = {
  mobil: { mb: 25, seiten: 300, zeichen: 500000, lauf: 45e3, pdf: 120e3, abstuerze: 1 },
  pc: { mb: 80, seiten: 600, zeichen: 1000000, lauf: 120e3, pdf: 300e3, abstuerze: 2 },
};
const SEITE_ZEICHEN = 20000;    // je Seite höchstens so viele Zeichen (der Rest der Seite fällt weg)
const RUHE = 5 * MIN;           // erster Lauf erst, wenn so lange keine neue Datei im Tresor ankam
const STABIL = 60e3;            // eine PDF wird erst gelesen, wenn sie so lange unverändert ist
const TAKT = 30 * MIN;          // Durchgang, solange Obsidian offen ist
const STAPEL_PAUSE = 60e3;      // Lauf-Budget erreicht, PDFs übrig: nächster Lauf nach dieser Pause
const STAPEL_MAX = 10;          // höchstens so viele Läufe hintereinander, danach wieder im TAKT
const LUFT_SEITEN = 20, LUFT_MS = 30; // alle 20 Seiten kurz Luft für die Oberfläche
const UEBERNAHME = 80 * MIN;    // wie ilias.js und zentral.js: anderes Gerät übernimmt nach so langer Stille
const PULS = 50 * MIN;          // der Schreiber erneuert die Sperre höchstens so oft
const WAISE_ALTER = 120 * MIN;  // eigene Notiz ohne PDF erst löschen, wenn sie so lange ohne PDF ist (Sync, Verschieben)
const MASSE = 10;               // mehr als die Hälfte der Notizen und mehr als so viele auf einmal weg → nichts löschen
const L = { cache: "eba-volltext-cache", inArbeit: "eba-volltext-in-arbeit", zuSchwer: "eba-volltext-zu-schwer",
  waisen: "eba-volltext-waisen", stand: "eba-volltext-stand", geraet: "eba-geraet" };
const TEXT = {
  extern: "Kommt über deinen eigenen Abgleich.",
  fremd: "Kommt über einen anderen Weg (andere Textfassungen im Tresor).",
  aus: "Ausgeschaltet.",
  leer: "Noch keine PDFs unter Unterlagen.",
};

// ---------- Reine Helfer (ohne Obsidian, auch für Tests) ----------
const J = (v) => JSON.stringify(v == null ? "" : String(v));
const klein = (p) => String(p).toLowerCase();
const nameVon = (p) => String(p).split("/").pop();
const elternVon = (p) => { const t = String(p).split("/"); t.pop(); return t.join("/"); };
const ohnePdf = (n) => String(n).replace(/\.pdf$/i, "");
const istZiel = (p) => klein(p).indexOf(klein(ZIEL) + "/") === 0;
// PDF unter Unterlagen/, nicht in _Volltext/ und nicht in versteckten Ordnern
const istPdf = (p) => {
  const t = String(p).split("/");
  return t.length >= 2 && t[0] === QUELLE && /\.pdf$/i.test(t[t.length - 1]) && !istZiel(p) && !t.some((x) => x.charAt(0) === ".");
};
const tausender = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
const mbText = (b) => (b / MB).toFixed(1).replace(".", ",") + " MB";
// Einstellung „volltext“: fehlt, leer, „an“ oder true → an; „aus“, false, „nein“ → aus
const eingeschaltet = (v) => v == null || v === "" || !(v === false || /^(aus|false|nein|off|0)$/i.test(String(v).trim()));

// Fremdtext entschärfen, wörtlich wie der Volltext eines eigenen Uni-Abgleichs (keine Templater-Befehle, kein HTML, keine Tags,
// Links, Aufgaben, Formeln, Kommentare, Codeblöcke); „x > 0“ und „f(x) = [a, b]“ bleiben wörtlich suchbar.
const entschaerfenGrund = (text) => text.replace(/\r/g, "")
  .replace(/(\p{Ll})-\n(\p{Ll})/gu, "$1$2")
  .replace(/\\/g, "\\\\")
  .replace(/<(?=[\p{L}\/!%?])/gu, "&lt;")
  .replace(/[`$]/g, "\\$&")
  .replace(/%%/g, "\\%\\%")
  .replace(/\[\[/g, "\\[\\[").replace(/\]\(/g, "]\\(")
  .replace(/#(?=[\p{L}_]|\d+[\p{L}_\/-])/gu, "\\#")
  .split("\n").map((z) => z.trim()).filter(Boolean)
  .map((z) => "> " + z.replace(/^>/, "\\>").replace(/^(#+\s)/, "\\$1").replace(/^(\d+)\. /, "$1\\. ")
    .replace(/^([-+*]) /, "\\$1 ").replace(/\s\^([\w-]+)$/, " \\^$1").replace(/^([-=_*])(?=[-=_*\s]*$)/, "\\$1"))
  .join("\n");
// Dazu: keine anklickbaren obsidian://-Adressen (Knöpfe des Plugins) und keine Inline-Felder „Feld:: Wert“
const entschaerfen = (text) => entschaerfenGrund(text).replace(/(obsidian):\/\//gi, "$1\\://").replace(/:(?=:)/g, ":\\");
// Titel und Dateinamen in Kopfzeilen: dieselben Zeichen wie oben, ohne Zeilen
const kopfRein = (s) => String(s).replace(/[\r\n]+/g, " ").replace(/\\/g, "\\\\").replace(/<(?=[\p{L}\/!%?])/gu, "&lt;")
  .replace(/[`$^]/g, "\\$&").replace(/%%/g, "\\%\\%").replace(/\[\[/g, "\\[\\[").replace(/\]\]/g, "\\]\\]")
  .replace(/#(?=[\p{L}_]|\d+[\p{L}_\/-])/gu, "\\#");

// Text einer Seite säubern: weiches Trennzeichen und Richtungszeichen weg, getrennte Umlaute („a¨“) zusammen, NFC, Steuerzeichen
// weg, Leerzeilen zusammen
const textRein = (t) => {
  let s = String(t == null ? "" : t).replace(/\u00ad/g, "").replace(/[\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, "")
    .replace(/([aouAOU])\u00a8/g, (_, v) => v + "\u0308").replace(/\u00a8([aouAOU])/g, (_, v) => v + "\u0308");
  try { s = s.normalize("NFC"); } catch (e) { /* ohne NFC */ }
  return s.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{2,}/g, "\n").trim();
};
// Zeilen aus den Textstücken von pdf.js (getTextContent().items): Zeilenende bei hasEOL oder wenn die y-Lage um mehr als eine
// halbe Schrifthöhe von der Grundlinie der Zeile abweicht (hoch- und tiefgestellte Zeichen bleiben in der Zeile)
const seiteText = (items) => {
  const zeilen = [];
  let z = "", y = null, zh = 0;
  for (const it of items || []) {
    if (!it || typeof it.str !== "string") continue;
    const tr = Array.isArray(it.transform) ? it.transform : null;
    const ty = tr && typeof tr[5] === "number" ? tr[5] : null;
    const h = Math.abs((tr && tr[3]) || it.height || 0);
    if (z && y !== null && ty !== null && Math.abs(ty - y) > Math.max(1, Math.max(h, zh) * 0.5)) { zeilen.push(z); z = ""; y = null; zh = 0; }
    z += it.str;
    if (ty !== null && (y === null || h >= zh)) y = ty;
    zh = Math.max(zh, h);
    if (it.hasEOL) { zeilen.push(z); z = ""; y = null; zh = 0; }
  }
  if (z) zeilen.push(z);
  return textRein(zeilen.join("\n"));
};

// Kopf einer Notiz aus dem Text (nur die Felder, die dieses Skript braucht). eigen = Besitzmarke „volltext_von: plugin“.
const kopfLesen = (text) => {
  const m = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(String(text == null ? "" : text).replace(/\r\n/g, "\n"));
  if (!m) return { fm: false, typ: null, eigen: false };
  const wert = (n) => {
    const r = new RegExp("^" + n + ":[ \\t]*(.*)$", "m").exec(m[1]);
    if (!r) return null;
    const v = r[1].trim();
    if (/^".*"$/.test(v)) { try { return JSON.parse(v); } catch (e) { return v.slice(1, -1); } }
    if (/^'.*'$/.test(v)) return v.slice(1, -1).replace(/''/g, "'");
    return v;
  };
  return ausFm({ typ: wert("typ"), volltext_von: wert("volltext_von"), quelle: wert("quelle"), groesse: wert("groesse"),
    pdf_sha256: wert("pdf_sha256"), fassung: wert("fassung"), ergebnis: wert("ergebnis") });
};
// Dieselben Felder aus dem Frontmatter des metadataCache
const ausFm = (fm) => {
  if (!fm || typeof fm !== "object") return { fm: false, typ: null, eigen: false };
  const zahl = (v) => { const n = Number(v); return v === null || v === "" || isNaN(n) ? null : n; };
  return { fm: true, typ: fm.typ == null ? null : String(fm.typ), eigen: fm.volltext_von === "plugin",
    quelle: fm.quelle == null ? "" : String(fm.quelle), groesse: zahl(fm.groesse),
    sha: /^[0-9a-f]{64}$/.test(String(fm.pdf_sha256 || "")) ? String(fm.pdf_sha256) : "",
    fassung: zahl(fm.fassung) || 0, ergebnis: fm.ergebnis == null ? "" : String(fm.ergebnis) };
};

// Name der Textfassung: „<Name> (Volltext).md“, bei gleichem Namen aus einem anderen Ordner „<Name> (Volltext, <Code>).md“ mit
// dem ersten Wort des Modulordners (dann „<Code> 2“, „<Code> 3“ …). belegt(pfad) → true, wenn dort schon etwas liegt.
const zielName = (pdfPfad, belegt) => {
  const name = ohnePdf(nameVon(pdfPfad));
  const erst = ZIEL + "/" + name + " (Volltext).md";
  if (!belegt(erst)) return erst;
  const t = String(pdfPfad).split("/");
  const code = (t.length > 2 ? t[1].split(" ")[0] : "") || QUELLE;
  for (let i = 1; i < 1000; i++) {
    const p = ZIEL + "/" + name + " (Volltext, " + code + (i > 1 ? " " + i : "") + ").md";
    if (!belegt(p)) return p;
  }
  return null;
};

// Plan eines Laufs (rein). pdfs [{ pfad, groesse, mtime }], eigene [{ pfad, quelle, groesse, sha, fassung, ergebnis }] (nur Notizen
// mit Besitzmarke in _Volltext/), hashes { <pdf-Pfad klein>: sha } (Prüfsumme der PDF, wie sie jetzt ist, wenn bekannt),
// belegt [Pfade in _Volltext/], grenze (GRENZEN.mobil|pc), mobil, ausgelassen(pdf) → true (auf diesem Gerät zu schwer).
// → { aufgaben [{ art: neu|aendern|fassung|zu-gross, pdf, ziel }], umbenennen [{ notiz, pdf, ziel }], waisen [Notiz],
//     doppelt [Notiz], warten [pdf], aktuell }
const planen = (x) => {
  const pdfs = (x.pdfs || []).slice().sort((a, b) => (a.pfad < b.pfad ? -1 : a.pfad > b.pfad ? 1 : 0));
  const hashes = x.hashes || {};
  const grenze = x.grenze || GRENZEN.pc;
  const belegt = {};
  for (const p of x.belegt || []) belegt[klein(p)] = true;
  const plan = { aufgaben: [], umbenennen: [], waisen: [], doppelt: [], warten: [], aktuell: 0 };
  // je PDF genau eine eigene Notiz; weitere mit derselben Quelle sind Doppel (z. B. Konfliktkopien)
  const nachQuelle = {};
  const eigene = (x.eigene || []).slice().sort((a, b) => (a.pfad.length - b.pfad.length) || (a.pfad < b.pfad ? -1 : 1));
  for (const n of eigene) {
    const k = klein(n.quelle || "");
    if (!k) { plan.waisen.push(n); continue; }
    if (nachQuelle[k]) plan.doppelt.push(n); else nachQuelle[k] = n;
  }
  const pdfDa = {};
  for (const p of pdfs) pdfDa[klein(p.pfad)] = p;
  const ohneNotiz = [];
  const aufgabe = (art, pdf, ziel) => {
    if (x.ausgelassen && x.ausgelassen(pdf)) { plan.warten.push(pdf); return; }
    if (pdf.groesse > grenze.mb * MB) {
      if (x.mobil) { plan.warten.push(pdf); return; }
      art = "zu-gross";
    }
    plan.aufgaben.push({ art, pdf, ziel });
  };
  for (const p of pdfs) {
    const n = nachQuelle[klein(p.pfad)];
    if (!n) { ohneNotiz.push(p); continue; }
    const h = hashes[klein(p.pfad)];
    if (n.groesse !== p.groesse || (h && n.sha && h !== n.sha)) aufgabe("aendern", p, n.pfad);
    else if ((n.fassung || 0) < FASSUNG) aufgabe("fassung", p, n.pfad);
    else plan.aktuell++;
  }
  // Notizen ohne PDF: Partner gleicher Größe und Prüfsumme (umbenannt oder verschoben) → umbenennen, sonst Waise
  const frei = ohneNotiz.slice();
  for (const k of Object.keys(nachQuelle)) {
    if (pdfDa[k]) continue;
    const n = nachQuelle[k];
    let partner = -1;
    for (let i = 0; i < frei.length && partner < 0; i++) {
      const h = hashes[klein(frei[i].pfad)];
      if (frei[i].groesse === n.groesse && n.sha && h === n.sha) partner = i;
    }
    if (partner < 0) { plan.waisen.push(n); continue; }
    const pdf = frei.splice(partner, 1)[0];
    const name = ZIEL + "/" + ohnePdf(nameVon(pdf.pfad)) + " (Volltext).md";
    const ziel = klein(name) === klein(n.pfad) ? n.pfad : zielName(pdf.pfad, (q) => !!belegt[klein(q)] && klein(q) !== klein(n.pfad));
    if (ziel) belegt[klein(ziel)] = true;
    plan.umbenennen.push({ notiz: n, pdf, ziel: ziel || n.pfad });
  }
  for (const p of frei) {
    const ziel = zielName(p.pfad, (q) => !!belegt[klein(q)]);
    if (!ziel) continue;
    belegt[klein(ziel)] = true;
    aufgabe("neu", p, ziel);
  }
  // Reihenfolge: neue und geänderte zuerst, kleine vor großen (schnell viele durchsuchbar), neue Fassung zuletzt
  const rang = (a) => (a.art === "fassung" ? 1 : 0);
  plan.aufgaben.sort((a, b) => (rang(a) - rang(b)) || (a.pdf.groesse - b.pdf.groesse) || (a.pdf.pfad < b.pdf.pfad ? -1 : 1));
  return plan;
};

// Text der Notiz. o: { titel, quelle, seiten, groesse, sha, ergebnis, dateiFm, unterlageFm, dateiLink, unterlageLink,
// seitenLink(nr), seitenTexte [[nr, text]] (oder fertige Seitenkarten bloecke), hinweis }
const notizText = (o) => {
  const z = ["---", "typ: volltext", "volltext_von: plugin", "fassung: " + FASSUNG, "datei: " + J("[[" + o.dateiFm + "]]")];
  if (o.unterlageFm) z.push("unterlage: " + J("[[" + o.unterlageFm + "]]"));
  z.push("quelle: " + J(o.quelle));
  if (o.seiten != null) z.push("seiten: " + o.seiten);
  z.push("groesse: " + o.groesse);
  if (o.sha) z.push("pdf_sha256: " + J(o.sha));
  z.push("ergebnis: " + o.ergebnis, "cssclasses:", "  - eba-s-begleitnotiz", "  - eba-s-volltext", "---", "",
    "# " + kopfRein(o.titel) + " · Volltext", "",
    "Automatisch erzeugt, nicht bearbeiten. " + (o.unterlageLink ? "Zur Unterlage: " + o.unterlageLink + " · " : "") + "PDF: " + o.dateiLink, "");
  if (o.hinweis) z.push(o.hinweis, "");
  const teile = o.bloecke || (o.seitenTexte || []).map((s) => "> [!eba-quelle]- " + o.seitenLink(s[0]) + "\n" + entschaerfen(s[1]));
  if (teile.length) z.push(teile.join("\n\n"), "");
  return z.join("\n");
};
// Hinweis-Karte je Ergebnis
const hinweisText = (ergebnis, x) => {
  x = x || {};
  if (ergebnis === "kein-text") return "> [!eba-info] Kein Text gefunden\n> Die PDF hat keine Textebene, zum Beispiel ein Scan oder Foto. Die Suche findet nur den Titel und deine Notizen.";
  if (ergebnis === "geschuetzt") return "> [!eba-info] Geschützt\n> Die PDF ist mit einem Passwort geschützt. Ohne Passwort lässt sich kein Text lesen.";
  if (ergebnis === "nicht-lesbar") return "> [!eba-info] Nicht lesbar\n> Die PDF ließ sich nicht öffnen. Ist sie beschädigt, hilft es, sie neu herunterzuladen.";
  if (ergebnis === "zu-gross") return "> [!eba-info] Zu groß\n> Die PDF hat " + mbText(x.groesse || 0) + ". Textfassungen entstehen für PDFs bis " + GRENZEN.pc.mb + " MB.";
  if (ergebnis === "gekuerzt") {
    const teile = [];
    if (x.bisSeite && x.seiten && x.bisSeite < x.seiten) teile.push("Text bis Seite " + x.bisSeite + " von " + x.seiten + ".");
    if (x.zeichen) teile.push("Höchstens " + tausender(x.zeichen) + " Zeichen.");
    if (x.seiteGekuerzt) teile.push("Sehr lange Seiten sind gekürzt.");
    return "> [!eba-info] Gekürzt\n> " + (teile.join(" ") || "Ein Teil des Textes fehlt.");
  }
  return "";
};

// Bringt ein eigener Abgleich oder Server die Textfassungen? Eine Regel für alle Quellen: eba.quelleExtern("volltext", …)
// (Liste „quellen_extern“ in den Einstellungen, ohne Liste der eigene Uni-Abgleich). Ohne eba.js: nicht extern.
const quelleExternAus = (eba, existiert, einstellungen) => {
  try { return !!(eba && typeof eba.quelleExtern === "function" && eba.quelleExtern("volltext", existiert, einstellungen)); } catch (e) { return false; }
};

module.exports = function (ctx) {
  const app = window.app;
  const obs = ctx.obsidian || {};
  const plugin = () => ctx.plugin || {};

  // Ablauf mit austauschbaren Teilen (Tests: Tresor im Speicher, falsches pdf.js, eigene Uhr). abh:
  //   io: { pdfs() → [{ pfad, groesse, mtime }], notizen() → [{ pfad, fm | null }] (Markdown unter Unterlagen/ mit typ: volltext
  //       oder in _Volltext/), belegt() → [Pfade in _Volltext/], existiert(p), lesenText(p), lesenBinaer(p) → Uint8Array,
  //       anlegen(p, text), aendern(p, text), umbenennen(alt, neu), papierkorb(p), schreiben(p, text) (Sperre),
  //       link(ziel, von, subpath, alias) → Markdown-Link | null, linktext(ziel, von) → Text für [[…]] | null }
  //   lokal(k, v?), pdfjs() → pdf.js, sha256(bytes) → hex, einstellungen() → {}, extern() → bool,
  //   jetzt() → Date, mobil, version, geraetId(), pause(ms), wecker(ms)? → { promise, aus() } (Frist für pdf.js),
  //   geaendert(ereignis)?, lese (bleibend: { pfad } während des Lesens)
  const erzeugen = (abh) => {
    const io = abh.io;
    const lokal = abh.lokal;
    const ms = () => abh.jetzt().getTime();
    const grenze = abh.mobil ? GRENZEN.mobil : GRENZEN.pc;
    const lese = abh.lese || { pfad: null };
    const melden = (x) => { try { if (abh.geaendert) abh.geaendert(x); } catch (e) { /* Hörer egal */ } };
    // Ein Schreiber: die gemeinsame Abrufer-Sperre (sperre.js) mit Computer-Vorrang
    const sperre = (abh.sperre || (ctx.user && ctx.user.sperre)).erzeugen({ io: { lesen: (p) => io.lesenText(p), schreiben: (p, t) => io.schreiben(p, t) },
      pfad: ABRUF, geraetId: abh.geraetId, jetzt: abh.jetzt, mobil: !!abh.mobil, uebernahme: UEBERNAHME, puls: PULS, computerVorrang: true });
    const geschrieben = {};           // in dieser Sitzung selbst geschriebene Pfade (klein); ihr Anlegen zählt nicht als Sync
    let laeuft = false, stopp = false, fortschritt = null, letzteArt = null;

    // ----- gerätelokaler Stand -----
    const objekt = (k) => { const v = lokal(k); return v && typeof v === "object" && !Array.isArray(v) ? v : {}; };
    const stand = () => Object.assign({ zuletzt: "", fehler: "", anderes: false, stapel: 0 }, objekt(L.stand));
    const standSetzen = (x) => lokal(L.stand, Object.assign(stand(), x));
    const zuSchwer = () => objekt(L.zuSchwer);
    const ausgelassen = (pdf) => {
      const z = zuSchwer()[pdf.pfad];
      if (!z || z.groesse !== pdf.groesse || z.version !== abh.version) return false;
      return z.grund !== "absturz" || (z.abstuerze || 0) >= grenze.abstuerze;
    };
    const auslassen = (pdf, grund) => {
      const alle = {}, vorher = zuSchwer(), z = vorher[pdf.pfad];
      for (const k of Object.keys(vorher)) if (vorher[k] && vorher[k].version === abh.version) alle[k] = vorher[k];
      const gleich = z && z.groesse === pdf.groesse && z.version === abh.version;
      alle[pdf.pfad] = { groesse: pdf.groesse, version: abh.version, grund, abstuerze: (gleich ? z.abstuerze || 0 : 0) + (grund === "absturz" ? 1 : 0) };
      lokal(L.zuSchwer, alle);
    };
    // Merker aus dem letzten Start: stand er noch da, hat die App beim Lesen aufgehört. Im Hintergrund oder beim Beenden zählt
    // das nicht (iOS beendet Apps im Hintergrund jederzeit); läuft das Lesen in dieser Sitzung noch (Hot-Reload), auch nicht.
    const nachAbsturz = () => {
      const m = lokal(L.inArbeit);
      if (!m || typeof m !== "object") return null;
      if (lese.pfad) return null;
      lokal(L.inArbeit, null);
      if (m.hintergrund || m.beendet || typeof m.pfad !== "string") return null;
      if (m.version === abh.version) auslassen({ pfad: m.pfad, groesse: m.groesse }, "absturz");
      return m.pfad;
    };
    const merkerSetzen = (x) => { const m = lokal(L.inArbeit); if (m && typeof m === "object") lokal(L.inArbeit, Object.assign({}, m, x)); };

    // ----- Tresor lesen -----
    // nurFremde: selbst geschriebene Notizen nicht nachlesen (Prüfung vor jeder PDF)
    const notizenLesen = async (nurFremde) => {
      const eigene = [], fremde = [];
      for (const n of io.notizen()) {
        let k = ausFm(n.fm);
        if (!k.fm && nurFremde && geschrieben[klein(n.pfad)]) continue;
        // noch nicht im metadataCache (gerade angelegt oder per Sync angekommen): Kopf aus dem Text
        if (!k.fm && istZiel(n.pfad)) { try { k = kopfLesen(await io.lesenText(n.pfad)); } catch (e) { k = { fm: false, eigen: false }; } }
        if (!k.fm && !istZiel(n.pfad)) continue;
        if (k.eigen && istZiel(n.pfad)) eigene.push(Object.assign({ pfad: n.pfad }, k));
        else if (istZiel(n.pfad) || k.typ === "volltext") { if (!k.eigen) fremde.push(n.pfad); }
      }
      return { eigene, fremde };
    };
    const einstellungen = () => { try { return abh.einstellungen() || {}; } catch (e) { return {}; } };
    const an = () => eingeschaltet(einstellungen().volltext);
    const extern = () => { try { return !!abh.extern(); } catch (e) { return false; } };
    // Prüfsummen aus ilias.json (nur, wenn die Größe noch stimmt) und aus dem Gerätespeicher (Größe und Änderungszeit gleich)
    const iliasHashes = async () => {
      const aus = {};
      try {
        const t = io.existiert(ILIAS_INDEX) ? await io.lesenText(ILIAS_INDEX) : null;
        const d = t ? JSON.parse(t).dateien : null;
        if (d && typeof d === "object") for (const k of Object.keys(d)) {
          const e = d[k];
          if (e && typeof e.pfad === "string" && /^[0-9a-f]{64}$/.test(String(e.sha256 || "")) && !e.geloescht) aus[klein(e.pfad)] = { sha: e.sha256, groesse: e.groesse };
        }
      } catch (e) { /* ohne ilias.json */ }
      return aus;
    };
    const cache = () => objekt(L.cache);
    const hashAus = (pdf, ilias, c) => {
      const i = ilias[klein(pdf.pfad)];
      if (i && i.groesse === pdf.groesse) return i.sha;
      const e = c[pdf.pfad];
      return e && e[0] === pdf.groesse && e[1] === pdf.mtime ? e[2] : "";
    };
    const hashen = async (pfad) => {
      const b = await io.lesenBinaer(pfad);
      return b ? abh.sha256(b) : "";
    };

    // ----- Auslesen einer PDF -----
    // → { art: "text" | "kein-text" | "geschuetzt" | "nicht-lesbar" | "gekuerzt" | "zu-viele-seiten" | "zu-viel-text" | "zeit" |
    //     "stopp" | "fehler", seiten, seitenTexte [[nr, text]], bisSeite, zeichen, seiteGekuerzt, fehler }
    // Ein Versprechen von pdf.js, das nie zurückkommt (z. B. eine bösartige PDF), hält den Lauf nicht fest: nach der Frist
    // Fehler „zeit“. abh.wecker(ms) → { promise, aus() } (fehlt in Tests: ohne Frist)
    const ZEIT = "volltext-zeit";
    const mitFrist = async (p, bis) => {
      const rest = bis - ms();
      if (rest <= 0) throw new Error(ZEIT);
      const w = abh.wecker ? abh.wecker(rest) : null;
      if (!w) return p;
      try { return await Promise.race([p, w.promise.then(() => { throw new Error(ZEIT); })]); } finally { w.aus(); }
    };
    const istZeit = (e) => !!e && e.message === ZEIT;
    const auslesen = async (bytes, frist) => {
      let doc = null, laden = null;
      const r = { art: "text", seiten: null, seitenTexte: [], bisSeite: 0, zeichen: 0, seiteGekuerzt: false };
      try {
        const pdfjs = await abh.pdfjs();
        try {
          laden = pdfjs.getDocument({ data: bytes, isEvalSupported: false, disableFontFace: true, useSystemFonts: false, verbosity: 0 });
          doc = await mitFrist(laden.promise, frist);
        } catch (e) {
          const n = String((e && e.name) || "");
          r.art = istZeit(e) ? "zeit" : n === "PasswordException" ? "geschuetzt" : /InvalidPDF|MissingPDF|FormatError|UnknownError/.test(n) ? "nicht-lesbar" : "fehler";
          r.fehler = n || String((e && e.message) || e).slice(0, 80);
          return r;
        }
        r.seiten = doc.numPages;
        if (abh.mobil && doc.numPages > grenze.seiten) { r.art = "zu-viele-seiten"; return r; }
        const bis = Math.min(doc.numPages, grenze.seiten);
        let summe = 0;
        for (let i = 1; i <= bis; i++) {
          if (stopp) { r.art = "stopp"; return r; }
          if (ms() > frist) { r.art = "zeit"; return r; }
          // eine kaputte Seite kostet nur diese Seite
          let t = "", seite = null;
          try { seite = await mitFrist(doc.getPage(i), frist); t = seiteText((await mitFrist(seite.getTextContent(), frist)).items); }
          catch (e) { if (istZeit(e)) { r.art = "zeit"; return r; } t = ""; }
          finally { try { if (seite) seite.cleanup(); } catch (e) { /* egal */ } }
          if (t.length > SEITE_ZEICHEN) { t = t.slice(0, SEITE_ZEICHEN); r.seiteGekuerzt = true; }
          if (t) {
            if (summe + t.length > grenze.zeichen) {
              if (abh.mobil) { r.art = "zu-viel-text"; return r; }
              r.zeichen = grenze.zeichen;
              break;
            }
            summe += t.length;
            r.seitenTexte.push([i, t]);
          }
          r.bisSeite = i;
          if (i % LUFT_SEITEN === 0) await abh.pause(LUFT_MS);
        }
        if (!r.seitenTexte.length) r.art = "kein-text";
        else if (r.bisSeite < doc.numPages || r.zeichen || r.seiteGekuerzt) r.art = "gekuerzt";
        return r;
      } catch (e) {
        r.art = "fehler";
        r.fehler = String((e && e.name) || (e && e.message) || e).slice(0, 80);
        return r;
      } finally {
        try { if (doc) await doc.destroy(); else if (laden && laden.destroy) await laden.destroy(); } catch (e) { /* schon zu */ }
      }
    };

    // ----- Notiz bauen und schreiben -----
    const notizBauen = (pdf, ziel, sha, r, ueber) => {
      const name = ohnePdf(nameVon(pdf.pfad));
      const unterlage = elternVon(pdf.pfad) + "/" + name + ".md";
      const mitUnterlage = io.existiert(unterlage);
      const ergebnis = r.art;
      return notizText(Object.assign({
        titel: name, quelle: pdf.pfad, seiten: r.seiten, groesse: pdf.groesse, sha, ergebnis,
        dateiFm: io.linktext(pdf.pfad, ziel) || nameVon(pdf.pfad),
        unterlageFm: mitUnterlage ? io.linktext(unterlage, ziel) || name : "",
        dateiLink: io.link(pdf.pfad, ziel, "", "") || "[[" + nameVon(pdf.pfad) + "]]",
        unterlageLink: mitUnterlage ? io.link(unterlage, ziel, "", "") || "[[" + name + "]]" : "",
        seitenLink: (nr) => io.link(pdf.pfad, ziel, "#page=" + nr, "S. " + nr) || "[[" + nameVon(pdf.pfad) + "#page=" + nr + "|S. " + nr + "]]",
        seitenTexte: r.seitenTexte || [],
        hinweis: hinweisText(ergebnis, { groesse: pdf.groesse, seiten: r.seiten, bisSeite: r.bisSeite, zeichen: r.zeichen, seiteGekuerzt: r.seiteGekuerzt }),
      }, ueber || {}));
    };
    // Liegt am Pfad eine Datei, muss sie die Besitzmarke tragen (im Text geprüft). → "frei" | "eigen" | "fremd"
    const besitz = async (p) => {
      if (!io.existiert(p)) return "frei";
      let t = null;
      try { t = await io.lesenText(p); } catch (e) { t = null; }
      return t != null && kopfLesen(t).eigen ? "eigen" : "fremd";
    };
    const schreiben = async (ziel, text, b) => {
      const z = await besitz(ziel);
      if (z === "fremd") { b.fremd = true; return false; }
      geschrieben[klein(ziel)] = true;
      if (z === "eigen") { if ((await io.lesenText(ziel)) !== text) await io.aendern(ziel, text); }
      else await io.anlegen(ziel, text);
      return true;
    };
    // Umbenannte oder verschobene PDF: Notiz mitnehmen (Name, Quelle, Links); Seitentexte und Hinweis bleiben, wie sie sind
    const umziehen = async (u, b) => {
      if ((await besitz(u.notiz.pfad)) !== "eigen") { b.fremd = true; return false; }
      if (klein(u.ziel) !== klein(u.notiz.pfad)) {
        if ((await besitz(u.ziel)) !== "frei") return false;
        geschrieben[klein(u.ziel)] = true;
        await io.umbenennen(u.notiz.pfad, u.ziel);
      }
      const alt = String((await io.lesenText(u.ziel)) || "").replace(/\r\n/g, "\n");
      const k = kopfLesen(alt);
      if (!k.eigen) { b.fremd = true; return false; }
      const bloecke = [];
      const re = /^> \[!eba-quelle\]- [^\n]*?#page=(\d+)[^\n]*\n((?:>[^\n]*(?:\n|$))*)/gm;
      let m;
      while ((m = re.exec(alt))) {
        const nr = m[1];
        bloecke.push("> [!eba-quelle]- " + (io.link(u.pdf.pfad, u.ziel, "#page=" + nr, "S. " + nr) || "[[" + nameVon(u.pdf.pfad) + "#page=" + nr + "|S. " + nr + "]]") + "\n" + m[2].replace(/\n+$/, ""));
      }
      const hinweis = (/\n(> \[!eba-info\][^\n]*(?:\n>[^\n]*)*)/.exec(alt) || [])[1] || "";
      const seiten = Number((/^seiten: (\d+)$/m.exec(alt) || [])[1]) || null;
      return schreiben(u.ziel, notizBauen(u.pdf, u.ziel, k.sha, { art: k.ergebnis || "text", seiten }, { bloecke, hinweis }), b);
    };

    // ----- Ein Lauf -----
    // o: { manuell, hier (Sperre herholen) } → Bericht { art, neu, aktuell, warten, rest, umbenannt, geloescht, fehler }
    const lauf = async (o) => {
      o = o || {};
      if (laeuft) return { art: "laeuft" };
      laeuft = true; stopp = false;
      const b = { art: "ok", neu: 0, aktuell: 0, warten: 0, rest: 0, umbenannt: 0, geloescht: 0, ohneText: 0, fehler: 0, fremd: false, manuell: !!o.manuell };
      const start = ms();
      let gemeldet = false;
      fortschritt = null;
      try {
        if (!an()) { b.art = "aus"; return b; }
        if (extern()) { b.art = "extern"; return b; }
        const nz = await notizenLesen();
        if (nz.fremde.length) { b.art = "fremd"; return b; }
        const pdfs = io.pdfs();
        if (!pdfs.length && !nz.eigene.length) { b.art = "leer"; return b; }
        const s = await sperre.pruefen();
        if (s.anderes && !o.hier) { b.art = "anderes-geraet"; standSetzen({ anderes: true }); return b; }
        melden({ art: "start", manuell: !!o.manuell });
        gemeldet = true;
        // Prüfsummen: bekannt aus ilias.json/Gerätespeicher; neu berechnet nur, wo sie entscheidet (gleiche Größe, aber auf diesem
        // Gerät geändert, oder Partner einer Notiz ohne PDF)
        const ilias = await iliasHashes(), c = cache();
        const hashes = {};
        for (const p of pdfs) { const h = hashAus(p, ilias, c); if (h) hashes[klein(p.pfad)] = h; }
        const nachQuelle = {};
        for (const n of nz.eigene) nachQuelle[klein(n.quelle)] = n;
        const pdfDa = {};
        for (const p of pdfs) pdfDa[klein(p.pfad)] = true;
        const waisenGroessen = {};
        for (const n of nz.eigene) if (!pdfDa[klein(n.quelle)]) waisenGroessen[n.groesse] = true;
        for (const p of pdfs) {
          if (hashes[klein(p.pfad)] || p.groesse > grenze.mb * MB) continue;
          const n = nachQuelle[klein(p.pfad)], e = c[p.pfad];
          const pruefen = n ? n.groesse === p.groesse && e && e[0] === p.groesse : waisenGroessen[p.groesse];
          if (!pruefen) {
            // erste Sicht auf diesem Gerät: Notiz gilt als aktuell, ihre Prüfsumme als Stand der PDF
            if (n && n.groesse === p.groesse && n.sha) c[p.pfad] = [p.groesse, p.mtime, n.sha];
            continue;
          }
          if (ms() - start > grenze.lauf) break;
          try { const h = await hashen(p.pfad); if (h) { hashes[klein(p.pfad)] = h; c[p.pfad] = [p.groesse, p.mtime, h]; } } catch (e) { /* nächster Lauf */ }
        }
        // Gerätespeicher: nur PDFs, die es noch gibt
        const sauber = {};
        for (const k of Object.keys(c)) if (pdfDa[klein(k)]) sauber[k] = c[k];
        lokal(L.cache, sauber);
        const plan = planen({ pdfs, eigene: nz.eigene, hashes, belegt: io.belegt(), grenze, mobil: !!abh.mobil, ausgelassen });
        b.aktuell = plan.aktuell; b.warten = plan.warten.length;
        // Waisen erst nach WAISE_ALTER (gemerkt auf diesem Gerät), Doppel sofort; Massenwegfall → nichts löschen
        const w = objekt(L.waisen), wNeu = {};
        const loeschen = plan.doppelt.slice();
        for (const n of plan.waisen) {
          wNeu[n.pfad] = typeof w[n.pfad] === "number" ? w[n.pfad] : ms();
          if (ms() - wNeu[n.pfad] >= WAISE_ALTER) loeschen.push(n);
        }
        const waisenAlt = loeschen.length - plan.doppelt.length;
        if (waisenAlt > MASSE && waisenAlt * 2 > nz.eigene.length) { loeschen.length = plan.doppelt.length; b.massenwegfall = true; }
        const etwas = plan.aufgaben.length || plan.umbenennen.length || loeschen.length;
        // Sperre: wer schreibt, hält sie (auch ohne Arbeit, damit andere Geräte nicht doppelt anfangen)
        if (!(await sperre.nehmen({ erzwingen: !!o.hier }))) { b.art = "anderes-geraet"; standSetzen({ anderes: true }); return b; }
        standSetzen({ anderes: false });
        if (!etwas) { lokal(L.waisen, wNeu); b.art = "aktuell"; return b; }
        for (const u of plan.umbenennen) {
          if (stopp || b.fremd) break;
          try { if (await umziehen(u, b)) b.umbenannt++; } catch (e) { b.fehler++; }
        }
        for (const n of loeschen) {
          if (stopp || b.fremd) break;
          if ((await besitz(n.pfad)) !== "eigen") { b.fremd = true; break; }
          try { await io.papierkorb(n.pfad); b.geloescht++; delete wNeu[n.pfad]; } catch (e) { b.fehler++; }
        }
        lokal(L.waisen, wNeu);
        // Aufgaben bis zum Budget; die erste PDF eines Laufs immer
        const gesamt = plan.aufgaben.length;
        let erledigt = 0;
        for (const a of plan.aufgaben) {
          if (stopp || b.fremd) break;
          if (erledigt > 0 && ms() - start > grenze.lauf) break;
          if ((await notizenLesen(true)).fremde.length) { b.fremd = true; break; }
          fortschritt = { erledigt, gesamt };
          melden({ art: "fortschritt", erledigt, gesamt });
          const alter = ms() - a.pdf.mtime;
          if (alter >= 0 && alter < STABIL) { erledigt++; b.rest++; continue; }
          if (a.art === "zu-gross") {
            const t = notizBauen(a.pdf, a.ziel, "", { art: "zu-gross", seiten: null });
            if (await schreiben(a.ziel, t, b)) b.ohneText++;
            erledigt++;
            continue;
          }
          // Lesefehler (z. B. Datei noch nicht ganz da) → nächster Lauf, ohne Absturz-Zähler
          let bytes = null, sha = "", r;
          try { bytes = await io.lesenBinaer(a.pdf.pfad); } catch (e) { bytes = null; }
          if (!bytes) { erledigt++; b.rest++; continue; }
          lokal(L.inArbeit, { pfad: a.pdf.pfad, groesse: a.pdf.groesse, version: abh.version });
          lese.pfad = a.pdf.pfad;
          try {
            sha = await abh.sha256(bytes);
            r = await auslesen(bytes, ms() + grenze.pdf);
          } catch (e) {
            r = { art: "fehler", fehler: String((e && e.message) || e).slice(0, 80) };
          } finally {
            bytes = null;
            lese.pfad = null;
            lokal(L.inArbeit, null);
          }
          if (r.art === "stopp") break;
          erledigt++;
          if (r.art === "zu-viele-seiten" || r.art === "zu-viel-text" || r.art === "zeit") {
            auslassen(a.pdf, r.art === "zeit" ? "zeit" : abh.mobil ? "computer" : r.art);
            b.warten++;
            continue;
          }
          if (r.art === "fehler") { auslassen(a.pdf, "absturz"); b.fehler++; standSetzen({ fehler: r.fehler || "fehler" }); continue; }
          if (await schreiben(a.ziel, notizBauen(a.pdf, a.ziel, sha, r), b)) {
            const cc = cache();
            cc[a.pdf.pfad] = [a.pdf.groesse, a.pdf.mtime, sha];
            lokal(L.cache, cc);
            if (r.art === "text" || r.art === "gekuerzt") b.neu++; else b.ohneText++;
          }
          // hat inzwischen ein anderes Gerät übernommen (Computer-Vorrang), hört dieses auf
          if (!(await sperre.puls())) { b.abgeloest = true; break; }
        }
        b.rest += plan.aufgaben.length - erledigt;
        if (b.fremd) b.art = "fremd";
        else if (stopp) b.art = "gestoppt";
        return b;
      } catch (e) {
        b.art = "fehler";
        b.fehlerText = String((e && e.message) || e).slice(0, 200);
        return b;
      } finally {
        laeuft = false;
        fortschritt = null;
        b.dauer = ms() - start;
        if (["aus", "extern", "fremd", "leer"].indexOf(b.art) < 0) standSetzen({ zuletzt: abh.jetzt().toISOString(), fehler: b.art === "fehler" ? b.fehlerText : "" }); // Fehler bleibt bis zum nächsten Lauf ohne
        // „fertig“ nur nach einem begonnenen Lauf oder wenn sich der Stand ändert (aus, extern, fremd …), nicht alle 30 Min.
        if (gemeldet || b.art !== letzteArt) melden({ art: "fertig", manuell: !!o.manuell, bericht: b });
        letzteArt = b.art;
      }
    };

    // ----- Stand für die Oberfläche (ohne Datei zu lesen: aus metadataCache und Gerätespeicher) -----
    const status = () => {
      const s = { an: an(), extern: extern(), fremd: false, laeuft, anderes: !!stand().anderes, pdfs: 0, durchsuchbar: 0, ohneText: 0,
        offen: 0, warten: 0, zuletzt: stand().zuletzt, fortschritt: fortschritt ? Object.assign({}, fortschritt) : null, text: "" };
      const eigene = [];
      for (const n of io.notizen()) {
        const k = ausFm(n.fm);
        if (k.eigen && istZiel(n.pfad)) eigene.push(Object.assign({ pfad: n.pfad }, k));
        else if (k.fm && (istZiel(n.pfad) || k.typ === "volltext")) s.fremd = true;
      }
      const pdfs = io.pdfs();
      s.pdfs = pdfs.length;
      const c = cache(), hashes = {};
      for (const p of pdfs) { const e = c[p.pfad]; if (e && e[0] === p.groesse && e[1] === p.mtime) hashes[klein(p.pfad)] = e[2]; }
      const plan = planen({ pdfs, eigene, hashes, belegt: eigene.map((n) => n.pfad), grenze, mobil: !!abh.mobil, ausgelassen });
      const daNeu = {};
      for (const a of plan.aufgaben) daNeu[klein(a.pdf.pfad)] = true;
      for (const n of eigene) {
        if (!pdfs.some((p) => klein(p.pfad) === klein(n.quelle)) || daNeu[klein(n.quelle)]) continue;
        if (n.ergebnis === "text" || n.ergebnis === "gekuerzt") s.durchsuchbar++; else s.ohneText++;
      }
      s.offen = plan.aufgaben.filter((a) => a.art !== "fassung").length;
      s.warten = plan.warten.length;
      const zahl = (n, eins, mehr) => n + " " + (n === 1 ? eins : mehr);
      if (s.extern) s.text = TEXT.extern;
      else if (s.fremd) s.text = TEXT.fremd;
      else if (!s.an) s.text = TEXT.aus;
      else if (laeuft && fortschritt) s.text = "Liest " + (fortschritt.erledigt + 1) + " von " + fortschritt.gesamt + " PDFs …";
      else if (!s.pdfs) s.text = TEXT.leer;
      else {
        s.text = zahl(s.durchsuchbar, "PDF", "PDFs") + " durchsuchbar" + (s.ohneText ? ", " + s.ohneText + " ohne Text" : "") + ".";
        if (s.offen) s.text += " " + zahl(s.offen, "folgt", "folgen") + ".";
        if (s.warten) s.text += abh.mobil ? " " + zahl(s.warten, "wartet", "warten") + " auf einen Computer." : " " + zahl(s.warten, "PDF ließ", "PDFs ließen") + " sich nicht lesen.";
      }
      // Gemeinsame Form der Quellen (quellen.js): zustand, geprueft (letzter Lauf ohne Fehler), fehler, fehlerZeit, warnungen
      const st = stand();
      s.zustand = s.extern ? "extern" : s.fremd ? "fremd" : !s.an ? "aus" : laeuft ? "laeuft" : st.fehler ? "fehler" : s.anderes ? "anderes-geraet" : "an";
      s.geprueft = st.fehler ? "" : st.zuletzt;
      s.fehler = st.fehler ? "Der letzte Durchgang brach ab, neuer Versuch beim nächsten." : "";
      s.fehlerZeit = st.fehler ? st.zuletzt : "";
      s.warnungen = [];
      return s;
    };

    return {
      lauf, status, nachAbsturz, merkerSetzen, sperre,
      stoppen: () => { stopp = true; },
      get laeuft() { return laeuft; },
      eigenGeschrieben: (p) => !!geschrieben[klein(p)],
    };
  };

  // ---------- Anschluss an Obsidian ----------
  const lokalObs = (k, v) => {
    if (v === undefined) { try { return app.loadLocalStorage(k) || null; } catch (e) { return null; } }
    app.saveLocalStorage(k, v == null ? null : v);
    return v;
  };
  const geraetId = () => {
    if (ctx.zentral && typeof ctx.zentral.geraetId === "function") return ctx.zentral.geraetId();
    let id = lokalObs(L.geraet);
    if (!id || typeof id !== "string") {
      const z = new Uint8Array(6);
      crypto.getRandomValues(z);
      id = "g-" + Array.prototype.map.call(z, (x) => x.toString(16).padStart(2, "0")).join("");
      lokalObs(L.geraet, id);
    }
    return id;
  };
  const sha256 = async (bytes) => {
    const h = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    let s = "";
    for (let i = 0; i < h.length; i++) s += h[i].toString(16).padStart(2, "0");
    return s;
  };
  const obsidianIo = () => {
    const V = app.vault, M = app.metadataCache;
    const datei = (p) => { const f = V.getAbstractFileByPath(p); return f && !f.children ? f : null; };
    const ordnerAnlegen = async (p) => {
      let a = "";
      for (const t of String(p || "").split("/").filter(Boolean)) {
        a = a ? a + "/" + t : t;
        if (V.getAbstractFileByPath(a)) continue;
        try { await V.createFolder(a); } catch (e) { if (!V.getAbstractFileByPath(a)) throw e; }
      }
    };
    const existiert = (p) => {
      if (V.getAbstractFileByPath(p)) return true;
      const o = V.getAbstractFileByPath(elternVon(p)), n = klein(nameVon(p));
      return !!o && !!o.children && o.children.some((k) => klein(k.name) === n);
    };
    return {
      pdfs: () => V.getFiles().filter((f) => istPdf(f.path)).map((f) => ({ pfad: f.path, groesse: f.stat.size, mtime: f.stat.mtime })),
      notizen: () => V.getMarkdownFiles().filter((f) => f.path.indexOf(QUELLE + "/") === 0).map((f) => {
        const c = M.getFileCache(f);
        return { pfad: f.path, fm: c ? c.frontmatter || {} : null };
      }).filter((n) => istZiel(n.pfad) || (n.fm && n.fm.typ === "volltext")),
      belegt: () => { const o = V.getAbstractFileByPath(ZIEL); return o && o.children ? o.children.map((k) => k.path) : []; },
      existiert,
      lesenText: async (p) => { const f = datei(p); return f ? V.read(f) : null; },
      lesenBinaer: async (p) => { const f = datei(p); return f ? new Uint8Array(await V.readBinary(f)) : null; },
      anlegen: async (p, t) => { await ordnerAnlegen(elternVon(p)); await V.create(p, t); },
      aendern: async (p, t) => { const f = datei(p); if (!f) throw new Error("Notiz fehlt"); await V.modify(f, t); },
      umbenennen: async (alt, neu) => { const f = datei(alt); if (f) await app.fileManager.renameFile(f, neu); },
      papierkorb: async (p) => {
        const f = datei(p);
        if (!f) return;
        if (app.fileManager && typeof app.fileManager.trashFile === "function") await app.fileManager.trashFile(f);
        else await V.trash(f, true);
      },
      schreiben: async (p, t) => {
        const f = datei(p);
        if (f) { if ((await V.read(f)) !== t) await V.modify(f, t); return; }
        await ordnerAnlegen(elternVon(p));
        await V.create(p, t);
      },
      link: (ziel, von, sub, alias) => { const f = datei(ziel); return f ? app.fileManager.generateMarkdownLink(f, von, sub || undefined, alias || undefined) : null; },
      linktext: (ziel, von) => { const f = datei(ziel); return f ? M.fileToLinktext(f, von, true) : null; },
    };
  };
  const einstellungenObs = () => { const f = app.vault.getAbstractFileByPath(EINSTELLUNGEN), c = f && app.metadataCache.getFileCache(f); return (c && c.frontmatter) || {}; };
  const existiertObs = (p) => !!app.vault.getAbstractFileByPath(p);
  const ebaHelfer = () => (ctx.user && ctx.user.eba) || null;
  const lese = ctx.bleibend("lese", () => ({ pfad: null }));
  const hoerer = ctx.bleibend("hoerer", () => new Set());
  const beobachten = (fn) => { if (typeof fn === "function") hoerer.add(fn); return () => hoerer.delete(fn); };
  const neuZeichnen = () => { try { if (ctx.verbindungen && ctx.verbindungen.neuZeichnen) ctx.verbindungen.neuZeichnen(); } catch (e) { /* egal */ } };
  let motorInst = null;
  const motor = () => motorInst || (motorInst = erzeugen({
    io: obsidianIo(), lokal: lokalObs, sha256, geraetId, lese,
    pdfjs: () => obs.loadPdfJs(),
    einstellungen: einstellungenObs,
    extern: () => quelleExternAus(ebaHelfer(), existiertObs, einstellungenObs()),
    jetzt: () => new Date(),
    mobil: !!(obs.Platform && obs.Platform.isMobile),
    version: String((plugin().manifest && plugin().manifest.version) || ""),
    pause: (n) => new Promise((r) => setTimeout(r, n)),
    wecker: (n) => { let id = null; const promise = new Promise((r) => { id = setTimeout(r, n); }); return { promise, aus: () => clearTimeout(id) }; },
    geaendert: (x) => {
      for (const h of Array.from(hoerer)) { try { h(x); } catch (e) { /* Hörer egal */ } }
      if (x && x.art !== "fortschritt") neuZeichnen();
    },
  }));

  // Zeitplan (quellen.js planen, gemeinsam mit allen Quellen): erster Lauf nach RUHE ohne neue Datei (und eingelesenem
  // metadataCache), dann im TAKT, zurück in der App nach mehr als TAKT, bei geänderten PDFs (nach STABIL) und auf Knopfdruck;
  // Lauf-Budget erreicht → nächster Stapel nach STAPEL_PAUSE (höchstens STAPEL_MAX hintereinander)
  let gestartet = false, ruheBis = 0, stapel = 0, zeitplan = null;
  const planeLauf = (inMs) => { if (zeitplan) zeitplan.spaeter(inMs); };
  // → Pause bis zum nächsten Stapel oder 0
  const nachLauf = (b) => {
    if (b && b.rest > 0 && ["ok", "aktuell"].indexOf(b.art) >= 0 && stapel < STAPEL_MAX) { stapel++; return STAPEL_PAUSE; }
    stapel = 0;
    return 0;
  };
  const automatisch = async () => {
    if (plugin().testVolltextAus) return null;
    const rest = ruheBis - Date.now();
    if (!gestartet && rest > 0) return { ok: null, naechster: rest + 1000 }; // Erstabgleich läuft noch
    gestartet = true;
    const m = motor();
    if (m.laeuft) return null;
    const b = await m.lauf({});
    const pause = nachLauf(b);
    return { ok: b.art === "fehler" ? false : ["ok", "aktuell"].indexOf(b.art) >= 0 ? true : null, naechster: pause };
  };
  // „Jetzt nachholen“: sofort, ohne Ruhezeit; hier: true holt die Sperre auch von einem anderen Gerät
  const nachholen = (o) => motor().lauf({ manuell: true, hier: !!(o && o.hier) }).then((b) => { const pause = nachLauf(b); if (pause) planeLauf(pause); return b; });
  const setzen = async (wert) => {
    const f = app.vault.getAbstractFileByPath(EINSTELLUNGEN);
    if (!f || f.children) return false;
    await app.fileManager.processFrontMatter(f, (fm) => { fm.volltext = wert ? "an" : "aus"; });
    if (!wert && motorInst) motorInst.stoppen();
    if (wert && gestartet) planeLauf(5000);
    neuZeichnen();
    return true;
  };

  // ---------- Für andere Skripte (Oberfläche) und Tests ----------
  // status() → { an, extern, fremd, laeuft, anderes, pdfs, durchsuchbar, ohneText, offen, warten, zuletzt, fortschritt
  //   { erledigt, gesamt } | null, text }; setzen(an) schreibt „volltext: an|aus“ in die Einstellungen; nachholen({ hier }) →
  //   Bericht; beobachten(fn) → abmelden, fn({ art: start | fortschritt | fertig, … }), nie mit Dateinamen
  const api = {
    status: () => motor().status(),
    setzen, nachholen, beobachten,
    stoppen: () => { if (motorInst) motorInst.stoppen(); },
    get laeuft() { return !!(motorInst && motorInst.laeuft); },
    // reine Logik und Tests
    erzeugen, planen, entschaerfen, entschaerfenGrund, seiteText, textRein, kopfLesen, ausFm, notizText, hinweisText, zielName,
    quelleExternAus, eingeschaltet, istPdf,
    K: { ZIEL, ABRUF, FASSUNG, GRENZEN, SEITE_ZEICHEN, RUHE, STABIL, TAKT, STAPEL_PAUSE, STAPEL_MAX, UEBERNAHME, PULS, WAISE_ALTER, MASSE, L, TEXT },
  };
  ctx.volltext = api;

  const registrieren = () => {
    const m = motor();
    m.nachAbsturz();
    ruheBis = Date.now() + RUHE;
    const Q = ctx.user && ctx.user.quellen;
    if (Q) zeitplan = Q.planen(ctx, { takt: TAKT, zurueck: TAKT, start: [RUHE, 0], lauf: automatisch, versucht: () => Date.parse(m.status().zuletzt || "") || 0 });
    const bald = ctx.entprellen(() => { if (zeitplan) zeitplan.jetzt("aenderung"); }, STABIL);
    // Neue Dateien (Erstabgleich, ILIAS, Sync) verschieben den ersten Lauf; danach lösen PDFs unter Unterlagen/ einen Lauf aus
    ctx.an(app.vault, "create", (f) => {
      if (!f || m.eigenGeschrieben(f.path)) return;
      if (!gestartet) { ruheBis = Date.now() + RUHE; return; }
      if (istPdf(f.path) || istZiel(f.path)) bald();
    });
    ctx.an(app.vault, "modify", (f) => { if (gestartet && f && istPdf(f.path)) bald(); });
    ctx.an(app.vault, "delete", (f) => { if (gestartet && f && istPdf(f.path)) bald(); });
    ctx.an(app.vault, "rename", (f, alt) => {
      if (!gestartet || !f || !(istPdf(f.path) || istPdf(String(alt || "")))) return;
      // Prüfsumme wandert mit, damit der nächste Lauf die Notiz umbenennt statt neu zu lesen
      const c = lokalObs(L.cache);
      if (c && typeof c === "object" && c[alt]) { c[f.path] = c[alt]; delete c[alt]; lokalObs(L.cache, c); }
      bald();
    });
    // Absturz-Merker: im Hintergrund oder beim Beenden zählt ein Abbruch nicht als Absturz
    // (zurück in der App: der gemeinsame Zeitplan holt nach)
    ctx.dom(document, "visibilitychange", () => m.merkerSetzen({ hintergrund: document.visibilityState !== "visible" }));
    ctx.dom(window, "beforeunload", () => m.merkerSetzen({ beendet: true }));
  };
  // Hot-Reload oder Entladen: laufendes Lesen beim nächsten Schritt beenden (der Merker wird dann geleert)
  const abmelden = () => { if (motorInst) motorInst.stoppen(); };

  return { registrieren, abmelden };
};
