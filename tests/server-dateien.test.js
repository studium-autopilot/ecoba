// Tests für server/dateien.mjs: Lesen, Schreiben und Aufräumen in Ordnern, die ein anderer Benutzer beschreiben kann, ohne je einem
// Link zu folgen; dazu der Zustand (zustand.mjs) mit einem untergeschobenen Link. Links auf Dateien gibt es unter Windows nur mit
// Adminrechten: Diese Fälle laufen dann nicht (GitHub Actions prüft sie unter Linux); Ordner verknüpft Windows als Junction.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const assert = require("node:assert/strict");

const SERVER = path.join(__dirname, "..", "server");
const da = fs.existsSync(path.join(SERVER, "dateien.mjs"));
const laden = (d) => import(pathToFileURL(path.join(SERVER, d)).href);
const ordner = () => fs.mkdtempSync(path.join(os.tmpdir(), "studium-dateien-"));
// Link auf eine Datei bzw. einen Ordner (unter Windows für Ordner eine Junction) → true, wenn es ging
const verknuepfen = (ziel, pfad) => {
  try { fs.symlinkSync(ziel, pfad, fs.statSync(ziel).isDirectory() ? "junction" : "file"); return true; } catch (e) { return false; }
};
const DATEI_LINKS = (() => {
  const v = ordner();
  try { fs.writeFileSync(path.join(v, "z"), ""); return verknuepfen(path.join(v, "z"), path.join(v, "l")); } finally { fs.rmSync(v, { recursive: true, force: true }); }
})();
const test = (name, fn, o = {}) => require("node:test")(name, { skip: (!da && "server/ fehlt in diesem Baum") || o.skip }, fn);
const MIT_DATEI_LINKS = { skip: !DATEI_LINKS && "Links auf Dateien brauchen hier Adminrechte" };

test("Dateien: nur echte Dateien lesen, mit Grenze; JSON mit Ersatz", async () => {
  const D = await laden("dateien.mjs");
  const v = ordner();
  try {
    fs.writeFileSync(path.join(v, "a.json"), JSON.stringify({ x: 1 }));
    fs.writeFileSync(path.join(v, "kaputt.json"), "{");
    fs.mkdirSync(path.join(v, "ordner.json"));
    assert.deepEqual(D.jsonLesen(path.join(v, "a.json"), null), { x: 1 });
    assert.equal(D.jsonLesen(path.join(v, "kaputt.json"), "ersatz"), "ersatz");
    assert.equal(D.dateiLesen(path.join(v, "ordner.json")), null, "kein Ordner");
    assert.equal(D.dateiLesen(path.join(v, "fehlt")), null);
    assert.equal(D.dateiLesen(path.join(v, "a.json"), 3), null, "zu groß");
    assert.deepEqual([D.istDatei(path.join(v, "a.json")), D.istOrdner(path.join(v, "ordner.json")), D.da(path.join(v, "fehlt"))], [true, true, false]);
  } finally { fs.rmSync(v, { recursive: true, force: true }); }
});

test("Dateien: ein Link zählt nie als Datei oder Ordner, auch wenn er auf eine zeigt; Lesen folgt ihm nicht", async () => {
  const D = await laden("dateien.mjs");
  const v = ordner();
  try {
    fs.mkdirSync(path.join(v, "geheim"));
    fs.writeFileSync(path.join(v, "geheim", "anmeldung.json"), JSON.stringify({ token: "geheim-123" }));
    assert.ok(verknuepfen(path.join(v, "geheim"), path.join(v, "ordner-link")), "Ordner lassen sich überall verknüpfen");
    assert.deepEqual([D.istOrdner(path.join(v, "ordner-link")), D.istDatei(path.join(v, "ordner-link")), D.da(path.join(v, "ordner-link"))], [false, false, true]);
    if (DATEI_LINKS) {
      fs.symlinkSync(path.join(v, "geheim", "anmeldung.json"), path.join(v, "zustand.json"));
      assert.equal(D.dateiLesen(path.join(v, "zustand.json")), null, "Link auf die Anmeldung: nicht gelesen");
      assert.deepEqual(D.jsonLesen(path.join(v, "zustand.json"), {}), {});
      fs.symlinkSync(path.join(v, "gibt-es-nicht"), path.join(v, "ins-leere"));
      assert.deepEqual([D.da(path.join(v, "ins-leere")), fs.existsSync(path.join(v, "ins-leere"))], [true, false], "auch ein Link ins Leere ist da");
    }
  } finally { fs.rmSync(v, { recursive: true, force: true }); }
});

test("Dateien: Schreiben über eine eigene Zwischendatei, mit festen Rechten, ohne Reste", async () => {
  const D = await laden("dateien.mjs");
  const v = ordner();
  try {
    D.schreibenAtomar(path.join(v, "zustand.json"), "{}", 0o640);
    D.schreibenAtomar(path.join(v, "zustand.json"), "{\"neu\":1}", 0o640);
    assert.equal(fs.readFileSync(path.join(v, "zustand.json"), "utf8"), "{\"neu\":1}");
    assert.deepEqual(fs.readdirSync(v), ["zustand.json"], "keine Zwischendatei liegen geblieben");
    if (process.platform !== "win32") assert.equal(fs.statSync(path.join(v, "zustand.json")).mode & 0o777, 0o640, "Rechte unabhängig von der UMask");
    fs.mkdirSync(path.join(v, "besetzt"));
    assert.throws(() => D.schreibenAtomar(path.join(v, "besetzt"), "x"), "einen Ordner ersetzt es nicht");
    assert.deepEqual(fs.readdirSync(v).sort(), ["besetzt", "zustand.json"], "auch nach einem Fehler keine Zwischendatei");
  } finally { fs.rmSync(v, { recursive: true, force: true }); }
});

test("Dateien: Schreiben ersetzt einen Link an der Stelle der Datei, ohne in sein Ziel zu schreiben", async () => {
  const D = await laden("dateien.mjs");
  const v = ordner();
  try {
    fs.writeFileSync(path.join(v, "anmeldung.json"), "geheim");
    fs.symlinkSync(path.join(v, "anmeldung.json"), path.join(v, "zustand.json"));
    D.schreibenAtomar(path.join(v, "zustand.json"), "{}");
    assert.equal(fs.readFileSync(path.join(v, "anmeldung.json"), "utf8"), "geheim", "Ziel des Links unberührt");
    assert.ok(!fs.lstatSync(path.join(v, "zustand.json")).isSymbolicLink(), "an der Stelle des Links eine echte Datei");
  } finally { fs.rmSync(v, { recursive: true, force: true }); }
}, MIT_DATEI_LINKS);

test("Dateien: Aufräumen lässt nur echte Dateien und Ordner, das Ziel eines Links bleibt", async () => {
  const D = await laden("dateien.mjs");
  const v = ordner();
  try {
    const roh = path.join(v, "roh"), geheim = path.join(v, "geheim");
    fs.mkdirSync(path.join(roh, "uni-postfach"), { recursive: true });
    fs.mkdirSync(geheim);
    fs.writeFileSync(path.join(geheim, "anmeldung.json"), "geheim");
    fs.writeFileSync(path.join(roh, "INDEX.md"), "# Neu");
    fs.writeFileSync(path.join(roh, "uni-postfach", "9.txt"), "Mail");
    verknuepfen(geheim, path.join(roh, "uni-postfach", "claude"));
    let erwartet = 1;
    if (DATEI_LINKS) { fs.symlinkSync(path.join(geheim, "anmeldung.json"), path.join(roh, "uni-postfach", "10.txt")); erwartet++; }
    assert.equal(D.nurDateienUndOrdner(roh), erwartet);
    assert.deepEqual(fs.readdirSync(path.join(roh, "uni-postfach")), ["9.txt"]);
    assert.equal(fs.readFileSync(path.join(geheim, "anmeldung.json"), "utf8"), "geheim");
  } finally { fs.rmSync(v, { recursive: true, force: true }); }
});

test("Zustand: liegt an der Stelle von zustand.json ein Link auf die Claude-Anmeldung, landet ihr Inhalt nicht im Zustand", async () => {
  const { zustandAktualisieren } = await laden("zustand.mjs");
  const v = ordner();
  try {
    const anmeldung = path.join(v, "credentials.json");
    fs.writeFileSync(anmeldung, JSON.stringify({ claudeAiOauth: { accessToken: "sk-ant-geheim" } }));
    fs.symlinkSync(anmeldung, path.join(v, "zustand.json"));
    const z = await zustandAktualisieren(v, { claude: async () => "angemeldet", speicherReserve: async () => "aus", uniZugangGespeichert: async () => false });
    assert.equal(z.claudeAiOauth, undefined);
    const geschrieben = fs.readFileSync(path.join(v, "zustand.json"), "utf8");
    assert.doesNotMatch(geschrieben, /sk-ant-geheim/, "kein Token im Zustand, den der Web-Dienst liest");
    assert.ok(!fs.lstatSync(path.join(v, "zustand.json")).isSymbolicLink(), "der Link ist ersetzt");
    assert.match(fs.readFileSync(anmeldung, "utf8"), /sk-ant-geheim/, "die Anmeldung selbst unberührt");
  } finally { fs.rmSync(v, { recursive: true, force: true }); }
}, MIT_DATEI_LINKS);

