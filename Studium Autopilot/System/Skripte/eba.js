// Gemeinsame Helfer für die Aktionen und Skripte des Vaults.
// Aufruf in einer Aktion:  const eba = ctx.user.eba(ctx);   (ctx = Kontext des Plugins „Studium Autopilot“)
// Ohne Aufruf nutzbar (z. B. in Erweiterungen):  ctx.user.eba.MODULCODE, ctx.user.eba.codeImText(text),
//   ctx.user.eba.eigenerAbgleich(existiert, einstellungen), ctx.user.eba.quelleExtern(schluessel, existiert, einstellungen),
//   ctx.user.eba.quellenExtern(existiert, einstellungen), ctx.user.eba.QUELLEN, ctx.user.eba.dateiTitel(titel)
// Je Aktionsaufruf liefert ctx: ctx.datei (leere Notiz, die befüllt wird – Ordner-Automatik – sonst null),
// ctx.parameter (Werte aus dem Knopf, z. B. { code: "B110" }) und ctx.quelle (Notiz, in der der Knopf steht).

// Einheitliches Muster für Modulcodes (gilt für alle Skripte und Vorlagen, nur hier ändern):
// 1–4 Großbuchstaben, dann 3 Stellen (die erste eine Ziffer, danach Ziffern oder X als Platzhalter für Wahlbereiche),
// optional ein Großbuchstabe für Teilmodule. Beispiele: B110, SQ100, SQ888, DS320, BA302, B3X1, E371A.
// Als Text ohne Klammern und Anker, damit jedes Skript es in seinen eigenen regulären Ausdruck einbauen kann.
const MODULCODE = "[A-Z]{1,4}[0-9][0-9X]{2}[A-Z]?";
// Erster Modulcode in einem freien Text („Klausur B110“, „SQ100-Kurs“), sonst null.
const MODULCODE_IM_TEXT = new RegExp("(?:^|[^A-Z0-9])(" + MODULCODE + ")(?=[^A-Z0-9]|$)");
const codeImText = (text) => { const m = String(text ?? "").match(MODULCODE_IM_TEXT); return m ? m[1] : null; };
// Titel → Dateiname, eine Regel für alle Notizen, die das Plugin benennt (eba.ablegen, zentrale Termine in zentral.js): Emojis
// samt Bausteinen weg (sonst stehen sie in Tab, Kopfzeile und Suche), „: “ wird „ – “ (UB-Kurs: Zotero → UB-Kurs – Zotero),
// Zeichen, die Windows, iOS oder Links stören, werden „-“ (WS 2026/27 → WS 2026-27), Leerraum einfach, keine Punkte oder
// Leerzeichen am Ende (Windows).
// Bausteine (Variantenwähler, Verbinder, Tastenkappe) als Alternativen, nicht in der Zeichenklasse (sonst falsch zerlegt)
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2300}-\u{23FF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{E0020}-\u{E007F}]|\u{FE0E}|\u{FE0F}|\u{200D}|\u{20E3}/gu;
const dateiTitel = (text) => String(text ?? "").replace(EMOJI, "").replace(/\s*:\s+/g, " – ").replace(/[\\/:*?"<>|#^\[\]]/g, "-")
  .replace(/\s+/g, " ").trim().replace(/[. ]+$/, "");
// Eigener Uni-Abgleich: Liegt System/Skripte/abgleich.js im Tresor oder steht „ilias_unterlagen: extern“ in den Einstellungen,
// bringt ein eigener Abgleich (bzw. ein eigener Server) Daten selbst. Welche, sagt quelleExtern. existiert(pfad) → bool,
// einstellungen = Frontmatter von System/Einstellungen.md.
const EIGENER_ABGLEICH = "System/Skripte/abgleich.js";
const eigenerAbgleich = (existiert, einstellungen) => {
  try { return !!existiert(EIGENER_ABGLEICH) || String((einstellungen || {}).ilias_unterlagen ?? "").trim().toLowerCase() === "extern"; } catch (e) { return false; }
};
// Quellen außerhalb des Plugins (seit 0.4.5): Was ein eigener Abgleich oder Server bringt, holt das Plugin nicht noch einmal
// (nie zwei Schreiber je Quelle). Jede Funktion fragt bei jedem Lauf quelleExtern(<Schlüssel>, existiert, einstellungen).
//   stundenplan     zentraler Stundenplan (zentral.js) und Alma-Stundenplan (verbindungen.js)
//   ilias-dateien   Downloads aus ILIAS (ilias.js)          ilias-gruppen  Übungsgruppen aus ILIAS (ilias.js)
//   ilias-kalender  Abgaben aus dem ILIAS-Kalender          alma-konto     Noten und Prüfungsanmeldungen aus Alma
//   volltext        Textfassungen der PDFs
// Steht „quellen_extern“ (Liste) in System/Einstellungen.md, entscheidet sie, auch leer; unbekannte Einträge zählen nicht,
// „quellen_extern:“ ohne Wert gilt als nicht gesetzt. Ohne Liste gilt beim eigenen Uni-Abgleich alles außer „ilias-gruppen“
// als extern (die Übungsgruppen prüft dort das Plugin selbst), sonst nichts.
const QUELLEN = Object.freeze(["stundenplan", "ilias-dateien", "ilias-gruppen", "ilias-kalender", "alma-konto", "volltext"]);
// quellenExtern → Schlüssel in der Reihenfolge von QUELLEN; Fehler beim Lesen → keiner (wie eigenerAbgleich).
const quellenExtern = (existiert, einstellungen) => {
  try {
    const v = (einstellungen || {}).quellen_extern;
    const liste = Array.isArray(v) ? v : typeof v === "string" && v.trim() ? v.split(",") : null;
    if (liste) {
      const gesetzt = liste.map((x) => String(x ?? "").trim().toLowerCase());
      return QUELLEN.filter((q) => gesetzt.indexOf(q) >= 0);
    }
    return eigenerAbgleich(existiert, einstellungen) ? QUELLEN.filter((q) => q !== "ilias-gruppen") : [];
  } catch (e) { return []; }
};
const quelleExtern = (schluessel, existiert, einstellungen) => quellenExtern(existiert, einstellungen).indexOf(String(schluessel)) >= 0;

module.exports = function (ctx) {
  const app = window.app;
  const heute = ctx.date.now("YYYY-MM-DD");
  const sauber = dateiTitel; // Titel → Dateiname (eine Regel, oben)
  const J = (v) => JSON.stringify(v ?? "");
  const CURSOR = ctx.CURSOR || "\uE000"; // Cursor-Position im Inhalt für ablegen()
  // Zu befüllende Notiz (Ordner-Automatik: in Vorlesungen/ usw. neu angelegt) oder null (Knopf/Befehl: neue Datei)
  const datei = ctx.datei || null;
  const titel = datei ? datei.basename : "";
  const neu = !datei || /(^|\s)(Unbenannt|Untitled)( \d+)?$/.test(titel);

  // Vorgewählter Modulcode: aus dem Knopf (…&code=B110) oder aus dem Dateinamen („B110 Unbenannt“)
  const codeAusTitel = () => {
    const v = String((ctx.parameter && ctx.parameter.code) || "").trim().toUpperCase();
    if (v && new RegExp("^" + MODULCODE + "$").test(v)) return v;
    const m = titel.match(new RegExp("^(" + MODULCODE + ")\\s"));
    return m ? m[1] : null;
  };

  // Aktuelles Fachsemester aus System/Einstellungen.md
  const einstellungen = () => {
    const f = app.vault.getAbstractFileByPath("System/Einstellungen.md");
    return (f && app.metadataCache.getFileCache(f)?.frontmatter) || {};
  };
  // Vor dem Beginn der Liste gilt das erste Semester, nach ihrem Ende das letzte.
  // Ohne `semesterliste` in den Einstellungen: 1. Fachsemester, Name aus dem heutigen Datum
  // (Wintersemester 1.10.–31.3., Sommersemester 1.4.–30.9.), z. B. „WS 2026/27“ oder „SS 2027“.
  const semesterAusDatum = (iso) => {
    const j = Number(iso.slice(0, 4)), mo = Number(iso.slice(5, 7));
    if (mo >= 4 && mo <= 9) return `SS ${j}`;
    const beginn = mo >= 10 ? j : j - 1;
    return `WS ${beginn}/${String(beginn + 1).slice(-2)}`;
  };
  // Mit Datenmodell (System/Skripte/modell.js): persönliche Semesterliste aus Studienbeginn + zentralen Semesterdaten.
  const modell = () => (ctx.modell && ctx.modell.daten ? ctx.modell.daten() : null);
  // Persönliches Semester, in dem ein Datum liegt, als Zeile [fs, name, beginn, ende, vb, ve] (wie die semesterliste)
  const semesterZeile = (iso) => {
    const m = modell();
    if (m) { const s = m.semesterliste.find((x) => x.beginn <= iso && x.ende >= iso); return s ? [String(s.fs), s.name, s.beginn, s.ende, s.vb, s.ve] : null; }
    return (einstellungen().semesterliste || []).map((s) => String(s).split("|")).find((s) => s[2] <= iso && s[3] >= iso) || null;
  };
  const aktuellesSemester = () => {
    const m = modell();
    if (m && m.aktuell) return { fs: m.aktuell.fs || 1, name: m.aktuell.name };
    const liste = (einstellungen().semesterliste || []).map((s) => String(s).split("|"));
    const z = liste.find((s) => s[2] <= heute && s[3] >= heute)
      || liste.find((s) => s[2] > heute)
      || liste[liste.length - 1]
      || ["1", semesterAusDatum(heute)];
    return { fs: Number(z[0]) || 1, name: z[1] || semesterAusDatum(heute) };
  };

  const alleModule = () => app.vault.getMarkdownFiles()
    .filter((f) => f.path.startsWith("Module/"))
    .map((f) => ({ f, fm: app.metadataCache.getFileCache(f)?.frontmatter ?? {} }))
    .filter((x) => x.fm.typ === "modul");

  const modulNachCode = (code) => alleModule().find((x) => x.fm.code === code) || null;

  // Feld „Modul“ für das Fenster „Neu …“ (ctx.formular): oben eine gerade laufende Lehrveranstaltung („Läuft gerade“), dann die
  // Module deines Plans im aktuellen Semester und laufende/angemeldete („Dieses Semester“, ctx.modell.imPlan und modulSemester wie
  // Studienverlauf und Zeitleiste), dann alle übrigen. Vorgabe: das Modul aus dem Knopf (code) bzw. Dateinamen, sonst die laufende
  // Lehrveranstaltung, sonst (Pflicht) das erste Modul dieses Semesters. o = { titel, optional, laufend, vorgabe }; Wert: das
  // Modul ({ f, fm }), die laufende Lehrveranstaltung (jetztLaufend) oder null (ohne Modul).
  const modulFeld = (o = {}) => {
    const sem = aktuellesSemester().name, M = ctx.modell;
    const wichtig = (x) => ["läuft", "angemeldet"].includes(x.fm.status) || (!!M && M.imPlan(x.fm) && M.modulSemester(x.fm) === sem);
    const ms = alleModule().sort((a, b) => (wichtig(b) - wichtig(a)) || String(a.fm.code).localeCompare(String(b.fm.code)));
    const optionen = [];
    const laufend = o.laufend || null;
    if (laufend) optionen.push({ wert: laufend, text: laufend.modul ? `${laufend.fm.code} · ${laufend.fm.titel}` : laufend.titel, gruppe: "Läuft gerade" });
    if (o.optional) optionen.push({ wert: null, text: "Ohne Modul", gruppe: laufend ? "Ohne Modul" : "" });
    for (const x of ms) optionen.push({ wert: x, text: `${x.fm.code} · ${x.fm.titel}`, gruppe: wichtig(x) ? "Dieses Semester" : "Alle Module" });
    const vorwahl = codeAusTitel();
    const vorgabe = o.vorgabe !== undefined ? o.vorgabe : (vorwahl && modulNachCode(vorwahl) && ms.find((x) => x.fm.code === vorwahl))
      || laufend || (o.optional ? null : ms.find(wichtig) || ms[0] || null);
    // waehlen(code): die Option zu einem Modulcode (für Vorgaben, die anderen Feldern folgen; die Auswahl vergleicht Werte genau)
    const waehlen = (code) => (code && ms.find((x) => x.fm.code === code)) || null;
    return { name: "modul", titel: o.titel || "Modul", art: "auswahl", optionen, vorgabe, waehlen, pflicht: !o.optional, fehlt: "Bitte ein Modul wählen." };
  };

  // Gerade laufende Veranstaltung (heute, 30 min vor Beginn bis 15 min nach Ende): Lehrveranstaltungen aus dem Stundenplan
  // und Termine, deren „ort“ eine Uhrzeit trägt („14:00–16:00 · HS 10“, „Mo–Mi 9:15–12:00 · …“, nur Beginn = 90 min;
  // ohne Fristen und Prüfungen, z. B. Vorkurs und Einführungsveranstaltungen). Bei Überlappung gewinnt, was gerade läuft,
  // sonst der nächstliegende Beginn. Rückgabe: das Modul ({ f, fm }, bei Terminen ohne Modul f = null) mit „modul“ (Modul
  // oder null), „quelle“ (Datei der Lehrveranstaltung bzw. des Termins), „lv“ (deren Frontmatter), „titel“, „dozent“ und
  // „eindeutig“ (nur ein Treffer, oder nur einer läuft gerade): Dann fragt die Vorlage „Vorlesung“ gar nicht erst.
  // „jetzt“ nur zum Testen.
  const zuMin = (s) => { const m = String(s || "").match(/^(\d{1,2}):(\d{2})/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  const terminZeit = (ort) => {
    const s = String(ort ?? "").trim();
    let m = s.match(/(\d{1,2})[:.](\d{2})\s*[–-]\s*(\d{1,2})[:.](\d{2})/);
    if (m) return { b: Number(m[1]) * 60 + Number(m[2]), e: Number(m[3]) * 60 + Number(m[4]) };
    m = s.match(/^(?:[A-Z][a-z](?:[–-][A-Z][a-z])?\s+)?(\d{1,2})[:.](\d{2})(?!\s*[–-])/);
    return m ? { b: Number(m[1]) * 60 + Number(m[2]), e: Number(m[1]) * 60 + Number(m[2]) + 90 } : null;
  };
  const jetztLaufend = (jetzt = new Date()) => {
    const tag = `${jetzt.getFullYear()}-${String(jetzt.getMonth() + 1).padStart(2, "0")}-${String(jetzt.getDate()).padStart(2, "0")}`;
    const wt = ((jetzt.getDay() + 6) % 7) + 1, min = jetzt.getHours() * 60 + jetzt.getMinutes();
    const kandidaten = [];
    for (const f of app.vault.getMarkdownFiles()) {
      const fm = app.metadataCache.getFileCache(f)?.frontmatter;
      if (fm?.typ === "lehrveranstaltung" && f.path.startsWith("Stundenplan/")) {
        if (Number(fm.wochentag) !== wt || (fm.von && String(fm.von) > tag) || (fm.bis && String(fm.bis) < tag)
          || (Array.isArray(fm.ausfall) && fm.ausfall.map(String).includes(tag))) continue;
        const b = zuMin(fm.beginn), m = fm.code && modulNachCode(fm.code);
        if (b == null || !m) continue;
        kandidaten.push({ f, fm, m, b, e: zuMin(fm.ende) ?? b + 90 });
      } else if (fm?.typ === "termin" && !["Frist", "Prüfung"].includes(fm.kategorie)) {
        const von = String(fm.datum ?? "").slice(0, 10), bis = String(fm.bis ?? "").slice(0, 10) || von;
        const z = terminZeit(fm.ort);
        if (!von || von > tag || bis < tag || !z) continue;
        kandidaten.push({ f, fm, m: (fm.code && modulNachCode(fm.code)) || null, b: z.b, e: z.e });
      }
    }
    const laeuft = (k) => k.b <= min && min <= k.e;
    const treffer = kandidaten.filter((k) => min >= k.b - 30 && min <= k.e + 15)
      .sort((a, b) => (laeuft(b) - laeuft(a)) || (Math.abs(a.b - min) - Math.abs(b.b - min)) || (a.b - b.b)
        || ((b.fm.typ === "lehrveranstaltung") - (a.fm.typ === "lehrveranstaltung")));
    const k = treffer[0];
    if (!k) return null;
    return {
      f: k.m?.f ?? null, fm: k.m?.fm ?? {}, modul: k.m, quelle: k.f, lv: k.fm,
      titel: String(k.fm.titel || k.f.basename).replace(/\s+/g, " ").trim(), dozent: String(k.fm.dozent ?? "").trim(),
      eindeutig: treffer.length === 1 || (laeuft(k) && !treffer.slice(1).some(laeuft)),
    };
  };

  // Vorlesungsnotiz von heute zu derselben Veranstaltung (Feld „veranstaltung“), sonst null
  const heutigeNotiz = (quelle) => app.vault.getMarkdownFiles().find((f) => {
    const fm = app.metadataCache.getFileCache(f)?.frontmatter;
    if (fm?.typ !== "vorlesung" || String(fm.datum ?? "").slice(0, 10) !== heute || !fm.veranstaltung) return false;
    const ziel = String(fm.veranstaltung).replace(/^\[\[|\]\]$/g, "").split("|")[0];
    return app.metadataCache.getFirstLinkpathDest(ziel, f.path)?.path === quelle.path;
  }) || null;

  // Nächste Vorlesungsnummer eines Moduls im aktuellen Semester
  const naechsteVlNr = (code) => {
    const sem = semesterZeile(heute);
    const nummern = app.vault.getMarkdownFiles().map((f) => app.metadataCache.getFileCache(f)?.frontmatter || {})
      .filter((fm) => fm.typ === "vorlesung" && fm.code === code && (!sem || (String(fm.datum) >= sem[2] && String(fm.datum) <= sem[3])))
      .map((fm) => Number(fm.nummer) || 0);
    return (nummern.length ? Math.max(nummern.length, ...nummern) : 0) + 1;
  };

  // Folien-PDF zur Vorlesung (Dateiname ohne [[ ]]): gleiche Nummer; sonst die Folien der zuletzt angelegten
  // Vorlesungsnotiz desselben Moduls im selben Semester; sonst die Folien mit der kleinsten Nummer.
  const folienZu = (code, nr) => {
    const ohneKlammern = (s) => String(s).replace(/^\[\[|\]\]$/g, "");
    const alleFm = app.vault.getMarkdownFiles().map((f) => ({ f, fm: app.metadataCache.getFileCache(f)?.frontmatter || {} }));
    const alle = alleFm.map((x) => x.fm).filter((fm) => fm.typ === "unterlage" && fm.code === code && fm.art === "Folien" && fm.datei);
    const gleich = alle.find((fm) => Number(fm.nummer) === nr);
    if (gleich) return ohneKlammern(gleich.datei);
    const sem = semesterZeile(heute);
    const vorige = alleFm
      .filter((x) => x.fm.typ === "vorlesung" && x.fm.code === code && x.fm.folien
        && (!sem || (String(x.fm.datum ?? "") >= sem[2] && String(x.fm.datum ?? "") <= sem[3])))
      .sort((a, b) => String(b.fm.datum ?? "").localeCompare(String(a.fm.datum ?? ""))
        || (Number(b.fm.nummer) || 0) - (Number(a.fm.nummer) || 0)
        || (b.f.stat.ctime - a.f.stat.ctime))[0];
    if (vorige) return ohneKlammern(vorige.fm.folien);
    const nrSort = (fm) => (Number.isFinite(Number(fm.nummer)) && fm.nummer !== "" && fm.nummer != null ? Number(fm.nummer) : Infinity);
    const kleinste = [...alle].sort((a, b) => (nrSort(a) - nrSort(b)) || String(a.datum ?? "").localeCompare(String(b.datum ?? "")))[0];
    return kleinste ? ohneKlammern(kleinste.datei) : "";
  };

  // Ein Datum lesen: „15.10“, „15.10.“, „15.10.26“, „15.10.2026“, „2026-10-15“, „+7“ (Tage ab heute).
  // Eine angehängte Uhrzeit („15.10. 14:00“, „15.10 14 Uhr“) wird ignoriert. Ungültige Daten (31.02.) → "".
  // Ohne Jahr: ctx.modell.zeit.jahrRaten (liegt das Datum mehr als 60 Tage zurück, gilt das nächste Jahr). „ab“ (ISO, Beginn
  // eines Zeitraums): das Ende ist das erste Vorkommen ab dem Beginn (28.12.–07.01.).
  const datumLesen = (s, ab = "") => {
    s = String(s ?? "").trim();
    if (/^\+\d+$/.test(s)) return ctx.date.now("YYYY-MM-DD", Number(s.slice(1)));
    const uhr = "(?:,?\\s+(?:um\\s+)?\\d{1,2}(?:[:.]\\d{2})?(?:\\s*[-–]\\s*\\d{1,2}(?:[:.]\\d{2})?)?\\s*(?:Uhr|h)?)?";
    const gueltig = (j, mo, t) => { const d = new Date(j, mo - 1, t); return d.getFullYear() === j && d.getMonth() === mo - 1 && d.getDate() === t; };
    const iso = (j, mo, t) => `${j}-${String(mo).padStart(2, "0")}-${String(t).padStart(2, "0")}`;
    let m = s.match(new RegExp("^(\\d{4})-(\\d{2})-(\\d{2})" + uhr + "$", "i"));
    if (m) return gueltig(Number(m[1]), Number(m[2]), Number(m[3])) ? `${m[1]}-${m[2]}-${m[3]}` : "";
    m = s.match(new RegExp("^(\\d{1,2})\\.(\\d{1,2})(?:\\.(\\d{4}|\\d{2})?)?" + uhr + "$", "i"));
    if (!m) return "";
    const t = Number(m[1]), mo = Number(m[2]);
    if (!m[3]) return ctx.modell.zeit.jahrRaten(t, mo, { ab });
    const j = Number(m[3].length === 2 ? "20" + m[3] : m[3]);
    return gueltig(j, mo, t) ? iso(j, mo, t) : "";
  };

  // Zeitraum lesen: „12.11.“, „12.11.–15.11.“, „12.11. bis 15.11.“, „2026-11-12“, „+7“ → { von, bis } (bis "" bei einem Tag),
  // nicht erkannt → null. „15.10. 14–16 Uhr“: ein zweiter Teil, der nur eine Uhrzeit ist, ist kein Ende des Zeitraums.
  const zeitraumLesen = (roh) => {
    const t = String(roh ?? "").trim();
    if (!t) return null;
    const teile = t.replace(/^(\d{1,2}\.\d{1,2}\.?(?:\d{4}|\d{2})?)\s*-\s*(?=\d)/, "$1–").split(/\s*(?:–|—|\sbis\s|\s-\s)\s*/);
    const zweiter = teile[1] && !/^\d{1,2}(?::\d{2})?\s*(?:Uhr|h)?$|^\d{1,2}\.\d{2}\s*(?:Uhr|h)$/i.test(teile[1]) ? teile[1] : "";
    const von = datumLesen(teile[0]), bis = zweiter ? datumLesen(zweiter, von) : "";
    return von && (!zweiter || bis) ? { von, bis: bis && bis > von ? bis : "" } : null;
  };

  const link = (m) => (m ? `[[${m.f.basename}]]` : "");

  // Notiz mit Inhalt ablegen und öffnen. Ohne ctx.datei: neue Datei „<ordner>/<basis>.md“ (bei Namensgleichheit „… 2“).
  // Mit ctx.datei (leere Notiz der Ordner-Automatik): Inhalt hineinschreiben und – nur bei „Unbenannt“ – umbenennen und
  // verschieben. CURSOR im Inhalt markiert die Stelle, an der danach der Cursor steht. Rückgabe: die Datei.
  const ablegen = async (ordner, basis, inhalt) => {
    let text = String(inhalt ?? "");
    let cursor = null;
    const pos = text.indexOf(CURSOR);
    if (pos >= 0) {
      const vor = text.slice(0, pos).split("\n");
      cursor = { line: vor.length - 1, ch: vor[vor.length - 1].length };
      text = text.slice(0, pos) + text.slice(pos + CURSOR.length);
    }
    let f = datei;
    if (f && !neu) {
      await app.vault.modify(f, text);
      ctx.hinweis("Vorlage eingefügt. Die Notiz behält Namen und Ort.");
    } else {
      if (!app.vault.getAbstractFileByPath(ordner)) { try { await app.vault.createFolder(ordner); } catch (e) { /* gibt es schon */ } }
      let name = sauber(basis), i = 2;
      while (app.vault.getAbstractFileByPath(`${ordner}/${name}.md`) && app.vault.getAbstractFileByPath(`${ordner}/${name}.md`) !== f) name = `${sauber(basis)} ${i++}`;
      const ziel = `${ordner}/${name}.md`;
      if (f) { await app.vault.modify(f, text); if (f.path !== ziel) await app.fileManager.renameFile(f, ziel); }
      else f = await app.vault.create(ziel, text);
    }
    if (ctx.oeffnen) await ctx.oeffnen(f, { cursor });
    return f;
  };

  // Abbruch im Fenster „Neu …“ (Esc, ×, „Abbrechen“): Es entsteht nichts. Nur bei der Ordner-Automatik gibt es schon eine
  // (leere) Notiz: die wird wieder gelöscht, mit Hinweis (sonst bliebe unklar, wohin sie ist). Danach in der Aktion „return“.
  const abbrechen = () => {
    if (!datei) return;
    setTimeout(async () => {
      try { if (!(await app.vault.read(datei)).trim()) await app.vault.delete(datei); } catch (e) { /* schon weg */ }
    }, 400);
    ctx.hinweis("Abgebrochen, es ist nichts entstanden.", { dauer: 3000 });
  };

  return { app, heute, sauber, J, neu, datei, CURSOR, MODULCODE, codeImText, codeAusTitel, einstellungen, modell, semesterZeile, aktuellesSemester, alleModule, modulNachCode, modulFeld, link, ablegen, jetztLaufend, heutigeNotiz, naechsteVlNr, folienZu, zeitraumLesen, datumLesen, abbrechen };
};
module.exports.MODULCODE = MODULCODE;
module.exports.codeImText = codeImText;
module.exports.dateiTitel = dateiTitel;
module.exports.eigenerAbgleich = eigenerAbgleich;
module.exports.QUELLEN = QUELLEN;
module.exports.quellenExtern = quellenExtern;
module.exports.quelleExtern = quelleExtern;
