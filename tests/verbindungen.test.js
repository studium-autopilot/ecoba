// Verbindungen (verbindungen.js): Texte mit **fett** und [Link](https://…), Alma-Schritte mit Links, Zeilen unter
// „Verbindungen“ je Stand (normal und im eigenen Uni-Abgleich). Läuft ohne Obsidian.
"use strict";
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { laden } = require("./laden.js");
const { I } = require("./ilias-attrappen.js");

const EBA = require(path.join(__dirname, "..", "Studium Autopilot", "System", "Skripte", "eba.js"));
const OBS = { Modal: class {}, Notice: class {}, Platform: {}, Setting: class {} };
const V = laden("verbindungen", { kontext: { obsidian: OBS } }).ctx.verbindungen;

test("Text in Teile: fett, Links nur mit https, sonst Text", () => {
  assert.deepEqual(V.textTeile("**Link kopieren** und unten einfügen."), [{ art: "fett", text: "Link kopieren" }, { art: "text", text: " und unten einfügen." }]);
  assert.deepEqual(V.textTeile("[Alma](https://alma.example/a?b=c) öffnen."), [{ art: "link", text: "Alma", href: "https://alma.example/a?b=c" }, { art: "text", text: " öffnen." }]);
  assert.deepEqual(V.textTeile("[Böse](javascript:alert(1)) nicht"), [{ art: "text", text: "[Böse](javascript:alert(1)) nicht" }], "kein Link ohne https");
  assert.deepEqual(V.textTeile(""), []);
});

test("Alma verbinden: erst Alma, dann der Stundenplan als Link; Menüweg im Hinweis darunter", () => {
  const a = V.liste.alma;
  const links = a.schritte.map(V.textTeile).map((t) => t.filter((x) => x.art === "link").map((x) => x.href));
  assert.deepEqual(links.slice(0, 2), [[V.ALMA.start], [V.ALMA.stundenplan]]);
  assert.match(V.ALMA.stundenplan, /^https:\/\/alma\.uni-tuebingen\.de\/alma\/pages\/plan\/individualTimetable\.xhtml\?_flowId=individualTimetableSchedule-flow$/);
  assert.match(a.schritte[2], /\*\*Daten für iCalendar \(ics\) exportieren\*\*/);
  assert.match(a.erklaerung, /Mein Studium → Stundenplan/);
});

// ---------- Zeilen je Stand ----------
// o: { extern (Einstellung ilias_unterlagen: extern), einstellungen (weitere Felder, z. B. quellen_extern), alma (alma.js-Status),
//   ilias (ctx.ilias.status()), zentral (zentraler Stundenplan da), zentralStatus, volltext (ctx.volltext.status()), stundenplan /
//   unterlagen (so viele eigene Notizen), kannSpeichern }
const aufbau = (o) => {
  o = o || {};
  const fm = { "System/Einstellungen.md": Object.assign(o.extern ? { ilias_unterlagen: "extern" } : {}, o.einstellungen) };
  for (let i = 0; i < (o.stundenplan || 0); i++) fm[`Stundenplan/V${i}.md`] = { typ: "lehrveranstaltung" };
  for (let i = 0; i < (o.unterlagen || 0); i++) fm[`Unterlagen/B110/U${i}.md`] = { typ: "unterlage", ilias_id: String(i) };
  const hinweise = [], geholt = [];
  const r = laden("verbindungen", {
    frontmatter: fm,
    kontext: {
      obsidian: Object.assign({}, OBS, { Notice: class { constructor(t) { hinweise.push(t); } } }),
      user: { eba: EBA, alma: () => ({ status: () => Object.assign({ verbunden: false, stand: null, seit: null }, o.alma) }) },
      ilias: {
        K: I.K,
        kannSpeichern: () => o.kannSpeichern !== false,
        status: () => Object.assign({ verbunden: false, extern: !!o.extern, gruppenZugang: false, gesperrt: false, laeuft: false, fehler: "", text: o.extern ? I.K.TEXT_EXTERN : "Nicht verbunden." }, o.ilias),
        jetztHolen: async (x) => { geholt.push(x); return { art: "nur-gruppen" }; },
      },
      zentral: {
        stundenplan: () => ({ verfuegbar: !!o.zentral, anzahl: o.zentral ? 3 : 0, ohneBeginn: false, ausgeblendet: [] }),
        status: () => Object.assign({ zustand: "an", an: true, pause: false, fehler: "", geprueft: "", warnungen: [] }, o.zentralStatus),
      },
      einrichtung: { almaOffen: () => true, iliasOffen: () => true },
      almaKonto: o.almaKonto,
      volltext: o.volltext ? { status: () => o.volltext, nachholen: async (x) => { geholt.push(Object.assign({ volltext: true }, x)); } } : undefined,
      link: (aktion, p) => "obsidian://studium-autopilot?aktion=" + aktion + (p && p.id ? "&id=" + p.id : ""),
    },
  });
  r.ctx.app.vault.getMarkdownFiles = () => Object.keys(fm).map((p) => ({ path: p }));
  return { V: r.ctx.verbindungen, aktionen: r.ergebnis.aktionen, hinweise, geholt };
};
// Zeile lesbar: Pille, Knopf (mit „cta“) und Textlink als Text, Aktionen aus den Links
const lesen = (z) => {
  const text = (h) => (String(h || "").match(/>([^<>]*)<\/(?:a|span)>$/) || ["", ""])[1];
  const aktion = (h) => (String(h || "").match(/aktion=([a-z-]+)/) || ["", ""])[1];
  return {
    text: z.text, symbol: z.symbol, ton: z.ton, pille: text(z.pille),
    knopf: z.knopf ? text(z.knopf) + (/eba-vb-knopf cta/.test(z.knopf) ? " (cta)" : "") : "", knopfAktion: aktion(z.knopf),
    link: text(z.link), linkAktion: aktion(z.link),
  };
};
const ALLE = [
  ["normal, nichts da", {}],
  ["normal, Alma und ILIAS verbunden", { alma: { verbunden: true }, ilias: { verbunden: true, text: "Aktualisiert vor 5 Min." } }],
  ["normal, Stundenplan und Unterlagen per Sync", { stundenplan: 2, unterlagen: 1 }],
  ["normal, zentraler Stundenplan", { zentral: true }],
  ["normal, ILIAS-Anmeldung abgelehnt", { ilias: { verbunden: true, gesperrt: true, text: "Benutzername oder Kennwort stimmt nicht." } }],
  ["normal, ILIAS mit Fehler", { ilias: { verbunden: true, fehler: "kein Netz", text: "Fehler beim letzten Abruf." } }],
  ["eigener Uni-Abgleich, nichts verbunden", { extern: true, stundenplan: 2 }],
  ["eigener Uni-Abgleich, ILIAS für Übungsgruppen", { extern: true, ilias: { gruppenZugang: true, text: "Prüft deine Übungsgruppen, zuletzt gerade eben. Deine Unterlagen kommen über deinen Uni-Abgleich." } }],
  ["eigener Uni-Abgleich, Alma doch verbunden", { extern: true, alma: { verbunden: true } }],
  ["eigener Uni-Abgleich, Anmeldung abgelehnt", { extern: true, ilias: { gruppenZugang: true, gesperrt: true, text: "Anmeldung abgelehnt." } }],
  ["ILIAS ganz von außen, Zugang gespeichert", { einstellungen: { quellen_extern: ["ilias-dateien", "ilias-gruppen"] }, ilias: { extern: true, gruppenExtern: true, benutzer: "zxabc01", text: I.K.TEXT_EXTERN } }],
];

test("Zeilen: Symbol und Pille widersprechen sich nie, höchstens ein Knopf, Pille nur mit Stand", () => {
  for (const [name, o] of ALLE) {
    const { V: W } = aufbau(o);
    for (const id of Object.keys(W.liste)) {
      if (!W.zeile(id)) continue; // ohne Zeile (Noten & Anmeldungen ohne Beta, Zustimmung und Daten)
      const z = lesen(W.zeile(id));
      const wo = `${name}: ${id}`;
      if (z.pille === "nicht verbunden") assert.equal(z.symbol, "schloss", wo + " – „nicht verbunden“ nur mit Schloss");
      if (z.symbol === "haken") assert.notEqual(z.pille, "nicht verbunden", wo);
      if (z.pille === "verbunden") assert.notEqual(z.symbol, "schloss", wo);
      if (z.pille === "Anmeldung prüfen") assert.equal(z.symbol, "warnung", wo);
      assert.ok((W.zeile(id).knopf.match(/eba-vb-knopf/g) || []).length <= 1, wo + " – höchstens ein Knopf");
    }
  }
});

test("Zeilen ohne eigenen Uni-Abgleich: Alma und ILIAS je Stand", () => {
  let W = aufbau({}).V;
  assert.deepEqual(lesen(W.zeile("alma")), { text: "Mit Alma siehst du deine Woche im Stundenplan.", symbol: "schloss", ton: "leise", pille: "nicht verbunden", knopf: "Verbinden (cta)", knopfAktion: "verbinden", link: "", linkAktion: "" });
  assert.deepEqual(lesen(W.zeile("ilias")), { text: "Deine Kursdateien aus ILIAS landen automatisch in Unterlagen.", symbol: "schloss", ton: "leise", pille: "nicht verbunden", knopf: "Verbinden (cta)", knopfAktion: "verbinden", link: "", linkAktion: "" });
  assert.equal(W.liste.ilias.name, "ILIAS-Unterlagen");
  assert.equal(W.gesperrt("alma"), true);

  W = aufbau({ alma: { verbunden: true }, ilias: { verbunden: true, text: "Aktualisiert vor 5 Min." } }).V;
  assert.deepEqual(lesen(W.zeile("alma")), { text: "Noch nicht aktualisiert.", symbol: "haken", ton: "ok", pille: "verbunden", knopf: "Aktualisieren (cta)", knopfAktion: "verbindung-aktualisieren", link: "Mehr erfahren", linkAktion: "verbinden" });
  assert.deepEqual(lesen(W.zeile("ilias")), { text: "Aktualisiert vor 5 Min.", symbol: "haken", ton: "ok", pille: "verbunden", knopf: "Aktualisieren (cta)", knopfAktion: "verbindung-aktualisieren", link: "Mehr erfahren", linkAktion: "verbinden" });

  // Daten per Sync: Haken ohne Pille, Verbinden leise (kein Hauptknopf)
  W = aufbau({ stundenplan: 2, unterlagen: 1 }).V;
  assert.deepEqual(lesen(W.zeile("alma")), { text: "Dein Stundenplan liegt vor (2 Einträge).", symbol: "haken", ton: "leise", pille: "", knopf: "Verbinden", knopfAktion: "verbinden", link: "", linkAktion: "" });
  assert.deepEqual(lesen(W.zeile("ilias")), { text: "1 Unterlage aus ILIAS liegt vor.", symbol: "haken", ton: "leise", pille: "", knopf: "Verbinden", knopfAktion: "verbinden", link: "", linkAktion: "" });
  assert.equal(aufbau({ stundenplan: 1 }).V.zeile("alma").text, "Dein Stundenplan liegt vor (1 Eintrag).");

  const z = lesen(aufbau({ zentral: true }).V.zeile("alma"));
  assert.match(z.text, /^Nicht nötig: Deine Vorlesungen kommen von selbst/);
  assert.deepEqual([z.symbol, z.pille, z.knopf], ["haken", "", "Verbinden"]);

  const g = lesen(aufbau({ ilias: { verbunden: true, gesperrt: true, text: "Benutzername oder Kennwort stimmt nicht." } }).V.zeile("ilias"));
  assert.deepEqual([g.symbol, g.pille, g.knopf], ["warnung", "Anmeldung prüfen", "Verbinden (cta)"]);

  // Warnung aus dem letzten Lauf: steht im Text (ilias.js), die Zeile zeigt das Warnsymbol
  const w = lesen(aufbau({ ilias: { verbunden: true, warnung: "12 Dateien fehlen gerade in Unterlagen.", text: "Aktualisiert vor 5 Min. 12 Dateien fehlen gerade in Unterlagen." } }).V.zeile("ilias"));
  assert.deepEqual([w.text, w.symbol, w.ton, w.pille], ["Aktualisiert vor 5 Min. 12 Dateien fehlen gerade in Unterlagen.", "warnung", "warn", "verbunden"]);
});

test("Zentrale Daten: das Fenster nennt denselben Takt, in dem zentral.js holt", () => {
  const quelle = require("node:fs").readFileSync(path.join(__dirname, "..", "Studium Autopilot", "System", "Skripte", "zentral.js"), "utf8");
  const takt = Number((quelle.match(/const TAKT = (\d+) \* MIN;/) || [])[1]);
  assert.ok(takt > 0, "TAKT in zentral.js gefunden");
  assert.match(V.liste.zentral.kurz, new RegExp("alle " + takt + " Minuten"));
});

test("Zeilen im eigenen Uni-Abgleich: Alma nur ein Satz, ILIAS nur für Übungsgruppen", () => {
  let { V: W } = aufbau({ extern: true, stundenplan: 2 });
  assert.deepEqual(lesen(W.zeile("alma")), { text: "Dein Stundenplan kommt über deinen Uni-Abgleich.", symbol: "haken", ton: "ok", pille: "", knopf: "", knopfAktion: "", link: "", linkAktion: "" });
  assert.equal(W.gesperrt("alma"), false, "kein Alma-Schloss");
  assert.equal(aufbau({ extern: true }).V.gesperrt("alma"), false, "auch ohne Stundenplan-Notizen");
  assert.equal(W.liste.ilias.name, "ILIAS");
  assert.deepEqual(lesen(W.zeile("ilias")), { text: "Deine Unterlagen kommen über deinen Uni-Abgleich.", symbol: "haken", ton: "ok", pille: "", knopf: "Für Übungsgruppen verbinden", knopfAktion: "verbinden", link: "", linkAktion: "" });
  assert.equal(aufbau({ extern: true, kannSpeichern: false }).V.zeile("ilias").knopf, "", "ohne Schlüsselbund kein Knopf");
  // Anmeldefenster dort: eigener Satz, keine Schritte; Trennen sagt, was bleibt
  assert.match(W.liste.ilias.kurz, /Übungsgruppe kommt dann von selbst in den Stundenplan/);
  assert.deepEqual(W.liste.ilias.schritte, []);
  assert.match(W.liste.ilias.trennenText, /Übungsgruppe bleibt im Stundenplan/);
  assert.match(W.liste.alma.trennenText, /bringt weiter dein Uni-Abgleich/);

  const x = aufbau({ extern: true, ilias: { gruppenZugang: true, text: "Prüft deine Übungsgruppen, zuletzt gerade eben. Deine Unterlagen kommen über deinen Uni-Abgleich." } });
  assert.deepEqual(lesen(x.V.zeile("ilias")), { text: "Prüft deine Übungsgruppen, zuletzt gerade eben. Deine Unterlagen kommen über deinen Uni-Abgleich.", symbol: "haken", ton: "ok", pille: "verbunden", knopf: "Aktualisieren (cta)", knopfAktion: "verbindung-aktualisieren", link: "Trennen", linkAktion: "trennen" });

  // Alma doch verbunden (Link von früher): bleibt nutzbar, die Zeile warnt und bietet Trennen
  W = aufbau({ extern: true, alma: { verbunden: true } }).V;
  assert.deepEqual(lesen(W.zeile("alma")), { text: "Dein Stundenplan kommt über deinen Uni-Abgleich. Der Alma-Link auf diesem Gerät wird nicht genutzt.", symbol: "haken", ton: "ok", pille: "", knopf: "", knopfAktion: "", link: "Trennen", linkAktion: "trennen" });
});

test("Liste quellen_extern: Alma und ILIAS je Schlüssel; kommen auch die Übungsgruppen von außen, nur der Satz", () => {
  // nur der Stundenplan von außen (ohne abgleich.js): Alma ein Satz, ILIAS wie immer
  let W = aufbau({ einstellungen: { quellen_extern: ["stundenplan"] } }).V;
  assert.equal(W.zeile("alma").text, "Dein Stundenplan kommt über deinen Uni-Abgleich.");
  assert.equal(W.gesperrt("alma"), false);
  assert.equal(W.liste.ilias.name, "ILIAS-Unterlagen");
  // eigener Uni-Abgleich mit leerer Liste: nichts von außen
  W = aufbau({ extern: true, einstellungen: { quellen_extern: [] }, ilias: { extern: false, text: "Nicht verbunden." } }).V;
  assert.equal(lesen(W.zeile("alma")).pille, "nicht verbunden");
  assert.equal(W.liste.ilias.name, "ILIAS-Unterlagen");
  assert.match(W.liste.alma.trennenText, /nicht mehr aktualisiert/);
  // ILIAS ganz von außen: kein Verbinden für Übungsgruppen; mit gespeichertem Zugang nur der Textlink Trennen
  const s = { extern: true, gruppenExtern: true, text: I.K.TEXT_EXTERN };
  const ein = { quellen_extern: ["ilias-dateien", "ilias-gruppen"] };
  assert.deepEqual(lesen(aufbau({ einstellungen: ein, ilias: s }).V.zeile("ilias")),
    { text: I.K.TEXT_EXTERN, symbol: "haken", ton: "ok", pille: "", knopf: "", knopfAktion: "", link: "", linkAktion: "" });
  assert.deepEqual(lesen(aufbau({ einstellungen: ein, ilias: Object.assign({ benutzer: "zxabc01" }, s) }).V.zeile("ilias")),
    { text: I.K.TEXT_EXTERN, symbol: "haken", ton: "ok", pille: "", knopf: "", knopfAktion: "", link: "Trennen", linkAktion: "trennen" });
});

test("Eigener Uni-Abgleich: „Aktualisieren“ prüft gleich (kein Fenster), Alma verbinden zeigt nur den Satz", async () => {
  const x = aufbau({ extern: true, ilias: { gruppenZugang: true, text: "Prüft deine Übungsgruppen." } });
  await x.aktionen["verbindung-aktualisieren"].ausfuehren({ parameter: { id: "ilias" } });
  assert.deepEqual(x.geholt, [{ uebernehmen: false }]);
  const y = aufbau({ extern: true });
  assert.equal(y.V.fensterOeffnen(y.V.liste.alma), null);
  assert.deepEqual(y.hinweise, ["Dein Stundenplan kommt über deinen Uni-Abgleich."]);
});

test("Noten & Anmeldungen (Alma): Zeile aus alma-konto.js; ohne Zeile nicht in der Übersicht; Fenster von dort", () => {
  let W = aufbau({}).V;
  assert.equal(W.zeile("alma-konto"), null);
  assert.equal(W.liste["alma-konto"].sichtbar(), false);
  const offen = [];
  const konto = (zeile) => ({ zeile: () => zeile, sichtbar: () => !!zeile, status: () => ({ art: "an" }), fensterOeffnen: () => { offen.push(1); return { offen: true }; } });
  W = aufbau({ almaKonto: konto({ text: "Zuletzt geprüft heute 07:10.", symbol: "haken", pille: "an", knopf: { aktion: "alma-konto-pruefen", text: "Jetzt prüfen", cta: true, parameter: {} },
    link: { aktion: "verbinden", text: "Mehr erfahren", parameter: { id: "alma-konto" } } }) }).V;
  assert.deepEqual(lesen(W.zeile("alma-konto")), { text: "Zuletzt geprüft heute 07:10.", symbol: "haken", ton: "ok", pille: "verbunden", knopf: "Jetzt prüfen (cta)",
    knopfAktion: "alma-konto-pruefen", link: "Mehr erfahren", linkAktion: "verbinden" });
  assert.match(W.zeile("alma-konto").link, /id=alma-konto/);
  W = aufbau({ almaKonto: konto({ text: "Anmeldung abgelehnt. Bitte dein Passwort unter ILIAS neu eingeben.", symbol: "warnung", pille: "pruefen",
    knopf: { aktion: "verbinden", text: "ILIAS verbinden", cta: true, parameter: { id: "ilias", fuer: "alma" } }, link: null }) }).V;
  assert.deepEqual([lesen(W.zeile("alma-konto")).pille, lesen(W.zeile("alma-konto")).ton], ["Anmeldung prüfen", "warn"]);
  W = aufbau({ almaKonto: konto({ text: "Alma-Seite sah anders aus. Bitte in Alma selbst nachsehen.", symbol: "warnung", pille: "", knopf: { href: "https://alma.uni-tuebingen.de/alma/x", text: "In Alma öffnen" }, link: null }) }).V;
  assert.match(W.zeile("alma-konto").knopf, /^<a class="eba-vb-knopf" href="https:\/\/alma\.uni-tuebingen\.de\/alma\/x" target="_blank" rel="noopener">In Alma öffnen<\/a>$/);
  W.fensterOeffnen(W.liste["alma-konto"]);
  assert.equal(offen.length, 1);
});

// ---------- Quellen-Vertrag: eine Formatierung für den Stand jeder Quelle ----------
const vorMin = (n) => new Date(Date.now() - n * 60e3).toISOString();

test("Stand einer Quelle: eine Formatierung (Aktualisiert, Fehler bleibt mit „Zuletzt aktualisiert“, Warnungen, anderes Gerät)", () => {
  const { V: W } = aufbau({});
  assert.deepEqual(W.standText({ zustand: "an", geprueft: vorMin(5) }), { text: "Aktualisiert vor 5 Min.", symbol: "haken", ton: "ok" });
  assert.deepEqual(W.standText({ zustand: "an" }), { text: "Noch nicht aktualisiert.", symbol: "haken", ton: "ok" });
  assert.deepEqual(W.standText({ zustand: "fehler", geprueft: vorMin(180), fehler: "Alma antwortet nicht (Fehler 404). Bitte den Link in Alma neu kopieren." }),
    { text: "Alma antwortet nicht (Fehler 404). Bitte den Link in Alma neu kopieren. Zuletzt aktualisiert vor 3 Std.", symbol: "warnung", ton: "warn" });
  assert.deepEqual(W.standText({ zustand: "an", geprueft: vorMin(1), warnungen: ["Eine deiner Stundenplan-Notizen steht nicht mehr in Alma."] }),
    { text: "Aktualisiert vor 1 Min. Eine deiner Stundenplan-Notizen steht nicht mehr in Alma.", symbol: "warnung", ton: "warn" });
  assert.equal(W.standText({ zustand: "anderes-geraet" }).text, "Ein anderes Gerät aktualisiert, alles kommt über deinen Sync.");
  assert.equal(W.standText({ zustand: "laeuft" }).symbol, "uhr");
  assert.equal(W.WORT.knopf, "Aktualisieren", "Entscheidung E1");
});

test("Alma-Stundenplan: Fehler macht die Zeile nicht mehr grün; ein anderes Gerät aktualisiert → Hier aktualisieren", () => {
  let z = lesen(aufbau({ alma: { verbunden: true, zustand: "fehler", geprueft: vorMin(120), fehler: "Keine Verbindung zu Alma. Bitte Internet prüfen und erneut versuchen." } }).V.zeile("alma"));
  assert.deepEqual([z.text, z.symbol, z.ton, z.pille, z.knopf], ["Keine Verbindung zu Alma. Bitte Internet prüfen und erneut versuchen. Zuletzt aktualisiert vor 2 Std.", "warnung", "warn", "verbunden", "Aktualisieren (cta)"]);
  z = lesen(aufbau({ alma: { verbunden: true, zustand: "anderes-geraet", anderes: vorMin(3) } }).V.zeile("alma"));
  assert.deepEqual([z.symbol, z.knopf, z.knopfAktion], ["haken", "Hier aktualisieren (cta)", "verbindung-aktualisieren"]);
  z = lesen(aufbau({ ilias: { verbunden: true, zustand: "anderes-geraet", anderes: true, text: "Ein anderes Gerät lädt deine ILIAS-Unterlagen." } }).V.zeile("ilias"));
  assert.deepEqual([z.text, z.knopf], ["Ein anderes Gerät aktualisiert, alles kommt über deinen Sync.", "Hier aktualisieren (cta)"]);
  z = lesen(aufbau({ ilias: { verbunden: true, zustand: "an", geprueft: vorMin(5), warnungen: [], zuGross: 2, grenzeMb: 50, text: "x" } }).V.zeile("ilias"));
  assert.equal(z.text, "Aktualisiert vor 5 Min. 2 Dateien über 50 MB nicht geladen.");
});

test("Zentrale Daten: Zeile aus der gemeinsamen Form (Fehler als Satz, Pille Fehler, Knopf Aktualisieren)", () => {
  let z = lesen(aufbau({ zentralStatus: { geprueft: vorMin(10) } }).V.zeile("zentral"));
  assert.deepEqual([z.symbol, z.pille, z.knopf], ["haken", "an", "Aktualisieren (cta)"]);
  const W = aufbau({ zentralStatus: { zustand: "fehler", geprueft: vorMin(60), fehler: "Keine Verbindung zu den zentralen Daten.", hinweis: "Neue Termine folgen." } }).V;
  z = lesen(W.zeile("zentral"));
  assert.deepEqual([z.symbol, z.pille], ["warnung", "Fehler"]);
  assert.equal(W.zeile("zentral").html, "Keine Verbindung zu den zentralen Daten. Zuletzt aktualisiert vor 1 Std. Neue Termine folgen.");
  z = lesen(aufbau({ zentralStatus: { an: false, zustand: "aus" } }).V.zeile("zentral"));
  assert.deepEqual([z.symbol, z.pille, z.knopf], ["aus", "aus", "Einschalten (cta)"]);
});

test("Volltext der PDFs: Zeile mit den Zahlen, aus → Einschalten, anderes Gerät → Hier aktualisieren, extern nur der Satz", async () => {
  assert.equal(aufbau({}).V.zeile("volltext"), null, "ohne volltext.js keine Zeile");
  let x = aufbau({ volltext: { an: true, zustand: "an", geprueft: vorMin(2), warnungen: [], text: "58 PDFs durchsuchbar, 2 ohne Text." } });
  let z = lesen(x.V.zeile("volltext"));
  assert.deepEqual([z.text, z.symbol, z.pille, z.knopf, z.link], ["58 PDFs durchsuchbar, 2 ohne Text.", "haken", "", "Aktualisieren (cta)", "Mehr erfahren"]);
  await x.aktionen["verbindung-aktualisieren"].ausfuehren({ parameter: { id: "volltext" } });
  assert.deepEqual(x.geholt, [{ volltext: true, hier: false }]);
  z = lesen(aufbau({ volltext: { an: true, zustand: "anderes-geraet", warnungen: [], text: "58 PDFs durchsuchbar." } }).V.zeile("volltext"));
  assert.equal(z.knopf, "Hier aktualisieren (cta)");
  z = lesen(aufbau({ volltext: { an: false, zustand: "aus", warnungen: [], text: "" } }).V.zeile("volltext"));
  assert.deepEqual([z.symbol, z.knopf, z.knopfAktion], ["aus", "Einschalten (cta)", "verbinden"]);
  z = lesen(aufbau({ volltext: { an: true, zustand: "extern", warnungen: [], text: "Kommt über deinen eigenen Abgleich." } }).V.zeile("volltext"));
  assert.deepEqual([z.text, z.knopf], ["Kommt über deinen eigenen Abgleich.", ""]);
});
