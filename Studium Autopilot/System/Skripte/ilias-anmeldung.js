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
//
// Aufruf: await ctx.user["ilias-anmeldung"](ctx).anmelden(sitzung, { benutzer, kennwortGeber })
//         → { ok: true } oder { ok: false, grund: "zugang-falsch"|"zustimmung"|"zwei-faktor"|"netz"|"unerwartet", hinweis }
// Tests: tests/ilias-anmeldung.test.js (Attrappe der Sitzung, kein Netz). iOS-sicher (kein Lookbehind, keine Node-Module).
module.exports = function (ctx) {
  const HINWEISE = {
    "zugang-falsch": "Benutzername oder Passwort stimmt nicht. Bitte prüfen und neu eingeben.",
    "zustimmung": "Die Uni fragt einmalig, ob ILIAS deine Daten bekommen darf. Melde dich einmal im Browser bei ILIAS an und stimme zu, dann klappt es hier.",
    "zwei-faktor": "Dein Uni-Konto verlangt einen zweiten Faktor. Das kann Studium Autopilot noch nicht.",
    "netz": "ILIAS ist gerade nicht erreichbar. Versuch es später noch einmal.",
    "unerwartet": "Die Anmeldeseite sah anders aus als erwartet. Versuch es später noch einmal; bleibt es so, melde es bitte als Fehler.",
  };
  const SAML_RUNDEN = 3;

  const fehler = (grund) => ({ ok: false, grund, hinweis: HINWEISE[grund] });
  const host = (url) => { try { return new URL(url).host.toLowerCase(); } catch (e) { return ""; } };
  const httpsAuf = (url, basis) => { try { const u = new URL(url); return u.protocol === "https:" && u.host.toLowerCase() === host(basis); } catch (e) { return false; } };
  // Feld im HTML (name="…" oder name='…' oder name=…), ohne die Seite vollständig zu lesen
  const hatFeld = (html, name) => new RegExp(`name\\s*=\\s*["']?${name}["'\\s/>]`, "i").test(String(html || ""));
  const formMit = (formulare, name) => (formulare || []).filter((f) => (f.namen || []).indexOf(name) >= 0)[0] || null;

  const netzHolen = (optionen) => {
    if (optionen && optionen.netz) return optionen.netz;
    const n = ctx.user["ilias-netz"];
    return typeof n === "function" ? n(ctx) : n;
  };

  const istIlias = (r, N) => !!r && r.status === 200 && /il-maincontrols-metabar/.test(r.text || "") && !N.istLoginSeite(r.text || "");
  async function angemeldet(sitzung, N, uni) {
    return istIlias(await sitzung.anfrage({ url: `${uni.ilias}/ilias.php?baseClass=ilDashboardGUI&cmd=show` }), N);
  }

  async function anmelden(sitzung, zugang, optionen) {
    const N = netzHolen(optionen);
    const uni = (optionen && optionen.uni) || N.UNI;
    if (!zugang || !zugang.benutzer || typeof zugang.kennwortGeber !== "function") return fehler("zugang-falsch");
    try {
      // 1. Einstieg
      let r = await sitzung.anfrage({ url: `${uni.ilias}/shib_login.php` });
      if (r.status >= 500) return fehler("netz");

      // 2. Anmeldeformular des IdP
      if (hatFeld(r.text, "j_username")) {
        const f = formMit(N.formulare(r.text, r.url || `${uni.idp}/`), "j_username");
        if (!f || !httpsAuf(f.action, uni.idp)) return fehler("unerwartet");
        const felder = Object.assign({}, f.felder);
        delete felder.donotcache;
        delete felder._shib_idp_revokeConsent;
        felder.j_username = zugang.benutzer;
        felder._eventId_proceed = "";
        felder.j_password = zugang.kennwortGeber() || "";
        try {
          r = await sitzung.anfrage({ url: f.action, methode: "POST", formular: felder });
        } finally {
          felder.j_password = "";
        }
        if (r.status >= 500) return fehler("netz");
        if (!hatFeld(r.text, "SAMLResponse")) {
          if (/id\s*=\s*["']?attributeRelease/i.test(r.text || "")) return fehler("zustimmung");
          if (hatFeld(r.text, "j_password")) return fehler("zugang-falsch");
          if (/fudiscr-form|name\s*=\s*["']?(fudis_otp_input|j_tokenNumber|otp)\b/i.test(r.text || "")) return fehler("zwei-faktor");
          return fehler("unerwartet");
        }
      }

      // 3. SAML-Antwort an ILIAS (manche IdPs schicken mehrere Formulare nacheinander)
      for (let i = 0; i < SAML_RUNDEN && hatFeld(r.text, "SAMLResponse"); i++) {
        const f = formMit(N.formulare(r.text, r.url || `${uni.idp}/`), "SAMLResponse");
        if (!f || !httpsAuf(f.action, uni.ilias)) return fehler("unerwartet");
        const felder = { SAMLResponse: f.felder.SAMLResponse || "" };
        if (f.felder.RelayState != null) felder.RelayState = f.felder.RelayState;
        r = await sitzung.anfrage({ url: f.action, methode: "POST", formular: felder });
        if (r.status >= 500) return fehler("netz");
      }

      // 4. Prüfen (meist reicht die letzte Seite)
      return istIlias(r, N) || (await angemeldet(sitzung, N, uni)) ? { ok: true } : fehler("unerwartet");
    } catch (e) {
      if (e && e.grund === "fremder-host") return fehler("unerwartet");
      return fehler("netz");
    }
  }

  return { anmelden, HINWEISE };
};
