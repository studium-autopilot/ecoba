// Angebote der Uni aus den zentralen Daten: Vorträge (Studium Generale, WiSo-Fakultät), Kurse der Unibibliothek, Hochschulsport
// und Welcome Center. Daten: angebote.json der zentralen Daten (docs/daten-v1.md), geholt und geprüft von zentral.js, nur
// gerätelokal gespeichert (ctx.zentral.angebote()).
// Anzeige (seit 0.7.0): als Termine im Kalender und in der Agenda auf Termine & Anmeldungen, in der Farbe der Veranstaltungen
// (kalender.js, termine.js über ctx.angeboteAnzeige.termine()). Der Titel nennt die Art vorn („Vortrag: …“) und führt zur Seite
// der Uni. Beim Hochschulsport steht der Buchungsbeginn als eigener Termin an dem Tag, an dem die Buchung öffnet. Was schon als
// Termin-Notiz dasteht (gleicher Tag; gleiche Uhrzeit und ein Titel steckt im anderen, ohne Uhrzeit derselbe Titel), kommt nicht
// doppelt. Bis 0.6.14 stand
// eine eigene Liste im Codeblock ```eba-angebote``` unter der Agenda (Chips je Art, 14 Tage, „Mehr anzeigen“), davor, solange
// nichts gewählt war, die Karte mit den Häkchen mitten auf der Seite. Steht der Block noch auf einer selbst geänderten Seite,
// zeigt er nur einen Satz.
// Auswahl: Häkchen im Fenster „Im Kalender zeigen“ (Filter-Symbol im Kopf des Kalenders, ctx.angeboteAnzeige.filter()) und in
// der Einrichtung (eigener Bildschirm seit 25.10.2026, ctx.angeboteAnzeige.wahl; sie schreibt die Auswahl zusammen mit ihrem
// Stand). Vorgabe, solange nichts gespeichert ist: Hochschulsport, Kurse der Unibibliothek und Vorträge der WiSo-Fakultät an;
// Studium Generale, Welcome Center und unbekannte Vortragsreihen aus. Dazu der Schalter „Fachschaft & Veranstaltungen“, der
// dasselbe Feld setzt wie im Fenster „Zentrale Daten“. Gespeichert wird synchronisiert in System/Einstellungen.md
// (angebote_auswahl, angebote_gewaehlt, zentrale_veranstaltungen). Sonst schreibt das Skript nichts.
// Erweiterung: registrieren() meldet den Codeblock an und setzt ctx.angeboteAnzeige. Neue Angebote (zentral.js ruft neu()) und
// eine geänderte Auswahl (auch per Sync von einem anderen Gerät) meldet das Ereignis „eba-angebote“ am document; Kalender und
// Agenda zeichnen dann neu. zentral.js lädt nach diesem Skript, darum alles erst beim Abruf nachschlagen.
// Stil: eba-core.css Abschnitt 53. iOS-sicher: kein Lookbehind, kein .at()/findLast/structuredClone.
module.exports = function (ctx) {
  const app = window.app;
  const SPRACHE = "eba-angebote";
  const EREIGNIS = "eba-angebote"; // am document: Angebote oder Auswahl geändert
  const EINSTELLUNGEN = "System/Einstellungen.md";
  const FELD = { auswahl: "angebote_auswahl", gewaehlt: "angebote_gewaehlt", veranstaltungen: "zentrale_veranstaltungen" };
  // Art vorn im Titel: Kalender und Agenda sagen so ohne eigene Zeile, was es ist („Vortrag: Temeswar“)
  const ARTEN = { vortrag: "Vortrag", ub: "Unibibliothek", sport: "Hochschulsport", welcome: "Welcome Center" };

  // ---------- Auswahl (rein, testbar) ----------
  // Schlüssel: Art (sport, ub, welcome); Vorträge je Reihe. Bekannte Reihen erkennt ein Muster (robust gegen kleine
  // Namensänderungen), jede andere Reihe bekommt „vortrag-<name>“ und ist zunächst aus.
  const VORTRAG_REIHEN = [
    { schluessel: "vortrag-wiso", name: "Vorträge der WiSo-Fakultät", muster: /wiso|wirtschafts\W*und\W*sozialwiss/i, an: true },
    { schluessel: "vortrag-studium-generale", name: "Studium Generale", muster: /studium\W*generale/i, an: false },
  ];
  // „UB“ kennt am Anfang des Studiums kaum jemand: ausgeschrieben. Nur Namen, keine Zeile darunter (bis 0.6.14 je Eintrag ein Satz,
  // worum es geht)
  const VORN = [{ schluessel: "sport", name: "Hochschulsport", an: true }, { schluessel: "ub", name: "Kurse der Unibibliothek", an: true }];
  const WELCOME = { schluessel: "welcome", name: "Welcome Center", an: false };
  const FACHSCHAFT = { schluessel: "fachschaft", name: "Fachschaft & Veranstaltungen" };
  const VORGABE = VORN.concat(VORTRAG_REIHEN, [WELCOME]).filter((e) => e.an).map((e) => e.schluessel);
  const kennung = (s) => {
    let x = String(s || "").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss");
    try { x = x.normalize("NFKD").replace(/[̀-ͯ]/g, ""); } catch (e) { /* ohne normalize */ }
    return x.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40).replace(/-+$/, "");
  };
  const wahlSchluessel = (a) => {
    if (a.kategorie !== "vortrag") return a.kategorie;
    const r = VORTRAG_REIHEN.find((x) => x.muster.test(a.reihe));
    return r ? r.schluessel : "vortrag-" + kennung(a.reihe);
  };
  // Einträge der Karte: feste in fester Reihenfolge, dazwischen weitere Vortragsreihen aus den Daten (nach Namen)
  const wahlEintraege = (liste) => {
    const fest = VORN.concat(VORTRAG_REIHEN);
    const weitere = {};
    for (const a of liste || []) {
      const k = a.kategorie === "vortrag" ? wahlSchluessel(a) : "";
      if (k && !fest.some((e) => e.schluessel === k) && !weitere[k]) weitere[k] = { schluessel: k, name: a.reihe, an: false };
    }
    const neu = Object.keys(weitere).map((k) => weitere[k]).sort((x, y) => x.name.localeCompare(y.name, "de"));
    return fest.concat(neu, [WELCOME]).map((e) => ({ schluessel: e.schluessel, name: e.name, an: e.an }));
  };
  // „Fachschaft & Veranstaltungen“: wie zentral.js – fehlt das Feld, ist es an
  const istAn = (v) => v !== false && String(v).toLowerCase() !== "false";
  // Frontmatter der Einstellungen → { gewaehlt, auswahl (Schlüssel; ohne gespeicherte Auswahl die Vorgabe), veranstaltungen }
  const wahlLesen = (fm) => {
    fm = fm || {};
    const gewaehlt = fm[FELD.gewaehlt] === true;
    const roh = fm[FELD.auswahl];
    const liste = (Array.isArray(roh) ? roh : typeof roh === "string" ? [roh] : []).map((x) => String(x == null ? "" : x).trim()).filter(Boolean);
    return { gewaehlt, auswahl: gewaehlt ? liste : VORGABE.slice(), veranstaltungen: istAn(fm[FELD.veranstaltungen]) };
  };
  // Neue Auswahl nach „Fertig“: angehakte Einträge in ihrer Reihenfolge, dazu frühere Schlüssel, die die Karte gerade nicht
  // zeigt (eine Reihe, die im nächsten Semester wiederkommt, bleibt gewählt)
  const wahlNeu = (alt, eintraege, haken) => {
    const gezeigt = eintraege.map((e) => e.schluessel);
    const aus = eintraege.filter((e) => haken[e.schluessel]).map((e) => e.schluessel);
    for (const k of alt || []) if (gezeigt.indexOf(k) < 0 && aus.indexOf(k) < 0) aus.push(k);
    return aus;
  };
  // Zu schreibende Felder gegenüber dem Frontmatter fm. zentrale_veranstaltungen nur bei geändertem Wert, damit ein fehlendes
  // Feld (= an) nicht ohne Grund dazukommt.
  const wahlFelder = (fm, auswahl, veranstaltungen) => {
    const x = { [FELD.auswahl]: auswahl.slice(), [FELD.gewaehlt]: true };
    if (istAn((fm || {})[FELD.veranstaltungen]) !== veranstaltungen) x[FELD.veranstaltungen] = veranstaltungen;
    return x;
  };
  // In das Frontmatter schreiben (innerhalb von processFrontMatter)
  const wahlSchreiben = (fm, auswahl, veranstaltungen) => Object.assign(fm, wahlFelder(fm, auswahl, veranstaltungen));

  // ---------- Termine für Kalender und Agenda (rein, testbar) ----------
  // Titel mit der Art vorn; nennt der Titel sie schon, bleibt er
  const titelVon = (a) => {
    const art = ARTEN[a.kategorie];
    return String(a.titel).toLowerCase().indexOf(art.toLowerCase()) >= 0 ? a.titel : `${art}: ${a.titel}`;
  };
  // Vergleichstext: klein, Umlaute aufgelöst, nur Buchstaben und Ziffern, Wörter mit je einem Leerzeichen (auch an den Rändern)
  const vergleich = (s) => ` ${String(s || "").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, " ").trim()} `;
  // Derselbe Termin? Der kürzere Titel (mindestens 4 Zeichen) steht als ganze Wörter im längeren: „Zotero“ in „UB-Kurs: Zotero“
  const gleicherTitel = (x, y) => {
    const a = vergleich(x), b = vergleich(y);
    const kurz = a.length <= b.length ? a : b, lang = kurz === a ? b : a;
    return kurz.trim().length >= 4 && lang.indexOf(kurz) >= 0;
  };
  const minutenVon = (hm) => (/^\d{2}:\d{2}$/.test(hm || "") ? Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5)) : null);
  // liste = geprüfte Angebote (zentral.js), o = { auswahl: [Schlüssel] (gewählte Arten und Vortragsreihen), vorhanden: [{ datum,
  // titel, minuten }] (Termin-Notizen, ctx.modell.termine()) } → [{ id, datum, zeit, minuten, titel, url, kategorie, buchung }]
  // nach Tag, Uhrzeit und Titel. zeit wie bei Termin-Notizen („18:15–19:45“, „18:15“ oder leer). Ein Angebot, das schon als
  // Termin dasteht, fällt weg, sein Buchungsbeginn nicht: gleicher Tag und gleiche Uhrzeit, ein Titel steckt im anderen („Zotero“
  // in „UB-Kurs: Zotero“); fehlt eine Uhrzeit, nur bei gleichem Titel (sonst schluckte ein „Stammtisch“ jeden anderen am Tag).
  const termineVon = (liste, o) => {
    o = o || {};
    const auswahl = o.auswahl || [], vorhanden = o.vorhanden || [];
    const doppelt = (datum, titel, min) => vorhanden.some((v) => v.datum === datum
      && (v.minuten == null || min == null ? vergleich(v.titel) === vergleich(titel) : v.minuten === min && gleicherTitel(v.titel, titel)));
    const aus = [];
    for (const a of liste || []) {
      if (!ARTEN[a.kategorie] || auswahl.indexOf(wahlSchluessel(a)) < 0) continue;
      const min = minutenVon(a.von);
      if (!doppelt(a.datum, a.titel, min)) {
        aus.push({ id: a.id, datum: a.datum, zeit: a.von ? a.von + (a.bis ? "–" + a.bis : "") : "", minuten: min, titel: titelVon(a), url: a.url,
          kategorie: a.kategorie, buchung: false });
      }
      const ab = a.kategorie === "sport" && a.anmeldung && a.anmeldung.ab;
      if (ab) {
        const zeit = ab.slice(11, 16);
        aus.push({ id: a.id + "-buchung", datum: ab.slice(0, 10), zeit, minuten: minutenVon(zeit), titel: `${titelVon(a)} – Buchungsstart`, url: a.url,
          kategorie: a.kategorie, buchung: true });
      }
    }
    const zahl = (m) => (m == null ? -1 : m);
    return aus.sort((x, y) => (x.datum < y.datum ? -1 : x.datum > y.datum ? 1 : 0) || zahl(x.minuten) - zahl(y.minuten) || x.titel.localeCompare(y.titel, "de"));
  };

  // ---------- Zustand bis zum Neustart ----------
  // entwurf: Häkchen, die noch nicht gespeichert sind (überleben in der Einrichtung „Zurück“); gespeichert: eben geschriebene
  // Auswahl, bis der metadataCache sie liefert (höchstens 10 s)
  const ansicht = ctx.bleibend("zustand", () => ({ entwurf: {}, gespeichert: null }));

  const einstellungen = () => {
    const f = app.vault.getAbstractFileByPath(EINSTELLUNGEN);
    const c = f && app.metadataCache.getFileCache(f);
    return (c && c.frontmatter) || {};
  };
  const wahlAktuell = () => {
    const w = wahlLesen(einstellungen()), g = ansicht.gespeichert;
    if (!g) return w;
    const gleich = w.gewaehlt && JSON.stringify(w.auswahl) === JSON.stringify(g.auswahl) && w.veranstaltungen === g.veranstaltungen;
    if (gleich || Date.now() - g.zeit > 10000) { ansicht.gespeichert = null; return w; }
    return { gewaehlt: true, auswahl: g.auswahl, veranstaltungen: g.veranstaltungen };
  };
  // Kalender und Agenda neu zeichnen lassen; merkt sich die gemeldete Auswahl (registrieren: nur eine geänderte meldet sich)
  let gemeldet = "";
  const melden = () => {
    gemeldet = JSON.stringify(wahlAktuell().auswahl);
    try { document.dispatchEvent(new CustomEvent(EREIGNIS)); } catch (e) { console.error(SPRACHE, e); }
  };
  const datenListe = () => { const Z = ctx.zentral, d = Z && Z.angebote ? Z.angebote() : null; return d ? d.angebote : []; };

  // Termine der gewählten Angebote für Kalender und Agenda; ohne Daten (nie geholt, zentrale Daten aus) keine
  const termineJetzt = () => {
    const liste = datenListe();
    if (!liste.length) return [];
    const M = ctx.modell;
    return termineVon(liste, { auswahl: wahlAktuell().auswahl, vorhanden: M && M.termine ? M.termine() : [] });
  };

  // ---------- Häkchen ----------
  // Häkchen in gruppe, für das Fenster und den Bildschirm der Einrichtung. Haken der Einstellungen, darüber der Entwurf.
  // → { werte() → { auswahl, veranstaltungen }, gespeichert() (nach dem Schreiben: gilt sofort, Kalender und Agenda neu) }
  const wahlListe = (gruppe, w, liste) => {
    const eintraege = wahlEintraege(liste);
    const haken = {};
    for (const e of eintraege) haken[e.schluessel] = w.auswahl.indexOf(e.schluessel) >= 0;
    haken[FACHSCHAFT.schluessel] = w.veranstaltungen;
    Object.keys(ansicht.entwurf).forEach((k) => { if (Object.prototype.hasOwnProperty.call(haken, k)) haken[k] = !!ansicht.entwurf[k]; });
    eintraege.concat([FACHSCHAFT]).forEach((e) => {
      const z = gruppe.createEl("label", { cls: "eba-ang-wahl-zeile", attr: { "data-wahl": e.schluessel } });
      const cb = z.createEl("input", { attr: { type: "checkbox" } });
      cb.checked = haken[e.schluessel];
      z.createSpan({ text: e.name });
      cb.addEventListener("change", () => { haken[e.schluessel] = cb.checked; ansicht.entwurf[e.schluessel] = cb.checked; });
    });
    const werte = () => ({ auswahl: wahlNeu(w.auswahl, eintraege, haken), veranstaltungen: !!haken[FACHSCHAFT.schluessel] });
    const gespeichert = () => {
      ansicht.gespeichert = Object.assign(werte(), { zeit: Date.now() });
      ansicht.entwurf = {};
      melden();
    };
    return { werte, gespeichert };
  };
  const gruppeAnlegen = (el) => el.createDiv({ cls: "eba-ang-wahl", attr: { role: "group", "aria-label": "Angebote auswählen" } });

  // Fenster „Im Kalender zeigen“ (Filter-Symbol im Kopf des Kalenders): Häkchen und „Fertig“. Schließen ohne „Fertig“ verwirft
  // die Häkchen; unverändert schreibt „Fertig“ nur, wenn noch nie gewählt wurde.
  const filterOeffnen = () => {
    const m = new ctx.obsidian.Modal(app);
    m.modalEl.addClass("eba-modal", "eba-modal-angebote");
    m.titleEl.setText("Im Kalender zeigen");
    ansicht.entwurf = {};
    const w = wahlAktuell();
    const wahl = wahlListe(gruppeAnlegen(m.contentEl), w, datenListe());
    const fertig = m.contentEl.createDiv({ cls: "modal-button-container" }).createEl("button", { cls: "mod-cta", text: "Fertig", attr: { type: "button" } });
    fertig.addEventListener("click", async () => {
      const x = wahl.werte();
      if (w.gewaehlt && JSON.stringify(x.auswahl) === JSON.stringify(w.auswahl) && x.veranstaltungen === w.veranstaltungen) { m.close(); return; }
      fertig.disabled = true;
      try {
        const f = app.vault.getAbstractFileByPath(EINSTELLUNGEN);
        if (!f) throw new Error(EINSTELLUNGEN + " fehlt");
        await app.fileManager.processFrontMatter(f, (fm) => { wahlSchreiben(fm, x.auswahl, x.veranstaltungen); });
      } catch (e) {
        console.error(SPRACHE, e);
        ctx.hinweis("Deine Auswahl konnte nicht gespeichert werden. Versuch es bitte noch einmal.");
        fertig.disabled = false;
        return;
      }
      wahl.gespeichert();
      m.close();
    });
    m.onClose = () => { m.contentEl.empty(); ansicht.entwurf = {}; };
    m.open();
  };

  // Bildschirm der Einrichtung (einrichtung.js): dieselben Häkchen in el, ohne eigenen Knopf. Die Einrichtung schreibt felder()
  // zusammen mit ihrem Stand und ruft danach gespeichert().
  const wahlFuerEinrichtung = (el) => {
    const wahl = wahlListe(gruppeAnlegen(el), wahlAktuell(), datenListe());
    return { felder: () => { const x = wahl.werte(); return wahlFelder(einstellungen(), x.auswahl, x.veranstaltungen); }, gespeichert: wahl.gespeichert };
  };
  // Gesetzte Häkchen (Zusammenfassung der Einrichtung): gezeigte Einträge und „Fachschaft & Veranstaltungen“; null, solange
  // nichts gewählt ist
  const wahlZahl = () => {
    const w = wahlAktuell();
    if (!w.gewaehlt) return null;
    return wahlEintraege(datenListe()).filter((e) => w.auswahl.indexOf(e.schluessel) >= 0).length + (w.veranstaltungen ? 1 : 0);
  };

  const registrieren = () => {
    // Alter Codeblock auf einer selbst geänderten Seite (bis 0.6.14 die Liste)
    ctx.codeblock(SPRACHE, (quelle, el) => {
      el.empty();
      el.createDiv({ cls: "eba-ang-leer", text: "Angebote der Uni stehen jetzt im Kalender oben." });
    });
    const anzeige = { neu: melden, termine: termineJetzt, filter: filterOeffnen, wahl: wahlFuerEinrichtung, wahlZahl };
    ctx.angeboteAnzeige = anzeige;
    ctx.aufraeumen(() => { if (ctx.angeboteAnzeige === anzeige) ctx.angeboteAnzeige = null; });
    // Auswahl geändert, auch per Sync von einem anderen Gerät; andere Felder der Einstellungen lassen Kalender und Agenda in Ruhe
    gemeldet = JSON.stringify(wahlAktuell().auswahl);
    const bald = ctx.entprellen(() => { if (JSON.stringify(wahlAktuell().auswahl) !== gemeldet) melden(); }, 300);
    ctx.an(app.metadataCache, "changed", (f) => { if (f && f.path === EINSTELLUNGEN) bald(); });
  };

  return { registrieren, termineVon, titelVon, gleicherTitel, wahlLesen, wahlFelder, wahlSchreiben, wahlNeu, wahlEintraege, wahlSchluessel, VORGABE };
};
