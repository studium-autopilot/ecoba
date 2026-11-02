// Sperren für Claude Code im Tresor (.claude/settings.json, docs/architektur/claude.md): Claude schreibt nie in System/, .obsidian/
// und keine Skripte oder CSS. Das Plugin führt jedes Skript in System/Skripte/ beim Start aus; ein von Claude geschriebenes liefe
// auf jedem Gerät. Läuft ohne Obsidian: node --test tests/
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { laden } = require("./laden.js");

const VAULT = path.join(__dirname, "..", "Studium Autopilot");
const datei = path.join(VAULT, ".claude", "settings.json");

test("settings.json: gültiges JSON, nur Sperren (keine Erlaubnis, keine Hooks, kein Hilfsprogramm)", () => {
  const s = JSON.parse(fs.readFileSync(datei, "utf8"));
  assert.deepEqual(Object.keys(s).sort(), ["$schema", "permissions"]);
  assert.deepEqual(Object.keys(s.permissions), ["deny"], "allow würde Rechte geben, die der Tresor nicht braucht");
  const deny = s.permissions.deny;
  for (const r of ["Edit(/System/**)", "Edit(/.obsidian/**)", "Edit(/Dashboard.md)", "Edit(/Studium/**)", "Edit(/Unterlagen/_Volltext/**)",
    "Edit(/.claude/settings.json)", "Edit(/.claude/settings.local.json)", "Edit(/.claude/CLAUDE.md)", "Edit(/.claude/skills/studium-autopilot/**)",
    "Edit(/.mcp.json)", "Edit(**/*.js)", "Edit(**/*.css)"]) assert.ok(deny.includes(r), r);
  for (const r of deny) assert.match(r, /^Edit\([^()\s]+\)$/, "nur Edit-Sperren mit einem Muster: " + r);
});

test("settings.json: gleiche Sperren wie die Regeln in CLAUDE.md und im Skill („änderst du nie“)", () => {
  const md = fs.readFileSync(path.join(VAULT, ".claude", "CLAUDE.md"), "utf8");
  const deny = JSON.parse(fs.readFileSync(datei, "utf8")).permissions.deny;
  for (const ort of ["System/", "Dashboard.md", "Studium/", "Unterlagen/_Volltext/"]) {
    assert.ok(md.includes("`" + ort + "`"), "CLAUDE.md nennt " + ort);
    assert.ok(deny.some((r) => r.indexOf("Edit(/" + ort) === 0), "settings.json sperrt " + ort);
  }
});

test("Update: settings.json gehört zur Klasse claude (ersetzt wie CLAUDE.md), settings.local.json nie", () => {
  const U = laden("update").ctx.update;
  assert.equal(U.klasseVon(".claude/settings.json"), "claude");
  assert.equal(U.klasseVon(".claude/CLAUDE.md"), "claude");
  assert.equal(U.klasseVon(".claude/settings.local.json"), "");
  assert.equal(U.klasseVon(".claude/skills/meine-regeln/SKILL.md"), "");
});
