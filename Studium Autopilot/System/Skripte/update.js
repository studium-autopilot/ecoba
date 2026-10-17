// Update der Vorlage mit einem Knopf (seit 0.2.0). Zeile „Studium Autopilot“ in ```eba-verbindungen``` (verbindungen.js):
// Version, „Neue Version X verfügbar“ und Knopf „Aktualisieren“. Seit 0.3.1 zusätzlich ```eba-update-hinweis``` oben auf dem
// Dashboard: schmale Zeile nur, wenn ein Update angeboten wird oder „Neu laden“ nötig ist. Doku: docs/architektur.md, „Update“.
//
// Woher: Das Manifest der zentralen Daten (zentral.js, docs/daten-v1.md) nennt im optionalen Feld „release“ die neue Version,
// die Basisadresse der Dateien (raw.githubusercontent.com, Tag v<version> im Haupt-Repo) und die SHA-256 der Dateiliste
// system-dateien.json. Geladen wird NUR nach einem Tipp auf „Aktualisieren“ und Bestätigung.
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
//   unverändert → ersetzen. Selbst geändert: system/seite → deine Fassung bleibt, neue als „Name (neu X).ext“ daneben
//   (Skripte und CSS mit .txt am Ende, damit nichts davon geladen wird); Seite nur abgehakt → neue Seite, Haken übernommen;
//   modul → Katalogfelder neu, persönliche Felder (PERSOENLICH) und eigene Felder bleiben, Text bleibt, wenn du ihn geändert
//   hast; einstellung (.obsidian/*.json) → fehlende Einträge ergänzen, deine Werte bleiben. Gelöschte Seiten/Module kommen nicht
//   wieder. Dateien, die es nicht mehr gibt, wandern unverändert in die Sicherung, geändert bleiben sie.
// Nie angefasst: alles, was klasseVon nicht kennt (Einstellungen, Termine, Stundenplan, Vorlesungen, Unterlagen, Eingang,
//   Anhänge, Semester.md, abruf.json, appearance.json …).
// Kanal: update_kanal in System/Einstellungen.md („stabil“ Standard, „beta“). Das Manifest nennt release (stabil) und optional
//   beta (X.Y.Z-beta.N); auf Kanal beta wird die höhere von beiden angeboten, nie eine ältere als die installierte.
//   Schalter „Beta-Versionen“ im Fenster „Studium Autopilot“ unter „Mehr erfahren“.
// Erstinstallation: Fehlt installiert.json, legt das Plugin sie einmal aus system-dateien.json an (sonst keine Datei).
// Andere Geräte: Das Update kommt über den Sync. installiert.json zeigt dort die neue Version → kein zweites Update; läuft
//   noch der alte Kern im Speicher, zeigt die Zeile „Neu laden“.
// Neuigkeiten (seit 0.4.1): Beim Öffnen von Obsidian (und nach über 6 h im Hintergrund) holt update.js nach wenigen Sekunden
//   nur das kleine Manifest, wenn die letzte Prüfung über 30 Min. her ist. Gibt es ein Angebot, erscheint einmal je App-Start
//   ein Hinweis (Notice) mit „Aktualisieren“ und „Was ist neu“, für dieselbe Version höchstens alle 12 h. Läuft eine neue
//   Version zum ersten Mal auf diesem Gerät, einmal „Aktualisiert auf X“. „Was ist neu“ zeigt die Abschnitte aus CHANGELOG.md
//   am Tag der Version. Nicht während der Einrichtung. Gerätelokal: eba-update-geprueft, eba-update-toast, eba-update-gesehen.
// Testeinstiege: plugin.testUpdateAntwort (true/false statt Bestätigungsfenster), plugin.testUpdateBasis (andere Basis-URL,
//   z. B. lokaler Server; gilt auch für CHANGELOG.md), ctx.update.letzterBericht, ctx.update.fenster, ctx.update.neuigkeiten.
// iOS-sicher: keine Node-APIs, kein Lookbehind, kein .at()/findLast/structuredClone. Web Crypto für SHA-256.
module.exports = function (ctx) {
  const app = window.app;
  const obs = ctx.obsidian || {};
  const Notice = obs.Notice;

  // ---------- Konstanten ----------
  const ORDNER = "Studium Autopilot"; // Ordner des Vaults im Haupt-Repo (Pfad unter url_basis)
  const LISTE = "System/Daten/system-dateien.json";
  const INSTALLIERT = "System/Daten/installiert.json";
  const PLUGIN_ID = "studium-autopilot";
  const KERN = ".obsidian/plugins/" + PLUGIN_ID + "/";
  const KERN_DATEIEN = ["main.js", "manifest.json", "styles.css"];
  const EINSTELLUNG = [".obsidian/app.json", ".obsidian/bookmarks.json", ".obsidian/community-plugins.json",
    ".obsidian/core-plugins.json", ".obsidian/hotkeys.json", ".obsidian/types.json"];
  // Persönliche Felder der Modulnotizen (bleiben beim Update immer): wie pruefen.py (Vorlage leer) und docs/architektur.md
  const PERSOENLICH = ["status", "ergebnis", "versuch", "klausur", "semester_geplant", "gewaehlt", "anrechnung", "zusatz"];
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
  // Name der neuen Fassung neben deiner: „Dashboard (neu 0.3.0).md“, Skripte/CSS „zentral (neu 0.3.0).js.txt“
  const neuName = (pfad, version) => {
    const i = pfad.lastIndexOf("/"), ordner = pfad.slice(0, i + 1), name = pfad.slice(i + 1);
    const p = name.lastIndexOf(".");
    const basis = p > 0 ? name.slice(0, p) : name, ext = p > 0 ? name.slice(p) : "";
    const zusatz = ext === ".js" || ext === ".css" || ext === ".json" ? ext + ".txt" : ext;
    return ordner + basis + " (neu " + version + ")" + zusatz;
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
  const jsonMischenText = (deine, neu) => {
    let u, n;
    try { n = JSON.parse(neu); } catch (e) { return null; }
    try { u = JSON.parse(deine); } catch (e) { return neu; }
    const r = jsonMischen(u, n);
    return JSON.stringify(r) === JSON.stringify(u) ? null : JSON.stringify(r, null, 2);
  };

  // ---------- Plan (rein, ohne Dateien) ----------
  // neu, alt: geprüfte Listen (alt darf null sein); ist: pfad → { sha, koerper?, ohneHaken? } (fehlt = Datei fehlt)
  // → [{ pfad, klasse, art, eintrag?, koerperNeu? }], art: gleich | anlegen | ersetzen | behalten-neu | modul-mischen |
  //   seite-haken | json-mischen | uebersprungen | entfernen | bleibt
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
      else if (e.klasse === "einstellung") art = "json-mischen";
      else if (e.klasse === "modul") art = "modul-mischen";
      else if (e.klasse === "seite" && a && a.ohne_haken && c.ohneHaken === a.ohne_haken) art = "seite-haken";
      else art = "behalten-neu";
      const s = { pfad: e.pfad, klasse: e.klasse, art, eintrag: e };
      if (art === "modul-mischen") s.koerperNeu = !!(a && a.koerper && c.koerper === a.koerper);
      schritte.push(s);
    }
    if (alt) for (const a of alt.dateien) {
      if (hat(N, a.pfad) || !hat(ist, a.pfad)) continue;
      schritte.push({ pfad: a.pfad, klasse: a.klasse, art: ist[a.pfad].sha === a.sha256 ? "entfernen" : "bleibt" });
    }
    return schritte;
  };
  const LADEN = { anlegen: 1, ersetzen: 1, "behalten-neu": 1, "modul-mischen": 1, "seite-haken": 1, "json-mischen": 1 };

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

  // ---------- Update ausführen (Datei-Zugriff über io, damit es ohne Obsidian testbar ist) ----------
  // io: { holen(url) → Uint8Array (wirft bei Fehler), lesen(pfad) → Uint8Array | null, schreiben(pfad, bytes), loeschen(pfad) }
  // o: { release: { version, url_basis, sha256 }, alt: geprüfte Liste | null, altVersion, zeit: Date, fortschritt(text) }
  // → Bericht { ok, art (ok | netz | pruefsumme | liste | sicherung | schreiben), fehler, version, geaendert[], angelegt[],
  //   neuKopien[{ pfad, kopie }], gemischt[], haken[], einstellungen[], uebersprungen[], entfernt[], behalten[], sicherung,
  //   plugin (Kern geändert), zurueckgesetzt }
  const aktualisierenMit = async (io, o) => {
    const rel = o.release;
    const b = { ok: false, art: "", fehler: "", version: rel.version, geaendert: [], angelegt: [], neuKopien: [], gemischt: [], haken: [],
      einstellungen: [], uebersprungen: [], entfernt: [], behalten: [], sicherung: "", plugin: false, zurueckgesetzt: false };
    const melden = o.fortschritt || (() => {});
    const fehler = (art, text) => { b.art = art; b.fehler = text; return b; };
    const url = (pfad) => rel.url_basis + (ORDNER + "/" + pfad).split("/").map(encodeURIComponent).join("/");

    // 1. Dateiliste
    melden("Prüfe die neue Version …");
    let lb;
    try { lb = await io.holen(url(LISTE)); } catch (e) { return fehler("netz", "Dateiliste nicht geladen (" + ((e && e.message) || e) + ")"); }
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
    melden(`Lade 0 von ${brauchen.length} Dateien …`);
    try {
      await parallel(brauchen, G.parallel, async (s) => {
        let by;
        try { by = await io.holen(url(s.pfad)); } catch (e) { throw fehlerArt("netz", s.pfad + " nicht geladen (" + ((e && e.message) || e) + ")"); }
        if (by.length !== s.eintrag.groesse || (await sha256(by)) !== s.eintrag.sha256) throw fehlerArt("pruefsumme", "Prüfsumme stimmt nicht: " + s.pfad);
        geladen[s.pfad] = by;
        fertig++;
        melden(`Lade ${fertig} von ${brauchen.length} Dateien …`);
      });
    } catch (e) { return fehler(e.art || "netz", (e && e.message) || String(e)); }

    // 5. Inhalte berechnen
    const schreiben = [], loeschen = [];
    const alsText = (p) => dec(istBytes[p]);
    for (const s of schritte) {
      const p = s.pfad, n = geladen[p], c = istBytes[p] || null;
      if (s.art === "anlegen") { schreiben.push({ pfad: p, bytes: n, alt: null }); b.angelegt.push(p); }
      else if (s.art === "ersetzen") { schreiben.push({ pfad: p, bytes: n, alt: c }); b.geaendert.push(p); }
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
        const t = jsonMischenText(alsText(p), dec(n));
        if (t != null) { schreiben.push({ pfad: p, bytes: enc(t), alt: c }); b.einstellungen.push(p); }
      } else if (s.art === "uebersprungen") b.uebersprungen.push(p);
      else if (s.art === "entfernen") { loeschen.push({ pfad: p, alt: c }); b.entfernt.push(p); }
      else if (s.art === "bleibt") b.behalten.push(p);
    }
    // Plugin-Kern zuletzt (vor den Listen), damit ein halbes Update nie mit neuem Kern startet
    const kern = (w) => w.pfad.indexOf(KERN) === 0 && KERN_DATEIEN.indexOf(w.pfad.slice(KERN.length)) >= 0;
    const reihe = schreiben.filter((w) => !kern(w)).concat(schreiben.filter(kern));
    b.plugin = reihe.some(kern);
    for (const p of [LISTE, INSTALLIERT]) { const da = await io.lesen(p); if (!gleich(da, lb)) reihe.push({ pfad: p, bytes: lb, alt: da }); }

    // 6. Sicherung
    const sichern = reihe.concat(loeschen).filter((w) => w.alt);
    if (sichern.length) {
      b.sicherung = SICHERUNG + (o.altVersion || "alt") + " " + stempel(o.zeit || new Date());
      melden("Lege eine Sicherung an …");
      try { for (const w of sichern) await io.schreiben(b.sicherung + "/" + w.pfad, w.alt); } catch (e) { return fehler("sicherung", "Sicherung nicht möglich (" + ((e && e.message) || e) + ")"); }
    }

    // 7. Schreiben; bei einem Fehler alles zurücksetzen
    melden("Schreibe die neue Version …");
    const erledigt = [];
    try {
      for (const w of reihe) { await io.schreiben(w.pfad, w.bytes); erledigt.push(w); }
    } catch (e) {
      for (let i = erledigt.length - 1; i >= 0; i--) {
        const w = erledigt[i];
        try { if (w.alt) await io.schreiben(w.pfad, w.alt); else await io.loeschen(w.pfad); } catch (x) { console.error("update: zurücksetzen " + w.pfad, x); }
      }
      b.zurueckgesetzt = true;
      return fehler("schreiben", "Schreiben fehlgeschlagen (" + ((e && e.message) || e) + ")");
    }
    // 8. Nicht mehr enthaltene, unveränderte Dateien entfernen (liegen in der Sicherung)
    for (const l of loeschen) { try { await io.loeschen(l.pfad); } catch (e) { console.error("update: entfernen " + l.pfad, e); } }
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
    holen: async (url) => {
      let r = await obs.requestUrl({ url, method: "GET", throw: false });
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
  };

  // ---------- Zustand ----------
  // bleibend: überlebt den Hot-Reload dieses Skripts (das Update ersetzt update.js womöglich selbst)
  const zustand = ctx.bleibend("zustand", () => ({ laeuft: false, installiert: "", bericht: null, fenster: null }));
  const laufendeVersion = () => (ctx.plugin && ctx.plugin.manifest && ctx.plugin.manifest.version) || "0.0.0";
  const installiertVersion = () => zustand.installiert || laufendeVersion();
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
        new Notice(an ? "Beta-Versionen an. Neue Testversionen erscheinen hier zuerst." : "Beta-Versionen aus. Du bekommst nur fertige Versionen.", 5000);
        setTimeout(neuZeichnen, 1200);
      }));
  };

  // ---------- Anzeige (Zeile „Studium Autopilot“ in eba-verbindungen) ----------
  // → { html, pille, symbol, ton, knopf: { aktion, text } | null }
  const anzeige = () => {
    const inst = installiertVersion(), lauf = laufendeVersion(), s = stand(), k = kanal();
    const rel = s.release || (k === "beta" ? s.beta : null), neu = angebot(s.release, s.beta, k, inst);
    const zusatz = k === "beta" ? " Kanal: Beta." : "";
    if (zustand.laeuft) return { html: "Wird aktualisiert …", pille: `<span class="eba-pill info">läuft</span>`, symbol: "uhr", ton: "leise", knopf: null };
    if (neuer(inst, lauf)) {
      return { html: esc(`Version ${inst} ist da. Einmal neu laden, dann ist alles aktiv.`), pille: `<span class="eba-pill info">neu laden</span>`,
        symbol: "neu-laden", ton: "warn", knopf: { aktion: "vorlage-neu-laden", text: "Neu laden" } };
    }
    if (neu) {
      return { html: esc(`Neue ${istBeta(neu.version) ? "Beta-Version" : "Version"} ${neu.version} verfügbar.`) + (neu.notiz ? " " + esc(neu.notiz) : ""), pille: `<span class="eba-pill info">neu</span>`,
        symbol: "laden", ton: "warn", knopf: { aktion: "vorlage-aktualisieren", text: "Aktualisieren" } };
    }
    // Rückfall laut Doku: nur plugin_aktuell (ohne release) → Link auf die Releases
    if (!neu && s.aktuell && neuer(s.aktuell, inst)) {
      const url = (ctx.zentral && ctx.zentral.RELEASES) || "https://github.com/studium-autopilot/ecoba/releases";
      return { html: `<a class="eba-vb-neu external-link" href="${esc(url)}" target="_blank" rel="noopener">${esc(`Neue Version ${s.aktuell} verfügbar`)}</a>`, pille: `<span class="eba-pill info">neu</span>`, symbol: "laden", ton: "warn", knopf: null };
    }
    if (rel) return { html: esc(`Version ${inst}. Du hast die neueste Version.${zusatz}`), pille: `<span class="eba-pill ok">aktuell</span>`, symbol: "haken", ton: "ok", knopf: null };
    return { html: esc(`Version ${inst}.${zusatz}`), pille: "", symbol: "haken", ton: "leise", knopf: null };
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
  const hinweis = () => {
    if (zustand.laeuft) return null;
    const inst = installiertVersion(), lauf = laufendeVersion(), s = stand();
    if (neuer(inst, lauf)) return { art: "laden", version: inst, text: `Version ${inst} ist da. Einmal neu laden.`, knopf: "Neu laden", symbol: "neu-laden" };
    const neu = angebot(s.release, s.beta, kanal(), inst);
    let h = null;
    if (neu) h = { art: "update", version: neu.version, text: `Neue ${istBeta(neu.version) ? "Beta-Version" : "Version"} ${neu.version} verfügbar.`, notiz: neu.notiz || "", knopf: "Aktualisieren", symbol: "laden" };
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
    // Kurznotiz auf eine Zeile (CSS kürzt mit „…“; hier nur die erste Zeile, höchstens 140 Zeichen)
    const n = String(h.notiz || "").split(/\r?\n/)[0].trim();
    if (n) t.createSpan({ cls: "eba-uh-notiz", text: n.length > 140 ? n.slice(0, 139) + "…" : n, attr: { title: n } });
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
    if (h.art !== "laden") {
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
    if (rel.notiz) m.contentEl.createEl("p", { cls: "eba-modal-text", text: "Neu: " + rel.notiz });
    const ul = m.contentEl.createEl("ul", { cls: "eba-modal-schritte" });
    ul.createEl("li", { text: "Neue Seiten, Module und Programmteile kommen von GitHub. Jede Datei wird geprüft." });
    ul.createEl("li", { text: "Deine Noten, Termine, Notizen und Angaben bleiben. Hast du eine Seite geändert, bleibt deine Fassung." });
    ul.createEl("li", { text: "Vorher wird eine Sicherung angelegt. Deine anderen Geräte bekommen das Update über deinen Sync." });
    const k = m.contentEl.createDiv({ cls: "modal-button-container" });
    const ok = k.createEl("button", { text: "Aktualisieren", cls: "mod-cta" });
    const ab = k.createEl("button", { text: "Abbrechen" });
    ok.addEventListener("click", () => { erledigt = true; m.close(); fertig(true); });
    ab.addEventListener("click", () => m.close());
    m.onClose = () => { m.contentEl.empty(); if (!erledigt) fertig(false); };
    m.open();
  });
  const name = (p) => p.split("/").pop().replace(/\.md$/, "");
  const FEHLERTEXT = {
    netz: "Keine Verbindung zu GitHub. Es wurde nichts geändert. Versuch es später noch einmal.",
    pruefsumme: "Die neue Version kam nicht vollständig an. Es wurde nichts geändert. Versuch es später noch einmal.",
    liste: "Die neue Version passt nicht. Es wurde nichts geändert.",
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
      const d = c.createEl("details", { cls: "eba-modal-mehr" });
      d.createEl("summary", { text: "Mehr erfahren" });
      d.createEl("p", { text: b.fehler });
    } else {
      m.titleEl.setText(`Fertig: Version ${b.version}`);
      const n = b.geaendert.length + b.angelegt.length + b.gemischt.length + b.haken.length + b.einstellungen.length;
      text(n ? `${n} ${n === 1 ? "Datei" : "Dateien"} aktualisiert. Deine Einträge sind geblieben.` : "Alles war schon aktuell.", "eba-modal-erfolg");
      if (b.neuKopien.length) {
        text("Diese Seiten hattest du geändert. Deine Fassung bleibt, die neue liegt daneben („neu " + b.version + "“):");
        const ul = c.createEl("ul", { cls: "eba-modal-schritte" });
        for (const x of b.neuKopien) ul.createEl("li", { text: name(x.pfad) });
      }
      if (b.behalten.length) text("Nicht mehr Teil der Vorlage, weil von dir geändert behalten: " + b.behalten.map(name).join(", ") + ".");
      if (b.plugin && !b.neuGeladen) text("Bitte Obsidian einmal schließen und wieder öffnen.");
      else if (b.einstellungen.length) text("Einstellungen wurden ergänzt. Sie wirken nach dem nächsten Öffnen von Obsidian.");
      text("Auf deinen anderen Geräten kommt das Update über deinen Sync. Dort nicht noch einmal aktualisieren.", "eba-modal-hinweis");
      if (b.sicherung) {
        const d = c.createEl("details", { cls: "eba-modal-mehr" });
        d.createEl("summary", { text: "Mehr erfahren" });
        d.createEl("p", { text: `Die alten Fassungen liegen im versteckten Ordner „${b.sicherung}“ in deinem Tresor (am PC oder Mac sichtbar).` });
      }
    }
    const k = c.createDiv({ cls: "modal-button-container" });
    k.createEl("button", { text: "Fertig", cls: "mod-cta" }).addEventListener("click", () => m.close());
    if (b.ok && b.vorher) k.createEl("button", { text: "Was ist neu" }).addEventListener("click", () => { m.close(); neuigkeitenZeigen({ von: b.vorher, bis: b.version }); });
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

  // ---------- Ablauf nach dem Tipp auf „Aktualisieren“ ----------
  const aktualisieren = async () => {
    if (zustand.laeuft) return null;
    if (!ctx.zentral || !ctx.zentral.manifestHolen) { new Notice("Studium Autopilot: Bitte später noch einmal versuchen.", 5000); return null; }
    let rel;
    const inst = installiertVersion();
    try { const m = await ctx.zentral.manifestHolen(); rel = angebot(m.release, m.beta, kanal(), inst); } catch (e) {
      const b = { ok: false, art: "netz", fehler: (e && e.message) || String(e) };
      zustand.bericht = b; ergebnisZeigen(b); return b;
    }
    neuZeichnen();
    if (!rel) { new Notice(`Studium Autopilot ist aktuell (Version ${inst}).`, 5000); return null; }
    if (!(await fragen(rel))) return null;
    const p = plugin();
    if (p.testUpdateBasis) rel = Object.assign({}, rel, { url_basis: String(p.testUpdateBasis) });
    zustand.laeuft = true;
    neuZeichnen();
    const hinweis = new Notice("Lade die neue Version …", 0);
    let b;
    try {
      p.stillBis = Date.now() + 120000; // Kern: keine „Aktualisiert: …“-Hinweise beim Hot-Reload der Skripte
      const alt = (await listeLesen(INSTALLIERT)) || (await listeLesen(LISTE));
      b = await aktualisierenMit(io, { release: rel, alt: alt ? alt.liste : null, altVersion: inst, zeit: new Date(),
        fortschritt: (t) => { try { hinweis.setMessage(t); } catch (e) { /* egal */ } } });
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
      try { hinweis.hide(); } catch (e) { /* egal */ }
      zustand.laeuft = false;
      p.stillBis = Date.now() + 5000;
    }
    zustand.bericht = b;
    // Nach dem Neuladen gehört die Anzeige der neuen Plugin-Instanz (die alte darf nichts mehr zeichnen)
    if (!b.neuGeladen) neuZeichnen();
    ergebnisZeigen(b);
    return b;
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
    if (!Notice || sitzungGezeigt() || zustand.laeuft || zustand.fenster || neuigkeit.fenster || einrichtungOffen()) return null;
    if (!(app.metadataCache.initialized || app.metadataCache.resolved)) return null; // Kanal und Einrichtung stehen im Frontmatter
    const inst = installiertVersion(), lauf = laufendeVersion(), s = stand();
    const n = nachUpdate(lokal(L_GESEHEN), lauf, inst);
    if (n) lokal(L_GESEHEN, lauf);
    const a = angebot(s.release, s.beta, kanal(), inst);
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
  // Notice mit eigenem Inhalt: Text und Knöpfe (≥ 44 px, CSS Abschnitt „Neuigkeiten“). Antippen irgendwo blendet ihn aus.
  const toastZeigen = (t) => {
    const f = document.createDocumentFragment();
    const box = f.createDiv({ cls: "eba-toast" });
    box.createDiv({ cls: "eba-toast-text", text: t.text });
    const k = box.createDiv({ cls: "eba-toast-knoepfe" });
    const knopf = (text, cls, fn) => {
      k.createEl("button", { text, cls: "eba-toast-knopf" + (cls ? " " + cls : ""), attr: { type: "button" } })
        .addEventListener("click", () => { try { fn(); } catch (e) { console.error("update: Hinweis", e); } });
    };
    if (t.angebot) knopf("Aktualisieren", "mod-cta", () => { aktualisieren().catch((e) => console.error("update", e)); });
    knopf("Was ist neu", "", () => { neuigkeitenZeigen({ von: t.von, bis: t.bis, angebot: t.angebot }); });
    return new Notice(f, t.angebot ? 30000 : 15000);
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
  // o = { von, bis, angebot } – angebot (aus dem Manifest) → Knöpfe „Aktualisieren“ und „Später“, sonst „Fertig“
  const neuigkeitenZeigen = (o) => {
    if (!Modal) return null;
    if (neuigkeit.fenster) neuigkeit.fenster.close();
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
      k.createEl("button", { text: "Aktualisieren", cls: "mod-cta" }).addEventListener("click", () => { m.close(); aktualisieren().catch((e) => console.error("update", e)); });
      k.createEl("button", { text: "Später" }).addEventListener("click", () => m.close());
    } else k.createEl("button", { text: "Fertig", cls: "mod-cta" }).addEventListener("click", () => m.close());
    m.onClose = () => { if (comp) comp.unload(); c.empty(); if (neuigkeit.fenster === m) neuigkeit.fenster = null; };
    m.open();
    m.geladen = abschnitteZeichnen(liste, o, comp).catch((e) => { console.error("update: Was ist neu", e); return 0; });
    return m;
  };

  ctx.update = {
    // reine Logik (Node-Tests)
    klasseVon, pfadOk, neuName, listePruefen, teilen, ohneHaken, hatAufgaben, seiteHaken, fmMischen, modulMischen, jsonMischen,
    jsonMischenText, planen, aktualisierenMit, sha256, neuer, angebot, kanal, kanalSetzen, kanalSchalter, PERSOENLICH, ORDNER, LISTE, INSTALLIERT,
    // Obsidian
    io, anzeige, status, aktualisieren, installiertAnlegen, pluginNeuLaden, ergebnisZeigen, hinweis, hinweisNeu, SPAETER,
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
    for (const ev of ["create", "modify", "delete"]) ctx.an(app.vault, ev, (f) => { if (f && f.path === INSTALLIERT) bald(); });
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
    "vorlage-aktualisieren": { titel: "Studium Autopilot aktualisieren", ausfuehren: async () => { await aktualisieren(); } },
    "vorlage-neu-laden": {
      titel: "Studium Autopilot neu laden",
      ausfuehren: async () => { if (!(await pluginNeuLaden())) new Notice("Bitte Obsidian einmal schließen und wieder öffnen.", 8000); },
    },
  };

  return { registrieren, aktionen: AKTIONEN };
};
