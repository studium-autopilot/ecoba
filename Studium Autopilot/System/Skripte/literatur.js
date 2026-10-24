// Literaturlisten (seit 24.10.2026): je Modul eine Notiz „<Code> Literatur 00 Literaturliste“ im Ordner Literatur des Modulordners
// (Unterlagen/<Code> <Modultitel>/Literatur/), aus den zentralen Literaturlisten (literatur.json; zentral.js holt sie gerätelokal,
// docs/daten-v1.md). Inhalt nur Fakten: je Werk Rolle, Angabe und Links (Verlag, UB-Katalog), „Lesen je Kapitel“ als Tabelle (eine
// Spalte je Werk mit `spalte`), „Weitere Literatur“. Folien und andere Unterlagen, auf die die Liste verweist, verlinkt die Notiz,
// wenn ihre Begleitnotiz im Tresor liegt, sonst stehen sie als Text da. Die Unterlagen-Liste des Moduls zeigt die Notiz unter
// „Literatur“ als erste Zeile (nummer 0; `link` = erste Online-Fassung für das ↗).
// Die Notiz gehört der Liste (herkunft: zentral, literatur_id: <code klein>). Dir gehören `status`, `datum`, `tags`, eigene
// Eigenschaften und alles unter „## Meine Notizen“; das bleibt bei jeder neuen Liste. Geschrieben wird nur auf dem Abrufer
// (ctx.zentral.abruferHier, ein Schreiber wie bei den Terminen), nur für Module des laufenden Semesters, die du belegst (dieselbe
// Auswahl wie die Lernplan-Notizen), und nur, wenn sich die Liste oder ihre Ziele im Tresor (neue Folien) geändert haben. Was
// geschrieben ist, steht in der Sperr-Datei des Abrufers (System/Daten/abruf.json, Feld „literatur“: { angewendet: Code → kurzHash
// der Liste, ziele: Code → kurzHash der verlinkten Unterlagen }), dazu eine Kopie je Gerät (KOPIE, wie bei lernplan.js): Eine
// gelöschte Notiz entsteht erst wieder, wenn sich ihre Liste ändert. Eine Notiz mit anderer herkunft fasst das Skript nie an, es
// löscht, verschiebt und benennt nichts um. Eine Notiz mit literatur_id ohne herkunft (vor dieser Fassung schrieb der Uni-Abgleich
// des Autors so in seinen eigenen Tresor) übernimmt es an ihrem Ort, samt Status und eigenem Text.
// Für Tests: notizText, auswahl, ordnerName, zieleVon.
// iOS-sicher: keine Node-APIs, kein Lookbehind, kein .at()/findLast/structuredClone.
module.exports = function (ctx) {
  const app = window.app;
  const STAND = "System/Daten/abruf.json";
  const KOPIE = "eba-literatur-angewendet";
  const ZIEL = "Unterlagen";
  const ORDNER_TITEL_MAX = 45; // Zeichen Modultitel im Ordnernamen (wie unterlagen.js)
  const FUELL = /^(zu|zur|zum|vom|von|the|of|for|and|und|der|die|das|am|im|on|in|an|to|für|fuer)$/i;
  const FERTIG = ["bestanden", "anerkannt"];
  const KATALOG = "https://rds-tue.ibs-bw.de/opac/RDSIndexrecord/";
  const SUCHE = "https://rds-tue.ibs-bw.de/opac/RDSIndex/Search?";
  const MEINE = "## Meine Notizen";
  // Felder, die die Liste schreibt; alle anderen (status, datum, tags, eigene) bleiben aus der alten Notiz
  const LISTE_FELDER = ["typ", "code", "modul", "art", "nummer", "titel", "datei", "link", "original", "format", "seiten", "semester",
    "quelle", "herkunft", "literatur_id", "uebersicht", "cssclasses"];

  const fmVon = (f) => (f && app.metadataCache.getFileCache(f) && app.metadataCache.getFileCache(f).frontmatter) || {};
  const pad = (n) => String(n).padStart(2, "0");
  const J = (v) => JSON.stringify(v == null ? "" : v);
  // Daten sind reiner Text (zentral.js literaturPruefen); Markdown darin entschärfen, am Zeilenanfang auch Listen
  const md = (s) => String(s).replace(/[\\`*_\[\]<>#|!$%~=^{}]/g, "\\$&");
  const mdZeile = (s) => md(s).replace(/^(\d+)([.)])/, "$1\\$2").replace(/^([-+])/, "\\$1");
  const suchLink = (s) => SUCHE + "lookfor=" + encodeURIComponent(s).replace(/%20/g, "+")
    .replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase()) + "&type=AllFields";

  // ---------- Ordner und Ziele im Tresor ----------
  // Name wie unterlagen.js (modulOrdnerPlan): vorhandener Ordner „<Code>“ bzw. „<Code> …“, sonst „<Code> <Modultitel>“
  const sauber = (s) => ctx.user.eba.dateiTitel(String(s).normalize("NFC")).replace(/[.\s-]+$/, "").replace(/^[.\s-]+/, "");
  const kuerzen = (s, max) => {
    if (s.length <= max) return s;
    const t = s.slice(0, max + 1), i = t.lastIndexOf(" ");
    return (i > max / 2 ? t.slice(0, i) : s.slice(0, max)).trim();
  };
  const fuellWeg = (s) => {
    const w = s.split(" ").filter(Boolean);
    while (w.length && FUELL.test(w[0])) w.shift();
    while (w.length && FUELL.test(w[w.length - 1])) w.pop();
    return w.join(" ");
  };
  // ordner = Namen der Ordner direkt in Unterlagen/
  const ordnerName = (code, titel, ordner) => {
    const da = ordner.filter((n) => n === code || n.indexOf(code + " ") === 0).sort()[0];
    if (da) return da;
    return sauber(`${code} ${fuellWeg(sauber(kuerzen(sauber(titel || ""), ORDNER_TITEL_MAX)).replace(/[,;:]+$/, ""))}`) || code;
  };
  const unterordner = (p) => {
    const o = app.vault.getAbstractFileByPath(p);
    return o && Array.isArray(o.children) ? o.children.filter((k) => Array.isArray(k.children)).map((k) => k.name) : [];
  };
  // Begleitnotizen der Unterlagen eines Moduls: "Art|Nummer" → { notiz (Name), pdf (Dateiname oder "") }; die Literaturliste selbst
  // und der Volltext zählen nicht, bei mehreren gilt die erste nach Pfad
  const LINKBAR = /^[^\[\]|#^\\/]+$/;
  const unterlagenVon = (code) => {
    const aus = {};
    const notizen = app.vault.getMarkdownFiles().filter((f) => f.path.indexOf(ZIEL + "/") === 0 && f.path.indexOf("/_Volltext/") < 0)
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    for (const f of notizen) {
      const fm = fmVon(f);
      if (fm.typ !== "unterlage" || fm.code !== code || fm.literatur_id || !Number.isInteger(fm.nummer) || !LINKBAR.test(f.basename)) continue;
      const k = `${fm.art}|${fm.nummer}`;
      if (aus[k]) continue;
      const m = String(fm.datei || "").match(/^\[\[([^\]|#]+\.pdf)\]\]$/i);
      aus[k] = { notiz: f.basename, pdf: m && LINKBAR.test(m[1]) ? m[1] : "" };
    }
    return aus;
  };
  // Alle Unterlagen, auf die die Liste verweist, mit ihrem Ziel im Tresor (für Text und Prüfsumme)
  const zieleVon = (e, unterlagen) => {
    const ziele = {};
    const dazu = (u) => { if (u) { const k = `${u.art}|${u.nummer}`; ziele[k] = unterlagen[k] || null; } };
    dazu(e.beleg);
    for (const z of e.lesen) dazu(z.beleg);
    for (const w of e.werke) for (const l of w.links) dazu(l.unterlage);
    return ziele;
  };

  // ---------- Notiztext ----------
  const belegText = (u) => `${u.art} ${pad(u.nummer)}` + (u.seite ? `, S. ${u.seite}` : "");
  // Verweis auf eine Unterlage: PDF mit Seite, sonst die Begleitnotiz, sonst Text (ohne Unterlage im Tresor kein toter Link)
  const verweis = (u, text, ziele, inTabelle) => {
    const z = ziele[`${u.art}|${u.nummer}`], strich = inTabelle ? "\\|" : "|";
    if (z && z.pdf) return `[[${z.pdf}${u.seite ? "#page=" + u.seite : ""}${strich}${md(text)}]]`;
    if (z) return `[[${z.notiz}${strich}${md(text)}]]`;
    return "";
  };
  // Link nach außen, wie „Öffnen ↗“ in den Begleitnotizen
  const aussen = (text, url) => `[${text} ↗](${url})`;
  const werkZeile = (w, ziele) => {
    let kopf = `- **${md(w.rolle)}:** ${md(w.angabe)}` + (/[.!?]$/.test(w.angabe) ? "" : ".");
    if (w.hinweis) kopf += " " + md(w.hinweis);
    const teile = [kopf];
    for (const l of w.links) {
      if (l.url) teile.push(aussen(md(l.text), l.url));
      else { const v = verweis(l.unterlage, l.text, ziele, false); if (v) teile.push(v); }
    }
    if (w.katalog) teile.push(aussen("UB-Katalog", KATALOG + w.katalog));
    else if (w.suche) teile.push(aussen("UB-Katalog", suchLink(w.suche)));
    return teile.join(" · ");
  };
  const koerper = (e, ziele) => {
    const z = [`# ${e.code} · Literatur 00 · Literaturliste`, "", "## Das Wichtigste"];
    let satz = e.hinweis ? mdZeile(e.hinweis) : "Literatur, die die Lehrveranstaltung nennt.";
    if (e.beleg) satz += " → " + (verweis(e.beleg, belegText(e.beleg), ziele, false) || md(belegText(e.beleg)));
    z.push(satz, "");
    for (const w of e.werke) if (w.abschnitt === "haupt") z.push(werkZeile(w, ziele));
    const spalten = e.werke.filter((w) => w.spalte);
    if (e.lesen.length) {
      z.push("", `## Lesen je ${md(e.kopf)}`, `| ${md(e.kopf)} | ${spalten.map((w) => md(w.spalte)).join(" | ")} |`,
        "| --- |" + " --- |".repeat(spalten.length));
      for (const r of e.lesen) {
        let zu = md(r.zu);
        if (r.beleg) zu += " · " + (verweis(r.beleg, r.beleg.seite ? `S. ${r.beleg.seite}` : belegText(r.beleg), ziele, true) || md(belegText(r.beleg)));
        z.push(`| ${zu} | ${spalten.map((w) => (r.stellen[w.id] ? md(r.stellen[w.id]) : "–")).join(" | ")} |`);
      }
    }
    const weitere = e.werke.filter((w) => w.abschnitt === "weitere");
    if (weitere.length) z.push("", "## Weitere Literatur", ...weitere.map((w) => werkZeile(w, ziele)));
    return z.join("\n") + "\n";
  };
  // Frontmatter der alten Notiz: Feld → seine Zeilen (samt eingerückten Folgezeilen), in der Reihenfolge der Notiz
  const felderLesen = (alt) => {
    const m = String(alt || "").match(/^---\r?\n([\s\S]*?)\r?\n---/);
    const aus = [];
    if (m) for (const roh of m[1].split("\n")) {
      const z = roh.replace(/\r$/, ""), feld = z.match(/^([^\s:#-][^:]*):/);
      if (feld) aus.push({ name: feld[1].trim(), zeilen: [z] });
      else if (aus.length) aus[aus.length - 1].zeilen.push(z);
    }
    return aus;
  };
  // e = geprüfter Eintrag, modul = Name der Modulnotiz, alt = bisheriger Text oder "", heute = JJJJ-MM-TT
  const notizText = (e, modul, ziele, alt, heute) => {
    const felder = felderLesen(alt);
    const von = (name) => { const f = felder.filter((x) => x.name === name)[0]; return f ? f.zeilen : null; };
    const online = e.werke.filter((w) => w.abschnitt === "haupt").concat(e.werke).map((w) => w.links.filter((l) => l.url)[0]).filter(Boolean)[0];
    const eigene = [].concat(...felder.filter((x) => LISTE_FELDER.indexOf(x.name) < 0 && ["status", "datum", "tags"].indexOf(x.name) < 0).map((x) => x.zeilen));
    const fm = ["---", "typ: unterlage", `code: ${J(e.code)}`, `modul: ${J(modul ? `[[${modul}]]` : "")}`, 'art: "Literatur"', "nummer: 0",
      'titel: "Literaturliste"', 'datei: ""', `link: ${J(online ? online.url : "")}`, 'original: ""', 'format: ""', "seiten:",
      `semester: ${J(e.semester)}`, ...(von("status") || ["status: neu"]), ...(von("datum") || [`datum: ${heute}`]), `quelle: ${J(e.quelle)}`,
      "herkunft: zentral", `literatur_id: ${e.code.toLowerCase()}`, ...eigene, 'uebersicht: "[[Unterlagen]]"', "cssclasses:", "  - eba-s-begleitnotiz",
      ...(von("tags") || ["tags:", "  - unterlage"]), "---"];
    const i = String(alt || "").indexOf("\n" + MEINE);
    const meine = i >= 0 ? String(alt).slice(i + 1).replace(/\s+$/, "") : MEINE;
    return fm.join("\n") + "\n\n" + koerper(e, ziele) + "\n" + meine + "\n";
  };

  // ---------- Abgleich ----------
  // Welche Einträge zählen: wie die Lernplan-Notizen (lernplan.js zentralAuswahl): Semester = das laufende, das Modul liegt in
  // diesem Semester (oder läuft bzw. ist angemeldet) und ist nicht bestanden oder anerkannt
  const auswahl = (eintraege, D, semesterName) => eintraege.filter((e) => {
    if (e.semester !== semesterName) return false;
    const m = D.module.find((x) => x.code === e.code);
    if (!m || FERTIG.indexOf(m.status) >= 0) return false;
    return m.semester === e.semester || ["läuft", "angemeldet"].indexOf(m.status) >= 0;
  });
  // Notizen mit literatur_id: Code → erste nach Pfad
  const vorhandene = () => {
    const aus = {};
    const liste = app.vault.getMarkdownFiles().filter((f) => f.path.indexOf(ZIEL + "/") === 0)
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
    for (const f of liste) {
      const fm = fmVon(f), id = fm.typ === "unterlage" && fm.literatur_id ? String(fm.literatur_id).toUpperCase() : "";
      if (id && !aus[id]) aus[id] = f;
    }
    return aus;
  };
  const standForm = (x) => {
    const o = x && typeof x === "object" && !Array.isArray(x) ? x : {};
    const map = (m) => Object.assign({}, m && typeof m === "object" && !Array.isArray(m) ? m : {});
    return { angewendet: map(o.angewendet), ziele: map(o.ziele) };
  };
  // Feld „literatur“ der Sperr-Datei (leer, wenn es fehlt); null, wenn die Datei fehlt oder unlesbar ist
  const standLesen = async () => {
    const f = app.vault.getAbstractFileByPath(STAND);
    if (!f) return null;
    try {
      const o = JSON.parse(await app.vault.read(f));
      return o && typeof o === "object" && !Array.isArray(o) ? standForm(o.literatur) : null;
    } catch (e) { return null; }
  };
  // Nur das Feld „literatur“ neu, alles andere (Sperre, Grabsteine, Lernplan) bleibt; false, wenn nichts geschrieben wurde
  const standSchreiben = async (literatur) => {
    const f = app.vault.getAbstractFileByPath(STAND);
    let ok = false;
    if (f) await app.vault.process(f, (text) => {
      let o = null;
      try { o = JSON.parse(text); } catch (e) { o = null; }
      if (!o || typeof o !== "object" || Array.isArray(o)) return text;
      o.literatur = literatur; ok = true;
      return JSON.stringify(o, null, 1) + "\n";
    });
    return ok;
  };
  const ordnerAnlegen = async (p) => {
    let a = "";
    for (const t of p.split("/").filter(Boolean)) {
      a = a ? a + "/" + t : t;
      if (app.vault.getAbstractFileByPath(a)) continue;
      try { await app.vault.createFolder(a); } catch (e) { if (!app.vault.getAbstractFileByPath(a)) throw e; }
    }
  };
  let gleicht = false;
  const abgleichen = async () => {
    const Z = ctx.zentral, Q = ctx.user && ctx.user.quellen;
    if (gleicht || !Z || !Z.literatur || !Q || !ctx.modell || !ctx.modell.daten) return;
    const daten = Z.literatur();
    if (!daten || !daten.module.length || !(await Z.abruferHier())) return;
    gleicht = true;
    try {
      const D = ctx.modell.daten(), heute = ctx.date.now("YYYY-MM-DD"), sem = ctx.modell.semesterFuer(heute);
      if (!sem) return;
      const gelesen = await standLesen();
      if (!gelesen) return; // ohne lesbaren Stand nichts schreiben, sonst kämen gelöschte Notizen zurück
      const kopie = standForm(app.loadLocalStorage(KOPIE));
      const s = { angewendet: Object.assign(kopie.angewendet, gelesen.angewendet), ziele: Object.assign(kopie.ziele, gelesen.ziele) };
      const vorher = JSON.stringify(gelesen), da = vorhandene();
      for (const e of auswahl(daten.module, D, sem.name)) {
        const m = D.module.find((x) => x.code === e.code), modul = m && m.f ? m.f.basename : "";
        const ziele = zieleVon(e, unterlagenVon(e.code)), h = Q.kurzHash(e), hz = Q.kurzHash(ziele);
        const f = da[e.code];
        if (!f) {
          if (Q.geloescht(s.angewendet, e.code, h)) continue; // von dir gelöscht, Liste unverändert
          const ordner = `${ZIEL}/${ordnerName(e.code, m && m.fm ? m.fm.titel : "", unterordner(ZIEL))}/Literatur`;
          const pfad = `${ordner}/${e.code} Literatur 00 Literaturliste.md`;
          if (app.vault.getAbstractFileByPath(pfad)) continue; // eigene Notiz unter diesem Namen: bleibt
          await ordnerAnlegen(ordner);
          await app.vault.create(pfad, notizText(e, modul, ziele, "", heute));
        } else {
          const herkunft = fmVon(f).herkunft;
          if (herkunft && herkunft !== "zentral") continue;
          if (!herkunft || s.angewendet[e.code] !== h || s.ziele[e.code] !== hz) {
            const alt = await app.vault.read(f);
            if (notizText(e, modul, ziele, alt, heute) !== alt) await app.vault.process(f, (x) => notizText(e, modul, ziele, x, heute));
          }
        }
        s.angewendet[e.code] = h;
        s.ziele[e.code] = hz;
      }
      app.saveLocalStorage(KOPIE, s);
      if (JSON.stringify(s) !== vorher) await standSchreiben(s);
    } catch (err) { console.error("Literaturlisten", err); } finally { gleicht = false; }
  };

  const registrieren = () => {
    // Neue Literaturlisten (zentral.js meldet sich über ctx.literaturAnzeige) und neue Unterlagen (Ziele der Links): abgleichen
    const bald = ctx.entprellen(() => { abgleichen(); }, 5000);
    ctx.an(app.metadataCache, "changed", (f) => { if (f.path.indexOf(ZIEL + "/") === 0 && f.path.indexOf("/_Volltext/") < 0) bald(); });
    // Neuer Tag: im neuen Semester fehlen Notizen
    const tag = ctx.bleibend("tag", () => ({ wert: ctx.date.now("YYYY-MM-DD") }));
    ctx.intervall(() => { const h = ctx.date.now("YYYY-MM-DD"); if (h !== tag.wert) { tag.wert = h; bald(); } }, 5 * 60 * 1000);
    ctx.literaturAnzeige = { neu: bald };
    ctx.aufraeumen(() => { if (ctx.literaturAnzeige && ctx.literaturAnzeige.neu === bald) ctx.literaturAnzeige = null; });
  };

  // Einmal beim App-Start: unveränderte Listen holt zentral.js nicht neu, also hier einmal abgleichen, nachdem Fachmodell und zentrale
  // Daten bereit sind
  const start = () => { ctx.zeit(() => { abgleichen(); }, 45000); };

  return { registrieren, start, abgleichen, notizText, auswahl, ordnerName, zieleVon };
};
