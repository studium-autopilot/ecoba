// Uni-Login (uni-login.js): Nach der Anmeldung verbindet Studium Autopilot ILIAS-Kalender und Alma-Stundenplan selbst, ohne
// kopierten Link; nur mit bestätigtem Uni-Login, nur was hier fehlt und nicht von außen kommt; neue Links höchstens einmal am Tag.
// Attrappen statt ILIAS, Alma und Registry; Links und Schlüssel erfunden. Läuft ohne Obsidian: node --test tests/
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { laden } = require("./laden.js");

const SKRIPT = path.join(__dirname, "..", "Studium Autopilot", "System", "Skripte", "uni-login.js");
const U = require(SKRIPT);
const EBA = require(path.join(__dirname, "..", "Studium Autopilot", "System", "Skripte", "eba.js"));
const KAL = laden("ilias-kalender", { kontext: { user: { eba: EBA } } }).ctx.iliasKalender;

const ILIAS_LINK = (n) => `https://ovidius.uni-tuebingen.de/calendar.php?client_id=pr02&token=Erfunden0Schluessel0fuer0Tests0x&limited=${n}`;
const ALMA_LINK = "https://alma.uni-tuebingen.de:443/alma/pages/cm/exa/timetable/individualTimetableCalendarExport.faces?user=00000000-0000-4000-8000-00000000e1a7&hash=0123456789abcdef0123456789abcdef&termgroup=";

// o: { zugang (uniZugang), kalender: { verbunden, extern }, alma: { verbunden, extern }, anderswo ([id] über ein anderes Gerät),
//   links (ILIAS) | Fehler, almaAntwort, verbinden(id, link), gesperrt (ILIAS-Stand), ohneZustimmung (Login aus 0.4.7) }
function aufbau(o) {
  o = o || {};
  const log = [], speicher = new Map();
  let t = Date.parse("2026-10-20T08:00:00.000Z");
  const zugang = Object.assign({ benutzer: "zxabc01", bestaetigt: true, gesperrt: false }, o.zugang);
  const quellen = { "ilias-kalender": Object.assign({ verbunden: false, extern: false }, o.kalender), alma: Object.assign({ verbunden: false, extern: false }, o.alma) };
  const abh = {
    ilias: () => ({
      kannSpeichern: () => o.kannSpeichern !== false, uniZugang: () => zugang, status: () => ({ gesperrt: !!o.gesperrt }),
      kalenderLinks: async () => { log.push("ilias:links"); if (o.links instanceof Error) throw o.links; return o.links || [{ url: ILIAS_LINK(0), begrenzt: false }, { url: ILIAS_LINK(1), begrenzt: true }]; },
    }),
    kalender: () => KAL,
    almaKonto: () => ({ stundenplanLink: async () => { log.push("alma:link"); return o.almaAntwort || { art: "ok", link: ALMA_LINK }; } }),
    quelle: (id) => ({
      status: () => quellen[id], externText: "Kommt über deinen Uni-Abgleich.",
      verbinden: async (link) => {
        log.push(id + ":verbinden " + link);
        const r = o.verbinden ? o.verbinden(id, link) : { ok: true, text: id === "alma" ? "7 Lehrveranstaltungen übernommen." : "3 Abgaben bei deinen Fristen." };
        if (r.ok) quellen[id].verbunden = true;
        return r;
      },
    }),
    anderswo: (id) => (o.anderswo || []).indexOf(id) >= 0,
    lokal: (k, v) => { if (v === undefined) return speicher.has(k) ? speicher.get(k) : null; speicher.set(k, v); return v; },
    jetzt: () => new Date(t),
  };
  const u = U.erzeugen(abh, {});
  // Anmeldung im Fenster von 0.4.8 (Zustimmung für beide Quellen), außer bei einem Login aus 0.4.7 oder früher
  if (!o.ohneZustimmung) u.zustimmen();
  return { u, log, zugang, quellen, speicher, vor: (ms) => { t += ms; } };
}

test("Laden: Bibliothek (keine Erweiterung), beim Laden passiert nichts", () => {
  const code = fs.readFileSync(SKRIPT, "utf8");
  // dieselbe Regel wie main.js (istErweiterung): sonst würde der Kern das Skript als Erweiterung starten
  assert.equal(/\bregistrieren\s*(\(|=|:|,|\})|\baktionen\s*:/.test(code), false);
  let n = 0;
  const z = () => { n++; return 0; };
  const r = laden("uni-login", { kontext: { zeit: z, intervall: z } });
  assert.equal(n, 0);
  assert.equal(typeof r.ergebnis.alleVerbinden, "function");
  assert.deepEqual(r.ergebnis.offen(), [], "ohne ILIAS nichts");
});

test("Nach der Anmeldung: erst der ILIAS-Kalender (Link ohne Altes), dann Alma; je ein Satz zum Ergebnis", async () => {
  const x = aufbau();
  assert.deepEqual(x.u.offen(), ["ilias-kalender", "alma"]);
  const schritte = [];
  const r = await x.u.alleVerbinden({ schritt: (id) => schritte.push(id) });
  assert.deepEqual(schritte, ["ilias-kalender", "alma"]);
  assert.deepEqual(x.log, ["ilias:links", "ilias-kalender:verbinden " + ILIAS_LINK(1), "alma:link", "alma:verbinden " + ALMA_LINK]);
  assert.deepEqual(r, { "ilias-kalender": { ok: true, text: "3 Abgaben bei deinen Fristen." }, alma: { ok: true, text: "7 Lehrveranstaltungen übernommen." } });
  assert.equal(x.u.zeile("ilias-kalender", r["ilias-kalender"]), "ILIAS-Kalender verbunden – 3 Abgaben bei deinen Fristen.");
  assert.equal(x.u.zeile("alma", r.alma), "Alma-Stundenplan verbunden – 7 Lehrveranstaltungen übernommen.");
  assert.equal(x.u.hinweis(r), "ILIAS-Kalender und Alma-Stundenplan verbunden.");
  assert.deepEqual(x.u.offen(), [], "danach ist nichts mehr offen");
  // Nur „iCal-URL“ angeboten: dann die
  const y = aufbau({ links: [{ url: ILIAS_LINK(0), begrenzt: false }] });
  await y.u.verbinden("ilias-kalender");
  assert.equal(y.log[1], "ilias-kalender:verbinden " + ILIAS_LINK(0));
});

test("Nur mit bestätigtem Uni-Login: ohne Bestätigung, abgelehnt, ohne Benutzername oder Schlüsselbund geht nichts hinaus", async () => {
  for (const [o, art] of [[{ zugang: { bestaetigt: false } }, "unbestaetigt"], [{ zugang: { gesperrt: true } }, "gesperrt"],
    [{ zugang: { benutzer: "" } }, "ohne-zugang"], [{ kannSpeichern: false }, "ohne-zugang"]]) {
    const x = aufbau(o);
    assert.equal(x.u.bereit(), false, JSON.stringify(o));
    assert.deepEqual(x.u.offen(), []);
    assert.deepEqual(await x.u.alleVerbinden(), { "ilias-kalender": null, alma: null });
    const r = await x.u.linkHolen("alma");
    assert.deepEqual([r.ok, r.art], [false, art], JSON.stringify(o));
    assert.ok(r.fehler, "mit Grund");
    assert.deepEqual(x.log, []);
  }
});

test("Schon verbunden, über ein anderes Gerät verbunden oder von außen (eigener Uni-Abgleich): übersprungen", async () => {
  const x = aufbau({ kalender: { verbunden: true }, alma: { extern: true } });
  assert.deepEqual(x.u.offen(), []);
  assert.equal(x.u.kannSelbst("ilias-kalender"), true, "verbunden: neuer Link geht trotzdem (Neuen Link eingeben)");
  assert.equal(x.u.kannSelbst("alma"), false);
  assert.deepEqual(await x.u.alleVerbinden(), { "ilias-kalender": null, alma: null });
  assert.deepEqual(x.log, []);
  // Ein anderes Gerät hat Alma verbunden: nach der Anmeldung nur der Kalender; ein Tipp auf Verbinden geht trotzdem
  const y = aufbau({ anderswo: ["alma"] });
  assert.deepEqual(y.u.offen(), ["ilias-kalender"]);
  assert.equal(y.u.kannSelbst("alma"), true);
  const r = await y.u.alleVerbinden();
  assert.deepEqual([!!r["ilias-kalender"], r.alma], [true, null]);
  assert.ok(!y.log.some((z) => /^alma/.test(z)));
});

test("Fehler: je Quelle ein Satz ohne Link; die andere Quelle verbindet trotzdem", async () => {
  const kein = new Error("Im ILIAS-Kalender fehlt der Knopf „Abonnieren“."); kein.art = "kalender";
  const x = aufbau({ links: kein, almaAntwort: { art: "zugang-falsch", grund: "zugang-falsch" } });
  const r = await x.u.alleVerbinden();
  assert.deepEqual(r["ilias-kalender"], { ok: false, art: "kalender", fehler: "Den Link fand Studium Autopilot im ILIAS-Kalender nicht." });
  assert.deepEqual(r.alma, { ok: false, art: "zugang-falsch", fehler: "Alma hat dein Passwort abgelehnt." });
  assert.equal(x.u.zeile("alma", r.alma), "Alma-Stundenplan: Alma hat dein Passwort abgelehnt.");
  assert.equal(x.u.hinweis(r), "ILIAS-Kalender und Alma-Stundenplan ließen sich nicht verbinden, unter Verbindungen geht es noch einmal.");
  const abgelehnt = new Error("Benutzername oder Passwort falsch."); abgelehnt.art = "zugang";
  assert.equal((await aufbau({ links: abgelehnt }).u.linkHolen("ilias-kalender")).fehler, "Benutzername oder Passwort falsch.");
  const netz = new Error("HTTP 503"); netz.art = "fehler";
  assert.match((await aufbau({ links: netz }).u.linkHolen("ilias-kalender")).fehler, /^ILIAS war gerade nicht erreichbar/);
  assert.equal((await aufbau({ links: [] }).u.linkHolen("ilias-kalender")).art, "kein-link");
  assert.equal((await aufbau({ links: [{ url: "https://ilias.example.org/calendar.php?client_id=x&token=y", begrenzt: true }] }).u.linkHolen("ilias-kalender")).art, "kein-link", "nur Links, die linkPruefen besteht");
  for (const [antwort, satz] of [[{ art: "zwei-faktor" }, /zweiten Faktor/], [{ art: "netz" }, /Keine Verbindung zu Alma/], [{ art: "stopp" }, /nicht erreichbar/],
    [{ art: "unerwartet", grund: "kein-link" }, /fand Studium Autopilot in Alma nicht/], [{ art: "unerwartet", grund: "sitzung" }, /anders geantwortet/],
    [{ art: "abgelehnt-unklar" }, /anders geantwortet/], [{ art: "ohne-zugang" }, /Uni-Login fehlt/]]) {
    assert.match((await aufbau({ almaAntwort: antwort }).u.linkHolen("alma")).fehler, satz, JSON.stringify(antwort));
  }
  // ILIAS: abgelehnt bzw. Anmeldung gescheitert → der Satz von dort (Code ohne Adressen); alte Bausteine → eigener Satz
  const anm = new Error("Die Anmeldung bei ILIAS hat nicht geklappt. Code: nach-passwort · PC 0.4.8 · start 200"); anm.art = "anmeldung";
  assert.match((await aufbau({ links: anm }).u.linkHolen("ilias-kalender")).fehler, /Code: nach-passwort/);
  const alt = new Error("x"); alt.art = "ohne-anmeldung";
  assert.equal((await aufbau({ links: alt }).u.linkHolen("ilias-kalender")).fehler, "Das geht in dieser Version noch nicht.");
  // Der erste Abruf mit dem Link scheitert: Grund der Quelle, der Link bleibt nicht (das macht die Quelle)
  const y = aufbau({ verbinden: (id) => (id === "alma" ? { ok: false, fehler: "Alma hat keinen Stundenplan geliefert." } : { ok: true, text: "" }) });
  const s = await y.u.alleVerbinden();
  assert.deepEqual(s.alma, { ok: false, art: "abruf", fehler: "Alma hat keinen Stundenplan geliefert." });
  assert.equal(y.u.zeile("ilias-kalender", s["ilias-kalender"]), "ILIAS-Kalender verbunden.");
  assert.equal(y.u.hinweis(s), "ILIAS-Kalender verbunden. Alma-Stundenplan ließ sich nicht verbinden, unter Verbindungen geht es noch einmal.");
  assert.equal(y.u.hinweis({ "ilias-kalender": null, alma: null }), "");
  assert.equal(y.u.zeile("alma", null), "");
});

test("Neuer Link, wenn der alte nicht mehr gilt: höchstens einmal am Tag je Quelle; derselbe Link zählt nicht", async () => {
  const x = aufbau({ alma: { verbunden: true }, kalender: { verbunden: true } });
  assert.equal(await x.u.erneuern("alma", "https://alma.uni-tuebingen.de/alt"), ALMA_LINK);
  assert.equal(await x.u.erneuern("alma", "https://alma.uni-tuebingen.de/alt"), "", "am selben Tag nicht noch einmal");
  assert.equal(await x.u.erneuern("ilias-kalender", ILIAS_LINK(1)), "", "ILIAS gibt denselben Link: nichts Neues");
  assert.deepEqual(x.log, ["alma:link", "ilias:links"]);
  x.vor(24 * 3600e3);
  assert.equal(await x.u.erneuern("alma", ALMA_LINK), "");
  assert.equal(x.log.length, 3, "nach einem Tag wieder ein Versuch");
  // Ohne Uni-Login nie
  const y = aufbau({ zugang: { benutzer: "" } });
  assert.equal(await y.u.erneuern("alma", "x"), "");
  assert.deepEqual(y.log, []);
});

test("Zustimmung: Ein Login aus 0.4.7 verbindet und erneuert nichts von selbst; ein Tipp stimmt nur für seine Quelle zu", async () => {
  const x = aufbau({ ohneZustimmung: true, alma: { verbunden: true } });
  assert.deepEqual([x.u.zugestimmt("alma"), x.u.zugestimmt("ilias-kalender")], [false, false]);
  assert.deepEqual(x.u.moeglich(), ["ilias-kalender"], "möglich wäre der Kalender");
  assert.deepEqual(x.u.offen(), [], "von selbst aber nichts");
  assert.deepEqual(await x.u.alleVerbinden(), { "ilias-kalender": null, alma: null });
  assert.equal(await x.u.erneuern("alma", "https://alma.uni-tuebingen.de/alt"), "", "kein Passwort an Alma im Hintergrund");
  assert.deepEqual(x.log, []);
  // Tipp auf Verbinden im Link-Fenster des Kalenders: Zustimmung nur dafür
  x.u.zustimmen(["ilias-kalender"]);
  assert.deepEqual([x.u.zugestimmt("ilias-kalender"), x.u.zugestimmt("alma")], [true, false]);
  assert.equal(await x.u.erneuern("alma", "https://alma.uni-tuebingen.de/alt"), "");
  assert.deepEqual(x.log, []);
  // Neues Passwort nach der Zustimmung (seit jünger): die alte Zustimmung gilt nicht mehr
  x.zugang.seit = "2026-10-21T08:00:00.000Z";
  assert.equal(x.u.zugestimmt("ilias-kalender"), false);
});

test("Zustimmung nach der Anmeldung nur für das, was der Satz davor nannte (nichts, was von außen kommt)", () => {
  const x = aufbau({ ohneZustimmung: true, alma: { extern: true } });
  x.u.zustimmen();
  assert.deepEqual([x.u.zugestimmt("ilias-kalender"), x.u.zugestimmt("alma")], [true, false]);
});

test("Absicherung: Stand einer Quelle nicht lesbar (Skript noch nicht geladen) → nichts von selbst, auch nicht im eigenen Uni-Abgleich", async () => {
  const x = aufbau({ alma: { extern: true } });
  x.quellen.alma = null; // status() liefert nichts, wie ein Eintrag, dessen Skript fehlt
  assert.equal(x.u.kannSelbst("alma"), false);
  assert.deepEqual(x.u.offen(), ["ilias-kalender"]);
  assert.equal(await x.u.erneuern("alma", "https://alma.uni-tuebingen.de/alt"), "");
  assert.deepEqual(x.log, []);
});

test("Absicherung: nach einer Ablehnung hier gesperrt (auch ohne Marker) und von außen geht beim Tipp nichts hinaus", async () => {
  const x = aufbau({ gesperrt: true });
  assert.equal(x.u.bereit(), false);
  assert.equal((await x.u.verbinden("alma")).art, "gesperrt", "der Grund ist die Sperre, nicht ein fehlender Login");
  assert.equal((await aufbau({ zugang: { bestaetigt: false } }).u.linkHolen("alma")).art, "unbestaetigt");
  assert.equal((await aufbau({ zugang: { benutzer: "" } }).u.linkHolen("alma")).art, "ohne-zugang");
  assert.match((await aufbau({ almaAntwort: { art: "baustein" } }).u.linkHolen("alma")).fehler, /in dieser Version noch nicht/);
  const y = aufbau();
  y.quellen.alma.extern = true; // eigener Uni-Abgleich kam per Sync, während das Fenster offen war
  assert.deepEqual(await y.u.linkHolen("alma"), { ok: false, art: "extern", fehler: "Kommt über deinen Uni-Abgleich." });
  assert.deepEqual([x.log, y.log], [[], []]);
});

test("Zwei Aufrufe für dieselbe Quelle zugleich (Fenster und Einrichtung): ein Abruf", async () => {
  const x = aufbau();
  const [a, b] = await Promise.all([x.u.verbinden("alma"), x.u.verbinden("alma")]);
  assert.deepEqual(a, b);
  assert.deepEqual(x.log, ["alma:link", "alma:verbinden " + ALMA_LINK]);
});
