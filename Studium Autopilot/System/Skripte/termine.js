// Agenda als Codeblock ```eba-agenda``` (Seite Studium/Termine & Anmeldungen.md, unter dem Kalender). Wird live gezeichnet wie
// ```eba-kalender```, schreibt KEINE Datei (früher stand die Liste zwischen den Markierungen termine:anfang/termine:ende
// in der Termine-Seite selbst; das gab Sync-Konflikte, wenn mehrere Geräte gleichzeitig schrieben).
// Liest alle Notizen mit typ: termin und zeigt eine nach Tagen geordnete Liste: diese Woche, nächste Woche, Fristen danach,
// „Später“ (eingeklappt, nach Monaten) und „Vergangen“. Erzeugt dafür Markdown (gleiche Callouts und Klassen wie bisher:
// eba-t, eba-karte, eba-tag, eba-rel, eba-pill) und rendert es mit Obsidians MarkdownRenderer in den Block.
// Neu gezeichnet bei Änderungen an Termin-Notizen, beim Zurückkehren in die App und alle 30 Minuten (Tageswechsel).
// Erweiterung: registrieren() meldet Codeblock, Ereignisse und Uhr über die Helfer in ctx an (Hot-Reload ohne Neustart).
// iOS-sicher: keine Node-APIs, keine Lookbehind-Regex.
module.exports = function (ctx) {
  const app = window.app;

  const SEITE = "Studium/Termine & Anmeldungen.md";
  const TAGE = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  const EVENT = ["Fachschaft", "Veranstaltung"];
  // Zentrale Termine mit bereich: schluesselqualifikation (zentral.js): ruhige Pille, damit klar ist: keine Pflicht
  const SQ_PILLE = '<span class="eba-pill leer">Schlüsselqualifikation · freiwillig</span>';

  const pad = (n) => String(n).padStart(2, "0");
  const datum = (v) => {
    const m = String(v ?? "").match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
  };
  const kurz = (d) => `${TAGE[d.getDay()]} ${pad(d.getDate())}.${pad(d.getMonth() + 1)}.`;
  const kurzJahr = (d) => `${kurz(d)}${d.getFullYear()}`;
  const tage = (a, b) => Math.round((b - a) / 86400000);
  const relativ = (n) => (n === 0 ? "heute" : n === 1 ? "morgen" : n < 0 ? "läuft" : `in ${n} Tagen`);
  const montag = (d) => { const m = new Date(d); m.setDate(m.getDate() - ((m.getDay() + 6) % 7)); return m; };
  const einzeilig = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

  const pill = (k) => `<span class="eba-pill ${k === "Prüfung" ? "bad" : k === "Frist" ? "warn" : EVENT.includes(k) ? "akzent" : "info"}">${k}</span>`;
  // Uhrzeit aus dem Feld „ort“ (dort steht sie bisher mit dem Ort zusammen), z. B. „Mo 12:15–14:00 · HS N06“.
  // Nur Doppelpunkt-Zeiten mit gültigen Stunden und Minuten, damit Datumsangaben wie „06.11.“ nicht als Uhrzeit gelten.
  const ZEIT = /(?:^|\D)((?:[01]?\d|2[0-3]):[0-5]\d(?:\s*[–-]\s*(?:[01]?\d|2[0-3]):[0-5]\d)?)(?!\d)/; // ohne Lookbehind (iOS < 16.4); Uhrzeit = Gruppe 1

  const lesen = () => {
    const aus = [];
    for (const f of app.vault.getMarkdownFiles()) {
      const fm = app.metadataCache.getFileCache(f)?.frontmatter;
      if (fm?.typ !== "termin") continue;
      const von = datum(fm.datum);
      if (!von) continue;
      const bis = datum(fm.bis);
      const ort = einzeilig(fm.ort);
      const quelle = einzeilig(fm.quelle);
      aus.push({
        f, von, bis: bis && bis > von ? bis : null, titel: einzeilig(fm.titel || f.basename), kategorie: einzeilig(fm.kategorie) || "Termin",
        geschaetzt: fm.status === "geschätzt", erledigt: fm.erledigt === true, sq: fm.bereich === "schluesselqualifikation", ort, zeit: (ort.match(ZEIT) || ["", ""])[1],
        quelle, geprueft: String(fm.geprueft ?? "").slice(0, 10),
      });
    }
    return aus.sort((a, b) => a.von - b.von || a.zeit.localeCompare(b.zeit) || a.titel.localeCompare(b.titel));
  };

  const link = (t, text) => `[[${t.f.path.replace(/\.md$/, "")}|${text}]]`;

  const erzeugen = (alle, heute) => {
    const ende = (t) => t.bis || t.von;
    const kommend = alle.filter((t) => ende(t) >= heute);
    const vergangen = alle.filter((t) => ende(t) < heute).reverse();
    const teile = [];

    // Kompakt: sichtbar nur diese und nächste Woche, je Termin eine Zeile mit Tag
    // (mehrtägige mit „bis …“); alles danach und Vergangenes in eingeklappten Karten. Details stehen in der Termin-Notiz.
    const wo = montag(heute), naechste = new Date(wo); naechste.setDate(wo.getDate() + 7);
    const uebernaechste = new Date(wo); uebernaechste.setDate(wo.getDate() + 14);
    const spanne = (a) => { const e = new Date(a); e.setDate(a.getDate() + 6); return `${pad(a.getDate())}.${pad(a.getMonth() + 1)}. – ${pad(e.getDate())}.${pad(e.getMonth() + 1)}.`; };
    // Der Tag steht in <span class="eba-tag"> („heute“/„morgen“ in <span class="eba-rel">): am PC/iPad unverändert
    // (gleicher Text), auf dem iPhone eine schmale Tagesspalte links (eba-core.css Abschnitt 37);
    // „gleich“ = selber Tag wie die Zeile davor, dort auf dem iPhone ausgeblendet. So steht jeder Tag nur einmal da. Fett als <strong>, nicht **: in der
    // Bearbeitungsansicht (Live Preview) wird Markdown innerhalb von HTML nicht ausgewertet (sonst stünden dort Sternchen).
    const zeile = (t, tagText, prefix = "", gleich = false) => {
      const tag = tagText ? `<span class="eba-tag${gleich ? " gleich" : ""}"><strong>${tagText}</strong> · </span>` : "";
      const teil = tag + [t.zeit, link(t, t.titel)].filter(Boolean).join(" · ");
      const pillen = [pill(t.kategorie), t.sq ? SQ_PILLE : "", t.geschaetzt ? '<span class="eba-pill leer">geschätzt</span>' : "", t.erledigt ? '<span class="eba-pill ok">erledigt</span>' : ""].filter(Boolean).join(" ");
      return `${prefix}- ${teil} ${pillen}`;
    };
    const liste = (ts, prefix = "", mitJahr = false, stand = { tag: null }) => ts.map((t) => {
      const n = tage(heute, t.von);
      const tagText = `${mitJahr ? kurzJahr(t.von) : kurz(t.von)}${n >= 0 && n <= 1 ? `<span class="eba-rel"> · ${relativ(n)}</span>` : ""}`;
      const gleich = tagText === stand.tag;
      stand.tag = tagText;
      const z = zeile(t, tagText, prefix, gleich);
      return t.bis ? z.replace(link(t, t.titel), `${link(t, t.titel)} · bis ${kurz(t.bis)}`) : z;
    }).join("\n");

    // Diese Woche: läuft gerade (mehrtägig, schon begonnen) + ab heute bis Sonntag
    const dieseWoche = kommend.filter((t) => t.von < naechste);
    teile.push(`## Diese Woche · ${spanne(wo)}`, "", dieseWoche.length ? liste(dieseWoche) : "- Keine Termine.");
    const naechsteWoche = kommend.filter((t) => t.von >= naechste && t.von < uebernaechste);
    // „Nächste Woche“ und „Fristen danach“: Inhalt in einer Karte |handy-zu|pc-flach (eba-core.css vor 36b): am PC/iPad
    // ohne Rahmen und Titel wie bisher unter der Überschrift, auf dem iPhone eine zugeklappte Karte.
    const anzahl = (n) => (n === 0 ? "keine Termine" : n === 1 ? "1 Termin" : `${n} Termine`);
    teile.push("", `## Nächste Woche · ${spanne(naechste)}`, "", `> [!eba-karte|handy-zu|pc-flach]+ Nächste Woche · ${anzahl(naechsteWoche.length)}`,
      naechsteWoche.length ? liste(naechsteWoche, "> ") : "> - Keine Termine.");

    // Fristen danach: die nächsten offenen Fristen/Prüfungen nach den zwei Wochen (die der zwei Wochen stehen oben)
    const fristen = kommend.filter((t) => t.von >= uebernaechste && ["Frist", "Prüfung"].includes(t.kategorie) && !t.erledigt).slice(0, 4);
    if (fristen.length) teile.push("", "## Fristen danach", "", `> [!eba-karte|handy-zu|pc-flach]+ Fristen danach · ${fristen.length === 1 ? "1 Frist" : `${fristen.length} Fristen`}`, fristen.map((t) => `> - <span class="eba-tag"><strong>${kurz(t.von)}</strong> · </span>${link(t, t.titel)} · ${relativ(tage(heute, t.von))}${t.sq ? " · freiwillig" : ""}${t.geschaetzt ? " · geschätzt" : ""}`).join("\n"));

    // Später: nach Monaten, eingeklappt
    const spaeter = kommend.filter((t) => t.von >= uebernaechste);
    if (spaeter.length) {
      teile.push("", `> [!eba-t|uni]- Später · ${spaeter.length} Termine`);
      let monat = null;
      const stand = { tag: null };
      for (const t of spaeter) {
        const m = `${MONATE[t.von.getMonth()]} ${t.von.getFullYear()}`;
        // Leerzeile davor, sonst hängt der Monatsname als Fortsetzung an der letzten Zeile des Vormonats
        if (m !== monat) { teile.push(">", `> **${m}**`); monat = m; }
        teile.push(liste([t], "> ", false, stand));
      }
    }

    if (vergangen.length) {
      teile.push("", `> [!eba-t|erledigt]- Vergangen · ${vergangen.length} Termine`);
      for (const t of vergangen) teile.push(`> - ${t.bis ? `${kurz(t.von)} – ${kurz(t.bis)}` : kurz(t.von)} · ${link(t, t.titel)}`);
    }
    return teile.join("\n");
  };

  // ---------- Codeblock ```eba-agenda``` ----------
  const SPRACHE = "eba-agenda";
  const { MarkdownRenderer, MarkdownRenderChild, Keymap } = ctx.obsidian;

  const zeichnen = async (inst) => {
    const { el } = inst;
    const quelle = (inst.ctx && inst.ctx.sourcePath) || SEITE;
    const jetzt = ctx.date.jetzt();
    const heute = new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate());
    const md = erzeugen(lesen(), heute);
    if (md === inst.zuletzt && el.childElementCount) return;
    inst.zuletzt = md;
    // Je Zeichnung ein eigenes Kind-Objekt (räumt Links/Unterelemente der vorigen Zeichnung auf)
    if (inst.comp) { try { inst.comp.unload(); } catch (e) { /* schon weg */ } }
    inst.comp = new MarkdownRenderChild(el);
    if (inst.ctx && inst.ctx.addChild) inst.ctx.addChild(inst.comp); else inst.comp.load();
    const ziel = createDiv({ cls: "eba-agenda" });
    await MarkdownRenderer.render(app, md, ziel, quelle, inst.comp);
    // Wie in der Leseansicht jeden Block in div.el-<tag> fassen (el-h2, el-ul, el-div …): eba-core.css richtet sich danach
    for (const k of Array.from(ziel.children)) {
      if (k.classList.contains("el-" + k.tagName.toLowerCase())) continue;
      const huelle = createDiv({ cls: "el-" + k.tagName.toLowerCase() });
      ziel.insertBefore(huelle, k);
      huelle.appendChild(k);
    }
    el.empty();
    el.appendChild(ziel);
    // Links selbst öffnen (Bearbeitungsansicht: nicht in den Quelltext springen; Leseansicht: genau einmal öffnen)
    if (!el.__ebaAgendaKlick) {
      el.__ebaAgendaKlick = true;
      el.addEventListener("mousedown", (e) => { if (e.target.closest && e.target.closest("a.internal-link, .callout-title")) e.stopPropagation(); });
      el.addEventListener("click", (e) => {
        const a = e.target.closest && e.target.closest("a.internal-link");
        if (!a) return;
        e.preventDefault(); e.stopPropagation();
        app.workspace.openLinkText(a.getAttribute("data-href") || a.getAttribute("href") || "", quelle, Keymap.isModEvent(e));
      });
    }
  };

  const registrieren = () => {
    // Der Codeblock-Prozessor ruft immer diese Fassung; inst (vom Plugin) trägt zuletzt/comp dieser Agenda
    const block = ctx.codeblock(SPRACHE, (q, el, c, inst) => {
      inst.zuletzt = null;
      return zeichnen(inst).catch((e) => { el.setText("Agenda: Fehler – " + e.message); console.error("Agenda", e); });
    });
    const alleNeu = () => { for (const i of block.instanzen()) zeichnen(i).catch((e) => console.error("Agenda", e)); };
    const bald = ctx.entprellen(alleNeu, 1500);
    ctx.an(app.metadataCache, "changed", (f, _d, cache) => {
      if ((cache && cache.frontmatter && cache.frontmatter.typ === "termin") || f.path.startsWith("Termine/")) bald();
    });
    ctx.an(app.vault, "delete", (f) => { if (f.path.startsWith("Termine/")) bald(); });
    ctx.an(app.vault, "rename", (f, alt) => { if (f.path.startsWith("Termine/") || String(alt).startsWith("Termine/")) bald(); });
    // Tageswechsel: alle 30 Minuten und beim Zurückkommen in die App
    ctx.intervall(alleNeu, 30 * 60 * 1000);
    ctx.dom(document, "visibilitychange", () => { if (document.visibilityState === "visible") alleNeu(); });
  };

  return { registrieren, lesen, erzeugen, zeichnen };
};
