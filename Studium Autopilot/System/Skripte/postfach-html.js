// Postfach lesen (Webmail der Uni Tübingen, Horde IMP; seit 0.6.0): reine Funktionen für Anmeldeseite, Posteingang und eine
// Mail. Kein Netz, keine Zeitgeber, nichts passiert beim Laden; den Ablauf macht postfach.js.
//
// Aufruf in Obsidian:  const P = ctx.user["postfach-html"](ctx);   (nutzt den Zerleger aus ilias-html.js)
// Ohne Obsidian:       require("postfach-html.js").erzeugen(require("ilias-html.js"))
//
// Schnittstelle:
//   seite(html) → "angemeldet" | "anmeldung" | "unbekannt"
//   anmeldeFormular(html) → { action, felder: [[name, wert]] } | null   (nur versteckte Felder; Benutzername und Passwort setzt
//       postfach.js erst beim Absenden ein). null, wenn das Formular nicht genau zum Webmail passt.
//   fehler(html) → "zugang-falsch" | "unerwartet"
//   abmeldeAdresse(html) → "/login.php?horde_logout_token=…" | ""
//   liste(html, heute?) → { art: "ok" | "leer" | "unsicher", mails: [{ buid, von, betreff, datum, ungelesen, markiert, groesse }],
//       seiten, gesamt }   (gesamt: Zahl aus der Zeile über der Liste, sonst null; mit heute „YYYY-MM-DD“ wird die reine Uhrzeit
//       von heute zu „22.10.2026 08:40:00“)
//   zahlen(html) → { ungelesen, gesamt } | null   (Titel der Liste in der Ansicht minimal; nur dort steht die Zahl ungelesener)
//   nachricht(html) → { betreff, datum, von, an, kopie, text } | null
//   datumKurz(datum, heute) → „08:40“ (heute), „21.10.“ (dieses Jahr), „30.12.2025“ (früher), sonst wie geliefert
//   listeAdresse(seite), zahlenAdresse(), nachrichtAdresse(buid): die einzigen Adressen, die postfach.js holt. Sie entstehen hier aus Zahlen,
//       nie aus Links der Seite: Die Seiten tragen auch Links wie „Löschen“, „Ordner leeren“ und „Endgültig löschen“.
//
// Befunde an echten Seiten (22.10.2026, einmal, nur Aufbau; Testseiten in tests/daten/postfach/ sind erfunden):
//   * Anmeldung: /login.php, Formular #horde_login (POST an https://webmail.uni-tuebingen.de/login.php), versteckt app,
//     login_post, url, anchor_string; Felder horde_user, horde_pass, Auswahl horde_select_view (mobile_nojs = Ansicht ohne
//     JavaScript) und new_lang (de_DE). Nach dem Absenden 302 zum Portal.
//   * Abgelehnt (erfundener Benutzername): wieder das Formular, darüber .noticetext „Die Anmeldung ist fehlgeschlagen, weil Sie
//     Ihren Benutzernamen oder Ihr Passwort falsch eingegeben haben.“
//   * Angemeldet: jede Seite trägt den Abmelde-Link /login.php?horde_logout_token=…&logout_reason=4.
//   * Posteingang (Ansicht basic, /imp/basic.php?page=mailbox&mailbox=SU5CT1g&mpage=N; SU5CT1g = „INBOX“ in base64url):
//     table.messageList, je Mail <tr id="row<buid>" class="flagUnseen …">, Zellen: Auswahl, Von, Betreff (a.mboxSubject mit
//     title = ganzer Betreff), Datum (heute „08:40:00“, sonst „21.10.2026“), Größe. 30 Mails je Seite, neueste zuerst; Links
//     zu weiteren Seiten mit mpage=N. Titel nur „Webmail :: Posteingang“; darüber #mailboxLabel „Posteingang (145 Nachrichten /
//     Seite 1 von 5)“ (eine Seite: „(145 Nachrichten)“, leer: „(Keine Nachrichten)“). Keine Zahl ungelesener Mails.
//   * Liste in der Ansicht minimal (/imp/minimal.php?page=mailbox&mailbox=SU5CT1g): Titel „Webmail :: Posteingang (145
//     ungelesen/145 insgesamt) - 1 von 5“, aber ohne Datum je Mail; postfach.js liest dort nur die Zahlen.
//   * Mail (Ansicht minimal, /imp/minimal.php?mailbox=SU5CT1g&buid=N&page=message): Kopf als <div><em>Betreff:</em> …</div>
//     (Betreff, Datum, Von, An), Text in .mimePartData mit <br />. Das Öffnen markiert die Mail als gelesen wie im Browser.
// Datenschutz: Diese Datei gibt Mails nur zurück; sie schreibt, meldet und protokolliert nichts.
// iOS-sicher: keine Node-APIs, kein Lookbehind, kein .at()/findLast/structuredClone.
const HOST = "webmail.uni-tuebingen.de";
const BASIS = "https://" + HOST;
const POSTEINGANG = "SU5CT1g"; // „INBOX“ in base64url, so nennt Horde den Posteingang in Adressen
const listeAdresse = (seite) => BASIS + "/imp/basic.php?page=mailbox&mailbox=" + POSTEINGANG + "&mpage=" + Math.max(1, Math.floor(+seite || 1));
const zahlenAdresse = () => BASIS + "/imp/minimal.php?page=mailbox&mailbox=" + POSTEINGANG;
const nachrichtAdresse = (buid) => {
  const n = Math.floor(+buid);
  if (!(n > 0)) throw new Error("postfach-html: ungültige Mail");
  return BASIS + "/imp/minimal.php?mailbox=" + POSTEINGANG + "&buid=" + n + "&page=message";
};
// Kopf einer Mail: Beschriftung (deutsch und englisch) → Feld
const KOPF = { "betreff": "betreff", "subject": "betreff", "datum": "datum", "date": "datum", "von": "von", "from": "von",
  "an": "an", "to": "an", "kopie": "kopie", "cc": "kopie" };
const BLOCK = { div: 1, p: 1, br: 1, li: 1, tr: 1, blockquote: 1, pre: 1, h1: 1, h2: 1, h3: 1, h4: 1, h5: 1, h6: 1, table: 1, hr: 1 };

const UHRZEIT = /^(\d{1,2}):(\d{2})(?::\d{2})?$/;
// Datum einer Mail für die Liste: heute die Uhrzeit, dieses Jahr Tag und Monat, sonst das Datum. liste(html, heute) ergänzt die
// reine Uhrzeit von heute um das Datum („22.10.2026 08:40:00“), damit sie nach Mitternacht nicht mehr als heute gilt.
const datumKurz = (datum, heute) => {
  const d = String(datum || "").trim(), h = String(heute || "");
  let m = d.match(UHRZEIT);
  if (m) return m[1].padStart(2, "0") + ":" + m[2];
  m = d.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::\d{2})?)?$/);
  if (!m) return d;
  const tag = m[1].padStart(2, "0"), monat = m[2].padStart(2, "0");
  if (m[4] && h === m[3] + "-" + monat + "-" + tag) return m[4].padStart(2, "0") + ":" + m[5];
  return tag + "." + monat + "." + (h.slice(0, 4) === m[3] ? "" : m[3]);
};
// „08:40:00“ (Horde: heute) → „22.10.2026 08:40:00“; alles andere bleibt
const datumVoll = (datum, heute) => {
  const h = String(heute || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return h && UHRZEIT.test(datum) ? h[3] + "." + h[2] + "." + h[1] + " " + datum : datum;
};

const erzeugen = (H) => {
  if (!H || typeof H.parsen !== "function") throw new Error("postfach-html: Zerleger aus ilias-html.js fehlt");
  const { parsen, alle, erstes, text, attr, hatKlasse } = H;
  const baumVon = (html) => (html && typeof html === "object" && html.name ? html : parsen(String(html || "")));
  const norm = (s) => String(s || "").replace(/\s+/g, " ").trim();

  // ---------- Anmeldung ----------
  const ABMELDEN = /^(?:https:\/\/webmail\.uni-tuebingen\.de)?\/login\.php\?horde_logout_token=[A-Za-z0-9_-]+(?:&logout_reason=\d+)?$/;
  const abmeldeAdresse = (html) => {
    const a = erstes(baumVon(html), (e) => e.name === "a" && ABMELDEN.test(attr(e, "href")));
    return a ? attr(a, "href").replace(BASIS, "") : "";
  };
  const loginFormular = (b) => erstes(b, (e) => e.name === "form" && (attr(e, "id") === "horde_login" || attr(e, "name") === "horde_login")
    && !!erstes(e, (x) => x.name === "input" && attr(x, "name") === "horde_pass"));
  const seite = (html) => {
    const b = baumVon(html);
    if (abmeldeAdresse(b)) return "angemeldet";
    return loginFormular(b) ? "anmeldung" : "unbekannt";
  };
  // Formular nur, wenn es per POST genau an https://webmail.uni-tuebingen.de/login.php geht (Port 443 oder keiner)
  const anmeldeFormular = (html) => {
    const f = loginFormular(baumVon(html));
    if (!f || String(attr(f, "method")).toLowerCase() !== "post") return null;
    let ziel;
    try { ziel = new URL(attr(f, "action"), BASIS + "/login.php"); } catch (e) { return null; }
    if (ziel.protocol !== "https:" || ziel.hostname.toLowerCase() !== HOST || (ziel.port && ziel.port !== "443") || ziel.pathname !== "/login.php") return null;
    const felder = alle(f, (x) => x.name === "input" && String(attr(x, "type")).toLowerCase() === "hidden" && attr(x, "name"))
      .map((x) => [attr(x, "name"), attr(x, "value")]);
    return { action: BASIS + "/login.php", felder };
  };
  const fehler = (html) => {
    const b = baumVon(html);
    const t = alle(b, (e) => hatKlasse(e, "noticetext")).map(text).join(" ");
    return loginFormular(b) && /falsch eingegeben|entered (?:it |them )?incorrectly|incorrect/i.test(t) ? "zugang-falsch" : "unerwartet";
  };

  // ---------- Posteingang ----------
  const liste = (html, heute) => {
    const b = baumVon(html);
    const tabelle = erstes(b, (e) => e.name === "table" && hatKlasse(e, "messageList"));
    const zeilen = tabelle ? alle(tabelle, (e) => e.name === "tr" && /^row\d+$/.test(attr(e, "id"))) : [];
    const mails = [];
    for (const z of zeilen) {
      const zellen = z.kinder.filter((k) => k.name === "td");
      if (zellen.length < 4) continue;
      const a = erstes(zellen[2], (e) => e.name === "a" && hatKlasse(e, "mboxSubject"));
      mails.push({
        buid: +attr(z, "id").slice(3),
        von: norm(text(zellen[1])),
        betreff: norm(attr(a, "title")) || norm(text(zellen[2])),
        datum: datumVoll(norm(text(zellen[3])), heute),
        groesse: zellen[4] ? norm(text(zellen[4])) : "",
        ungelesen: hatKlasse(z, "flagUnseen"),
        markiert: hatKlasse(z, "flagFlagged"),
      });
    }
    // Zeile über der Liste: „Posteingang (145 Nachrichten / Seite 1 von 5)“, „(1 Nachricht)“ oder „(Keine Nachrichten)“
    const zeile = norm(text(erstes(b, (e) => attr(e, "id") === "mailboxLabel")));
    const m = zeile.match(/\((\d+)\s+(?:Nachricht(?:en)?|Messages?)(?:\s*\/\s*(?:Seite|Page)\s+\d+\s+(?:von|of)\s+(\d+))?\)/i);
    const gesamt = m ? +m[1] : /\((?:Keine Nachrichten|No Messages)\)/i.test(zeile) ? 0 : null;
    let seiten = m && m[2] ? +m[2] : 1;
    for (const l of alle(b, (e) => e.name === "a" && /[?&]page=mailbox(?:&|$)/.test(attr(e, "href")))) {
      const s = attr(l, "href").match(/[?&]mpage=(\d+)/);
      if (s && +s[1] > seiten && +s[1] < 10000) seiten = +s[1];
    }
    if (mails.length) return { art: "ok", mails, seiten, gesamt };
    // Leer nur mit Tabelle bzw. bekanntem Satz und null Mails laut Zeile; sonst unsicher (nie „leer“ für eine fremde Seite)
    const leer = (tabelle || /keine Nachrichten|no messages/i.test(text(b))) && !gesamt;
    return { art: leer ? "leer" : "unsicher", mails: [], seiten, gesamt };
  };
  const zahlen = (html) => {
    const titel = norm(text(erstes(baumVon(html), (e) => e.name === "title")));
    const m = titel.match(/\((\d+)\s+(?:ungelesen|unseen)\s*\/\s*(\d+)\s+(?:insgesamt|total)\)/i);
    return m && +m[1] <= +m[2] ? { ungelesen: +m[1], gesamt: +m[2] } : null;
  };

  // ---------- Eine Mail ----------
  // Text mit Zeilen: <br> und Blockelemente trennen Zeilen, mehr als eine Leerzeile wird eine
  const zeilenText = (el) => {
    const teile = [];
    const gehen = (k) => {
      if (!k.name || k.name === "#text") { teile.push(String(k.text || "").replace(/[ \t\r\n\f]+/g, " ")); return; }
      if (k.name === "script" || k.name === "style") return;
      if (k.name === "br") { teile.push("\n"); return; }
      const blk = BLOCK[k.name];
      if (blk) teile.push("\n");
      for (const x of k.kinder || []) gehen(x);
      if (blk) teile.push("\n");
    };
    gehen(el);
    return teile.join("").split("\n").map((z) => z.replace(/^ +| +$/g, "")).join("\n").replace(/\n{3,}/g, "\n\n").trim();
  };
  const nachricht = (html) => {
    const b = baumVon(html);
    const kopf = {};
    for (const em of alle(b, (e) => e.name === "em")) {
      const feld = KOPF[norm(text(em)).replace(/:$/, "").toLowerCase()];
      const zeile = em.eltern;
      if (!feld || kopf[feld] !== undefined || !zeile || zeile.name !== "div") continue;
      kopf[feld] = norm(zeile.kinder.filter((k) => k !== em).map((k) => (k.name && k.name !== "#text" ? text(k) : k.text)).join(" "));
    }
    const teile = alle(b, (e) => hatKlasse(e, "mimePartData"));
    if (kopf.betreff === undefined && kopf.von === undefined && !teile.length) return null;
    return { betreff: kopf.betreff || "", datum: kopf.datum || "", von: kopf.von || "", an: kopf.an || "", kopie: kopf.kopie || "",
      text: teile.map(zeilenText).filter(Boolean).join("\n\n") };
  };

  return { seite, anmeldeFormular, fehler, abmeldeAdresse, liste, zahlen, nachricht, datumKurz, listeAdresse, zahlenAdresse,
    nachrichtAdresse, HOST, BASIS, POSTEINGANG };
};

module.exports = function (ctx) {
  const H = ctx && ctx.user && ctx.user["ilias-html"];
  return erzeugen(H);
};
module.exports.erzeugen = erzeugen;
module.exports.datumKurz = datumKurz;
