// Unterlagen im Vault: Dateien aus „Eingang/“ einordnen.
// Benennt Dateien nach dem Schema „<Code> <Art> <Nr> <Titel>.<ext>“, legt sie unter „Unterlagen/<Code> <Modultitel>/“ ab
// und schreibt daneben je Unterlage eine Begleitnotiz (typ: unterlage) mit gleichem Namen.
// Ablauf: Moduswahl → Plan → Duplikate? → Vorschau (korrigierbar) → ZIP? → Ablegen.
// Dateien in „Unterlagen/“ ohne Begleitnotiz (abgebrochener Lauf, selbst hineinkopiert) trägt es ohne Rückfrage nach.
// Aufruf in einer Aktion:  await ctx.user.unterlagen(ctx).hinzufuegen();  (Aktion „einordnen“ in System/Skripte/aktionen.js):
// erst das Fenster „Unterlagen hinzufügen“ (Dateien auswählen oder hineinziehen), dann einordnen().
// Nur Obsidian-API (vault, fileManager, loadPdfJs), keine Node- oder Shell-Befehle: läuft auf Windows, iPad und iPhone.
module.exports = function (ctx) {
  const eba = ctx.user.eba(ctx);
  const app = eba.app;
  const { TFile, TFolder, Platform, Modal } = ctx.obsidian;
  const J = eba.J;
  // Ein Papierkorb für alles (quellen.js): Obsidians Einstellung „Gelöschte Dateien“, nie endgültig
  const wegwerfen = (f) => (ctx.user.quellen && ctx.user.quellen.papierkorb ? ctx.user.quellen.papierkorb(app, f) : app.vault.trash(f, false));

  // ---------- Einstellungen ----------
  const EINGANG = "Eingang";
  const ZIEL = "Unterlagen";
  const OHNE = "Ohne Modul";
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
  const LESEFORMATE = ["", "pdf", "epub", "djvu", "doc", "docx", "odt", "rtf", "txt", "htm", "html"];
  const AUSLASSEN = ["md", "base", "canvas", ...ARCHIVE];
  const ARTEN = ["Folien", "Skript", "Übung", "Tutorium", "Lab", "Lösung", "Eigene Lösung", "Mitschrift", "Altklausur", "Literatur", "Scan", "Sonstiges"];
  // Tutorium ist ein eigener Bereich (seit 20.10.2026): Nennt der Dateiname oder ein Ordner das Tutorium („Tutoriumsunterlagen“,
  // „Tutoriengruppen/Gruppe 4“, „JA_Tutorium10“), ist alles darin Tutorium, auch Blätter, Lösungen und Folien. Nicht „Tutorin“
  // (Chatbot) und nicht „Tutorial“ (Anleitung).
  const TUTORIUM = /tutori(um|en)/i;
  // Lab ist ebenso ein eigener Bereich (seit 24.10.2026): Sitzungen, in denen Code vorgeführt wird („Data Science Lab“,
  // „R Lab 1/Lab1.Rmd“, „Python Labs“, „RLab2.R“). Ein Name oder Ordner nennt ein Lab mit Sprache oder Kurs davor („R Lab“,
  // „DataScienceLab_03“), mit Nummer („Lab 3“, „Lab02“) oder als erstes Wort („Labs“, „05 - Labs“, „Lab Orga“), dann nicht im Sinn von
  // Laborexperimenten („Lab Experiments“, „Lab vs. Field“, „Lab-in-the-field“). „Experimente im Lab“, „Evidence from the Lab“,
  // „Matlab“, „Syllabus“, „Label“ und „Labor“ zählen nicht. Was darin liegt, ist Lab (Notebooks, Daten, Lösungen; laborArt).
  const LAB_NAME = new RegExp(`(^|[^a-zäöüß])(r|python|stata|julia|spss|coding|data[\\s._-]?science)[\\s._-]?labs?(?![a-zäöüß])|(^|[^a-zäöüß])labs?[\\s._-]*\\d{1,2}(?!\\d)`, "i");
  const LAB_ANFANG = /^(\d{1,2}[\s._\-–)]*)?labs?(?![a-zäöüß])(?![\s._,-]*([&+]|(experiment|studie|stud(y|ies)|evidence|setting|participant|subject|meets|(19|20)\d{2})|(exp|vs(?![\s._-]*code)|versus|and|und|or|oder|field|feld|in[\s._-]+the)(?![a-zäöüß])))/i;
  const labArtig = (s) => {
    const i = s.indexOf(": "), t = i >= 0 && SITZUNGSORDNER.test(s) ? s.slice(i + 2) : s; // ILIAS-Sitzung „…, 14:15 - 15:45: Lab“
    return LAB_NAME.test(t) || LAB_ANFANG.test(t);
  };
  // Ordner einer Gruppe („Gruppe 4: Dienstag 10 - 12“, „Tutorium 5 | … | Mittwoch 14-16“): Die Zahl darin ist keine Blattnummer
  const GRUPPENORDNER = /(^|[^a-zäöüß])(gruppe|group)[\s._-]*\d|montag|dienstag|mittwoch|donnerstag|freitag/i;

  // Reihenfolge zählt: spezifische Begriffe zuerst („Formelsammlung zur Klausur“ → Sonstiges, „Skript zur Vorlesung“ → Skript).
  // „(^|[^a-zäöüß])“ statt \b, weil „_“ in Dateinamen wie „Kurs_VL03“ sonst als Buchstabe zählt. Kein Lookbehind (ältere iOS-Versionen).
  const W = "(^|[^a-zäöüß])";
  const E = "([^a-zäöüß]|$)";
  const REGELN = [
    // Dokumenttypen, die keine Lernunterlage im engeren Sinn sind, gewinnen gegen jedes Art-Wort („FAQ zur Klausur“, „Vorlage Übungsblatt“)
    ["Sonstiges", new RegExp(`formelsammlung|formelbl(a|ä|ae)tt|${W}faq${E}|${W}(vorlagen?|templates?)${E}|merkblatt|leitfaden|syllabus|modulbeschreibung|cheat.?sheet|(infos?|informationen|hinweise)[\\s._-]*(zur|zu|zum|for|about)?[\\s._-]*(klausur|pr(ü|ue)fung|exam)`, "i")],
    // „Klausur“ nur als ganze Klausur („Klausur_WS2324“, „Probeklausur“, „Klausuraufgaben“), nicht „Klausurinfos“ oder „Klausurvorbereitung“.
    // Lösungen zu Klausuren sind Lösungen („Klausurlösung“, „Klausur Lösung“; Umschalten in artBestimmen), „Klausur mit Lösungen“ bleibt Altklausur.
    ["Altklausur", new RegExp(`klausur(en)?(?![a-zäöüß])|klausur(aufgaben?|fragen?|sammlung)|${W}exams?${E}|midterm`, "i")],
    ["Eigene Lösung", new RegExp(`(meine|eigene)[\\s._-]*l(ö|oe)sung|${W}my[\\s._-]*solution|mitschrift[\\s._-]*(zu[\\s._-]*)?(blatt|(ü|ue)bung)`, "i")],
    ["Lösung", new RegExp(`l(ö|oe)sung|solution|musterl|${W}lsg${E}`, "i")],
    ["Übung", new RegExp(`(ü|ue)bung|exercise|aufgaben|hausaufgabe|${W}ha[\\s._-]?\\d|${W}(ü|ue)[\\s._-]?\\d|${W}blatt([^a-zäöüß]|$)|sheet|problem.?set|${W}ps\\s?\\d`, "i")],
    // „skript“ nur am Wortanfang oder nach Fugen-s („Vorlesungsskript“), nicht in „Deskriptive“
    ["Skript", new RegExp(`${W}([a-zäöüß]*s)?skript|${W}script|${W}reader${E}|lecture.?notes|vorlesungsunterlagen`, "i")],
    ["Mitschrift", new RegExp(`mitschrift|annotiert|annotated|handschrift|${W}notizen${E}`, "i")],
    ["Folien", new RegExp(`folie|slide|vorlesung|lecture|${W}vl([^a-z]|$)|kapitel|chapter|${W}kap([^a-z]|$)|session|${W}sitzung(en)?${E}|einheit|lektion|${W}(week|woche)${E}|pr(ä|ae)sentation|handout`, "i")],
    // Zusatzmaterial ist Lesestoff („Übungsmaterialien/Zusatzmaterial/Quantile.pdf“), ebenso Autor-Jahr-Namen (siehe AUTOR_JAHR)
    ["Literatur", new RegExp(`paper|artikel|article|journal|aufsatz|literatur|reading|${W}book([^a-z]|$)|${W}buch([^a-zäöüß]|$)|zusatzmaterial|weiterf(ü|ue)hrend|lekt(ü|ue)re|${W}et[\\s._]?al${E}`, "i")],
    // schwacher Hinweis (drittes Feld): nur wenn sonst nichts passt („Organisatorisches.pdf“, aber „VL0 Organisatorisches“ → Folien),
    // eine Nummer im Namen macht daraus Folien wie bei Namen ohne Art („01_Organisatorisches“)
    ["Sonstiges", new RegExp(`organisatori|${W}orga${E}|${W}infos?${E}|informationen|ank(ü|ue)ndigung`, "i"), true],
    ["Scan", /scan|gescannt/i],
  ];
  // „DimpflSoenksen2022“, „MuellerSchmidt_2019“: zwei bis fünf zusammengeschriebene Namen und ein Jahr (Groß-/Kleinschreibung zählt)
  const AUTOR_JAHR = /^(?:[A-ZÄÖÜ][a-zäöüß]+){2,5}[_-]?(?:19|20)\d{2}[a-z]?$/;
  // „…_KL“ (Klausurlösung) am Ende, nur groß geschrieben („BAMatheWS1819A_KL“)
  const KL_ENDE = /(^|[\s._-])KL([\s._-]+(v?\d{1,2}|final|neu))?$/;
  const MIT_LOESUNG = /(mit|inkl\.?|inklusive|samt|with|incl\.?|und|and|\+)[\s._-]*(muster)?(l(ö|oe)sung|solution)/i;
  const SCAN_ANFANG = /^scan(ned|s)?([^a-z]|$)/i; // „Scan …“ ist immer ein Scan (auch „Scan Buchkapitel“)
  const NR_WORTE = "vl|vorlesung|lecture|folien?|slides?|handout|kapitel|chapter|kap|session|sitzung|einheit|lektion|week|woche|tag|(?:ü|ue)bung(?:sblatt)?|pr(?:ä|ae)senz(?:ü|ue)bung(?:sblatt)?|aufgabenblatt|aufgaben|hausaufgaben?|ha|ü|ue|blatt|sheet|exercise|tutoriums?blatt|tutorium|tutorial|problem[\\s._-]?sets?|l(?:ö|oe)sung(?:en)?|solutions?|ps|nr|no";
  // Nummer nach einem Art-Wort; ein Bereich „VL5-6“ / „Kap 1 bis 3“ gehört mit zum Treffer (Ende in Gruppe 2).
  // Lab-Wörter („R Lab 2“, „Lab02“) zählen nur bei der Art Lab, dort vor allen anderen („Kapitel 3 Lab 2“ ist Lab 02).
  const NUMMER = new RegExp(`(?:^|[^a-zäöüß])(?:${NR_WORTE})\\.?[\\s._\\-]*(\\d{1,2})(?!\\d)(?:(?:\\s?[-–]\\s?|[\\s._]+bis[\\s._]+)(\\d{1,2})(?!\\d))?`, "i");
  const NUMMER_LAB = new RegExp(`(?:^|[^a-zäöüß])(?:(?:r|python|stata|julia|spss|coding|data[\\s._-]?science)[\\s._-]?)?labs?\\.?[\\s._\\-]*(\\d{1,2})(?!\\d)(?:(?:\\s?[-–]\\s?|[\\s._]+bis[\\s._]+)(\\d{1,2})(?!\\d))?`, "i");
  const NUMMER_ANFANG = /^(\d{1,2})(?!\d)(?:\s?[-–]\s?(\d{1,2})(?!\d))?[\s._\-]/;
  // Kürzel und Nummer als ganzer Name („EBWL_0“, „Mikro 05“); „Teil 2“, „Kopie 2“ zählen nicht
  const NUMMER_KURZ = /^([A-Za-zÄÖÜäöü]{2,6})[\s._-]+(\d{1,2})$/;
  const KEINE_NR = /^(teil|part|kopie|copy|version|stand|seite|page|anhang|bild|foto|img|scan|dokument|document)$/i;
  // Ordner einer ILIAS-Sitzung („2026-10-12, 10:15 - 11:45: Vorlesung 1“): Nummer nur für Folien
  const SITZUNGSORDNER = /^((19|20)\d{2}-\d{1,2}-\d{1,2}|\d{1,2}\.\d{1,2}\.(\d{4}|\d{2})?),?\s+\d{1,2}[:.]\d{2}/;
  // Gliederungsnummer eines Sammelordners („00 - Vorlesung“, „01 - Übungsmaterialien“) ist keine Nummer der Unterlage;
  // „1. Übung“ (Ordinalzahl) und „03_Kostenrechnung“ (Thema) schon
  const ORDNER_ALLGEMEIN = /^(unterlagen|materiali?en|material|allgemeines|allgemein|dokumente|dateien|downloads?|sonstiges|archiv|lab|labor)$/i;
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
    Tutorium: "tutori(um|ums|en)", // was es ist („Aufgabenblatt“, „Lösung“, „Folien“), bleibt im Titel
    Lab: "(r|python|stata|julia|spss|coding|data[\\s._-]?science)[\\s._-]?labs?|labs?", // „R Lab“ ist der Bereich, kein Titel
    Lösung: `${WL}|${WU}|kl`, // „…_KL“ (Klausurlösung)
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

  // PDF + PPTX mit gleichem Namen gehören zusammen, ebenso ein R-Notebook mit seiner HTML-Fassung („Lab2.Rmd“ + „Lab2.nb.html“; die
  // ILIAS-Ablage stapelt nicht und hängt „mit Ausgaben“ an, ilias.js). Liegt daneben noch „Lab2.html“ (zwei HTML in einem Stapel),
  // wird die Notebook-Fassung eine eigene Unterlage „… mit Ausgaben“ (ausgaben: true).
  const nbWeg = (basis, endung) => (endung === "html" ? basis.replace(/\.nb$/i, "") : basis);
  const istNb = (f) => ext(f) === "html" && nbWeg(f.basename, "html") !== f.basename;
  const stapeln = (dateien) => {
    const m = new Map();
    for (const f of dateien) {
      const key = `${f.parent?.path ?? ""}/${nbWeg(f.basename, ext(f)).normalize("NFC").toLowerCase()}`;
      if (!m.has(key)) m.set(key, []);
      m.get(key).push(f);
    }
    const gruppen = [];
    for (const fs of m.values()) {
      const doppelt = fs.filter((f) => ext(f) === "html").length > 1;
      if (doppelt && fs.some(istNb)) gruppen.push({ fs: fs.filter((f) => !istNb(f)) }, ...fs.filter(istNb).map((f) => ({ fs: [f], ausgaben: true })));
      else gruppen.push({ fs });
    }
    return gruppen.map(({ fs, ausgaben = false }) => {
      const pdf = fs.find((f) => ext(f) === "pdf");
      const bild = fs.find((f) => BILDER.includes(ext(f)));
      const haupt = pdf || bild || fs.find(istNb) || fs[0];
      return { dateien: fs, haupt, original: fs.find((f) => f !== haupt && ORIGINALE.includes(ext(f))) || null, ausgaben };
    }).sort((a, b) => a.haupt.path.localeCompare(b.haupt.path, "de", { numeric: true }));
  };

  // ---------- Erkennen: Art, Nummer, Titel, Code ----------
  const relPfad = (f) => f.path.slice(EINGANG.length + 1).normalize("NFC");
  const regelFinden = (s) => REGELN.find(([, re]) => re.test(s)) || null;
  // Art zuerst aus dem Dateinamen, Unterordner (der tiefste zuerst) nur als Rückfall:
  // „Vorlesung und Übung …/VL01“ → Folien. Ausnahmen: „Lösungen/Blatt_05“ → Lösung, „Altklausuren/Aufgaben 2019“ → Altklausur.
  // Lösungen zu Klausuren sind Lösungen („Altklausuren/Lösung 2023“, „Klausur_2023_Loesung“, „BAMatheWS1819A_KL“),
  // die Klausur selbst („…_Korrektur“, „Klausur mit Lösungen“) bleibt Altklausur.
  // Ergebnis: { art, quelle: "name" | "ordner" | "rest", schwach } (schwach = nur ein schwacher Hinweis wie „Organisatorisches“)
  const artBestimmen = (rel, endung, basis) => {
    if (TUTORIUM.test(basis)) return { art: "Tutorium", quelle: "name", schwach: false };
    if (rel.split("/").slice(0, -1).some((o) => TUTORIUM.test(o))) return { art: "Tutorium", quelle: "ordner", schwach: false };
    const lab = laborArt(rel.split("/").slice(0, -1), basis, endung);
    if (lab) return lab;
    if (SCAN_ANFANG.test(basis)) return { art: "Scan", quelle: "name", schwach: false };
    let r = KL_ENDE.test(basis) ? ["Lösung"] : regelFinden(basis);
    if (r && r[0] === "Altklausur" && !MIT_LOESUNG.test(basis)) r = REGELN.find(([a, re]) => (a === "Eigene Lösung" || a === "Lösung") && re.test(basis)) || r;
    if (!r && AUTOR_JAHR.test(basis)) r = ["Literatur"];
    const name = r ? r[0] : null, nameSchwach = !!(r && r[2]);
    const o = rel.split("/").slice(0, -1).reverse().map(regelFinden).find(Boolean) || null;
    const ordner = o ? o[0] : null;
    if (name === "Übung" && ["Lösung", "Eigene Lösung", "Altklausur"].includes(ordner)) return { art: ordner, quelle: "ordner", schwach: false };
    if (name && !(nameSchwach && ordner)) return { art: name, quelle: "name", schwach: nameSchwach };
    // Lesestoff aus einem Ordner („Zusatzmaterial/“) nur für Dokumente, nicht für Daten, Code oder Videos
    if (ordner && !(ordner === "Literatur" && !LESEFORMATE.includes(endung))) return { art: ordner, quelle: "ordner", schwach: !!o[2] };
    if (BILDER.includes(endung)) return { art: "Scan", quelle: "rest", schwach: false };
    return { art: "Sonstiges", quelle: "rest", schwach: false };
  };
  // Lab aus Name oder Ordner (siehe LAB_NAME). Eigene Arbeit bleibt, was sie ist, ob im Namen oder im Ordner („Meine Lösung Lab 3“,
  // „Mitschriften/R Lab 2“, „Scans/Lab 3“; sie geht nie an den eigenen Server), ebenso Lesestoff und Altklausuren aus einem eigenen
  // Ordner unterhalb des tiefsten Lab-Ordners („Python Labs/Reading/…“, „Literatur/Charness Lab 1“). Ein Bild ist nur Lab, wenn sein
  // Name ein Lab nennt („R Lab 3/IMG_0012.jpg“ bleibt ein Scan). → { art: "Lab", … } oder null
  const regelArt = (a) => REGELN.find(([x]) => x === a)[1];
  const EIGENE_ARBEIT = ["Eigene Lösung", "Mitschrift", "Scan"];
  const EIGEN_LAB = /(^|[^a-zäöüß])(my|meine)[\s._-]*notes?([^a-zäöüß]|$)|abgabe|submission/i; // „My Notes“, „Abgaben/“
  const laborArt = (ordner, basis, endung = "") => {
    if (SCAN_ANFANG.test(basis) || regelArt("Eigene Lösung").test(basis) || regelArt("Mitschrift").test(basis)) return null;
    if ([basis, ...ordner].some((s) => EIGEN_LAB.test(s))) return null;
    if (EIGENE_ARBEIT.includes((regelFinden(basis) || [])[0])) return null; // „Lab 3 Scan“
    if (ordner.some((o) => SCAN_ANFANG.test(o) || EIGENE_ARBEIT.includes((regelFinden(o) || [])[0]))) return null;
    const imNamen = labArtig(basis), tiefster = ordner.map(labArtig).lastIndexOf(true);
    if (!imNamen && (tiefster < 0 || BILDER.includes(endung))) return null;
    const vorrang = (o) => { const x = regelFinden(o); return !!x && (x[0] === "Literatur" || x[0] === "Altklausur"); };
    if (ordner.some((o, i) => i > tiefster && vorrang(o))) return null;
    return { art: "Lab", quelle: imNamen ? "name" : "ordner", schwach: false };
  };
  // gültige Datumsangaben durch „§“ gleicher Länge ersetzen (Positionen bleiben gleich)
  const datumOk = (mo, t) => +mo >= 1 && +mo <= 12 && +t >= 1 && +t <= 31;
  const ohneDatum = (s) => s
    .replace(DATUM_ISO, (m, vor, j, mo, t) => (datumOk(mo, t) ? vor + "§".repeat(m.length - vor.length) : m))
    .replace(DATUM_DE, (m, vor, t, mo) => (datumOk(mo, t) ? vor + "§".repeat(m.length - vor.length) : m));
  // Nummer (und Ende eines Bereichs „VL3-4“) aus einem Namen; Datumsangaben zählen nicht
  const nummerErkennen = (basis, lab = false) => {
    const s = basis.normalize("NFC"), o = ohneDatum(s);
    const m = (lab && o.match(NUMMER_LAB)) || o.match(NUMMER) || o.match(NUMMER_ANFANG);
    if (m) {
      const nr = Number(m[1]);
      return { nr, bis: m[2] != null && Number(m[2]) > nr ? Number(m[2]) : null, treffer: s.substr(m.index, m[0].length), idx: m.index };
    }
    const k = o.match(NUMMER_KURZ); // „EBWL_0“: Treffer ist „_0“, das Kürzel davor fällt im Titel weg
    if (k && !KEINE_NR.test(k[1])) return { nr: Number(k[2]), bis: null, treffer: s.slice(k[1].length), idx: k[1].length };
    return { nr: null, bis: null, treffer: "", idx: -1 };
  };
  // Nummer eines Ordners, die keine Nummer der Unterlage ist: Gliederung eines Sammelordners („00 - Vorlesung“,
  // „01 - Übungsmaterialien“, „02 Unterlagen zur Vorlesung“). „1. Übung“ (Ordinalzahl) und „03_Kostenrechnung“ (Thema) zählen.
  // Lab: „03 - Data Science Lab“, „05 - Labs“ (mit Strich) gliedern den Kurs, „02 R Lab“ ist das zweite Lab.
  const gliederungsNummer = (name, n, lab = false) => {
    if (n.idx !== 0 || !/^\d/.test(n.treffer)) return false;
    const m = name.match(/^\d{1,2}(\.?)([\s._\-–)]*)(.*)$/);
    if (!m || m[1]) return false;
    if (lab && labArtig(m[3])) return /[-–)]/.test(m[2]);
    const woerter = m[3].split(/[\s._\-–&,+]+/).filter(Boolean);
    return woerter.length > 0 && woerter.every((w) => FUELL.test(w) || ORDNER_ALLGEMEIN.test(w) || !!regelFinden(w));
  };
  const codeAusName = (basis) => { const m = basis.normalize("NFC").match(CODE); return m ? m[1] : null; };
  // Semester einheitlich: „WS2627“, „WS26_27“, „WiSe 2026/27“ → „WS 2026-27“, „WS1819“ → „WS 2018-19“, „SoSe26“ → „SS 2026“.
  // Ein einzelnes Jahr bei WS bleibt („WS2024“ heißt je nach Lehrstuhl WS 2023/24 oder 2024/25).
  const SEM_IM_TEXT = /(^|[^a-zäöüß0-9])(ws|wise|wintersemester|ss|sose|sommersemester)[\s.]?(\d{4}|\d{2})([\s\/_-]{1,2}(\d{4}|\d{2}))?(?![0-9])/gi;
  const semesterSchreiben = (s) => s.replace(SEM_IM_TEXT, (m, vor, wort, a, rest, b) => {
    const jahr = (x) => (x.length === 2 ? 2000 + Number(x) : Number(x));
    const folgt = (x, y) => (jahr(x) + 1) % 100 === jahr(y) % 100;
    if (!/^w/i.test(wort)) return `${vor}SS ${jahr(a)}${rest || ""}`;
    if (b && folgt(a, b)) return `${vor}WS ${jahr(a)}-${pad(jahr(b) % 100)}`;
    if (a.length === 4 && folgt(a.slice(0, 2), a.slice(2))) return `${vor}WS ${jahr(a.slice(0, 2))}-${a.slice(2)}`;
    return `${vor}WS ${jahr(a)}${rest || ""}`;
  });
  // lange zusammengeschriebene Wörter trennen („DimpflSoenksen2022“ → „Dimpfl Soenksen 2022“, „BAMatheWS1819A“ → „BA Mathe WS 1819 A“);
  // kurze wie „PowerPoint“, „1Var“, „Part1“ bleiben
  const wortTrennen = (s) => s.split(" ").map((w) => {
    if (w.length < 12) return w;
    const t = w.replace(/([a-zäöüß])([A-ZÄÖÜ])/g, "$1 $2").replace(/([A-ZÄÖÜ]+)([A-ZÄÖÜ][a-zäöüß])/g, "$1 $2")
      .replace(/([A-Za-zÄÖÜäöüß])(\d)/g, "$1 $2").replace(/(\d)([A-Za-zÄÖÜäöüß])/g, "$1 $2");
    return t.split(" ").length >= 3 ? t : w;
  }).join(" ");
  const titelErkennen = (basis, code, treffer, art, idx = -1) => {
    let s = basis.normalize("NFC").replace(/_/g, " ");
    // Nummer-Treffer herausnehmen; ein Kurskürzel oder Semester direkt davor („JA VL 1“, „WS2627_VL1“, „1_JA_Kap 1“) fällt mit weg
    const tr = (treffer || "").replace(/_/g, " ");
    const i = !tr ? -1 : idx >= 0 && s.substr(idx, tr.length) === tr ? idx : s.indexOf(tr);
    if (i >= 0) {
      let vor = s.slice(0, i).trim();
      if (code && vor.startsWith(code)) vor = vor.slice(code.length).trim();
      vor = vor.replace(/^\d{1,2}\s+(?=\S)/, ""); // Gliederungsnummer vor dem Kürzel („1 JA“)
      if (KUERZEL.test(vor) || SEMESTER.test(vor)) vor = "";
      s = `${vor} ${s.slice(i + tr.length)}`;
    }
    s = s.replace(/\s+/g, " ").trim();
    if (code && s.startsWith(code)) s = s.slice(code.length);
    if (code) s = wortWeg(s, code); // Modulcode mitten im Namen („FAQ_B110_WS2627“)
    // Versionszusätze: „(1)“, „_v2“, „_final“, „Kopie“, „copy“
    s = s.replace(/\((\d{1,2}|neu|new|kopie|copy)\)/gi, " ");
    s = wortWeg(s, "v\\d{1,2}|final|kopie( von)?|copy( of)?");
    const rein = (x) => x.replace(/^[\s\-–.:,;+&]+|[\s\-–.:,;+&]+$/g, "").replace(/\s+/g, " ").trim();
    if (GENERISCH.test(rein(s))) return "";
    s = semesterSchreiben(wortTrennen(rein(s)));
    // Art-Wörter und Füllwörter entfernen
    s = wortWeg(s, ARTWORTE[art] || "");
    s = s.replace(/(^|\s)(von|of|\/)\s?\d{1,3}(?=\s|$)/gi, " "); // „Folie 3 von 12“
    s = rein(fuellWeg(rein(s)));
    // wie jeder Fremdtext bereinigt: kein „<%“ (Templater), keine Link- und Tag-Zeichen in Überschrift und Eigenschaft
    return GENERISCH.test(s) ? "" : sauber(s);
  };
  // Titel, der wenig sagt (dann lohnt der Blick in die PDF): leer, weniger als 4 Buchstaben Inhalt, überwiegend Kürzel und
  // Ziffern („Opt 1Var“, „OPT u NB“, „Fkt mehrerer Var“, „komp stat“), nur allgemeine Wörter („post“, „erste“) oder nur der
  // Kurzname des Kurses („EBWL“). Semesterangaben, Zahlen und Füllwörter zählen nicht mit.
  const ALLGEMEIN_WORT = /^(post|pre|erste[rsnm]?|zweite[rsnm]?|dritte[rsnm]?|letzte[rsnm]?|neu|new|alt|old|live|final|druck|print|handout|version|teil|part|datei|file|dokument|document|unterlagen?|materiali?en|material|folien?|slides?|vorlesung|lecture|session|sitzung|leer|blanko?|unbeschrieben|beschrieben|annotiert|annotated|anmerkungen|notes|mit|ohne|with|without)$/i;
  const schwacherTitel = (titel, kurz = "") => {
    const t = semesterSchreiben(String(titel || "").normalize("NFC")).replace(/(^|\s)(WS|SS) \d{4}(-\d{2})?(?=\s|$)/g, " ").replace(/\s+/g, " ").trim();
    if (kurz && t.toLowerCase() === String(kurz).normalize("NFC").trim().toLowerCase()) return true;
    const woerter = t.split(/[\s_.,;:()\-–+&]+/).filter((w) => w && !FUELL.test(w) && !/^\d+$/.test(w));
    if (!woerter.length) return true;
    const kuerzel = (w) => /\d/.test(w) || w.length <= 3 || /^[A-ZÄÖÜ]{2,6}$/.test(w) || (w.length <= 4 && w === w.toLowerCase());
    const inhalt = woerter.filter((w) => !kuerzel(w));
    if (inhalt.join("").length < 4 || (woerter.length - inhalt.length) * 2 > woerter.length) return true;
    return inhalt.every((w) => ALLGEMEIN_WORT.test(w));
  };
  const zielName = (code, art, nr, titel) => {
    const kopf = [code, art, nr != null ? pad(nr) : ""].filter(Boolean).join(" ");
    const datumArt = ["Scan", "Sonstiges", "Mitschrift", "Eigene Lösung"].includes(art) && nr == null;
    const t = titel || (datumArt ? eba.heute : "");
    let name = sauber([kopf, t].filter(Boolean).join(" "));
    if (name.length > NAME_MAX) name = sauber(kuerzen(name, NAME_MAX));
    return name || sauber(`${code || "Unterlage"} ${eba.heute}`);
  };
  // Titel mit Zusatz („… mit Ausgaben“), so gekürzt, dass der Zusatz im Dateinamen nicht der Kürzung zum Opfer fällt
  const titelMitZusatz = (code, art, nr, titel, zusatz) => {
    const platz = NAME_MAX - zielName(code, art, nr, "").length - zusatz.length - 2;
    return sauber([titel && platz > 0 ? kuerzen(titel, platz) : "", zusatz].filter(Boolean).join(" "));
  };
  // Vorschlag für eine Datei aus Pfad und Name (auch für Tests ohne Datei). „rel“ ist der Pfad unterhalb des Eingangs bzw.
  // des ILIAS-Kurses. Ergebnis: art, nr, titel, eigenerCode (Modulcode am Anfang des Dateinamens), code (Code aus dem
  // Dateinamen, sonst aus dem tiefsten Ordner mit Code, sonst der übergebene; ob es das Modul gibt, prüft der Aufrufer),
  // schwach (Titel aus dem Namen taugt wenig, siehe schwacherTitel) und name (Schema mit diesem code).
  const vorschlag = (rel, endung, code) => {
    const pfad = nbWeg(rel.normalize("NFC").replace(/\.[^.]+$/, ""), endung);
    const ordner = pfad.split("/");
    const basis = ordner.pop();
    const eigenerCode = codeAusName(basis);
    const ordnerCode = ordner.slice().reverse().map(codeAusName).find(Boolean) || null; // „SQ888 Mathematisches Propädeutikum/…“ im S100-Kurs
    const codeNeu = eigenerCode || ordnerCode || code || "";
    const a = artBestimmen(pfad, endung, basis);
    let art = a.art;
    let { nr, bis, treffer, idx } = nummerErkennen(basis, art === "Lab");
    const ausName = nr != null;
    // nummerierte Dateien ohne erkannte Art („01_Einfuehrung“, „01_Organisatorisches“) sind meist Folien
    if (art === "Sonstiges" && ausName && (a.quelle === "rest" || a.schwach) && !BILDER.includes(endung)) art = "Folien";
    // ohne Nummer im Namen: Nummer aus dem Unterordner („Woche 3/slides.pdf“, „03_Kostenrechnung/Folien.pdf“), der tiefste zuerst;
    // nicht aus der Gliederung eines Sammelordners und nicht aus dem Ordner einer Gruppe, aus einem Sitzungsordner nur für Folien und Lab
    if (!ausName) for (const o of ordner.slice().reverse()) {
      const n = nummerErkennen(o, art === "Lab");
      if (n.nr == null || gliederungsNummer(o, n, art === "Lab") || GRUPPENORDNER.test(o) || (SITZUNGSORDNER.test(o) && art !== "Folien" && art !== "Lab")) continue;
      nr = n.nr; bis = n.bis; break;
    }
    let titel = titelErkennen(basis, eigenerCode || codeNeu, treffer, art, idx);
    if (ausName && /^\d$/.test(titel)) titel = ""; // Anhängsel einer Kopie („VL03 2.pdf“ auf iOS) ist kein Titel
    if (!ausName && nr != null) titel = titel.replace(new RegExp(`\\s0*${nr}$`), ""); // „1. Übung/Kurzlösung_1“ → „Kurzlösung“
    if (bis != null) titel = sauber(`bis ${pad(bis)} ${titel}`); // Bereich „VL3-4“ → „Folien 03 bis 04“
    return { art, nr, titel, eigenerCode, code: codeNeu, schwach: bis == null && schwacherTitel(titel), name: zielName(codeNeu, art, nr, titel) };
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

  // ---------- Titel aus der ersten PDF-Seite ----------
  // Für Dateien, deren Name nur einen schwachen Titel hergibt („EBWL_1“, „VL_3_Opt_1Var“). Kandidaten sind die Zeilen der ersten
  // Seite mit größerer Schrift als der Fließtext (größte zuerst, darin die oberste); gleich große Zeilen direkt untereinander
  // bilden einen Block („Mathematische Methoden der / Wirtschaftswissenschaft“). Es fallen weg: Uni, Fakultät, Lehrstuhl, Namen
  // („Prof. Dr.“), Datum, Semester, Seitenzahlen, Formeln, Modulcode, Modultitel und reine Art-Wörter („Übung 1“, „Klausur zur
  // Vorlesung“, „Tag 1“); „Kapitel 3: Optimierung“ → „Optimierung“. Der Metadaten-Titel (PDF-Eigenschaft „Title“) zählt nur, wenn
  // er auf der Seite steht (Vorlagen tragen oft einen alten Titel), dann gilt seine Schreibweise (keine verlorenen Ligaturen wie
  // „Dierentiation“). Im Zweifel null: dann bleibt der Titel aus dem Dateinamen.
  const TITEL_MAX = 60;
  const PDF_TITEL_MUELL = /^(microsoft\s+(word|powerpoint|excel)|powerpoint|pr(ä|ae)sentation\s*\d*$|presentation\s*\d*$|folie\s*\d*$|slide\s*\d*$|untitled|unbenannt|new document|neues dokument|dokument\s*\d*$|document\s*\d*$|titel$|title$|vorlage|template)/i;
  const ZEILE_INSTITUTION = /universit(ä|ae)t|university|fakult(ä|ae)t|faculty|lehrstuhl|chair (of|for)|abteilung|department|institut|school of|fachbereich|dezernat|hochschule|international office/i;
  const ZEILE_PERSON = /(^|[\s,(])(prof|professor|professorin|dr|pd|dipl|jun)\.?(\s|-|$)|m\.\s?sc\.|b\.\s?sc\.|ph\.\s?d/i;
  const ZEILE_INHALT = /^(aufgabe|exercise|problem|frage|question)\s*\d/i; // Überschrift einer Aufgabe, nicht des Dokuments
  const ZEIT_WORT = /^(am|den|vom|von|bis|um|uhr|im|zum|on|at|from|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|monday|tuesday|wednesday|thursday|friday|saturday|sunday|januar|februar|märz|maerz|april|mai|juni|juli|august|september|oktober|november|dezember|january|february|march|may|june|july|october|december|wintersemester|sommersemester|wise|sose|ws|ss|semester)$/i;
  const FORMULAR_WORT = /^(name|vorname|nachname|matrikelnummer|matrikelnr|datum|unterschrift|punkte|note|seite|page|gruppe)$/i;
  const ART_ALLGEMEIN = /^(vorlesungs?|(ü|ue)bungs?|tutoriums?|klausur|kurz|muster|probe|zusatz)?(folien?|slides?|vorlesung(en)?|lecture|(ü|ue)bung(en)?|aufgaben?|aufgabenbl(a|ä|ae)tt(er)?|bl(a|ä|ae)tt(er)?|tutorium|tutorial|klausur(en)?|pr(ü|ue)fung|exam|l(ö|oe)sung(en)?|solutions?|skript|script|handout|agenda|inhalt|inhaltsverzeichnis|gliederung|outline|contents|teil|part|tag|woche|week|kapitel|chapter|einheit|unit|lektion|session|sitzung|nr|no)$/i;
  const KLEIN_IM_TITEL = /^(ein|eine|einer|eines|einem|einen|unter|mit|über|ueber|bei|aus|nach|vor|ohne|als|ihre?|ihrer|seine?|a|an|by|with)$/i;
  // „GRUNDLEGENDE KONZEPTE DER VOLKSWIRTSCHAFT“ → „Grundlegende Konzepte der Volkswirtschaft“ (nur bei durchgehender Großschrift)
  const titelSchreibung = (s) => {
    const b = s.replace(/[^A-Za-zÄÖÜäöüß]/g, "");
    if (b.length < 4 || b.replace(/[^a-zäöüß]/g, "").length > b.length * 0.2) return s;
    return s.split(" ").map((w, i) => {
      const k = w.toLowerCase();
      if (FUELL.test(k) || KLEIN_IM_TITEL.test(k)) return i === 0 ? k.charAt(0).toUpperCase() + k.slice(1) : k;
      if (/^[A-ZÄÖÜ]{2,3}$/.test(w)) return w; // Abkürzung („BIP“, „IAS“)
      return k.charAt(0).toUpperCase() + k.slice(1);
    }).join(" ");
  };
  // Aufzählung vorn („Kapitel 3:“, „Übung 1 –“, „2.“, „Tag 1“), Semester und Anführungszeichen weg
  const segmentReinigen = (s) => String(s).replace(/[„“”"«»‚‘’]/g, " ").replace(/\s+/g, " ").trim()
    .replace(/^((kapitel|chapter|kap\.?|teil|part|lektion|lecture|vorlesung|session|sitzung|einheit|unit|thema|topic|(ü|ue)bung(sblatt)?|aufgabenblatt|tutorium|tag|woche|week|blatt|sheet|nr\.?)\s*)?\d{1,2}(\.\d{1,2})*[.:)]?(\s*[-–:|]\s*|\s+|$)/i, "")
    .replace(/(^|\s)(im\s+)?(wintersemester|sommersemester|wise|sose|ws|ss)\s*\d{2,4}([\/-]\d{2,4})?(?=\s|$)/gi, " ")
    .replace(/^[\s\-–:,;.|/]+|[\s\-–:,;|/]+$/g, "").replace(/\s+/g, " ").trim();
  const worte = (s) => String(s).normalize("NFC").toLowerCase().split(/[^a-zäöüß0-9]+/).filter(Boolean);
  // Taugt ein (gereinigtes) Stück als Titel? kurs: Inhaltswörter des Modultitels, code: Modulcode
  const segmentTaugt = (t, kurs, code) => {
    if (!t || ZEILE_INSTITUTION.test(t) || ZEILE_PERSON.test(t) || ZEILE_INHALT.test(t)) return false;
    if (/[=≤≥<>∑∫√±×÷∈∀∃→]|\(\s?[a-z]\s?\)|^\d+\s*(\/|von|of)\s*\d+$/.test(t)) return false; // Formeln, „(a)“, Seitenzahl
    const w = worte(t);
    const inhalt = w.filter((x) => !FUELL.test(x) && !ZEIT_WORT.test(x) && !/^\d+$/.test(x) && !ART_ALLGEMEIN.test(x) && !FORMULAR_WORT.test(x) && x !== code);
    const kurzwort = inhalt.length === 1 && /^[A-ZÄÖÜ]{3,5}$/.test(t); // „FAQ“
    if (!kurzwort && inhalt.join("").replace(/[0-9]/g, "").length < 4) return false;
    // Modultitel oder ein Teil davon („Mathematische Methoden der“); ein einzelnes Wort aus einem längeren Titel („Einführung“) zählt
    if (kurs.length && inhalt.every((x) => kurs.includes(x)) && (inhalt.length >= 2 || kurs.length === 1)) return false;
    return t.length <= 120 && !(/[.!?]$/.test(t) && w.length > 8); // ein Satz ist kein Titel
  };
  const ligaturFrei = (s) => worte(s).join("").replace(/ff|fi|fl/g, "");
  // Reine Auswahl aus Metadaten-Titel und Textstücken der ersten Seite ({ s: Text, x, y, g: Schriftgröße, w: Breite, b: Drehung }),
  // ohne pdf.js: so auch in Node testbar. opt: { code, modulTitel }. Ergebnis: Titel (höchstens TITEL_MAX Zeichen) oder null.
  const pdfTitelWaehlen = ({ titel = "", stuecke = [] } = {}, opt = {}) => {
    const code = String(opt.code || "").toLowerCase();
    const kurs = worte(opt.modulTitel || "").filter((x) => !FUELL.test(x));
    // Stücke → Zeilen (gleiche Höhe, gleiche Größe) → Blöcke (gleiche Größe, direkt untereinander)
    const zeilen = [];
    for (const st of stuecke) {
      if (!st || !String(st.s || "").trim() || !(st.g > 0) || Math.abs(st.b || 0) > 0.01) continue;
      let z = zeilen.find((q) => Math.abs(q.y - st.y) <= st.g * 0.3 && Math.abs(q.g - st.g) <= 0.6);
      if (!z) { z = { y: st.y, g: st.g, teile: [] }; zeilen.push(z); }
      z.teile.push(st);
    }
    for (const z of zeilen) {
      z.teile.sort((a, b) => a.x - b.x);
      let t = "", ende = null;
      for (const st of z.teile) {
        const luecke = ende == null || st.w == null || st.x - ende > z.g * 0.15;
        t += (t && luecke && !/\s$/.test(t) ? " " : "") + st.s;
        ende = st.w == null ? null : st.x + st.w;
      }
      z.text = akzenteReparieren(t.replace(/\s+/g, " ").trim());
      z.klasse = Math.round(z.g * 2) / 2;
    }
    const zeichen = {};
    for (const z of zeilen) zeichen[z.klasse] = (zeichen[z.klasse] || 0) + z.text.replace(/\s/g, "").length;
    const groessen = Object.keys(zeichen).map(Number).sort((a, b) => b - a);
    const fliess = groessen.slice().sort((a, b) => zeichen[b] - zeichen[a])[0];
    const gesamt = groessen.reduce((n, g) => n + zeichen[g], 0);
    // Modultitel als zusammenhängende Wortfolge herausnehmen („Mathematische Methoden der Wirtschaftswissenschaft Formelsammlung“)
    const mt = worte(opt.modulTitel || "");
    const kursFolge = mt.length >= 2 ? new RegExp(mt.join("[^a-zäöüß0-9]+"), "i") : null; // worte() liefert nur Buchstaben und Ziffern
    const teile = (s) => (kursFolge ? s.replace(kursFolge, " - ") : s).split(/\s+[-–—|]\s+|\s*\[[\d.]+\s?(?:cm|mm|pt|em|ex)\]\s*|:\s+/i).filter(Boolean);
    // gültige Stücke eines Textes, gereinigt und wieder verbunden („KAPITEL 1 – GRUNDLAGEN“ → „GRUNDLAGEN“)
    const auswerten = (s) => {
      if (ZEILE_INSTITUTION.test(s) || ZEILE_PERSON.test(s) || ZEILE_INHALT.test(s)) return "";
      return teile(s).map(segmentReinigen).filter((t) => segmentTaugt(t, kurs, code)).join(" - ");
    };
    let kandidat = "";
    for (const k of groessen.filter((g) => g > fliess + 0.4 || g === groessen[0]).slice(0, 3)) {
      const reihe = zeilen.filter((z) => z.klasse === k).sort((a, b) => b.y - a.y);
      const bloecke = [];
      for (const z of reihe) {
        const v = bloecke[bloecke.length - 1];
        if (v && v.y - z.y <= z.g * 1.6) { v.text += " " + z.text; v.y = z.y; } else bloecke.push({ y: z.y, text: z.text });
      }
      // keine größere Schrift als der Fließtext: nur ein Deckblatt mit wenig Text taugt
      if (k === fliess && bloecke.length > 2 && gesamt > 400) break;
      for (const b of bloecke) { kandidat = auswerten(b.text); if (kandidat) break; }
      if (kandidat) break;
    }
    // Metadaten-Titel: nur, wenn er auf der Seite steht; dann in seiner Schreibweise
    const meta = PDF_TITEL_MUELL.test(String(titel).trim()) || /\.(pdf|docx?|pptx?|tex|indd)$|^\S+_\S+$/i.test(String(titel).trim()) ? "" : auswerten(akzenteReparieren(String(titel)));
    const seite = ligaturFrei(zeilen.map((z) => z.text).join(" "));
    if (meta && kandidat && (ligaturFrei(meta).includes(ligaturFrei(kandidat)) || ligaturFrei(kandidat).includes(ligaturFrei(meta)))) kandidat = meta;
    else if (meta && !kandidat && ligaturFrei(meta).length >= 4 && seite.includes(ligaturFrei(meta))) kandidat = meta;
    if (!kandidat) return null;
    let t = titelSchreibung(kandidat);
    if (t.length > TITEL_MAX) {
      const i = t.search(/\s-\s/);
      t = i >= 15 && i <= TITEL_MAX ? t.slice(0, i) : kuerzen(t, TITEL_MAX);
    }
    t = sauber(t);
    return t.replace(/[^A-Za-zÄÖÜäöüß]/g, "").length >= 3 ? t : null;
  };
  // Titel aus einer PDF (TFile, ArrayBuffer oder Uint8Array); opt: { code, modulTitel } (Modultitel sonst aus dem Modul zum Code).
  // Liest nur Metadaten und die erste Seite; zu große oder unlesbare PDFs → null. Der übergebene Puffer bleibt unverändert.
  const titelAusPdf = async (quelle, opt = {}) => {
    let doc = null;
    try {
      let daten = quelle;
      if (quelle && typeof quelle.path === "string" && quelle.stat) {
        if (quelle.stat.size > LESEN_MAX_MB * 1048576) return null;
        daten = await app.vault.readBinary(quelle);
      }
      if (!daten || !(daten.byteLength > 0) || daten.byteLength > LESEN_MAX_MB * 1048576) return null;
      const bytes = daten instanceof Uint8Array ? daten.slice() : new Uint8Array(daten.slice(0)); // pdf.js übernimmt den Puffer
      const pdfjs = await ctx.obsidian.loadPdfJs();
      doc = await pdfjs.getDocument({ data: bytes }).promise;
      const meta = await doc.getMetadata().catch(() => null);
      const seite = await doc.getPage(1);
      const tc = await seite.getTextContent();
      const stuecke = tc.items.filter((i) => i && typeof i.str === "string" && i.transform).slice(0, 3000)
        .map((i) => ({ s: i.str, x: i.transform[4], y: i.transform[5], g: Math.hypot(i.transform[2], i.transform[3]), w: i.width, b: i.transform[1] }));
      const code = opt.code || "";
      const modulTitel = opt.modulTitel != null ? opt.modulTitel : (code && eba.modulNachCode(code)?.fm.titel) || "";
      return pdfTitelWaehlen({ titel: (meta && meta.info && meta.info.Title) || "", stuecke }, { code, modulTitel });
    } catch (e) {
      console.warn("Unterlagen: Titel aus der PDF nicht lesbar", quelle?.path || "", e);
      return null;
    } finally {
      try { await doc?.destroy(); } catch (e) {}
    }
  };
  // Titel aus der PDF statt des schwachen Titels aus dem Namen; dessen Semester („WS 2018-19“) bleibt, wenn die PDF keine Jahreszahl nennt
  const titelMitPdf = (titelName, titelPdf) => {
    if (!titelPdf) return titelName;
    const sem = (String(titelName || "").match(/(^|\s)((WS|SS) \d{4}(-\d{2})?)(?=\s|$)/) || [])[2];
    return sauber(sem && !/(19|20)\d{2}/.test(titelPdf) ? `${titelPdf} ${sem}` : titelPdf);
  };
  // Vorschlag wie oben, bei schwachem Titel ergänzt um den Titel aus der PDF (daten: TFile, ArrayBuffer oder Uint8Array).
  // Eine Semesterangabe aus dem Dateinamen bleibt erhalten, wenn der PDF-Titel keine Jahreszahl hat. Feld titelQuelle: "name" | "pdf".
  const vorschlagMitPdf = async (rel, endung, code, daten, opt = {}) => {
    const v = vorschlag(rel, endung, code);
    v.titelQuelle = "name";
    if (!v.schwach || String(endung).toLowerCase() !== "pdf" || !daten) return v;
    const t = await titelAusPdf(daten, { code: v.code, ...opt });
    if (!t) return v;
    v.titel = titelMitPdf(v.titel, t);
    v.titelQuelle = "pdf";
    v.schwach = false;
    v.name = zielName(v.code, v.art, v.nr, v.titel);
    return v;
  };

  // ---------- Begleitnotiz ----------
  // Knopf „Öffnen ↗“: Datei außerhalb von Obsidian öffnen (iPad/iPhone Dateien-App mit Markieren, PC Standardprogramm),
  // Aktion „oeffnen“ (System/Skripte/aktionen.js). Kein Vault-Name, kein Notizname im Link: der Knopf wirkt auf die Notiz, in der er
  // steht (übersteht Umbenennen). Bei einer eingebetteten PDF steht „Öffnen“ in der Kopfzeile des PDF-Kastens (pdfkasten.js), sonst
  // als Link hinter der Datei. orig: Office-Datei zur PDF („Original öffnen“).
  const oeffnenUrl = (original = false) => `obsidian://studium-autopilot?aktion=oeffnen${original ? "&original=1" : ""}`;
  const oeffnenLinks = (orig) => ` · [Öffnen ↗](${oeffnenUrl()})${orig ? ` · [Original öffnen ↗](${oeffnenUrl(true)})` : ""}`;
  // Ansicht der Hauptdatei: eingebettet (PDF-Kasten, Titel mit Seitenzahl), verlinkt oder mit Hinweis
  const ansichtText = (h, zuGross, seiten = null, orig = null) => {
    const e = ext(h);
    const n = Number(seiten);
    let ansicht;
    if (e === "pdf" && h.stat.size >= EINBETTEN_MAX_MB * 1048576) ansicht = `**PDF öffnen:** [[${h.name}]] (${mb(h.stat.size)}, zu groß zum Einbetten)${oeffnenLinks(orig)}`;
    else if (e === "pdf") ansicht = `> [!eba-pdf]- PDF${n > 0 ? ` (${n} ${n === 1 ? "Seite" : "Seiten"})` : ""}\n> ![[${h.name}#height=560]]`; // eingeklappt, Tipp auf „PDF“ öffnet
    else if (["heic", "heif"].includes(e)) ansicht = `[[${h.name}]]${oeffnenLinks()}\n\n> [!eba-achtung] HEIC zeigt Obsidian nicht an\n> Beim nächsten Mal als PDF oder JPG sichern, zum Beispiel über „Dokumente scannen“ in der Dateien-App.`;
    else if (BILDER.includes(e)) ansicht = `![[${h.name}]]`;
    else ansicht = `[[${h.name}]]${oeffnenLinks()}\n\n> [!eba-info] Nur als ${e.toUpperCase()} vorhanden\n> Obsidian zeigt diesen Dateityp nicht an. Am PC als PDF exportieren und mit gleichem Namen in \`Eingang\` legen, dann erscheint die PDF hier.`;
    if (zuGross) ansicht += `\n\n> [!eba-info] Zu groß zum Auslesen\n> Die Datei hat ${mb(h.stat.size)}, auf diesem Gerät werden PDFs bis ${LESEN_MAX_MB} MB ausgelesen (PC ${LESEN_MAX_MB_PC} MB, iPhone/iPad ${LESEN_MAX_MB_MOBIL} MB). Sie ist vollständig eingeordnet, nur Seitenzahl und Text fehlen in dieser Notiz.`;
    return ansicht;
  };
  // Begleitnotiz als Markdown, gleiches Format für „Einordnen“ und die ILIAS-Ablage (ilias.js). Felder:
  // code, modul (Modul-Objekt aus eba.modulNachCode oder Notizname), art, nummer, titel, datei (TFile oder Dateiname; Größe dann
  // aus „groesse“ in Byte), original (TFile oder Dateiname, z. B. die PPTX zur PDF), format („pdf, pptx“; Standard: Endungen
  // von datei, original und weitere), seiten, semester, quelle (Text oder Link, Standard leer), extra (weitere Eigenschaften
  // nach „quelle“, z. B. { ilias_id: "…" }; Standardfelder lassen sich nicht überschreiben), weitere (Dateien), zuGross, hinweis (Satz
  // für den Kasten „Neue Fassung aus ILIAS“ über der Datei).
  // Text: Titel, gleich darunter die Datei. Seit 19.10.2026 ohne Kasten „Eckdaten“ (Modul, Art und Semester stehen im Kopf der Notiz,
  // kopf.js; die Seiten im Titel des PDF-Kastens; „Öffnen“ und „Original“ in dessen Kopfzeile, pdfkasten.js) und ohne die leeren
  // Abschnitte „## Das Wichtigste“ („- “) und „## Offene Fragen“ („- [ ] “), die wie kaputt aussahen. Ältere Notizen bleiben, wie
  // sie sind; kopf.js blendet bei ihnen beides aus, solange es unberührt ist.
  const STANDARDFELDER = ["typ", "code", "modul", "art", "nummer", "titel", "datei", "original", "format", "seiten", "semester", "status", "datum", "quelle", "uebersicht", "cssclasses", "tags"];
  const alsDatei = (f, groesse = 0) => {
    if (!f || typeof f !== "string") return f || null;
    const name = f.split("/").pop(), i = name.lastIndexOf(".");
    return { name, basename: i > 0 ? name.slice(0, i) : name, extension: i > 0 ? name.slice(i + 1) : "", stat: { size: groesse || 0 } };
  };
  const yamlWert = (v) => (v == null ? "" : typeof v === "number" || typeof v === "boolean" ? String(v) : typeof v === "string" ? J(v) : JSON.stringify(v));
  const begleitnotiz = ({ code = "", modul = null, art = "Sonstiges", nummer = null, titel = "", datei, original = null, format, seiten = null,
    semester = "", quelle = "", extra = null, weitere = [], zuGross = false, groesse = 0, hinweis = "" } = {}) => {
    const h = alsDatei(datei, groesse), orig = alsDatei(original), mehr = (weitere || []).map((f) => alsDatei(f));
    const modulName = !modul ? "" : typeof modul === "string" ? modul.replace(/^\[\[|\]\]$/g, "") : modul.f?.basename || "";
    const titelZeile = [code, [art, nummer != null ? pad(nummer) : ""].filter(Boolean).join(" "), titel].filter(Boolean).join(" · ");
    const weitereZeilen = mehr.length ? ["", `**Weitere Dateien:** ${mehr.map((f) => `[[${f.name}]]`).join(", ")}`] : [];
    const ilias = hinweis ? ["> [!eba-info] Neue Fassung aus ILIAS", "> " + String(hinweis).replace(/\s*\n\s*/g, " "), ""] : [];
    const ansicht = ansichtText(h, zuGross, seiten, orig);
    const fmt = format != null ? format : [h, orig, ...mehr].filter(Boolean).map(ext).join(", ");
    const zusatz = Object.keys(extra || {}).filter((k) => /^[A-Za-z_][A-Za-z0-9_-]*$/.test(k) && !STANDARDFELDER.includes(k)).map((k) => `${k}: ${yamlWert(extra[k])}`);
    return [
      "---",
      "typ: unterlage",
      `code: ${J(code)}`,
      `modul: ${J(modulName ? `[[${modulName}]]` : "")}`,
      `art: ${J(art)}`,
      `nummer: ${nummer ?? ""}`,
      `titel: ${J(titel)}`,
      `datei: ${J(`[[${h.name}]]`)}`,
      `original: ${J(orig ? `[[${orig.name}]]` : "")}`,
      `format: ${J(fmt)}`,
      `seiten: ${seiten ?? ""}`,
      `semester: ${J(semester)}`,
      "status: neu",
      `datum: ${eba.heute}`,
      `quelle: ${J(quelle)}`,
      ...zusatz,
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
      ...ilias,
      ansicht,
      ...weitereZeilen,
      "",
    ].join("\n");
  };
  const notizInhalt = (u) => begleitnotiz({
    code: u.code, modul: u.modul, art: u.art, nummer: u.nr, titel: u.titel, datei: u.haupt, original: u.original,
    format: u.dateien.map((f) => ext(f)).join(", "), seiten: u.seiten, semester: u.semester, weitere: u.weitere, zuGross: u.zuGross,
  });

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
    // „Nur als PPTX vorhanden“ samt Link (seit 19.10.2026 mit „Öffnen ↗“ dahinter) weicht dem PDF-Kasten. Den Kasten „Eckdaten“ älterer
    // Notizen pflegt es nicht mehr (kopf.js blendet ihn aus); Seiten und Original stehen in den Eigenschaften und im PDF-Kasten.
    const hinweis = new RegExp(`\\[\\[${esc(original.name)}\\]\\][^\\n]*\\n\\n> \\[!eba-info\\] Nur als [^\\n]*\\n> [^\\n]*`);
    const ansicht = ansichtText(pdf, zuGross, seiten, original);
    await app.vault.process(notiz, (text) => {
      const nachFragen = text.indexOf("\n## ", text.indexOf("\n## Offene Fragen") + 1);
      return hinweis.test(text) ? text.replace(hinweis, () => ansicht)
        : text.includes("\n## Offene Fragen") ? (nachFragen > 0 ? `${text.slice(0, nachFragen)}\n${ansicht}\n${text.slice(nachFragen)}` : `${text.replace(/\n*$/, "")}\n\n${ansicht}\n`)
        : /\n## /.test(text) ? text.replace(/\n## /, () => `\n${ansicht}\n\n## `) : `${text.replace(/\n*$/, "")}\n\n${ansicht}\n`;
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
      if (o !== wurzel && o.children.length === 0) { try { await wegwerfen(o); } catch (e) {} }
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
  const unsicher = (p) => p.dup || p.art === "Sonstiges" || (["Folien", "Übung", "Tutorium", "Lab", "Lösung"].includes(p.art) && p.nr == null && !p.titel);
  // Eine Datei der Vorschau ändern: ein Fenster „Neu …“ (ctx.formular) mit Art (oder im Eingang lassen), Nummer und Titel;
  // Esc lässt alles, wie es war
  const LASSEN = "im-eingang";
  const korrigieren = async (p) => {
    if (typeof ctx.formular !== "function") return;
    const w = await ctx.formular({ titel: p.st.haupt.name, knopf: "Übernehmen", felder: [
      { name: "art", titel: "Art", art: "auswahl", pflicht: true, optionen: ARTEN.map((a) => ({ wert: a, text: a })).concat([{ wert: LASSEN, text: "Im Eingang lassen" }]),
        vorgabe: p.auslassen ? LASSEN : p.art },
      { name: "nummer", titel: "Nummer", art: "zahl", ganz: true, min: 0, max: 99, vorgabe: p.nr != null ? pad(p.nr) : "", wenn: (x) => x.art !== LASSEN },
      { name: "titel", titel: "Titel", art: "text", vorgabe: p.titel || "", platzhalter: "z. B. Optimierung", wenn: (x) => x.art !== LASSEN },
    ] });
    if (!w) return;
    p.auslassen = w.art === LASSEN;
    if (p.auslassen) return;
    p.art = w.art;
    p.nr = w.nummer;
    p.titel = sauber(w.titel || "");
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

  // Fenster „Details“ nach dem Einordnen: jede Zeile des Ergebnisses (eba-modal wie die Verbindungen)
  const detailsZeigen = (zeilen) => {
    if (!Modal) return;
    const m = new Modal(app);
    m.modalEl.addClass("eba-modal");
    m.titleEl.setText("Unterlagen eingeordnet");
    const liste = m.contentEl.createEl("ul", { cls: "eba-modal-schritte" });
    for (const z of zeilen) liste.createEl("li", { text: z });
    m.contentEl.createDiv({ cls: "modal-button-container" }).createEl("button", { text: "Fertig", cls: "mod-cta" }).addEventListener("click", () => m.close());
    m.open();
  };

  // ---------- Dateien in den Eingang holen ----------
  // Freier Name im Eingang: „Blatt.pdf“, „Blatt 2.pdf“, … („vorhanden“ = Namen in Kleinbuchstaben). Zeichen, die Obsidian in
  // Dateinamen oder Links stören, werden zu Leerzeichen.
  const eingangName = (vorhanden, roh) => {
    const sauber = String(roh || "").normalize("NFC").replace(/[\\/:*?"<>|#^[\]]/g, " ").replace(/\s+/g, " ").trim() || "Datei";
    const p = sauber.lastIndexOf(".");
    const basis = p > 0 ? sauber.slice(0, p).trim() : sauber, endung = p > 0 ? sauber.slice(p) : "";
    let name = basis + endung;
    for (let i = 2; vorhanden.has(name.toLowerCase()); i++) name = `${basis} ${i}${endung}`;
    return name;
  };

  // Gewählte oder hineingezogene Dateien (File aus dem Browser) in den Eingang kopieren; gibt die Zahl zurück
  const ablegenImEingang = async (dateien) => {
    if (!app.vault.getAbstractFileByPath(EINGANG)) await app.vault.createFolder(EINGANG);
    const vorhanden = new Set(alleImEingang().filter((f) => f.parent && f.parent.path === EINGANG).map((f) => f.name.toLowerCase()));
    const fort = ctx.hinweis(`Lege ${dateien.length === 1 ? "eine Datei" : `${dateien.length} Dateien`} in den Eingang …`, { dauer: 0 });
    let n = 0;
    try {
      for (const d of dateien) {
        const name = eingangName(vorhanden, d.name);
        await app.vault.createBinary(`${EINGANG}/${name}`, await d.arrayBuffer());
        vorhanden.add(name.toLowerCase());
        n++;
      }
    } finally { if (fort && fort.hide) fort.hide(); }
    return n;
  };

  // Fenster „Unterlagen hinzufügen“: Dateien auswählen (am PC auch hineinziehen) oder liegen gebliebene Dateien im Eingang
  // einordnen. Ergebnis „gewaehlt“ (Dateien liegen jetzt im Eingang), „eingang“ oder null (abgebrochen).
  // Die Dateiauswahl öffnet input.click() direkt im Klick des Knopfs: iPhone und iPad zeigen sie nur dann (Fotos, Kamera, Dateien).
  const hinzufuegenFenster = (imEingang) => new Promise((fertig) => {
    let ergebnis = null;
    const m = new Modal(app);
    m.modalEl.addClass("eba-modal");
    m.titleEl.setText("Unterlagen hinzufügen");
    const c = m.contentEl;
    c.addClass("eba-ablage");
    c.createEl("p", { cls: "eba-modal-text", text: Platform.isMobile
      ? "PDFs, Folien, Scans oder Fotos auswählen. Studium Autopilot benennt sie und legt sie beim passenden Modul ab."
      : "PDFs, Folien, Scans oder Fotos auswählen oder hierher ziehen. Studium Autopilot benennt sie und legt sie beim passenden Modul ab." });
    const eingabe = c.createEl("input", { cls: "eba-ablage-eingabe", attr: { type: "file", multiple: "", tabindex: "-1", "aria-hidden": "true" } });
    const meldung = c.createEl("p", { cls: "eba-modal-meldung" });
    c.createEl("p", { cls: "eba-modal-hinweis", text: Platform.isMobile
      ? "Aus Mail oder Safari: Teilen → In Dateien sichern → Ordner Eingang deines Tresors."
      : "Du kannst Dateien auch in den Ordner Eingang deines Tresors kopieren." });
    const nehmen = async (liste) => {
      const dateien = Array.from(liste || []).filter((d) => d && d.name && !d.name.startsWith("."));
      if (!dateien.length) return;
      knoepfe.forEach((k) => { k.disabled = true; });
      try {
        await ablegenImEingang(dateien);
        ergebnis = "gewaehlt";
        m.close();
      } catch (e) {
        console.error("[unterlagen] Ablegen im Eingang", e);
        meldung.addClass("fehler");
        meldung.setText("Die Dateien ließen sich nicht ablegen. Versuche es noch einmal.");
        knoepfe.forEach((k) => { k.disabled = false; });
      }
    };
    eingabe.addEventListener("change", () => { nehmen(eingabe.files); });
    c.addEventListener("dragover", (e) => { e.preventDefault(); e.stopPropagation(); c.addClass("is-ziehen"); });
    c.addEventListener("dragleave", (e) => { if (!c.contains(e.relatedTarget)) c.removeClass("is-ziehen"); });
    c.addEventListener("drop", (e) => {
      e.preventDefault(); e.stopPropagation(); c.removeClass("is-ziehen");
      nehmen(e.dataTransfer && e.dataTransfer.files);
    });
    const reihe = c.createDiv({ cls: "modal-button-container" });
    const knoepfe = [];
    const knopf = (text, cta, tun) => {
      const b = reihe.createEl("button", { text, cls: cta ? "mod-cta" : "" });
      b.addEventListener("click", tun);
      knoepfe.push(b);
      return b;
    };
    knopf("Abbrechen", false, () => m.close());
    if (imEingang) {
      knopf(`${imEingang === 1 ? "Eine Datei" : `${imEingang} Dateien`} im Eingang einordnen`, false, () => { ergebnis = "eingang"; m.close(); });
    }
    knopf("Dateien auswählen", true, () => { eingabe.value = ""; eingabe.click(); });
    m.onClose = () => { c.empty(); fertig(ergebnis); };
    m.open();
  });

  // Knopf „Unterlagen hinzufügen“: erst das Fenster, dann einordnen (ohne Fenster, wo es keins gibt, etwa in Tests)
  const hinzufuegen = async () => {
    if (!Modal) return einordnen();
    const imEingang = alleImEingang().filter((f) => !AUSLASSEN.includes(ext(f)) || ARCHIVE.includes(ext(f))).length;
    const w = await hinzufuegenFenster(imEingang);
    if (!w) return { eingeordnet: 0 };
    return einordnen();
  };

  // ---------- Hauptfunktion ----------
  const einordnen = async () => {
    if (!app.vault.getAbstractFileByPath(EINGANG)) await app.vault.createFolder(EINGANG);
    const abbruch = () => { ctx.hinweis("Abgebrochen. Es wurde nichts verändert."); return { eingeordnet: 0 }; };
    const roh = alleImEingang();
    const archive = roh.filter((f) => ARCHIVE.includes(ext(f)));
    const ausgelassen = roh.filter((f) => AUSLASSEN.includes(ext(f)) && !ARCHIVE.includes(ext(f)));
    const stapel = stapeln(roh.filter((f) => !AUSLASSEN.includes(ext(f))));
    const fehlend = ohneBegleitnotiz();

    // 0. Dateien in „Unterlagen/“ ohne Begleitnotiz (abgebrochener Lauf, selbst in einen Modulordner kopiert): ohne Rückfrage
    //    nachtragen (seit 0.6.3). Die Frage danach verstand niemand, und ohne Notiz fehlt die Datei in allen Listen.
    const nachtragen = fehlend.map(nachtragPlan);
    if (!stapel.length && !nachtragen.length) {
      // nur ZIP im Eingang: nicht wegwerfen (noch nicht entpackt), Obsidian kann nicht entpacken
      const zip = archive.length ? `${archive.length === 1 ? "Im Eingang liegt ein ZIP" : `Im Eingang liegen ${archive.length} ZIP-Dateien`}, bitte erst am PC oder in der Dateien-App entpacken und dann noch einmal einordnen.` : "";
      ctx.hinweis(zip || (ausgelassen.length
        ? `Im Eingang liegen nur Notizen (${ausgelassen.length}), die verschiebst du selbst.`
        : "Der Eingang ist leer. Lege PDFs oder Folien in den Ordner „Eingang“."));
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
    let lesen = null; // Hinweis, solange Titel aus PDFs gelesen werden
    try {
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
        // schwacher Titel im Dateinamen („EBWL_1“, „VL_3_Opt_1Var“): Titel von der ersten PDF-Seite, wenn er eindeutig ist
        let titel = st.ausgaben ? titelMitZusatz(code, v.art, v.nr, v.titel, "mit Ausgaben") : v.titel;
        if (v.schwach && ext(h) === "pdf") {
          if (!lesen) lesen = ctx.hinweis("Lese Titel aus den PDFs …", { dauer: 0 });
          titel = titelMitPdf(v.titel, await titelAusPdf(h, { code }));
        }
        const mo = modulOrdnerPlan(modul, code);
        const p = { st, modul, code, art: v.art, nr: v.nr, titel, ordner: mo.pfad, vergleich: mo.alt?.path ?? mo.pfad, eigenerCode };
        if (modus === "einzeln") await korrigieren(p);
        plan.push(p);
      }
    } finally {
      lesen?.hide();
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
    const fortschritt = ctx.hinweis(`Ordne ${arbeit.length} ${arbeit.length === 1 ? "Unterlage" : "Unterlagen"} ein …`, { dauer: 0 });
    let erste = null;

    // 7. Jede Unterlage verarbeiten
    try {
      for (const [i, p] of arbeit.entries()) {
        const st = p.st, h = st.haupt;
        if (fortschritt) fortschritt.setMessage(`Ordne ${i + 1} von ${arbeit.length} ein: ${h.name}`);
        if (p.dup) bericht.duplikate.push(`${h.name} = ${p.dup}`);
        if (p.weg) { for (const f of st.dateien) await wegwerfen(f); continue; }
        if (p.eigenerCode && p.code && p.eigenerCode !== p.code && eba.modulNachCode(p.eigenerCode)) bericht.fremd.push(h.name);
        let ordner = p.ordner, name = p.name, paar = null;
        if (!p.nachtrag) {
          ordner = await modulOrdner(p.modul, p.code);
          if (!app.vault.getAbstractFileByPath(ordner)) await app.vault.createFolder(ordner);
          // Modulordner mit Unterordnern „Vorlesung“/„Übung“ (z. B. B110): Datei nach Art dorthin, sonst in den Modulordner.
          // Tutorium und Lab haben immer ihren eigenen Unterordner (getrennt von Vorlesung und Übung).
          const unter = { Folien: "Vorlesung", Skript: "Vorlesung", Mitschrift: "Vorlesung", Übung: "Übung", Lösung: "Übung", "Eigene Lösung": "Übung" }[p.art];
          if (p.art === "Tutorium" || p.art === "Lab") {
            ordner = `${ordner}/${p.art}`;
            if (!app.vault.getAbstractFileByPath(ordner)) await app.vault.createFolder(ordner);
          } else if (unter && app.vault.getAbstractFileByPath(`${ordner}/${unter}`) instanceof TFolder) ordner = `${ordner}/${unter}`;
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
      if (zipWeg) for (const f of archive) { await wegwerfen(f); bericht.zipPapierkorb++; }
    } finally {
      if (fortschritt) fortschritt.hide();
    }
    await leereOrdnerAufraeumen();

    // 8. Zusammenfassung
    const zeilen = bericht.eingeordnet || !bericht.nachgetragen ? [`${bericht.eingeordnet} ${bericht.eingeordnet === 1 ? "Unterlage" : "Unterlagen"} eingeordnet.`] : [];
    if (bericht.ergaenzt) zeilen.push(`${bericht.ergaenzt} PDF(s) zur vorhandenen PowerPoint abgelegt.`);
    if (bericht.nachgetragen) zeilen.push(`${bericht.nachgetragen === 1 ? "Eine Datei, die schon unter Unterlagen lag, steht" : `${bericht.nachgetragen} Dateien, die schon unter Unterlagen lagen, stehen`} jetzt auch in den Listen.`);
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
    // Ein Satz im Hinweis, die Einzelheiten im Fenster „Details“
    const mehr = zeilen.length - 1;
    if (!mehr) ctx.hinweis(zeilen[0]);
    else ctx.hinweis(`${zeilen[0]} ${mehr === 1 ? "Dazu gibt es einen Hinweis." : `Dazu gibt es ${mehr} Hinweise.`}`, { aktion: { text: "Details", ausfuehren: () => detailsZeigen(zeilen) } });
    return { ...bericht, erste };
  };

  return {
    hinzufuegen, einordnen, eingangName, nummerErkennen, titelErkennen, zielName, titelMitZusatz, codeAusName, akzenteReparieren, vorschlag, ohneBegleitnotiz, EINGANG, ZIEL,
    // für die ILIAS-Ablage (ilias.js) und Tests
    schwacherTitel, titelAusPdf, pdfTitelWaehlen, titelMitPdf, vorschlagMitPdf, begleitnotiz, ARTEN, stapeln,
  };
};
