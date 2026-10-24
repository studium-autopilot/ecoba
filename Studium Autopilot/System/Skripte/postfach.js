// Postfach (seit 0.6.0): Seite „Postfach“ (Codeblock ```eba-postfach``` auf Studium/Postfach.md) zeigt deinen Uni-Posteingang.
// Das Plugin meldet sich dafür mit deinem Uni-Login beim Webmail der Uni an (webmail.uni-tuebingen.de, Horde), liest die Liste
// und auf deinen Tipp eine Mail. Gleich auf PC, iPhone und iPad: nur https über ilias-netz.js (Dienst „mail“), kein IMAP.
// Doku: docs/architektur/postfach.md; Datenschutz: docs/datenschutz.md, „Postfach“.
//
// Zustimmung je Gerät: Erst nach „Postfach anzeigen“ (gerätelokal eba-postfach-an = Zeitpunkt) nutzt dieses Skript das Passwort
//   aus dem Schlüsselbund von ILIAS, und nur unmittelbar vor dem Absenden an das Webmail. „Auf diesem Gerät ausschalten“ nimmt
//   sie zurück und meldet ab.
// Uni-Login (ilias.js, uniZugang): Das Webmail bekommt das Passwort nur, wenn ILIAS genau dieses Passwort bestätigt hat, nie als
//   Erstes und nie, solange System/Daten/uni-zugang.json eine neuere Ablehnung meldet. Lehnt das Webmail eindeutig ab, schreibt
//   dieses Gerät den Marker (Dienst „mail“; alle Geräte mit diesem Passwort halten an). Höchstens eine Anmeldung je Abruf.
// Ablauf: /login.php holen → Formular prüfen (postfach-html.js: nur POST an https://webmail.uni-tuebingen.de/login.php) → POST
//   mit Benutzername und Passwort, Ansicht ohne JavaScript, Deutsch → angemeldet nur mit Abmelde-Link. Dann Liste (Ansicht
//   basic, 30 Mails je Seite), mit Seite 1 die Zahl ungelesener Mails (Titel der Liste in der Ansicht minimal; fehlt sie, bleibt
//   nur die Zahl weg) bzw. eine Mail (Ansicht minimal; die Uni markiert sie dabei als gelesen wie im Browser). Adressen
//   baut postfach-html.js aus Zahlen, nie aus Links der Seite. Läuft die Sitzung ab (Anmeldeseite statt Liste), meldet es sich
//   einmal neu an. Nach 10 Minuten ohne Anfrage und beim Ausschalten meldet es sich ab.
// Wann: beim Öffnen der Seite, wenn die Liste älter als 5 Minuten ist (nach einem Fehler erst nach 5 Minuten wieder von selbst),
//   und mit Aktualisieren (frühestens 15 s nach dem letzten Abruf). Kein Abruf im Hintergrund.
// Datenschutz: Mails nur im Speicher dieses Geräts, solange Obsidian läuft. Nie im Tresor, in Hinweisen (Notice), Konsole,
//   Protokoll, Fehlern oder im Datenkanal. Fehler nennen nur die Art (zugang-falsch, netz, unerwartet). Ein anderer Benutzername
//   im Uni-Login oder Trennen meldet die alte Sitzung ab und vergisst ihre Mails.
// Datum: Die Liste zeigt Mails von heute nur mit Uhrzeit; beim Lesen kommt das Datum dazu, und an einem neuen Tag zeichnet der
//   Block neu (wie kalender.js), damit gestrige Mails nicht mehr als heute erscheinen.
// Für andere Skripte: ctx.postfach = { status, laden, oeffnen, einschalten, ausschalten }. Testeinstieg: erzeugen(abh)
//   (tests/postfach.test.js, Webmail als Attrappe).
// Stil: eba-core.css Abschnitt 67, Klassen eba-pf-*; Zeilen wie die Verbindungen (.eba-vb-liste).
// iOS-sicher: keine Node-APIs, kein Lookbehind, kein .at()/findLast/structuredClone.
const SPRACHE = "eba-postfach";
const L = { an: "eba-postfach-an" };
const MIN = 60e3;
const FRISCH = 5 * MIN, WIEDER = 5 * MIN, KNOPF_ABSTAND = 15e3, LEERLAUF = 10 * MIN;
const TEXTE = {
  "zugang-falsch": "Das Webmail hat dein Passwort abgelehnt. Bitte deinen Uni-Login neu eingeben.",
  "netz": "Das Webmail ist gerade nicht erreichbar. Versuch es später noch einmal.",
  "unerwartet": "Das Webmail hat anders geantwortet als erwartet. Öffne dein Postfach so lange im Webmail.",
  "gesperrt": "Die Uni hat dein Passwort abgelehnt. Bitte deinen Uni-Login neu eingeben.",
};
// Felder, die dieses Skript selbst setzt (alles andere aus dem Formular bleibt, wie die Uni es schickt)
const EIGENE = ["login_post", "horde_user", "horde_pass", "horde_select_view", "new_lang"];

const fehlerArt = (art) => { const e = new Error(TEXTE[art] || TEXTE.unerwartet); e.art = art; return e; };
const artVon = (e) => (e && TEXTE[e.art] ? e.art : e && e.grund && e.grund !== "fremder-host" && e.grund !== "kodierung" ? "netz" : "unerwartet");

// ---------- Ablauf (ohne Obsidian, tests/postfach.test.js) ----------
// abh: { sitzung() → { anfrage }, html: postfach-html, zugang() → { benutzer, gesperrt, bestaetigt } | null, kennwort() → Text,
//   ablehnen(dienst), lokal(k, v?), jetzt() → ms, heute() → „YYYY-MM-DD“, zeit(fn, ms) → id, stopp(id), geaendert(),
//   z (Zustand, überlebt Hot-Reload; benutzer = Uni-Login, mit dem Sitzung und Mails geholt wurden) }
const erzeugen = (abh) => {
  const P = abh.html;
  const z = abh.z || {};
  const neuerZustand = () => Object.assign(z, { sitzung: null, abmelden: "", benutzer: "", seiten: {}, mails: {}, seite: 1, offen: 0,
    ungelesen: null, laeuft: false, fehler: "", versuch: 0, timer: null });
  if (!z.seiten || z.benutzer === undefined) neuerZustand(); // ohne benutzer: Stand einer älteren Fassung, Konto unbekannt
  const geaendert = () => { try { abh.geaendert(); } catch (e) { /* Anzeige egal */ } };
  const benutzer = () => { const u = abh.zugang(); return (u && u.benutzer) || ""; };

  // Anderer Uni-Login: die Sitzung des alten abmelden und seine Mails vergessen. Ein leerer Benutzername zählt nur mit entfernt
  // (Meldung „zugang“ von ilias.js, z. B. nach Trennen); kurz leer beim Neuladen von ilias.js lässt alles stehen.
  const kontoPruefen = (o) => {
    const jetzt = benutzer();
    if (!z.benutzer || z.benutzer === jetzt || (!jetzt && !(o && o.entfernt))) return false;
    const laeuft = z.laeuft; // ein Abruf unterwegs verwirft sein Ergebnis selbst (laden, oeffnen); bis dahin kein zweiter
    abmelden();
    neuerZustand();
    z.laeuft = laeuft;
    return true;
  };

  const status = () => {
    kontoPruefen();
    const u = abh.zugang();
    if (!u || !u.benutzer) return "ohne-login";
    if (u.gesperrt) return "gesperrt";
    if (!u.bestaetigt) return "unbestaetigt";
    return abh.lokal(L.an) ? "bereit" : "aus";
  };

  // Abmelden nach Leerlauf, beim Ausschalten und beim Entladen: still, Fehler egal
  const abmelden = async () => {
    if (z.timer != null) { abh.stopp(z.timer); z.timer = null; }
    const s = z.sitzung, adr = z.abmelden;
    z.sitzung = null; z.abmelden = "";
    if (s && adr) { try { await s.anfrage({ url: P.BASIS + adr }); } catch (e) { /* schon weg */ } }
  };
  const leerlauf = () => {
    if (z.timer != null) abh.stopp(z.timer);
    z.timer = abh.zeit(() => { z.timer = null; abmelden(); }, LEERLAUF);
  };

  const anmelden = async () => {
    const u = abh.zugang();
    if (!u || !u.benutzer || u.gesperrt || !u.bestaetigt) throw fehlerArt("gesperrt");
    const s = abh.sitzung();
    const r = await s.anfrage({ url: P.BASIS + "/login.php" });
    if (P.seite(r.text) === "angemeldet") { z.sitzung = s; z.abmelden = P.abmeldeAdresse(r.text); z.benutzer = u.benutzer; return; }
    const f = P.anmeldeFormular(r.text);
    if (!f) throw fehlerArt("unerwartet");
    const felder = f.felder.filter((x) => EIGENE.indexOf(x[0]) < 0);
    let geheim = abh.kennwort();
    if (!geheim) throw fehlerArt("gesperrt");
    felder.push(["login_post", "1"], ["horde_user", u.benutzer], ["horde_pass", geheim], ["horde_select_view", "mobile_nojs"], ["new_lang", "de_DE"]);
    geheim = "";
    const a = await s.anfrage({ url: f.action, methode: "POST", formular: felder });
    felder.length = 0;
    if (P.seite(a.text) === "angemeldet") { z.sitzung = s; z.abmelden = P.abmeldeAdresse(a.text); z.benutzer = u.benutzer; return; }
    if (P.fehler(a.text) === "zugang-falsch") {
      try { await abh.ablehnen("mail"); } catch (e) { /* Marker egal, der Fehler zählt */ }
      throw fehlerArt("zugang-falsch");
    }
    throw fehlerArt("unerwartet");
  };

  // Eine Seite des Webmails; abgelaufene Sitzung → einmal neu anmelden
  const holen = async (url) => {
    for (let runde = 0; runde < 2; runde++) {
      if (!z.sitzung) await anmelden();
      const r = await z.sitzung.anfrage({ url });
      leerlauf();
      if (r.status >= 500) throw fehlerArt("netz");
      if (r.status !== 200) throw fehlerArt("unerwartet");
      if (P.seite(r.text) !== "anmeldung") return r.text;
      z.sitzung = null; z.abmelden = "";
    }
    throw fehlerArt("unerwartet");
  };

  const laden = async (o) => {
    o = o || {};
    const nr = Math.max(1, Math.floor(+o.seite || z.seite || 1));
    if (z.laeuft || status() !== "bereit") return false;
    const jetzt = abh.jetzt(), wer = benutzer();
    if (o.manuell && jetzt - z.versuch < KNOPF_ABSTAND && z.seiten[nr] && nr === z.seite) return false;
    z.laeuft = true; z.versuch = jetzt; z.fehler = "";
    geaendert();
    try {
      const l = P.liste(await holen(P.listeAdresse(nr)), abh.heute());
      // Uni-Login inzwischen gewechselt: Liste des alten Kontos verwerfen
      if (wer !== z.benutzer || wer !== benutzer()) return false;
      if (l.art === "unsicher") throw fehlerArt("unerwartet");
      z.seiten[nr] = { mails: l.mails, seiten: l.seiten, gesamt: l.gesamt, zeit: abh.jetzt() };
      z.seite = nr;
      // Zahl ungelesener Mails gilt für den ganzen Posteingang: mit Seite 1 neu, sonst nur, wenn sie noch fehlt
      if (nr === 1 || z.ungelesen == null) {
        let n = null;
        try { n = P.zahlen(await holen(P.zahlenAdresse())); } catch (e) { /* die Liste zählt, die Zahl ist nur Beiwerk */ }
        z.ungelesen = n ? n.ungelesen : null;
      }
      return true;
    } catch (e) {
      z.fehler = artVon(e);
      return false;
    } finally {
      z.laeuft = false;
      geaendert();
    }
  };

  // Eine Mail; danach gilt sie in jeder geladenen Seite als gelesen (die Uni hat sie beim Öffnen markiert)
  const oeffnen = async (buid) => {
    if (z.mails[buid]) return z.mails[buid];
    if (status() !== "bereit") throw fehlerArt("gesperrt");
    const wer = benutzer();
    const n = P.nachricht(await holen(P.nachrichtAdresse(buid)));
    if (!n || wer !== z.benutzer || wer !== benutzer()) throw fehlerArt("unerwartet");
    z.mails[buid] = n;
    let war = false;
    for (const k of Object.keys(z.seiten)) for (const m of z.seiten[k].mails) if (m.buid === buid && m.ungelesen) { m.ungelesen = false; war = true; }
    if (war && z.ungelesen > 0) z.ungelesen--;
    return n;
  };

  // Beim Zeichnen: Liste fehlt oder ist älter als 5 Minuten, nach einem Fehler erst nach 5 Minuten wieder
  const faellig = () => {
    if (status() !== "bereit" || z.laeuft) return false;
    const jetzt = abh.jetzt(), s = z.seiten[z.seite];
    if (z.fehler && jetzt - z.versuch < WIEDER) return false;
    return !s || jetzt - s.zeit > FRISCH;
  };

  const einschalten = () => { abh.lokal(L.an, new Date(abh.jetzt()).toISOString()); z.fehler = ""; z.versuch = 0; return laden({ seite: 1 }); };
  const ausschalten = async () => {
    abh.lokal(L.an, null);
    await abmelden();
    neuerZustand();
    geaendert();
  };

  return { status, laden, oeffnen, faellig, einschalten, ausschalten, abmelden, kontoPruefen, zustand: () => z, TEXTE, K: { FRISCH, WIEDER, KNOPF_ABSTAND, LEERLAUF } };
};

module.exports = function (ctx) {
  const app = window.app;
  const modulVon = (n) => { const m = ctx.user && ctx.user[n]; return typeof m === "function" ? m(ctx) : m || null; };
  const lokal = (k, v) => {
    if (v === undefined) { try { return app.loadLocalStorage(k) || null; } catch (e) { return null; } }
    app.saveLocalStorage(k, v == null ? null : v);
    return v;
  };
  const heute = () => (ctx.date && ctx.date.now ? ctx.date.now("YYYY-MM-DD") : new Date().toISOString().slice(0, 10));
  let block = null;
  const neuZeichnen = () => { if (block) block.neu(); };

  let motorInst = null;
  const motor = () => {
    if (motorInst) return motorInst;
    const N = modulVon("ilias-netz"), P = modulVon("postfach-html");
    if (!N || !P) return null;
    motorInst = erzeugen({
      html: P,
      sitzung: () => N.sitzung({ dienst: "mail", drossel: N.drossel({ parallel: 1, abstand: 500 }) }),
      zugang: () => (ctx.ilias && ctx.ilias.uniZugang ? ctx.ilias.uniZugang() : null),
      kennwort: () => {
        const s = app.secretStorage;
        return s && typeof s.getSecret === "function" && ctx.ilias && ctx.ilias.geheimId ? s.getSecret(ctx.ilias.geheimId()) || "" : "";
      },
      ablehnen: (dienst) => (ctx.ilias && ctx.ilias.zugangAbgelehnt ? ctx.ilias.zugangAbgelehnt(dienst) : null),
      lokal,
      jetzt: () => (ctx.date && ctx.date.jetzt ? ctx.date.jetzt() : new Date()).getTime(),
      heute,
      zeit: (fn, ms) => ctx.zeit(fn, ms),
      stopp: (id) => { if (ctx.stopp) ctx.stopp(id); },
      geaendert: neuZeichnen,
      z: ctx.bleibend("zustand", () => ({})),
    });
    return motorInst;
  };

  // ---------- Oberfläche ----------
  const knopf = (eltern, titel, fn, cls) => {
    const b = eltern.createEl("button", { cls: "eba-vb-knopf" + (cls ? " " + cls : ""), text: titel, attr: { type: "button" } });
    b.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); fn(b); });
    return b;
  };
  const webmailLink = (eltern, text) => eltern.createEl("a", { cls: "eba-pf-webmail external-link", text, href: "https://webmail.uni-tuebingen.de", attr: { target: "_blank", rel: "noopener" } });
  // Eine Zeile wie unter Verbindungen: Symbol, Titel, gedämpfte Zeile, rechts ein Knopf. Der Link öffnet gleich die Anmeldung
  // (auch=1), auch wenn ILIAS über ein anderes Gerät verbunden ist: Mails kommen nie über den Sync, jedes Gerät braucht den Login.
  const zeile = (el, o) => {
    const liste = el.createDiv({ cls: "eba-vb-liste" });
    const z = liste.createDiv({ cls: "eba-vb" });
    z.createSpan({ cls: "eba-vb-symbol" + (o.warn ? " warn" : "") });
    const t = z.createDiv({ cls: "eba-vb-text" });
    t.createEl("b", { text: "Uni-Postfach" });
    t.createDiv({ cls: "eba-vb-status", text: o.text });
    if (o.knopf || o.link) {
      const k = z.createDiv({ cls: "eba-vb-knoepfe" });
      if (o.knopf) knopf(k, o.knopf, o.fn, "cta");
      if (o.link) k.createEl("a", { cls: "eba-vb-knopf cta", text: o.link, href: ctx.link("verbinden", { id: "ilias", auch: "1" }) });
    }
  };
  // Text einer Mail: Zeilen bleiben, Adressen werden zu Links; nie HTML aus der Mail
  const URL_RE = /(https?:\/\/[^\s<>"]+)/;
  const textMitLinks = (el, text) => {
    for (const teil of String(text || "").split(URL_RE)) {
      if (!URL_RE.test(teil)) { if (teil) el.appendText(teil); continue; }
      const m = teil.match(/^(.*?)([.,;:!?)\]]*)$/);
      el.createEl("a", { cls: "external-link", text: m[1], href: m[1], attr: { target: "_blank", rel: "noopener" } });
      if (m[2]) el.appendText(m[2]);
    }
  };
  const mailZeichnen = (box, n) => {
    box.empty();
    const kopf = box.createDiv({ cls: "eba-pf-kopfzeilen" });
    for (const [titel, wert] of [["Von", n.von], ["An", n.an], ["Kopie", n.kopie], ["Datum", n.datum]]) {
      if (!wert) continue;
      const d = kopf.createDiv();
      d.createSpan({ cls: "eba-pf-feld", text: titel });
      d.appendText(wert);
    }
    textMitLinks(box.createDiv({ cls: "eba-pf-text" }), n.text || "Diese Mail hat keinen Text. Anhänge siehst du im Webmail.");
    webmailLink(box.createDiv({ cls: "eba-pf-fuss" }), "Im Webmail antworten");
  };
  const mailZeile = (liste, m, M) => {
    const z = M.zustand();
    const reihe = liste.createDiv({ cls: "eba-vb eba-pf-mail" + (m.ungelesen ? " is-ungelesen" : "") + (z.offen === m.buid ? " is-offen" : ""), attr: { role: "button", tabindex: "0" } });
    reihe.createSpan({ cls: "eba-pf-punkt", attr: { "aria-label": m.ungelesen ? "ungelesen" : "gelesen" } });
    const t = reihe.createDiv({ cls: "eba-pf-mitte" });
    const oben = t.createDiv({ cls: "eba-pf-oben" });
    oben.createSpan({ cls: "eba-pf-von", text: m.von || "(ohne Absender)" });
    oben.createSpan({ cls: "eba-pf-datum", text: ctx.user["postfach-html"].datumKurz(m.datum, heute()) });
    t.createDiv({ cls: "eba-pf-betreff", text: m.betreff || "(ohne Betreff)" });
    const box = liste.createDiv({ cls: "eba-pf-offen" + (z.offen === m.buid ? "" : " is-zu") });
    const zeigen = () => {
      box.removeClass("is-zu");
      if (z.mails[m.buid]) { mailZeichnen(box, z.mails[m.buid]); return; }
      box.empty();
      box.createDiv({ cls: "eba-pf-leise", text: "Die Mail wird geladen …" });
      M.oeffnen(m.buid).then((n) => {
        mailZeichnen(box, n);
        reihe.removeClass("is-ungelesen");
        const zahl = reihe.closest(".eba-pf") && reihe.closest(".eba-pf").querySelector(".eba-pf-zahl");
        if (zahl && z.ungelesen > 0) zahl.setText(z.ungelesen + " ungelesen");
        else if (zahl) zahl.remove();
      }, (e) => { box.empty(); box.createDiv({ cls: "eba-pf-hinweis", text: TEXTE[artVon(e)] }); });
    };
    if (z.offen === m.buid) zeigen();
    const tippen = () => {
      if (z.offen === m.buid) { z.offen = 0; reihe.removeClass("is-offen"); box.addClass("is-zu"); return; }
      for (const x of liste.querySelectorAll(".eba-pf-mail.is-offen")) x.removeClass("is-offen");
      for (const x of liste.querySelectorAll(".eba-pf-offen")) x.addClass("is-zu");
      z.offen = m.buid; reihe.addClass("is-offen"); zeigen();
    };
    reihe.addEventListener("click", tippen);
    reihe.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); tippen(); } });
  };

  const zeichnen = (el) => {
    el.empty();
    const M = motor();
    if (!M) { el.setText("Das Postfach erscheint, sobald Studium Autopilot ganz geladen ist."); return; }
    const w = el.createDiv({ cls: "eba-pf" });
    const st = M.status();
    if (st === "ohne-login") return zeile(w, { text: "Verbinde zuerst deinen Uni-Login, dann siehst du hier deine Uni-Mails.", link: "Mit Uni-Login verbinden" });
    if (st === "gesperrt") return zeile(w, { text: TEXTE.gesperrt, link: "Mit Uni-Login verbinden", warn: true });
    if (st === "unbestaetigt") return zeile(w, { text: "Sobald ILIAS deinen Uni-Login angenommen hat, siehst du hier deine Uni-Mails." });
    if (st === "aus") {
      return zeile(w, { text: "Studium Autopilot meldet sich mit deinem Uni-Login beim Webmail der Uni an und zeigt dir hier deinen "
        + "Posteingang. Deine Mails bleiben bei der Uni; in deinem Tresor wird nichts gespeichert.", knopf: "Postfach anzeigen", fn: () => M.einschalten() });
    }
    const z = M.zustand(), s = z.seiten[z.seite];
    const kopf = w.createDiv({ cls: "eba-pf-leiste" });
    const titel = kopf.createDiv({ cls: "eba-pf-titel" });
    titel.createSpan({ text: "Posteingang" });
    if (z.ungelesen > 0) titel.createSpan({ cls: "eba-pf-zahl", text: z.ungelesen + " ungelesen" });
    const rechts = kopf.createDiv({ cls: "eba-vb-knoepfe" });
    const ak = knopf(rechts, z.laeuft ? "Wird aktualisiert …" : "Aktualisieren", () => M.laden({ seite: z.seite, manuell: true }));
    ak.disabled = z.laeuft;
    webmailLink(rechts, "Im Webmail öffnen");
    if (z.fehler) w.createDiv({ cls: "eba-pf-hinweis", text: TEXTE[z.fehler] });
    if (!s) {
      if (z.laeuft) w.createDiv({ cls: "eba-pf-leer", text: "Dein Posteingang wird geladen …" });
    } else if (!s.mails.length) {
      w.createDiv({ cls: "eba-pf-leer", text: "Dein Posteingang ist leer." });
    } else {
      const liste = w.createDiv({ cls: "eba-vb-liste eba-pf-liste" });
      for (const m of s.mails) mailZeile(liste, m, M);
      if (s.seiten > 1) {
        const fuss = w.createDiv({ cls: "eba-pf-seiten" });
        const neuer = knopf(fuss, "Neuere", () => M.laden({ seite: z.seite - 1 }));
        neuer.disabled = z.laeuft || z.seite <= 1;
        fuss.createSpan({ cls: "eba-pf-leise", text: `Seite ${z.seite} von ${s.seiten}` });
        const aelter = knopf(fuss, "Ältere", () => M.laden({ seite: z.seite + 1 }));
        aelter.disabled = z.laeuft || z.seite >= s.seiten;
      }
    }
    const aus = w.createDiv({ cls: "eba-pf-aus" }).createEl("a", { text: "Auf diesem Gerät ausschalten", href: "#" });
    aus.addEventListener("click", (e) => { e.preventDefault(); M.ausschalten(); });
    if (M.faellig()) ctx.zeit(() => M.laden({}), 0);
  };

  const registrieren = () => {
    block = ctx.codeblock(SPRACHE, (quelle, el) => {
      try { zeichnen(el); } catch (e) { console.error(SPRACHE, e && e.name); el.empty(); el.setText(String(quelle)); }
    });
    // Uni-Login gespeichert, bestätigt, abgelehnt oder getrennt (ilias.js): ein anderer oder entfernter Benutzername meldet die
    // alte Sitzung gleich ab und vergisst ihre Mails (auch ohne offene Seite), dann neu zeichnen. Das Plugin startet die
    // Erweiterungen alphabetisch, ilias.js also vor diesem Skript.
    if (ctx.ilias && ctx.ilias.beobachten) {
      ctx.aufraeumen(ctx.ilias.beobachten((x) => {
        if (x && x.art !== "zugang" && x.art !== "fertig") return;
        if (motorInst) motorInst.kontoPruefen({ entfernt: !!x && x.art === "zugang" });
        neuZeichnen();
      }));
    }
    ctx.aufraeumen(() => { const M = motorInst; if (M) M.abmelden(); });
    // Neuer Tag: „08:40“ von gestern wird zu „23.10.“ (alle 30 Minuten und beim Zurückkommen in die App, nur sichtbar)
    let gezeichnetAm = heute();
    const tagNeu = () => {
      const h = heute();
      if (h === gezeichnetAm || document.visibilityState !== "visible") return;
      gezeichnetAm = h;
      neuZeichnen();
    };
    ctx.intervall(tagNeu, 30 * MIN);
    ctx.dom(document, "visibilitychange", tagNeu);
  };

  const api = {
    status: () => (motor() ? motor().status() : "ohne-login"),
    laden: (o) => (motor() ? motor().laden(o) : Promise.resolve(false)),
    oeffnen: (buid) => motor().oeffnen(buid),
    einschalten: () => motor().einschalten(),
    ausschalten: () => motor().ausschalten(),
  };
  ctx.postfach = api;
  return Object.assign({ registrieren }, api);
};
module.exports.erzeugen = erzeugen;
module.exports.SPRACHE = SPRACHE;
