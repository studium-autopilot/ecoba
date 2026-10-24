// Uni-Login (seit 0.4.8): Einmal Benutzername und Passwort der Uni, dann verbindet Studium Autopilot alles, was diesen Login
// braucht: ILIAS-Unterlagen (ilias.js), die Abgaben aus dem ILIAS-Kalender (ilias-kalender.js) und deinen Alma-Stundenplan
// (alma.js). Die beiden Abo-Links holt es selbst, statt dass du sie in ILIAS und Alma kopierst. Doku: docs/architektur/verbindungen.md,
// „Uni-Login“. Bibliothek (wie quellen.js): Wer sie braucht, ruft ctx.user["uni-login"](ctx) auf; beim Laden passiert nichts.
//
// Zustimmung (Entscheidung vom 19.10.2026): Wer seinen Uni-Login eingibt, stimmt zu, dass Studium Autopilot sich damit bei ILIAS
//   UND Alma anmeldet, aber nur, wenn das Fenster es vor der Eingabe sagt (Registry ilias in verbindungen.js: kurz und datenschutz
//   nennen Unterlagen, ILIAS-Kalender und Alma-Stundenplan). Darum gilt die Zustimmung je Quelle und Gerät (gerätelokal
//   eba-uni-zustimmung, { <id>: Zeitpunkt }) und nur für das Passwort, das danach gespeichert ist (Zeitpunkt ≥ uniZugang().seit):
//   Gesetzt wird sie nach der Anmeldung im Fenster „Mit Uni-Login verbinden“ bzw. in der Einrichtung (zustimmen(ids): genau die
//   Quellen, die der Satz davor nannte, Registry ilias uniQuellen; ohne ids jede, die nicht von außen kommt) und beim Tipp auf
//   Verbinden im Link-Fenster einer Quelle (zustimmen([id]); das Fenster sagt, wo es sich anmeldet).
//   Ohne Zustimmung verbindet und erneuert nichts von selbst (offen, erneuern); ein Login aus 0.4.7 oder früher hat keine.
// Von selbst (alleVerbinden nach der Anmeldung) nur, was auf diesem Gerät nicht verbunden ist, nicht über ein anderes deiner Geräte
//   (ctx.verbindungen.imTresor, wie Zeilen und Schloss) und nicht von außen (eigener Uni-Abgleich, quelleExtern über status().extern).
// Woher die Links kommen (an echten Seiten geprüft am 19.10.2026; die Links blieben dabei gleich):
//   ILIAS-Kalender: ctx.ilias.kalenderLinks() liest in der ILIAS-Sitzung die Seite „Kalender“ und das Fenster „Kalender
//     abonnieren“; ctx.iliasKalender.linkWaehlen nimmt „iCal-URL (Google Kalender)“ (ohne Altes, bleibt klein), sonst „iCal-URL“.
//   Alma-Stundenplan: ctx.almaKonto.stundenplanLink() meldet sich an, liest die Seite „Stundenplan“ (der Link steht dort im
//     versteckten Fenster „Daten für iCalendar (ics) exportieren“) und meldet sich ab. Nur, wenn ILIAS das Passwort bestätigt hat.
//   Danach verbindet die Quelle wie mit einem eingefügten Link (Registry in verbindungen.js, verbinden(link)): Nur wenn der erste
//   Abruf klappt, bleibt der Link gespeichert (gerätelokal, nie im Tresor).
// Link gilt nicht mehr: ilias-kalender.js und alma.js fragen erneuern(id, alterLink), wenn ein Abruf auf den Link zeigt (Alma bzw.
//   ILIAS kennt ihn nicht). Mit Zustimmung höchstens einmal am Tag je Quelle und Gerät (gerätelokal eba-uni-erneuert) holt das einen
//   neuen Link; die Quelle versucht es damit gleich noch einmal. Derselbe Link zählt nicht als neu.
// Trennen bleibt je Quelle: ILIAS trennen löscht den Uni-Login; Kalender und Stundenplan behalten ihre Links.
// Schnittstelle: bereit(), kannSelbst(id), zugestimmt(id), zustimmen(ids?), moeglich(), offen(), linkHolen(id), verbinden(id),
//   alleVerbinden({ schritt(id) }), erneuern(id, alt), zeile(id, ergebnis) → Satz für Fenster und Einrichtung, hinweis(ergebnisse) →
//   höchstens zwei Sätze für den Hinweis; QUELLEN, NAME. id: "ilias-kalender" | "alma". Ergebnis: { ok, text } bzw. { ok: false,
//   art, fehler }. Gleichzeitige Aufrufe für dieselbe Quelle teilen einen Abruf.
// Tests: tests/uni-login.test.js (erzeugen(abh) mit Attrappen). iOS-sicher: keine Node-APIs, kein Lookbehind, kein .at().
const QUELLEN = Object.freeze(["ilias-kalender", "alma"]);
const NAME = Object.freeze({ "ilias-kalender": "ILIAS-Kalender", alma: "Alma-Stundenplan" }); // wie die Zeilen unter Verbindungen
const ERNEUERT = "eba-uni-erneuert"; // gerätelokal: { <id>: Zeitpunkt des letzten Versuchs, einen neuen Link zu holen }
const ZUSTIMMUNG = "eba-uni-zustimmung"; // gerätelokal: { <id>: Zeitpunkt der Zustimmung }
const TAG = 24 * 3600e3;
const LAUFEND = {}; // id → laufender Abruf, geteilt von allen Aufrufern (Fenster, Einrichtung, Quellen)

// Sätze zu einem gescheiterten Abruf (nie mit Link, Benutzername oder Passwort)
const OHNE_ZUGANG = "Dein Uni-Login fehlt auf diesem Gerät.";
const ALTE_FASSUNG = "Das geht in dieser Version noch nicht.";
const NICHT_BESTAETIGT = "ILIAS hat deinen Uni-Login noch nicht bestätigt. Gib ihn bei ILIAS-Unterlagen noch einmal ein.";
const NICHT_ERREICHBAR = "Alma ist gerade nicht erreichbar. Später noch einmal versuchen.";
const KEINE_VERBINDUNG = "Keine Verbindung zu Alma. Später noch einmal versuchen.";
const ALMA_FEHLER = {
  "zugang-falsch": "Alma hat dein Passwort abgelehnt.", abgelehnt: "Alma hat dein Passwort abgelehnt.",
  "zwei-faktor": "Alma verlangt einen zweiten Faktor. Melde dich einmal im Browser bei Alma an.",
  zustimmung: "Alma möchte eine Zustimmung. Melde dich einmal im Browser bei Alma an.",
  "abgelehnt-unklar": "Alma hat anders geantwortet als erwartet.", unerwartet: "Alma hat anders geantwortet als erwartet.",
  fehler: "Alma hat anders geantwortet als erwartet.",
  netz: KEINE_VERBINDUNG, zeit: KEINE_VERBINDUNG, server: NICHT_ERREICHBAR, wartung: NICHT_ERREICHBAR, stopp: NICHT_ERREICHBAR,
  "wartet-ilias": "Alma wartet, bis ILIAS deinen Uni-Login bestätigt hat.", baustein: ALTE_FASSUNG,
};
const KEIN_LINK = { alma: "Den Link fand Studium Autopilot in Alma nicht.", "ilias-kalender": "Den Link fand Studium Autopilot im ILIAS-Kalender nicht." };

// abh: { ilias() → ctx.ilias, kalender() → ctx.iliasKalender, almaKonto() → ctx.almaKonto, quelle(id) → Eintrag der Registry
//   (status(), verbinden(link) → { ok, text } | { ok: false, fehler }, externText), anderswo(id) → über ein anderes Gerät
//   verbunden?, lokal(k, v?), jetzt() → Date }
const erzeugen = (abh, laufend) => {
  laufend = laufend || {};
  const sicher = (fn, sonst) => { try { return fn(); } catch (e) { return sonst; } };
  const status = (id) => sicher(() => abh.quelle(id).status(), null) || {};
  const zeitVon = (s) => { const t = Date.parse(s || ""); return isNaN(t) ? 0 : t; };
  const zugang = () => sicher(() => abh.ilias().uniZugang(), null);

  // Uni-Login auf diesem Gerät nutzbar: Benutzername und Passwort gespeichert, von ILIAS bestätigt, nirgends abgelehnt (Marker) und
  // nicht nach einer Ablehnung hier gesperrt (Stand von ilias.js, auch wenn der Marker nicht geschrieben werden konnte)
  const bereit = () => {
    const I = sicher(() => abh.ilias(), null);
    if (!I || typeof I.uniZugang !== "function" || !sicher(() => I.kannSpeichern(), false)) return false;
    const z = zugang();
    if (!(z && z.benutzer && z.bestaetigt && !z.gesperrt)) return false;
    return !sicher(() => I.status().gesperrt, false);
  };
  // Kann der Uni-Login diese Quelle hier verbinden? Bausteine da, Quelle nicht von außen
  const baustein = (id) => (id === "alma" ? !!sicher(() => typeof abh.almaKonto().stundenplanLink === "function", false)
    : id === "ilias-kalender" ? !!sicher(() => typeof abh.ilias().kalenderLinks === "function" && typeof abh.kalender().linkWaehlen === "function", false) : false);
  // Stand nicht lesbar (Skript der Quelle noch nicht geladen, etwa mitten im Sync): nicht möglich, nie „nicht von außen“
  const kannSelbst = (id) => { const st = sicher(() => abh.quelle(id).status(), null); return bereit() && baustein(id) && !!st && !st.extern; };
  // Warum nicht bereit? Login fehlt, abgelehnt bzw. gesperrt (der Satz von ILIAS: falsches Passwort, zweiter Faktor, Zustimmung)
  // oder noch nicht bestätigt
  const nichtBereit = () => {
    const I = sicher(() => abh.ilias(), null), z = zugang(), st = sicher(() => I.status(), null) || {};
    if (!I || !z || !z.benutzer || !sicher(() => I.kannSpeichern(), false)) return { ok: false, art: "ohne-zugang", fehler: OHNE_ZUGANG };
    if (z.gesperrt || st.gesperrt) return { ok: false, art: "gesperrt", fehler: String(st.text || "") || "ILIAS hat dein Passwort abgelehnt. Bitte neu verbinden." };
    return { ok: false, art: "unbestaetigt", fehler: NICHT_BESTAETIGT };
  };

  // Zustimmung je Quelle, nur für das jetzt gespeicherte Passwort
  const zustimmungen = () => { const m = sicher(() => abh.lokal(ZUSTIMMUNG), null); return m && typeof m === "object" ? m : {}; };
  const zugestimmt = (id) => { const z = zugang(), t = zeitVon(zustimmungen()[id]); return !!(z && t && t >= zeitVon(z.seit)); };
  // ohne ids: was der Satz vor der Eingabe nannte, also jede Quelle, die nicht von außen kommt (verbindungen.js, Registry ilias kurz)
  const zustimmen = (ids) => {
    const jetzt = abh.jetzt().toISOString(), m = Object.assign({}, zustimmungen());
    for (const id of ids || QUELLEN.filter((q) => !status(q).extern)) if (QUELLEN.indexOf(id) >= 0) m[id] = jetzt;
    abh.lokal(ZUSTIMMUNG, m);
  };
  // Was der Uni-Login hier noch verbinden könnte: nicht verbunden, nicht über ein anderes Gerät, nicht von außen (moeglich); davon
  // verbindet er nach der Anmeldung von selbst nur, was zugestimmt ist (offen). Ein Tipp auf Verbinden (kannSelbst) geht auch, wenn
  // ein anderes Gerät schon verbunden ist („Auch hier verbinden“).
  const moeglich = () => QUELLEN.filter((id) => kannSelbst(id) && !status(id).verbunden && !sicher(() => abh.anderswo(id), false));
  const offen = () => moeglich().filter(zugestimmt);

  // Abo-Link holen, ohne ihn zu speichern → { ok: true, link } | { ok: false, art, fehler }. Fragt bei jedem Aufruf neu, ob es geht
  // (ein Fenster kann offen sein, während per Sync ein eigener Uni-Abgleich ankommt)
  const linkHolen = async (id) => {
    if (!bereit()) return nichtBereit();
    if (!baustein(id)) return { ok: false, art: "baustein", fehler: ALTE_FASSUNG };
    if (status(id).extern) return { ok: false, art: "extern", fehler: String(sicher(() => abh.quelle(id).externText, "") || "Kommt über deinen Uni-Abgleich.") };
    if (id === "alma") {
      let r = null;
      try { r = await abh.almaKonto().stundenplanLink(); } catch (e) { r = null; }
      if (r && r.art === "ok" && r.link) return { ok: true, link: r.link };
      const art = (r && r.art) || "fehler";
      return { ok: false, art, fehler: r && r.grund === "kein-link" ? KEIN_LINK.alma : art === "ohne-zugang" ? OHNE_ZUGANG : ALMA_FEHLER[art] || ALMA_FEHLER.unerwartet };
    }
    let links;
    try { links = await abh.ilias().kalenderLinks(); } catch (e) {
      const art = (e && e.art) || "fehler";
      // Abgelehnt oder Anmeldung gescheitert: der Satz aus ilias.js bzw. ilias-anmeldung.js (mit Code, ohne Adressen)
      const satz = art === "zugang" || art === "anmeldung" ? String((e && e.message) || "") : "";
      return { ok: false, art, fehler: satz || (art === "kalender" ? KEIN_LINK[id] : art === "ohne-zugang" ? OHNE_ZUGANG
        : art === "ohne-anmeldung" || art === "baustein" ? ALTE_FASSUNG : "ILIAS war gerade nicht erreichbar. Später noch einmal versuchen.") };
    }
    const link = abh.kalender().linkWaehlen(links);
    return link ? { ok: true, link } : { ok: false, art: "kein-link", fehler: KEIN_LINK[id] };
  };

  // Link holen und die Quelle damit verbinden (erster Abruf inklusive) → { ok, text } | { ok: false, art, fehler }
  const verbindenEinmal = async (id) => {
    const r = await linkHolen(id);
    if (!r.ok) return r;
    let v = null;
    try { v = await abh.quelle(id).verbinden(r.link); } catch (e) { v = { ok: false, fehler: "" }; }
    return v && v.ok ? { ok: true, text: v.text || "" } : { ok: false, art: "abruf", fehler: (v && v.fehler) || "Das hat nicht geklappt. Bitte noch einmal versuchen." };
  };
  const verbinden = async (id) => {
    if (laufend[id]) return laufend[id];
    laufend[id] = verbindenEinmal(id);
    try { return await laufend[id]; } finally { laufend[id] = null; }
  };

  // Nach der Anmeldung (Fenster von ILIAS, Einrichtung): erst der Kalender (gleiche ILIAS-Sitzung), dann Alma; nur, was offen()
  // nennt. o.schritt(id) vor jedem. → { <id>: Ergebnis | null } (null: nicht nötig oder nicht möglich)
  const alleVerbinden = async (o) => {
    o = o || {};
    const aus = {}, liste = offen();
    for (const id of QUELLEN) {
      if (liste.indexOf(id) < 0) { aus[id] = null; continue; }
      if (typeof o.schritt === "function") { try { o.schritt(id); } catch (e) { /* nur Anzeige */ } }
      aus[id] = await verbinden(id);
    }
    return aus;
  };

  // Link gilt nicht mehr (ilias-kalender.js, alma.js): mit Zustimmung höchstens einmal am Tag einen neuen holen → neuer Link | ""
  const erneuern = async (id, alt) => {
    if (!kannSelbst(id) || !zugestimmt(id)) return "";
    const jetzt = abh.jetzt().getTime(), m = sicher(() => abh.lokal(ERNEUERT), null) || {};
    const zuletzt = Date.parse((m && m[id]) || "");
    if (!isNaN(zuletzt) && jetzt - zuletzt < TAG) return "";
    abh.lokal(ERNEUERT, Object.assign({}, m, { [id]: new Date(jetzt).toISOString() }));
    const r = await linkHolen(id);
    return r.ok && r.link !== String(alt || "").trim() ? r.link : "";
  };

  // Ein Satz zum Ergebnis einer Quelle (Zeilen im Fenster und in der Einrichtung): „ILIAS-Kalender verbunden – 3 Abgaben …“ bzw.
  // „Alma-Stundenplan: <Grund>“; null → ""
  const zeile = (id, r) => (!r ? "" : r.ok ? `${NAME[id]} verbunden${r.text ? " – " + r.text : "."}` : `${NAME[id]}: ${r.fehler}`);
  // Hinweis (Fenster schon zu): höchstens zwei Sätze ohne Vorsatz (docs/design.md „Hinweise“). ergebnisse = { <id>: Ergebnis | null }
  const und = (l) => l.map((id) => NAME[id]).join(" und ");
  const hinweis = (ergebnisse) => {
    const e = ergebnisse || {}, gut = QUELLEN.filter((id) => e[id] && e[id].ok), schlecht = QUELLEN.filter((id) => e[id] && !e[id].ok);
    const teile = [];
    if (gut.length) teile.push(`${und(gut)} verbunden.`);
    if (schlecht.length) teile.push(`${und(schlecht)} ${schlecht.length === 1 ? "ließ" : "ließen"} sich nicht verbinden, unter Verbindungen geht es noch einmal.`);
    return teile.join(" ");
  };

  return { bereit, kannSelbst, zugestimmt, zustimmen, moeglich, offen, linkHolen, verbinden, alleVerbinden, erneuern, zeile, hinweis, QUELLEN, NAME };
};

// ---------- Anschluss an Obsidian ----------
module.exports = function (ctx) {
  const app = window.app;
  return erzeugen({
    ilias: () => ctx.ilias || null,
    kalender: () => ctx.iliasKalender || null,
    almaKonto: () => ctx.almaKonto || null,
    quelle: (id) => (ctx.verbindungen && ctx.verbindungen.holen ? ctx.verbindungen.holen(id) : null),
    anderswo: (id) => !!(ctx.verbindungen && ctx.verbindungen.imTresor && ctx.verbindungen.imTresor(id).art === "anderswo"),
    lokal: (k, v) => {
      if (v === undefined) { try { return app.loadLocalStorage(k) || null; } catch (e) { return null; } }
      app.saveLocalStorage(k, v == null ? null : v);
      return v;
    },
    jetzt: () => (ctx.date && ctx.date.jetzt ? ctx.date.jetzt() : new Date()),
  }, LAUFEND);
};
module.exports.erzeugen = erzeugen;
module.exports.QUELLEN = QUELLEN;
