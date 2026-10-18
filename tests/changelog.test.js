// Regeln für CHANGELOG.md (CONTRIBUTING.md, „Changelog: für Studierende schreiben“): Der Changelog ist das Fenster „Was ist
// neu“ in der App. Geprüft werden „Unveröffentlicht“ und jede Version nach 0.4.0; veröffentlichte Abschnitte bleiben, wie sie
// sind. Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const TEXT = fs.readFileSync(path.join(__dirname, "..", "CHANGELOG.md"), "utf8").replace(/\r\n/g, "\n");
const AB = [0, 4, 1]; // ab dieser Version gelten die Regeln
const ARTEN = ["Neu", "Einfacher", "Schneller", "Übersichtlicher", "Zuverlässiger", "Einheitlicher", "Behoben"];
const MAX_ZEICHEN = 240, MAX_SAETZE = 2, MAX_PUNKTE = 12, MAX_TITELWOERTER = 6;
// Fachwörter: Wortanfang (Plugin, Plugins, Skripte …) bzw. nur als ganzes Wort (Sync, aber nicht „synchronisiert“)
const ANFANG = ["Manifest", "Cache", "Plugin", "Skript", "Codeblock", "Prüfsumme", "Frontmatter", "Callout", "Commit", "Parser",
  "Regex", "Timeout", "localStorage"];
const GANZ = ["Index", "Sync", "Bug", "Bugs", "Fix", "Fixes", "JSON", "API", "Repo", "Hash"];
const FACHWORT = new RegExp(`(?<![\\p{L}])(${ANFANG.join("|")}|(?:${GANZ.join("|")})(?![\\p{L}]))`, "iu");
const DATEINAME = /[\w-]+\.(js|json|md|css|py|txt)\b/i;

const versionNeuer = (v) => {
  const t = v.split(".").map(Number);
  for (let i = 0; i < 3; i++) if (t[i] !== AB[i]) return t[i] > AB[i];
  return true;
};

const abschnitte = () => {
  const aus = [];
  let akt = null;
  for (const zeile of TEXT.split("\n")) {
    const k = /^## (.+)$/.exec(zeile);
    if (k) {
      const v = /^(\d+\.\d+\.\d+) – (.+)$/.exec(k[1]);
      akt = k[1] === "Unveröffentlicht" ? { name: k[1], titel: null, punkte: [] }
        : v && versionNeuer(v[1]) ? { name: v[1], titel: v[2], punkte: [] } : null;
      if (akt) aus.push(akt);
      continue;
    }
    if (!akt) continue;
    if (zeile.startsWith("- ")) akt.punkte.push(zeile.slice(2).trim());
    else if (zeile.startsWith("  ") && akt.punkte.length) akt.punkte[akt.punkte.length - 1] += " " + zeile.trim();
  }
  return aus;
};

const saetze = (t) => (t.replace(/\*\*[^*]+:\*\*/, "").match(/[.!?](?=\s+[A-ZÄÖÜ„]|\s*$)/g) || []).length;

test("Changelog: Regeln für jeden Punkt ab 0.4.1", () => {
  for (const a of abschnitte()) {
    assert.ok(a.punkte.length <= MAX_PUNKTE, `${a.name}: höchstens ${MAX_PUNKTE} Punkte`);
    if (a.titel) assert.ok(a.titel.split(/\s+/).length <= MAX_TITELWOERTER, `${a.name}: Titel höchstens ${MAX_TITELWOERTER} Wörter`);
    for (const p of a.punkte) {
      const kurz = `${a.name}: „${p.slice(0, 60)}…“`;
      // Beta-Funktionen tragen „ (Beta)“ hinter der Art: **Neu (Beta):**
      assert.ok(ARTEN.some((x) => p.startsWith(`**${x}:**`) || p.startsWith(`**${x} (Beta):**`)), `${kurz} beginnt nicht mit **Neu:**, **Behoben:** …`);
      assert.ok(p.length <= MAX_ZEICHEN, `${kurz} hat ${p.length} Zeichen (höchstens ${MAX_ZEICHEN})`);
      assert.ok(saetze(p) <= MAX_SAETZE, `${kurz} hat mehr als ${MAX_SAETZE} Sätze`);
      assert.ok(!p.includes("`"), `${kurz} enthält Code in Backticks`);
      assert.ok(!DATEINAME.test(p), `${kurz} nennt einen Dateinamen`);
      const f = FACHWORT.exec(p);
      assert.ok(!f, `${kurz} enthält das Fachwort „${f && f[1]}“`);
    }
  }
});

test("Changelog: die Prüfung erkennt Verstöße", () => {
  assert.ok(FACHWORT.test("Das Plugin lädt den Cache neu"));
  assert.ok(FACHWORT.test("neue Skripte"));
  assert.ok(!FACHWORT.test("Termine werden synchronisiert"));
  assert.ok(DATEINAME.test("zentral.js holt mehr"));
  assert.equal(saetze("**Neu:** Eins. Zwei. Drei."), 3);
  assert.equal(saetze("**Neu:** Ein Satz mit „Zitat“."), 1);
  assert.ok(versionNeuer("0.4.1") && versionNeuer("1.0.0") && !versionNeuer("0.4.0") && !versionNeuer("0.3.9"));
});
