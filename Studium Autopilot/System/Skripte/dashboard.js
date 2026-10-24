// Kacheln und Listen aus dem Fachmodell (ctx.modell, docs/architektur.md „Fachmodell“), seit 18.10.2026 statt Bases-Formeln:
//  ```eba-kacheln``` (Dashboard, in > [!eba-kennzahlen]): Gruß und Datum, Kacheln „Nächste Frist“ (fristen()[0]), „Nächste
//    Prüfung“ (naechstePruefung), „Semester“, „ECTS“ (ects), „Gesamtnote“ (noten) und die Leiste „Semesterverlauf“ (je
//    Kalenderwoche des Semesters Vorlesungszeit, Pause, Prüfungsphase aus den Semesterdaten; „diese Woche“ = planwoche).
//  ```eba-liste fristen|termine|pruefungen```: Zeilen „Wann · Was · Art“. fristen = Dashboard „Fristen · 30 Tage“ (Fristen,
//    Prüfungen samt Zwischentests, Abgaben; nach dem Tag, den die Zeile zeigt), termine = „Termine · 14 Tage“ (ohne Fristen und
//    Prüfungen; Fachschaft und Veranstaltungen nur heute und morgen), pruefungen = Seite Prüfungen „Prüfungstermine“,
//    nachzuarbeiten = Dashboard „Nachzuarbeiten“ (seit 19.10.2026, vorher Bases mit dem Dateinamen „S110 VL 01“): Vorlesungsnotizen
//    ohne Haken, älteste zuerst, links das Modul, dann ihr Name wie überall (ctx.modell.vorlesung, „Vorlesung 1 · Di 13.10. · Thema“).
// DOM und Klassen der Kacheln wie die frühere Formel (eba-core.css Abschnitte 8, 32, 60); Listen: Abschnitt 63. Schreibt nichts.
// Jede Kachel öffnet ihre Notiz (ctx.oeffnen, Bedien-Bausteine): Frist und Prüfung ihre Notiz (ohne: Termine & Anmeldungen bzw.
// Prüfungen), Semester den Studienverlauf, ECTS und Gesamtnote Noten & ECTS.
// Neu gezeichnet bei Änderungen im Datenmodell, beim Zurückkommen in die App und alle 10 Minuten (Gruß, Tageswechsel).
// iOS-sicher: keine Node-APIs, kein Lookbehind, kein .at()/findLast/structuredClone.
module.exports = function (ctx) {
  const LISTEN = ["fristen", "termine", "pruefungen", "nachzuarbeiten"];
  const GRENZE = { fristen: 6, termine: 8, pruefungen: 0, nachzuarbeiten: 8 };
  const LEER = {
    fristen: "Keine Fristen in den nächsten 30 Tagen.",
    termine: "Keine Termine in den nächsten 14 Tagen.",
    pruefungen: "Noch keine Prüfungen.",
    nachzuarbeiten: "Nichts offen.",
  };

  // ---------- Kacheln (rein, testbar) ----------
  // M = ctx.modell, jetzt = Date → { gruss, datum, kacheln: [{ cls, k, v (HTML), s, fortschritt: [wert, max] | null, pfad }], leiste }
  const SEITE = { termine: "Studium/Termine & Anmeldungen.md", pruefungen: "Studium/Prüfungen.md", verlauf: "Studium/Studienverlauf.md", noten: "Studium/Noten & ECTS.md" };
  const kachelnBauen = (M, jetzt) => {
    const Z = M.zeit, D = M.daten(), heute = Z.iso(jetzt), h = jetzt.getHours();
    const sub = (iso) => { const n = Z.tageBis(iso, heute); return n === 0 ? "heute" : n === 1 ? "morgen" : n < 0 ? "vorbei" : `in ${n} Tagen`; };
    const gruss = (h < 5 ? "Gute Nacht" : h < 11 ? "Guten Morgen" : h < 18 ? "Guten Tag" : "Guten Abend") + (D.name ? ", " + D.name : "");
    const datum = `${Z.WT_LANG[jetzt.getDay()]}, ${jetzt.getDate()}. ${Z.MONATE[jetzt.getMonth()]} ${jetzt.getFullYear()}`;
    const kacheln = [];
    // Nächste Frist
    const f = M.fristen({ heute })[0];
    kacheln.push({ cls: "akzent frist", k: "Nächste Frist", v: f ? Z.esc(f.titel.replace(" (ILIAS)", "")) : "–", text: true, pfad: (f && f.pfad) || SEITE.termine,
      s: f ? (f.laeuft ? `läuft · bis ${Z.kurz(f.ende)}` : `${Z.kurz(f.datum)} · ${sub(f.datum)}`) + (f.geschaetzt ? " · geschätzt" : "") : "keine offenen Fristen" });
    // Nächste Prüfung
    const p = M.naechstePruefung({ heute });
    kacheln.push({ cls: "", k: "Nächste Prüfung", v: p ? Z.esc(p.titel) : "Termin folgt", text: true, pfad: (p && p.pfad) || SEITE.pruefungen,
      s: p ? `${Z.kurz(p.datum)} · ${sub(p.datum)}` + (p.geschaetzt ? " · geschätzt" : "") : "Termine ab ca. Mitte Nov. bzw. Mai" });
    // Semester
    const s = D.aktuell;
    if (s) {
      const tb = Z.tageBis(s.vb, heute), te = Z.tageBis(s.ve, heute), tse = Z.tageBis(s.ende, heute);
      const tag = (n) => (n === 0 ? "heute" : n === 1 ? "morgen" : n < 0 ? "vorbei" : `in ${n} Tagen`);
      const phase = D.vorStart ? "vor Studienbeginn" : heute < s.vb ? "Vorlesungsfrei" : heute <= s.ve ? "Vorlesungszeit" : "Vorlesungsfreie Zeit";
      const phaseSub = heute < s.vb ? `Vorlesungsbeginn ${tag(tb)}` : heute <= s.ve ? `noch ${Z.plural(te, "Tag", "Tage")} Vorlesungen` : `Semesterende ${tag(tse)}`;
      const pct = Math.max(0, Math.min(100, Math.round((Z.tage(s.beginn, heute) / Math.max(1, Z.tage(s.beginn, s.ende))) * 100)));
      kacheln.push(D.vorStart
        ? { cls: "", k: "Semester", v: `Start <small>${tag(Z.tageBis(s.beginn, heute))}</small>`, s: phaseSub, fortschritt: [pct, 100], pfad: SEITE.verlauf }
        : { cls: "", k: "Semester", v: `${s.fs}. FS <small>${Z.esc(s.name)}</small>`, s: `${phase} · ${phaseSub}`, fortschritt: [pct, 100], pfad: SEITE.verlauf });
    } else kacheln.push({ cls: "", k: "Semester", v: "–", s: "Semesterdaten fehlen", pfad: SEITE.verlauf });
    // ECTS und Note
    const E = M.ects(), N = M.noten();
    const zahl = (x) => String(Math.round(x * 100) / 100).replace(".", ",");
    kacheln.push({ cls: "", k: "ECTS", v: `${zahl(E.ist)}<small>/ ${E.gesamt}</small>`, s: `Orientierungsprüfung ${E.op} / 4`, fortschritt: [Math.min(E.ist, E.gesamt), E.gesamt], pfad: SEITE.noten });
    kacheln.push({ cls: "", k: "Gesamtnote", v: N.note, s: Z.esc(N.unter), pfad: SEITE.noten });
    return { gruss, datum, kacheln, leiste: s ? leisteBauen(M, s, heute) : null };
  };

  // Leiste „Semesterverlauf“: eine Zelle je Kalenderwoche des Semesters (ab dem Montag der Woche des Semesterbeginns).
  // Art: p Prüfungsphase (Semesterdaten), w Pause (Donnerstag der Woche in einer Pause), v Vorlesungszeit, f vorlesungsfrei.
  // „diese Woche“ ist die Planwoche (am Wochenende die kommende), vorbei alles davor.
  const leisteBauen = (M, s, heute) => {
    const Z = M.zeit, D = M.daten();
    const gs = Z.montag(s.beginn), n = Math.ceil((Z.tage(gs, s.ende) + 1) / 7);
    const phasen = D.pruefungsphasen.filter((x) => x.von <= s.ende && x.bis >= s.beginn);
    const pausen = D.pausen.filter((x) => x.bis >= s.beginn && x.von <= s.ende);
    const jetzt = Z.tage(gs, M.planwoche(heute).mo) / 7;
    const wochen = [];
    for (let i = 0; i < n; i++) {
      const mo = Z.plus(gs, 7 * i), so = Z.plus(mo, 6), dO = Z.plus(mo, 3);
      const art = phasen.some((x) => x.von <= so && x.bis >= mo) ? "p" : pausen.some((x) => x.von <= dO && dO <= x.bis) ? "w"
        : s.vb && s.ve && so >= s.vb && mo <= s.ve ? "v" : "f";
      wochen.push({ art, zustand: i < jetzt ? "vorbei" : i === jetzt ? "jetzt" : "", titel: `KW ${Z.kw(mo)} · ${Z.kurz(mo, { jahr: false })}–${Z.kurz(so, { jahr: false })}` });
    }
    return { titel: `${s.name} · Semesterverlauf`, text: M.woche(heute).text, wochen, geschaetzt: phasen.slice(0, 3).some((x) => x.status === "geschätzt") };
  };

  // ---------- Listen (rein, testbar) ----------
  // → [{ sort, wann, bald, uhr, was, pfad, pille: { ton, text } }]
  const zeilenBauen = (art, M, heute) => {
    const Z = M.zeit, aus = [];
    const tagText = (iso) => { const n = Z.tageBis(iso, heute); return n === 0 ? "Heute" : n === 1 ? "Morgen" : Z.datum(iso, { bezug: heute }); };
    const bald = (iso) => { const n = Z.tageBis(iso, heute); return n === 0 || n === 1; };
    const pille = (ton, wort, t) => ({ ton: ton + (t && t.geschaetzt ? " leer" : ""), text: wort + (t && t.freiwillig ? " · freiwillig" : "") + (t && t.geschaetzt ? " · geschätzt" : "") });
    if (art === "fristen") {
      const bis = Z.plus(heute, 30);
      for (const f of M.fristen({ heute, tage: 30 })) {
        aus.push({ sort: f.stichtag, min: f.minuten, wann: f.laeuft ? `läuft bis ${Z.datum(f.ende, { bezug: heute })}` : tagText(f.datum), bald: !f.laeuft && bald(f.datum),
          uhr: f.laeuft ? f.bisZeit : f.ab || f.zeit, was: f.titel.replace(" (ILIAS)", ""), pfad: f.pfad, pille: pille("warn", "Frist", f) });
      }
      for (const p of M.pruefungen({ heute, ab: heute, bis })) {
        if (!p.offen) continue;
        aus.push({ sort: p.datum, min: p.minuten, wann: tagText(p.datum), bald: bald(p.datum), uhr: p.zeit, was: p.titel, pfad: p.pfad,
          pille: p.zwischentest ? pille("info", "Zwischentest", p) : pille("bad", "Prüfung", p) });
      }
      for (const a of M.abgaben({ heute, tage: 30 })) {
        aus.push({ sort: a.datum, min: null, wann: a.ueberfaellig ? "überfällig" : tagText(a.datum), bald: !a.ueberfaellig && bald(a.datum), uhr: "",
          was: `${a.code} · Blatt ${a.nummer}`, pfad: a.pfad, pille: { ton: "warn", text: "Abgabe" } });
      }
    } else if (art === "termine") {
      const bis14 = Z.plus(heute, 14), morgen = Z.plus(heute, 1);
      for (const t of M.termine()) {
        if (t.erledigt || t.ende < heute || ["Frist", "Prüfung"].indexOf(t.kategorie) >= 0) continue;
        const event = ["Fachschaft", "Veranstaltung"].indexOf(t.kategorie) >= 0;
        if (t.datum > (event ? morgen : bis14)) continue;
        aus.push({ sort: t.datum, min: t.minuten, wann: t.datum < heute ? `läuft bis ${Z.datum(t.ende, { bezug: heute })}` : tagText(t.datum), bald: t.datum >= heute && bald(t.datum),
          uhr: t.zeit, was: t.titel.replace(" (ILIAS)", ""), pfad: t.pfad, pille: pille(M.statusArt("termin", t.kategorie), t.kategorie, t) });
      }
    } else if (art === "pruefungen") {
      for (const p of M.pruefungen({ heute, ab: heute })) {
        if (p.erledigt) continue;
        aus.push({ sort: p.datum, min: p.minuten, wann: `${Z.datum(p.datum, { bezug: heute })} · ${Z.abstand(p.datum, heute)}`, bald: bald(p.datum), uhr: "",
          was: p.titel, pfad: p.pfad, pille: p.zwischentest ? { ton: "info", text: "Zwischentest" } : p.geschaetzt ? { ton: "leer", text: "geschätzt" } : null });
      }
    } else if (art === "nachzuarbeiten" && M.vorlesungen) {
      for (const v of M.vorlesungen()) {
        if (v.nachgearbeitet) continue;
        const m = v.code ? M.modul(v.code) : null;
        aus.push({ sort: v.datum, min: null, wann: (m && String(m.fm.kurz || "").trim()) || v.code, bald: false, uhr: "", was: v.titel, pfad: v.f.path, pille: null });
      }
    }
    aus.sort((a, b) => (a.sort < b.sort ? -1 : a.sort > b.sort ? 1 : 0) || ((a.min == null ? -1 : a.min) - (b.min == null ? -1 : b.min)));
    return GRENZE[art] ? aus.slice(0, GRENZE[art]) : aus;
  };

  // ---------- Zeichnen ----------
  const ohneModell = (el) => { el.empty(); el.createDiv({ cls: "eba-li-leer", text: "Erscheint, sobald Studium Autopilot die Daten gelesen hat." }); };
  const kachelnZeichnen = (el) => {
    const M = ctx.modell;
    if (!M || !M.fristen) { ohneModell(el); return; }
    const K = kachelnBauen(M, ctx.date.jetzt()), esc = M.zeit.esc;
    // Wochentag und Datum getrennt: am iPhone zweizeilig rechts neben dem Gruß, sonst eine Zeile (Komma per CSS, Abschnitt 8)
    const [wt, tag] = K.datum.split(", ");
    let h = `<div class="eba-kz"><div class="eba-kz-kopf"><h1 class="eba-kz-gruss">${esc(K.gruss)}</h1><span class="eba-kz-datum"><b>${esc(wt)}</b> <b>${esc(tag)}</b></span></div><div class="eba-kz-reihe">`;
    for (const k of K.kacheln) {
      const ziel = k.pfad ? ` role="link" tabindex="0" data-pfad="${esc(k.pfad)}"` : "";
      h += `<div class="eba-kachel${k.cls ? " " + k.cls : ""}"${ziel}><span class="k">${k.k}</span><span class="v${k.text ? " text" : ""}">${k.v}</span><span class="s">${k.s}</span>`
        + (k.fortschritt ? `<progress max="${k.fortschritt[1]}" value="${k.fortschritt[0]}"></progress>` : "") + `</div>`;
    }
    h += `</div>`;
    const L = K.leiste;
    if (L) {
      h += `<div class="eba-leiste"><div class="eba-leiste-kopf"><span class="k">${esc(L.titel)}</span><span class="s"><b>${esc(L.text)}</b></span></div><div class="eba-wochen">`
        + L.wochen.map((w) => `<i class="${w.art}${w.zustand ? " " + w.zustand : ""}" title="${esc(w.titel)}"></i>`).join("")
        + `</div><div class="eba-legende"><span class="v">Vorlesungszeit</span><span class="w">Pause</span><span class="p">Prüfungen${L.geschaetzt ? " (geschätzt)" : ""}</span>`
        + `<span>vorlesungsfrei</span><span class="jetzt">diese Woche</span></div></div>`;
    }
    el.innerHTML = h + `</div>`;
    // Kachel antippen öffnet ihre Notiz (Bearbeitungsansicht: nicht in den Quelltext springen)
    for (const k of el.querySelectorAll(".eba-kachel[data-pfad]")) {
      const los = (e) => { e.preventDefault(); e.stopPropagation(); ctx.oeffnen(k.getAttribute("data-pfad"), { neu: !!(e.ctrlKey || e.metaKey) }); };
      k.addEventListener("mousedown", (e) => e.stopPropagation());
      k.addEventListener("click", los);
      k.addEventListener("keydown", (e) => { if (e.key === "Enter") los(e); });
    }
  };

  const listeZeichnen = (el, art, c) => {
    const M = ctx.modell;
    if (!M || !M.fristen) { ohneModell(el); return; }
    const Z = M.zeit, zeilen = zeilenBauen(art, M, Z.heute());
    el.empty();
    const box = el.createDiv({ cls: "eba-li eba-li-" + art, attr: { lang: "de" } });
    if (!zeilen.length) { box.createDiv({ cls: "eba-li-leer", text: LEER[art] }); return; }
    const quelle = (c && c.sourcePath) || "";
    for (const z of zeilen) {
      const r = box.createDiv({ cls: "eba-li-zeile" });
      const w = r.createSpan({ cls: "eba-li-wann" + (z.bald ? " eba-bald" : ""), text: z.wann });
      if (z.uhr) w.createSpan({ cls: "eba-li-uhr", text: " · " + z.uhr });
      const a = r.createEl("a", { cls: "internal-link eba-li-was", text: z.was, href: z.pfad, attr: { "data-href": z.pfad } });
      a.addEventListener("mousedown", (e) => e.stopPropagation()); // Bearbeitungsansicht: nicht in den Quelltext springen
      a.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); ctx.oeffnen(z.pfad, { quelle, neu: e.ctrlKey || e.metaKey }); });
      if (z.pille) r.createSpan({ cls: "eba-pill " + z.pille.ton + " eba-li-art", text: z.pille.text });
    }
  };

  // Welche Liste: zuerst der Ersatztext des Blocks („Fristen erscheinen …“), denn in verschachtelten Karten liefert Obsidian
  // den Abschnitt der äußeren Karte, und dort stehen beide Listen des Dashboards; sonst das Argument der Kopfzeile.
  const artVon = (quelle, el, c) => {
    const q = String(quelle || "").toLowerCase();
    if (/nacharbeit/.test(q)) return "nachzuarbeiten";
    if (/prüfungstermine|prüfungen erscheinen/.test(q)) return "pruefungen"; // „Prüfungstermine“: Seiten vor 0.4.6
    if (/termine/.test(q)) return "termine";
    if (/fristen/.test(q)) return "fristen";
    return ctx.modell && ctx.modell.blockArgument ? ctx.modell.blockArgument(el, c, "eba-liste", LISTEN, "fristen") : "fristen";
  };

  // Zahl am Reiter (reiter.js, Dashboard): so viele Zeilen zeigt ein Block gerade; Art aus dem Argument der Kopfzeile,
  // sonst wie der Block aus dem Ersatztext. Ohne Modell null (dann keine Zahl).
  const zaehler = {
    "eba-liste": (arg, quelle) => {
      const M = ctx.modell;
      if (!M || !M.fristen) return null;
      const a = String(arg || "").toLowerCase();
      return zeilenBauen(LISTEN.indexOf(a) >= 0 ? a : artVon(quelle), M, M.zeit.heute()).length;
    },
  };

  const registrieren = () => {
    const kacheln = ctx.codeblock("eba-kacheln", (_q, el) => {
      try { kachelnZeichnen(el); } catch (e) { console.error("eba-kacheln", e); el.setText("Kacheln: Fehler – " + e.message); }
    });
    const listen = ctx.codeblock("eba-liste", (quelle, el, c, inst) => {
      inst.art = artVon(quelle, el, c);
      try { listeZeichnen(el, inst.art, c); } catch (e) { console.error("eba-liste", e); el.setText("Liste: Fehler – " + e.message); }
    });
    const alle = () => {
      for (const i of kacheln.instanzen()) { try { kachelnZeichnen(i.el); } catch (e) { console.error("eba-kacheln", e); } }
      for (const i of listen.instanzen()) { try { listeZeichnen(i.el, i.art || "fristen", i.ctx); } catch (e) { console.error("eba-liste", e); } }
    };
    // Das Plugin startet die Erweiterungen alphabetisch, modell.js also nach dashboard.js: dann kurz danach anmelden und zeichnen
    if (ctx.modell && ctx.modell.beiAenderung) ctx.aufraeumen(ctx.modell.beiAenderung(alle));
    else ctx.zeit(() => { if (ctx.modell && ctx.modell.beiAenderung) { ctx.aufraeumen(ctx.modell.beiAenderung(alle)); alle(); } }, 3000);
    // „Nachzuarbeiten“: Vorlesungsnotizen liegen außerhalb der Ordner, die das Modell meldet (Haken im Kopf der Notiz, neue Notiz,
    // umbenannt: sonst zeigten die Links bis zum nächsten Zeichnen auf den alten Namen). Nicht über das Modell: Jede Änderung
    // beim Schreiben einer Mitschrift zeichnete dann alle Bildschirme neu, die sich dort angemeldet haben.
    const nachBald = ctx.entprellen(() => {
      for (const i of listen.instanzen()) if (i.art === "nachzuarbeiten") { try { listeZeichnen(i.el, i.art, i.ctx); } catch (e) { console.error("eba-liste", e); } }
    }, 600);
    const vorlesung = (cache) => !!(cache && cache.frontmatter && cache.frontmatter.typ === "vorlesung");
    ctx.an(window.app.metadataCache, "changed", (_f, _d, cache) => { if (vorlesung(cache)) nachBald(); });
    ctx.an(window.app.metadataCache, "deleted", (_f, vorher) => { if (vorlesung(vorher)) nachBald(); });
    ctx.an(window.app.vault, "rename", (f) => { if (vorlesung(window.app.metadataCache.getFileCache(f))) nachBald(); });
    ctx.dom(document, "visibilitychange", () => { if (document.visibilityState === "visible") alle(); });
    ctx.intervall(() => { if (document.visibilityState === "visible") alle(); }, 10 * 60 * 1000);
  };

  return { registrieren, kachelnBauen, leisteBauen, zeilenBauen, artVon, zaehler };
};
