// Widgets für den Home-Bildschirm und den Sperrbildschirm von iPhone und iPad (seit 28.10.2026; docs/architektur/widget.md).
// Obsidian kann selbst keine Widgets anbieten, ein Plugin auch nicht. Die kostenlose App Scriptable zeichnet sie. Dafür legt das
// Plugin auf iPhone und iPad zwei Dateien in seinen eigenen Ordner (.obsidian/plugins/studium-autopilot/; nicht unter den Notizen,
// nie im Update, und weil jedes Gerät seine eigene schreibt, streiten iPhone und iPad nicht um eine Datei):
//  widget-iphone.json bzw. widget-ipad.json (datenBauen): der Stundenplan der Planwoche und der zwei Wochen danach (wocheBauen aus
//    woche.js, dieselbe Regel wie das Wochenraster: Farbe je Modul, Ausfälle, Änderungen, online), „Fristen · 30 Tage“ wie auf dem
//    Dashboard (zeilenBauen aus dashboard.js), die nächste Frist und die nächsten Prüfungen (fristen, naechstePruefung), dazu
//    Design und hell/dunkel dieses Geräts. Was heute, morgen und jetzt ist, rechnet das Widget selbst; so stimmt es auch Tage
//    später, wenn Obsidian so lange zu bleibt.
//  widget-scriptable.js: der Zeichner (scriptable unten, als Text). Er kommt mit jedem Update neu, in Scriptable ändert sich nichts.
// In Scriptable steht nur der Lader (einrichten, als Text: lader): Beim ersten Lauf legt er die Skripte Stundenplan, Fristen und
// Prüfungen an und erklärt den Zugriff auf den Tresor; danach findet er den Tresor über ein Lesezeichen und führt den Zeichner aus.
// Geschrieben wird nur auf iPhone und iPad und nur, wenn sich der Inhalt geändert hat: kurz nach dem Start, bei Änderungen im
// Datenmodell, wenn Obsidian in den Hintergrund geht (dann lädt iOS Widgets gern neu) und alle 30 Minuten.
// Aktion widget: Fenster mit vier Schritten und „In Scriptable einrichten“; Zeile „Widgets“ unter Einstellungen & Hilfe → Hilfe.
// iOS-sicher (auch der Zeichner, Obsidian liest ihn mit): keine Node-APIs, kein Lookbehind, kein .at()/findLast/structuredClone.
module.exports = function (ctx) {
  const app = window.app;
  const FORMAT = 1; // Aufbau von widget-*.json; der Zeichner kennt diese Fassung
  const WOCHEN = 3; // Planwoche und die zwei danach
  const PRUEFUNGEN = 4;
  const FRISTEN = 3; // nächste Fristen für die kleine Kachel (die erste kann vorbei sein, bevor Obsidian wieder aufgeht)
  const TAKT = 30 * 60 * 1000;
  const ERSTES = 15 * 1000; // nach dem Start: erst lesen lassen, was der Sync bringt
  const ZEICHNER = "widget-scriptable.js";
  const SEITEN = { stundenplan: "Studium/Stundenplan.md", fristen: "Studium/Termine & Anmeldungen.md", pruefungen: "Studium/Prüfungen.md" };
  const SCRIPTABLE = "https://apps.apple.com/app/scriptable/id1405459188";

  const zwei = (n) => (n < 10 ? "0" : "") + n;
  const iso = (d) => d.getFullYear() + "-" + zwei(d.getMonth() + 1) + "-" + zwei(d.getDate());
  const plusTag = (s, n) => { const m = String(s).split("-"); return iso(new Date(+m[0], +m[1] - 1, +m[2] + n)); };

  // ---------- Daten (rein, testbar) ----------
  // o: { W: woche.js, D: dashboard.js, M: ctx.modell, eingaben: W.eingaben(), jetzt: Date, tresor, design, modus }
  const datenBauen = (o) => {
    const { W, D, M, jetzt } = o, heute = iso(jetzt);
    const mo0 = W.aktuellerMontag(jetzt), wochen = [];
    for (let i = 0; i < WOCHEN; i++) {
      const montag = new Date(mo0.getFullYear(), mo0.getMonth(), mo0.getDate() + 7 * i);
      const w = W.wocheBauen(Object.assign({}, o.eingaben, { modell: M, montag, jetzt }));
      wochen.push({
        mo: w.tage[0], kw: w.kw, text: (M.woche(w.tage[0]) || {}).text || "", h0: w.h0, h1: w.h1,
        leer: w.beginnFehlt ? "Trag deinen Studienbeginn ein, dann kommen deine Vorlesungen von selbst." : w.leer,
        sitzungen: w.kaesten.map((k) => ({
          tag: w.tage[k.tag - 1], beginn: k.beginn, ende: k.ende, kurz: k.kurz, art: k.art, raum: k.raum || "",
          raumKnapp: k.raum ? W.raumKnapp(k.raum) : "", farbe: k.farbe || 0,
          ue: !!k.ue, online: !!k.online, aus: !!k.aus, ausnahme: !!k.ausnahme, spaeter: !!k.spaeter, marke: k.spaeter ? k.zeit : k.marke || "",
          notiz: k.notiz || "",
        })).sort((a, b) => (a.tag + a.beginn < b.tag + b.beginn ? -1 : a.tag + a.beginn > b.tag + b.beginn ? 1 : 0)),
      });
    }
    const fristen = D.zeilenBauen("fristen", M, heute).map((z) => ({
      art: z.art || "", tag: z.tag || z.sort, laeuft: !!z.laeuft, ueberfaellig: !!z.ueberfaellig, uhr: z.uhr || "", was: z.was,
      pille: z.pille ? z.pille.text : "", pfad: z.pfad || "",
    }));
    const naechsteFristen = M.fristen({ heute }).slice(0, FRISTEN).map((f) => ({
      was: String(f.titel).replace(" (ILIAS)", ""), tag: f.datum, ende: f.ende || f.datum, laeuft: !!f.laeuft, geschaetzt: !!f.geschaetzt, pfad: f.pfad || "",
    }));
    // Die nächsten Prüfungen nach der Regel der Kachel „Nächste Prüfung“: jeweils die nächste ab dem Tag nach der vorigen
    const pruefungen = [];
    for (let ab = heute; pruefungen.length < PRUEFUNGEN;) {
      const p = M.naechstePruefung({ heute: ab });
      if (!p) break;
      pruefungen.push({ was: p.titel, tag: p.datum, uhr: p.zeit || "", geschaetzt: !!p.geschaetzt, pfad: p.pfad || "" });
      ab = plusTag(p.datum, 1);
    }
    return { format: FORMAT, stand: jetzt.toISOString(), tresor: o.tresor || "", design: o.design || "elfenbein", modus: o.modus || "automatisch",
      seiten: SEITEN, wochen, fristen, naechsteFristen, pruefungen };
  };
  // Inhalt ohne den Zeitpunkt: gleich → nichts schreiben
  const ohneStand = (text) => String(text || "").replace(/"stand": "[^"]*"/, "");

  // ---------- Lader (das eine Skript, das man in Scriptable einfügt; seit 29.10.2026 mit Einrichtung) ----------
  // Läuft nur in Scriptable. Was sich ändern darf, steht im Zeichner (kommt mit jedem Update); der Lader bleibt, wie er eingefügt
  // wurde, darum nur das Nötigste: E = { art, tresor, ort }, G = Scriptables Bausteine.
  //  1. Erster Lauf des eingefügten Skripts (art leer, in der App): legt die drei Skripte Stundenplan, Fristen und Prüfungen an
  //     (Kopien dieses Texts mit art und Symbol), so wählt man im Widget nur das Skript, ohne Parameter. Ein fremdes Skript mit
  //     demselben Namen bleibt (dann „Name (Studium Autopilot)“); das eingefügte „Untitled Script“ löscht sich danach.
  //  2. Tresor finden: jedes Datei-Lesezeichen von Scriptable, der Ordner selbst oder ein Ordner darin (Lesezeichen auf
  //     „Obsidian“ mit mehreren Tresoren: der mit dem Namen dieses Tresors); Name des Lesezeichens egal.
  //  3. Kein Tresor: in der App eine Anleitung für das Lesezeichen (ort: „Auf meinem iPad“ bzw. „iCloud Drive“), im Widget ein
  //     Satz, der beim Tippen dieses Skript startet. Sonst der Zeichner; in der App zeigt er „Alles bereit“ und die Vorschau.
  //  4. Kopie (seit 29.10.2026): Zeichner und Daten liegen nach jedem Lauf mit Zugriff auch in Scriptables Library; das Widget
  //     zeichnet aus ihr, wenn der Tresor gerade nicht lesbar ist.
  const einrichten = async function (E, G) {
    const PLUGIN = ".obsidian/plugins/studium-autopilot", ZEICHNER = "widget-scriptable.js", MARKE = "// Studium Autopilot: Widget";
    const NAMEN = { stundenplan: "Stundenplan", fristen: "Fristen", pruefung: "Prüfungen" };
    const SYMBOL = { stundenplan: "deep-blue; icon-glyph: calendar-alt", fristen: "orange; icon-glyph: hourglass-half", pruefung: "red; icon-glyph: graduation-cap" };
    const config = G.config || {}, imWidget = !!(config.runsInWidget || config.runsInAccessoryWidget);
    const fm = G.FileManager.local(), name = NAMEN[E.art] || NAMEN.stundenplan;
    const selbst = (G.module && G.module.filename) || "";
    if (!imWidget && selbst) {
      const ordner = selbst.replace(/\/[^\/]*$/, "");
      let ablage = fm;
      try { const i = G.FileManager.iCloud(); if (i.documentsDirectory() === ordner) ablage = i; } catch (e) { /* ohne iCloud */ }
      // Unser Skript an seiner Marke; „Name (Studium Autopilot)“, wenn ein fremdes so heißt
      const unsere = (art) => [NAMEN[art] + ".js", NAMEN[art] + " (Studium Autopilot).js"].map((n) => ablage.joinPath(ordner, n))
        .filter((p) => p === selbst || (ablage.fileExists(p) && ablage.readString(p).indexOf(MARKE) >= 0))[0] || "";
      // Eingefügt (art leer) oder als Datei übernommen und noch allein (seit 29.10.2026 kommt „Stundenplan“ als Datei): die drei
      // anlegen. Hat jemand eines davon gelöscht, bleibt es weg, solange ein anderes noch da ist.
      const andere = Object.keys(NAMEN).filter((art) => art !== E.art);
      if (!E.art || andere.every((art) => !unsere(art))) {
        const quelle = ablage.readString(selbst).replace(/^(\/\/ (Variables used by Scriptable|These must be at the very top|icon-color:)[^\n]*\n)+/, "");
        Object.keys(NAMEN).forEach((art) => {
          let datei = unsere(art) || ablage.joinPath(ordner, NAMEN[art] + ".js");
          if (datei === selbst) return;
          if (ablage.fileExists(datei) && ablage.readString(datei).indexOf(MARKE) < 0) datei = ablage.joinPath(ordner, NAMEN[art] + " (Studium Autopilot).js");
          ablage.writeString(datei, "// Variables used by Scriptable.\n// These must be at the very top of the file. Do not edit.\n// icon-color: " + SYMBOL[art] + ";\n"
            + quelle.replace(/^const ART = "[^"]*";$/m, "const ART = " + JSON.stringify(art) + ";"));
        });
        if (/^(Untitled Script|Unbenannt)/.test(selbst.split("/").pop())) { try { ablage.remove(selbst); } catch (e) { /* bleibt liegen */ } }
      }
    }
    const passt = (p) => { try { return fm.fileExists(fm.joinPath(p, PLUGIN + "/manifest.json")); } catch (e) { return false; } };
    const darin = (p) => { try { return fm.isDirectory(p) ? fm.listContents(p).map((n) => fm.joinPath(p, n)) : []; } catch (e) { return []; } };
    let lesezeichen;
    try { lesezeichen = fm.allFileBookmarks().filter((b) => b.source !== "siri_shortcuts").map((b) => b.name); } catch (e) { lesezeichen = ["Studium Autopilot", E.tresor]; }
    const treffer = [];
    lesezeichen.forEach((n) => {
      if (!fm.bookmarkExists(n)) return;
      const p = fm.bookmarkedPath(n);
      [p].concat(darin(p)).forEach((x) => { if (passt(x)) treffer.push(x); });
    });
    const tresor = treffer.filter((x) => x.split("/").pop() === E.tresor)[0] || treffer[0] || "";
    const satz = (text, url) => {
      const w = new G.ListWidget(), t = w.addText(text);
      t.font = G.Font.systemFont(13);
      if (url) w.url = url;
      return w;
    };
    // Kopie in Scriptables eigenem Ordner (Library, nie in der Liste der Skripte): bei jedem Lauf mit Zugriff aufgefrischt. Ist der
    // Tresor gerade nicht lesbar (Lesezeichen weg, Datei noch in iCloud), nimmt das Widget sie statt eines Fehlers; in der App ohne
    // Zugriff kommt trotzdem die Anleitung, damit man ihn wieder einrichtet.
    const DATEIEN = [ZEICHNER, "widget-iphone.json", "widget-ipad.json"];
    const kopie = fm.joinPath(fm.libraryDirectory(), "studium-autopilot");
    let ordner = "";
    if (tresor) {
      const quelle = fm.joinPath(tresor, PLUGIN);
      for (const n of DATEIEN) {
        const p = fm.joinPath(quelle, n);
        try { if (fm.isFileStoredIniCloud(p) && !fm.isFileDownloaded(p)) await fm.downloadFileFromiCloud(p); } catch (e) { /* nur lokal */ }
      }
      if (fm.fileExists(fm.joinPath(quelle, ZEICHNER))) {
        ordner = quelle;
        try {
          if (!fm.isDirectory(kopie)) fm.createDirectory(kopie, true);
          DATEIEN.forEach((n) => { const p = fm.joinPath(quelle, n); if (fm.fileExists(p)) fm.writeString(fm.joinPath(kopie, n), fm.readString(p)); });
        } catch (e) { /* ohne Kopie */ }
      }
    }
    if (!ordner && (tresor || imWidget) && fm.fileExists(fm.joinPath(kopie, ZEICHNER))) ordner = kopie;
    let w = null;
    if (!ordner && !tresor && imWidget) w = satz("Tippe hier, um das Widget einzurichten.", "scriptable:///run/" + encodeURIComponent(name));
    else if (!ordner && !tresor) {
      const a = new G.Alert();
      a.title = "Noch ein Schritt";
      a.message = "Scriptable darf deinen Tresor noch nicht lesen. So erlaubst du es, nur einmal:\n\n"
        + "1. Tippe auf OK und geh zurück zur Liste deiner Skripte. Tippe dort oben links auf das Zahnrad.\n"
        + "2. Tippe auf File Bookmarks, dann auf + und Pick Folder.\n"
        + "3. Tippe auf " + E.ort + ", dann auf den Ordner Obsidian und oben rechts auf Öffnen.\n"
        + "4. Schließ die Einstellungen und tippe in der Liste auf " + name + ".";
      a.addAction("OK");
      await a.present();
    } else if (!ordner) w = satz("Öffne Obsidian einmal auf diesem Gerät, dann erscheint hier dein Widget.");
    else {
      try {
        const zeichnen = new Function("return " + fm.readString(fm.joinPath(ordner, ZEICHNER)))();
        w = await zeichnen({ ListWidget: G.ListWidget, Color: G.Color, Font: G.Font, Size: G.Size, SFSymbol: G.SFSymbol, Device: G.Device,
          Alert: G.Alert, config, args: G.args, fm, ordner, art: E.art, name, app: !imWidget });
      } catch (e) { w = satz(e.message); }
    }
    if (imWidget) G.Script.setWidget(w);
    else if (w) await w.presentLarge();
    G.Script.complete();
  };
  // Text des Laders: o = { tresor, ort, art }. Die Zeile „const ART = …“ ersetzt einrichten in seinen Kopien.
  const lader = (o) => [
    "// Studium Autopilot: Widget für Stundenplan, Fristen und Prüfungen. Einrichten: in Obsidian unter Einstellungen & Hilfe, Widgets.",
    "const ART = " + JSON.stringify(o.art || "") + ";",
    "const TRESOR = " + JSON.stringify(o.tresor || "") + ";",
    "const ORT = " + JSON.stringify(o.ort || "Auf meinem iPhone") + ";",
    "await (" + einrichten.toString() + ")({ art: ART, tresor: TRESOR, ort: ORT },",
    "  { ListWidget, Color, Font, Size, SFSymbol, Device, Alert, config, args, FileManager, Script, module });",
    "",
  ].join("\n");

  // ---------- Zeichner (läuft nur in Scriptable; als Text in widget-scriptable.js, darum ohne Bezug auf diese Datei) ----------
  // S: { ListWidget, Color, Font, Size, SFSymbol, Device, config, args, fm, ordner } → fertiges ListWidget; vom Lader seit 29.10.2026
  // dazu { Alert, art, name, app } (Skript Stundenplan, Fristen oder Prüfungen; app: in Scriptable selbst gestartet → Vorschau, null).
  // Art: Parameter des Widgets („Fristen“, „Prüfungen“, leer), sonst die des Skripts. Je Größe:
  //  stundenplan: klein „Als Nächstes“, mittel der Tag (heute, nach der letzten Sitzung der nächste), groß die Woche wie das Raster;
  //  fristen: klein die nächste Frist wie die Kachel, mittel und groß „Fristen · 30 Tage“;
  //  pruefung: klein die Tage bis zur nächsten Prüfung, mittel und groß die nächsten Prüfungen;
  //  Sperrbildschirm (accessory…): je dieselbe Angabe in einer bzw. drei Zeilen, rund nur Uhrzeit oder Tage.
  // Farben wie die Designs der App: hell und dunkel je Design (dunkel seit 01.11.2026, vorher für alle die von Elfenbein),
  // Modulfarben dunkel für alle (eba-paper-elfenbein.css .theme-dark); tests/widget.test.js vergleicht sie mit den CSS-Dateien.
  const scriptable = async function (S) {
    const ListWidget = S.ListWidget, Color = S.Color, Font = S.Font, Size = S.Size, SFSymbol = S.SFSymbol, Device = S.Device;
    const config = S.config || {}, fm = S.fm, ordner = S.ordner;
    const HELL = {
      elfenbein: { bg: "#faf6ee", karte: "#fffdf8", rand: "#e6dccb", text: "#2a2119", muted: "#65594a", faint: "#776e61", akzentText: "#2c3440",
        warn: "#a8660b", bad: "#b42318", info: "#3b5f86", modul: {} },
      flieder: { bg: "#f7f2fb", karte: "#fdfaff", rand: "#e5d9f0", text: "#2a2133", muted: "#66597a", faint: "#756985", akzentText: "#6c3f9e",
        warn: "#a3600a", bad: "#b4234a", info: "#2f64ad", modul: { 3: "#7276f8" } },
      klar: { bg: "#ffffff", karte: "#ffffff", rand: "#e4e7eb", text: "#16191f", muted: "#5a616c", faint: "#6f757e", akzentText: "#2453c9",
        warn: "#a3600a", bad: "#c0262d", info: "#1f6e8c", modul: { 1: "#1f5587" } },
    };
    const MODUL_HELL = ["#2763ba", "#147874", "#7b63c7", "#1292c0", "#508524", "#b54879"];
    // Tönung (eigene Werte des Widgets, seit 01.11.2026 nicht mehr die des Rasters): Fläche aus der Modulfarbe, Titel eine tiefe
    // (hell) bzw. helle (dunkel) Abstufung derselben Farbe, Nebenzeile fast neutral. So hat jeder Text auf jeder Modulfarbe in jedem
    // Design mindestens 4,5 : 1 (tests/widget.test.js prüft jeden Text gegen seinen Hintergrund).
    const TON_HELL = { flaeche: 0.15, flaecheUe: 0.1, titel: 0.5, neben: 0.15, tinte: "#000000" };
    const DUNKEL = {
      elfenbein: { bg: "#1b1813", karte: "#221e18", rand: "#373027", text: "#ece4d4", muted: "#b3a892", faint: "#918672", akzentText: "#b9c3d3",
        warn: "#dea64a", bad: "#ec7468", info: "#8aa9d0" },
      flieder: { bg: "#1a1620", karte: "#221c29", rand: "#372e42", text: "#ece4f3", muted: "#b6a8c8", faint: "#958aa6", akzentText: "#d8bff7",
        warn: "#dea64a", bad: "#ea6f72", info: "#93aee8" },
      klar: { bg: "#121417", karte: "#1a1d22", rand: "#2b3037", text: "#e9ebee", muted: "#a5abb4", faint: "#868d97", akzentText: "#aacdff",
        warn: "#e3a641", bad: "#e5776d", info: "#5fb6cf" },
    };
    const MODUL_DUNKEL = ["#678dee", "#349794", "#b09ef9", "#3ac1f0", "#82bf57", "#e380a9"];
    const TON_DUNKEL = { flaeche: 0.25, flaecheUe: 0.17, titel: 0.35, neben: 0.15, tinte: "#ffffff" };

    // ----- Daten -----
    const lesen = async (name) => {
      const p = fm.joinPath(ordner, name);
      try { if (fm.isFileStoredIniCloud(p) && !fm.isFileDownloaded(p)) await fm.downloadFileFromiCloud(p); } catch (e) { /* nur lokal */ }
      if (!fm.fileExists(p)) return null;
      try { return JSON.parse(fm.readString(p)); } catch (e) { return null; }
    };
    const pad = Device.isPad();
    const d = (await lesen(pad ? "widget-ipad.json" : "widget-iphone.json")) || (await lesen(pad ? "widget-iphone.json" : "widget-ipad.json"));

    // ----- Farben -----
    const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
    // wie color-mix(in srgb, a t, b)
    const mischen = (a, b, t) => "#" + hex(a).map((v, i) => { const x = Math.round(v * t + hex(b)[i] * (1 - t)).toString(16); return x.length < 2 ? "0" + x : x; }).join("");
    const design = d && HELL[d.design] ? d.design : "elfenbein", modus = d ? d.modus : "automatisch";
    const hell = Object.assign({}, HELL[design], TON_HELL, { modul: MODUL_HELL.map((c, i) => HELL[design].modul[i + 1] || c) });
    const dunkel = Object.assign({}, DUNKEL[design], TON_DUNKEL, { modul: MODUL_DUNKEL });
    const farbe = (fn) => (modus === "hell" ? new Color(fn(hell)) : modus === "dunkel" ? new Color(fn(dunkel)) : Color.dynamic(new Color(fn(hell)), new Color(fn(dunkel))));
    const F = {};
    ["bg", "karte", "rand", "text", "muted", "faint", "akzentText", "warn", "bad", "info"].forEach((k) => { F[k] = farbe((p) => p[k]); });
    F.heute = farbe((p) => mischen(p.akzentText, p.bg, 0.07));
    // Bernstein als kleiner Text: das Bernstein des Designs erreicht auf Elfenbein nur 4,3 : 1, eine Stufe tiefer 4,5 : 1 und mehr
    F.warnText = farbe((p) => mischen(p.warn, p.tinte, 0.85));
    // Farben einer Sitzung: Kante, Fläche, Titel, Nebenzeile, Spur (Fortschritt). Vorlesung kräftiger als Übung, Ausnahme in
    // Bernstein; Ausfall, „ab …“ und Vorbeies neutral und blass
    const kastenFarben = (s, vorbei) => {
      const modul = (p) => (s.farbe ? p.modul[s.farbe - 1] : p.faint);
      if (s.ausnahme) {
        return { kante: F.warn, flaeche: farbe((p) => mischen(p.warn, p.bg, 0.14)), titel: F.text, neben: farbe((p) => mischen(p.warn, p.tinte, 0.75)),
          spur: farbe((p) => mischen(p.warn, p.bg, 0.35)) };
      }
      if (s.aus || s.spaeter || vorbei) {
        return { kante: s.aus ? F.rand : farbe((p) => mischen(modul(p), p.bg, 0.45)), flaeche: farbe((p) => mischen(p.text, p.bg, 0.05)),
          titel: F.muted, neben: F.muted, spur: F.rand };
      }
      return { kante: farbe(modul), flaeche: farbe((p) => mischen(modul(p), p.bg, s.ue ? p.flaecheUe : p.flaeche)),
        titel: farbe((p) => mischen(modul(p), p.tinte, p.titel)), neben: farbe((p) => mischen(modul(p), p.muted, p.neben)),
        spur: farbe((p) => mischen(modul(p), p.bg, 0.4)) };
    };

    // ----- Schrift: Überschriften wie das Design (Elfenbein Serifen, Flieder rund, Klar die Systemschrift) -----
    const anzeige = (g) => (design === "elfenbein" ? new Font("IowanOldStyle-Roman", g) : design === "flieder" ? Font.semiboldRoundedSystemFont(g) : Font.semiboldSystemFont(g));
    const fett = (g) => Font.semiboldSystemFont(g), normal = (g) => Font.systemFont(g), mittel = (g) => Font.mediumSystemFont(g);

    // ----- Zeit -----
    const jetzt = S.jetzt || new Date(); // S.jetzt nur in tests/widget.test.js
    const z2 = (n) => (n < 10 ? "0" : "") + n;
    const isoVon = (x) => x.getFullYear() + "-" + z2(x.getMonth() + 1) + "-" + z2(x.getDate());
    const datum = (s) => { const m = String(s).split("-"); return new Date(+m[0], +m[1] - 1, +m[2]); };
    const plus = (s, n) => { const x = datum(s); return isoVon(new Date(x.getFullYear(), x.getMonth(), x.getDate() + n)); };
    const heute = isoVon(jetzt), nun = jetzt.getHours() * 60 + jetzt.getMinutes();
    const min = (s) => { const m = String(s || "").match(/^(\d{1,2}):(\d{2})/); return m ? +m[1] * 60 + +m[2] : null; };
    const tageBis = (s) => Math.round((datum(s) - datum(heute)) / 864e5);
    const WT = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
    const WT_LANG = ["Sonntag", "Montag", "Dienstag", "Mittwoch", "Donnerstag", "Freitag", "Samstag"];
    const kurzDatum = (s) => { const x = datum(s); return WT[x.getDay()] + " " + z2(x.getDate()) + "." + z2(x.getMonth() + 1) + "."; };
    const tagText = (s) => { const n = tageBis(s); return n === 0 ? "Heute" : n === 1 ? "Morgen" : kurzDatum(s); };
    const abstand = (s) => { const n = tageBis(s); return n === 0 ? "heute" : n === 1 ? "morgen" : "in " + n + " Tagen"; };
    const dauer = (m) => (m < 60 ? m + " Min." : Math.floor(m / 60) + " Std." + (m % 60 ? " " + (m % 60) + " Min." : ""));
    const MONAT = ["Januar", "Februar", "März", "April", "Mai", "Juni", "Juli", "August", "September", "Oktober", "November", "Dezember"];
    const MON = ["Jan.", "Feb.", "März", "Apr.", "Mai", "Juni", "Juli", "Aug.", "Sept.", "Okt.", "Nov.", "Dez."];
    // „Mi, 21. Okt.“ wie im Kalender von iOS; mit lang „Mittwoch, 21. Okt.“
    const datumText = (s, lang) => { const x = datum(s); return (lang ? WT_LANG : WT)[x.getDay()] + ", " + x.getDate() + ". " + MON[x.getMonth()]; };

    // ----- Größe des Widgets in Punkten (Scriptable sagt sie nicht; Tabelle nach Bildschirm, im Zweifel die kleinere) -----
    // Werte aus Apples Human Interface Guidelines (Widgets → Specifications; beim iPad die Spalte „Canvas“). 1192 und 954 sind
    // iPads mit der Anzeige „Mehr Platz“; dort rechnete das Widget bis 29.10.2026 mit 379 statt 412 und ließ Rand stehen.
    let fam = config.widgetFamily || "large"; // in der App wählt die Vorschau die Größe
    const groesse = () => {
      const s = Device.screenSize(), b = Math.min(s.width, s.height), h = Math.max(s.width, s.height);
      const T = pad
        ? [[1192, [188, 412, 412, 860]], [1024, [170, 378.5, 378.5, 795]], [954, [162, 350, 350, 726]],
          [834, h > 1150 ? [155, 342, 342, 715.5] : [150, 327.5, 327.5, 682]], [820, [155, 342, 342, 715.5]], [810, [146, 320.5, 320.5, 669]],
          [744, [141, 305.5, 305.5, 634.5]]]
        : [[430, [170, 364, 382]], [428, [170, 364, 382]], [414, h > 800 ? [169, 360, 379] : [159, 348, 357]], [402, [162, 344, 366]], [393, [158, 338, 354]],
          [390, [158, 338, 354]], [375, h > 800 ? [155, 329, 345] : [148, 321, 324]], [360, [155, 329, 345]], [320, [141, 292, 311]]];
      const z = (T.filter((x) => x[0] <= b)[0] || T[T.length - 1])[1];
      return { small: { w: z[0], h: z[0] }, medium: { w: z[1], h: z[0] }, large: { w: z[1], h: z[2] }, extraLarge: { w: z[3] || z[1], h: z[2] } }[fam] || { w: z[1], h: z[2] };
    };

    // ----- Bausteine -----
    const url = (pfad) => (d && pfad ? "obsidian://open?vault=" + encodeURIComponent(d.tresor) + "&file=" + encodeURIComponent(pfad) : "");
    const text = (st, s, font, color, zeilen) => {
      const t = st.addText(String(s));
      t.font = font; t.textColor = color; t.lineLimit = zeilen || 1; // verkleinert nur, wo es ausdrücklich gesetzt ist: Zeilen bleiben gleich groß
      return t;
    };
    const neu = (rand) => {
      const w = new ListWidget();
      w.backgroundColor = F.bg;
      const r = rand == null ? 14 : rand;
      w.setPadding(r, r, r, r);
      return w;
    };
    const symbol = (st, name, g, color) => {
      const i = st.addImage(SFSymbol.named(name).image);
      i.imageSize = new Size(g, g); i.tintColor = color;
      return i;
    };
    // Zeile über die ganze Breite b: Das Widget stellt seinen Inhalt als Block in die Mitte; füllt keine Zeile die Breite, rückt
    // kurzer Text von links ab. Eine volle Zeile hält den Block am linken Rand; in ihr gehört hinter den Inhalt eine Lücke, sonst
    // steht er in ihrer Mitte.
    const volleZeile = (w, b) => {
      const z = w.addStack();
      z.layoutHorizontally(); z.centerAlignContent(); z.size = new Size(b, 0);
      return z;
    };
    // Kopf einer Liste: Symbol und Name, rechts leise eine Angabe; statt eines Etiketts in Großbuchstaben
    const kopfZeile = (w, sym, symFarbe, name, rechts) => {
      const k = w.addStack();
      k.layoutHorizontally(); k.centerAlignContent();
      symbol(k, sym, 14, symFarbe);
      k.addSpacer(6);
      text(k, name, fett(15), F.text);
      k.addSpacer();
      if (rechts) text(k, rechts, normal(12), F.faint);
      return k;
    };
    // Fortschritt einer laufenden Sitzung, Breite b: Spur in der Modulfarbe, gefüllt bis jetzt (nur feste Längen, siehe wocheZeichnen)
    const balken = (eltern, s, b, c) => {
      const anteil = Math.max(0, Math.min(1, (nun - min(s.beginn)) / Math.max(1, min(s.ende) - min(s.beginn))));
      const voll = Math.max(4, Math.round(b * anteil));
      const spur = eltern.addStack();
      spur.layoutHorizontally(); spur.size = new Size(b, 4); spur.cornerRadius = 2; spur.backgroundColor = c.spur;
      const f = spur.addStack();
      f.size = new Size(voll, 4); f.cornerRadius = 2; f.backgroundColor = c.kante;
      if (b - voll >= 0.5) spur.addSpacer(b - voll);
    };
    // Kasten einer Sitzung im Raster: Kante links, Fläche, Inhalt; jetzt mit Ring. Mit Breite b hat der Inhalt genau den Rest neben
    // der Kante (ein Stapel fester Größe zeigt schmaleren Inhalt sonst mittig, die Kante stünde dann nicht am Rand).
    const kasten = (eltern, s, b, h, inhalt, vorbei) => {
      const k = eltern.addStack();
      k.layoutHorizontally();
      if (b || h) k.size = new Size(b || 0, h || 0);
      const c = kastenFarben(s, vorbei);
      k.backgroundColor = c.flaeche; k.cornerRadius = 6;
      if (laeuft(s)) { k.borderWidth = 1.5; k.borderColor = c.kante; }
      const kante = k.addStack();
      kante.size = new Size(3, h || 0); kante.backgroundColor = c.kante;
      if (!h) kante.addSpacer();
      const innen = k.addStack();
      innen.layoutVertically();
      if (b) innen.size = new Size(b - 3, h || 0);
      inhalt(innen, b ? b - 3 : 0, c);
      if (!b) k.addSpacer();
      return k;
    };

    // ----- Sitzungen -----
    const wochen = d ? d.wochen || [] : [];
    const alle = [];
    wochen.forEach((w) => (w.sitzungen || []).forEach((s) => alle.push(s)));
    const laeuft = (s) => s.tag === heute && !s.aus && !s.spaeter && min(s.beginn) <= nun && nun < min(s.ende);
    const kommend = alle.filter((s) => !s.aus && !s.spaeter && (s.tag > heute || (s.tag === heute && min(s.ende) > nun)));
    const letzterTag = wochen.length ? plus(wochen[wochen.length - 1].mo, 6) : "";
    const veraltet = !d || d.format !== 1 || heute > letzterTag;
    const OEFFNEN = "Öffne Obsidian auf diesem Gerät, dann ist dein Stundenplan wieder aktuell.";
    const hinweisWidget = (satz, sym) => {
      const w = neu(16);
      const kopf = volleZeile(w, groesse().w - 32);
      symbol(kopf, sym || "calendar", 18, F.faint);
      kopf.addSpacer();
      w.addSpacer();
      text(w, satz, normal(13), F.muted, 5);
      return w;
    };
    const ortZeile = (st, s, g, color) => {
      const z = st.addStack();
      z.layoutHorizontally(); z.centerAlignContent(); z.spacing = 4;
      if (s.online) symbol(z, "video", g, color);
      text(z, s.raum || (s.online ? "online" : ""), normal(g), color);
      return z;
    };
    // Nächster Zeitpunkt, an dem sich etwas ändert (Beginn oder Ende einer Sitzung heute, sonst Mitternacht), frühestens in 5 und
    // spätestens in 30 Minuten: Was Obsidian neu schreibt (ein Ausfall, eine neue Fassung des Zeichners), sieht das Widget erst beim
    // nächsten Zeichnen; bis 30.10.2026 an einem freien Tag erst um Mitternacht
    const wechsel = () => {
      const m = [];
      alle.forEach((s) => { if (s.tag === heute) [min(s.beginn), min(s.ende)].forEach((x) => { if (x > nun) m.push(x); }); });
      const morgen = datum(plus(heute, 1));
      const ziel = m.length ? new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate(), 0, Math.min.apply(null, m)) : morgen;
      return new Date(Math.min(Math.max(ziel.getTime(), jetzt.getTime() + 5 * 60 * 1000), jetzt.getTime() + 30 * 60 * 1000));
    };

    // ===== Stundenplan klein: Als Nächstes =====
    // Das ganze Widget trägt die Farbe des Moduls (das eine kräftige Element der Widgets); oben wann, groß was, darunter wo.
    // Läuft die Sitzung, zeigt ein Balken, wie weit sie ist.
    const naechsteZeichnen = () => {
      const s = kommend[0];
      if (!s) return hinweisWidget(veraltet ? OEFFNEN : (wochen[0] && wochen[0].leer) || "Keine Lehrveranstaltungen.");
      const g = groesse(), R = 14, c = kastenFarben(s);
      const w = neu(R);
      w.backgroundColor = c.flaeche;
      w.url = url(s.notiz);
      const lauf = laeuft(s), n = tageBis(s.tag), bis = min(s.beginn) - nun;
      const kopf = volleZeile(w, g.w - 2 * R);
      text(kopf, lauf ? "Jetzt" : n === 0 ? (bis <= 90 ? "In " + dauer(bis) : "Heute") : n === 1 ? "Morgen" : datumText(s.tag), fett(13), c.titel);
      kopf.addSpacer();
      w.addSpacer(4);
      // Zwei Zeilen nur bei mehreren Wörtern; ein langes Wort („Datenanalyse“) wird kleiner statt mitten im Wort getrennt
      text(w, s.kurz, anzeige(24), F.text, /\s/.test(s.kurz) ? 2 : 1).minimumScaleFactor = 0.6;
      if (s.art) text(w, s.art, normal(13), c.neben);
      if (s.marke) text(w, s.marke, fett(13), c.neben);
      else ortZeile(w, s, 13, c.neben);
      w.addSpacer();
      if (!lauf) { text(w, s.beginn + " – " + s.ende, fett(17), F.text); return w; }
      // Läuft: unten der Balken und wie lange noch, rechts das Ende
      balken(w, s, g.w - 2 * R, c);
      w.addSpacer(6);
      const unten = volleZeile(w, g.w - 2 * R);
      text(unten, "noch " + dauer(min(s.ende) - nun), fett(13), F.text);
      unten.addSpacer();
      text(unten, s.ende, normal(13), c.neben);
      return w;
    };

    // ===== Stundenplan mittel: ein Tag =====
    // Der erste Tag ab heute mit einer Sitzung, die noch kommt; auch ein Tag, an dem sie ausfällt (das will man wissen)
    const tagZeichnen = () => {
      const erster = alle.filter((s) => !s.spaeter && (s.tag > heute || (s.tag === heute && min(s.ende) > nun)))[0];
      const tag = erster ? erster.tag : "";
      if (!tag) return hinweisWidget(veraltet ? OEFFNEN : (wochen[0] && wochen[0].leer) || "Keine Lehrveranstaltungen.");
      const g = groesse(), R = 14, LINKS = 76, ZEILE = 34;
      const w = neu(R);
      w.url = url(d.seiten.stundenplan);
      const reihe = w.addStack();
      reihe.layoutHorizontally();
      // Links der Tag als ein Block wie im Kalender von iOS: Heute, Morgen oder der Wochentag (heute in der Akzentfarbe), groß das
      // Datum, darunter Wochentag bzw. Monat
      const links = reihe.addStack();
      links.layoutVertically(); links.size = new Size(LINKS, g.h - 2 * R);
      const x = datum(tag), n = tageBis(tag);
      text(links, n === 0 ? "Heute" : n === 1 ? "Morgen" : WT_LANG[x.getDay()], fett(13), n === 0 ? F.akzentText : F.muted);
      text(links, String(x.getDate()), anzeige(40), F.text);
      text(links, n <= 1 ? WT_LANG[x.getDay()] : MONAT[x.getMonth()], normal(12), F.muted);
      links.addSpacer();
      // Rechts je Sitzung ein Farbstreifen, Name und Ort, rechts Beginn und Ende; die laufende hinterlegt
      const B = g.w - 2 * R - LINKS;
      const rechts = reihe.addStack();
      rechts.layoutVertically(); rechts.spacing = 6;
      const liste = alle.filter((s) => s.tag === tag && !s.spaeter && (tag > heute || min(s.ende) > nun));
      const MAX = 3;
      liste.slice(0, liste.length > MAX ? MAX - 1 : MAX).forEach((s) => {
        const c = kastenFarben(s), lauf = laeuft(s);
        const z = rechts.addStack();
        z.layoutHorizontally(); z.centerAlignContent(); z.size = new Size(B, ZEILE);
        if (lauf) { z.backgroundColor = c.flaeche; z.cornerRadius = 8; }
        const kante = z.addStack();
        kante.size = new Size(3, ZEILE - (lauf ? 0 : 6)); kante.cornerRadius = lauf ? 0 : 1.5; kante.backgroundColor = c.kante;
        z.addSpacer(8);
        const mitte = z.addStack();
        mitte.layoutVertically();
        const oben = mitte.addStack();
        oben.layoutHorizontally(); oben.spacing = 5;
        text(oben, s.kurz, fett(13), s.aus ? F.muted : F.text);
        if (s.art) text(oben, s.art, normal(13), lauf ? c.neben : F.muted);
        if (s.aus || s.marke) text(mitte, s.aus ? "Fällt aus" : s.marke, fett(11), s.ausnahme ? c.neben : F.muted);
        else ortZeile(mitte, s, 11, lauf ? c.neben : F.muted);
        z.addSpacer();
        const zeit = z.addStack();
        zeit.layoutVertically();
        text(zeit, s.beginn, mittel(12), s.aus ? F.muted : F.text);
        text(zeit, s.ende, normal(11), F.muted);
        if (lauf) z.addSpacer(8);
      });
      if (liste.length > MAX) text(rechts, "und " + (liste.length - MAX + 1) + " weitere", normal(11), F.muted);
      rechts.addSpacer();
      return w;
    };

    // ===== Stundenplan groß: die Woche wie das Raster =====
    // Füllt das Widget genau: Kopf, Tage und Raster haben feste Längen, im Raster steht keine Lücke ohne Länge (die ist auf dem
    // Gerät mindestens 8 pt lang; volle Spalten ragten darum oben hinaus und standen höher als die anderen). Die Schrift wächst mit
    // dem Widget (s, iPhone = 1). Keine Legende: Jeder Kasten nennt sein Modul selbst, die Höhe bekommt das Raster.
    const wocheZeichnen = () => {
      // Die Woche, in der noch etwas kommt (an einem freien Freitag also schon die nächste); sonst die, deren Freitag noch nicht vorbei ist
      const offen = (v) => (v.sitzungen || []).some((x) => !x.aus && !x.spaeter && (x.tag > heute || (x.tag === heute && min(x.ende) > nun)));
      const kommende = wochen.filter((v) => plus(v.mo, 4) >= heute);
      const woche = kommende.filter(offen)[0] || kommende[0];
      if (!woche) return hinweisWidget(OEFFNEN);
      const g = groesse(), xl = fam === "extraLarge", R = 12;
      const s = Math.max(1, Math.min(1.25, g.w / 338, g.h / 354));
      const w = neu(R);
      w.url = url(d.seiten.stundenplan);
      const B = g.w - 2 * R, ACHSE = Math.round(13 * s), LUECKE = 3, KOPF = Math.round(20 * s), TAGE = Math.round(20 * s), ABST = 4;
      const spalte = (B - ACHSE - 4 * LUECKE) / 5;
      const H = g.h - 2 * R - KOPF - TAGE - 2 * ABST;
      const g1 = (xl ? 11 : 9.5) * s, g2 = (xl ? 10 : 8) * s;
      const lh = (gr) => Math.ceil(gr * 1.2); // Höhe einer Textzeile
      // Kopf: wo die Woche zu heute liegt, daneben leise die Vorlesungswoche, rechts die Kalenderwoche
      const kopf = w.addStack();
      kopf.layoutHorizontally(); kopf.size = new Size(B, KOPF); kopf.centerAlignContent();
      text(kopf, woche.mo <= heute ? "Diese Woche" : "Nächste Woche", fett(15 * s), F.text);
      if (woche.text) { kopf.addSpacer(8); text(kopf, woche.text, normal(12 * s), F.muted).minimumScaleFactor = 0.8; }
      kopf.addSpacer();
      text(kopf, "KW " + woche.kw, normal(12 * s), F.faint);
      w.addSpacer(ABST);
      // Tage wie im Kalender von iOS: Wochentag leise, Datum kräftig, heute im Kreis in der Akzentfarbe
      const tage = [0, 1, 2, 3, 4].map((i) => plus(woche.mo, i));
      const leiste = w.addStack();
      leiste.layoutHorizontally(); leiste.size = new Size(B, TAGE); leiste.spacing = LUECKE;
      leiste.addSpacer(ACHSE - LUECKE);
      tage.forEach((t) => {
        const c = leiste.addStack();
        c.layoutHorizontally(); c.size = new Size(spalte, TAGE); c.centerAlignContent();
        const x = datum(t), ist = t === heute;
        c.addSpacer(4);
        text(c, WT[x.getDay()], mittel(g1 + 1), ist ? F.akzentText : F.muted);
        c.addSpacer(4);
        if (ist) {
          const kreis = c.addStack();
          kreis.size = new Size(TAGE, TAGE); kreis.cornerRadius = TAGE / 2; kreis.backgroundColor = F.akzentText; kreis.centerAlignContent();
          text(kreis, String(x.getDate()), fett(g1 + 1), F.bg);
        } else text(c, String(x.getDate()), fett(g1 + 1), F.text);
        c.addSpacer();
      });
      // Inhalt eines Kastens: Name in der Modulfarbe, dann Hinweis (fällt aus, ab …) oder Art, dann der Raum, knapp wie im Raster
      // der App („HS 25 Kupferbau“). Was nicht in eine Zeile passt, bekommt eine zweite, wenn der Kasten hoch genug ist; kleiner
      // wird nur ein langer Name, die Zeilen darunter bleiben in jedem Kasten gleich groß.
      const kastenText = (innen, x, breite, hoehe, c) => {
        innen.setPadding(3, 4, 2, 2);
        let frei = hoehe - 5 - lh(g1);
        text(innen, x.kurz, fett(g1), c.titel).minimumScaleFactor = 0.8;
        const hinweis = x.marke && (x.aus || x.ausnahme || x.spaeter) ? x.marke : "";
        [hinweis || x.art, x.raumKnapp || x.raum].filter(Boolean).forEach((r) => {
          if (frei < lh(g2)) return;
          const n = r.length * g2 * 0.55 > breite - 6 && frei >= 2 * lh(g2) ? 2 : 1;
          text(innen, r, r === hinweis ? fett(g2) : normal(g2), c.neben, n);
          frei -= n * lh(g2);
        });
        if (frei >= 10) innen.addSpacer();
      };
      w.addSpacer(ABST);
      const raster = w.addStack();
      raster.layoutHorizontally(); raster.size = new Size(B, H); raster.spacing = LUECKE;
      const sitz = woche.sitzungen || [];
      if (!sitz.length) {
        raster.addSpacer();
        text(raster, woche.leer || "Keine Lehrveranstaltungen", normal(12), F.muted, 2);
        raster.addSpacer();
      } else {
        const h0 = woche.h0, h1 = Math.max(woche.h1, h0 + 1), proMin = H / ((h1 - h0) * 60);
        const y = (m) => Math.max(0, Math.min(H, (m - h0 * 60) * proMin));
        // Achse: volle Stunden, bei wenig Platz jede zweite
        const achse = raster.addStack();
        achse.layoutVertically(); achse.size = new Size(ACHSE - LUECKE, H);
        const schritt = proMin * 60 < 22 ? 2 : 1;
        for (let st = h0; st < h1; st += schritt) {
          const zelle = achse.addStack();
          zelle.size = new Size(ACHSE - LUECKE, Math.min(schritt, h1 - st) * 60 * proMin);
          zelle.layoutVertically();
          text(zelle, String(st), normal(9 * s), F.faint);
          zelle.addSpacer();
        }
        // Vorbei: an einem früheren Tag dieser Woche oder heute schon zu Ende (blass)
        const vorbei = (x) => x.tag < heute || (x.tag === heute && min(x.ende) <= nun);
        tage.forEach((t) => {
          const col = raster.addStack();
          col.layoutVertically(); col.size = new Size(spalte, H);
          if (t === heute) { col.backgroundColor = F.heute; col.cornerRadius = 6; }
          // Überschneidungen: Gruppen, darin Bahnen nebeneinander (wie woche.js spalten, ohne die schmalen blassen Kästen)
          const liste = sitz.filter((s) => s.tag === t).map((s) => ({ s, a: y(min(s.beginn)), e: y(min(s.ende)) })).sort((p, q) => p.a - q.a || q.e - p.e);
          const gruppen = [];
          liste.forEach((k) => {
            const g2 = gruppen[gruppen.length - 1];
            if (g2 && k.a < g2.e) { g2.k.push(k); g2.e = Math.max(g2.e, k.e); } else gruppen.push({ a: k.a, e: k.e, k: [k] });
          });
          let oben = 0;
          gruppen.forEach((gr) => {
            if (gr.a - oben >= 0.5) col.addSpacer(gr.a - oben);
            const bahnen = [];
            gr.k.forEach((k) => {
              const b = bahnen.filter((x) => x.e <= k.a)[0];
              if (b) { b.k.push(k); b.e = k.e; } else bahnen.push({ e: k.e, k: [k] });
            });
            const zeile = col.addStack();
            zeile.layoutHorizontally(); zeile.spacing = 2;
            const bb = (spalte - 2 * (bahnen.length - 1)) / bahnen.length;
            zeile.size = new Size(spalte, gr.e - gr.a);
            bahnen.forEach((b) => {
              const bahn = zeile.addStack();
              bahn.layoutVertically(); bahn.size = new Size(bb, gr.e - gr.a);
              let o = gr.a;
              b.k.forEach((k) => {
                if (k.a - o >= 0.5) bahn.addSpacer(k.a - o);
                const hoehe = Math.max(8, k.e - k.a - 1.5);
                kasten(bahn, k.s, bb, hoehe, (innen, breite, c) => kastenText(innen, k.s, breite, hoehe, c), vorbei(k.s));
                o = k.a + hoehe + 1.5;
              });
              if (gr.e - o >= 0.5) bahn.addSpacer(gr.e - o);
            });
            oben = gr.e;
          });
          if (H - oben >= 0.5) col.addSpacer(H - oben);
        });
      }
      return w;
    };

    // ===== Fristen =====
    const fristenOffen = () => (d.fristen || []).filter((f) => f.ueberfaellig || f.tag >= heute);
    // Wie dringend: heute, morgen oder überfällig rot, diese Woche Bernstein, sonst leise
    const dringFarbe = (n, ueber) => (ueber || n <= 1 ? F.bad : n <= 7 ? F.warnText : F.muted);
    // Datum als Block wie im Kalender: oben klein der Wochentag (Fristen, nah) bzw. der Monat (Prüfungen, oft Monate weg), darunter
    // groß der Tag (Breite 34)
    const datumBlock = (z, tag, farbe2, monat) => {
      const b = z.addStack();
      b.layoutVertically(); b.size = new Size(34, 0);
      const x = datum(tag);
      text(b, monat ? MON[x.getMonth()] : WT[x.getDay()], mittel(11), farbe2 || F.muted);
      text(b, String(x.getDate()), anzeige(19), farbe2 || F.text);
    };
    const fristKlein = () => {
      // Die nächste Frist; ist die kurze Liste aufgebraucht (Obsidian lange zu), die nächste aus „Fristen · 30 Tage“ wie im Widget mittel
      const zeile = fristenOffen().filter((x) => !x.ueberfaellig)[0];
      const f = (d.naechsteFristen || []).filter((x) => (x.laeuft ? x.ende : x.tag) >= heute)[0]
        || (zeile && { was: zeile.was, tag: zeile.tag, ende: zeile.tag, laeuft: zeile.laeuft, pfad: zeile.pfad });
      const w = neu(14);
      w.url = url((f && f.pfad) || d.seiten.fristen);
      const kopf = volleZeile(w, groesse().w - 28);
      if (!f) {
        symbol(kopf, "hourglass", 15, F.faint);
        kopf.addSpacer();
        w.addSpacer();
        text(w, "Keine offenen Fristen", anzeige(17), F.text, 3);
        return w;
      }
      const laufend = f.laeuft || f.tag < heute, n = tageBis(f.tag), ton = laufend ? F.warnText : dringFarbe(n);
      symbol(kopf, "hourglass", 15, ton);
      kopf.addSpacer();
      text(kopf, laufend ? "läuft" : n === 0 ? "heute" : n === 1 ? "morgen" : "in " + n + " Tagen", fett(13), ton);
      w.addSpacer(10);
      text(w, f.was, anzeige(18), F.text, 4).minimumScaleFactor = 0.8;
      w.addSpacer();
      text(w, laufend ? "bis " + datumText(f.ende) : datumText(f.tag, true), normal(12), F.muted);
      if (f.geschaetzt) text(w, "Datum geschätzt", normal(11), F.muted);
      return w;
    };
    const fristenListe = (gross) => {
      const w = neu(gross ? 16 : 14);
      w.url = url(d.seiten.fristen);
      kopfZeile(w, "hourglass", F.warn, "Fristen", "30 Tage");
      w.addSpacer(gross ? 12 : 8);
      // Mittel: so viele Zeilen, wie in die Höhe passen (iPhone 2, iPad 3)
      const liste = fristenOffen(), MAX = gross ? 6 : Math.floor((groesse().h - 28 - 20) / 42);
      if (!liste.length) text(w, "Keine Fristen in den nächsten 30 Tagen.", normal(13), F.muted, 2);
      liste.slice(0, MAX).forEach((f, i) => {
        if (i) w.addSpacer(gross ? 10 : 8);
        const z = w.addStack();
        z.layoutHorizontally(); z.centerAlignContent(); z.spacing = 10;
        if (f.pfad) z.url = url(f.pfad);
        const n = tageBis(f.tag), ton = f.ueberfaellig ? F.bad : f.laeuft ? F.warnText : dringFarbe(n);
        datumBlock(z, f.tag, f.ueberfaellig ? F.bad : null);
        const mitte = z.addStack();
        mitte.layoutVertically();
        text(mitte, f.was, fett(13), F.text, gross ? 2 : 1);
        const unter = f.ueberfaellig ? "überfällig" : f.laeuft ? "läuft bis " + datumText(f.tag) : [f.uhr, f.pille].filter(Boolean).join(", ");
        if (unter) text(mitte, unter, normal(11), f.ueberfaellig || f.laeuft ? ton : F.muted);
        z.addSpacer();
        if (!f.ueberfaellig && !f.laeuft) text(z, n === 0 ? "heute" : n === 1 ? "morgen" : "in " + n + " Tagen", fett(12), ton);
      });
      w.addSpacer();
      return w;
    };

    // ===== Prüfungen =====
    const pruefungenOffen = () => (d.pruefungen || []).filter((p) => p.tag >= heute);
    const pruefungKlein = () => {
      const p = pruefungenOffen()[0];
      const w = neu(14);
      w.url = url((p && p.pfad) || d.seiten.pruefungen);
      const n = p ? tageBis(p.tag) : 0;
      const kopf = volleZeile(w, groesse().w - 28);
      symbol(kopf, "graduationcap", 16, p ? dringFarbe(n) : F.faint);
      kopf.addSpacer();
      w.addSpacer();
      if (!p) { text(w, "Termin folgt", anzeige(18), F.text); return w; }
      const zahl = w.addStack();
      zahl.layoutHorizontally(); zahl.bottomAlignContent(); zahl.spacing = 5;
      text(zahl, n === 0 ? "Heute" : n === 1 ? "Morgen" : String(n), anzeige(n > 1 ? 44 : 28), F.text);
      if (n > 1) text(zahl, "Tage", fett(14), F.muted);
      w.addSpacer(4);
      text(w, p.was, fett(13), F.text, 2);
      text(w, datumText(p.tag) + (p.uhr ? ", " + p.uhr : ""), normal(12), F.muted);
      return w;
    };
    const pruefungenListe = (gross) => {
      const w = neu(gross ? 16 : 14);
      w.url = url(d.seiten.pruefungen);
      kopfZeile(w, "graduationcap", F.bad, "Prüfungen");
      w.addSpacer(gross ? 12 : 8);
      const liste = pruefungenOffen();
      if (!liste.length) text(w, "Termine kommen ab Mitte November bzw. Mai.", normal(13), F.muted, 2);
      liste.slice(0, gross ? 4 : Math.floor((groesse().h - 28 - 20) / 42)).forEach((p, i) => {
        if (i) w.addSpacer(gross ? 10 : 8);
        const z = w.addStack();
        z.layoutHorizontally(); z.centerAlignContent(); z.spacing = 10;
        if (p.pfad) z.url = url(p.pfad);
        const n = tageBis(p.tag);
        datumBlock(z, p.tag, null, true);
        const mitte = z.addStack();
        mitte.layoutVertically();
        text(mitte, p.was, fett(13), F.text, 1);
        text(mitte, WT_LANG[datum(p.tag).getDay()] + (p.uhr ? ", " + p.uhr : "") + (p.geschaetzt ? " (geschätzt)" : ""), normal(11), F.muted);
        z.addSpacer();
        const zahl = z.addStack();
        zahl.layoutHorizontally(); zahl.bottomAlignContent(); zahl.spacing = 3;
        text(zahl, n === 0 ? "heute" : n === 1 ? "morgen" : String(n), anzeige(n > 1 ? 20 : 15), n <= 7 ? F.bad : F.text);
        if (n > 1) text(zahl, "Tage", normal(11), F.muted);
      });
      w.addSpacer();
      return w;
    };

    // ===== Sperrbildschirm =====
    const sperre = (art) => {
      const w = new ListWidget();
      const rund = fam === "accessoryCircular", eine = fam === "accessoryInline";
      if (rund) w.addAccessoryWidgetBackground = true;
      const zeile = (s, font) => { const t = w.addText(s); t.font = font; t.lineLimit = 1; t.minimumScaleFactor = 0.6; if (rund) t.centerAlignText(); return t; };
      if (art === "stundenplan") {
        const s = kommend[0];
        if (!s) { zeile(veraltet ? "Obsidian öffnen" : "Keine Sitzungen", normal(12)); return w; }
        w.url = url(s.notiz);
        const wann = laeuft(s) ? "bis " + s.ende : tageBis(s.tag) === 0 ? s.beginn : tagText(s.tag).slice(0, 2) + " " + s.beginn;
        if (eine) { zeile(s.kurz + " " + wann + (s.raum ? " · " + s.raum : ""), normal(12)); return w; }
        if (rund) { zeile(s.kurz, fett(11)); zeile(laeuft(s) ? s.ende : s.beginn, normal(10)); return w; }
        zeile(wann + "  " + s.kurz, fett(14));
        if (s.art) zeile(s.art, normal(12));
        zeile(s.marke || s.raum, normal(12));
        return w;
      }
      if (art === "fristen") {
        const f = fristenOffen()[0];
        if (!f) { zeile("Keine Fristen", normal(12)); return w; }
        w.url = url(f.pfad || d.seiten.fristen);
        const wann = f.ueberfaellig ? "überfällig" : f.laeuft ? "bis " + kurzDatum(f.tag) : tagText(f.tag);
        if (eine) { zeile(wann + ": " + f.was, normal(12)); return w; }
        if (rund) { zeile(String(Math.max(0, tageBis(f.tag))), fett(18)); zeile("Tage", normal(9)); return w; }
        zeile("Frist " + wann, fett(14));
        const t = w.addText(f.was); t.font = normal(12); t.lineLimit = 2;
        return w;
      }
      const p = pruefungenOffen()[0];
      if (!p) { zeile("Prüfung: Termin folgt", normal(12)); return w; }
      w.url = url(p.pfad || d.seiten.pruefungen);
      const n = tageBis(p.tag);
      if (eine) { zeile(p.was + " " + abstand(p.tag), normal(12)); return w; }
      if (rund) { zeile(String(n), fett(18)); zeile("Tage", normal(9)); return w; }
      zeile(p.was, fett(14));
      zeile(kurzDatum(p.tag), normal(12));
      zeile(abstand(p.tag), normal(12));
      return w;
    };

    // ----- Auswahl: Parameter des Widgets, sonst das Skript (Stundenplan, Fristen, Prüfungen; S.art vom Lader) -----
    const param = String((S.args && S.args.widgetParameter) || S.art || "").trim().toLowerCase();
    const art = /^(frist|termin)/.test(param) ? "fristen" : /^(pr(ü|ue)f|klausur|exam)/.test(param) ? "pruefung" : "stundenplan";
    const bauen = () => {
      let w;
      if (!d) w = hinweisWidget(OEFFNEN);
      else if (/^accessory/.test(fam)) w = sperre(art);
      else if (art === "fristen") w = fam === "small" ? fristKlein() : fristenListe(fam !== "medium");
      else if (art === "pruefung") w = fam === "small" ? pruefungKlein() : pruefungenListe(fam !== "medium");
      else w = fam === "small" ? naechsteZeichnen() : fam === "medium" ? tagZeichnen() : wocheZeichnen();
      w.refreshAfterDate = wechsel();
      return w;
    };
    // In der App gestartet (Lader seit 29.10.2026, S.app): sagen, dass alles bereit ist, wie das Widget auf den Home-Bildschirm
    // kommt, und jede Größe als Vorschau zeigen, bis „Fertig“. Gibt dann nichts zurück; ein älterer Lader zeigt das Widget selbst.
    if (S.app && S.Alert && d) {
      const GROESSEN = [["Klein", "small", "presentSmall"], ["Mittel", "medium", "presentMedium"], ["Groß", "large", "presentLarge"]];
      const name = S.name || "Stundenplan";
      for (let erst = true; ; erst = false) {
        const a = new S.Alert();
        a.title = erst ? "Alles bereit" : "Noch eine Größe ansehen?";
        a.message = erst ? "„" + name + "“ liest jetzt deinen Tresor „" + d.tresor + "“.\n\nSo kommt das Widget auf den Home-Bildschirm: Finger auf "
          + "eine freie Stelle halten, Bearbeiten oder + tippen, Scriptable und eine Größe wählen. Dann das neue Widget gedrückt halten, Widget "
          + "bearbeiten tippen und bei Script „" + name + "“ wählen.\n\nSo sieht es aus:" : "";
        GROESSEN.forEach((g) => a.addAction(g[0]));
        a.addCancelAction("Fertig");
        const wahl = await a.present();
        if (!(wahl >= 0)) return null;
        fam = GROESSEN[wahl][1];
        await bauen()[GROESSEN[wahl][2]]();
      }
    }
    return bauen();
  };

  // ---------- Schreiben (nur iPhone und iPad) ----------
  const P = () => ctx.obsidian.Platform || {};
  const aufIos = () => !!P().isIosApp;
  const ordner = () => (ctx.plugin && ctx.plugin.manifest && ctx.plugin.manifest.dir) || app.vault.configDir + "/plugins/studium-autopilot";
  const geschrieben = ctx.bleibend("geschrieben", () => ({}));
  const schreiben = async (pfad, inhalt, gleich) => {
    const a = app.vault.adapter;
    let alt = geschrieben[pfad];
    if (alt === undefined) alt = (await a.exists(pfad)) ? await a.read(pfad) : "";
    if (gleich(alt) !== gleich(inhalt)) await a.write(pfad, inhalt);
    geschrieben[pfad] = inhalt;
  };
  const exportieren = async () => {
    if (!aufIos() || !ctx.modell || !ctx.modell.planwoche || !ctx.user.woche || !ctx.user.dashboard) return;
    const W = ctx.user.woche(ctx), D = ctx.user.dashboard(ctx), Dar = ctx.darstellung;
    const daten = datenBauen({ W, D, M: ctx.modell, eingaben: W.eingaben(), jetzt: ctx.date.jetzt(), tresor: app.vault.getName(),
      design: Dar ? Dar.design() : "elfenbein", modus: Dar ? Dar.modus() : "automatisch" });
    const o = ordner();
    await schreiben(o + "/" + ZEICHNER, "(" + scriptable.toString() + ")\n", (t) => t);
    await schreiben(o + "/widget-" + (P().isTablet ? "ipad" : "iphone") + ".json", JSON.stringify(daten, null, 1) + "\n", ohneStand);
  };
  const sicher = () => { exportieren().catch((e) => console.error("Widget", e)); };

  // ---------- Fenster „Widgets“ ----------
  const Modal = ctx.obsidian.Modal;
  // Wo der Tresor liegt, so wie die Dateiauswahl von iOS es nennt (für die Anleitung im Lader): iCloud Drive, sonst auf dem Gerät.
  // pfad: die file://-Adresse einer Datei im Tresor (auf iPhone und iPad ist basePath nur der Name des Tresors, geprüft 29.10.2026)
  const ort = (pfad) => (/Mobile( |%20)Documents|iCloud~md~obsidian/.test(String(pfad || "")) ? "iCloud Drive" : "Auf meinem " + (P().isTablet ? "iPad" : "iPhone"));
  const nativ = (p) => { const a = app.vault.adapter || {}; try { return a.getNativePath ? a.getNativePath(p) : a.basePath || ""; } catch (e) { return ""; } };
  // Datei für Scriptable (Format seiner Skript-Dateien, JSON): Antippen öffnet Scriptable mit Name, Symbol und „Add to My Scripts“
  // (am iPad geprüft 29.10.2026, aus Safari). Kommt als „Stundenplan“; dessen erster Lauf legt Fristen und Prüfungen dazu an.
  const skriptDatei = (o) => JSON.stringify({ always_run_in_app: false, icon: { color: "deep-blue", glyph: "calendar-alt" }, name: "Stundenplan",
    script: lader(Object.assign({}, o, { art: "stundenplan" })), share_sheet_inputs: [] });
  // „In Scriptable einrichten“: erst die Dateien schreiben (der Start kann keine 15 s her sein), dann die Datei an Scriptable geben.
  // Wie aus Safari, ohne Auswahl: die Datei über ihre file://-Adresse öffnen (getNativePath), iOS gibt sie der App, der die Endung
  // gehört. Am iPad geprüft 29.10.2026; Obsidians „In anderer App öffnen“ (app.openWithDefaultApp) zeigte dagegen das Teilen-Menü,
  // die Dateien-App (shareddocuments://), Safari (data:) und ein Download öffneten Scriptable nicht. Ohne getNativePath das
  // Teilen-Menü, ohne beides wie bis 29.10.2026: den Lader kopieren, in Scriptable ein leeres Skript öffnen (scriptable:///add).
  const DATEI = "Stundenplan.scriptable";
  const einrichtenStarten = async () => {
    await exportieren().catch((e) => console.error("Widget", e));
    const a = app.vault.adapter, pfad = ordner() + "/" + DATEI;
    const o = { tresor: app.vault.getName(), ort: ort(nativ(pfad)) };
    try {
      if (a.getNativePath || typeof app.openWithDefaultApp === "function") await a.write(pfad, skriptDatei(o));
      if (a.getNativePath) { window.open(a.getNativePath(pfad)); return; }
      if (typeof app.openWithDefaultApp === "function") { await app.openWithDefaultApp(pfad); return; }
    } catch (e) { console.error("Widget: Datei an Scriptable", e); }
    try { await navigator.clipboard.writeText(lader(o)); } catch (e) { ctx.hinweis("Kopieren ging nicht."); return; }
    ctx.hinweis("In Scriptable öffnet sich ein leeres Skript. Finger draufhalten, Einsetzen tippen, dann das Dreieck.");
    window.open("scriptable:///add");
  };
  // Vier Schritte (seit 29.10.2026; vorher sechs mit Lesezeichen, Namen und Parameter von Hand): je Schritt eine Handlung, so
  // beschriftet, wie Scriptable und iOS es zeigen. Den Zugriff auf den Tresor erklärt Scriptable selbst (einrichten), dort, wo er
  // passiert, und es prüft, ob er geklappt hat.
  class Fenster extends (Modal || class {}) {
    constructor() { super(app); }
    onOpen() {
      this.modalEl.addClass("eba-modal", "eba-modal-widget");
      this.titleEl.setText("Widgets");
      const c = this.contentEl;
      c.createEl("p", { cls: "eba-modal-text", text: "Sieh deinen Stundenplan, deine Fristen oder die nächste Prüfung direkt auf dem Home-Bildschirm, "
        + "ohne Obsidian zu öffnen. Dafür brauchst du die kostenlose App Scriptable." });
      if (!aufIos()) { c.createEl("p", { cls: "eba-modal-hinweis", text: "Widgets gibt es auf iPhone und iPad. Öffne diese Seite dort." }); return; }
      const ol = c.createEl("ol", { cls: "eba-modal-schritte" });
      const li = ol.createEl("li");
      li.appendText("Lade ");
      li.createEl("a", { text: "Scriptable", href: SCRIPTABLE, cls: "external-link", attr: { target: "_blank", rel: "noopener" } });
      li.appendText(" aus dem App Store.");
      // teile: abwechselnd Text und Fettes (Knopf, Ort)
      const schritt = (teile) => { const l = ol.createEl("li"); teile.forEach((t, i) => (i % 2 ? l.createEl("b", { text: t }) : l.appendText(t))); };
      // Den Zugriff auf den Tresor erklärt Scriptable dort, wo er passiert; ein eigener Schritt dafür kündigte das nur an (gestrichen
      // 29.10.2026, Rückmeldung: „Kann man Schritt 3 nicht einfach weglassen? Was bringt es Nutzern?“)
      schritt(["Tippe unten auf ", "In Scriptable einrichten", ". Scriptable öffnet sich: Tippe auf ", "Add to My Scripts",
        ", dann in der Liste auf ", "Stundenplan", " und folge den Hinweisen."]);
      schritt(["Halte den Finger auf eine freie Stelle des Home-Bildschirms, tippe auf ", "Bearbeiten", " oder ", "+", " und wähle ", "Scriptable",
        ". Halte dann das neue Widget gedrückt, tippe auf ", "Widget bearbeiten", " und wähle ", "Stundenplan", ", ", "Fristen", " oder ", "Prüfungen", "."]);
      c.createEl("p", { cls: "eba-modal-hinweis", text: "Der Stundenplan zeigt klein, was als Nächstes kommt, mittel deinen Tag und groß deine Woche. "
        + "Auf dem Sperrbildschirm geht es genauso. Öffne Obsidian ab und zu, dann bleibt das Widget aktuell." });
      const fuss = c.createDiv({ cls: "modal-button-container" });
      fuss.createEl("button", { text: "In Scriptable einrichten", cls: "mod-cta" }).addEventListener("click", () => { einrichtenStarten(); });
    }
    onClose() { this.contentEl.empty(); }
  }

  const registrieren = () => {
    if (!aufIos()) return;
    const bald = ctx.entprellen(sicher, 2000);
    if (ctx.modell && ctx.modell.beiAenderung) ctx.aufraeumen(ctx.modell.beiAenderung(bald));
    // In den Hintergrund: gleich schreiben, iOS lädt die Widgets danach gern neu
    ctx.dom(document, "visibilitychange", () => { if (document.visibilityState === "hidden") sicher(); });
    ctx.intervall(sicher, TAKT);
    ctx.zeit(sicher, ERSTES);
  };

  const aktionen = {
    widget: { titel: "Widgets für den Home-Bildschirm", ausfuehren: async () => { new Fenster().open(); } },
  };

  return { registrieren, aktionen, datenBauen, ohneStand, lader, skriptDatei, einrichten, scriptable, exportieren, ort, SEITEN };
};
