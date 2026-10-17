// Verbindungen (verbindungen.js): Texte mit **fett** und [Link](https://…), Alma-Schritte mit Links. Läuft ohne Obsidian.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { laden } = require("./laden.js");

const V = laden("verbindungen", { kontext: { obsidian: { Modal: class {}, Notice: class {}, Platform: {}, Setting: class {} } } }).ctx.verbindungen;

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
