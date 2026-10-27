// Rundgang (seit 27.10.2026, Rückmeldung: „Since this update changes the navigation massively there should be a few explainer screens
// that say something like: Navigation now lives here arrow. Settings have moved here arrow“): zeigt einmal je Gerät, wo die neue
// Navigation steht. Je Schritt ein Ring um den echten Knopf und daneben eine Blase mit einem Satz und „Weiter“ bzw. „Fertig“:
//   1 Seiten: das ≡ unten rechts (iPhone und iPad Obsidians eigenes, app.mobileNavbar.ribbonMenuItemEl; PC .eba-nav-seiten)
//   2 Einstellungen & Hilfe: das Zahnrad daneben (.eba-nav-zahnrad, seitenleiste.js)
//   3 nur iPhone und iPad: Wischen vom linken Rand geht zurück (seitenleiste.js wischenUebernehmen); fehlt, wenn die linke
//     Seitenleiste angeheftet ist (dann liegt sie am Rand, und Wischen geht nicht zurück)
// Gemessen wird an den echten Knöpfen (getBoundingClientRect), neu bei jeder Größenänderung (Drehen, geteiltes Fenster), mit dem
// sicheren Rand (--safe-area-inset-*). Fehlt das Ziel eines Schritts, entfällt der Schritt. Hat Obsidian die Leiste auf dem
// iPhone beim Scrollen verborgen (is-hidden-nav), holt das Skript sie vorher mit Obsidians restoreNavigation zurück.
// Bedienung: Ein Tipp auf die Blase, ob auf „Weiter“ oder den Satz, geht einen Schritt weiter, im letzten Schritt heißt der
// Knopf „Fertig“ und schließt (seit 27.10.2026, Rückmeldung: „nur wenn man auf die Blase klickt“; bis dahin ging jeder Tipp
// irgendwohin und im Schritt Wischen auch ein Wischen weiter). Tipps und Wischen daneben tun nichts und erreichen nicht, was
// darunter liegt. Esc schließt gleich (Tastatur, Vorlesesoftware). Der Fokus steht auf dem
// Knopf der Blase, Tab bleibt dort; am PC kommt er danach dorthin zurück, wo er war (auf iPhone und iPad nicht: ein Editor
// öffnete sonst die Tastatur). Geht währenddessen ein Fenster auf, liegt es darüber und bekommt die Tasten.
// Einmal je Gerät (gerätelokal GESEHEN = FASSUNG, app.saveLocalStorage, geht mit keinem Sync mit), nicht an die Version gebunden:
// Wer aktualisiert, sieht ihn beim nächsten Start oder gleich nach dem Update, ebenso ein Entwicklungstresor ohne Release. Er
// kommt nur, wenn nichts anderes dran ist (faellig): kein Fenster offen (Update, Was ist neu), keine Einrichtung offen oder gleich
// fällig (einrichtungWartet), kein Menü, keine Seitenleiste, keine Tastatur. Zählt als gesehen, sobald du ihn schließt; geht das
// Plugin vorher aus, kommt er wieder. Wortlaut: wer die alte Navigation kennt, liest „jetzt hier“, aber nur, wenn er von selbst
// kommt; nach einer neuen Einrichtung (ersterStart) und wenn du ihn selbst noch einmal aufrufst, nur „hier“ (seit 27.10.2026,
// Rückmeldung: das „jetzt“ soll irgendwann wegfallen). Noch einmal: Einstellungen & Hilfe → Hilfe → Rundgang (personalisieren.js,
// Aktion „rundgang“).
// Stil: eba-core.css Abschnitt 71 (.eba-rg-*). Kein Node-API.
const FASSUNG = 1; // Inhalt des Rundgangs; eine höhere Zahl zeigt ihn auf jedem Gerät noch einmal
const GESEHEN = "eba-rundgang"; // gerätelokal: FASSUNG, sobald du ihn auf diesem Gerät geschlossen hast
const RAND = 12; // Blase so weit vom Fensterrand (wie das Menü, seitenleiste.js RAND)
const ABSTAND = 10; // zwischen Ring und Blase
const RING = 4; // Ring so weit um den Knopf
const SPITZE = 18; // Spitze der Blase mindestens so weit von ihrer Ecke (Rundung und halbe Spitze)
const ERSTER_BLICK = 3000; // ms nach dem Laden frühestens
const WIEDER = 4000; // ms: so oft nachsehen, ob jetzt nichts anderes dran ist
const EINRICHTUNG_WARTEN = 30000; // ms nach dem Laden: so lange auf eine Einrichtung warten, die gleich kommt (einrichtung.js start)
const LEISTE_ZEIT = 300; // ms, bis Obsidians Leiste nach restoreNavigation steht
const TIPP_RUHE = 8000; // ms ohne Taste, ehe er am PC in einen Editor mit Fokus kommt (dort bleibt der Fokus oft stundenlang)

// Die Schritte für dieses Gerät (rein, Tests). o = { mobil, angeheftet (linke Seitenleiste angeheftet), rtl (Sprache von rechts
// nach links: Zurück vom rechten Rand), neu (ersterStart oder selbst aufgerufen: ohne „jetzt“) } → [{ id, text }], Text mit
// **fett** für Beschriftungen der App
const schritte = (o) => {
  const jetzt = o.neu ? "" : " jetzt";
  const liste = [
    { id: "seiten", text: `Alle Seiten und deine Module findest du${jetzt} hier.` },
    { id: "zahnrad", text: `**Einstellungen & Hilfe** öffnest du${jetzt} hier.` },
  ];
  if (o.mobil && !o.angeheftet) {
    liste.push({ id: "wischen", text: `Vom ${o.rtl ? "rechten" : "linken"} Rand nach ${o.rtl ? "links" : "rechts"} wischen bringt dich${jetzt} eine Seite zurück.` });
  }
  return liste;
};

const klemmen = (v, min, max) => Math.max(min, Math.min(max, v));
// Ring um ein Rechteck r (wie getBoundingClientRect), pad px weiter → { left, top, right, bottom, width, height, radius }. kreis:
// ein Kreis um die Mitte, so groß wie die längere Seite (Knöpfe der Leiste sind 42 × 52 px, ein Oval sähe gedrückt aus)
const ringLage = (r, pad, kreis) => {
  const w = r.right - r.left, h = r.bottom - r.top, d = Math.max(w, h);
  const width = Math.round((kreis ? d : w) + 2 * pad), height = Math.round((kreis ? d : h) + 2 * pad);
  const left = Math.round((r.left + r.right - width) / 2), top = Math.round((r.top + r.bottom - height) / 2);
  return { left, top, right: left + width, bottom: top + height, width, height, radius: Math.round(Math.min(width, height) / 2) };
};
// Streifen, in dem Wischen zurückgeht (seitenleiste.js amRand: breite px ab dem sicheren Rand), mittig in der Höhe, ein Viertel
// davon (80 bis 160 px). f = { breite, hoehe } (Fenster), s = { oben, unten, links, rechts } (sicherer Rand), richtung 1: links
const randStreifen = (f, s, richtung, breite) => {
  const frei = f.hoehe - s.oben - s.unten;
  const h = Math.round(klemmen(frei / 4, 80, 160));
  const top = Math.round(s.oben + (frei - h) / 2);
  const left = Math.round(richtung === 1 ? s.links : f.breite - s.rechts - breite);
  return { left, top, right: left + breite, bottom: top + h };
};
// Lage der Blase (rein, Tests). z: Ring, g = { b, h } (Größe der Blase), f, s wie oben, seite: "oben" (über dem Ziel, sonst
// darunter, wenn oben kein Platz ist) oder "rechts"/"links" (neben dem Ziel) → { x, y, seite, pfeil }: linke obere Ecke, Seite
// der Blase vom Ziel aus und wo ihre Spitze sitzt (px ab ihrer linken bzw. oberen Kante, mindestens SPITZE von den Ecken). Die
// Blase bleibt RAND px im sicheren Bereich; neben dem Ziel wird sie nur in der Höhe verschoben.
const blasenLage = (z, g, f, s, seite) => {
  const minX = s.links + RAND, maxX = Math.max(minX, f.breite - s.rechts - RAND - g.b);
  const minY = s.oben + RAND, maxY = Math.max(minY, f.hoehe - s.unten - RAND - g.h);
  if (seite === "rechts" || seite === "links") {
    const mitte = (z.top + z.bottom) / 2;
    const y = Math.round(klemmen(mitte - g.h / 2, minY, maxY));
    const x = Math.round(seite === "rechts" ? z.right + ABSTAND : z.left - ABSTAND - g.b);
    return { x, y, seite, pfeil: Math.round(klemmen(mitte - y, SPITZE, g.h - SPITZE)) };
  }
  const mitte = (z.left + z.right) / 2;
  const x = Math.round(klemmen(mitte - g.b / 2, minX, maxX));
  const passtOben = z.top - ABSTAND - g.h >= minY, passtUnten = z.bottom + ABSTAND + g.h <= f.hoehe - s.unten - RAND;
  const oben = passtOben || !passtUnten;
  return { x, y: Math.round(oben ? z.top - ABSTAND - g.h : z.bottom + ABSTAND), seite: oben ? "oben" : "unten", pfeil: Math.round(klemmen(mitte - x, SPITZE, g.b - SPITZE)) };
};
// Breite der Blase neben dem Ziel: was rechts bzw. links bis RAND vor dem sicheren Rand bleibt, höchstens b
const blasenBreite = (z, f, s, seite, b) => Math.min(b, Math.round(seite === "links" ? z.left - ABSTAND - RAND - s.links : f.breite - s.rechts - RAND - z.right - ABSTAND));
// Kommt die Einrichtung gleich oder ist sie offen? e = { fenster (offen), soll (sollZeigen), gezeigt (in dieser Sitzung schon von
// selbst gezeigt), seit (ms seit dem Laden) }. einrichtung.js öffnet sie beim App-Start nach höchstens etwa 15 s.
const einrichtungWartet = (e) => !!e.fenster || (!!e.soll && !e.gezeigt && e.seit < EINRICHTUNG_WARTEN);
// Neu hier? Die Einrichtung ist noch fällig oder lief in dieser Sitzung von selbst: Dann kennst du die alte Navigation nicht
const ersterStart = (e) => !!(e.soll || e.gezeigt);
// Von selbst zeigen? (rein, Tests) z = { gesehen, offen (Rundgang läuft oder kommt gleich), bereit (Obsidian fertig geladen),
// sichtbar (App vorn), fenster (ein Fenster ist offen), einrichtung (einrichtungWartet), menue (Menü hinter ≡, Obsidians Menüs
// und Übersicht der Tabs), seitenleiste
// (iPhone/iPad: eine Seitenleiste ist aufgezogen), hinweis (ein Hinweis mit Knopf steht da, etwa „Aktualisiert auf …“ oder
// „Rückgängig“), tippt (Eingabe mit Fokus: auf iPhone und iPad ist die Tastatur offen, am PC kam eben eine Taste), ziele (≡ und
// Zahnrad gibt es; verborgen holt zeigen() die Leiste) }
const faellig = (z) => !z.gesehen && !z.offen && !!z.bereit && !!z.sichtbar && !z.fenster && !z.einrichtung && !z.menue
  && !z.seitenleiste && !z.hinweis && !z.tippt && !!z.ziele;

module.exports = function (ctx) {
  const app = window.app;
  const { Platform } = ctx.obsidian;
  const geladen = Date.now();
  let tour = null; // { liste, i, hinter, ring, blase, text, zahl, knopf, vorher } solange er zu sehen ist
  let kommt = false; // zeigen() wartet auf die Leiste
  let an = true; // nach dem Abmelden false (für Wartezeiten, die schon laufen)
  let taste = 0; // Zeit der letzten Taste (tippt)
  let uhr = null; // Intervall, solange er auf diesem Gerät noch nicht gesehen ist

  const lokal = (k, v) => {
    if (v === undefined) { try { return app.loadLocalStorage(k); } catch (e) { return null; } }
    try { app.saveLocalStorage(k, v); } catch (e) { /* egal */ }
    return v;
  };
  const gesehen = () => Number(lokal(GESEHEN)) >= FASSUNG;
  const px = (n) => parseFloat(getComputedStyle(document.body).getPropertyValue(n)) || 0;
  const sicher = () => ({ oben: px("--safe-area-inset-top"), unten: px("--safe-area-inset-bottom"), links: px("--safe-area-inset-left"), rechts: px("--safe-area-inset-right") });
  const fenster = () => ({ breite: window.innerWidth, hoehe: window.innerHeight });
  const rtl = () => document.body.classList.contains("mod-rtl");
  const fensterOffen = () => !!document.querySelector(".modal-container");
  const randBreite = () => (ctx.user.seitenleiste && ctx.user.seitenleiste.ZURUECK_RAND) || 30;

  // Rechteck eines Elements, wenn es zu sehen ist, sonst null
  const sichtbar = (el) => {
    if (!el || !el.isConnected) return null;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth ? r : null;
  };
  // Knöpfe der Leiste: ≡ und Zahnrad (seitenleiste.js)
  const knopfVon = (id) => {
    const el = id === "seiten" ? (Platform.isMobile ? app.mobileNavbar && app.mobileNavbar.ribbonMenuItemEl : document.querySelector(".eba-nav-leiste .eba-nav-seiten"))
      : document.querySelector(".eba-nav-zahnrad");
    return el && el.isConnected ? el : null;
  };
  // Ziel eines Schritts als Rechteck oder null
  const ziel = (id) => (id === "wischen" ? randStreifen(fenster(), sicher(), rtl() ? -1 : 1, randBreite()) : sichtbar(knopfVon(id)));
  const einrichtung = () => {
    const e = ctx.einrichtung;
    const o = { fenster: false, soll: false, gezeigt: false, seit: Date.now() - geladen };
    if (!e) return o;
    try { o.fenster = !!e.fenster; o.soll = !!e.sollZeigen(); } catch (x) { /* Einrichtung noch nicht bereit */ }
    try { o.gezeigt = !!window.sessionStorage.getItem(e.SITZUNG || "eba-einrichtung-gezeigt"); } catch (x) { o.gezeigt = false; }
    return o;
  };

  // Text mit **fett**, ohne innerHTML
  const fett = (el, s) => {
    String(s || "").split("**").forEach((t, i) => { if (t) { if (i % 2) el.createEl("b", { text: t }); else el.appendText(t); } });
  };
  // Pfeil nach rechts (Lucide „arrow-right“) für den Schritt Wischen
  const pfeil = () => {
    const NS = "http://www.w3.org/2000/svg", svg = document.createElementNS(NS, "svg");
    for (const [k, v] of Object.entries({ width: "18", height: "18", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": "2.5",
      "stroke-linecap": "round", "stroke-linejoin": "round", class: "eba-sym", "aria-hidden": "true" })) svg.setAttribute(k, v);
    for (const d of ["M5 12h14", "m12 5 7 7-7 7"]) { const p = document.createElementNS(NS, "path"); p.setAttribute("d", d); svg.appendChild(p); }
    return svg;
  };

  // Ring und Blase an das Ziel des Schritts legen. Fehlt es beim Wechsel zum Schritt (neu), geht es zum nächsten; fehlt es nur kurz
  // beim Drehen, bleibt alles, wo es war (so wird nichts übersprungen und als gesehen gemerkt, das du nie gesehen hast)
  const legen = (neu) => {
    if (!tour) return;
    const s = tour.liste[tour.i];
    const r = ziel(s.id);
    if (!r) { if (neu) weiter(); return; }
    const k = s.id === "wischen" ? ringLage(r, 0, false) : ringLage(r, RING, true);
    const st = tour.ring.style;
    st.left = k.left + "px"; st.top = k.top + "px"; st.width = k.width + "px"; st.height = k.height + "px";
    st.borderRadius = s.id === "wischen" ? "" : k.radius + "px"; // Streifen am Rand: Form aus eba-core.css 71
    const seite = s.id === "wischen" ? (rtl() ? "links" : "rechts") : "oben";
    const b = tour.blase;
    b.style.maxWidth = seite === "oben" ? "" : Math.max(160, blasenBreite(k, fenster(), sicher(), seite, 300)) + "px";
    const l = blasenLage(k, { b: b.offsetWidth, h: b.offsetHeight }, fenster(), sicher(), seite);
    b.style.left = l.x + "px";
    b.style.top = l.y + "px";
    b.style.setProperty("--eba-rg-pfeil", l.pfeil + "px");
    b.setAttribute("data-seite", l.seite);
    b.removeClass("is-messen");
  };
  const bald = ctx.entprellen(() => { legen(false); ctx.zeit(() => legen(false), LEISTE_ZEIT); }, 60); // Drehen: Obsidian setzt die Leiste nach

  const zeigeSchritt = (i) => {
    tour.i = i;
    const s = tour.liste[i], n = tour.liste.length, letzter = i === n - 1;
    tour.text.empty();
    fett(tour.text, s.text);
    tour.zahl.setText(n > 1 ? `${i + 1} von ${n}` : "");
    tour.knopf.setText(letzter ? "Fertig" : "Weiter");
    tour.ring.toggleClass("is-wischen", s.id === "wischen");
    tour.blase.addClass("is-messen");
    legen(true);
    if (tour) fokus();
  };
  // PC: Fokus auf den Knopf (Enter, Leertaste); iPhone und iPad auf die Blase, ohne Rahmen um den Knopf, Vorlesesoftware liest sie
  const fokus = () => (Platform.isMobile ? tour.blase : tour.knopf).focus({ preventScroll: true });
  function weiter() {
    if (!tour) return;
    if (tour.i + 1 < tour.liste.length) zeigeSchritt(tour.i + 1);
    else schliessen(true);
  }
  // fertig: geschlossen von dir (zählt als gesehen); sonst nur weg (Abmelden)
  const schliessen = (fertig) => {
    const t = tour;
    if (!t) return;
    tour = null;
    for (const el of [t.hinter, t.ring, t.blase]) el.remove();
    if (fertig) lokal(GESEHEN, FASSUNG);
    if (!Platform.isMobile && t.vorher && t.vorher.isConnected && typeof t.vorher.focus === "function") t.vorher.focus({ preventScroll: true });
  };

  const aufbauen = (liste) => {
    const hinter = document.body.createDiv({ cls: "eba-rg-hinter", attr: { "aria-hidden": "true" } });
    const ring = document.body.createDiv({ cls: "eba-rg-ring", attr: { "aria-hidden": "true" } });
    ring.createDiv({ cls: "eba-rg-wisch" }).appendChild(pfeil());
    const blase = document.body.createDiv({ cls: "eba-rg-blase is-messen", attr: { role: "dialog", "aria-modal": "true", "aria-label": "Rundgang",
      "aria-describedby": "eba-rg-text", tabindex: "-1" } });
    const text = blase.createEl("p", { cls: "eba-rg-text", attr: { id: "eba-rg-text", "aria-live": "polite" } });
    const fuss = blase.createDiv({ cls: "eba-rg-fuss" });
    const zahl = fuss.createSpan({ cls: "eba-rg-zahl" });
    const knopf = fuss.createEl("button", { cls: "mod-cta" });
    // Nur die Blase geht weiter (auch der Knopf darin: sein Klick steigt zu ihr auf, Enter und Leertaste lösen ihn aus)
    blase.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); weiter(); });
    // Fläche und Ring schlucken Tipps, damit nichts darunter ausgelöst wird; weiter geht es dort nicht
    const schlucken = (e) => { e.preventDefault(); e.stopPropagation(); };
    for (const el of [hinter, ring]) {
      el.addEventListener("click", schlucken);
      el.addEventListener("mousedown", schlucken);
    }
    tour = { liste, i: 0, hinter, ring, blase, text, zahl, knopf, vorher: document.activeElement };
    ring.addClass("is-ruhig");
    zeigeSchritt(0);
    ctx.zeit(() => ring.removeClass("is-ruhig"), 50);
  };

  // o.wieder: selbst noch einmal aufgerufen (dann ohne „jetzt“) → true, wenn er jetzt zu sehen ist
  const zeigen = async (o = {}) => {
    if (tour || kommt || !an) return false;
    const n = app.mobileNavbar;
    if (Platform.isMobile && n && typeof n.restoreNavigation === "function" && document.body.classList.contains("is-hidden-nav")) {
      n.restoreNavigation();
      kommt = true;
      await new Promise((r) => ctx.zeit(r, LEISTE_ZEIT));
      kommt = false;
      if (tour || !an) return false;
    }
    const liste = schritte({ mobil: !!Platform.isMobile, angeheftet: !!document.querySelector(".workspace-drawer.mod-left.is-pinned"), rtl: rtl(),
      neu: !!o.wieder || ersterStart(einrichtung()) }).filter((s) => ziel(s.id));
    if (!liste.length) return false;
    aufbauen(liste);
    return true;
  };

  // Tasten, solange er zu sehen ist und kein Fenster darüber liegt: Esc schließt, Tab bleibt auf dem Knopf
  const tasten = (e) => {
    taste = Date.now();
    if (!tour || fensterOffen()) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); schliessen(true); }
    else if (e.key === "Tab") { e.preventDefault(); tour.knopf.focus({ preventScroll: true }); }
  };

  // ---------- Von selbst, einmal je Gerät ----------
  const zustand = () => {
    const ws = app.workspace, mc = app.metadataCache, a = document.activeElement;
    // Aufgezogen über der Seite: offen und nicht angeheftet. Eine angeheftete Seitenleiste (iPad) steht neben der Seite und stört
    // nicht, links wie rechts (bis 27.10.2026 zählte rechts jede offene, und der Rundgang kam auf dem iPad mit angehefteter
    // rechter Seitenleiste nie)
    const aufgezogen = (sp, seite) => !!sp && sp.collapsed === false && sp.isPinned !== true
      && !document.querySelector(".workspace-drawer.mod-" + seite + ".is-pinned");
    const eingabe = !!a && (a.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
    return {
      gesehen: gesehen(), offen: !!tour || kommt,
      bereit: !!(ws && ws.layoutReady) && !!(mc && (mc.initialized || mc.resolved)),
      sichtbar: document.visibilityState !== "hidden",
      fenster: fensterOffen(),
      einrichtung: einrichtungWartet(einrichtung()),
      menue: !!document.querySelector(".eba-nav-menue, .mobile-tab-switcher, body > .menu"),
      seitenleiste: !!Platform.isMobile && (aufgezogen(ws.leftSplit, "left") || aufgezogen(ws.rightSplit, "right")),
      hinweis: !!document.querySelector(".notice .eba-toast"),
      tippt: eingabe && (!!Platform.isMobile || Date.now() - taste < TIPP_RUHE),
      ziele: !!knopfVon("seiten") && !!knopfVon("zahnrad"),
    };
  };
  const pruefen = () => {
    if (!an || tour || kommt) return;
    if (gesehen()) { if (uhr !== null) ctx.stopp(uhr); uhr = null; return; }
    if (faellig(zustand())) zeigen().catch((e) => console.error("rundgang", e));
  };

  ctx.rundgang = { zeigen, get offen() { return !!tour; }, schliessen: () => schliessen(true), zustand, pruefen };

  return {
    registrieren() {
      an = true;
      ctx.aufraeumen(() => { an = false; schliessen(false); });
      ctx.dom(document, "keydown", tasten, true);
      ctx.dom(window, "resize", () => { if (tour) bald(); });
      if (!gesehen()) {
        ctx.zeit(pruefen, ERSTER_BLICK);
        uhr = ctx.intervall(pruefen, WIEDER);
      }
    },
    aktionen: {
      rundgang: {
        titel: "Rundgang zeigen",
        ausfuehren: async () => {
          if (!(await zeigen({ wieder: true }))) ctx.hinweis("Der Rundgang lässt sich gerade nicht zeigen.");
        },
      },
    },
  };
};
module.exports.FASSUNG = FASSUNG;
module.exports.GESEHEN = GESEHEN;
module.exports.RAND = RAND;
module.exports.ABSTAND = ABSTAND;
module.exports.RING = RING;
module.exports.SPITZE = SPITZE;
module.exports.EINRICHTUNG_WARTEN = EINRICHTUNG_WARTEN;
module.exports.schritte = schritte;
module.exports.ringLage = ringLage;
module.exports.randStreifen = randStreifen;
module.exports.blasenLage = blasenLage;
module.exports.blasenBreite = blasenBreite;
module.exports.einrichtungWartet = einrichtungWartet;
module.exports.ersterStart = ersterStart;
module.exports.faellig = faellig;
