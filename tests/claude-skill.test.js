// Skill für Claude im Tresor (Studium Autopilot/.claude/): Aufbau, Update-Klasse und dieselben Regeln wie im Code. Ändert sich
// eine Kategorie, ein Abschnitt oder die Auswahl der To-dos im Plugin, schlägt dieser Test an, statt dass der Skill still veraltet.
// Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { laden } = require("./laden.js");

const TRESOR = path.join(__dirname, "..", "Studium Autopilot");
const SKILL = path.join(TRESOR, ".claude", "skills", "studium-autopilot");
const SKRIPTE = path.join(TRESOR, "System", "Skripte");
const lesen = (p) => fs.readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const skillText = () => fs.readdirSync(SKILL).filter((n) => n.endsWith(".md")).map((n) => lesen(path.join(SKILL, n))).join("\n");
const liste = (datei, name) => JSON.parse(new RegExp("const " + name + " = (\\[[^\\]]*\\]);").exec(lesen(path.join(SKRIPTE, datei)))[1]);

test("Aufbau: CLAUDE.md verweist auf den Skill, SKILL.md mit Name und Beschreibung, alle verlinkten Teile da", () => {
  assert.match(lesen(path.join(TRESOR, ".claude", "CLAUDE.md")), /\.claude\/skills\/studium-autopilot\/SKILL\.md/);
  const s = lesen(path.join(SKILL, "SKILL.md"));
  const kopf = /^---\nname: (.+)\ndescription: (.+)\n---\n/.exec(s);
  assert.ok(kopf, "Frontmatter mit name und description");
  assert.equal(kopf[1], "studium-autopilot");
  assert.ok(kopf[2].length > 80 && kopf[2].length <= 1024, "Beschreibung sagt, wann");
  const teile = [...s.matchAll(/\]\(([a-z-]+\.md)\)/g)].map((m) => m[1]);
  assert.deepEqual(teile.sort(), ["fehler-melden.md", "lesefassung.md", "lesen.md", "schreiben.md", "tresor.md"]);
  for (const t of teile) assert.ok(fs.existsSync(path.join(SKILL, t)), t);
});

// Update (seit 0.6.9): CLAUDE.md und der Skill haben die Klasse claude und stehen nur im Schlüssel „weitere“ der Liste. Die
// Planer bis 0.6.8 kennen für .claude/ keine Klasse und lehnten in „dateien“ die ganze Liste ab (kein Update möglich); „weitere“
// übergehen sie. Danach holt jeder Computer den Skill nach (update.js, claudeNachholenMit; tests/update-claude.test.js).
test("Update: CLAUDE.md und der Skill kommen mit (Klasse claude), eigene Skills und Einstellungen nie", () => {
  const U = laden("update").ctx.update;
  assert.equal(U.klasseVon(".claude/CLAUDE.md"), "claude");
  for (const n of fs.readdirSync(SKILL)) assert.equal(U.klasseVon(".claude/skills/studium-autopilot/" + n), n.endsWith(".md") ? "claude" : "", n);
  assert.deepEqual(U.WEITERE, ["claude"]);
  for (const p of [".claude/skills/meine-regeln/SKILL.md", ".claude/settings.json", ".claude/settings.local.json"]) assert.equal(U.klasseVon(p), "", p);
});

test("Gleiche Regeln wie im Code: Kategorien, Arten der Unterlagen, Abschnitte, To-dos", () => {
  const t = skillText();
  for (const k of liste("zentral.js", "KATEGORIEN")) assert.ok(t.includes(k), "Kategorie " + k);
  for (const a of liste("unterlagen.js", "ARTEN")) assert.ok(t.includes(a), "Art " + a);
  const unterlagen = lesen(path.join(SKRIPTE, "unterlagen.js")), notizen = lesen(path.join(SKRIPTE, "notizen.js"));
  for (const h of ["## Das Wichtigste", "## Offene Fragen"]) { assert.ok(unterlagen.includes(h), h + " in unterlagen.js"); assert.ok(t.includes(h), h); }
  for (const h of ["## Mitschrift", "## Prüfungsrelevant", "## Offene Fragen", "## Nacharbeit"]) { assert.ok(notizen.includes(h), h + " in notizen.js"); assert.ok(t.includes(h), h); }
  // Auswahl der To-dos wie todos.js
  const aus = liste("todos.js", "AUSSCHLUSS");
  assert.deepEqual(aus, ["system/", "module/", "studium/", "lernplan/", "dashboard.md"]);
  assert.match(t, /außerhalb von `System\/`, `Module\/`, `Studium\/`,\n?\s*`Lernplan\/` und `Dashboard\.md`/);
  // Id-Felder der Quellen wie quellen.js
  const Q = require(path.join(SKRIPTE, "quellen.js"));
  for (const h of ["zentral", "claude", "alma", "ilias-gruppe", "gruppe-gewaehlt", "ilias-kalender"]) {
    assert.ok(t.includes("`" + Q.idFeld(h) + "`"), `Id-Feld ${Q.idFeld(h)} für ${h}`);
  }
});

test("Fehler melden: Vorlagen und Feld-ids wie in .github/ISSUE_TEMPLATE, kein labels= im Link, Sicherheitslücken privat", () => {
  const t = lesen(path.join(SKILL, "fehler-melden.md"));
  const VORLAGEN = path.join(__dirname, "..", ".github", "ISSUE_TEMPLATE");
  for (const [vorlage, ids] of [["fehler.yml", ["was", "seite", "version"]], ["termin.yml", ["titel", "richtig", "quelle"]], ["idee.yml", ["idee", "warum"]]]) {
    const yml = lesen(path.join(VORLAGEN, vorlage));
    const textfelder = [...yml.matchAll(/- type: (?:input|textarea)\n\s+id: ([\w-]+)/g)].map((m) => m[1]);
    assert.deepEqual(ids.filter((i) => !textfelder.includes(i)), [], `${vorlage}: Felder gibt es als Textfeld`);
    const zeile = t.split("\n").find((z) => z.startsWith("| `" + vorlage + "` |"));
    assert.ok(zeile, vorlage + " in der Tabelle");
    for (const i of ids) assert.ok(zeile.includes("`" + i + "`"), `${vorlage}: ${i} genannt`);
    assert.ok(zeile.includes("„" + /^title: "([^"]+)"/m.exec(yml)[1].trim()), vorlage + ": Titel wie die Vorlage");
  }
  assert.match(lesen(path.join(VORLAGEN, "config.yml")), /blank_issues_enabled: false/, "nur über Vorlagen");
  assert.ok(t.includes("https://github.com/studium-autopilot/ecoba/issues/new?template="));
  assert.ok(!/[?&]labels=/.test(t), "kein labels= (ohne Rechte 404)");
  const sicherheit = /https:\/\/github\.com\/studium-autopilot\/ecoba\/security\/advisories\/new/.exec(lesen(path.join(__dirname, "..", "SECURITY.md")))[0];
  assert.ok(t.includes(sicherheit), "Link wie SECURITY.md");
  assert.match(lesen(path.join(TRESOR, ".claude", "CLAUDE.md")), /fehler-melden\.md/);
});

test("Sprache: Wörter wie in der App, keine Pfade dieses Rechners", () => {
  const t = skillText() + lesen(path.join(TRESOR, ".claude", "CLAUDE.md"));
  assert.doesNotMatch(t.replace(/in Obsidian: Vault/g, ""), /\bVault\b/, "Tresor statt Vault");
  assert.doesNotMatch(t, /\bCP\b|\bCredits?\b|Klausurtermin|Kennwort|[Ff]erien/);
  assert.doesNotMatch(t, /[A-Z]:\\|\/Users\//, "keine Pfade dieses Rechners (private Ordner prüft pruefen.py im Export)");
});

// Lesefassung von Folien: nur Bausteine, die das CSS kennt, und die Abschnitte, die das Plugin beim Vorfalten offen lässt
test("Lesefassung: Klassen und Kästen aus eba-core.css, offene Abschnitte wie start.js", () => {
  const t = lesen(path.join(SKILL, "lesefassung.md"));
  const css = lesen(path.join(TRESOR, ".obsidian", "snippets", "eba-core.css"));
  assert.ok(css.includes("cssclasses: eba, eba-folien"), "Abschnitt Folien als Markdown");
  for (const k of ["eba-bild", "eba-raster", "eba-karte", "eba-formeln", "eba-pdf"]) {
    assert.ok(t.includes("[!" + k), k + " im Skill");
    assert.ok(css.includes(`data-callout="${k}"`), k + " im CSS");
  }
  assert.ok(css.includes('data-callout-metadata~="spalten"'), "|spalten im CSS");
  const offen = JSON.parse(/const OFFEN = (\[[^\]]*\]);/.exec(lesen(path.join(SKRIPTE, "start.js")))[1]);
  for (const h of offen) assert.ok(t.includes("„" + h + "“"), h);
  assert.match(t, /cssclasses` mit `eba` und `eba-folien`/);
});
