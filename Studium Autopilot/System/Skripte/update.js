// Update der Vorlage mit einem Knopf (seit 0.2.0). Zeile „Updates“ in ```eba-verbindungen``` (verbindungen.js):
// Version, „Neue Version X verfügbar“ und Knopf „Neue Version installieren“. Seit 0.3.1 zusätzlich ```eba-update-hinweis``` oben auf dem
// Dashboard: schmale Zeile nur, wenn ein Update angeboten wird oder „Neu laden“ nötig ist. Doku: docs/architektur/update.md.
//
// Woher: Das Manifest der zentralen Daten (zentral.js, docs/daten-v1.md) nennt im optionalen Feld „release“ die neue Version,
// die Basisadresse der Dateien (raw.githubusercontent.com, Tag v<version> im Haupt-Repo) und die SHA-256 der Dateiliste
// system-dateien.json. Geladen wird NUR nach einem Tipp auf „Neue Version installieren“ und Bestätigung.
//
// Ablauf (alles oder nichts):
//   1. system-dateien.json laden (zuerst aus dem Release, siehe Mitzählen), Prüfsumme gegen das Manifest, Liste streng prüfen
//      (nur erlaubte Pfade, siehe klasseVon).
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
//   Systemdateien gehen mit Sicherung daneben. Lesezeichen auf entfernte Dateien fallen auch aus deiner bookmarks.json weg;
//   Lesezeichen, die die Vorlage dazunimmt oder streicht, zieht jedes Gerät nach (LESEZEICHEN_NEU, seit 0.6.8, lesezeichenAnwenden).
//   Ältere Kopien „Seite (neu X).md“, die genau der alten oder neuen Vorlage gleichen, räumt das Update weg (keine Stapel);
//   bleibt deine Seite (Vorlage unverändert), bleibt die jüngste davon (seit 0.6.8, siehe kopienAufraeumen).
//   Zeilenenden zählen beim Vergleich nicht (seit 0.6.8, istVon): LF und CRLF derselben Fassung gelten als gleich.
// Reparatur (seit 0.4.4, heilenMit): Das Update auf 0.4.4 plant noch der alte update.js. Darum prüft der neue einmal je Gerät
//   und Version: Systemdatei ≠ installiert.json, aber eine beiseitegelegte „(neu X)“-Kopie hat genau die Prüfsumme der Liste →
//   diese wird aktiv, deine Fassung kommt als Sicherung daneben, die Kopien gehen weg. Kopien von Seiten, die genau der jetzigen
//   Vorlage gleichen und älter als die installierte Version sind, gehen auch weg, außer der jüngsten, solange die Seite selbst
//   von der Vorlage abweicht. Nie aus dem Netz, nie eine Seite selbst.
//   Synchronisierte Pfade (alles außer .obsidian/) nur auf dem Gerät, das für alle schreibt (ctx.zentral.abruferHier).
// Nie angefasst: alles, was klasseVon nicht kennt (Einstellungen, Termine, Stundenplan, Vorlesungen, Unterlagen, Anhänge,
//   Semester.md, abruf.json, appearance.json …). Ausnahme: Ordner, die die Vorlage nicht mehr hat (ALTE_ORDNER, seit 0.6.8,
//   ordnerAufraeumenMit): einmal je Tresor weg, Dateien darin wandern vorher an einen neuen Ort, gelöscht wird keine.
// Hinweise für Claude (seit 0.6.9, claudeNachholenMit): .claude/CLAUDE.md und der Skill studium-autopilot (Klasse claude)
//   stehen im Schlüssel „weitere“ der Liste, den Planer bis 0.6.8 übergehen (in „dateien“ lehnten sie die ganze Liste ab).
//   Das Update behandelt sie wie Systemdateien: immer die neue Fassung, deine geänderte liegt als Sicherung daneben. Danach
//   holt jeder Computer einmal je Version nach, was bei ihm fehlt oder alt ist (Obsidian Sync nimmt .claude/ nicht mit); aus
//   dem Netz nur bei eingeschalteten zentralen Daten. Eigene Skills (.claude/skills/<anderer Name>/) und .claude/settings*.json
//   fasst nichts an.
// Kanal: update_kanal in System/Einstellungen.md („stabil“ Standard, „beta“). Das Manifest nennt release (stabil) und optional
//   beta (X.Y.Z-beta.N); auf Kanal beta wird die höhere von beiden angeboten, nie eine ältere als die installierte.
//   Schalter „Beta-Versionen“ im Fenster „Updates“ unter „Mehr erfahren“.
// Unterbrochen (seit 0.4.8): Als erste Datei schreibt das Update System/Daten/update.json (synchronisiert, { version, von,
//   geraet, seit }) und lässt sie danach liegen; fertig ist es erst mit installiert.json (zuletzt). Neuer als installiert.json
//   und von diesem Gerät → „Update fertigstellen“ (App beendet, bevor alles geschrieben war; ein zweiter Lauf schreibt nur, was
//   fehlt; bietet das Manifest inzwischen eine andere Version an, nicht mehr). Von einem anderen Gerät, vor weniger als 1 Std. → „Ein Update wird gerade auf einem anderen Gerät installiert“
//   statt eines zweiten Updates (seine Dateien kommen noch über den Sync). Gilt ab dem Update, das 0.4.8 plant.
// Nach Updates suchen (seit 0.4.8): Knopf in der Zeile und Befehl; holt das Manifest sofort, Ergebnis als ein Hinweis. Das
//   Manifest und die Liste vom Tag kommen mit Minuten-Zeitstempel und „no-cache“ (zentral.js frischUrl), nie aus dem
//   Zwischenspeicher; die Liste aus dem Release ändert sich nie (Releases sind unveränderlich), sie kommt ohne.
// Erstinstallation: Fehlt installiert.json, legt das Plugin sie einmal aus system-dateien.json an (sonst keine Datei).
// Von Hand aktualisiert (neuere ZIP entpackt): Laufen Kern und system-dateien.json auf einer neueren Version als installiert.json
//   und gleichen alle Systemdateien der Liste, gilt sie; das Gerät, das für alle schreibt, kopiert die Liste nach installiert.json.
//   Nicht, solange noch etwas der alten Version da ist, das ein Update entfernen würde: Dann bleibt das Angebot, installieren räumt auf.
// Zentrale Daten aus: keine Angaben zum Release (kein Angebot, kein „neueste Version“); Nach Updates suchen holt trotzdem.
// Andere Geräte: Das Update kommt über den Sync. installiert.json zeigt dort die neue Version → kein zweites Update; läuft
//   noch der alte Kern im Speicher, zeigt die Zeile „Neu laden“. Die Skripte, die dabei ankommen, lädt der Kern ohne
//   „Aktualisiert: …“-Hinweise neu (mehrere auf einmal oder nach einer neuen installiert.json: stillBis).
// Neuigkeiten (seit 0.4.1): Beim Öffnen von Obsidian (und nach über 6 h im Hintergrund) holt update.js nach wenigen Sekunden
//   nur das kleine Manifest, wenn die letzte Prüfung über 30 Min. her ist. Gibt es ein Angebot, erscheint einmal je App-Start
//   ein Hinweis (Notice) mit „Neue Version installieren“, für dieselbe Version höchstens alle 12 h und nie mehr, wenn du ihr Fenster
//   schon gesehen hast. Läuft eine neue Version zum ersten Mal auf diesem Gerät, einmal „Aktualisiert auf X“ mit „Was ist neu“.
//   Seit 0.5.4 läuft das ganze Update in EINEM Fenster („Neue Version“: Änderungen, Fortschritt, Ergebnis) ohne Hinweis daneben;
//   es zeigt die Abschnitte aus CHANGELOG.md am Tag der Version. Nicht während der Einrichtung. Gerätelokal: eba-update-geprueft, eba-update-toast, eba-update-gesehen.
// Mitzählen (seit 0.7.1 ohne eigenen Abruf): Das Update lädt die Dateiliste zuerst als Datei system-dateien.json aus dem
//   GitHub-Release der neuen Version (o.listeRelease, release.py legt sie dort ab) und prüft sie wie die vom Tag gegen die
//   SHA-256 aus dem Manifest. GitHub zählt die Abrufe je Datei eines Releases; so steht dort, wie viele Tresore auf eine Version
//   aktualisiert haben (ein Gerät installiert, die anderen bekommen es über den Sync), ohne Kennung und ohne Angaben aus dem
//   Tresor (docs/datenschutz.md). Scheitert der Abruf (kein Netz, ältere Version oder Beta ohne diese Datei) oder stimmt die
//   Prüfsumme nicht, still wie bisher vom Tag (url_basis, frisch). Bis 0.7.0 rief jedes Gerät einmal je Version zaehler.txt
//   aus dem Release ab, mit dem Schalter „Mitzählen“. Wer ihn ausgeschaltet hat (zaehlen: false in System/Einstellungen.md),
//   lädt die Liste weiter nur vom Tag und wird nicht gezählt (zaehlenAn). Den alten Merker eba-update-gezaehlt räumt der Start weg.
// Testeinstiege: plugin.testUpdateAntwort (true/false statt der Frage im Fenster), plugin.testUpdateBasis (andere Basis-URL,
//   z. B. lokaler Server; gilt auch für CHANGELOG.md), ctx.update.letzterBericht, ctx.update.fenster, ctx.update.toast,
//   ctx.update.heilen(true) (Reparatur und Hinweise für Claude sofort, ohne die Merker eba-update-reparatur und eba-update-claude),
//   ctx.update.ordnerAufraeumen(version, true) (alte Ordner sofort, als wäre dieses Gerät das, das für alle schreibt).
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
  // Persönliche Felder der Modulnotizen (bleiben beim Update immer): wie pruefen.py (Vorlage leer) und docs/architektur/update.md
  const PERSOENLICH = ["status", "ergebnis", "versuch", "klausur", "semester_geplant", "gewaehlt", "anrechnung", "zusatz",
    "alma_ausgeblendet", "anmeldung_verzicht", "alma_uebernommen"];
  const VEREINIGEN = ["tags", "aliases", "cssclasses"]; // Listen: neue Einträge + deine zusätzlichen
  const G = { dateien: 3000, datei: 4194304, gesamt: 41943040, liste: 2097152, pfad: 300, parallel: 4 };
  const HEX = /^[0-9a-f]{64}$/;
  const SICHERUNG = ".trash/Studium Autopilot Sicherung ";
  // Ordner der Vorlage, die es nicht mehr gibt (ordnerAufraeumenMit). Neuer Eintrag, wenn eine Version einen Ordner der Vorlage
  // streicht oder umbenennt: ab = erste Version ohne ihn, nach = wohin Dateien darin wandern (ohne nach: nur ein leerer geht weg).
  const ALTE_ORDNER = [
    { ordner: "Eingang", ab: "0.6.7", nach: "Unterlagen/Ohne Modul" }, // Unterlagen kommen nur noch über die Dateiauswahl dazu
    { ordner: "Übungsblätter", ab: "0.6.8" }, // ein Blatt ist seine Begleitnotiz; ältere Blatt-Notizen bleiben, wo sie sind
  ];
  const AUFGERAEUMT = "System/Daten/aufgeraeumt.json"; // erledigte ALTE_ORDNER (synchronisiert, nicht in der Vorlage)
  const MUELL = [".gitkeep", ".DS_Store", "Thumbs.db", "desktop.ini"]; // zählt nicht als Inhalt eines Ordners
  // Klassen nur im Schlüssel „weitere“ der Liste (seit 0.6.9). Planer bis 0.6.8 lesen nur „dateien“ und lehnen dort die ganze
  // Liste ab, sobald ein Pfad ohne ihre Klasse darin steht; „weitere“ übergehen sie. Einträge in „weitere“, die dieser Planer
  // nicht kennt (neue Klasse oder neuer Pfad einer späteren Version), übergeht er ebenso.
  const WEITERE = ["claude"];
  // Hinweise für Claude, wie sie 0.4.7 bis 0.6.8 ausgeliefert wurden (SHA-256 aus den Tags, eingefroren): Diese Listen nennen
  // .claude/ nicht, nur so erkennt das Update, ob du eine Datei geändert hast. Spätere Fassungen stehen in installiert.json.
  const CLAUDE_FRUEHER = {
    ".claude/CLAUDE.md": ["bc7d23ec1bfb9f409169a3a92637cd965b3808effa167c603c25c3202a424596"],
    ".claude/skills/studium-autopilot/SKILL.md": ["30055456f456ca239ecf3bcd93eb51782801b34b5b0b8adcdd75aeb39a40dcf6",
      "4dd7d8f98d8ebd6e8395cda25dba6624172113853d82ca7ec29ae38aba318f46", "58211a56cb52c54133c991554dcfd72331a3e048c904e4c2c8cff7c92ce1bcd6"],
    ".claude/skills/studium-autopilot/fehler-melden.md": ["3da17b1e4f2f1cd3fcbf117ad170f2823f6b1e0916827fcd364f7de321ad247c"],
    ".claude/skills/studium-autopilot/lesefassung.md": ["3457c4aa363163a7fd54a05fe40c5f72341c2fc5f0ef92921c0c4dddfd4b43ff"],
    ".claude/skills/studium-autopilot/lesen.md": ["d1ab4e10692e323e4dd1ea552e8a495989bd7c62fb7fd91038ca065919a6119a",
      "65c417d4fef652e6c193287faf149daa3446e670e8fc5cf6e1863a0984bdc52e", "6b5e997d7134afab8d9da883bec68fa9936cb14572df72dc0500177d174ceadb",
      "75dfa3c2052cbefea4372e2b05389efdd44d53ee6426752c5b7176483726f381", "edb969c1b05425549285c836aec3f551de48bca9a44ca9915424bd76eae7037c"],
    ".claude/skills/studium-autopilot/schreiben.md": ["254870bdfe82c556bb286866ed21ad0c2ee8a16d5eaa253caaa99f1943d48732",
      "473a087cd01b8c2ae8e52d41c8eebf4a12699c17fe538f2f9ff747d843a8c840", "47c867b55a0c1cca6ba92cf0e31b859685481a260664f9843ea752ae7a44a5d7",
      "b89aacaa4ceeee1cebd2c2aa7aaca24df1f1a6fd12c26e79cd966e968e352da8", "d0db8d9c31ddb16680c6cfe40950e3b9be51ce491243327853a4b8f74260c225"],
    ".claude/skills/studium-autopilot/tresor.md": ["6279bfc04eafaa1c6b3a8660780d70a424fa6d36dd38dbfe515cd9dcc9158256",
      "26e14e6128c9500bf94b4f2639a65cba40c76209a49d907f1a793a7176d23672", "55c64800c289a8def454564355a7f685145c2bd03f39417c36a21222caa15dc9",
      "e08c25cc3ad18ea8d37eedda2265275961de93ec1e194f6cd42a603d370b0c75", "4a7943707541604fd6230b272f8535ef8d39b46c694526dadaec1e5cca9fa607",
      "ee52de90a08c0182afe38c8d5fa416c6716a1b3c767d689be7036bfbc1443c10", "688938dbe254eb9aae955930ccc3c2ec6927a467f089769692ff4d5cafac5167"],
  };

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
  // Sync; danach gilt das Gerät als weg, und hier darf wieder installiert werden). Sonst null. o.angeboten = Version, die das
  // Manifest gerade anbietet ("" = unbekannt, z. B. zentrale Daten aus): Ist es eine andere (zurückgezogen oder schon eine
  // neuere), gibt es nichts mehr fertigzustellen; sonst stünde „nicht fertig geworden“ für immer da.
  const markeLage = (m, o) => {
    if (!m || typeof m !== "object" || !semver(m.version) || typeof m.geraet !== "string" || !m.geraet) return null;
    if (o.laeuft || !neuer(m.version, o.installiert)) return null;
    if (o.ich && m.geraet === o.ich) return o.angeboten && o.angeboten !== m.version ? null : "fertigstellen";
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
  // → "system" | "einstellung" | "seite" | "modul" | "claude" (nur in „weitere“, seit 0.6.9) | "" (nie im Update)
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
    if (p === ".claude/CLAUDE.md" || /^\.claude\/skills\/studium-autopilot\/[^/]+\.md$/.test(p)) return "claude";
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
  //   Einträge aus „weitere“ (WEITERE), die dieser Planer kennt, stehen mit in dateien.
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
      if (!k || e.klasse !== k || WEITERE.indexOf(k) >= 0) return { fehler: "Liste: Datei nicht erlaubt: " + String(e.pfad).slice(0, 120) };
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
    for (const e of Array.isArray(d.weitere) ? d.weitere : []) {
      const pfad = e && typeof e === "object" && typeof e.pfad === "string" ? nfc(e.pfad) : "";
      const k = klasseVon(pfad);
      if (!k || e.klasse !== k || WEITERE.indexOf(k) < 0 || hat(gesehen, pfad) || typeof e.sha256 !== "string" || !HEX.test(e.sha256)
        || !Number.isInteger(e.groesse) || e.groesse < 0 || e.groesse > G.datei || dateien.length >= G.dateien) continue;
      gesehen[pfad] = true;
      summe += e.groesse;
      dateien.push({ pfad, klasse: k, sha256: e.sha256, groesse: e.groesse });
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
  // Lesezeichen, die die Vorlage dazunahm oder strich (seit 0.6.8). Ab dem ersten eigenen Lesezeichen ersetzt das Update
  // bookmarks.json nicht mehr, und Mischen lässt Listen von Objekten, wie sie sind; auf Geräten, die .obsidian/ nicht
  // synchronisieren, kommt die neue Datei gar nicht an. Neuer Eintrag, wenn die Vorlage ihre Lesezeichen ändert
  // (tests/update.test.js rechnet ihre Liste aus der von 0.4.2 nach). dazu: hinter das Lesezeichen „nach“, sonst ans Ende.
  // weg: nur das Lesezeichen, das die Vorlage angelegt hat (VORLAGE_CTIME), keins, das du selbst gesetzt hast, keins in Gruppen.
  const LESEZEICHEN_NEU = [
    { ab: "0.4.6", dazu: "Studium/Studienverlauf.md", nach: "Studium/Stundenplan.md" },
    { ab: "0.4.6", dazu: "Studium/Termine & Anmeldungen.md", nach: "Studium/Studienverlauf.md" },
    { ab: "0.4.6", dazu: "Studium/Unterlagen.md", nach: "Studium/Noten & ECTS.md" },
    { ab: "0.4.6", dazu: "Studium/Karteikarten.md", nach: "Studium/Unterlagen.md" },
    { ab: "0.4.6", dazu: "Studium/Einstellungen & Hilfe.md", nach: "Studium/Kontakte & Links.md" },
    { ab: "0.6.0", dazu: "Studium/Postfach.md", nach: "Studium/Termine & Anmeldungen.md" },
    { ab: "0.6.7", weg: "Studium/Stundenplan.md" },
  ];
  // ctime der Lesezeichen aus der Vorlage (…000 bis …999, lange vor jeder echten Installation); nachgezogene bekommen auch eine
  const VORLAGE_CTIME = 1790760000000;
  const vonVorlage = (x) => typeof x.ctime === "number" && x.ctime >= VORLAGE_CTIME && x.ctime < VORLAGE_CTIME + 1000;
  // text = deine bookmarks.json, eintraege = Teil von LESEZEICHEN_NEU → Text oder null (nichts zu tun). Ein dazu-Eintrag kommt
  // nur, wenn du kein Lesezeichen seiner Version aus der Vorlage hast: Hattest du sie, hast du die übrigen selbst entfernt.
  const lesezeichenNachziehen = (text, eintraege) => {
    let d;
    try { d = JSON.parse(text); } catch (e) { return null; }
    if (!istObj(d) || !Array.isArray(d.items)) return null;
    const da = []; // { pfad, vorlage } aller Datei-Lesezeichen, auch in Gruppen
    const sammeln = (items) => {
      for (const x of items) {
        if (!istObj(x)) continue;
        if (Array.isArray(x.items)) sammeln(x.items);
        if (x.type === "file" && typeof x.path === "string") da.push({ pfad: nfc(x.path), vorlage: vonVorlage(x) });
      }
    };
    sammeln(d.items);
    const bekommen = {}; // Version → du hattest schon ein Lesezeichen von ihr aus der Vorlage
    for (const e of LESEZEICHEN_NEU) if (e.dazu && da.some((x) => x.vorlage && x.pfad === nfc(e.dazu))) bekommen[e.ab] = true;
    const oben = (p) => d.items.findIndex((x) => istObj(x) && x.type === "file" && typeof x.path === "string" && nfc(x.path) === nfc(p));
    let n = 0;
    for (const e of eintraege) {
      if (e.weg) {
        const i = oben(e.weg);
        if (i >= 0 && vonVorlage(d.items[i])) { d.items.splice(i, 1); n++; }
      } else if (e.dazu && !bekommen[e.ab] && !da.some((x) => x.pfad === nfc(e.dazu))) {
        const neu = { type: "file", ctime: VORLAGE_CTIME + 100 + LESEZEICHEN_NEU.indexOf(e), path: e.dazu, title: nameTeile(e.dazu).basis };
        const i = e.nach ? oben(e.nach) : -1;
        if (i >= 0) d.items.splice(i + 1, 0, neu); else d.items.push(neu);
        da.push({ pfad: nfc(e.dazu), vorlage: true });
        n++;
      }
    }
    return n ? JSON.stringify(d, null, 2) : null;
  };

  // ---------- Plan (rein, ohne Dateien) ----------
  // neu, alt: geprüfte Listen (alt darf null sein); ist: pfad → { sha, koerper?, ohneHaken?, zeilen? } (fehlt = Datei fehlt);
  // bekannt (freiwillig, claudeBekannt): pfad → [SHA-256] früher ausgelieferter Hinweise für Claude, zählen wie die alte Liste
  // → [{ pfad, klasse, art, eintrag?, koerperNeu? }], art: gleich | anlegen | ersetzen | ersetzen-sichern | behalten-neu |
  //   eigene | modul-mischen | seite-haken | json-mischen | uebersprungen | entfernen | entfernen-sichern | bleibt
  const planen = (neu, alt, ist, bekannt) => {
    const A = {}, N = {};
    if (alt) for (const a of alt.dateien) A[a.pfad] = a;
    const schritte = [];
    for (const e of neu.dateien) {
      N[e.pfad] = true;
      const a = hat(A, e.pfad) ? A[e.pfad] : null, c = hat(ist, e.pfad) ? ist[e.pfad] : null;
      let art;
      if (!c) art = a && (e.klasse === "seite" || e.klasse === "modul") ? "uebersprungen" : "anlegen";
      else if (passt(c, "sha", e.sha256)) art = "gleich";
      else if (a && passt(c, "sha", a.sha256)) art = "ersetzen";
      else if (e.klasse === "claude" && bekanntPasst(c, bekannt, e.pfad)) art = "ersetzen";
      // Darstellung, Programmteile, Gerüste, Hinweise für Claude: immer die neue Fassung, deine geänderte vorher als Sicherung daneben
      else if (e.klasse === "system" || e.klasse === "claude") art = "ersetzen-sichern";
      else if (e.klasse === "einstellung") art = "json-mischen";
      // Vorlage seit der installierten Version gleich: deine Seite bzw. dein Modul bleibt, keine Kopie daneben
      else if (a && e.sha256 === a.sha256) art = "eigene";
      else if (e.klasse === "modul") art = "modul-mischen";
      else if (e.klasse === "seite" && a && a.ohne_haken && passt(c, "ohneHaken", a.ohne_haken)) art = "seite-haken";
      else art = "behalten-neu";
      const s = { pfad: e.pfad, klasse: e.klasse, art, eintrag: e };
      if (art === "modul-mischen") s.koerperNeu = !!(a && a.koerper && passt(c, "koerper", a.koerper));
      schritte.push(s);
    }
    if (alt) for (const a of alt.dateien) {
      if (hat(N, a.pfad) || !hat(ist, a.pfad)) continue;
      const c = ist[a.pfad], unveraendert = passt(c, "sha", a.sha256) || (a.klasse === "claude" && bekanntPasst(c, bekannt, a.pfad));
      const art = unveraendert ? "entfernen" : a.klasse === "system" || a.klasse === "claude" ? "entfernen-sichern" : "bleibt";
      schritte.push({ pfad: a.pfad, klasse: a.klasse, art });
    }
    return schritte;
  };
  const LADEN = { anlegen: 1, ersetzen: 1, "ersetzen-sichern": 1, "behalten-neu": 1, "modul-mischen": 1, "seite-haken": 1, "json-mischen": 1 };

  // Prüfsummen des Ist-Stands einer Datei (wie in der Liste). Zeilenenden zählen nicht (seit 0.6.8): zeilen.<feld> sind dieselben
  // Prüfsummen mit LF und mit CRLF. Befund 24.10.2026: Eine Seite der Vorlage mit CRLF kam nach einem Konflikt im Sync mit LF
  // zurück, das Update hielt sie für selbst geändert und ließ sie auf dem alten Stand.
  const istVon = async (pfad, bytes, klasse) => {
    const x = dec(bytes), lf = x.replace(/\r\n/g, "\n");
    const fassungen = [x].concat([lf, lf.replace(/\n/g, "\r\n")].filter((v) => v !== x));
    const werte = async (f) => { const r = []; for (const v of fassungen) r.push(await sha256(enc(f(v)))); return r; };
    const t = { zeilen: {} };
    const setzen = async (feld, f) => { const r = await werte(f); t[feld] = r[0]; t.zeilen[feld] = r.slice(1); };
    t.sha = await sha256(bytes);
    t.zeilen.sha = fassungen.length > 1 ? (await werte((v) => v)).slice(1) : [];
    if (klasse === "modul") await setzen("koerper", (v) => teilen(v).koerper);
    if (klasse === "seite" && hatAufgaben(x)) await setzen("ohneHaken", ohneHaken);
    return t;
  };
  // c (istVon) hat für feld den Wert soll, mit beliebigen Zeilenenden
  const passt = (c, feld, soll) => !!c && !!soll && (c[feld] === soll || (!!c.zeilen && (c.zeilen[feld] || []).indexOf(soll) >= 0));
  // c gleicht einer früher ausgelieferten Fassung von pfad (bekannt wie in planen)
  const bekanntPasst = (c, bekannt, pfad) => !!bekannt && hat(bekannt, pfad) && bekannt[pfad].some((s) => passt(c, "sha", s));

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
  // Kopien „Seite (neu X).md“ einer Seite (X vor bis) aus namen, die genau einer der vorlagen (Prüfsummen) gleichen, Zeilenenden
  // egal. Trägt die Seite danach die neue Vorlage (alleWeg), gehen alle weg (keine Stapel). Bleibt deine Seite, bleibt die jüngste
  // Kopie mit einer der Vorlagen (auch eine ab bis): Sie ist die eine Stelle, an der du die neue Vorlage siehst. Befund 24.10.2026:
  // Das Update auf 0.6.4 räumte die Kopie aus 0.6.3 weg, weil sie der unveränderten Vorlage glich; die Seite blieb auf dem alten
  // Stand, ohne Kopie daneben. Eine Kopie, die du geändert hast, bleibt immer. → [{ pfad, alt }] zum Entfernen
  const kopienAufraeumen = async (io, pfad, namen, bis, vorlagen, alleWeg) => {
    const gleiche = [];
    for (const k of kopienVon(pfad, namen)) {
      const by = await io.lesen(k.pfad), c = by ? await istVon(k.pfad, by, "") : null;
      if (c && vorlagen.some((v) => passt(c, "sha", v))) gleiche.push({ pfad: k.pfad, version: k.version, alt: by });
    }
    let bleibt = null;
    if (!alleWeg) for (const g of gleiche) if (!bleibt || neuer(g.version, bleibt.version)) bleibt = g;
    return gleiche.filter((g) => g !== bleibt && neuer(bis, g.version)).map((g) => ({ pfad: g.pfad, alt: g.alt }));
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
      melden("Lege eine Sicherung an …", 0.85);
      try { for (const w of sichern) await io.schreiben(ordner + "/" + w.pfad, w.alt); } catch (e) {
        r.art = "sicherung"; r.fehler = "Sicherung nicht möglich (" + grund(e) + ")"; return r;
      }
    }
    melden("Speichere die neue Version …", 0.92);
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
  //   (fortschritt(text, anteil): anteil 0…1 für den Balken im Fenster), marke: { geraet, seit } | null (update.json als erste Datei, nur wenn das Update etwas schreibt; siehe markeLage),
  //   bekannt: pfad → [SHA-256] (claudeBekannt, freiwillig; Hinweise für Claude, die dieses Gerät als unverändert erkennt),
  //   listeRelease: Adresse der Liste im GitHub-Release (listeReleaseUrl) | null (dann nur vom Tag) }
  // → Bericht { ok, art (ok | netz | pruefsumme | liste | sicherung | schreiben), fehler, version, listeQuelle (release | raw,
  //   woher die geprüfte Liste kam; "" ohne), geaendert[], angelegt[], neuKopien[{ pfad, kopie }], gesichert[{ pfad, sicherung }]
  //   (deine Systemdatei daneben gesichert), gemischt[], haken[], einstellungen[], uebersprungen[], entfernt[], behalten[],
  //   aufgeraeumt[] (alte Kopien), sicherung, plugin (Kern geändert), zurueckgesetzt }
  const aktualisierenMit = async (io, o) => {
    const rel = o.release;
    const b = { ok: false, art: "", fehler: "", version: rel.version, listeQuelle: "", geaendert: [], angelegt: [], neuKopien: [], gesichert: [], gemischt: [],
      haken: [], einstellungen: [], uebersprungen: [], entfernt: [], behalten: [], aufgeraeumt: [], sicherung: "", plugin: false, zurueckgesetzt: false };
    const melden = o.fortschritt || (() => {});
    const fehler = (art, text) => { b.art = art; b.fehler = text; return b; };
    const url = (pfad) => rel.url_basis + (ORDNER + "/" + pfad).split("/").map(encodeURIComponent).join("/");

    // 1. Dateiliste: zuerst aus dem Release (zählt die Updates je Version, siehe Mitzählen oben; Releases sind unveränderlich,
    // also ohne frisch), sonst still vom Tag. Verwendet wird nur eine Liste mit genau der Prüfsumme aus dem Manifest.
    melden("Prüfe die neue Version …", 0.03);
    const listeOk = async (by) => by.length <= G.liste && (await sha256(by)) === rel.sha256;
    let lb = null;
    if (o.listeRelease) {
      try { const by = await io.holen(o.listeRelease); if (await listeOk(by)) lb = by; } catch (e) { lb = null; }
    }
    if (lb) b.listeQuelle = "release";
    else {
      try { lb = await io.holen(url(LISTE), { frisch: true }); } catch (e) { return fehler("netz", "Dateiliste nicht geladen (" + ((e && e.message) || e) + ")"); }
      if (!(await listeOk(lb))) return fehler("pruefsumme", "Prüfsumme der Dateiliste stimmt nicht");
      b.listeQuelle = "raw";
    }
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
    const schritte = planen(neu, alt, ist, o.bekannt);
    const brauchen = schritte.filter((s) => LADEN[s.art]);
    const geladen = {};
    let fertig = 0;
    const dateien = brauchen.length === 1 ? "Datei" : "Dateien";
    const anteil = () => 0.08 + 0.72 * (brauchen.length ? fertig / brauchen.length : 1); // Laden: 8 bis 80 % des Balkens
    melden(`Lade 0 von ${brauchen.length} ${dateien} …`, anteil());
    try {
      await parallel(brauchen, G.parallel, async (s) => {
        let by;
        try { by = await io.holen(url(s.pfad)); } catch (e) { throw fehlerArt("netz", s.pfad + " nicht geladen (" + ((e && e.message) || e) + ")"); }
        if (by.length !== s.eintrag.groesse || (await sha256(by)) !== s.eintrag.sha256) throw fehlerArt("pruefsumme", "Prüfsumme stimmt nicht: " + s.pfad);
        geladen[s.pfad] = by;
        fertig++;
        melden(`Lade ${fertig} von ${brauchen.length} ${dateien} …`, anteil());
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
        const t = seiteHaken(alsText(p).replace(/\r\n/g, "\n"), dec(n));
        if (t !== alsText(p)) { schreiben.push({ pfad: p, bytes: enc(t), alt: c }); b.haken.push(p); }
      } else if (s.art === "json-mischen") {
        let t = jsonMischenText(alsText(p), dec(n), p, alt && alt.version);
        if (p === LESEZEICHEN) { const o = lesezeichenOhne(t != null ? t : alsText(p), weg); if (o != null) t = o; }
        if (t != null) { schreiben.push({ pfad: p, bytes: enc(t), alt: c }); b.einstellungen.push(p); }
      } else if (s.art === "uebersprungen") b.uebersprungen.push(p);
      else if (s.art === "entfernen" || s.art === "entfernen-sichern") { loeschen.push({ pfad: p, alt: c }); b.entfernt.push(p); }
      else if (s.art === "bleibt") b.behalten.push(p);
    }
    // Ältere Kopien „Seite (neu X).md“ (kopienAufraeumen): Die neue Kopie dieses Updates (neu <version>) ist nie dabei; bleibt
    // deine Seite, weil die Vorlage gleich blieb (eigene), bleibt die jüngste Kopie.
    const geschwister = geschwisterLeser(io), A = {}, art = {};
    if (alt) for (const a of alt.dateien) A[a.pfad] = a;
    for (const s of schritte) art[s.pfad] = s.art;
    for (const e of neu.dateien) {
      if (e.klasse !== "seite") continue;
      const vorlagen = [e.sha256].concat(hat(A, e.pfad) ? [A[e.pfad].sha256] : []);
      for (const k of await kopienAufraeumen(io, e.pfad, await geschwister(e.pfad), rel.version, vorlagen, art[e.pfad] !== "eigene")) {
        loeschen.push(k); b.aufgeraeumt.push(k.pfad);
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
        const c = await io.lesen(e.pfad), seiteNeu = !c || passt(await istVon(e.pfad, c, ""), "sha", e.sha256);
        for (const k of await kopienAufraeumen(io, e.pfad, kopien.map((x) => x.pfad), V, [e.sha256], seiteNeu)) weg(k.pfad, k.alt);
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

  // ---------- Ordner, die die Vorlage nicht mehr hat (seit 0.6.8; Datei-Zugriff über io) ----------
  // Freier Pfad für eine Datei, die wandert: pfad, sonst „Name 2.ext“, „Name 3.ext“ … → pfad | null
  const freierPfad = async (io, pfad) => {
    const t = nameTeile(pfad);
    for (let nr = 1; nr <= 50; nr++) {
      const p = nr === 1 ? pfad : t.ordner + t.basis + " " + nr + t.ext;
      if (!(await io.da(p))) return p;
    }
    return null;
  };
  // Das Update kennt nur Dateien aus system-dateien.json; einen Ordner der Vorlage, der wegfällt (erster Fall: „Eingang“ in
  // 0.6.7), ließe es für immer liegen. Je Eintrag in ALTE_ORDNER, sobald installiert.json mindestens „ab“ nennt: Dateien darin
  // wandern nach „nach“ (Unterordner bleiben, Links ziehen mit, ein belegter Name bekommt eine Zahl), gelöscht wird keine; liegt
  // danach nur noch MUELL darin, geht der Ordner weg. Fehlt er, ist der Eintrag ebenso erledigt. Einmal je Tresor: Erledigtes
  // steht in aufgeraeumt.json (synchronisiert), ein Ordner, den du später selbst so nennst, bleibt. Scheitert ein Verschieben,
  // bleibt der Eintrag offen und kommt beim nächsten Lauf wieder dran (schon Verschobenes liegt am Ziel). Nur auf dem Gerät, das
  // für alle schreibt (synchronisierte Pfade).
  // io: { lesen, schreiben, baum(ordner) → { dateien: [pfad] } | null (kein Ordner; alles darunter, auch versteckte Dateien),
  //   da(pfad) → bool, verschieben(von, nach), ordnerWeg(ordner) → bool }
  // o: { version (installiert.json), synchron, liste (Standard ALTE_ORDNER) }
  // → { ok, fehler, verschoben[{ ordner, von, nach }], entfernt[ordner], erledigt[ordner] }
  const ordnerAufraeumenMit = async (io, o) => {
    const b = { ok: true, fehler: "", verschoben: [], entfernt: [], erledigt: [] };
    if (!o.synchron) return b;
    let merk = null;
    try { const by = await io.lesen(AUFGERAEUMT); merk = by ? JSON.parse(dec(by)) : null; } catch (e) { merk = null; }
    const fertig = merk && Array.isArray(merk.erledigt) ? merk.erledigt.filter((x) => typeof x === "string") : [];
    const muell = (p) => MUELL.indexOf(p.slice(p.lastIndexOf("/") + 1)) >= 0;
    for (const a of o.liste || ALTE_ORDNER) {
      if (fertig.indexOf(a.ordner) >= 0 || neuer(a.ab, o.version)) continue;
      try {
        const t = await io.baum(a.ordner);
        if (t) {
          for (const p of t.dateien) {
            if (!a.nach || muell(p)) continue;
            const ziel = await freierPfad(io, a.nach + p.slice(a.ordner.length));
            if (!ziel) throw new Error("kein freier Name für " + p);
            await io.verschieben(p, ziel);
            b.verschoben.push({ ordner: a.ordner, von: p, nach: ziel });
          }
          const rest = await io.baum(a.ordner);
          if (rest && rest.dateien.every(muell) && (await io.ordnerWeg(a.ordner))) b.entfernt.push(a.ordner);
        }
        fertig.push(a.ordner);
        b.erledigt.push(a.ordner);
      } catch (e) { b.ok = false; b.fehler = a.ordner + ": " + grund(e); }
    }
    if (b.erledigt.length) {
      try { await io.schreiben(AUFGERAEUMT, enc(JSON.stringify({ erledigt: fertig }, null, 2) + "\n")); } catch (e) {
        b.ok = false; b.fehler = "aufgeraeumt.json: " + grund(e);
      }
    }
    return b;
  };

  // ---------- Hinweise für Claude nachholen (seit 0.6.9; Datei-Zugriff über io) ----------
  // .claude/CLAUDE.md und der Skill studium-autopilot kamen bis 0.6.8 nur mit der Installation und blieben danach auf deren
  // Stand (Befund 24.10.2026: Der Skill nannte noch den Ordner „Eingang“, den es seit 0.6.7 nicht mehr gibt). Das Update auf
  // 0.6.9 plant noch der alte update.js, der sie übergeht, und Obsidian Sync nimmt .claude/ nicht mit. Darum gleicht jeder
  // Computer sie nach jedem Update mit installiert.json ab, nach denselben Regeln wie das Update (planen): Fehlt eine oder ist
  // sie eine früher ausgelieferte Fassung (bekannt), kommt die neue. Hast du sie geändert, kommt die neue auch, deine liegt
  // vorher als „Name (deine Fassung vor X).md.txt“ daneben (wie bei Systemdateien: Alte Hinweise führten Claude in die Irre).
  // Eine früher ausgelieferte Datei, die die Liste nicht mehr nennt, geht weg (geändert: mit Sicherung daneben). Geladen wird
  // vom Tag der installierten Version, geprüft mit Größe und SHA-256 der Liste; geschrieben erst, wenn alles da ist, und alles
  // Ersetzte liegt danach in der Sicherung (schreibenSicher). Andere Dateien unter .claude/ fasst es nie an.
  // io: { holen, lesen, schreiben, loeschen } wie aktualisierenMit
  // o: { liste: geprüfte installiert.json, basis: Adresse am Tag v<liste.version> ("" = nichts laden), bekannt (wie planen), zeit }
  // → { ok, art (ok | aus (müsste laden, basis leer) | netz | pruefsumme | sicherung | schreiben), fehler, version, geaendert[],
  //   angelegt[], gesichert[{ pfad, sicherung }], entfernt[], sicherung, zurueckgesetzt }
  const claudeNachholenMit = async (io, o) => {
    const V = o.liste.version, bekannt = o.bekannt || {};
    const b = { ok: false, art: "", fehler: "", version: V, geaendert: [], angelegt: [], gesichert: [], entfernt: [], sicherung: "", zurueckgesetzt: false };
    const fehler = (art, text) => { b.art = art; b.fehler = text; return b; };
    const url = (pfad) => o.basis + (ORDNER + "/" + pfad).split("/").map(encodeURIComponent).join("/");
    const neu = { dateien: o.liste.dateien.filter((e) => e.klasse === "claude") }, N = {};
    for (const e of neu.dateien) N[e.pfad] = true;
    // nicht mehr gelistete Dateien als alte Liste ohne Prüfsumme: Unverändert ist dort nur, was bekannt ist
    const alt = { dateien: Object.keys(bekannt).filter((p) => !hat(N, p) && klasseVon(p) === "claude").map((p) => ({ pfad: p, klasse: "claude", sha256: "" })) };
    const ist = {}, istBytes = {};
    for (const e of neu.dateien.concat(alt.dateien)) {
      const by = await io.lesen(e.pfad);
      if (by) { istBytes[e.pfad] = by; ist[e.pfad] = await istVon(e.pfad, by, "claude"); }
    }
    const schritte = planen(neu, alt, ist, bekannt), geladen = {};
    const brauchen = schritte.filter((s) => LADEN[s.art]);
    if (brauchen.length && !o.basis) return fehler("aus", "Laden ist aus");
    for (const s of brauchen) {
      let by;
      try { by = await io.holen(url(s.pfad)); } catch (e) { return fehler("netz", s.pfad + " nicht geladen (" + grund(e) + ")"); }
      if (by.length !== s.eintrag.groesse || (await sha256(by)) !== s.eintrag.sha256) return fehler("pruefsumme", "Prüfsumme stimmt nicht: " + s.pfad);
      geladen[s.pfad] = by;
    }
    const schreiben = [], loeschen = [];
    for (const s of schritte) {
      if (s.art !== "ersetzen-sichern" && s.art !== "entfernen-sichern") continue;
      const k = await sicherungsName(io, s.pfad, V, istBytes[s.pfad]);
      if (!k) return fehler("sicherung", "Kein freier Name für die Sicherung: " + s.pfad);
      if (k.schreiben) schreiben.push({ pfad: k.pfad, bytes: istBytes[s.pfad], alt: null });
      b.gesichert.push({ pfad: s.pfad, sicherung: k.pfad });
    }
    for (const s of schritte) {
      const p = s.pfad, c = istBytes[p] || null;
      if (s.art === "anlegen") { schreiben.push({ pfad: p, bytes: geladen[p], alt: null }); b.angelegt.push(p); }
      else if (s.art === "ersetzen" || s.art === "ersetzen-sichern") { schreiben.push({ pfad: p, bytes: geladen[p], alt: c }); b.geaendert.push(p); }
      else if (s.art === "entfernen" || s.art === "entfernen-sichern") { loeschen.push({ pfad: p, alt: c }); b.entfernt.push(p); }
    }
    if (schreiben.length || loeschen.length) {
      const w = await schreibenSicher(io, schreiben, loeschen, SICHERUNG + V + " " + stempel(o.zeit || new Date()), () => {});
      b.sicherung = w.sicherung;
      b.zurueckgesetzt = w.zurueckgesetzt;
      if (w.art) { b.geaendert = []; b.angelegt = []; b.gesichert = []; b.entfernt = []; return fehler(w.art, w.fehler); }
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
    // frisch (Liste vom Tag, Manifest): Minuten-Zeitstempel und „no-cache“ wie zentral.js, damit nie ein alter Stand zurückkommt
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
    // Für ordnerAufraeumenMit: alles unter einem Ordner über den Adapter (auch .gitkeep, die Obsidian nicht zeigt)
    baum: async (ordner) => {
      const st = await ad().stat(ordner);
      if (!st || st.type !== "folder") return null;
      const dateien = [];
      const lauf = async (o) => {
        const r = await ad().list(o);
        for (const f of (r && r.files) || []) dateien.push(f);
        for (const u of (r && r.folders) || []) await lauf(u);
      };
      await lauf(ordner);
      return { dateien };
    },
    da: async (pfad) => !!(await ad().exists(pfad)),
    // über Obsidian, damit Links auf die Datei mitziehen; versteckte Dateien kennt Obsidian nicht, die gehen über den Adapter
    verschieben: async (von, nach) => {
      await ordnerAnlegen(nach);
      const f = app.vault.getAbstractFileByPath(von);
      if (istDatei(f)) await app.fileManager.renameFile(f, nach);
      else await ad().rename(von, nach);
    },
    // nur, wenn ordnerAufraeumenMit darin nichts außer MUELL gefunden hat („true“: samt .gitkeep und leeren Unterordnern)
    ordnerWeg: async (ordner) => {
      const o = app.vault.getAbstractFileByPath(ordner);
      if (!o || !o.children) return false;
      await app.vault.delete(o, true);
      return true;
    },
  };

  // ---------- Zustand ----------
  // bleibend: überlebt den Hot-Reload dieses Skripts (das Update ersetzt update.js womöglich selbst)
  const zustand = ctx.bleibend("zustand", () => ({ laeuft: false, heilt: false, raeumt: false, claude: false, installiert: "", bericht: null, fenster: null, marke: null }));
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
  // → "fertigstellen" | "anderes" | null (markeLage mit dem Stand dieses Geräts; s = Angaben aus dem Manifest, Standard stand())
  const lage = (s) => {
    const x = s || stand(), a = angebot(x.release, x.beta, kanal(), "0.0.0");
    return markeLage(zustand.marke, { installiert: installiertVersion(), ich: geraetId(), jetzt: Date.now(), laeuft: !!zustand.laeuft, angeboten: a ? a.version : "" });
  };
  const ANDERES = "Ein Update wird gerade auf einem anderen Gerät installiert.";
  const fertigText = () => `Das Update auf Version ${zustand.marke && zustand.marke.version} ist nicht fertig geworden.`;
  const listeAus = async (quelle, pfad) => {
    try {
      const by = await quelle.lesen(pfad);
      if (!by) return null;
      const lp = listePruefen(JSON.parse(dec(by)));
      return lp.wert ? { liste: lp.wert, bytes: by } : null;
    } catch (e) { return null; }
  };
  const listeLesen = (pfad) => listeAus(io, pfad);
  // Von Hand aktualisiert (neuere ZIP über den Tresor entpackt, docs/installation.md): installiert.json liegt nicht in der ZIP und
  // nennt weiter die alte Version; die Zeile zeigte sie und böte die schon laufende Version noch einmal an. Nennen der laufende
  // Kern (o.lauf) und system-dateien.json dieselbe neuere Version und gleicht jede Systemdatei der Liste (Größe und SHA-256),
  // gilt sie als installiert. Nicht, solange update.json ein Update genau dieser Version nennt: Das stellt „Update
  // fertigstellen“ fertig (entfernt auch, was die Version nicht mehr hat). Auch nicht, solange noch etwas da ist, das ein Update
  // entfernen würde (planen: entfernen, entfernen-sichern), etwa ein Skript, das die neue Version nicht mehr hat: Das Entpacken
  // löscht nichts, und mit der neuen Liste stünde es in keiner Liste mehr, kein Update räumte es je weg. Die Zeile bietet die
  // Version dann weiter an; installieren räumt auf. io wie aktualisierenMit, nur lesen.
  // → { version, bytes (system-dateien.json) } | null
  const handInstalliertMit = async (quelle, o) => {
    const inst = await listeAus(quelle, INSTALLIERT), neu = await listeAus(quelle, LISTE);
    if (!inst || !neu || neu.liste.version !== o.lauf || !neuer(neu.liste.version, inst.liste.version)) return null;
    let m = null;
    try { const by = await quelle.lesen(MARKE); m = by ? JSON.parse(dec(by)) : null; } catch (e) { m = null; }
    if (m && m.version === neu.liste.version) return null;
    const N = {};
    for (const e of neu.liste.dateien) {
      N[e.pfad] = true;
      if (e.klasse !== "system") continue;
      const by = await quelle.lesen(e.pfad);
      if (!by || by.length !== e.groesse || (await sha256(by)) !== e.sha256) return null;
    }
    for (const a of inst.liste.dateien) {
      if (hat(N, a.pfad)) continue;
      const by = await quelle.lesen(a.pfad);
      if (by && (a.klasse === "system" || (await sha256(by)) === a.sha256)) return null;
    }
    return { version: neu.liste.version, bytes: neu.bytes };
  };
  // Die Liste schreibt danach nur das Gerät, das für alle schreibt (ctx.zentral.abruferHier, wie heilen); sie ist dieselbe Kopie
  // von system-dateien.json wie bei der Erstinstallation. So gilt für das nächste Update der Stand, der wirklich da ist: Eine
  // Seite, die von der neuen Vorlage abweicht, gilt als deine und bleibt; ohne neue Liste sähe jede Systemdatei geändert aus und
  // bekäme eine Sicherung daneben. Andere Geräte zeigen die Version gleich, ohne zu schreiben.
  const installiertNeu = async () => {
    const x = await listeLesen(INSTALLIERT);
    let v = x ? x.liste.version : "";
    if (x && !zustand.laeuft && neuer(laufendeVersion(), v)) {
      const h = await handInstalliertMit(io, { lauf: laufendeVersion() });
      if (h) {
        v = h.version;
        let hier = true;
        try { if (ctx.zentral && typeof ctx.zentral.abruferHier === "function") hier = !!(await ctx.zentral.abruferHier()); } catch (e) { hier = false; }
        if (hier && !zustand.laeuft) { try { await io.schreiben(INSTALLIERT, h.bytes); } catch (e) { console.error("update: installiert.json", e); } }
      }
    }
    // Läuft ein neuerer Kern als eingetragen, kommen die übrigen Dateien vielleicht noch per Sync: registrieren prüft dann bei
    // jeder Änderung unter System/ noch einmal
    zustand.handWartet = !!x && neuer(laufendeVersion(), v);
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
  // Lesezeichen der Vorlage (LESEZEICHEN_NEU) einmal je Gerät und Version, sobald die installierte Version sie mitbringt
  // (Merker eba-update-lesezeichen = Version; was du danach änderst, bleibt). Danach liest Obsidians Lesezeichen-Plugin die
  // Datei neu, sonst schriebe es beim nächsten Speichern seine Liste aus dem Speicher zurück. o (Test): { io, plugin }.
  // → true, wenn sich bookmarks.json geändert hat
  const L_LESEZEICHEN = "eba-update-lesezeichen";
  const lesezeichenAnwenden = async (V, o) => {
    const merk = lokal(L_LESEZEICHEN);
    if (!semver(V) || merk === V) return false;
    const d = (o && o.io) || io;
    const offen = LESEZEICHEN_NEU.filter((e) => !neuer(e.ab, V) && !(semver(merk) && !neuer(e.ab, merk)));
    const by = offen.length ? await d.lesen(LESEZEICHEN) : null;
    const t = by ? lesezeichenNachziehen(dec(by), offen) : null;
    if (t != null) {
      await d.schreiben(LESEZEICHEN, enc(t));
      const ip = app && app.internalPlugins && app.internalPlugins.plugins;
      const b = o ? o.plugin : ip && ip.bookmarks;
      if (b && b.enabled && b.instance && typeof b.instance.onExternalSettingsChange === "function") await b.instance.onExternalSettingsChange();
    }
    lokal(L_LESEZEICHEN, V);
    return t != null;
  };
  // Alte Ordner (ordnerAufraeumenMit) bei jedem Lauf von heilen, vor dessen Merker: Erledigtes steht in aufgeraeumt.json. Sind
  // Dateien gewandert, sagt ein Hinweis je Ordner, wohin. → Bericht | null (nichts zu prüfen)
  const ordnerAufraeumen = async (V, synchron) => {
    if (!synchron || zustand.raeumt || !ALTE_ORDNER.some((a) => !neuer(a.ab, V))) return null;
    zustand.raeumt = true;
    let b;
    try { b = await ordnerAufraeumenMit(io, { version: V, synchron }); } finally { zustand.raeumt = false; }
    if (!b.ok) console.error("update: alte Ordner", b.fehler);
    for (const a of ALTE_ORDNER) {
      const n = b.verschoben.filter((v) => v.ordner === a.ordner).length;
      if (n) ctx.hinweis(`${n === 1 ? "Eine Datei" : n + " Dateien"} aus dem Ordner „${a.ordner}“, den es nicht mehr gibt, ${n === 1 ? "liegt" : "liegen"} jetzt in „${a.nach}“.`, { dauer: 12000 });
    }
    return b;
  };
  // Hinweise für Claude (claudeNachholenMit) einmal je Computer und installierter Version, bei jedem Lauf von heilen; nicht
  // während eines Updates, nicht, solange ein anderes Gerät gerade installiert (lage), und nicht auf iPhone, iPad und Android:
  // Claude Code läuft nur am Computer. Jeder Computer schreibt selbst (.claude/ ist wie .obsidian/ je Gerät, Obsidian Sync nimmt
  // es nicht mit; gleichen LiveSync oder iCloud es doch ab, schreiben alle dieselben Bytes). Aus dem Netz nur bei eingeschalteten
  // zentralen Daten (docs/datenschutz.md); sonst nur, was ohne Laden geht, und beim nächsten Lauf noch einmal. Gerätelokal
  // eba-update-claude = { version, sha: pfad → SHA-256 der Fassungen, die danach hier liegen }.
  const L_CLAUDE = "eba-update-claude";
  // Früher ausgelieferte Fassungen: CLAUDE_FRUEHER und die vom letzten Lauf auf diesem Gerät (installiert.json nennt nur die
  // jetzige, .claude/ kann hier aber eine Version hinterherhinken). → pfad → [SHA-256]
  const claudeBekannt = () => {
    const aus = {}, m = lokal(L_CLAUDE);
    for (const p of Object.keys(CLAUDE_FRUEHER)) aus[p] = CLAUDE_FRUEHER[p].slice();
    const sha = m && typeof m === "object" && m.sha && typeof m.sha === "object" ? m.sha : {};
    for (const p of Object.keys(sha)) {
      if (typeof sha[p] !== "string" || !HEX.test(sha[p]) || klasseVon(p) !== "claude") continue;
      if (!hat(aus, p)) aus[p] = [];
      if (aus[p].indexOf(sha[p]) < 0) aus[p].push(sha[p]);
    }
    return aus;
  };
  // x: { liste } (installiert.json); immer = true (Test): ohne Merker und auch auf iPhone und iPad. → Bericht | null
  const claudeNachholen = async (immer, x) => {
    const V = x.liste.version, m = lokal(L_CLAUDE);
    if (!immer && ((m && m.version === V) || (obs.Platform && obs.Platform.isMobile))) return null;
    if (zustand.laeuft || zustand.claude || lage() === "anderes") return null;
    zustand.claude = true;
    let b;
    try {
      b = await claudeNachholenMit(io, { liste: x.liste, basis: zentralAn() && !plugin().testZentralAus ? tagBasis(V) : "", bekannt: claudeBekannt(), zeit: new Date() });
    } finally { zustand.claude = false; }
    if (!b.ok) { if (b.art !== "aus") console.error("update: Hinweise für Claude", b.fehler); return b; }
    const sha = {};
    for (const e of x.liste.dateien) if (e.klasse === "claude") sha[e.pfad] = e.sha256;
    lokal(L_CLAUDE, { version: V, sha });
    if (b.gesichert.length) ctx.hinweis(`Die Hinweise für Claude sind jetzt auf dem Stand von Version ${V}, deine geänderte Fassung liegt als Sicherung daneben.`, { dauer: 12000 });
    return b;
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
    try { await lesezeichenAnwenden(V); } catch (e) { console.error("update: Lesezeichen", e); }
    let synchron = true;
    try { if (ctx.zentral && typeof ctx.zentral.abruferHier === "function") synchron = !!(await ctx.zentral.abruferHier()); } catch (e) { synchron = false; }
    try { await ordnerAufraeumen(V, synchron); } catch (e) { console.error("update: alte Ordner", e); }
    try { await claudeNachholen(immer, x); } catch (e) { console.error("update: Hinweise für Claude", e); }
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
  // Angaben zum Release aus dem letzten Manifest (gerätelokal in zentral.js). Zentrale Daten aus → keine: Der Stand bliebe sonst
  // beim Ausschalten stehen, die Zeile sagte weiter „Du hast die neueste Version.“ oder böte ein altes Angebot an.
  const stand = () => {
    if (!zentralAn()) return { release: null, beta: null, aktuell: "" };
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
  // Schalter „Beta-Versionen“ (im Fenster „Updates“ unter „Mehr erfahren“, verbindungen.js)
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

  // Mitzählen: Feld zaehlen in System/Einstellungen.md (gilt für den ganzen Tresor); fehlt es, ist es an. Seit 0.7.1 ohne
  // Schalter; wer „Mitzählen“ bis 0.7.0 ausgeschaltet hat (zaehlen: false), lädt die Liste beim Update nur vom Tag.
  const zaehlenAn = () => {
    try {
      const f = app.vault.getAbstractFileByPath(EINSTELLUNGEN), c = f && app.metadataCache.getFileCache(f);
      return !(c && c.frontmatter && c.frontmatter.zaehlen === false);
    } catch (e) { return true; }
  };

  // ---------- Anzeige (Zeile „Updates“ in eba-verbindungen) ----------
  // → { html, pille, symbol, ton, knopf: { aktion, text, cta? (false: normaler Knopf) } | null, kurz? (Stand in der kompakten Zeile,
  //   wenn nichts zu tun ist: „Aktuell“ bzw. „Nicht geprüft“ ohne Angaben zum Release; sonst sagt es die Pille. Die Version
  //   steht darunter, verbindungen.js) }
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
    if (rel) return { html: esc(`Version ${inst}. Du hast die neueste Version.${zusatz}`), kurz: "Aktuell", pille: `<span class="eba-pill ok">aktuell</span>`, symbol: "haken", ton: "ok", knopf: SUCHEN };
    return { html: esc(`Version ${inst}.${zusatz}`), kurz: "Nicht geprüft", pille: "", symbol: "haken", ton: "leise", knopf: SUCHEN };
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
    // Nur der Titel; was neu ist, zeigt das Fenster nach **Neue Version installieren** (seit 17.10.2026 kein Satz im Hinweis,
    // seit 0.5.4 kein eigener Knopf „Was ist neu“: er öffnete dasselbe Fenster).
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

  // ---------- Fenster „Neue Version“ (seit 0.5.4): ein Fenster für das ganze Update ----------
  // Angebot → wird installiert → Ergebnis im selben Fenster; ohne Angebot ist es „Was ist neu“. Kein Hinweis daneben: Bis 0.5.2
  // kamen nacheinander das Fenster vor dem Update, der Hinweis „Lade …“ oben rechts und das Ergebnisfenster, und der Hinweis
  // beim Öffnen blieb daneben stehen. Aufbau (CSS Abschnitt 51): Titel, ein Satz, „Wichtig“ (nur, wenn du etwas tun musst),
  // die Änderungen aus CHANGELOG.md mit eigenem Bildlauf, der Fuß und die Knopfreihe. Der Fuß ist je Stufe der Satz zur
  // Sicherung (Angebot), Balken und Schritt (läuft), Zeilen wie „Andere Geräte“ und „Sicherung“ (fertig) oder der Grund (fehler).
  const Modal = obs.Modal;
  const name = (p) => p.split("/").pop().replace(/\.md$/, "");
  const FEHLERTEXT = {
    netz: "Die neue Version ließ sich gerade nicht laden. Es wurde nichts geändert. Versuch es später noch einmal.",
    pruefsumme: "Die neue Version kam nicht vollständig an. Es wurde nichts geändert. Versuch es später noch einmal.",
    liste: "Mit der neuen Version stimmt etwas nicht. Es wurde nichts geändert. Versuch es später noch einmal.",
    sicherung: "Die Sicherung ließ sich nicht anlegen. Es wurde nichts geändert.",
    schreiben: "Beim Speichern ging etwas schief. Alles wurde auf den alten Stand zurückgesetzt.",
  };
  // Satz unter dem Titel nach einem Update (Bericht b)
  const ergebnisSatz = (b) => {
    if (!b.ok) return FEHLERTEXT[b.art] || FEHLERTEXT.netz;
    const n = b.geaendert.length + b.angelegt.length + b.gemischt.length + b.haken.length + b.einstellungen.length;
    return n ? `${n} ${n === 1 ? "Datei" : "Dateien"} aktualisiert. Deine Einträge sind geblieben.` : "Alles war schon aktuell.";
  };
  // Zeilen unter dem Ergebnis: { titel, text, wichtig } in dieser Reihenfolge. wichtig = du musst noch etwas tun (steht oben,
  // über den Änderungen); die anderen stehen klein im Fuß.
  const ergebnisZeilen = (b) => {
    const z = [];
    if (!b.ok) return z;
    if (b.plugin && !b.neuGeladen) z.push({ titel: "Noch ein Schritt", text: "Obsidian einmal schließen und wieder öffnen.", wichtig: true });
    else if (b.einstellungen.length) z.push({ titel: "Einstellungen", text: "Ergänzt. Sie wirken nach dem nächsten Öffnen von Obsidian." });
    if (b.neuKopien.length) z.push({ titel: "Deine Seiten", text: `Deine Fassung bleibt, die neue liegt daneben („neu ${b.version}“): ${b.neuKopien.map((x) => name(x.pfad)).join(", ")}.` });
    if (b.gesichert && b.gesichert.length) z.push({ titel: "Deine Änderungen", text: `Jetzt gilt die neue Fassung, deine liegt als Sicherung daneben („deine Fassung vor ${b.version}“): ${b.gesichert.map((x) => x.pfad.split("/").pop()).join(", ")}.` });
    if (b.behalten.length) z.push({ titel: "Behalten", text: `Nicht mehr in der neuen Version, du hattest sie geändert: ${b.behalten.map(name).join(", ")}.` });
    z.push({ titel: "Andere Geräte", text: (b.plugin ? "Das Update kommt von selbst. Dort einmal auf „Neu laden“ oben auf dem Dashboard tippen." : "Das Update kommt von selbst, dort musst du nichts tun.")
      // LiveSync (livesync.js) gleicht nur ab, solange Obsidian hier offen ist
      + (b.livesync ? " Lass Obsidian hier noch eine Minute offen, damit alles bei ihnen ankommt." : "") });
    if (b.sicherung) z.push({ titel: "Sicherung", text: `Im versteckten Ordner „${b.sicherung}“ deines Tresors, am PC oder Mac zu öffnen.` });
    return z;
  };
  // o = { stufe: "angebot" | "laeuft" | "neu", von, bis, angebot, ohneListe } → Griff { m, version, stufe, offen, wartet,
  //   antwort (Promise: true = „Neue Version installieren“, false = geschlossen oder „Später“), laeuft(text, anteil), fertig(b) }
  //   oder null (ohne Obsidian). Öffnen blendet den Hinweis zum Update aus; mit Angebot zählt die Version auf diesem Gerät als
  //   gesehen (eba-update-toast mit fenster: true, toastFaellig), auch wenn du das Fenster nur schließt.
  const fensterZeigen = (o) => {
    if (!Modal) return null;
    if (zustand.fenster && zustand.fenster.offen) zustand.fenster.m.close();
    toastWeg();
    if (o.angebot) { sitzungMerken(true); lokal(L_TOAST, { version: o.bis, zeit: Date.now(), fenster: true }); }
    const m = new Modal(app);
    const comp = obs.Component ? new obs.Component() : null;
    if (comp) comp.load();
    m.modalEl.addClass("eba-modal", "eba-modal-update");
    const c = m.contentEl;
    const satz = c.createEl("p", { cls: "eba-modal-text eba-up-satz" });
    const wichtig = c.createDiv({ cls: "eba-up-wichtig" });
    const liste = c.createDiv({ cls: "eba-neu-liste" });
    const fuss = c.createDiv({ cls: "eba-up-fuss" });
    const k = c.createDiv({ cls: "modal-button-container" });
    let antworten = null;
    const g = { m, version: o.bis, stufe: "", offen: true, wartet: false, antwort: new Promise((r) => { antworten = r; }) };
    const antwort = (ja) => { const r = antworten; antworten = null; if (r) r(ja); };
    const stufe = (s, titel, text) => {
      g.stufe = s;
      m.modalEl.setAttr("data-stufe", s);
      m.titleEl.setText(titel);
      satz.setText(text);
      wichtig.empty(); fuss.empty(); k.empty();
    };
    // Reihenfolge wie in allen Fenstern: Hauptknopf zuletzt (PC/iPad rechts, iPhone oben; Abschnitt 43)
    const knopf = (text, tun, cta) => { k.createEl("button", cta ? { text, cls: "mod-cta" } : { text }).addEventListener("click", tun); };
    const zeile = (el, z) => { const r = el.createDiv({ cls: "eba-up-zeile" }); r.createEl("b", { text: z.titel }); r.createSpan({ text: z.text }); };
    const angebotZeigen = () => {
      stufe("angebot", `Neue ${istBeta(o.bis) ? "Beta-Version" : "Version"} ${o.bis}`, `Du hast Version ${o.von}.`);
      fuss.createEl("p", { cls: "eba-up-sicher", text: "Deine Noten, Termine und Notizen bleiben. Vorher wird eine Sicherung angelegt." });
      knopf("Später", () => m.close());
      knopf("Neue Version installieren", () => {
        if (g.wartet) { antwort(true); return; } // aktualisieren() hat gefragt und wartet
        aktualisieren(g).catch((e) => console.error("update", e));
      }, true);
    };
    g.laeuft = (text, anteil) => {
      if (g.stufe !== "laeuft") {
        stufe("laeuft", `Version ${o.bis} wird installiert`, "Lass Obsidian offen, bis es fertig ist.");
        g.balken = fuss.createDiv({ cls: "eba-up-balken", attr: { role: "progressbar", "aria-label": "Fortschritt", "aria-valuemin": "0", "aria-valuemax": "100", "aria-valuenow": "0" } });
        g.fuellung = g.balken.createDiv({ cls: "eba-up-fuellung" });
        g.schritt = fuss.createEl("p", { cls: "eba-up-schritt", attr: { "aria-live": "polite" } });
      }
      if (text) g.schritt.setText(text);
      if (typeof anteil === "number") {
        const p = Math.round(Math.max(0, Math.min(1, anteil)) * 100);
        g.fuellung.style.width = p + "%";
        g.balken.setAttr("aria-valuenow", String(p));
      }
    };
    g.fertig = (b) => {
      stufe(b.ok ? "fertig" : "fehler", b.ok ? `Version ${b.version} ist installiert` : "Nicht installiert", ergebnisSatz(b));
      if (!b.ok && b.fehler) fuss.createEl("p", { cls: "eba-up-grund", text: b.fehler });
      for (const z of ergebnisZeilen(b)) zeile(z.wichtig ? wichtig : fuss, z);
      knopf("Fertig", () => m.close(), true);
    };
    m.onClose = () => { g.offen = false; if (comp) comp.unload(); c.empty(); if (zustand.fenster === g) zustand.fenster = null; antwort(false); };
    zustand.fenster = g;
    if (o.stufe === "laeuft") g.laeuft("Prüfe die neue Version …", 0);
    else if (o.stufe === "neu") { stufe("neu", "Was ist neu", `Du hast jetzt Version ${o.bis}.`); knopf("Fertig", () => m.close(), true); }
    else angebotZeigen();
    m.open();
    if (o.ohneListe) return g;
    liste.createEl("p", { cls: "eba-modal-text", text: "Lädt …" });
    g.geladen = abschnitteZeichnen(liste, o, comp).catch((e) => { console.error("update: Was ist neu", e); return 0; });
    return g;
  };
  // Ergebnis im offenen Fenster; hast du es während des Updates geschlossen (oder gab es keins), kommt es dafür wieder
  const ergebnisZeigen = (b, g) => {
    if (g && g.offen) { g.fertig(b); return g; }
    const f = fensterZeigen({ stufe: "neu", von: b.vorher || "", bis: b.version || "", ohneListe: !b.ok });
    if (f) f.fertig(b);
    return f;
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

  // ---------- Kern nachholen (vor „Neu laden“) ----------
  // Befund 21.10.2026: Nach dem Update auf einem anderen Gerät zeigte das iPhone „Version 0.5.4 ist da“, der Sync hatte den
  // neuen Kern (.obsidian/plugins/…) aber nicht geliefert. „Neu laden“ lud den alten Kern von der Platte, die Zeile blieb,
  // und es kam kein Wort. Darum vorher: Kerndateien mit installiert.json vergleichen, abweichende aus dem Release dieser
  // Version laden und wie beim Update mit Größe und SHA-256 prüfen. Geschrieben wird erst, wenn alles da ist, manifest.json
  // zuletzt; ein Schreibfehler setzt die schon geschriebenen zurück.
  // o: { liste: geprüfte installiert.json, basis: Adresse am Tag v<liste.version> }
  // → { ok, art (ok | netz | pruefsumme | schreiben), fehler, geschrieben[] }
  const kernNachholen = async (io, o) => {
    const r = { ok: false, art: "", fehler: "", geschrieben: [] };
    const fehler = (art, text) => { r.art = art; r.fehler = text; return r; };
    const url = (pfad) => o.basis + (ORDNER + "/" + pfad).split("/").map(encodeURIComponent).join("/");
    const fehlt = [];
    for (const e of o.liste.dateien) {
      if (!kernDatei(e.pfad)) continue;
      const by = await io.lesen(e.pfad);
      if (!by || by.length !== e.groesse || (await sha256(by)) !== e.sha256) fehlt.push({ e, alt: by });
    }
    const istManifest = (f) => f.e.pfad === KERN + "manifest.json";
    const reihe = fehlt.filter((f) => !istManifest(f)).concat(fehlt.filter(istManifest));
    for (const f of reihe) {
      try { f.neu = await io.holen(url(f.e.pfad)); } catch (e) { return fehler("netz", f.e.pfad + " nicht geladen (" + grund(e) + ")"); }
      if (f.neu.length !== f.e.groesse || (await sha256(f.neu)) !== f.e.sha256) return fehler("pruefsumme", "Prüfsumme stimmt nicht: " + f.e.pfad);
    }
    const fertig = [];
    try {
      for (const f of reihe) { await io.schreiben(f.e.pfad, f.neu); fertig.push(f); }
    } catch (e) {
      for (const f of fertig) {
        try { if (f.alt) await io.schreiben(f.e.pfad, f.alt); else await io.loeschen(f.e.pfad); } catch (x) { console.error("update: Kern zurück " + f.e.pfad, x); }
      }
      return fehler("schreiben", grund(e));
    }
    r.geschrieben = fertig.map((f) => f.e.pfad);
    r.ok = true;
    r.art = "ok";
    return r;
  };
  // „Neu laden“: erst den Kern nachholen, dann laden. Läuft danach immer noch ein älterer Kern als installiert, sagt es ein
  // Hinweis. → true, wenn der Kern der installierten Version läuft
  const neuLaden = async () => {
    const x = await listeLesen(INSTALLIERT);
    const basis = x ? tagBasis(x.liste.version) : "";
    if (basis) {
      const r = await kernNachholen(io, { liste: x.liste, basis });
      if (!r.ok) {
        console.error("update: Kern nachholen", r.fehler);
        ctx.hinweis(r.art === "netz" ? "Keine Verbindung. Versuch es gleich noch einmal." : "Neu laden hat nicht geklappt. Bitte Obsidian einmal schließen und wieder öffnen.");
        return false;
      }
    }
    const ok = await pluginNeuLaden();
    const pl = app.plugins && app.plugins.plugins && app.plugins.plugins[PLUGIN_ID];
    if (!ok || !pl || !pl.manifest || neuer(installiertVersion(), pl.manifest.version)) {
      ctx.hinweis("Bitte Obsidian einmal schließen und wieder öffnen.");
      return false;
    }
    return true;
  };

  // ---------- Ablauf nach dem Tipp auf „Neue Version installieren“ bzw. „Update fertigstellen“ ----------
  // Installiert gerade ein anderes Gerät (lage „anderes“), nur der Satz. Fertigstellen derselben Version fragt nicht noch einmal
  // (du hattest schon bestätigt); ein zweiter Lauf lädt und schreibt nur, was noch fehlt. g: das Fenster, in dem du gerade
  // **Neue Version installieren** getippt hast (keine zweite Frage, es zeigt gleich „Prüfe …“); sonst fragt ein neues Fenster.
  // Fortschritt und Ergebnis stehen im Fenster, nie in einem Hinweis.
  const fragen = async (rel, inst) => {
    const p = plugin();
    if (typeof p.testUpdateAntwort === "boolean") return { ja: p.testUpdateAntwort, g: null };
    const g = fensterZeigen({ stufe: "angebot", von: inst, bis: rel.version, angebot: rel });
    if (!g) return { ja: false, g: null };
    g.wartet = true;
    return { ja: await g.antwort, g };
  };
  const aktualisieren = async (g) => {
    if (zustand.laeuft) return null;
    toastWeg();
    sitzungMerken(true); // du kümmerst dich gerade um das Update: in diesem App-Start kein Hinweis mehr dazu
    const zu = () => { if (g && g.offen) g.m.close(); };
    if (!ctx.zentral || !ctx.zentral.manifestHolen) { zu(); ctx.hinweis("Das geht gerade nicht. Bitte später noch einmal versuchen."); return null; }
    if (g && g.offen) g.laeuft("Prüfe die neue Version …", 0);
    await markeNeu();
    const l = lage();
    if (l === "anderes") { zu(); ctx.hinweis(ANDERES + " Öffne Obsidian dort, dann kommt es hierher."); return null; }
    let rel;
    const inst = installiertVersion();
    try { const m = await ctx.zentral.manifestHolen(); rel = angebot(m.release, m.beta, kanal(), inst); } catch (e) {
      const b = { ok: false, art: "netz", fehler: (e && e.message) || String(e) };
      zustand.bericht = b; ergebnisZeigen(b, g); return b;
    }
    neuZeichnen();
    if (!rel) { zu(); ctx.hinweis(`Du hast schon die neueste Version (${inst}).`); return null; }
    // Bietet das Manifest inzwischen eine andere Version an als das Fenster, fragt ein neues
    if (g && g.version !== rel.version) { zu(); g = null; }
    const fertig = l === "fertigstellen" && zustand.marke && rel.version === zustand.marke.version;
    if (!g && !fertig) {
      const a = await fragen(rel, inst);
      if (!a.ja) return null;
      g = a.g;
    }
    if (!g || !g.offen) g = fensterZeigen({ stufe: "laeuft", von: inst, bis: rel.version }); // Fertigstellen (ohne Frage), Tests
    const ich = geraetId();
    const p = plugin();
    if (p.testUpdateBasis) rel = Object.assign({}, rel, { url_basis: String(p.testUpdateBasis) });
    zustand.laeuft = true;
    neuZeichnen();
    const melden = (t, anteil) => { try { if (g && g.offen) g.laeuft(t, anteil); } catch (e) { /* egal */ } };
    let b;
    try {
      p.stillBis = Date.now() + 120000; // Kern: keine „Aktualisiert: …“-Hinweise beim Hot-Reload der Skripte
      const alt = (await listeLesen(INSTALLIERT)) || (await listeLesen(LISTE));
      // Liste aus dem Release (Mitzählen): nicht mit einer anderen Basis (Testeinstieg) und nicht, wenn „Mitzählen“ aus ist
      const listeRelease = p.testUpdateBasis || !zaehlenAn() ? null : listeReleaseUrl(rel.version);
      b = await aktualisierenMit(io, { release: rel, alt: alt ? alt.liste : null, altVersion: inst, zeit: new Date(), listeRelease,
        bekannt: claudeBekannt(), marke: ich ? { geraet: ich, seit: new Date().toISOString() } : null, fortschritt: melden });
      if (b.ok) {
        zustand.installiert = rel.version;
        b.vorher = inst;
        lokal(L_GESEHEN, rel.version); // dieses Gerät sieht das Ergebnis im Fenster, also kein „Aktualisiert auf …“ danach
        b.livesync = !!(ctx.user && ctx.user.livesync && ctx.user.livesync.aktiv(app));
        if (b.plugin) { melden("", 1); b.neuGeladen = await pluginNeuLaden(); }
      }
    } catch (e) {
      console.error("update", e);
      b = { ok: false, art: "schreiben", fehler: (e && e.message) || String(e) };
    } finally {
      zustand.laeuft = false;
      p.stillBis = Date.now() + 5000;
    }
    zustand.bericht = b;
    // Nach dem Neuladen gehört die Anzeige der neuen Plugin-Instanz (die alte darf nichts mehr zeichnen)
    if (!b.neuGeladen) { await markeNeu(); neuZeichnen(); }
    ergebnisZeigen(b, g);
    return b;
  };

  // ---------- Nach Updates suchen (Knopf in der Zeile „Updates“ und Befehl, seit 0.4.8) ----------
  // Holt das Manifest sofort, ohne die Wartezeit der automatischen Prüfung (zählt als Prüfung: eba-update-geprueft), und sagt das
  // Ergebnis: das Angebot im Fenster „Neue Version“ (seit 0.5.4), sonst ein Hinweis: „Du hast die neueste
  // Version.“ → "angebot" | "aktuell" | "laden" | "link" | "fertigstellen" | "anderes" | "fehler" | null (läuft gerade)
  const suchen = async () => {
    if (zustand.laeuft) return null;
    if (!ctx.zentral || !ctx.zentral.manifestHolen) { ctx.hinweis("Das geht gerade nicht. Bitte später noch einmal versuchen."); return "fehler"; }
    lokal(L_GEPRUEFT, Date.now());
    let m;
    try { m = (await ctx.zentral.manifestHolen()) || {}; } catch (e) {
      console.error("update: Nach Updates suchen", e);
      ctx.hinweis("Keine Verbindung. Versuch es später noch einmal.");
      return "fehler";
    }
    await markeNeu();
    neuZeichnen();
    // Das eben geholte Manifest zählt, auch bei ausgeschalteten zentralen Daten (dann zeigt die Zeile danach keine Angaben)
    const s = { release: m.release || null, beta: m.beta || null, aktuell: m.plugin_aktuell || "" };
    const inst = installiertVersion(), lauf = laufendeVersion(), l = lage(s);
    if (l === "anderes") { ctx.hinweis(ANDERES + " Öffne Obsidian dort, dann kommt es hierher."); return l; }
    if (l === "fertigstellen") { ctx.hinweis(fertigText(), { aktion: { text: "Update fertigstellen", ausfuehren: () => aktualisieren() } }); return l; }
    if (neuer(inst, lauf)) { ctx.hinweis(`Version ${inst} ist da. Einmal neu laden.`, { aktion: { text: "Neu laden", aktion: "vorlage-neu-laden" } }); return "laden"; }
    const a = angebot(s.release, s.beta, kanal(), inst);
    if (a) {
      // Du hast gefragt: gleich das Fenster mit den Änderungen und **Neue Version installieren** (seit 0.5.4, vorher ein Hinweis)
      fensterZeigen({ stufe: "angebot", von: inst, bis: a.version, angebot: a });
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
  const L_GEZAEHLT = "eba-update-gezaehlt"; // bis 0.7.0: Version, die dieses Gerät mitgezählt hatte; der Start räumt ihn weg
  const LISTE_ASSET = "system-dateien.json"; // die Liste als Datei in jedem GitHub-Release seit 0.7.1 (release.py --zip)
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
  // Hast du das Fenster zu dieser Version gesehen (merk.fenster, seit 0.5.4), kommt für sie kein Hinweis mehr, auch wenn du es
  // nur geschlossen hast: Du weißt Bescheid, und die Zeilen auf dem Dashboard und unter Verbindungen bieten sie weiter an.
  const toastFaellig = (merk, version, jetzt) => !merk || merk.version !== version || (!merk.fenster && !(jetzt - Number(merk.zeit) < TOAST_ABSTAND));
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

  // Zustand (überlebt den Hot-Reload): Start des Fensters, Zeit des Verbergens, der Hinweis zum Update, Changelogs je Version
  const neuigkeit = ctx.bleibend("neuigkeit", () => ({ start: 0, versteckt: 0, verdeckt: false, toast: null, changelog: {} }));
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

  // Mitzählen: Adresse der Liste im GitHub-Release einer Version (RELEASES aus zentral.js, ein Fork setzt seine eigene). GitHub
  // zählt jeden Abruf einer Datei aus einem Release (download_count); der Autor sieht nur diese Zahl je Version.
  const listeReleaseUrl = (version) => releasesUrl() + "/download/v" + version + "/" + LISTE_ASSET;

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
    if (typeof ctx.hinweis !== "function" || sitzungGezeigt() || zustand.laeuft || zustand.fenster || einrichtungOffen()) return null;
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
  // Hinweis mit Knopf (ctx.hinweis, Gestalt CSS Abschnitt 51, ≥ 44 px). Antippen irgendwo blendet ihn aus. Es gibt
  // immer nur EINEN: ein neuer ersetzt den alten, und er geht weg, sobald das Fenster „Neue Version“ aufgeht, ein Update beginnt
  // oder die App in den Hintergrund geht (iOS hält dort seine Zeit an; er stünde sonst Stunden später noch da). Beim Angebot
  // öffnet **Neue Version installieren** das Fenster mit den Änderungen; „Aktualisiert auf …“ hat **Was ist neu**.
  const toastWeg = () => {
    const t = neuigkeit.toast;
    neuigkeit.toast = null;
    try { if (t) t.hide(); } catch (e) { /* schon weg */ }
  };
  const toastZeigen = (t) => {
    toastWeg();
    const knopf = t.angebot ? { text: "Neue Version installieren", ausfuehren: () => aktualisieren() }
      : { text: "Was ist neu", ausfuehren: () => { neuigkeitenZeigen({ von: t.von, bis: t.bis }); } };
    neuigkeit.toast = ctx.hinweis(t.text, { aktion: knopf, dauer: t.angebot ? 30000 : 15000 });
    return neuigkeit.toast;
  };

  // ---------- Änderungen aus CHANGELOG.md (Liste im Fenster „Neue Version“) ----------
  // CHANGELOG.md am Tag v<version> (gleiche Adresse wie die Dateien des Updates, siehe releasePruefen in zentral.js)
  // Basisadresse der Dateien am Tag v<version> (auch für kernNachholen); plugin.testUpdateBasis ersetzt sie
  const tagBasis = (version) => {
    const p = plugin();
    if (p.testUpdateBasis) return String(p.testUpdateBasis).replace(/\/?$/, "/");
    const roh = (ctx.zentral && ctx.zentral.RELEASE_ROH) || "https://raw.githubusercontent.com/studium-autopilot/ecoba/";
    return semver(version) ? roh + "v" + version + "/" : "";
  };
  const changelogUrl = (version) => { const b = tagBasis(version); return b ? b + "CHANGELOG.md" : ""; };
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
  // „Was ist neu“ (Hinweis „Aktualisiert auf …“, Tests): das Fenster „Neue Version“, mit angebot als Angebot, sonst nur die Liste
  const neuigkeitenZeigen = (o) => fensterZeigen({ stufe: o.angebot ? "angebot" : "neu", von: o.von, bis: o.bis, angebot: o.angebot || null });

  ctx.update = {
    // reine Logik (Node-Tests)
    klasseVon, pfadOk, neuName, deineName, kopienVon, listePruefen, teilen, ohneHaken, hatAufgaben, seiteHaken, fmMischen, modulMischen, jsonMischen,
    jsonMischenText, VORGABE_NEU, vorgabenAnwenden, lesezeichenOhne, lesezeichenNachziehen, lesezeichenAnwenden, LESEZEICHEN_NEU, planen, aktualisierenMit, heilenMit, ordnerAufraeumenMit, ALTE_ORDNER, AUFGERAEUMT, sha256, neuer, angebot, kanal, kanalSetzen, kanalSchalter, zaehlenAn, PERSOENLICH, ORDNER, LISTE, INSTALLIERT,
    markeLage, MARKE, MARKE_STILL, handInstalliertMit, istVon, passt, kopienAufraeumen,
    WEITERE, CLAUDE_FRUEHER, claudeNachholenMit,
    // Obsidian
    kernNachholen, io, anzeige, status, aktualisieren, suchen, markeNeu, installiertNeu, installiertAnlegen, heilen, ordnerAufraeumen, pluginNeuLaden, neuLaden, ergebnisZeigen, hinweis, hinweisNeu, SPAETER, L_REPARATUR,
    claudeNachholen, claudeBekannt, L_CLAUDE,
    // Neuigkeiten (reine Logik zuerst)
    changelogAbschnitte, abschnitteZwischen, markdownSicher, toastFaellig, toastEntscheiden, nachUpdate, pruefungFaellig,
    ergebnisSatz, ergebnisZeilen, frischPruefen, toastPruefen, toastWeg, neuigkeitenZeigen, fensterZeigen, L_GEPRUEFT, L_TOAST, L_GESEHEN, S_TOAST,
    listeReleaseUrl, LISTE_ASSET,
    get letzterBericht() { return zustand.bericht; },
    get fenster() { return zustand.fenster; }, // Griff des Fensters „Neue Version“ (m = Obsidians Modal) oder null
    get toast() { return neuigkeit.toast; },
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
      // Von Hand aktualisiert: Liste und Systemdateien können nach dem Start per Sync kommen (handInstalliertMit)
      else if (f && (f.path === LISTE || (zustand.handWartet && f.path.indexOf("System/") === 0))) bald();
    });
    // Merker des Mitzählens bis 0.7.0 (gerätelokal): einmal weg, seit 0.7.1 zählt nur der Abruf der Liste beim Update
    if (lokal(L_GEZAEHLT) != null) lokal(L_GEZAEHLT, null);
    // Neuigkeiten: 4 s nach dem Einlesen frisch prüfen, dann Hinweis, wenn fällig. Zurück in der App: nach 15 s (zentral.js holt
    // nach 5 s nach, wenn es lange her ist; danach ist die Prüfung frisch, also kein zweiter Abruf). Über 6 h im Hintergrund
    // zählt wie ein neuer App-Start (Hinweis darf wieder erscheinen; der Abstand von 12 h je Version gilt weiter).
    const startLauf = () => {
      neuigkeit.start = Date.now();
      frischPruefen().catch(() => false).then(() => {
        try { toastPruefen(); } catch (e) { console.error("update: Hinweis", e); }
      });
    };
    if (app.metadataCache.initialized || app.metadataCache.resolved) ctx.zeit(startLauf, 4000);
    else { const r = ctx.an(app.metadataCache, "resolved", () => { app.metadataCache.offref(r); ctx.zeit(startLauf, 4000); }); }
    // Zeigte die Dashboard-Zeile das Angebot, als der Hinweis fällig war: beim Wechsel auf eine andere Seite noch einmal prüfen
    const nachWechsel = ctx.entprellen(() => { if (neuigkeit.verdeckt) { try { toastPruefen(); } catch (e) { console.error("update: Hinweis", e); } } }, 800);
    for (const ev of ["active-leaf-change", "file-open"]) ctx.an(app.workspace, ev, () => { if (neuigkeit.verdeckt) nachWechsel(); });
    ctx.dom(document, "visibilitychange", () => {
      if (document.visibilityState === "hidden") { neuigkeit.versteckt = Date.now(); toastWeg(); return; }
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
      ausfuehren: async () => { await neuLaden(); },
    },
  };

  return { registrieren, aktionen: AKTIONEN };
};
