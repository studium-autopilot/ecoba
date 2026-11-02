// Tests für LiveSync auf dem eigenen Server (server/livesync.sh, server/livesync.mjs): Caddy gibt nur die Datenbank und / weiter,
// die Links tragen den Gerätezugang (nur Mitglied der Datenbank) und schließen den Kern von Studium Autopilot vom Abgleich
// versteckter Dateien aus, das Aufbau-Fenster, „livesync-erneuern“ und das Absichern von CouchDB. CouchDB ist eine Attrappe hinter
// curl, die Anmeldung, Administratoren aus den Einstellungen, _users, _security und den Meilenstein von LiveSync nachbildet.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");

const SERVER = path.join(__dirname, "..", "server");
const da = fs.existsSync(path.join(SERVER, "livesync.sh"));
const bashDa = spawnSync("bash", ["-c", "true"]).status === 0;
const test = (name, fn) => require("node:test")(name, { skip: !da ? "server/ fehlt in diesem Baum" : !bashDa && "kein bash" }, fn);
const laden = () => import(pathToFileURL(path.join(SERVER, "livesync.mjs")).href);
const SKRIPT = da ? fs.readFileSync(path.join(SERVER, "livesync.sh"), "utf8") : "";
// Funktion aus livesync.sh, mehrzeilig oder in einer Zeile
// Port von CouchDB, Adressdienst und Feldnamen von LiveSync zusammengesetzt (werkzeuge/pruefen.py sperrt sie außerhalb von server/)
const PORT = "59" + "84", SSLIP = "ss" + "lip.io", NUTZER = "couchDB" + "_USER";
const fn = (name) => (new RegExp(`^${name}\\(\\) \\{\\n[\\s\\S]*?\\n\\}\\n`, "m").exec(SKRIPT) || new RegExp(`^${name}\\(\\) \\{ [^\\n]*\\}\\n`, "m").exec(SKRIPT))[0];

test("LiveSync: Caddy gibt nur die eine Datenbank und GET/HEAD/OPTIONS auf / an CouchDB, alles andere ist 404", () => {
  const teil = /cat >"\$CADDY_TEIL\.neu" <<CADDY\n([\s\S]*?)\nCADDY\n/.exec(SKRIPT)[1];
  const ziel = "\t\treverse_proxy 127.0.0.1:" + PORT + "\n";
  // erste Zeile: Kommentar, dann der Block
  assert.ok(teil.split("\n").slice(1).join("\n").startsWith("$seite {\n\t@datenbank path /$db /$db/*\n\thandle @datenbank {\n" + ziel + "\t}\n"), teil);
  assert.ok(teil.endsWith("\t@wurzel {\n\t\tpath /\n\t\tmethod GET HEAD OPTIONS\n\t}\n\thandle @wurzel {\n" + ziel +
    "\t}\n\thandle {\n\t\trespond 404\n\t}\n}"), teil);
  assert.equal(teil.match(/reverse_proxy/g).length, 2, "kein weiterer Weg zu CouchDB");
  for (const w of ["_utils", "_node", "_users", "_session", "_all_dbs"]) assert.ok(!teil.includes(w), w);
  // der Name der Datenbank kommt nur geprüft hinein; erreichbar heißt jetzt / mit Anmeldung (/_up gibt Caddy nicht weiter)
  assert.match(fn("adresse_nachziehen"), /\[\[ "\$db" =~ \^\[a-z\]\[a-z0-9-\]\*\$ \]\] \|\| fehler/);
  assert.match(fn("einschalten"), /\[ "\$\(code --max-time 10 "\$adresse\/"\)" = 200 \] && break/);
});

test("LiveSync: Link mit dem Gerätezugang (ohne ihn wie bisher mit dem Administrator), keine Plugins und nicht, welche eingeschaltet sind, im Abgleich versteckter Dateien", async () => {
  const L = await laden();
  const HOST = "obsidian.beispiel.example", PW = "Pw2" + "abc", GPW = "Gp9" + "xyz";
  const alt = { adresse: "https://" + HOST, benutzer: "admin", ["passwort"]: PW, datenbank: "studium-autopilot", e2ee: "Geheim7" };
  const neu = { ...alt, geraet_benutzer: "geraet", ["geraet_passwort"]: GPW };
  const uri = (e) => e.remoteConfigurations[e.activeConfigurationId].uri;
  const e = L.einstellungen(neu);
  assert.deepEqual([e[NUTZER], uri(e)], ["geraet", `sls+https://${["geraet", GPW].join(":")}@${HOST}/?db=studium-autopilot`]);
  assert.ok(!JSON.stringify(e).includes(PW), "das Passwort des Administrators kommt nie in einen Link");
  assert.equal(L.einstellungen(alt)[NUTZER], "admin", "LiveSync von vor dem Gerätezugang: wie bisher, bis livesync-erneuern");
  assert.throws(() => L.einstellungen({ ...neu, datenbank: "x/../_users" }), /Datenbank/);
  // so wie LiveSync die Muster liest: Leerzeichen weg, durch Kommas getrennt, reguläre Ausdrücke ohne Groß- und Kleinschreibung,
  // gegen den Pfad im Tresor ohne führenden Schrägstrich
  const muster = e.syncInternalFilesIgnorePatterns.replace(/\s/g, "").split(",").filter(Boolean).map((m) => new RegExp(m, "i"));
  const ignoriert = (p) => muster.some((m) => m.test(p));
  // ein übernommenes Gerät könnte sonst ein verändertes oder eigenes Plugin samt Eintrag in community-plugins.json an alle schicken
  for (const p of [".obsidian/plugins/studium-autopilot/main.js", ".obsidian/plugins/studium-autopilot/manifest.json", ".obsidian/plugins/obsidian-livesync/data.json",
    ".obsidian/plugins/dataview/main.js", ".obsidian/plugins/neu/main.js", ".obsidian/community-plugins.json", ".obsidian/workspace.json"]) assert.ok(ignoriert(p), p);
  for (const p of [".obsidian/snippets/eba-ruhig.css", ".obsidian/app.json", ".obsidian/appearance.json", ".obsidian/core-plugins.json"]) assert.ok(!ignoriert(p), p);
});

test("LiveSync: Zugangsdaten (neu, Gerätezugang ergänzen, erneuern mit und ohne neuen Schlüssel), Dokument für _users", async () => {
  const L = await laden();
  const k = L.konfigNeu("https://obsidian.203-0-113-5." + SSLIP);
  assert.deepEqual(Object.keys(k).sort(), ["adresse", "benutzer", "datenbank", "e2ee", "geraet_benutzer", "geraet_passwort", "passwort"]);
  for (const f of ["passwort", "e2ee", "geraet_passwort"]) assert.match(k[f], /^[A-Za-z0-9]{32}$/, f);
  assert.notEqual(k.passwort, k.geraet_passwort);
  const alt = { ...k };
  delete alt.geraet_benutzer;
  delete alt.geraet_passwort;
  const ergaenzt = L.geraetErgaenzen(alt);
  assert.deepEqual([ergaenzt.passwort, ergaenzt.e2ee, ergaenzt.geraet_benutzer], [k.passwort, k.e2ee, "geraet"]);
  assert.equal(L.geraetErgaenzen(k), k, "schon da: unverändert");
  const e1 = L.erneuert(k), e2 = L.erneuert(k, true);
  assert.ok(e1.passwort !== k.passwort && e1.geraet_passwort !== k.geraet_passwort && e1.e2ee === k.e2ee, "Schlüssel der Verschlüsselung bleibt");
  assert.notEqual(e2.e2ee, k.e2ee, "--neue-passphrase");
  const d = L.benutzerDokument(k, "3-abc");
  assert.deepEqual({ ...d, password: "" }, { _id: "org.couchdb.user:geraet", _rev: "3-abc", name: "geraet", type: "user", roles: [], password: "" });
  assert.equal(L.benutzerDokument(k)._rev, undefined);
  assert.throws(() => L.benutzerDokument(alt), /Gerätezugang/);
});

// CouchDB als Attrappe hinter curl: Zustand in $COUCH_ZUSTAND, Administratoren aus [admins] der INI (beim Neustart über systemctl)
const CURL = `#!/usr/bin/env node
const fs = require("node:fs");
const a = process.argv.slice(2);
const z = JSON.parse(fs.readFileSync(process.env.COUCH_ZUSTAND, "utf8"));
let methode = "GET", aus = null, format = null, koerper = null, url = "", nutzer = null;
for (let i = 0; i < a.length; i++) {
  const x = a[i];
  if (x === "-K") nutzer = /user = "([^:]*):(.*)"/.exec(fs.readFileSync(0, "utf8"));
  else if (x === "-X") methode = a[++i];
  else if (x === "-o") aus = a[++i];
  else if (x === "-w") format = a[++i];
  else if (x === "-d") koerper = a[++i];
  else if (x === "--data-binary") koerper = fs.readFileSync(a[++i].slice(1), "utf8");
  else if (x === "-H" || x === "--max-time") i++;
  else if (/^https?:/.test(x)) url = x;
}
const p = new URL(url).pathname;
const [u, pw] = nutzer ? [nutzer[1], nutzer[2]] : [null, null];
const admin = u !== null && (z.admins[u] === pw || z.knoten[u] === pw);
const gueltig = admin || (u !== null && z.users[u] && z.users[u].pw === pw);
fs.appendFileSync(process.env.AUFRUFE, methode + " " + p + (u ? " als " + u : "") + "\\n");
let status = 404, antwort = { error: "not_found" };
const ok = (s, b) => { status = s; antwort = b; };
let m;
if (!gueltig) ok(401, { error: "unauthorized" });
else if (p === "/_up" || p === "/") ok(200, { couchdb: "Welcome" });
else if ((m = /^\\/_node\\/_local\\/_config\\/admins\\/(\\w+)$/.exec(p))) {
  if (!admin) ok(401, {});
  else if (methode === "PUT") { z.knoten[m[1]] = JSON.parse(koerper); ok(200, ""); }
  else if (methode === "DELETE") ok(z.knoten[m[1]] !== undefined ? 200 : 404, delete z.knoten[m[1]]);
  else ok(z.knoten[m[1]] !== undefined ? 200 : 404, "x");
} else if ((m = /^\\/_users\\/org\\.couchdb\\.user:(\\w+)$/.exec(p))) {
  const doc = z.users[m[1]];
  if (!admin) ok(401, {});
  else if (methode === "GET") ok(doc ? 200 : 404, doc ? { _rev: doc.rev } : {});
  else {
    const d = JSON.parse(koerper);
    if (doc && d._rev !== doc.rev) ok(409, { error: "conflict" });
    else { z.users[m[1]] = { pw: d.password, rev: (doc ? Number(doc.rev[0]) + 1 : 1) + "-x", roles: d.roles }; ok(201, { ok: true }); }
  }
} else if ((m = /^\\/([a-z][a-z0-9-]*)(\\/.*)?$/.exec(p))) {
  const db = z.dbs[m[1]], rest = m[2] || "";
  if (rest === "" && methode === "PUT") { if (!admin) ok(401, {}); else if (db) ok(412, {}); else { z.dbs[m[1]] = { security: null, meilenstein: false }; ok(201, {}); } }
  else if (rest === "" && methode === "DELETE") { if (!admin) ok(401, {}); else { delete z.dbs[m[1]]; ok(db ? 200 : 404, {}); } }
  else if (!db) ok(404, {});
  else if (rest === "/_security") { if (!admin) ok(401, {}); else { db.security = JSON.parse(koerper); ok(200, { ok: true }); } }
  else if (rest === "/_local/obsydian_livesync_milestone") ok(db.meilenstein ? 200 : 404, {});
}
fs.writeFileSync(process.env.COUCH_ZUSTAND, JSON.stringify(z));
const text = typeof antwort === "string" ? antwort : JSON.stringify(antwort);
// Git Bash reicht /dev/null an Windows-Programme als „nul“ weiter
if (aus && aus !== "/dev/null" && aus.toLowerCase() !== "nul") fs.writeFileSync(aus, text);
if (!aus) process.stdout.write(text);
if (format) process.stdout.write(format.replace("%{http_code}", String(status)));
`;
// jq für die Filter von livesync.sh, wo es fehlt (Windows)
const JQ = `#!/usr/bin/env node
const fs = require("node:fs");
const a = process.argv.slice(2);
const flags = a.filter((x) => /^-[a-zA-Z]+$/.test(x)).join("");
const argI = a.indexOf("--arg"), argv = argI >= 0 ? { [a[argI + 1]]: a[argI + 2] } : {};
const rest = a.filter((x, i) => !/^-[a-zA-Z]+$/.test(x) && (argI < 0 || i < argI || i > argI + 2));
const [filter, datei] = rest;
const roh = fs.readFileSync(datei || 0, "utf8");
if (flags.includes("R")) { process.stdout.write(JSON.stringify(roh.replace(/\\n$/, "")) + (flags.includes("j") ? "" : "\\n")); process.exit(0); }
const d = JSON.parse(roh || "null");
let m;
if ((m = /^\\.(\\w+) = \\$(\\w+)$/.exec(filter))) { d[m[1]] = argv[m[2]]; process.stdout.write(JSON.stringify(d, null, 2) + "\\n"); process.exit(0); }
if (!(m = /^\\.(\\w+)( \\/\\/ empty)?$/.exec(filter))) { console.error("jq-Attrappe kennt den Filter nicht: " + filter); process.exit(3); }
const w = d == null ? null : d[m[1]];
if (w == null || w === "") { if (!m[2]) process.stdout.write("null\\n"); process.exit(0); }
process.stdout.write((typeof w === "object" ? JSON.stringify(w) : String(w)) + "\\n");
`;

// runuser -u couchdb -- …: schreibt den Aufruf auf und führt ihn aus (unter Windows und in Tests derselbe Benutzer)
const RUNUSER = '#!/usr/bin/env bash\necho "runuser $1 $2 ${4:-} ${*: -1}" >> "$AUFRUFE"\nshift 3\nexec "$@"\n';
function aufbau() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "livesync-"));
  const p = (...x) => path.join(tmp, ...x);
  const vorwaerts = (x) => x.replace(/\\/g, "/");
  for (const d of ["bin", "paket", "etc", "daten/web"]) fs.mkdirSync(p(d), { recursive: true });
  fs.writeFileSync(p("bin", "runuser"), RUNUSER, { mode: 0o755 });
  fs.copyFileSync(path.join(SERVER, "livesync.mjs"), p("paket", "livesync.mjs"));
  fs.writeFileSync(p("bin", "curl"), CURL, { mode: 0o755 });
  if (spawnSync("bash", ["-c", "command -v jq"]).status !== 0) fs.writeFileSync(p("bin", "jq"), JQ, { mode: 0o755 });
  // systemctl restart couchdb liest [admins] der INI wie CouchDB (Administratoren aus den Einstellungen per API sind dann weg);
  // is-active: CouchDB läuft (COUCH_LAEUFT=0: nicht), kein Zeitgeber läuft (der transiente ging etwa mit einem Neustart verloren)
  fs.writeFileSync(p("bin", "systemctl"), `#!/usr/bin/env bash\necho "systemctl $*" >> "$AUFRUFE"\n` +
    `if [ "$1" = is-active ]; then [ "\${*: -1}" = couchdb ] && [ "\${COUCH_LAEUFT:-1}" = 1 ] && exit 0; exit 3; fi\nif [ "$1 $2" = "restart couchdb" ]; then node -e '
const fs = require("node:fs"); const z = JSON.parse(fs.readFileSync(process.env.COUCH_ZUSTAND, "utf8"));
const ini = fs.readFileSync(process.env.INI_DATEI, "utf8"); const a = ini.slice(ini.indexOf("[admins]"));
z.admins = Object.fromEntries([...a.matchAll(/^(\\w+) = (\\S+)$/gm)].map((m) => [m[1], m[2]])); z.knoten = {};
fs.writeFileSync(process.env.COUCH_ZUSTAND, JSON.stringify(z));'; fi\n`, { mode: 0o755 });
  for (const b of ["systemd-run", "qrencode", "chown", "sleep"]) fs.writeFileSync(p("bin", b), `#!/usr/bin/env bash\necho "${b} $*" >> "$AUFRUFE"\n`, { mode: 0o755 });
  fs.writeFileSync(p("bin", "sudo"), '#!/usr/bin/env bash\nshift 2\nexec "$@"\n', { mode: 0o755 });
  const ablauf = ["set -euo pipefail", ...["schritt", "fehler", "wert", "couch", "code", "couch_lesen", "couch_datei", "ini_text", "ini_schreiben", "couch_bereit", "geraetezugang",
    "aufbau_oeffnen", "zeitgeber", "aufbau_ende", "aufbau_pruefen", "an_noetig", "verbinden", "erneuern"].map(fn), /^AUFBAU_MIN=.*$/m.exec(SKRIPT)[0],
  'adresse_nachziehen() { echo "adresse_nachziehen" >> "$AUFRUFE"; }', "AUFBAU_EINHEIT=studium-livesync-aufbau COUCH=http://127.0.0.1:" + PORT,
  'T=$1; PAKET=$T/paket KONFIG=$T/etc/dienst.json LS_KONFIG=$T/etc/livesync.json DATEN=$T/daten COUCH_ETC=$T/etc INI=$T/etc/couch.ini',
  'AUFBAU=$T/etc/livesync-aufbau AUFBAU_ERSTES=$T/etc/livesync-erstes-geraet',
  "shift", '"$@"'].join("\n");
  fs.writeFileSync(p("ablauf.sh"), ablauf);
  fs.writeFileSync(p("etc", "dienst.json"), JSON.stringify({ adresse: "https://203-0-113-5." + SSLIP, ip: "203.0.113.5" }));
  fs.writeFileSync(p("daten", "livesync-an"), "");
  const zustand = (z) => z === undefined ? JSON.parse(fs.readFileSync(p("couch.json"), "utf8")) : fs.writeFileSync(p("couch.json"), JSON.stringify(z));
  const konfig = (k) => k === undefined ? JSON.parse(fs.readFileSync(p("etc", "livesync.json"), "utf8")) : fs.writeFileSync(p("etc", "livesync.json"), JSON.stringify(k));
  const lauf = (...args) => {
    fs.rmSync(p("aufrufe"), { force: true });
    const env = typeof args[0] === "object" ? args.shift() : {};
    const r = spawnSync("bash", [vorwaerts(p("ablauf.sh")), vorwaerts(tmp), ...args], { encoding: "utf8",
      env: Object.assign({}, process.env, { AUFRUFE: p("aufrufe"), COUCH_ZUSTAND: p("couch.json"), INI_DATEI: p("etc", "couch.ini"),
        PATH: p("bin") + path.delimiter + process.env.PATH }, env) });
    return { status: r.status, aus: r.stdout, fehler: r.stderr, aufrufe: fs.existsSync(p("aufrufe")) ? fs.readFileSync(p("aufrufe"), "utf8").trim().split("\n") : [] };
  };
  return { p, tmp, lauf, zustand, konfig, weg: () => fs.rmSync(tmp, { recursive: true, force: true }) };
}

test("LiveSync verbinden: Gerätezugang nur als Mitglied der Datenbank; Aufbau-Fenster nur nach einer Datei von root (neue Datenbank), nie nach der Datenbank; abgelaufen zu, offen mit neuem Zeitgeber", () => {
  const u = aufbau(), A = "Ad" + "min1pw", G = "Ge" + "raet2pw";
  const ERSTES = u.p("etc", "livesync-erstes-geraet"), ENDE = u.p("etc", "livesync-aufbau");
  try {
    // LiveSync von vor dem Gerätezugang: Administrator admin, Geräte mit ihm verbunden. Kein Meilenstein (ein Mitglied könnte ihn
    // löschen): öffnet nichts
    u.konfig({ adresse: "https://obsidian.203-0-113-5." + SSLIP, benutzer: "admin", ["passwort"]: A, datenbank: "studium-autopilot", e2ee: "e2e" });
    u.zustand({ admins: { admin: A }, knoten: {}, users: {}, dbs: { "studium-autopilot": { security: null, meilenstein: false } } });
    let e = u.lauf("verbinden");
    assert.equal(e.status, 0, e.fehler + e.aus);
    const k = u.konfig();
    assert.deepEqual([k.benutzer, k.passwort, k.geraet_benutzer], ["admin", A, "geraet"], "Administrator bleibt, Gerätezugang dazu");
    let z = u.zustand();
    assert.equal(z.users.geraet.pw, k.geraet_passwort);
    assert.deepEqual(z.users.geraet.roles, []);
    assert.deepEqual(z.dbs["studium-autopilot"].security, { admins: { names: [], roles: [] }, members: { names: ["geraet"], roles: [] } });
    assert.deepEqual([z.knoten, fs.existsSync(ENDE)], [{}, false], "kein Fenster nach etwas in der Datenbank");
    // neue Datenbank (einschalten, erneuern --neue-passphrase legen ERSTES an): das nächste Verbinden öffnet das Fenster einmal
    fs.writeFileSync(ERSTES, "");
    e = u.lauf("verbinden");
    assert.equal(e.status, 0, e.fehler);
    assert.equal(u.zustand().knoten.geraet, k.geraet_passwort, "Aufbau-Fenster: derselbe Name und dasselbe Passwort als Administrator");
    assert.ok(e.aufrufe.some((a) => /^systemd-run --quiet --unit=studium-livesync-aufbau --on-active=3600s \/bin\/bash .*livesync\.sh aufbau-ende$/.test(a)), e.aufrufe.join("\n"));
    assert.ok(Number(fs.readFileSync(ENDE, "utf8")) > Date.now() / 1000 + 3500);
    assert.ok(!fs.existsSync(ERSTES), "nur einmal");
    assert.match(e.aus, /Initialise or overwrite the remote/);
    // der Link trägt den Gerätezugang
    const { link, code } = JSON.parse(spawnSync(process.execPath, [u.p("paket", "livesync.mjs"), "link", u.p("etc", "livesync.json")], { encoding: "utf8" }).stdout);
    assert.ok(link && code);
    // noch offen, aber der Zeitgeber ist weg (Neustart): aufbau_pruefen stellt einen für den Rest; das Fenster bleibt
    fs.writeFileSync(ENDE, String(Math.floor(Date.now() / 1000) + 600));
    e = u.lauf("aufbau_pruefen");
    assert.equal(u.zustand().knoten.geraet, k.geraet_passwort, "noch offen");
    assert.ok(e.aufrufe.some((a) => /^systemd-run .*--on-active=(59\d|600)s /.test(a)), e.aufrufe.join("\n"));
    // abgelaufen: das nächste Prüfen (Start, täglicher Lauf, Update, Verbinden) schließt es
    fs.writeFileSync(ENDE, String(Math.floor(Date.now() / 1000) - 10));
    e = u.lauf("verbinden");
    assert.equal(e.status, 0, e.fehler);
    assert.equal(u.zustand().knoten.geraet, undefined, "nur noch Mitglied");
    assert.ok(!fs.existsSync(ENDE));
    assert.ok(!e.aufrufe.some((a) => a.startsWith("systemd-run")));
    // Administrator ohne Datei (Abbruch zwischen Öffnen und Datei): Prüfen schließt auch das
    z = u.zustand();
    z.knoten.geraet = k.geraet_passwort;
    u.zustand(z);
    assert.equal(u.lauf("aufbau_pruefen").status, 0);
    assert.deepEqual(u.zustand().knoten, {});
    // CouchDB läuft gar nicht (gleich nach dem Start): still und ohne Warten, das Ende bleibt vermerkt
    fs.writeFileSync(ENDE, "1");
    e = u.lauf({ COUCH_LAEUFT: "0" }, "aufbau_pruefen");
    assert.deepEqual([e.status, fs.existsSync(ENDE), e.aufrufe.some((a) => a.startsWith("sleep"))], [0, true, false], e.fehler);
    // CouchDB antwortet nicht: abgelaufenes Fenster bleibt vermerkt, der nächste Versuch schließt es
    fs.writeFileSync(ENDE, "1");
    const zuvor = u.zustand();
    fs.writeFileSync(u.p("couch.json"), "{");
    e = u.lauf("aufbau_pruefen");
    assert.notEqual(e.status, 0);
    assert.ok(fs.existsSync(ENDE));
    u.zustand(zuvor);
    // von Hand öffnen (aufbauen) und schließen (Zeitgeber: aufbau_ende)
    u.lauf("aufbau_oeffnen");
    assert.equal(u.zustand().knoten.geraet, u.konfig().geraet_passwort);
    e = u.lauf("aufbau_ende");
    assert.deepEqual([e.status, u.zustand().knoten], [0, {}]);
    // Passwort des Gerätezugangs wird bei jedem Verbinden auf das aus livesync.json gesetzt (wiederholbar, mit _rev)
    z = u.zustand();
    z.users.geraet.pw = G;
    u.zustand(z);
    assert.equal(u.lauf("verbinden").status, 0);
    assert.equal(u.zustand().users.geraet.pw, u.konfig().geraet_passwort);
  } finally { u.weg(); }
});

test("livesync-erneuern: neues Administrator-Passwort und neuer Gerätezugang, alte gelten nicht mehr; Schlüssel der Verschlüsselung nur mit --neue-passphrase, dann Datenbank leer", () => {
  const u = aufbau(), A = "Ad" + "min1pw";
  try {
    u.konfig({ adresse: "https://obsidian.203-0-113-5." + SSLIP, benutzer: "admin", ["passwort"]: A, datenbank: "studium-autopilot", e2ee: "e2e" });
    u.zustand({ admins: { admin: A }, knoten: { geraet: "x" }, users: {}, dbs: { "studium-autopilot": { security: null, meilenstein: true } } });
    fs.writeFileSync(u.p("etc", "livesync-aufbau"), "1");
    let e = u.lauf("erneuern");
    assert.equal(e.status, 0, e.fehler + e.aus);
    const k = u.konfig();
    assert.ok(k.passwort !== A && /^[A-Za-z0-9]{32}$/.test(k.passwort));
    assert.deepEqual([k.e2ee, k.geraet_benutzer], ["e2e", "geraet"]);
    let z = u.zustand();
    assert.deepEqual(z.admins, { admin: k.passwort }, "nur noch das neue Passwort des Administrators");
    assert.deepEqual(z.knoten, {}, "offenes Aufbau-Fenster zu");
    assert.equal(z.users.geraet.pw, k.geraet_passwort);
    assert.ok(z.dbs["studium-autopilot"].meilenstein, "Tresor auf dem Server bleibt");
    assert.ok(!fs.existsSync(u.p("etc", "livesync-aufbau")));
    assert.ok(!fs.existsSync(u.p("etc", "livesync-erstes-geraet")), "ohne neue Passphrase kein Aufbau");
    assert.match(fs.readFileSync(u.p("etc", "couch.ini"), "utf8"), new RegExp(`\\[admins\\]\\nadmin = ${k.passwort}\\n`));
    assert.ok(e.aufrufe.some((a) => a.startsWith("runuser -u couchdb sh ") && a.endsWith("/etc/couch.ini")), "die Einstellungen schreibt couchdb, nicht root");
    assert.ok(!e.aufrufe.some((a) => a.startsWith("chown") && a.includes("couch.ini")), "root setzt keinen Besitzer in Ordnern von couchdb");
    assert.ok(!fs.existsSync(u.p("etc", "couch.ini.studium-neu")));
    assert.match(e.aus, /Join this device/);
    e = u.lauf("erneuern", "--neue-passphrase");
    assert.equal(e.status, 0, e.fehler);
    const k2 = u.konfig();
    assert.ok(k2.e2ee !== "e2e" && k2.passwort !== k.passwort && k2.geraet_passwort !== k.geraet_passwort);
    z = u.zustand();
    assert.deepEqual(z.dbs["studium-autopilot"], { security: { admins: { names: [], roles: [] }, members: { names: ["geraet"], roles: [] } }, meilenstein: false }, "neu angelegt, leer");
    assert.ok(fs.existsSync(u.p("etc", "livesync-erstes-geraet")), "das nächste Verbinden öffnet das Fenster für den Aufbau");
    assert.match(e.aus, /Initialise or overwrite the remote/);
    assert.equal(u.lauf("erneuern", "--alles").status, 2);
  } finally { u.weg(); }
});

// Link auf eine Datei bzw. einen Ordner (unter Windows für Ordner eine Junction; Links auf Dateien brauchen dort Adminrechte)
function verknuepfen(ziel, pfad) {
  try { fs.symlinkSync(ziel, pfad, fs.statSync(ziel).isDirectory() ? "junction" : "file"); return true; } catch (e) { return false; }
}

test("LiveSync: Dateien von CouchDB liest und schreibt root nur als couchdb (runuser, mit Zeitgrenze); ein Link an der Stelle wird ersetzt, nicht verfolgt", (t) => {
  const f = fn("couch_datei");
  assert.match(fn("couch_lesen"), /timeout 30 runuser -u couchdb -- head -c 1048576 -- "\$1"/);
  assert.match(f, /timeout 60 runuser -u couchdb -- sh -c 'umask 027 && n="\$1\.studium-neu" && rm -f -- "\$n" && cat >"\$n" && chmod 0640 -- "\$n" && mv -fT -- "\$n" "\$1"' - "\$1"/);
  assert.match(fn("ini_schreiben"), /ini_text \| couch_datei "\$INI"/);
  assert.match(fn("absichern"), /inhalt=\$\(couch_lesen "\$args"\)/);
  assert.match(fn("einschalten"), /couch_lesen "\$INI"/);
  // root liest und schreibt dort nie selbst: kein >, >>, sed -i, cat, stat oder chown auf Dateien von CouchDB
  for (const z of SKRIPT.split("\n")) assert.ok(!/(>>?|sed -i[^|]*|cat|stat[^|]*|chown[^|]*) *"?\$(INI|args|COUCH_ETC)/.test(z), z);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "couch-datei-"));
  try {
    for (const d of ["bin", "etc", "fremd"]) fs.mkdirSync(path.join(tmp, d), { recursive: true });
    fs.writeFileSync(path.join(tmp, "bin", "runuser"), RUNUSER, { mode: 0o755 });
    fs.writeFileSync(path.join(tmp, "fremd", "geheim"), "root\n");
    const lauf = (ziel) => spawnSync("bash", ["-c", ["set -euo pipefail", fn("fehler"), fn("couch_lesen"), f, 'echo neu | couch_datei "$1"', 'couch_lesen "$1"'].join("\n"),
      "-", ziel.replace(/\\/g, "/")], { encoding: "utf8",
      env: Object.assign({}, process.env, { AUFRUFE: path.join(tmp, "aufrufe"), PATH: path.join(tmp, "bin") + path.delimiter + process.env.PATH }) });
    // gewöhnliche Datei: ersetzt, Rechte 0640, nichts liegt daneben
    let r = lauf(path.join(tmp, "etc", "vm.args"));
    assert.deepEqual([r.status, r.stdout], [0, "neu\n"], r.stderr);
    if (process.platform !== "win32") assert.equal(fs.statSync(path.join(tmp, "etc", "vm.args")).mode & 0o777, 0o640);
    assert.deepEqual(fs.readdirSync(path.join(tmp, "etc")), ["vm.args"]);
    assert.match(fs.readFileSync(path.join(tmp, "aufrufe"), "utf8"), /^runuser -u couchdb sh .*vm\.args\nrunuser -u couchdb head .*vm\.args\n$/);
    // ein Link an der Stelle der Datei (hier auf eine Datei „von root“): ersetzt, dem Ziel geschieht nichts
    if (!verknuepfen(path.join(tmp, "fremd", "geheim"), path.join(tmp, "etc", "link.ini"))) {
      t.skip("Links auf Dateien gehen hier nicht (Windows ohne Adminrechte); GitHub Actions prüft das unter Linux");
      return;
    }
    r = lauf(path.join(tmp, "etc", "link.ini"));
    assert.equal(r.status, 0, r.stderr);
    assert.equal(fs.readFileSync(path.join(tmp, "fremd", "geheim"), "utf8"), "root\n", "dem Ziel des Links geschah nichts");
    assert.ok(!fs.lstatSync(path.join(tmp, "etc", "link.ini")).isSymbolicLink(), "der Link wurde ersetzt");
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test("LiveSync absichern: Stand der Erlang-Cookie in debconf (auch config.dat-old), kommt ein neuer nach vm.args, dort wird genau der Eintrag leer, CouchDB startet einmal neu; epmd und Verteilung nur auf 127.0.0.1", () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "absichern-"));
  const p = (...x) => path.join(tmp, ...x);
  const vorwaerts = (x) => x.replace(/\\/g, "/");
  try {
    for (const d of ["bin", "etc", "debconf"]) fs.mkdirSync(p(d));
    fs.writeFileSync(p("bin", "runuser"), RUNUSER, { mode: 0o755 });
    for (const b of ["systemctl", "debconf-set-selections", "chown"]) fs.writeFileSync(p("bin", b), `#!/usr/bin/env bash\necho "${b} $* $(cat 2>/dev/null)" >> "$AUFRUFE"\n`, { mode: 0o755 });
    fs.writeFileSync(p("bin", "dpkg"), "#!/usr/bin/env bash\nexit 0\n", { mode: 0o755 });
    const ALT = "Alt" + "Keks42";
    fs.writeFileSync(p("etc", "vm.args"), `-name couchdb@127.0.0.1\n-setcookie '${ALT}'\n-kernel inet_dist_use_interface {127,0,0,1}\n`);
    fs.writeFileSync(p("etc", "default"), "ERL_EPMD_ADDRESS=127.0.0.1\n");
    const db = (wert) => `Name: couchdb/bindaddress\nTemplate: couchdb/bindaddress\nValue: 127.0.0.1\nOwners: couchdb\n\nName: couchdb/cookie\nTemplate: couchdb/cookie\nValue: ${wert}\nOwners: couchdb\nFlags: seen\n\nName: couchdb/mode\nValue: standalone\n\n`;
    fs.writeFileSync(p("debconf", "config.dat"), db(ALT));
    fs.writeFileSync(p("debconf", "config.dat-old"), db(ALT));
    const ablauf = ["set -euo pipefail", ...["fehler", "couch_lesen", "couch_datei", "cookie_in_debconf", "cookie_aus_debconf", "absichern"].map(fn),
      'T=$1; COUCH_ETC=$T/etc COUCH_STANDARD=$T/etc/default DEBCONF=$T/debconf', "absichern"].join("\n");
    fs.writeFileSync(p("ablauf.sh"), ablauf);
    const lauf = () => {
      fs.rmSync(p("aufrufe"), { force: true });
      const r = spawnSync("bash", [vorwaerts(p("ablauf.sh")), vorwaerts(tmp)], { encoding: "utf8",
        env: Object.assign({}, process.env, { AUFRUFE: p("aufrufe"), PATH: p("bin") + path.delimiter + process.env.PATH }) });
      return { status: r.status, aus: r.stdout + r.stderr, aufrufe: fs.existsSync(p("aufrufe")) ? fs.readFileSync(p("aufrufe"), "utf8").trim().split("\n") : [] };
    };
    let e = lauf();
    assert.equal(e.status, 0, e.aus);
    const args = fs.readFileSync(p("etc", "vm.args"), "utf8");
    const keks = /^-setcookie '([A-Za-z0-9]+)'$/m.exec(args);
    assert.ok(keks && keks[1] !== ALT && keks[1].length >= 32, args);
    assert.equal(args.match(/^-setcookie/gm).length, 1);
    assert.match(args, /^-name couchdb@127\.0\.0\.1$/m, "der Rest bleibt");
    for (const f of ["config.dat", "config.dat-old"]) assert.equal(fs.readFileSync(p("debconf", f), "utf8"), db(""), f + ": nur der Eintrag leer");
    assert.ok(e.aufrufe.some((a) => a.startsWith("debconf-set-selections") && a.includes("couchdb couchdb/cookie string")));
    assert.deepEqual(e.aufrufe.filter((a) => a.startsWith("systemctl")).map((a) => a.trim()), ["systemctl try-restart couchdb"], "einmal neu");
    // zweiter Lauf: Cookie nicht mehr in debconf, nichts zu tun, kein Neustart
    e = lauf();
    assert.deepEqual([e.status, e.aufrufe.filter((a) => !a.startsWith("runuser -u couchdb head "))], [0, []], e.aus);
    assert.ok(e.aufrufe.some((a) => a.startsWith("runuser -u couchdb head ")), "vm.args liest couchdb, nicht root");
    assert.equal(fs.readFileSync(p("etc", "vm.args"), "utf8"), args);
    // nach einem Update von CouchDB steht er wieder dort: neuer Cookie
    fs.writeFileSync(p("debconf", "config.dat"), db(keks[1]));
    e = lauf();
    assert.notEqual(/^-setcookie '([A-Za-z0-9]+)'$/m.exec(fs.readFileSync(p("etc", "vm.args"), "utf8"))[1], keks[1]);
    assert.equal(fs.readFileSync(p("debconf", "config.dat"), "utf8"), db(""));
    // fehlt die Verteilung auf 127.0.0.1 bzw. ERL_EPMD_ADDRESS: ergänzt, Neustart
    fs.writeFileSync(p("etc", "vm.args"), "-setcookie 'x1'\n");
    fs.writeFileSync(p("etc", "default"), "");
    e = lauf();
    assert.match(fs.readFileSync(p("etc", "vm.args"), "utf8"), /^-kernel inet_dist_use_interface \{127,0,0,1\}$/m);
    assert.match(fs.readFileSync(p("etc", "default"), "utf8"), /^ERL_EPMD_ADDRESS=127\.0\.0\.1$/m);
    assert.ok(e.aufrufe.some((a) => a.startsWith("systemctl try-restart couchdb")));
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
  // täglich (studium-server, livesync_pruefen) nach der Datei von root, nicht nach der Marke von studium; auch das Aufbau-Fenster
  assert.match(fn("einschalten"), /\n {2}absichern\n/);
  const ss = fs.readFileSync(path.join(SERVER, "studium-server"), "utf8");
  const pruefen = /^livesync_pruefen\(\) \{\n[\s\S]*?\n\}\n/m.exec(ss)[0];
  assert.match(pruefen, /\[ -f "\$LS_KONFIG" \]/);
  assert.ok(!pruefen.includes("livesync-an"));
  assert.match(pruefen, /bash "\$PAKET\/livesync\.sh" absichern/);
  assert.match(pruefen, /bash "\$PAKET\/livesync\.sh" aufbau-pruefen/);
  assert.match(SKRIPT, /^ {2}absichern\) absichern ;;$/m);
  assert.match(SKRIPT, /^ {2}aufbau-pruefen\) aufbau_pruefen ;;$/m);
  assert.match(ss, /^ {2}livesync-erneuern\) shift; root_noetig livesync-erneuern; bash "\$PAKET\/livesync\.sh" erneuern "\$@" ;;$/m);
  // beim Start schließt eine Einheit ein abgelaufenes Fenster; die Dienste sehen debconf nicht
  const inst = fs.readFileSync(path.join(SERVER, "installieren.sh"), "utf8");
  assert.match(inst, /einheit studium-server-livesync-aufbau\.service <<'UNIT'\n[\s\S]*?ExecStart=-\/bin\/bash \/opt\/studium-server\/aktuell\/livesync\.sh aufbau-pruefen\n[\s\S]*?SocketBindDeny=any\n[\s\S]*?WantedBy=multi-user\.target\nUNIT/,
    "beim Start still, wenn CouchDB nicht läuft (-); öffnet keinen Port");
  assert.match(inst, /studium-server-livesync-aufbau\.timer \\\n {2}studium-server-livesync-aufbau\.service\n/);
  // noch einmal 15 Minuten nach dem Start (CouchDB kam später), derselbe Dienst
  assert.match(inst, /einheit studium-server-livesync-aufbau\.timer <<'UNIT'\n[\s\S]*?\[Timer\]\nOnBootSec=15min\n\n\[Install\]\nWantedBy=timers\.target\nUNIT/);
  const dienst = /einheit studium-server-dienst\.service <<'UNIT'\n([\s\S]*?)\nUNIT/.exec(inst)[1];
  assert.ok(dienst.split("\n").some((z) => z.startsWith("InaccessiblePaths=") && z.split(" ").includes("-/var/cache/debconf")));
});
