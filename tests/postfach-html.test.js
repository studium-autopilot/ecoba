// Postfach lesen (postfach-html.js): Anmeldeseite und Ablehnung, angemeldet am Abmelde-Link, Posteingang (ungelesen, ganzer
// Betreff, Seiten und Zahl aus der Zeile über der Liste; leer nur bei bekanntem Aufbau), ungelesen aus dem Titel der Ansicht
// minimal, eine Mail mit Kopf und Zeilen, Adressen nur aus Zahlen.
// Alle Testseiten sind erfunden (tests/daten/postfach/, Aufbau nach echten Seiten vom 22.10.2026). Läuft ohne Obsidian.
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const SKRIPTE = path.join(__dirname, "..", "Studium Autopilot", "System", "Skripte");
const H = require(path.join(SKRIPTE, "ilias-html.js"));
const P = require(path.join(SKRIPTE, "postfach-html.js")).erzeugen(H);
const { laden } = require("./laden.js");
const seite = (name) => fs.readFileSync(path.join(__dirname, "daten", "postfach", name + ".html"), "utf8");

test("Laden: Bibliothek ohne Netz und Zeitgeber, über ctx.user mit dem Zerleger aus ilias-html.js", () => {
  let n = 0;
  const z = () => { n++; return 0; };
  const r = laden("postfach-html", { kontext: { user: { "ilias-html": H }, zeit: z, intervall: z } }).ergebnis;
  assert.equal(n, 0);
  assert.equal(typeof r.liste, "function");
  assert.throws(() => require(path.join(SKRIPTE, "postfach-html.js")).erzeugen(null), /Zerleger/);
});

test("seite: Anmeldeformular → anmeldung, Abmelde-Link → angemeldet, sonst unbekannt", () => {
  assert.equal(P.seite(seite("login")), "anmeldung");
  assert.equal(P.seite(seite("login-falsch")), "anmeldung");
  for (const s of ["portal", "posteingang", "posteingang-leer", "zahlen", "nachricht"]) assert.equal(P.seite(seite(s)), "angemeldet", s);
  assert.equal(P.seite("<html><body><h1>Fehler</h1></body></html>"), "unbekannt");
  assert.equal(P.abmeldeAdresse(seite("portal")), "/login.php?horde_logout_token=AbC123-x_Yz&logout_reason=4");
  assert.equal(P.abmeldeAdresse('<a href="https://example.org/login.php?horde_logout_token=x">Abmelden</a>'), "");
  assert.equal(P.abmeldeAdresse('<a href="/login.php?horde_logout_token=x&amp;url=https://example.org">Abmelden</a>'), "");
});

test("anmeldeFormular: nur versteckte Felder, nur an das Webmail der Uni per POST", () => {
  const f = P.anmeldeFormular(seite("login"));
  assert.equal(f.action, "https://webmail.uni-tuebingen.de/login.php");
  assert.deepEqual(f.felder, [["app", ""], ["login_post", "0"], ["url", ""], ["anchor_string", ""]]);
  assert.equal(P.anmeldeFormular(seite("login-fremd")), null);
  assert.equal(P.anmeldeFormular(seite("login").replace('method="post"', 'method="get"')), null);
  assert.equal(P.anmeldeFormular(seite("login").replace("webmail.uni-tuebingen.de/login.php", "webmail.uni-tuebingen.de:8443/login.php")), null);
  assert.equal(P.anmeldeFormular(seite("portal")), null);
});

test("fehler: nur der bekannte Satz zur Ablehnung ist zugang-falsch, alles andere unerwartet", () => {
  assert.equal(P.fehler(seite("login-falsch")), "zugang-falsch");
  assert.equal(P.fehler(seite("login-falsch").replace(/Die Anmeldung[^<]*/, "Login failed because your username or password was entered incorrectly.")), "zugang-falsch");
  assert.equal(P.fehler(seite("login-wartung")), "unerwartet");
  assert.equal(P.fehler(seite("login")), "unerwartet");
  assert.equal(P.fehler(seite("portal")), "unerwartet");
});

test("liste: Mails neueste zuerst, ungelesen und markiert aus den Klassen, ganzer Betreff, Seiten und Zahl", () => {
  const l = P.liste(seite("posteingang"));
  assert.equal(l.art, "ok");
  assert.deepEqual(l.mails.map((m) => m.buid), [64, 63, 12]);
  assert.deepEqual(l.mails[0], { buid: 64, von: "Prüfungsamt Wirtschaftswissenschaft", betreff: "Anmeldung zu den Prüfungen & Fristen im Wintersemester 2026/27",
    datum: "08:40:00", groesse: "5 KB", ungelesen: true, markiert: false });
  assert.deepEqual(l.mails.map((m) => [m.ungelesen, m.markiert]), [[true, false], [true, true], [false, false]]);
  assert.equal(l.mails[2].betreff, "Leihfrist endet bald", "ohne title der Text der Zelle");
  assert.equal(l.seiten, 3);
  assert.equal(l.gesamt, 64);
  assert.equal(l.ungelesen, undefined, "die Ansicht basic nennt keine Zahl ungelesener Mails");
  // eine Seite: ohne „Seite x von y“; englisch; ohne Zeile nur die Seiten aus den Links
  const eine = seite("posteingang").replace("(64 Nachrichten / Seite 1 von 3)", "(1 Nachricht)");
  assert.equal(P.liste(eine).gesamt, 1);
  assert.equal(P.liste(seite("posteingang").replace("(64 Nachrichten / Seite 1 von 3)", "(64 Messages / Page 1 of 4)")).seiten, 4);
  const ohne = P.liste(seite("posteingang").replace(/<div id="horde-sub">.*<\/div><\/div>\n/, ""));
  assert.deepEqual([ohne.art, ohne.seiten, ohne.gesamt], ["ok", 3, null]);
});

test("zahlen: ungelesen und insgesamt aus dem Titel der Ansicht minimal, sonst null", () => {
  assert.deepEqual(P.zahlen(seite("zahlen")), { ungelesen: 2, gesamt: 64 });
  assert.deepEqual(P.zahlen(seite("zahlen").replace("(2 ungelesen/64 insgesamt)", "(0 unseen/12 total)")), { ungelesen: 0, gesamt: 12 });
  assert.equal(P.zahlen(seite("posteingang")), null);
  assert.equal(P.zahlen(seite("zahlen").replace("(2 ungelesen/64 insgesamt)", "(70 ungelesen/64 insgesamt)")), null);
  assert.equal(P.zahlen(seite("login")), null);
});

test("liste: leer nur mit Tabelle und null Mails; eine fremde Seite ist unsicher", () => {
  assert.deepEqual(P.liste(seite("posteingang-leer")), { art: "leer", mails: [], seiten: 1, gesamt: 0 });
  assert.equal(P.liste(seite("portal")).art, "unsicher");
  assert.equal(P.liste(seite("login")).art, "unsicher");
  // Tabelle ohne Zeilen, laut Zeile über der Liste aber 64 Mails: Aufbau geändert, nicht leer
  assert.equal(P.liste(seite("posteingang-leer").replace("(Keine Nachrichten)", "(64 Nachrichten / Seite 1 von 3)")).art, "unsicher");
});

test("nachricht: Kopf aus den Beschriftungen, Text mit Zeilen und höchstens einer Leerzeile, ohne Menü", () => {
  const n = P.nachricht(seite("nachricht"));
  assert.equal(n.betreff, "Anmeldung zu den Prüfungen & Fristen");
  assert.equal(n.datum, "22.10.2026 (08:40:00 MESZ)");
  assert.equal(n.von, "Prüfungsamt Wirtschaftswissenschaft <pruefungsamt@wiwi.uni-tuebingen.de>");
  assert.equal(n.an, "verteiler@wiwi.uni-tuebingen.de");
  assert.equal(n.kopie, "");
  assert.equal(n.text, "Liebe Studierende,\n\ndie Anmeldung läuft vom 1.12. bis 15.12.\nInfos: https://uni-tuebingen.de/pruefungen\n\nViele Grüße\nIhr Prüfungsamt");
  assert.doesNotMatch(n.text, /Löschen|Abmelden/);
  const en = P.nachricht(seite("nachricht").replace("<em>Betreff:</em>", "<em>Subject:</em>").replace("<em>Von:</em>", "<em>From:</em>"));
  assert.equal(en.betreff, "Anmeldung zu den Prüfungen & Fristen");
  assert.match(en.von, /^Prüfungsamt/);
  assert.equal(P.nachricht(seite("login")), null);
});

test("datumKurz: heute die Uhrzeit, dieses Jahr Tag und Monat, sonst wie geliefert", () => {
  assert.equal(P.datumKurz("08:40:00", "2026-10-22"), "08:40");
  assert.equal(P.datumKurz("8:05", "2026-10-22"), "08:05");
  assert.equal(P.datumKurz("21.10.2026", "2026-10-22"), "21.10.");
  assert.equal(P.datumKurz("1.2.2026", "2026-10-22"), "01.02.");
  assert.equal(P.datumKurz("30.12.2025", "2026-10-22"), "30.12.2025");
  assert.equal(P.datumKurz("Gestern", "2026-10-22"), "Gestern");
});

test("Adressen: nur Posteingang, Seite und Mail als Zahl; nie ein Link aus der Seite", () => {
  assert.equal(P.listeAdresse(1), "https://webmail.uni-tuebingen.de/imp/basic.php?page=mailbox&mailbox=SU5CT1g&mpage=1");
  assert.equal(P.listeAdresse("2"), "https://webmail.uni-tuebingen.de/imp/basic.php?page=mailbox&mailbox=SU5CT1g&mpage=2");
  assert.equal(P.listeAdresse(0), "https://webmail.uni-tuebingen.de/imp/basic.php?page=mailbox&mailbox=SU5CT1g&mpage=1");
  assert.equal(P.zahlenAdresse(), "https://webmail.uni-tuebingen.de/imp/minimal.php?page=mailbox&mailbox=SU5CT1g");
  assert.equal(P.nachrichtAdresse(64), "https://webmail.uni-tuebingen.de/imp/minimal.php?mailbox=SU5CT1g&buid=64&page=message");
  for (const x of [0, -1, "64&a=d", null, "x"]) assert.throws(() => P.nachrichtAdresse(x), /ungültige Mail/, String(x));
  const quelltext = fs.readFileSync(path.join(SKRIPTE, "postfach.js"), "utf8");
  assert.doesNotMatch(quelltext, /actionID|a=d|empty_mailbox|expunge/, "postfach.js baut keine Adressen für Aktionen");
});
