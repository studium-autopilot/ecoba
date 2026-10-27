// Der Vorname des Autors steht in Dateien, die veröffentlicht werden, nur als Autorenangabe (Regel „Autorname außerhalb der
// Autorenangabe“ in werkzeuge/pruefen.py). pruefen.py prüft das vor jedem Release und in GitHub Actions; hier läuft dieselbe
// Regel (AUTOR_WORT und autor_erlaubt aus pruefen.py, nicht nachgebaut) schon mit npm test, damit ein Kommentar mit dem Namen
// nicht erst beim Release auffällt. Ebenso die Regel „Verweis auf privaten Ordner“ (seit 27.10.2026: ein Kommentar in diesem Test
// nannte den Ordner des Release-Baums und wäre erst beim Release aufgefallen). Nur diese Regeln: alle von pruefen.py brauchten hier
// etwa 8 s.
// Geprüft wird in den Teilen, die der Export übernimmt (Freigabeliste in werkzeuge/release.py): der Tresor, .github/, docs/,
// server/, tests/, die Dateien der Wurzel aus der Liste und werkzeuge/pruefen.py. Welche Dateien, entscheidet wie in pruefen.py:
// im git-Arbeitsordner, was git veröffentlichen würde, sonst jede Datei (der Baum, den werkzeuge/release.py baut, hat kein .git; bis
// 27.10.2026 brach der Test dort ab, npm test im gebauten Baum war rot). Braucht Python, sonst übersprungen.
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const WURZEL = path.join(__dirname, "..");
const python = ["python3", "python"].find((p) => spawnSync(p, ["--version"]).status === 0);

const SKRIPT = `
import os, re, sys
sys.path.insert(0, os.path.join(sys.argv[1], "werkzeuge"))
import pruefen
wurzel = sys.argv[1]
ordner = ("Studium Autopilot/", ".github/", "docs/", "server/", "tests/")
oben = re.compile(r"(README[^/]*\\.md|LICEN[CS]E[^/]*|CONTRIBUTING\\.md|CHANGELOG\\.md|CODE_OF_CONDUCT\\.md|SECURITY\\.md|CITATION\\.cff"
                  r"|THIRD_PARTY_NOTICES\\.md|package(-lock)?\\.json|eslint\\.config\\.mjs|ruff\\.toml)", re.I)
privat = dict(pruefen.INHALT_REGELN)["Verweis auf privaten Ordner"]
alle = pruefen.git_dateien(wurzel)
if alle is None:
    alle = pruefen.dateien_sammeln(wurzel)
for rel in alle:
    if not (rel.startswith(ordner) or oben.fullmatch(rel) or rel == "werkzeuge/pruefen.py") or rel == "tests/release.test.js":
        continue
    if os.path.splitext(rel)[1].lower() in pruefen.BILD_ENDUNGEN:
        continue
    with open(os.path.join(wurzel, rel), "rb") as f:
        roh = f.read()
    if b"\\0" in roh:
        continue
    abschnitt = ""  # wie text_pruefen: letzte Markdown-Überschrift (Autorenabschnitt der README)
    for nr, zeile in enumerate(roh.decode("utf-8", "replace").splitlines(), 1):
        if rel.lower().endswith(".md") and zeile.startswith("#"):
            abschnitt = zeile
        if pruefen.AUTOR_WORT.search(zeile) and not pruefen.autor_erlaubt(rel, zeile, abschnitt):
            print(f"{rel}:{nr}  {pruefen.kuerzen(zeile)}")
        if privat.search(zeile):
            print(f"{rel}:{nr}  privater Ordner: {pruefen.kuerzen(zeile)}")
`;

test("Vorname des Autors nur in den Autorenangaben, kein Verweis auf den privaten Ordner (Teile, die der Export übernimmt)", { skip: !python && "kein Python" }, () => {
  const r = spawnSync(python, ["-X", "utf8", "-c", SKRIPT, WURZEL], { encoding: "utf8", maxBuffer: 1 << 24 });
  assert.equal(r.status, 0, r.stderr);
  const funde = r.stdout.split(/\r?\n/).filter(Boolean);
  assert.deepEqual(funde, [], "neutral fassen, etwa „Rückmeldung vom 26.10.2026: …“, und ohne den privaten Ordner:\n" + funde.join("\n"));
});
