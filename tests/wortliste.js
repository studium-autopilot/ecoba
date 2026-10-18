// Wortliste (docs/design.md, „Sprache“): sammelt die Texte der App und sucht darin die verbotenen Varianten. Gelesen werden die
// Zeichenketten der Skripte (ohne Kommentare und ohne reguläre Ausdrücke), die Seiten (Dashboard, Studium/, Gerüste,
// Musterplan, Modulseiten) und der Abschnitt „Unveröffentlicht“ im Changelog. Benutzt von tests/wortliste.test.js.
"use strict";
const fs = require("node:fs");
const path = require("node:path");

const TRESOR = "Studium Autopilot";

// Je Eintrag der Wortliste: was wir sagen, was nicht (Muster, groß/klein genau) und warum. Gleiche Reihenfolge wie die Tabelle
// in docs/design.md.
const REGELN = [
  { name: "aktualisieren", sag: "Aktualisieren (Daten holen); Hier aktualisieren", warum: "ein Wort für dieselbe Handlung",
    nicht: /\bJetzt (?:aktualisieren|holen|laden|prüfen|abgleichen)\b|\bHier (?:holen|laden|prüfen)\b|\b(?:[Aa]us ILIAS|aus Alma|Neu) holen\b/ },
  { name: "neue-version", sag: "Neue Version installieren", warum: "„Aktualisieren“ heißt Daten holen",
    nicht: /Studium Autopilot aktualisieren|Vorlage aktualisieren/ },
  { name: "lehrveranstaltung", sag: "Lehrveranstaltung", warum: "„Veranstaltung“ nur für Events",
    nicht: /Stundenplan-Eintr|(?:^|[^\p{L}])[Vv]eranstaltung(?:en)? (?:aus dem|im|in deinem|in deinen) Stundenplan|\bKeine Veranstaltungen\b/u },
  { name: "ects", sag: "ECTS", warum: "so heißen sie in Alma und in der Prüfungsordnung",
    nicht: /\bCP\b|\bCredits?\b|Leistungspunkt/ },
  { name: "pruefung", sag: "Prüfung, Prüfungsphase", warum: "„Klausur“ ist nur eine Form der Prüfung",
    nicht: /Klausurtermin|Klausurphase|Prüfungstermin|Prüfungszeitraum/ },
  { name: "fachsemester", sag: "1. Fachsemester, eng 1. FS", warum: "eine Schreibweise",
    nicht: /\bFS \d/ },
  { name: "gesamtnote", sag: "Gesamtnote, Zielnote", warum: "dieselbe Zahl heißt überall gleich",
    nicht: /Notenschnitt|Wunsch-?(?:Noten)?[Ss]chnitt|Wunschnote|Durchschnittsnote/ },
  { name: "gruppe", sag: "Übungsgruppe, kurz Gruppe 4", warum: "keine Abkürzungen",
    nicht: /\bGr\.(?:\s?\d|\s*$)/ },
  { name: "verbinden", sag: "verbunden, neu verbinden (ILIAS, Alma)", warum: "„Anmeldung“ heißt: für eine Prüfung oder einen Kurs",
    nicht: /Anmeldung (?:prüfen|abgelehnt|klappt)|Melde mich\b/ },
  { name: "passwort", sag: "Passwort", warum: "ein Wort",
    nicht: /Kennwort/ },
  { name: "meine-notizen", sag: "## Meine Notizen", warum: "dein Text steht in jeder Notiz unter derselben Überschrift",
    nicht: /(?:^|\n)## Notizen[ \t]*(?:\n|$)/ },
  { name: "vorlesungsfrei", sag: "vorlesungsfrei, Weihnachtspause, Pfingstpause", warum: "so sagt es die Uni",
    nicht: /[Ff]erien/ },
  { name: "woche", sag: "Stundenplan (Seite), Woche (Raster)", warum: "ein Name je Ansicht",
    nicht: /Wochenplan|Wochenraster|Wochenansicht/ },
  { name: "uebersicht", sag: "Übersicht (Menü), Teil (Grundstudium …), Schwerpunktbereich", warum: "„Bereich“ nur für Schwerpunkte",
    nicht: /Bereiche-Menü|Bereichsmenü/ },
  { name: "deine-angaben", sag: "Deine Angaben, Ändern; Obsidian-Einstellungen", warum: "wie die Überschrift in der App",
    nicht: /Personalisieren|(?:^|[^\p{L}-])Einstellungen →/u },
  { name: "tresor", sag: "Tresor (einmal: „in Obsidian: Vault“)", warum: "deutsch wie der Rest",
    nicht: /\bVault\b/ },
  { name: "termin-folgt", sag: "Termin folgt", warum: "ein Satz für ein fehlendes Datum",
    nicht: /[Nn]och kein Termin/ },
  { name: "ohne-jargon", sag: "mit Unterlagen, ohne Unterlagen, handschriftliches A4-Blatt", warum: "ohne Fachjargon",
    nicht: /open book|closed book|Cheat-?Sheet/i },
  // Nur die Namen mit großem Anfangsbuchstaben: Kennungen und Klassen (elfenbein, eba-design-flieder, eba-klar) bleiben erlaubt
  { name: "design-ohne-namen", sag: "Design 1, Design 2, Design 3 (nur für Vorlesesoftware)", warum: "Designs haben keine Namen",
    nicht: /\b(?:Elfenbein|Flieder|Klar)\b/ },
];

// Stellen, an denen eine Variante bewusst steht: Datei (genau oder Muster), Regel, ein Stück des Texts, Grund
const AUSNAHMEN = [
  { datei: /^System\/Skripte\/(?:ilias-html|alma-konto-html|ilias-anmeldung)\.js$/, regel: null, stueck: "", grund: "liest die Seiten von ILIAS und Alma in deren Worten" },
  { datei: "System/Skripte/quellen.js", regel: "meine-notizen", stueck: "## Notizen", grund: "erkennt die Überschrift älterer Stundenplan-Notizen" },
  { datei: "System/Skripte/tabellen.js", regel: "pruefung", stueck: "Prüfungstermin", grund: "Spaltenname in Seiten, die du vor 0.4.6 geändert hast" },
  { datei: "Studium/Einstellungen & Hilfe.md", regel: "tresor", stueck: "Ordner als Vault öffnen", grund: "Obsidians eigener Knopf" },
  { datei: "Studium/Einstellungen & Hilfe.md", regel: "tresor", stueck: "in Obsidian: Vault", grund: "die eine Erklärung" },
  { datei: "Studium/Kontakte & Links.md", regel: "pruefung", stueck: "Prüfungstermine", grund: "Titel der Seiten der Uni" },
  { datei: /^Module\//, regel: "pruefung", stueck: "Prüfungstermine WS", grund: "Titel eines Dokuments der Uni" },
];

// ---------- Texte aus JavaScript ----------
// Zeichenketten mit Position (Kommentare und reguläre Ausdrücke übersprungen; Template-Literale: nur die Textteile)
function zeichenketten(code) {
  const aus = [];
  const n = code.length;
  let i = 0, zeile = 1, davor = "";
  const regexDavor = (t) => t === "" || /[(,=:[!&|?{};+\-*%<>~^]$/.test(t) || /\b(?:return|typeof|case|in|of|delete|void|throw|new|else|do|yield|await)$/.test(t);
  const stapel = [];
  const template = () => {
    let t = "";
    const z = zeile, von = i;
    while (i < n) {
      const c = code[i];
      if (c === "\\") { t += code[i + 1] || ""; if (code[i + 1] === "\n") zeile++; i += 2; continue; }
      if (c === "`") { aus.push({ text: t, zeile: z, von, bis: i }); i++; return false; }
      if (c === "$" && code[i + 1] === "{") { aus.push({ text: t, zeile: z, von, bis: i }); i += 2; return true; }
      if (c === "\n") zeile++;
      t += c; i++;
    }
    aus.push({ text: t, zeile: z, von, bis: i });
    return false;
  };
  while (i < n) {
    const c = code[i];
    if (c === "/" && code[i + 1] === "/") { while (i < n && code[i] !== "\n") i++; continue; }
    if (c === "/" && code[i + 1] === "*") { i += 2; while (i < n && !(code[i] === "*" && code[i + 1] === "/")) { if (code[i] === "\n") zeile++; i++; } i += 2; continue; }
    if (c === "\"" || c === "'") {
      const z = zeile, von = i + 1;
      let t = "";
      i++;
      while (i < n && code[i] !== c && code[i] !== "\n") {
        if (code[i] === "\\") { const x = code[i + 1]; t += x === "n" ? "\n" : x === "t" ? "\t" : x; i += 2; continue; }
        t += code[i]; i++;
      }
      aus.push({ text: t, zeile: z, von, bis: i });
      i++; davor = "x";
      continue;
    }
    if (c === "`") { i++; if (template()) stapel.push(0); davor = "x"; continue; }
    if (c === "{" && stapel.length) { stapel[stapel.length - 1]++; i++; davor = "{"; continue; }
    if (c === "}" && stapel.length) {
      if (stapel[stapel.length - 1] === 0) { stapel.pop(); i++; if (template()) stapel.push(0); davor = "x"; continue; }
      stapel[stapel.length - 1]--; i++; davor = "}"; continue;
    }
    if (c === "/" && regexDavor(davor)) {
      i++;
      let klasse = false;
      while (i < n && code[i] !== "\n") {
        if (code[i] === "\\") { i += 2; continue; }
        if (code[i] === "[") klasse = true;
        else if (code[i] === "]") klasse = false;
        else if (code[i] === "/" && !klasse) break;
        i++;
      }
      i++;
      while (/[a-z]/.test(code[i] || "")) i++;
      davor = "x";
      continue;
    }
    if (c === "\n") { zeile++; i++; continue; }
    if (/\s/.test(c)) { i++; continue; }
    if (/[\w$]/.test(c)) { let w = ""; while (i < n && /[\w$]/.test(code[i])) { w += code[i]; i++; } davor = w; continue; }
    davor = c; i++;
  }
  return aus;
}

// Code ohne Kommentare, Zeichenketten durch Leerzeichen ersetzt (Zeilen bleiben): für Bezeichner wie „Notice“
function nurCode(code) {
  const teile = zeichenketten(code);
  const z = code.split("");
  for (const t of teile) for (let k = t.von; k < t.bis; k++) if (z[k] !== "\n") z[k] = " ";
  return z.join("")
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (m, a) => a + " ".repeat(m.length - a.length));
}

// Aufrufe hinweis(…): die Zeichenketten des ersten Arguments und der Text des Arguments
function hinweisAufrufe(code) {
  const texte = zeichenketten(code);
  const ohne = nurCode(code);
  const aus = [];
  const re = /\bhinweis\s*\(/g;
  let m;
  while ((m = re.exec(ohne))) {
    let i = m.index + m[0].length, tiefe = 0;
    const von = i;
    for (; i < ohne.length; i++) {
      const c = ohne[i];
      if (c === "(" || c === "[" || c === "{") tiefe++;
      else if (c === ")" || c === "]" || c === "}") { if (tiefe === 0) break; tiefe--; }
      else if (c === "," && tiefe === 0) break;
    }
    const zeile = code.slice(0, m.index).split("\n").length;
    aus.push({ zeile, ausdruck: code.slice(von, i), texte: texte.filter((t) => t.von >= von && t.bis <= i).map((t) => t.text) });
  }
  return aus;
}

// ---------- Quellen ----------
const lesen = (p) => fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const mdIn = (ordner) => {
  const aus = [];
  if (!fs.existsSync(ordner)) return aus;
  for (const e of fs.readdirSync(ordner, { withFileTypes: true })) {
    const p = path.join(ordner, e.name);
    if (e.isDirectory()) aus.push(...mdIn(p));
    else if (e.name.endsWith(".md")) aus.push(p);
  }
  return aus;
};

// → [{ datei (relativ zum Tresor bzw. „CHANGELOG.md“), art: "skript" | "seite" | "changelog", code?, texte: [{ text, zeile }] }]
function quellen(wurzel) {
  const tresor = path.join(wurzel, TRESOR);
  const rel = (p) => path.relative(tresor, p).split(path.sep).join("/");
  const aus = [];
  const skripte = path.join(tresor, "System", "Skripte");
  for (const n of fs.readdirSync(skripte).filter((x) => x.endsWith(".js")).sort()) {
    const code = lesen(path.join(skripte, n));
    aus.push({ datei: "System/Skripte/" + n, art: "skript", code, texte: zeichenketten(code) });
  }
  const kern = path.join(tresor, ".obsidian", "plugins", "studium-autopilot", "main.js");
  if (fs.existsSync(kern)) { const code = lesen(kern); aus.push({ datei: ".obsidian/plugins/studium-autopilot/main.js", art: "kern", code, texte: zeichenketten(code) }); }
  const seiten = [path.join(tresor, "Dashboard.md"), path.join(tresor, "System", "Daten", "Musterplan.md")]
    .concat(mdIn(path.join(tresor, "Studium")), mdIn(path.join(tresor, "System", "Gerüste")), mdIn(path.join(tresor, "Module")));
  for (const p of seiten.filter((x) => fs.existsSync(x))) {
    aus.push({ datei: rel(p), art: "seite", texte: lesen(p).split("\n").map((text, k) => ({ text, zeile: k + 1 })) });
  }
  const log = path.join(wurzel, "CHANGELOG.md");
  if (fs.existsSync(log)) {
    const zeilen = lesen(log).split("\n");
    const a = zeilen.indexOf("## Unveröffentlicht");
    const texte = [];
    if (a >= 0) for (let k = a + 1; k < zeilen.length && !zeilen[k].startsWith("## "); k++) texte.push({ text: zeilen[k], zeile: k + 1 });
    aus.push({ datei: "CHANGELOG.md", art: "changelog", texte });
  }
  return aus;
}

const ausnahme = (datei, regel, text) => AUSNAHMEN.some((a) =>
  (typeof a.datei === "string" ? a.datei === datei : a.datei.test(datei)) && (!a.regel || a.regel === regel) && text.includes(a.stueck));

// → [{ datei, zeile, regel, treffer, text }] ohne Ausnahmen
function funde(wurzel, quellenListe) {
  const aus = [];
  for (const q of quellenListe || quellen(wurzel)) {
    for (const t of q.texte) {
      for (const r of REGELN) {
        const m = r.nicht.exec(t.text);
        if (!m || ausnahme(q.datei, r.name, t.text)) continue;
        aus.push({ datei: q.datei, zeile: t.zeile, regel: r.name, treffer: m[0].trim(), text: t.text.trim().slice(0, 140) });
      }
    }
  }
  return aus;
}

// Hinweise: kein Vorsatz, kein Pfad, eine Zeile, kein Fehlertext aus dem Code
const VORSATZ = /^\s*(?:Studium Autopilot|ILIAS|Alma|Zentrale Daten|Karteikarten|Volltext|Update)\s*[:–-]\s/;
const PFAD = /\b[\w-]+\.(?:md|json|js|css|txt)\b|\bSystem\/|\.trash\b/;
function hinweisFehler(aufruf) {
  const f = [];
  if (/\.message\b/.test(aufruf.ausdruck)) f.push("Fehlertext aus dem Code (e.message)");
  if (aufruf.texte[0] !== undefined && VORSATZ.test(aufruf.texte[0])) f.push("Vorsatz");
  for (const t of aufruf.texte) {
    if (PFAD.test(t)) f.push("Dateipfad „" + PFAD.exec(t)[0] + "“");
    if (t.includes("\n")) f.push("mehrere Zeilen");
  }
  return f;
}

module.exports = { REGELN, AUSNAHMEN, zeichenketten, nurCode, hinweisAufrufe, hinweisFehler, quellen, funde, TRESOR };
