// ILIAS-Netz: Bausteine, um eigene Kursdateien aus ILIAS zu holen. Nur Technik: Sitzung mit Keksdose, Weiterleitungen,
// Formulare lesen, Login-Seite erkennen. Die Anmeldung (Shibboleth, Zugangsdaten) steht in ilias-anmeldung.js; diese Datei
// kennt keine Zugangsdaten und schickt selbst kein Formular ab.
//
// Warum eigene Technik: requestUrl folgt am PC Weiterleitungen selbst (Electron net.request) und hat keine Keksdose. Kekse
// aus Zwischenschritten (302) gehen verloren, die End-URL fehlt. Am PC (Platform.isDesktopApp) nutzt transportDesktop darum
// Node-https aus Electron: folgt nie selbst und liefert set-cookie roh; die Sitzung hier folgt und verwaltet die Kekse. Auf
// iPhone/iPad (transportMobil) folgt requestUrl nativ und behält Kekse selbst (Test 15.10.2026), die End-URL ist dort
// unbekannt (url: null).
//
// Ablauf einer Anfrage (sitzung().anfrage):
//   1. URL prüfen: nur https und nur die Server der Uni (ERLAUBTE_HOSTS). Sonst Fehler { grund: "fremder-host", host }, und
//      es geht nichts hinaus. Gilt für jeden Weiterleitungsschritt; beide Transporte prüfen zusätzlich selbst.
//   2. Kekse für diese URL aus der Keksdose (nur PC), einen Schritt über den Transport senden (der folgt nie selbst).
//   3. set-cookie in die Keksdose. 301/302/303 → GET ohne Body, 307/308 → gleiche Methode mit Body. Location byte-genau
//      auflösen (aufloesen: die signierte SAML-Query bleibt unverändert). Höchstens maxSpruenge Weiterleitungen; dieselbe
//      Anfrage (Methode, URL, Kekse, Body) ein zweites Mal → Fehler „schleife“.
// Fehler sind Error-Objekte mit grund: fremder-host, schleife, zu-viele-spruenge, zeitueberschreitung, netz (code),
//   kein-transport, kodierung. Fehler enthalten nie Bodies, Formularwerte oder Kekswerte; diese Datei protokolliert nichts.
//
// Aufruf: const N = ctx.user["ilias-netz"](ctx). Beim Laden passiert nichts (kein Netz, keine Zeitgeber).
//   N.UNI, N.UNIS, N.ERLAUBTE_HOSTS
//   N.sitzung({ transport?, uni? ("tuebingen"), jetzt? }) → { anfrage(o), keks (nur PC, sonst null), istHostErlaubt(url),
//     uni, hosts, mobil }
//     anfrage({ url, methode = "GET", formular?, body?, kopf?, folgen = true, binaer = false, maxSpruenge = 12 })
//       formular: Objekt oder [[name, wert], …] → application/x-www-form-urlencoded (bei GET als Query an die URL)
//       → { status, kopf (Namen klein, ohne set-cookie), typ (content-type), text | daten + arrayBuffer (binaer: dasselbe
//           ArrayBuffer), url (End-URL; mobil null), weg: [{ status, url }] (jede Antwort; mobil leer) }
//   N.keksDose({ jetzt? }) → { aufnehmen(setCookie | [setCookie], url), kopfFuer(url), namen() → { host: [Namen] }, leeren() }
//   N.formulare(html, basisUrl) → [{ action, methode, enctype, id, name, felder, namen, knoepfe }]
//   N.istLoginSeite(html), N.entitaeten(text), N.aufloesen(location, basisUrl), N.formularKodieren(felder)
//   N.transportDesktop({ version?, zeitlimit? }), N.transportMobil({ requestUrl? })
// Tests: tests/ilias-netz.test.js (Attrappen als Transport, kein Netz).
// iOS-sicher: Node-Module nur hinter Platform.isDesktopApp (oder unter reinem Node für Tests); kein Lookbehind, kein
// .at()/findLast/structuredClone.
module.exports = function (ctx) {
  ctx = ctx || {};

  // ---------- Universitäten (weitere später mit eigenem Schlüssel, gleicher Aufbau) ----------
  const UNIS = Object.freeze({
    tuebingen: Object.freeze({
      id: "tuebingen", name: "Universität Tübingen", ilias: "https://ovidius.uni-tuebingen.de", idp: "https://idp.uni-tuebingen.de",
      client: "pr02",
    }),
  });
  const UNI = UNIS.tuebingen;
  const MAX_SPRUENGE = 12;
  const ZEITLIMIT = 30000;      // ms ohne Daten auf der Leitung (auch beim Verbinden)
  const MAX_KEKSE = 300;        // je Keksdose; darüber fällt der älteste weg
  const WEITERLEITUNG = { 301: 1, 302: 1, 303: 1, 307: 1, 308: 1 };
  const ACCEPT_TEXT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
  const SPRACHE = "de-DE,de;q=0.9,en;q=0.8";
  const hat = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

  // ---------- Fehler (nie mit Body, Formularwerten oder Kekswerten) ----------
  const TEXTE = {
    "fremder-host": "Anfrage blockiert: Ziel ist kein erlaubter Server der Uni (nur https)",
    "schleife": "Weiterleitungen drehen sich im Kreis",
    "zu-viele-spruenge": "Zu viele Weiterleitungen",
    "zeitueberschreitung": "Der Server antwortet nicht (Zeitüberschreitung)",
    "netz": "Netzwerkfehler",
    "kein-transport": "Kein Netzzugang für ILIAS auf diesem Gerät",
    "kodierung": "Unbekannte Kodierung der Antwort",
  };
  function fehler(grund, mehr) {
    const e = new Error((TEXTE[grund] || grund) + (mehr && mehr.host ? " (" + mehr.host + ")" : "") + (mehr && mehr.code ? " [" + mehr.code + "]" : ""));
    e.grund = grund;
    if (mehr) for (const k of Object.keys(mehr)) e[k] = mehr[k];
    return e;
  }
  const netzFehler = (e, host) => (e && e.grund ? e : fehler("netz", { host, code: String((e && e.code) || "") }));

  // ---------- URLs: zerlegen ohne Umkodieren, Hosts prüfen, byte-genau auflösen ----------
  const URL_RX = /^([a-zA-Z][a-zA-Z0-9+.\-]*):\/\/([^\/?#]*)([^?#]*)(\?[^#]*)?(#[\s\S]*)?$/;
  const AUTORITAET_OK = /^[a-zA-Z0-9.\-]+(:[0-9]{1,5})?$/; // kein Benutzerteil, kein %, kein \ (Schutz vor Host-Tricks)
  function teile(url) {
    const m = URL_RX.exec(String(url == null ? "" : url));
    if (!m) return null;
    const a = /^([^:]*)(?::([0-9]*))?$/.exec(m[2]);
    return {
      schema: m[1].toLowerCase(), autoritaet: m[2], host: (a ? a[1] : m[2]).toLowerCase(), port: a && a[2] ? a[2] : "",
      pfad: m[3], query: m[4] || "", fragment: m[5] || "",
    };
  }
  const hostVon = (url) => { const t = teile(url); return t ? t.host : ""; };
  const hostsVon = (uni) => Object.freeze([hostVon(uni.ilias), hostVon(uni.idp)]);
  const ERLAUBTE_HOSTS = hostsVon(UNI);
  const ALLE_HOSTS = Object.freeze(Object.keys(UNIS).reduce((l, k) => l.concat(hostsVon(UNIS[k])), []));
  const uniVon = (u) => (u == null ? UNI : typeof u === "string" && hat(UNIS, u) ? UNIS[u] : u && u.id && UNIS[u.id] === u ? u : null);

  // Wirft { grund: "fremder-host" }, wenn die URL nicht https ist oder nicht auf einen der Hosts zeigt. Gegenprobe mit dem
  // URL-Parser der Plattform: Er muss denselben Host sehen (sonst Trick mit Sonderzeichen).
  function hostPruefen(url, hosts) {
    const t = teile(url);
    let ok = !!t && t.schema === "https" && AUTORITAET_OK.test(t.autoritaet) && hosts.indexOf(t.host) >= 0 && (t.port === "" || t.port === "443");
    if (ok) {
      try { const u = new URL(String(url)); ok = u.protocol === "https:" && u.hostname.toLowerCase() === t.host && !u.username && !u.password; } catch (e) { ok = false; }
    }
    if (!ok) throw fehler("fremder-host", { host: t ? t.host : "", protokoll: t ? t.schema : "" });
    return t;
  }
  const ohneFragment = (url) => { const s = String(url), i = s.indexOf("#"); return i < 0 ? s : s.slice(0, i); };
  // Pfad + Query für die Anfragezeile, unverändert; nur Leerraum, Steuer- und Nicht-ASCII-Zeichen werden escaped
  const anfragePfad = (t) => ((t.pfad || "/") + t.query).replace(/[\ud800-\udbff][\udc00-\udfff]|[\u0000- \u007f-￿]/g, (c) => {
    try { return encodeURIComponent(c); } catch (e) { return "%EF%BF%BD"; }
  });

  // RFC 3986 5.2.4, nur auf den Pfad angewendet (nie auf die Query)
  function punkteEntfernen(pfad) {
    if (pfad.indexOf(".") < 0) return pfad;
    const ein = pfad.split("/"), aus = [];
    for (let i = 0; i < ein.length; i++) {
      const s = ein[i], letztes = i === ein.length - 1;
      if (s === "." || s === "..") {
        if (s === ".." && aus.length > 1) aus.pop();
        if (letztes) aus.push("");
        continue;
      }
      aus.push(s);
    }
    return aus.join("/");
  }

  // Location (oder Formular-action) gegen die aktuelle URL auflösen. Query und Fragment des Verweises bleiben byte-genau
  // (signierte SAML-Parameter); eine absolute Location kommt unverändert zurück.
  function aufloesen(ort, basisUrl) {
    const loc = String(ort == null ? "" : ort).replace(/^[\u0000- ]+|[\u0000- ]+$/g, "");
    if (/^[a-zA-Z][a-zA-Z0-9+.\-]*:/.test(loc)) return loc;
    const b = teile(basisUrl);
    if (!b) throw new Error("aufloesen: Basis ist keine absolute URL");
    const wurzel = b.schema + "://" + b.autoritaet;
    if (loc.slice(0, 2) === "//") return b.schema + ":" + loc;
    if (loc === "") return wurzel + b.pfad + b.query;
    if (loc.charAt(0) === "#") return wurzel + b.pfad + b.query + loc;
    if (loc.charAt(0) === "?") return wurzel + (b.pfad || "/") + loc;
    const i = loc.search(/[?#]/);
    const pfad = i < 0 ? loc : loc.slice(0, i), rest = i < 0 ? "" : loc.slice(i);
    const voll = pfad.charAt(0) === "/" ? pfad : (b.pfad ? b.pfad.slice(0, b.pfad.lastIndexOf("/") + 1) : "/") + pfad;
    return wurzel + punkteEntfernen(voll) + rest;
  }

  // ---------- Formulardaten (wie Browser: application/x-www-form-urlencoded, Leerzeichen als +) ----------
  const kodiere = (s) => encodeURIComponent(String(s == null ? "" : s))
    .replace(/[!'()~]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase())
    .replace(/%20/g, "+");
  function formularKodieren(felder) {
    const paare = Array.isArray(felder) ? felder : Object.keys(felder || {}).map((k) => [k, felder[k]]);
    return paare.map((p) => kodiere(p[0]) + "=" + kodiere(p[1])).join("&");
  }

  // ---------- HTML-Entitäten (numerisch dezimal/hex, gängige benannte) ----------
  const BENANNT = {
    amp: "&", AMP: "&", lt: "<", LT: "<", gt: ">", GT: ">", quot: '"', QUOT: '"', apos: "'", nbsp: " ", shy: "­",
    copy: "©", reg: "®", trade: "™", middot: "·", times: "×", divide: "÷", sect: "§", para: "¶", deg: "°", bull: "•",
    ndash: "–", mdash: "—", hellip: "…", laquo: "«", raquo: "»", lsaquo: "‹", rsaquo: "›", lsquo: "‘", rsquo: "’",
    sbquo: "‚", ldquo: "“", rdquo: "”", bdquo: "„", euro: "€", auml: "ä", ouml: "ö", uuml: "ü", Auml: "Ä", Ouml: "Ö",
    Uuml: "Ü", szlig: "ß", aacute: "á", agrave: "à", acirc: "â", eacute: "é", egrave: "è", ecirc: "ê", iacute: "í",
    oacute: "ó", ograve: "ò", ocirc: "ô", uacute: "ú", ugrave: "ù", ccedil: "ç", ntilde: "ñ", Eacute: "É",
    colon: ":", sol: "/", plus: "+", equals: "=", quest: "?", num: "#", percnt: "%", lpar: "(", rpar: ")", comma: ",",
    period: ".", semi: ";", excl: "!", dollar: "$", ast: "*", lowbar: "_", grave: "`", Tab: "\t", NewLine: "\n",
  };
  // Zeichen 0x80–0x9F wie im HTML-Standard (Windows-1252)
  const C1 = "€\u0081‚ƒ„…†‡ˆ‰Š‹Œ\u008dŽ\u008f" +
    "\u0090‘’“”•–—˜™š›œ\u009džŸ";
  const zeichen = (n) => {
    if (!(n > 0) || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return "�";
    if (n >= 0x80 && n <= 0x9f) return C1.charAt(n - 0x80);
    return String.fromCodePoint(n);
  };
  // Ein Durchgang: „&amp;#x2b;“ wird „&#x2b;“, nicht „+“. Benannte nur mit „;“, unbekannte bleiben stehen.
  function entitaeten(text) {
    const s = String(text == null ? "" : text);
    if (s.indexOf("&") < 0) return s;
    return s.replace(/&(?:#[xX]([0-9a-fA-F]{1,8})|#([0-9]{1,9})|([A-Za-z][A-Za-z0-9]{0,31}));?/g, (ganz, hex, dez, name) => {
      if (name) return ganz.charAt(ganz.length - 1) === ";" && hat(BENANNT, name) ? BENANNT[name] : ganz;
      return zeichen(hex ? parseInt(hex, 16) : parseInt(dez, 10));
    });
  }

  // ---------- Tags lesen (ohne DOMParser, läuft auch unter Node) ----------
  // Ruft fn({ name, attrs, ende, pos }) für jedes Tag. Attribute: Namen klein, Werte entschlüsselt, erstes Vorkommen gilt;
  // Tags über mehrere Zeilen, Werte mit "…", '…' oder ohne Anführungszeichen. Kommentare, <!…>, <?…> und der Inhalt von
  // script/style/textarea/title/… werden übersprungen. fn gibt false zurück → Ende.
  const ROHTEXT = { script: 1, style: 1, textarea: 1, title: 1, xmp: 1, iframe: 1, noembed: 1, noframes: 1 };
  const LEER = /[\t\n\f\r ]/;
  function tagsLesen(html, fn) {
    const s = String(html == null ? "" : html), n = s.length;
    let i = 0;
    while (i < n) {
      const lt = s.indexOf("<", i);
      if (lt < 0) return;
      if (s.startsWith("<!--", lt)) { const e = s.indexOf("-->", lt + 4); i = e < 0 ? n : e + 3; continue; }
      const c = s.charAt(lt + 1);
      if (c === "!" || c === "?") { const e = s.indexOf(">", lt + 2); i = e < 0 ? n : e + 1; continue; }
      const ende = c === "/";
      const j = lt + (ende ? 2 : 1);
      if (!/[A-Za-z]/.test(s.charAt(j))) { i = lt + 1; continue; } // „<“ ohne Tag, z. B. „a < b“
      let p = j;
      while (p < n && !LEER.test(s.charAt(p)) && s.charAt(p) !== "/" && s.charAt(p) !== ">") p++;
      const name = s.slice(j, p).toLowerCase();
      const attrs = {};
      for (;;) {
        while (p < n && (LEER.test(s.charAt(p)) || s.charAt(p) === "/")) p++;
        if (p >= n || s.charAt(p) === ">") break;
        let q = p + 1; // erstes Zeichen darf auch „=“ sein (wie im HTML-Standard)
        while (q < n && !LEER.test(s.charAt(q)) && "/>=".indexOf(s.charAt(q)) < 0) q++;
        const an = s.slice(p, q).toLowerCase();
        p = q;
        while (p < n && LEER.test(s.charAt(p))) p++;
        let wert = "";
        if (s.charAt(p) === "=") {
          p++;
          while (p < n && LEER.test(s.charAt(p))) p++;
          const qz = s.charAt(p);
          if (qz === '"' || qz === "'") {
            const e = s.indexOf(qz, p + 1);
            wert = s.slice(p + 1, e < 0 ? n : e);
            p = e < 0 ? n : e + 1;
          } else {
            let e = p;
            while (e < n && !LEER.test(s.charAt(e)) && s.charAt(e) !== ">") e++;
            wert = s.slice(p, e);
            p = e;
          }
        }
        if (!ende && !hat(attrs, an)) attrs[an] = entitaeten(wert);
      }
      i = p < n ? p + 1 : n;
      if (fn({ name, attrs, ende, pos: lt }) === false) return;
      if (!ende && ROHTEXT[name]) {
        const rx = new RegExp("</" + name + "[\\t\\n\\f\\r />]", "ig");
        rx.lastIndex = i;
        const m = rx.exec(s);
        i = m ? m.index : n;
      }
    }
  }
  const hatKlasse = (wert, k) => String(wert || "").split(/[\t\n\f\r ]+/).indexOf(k) >= 0;

  // ---------- Formulare ----------
  // felder: was ein Browser ohne Klick senden würde: versteckte und Text-Felder, angehakte Kästchen/Optionsfelder (Wert
  // sonst "on"). Nie: Passwort-, Datei-, Knopf-Felder, deaktivierte Felder. namen: alle Namen (input, button, select,
  // textarea), auch die ohne Wert. knoepfe: Absendeknöpfe { name, wert, typ }.
  const OHNE_WERT = { password: 1, file: 1, submit: 1, image: 1, reset: 1, button: 1 };
  const STEUERELEMENTE = { input: 1, button: 1, select: 1, textarea: 1 };
  function formulare(html, basisUrl) {
    const dokument = String(basisUrl == null ? "" : basisUrl); // leere action = Adresse der Seite (nicht <base>)
    let basis = dokument, basisFest = false;
    const liste = [], elemente = [];
    let offen = null;
    tagsLesen(html, (t) => {
      const a = t.attrs;
      if (t.name === "base" && !t.ende && !basisFest && a.href != null) {
        basisFest = true;
        try { basis = aufloesen(a.href.replace(/[\t\n\r]/g, ""), basis); } catch (e) { /* Basis bleibt */ }
        return;
      }
      if (t.name === "form") {
        if (t.ende) { offen = null; return; }
        if (offen) return; // verschachteltes <form> übergeht der Browser
        offen = { a, felder: [] };
        liste.push(offen);
        return;
      }
      if (!t.ende && STEUERELEMENTE[t.name]) elemente.push({ tag: t.name, a, form: offen });
    });
    const nachId = {};
    for (const f of liste) if (f.a.id && !hat(nachId, f.a.id)) nachId[f.a.id] = f;
    for (const el of elemente) {
      const ziel = el.a.form != null ? (hat(nachId, el.a.form) ? nachId[el.a.form] : null) : el.form;
      if (ziel) ziel.felder.push(el);
    }
    return liste.map((f) => {
      const a = f.a;
      const roh = String(a.action == null ? "" : a.action).replace(/[\t\n\r]/g, "").trim();
      let action = dokument;
      if (roh) { try { action = aufloesen(roh, basis); } catch (e) { action = roh; } }
      let methode = String(a.method || "get").trim().toUpperCase();
      if (methode !== "POST" && methode !== "DIALOG") methode = "GET";
      const aus = { action, methode, enctype: String(a.enctype || "application/x-www-form-urlencoded").toLowerCase(), id: a.id || "", name: a.name || "", felder: {}, namen: [], knoepfe: [] };
      for (const el of f.felder) {
        const e = el.a, name = e.name;
        if (!name) continue;
        if (aus.namen.indexOf(name) < 0) aus.namen.push(name);
        const typ = String(e.type || (el.tag === "button" ? "submit" : "text")).trim().toLowerCase();
        if (el.tag === "button" || (el.tag === "input" && (typ === "submit" || typ === "image"))) {
          if (typ === "submit" || typ === "image") aus.knoepfe.push({ name, wert: e.value || "", typ });
          continue;
        }
        if (el.tag !== "input" || e.disabled != null || OHNE_WERT[typ]) continue;
        if (typ === "checkbox" || typ === "radio") {
          if (e.checked != null) aus.felder[name] = e.value != null ? e.value : "on";
          continue;
        }
        aus.felder[name] = e.value || "";
      }
      return aus;
    });
  }

  // ---------- Login-Seite von ILIAS erkennen ----------
  // Wahr bei: Link #shib_login_link (Anmeldeseite der Uni), Formular name=formlogin, Knopf #button_shib_login, oder ein
  // Link auf login.php in der Metaleiste (ul.il-maincontrols-metabar; so zeigt ILIAS „Anmelden“ für Gäste).
  function istLoginSeite(html) {
    let ja = false, tiefe = 0;
    tagsLesen(html, (t) => {
      const a = t.attrs;
      if (t.name === "ul") {
        if (t.ende) { if (tiefe > 0) tiefe--; } else if (tiefe > 0) tiefe++; else if (hatKlasse(a.class, "il-maincontrols-metabar")) tiefe = 1;
        return;
      }
      if (t.ende) return;
      if (a.id === "shib_login_link" || a.id === "button_shib_login" || (t.name === "form" && a.name === "formlogin")
        || (tiefe > 0 && a.href && /login\.php/i.test(a.href))) {
        ja = true;
        return false;
      }
    });
    return ja;
  }

  // ---------- Keksdose (RFC 6265: Host/Domain, Path, Secure, Expires/Max-Age, Präfixe __Host-/__Secure-) ----------
  const MONATE = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  // Datumsformat von Keksen nach RFC 6265 5.1.1 (nachsichtig wie Browser) → ms seit 1970 oder null
  function keksDatum(s) {
    let zeit = null, tag = null, monat = null, jahr = null, m;
    for (const t of String(s).split(/[\t -/;-@[-`{-~]+/)) {
      if (!t) continue;
      if (zeit === null && (m = /^([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2})(?:[^0-9]|$)/.exec(t))) { zeit = [+m[1], +m[2], +m[3]]; continue; }
      if (tag === null && (m = /^([0-9]{1,2})(?:[^0-9]|$)/.exec(t))) { tag = +m[1]; continue; }
      if (monat === null && (m = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.exec(t))) { monat = MONATE.indexOf(m[1].toLowerCase()); continue; }
      if (jahr === null && (m = /^([0-9]{2,4})(?:[^0-9]|$)/.exec(t))) { jahr = +m[1]; continue; }
    }
    if (jahr !== null && jahr >= 70 && jahr <= 99) jahr += 1900;
    else if (jahr !== null && jahr >= 0 && jahr <= 69) jahr += 2000;
    if (zeit === null || tag === null || monat === null || jahr === null) return null;
    if (tag < 1 || tag > 31 || jahr < 1601 || zeit[0] > 23 || zeit[1] > 59 || zeit[2] > 59) return null;
    const ms = Date.UTC(jahr, monat, tag, zeit[0], zeit[1], zeit[2]);
    return new Date(ms).getUTCDate() === tag ? ms : null;
  }
  const istIp = (h) => /^[0-9.]+$/.test(h) || h.indexOf(":") >= 0;
  const domainPasst = (host, d) => host === d || (!istIp(host) && host.length > d.length && host.slice(-(d.length + 1)) === "." + d);
  const pfadPasst = (a, k) => a === k || (a.indexOf(k) === 0 && (k.charAt(k.length - 1) === "/" || a.charAt(k.length) === "/"));
  const standardPfad = (p) => { if (!p || p.charAt(0) !== "/") return "/"; const i = p.lastIndexOf("/"); return i <= 0 ? "/" : p.slice(0, i); };

  // Werte verlassen die Dose nur über kopfFuer(url). namen() liefert nur Namen (zur Diagnose).
  function keksDose(opt) {
    const jetzt = opt && typeof opt.jetzt === "function" ? opt.jetzt : () => Date.now();
    let kekse = []; // { name, wert, domain, nurHost, pfad, sicher, ablauf (ms | null = bis Sitzungsende), nr }
    let zaehler = 0;
    const wegraeumen = (t) => { kekse = kekse.filter((k) => k.ablauf == null || k.ablauf > t); };

    function einer(zeile, u) {
      const t = jetzt();
      const i = zeile.indexOf(";");
      const paar = i < 0 ? zeile : zeile.slice(0, i), rest = i < 0 ? "" : zeile.slice(i + 1);
      const gl = paar.indexOf("=");
      if (gl < 0) return false;
      const name = paar.slice(0, gl).trim(), wert = paar.slice(gl + 1).trim();
      if (!name || name.length + wert.length > 4096 || /[\u0000-\u0008\u000a-\u001f\u007f]/.test(name + wert)) return false;
      let domain = null, pfad = null, sicher = false, expires = null, maxAge = null;
      for (const teil of rest.split(";")) {
        const g = teil.indexOf("=");
        const k = (g < 0 ? teil : teil.slice(0, g)).trim().toLowerCase(), v = g < 0 ? "" : teil.slice(g + 1).trim();
        if (k === "expires") { const d = keksDatum(v); if (d !== null) expires = d; }
        else if (k === "max-age") { if (/^-?[0-9]+$/.test(v)) { const sek = parseInt(v, 10); maxAge = sek <= 0 ? 0 : t + sek * 1000; } }
        else if (k === "domain") { const d = v.replace(/^\./, "").toLowerCase(); if (d) domain = d; }
        else if (k === "path") pfad = v.charAt(0) === "/" ? v : null;
        else if (k === "secure") sicher = true;
      }
      const ablauf = maxAge !== null ? maxAge : expires;
      const https = u.schema === "https";
      if (sicher && !https) return false;
      let nurHost = true;
      if (domain !== null) {
        if (!domainPasst(u.host, domain)) return false;
        if (domain.indexOf(".") < 0) { if (domain !== u.host) return false; } // Endung wie „de“: nur als Host
        else nurHost = false;
      }
      const d = domain !== null ? domain : u.host;
      const p = pfad || standardPfad(u.pfad);
      const klein = name.toLowerCase();
      if (klein.indexOf("__secure-") === 0 && !(sicher && https)) return false;
      if (klein.indexOf("__host-") === 0 && !(sicher && https && nurHost && pfad === "/")) return false;
      let alt = -1;
      for (let j = 0; j < kekse.length; j++) if (kekse[j].name === name && kekse[j].domain === d && kekse[j].pfad === p) { alt = j; break; }
      const nr = alt >= 0 ? kekse[alt].nr : zaehler++;
      if (alt >= 0) kekse.splice(alt, 1);
      if (ablauf !== null && ablauf <= t) return true; // Ablauf in der Vergangenheit = löschen
      kekse.push({ name, wert, domain: d, nurHost, pfad: p, sicher, ablauf, nr });
      if (kekse.length > MAX_KEKSE) {
        let min = 0;
        for (let j = 1; j < kekse.length; j++) if (kekse[j].nr < kekse[min].nr) min = j;
        kekse.splice(min, 1);
      }
      return true;
    }

    return {
      // set-cookie-Kopfzeilen einer Antwort von url übernehmen → Anzahl übernommener (auch gelöschter) Kekse
      aufnehmen(kopf, url) {
        const u = teile(url);
        if (!u || kopf == null) return 0;
        let n = 0;
        for (const z of Array.isArray(kopf) ? kopf : [kopf]) if (einer(String(z), u)) n++;
        return n;
      },
      // Cookie-Kopfzeile für eine Anfrage an url ("" wenn keine); längere Pfade zuerst, dann älteste zuerst
      kopfFuer(url) {
        const u = teile(url);
        if (!u) return "";
        wegraeumen(jetzt());
        const p = u.pfad || "/";
        return kekse
          .filter((k) => (k.nurHost ? u.host === k.domain : domainPasst(u.host, k.domain)) && pfadPasst(p, k.pfad) && (!k.sicher || u.schema === "https"))
          .sort((a, b) => b.pfad.length - a.pfad.length || a.nr - b.nr)
          .map((k) => k.name + "=" + k.wert)
          .join("; ");
      },
      // { "host": [Namen], ".domain": [Namen] } – nur Namen, nie Werte
      namen() {
        wegraeumen(jetzt());
        const aus = {};
        for (const k of kekse) {
          const h = (k.nurHost ? "" : ".") + k.domain;
          if (!aus[h]) aus[h] = [];
          if (aus[h].indexOf(k.name) < 0) aus[h].push(k.name);
        }
        return aus;
      },
      leeren() { kekse = []; },
    };
  }

  // ---------- Antworten ----------
  const kopfKlein = (h) => {
    const aus = {};
    if (!h) return aus;
    for (const k of Object.keys(h)) {
      const v = h[k], n = k.toLowerCase();
      if (v == null) continue;
      if (n === "set-cookie") aus[n] = (aus[n] || []).concat(Array.isArray(v) ? v : [v]).map(String);
      else aus[n] = Array.isArray(v) ? v.join(", ") : String(v);
    }
    return aus;
  };
  const alsArrayBuffer = (u8) => u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
  function textAus(u8, typ) {
    const m = /charset\s*=\s*"?([^";\s]+)/i.exec(String(typ || ""));
    try { return new TextDecoder(m ? m[1].toLowerCase() : "utf-8").decode(u8); } catch (e) { return new TextDecoder("utf-8").decode(u8); }
  }
  const pluginVersion = () => { const p = ctx.plugin; return (p && p.manifest && p.manifest.version) || ""; };
  const istDesktop = () => !!(ctx.obsidian && ctx.obsidian.Platform && ctx.obsidian.Platform.isDesktopApp);

  // ---------- Transport am PC: Node-https aus Electron (folgt nie selbst, set-cookie roh) ----------
  // Nur am PC (Platform.isDesktopApp) oder unter reinem Node (Tests am Entwickler-PC, dort gibt es kein window).
  function nodeNetz() {
    if (typeof window === "undefined") {
      return typeof require === "function" ? { https: require("https"), zlib: require("zlib") } : null;
    }
    if (!istDesktop() || typeof window.require !== "function") return null;
    return { https: window.require("https"), zlib: window.require("zlib") };
  }
  function transportDesktop(opt) {
    opt = opt || {};
    const nm = nodeNetz();
    if (!nm || !nm.https) throw fehler("kein-transport");
    const agent = "Studium-Autopilot/" + (opt.version || pluginVersion() || "0");
    const zeitlimit = opt.zeitlimit > 0 ? opt.zeitlimit : ZEITLIMIT;
    const senden = async function (a) {
      const u = hostPruefen(a.url, ALLE_HOSTS);
      const bytes = a.body == null ? null : new TextEncoder().encode(String(a.body));
      const kopf = {};
      for (const k of Object.keys(a.kopf || {})) kopf[k.toLowerCase()] = a.kopf[k];
      if (!kopf["user-agent"]) kopf["user-agent"] = agent;
      if (!kopf["accept-encoding"]) kopf["accept-encoding"] = "identity";
      if (bytes) kopf["content-length"] = String(bytes.length);
      else delete kopf["content-length"];
      return new Promise((fertig, abbruch) => {
        let erledigt = false;
        const scheitern = (e) => { if (!erledigt) { erledigt = true; abbruch(netzFehler(e, u.host)); } };
        let anf;
        try {
          anf = nm.https.request({ hostname: u.host, port: u.port ? Number(u.port) : 443, path: anfragePfad(u), method: a.methode || "GET", headers: kopf, timeout: zeitlimit }, (res) => {
            const stuecke = [];
            res.on("data", (c) => stuecke.push(c));
            res.on("error", scheitern);
            res.on("close", () => { if (!erledigt && !res.complete) scheitern(fehler("netz", { host: u.host, code: "ABGEBROCHEN" })); });
            res.on("end", () => {
              if (erledigt) return;
              try {
                let laenge = 0;
                for (const c of stuecke) laenge += c.length;
                let u8 = new Uint8Array(laenge), o = 0;
                for (const c of stuecke) { u8.set(c, o); o += c.length; }
                const k = kopfKlein(res.headers);
                const enc = String(k["content-encoding"] || "").trim().toLowerCase();
                if (enc && enc !== "identity" && u8.length) {
                  if (!nm.zlib) throw fehler("kodierung", { host: u.host });
                  let roh;
                  if (enc === "gzip" || enc === "x-gzip") roh = nm.zlib.gunzipSync(u8);
                  else if (enc === "deflate") { try { roh = nm.zlib.inflateSync(u8); } catch (e) { roh = nm.zlib.inflateRawSync(u8); } }
                  else if (enc === "br") roh = nm.zlib.brotliDecompressSync(u8);
                  else throw fehler("kodierung", { host: u.host, code: enc });
                  u8 = new Uint8Array(roh.buffer, roh.byteOffset, roh.byteLength);
                  delete k["content-encoding"];
                }
                const r = { status: res.statusCode, kopf: k };
                if (a.binaer) r.daten = alsArrayBuffer(u8); else r.text = textAus(u8, k["content-type"]);
                erledigt = true;
                fertig(r);
              } catch (e) { scheitern(e && e.grund ? e : fehler("kodierung", { host: u.host })); }
            });
          });
        } catch (e) { scheitern(e); return; }
        anf.on("timeout", () => anf.destroy(fehler("zeitueberschreitung", { host: u.host })));
        anf.on("error", scheitern);
        if (bytes) anf.write(bytes);
        anf.end();
      });
    };
    return senden;
  }

  // ---------- Transport auf iPhone/iPad: requestUrl (folgt und hält Kekse nativ, End-URL unbekannt) ----------
  function transportMobil(opt) {
    opt = opt || {};
    const requestUrl = opt.requestUrl || (ctx.obsidian && ctx.obsidian.requestUrl);
    if (typeof requestUrl !== "function") throw fehler("kein-transport");
    const agent = "Studium-Autopilot/" + (opt.version || pluginVersion() || "0");
    const senden = async function (a) {
      const u = hostPruefen(a.url, ALLE_HOSTS);
      const kopf = {};
      for (const k of Object.keys(a.kopf || {})) kopf[k.toLowerCase()] = a.kopf[k];
      const typ = kopf["content-type"];
      delete kopf["content-type"]; delete kopf.cookie; delete kopf["content-length"];
      if (!kopf["user-agent"]) kopf["user-agent"] = agent;
      const p = { url: ohneFragment(a.url), method: a.methode || "GET", headers: kopf, throw: false };
      if (typ) p.contentType = typ;
      if (a.body != null) p.body = String(a.body);
      let r;
      try { r = await requestUrl(p); } catch (e) { throw netzFehler(e, u.host); }
      const aus = { status: r.status, kopf: kopfKlein(r.headers), folgtSelbst: true };
      if (a.binaer) aus.daten = r.arrayBuffer;
      else { try { aus.text = r.text; } catch (e) { aus.text = ""; } }
      return aus;
    };
    senden.folgtSelbst = true;
    return senden;
  }

  // ---------- Sitzung ----------
  function sitzung(o) {
    o = o || {};
    const uni = uniVon(o.uni);
    if (!uni) throw new Error("sitzung: unbekannte Uni");
    const hosts = hostsVon(uni);
    const transport = o.transport || (istDesktop() ? transportDesktop() : transportMobil());
    const mobil = !!transport.folgtSelbst;
    const keks = mobil ? null : keksDose({ jetzt: o.jetzt });

    function ergebnis(antwort, url, weg, binaer) {
      const kopf = kopfKlein(antwort.kopf);
      delete kopf["set-cookie"];
      const r = { status: antwort.status, kopf, typ: kopf["content-type"] || "", url, weg };
      if (binaer) { r.daten = antwort.daten; r.arrayBuffer = antwort.daten; } else r.text = antwort.text == null ? "" : String(antwort.text);
      return r;
    }

    async function anfrage(a) {
      a = a || {};
      const binaer = !!a.binaer, folgen = a.folgen !== false;
      const maxRoh = a.maxSpruenge != null ? a.maxSpruenge : a["maxSprünge"];
      const max = typeof maxRoh === "number" && maxRoh >= 0 ? maxRoh : MAX_SPRUENGE;
      let methode = String(a.methode || "GET").toUpperCase();
      let url = String(a.url == null ? "" : a.url);
      let body = null;
      const extra = {};
      for (const k of Object.keys(a.kopf || {})) extra[k.toLowerCase()] = String(a.kopf[k]);
      delete extra.cookie; delete extra["content-length"];
      if (a.formular != null) {
        const kodiert = formularKodieren(a.formular);
        if (methode === "GET" || methode === "HEAD") { const i = url.search(/[?#]/); url = (i < 0 ? url : url.slice(0, i)) + "?" + kodiert; }
        else { body = kodiert; if (!extra["content-type"]) extra["content-type"] = "application/x-www-form-urlencoded"; }
      } else if (a.body != null) body = String(a.body);
      const weg = [], gesehen = new Set();
      for (let sprung = 0; ; sprung++) {
        hostPruefen(url, hosts); // vor jedem Senden, auch nach Weiterleitungen
        const kopf = Object.assign({ accept: binaer ? "*/*" : ACCEPT_TEXT, "accept-language": SPRACHE }, extra);
        if (body === null) delete kopf["content-type"];
        const kekse = keks ? keks.kopfFuer(url) : "";
        if (kekse) kopf.cookie = kekse;
        const schluessel = methode + " " + ohneFragment(url) + "\n" + kekse + "\n" + (body === null ? "" : body);
        if (gesehen.has(schluessel)) throw fehler("schleife", { host: hostVon(url) });
        gesehen.add(schluessel);
        const antwort = await transport({ url: ohneFragment(url), methode, kopf, body, binaer });
        if (mobil || antwort.folgtSelbst) return ergebnis(antwort, null, [], binaer);
        const hk = kopfKlein(antwort.kopf);
        if (keks && hk["set-cookie"]) keks.aufnehmen(hk["set-cookie"], url);
        weg.push({ status: antwort.status, url });
        const ort = hk.location;
        if (!folgen || !WEITERLEITUNG[antwort.status] || !ort) return ergebnis(antwort, url, weg, binaer);
        if (sprung >= max) throw fehler("zu-viele-spruenge", { host: hostVon(url) });
        if (antwort.status !== 307 && antwort.status !== 308) {
          if (methode !== "HEAD") methode = "GET";
          body = null;
          delete extra["content-type"];
        }
        url = aufloesen(ort, url);
      }
    }

    const istHostErlaubt = (url) => { try { hostPruefen(url, hosts); return true; } catch (e) { return false; } };
    return { anfrage, keks, istHostErlaubt, uni, hosts, mobil };
  }

  return {
    UNI, UNIS, ERLAUBTE_HOSTS, sitzung, keksDose, formulare, istLoginSeite, entitaeten, aufloesen, formularKodieren,
    transportDesktop, transportMobil,
  };
};
