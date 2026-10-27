// Verbindungen und Schloss-System (Phase 2b).
// Alles, was eine Verbindung braucht, zeigt ein Schloss. Ein Klick erklärt, was fehlt, und verbindet direkt.
// Symbole (seit 15.10.2026): ruhige Lucide-Linien als inline-SVG in currentColor (SYMBOLE), keine Emojis; setIcon blieb auf
// dem iPad leer (docs/architektur/verbindungen.md). Farbe über die Klasse am Rahmen (eba-core.css 43).
// Links (z. B. der Alma-Kalenderlink) und der ILIAS-Benutzername liegen NUR gerätelokal (app.saveLocalStorage), nie in einer
// Datei des Vaults. Passwörter: nur dein Uni-Passwort (seit 0.4.0), und nur im Schlüsselbund von Obsidian auf diesem Gerät
// (ilias.js, app.secretStorage: verschlüsselt, nie synchronisiert). Dieses Skript reicht es nur als Funktion an
// ctx.ilias.zugangSpeichern weiter und leert danach das Feld. Noten & Anmeldungen (alma-konto.js, seit 0.4.5, Beta) nutzt
// denselben Eintrag für Alma, erst nach „Einschalten“ in seinem Fenster. Kein Mail-Passwort (kein IMAP), nichts davon im Vault.
//
// Registry VERBINDUNGEN: { id, name, satz, kurz?, erklaerung, schritte, art ("link" | "anmeldung" | "konto" | "zentral" | "claude" | "server" | "vorlage"), status(), gesperrt(),
//   sichtbar()? (fehlt = immer; „Noten & Anmeldungen“ unter ihren Bedingungen, „Eigener Server“, wenn server.js geladen ist,
//   „Claude“ mit claude.js nur, wenn dieses Gerät verbunden ist; sonst über einen leisen Link im Fenster „Eigener Server“),
//   vorschau? ("woche": Schloss liegt auf einem ausgegrauten Beispiel-Stundenplan), anreiz? (Überschrift dazu), schlossKnopf? (Text
//   des Knopfs der Schloss-Karte), trennenText? (Rückfrage beim Trennen), pruefen(link)?, verbinden(link)?, trennen()?, aktualisieren(parameter)? }
//   symbol? und beschreibung? (nur Zeilen der Übersicht: Symbol der Sache aus SYMBOLE, was sie tut in wenigen Wörtern)
// Texte (auch für Nicht-Techniker): satz = ein Satz Nutzen (Schloss-Karte); kurz = höchstens ein Satz im Fenster;
//   schritte = kurze Schritte, Verb vorn, **fett** = Bedienelement genau wie in Alma/Obsidian; erklaerung = Hintergrund,
//   nur eingeklappt unter „Mehr erfahren“ (höchstens drei kurze Sätze).
// Codeblöcke:
//   ```eba-schloss <id>```  Solange gesperrt: Karte mit Schloss-Symbol, einem Satz und Knopf „Verbinden“ (mit vorschau: über dem Beispielraster). Steht der Block in einer Karte
//                           (Callout), blendet CSS den übrigen Inhalt der Karte aus (z. B. das Wochenraster). Sonst leer.
//   ```eba-verbindungen```  Übersicht (Einstellungen): seit 24.10.2026 je Verbindung eine kompakte Zeile wie in den Einstellungen
//                           von iPhone und iPad (kompakt): Symbol der Sache in der Farbe des Stands, Name, rechts ein kurzer
//                           Stand in einem Wort („Verbunden“, „An“, „Aus“, „Aktuell“, „Fehler“) und der Pfeil; darunter in
//                           wenigen Wörtern, was sie tut (beschreibung), bei einem Problem stattdessen das Problem. Die ganze
//                           Zeile öffnet das Fenster;
//                           der Knopf der Zeile (Verbinden, Aktualisieren, Hier aktualisieren, Einschalten, Neu laden, Neue Version
//                           installieren) steht dort unten (zeilenKnopf). Zeile „Updates“ (art vorlage): Version und
//                           Update, Text und Knopf aus ctx.update.anzeige() (update.js). Bis dahin stand der Satz in der Zeile und
//                           der Knopf rechts daneben, dazu der Textlink „Mehr erfahren“ (link). Inhalt der Zeilen weiter so:
//                           Zeilen (zeile(), seit 18.10.2026): Symbol und Pille widersprechen sich nie. Pille nur, wo der Stand zählt:
//                           „verbunden“, „nicht verbunden“ (nichts da, Verbinden ist der Weg) oder „Anmeldung prüfen“. Kommt etwas
//                           ohnehin (Daten per Sync, zentraler Stundenplan, eigener Uni-Abgleich): Haken ohne Pille, Verbinden leise.
//                           Eigener Uni-Abgleich (eba.quelleExtern, dieselbe Regel wie ilias.js und zentral.js): Stundenplan
//                           extern → Alma sagt ALMA_EXTERN ohne Knopf (ist doch ein Link gespeichert, holt alma.js trotzdem
//                           nichts; die Zeile sagt das und bietet Trennen als Textlink); ILIAS-Dateien extern → ILIAS heißt „ILIAS“, prüft nur die
//                           Übungsgruppen (Aktualisieren, Textlink Trennen) bzw. bietet leise „Für Übungsgruppen verbinden“
//                           (öffnet gleich die Anmeldung); kommen auch die Übungsgruppen von außen, nur der Satz (mit
//                           gespeichertem Zugang Textlink Trennen).
//                           „Uni-Login“ (art uni, seit 0.4.8): EINE Zeile statt ILIAS, ILIAS-Kalender, Alma-Stundenplan und Noten &
//                           Anmeldungen (uniZeile); deren Zeilen (Regeln hier unten) stehen im Fenster dahinter (UniFenster).
//                           „Noten & Anmeldungen (Alma)“ (art konto, seit 0.4.5): Zeile und Fenster aus alma-konto.js
//                           (ctx.almaKonto.zeile(), fensterOeffnen()); nur sichtbar mit Beta, Zustimmung oder Daten (sichtbar()).
//                           „Volltext der PDFs“ (art volltext, seit 0.4.5): Zahlen aus ctx.volltext.status(), Fenster mit Schalter.
//                           „ILIAS-Kalender“ (art link wie Alma, seit 18.10.2026): Stand und Zahl der kommenden Abgaben aus
//                           ctx.iliasKalender.status(); die Link-Fenster nehmen ihre Texte aus der Registry (laedt, danach, neuerLink).
//                           Stand einer Quelle (Quellen-Vertrag, quellen.js): EINE Formatierung für alle Zeilen (standText):
//                           „Aktualisiert vor 5 Min.“, Fehler „<Satz> Zuletzt aktualisiert …“ mit Warnsymbol, Warnungen
//                           angehängt, ein anderes Gerät aktualisiert → „Hier aktualisieren“. Wörter in WORT (Entscheidung E1:
//                           Daten holt man mit „Aktualisieren“).
//                           Über ein anderes Gerät verbunden (seit 0.4.7, ortVon, Q.verbindung): Link und Passwort liegen nur
//                           auf einem Gerät. Hält ein anderes die Sperre der Quelle (sperre.js) und war es vor höchstens 7 Tagen
//                           aktiv, steht „Verbunden über ein anderes Gerät · aktualisiert vor …“ mit Pille „verbunden“, rechts nur
//                           „Mehr erfahren“; das Fenster bietet leise „Auch hier verbinden“ (Aktion verbinden mit auch=1). Länger
//                           still oder getrennt: wie nie verbunden.
//   ```eba-alma-knoepfe```  früher der Knopf auf der Seite Stundenplan (0.3.0 bis 0.6.5); seit 24.10.2026 leer (Alma holt
//                           stündlich, von Hand unter Verbindungen; den Satz zum Studienbeginn sagt das Wochenraster). Der Block
//                           zeichnet nichts, damit ältere, selbst geänderte Seiten keinen Codeblock zeigen.
//   ```eba-ilias-knopf```   Steht in der Knopf-Karte der Seite Unterlagen (seit 0.4.0) und zeichnet nichts. Ist ILIAS auf diesem
//                           Gerät verbunden, trägt er die Klasse eba-ilias-an; dann zeigt CSS (eba-core.css 49) den festen Knopf
//                           „Unterlagen aktualisieren“ derselben Karte, sonst ist er ausgeblendet. So bleiben alle Knöpfe normales Markdown.
// Schloss (seit 0.3.0): nur, wenn der Schritt in der Einrichtung übersprungen wurde oder die Einrichtung nicht fertig ist
//   (ctx.einrichtung.almaOffen() bzw. iliasOffen(); ILIAS auch, wenn die Einrichtung aus 0.3.x ohne ILIAS-Schritt stammt), keine
//   Daten da sind (Stundenplan bzw. Unterlagen aus ILIAS, z. B. per Sync) und weder dieses noch ein anderes Gerät verbunden ist. Im eigenen
//   Uni-Abgleich nie ein Schloss, weder für Alma noch für ILIAS.
// Fenster: kein Knopf, der nur schließt (dafür ist das ×), höchstens ein Hauptknopf (mod-cta) je Fenster.
// Aktionen (Knöpfe obsidian://studium-autopilot?aktion=…&id=alma): verbinden, verbindung-aktualisieren (ILIAS: uebernehmen=1
//   lädt hier, auch wenn ein anderes Gerät gerade lädt), trennen, ilias-holen (Knopf „Unterlagen aktualisieren“ auf der Seite Unterlagen).
// Hilfsfunktion für andere Skripte: ctx.verbindungen.schlossKarte(el, id) zeichnet die Schloss-Karte, gesperrt(id).
// Erweiterung: Das Plugin ruft registrieren() auf (Codeblöcke über ctx.codeblock) und übernimmt die aktionen.
// Stil: eba-core.css Abschnitt 43 (Klassen eba-schloss*, eba-vb-*, eba-modal*), Abschnitt 49 (ILIAS: Fenster, Knopf auf Unterlagen).
module.exports = function (ctx) {
  const app = window.app;
  const { Modal, Platform } = ctx.obsidian;
  const moment = window.moment;

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const tagText = (iso) => (iso ? moment(iso).format("DD.MM.YYYY") : "");
  const alma = () => ctx.user.alma(Object.create(ctx));
  // Schloss nur für Schritte, die in der Einrichtung übersprungen wurden (einrichtung.js); ohne einrichtung.js wie früher
  const almaOffen = () => (ctx.einrichtung && ctx.einrichtung.almaOffen ? ctx.einrichtung.almaOffen() : true);
  // Eigene Stundenplan-Notizen (Alma oder von Hand); zentrale (herkunft: zentral) und Notizen zu deiner Gruppe (ilias-gruppe,
  // gruppe-gewaehlt) zählen nicht als „Alma-Daten“
  const stundenplanAnzahl = () => app.vault.getMarkdownFiles().filter((f) => {
    if (!f.path.startsWith("Stundenplan/")) return false;
    const c = app.metadataCache.getFileCache(f);
    return !!(c && c.frontmatter && c.frontmatter.typ === "lehrveranstaltung" && ["zentral", "ilias-gruppe", "gruppe-gewaehlt"].indexOf(String(c.frontmatter.herkunft || "")) < 0);
  }).length;
  // Zentraler Stundenplan (zentral.js): { verfuegbar, anzahl, ohneBeginn, ausgeblendet }. Mit zentralen Vorlesungen ist Alma
  // freiwillig: kein Schloss mehr, andere Texte.
  const zentralerPlan = () => {
    try { if (ctx.zentral && ctx.zentral.stundenplan) return ctx.zentral.stundenplan(); } catch (e) { /* noch nicht geladen */ }
    return { verfuegbar: false, anzahl: 0, ohneBeginn: false, ausgeblendet: [] };
  };
  const ALMA_FREIWILLIG = "Deine Vorlesungen kommen von selbst, deine Übungsgruppe meist aus ILIAS, sobald du es verbindest. Alma brauchst du nur für Extras.";
  // Quellen außerhalb des Plugins (eba.quelleExtern, dieselbe Regel wie in ilias.js und zentral.js; ohne Liste in den
  // Einstellungen beim eigenen Uni-Abgleich): „stundenplan“ → Alma verbindet man nicht (alma.js schriebe dieselben
  // Veranstaltungen ein zweites Mal); „ilias-dateien“ → ILIAS nur für die Übungsgruppen.
  const EINSTELLUNGEN = "System/Einstellungen.md";
  const einstellungen = () => { const f = app.vault.getAbstractFileByPath(EINSTELLUNGEN), c = f && app.metadataCache.getFileCache(f); return (c && c.frontmatter) || {}; };
  const quelleExtern = (schluessel) => {
    const eba = ctx.user && ctx.user.eba, Q = ctx.user && ctx.user.quellen, existiert = (p) => !!app.vault.getAbstractFileByPath(p);
    if (Q && Q.extern) return Q.extern(eba, schluessel, existiert, einstellungen()); // auch mit eba.js einer älteren Fassung
    return !!(eba && eba.quelleExtern && eba.quelleExtern(schluessel, existiert, einstellungen()));
  };
  const stundenplanExtern = () => quelleExtern("stundenplan");
  const dateienExtern = () => quelleExtern("ilias-dateien");
  const kalenderExtern = () => quelleExtern("ilias-kalender");
  const ALMA_EXTERN = "Dein Stundenplan kommt über deinen Uni-Abgleich.";
  // ILIAS (ilias.js, seit 0.4.0): Schloss wie bei Alma nur für Übersprungenes (einrichtung.js); Daten = Begleitnotizen mit ilias_id
  const iliasOffen = () => (ctx.einrichtung && ctx.einrichtung.iliasOffen ? ctx.einrichtung.iliasOffen() : true);
  const iliasAnzahl = () => app.vault.getMarkdownFiles().filter((f) => {
    if (!f.path.startsWith("Unterlagen/")) return false;
    const c = app.metadataCache.getFileCache(f);
    return !!(c && c.frontmatter && c.frontmatter.ilias_id);
  }).length;
  // Anmeldebaustein fehlt (ilias-anmeldung.js nicht geladen): nichts anbieten, was nicht geht
  const iliasOhneAnmeldung = (s) => !ctx.ilias || s.text === ctx.ilias.K.TEXT_ANMELDUNG_FOLGT;
  const mobil = !!(Platform && Platform.isMobile);
  // Uni-Login (uni-login.js, Bibliothek, seit 0.4.8): holt die Links von ILIAS-Kalender und Alma selbst
  const uni = () => { const f = ctx.user && ctx.user["uni-login"]; try { return typeof f === "function" ? f(ctx) : null; } catch (e) { return null; } };
  const uniBenutzer = () => { try { return ctx.ilias ? ctx.ilias.uniZugang().benutzer || "" : ""; } catch (e) { return ""; } };
  // Lässt sich der Uni-Login hier eingeben? (Schlüsselbund da, Anmeldebaustein da, Unterlagen nicht von außen)
  const uniAnmeldungHier = () => { const s = VERBINDUNGEN.ilias.status(); return !!(ctx.ilias && ctx.ilias.kannSpeichern() && !iliasOhneAnmeldung(s) && !s.extern); };
  // Nach einer Anmeldung im Fenster (Zustimmung: das Fenster nannte vorher Unterlagen, Kalender und Stundenplan; uni-login.js
  // zustimmen): ILIAS-Kalender und Alma gleich mit verbinden (alleVerbinden). anzeigen(stand) bei jedem Schritt, stand =
  // { <id>: "laeuft" | Ergebnis }. → Promise<Hinweis zum Ergebnis> (leer: nichts zu tun)
  const uniWeiter = (anzeigen) => {
    const U = uni();
    if (!U) return Promise.resolve("");
    U.zustimmen(VERBINDUNGEN.ilias.uniQuellen);
    const stand = {};
    const zeigen = () => { try { anzeigen(stand); } catch (e) { /* nur Anzeige */ } };
    return U.alleVerbinden({ schritt: (id) => { stand[id] = "laeuft"; zeigen(); } }).then((r) => {
      for (const id of U.QUELLEN) if (r[id]) stand[id] = r[id];
      zeigen();
      neuZeichnen();
      return U.hinweis(r);
    }, () => "");
  };
  // Stand von uniWeiter als Zeilen im Fenster (ILIAS, Einrichtung): läuft, ✓ verbunden oder der Grund
  const uniStandZeigen = (el, stand) => {
    const U = uni();
    el.empty();
    if (!U) return;
    for (const id of U.QUELLEN) {
      const x = stand && stand[id];
      if (!x) continue;
      if (x === "laeuft") el.createEl("p", { cls: "eba-modal-hinweis", text: `${U.NAME[id]} wird verbunden …` });
      else {
        const p = el.createEl("p", { cls: x.ok ? "eba-modal-erfolg" : "eba-modal-meldung fehler" });
        if (x.ok) p.innerHTML = svg("haken") + " ";
        p.appendText(U.zeile(id, x));
      }
    }
  };

  // ---------- Verbunden in diesem Tresor (seit 0.4.7, quellen.js verbindung) ----------
  // Link und Passwort liegen nur auf dem Gerät, das verbunden ist; die Daten kommen über den Sync. Hält ein anderes Gerät die Sperre
  // der Quelle (sperre.js) und war es vor höchstens 7 Tagen aktiv, gilt die Quelle auch hier als verbunden: kein Verbinden-Knopf,
  // kein Schloss. sperrenLesen() liest die Sperren beim Start und nach jeder Änderung (Sync, eigener Lauf); geändert → neu zeichnen.
  const FREMD = ["alma", "ilias", "ilias-kalender", "alma-konto"];
  const sperren = {}; // Quelle → Inhalt der Sperre (sperre.lesenAus) oder null
  const sperrePfad = (q) => `System/Daten/${q}-abruf.json`; // wie sperre.pfadVon
  const geraetId = () => (ctx.zentral && ctx.zentral.geraetId ? ctx.zentral.geraetId() : String(app.loadLocalStorage("eba-geraet") || ""));
  const sperrenLesen = async () => {
    const S = ctx.user && ctx.user.sperre;
    if (!S || !S.lesenAus) return false;
    let neu = false;
    for (const q of FREMD) {
      const f = app.vault.getAbstractFileByPath(sperrePfad(q));
      let a = null;
      try { a = f ? S.lesenAus(await app.vault.read(f)) : null; } catch (e) { a = null; }
      if (JSON.stringify(a) !== JSON.stringify(sperren[q] || null)) { sperren[q] = a; neu = true; }
    }
    return neu;
  };
  // Wo ist die Verbindung v mit ihrem Status s? → { art: "hier" | "anderswo" | "nein", zuletzt }. Hier: Link bzw. Zugang auf diesem
  // Gerät (ILIAS im eigenen Uni-Abgleich: für die Übungsgruppen). Noten & Anmeldungen kann nur statt „Braucht deinen Uni-Zugang“
  // anderswo sein. Nie anderswo: Quelle von außen (dann gibt es nichts zu verbinden) und ILIAS mit abgelehntem Passwort (auf einem
  // deiner Geräte; sonst sähe es aus, als liefe alles).
  const HIER = Object.freeze({ art: "hier", zuletzt: "" }), NEIN = Object.freeze({ art: "nein", zuletzt: "" });
  const ortVon = (v, s) => {
    const Q = ctx.user && ctx.user.quellen;
    s = s || {};
    if (!v || FREMD.indexOf(v.id) < 0) return NEIN;
    if (v.art === "konto" ? s.benutzer : s.verbunden || s.gruppenZugang) return HIER;
    if (v.art === "konto" && s.art !== "ohne-zugang") return NEIN;
    if ((s.extern && (v.id !== "ilias" || s.gruppenExtern)) || s.abgelehnt) return NEIN;
    if (!Q || !Q.verbindung) return NEIN; // quellen.js einer älteren Fassung: wie bisher
    return Q.verbindung({ sperre: sperren[v.id] || null, geraet: geraetId(), jetztMs: Date.now() });
  };
  const anderswo = (v, s) => ortVon(v, s).art === "anderswo";
  const imTresor = (id) => { const v = holen(id); return ortVon(v, v ? v.status() : null); };

  // ---------- Symbole (Lucide, 24er-Raster, Strich in currentColor) ----------
  const SYMBOLE = {
    schloss: '<rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
    haken: '<path d="M20 6 9 17l-5-5"/>',
    uhr: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    extern: '<path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
    warnung: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    pause: '<rect x="14" y="4" width="4" height="16" rx="1"/><rect x="6" y="4" width="4" height="16" rx="1"/>',
    aus: '<path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.77.04"/>',
    laden: '<path d="M12 15V3"/><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 10 5 5 5-5"/>',
    "neu-laden": '<path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/>',
    pfeil: '<path d="m9 18 6-6-6-6"/>',
    // Symbol der Sache in der kompakten Zeile (symbol in der Registry; Lucide key-round, file-search, landmark, sparkles,
    // server, refresh-cw)
    schluessel: '<path d="M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z"/><circle cx="16.5" cy="7.5" r=".5" fill="currentColor"/>',
    "pdf-suche": '<path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"/><path d="M14 2v5a1 1 0 0 0 1 1h5"/><circle cx="11.5" cy="14.5" r="2.5"/><path d="M13.3 16.3 15 18"/>',
    uni: '<path d="M10 18v-7"/><path d="M11.12 2.198a2 2 0 0 1 1.76.006l7.866 3.847c.476.233.31.949-.22.949H3.474c-.53 0-.695-.716-.22-.949z"/><path d="M14 18v-7"/><path d="M18 18v-7"/><path d="M3 22h18"/><path d="M6 18v-7"/>',
    ki: '<path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"/><path d="M20 2v4"/><path d="M22 4h-4"/><circle cx="4" cy="20" r="2"/>',
    server: '<rect x="2" y="2" width="20" height="8" rx="2" ry="2"/><rect x="2" y="14" width="20" height="8" rx="2" ry="2"/><path d="M6 6h.01"/><path d="M6 18h.01"/>',
    update: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  };
  const svg = (name) => `<svg class="eba-sym" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${SYMBOLE[name] || SYMBOLE.haken}</svg>`;

  // ---------- Registry ----------
  const ALMA_START = "https://alma.uni-tuebingen.de/alma/pages/cs/sys/portal/hisinoneStartPage.faces";
  const ILIAS_START = "https://ovidius.uni-tuebingen.de/";
  const ALMA_STUNDENPLAN = "https://alma.uni-tuebingen.de/alma/pages/plan/individualTimetable.xhtml?_flowId=individualTimetableSchedule-flow";
  const VERBINDUNGEN = {
    // Uni-Login (seit 0.4.8): EINE Zeile unter Verbindungen für alles, was der Login holt (UNI_TEILE); deren eigene Zeilen stehen
    // nur noch im Fenster (UniFenster). Aktualisieren holt alles, was auf diesem Gerät verbunden ist; Trennen trennt alles hier.
    "uni-login": {
      id: "uni-login", name: "Uni-Login", art: "uni", symbol: "schluessel",
      satz: "Ein Login für Unterlagen, Abgaben und Stundenplan.",
      // was der Login holt, in den Wörtern seiner Teile (Noten nur, wenn sichtbar)
      get beschreibung() { return undListe(uniTeile().map((x) => UNI_WORT[x.v.id])); },
      trennenText: "Passwort, Benutzername und Links werden auf diesem Gerät gelöscht. Deine Daten bleiben, werden aber nicht mehr aktualisiert.",
      status() { return { verbunden: uniTeile().some((x) => x.hier), gesperrt: !!VERBINDUNGEN.ilias.status().gesperrt }; },
      gesperrt() { return false; },
      async aktualisieren(p) { await Promise.all(uniTeile().filter((x) => x.hier && x.v.art !== "konto" && !x.s.laeuft).map((x) => x.v.aktualisieren(p).catch(() => null))); },
      async trennen() { for (const x of uniTeile()) if (x.hier && x.v.trennen) await x.v.trennen(); },
    },
    alma: {
      id: "alma", name: "Alma-Stundenplan", art: "link",
      satz: "Verbinde Alma, dann siehst du hier deine Woche.",
      // Fenster „Alma-Stundenplan verbinden“: mit zentralem Stundenplan freiwillig
      get kurz() { return zentralerPlan().verfuegbar ? "Deine Vorlesungen kommen von selbst, deine Übungsgruppe meist aus ILIAS. Mit Alma kommen Kurse dazu, die du dort belegt hast." : ""; },
      vorschau: "woche", anreiz: "Deine Woche auf einen Blick",
      erklaerung: "Der Link enthält kein Passwort und bleibt nur auf diesem Gerät; in Alma findest du ihn unter Mein Studium → Stundenplan und kannst ihn dort jederzeit erneuern.",
      // Links geprüft am 17.10.2026 (angemeldet: Seite „Stundenplan für …“ mit „Daten für iCalendar (ics) exportieren“). Ohne
      // Anmeldung zeigt der Stundenplan-Link die Anmeldung, danach aber die Startseite; darum zuerst Alma, dann der Stundenplan.
      schritte: [
        `[Alma](${ALMA_START}) öffnen und anmelden.`,
        `[Deinen Stundenplan](${ALMA_STUNDENPLAN}) öffnen.`,
        "**Daten für iCalendar (ics) exportieren** wählen.",
        "**Link kopieren** und unten einfügen.",
      ],
      platzhalter: "Link hier einfügen",
      // Texte der Link-Fenster (VerbindenFenster, VerwaltenFenster): beim Abruf, nach dem Verbinden, neuer Link
      laedt: "Stundenplan wird geholt …", danach: "Änderungen in Alma kommen ab jetzt von selbst, solange Obsidian offen ist.",
      neuerLink: "Neuer Link aus Alma? **Neuen Link eingeben** tippen.", externText: ALMA_EXTERN,
      get trennenText() { return stundenplanExtern() ? "Die Einträge aus Alma bleiben. Deinen Stundenplan bringt weiter dein Uni-Abgleich." : "Dein Stundenplan bleibt, wird aber nicht mehr aktualisiert."; },
      // extern: eigener Uni-Abgleich (bringt den Stundenplan); dazu die gemeinsame Form der Quellen aus alma.js
      status() {
        const s = alma().status();
        return Object.assign({}, s, { verbunden: !!s.verbunden, seit: s.seit, stand: s.stand, daten: stundenplanAnzahl(), extern: stundenplanExtern() });
      },
      // Gesperrt nur, wenn weder ein Link auf diesem Gerät noch eigene Stundenplan-Notizen (z. B. per Sync) noch zentrale
      // Vorlesungen noch ein eigener Uni-Abgleich noch ein anderes verbundenes Gerät da sind UND Alma in der Einrichtung offen
      // blieb (übersprungen, „Später“ oder Einrichtung nicht fertig)
      gesperrt() { const s = this.status(); return !s.verbunden && !s.daten && !s.extern && !zentralerPlan().anzahl && almaOffen() && !anderswo(this, s); },
      pruefen(link) { return alma().linkPruefen(link); },
      async verbinden(link) {
        const a = alma();
        const bericht = await a.verbinden(link, { nurBeiErfolg: true });
        if (!bericht) return { ok: false, fehler: a.fehler() || "Das hat nicht geklappt. Bitte noch einmal versuchen." };
        return { ok: true, text: `${bericht.termine} ${bericht.termine === 1 ? "Lehrveranstaltung" : "Lehrveranstaltungen"} übernommen.` };
      },
      async aktualisieren() { return alma().aktualisieren({ still: false }); },
      trennen() { alma().trennen(); },
    },
    // Noten & Anmeldungen (alma-konto.js, seit 0.4.5, Beta): Zeile und Fenster kommen von dort; ohne Beta, Zustimmung und Daten keine
    // Zeile (sichtbar)
    "alma-konto": {
      id: "alma-konto", name: "Noten & Anmeldungen (Alma)", art: "konto",
      satz: "Neue Noten aus Alma auf deinen Modulseiten.",
      status() { return ctx.almaKonto ? ctx.almaKonto.status() : { art: "unsichtbar", sichtbar: false }; },
      sichtbar() { return !!(ctx.almaKonto && ctx.almaKonto.sichtbar()); },
      gesperrt() { return false; },
    },
    // ILIAS-Unterlagen (ilias.js, seit 0.4.0): Benutzername + Passwort, Kurswahl, Dateien nach Unterlagen/. Eigenes Fenster
    // (IliasFenster). Im eigenen Uni-Abgleich heißt die Verbindung „ILIAS“, nie ein Schloss; Verbinden dort nur für die
    // Übungsgruppen (keine Dateien), mit eigenen Texten (Getter).
    ilias: {
      id: "ilias", art: "anmeldung",
      get name() { return dateienExtern() ? "ILIAS" : "ILIAS-Unterlagen"; },
      satz: "Verbinde ILIAS, dann landen deine Kursdateien von selbst hier.",
      schlossKnopf: "ILIAS verbinden",
      // Fenster zum Anmelden: seit 0.4.8 der Uni-Login für alles (uni-login.js verbindet danach Kalender und Alma mit)
      get anmeldenTitel() { return dateienExtern() ? "ILIAS verbinden" : "Mit Uni-Login verbinden"; },
      // Zustimmung sichtbar vor der Eingabe (Uni-Login): ein Satz nennt, was der Login holt
      get kurz() {
        if (dateienExtern()) return "Deine Übungsgruppe kommt dann von selbst in den Stundenplan, deine Unterlagen weiter über deinen Uni-Abgleich.";
        const teile = ["deine Unterlagen aus ILIAS"].concat(kalenderExtern() ? [] : ["die Abgaben aus dem ILIAS-Kalender"], stundenplanExtern() ? [] : ["deinen Alma-Stundenplan"]);
        return `Mit deinem Uni-Login holt Studium Autopilot ${teile.length > 1 ? teile.slice(0, -1).join(", ") + " und " + teile[teile.length - 1] : teile[0]}.`;
      },
      // Aus „Noten & Anmeldungen“ (fuer=alma): die Kurse bleiben aus
      get kurzOhneKurse() {
        const teile = (kalenderExtern() ? [] : ["die Abgaben aus dem ILIAS-Kalender"]).concat(stundenplanExtern() ? [] : ["deinen Alma-Stundenplan"]);
        return teile.length ? `Mit deinem Uni-Login holt Studium Autopilot ${teile.join(" und ")}; deine Kurse in ILIAS bleiben aus.` : "Deine Kurse in ILIAS bleiben dabei aus.";
      },
      // Quellen, die kurz bzw. kurzOhneKurse vor der Eingabe nennen: nur für sie gilt die Anmeldung als Zustimmung (uni-login.js
      // zustimmen). Eine Einrichtung, die eine ältere Registry ohne dieses Feld liest (Skripte kommen einzeln per Sync), stimmt
      // für keine zu.
      get uniQuellen() { return dateienExtern() ? [] : (kalenderExtern() ? [] : ["ilias-kalender"]).concat(stundenplanExtern() ? [] : ["alma"]); },
      get schritte() {
        return dateienExtern() ? [] : [
          "Benutzername und Passwort der Uni eingeben, wie bei ILIAS.",
          "**Verbinden** tippen. Dateien, Abgaben und Stundenplan kommen gleich danach, Neues später von selbst.",
          "Kurse wählen. Kurse mit Modulcode sind schon an.",
        ];
      },
      // Zustimmung sichtbar vor der Eingabe (Uni-Login): wo sich Studium Autopilot damit anmeldet; Alma nur, wenn der Stundenplan
      // nicht von außen kommt
      get datenschutz() { return `Damit meldet sich Studium Autopilot bei ${dateienExtern() || stundenplanExtern() ? "ILIAS" : "ILIAS und Alma"} an. Dein Passwort bleibt verschlüsselt auf diesem Gerät.`; },
      get erklaerung() { return dateienExtern() ? "Ein Gerät reicht, deine Übungsgruppe kommt über deinen Sync auf die anderen." : "Ein Gerät reicht, alles kommt über deinen Sync auf die anderen; Videos und Dateien über 50 MB bleiben in ILIAS."; },
      get trennenText() { return dateienExtern() ? "Passwort und Benutzername werden auf diesem Gerät gelöscht. Deine Übungsgruppe bleibt im Stundenplan, wird aber nicht mehr geprüft." : "Passwort und Benutzername werden auf diesem Gerät gelöscht. Deine Dateien bleiben."; },
      // ctx.ilias.status() + daten (Unterlagen aus ILIAS im Vault, auch per Sync von einem anderen Gerät)
      status() {
        const s = ctx.ilias ? ctx.ilias.status() : { verbunden: false, extern: false, text: "Wird geladen …" };
        return Object.assign({}, s, { daten: iliasAnzahl() });
      },
      gesperrt() { const s = this.status(); return !s.verbunden && !s.extern && !s.daten && !iliasOhneAnmeldung(s) && iliasOffen() && !anderswo(this, s); },      // Knopf: Ergebnis zeigt ilias.js selbst als Hinweis; uebernehmen = hier laden, obwohl ein anderes Gerät dran ist
      async aktualisieren(p) { return ctx.ilias.jetztHolen({ uebernehmen: !!(p && (p.uebernehmen === true || p.uebernehmen === "1")) }); },
      async trennen() { await ctx.ilias.zugangLoeschen(); },
    },
    // ILIAS-Kalender (ilias-kalender.js, seit 18.10.2026): Abo-Link wie bei Alma, nur gerätelokal; Abgaben deiner Übungen als
    // Fristen. Beschriftungen in ILIAS 10 (Sprachdatei): Persönlicher Arbeitsraum → Kalender, Knopf „Abonnieren“ neben dem
    // Monatsblatt, Fenster „Kalender abonnieren“ mit „iCal-URL“ (alles) und „iCal-URL (Google Kalender)“ (ohne Älteres); beide gehen.
    "ilias-kalender": {
      id: "ilias-kalender", name: "ILIAS-Kalender", art: "link",
      satz: "Mit dem ILIAS-Kalender stehen die Abgabetermine deiner Übungen bei deinen Fristen.",
      kurz: "Die Abgabetermine deiner Übungen aus ILIAS kommen dann von selbst zu deinen Fristen.",
      erklaerung: "Der Link ist geheim wie ein Passwort und bleibt nur auf diesem Gerät. Persönliche Abgabetermine und Übungen in Ordnern zeigt nur ILIAS selbst.",
      schritte: [
        `[ILIAS](${ILIAS_START}) öffnen und anmelden.`,
        "**Persönlicher Arbeitsraum** → **Kalender** öffnen.",
        "Neben dem Monatsblatt **Abonnieren** tippen.",
        "Den Link unter **iCal-URL** kopieren und unten einfügen.",
      ],
      platzhalter: "Link hier einfügen",
      laedt: "Abgaben werden geholt …", danach: "Neue Abgaben aus ILIAS kommen ab jetzt von selbst, solange Obsidian offen ist.",
      neuerLink: "Neuer Link aus ILIAS? **Neuen Link eingeben** tippen.",
      get externText() { return ctx.iliasKalender ? ctx.iliasKalender.K.EXTERN : ""; },
      trennenText: "Der Link wird auf diesem Gerät gelöscht. Deine Fristen bleiben, werden aber nicht mehr aktualisiert.",
      status() { return ctx.iliasKalender ? ctx.iliasKalender.status() : { verbunden: false, zustand: "" }; },
      sichtbar() { return !!ctx.iliasKalender; },
      gesperrt() { return false; },
      pruefen(link) { return ctx.iliasKalender.linkPruefen(link); },
      async verbinden(link) {
        const k = ctx.iliasKalender, b = await k.verbinden(link, { nurBeiErfolg: true });
        if (!b) return { ok: false, fehler: k.fehler() || "Das hat nicht geklappt. Bitte noch einmal versuchen." };
        return { ok: true, text: b.offen ? `${b.offen} ${b.offen === 1 ? "Abgabe" : "Abgaben"} bei deinen Fristen.` : "Gerade keine Abgaben in ILIAS." };
      },
      async aktualisieren() { return ctx.iliasKalender.aktualisieren({}); },
      trennen() { return ctx.iliasKalender.trennen(); },
    },
    // Volltext der PDFs (volltext.js, seit 0.4.5): Zeile mit den Zahlen aus ctx.volltext.status(), Fenster mit Schalter
    // („volltext“ in System/Einstellungen.md, gilt für alle Geräte); ein anderes Gerät liest gerade → „Hier aktualisieren“.
    // Heißt seit 24.10.2026 „Suche in PDFs“ (was es dir bringt; „Volltext“ verstand nicht jede:r).
    volltext: {
      id: "volltext", name: "Suche in PDFs", art: "volltext", symbol: "pdf-suche",
      satz: "Die Suche findet auch Wörter in deinen PDFs.",
      beschreibung: "Macht Folien und Skripte durchsuchbar",
      kurz: "Zu jeder PDF unter Unterlagen entsteht eine Textfassung, damit die Suche Wörter aus den PDFs findet, auch auf iPhone und iPad.",
      erklaerung: "Gelesen wird nur auf deinen Geräten, nichts geht ins Netz. Ein Gerät reicht, die Textfassungen kommen über deinen Sync auf die anderen.",
      status() { return ctx.volltext ? ctx.volltext.status() : { an: false, zustand: "" }; },
      sichtbar() { return !!ctx.volltext; },
      gesperrt() { return false; },
      async aktualisieren(p) { if (ctx.volltext) await ctx.volltext.nachholen({ hier: !!(p && (p.hier === true || p.hier === "1")) }); },
    },
    // Zentrale Daten (zentral.js): ohne Schloss, Standard an. Schalter in System/Einstellungen.md (gilt für alle deine Geräte,
    // weil nur ein Gerät die Termine schreibt – ein Schalter nur auf einem Gerät würde nichts abschalten).
    zentral: {
      id: "zentral", name: "Zentrale Daten", art: "zentral", symbol: "uni",
      satz: "Termine und Fristen für alle kommen automatisch.",
      beschreibung: "Vorlesungen, Fristen und Termine für alle",
      kurz: "Termine, Fristen und Semesterdaten für alle EcoBA-Studierenden kommen alle 15 Minuten von selbst, solange Obsidian offen ist.",
      schritte: [
        "Nicht warten? **Aktualisieren** tippen.",
        "Keine Partys und Vorträge? Unten **Fachschaft & Veranstaltungen** ausschalten.",
      ],
      erklaerung: "Studium Autopilot holt nur Daten von einer öffentlichen Seite auf GitHub und sendet nichts von dir; GitHub sieht nur deine IP-Adresse, wie bei jeder Webseite. „erledigt“ und alles unter „Meine Notizen“ bleiben immer erhalten.",
      status() { return ctx.zentral ? ctx.zentral.status() : { verbunden: false }; },
      gesperrt() { return false; },
      async aktualisieren() { if (ctx.zentral) await ctx.zentral.abrufen({ manuell: true }); },
    },
    // Claude ohne Server (claude.js, seit 0.6.3): eigener API-Schlüssel aus der Claude Console für „Zusammenfassen“ im PDF-Kasten.
    // Seit 26.10.2026 nur für Fortgeschrittene, nie als empfohlener Weg: Der eigene Server fasst über das Claude-Abo zusammen, der
    // Schlüssel kostet je Zusammenfassung extra. Darum steht die Zeile nur da, wenn dieses Gerät verbunden ist; sonst führt nur ein
    // leiser Link im Fenster „Eigener Server“ hierher, und Schritte und Feld liegen unter „Trotzdem mit API-Schlüssel verbinden“
    // (InfoFenster). Zeile und Fenster (Feld für den Schlüssel, Verbrauch, Trennen) liefert ctx.claude (zeile(), fensterInhalt()).
    claude: {
      id: "claude", name: "Claude", art: "claude", symbol: "ki",
      satz: "Claude fasst deine Unterlagen zusammen.",
      beschreibung: "Fasst deine Unterlagen mit KI zusammen",
      get kurz() {
        return ctx.claude && ctx.claude.verbunden()
          ? "Tipp im PDF-Kasten einer Unterlage auf **Zusammenfassen**, dann füllt Claude „Das Wichtigste“, „Zu tun“ und „Offene Fragen“."
          : "**Für Fortgeschrittene.** Mit einem API-Schlüssel zahlst du jede Zusammenfassung extra, meist 0,05 bis 0,50 $ von einem Guthaben bei Anthropic. Dein Claude-Abo zählt hier nicht. Empfohlen ist ein eigener Server: Er fasst über dein Claude-Abo zusammen, ohne Kosten je Unterlage.";
      },
      // Schritte zum Schlüssel, solange keiner da ist oder Anthropic ihn nicht mehr annimmt
      get schritte() {
        const s = ctx.claude ? ctx.claude.status() : null;
        if (!s || (s.verbunden && s.problem !== "schluessel")) return [];
        return [
          "Auf [platform.claude.com](https://platform.claude.com) ein Konto anlegen und unter [Billing](https://platform.claude.com/settings/billing) Guthaben kaufen.",
          "Unter [API keys](https://platform.claude.com/settings/keys) auf **Create key** tippen, einen Namen eingeben und den Schlüssel kopieren.",
          "Den Schlüssel unten einfügen und **Verbinden** tippen.",
        ];
      },
      get erklaerung() {
        return ctx.claude && ctx.claude.verbunden()
          ? "Der Schlüssel liegt nur im Schlüsselbund dieses Geräts, die Unterlage geht nur an Anthropic. Ein Ausgabenlimit stellst du in der Console unter Billing ein."
          : "Der Schlüssel bleibt im Schlüsselbund dieses Geräts, die Unterlage geht nur an Anthropic, Studium Autopilot bekommt nichts davon. Ein Claude-Abo geht mit dem Schlüssel nicht: Anthropic erlaubt Abos nur in Claude selbst, und auf deinem eigenen Server läuft Claude selbst.";
      },
      trennenText: "Der Schlüssel wird auf diesem Gerät gelöscht. Deine Zusammenfassungen bleiben.",
      sichtbar() { return !!ctx.claude && ctx.claude.verbunden(); },
      status() { return ctx.claude ? ctx.claude.status() : { verbunden: false }; },
      gesperrt() { return false; },
      async trennen() { if (ctx.claude) await ctx.claude.trennen(); },
    },
    // Eigener Server mit Claude (server.js): Zusammenfassungen über das Claude-Abo, Termine und Hinweise aus Uni-Mails und
    // Kursdaten. Seit 26.10.2026 der empfohlene Weg zum Zusammenfassen (der API-Schlüssel kostet je Unterlage extra); die Texte
    // nennen das Abo zuerst. Ohne Server (kein Gerät verbunden, keine server.json per Sync) eine leise Zeile „Für Technische“ mit
    // „Mehr erfahren“: Fenster mit Schritten, dem Knopf „Prompt kopieren“ für Claude Desktop und ganz unten dem leisen Link zum
    // API-Schlüssel. Verbinden geht nur über den Einmal-Link des Servers; Zeile und Fenster liefert ctx.server (zeile(), fensterInhalt()).
    server: {
      id: "server", name: "Eigener Server", art: "server", symbol: "server",
      satz: "Dein Server fasst mit deinem Claude-Abo Unterlagen zusammen und findet Termine in deinen Uni-Mails.",
      beschreibung: "Fasst Unterlagen mit deinem Claude-Abo zusammen",
      // Ohne Server (kein Gerät verbunden): Weg zur Einrichtung mit Claude Desktop; sonst Stand bzw. Verbinden dieses Geräts
      get kurz() {
        return ctx.server && !ctx.server.sichtbar()
          ? "Claude richtet dir am Computer einen eigenen, kostenlosen Server ein. Er fasst deine Unterlagen über dein Claude-Abo zusammen, ohne Kosten je Unterlage, und sucht in deinen Uni-Mails nach Terminen für dich."
          : "Dein eigener Server fasst deine Unterlagen über dein Claude-Abo zusammen und sucht in deinen Uni-Mails nach Terminen, neue landen von selbst unter Termine.";
      },
      get schritte() {
        if (!ctx.server || ctx.server.verbunden()) return [];
        if (!ctx.server.sichtbar()) {
          return [
            "Unten **Prompt kopieren** tippen.",
            "Claude Desktop öffnen, den Text einfügen und senden. Claude führt dich durch alles Weitere.",
            "Zum Schluss auf jedem Gerät den Link öffnen, den dein Server zeigt.",
          ];
        }
        return [
          "In der Cloud Shell von Oracle **bash ~/studium-autopilot/server/fern.sh verbinden** eingeben.",
          "Den Link auf diesem Gerät öffnen oder den QR-Code scannen.",
        ];
      },
      get erklaerung() {
        return ctx.server && !ctx.server.sichtbar()
          ? "Kostet nichts extra: Claude läuft über dein Abo (Claude Pro oder Max), der Server im Always-Free-Angebot von Oracle ohne Upgrade, ein Budget warnt ab dem ersten Cent. Du brauchst dazu ein Oracle-Konto, Gmail ist freiwillig."
          : "Die Schlüssel liegen nur im Schlüsselbund dieses Geräts, die Daten kommen verschlüsselt. Ein Gerät reicht, die Termine kommen über deinen Sync auf die anderen.";
      },
      trennenText: "Die Schlüssel werden auf diesem Gerät gelöscht. Deine Termine bleiben, dein Server läuft weiter.",
      sichtbar() { return !!ctx.server; },
      status() { return ctx.server ? ctx.server.status() : { verbunden: false }; },
      gesperrt() { return false; },
      // uebernehmen = Knopf „Hier aktualisieren“: die Sperre von einem anderen Gerät herholen
      async aktualisieren(p) { if (ctx.server) await ctx.server.jetztHolen({ uebernehmen: !!(p && (p.uebernehmen === true || p.uebernehmen === "1")) }); },
      async trennen() { if (ctx.server) await ctx.server.trennen(); },
    },
    // Die Vorlage selbst (update.js, seit 0.2.0): Version und Knopf „Neue Version installieren“, wenn eine neue Version da ist,
    // sonst „Nach Updates suchen“ (seit 0.4.8). Heißt seit 24.10.2026 „Updates“: „Studium Autopilot“ ließ neben „Neue Version“
    // auf dem iPhone keinen Platz und sagte nicht, worum es in der Zeile geht.
    vorlage: {
      id: "vorlage", name: "Updates", art: "vorlage", symbol: "update",
      satz: "Neue Versionen holst du mit einem Tipp.",
      // rechts steht, ob sie aktuell ist (update.js anzeige), darunter die Version
      get beschreibung() { const v = ctx.update ? ctx.update.status().version : ""; return v ? `Version ${v} installiert` : ""; },
      kurz: "Gibt es eine neue Version, steht hier **Neue Version installieren**. Ein Tipp holt sie, deine Einträge bleiben.",
      schritte: [
        "Nicht warten? **Nach Updates suchen** tippen.",
        "**Neue Version installieren** tippen und bestätigen.",
        "Auf deinen anderen Geräten kommt das Update über deinen Sync. Dort nicht noch einmal tippen.",
      ],
      erklaerung: "Neue Programmteile kommen nur nach deinem Tipp; jede Datei wird geprüft, und vorher entsteht eine Sicherung.",
      status() { return ctx.update ? ctx.update.status() : { verbunden: true }; },
      gesperrt() { return false; },
    },
  };
  const holen = (id) => VERBINDUNGEN[String(id || "").trim().toLowerCase()] || null;
  // Teile des Uni-Logins mit Stand: { v, s, hier, anderswo, zuletzt } (Kalender nur mit ilias-kalender.js, Noten nur sichtbar)
  const UNI_TEILE = ["ilias", "ilias-kalender", "alma", "alma-konto"];
  const UNI_WORT = { ilias: "Unterlagen", "ilias-kalender": "Abgaben", alma: "Stundenplan", "alma-konto": "Noten" };
  const uniTeile = () => UNI_TEILE.map(holen).filter((v) => !v.sichtbar || v.sichtbar()).map((v) => {
    const s = v.status() || {}, o = ortVon(v, s);
    const hier = v.art === "konto" ? !!(s.an && s.benutzer) && ["extern", "beta-aus"].indexOf(s.art) < 0 : o.art === "hier";
    return { v, s, hier, anderswo: o.art === "anderswo", zuletzt: hier ? s.geprueft || s.zuletzt || "" : o.zuletzt };
  });

  // ---------- Anzeige aktualisieren ----------
  const bloecke = []; // Codeblock-Griffe (ctx.codeblock), gesetzt in registrieren()
  // auch den Update-Hinweis auf dem Dashboard (update.js, ```eba-update-hinweis```): gleicher Anlass (Abruf, Update, Kanal)
  const neuZeichnen = () => { for (const b of bloecke) b.neu(); try { if (ctx.update && ctx.update.hinweisNeu) ctx.update.hinweisNeu(); } catch (e) { /* egal */ } };

  // ---------- Fenster ----------
  // Ja/Nein-Frage → Promise<boolean>
  const bestaetigen = (titel, text, ja) => new Promise((fertig) => {
    const m = new Modal(app);
    let erledigt = false;
    m.modalEl.addClass("eba-modal");
    m.titleEl.setText(titel);
    m.contentEl.createEl("p", { text, cls: "eba-modal-text" });
    const k = m.contentEl.createDiv({ cls: "modal-button-container" });
    const ok = k.createEl("button", { text: ja || "OK", cls: "mod-warning" });
    const ab = k.createEl("button", { text: "Abbrechen" });
    ok.addEventListener("click", () => { erledigt = true; m.close(); fertig(true); });
    ab.addEventListener("click", () => m.close());
    m.onClose = () => { m.contentEl.empty(); if (!erledigt) fertig(false); };
    m.open();
  });

  // Text mit **fett** (Bedienelemente) und [Link](https://…) → [{ art: text | fett | link, text, href? }]; nur https-Links
  const textTeile = (s) => {
    const aus = [];
    for (const teil of String(s || "").split(/(\[[^\]]+\]\(https:\/\/[^)\s]+\))/)) {
      const m = teil.match(/^\[([^\]]+)\]\((https:\/\/[^)\s]+)\)$/);
      if (m) { aus.push({ art: "link", text: m[1], href: m[2] }); continue; }
      teil.split("**").forEach((t, i) => { if (t) aus.push({ art: i % 2 ? "fett" : "text", text: t }); });
    }
    return aus;
  };
  // … ohne innerHTML ins Element; Links öffnen im Browser (wie die anderen externen Links: external-link, _blank)
  const fett = (el, s) => {
    for (const t of textTeile(s)) {
      if (t.art === "link") el.createEl("a", { text: t.text, href: t.href, cls: "external-link", attr: { target: "_blank", rel: "noopener" } });
      else if (t.art === "fett") el.createEl("b", { text: t.text });
      else el.appendText(t.text);
    }
  };
  const schritteZeigen = (c, v) => {
    if (!v.schritte || !v.schritte.length) return;
    const ol = c.createEl("ol", { cls: "eba-modal-schritte" });
    for (const s of v.schritte) fett(ol.createEl("li"), s);
  };
  // Hintergrund in einem Satz, direkt sichtbar. Eingeklappt („Mehr erfahren“) nur, wenn darin noch etwas steht (gefaltet: der
  // Schalter „Beta-Versionen“ bei Studium Autopilot)
  const mehrZeigen = (c, text, gefaltet) => {
    if (!text) return null;
    if (!gefaltet) { c.createEl("p", { cls: "eba-modal-hinweis", text }); return null; }
    const d = c.createEl("details", { cls: "eba-modal-mehr" });
    d.createEl("summary", { text: "Mehr erfahren" });
    d.createEl("p", { text });
    return d;
  };

  // Schalter der zentralen Daten (im Fenster statt in der Zeile): schreiben den Wert direkt (Parameter wert), damit zweimal
  // schnell Tippen nicht am noch alten metadataCache scheitert.
  const zentralSchalter = (c) => {
    const st = ctx.zentral ? ctx.zentral.status() : { an: false, veranstaltungen: false };
    const box = c.createDiv({ cls: "eba-modal-schalter" });
    let tVer = null;
    const zeile = (name, desc, wert, was, nachher) => new ctx.obsidian.Setting(box).setName(name).setDesc(desc).addToggle((t) => {
      if (was === "veranstaltungen") tVer = t;
      t.setValue(!!wert).onChange(async (neu) => {
        await ctx.aktion("zentral-schalter", { was, wert: neu ? "1" : "0" });
        if (nachher) nachher(neu);
        neuZeichnen();
      });
    });
    zeile("Zentrale Daten", "Aus: Es kommen keine neuen Termine. Vorhandene bleiben.", st.an, "daten", (neu) => { if (tVer) tVer.setDisabled(!neu); });
    zeile("Fachschaft & Veranstaltungen", "Partys, Vorträge und Infoabende.", st.veranstaltungen, "veranstaltungen");
    if (tVer) tVer.setDisabled(!st.an);
    ausgeblendetZeigen(c);
  };
  // Schalter des Volltexts (im Fenster statt in der Zeile): „volltext“ in den Einstellungen, für alle Geräte
  const volltextSchalter = (c) => {
    if (!ctx.volltext) return;
    const st = ctx.volltext.status();
    if (st.zustand === "extern" || st.zustand === "fremd") { c.createEl("p", { cls: "eba-modal-hinweis", text: st.text }); return; }
    const box = c.createDiv({ cls: "eba-modal-schalter" });
    new ctx.obsidian.Setting(box).setName("Textfassungen anlegen").setDesc("Aus: Es entstehen keine neuen, vorhandene bleiben.")
      .addToggle((t) => t.setValue(!!st.an).onChange(async (an) => { await ctx.volltext.setzen(an); neuZeichnen(); }));
  };
  // „Besuche ich nicht“ zurücknehmen (zentraler Stundenplan): nur, wenn etwas ausgeblendet ist
  const ausgeblendetZeigen = (c) => {
    const ids = zentralerPlan().ausgeblendet;
    if (!ids.length || !ctx.zentral) return;
    c.createEl("p", { cls: "eba-modal-abschnitt", text: "Nicht in deinem Stundenplan" });
    const box = c.createDiv({ cls: "eba-modal-schalter eba-modal-ausgeblendet" });
    for (const id of ids) {
      const zeile = new ctx.obsidian.Setting(box).setName(ctx.zentral.lehreName(id));
      zeile.addButton((k) => k.setButtonText("Wieder zeigen").onClick(async () => {
        k.setDisabled(true);
        await ctx.aktion("wieder-zeigen", { id });
        zeile.settingEl.remove();
      }));
    }
  };

  // Knopf der Zeile im Fenster (seit 24.10.2026): Unter Verbindungen ist die ganze Zeile der Weg ins Fenster (kompakt), darum steht
  // ihr Knopf hier unten: Aktualisieren, Hier aktualisieren, Neue Version installieren, Neu laden, Nach Updates suchen, Einschalten
  // der zentralen Daten, ein Link nach außen. Knöpfe, die selbst ein Fenster öffnen (Aktion verbinden), nicht. k: vorhandene
  // Knopfleiste des Fensters, sonst eine neue.
  const zeilenKnopf = (m, v, k) => {
    const z = statusZeile(v), d = document.createElement("div");
    d.innerHTML = (z && z.knopf) || "";
    const a = d.querySelector("a"), href = a ? a.getAttribute("href") || "" : "";
    if (!href || aktionVon(href) === "verbinden") return null;
    const b = (k || m.contentEl.createDiv({ cls: "modal-button-container" })).createEl("button", { text: a.textContent, cls: a.classList.contains("cta") ? "mod-cta" : "" });
    b.addEventListener("click", () => {
      m.close();
      if (!/^obsidian:/.test(href)) { window.open(href, "_blank", "noopener"); return; }
      const p = {};
      new URLSearchParams(href.split("?")[1] || "").forEach((w, n) => { p[n] = w; });
      ctx.aktion(p.aktion, p);
    });
    return b;
  };

  // Leiser Link zu einer anderen Verbindung (Eigener Server ↔ API-Schlüssel): schließt dieses Fenster und öffnet das andere
  const wechselLink = (m, text, id) => {
    const a = m.contentEl.createEl("p", { cls: "eba-modal-hinweis" }).createEl("a", { text, href: "#" });
    a.addEventListener("click", (e) => { e.preventDefault(); m.close(); ctx.aktion("verbinden", { id }); });
  };

  // Erklärung ohne Eingabe (zentrale Daten mit Schaltern, Studium Autopilot); unten höchstens der Knopf der Zeile, schließen über ×
  class InfoFenster extends Modal {
    constructor(v) { super(app); this.v = v; }
    onOpen() {
      const v = this.v;
      this.modalEl.addClass("eba-modal", "eba-modal-verbinden");
      this.titleEl.setText(v.name);
      if (v.kurz) fett(this.contentEl.createEl("p", { cls: "eba-modal-text" }), v.kurz);
      // Claude nicht verbunden (seit 26.10.2026): erst der Weg zum eigenen Server, Schritte und Feld für den Schlüssel nur
      // eingeklappt, damit niemand den API-Schlüssel für den empfohlenen Weg hält
      const claudeZu = v.art === "claude" && !!ctx.claude && !ctx.claude.verbunden();
      if (claudeZu && ctx.server) wechselLink(this, "Lieber einen eigenen Server einrichten", "server");
      const unten = claudeZu ? this.contentEl.createEl("details", { cls: "eba-modal-mehr" }) : this.contentEl;
      if (claudeZu) unten.createEl("summary", { text: "Trotzdem mit API-Schlüssel verbinden" });
      schritteZeigen(unten, v);
      if (v.art === "zentral") zentralSchalter(this.contentEl);
      if (v.art === "volltext") volltextSchalter(this.contentEl);
      if (v.art === "server" && ctx.server) ctx.server.fensterInhalt(this.contentEl.createDiv()).catch((e) => console.error("Eigener Server: Fenster", e));
      // Claude: nach dem Verbinden neu zeichnen (Texte und Inhalt hängen davon ab)
      if (v.art === "claude" && ctx.claude) ctx.claude.fensterInhalt(unten.createDiv(), () => { this.contentEl.empty(); this.onOpen(); });
      const mehr = mehrZeigen(this.contentEl, v.erklaerung, v.art === "vorlage" && !!(ctx.update && ctx.update.kanalSchalter));
      // Studium Autopilot: Schalter „Beta-Versionen“ und „Mitzählen“ bewusst nur unter „Mehr erfahren“ (update.js)
      if (v.art === "vorlage" && mehr && ctx.update && ctx.update.kanalSchalter) ctx.update.kanalSchalter(mehr.createDiv({ cls: "eba-modal-schalter" }));
      if (v.art === "vorlage" && mehr && ctx.update && ctx.update.zaehlenSchalter) ctx.update.zaehlenSchalter(mehr.createDiv({ cls: "eba-modal-schalter" }));
      // Noch kein Server: ganz unten und leise der Weg ohne Server, mit den Kosten im Text (die Zeile „Claude“ steht dann nicht da)
      if (v.art === "server" && ctx.server && !ctx.server.sichtbar() && ctx.claude && !ctx.claude.verbunden())
        wechselLink(this, "Für Fortgeschrittene: ohne Server mit API-Schlüssel, kostet je Zusammenfassung extra", "claude");
      zeilenKnopf(this, v);
    }
    onClose() { this.contentEl.empty(); if (fenster === this) fenster = null; }
  }

  // Verbunden (Alma): Stand, Hintergrund und die seltenen Knöpfe (neuer Link, Trennen) – in der Zeile steht nur „Aktualisieren“
  class VerwaltenFenster extends Modal {
    constructor(v) { super(app); this.v = v; }
    onOpen() {
      const v = this.v, c = this.contentEl, s = v.status();
      this.modalEl.addClass("eba-modal", "eba-modal-verbinden");
      this.titleEl.setText(v.name);
      c.createEl("p", { cls: "eba-modal-marke" }).innerHTML = `<span class="eba-pill ok">verbunden</span>`;
      c.createEl("p", { cls: "eba-modal-text", text: [s.seit ? `Verbunden seit ${tagText(s.seit)}.` : "", standText(s).text].filter(Boolean).join(" ") });
      const ol = c.createEl("ol", { cls: "eba-modal-schritte" });
      fett(ol.createEl("li"), "Für den neuesten Stand **Aktualisieren** tippen.");
      fett(ol.createEl("li"), v.neuerLink);
      mehrZeigen(c, v.erklaerung);
      const k = c.createDiv({ cls: "modal-button-container" });
      const neu = k.createEl("button", { text: "Neuen Link eingeben" });
      const weg = k.createEl("button", { text: "Trennen", cls: "mod-warning" });
      zeilenKnopf(this, v, k);
      neu.addEventListener("click", () => { this.close(); const m = new VerbindenFenster(v); fenster = m; m.open(); });
      weg.addEventListener("click", () => { this.close(); ctx.aktion("trennen", { id: v.id }); });
    }
    onClose() { this.contentEl.empty(); if (fenster === this) fenster = null; }
  }

  // Über ein anderes Gerät verbunden (seit 0.4.7, ortVon): Stand und leise „Auch hier verbinden“ (öffnet das Verbinden der Quelle,
  // aus „Noten & Anmeldungen“ das ILIAS-Fenster wie dort). Kein Hauptknopf: Ein Gerät reicht.
  class AnderswoFenster extends Modal {
    constructor(v) { super(app); this.v = v; }
    onOpen() {
      const v = this.v, c = this.contentEl;
      this.modalEl.addClass("eba-modal", "eba-modal-verbinden");
      this.titleEl.setText(v.name);
      c.createEl("p", { cls: "eba-modal-marke" }).innerHTML = PILLE.an;
      c.createEl("p", { cls: "eba-modal-text", text: anderswoText(imTresor(v.id)) });
      c.createEl("p", { cls: "eba-modal-hinweis", text: "Ein Gerät reicht, alles kommt über deinen Sync." });
      c.createDiv({ cls: "modal-button-container" }).createEl("button", { text: "Auch hier verbinden" }).addEventListener("click", () => {
        this.close();
        ctx.aktion("verbinden", v.art === "konto" ? { id: "ilias", fuer: "alma", auch: "1" } : { id: v.id, auch: "1" });
      });
    }
    onClose() { this.contentEl.empty(); if (fenster === this) fenster = null; }
  }

  // Link eingeben, prüfen, verbinden, sofort importieren, Ergebnis zeigen. Mit gespeichertem Uni-Login (seit 0.4.8, uni-login.js)
  // statt dessen: ein Satz mit deinem Benutzernamen und Verbinden, Studium Autopilot holt den Link selbst; geht das nicht, das
  // Fenster zum Einfügen mit dem Grund darüber. Ohne Uni-Login darunter leise „Mit Uni-Login verbinden“ (öffnet die Anmeldung,
  // die alles verbindet).
  class VerbindenFenster extends Modal {
    constructor(v) { super(app); this.v = v; this.laeuft = false; this.vonHand = false; this.grund = ""; }
    onOpen() {
      const v = this.v, c = this.contentEl;
      this.modalEl.addClass("eba-modal", "eba-modal-verbinden");
      this.titleEl.setText(`${v.name} verbinden`);
      const U = uni();
      if (!this.vonHand && U && U.kannSelbst(v.id)) { this.selbstZeigen(U); return; }
      if (v.kurz) fett(c.createEl("p", { cls: "eba-modal-text" }), v.kurz);
      schritteZeigen(c, v);
      const feld = c.createEl("input", { type: "text", cls: "eba-modal-feld", attr: { inputmode: "url", placeholder: v.platzhalter || "https://…", autocomplete: "off", autocapitalize: "off", spellcheck: "false", "aria-label": "Link" } });
      const meldung = c.createEl("p", { cls: "eba-modal-meldung" });
      mehrZeigen(c, v.erklaerung);
      // Ohne Uni-Login auf diesem Gerät: der schnellere Weg, leise (nur wo die Anmeldung hier möglich ist)
      if (U && !U.bereit() && uniAnmeldungHier()) {
        const p = c.createEl("p", { cls: "eba-modal-hinweis" });
        p.appendText("Ohne Kopieren: ");
        p.createEl("a", { text: "Mit Uni-Login verbinden", href: ctx.link("verbinden", { id: "ilias" }) }).addEventListener("click", () => this.close());
      }
      const k = c.createDiv({ cls: "modal-button-container" });
      const los = k.createEl("button", { text: "Verbinden", cls: "mod-cta" });
      const ab = k.createEl("button", { text: "Abbrechen" });
      this.feld = feld; this.meldung = meldung; this.los = los;
      const zeigen = (text, art) => { meldung.setText(text || ""); meldung.className = "eba-modal-meldung" + (art ? " " + art : ""); };
      if (this.grund) zeigen(`${this.grund} Du kannst den Link auch selbst einfügen.`, "fehler");
      feld.addEventListener("input", () => { if (meldung.hasClass("fehler")) zeigen(""); });
      const senden = async () => {
        if (this.laeuft) return;
        const link = feld.value.trim();
        const fehler = v.pruefen ? v.pruefen(link) : "";
        if (fehler) { zeigen(fehler, "fehler"); feld.focus(); return; }
        this.laeuft = true; los.disabled = true; los.setText("Verbinde …"); zeigen(v.laedt, "");
        let r;
        try { r = await v.verbinden(link); } catch (e) { r = { ok: false, fehler: (e && e.message) || String(e) }; }
        this.laeuft = false;
        if (!r || !r.ok) { los.disabled = false; los.setText("Verbinden"); zeigen((r && r.fehler) || "Das hat nicht geklappt. Bitte noch einmal versuchen.", "fehler"); return; }
        this.erfolg(r);
      };
      this.senden = senden;
      los.addEventListener("click", senden);
      ab.addEventListener("click", () => this.close());
      feld.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); senden(); } });
      setTimeout(() => feld.focus(), 30);
    }
    // Mit Uni-Login: kein Link nötig. Scheitert es, das Fenster zum Einfügen mit dem Grund (vonHand)
    selbstZeigen(U) {
      const v = this.v, c = this.contentEl;
      if (v.kurz) fett(c.createEl("p", { cls: "eba-modal-text" }), v.kurz);
      // Wo es sich anmeldet, steht vor dem Tipp; der Tipp gilt als Zustimmung für diese Quelle (uni-login.js zustimmen)
      const p = c.createEl("p", { cls: "eba-modal-text" });
      p.appendText("Studium Autopilot meldet sich mit deinem Uni-Login ");
      p.createEl("b", { text: uniBenutzer() });
      p.appendText(` bei ${v.id === "alma" ? "Alma" : "ILIAS"} an und holt den Link selbst.`);
      const meldung = c.createEl("p", { cls: "eba-modal-meldung" });
      // Ausweg: den Link selbst einfügen (z. B. eben in ILIAS bzw. Alma kopiert)
      const selbst = c.createEl("p", { cls: "eba-modal-hinweis" }).createEl("a", { text: "Link selbst einfügen", href: "#" });
      selbst.addEventListener("click", (e) => { e.preventDefault(); if (this.laeuft) return; this.vonHand = true; this.grund = ""; this.contentEl.empty(); this.onOpen(); });
      const k = c.createDiv({ cls: "modal-button-container" });
      const los = k.createEl("button", { text: "Verbinden", cls: "mod-cta" });
      k.createEl("button", { text: "Abbrechen" }).addEventListener("click", () => this.close());
      const senden = async () => {
        if (this.laeuft) return;
        this.laeuft = true; los.disabled = true; los.setText("Verbinde …"); meldung.setText(v.laedt || "");
        U.zustimmen([v.id]);
        const r = await U.verbinden(v.id);
        this.laeuft = false;
        if (fenster !== this) { if (r.ok) { ctx.hinweis(`${v.name} verbunden${r.text ? " – " + r.text : "."}`); neuZeichnen(); } return; }
        // Kommt die Quelle inzwischen von außen (eigener Uni-Abgleich per Sync), nicht zum Einfügen auffordern: nur der Satz
        if (!r.ok && r.art === "extern") { los.setText("Verbinden"); meldung.setText(r.fehler || ""); meldung.addClass("fehler"); return; }
        if (!r.ok) { this.vonHand = true; this.grund = r.fehler || ""; this.contentEl.empty(); this.onOpen(); return; }
        this.erfolg(r);
      };
      this.senden = senden;
      los.addEventListener("click", senden);
    }
    // Erfolg: Fenster zeigt das Ergebnis, Eingabe weg
    erfolg(r) {
      const v = this.v, c = this.contentEl;
      c.empty();
      c.createEl("p", { cls: "eba-modal-erfolg", text: `✓ Verbunden${r.text ? " – " + r.text : "."}` });
      c.createEl("p", { cls: "eba-modal-hinweis", text: v.danach });
      const k2 = c.createDiv({ cls: "modal-button-container" });
      k2.createEl("button", { text: "Fertig", cls: "mod-cta" }).addEventListener("click", () => this.close());
      ctx.hinweis(`${v.name} verbunden${r.text ? " – " + r.text : "."}`);
      neuZeichnen();
    }
    onClose() { this.contentEl.empty(); if (fenster === this) fenster = null; }
  }

  // ILIAS-Unterlagen (seit 0.4.0): ein Fenster für alles; zeigen() zeichnet es je nach Stand neu.
  //   Nicht verbunden oder Anmeldung abgelehnt: Satz, Schritte, Benutzername, Passwort, Datenschutz-Zeile, Meldung, Verbinden.
  //   Verbunden: Stand, Kurse mit Schaltern, Aktualisieren (bzw. Hier aktualisieren), Trennen. Während eines Abrufs statt dessen der
  //   Fortschritt („Lädt 12 von 40“), ein Satz, dass das Fenster zu darf, Obsidian aber offen bleiben muss (iPhone/iPad halten
  //   es im Hintergrund an; beim nächsten Öffnen geht es weiter), Schließen und Stoppen.
  //   Nach dem ersten Verbinden startet der erste Abruf gleich (wie Aktualisieren), wenn ein Kurs an ist.
  //   Eigener Uni-Abgleich: nicht verbunden (oder Anmeldung abgelehnt) gleich die Anmeldung, nur für die Übungsgruppen (eigene
  //   Texte, keine Schritte); nach dem Verbinden schließt das Fenster, die Prüfung läuft mit Hinweis. Verbunden: Stand, Jetzt
  //   prüfen, Trennen (die Zeile bietet beides selbst, das Fenster nur über die Aktion verbinden).
  //   Obsidian zu alt (kein Schlüsselbund) oder Anmeldebaustein fehlt: nur ein Satz, kein Knopf.
  // Passwort – steht nur im Feld (type=password). zugangSpeichern bekommt eine Funktion, die das Feld beim Senden liest, prüft
  // den Zugang mit einer Anmeldung und speichert nur bei Erfolg; danach wird das Feld geleert (auch bei Fehler). Die Hinweise
  // aus ilias.js (falsches Passwort, Zustimmungsseite, Zwei-Faktor) stehen wörtlich in der Meldung. Kein Autofokus auf
  // iPhone/iPad (sonst springt die Tastatur auf). Kurstitel (können Einschreibepasswörter enthalten) nur hier und in der Zeile,
  // nie in Hinweisen oder in der Konsole.
  class IliasFenster extends Modal {
    // o.alleAus: aus der Zeile „Noten & Anmeldungen“ (nur der Uni-Zugang ist gewollt): nach dem Verbinden alle Kurse aus, kein
    // erster Abruf, ein Satz dazu
    // weitere: Stand von ILIAS-Kalender und Alma nach der Anmeldung in diesem Fenster (uniWeiter), weitereEl: ihre Zeilen
    constructor(v, o) { super(app); this.v = v; this.alleAus = !!(o && o.alleAus); this.verbindet = false; this.ansicht = ""; this.meldung = null; this.felder = null; this.weg = null; this.gefunden = null; this.weitere = null; this.weitereEl = null; }
    onOpen() {
      this.modalEl.addClass("eba-modal", "eba-modal-verbinden", "eba-modal-ilias");
      // Abruf (auch ein automatischer), während das Fenster offen ist: Fortschritt zeigen, an Start und Ende neu zeichnen
      if (ctx.ilias && ctx.ilias.beobachten) this.weg = ctx.ilias.beobachten((x) => this.ereignis(x));
      this.zeigen();
    }
    onClose() { if (this.weg) this.weg(); this.weg = null; this.felder = null; this.contentEl.empty(); if (fenster === this) fenster = null; }
    offen() { return fenster === this; }
    ereignis(x) {
      if (!x || !this.offen()) return;
      if (x.art === "fortschritt") { if (this.ansicht === "verwalten" || this.verbindet) this.melden(x.text || "", ""); return; }
      if ((x.art === "start" || x.art === "fertig") && (this.ansicht === "verwalten" || this.ansicht === "gruppen") && !this.verbindet) this.zeigen();
    }
    melden(text, art) { if (!this.meldung) return; this.meldung.setText(text || ""); this.meldung.className = "eba-modal-meldung" + (art ? " " + art : ""); }
    zeigen() {
      const s = this.v.status();
      this.contentEl.empty();
      this.meldung = null; this.felder = null; this.weitereEl = null;
      if (iliasOhneAnmeldung(s) || !ctx.ilias.kannSpeichern() || (s.extern && s.gruppenExtern)) this.infoZeigen(s);
      else if (s.extern) { if (!s.gruppenZugang || s.gesperrt) this.anmeldenZeigen(s); else this.gruppenZeigen(s); }
      else if (!s.verbunden || s.gesperrt) this.anmeldenZeigen(s);
      else this.verwaltenZeigen(s);
    }
    knoepfe() { return this.contentEl.createDiv({ cls: "modal-button-container" }); }
    // Ein Satz, kein Knopf (schließen über ×): Anmeldebaustein fehlt oder Obsidian zu alt (im eigenen Uni-Abgleich: dessen Satz)
    infoZeigen(s) {
      this.ansicht = "info";
      this.titleEl.setText(this.v.name);
      const text = iliasOhneAnmeldung(s) ? (/[.…]$/.test(s.text) ? s.text : `${s.text}.`)
        : s.extern ? ctx.ilias.K.TEXT_EXTERN : "Dafür braucht Obsidian Version 1.11.4 oder neuer. Bitte Obsidian aktualisieren.";
      this.contentEl.createEl("p", { cls: "eba-modal-text", text });
    }
    // Eigener Uni-Abgleich, für die Übungsgruppen verbunden: Stand, Aktualisieren, Trennen
    gruppenZeigen(s) {
      const c = this.contentEl;
      this.ansicht = "gruppen";
      this.titleEl.setText(this.v.name);
      c.createEl("p", { cls: "eba-modal-marke" }).innerHTML = `<span class="eba-pill ok">verbunden</span>`;
      c.createEl("p", { cls: "eba-modal-text", text: [s.text, s.benutzer ? `Angemeldet als ${s.benutzer}.` : ""].filter(Boolean).join(" ") });
      const k = this.knoepfe();
      if (!s.laeuft) k.createEl("button", { text: WORT.knopf, cls: "mod-cta" }).addEventListener("click", () => { ctx.ilias.jetztHolen().catch(() => null); });
      k.createEl("button", { text: "Trennen", cls: "mod-warning" }).addEventListener("click", () => { this.close(); ctx.aktion("trennen", { id: this.v.id }); });
    }
    anmeldenZeigen(s) {
      const v = this.v, c = this.contentEl;
      this.ansicht = "anmelden";
      this.titleEl.setText(v.anmeldenTitel || `${v.name} verbinden`);
      const ohneKurse = !!(this.alleAus && !s.extern && v.kurzOhneKurse);
      fett(c.createEl("p", { cls: "eba-modal-text" }), ohneKurse ? v.kurzOhneKurse : v.kurz);
      // Aus Noten & Anmeldungen bleiben die Kurse aus: dann ohne die Schritte, die Dateien und Kurse versprechen
      if (!ohneKurse) schritteZeigen(c, v);
      const form = c.createDiv({ cls: "eba-modal-zugang" });
      const zeile = (text) => { const l = form.createEl("label", { cls: "eba-modal-zeile" }); l.createSpan({ cls: "eba-modal-label", text }); return l; };
      const benutzer = zeile("Benutzername").createEl("input", { type: "text", cls: "eba-modal-feld", attr: { placeholder: "z. B. zxabc01", autocomplete: "off", autocapitalize: "off", autocorrect: "off", spellcheck: "false", enterkeyhint: "next" } });
      benutzer.value = s.benutzer || "";
      const geheimFeld = zeile("Passwort").createEl("input", { type: "password", cls: "eba-modal-feld", attr: { autocomplete: "off", enterkeyhint: "go" } });
      const schutz = c.createEl("p", { cls: "eba-modal-datenschutz" });
      schutz.innerHTML = svg("schloss");
      schutz.createSpan({ text: v.datenschutz });
      this.meldung = c.createEl("p", { cls: "eba-modal-meldung" });
      // Anmeldung abgelehnt (falsches Passwort, Zustimmungsseite, Zwei-Faktor): den Hinweis gleich zeigen
      const angemeldet = !!(s.verbunden || s.gruppenZugang);
      if (angemeldet && s.gesperrt) this.melden(s.text, "fehler");
      mehrZeigen(c, v.erklaerung);
      const k = this.knoepfe();
      const los = k.createEl("button", { text: "Verbinden", cls: "mod-cta" });
      if (angemeldet) k.createEl("button", { text: "Trennen", cls: "mod-warning" }).addEventListener("click", () => { this.close(); ctx.aktion("trennen", { id: v.id }); });
      else k.createEl("button", { text: "Abbrechen" }).addEventListener("click", () => this.close());
      this.felder = { benutzer, geheimFeld, los };
      const leeren = () => { if (this.meldung && this.meldung.hasClass("fehler")) this.melden("", ""); };
      benutzer.addEventListener("input", leeren);
      geheimFeld.addEventListener("input", leeren);
      benutzer.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); geheimFeld.focus(); } });
      geheimFeld.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); this.senden(); } });
      los.addEventListener("click", () => this.senden());
      if (!mobil) setTimeout(() => { if (this.felder) (benutzer.value ? geheimFeld : benutzer).focus(); }, 30);
    }
    // Verbinden: Zugang prüfen und speichern, dann die Kursliste holen (ohne Downloads) und die Kurse zeigen
    async senden() {
      const f = this.felder;
      if (this.verbindet || !f) return;
      const name = f.benutzer.value.trim();
      if (!name) { this.melden("Bitte deinen Benutzernamen eingeben.", "fehler"); return; }
      if (!f.geheimFeld.value) { this.melden("Bitte dein Passwort eingeben.", "fehler"); return; }
      this.verbindet = true; f.los.disabled = true; f.los.setText("Verbinde …");
      this.melden("Verbinde mit ILIAS …", "");
      let r = null;
      try { r = await ctx.ilias.zugangSpeichern(name, () => f.geheimFeld.value, { pruefen: true }); } catch (e) { r = null; }
      f.geheimFeld.value = "";
      if (!r || !r.ok) {
        this.verbindet = false; f.los.disabled = false; f.los.setText("Verbinden");
        this.melden((r && r.fehler) || "Das hat nicht geklappt. Bitte noch einmal versuchen.", "fehler");
        if (!mobil && this.felder === f) f.geheimFeld.focus();
        return;
      }
      // Eigener Uni-Abgleich: keine Kursliste; Fenster zu, die Prüfung der Gruppen zeigt Fortschritt und Ergebnis als Hinweis.
      // Kalender und Alma nicht von selbst (das Fenster nannte sie nicht); dort geht ein Tipp auf Verbinden.
      if (this.v.status().extern) {
        this.verbindet = false;
        ctx.ilias.jetztHolen().catch(() => null);
        neuZeichnen();
        this.close();
        return;
      }
      this.melden("Lese deine Kurse …", "");
      let liste = null;
      try { liste = await ctx.ilias.kurseAbrufen({ alleAus: this.alleAus }); } catch (e) { liste = null; }
      this.verbindet = false;
      ctx.hinweis(`${this.v.name} verbunden.`);
      this.gefunden = Array.isArray(liste) ? liste.length : 0;
      // erster Abruf gleich, im Hintergrund (Hinweis mit Fortschritt; das Fenster darf zu); aus der Alma-Zeile nicht
      if (!this.alleAus && Array.isArray(liste) && liste.some((k) => k.aktiv)) ctx.ilias.jetztHolen().catch(() => null);
      // Uni-Login: ILIAS-Kalender und Alma gleich mit (Zeilen im Fenster; ist es zu, das Ergebnis als Hinweis)
      this.weitere = {};
      uniWeiter((st) => { this.weitere = Object.assign({}, st); if (this.offen() && this.weitereEl) uniStandZeigen(this.weitereEl, this.weitere); })
        .then((text) => { if (!this.offen() && text) ctx.hinweis(text); });
      neuZeichnen();
      if (!this.offen()) return;
      this.contentEl.empty();
      this.meldung = null; this.felder = null;
      this.verwaltenZeigen(this.v.status(), Array.isArray(liste) ? liste : null);
    }
    verwaltenZeigen(s, liste) {
      const v = this.v, c = this.contentEl;
      this.ansicht = "verwalten";
      this.titleEl.setText(v.name);
      c.createEl("p", { cls: "eba-modal-marke" }).innerHTML = `<span class="eba-pill ok">verbunden</span>`;
      if (this.gefunden != null) {
        const n = this.gefunden;
        c.createEl("p", { cls: "eba-modal-erfolg", text: `✓ Verbunden${n ? ` – ${n} ${n === 1 ? "Kurs" : "Kurse"} gefunden.` : "."}` });
        if (this.alleAus) c.createEl("p", { cls: "eba-modal-hinweis", text: "Deine Kurse sind aus. Schalte sie an, wenn du Dateien willst." });
      }
      if (this.weitere) { this.weitereEl = c.createDiv({ cls: "eba-modal-uni" }); uniStandZeigen(this.weitereEl, this.weitere); }
      c.createEl("p", { cls: "eba-modal-text", text: [s.laeuft ? "" : iliasText(s), s.benutzer ? `Angemeldet als ${s.benutzer}.` : ""].filter(Boolean).join(" ") });
      this.meldung = c.createEl("p", { cls: "eba-modal-meldung" });
      if (s.laeuft) {
        this.melden(s.text, "");
        c.createEl("p", { cls: "eba-modal-hinweis", text: `Du kannst das Fenster schließen. Lass Obsidian dabei ${mobil ? "im Vordergrund" : "offen"}, sonst pausiert der Abruf bis zum nächsten Öffnen.` });
      }
      c.createEl("p", { cls: "eba-modal-abschnitt", text: "Deine Kurse" });
      const box = c.createDiv({ cls: "eba-modal-schalter eba-modal-kurse" });
      const kurseZeigen = (l) => {
        box.empty();
        if (!l || !l.length) { fett(box.createEl("p", { cls: "eba-modal-leer" }), "Noch keine Kurse. **Aktualisieren** liest sie aus ILIAS."); return; }
        for (const k of l) {
          const n = k.dateien;
          new ctx.obsidian.Setting(box).setName(k.titel).setDesc([k.code || "ohne Modul", n ? `${n} ${n === 1 ? "Datei" : "Dateien"}` : ""].filter(Boolean).join(" · "))
            .addToggle((t) => t.setValue(!!k.aktiv).onChange(async (an) => {
              try { await ctx.ilias.kursSetzen(k.refId, an); } catch (e) { ctx.hinweis("Das hat nicht geklappt. Bitte noch einmal versuchen."); }
            }));
        }
      };
      if (liste) kurseZeigen(liste);
      else ctx.ilias.kurse().then((l) => { if (this.offen()) kurseZeigen(l); }, () => kurseZeigen([]));
      mehrZeigen(c, v.erklaerung);
      const k = this.knoepfe();
      // Läuft ein Abruf: Schließen und Stoppen (das Ende zeichnet das Fenster über ereignis() neu, den Hinweis zeigt ilias.js)
      if (s.laeuft) {
        k.createEl("button", { text: "Schließen", cls: "mod-cta" }).addEventListener("click", () => this.close());
        k.createEl("button", { text: "Stoppen" }).addEventListener("click", () => ctx.ilias.stoppen());
        return;
      }
      const los = k.createEl("button", { text: s.anderes ? WORT.hier : WORT.knopf, cls: "mod-cta" });
      k.createEl("button", { text: "Trennen", cls: "mod-warning" }).addEventListener("click", () => { this.close(); ctx.aktion("trennen", { id: v.id }); });
      // Start zeichnet das Fenster über ereignis() neu (Fortschritt, Schließen, Stoppen)
      los.addEventListener("click", () => { ctx.ilias.jetztHolen({ uebernehmen: !!s.anderes }).catch(() => null); });
    }
  }

  // Uni-Login (seit 0.4.8): Stand wie in der Zeile, je Quelle ihr Stand und ein Schalter „auf diesem Gerät“ (an: das Fenster der
  // Quelle zum Verbinden, aus: Trennen mit Rückfrage), „Link selbst einfügen“ ohne Passwort, „Kurse“ bei ILIAS; Noten & Anmeldungen
  // schaltet man in seinem eigenen Fenster. Trennen trennt alles auf diesem Gerät.
  class UniFenster extends Modal {
    constructor(v) { super(app); this.v = v; }
    onOpen() {
      const v = this.v, c = this.contentEl, z = uniZeile(v), b = uniBenutzer(), teile = uniTeile();
      this.modalEl.addClass("eba-modal", "eba-modal-verbinden");
      this.titleEl.setText(v.name);
      if (z.pille) c.createEl("p", { cls: "eba-modal-marke" }).innerHTML = z.pille;
      c.createEl("p", { cls: "eba-modal-text", text: [z.text, b ? `Angemeldet als ${b}.` : ""].filter(Boolean).join(" ") });
      const box = c.createDiv({ cls: "eba-modal-schalter" });
      const weiter = (fn) => () => { this.close(); fn(); };
      for (const x of teile) {
        const q = x.v, zq = statusZeile(q) || { text: "" }, ext = !!x.s.extern || x.s.art === "extern";
        const zeile = new ctx.obsidian.Setting(box).setName(q.name).setDesc(q.art === "konto" || !(zq.zu || zq.symbol === "aus") ? zq.text : "Nicht verbunden.");
        if (q.art === "konto") { zeile.addButton((k) => k.setButtonText("Mehr erfahren").onClick(weiter(() => fensterOeffnen(q)))); continue; }
        if (!ext || x.hier) zeile.addToggle((t) => t.setValue(x.hier).onChange(weiter(() => (x.hier ? ctx.aktion("trennen", { id: q.id }) : fensterOeffnen(q, { auch: "1" })))));
        if (q.art === "link" && !ext) zeile.addButton((k) => k.setButtonText("Link selbst einfügen").onClick(weiter(() => { const m = new VerbindenFenster(q); m.vonHand = true; fenster = m; m.open(); })));
        if (q.id === "ilias" && x.s.verbunden) zeile.addButton((k) => k.setButtonText("Kurse").onClick(weiter(() => fensterOeffnen(q))));
      }
      mehrZeigen(c, "Ein Gerät reicht, alles kommt über deinen Sync auf die anderen.");
      const k = c.createDiv({ cls: "modal-button-container" });
      if (teile.some((x) => x.hier)) k.createEl("button", { text: "Trennen", cls: "mod-warning" }).addEventListener("click", weiter(() => ctx.aktion("trennen", { id: v.id })));
      zeilenKnopf(this, v, k);
      if (!k.childElementCount) k.remove();
    }
    onClose() { this.contentEl.empty(); if (fenster === this) fenster = null; }
  }

  let fenster = null; // offenes Fenster (für Tests: ctx.verbindungen.fenster)
  // p: Parameter der Aktion (ILIAS mit fuer=alma: aus der Zeile „Noten & Anmeldungen“, danach sind alle Kurse aus)
  const fensterOeffnen = (v, p) => {
    // Alma bzw. ILIAS-Kalender im eigenen Uni-Abgleich ohne Link: nichts zu verbinden (der Abgleich bringt die Daten), nur der Satz
    if (v.art === "link") { const s = v.status(); if (s.extern && !s.verbunden) { ctx.hinweis(v.externText); return null; } }
    // Über ein anderes Gerät verbunden: erst der Stand; „Auch hier verbinden“ (auch=1) öffnet das Verbinden
    if (!(p && (p.auch === true || p.auch === "1")) && anderswo(v, v.status())) { const a = new AnderswoFenster(v); fenster = a; a.open(); return a; }
    if (v.art === "konto") { const k = ctx.almaKonto ? ctx.almaKonto.fensterOeffnen() : null; fenster = k; return k; }
    const m = v.art === "uni" ? new UniFenster(v) : v.art === "anmeldung" ? new IliasFenster(v, { alleAus: !!(p && p.fuer === "alma") }) : v.art !== "link" ? new InfoFenster(v) : v.status().verbunden ? new VerwaltenFenster(v) : new VerbindenFenster(v);
    fenster = m;
    m.open();
    return m;
  };

  // ---------- Zeichnen ----------
  const knopf = (aktion, id, text, art) => `<a class="eba-vb-knopf${art ? " " + art : ""}" href="${ctx.link(aktion, { id })}">${esc(text)}</a>`;

  // Beispielwoche hinter dem Schloss: gleiche Klassen wie das echte Raster (Stundenplan.md, formula.karte), damit sie auf jedem
  // Gerät genauso aussieht; CSS graut sie aus. [Tag 1–5, Beginn, Ende, Vorlesung?, Titel]
  const BEISPIEL = [[1, 10, 12, 1, "Mathematik"], [1, 14, 16, 0, "Statistik"], [2, 8, 10, 0, "Buchführung"], [2, 10, 12, 1, "VWL"],
    [3, 8, 10, 0, "VWL"], [3, 12, 14, 1, "BWL"], [4, 10, 12, 1, "Statistik"], [4, 14, 16, 0, "Mathematik"], [5, 10, 12, 1, "Buchführung"]];
  const beispielWoche = () => {
    const h0 = 8, h1 = 18, z = (h) => (h - h0) * 4 + 2;
    let html = `<div class="eba-woche" style="grid-template-rows:34px repeat(${(h1 - h0) * 4 + 1}, var(--eba-zeile))">`
      + `<div class="eba-tagkopf eba-ecke" style="grid-column:1"></div>`
      + ["Mo", "Di", "Mi", "Do", "Fr"].map((t, i) => `<div class="eba-tagkopf" style="grid-column:${i + 2}">${t}</div>`).join("");
    for (let h = h0; h <= h1; h += 2) html += `<span class="eba-zeit" style="grid-row:${z(h)}">${h < 10 ? "0" : ""}${h}</span><i class="eba-linie" style="grid-row:${z(h)}"></i>`;
    for (const [tag, b, e, vl, titel] of BEISPIEL) {
      const zeit = `${b < 10 ? "0" : ""}${b}:00–${e}:00`;
      html += `<span class="eba-ev ${vl ? "vl" : "ue"}" style="grid-column:${tag + 1};grid-row:${z(b)} / ${z(e)}"><b>${titel} · ${vl ? "Vorlesung" : "Übung"}</b>`
        + `<span>${zeit} · Hörsaal</span><em class="eba-ev-kurz">${titel}</em><small class="eba-ev-raum">Hörsaal</small></span>`;
    }
    return html + "</div>";
  };

  // Schloss-Karte in el (für ```eba-schloss <id>``` und für andere Skripte). Rückgabe: gesperrt?
  const schlossKarte = (el, id) => {
    const v = holen(id);
    el.empty();
    if (!v) { el.setText(`Unbekannte Verbindung „${id}“.`); return false; }
    const zu = v.gesperrt();
    el.toggleClass("eba-schloss-zu", zu);
    if (!zu) return false;
    if (v.vorschau === "woche") {
      const karte = el.createDiv({ cls: "eba-schloss mit-vorschau" });
      karte.innerHTML = `<div class="eba-schloss-vorschau" aria-hidden="true">${beispielWoche()}</div>`
        + `<div class="eba-schloss-auflage"><span class="eba-schloss-symbol" aria-hidden="true">${svg("schloss")}</span>`
        + `<span class="eba-schloss-text"><b>${esc(v.anreiz || v.name)}</b><span>${esc(v.satz)}</span></span>`
        + knopf("verbinden", v.id, `${v.name.split("-")[0]} verbinden`, "cta") + `</div>`;
      return true;
    }
    const karte = el.createDiv({ cls: "eba-schloss" });
    const eingabe = v.art === "link" || v.art === "anmeldung";
    karte.innerHTML = `<span class="eba-schloss-symbol" aria-hidden="true">${svg("schloss")}</span>`
      + `<span class="eba-schloss-text"><b>${esc(v.name)}</b><span>${esc(v.satz)}</span></span>`
      + knopf("verbinden", v.id, v.schlossKnopf || (eingabe ? "Verbinden" : "Mehr erfahren"), "cta");
    return true;
  };

  // Zeile je Verbindung: { zu, text | html, pille, symbol (SYMBOLE), ton (Farbe: ok | warn | leise), knopf (HTML, höchstens
  // einer), link (Textlink im Status: „Mehr erfahren“ ins Fenster bzw. „Trennen“) }. Regeln im Kopf („Zeilen“).
  const PILLE = {
    an: `<span class="eba-pill ok">verbunden</span>`,
    nicht: `<span class="eba-pill leer">nicht verbunden</span>`,
    pruefen: `<span class="eba-pill warn">neu verbinden</span>`,
  };
  const textLink = (aktion, id, text) => `<a class="eba-vb-mehr" href="${ctx.link(aktion, { id })}">${esc(text)}</a>`;
  const mehrLink = (id) => textLink("verbinden", id, "Mehr erfahren");
  const tonVon = (symbol) => (symbol === "haken" ? "ok" : symbol === "warnung" ? "warn" : "leise");

  // ---------- Kompakte Zeile (Einstellungen & Hilfe, seit 24.10.2026) ----------
  // Wie die Einstellungen von iPhone und iPad, auf allen Geräten gleich: Symbol, Name, rechts ein kurzer Stand und der Pfeil; die
  // ganze Zeile öffnet das Fenster der Verbindung, ihr Knopf steht dort (zeilenKnopf). Der Stand ist ein Wort, damit er auch
  // auf dem iPhone mit großer Schrift neben dem Namen Platz hat (Name und Stand zusammen höchstens 24 Zeichen, Test); bis
  // 24.10.2026 rutschten „Nicht verbunden“ und „Neue Version“ unter den Namen. Abgeleitet aus statusZeile (st):
  //   wert: st.kurz, sonst die Pille in Worten (KURZ_PILLE), sonst das Symbol (KURZ_SYMBOL; Haken: „An“ bei einem Schalter wie
  //   Zentrale Daten, sonst „Verbunden“; nicht verbunden „Aus“), bei einem Problem immer „Fehler“; art: „warn“ bei einem
  //   Problem (Warnsymbol), „akzent“, wenn etwas auf dich wartet (Ton warn ohne Problem: neue Version, Neu laden); unter (seit
  //   24.10.2026 immer, damit auch Neue verstehen, wozu die Zeile da ist): bei einem Problem st.unter oder der Satz der Zeile,
  //   sonst st.unter oder v.beschreibung; symbol: das der Sache (v.symbol), ton: seine Farbe (art, sonst ok bei Ton ok, sonst
  //   leise); ziel: der Knopf, wenn er selbst ein Fenster öffnet (Verbinden, Einschalten), sonst „Mehr erfahren“, sonst das
  //   Fenster der Verbindung. Rein (tests/verbindungen.test.js).
  const KURZ_PILLE = { verbunden: "Verbunden", "nicht verbunden": "Aus", an: "An", aus: "Aus",
    pausiert: "Pausiert", fehler: "Fehler", neu: "Neue Version", "neu laden": "Neu laden", "läuft": "Läuft …", unterbrochen: "Unterbrochen" };
  const KURZ_SYMBOL = { aus: "Aus", schloss: "Aus", extern: "Aus", uhr: "Läuft …", pause: "Pausiert" };
  const SCHALTER = ["zentral", "volltext"]; // man schaltet sie an und aus, statt sie zu verbinden
  const ENTITAETEN = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'" };
  const nurText = (html) => String(html || "").replace(/<[^>]*>/g, "").replace(/&(amp|lt|gt|quot|#39);/g, (e) => ENTITAETEN[e]).replace(/\s+/g, " ").trim();
  const hrefVon = (html) => { const m = /href="([^"]*)"/.exec(html || ""); return m ? m[1].replace(/&amp;/g, "&") : ""; };
  const aktionVon = (href) => { const m = /[?&]aktion=([^&]*)/.exec(href || ""); return m ? decodeURIComponent(m[1]) : ""; };
  const kompakt = (v, st) => {
    const pille = nurText(st.pille).toLowerCase(), problem = st.symbol === "warnung";
    const haken = st.symbol === "haken" ? (SCHALTER.indexOf(v.art) >= 0 ? "An" : "Verbunden") : "";
    const w = st.kurz != null ? st.kurz : KURZ_PILLE[pille] || haken || KURZ_SYMBOL[st.symbol] || "";
    const wert = problem ? "Fehler" : w;
    const art = problem ? "warn" : st.ton === "warn" ? "akzent" : "";
    const unter = problem ? st.unter || nurText(st.html != null ? st.html : esc(st.text)) : st.unter || v.beschreibung || "";
    const knopfZiel = hrefVon(st.knopf), linkZiel = hrefVon(st.link);
    const ziel = aktionVon(knopfZiel) === "verbinden" ? knopfZiel : aktionVon(linkZiel) === "verbinden" ? linkZiel : ctx.link("verbinden", { id: v.id });
    return { wert, art, unter, symbol: v.symbol || st.symbol, ton: art || (st.ton === "ok" ? "ok" : "leise"), ziel };
  };

  // ---------- Stand einer Quelle: EINE Formatierung (Quellen-Vertrag) ----------
  // Wörter an einer Stelle (Entscheidung E1: Daten holt man mit „Aktualisieren“; die Wortliste übernimmt sie, sobald es sie gibt)
  const WORT = Object.freeze({
    knopf: "Aktualisieren", hier: "Hier aktualisieren", aktualisiert: "Aktualisiert", zuletzt: "Zuletzt aktualisiert",
    nie: "Noch nicht aktualisiert.", laeuft: "Aktualisiert gerade …", anderes: "Ein anderes Gerät aktualisiert, alles kommt über deinen Sync.",
  });
  const vor = (iso) => { const Q = ctx.user && ctx.user.quellen; return Q ? Q.vorText(iso, Date.now()) : ""; };
  // s = { zustand, geprueft, fehler, fehlerZeit, warnungen } → { text, symbol, ton }. Fehler: „<Satz> Zuletzt aktualisiert …“
  // (Warnsymbol); ein anderes Gerät aktualisiert: ein Satz; sonst „Aktualisiert vor 5 Min.“ bzw. „Noch nicht aktualisiert.“ und
  // die Warnungen des letzten Laufs dahinter (Warnsymbol).
  const standText = (s) => {
    s = s || {};
    const bis = s.geprueft ? vor(s.geprueft) : "";
    if (s.zustand === "laeuft") return { text: WORT.laeuft, symbol: "uhr", ton: "leise" };
    if (s.fehler) return { text: (s.fehler + (bis ? ` ${WORT.zuletzt} ${bis}.` : "")).replace(/\.\./g, "."), symbol: "warnung", ton: "warn" };
    if (s.zustand === "anderes-geraet") return { text: WORT.anderes, symbol: "haken", ton: "ok" };
    const w = (Array.isArray(s.warnungen) ? s.warnungen : []).join(" ");
    const text = ((bis ? `${WORT.aktualisiert} ${bis}.` : WORT.nie) + (w ? " " + w : "")).replace(/\.\./g, ".");
    return { text, symbol: w ? "warnung" : "haken", ton: w ? "warn" : "ok" };
  };
  // Knopf einer Quelle: Aktualisieren bzw. Hier aktualisieren (ein anderes Gerät schreibt gerade; der Knopf übernimmt)
  const aktualisierenKnopf = (id, hier, parameter) => `<a class="eba-vb-knopf cta" href="${ctx.link("verbindung-aktualisieren", Object.assign({ id }, hier ? parameter : {}))}">${esc(hier ? WORT.hier : WORT.knopf)}</a>`;

  // Über ein anderes Gerät verbunden (ortVon): „verbunden“, wann es zuletzt aktiv war, rechts nur „Mehr erfahren“ (Fenster mit
  // „Auch hier verbinden“); zusatz: Satz dahinter (ILIAS im eigenen Uni-Abgleich)
  const anderswoText = (o) => { const bis = vor(o.zuletzt); return `Verbunden über ein anderes Gerät${bis ? ` · aktualisiert ${bis}` : ""}.`.replace(/\.\./g, "."); };
  const anderswoZeile = (v, s, zusatz) => ({ zu: false, text: anderswoText(ortVon(v, s)) + (zusatz ? " " + zusatz : ""), pille: PILLE.an, symbol: "haken",
    ton: "ok", knopf: knopf("verbinden", v.id, "Mehr erfahren", ""), link: "" });

  const statusZeile = (v) => {
    if (v.art === "zentral") {
      if (!ctx.zentral) return { zu: false, text: "Wird geladen …", pille: `<span class="eba-pill leer">…</span>`, symbol: "uhr", ton: "leise", knopf: "", link: "" };
      const s = ctx.zentral.status();
      if (!s.an) return { zu: false, text: "Ausgeschaltet. Termine für alle kommen nicht mehr an.", pille: `<span class="eba-pill leer">aus</span>`, symbol: "aus", ton: "leise",
        knopf: `<a class="eba-vb-knopf cta" href="${ctx.link("zentral-schalter", { was: "daten", wert: "1" })}">Einschalten</a>`, link: mehrLink(v.id) };
      const t = s.pause ? { text: "Pausiert. Dein letzter Stand bleibt.", symbol: "pause", ton: "leise" } : standText(s);
      const pille = s.pause ? `<span class="eba-pill info">pausiert</span>` : s.fehler ? `<span class="eba-pill warn">Fehler</span>` : `<span class="eba-pill ok">an</span>`;
      let html = esc(t.text);
      if (s.hinweis) html += " " + esc(s.hinweis);
      // Mit update.js (seit 0.2.0) steht die neue Version in der eigenen Zeile „Updates“ mit Knopf
      if (s.neueVersion && !ctx.update) html += ` <a class="eba-vb-neu external-link" href="${esc(s.releases)}" target="_blank" rel="noopener">Neue Version verfügbar</a>`;
      return { zu: false, html, pille, symbol: t.symbol, ton: t.ton, knopf: knopf("zentral-aktualisieren", "", WORT.knopf, "cta"), link: mehrLink(v.id) };
    }
    if (v.art === "vorlage") {
      const mehr = knopf("verbinden", v.id, "Mehr erfahren", "");
      if (!ctx.update) return { zu: false, text: "Wird geladen …", pille: `<span class="eba-pill leer">…</span>`, symbol: "uhr", ton: "leise", knopf: mehr, link: "" };
      const a = ctx.update.anzeige();
      // cta: false (Nach Updates suchen) ist ein normaler Knopf; das Angebot, Neu laden und Update fertigstellen sind Hauptknöpfe
      const k = a.knopf ? `<a class="eba-vb-knopf${a.knopf.cta === false ? "" : " cta"}" href="${ctx.link(a.knopf.aktion, {})}">${esc(a.knopf.text)}</a>` : mehr;
      return { zu: false, html: a.html, kurz: a.kurz, pille: a.pille, symbol: a.symbol, ton: a.ton, knopf: k, link: a.knopf ? mehrLink(v.id) : "" };
    }
    if (v.art === "uni") return uniZeile(v);
    if (v.art === "server" || v.art === "claude") {
      const q = v.art === "server" ? ctx.server : ctx.claude;
      if (!q) return { zu: false, text: "Wird geladen …", pille: "", symbol: "uhr", ton: "leise", knopf: "", link: "" };
      return quelleZeile(q.zeile());
    }
    if (v.art === "anmeldung") return iliasZeile(v);
    if (v.art === "konto") {
      // „Braucht deinen Uni-Zugang“, aber ein anderes Gerät prüft schon: verbunden
      const s = ctx.almaKonto ? v.status() : null;
      if (s && s.art === "ohne-zugang" && anderswo(v, s)) return anderswoZeile(v, s);
      return quelleZeile(ctx.almaKonto ? ctx.almaKonto.zeile() : null);
    }
    if (v.art === "volltext") return volltextZeile(v);
    if (v.id === "ilias-kalender") return kalenderZeile(v);
    return almaZeile(v);
  };

  // Zeile, die eine Quelle selbst liefert (Noten & Anmeldungen: ctx.almaKonto.zeile(); auch ein eigener Server): z = { text, symbol,
  // pille: an | pruefen | "", knopf, link } oder null, hier nur als HTML. Knopf: Aktion mit Parametern oder externer Link (href,
  // „In Alma öffnen“). Den Stand formuliert die Quelle mit standText (ctx.verbindungen.standText).
  const quelleZeile = (z) => {
    if (!z) return null;
    const k = z.knopf;
    const knopfHtml = !k ? "" : k.href ? `<a class="eba-vb-knopf" href="${esc(k.href)}" target="_blank" rel="noopener">${esc(k.text)}</a>`
      : `<a class="eba-vb-knopf${k.cta ? " cta" : ""}" href="${ctx.link(k.aktion, k.parameter || {})}">${esc(k.text)}</a>`;
    const l = z.link;
    return { zu: false, text: z.text, pille: z.pille === "an" ? PILLE.an : z.pille === "pruefen" ? PILLE.pruefen : "", symbol: z.symbol, ton: tonVon(z.symbol),
      knopf: knopfHtml, link: l ? `<a class="eba-vb-mehr" href="${ctx.link(l.aktion, l.parameter || {})}">${esc(l.text)}</a>` : "" };
  };

  // Uni-Login (seit 0.4.8): „Verbunden · Unterlagen, Abgaben und Stundenplan · aktualisiert vor 5 Min.“ (nur, was verbunden ist;
  // Problem einer Quelle mit ihrem Namen dahinter), Aktualisieren, Rest im Fenster; nur über andere Geräte: „Verbunden über ein
  // anderes Gerät · …“; Passwort abgelehnt: neu verbinden; nichts verbunden: der Satz vor der Eingabe und „Mit Uni-Login verbinden“.
  // Eigener Uni-Abgleich (Unterlagen von außen): nur der Satz, was von dort kommt (Übungsgruppen auf diesem Gerät wie bisher).
  const undListe = (l) => (l.length > 1 ? `${l.slice(0, -1).join(", ")} und ${l[l.length - 1]}` : l[0] || "");
  const uniZeile = (v) => {
    const si = VERBINDUNGEN.ilias.status(), teile = uniTeile(), hier = teile.filter((x) => x.hier), mehr = mehrLink(v.id);
    if ((si.verbunden || si.gruppenZugang) && si.gesperrt) return { zu: false, text: si.text, pille: PILLE.pruefen, symbol: "warnung", ton: "warn", knopf: knopf("verbinden", "ilias", "Verbinden", "cta"), link: mehr };
    if (si.extern) {
      if (si.gruppenZugang) { const sy = si.laeuft ? "uhr" : si.fehler || si.warnung ? "warnung" : "haken"; return { zu: false, text: si.text, pille: PILLE.an, symbol: sy, ton: tonVon(sy), knopf: si.laeuft ? "" : aktualisierenKnopf(v.id, false, {}), link: mehr }; }
      const von = ["deine Unterlagen"].concat(kalenderExtern() ? ["deine Abgaben"] : [], stundenplanExtern() ? ["dein Stundenplan"] : []);
      const satz = `${undListe(von)} kommen über deinen Uni-Abgleich.`, text = satz.charAt(0).toUpperCase() + satz.slice(1);
      // kompakt: anmelden musst du dich hier nicht, darunter woher es kommt
      return { zu: false, text, kurz: "Nicht nötig", unter: von.length > 2 ? "Alles kommt über deinen Uni-Abgleich." : text, pille: "", symbol: "haken", ton: "ok", knopf: "",
        link: hier.length || si.benutzer || von.length < 3 ? mehr : "" };
    }
    const aktiv = teile.filter((x) => x.hier || x.anderswo);
    if (!aktiv.length) {
      const zu = VERBINDUNGEN.ilias.gesperrt(), los = uniAnmeldungHier();
      return { zu, text: VERBINDUNGEN.ilias.kurz, kurz: "Aus", pille: zu ? PILLE.nicht : "", symbol: zu ? "schloss" : "aus", ton: "leise",
        knopf: los ? knopf("verbinden", "ilias", "Mit Uni-Login verbinden", "cta") : knopf("verbinden", v.id, "Mehr erfahren", ""), link: los ? mehr : "" };
    }
    const neu = Math.max(0, ...aktiv.map((x) => Date.parse(x.zuletzt || "") || 0)), bis = neu ? vor(new Date(neu).toISOString()) : "";
    const laeuft = hier.some((x) => x.s.laeuft);
    const problem = laeuft ? null : hier.map((x) => ({ x, z: statusZeile(x.v) })).find((p) => p.z && p.z.symbol === "warnung");
    const text = `${hier.length ? "Verbunden" : "Verbunden über ein anderes Gerät"} · ${undListe(aktiv.map((x) => UNI_WORT[x.v.id]))} · `
      + (laeuft ? "aktualisiert gerade …" : bis ? `aktualisiert ${bis}.` : "noch nicht aktualisiert.") + (problem ? ` ${problem.x.v.name}: ${problem.z.text}` : "");
    const symbol = laeuft ? "uhr" : problem ? "warnung" : "haken";
    return { zu: false, text: text.replace(/\.\./g, "."), unter: problem ? `${problem.x.v.name}: ${problem.z.text}` : "", pille: PILLE.an, symbol, ton: tonVon(symbol),
      knopf: !hier.length ? knopf("verbinden", v.id, "Mehr erfahren", "") : laeuft ? "" : aktualisierenKnopf(v.id, hier.some((x) => x.s.zustand === "anderes-geraet"), { uebernehmen: "1" }),
      link: hier.length ? mehr : "" };
  };

  // Alma: verbunden → Aktualisieren (Rest im Fenster); Stundenplan schon da (Sync, zentral) → Haken ohne Pille, Verbinden leise;
  // eigener Uni-Abgleich → nur der Satz (mit gespeichertem Link: Alma holt trotzdem nichts, das sagt die Zeile; Textlink Trennen)
  const almaZeile = (v) => {
    const s = v.status();
    if (s.extern && s.verbunden) return { zu: false, text: `${ALMA_EXTERN} Der Alma-Link auf diesem Gerät wird nicht genutzt.`, pille: "", symbol: "haken", ton: "ok", knopf: "", link: textLink("trennen", v.id, "Trennen") };
    if (s.extern) return { zu: false, text: ALMA_EXTERN, pille: "", symbol: "haken", ton: "ok", knopf: "", link: "" };
    if (s.verbunden) {
      // gemeinsame Form (alma.js): Fehler bleiben stehen, bis ein Abruf klappt; ein anderes Gerät aktualisiert → Hier aktualisieren
      const t = standText(Object.assign({ geprueft: s.stand }, s));
      return { zu: false, text: t.text, pille: PILLE.an, symbol: t.symbol, ton: t.ton, knopf: aktualisierenKnopf(v.id, s.zustand === "anderes-geraet", {}), link: mehrLink(v.id) };
    }
    if (anderswo(v, s)) return anderswoZeile(v, s);
    if (s.daten) return { zu: false, text: `Dein Stundenplan liegt vor (${s.daten} ${s.daten === 1 ? "Eintrag" : "Einträge"}).`, pille: "", symbol: "haken", ton: "leise", knopf: knopf("verbinden", v.id, "Verbinden", ""), link: "" };
    if (zentralerPlan().verfuegbar) return { zu: false, text: "Nicht nötig: " + ALMA_FREIWILLIG, pille: "", symbol: "haken", ton: "leise", knopf: knopf("verbinden", v.id, "Verbinden", ""), link: "" };
    return { zu: true, text: "Mit Alma siehst du deine Woche im Stundenplan.", pille: PILLE.nicht, symbol: "schloss", ton: "leise", knopf: knopf("verbinden", v.id, "Verbinden", "cta"), link: "" };
  };

  // ILIAS-Kalender (ilias-kalender.js): verbunden → Stand und Zahl der kommenden Abgaben, Aktualisieren (ein anderes Gerät
  // aktualisiert: Hier aktualisieren), Rest im Fenster; nicht verbunden → ein Satz und Verbinden (kein Schloss, darum keine Pille);
  // Abgaben von außen → nur der Satz (mit gespeichertem Link: der wird nicht genutzt, Textlink Trennen)
  const kalenderZeile = (v) => {
    if (!ctx.iliasKalender) return null;
    const s = v.status();
    if (s.extern) return { zu: false, text: s.verbunden ? `${v.externText} Der Link auf diesem Gerät wird nicht genutzt.` : v.externText, pille: "", symbol: "haken", ton: "ok", knopf: "", link: s.verbunden ? textLink("trennen", v.id, "Trennen") : "" };
    if (!s.verbunden && anderswo(v, s)) return anderswoZeile(v, s);
    if (!s.verbunden) return { zu: false, text: v.satz, pille: "", symbol: "aus", ton: "leise", knopf: knopf("verbinden", v.id, "Verbinden", "cta"), link: "" };
    const t = standText(s), n = Number(s.abgaben) || 0;
    const zahl = s.zustand !== "an" ? "" : n ? ` ${n === 1 ? "1 Abgabe steht" : `${n} Abgaben stehen`} bei deinen Fristen.` : " Gerade keine Abgaben offen.";
    return { zu: false, text: t.text + zahl, pille: PILLE.an, symbol: t.symbol, ton: t.ton, knopf: s.laeuft ? "" : aktualisierenKnopf(v.id, s.zustand === "anderes-geraet", {}), link: mehrLink(v.id) };
  };

  // ILIAS: Text aus ctx.ilias.status() (fertig formuliert); Symbol, Pille, Knopf und Textlink je Stand. Eigener Uni-Abgleich:
  // Unterlagen kommen von dort, ILIAS hier nur für die Übungsgruppen (Jetzt prüfen, Trennen bzw. leise verbinden).
  const iliasZeile = (v) => {
    const s = v.status();
    if (iliasOhneAnmeldung(s)) return { zu: false, text: s.text, pille: "", symbol: "uhr", ton: "leise", knopf: "", link: "" };
    const abgelehnt = { zu: false, text: s.text, pille: PILLE.pruefen, symbol: "warnung", ton: "warn", knopf: knopf("verbinden", v.id, "Verbinden", "cta"), link: "" };
    const symbol = s.laeuft ? "uhr" : s.fehler || s.warnung ? "warnung" : "haken"; // warnung: Satz des letzten Laufs steht in s.text
    if (s.extern) {
      if (s.gruppenExtern) return { zu: false, text: s.text, pille: "", symbol: "haken", ton: "ok", knopf: "", link: s.benutzer ? textLink("trennen", v.id, "Trennen") : "" };
      if (!s.gruppenZugang && anderswo(v, s)) return anderswoZeile(v, s, s.text);
      if (!s.gruppenZugang) return { zu: false, text: s.text, pille: "", symbol: "haken", ton: "ok", knopf: ctx.ilias.kannSpeichern() ? knopf("verbinden", v.id, "Für Übungsgruppen verbinden", "") : "", link: "" };
      if (s.gesperrt) return abgelehnt;
      return { zu: false, text: s.text, pille: PILLE.an, symbol, ton: tonVon(symbol), knopf: knopf("verbindung-aktualisieren", v.id, WORT.knopf, "cta"), link: textLink("trennen", v.id, "Trennen") };
    }
    if (s.verbunden && s.gesperrt) return abgelehnt;
    if (s.verbunden) {
      const t = s.laeuft || !s.zustand ? { text: s.text, symbol, ton: tonVon(symbol) } : Object.assign(standText(s), { text: iliasText(s) });
      return { zu: false, text: t.text, pille: PILLE.an, symbol: t.symbol, ton: t.ton, knopf: aktualisierenKnopf(v.id, !!s.anderes, { uebernehmen: "1" }), link: mehrLink(v.id) };
    }
    if (anderswo(v, s)) return anderswoZeile(v, s);
    if (s.daten) return { zu: false, text: `${s.daten === 1 ? "1 Unterlage aus ILIAS liegt" : `${s.daten} Unterlagen aus ILIAS liegen`} vor.`, pille: "", symbol: "haken", ton: "leise", knopf: knopf("verbinden", v.id, "Verbinden", ""), link: "" };
    return { zu: true, text: v.kurz, pille: PILLE.nicht, symbol: "schloss", ton: "leise", knopf: knopf("verbinden", v.id, "Verbinden", "cta"), link: "" };
  };

  // Text des Stands von ILIAS: die gemeinsame Formatierung, dazu die Dateien über der Größengrenze; Sonderfälle (läuft, abgelehnt,
  // nicht verbunden, Übungsgruppen im eigenen Uni-Abgleich) formuliert ilias.js selbst (s.text)
  const iliasText = (s) => {
    if (s.laeuft || ["an", "fehler", "anderes-geraet"].indexOf(s.zustand) < 0 || s.gruppenZugang) return s.text;
    const gross = s.zuGross ? ` ${s.zuGross} ${s.zuGross === 1 ? "Datei" : "Dateien"} über ${s.grenzeMb} MB nicht geladen.` : "";
    return standText(s).text + gross;
  };
  // Volltext der PDFs: Zahlen aus volltext.js (s.text: „58 PDFs durchsuchbar, 2 ohne Text.“), Fehler und ein anderes Gerät aus der
  // gemeinsamen Formatierung; aus → Einschalten im Fenster; extern oder fremde Textfassungen → nur der Satz
  const volltextZeile = (v) => {
    const s = v.status();
    if (!ctx.volltext) return null;
    // von außen (eigener Uni-Abgleich) oder fremde Textfassungen: Die Suche findet die Wörter trotzdem, kompakt also „An“
    if (s.zustand === "extern" || s.zustand === "fremd") return { zu: false, text: s.text, pille: "", symbol: "haken", ton: "ok", knopf: "", link: "" };
    if (!s.an) return { zu: false, text: "Aus. Die Suche findet keine Wörter in PDFs.", pille: "", symbol: "aus", ton: "leise", knopf: knopf("verbinden", v.id, "Einschalten", "cta"), link: "" };
    const t = s.laeuft ? { text: s.text, symbol: "uhr", ton: "leise" } : s.fehler || s.zustand === "anderes-geraet" ? standText(s) : { text: s.text, symbol: "haken", ton: "ok" };
    return { zu: false, text: t.text, pille: "", symbol: t.symbol, ton: t.ton, knopf: s.laeuft ? "" : aktualisierenKnopf(v.id, s.zustand === "anderes-geraet", { hier: "1" }), link: mehrLink(v.id) };
  };

  // Übersicht: je Verbindung eine kompakte Zeile (kompakt), die ganze Zeile ist ein Link (eba-core.css 43, .eba-ez). Titel und
  // Stand stehen im Markup in einer Kopfzeile (.eba-ez-kopf); eba-core.css legt den Stand rechts in die Mitte der Zeile.
  const uebersicht = (el) => {
    el.empty();
    const liste = el.createDiv({ cls: "eba-vb-liste eba-ez-liste" });
    for (const v of Object.values(VERBINDUNGEN)) {
      if ((v.sichtbar && !v.sichtbar()) || UNI_TEILE.indexOf(v.id) >= 0) continue; // Teile des Uni-Logins: nur in dessen Fenster
      const st = statusZeile(v);
      if (!st) continue;
      const k = kompakt(v, st);
      const zeile = liste.createEl("a", { cls: "eba-ez", attr: { href: k.ziel, "data-id": v.id } });
      zeile.innerHTML = `<span class="eba-vb-symbol ${k.ton}" aria-hidden="true">${svg(k.symbol)}</span>`
        + `<span class="eba-ez-text"><span class="eba-ez-kopf"><span class="eba-ez-titel">${esc(v.name)}</span>`
        + (k.wert ? `<span class="eba-ez-wert${k.art ? " " + k.art : ""}">${esc(k.wert)}</span>` : "") + "</span>"
        + (k.unter ? `<span class="eba-ez-unter">${esc(k.unter)}</span>` : "") + "</span>"
        + `<span class="eba-ez-rechts" aria-hidden="true">${svg("pfeil")}</span>`;
    }
  };

  // Knopf „Unterlagen aktualisieren“ auf Unterlagen (Link in derselben Karte): sichtbar, wenn verbunden (CSS über eba-ilias-an); während
  // eines Abrufs heißt er „Lädt 12 von 40“ bzw. „Lädt …“. Ist der Block noch nicht im Dokument, einmal kurz danach.
  const iliasKnopf = (inst) => {
    const s = VERBINDUNGEN.ilias.status();
    inst.el.toggleClass("eba-ilias-an", !!s.verbunden);
    const karte = inst.el.closest(".callout-content");
    const a = karte && karte.querySelector('a[href*="aktion=ilias-holen"]');
    if (!a) {
      if (s.laeuft && !inst.spaeter) { inst.spaeter = true; ctx.zeit(() => { inst.spaeter = false; if (inst.el.isConnected) iliasKnopf(inst); }, 150); }
      return;
    }
    if (!a.hasAttribute("data-eba-text")) a.setAttribute("data-eba-text", a.textContent);
    a.setText(s.laeuft && s.fortschritt ? s.fortschritt.knopf : a.getAttribute("data-eba-text"));
  };
  // Fortschritt eines Abrufs (ilias.js, je Schritt): nur Zeile und Knopf ändern, nicht alles neu zeichnen
  const iliasStand = () => {
    const s = ctx.ilias ? ctx.ilias.status() : null;
    if (!s || !s.verbunden || !s.laeuft) return;
    for (const b of bloecke) {
      for (const inst of b.instanzen()) {
        if (inst.art === "ilias-knopf") iliasKnopf(inst);
        else if (inst.art === "uebersicht") {
          const el = inst.el.querySelector('.eba-ez[data-id="uni-login"] .eba-ez-wert');
          if (el) el.setText(s.fortschritt ? s.fortschritt.knopf : "Lädt …");
        }
      }
    }
  };

  const zeichnen = (inst) => {
    if (inst.art === "uebersicht") uebersicht(inst.el);
    else if (inst.art === "ilias-knopf") iliasKnopf(inst);
    else schlossKarte(inst.el, inst.id);
  };

  // ---------- Aktionen ----------
  const waehlen = async (c, frage) => {
    let v = holen(c.parameter.id);
    if (!v) {
      const liste = Object.values(VERBINDUNGEN).filter((x) => !x.sichtbar || x.sichtbar());
      v = await ctx.system.suggester(liste.map((x) => x.name), liste, false, frage);
    }
    return v || null;
  };
  const AKTIONEN = {
    verbinden: {
      titel: "Verbinden …",
      ausfuehren: async (c) => { const v = await waehlen(c, "Was verbinden?"); if (v) fensterOeffnen(v, c.parameter); },
    },
    "verbindung-aktualisieren": {
      titel: "Aktualisieren …",
      ausfuehren: async (c) => {
        const v = await waehlen(c, "Was aktualisieren?");
        if (!v) return;
        const st = v.status();
        // ILIAS im eigenen Uni-Abgleich: „Aktualisieren“ (gruppenZugang) prüft die Übungsgruppen; Volltext, wenn er an ist
        const bereit = v.art === "volltext" ? st.an && ["extern", "fremd"].indexOf(st.zustand) < 0 : (st.verbunden || st.gruppenZugang) && !st.gesperrt;
        if (!v.aktualisieren || !bereit) { fensterOeffnen(v); return; }
        await v.aktualisieren(c.parameter || {});
        neuZeichnen();
      },
    },
    trennen: {
      titel: "Trennen …",
      ausfuehren: async (c) => {
        const v = await waehlen(c, "Was trennen?");
        if (!v || !v.trennen) return;
        const st = v.status();
        if (!st.verbunden && !st.gruppenZugang) { ctx.hinweis(`${v.name} ist auf diesem Gerät nicht verbunden.`); return; }
        const ok = await bestaetigen(`${v.name} trennen?`, v.trennenText || "Deine Daten bleiben, werden aber nicht mehr aktualisiert.", "Trennen");
        if (!ok) return;
        await v.trennen();
        ctx.hinweis(`${v.name} getrennt.`);
        neuZeichnen();
      },
    },
    // Knopf „Unterlagen aktualisieren“ (Seite Unterlagen): verbunden → holen (Hinweis zum Ergebnis zeigt ilias.js), sonst das Fenster
    "ilias-holen": {
      titel: "Unterlagen aktualisieren",
      ausfuehren: async () => {
        const v = VERBINDUNGEN.ilias, s = v.status();
        if (!s.verbunden || s.gesperrt || s.extern) { fensterOeffnen(v); return; }
        await ctx.ilias.jetztHolen();
        neuZeichnen();
      },
    },
  };

  // Für andere Skripte (z. B. ein Raster, das selbst zeichnet)
  // zeile(id): Inhalt der Zeile unter Verbindungen (statusZeile; für Tests), kompakt(id): was die Übersicht davon zeigt
  // ({ wert, art, unter, ziel }). ALMA_EXTERN: Satz für Alma im eigenen Uni-Abgleich
  // (auch die Einrichtung). imTresor(id): { art: hier | anderswo | nein, zuletzt } (über ein anderes Gerät verbunden?);
  // sperrenLesen(): Sperren der Quellen neu lesen → true, wenn sich etwas geändert hat.
  ctx.verbindungen = { liste: VERBINDUNGEN, holen, svg, gesperrt: (id) => { const v = holen(id); return v ? v.gesperrt() : false; }, schlossKarte, fensterOeffnen, neuZeichnen, iliasStand, fett, textTeile,
    standText, quelleZeile, WORT, imTresor, sperrenLesen,
    zeile: (id) => { const v = holen(id); return v ? statusZeile(v) : null; }, ALMA_EXTERN,
    kompakt: (id) => { const v = holen(id), st = v ? statusZeile(v) : null; return st ? kompakt(v, st) : null; },
    ALMA: { start: ALMA_START, stundenplan: ALMA_STUNDENPLAN },
    get fenster() { return fenster; } }; // offenes Verbinden-/Info-Fenster (für Tests)

  const registrieren = () => {
    bloecke.length = 0;
    bloecke.push(ctx.codeblock("eba-schloss", (quelle, el, c, inst) => {
      inst.art = "schloss";
      inst.id = ctx.modell && ctx.modell.blockArgument ? ctx.modell.blockArgument(el, c, "eba-schloss", Object.keys(VERBINDUNGEN), "alma") : "alma";
      try { zeichnen(inst); } catch (e) { console.error("eba-schloss", e); }
    }));
    bloecke.push(ctx.codeblock("eba-verbindungen", (quelle, el, c, inst) => {
      inst.art = "uebersicht";
      try { zeichnen(inst); } catch (e) { console.error("eba-verbindungen", e); el.setText(String(quelle)); }
    }));
    ctx.codeblock("eba-alma-knoepfe", (quelle, el) => { el.empty(); }); // seit 24.10.2026 leer, siehe oben
    bloecke.push(ctx.codeblock("eba-ilias-knopf", (quelle, el, c, inst) => {
      inst.art = "ilias-knopf";
      el.addClass("eba-ilias-knopf");
      try { zeichnen(inst); } catch (e) { console.error("eba-ilias-knopf", e); }
    }));
    // Schloss auf Unterlagen: verschwindet, sobald Unterlagen aus ILIAS da sind (auch per Sync)
    const unterlagenBald = ctx.entprellen(neuZeichnen, 1500);
    ctx.an(app.metadataCache, "changed", (f) => { if (f.path.startsWith("Unterlagen/")) unterlagenBald(); });
    // Über ein anderes Gerät verbunden: Sperren der Quellen beim Start und nach jeder Änderung (Sync, eigener Lauf) lesen,
    // geändert → neu zeichnen
    const pfade = FREMD.map(sperrePfad);
    const sperrenBald = ctx.entprellen(() => { sperrenLesen().then((neu) => { if (neu) neuZeichnen(); }, () => {}); }, 1000);
    for (const art of ["create", "modify", "delete"]) ctx.an(app.vault, art, (f) => { if (f && pfade.indexOf(f.path) >= 0) sperrenBald(); });
    sperrenBald();
    // Neu zeichnen, wenn sich der Stundenplan ändert (Import, Sync) – über das Datenmodell, sonst direkt
    if (ctx.modell && ctx.modell.beiAenderung) ctx.aufraeumen(ctx.modell.beiAenderung(() => neuZeichnen()));
    else {
      const bald = ctx.entprellen(neuZeichnen, 800);
      ctx.an(app.metadataCache, "changed", (f) => { if (f.path.startsWith("Stundenplan/")) bald(); });
    }
  };

  return { registrieren, aktionen: AKTIONEN };
};
