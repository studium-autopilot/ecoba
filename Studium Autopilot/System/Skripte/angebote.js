// Angebote der Uni aus den zentralen Daten: Codeblock ```eba-angebote``` (Seite Termine & Anmeldungen). Vorträge (Studium
// Generale, WiSo-Fakultät), Kurse der Unibibliothek, Hochschulsport und Welcome Center der nächsten Wochen. Daten: angebote.json der zentralen
// Daten (docs/daten-v1.md), geholt und geprüft von zentral.js, nur gerätelokal gespeichert (ctx.zentral.angebote()).
// Auswahl: Beim ersten Mal (noch keine Auswahl gespeichert) zeigt der Block statt der Liste eine Karte „Welche Angebote willst
// du sehen?“ mit Häkchen und „Fertig“. Vorgabe: Hochschulsport, Kurse der Unibibliothek und Vorträge der WiSo-Fakultät an; Studium Generale,
// Welcome Center und unbekannte Vortragsreihen aus.
// Dazu der Schalter „Fachschaft & Veranstaltungen“, der dasselbe Feld setzt wie im Fenster „Zentrale Daten“. Gespeichert wird
// synchronisiert in System/Einstellungen.md (angebote_auswahl, angebote_gewaehlt, zentrale_veranstaltungen); „Auswahl ändern“
// im Fuß öffnet die Karte wieder. Sonst schreibt das Skript nichts. Dieselben Häkchen zeigt die Einrichtung als eigenen
// Bildschirm (seit 25.10.2026, ctx.angeboteAnzeige.wahl); sie schreibt die Auswahl zusammen mit ihrem Stand.
// Anzeige: Chips je gewählter Art mit Anzahl (schnelles Ein- und Ausblenden, nur bis zum Neustart), Liste nach Tagen für die
// nächsten 14 Tage, der Rest hinter „Mehr anzeigen“. Je Zeile Uhrzeit · Titel (Link zur Seite der Uni) · Reihe, Ort, online.
// Beim Hochschulsport steht der Buchungsbeginn als eigene Zeile („ab 17:00“) an dem Tag, an dem die Buchung öffnet.
// Erweiterung: registrieren() meldet den Codeblock an und setzt ctx.angeboteAnzeige (zentral.js zeichnet damit neu, sobald
// neue Angebote da sind). zentral.js lädt nach diesem Skript, darum alles erst beim Zeichnen nachschlagen. Neu gezeichnet
// auch, wenn sich die Einstellungen ändern (z. B. Auswahl auf einem anderen Gerät), und (Prüfung alle 5 Min. und zurück in
// der App) sobald ein neuer Tag ist oder die Liste 15 Min. alt ist (vergangene Vorträge, abgelaufene Anmeldungen verschwinden).
// Stil: eba-core.css, Klassen eba-ang-* (Farben je Art setzt das CSS). iOS-sicher: kein Lookbehind, kein .at()/findLast/
// structuredClone.
module.exports = function (ctx) {
  const app = window.app;
  const SPRACHE = "eba-angebote";
  const EINSTELLUNGEN = "System/Einstellungen.md";
  const FELD = { auswahl: "angebote_auswahl", gewaehlt: "angebote_gewaehlt", veranstaltungen: "zentrale_veranstaltungen" };
  const ARTEN = [
    { id: "vortrag", name: "Vorträge" },
    { id: "ub", name: "Unibibliothek" },
    { id: "sport", name: "Hochschulsport" },
    { id: "welcome", name: "Welcome Center" },
  ];
  const FENSTER = 14; // Tage, die gleich zu sehen sind (heute eingeschlossen)
  const TAGE = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

  // ---------- Datum und Text ----------
  const pad = (n) => String(n).padStart(2, "0");
  const isoVon = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const datumVon = (iso) => { const t = iso.split("-").map(Number); return new Date(t[0], t[1] - 1, t[2]); };
  const plusTage = (iso, n) => { const d = datumVon(iso); d.setDate(d.getDate() + n); return isoVon(d); };
  const dm = (iso) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.`;
  const dmy = (iso) => `${dm(iso)}${iso.slice(0, 4)}`;
  const wochentag = (iso) => TAGE[datumVon(iso).getDay()];
  const uhr = (hm) => (hm ? `${Number(hm.slice(0, 2))}:${hm.slice(3, 5)}` : ""); // „08:00“ → „8:00“
  // Zeitpunkt der Anmeldung („2026-10-19“ oder „2026-10-19T17:00“) → „19.10.“ bzw. „19.10., 17:00“
  const zeitpunktText = (s) => dm(s.slice(0, 10)) + (s.length > 10 ? ", " + uhr(s.slice(11, 16)) : "");

  // ---------- Auswahl (rein, testbar) ----------
  // Schlüssel: Art (sport, ub, welcome); Vorträge je Reihe. Bekannte Reihen erkennt ein Muster (robust gegen kleine
  // Namensänderungen), jede andere Reihe bekommt „vortrag-<name>“ und ist zunächst aus.
  const VORTRAG_REIHEN = [
    { schluessel: "vortrag-wiso", name: "Vorträge der WiSo-Fakultät", muster: /wiso|wirtschafts\W*und\W*sozialwiss/i, an: true },
    { schluessel: "vortrag-studium-generale", name: "Studium Generale", muster: /studium\W*generale/i, an: false },
  ];
  // „UB“ kennt am Anfang des Studiums kaum jemand: ausgeschrieben, mit einem Satz, worum es geht
  const VORN = [{ schluessel: "sport", name: "Hochschulsport", an: true },
    { schluessel: "ub", name: "Kurse der Unibibliothek", hinweis: "Literatur finden, richtig zitieren, Lerntechniken", an: true }];
  const WELCOME = { schluessel: "welcome", name: "Welcome Center", hinweis: "vor allem für Promovierende und Postdocs", an: false };
  const FACHSCHAFT = { schluessel: "fachschaft", name: "Fachschaft & Veranstaltungen", hinweis: "Partys und Infoabende als Termine im Kalender" };
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
  const artVon = (schluessel) => (schluessel.indexOf("vortrag-") === 0 ? "vortrag" : schluessel);
  // Einträge der Karte: feste in fester Reihenfolge, dazwischen weitere Vortragsreihen aus den Daten (nach Namen)
  const wahlEintraege = (liste) => {
    const fest = VORN.concat(VORTRAG_REIHEN);
    const weitere = {};
    for (const a of liste || []) {
      const k = a.kategorie === "vortrag" ? wahlSchluessel(a) : "";
      if (k && !fest.some((e) => e.schluessel === k) && !weitere[k]) weitere[k] = { schluessel: k, name: a.reihe, hinweis: "Vortragsreihe", an: false };
    }
    const neu = Object.keys(weitere).map((k) => weitere[k]).sort((x, y) => x.name.localeCompare(y.name, "de"));
    return fest.concat(neu, [WELCOME]).map((e) => ({ schluessel: e.schluessel, name: e.name, hinweis: e.hinweis || "", an: e.an }));
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

  // ---------- Liste (rein, testbar) ----------
  // Zeilen eines Angebots: der Termin selbst; beim Hochschulsport zusätzlich der Buchungsbeginn (anmeldung.ab) als eigene Zeile
  const zeilenVon = (a) => {
    const z = [{ art: "termin", tag: a.datum, zeit: a.von || "", ende: a.bis || "", angebot: a }];
    const ab = a.anmeldung && a.anmeldung.ab;
    if (a.kategorie === "sport" && ab) z.push({ art: "buchung", tag: ab.slice(0, 10), zeit: ab.slice(11, 16), ende: "", angebot: a });
    return z;
  };
  // Innerhalb eines Tages: ohne Uhrzeit zuerst, dann nach Uhrzeit; Buchungsbeginn vor Terminen gleicher Zeit; dann Titel
  const zeilenFolge = (x, y) => (x.zeit < y.zeit ? -1 : x.zeit > y.zeit ? 1 : 0)
    || (x.art === y.art ? 0 : x.art === "buchung" ? -1 : 1)
    || x.angebot.titel.localeCompare(y.angebot.titel, "de")
    || (x.angebot.id < y.angebot.id ? -1 : x.angebot.id > y.angebot.id ? 1 : 0);

  // liste = geprüfte Angebote (zentral.js), o = { heute: "JJJJ-MM-TT", jetzt: "HH:MM", auswahl: [Schlüssel] | null (alle),
  // aus: [Arten, per Chip ausgeblendet], tage: Fenster in Tagen } → { zahlen: { vortrag: n, … } (gewählte Angebote je Art,
  // unabhängig von den Chips), nah: [{ tag, zeilen }] (heute bis Fenster), spaeter: [{ tag, zeilen }], spaeterZeilen }.
  // Vorbei: Tage vor heute und heutige Termine, deren Ende schon war.
  const auswaehlen = (liste, o) => {
    o = o || {};
    const heute = o.heute, jetzt = o.jetzt || "";
    const grenze = plusTage(heute, o.tage || FENSTER); // erster Tag nach dem Fenster
    const aus = o.aus || [];
    const zahlen = {};
    for (const k of ARTEN) zahlen[k.id] = 0;
    const nah = {}, spaeter = {};
    let spaeterZeilen = 0;
    for (const a of liste || []) {
      if (!Object.prototype.hasOwnProperty.call(zahlen, a.kategorie)) continue;
      if (o.auswahl && o.auswahl.indexOf(wahlSchluessel(a)) < 0) continue;
      const zeilen = zeilenVon(a).filter((z) => z.tag > heute || (z.tag === heute && !(z.art === "termin" && z.ende && z.ende <= jetzt)));
      if (!zeilen.length) continue;
      zahlen[a.kategorie]++;
      if (aus.indexOf(a.kategorie) >= 0) continue;
      for (const z of zeilen) {
        const ziel = z.tag < grenze ? nah : spaeter;
        (ziel[z.tag] || (ziel[z.tag] = [])).push(z);
        if (ziel === spaeter) spaeterZeilen++;
      }
    }
    const tage = (m) => Object.keys(m).sort().map((tag) => ({ tag, zeilen: m[tag].sort(zeilenFolge) }));
    return { zahlen, nah: tage(nah), spaeter: tage(spaeter), spaeterZeilen };
  };
  // Arten mit mindestens einem gewählten Eintrag, in der Reihenfolge der Chips
  const artenDerAuswahl = (auswahl) => ARTEN.map((k) => k.id).filter((id) => (auswahl || []).some((s) => artVon(s) === id));

  // „18:15–19:45“, „18:15“, Buchungsbeginn „ab 17:00“; ohne Uhrzeit leer
  const zeitText = (z) => {
    if (z.art === "buchung") return z.zeit ? "ab " + uhr(z.zeit) : "";
    return z.zeit ? uhr(z.zeit) + (z.ende ? "–" + uhr(z.ende) : "") : "";
  };
  const ortText = (a) => [a.ort, a.online ? "online" : ""].filter(Boolean).join(" · ");
  // Anmeldung beim Termin: „Anmeldung ab 19.10.“ (noch nicht offen; beim Hochschulsport steht dafür eine eigene Zeile),
  // sonst „Anmeldung bis 26.10., 23:59“ (noch offen); Hochschulsport sagt „Buchung“. jetzt („HH:MM“, optional): Zeitpunkte mit
  // Uhrzeit zählen heute erst ab dieser Uhrzeit als erreicht; ein Tag ohne Uhrzeit gilt bis zu seinem Ende.
  const spaeterAls = (s, heute, jetzt) => s.slice(0, 10) > heute || (s.slice(0, 10) === heute && s.length > 10 && !!jetzt && s.slice(11, 16) > jetzt);
  const anmeldeText = (a, heute, jetzt) => {
    const m = a.anmeldung;
    if (!m) return "";
    const wort = a.kategorie === "sport" ? "Buchung" : "Anmeldung";
    if (m.ab && spaeterAls(m.ab, heute, jetzt) && a.kategorie !== "sport") return `${wort} ab ${zeitpunktText(m.ab)}`;
    if (m.bis && (spaeterAls(m.bis, heute, jetzt) || (m.bis.slice(0, 10) === heute && (m.bis.length <= 10 || !jetzt)))) return `${wort} bis ${zeitpunktText(m.bis)}`;
    return "";
  };
  // Zeile unter dem Titel: Reihe · Ort · online · Anmeldung; beim Buchungsbeginn: Buchungsstart · Reihe · Kursbeginn
  const metaText = (z, heute, jetzt) => {
    const a = z.angebot;
    if (z.art === "buchung") return ["Buchungsstart", a.reihe, a.datum !== z.tag ? `Kurs ab ${wochentag(a.datum)} ${dm(a.datum)}` : ""].filter(Boolean).join(" · ");
    return [a.reihe, ortText(a), anmeldeText(a, heute, jetzt)].filter(Boolean).join(" · ");
  };

  // ---------- Zustand bis zum Neustart (für alle Blöcke gleich) ----------
  // aus: per Chip ausgeblendete Arten; mehr: „Mehr anzeigen“ offen; waehlen: Karte über „Auswahl ändern“ geöffnet;
  // entwurf: Häkchen der offenen Karte (überleben ein Neuzeichnen); gespeichert: eben geschriebene Auswahl, bis der
  // metadataCache sie liefert (höchstens 10 s)
  const ansicht = ctx.bleibend("zustand", () => ({ aus: [], mehr: false, waehlen: false, entwurf: {}, gespeichert: null }));

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

  // ---------- Zeichnen ----------
  let griff = null;
  let gezeichnetAm = "";
  let gezeichnetMs = 0; // letzte Zeichnung der Liste (0: Karte „Welche Angebote …“ offen oder nichts gezeichnet)
  const alleNeu = () => { if (griff) griff.neu(); };
  // Nach dem Neuzeichnen den Fokus auf dasselbe Bedienelement setzen (Tastatur, Bildschirmleser)
  const fokus = (el, schluessel) => {
    const x = Array.prototype.find.call(el.querySelectorAll("[data-eba-fokus]"), (n) => n.getAttribute("data-eba-fokus") === schluessel);
    if (x) { try { x.focus({ preventScroll: true }); } catch (e) { /* egal */ } }
  };
  const handeln = (el, schluessel, fn) => { fn(); alleNeu(); fokus(el, schluessel); };

  // Häkchen „Welche Angebote willst du sehen?“ in gruppe: für die Karte hier und den Bildschirm der Einrichtung. Haken der
  // Einstellungen, darüber der Entwurf (gemeinsam, so überlebt er Neuzeichnen und Zurück in der Einrichtung).
  // → { werte() → { auswahl, veranstaltungen }, gespeichert() (nach dem Schreiben: gilt sofort, Blöcke neu) }
  const wahlListe = (gruppe, w, liste) => {
    const eintraege = wahlEintraege(liste);
    const haken = {};
    for (const e of eintraege) haken[e.schluessel] = w.auswahl.indexOf(e.schluessel) >= 0;
    haken[FACHSCHAFT.schluessel] = w.veranstaltungen;
    Object.keys(ansicht.entwurf).forEach((k) => { if (Object.prototype.hasOwnProperty.call(haken, k)) haken[k] = !!ansicht.entwurf[k]; });
    eintraege.concat([FACHSCHAFT]).forEach((e, i) => {
      const z = gruppe.createEl("label", { cls: "eba-ang-wahl-zeile", attr: { "data-wahl": e.schluessel } });
      const cb = z.createEl("input", { attr: { type: "checkbox", "data-eba-fokus": i ? "wahl-" + e.schluessel : "wahl-erste" } });
      cb.checked = haken[e.schluessel];
      z.createSpan({ text: e.name });
      if (e.hinweis) z.createEl("small", { cls: "eba-ang-wahl-hinweis", text: e.hinweis });
      cb.addEventListener("change", () => { haken[e.schluessel] = cb.checked; ansicht.entwurf[e.schluessel] = cb.checked; });
    });
    const werte = () => ({ auswahl: wahlNeu(w.auswahl, eintraege, haken), veranstaltungen: !!haken[FACHSCHAFT.schluessel] });
    const gespeichert = () => {
      ansicht.gespeichert = Object.assign(werte(), { zeit: Date.now() });
      ansicht.waehlen = false;
      ansicht.entwurf = {};
      ansicht.aus = [];
      alleNeu();
    };
    return { werte, gespeichert };
  };
  const gruppeAnlegen = (el) => el.createDiv({ cls: "eba-ang-wahl", attr: { role: "group", "aria-label": "Angebote auswählen" } });
  const datenListe = () => { const Z = ctx.zentral, d = Z && Z.angebote ? Z.angebote() : null; return d ? d.angebote : []; };

  // Karte „Welche Angebote willst du sehen?“
  const wahlZeichnen = (box, w, liste) => {
    const karte = gruppeAnlegen(box);
    karte.createEl("p", { cls: "eba-ang-wahl-frage", text: "Welche Angebote willst du sehen?" });
    const wahl = wahlListe(karte, w, liste);
    const fertig = karte.createEl("button", { cls: "eba-ang-wahl-fertig", text: "Fertig", attr: { type: "button" } });
    fertig.addEventListener("click", async () => {
      fertig.disabled = true;
      const x = wahl.werte();
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
    });
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

  // Monatstrenner: nur der erste Tag je neuem Monat (nicht der laufende Monat) bekommt die Kurzform des Monats
  const MONATE_KURZ = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sep.", "Okt.", "Nov.", "Dez."];
  const monatsMarke = (tage, heute) => {
    const marken = {};
    let zuletzt = String(heute || "").slice(0, 7);
    for (const t of tage || []) {
      const m = String(t.tag || "").slice(0, 7);
      if (m && m !== zuletzt) { marken[t.tag] = MONATE_KURZ[Number(m.slice(5, 7)) - 1] || ""; zuletzt = m; }
    }
    return marken;
  };

  const zeilenZeichnen = (liste, tage, heute, jetzt) => {
    const marken = monatsMarke(tage, heute);
    for (const t of tage) {
      const tag = liste.createDiv({ cls: "eba-ang-tag" + (t.tag === heute ? " is-heute" : "") + (marken[t.tag] ? " is-monat" : "") });
      const d = tag.createDiv({ cls: "eba-ang-datum", attr: { title: `${wochentag(t.tag)} ${dmy(t.tag)}` } });
      d.createEl("b", { text: String(Number(t.tag.slice(8, 10))) });
      d.createSpan({ text: wochentag(t.tag) });
      if (marken[t.tag]) d.createEl("small", { text: marken[t.tag] });
      const eintraege = tag.createDiv({ cls: "eba-ang-eintraege" });
      for (const z of t.zeilen) {
        const a = z.angebot;
        const e = eintraege.createDiv({ cls: `eba-ang-eintrag ${a.kategorie}` + (z.art === "buchung" ? " is-buchung" : "") });
        e.createSpan({ cls: "eba-ang-zeit", text: zeitText(z) });
        e.createEl("a", { cls: "eba-ang-titel external-link", text: a.titel, href: a.url, attr: { target: "_blank", rel: "noopener" } });
        const meta = metaText(z, heute, jetzt);
        if (meta) e.createSpan({ cls: "eba-ang-meta", text: meta });
      }
    }
  };

  const zeichnen = (el) => {
    el.empty();
    const jetzt = ctx.date.jetzt();
    const heute = isoVon(jetzt), uhr = `${pad(jetzt.getHours())}:${pad(jetzt.getMinutes())}`;
    gezeichnetAm = heute;
    gezeichnetMs = 0;
    const Z = ctx.zentral;
    const daten = Z && Z.angebote ? Z.angebote() : null;
    const box = el.createDiv({ cls: "eba-ang", attr: { lang: "de" } });
    if (!daten) {
      // Noch keine Daten: eine leise Zeile (das CSS kann den Block über .eba-ang-aus ganz ausblenden)
      box.addClass("eba-ang-aus");
      const aus = Z && Z.status && Z.status().an === false;
      box.createDiv({ cls: "eba-ang-leer", text: aus ? "Zentrale Daten sind ausgeschaltet. Angebote der Uni erscheinen, sobald du sie einschaltest."
        : "Angebote der Uni erscheinen, sobald sie veröffentlicht sind." });
      return;
    }
    const w = wahlAktuell();
    if (!w.gewaehlt || ansicht.waehlen) { wahlZeichnen(box, w, daten.angebote); return; }
    gezeichnetMs = jetzt.getTime();

    // Chips: nur die gewählten Arten, und nur ab zwei (ein- und ausblenden bis zum Neustart)
    const arten = artenDerAuswahl(w.auswahl);
    const chips = arten.length > 1;
    const artenAus = chips ? ansicht.aus.filter((k) => arten.indexOf(k) >= 0) : [];
    const r = auswaehlen(daten.angebote, { heute, jetzt: uhr, auswahl: w.auswahl, aus: artenAus });
    if (chips) {
      const filter = box.createDiv({ cls: "eba-ang-filter", attr: { role: "group", "aria-label": "Angebote filtern" } });
      for (const k of ARTEN) {
        if (arten.indexOf(k.id) < 0) continue;
        const an = artenAus.indexOf(k.id) < 0;
        const b = filter.createEl("button", { cls: "eba-ang-chip" + (an ? " is-an" : ""),
          attr: { type: "button", "data-kategorie": k.id, "aria-pressed": String(an), "data-eba-fokus": "art-" + k.id } });
        b.appendText(k.name);
        b.createSpan({ cls: "eba-ang-zahl", text: String(r.zahlen[k.id]) });
        b.addEventListener("click", () => handeln(el, "art-" + k.id, () => {
          ansicht.aus = an ? artenAus.concat([k.id]) : artenAus.filter((x) => x !== k.id);
        }));
      }
    }

    // Liste: die nächsten 14 Tage, der Rest hinter „Mehr anzeigen“
    if (!arten.length) box.createDiv({ cls: "eba-ang-leer", text: "Du hast keine Angebote gewählt." });
    else if (artenAus.length === arten.length) box.createDiv({ cls: "eba-ang-leer", text: "Alles ausgeblendet. Tippe oben auf eine Art, um sie wieder zu sehen." });
    else if (!r.nah.length) box.createDiv({ cls: "eba-ang-leer", text: "Gerade keine Angebote in den nächsten zwei Wochen." });
    const tage = r.nah.concat(ansicht.mehr ? r.spaeter : []);
    if (tage.length) zeilenZeichnen(box.createDiv({ cls: "eba-ang-liste" }), tage, heute, uhr);
    if (r.spaeterZeilen) {
      const mehr = box.createEl("button", { cls: "eba-ang-mehr", text: ansicht.mehr ? "Weniger anzeigen" : `Mehr anzeigen (${r.spaeterZeilen})`,
        attr: { type: "button", "aria-expanded": String(ansicht.mehr), "data-eba-fokus": "mehr" } });
      mehr.addEventListener("click", () => handeln(el, "mehr", () => { ansicht.mehr = !ansicht.mehr; }));
    }

    // Fuß: Herkunft, Stand, „Auswahl ändern“
    const fuss = box.createEl("p", { cls: "eba-ang-fuss", text: "Von den Seiten der Uni Tübingen, maßgeblich ist der Link."
      + (daten.stand ? ` Stand ${dmy(daten.stand)}.` : "") + " " });
    const aendern = fuss.createEl("a", { cls: "eba-ang-wahl-aendern", text: "Auswahl ändern", href: "#", attr: { role: "button" } });
    aendern.addEventListener("click", (ev) => {
      ev.preventDefault();
      handeln(el, "wahl-erste", () => { ansicht.waehlen = true; ansicht.entwurf = {}; });
    });
  };

  const registrieren = () => {
    griff = ctx.codeblock(SPRACHE, (quelle, el) => {
      try { zeichnen(el); } catch (e) { console.error(SPRACHE, e); el.setText(String(quelle)); }
    });
    const anzeige = { neu: () => griff.neu(), wahl: wahlFuerEinrichtung, wahlZahl };
    ctx.angeboteAnzeige = anzeige;
    ctx.aufraeumen(() => { if (ctx.angeboteAnzeige === anzeige) ctx.angeboteAnzeige = null; });
    // Auswahl oder Fachschaft-Schalter geändert (auch per Sync von einem anderen Gerät)
    const bald = ctx.entprellen(() => griff.neu(), 300);
    ctx.an(app.metadataCache, "changed", (f) => { if (f && f.path === EINSTELLUNGEN) bald(); });
    // Neuer Tag (Obsidian über Nacht offen, iPhone/iPad aus dem Hintergrund) oder Liste älter als 15 Min.: neu zeichnen,
    // damit vergangene Vorträge und abgelaufene Anmeldungen verschwinden. Nicht im Hintergrund, nicht bei offener Auswahlkarte.
    const pruefen = () => {
      if (!gezeichnetAm || document.visibilityState === "hidden") return;
      const jetzt = ctx.date.jetzt();
      if (isoVon(jetzt) !== gezeichnetAm || (gezeichnetMs && jetzt.getTime() - gezeichnetMs >= 15 * 60e3)) griff.neu();
    };
    ctx.dom(document, "visibilitychange", pruefen);
    ctx.intervall(pruefen, 5 * 60e3);
  };

  return { registrieren, auswaehlen, wahlLesen, wahlFelder, wahlSchreiben, wahlNeu, wahlEintraege, wahlSchluessel, artenDerAuswahl, VORGABE, zeitText, ortText,
    anmeldeText, metaText, monatsMarke, ARTEN };
};
