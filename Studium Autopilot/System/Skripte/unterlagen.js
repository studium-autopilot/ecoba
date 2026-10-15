// Unterlagen im Vault: Dateien aus „Eingang/“ einordnen.
// Benennt Dateien nach dem Schema „<Code> <Art> <Nr> <Titel>.<ext>“, legt sie unter „Unterlagen/<Code> <Modultitel>/“ ab
// und schreibt daneben je Unterlage eine Begleitnotiz (typ: unterlage) mit gleichem Namen.
// Ablauf: Moduswahl → Plan → Duplikate? → Vorschau (korrigierbar) → ZIP? → Ablegen.
// Dateien in „Unterlagen/“ ohne Begleitnotiz (abgebrochener Lauf) bietet es zum Nachtragen an.
// Aufruf in einer Aktion:  await ctx.user.unterlagen(ctx).einordnen();  (Aktion „einordnen“ in System/Skripte/aktionen.js)
// Nur Obsidian-API (vault, fileManager, loadPdfJs), keine Node- oder Shell-Befehle: läuft auf Windows, iPad und iPhone.
module.exports = function (ctx) {
  const eba = ctx.user.eba(ctx);
  const app = eba.app;
  const { TFile, TFolder, Notice, Platform } = ctx.obsidian;
  const J = eba.J;

  // ---------- Einstellungen ----------
  const EINGANG = "Eingang";
  const ZIEL = "Unterlagen";
  const OHNE = "Ohne Modul";
  const HUB = "Studium/Unterlagen";
  const LESEN_MAX_MB_PC = 80, LESEN_MAX_MB_MOBIL = 40; // größere PDFs nicht öffnen (Arbeitsspeicher auf iPhone/iPad)
  const LESEN_MAX_MB = Platform.isMobile ? LESEN_MAX_MB_MOBIL : LESEN_MAX_MB_PC;
  const GROSS_MB = 50;           // ab dieser Größe in der Zusammenfassung warnen
  const EINBETTEN_MAX_MB = 10;   // größere PDFs in der Begleitnotiz nur verlinken (Notiz lädt schneller)
  const NAME_MAX = 80;           // Zeichen im Dateinamen ohne Endung (Windows-Pfadlänge)
  const ORDNER_TITEL_MAX = 45;   // Zeichen Modultitel im Ordnernamen
  const KOPF_BYTES = 65536;      // Duplikate: gleiche Größe und gleiche erste 64 KB
  const VORSCHAU_VIELE = 40;     // ab so vielen Dateien Unsichere zuerst zeigen
  const ORIGINALE = ["pptx", "ppt", "pptm", "key", "odp", "docx", "doc", "odt", "xlsx", "xls", "ods"];
  const BILDER = ["jpg", "jpeg", "png", "webp", "gif", "bmp", "avif", "heic", "heif"];
  const ARCHIVE = ["zip", "rar", "7z"];
  const AUSLASSEN = ["md", "base", "canvas", ...ARCHIVE];
  const ARTEN = ["Folien", "Skript", "Übung", "Lösung", "Eigene Lösung", "Mitschrift", "Altklausur", "Literatur", "Scan", "Sonstiges"];

  // Reihenfolge zählt: spezifische Begriffe zuerst („Klausur Lösung“ → Altklausur, „Skript zur Vorlesung“ → Skript).
  // „(^|[^a-zäöüß])“ statt \b, weil „_“ in Dateinamen wie „Kurs_VL03“ sonst als Buchstabe zählt. Kein Lookbehind (ältere iOS-Versionen).
  const W = "(^|[^a-zäöüß])";
  const E = "([^a-zäöüß]|$)";
  const REGELN = [
    // „Klausur“ nur als ganze Klausur („Klausur_WS2324“, „Probeklausur“, „Klausuraufgaben“), nicht „Klausurinfos“ oder „Klausurvorbereitung“
    ["Altklausur", new RegExp(`klausur(en)?(?![a-zäöüß])|klausur(aufgaben?|fragen?|sammlung|l(ö|oe)sung(en)?)|${W}exams?${E}|midterm`, "i")],
    ["Eigene Lösung", new RegExp(`(meine|eigene)[\\s._-]*l(ö|oe)sung|${W}my[\\s._-]*solution|mitschrift[\\s._-]*(zu[\\s._-]*)?(blatt|(ü|ue)bung)`, "i")],
    ["Lösung", new RegExp(`l(ö|oe)sung|solution|musterl|${W}lsg${E}`, "i")],
    ["Übung", new RegExp(`(ü|ue)bung|exercise|aufgaben|hausaufgabe|${W}ha[\\s._-]?\\d|${W}(ü|ue)[\\s._-]?\\d|${W}blatt([^a-zäöüß]|$)|sheet|tutori|problem.?set|${W}ps\\s?\\d`, "i")],
    // „skript“ nur am Wortanfang oder nach Fugen-s („Vorlesungsskript“), nicht in „Deskriptive“
    ["Skript", new RegExp(`${W}([a-zäöüß]*s)?skript|${W}script|${W}reader${E}|lecture.?notes|vorlesungsunterlagen`, "i")],
    ["Mitschrift", new RegExp(`mitschrift|annotiert|annotated|handschrift|${W}notizen${E}`, "i")],
    ["Folien", new RegExp(`folie|slide|vorlesung|lecture|${W}vl([^a-z]|$)|kapitel|chapter|${W}kap([^a-z]|$)|session|${W}sitzung(en)?${E}|einheit|lektion|${W}(week|woche)${E}|pr(ä|ae)sentation|handout`, "i")],
    ["Literatur", new RegExp(`paper|artikel|article|journal|aufsatz|literatur|reading|${W}book([^a-z]|$)|${W}buch([^a-zäöüß]|$)`, "i")],
    ["Scan", /scan|gescannt/i],
  ];
  const SCAN_ANFANG = /^scan(ned|s)?([^a-z]|$)/i; // „Scan …“ ist immer ein Scan (auch „Scan Buchkapitel“)
  const NR_WORTE = "vl|vorlesung|lecture|folien?|slides?|handout|kapitel|chapter|kap|session|sitzung|einheit|lektion|week|woche|(?:ü|ue)bung(?:sblatt)?|pr(?:ä|ae)senz(?:ü|ue)bung(?:sblatt)?|aufgabenblatt|aufgaben|hausaufgaben?|ha|ü|ue|blatt|sheet|exercise|tutoriums?blatt|tutorium|tutorial|problem[\\s._-]?sets?|l(?:ö|oe)sung(?:en)?|solutions?|ps|nr|no";
  // Nummer nach einem Art-Wort; ein Bereich „VL5-6“ / „Kap 1 bis 3“ gehört mit zum Treffer (Ende in Gruppe 2)
  const NUMMER = new RegExp(`(?:^|[^a-zäöüß])(?:${NR_WORTE})\\.?[\\s._\\-]*(\\d{1,2})(?!\\d)(?:(?:\\s?[-–]\\s?|[\\s._]+bis[\\s._]+)(\\d{1,2})(?!\\d))?`, "i");
  const NUMMER_ANFANG = /^(\d{1,2})(?!\d)(?:\s?[-–]\s?(\d{1,2})(?!\d))?[\s._\-]/;
  // Datumsangaben („12.10.2026“, „12.10.“, „2026-10-12“) zählen nicht als Nummer
  const DATUM_ISO = /(^|\D)((?:19|20)\d{2})[-_.](\d{1,2})[-_.](\d{1,2})(?!\d)/g;
  const DATUM_DE = /(^|[^\d.])(\d{1,2})\.(\d{1,2})\.(\d{4}(?!\d)|\d{2}(?!\d))?/g;
  const GENERISCH = /^((scanned document|gescanntes dokument|neues dokument|new document|dokument|document|scan|unbenannt|untitled|bild|foto|photo|screenshot|bildschirmfoto)( \d{1,3})?|(img|image|dsc|dscn|pxl)[ -]?\d[\d -]*)$/i;
  const SEMESTER = /^(ws|ss|wise|sose|wintersemester|sommersemester)\s?-?\d{2,4}([\/-]\d{2,4})?$/i;
  const KUERZEL = /^[A-ZÄÖÜ]{2,5}$/; // „JA VL 1“: Kurskürzel vor dem Art-Wort fällt weg
  const FUELL = /^(zu|zur|zum|vom|von|the|of|for|and|und|der|die|das|am|im|on|in|an|to|für|fuer)$/i;
  const CODE = new RegExp("^(" + eba.MODULCODE + ")(?=[\\s_\\-.]|$)"); // Modulcode am Anfang des Dateinamens (Muster: eba.js)

  // Wörter, die bei einer Art nicht in den Titel gehören
  const WF = "folien?|slides?|vorlesung(en)?|lecture|vl|handout|kapitel|chapter|kap\\.?|week|woche|session|sitzung(en)?|einheit|lektion|pr(ä|ae)sentation";
  const WU = "(ü|ue)bung(en|sblatt|sbl(ä|ae)tter)?|pr(ä|ae)senz(ü|ue)bung(en|sblatt)?|aufgabenbl(a|ä|ae)tt(er)?|aufgaben|hausaufgaben?|ha|ü|ue|blatt|sheet|exercises?|tutoriumsbl(a|ä|ae)tt(er)?|tutorium|tutorial|problem sets?|ps";
  const WL = "(muster)?l(ö|oe)sung(en)?|solutions?|lsg";
  const ARTWORTE = {
    Folien: WF,
    Skript: "lecture notes|([a-zäöüß]*s)?skript(um|e|en)?|script|reader|vorlesungsunterlagen",
    Übung: WU,
    Lösung: `${WL}|${WU}`,
    "Eigene Lösung": `(meine|eigene) (${WL})|my solutions?|mitschrift|${WL}|${WU}`,
    Mitschrift: `mitschrift|annotiert|annotated|handschrift|notizen|${WF}`,
    Altklausur: "(alt)?klausur(en)?|exams?", // „Probeklausur“ bleibt wie „Musterklausur“ im Titel
    Scan: "scanned document|gescanntes dokument|scan(s|ned)?|gescannt",
  };

  const pad = (n) => String(n).padStart(2, "0");
  const mb = (bytes) => (bytes / 1048576).toFixed(1).replace(".", ",") + " MB";
  // Windows-taugliche, linkfeste Namen: keine \ / : * ? " < > | # ^ [ ], kein Punkt/Leerzeichen am Ende, NFC
  const sauber = (s) => eba.sauber(String(s).normalize("NFC")).replace(/[.\s-]+$/, "").replace(/^[.\s-]+/, "");
  const ext = (f) => f.extension.toLowerCase();
  // ganze Wörter entfernen (Grenze wie W, Ziffern zählen mit zum Wort)
  const wortWeg = (s, muster) => (muster ? s.replace(new RegExp(`(^|[^a-zäöüß0-9])(?:${muster})(?=[^a-zäöüß0-9]|$)`, "gi"), "$1 ") : s);
  const kuerzen = (s, max) => {
    if (s.length <= max) return s;
    const t = s.slice(0, max + 1), i = t.lastIndexOf(" ");
    return (i > max / 2 ? t.slice(0, i) : s.slice(0, max)).trim();
  };
  const fuellWeg = (s) => {
    const w = s.split(" ").filter(Boolean);
    while (w.length && FUELL.test(w[0])) w.shift();
    while (w.length && FUELL.test(w[w.length - 1])) w.pop();
    return w.join(" ");
  };

  // ---------- Dateien im Eingang ----------
  const alleIn = (pfad) => {
    const o = app.vault.getAbstractFileByPath(pfad);
    const out = [];
    const lauf = (ordner) => {
      for (const k of ordner.children) {
        if (k instanceof TFolder) lauf(k);
        else if (k instanceof TFile && !k.name.startsWith(".")) out.push(k);
      }
    };
    if (o instanceof TFolder) lauf(o);
    return out;
  };
  const alleImEingang = () => alleIn(EINGANG);

  // PDF + PPTX mit gleichem Namen gehören zusammen
  const stapeln = (dateien) => {
    const m = new Map();
    for (const f of dateien) {
      const key = `${f.parent?.path ?? ""}/${f.basename.normalize("NFC").toLowerCase()}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(f);
    }
    return [...m.values()].map((fs) => {
      const pdf = fs.find((f) => ext(f) === "pdf");
      const bild = fs.find((f) => BILDER.includes(ext(f)));
      const haupt = pdf || bild || fs[0];
      return { dateien: fs, haupt, original: fs.find((f) => f !== haupt && ORIGINALE.includes(ext(f))) || null };
    }).sort((a, b) => a.haupt.path.localeCompare(b.haupt.path, "de", { numeric: true }));
  };

  // ---------- Erkennen: Art, Nummer, Titel, Code ----------
  const relPfad = (f) => f.path.slice(EINGANG.length + 1).normalize("NFC");
  // Art zuerst aus dem Dateinamen, Unterordner (der tiefste zuerst) nur als Rückfall:
  // „Vorlesung und Übung …/VL01“ → Folien. Ausnahmen: „Lösungen/Blatt_05“ → Lösung,
  // „Altklausuren/Lösung 2023“ → Altklausur (Lösungen zu Klausuren heißen „Altklausur … Lösung“).
  const artAusPfad = (rel, endung, basis) => {
    if (SCAN_ANFANG.test(basis)) return "Scan";
    const regel = (s) => (REGELN.find(([, re]) => re.test(s)) || [null])[0];
    const name = regel(basis);
    const ordner = rel.split("/").slice(0, -1).reverse().map(regel).find(Boolean) || null;
    if (name === "Übung" && ["Lösung", "Eigene Lösung"].includes(ordner)) return ordner;
    if (name === "Lösung" && ordner === "Altklausur") return ordner;
    if (name) return name;
    if (ordner) return ordner;
    if (BILDER.includes(endung)) return "Scan";
    return "Sonstiges";
  };
  const artErkennen = (st) => artAusPfad(relPfad(st.haupt).replace(/\.[^.]+$/, ""), ext(st.haupt), st.haupt.basename.normalize("NFC"));
  // gültige Datumsangaben durch „§“ gleicher Länge ersetzen (Positionen bleiben gleich)
  const datumOk = (mo, t) => +mo >= 1 && +mo <= 12 && +t >= 1 && +t <= 31;
  const ohneDatum = (s) => s
    .replace(DATUM_ISO, (m, vor, j, mo, t) => (datumOk(mo, t) ? vor + "§".repeat(m.length - vor.length) : m))
    .replace(DATUM_DE, (m, vor, t, mo) => (datumOk(mo, t) ? vor + "§".repeat(m.length - vor.length) : m));
  // Nummer (und Ende eines Bereichs „VL3-4“) aus einem Namen; Datumsangaben zählen nicht
  const nummerErkennen = (basis) => {
    const s = basis.normalize("NFC"), o = ohneDatum(s);
    const m = o.match(NUMMER) || o.match(NUMMER_ANFANG);
    if (!m) return { nr: null, bis: null, treffer: "", idx: -1 };
    const nr = Number(m[1]);
    return { nr, bis: m[2] != null && Number(m[2]) > nr ? Number(m[2]) : null, treffer: s.substr(m.index, m[0].length), idx: m.index };
  };
  const codeAusName = (basis) => { const m = basis.normalize("NFC").match(CODE); return m ? m[1] : null; };
  const titelErkennen = (basis, code, treffer, art, idx = -1) => {
    let s = basis.normalize("NFC").replace(/_/g, " ");
    // Nummer-Treffer herausnehmen; ein Kurskürzel oder Semester direkt davor („JA VL 1“, „WS2627_VL1“) fällt mit weg
    const tr = (treffer || "").replace(/_/g, " ");
    const i = !tr ? -1 : idx >= 0 && s.substr(idx, tr.length) === tr ? idx : s.indexOf(tr);
    if (i >= 0) {
      let vor = s.slice(0, i).trim();
      if (code && vor.startsWith(code)) vor = vor.slice(code.length).trim();
      if (KUERZEL.test(vor) || SEMESTER.test(vor)) vor = "";
      s = `${vor} ${s.slice(i + tr.length)}`;
    }
    s = s.replace(/\s+/g, " ").trim();
    if (code && s.startsWith(code)) s = s.slice(code.length);
    // Versionszusätze: „(1)“, „_v2“, „_final“, „Kopie“, „copy“
    s = s.replace(/\((\d{1,2}|neu|new|kopie|copy)\)/gi, " ");
    s = wortWeg(s, "v\\d{1,2}|final|kopie( von)?|copy( of)?");
    const rein = (x) => x.replace(/^[\s\-–.:,;+&]+|[\s\-–.:,;+&]+$/g, "").replace(/\s+/g, " ").trim();
    if (GENERISCH.test(rein(s))) return "";
    // Art-Wörter und Füllwörter entfernen
    s = wortWeg(s, ARTWORTE[art] || "");
    s = s.replace(/(^|\s)(von|of|\/)\s?\d{1,3}(?=\s|$)/gi, " "); // „Folie 3 von 12“
    s = rein(fuellWeg(rein(s)));
    // wie jeder Fremdtext bereinigt: kein „<%“ (Templater), keine Link- und Tag-Zeichen in Überschrift und Eigenschaft
    return GENERISCH.test(s) ? "" : sauber(s);
  };
  const zielName = (code, art, nr, titel) => {
    const kopf = [code, art, nr != null ? pad(nr) : ""].filter(Boolean).join(" ");
    const datumArt = ["Scan", "Sonstiges", "Mitschrift", "Eigene Lösung"].includes(art) && nr == null;
    const t = titel || (datumArt ? eba.heute : "");
    let name = sauber([kopf, t].filter(Boolean).join(" "));
    if (name.length > NAME_MAX) name = sauber(kuerzen(name, NAME_MAX));
    return name || sauber(`${code || "Unterlage"} ${eba.heute}`);
  };
  // Vorschlag für eine Datei aus Pfad und Name (auch für Tests ohne Datei)
  const vorschlag = (rel, endung, code) => {
    const pfad = rel.normalize("NFC").replace(/\.[^.]+$/, "");
    const ordner = pfad.split("/");
    const basis = ordner.pop();
    const eigenerCode = codeAusName(basis);
    let art = artAusPfad(pfad, endung, basis);
    let { nr, bis, treffer, idx } = nummerErkennen(basis);
    const ausName = nr != null;
    // ohne Nummer im Namen: Nummer aus dem Unterordner („Woche 3/slides.pdf“, „03_Kostenrechnung/Folien.pdf“), der tiefste zuerst
    if (!ausName) for (const o of ordner.reverse()) { const n = nummerErkennen(o); if (n.nr != null) { nr = n.nr; bis = n.bis; break; } }
    // nummerierte Dateien ohne erkannte Art („01_Einfuehrung“) sind meist Folien
    if (art === "Sonstiges" && ausName && !BILDER.includes(endung)) art = "Folien";
    let titel = titelErkennen(basis, eigenerCode || code, treffer, art, idx);
    if (ausName && /^\d$/.test(titel)) titel = ""; // Anhängsel einer Kopie („VL03 2.pdf“ auf iOS) ist kein Titel
    if (bis != null) titel = sauber(`bis ${pad(bis)} ${titel}`); // Bereich „VL3-4“ → „Folien 03 bis 04“
    return { art, nr, titel, eigenerCode, name: zielName(code, art, nr, titel) };
  };

  // ---------- PDF lesen (Seitenzahl, optional Text mit Seitenlinks) ----------
  // LaTeX-PDFs liefern Akzente als eigenes Zeichen: „f¨ ur“, „Universit¨ at“, „¨ Okonometrie“, „L¨ osung“, seltener „fu¨r“,
  // vor Großbuchstaben auch „¨“ allein auf einer Zeile. Das Zeichen wird mit dem passenden Buchstaben verbunden
  // (mit Leerzeichen/Zeilenumbruch danach: der folgende, sonst der vorige, sonst der folgende), dann NFC.
  // Ohne passenden Buchstaben (z. B. „¨“ allein, „ˆ β“, „geht´s“) bleibt alles, wie es ist.
  const AKZENTE = { // Zeichen: [kombinierendes Zeichen (Unicode), passende Buchstaben]
    "¨": [0x308, "aeiouAEIOU"], "´": [0x301, "aeiouyAEIOUY"], "`": [0x300, "aeiouAEIOU"],
    "ˆ": [0x302, "aeiouAEIOU"], "˜": [0x303, "anoANO"], "ˇ": [0x30c, "cdenrstzCDENRSTZ"],
  };
  const akzenteReparieren = (text) => {
    if (!/[¨´`ˆ˜ˇ]/.test(text)) return text.normalize("NFC");
    const z = [...text], out = [];
    for (let i = 0; i < z.length; i++) {
      const a = AKZENTE[z[i]] && [String.fromCharCode(AKZENTE[z[i]][0]), AKZENTE[z[i]][1]];
      if (!a || z[i - 1] === z[i] || z[i + 1] === z[i]) { out.push(z[i]); continue; } // „``“ sind Anführungszeichen
      const passt = (c) => !!c && c.length === 1 && a[1].includes(c);
      let j = i + 1;
      if (z[j] === " ") j++;
      if (z[j] === "\n" && (i === 0 || z[i - 1] === "\n")) j++; // „¨“ allein auf einer Zeile (höher gesetzt als „U“)
      const luecke = j > i + 1, nach = z[j], vor = out.length ? out[out.length - 1] : "";
      if (luecke && passt(nach)) { out.push(nach + a[0]); i = j; }
      else if (passt(vor) && z[i - 1] === vor) out[out.length - 1] = vor + a[0];
      else if (!luecke && passt(nach)) { out.push(nach + a[0]); i = j; }
      else out.push(z[i]);
    }
    return out.join("").normalize("NFC");
  };
  // Nur die Seitenzahl wird ausgelesen (kein Volltext).
  const pdfLesen = async (f) => {
    if (f.stat.size > LESEN_MAX_MB * 1048576) return { seiten: null, zuGross: true };
    let doc = null;
    try {
      const pdfjs = await ctx.obsidian.loadPdfJs();
      doc = await pdfjs.getDocument({ data: new Uint8Array(await app.vault.readBinary(f)) }).promise;
      return { seiten: doc.numPages };
    } catch (e) {
      console.warn("Unterlagen: PDF nicht lesbar", f.path, e);
      return { seiten: null };
    } finally {
      try { await doc?.destroy(); } catch (e) {}
    }
  };

  // Fremdtext so entschärfen, dass er in einer eingeklappten Karte steht, nichts auslöst und trotzdem suchbar bleibt:
  // keine Templater-Befehle (<%), kein HTML, keine Tags, Links, Aufgaben, Formeln, Kommentare, Codeblöcke.
  // „x > 0“ und „f(x) = [a, b]“ bleiben wörtlich stehen.
  const entschaerfen = (text) => text.replace(/\r/g, "")
    .replace(/(\p{Ll})-\n(\p{Ll})/gu, "$1$2")
    .replace(/\\/g, "\\\\")
    .replace(/<(?=[\p{L}\/!%?])/gu, "&lt;")        // HTML, Kommentare, Templater „<%“
    .replace(/[`$]/g, "\\$&")                        // Code, Formeln
    .replace(/%%/g, "\\%\\%")                        // Kommentare
    .replace(/\[\[/g, "\\[\\[").replace(/\]\(/g, "]\\(") // Wiki- und Markdown-Links
    .replace(/#(?=[\p{L}_]|\d+[\p{L}_\/-])/gu, "\\#") // Tags
    .split("\n").map((z) => z.trim()).filter(Boolean)
    .map((z) => "> " + z.replace(/^>/, "\\>").replace(/^(#+\s)/, "\\$1").replace(/^(\d+)\. /, "$1\\. ")
      .replace(/^([-+*]) /, "\\$1 ").replace(/\s\^([\w-]+)$/, " \\^$1"))
    .join("\n");

  // ---------- Begleitnotiz ----------
  const originalZeile = (f) => `> **Original:** [[${f.name}]] (am PC öffnet es die passende App; auf iPad und iPhone über die Dateien-App)`;
  // Knopf „Öffnen ↗“: Datei außerhalb von Obsidian öffnen (iPad/iPhone Dateien-App mit Markieren, PC Standardprogramm),
  // Aktion „oeffnen“ (System/Skripte/aktionen.js). Ohne Notizname: die Notiz, in der der Knopf steht (übersteht Umbenennen).
  // Kein Vault-Name, kein Notizname im Link: der Knopf wirkt auf die Notiz, in der er steht.
  const oeffnenUrl = (notizName, original = false) => `obsidian://studium-autopilot?aktion=oeffnen${original ? "&original=1" : ""}`;
  // Knopf „Größe ⇅“: PDF-Ansicht klein ↔ groß (Aktion „pdf“ in System/Skripte/aktionen.js, eba-core.css Abschnitt 29)
  const groesseUrl = (notizName) => "obsidian://studium-autopilot?aktion=pdf";
  const oeffnenZeile = (notizName, original) =>
    `> [Öffnen ↗](${oeffnenUrl(notizName)})${original ? ` · [Original öffnen ↗](${oeffnenUrl(notizName, true)})` : ""} · [Größe ⇅](${groesseUrl(notizName)})`;
  // Ansicht der Hauptdatei: eingebettet, verlinkt oder mit Hinweis
  const ansichtText = (h, zuGross) => {
    const e = ext(h);
    let ansicht;
    if (e === "pdf" && h.stat.size >= EINBETTEN_MAX_MB * 1048576) ansicht = `**PDF öffnen:** [[${h.name}]] (${mb(h.stat.size)}, zu groß zum Einbetten)`;
    else if (e === "pdf") ansicht = `> [!eba-pdf]- PDF\n> ![[${h.name}#height=560]]`; // eingeklappt, Tipp auf „PDF“ öffnet
    else if (["heic", "heif"].includes(e)) ansicht = `[[${h.name}]]\n\n> [!eba-achtung] HEIC zeigt Obsidian nicht an\n> Beim nächsten Mal als PDF oder JPG sichern, zum Beispiel über „Dokumente scannen“ in der Dateien-App.`;
    else if (BILDER.includes(e)) ansicht = `![[${h.name}]]`;
    else ansicht = `[[${h.name}]]\n\n> [!eba-info] Nur als ${e.toUpperCase()} vorhanden\n> Obsidian zeigt diesen Dateityp nicht an. Am PC als PDF exportieren und mit gleichem Namen in \`Eingang\` legen, dann erscheint die PDF hier.`;
    if (zuGross) ansicht += `\n\n> [!eba-info] Zu groß zum Auslesen\n> Die Datei hat ${mb(h.stat.size)}, auf diesem Gerät werden PDFs bis ${LESEN_MAX_MB} MB ausgelesen (PC ${LESEN_MAX_MB_PC} MB, iPhone/iPad ${LESEN_MAX_MB_MOBIL} MB). Sie ist vollständig eingeordnet, nur Seitenzahl und Text fehlen in dieser Notiz.`;
    return ansicht;
  };
  const notizInhalt = (u) => {
    const h = u.haupt;
    const titelZeile = [u.code, [u.art, u.nr != null ? pad(u.nr) : ""].filter(Boolean).join(" "), u.titel].filter(Boolean).join(" · ");
    const eck = [`**Modul:** ${u.modul ? `[[${u.modul.f.basename}|${u.code}]]` : "–"}`, `**Art:** ${u.art}`,
      u.seiten ? `**Seiten:** ${u.seiten}` : "", `**Semester:** ${u.semester}`].filter(Boolean).join(" · ");
    const orig = u.original ? `\n${originalZeile(u.original)}` : "";
    const weitere = u.weitere.length ? `\n> **Weitere Dateien:** ${u.weitere.map((f) => `[[${f.name}]]`).join(", ")}` : "";
    const ansicht = ansichtText(h, u.zuGross);
    return [
      "---",
      "typ: unterlage",
      `code: ${J(u.code)}`,
      `modul: ${J(u.modul ? `[[${u.modul.f.basename}]]` : "")}`,
      `art: ${J(u.art)}`,
      `nummer: ${u.nr ?? ""}`,
      `titel: ${J(u.titel)}`,
      `datei: ${J(`[[${h.name}]]`)}`,
      `original: ${J(u.original ? `[[${u.original.name}]]` : "")}`,
      `format: ${J(u.dateien.map((f) => ext(f)).join(", "))}`,
      `seiten: ${u.seiten ?? ""}`,
      `semester: ${J(u.semester)}`,
      "status: neu",
      `datum: ${eba.heute}`,
      'quelle: ""',
      'uebersicht: "[[Unterlagen]]"',
      // iPhone-Ansicht (eba-core.css Abschnitt 37, Seitenklasse begleitnotiz): kompakter Kopf, PDF auf dem ersten Bildschirm
      "cssclasses:",
      "  - eba-s-begleitnotiz",
      "tags:",
      "  - unterlage",
      "---",
      "",
      `# ${titelZeile}`,
      "",
      `> [!eba-regel] Eckdaten`,
      `> ${eck}${orig}${weitere}`,
      oeffnenZeile(h.basename, u.original),
      "",
      // Reihenfolge: „Das Wichtigste“ und „Offene Fragen“ vor der Datei, PDF-Kasten eingeklappt darunter
      "## Das Wichtigste",
      "- ",
      "",
      "## Offene Fragen",
      "- [ ] ",
      "",
      ansicht,
      "",
    ].join("\n");
  };

  // PDF zu einer schon eingeordneten PPTX (gleicher Name, Begleitnotiz zeigt noch auf die PPTX, keine PDF daneben):
  // Die PDF kommt mit gleichem Namen dazu, die vorhandene Notiz wird wie bei einem Paar ergänzt (eigene Einträge bleiben).
  const nurOriginal = (ordner, name) => {
    const notiz = app.vault.getAbstractFileByPath(`${ordner}/${name}.md`);
    if (!(notiz instanceof TFile) || app.vault.getAbstractFileByPath(`${ordner}/${name}.pdf`)) return null;
    const original = ORIGINALE.map((e) => app.vault.getAbstractFileByPath(`${ordner}/${name}.${e}`)).find((f) => f instanceof TFile);
    const datei = String(app.metadataCache.getFileCache(notiz)?.frontmatter?.datei ?? "");
    return original && datei === `[[${original.name}]]` ? { notiz, original } : null;
  };
  const pdfAllein = (st) => st.dateien.length === 1 && ext(st.haupt) === "pdf";
  const notizErgaenzen = async ({ notiz, original }, pdf, seiten, zuGross) => {
    await app.fileManager.processFrontMatter(notiz, (fm) => {
      fm.datei = `[[${pdf.name}]]`;
      fm.original = `[[${original.name}]]`;
      fm.format = `pdf, ${ext(original)}`;
      if (seiten) fm.seiten = seiten;
    });
    const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const hinweis = new RegExp(`\\[\\[${esc(original.name)}\\]\\]\\n\\n> \\[!eba-info\\] Nur als [^\\n]*\\n> [^\\n]*`);
    const ansicht = ansichtText(pdf, zuGross);
    await app.vault.process(notiz, (text) => {
      const nachFragen = text.indexOf("\n## ", text.indexOf("\n## Offene Fragen") + 1);
      let t = hinweis.test(text) ? text.replace(hinweis, () => ansicht)
        : text.includes("\n## Offene Fragen") ? (nachFragen > 0 ? `${text.slice(0, nachFragen)}\n${ansicht}\n${text.slice(nachFragen)}` : `${text.replace(/\n*$/, "")}\n\n${ansicht}\n`)
        : /\n## /.test(text) ? text.replace(/\n## /, () => `\n${ansicht}\n\n## `) : `${text.replace(/\n*$/, "")}\n\n${ansicht}\n`;
      if (seiten && !t.includes("**Seiten:**")) t = t.replace(/^(> \*\*Modul:\*\*[^\n]*?)( · \*\*Semester:\*\*)/m, (m, a, b) => `${a} · **Seiten:** ${seiten}${b}`);
      if (!t.includes("**Original:**")) t = t.replace(/^> \*\*Modul:\*\*[^\n]*$/m, (m) => `${m}\n${originalZeile(original)}`);
      const knopf = oeffnenZeile(notiz.basename, original);
      t = /^> \[Öffnen ↗\]\(.*$/m.test(t) ? t.replace(/^> \[Öffnen ↗\]\(.*$/m, () => knopf) : t.replace(/^> \*\*Original:\*\*[^\n]*$/m, (m) => `${m}\n${knopf}`);
      return t;
    });
  };

  // Übungsblatt-Notiz gleicher Nummer verknüpfen (nur wenn das Feld dort noch leer ist):
  // Übung → „datei“, Eigene Lösung → „eigene_loesung“
  const blattVerknuepfen = async (code, nr, datei, feld) => {
    if (!code || nr == null) return false;
    const blatt = app.vault.getMarkdownFiles().find((f) => {
      const fm = app.metadataCache.getFileCache(f)?.frontmatter;
      return fm?.typ === "übungsblatt" && fm.code === code && Number(fm.nummer) === nr;
    });
    if (!blatt) return false;
    let gesetzt = false;
    await app.fileManager.processFrontMatter(blatt, (fm) => { if (!fm[feld]) { fm[feld] = `[[${datei.name}]]`; gesetzt = true; } });
    return gesetzt;
  };
  const uebungsblattVerknuepfen = (code, nr, datei) => blattVerknuepfen(code, nr, datei, "datei");

  // freier Name im Ordner; „vergeben“ enthält Namen, die im selben Lauf schon verplant sind
  const freierName = (ordner, basis, exts, vergeben = null) => {
    let name = basis, i = 2;
    const belegt = (n) => vergeben?.has(`${ordner}/${n}`.toLowerCase()) || [...exts, "md"].some((e) => app.vault.getAbstractFileByPath(`${ordner}/${n}.${e}`));
    while (belegt(name)) name = `${basis} ${i++}`;
    return name;
  };

  const leereOrdnerAufraeumen = async () => {
    const wurzel = app.vault.getAbstractFileByPath(EINGANG);
    if (!(wurzel instanceof TFolder)) return;
    const lauf = async (o) => {
      for (const k of [...o.children]) if (k instanceof TFolder) await lauf(k);
      if (o !== wurzel && o.children.length === 0) { try { await app.fileManager.trashFile(o); } catch (e) {} }
    };
    await lauf(wurzel);
  };

  const frage = async (texte, werte, platzhalter) => await ctx.system.suggester(texte, werte, false, platzhalter);

  // Modulauswahl ohne die Vorwahl aus dem Notiztitel (eba.modulWaehlen würde bei „B110 Einordnen“ immer B110 nehmen)
  const modulFragen = async (frageText) => {
    const fs = eba.aktuellesSemester().fs;
    const wichtig = (x) => x.fm.fachsemester === fs || ["läuft", "angemeldet"].includes(x.fm.status) || x.fm.gewaehlt === true;
    const ms = eba.alleModule().sort((a, b) => (wichtig(b) - wichtig(a)) || String(a.fm.code).localeCompare(String(b.fm.code)));
    return await frage(ms.map((x) => `${wichtig(x) ? "● " : "   "}${x.fm.code} · ${x.fm.titel}`), ms, frageText);
  };

  // Ordner je Modul: „Unterlagen/<Code> <Modultitel>“ (Titel an einer Wortgrenze auf 45 Zeichen gekürzt).
  // Bestehende Ordner „<Code> …“ werden weiterbenutzt, ein älterer Ordner nur mit dem Code wird umbenannt.
  const modulOrdnerPlan = (modul, code) => {
    if (!code) return { pfad: `${ZIEL}/${OHNE}`, alt: null };
    const titel = fuellWeg(sauber(kuerzen(sauber(modul?.fm.titel ?? ""), ORDNER_TITEL_MAX)).replace(/[,;:]+$/, ""));
    const name = sauber(`${code} ${titel}`) || code;
    const wurzel = app.vault.getAbstractFileByPath(ZIEL);
    const da = wurzel instanceof TFolder ? wurzel.children.find((k) => k instanceof TFolder && (k.name === code || k.name.startsWith(code + " "))) : null;
    if (da && da.name === code && name !== code) return { pfad: `${ZIEL}/${name}`, alt: da };
    return { pfad: da ? da.path : `${ZIEL}/${name}`, alt: null };
  };
  const modulOrdner = async (modul, code) => {
    const p = modulOrdnerPlan(modul, code);
    if (p.alt && app.vault.getAbstractFileByPath(p.alt.path) === p.alt) await app.fileManager.renameFile(p.alt, p.pfad);
    return p.pfad;
  };

  // ---------- Duplikate: gleiche Größe und gleiche erste 64 KB ----------
  const koepfe = new Map();
  const kopf = (f) => {
    if (!koepfe.has(f.path)) koepfe.set(f.path, app.vault.readBinary(f).then((b) => new Uint8Array(b.slice(0, KOPF_BYTES))));
    return koepfe.get(f.path);
  };
  const gleich = async (a, b) => {
    if (a.stat.size !== b.stat.size || ext(a) !== ext(b)) return false;
    const [x, y] = await Promise.all([kopf(a), kopf(b)]);
    if (x.length !== y.length) return false;
    for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
    return true;
  };
  const VERSION = /\(\d{1,2}\)|[\s_-](v\d{1,2}|final|kopie|copy)([\s_.-]|$)/i;
  const duplikateFinden = async (plan) => {
    // saubere Namen zuerst behalten: „VL03 (1)“ ist das Duplikat, nicht „VL03“
    const reihe = plan.filter((p) => !p.nachtrag).sort((a, b) =>
      (VERSION.test(a.st.haupt.basename) - VERSION.test(b.st.haupt.basename)) || a.st.haupt.basename.length - b.st.haupt.basename.length);
    const behalten = [];
    for (const p of reihe) {
      const h = p.st.haupt;
      const ordner = app.vault.getAbstractFileByPath(p.vergleich);
      // auch in Unterordnern („Vorlesung“, „Übung“) des Modulordners suchen
      const imZiel = ordner instanceof TFolder ? alleIn(ordner.path).filter((k) => k instanceof TFile && ext(k) !== "md" && k.stat.size === h.stat.size) : [];
      const kandidaten = [...imZiel, ...behalten.filter((q) => q.st.haupt.stat.size === h.stat.size).map((q) => q.st.haupt)];
      p.dup = null;
      for (const k of kandidaten) if (await gleich(h, k)) { p.dup = k.name; break; }
      if (!p.dup) behalten.push(p);
    }
    koepfe.clear();
    return plan.filter((p) => p.dup);
  };

  // ---------- Dateien in „Unterlagen/*/“ ohne Begleitnotiz ----------
  const ohneBegleitnotiz = () => {
    const wurzel = app.vault.getAbstractFileByPath(ZIEL);
    if (!(wurzel instanceof TFolder)) return [];
    const dateien = wurzel.children.filter((k) => k instanceof TFolder).flatMap((o) => alleIn(o.path))
      .filter((f) => !AUSLASSEN.includes(ext(f)) && !app.vault.getAbstractFileByPath(`${f.parent.path}/${f.basename}.md`));
    return stapeln(dateien); // PPTX neben gleichnamiger PDF bilden ein Paar (eine Notiz)
  };
  // Nummer im Schema ist immer zweistellig („03“); ein Anhängsel „ 2“ (freierName, Kopie auf iOS) ist keine Nummer
  const SCHEMA = new RegExp(`^(\\S+) (${ARTEN.join("|")})(?: (\\d{2})(?= |$))?(?: (.+))?$`);
  const nachtragPlan = (st) => {
    const h = st.haupt, basis = h.basename.normalize("NFC");
    const ordnerName = h.parent?.path.split("/")[1] ?? "";
    const code = codeAusName(ordnerName) || codeAusName(basis) || "";
    const modul = code ? eba.modulNachCode(code) : null;
    const m = basis.match(SCHEMA);
    let art, nr, titel;
    if (m && (m[1] === code || !code)) { art = m[2]; nr = m[3] ? Number(m[3]) : null; titel = sauber(m[4] ?? ""); }
    else { const v = vorschlag(h.name, ext(h), code); art = v.art; nr = v.nr; titel = v.titel; }
    return { st, modul, code, art, nr, titel, ordner: h.parent.path, name: h.basename, nachtrag: true };
  };

  // ---------- Vorschau ----------
  const neuerName = (p) => `${p.name}.${ext(p.st.haupt)}${p.st.dateien.length > 1 ? ` (+${p.st.dateien.filter((f) => f !== p.st.haupt).map(ext).join(", ")})` : ""}`;
  // Zielnamen mit Kollisionen im selben Lauf vergeben
  const namenVergeben = (plan) => {
    const vergeben = new Set();
    for (const p of [...plan.filter((q) => !q.dup), ...plan.filter((q) => q.dup)]) { // Duplikate bekommen die Nummer
      if (p.auslassen || p.weg || p.nachtrag) continue;
      p.wunsch = zielName(p.code, p.art, p.nr, p.titel);
      // PDF zu einer schon eingeordneten PPTX gleichen Namens: gleicher Name, die Notiz wird ergänzt
      p.paar = !p.dup && pdfAllein(p.st) && !vergeben.has(`${p.ordner}/${p.wunsch}`.toLowerCase()) && !!nurOriginal(p.ordner, p.wunsch);
      p.name = p.paar ? p.wunsch : freierName(p.ordner, p.wunsch, p.st.dateien.map(ext), vergeben);
      vergeben.add(`${p.ordner}/${p.name}`.toLowerCase());
    }
  };
  const unsicher = (p) => p.dup || p.art === "Sonstiges" || (["Folien", "Übung", "Lösung"].includes(p.art) && p.nr == null && !p.titel);
  const korrigieren = async (p) => {
    const h = p.st.haupt;
    const reihe = [p.art, ...ARTEN.filter((a) => a !== p.art), p.auslassen ? "einordnen" : "auslassen"];
    const texte = reihe.map((a, k) => (k === 0 ? `● ${a}` : a === "auslassen" ? "✗ im Eingang lassen" : a === "einordnen" ? "↩ doch einordnen" : `   ${a}`));
    const art = await frage(texte, reihe, `${h.name}: Art?`);
    if (!art) return;
    if (art === "auslassen") { p.auslassen = true; return; }
    p.auslassen = false;
    if (art !== "einordnen") p.art = art;
    const vor = [p.nr != null ? pad(p.nr) : "", p.titel].filter(Boolean).join(" ");
    const ein = await ctx.system.prompt(`${h.name}: Nummer und Titel, z. B. „03 Optimierung“`, vor);
    if (ein === null || ein === undefined) return;
    const m = String(ein).trim().match(/^(\d{1,2})(?!\d)(?:\s+|$)(.*)$/);
    p.nr = m ? Number(m[1]) : null;
    p.titel = sauber(m ? m[2] : ein);
  };
  // true = übernehmen, false = abgebrochen
  const vorschau = async (plan) => {
    for (;;) {
      namenVergeben(plan);
      const liste = plan.filter((p) => !p.weg);
      const n = liste.filter((p) => !p.auslassen).length;
      const reihe = liste.length > VORSCHAU_VIELE ? [...liste.filter(unsicher), ...liste.filter((p) => !unsicher(p))] : liste;
      const texte = [`✓ Alle ${n} so übernehmen`], werte = ["ok"];
      for (const p of reihe) {
        const alt = p.st.haupt.name;
        if (p.auslassen) texte.push(`✗ ${alt} bleibt im Eingang`);
        else texte.push(`✎ ${unsicher(p) ? "? " : ""}${alt} → ${neuerName(p)}${p.dup ? " (Duplikat)" : ""}${p.paar ? " (zur PowerPoint)" : ""}`);
        werte.push(p);
      }
      const w = await frage(texte, werte, `Vorschau: zum Ändern antippen${liste.length > VORSCHAU_VIELE ? " (? = unsicher)" : ""} · Esc = abbrechen`);
      if (w === null || w === undefined) return false;
      if (w === "ok") return true;
      await korrigieren(w);
    }
  };

  // ---------- Hauptfunktion ----------
  const einordnen = async () => {
    if (!app.vault.getAbstractFileByPath(EINGANG)) await app.vault.createFolder(EINGANG);
    const abbruch = () => { new Notice("Abgebrochen. Es wurde nichts verändert.", 4000); return { eingeordnet: 0 }; };
    const roh = alleImEingang();
    const archive = roh.filter((f) => ARCHIVE.includes(ext(f)));
    const ausgelassen = roh.filter((f) => AUSLASSEN.includes(ext(f)) && !ARCHIVE.includes(ext(f)));
    const stapel = stapeln(roh.filter((f) => !AUSLASSEN.includes(ext(f))));
    const fehlend = ohneBegleitnotiz();

    // 0. Abgebrochener Lauf? Dateien ohne Begleitnotiz nachtragen
    let nachtragen = [];
    if (fehlend.length) {
      const t = `${fehlend.length} Datei(en) in „${ZIEL}“ ohne Notiz: ${fehlend.slice(0, 3).map((s) => s.haupt.name).join(", ")}${fehlend.length > 3 ? " …" : ""}`;
      const w = await frage(stapel.length ? ["Begleitnotizen nachtragen, dann Eingang einordnen", "Nur den Eingang einordnen"] : ["Begleitnotizen nachtragen", "Jetzt nicht"], ["ja", "nein"], t);
      if (!w) return abbruch();
      if (w === "ja") nachtragen = fehlend.map(nachtragPlan);
    }
    if (!stapel.length && !nachtragen.length) {
      // nur ZIP im Eingang: nicht wegwerfen (noch nicht entpackt), Obsidian kann nicht entpacken
      const zip = archive.length ? `ZIP im Eingang: ${archive.slice(0, 3).map((f) => f.name).join(", ")}${archive.length > 3 ? " …" : ""}. Bitte erst entpacken (PC oder Dateien-App), dann erneut einordnen.` : "";
      new Notice([fehlend.length ? "Nichts eingeordnet." : ausgelassen.length
        ? `Im Eingang liegen nur Notizen (${ausgelassen.length}). Bitte selbst verschieben.`
        : zip ? "" : "Der Eingang ist leer. Lege PDFs oder Folien in den Ordner „Eingang“.", zip].filter(Boolean).join("\n"), zip ? 12000 : 8000);
      return { eingeordnet: 0 };
    }

    // 1. Wie einordnen?
    const n = stapel.length;
    let modus = null, blockModul = null;
    const vorwahl = eba.codeAusTitel() ? eba.modulNachCode(eba.codeAusTitel()) : null;
    if (n) {
      const mitCode = stapel.filter((s) => { const c = codeAusName(s.haupt.basename); return c && eba.modulNachCode(c); }).length;
      const modi = [], modiWerte = [];
      if (vorwahl) { modi.push(`Alle ${n} zu ${vorwahl.fm.code} · ${vorwahl.fm.titel}`); modiWerte.push("vorwahl"); }
      modi.push(`Alle ${n} zu einem Modul`); modiWerte.push("block");
      if (mitCode) { modi.push(`Modul aus dem Dateinamen (${mitCode} von ${n} erkannt)`); modiWerte.push("code"); }
      modi.push("Jede Datei einzeln (Modul, Art, Titel)"); modiWerte.push("einzeln");
      modus = await frage(modi, modiWerte, `${n} Unterlage(n) im Eingang. Wie einordnen?`);
      if (!modus) return abbruch();
      if (modus === "vorwahl") blockModul = vorwahl;
      if (modus === "block") {
        blockModul = await modulFragen("Zu welchem Modul gehören alle Dateien? ● = aktuelles Semester");
        if (!blockModul) return abbruch();
      }
    }

    // 2. Plan: Modul, Art, Nummer, Titel, Zielordner je Datei (noch ohne Änderungen im Vault)
    const bericht = { eingeordnet: 0, uebersprungen: 0, gross: [], duplikate: [], fremd: [], blaetter: 0, ohneSeiten: 0, zuGross: [], nachgetragen: 0, zipPapierkorb: 0, loesungen: 0, ergaenzt: 0 };
    const plan = [];
    for (const st of stapel) {
      const h = st.haupt;
      let modul = blockModul;
      const eigenerCode = codeAusName(h.basename);
      if (modus === "code") modul = (eigenerCode && eba.modulNachCode(eigenerCode)) || null;
      if (modus === "einzeln" || (modus === "code" && !modul)) {
        modul = await modulFragen(`${h.name}: Modul? (Esc = Datei im Eingang lassen)`);
        if (!modul) { bericht.uebersprungen++; continue; }
      }
      const code = modul?.fm.code ?? "";
      const v = vorschlag(relPfad(h), ext(h), code);
      const mo = modulOrdnerPlan(modul, code);
      const p = { st, modul, code, art: v.art, nr: v.nr, titel: v.titel, ordner: mo.pfad, vergleich: mo.alt?.path ?? mo.pfad, eigenerCode };
      if (modus === "einzeln") await korrigieren(p);
      plan.push(p);
    }

    // 4. Duplikate (im Zielordner und im Stapel): einmal fragen
    let dupsWeg = false;
    const dups = await duplikateFinden(plan);
    if (dups.length) {
      const w = await frage([`${dups.length} doppelte in den Papierkorb`, "Trotzdem einordnen"], ["weg", "behalten"],
        `${dups.length} Datei(en) gibt es schon (gleicher Inhalt): ${dups.slice(0, 3).map((p) => `${p.st.haupt.name} = ${p.dup}`).join(", ")}${dups.length > 3 ? " …" : ""}`);
      if (!w) return abbruch();
      dupsWeg = w === "weg";
      for (const p of dups) p.weg = dupsWeg;
    }

    // 5. Vorschau: alles auf einen Blick, einzelne Einträge korrigierbar, Esc ändert nichts
    if (plan.some((p) => !p.weg) && !(await vorschau(plan))) return abbruch();

    // 6. ZIP im Eingang: einmal fragen (Esc = liegen lassen), nur wenn daneben Dateien aus dem Eingang eingeordnet werden
    let zipWeg = false;
    const zipFrage = archive.length > 0 && plan.some((p) => !p.auslassen);
    if (zipFrage) {
      const w = await frage(["In den Papierkorb (schon entpackt)", "Liegen lassen"], ["weg", "bleibt"],
        `${archive.length} ZIP-Datei(en) im Eingang: ${archive.slice(0, 3).map((f) => f.name).join(", ")}. Schon entpackt?`);
      zipWeg = w === "weg";
    }

    const semester = eba.aktuellesSemester().name;
    const arbeit = [...nachtragen, ...plan.filter((p) => !p.auslassen && !p.dup), ...plan.filter((p) => !p.auslassen && p.dup)];
    const hinweis = new Notice(`Ordne ${arbeit.length} Unterlage(n) ein …`, 0);
    let erste = null;

    // 7. Jede Unterlage verarbeiten
    try {
      for (const [i, p] of arbeit.entries()) {
        const st = p.st, h = st.haupt;
        hinweis.setMessage(`Unterlagen einordnen: ${i + 1} von ${arbeit.length}\n${h.name}`);
        if (p.dup) bericht.duplikate.push(`${h.name} = ${p.dup}`);
        if (p.weg) { for (const f of st.dateien) await app.vault.trash(f, false); continue; }
        if (p.eigenerCode && p.code && p.eigenerCode !== p.code && eba.modulNachCode(p.eigenerCode)) bericht.fremd.push(h.name);
        let ordner = p.ordner, name = p.name, paar = null;
        if (!p.nachtrag) {
          ordner = await modulOrdner(p.modul, p.code);
          if (!app.vault.getAbstractFileByPath(ordner)) await app.vault.createFolder(ordner);
          // Modulordner mit Unterordnern „Vorlesung“/„Übung“ (z. B. B110): Datei nach Art dorthin, sonst in den Modulordner
          const unter = { Folien: "Vorlesung", Skript: "Vorlesung", Mitschrift: "Vorlesung", Übung: "Übung", Lösung: "Übung", "Eigene Lösung": "Übung" }[p.art];
          if (unter && app.vault.getAbstractFileByPath(`${ordner}/${unter}`) instanceof TFolder) ordner = `${ordner}/${unter}`;
          const wunsch = zielName(p.code, p.art, p.nr, p.titel);
          paar = !p.dup && pdfAllein(st) ? nurOriginal(ordner, wunsch) : null; // PDF zur schon eingeordneten PPTX
          name = paar ? wunsch : freierName(ordner, wunsch, st.dateien.map(ext));
          // Dateien verschieben (Links zieht Obsidian selbst nach)
          for (const f of st.dateien) await app.fileManager.renameFile(f, `${ordner}/${name}.${ext(f)}`);
        }
        for (const f of st.dateien) if (f.stat.size > GROSS_MB * 1048576) bericht.gross.push(`${f.name} (${mb(f.stat.size)})`);
        let seiten = null, zuGross = false;
        if (ext(h) === "pdf") {
          const r = await pdfLesen(h);
          seiten = r.seiten; zuGross = !!r.zuGross;
          if (zuGross) bericht.zuGross.push(`${h.name} (${mb(h.stat.size)})`);
          else if (!seiten) bericht.ohneSeiten++;
        }
        const u = {
          code: p.code, modul: p.modul, art: p.art, nr: p.nr, titel: p.titel, semester, seiten, zuGross, haupt: h, original: st.original,
          dateien: st.dateien, weitere: st.dateien.filter((f) => f !== h && f !== st.original),
        };
        let notiz;
        if (paar) { await notizErgaenzen(paar, h, seiten, zuGross); notiz = paar.notiz; bericht.ergaenzt++; }
        else notiz = await app.vault.create(`${ordner}/${name}.md`, notizInhalt(u));
        erste = erste || notiz;
        if (p.art === "Übung" && (await blattVerknuepfen(p.code, p.nr, h, "datei"))) bericht.blaetter++;
        if (p.art === "Eigene Lösung" && (await blattVerknuepfen(p.code, p.nr, h, "eigene_loesung"))) bericht.loesungen++;
        if (p.nachtrag) bericht.nachgetragen++; else bericht.eingeordnet++;
      }
      if (zipWeg) for (const f of archive) { await app.vault.trash(f, false); bericht.zipPapierkorb++; }
    } finally {
      hinweis.hide();
    }
    await leereOrdnerAufraeumen();

    // 8. Zusammenfassung
    const zeilen = bericht.eingeordnet || !bericht.nachgetragen ? [`${bericht.eingeordnet} Unterlage(n) eingeordnet.`] : [];
    if (bericht.ergaenzt) zeilen.push(`${bericht.ergaenzt} PDF(s) zur vorhandenen PowerPoint abgelegt, Begleitnotiz ergänzt.`);
    if (bericht.nachgetragen) zeilen.push(`${bericht.nachgetragen} Begleitnotiz(en) nachgetragen.`);
    if (bericht.uebersprungen) zeilen.push(`${bericht.uebersprungen} im Eingang gelassen.`);
    const auslassenN = plan.filter((p) => p.auslassen).length;
    if (auslassenN) zeilen.push(`${auslassenN} nach der Vorschau im Eingang gelassen.`);
    if (bericht.duplikate.length) zeilen.push(`${bericht.duplikate.length} Duplikat(e) ${dupsWeg ? "im Obsidian-Papierkorb" : "trotzdem eingeordnet"}: ${bericht.duplikate.join(", ")}`);
    if (bericht.zipPapierkorb) zeilen.push(`${bericht.zipPapierkorb} ZIP-Datei(en) im Obsidian-Papierkorb.`);
    else if (archive.length) zeilen.push(`${archive.length} ZIP-Datei(en) im Eingang gelassen.${zipFrage ? "" : " Obsidian kann sie nicht entpacken (am PC oder in der Dateien-App entpacken)."}`);
    if (ausgelassen.length) zeilen.push(`${ausgelassen.length} Datei(en) im Eingang nicht angefasst (Notizen).`);
    if (bericht.blaetter) zeilen.push(`${bericht.blaetter} Übungsblatt-Notiz(en) mit der PDF verknüpft.`);
    if (bericht.loesungen) zeilen.push(`${bericht.loesungen} eigene Lösung(en) mit dem Übungsblatt verknüpft.`);
    if (bericht.fremd.length) zeilen.push(`Achtung, Name nannte ein anderes Modul: ${bericht.fremd.join(", ")}`);
    if (bericht.gross.length) zeilen.push(`Große Dateien: ${bericht.gross.join(", ")}`);
    if (bericht.zuGross.length) zeilen.push(`Zu groß zum Auslesen, eingeordnet ohne Seitenzahl/Text: ${bericht.zuGross.join(", ")}`);
    if (bericht.ohneSeiten) zeilen.push(`${bericht.ohneSeiten} PDF(s) konnten nicht gelesen werden (Seitenzahl fehlt).`);
    new Notice(zeilen.join("\n"), 12000);
    return { ...bericht, erste };
  };

  return { einordnen, artErkennen, nummerErkennen, titelErkennen, zielName, codeAusName, entschaerfen, akzenteReparieren, vorschlag, ohneBegleitnotiz, EINGANG, ZIEL, HUB };
};
