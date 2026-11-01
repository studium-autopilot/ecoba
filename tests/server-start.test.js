// Tests für server/start.sh (die ganze Einrichtung in der Cloud Shell mit einem Befehl): Reihenfolge der Schritte, die letzte
// Zeile [fertig] bzw. [halt:<schritt>:<grund>] für jeden Halt, den der Skill kennt, Warten mit Grenze, und dass Entscheidungen
// beim Menschen bleiben (nie --ja, nie ssh-keygen -R, nie Claude-Anmeldung ohne Terminal). einrichten.mjs, stand.mjs, fern.sh,
// curl, jq, ssh-keygen und sleep sind Attrappen, die nach einem Drehbuch antworten und jeden Aufruf aufschreiben.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");

const SERVER = path.join(__dirname, "..", "server");
const da = fs.existsSync(path.join(SERVER, "start.sh"));
const bashDa = spawnSync("bash", ["-c", "true"]).status === 0;
const test = (name, fn) => require("node:test")(name, { skip: !da ? "server/ fehlt in diesem Baum" : !bashDa && "kein bash" }, fn);

const MAIL = "studi" + "@example.org";
const ADRESSE = "https://127-0-0-1.ss" + "lip.io";

// Antwortet nach dem Drehbuch (SZENARIO): je Schlüssel eine Liste { aus, exit }, der Reihe nach, die letzte wiederholt sich.
// Schlüssel: Name und erster Befehl, dazu --json bzw. --kosten; curl: „curl status“, „curl api“, „curl paket“.
const ATTRAPPE = `const fs = require("node:fs");
function lauf(name, args) {
  const sz = JSON.parse(fs.readFileSync(process.env.SZENARIO, "utf8"));
  const zaehler = fs.existsSync(process.env.ZAEHLER) ? JSON.parse(fs.readFileSync(process.env.ZAEHLER, "utf8")) : {};
  const befehl = args[0] && !args[0].startsWith("--") ? [args[0]] : [];
  let schluessel = [name, ...befehl, ...args.filter((a) => a === "--json" || a === "--kosten")].join(" ");
  if (name === "curl") {
    const url = args.find((a) => a.startsWith("https://")) || "";
    schluessel = url.endsWith("/v1/status") ? "curl status" : url.includes("api.github.com") ? "curl api" : "curl paket";
    const ziel = args[args.indexOf("-o") + 1];
    if (schluessel === "curl paket" && args.includes("-o")) fs.copyFileSync(process.env.PAKET, ziel);
  }
  // Pfade zum Schlüssel als ~/.ssh/… (unter Windows kommen sie als C:/… an)
  fs.appendFileSync(process.env.AUFRUFE, [name, ...args].join(" ").replace(/\\S*[\\\\/]\\.ssh[\\\\/]/g, "~/.ssh/") + "\\n");
  const liste = sz[schluessel];
  if (!liste) { console.log("Attrappe kennt nicht: " + schluessel); process.exit(99); }
  const i = Math.min(zaehler[schluessel] || 0, liste.length - 1);
  zaehler[schluessel] = i + 1;
  fs.writeFileSync(process.env.ZAEHLER, JSON.stringify(zaehler));
  const a = typeof liste[i] === "string" ? { aus: liste[i] } : liste[i];
  const aus = typeof a.aus === "string" ? a.aus : JSON.stringify(a.aus || "");
  if (aus) process.stdout.write(aus + "\\n");
  process.exit(a.exit || 0);
}
module.exports = lauf;
if (require.main === module) lauf(process.argv[2], process.argv.slice(3));
`;
// jq für die Filter von start.sh: Pfade mit „// empty“ und die Assets des Releases
const JQ = `#!/usr/bin/env node
const fs = require("node:fs");
const [filter, datei] = process.argv.slice(2).filter((a) => a !== "-r");
const d = JSON.parse(fs.readFileSync(datei || 0, "utf8"));
let m = /^\\.assets\\[\\] \\| select\\(\\.name == "([^"]+)"\\) \\| \\.(\\w+)( \\/\\/ empty)?$/.exec(filter);
let w;
if (m) w = ((d.assets || []).find((x) => x.name === m[1]) || {})[m[2]];
else if ((m = /^((?:\\.[a-z_]+)+)( \\/\\/ empty)?$/.exec(filter))) w = m[1].split(".").slice(1).reduce((o, k) => (o == null ? undefined : o[k]), d);
else { console.error("jq-Attrappe kennt den Filter nicht: " + filter); process.exit(3); }
if (m[3] || m[2]) { if (w == null || w === false) process.exit(0); } else if (w === undefined) w = null;
process.stdout.write((w !== null && typeof w === "object" ? JSON.stringify(w) : String(w)) + "\\n");
`;

// Startet start.sh mit dem Drehbuch. opt.schluessel: ~/.ssh/studium_autopilot liegt schon da; opt.paket: Datei für „curl paket“
function starten(drehbuch, args = ["--paket-da"], opt = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "start-"));
  const p = (...t) => path.join(tmp, ...t);
  try {
    for (const d of ["bin", "studium-autopilot/server"]) fs.mkdirSync(p(d), { recursive: true });
    fs.writeFileSync(p("attrappe.cjs"), ATTRAPPE);
    fs.writeFileSync(p("szenario.json"), JSON.stringify(drehbuch));
    fs.copyFileSync(path.join(SERVER, "start.sh"), p("studium-autopilot", "start.sh"));
    const mjs = (name) => `import { createRequire } from "node:module";\ncreateRequire(import.meta.url)(process.env.ATTRAPPE)("${name}", process.argv.slice(2));\n`;
    fs.writeFileSync(p("studium-autopilot", "server", "einrichten.mjs"), mjs("einrichten"));
    fs.writeFileSync(p("studium-autopilot", "server", "stand.mjs"), mjs("stand"));
    fs.writeFileSync(p("studium-autopilot", "server", "fern.sh"), 'exec node "$ATTRAPPE" fern "$@"\n');
    fs.writeFileSync(p("studium-autopilot", "server", "VERSION"), "0.0.0-test\n");
    fs.writeFileSync(p("bin", "curl"), '#!/usr/bin/env bash\nexec node "$ATTRAPPE" curl "$@"\n', { mode: 0o755 });
    fs.writeFileSync(p("bin", "sleep"), '#!/usr/bin/env bash\necho "sleep $*" >> "$AUFRUFE"\n', { mode: 0o755 });
    fs.writeFileSync(p("bin", "ssh-keygen"), '#!/usr/bin/env bash\necho "ssh-keygen $*" | sed "s#$HOME#~#g" >> "$AUFRUFE"\n' +
      'ziel=""; while [ $# -gt 0 ]; do [ "$1" = -f ] && ziel=$2; shift; done\n[ -z "$ziel" ] || { echo privat > "$ziel"; echo "ssh-rsa AAAA test" > "$ziel.pub"; }\n', { mode: 0o755 });
    if (spawnSync("bash", ["-c", "command -v jq"]).status !== 0) fs.writeFileSync(p("bin", "jq"), JQ, { mode: 0o755 });
    if (opt.schluessel) {
      fs.mkdirSync(p(".ssh"));
      fs.writeFileSync(p(".ssh", "studium_autopilot"), "privat\n");
      fs.writeFileSync(p(".ssh", "studium_autopilot.pub"), "ssh-rsa AAAA test\n");
    }
    const r = spawnSync("bash", [p("studium-autopilot", "start.sh"), ...args], {
      encoding: "utf8", input: "",
      env: Object.assign({}, process.env, { HOME: tmp, ATTRAPPE: p("attrappe.cjs"), SZENARIO: p("szenario.json"), ZAEHLER: p("zaehler.json"),
        AUFRUFE: p("aufrufe"), PAKET: opt.paket || "", PATH: p("bin") + path.delimiter + process.env.PATH }),
    });
    const aufrufe = fs.existsSync(p("aufrufe")) ? fs.readFileSync(p("aufrufe"), "utf8").trim().split("\n") : [];
    const zeilen = (r.stdout || "").trim().split("\n");
    const version = fs.existsSync(p("studium-autopilot", "server", "VERSION")) ? fs.readFileSync(p("studium-autopilot", "server", "VERSION"), "utf8").trim() : "";
    return { status: r.status, aus: r.stdout + r.stderr, letzte: zeilen[zeilen.length - 1], aufrufe, version };
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

const OK = { aus: "", exit: 0 };
// Ein frisches Konto bis zum Server (Antworten wie einrichten.mjs: Zeilen [status] text)
const BIS_SERVER = {
  "stand": [{ aus: "Kontotyp: Free Tier" }],
  "einrichten schutz": [{ aus: "[angelegt] Quota „nur-kostenlos“ angelegt\n[angelegt] Budget „kostenwarnung“ angelegt" }],
  "einrichten netz": [{ aus: "[da] Netz besteht." }],
  "einrichten schluessel-holen": [{ aus: "[keine-kopie] Es gibt keine Kopie des Schlüssels im Konto." }],
  "einrichten schluessel-sichern": [{ aus: "[gesichert] Schlüssel im privaten Bucket gesichert." }],
};
const STATUS = (w) => ({ aus: Object.assign({ schema: 1, claude: "angemeldet", plugin_abruf: null, letzter_lauf: null, claude_lauf: "ruht" }, w) });
const SERVER_DA = Object.assign({}, BIS_SERVER, {
  "einrichten server": [{ aus: "[da] Server „studium-autopilot-server“ ist schon angelegt." }],
  "einrichten abschliessen": [{ aus: "[da] Metadaten nur über IMDSv2." }],
  "fern installieren": [OK],
  "einrichten adresse --json": [{ aus: { ip: "127.0.0.1", adresse: ADRESSE } }],
  "einrichten adresse": [{ aus: "[da] Server RUNNING: " + ADRESSE }],
  "fern verbinden": [{ aus: "Link: obsidian://studium-autopilot?aktion=server-verbinden" }],
  "stand --kosten": [{ aus: "alles kostenlos" }],
});

test("start.sh: frisches Konto ohne Platz → Schritte der Reihe nach, Schlüssel mit Kopie, Platzsucher, nie --ja", () => {
  const r = starten(Object.assign({}, BIS_SERVER, {
    "einrichten server": [{ aus: "[kein-platz] Oracle hat gerade in keinem Verfügbarkeitsbereich Platz.", exit: 3 }],
    "einrichten platzsucher": [{ aus: "[angelegt] Mail-Abo angelegt.\n[angelegt] Helfer angelegt." }],
  }), ["--paket-da", "--mail", MAIL]);
  assert.deepEqual([r.status, r.letzte], [3, "[halt:platzsucher:sucht]"], r.aus);
  assert.deepEqual(r.aufrufe, ["stand", `einrichten schutz --mail ${MAIL}`, "einrichten netz", "einrichten schluessel-holen",
    "ssh-keygen -q -t rsa -b 4096 -N  -C studium-autopilot -f ~/.ssh/studium_autopilot", "einrichten schluessel-sichern",
    "einrichten server --schluessel ~/.ssh/studium_autopilot.pub", "einrichten platzsucher --schluessel ~/.ssh/studium_autopilot.pub"]);
  assert.ok(!r.aufrufe.some((a) => a.includes("--ja")));
});

test("start.sh: Halte im Oracle-Konto sagen in der letzten Zeile, wer dran ist", () => {
  const frage = starten(Object.assign({}, BIS_SERVER, { "einrichten schutz": [{ aus: "[frage] Im Konto läuft schon, was nicht kostenlos ist.", exit: 2 }] }));
  assert.deepEqual([frage.status, frage.letzte], [3, "[halt:schutz:frage]"]);
  assert.ok(!frage.aufrufe.some((a) => a.includes("--ja")), "die Zustimmung gibt der Mensch");
  const mail = starten(Object.assign({}, BIS_SERVER, { "einrichten schutz": [{ aus: "[fehler] --mail <adresse> fehlt", exit: 2 }] }));
  assert.equal(mail.letzte, "[halt:schutz:mail]");
  assert.equal(mail.aufrufe[1], "einrichten schutz", "ohne --mail fragt start.sh das Budget");
  assert.equal(starten(BIS_SERVER, ["--paket-da", "--mail", "keine-adresse"]).letzte, "[halt:start:mail]");
  const passt = starten(Object.assign({}, BIS_SERVER, { "einrichten server": [{ aus: "[fehler] Neuer Server passt nicht: freie A1-Menge reicht nicht.", exit: 1 }] }));
  assert.equal(passt.letzte, "[halt:server:passt-nicht]");
  const fehler = starten(Object.assign({}, BIS_SERVER, { "einrichten netz": [{ aus: "[fehler] netz: NotAuthorized (404)", exit: 1 }] }));
  assert.deepEqual([fehler.status, fehler.letzte], [1, "[halt:netz:fehler]"]);
  const stand = starten(Object.assign({}, BIS_SERVER, { "stand": [{ aus: "Nicht geprüft: Budget", exit: 2 }] }));
  assert.equal(stand.letzte, "[halt:stand:unvollstaendig]");
  const abw = starten(Object.assign({}, BIS_SERVER, { "einrichten schluessel-sichern": [{ aus: "[abweichend] anderer Schlüssel", exit: 2 }] }), ["--paket-da"], { schluessel: true });
  assert.equal(abw.letzte, "[halt:schluessel:abweichend]");
  assert.ok(!abw.aufrufe.some((a) => a.startsWith("ssh-keygen") || a.includes("schluessel-holen")), "ein Schlüssel in der Cloud Shell bleibt");
  for (const [aus, exit, halt] of [["[angehalten] Oracle lehnt ab", 1, "[halt:platzsucher:angehalten]"], ["[kein-platz] auch für den Helfer", 3, "[halt:platzsucher:kein-platz]"]]) {
    const p = starten(Object.assign({}, BIS_SERVER, { "einrichten server": [{ aus: "[platzsucher] sucht schon", exit: 3 }], "einrichten platzsucher": [{ aus, exit }] }));
    assert.equal(p.letzte, halt);
  }
});

test("start.sh: Server da → abschließen (wartet auf den Helfer), installieren (wartet auf ssh), Neustart nach dem Vergrößern, Link zum Verbinden", () => {
  const r = starten(Object.assign({}, SERVER_DA, {
    "einrichten abschliessen": [{ aus: "[laeuft] Der Platzsucher-Helfer läuft noch", exit: 2 }, { aus: "[laeuft] noch", exit: 2 },
      { aus: "[entfernt] Richtlinie des Platzsuchers entfernt.\n[vergroessert] Boot-Volume von 150 auf 200 GB vergrößert." }],
    "fern installieren": [{ aus: "[fern] Der Server antwortet nicht auf ssh.", exit: 5 }, OK],
    "fern neustart": [OK],
    "fern status": [{ exit: 5 }, OK],
    "curl status": [STATUS({})],
  }), ["--paket-da"], { schluessel: true });
  assert.deepEqual([r.status, r.letzte], [3, "[halt:verbinden:link]"], r.aus);
  const wichtig = r.aufrufe.filter((a) => !a.startsWith("einrichten adresse") && !a.startsWith("curl") && !a.startsWith("sleep"));
  assert.deepEqual(wichtig.slice(4), ["einrichten server --schluessel ~/.ssh/studium_autopilot.pub", "einrichten abschliessen", "einrichten abschliessen",
    "einrichten abschliessen", "fern installieren", "fern installieren", "fern neustart", "fern status", "fern status", "fern verbinden"]);
  assert.equal(r.aufrufe.filter((a) => a === "sleep 60").length, 4, "je Wiederholung eine Minute");
  assert.match(r.aus, /\[da\] Server RUNNING: https:\/\/127-0-0-1\./, "die Adresse aus dem Konto steht vor dem Link");
});

test("start.sh: nach dem Verbinden erster Lauf mit Warten, Kostenprüfung, [fertig]", () => {
  const r = starten(Object.assign({}, SERVER_DA, {
    "curl status": [STATUS({ plugin_abruf: "2026-11-01T10:00:00.000Z" }), STATUS({ plugin_abruf: "x", claude_lauf: "laeuft" }),
      STATUS({ plugin_abruf: "x", letzter_lauf: { zeit: "2026-11-01T10:05:00.000Z", ok: true } })],
    "fern jetzt": [OK],
  }), ["--paket-da"], { schluessel: true });
  assert.deepEqual([r.status, r.letzte], [0, "[fertig]"], r.aus);
  assert.ok(r.aufrufe.includes("fern jetzt") && r.aufrufe.includes("stand --kosten"));
  assert.ok(!r.aufrufe.includes("fern verbinden"), "Obsidian holt schon ab");
  const kosten = starten(Object.assign({}, SERVER_DA, { "curl status": [STATUS({ plugin_abruf: "x", letzter_lauf: { zeit: "x", ok: true } })],
    "stand --kosten": [{ aus: "Befunde: Kosten 0,12 €", exit: 1 }] }), ["--paket-da"], { schluessel: true });
  assert.equal(kosten.letzte, "[halt:kosten:befund]");
  const fehlgeschlagen = starten(Object.assign({}, SERVER_DA, { "curl status": [STATUS({ plugin_abruf: "x", letzter_lauf: { zeit: "x", ok: false } })],
    "fern lauf": [{ aus: "claude-limit" }] }), ["--paket-da"], { schluessel: true });
  assert.equal(fehlgeschlagen.letzte, "[halt:lauf:fehler]");
});

test("start.sh: Entscheidungen bleiben beim Menschen (anderer Hostschlüssel, anderer Schlüssel, Anmeldung ohne Terminal)", () => {
  const host = starten(Object.assign({}, SERVER_DA, { "fern installieren": [{ aus: "[fern] … ssh-keygen -R 127.0.0.1", exit: 6 }] }), ["--paket-da"], { schluessel: true });
  assert.equal(host.letzte, "[halt:installieren:hostschluessel]");
  assert.ok(!host.aufrufe.some((a) => a.includes("ssh-keygen -R")), "nie ohne den Menschen");
  const anders = starten(Object.assign({}, SERVER_DA, { "fern installieren": [{ aus: "[anderer] Der Server wurde mit ~/.ssh/id_rsa.pub angelegt. … cp …", exit: 2 }] }), ["--paket-da"], { schluessel: true });
  assert.equal(anders.letzte, "[halt:installieren:schluessel-kopieren]");
  const fehlt = starten(Object.assign({}, SERVER_DA, { "fern installieren": [{ aus: "[fehlt] Kein Schlüssel unter ~/.ssh passt zum Server.", exit: 1 }] }), ["--paket-da"], { schluessel: true });
  assert.equal(fehlt.letzte, "[halt:installieren:schluessel-fehlt]");
  const gestoppt = starten(Object.assign({}, SERVER_DA, { "fern installieren": [{ aus: "[warten] Der Server ist STOPPED, nicht RUNNING.", exit: 4 }] }), ["--paket-da"], { schluessel: true });
  assert.equal(gestoppt.letzte, "[halt:server:gestoppt]");
  const claude = starten(Object.assign({}, SERVER_DA, { "curl status": [STATUS({ claude: "abgemeldet" })] }), ["--paket-da"], { schluessel: true });
  assert.equal(claude.letzte, "[halt:claude:anmelden]");
  assert.ok(!claude.aufrufe.includes("fern claude-anmelden"), "ohne Terminal keine Anmeldung");
  const warten = starten(Object.assign({}, SERVER_DA, { "einrichten abschliessen": [{ aus: "[laeuft] noch", exit: 2 }] }), ["--paket-da"], { schluessel: true });
  assert.equal(warten.letzte, "[halt:abschliessen:helfer-laeuft]");
  assert.equal(warten.aufrufe.filter((a) => a === "einrichten abschliessen").length, 10, "Warten mit Grenze");
});

test("start.sh: lädt das Paket seiner Version nur mit passender Prüfsumme aus dem Release; sonst bleibt alles, wie es war", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "paket-"));
  try {
    fs.mkdirSync(path.join(tmp, "server"));
    fs.writeFileSync(path.join(tmp, "server", "VERSION"), "0.7.6\n");
    for (const [n, name] of [["einrichten.mjs", "einrichten"], ["stand.mjs", "stand"]]) {
      fs.writeFileSync(path.join(tmp, "server", n), `import { createRequire } from "node:module";\ncreateRequire(import.meta.url)(process.env.ATTRAPPE)("${name}", process.argv.slice(2));\n`);
    }
    assert.equal(spawnSync("bash", ["-c", "tar -czf paket.tar.gz server"], { cwd: tmp }).status, 0);
    const paket = path.join(tmp, "paket.tar.gz");
    const summe = require("node:crypto").createHash("sha256").update(fs.readFileSync(paket)).digest("hex");
    const info = (digest, url = "https://github.com/studium-autopilot/ecoba/releases/download/v0.7.6/studium-server.tar.gz") =>
      ({ aus: { assets: [{ name: "studium-server.tar.gz", browser_download_url: url, digest }] } });
    const drehbuch = Object.assign({}, BIS_SERVER, { "curl paket": [OK], "einrichten schutz": [{ aus: "[fehler] --mail <adresse> fehlt", exit: 2 }] });
    const gut = starten(Object.assign({ "curl api": [info("sha256:" + summe)] }, drehbuch), [], { paket });
    assert.deepEqual([gut.letzte, gut.version], ["[halt:schutz:mail]", "0.7.6"], gut.aus);
    assert.match(gut.aus, /Paket 0\.7\.6 geladen und geprüft/);
    for (const falsch of [info("sha256:" + "0".repeat(64)), info("sha256:" + summe, "https://example.org/studium-server.tar.gz"), info("")]) {
      const r = starten(Object.assign({ "curl api": [falsch] }, drehbuch), [], { paket });
      assert.deepEqual([r.status, r.letzte, r.version], [3, "[halt:paket:pruefsumme]", "0.0.0-test"], "nichts ausgepackt");
      assert.ok(!r.aufrufe.some((a) => a.startsWith("einrichten") || a.startsWith("stand")), "nichts aus dem Paket ausgeführt");
    }
    const netz = starten(Object.assign({}, drehbuch, { "curl api": [{ aus: "", exit: 6 }] }), [], { paket });
    assert.equal(netz.letzte, "[halt:paket:netz]");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
