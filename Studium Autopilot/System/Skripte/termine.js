// Agenda als Codeblock ```eba-agenda``` (Seite Studium/Termine & Anmeldungen.md, unter dem Kalender). Wird live gezeichnet wie
// ```eba-kalender```, schreibt KEINE Datei (früher stand die Liste zwischen den Markierungen termine:anfang/termine:ende
// in der Termine-Seite selbst; das gab Sync-Konflikte, wenn mehrere Geräte gleichzeitig schrieben).
// Liest alle Notizen mit typ: termin und zeigt eine nach Tagen geordnete Liste: diese Woche, nächste Woche, Fristen danach,
// „Später“ (eingeklappt, nach Monaten) und „Vergangen“. Erzeugt dafür Markdown (Callouts eba-t und eba-karte, Klassen eba-tag,
// eba-wt, eba-rel, eba-jetzt, eba-pill) und rendert es mit Obsidians MarkdownRenderer in den Block.
// Aussehen (seit 17.10.2026, eba-core.css Abschnitt 37.termine): links je Tag eine Tagesspalte mit Ziffer und Wochentag
// (<span class="eba-tag frist"><b>19</b><span class="eba-wt">Mo</span></span>, darunter „heute“/„morgen“ oder der Monat), nur
// beim ersten Termin des Tags; Folgezeilen desselben Tags tragen „gleich“ und bleiben ohne Spalte. Die Art (pruefung, frist,
// uni, event, erledigt) steht als Klasse an der Tagesspalte, das CSS zeichnet daraus den Farbpunkt vor dem Termin, wie im
// Kalender. Text-Pillen nur dort, wo der Punkt allein nicht reicht: Frist, Prüfung, freiwillig, geschätzt, erledigt.
// „Diese Woche“: begonnene, noch laufende Zeiträume stehen zuerst unter „läuft“, dann die Marke „Heute · Sa 17.10.“
// (eba-jetzt), darunter alles ab heute; Termine von heute brauchen darum keine eigene Tagesspalte.
// Neu gezeichnet bei Änderungen an Termin-Notizen, beim Zurückkehren in die App und alle 30 Minuten (Tageswechsel).
// Anmeldungen als Codeblock ```eba-anmeldungen``` (seit 17.10.2026, ersetzt die Tabelle zum Eintragen auf derselben Seite):
// Tabelle Was · Wann · Wo aus den zentralen Fristen (herkunft: zentral, kategorie: Frist), deren Titel eine Anmeldung, Belegung
// oder Buchung nennt (die Daten haben dafür kein eigenes Feld). Gefiltert wie beim Übernehmen der zentralen Termine
// (ctx.zentral.filterBauen().aufnehmen: mit code nur Module deines Plans). Nur Anmeldungen fürs Studium: mit Modul (code),
// Schlüsselqualifikation und TCP (bereich, TCP im Titel), Übungs- und Tutoriengruppen, Prüfungsanmeldung. Alles andere
// (Karriere, Workshops, Sport, Vorträge, Kolloquium) steht nur als Frist in der Agenda (dort gilt „Fachschaft &
// Veranstaltungen“): jede Information an einer Stelle. Nur bis zum Ende des aktuellen Semesters und ohne, was seit mehr als 7
// Tagen vorbei ist. Wann aus datum/bis und den Zeiten im Feld ort („ab 15:00“, „bis 30.10. 15:00“), Wo aus dem Rest von ort, sonst
// die Quelle. Hast du für das Modul eine Gruppe (Stundenplan/, herkunft ilias-gruppe oder gruppe-gewaehlt, aktuelles Semester;
// seit 18.10.2026 auch jede andere Notiz außer zentralen, die zur Zeit einer Gruppe aus gruppen.json passt, Regel aus
// meine-gruppe.js), steht eine grüne Pille „Gruppe 4“ dabei (ohne Namen „angemeldet“): Feld gruppe der Notiz, nie gruppe_alma.
// Bis 18.10.2026 „angemeldet · Gruppe 4“ (Entscheidung E7: grün sagt schon „angemeldet“). Neu gezeichnet bei Änderungen im
// Datenmodell (Termine, Stundenplan, Module, Einstellungen) und wie die Agenda. Stil: eba-core.css Abschnitt 57.
// Erweiterung: registrieren() meldet Codeblöcke, Ereignisse und Uhr über die Helfer in ctx an (Hot-Reload ohne Neustart).
// Termine, Uhrzeit, Art und Woche kommen aus dem Fachmodell (ctx.modell, docs/architektur.md „Fachmodell“): Entfallenes fehlt,
// Uhrzeiten sind als Zahl sortiert (9:15 vor 12:15), „Diese Woche“ ist am Samstag und Sonntag schon die kommende (ab heute).
// iOS-sicher: keine Node-APIs, keine Lookbehind-Regex.
module.exports = function (ctx) {
  const app = window.app;

  const SEITE = "Studium/Termine & Anmeldungen.md";
  const TAGE = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
  const MONATE = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
  const MONATE_KURZ = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sep.", "Okt.", "Nov.", "Dez."];

  const M = () => ctx.modell; // Fachmodell (modell.js), beim Zeichnen nachgeschlagen
  const datum = (v) => M().zeit.tag(v);
  const iso = (d) => M().zeit.iso(d);
  // „Mo 19.10.“, das Jahr nur außerhalb des Studienjahrs (eine Schreibweise, ctx.modell.zeit)
  const kurz = (d) => M().zeit.datum(d);
  const tage = (a, b) => Math.round((b - a) / 86400000);
  const relativ = (n) => (n === 0 ? "heute" : n === 1 ? "morgen" : n < 0 ? "läuft" : `in ${n} Tagen`);
  const minutenSort = (z) => { const n = M().zeit.minuten(z); return n == null ? -1 : n; }; // ohne Uhrzeit zuerst
  const einzeilig = (s) => String(s ?? "").replace(/\s+/g, " ").trim();

  // Art wie in kalender.js (Farbe des Punkts, ctx.modell.terminArt): Erledigtes gedämpft, Prüfung rot, Zwischentest blau, Frist
  // ocker, Veranstaltung/Fachschaft Akzent, Rest Uni
  const zwischentest = (t) => t.kategorie === "Prüfung" && M().istZwischentest(t.titel);
  const art = (t) => (t.erledigt ? "erledigt" : M().terminArt(t.kategorie, zwischentest(t)));
  // Zentrale Termine mit bereich: schluesselqualifikation (zentral.js): ruhige Pille, damit klar ist: keine Pflicht
  const pillen = (t) => [
    t.kategorie === "Prüfung" ? (zwischentest(t) ? '<span class="eba-pill info">Zwischentest</span>' : '<span class="eba-pill bad">Prüfung</span>') : t.kategorie === "Frist" ? '<span class="eba-pill warn">Frist</span>' : "",
    t.sq ? '<span class="eba-pill leer">freiwillig</span>' : "",
    t.geschaetzt ? '<span class="eba-pill leer">geschätzt</span>' : "",
    t.erledigt ? '<span class="eba-pill ok">erledigt</span>' : "",
  ].filter(Boolean).join(" ");
  // Termin-Notizen aus dem Fachmodell (ctx.modell.termine(): ohne Entfallenes, nach Tag und Uhrzeit als Zahl), als Einträge der
  // Agenda mit Date-Werten. Uhrzeit: Feld „uhrzeit“, sonst wie bisher aus „ort“ (z. B. „Mo 12:15–14:00 · HS N06“).
  const lesen = () => M().termine().map((t) => ({
    f: t.f, von: datum(t.datum), bis: t.bis ? datum(t.bis) : null, titel: t.titel, kategorie: t.kategorie,
    geschaetzt: t.geschaetzt, erledigt: t.erledigt, sq: t.freiwillig, ort: t.ort, zeit: t.zeit, quelle: t.quelle,
    geprueft: String(t.fm.geprueft ?? "").slice(0, 10), code: t.code, bereich: t.bereich, zentral: t.zentral, entfaellt: t.entfaellt,
  }));

  const link = (t, text) => `[[${t.f.path.replace(/\.md$/, "")}|${text}]]`;

  // Tagesspalte. o: { art, gleich, laeuft, monat, rel }. Fett als <b>, nicht **: in der Bearbeitungsansicht (Live Preview)
  // wird Markdown innerhalb von HTML nicht ausgewertet (sonst stünden dort Sternchen).
  const tagHtml = (d, o) => {
    const cls = ["eba-tag", o.art, o.gleich ? "gleich" : "", o.laeuft ? "laeuft" : ""].filter(Boolean).join(" ");
    if (o.laeuft) return `<span class="${cls}"><span class="eba-wt">läuft</span></span>`;
    const unten = [o.monat ? MONATE_KURZ[d.getMonth()] : "", o.rel || ""].filter(Boolean).join(" · ");
    return `<span class="${cls}"><b>${d.getDate()}</b><span class="eba-wt">${TAGE[d.getDay()]}</span>${unten ? `<span class="eba-rel">${unten}</span>` : ""}</span>`;
  };
  const zeile = (t, tag, prefix) => {
    const text = [t.zeit, link(t, t.titel)].filter(Boolean).join(" · ") + (t.bis ? ` · bis ${kurz(t.bis)}` : "");
    const p = pillen(t);
    return `${prefix || ""}- ${tag}${text}${p ? " " + p : ""}`;
  };
  // Liste nach Tagen. o: { prefix, monat, stand, heuteOhneSpalte }; stand.tag merkt den letzten Tag über Aufrufe hinweg,
  // damit er nur einmal steht. heuteOhneSpalte: die Marke „Heute“ steht schon davor.
  const liste = (ts, heute, o) => {
    o = o || {};
    const stand = o.stand || { tag: null };
    return ts.map((t) => {
      const n = tage(heute, t.von);
      const schluessel = t.von.getTime();
      const gleich = schluessel === stand.tag || (o.heuteOhneSpalte && n === 0);
      stand.tag = schluessel;
      return zeile(t, tagHtml(t.von, { art: art(t), gleich, monat: o.monat, rel: n === 0 ? "heute" : n === 1 ? "morgen" : "" }), o.prefix);
    }).join("\n");
  };

  const erzeugen = (alle, heute) => {
    const ende = (t) => t.bis || t.von;
    const kommend = alle.filter((t) => ende(t) >= heute);
    const vergangen = alle.filter((t) => ende(t) < heute).reverse();
    const teile = [];

    // Kompakt: sichtbar nur diese und nächste Woche, je Termin eine Zeile (mehrtägige mit „bis …“); alles danach und
    // Vergangenes in eingeklappten Karten. Details stehen in der Termin-Notiz. Diese Woche = Planwoche (ctx.modell.planwoche):
    // am Samstag und Sonntag schon die kommende, dann ab heute („Diese Woche · 17.–25.10.“).
    const Z = M().zeit, pw = M().planwoche(iso(heute));
    const wo = datum(pw.mo), naechste = datum(Z.plus(pw.mo, 7)), uebernaechste = datum(Z.plus(pw.mo, 14));
    const spanne = (a) => Z.spanne(a, Z.plus(iso(a), 6));

    // Diese Woche: erst, was läuft (begonnen, noch nicht vorbei), dann die Marke „Heute“, dann alles ab heute bis Sonntag
    const dieseWoche = kommend.filter((t) => t.von < naechste);
    const laufend = dieseWoche.filter((t) => t.von < heute);
    const abHeute = dieseWoche.filter((t) => t.von >= heute);
    const zeilen = laufend.map((t, i) => zeile(t, tagHtml(t.von, { art: art(t), laeuft: true, gleich: i > 0 })));
    if (abHeute.length) zeilen.push(`- <span class="eba-jetzt">Heute · ${kurz(heute)}</span>`, liste(abHeute, heute, { heuteOhneSpalte: true }));
    teile.push(`## Diese Woche · ${pw.vorgezogen ? Z.spanne(heute, pw.so) : spanne(wo)}`, "", zeilen.length ? zeilen.join("\n") : "- Keine Termine diese Woche.");

    // „Nächste Woche“ und „Fristen danach“: Inhalt in einer Karte |handy-zu|pc-flach (eba-core.css vor 36b): am PC/iPad
    // ohne Rahmen und Titel unter der Überschrift, auf dem iPhone eine zugeklappte Karte.
    const naechsteWoche = kommend.filter((t) => t.von >= naechste && t.von < uebernaechste);
    const anzahl = (n) => (n === 0 ? "keine Termine" : n === 1 ? "1 Termin" : `${n} Termine`);
    // Kartentitel mit Zeitraum: auf dem iPhone ist die ##-Überschrift ausgeblendet (eba-core.css), die Karte trägt den Titel
    teile.push("", `## Nächste Woche · ${spanne(naechste)}`, "", `> [!eba-karte|handy-zu|pc-flach]+ Nächste Woche · ${spanne(naechste)} · ${anzahl(naechsteWoche.length)}`,
      naechsteWoche.length ? liste(naechsteWoche, heute, { prefix: "> " }) : "> - Keine Termine nächste Woche.");

    // Fristen danach: die nächsten offenen Fristen/Prüfungen nach den zwei Wochen (die der zwei Wochen stehen oben), mit Monat
    const fristen = kommend.filter((t) => t.von >= uebernaechste && ["Frist", "Prüfung"].includes(t.kategorie) && !t.erledigt).slice(0, 4);
    if (fristen.length) {
      const stand = { tag: null };
      teile.push("", "## Fristen danach", "", `> [!eba-karte|handy-zu|pc-flach]+ Fristen danach · ${fristen.length === 1 ? "1 Frist" : `${fristen.length} Fristen`}`,
        fristen.map((t) => {
          const gleich = t.von.getTime() === stand.tag;
          stand.tag = t.von.getTime();
          const extra = [t.sq ? '<span class="eba-pill leer">freiwillig</span>' : "", t.geschaetzt ? '<span class="eba-pill leer">geschätzt</span>' : ""].filter(Boolean).join(" ");
          return `> - ${tagHtml(t.von, { art: art(t), gleich, monat: true })}${link(t, t.titel)} · ${relativ(tage(heute, t.von))}${extra ? " " + extra : ""}`;
        }).join("\n"));
    }

    // Später: nach Monaten, eingeklappt (|sammel: ruhige Karte ohne Farbkante)
    const spaeter = kommend.filter((t) => t.von >= uebernaechste);
    if (spaeter.length) {
      teile.push("", `> [!eba-t|sammel]- Später · ${anzahl(spaeter.length)}`);
      let monat = null;
      const stand = { tag: null };
      for (const t of spaeter) {
        const m = `${MONATE[t.von.getMonth()]} ${t.von.getFullYear()}`;
        // Leerzeile davor, sonst hängt der Monatsname als Fortsetzung an der letzten Zeile des Vormonats
        if (m !== monat) { teile.push(">", `> **${m}**`); monat = m; }
        teile.push(liste([t], heute, { prefix: "> ", stand }));
      }
    }

    if (vergangen.length) {
      teile.push("", `> [!eba-t|sammel]- Vergangen · ${anzahl(vergangen.length)}`);
      const stand = { tag: null };
      for (const t of vergangen) teile.push(liste([t], heute, { prefix: "> ", monat: true, stand }));
    }
    return teile.join("\n");
  };

  // ---------- Anmeldungen: Auswahl und Texte (rein, testbar) ----------
  const ANMELDUNG = /anmeld|beleg|buchung/i;
  const SCHLUSS = /schluss|frist/i; // Anmeldeschluss, Belegfrist, Anmeldefrist → „bis …“
  const START = /start|beginn/i;    // Anmeldestart → „ab …“
  const NACHLAUF = 7;               // so viele Tage bleibt eine Anmeldung nach ihrem Ende stehen
  const GRUPPE = ["ilias-gruppe", "gruppe-gewaehlt"];

  // Feld „ort“ („ab 15:00 · bis 30.10. 15:00 · ILIAS-Kurs E101 → Übungen“) → { ab, bis, schluss, zeit, wo }: ctx.modell.ortTeilen
  const ortTeilen = (ort) => M().ortTeilen(ort);
  const amUm = (d, z) => kurz(d) + (z ? `, ${z}` : "");
  // Art des Datums: "spanne" (datum bis bis), "ab" (Anmeldung öffnet), "bis" (Anmeldeschluss), "tag" (nur ein Datum)
  const datumArt = (t, o) => {
    if (t.bis) return "spanne";
    if (o.ab || (START.test(t.titel) && !o.schluss)) return "ab";
    return o.schluss || SCHLUSS.test(t.titel) ? "bis" : "tag";
  };
  const wannText = (t, o) => {
    const a = datumArt(t, o);
    if (a === "spanne") return `${amUm(t.von, o.ab || o.zeit)} – ${amUm(t.bis, o.bis)}`;
    if (a === "ab") return "ab " + amUm(t.von, o.ab || o.zeit);
    if (a === "bis") return "bis " + amUm(t.von, o.bis || o.zeit);
    return amUm(t.von, o.zeit);
  };
  // Andere Stundenplan-Notiz (Alma, von Hand, eigener Uni-Abgleich, ohne herkunft; nie zentral) zur Zeit einer Gruppe aus
  // gruppen.json? Die eine Regel aus meine-gruppe.js (gehoertZu: gleicher Code, gleiches Semester, gleicher Wochentag, Beginn
  // höchstens 15 Min. daneben, c.t. und s.t.), dazu das Ende ebenso und Art Übung oder Tutorium. Nie über die Nummer der Gruppe.
  const SLOT_ARTEN = ["Übung", "Tutorium"];
  const meineGruppe = () => { const L = ctx.user && ctx.user["meine-gruppe"]; return L && L.gehoertZu ? L : null; };
  const slotPasst = (fm, g, L) => L.gehoertZu(fm, g, { arten: SLOT_ARTEN, ende: true });
  // „Gruppe 4“ (ohne Namen „angemeldet“), wenn du für das Modul eine Gruppe hast (gruppen = Stundenplan-Notizen [{ fm }]): eine Gruppen-Notiz
  // (ILIAS oder gewählt) oder eine andere Notiz zur Zeit einer Gruppe dieses Moduls (zentrale = geprüfte Gruppen aus gruppen.json,
  // slotPasst). Nennt der Titel die Art (Übung, Tutorium) und gibt es Gruppen dieser Art, zählen nur sie. Der Name kommt nur aus
  // dem Feld gruppe der Notiz.
  const anmeldeStand = (t, gruppen, semester, zentrale) => {
    if (!t.code) return "";
    const notizen = (gruppen || []).map((x) => (x && x.fm) || {}).filter((fm) => fm.entfaellt !== true
      && String(fm.code || "") === t.code && (!semester || String(fm.semester || "") === semester));
    let g = notizen.filter((fm) => GRUPPE.indexOf(String(fm.herkunft || "")) >= 0);
    const art = /übung/i.test(t.titel) ? "Übung" : /tutori/i.test(t.titel) ? "Tutorium" : "";
    const L = meineGruppe();
    if (L) {
      const slots = (zentrale || []).filter((x) => x && x.code === t.code && (!semester || x.semester === semester));
      const passend = art && slots.some((x) => x.art === art) ? slots.filter((x) => x.art === art) : slots;
      for (const fm of notizen) {
        const h = String(fm.herkunft || "");
        if (GRUPPE.indexOf(h) < 0 && h !== "zentral" && passend.some((x) => slotPasst(fm, x, L))) g.push(fm);
      }
    }
    if (art && g.some((fm) => fm.art === art)) g = g.filter((fm) => fm.art === art);
    if (!g.length) return "";
    const namen = [];
    for (const fm of g) { const n = einzeilig(fm.gruppe); if (n && namen.indexOf(n) < 0) namen.push(n); }
    return namen.length ? namen.join(", ") : "angemeldet";
  };
  // Fürs Studium: mit Modul (code), Schlüsselqualifikation (bereich), TCP, Übungs- und Tutoriengruppen, Prüfungsanmeldung.
  // Alles andere steht nur in der Agenda.
  const STUDIUM = /prüfungsanmeld|übungsgruppe|tutori|\bTCP\b/i;
  const fuersStudium = (t) => !!t.code || !!t.bereich || STUDIUM.test(t.titel);
  // alle = lesen(), o = { heute: Date, ende: Date | null (Ende des aktuellen Semesters), aufnehmen: Filter der zentralen Termine
  // oder null, gruppen: [{ fm }], semester: Name des aktuellen Semesters, zentraleGruppen: geprüfte Gruppen aus gruppen.json } →
  // [{ t, wann, wo, status, vorbei, pillen }]; erst, was noch läuft oder kommt (nach Datum), dann, was seit höchstens NACHLAUF
  // Tagen vorbei ist.
  const anmeldungen = (alle, o) => {
    o = o || {};
    const grenze = new Date(o.heute);
    grenze.setDate(grenze.getDate() - NACHLAUF);
    const offen = [], vorbei = [];
    for (const t of alle || []) {
      if (!t.zentral || t.kategorie !== "Frist" || t.entfaellt || !ANMELDUNG.test(t.titel)) continue;
      if (!fuersStudium(t) || (o.aufnehmen && !o.aufnehmen(t))) continue;
      if ((t.bis || t.von) < grenze || (o.ende && t.von > o.ende)) continue;
      const teile = ortTeilen(t.ort);
      const a = datumArt(t, teile);
      const z = {
        t, wann: wannText(t, teile), wo: teile.wo, status: anmeldeStand(t, o.gruppen, o.semester, o.zentraleGruppen),
        vorbei: a === "spanne" ? t.bis < o.heute : a === "bis" ? t.von < o.heute : false,
        pillen: [t.sq && !/freiwillig/i.test(t.titel) ? "freiwillig" : "", t.geschaetzt ? "geschätzt" : ""].filter(Boolean),
      };
      (z.vorbei ? vorbei : offen).push(z);
    }
    const reihe = (a, b) => a.t.von - b.t.von || minutenSort(a.t.zeit) - minutenSort(b.t.zeit) || a.t.titel.localeCompare(b.t.titel);
    return offen.sort(reihe).concat(vorbei.sort(reihe));
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
    linksOeffnen(el, quelle);
  };
  // Links selbst öffnen (Bearbeitungsansicht: nicht in den Quelltext springen; Leseansicht: genau einmal öffnen)
  const linksOeffnen = (el, quelle) => {
    if (el.__ebaAgendaKlick) return;
    el.__ebaAgendaKlick = true;
    el.addEventListener("mousedown", (e) => { if (e.target.closest && e.target.closest("a.internal-link, .callout-title")) e.stopPropagation(); });
    el.addEventListener("click", (e) => {
      const a = e.target.closest && e.target.closest("a.internal-link");
      if (!a) return;
      e.preventDefault(); e.stopPropagation();
      ctx.oeffnen(a.getAttribute("data-href") || a.getAttribute("href") || "", { quelle, neu: !!Keymap.isModEvent(e) });
    });
  };

  // ---------- Codeblock ```eba-anmeldungen``` ----------
  const SPRACHE_AN = "eba-anmeldungen";
  const anmeldungenZeichnen = (inst) => {
    const { el } = inst;
    const quelle = (inst.ctx && inst.ctx.sourcePath) || SEITE;
    const jetzt = ctx.date.jetzt();
    const heute = new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate());
    let D = null, aufnehmen = null;
    try { D = ctx.modell && ctx.modell.daten ? ctx.modell.daten() : null; } catch (e) { D = null; }
    // zentral.js lädt nach diesem Skript: Filter erst beim Zeichnen nachschlagen (ohne ihn: alle Notizen, die es gibt)
    try { aufnehmen = ctx.zentral && ctx.zentral.filterBauen ? ctx.zentral.filterBauen().aufnehmen : null; } catch (e) { aufnehmen = null; }
    const s = D && D.aktuell;
    let zentraleGruppen = [];
    try { const z = ctx.zentral && ctx.zentral.gruppen ? ctx.zentral.gruppen() : null; zentraleGruppen = z && Array.isArray(z.gruppen) ? z.gruppen : []; } catch (e) { zentraleGruppen = []; }
    const zeilen = anmeldungen(lesen(), { heute, ende: s ? datum(s.ende) : null, aufnehmen, gruppen: D ? D.stundenplan : [], semester: s ? s.name : "", zentraleGruppen });
    const schluessel = JSON.stringify(zeilen.map((z) => [z.t.f.path, z.t.titel, z.wann, z.wo, z.t.quelle, z.status, z.vorbei, z.pillen]));
    if (schluessel === inst.zuletzt && el.childElementCount) return;
    inst.zuletzt = schluessel;
    el.empty();
    const box = el.createDiv({ cls: "eba-an", attr: { lang: "de" } });
    if (!zeilen.length) {
      const aus = ctx.zentral && ctx.zentral.status && ctx.zentral.status().an === false;
      box.createDiv({ cls: "eba-an-leer", text: aus ? "Zentrale Daten sind ausgeschaltet. Anmeldungen erscheinen, sobald du sie unter Verbindungen einschaltest."
        : "Gerade stehen keine Anmeldungen an." });
      return;
    }
    const tab = box.createEl("table", { cls: "eba-an-tabelle" });
    const kopf = tab.createEl("thead").createEl("tr");
    for (const t of ["Was", "Wann", "Wo"]) kopf.createEl("th", { text: t });
    const tb = tab.createEl("tbody");
    for (const z of zeilen) {
      const tr = tb.createEl("tr");
      if (z.vorbei) tr.addClass("eba-an-vorbei");
      const was = tr.createEl("td", { cls: "eba-an-was" });
      const pfad = z.t.f.path.replace(/\.md$/, "");
      was.createEl("a", { cls: "internal-link", text: z.t.titel, href: pfad, attr: { "data-href": pfad } });
      if (z.status) was.createSpan({ cls: "eba-pill ok eba-an-pille", text: z.status });
      for (const p of z.pillen) was.createSpan({ cls: "eba-pill leer eba-an-pille", text: p });
      tr.createEl("td", { cls: "eba-an-wann", text: z.wann });
      const wo = tr.createEl("td", { cls: "eba-an-wo" });
      if (z.wo) wo.setText(z.wo);
      else if (/^https:\/\//.test(z.t.quelle)) {
        let host = "Quelle";
        try { host = new URL(z.t.quelle).hostname.replace(/^www\./, ""); } catch (e) { /* bleibt */ }
        wo.createEl("a", { cls: "external-link", text: host, href: z.t.quelle, attr: { target: "_blank", rel: "noopener" } });
      } else wo.setText(z.t.quelle || "–");
    }
    linksOeffnen(el, quelle);
  };

  let abo = false; // Änderungen im Datenmodell (Gruppen im Stundenplan, Plan, Einstellungen) → Anmeldungen neu zeichnen
  const registrieren = () => {
    // Der Codeblock-Prozessor ruft immer diese Fassung; inst (vom Plugin) trägt zuletzt/comp dieser Agenda
    const block = ctx.codeblock(SPRACHE, (q, el, c, inst) => {
      inst.zuletzt = null;
      // Das Plugin startet die Erweiterungen alphabetisch, modell.js erst danach: bis dahin der Ersatztext des Blocks
      if (!ctx.modell || !ctx.modell.termine) { el.setText(String(q || "").trim()); return undefined; }
      return zeichnen(inst).catch((e) => { el.setText("Agenda: Fehler – " + e.message); console.error("Agenda", e); });
    });
    const anBlock = ctx.codeblock(SPRACHE_AN, (q, el, c, inst) => {
      inst.zuletzt = null;
      if (!abo && ctx.modell && ctx.modell.beiAenderung) { abo = true; ctx.aufraeumen(ctx.modell.beiAenderung(() => anAlleNeu())); }
      if (!ctx.modell || !ctx.modell.termine) { el.setText(String(q || "").trim()); return; }
      try { anmeldungenZeichnen(inst); } catch (e) { el.setText(String(q)); console.error(SPRACHE_AN, e); }
    });
    const anAlleNeu = () => { for (const i of anBlock.instanzen()) { try { anmeldungenZeichnen(i); } catch (e) { console.error(SPRACHE_AN, e); } } };
    const alleNeu = () => { for (const i of block.instanzen()) zeichnen(i).catch((e) => console.error("Agenda", e)); anAlleNeu(); };
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

  return { registrieren, lesen, erzeugen, zeichnen, art, anmeldungen, ortTeilen, anmeldeStand };
};
