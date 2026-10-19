// ILIAS-Anmeldung über Shibboleth (Universität Tübingen): meldet die Sitzung aus ilias-netz.js mit Benutzername und
// Passwort des Nutzers bei ILIAS an. Danach kann ilias.js Kurse lesen und Dateien laden.
//
// Ablauf (wie PFERD, MIT-Lizenz, https://github.com/Garmelon/PFERD, crawl/ilias/shibboleth_login.py):
//   1. GET <ilias>/shib_login.php → Weiterleitungen zum Anmeldeformular der Uni (IdP). Gilt die IdP-Sitzung noch, kommt
//      direkt das SAML-Formular oder schon ILIAS.
//   2. Anmeldeformular (Feld j_username) per POST an den IdP: versteckte Felder des Formulars + j_username, j_password,
//      _eventId_proceed. Die Kästchen „donotcache“ und „Zustimmung widerrufen“ bleiben leer wie im Browser.
//   3. Antwort mit SAMLResponse + RelayState per POST an ILIAS zurück (höchstens 3 Runden).
//   4. Prüfen: Die Seite, auf der die Weiterleitungen enden (Startseite von ILIAS), zeigt die Metaleiste ohne Anmelde-Link;
//      nur sonst wird das Dashboard eigens geholt (spart eine Anfrage je Anmeldung).
//
// Schutzgeländer:
//   - Das Passwort holt kennwortGeber() erst unmittelbar vor dem Absenden; es geht nur an das Formular des IdP-Hosts
//     (UNI.idp) und steht nie in Rückgaben, Hinweisen, Fehlern oder im Protokoll.
//   - Formulare werden nur an UNI.idp bzw. UNI.ilias geschickt (zusätzlich zur Host-Liste der Sitzung in ilias-netz.js).
//   - Zustimmungsseite der Uni (Weitergabe von Daten an ILIAS) und Zwei-Faktor: abbrechen mit Hinweis, nie selbst zustimmen.
//     Auch gleich beim Einstieg, wenn die IdP-Sitzung noch gilt und die Uni vor dem SAML-Formular nachfragt.
//
// Code für den Fehlerbericht: Jedes Scheitern trägt code = „Stelle · Gerät Version · Spur“, damit sich aus einer Meldung
//   ablesen lässt, wo die Anmeldung hängen blieb. Die Spur nennt je Antwort Schritt (start, passwort, saml, dashboard), Status
//   und Seitenart (seitenArt aus ilias-html.js); bei Seiten außerhalb des normalen Ablaufs dazu Titel und Feldnamen, am PC
//   Server und Pfad (ohne Query). Nie Inhalte, Feldwerte, Kekse oder das Passwort; der Benutzername wird unkenntlich (•••).
//   Bei „unerwartet“ und „netz“ steht der Code im Hinweis (man schickt ihn mit); die übrigen Gründe sagen selbst, was zu tun ist.
//   Stellen: idp-ziel (Anmeldeformular zeigt auf einen fremden Server), nach-passwort (unbekannte Seite nach dem Absenden),
//   saml-ziel (SAML-Formular zeigt nicht auf ILIAS), nicht-angemeldet (am Ende keine ILIAS-Seite), blockiert-<host> bei <schritt>
//   (Weiterleitung auf einen fremden Server, nur am PC erkennbar), netz-<grund> bei <schritt> bzw. netz-http-<status>,
//   zustimmung, zwei-faktor, zugang-falsch, ohne-zugang.
//   Beispiel: „nach-passwort · iPad 0.4.7 · start 200 idp-anmeldung › passwort 200 unbekannt „Titel“ [feld1,feld2]“
//
// Aufruf: await ctx.user["ilias-anmeldung"](ctx).anmelden(sitzung, { benutzer, kennwortGeber }, { netz?, html?, uni? })
//         → { ok: true } oder { ok: false, grund: "zugang-falsch"|"zustimmung"|"zwei-faktor"|"netz"|"unerwartet", hinweis, code }
// Tests: tests/ilias-anmeldung.test.js (Attrappe der Sitzung, kein Netz). iOS-sicher (kein Lookbehind, keine Node-Module).
module.exports = function (ctx) {
  ctx = ctx || {};
  const HINWEISE = {
    "zugang-falsch": "Benutzername oder Passwort stimmt nicht. Bitte prüfen und neu eingeben.",
    "zustimmung": "Die Uni fragt einmalig, ob ILIAS deine Daten bekommen darf. Melde dich einmal im Browser bei ILIAS an und stimme zu, dann klappt es hier.",
    "zwei-faktor": "Dein Uni-Konto verlangt einen zweiten Faktor. Das kann Studium Autopilot noch nicht.",
    "netz": "ILIAS ist gerade nicht erreichbar. Versuch es später noch einmal.",
    "unerwartet": "Die Anmeldeseite sah anders aus als erwartet. Versuch es später noch einmal; bleibt es so, melde es bitte als Fehler und schick den Code mit.",
  };
  const MIT_CODE = ["unerwartet", "netz"];
  const SAML_RUNDEN = 3;
  const CODE_MAX = 450;
  // Seiten des normalen Ablaufs: in der Spur ohne Titel und Feldnamen
  const GEWOHNT = ["idp-anmeldung", "saml-weiterleitung", "ilias", "startseite"];

  const host = (url) => { try { return new URL(url).host.toLowerCase(); } catch (e) { return ""; } };
  const httpsAuf = (url, basis) => { try { const u = new URL(url); return u.protocol === "https:" && u.host.toLowerCase() === host(basis); } catch (e) { return false; } };
  // Feld im HTML (name="…" oder name='…' oder name=…), ohne die Seite vollständig zu lesen
  const hatFeld = (html, name) => new RegExp(`name\\s*=\\s*["']?${name}["'\\s/>]`, "i").test(String(html || ""));
  const formMit = (formulare, name) => (formulare || []).filter((f) => (f.namen || []).indexOf(name) >= 0)[0] || null;
  const istZustimmung = (html) => /id\s*=\s*["']?attributeRelease/i.test(String(html || ""));
  const istZweiFaktor = (html) => /fudiscr-form|name\s*=\s*["']?(fudis_otp_input|j_tokenNumber|otp)\b/i.test(String(html || ""));

  const netzHolen = (optionen) => {
    if (optionen && optionen.netz) return optionen.netz;
    const n = ctx.user["ilias-netz"];
    return typeof n === "function" ? n(ctx) : n;
  };
  const htmlHolen = (optionen) => (optionen && optionen.html) || (ctx.user && ctx.user["ilias-html"]) || null;

  const istIlias = (r, N) => !!r && r.status === 200 && /il-maincontrols-metabar/.test(r.text || "") && !N.istLoginSeite(r.text || "");

  // ---------- Spur für den Code (siehe oben): nie Inhalte, Werte, Query oder Kekse ----------
  const geraet = (mobil) => {
    const P = ctx.obsidian && ctx.obsidian.Platform;
    if (P && P.isIosApp) return P.isTablet ? "iPad" : "iPhone";
    if (P && P.isAndroidApp) return "Android";
    if (P && P.isMacOS) return "Mac";
    return mobil ? "mobil" : "PC";
  };
  const version = () => (ctx.plugin && ctx.plugin.manifest && ctx.plugin.manifest.version) || "?";
  function spur(N, H, benutzer, mobil) {
    const teile = [];
    const name = String(benutzer || "").trim();
    const nameRx = name ? new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi") : null;
    const kurz = (s, n) => {
      let t = String(s == null ? "" : s).replace(/\s+/g, " ").trim();
      if (nameRx) t = t.replace(nameRx, "•••");
      return t.length > n ? t.slice(0, n - 1) + "…" : t;
    };
    const ort = (url) => { try { const u = new URL(url); return u.host.split(".")[0] + u.pathname; } catch (e) { return ""; } };
    const art = (r) => { try { return H && typeof H.seitenArt === "function" ? H.seitenArt(r.text, r.url || "") : "?"; } catch (e) { return "?"; } };
    const merkmale = (r) => {
      const titel = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(r.text);
      const namen = [];
      for (const f of N.formulare(r.text, r.url || `${N.UNI.ilias}/`)) {
        for (const n of f.namen) if (/^[\w.:\-[\]]{1,32}$/.test(n) && namen.indexOf(n) < 0) namen.push(n);
      }
      return (titel ? ` „${kurz(N.entitaeten(titel[1]), 40)}“` : "") + (namen.length ? ` [${kurz(namen.slice(0, 8).join(","), 120)}]` : "");
    };
    return {
      merken(schritt, r) {
        if (!r) return;
        const voll = typeof r.text === "string" && r.text.trim() !== "";
        const a = voll ? art(r) : "leer";
        teile.push(`${schritt} ${r.status}${r.url ? " " + kurz(ort(r.url), 48) : ""} ${a}${voll && GEWOHNT.indexOf(a) < 0 ? merkmale(r) : ""}`);
      },
      code: (stelle) => kurz(`${stelle} · ${geraet(mobil)} ${version()} · ${teile.join(" › ") || "keine Antwort"}`, CODE_MAX),
    };
  }

  async function anmelden(sitzung, zugang, optionen) {
    const N = netzHolen(optionen);
    const uni = (optionen && optionen.uni) || N.UNI;
    const S = spur(N, htmlHolen(optionen), zugang && zugang.benutzer, !!(sitzung && sitzung.mobil));
    const fehler = (grund, stelle) => {
      const code = S.code(stelle || grund);
      return { ok: false, grund, hinweis: HINWEISE[grund] + (MIT_CODE.indexOf(grund) >= 0 ? " Code: " + code : ""), code };
    };
    if (!zugang || !zugang.benutzer || typeof zugang.kennwortGeber !== "function") return fehler("zugang-falsch", "ohne-zugang");
    let schritt = "start";
    const holen = async (name, anfrage) => {
      schritt = name;
      const r = await sitzung.anfrage(anfrage);
      S.merken(name, r);
      return r;
    };
    const serverFehler = (r) => fehler("netz", "netz-http-" + r.status);
    try {
      // 1. Einstieg
      let r = await holen("start", { url: `${uni.ilias}/shib_login.php` });
      if (r.status >= 500) return serverFehler(r);

      // 2. Anmeldeformular des IdP
      if (hatFeld(r.text, "j_username")) {
        const f = formMit(N.formulare(r.text, r.url || `${uni.idp}/`), "j_username");
        if (!f || !httpsAuf(f.action, uni.idp)) return fehler("unerwartet", "idp-ziel");
        const felder = Object.assign({}, f.felder);
        delete felder.donotcache;
        delete felder._shib_idp_revokeConsent;
        felder.j_username = zugang.benutzer;
        felder._eventId_proceed = "";
        felder.j_password = zugang.kennwortGeber() || "";
        try {
          r = await holen("passwort", { url: f.action, methode: "POST", formular: felder });
        } finally {
          felder.j_password = "";
        }
        if (r.status >= 500) return serverFehler(r);
        if (!hatFeld(r.text, "SAMLResponse")) {
          if (istZustimmung(r.text)) return fehler("zustimmung");
          if (hatFeld(r.text, "j_password")) return fehler("zugang-falsch");
          if (istZweiFaktor(r.text)) return fehler("zwei-faktor");
          return fehler("unerwartet", "nach-passwort");
        }
      } else if (!hatFeld(r.text, "SAMLResponse") && !istIlias(r, N)) {
        // IdP-Sitzung gilt noch, aber die Uni fragt vor dem SAML-Formular nach
        if (istZustimmung(r.text)) return fehler("zustimmung");
        if (istZweiFaktor(r.text)) return fehler("zwei-faktor");
      }

      // 3. SAML-Antwort an ILIAS (manche IdPs schicken mehrere Formulare nacheinander)
      for (let i = 0; i < SAML_RUNDEN && hatFeld(r.text, "SAMLResponse"); i++) {
        const f = formMit(N.formulare(r.text, r.url || `${uni.idp}/`), "SAMLResponse");
        if (!f || !httpsAuf(f.action, uni.ilias)) return fehler("unerwartet", "saml-ziel");
        const felder = { SAMLResponse: f.felder.SAMLResponse || "" };
        if (f.felder.RelayState != null) felder.RelayState = f.felder.RelayState;
        r = await holen(i ? "saml" + (i + 1) : "saml", { url: f.action, methode: "POST", formular: felder });
        if (r.status >= 500) return serverFehler(r);
      }

      // 4. Prüfen (meist reicht die letzte Seite)
      if (istIlias(r, N)) return { ok: true };
      const d = await holen("dashboard", { url: `${uni.ilias}/ilias.php?baseClass=ilDashboardGUI&cmd=show` });
      return istIlias(d, N) ? { ok: true } : fehler("unerwartet", "nicht-angemeldet");
    } catch (e) {
      if (e && e.grund === "fremder-host") return fehler("unerwartet", `blockiert-${e.host || "?"} bei ${schritt}`);
      return fehler("netz", `netz-${(e && e.grund) || "fehler"}${e && e.code ? "-" + e.code : ""} bei ${schritt}`);
    }
  }

  return { anmelden, HINWEISE };
};
