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
// o: { extern (Einstellung ilias_unterlagen: extern), alma (alma.js-Status), ilias (ctx.ilias.status()), zentral (zentraler
//   Stundenplan da), stundenplan / unterlagen (so viele eigene Notizen), kannSpeichern }
const aufbau = (o) => {
  o = o || {};
  const fm = { "System/Einstellungen.md": o.extern ? { ilias_unterlagen: "extern" } : {} };
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
        anzeige: () => ({ html: "Aktualisiert vor 5 Min.", pille: `<span class="eba-pill ok">an</span>`, an: true }),
        status: () => ({ an: true, pause: false, fehler: "" }),
      },
      einrichtung: { almaOffen: () => true, iliasOffen: () => true },
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
];

test("Zeilen: Symbol und Pille widersprechen sich nie, höchstens ein Knopf, Pille nur mit Stand", () => {
  for (const [name, o] of ALLE) {
    const { V: W } = aufbau(o);
    for (const id of Object.keys(W.liste)) {
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
  assert.deepEqual(lesen(W.zeile("ilias")), { text: "Aktualisiert vor 5 Min.", symbol: "haken", ton: "ok", pille: "verbunden", knopf: "Jetzt holen (cta)", knopfAktion: "verbindung-aktualisieren", link: "Mehr erfahren", linkAktion: "verbinden" });

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
  assert.deepEqual(lesen(x.V.zeile("ilias")), { text: "Prüft deine Übungsgruppen, zuletzt gerade eben. Deine Unterlagen kommen über deinen Uni-Abgleich.", symbol: "haken", ton: "ok", pille: "verbunden", knopf: "Jetzt prüfen (cta)", knopfAktion: "verbindung-aktualisieren", link: "Trennen", linkAktion: "trennen" });

  // Alma doch verbunden (Link von früher): bleibt nutzbar, die Zeile warnt und bietet Trennen
  W = aufbau({ extern: true, alma: { verbunden: true } }).V;
  assert.deepEqual(lesen(W.zeile("alma")), { text: "Dein Stundenplan kommt über deinen Uni-Abgleich. Alma ist hier zusätzlich verbunden, das kann Einträge doppeln.", symbol: "warnung", ton: "warn", pille: "verbunden", knopf: "Trennen", knopfAktion: "trennen", link: "", linkAktion: "" });
});

test("Eigener Uni-Abgleich: „Jetzt prüfen“ prüft gleich (kein Fenster), Alma verbinden zeigt nur den Satz", async () => {
  const x = aufbau({ extern: true, ilias: { gruppenZugang: true, text: "Prüft deine Übungsgruppen." } });
  await x.aktionen["verbindung-aktualisieren"].ausfuehren({ parameter: { id: "ilias" } });
  assert.deepEqual(x.geholt, [{ uebernehmen: false }]);
  const y = aufbau({ extern: true });
  assert.equal(y.V.fensterOeffnen(y.V.liste.alma), null);
  assert.deepEqual(y.hinweise, ["Dein Stundenplan kommt über deinen Uni-Abgleich."]);
});
