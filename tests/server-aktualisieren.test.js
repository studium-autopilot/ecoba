// Tests für „studium-server aktualisieren“ (server/studium-server): neue Version nur mit Prüfsumme, Signatur und passender Version,
// Ergebnis für den Status, Zurückrollen und gestaffelte Verteilung. Eigene Datei, damit sie neben den übrigen Tests läuft (viele
// Läufe von bash und ssh-keygen). curl, apt-get, dpkg-query, stat und (wo es fehlt) jq sind Attrappen.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { pathToFileURL } = require("node:url");
const assert = require("node:assert/strict");

const SERVER = path.join(__dirname, "..", "server");
const da = fs.existsSync(path.join(SERVER, "studium-server"));
const test = (name, a, b) => require("node:test")(name, { ...(b ? a : {}), skip: (!da && "server/ fehlt in diesem Baum") || (b && a.skip) }, b || a);
const laden = (datei) => import(pathToFileURL(path.join(SERVER, datei)).href);

// jq nur für die Filter von „aktualisieren“, wo es fehlt (Windows); mit echtem jq (Linux, GitHub Actions) gilt das echte
const JQ_ATTRAPPE = `#!/usr/bin/env node
const fs = require("node:fs");
const [filter, datei] = process.argv.slice(3);
const d = JSON.parse(fs.readFileSync(datei || 0, "utf8"));
const asset = (name) => (d.assets || []).find((a) => a.name === name) || {};
const paket = asset("studium-server.tar.gz"), signatur = asset("studium-server.tar.gz.sig");
const f = { '.tag_name // "" | ltrimstr("v")': () => String(d.tag_name || "").replace(/^v/, ""), ".ip": () => d.ip, ".ip // empty": () => d.ip,
  ".published_at // empty": () => d.published_at,
  '.assets[] | select(.name == "studium-server.tar.gz") | .browser_download_url': () => paket.browser_download_url,
  '.assets[] | select(.name == "studium-server.tar.gz") | .digest // empty': () => paket.digest,
  '.assets[] | select(.name == "studium-server.tar.gz.sig") | .browser_download_url': () => signatur.browser_download_url }[filter];
if (!f) { console.error("jq-Attrappe kennt den Filter nicht: " + filter); process.exit(3); }
const w = f();
if (w != null && w !== "") process.stdout.write(w + "\\n");
`;

const OHNE_BASH = spawnSync("bash", ["-c", "true"]).status !== 0 && "kein bash";
const OHNE_SSH_KEYGEN = OHNE_BASH || (spawnSync("bash", ["-c", "command -v ssh-keygen"]).status !== 0 && "kein ssh-keygen");

test("Neue Version holen: nur mit Prüfsumme und gültiger Signatur (Sperrliste wächst nur), nur aus Releases des Repos; Ergebnis für den Status (Zeit, ok, Ziel, Grund, letzter Erfolg) auch nach Abbruch; Zurückrollen (auch ein abgebrochenes nachgeholt), Mindestversion; Download-Ordner geht weg, Erfolg endet mit 0", { skip: OHNE_SSH_KEYGEN }, async () => {
  const skript = fs.readFileSync(path.join(SERVER, "studium-server"), "utf8");
  const fn = (name) => new RegExp(`^${name}\\(\\) \\{\\n[\\s\\S]*?\\n\\}\\n`, "m").exec(skript)[0];
  const zeile = (name) => new RegExp(`^${name}=[^\\n]+$`, "m").exec(skript)[0];
  // Gründe: dieselben Wörter wie im Status (sonst hieße ein neuer Grund dort „unbekannt“)
  const { AKTUALISIERUNG_GRUENDE } = await laden("dienst.mjs");
  const gruende = [...new Set([...skript.matchAll(/(?:AKT_GRUND=|ohne_erfolg )([a-z-]+)/g)].map((m) => m[1]))].sort();
  assert.deepEqual(gruende, [...AKTUALISIERUNG_GRUENDE].sort());
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "neue-version-"));
  const p = (...t) => path.join(tmp, ...t);
  const vorwaerts = (x) => x.replace(/\\/g, "/");
  try {
    for (const d of ["bin", "daten", "paket", "release/server", "opt", "opt/0.6.8"]) fs.mkdirSync(p(d), { recursive: true });
    // Paket des Releases 0.7.0 (der Installer schreibt nur auf) und GitHub: curl antwortet aus info.json (GITHUB=0: gar nicht)
    const bauen = (version) => {
      fs.writeFileSync(p("release", "server", "VERSION"), version + "\n");
      fs.writeFileSync(p("release", "server", "installieren.sh"), "echo \"installieren $*\" >> \"$AUFRUFE\"\nexit \"${INSTALLIEREN:-0}\"\n");
      if (!fs.existsSync(p("release", "server", "revoked_keys"))) fs.copyFileSync(path.join(SERVER, "revoked_keys"), p("release", "server", "revoked_keys"));
      assert.equal(spawnSync("bash", ["-c", "tar -czf paket.tar.gz server"], { cwd: p("release") }).status, 0);
      return fs.readFileSync(p("release", "paket.tar.gz"));
    };
    const echt = bauen("0.7.0");
    const sha = (b) => require("node:crypto").createHash("sha256").update(b).digest("hex");
    const summe = sha(echt);
    // Signatur wie beim Release: Wegwerf-Schlüssel; allowed_signers und revoked_keys liegen im LAUFENDEN Paket (nie aus dem Download)
    const keygen = (...a) => {
      const r = spawnSync("bash", ["-c", 'ssh-keygen "$@"', "-", ...a.map(vorwaerts)], { encoding: "utf8" });
      assert.equal(r.status, 0, r.stderr);
    };
    for (const n of ["signierer", "fremd"]) keygen("-q", "-t", "ed25519", "-N", "", "-C", n, "-f", p(n));
    const signierer = fs.readFileSync(p("signierer.pub"), "utf8").split(" ").slice(0, 2).join(" ");
    fs.writeFileSync(p("paket", "allowed_signers"), `# Kommentar\nrelease@studium-autopilot namespaces="studium-server" ${signierer}\n`);
    fs.copyFileSync(path.join(SERVER, "revoked_keys"), p("paket", "revoked_keys"));
    const signieren = (schluessel, namensraum = "studium-server") => {
      fs.rmSync(p("release", "paket.tar.gz.sig"), { force: true });
      keygen("-Y", "sign", "-f", p(schluessel), "-n", namensraum, p("release", "paket.tar.gz"));
    };
    signieren("signierer");
    const VOR_TAGEN = new Date(Date.now() - 5 * 86400e3).toISOString();
    const DORT = "https://github.com/studium-autopilot/ecoba/releases/download/v0.7.0/";
    const info = (digest, mitSignatur = true, weiter = {}, wo = DORT) => fs.writeFileSync(p("release", "info.json"), JSON.stringify({ tag_name: "v0.7.0",
      published_at: VOR_TAGEN, ...weiter,
      assets: [{ name: "studium-server.tar.gz", browser_download_url: wo + "studium-server.tar.gz", digest },
        ...(mitSignatur ? [{ name: "studium-server.tar.gz.sig", browser_download_url: wo + "studium-server.tar.gz.sig" }] : [])] }));
    fs.writeFileSync(p("bin", "curl"), "#!/usr/bin/env bash\n[ \"${GITHUB:-1}\" = 1 ] || exit 6\necho \"curl $*\" >> \"$CURL_AUFRUFE\"\nziel=\"\"\n" +
      "while [ $# -gt 0 ]; do [ \"$1\" = -o ] && ziel=$2; shift; done\n" +
      "if [ -n \"$ziel\" ]; then echo \"herunterladen $ziel\" >> \"$AUFRUFE\"; cp \"$RELEASE/${ziel##*/}\" \"$ziel\"; else cat \"$RELEASE/info.json\"; fi\n", { mode: 0o755 });
    // apt-get wie das echte: ein Paket, das kein Archiv kennt (ARCHIV), lässt den ganzen Aufruf scheitern („Unable to locate
    // package“); dpkg-query nennt die installierten (INSTALLIERT). Ohne LiveSync gibt es CouchDB und sein Archiv nicht.
    fs.writeFileSync(p("bin", "apt-get"), "#!/usr/bin/env bash\necho \"apt-get $*\" >> \"$AUFRUFE\"\nnur=0\nfor a in \"$@\"; do\n" +
      "  if [ \"$nur\" = 1 ] && [[ \"$a\" != -* ]] && [[ \" ${ARCHIV:-caddy nodejs couchdb} \" != *\" $a \"* ]]; then echo \"E: Unable to locate package $a\" >&2; exit 100; fi\n" +
      "  [ \"$a\" != --only-upgrade ] || nur=1\ndone\nexit \"${APT:-0}\"\n", { mode: 0o755 });
    fs.writeFileSync(p("bin", "dpkg-query"), "#!/usr/bin/env bash\n[[ \" ${INSTALLIERT-caddy nodejs couchdb} \" == *\" ${!#} \"* ]] && printf installed || printf not-installed\n",
      { mode: 0o755 });
    // Besitzer der Zusage für Testpakete: unter Windows gehört keine Datei root; STAT_UID spielt den Besitzer
    fs.writeFileSync(p("bin", "stat"), "#!/usr/bin/env bash\necho \"${STAT_UID:-0}\"\n", { mode: 0o755 });
    // ln: nur aufschreiben (aktuell ist hier ein Ordner, kein Link)
    fs.writeFileSync(p("bin", "ln"), "#!/usr/bin/env bash\necho \"ln $*\" >> \"$AUFRUFE\"\n", { mode: 0o755 });
    // flock: belegt (FLOCK_BELEGT) scheitert -n, das Warten danach gelingt
    fs.writeFileSync(p("bin", "flock"), "#!/usr/bin/env bash\n[ \"$1\" != -n ] || [ -z \"${FLOCK_BELEGT:-}\" ] || exit 1\n", { mode: 0o755 });
    if (spawnSync("bash", ["-c", "command -v jq"]).status !== 0) fs.writeFileSync(p("bin", "jq"), JQ_ATTRAPPE, { mode: 0o755 });
    fs.writeFileSync(p("dienst.json"), JSON.stringify({ ip: "203.0.113.5" }));
    fs.writeFileSync(p("paket", "VERSION"), "0.6.9\n");
    const installiert = new Date("2026-10-20T08:00:00Z");
    fs.utimesSync(p("paket", "VERSION"), installiert, installiert);
    const FUNKTIONEN = ["version_neuer", "aktualisierung_merken", "ohne_erfolg", "aktualisieren_ende", "pakete_aktualisieren", "signatur_gueltig",
      "sperrliste_ergaenzen", "unter_mindestversion", "testpakete_erlaubt", "staffel_bis", "zurueck_gesperrt", "zurueckrollen_nachholen", "installer",
      "livesync_pruefen", "aktualisieren"];
    const ablauf = ["set -euo pipefail", ...FUNKTIONEN.map(fn), zeile("CURL"), zeile("ASSETS"), zeile("STAFFEL_SEK"), zeile("ZURUECK_SPERRE"),
      "root_noetig() { :; }", "claude_aktualisieren() { :; }", "veraltete_neu_starten() { :; }", 'als_studium() { "$@"; }', 'als_web() { "$@"; }',
      'AKT_SPERRE=$4/sperre JETZT_MARKE=$4/jetzt-marke JETZT_ZULETZT=$4/jetzt-zuletzt',
      'PAKET=$1 DATEN=$2 KONFIG=$3 OPT=$4 RELEASES=https://api.github.com/repos/studium-autopilot/ecoba/releases/latest AKT_ZIEL="" AKT_GRUND="" AKT_TMP=""',
      'AKT_OHNE_ERFOLG=0 AKT_WARTEN="" PAKETE_FEHLER=0 TESTPAKETE=$OPT/testpakete STAFFEL=$OPT/staffel STAFFEL_SEIT=$OPT/.staffel-seit ZURUECK_MARKE=$OPT/.zurueckgerollt',
      'PAKET_ORDNER=$OPT ZURUECK_OFFEN=$OPT/.zurueckrollen-offen MINDEST=$OPT/mindestversion SPERRLISTE=$OPT/revoked_keys LS_KONFIG=$OPT/livesync.json',
      'shift 4', 'aktualisieren "$@"'].join("\n");
    // als Datei statt mit bash -c: Unter Windows verliert eine so lange Befehlszeile sonst ihr Ende
    fs.writeFileSync(p("ablauf.sh"), ablauf);
    const lauf = (env, ...args) => {
      for (const d of ["aufrufe", "curl"]) fs.rmSync(p(d), { force: true });
      const r = spawnSync("bash", [vorwaerts(p("ablauf.sh")), ...[p("paket"), p("daten"), p("dienst.json"), p("opt")].map(vorwaerts), ...args], { encoding: "utf8",
        env: Object.assign({}, process.env, { AUFRUFE: p("aufrufe"), CURL_AUFRUFE: p("curl"), RELEASE: p("release"), PATH: p("bin") + path.delimiter + process.env.PATH }, env) });
      const aufrufe = fs.existsSync(p("aufrufe")) ? fs.readFileSync(p("aufrufe"), "utf8").trim().split("\n") : [];
      const download = aufrufe.filter((z) => z.startsWith("herunterladen ")).map((z) => z.slice(14).replace(/\/paket\.tar\.gz$/, ""))[0];
      if (download) assert.notEqual(spawnSync("bash", ["-c", '[ -e "$1" ]', "-", download]).status, 0, "Download-Ordner weg");
      assert.deepEqual(fs.readdirSync(p("daten")), ["aktualisierung.json"], "nichts Halbes liegen geblieben");
      const akt = JSON.parse(fs.readFileSync(p("daten", "aktualisierung.json"), "utf8"));
      assert.match(akt.zeit, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
      const apt = aufrufe.filter((z) => z.startsWith("apt-get "));
      const curl = fs.existsSync(p("curl")) ? fs.readFileSync(p("curl"), "utf8").trim().split("\n") : [];
      return { status: r.status, fehler: r.stderr, aus: r.stdout, akt: { ...akt, zeit: "" }, zeit: akt.zeit, apt, curl,
        aufrufe: aufrufe.filter((z) => !z.startsWith("herunterladen ") && !z.startsWith("apt-get ")),
        geladen: aufrufe.filter((z) => z.startsWith("herunterladen ")).length };
    };
    info("sha256:" + summe);
    // Pakete jeden Tag zuerst, auch ohne neue Version und ohne GitHub; nie während eines anderen apt (Sperre, bis 10 Minuten)
    const PAKETE = ["apt-get -q -o DPkg::Lock::Timeout=300 update",
      "apt-get install -y -q -o DPkg::Lock::Timeout=300 -o Dpkg::Options::=--force-confold --only-upgrade caddy nodejs couchdb"];
    // GitHub nicht erreichbar, noch kein Ergebnis da: letzter Erfolg ist die Installation des laufenden Pakets
    let e = lauf({ GITHUB: "0" });
    assert.equal(e.status, 1);
    assert.deepEqual(e.akt, { zeit: "", ok: false, ziel: "", installiert: "0.6.9", grund: "github", erfolg: "2026-10-20T08:00:00Z" });
    assert.deepEqual(e.apt, PAKETE, "Pakete auch ohne GitHub");
    // neue Version: Paket und Signatur geladen, installiert und Pakete nachgezogen, Exit 0, Erfolg jetzt; curl mit Zeitgrenze
    e = lauf({});
    assert.equal(e.status, 0, e.fehler);
    assert.deepEqual(e.akt, { zeit: "", ok: true, ziel: "0.7.0", installiert: "0.6.9", grund: "", erfolg: e.zeit });
    assert.deepEqual([e.geladen, e.apt, e.aufrufe], [2, PAKETE, ["installieren --ip 203.0.113.5"]]);
    assert.equal(e.curl.length, 3);
    assert.match(e.curl[0], /^curl -fsSL --connect-timeout 30 --max-time 300 --retry 3 --retry-max-time 600 https:\/\/api\.github\.com\//);
    for (const c of e.curl.slice(1)) {
      assert.match(c, /^curl -fsSL --connect-timeout 30 --max-time 300 --retry 3 --retry-max-time 600 -o \S+ -- https:\/\/github\.com\/studium-autopilot\/ecoba\/releases\/download\//);
    }
    let erfolg = e.zeit;
    // falsche Prüfsumme: nichts installiert, der letzte Erfolg bleibt stehen
    info("sha256:" + "0".repeat(64));
    e = lauf({});
    assert.deepEqual([e.status, e.akt, e.aufrufe], [1, { zeit: "", ok: false, ziel: "0.7.0", installiert: "0.6.9", grund: "pruefsumme", erfolg }, []]);
    // keine Signatur im Release (etwa ein Release, das jemand mit dem Konto oder einem Token angelegt hat): nichts geladen
    info("sha256:" + summe, false);
    e = lauf({});
    assert.deepEqual([e.status, e.akt, e.geladen, e.aufrufe], [1, { zeit: "", ok: false, ziel: "0.7.0", installiert: "0.6.9", grund: "signatur-fehlt", erfolg }, 0, []]);
    info("sha256:" + summe);
    // Signatur eines anderen Schlüssels, eines anderen Namensraums (auch des Namensraums für Tests ohne Zusage), eines gesperrten
    // Schlüssels, oder ein anderes Paket mit passender Prüfsumme (die nennt GitHub selbst): nichts installiert
    const ungueltig = (was, env = {}) => {
      e = lauf(env);
      assert.deepEqual([e.status, e.akt, e.aufrufe], [1, { zeit: "", ok: false, ziel: "0.7.0", installiert: "0.6.9", grund: "signatur", erfolg }, []], was);
    };
    signieren("fremd");
    ungueltig("fremder Schlüssel");
    signieren("signierer", "git");
    ungueltig("anderer Namensraum");
    signieren("signierer", "studium-server-test");
    ungueltig("Namensraum für Tests ohne Zusage");
    // Zusage für Testpakete: nur eine echte Datei von root, die nur root ändern darf
    fs.writeFileSync(p("opt", "testpakete"), "");
    ungueltig("Zusage gehört nicht root", { STAT_UID: "1000" });
    e = lauf({});
    assert.deepEqual([e.status, e.akt.ok, e.aufrufe], [0, true, ["installieren --ip 203.0.113.5"]], e.fehler);
    assert.match(e.aus, /Zusage für Testpakete/);
    erfolg = e.zeit;
    signieren("signierer");
    fs.rmSync(p("opt", "testpakete"));
    const gesperrt = fs.readFileSync(p("paket", "revoked_keys"));
    fs.appendFileSync(p("paket", "revoked_keys"), fs.readFileSync(p("signierer.pub")));
    ungueltig("Schlüssel in revoked_keys des laufenden Pakets");
    fs.writeFileSync(p("paket", "revoked_keys"), gesperrt);
    // eine Zeile ohne lesbaren Schlüssel (im Paket oder schon in der Liste) blockiert nichts: Sie fällt weg, die übrigen bleiben
    // Auch Optionen wie in authorized_keys vor einem echten Schlüssel: ssh-keygen -l liest die Zeile, ssh-keygen -Y verify -r nicht
    const fremdPub = fs.readFileSync(p("fremd.pub"), "utf8").trim();
    const kaputt = ["ssh-ed25519 AAAAkaputt", "restrict " + fremdPub, "cert-authority " + fremdPub, 'from="*.example.org" ' + fremdPub].join("\n");
    fs.appendFileSync(p("paket", "revoked_keys"), kaputt + "\n");
    fs.appendFileSync(p("opt", "revoked_keys"), "nur Text\n");
    ungueltig("gesperrt bleibt gesperrt, auch neben einer kaputten Zeile");
    assert.ok(!/kaputt|nur Text|^(restrict|cert-authority|from=)/m.test(fs.readFileSync(p("opt", "revoked_keys"), "utf8")), "kaputte Zeilen übergangen");
    fs.writeFileSync(p("paket", "revoked_keys"), Buffer.concat([gesperrt, Buffer.from(kaputt + "\n")]));
    // die Sperre steht jetzt in der Liste von root und bleibt, auch wenn das laufende Paket sie nicht mehr nennt (Zurückrollen)
    assert.ok(fs.readFileSync(p("opt", "revoked_keys"), "utf8").includes(fs.readFileSync(p("signierer.pub"), "utf8").split(" ")[1]));
    ungueltig("Sperre bleibt in der Liste von root");
    fs.rmSync(p("opt", "revoked_keys"));
    // nur noch die kaputte Zeile im Paket: die Prüfung geht wieder (ssh-keygen -Y verify -r bräche sonst mit 255 ab)
    e = lauf({});
    assert.deepEqual([e.status, e.akt.ok], [0, true], e.fehler);
    erfolg = e.zeit;
    fs.writeFileSync(p("paket", "revoked_keys"), gesperrt);
    const getauscht = Buffer.concat([echt, Buffer.from("fremd")]);
    fs.writeFileSync(p("release", "paket.tar.gz"), getauscht);
    info("sha256:" + sha(getauscht));
    ungueltig("anderes Paket mit passender Prüfsumme");
    fs.writeFileSync(p("release", "paket.tar.gz"), echt);
    info("sha256:" + summe);
    // ohne allowed_signers im laufenden Paket, oder ohne jede Liste gesperrter Schlüssel, lässt sich nichts prüfen
    for (const datei of ["allowed_signers", "revoked_keys"]) {
      const inhalt = fs.readFileSync(p("paket", datei));
      fs.rmSync(p("paket", datei));
      fs.rmSync(p("opt", "revoked_keys"), { force: true });
      ungueltig(datei + " fehlt im laufenden Paket");
      fs.writeFileSync(p("paket", datei), inhalt);
    }
    // Sperren des neuen, geprüften Pakets gelten ab da, auch wenn seine Installation scheitert
    fs.appendFileSync(p("release", "server", "revoked_keys"), fs.readFileSync(p("fremd.pub")));
    const mitSperre = bauen("0.7.0");
    fs.writeFileSync(p("release", "paket.tar.gz"), mitSperre);
    signieren("signierer");
    info("sha256:" + sha(mitSperre));
    e = lauf({ INSTALLIEREN: "1" });
    assert.equal(e.akt.grund, "installieren");
    assert.ok(fs.readFileSync(p("opt", "revoked_keys"), "utf8").includes(fs.readFileSync(p("fremd.pub"), "utf8").split(" ")[1]), "Sperre aus dem neuen Paket");
    fs.copyFileSync(path.join(SERVER, "revoked_keys"), p("release", "server", "revoked_keys"));
    fs.writeFileSync(p("release", "paket.tar.gz"), echt);
    signieren("signierer");
    info("sha256:" + summe);
    // nur Assets eines Releases dieses Repos: sonst nichts geladen
    info("sha256:" + summe, true, {}, "https://beispiel.example/");
    e = lauf({});
    assert.deepEqual([e.status, e.akt.grund, e.geladen, e.aufrufe], [1, "paket", 0, []]);
    info("sha256:" + summe);
    // Version im signierten Paket ≠ Tag des Releases (ein altes signiertes Paket unter neuem Release): nichts installiert
    info("sha256:" + summe, true, { tag_name: "v0.7.1" });
    e = lauf({});
    assert.deepEqual([e.status, e.akt, e.aufrufe], [1, { zeit: "", ok: false, ziel: "0.7.1", installiert: "0.6.9", grund: "version", erfolg }, []]);
    // kein Paket im neuesten Release, Release älter als das laufende Paket: Exit 0, aber nicht ok (der Server bleibt zurück),
    // nichts geladen, der letzte Erfolg bleibt
    fs.writeFileSync(p("release", "info.json"), JSON.stringify({ tag_name: "v0.7.1", published_at: VOR_TAGEN, assets: [] }));
    e = lauf({});
    assert.deepEqual([e.status, e.akt, e.geladen, e.aufrufe], [0, { zeit: "", ok: false, ziel: "0.7.1", installiert: "0.6.9", grund: "kein-paket", erfolg }, 0, []]);
    info("sha256:" + summe, true, { tag_name: "v0.6.8" });
    e = lauf({});
    assert.deepEqual([e.status, e.akt, e.geladen, e.aufrufe], [0, { zeit: "", ok: false, ziel: "0.6.8", installiert: "0.6.9", grund: "aelter", erfolg }, 0, []]);
    info("sha256:" + summe);
    // Installer bricht ab
    e = lauf({ INSTALLIEREN: "1" });
    assert.deepEqual([e.status, e.akt, e.aufrufe], [1, { zeit: "", ok: false, ziel: "0.7.0", installiert: "0.6.9", grund: "installieren", erfolg }, ["installieren --ip 203.0.113.5"]]);
    // Installer verweigert das Zurückrollen unter die Mindestversion (Exit 11): nicht ok, Grund mindestversion
    e = lauf({ INSTALLIEREN: "11" });
    assert.deepEqual([e.status, e.akt.ok, e.akt.grund], [1, false, "mindestversion"]);
    // Installer rollt zurück (Exit 10): gemerkt; am selben Tag kein neuer Versuch (nichts geladen), mit --jetzt schon; nach einem
    // Erfolg ist die Marke weg
    e = lauf({ INSTALLIEREN: "10" });
    assert.deepEqual([e.status, e.akt.ok, e.akt.grund, e.aufrufe], [1, false, "zurueckgerollt", ["installieren --ip 203.0.113.5"]]);
    assert.match(fs.readFileSync(p("opt", ".zurueckgerollt"), "utf8"), /^0\.7\.0 \d+\n$/);
    e = lauf({});
    assert.deepEqual([e.status, e.akt.ok, e.akt.grund, e.geladen, e.aufrufe], [0, false, "zurueckgerollt", 0, []]);
    fs.writeFileSync(p("opt", ".zurueckgerollt"), `0.7.0 ${Math.floor(Date.now() / 1000) - 21 * 3600}\n`);
    e = lauf({ INSTALLIEREN: "10" });
    assert.deepEqual([e.status, e.akt.grund, e.aufrufe], [1, "zurueckgerollt", ["installieren --ip 203.0.113.5"]], "nach 20 Stunden wieder");
    e = lauf({}, "--jetzt");
    assert.deepEqual([e.status, e.akt.ok, e.aufrufe], [0, true, ["installieren --ip 203.0.113.5"]], e.fehler);
    assert.ok(!fs.existsSync(p("opt", ".zurueckgerollt")));
    assert.equal(lauf({}, "--sofort").status, 2, "unbekannte Angabe");
    // Ein Zurückrollen stand aus (der Lauf brach ab, etwa an der Zeitgrenze; der Installer stellte nur aktuell zurück): zuerst
    // nachgeholt, sonst nichts; danach ist die Marke weg. Maßgeblich ist die Marke von root (Ziel, gescheiterte Version), auch wenn
    // aktuell auf ein fertig installiertes Paket zeigt (.installiert), solange das nicht die gescheiterte Version ist
    fs.writeFileSync(p("opt", "0.6.8", "VERSION"), "0.6.8\n");
    fs.writeFileSync(p("opt", "0.6.8", ".installiert"), "");
    fs.writeFileSync(p("opt", "0.6.8", "installieren.sh"), "echo \"zurueck $*\" >> \"$AUFRUFE\"\nexit \"${ZURUECK:-0}\"\n");
    const offen = p("opt", ".zurueckrollen-offen");
    fs.writeFileSync(p("paket", ".installiert"), "");
    // die gescheiterte Version läuft doch, fertig installiert (Abbruch nach .installiert, vor dem Wegräumen der Marke): Marke weg,
    // Lauf wie sonst
    fs.writeFileSync(offen, vorwaerts(p("opt", "0.6.8")) + "\n0.6.9\n");
    e = lauf({}, "--jetzt");
    assert.deepEqual([e.status, e.aufrufe], [0, ["installieren --ip 203.0.113.5"]], e.fehler);
    assert.ok(!fs.existsSync(offen));
    erfolg = e.zeit;
    fs.writeFileSync(offen, vorwaerts(p("opt", "0.6.8")) + "\n0.7.0\n");
    // abgebrochen auch dieses Mal (Signal): Marke bleibt
    e = lauf({ ZURUECK: "143" });
    assert.deepEqual([e.status, e.akt.grund, fs.existsSync(offen)], [1, "installieren", true], e.fehler);
    fs.rmSync(p("opt", ".zurueckgerollt"), { force: true });
    e = lauf({});
    assert.deepEqual([e.status, e.akt.ok, e.akt.grund, e.geladen, e.apt, e.aufrufe], [1, false, "zurueckgerollt", 0, [],
      [`ln -sfn ${vorwaerts(p("opt", "0.6.8"))} ${vorwaerts(p("paket"))}`, "zurueck --ip 203.0.113.5"]], e.fehler);
    assert.ok(!fs.existsSync(offen));
    assert.match(fs.readFileSync(p("opt", ".zurueckgerollt"), "utf8"), /^0\.7\.0 \d+\n$/);
    fs.rmSync(p("opt", ".zurueckgerollt"));
    fs.rmSync(p("paket", ".installiert"));
    // … aber nie unter die Mindestversion und nie außerhalb der Ordner der Versionen (aktuell, ein Ordner, dessen VERSION nicht
    // seinen Namen nennt, ein fremder Ordner): Marke weg, Lauf wie sonst
    fs.mkdirSync(p("opt", "aktuell"));
    fs.mkdirSync(p("opt", "0.6.7"));
    for (const d of ["aktuell", "0.6.7"]) {
      fs.writeFileSync(p("opt", d, "VERSION"), "0.6.8\n");
      fs.writeFileSync(p("opt", d, "installieren.sh"), "echo \"zurueck $*\" >> \"$AUFRUFE\"\n");
    }
    fs.writeFileSync(p("opt", "mindestversion"), "0.6.8\n");
    for (const [ziel, was] of [[p("opt", "aktuell"), "aktuell"], [p("opt", "0.6.7"), "VERSION passt nicht zum Ordner"], [p("daten"), "fremder Ordner"]]) {
      fs.writeFileSync(offen, vorwaerts(ziel) + "\n0.6.9\n");
      e = lauf({}, "--jetzt");
      assert.deepEqual([e.status, e.aufrufe], [0, ["installieren --ip 203.0.113.5"]], was + ": " + e.fehler);
      assert.ok(!fs.existsSync(offen), was);
    }
    fs.rmSync(p("opt", "aktuell"), { recursive: true });
    fs.rmSync(p("opt", "0.6.7"), { recursive: true });
    fs.writeFileSync(p("opt", "mindestversion"), "0.6.9\n");
    for (const [ziel, was] of [[p("opt", "0.6.8"), "Mindestversion"]]) {
      fs.writeFileSync(offen, vorwaerts(ziel) + "\n0.6.9\n");
      e = lauf({}, "--jetzt");
      assert.deepEqual([e.status, e.aufrufe], [0, ["installieren --ip 203.0.113.5"]], was + ": " + e.fehler);
      assert.ok(!fs.existsSync(offen), was);
    }
    fs.rmSync(p("opt", "mindestversion"));
    // gestaffelt: Wartezeit aus dem Zufallswert des Servers (hier 10 Stunden) ab der Veröffentlichung; bis dahin ok, nichts geladen,
    // warten_bis im Status; --jetzt installiert sofort; ein neueres Release setzt die Uhr nicht zurück
    fs.writeFileSync(p("opt", "staffel"), String(10 * 3600 + (48 * 3600 + 1) * 7) + "\n");
    const jetzt = Date.now();
    const vor = (stunden) => new Date(jetzt - stunden * 3600e3).toISOString().replace(/\.\d+Z$/, "Z");
    info("sha256:" + summe, true, { published_at: vor(2) });
    e = lauf({});
    assert.deepEqual([e.status, e.akt.ok, e.geladen, e.aufrufe], [0, true, 0, []], e.fehler);
    assert.equal(Date.parse(e.akt.warten_bis), Date.parse(vor(2)) + 10 * 3600e3);
    assert.match(e.aus, /ab \d{4}-.*gestaffelt/);
    info("sha256:" + summe, true, { published_at: vor(9.5) });
    e = lauf({});
    assert.deepEqual([e.geladen, e.aufrufe], [0, []], "älteres Release: 30 Minuten noch");
    info("sha256:" + summe, true, { published_at: vor(1) });
    e = lauf({});
    assert.deepEqual([e.geladen, Date.parse(e.akt.warten_bis)], [0, Date.parse(vor(9.5)) + 10 * 3600e3], "gezählt ab dem ältesten seit dem Zurückliegen");
    e = lauf({}, "--jetzt");
    assert.deepEqual([e.status, e.akt.ok, e.akt.warten_bis, e.aufrufe], [0, true, undefined, ["installieren --ip 203.0.113.5"]]);
    assert.ok(!fs.existsSync(p("opt", ".staffel-seit")), "nach der Installation zählt die Uhr neu");
    info("sha256:" + summe, true, { published_at: vor(11) });
    e = lauf({});
    assert.deepEqual([e.status, e.aufrufe], [0, ["installieren --ip 203.0.113.5"]], "Wartezeit vorbei");
    fs.rmSync(p("opt", "staffel"));
    info("sha256:" + summe);
    // noch ohne Adresse (der Server hat sich selbst vorbereitet, die Einrichtung in der Cloud Shell kam noch nicht): nur vorbereiten
    fs.writeFileSync(p("dienst.json"), JSON.stringify({ zugang: "z" }));
    e = lauf({});
    assert.deepEqual([e.status, e.aufrufe[0]], [0, "installieren --vorbereiten"], e.fehler);
    fs.writeFileSync(p("dienst.json"), JSON.stringify({ ip: "203.0.113.5" }));
    // Pakete scheitern (Archiv nicht erreichbar): das neue Paket kommt trotzdem, der Lauf zählt aber als gescheitert
    const bisher = JSON.parse(fs.readFileSync(p("daten", "aktualisierung.json"), "utf8")).erfolg;
    e = lauf({ APT: "100" });
    assert.deepEqual([e.status, e.akt, e.apt, e.aufrufe], [1, { zeit: "", ok: false, ziel: "0.7.0", installiert: "0.6.9", grund: "pakete", erfolg: bisher }, [PAKETE[0]],
      ["installieren --ip 203.0.113.5"]]);
    // gleiche Version, aber ihre Installation kam nicht bis zum Ende (keine Marke .installiert): noch einmal installieren
    fs.writeFileSync(p("paket", "VERSION"), "0.7.0\n");
    e = lauf({});
    assert.deepEqual([e.status, e.akt.ok, e.akt.installiert, e.aufrufe], [0, true, "0.7.0", ["installieren --ip 203.0.113.5"]], e.fehler);
    e = lauf({ INSTALLIEREN: "1" });
    assert.deepEqual([e.status, e.akt.grund, e.aufrufe], [1, "installieren", ["installieren --ip 203.0.113.5"]], "scheitert wieder: gescheitert, nicht „Schon aktuell“");
    // schon aktuell und fertig installiert: Pakete trotzdem, ohne Fehler, nichts geladen oder installiert
    fs.writeFileSync(p("paket", ".installiert"), "");
    e = lauf({});
    assert.deepEqual([e.status, e.akt.ok, e.akt.ziel, e.akt.erfolg === e.zeit, e.apt, e.geladen, e.aufrufe], [0, true, "0.7.0", true, PAKETE, 0, []]);
    // schon aktuell, aber die Pakete scheitern: gescheitert mit Grund pakete, der letzte Erfolg bleibt
    const zuletzt = e.zeit;
    e = lauf({ APT: "100" });
    assert.deepEqual([e.status, e.akt], [1, { zeit: "", ok: false, ziel: "0.7.0", installiert: "0.7.0", grund: "pakete", erfolg: zuletzt }]);
    // ohne LiveSync: weder CouchDB noch sein Archiv. Nur Caddy und Node.js, ohne Fehler (bis 0.7.6 scheiterte apt hier jeden Tag an
    // „Unable to locate package couchdb“, und Caddy und Node.js blieben stehen)
    e = lauf({ INSTALLIERT: "caddy nodejs", ARCHIV: "caddy nodejs" });
    assert.deepEqual([e.status, e.akt.ok, e.akt.grund, e.apt], [0, true, "", [PAKETE[0], PAKETE[1].replace(/ couchdb$/, "")]], e.fehler);
    e = lauf({ INSTALLIERT: "", ARCHIV: "caddy nodejs" });
    assert.deepEqual([e.status, e.akt.ok, e.apt], [0, true, []], "nichts davon installiert: kein apt");
    // Knopf in Obsidian (studium-server-jetzt.service): Marke weg, dann wie --jetzt, wartet auf ein laufendes; höchstens alle 5 Minuten
    fs.writeFileSync(p("opt", "jetzt-marke"), "wird nie gelesen");
    e = lauf({ FLOCK_BELEGT: "1" }, "--aus-obsidian");
    assert.deepEqual([e.status, fs.existsSync(p("opt", "jetzt-marke")), /Ein anderes Update läuft gerade/.test(e.aus), e.apt], [0, false, true, PAKETE], e.fehler);
    fs.writeFileSync(p("opt", "jetzt-marke"), "");
    e = lauf({}, "--aus-obsidian");
    assert.deepEqual([e.status, fs.existsSync(p("opt", "jetzt-marke")), /Gerade erst aus Obsidian/.test(e.aus), e.apt], [0, false, true, []], e.fehler);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});

test("studium-server status: nur direkt auf 127.0.0.1 (ohne Caddy, ohne Schlüssel); kaputte Dateien des Web-Dienstes oder ein stummer Dienst enden nie mit einem Fehler", { skip: OHNE_BASH }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "status-"));
  const p = (...t) => path.join(tmp, ...t);
  const vorwaerts = (x) => x.replace(/\\/g, "/");
  try {
    fs.mkdirSync(p("bin"));
    // curl: schreibt auf; mit STATUS antwortet es, sonst scheitert es. sudo (als_web cat takt.json): kaputtes JSON
    fs.writeFileSync(p("bin", "curl"), '#!/usr/bin/env bash\necho "curl $*" >> "$AUFRUFE"\n[ -n "${STATUS:-}" ] || exit 7\necho "$STATUS"\n', { mode: 0o755 });
    fs.writeFileSync(p("bin", "sudo"), '#!/usr/bin/env bash\necho "{kaputt"\n', { mode: 0o755 });
    fs.writeFileSync(p("bin", "systemctl"), '#!/usr/bin/env bash\necho active\n', { mode: 0o755 });
    if (spawnSync("bash", ["-c", "command -v jq"]).status !== 0) fs.writeFileSync(p("bin", "jq"), '#!/usr/bin/env node\nprocess.exit(5);\n', { mode: 0o755 });
    const lauf = (env, ...args) => {
      fs.rmSync(p("aufrufe"), { force: true });
      const r = spawnSync("bash", [vorwaerts(path.join(SERVER, "studium-server")), ...args], { encoding: "utf8",
        env: Object.assign({}, process.env, { AUFRUFE: p("aufrufe"), PATH: p("bin") + path.delimiter + process.env.PATH }, env) });
      return { status: r.status, aus: r.stdout + r.stderr, curl: fs.existsSync(p("aufrufe")) ? fs.readFileSync(p("aufrufe"), "utf8").trim().split("\n") : [] };
    };
    let e = lauf({}, "status");
    assert.equal(e.status, 0, e.aus);
    assert.match(e.aus, /keine Antwort auf \/v1\/status/);
    assert.match(e.aus, /Takt aus Obsidian: unlesbar/);
    for (const c of e.curl) assert.match(c, /^curl -fsS --max-time 10 http:\/\/127\.0\.0\.1:8743\/v1\/status$/, "direkt, ohne Kopf und ohne Schlüssel");
    e = lauf({ STATUS: '{"schema":1,"version":"0.7.0"}' }, "status", "--json");
    assert.deepEqual([e.status, e.aus.trim()], [0, '{"schema":1,"version":"0.7.0"}']);
  } finally { fs.rmSync(tmp, { recursive: true, force: true }); }
});
