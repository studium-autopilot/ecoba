// Update der Vorlage mit einem Knopf (seit 0.2.0). Zeile „Studium Autopilot“ in ```eba-verbindungen``` (verbindungen.js):
// Version, „Neue Version X verfügbar“ und Knopf „Neue Version installieren“. Seit 0.3.1 zusätzlich ```eba-update-hinweis``` oben auf dem
// Dashboard: schmale Zeile nur, wenn ein Update angeboten wird oder „Neu laden“ nötig ist. Doku: docs/architektur.md, „Update“.
//
// Woher: Das Manifest der zentralen Daten (zentral.js, docs/daten-v1.md) nennt im optionalen Feld „release“ die neue Version,
// die Basisadresse der Dateien (raw.githubusercontent.com, Tag v<version> im Haupt-Repo) und die SHA-256 der Dateiliste
// system-dateien.json. Geladen wird NUR nach einem Tipp auf „Neue Version installieren“ und Bestätigung.
//
// Ablauf (alles oder nichts):
//   1. system-dateien.json laden, Prüfsumme gegen das Manifest, Liste streng prüfen (nur erlaubte Pfade, siehe klasseVon).
//   2. Jede Datei, die sich ändern soll, laden und mit Größe und SHA-256 prüfen. Erst wenn ALLES geladen und geprüft ist,
//      wird geschrieben. Kein Netz, falsche Prüfsumme, Abbruch → nichts geschrieben.
//   3. Sicherung: jede Datei, die überschrieben oder entfernt wird, nach .trash/Studium Autopilot Sicherung <alt> <Zeit>/.
//   4. Schreiben; scheitert ein Schreibvorgang, wird alles schon Geschriebene zurückgesetzt.
//   5. Liste als System/Daten/system-dateien.json (Teil der Vorlage) und System/Daten/installiert.json (Stand dieses Vaults,
//      synchronisiert) schreiben. Hat sich der Plugin-Kern geändert, wird das Plugin neu geladen.
//
// Nutzeränderungen (Vergleich mit installiert.json, also der Fassung, die zuletzt installiert wurde):
//   unverändert oder schon gleich der neuen Fassung → ersetzen bzw. nichts. Selbst geändert:
//   system (seit 0.4.4) → immer die neue Fassung; deine liegt vorher als „Name (deine Fassung vor X).ext.txt“ daneben (nie
//     geladen). Bis 0.4.3 blieb deine aktiv und die neue lag als „Name (neu X).ext.txt“ daneben, darum fehlten neue Teile.
//   seite/modul, deren Vorlage sich seit der installierten Version nicht geändert hat (seit 0.4.4) → deine bleibt, nichts daneben;
//   sonst seite → deine bleibt, neue als „Name (neu X).md“ daneben; nur abgehakt → neue Seite, Haken übernommen;
//   modul → Katalogfelder neu, persönliche Felder (PERSOENLICH) und eigene Felder bleiben, Text bleibt, wenn du ihn geändert
//   hast; einstellung (.obsidian/*.json) → fehlende Einträge ergänzen, deine Werte bleiben. Gelöschte Seiten/Module kommen nicht
//   wieder. Dateien, die es nicht mehr gibt, wandern unverändert in die Sicherung; geänderte Seiten/Module bleiben, geänderte
//   Systemdateien gehen mit Sicherung daneben. Lesezeichen auf entfernte Dateien fallen auch aus deiner bookmarks.json weg.
//   Ältere Kopien „Seite (neu X).md“, die genau der alten oder neuen Vorlage gleichen, räumt das Update weg (keine Stapel).
// Reparatur (seit 0.4.4, heilenMit): Das Update auf 0.4.4 plant noch der alte update.js. Darum prüft der neue einmal je Gerät
//   und Version: Systemdatei ≠ installiert.json, aber eine beiseitegelegte „(neu X)“-Kopie hat genau die Prüfsumme der Liste →
//   diese wird aktiv, deine Fassung kommt als Sicherung daneben, die Kopien gehen weg. Kopien von Seiten, die genau der jetzigen
//   Vorlage gleichen und älter als die installierte Version sind, gehen auch weg. Nie aus dem Netz, nie eine Seite selbst.
//   Synchronisierte Pfade (alles außer .obsidian/) nur auf dem Gerät, das für alle schreibt (ctx.zentral.abruferHier).
// Nie angefasst: alles, was klasseVon nicht kennt (Einstellungen, Termine, Stundenplan, Vorlesungen, Unterlagen, Eingang,
//   Anhänge, Semester.md, abruf.json, appearance.json …).
// Kanal: update_kanal in System/Einstellungen.md („stabil“ Standard, „beta“). Das Manifest nennt release (stabil) und optional
//   beta (X.Y.Z-beta.N); auf Kanal beta wird die höhere von beiden angeboten, nie eine ältere als die installierte.
//   Schalter „Beta-Versionen“ im Fenster „Studium Autopilot“ unter „Mehr erfahren“.
// Unterbrochen (seit 0.4.8): Als erste Datei schreibt das Update System/Daten/update.json (synchronisiert, { version, von,
//   geraet, seit }) und lässt sie danach liegen; fertig ist es erst mit installiert.json (zuletzt). Neuer als installiert.json
//   und von diesem Gerät → „Update fertigstellen“ (App beendet, bevor alles geschrieben war; ein zweiter Lauf schreibt nur, was
//   fehlt). Von einem anderen Gerät, vor weniger als 1 Std. → „Ein Update wird gerade auf einem anderen Gerät installiert“
//   statt eines zweiten Updates (seine Dateien kommen noch über den Sync). Gilt ab dem Update, das 0.4.8 plant.
// Nach Updates suchen (seit 0.4.8): Knopf in der Zeile und Befehl; holt das Manifest sofort, Ergebnis als ein Hinweis. Das
//   Manifest und die Liste kommen mit Minuten-Zeitstempel und „no-cache“ (zentral.js frischUrl), nie aus dem Zwischenspeicher.
// Erstinstallation: Fehlt installiert.json, legt das Plugin sie einmal aus system-dateien.json an (sonst keine Datei).
// Andere Geräte: Das Update kommt über den Sync. installiert.json zeigt dort die neue Version → kein zweites Update; läuft
//   noch der alte Kern im Speicher, zeigt die Zeile „Neu laden“. Die Skripte, die dabei ankommen, lädt der Kern ohne
//   „Aktualisiert: …“-Hinweise neu (mehrere auf einmal oder nach einer neuen installiert.json: stillBis).
// Neuigkeiten (seit 0.4.1): Beim Öffnen von Obsidian (und nach über 6 h im Hintergrund) holt update.js nach wenigen Sekunden
//   nur das kleine Manifest, wenn die letzte Prüfung über 30 Min. her ist. Gibt es ein Angebot, erscheint einmal je App-Start
//   ein Hinweis (Notice) mit „Neue Version installieren“ und „Was ist neu“, für dieselbe Version höchstens alle 12 h. Läuft eine neue
//   Version zum ersten Mal auf diesem Gerät, einmal „Aktualisiert auf X“. „Was ist neu“ zeigt die Abschnitte aus CHANGELOG.md
//   am Tag der Version. Nicht während der Einrichtung. Gerätelokal: eba-update-geprueft, eba-update-toast, eba-update-gesehen.
// Testeinstiege: plugin.testUpdateAntwort (true/false statt Bestätigungsfenster), plugin.testUpdateBasis (andere Basis-URL,
//   z. B. lokaler Server; gilt auch für CHANGELOG.md), ctx.update.letzterBericht, ctx.update.fenster, ctx.update.neuigkeiten,
//   ctx.update.heilen(true) (Reparatur sofort, ohne Merker eba-update-reparatur).
// iOS-sicher: keine Node-APIs, kein Lookbehind, kein .at()/findLast/structuredClone. Web Crypto für SHA-256.
module.exports = function (ctx) {
  const app = window.app;
  const obs = ctx.obsidian || {};

  // ---------- Konstanten ----------
  const ORDNER = "Studium Autopilot"; // Ordner des Vaults im Haupt-Repo (Pfad unter url_basis)
  const LISTE = "System/Daten/system-dateien.json";
  const INSTALLIERT = "System/Daten/installiert.json";
  const MARKE = "System/Daten/update.json"; // welches Gerät welches Update begonnen hat (markeLage)
  const MARKE_STILL = 60 * 60e3; // so lange gilt ein Update auf einem anderen Gerät als „läuft gerade“
  const PLUGIN_ID = "studium-autopilot";
  const KERN = ".obsidian/plugins/" + PLUGIN_ID + "/";
  const KERN_DATEIEN = ["main.js", "manifest.json", "styles.css"];
  const EINSTELLUNG = [".obsidian/app.json", ".obsidian/bookmarks.json", ".obsidian/community-plugins.json",
    ".obsidian/core-plugins.json", ".obsidian/hotkeys.json", ".obsidian/types.json"];
  // Persönliche Felder der Modulnotizen (bleiben beim Update immer): wie pruefen.py (Vorlage leer) und docs/architektur.md
  const PERSOENLICH = ["status", "ergebnis", "versuch", "klausur", "semester_geplant", "gewaehlt", "anrechnung", "zusatz",
    "alma_ausgeblendet", "anmeldung_verzicht"];
  const VEREINIGEN = ["tags", "aliases", "cssclasses"]; // Listen: neue Einträge + deine zusätzlichen
  const G = { dateien: 3000, datei: 4194304, gesamt: 41943040, liste: 2097152, pfad: 300, parallel: 4 };
  const HEX = /^[0-9a-f]{64}$/;
  const SICHERUNG = ".trash/Studium Autopilot Sicherung ";

  // ---------- Kleine Helfer ----------
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const enc = (s) => new TextEncoder().encode(s);
  const dec = (b) => new TextDecoder("utf-8").decode(b);
  // Versionen X.Y.Z und Beta X.Y.Z-beta.N (Beta vor der fertigen Version: 0.3.0-beta.2 < 0.3.0 < 0.3.1-beta.1)
  const semver = (s) => { const m = String(s || "").match(/^(\d{1,4})\.(\d{1,4})\.(\d{1,4})(?:-beta\.(\d{1,4}))?$/); return m ? [+m[1], +m[2], +m[3], m[4] == null ? Infinity : +m[4]] : null; };
  const neuer = (a, b) => { const x = semver(a), y = semver(b); if (!x || !y) return false; for (let i = 0; i < 4; i++) { if (x[i] !== y[i]) return x[i] > y[i]; } return false; };
  const istBeta = (v) => /-beta\./.test(String(v || ""));
  // Welche Version wird angeboten? Kanal „stabil“: nur release. Kanal „beta“: die höhere von beta und release. Nur, wenn sie
  // neuer ist als die installierte (nie zurück).
  const angebot = (rel, beta, kanal, installiert) => {
    let a = rel || null;
    if (kanal === "beta" && beta && (!a || neuer(beta.version, a.version))) a = beta;
    return a && neuer(a.version, installiert) ? a : null;
  };
  // Unterbrochenes Update? m = Inhalt von update.json (MARKE), o = { installiert, ich (Geräte-ID), jetzt (ms), laeuft }.
  // Fertig ist ein Update, sobald installiert.json seine Version zeigt; bis dahin: begonnen auf diesem Gerät → "fertigstellen"
  // (nicht, solange es hier läuft), auf einem anderen vor weniger als MARKE_STILL → "anderes" (Dateien kommen noch über den
  // Sync; danach gilt das Gerät als weg, und hier darf wieder installiert werden). Sonst null.
  const markeLage = (m, o) => {
    if (!m || typeof m !== "object" || !semver(m.version) || typeof m.geraet !== "string" || !m.geraet) return null;
    if (o.laeuft || !neuer(m.version, o.installiert)) return null;
    if (o.ich && m.geraet === o.ich) return "fertigstellen";
    const seit = Date.parse(m.seit || "");
    return seit && Math.abs(o.jetzt - seit) < MARKE_STILL ? "anderes" : null;
  };
  const hat = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const nfc = (s) => { try { return String(s).normalize("NFC"); } catch (e) { return String(s); } };
  const sha256 = async (bytes) => {
    const h = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    let s = "";
    for (let i = 0; i < h.length; i++) s += h[i].toString(16).padStart(2, "0");
    return s;
  };
  const plugin = () => ctx.plugin || {};

  // ---------- Pfade und Klassen (gleiche Regeln wie werkzeuge/pruefen.py, klasse_von) ----------
  // Pfad innerhalb des Vaults: relativ, „/“ als Trenner, keine leeren, „.“- oder „..“-Teile, keine Steuer- oder für Windows
  // verbotenen Zeichen, nichts im Papierkorb.
  const pfadOk = (p) => {
    if (typeof p !== "string" || !p || p.length > G.pfad) return false;
    if (/[\u0000-\u001f\u007f\\:*?"<>|]/.test(p) || p.charAt(0) === "/") return false;
    const teile = p.split("/");
    for (const t of teile) if (!t || t === "." || t === ".." || t === ".trash" || /[ .]$/.test(t)) return false;
    return true;
  };
  // → "system" | "einstellung" | "seite" | "modul" | "" (nie im Update)
  const klasseVon = (pfad) => {
    const p = nfc(pfad);
    if (!pfadOk(p)) return "";
    if (p.indexOf(KERN) === 0) return KERN_DATEIEN.indexOf(p.slice(KERN.length)) >= 0 ? "system" : "";
    if (/^System\/Skripte\/[^/]+\.js$/.test(p)) return "system";
    if (/^System\/Gerüste\/[^/]+\.md$/.test(p)) return "system";
    if (/^\.obsidian\/snippets\/eba-[^/]+\.css$/.test(p)) return "system";
    if (EINSTELLUNG.indexOf(p) >= 0) return "einstellung";
    if (p === "Dashboard.md" || p === "System/Daten/Musterplan.md" || /^Studium\/[^/]+\.md$/.test(p)) return "seite";
    if (/^Module\/.+\.md$/.test(p)) return "modul";
    return "";
  };
  // Pfad → { ordner ("" oder „a/b/“), basis, ext }
  const nameTeile = (pfad) => {
    const i = pfad.lastIndexOf("/"), name = pfad.slice(i + 1), p = name.lastIndexOf(".");
    return { ordner: pfad.slice(0, i + 1), basis: p > 0 ? name.slice(0, p) : name, ext: p > 0 ? name.slice(p) : "" };
  };
  const ordnerVon = (pfad) => nameTeile(pfad).ordner.replace(/\/$/, "");
  // Endung der Kopie: Skripte, CSS und JSON mit .txt am Ende, damit nichts davon geladen wird (bis 0.4.3 auch für System)
  const kopieEndung = (ext) => (ext === ".js" || ext === ".css" || ext === ".json" ? ext + ".txt" : ext);
  // Name der neuen Fassung neben deiner: „Dashboard (neu 0.3.0).md“, Skripte/CSS „zentral (neu 0.3.0).js.txt“
  const neuName = (pfad, version) => { const t = nameTeile(pfad); return t.ordner + t.basis + " (neu " + version + ")" + kopieEndung(t.ext); };
  // Sicherung deiner Systemdatei daneben, immer mit .txt (Obsidian und der Kern laden sie nie):
  // „eba-core (deine Fassung vor 0.4.4).css.txt“; nr ≥ 2, wenn der Name schon mit anderem Inhalt belegt ist
  const deineName = (pfad, version, nr) => {
    const t = nameTeile(pfad);
    return t.ordner + t.basis + " (deine Fassung vor " + version + (nr > 1 ? ", " + nr : "") + ")" + t.ext + ".txt";
  };
  // Kopien „Name (neu X)…“ neben pfad aus einer Liste von Pfaden im selben Ordner → [{ pfad (wie gelistet), version }].
  // Namen vergleicht es in NFC (iOS und macOS liefern Umlaute zerlegt).
  const kopienVon = (pfad, namen) => {
    const t = nameTeile(nfc(pfad)), vor = t.ordner + t.basis + " (neu ", nach = ")" + kopieEndung(t.ext);
    const aus = [];
    for (const n of namen || []) {
      const x = nfc(n);
      if (x.length <= vor.length + nach.length || x.indexOf(vor) !== 0 || x.slice(x.length - nach.length) !== nach) continue;
      const v = x.slice(vor.length, x.length - nach.length);
      if (semver(v)) aus.push({ pfad: n, version: v });
    }
    return aus;
  };

  // ---------- Liste prüfen (system-dateien.json, auch installiert.json) ----------
  // → { wert: { schema, version, ordner, dateien: [{ pfad, klasse, sha256, groesse, koerper?, ohne_haken? }] } } | { fehler }
  const listePruefen = (d, version) => {
    if (!d || typeof d !== "object" || Array.isArray(d)) return { fehler: "Liste ist kein Objekt" };
    if (d.schema !== 1) return { fehler: "Liste: schema unbekannt" };
    if (!semver(d.version)) return { fehler: "Liste: version ungültig" };
    if (version && d.version !== version) return { fehler: "Liste: Version " + d.version + " statt " + version };
    if (d.ordner !== ORDNER) return { fehler: "Liste: ordner unbekannt" };
    if (!Array.isArray(d.dateien) || !d.dateien.length || d.dateien.length > G.dateien) return { fehler: "Liste: dateien fehlt oder zu viele" };
    const dateien = [], gesehen = {};
    let summe = 0;
    for (const e of d.dateien) {
      if (!e || typeof e !== "object" || Array.isArray(e)) return { fehler: "Liste: Eintrag ist kein Objekt" };
      const pfad = typeof e.pfad === "string" ? nfc(e.pfad) : "";
      const k = klasseVon(pfad);
      if (!k || e.klasse !== k) return { fehler: "Liste: Datei nicht erlaubt: " + String(e.pfad).slice(0, 120) };
      if (hat(gesehen, pfad)) return { fehler: "Liste: doppelt: " + pfad };
      if (typeof e.sha256 !== "string" || !HEX.test(e.sha256)) return { fehler: "Liste: sha256 ungültig: " + pfad };
      if (!Number.isInteger(e.groesse) || e.groesse < 0 || e.groesse > G.datei) return { fehler: "Liste: groesse ungültig: " + pfad };
      const x = { pfad, klasse: k, sha256: e.sha256, groesse: e.groesse };
      for (const feld of ["koerper", "ohne_haken"]) {
        if (e[feld] == null) continue;
        if (typeof e[feld] !== "string" || !HEX.test(e[feld])) return { fehler: "Liste: " + feld + " ungültig: " + pfad };
        x[feld] = e[feld];
      }
      gesehen[pfad] = true;
      summe += e.groesse;
      dateien.push(x);
    }
    if (summe > G.gesamt) return { fehler: "Liste: zusammen zu groß" };
    if (!hat(gesehen, KERN + "main.js") || !hat(gesehen, KERN + "manifest.json")) return { fehler: "Liste: Plugin-Kern fehlt" };
    return { wert: { schema: 1, version: d.version, ordner: ORDNER, dateien } };
  };

  // ---------- Text: Frontmatter, Haken, JSON ----------
  // Gleiche Regel wie werkzeuge/pruefen.py (koerper-Prüfsumme der Module): Frontmatter von „---“ bis „---“ am Anfang.
  const FM = /^(---\r?\n)([\s\S]*?)(\r?\n---[ \t]*(?:\r?\n|$))/;
  const teilen = (text) => {
    const m = text.match(FM);
    if (!m) return { fm: false, kopf: "", yaml: "", fuss: "", koerper: text };
    return { fm: true, kopf: m[1], yaml: m[2], fuss: m[3], koerper: text.slice(m[0].length) };
  };
  // Abgehakte Aufgaben „- [x]“ wieder offen: Prüfsumme „ohne_haken“ zeigt, ob eine Seite nur abgehakt wurde
  const ohneHaken = (text) => text.replace(/^([ \t>]*[-*+] \[)[xX](\])/gm, "$1 $2");
  const hatAufgaben = (text) => /^[ \t>]*[-*+] \[[ xX]\]/m.test(text);
  // Neue Seite, Haken aus deiner Fassung übernehmen (gleiche Zeile, erste noch offene)
  const seiteHaken = (deine, neu) => {
    const zeilen = neu.split("\n"), benutzt = {};
    for (const z of deine.split("\n")) {
      const m = z.match(/^([ \t>]*[-*+] \[)[xX](\].*)$/);
      if (!m) continue;
      const offen = m[1] + " " + m[2];
      for (let i = 0; i < zeilen.length; i++) if (!benutzt[i] && zeilen[i] === offen) { zeilen[i] = z; benutzt[i] = true; break; }
    }
    return zeilen.join("\n");
  };

  // YAML-Frontmatter in Blöcke je Schlüssel der obersten Ebene (Schlüsselzeile + eingerückte/Listen-Zeilen darunter)
  const bloecke = (yaml) => {
    const vor = [], liste = [];
    let akt = null;
    for (const z of yaml.split("\n")) {
      const m = z.match(/^([A-Za-z_][\w-]*):(?:[ \t]|\r?$)/);
      if (m) { akt = { key: m[1], zeilen: [z] }; liste.push(akt); } else if (akt) akt.zeilen.push(z); else vor.push(z);
    }
    return { vor, liste };
  };
  // Einträge einer Block-Liste („tags:“ + „  - x“) → [Text] oder null (andere Form)
  const listenEintraege = (b) => {
    if (!/^[A-Za-z_][\w-]*:[ \t]*\r?$/.test(b.zeilen[0])) return null;
    const aus = [];
    for (const z of b.zeilen.slice(1)) {
      if (/^[ \t]*\r?$/.test(z)) continue;
      const m = z.match(/^([ \t]*)- (.*?)\r?$/);
      if (!m) return null;
      aus.push({ einzug: m[1], wert: m[2] });
    }
    return aus;
  };
  const listeVereinigen = (deine, neu) => {
    const d = listenEintraege(deine), n = listenEintraege(neu);
    if (!d) return deine.zeilen; // eigene Form (z. B. [a, b]): deine bleibt
    if (!n) return neu.zeilen;
    const cr = /\r$/.test(neu.zeilen[0]) ? "\r" : "";
    const einzug = n.length ? n[0].einzug : d.length ? d[0].einzug : "  ";
    const werte = n.map((x) => x.wert);
    const aus = neu.zeilen.slice();
    while (aus.length > 1 && /^[ \t]*\r?$/.test(aus[aus.length - 1])) aus.pop();
    for (const x of d) if (werte.indexOf(x.wert) < 0) { werte.push(x.wert); aus.push(einzug + "- " + x.wert + cr); }
    return aus;
  };
  // Frontmatter mischen: Reihenfolge und Katalogfelder aus der neuen Fassung, persönliche Felder und Listen-Ergänzungen aus
  // deiner, deine zusätzlichen Felder am Ende.
  const fmMischen = (deinYaml, neuYaml) => {
    const D = bloecke(deinYaml), N = bloecke(neuYaml);
    const dk = {};
    for (const b of D.liste) if (!hat(dk, b.key)) dk[b.key] = b;
    const nk = {};
    let aus = N.vor.slice();
    for (const b of N.liste) {
      nk[b.key] = true;
      const d = hat(dk, b.key) ? dk[b.key] : null;
      if (d && PERSOENLICH.indexOf(b.key) >= 0) aus = aus.concat(d.zeilen);
      else if (d && VEREINIGEN.indexOf(b.key) >= 0) aus = aus.concat(listeVereinigen(d, b));
      else aus = aus.concat(b.zeilen);
    }
    for (const b of D.liste) if (!hat(nk, b.key)) aus = aus.concat(b.zeilen);
    return aus.join("\n");
  };
  // Modulnotiz: neue Katalogfelder, deine persönlichen Felder; Text neu, wenn du ihn nicht geändert hast (koerperNeu)
  const modulMischen = (deine, neu, koerperNeu) => {
    const d = teilen(deine), n = teilen(neu);
    if (!n.fm) return koerperNeu ? neu : deine;
    return n.kopf + fmMischen(d.fm ? d.yaml : "", n.yaml) + n.fuss + (koerperNeu ? n.koerper : d.koerper);
  };
  // .obsidian/*.json: deine Werte bleiben, fehlende Schlüssel kommen dazu, Textlisten werden vereinigt. → Text oder null
  // (nichts zu tun). Deine Datei unlesbar → neue Fassung.
  const istObj = (x) => !!x && typeof x === "object" && !Array.isArray(x);
  const jsonMischen = (u, n) => {
    if (istObj(u) && istObj(n)) {
      const r = {};
      for (const k of Object.keys(u)) r[k] = hat(n, k) ? jsonMischen(u[k], n[k]) : u[k];
      for (const k of Object.keys(n)) if (!hat(u, k)) r[k] = n[k];
      return r;
    }
    if (Array.isArray(u) && Array.isArray(n) && u.concat(n).every((x) => typeof x === "string")) {
      const r = u.slice();
      for (const x of n) if (r.indexOf(x) < 0) r.push(x);
      return r;
    }
    return u;
  };
  // Geänderte Vorgaben (seit 0.4.6): Ändert die Vorlage den Wert eines Schlüssels, bekommt ihn, wer noch den alten Wert hat und von
  // einer Version davor kommt; wer selbst etwas anderes gewählt hat, behält es, und ein späteres Update fasst es nicht mehr an.
  // pfad → { ab: Version mit der neuen Vorgabe, werte: { schlüssel: [alt, neu] } }
  const VORGABE_NEU = Object.freeze({
    // Obsidian zeigt keine JSON-, Sicherungs- und Systemdateien mehr; „+“ legt die Notiz in Vorlesungen/ an (Ordner-Automatik)
    ".obsidian/app.json": { ab: "0.4.6", werte: { showUnsupportedFiles: [true, false], newFileLocation: ["root", "folder"] } },
  });
  // pfad, von (installierte Version): für VORGABE_NEU; ohne pfad nur mischen
  const jsonMischenText = (deine, neu, pfad, von) => {
    let u, n;
    try { n = JSON.parse(neu); } catch (e) { return null; }
    try { u = JSON.parse(deine); } catch (e) { return neu; }
    const r = jsonMischen(u, n);
    const v = pfad && hat(VORGABE_NEU, pfad) ? VORGABE_NEU[pfad] : null;
    if (v && istObj(r) && (!von || neuer(v.ab, von))) {
      for (const k of Object.keys(v.werte)) if (hat(r, k) && r[k] === v.werte[k][0]) r[k] = v.werte[k][1];
    }
    return JSON.stringify(r) === JSON.stringify(u) ? null : JSON.stringify(r, null, 2);
  };
  // Lesezeichen (.obsidian/bookmarks.json) auf Dateien, die das Update entfernt, fallen weg, auch in Gruppen. Beim Mischen
  // bliebe deine Liste sonst unverändert und zeigte auf eine Seite, die es nicht mehr gibt. → Text oder null (nichts zu tun)
  const LESEZEICHEN = ".obsidian/bookmarks.json";
  const lesezeichenOhne = (text, pfade) => {
    let d;
    try { d = JSON.parse(text); } catch (e) { return null; }
    if (!istObj(d) || !Array.isArray(d.items) || !pfade.length) return null;
    const weg = pfade.map(nfc);
    let n = 0;
    const filtern = (items) => items.filter((x) => {
      if (!istObj(x)) return true;
      if (Array.isArray(x.items)) x.items = filtern(x.items);
      const raus = x.type === "file" && typeof x.path === "string" && weg.indexOf(nfc(x.path)) >= 0;
      if (raus) n++;
      return !raus;
    });
    d.items = filtern(d.items);
    return n ? JSON.stringify(d, null, 2) : null;
  };

  // ---------- Plan (rein, ohne Dateien) ----------
  // neu, alt: geprüfte Listen (alt darf null sein); ist: pfad → { sha, koerper?, ohneHaken? } (fehlt = Datei fehlt)
  // → [{ pfad, klasse, art, eintrag?, koerperNeu? }], art: gleich | anlegen | ersetzen | ersetzen-sichern | behalten-neu |
  //   eigene | modul-mischen | seite-haken | json-mischen | uebersprungen | entfernen | entfernen-sichern | bleibt
  const planen = (neu, alt, ist) => {
    const A = {}, N = {};
    if (alt) for (const a of alt.dateien) A[a.pfad] = a;
    const schritte = [];
    for (const e of neu.dateien) {
      N[e.pfad] = true;
      const a = hat(A, e.pfad) ? A[e.pfad] : null, c = hat(ist, e.pfad) ? ist[e.pfad] : null;
      let art;
      if (!c) art = a && (e.klasse === "seite" || e.klasse === "modul") ? "uebersprungen" : "anlegen";
      else if (c.sha === e.sha256) art = "gleich";
      else if (a && c.sha === a.sha256) art = "ersetzen";
      // Darstellung, Programmteile, Gerüste: immer die neue Fassung, deine geänderte vorher als Sicherung daneben
      else if (e.klasse === "system") art = "ersetzen-sichern";
      else if (e.klasse === "einstellung") art = "json-mischen";
      // Vorlage seit der installierten Version gleich: deine Seite bzw. dein Modul bleibt, keine Kopie daneben
      else if (a && e.sha256 === a.sha256) art = "eigene";
      else if (e.klasse === "modul") art = "modul-mischen";
      else if (e.klasse === "seite" && a && a.ohne_haken && c.ohneHaken === a.ohne_haken) art = "seite-haken";
      else art = "behalten-neu";
      const s = { pfad: e.pfad, klasse: e.klasse, art, eintrag: e };
      if (art === "modul-mischen") s.koerperNeu = !!(a && a.koerper && c.koerper === a.koerper);
      schritte.push(s);
    }
    if (alt) for (const a of alt.dateien) {
      if (hat(N, a.pfad) || !hat(ist, a.pfad)) continue;
      const art = ist[a.pfad].sha === a.sha256 ? "entfernen" : a.klasse === "system" ? "entfernen-sichern" : "bleibt";
      schritte.push({ pfad: a.pfad, klasse: a.klasse, art });
    }
    return schritte;
  };
  const LADEN = { anlegen: 1, ersetzen: 1, "ersetzen-sichern": 1, "behalten-neu": 1, "modul-mischen": 1, "seite-haken": 1, "json-mischen": 1 };

  // Prüfsummen des Ist-Stands einer Datei (wie in der Liste)
  const istVon = async (pfad, bytes, klasse) => {
    const t = { sha: await sha256(bytes) };
    if (klasse === "modul") t.koerper = await sha256(enc(teilen(dec(bytes)).koerper));
    if (klasse === "seite") { const x = dec(bytes); if (hatAufgaben(x)) t.ohneHaken = await sha256(enc(ohneHaken(x))); }
    return t;
  };

  const parallel = async (liste, n, fn) => {
    let i = 0, fehler = null;
    const arbeiter = async () => {
      while (!fehler && i < liste.length) {
        const x = liste[i++];
        try { await fn(x); } catch (e) { if (!fehler) fehler = e; }
      }
    };
    const w = [];
    for (let k = 0; k < Math.min(n, liste.length); k++) w.push(arbeiter());
    await Promise.all(w);
    if (fehler) throw fehler;
  };
  const stempel = (d) => {
    const p = (x) => String(x).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}-${p(d.getMinutes())}`;
  };
  const gleich = (a, b) => {
    if (!a || !b || a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  };
  const fehlerArt = (art, text) => { const e = new Error(text); e.art = art; return e; };
  const grund = (e) => (e && e.message) || e;
  // Plugin-Kern zuletzt schreiben, damit ein halber Lauf nie mit neuem Kern startet
  const kernDatei = (p) => p.indexOf(KERN) === 0 && KERN_DATEIEN.indexOf(p.slice(KERN.length)) >= 0;
  const kernZuletzt = (liste) => liste.filter((w) => !kernDatei(w.pfad)).concat(liste.filter((w) => kernDatei(w.pfad)));
  // Dateien im Ordner von pfad (io.liste ist freiwillig; ohne → keine). Je Ordner einmal gelesen.
  const geschwisterLeser = (io) => {
    const merk = {};
    return async (pfad) => {
      const o = ordnerVon(pfad);
      if (typeof io.liste !== "function") return [];
      if (!hat(merk, o)) { try { merk[o] = (await io.liste(o)) || []; } catch (e) { merk[o] = []; } }
      return merk[o];
    };
  };
  // Freier Name für die Sicherung deiner Systemdatei; liegt dort schon genau dieser Inhalt, derselbe Name ohne Schreiben.
  // → { pfad, schreiben } | null (kein freier Name)
  const sicherungsName = async (io, pfad, version, bytes) => {
    for (let nr = 1; nr <= 20; nr++) {
      const k = deineName(pfad, version, nr), da = await io.lesen(k);
      if (!da) return { pfad: k, schreiben: true };
      if (gleich(da, bytes)) return { pfad: k, schreiben: false };
    }
    return null;
  };
  // Sicherung, Schreiben (bei einem Fehler alles Geschriebene zurück), dann Entfernen. reihe: [{ pfad, bytes, alt }] in
  // Schreibreihenfolge, loeschen: [{ pfad, alt }]; alles mit alt kommt vorher nach ordner/<pfad>.
  // → { sicherung, art ("" | sicherung | schreiben), fehler, zurueckgesetzt }
  const schreibenSicher = async (io, reihe, loeschen, ordner, melden) => {
    const r = { sicherung: "", art: "", fehler: "", zurueckgesetzt: false };
    const sichern = reihe.concat(loeschen).filter((w) => w.alt);
    if (sichern.length) {
      r.sicherung = ordner;
      melden("Lege eine Sicherung an …");
      try { for (const w of sichern) await io.schreiben(ordner + "/" + w.pfad, w.alt); } catch (e) {
        r.art = "sicherung"; r.fehler = "Sicherung nicht möglich (" + grund(e) + ")"; return r;
      }
    }
    melden("Speichere die neue Version …");
    const erledigt = [];
    try {
      for (const w of reihe) { await io.schreiben(w.pfad, w.bytes); erledigt.push(w); }
    } catch (e) {
      for (let i = erledigt.length - 1; i >= 0; i--) {
        const w = erledigt[i];
        try { if (w.alt) await io.schreiben(w.pfad, w.alt); else await io.loeschen(w.pfad); } catch (x) { console.error("update: zurücksetzen " + w.pfad, x); }
      }
      r.zurueckgesetzt = true; r.art = "schreiben"; r.fehler = "Schreiben fehlgeschlagen (" + grund(e) + ")";
      return r;
    }
    // Entfernen erst, wenn alles geschrieben ist (die Dateien liegen in der Sicherung)
    for (const l of loeschen) { try { await io.loeschen(l.pfad); } catch (e) { console.error("update: entfernen " + l.pfad, e); } }
    return r;
  };

  // ---------- Update ausführen (Datei-Zugriff über io, damit es ohne Obsidian testbar ist) ----------
  // io: { holen(url, { frisch }) → Uint8Array (wirft bei Fehler; frisch: nie aus dem Zwischenspeicher), lesen(pfad) →
  //   Uint8Array | null, schreiben(pfad, bytes), loeschen(pfad), liste(ordner) → [pfad] (freiwillig, für das Aufräumen alter Kopien) }
  // o: { release: { version, url_basis, sha256 }, alt: geprüfte Liste | null, altVersion, zeit: Date, fortschritt(text),
  //   marke: { geraet, seit } | null (update.json als erste Datei, nur wenn das Update etwas schreibt; siehe markeLage) }
  // → Bericht { ok, art (ok | netz | pruefsumme | liste | sicherung | schreiben), fehler, version, geaendert[], angelegt[],
  //   neuKopien[{ pfad, kopie }], gesichert[{ pfad, sicherung }] (deine Systemdatei daneben gesichert), gemischt[], haken[],
  //   einstellungen[], uebersprungen[], entfernt[], behalten[], aufgeraeumt[] (alte Kopien), sicherung, plugin (Kern geändert),
  //   zurueckgesetzt }
  const aktualisierenMit = async (io, o) => {
    const rel = o.release;
    const b = { ok: false, art: "", fehler: "", version: rel.version, geaendert: [], angelegt: [], neuKopien: [], gesichert: [], gemischt: [],
      haken: [], einstellungen: [], uebersprungen: [], entfernt: [], behalten: [], aufgeraeumt: [], sicherung: "", plugin: false, zurueckgesetzt: false };
    const melden = o.fortschritt || (() => {});
    const fehler = (art, text) => { b.art = art; b.fehler = text; return b; };
    const url = (pfad) => rel.url_basis + (ORDNER + "/" + pfad).split("/").map(encodeURIComponent).join("/");

    // 1. Dateiliste
    melden("Prüfe die neue Version …");
    let lb;
    try { lb = await io.holen(url(LISTE), { frisch: true }); } catch (e) { return fehler("netz", "Dateiliste nicht geladen (" + ((e && e.message) || e) + ")"); }
    if (lb.length > G.liste || (await sha256(lb)) !== rel.sha256) return fehler("pruefsumme", "Prüfsumme der Dateiliste stimmt nicht");
    let d;
    try { d = JSON.parse(dec(lb)); } catch (e) { return fehler("liste", "Dateiliste unlesbar"); }
    const lp = listePruefen(d, rel.version);
    if (lp.fehler) return fehler("liste", lp.fehler);
    const neu = lp.wert, alt = o.alt || null;

    // 2. Ist-Stand (nur lesen)
    const pfade = neu.dateien.map((e) => e.pfad);
    const klasse = {};
    for (const e of neu.dateien) klasse[e.pfad] = e.klasse;
    if (alt) for (const a of alt.dateien) if (!hat(klasse, a.pfad)) { pfade.push(a.pfad); klasse[a.pfad] = a.klasse; }
    const ist = {}, istBytes = {};
    for (const p of pfade) {
      const by = await io.lesen(p);
      if (!by) continue;
      istBytes[p] = by;
      ist[p] = await istVon(p, by, klasse[p]);
    }

    // 3. Plan, 4. alles laden und prüfen, bevor etwas geschrieben wird
    const schritte = planen(neu, alt, ist);
    const brauchen = schritte.filter((s) => LADEN[s.art]);
    const geladen = {};
    let fertig = 0;
    const dateien = brauchen.length === 1 ? "Datei" : "Dateien";
    melden(`Lade 0 von ${brauchen.length} ${dateien} …`);
    try {
      await parallel(brauchen, G.parallel, async (s) => {
        let by;
        try { by = await io.holen(url(s.pfad)); } catch (e) { throw fehlerArt("netz", s.pfad + " nicht geladen (" + ((e && e.message) || e) + ")"); }
        if (by.length !== s.eintrag.groesse || (await sha256(by)) !== s.eintrag.sha256) throw fehlerArt("pruefsumme", "Prüfsumme stimmt nicht: " + s.pfad);
        geladen[s.pfad] = by;
        fertig++;
        melden(`Lade ${fertig} von ${brauchen.length} ${dateien} …`);
      });
    } catch (e) { return fehler(e.art || "netz", (e && e.message) || String(e)); }

    // 5. Inhalte berechnen
    const schreiben = [], loeschen = [];
    const alsText = (p) => dec(istBytes[p]);
    const weg = schritte.filter((s) => s.art === "entfernen" || s.art === "entfernen-sichern").map((s) => s.pfad);
    // Deine geänderte Systemdatei als „Name (deine Fassung vor X).ext.txt“ daneben (vor der neuen Fassung geschrieben)
    const deineSichern = async (p, c) => {
      const s = await sicherungsName(io, p, rel.version, c);
      if (!s) throw fehlerArt("sicherung", "Kein freier Name für die Sicherung: " + p);
      if (s.schreiben) schreiben.push({ pfad: s.pfad, bytes: c, alt: null });
      b.gesichert.push({ pfad: p, sicherung: s.pfad });
    };
    try {
      for (const s of schritte) {
        const p = s.pfad, c = istBytes[p] || null;
        if (s.art === "ersetzen-sichern" || s.art === "entfernen-sichern") await deineSichern(p, c);
      }
    } catch (e) { return fehler(e.art || "sicherung", (e && e.message) || String(e)); }
    for (const s of schritte) {
      const p = s.pfad, n = geladen[p], c = istBytes[p] || null;
      if (s.art === "anlegen") { schreiben.push({ pfad: p, bytes: n, alt: null }); b.angelegt.push(p); }
      else if (s.art === "ersetzen" || s.art === "ersetzen-sichern") { schreiben.push({ pfad: p, bytes: n, alt: c }); b.geaendert.push(p); }
      else if (s.art === "behalten-neu") {
        const k = neuName(p, rel.version), da = await io.lesen(k);
        if (!gleich(da, n)) { schreiben.push({ pfad: k, bytes: n, alt: da }); b.neuKopien.push({ pfad: p, kopie: k }); }
      } else if (s.art === "modul-mischen") {
        const t = modulMischen(alsText(p), dec(n), s.koerperNeu);
        if (t !== alsText(p)) { schreiben.push({ pfad: p, bytes: enc(t), alt: c }); b.gemischt.push(p); }
      } else if (s.art === "seite-haken") {
        const t = seiteHaken(alsText(p), dec(n));
        if (t !== alsText(p)) { schreiben.push({ pfad: p, bytes: enc(t), alt: c }); b.haken.push(p); }
      } else if (s.art === "json-mischen") {
        let t = jsonMischenText(alsText(p), dec(n), p, alt && alt.version);
        if (p === LESEZEICHEN) { const o = lesezeichenOhne(t != null ? t : alsText(p), weg); if (o != null) t = o; }
        if (t != null) { schreiben.push({ pfad: p, bytes: enc(t), alt: c }); b.einstellungen.push(p); }
      } else if (s.art === "uebersprungen") b.uebersprungen.push(p);
      else if (s.art === "entfernen" || s.art === "entfernen-sichern") { loeschen.push({ pfad: p, alt: c }); b.entfernt.push(p); }
      else if (s.art === "bleibt") b.behalten.push(p);
    }
    // Ältere Kopien „Seite (neu X).md“, die genau der alten oder der neuen Vorlage gleichen, gehen weg (keine Stapel); eine
    // Kopie, die du geändert hast, bleibt. Die neue Kopie dieses Updates (neu <version>) ist nie dabei.
    const geschwister = geschwisterLeser(io), A = {};
    if (alt) for (const a of alt.dateien) A[a.pfad] = a;
    for (const e of neu.dateien) {
      if (e.klasse !== "seite") continue;
      for (const k of kopienVon(e.pfad, await geschwister(e.pfad))) {
        if (!neuer(rel.version, k.version)) continue;
        const by = await io.lesen(k.pfad), s = by ? await sha256(by) : "";
        if (s && (s === e.sha256 || (hat(A, e.pfad) && s === A[e.pfad].sha256))) { loeschen.push({ pfad: k.pfad, alt: by }); b.aufgeraeumt.push(k.pfad); }
      }
    }
    // Plugin-Kern zuletzt (vor den Listen)
    const reihe = kernZuletzt(schreiben);
    b.plugin = reihe.some((w) => kernDatei(w.pfad));
    for (const p of [LISTE, INSTALLIERT]) { const da = await io.lesen(p); if (!gleich(da, lb)) reihe.push({ pfad: p, bytes: lb, alt: da }); }
    // update.json zuerst (markeLage): Bricht das Update ab, sieht dieses Gerät beim nächsten Start „Update fertigstellen“, die
    // anderen, dass es hier läuft. Sie bleibt danach liegen; ein Fehler beim Schreiben setzt auch sie zurück.
    if (o.marke && o.marke.geraet && (reihe.length || loeschen.length)) {
      const m = { version: rel.version, von: o.altVersion || "", geraet: String(o.marke.geraet), seit: String(o.marke.seit || "") };
      reihe.unshift({ pfad: MARKE, bytes: enc(JSON.stringify(m, null, 2) + "\n"), alt: await io.lesen(MARKE) });
    }

    // 6. Sicherung, 7. Schreiben (bei einem Fehler alles zurück), 8. nicht mehr enthaltene Dateien entfernen
    const w = await schreibenSicher(io, reihe, loeschen, SICHERUNG + (o.altVersion || "alt") + " " + stempel(o.zeit || new Date()), melden);
    b.sicherung = w.sicherung;
    b.zurueckgesetzt = w.zurueckgesetzt;
    if (w.art) return fehler(w.art, w.fehler);
    b.ok = true;
    b.art = "ok";
    return b;
  };

  // ---------- Reparatur nach einem Update (seit 0.4.4; Datei-Zugriff über io wie oben) ----------
  // Bis 0.4.3 blieb eine selbst geänderte Systemdatei aktiv und die neue lag als „Name (neu X).ext.txt“ daneben (nie
  // geladen, darum fehlten neue Teile), und eine geänderte Seite bekam bei jedem Update eine Kopie, auch ohne neue Vorlage.
  // Das Update auf 0.4.4 plant noch der alte update.js; dieser räumt danach auf, einmal je Gerät und Version (heilen()).
  // Nur mit Dateien, die schon im Tresor liegen, nie aus dem Netz; eine Seite selbst fasst er nie an.
  //   system: aktive Datei ≠ Prüfsumme in installiert.json, und eine Kopie bis zu dieser Version hat genau diese Prüfsumme →
  //     sie wird aktiv, deine Fassung kommt als „Name (deine Fassung vor X).ext.txt“ daneben. Ist die aktive Datei (danach)
  //     die der Liste, gehen ihre Kopien bis zu dieser Version weg. Sonst (neue Fassung liegt hier nicht vor) nichts.
  //   seite: Kopien „Seite (neu X).md“ älter als die installierte Version, die genau der jetzigen Vorlage gleichen → weg.
  // Alles wird vorher gelesen und geprüft; weggeräumte und überschriebene Dateien liegen danach in der Sicherung, Kern zuletzt.
  // io: { lesen, schreiben, loeschen, liste(ordner) → [pfad] }
  // o: { liste: geprüfte installiert.json, synchron: dieses Gerät schreibt synchronisierte Pfade (alles außer .obsidian/), zeit }
  // → { ok, art (ok | sicherung | schreiben), fehler, version, getauscht[{ pfad, sicherung }], entfernt[], plugin, sicherung,
  //   zurueckgesetzt }
  const heilenMit = async (io, o) => {
    const V = o.liste.version;
    const b = { ok: false, art: "", fehler: "", version: V, getauscht: [], entfernt: [], plugin: false, sicherung: "", zurueckgesetzt: false };
    const geschwister = geschwisterLeser(io), schreiben = [], loeschen = [];
    const weg = (pfad, alt) => { loeschen.push({ pfad, alt }); b.entfernt.push(pfad); };
    for (const e of o.liste.dateien) {
      if ((e.klasse !== "system" && e.klasse !== "seite") || (e.pfad.charAt(0) !== "." && !o.synchron)) continue;
      const kopien = kopienVon(e.pfad, await geschwister(e.pfad));
      if (!kopien.length) continue;
      if (e.klasse === "seite") {
        for (const k of kopien) {
          if (!neuer(V, k.version)) continue;
          const by = await io.lesen(k.pfad);
          if (by && (await sha256(by)) === e.sha256) weg(k.pfad, by);
        }
        continue;
      }
      // Kopien einer neueren Version als installiert.json (kommen evtl. gerade per Sync) bleiben unberührt
      const da = [];
      for (const k of kopien) {
        if (neuer(k.version, V)) continue;
        const by = await io.lesen(k.pfad);
        if (by) da.push({ pfad: k.pfad, bytes: by, sha: await sha256(by) });
      }
      const c = da.length ? await io.lesen(e.pfad) : null;
      if (!c) continue;
      if ((await sha256(c)) !== e.sha256) {
        const q = da.filter((k) => k.sha === e.sha256 && k.bytes.length === e.groesse)[0];
        if (!q) continue;
        const s = await sicherungsName(io, e.pfad, V, c);
        if (!s) continue;
        if (s.schreiben) schreiben.push({ pfad: s.pfad, bytes: c, alt: null });
        schreiben.push({ pfad: e.pfad, bytes: q.bytes, alt: c });
        b.getauscht.push({ pfad: e.pfad, sicherung: s.pfad });
      }
      for (const k of da) weg(k.pfad, k.bytes);
    }
    const reihe = kernZuletzt(schreiben);
    b.plugin = reihe.some((w) => kernDatei(w.pfad));
    if (reihe.length || loeschen.length) {
      const w = await schreibenSicher(io, reihe, loeschen, SICHERUNG + V + " " + stempel(o.zeit || new Date()), () => {});
      b.sicherung = w.sicherung;
      b.zurueckgesetzt = w.zurueckgesetzt;
      if (w.art) { b.art = w.art; b.fehler = w.fehler; b.getauscht = []; b.entfernt = []; b.plugin = false; return b; }
    }
    b.ok = true;
    b.art = "ok";
    return b;
  };

  // ---------- Dateien in Obsidian ----------
  const ad = () => app.vault.adapter;
  const TFile = obs.TFile;
  const istDatei = (f) => !!f && (TFile ? f instanceof TFile : !f.children);
  const ordnerAnlegen = async (pfad) => {
    const teile = pfad.split("/");
    let p = "";
    for (let i = 0; i < teile.length - 1; i++) {
      p = p ? p + "/" + teile[i] : teile[i];
      if (await ad().exists(p)) continue;
      if (p.charAt(0) === ".") await ad().mkdir(p);
      else { try { await app.vault.createFolder(p); } catch (e) { if (!(await ad().exists(p))) await ad().mkdir(p); } }
    }
  };
  const puffer = (bytes) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const io = {
    // frisch (Liste, Manifest): Minuten-Zeitstempel und „no-cache“ wie zentral.js, damit nie ein alter Stand zurückkommt
    holen: async (url, o) => {
      const Z = o && o.frisch && ctx.zentral && typeof ctx.zentral.frischUrl === "function" ? ctx.zentral : null;
      let r = await obs.requestUrl(Z ? { url: Z.frischUrl(url), method: "GET", headers: Object.assign({}, Z.FRISCH_KOPF), throw: false } : { url, method: "GET", throw: false });
      if (r.status === 304) r = await obs.requestUrl({ url: url + "?t=" + Date.now(), method: "GET", throw: false });
      if (r.status !== 200) throw new Error("HTTP " + r.status);
      return new Uint8Array(r.arrayBuffer);
    },
    lesen: async (pfad) => {
      const f = app.vault.getAbstractFileByPath(pfad);
      if (istDatei(f)) return new Uint8Array(await app.vault.readBinary(f));
      const st = await ad().stat(pfad);
      if (!st || st.type !== "file") return null;
      return new Uint8Array(await ad().readBinary(pfad));
    },
    schreiben: async (pfad, bytes) => {
      const f = app.vault.getAbstractFileByPath(pfad);
      if (istDatei(f)) { await app.vault.modifyBinary(f, puffer(bytes)); return; }
      await ordnerAnlegen(pfad);
      if (pfad.charAt(0) === ".") { await ad().writeBinary(pfad, puffer(bytes)); return; }
      try { await app.vault.createBinary(pfad, puffer(bytes)); } catch (e) { await ad().writeBinary(pfad, puffer(bytes)); }
    },
    loeschen: async (pfad) => {
      const f = app.vault.getAbstractFileByPath(pfad);
      if (istDatei(f)) { await app.vault.delete(f); return; }
      if (await ad().exists(pfad)) await ad().remove(pfad);
    },
    // Dateien direkt in einem Ordner ("" = Wurzel): sichtbare aus Obsidians Verzeichnis, .obsidian/… über den Adapter
    liste: async (ordner) => {
      if (ordner.charAt(0) !== ".") {
        const f = ordner ? app.vault.getAbstractFileByPath(ordner) : app.vault.getRoot();
        return f && f.children ? f.children.filter(istDatei).map((x) => x.path) : [];
      }
      const r = await ad().list(ordner);
      return r && Array.isArray(r.files) ? r.files : [];
    },
  };

  // ---------- Zustand ----------
  // bleibend: überlebt den Hot-Reload dieses Skripts (das Update ersetzt update.js womöglich selbst)
  const zustand = ctx.bleibend("zustand", () => ({ laeuft: false, heilt: false, installiert: "", bericht: null, fenster: null, marke: null }));
  const laufendeVersion = () => (ctx.plugin && ctx.plugin.manifest && ctx.plugin.manifest.version) || "0.0.0";
  const installiertVersion = () => zustand.installiert || laufendeVersion();
  const geraetId = () => { try { return ctx.zentral && typeof ctx.zentral.geraetId === "function" ? String(ctx.zentral.geraetId() || "") : ""; } catch (e) { return ""; } };
  // update.json lesen (beim Start und wenn sie sich ändert, auch per Sync); zustand.marke für anzeige() und hinweis()
  const markeNeu = async () => {
    let m = null;
    try { const by = await io.lesen(MARKE); m = by ? JSON.parse(dec(by)) : null; } catch (e) { m = null; }
    if (!m || typeof m !== "object" || Array.isArray(m)) m = null;
    const anders = JSON.stringify(m) !== JSON.stringify(zustand.marke || null);
    zustand.marke = m;
    if (anders) neuZeichnen();
    return m;
  };
  // → "fertigstellen" | "anderes" | null (markeLage mit dem Stand dieses Geräts)
  const lage = () => markeLage(zustand.marke, { installiert: installiertVersion(), ich: geraetId(), jetzt: Date.now(), laeuft: !!zustand.laeuft });
  const ANDERES = "Ein Update wird gerade auf einem anderen Gerät installiert.";
  const fertigText = () => `Das Update auf Version ${zustand.marke && zustand.marke.version} ist nicht fertig geworden.`;
  const listeLesen = async (pfad) => {
    try {
      const by = await io.lesen(pfad);
      if (!by) return null;
      const lp = listePruefen(JSON.parse(dec(by)));
      return lp.wert ? { liste: lp.wert, bytes: by } : null;
    } catch (e) { return null; }
  };
  const installiertNeu = async () => {
    const x = await listeLesen(INSTALLIERT);
    const v = x ? x.liste.version : "";
    if (v !== zustand.installiert) { zustand.installiert = v; neuZeichnen(); }
    return x;
  };
  // Erstinstallation: installiert.json fehlt, system-dateien.json ist da → einmal kopieren (sonst keine Datei schreiben)
  const installiertAnlegen = async () => {
    if (await ad().exists(INSTALLIERT)) { await installiertNeu(); return false; }
    const x = await listeLesen(LISTE);
    if (!x) return false;
    await io.schreiben(INSTALLIERT, x.bytes);
    zustand.installiert = x.liste.version;
    neuZeichnen();
    return true;
  };
  // Geänderte Vorgaben (VORGABE_NEU) auch nach einem Update mit einem älteren Planer, der sie noch nicht kennt (0.4.6: der
  // Planer von 0.4.4/0.4.5 mischt app.json nur): einmal je Gerät und Vorgabe, sobald die installierte Version sie mitbringt,
  // nur wo noch der alte Wert gilt. Über Obsidians Einstellungen (getConfig/setConfig), sonst schriebe Obsidian beim nächsten
  // Speichern seine Werte aus dem Speicher zurück. Wer danach etwas anderes wählt, behält es (Merker eba-update-vorgabe-<ab>).
  // vault: app.vault (Test: Ersatz) → [geänderte Schlüssel]
  const L_VORGABE = "eba-update-vorgabe-";
  const vorgabenAnwenden = (V, vault) => {
    const v = VORGABE_NEU[".obsidian/app.json"];
    if (!v || !V || neuer(v.ab, V) || lokal(L_VORGABE + v.ab)) return [];
    if (!vault || typeof vault.getConfig !== "function" || typeof vault.setConfig !== "function") return [];
    const geaendert = [];
    for (const k of Object.keys(v.werte)) if (vault.getConfig(k) === v.werte[k][0]) { vault.setConfig(k, v.werte[k][1]); geaendert.push(k); }
    lokal(L_VORGABE + v.ab, true);
    return geaendert;
  };
  // Reparatur (heilenMit) einmal je Gerät und installierter Version, nicht während eines Updates. Gerätelokal
  // eba-update-reparatur = Version; „Version lokal“, solange dieses Gerät synchronisierte Pfade nicht schreibt (ein Schreiber:
  // ctx.zentral.abruferHier, wie modell.js), dann noch einmal, sobald es darf. immer = true (Test): ohne Merker.
  const L_REPARATUR = "eba-update-reparatur";
  const heilen = async (immer) => {
    if (zustand.laeuft || zustand.heilt) return null;
    const x = await listeLesen(INSTALLIERT);
    if (!x) return null;
    const V = x.liste.version;
    try { vorgabenAnwenden(V, app.vault); } catch (e) { console.error("update: Vorgaben", e); }
    let synchron = true;
    try { if (ctx.zentral && typeof ctx.zentral.abruferHier === "function") synchron = !!(await ctx.zentral.abruferHier()); } catch (e) { synchron = false; }
    const merk = lokal(L_REPARATUR);
    if (!immer && (merk === V || (merk === V + " lokal" && !synchron))) return null;
    zustand.heilt = true;
    let b;
    try { b = await heilenMit(io, { liste: x.liste, synchron, zeit: new Date() }); } finally { zustand.heilt = false; }
    if (!b.ok) { console.error("update: Reparatur", b.fehler); return b; }
    lokal(L_REPARATUR, synchron ? V : V + " lokal");
    if (b.getauscht.length) {
      // Snippets neu einlesen (am PC sieht Obsidian die Änderung ohnehin, auf iPhone/iPad erst so)
      try { const css = app.customCss; if (css && typeof css.requestLoadSnippets === "function") css.requestLoadSnippets(); } catch (e) { /* egal */ }
      const neuStarten = b.plugin && !(await pluginNeuLaden());
      ctx.hinweis(`Version ${V} ist jetzt vollständig aktiv, deine geänderte Fassung liegt als Sicherung daneben.` +
        (neuStarten ? " Bitte Obsidian einmal schließen und wieder öffnen." : ""), { dauer: 12000 });
    }
    return b;
  };
  const stand = () => {
    try { const s = ctx.zentral && ctx.zentral.stand ? ctx.zentral.stand() : null; return { release: (s && s.release) || null, beta: (s && s.beta) || null, aktuell: (s && s.plugin_aktuell) || "" }; } catch (e) { return { release: null, beta: null, aktuell: "" }; }
  };
  const release = () => stand().release;
  // Kanal „stabil“ (Standard) oder „beta“: Feld update_kanal in System/Einstellungen.md (gilt für den ganzen Tresor)
  const EINSTELLUNGEN = "System/Einstellungen.md";
  const kanal = () => {
    try {
      const f = app.vault.getAbstractFileByPath(EINSTELLUNGEN), c = f && app.metadataCache.getFileCache(f);
      return c && c.frontmatter && c.frontmatter.update_kanal === "beta" ? "beta" : "stabil";
    } catch (e) { return "stabil"; }
  };
  const kanalSetzen = async (wert) => {
    const f = app.vault.getAbstractFileByPath(EINSTELLUNGEN);
    if (!f) return;
    await app.fileManager.processFrontMatter(f, (fm) => { fm.update_kanal = wert === "beta" ? "beta" : "stabil"; });
  };
  // Schalter „Beta-Versionen“ (im Fenster „Studium Autopilot“ unter „Mehr erfahren“, verbindungen.js)
  const kanalSchalter = (el) => {
    if (!obs.Setting) return;
    new obs.Setting(el).setName("Beta-Versionen").setDesc("Neue Versionen früher bekommen, zum Ausprobieren. Sie können noch Fehler haben.")
      .addToggle((t) => t.setValue(kanal() === "beta").onChange(async (an) => {
        await kanalSetzen(an ? "beta" : "stabil");
        // Notice statt Neuzeichnen des Fensters: der metadataCache kennt den neuen Wert erst gleich
        ctx.hinweis(an ? "Beta-Versionen an. Neue Testversionen erscheinen hier zuerst." : "Beta-Versionen aus. Du bekommst nur fertige Versionen.");
        setTimeout(neuZeichnen, 1200);
      }));
  };

  // ---------- Anzeige (Zeile „Studium Autopilot“ in eba-verbindungen) ----------
  // → { html, pille, symbol, ton, knopf: { aktion, text, cta? (false: normaler Knopf) } | null }
  // Ohne Angebot steht rechts **Nach Updates suchen** (seit 0.4.8), daneben „Mehr erfahren“ als Textlink (verbindungen.js).
  const SUCHEN = { aktion: "vorlage-suchen", text: "Nach Updates suchen", cta: false };
  const anzeige = () => {
    const inst = installiertVersion(), lauf = laufendeVersion(), s = stand(), k = kanal();
    const rel = s.release || (k === "beta" ? s.beta : null), neu = angebot(s.release, s.beta, k, inst);
    const zusatz = k === "beta" ? " Kanal: Beta." : "";
    if (zustand.laeuft) return { html: "Wird aktualisiert …", pille: `<span class="eba-pill info">läuft</span>`, symbol: "uhr", ton: "leise", knopf: null };
    const l = lage();
    if (l === "fertigstellen") {
      return { html: esc(fertigText()), pille: `<span class="eba-pill warn">unterbrochen</span>`, symbol: "laden", ton: "warn",
        knopf: { aktion: "vorlage-aktualisieren", text: "Update fertigstellen" } };
    }
    if (l === "anderes") return { html: esc(ANDERES), pille: `<span class="eba-pill info">läuft</span>`, symbol: "uhr", ton: "leise", knopf: null };
    if (neuer(inst, lauf)) {
      return { html: esc(`Version ${inst} ist da. Einmal neu laden, dann ist alles aktiv.`), pille: `<span class="eba-pill info">neu laden</span>`,
        symbol: "neu-laden", ton: "warn", knopf: { aktion: "vorlage-neu-laden", text: "Neu laden" } };
    }
    if (neu) {
      return { html: esc(`Neue ${istBeta(neu.version) ? "Beta-Version" : "Version"} ${neu.version} verfügbar.`) + (neu.notiz ? " " + esc(neu.notiz) : ""), pille: `<span class="eba-pill info">neu</span>`,
        symbol: "laden", ton: "warn", knopf: { aktion: "vorlage-aktualisieren", text: "Neue Version installieren" } };
    }
    // Rückfall laut Doku: nur plugin_aktuell (ohne release) → Link auf die Releases
    if (!neu && s.aktuell && neuer(s.aktuell, inst)) {
      const url = (ctx.zentral && ctx.zentral.RELEASES) || "https://github.com/studium-autopilot/ecoba/releases";
      return { html: `<a class="eba-vb-neu external-link" href="${esc(url)}" target="_blank" rel="noopener">${esc(`Neue Version ${s.aktuell} verfügbar`)}</a>`, pille: `<span class="eba-pill info">neu</span>`, symbol: "laden", ton: "warn", knopf: null };
    }
    if (rel) return { html: esc(`Version ${inst}. Du hast die neueste Version.${zusatz}`), pille: `<span class="eba-pill ok">aktuell</span>`, symbol: "haken", ton: "ok", knopf: SUCHEN };
    return { html: esc(`Version ${inst}.${zusatz}`), pille: "", symbol: "haken", ton: "leise", knopf: SUCHEN };
  };
  const status = () => ({ verbunden: true, version: installiertVersion(), laufend: laufendeVersion(), release: release(), kanal: kanal(), laeuft: !!zustand.laeuft });
  // verbindungen.neuZeichnen() zeichnet auch den Hinweis auf dem Dashboard neu (ctx.update.hinweisNeu)
  const neuZeichnen = () => { try { if (ctx.verbindungen && ctx.verbindungen.neuZeichnen) ctx.verbindungen.neuZeichnen(); else hinweisNeu(); } catch (e) { /* egal */ } };

  // ---------- Hinweis oben auf dem Dashboard (```eba-update-hinweis```, seit 0.3.1) ----------
  // Gleiche Logik wie anzeige(): „Neu laden“ nach einem Update, sonst die angebotene Version (Kanal stabil/beta), sonst der
  // Rückfall plugin_aktuell ohne release (Link auf die Releases). Kein Update → Block leer und unsichtbar (eba-uh-aus).
  // „Später“ blendet die Zeile für DIESE Version auf diesem Gerät aus (app.saveLocalStorage eba-update-spaeter = Version).
  const SPAETER = "eba-update-spaeter";
  const spaeter = () => { try { return app.loadLocalStorage(SPAETER) || ""; } catch (e) { return ""; } };
  // Unterbrochenes Update (lage): „Update fertigstellen“ bzw. der Satz ohne Knopf, beides ohne „Später“.
  const hinweis = () => {
    if (zustand.laeuft) return null;
    const inst = installiertVersion(), lauf = laufendeVersion(), s = stand(), l = lage();
    if (l === "fertigstellen") return { art: "fertig", version: zustand.marke.version, text: fertigText(), knopf: "Update fertigstellen", symbol: "laden" };
    if (l === "anderes") return { art: "anderes", version: zustand.marke.version, text: ANDERES, knopf: "", symbol: "uhr" };
    if (neuer(inst, lauf)) return { art: "laden", version: inst, text: `Version ${inst} ist da. Einmal neu laden.`, knopf: "Neu laden", symbol: "neu-laden" };
    const neu = angebot(s.release, s.beta, kanal(), inst);
    let h = null;
    if (neu) h = { art: "update", version: neu.version, text: `Neue ${istBeta(neu.version) ? "Beta-Version" : "Version"} ${neu.version} verfügbar.`, notiz: neu.notiz || "", knopf: "Neue Version installieren", symbol: "laden" };
    else if (s.aktuell && neuer(s.aktuell, inst)) h = { art: "link", version: s.aktuell, text: `Neue Version ${s.aktuell} verfügbar.`, knopf: "Ansehen", symbol: "laden",
      url: (ctx.zentral && ctx.zentral.RELEASES) || "https://github.com/studium-autopilot/ecoba/releases" };
    return h && spaeter() !== h.version ? h : null;
  };
  const svg = (n) => (ctx.verbindungen && ctx.verbindungen.svg ? ctx.verbindungen.svg(n) : "");
  const hinweisZeichnen = (el) => {
    el.empty();
    const h = hinweis();
    el.toggleClass("eba-uh-aus", !h);
    if (!h) return;
    const z = el.createDiv({ cls: "eba-uh", attr: { role: "status", "data-art": h.art } });
    z.createSpan({ cls: "eba-uh-symbol", attr: { "aria-hidden": "true" } }).innerHTML = svg(h.symbol);
    const t = z.createSpan({ cls: "eba-uh-text" });
    t.createEl("b", { text: h.text });
    // Nur der Titel; was neu ist, steht unter „Was ist neu“ (seit 17.10.2026 kein Satz im Hinweis).
    if (!h.knopf) return; // ein anderes Gerät installiert: nur der Satz
    const k = z.createSpan({ cls: "eba-uh-knoepfe" });
    if (h.art === "link") {
      k.createEl("a", { cls: "eba-vb-knopf cta eba-uh-knopf", text: h.knopf, href: h.url, attr: { target: "_blank", rel: "noopener" } });
    } else {
      const b = k.createEl("button", { cls: "eba-vb-knopf cta eba-uh-knopf", text: h.knopf, attr: { type: "button" } });
      b.addEventListener("click", () => {
        if (h.art === "laden") AKTIONEN["vorlage-neu-laden"].ausfuehren().catch((e) => console.error("update: neu laden", e));
        else aktualisieren().catch((e) => console.error("update", e));
      });
    }
    if (h.art === "update") {
      k.createEl("button", { cls: "eba-vb-knopf leise eba-uh-knopf eba-uh-neu", text: "Was ist neu", attr: { type: "button" } })
        .addEventListener("click", () => { neuigkeitenZeigen({ von: installiertVersion(), bis: h.version, angebot: { version: h.version, notiz: h.notiz } }); });
    }
    if (h.art === "update" || h.art === "link") {
      const sp = k.createEl("button", { cls: "eba-vb-knopf leise eba-uh-knopf eba-uh-spaeter", text: "Später", attr: { type: "button" } });
      // „Später“ zählt auch als Antwort auf den Hinweis beim Öffnen (sonst käme er gleich danach, weil die Zeile weg ist)
      sp.addEventListener("click", () => { try { app.saveLocalStorage(SPAETER, h.version); } catch (e) { /* egal */ } sitzungMerken(true); hinweisNeu(); });
    }
  };
  let hinweisGriff = null; // gesetzt in registrieren()
  // Kurz nach Start oder Rückkehr (START_FENSTER) darf ein später eintreffendes Angebot (voller Abruf) noch den Hinweis zeigen
  const hinweisNeu = () => {
    try { if (hinweisGriff) hinweisGriff.neu(); } catch (e) { /* egal */ }
    if (neuigkeit.start && Date.now() - neuigkeit.start < START_FENSTER) { try { toastPruefen(); } catch (e) { console.error("update: Hinweis", e); } }
  };

  // ---------- Fenster ----------
  const Modal = obs.Modal;
  const fragen = (rel) => new Promise((fertig) => {
    const p = plugin();
    if (typeof p.testUpdateAntwort === "boolean") { fertig(p.testUpdateAntwort); return; }
    const m = new Modal(app);
    let erledigt = false;
    m.modalEl.addClass("eba-modal", "eba-modal-update");
    m.titleEl.setText(`Auf Version ${rel.version} aktualisieren?`);
    const c = m.contentEl;
    if (rel.notiz) c.createEl("p", { cls: "eba-modal-text eba-modal-notiz", text: rel.notiz });
    // „Was ist neu“: dasselbe Fenster wie sonst; dort beantworten „Neue Version installieren“ / „Später“ diese Frage (kein zweites Fragen)
    c.createEl("button", { cls: "eba-modal-link", text: "Was ist neu", attr: { type: "button" } }).addEventListener("click", () => {
      erledigt = true;
      m.close();
      neuigkeitenZeigen({ von: installiertVersion(), bis: rel.version, angebot: rel, antwort: fertig });
    });
    c.createEl("p", { cls: "eba-modal-text", text: "Deine Noten, Termine und Notizen bleiben. Vorher wird eine Sicherung angelegt." });
    const d = c.createEl("details", { cls: "eba-modal-mehr" });
    d.createEl("summary", { text: "Mehr erfahren" });
    d.createEl("p", { text: "Hast du eine Seite selbst geändert, bleibt deine Fassung. Hat sich die Seite geändert, liegt die neue daneben." });
    d.createEl("p", { text: "Darstellung und Programmteile kommen immer neu. Hattest du sie geändert, liegt deine Fassung als Sicherung daneben." });
    d.createEl("p", { text: "Auf deinen anderen Geräten kommt das Update von selbst. Dort tippst du höchstens einmal auf „Neu laden“ oben auf dem Dashboard." });
    // Knöpfe wie im Fenster „Was ist neu“: PC und iPad nebeneinander, „Neue Version installieren“ rechts; iPhone untereinander, oben
    const k = c.createDiv({ cls: "modal-button-container" });
    const ab = k.createEl("button", { text: "Später" });
    const ok = k.createEl("button", { text: "Neue Version installieren", cls: "mod-cta" });
    ok.addEventListener("click", () => { erledigt = true; m.close(); fertig(true); });
    ab.addEventListener("click", () => m.close());
    m.onClose = () => { c.empty(); if (!erledigt) fertig(false); };
    m.open();
  });
  const name = (p) => p.split("/").pop().replace(/\.md$/, "");
  const FEHLERTEXT = {
    netz: "Die neue Version ließ sich gerade nicht laden. Es wurde nichts geändert. Versuch es später noch einmal.",
    pruefsumme: "Die neue Version kam nicht vollständig an. Es wurde nichts geändert. Versuch es später noch einmal.",
    liste: "Mit der neuen Version stimmt etwas nicht. Es wurde nichts geändert. Versuch es später noch einmal.",
    sicherung: "Die Sicherung ließ sich nicht anlegen. Es wurde nichts geändert.",
    schreiben: "Beim Speichern ging etwas schief. Alles wurde auf den alten Stand zurückgesetzt.",
  };
  const ergebnisZeigen = (b) => {
    if (!Modal) return;
    const m = new Modal(app);
    zustand.fenster = m;
    m.modalEl.addClass("eba-modal", "eba-modal-update");
    const c = m.contentEl;
    const text = (t, cls) => c.createEl("p", { cls: cls || "eba-modal-text", text: t });
    if (!b.ok) {
      m.titleEl.setText("Nicht aktualisiert");
      text(FEHLERTEXT[b.art] || FEHLERTEXT.netz);
      if (b.fehler) text(b.fehler, "eba-modal-hinweis");
    } else {
      m.titleEl.setText(`Fertig: Version ${b.version}`);
      const n = b.geaendert.length + b.angelegt.length + b.gemischt.length + b.haken.length + b.einstellungen.length;
      text(n ? `${n} ${n === 1 ? "Datei" : "Dateien"} aktualisiert. Deine Einträge sind geblieben.` : "Alles war schon aktuell.", "eba-modal-erfolg");
      if (b.neuKopien.length) {
        text("Diese Seiten hattest du geändert. Deine Fassung bleibt, die neue liegt daneben („neu " + b.version + "“):");
        const ul = c.createEl("ul", { cls: "eba-modal-schritte" });
        for (const x of b.neuKopien) ul.createEl("li", { text: name(x.pfad) });
      }
      if (b.gesichert && b.gesichert.length) text(`Darstellung oder Programmteile hattest du selbst geändert (${b.gesichert.map((x) => x.pfad.split("/").pop()).join(", ")}). Jetzt gilt die neue Version, deine Fassung liegt als Sicherung daneben („deine Fassung vor ${b.version}“).`);
      if (b.behalten.length) text("Diese Seiten gibt es in der neuen Version nicht mehr. Du hattest sie geändert, darum bleiben sie: " + b.behalten.map(name).join(", ") + ".");
      if (b.plugin && !b.neuGeladen) text("Bitte Obsidian einmal schließen und wieder öffnen.");
      else if (b.einstellungen.length) text("Einstellungen wurden ergänzt. Sie wirken nach dem nächsten Öffnen von Obsidian.");
      text("Auf deinen anderen Geräten kommt das Update von selbst. " + (b.plugin ? "Dort einmal auf „Neu laden“ oben auf dem Dashboard tippen." : "Dort musst du nichts tun."), "eba-modal-hinweis");
      if (b.sicherung) text(`Die Sicherung liegt im versteckten Ordner „${b.sicherung}“ in deinem Tresor. Am PC oder Mac kannst du ihn öffnen.`, "eba-modal-hinweis");
    }
    // Reihenfolge wie im Fenster vor dem Update: Hauptknopf zuletzt (PC/iPad rechts, iPhone oben)
    const k = c.createDiv({ cls: "modal-button-container" });
    if (b.ok && b.vorher) k.createEl("button", { text: "Was ist neu" }).addEventListener("click", () => { m.close(); neuigkeitenZeigen({ von: b.vorher, bis: b.version }); });
    k.createEl("button", { text: "Fertig", cls: "mod-cta" }).addEventListener("click", () => m.close());
    m.onClose = () => { c.empty(); if (zustand.fenster === m) zustand.fenster = null; };
    m.open();
  };

  // ---------- Plugin neu laden (neuer Kern) ----------
  const pluginNeuLaden = async () => {
    const pl = app.plugins;
    if (!pl || typeof pl.disablePlugin !== "function" || typeof pl.enablePlugin !== "function") return false;
    try {
      const alt = pl.plugins && pl.plugins[PLUGIN_ID];
      const sprachen = alt && alt.bloecke ? Object.keys(alt.bloecke) : [];
      await pl.disablePlugin(PLUGIN_ID);
      // Codeblock-Prozessoren, die nach dem Entladen noch angemeldet sind (Kern vor 0.2.0: Hot-Reload während des Entladens),
      // abmelden – sonst bekäme die neue Instanz „already registered“ und die Codeblöcke blieben leer
      const M = obs.MarkdownPreviewRenderer;
      try {
        if (M && M.codeBlockPostProcessors && typeof M.unregisterCodeBlockPostProcessor === "function") {
          for (const s of sprachen) if (M.codeBlockPostProcessors[s]) M.unregisterCodeBlockPostProcessor(s);
        }
      } catch (e) { console.error("update: Codeblöcke abmelden", e); }
      if (typeof pl.loadManifests === "function") await pl.loadManifests();
      await pl.enablePlugin(PLUGIN_ID);
      return !!(pl.plugins && pl.plugins[PLUGIN_ID]);
    } catch (e) { console.error("update: Plugin neu laden", e); return false; }
  };

  // ---------- Ablauf nach dem Tipp auf „Neue Version installieren“ bzw. „Update fertigstellen“ ----------
  // Installiert gerade ein anderes Gerät (lage „anderes“), nur der Satz. Fertigstellen derselben Version fragt nicht noch einmal
  // (du hattest schon bestätigt); ein zweiter Lauf lädt und schreibt nur, was noch fehlt.
  const aktualisieren = async () => {
    if (zustand.laeuft) return null;
    if (!ctx.zentral || !ctx.zentral.manifestHolen) { ctx.hinweis("Das geht gerade nicht. Bitte später noch einmal versuchen."); return null; }
    await markeNeu();
    const l = lage();
    if (l === "anderes") { ctx.hinweis(ANDERES + " Öffne Obsidian dort, dann kommt es hierher."); return null; }
    let rel;
    const inst = installiertVersion();
    try { const m = await ctx.zentral.manifestHolen(); rel = angebot(m.release, m.beta, kanal(), inst); } catch (e) {
      const b = { ok: false, art: "netz", fehler: (e && e.message) || String(e) };
      zustand.bericht = b; ergebnisZeigen(b); return b;
    }
    neuZeichnen();
    if (!rel) { ctx.hinweis(`Du hast schon die neueste Version (${inst}).`); return null; }
    const fertig = l === "fertigstellen" && zustand.marke && rel.version === zustand.marke.version;
    if (!fertig && !(await fragen(rel))) return null;
    const ich = geraetId();
    const p = plugin();
    if (p.testUpdateBasis) rel = Object.assign({}, rel, { url_basis: String(p.testUpdateBasis) });
    zustand.laeuft = true;
    neuZeichnen();
    const fortschritt = ctx.hinweis("Lade die neue Version …", { dauer: 0 });
    let b;
    try {
      p.stillBis = Date.now() + 120000; // Kern: keine „Aktualisiert: …“-Hinweise beim Hot-Reload der Skripte
      const alt = (await listeLesen(INSTALLIERT)) || (await listeLesen(LISTE));
      b = await aktualisierenMit(io, { release: rel, alt: alt ? alt.liste : null, altVersion: inst, zeit: new Date(),
        marke: ich ? { geraet: ich, seit: new Date().toISOString() } : null,
        fortschritt: (t) => { try { if (fortschritt) fortschritt.setMessage(t); } catch (e) { /* egal */ } } });
      if (b.ok) {
        zustand.installiert = rel.version;
        b.vorher = inst;
        lokal(L_GESEHEN, rel.version); // dieses Gerät sieht das Ergebnisfenster, also kein „Aktualisiert auf …“ danach
        if (b.plugin) b.neuGeladen = await pluginNeuLaden();
      }
    } catch (e) {
      console.error("update", e);
      b = { ok: false, art: "schreiben", fehler: (e && e.message) || String(e) };
    } finally {
      try { if (fortschritt) fortschritt.hide(); } catch (e) { /* egal */ }
      zustand.laeuft = false;
      p.stillBis = Date.now() + 5000;
    }
    zustand.bericht = b;
    // Nach dem Neuladen gehört die Anzeige der neuen Plugin-Instanz (die alte darf nichts mehr zeichnen)
    if (!b.neuGeladen) { await markeNeu(); neuZeichnen(); }
    ergebnisZeigen(b);
    return b;
  };

  // ---------- Nach Updates suchen (Knopf in der Zeile „Studium Autopilot“ und Befehl, seit 0.4.8) ----------
  // Holt das Manifest sofort, ohne die Wartezeit der automatischen Prüfung (zählt als Prüfung: eba-update-geprueft), und sagt das
  // Ergebnis in einem Hinweis: das Angebot mit „Neue Version installieren“ und „Was ist neu“, sonst „Du hast die neueste
  // Version.“ → "angebot" | "aktuell" | "laden" | "link" | "fertigstellen" | "anderes" | "fehler" | null (läuft gerade)
  const suchen = async () => {
    if (zustand.laeuft) return null;
    if (!ctx.zentral || !ctx.zentral.manifestHolen) { ctx.hinweis("Das geht gerade nicht. Bitte später noch einmal versuchen."); return "fehler"; }
    lokal(L_GEPRUEFT, Date.now());
    try { await ctx.zentral.manifestHolen(); } catch (e) {
      console.error("update: Nach Updates suchen", e);
      ctx.hinweis("Keine Verbindung. Versuch es später noch einmal.");
      return "fehler";
    }
    await markeNeu();
    neuZeichnen();
    const inst = installiertVersion(), lauf = laufendeVersion(), s = stand(), l = lage();
    if (l === "anderes") { ctx.hinweis(ANDERES + " Öffne Obsidian dort, dann kommt es hierher."); return l; }
    if (l === "fertigstellen") { ctx.hinweis(fertigText(), { aktion: { text: "Update fertigstellen", ausfuehren: () => aktualisieren() } }); return l; }
    if (neuer(inst, lauf)) { ctx.hinweis(`Version ${inst} ist da. Einmal neu laden.`, { aktion: { text: "Neu laden", aktion: "vorlage-neu-laden" } }); return "laden"; }
    const a = angebot(s.release, s.beta, kanal(), inst);
    if (a) {
      sitzungMerken(true);
      lokal(L_TOAST, { version: a.version, zeit: Date.now() });
      toastZeigen({ text: `Neue ${istBeta(a.version) ? "Beta-Version" : "Version"} ${a.version} ist da.`, angebot: a, von: inst, bis: a.version });
      return "angebot";
    }
    if (s.aktuell && neuer(s.aktuell, inst)) {
      ctx.hinweis(`Neue Version ${s.aktuell} ist da.`, { aktion: { text: "Ansehen", ausfuehren: () => { window.open(releasesUrl(), "_blank"); } } });
      return "link";
    }
    ctx.hinweis("Du hast die neueste Version.");
    return "aktuell";
  };

  // ---------- Neuigkeiten: frische Prüfung beim Start, Hinweis (Notice) und „Was ist neu“ (seit 0.4.1) ----------
  // Die frische Prüfung holt nur das Manifest (ctx.zentral.manifestHolen, ohne Abrufer-Sperre, schreibt keine Datei). Der volle
  // Abruf von zentral.js bleibt unverändert; ruft er kurz nach dem Start, kommt das Manifest einmal mehr (wenige KB).
  const MIN = 60e3, STUNDE = 60 * MIN;
  const PRUEFEN_NACH = 30 * MIN;      // Manifest frisch holen, wenn die letzte Prüfung länger her ist
  const PAUSE_NEUSTART = 6 * STUNDE;  // so lange im Hintergrund zählt die Rückkehr wie ein App-Start
  const TOAST_ABSTAND = 12 * STUNDE;  // Hinweis für dieselbe Version höchstens so oft
  const START_FENSTER = 10 * MIN;     // so lange nach Start/Rückkehr darf ein später eintreffendes Angebot den Hinweis zeigen
  const CHANGELOG_MAX = 262144;       // Bytes
  const ABSCHNITTE_MAX = 8;
  const L_GEPRUEFT = "eba-update-geprueft", L_TOAST = "eba-update-toast", L_GESEHEN = "eba-update-gesehen";
  const S_TOAST = "eba-update-toast-sitzung"; // sessionStorage: Hinweis in dieser App-Sitzung schon gezeigt

  // CHANGELOG.md → [{ version, titel, text }] in Dateireihenfolge. Nur Überschriften „## X.Y.Z – Titel“ (auch X.Y.Z-beta.N);
  // andere Überschriften (z. B. „## Unveröffentlicht“) beenden den Abschnitt davor und zählen nicht.
  const KOPF = /^## +(\d{1,4}\.\d{1,4}\.\d{1,4}(?:-beta\.\d{1,4})?)(?: +[–-] +(.*?))? *$/;
  const changelogAbschnitte = (text) => {
    const aus = [];
    let akt = null;
    for (const z of String(text || "").split(/\r?\n/)) {
      if (/^#{1,2} /.test(z)) {
        const m = z.match(KOPF);
        akt = m ? { version: m[1], titel: (m[2] || "").trim(), zeilen: [] } : null;
        if (akt) aus.push(akt);
      } else if (akt) akt.zeilen.push(z);
    }
    return aus.map((a) => ({ version: a.version, titel: a.titel, text: a.zeilen.join("\n").trim() }));
  };
  // Abschnitte nach „von“ (ausschließlich) bis „bis“ (einschließlich), neueste zuerst, höchstens ABSCHNITTE_MAX.
  // „von“ leer oder ungültig → nur der Abschnitt von „bis“.
  const abschnitteZwischen = (liste, von, bis) => {
    if (!semver(bis)) return [];
    const gesehen = {};
    return (liste || []).filter((a) => {
      if (!a || hat(gesehen, a.version) || neuer(a.version, bis)) return false;
      gesehen[a.version] = true;
      return semver(von) ? neuer(a.version, von) : a.version === bis;
    }).sort((a, b) => (neuer(a.version, b.version) ? -1 : neuer(b.version, a.version) ? 1 : 0)).slice(0, ABSCHNITTE_MAX);
  };
  // Changelog-Text entschärfen, bevor MarkdownRenderer ihn zeichnet: kein HTML, keine Einbettungen, Wikilinks oder Kommentare,
  // keine Codeblöcke (```eba-… würde Codeblöcke des Plugins starten). Links prüft linksSaeubern danach (nur https).
  // Umbrochene Zeilen (Changelog auf 120 Zeichen) werden verbunden, sonst zeigt Obsidian dort einen Zeilenumbruch.
  const zeilenVerbinden = (zeilen) => {
    const aus = [];
    for (const z of zeilen) {
      const fortsetzung = /\S/.test(z) && !/^\s*([-*+]|\d+[.)]) /.test(z) && !/^\s*[#>|]/.test(z);
      if (fortsetzung && aus.length && /\S/.test(aus[aus.length - 1])) aus[aus.length - 1] += " " + z.trim();
      else aus.push(z);
    }
    return aus;
  };
  const markdownSicher = (text) => zeilenVerbinden(String(text || "").split(/\r?\n/).filter((z) => !/^\s*(```|~~~)/.test(z))).join("\n")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/!\[/g, "\\![").replace(/\[\[/g, "\\[\\[").replace(/\]\]/g, "\\]\\]").replace(/%%/g, "\\%\\%");
  // Hinweis für diese Version zeigen? merk = { version, zeit } vom letzten Hinweis auf diesem Gerät
  const toastFaellig = (merk, version, jetzt) => !merk || merk.version !== version || !(jetzt - Number(merk.zeit) < TOAST_ABSTAND);
  // Nach einem Update. gesehen = zuletzt auf diesem Gerät gelaufene Version. → { von, bis } (einmal „Aktualisiert auf bis“),
  // "merken" (erster Lauf auf diesem Gerät oder ältere Version: still merken) oder null (nichts zu tun; auch solange
  // „Neu laden“ aussteht, weil installiert.json schon eine neuere Version zeigt als der laufende Kern)
  const nachUpdate = (gesehen, laufend, installiert) => {
    if (!semver(laufend) || neuer(installiert, laufend)) return null;
    if (!semver(gesehen)) return "merken";
    if (neuer(laufend, gesehen)) return { von: gesehen, bis: laufend };
    return gesehen === laufend ? null : "merken";
  };
  // Manifest frisch holen? geprueftIso = letzter voller Abruf (zentral.js), eigeneMs = letzte eigene Prüfung
  const pruefungFaellig = (geprueftIso, eigeneMs, jetzt) => !(jetzt - Math.max(Date.parse(geprueftIso || "") || 0, Number(eigeneMs) || 0) < PRUEFEN_NACH);

  // Zustand (überlebt den Hot-Reload): Start des Fensters, Zeit des Verbergens, offenes Fenster, geladene Changelogs je Version
  const neuigkeit = ctx.bleibend("neuigkeit", () => ({ start: 0, versteckt: 0, verdeckt: false, fenster: null, changelog: {} }));
  const lokal = (k, v) => {
    if (v === undefined) { try { return app.loadLocalStorage(k); } catch (e) { return null; } }
    try { app.saveLocalStorage(k, v); } catch (e) { /* egal */ }
    return v;
  };
  const sitzungGezeigt = () => { try { return !!window.sessionStorage.getItem(S_TOAST); } catch (e) { return false; } };
  const sitzungMerken = (an) => { try { if (an) window.sessionStorage.setItem(S_TOAST, "1"); else window.sessionStorage.removeItem(S_TOAST); } catch (e) { /* egal */ } };
  const zentralAn = () => { try { return !!(ctx.zentral && ctx.zentral.status().an); } catch (e) { return false; } };
  const einrichtungOffen = () => { try { const e = ctx.einrichtung; return !!(e && (e.fenster || e.sollZeigen())); } catch (e) { return false; } };
  const releasesUrl = () => (ctx.zentral && ctx.zentral.RELEASES) || "https://github.com/studium-autopilot/ecoba/releases";

  // Nur das Manifest, und nur wenn die letzte Prüfung über PRUEFEN_NACH her ist. Zentrale Daten aus → nie (dann ruft das Plugin
  // laut docs/datenschutz.md nichts bei GitHub ab). → true, wenn geholt
  const frischPruefen = async () => {
    if (plugin().testZentralAus || !zentralAn() || !ctx.zentral.manifestHolen || ctx.zentral.laeuft) return false;
    let s = null;
    try { s = ctx.zentral.stand(); } catch (e) { s = null; }
    if (!pruefungFaellig(s && s.geprueft, lokal(L_GEPRUEFT), Date.now())) return false;
    lokal(L_GEPRUEFT, Date.now());
    try { await ctx.zentral.manifestHolen(); } catch (e) { return false; } // kein Netz: letzter Stand bleibt
    neuZeichnen();
    return true;
  };

  // Hinweis zeigen, wenn fällig. → "angebot" | "aktualisiert" | null
  // Entscheidung (rein). o = { angebot, neuLaden, merk, jetzt, nach, bannerSichtbar } → "angebot" | "aktualisiert" | "verdeckt"
  // (die Zeile oben auf dem Dashboard zeigt das Angebot gerade sichtbar: kein Hinweis, zählt nicht gegen den Abstand) | null
  const toastEntscheiden = (o) => {
    if (o.angebot && !o.neuLaden) {
      if (!toastFaellig(o.merk, o.angebot.version, o.jetzt)) return null;
      return o.bannerSichtbar ? "verdeckt" : "angebot";
    }
    return o.nach && o.nach !== "merken" ? "aktualisiert" : null;
  };
  // Zeile ```eba-update-hinweis``` mit Angebot gerade sichtbar? Nur gezeichnete Blöcke im DOM mit Fläche (Tabs im Hintergrund,
  // die versteckte Editor-Kopie der Leseansicht und verborgene Fenster haben keine), in einem sichtbaren Fenster.
  const bannerSichtbar = () => {
    let liste = [];
    try { liste = hinweisGriff ? hinweisGriff.instanzen() : []; } catch (e) { liste = []; }
    return liste.some((i) => {
      const z = i && i.el && i.el.isConnected ? i.el.querySelector('.eba-uh[data-art="update"]') : null;
      if (!z || z.getClientRects().length === 0) return false;
      const d = z.ownerDocument;
      return !d || d.visibilityState !== "hidden";
    });
  };
  // Hinweis zeigen, wenn fällig. → "angebot" | "aktualisiert" | "verdeckt" | null
  const toastPruefen = () => {
    if (typeof ctx.hinweis !== "function" || sitzungGezeigt() || zustand.laeuft || zustand.fenster || neuigkeit.fenster || einrichtungOffen()) return null;
    if (!(app.metadataCache.initialized || app.metadataCache.resolved)) return null; // Kanal und Einrichtung stehen im Frontmatter
    const inst = installiertVersion(), lauf = laufendeVersion(), s = stand();
    const n = nachUpdate(lokal(L_GESEHEN), lauf, inst);
    if (n) lokal(L_GESEHEN, lauf);
    // Unterbrochenes Update (lage): kein Angebot, die Zeile oben auf dem Dashboard sagt, was los ist
    const a = lage() ? null : angebot(s.release, s.beta, kanal(), inst);
    const e = toastEntscheiden({ angebot: a, neuLaden: neuer(inst, lauf), merk: lokal(L_TOAST), jetzt: Date.now(), nach: n,
      bannerSichtbar: !!a && bannerSichtbar() });
    neuigkeit.verdeckt = e === "verdeckt"; // beim nächsten Wechsel der Ansicht noch einmal prüfen (registrieren)
    if (e === "angebot") {
      sitzungMerken(true);
      lokal(L_TOAST, { version: a.version, zeit: Date.now() });
      toastZeigen({ text: `Neue ${istBeta(a.version) ? "Beta-Version" : "Version"} ${a.version} ist da.`, angebot: a, von: inst, bis: a.version });
    } else if (e === "aktualisiert") {
      sitzungMerken(true);
      toastZeigen({ text: `Aktualisiert auf Version ${n.bis}.`, angebot: null, von: n.von, bis: n.bis });
    }
    return e;
  };
  // Hinweis mit Knöpfen (ctx.hinweis, Gestalt CSS Abschnitt „Neuigkeiten“, ≥ 44 px). Antippen irgendwo blendet ihn aus.
  const toastZeigen = (t) => {
    const was = { text: "Was ist neu", ausfuehren: () => { neuigkeitenZeigen({ von: t.von, bis: t.bis, angebot: t.angebot }); } };
    const knoepfe = t.angebot ? [{ text: "Neue Version installieren", ausfuehren: () => aktualisieren() }, was] : [was];
    return ctx.hinweis(t.text, { aktion: knoepfe, dauer: t.angebot ? 30000 : 15000 });
  };

  // ---------- Fenster „Was ist neu“ ----------
  // CHANGELOG.md am Tag v<version> (gleiche Adresse wie die Dateien des Updates, siehe releasePruefen in zentral.js)
  const changelogUrl = (version) => {
    const p = plugin();
    if (p.testUpdateBasis) return String(p.testUpdateBasis).replace(/\/?$/, "/") + "CHANGELOG.md";
    const roh = (ctx.zentral && ctx.zentral.RELEASE_ROH) || "https://raw.githubusercontent.com/studium-autopilot/ecoba/";
    return semver(version) ? roh + "v" + version + "/CHANGELOG.md" : "";
  };
  const changelogHolen = async (version) => {
    if (hat(neuigkeit.changelog, version)) return neuigkeit.changelog[version];
    const url = changelogUrl(version);
    if (!url) throw new Error("Version ungültig");
    const by = await io.holen(url);
    if (by.length > CHANGELOG_MAX) throw new Error("CHANGELOG.md zu groß");
    const liste = changelogAbschnitte(dec(by));
    neuigkeit.changelog[version] = liste;
    return liste;
  };
  // Nach dem Zeichnen: nur https-Links (in neuem Fenster), alles andere wird Text; keine Bilder oder eingebetteten Inhalte
  const linksSaeubern = (el) => {
    for (const x of Array.from(el.querySelectorAll("img, iframe, video, audio, object, embed, script, style"))) x.remove();
    for (const a of Array.from(el.querySelectorAll("a"))) {
      const href = a.getAttribute("href") || "";
      if (/^https:\/\//i.test(href) && !a.classList.contains("internal-link")) { a.setAttribute("target", "_blank"); a.setAttribute("rel", "noopener"); a.classList.add("external-link"); }
      else a.replaceWith(a.ownerDocument.createTextNode(a.textContent || ""));
    }
  };
  const abschnitteZeichnen = async (el, o, comp) => {
    let liste = [];
    try { liste = abschnitteZwischen(await changelogHolen(o.bis), o.von, o.bis); } catch (e) { liste = []; }
    if (!el.isConnected) return 0; // Fenster schon zu
    el.empty();
    for (const a of liste) {
      const sek = el.createDiv({ cls: "eba-neu-version" });
      sek.createEl("h3", { cls: "eba-neu-titel", text: a.version + (a.titel ? " – " + a.titel : "") });
      const t = sek.createDiv({ cls: "eba-neu-text" });
      if (obs.MarkdownRenderer && comp) await obs.MarkdownRenderer.render(app, markdownSicher(a.text), t, "", comp);
      else t.setText(a.text);
      linksSaeubern(t);
    }
    if (!liste.length) {
      // Rückfall: Notiz aus dem Manifest und Link auf das Release
      el.createEl("p", { cls: "eba-modal-text", text: o.angebot && o.angebot.notiz ? o.angebot.notiz : "Die Liste der Änderungen lässt sich gerade nicht laden." });
      el.createEl("p", { cls: "eba-modal-hinweis" }).createEl("a", { text: "Auf GitHub ansehen", href: releasesUrl() + "/tag/v" + o.bis,
        cls: "external-link", attr: { target: "_blank", rel: "noopener" } });
    }
    return liste.length;
  };
  // o = { von, bis, angebot, antwort } – angebot (aus dem Manifest) → Knöpfe „Später“ und „Neue Version installieren“, sonst „Fertig“.
  // antwort(ja): aus dem Fenster vor dem Update geöffnet; „Neue Version installieren“ → antwort(true), sonst beim Schließen antwort(false)
  const neuigkeitenZeigen = (o) => {
    if (!Modal) { if (o.antwort) o.antwort(false); return null; }
    if (neuigkeit.fenster) neuigkeit.fenster.close();
    let geantwortet = false;
    const antworten = (ja) => { if (o.antwort && !geantwortet) { geantwortet = true; o.antwort(ja); } };
    const m = new Modal(app);
    neuigkeit.fenster = m;
    const comp = obs.Component ? new obs.Component() : null;
    if (comp) comp.load();
    m.modalEl.addClass("eba-modal", "eba-modal-neu");
    m.titleEl.setText("Was ist neu");
    const c = m.contentEl;
    c.createEl("p", { cls: "eba-modal-text", text: o.angebot ? `Version ${o.bis} ist da. Du hast Version ${o.von}.` : `Du hast jetzt Version ${o.bis}.` });
    const liste = c.createDiv({ cls: "eba-neu-liste" });
    liste.createEl("p", { cls: "eba-modal-text", text: "Lädt …" });
    const k = c.createDiv({ cls: "modal-button-container" });
    if (o.angebot) {
      k.createEl("button", { text: "Später" }).addEventListener("click", () => m.close());
      k.createEl("button", { text: "Neue Version installieren", cls: "mod-cta" }).addEventListener("click", () => {
        if (o.antwort) { antworten(true); m.close(); return; }
        m.close(); aktualisieren().catch((e) => console.error("update", e));
      });
    } else k.createEl("button", { text: "Fertig", cls: "mod-cta" }).addEventListener("click", () => m.close());
    m.onClose = () => { if (comp) comp.unload(); c.empty(); if (neuigkeit.fenster === m) neuigkeit.fenster = null; antworten(false); };
    m.open();
    m.geladen = abschnitteZeichnen(liste, o, comp).catch((e) => { console.error("update: Was ist neu", e); return 0; });
    return m;
  };

  ctx.update = {
    // reine Logik (Node-Tests)
    klasseVon, pfadOk, neuName, deineName, kopienVon, listePruefen, teilen, ohneHaken, hatAufgaben, seiteHaken, fmMischen, modulMischen, jsonMischen,
    jsonMischenText, VORGABE_NEU, vorgabenAnwenden, lesezeichenOhne, planen, aktualisierenMit, heilenMit, sha256, neuer, angebot, kanal, kanalSetzen, kanalSchalter, PERSOENLICH, ORDNER, LISTE, INSTALLIERT,
    markeLage, MARKE, MARKE_STILL,
    // Obsidian
    io, anzeige, status, aktualisieren, suchen, markeNeu, installiertAnlegen, heilen, pluginNeuLaden, ergebnisZeigen, hinweis, hinweisNeu, SPAETER, L_REPARATUR,
    // Neuigkeiten (reine Logik zuerst)
    changelogAbschnitte, abschnitteZwischen, markdownSicher, toastFaellig, toastEntscheiden, nachUpdate, pruefungFaellig,
    frischPruefen, toastPruefen, neuigkeitenZeigen, L_GEPRUEFT, L_TOAST, L_GESEHEN, S_TOAST,
    get letzterBericht() { return zustand.bericht; },
    get fenster() { return zustand.fenster; },
    get neuigkeiten() { return neuigkeit.fenster; },
  };

  const registrieren = () => {
    // Hinweis oben auf dem Dashboard; neu gezeichnet über hinweisNeu() (nach Abruf, Update, Kanalwechsel, „Später“)
    hinweisGriff = ctx.codeblock("eba-update-hinweis", (quelle, el) => {
      try { hinweisZeichnen(el); } catch (e) { console.error("eba-update-hinweis", e); el.empty(); el.addClass("eba-uh-aus"); }
    });
    // installiert.json: beim Start (nach 20 s, damit ein Sync sie vorher liefern kann) anlegen bzw. lesen; Änderungen per Sync
    // Timer nur, wenn es etwas anzulegen gibt (Liste da, installiert.json fehlt) – sonst kein Timer
    if (app.vault.getAbstractFileByPath(LISTE) && !app.vault.getAbstractFileByPath(INSTALLIERT)) {
      ctx.zeit(() => { installiertAnlegen().catch((e) => console.error("update: installiert.json", e)); }, 20000);
    }
    installiertNeu().catch(() => {});
    const bald = ctx.entprellen(() => { installiertNeu().catch(() => {}); }, 1500);
    // Reparatur nach einem Update (heilen): 30 s nach dem Laden (Sync und Hot-Reload zuerst) und nach jeder neuen installiert.json
    const reparatur = ctx.entprellen(() => { heilen(false).catch((e) => console.error("update: Reparatur", e)); }, 30000);
    reparatur();
    // Neue installiert.json über den Sync (Update auf einem anderen Gerät): eine Minute keine „Aktualisiert: …“-Hinweise für die
    // Skripte, die mit ihr kommen; die Zeile „Version … ist da. Einmal neu laden.“ sagt es einmal (Kern: stillBis)
    const syncStill = () => { if (!zustand.laeuft) { const p = plugin(); p.stillBis = Math.max(Number(p.stillBis) || 0, Date.now() + 60000); } };
    // update.json (unterbrochenes Update, auch von einem anderen Gerät per Sync): beim Start und bei jeder Änderung lesen
    markeNeu().catch(() => {});
    const baldMarke = ctx.entprellen(() => { markeNeu().catch(() => {}); }, 1500);
    for (const ev of ["create", "modify", "delete"]) ctx.an(app.vault, ev, (f) => {
      if (f && f.path === INSTALLIERT) { syncStill(); bald(); reparatur(); } else if (f && f.path === MARKE) baldMarke();
    });
    // Neuigkeiten: 4 s nach dem Einlesen frisch prüfen, dann Hinweis, wenn fällig. Zurück in der App: nach 15 s (zentral.js holt
    // nach 5 s nach, wenn es lange her ist; danach ist die Prüfung frisch, also kein zweiter Abruf). Über 6 h im Hintergrund
    // zählt wie ein neuer App-Start (Hinweis darf wieder erscheinen; der Abstand von 12 h je Version gilt weiter).
    const startLauf = () => {
      neuigkeit.start = Date.now();
      frischPruefen().catch(() => false).then(() => { try { toastPruefen(); } catch (e) { console.error("update: Hinweis", e); } });
    };
    if (app.metadataCache.initialized || app.metadataCache.resolved) ctx.zeit(startLauf, 4000);
    else { const r = ctx.an(app.metadataCache, "resolved", () => { app.metadataCache.offref(r); ctx.zeit(startLauf, 4000); }); }
    // Zeigte die Dashboard-Zeile das Angebot, als der Hinweis fällig war: beim Wechsel auf eine andere Seite noch einmal prüfen
    const nachWechsel = ctx.entprellen(() => { if (neuigkeit.verdeckt) { try { toastPruefen(); } catch (e) { console.error("update: Hinweis", e); } } }, 800);
    for (const ev of ["active-leaf-change", "file-open"]) ctx.an(app.workspace, ev, () => { if (neuigkeit.verdeckt) nachWechsel(); });
    ctx.dom(document, "visibilitychange", () => {
      if (document.visibilityState === "hidden") { neuigkeit.versteckt = Date.now(); return; }
      if (document.visibilityState !== "visible" || !neuigkeit.versteckt) return;
      if (Date.now() - neuigkeit.versteckt >= PAUSE_NEUSTART) sitzungMerken(false);
      neuigkeit.versteckt = 0;
      ctx.zeit(startLauf, 15000);
    });
  };

  const AKTIONEN = {
    "vorlage-aktualisieren": { titel: "Neue Version installieren", ausfuehren: async () => { await aktualisieren(); } },
    "vorlage-suchen": { titel: "Nach Updates suchen", ausfuehren: async () => { await suchen(); } },
    "vorlage-neu-laden": {
      titel: "Neu laden",
      ausfuehren: async () => { if (!(await pluginNeuLaden())) ctx.hinweis("Bitte Obsidian einmal schließen und wieder öffnen."); },
    },
  };

  return { registrieren, aktionen: AKTIONEN };
};
