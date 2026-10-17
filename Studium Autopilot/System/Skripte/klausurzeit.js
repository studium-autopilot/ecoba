// Zeitleiste der Prüfungszeit oben auf der Seite Prüfungen: Codeblock ```eba-klausurzeit``` (zurückhaltende Visualisierung
// der Prüfungstermine). Oben eine Übersicht von heute bis zum Ende der nächsten zwei Prüfungsphasen (Anmeldung als Band, Phasen als Band,
// gestrichelt = geschätzt, Klausuren und Zwischentests als Punkte, heute als Linie). Darunter je Phase ein Tagesstreifen
// mit den Klausuren am Datum (Kürzel, Wochentag, Datum, Countdown bis 30 Tage, bestanden mit Note), Anmeldezeitraum und
// „Termin folgt“ (nur Module ohne Klausurtermin im Modul und ohne Prüfungs-Termin-Notiz in einer Phase). Ersetzt die Chip-Reihe
// „Prüfungen“ (zeigt alles, was die Chips zeigten). Jeder Eintrag öffnet seine Notiz (Termin-Notiz, sonst das Modul).
// Daten live (metadataCache, schreibt nichts): Module des aktuellen Fachsemesters wie die Chips (Feld `klausur`),
// Termin-Notizen (Kategorie Prüfung mit `code`; Frist „Prüfungsanmeldung …“), Phasen und Semester aus dem Datenmodell
// (modell.js, sonst Einstellungen), `variante`. Neu gezeichnet bei Änderungen, Löschen, Umbenennen und an einem neuen Tag.
// Erweiterung: Codeblock und Ereignisse über ctx.codeblock/ctx.an (Hot-Reload ohne Neustart).
// Stil: eba-core.css Abschnitt 37, Klassen eba-kzt-*.
module.exports = function (ctx) {
  const app = window.app;
  const basis = ctx; // zeichnen(el, ctx) überdeckt ctx mit dem Markdown-Kontext
  const SPRACHE = "eba-klausurzeit";
  const KURZTAG = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  const MONAT = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
  const TAG = 86400000;

  const pad = (n) => String(n).padStart(2, "0");
  const datum = (v) => { const m = String(v ?? "").match(/(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
  const tage = (a, b) => Math.round((b - a) / TAG);
  const tm = (d) => `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`;
  const tmj = (d) => `${tm(d)}${d.getFullYear()}`;
  const wt = (d) => `${KURZTAG[d.getDay()]} ${tm(d)}`;
  const st = (v) => String(v ?? "").toLowerCase().trim();
  const fertig = (s) => ["bestanden", "anerkannt"].includes(st(s));
  const rel = (n) => (n === 0 ? "heute" : n === 1 ? "morgen" : n > 1 ? `in ${n} Tagen` : "vorbei");

  const lesen = (heute) => {
    const fm = (p) => app.metadataCache.getFileCache(app.vault.getAbstractFileByPath(p) || { path: "" })?.frontmatter || {};
    const ein = fm("System/Einstellungen.md");
    // Aktuelles Fachsemester und Module wie die frühere Chip-Formel (Seite Prüfungen, Bases)
    // Datenmodell (modell.js): Fachsemester und Prüfungsphasen aus Studienbeginn + zentralen Semesterdaten
    const md = ctx.modell && ctx.modell.daten ? ctx.modell.daten() : null;
    let fs = 1;
    if (md) fs = md.vorStart ? 1 : md.fachsemester;
    else for (const z of ein.semesterliste || []) { const t = String(z).split("|"); if (datum(t[2]) <= heute && datum(t[3]) >= heute) { fs = +t[0]; break; } }
    const variante = String(ein.variante ?? "");
    // Empfohlenes Fachsemester je Modul aus dem Musterplan der gewählten Variante (Datenmodell), sonst das Feld fachsemester
    const fsVon = {};
    if (md) for (const x of md.module) fsVon[x.f.path] = x.fsEmpfohlen;
    const module = [], termine = [];
    for (const f of app.vault.getMarkdownFiles()) {
      const m = app.metadataCache.getFileCache(f)?.frontmatter;
      if (!m) continue;
      if (m.typ === "modul") {
        const pflicht = m.gruppe === "Grundstudium" || m.gruppe === "Abschluss" || m.gewaehlt === true ||
          (variante === "Economics" && m.rolle_economics === "Pflicht") || (variante === "Business Administration" && m.rolle_ba === "Pflicht");
        const empf = f.path in fsVon ? fsVon[f.path] : +m.fachsemester;
        if (pflicht && (empf === fs || ["läuft", "angemeldet"].includes(st(m.status))))
          module.push({ f, code: String(m.code || f.basename.split(" ")[0]), datum: datum(m.klausur), fertig: fertig(m.status), ergebnis: String(m.ergebnis ?? "").trim() });
      } else if (m.typ === "termin" && m.erledigt !== true) {
        termine.push({ f, titel: String(m.titel || f.basename), kat: String(m.kategorie ?? ""), code: String(m.code ?? "").trim(),
          von: datum(m.datum), bis: datum(m.bis), geschaetzt: st(m.status) === "geschätzt" });
      }
    }
    module.sort((a, b) => a.code.localeCompare(b.code));
    // Nächste zwei Prüfungsphasen, die noch nicht vorbei sind
    const phasenRoh = md ? md.pruefungsphasen.map((p) => [p.von, p.bis, p.art, p.status]) : (ein.pruefungsphasen || []).map((z) => String(z).split("|"));
    const phasen = phasenRoh.map((t) => ({ von: datum(t[0]), bis: datum(t[1]), art: (t[2] || "Prüfungsphase").trim(), geschaetzt: st(t[3]) === "geschätzt" }))
      .filter((p) => p.von && p.bis && p.bis >= heute).sort((a, b) => a.von - b.von).slice(0, 2);
    const anmeldungen = termine.filter((t) => t.von && /Prüfungsanmeldung/.test(t.titel) && (t.bis || t.von) >= heute).sort((a, b) => a.von - b.von);
    // Prüfungen: Termin-Notizen (Prüfung mit Kürzel, eintägig) und Modulklausuren. Kürzel + Tag zählen nur einmal; die
    // Termin-Notiz gewinnt (Ort, „geschätzt“), „bestanden“ und Ergebnis kommen vom Modul (docs/architektur.md „Nächste Prüfung“)
    const pruef = [], nachTag = new Map();
    for (const t of termine) {
      if (t.kat !== "Prüfung" || !t.code || !t.von || t.bis || nachTag.has(t.code + tmj(t.von))) continue;
      const k = { code: t.code, d: t.von, f: t.f, fertig: false, ergebnis: "", geschaetzt: t.geschaetzt, termin: true, titel: t.titel };
      nachTag.set(t.code + tmj(t.von), k);
      pruef.push(k);
    }
    for (const m of module) if (m.datum) {
      const k = nachTag.get(m.code + tmj(m.datum));
      if (k) Object.assign(k, { fertig: m.fertig, ergebnis: m.ergebnis, modul: true });
      else pruef.push({ code: m.code, d: m.datum, f: m.f, fertig: m.fertig, ergebnis: m.ergebnis, geschaetzt: false, modul: true });
    }
    pruef.sort((a, b) => a.d - b.d || a.code.localeCompare(b.code));
    return { module, phasen, anmeldungen, pruef };
  };

  const zeichnen = (el, ctx) => {
    const jetzt = basis.date.jetzt(), heute = new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate());
    const { module, phasen, anmeldungen, pruef } = lesen(heute);
    const oeffnen = (knoten, f) => {
      knoten.addEventListener("mousedown", (e) => e.stopPropagation()); // Bearbeitungsansicht: nicht in den Quelltext springen
      knoten.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); app.workspace.openLinkText(f.path, ctx?.sourcePath || "", e.ctrlKey || e.metaKey); });
    };
    const link = (eltern, f, cls, text) => { const a = eltern.createEl("a", { cls: `internal-link ${cls}`, text, href: f.path, attr: { "data-href": f.path } }); oeffnen(a, f); return a; };
    const inPhase = (d) => phasen.find((p) => d >= p.von && d <= p.bis);

    el.empty();
    el.addClass("eba-klausurzeit");

    // --- Übersicht: vom Monatsanfang bis kurz nach der letzten Phase ---
    if (phasen.length) {
      const a = new Date(heute.getFullYear(), heute.getMonth(), 1);
      const e = new Date(phasen[phasen.length - 1].bis.getTime() + 6 * TAG);
      const span = tage(a, e) + 1;
      const x = (d) => Math.max(0, Math.min(100, (tage(a, d) / span) * 100));
      const breite = (von, bis) => Math.max(1.2, ((tage(von, bis) + 1) / span) * 100);
      const ue = el.createDiv({ cls: "eba-kzt-ueber" });
      const monate = ue.createDiv({ cls: "eba-kzt-monate" });
      for (let d = new Date(a); d <= e; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
        if (x(d) > 94) break;
        monate.createSpan({ text: MONAT[d.getMonth()] + (d.getMonth() === 0 ? ` ${String(d.getFullYear()).slice(2)}` : "") }).style.left = x(d) + "%";
      }
      const bahnA = ue.createDiv({ cls: "eba-kzt-bahn anm" });
      for (const t of anmeldungen) {
        if (t.von > e) continue;
        const b = bahnA.createEl("i", { attr: { title: `${t.titel}: ${tm(t.von)} – ${tmj(t.bis || t.von)}` } });
        b.style.left = x(t.von) + "%"; b.style.width = breite(t.von, t.bis || t.von) + "%";
        if (t.geschaetzt) b.addClass("geschaetzt");
      }
      const bahnP = ue.createDiv({ cls: "eba-kzt-bahn pr" });
      for (const p of phasen) {
        const b = bahnP.createEl("i", { cls: p.geschaetzt ? "geschaetzt" : "", attr: { title: `${p.art}: ${tm(p.von)} – ${tmj(p.bis)}${p.geschaetzt ? " (geschätzt)" : ""}` } });
        b.style.left = x(p.von) + "%"; b.style.width = breite(p.von, p.bis) + "%";
      }
      for (const k of pruef) {
        if (k.d < a || k.d > e) continue;
        const p = bahnP.createEl("b", { cls: k.fertig ? "ok" : k.d < heute ? "vorbei" : inPhase(k.d) ? "" : "einzeln", attr: { title: `${k.code} ${wt(k.d)}` } });
        p.style.left = x(k.d) + "%";
      }
      const h = ue.createDiv({ cls: "eba-kzt-heute" });
      h.style.left = x(heute) + "%";
      h.createSpan({ text: "heute" });
      const leg = el.createDiv({ cls: "eba-kzt-legende" });
      leg.createSpan({ cls: "anm", text: "Anmeldung" });
      // Legende nur mit dem, was zu sehen ist: alle Phasen geschätzt → eine gestrichelte Angabe
      const gs = phasen.filter((p) => p.geschaetzt).length;
      if (gs < phasen.length) leg.createSpan({ cls: "pr", text: "Prüfungsphase" });
      if (gs) leg.createSpan({ cls: "gs", text: gs === phasen.length ? "Prüfungsphase (geschätzt)" : "geschätzt" });
      leg.createSpan({ cls: "pk", text: "Prüfung" });
    }

    // --- Je Phase ein Tagesstreifen mit den Klausuren am Datum ---
    for (const p of phasen) {
      const n = tage(p.von, p.bis) + 1;
      const box = el.createDiv({ cls: "eba-kzt-phase" + (p.art.startsWith("Nachhol") ? " nachhol" : "") });
      const kopf = box.createDiv({ cls: "eba-kzt-kopf" });
      kopf.createSpan({ cls: "eba-kzt-art", text: p.art });
      const d0 = tage(heute, p.von), d1 = tage(heute, p.bis);
      kopf.createSpan({ cls: "eba-kzt-zeit", text: `${tm(p.von)} – ${tmj(p.bis)}` + (p.geschaetzt ? " · geschätzt" : "") + " · " + (d0 > 0 ? rel(d0) : d1 >= 0 ? "läuft" : "vorbei") });
      const anm = anmeldungen.filter((t) => (t.bis || t.von) < p.von).pop();
      if (anm) {
        const z = box.createDiv({ cls: "eba-kzt-anm" });
        z.appendText("Anmeldung ");
        link(z, anm.f, "eba-kzt-anm-link", `${tm(anm.von)} – ${tmj(anm.bis || anm.von)}`);
        const a0 = tage(heute, anm.von), a1 = tage(heute, anm.bis || anm.von);
        z.appendText(a0 > 0 ? ` · ${rel(a0)}` : a1 >= 0 ? ` · läuft, noch ${a1 === 0 ? "heute" : a1 + " Tage"}` : "");
      }
      const drin = pruef.filter((k) => k.d >= p.von && k.d <= p.bis);
      // Beschriftungen in Reihen, damit nahe Termine sich nicht überdecken (Abstand mind. ca. 20 % der Breite)
      const reihen = [], abstand = Math.max(2, Math.ceil(n * 0.2));
      const marken = box.createDiv({ cls: "eba-kzt-marken" });
      for (const k of drin) {
        const i = tage(p.von, k.d);
        let r = reihen.findIndex((letzter) => i - letzter >= abstand);
        if (r < 0) { r = reihen.length; reihen.push(i); } else reihen[r] = i;
        const pos = ((i + 0.5) / n) * 100;
        const m = link(marken, k.f, "eba-kzt-marke" + (k.fertig ? " ok" : k.d < heute ? " vorbei" : "") + (k.geschaetzt ? " geschaetzt" : "") + (k.termin && p.art.startsWith("Nachhol") ? " nachhol" : ""), "");
        m.style.left = pos + "%";
        m.style.setProperty("--reihe", r);
        if (pos < 12) m.addClass("links"); else if (pos > 88) m.addClass("rechts");
        m.createEl("b", { text: k.code });
        const t = tage(heute, k.d);
        m.createSpan({ text: k.fertig ? "bestanden" + (k.ergebnis ? ` · ${k.ergebnis}` : "") : wt(k.d) + (t >= 0 && t <= 30 ? ` · ${t === 0 ? "heute" : t === 1 ? "morgen" : "in " + t + " T."}` : "") });
      }
      marken.style.setProperty("--reihen", Math.max(1, reihen.length));
      if (!drin.length) marken.addClass("leer");
      const streifen = box.createDiv({ cls: "eba-kzt-tage" });
      streifen.style.setProperty("--n", n);
      for (let i = 0; i < n; i++) {
        const d = new Date(p.von.getFullYear(), p.von.getMonth(), p.von.getDate() + i);
        const c = streifen.createSpan({ text: String(d.getDate()) });
        if (d.getDay() === 0 || d.getDay() === 6) c.addClass("we");
        if (drin.some((k) => tage(k.d, d) === 0)) c.addClass("pk");
        if (tage(heute, d) === 0) c.addClass("heute");
      }
    }

    // --- Ohne Termin, außerhalb der Phasen, bestanden ohne Datum ---
    // „Termin folgt“ nur ohne Datum im Modul UND ohne Prüfungs-Termin-Notiz mit diesem Kürzel in einer Prüfungsphase (zentrale
    // Klausurtermine stehen in Termin-Notizen; Zwischentests liegen außerhalb der Phasen und zählen hier nicht)
    const folgt = module.filter((m) => !m.datum && !m.fertig && !pruef.some((k) => k.termin && k.code === m.code && inPhase(k.d)));
    const ausser = pruef.filter((k) => k.modul && !inPhase(k.d));
    const fertigOhne = module.filter((m) => !m.datum && m.fertig);
    if (folgt.length || ausser.length || fertigOhne.length) {
      const fuss = el.createDiv({ cls: "eba-kzt-rest" });
      const zeile = (label, liste, text) => {
        if (!liste.length) return;
        const z = fuss.createDiv();
        z.createSpan({ cls: "eba-kzt-rest-k", text: label });
        liste.forEach((m, i) => { if (i) z.appendText(" · "); link(z, m.f, "eba-kzt-rest-link", m.code); const t = text(m); if (t) z.appendText(" " + t); });
      };
      zeile("Termin folgt", folgt, () => "");
      zeile("Weitere", ausser, (k) => wt(k.d));
      zeile("Bestanden", fertigOhne, (m) => m.ergebnis);
    }
    if (!phasen.length && !pruef.length && !module.length) el.createDiv({ cls: "eba-kzt-leer", text: "Keine Prüfungsphasen in den Einstellungen." });
  };

  const registrieren = () => {
    const block = ctx.codeblock(SPRACHE, (quelle, el, c) => {
      try { zeichnen(el, c); } catch (e) { el.setText("Klausurzeit: Fehler – " + e.message); console.error("Klausurzeit", e); }
    });
    const bald = ctx.entprellen(() => block.neu(), 1500);
    const relevant = (f, cache) => {
      const typ = cache?.frontmatter?.typ;
      return typ === "termin" || typ === "modul" || f.path === "System/Einstellungen.md" || f.path.startsWith("System/Daten/");
    };
    ctx.an(app.metadataCache, "changed", (f, _d, cache) => { if (relevant(f, cache)) bald(); });
    ctx.an(app.metadataCache, "deleted", (f, vorher) => { if (relevant(f, vorher)) bald(); });
    ctx.an(app.vault, "rename", (f) => { if (relevant(f, app.metadataCache.getFileCache(f))) bald(); });
    // Tageswechsel (Countdown, „heute“-Linie): alle 30 Minuten und beim Zurückkommen in die App, nur wenn ein neuer Tag ist
    let gezeichnetAm = ctx.date.now("YYYY-MM-DD");
    const tagNeu = () => { const h = ctx.date.now("YYYY-MM-DD"); if (h !== gezeichnetAm) { gezeichnetAm = h; block.neu(); } };
    ctx.intervall(tagNeu, 30 * 60 * 1000);
    ctx.dom(document, "visibilitychange", () => { if (document.visibilityState === "visible") tagNeu(); });
  };

  return { registrieren, zeichnen };
};
